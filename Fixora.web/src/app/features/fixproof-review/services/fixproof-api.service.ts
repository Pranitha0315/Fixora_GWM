import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

import { defer, map } from 'rxjs';
import type { Observable } from 'rxjs';

import { ApiUrlService } from '../../../core/config/api-url.service';

import type {
  ChangeRequestDto,
  ChangeRequestListQuery,
  ProposalDto,
  ProposalListQuery,
} from '../models/fixproof.model';

import {
  validateChangeRequestListQuery,
  validateChangeRequestListResponse,
  validateProposalListQuery,
  validateProposalListResponse,
} from '../utils/fixproof.validator';

const PROPOSALS_PATH = 'api/v1/manager/approvals/proposals';
const CHANGE_REQUESTS_PATH = 'api/v1/manager/approvals/change-requests';

/**
 * Read-only Manager FixProof API (repair proposals and customer change requests).
 *
 * Verified backend contract (Fixora.SharedBackend):
 * - Fixora.Manager.Api/Controllers/ManagerControllers.cs (lines 78-92):
 *   `ApprovalsController`, route `api/v1/manager/approvals`, policy `Staff`
 *   inherited from `StaffControllerBase` (Manager, Owner, PlatformAdmin).
 *   - `GET proposals?status={string?}` returns `ProposalDto[]`.
 *   - `GET change-requests?pendingOnly={bool=false}` returns `ChangeRequestDto[]`.
 * - Fixora.Manager.Application/Approvals/ApprovalWorkflowService.cs
 *   `ListForStaffAsync` (lines 269-280):
 *   - A `status` that parses as a `ProposalStatus` (case-insensitive) filters
 *     to it; any other or absent value returns every proposal EXCEPT
 *     `Cancelled`. `Cancelled` is therefore only reachable via
 *     `status=Cancelled`.
 *   - Ordered by `SubmittedAt` descending, fixed cap `Take(100)`.
 * - Fixora.Manager.Application/Approvals/ChangeRequestService.cs
 *   `ListForStaffAsync` (lines 95-103): `pendingOnly` filters to
 *   `PendingManagerReview`; ordered by `CreatedAt` descending, fixed cap
 *   `Take(100)`.
 *
 * Backend limitations (not worked around here):
 * - There is NO endpoint for a single proposal or a single change request.
 *   Individual records are available only inside `JobDetailDto`
 *   (`GET api/v1/manager/jobs/{id}`), which is served by `JobCardApiService`.
 * - Lists have no pagination, offset, total or "has more" signal. A list of
 *   exactly 100 may be truncated. Nothing is fabricated.
 * - Proposal status is a proposal-level state only; it must never be used to
 *   infer the authoritative job status.
 *
 * Safety:
 * - Authentication is applied only by the existing auth interceptor for
 *   trusted API-origin requests; error normalization by the error interceptor.
 * - Read-only: no mutations, retries, caching or fallback data.
 * - Backend order is preserved exactly; responses are never re-sorted.
 * - Signed media URLs are never fetched.
 */
@Injectable({
  providedIn: 'root',
})
export class FixProofApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(ApiUrlService);

  /**
   * Lists repair proposals (backend-capped at 100, newest submission first).
   * `status` is optional and limited to known `ProposalStatus` values; when
   * omitted the backend returns all non-cancelled proposals.
   */
  getProposals(
    query?: ProposalListQuery,
  ): Observable<readonly ProposalDto[]> {
    return defer(() => {
      const validated = validateProposalListQuery(query);

      let params = new HttpParams();

      if (validated.status) {
        params = params.set('status', validated.status);
      }

      return this.http.get<unknown>(this.apiUrl.resolve(PROPOSALS_PATH), {
        params,
      });
    }).pipe(map(response => validateProposalListResponse(response)));
  }

  /**
   * Lists customer change requests (backend-capped at 100, newest first).
   * `pendingOnly` defaults to the backend default (`false`) and is always sent
   * explicitly.
   */
  getChangeRequests(
    query?: ChangeRequestListQuery,
  ): Observable<readonly ChangeRequestDto[]> {
    return defer(() => {
      const validated = validateChangeRequestListQuery(query);

      const params = new HttpParams().set(
        'pendingOnly',
        validated.pendingOnly === true ? 'true' : 'false',
      );

      return this.http.get<unknown>(
        this.apiUrl.resolve(CHANGE_REQUESTS_PATH),
        { params },
      );
    }).pipe(
      map(response => validateChangeRequestListResponse(response)),
    );
  }
}
