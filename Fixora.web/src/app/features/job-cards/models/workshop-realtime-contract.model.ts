import type { IRetryPolicy } from '@microsoft/signalr';

/**
 * K17 authoritative contract for workspace-scoped, invalidation-only
 * SignalR realtime integration across `/job-cards`, `/job-cards/:jobId`,
 * and `/job-cards/fixproof`.
 *
 * Verified read-only backend sources:
 * - `Fixora.SharedBackend/src/Host/Fixora.Host/Program.cs:79`
 *   (`app.MapHub<FixoraHub>("/hubs/fixora")`)
 * - `Fixora.SharedBackend/src/Shared/Fixora.Shared.Contracts/Realtime.cs:10-13`
 *   (`approval.updated`, `changeRequest.updated`, `job.updated`, `queue.updated`)
 * - `Fixora.SharedBackend/src/Shared/Fixora.Shared.Infrastructure/Realtime/FixoraHub.cs`
 *   (`[Authorize]`, automatic `user:{id}`, `role:{role}`, `role:staff` on connect;
 *   `StaffPresence` tracking; `JoinJob`/`LeaveJob` never invoked by this client)
 * - `Fixora.SharedBackend/docs/architecture/realtime-approval-routing.md`
 *   ("A realtime event never proves completion: clients re-read the
 *   authoritative state from the API.")
 */

/** Hub path on the trusted API origin (validated via `ApiUrlService.resolve`). */
export const WORKSHOP_REALTIME_HUB_PATH = 'hubs/fixora';

/** Verified server-to-client SignalR event names delivered to `role:staff`. */
export const WORKSHOP_REALTIME_EVENTS = {
  jobUpdated: 'job.updated',
  queueUpdated: 'queue.updated',
  approvalUpdated: 'approval.updated',
  changeRequestUpdated: 'changeRequest.updated',
} as const;

export type WorkshopRealtimeEventName =
  (typeof WORKSHOP_REALTIME_EVENTS)[keyof typeof WORKSHOP_REALTIME_EVENTS];

/**
 * Approved automatic reconnect backoff schedule reused from the verified
 * Day05 SignalR client (`ADAPTIVE_QUEUE_RECONNECT_DELAYS_MS`).
 * Total ~47s across 5 attempts before stopping with `reconnect-exhausted`.
 */
export const WORKSHOP_REALTIME_RECONNECT_DELAYS_MS: readonly number[] = [
  0,
  2_000,
  5_000,
  10_000,
  30_000,
];

/**
 * Approved fixed coalescing window reused from the verified Day05 realtime
 * coordinator (`ADAPTIVE_QUEUE_RECONCILE_WINDOW_MS`).
 */
export const WORKSHOP_REALTIME_COALESCE_WINDOW_MS = 400;

/**
 * Upper bound on distinct deferred job card IDs tracked per consumer while
 * mutation-blocked. Beyond this cap the batch safely collapses to
 * `jobDetailAll = true` so deferred memory remains strictly bounded.
 */
export const WORKSHOP_REALTIME_MAX_DEFERRED_JOB_IDS = 50;

export type WorkshopRealtimeConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed';

/** Safe reason codes only; raw errors, URLs, and tokens are never stored or displayed. */
export type WorkshopRealtimeFailure =
  | 'session-unavailable'
  | 'session-ended'
  | 'access-revoked'
  | 'not-configured'
  | 'auth-failed'
  | 'connect-failed'
  | 'connection-closed'
  | 'reconnect-exhausted';

/**
 * Validated payload shapes matching verified backend publishers:
 * - `job-board`: `JobSummaryDto[]` (`QueueService.cs:51`, `queue.updated`)
 * - `queue-estimate`: `QueueEstimateDto { jobId, position, status, ... }` (`WorkshopDtos.cs:19`, `QueueService.cs:53`, `queue.updated`)
 * - `job-summary`: `JobSummaryDto` (`JobService.cs:170`, `ApprovalWorkflowService.cs:317`, `job.updated`)
 * - `job-status`: `{ jobId, status }` (`BillingService.cs:70`, `job.updated`)
 * - `proposal`: `ProposalDto` (`ApprovalWorkflowService.cs:312`, `approval.updated`)
 * - `change-request`: `ChangeRequestDto` (`ChangeRequestService.cs:117`, `changeRequest.updated`)
 */
export type WorkshopRealtimePayloadShape =
  | 'job-board'
  | 'queue-estimate'
  | 'job-summary'
  | 'job-status'
  | 'proposal'
  | 'change-request';

/**
 * Invalidation-only signal emitted by `WorkshopRealtimeService`.
 * Raw SignalR payloads are never stored or applied as authoritative state
 * and never treated as proof of mutation completion.
 */
export interface WorkshopRealtimeInvalidationSignal {
  readonly event: WorkshopRealtimeEventName;
  readonly shape: WorkshopRealtimePayloadShape;
  /** Validated job card UUID if present in payload, otherwise null. */
  readonly jobCardId: string | null;
  /** Validated proposal/change-request UUID if present in payload, otherwise null. */
  readonly entityId: string | null;
  readonly receivedAtMs: number;
}

/**
 * Emitted when the hub connection is established or re-established.
 * Consumers reconcile over HTTP on `reconnected` because events published
 * while offline are not buffered or replayed by the server.
 */
export interface WorkshopRealtimeConnectedEvent {
  readonly reason: 'initial' | 'reconnected';
  readonly atMs: number;
}

/**
 * Minimal hub operations permitted for the Day06 workshop realtime client.
 * Deliberately excludes `invoke()` and `send()` so `JoinJob`, `LeaveJob`,
 * and unauthorized group subscriptions can never be called.
 */
export interface WorkshopHubConnection {
  start(): Promise<void>;
  stop(): Promise<void>;
  on(methodName: string, handler: (...args: unknown[]) => void): void;
  off(methodName: string, handler: (...args: unknown[]) => void): void;
  onclose(callback: (error?: Error) => void): void;
  onreconnecting(callback: (error?: Error) => void): void;
  onreconnected(callback: (connectionId?: string) => void): void;
}

export interface WorkshopHubConnectionConfig {
  /** Absolute HTTPS URL of `/hubs/fixora`; never contains a token. */
  readonly url: string;
  /** Supplies the bound session's current access token, or `''` if invalid/revoked. */
  readonly accessTokenFactory: () => string;
  readonly reconnectPolicy: IRetryPolicy;
}

export type WorkshopHubConnectionFactory = (
  config: WorkshopHubConnectionConfig,
) => WorkshopHubConnection;

/** Truthful presentation-ready connection states for Day06 pages. */
export type WorkshopRealtimeConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'unavailable';

export interface WorkshopRealtimeConnectionView {
  readonly state: WorkshopRealtimeConnectionState;
  readonly label: string;
  readonly description: string;
}

/**
 * Consumer contract that `WorkshopRealtimeCoordinatorService` can call
 * to trigger authoritative read-only HTTP refreshes without overwriting
 * active pricing drafts, triggering mutation retries, or fabricating
 * mutation outcomes.
 */
export interface WorkshopRealtimeInvalidationTarget {
  invalidateJobsList(): void;
  invalidateJobDetail(jobCardId: string | null): void;
  invalidateProposals(proposalId: string | null): void;
  invalidateChangeRequests(changeRequestId: string | null): void;
}

/**
 * Page-level registration handle attached by `JobCards`, `JobCardDetail`,
 * and `FixProofOversight` while mounted inside the `/job-cards/*` workspace.
 */
export interface WorkshopRealtimeConsumer {
  readonly kind: 'jobs-list' | 'job-detail' | 'fixproof';
  readonly getSelectedJobId?: () => string | null;
  readonly isMutationBlocked?: () => boolean;
  readonly isAccessRevoked?: () => boolean;
  readonly hasAuthFailure?: () => boolean;
  readonly refreshJobsList?: () => void;
  readonly refreshJobDetail?: () => void;
  readonly refreshProposals?: () => void;
  readonly refreshChangeRequests?: () => void;
}
