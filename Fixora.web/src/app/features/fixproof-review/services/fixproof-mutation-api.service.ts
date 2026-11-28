import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

import { defer, map } from 'rxjs';
import type { Observable } from 'rxjs';

import { ApiUrlService } from '../../../core/config/api-url.service';

import type {
  AuthoritativeJobContext,
  ChangeRequestDto,
  FixProofActionEligibility,
  NoteRequest,
  PriceRequest,
  ProposalDto,
} from '../models/fixproof.model';

import {
  evaluateChangeRequestActionEligibility,
  evaluateProposalActionEligibility,
  evaluateProposalItemEditEligibility,
  evaluateProposalItemRevisionEligibility,
} from '../utils/fixproof-pricing.util';

import {
  FixProofResponseError,
  validateChangeRequestResponse,
  validateFixProofResourceId,
  validateOptionalNoteRequest,
  validatePriceRequest,
  validateProposalResponse,
  validateRequiredNoteRequest,
} from '../utils/fixproof.validator';

const APPROVALS_PATH = 'api/v1/manager/approvals';

/**
 * Thrown BEFORE any HTTP request when K06 action eligibility refuses the
 * action (backend state machine, frontend terminal/released-item safety, or
 * unresolved status). `requestSent` is always false, so the mutation is known
 * not to have been applied. The message is a fixed code, never backend text.
 */
export class FixProofActionBlockedError extends Error {
  readonly requestSent = false as const;

  constructor(
    readonly action: string,
    readonly eligibility: FixProofActionEligibility,
  ) {
    super(
      `FixProof action blocked: ${action} (${eligibility.reason ?? eligibility.status})`,
    );
    this.name = 'FixProofActionBlockedError';
  }
}

/**
 * Thrown BEFORE any HTTP request when the API origin configuration is
 * missing or invalid so no request URL can be resolved. `requestSent` is
 * always false, proving no HTTP mutation was sent.
 */
export class FixProofApiOriginError extends Error {
  readonly requestSent = false as const;

  constructor() {
    super('FixProof API origin is not configured or invalid');
    this.name = 'FixProofApiOriginError';
  }
}

/**
 * Caller-supplied current state used ONLY for the frontend eligibility gate.
 * `jobStatus` MUST come from the authoritative JobDetailDto (never inferred
 * from proposal status); a missing or unknown value blocks the action.
 */
export interface ProposalActionContext extends AuthoritativeJobContext {
  readonly proposalStatus: string;
}

export interface ProposalItemActionContext extends ProposalActionContext {
  readonly itemStatus: string;
}

export interface ChangeRequestActionContext extends AuthoritativeJobContext {
  readonly changeRequestStatus: string;
}

/** Price/quantity input; numbers or decimal strings, validated with exact BigInt rules. */
export interface PriceInput {
  readonly unitPrice: number | string;
  readonly qty: number | string;
}

const REVISE_RESULT_STATUSES: readonly string[] = [
  'AwaitingCustomer',
  'CustomerResponded',
  'ReleasedToMechanic',
];

function sameId(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function assertAllowed(
  action: string,
  eligibility: FixProofActionEligibility,
): void {
  if (!eligibility.frontendAllowed) {
    throw new FixProofActionBlockedError(action, eligibility);
  }
}

function resolveFixProofUrl(apiUrl: ApiUrlService, path: string): string {
  try {
    return apiUrl.resolve(path);
  } catch {
    throw new FixProofApiOriginError();
  }
}

/**
 * Manager FixProof mutations (typed, no retry, no optimistic updates).
 *
 * Verified backend contract (Fixora.SharedBackend), all under
 * `ApprovalsController` (`api/v1/manager/approvals`, policy `Staff`, see
 * ManagerControllers.cs lines 78-92). Route ids are `{id:guid}`:
 * - PUT  proposals/{id}/items/{itemId}/price  body `{unitPrice, qty}` -> ProposalDto
 *   (`SetPriceBeforeForward`: proposal must be PendingManagerReview; qty > 0,
 *   price >= 0; otherwise 409 `proposal_wrong_state` / 400 `validation_failed`).
 * - POST proposals/{id}/forward  body `{note?}` -> ProposalDto
 *   (PendingManagerReview -> AwaitingCustomer; job -> AwaitingCustomerApproval;
 *   publishes verified findings to the customer).
 * - POST proposals/{id}/return   body `{note}` (required) -> ProposalDto
 *   (PendingManagerReview -> ReturnedToMechanic; job -> Inspecting).
 * - PUT  proposals/{id}/items/{itemId}/revise body `{unitPrice, qty}` -> ProposalDto
 *   (`ReviseItem`, BR-FP-08: 409 `proposal_not_published` when Cancelled /
 *   ReturnedToMechanic / PendingManagerReview; bumps item Version; renewed
 *   approval when the item was not accepted, qty changed, or increase > 10%).
 * - POST proposals/{id}/release  body `{note?}` -> ProposalDto
 *   (CustomerResponded -> ReleasedToMechanic; job -> InProgress; consumes
 *   inventory for released items that have a part; queue recalculated).
 * - POST change-requests/{id}/forward body `{note?}` -> ChangeRequestDto
 *   (PendingManagerReview -> ForwardedToMechanic, else 409 `change_wrong_state`).
 * - POST change-requests/{id}/decline body `{note}` (required) -> ChangeRequestDto
 *   (PendingManagerReview -> Declined; 409 `change_wrong_state`).
 * Errors use `ApiErrorResponse`; `ValidationException` is HTTP 400, conflicts 409.
 *
 * Backend limitations (not worked around):
 * - No idempotency key or concurrency token exists on these endpoints.
 *   Only `RepairItem.Version` is an EF concurrency token (stale write ->
 *   409 `concurrency_conflict`). Client-side eligibility is advisory and gives
 *   NO atomic protection; the backend state machine is authoritative.
 * - The backend does not check job status for any of these actions. The
 *   frontend gate (terminal jobs, Released proposals/items, unresolved job
 *   status) is a deliberate extra safety layer, kept separate from
 *   `backendSupported` in the eligibility result.
 * - Release consumes inventory (`min(qty, stock)`, movement delta `-qty`) and
 *   revise can reopen approval; neither is idempotent. Billing is not touched
 *   by these endpoints (invoices are created on job completion).
 *
 * Mutation safety:
 * - Each call returns a COLD observable: one subscription = one request. The
 *   service never retries, replays, caches or updates state optimistically.
 * - Identifiers, body and eligibility are validated before any request.
 * - A successful HTTP response is reported as success ONLY if it validates
 *   and its identity/state matches the request; otherwise a
 *   `FixProofResponseError` is raised (classified as an UNCERTAIN outcome by
 *   the K06 mapper because the backend may have applied the change).
 * - Raw backend messages, tokens and signed URLs are never surfaced.
 */
@Injectable({
  providedIn: 'root',
})
export class FixProofMutationApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(ApiUrlService);

  /** Sets item price/quantity before forwarding (proposal must be PendingManagerReview). */
  setItemPrice(
    proposalId: string,
    itemId: string,
    price: PriceInput,
    context: ProposalItemActionContext,
  ): Observable<ProposalDto> {
    return defer(() => {
      const pid = validateFixProofResourceId(proposalId, 'proposalId');
      const iid = validateFixProofResourceId(itemId, 'itemId');
      const body = validatePriceRequest(price);

      const edit = evaluateProposalItemEditEligibility(
        context?.proposalStatus,
        context?.itemStatus,
        context,
      );

      assertAllowed(
        'set-price',
        edit.mode === 'set-price'
          ? edit.eligibility
          : evaluateProposalActionEligibility(
              context?.proposalStatus,
              'set-price',
              context,
            ),
      );

      return this.http
        .put<unknown>(
          resolveFixProofUrl(
            this.apiUrl,
            `${APPROVALS_PATH}/proposals/${pid}/items/${iid}/price`,
          ),
          this.priceBody(body),
        )
        .pipe(
          map(response =>
            this.verifyPricedProposal(response, pid, iid, body, [
              'PendingManagerReview',
            ]),
          ),
        );
    });
  }

  /** Revises a published item (BR-FP-08). The backend, not the client, decides renewed approval. */
  reviseItem(
    proposalId: string,
    itemId: string,
    price: PriceInput,
    context: ProposalItemActionContext,
  ): Observable<ProposalDto> {
    return defer(() => {
      const pid = validateFixProofResourceId(proposalId, 'proposalId');
      const iid = validateFixProofResourceId(itemId, 'itemId');
      const body = validatePriceRequest(price);

      assertAllowed(
        'revise',
        evaluateProposalItemRevisionEligibility(
          context?.proposalStatus,
          context?.itemStatus,
          context,
        ),
      );

      return this.http
        .put<unknown>(
          resolveFixProofUrl(
            this.apiUrl,
            `${APPROVALS_PATH}/proposals/${pid}/items/${iid}/revise`,
          ),
          this.priceBody(body),
        )
        .pipe(
          map(response =>
            this.verifyPricedProposal(
              response,
              pid,
              iid,
              body,
              REVISE_RESULT_STATUSES,
            ),
          ),
        );
    });
  }

  /** Forwards a PendingManagerReview proposal to the customer (note optional). */
  forwardProposal(
    proposalId: string,
    note: string | null | undefined,
    context: ProposalActionContext,
  ): Observable<ProposalDto> {
    return defer(() => {
      const pid = validateFixProofResourceId(proposalId, 'proposalId');
      const body = validateOptionalNoteRequest({ note });

      assertAllowed(
        'forward',
        evaluateProposalActionEligibility(
          context?.proposalStatus,
          'forward',
          context,
        ),
      );

      return this.http
        .post<unknown>(
          resolveFixProofUrl(
            this.apiUrl,
            `${APPROVALS_PATH}/proposals/${pid}/forward`,
          ),
          this.noteBody(body),
        )
        .pipe(
          map(response =>
            this.verifyNotedProposal(response, pid, 'AwaitingCustomer', body, true),
          ),
        );
    });
  }

  /** Returns a PendingManagerReview proposal to the mechanic (note required). */
  returnProposal(
    proposalId: string,
    note: string,
    context: ProposalActionContext,
  ): Observable<ProposalDto> {
    return defer(() => {
      const pid = validateFixProofResourceId(proposalId, 'proposalId');
      const body = validateRequiredNoteRequest({ note });

      assertAllowed(
        'return',
        evaluateProposalActionEligibility(
          context?.proposalStatus,
          'return',
          context,
        ),
      );

      return this.http
        .post<unknown>(
          resolveFixProofUrl(
            this.apiUrl,
            `${APPROVALS_PATH}/proposals/${pid}/return`,
          ),
          this.noteBody(body),
        )
        .pipe(
          map(response =>
            this.verifyNotedProposal(
              response,
              pid,
              'ReturnedToMechanic',
              body,
              true,
            ),
          ),
        );
    });
  }

  /** Releases a CustomerResponded proposal to the mechanic (note optional). Consumes inventory on the backend. */
  releaseProposal(
    proposalId: string,
    note: string | null | undefined,
    context: ProposalActionContext,
  ): Observable<ProposalDto> {
    return defer(() => {
      const pid = validateFixProofResourceId(proposalId, 'proposalId');
      const body = validateOptionalNoteRequest({ note });

      assertAllowed(
        'release',
        evaluateProposalActionEligibility(
          context?.proposalStatus,
          'release',
          context,
        ),
      );

      return this.http
        .post<unknown>(
          resolveFixProofUrl(
            this.apiUrl,
            `${APPROVALS_PATH}/proposals/${pid}/release`,
          ),
          this.noteBody(body),
        )
        .pipe(
          map(response =>
            this.verifyNotedProposal(
              response,
              pid,
              'ReleasedToMechanic',
              body,
              body.note !== null,
            ),
          ),
        );
    });
  }

  /** Forwards a PendingManagerReview change request to the mechanic (note optional). */
  forwardChangeRequest(
    changeRequestId: string,
    note: string | null | undefined,
    context: ChangeRequestActionContext,
  ): Observable<ChangeRequestDto> {
    return defer(() => {
      const id = validateFixProofResourceId(changeRequestId, 'changeRequestId');
      const body = validateOptionalNoteRequest({ note });

      assertAllowed(
        'forward-change-request',
        evaluateChangeRequestActionEligibility(
          context?.changeRequestStatus,
          'forward',
          context,
        ),
      );

      return this.http
        .post<unknown>(
          resolveFixProofUrl(
            this.apiUrl,
            `${APPROVALS_PATH}/change-requests/${id}/forward`,
          ),
          this.noteBody(body),
        )
        .pipe(
          map(response =>
            this.verifyChangeRequest(response, id, 'ForwardedToMechanic', body),
          ),
        );
    });
  }

  /** Declines a PendingManagerReview change request (reason required). */
  declineChangeRequest(
    changeRequestId: string,
    note: string,
    context: ChangeRequestActionContext,
  ): Observable<ChangeRequestDto> {
    return defer(() => {
      const id = validateFixProofResourceId(changeRequestId, 'changeRequestId');
      const body = validateRequiredNoteRequest({ note });

      assertAllowed(
        'decline-change-request',
        evaluateChangeRequestActionEligibility(
          context?.changeRequestStatus,
          'decline',
          context,
        ),
      );

      return this.http
        .post<unknown>(
          resolveFixProofUrl(
            this.apiUrl,
            `${APPROVALS_PATH}/change-requests/${id}/decline`,
          ),
          this.noteBody(body),
        )
        .pipe(
          map(response =>
            this.verifyChangeRequest(response, id, 'Declined', body),
          ),
        );
    });
  }

  private priceBody(body: PriceRequest): { unitPrice: number; qty: number } {
    return { unitPrice: body.unitPrice, qty: body.qty };
  }

  private noteBody(body: NoteRequest): { note: string | null } {
    return { note: body.note };
  }

  private verifyPricedProposal(
    response: unknown,
    proposalId: string,
    itemId: string,
    requested: PriceRequest,
    allowedStatuses: readonly string[],
  ): ProposalDto {
    const proposal = validateProposalResponse(response, 'proposal');

    if (!sameId(proposal.id, proposalId)) {
      throw new FixProofResponseError('proposal.id');
    }

    if (!allowedStatuses.includes(proposal.status)) {
      throw new FixProofResponseError('proposal.status');
    }

    const item = proposal.items.find(entry => sameId(entry.id, itemId));

    if (!item) {
      throw new FixProofResponseError('proposal.items');
    }

    if (item.unitPrice !== requested.unitPrice) {
      throw new FixProofResponseError('proposal.items.unitPrice');
    }

    if (item.qty !== requested.qty) {
      throw new FixProofResponseError('proposal.items.qty');
    }

    return proposal;
  }

  private verifyNotedProposal(
    response: unknown,
    proposalId: string,
    expectedStatus: string,
    note: NoteRequest,
    checkManagerNote: boolean,
  ): ProposalDto {
    const proposal = validateProposalResponse(response, 'proposal');

    if (!sameId(proposal.id, proposalId)) {
      throw new FixProofResponseError('proposal.id');
    }

    if (proposal.status !== expectedStatus) {
      throw new FixProofResponseError('proposal.status');
    }

    if (checkManagerNote && proposal.managerNote !== note.note) {
      throw new FixProofResponseError('proposal.managerNote');
    }

    return proposal;
  }

  private verifyChangeRequest(
    response: unknown,
    changeRequestId: string,
    expectedStatus: string,
    note: NoteRequest,
  ): ChangeRequestDto {
    const changeRequest = validateChangeRequestResponse(
      response,
      'changeRequest',
    );

    if (!sameId(changeRequest.id, changeRequestId)) {
      throw new FixProofResponseError('changeRequest.id');
    }

    if (changeRequest.status !== expectedStatus) {
      throw new FixProofResponseError('changeRequest.status');
    }

    if (changeRequest.managerNote !== note.note) {
      throw new FixProofResponseError('changeRequest.managerNote');
    }

    return changeRequest;
  }
}
