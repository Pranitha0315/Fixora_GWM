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

import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import type { IRetryPolicy, RetryContext } from '@microsoft/signalr';

import { Subject } from 'rxjs';
import type { Observable } from 'rxjs';

import { SessionService } from '../../../core/auth/session.service';
import { ApiUrlService } from '../../../core/config/api-url.service';
import type { AuthSession } from '../../../core/models/auth-session.model';

import {
  WORKSHOP_REALTIME_EVENTS,
  WORKSHOP_REALTIME_HUB_PATH,
  WORKSHOP_REALTIME_RECONNECT_DELAYS_MS,
  type WorkshopHubConnection,
  type WorkshopHubConnectionConfig,
  type WorkshopHubConnectionFactory,
  type WorkshopRealtimeConnectedEvent,
  type WorkshopRealtimeConnectionStatus,
  type WorkshopRealtimeEventName,
  type WorkshopRealtimeFailure,
  type WorkshopRealtimeInvalidationSignal,
  type WorkshopRealtimePayloadShape,
} from '../models/workshop-realtime-contract.model';
import { Day06AuthorizationCoordinatorService } from './day06-authorization-coordinator.service';

/** Largest delay supported by `setTimeout`. */
const MAX_TIMER_DELAY_MS = 2_147_483_647;

const GUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STAFF_ROLES = new Set<string>(['Manager', 'Owner']);

const SUBSCRIBED_EVENTS: readonly WorkshopRealtimeEventName[] = [
  WORKSHOP_REALTIME_EVENTS.jobUpdated,
  WORKSHOP_REALTIME_EVENTS.queueUpdated,
  WORKSHOP_REALTIME_EVENTS.approvalUpdated,
  WORKSHOP_REALTIME_EVENTS.changeRequestUpdated,
];

/**
 * Replaceable hub connection factory token for Day06 workshop realtime.
 * Isolated from Day05 `ADAPTIVE_QUEUE_HUB_CONNECTION_FACTORY`.
 * Tests override this token so zero real network connections are made.
 */
export const WORKSHOP_HUB_CONNECTION_FACTORY =
  new InjectionToken<WorkshopHubConnectionFactory>(
    'FIXORA_WORKSHOP_HUB_CONNECTION_FACTORY',
    {
      providedIn: 'root',
      factory: () => createWorkshopSignalRConnection,
    },
  );

function createWorkshopSignalRConnection(
  config: WorkshopHubConnectionConfig,
): WorkshopHubConnection {
  return new HubConnectionBuilder()
    .withUrl(config.url, {
      accessTokenFactory: config.accessTokenFactory,
      withCredentials: false,
    })
    .withAutomaticReconnect(config.reconnectPolicy)
    // Logging stays off so access_token query strings are never written to console.
    .configureLogging(LogLevel.None)
    .build();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readGuid(value: unknown): string | null {
  return typeof value === 'string' &&
    GUID_PATTERN.test(value) &&
    value !== '00000000-0000-0000-0000-000000000000'
    ? value
    : null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidQueuePosition(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function hasStaffRole(session: AuthSession): boolean {
  return (
    Array.isArray(session.user?.roles) &&
    session.user.roles.some(role => STAFF_ROLES.has(role))
  );
}

function isAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const record = error as {
    readonly statusCode?: unknown;
    readonly status?: unknown;
    readonly message?: unknown;
  };

  if (
    record.statusCode === 401 ||
    record.statusCode === 403 ||
    record.status === 401 ||
    record.status === 403
  ) {
    return true;
  }

  if (typeof record.message === 'string') {
    return /\b(401|403|unauthorized|forbidden)\b/i.test(record.message);
  }

  return false;
}

export interface WorkshopClassifiedPayload {
  readonly shape: WorkshopRealtimePayloadShape;
  readonly jobCardId: string | null;
  readonly entityId: string | null;
}

/**
 * Strictly validates and classifies a raw SignalR event payload against the
 * verified backend contracts (`Realtime.cs`, `JobService.cs`, `QueueService.cs`,
 * `BillingService.cs`, `ApprovalWorkflowService.cs`, `ChangeRequestService.cs`).
 *
 * Returns `null` for malformed, missing, or unrecognized payloads so they are
 * safely rejected without throwing and without triggering refreshes.
 * Never returns raw payload fields other than validated UUIDs.
 */
export function classifyWorkshopRealtimePayload(
  event: WorkshopRealtimeEventName,
  payload: unknown,
): WorkshopClassifiedPayload | null {
  switch (event) {
    case WORKSHOP_REALTIME_EVENTS.queueUpdated: {
      if (Array.isArray(payload)) {
        return payload.every(isRecord)
          ? { shape: 'job-board', jobCardId: null, entityId: null }
          : null;
      }

      if (!isRecord(payload)) {
        return null;
      }

      const jobId = readGuid(payload['jobId']);
      if (
        jobId !== null &&
        isValidQueuePosition(payload['position']) &&
        isNonEmptyString(payload['status'])
      ) {
        return { shape: 'queue-estimate', jobCardId: jobId, entityId: null };
      }

      return null;
    }

    case WORKSHOP_REALTIME_EVENTS.jobUpdated: {
      if (!isRecord(payload)) {
        return null;
      }

      const summaryId = readGuid(payload['id']);
      if (summaryId !== null && isNonEmptyString(payload['number'])) {
        return { shape: 'job-summary', jobCardId: summaryId, entityId: null };
      }

      const jobId = readGuid(payload['jobId']);
      if (jobId !== null && isNonEmptyString(payload['status'])) {
        return { shape: 'job-status', jobCardId: jobId, entityId: null };
      }

      return null;
    }

    case WORKSHOP_REALTIME_EVENTS.approvalUpdated: {
      if (!isRecord(payload)) {
        return null;
      }

      const id = readGuid(payload['id']);
      const jobCardId = readGuid(payload['jobCardId']);
      if (
        id !== null &&
        jobCardId !== null &&
        isNonEmptyString(payload['status'])
      ) {
        return { shape: 'proposal', jobCardId, entityId: id };
      }

      return null;
    }

    case WORKSHOP_REALTIME_EVENTS.changeRequestUpdated: {
      if (!isRecord(payload)) {
        return null;
      }

      const id = readGuid(payload['id']);
      const jobCardId = readGuid(payload['jobCardId']);
      if (
        id !== null &&
        jobCardId !== null &&
        isNonEmptyString(payload['status'])
      ) {
        return { shape: 'change-request', jobCardId, entityId: id };
      }

      return null;
    }

    default:
      return null;
  }
}

/**
 * Workspace-scoped SignalR realtime client for Day06 (`/job-cards/*`).
 *
 * Security & lifecycle invariants:
 * - Strictly non-root (`@Injectable()`), provided on the `/job-cards` workspace
 *   route injector and controlled exclusively by `WorkshopRealtimeCoordinatorService`.
 * - Connects to `/hubs/fixora` on the trusted API origin (`withCredentials: false`,
 *   `LogLevel.None`, bearer token supplied dynamically per negotiation/reconnect).
 * - Never invokes `JoinJob`, `LeaveJob`, or any hub method; relies solely on
 *   server-assigned `role:staff` broadcasts.
 * - Subscribes exclusively to the 4 verified events (`job.updated`, `queue.updated`,
 *   `approval.updated`, `changeRequest.updated`) and emits invalidation-only
 *   signals after strict payload validation. Malformed payloads are rejected.
 * - Bound to exact `AuthSession` identity and `Day06AuthorizationCoordinatorService`;
 *   tears down immediately on logout, expiry, replacement, or Day06 401/403 revocation.
 * - Completely isolated from Day05 `AdaptiveQueueRealtimeService`.
 */
@Injectable()
export class WorkshopRealtimeService implements OnDestroy {
  private readonly apiUrl = inject(ApiUrlService);
  private readonly sessionService = inject(SessionService);
  private readonly authCoordinator = inject(Day06AuthorizationCoordinatorService);
  private readonly connectionFactory = inject(WORKSHOP_HUB_CONNECTION_FACTORY);

  private readonly connectionStatus =
    signal<WorkshopRealtimeConnectionStatus>('disconnected');
  private readonly connectionFailure = signal<WorkshopRealtimeFailure | null>(
    null,
  );

  private readonly invalidationEvents =
    new Subject<WorkshopRealtimeInvalidationSignal>();
  private readonly connectedEvents =
    new Subject<WorkshopRealtimeConnectedEvent>();

  private connection: WorkshopHubConnection | null = null;
  private handlers: ReadonlyMap<string, (...args: unknown[]) => void> =
    new Map();
  private boundSession: AuthSession | null = null;
  private generation = 0;
  private startPromise: Promise<void> | null = null;
  private pendingStartGeneration: number | null = null;
  private pendingStopPromise: Promise<void> = Promise.resolve();
  private activeStopCount = 0;
  private reconnecting = false;
  private destroyed = false;
  private expiryHandle: ReturnType<typeof setTimeout> | null = null;

  private readonly sessionWatcher: EffectRef = effect(() => {
    this.sessionService.session();
    this.authCoordinator.revocationVersion();
    this.authCoordinator.forbiddenVersion();
    untracked(() => {
      this.enforceSession();
    });
  });

  private readonly unregisterAuthListener = this.authCoordinator.registerListener(
    revokedSession => {
      if (this.boundSession !== null && this.boundSession === revokedSession) {
        this.teardownForAccessLoss('access-revoked');
      }
    },
  );

  readonly status: Signal<WorkshopRealtimeConnectionStatus> =
    this.connectionStatus.asReadonly();

  readonly failure: Signal<WorkshopRealtimeFailure | null> =
    this.connectionFailure.asReadonly();

  readonly isConnected: Signal<boolean> = computed(
    () => this.connectionStatus() === 'connected',
  );

  /** Invalidation-only signals. Carry no raw DTOs or mutation outcomes. */
  readonly invalidated$: Observable<WorkshopRealtimeInvalidationSignal> =
    this.invalidationEvents.asObservable();

  /** Emits on initial connection and after each successful automatic reconnect. */
  readonly connected$: Observable<WorkshopRealtimeConnectedEvent> =
    this.connectedEvents.asObservable();

  /**
   * Opens a single workspace hub connection. Idempotent while a connection
   * already exists or is connecting (prevents duplicate start calls), and
   * strictly serialized after any in-flight asynchronous `stop()` so two
   * Day06 workspace connections can never overlap.
   * Never rejects; failures are surfaced via safe `status` and `failure` signals.
   */
  start(): Promise<void> {
    if (this.destroyed) {
      return Promise.resolve();
    }

    if (this.connection !== null || this.pendingStartGeneration !== null) {
      if (!this.enforceSession()) {
        return Promise.resolve();
      }
      return this.startPromise ?? Promise.resolve();
    }

    const session = this.sessionService.session();

    if (
      session === null ||
      !this.sessionService.isAuthenticated() ||
      !hasStaffRole(session)
    ) {
      this.connectionStatus.set('disconnected');
      this.connectionFailure.set('session-unavailable');
      return Promise.resolve();
    }

    if (this.isSessionAccessRevoked(session)) {
      this.connectionStatus.set('disconnected');
      this.connectionFailure.set('access-revoked');
      return Promise.resolve();
    }

    const url = this.resolveHubUrl();
    if (url === null) {
      this.connectionStatus.set('failed');
      this.connectionFailure.set('not-configured');
      return Promise.resolve();
    }

    const generation = ++this.generation;
    this.boundSession = session;
    this.reconnecting = false;
    this.pendingStartGeneration = generation;
    this.connectionFailure.set(null);
    this.connectionStatus.set('connecting');
    this.scheduleExpiryCheck(session);

    // If a prior connection's async stop() is still settling, wait for it
    // before constructing or starting a replacement connection (FE-02).
    if (this.activeStopCount > 0) {
      const serializedStart = this.pendingStopPromise.then(() =>
        this.launchConnection(generation, session, url),
      );
      this.startPromise = serializedStart;
      return serializedStart;
    }

    const immediateStart = this.launchConnection(generation, session, url);
    this.startPromise = immediateStart;
    return immediateStart;
  }

  private launchConnection(
    generation: number,
    session: AuthSession,
    url: string,
  ): Promise<void> {
    if (
      this.destroyed ||
      generation !== this.generation ||
      this.pendingStartGeneration !== generation
    ) {
      return Promise.resolve();
    }

    if (
      this.sessionService.session() !== session ||
      !this.sessionService.isAuthenticated() ||
      !hasStaffRole(session)
    ) {
      this.teardownForAccessLoss('session-ended');
      return Promise.resolve();
    }

    if (this.isSessionAccessRevoked(session)) {
      this.teardownForAccessLoss('access-revoked');
      return Promise.resolve();
    }

    let connection: WorkshopHubConnection;
    try {
      connection = this.connectionFactory({
        url,
        accessTokenFactory: () => this.tokenFor(generation),
        reconnectPolicy: this.createReconnectPolicy(generation),
      });
    } catch {
      this.generation += 1;
      this.clearExpiryCheck();
      this.boundSession = null;
      this.startPromise = null;
      this.pendingStartGeneration = null;
      this.connectionStatus.set('failed');
      this.connectionFailure.set('connect-failed');
      return Promise.resolve();
    }

    this.connection = connection;
    this.pendingStartGeneration = null;
    this.registerHandlers(connection, generation);

    let rawStart: Promise<void>;
    try {
      rawStart = Promise.resolve(connection.start());
    } catch (error: unknown) {
      this.onStartFailed(generation, connection, error);
      return Promise.resolve();
    }

    return rawStart.then(
      () => this.onStarted(generation, connection),
      (error: unknown) => this.onStartFailed(generation, connection, error),
    );
  }

  /** Stops the active connection and removes all handlers. Idempotent. */
  stop(): void {
    this.teardown();
    this.connectionStatus.set('disconnected');
    this.connectionFailure.set(null);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.sessionWatcher.destroy();
    this.unregisterAuthListener();
    this.teardown();
    this.connectionStatus.set('disconnected');
    this.connectionFailure.set(null);
    this.invalidationEvents.complete();
    this.connectedEvents.complete();
  }

  private resolveHubUrl(): string | null {
    try {
      const resolved = new URL(this.apiUrl.resolve(WORKSHOP_REALTIME_HUB_PATH));
      return `${resolved.origin}/${WORKSHOP_REALTIME_HUB_PATH}`;
    } catch {
      return null;
    }
  }

  private isCurrent(
    generation: number,
    connection: WorkshopHubConnection,
  ): boolean {
    return (
      !this.destroyed &&
      generation === this.generation &&
      this.connection === connection
    );
  }

  private isSessionAccessRevoked(session: AuthSession): boolean {
    if (this.authCoordinator.isSessionRevoked(session)) {
      return true;
    }

    return (
      this.authCoordinator.isFeatureForbidden(session, 'job-cards') &&
      this.authCoordinator.isFeatureForbidden(session, 'fixproof')
    );
  }

  private sessionStillAuthorized(): boolean {
    const bound = this.boundSession;
    return (
      bound !== null &&
      this.sessionService.session() === bound &&
      this.sessionService.isAuthenticated() &&
      hasStaffRole(bound) &&
      !this.isSessionAccessRevoked(bound)
    );
  }

  private tokenFor(generation: number): string {
    if (
      this.destroyed ||
      generation !== this.generation ||
      !this.sessionStillAuthorized()
    ) {
      return '';
    }

    return this.sessionService.getAccessToken() ?? '';
  }

  private createReconnectPolicy(generation: number): IRetryPolicy {
    return {
      nextRetryDelayInMilliseconds: (context: RetryContext): number | null => {
        if (
          this.destroyed ||
          generation !== this.generation ||
          !this.sessionStillAuthorized()
        ) {
          return null;
        }

        return (
          WORKSHOP_REALTIME_RECONNECT_DELAYS_MS[context.previousRetryCount] ??
          null
        );
      },
    };
  }

  private registerHandlers(
    connection: WorkshopHubConnection,
    generation: number,
  ): void {
    const handlers = new Map<string, (...args: unknown[]) => void>();

    for (const event of SUBSCRIBED_EVENTS) {
      const handler = (...args: unknown[]): void =>
        this.handleEvent(event, args, generation, connection);
      handlers.set(event, handler);
      connection.on(event, handler);
    }

    this.handlers = handlers;

    connection.onreconnecting(() => {
      if (this.isCurrent(generation, connection) && this.enforceSession()) {
        this.reconnecting = true;
        this.connectionStatus.set('reconnecting');
      }
    });

    connection.onreconnected(() => {
      if (!this.isCurrent(generation, connection) || !this.enforceSession()) {
        return;
      }

      this.reconnecting = false;
      this.connectionFailure.set(null);
      this.connectionStatus.set('connected');
      this.connectedEvents.next({
        reason: 'reconnected',
        atMs: Date.now(),
      });
    });

    connection.onclose((error?: Error) => {
      if (!this.isCurrent(generation, connection)) {
        return;
      }

      const wasReconnecting = this.reconnecting;
      const authFailed = isAuthError(error);
      this.teardown(true);

      if (authFailed) {
        this.connectionStatus.set('failed');
        this.connectionFailure.set('auth-failed');
        return;
      }

      this.connectionStatus.set('failed');
      this.connectionFailure.set(
        wasReconnecting ? 'reconnect-exhausted' : 'connection-closed',
      );
    });
  }

  private onStarted(
    generation: number,
    connection: WorkshopHubConnection,
  ): void {
    if (!this.isCurrent(generation, connection)) {
      this.discard(connection);
      return;
    }

    if (!this.enforceSession()) {
      return;
    }

    this.startPromise = null;
    this.connectionFailure.set(null);
    this.connectionStatus.set('connected');
    this.connectedEvents.next({
      reason: 'initial',
      atMs: Date.now(),
    });
  }

  private onStartFailed(
    generation: number,
    connection: WorkshopHubConnection,
    error: unknown,
  ): void {
    if (!this.isCurrent(generation, connection)) {
      return;
    }

    const authFailed = isAuthError(error);
    this.teardown();
    this.connectionStatus.set('failed');
    this.connectionFailure.set(authFailed ? 'auth-failed' : 'connect-failed');
  }

  private handleEvent(
    event: WorkshopRealtimeEventName,
    args: readonly unknown[],
    generation: number,
    connection: WorkshopHubConnection,
  ): void {
    if (!this.isCurrent(generation, connection) || !this.enforceSession()) {
      return;
    }

    const classified = classifyWorkshopRealtimePayload(event, args[0]);
    if (classified === null) {
      // Malformed or unrecognized payload: reject safely without triggering refresh.
      return;
    }

    this.invalidationEvents.next({
      event,
      shape: classified.shape,
      jobCardId: classified.jobCardId,
      entityId: classified.entityId,
      receivedAtMs: Date.now(),
    });
  }

  private enforceSession(): boolean {
    if (this.connection === null && this.pendingStartGeneration === null) {
      return true;
    }

    if (!this.destroyed && this.sessionStillAuthorized()) {
      return true;
    }

    const bound = this.boundSession;
    const reason: WorkshopRealtimeFailure =
      bound !== null &&
      this.sessionService.session() === bound &&
      this.isSessionAccessRevoked(bound)
        ? 'access-revoked'
        : 'session-ended';

    this.teardownForAccessLoss(reason);
    return false;
  }

  private teardownForAccessLoss(reason: WorkshopRealtimeFailure): void {
    this.teardown();
    this.connectionStatus.set('disconnected');
    this.connectionFailure.set(reason);
  }

  private scheduleExpiryCheck(session: AuthSession): void {
    this.clearExpiryCheck();
    const remaining = Math.max(0, session.expiresAt - Date.now());

    this.expiryHandle = setTimeout(() => {
      this.expiryHandle = null;
      if (
        this.enforceSession() &&
        (this.connection !== null || this.pendingStartGeneration !== null)
      ) {
        this.scheduleExpiryCheck(session);
      }
    }, Math.min(remaining, MAX_TIMER_DELAY_MS));
  }

  private clearExpiryCheck(): void {
    if (this.expiryHandle !== null) {
      clearTimeout(this.expiryHandle);
      this.expiryHandle = null;
    }
  }

  private teardown(alreadyClosed = false): void {
    this.generation += 1;
    this.clearExpiryCheck();

    const connection = this.connection;
    this.connection = null;
    this.boundSession = null;
    this.startPromise = null;
    this.pendingStartGeneration = null;
    this.reconnecting = false;

    if (connection !== null) {
      for (const [event, handler] of this.handlers) {
        try {
          connection.off(event, handler);
        } catch {
          // Best-effort unregister; generation guard blocks any residual callback.
        }
      }
      if (!alreadyClosed) {
        this.discard(connection);
      }
    }

    this.handlers = new Map();
  }

  private discard(connection: WorkshopHubConnection): void {
    this.activeStopCount += 1;
    let rawStop: Promise<void>;
    try {
      rawStop = Promise.resolve(connection.stop());
    } catch {
      rawStop = Promise.resolve();
    }
    const onSettled = (): void => {
      this.activeStopCount = Math.max(0, this.activeStopCount - 1);
    };
    const tracked = rawStop.then(onSettled, onSettled);
    this.pendingStopPromise =
      this.activeStopCount > 1
        ? this.pendingStopPromise.then(
            () => tracked,
            () => tracked,
          )
        : tracked;
  }
}
