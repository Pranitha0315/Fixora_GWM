import type {
  BayDto,
  JobSummaryDto,
} from '../../bookings/models/booking-support.model';

import type {
  BookingPriority,
} from '../../bookings/models/booking.model';

/**
 * Hard limit applied by GET /api/v1/manager/jobs
 * (JobService.ListAsync uses Take(200); no pagination, no total).
 */
export const ADAPTIVE_QUEUE_JOB_LIMIT = 200;

/** Backend JobStatus.Open: the job is in the waiting queue. */
export const ADAPTIVE_QUEUE_WAITING_STATUS = 'Open';

/**
 * Non-terminal, non-Open JobStatus values. The backend queue
 * calculation treats these as "active phase" jobs. This does
 * NOT prove that the job physically occupies a bay.
 */
export const ADAPTIVE_QUEUE_ACTIVE_PHASE_STATUSES = [
  'Inspecting',
  'AwaitingManagerReview',
  'AwaitingCustomerApproval',
  'AwaitingRelease',
  'InProgress',
  'Paused',
] as const;

/** Backend terminal statuses, excluded from the active queue. */
export const ADAPTIVE_QUEUE_TERMINAL_STATUSES = [
  'Completed',
  'Closed',
] as const;

export type AdaptiveQueueActivePhaseStatus =
  (typeof ADAPTIVE_QUEUE_ACTIVE_PHASE_STATUSES)[number];

export type AdaptiveQueueTerminalStatus =
  (typeof ADAPTIVE_QUEUE_TERMINAL_STATUSES)[number];

/** Result of classifying a backend job status string. */
export type AdaptiveQueueStatusClass =
  | 'waiting'
  | 'active-phase'
  | 'terminal'
  | 'unrecognized';

/** Phase of a job that remains on the board (never 'terminal'). */
export type AdaptiveQueueJobPhase =
  | 'waiting'
  | 'active-phase'
  | 'unrecognized';

/**
 * A backend job plus read-only display metadata.
 * No field here is recalculated: queuePosition and etaAt are
 * always read from `job`.
 */
export interface AdaptiveQueueJob {
  readonly job: JobSummaryDto;
  readonly phase: AdaptiveQueueJobPhase;
  /** Mapped from BookingPriority; null when the value is not 0, 1 or 2. */
  readonly priorityLevel: BookingPriority | null;
  readonly priorityLabel: string;
  /** Backend EtaAt (indicative completion) in Asia/Colombo; null when absent or unparsable. */
  readonly etaDisplay: string | null;
}

/** An active (Active === true) bay and the jobs referencing it. */
export interface AdaptiveQueueBayColumn {
  readonly bay: BayDto;
  /** Active-phase jobs whose BayId is this bay (assignment, not verified occupancy). */
  readonly activePhaseJobs: readonly AdaptiveQueueJob[];
  /** Open jobs pre-assigned to this bay. These do not occupy the bay. */
  readonly preAssignedWaitingJobs: readonly AdaptiveQueueJob[];
  /** Jobs with a status this client does not recognise; never counted as occupancy. */
  readonly unrecognizedStatusJobs: readonly AdaptiveQueueJob[];
  /** Advisory: more than one active-phase job references this bay. */
  readonly hasDuplicateActivePhaseAssignment: boolean;
}

/** Jobs referencing one inactive or unknown bay. */
export interface AdaptiveQueueBayAssignmentGroup {
  readonly bayId: string;
  /** Known bay from the bay list; null for unknown bays. */
  readonly bay: BayDto | null;
  readonly bayLabel: string;
  readonly jobs: readonly AdaptiveQueueJob[];
}

export type AdaptiveQueueInactiveBayAssignment =
  AdaptiveQueueBayAssignmentGroup;

export type AdaptiveQueueUnknownBayAssignment =
  AdaptiveQueueBayAssignmentGroup;

/** Advisory: active-phase jobs sharing one BayId. */
export interface AdaptiveQueueDuplicateBayAssignment {
  readonly bayId: string;
  readonly bayLabel: string;
  readonly jobs: readonly AdaptiveQueueJob[];
}

/** Advisory: active-phase jobs sharing one MechanicId. */
export interface AdaptiveQueueDuplicateMechanicAssignment {
  readonly mechanicId: string;
  readonly mechanicLabel: string;
  readonly jobs: readonly AdaptiveQueueJob[];
}

/**
 * Aggregate comparison of active-phase job count versus active
 * bay count. Advisory only: the backend uses a global pool and
 * ignores BayId when calculating the queue.
 */
export type AdaptiveQueueSaturation =
  | 'no-active-bays'
  | 'below-active-bay-count'
  | 'equals-active-bay-count'
  | 'exceeds-active-bay-count';

export interface AdaptiveQueueCapacitySummary {
  readonly totalBayCount: number;
  readonly activeBayCount: number;
  readonly inactiveBayCount: number;
  readonly activePhaseJobCount: number;
  readonly waitingJobCount: number;
  readonly unrecognizedStatusJobCount: number;
  /** Non-terminal jobs on the board (waiting + active-phase + unrecognized). */
  readonly boardJobCount: number;
  /** Completed/Closed jobs that were received but excluded. */
  readonly excludedTerminalJobCount: number;
  readonly saturation: AdaptiveQueueSaturation;
}

export interface AdaptiveQueueJobLimitAdvisory {
  readonly limit: number;
  /** Number of jobs received from the HTTP list. */
  readonly receivedCount: number;
  /** True when receivedCount >= limit; the list may be truncated. */
  readonly reached: boolean;
}

export type AdaptiveQueueWarningCode =
  | 'no-active-bays'
  | 'capacity-saturation'
  | 'duplicate-active-bay-assignment'
  | 'duplicate-active-mechanic-assignment'
  | 'unassigned-active-phase-jobs'
  | 'inactive-bay-assignments'
  | 'unknown-bay-assignments'
  | 'unrecognized-status-jobs'
  | 'job-limit-reached';

export type AdaptiveQueueWarningSeverity = 'info' | 'warning';

/**
 * Frontend-derived advisory. It is never a backend-enforced
 * conflict, and the backend does not reject any of these states.
 */
export interface AdaptiveQueueWarning {
  readonly code: AdaptiveQueueWarningCode;
  readonly severity: AdaptiveQueueWarningSeverity;
  readonly message: string;
  readonly advisory: true;
}

export interface AdaptiveQueueSnapshot {
  /** Open jobs, ordered by backend queuePosition (ties keep server order). */
  readonly waitingJobs: readonly AdaptiveQueueJob[];
  /** Non-terminal, non-Open jobs, in server order. */
  readonly activePhaseJobs: readonly AdaptiveQueueJob[];
  /** Non-terminal jobs with a status this client does not recognise, in server order. */
  readonly unrecognizedStatusJobs: readonly AdaptiveQueueJob[];
  /** One column per active bay, in backend bay order. */
  readonly bayColumns: readonly AdaptiveQueueBayColumn[];
  /** Jobs with BayId === null. */
  readonly unassignedJobs: readonly AdaptiveQueueJob[];
  readonly inactiveBayAssignments:
    readonly AdaptiveQueueInactiveBayAssignment[];
  readonly unknownBayAssignments:
    readonly AdaptiveQueueUnknownBayAssignment[];
  readonly duplicateBayAssignments:
    readonly AdaptiveQueueDuplicateBayAssignment[];
  readonly duplicateMechanicAssignments:
    readonly AdaptiveQueueDuplicateMechanicAssignment[];
  readonly capacity: AdaptiveQueueCapacitySummary;
  readonly jobLimit: AdaptiveQueueJobLimitAdvisory;
  readonly warnings: readonly AdaptiveQueueWarning[];
}

/** Whether an error occurred during a read or a state-changing request. */
export type AdaptiveQueueOperation = 'read' | 'mutation';

export type AdaptiveQueueErrorKind =
  | 'invalid-request'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'validation-error'
  | 'rate-limited'
  | 'network-failure'
  | 'server-failure'
  | 'invalid-response'
  | 'unknown';

/**
 * - not-applicable: read operation.
 * - rejected: the server explicitly rejected the request.
 * - uncertain: the request may or may not have been applied.
 */
export type AdaptiveQueueMutationOutcome =
  | 'not-applicable'
  | 'rejected'
  | 'uncertain';

export interface AdaptiveQueueErrorResolution {
  readonly kind: AdaptiveQueueErrorKind;
  readonly outcome: AdaptiveQueueMutationOutcome;
  readonly message: string;
  /** The board should be reloaded over HTTP before another attempt. */
  readonly requiresRefresh: boolean;
  readonly requiresSignIn: boolean;
}
