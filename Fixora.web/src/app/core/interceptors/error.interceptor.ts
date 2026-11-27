import { HttpErrorResponse } from '@angular/common/http';
import type { HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

import {
  ApiError,
  BOOKING_CONFLICT_CODES,
} from '../models/api-error.model';

import type {
  BookingConflictCode,
} from '../models/api-error.model';

function extractBookingConflictCode(
  body: unknown,
): BookingConflictCode | undefined {
  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body)
  ) {
    return undefined;
  }

  const descriptor = Object.getOwnPropertyDescriptor(
    body,
    'code',
  );

  if (
    !descriptor ||
    !('value' in descriptor) ||
    typeof descriptor.value !== 'string'
  ) {
    return undefined;
  }

  const code: string = descriptor.value;

  return BOOKING_CONFLICT_CODES.find(
    allowedCode => allowedCode === code,
  );
}

function normalizeError(error: HttpErrorResponse): ApiError {
  const status = error.status;

  switch (status) {
    case 0:
      return new ApiError(
        status,
        'NETWORK_ERROR',
        'Unable to connect to the server.',
      );

    case 400:
      return new ApiError(
        status,
        'BAD_REQUEST',
        'The request contains invalid information.',
      );

    case 401:
      return new ApiError(
        status,
        'UNAUTHORIZED',
        'Authentication is required.',
      );

    case 403:
      return new ApiError(
        status,
        'FORBIDDEN',
        'You do not have permission to perform this action.',
      );

    case 404:
      return new ApiError(
        status,
        'NOT_FOUND',
        'The requested resource was not found.',
      );

    case 409:
      return new ApiError(
        status,
        'CONFLICT',
        'The request conflicts with existing data.',
        extractBookingConflictCode(error.error),
      );

    case 422:
      return new ApiError(
        status,
        'VALIDATION_ERROR',
        'Please check the information you provided.',
      );

    case 429:
      return new ApiError(
        status,
        'RATE_LIMITED',
        'Too many requests. Please try again later.',
      );

    default:
      if (status >= 500 && status <= 599) {
        return new ApiError(
          status,
          'SERVER_ERROR',
          'A server error occurred. Please try again later.',
        );
      }

      return new ApiError(
        status,
        'UNKNOWN_ERROR',
        'An unexpected error occurred.',
      );
  }
}

export const errorInterceptor: HttpInterceptorFn = (
  request,
  next,
) => {
  return next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        return throwError(() => normalizeError(error));
      }

      return throwError(() => error);
    }),
  );
};
