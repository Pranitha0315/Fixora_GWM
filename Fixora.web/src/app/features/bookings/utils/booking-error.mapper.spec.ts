import { ApiError } from '../../../core/models/api-error.model';

import type {
  BookingConflictCode,
} from '../../../core/models/api-error.model';

import {
  resolveBookingActionError,
} from './booking-error.mapper';

describe('resolveBookingActionError', () => {
  const fallback =
    'The booking action could not be verified. Refresh and review before trying again.';

  const genericConflict =
    'A booking conflict occurred. Refresh and review the booking.';

  const sensitiveMessage =
    'Sensitive internal database information';

  const conflicts = [
    {
      code: 'mechanic_busy',
      message:
        'Selected mechanic is already booked. Please select another mechanic.',
    },
    {
      code: 'bay_busy',
      message:
        'Selected bay is already occupied. Please select another bay.',
    },
    {
      code: 'slot_full',
      message:
        'This time slot is fully booked. Please select another time.',
    },
    {
      code: 'booking_not_requested',
      message:
        'This booking is no longer awaiting confirmation or rejection.',
    },
    {
      code: 'booking_not_reschedulable',
      message:
        'This booking can no longer be rescheduled.',
    },
    {
      code: 'booking_not_confirmed',
      message:
        'This booking must be confirmed first.',
    },
    {
      code: 'concurrency_conflict',
      message:
        'The data has changed. Refresh and review before continuing.',
    },
  ] as const;

  for (const testCase of conflicts) {
    it(`BEM-01 maps ${testCase.code}`, () => {
      const error = new ApiError(
        409,
        'CONFLICT',
        sensitiveMessage,
        testCase.code,
      );

      const message = resolveBookingActionError(error);

      expect(message).toBe(testCase.message);
      expect(message).not.toContain(sensitiveMessage);
    });
  }

  const invalidCodes = [
    undefined,
    'unknown_conflict',
    '__proto__',
    'constructor',
  ];

  for (const code of invalidCodes) {
    it(`BEM-02 safely handles ${String(code)}`, () => {
      const error = new ApiError(
        409,
        'CONFLICT',
        sensitiveMessage,
        code as BookingConflictCode | undefined,
      );

      expect(
        resolveBookingActionError(error),
      ).toBe(genericConflict);
    });
  }

  const apiErrors = [
    {
      status: 0,
      code: 'NETWORK_ERROR',
      message:
        'Connection lost. Refresh and verify the booking before trying again.',
    },
    {
      status: 400,
      code: 'BAD_REQUEST',
      message:
        'Please review the information you provided.',
    },
    {
      status: 422,
      code: 'VALIDATION_ERROR',
      message:
        'Please review the information you provided.',
    },
    {
      status: 401,
      code: 'UNAUTHORIZED',
      message:
        'Your session is no longer authorized. Please sign in again.',
    },
    {
      status: 403,
      code: 'FORBIDDEN',
      message:
        'You do not have permission to perform this booking action.',
    },
    {
      status: 404,
      code: 'NOT_FOUND',
      message:
        'The requested resource was not found. Refresh and review the booking.',
    },
    {
      status: 429,
      code: 'RATE_LIMITED',
      message:
        'Too many requests. Please wait before trying again.',
    },
    {
      status: 500,
      code: 'SERVER_ERROR',
      message:
        'The server could not complete the request reliably. Refresh and verify the booking before trying again.',
    },
    {
      status: 418,
      code: 'UNKNOWN_ERROR',
      message: fallback,
    },
  ] as const;

  for (const testCase of apiErrors) {
    it(`BEM-03 maps ${testCase.code} safely`, () => {
      const error = new ApiError(
        testCase.status,
        testCase.code,
        sensitiveMessage,
      );

      const message = resolveBookingActionError(error);

      expect(message).toBe(testCase.message);
      expect(message).not.toContain(sensitiveMessage);
    });
  }

  const unknownErrors = [
    {
      label: 'ordinary Error',
      value: new Error(sensitiveMessage),
    },
    {
      label: 'null',
      value: null,
    },
    {
      label: 'undefined',
      value: undefined,
    },
    {
      label: 'untrusted error object',
      value: {
        status: 409,
        code: 'CONFLICT',
        conflictCode: 'mechanic_busy',
        message: sensitiveMessage,
      },
    },
  ];

  for (const testCase of unknownErrors) {
    it(`BEM-04 safely handles ${testCase.label}`, () => {
      expect(
        resolveBookingActionError(testCase.value),
      ).toBe(fallback);
    });
  }

  it('BEM-05 ignores conflict metadata on non-409 errors', () => {
    const error = new ApiError(
      403,
      'FORBIDDEN',
      sensitiveMessage,
      'mechanic_busy',
    );

    expect(
      resolveBookingActionError(error),
    ).toBe(
      'You do not have permission to perform this booking action.',
    );
  });
});
