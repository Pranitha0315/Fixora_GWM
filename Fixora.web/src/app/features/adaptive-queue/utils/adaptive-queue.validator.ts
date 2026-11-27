import type {
  BayDto,
  JobSummaryDto,
} from '../../bookings/models/booking-support.model';

import {
  BookingResponseError,
  validateBayListResponse,
  validateJobSummaryResponse,
} from '../../bookings/utils/booking-response.validator';

const BOOKING_ERROR_PREFIX = 'Invalid booking response: ';

/**
 * Thrown when an adaptive queue response does not match the
 * backend contract. `field` is a structural path such as
 * `jobs[2].id`; it never contains response values.
 */
export class AdaptiveQueueResponseError extends Error {
  constructor(readonly field: string) {
    super(`Invalid adaptive queue response: ${field}`);
    this.name = 'AdaptiveQueueResponseError';
  }
}

function toQueueResponseError(
  error: BookingResponseError,
): AdaptiveQueueResponseError {
  const field = error.message.startsWith(BOOKING_ERROR_PREFIX)
    ? error.message.slice(BOOKING_ERROR_PREFIX.length)
    : 'response';

  return new AdaptiveQueueResponseError(field);
}

function reuseBookingValidator<T>(validate: () => T): T {
  try {
    return validate();
  } catch (error) {
    if (error instanceof BookingResponseError) {
      throw toQueueResponseError(error);
    }

    throw error;
  }
}

function assertUniqueIds(
  items: readonly { readonly id: string }[],
  path: string,
): void {
  const seen = new Set<string>();

  items.forEach((item, index) => {
    const key = item.id.toLowerCase();

    if (seen.has(key)) {
      throw new AdaptiveQueueResponseError(
        `${path}[${index}].id`,
      );
    }

    seen.add(key);
  });
}

/**
 * Validates one JobSummaryDto (for example a full job.updated
 * payload) using the existing booking job validator. Anonymous
 * walk-in jobs (Guid.Empty customerId / vehicleId), nullable
 * ETA, mechanic and bay values, and unrecognised status strings
 * are accepted exactly as the existing validator accepts them.
 */
export function validateAdaptiveQueueJobResponse(
  response: unknown,
  path = 'job',
): JobSummaryDto {
  return reuseBookingValidator(() =>
    validateJobSummaryResponse(response, path),
  );
}

/**
 * Validates the active job list returned by
 * GET /api/v1/manager/jobs?activeOnly=true and by the
 * queue.updated event. An empty array is a valid response.
 * Duplicate job ids are rejected. The backend 200-job limit is
 * not enforced here; it is reported by the mapper as advisory.
 */
export function validateAdaptiveQueueJobsResponse(
  response: unknown,
): readonly JobSummaryDto[] {
  if (!Array.isArray(response)) {
    throw new AdaptiveQueueResponseError('jobs');
  }

  const jobs = response.map((item: unknown, index) =>
    validateAdaptiveQueueJobResponse(item, `jobs[${index}]`),
  );

  assertUniqueIds(jobs, 'jobs');

  return jobs;
}

/**
 * Validates the list returned by
 * GET /api/v1/manager/settings/bays. Inactive bays are valid.
 * Duplicate bay ids are rejected.
 */
export function validateAdaptiveQueueBaysResponse(
  response: unknown,
): readonly BayDto[] {
  const bays = reuseBookingValidator(() =>
    validateBayListResponse(response),
  );

  assertUniqueIds(bays, 'bays');

  return bays;
}
