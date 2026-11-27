import {
  computed,
  effect,
  inject,
  Injectable,
  signal,
  untracked,
} from '@angular/core';

import type {
  EffectRef,
  OnDestroy,
  Signal,
} from '@angular/core';

import {
  defer,
  forkJoin,
  Subscription,
} from 'rxjs';

import { SessionService } from '../../../core/auth/session.service';
import { ApiError } from '../../../core/models/api-error.model';
import type { AuthSession } from '../../../core/models/auth-session.model';

import type {
  BayDto,
  JobSummaryDto,
  MechanicRosterDto,
} from '../../bookings/models/booking-support.model';

import type {
  AdaptiveQueueBayColumn,
  AdaptiveQueueCapacitySummary,
  AdaptiveQueueDuplicateBayAssignment,
  AdaptiveQueueDuplicateMechanicAssignment,
  AdaptiveQueueErrorResolution,
  AdaptiveQueueInactiveBayAssignment,
  AdaptiveQueueJob,
  AdaptiveQueueJobLimitAdvisory,
  AdaptiveQueueSnapshot,
  AdaptiveQueueUnknownBayAssignment,
  AdaptiveQueueWarning,
} from '../models/adaptive-queue.model';

import { resolveAdaptiveQueueError } from '../utils/adaptive-queue-error.mapper';
import { buildAdaptiveQueueSnapshot } from '../utils/adaptive-queue.mapper';

import { AdaptiveQueueApiService } from './adaptive-queue-api.service';

/**
 * A successful HTTP sync older than this is reported as
 * potentially stale (the backend recalculates every 2 minutes
 * while jobs are active, plus a margin).
 */
export const ADAPTIVE_QUEUE_STALE_AFTER_MS = 150_000;

/**
 * How often the local age of the last sync (and the local session
 * validity) is re-evaluated. This timer never performs HTTP.
 */
export const ADAPTIVE_QUEUE_STALE_CHECK_INTERVAL_MS = 15_000;

/** What the Adaptive Queue page should currently render. */
export type AdaptiveQueueViewState =
  | 'idle'
  | 'loading'
  | 'error'
  | 'empty'
  | 'ready';

export type AdaptiveQueueMechanicsStatus =
  | 'idle'
  | 'loading'
  | 'loaded'
  | 'failed';

export type AdaptiveQueueStaleReason =
  | 'refresh-failed'
  | 'signalled'
  | 'aged';

export type AdaptiveQueueAuthFailure =
  | 'unauthorized'
  | 'forbidden';

interface BoardData {
  readonly jobs: readonly JobSummaryDto[];
  readonly bays: readonly BayDto[];
}

const NO_JOBS: readonly AdaptiveQueueJob[] = [];

/**
 * Fixed, safe resolution used when the local session ends, expires
 * or is unavailable. It carries no server text.
 */
const SESSION_ENDED: AdaptiveQueueErrorResolution =
  resolveAdaptiveQueueError(
    new ApiError(401, 'UNAUTHORIZED', 'Session ended'),
    'read',
  );

/**
 * Page-scoped state for the Adaptive Queue board.
 *
 * Provide it on the page component (`providers: [...]`) so its
 * lifetime, in-flight requests and timer end with the page. It is
 * intentionally not `providedIn: 'root'`.
 *
 * Data handling:
 * - Jobs and bays are required. They are published together as one
 *   client-side snapshot only after BOTH requests succeed. Two HTTP
 *   requests are not a database-atomic snapshot.
 * - Mechanics are optional and independent of the board.
 * - A failed refresh (other than an access denial) never replaces or
 *   empties the last valid board.
 * - Only one required request set is in flight. A refresh requested
 *   meanwhile is coalesced into a single follow-up request.
 * - Queue positions and ETA values come from the backend untouched.
 *
 * Security handling (the service never reads or stores tokens and
 * uses no browser storage):
 * - The board is bound to the exact session instance. Logout, session
 *   expiry/invalidation, or any session replacement (a different user
 *   or a new login by the same user) cancels all requests and clears
 *   every piece of queue data, timestamp and error. The local timer
 *   starts when the first protected request starts, so expiry is
 *   noticed even before a board has loaded.
 * - Realtime invalidations (`invalidate()`) are signals only. They
 *   never change the board; an older in-flight completion cannot
 *   clear a newer invalidation.
 * - HTTP 401 or 403 on a required request clears the board.
 * - HTTP 401 on the optional roster is a session invalidation and
 *   clears everything. HTTP 403 on the roster is a resource-specific
 *   denial: only the roster is cleared and the board is kept.
 * - `refresh()` is refused while the session is not valid.
 * - Late responses from cancelled requests are discarded.
 */
@Injectable()
export class AdaptiveQueueStateService implements OnDestroy {
  private readonly api = inject(AdaptiveQueueApiService);
  private readonly sessionService = inject(SessionService);

  private readonly board = signal<BoardData | null>(null);
  private readonly loading = signal(false);
  private readonly mechanicRoster =
    signal<readonly MechanicRosterDto[] | null>(null);
  private readonly mechanicsLoadStatus =
    signal<AdaptiveQueueMechanicsStatus>('idle');
  private readonly mechanicsFailure =
    signal<AdaptiveQueueErrorResolution | null>(null);
  private readonly initialFailure =
    signal<AdaptiveQueueErrorResolution | null>(null);
  private readonly refreshFailure =
    signal<AdaptiveQueueErrorResolution | null>(null);
  private readonly syncedAt = signal<Date | null>(null);
  private readonly signalledStale = signal(false);
  private readonly clock = signal(Date.now());

  private requiredSubscription: Subscription | null = null;
  private mechanicsSubscription: Subscription | null = null;
  private requiredGeneration = 0;
  private mechanicsGeneration = 0;
  private refreshQueued = false;
  private destroyed = false;
  private tickHandle: ReturnType<typeof setInterval> | null = null;

  /**
   * The exact session instance that the current data and requests
   * belong to. Binding to the instance (not only the user id) makes
   * any replacement, including a new login by the same user, drop
   * the old board.
   */
  private boundSession: AuthSession | null = null;

  /**
   * Counts realtime invalidations. A request remembers the value it
   * started with, so an older completion cannot clear a newer
   * invalidation.
   */
  private invalidationVersion = 0;

  private readonly sessionWatcher: EffectRef = effect(() => {
    // Track the session signal only; reconcile without tracking.
    this.sessionService.session();
    untracked(() => {
      this.enforceSession();
    });
  });

  /** Latest valid jobs; null until the first successful sync. */
  readonly jobs: Signal<readonly JobSummaryDto[] | null> = computed(
    () => this.board()?.jobs ?? null,
  );

  /** Latest valid bays; null until the first successful sync. */
  readonly bays: Signal<readonly BayDto[] | null> = computed(
    () => this.board()?.bays ?? null,
  );

  /** Optional roster; keeps the last good value if a reload fails. */
  readonly mechanics: Signal<readonly MechanicRosterDto[] | null> =
    this.mechanicRoster.asReadonly();

  readonly mechanicsStatus: Signal<AdaptiveQueueMechanicsStatus> =
    this.mechanicsLoadStatus.asReadonly();

  readonly mechanicsError: Signal<AdaptiveQueueErrorResolution | null> =
    this.mechanicsFailure.asReadonly();

  /** Mapper output for the current board; null before the first sync. */
  readonly snapshot: Signal<AdaptiveQueueSnapshot | null> = computed(
    () => {
      const board = this.board();

      return board
        ? buildAdaptiveQueueSnapshot(board.jobs, board.bays)
        : null;
    },
  );

  readonly hasBoard: Signal<boolean> = computed(
    () => this.board() !== null,
  );

  /** Empty until the first sync; check `viewState` before rendering. */
  readonly waitingJobs: Signal<readonly AdaptiveQueueJob[]> =
    computed(() => this.snapshot()?.waitingJobs ?? NO_JOBS);

  readonly activePhaseJobs: Signal<readonly AdaptiveQueueJob[]> =
    computed(() => this.snapshot()?.activePhaseJobs ?? NO_JOBS);

  readonly unrecognizedStatusJobs: Signal<readonly AdaptiveQueueJob[]> =
    computed(
      () => this.snapshot()?.unrecognizedStatusJobs ?? NO_JOBS,
    );

  readonly bayColumns: Signal<readonly AdaptiveQueueBayColumn[]> =
    computed(() => this.snapshot()?.bayColumns ?? []);

  readonly unassignedJobs: Signal<readonly AdaptiveQueueJob[]> =
    computed(() => this.snapshot()?.unassignedJobs ?? NO_JOBS);

  readonly inactiveBayAssignments:
    Signal<readonly AdaptiveQueueInactiveBayAssignment[]> = computed(
      () => this.snapshot()?.inactiveBayAssignments ?? [],
    );

  readonly unknownBayAssignments:
    Signal<readonly AdaptiveQueueUnknownBayAssignment[]> = computed(
      () => this.snapshot()?.unknownBayAssignments ?? [],
    );

  readonly duplicateBayAssignments:
    Signal<readonly AdaptiveQueueDuplicateBayAssignment[]> = computed(
      () => this.snapshot()?.duplicateBayAssignments ?? [],
    );

  readonly duplicateMechanicAssignments:
    Signal<readonly AdaptiveQueueDuplicateMechanicAssignment[]> =
      computed(
        () => this.snapshot()?.duplicateMechanicAssignments ?? [],
      );

  /** Null before the first sync. */
  readonly capacity: Signal<AdaptiveQueueCapacitySummary | null> =
    computed(() => this.snapshot()?.capacity ?? null);

  /** Null before the first sync. */
  readonly jobLimit: Signal<AdaptiveQueueJobLimitAdvisory | null> =
    computed(() => this.snapshot()?.jobLimit ?? null);

  /** Frontend advisories only; never backend-enforced conflicts. */
  readonly warnings: Signal<readonly AdaptiveQueueWarning[]> =
    computed(() => this.snapshot()?.warnings ?? []);

  /** Jobs and bays are being requested, regardless of board state. */
  readonly isLoading: Signal<boolean> = this.loading.asReadonly();

  /** Loading with no board yet: show the loading state. */
  readonly isInitialLoading: Signal<boolean> = computed(
    () => this.loading() && this.board() === null,
  );

  /** Loading while a valid board is shown: keep the board visible. */
  readonly isRefreshing: Signal<boolean> = computed(
    () => this.loading() && this.board() !== null,
  );

  /** A successful sync produced a board with no active jobs. */
  readonly isEmpty: Signal<boolean> = computed(
    () => this.capacity()?.boardJobCount === 0,
  );

  /**
   * Required request failed, access was denied, or the session
   * ended, and there is no board to show.
   */
  readonly initialLoadError:
    Signal<AdaptiveQueueErrorResolution | null> =
      this.initialFailure.asReadonly();

  /** Required request failed while the last valid board is kept. */
  readonly refreshError:
    Signal<AdaptiveQueueErrorResolution | null> =
      this.refreshFailure.asReadonly();

  /** Time of the last fully successful, current HTTP sync. */
  readonly lastSyncedAt: Signal<Date | null> =
    this.syncedAt.asReadonly();

  readonly staleReason: Signal<AdaptiveQueueStaleReason | null> =
    computed(() => {
      if (this.board() === null) {
        return null;
      }

      if (this.refreshFailure() !== null) {
        return 'refresh-failed';
      }

      if (this.signalledStale()) {
        return 'signalled';
      }

      const synced = this.syncedAt();

      if (
        synced !== null
        && this.clock() - synced.getTime()
          > ADAPTIVE_QUEUE_STALE_AFTER_MS
      ) {
        return 'aged';
      }

      return null;
    });

  /** The visible board may no longer match the backend. */
  readonly isStale: Signal<boolean> = computed(
    () => this.staleReason() !== null,
  );

  /**
   * Authentication (401, ended session) or permission (403) failure
   * of a required resource. A resource-specific roster 403 is
   * reported only in `mechanicsError`.
   */
  readonly authFailure: Signal<AdaptiveQueueAuthFailure | null> =
    computed(() => {
      const kind =
        (this.initialFailure() ?? this.refreshFailure())?.kind;

      return kind === 'unauthorized' || kind === 'forbidden'
        ? kind
        : null;
    });

  readonly viewState: Signal<AdaptiveQueueViewState> = computed(() => {
    if (this.board() === null) {
      if (this.loading()) {
        return 'loading';
      }

      return this.initialFailure() !== null ? 'error' : 'idle';
    }

    return this.isEmpty() ? 'empty' : 'ready';
  });

  /**
   * Loads (or reloads) the board from the authoritative HTTP
   * endpoints. Used for the initial load, manual refresh, retry,
   * and later realtime invalidation or reconnect reconciliation.
   *
   * Refused (and all queue data cleared) while the session is not
   * valid. If a required request is already in flight, one
   * follow-up request is queued instead of a concurrent request.
   */
  refresh(): void {
    if (this.destroyed) {
      return;
    }

    const session = this.currentSession();

    if (session === null) {
      this.revokeAccess(SESSION_ENDED);
      return;
    }

    if (this.boundSession !== null && this.boundSession !== session) {
      this.clearAccessScopedData();
    }

    if (this.loading()) {
      this.refreshQueued = true;
      return;
    }

    this.startRequired(session);
  }

  /**
   * Records a realtime invalidation: the board may be out of date
   * and must be reloaded over HTTP. The signal carries no data and
   * never changes the board itself. It only flags the board as
   * possibly stale (cleared by a request that started after it) and
   * protects that flag from older in-flight completions.
   *
   * It does not request anything. Reconciliation is requested
   * through `refresh()`, which keeps a single request in flight and
   * queues at most one follow-up.
   */
  invalidate(): void {
    if (this.destroyed || this.boundSession === null) {
      return;
    }

    if (!this.enforceSession()) {
      return;
    }

    this.invalidationVersion += 1;

    if (this.board() !== null) {
      this.signalledStale.set(true);
    }
  }

  /**
   * Flags the visible board as possibly out of date (for example
   * when the realtime connection drops). Cleared only by the next
   * successful refresh. Ignored when there is no board.
   */
  markPotentiallyStale(): void {
    if (!this.destroyed && this.board() !== null) {
      this.signalledStale.set(true);
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.sessionWatcher.destroy();
    this.clearAccessScopedData();
  }

  /** The current session instance, or null when it is not valid. */
  private currentSession(): AuthSession | null {
    return this.sessionService.isAuthenticated()
      ? this.sessionService.session()
      : null;
  }

  /**
   * Verifies that the data and requests still belong to the exact,
   * still valid session. Returns false (after clearing) when they
   * do not.
   */
  private enforceSession(): boolean {
    if (this.destroyed || this.boundSession === null) {
      return true;
    }

    const current = this.currentSession();

    if (current === this.boundSession) {
      return true;
    }

    if (current === null) {
      this.revokeAccess(SESSION_ENDED);
    } else {
      this.clearAccessScopedData();
    }

    return false;
  }

  /**
   * Clears everything and records why access ended. Used for ended
   * sessions and HTTP 401/403 on required resources.
   */
  private revokeAccess(resolution: AdaptiveQueueErrorResolution): void {
    this.clearAccessScopedData();
    this.initialFailure.set(resolution);
  }

  /**
   * Cancels every request and removes all queue data, timestamps,
   * queued refreshes, errors and the age timer. Bumping the
   * generations makes any late callback a no-op.
   */
  private clearAccessScopedData(): void {
    this.requiredGeneration += 1;
    this.mechanicsGeneration += 1;
    this.refreshQueued = false;

    this.requiredSubscription?.unsubscribe();
    this.requiredSubscription = null;
    this.mechanicsSubscription?.unsubscribe();
    this.mechanicsSubscription = null;

    if (this.tickHandle !== null) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }

    this.loading.set(false);
    this.board.set(null);
    this.mechanicRoster.set(null);
    this.mechanicsLoadStatus.set('idle');
    this.mechanicsFailure.set(null);
    this.initialFailure.set(null);
    this.refreshFailure.set(null);
    this.syncedAt.set(null);
    this.signalledStale.set(false);
    this.boundSession = null;
  }

  private startRequired(session: AuthSession): void {
    const generation = ++this.requiredGeneration;
    const requestVersion = this.invalidationVersion;

    this.boundSession = session;
    this.refreshQueued = false;
    this.loading.set(true);

    // From here protected requests exist, so the local timer must
    // also notice session expiry before any board is loaded.
    this.ensureTicker();

    if (this.board() === null) {
      this.initialFailure.set(null);
    }

    this.startMechanics();

    let received: BoardData | null = null;

    const subscription = new Subscription();
    this.requiredSubscription = subscription;

    subscription.add(
      forkJoin({
        jobs: defer(() => this.api.getActiveJobs()),
        bays: defer(() => this.api.getBays()),
      }).subscribe({
        next: value => {
          received = value;
        },
        error: (error: unknown) =>
          this.finishRequired(generation, null, error, requestVersion),
        complete: () =>
          this.finishRequired(
            generation,
            received,
            undefined,
            requestVersion,
          ),
      }),
    );
  }

  private finishRequired(
    generation: number,
    received: BoardData | null,
    error: unknown,
    requestVersion: number,
  ): void {
    if (this.destroyed || generation !== this.requiredGeneration) {
      return;
    }

    if (!this.enforceSession()) {
      return;
    }

    this.requiredSubscription = null;
    this.loading.set(false);

    if (received !== null) {
      this.publish(received, requestVersion);
    } else {
      const resolution = resolveAdaptiveQueueError(
        error ?? new Error('No response received'),
        'read',
      );

      if (
        resolution.kind === 'unauthorized'
        || resolution.kind === 'forbidden'
      ) {
        this.revokeAccess(resolution);
        return;
      }

      this.fail(resolution);
    }

    if (this.refreshQueued) {
      const session = this.currentSession();

      if (session !== null) {
        this.startRequired(session);
        return;
      }
    }

    this.refreshQueued = false;
  }

  private publish(received: BoardData, requestVersion: number): void {
    const now = new Date(Date.now());

    this.board.set({ jobs: received.jobs, bays: received.bays });
    this.initialFailure.set(null);
    this.refreshFailure.set(null);
    // Only a request that started after the latest invalidation may
    // clear it. An older completion keeps the board flagged.
    this.signalledStale.set(this.invalidationVersion !== requestVersion);
    this.syncedAt.set(now);
    this.clock.set(now.getTime());
    this.ensureTicker();
  }

  private fail(resolution: AdaptiveQueueErrorResolution): void {
    if (this.board() !== null) {
      this.refreshFailure.set(resolution);
    } else {
      this.initialFailure.set(resolution);
    }
  }

  private startMechanics(): void {
    this.mechanicsSubscription?.unsubscribe();

    const generation = ++this.mechanicsGeneration;

    this.mechanicsLoadStatus.set('loading');

    let received: readonly MechanicRosterDto[] | null = null;

    const subscription = new Subscription();
    this.mechanicsSubscription = subscription;

    subscription.add(
      defer(() => this.api.getMechanics()).subscribe({
        next: value => {
          received = value;
        },
        error: (error: unknown) =>
          this.finishMechanics(generation, null, error),
        complete: () =>
          this.finishMechanics(generation, received, undefined),
      }),
    );
  }

  private finishMechanics(
    generation: number,
    received: readonly MechanicRosterDto[] | null,
    error: unknown,
  ): void {
    if (this.destroyed || generation !== this.mechanicsGeneration) {
      return;
    }

    if (!this.enforceSession()) {
      return;
    }

    this.mechanicsSubscription = null;

    if (received !== null) {
      this.mechanicRoster.set(received);
      this.mechanicsFailure.set(null);
      this.mechanicsLoadStatus.set('loaded');
      return;
    }

    const resolution = resolveAdaptiveQueueError(
      error ?? new Error('No response received'),
      'read',
    );

    if (resolution.kind === 'unauthorized') {
      // 401 means the session is no longer valid for any resource.
      this.revokeAccess(resolution);
      return;
    }

    if (resolution.kind === 'forbidden') {
      // 403 is specific to the roster: drop its data, keep the board.
      this.mechanicRoster.set(null);
    }

    this.mechanicsFailure.set(resolution);
    this.mechanicsLoadStatus.set('failed');
  }

  private ensureTicker(): void {
    if (this.tickHandle !== null || this.destroyed) {
      return;
    }

    this.tickHandle = setInterval(() => {
      this.clock.set(Date.now());
      this.enforceSession();
    }, ADAPTIVE_QUEUE_STALE_CHECK_INTERVAL_MS);
  }
}
