import {
  computed,
  effect,
  inject,
  Injectable,
  InjectionToken,
  signal,
  untracked,
} from '@angular/core';

import type {
  EffectRef,
  OnDestroy,
  Signal,
} from '@angular/core';

import {
  HubConnectionBuilder,
  LogLevel,
} from '@microsoft/signalr';

import type {
  IRetryPolicy,
  RetryContext,
} from '@microsoft/signalr';

import { Subject } from 'rxjs';
import type { Observable } from 'rxjs';

import { ApiUrlService } from '../../../core/config/api-url.service';
import { SessionService } from '../../../core/auth/session.service';
import type { AuthSession } from '../../../core/models/auth-session.model';

/*
 * ADAPTIVE QUEUE REALTIME (SignalR) CLIENT FOUNDATION
 *
 * Backend contract (Fixora.SharedBackend, net10.0, ASP.NET Core SignalR):
 * - Hub endpoint: `/hubs/fixora` on the API origin (one hub shared by
 *   the customer app, Fixora Rev and the manager web).
 * - The hub is `[Authorize]`. JWT bearer auth also accepts the token as
 *   `?access_token=` for requests under `/hubs` (WebSockets/SSE cannot
 *   send headers). This is why SignalR places the token in the URL for
 *   those transports; the negotiate request uses the Authorization header.
 * - CORS policy "apps" allows credentials; any origin in development,
 *   `Cors:Origins` elsewhere. This client uses bearer tokens only and
 *   sends no cookies (`withCredentials: false`).
 * - On connect the server adds the caller to `user:{id}`, `role:{role}`
 *   and, for managers/owners, `role:staff`. Staff receive:
 *     queue.updated  -> the whole active board (array of JobSummaryDto)
 *                       after every queue recalculation;
 *     job.updated    -> one JobSummaryDto, or the billing variant
 *                       `{ jobId, status }`.
 *   Customer-only variants (QueueEstimateDto `{ jobId, queuePosition,
 *   etaAt, status }`, masked job summaries) travel in user/job groups
 *   that this client never joins. They are still classified safely if
 *   they ever arrive.
 * - Each event is sent with a single argument. The backend states that
 *   a realtime event never proves completion: clients must re-fetch.
 *
 * Staff-presence side effect (IMPORTANT):
 * - For managers and owners, merely connecting registers "a manager is
 *   online" in `StaffPresence`. The server's Auto mode uses that to
 *   decide whether to take over, and disconnecting records the "last
 *   seen" time. Opening this connection therefore changes server-side
 *   behaviour. Start it only while the board is actually open and stop
 *   it when leaving the page. Presence is per server instance and
 *   in-memory.
 *
 * Handling rules:
 * - Events are INVALIDATION SIGNALS ONLY. Payload content is never
 *   stored, exposed or applied to any board snapshot. Only a validated
 *   job id and the payload shape are surfaced. The HTTP read APIs stay
 *   the single source of truth.
 * - `JoinJob`, `LeaveJob` and `Ping` are never called and the client
 *   abstraction below has no invoke/send method, so no group can be
 *   joined.
 *
 * Best-effort delivery limits:
 * - Events are not buffered. Anything published while the client is
 *   offline, reconnecting or not yet connected is lost, and the server
 *   does not replay it. Consumers must reconcile over HTTP after
 *   `connected$` emits and may also reconcile on their own schedule.
 * - Delivery is not ordered with respect to HTTP responses and bursts
 *   are not throttled here; consumers should coalesce (the state
 *   service already runs one request set at a time).
 * - Silent drops (for example a stalled proxy) are only noticed through
 *   SignalR's keep-alive/server timeout. Status is "connected" until
 *   then.
 * - There is no token renewal. A live connection is not re-validated by
 *   the server, so this service ends the connection locally when the
 *   session is cleared, replaced or expires.
 */

/** Hub path on the API origin. Validated by `ApiUrlService.resolve`. */
export const ADAPTIVE_QUEUE_HUB_PATH = 'hubs/fixora';

export const ADAPTIVE_QUEUE_QUEUE_UPDATED_EVENT = 'queue.updated';
export const ADAPTIVE_QUEUE_JOB_UPDATED_EVENT = 'job.updated';

/**
 * Delays before each automatic reconnect attempt. After the last one
 * fails the connection is closed and the status becomes `failed`
 * (about 47 seconds in total). The initial connection is not retried.
 */
export const ADAPTIVE_QUEUE_RECONNECT_DELAYS_MS: readonly number[] = [
  0,
  2_000,
  5_000,
  10_000,
  30_000,
];

/** Largest delay supported by `setTimeout`. */
const MAX_TIMER_DELAY_MS = 2_147_483_647;

const GUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AdaptiveQueueRealtimeStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed';

/** Safe reason codes only; raw errors are never kept or shown. */
export type AdaptiveQueueRealtimeFailure =
  | 'session-unavailable'
  | 'session-ended'
  | 'not-configured'
  | 'connect-failed'
  | 'connection-closed'
  | 'reconnect-exhausted';

export type AdaptiveQueueRealtimeEventName =
  | typeof ADAPTIVE_QUEUE_QUEUE_UPDATED_EVENT
  | typeof ADAPTIVE_QUEUE_JOB_UPDATED_EVENT;

/**
 * What the payload looked like. Informational only.
 * - job-board: array of job summaries (queue.updated for staff).
 * - job-summary: one job summary (job.updated).
 * - job-status: `{ jobId, status }` (billing job.updated variant).
 * - queue-estimate: `{ jobId, queuePosition, ... }` (customer variant).
 * - unrecognized: missing, partial or malformed payload.
 */
export type AdaptiveQueuePayloadShape =
  | 'job-board'
  | 'job-summary'
  | 'job-status'
  | 'queue-estimate'
  | 'unrecognized';

/**
 * "Reload the board over HTTP". Carries no queue data. `jobId` is
 * set only when the payload held a well-formed job id.
 */
export interface AdaptiveQueueInvalidation {
  readonly event: AdaptiveQueueRealtimeEventName;
  readonly shape: AdaptiveQueuePayloadShape;
  readonly jobId: string | null;
  readonly receivedAt: Date;
}

/**
 * The connection was established (or re-established) and events may
 * have been missed in the meantime, so HTTP reconciliation is needed.
 */
export interface AdaptiveQueueRealtimeConnected {
  readonly reason: 'initial' | 'reconnected';
  readonly at: Date;
}

/**
 * The only hub operations this feature may use. There is deliberately
 * no invoke/send, so JoinJob and other hub methods cannot be called.
 */
export interface AdaptiveQueueHubConnection {
  start(): Promise<void>;
  stop(): Promise<void>;
  on(
    methodName: string,
    handler: (...args: unknown[]) => void,
  ): void;
  off(
    methodName: string,
    handler: (...args: unknown[]) => void,
  ): void;
  onclose(callback: (error?: Error) => void): void;
  onreconnecting(callback: (error?: Error) => void): void;
  onreconnected(callback: (connectionId?: string) => void): void;
}

export interface AdaptiveQueueHubConnectionConfig {
  /** Absolute HTTPS URL of the hub; never contains a token. */
  readonly url: string;
  /** Returns the current session token, or '' when none is valid. */
  readonly accessTokenFactory: () => string;
  readonly reconnectPolicy: IRetryPolicy;
}

export type AdaptiveQueueHubConnectionFactory = (
  config: AdaptiveQueueHubConnectionConfig,
) => AdaptiveQueueHubConnection;

/** Replaceable in tests so no real network connection is made. */
export const ADAPTIVE_QUEUE_HUB_CONNECTION_FACTORY =
  new InjectionToken<AdaptiveQueueHubConnectionFactory>(
    'ADAPTIVE_QUEUE_HUB_CONNECTION_FACTORY',
    {
      providedIn: 'root',
      factory: () => createSignalRConnection,
    },
  );

function createSignalRConnection(
  config: AdaptiveQueueHubConnectionConfig,
): AdaptiveQueueHubConnection {
  return new HubConnectionBuilder()
    .withUrl(config.url, {
      accessTokenFactory: config.accessTokenFactory,
      withCredentials: false,
    })
    .withAutomaticReconnect(config.reconnectPolicy)
    // Logging is off: transport logs include URLs that can carry
    // the access_token query parameter.
    .configureLogging(LogLevel.None)
    .build();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value);
}

function readGuid(value: unknown): string | null {
  return typeof value === 'string' && GUID_PATTERN.test(value)
    ? value
    : null;
}

/**
 * Classifies a raw event argument. Never throws and never returns
 * payload content other than a validated job id.
 */
export function classifyAdaptiveQueuePayload(
  payload: unknown,
): { readonly shape: AdaptiveQueuePayloadShape; readonly jobId: string | null } {
  if (Array.isArray(payload)) {
    return payload.every(isRecord)
      ? { shape: 'job-board', jobId: null }
      : { shape: 'unrecognized', jobId: null };
  }

  if (!isRecord(payload)) {
    return { shape: 'unrecognized', jobId: null };
  }

  const summaryId = readGuid(payload['id']);

  if (summaryId !== null && typeof payload['number'] === 'string') {
    return { shape: 'job-summary', jobId: summaryId };
  }

  const jobId = readGuid(payload['jobId']);

  if (jobId !== null) {
    if (typeof payload['queuePosition'] === 'number') {
      return { shape: 'queue-estimate', jobId };
    }

    if (typeof payload['status'] === 'string') {
      return { shape: 'job-status', jobId };
    }
  }

  return { shape: 'unrecognized', jobId: null };
}

/**
 * Feature-scoped realtime client for the Adaptive Queue. Provide it
 * on the page (not in root). It never connects by itself: call
 * `start()` while the board is open and `stop()` when leaving. See
 * the notes above for backend contracts, staff-presence side effects
 * and best-effort limits.
 */
@Injectable()
export class AdaptiveQueueRealtimeService implements OnDestroy {
  private readonly apiUrl = inject(ApiUrlService);
  private readonly sessionService = inject(SessionService);
  private readonly connectionFactory = inject(
    ADAPTIVE_QUEUE_HUB_CONNECTION_FACTORY,
  );

  private readonly connectionStatus =
    signal<AdaptiveQueueRealtimeStatus>('disconnected');
  private readonly connectionFailure =
    signal<AdaptiveQueueRealtimeFailure | null>(null);

  private readonly invalidationEvents =
    new Subject<AdaptiveQueueInvalidation>();
  private readonly connectedEvents =
    new Subject<AdaptiveQueueRealtimeConnected>();

  private connection: AdaptiveQueueHubConnection | null = null;
  private handlers: ReadonlyMap<
    string,
    (...args: unknown[]) => void
  > = new Map();
  private boundSession: AuthSession | null = null;
  private generation = 0;
  private startPromise: Promise<void> | null = null;
  private reconnecting = false;
  private destroyed = false;
  private expiryHandle: ReturnType<typeof setTimeout> | null = null;

  private readonly sessionWatcher: EffectRef = effect(() => {
    // Track the session signal only; reconcile without tracking.
    this.sessionService.session();
    untracked(() => {
      this.enforceSession();
    });
  });

  readonly status: Signal<AdaptiveQueueRealtimeStatus> =
    this.connectionStatus.asReadonly();

  /** Why the connection is not available; null while healthy or idle. */
  readonly failure: Signal<AdaptiveQueueRealtimeFailure | null> =
    this.connectionFailure.asReadonly();

  readonly isConnected: Signal<boolean> = computed(
    () => this.connectionStatus() === 'connected',
  );

  /** Reload signals. Carry no queue data. */
  readonly invalidated$: Observable<AdaptiveQueueInvalidation> =
    this.invalidationEvents.asObservable();

  /** Emits after (re)connection so the consumer reconciles over HTTP. */
  readonly connected$: Observable<AdaptiveQueueRealtimeConnected> =
    this.connectedEvents.asObservable();

  /**
   * Opens the connection. Never rejects: the outcome is reflected in
   * `status` and `failure`. Does nothing while a connection exists or
   * is being established, so duplicates are impossible. Needs a valid
   * session and a configured HTTPS API origin.
   */
  start(): Promise<void> {
    if (this.destroyed) {
      return Promise.resolve();
    }

    if (this.connection !== null) {
      return this.startPromise ?? Promise.resolve();
    }

    const session = this.sessionService.session();

    if (session === null || !this.sessionService.isAuthenticated()) {
      this.connectionStatus.set('disconnected');
      this.connectionFailure.set('session-unavailable');
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

    let connection: AdaptiveQueueHubConnection;

    try {
      connection = this.connectionFactory({
        url,
        accessTokenFactory: () => this.tokenFor(generation),
        reconnectPolicy: this.createReconnectPolicy(generation),
      });
    } catch {
      this.generation += 1;
      this.boundSession = null;
      this.connectionStatus.set('failed');
      this.connectionFailure.set('connect-failed');
      return Promise.resolve();
    }

    this.connection = connection;
    this.registerHandlers(connection, generation);

    this.connectionFailure.set(null);
    this.connectionStatus.set('connecting');
    this.scheduleExpiryCheck(session);

    const startPromise = connection.start().then(
      () => this.onStarted(generation, connection),
      () => this.onStartFailed(generation, connection),
    );

    this.startPromise = startPromise;

    return startPromise;
  }

  /** Closes the connection and removes all handlers. Idempotent. */
  stop(): void {
    this.teardown();
    this.connectionStatus.set('disconnected');
    this.connectionFailure.set(null);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.sessionWatcher.destroy();
    this.teardown();
    this.connectionStatus.set('disconnected');
    this.connectionFailure.set(null);
    this.invalidationEvents.complete();
    this.connectedEvents.complete();
  }

  /** HTTPS origin of the configured API plus the hub path. */
  private resolveHubUrl(): string | null {
    try {
      const resolved = new URL(
        this.apiUrl.resolve(ADAPTIVE_QUEUE_HUB_PATH),
      );

      return `${resolved.origin}/${ADAPTIVE_QUEUE_HUB_PATH}`;
    } catch {
      return null;
    }
  }

  private isCurrent(
    generation: number,
    connection: AdaptiveQueueHubConnection,
  ): boolean {
    return !this.destroyed
      && generation === this.generation
      && this.connection === connection;
  }

  /** True while the bound session is still the valid, current one. */
  private sessionStillBound(): boolean {
    return this.boundSession !== null
      && this.sessionService.session() === this.boundSession
      && this.sessionService.isAuthenticated();
  }

  /**
   * Supplies the token for each negotiation or reconnect. Returns
   * an empty string, never a stale or replaced token, when the
   * bound session is not valid. The token is not kept anywhere.
   */
  private tokenFor(generation: number): string {
    if (
      this.destroyed
      || generation !== this.generation
      || !this.sessionStillBound()
    ) {
      return '';
    }

    return this.sessionService.getAccessToken() ?? '';
  }

  private createReconnectPolicy(generation: number): IRetryPolicy {
    return {
      nextRetryDelayInMilliseconds: (
        context: RetryContext,
      ): number | null => {
        if (
          this.destroyed
          || generation !== this.generation
          || !this.sessionStillBound()
        ) {
          return null;
        }

        return ADAPTIVE_QUEUE_RECONNECT_DELAYS_MS[
          context.previousRetryCount
        ] ?? null;
      },
    };
  }

  private registerHandlers(
    connection: AdaptiveQueueHubConnection,
    generation: number,
  ): void {
    const handlers = new Map<string, (...args: unknown[]) => void>();

    for (const event of [
      ADAPTIVE_QUEUE_QUEUE_UPDATED_EVENT,
      ADAPTIVE_QUEUE_JOB_UPDATED_EVENT,
    ] as const) {
      const handler = (...args: unknown[]): void =>
        this.handleEvent(event, args, generation, connection);

      handlers.set(event, handler);
      connection.on(event, handler);
    }

    this.handlers = handlers;

    connection.onreconnecting(() => {
      if (
        this.isCurrent(generation, connection)
        && this.enforceSession()
      ) {
        this.reconnecting = true;
        this.connectionStatus.set('reconnecting');
      }
    });

    connection.onreconnected(() => {
      if (
        !this.isCurrent(generation, connection)
        || !this.enforceSession()
      ) {
        return;
      }

      this.reconnecting = false;
      this.connectionFailure.set(null);
      this.connectionStatus.set('connected');
      this.connectedEvents.next({
        reason: 'reconnected',
        at: new Date(Date.now()),
      });
    });

    connection.onclose(() => {
      if (!this.isCurrent(generation, connection)) {
        return;
      }

      const wasReconnecting = this.reconnecting;

      this.teardown();
      this.connectionStatus.set('failed');
      this.connectionFailure.set(
        wasReconnecting ? 'reconnect-exhausted' : 'connection-closed',
      );
    });
  }

  private onStarted(
    generation: number,
    connection: AdaptiveQueueHubConnection,
  ): void {
    if (!this.isCurrent(generation, connection)) {
      // Superseded while connecting: never restore access.
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
      at: new Date(Date.now()),
    });
  }

  private onStartFailed(
    generation: number,
    connection: AdaptiveQueueHubConnection,
  ): void {
    if (!this.isCurrent(generation, connection)) {
      return;
    }

    this.teardown();
    this.connectionStatus.set('failed');
    this.connectionFailure.set('connect-failed');
  }

  private handleEvent(
    event: AdaptiveQueueRealtimeEventName,
    args: readonly unknown[],
    generation: number,
    connection: AdaptiveQueueHubConnection,
  ): void {
    if (
      !this.isCurrent(generation, connection)
      || !this.enforceSession()
    ) {
      return;
    }

    // Only the first argument is ever considered, and only to
    // classify it. The payload itself is dropped here.
    const { shape, jobId } = classifyAdaptiveQueuePayload(args[0]);

    this.invalidationEvents.next({
      event,
      shape,
      jobId,
      receivedAt: new Date(Date.now()),
    });
  }

  /**
   * Ends the connection when the bound session was cleared,
   * replaced or expired. Returns false after tearing down.
   */
  private enforceSession(): boolean {
    if (this.connection === null) {
      return true;
    }

    if (!this.destroyed && this.sessionStillBound()) {
      return true;
    }

    this.teardown();
    this.connectionStatus.set('disconnected');
    this.connectionFailure.set('session-ended');

    return false;
  }

  /**
   * One-shot timer (not polling) that ends the connection when the
   * session expires locally.
   */
  private scheduleExpiryCheck(session: AuthSession): void {
    this.clearExpiryCheck();

    const remaining = Math.max(0, session.expiresAt - Date.now());

    this.expiryHandle = setTimeout(() => {
      this.expiryHandle = null;

      if (this.enforceSession() && this.connection !== null) {
        // Delay was clamped; check again closer to the expiry.
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

  /** Invalidates in-flight completions and releases the connection. */
  private teardown(): void {
    this.generation += 1;
    this.clearExpiryCheck();

    const connection = this.connection;

    this.connection = null;
    this.boundSession = null;
    this.startPromise = null;
    this.reconnecting = false;

    if (connection !== null) {
      for (const [event, handler] of this.handlers) {
        try {
          connection.off(event, handler);
        } catch {
          // Removal is best effort; stale callbacks are guarded.
        }
      }

      this.discard(connection);
    }

    this.handlers = new Map();
  }

  /** Best-effort stop that never throws or rejects. */
  private discard(connection: AdaptiveQueueHubConnection): void {
    try {
      connection.stop().catch(() => undefined);
    } catch {
      // Nothing to release.
    }
  }
}
