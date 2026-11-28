import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

import { defer, map } from 'rxjs';
import type { Observable } from 'rxjs';

import { ApiUrlService } from '../../../core/config/api-url.service';

import type {
  JobDetailDto,
  JobListQuery,
  JobSummaryDto,
} from '../models/job-card.model';

import {
  JobCardResponseError,
  validateJobCardId,
  validateJobCardListResponse,
  validateJobDetailResponse,
  validateJobListQuery,
} from '../utils/job-card.validator';

const JOBS_PATH = 'api/v1/manager/jobs';

/**
 * Read-only Manager Job Cards API.
 *
 * Verified backend contract (Fixora.SharedBackend):
 * - Fixora.Manager.Api/Controllers/ManagerControllers.cs
 *   (`JobsController`, route `api/v1/manager/jobs`, policy `Staff`
 *   inherited from `StaffControllerBase`):
 *   - `GET api/v1/manager/jobs?activeOnly={bool=true}&customerId={guid?}`
 *     returns `JobSummaryDto[]`.
 *   - `GET api/v1/manager/jobs/{id:guid}` returns `JobDetailDto`.
 * - Fixora.Manager.Application/Jobs/JobService.cs:
 *   - `ListAsync` orders terminal jobs last, then by `QueuePosition`,
 *     then newest first, and applies a fixed `Take(200)` cap.
 *     There is NO pagination, offset, total count or "has more"
 *     signal, so a list of exactly 200 may be truncated. This service
 *     never fabricates paging or totals.
 *   - `GetAsync` throws NotFound for an unknown id.
 * - Fixora.Shared.Infrastructure/Web/ErrorHandlingMiddleware.cs: errors use
 *   the shared `ApiErrorResponse`; the global error interceptor already
 *   normalizes them, and raw backend messages are never surfaced here.
 *
 * Safety:
 * - Authentication is applied only by the existing auth interceptor for
 *   trusted API-origin requests. No token is handled here.
 * - Read-only: no mutations, retries, caching or fallback data.
 * - Signed media URLs inside `issues[].mediaUrls` are only validated
 *   structurally by the K06 validator; they are never fetched or opened.
 */
@Injectable({
  providedIn: 'root',
})
export class JobCardApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(ApiUrlService);

  /**
   * Retrieves job cards (backend-capped at 200, ordered by the backend).
   * `activeOnly` defaults to the backend default (`true`) and is always sent
   * explicitly. `customerId` is sent only when provided.
   */
  getJobCards(
    query?: JobListQuery,
  ): Observable<readonly JobSummaryDto[]> {
    return defer(() => {
      const validated = validateJobListQuery(query);

      let params = new HttpParams().set(
        'activeOnly',
        validated.activeOnly === false ? 'false' : 'true',
      );

      if (validated.customerId) {
        params = params.set('customerId', validated.customerId);
      }

      return this.http.get<unknown>(this.apiUrl.resolve(JOBS_PATH), {
        params,
      });
    }).pipe(map(response => validateJobCardListResponse(response)));
  }

  /** Retrieves one job card detail and requires the response to match the requested id. */
  getJobCard(jobId: string): Observable<JobDetailDto> {
    return defer(() => {
      const id = validateJobCardId(jobId);

      return this.http
        .get<unknown>(this.apiUrl.resolve(`${JOBS_PATH}/${id}`))
        .pipe(
          map(response => {
            const detail = validateJobDetailResponse(response);

            if (detail.job.id.toLowerCase() !== id.toLowerCase()) {
              throw new JobCardResponseError('jobDetail.job.id');
            }

            return detail;
          }),
        );
    });
  }
}
