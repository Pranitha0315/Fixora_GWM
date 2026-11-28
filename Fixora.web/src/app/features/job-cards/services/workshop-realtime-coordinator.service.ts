import {
  computed,
  effect,
  inject,
  Injectable,
  signal,
  untracked,
} from '@angular/core';
import type { EffectRef, OnDestroy, Signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';

import { Subscription } from 'rxjs';

import { SessionService } from '../../../core/auth/session.service';
import type { AuthSession } from '../../../core/models/auth-session.model';

import {
  WORKSHOP_REALTIME_COALESCE_WINDOW_MS,
  WORKSHOP_REALTIME_EVENTS,
  WORKSHOP_REALTIME_MAX_DEFERRED_JOB_IDS,
  type WorkshopRealtimeConnectedEvent,
  type WorkshopRealtimeConnectionState,
  type WorkshopRealtimeConnectionView,
  type WorkshopRealtimeConsumer,
  type WorkshopRealtimeInvalidationSignal,
} from '../models/workshop-realtime-contract.model';
import { Day06AuthorizationCoordinatorService } from './day06-authorization-coordinator.service';
import { WorkshopRealtimeService } from './workshop-realtime.service';

const CONNECTION_VIEWS: Readonly<
  Record<WorkshopRealtimeConnectionState, WorkshopRealtimeConnectionView>
> = {
  connecting: {
    state: 'connecting',
    label: 'Connecting to live updates...',
    description:
      'Live workshop updates are connecting. Manual refresh remains available.',
  },
  connected: {
    state: 'connected',
    label: 'Live updates connected',
    description:
      'Incoming events trigger an authoritative reload. Connection status does not guarantee data is complete or current.',
  },
  reconnecting: {
    state: 'reconnecting',
    label: 'Reconnecting to live updates...',
    description:
      'Updates may be missed while reconnecting. Use Refresh to reload manually.',
  },
  disconnected: {
    state: 'disconnected',
    label: 'Live updates disconnected',
    description: 'Use Refresh to reload manually.',
  },
  unavailable: {
    state: 'unavailable',
    label: 'Live updates unavailable',
    description:
      'Live workshop updates could not connect. Use Refresh to reload manually.',
  },
};

interface PendingInvalidationBatch {
  jobsList: boolean;
  jobDetailAll: boolean;
  readonly jobDetailIds: Set<string>;
  proposals: boolean;
  changeRequests: boolean;
}

interface DeferredConsumerBatch {
  readonly session: AuthSession;
  readonly batch: PendingInvalidationBatch;
}

function createEmptyBatch(): PendingInvalidationBatch {
  return {
    jobsList: false,
    jobDetailAll: false,
    jobDetailIds: new Set<string>(),
    proposals: false,
    changeRequests: false,
  };
}

function addBoundedJobDetailId(
  batch: PendingInvalidationBatch,
  jobId: string,
): void {
  if (batch.jobDetailAll) {
    return;
  }

  const normalized = jobId.toLowerCase();
  if (batch.jobDetailIds.has(normalized)) {
    return;
  }

  if (batch.jobDetailIds.size >= WORKSHOP_REALTIME_MAX_DEFERRED_JOB_IDS) {
    batch.jobDetailAll = true;
    batch.jobDetailIds.clear();
    return;
  }

  batch.jobDetailIds.add(normalized);
}

function mergeBatches(
  target: PendingInvalidationBatch,
  source: PendingInvalidationBatch,
): void {
  if (source.jobsList) {
    target.jobsList = true;
  }
  if (source.proposals) {
    target.proposals = true;
  }
  if (source.changeRequests) {
    target.changeRequests = true;
  }
  if (source.jobDetailAll) {
    target.jobDetailAll = true;
    target.jobDetailIds.clear();
  } else if (!target.jobDetailAll) {
    for (const id of source.jobDetailIds) {
      addBoundedJobDetailId(target, id);
    }
  }
}

function extractRelevantBatch(
  consumer: WorkshopRealtimeConsumer,
  source: PendingInvalidationBatch,
): PendingInvalidationBatch {
  const relevant = createEmptyBatch();

  if (consumer.kind === 'jobs-list') {
    relevant.jobsList = source.jobsList;
    return relevant;
  }

  if (consumer.kind === 'job-detail') {
    if (source.jobDetailAll) {
      relevant.jobDetailAll = true;
    } else {
      for (const id of source.jobDetailIds) {
        addBoundedJobDetailId(relevant, id);
      }
    }
    return relevant;
  }

  // kind === 'fixproof'
  relevant.proposals = source.proposals;
  relevant.changeRequests = source.changeRequests;
  if (source.jobDetailAll) {
    relevant.jobDetailAll = true;
  } else {
    for (const id of source.jobDetailIds) {
      addBoundedJobDetailId(relevant, id);
    }
  }
  return relevant;
}

function isBatchEmpty(batch: PendingInvalidationBatch): boolean {
  return (
    !batch.jobsList &&
    !batch.jobDetailAll &&
    batch.jobDetailIds.size === 0 &&
    !batch.proposals &&
    !batch.changeRequests
  );
}

function isJobCardsWorkspaceUrl(url: string): boolean {
  const pathname = url.split(/[?#]/, 1)[0];
  return pathname === '/job-cards' || pathname.startsWith('/job-cards/');
}

function sameNormalizedId(left: string | null, right: string | null): boolean {
  return (
    left !== null &&
    right !== null &&
    left.toLowerCase() === right.toLowerCase()
  );
}

/**
 * Workspace-scoped coordinator bridging `WorkshopRealtimeService` and the
 * mounted Day06 pages (`/job-cards`, `/job-cards/:jobId`, `/job-cards/fixproof`).
 *
 * Ownership & lifecycle invariants:
 * - Provided on the `/job-cards` parent route alongside `WorkshopRealtimeService`
 *   (strictly non-root).
 * - Maintains ONE hub connection across child-route transitions between
 *   `JobCards`, `JobCardDetail`, and `FixProofOversight` using reference-counted
 *   consumer registration with microtask handoff (no reconnect during child-route
 *   navigation, and immediate teardown on workspace exit without assuming
 *   Angular Router destroys the route `EnvironmentInjector`).
 * - Never retains references to destroyed components; each consumer releases
 *   itself on `DestroyRef.onDestroy`.
 * - Treats all SignalR events strictly as invalidation signals coalesced inside
 *   a fixed 400ms window, triggering read-only refreshes through existing state
 *   services while preserving selected entities, filters, active pricing drafts,
 *   and unresolved mutation state.
 * - Never dispatches, retries, acknowledges, or alters any mutation.
 */
@Injectable()
export class WorkshopRealtimeCoordinatorService implements OnDestroy {
  private readonly realtime = inject(WorkshopRealtimeService);
  private readonly sessionService = inject(SessionService);
  private readonly authCoordinator = inject(Day06AuthorizationCoordinatorService);
  private readonly router = inject(Router, { optional: true });

  private readonly consumers = new Set<WorkshopRealtimeConsumer>();
  private readonly deferredBatches = new Map<
    WorkshopRealtimeConsumer,
    DeferredConsumerBatch
  >();
  private readonly activeState = signal(false);
  private readonly deferredStateVersion = signal(0);

  private hubSubscriptions: Subscription | null = null;
  private routerSubscription: Subscription | null = null;
  private reconcileTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSession: AuthSession | null = null;
  private pendingBatch: PendingInvalidationBatch = createEmptyBatch();
  private exitCheckGeneration = 0;
  private destroyed = false;

  private readonly sessionWatcher: EffectRef = effect(() => {
    const session = this.sessionService.session();
    this.authCoordinator.revocationVersion();
    this.authCoordinator.forbiddenVersion();
    this.realtime.status();
    this.realtime.failure();

    untracked(() => {
      this.onSessionOrAuthChange(session);
    });
  });

  /**
   * Automatically flushes deferred invalidations once a mutation-blocked
   * consumer's reactive signals (such as `FixProofMutationStateService.phase`,
   * `hasUnresolvedOperation`, and `detachedRequestPending`) return to idle
   * (K18-B / FE-01). Never polls and never schedules while still blocked.
   */
  private readonly deferredRecoveryWatcher: EffectRef = effect(() => {
    this.deferredStateVersion();
    const active = this.activeState();
    const session = this.sessionService.session();
    this.authCoordinator.revocationVersion();
    this.authCoordinator.forbiddenVersion();

    if (!active || session === null || this.deferredBatches.size === 0) {
      return;
    }

    let anyReady = false;
    for (const [consumer, entry] of this.deferredBatches) {
      if (entry.session !== session || !this.consumers.has(consumer)) {
        continue;
      }

      const blocked = Boolean(consumer.isMutationBlocked?.());
      const revoked =
        Boolean(consumer.isAccessRevoked?.()) ||
        Boolean(consumer.hasAuthFailure?.());
      if (!blocked && !revoked) {
        anyReady = true;
      }
    }

    if (anyReady) {
      untracked(() => {
        this.scheduleDeferredFlush(session);
      });
    }
  });

  readonly active: Signal<boolean> = this.activeState.asReadonly();

  /** Truthful connection status, separate from HTTP data freshness. */
  readonly connection: Signal<WorkshopRealtimeConnectionView> = computed(() => {
    switch (this.realtime.status()) {
      case 'connecting':
        return CONNECTION_VIEWS.connecting;
      case 'connected':
        return CONNECTION_VIEWS.connected;
      case 'reconnecting':
        return CONNECTION_VIEWS.reconnecting;
      case 'failed':
        return CONNECTION_VIEWS.unavailable;
      default:
        return CONNECTION_VIEWS.disconnected;
    }
  });

  /**
   * Manual reconnect is offered only when the workspace is active, disconnected
   * or failed for a recoverable non-auth reason, and the current session is valid.
   */
  readonly canReconnect: Signal<boolean> = computed(() => {
    if (!this.activeState()) {
      return false;
    }

    const status = this.realtime.status();
    if (status !== 'failed' && status !== 'disconnected') {
      return false;
    }

    const failure = this.realtime.failure();
    if (failure === 'auth-failed' || failure === 'access-revoked') {
      return false;
    }

    const session = this.sessionService.session();
    if (session === null || !this.sessionService.isAuthenticated()) {
      return false;
    }

    return !this.isSessionRevoked(session);
  });

  constructor() {
    if (this.router !== null) {
      this.routerSubscription = this.router.events.subscribe(event => {
        if (
          event instanceof NavigationEnd &&
          !isJobCardsWorkspaceUrl(event.urlAfterRedirects) &&
          this.consumers.size === 0
        ) {
          this.deactivateWorkspace();
        }
      });
    }
  }

  /**
   * Attaches a mounted Day06 page component to the workspace realtime hub.
   * Returns an idempotent release callback to call from `DestroyRef.onDestroy`.
   */
  attachConsumer(consumer: WorkshopRealtimeConsumer): () => void {
    if (this.destroyed) {
      return () => undefined;
    }

    // Cancel any pending workspace-exit check (child-route transition handoff).
    this.exitCheckGeneration += 1;
    this.consumers.add(consumer);

    if (!this.activeState()) {
      this.activateWorkspace();
    } else if (
      this.realtime.status() === 'disconnected' &&
      this.realtime.failure() === null
    ) {
      this.startRealtimeIfAuthorized();
    }

    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.consumers.delete(consumer);
      this.deleteDeferred(consumer);

      if (this.consumers.size === 0) {
        this.scheduleWorkspaceExitCheck();
      }
    };
  }

  /**
   * Notifies the coordinator that a consumer's mutation-blocked state may have
   * cleared (useful for non-signal consumers). Signal-based consumers are also
   * tracked automatically by `deferredRecoveryWatcher`.
   */
  notifyMutationStateChanged(): void {
    if (this.destroyed || !this.activeState() || this.deferredBatches.size === 0) {
      return;
    }

    const session = this.sessionService.session();
    if (session === null) {
      return;
    }

    for (const [consumer, entry] of this.deferredBatches) {
      if (entry.session !== session || !this.consumers.has(consumer)) {
        continue;
      }

      if (
        !consumer.isMutationBlocked?.() &&
        !consumer.isAccessRevoked?.() &&
        !consumer.hasAuthFailure?.()
      ) {
        this.scheduleDeferredFlush(session);
        return;
      }
    }
  }

  /** Manual user-triggered reconnect. Never sends or retries mutations. */
  reconnect(): void {
    if (this.destroyed || !this.activeState() || !this.canReconnect()) {
      return;
    }

    this.startRealtimeIfAuthorized();
  }

  /** Number of currently attached page consumers (diagnostic/test helper). */
  get activeConsumerCount(): number {
    return this.consumers.size;
  }

  /** Number of attached consumers holding deferred invalidations (diagnostic/test helper). */
  get deferredConsumerCount(): number {
    return this.deferredBatches.size;
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.sessionWatcher.destroy();
    this.deferredRecoveryWatcher.destroy();
    this.routerSubscription?.unsubscribe();
    this.routerSubscription = null;
    this.consumers.clear();
    this.clearDeferredBatches();
    this.deactivateWorkspace();
  }

  private activateWorkspace(): void {
    if (this.destroyed || this.activeState()) {
      return;
    }

    this.activeState.set(true);

    const subs = new Subscription();
    subs.add(
      this.realtime.invalidated$.subscribe(signalEvent =>
        this.onInvalidated(signalEvent),
      ),
    );
    subs.add(
      this.realtime.connected$.subscribe(connectedEvent =>
        this.onConnected(connectedEvent),
      ),
    );
    this.hubSubscriptions = subs;

    this.startRealtimeIfAuthorized();
  }

  private scheduleWorkspaceExitCheck(): void {
    const checkGeneration = ++this.exitCheckGeneration;
    queueMicrotask(() => {
      if (
        this.destroyed ||
        checkGeneration !== this.exitCheckGeneration ||
        this.consumers.size > 0
      ) {
        return;
      }

      this.deactivateWorkspace();
    });
  }

  private deactivateWorkspace(): void {
    this.exitCheckGeneration += 1;
    this.activeState.set(false);
    this.hubSubscriptions?.unsubscribe();
    this.hubSubscriptions = null;
    this.cancelPendingReconcile();
    this.clearDeferredBatches();
    this.realtime.stop();
  }

  private startRealtimeIfAuthorized(): void {
    if (this.destroyed || !this.activeState()) {
      return;
    }

    const session = this.sessionService.session();
    if (
      session === null ||
      !this.sessionService.isAuthenticated() ||
      this.isSessionRevoked(session) ||
      this.allConsumersRevoked()
    ) {
      return;
    }

    void this.realtime.start();
  }

  private onSessionOrAuthChange(session: AuthSession | null): void {
    const invalidSession =
      session === null ||
      !this.sessionService.isAuthenticated() ||
      this.isSessionRevoked(session);

    if (
      this.reconcileTimer !== null &&
      (invalidSession || session !== this.pendingSession)
    ) {
      this.cancelPendingReconcile();
    }

    if (invalidSession) {
      this.clearDeferredBatches();
    } else if (this.deferredBatches.size > 0) {
      let pruned = false;
      for (const [consumer, entry] of this.deferredBatches) {
        if (entry.session !== session || !this.consumers.has(consumer)) {
          this.deferredBatches.delete(consumer);
          pruned = true;
        }
      }
      if (pruned) {
        this.bumpDeferredVersion();
      }
    }

    if (
      !invalidSession &&
      this.activeState() &&
      this.consumers.size > 0 &&
      this.realtime.status() === 'disconnected' &&
      this.realtime.failure() === 'session-ended'
    ) {
      // Fresh replacement session after previous session ended: reconnect cleanly.
      this.startRealtimeIfAuthorized();
    }
  }

  private onInvalidated(signalEvent: WorkshopRealtimeInvalidationSignal): void {
    if (!this.canAcceptRealtimeActivity()) {
      return;
    }

    const jobId = signalEvent.jobCardId?.toLowerCase() ?? null;

    switch (signalEvent.event) {
      case WORKSHOP_REALTIME_EVENTS.queueUpdated:
        this.pendingBatch.jobsList = true;
        if (jobId === null) {
          this.pendingBatch.jobDetailAll = true;
          this.pendingBatch.jobDetailIds.clear();
        } else {
          addBoundedJobDetailId(this.pendingBatch, jobId);
        }
        break;

      case WORKSHOP_REALTIME_EVENTS.jobUpdated:
        this.pendingBatch.jobsList = true;
        if (jobId !== null) {
          addBoundedJobDetailId(this.pendingBatch, jobId);
        }
        break;

      case WORKSHOP_REALTIME_EVENTS.approvalUpdated:
        this.pendingBatch.jobsList = true;
        this.pendingBatch.proposals = true;
        if (jobId !== null) {
          addBoundedJobDetailId(this.pendingBatch, jobId);
        }
        break;

      case WORKSHOP_REALTIME_EVENTS.changeRequestUpdated:
        this.pendingBatch.changeRequests = true;
        if (jobId !== null) {
          addBoundedJobDetailId(this.pendingBatch, jobId);
        }
        break;
    }

    this.scheduleReconcile();
  }

  private onConnected(event: WorkshopRealtimeConnectedEvent): void {
    if (!this.canAcceptRealtimeActivity()) {
      return;
    }

    // Initial page mount already performs authoritative HTTP reads in ngOnInit.
    // Reconcile only after a reconnect when events may have been missed offline.
    if (event.reason !== 'reconnected') {
      return;
    }

    this.pendingBatch.jobsList = true;
    this.pendingBatch.jobDetailAll = true;
    this.pendingBatch.proposals = true;
    this.pendingBatch.changeRequests = true;
    this.scheduleReconcile();
  }

  private canAcceptRealtimeActivity(): boolean {
    if (this.destroyed || !this.activeState() || this.consumers.size === 0) {
      return false;
    }

    const session = this.sessionService.session();
    if (
      session === null ||
      !this.sessionService.isAuthenticated() ||
      this.isSessionRevoked(session) ||
      this.allConsumersRevoked()
    ) {
      this.haltRealtime();
      return false;
    }

    return true;
  }

  private scheduleReconcile(): void {
    if (this.reconcileTimer !== null) {
      // Fixed window: merge additional invalidations into the active batch.
      return;
    }

    const session = this.sessionService.session();
    if (session === null) {
      return;
    }

    this.pendingSession = session;
    this.reconcileTimer = setTimeout(
      () => this.runReconcile(),
      WORKSHOP_REALTIME_COALESCE_WINDOW_MS,
    );
  }

  private runReconcile(): void {
    const scheduledSession = this.pendingSession;
    const batch = this.pendingBatch;

    this.reconcileTimer = null;
    this.pendingSession = null;
    this.pendingBatch = createEmptyBatch();

    if (this.destroyed || !this.activeState() || this.consumers.size === 0) {
      return;
    }

    const currentSession = this.sessionService.session();
    if (
      scheduledSession === null ||
      currentSession !== scheduledSession ||
      !this.sessionService.isAuthenticated() ||
      this.isSessionRevoked(currentSession)
    ) {
      this.clearDeferredBatches();
      return;
    }

    for (const consumer of Array.from(this.consumers)) {
      if (!this.consumers.has(consumer)) {
        continue;
      }

      if (consumer.isAccessRevoked?.() || consumer.hasAuthFailure?.()) {
        this.deleteDeferred(consumer);
        continue;
      }

      const existingDeferred = this.deferredBatches.get(consumer);
      if (existingDeferred && existingDeferred.session !== currentSession) {
        this.deleteDeferred(consumer);
      }

      // Mutation safety invariant (K18-B / FE-01): never interfere with active
      // or unresolved FixProof mutations; preserve relevant invalidations in a
      // bounded session-owned deferred batch for recovery once idle.
      if (consumer.isMutationBlocked?.()) {
        const relevant = extractRelevantBatch(consumer, batch);
        if (!isBatchEmpty(relevant)) {
          this.deferBatchForConsumer(consumer, currentSession, relevant);
        }
        continue;
      }

      const effectiveBatch = createEmptyBatch();
      mergeBatches(effectiveBatch, batch);

      const validDeferred = this.deferredBatches.get(consumer);
      if (validDeferred && validDeferred.session === currentSession) {
        mergeBatches(effectiveBatch, validDeferred.batch);
        // Clear before invoking refresh callbacks to prevent duplicate refreshes
        // or re-entrant loops.
        this.deleteDeferred(consumer);
      }

      if (isBatchEmpty(effectiveBatch)) {
        continue;
      }

      if (consumer.kind === 'jobs-list') {
        if (effectiveBatch.jobsList) {
          consumer.refreshJobsList?.();
        }
        continue;
      }

      if (consumer.kind === 'job-detail') {
        const selectedJobId = consumer.getSelectedJobId?.() ?? null;
        if (
          selectedJobId !== null &&
          this.matchesJobDetailBatch(effectiveBatch, selectedJobId)
        ) {
          consumer.refreshJobDetail?.();
        }
        continue;
      }

      if (consumer.kind === 'fixproof') {
        if (effectiveBatch.proposals) {
          consumer.refreshProposals?.();
        }
        if (effectiveBatch.changeRequests) {
          consumer.refreshChangeRequests?.();
        }
        const selectedJobId = consumer.getSelectedJobId?.() ?? null;
        if (
          selectedJobId !== null &&
          this.matchesJobDetailBatch(effectiveBatch, selectedJobId)
        ) {
          consumer.refreshJobDetail?.();
        }
      }
    }
  }

  private deferBatchForConsumer(
    consumer: WorkshopRealtimeConsumer,
    session: AuthSession,
    relevant: PendingInvalidationBatch,
  ): void {
    const existing = this.deferredBatches.get(consumer);
    if (existing && existing.session === session) {
      mergeBatches(existing.batch, relevant);
    } else {
      const next = createEmptyBatch();
      mergeBatches(next, relevant);
      this.deferredBatches.set(consumer, { session, batch: next });
    }
    this.bumpDeferredVersion();
  }

  private scheduleDeferredFlush(session: AuthSession): void {
    if (
      this.destroyed ||
      !this.activeState() ||
      this.consumers.size === 0 ||
      this.sessionService.session() !== session ||
      !this.sessionService.isAuthenticated() ||
      this.isSessionRevoked(session)
    ) {
      return;
    }

    this.scheduleReconcile();
  }

  private deleteDeferred(consumer: WorkshopRealtimeConsumer): void {
    if (this.deferredBatches.delete(consumer)) {
      this.bumpDeferredVersion();
    }
  }

  private clearDeferredBatches(): void {
    if (this.deferredBatches.size > 0) {
      this.deferredBatches.clear();
      this.bumpDeferredVersion();
    }
  }

  private bumpDeferredVersion(): void {
    this.deferredStateVersion.update(version => version + 1);
  }

  private matchesJobDetailBatch(
    batch: PendingInvalidationBatch,
    selectedJobId: string,
  ): boolean {
    if (batch.jobDetailAll) {
      return true;
    }

    for (const id of batch.jobDetailIds) {
      if (sameNormalizedId(id, selectedJobId)) {
        return true;
      }
    }

    return false;
  }

  private isSessionRevoked(session: AuthSession): boolean {
    if (this.authCoordinator.isSessionRevoked(session)) {
      return true;
    }

    return (
      this.authCoordinator.isFeatureForbidden(session, 'job-cards') &&
      this.authCoordinator.isFeatureForbidden(session, 'fixproof')
    );
  }

  private allConsumersRevoked(): boolean {
    if (this.consumers.size === 0) {
      return false;
    }

    for (const consumer of this.consumers) {
      if (!consumer.isAccessRevoked?.() && !consumer.hasAuthFailure?.()) {
        return false;
      }
    }

    return true;
  }

  private cancelPendingReconcile(): void {
    if (this.reconcileTimer !== null) {
      clearTimeout(this.reconcileTimer);
      this.reconcileTimer = null;
    }
    this.pendingSession = null;
    this.pendingBatch = createEmptyBatch();
  }

  private haltRealtime(): void {
    this.cancelPendingReconcile();
    this.clearDeferredBatches();
    this.realtime.stop();
  }
}
