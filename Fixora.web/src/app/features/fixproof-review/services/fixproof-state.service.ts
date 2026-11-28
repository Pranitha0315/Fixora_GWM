import {
  computed,
  effect,
  inject,
  Injectable,
  signal,
  untracked,
} from '@angular/core';

import type {
  EffectRef,
  OnDestroy,
  Signal,
  WritableSignal,
} from '@angular/core';

import { defer, Subscription } from 'rxjs';
import type { Observable } from 'rxjs';

import { SessionService } from '../../../core/auth/session.service';
import { ApiError } from '../../../core/models/api-error.model';
import type { AuthSession } from '../../../core/models/auth-session.model';

import type {
  JobCardsErrorResolution,
  JobDetailDto,
} from '../../job-cards/models/job-card.model';
import {
  Day06AuthorizationCoordinatorService,
  type Day06ForbiddenEvent,
} from '../../job-cards/services/day06-authorization-coordinator.service';
import { JobCardApiService } from '../../job-cards/services/job-card-api.service';
import { resolveJobCardsError } from '../../job-cards/utils/job-card-error.mapper';

import {
  FIXPROOF_CHANGE_REQUESTS_LIST_LIMIT,
  FIXPROOF_PROPOSALS_LIST_LIMIT,
} from '../models/fixproof.model';
import type {
  AuditDto,
  ChangeRequestDto,
  FixProofActionEligibility,
  FixProofErrorResolution,
  ProposalDto,
  ProposalStatus,
  RepairItemDto,
} from '../models/fixproof.model';

import { resolveFixProofError } from '../utils/fixproof-error.mapper';
import {
  calculateLineAmountCents,
  evaluateChangeRequestActionEligibility,
  evaluateProposalActionEligibility,
  evaluateProposalItemEditEligibility,
  evaluateProposalItemRevisionEligibility,
  formatCents,
  isKnownRepairItemStatus,
  parseMoneyToCents,
} from '../utils/fixproof-pricing.util';
import {
  FixProofRequestError,
  FixProofResponseError,
  validateChangeRequestListQuery,
  validateFixProofResourceId,
  validateProposalListQuery,
} from '../utils/fixproof.validator';

import { FixProofApiService } from './fixproof-api.service';

/**
 * How often the local session validity is re-checked. This timer never
 * performs HTTP.
 */
export const FIXPROOF_STATE_CHECK_INTERVAL_MS = 15_000;

export type FixProofStateError =
  | FixProofErrorResolution
  | JobCardsErrorResolution;

export type FixProofListViewState =
  | 'idle'
  | 'loading'
  | 'error'
  | 'empty'
  | 'ready';

export type FixProofSelectionKind = 'proposal' | 'change-request';

/**
 * - `none`: nothing selected.
 * - `loading` / `error`: authoritative JobDetail not available yet / failed.
 * - `job-not-found`: HTTP 404 for the selected record's job.
 * - `entity-missing`: the JobDetail does not contain the selected entity.
 * - `entity-mismatch`: job identity, entity job association or entity
 *   uniqueness could not be verified; no entity is exposed.
 * - `ready`: entity found inside the authoritative JobDetail and verified.
 */
export type FixProofSelectionState =
  | 'none'
  | 'loading'
  | 'error'
  | 'job-not-found'
  | 'entity-missing'
  | 'entity-mismatch'
  | 'ready';

export type FixProofEntityExistence = 'confirmed' | 'absent' | 'unknown';

export type FixProofStaleReason = 'refresh-failed';

/** HTTP 401 (authentication) or HTTP 403 (authorization) observed by any FixProof service. */
export type FixProofAccessRevocationKind = 'unauthorized' | 'forbidden';

/**
 * Why advisory eligibility can or cannot be trusted right now.
 * Only `ready` allows an eligibility result to count as action-ready.
 */
export type FixProofActionContextState =
  | 'ready'
  | 'no-selection'
  | 'session-invalid'
  | 'loading'
  | 'detail-unavailable'
  | 'stale'
  | 'entity-unresolved';

export interface FixProofSelection {
  readonly kind: FixProofSelectionKind;
  readonly id: string;
  /** Job identity taken from the validated list record. */
  readonly jobCardId: string;
}

/** Backend-supported server filter (`GET approvals/proposals?status=`). */
export interface FixProofProposalServerFilter {
  /** null = backend default: every proposal EXCEPT Cancelled. */
  readonly status: ProposalStatus | null;
}

/** Backend-supported server filter (`GET approvals/change-requests?pendingOnly=`). */
export interface FixProofChangeRequestServerFilter {
  readonly pendingOnly: boolean;
}

/** Client-side filters, applied to loaded rows only. Never sent to the backend. */
export interface FixProofLocalFilter {
  readonly search: string;
  readonly status: string | null;
}

export type FixProofPricingDiagnosticCode =
  | 'line-amount-mismatch'
  | 'total-mismatch'
  | 'approved-total-mismatch'
  | 'unverifiable-amount'
  | 'unverifiable-approved-total';

export interface FixProofPricingDiagnostic {
  readonly code: FixProofPricingDiagnosticCode;
  readonly itemId: string | null;
  /** Fixed safe text; never contains backend strings. */
  readonly message: string;
}

export interface FixProofPricedItem {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly status: string;
  readonly qty: number;
  readonly version: number;
  readonly linkedIssueId: string | null;
  readonly unitPrice: number;
  readonly unitPriceFormatted: string | null;
  /** Backend-reported line amount (authoritative). */
  readonly amount: number;
  readonly amountFormatted: string | null;
  /** Exact qty x unit price, for comparison only. Null when unverifiable. */
  readonly calculatedAmountFormatted: string | null;
  /** True/false when verifiable, null when it cannot be verified. */
  readonly amountMatchesCalculation: boolean | null;
}

export interface FixProofPricingReview {
  readonly proposalId: string;
  readonly status: string;
  readonly items: readonly FixProofPricedItem[];
  /** Backend-reported totals, never replaced by local calculations. */
  readonly backendTotal: number;
  readonly backendTotalFormatted: string | null;
  readonly backendApprovedTotal: number;
  readonly backendApprovedTotalFormatted: string | null;
  /** Exact sum of the backend line amounts (Approvals.cs: Total = sum of Amount). */
  readonly itemsAmountSumFormatted: string | null;
  /** Exact sum of Approved/Released backend line amounts. */
  readonly approvedItemsAmountSumFormatted: string | null;
  readonly totalMatches: boolean | null;
  readonly approvedTotalMatches: boolean | null;
  readonly diagnostics: readonly FixProofPricingDiagnostic[];
  readonly managerNote: string | null;
  readonly mechanicNote: string | null;
  readonly customerNote: string | null;
  readonly audit: readonly AuditDto[];
}

/**
 * Advisory only. Eligibility is derived from the last loaded authoritative
 * JobDetail and does NOT provide atomic concurrency protection: the backend
 * state machine remains the only authority at execution time.
 */
export interface FixProofAdvisoryEligibility {
  readonly eligibility: FixProofActionEligibility;
  readonly contextState: FixProofActionContextState;
  /** True only for a fresh, verified context AND an allowed eligibility. */
  readonly actionReady: boolean;
}

export interface FixProofItemActionAvailability {
  readonly itemId: string;
  readonly setPrice: FixProofAdvisoryEligibility;
  readonly revise: FixProofAdvisoryEligibility;
}

export interface FixProofProposalActionAvailability {
  readonly advisory: true;
  readonly proposalId: string;
  readonly contextState: FixProofActionContextState;
  readonly forward: FixProofAdvisoryEligibility;
  readonly returnToMechanic: FixProofAdvisoryEligibility;
  readonly release: FixProofAdvisoryEligibility;
  readonly items: readonly FixProofItemActionAvailability[];
}

export interface FixProofChangeRequestActionAvailability {
  readonly advisory: true;
  readonly changeRequestId: string;
  readonly contextState: FixProofActionContextState;
  readonly forward: FixProofAdvisoryEligibility;
  readonly decline: FixProofAdvisoryEligibility;
}

interface Lane {
  generation: number;
  subscription: Subscription | null;
  readonly loading: WritableSignal<boolean>;
  /** Incremented only by an explicit manager cancellation of this lane. */
  readonly cancellations: WritableSignal<number>;
}

interface EntityResolution {
  readonly state: 'ready' | 'missing' | 'mismatch';
  readonly proposal: ProposalDto | null;
  readonly changeRequest: ChangeRequestDto | null;
}

const NO_PROPOSALS: readonly ProposalDto[] = [];
const NO_CHANGE_REQUESTS: readonly ChangeRequestDto[] = [];
const NO_STRINGS: readonly string[] = [];
const NO_AUDIT: readonly AuditDto[] = [];

const DEFAULT_PROPOSAL_FILTER: FixProofProposalServerFilter = {
  status: null,
};

const DEFAULT_CHANGE_REQUEST_FILTER: FixProofChangeRequestServerFilter = {
  pendingOnly: false,
};

const DEFAULT_LOCAL_FILTER: FixProofLocalFilter = {
  search: '',
  status: null,
};

/** Fixed, safe resolution used when the session ends, expires or is unavailable. */
const SESSION_ENDED: FixProofErrorResolution = resolveFixProofError(
  new ApiError(401, 'UNAUTHORIZED', 'Session ended'),
  'read',
);

/**
 * Fixed resolution for a read the manager cancelled locally. Never an HTTP
 * 401/403 and never reported to the authorization coordinator.
 */
const REQUEST_CANCELLED: FixProofStateError = {
  ...resolveFixProofError(new Error('Request cancelled'), 'read'),
  message: 'The request was cancelled. Refresh to try again.',
};

/** Fixed, safe resolutions for a feature-scoped HTTP 401/403 revocation. */
const ACCESS_REVOKED: Readonly<
  Record<FixProofAccessRevocationKind, FixProofErrorResolution>
> = {
  unauthorized: resolveFixProofError(
    new ApiError(401, 'UNAUTHORIZED', 'Access revoked'),
    'read',
  ),
  forbidden: resolveFixProofError(
    new ApiError(403, 'FORBIDDEN', 'Access revoked'),
    'read',
  ),
};

const PRICING_MESSAGES: Record<FixProofPricingDiagnosticCode, string> = {
  'line-amount-mismatch':
    'A line amount differs from quantity x unit price. The backend amount is shown.',
  'total-mismatch':
    'The proposal total differs from the sum of its line amounts. The backend total is shown.',
  'approved-total-mismatch':
    'The approved total differs from the sum of approved line amounts. The backend total is shown.',
  'unverifiable-amount':
    'A price or amount could not be verified exactly. The backend value is shown.',
  'unverifiable-approved-total':
    'The approved total could not be verified because an item status is unrecognized.',
};

const CONTEXT_MESSAGES: Record<
  Exclude<FixProofActionContextState, 'ready'>,
  string
> = {
  'no-selection': 'Select a record before checking available actions.',
  'session-invalid': 'The session is not valid. Sign in again.',
  loading: 'Authoritative job details are loading. Wait before acting.',
  'detail-unavailable':
    'Authoritative job details are unavailable. Refresh before acting.',
  stale:
    'Job details could not be refreshed and may be outdated. Refresh before acting.',
  'entity-unresolved':
    'The selected record could not be verified in the job details. Refresh before acting.',
};

function sameId(left: string | null, right: string | null): boolean {
  return (
    left !== null &&
    right !== null &&
    left.toLowerCase() === right.toLowerCase()
  );
}

function includesText(value: string | null, needle: string): boolean {
  return value !== null && value.toLowerCase().includes(needle);
}

function createLane(): Lane {
  return {
    generation: 0,
    subscription: null,
    loading: signal(false),
    cancellations: signal(0),
  };
}

function distinct(values: Iterable<string>): readonly string[] {
  return [...new Set(values)];
}

function proposalMatches(proposal: ProposalDto, needle: string): boolean {
  return (
    includesText(proposal.jobNumber, needle) ||
    includesText(proposal.vehicleLabel, needle) ||
    includesText(proposal.customerName, needle) ||
    includesText(proposal.mechanicName, needle) ||
    includesText(proposal.status, needle) ||
    proposal.items.some(item => includesText(item.title, needle))
  );
}

function changeRequestMatches(
  request: ChangeRequestDto,
  needle: string,
): boolean {
  return (
    includesText(request.number, needle) ||
    includesText(request.jobNumber, needle) ||
    includesText(request.status, needle) ||
    includesText(request.details, needle) ||
    request.changes.some(change => includesText(change, needle))
  );
}

function priceItem(item: RepairItemDto): {
  readonly priced: FixProofPricedItem;
  readonly amountCents: bigint | null;
} {
  const unit = parseMoneyToCents(item.unitPrice);
  const amount = parseMoneyToCents(item.amount);
  const calculated = unit.ok
    ? calculateLineAmountCents(unit.cents, item.qty)
    : null;

  return {
    amountCents: amount.ok ? amount.cents : null,
    priced: {
      id: item.id,
      title: item.title,
      kind: item.kind,
      status: item.status,
      qty: item.qty,
      version: item.version,
      linkedIssueId: item.linkedIssueId,
      unitPrice: item.unitPrice,
      unitPriceFormatted: unit.ok ? unit.formatted : null,
      amount: item.amount,
      amountFormatted: amount.ok ? amount.formatted : null,
      calculatedAmountFormatted:
        calculated === null ? null : formatCents(calculated),
      amountMatchesCalculation:
        calculated === null || !amount.ok
          ? null
          : calculated === amount.cents,
    },
  };
}

/**
 * Read-only pricing review for an authoritative proposal. Calculations use
 * the K06 exact (BigInt cents) utilities. Backend totals are always shown as
 * reported; a discrepancy only adds a safe diagnostic.
 *
 * Backend contract (Approvals.cs): `Total` = sum of item `Amount`;
 * `ApprovedTotal` = sum of Approved/Released item `Amount`;
 * `Amount` = `Qty x UnitPrice`.
 */
export function analyzeProposalPricing(
  proposal: ProposalDto,
): FixProofPricingReview {
  const diagnostics: FixProofPricingDiagnostic[] = [];
  const items: FixProofPricedItem[] = [];
  let sum: bigint | null = 0n;
  let approvedSum: bigint | null = 0n;
  let statusesKnown = true;

  for (const item of proposal.items) {
    const { priced, amountCents } = priceItem(item);

    items.push(priced);

    if (priced.amountMatchesCalculation === false) {
      diagnostics.push({
        code: 'line-amount-mismatch',
        itemId: item.id,
        message: PRICING_MESSAGES['line-amount-mismatch'],
      });
    } else if (
      priced.amountMatchesCalculation === null ||
      priced.unitPriceFormatted === null
    ) {
      diagnostics.push({
        code: 'unverifiable-amount',
        itemId: item.id,
        message: PRICING_MESSAGES['unverifiable-amount'],
      });
    }

    if (!isKnownRepairItemStatus(item.status)) {
      statusesKnown = false;
    }

    if (amountCents === null) {
      sum = null;
      approvedSum = null;
      continue;
    }

    if (sum !== null) {
      sum += amountCents;
    }

    if (
      approvedSum !== null &&
      (item.status === 'Approved' || item.status === 'Released')
    ) {
      approvedSum += amountCents;
    }
  }

  const total = parseMoneyToCents(proposal.total);
  const approved = parseMoneyToCents(proposal.approvedTotal);

  const totalMatches =
    sum === null || !total.ok ? null : sum === total.cents;

  if (totalMatches === false) {
    diagnostics.push({
      code: 'total-mismatch',
      itemId: null,
      message: PRICING_MESSAGES['total-mismatch'],
    });
  }

  let approvedTotalMatches: boolean | null = null;

  if (!statusesKnown) {
    diagnostics.push({
      code: 'unverifiable-approved-total',
      itemId: null,
      message: PRICING_MESSAGES['unverifiable-approved-total'],
    });
  } else if (approvedSum !== null && approved.ok) {
    approvedTotalMatches = approvedSum === approved.cents;

    if (!approvedTotalMatches) {
      diagnostics.push({
        code: 'approved-total-mismatch',
        itemId: null,
        message: PRICING_MESSAGES['approved-total-mismatch'],
      });
    }
  }

  return {
    proposalId: proposal.id,
    status: proposal.status,
    items,
    backendTotal: proposal.total,
    backendTotalFormatted: total.ok ? total.formatted : null,
    backendApprovedTotal: proposal.approvedTotal,
    backendApprovedTotalFormatted: approved.ok ? approved.formatted : null,
    itemsAmountSumFormatted: sum === null ? null : formatCents(sum),
    approvedItemsAmountSumFormatted:
      statusesKnown && approvedSum !== null
        ? formatCents(approvedSum)
        : null,
    totalMatches,
    approvedTotalMatches,
    diagnostics,
    managerNote: proposal.managerNote,
    mechanicNote: proposal.mechanicNote,
    customerNote: proposal.customerNote,
    audit: proposal.audit,
  };
}

/**
 * Feature-scoped, READ-ONLY state for Manager FixProof review.
 *
 * Provide it on the page component so its lifetime, in-flight requests and
 * timer end with the page (intentionally not `providedIn: 'root'`). It only
 * uses `FixProofApiService` (reads) and `JobCardApiService.getJobCard`; the
 * mutation API is neither injected nor called. Angular signals + RxJS only.
 *
 * Backend contract (ApprovalWorkflowService / ChangeRequestService):
 * - Proposals: `status` filters to one known status; when absent the backend
 *   returns every proposal EXCEPT `Cancelled`, so the default result is never
 *   described as complete. `Cancelled` is reachable only via an explicit
 *   filter. Newest submission first, capped at 100, no paging or totals.
 * - Change requests: only `pendingOnly` is supported server-side. Newest
 *   first, capped at 100, no paging or totals.
 * - There is NO endpoint for a single proposal or change request. The only
 *   authoritative detail is the record inside `JobDetailDto`, loaded through
 *   the selected list record's job id. List records are never authoritative.
 *   Exactly one JobDetail request is made per selection or explicit refresh;
 *   never one per list row.
 *
 * Three independent request lanes (proposals, change requests, detail) each
 * use a generation counter and are unsubscribed when superseded. Everything
 * protected is bound to the exact session instance and cleared on logout,
 * expiry or replacement. No browser storage, no logging.
 *
 * HTTP 401/403, whether from these reads or reported by a collaborator through
 * `revokeFeatureAccess`, clears all protected state synchronously without any
 * request and latches the revocation to the session instance that received
 * it. The global session is not changed (the interceptors never end it on
 * 401), so every read stays refused until a different valid session exists.
 */
@Injectable()
export class FixProofStateService implements OnDestroy {
  private readonly fixProofApi = inject(FixProofApiService);
  private readonly jobApi = inject(JobCardApiService);
  private readonly sessionService = inject(SessionService);
  private readonly authCoordinator = inject(
    Day06AuthorizationCoordinatorService,
  );

  private readonly proposalLane = createLane();
  private readonly changeLane = createLane();
  private readonly detailLane = createLane();

  private readonly proposalRows = signal<readonly ProposalDto[] | null>(
    null,
  );
  private readonly proposalRawTruncated = signal(false);
  private readonly proposalInitialFailure =
    signal<FixProofStateError | null>(null);
  private readonly proposalRefreshFailure =
    signal<FixProofStateError | null>(null);
  private readonly proposalSyncedAt = signal<Date | null>(null);
  private readonly proposalServerFilter =
    signal<FixProofProposalServerFilter>(DEFAULT_PROPOSAL_FILTER);
  private readonly proposalLocalFilter =
    signal<FixProofLocalFilter>(DEFAULT_LOCAL_FILTER);

  private readonly changeRows = signal<
    readonly ChangeRequestDto[] | null
  >(null);
  private readonly changeRawTruncated = signal(false);
  private readonly changeInitialFailure =
    signal<FixProofStateError | null>(null);
  private readonly changeRefreshFailure =
    signal<FixProofStateError | null>(null);
  private readonly changeSyncedAt = signal<Date | null>(null);
  private readonly changeServerFilter =
    signal<FixProofChangeRequestServerFilter>(DEFAULT_CHANGE_REQUEST_FILTER);
  private readonly changeLocalFilter =
    signal<FixProofLocalFilter>(DEFAULT_LOCAL_FILTER);

  private readonly selection = signal<FixProofSelection | null>(null);
  private readonly detailState = signal<JobDetailDto | null>(null);
  private readonly detailInitialFailure =
    signal<FixProofStateError | null>(null);
  private readonly detailRefreshFailure =
    signal<FixProofStateError | null>(null);
  private readonly detailSyncedAt = signal<Date | null>(null);

  private readonly accessFailure = signal<FixProofStateError | null>(null);
  private readonly inputFailure = signal<FixProofStateError | null>(null);
  private readonly boundSession = signal<AuthSession | null>(null);
  /** Session instance that received HTTP 401/403; null when not revoked. */
  private readonly revokedFor = signal<{
    readonly session: AuthSession | null;
  } | null>(null);
  private readonly clockMs = signal(Date.now());

  private destroyed = false;
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private lastObservedSession: AuthSession | null = null;

  private readonly unregisterAuthListener = this.authCoordinator.registerListener(
    revokedSession => {
      this.handleCrossFeatureUnauthorized(revokedSession);
    },
  );

  private readonly unregisterForbiddenListener =
    this.authCoordinator.registerForbiddenListener(event => {
      this.handleCoordinatorForbidden(event);
    });

  private readonly sessionWatcher: EffectRef = effect(() => {
    this.sessionService.session();
    untracked(() => {
      this.enforceSession();
    });
  });

  constructor() {
    this.lastObservedSession = this.currentSession();
    this.syncRevocationFromCoordinator();
  }

  // ------------------------------------------------------- proposal list

  /** Backend rows in backend order; null before the first successful load. */
  readonly proposals: Signal<readonly ProposalDto[] | null> =
    this.proposalRows.asReadonly();

  readonly proposalFilter: Signal<FixProofProposalServerFilter> =
    this.proposalServerFilter.asReadonly();

  readonly proposalLocalFilters: Signal<FixProofLocalFilter> =
    this.proposalLocalFilter.asReadonly();

  /**
   * Whether the loaded rows can include Cancelled proposals. False for the
   * default backend scope, which excludes them and is NOT "all proposals".
   */
  readonly proposalListIncludesCancelled: Signal<boolean> = computed(
    () => this.proposalServerFilter().status === 'Cancelled',
  );

  readonly visibleProposals: Signal<readonly ProposalDto[]> = computed(
    () => {
      const source = this.proposalRows();

      if (source === null) {
        return NO_PROPOSALS;
      }

      const { search, status } = this.proposalLocalFilter();
      const needle = search.trim().toLowerCase();

      if (!needle && status === null) {
        return source;
      }

      return source.filter(
        proposal =>
          (status === null || proposal.status === status) &&
          (!needle || proposalMatches(proposal, needle)),
      );
    },
  );

  readonly proposalStatusOptions: Signal<readonly string[]> = computed(
    () => distinct((this.proposalRows() ?? NO_PROPOSALS).map(p => p.status)),
  );

  readonly possiblyTruncatedProposals: Signal<boolean> = computed(
    () =>
      this.proposalRawTruncated() ||
      (this.proposalRows()?.length ?? 0) >= FIXPROOF_PROPOSALS_LIST_LIMIT,
  );

  readonly isProposalsLoading: Signal<boolean> =
    this.proposalLane.loading.asReadonly();

  /** Count of explicit `cancelProposalsRequest()` cancellations. */
  readonly proposalsCancellations: Signal<number> =
    this.proposalLane.cancellations.asReadonly();

  readonly isProposalsInitialLoading: Signal<boolean> = computed(
    () => this.proposalLane.loading() && this.proposalRows() === null,
  );

  readonly isProposalsRefreshing: Signal<boolean> = computed(
    () => this.proposalLane.loading() && this.proposalRows() !== null,
  );

  readonly proposalsEmpty: Signal<boolean> = computed(
    () => this.proposalRows()?.length === 0,
  );

  readonly proposalsFilteredEmpty: Signal<boolean> = computed(
    () =>
      (this.proposalRows()?.length ?? 0) > 0 &&
      this.visibleProposals().length === 0,
  );

  readonly hasProposalLocalFilters: Signal<boolean> = computed(() => {
    const filter = this.proposalLocalFilter();

    return filter.search.trim() !== '' || filter.status !== null;
  });

  readonly proposalsError: Signal<FixProofStateError | null> = computed(
    () => this.accessFailure() ?? this.proposalInitialFailure(),
  );

  readonly proposalsRefreshError: Signal<FixProofStateError | null> =
    this.proposalRefreshFailure.asReadonly();

  readonly proposalsStaleReason: Signal<FixProofStaleReason | null> =
    computed(() =>
      this.proposalRows() !== null && this.proposalRefreshFailure() !== null
        ? 'refresh-failed'
        : null,
    );

  readonly isProposalsStale: Signal<boolean> = computed(
    () => this.proposalsStaleReason() !== null,
  );

  readonly proposalsLastSyncedAt: Signal<Date | null> =
    this.proposalSyncedAt.asReadonly();

  readonly proposalsViewState: Signal<FixProofListViewState> = computed(
    () => {
      if (this.proposalRows() === null) {
        if (this.proposalLane.loading()) {
          return 'loading';
        }

        return this.proposalsError() !== null ? 'error' : 'idle';
      }

      return this.proposalsEmpty() ? 'empty' : 'ready';
    },
  );

  // ------------------------------------------------- change request list

  readonly changeRequests: Signal<readonly ChangeRequestDto[] | null> =
    this.changeRows.asReadonly();

  readonly changeRequestFilter: Signal<FixProofChangeRequestServerFilter> =
    this.changeServerFilter.asReadonly();

  readonly changeRequestLocalFilters: Signal<FixProofLocalFilter> =
    this.changeLocalFilter.asReadonly();

  readonly visibleChangeRequests: Signal<readonly ChangeRequestDto[]> =
    computed(() => {
      const source = this.changeRows();

      if (source === null) {
        return NO_CHANGE_REQUESTS;
      }

      const { search, status } = this.changeLocalFilter();
      const needle = search.trim().toLowerCase();

      if (!needle && status === null) {
        return source;
      }

      return source.filter(
        request =>
          (status === null || request.status === status) &&
          (!needle || changeRequestMatches(request, needle)),
      );
    });

  readonly changeRequestStatusOptions: Signal<readonly string[]> = computed(
    () =>
      distinct((this.changeRows() ?? NO_CHANGE_REQUESTS).map(c => c.status)),
  );

  readonly possiblyTruncatedChangeRequests: Signal<boolean> = computed(
    () =>
      this.changeRawTruncated() ||
      (this.changeRows()?.length ?? 0) >=
        FIXPROOF_CHANGE_REQUESTS_LIST_LIMIT,
  );

  readonly isChangeRequestsLoading: Signal<boolean> =
    this.changeLane.loading.asReadonly();

  /** Count of explicit `cancelChangeRequestsRequest()` cancellations. */
  readonly changeRequestsCancellations: Signal<number> =
    this.changeLane.cancellations.asReadonly();

  readonly isChangeRequestsInitialLoading: Signal<boolean> = computed(
    () => this.changeLane.loading() && this.changeRows() === null,
  );

  readonly isChangeRequestsRefreshing: Signal<boolean> = computed(
    () => this.changeLane.loading() && this.changeRows() !== null,
  );

  readonly changeRequestsEmpty: Signal<boolean> = computed(
    () => this.changeRows()?.length === 0,
  );

  readonly changeRequestsFilteredEmpty: Signal<boolean> = computed(
    () =>
      (this.changeRows()?.length ?? 0) > 0 &&
      this.visibleChangeRequests().length === 0,
  );

  readonly hasChangeRequestLocalFilters: Signal<boolean> = computed(() => {
    const filter = this.changeLocalFilter();

    return filter.search.trim() !== '' || filter.status !== null;
  });

  readonly changeRequestsError: Signal<FixProofStateError | null> = computed(
    () => this.accessFailure() ?? this.changeInitialFailure(),
  );

  readonly changeRequestsRefreshError: Signal<FixProofStateError | null> =
    this.changeRefreshFailure.asReadonly();

  readonly changeRequestsStaleReason: Signal<FixProofStaleReason | null> =
    computed(() =>
      this.changeRows() !== null && this.changeRefreshFailure() !== null
        ? 'refresh-failed'
        : null,
    );

  readonly isChangeRequestsStale: Signal<boolean> = computed(
    () => this.changeRequestsStaleReason() !== null,
  );

  readonly changeRequestsLastSyncedAt: Signal<Date | null> =
    this.changeSyncedAt.asReadonly();

  readonly changeRequestsViewState: Signal<FixProofListViewState> = computed(
    () => {
      if (this.changeRows() === null) {
        if (this.changeLane.loading()) {
          return 'loading';
        }

        return this.changeRequestsError() !== null ? 'error' : 'idle';
      }

      return this.changeRequestsEmpty() ? 'empty' : 'ready';
    },
  );

  // ------------------------------------------------- selection and detail

  readonly selected: Signal<FixProofSelection | null> =
    this.selection.asReadonly();

  /** Authoritative JobDetailDto of the selected record's job. */
  readonly detail: Signal<JobDetailDto | null> =
    this.detailState.asReadonly();

  /** Authoritative job status (never inferred from proposal status). */
  readonly authoritativeJobStatus: Signal<string | null> = computed(
    () => this.detailState()?.job.status ?? null,
  );

  readonly isDetailLoading: Signal<boolean> =
    this.detailLane.loading.asReadonly();

  /** Count of explicit `cancelDetailRequest()` cancellations. */
  readonly detailCancellations: Signal<number> =
    this.detailLane.cancellations.asReadonly();

  readonly isDetailInitialLoading: Signal<boolean> = computed(
    () => this.detailLane.loading() && this.detailState() === null,
  );

  readonly isDetailRefreshing: Signal<boolean> = computed(
    () => this.detailLane.loading() && this.detailState() !== null,
  );

  readonly detailError: Signal<FixProofStateError | null> = computed(
    () => this.accessFailure() ?? this.detailInitialFailure(),
  );

  readonly detailRefreshError: Signal<FixProofStateError | null> =
    this.detailRefreshFailure.asReadonly();

  /** A refresh failed while the last authoritative detail is retained. */
  readonly isDetailStale: Signal<boolean> = computed(
    () => this.detailState() !== null && this.detailRefreshFailure() !== null,
  );

  readonly detailLastSyncedAt: Signal<Date | null> =
    this.detailSyncedAt.asReadonly();

  private readonly entityResolution: Signal<EntityResolution | null> =
    computed(() => {
      const selection = this.selection();
      const detail = this.detailState();

      if (selection === null || detail === null) {
        return null;
      }

      const mismatch: EntityResolution = {
        state: 'mismatch',
        proposal: null,
        changeRequest: null,
      };

      if (!sameId(detail.job.id, selection.jobCardId)) {
        return mismatch;
      }

      if (selection.kind === 'proposal') {
        const matches = detail.proposals.filter(p =>
          sameId(p.id, selection.id),
        );

        if (matches.length === 0) {
          return { state: 'missing', proposal: null, changeRequest: null };
        }

        if (
          matches.length > 1 ||
          !sameId(matches[0].jobCardId, detail.job.id)
        ) {
          return mismatch;
        }

        return {
          state: 'ready',
          proposal: matches[0],
          changeRequest: null,
        };
      }

      const matches = detail.changeRequests.filter(c =>
        sameId(c.id, selection.id),
      );

      if (matches.length === 0) {
        return { state: 'missing', proposal: null, changeRequest: null };
      }

      if (
        matches.length > 1 ||
        !sameId(matches[0].jobCardId, detail.job.id)
      ) {
        return mismatch;
      }

      return {
        state: 'ready',
        proposal: null,
        changeRequest: matches[0],
      };
    });

  readonly selectionState: Signal<FixProofSelectionState> = computed(() => {
    if (this.selection() === null) {
      return this.accessFailure() !== null ? 'error' : 'none';
    }

    const resolution = this.entityResolution();

    if (resolution === null) {
      if (this.detailLane.loading()) {
        return 'loading';
      }

      const failure = this.detailError();

      if (failure === null) {
        return 'loading';
      }

      return failure.kind === 'not-found' ? 'job-not-found' : 'error';
    }

    switch (resolution.state) {
      case 'ready':
        return 'ready';
      case 'missing':
        return 'entity-missing';
      case 'mismatch':
        return 'entity-mismatch';
    }
  });

  /** The authoritative proposal, only when found and verified in the JobDetail. */
  readonly selectedProposal: Signal<ProposalDto | null> = computed(
    () => this.entityResolution()?.proposal ?? null,
  );

  /** The authoritative change request, only when found and verified in the JobDetail. */
  readonly selectedChangeRequest: Signal<ChangeRequestDto | null> =
    computed(() => this.entityResolution()?.changeRequest ?? null);

  /**
   * The selected record as found in the loaded LIST (a summary view, never
   * authoritative detail). Null when the list does not contain it.
   */
  readonly selectedListRecord: Signal<
    ProposalDto | ChangeRequestDto | null
  > = computed(() => {
    const selection = this.selection();

    if (selection === null) {
      return null;
    }

    const rows: readonly (ProposalDto | ChangeRequestDto)[] =
      (selection.kind === 'proposal'
        ? this.proposalRows()
        : this.changeRows()) ?? [];

    return rows.find(row => sameId(row.id, selection.id)) ?? null;
  });

  /**
   * List membership only: the list for the selection's kind is loaded and no
   * longer contains the selected record. Says nothing about whether the
   * entity still exists; see `entityExistence`.
   */
  readonly selectedMissingFromList: Signal<boolean> = computed(() => {
    const selection = this.selection();

    if (selection === null) {
      return false;
    }

    const loaded =
      selection.kind === 'proposal'
        ? this.proposalRows() !== null
        : this.changeRows() !== null;

    return loaded && this.selectedListRecord() === null;
  });

  /** Authoritative existence of the selected entity, from the JobDetail only. */
  readonly entityExistence: Signal<FixProofEntityExistence> = computed(() => {
    switch (this.selectionState()) {
      case 'ready':
        return 'confirmed';
      case 'entity-missing':
      case 'job-not-found':
        return 'absent';
      default:
        return 'unknown';
    }
  });

  // ------------------------------------------------- pricing and review

  /** Read-only pricing and audit review of the authoritative proposal. */
  readonly pricingReview: Signal<FixProofPricingReview | null> = computed(
    () => {
      const proposal = this.selectedProposal();

      return proposal === null ? null : analyzeProposalPricing(proposal);
    },
  );

  readonly pricingDiagnostics: Signal<readonly FixProofPricingDiagnostic[]> =
    computed(() => this.pricingReview()?.diagnostics ?? []);

  readonly proposalAudit: Signal<readonly AuditDto[]> = computed(
    () => this.selectedProposal()?.audit ?? NO_AUDIT,
  );

  readonly changeRequestChanges: Signal<readonly string[]> = computed(
    () => this.selectedChangeRequest()?.changes ?? NO_STRINGS,
  );

  // ------------------------------------------------- advisory eligibility

  private readonly sessionValid: Signal<boolean> = computed(() => {
    const bound = this.boundSession();

    return bound !== null && this.clockMs() < bound.expiresAt;
  });

  /**
   * Whether eligibility can be trusted. Anything but `ready` means no action
   * may be treated as ready.
   */
  readonly actionContextState: Signal<FixProofActionContextState> = computed(
    () => {
      if (this.selection() === null) {
        return 'no-selection';
      }

      if (!this.sessionValid()) {
        return 'session-invalid';
      }

      if (this.detailState() === null) {
        return this.detailLane.loading() ? 'loading' : 'detail-unavailable';
      }

      if (this.detailLane.loading()) {
        return 'loading';
      }

      if (this.detailRefreshFailure() !== null) {
        return 'stale';
      }

      return this.selectionState() === 'ready' ? 'ready' : 'entity-unresolved';
    },
  );

  /** Advisory proposal actions; null unless a proposal is selected. */
  readonly proposalActions: Signal<FixProofProposalActionAvailability | null> =
    computed(() => {
      const selection = this.selection();

      if (selection === null || selection.kind !== 'proposal') {
        return null;
      }

      const context = this.actionContextState();
      const proposal = this.selectedProposal();
      const detail = this.detailState();

      if (proposal === null || detail === null) {
        const blocked = this.advisory(context, null);

        return {
          advisory: true,
          proposalId: selection.id,
          contextState: context,
          forward: blocked,
          returnToMechanic: blocked,
          release: blocked,
          items: [],
        };
      }

      const job = { jobStatus: detail.job.status };
      const evaluate = (
        action: 'forward' | 'return' | 'release',
      ): FixProofAdvisoryEligibility =>
        this.advisory(
          context,
          evaluateProposalActionEligibility(proposal.status, action, job),
        );

      return {
        advisory: true,
        proposalId: proposal.id,
        contextState: context,
        forward: evaluate('forward'),
        returnToMechanic: evaluate('return'),
        release: evaluate('release'),
        items: proposal.items.map(item => {
          const edit = evaluateProposalItemEditEligibility(
            proposal.status,
            item.status,
            job,
          );

          return {
            itemId: item.id,
            setPrice: this.advisory(
              context,
              edit.mode === 'set-price'
                ? edit.eligibility
                : evaluateProposalActionEligibility(
                    proposal.status,
                    'set-price',
                    job,
                  ),
            ),
            revise: this.advisory(
              context,
              evaluateProposalItemRevisionEligibility(
                proposal.status,
                item.status,
                job,
              ),
            ),
          };
        }),
      };
    });

  /** Advisory change request actions; null unless a change request is selected. */
  readonly changeRequestActions: Signal<FixProofChangeRequestActionAvailability | null> =
    computed(() => {
      const selection = this.selection();

      if (selection === null || selection.kind !== 'change-request') {
        return null;
      }

      const context = this.actionContextState();
      const request = this.selectedChangeRequest();
      const detail = this.detailState();

      if (request === null || detail === null) {
        const blocked = this.advisory(context, null);

        return {
          advisory: true,
          changeRequestId: selection.id,
          contextState: context,
          forward: blocked,
          decline: blocked,
        };
      }

      const job = { jobStatus: detail.job.status };

      return {
        advisory: true,
        changeRequestId: request.id,
        contextState: context,
        forward: this.advisory(
          context,
          evaluateChangeRequestActionEligibility(
            request.status,
            'forward',
            job,
          ),
        ),
        decline: this.advisory(
          context,
          evaluateChangeRequestActionEligibility(
            request.status,
            'decline',
            job,
          ),
        ),
      };
    });

  // ----------------------------------------------------------- shared

  readonly authFailure: Signal<'unauthorized' | 'forbidden' | null> =
    computed(() => {
      const kind = this.accessFailure()?.kind;

      return kind === 'unauthorized' || kind === 'forbidden' ? kind : null;
    });

  /**
   * HTTP 401/403 revoked this feature for the current session instance. While
   * true every read is refused and nothing may be treated as action-ready.
   */
  readonly accessRevoked: Signal<boolean> = computed(
    () => this.revokedFor() !== null,
  );

  /** Last rejected input (invalid id, unknown record, invalid filter); never server text. */
  readonly inputError: Signal<FixProofStateError | null> =
    this.inputFailure.asReadonly();

  // ---------------------------------------------------- proposal actions

  /** Loads or reloads proposals; ignored while an identical request is in flight. */
  refreshProposals(): void {
    if (this.destroyed || this.isRevoked()) {
      return;
    }

    const session = this.requireSession();

    if (session === null || this.proposalLane.loading()) {
      return;
    }

    this.startProposals(session);
  }

  /**
   * Sets the backend `status` filter (null = backend default, which excludes
   * Cancelled). Unknown values are rejected. A change discards the previous
   * rows, cancels the request in flight and loads again.
   */
  setProposalStatusFilter(status: unknown): boolean {
    if (this.destroyed || this.isRevoked()) {
      return false;
    }

    let validated: FixProofProposalServerFilter;

    try {
      validated = {
        status: validateProposalListQuery({ status }).status ?? null,
      };
    } catch (error: unknown) {
      this.inputFailure.set(resolveFixProofError(error, 'read'));
      return false;
    }

    this.inputFailure.set(null);

    if (this.proposalServerFilter().status === validated.status) {
      return true;
    }

    const session = this.requireSession();

    if (session === null) {
      return false;
    }

    this.cancelLane(this.proposalLane);
    this.proposalRawTruncated.set(false);
    this.proposalRows.set(null);
    this.proposalInitialFailure.set(null);
    this.proposalRefreshFailure.set(null);
    this.proposalSyncedAt.set(null);
    this.proposalServerFilter.set(validated);
    this.startProposals(session);

    return true;
  }

  /** Case-insensitive search over job, vehicle, customer, mechanic, status and item titles. */
  setProposalSearch(text: unknown): void {
    const current = this.currentSession();

    if (this.destroyed || this.isRevoked() || current === null) {
      this.proposalLocalFilter.update(filter =>
        filter.search === '' ? filter : { ...filter, search: '' },
      );
      return;
    }

    this.lastObservedSession = current;
    this.proposalLocalFilter.update(filter => ({
      ...filter,
      search: typeof text === 'string' ? text : '',
    }));
  }

  /** Exact local status match; unknown statuses are valid filters. */
  setProposalLocalStatus(status: unknown): void {
    this.proposalLocalFilter.update(filter => ({
      ...filter,
      status:
        typeof status === 'string' && status.length > 0 ? status : null,
    }));
  }

  clearProposalLocalFilters(): void {
    this.proposalLocalFilter.set(DEFAULT_LOCAL_FILTER);
  }

  // ----------------------------------------------- change request actions

  refreshChangeRequests(): void {
    if (this.destroyed || this.isRevoked()) {
      return;
    }

    const session = this.requireSession();

    if (session === null || this.changeLane.loading()) {
      return;
    }

    this.startChangeRequests(session);
  }

  /** Sets the backend `pendingOnly` filter; a change reloads and discards old rows. */
  setPendingOnly(pendingOnly: unknown): boolean {
    if (this.destroyed || this.isRevoked()) {
      return false;
    }

    let validated: FixProofChangeRequestServerFilter;

    try {
      validated = {
        pendingOnly:
          validateChangeRequestListQuery({ pendingOnly }).pendingOnly ===
          true,
      };
    } catch (error: unknown) {
      this.inputFailure.set(resolveFixProofError(error, 'read'));
      return false;
    }

    this.inputFailure.set(null);

    if (this.changeServerFilter().pendingOnly === validated.pendingOnly) {
      return true;
    }

    const session = this.requireSession();

    if (session === null) {
      return false;
    }

    this.cancelLane(this.changeLane);
    this.changeRawTruncated.set(false);
    this.changeRows.set(null);
    this.changeInitialFailure.set(null);
    this.changeRefreshFailure.set(null);
    this.changeSyncedAt.set(null);
    this.changeServerFilter.set(validated);
    this.startChangeRequests(session);

    return true;
  }

  /** Case-insensitive search over number, job number, status, details and changes. */
  setChangeRequestSearch(text: unknown): void {
    const current = this.currentSession();

    if (this.destroyed || this.isRevoked() || current === null) {
      this.changeLocalFilter.update(filter =>
        filter.search === '' ? filter : { ...filter, search: '' },
      );
      return;
    }

    this.lastObservedSession = current;
    this.changeLocalFilter.update(filter => ({
      ...filter,
      search: typeof text === 'string' ? text : '',
    }));
  }

  setChangeRequestLocalStatus(status: unknown): void {
    this.changeLocalFilter.update(filter => ({
      ...filter,
      status:
        typeof status === 'string' && status.length > 0 ? status : null,
    }));
  }

  clearChangeRequestLocalFilters(): void {
    this.changeLocalFilter.set(DEFAULT_LOCAL_FILTER);
  }

  // ------------------------------------------------------ selection actions

  /**
   * Selects a proposal from the loaded list by validated id and loads the
   * authoritative JobDetail of its job (one request). Unknown or invalid ids
   * are rejected without changing the selection.
   */
  selectProposal(id: unknown): boolean {
    return this.select('proposal', id);
  }

  selectChangeRequest(id: unknown): boolean {
    return this.select('change-request', id);
  }

  /** Reloads the authoritative JobDetail of the current selection. */
  refreshDetail(): void {
    if (this.destroyed || this.isRevoked()) {
      return;
    }

    const selection = this.selection();

    if (selection === null) {
      return;
    }

    const session = this.requireSession();

    if (session === null || this.detailLane.loading()) {
      return;
    }

    if (this.authCoordinator.isJobResourceDenied(session, selection.jobCardId)) {
      this.cancelLane(this.detailLane);
      this.clearDetailData();
      this.selection.set(null);
      this.detailInitialFailure.set(ACCESS_REVOKED.forbidden);
      return;
    }

    this.startDetail(session, selection);
  }

  /** Cancels the detail request and clears the selection and every detail value. */
  clearSelection(): void {
    this.cancelLane(this.detailLane);
    this.clearDetailData();
    this.selection.set(null);
  }

  /**
   * Manual recovery for a request that does not complete. Each cancels only
   * its own lane (no retry, no HTTP), keeps loaded data as stale with a fixed
   * cancelled message and lets the matching refresh run again. A cancelled
   * detail keeps action readiness blocked (`stale` or `detail-unavailable`)
   * until a fresh detail arrives. Returns false when that lane is idle.
   */
  cancelProposalsRequest(): boolean {
    return this.cancelByManager(
      this.proposalLane,
      this.proposalRows() !== null,
      this.proposalRefreshFailure,
      this.proposalInitialFailure,
    );
  }

  cancelChangeRequestsRequest(): boolean {
    return this.cancelByManager(
      this.changeLane,
      this.changeRows() !== null,
      this.changeRefreshFailure,
      this.changeInitialFailure,
    );
  }

  cancelDetailRequest(): boolean {
    return this.cancelByManager(
      this.detailLane,
      this.detailState() !== null,
      this.detailRefreshFailure,
      this.detailInitialFailure,
    );
  }

  /**
   * Feature-scoped access revocation for an HTTP 401/403 observed by any
   * FixProof collaborator (mutation, preflight or reconciliation reads).
   *
   * Synchronously cancels all three lanes (bumping their generations so late
   * successes and failures are ignored), clears every list, selection, detail,
   * pricing/audit view, stale marker, sync time and loading flag, and sets a
   * fixed, safe access failure. Makes no HTTP request. Reads stay refused for
   * the same session instance until a different valid session is present.
   * Safe to call repeatedly.
   */
  revokeFeatureAccess(kind: FixProofAccessRevocationKind): void {
    if (this.destroyed) {
      return;
    }

    this.latchAccessLoss(
      ACCESS_REVOKED[kind === 'forbidden' ? 'forbidden' : 'unauthorized'],
      this.currentSession(),
    );
  }

  /** Re-checks session validity and the action context against the clock now. */
  reevaluateActionContext(): void {
    if (this.destroyed) {
      return;
    }

    this.clockMs.set(Date.now());
    this.enforceSession();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.unregisterAuthListener();
    this.unregisterForbiddenListener();
    this.sessionWatcher.destroy();
    this.revokedFor.set(null);
    this.lastObservedSession = null;
    this.clearAccessScopedData();
  }

  // ------------------------------------------------------------- internals

  private advisory(
    context: FixProofActionContextState,
    eligibility: FixProofActionEligibility | null,
  ): FixProofAdvisoryEligibility {
    if (context !== 'ready' || eligibility === null) {
      const state: Exclude<FixProofActionContextState, 'ready'> =
        context === 'ready' ? 'entity-unresolved' : context;

      return {
        contextState: context,
        actionReady: false,
        eligibility: {
          backendSupported: false,
          frontendAllowed: false,
          status: 'unresolved',
          reason: 'missing-authoritative-job-status',
          message: CONTEXT_MESSAGES[state],
        },
      };
    }

    return {
      contextState: context,
      eligibility,
      actionReady:
        eligibility.status === 'allowed' && eligibility.frontendAllowed,
    };
  }

  private select(kind: FixProofSelectionKind, id: unknown): boolean {
    if (this.destroyed || this.isRevoked()) {
      return false;
    }

    let validId: string;

    try {
      validId = validateFixProofResourceId(
        id,
        kind === 'proposal' ? 'proposalId' : 'changeRequestId',
      );
    } catch (error: unknown) {
      this.inputFailure.set(resolveFixProofError(error, 'read'));
      return false;
    }

    const rows: readonly (ProposalDto | ChangeRequestDto)[] =
      (kind === 'proposal' ? this.proposalRows() : this.changeRows()) ?? [];
    const record = rows.find(row => sameId(row.id, validId));

    if (record === undefined) {
      // Only listed records carry a verified job identity to load.
      this.inputFailure.set(
        resolveFixProofError(
          new FixProofRequestError(
            kind === 'proposal' ? 'proposalId' : 'changeRequestId',
          ),
          'read',
        ),
      );
      return false;
    }

    this.inputFailure.set(null);

    const session = this.requireSession();

    if (session === null) {
      return false;
    }

    if (this.authCoordinator.isJobResourceDenied(session, record.jobCardId)) {
      this.cancelLane(this.detailLane);
      this.clearDetailData();
      this.selection.set(null);
      this.detailInitialFailure.set(ACCESS_REVOKED.forbidden);
      return false;
    }

    const current = this.selection();

    if (
      current !== null &&
      current.kind === kind &&
      sameId(current.id, validId) &&
      (this.detailState() !== null || this.detailLane.loading())
    ) {
      return true;
    }

    this.cancelLane(this.detailLane);
    this.clearDetailData();

    const next: FixProofSelection = {
      kind,
      id: record.id,
      jobCardId: record.jobCardId,
    };

    this.selection.set(next);
    this.startDetail(session, next);

    return true;
  }

  private currentSession(): AuthSession | null {
    return this.sessionService.isAuthenticated()
      ? this.sessionService.session()
      : null;
  }

  /**
   * Returns the valid current session, clearing state bound to another
   * session. Without a session everything is cleared and access reported lost.
   */
  private requireSession(): AuthSession | null {
    const session = this.currentSession();

    if (session === null) {
      this.revokeAccess(SESSION_ENDED);
      return null;
    }

    const bound = this.boundSession();

    if (bound !== null && bound !== session) {
      this.clearAccessScopedData();
    }

    return session;
  }

  private enforceSession(): boolean {
    if (this.destroyed) {
      return true;
    }

    const current = this.currentSession();

    if (current !== this.lastObservedSession) {
      this.lastObservedSession = current;
      this.clearSensitiveSearchFilters();
    }

    this.liftReplacedRevocation();
    this.syncRevocationFromCoordinator();

    const bound = this.boundSession();

    if (bound === null) {
      return true;
    }

    if (current === bound) {
      return true;
    }

    if (current === null) {
      this.revokeAccess(SESSION_ENDED);
    } else {
      this.clearAccessScopedData();
    }

    return false;
  }

  private revokeAccess(resolution: FixProofStateError): void {
    this.clearAccessScopedData();
    this.accessFailure.set(resolution);
  }

  /** Revokes and keeps reads refused for the session instance that got 401/403. */
  private latchAccessLoss(
    resolution: FixProofStateError,
    session: AuthSession | null,
  ): void {
    this.revokeAccess(resolution);
    this.revokedFor.set({ session });
  }

  /** True while the current session instance is the revoked one. */
  private isRevoked(): boolean {
    this.liftReplacedRevocation();
    this.syncRevocationFromCoordinator();

    return this.revokedFor() !== null;
  }

  /**
   * Only a different valid session lifts a revocation. Logout or expiry keeps
   * it; signing in again creates a new session instance.
   */
  private liftReplacedRevocation(): void {
    const revoked = this.revokedFor();

    if (revoked === null) {
      return;
    }

    const current = this.currentSession();

    if (
      current !== null &&
      current !== revoked.session &&
      !this.authCoordinator.isSessionRevoked(current) &&
      !this.authCoordinator.isFeatureForbidden(current, 'fixproof')
    ) {
      this.revokedFor.set(null);
      this.accessFailure.set(null);
      this.inputFailure.set(null);
    }
  }

  private syncRevocationFromCoordinator(): void {
    if (this.destroyed) {
      return;
    }

    const current = this.currentSession();

    if (current === null) {
      return;
    }

    if (this.authCoordinator.isSessionRevoked(current)) {
      if (
        this.revokedFor()?.session === current &&
        this.authFailure() === 'unauthorized'
      ) {
        return;
      }

      this.latchAccessLoss(ACCESS_REVOKED.unauthorized, current);
      return;
    }

    if (this.authCoordinator.isFeatureForbidden(current, 'fixproof')) {
      if (
        this.revokedFor()?.session === current &&
        this.authFailure() === 'forbidden'
      ) {
        return;
      }

      this.latchAccessLoss(ACCESS_REVOKED.forbidden, current);
    }
  }

  private handleCrossFeatureUnauthorized(revokedSession: AuthSession): void {
    if (this.destroyed) {
      return;
    }

    if (
      this.boundSession() !== revokedSession &&
      this.currentSession() !== revokedSession
    ) {
      return;
    }

    if (
      this.revokedFor()?.session === revokedSession &&
      this.authFailure() === 'unauthorized'
    ) {
      return;
    }

    this.latchAccessLoss(ACCESS_REVOKED.unauthorized, revokedSession);
  }

  private handleCoordinatorForbidden(event: Day06ForbiddenEvent): void {
    if (this.destroyed) {
      return;
    }

    const { session, scope, deniedJobId } = event;

    if (
      this.boundSession() !== session &&
      this.currentSession() !== session
    ) {
      return;
    }

    if (scope === 'fixproof') {
      if (
        this.revokedFor()?.session === session &&
        this.authFailure() === 'forbidden'
      ) {
        return;
      }

      this.latchAccessLoss(ACCESS_REVOKED.forbidden, session);
      return;
    }

    if (deniedJobId !== null) {
      const currentProposals = this.proposalRows();

      if (
        currentProposals !== null &&
        currentProposals.some(row => sameId(row.jobCardId, deniedJobId))
      ) {
        this.proposalRows.set(
          currentProposals.filter(row => !sameId(row.jobCardId, deniedJobId)),
        );
      }

      const currentChanges = this.changeRows();

      if (
        currentChanges !== null &&
        currentChanges.some(row => sameId(row.jobCardId, deniedJobId))
      ) {
        this.changeRows.set(
          currentChanges.filter(row => !sameId(row.jobCardId, deniedJobId)),
        );
      }

      const selectionMatches = sameId(
        this.selection()?.jobCardId ?? null,
        deniedJobId,
      );
      const detailMatches = sameId(
        this.detailState()?.job.id ?? null,
        deniedJobId,
      );

      if (selectionMatches || detailMatches) {
        this.cancelLane(this.detailLane);
        this.clearDetailData();
        this.selection.set(null);
        this.detailInitialFailure.set(ACCESS_REVOKED.forbidden);
      }
    }
  }

  /**
   * Cancels every request and removes all records, selection, detail,
   * sensitive free-text search filters, errors and the timer. Bumped
   * generations turn late callbacks into no-ops while keeping safe
   * non-sensitive filter preferences (`status`, `pendingOnly`).
   */
  private clearAccessScopedData(): void {
    this.cancelLane(this.proposalLane);
    this.cancelLane(this.changeLane);
    this.cancelLane(this.detailLane);

    if (this.tickHandle !== null) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }

    this.proposalRawTruncated.set(false);
    this.proposalRows.set(null);
    this.proposalInitialFailure.set(null);
    this.proposalRefreshFailure.set(null);
    this.proposalSyncedAt.set(null);
    this.changeRawTruncated.set(false);
    this.changeRows.set(null);
    this.changeInitialFailure.set(null);
    this.changeRefreshFailure.set(null);
    this.changeSyncedAt.set(null);
    this.clearDetailData();
    this.selection.set(null);
    this.accessFailure.set(null);
    this.inputFailure.set(null);
    this.boundSession.set(null);
    this.clearSensitiveSearchFilters();
  }

  private clearSensitiveSearchFilters(): void {
    this.proposalLocalFilter.update(filter =>
      filter.search === '' ? filter : { ...filter, search: '' },
    );
    this.changeLocalFilter.update(filter =>
      filter.search === '' ? filter : { ...filter, search: '' },
    );
  }

  private cancelLane(lane: Lane): void {
    lane.generation += 1;
    lane.subscription?.unsubscribe();
    lane.subscription = null;
    lane.loading.set(false);
  }

  private cancelByManager(
    lane: Lane,
    hasData: boolean,
    refreshFailure: WritableSignal<FixProofStateError | null>,
    initialFailure: WritableSignal<FixProofStateError | null>,
  ): boolean {
    if (this.destroyed || !this.enforceSession() || !lane.loading()) {
      return false;
    }

    this.cancelLane(lane);

    if (hasData) {
      refreshFailure.set(REQUEST_CANCELLED);
    } else {
      initialFailure.set(REQUEST_CANCELLED);
    }

    lane.cancellations.update(count => count + 1);

    return true;
  }

  private clearDetailData(): void {
    this.detailState.set(null);
    this.detailInitialFailure.set(null);
    this.detailRefreshFailure.set(null);
    this.detailSyncedAt.set(null);
  }

  /**
   * Runs one read on a lane. A newer run, a cancel, a session change or
   * destroy invalidates the callback, so a stale response can never apply.
   */
  private run<T>(
    lane: Lane,
    session: AuthSession,
    endpointPath: string,
    factory: () => Observable<T>,
    resolve: (error: unknown) => FixProofStateError,
    handlers: {
      readonly onSuccess: (value: T) => void;
      readonly onFailure: (resolution: FixProofStateError) => void;
      readonly isCurrent?: () => boolean;
    },
  ): void {
    lane.subscription?.unsubscribe();

    const generation = ++lane.generation;
    const provenance = this.authCoordinator.createRequestProvenance(
      'fixproof-read',
      session,
      endpointPath,
      'GET',
    );

    this.accessFailure.set(null);
    this.boundSession.set(session);
    lane.loading.set(true);
    this.ensureTicker();

    let received: { readonly value: T } | null = null;
    const subscription = new Subscription();

    const finish = (
      error: unknown,
      box: { readonly value: T } | null,
    ): void => {
      if (this.destroyed || generation !== lane.generation) {
        return;
      }

      // Enforcement may clear and cancel synchronously; re-check afterwards.
      if (!this.enforceSession() || generation !== lane.generation) {
        return;
      }

      if (handlers.isCurrent !== undefined && !handlers.isCurrent()) {
        // Never apply the result, but never leave the lane loading either.
        this.cancelLane(lane);
        return;
      }

      if (lane.subscription === subscription) {
        lane.subscription = null;
      }

      lane.loading.set(false);

      if (box !== null) {
        handlers.onSuccess(box.value);
        return;
      }

      const resolution = resolve(error ?? new Error('No response received'));

      if (
        resolution.kind === 'unauthorized' ||
        resolution.kind === 'forbidden'
      ) {
        const activeSession = this.currentSession();

        this.latchAccessLoss(resolution, session);

        if (activeSession === session) {
          if (resolution.kind === 'unauthorized') {
            this.authCoordinator.reportUnauthorized(provenance, error);
          } else {
            this.authCoordinator.reportForbidden(provenance, error);
          }
        }

        return;
      }

      handlers.onFailure(resolution);
    };

    lane.subscription = subscription;

    subscription.add(
      defer(factory).subscribe({
        next: value => {
          received = { value };
        },
        error: (error: unknown) => finish(error, null),
        complete: () => finish(undefined, received),
      }),
    );
  }

  private startProposals(session: AuthSession): void {
    const filter = this.proposalServerFilter();

    if (this.proposalRows() === null) {
      this.proposalInitialFailure.set(null);
    }

    this.run(
      this.proposalLane,
      session,
      'api/v1/manager/approvals/proposals',
      () => this.fixProofApi.getProposals({ status: filter.status }),
      error => resolveFixProofError(error, 'read'),
      {
        onSuccess: rows => {
          this.proposalRawTruncated.set(
            rows.length >= FIXPROOF_PROPOSALS_LIST_LIMIT,
          );
          const hasDenied = rows.some(row =>
            this.authCoordinator.isJobResourceDenied(session, row.jobCardId),
          );
          this.proposalRows.set(
            hasDenied
              ? rows.filter(
                  row =>
                    !this.authCoordinator.isJobResourceDenied(
                      session,
                      row.jobCardId,
                    ),
                )
              : rows,
          );
          this.proposalInitialFailure.set(null);
          this.proposalRefreshFailure.set(null);
          this.proposalSyncedAt.set(new Date(Date.now()));
        },
        onFailure: resolution => {
          if (this.proposalRows() !== null) {
            this.proposalRefreshFailure.set(resolution);
          } else {
            this.proposalInitialFailure.set(resolution);
          }
        },
      },
    );
  }

  private startChangeRequests(session: AuthSession): void {
    const filter = this.changeServerFilter();

    if (this.changeRows() === null) {
      this.changeInitialFailure.set(null);
    }

    this.run(
      this.changeLane,
      session,
      'api/v1/manager/approvals/change-requests',
      () =>
        this.fixProofApi.getChangeRequests({
          pendingOnly: filter.pendingOnly,
        }),
      error => resolveFixProofError(error, 'read'),
      {
        onSuccess: rows => {
          this.changeRawTruncated.set(
            rows.length >= FIXPROOF_CHANGE_REQUESTS_LIST_LIMIT,
          );
          const hasDenied = rows.some(row =>
            this.authCoordinator.isJobResourceDenied(session, row.jobCardId),
          );
          this.changeRows.set(
            hasDenied
              ? rows.filter(
                  row =>
                    !this.authCoordinator.isJobResourceDenied(
                      session,
                      row.jobCardId,
                    ),
                )
              : rows,
          );
          this.changeInitialFailure.set(null);
          this.changeRefreshFailure.set(null);
          this.changeSyncedAt.set(new Date(Date.now()));
        },
        onFailure: resolution => {
          if (this.changeRows() !== null) {
            this.changeRefreshFailure.set(resolution);
          } else {
            this.changeInitialFailure.set(resolution);
          }
        },
      },
    );
  }

  private startDetail(
    session: AuthSession,
    selection: FixProofSelection,
  ): void {
    if (this.detailState() === null) {
      this.detailInitialFailure.set(null);
    }

    const failDetail = (resolution: FixProofStateError): void => {
      if (resolution.kind === 'not-found') {
        // Authoritative: the job no longer exists. Never keep it as current data.
        this.clearDetailData();
        this.detailInitialFailure.set(resolution);
      } else if (this.detailState() !== null) {
        this.detailRefreshFailure.set(resolution);
      } else {
        this.detailInitialFailure.set(resolution);
      }
    };

    this.run<JobDetailDto>(
      this.detailLane,
      session,
      `api/v1/manager/jobs/${selection.jobCardId}`,
      () => this.jobApi.getJobCard(selection.jobCardId),
      error => resolveJobCardsError(error, 'read'),
      {
        isCurrent: () => {
          const current = this.selection();

          return (
            current !== null &&
            current.kind === selection.kind &&
            sameId(current.id, selection.id) &&
            !this.authCoordinator.isJobResourceDenied(
              session,
              selection.jobCardId,
            )
          );
        },
        onSuccess: detail => {
          if (
            this.authCoordinator.isJobResourceDenied(
              session,
              selection.jobCardId,
            )
          ) {
            this.clearDetailData();
            this.selection.set(null);
            this.detailInitialFailure.set(ACCESS_REVOKED.forbidden);
            return;
          }

          if (!sameId(detail.job.id, selection.jobCardId)) {
            failDetail(
              resolveFixProofError(
                new FixProofResponseError('detail.job.id'),
                'read',
              ),
            );
            return;
          }

          this.detailState.set(detail);
          this.detailInitialFailure.set(null);
          this.detailRefreshFailure.set(null);
          this.detailSyncedAt.set(new Date(Date.now()));
        },
        onFailure: failDetail,
      },
    );
  }

  private ensureTicker(): void {
    if (this.tickHandle !== null || this.destroyed) {
      return;
    }

    this.tickHandle = setInterval(() => {
      this.clockMs.set(Date.now());
      this.enforceSession();
    }, FIXPROOF_STATE_CHECK_INTERVAL_MS);
  }
}
