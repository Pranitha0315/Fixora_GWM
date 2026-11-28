export type ApiErrorCode =
  | 'NETWORK_ERROR'
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'UNKNOWN_ERROR';

export const BOOKING_CONFLICT_CODES = [
  'mechanic_busy',
  'bay_busy',
  'slot_full',
  'booking_not_requested',
  'booking_not_reschedulable',
  'booking_not_confirmed',
  'concurrency_conflict',
] as const;

export type BookingConflictCode =
  (typeof BOOKING_CONFLICT_CODES)[number];

/**
 * Manager-reachable FixProof / approval workflow HTTP 409 conflict codes
 * verified from Fixora.Manager.Domain/Approvals.cs.
 * `concurrency_conflict` is already preserved in `BOOKING_CONFLICT_CODES`.
 */
export const FIXPROOF_CONFLICT_CODES = [
  'proposal_wrong_state',
  'proposal_not_published',
  'change_wrong_state',
] as const;

export type FixProofConflictCode =
  (typeof FIXPROOF_CONFLICT_CODES)[number];

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly conflictCode?: BookingConflictCode,
    readonly fixProofConflictCode?: FixProofConflictCode,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
