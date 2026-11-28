import { DOCUMENT } from '@angular/common';
import {
  computed,
  effect,
  inject,
  Injectable,
  InjectionToken,
  signal,
  untracked,
} from '@angular/core';

import type { EffectRef, OnDestroy, Signal } from '@angular/core';

import { SessionService } from '../../../core/auth/session.service';
import type { AuthSession } from '../../../core/models/auth-session.model';
import { Day06AuthorizationCoordinatorService } from '../../job-cards/services/day06-authorization-coordinator.service';

import type {
  FixProofAccessLoss,
  FixProofMutationAction,
  FixProofMutationPhase,
} from './fixproof-mutation-state.service';

/**
 * Minimal browser event target required for `beforeunload` protection.
 * Injected via `FIXPROOF_BEFORE_UNLOAD_TARGET` so tests never mutate global
 * `window` and SSR/non-browser environments fail safely with no listener.
 */
export interface FixProofBeforeUnloadTarget {
  addEventListener(
    type: 'beforeunload',
    listener: (event: BeforeUnloadEvent) => void,
  ): void;
  removeEventListener(
    type: 'beforeunload',
    listener: (event: BeforeUnloadEvent) => void,
  ): void;
}

/**
 * SSR-safe injection token resolving the browser `Window` via `DOCUMENT`.
 * Override in unit tests with a fake target instead of mutating global `window`.
 */
export const FIXPROOF_BEFORE_UNLOAD_TARGET =
  new InjectionToken<FixProofBeforeUnloadTarget | null>(
    'FIXORA_FIXPROOF_BEFORE_UNLOAD_TARGET',
    {
      providedIn: 'root',
      factory: () => inject(DOCUMENT, { optional: true })?.defaultView ?? null,
    },
  );

export type FixProofNavigationProtectionReason =
  | 'mutation-submitting'
  | 'mutation-uncertain'
  | 'reconciliation-required'
  | 'access-lost-potentially-executed'
  | 'detached-request-pending';

/**
 * Structured, non-sensitive summary of active FixProof mutation navigation
 * protection across all currently live feature instances bound to the exact
 * active `AuthSession`.
 *
 * Never contains job/proposal/item IDs, notes, prices, customer/vehicle data,
 * credentials, tokens, or raw backend messages.
 */
export interface FixProofNavigationProtectionSnapshot {
  readonly protected: boolean;
  readonly activeInstanceCount: number;
  readonly protectedInstanceCount: number;
  readonly submittingCount: number;
  readonly uncertainCount: number;
  readonly reconciliationRequiredCount: number;
  readonly accessLostUnresolvedCount: number;
  readonly detachedTransportCount: number;
  readonly reasons: readonly FixProofNavigationProtectionReason[];
  readonly allowReauthenticationNavigation: boolean;
  readonly message: string | null;
}

export type FixProofUnresolvedNoticeReason =
  | 'destroyed-while-submitting'
  | 'destroyed-while-uncertain'
  | 'destroyed-while-reconciliation-required'
  | 'destroyed-while-access-lost'
  | 'destroyed-with-detached-request';

/**
 * Minimal, non-sensitive, session-scoped notice recorded when a feature
 * `FixProofMutationStateService` instance is destroyed while unresolved
 * mutation risk still exists for the exact active `AuthSession`.
 *
 * Security & honesty invariants:
 * - Stored in memory only (inside a `WeakMap<AuthSession, ...>`); never
 *   written to `localStorage` or `sessionStorage`.
 * - Never proves whether the server executed, failed, or rolled back the
 *   mutation; dismissing a notice never authorizes a retry or implies
 *   reconciliation.
 * - `action` is populated ONLY when accurately known and directly attributable;
 *   it is `null` for acknowledged detached transports so actions are never
 *   fabricated or misattributed across operations.
 */
export interface FixProofUnresolvedNavigationNotice {
  readonly id: number;
  readonly action: FixProofMutationAction | null;
  readonly reason: FixProofUnresolvedNoticeReason;
  readonly detachedCount: number;
  readonly potentiallyExecuted: true;
  readonly proofOfOutcome: 'none';
  readonly message: string;
  readonly recordedAt: Date;
}

/** Input accepted when handing off a notice before feature service teardown. */
export interface FixProofUnresolvedNoticeInput {
  readonly action: FixProofMutationAction | null;
  readonly reason: FixProofUnresolvedNoticeReason;
  readonly detachedCount?: number;
}

/**
 * Read-only adapter registered by each live `FixProofMutationStateService`
 * instance. Keeps `FixProofMutationStateService` feature-scoped (`@Injectable()`)
 * while allowing root-scoped navigation and unload coordination across 0..N
 * instances.
 */
export interface FixProofMutationProtectionSource {
  readonly isDestroyed: () => boolean;
  readonly phase: () => FixProofMutationPhase;
  readonly hasUnresolvedOperation: () => boolean;
  readonly detachedRequestPending: () => boolean;
  readonly accessLoss: () => FixProofAccessLoss | null;
  readonly activeSequence: () => number | null;
  readonly isBoundToSession: (session: AuthSession) => boolean;
  readonly detachedSequencesForSession: (
    session: AuthSession,
  ) => readonly number[];
}

/** Internal evaluation output including operation keys for stale-confirm checks. */
export interface FixProofNavigationEvaluation {
  readonly session: AuthSession | null;
  readonly snapshot: FixProofNavigationProtectionSnapshot;
  readonly protectionKeys: ReadonlySet<string>;
}

const PROTECTION_MESSAGES: Readonly<
  Record<FixProofNavigationProtectionReason, string>
> = {
  'mutation-submitting':
    'A FixProof action is currently in progress. Leaving this page does not establish whether the server applied the change and does not roll back a request that was already sent.',
  'mutation-uncertain':
    'An unresolved FixProof action may already have been applied on the server. Leaving this page does not establish the server outcome, does not roll back the request, and will clear current reconciliation details.',
  'reconciliation-required':
    'A FixProof action still requires review and acknowledgement. Leaving this page does not establish the server outcome, does not roll back the request, and will clear current reconciliation details.',
  'access-lost-potentially-executed':
    'Access was lost while a FixProof action may already have been applied on the server. Leaving this page does not establish the server outcome or roll back the request, and will clear this warning.',
  'detached-request-pending':
    'A previously dispatched FixProof request has not answered yet and may still be applied on the server. Leaving this page does not establish the server outcome and does not cancel or roll back that server request.',
};

const NOTICE_MESSAGES: Readonly<
  Record<FixProofUnresolvedNoticeReason, string>
> = {
  'destroyed-while-submitting':
    'A FixProof view was closed while an action was still in progress. Leaving did not cancel or roll back the server request. Check the latest server state before taking any further action.',
  'destroyed-while-uncertain':
    'A FixProof view was closed while an action outcome remained uncertain. Leaving did not roll back the server request. Check the latest server state before taking any further action.',
  'destroyed-while-reconciliation-required':
    'A FixProof view was closed before an unresolved action was acknowledged. Leaving did not roll back the server request. Check the latest server state before taking any further action.',
  'destroyed-while-access-lost':
    'A FixProof view was closed after access was lost during a dispatched action. Leaving did not roll back the server request. Check the latest server state before taking any further action.',
  'destroyed-with-detached-request':
    'A FixProof view was closed while one or more previously dispatched requests had not yet answered. Leaving did not cancel or roll back those server requests. Check the latest server state before taking any further action.',
};

const EMPTY_NOTICES: readonly FixProofUnresolvedNavigationNotice[] = Object.freeze(
  [],
);

const UNPROTECTED_SNAPSHOT: FixProofNavigationProtectionSnapshot =
  Object.freeze({
    protected: false,
    activeInstanceCount: 0,
    protectedInstanceCount: 0,
    submittingCount: 0,
    uncertainCount: 0,
    reconciliationRequiredCount: 0,
    accessLostUnresolvedCount: 0,
    detachedTransportCount: 0,
    reasons: Object.freeze([]),
    allowReauthenticationNavigation: false,
    message: null,
  });

function resolvePrimaryMessage(
  reasons: readonly FixProofNavigationProtectionReason[],
): string | null {
  if (reasons.length === 0) {
    return null;
  }

  const priority: readonly FixProofNavigationProtectionReason[] = [
    'mutation-submitting',
    'mutation-uncertain',
    'reconciliation-required',
    'access-lost-potentially-executed',
    'detached-request-pending',
  ];

  for (const reason of priority) {
    if (reasons.includes(reason)) {
      return PROTECTION_MESSAGES[reason];
    }
  }

  return PROTECTION_MESSAGES[reasons[0]];
}

/**
 * Root-injector-scoped coordinator for FixProof mutation navigation and
 * browser `beforeunload` protection across zero, one, or multiple live
 * feature-scoped `FixProofMutationStateService` instances.
 *
 * Lifecycle & security invariants:
 * - Scoped to Angular DI (`providedIn: 'root'`), never module-level mutable state.
 * - Never makes `FixProofMutationStateService` root-scoped and never retains
 *   destroyed feature service instances.
 * - Evaluates protection strictly against the exact active `AuthSession`
 *   reference; stale or unauthorized session instances are excluded.
 * - Dynamically attaches at most ONE `beforeunload` listener when protection is
 *   needed and detaches it immediately when protection ends, on logout/session
 *   change, or on service destruction.
 * - Never sends HTTP requests, never calls `navigator.sendBeacon`, never writes
 *   to `localStorage`/`sessionStorage`, and starts zero timers/timeouts.
 * - Preserves minimal, non-sensitive unresolved-operation notices inside a
 *   `WeakMap<AuthSession, ...>` so warnings are not silently lost on component
 *   destruction within the same session while guaranteeing zero cross-session
 *   leakage.
 *
 * Browser limitation notice:
 * - Native `beforeunload` prompts are advisory and best-effort only; browsers
 *   ignore custom dialog text and cannot guarantee prevention of tab closure,
 *   forced reload, process termination, or mobile OS lifecycle teardown.
 * - In-memory notices cannot survive a full page reload.
 */
@Injectable({
  providedIn: 'root',
})
export class FixProofNavigationProtectionService implements OnDestroy {
  private readonly sessionService = inject(SessionService);
  private readonly authCoordinator = inject(
    Day06AuthorizationCoordinatorService,
  );
  private readonly unloadTarget = inject(FIXPROOF_BEFORE_UNLOAD_TARGET, {
    optional: true,
  });

  private readonly sources = new Map<number, FixProofMutationProtectionSource>();
  private readonly noticesBySession = new WeakMap<
    AuthSession,
    readonly FixProofUnresolvedNavigationNotice[]
  >();

  private readonly registryVersion = signal(0);
  private readonly noticeVersion = signal(0);

  private nextInstanceId = 0;
  private nextNoticeId = 0;
  private readonly beforeUnloadAttachedState = signal(false);
  private activeConfirmationToken: symbol | null = null;
  private destroyed = false;

  private readonly sessionWatcher: EffectRef = effect(() => {
    this.sessionService.session();
    this.authCoordinator.revocationVersion();
    untracked(() => {
      this.syncBeforeUnload();
    });
  });

  private readonly onBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (this.destroyed || !this.evaluateProtection().snapshot.protected) {
      this.detachBeforeUnload();
      return;
    }

    event.preventDefault();
    event.returnValue = '';
  };

  // ------------------------------------------------------------ public state

  readonly protectionSnapshot: Signal<FixProofNavigationProtectionSnapshot> =
    computed(() => {
      this.registryVersion();
      this.sessionService.session();
      this.authCoordinator.revocationVersion();

      return this.evaluateProtection().snapshot;
    });

  readonly requiresNavigationProtection: Signal<boolean> = computed(
    () => this.protectionSnapshot().protected,
  );

  readonly hasInFlightMutation: Signal<boolean> = computed(
    () => this.protectionSnapshot().submittingCount > 0,
  );

  readonly hasUnresolvedOperation: Signal<boolean> = computed(() => {
    const snap = this.protectionSnapshot();

    return (
      snap.uncertainCount > 0 ||
      snap.reconciliationRequiredCount > 0 ||
      snap.accessLostUnresolvedCount > 0
    );
  });

  readonly hasDetachedTransport: Signal<boolean> = computed(
    () => this.protectionSnapshot().detachedTransportCount > 0,
  );

  /** True while a single `beforeunload` listener is attached to the target. */
  readonly isBeforeUnloadAttached: Signal<boolean> =
    this.beforeUnloadAttachedState.asReadonly();

  /**
   * Minimal, non-sensitive unresolved-operation notices preserved for the exact
   * current authenticated `AuthSession`. Automatically empty when logged out or
   * replaced by a different session.
   */
  readonly currentSessionNotices: Signal<
    readonly FixProofUnresolvedNavigationNotice[]
  > = computed(() => {
    this.noticeVersion();
    const session = this.currentValidSession();

    if (session === null) {
      return EMPTY_NOTICES;
    }

    return this.noticesBySession.get(session) ?? EMPTY_NOTICES;
  });

  readonly hasCurrentSessionNotices: Signal<boolean> = computed(
    () => this.currentSessionNotices().length > 0,
  );

  // -------------------------------------------------------- instance registry

  /**
   * Registers one live `FixProofMutationStateService` protection source.
   * Returns an idempotent unregister callback to be called in `ngOnDestroy()`.
   */
  registerSource(source: FixProofMutationProtectionSource): () => void {
    if (this.destroyed) {
      return () => undefined;
    }

    const id = ++this.nextInstanceId;
    this.sources.set(id, source);
    this.sync();

    let unregistered = false;

    return () => {
      if (unregistered) {
        return;
      }

      unregistered = true;
      this.sources.delete(id);
      this.sync();
    };
  }

  /**
   * Synchronously refreshes computed subscribers and `beforeunload` listener
   * attachment. Called directly on mutation state transitions so there is zero
   * change-detection tick gap between dispatch and unload protection.
   */
  sync(): void {
    if (this.destroyed) {
      this.detachBeforeUnload();
      return;
    }

    this.registryVersion.update(version => version + 1);
    this.syncBeforeUnload();
  }

  // -------------------------------------------------------------- evaluation

  /**
   * Computes a fresh, synchronous protection evaluation against the exact
   * current `AuthSession` across all live registered sources.
   */
  evaluateProtection(): FixProofNavigationEvaluation {
    if (this.destroyed) {
      return {
        session: null,
        snapshot: UNPROTECTED_SNAPSHOT,
        protectionKeys: new Set<string>(),
      };
    }

    const currentSession = this.currentValidSession();

    if (currentSession === null) {
      return {
        session: null,
        snapshot: Object.freeze({
          ...UNPROTECTED_SNAPSHOT,
          activeInstanceCount: this.countLiveInstances(),
        }),
        protectionKeys: new Set<string>(),
      };
    }

    let activeInstanceCount = 0;
    let protectedInstanceCount = 0;
    let submittingCount = 0;
    let uncertainCount = 0;
    let reconciliationRequiredCount = 0;
    let accessLostUnresolvedCount = 0;
    let detachedTransportCount = 0;

    const reasonSet = new Set<FixProofNavigationProtectionReason>();
    const protectionKeys = new Set<string>();

    for (const [id, source] of this.sources) {
      if (source.isDestroyed()) {
        continue;
      }

      activeInstanceCount += 1;

      const phase = source.phase();
      const bound = source.isBoundToSession(currentSession);
      const accessLoss = source.accessLoss();
      const activeSeq = source.activeSequence();
      const detachedSeqs = source.detachedSequencesForSession(currentSession);

      let instanceProtected = false;

      if (bound) {
        if (phase === 'submitting') {
          submittingCount += 1;
          reasonSet.add('mutation-submitting');
          protectionKeys.add(`${id}:op:${activeSeq ?? 'active'}`);
          instanceProtected = true;
        } else if (phase === 'uncertain' && source.hasUnresolvedOperation()) {
          uncertainCount += 1;
          reasonSet.add('mutation-uncertain');
          protectionKeys.add(`${id}:op:${activeSeq ?? 'active'}`);
          instanceProtected = true;
        } else if (
          phase === 'reconciliation-required' &&
          source.hasUnresolvedOperation()
        ) {
          reconciliationRequiredCount += 1;
          reasonSet.add('reconciliation-required');
          protectionKeys.add(`${id}:op:${activeSeq ?? 'active'}`);
          instanceProtected = true;
        } else if (
          phase === 'access-lost' &&
          accessLoss?.potentiallyExecuted === true &&
          source.hasUnresolvedOperation()
        ) {
          accessLostUnresolvedCount += 1;
          reasonSet.add('access-lost-potentially-executed');
          protectionKeys.add(`${id}:access-lost:${activeSeq ?? 'active'}`);
          instanceProtected = true;
        }
      }

      // Detached transport risk takes precedence over otherwise unprotected
      // phases (e.g., idle after acknowledge, validating, refreshing, succeeded,
      // rejected, or access-lost without potential execution).
      if (detachedSeqs.length > 0 && source.detachedRequestPending()) {
        detachedTransportCount += detachedSeqs.length;
        reasonSet.add('detached-request-pending');
        instanceProtected = true;

        for (const seq of detachedSeqs) {
          protectionKeys.add(`${id}:detached:${seq}`);
        }
      }

      if (instanceProtected) {
        protectedInstanceCount += 1;
      }
    }

    const reasons = Object.freeze([...reasonSet]);
    const isProtected = protectedInstanceCount > 0;
    const onlyAccessLost =
      isProtected &&
      submittingCount === 0 &&
      uncertainCount === 0 &&
      reconciliationRequiredCount === 0 &&
      detachedTransportCount === 0 &&
      accessLostUnresolvedCount > 0;

    const allowReauthenticationNavigation =
      this.authCoordinator.isCurrentSessionRevoked() || onlyAccessLost;

    const snapshot: FixProofNavigationProtectionSnapshot = Object.freeze({
      protected: isProtected,
      activeInstanceCount,
      protectedInstanceCount,
      submittingCount,
      uncertainCount,
      reconciliationRequiredCount,
      accessLostUnresolvedCount,
      detachedTransportCount,
      reasons,
      allowReauthenticationNavigation,
      message: resolvePrimaryMessage(reasons),
    });

    return {
      session: currentSession,
      snapshot,
      protectionKeys,
    };
  }

  // ------------------------------------------------------- notice preservation

  /**
   * Records a minimal, non-sensitive notice bound to the exact `AuthSession`
   * reference. Refuses silently when destroyed or when `session` is not the
   * exact valid active session (zero cross-session retention).
   */
  recordNotice(
    session: AuthSession | null | undefined,
    input: FixProofUnresolvedNoticeInput,
  ): FixProofUnresolvedNavigationNotice | null {
    if (this.destroyed || session === null || session === undefined) {
      return null;
    }

    const current = this.currentValidSession();

    if (current === null || current !== session) {
      return null;
    }

    const detachedCount =
      input.reason === 'destroyed-with-detached-request'
        ? Math.max(1, Math.trunc(input.detachedCount ?? 1))
        : 0;

    // Never fabricate an action when recording a detached-only notice.
    const action =
      input.reason === 'destroyed-with-detached-request' ? null : input.action;

    const notice: FixProofUnresolvedNavigationNotice = Object.freeze({
      id: ++this.nextNoticeId,
      action,
      reason: input.reason,
      detachedCount,
      potentiallyExecuted: true as const,
      proofOfOutcome: 'none' as const,
      message: NOTICE_MESSAGES[input.reason],
      recordedAt: new Date(Date.now()),
    });

    const existing = this.noticesBySession.get(current) ?? EMPTY_NOTICES;
    this.noticesBySession.set(current, Object.freeze([...existing, notice]));
    this.noticeVersion.update(version => version + 1);

    return notice;
  }

  /**
   * Explicitly dismisses one preserved notice for the exact current session.
   * Dismissal is UI acknowledgement only: it never implies reconciliation,
   * never proves server outcome, and never authorizes a retry.
   */
  dismissNotice(noticeId: number): boolean {
    const current = this.currentValidSession();

    if (current === null) {
      return false;
    }

    const existing = this.noticesBySession.get(current);

    if (existing === undefined || existing.length === 0) {
      return false;
    }

    const remaining = existing.filter(notice => notice.id !== noticeId);

    if (remaining.length === existing.length) {
      return false;
    }

    if (remaining.length === 0) {
      this.noticesBySession.delete(current);
    } else {
      this.noticesBySession.set(current, Object.freeze(remaining));
    }

    this.noticeVersion.update(version => version + 1);
    return true;
  }

  /**
   * Explicitly dismisses all preserved notices for the exact current session.
   * Never implies reconciliation, never proves server outcome, and never
   * authorizes a retry.
   */
  dismissAllNotices(): boolean {
    const current = this.currentValidSession();

    if (current === null) {
      return false;
    }

    const existing = this.noticesBySession.get(current);

    if (existing === undefined || existing.length === 0) {
      return false;
    }

    this.noticesBySession.delete(current);
    this.noticeVersion.update(version => version + 1);
    return true;
  }

  // ------------------------------------------------ guard confirmation locking

  /**
   * Attempts to acquire single-owner confirmation lock inside this root
   * injector. Returns a release token on success, or `null` if another
   * confirmation prompt is already active.
   */
  tryAcquireConfirmationLock(): symbol | null {
    if (this.destroyed || this.activeConfirmationToken !== null) {
      return null;
    }

    const token = Symbol('fixproof-nav-confirmation');
    this.activeConfirmationToken = token;
    return token;
  }

  /** Releases the confirmation lock only if `token` still owns it. */
  releaseConfirmationLock(token: symbol): void {
    if (this.activeConfirmationToken === token) {
      this.activeConfirmationToken = null;
    }
  }

  /** True when a guard confirmation prompt is currently in progress. */
  isConfirmationInProgress(): boolean {
    return this.activeConfirmationToken !== null;
  }

  // --------------------------------------------------------------- lifecycle

  ngOnDestroy(): void {
    this.destroyed = true;
    this.sessionWatcher.destroy();
    this.sources.clear();
    this.activeConfirmationToken = null;
    this.detachBeforeUnload();
  }

  // --------------------------------------------------------------- internals

  private currentValidSession(): AuthSession | null {
    return this.sessionService.isAuthenticated()
      ? this.sessionService.session()
      : null;
  }

  private countLiveInstances(): number {
    let count = 0;

    for (const source of this.sources.values()) {
      if (!source.isDestroyed()) {
        count += 1;
      }
    }

    return count;
  }

  private syncBeforeUnload(): void {
    if (this.destroyed) {
      this.detachBeforeUnload();
      return;
    }

    const shouldProtect = this.evaluateProtection().snapshot.protected;

    if (shouldProtect) {
      this.attachBeforeUnload();
    } else {
      this.detachBeforeUnload();
    }
  }

  private attachBeforeUnload(): void {
    if (this.beforeUnloadAttachedState() || this.unloadTarget === null) {
      return;
    }

    this.unloadTarget.addEventListener('beforeunload', this.onBeforeUnload);
    this.beforeUnloadAttachedState.set(true);
  }

  private detachBeforeUnload(): void {
    if (!this.beforeUnloadAttachedState()) {
      return;
    }

    this.unloadTarget?.removeEventListener('beforeunload', this.onBeforeUnload);
    this.beforeUnloadAttachedState.set(false);
  }
}
