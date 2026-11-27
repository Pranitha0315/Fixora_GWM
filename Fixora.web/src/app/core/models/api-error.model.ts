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

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly conflictCode?: BookingConflictCode,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
