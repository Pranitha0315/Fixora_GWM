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

import { BookingActionApiService } from '../../bookings/services/booking-action-api.service';

import type {
  BayDto,
  JobSummaryDto,
  MechanicRosterDto,
} from '../../bookings/models/booking-support.model';

import {
  validateAdaptiveQueueBaysResponse,
  validateAdaptiveQueueJobsResponse,
} from '../utils/adaptive-queue.validator';

const MANAGER_API = 'api/v1/manager';

/**
 * Read-only HTTP access for the Adaptive Queue board.
 *
 * - Every request goes through HttpClient, so the existing error
 *   and authentication interceptors apply. No headers are set here.
 * - Failures are never swallowed or converted to empty results,
 *   and there are no retries. Unsubscribing cancels the request.
 * - Responses are validated, never repaired. Order, queuePosition,
 *   priority and etaAt are returned exactly as the backend sent them.
 * - Mutations (reorder, extend, assign, walk-in) are intentionally
 *   not part of this service.
 *
 * Deferred read operations (not required by the confirmed scope):
 * GET api/v1/manager/jobs/{id} and GET api/v1/manager/settings.
 */
@Injectable({
  providedIn: 'root',
})
export class AdaptiveQueueApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(ApiUrlService);
  private readonly bookingActions = inject(BookingActionApiService);

  /**
   * GET api/v1/manager/jobs?activeOnly=true
   *
   * The backend returns at most 200 jobs with no pagination, so
   * no paging parameters are sent and nothing is truncated here.
   */
  getActiveJobs(): Observable<readonly JobSummaryDto[]> {
    return defer(() =>
      this.http.get<unknown>(
        this.apiUrl.resolve(`${MANAGER_API}/jobs`),
        {
          params: new HttpParams().set('activeOnly', 'true'),
        },
      ),
    ).pipe(
      map(validateAdaptiveQueueJobsResponse),
    );
  }

  /**
   * GET api/v1/manager/settings/bays
   *
   * Delegates to the existing Day 04 service, then applies the
   * adaptive queue duplicate bay identity check. Active and
   * inactive bays are returned in backend order.
   */
  getBays(): Observable<readonly BayDto[]> {
    return this.bookingActions.getBays().pipe(
      map(validateAdaptiveQueueBaysResponse),
    );
  }

  /**
   * GET api/v1/manager/mechanics
   *
   * Independent of the jobs and bays requests.
   */
  getMechanics(): Observable<readonly MechanicRosterDto[]> {
    return this.bookingActions.getMechanics();
  }
}
