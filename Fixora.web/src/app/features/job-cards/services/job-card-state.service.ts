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
} from '@angular/core';

import { defer, Subscription } from 'rxjs';

import { SessionService } from '../../../core/auth/session.service';
import { ApiError } from '../../../core/models/api-error.model';
import type { AuthSession } from '../../../core/models/auth-session.model';

import type {
  ChangeRequestDto,
  ProposalDto,
} from '../../fixproof-review/models/fixproof.model';

import { JOB_CARDS_LIST_LIMIT } from '../models/job-card.model';
import type {
  InvoiceDto,
  IssueDto,
  JobCardsErrorResolution,
  JobDetailDto,
  JobSummaryDto,
  ProgressDto,
  QueueEstimateDto,
} from '../models/job-card.model';

import { resolveJobCardsError } from '../utils/job-card-error.mapper';
import {
  validateJobCardId,
  validateJobListQuery,
} from '../utils/job-card.validator';
import type {
  SignedMediaPreviewHint,
  SignedMediaRejectionReason,
  SignedMediaResolutionStatus,
} from '../utils/signed-media-url.util';

import { JobCardApiService } from './job-card-api.service';
import {
  Day06AuthorizationCoordinatorService,
  type Day06ForbiddenEvent,
  type Day06RequestProvenance,
} from './day06-authorization-coordinator.service';
import {
  SIGNED_MEDIA_CLOCK,
  SignedMediaUrlService,
} from './signed-media-url.service';

/**
 * How often the local session validity and the signed media expiry are
 * re-evaluated. This timer never performs HTTP.
 */
export const JOB_CARD_STATE_CHECK_INTERVAL_MS = 15_000;

export type JobCardListViewState =
  | 'idle'
  | 'loading'
  | 'error'
  | 'empty'
  | 'ready';

export type JobCardDetailViewState =
  | 'idle'
  | 'loading'
  | 'error'
  | 'not-found'
  | 'ready';

export type JobCardAuthFailure = 'unauthorized' | 'forbidden';

export type JobCardStaleReason = 'refresh-failed';

/** Filters sent to the backend (`GET api/v1/manager/jobs`). */
export interface JobCardServerFilter {
  readonly activeOnly: boolean;
  readonly customerId: string | null;
}

/** Filters applied locally to the already loaded rows. Never sent to the backend. */
export interface JobCardLocalFilter {
  readonly search: string;
  readonly status: string | null;
  readonly priority: number | null;
}

/**
 * One inspection evidence item, derived from a backend signed media URL.
 * It carries a trusted URL only when `status === 'valid'`; rejected and
 * expired items never expose the raw URL, signature or credentials.
 * `previewKind` is an extension hint only (never a Content-Type); there are
 * no captions, MIME types or inspection phases because the backend sends none.
 */
export interface JobCardEvidenceItem {
  readonly key: string;
  readonly issueId: string;
  readonly index: number;
  readonly status: SignedMediaResolutionStatus;
  readonly reason: SignedMediaRejectionReason | null;
  readonly previewKind: SignedMediaPreviewHint;
  /** True only for a valid URL whose hint is image, video or audio. */
  readonly previewable: boolean;
  readonly url: string | null;
  readonly mediaRef: string | null;
  readonly expiresAt: Date | null;
  readonly remainingSeconds: number | null;
  /** Expired: reload the job detail to obtain fresh links. */
  readonly needsRefresh: boolean;
  readonly message: string | null;
}

export interface JobCardIssueEvidence {
  readonly issueId: string;
  /** Empty when the backend returned no media for the issue (missing media). */
  readonly items: readonly JobCardEvidenceItem[];
  readonly hasMedia: boolean;
}

const NO_ROWS: readonly JobSummaryDto[] = [];
const NO_TIMELINE: readonly ProgressDto[] = [];
const NO_ISSUES: readonly IssueDto[] = [];
const NO_PROPOSALS: readonly ProposalDto[] = [];
const NO_CHANGE_REQUESTS: readonly ChangeRequestDto[] = [];
const NO_EVIDENCE: readonly JobCardIssueEvidence[] = [];

const DEFAULT_SERVER_FILTER: JobCardServerFilter = {
  activeOnly: true,
  customerId: null,
};

const DEFAULT_LOCAL_FILTER: JobCardLocalFilter = {
  search: '',
  status: null,
  priority: null,
};

/** Fixed, safe resolution used when the session ends, expires or is unavailable. */
const SESSION_ENDED: JobCardsErrorResolution = resolveJobCardsError(
  new ApiError(401, 'UNAUTHORIZED', 'Session ended'),
  'read',
);

const ACCESS_REVOKED_UNAUTHORIZED: JobCardsErrorResolution =
  resolveJobCardsError(
    new ApiError(401, 'UNAUTHORIZED', 'Access revoked'),
    'read',
  );

const ACCESS_REVOKED_FORBIDDEN: JobCardsErrorResolution =
  resolveJobCardsError(
    new ApiError(403, 'FORBIDDEN', 'Access denied'),
    'read',
  );

/**
 * Fixed resolution for a read the manager cancelled locally. Never an HTTP
 * 401/403 and never reported to the authorization coordinator.
 */
const REQUEST_CANCELLED: JobCardsErrorResolution = {
  ...resolveJobCardsError(new Error('Request cancelled'), 'read'),
  message: 'The request was cancelled. Refresh to try again.',
};

function sameId(left: string | null, right: string | null): boolean {
  return (
    left !== null &&
    right !== null &&
    left.toLowerCase() === right.toLowerCase()
  );
}

function matchesSearch(job: JobSummaryDto, needle: string): boolean {
  const fields = [
    job.number,
    job.customerName,
    job.vehicleLabel,
    job.mechanicName,
    job.bayName,
    job.complaint,
    job.status,
  ];

  return fields.some(
    field => field !== null && field.toLowerCase().includes(needle),
  );
}

/**
 * Feature-scoped, READ-ONLY state for Manager Job Cards.
 *
 * Provide it on the page component (`providers: [...]`) so its lifetime,
 * in-flight requests and timer end with the page. It is intentionally not
 * `providedIn: 'root'`. No state management dependency is used (Angular
 * signals + RxJS only), following `AdaptiveQueueStateService`.
 *
 * Backend contract (Fixora.SharedBackend, JobService / ManagerControllers):
 * - `GET api/v1/manager/jobs?activeOnly=true&customerId=` is the only SERVER
 *   filter pair. `activeOnly` hides Completed/Closed jobs. The list is capped
 *   by the backend at 200 rows with no paging or total, so
 *   `possiblyTruncated` is true when exactly 200 (or more) rows arrive.
 *   Completeness is never claimed.
 * - `GET api/v1/manager/jobs/{id}` returns the authoritative `JobDetailDto`.
 *   Detail records are never fabricated from list summaries.
 * - Search, status and priority filters are CLIENT-side only, applied to the
 *   rows already loaded, and never change backend order.
 *
 * Concurrency: each read has a generation counter and is unsubscribed (HTTP
 * cancelled) when superseded, so older list/detail responses can never
 * overwrite newer state. A refresh for a request already in flight is ignored.
 *
 * Security (no tokens are read, nothing is written to browser storage):
 * - Data and requests are bound to the exact session instance. Logout,
 *   expiry, invalidation or replacement cancels all requests and clears the
 *   list, detail, evidence, selection and errors.
 * - HTTP 401/403 clear everything and report `authFailure`.
 * - Signed media URLs live only inside the validated detail and the derived
 *   evidence items; both are cleared with the session. Media is never fetched.
 * - Messages are fixed, safe strings from the K06 mapper and K07 util.
 */
@Injectable()
export class JobCardStateService implements OnDestroy {
  private readonly api = inject(JobCardApiService);
  private readonly sessionService = inject(SessionService);
  private readonly signedMedia = inject(SignedMediaUrlService);
  private readonly mediaClock = inject(SIGNED_MEDIA_CLOCK);
  private readonly authCoordinator = inject(
    Day06AuthorizationCoordinatorService,
  );

  private readonly rows = signal<readonly JobSummaryDto[] | null>(null);
  private readonly listLoading = signal(false);
  private readonly listInitialFailure =
    signal<JobCardsErrorResolution | null>(null);
  private readonly listRefreshFailure =
    signal<JobCardsErrorResolution | null>(null);
  private readonly listSyncedAt = signal<Date | null>(null);
  private readonly serverFilterState =
    signal<JobCardServerFilter>(DEFAULT_SERVER_FILTER);
  private readonly localFilterState =
    signal<JobCardLocalFilter>(DEFAULT_LOCAL_FILTER);

  private readonly selectedId = signal<string | null>(null);
  private readonly detailState = signal<JobDetailDto | null>(null);
  /** Exact session instance the loaded detail was received for. */
  private readonly detailOwner = signal<AuthSession | null>(null);
  private readonly detailLoading = signal(false);
  private readonly detailInitialFailure =
    signal<JobCardsErrorResolution | null>(null);
  private readonly detailRefreshFailure =
    signal<JobCardsErrorResolution | null>(null);
  private readonly detailSyncedAt = signal<Date | null>(null);

  private readonly accessFailure = signal<JobCardsErrorResolution | null>(
    null,
  );
  private readonly inputFailure = signal<JobCardsErrorResolution | null>(
    null,
  );
  private readonly evidenceNow = signal(this.mediaClock());

  private listSubscription: Subscription | null = null;
  private detailSubscription: Subscription | null = null;
  private listGeneration = 0;
  private detailGeneration = 0;
  private destroyed = false;
  private tickHandle: ReturnType<typeof setInterval> | null = null;

  /** The exact session instance the current data and requests belong to. */
  private boundSession: AuthSession | null = null;
  private lastObservedSession: AuthSession | null = null;

  /** Session instance whose Job Cards access was revoked by 401/403. */
  private readonly revokedFor = signal<{
    readonly session: AuthSession | null;
  } | null>(null);

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

  // ------------------------------------------------------------ list state

  /** Backend rows in backend order; null before the first successful load. */
  readonly serverRows: Signal<readonly JobSummaryDto[] | null> =
    this.rows.asReadonly();

  /** Server-side filters currently applied to `serverRows`. */
  readonly serverFilter: Signal<JobCardServerFilter> =
    this.serverFilterState.asReadonly();

  /** Client-side filters applied on top of `serverRows` (never sent to the backend). */
  readonly localFilter: Signal<JobCardLocalFilter> =
    this.localFilterState.asReadonly();

  /**
   * `serverRows` after local filters, in backend order. New array; source
   * records are never modified.
   */
  readonly visibleJobs: Signal<readonly JobSummaryDto[]> = computed(() => {
    const source = this.rows();

    if (source === null) {
      return NO_ROWS;
    }

    const { search, status, priority } = this.localFilterState();
    const needle = search.trim().toLowerCase();

    if (!needle && status === null && priority === null) {
      return source;
    }

    return source.filter(
      job =>
        (status === null || job.status === status) &&
        (priority === null || job.priority === priority) &&
        (!needle || matchesSearch(job, needle)),
    );
  });

  /** Distinct statuses in first-seen order, including unknown future values. */
  readonly statusOptions: Signal<readonly string[]> = computed(() => {
    const seen = new Set<string>();

    for (const job of this.rows() ?? NO_ROWS) {
      seen.add(job.status);
    }

    return [...seen];
  });

  /** Distinct priorities, ascending. */
  readonly priorityOptions: Signal<readonly number[]> = computed(() => {
    const seen = new Set<number>();

    for (const job of this.rows() ?? NO_ROWS) {
      seen.add(job.priority);
    }

    return [...seen].sort((a, b) => a - b);
  });

  readonly hasLocalFilters: Signal<boolean> = computed(() => {
    const filter = this.localFilterState();

    return (
      filter.search.trim() !== '' ||
      filter.status !== null ||
      filter.priority !== null
    );
  });

  /**
   * The backend caps the list at 200 rows without paging or totals. When the
   * cap is reached more matching jobs may exist. Never a completeness claim.
   */
  readonly possiblyTruncated: Signal<boolean> = computed(
    () => (this.rows()?.length ?? 0) >= JOB_CARDS_LIST_LIMIT,
  );

  readonly isListLoading: Signal<boolean> = this.listLoading.asReadonly();

  readonly isListInitialLoading: Signal<boolean> = computed(
    () => this.listLoading() && this.rows() === null,
  );

  readonly isListRefreshing: Signal<boolean> = computed(
    () => this.listLoading() && this.rows() !== null,
  );

  /** A successful load returned no rows for the server filters. */
  readonly isListEmpty: Signal<boolean> = computed(
    () => this.rows()?.length === 0,
  );

  /** Rows exist but local filters hide all of them. */
  readonly isFilteredEmpty: Signal<boolean> = computed(
    () =>
      (this.rows()?.length ?? 0) > 0 && this.visibleJobs().length === 0,
  );

  /** Load failed with no rows to show (also reports ended sessions and 401/403). */
  readonly listError: Signal<JobCardsErrorResolution | null> = computed(
    () => this.accessFailure() ?? this.listInitialFailure(),
  );

  /** Refresh failed while the last valid rows are kept (stale). */
  readonly listRefreshError: Signal<JobCardsErrorResolution | null> =
    this.listRefreshFailure.asReadonly();

  readonly listStaleReason: Signal<JobCardStaleReason | null> = computed(
    () =>
      this.rows() !== null && this.listRefreshFailure() !== null
        ? 'refresh-failed'
        : null,
  );

  readonly isListStale: Signal<boolean> = computed(
    () => this.listStaleReason() !== null,
  );

  readonly listLastSyncedAt: Signal<Date | null> =
    this.listSyncedAt.asReadonly();

  readonly listViewState: Signal<JobCardListViewState> = computed(() => {
    if (this.rows() === null) {
      if (this.listLoading()) {
        return 'loading';
      }

      return this.listError() !== null ? 'error' : 'idle';
    }

    return this.isListEmpty() ? 'empty' : 'ready';
  });

  // ---------------------------------------------------------- detail state

  readonly selectedJobId: Signal<string | null> =
    this.selectedId.asReadonly();

  /**
   * The loaded detail only while it still belongs to the exact, unexpired and
   * unrevoked session it was received for, and its job is not denied. A pure
   * read: it hides the detail between a session change and the session effect
   * (or timer) that clears it. It cannot observe wall-clock expiry by itself;
   * use `getEvidenceForUse()` before any media use.
   */
  private readonly authorizedDetail: Signal<JobDetailDto | null> = computed(
    () => {
      const detail = this.detailState();
      const owner = this.detailOwner();

      this.evidenceNow();

      if (
        detail === null ||
        owner === null ||
        this.revokedFor() !== null ||
        this.sessionService.session() !== owner ||
        !this.sessionService.isAuthenticated() ||
        this.authCoordinator.isCurrentSessionRevoked() ||
        this.authCoordinator.isCurrentFeatureForbidden('job-cards') ||
        this.authCoordinator.isCurrentJobResourceDenied(detail.job.id)
      ) {
        return null;
      }

      return detail;
    },
  );

  /** Authoritative detail for the selected job; never built from list rows. */
  readonly detail: Signal<JobDetailDto | null> = this.authorizedDetail;

  readonly job: Signal<JobSummaryDto | null> = computed(
    () => this.authorizedDetail()?.job ?? null,
  );

  readonly timeline: Signal<readonly ProgressDto[]> = computed(
    () => this.authorizedDetail()?.timeline ?? NO_TIMELINE,
  );

  readonly issues: Signal<readonly IssueDto[]> = computed(
    () => this.authorizedDetail()?.issues ?? NO_ISSUES,
  );

  readonly proposals: Signal<readonly ProposalDto[]> = computed(
    () => this.authorizedDetail()?.proposals ?? NO_PROPOSALS,
  );

  readonly changeRequests: Signal<readonly ChangeRequestDto[]> = computed(
    () => this.authorizedDetail()?.changeRequests ?? NO_CHANGE_REQUESTS,
  );

  readonly invoice: Signal<InvoiceDto | null> = computed(
    () => this.authorizedDetail()?.invoice ?? null,
  );

  readonly queue: Signal<QueueEstimateDto | null> = computed(
    () => this.authorizedDetail()?.queue ?? null,
  );

  readonly isDetailLoading: Signal<boolean> =
    this.detailLoading.asReadonly();

  readonly isDetailInitialLoading: Signal<boolean> = computed(
    () => this.detailLoading() && this.detailState() === null,
  );

  readonly isDetailRefreshing: Signal<boolean> = computed(
    () => this.detailLoading() && this.detailState() !== null,
  );

  /** Detail failed with no detail to show (includes not-found and 401/403). */
  readonly detailError: Signal<JobCardsErrorResolution | null> = computed(
    () => this.accessFailure() ?? this.detailInitialFailure(),
  );

  /** Detail refresh failed while the last valid detail is kept (stale). */
  readonly detailRefreshError: Signal<JobCardsErrorResolution | null> =
    this.detailRefreshFailure.asReadonly();

  readonly isDetailStale: Signal<boolean> = computed(
    () => this.detailState() !== null && this.detailRefreshFailure() !== null,
  );

  /** The backend reported the selected job does not exist (HTTP 404). */
  readonly isDetailNotFound: Signal<boolean> = computed(
    () => this.detailInitialFailure()?.kind === 'not-found',
  );

  readonly detailLastSyncedAt: Signal<Date | null> =
    this.detailSyncedAt.asReadonly();

  /**
   * The selected job's row in the loaded list, if any. A SUMMARY ONLY; it is
   * never used as, or merged into, the authoritative detail.
   */
  readonly selectedListSummary: Signal<JobSummaryDto | null> = computed(
    () => {
      const id = this.selectedId();

      if (id === null) {
        return null;
      }

      return (
        (this.rows() ?? NO_ROWS).find(row => sameId(row.id, id)) ?? null
      );
    },
  );

  /**
   * True when a list is loaded, a job is selected and the job is not in it
   * (for example a Completed job after an active-only reload). The loaded
   * detail is kept; the list never invalidates it.
   */
  readonly selectedMissingFromList: Signal<boolean> = computed(
    () =>
      this.rows() !== null &&
      this.selectedId() !== null &&
      this.selectedListSummary() === null,
  );

  readonly detailViewState: Signal<JobCardDetailViewState> = computed(
    () => {
      if (this.selectedId() === null) {
        return this.accessFailure() !== null ? 'error' : 'idle';
      }

      if (this.detailState() === null) {
        if (this.detailLoading()) {
          return 'loading';
        }

        if (this.isDetailNotFound()) {
          return 'not-found';
        }

        return this.detailError() !== null ? 'error' : 'idle';
      }

      return 'ready';
    },
  );

  // -------------------------------------------------------- evidence state

  /**
   * Signed media descriptors per issue, derived from the authoritative
   * detail. Re-evaluated against the clock (see `reevaluateEvidence`).
   */
  readonly evidence: Signal<readonly JobCardIssueEvidence[]> = computed(
    () => {
      const detail = this.authorizedDetail();

      if (detail === null) {
        return NO_EVIDENCE;
      }

      const now = this.evidenceNow();

      return detail.issues.map(issue => this.describeIssue(issue, now));
    },
  );

  readonly hasEvidence: Signal<boolean> = computed(() =>
    this.evidence().some(issue => issue.hasMedia),
  );

  /** At least one evidence link has expired: call `refreshEvidence()`. */
  readonly evidenceNeedsRefresh: Signal<boolean> = computed(() =>
    this.evidence().some(issue =>
      issue.items.some(item => item.needsRefresh),
    ),
  );

  // ----------------------------------------------------------- shared state

  /** 401 or 403 (or an ended session): everything protected was cleared. */
  readonly authFailure: Signal<JobCardAuthFailure | null> = computed(() => {
    const kind = this.accessFailure()?.kind;

    return kind === 'unauthorized' || kind === 'forbidden' ? kind : null;
  });

  /**
   * HTTP 401/403 revoked Job Cards access for the current session instance.
   * While true every protected read stays refused until a new valid session.
   */
  readonly accessRevoked: Signal<boolean> = computed(
    () => this.revokedFor() !== null,
  );

  /** Last rejected input (invalid id, customer id or filter); never server text. */
  readonly inputError: Signal<JobCardsErrorResolution | null> =
    this.inputFailure.asReadonly();

  // ------------------------------------------------------------- list actions

  /**
   * Loads or reloads the list for the current server filters. Ignored while
   * an identical request is already in flight. Refused (and everything
   * cleared) while the session is not valid.
   */
  refreshList(): void {
    if (this.destroyed || this.isRevoked()) {
      return;
    }

    const session = this.currentSession();

    if (session === null) {
      this.revokeAccess(SESSION_ENDED);
      return;
    }

    this.rebindIfReplaced(session);

    if (this.listLoading()) {
      return;
    }

    this.startList(session);
  }

  /**
   * Manual recovery for a list request that does not complete. Cancels only
   * the list request (no retry, no other lane), keeps loaded rows as stale
   * with a fixed cancelled message, and lets `refreshList()` run again.
   * Returns false when no list request is in flight.
   */
  cancelListRequest(): boolean {
    if (this.destroyed || !this.enforceSession() || !this.listLoading()) {
      return false;
    }

    this.cancelList();

    if (this.rows() !== null) {
      this.listRefreshFailure.set(REQUEST_CANCELLED);
    } else {
      this.listInitialFailure.set(REQUEST_CANCELLED);
    }

    return true;
  }

  /**
   * Replaces the server filters (validated by the K06 query validator;
   * a missing field takes its default). A changed filter discards the rows of
   * the previous filter (never shown as if they matched), cancels any request
   * in flight and loads again. Returns false for an invalid filter.
   */
  setServerFilter(query: unknown): boolean {
    if (this.destroyed || this.isRevoked()) {
      return false;
    }

    let validated: JobCardServerFilter;

    try {
      const parsed = validateJobListQuery(query);

      validated = {
        activeOnly: parsed.activeOnly !== false,
        customerId: parsed.customerId ?? null,
      };
    } catch (error: unknown) {
      this.inputFailure.set(resolveJobCardsError(error, 'read'));
      return false;
    }

    this.inputFailure.set(null);

    const current = this.serverFilterState();

    const sameCustomer =
      current.customerId === null || validated.customerId === null
        ? current.customerId === validated.customerId
        : sameId(current.customerId, validated.customerId);

    if (current.activeOnly === validated.activeOnly && sameCustomer) {
      return true;
    }

    const session = this.currentSession();

    if (session === null) {
      this.revokeAccess(SESSION_ENDED);
      return false;
    }

    this.rebindIfReplaced(session);
    this.cancelList();
    this.rows.set(null);
    this.listInitialFailure.set(null);
    this.listRefreshFailure.set(null);
    this.listSyncedAt.set(null);
    this.serverFilterState.set(validated);
    this.startList(session);

    return true;
  }

  setActiveOnly(activeOnly: boolean): boolean {
    return this.setServerFilter({
      activeOnly,
      customerId: this.serverFilterState().customerId,
    });
  }

  setCustomerId(customerId: string | null): boolean {
    return this.setServerFilter({
      activeOnly: this.serverFilterState().activeOnly,
      customerId,
    });
  }

  /** Case-insensitive substring over number, customer, vehicle, mechanic, bay, complaint and status. */
  setSearch(text: unknown): void {
    const current = this.currentSession();

    if (this.destroyed || this.isRevoked() || current === null) {
      this.localFilterState.update(filter =>
        filter.search === '' ? filter : { ...filter, search: '' },
      );
      return;
    }

    this.lastObservedSession = current;
    this.localFilterState.update(filter => ({
      ...filter,
      search: typeof text === 'string' ? text : '',
    }));
  }

  /** Exact status match; null clears. Unknown status values are valid filters. */
  setStatusFilter(status: unknown): void {
    this.localFilterState.update(filter => ({
      ...filter,
      status:
        typeof status === 'string' && status.length > 0 ? status : null,
    }));
  }

  /** Exact priority match; null (or a non-integer) clears. */
  setPriorityFilter(priority: unknown): void {
    this.localFilterState.update(filter => ({
      ...filter,
      priority:
        typeof priority === 'number' && Number.isInteger(priority)
          ? priority
          : null,
    }));
  }

  clearLocalFilters(): void {
    this.localFilterState.set(DEFAULT_LOCAL_FILTER);
  }

  // ----------------------------------------------------------- detail actions

  /**
   * Selects a job by id and loads its authoritative detail. An invalid id is
   * rejected (selection unchanged, `inputError` set, no request). Selecting
   * another job cancels the previous detail request and clears its data;
   * re-selecting the current job is a no-op while it is loaded or loading.
   */
  selectJob(jobId: unknown): boolean {
    if (this.destroyed || this.isRevoked()) {
      return false;
    }

    let id: string;

    try {
      id = validateJobCardId(jobId);
    } catch (error: unknown) {
      this.inputFailure.set(resolveJobCardsError(error, 'read'));
      return false;
    }

    this.inputFailure.set(null);

    const session = this.currentSession();

    if (session === null) {
      this.revokeAccess(SESSION_ENDED);
      return false;
    }

    this.rebindIfReplaced(session);

    if (this.authCoordinator.isJobResourceDenied(session, id)) {
      this.cancelDetail();
      this.clearDetailData();
      this.selectedId.set(null);
      this.detailInitialFailure.set(ACCESS_REVOKED_FORBIDDEN);
      return false;
    }

    if (
      sameId(this.selectedId(), id) &&
      (this.detailState() !== null || this.detailLoading())
    ) {
      return true;
    }

    this.cancelDetail();
    this.clearDetailData();
    this.selectedId.set(id);
    this.startDetail(session, id);

    return true;
  }

  /** Reloads the selected job's authoritative detail. Ignored while loading or without a selection. */
  refreshDetail(): void {
    if (this.destroyed || this.isRevoked()) {
      return;
    }

    const id = this.selectedId();

    if (id === null) {
      return;
    }

    const session = this.currentSession();

    if (session === null) {
      this.revokeAccess(SESSION_ENDED);
      return;
    }

    this.rebindIfReplaced(session);

    if (this.authCoordinator.isJobResourceDenied(session, id)) {
      this.cancelDetail();
      this.clearDetailData();
      this.selectedId.set(null);
      this.detailInitialFailure.set(ACCESS_REVOKED_FORBIDDEN);
      return;
    }

    if (this.detailLoading()) {
      return;
    }

    this.startDetail(session, id);
  }

  /**
   * Manual recovery for a detail (or evidence) request that does not
   * complete. Cancels only the detail request, keeps the selection and any
   * loaded detail as stale with a fixed cancelled message, and lets
   * `refreshDetail()` run again. Evidence stays behind the session, owner
   * and resource checks of `getEvidenceForUse()`. Returns false when no
   * detail request is in flight.
   */
  cancelDetailRequest(): boolean {
    if (this.destroyed || !this.enforceSession() || !this.detailLoading()) {
      return false;
    }

    this.cancelDetail();

    if (this.detailState() !== null) {
      this.detailRefreshFailure.set(REQUEST_CANCELLED);
    } else {
      this.detailInitialFailure.set(REQUEST_CANCELLED);
    }

    return true;
  }

  /** Cancels the detail request and clears the selection and every detail/evidence value. */
  clearSelection(): void {
    this.cancelDetail();
    this.clearDetailData();
    this.selectedId.set(null);
  }

  // ----------------------------------------------------------- evidence actions

  /**
   * Re-checks access and re-evaluates every signed media expiry against the
   * clock now. Called by the local timer; call it before using a link.
   */
  reevaluateEvidence(): void {
    if (this.authorizeEvidenceAccess()) {
      this.evidenceNow.set(this.mediaClock());
    }
  }

  /**
   * Returns the evidence item re-evaluated at call time, so an expired link
   * or one whose access ended is never handed out. Null when the item does
   * not exist or access is no longer authorized. Items returned earlier are
   * not revoked: the backend accepts a signed URL until its `exp`.
   */
  getEvidenceForUse(
    issueId: string,
    index: number,
  ): JobCardEvidenceItem | null {
    if (!this.authorizeEvidenceAccess()) {
      return null;
    }

    this.evidenceNow.set(this.mediaClock());

    const issue = this.evidence().find(entry =>
      sameId(entry.issueId, issueId),
    );

    return issue?.items[index] ?? null;
  }

  /**
   * Signed links are only renewed by an authoritative JobDetail reload; media
   * is never fetched or re-signed here.
   */
  refreshEvidence(): void {
    this.refreshDetail();
  }

  /** Evidence refresh is the detail request: cancels it like `cancelDetailRequest()`. */
  cancelEvidenceRefresh(): boolean {
    return this.cancelDetailRequest();
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

  private describeIssue(issue: IssueDto, now: number): JobCardIssueEvidence {
    const items = issue.mediaUrls.map((raw, index) => {
      const result = this.signedMedia.resolve(raw, now);

      const item: JobCardEvidenceItem = {
        key: `${issue.id}:${index}`,
        issueId: issue.id,
        index,
        status: result.status,
        reason: result.reason,
        previewKind: result.previewHint,
        previewable: result.ok && result.previewHint !== 'unsupported',
        url: result.ok ? result.url : null,
        mediaRef: result.mediaRef,
        expiresAt: result.expiresAt,
        remainingSeconds: result.remainingSeconds,
        needsRefresh: result.status === 'expired',
        message: result.message,
      };

      return item;
    });

    return {
      issueId: issue.id,
      items,
      hasMedia: items.length > 0,
    };
  }

  private currentSession(): AuthSession | null {
    return this.sessionService.isAuthenticated()
      ? this.sessionService.session()
      : null;
  }

  /**
   * Synchronously confirms that the loaded detail still belongs to the exact,
   * valid and unrevoked session and that its job is not denied, clearing
   * through the existing lifecycle when it does not. Local only: no HTTP.
   */
  private authorizeEvidenceAccess(): boolean {
    if (this.destroyed || !this.enforceSession() || this.isRevoked()) {
      return false;
    }

    const session = this.currentSession();
    const detail = this.detailState();

    if (
      session === null ||
      detail === null ||
      this.detailOwner() !== session
    ) {
      return false;
    }

    if (this.authCoordinator.isJobResourceDenied(session, detail.job.id)) {
      this.cancelDetail();
      this.clearDetailData();
      this.selectedId.set(null);
      this.detailInitialFailure.set(ACCESS_REVOKED_FORBIDDEN);
      return false;
    }

    return true;
  }

  private rebindIfReplaced(session: AuthSession): void {
    if (this.boundSession !== null && this.boundSession !== session) {
      this.clearAccessScopedData();
    }
  }

  /**
   * Verifies that data and requests still belong to the exact, still valid
   * session. Returns false (after clearing) when they do not.
   */
  private enforceSession(): boolean {
    if (this.destroyed) {
      return true;
    }

    const observed = this.currentSession();

    if (observed !== this.lastObservedSession) {
      this.lastObservedSession = observed;
      this.clearSensitiveFilterState();
    }

    this.liftReplacedRevocation();
    this.syncRevocationFromCoordinator();

    if (this.boundSession === null) {
      return true;
    }

    if (observed === this.boundSession) {
      return true;
    }

    if (observed === null) {
      this.revokeAccess(SESSION_ENDED);
    } else {
      this.clearAccessScopedData();
    }

    return false;
  }

  private revokeAccess(resolution: JobCardsErrorResolution): void {
    this.clearAccessScopedData();
    this.accessFailure.set(resolution);
  }

  private latchAccessLoss(
    resolution: JobCardsErrorResolution,
    session: AuthSession | null,
  ): void {
    this.revokeAccess(resolution);
    this.revokedFor.set({ session });
  }

  private isRevoked(): boolean {
    this.liftReplacedRevocation();
    this.syncRevocationFromCoordinator();

    return this.revokedFor() !== null;
  }

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
      !this.authCoordinator.isFeatureForbidden(current, 'job-cards')
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

      this.latchAccessLoss(ACCESS_REVOKED_UNAUTHORIZED, current);
      return;
    }

    if (this.authCoordinator.isFeatureForbidden(current, 'job-cards')) {
      if (
        this.revokedFor()?.session === current &&
        this.authFailure() === 'forbidden'
      ) {
        return;
      }

      this.latchAccessLoss(ACCESS_REVOKED_FORBIDDEN, current);
    }
  }

  private handleCrossFeatureUnauthorized(revokedSession: AuthSession): void {
    if (this.destroyed) {
      return;
    }

    if (
      this.boundSession !== revokedSession &&
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

    this.latchAccessLoss(ACCESS_REVOKED_UNAUTHORIZED, revokedSession);
  }

  private handleCoordinatorForbidden(event: Day06ForbiddenEvent): void {
    if (this.destroyed) {
      return;
    }

    const { session, scope, deniedJobId } = event;

    if (
      this.boundSession !== session &&
      this.currentSession() !== session
    ) {
      return;
    }

    if (scope === 'job-cards') {
      if (
        this.revokedFor()?.session === session &&
        this.authFailure() === 'forbidden'
      ) {
        return;
      }

      this.latchAccessLoss(ACCESS_REVOKED_FORBIDDEN, session);
      return;
    }

    if (deniedJobId !== null) {
      const selectedMatches = sameId(this.selectedId(), deniedJobId);
      const detailMatches = sameId(this.detailState()?.job.id ?? null, deniedJobId);

      if (selectedMatches || detailMatches) {
        this.cancelDetail();
        this.clearDetailData();
        this.selectedId.set(null);
        this.detailInitialFailure.set(ACCESS_REVOKED_FORBIDDEN);
      }
    }
  }

  /**
   * Cancels every request and removes all records, signed URLs, selection,
   * sensitive search/customer filters, errors and the timer. Bumping the
   * generations turns late callbacks into no-ops while keeping safe
   * non-sensitive preferences (`activeOnly`, `status`, `priority`).
   */
  private clearAccessScopedData(): void {
    this.cancelList();
    this.cancelDetail();

    if (this.tickHandle !== null) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }

    this.rows.set(null);
    this.listInitialFailure.set(null);
    this.listRefreshFailure.set(null);
    this.listSyncedAt.set(null);
    this.clearDetailData();
    this.selectedId.set(null);
    this.accessFailure.set(null);
    this.inputFailure.set(null);
    this.boundSession = null;
    this.clearSensitiveFilterState();
  }

  private clearSensitiveFilterState(): void {
    this.localFilterState.update(filter =>
      filter.search === '' ? filter : { ...filter, search: '' },
    );
    this.serverFilterState.update(filter =>
      filter.customerId === null ? filter : { ...filter, customerId: null },
    );
  }

  private cancelList(): void {
    this.listGeneration += 1;
    this.listSubscription?.unsubscribe();
    this.listSubscription = null;
    this.listLoading.set(false);
  }

  private cancelDetail(): void {
    this.detailGeneration += 1;
    this.detailSubscription?.unsubscribe();
    this.detailSubscription = null;
    this.detailLoading.set(false);
  }

  private clearDetailData(): void {
    this.detailState.set(null);
    this.detailOwner.set(null);
    this.detailInitialFailure.set(null);
    this.detailRefreshFailure.set(null);
    this.detailSyncedAt.set(null);
  }

  private startList(session: AuthSession): void {
    this.listSubscription?.unsubscribe();

    const generation = ++this.listGeneration;
    const filter = this.serverFilterState();
    const provenance = this.authCoordinator.createRequestProvenance(
      'job-cards',
      session,
      'api/v1/manager/jobs',
      'GET',
    );

    this.accessFailure.set(null);
    this.boundSession = session;
    this.listLoading.set(true);
    this.ensureTicker();

    if (this.rows() === null) {
      this.listInitialFailure.set(null);
    }

    let received: readonly JobSummaryDto[] | null = null;

    const subscription = new Subscription();

    this.listSubscription = subscription;

    subscription.add(
      defer(() =>
        this.api.getJobCards({
          activeOnly: filter.activeOnly,
          customerId: filter.customerId,
        }),
      ).subscribe({
        next: value => {
          received = value;
        },
        error: (error: unknown) =>
          this.finishList(
            generation,
            subscription,
            session,
            provenance,
            null,
            error,
          ),
        complete: () =>
          this.finishList(
            generation,
            subscription,
            session,
            provenance,
            received,
            undefined,
          ),
      }),
    );
  }

  private finishList(
    generation: number,
    subscription: Subscription,
    session: AuthSession,
    provenance: Day06RequestProvenance | null,
    received: readonly JobSummaryDto[] | null,
    error: unknown,
  ): void {
    if (this.destroyed || generation !== this.listGeneration) {
      return;
    }

    // Enforcement may clear and cancel synchronously; re-check afterwards.
    if (!this.enforceSession() || generation !== this.listGeneration) {
      return;
    }

    if (this.listSubscription === subscription) {
      this.listSubscription = null;
    }

    this.listLoading.set(false);

    if (received !== null) {
      this.rows.set(received);
      this.listInitialFailure.set(null);
      this.listRefreshFailure.set(null);
      this.listSyncedAt.set(new Date(Date.now()));
      return;
    }

    const resolution = resolveJobCardsError(
      error ?? new Error('No response received'),
      'read',
    );

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

    if (this.rows() !== null) {
      this.listRefreshFailure.set(resolution);
    } else {
      this.listInitialFailure.set(resolution);
    }
  }

  private startDetail(session: AuthSession, id: string): void {
    this.detailSubscription?.unsubscribe();

    const generation = ++this.detailGeneration;
    const provenance = this.authCoordinator.createRequestProvenance(
      'job-cards',
      session,
      `api/v1/manager/jobs/${id}`,
      'GET',
    );

    this.accessFailure.set(null);
    this.boundSession = session;
    this.detailLoading.set(true);
    this.ensureTicker();

    if (this.detailState() === null) {
      this.detailInitialFailure.set(null);
    }

    let received: JobDetailDto | null = null;

    const subscription = new Subscription();

    this.detailSubscription = subscription;

    subscription.add(
      defer(() => this.api.getJobCard(id)).subscribe({
        next: value => {
          received = value;
        },
        error: (error: unknown) =>
          this.finishDetail(
            generation,
            subscription,
            session,
            provenance,
            id,
            null,
            error,
          ),
        complete: () =>
          this.finishDetail(
            generation,
            subscription,
            session,
            provenance,
            id,
            received,
            undefined,
          ),
      }),
    );
  }

  private finishDetail(
    generation: number,
    subscription: Subscription,
    session: AuthSession,
    provenance: Day06RequestProvenance | null,
    requestedId: string,
    received: JobDetailDto | null,
    error: unknown,
  ): void {
    if (this.destroyed || generation !== this.detailGeneration) {
      return;
    }

    // Enforcement may clear and cancel synchronously; re-check afterwards.
    if (!this.enforceSession() || generation !== this.detailGeneration) {
      return;
    }

    // Defence in depth: a response may only update the job it was requested
    // for. Release the lane instead of leaving it loading.
    if (!sameId(this.selectedId(), requestedId)) {
      this.cancelDetail();
      return;
    }

    if (this.detailSubscription === subscription) {
      this.detailSubscription = null;
    }

    this.detailLoading.set(false);

    if (this.authCoordinator.isJobResourceDenied(session, requestedId)) {
      this.clearDetailData();
      this.selectedId.set(null);
      this.detailInitialFailure.set(ACCESS_REVOKED_FORBIDDEN);
      return;
    }

    if (received !== null) {
      if (!sameId(received.job.id, requestedId)) {
        this.failDetail(
          resolveJobCardsError(
            new Error('Mismatched job detail response'),
            'read',
          ),
        );
        return;
      }

      this.detailState.set(received);
      this.detailOwner.set(session);
      this.detailInitialFailure.set(null);
      this.detailRefreshFailure.set(null);
      this.detailSyncedAt.set(new Date(Date.now()));
      this.evidenceNow.set(this.mediaClock());
      return;
    }

    const resolution = resolveJobCardsError(
      error ?? new Error('No response received'),
      'read',
    );

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

    if (resolution.kind === 'not-found') {
      // Authoritative: the job no longer exists. Never keep it as current data.
      this.clearDetailData();
      this.detailInitialFailure.set(resolution);
      return;
    }

    this.failDetail(resolution);
  }

  private failDetail(resolution: JobCardsErrorResolution): void {
    if (this.detailState() !== null) {
      this.detailRefreshFailure.set(resolution);
    } else {
      this.detailInitialFailure.set(resolution);
    }
  }

  private ensureTicker(): void {
    if (this.tickHandle !== null || this.destroyed) {
      return;
    }

    this.tickHandle = setInterval(() => {
      this.evidenceNow.set(this.mediaClock());
      this.enforceSession();
    }, JOB_CARD_STATE_CHECK_INTERVAL_MS);
  }
}
