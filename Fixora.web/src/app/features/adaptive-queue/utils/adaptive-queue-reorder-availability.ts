/**
 * Walk-in reorder availability (K16).
 *
 * Backend contract (Fixora.SharedBackend):
 *   POST /api/v1/manager/jobs/{jobId}/reorder
 *   body { priority: 0 | 1 | 2, queueOrder: int }
 *   (ManagerControllers.cs JobsController.Reorder,
 *    JobService.ReorderAsync, record ReorderJobRequest)
 *
 * ReorderAsync overwrites the stored priority AND queueOrder of the
 * job, then recalculates the queue. The request therefore cannot
 * change one value without supplying the other, and no authorized
 * API reports the stored queueOrder of any job:
 * JobSummaryDto, JobDetailDto, QueueEstimateDto and BookingDto have
 * no such field. queuePosition is a different, derived value and
 * must never be sent as queueOrder.
 *
 * Without the stored queueOrder values there is no authoritative
 * number that places a job before or after another one, and a
 * priority-only change would silently replace an unknown stored
 * order. A reorder request would be a guess, so this portal sends
 * none. The outcome is BACKEND-LIMITED: reorder is not implemented.
 *
 * This module only describes that fact for the UI and for tests. It
 * performs no request, reads no data and holds no state.
 */

export type AdaptiveQueueReorderGapCode =
  | 'queue-order-not-exposed'
  | 'walk-in-link-not-exposed'
  | 'waiting-status-not-enforced'
  | 'no-concurrency-protection';

export interface AdaptiveQueueReorderGap {
  readonly code: AdaptiveQueueReorderGapCode;
  /** True when the gap alone makes a safe reorder impossible. */
  readonly blocking: boolean;
  readonly detail: string;
}

export interface AdaptiveQueueReorderAvailability {
  readonly status: 'backend-limited';
  readonly available: false;
  /** Concise user-facing wording. */
  readonly message: string;
  readonly gaps: readonly AdaptiveQueueReorderGap[];
}

const GAPS: readonly AdaptiveQueueReorderGap[] = Object.freeze([
  Object.freeze({
    code: 'queue-order-not-exposed',
    blocking: true,
    detail:
      'The reorder request needs queueOrder, but no authorized API '
      + 'returns the stored queueOrder of a job. queuePosition is '
      + 'derived by the backend and is not a substitute.',
  }),
  Object.freeze({
    code: 'walk-in-link-not-exposed',
    blocking: true,
    detail:
      'Job responses carry neither the booking source nor the '
      + 'appointment id. A walk-in could only be inferred by paging '
      + 'through the whole booking list and matching jobCardId, '
      + 'which is a point-in-time guess, not a job-level fact.',
  }),
  Object.freeze({
    code: 'waiting-status-not-enforced',
    blocking: false,
    detail:
      'ReorderAsync accepts any job, including running and '
      + 'terminal ones, so a client would have to enforce Open-only '
      + 'itself.',
  }),
  Object.freeze({
    code: 'no-concurrency-protection',
    blocking: false,
    detail:
      'JobCard has no concurrency token. A reorder is last write '
      + 'wins and cannot detect a change made by someone else.',
  }),
]);

const AVAILABILITY: AdaptiveQueueReorderAvailability = Object.freeze({
  status: 'backend-limited',
  available: false,
  message:
    'Reordering is not supported from this page yet. The server does '
    + "not report each job's stored queue order or whether a job is "
    + 'a walk-in, so a reorder cannot be applied safely.',
  gaps: GAPS,
});

/** Always the same, immutable answer for this backend contract. */
export function getAdaptiveQueueReorderAvailability():
AdaptiveQueueReorderAvailability {
  return AVAILABILITY;
}
