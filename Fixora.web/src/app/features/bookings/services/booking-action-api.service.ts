import {
  HttpClient,
  HttpParams,
} from '@angular/common/http';

import {
  inject,
  Injectable,
} from '@angular/core';

import { defer, map } from 'rxjs';
import type { Observable } from 'rxjs';

import { ApiUrlService } from '../../../core/config/api-url.service';

import type { Booking } from '../models/booking.model';

import type {
  ConfirmBookingRequest,
  DeclineBookingRequest,
  RescheduleRequest,
  WalkInRequest,
  AssignJobRequest,
  BookingSlotQuery,
} from '../models/booking-action.model';

import type {
  MechanicRosterDto,
  BayDto,
  ServiceDto,
  SlotDto,
  JobSummaryDto,
} from '../models/booking-support.model';

import {
  BookingRequestError,
  validateConfirmBookingRequest,
  validateDeclineBookingRequest,
  validateRescheduleRequest,
  validateWalkInRequest,
  validateAssignJobRequest,
  validateBookingSlotQuery,
} from '../utils/booking-action.validator';

import {
  BookingResponseError,
  validateBookingResponse,
  validateMechanicListResponse,
  validateBayListResponse,
  validateServiceListResponse,
  validateSlotListResponse,
  validateJobSummaryResponse,
} from '../utils/booking-response.validator';

const MANAGER_API = 'api/v1/manager';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMPTY_UUID =
  '00000000-0000-0000-0000-000000000000';

function validateResourceId(
  value: unknown,
  field: string,
): string {
  if (
    typeof value !== 'string' ||
    !UUID_PATTERN.test(value) ||
    value === EMPTY_UUID
  ) {
    throw new BookingRequestError(field);
  }

  return value;
}

@Injectable({
  providedIn: 'root',
})
export class BookingActionApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(ApiUrlService);

  getMechanics(): Observable<readonly MechanicRosterDto[]> {
    return defer(() =>
      this.http.get<unknown>(
        this.apiUrl.resolve(`${MANAGER_API}/mechanics`),
      ),
    ).pipe(
      map(validateMechanicListResponse),
    );
  }

  getBays(): Observable<readonly BayDto[]> {
    return defer(() =>
      this.http.get<unknown>(
        this.apiUrl.resolve(`${MANAGER_API}/settings/bays`),
      ),
    ).pipe(
      map(validateBayListResponse),
    );
  }

  getServices(): Observable<readonly ServiceDto[]> {
    return defer(() =>
      this.http.get<unknown>(
        this.apiUrl.resolve(`${MANAGER_API}/settings/services`),
      ),
    ).pipe(
      map(validateServiceListResponse),
    );
  }

  getSlots(
    query: BookingSlotQuery,
  ): Observable<readonly SlotDto[]> {
    return defer(() => {
      const validated = validateBookingSlotQuery(query);

      const params = new HttpParams()
        .set('date', validated.date)
        .set('serviceId', validated.serviceId);

      return this.http.get<unknown>(
        this.apiUrl.resolve(`${MANAGER_API}/bookings/slots`),
        { params },
      );
    }).pipe(
      map(validateSlotListResponse),
    );
  }

  confirmBooking(
    bookingId: string,
    request: ConfirmBookingRequest,
  ): Observable<Booking> {
    return this.bookingMutation(
      bookingId,
      'confirm',
      () => validateConfirmBookingRequest(request),
    );
  }

  declineBooking(
    bookingId: string,
    request: DeclineBookingRequest,
  ): Observable<Booking> {
    return this.bookingMutation(
      bookingId,
      'decline',
      () => validateDeclineBookingRequest(request),
    );
  }

  rescheduleBooking(
    bookingId: string,
    request: RescheduleRequest,
  ): Observable<Booking> {
    return this.bookingMutation(
      bookingId,
      'reschedule',
      () => validateRescheduleRequest(request),
    );
  }

  createWalkIn(
    request: WalkInRequest,
  ): Observable<JobSummaryDto> {
    return defer(() => {
      const body = validateWalkInRequest(request);

      return this.http.post<unknown>(
        this.apiUrl.resolve(`${MANAGER_API}/bookings/walk-in`),
        body,
      );
    }).pipe(
      map(response => validateJobSummaryResponse(response)),
    );
  }

  getJobDetails(jobId: string): Observable<JobSummaryDto> {
    return defer(() => {
      const id = validateResourceId(jobId, 'jobId');

      return this.http.get<unknown>(
        this.apiUrl.resolve(`${MANAGER_API}/jobs/${id}`),
      ).pipe(
        map(response => {
          if (
            typeof response !== 'object' ||
            response === null ||
            Array.isArray(response)
          ) {
            throw new BookingResponseError('jobDetails');
          }

          const source = response as Record<string, unknown>;

          const job = validateJobSummaryResponse(
            source['job'],
            'jobDetails.job',
          );

          if (job.id.toLowerCase() !== id.toLowerCase()) {
            throw new BookingResponseError('jobDetails.job.id');
          }

          return job;
        }),
      );
    });
  }

  assignJob(
    jobId: string,
    request: AssignJobRequest,
  ): Observable<JobSummaryDto> {
    return defer(() => {
      const id = validateResourceId(jobId, 'jobId');
      const body = validateAssignJobRequest(request);

      return this.http.post<unknown>(
        this.apiUrl.resolve(`${MANAGER_API}/jobs/${id}/assign`),
        body,
      );
    }).pipe(
      map(response => validateJobSummaryResponse(response)),
      map(job => {
        if (job.id.toLowerCase() !== jobId.toLowerCase()) {
          throw new BookingResponseError('job.id');
        }

        return job;
      }),
    );
  }

  private bookingMutation(
    bookingId: string,
    action: 'confirm' | 'decline' | 'reschedule',
    validateBody: () =>
      | ConfirmBookingRequest
      | DeclineBookingRequest
      | RescheduleRequest,
  ): Observable<Booking> {
    return defer(() => {
      const id = validateResourceId(bookingId, 'bookingId');
      const body = validateBody();

      return this.http.post<unknown>(
        this.apiUrl.resolve(
          `${MANAGER_API}/bookings/${id}/${action}`,
        ),
        body,
      );
    }).pipe(
      map(response => validateBookingResponse(response)),
      map(booking => {
        if (
          booking.id.toLowerCase() !== bookingId.toLowerCase()
        ) {
          throw new BookingResponseError('booking.id');
        }

        return booking;
      }),
    );
  }
}
