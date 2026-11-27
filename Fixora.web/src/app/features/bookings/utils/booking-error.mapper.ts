import { ApiError } from '../../../core/models/api-error.model';

import type {
  BookingConflictCode,
} from '../../../core/models/api-error.model';

const CONFLICT_MESSAGES: Readonly<
  Record<BookingConflictCode, string>
> = {
  mechanic_busy:
    'Selected mechanic is already booked. Please select another mechanic.',

  bay_busy:
    'Selected bay is already occupied. Please select another bay.',

  slot_full:
    'This time slot is fully booked. Please select another time.',

  booking_not_requested:
    'This booking is no longer awaiting confirmation or rejection.',

  booking_not_reschedulable:
    'This booking can no longer be rescheduled.',

  booking_not_confirmed:
    'This booking must be confirmed first.',

  concurrency_conflict:
    'The data has changed. Refresh and review before continuing.',
};

export function resolveBookingActionError(
  error: unknown,
): string {
  if (!(error instanceof ApiError)) {
    return 'The booking action could not be verified. Refresh and review before trying again.';
  }

  if (
    error.status === 409 &&
    error.code === 'CONFLICT'
  ) {
    const code = error.conflictCode;

    if (
      code !== undefined &&
      Object.prototype.hasOwnProperty.call(
        CONFLICT_MESSAGES,
        code,
      )
    ) {
      return CONFLICT_MESSAGES[code];
    }

    return 'A booking conflict occurred. Refresh and review the booking.';
  }

  switch (error.code) {
    case 'NETWORK_ERROR':
      return 'Connection lost. Refresh and verify the booking before trying again.';

    case 'BAD_REQUEST':
    case 'VALIDATION_ERROR':
      return 'Please review the information you provided.';

    case 'UNAUTHORIZED':
      return 'Your session is no longer authorized. Please sign in again.';

    case 'FORBIDDEN':
      return 'You do not have permission to perform this booking action.';

    case 'NOT_FOUND':
      return 'The requested resource was not found. Refresh and review the booking.';

    case 'RATE_LIMITED':
      return 'Too many requests. Please wait before trying again.';

    case 'SERVER_ERROR':
      return 'The server could not complete the request reliably. Refresh and verify the booking before trying again.';

    default:
      return 'The booking action could not be verified. Refresh and review before trying again.';
  }
}
