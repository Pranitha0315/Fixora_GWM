import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { EMPTY, of, Subject, throwError } from 'rxjs';

import { SessionService } from '../../../core/auth/session.service';
import { API_CONFIG } from '../../../core/config/api.config';
import { authInterceptor } from '../../../core/interceptors/auth.interceptor';
import { errorInterceptor } from '../../../core/interceptors/error.interceptor';
import { ApiError } from '../../../core/models/api-error.model';
import type { ApiErrorCode } from '../../../core/models/api-error.model';
import type { AuthSession } from '../../../core/models/auth-session.model';

import type {
  JobDetailDto,
  JobSummaryDto,
} from '../../job-cards/models/job-card.model';
import { Day06AuthorizationCoordinatorService } from '../../job-cards/services/day06-authorization-coordinator.service';
import { JobCardApiService } from '../../job-cards/services/job-card-api.service';
import { JobCardStateService } from '../../job-cards/services/job-card-state.service';

import {
  FIXPROOF_CHANGE_REQUESTS_LIST_LIMIT,
  FIXPROOF_PROPOSALS_LIST_LIMIT,
} from '../models/fixproof.model';
import type {
  ChangeRequestDto,
  ChangeRequestListQuery,
  ProposalDto,
  ProposalListQuery,
  RepairItemDto,
} from '../models/fixproof.model';

import { resolveFixProofError } from '../utils/fixproof-error.mapper';

import { FixProofApiService } from './fixproof-api.service';
import { FixProofMutationApiService } from './fixproof-mutation-api.service';
import {
  analyzeProposalPricing,
  FIXPROOF_STATE_CHECK_INTERVAL_MS,
  FixProofStateService,
} from './fixproof-state.service';
import type { FixProofAccessRevocationKind } from './fixproof-state.service';

const BASE = 'https://api.fixora.test';
const START = Date.UTC(2027, 0, 15, 8, 0, 0);
const SENSITIVE =
  'secret-token=abc123 sig=deadbeef /api/v1/media/leak.jpg?exp=1&sig=zzz';

function uuid(prefix: number, value: number): string {
  return `${String(prefix).padStart(8, '0')}-0000-4000-8000-${String(
    value,
  ).padStart(12, '0')}`;
}

const JOB_1 = uuid(1, 1);
const JOB_2 = uuid(1, 2);
const JOB_3 = uuid(1, 3);
const P1 = uuid(2, 1);
const P2 = uuid(2, 2);
const P3 = uuid(2, 3);
const CR1 = uuid(3, 1);
const CR2 = uuid(3, 2);
const CR3 = uuid(3, 3);
const ITEM_1 = uuid(4, 1);
const ITEM_2 = uuid(4, 2);
const ITEM_3 = uuid(4, 3);
const MECHANIC = uuid(5, 1);

function makeItem(
  id: string,
  overrides: Partial<RepairItemDto> = {},
): RepairItemDto {
  return {
    id,
    title: 'Brake pads',
    kind: 'Part',
    qty: 2,
    unitPrice: 1500.5,
    amount: 3001,
    version: 1,
    status: 'Proposed',
    linkedIssueId: null,
    ...overrides,
  };
}

function consistentItems(): RepairItemDto[] {
  return [
    makeItem(ITEM_1),
    makeItem(ITEM_2, {
      title: 'Brake labour',
      kind: 'Labour',
      qty: 1,
      unitPrice: 500,
      amount: 500,
      status: 'Approved',
    }),
  ];
}

function makeProposal(
  id: string,
  jobId: string,
  overrides: Partial<ProposalDto> = {},
): ProposalDto {
  return {
    id,
    jobCardId: jobId,
    jobNumber: `JC-${jobId.slice(-3)}`,
    vehicleLabel: 'Suzuki Wagon R (NP CAB-4521)',
    customerName: 'Kavitha',
    status: 'PendingManagerReview',
    mechanicId: MECHANIC,
    mechanicName: 'Ravi',
    mechanicNote: 'Mechanic private note',
    managerNote: 'Manager internal note',
    customerNote: 'Customer private note',
    submittedAt: '2027-01-15T08:00:00Z',
    publishedAt: null,
    respondedAt: null,
    releasedAt: null,
    total: 3501,
    approvedTotal: 500,
    items: consistentItems(),
    audit: [
      {
        actorRole: 'Mechanic',
        action: 'Submitted',
        detail: null,
        at: '2027-01-15T08:00:00Z',
      },
      {
        actorRole: 'Manager',
        action: 'Priced',
        detail: 'Brake pads',
        at: '2027-01-15T08:30:00Z',
      },
    ],
    ...overrides,
  };
}

function makeChangeRequest(
  id: string,
  jobId: string,
  overrides: Partial<ChangeRequestDto> = {},
): ChangeRequestDto {
  return {
    id,
    jobCardId: jobId,
    jobNumber: `JC-${jobId.slice(-3)}`,
    number: `CR-${id.slice(-3)}`,
    changes: ['Add wiper blades', 'Skip wash'],
    details: 'Customer wants extra work',
    status: 'PendingManagerReview',
    managerNote: null,
    mechanicNote: null,
    createdAt: '2027-01-15T09:00:00Z',
    ...overrides,
  };
}

function makeJobSummary(id: string, status: string): JobSummaryDto {
  return {
    id,
    number: `JC-${id.slice(-3)}`,
    customerId: uuid(6, 1),
    customerName: 'Kavitha',
    vehicleId: uuid(7, 1),
    vehicleLabel: 'Suzuki Wagon R (NP CAB-4521)',
    mechanicId: MECHANIC,
    mechanicName: 'Ravi',
    bayId: null,
    bayName: null,
    status,
    priority: 1,
    queuePosition: 1,
    etaAt: null,
    estimatedMinutes: 90,
    elapsedMinutes: 10,
    createdAt: '2027-01-15T08:00:00Z',
    startedAt: null,
    completedAt: null,
    complaint: null,
    managerNote: null,
  };
}

function makeDetail(
  jobId: string,
  options: {
    readonly status?: string;
    readonly proposals?: readonly ProposalDto[];
    readonly changeRequests?: readonly ChangeRequestDto[];
  } = {},
): JobDetailDto {
  return {
    job: makeJobSummary(jobId, options.status ?? 'AwaitingManagerReview'),
    timeline: [],
    issues: [],
    proposals: options.proposals ?? [],
    changeRequests: options.changeRequests ?? [],
    invoice: null,
    queue: {
      jobId,
      position: 1,
      etaAt: null,
      status: options.status ?? 'AwaitingManagerReview',
      indicative: true,
    },
  };
}

function makeSession(
  userId = 'manager-001',
  lifetimeMs = 3_600_000,
): AuthSession {
  return {
    accessToken: 'test-access-token',
    expiresAt: Date.now() + lifetimeMs,
    user: {
      id: userId,
      displayName: 'Test Manager',
      email: 'manager@example.test',
      roles: ['Manager'],
    },
  };
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }

    Object.freeze(value);
  }

  return value;
}

function last<T>(items: readonly T[]): T {
  return items[items.length - 1];
}

function respond<T>(subject: Subject<T>, value: T): void {
  subject.next(value);
  subject.complete();
}

function apiError(status: number, code: ApiErrorCode): ApiError {
  return new ApiError(status, code, SENSITIVE);
}

function createFakes() {
  const proposalCalls: {
    query: ProposalListQuery | undefined;
    subject: Subject<readonly ProposalDto[]>;
  }[] = [];
  const changeCalls: {
    query: ChangeRequestListQuery | undefined;
    subject: Subject<readonly ChangeRequestDto[]>;
  }[] = [];
  const detailCalls: { id: string; subject: Subject<JobDetailDto> }[] = [];

  const fixProofApi = {
    getProposals: vi.fn((query?: ProposalListQuery) => {
      const subject = new Subject<readonly ProposalDto[]>();
      proposalCalls.push({ query, subject });
      return subject.asObservable();
    }),
    getChangeRequests: vi.fn((query?: ChangeRequestListQuery) => {
      const subject = new Subject<readonly ChangeRequestDto[]>();
      changeCalls.push({ query, subject });
      return subject.asObservable();
    }),
  };

  const jobApi = {
    getJobCard: vi.fn((id: string) => {
      const subject = new Subject<JobDetailDto>();
      detailCalls.push({ id, subject });
      return subject.asObservable();
    }),
  };

  const mutationApi = {
    setItemPrice: vi.fn(),
    reviseItem: vi.fn(),
    forwardProposal: vi.fn(),
    returnProposal: vi.fn(),
    releaseProposal: vi.fn(),
    forwardChangeRequest: vi.fn(),
    declineChangeRequest: vi.fn(),
  };

  return {
    fixProofApi,
    jobApi,
    mutationApi,
    proposalCalls,
    changeCalls,
    detailCalls,
  };
}

describe('FixProofStateService', () => {
  let service: FixProofStateService;
  let fake: ReturnType<typeof createFakes>;
  let session: SessionService;
  let httpMock: HttpTestingController;
  let timerBaseline = 0;

  function serviceTimers(): number {
    return vi.getTimerCount() - timerBaseline;
  }

  function loadProposals(rows: readonly ProposalDto[]): void {
    service.refreshProposals();
    respond(last(fake.proposalCalls).subject, rows);
  }

  function loadChangeRequests(rows: readonly ChangeRequestDto[]): void {
    service.refreshChangeRequests();
    respond(last(fake.changeCalls).subject, rows);
  }

  /** Lists the proposal, selects it and answers with the authoritative detail. */
  function openProposal(
    proposal: ProposalDto,
    jobStatus = 'AwaitingManagerReview',
    detail?: JobDetailDto,
  ): void {
    loadProposals([proposal]);
    service.selectProposal(proposal.id);
    respond(
      last(fake.detailCalls).subject,
      detail ??
        makeDetail(proposal.jobCardId, {
          status: jobStatus,
          proposals: [proposal],
        }),
    );
  }

  function openChangeRequest(
    request: ChangeRequestDto,
    jobStatus = 'AwaitingManagerReview',
  ): void {
    loadChangeRequests([request]);
    service.selectChangeRequest(request.id);
    respond(
      last(fake.detailCalls).subject,
      makeDetail(request.jobCardId, {
        status: jobStatus,
        changeRequests: [request],
      }),
    );
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);

    fake = createFakes();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
        FixProofStateService,
        { provide: FixProofApiService, useValue: fake.fixProofApi },
        { provide: JobCardApiService, useValue: fake.jobApi },
        { provide: FixProofMutationApiService, useValue: fake.mutationApi },
      ],
    });

    session = TestBed.inject(SessionService);
    httpMock = TestBed.inject(HttpTestingController);
    session.setSession(makeSession());
    service = TestBed.inject(FixProofStateService);
    TestBed.tick();
    timerBaseline = vi.getTimerCount();
  });

  afterEach(() => {
    service.ngOnDestroy();
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('FPS-01 is feature scoped, not provided in root', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: FixProofApiService, useValue: fake.fixProofApi },
          { provide: JobCardApiService, useValue: fake.jobApi },
        ],
      });

      expect(() => TestBed.inject(FixProofStateService)).toThrow();
    });

    it('FPS-02 makes no request on construction and starts idle', () => {
      expect(fake.fixProofApi.getProposals).not.toHaveBeenCalled();
      expect(fake.fixProofApi.getChangeRequests).not.toHaveBeenCalled();
      expect(fake.jobApi.getJobCard).not.toHaveBeenCalled();
      expect(service.proposals()).toBeNull();
      expect(service.changeRequests()).toBeNull();
      expect(service.visibleProposals()).toEqual([]);
      expect(service.visibleChangeRequests()).toEqual([]);
      expect(service.proposalsViewState()).toBe('idle');
      expect(service.changeRequestsViewState()).toBe('idle');
      expect(service.selectionState()).toBe('none');
      expect(service.selected()).toBeNull();
      expect(service.detail()).toBeNull();
      expect(service.pricingReview()).toBeNull();
      expect(service.proposalActions()).toBeNull();
      expect(service.changeRequestActions()).toBeNull();
      expect(service.actionContextState()).toBe('no-selection');
      expect(service.authFailure()).toBeNull();
      expect(serviceTimers()).toBe(0);
    });

    it('FPS-03 defaults to the backend default scopes', () => {
      expect(service.proposalFilter()).toEqual({ status: null });
      expect(service.changeRequestFilter()).toEqual({ pendingOnly: false });
      expect(service.proposalListIncludesCancelled()).toBe(false);
      expect(service.proposalLocalFilters()).toEqual({
        search: '',
        status: null,
      });
      expect(service.changeRequestLocalFilters()).toEqual({
        search: '',
        status: null,
      });
    });
  });

  describe('proposal list', () => {
    it('FPS-04 loads with the default query and reports loading then ready', () => {
      service.refreshProposals();

      expect(last(fake.proposalCalls).query).toEqual({ status: null });
      expect(service.isProposalsLoading()).toBe(true);
      expect(service.isProposalsInitialLoading()).toBe(true);
      expect(service.proposalsViewState()).toBe('loading');

      const rows = [makeProposal(P1, JOB_1), makeProposal(P2, JOB_2)];
      respond(last(fake.proposalCalls).subject, rows);

      expect(service.proposalsViewState()).toBe('ready');
      expect(service.proposals()).toBe(rows);
      expect(service.proposalsLastSyncedAt()?.getTime()).toBe(START);
      expect(service.isProposalsStale()).toBe(false);
      expect(service.proposalsError()).toBeNull();
    });

    it('FPS-05 reports a successful empty list', () => {
      loadProposals([]);

      expect(service.proposalsViewState()).toBe('empty');
      expect(service.proposalsEmpty()).toBe(true);
      expect(service.proposalsFilteredEmpty()).toBe(false);
    });

    it('FPS-06 reports an initial failure safely and allows retry', () => {
      service.refreshProposals();
      last(fake.proposalCalls).subject.error(apiError(500, 'SERVER_ERROR'));

      expect(service.proposalsViewState()).toBe('error');
      expect(service.proposalsError()?.kind).toBe('server-failure');
      expect(service.proposalsError()?.message).not.toContain('secret');
      expect(service.proposalsError()?.message).not.toContain('sig=');
      expect(service.proposals()).toBeNull();

      loadProposals([makeProposal(P1, JOB_1)]);

      expect(service.proposalsViewState()).toBe('ready');
      expect(service.proposalsError()).toBeNull();
    });

    it('FPS-07 keeps stale rows marked when a refresh fails', () => {
      const rows = [makeProposal(P1, JOB_1)];
      loadProposals(rows);

      service.refreshProposals();
      expect(service.isProposalsRefreshing()).toBe(true);

      last(fake.proposalCalls).subject.error(apiError(0, 'NETWORK_ERROR'));

      expect(service.proposals()).toBe(rows);
      expect(service.isProposalsStale()).toBe(true);
      expect(service.proposalsStaleReason()).toBe('refresh-failed');
      expect(service.proposalsRefreshError()?.kind).toBe('network-failure');
      expect(service.proposalsViewState()).toBe('ready');

      loadProposals([makeProposal(P2, JOB_2)]);

      expect(service.isProposalsStale()).toBe(false);
      expect(service.proposals()?.[0].id).toBe(P2);
    });

    it('FPS-08 ignores duplicate refreshes while a request is in flight', () => {
      service.refreshProposals();
      service.refreshProposals();
      service.refreshProposals();

      expect(fake.fixProofApi.getProposals).toHaveBeenCalledTimes(1);

      respond(last(fake.proposalCalls).subject, []);
      service.refreshProposals();

      expect(fake.fixProofApi.getProposals).toHaveBeenCalledTimes(2);
    });

    it('FPS-09 treats a completed response without a value as a failure', () => {
      service.refreshProposals();
      last(fake.proposalCalls).subject.complete();

      expect(service.proposalsViewState()).toBe('error');
    });

    it('FPS-10 default scope is not labelled as every proposal; Cancelled needs the explicit filter', () => {
      loadProposals([makeProposal(P1, JOB_1)]);

      expect(service.proposalFilter().status).toBeNull();
      expect(service.proposalListIncludesCancelled()).toBe(false);

      expect(service.setProposalStatusFilter('Cancelled')).toBe(true);

      expect(last(fake.proposalCalls).query).toEqual({
        status: 'Cancelled',
      });
      expect(service.proposalListIncludesCancelled()).toBe(true);
      expect(service.proposals()).toBeNull();
      expect(service.proposalsViewState()).toBe('loading');

      respond(last(fake.proposalCalls).subject, [
        makeProposal(P3, JOB_3, { status: 'Cancelled' }),
      ]);

      expect(service.proposals()?.[0].status).toBe('Cancelled');
    });

    it('FPS-11 supports every known backend status filter and returning to the default', () => {
      expect(service.setProposalStatusFilter('CustomerResponded')).toBe(
        true,
      );
      expect(last(fake.proposalCalls).query).toEqual({
        status: 'CustomerResponded',
      });

      expect(service.setProposalStatusFilter(null)).toBe(true);
      expect(last(fake.proposalCalls).query).toEqual({ status: null });
      expect(service.proposalFilter().status).toBeNull();
    });

    it('FPS-12 rejects unknown or malformed status filters without a request', () => {
      for (const bad of ['cancelled', 'Unknown', '', 5, {}, ['Cancelled']]) {
        expect(service.setProposalStatusFilter(bad)).toBe(false);
      }

      expect(fake.fixProofApi.getProposals).not.toHaveBeenCalled();
      expect(service.proposalFilter().status).toBeNull();
      expect(service.inputError()).not.toBeNull();
      expect(service.inputError()?.message).not.toContain('Unknown');

      expect(service.setProposalStatusFilter('Cancelled')).toBe(true);
      expect(service.inputError()).toBeNull();
    });

    it('FPS-13 does not reload when the status filter is unchanged', () => {
      loadProposals([makeProposal(P1, JOB_1)]);

      expect(service.setProposalStatusFilter(null)).toBe(true);
      expect(service.setProposalStatusFilter(undefined)).toBe(true);

      expect(fake.fixProofApi.getProposals).toHaveBeenCalledTimes(1);
      expect(service.proposals()).toHaveLength(1);
    });

    it('FPS-14 cancels the superseded request and ignores its late response', () => {
      service.refreshProposals();
      const first = last(fake.proposalCalls);

      service.setProposalStatusFilter('Cancelled');
      const second = last(fake.proposalCalls);

      expect(first.subject.observed).toBe(false);

      respond(first.subject, [makeProposal(P1, JOB_1)]);

      expect(service.proposals()).toBeNull();
      expect(service.isProposalsLoading()).toBe(true);

      respond(second.subject, [makeProposal(P2, JOB_2)]);

      expect(service.proposals()?.[0].id).toBe(P2);
    });

    it('FPS-15 keeps only the latest of rapid status filter changes', () => {
      service.setProposalStatusFilter('AwaitingCustomer');
      const a = last(fake.proposalCalls);
      service.setProposalStatusFilter('Cancelled');
      const b = last(fake.proposalCalls);
      service.setProposalStatusFilter('ReleasedToMechanic');
      const c = last(fake.proposalCalls);

      respond(c.subject, [makeProposal(P3, JOB_3)]);
      respond(a.subject, [makeProposal(P1, JOB_1)]);
      respond(b.subject, [makeProposal(P2, JOB_2)]);

      expect(service.proposals()).toHaveLength(1);
      expect(service.proposals()?.[0].id).toBe(P3);
      expect(service.proposalFilter().status).toBe('ReleasedToMechanic');
    });
  });

  describe('proposal local filtering', () => {
    const rows = [
      makeProposal(P3, JOB_3, {
        jobNumber: 'JC-0003',
        vehicleLabel: 'Toyota Aqua',
        customerName: 'Nimal',
        mechanicName: 'Saman',
        status: 'AwaitingCustomer',
        items: [makeItem(ITEM_3, { title: 'Wiper blades' })],
      }),
      makeProposal(P1, JOB_1, {
        jobNumber: 'JC-0001',
        vehicleLabel: 'Suzuki Wagon R',
        customerName: 'Kavitha',
        mechanicName: 'Ravi',
        status: 'PendingManagerReview',
      }),
      makeProposal(P2, JOB_2, {
        jobNumber: 'JC-0002',
        vehicleLabel: 'Honda Fit',
        customerName: 'Perera',
        mechanicName: null,
        status: 'FutureStatus',
      }),
    ];

    beforeEach(() => {
      loadProposals(rows);
    });

    function visibleIds(): string[] {
      return service.visibleProposals().map(row => row.id);
    }

    it('FPS-16 preserves backend ordering and returns the source when unfiltered', () => {
      expect(visibleIds()).toEqual([P3, P1, P2]);
      expect(service.visibleProposals()).toBe(service.proposals());
    });

    it('FPS-17 searches case-insensitively across supported fields only', () => {
      service.setProposalSearch('  PERERA ');
      expect(visibleIds()).toEqual([P2]);

      service.setProposalSearch('jc-0003');
      expect(visibleIds()).toEqual([P3]);

      service.setProposalSearch('honda');
      expect(visibleIds()).toEqual([P2]);

      service.setProposalSearch('saman');
      expect(visibleIds()).toEqual([P3]);

      service.setProposalSearch('wiper');
      expect(visibleIds()).toEqual([P3]);

      service.setProposalSearch('futurestatus');
      expect(visibleIds()).toEqual([P2]);

      service.setProposalSearch('private note');
      expect(visibleIds()).toEqual([]);

      service.setProposalSearch(P1);
      expect(visibleIds()).toEqual([]);
    });

    it('FPS-18 filters by exact status and preserves unknown statuses', () => {
      service.setProposalLocalStatus('FutureStatus');
      expect(visibleIds()).toEqual([P2]);

      service.setProposalLocalStatus('pendingmanagerreview');
      expect(visibleIds()).toEqual([]);

      service.setProposalLocalStatus('PendingManagerReview');
      expect(visibleIds()).toEqual([P1]);

      expect(service.proposalStatusOptions()).toEqual([
        'AwaitingCustomer',
        'PendingManagerReview',
        'FutureStatus',
      ]);
    });

    it('FPS-19 combines filters, reports filtered-empty and clears them', () => {
      service.setProposalSearch('kavitha');
      service.setProposalLocalStatus('AwaitingCustomer');

      expect(visibleIds()).toEqual([]);
      expect(service.proposalsFilteredEmpty()).toBe(true);
      expect(service.proposalsViewState()).toBe('ready');
      expect(service.hasProposalLocalFilters()).toBe(true);

      service.clearProposalLocalFilters();

      expect(visibleIds()).toEqual([P3, P1, P2]);
      expect(service.hasProposalLocalFilters()).toBe(false);
    });

    it('FPS-20 ignores invalid local inputs', () => {
      service.setProposalSearch(7);
      service.setProposalLocalStatus(9);

      expect(service.proposalLocalFilters()).toEqual({
        search: '',
        status: null,
      });
    });

    it('FPS-21 never mutates frozen source records and is deterministic', () => {
      const frozen = deepFreeze([
        makeProposal(P1, JOB_1),
        makeProposal(P2, JOB_2),
      ]);

      loadProposals(frozen);
      service.setProposalSearch('kavitha');

      const first = service.visibleProposals().map(row => row.id);
      service.setProposalSearch('kavitha');

      expect(service.visibleProposals().map(row => row.id)).toEqual(first);
      expect(service.proposals()).toBe(frozen);
    });

    it('FPS-22 keeps local filters when rows reload and does not send them to the backend', () => {
      service.setProposalSearch('perera');
      loadProposals(rows);

      expect(visibleIds()).toEqual([P2]);
      expect(last(fake.proposalCalls).query).toEqual({ status: null });
    });
  });

  describe('change request list', () => {
    it('FPS-23 loads with pendingOnly false by default', () => {
      service.refreshChangeRequests();

      expect(last(fake.changeCalls).query).toEqual({ pendingOnly: false });
      expect(service.changeRequestsViewState()).toBe('loading');

      const rows = [makeChangeRequest(CR1, JOB_1)];
      respond(last(fake.changeCalls).subject, rows);

      expect(service.changeRequestsViewState()).toBe('ready');
      expect(service.changeRequests()).toBe(rows);
      expect(service.changeRequestsLastSyncedAt()?.getTime()).toBe(START);
    });

    it('FPS-24 reports empty, initial failure and retry', () => {
      loadChangeRequests([]);
      expect(service.changeRequestsViewState()).toBe('empty');

      service.setPendingOnly(true);
      last(fake.changeCalls).subject.error(apiError(500, 'SERVER_ERROR'));

      expect(service.changeRequestsViewState()).toBe('error');
      expect(service.changeRequestsError()?.message).not.toContain('secret');

      loadChangeRequests([makeChangeRequest(CR1, JOB_1)]);
      expect(service.changeRequestsViewState()).toBe('ready');
    });

    it('FPS-25 keeps stale change requests marked when a refresh fails', () => {
      const rows = [makeChangeRequest(CR1, JOB_1)];
      loadChangeRequests(rows);

      service.refreshChangeRequests();
      expect(service.isChangeRequestsRefreshing()).toBe(true);
      last(fake.changeCalls).subject.error(apiError(0, 'NETWORK_ERROR'));

      expect(service.changeRequests()).toBe(rows);
      expect(service.isChangeRequestsStale()).toBe(true);
      expect(service.changeRequestsRefreshError()?.kind).toBe(
        'network-failure',
      );

      loadChangeRequests(rows);
      expect(service.isChangeRequestsStale()).toBe(false);
    });

    it('FPS-26 applies the server-side pendingOnly filter and discards old rows', () => {
      loadChangeRequests([makeChangeRequest(CR1, JOB_1)]);

      expect(service.setPendingOnly(true)).toBe(true);

      expect(last(fake.changeCalls).query).toEqual({ pendingOnly: true });
      expect(service.changeRequestFilter().pendingOnly).toBe(true);
      expect(service.changeRequests()).toBeNull();

      expect(service.setPendingOnly(true)).toBe(true);
      expect(fake.fixProofApi.getChangeRequests).toHaveBeenCalledTimes(2);

      expect(service.setPendingOnly(false)).toBe(true);
      expect(last(fake.changeCalls).query).toEqual({ pendingOnly: false });
    });

    it('FPS-27 rejects an invalid pendingOnly and never invents server parameters', () => {
      for (const bad of ['true', 1, null, {}]) {
        expect(service.setPendingOnly(bad)).toBe(false);
      }

      expect(fake.fixProofApi.getChangeRequests).not.toHaveBeenCalled();
      expect(service.inputError()).not.toBeNull();

      service.setPendingOnly(true);

      expect(Object.keys(last(fake.changeCalls).query ?? {})).toEqual([
        'pendingOnly',
      ]);
    });

    it('FPS-28 cancels the superseded request and keeps only the latest of rapid changes', () => {
      service.refreshChangeRequests();
      const first = last(fake.changeCalls);
      service.setPendingOnly(true);
      const second = last(fake.changeCalls);
      service.setPendingOnly(false);
      const third = last(fake.changeCalls);

      expect(first.subject.observed).toBe(false);
      expect(second.subject.observed).toBe(false);

      respond(third.subject, [makeChangeRequest(CR3, JOB_3)]);
      respond(first.subject, [makeChangeRequest(CR1, JOB_1)]);
      respond(second.subject, [makeChangeRequest(CR2, JOB_2)]);

      expect(service.changeRequests()).toHaveLength(1);
      expect(service.changeRequests()?.[0].id).toBe(CR3);
    });

    it('FPS-29 ignores duplicate change request refreshes', () => {
      service.refreshChangeRequests();
      service.refreshChangeRequests();

      expect(fake.fixProofApi.getChangeRequests).toHaveBeenCalledTimes(1);
    });

    it('FPS-30 filters locally by status and search, preserving order and unknown statuses', () => {
      const rows = [
        makeChangeRequest(CR3, JOB_3, {
          number: 'CR-0003',
          status: 'FutureStatus',
          details: 'Replace mirror',
          changes: ['Mirror'],
        }),
        makeChangeRequest(CR1, JOB_1, {
          number: 'CR-0001',
          status: 'PendingManagerReview',
          details: 'Wants wipers',
          changes: ['Wipers', 'Polish'],
        }),
        makeChangeRequest(CR2, JOB_2, {
          number: 'CR-0002',
          status: 'Declined',
          managerNote: 'Declined note',
        }),
      ];

      loadChangeRequests(rows);

      const ids = () =>
        service.visibleChangeRequests().map(row => row.id);

      expect(ids()).toEqual([CR3, CR1, CR2]);
      expect(service.visibleChangeRequests()).toBe(service.changeRequests());

      service.setChangeRequestSearch('POLISH');
      expect(ids()).toEqual([CR1]);

      service.setChangeRequestSearch('cr-0003');
      expect(ids()).toEqual([CR3]);

      service.setChangeRequestSearch('mirror');
      expect(ids()).toEqual([CR3]);

      service.setChangeRequestSearch('declined note');
      expect(ids()).toEqual([]);

      service.setChangeRequestSearch('');
      service.setChangeRequestLocalStatus('FutureStatus');
      expect(ids()).toEqual([CR3]);

      expect(service.changeRequestStatusOptions()).toEqual([
        'FutureStatus',
        'PendingManagerReview',
        'Declined',
      ]);

      service.setChangeRequestLocalStatus('Declined');
      service.setChangeRequestSearch('wipers');
      expect(service.changeRequestsFilteredEmpty()).toBe(true);
      expect(service.hasChangeRequestLocalFilters()).toBe(true);

      service.clearChangeRequestLocalFilters();
      expect(ids()).toEqual([CR3, CR1, CR2]);
    });
  });

  describe('list independence and truncation', () => {
    function manyProposals(count: number): ProposalDto[] {
      return Array.from({ length: count }, (_, index) =>
        makeProposal(uuid(20, index + 1), JOB_1),
      );
    }

    function manyChangeRequests(count: number): ChangeRequestDto[] {
      return Array.from({ length: count }, (_, index) =>
        makeChangeRequest(uuid(30, index + 1), JOB_1),
      );
    }

    it('FPS-31 flags possible truncation at the 100 row cap for proposals only', () => {
      expect(FIXPROOF_PROPOSALS_LIST_LIMIT).toBe(100);

      loadProposals(manyProposals(99));
      expect(service.possiblyTruncatedProposals()).toBe(false);

      loadProposals(manyProposals(100));
      expect(service.possiblyTruncatedProposals()).toBe(true);
      expect(service.possiblyTruncatedChangeRequests()).toBe(false);

      loadProposals([]);
      expect(service.possiblyTruncatedProposals()).toBe(false);
    });

    it('FPS-32 flags possible truncation at the 100 row cap for change requests only', () => {
      expect(FIXPROOF_CHANGE_REQUESTS_LIST_LIMIT).toBe(100);

      loadChangeRequests(manyChangeRequests(99));
      expect(service.possiblyTruncatedChangeRequests()).toBe(false);

      loadChangeRequests(manyChangeRequests(100));
      expect(service.possiblyTruncatedChangeRequests()).toBe(true);
      expect(service.possiblyTruncatedProposals()).toBe(false);
    });

    it('FPS-33 truncation reflects loaded rows, not local filters, and invents no totals or pages', () => {
      loadProposals(manyProposals(100));
      service.setProposalSearch('no-such-record');

      expect(service.visibleProposals()).toHaveLength(0);
      expect(service.possiblyTruncatedProposals()).toBe(true);

      const exposed = Object.keys(service);

      for (const name of [
        'total',
        'totalCount',
        'page',
        'pageSize',
        'hasMore',
        'isComplete',
      ]) {
        expect(exposed).not.toContain(name);
      }
    });

    it('FPS-34 proposal and change request loading, errors and filters are independent', () => {
      service.refreshProposals();
      service.refreshChangeRequests();

      respond(last(fake.changeCalls).subject, [
        makeChangeRequest(CR1, JOB_1),
      ]);

      expect(service.isProposalsLoading()).toBe(true);
      expect(service.changeRequestsViewState()).toBe('ready');

      last(fake.proposalCalls).subject.error(apiError(500, 'SERVER_ERROR'));

      expect(service.proposalsViewState()).toBe('error');
      expect(service.changeRequestsViewState()).toBe('ready');
      expect(service.changeRequestsError()).toBeNull();

      service.setPendingOnly(true);
      expect(service.proposalFilter().status).toBeNull();

      service.setProposalStatusFilter('Cancelled');
      expect(service.changeRequestFilter().pendingOnly).toBe(true);
    });

    it('FPS-35 a change request failure does not disturb loaded proposals', () => {
      const rows = [makeProposal(P1, JOB_1)];
      loadProposals(rows);
      service.refreshChangeRequests();
      last(fake.changeCalls).subject.error(apiError(500, 'SERVER_ERROR'));

      expect(service.proposals()).toBe(rows);
      expect(service.proposalsViewState()).toBe('ready');
      expect(service.isProposalsStale()).toBe(false);
      expect(service.changeRequestsViewState()).toBe('error');
    });
  });

  describe('selection and authoritative detail', () => {
    it('FPS-36 selects a listed proposal and loads its job detail once', () => {
      loadProposals([makeProposal(P1, JOB_1), makeProposal(P2, JOB_2)]);

      expect(service.selectProposal(P1)).toBe(true);

      expect(fake.jobApi.getJobCard).toHaveBeenCalledTimes(1);
      expect(fake.jobApi.getJobCard).toHaveBeenCalledWith(JOB_1);
      expect(service.selected()).toEqual({
        kind: 'proposal',
        id: P1,
        jobCardId: JOB_1,
      });
      expect(service.selectionState()).toBe('loading');
      expect(service.isDetailInitialLoading()).toBe(true);
    });

    it('FPS-37 never treats the list record as authoritative detail', () => {
      loadProposals([makeProposal(P1, JOB_1)]);
      service.selectProposal(P1);

      expect(service.selectedListRecord()?.id).toBe(P1);
      expect(service.selectedProposal()).toBeNull();
      expect(service.pricingReview()).toBeNull();
      expect(service.authoritativeJobStatus()).toBeNull();
      expect(service.proposalActions()?.forward.actionReady).toBe(false);

      last(fake.detailCalls).subject.error(apiError(500, 'SERVER_ERROR'));

      expect(service.selectedProposal()).toBeNull();
      expect(service.selectionState()).toBe('error');
      expect(service.entityExistence()).toBe('unknown');
    });

    it('FPS-38 resolves the exact proposal inside the authoritative JobDetail', () => {
      const listed = makeProposal(P1, JOB_1, { managerNote: 'list' });
      const authoritative = makeProposal(P1, JOB_1, {
        managerNote: 'authoritative',
      });
      const other = makeProposal(P2, JOB_1);

      loadProposals([listed]);
      service.selectProposal(P1);
      respond(
        last(fake.detailCalls).subject,
        makeDetail(JOB_1, { proposals: [other, authoritative] }),
      );

      expect(service.selectionState()).toBe('ready');
      expect(service.selectedProposal()).toBe(authoritative);
      expect(service.selectedProposal()?.managerNote).toBe('authoritative');
      expect(service.entityExistence()).toBe('confirmed');
      expect(service.selectedChangeRequest()).toBeNull();
      expect(service.detailLastSyncedAt()?.getTime()).toBe(START);
      expect(service.authoritativeJobStatus()).toBe('AwaitingManagerReview');
    });

    it('FPS-39 resolves the exact change request inside the authoritative JobDetail', () => {
      const request = makeChangeRequest(CR1, JOB_1);

      loadChangeRequests([request, makeChangeRequest(CR2, JOB_2)]);
      service.selectChangeRequest(CR1);

      expect(fake.jobApi.getJobCard).toHaveBeenCalledWith(JOB_1);

      respond(
        last(fake.detailCalls).subject,
        makeDetail(JOB_1, {
          changeRequests: [makeChangeRequest(CR3, JOB_1), request],
        }),
      );

      expect(service.selectionState()).toBe('ready');
      expect(service.selectedChangeRequest()).toBe(request);
      expect(service.changeRequestChanges()).toEqual([
        'Add wiper blades',
        'Skip wash',
      ]);
      expect(service.selectedProposal()).toBeNull();
    });

    it('FPS-40 rejects invalid identifiers without a request or selection change', () => {
      openProposal(makeProposal(P1, JOB_1));
      const calls = fake.jobApi.getJobCard.mock.calls.length;

      for (const bad of [
        '',
        'abc',
        '00000000-0000-0000-0000-000000000000',
        null,
        undefined,
        42,
        `${P2}/../x`,
      ]) {
        expect(service.selectProposal(bad)).toBe(false);
        expect(service.selectChangeRequest(bad)).toBe(false);
      }

      expect(fake.jobApi.getJobCard.mock.calls.length).toBe(calls);
      expect(service.selected()?.id).toBe(P1);
      expect(service.inputError()).not.toBeNull();
    });

    it('FPS-41 rejects ids that are not in the loaded list without a request', () => {
      expect(service.selectProposal(P1)).toBe(false);

      loadProposals([makeProposal(P1, JOB_1)]);

      expect(service.selectProposal(P2)).toBe(false);
      expect(service.selectChangeRequest(CR1)).toBe(false);
      expect(fake.jobApi.getJobCard).not.toHaveBeenCalled();
      expect(service.selected()).toBeNull();
      expect(service.inputError()?.kind).toBe('invalid-request');
    });

    it('FPS-42 never issues a JobDetail request per list row', () => {
      loadProposals([
        makeProposal(P1, JOB_1),
        makeProposal(P2, JOB_2),
        makeProposal(P3, JOB_3),
      ]);
      loadChangeRequests([
        makeChangeRequest(CR1, JOB_1),
        makeChangeRequest(CR2, JOB_2),
      ]);
      service.refreshProposals();
      service.refreshChangeRequests();

      expect(fake.jobApi.getJobCard).not.toHaveBeenCalled();

      service.selectProposal(P2);

      expect(fake.jobApi.getJobCard).toHaveBeenCalledTimes(1);
      expect(fake.jobApi.getJobCard).toHaveBeenCalledWith(JOB_2);
    });

    it('FPS-43 re-selecting the same record does not repeat the request', () => {
      loadProposals([makeProposal(P1, JOB_1)]);
      service.selectProposal(P1);
      service.selectProposal(P1.toUpperCase());

      expect(fake.jobApi.getJobCard).toHaveBeenCalledTimes(1);

      respond(
        last(fake.detailCalls).subject,
        makeDetail(JOB_1, { proposals: [makeProposal(P1, JOB_1)] }),
      );
      service.selectProposal(P1);

      expect(fake.jobApi.getJobCard).toHaveBeenCalledTimes(1);
    });

    it('FPS-44 re-selecting after a failure retries', () => {
      loadProposals([makeProposal(P1, JOB_1)]);
      service.selectProposal(P1);
      last(fake.detailCalls).subject.error(apiError(500, 'SERVER_ERROR'));

      service.selectProposal(P1);

      expect(fake.jobApi.getJobCard).toHaveBeenCalledTimes(2);
      expect(service.selectionState()).toBe('loading');
    });

    it('FPS-45 selecting another record cancels the previous request and ignores its late response', () => {
      loadProposals([makeProposal(P1, JOB_1), makeProposal(P2, JOB_2)]);
      service.selectProposal(P1);
      const first = last(fake.detailCalls);
      service.selectProposal(P2);
      const second = last(fake.detailCalls);

      expect(first.subject.observed).toBe(false);

      respond(
        first.subject,
        makeDetail(JOB_1, { proposals: [makeProposal(P1, JOB_1)] }),
      );

      expect(service.detail()).toBeNull();
      expect(service.selected()?.id).toBe(P2);
      expect(service.isDetailLoading()).toBe(true);

      respond(
        second.subject,
        makeDetail(JOB_2, { proposals: [makeProposal(P2, JOB_2)] }),
      );

      expect(service.selectedProposal()?.id).toBe(P2);
    });

    it('FPS-46 keeps only the latest of rapid selection changes and out-of-order responses', () => {
      loadProposals([
        makeProposal(P1, JOB_1),
        makeProposal(P2, JOB_2),
        makeProposal(P3, JOB_3),
      ]);
      service.selectProposal(P1);
      const a = last(fake.detailCalls);
      service.selectProposal(P2);
      const b = last(fake.detailCalls);
      service.selectProposal(P3);
      const c = last(fake.detailCalls);

      respond(
        c.subject,
        makeDetail(JOB_3, { proposals: [makeProposal(P3, JOB_3)] }),
      );
      respond(
        a.subject,
        makeDetail(JOB_1, { proposals: [makeProposal(P1, JOB_1)] }),
      );
      respond(
        b.subject,
        makeDetail(JOB_2, { proposals: [makeProposal(P2, JOB_2)] }),
      );

      expect(service.selected()?.id).toBe(P3);
      expect(service.selectedProposal()?.id).toBe(P3);
    });

    it('FPS-47 switching between a proposal and a change request clears the previous selection', () => {
      loadProposals([makeProposal(P1, JOB_1)]);
      loadChangeRequests([makeChangeRequest(CR1, JOB_1)]);
      openProposal(makeProposal(P1, JOB_1));

      service.selectChangeRequest(CR1);

      expect(service.selected()?.kind).toBe('change-request');
      expect(service.selectedProposal()).toBeNull();
      expect(service.proposalActions()).toBeNull();
      expect(service.detail()).toBeNull();
    });

    it('FPS-48 treats a detail for a different job as a failure and exposes nothing', () => {
      loadProposals([makeProposal(P1, JOB_1)]);
      service.selectProposal(P1);
      respond(
        last(fake.detailCalls).subject,
        makeDetail(JOB_2, { proposals: [makeProposal(P1, JOB_2)] }),
      );

      expect(service.detail()).toBeNull();
      expect(service.selectedProposal()).toBeNull();
      expect(service.selectionState()).toBe('error');
      expect(service.detailError()?.kind).toBe('invalid-response');
      expect(service.proposalActions()?.forward.actionReady).toBe(false);
    });

    it('FPS-49 reports a missing proposal explicitly and never selects another entity', () => {
      loadProposals([makeProposal(P1, JOB_1)]);
      service.selectProposal(P1);
      respond(
        last(fake.detailCalls).subject,
        makeDetail(JOB_1, { proposals: [makeProposal(P2, JOB_1)] }),
      );

      expect(service.selectionState()).toBe('entity-missing');
      expect(service.entityExistence()).toBe('absent');
      expect(service.selectedProposal()).toBeNull();
      expect(service.pricingReview()).toBeNull();
      expect(service.actionContextState()).toBe('entity-unresolved');
      expect(service.proposalActions()?.forward.actionReady).toBe(false);
      expect(service.proposalActions()?.items).toEqual([]);
    });

    it('FPS-50 reports a missing change request explicitly', () => {
      loadChangeRequests([makeChangeRequest(CR1, JOB_1)]);
      service.selectChangeRequest(CR1);
      respond(
        last(fake.detailCalls).subject,
        makeDetail(JOB_1, {
          changeRequests: [makeChangeRequest(CR2, JOB_1)],
        }),
      );

      expect(service.selectionState()).toBe('entity-missing');
      expect(service.selectedChangeRequest()).toBeNull();
      expect(service.changeRequestActions()?.forward.actionReady).toBe(false);
    });

    it('FPS-51 rejects an entity whose job association does not match', () => {
      loadProposals([makeProposal(P1, JOB_1)]);
      service.selectProposal(P1);
      respond(
        last(fake.detailCalls).subject,
        makeDetail(JOB_1, { proposals: [makeProposal(P1, JOB_2)] }),
      );

      expect(service.selectionState()).toBe('entity-mismatch');
      expect(service.entityExistence()).toBe('unknown');
      expect(service.selectedProposal()).toBeNull();
      expect(service.actionContextState()).toBe('entity-unresolved');
    });

    it('FPS-52 rejects ambiguous duplicate entity ids instead of picking one', () => {
      loadChangeRequests([makeChangeRequest(CR1, JOB_1)]);
      service.selectChangeRequest(CR1);
      respond(
        last(fake.detailCalls).subject,
        makeDetail(JOB_1, {
          changeRequests: [
            makeChangeRequest(CR1, JOB_1),
            makeChangeRequest(CR1, JOB_1, { details: 'duplicate' }),
          ],
        }),
      );

      expect(service.selectionState()).toBe('entity-mismatch');
      expect(service.selectedChangeRequest()).toBeNull();
    });

    it('FPS-53 reports a missing job (404) and keeps the selection', () => {
      loadProposals([makeProposal(P1, JOB_1)]);
      service.selectProposal(P1);
      last(fake.detailCalls).subject.error(apiError(404, 'NOT_FOUND'));

      expect(service.selectionState()).toBe('job-not-found');
      expect(service.entityExistence()).toBe('absent');
      expect(service.detail()).toBeNull();
      expect(service.selected()?.id).toBe(P1);
      expect(service.detailError()?.message).not.toContain('secret');
    });

    it('FPS-54 clears a retained detail when a refresh reports 404', () => {
      openProposal(makeProposal(P1, JOB_1));
      service.refreshDetail();
      last(fake.detailCalls).subject.error(apiError(404, 'NOT_FOUND'));

      expect(service.detail()).toBeNull();
      expect(service.selectionState()).toBe('job-not-found');
      expect(service.isDetailStale()).toBe(false);
      expect(service.pricingReview()).toBeNull();
    });

    it('FPS-55 marks retained detail stale when a refresh fails and clears it on success', () => {
      const proposal = makeProposal(P1, JOB_1);
      openProposal(proposal);

      service.refreshDetail();
      expect(service.isDetailRefreshing()).toBe(true);
      expect(service.actionContextState()).toBe('loading');

      last(fake.detailCalls).subject.error(apiError(500, 'SERVER_ERROR'));

      expect(service.isDetailStale()).toBe(true);
      expect(service.detailRefreshError()?.kind).toBe('server-failure');
      expect(service.selectedProposal()).toBe(proposal);
      expect(service.actionContextState()).toBe('stale');

      service.refreshDetail();
      respond(
        last(fake.detailCalls).subject,
        makeDetail(JOB_1, { proposals: [proposal] }),
      );

      expect(service.isDetailStale()).toBe(false);
      expect(service.actionContextState()).toBe('ready');
    });

    it('FPS-56 ignores duplicate detail refreshes and refresh without a selection', () => {
      service.refreshDetail();
      expect(fake.jobApi.getJobCard).not.toHaveBeenCalled();

      openProposal(makeProposal(P1, JOB_1));
      service.refreshDetail();
      service.refreshDetail();

      expect(fake.jobApi.getJobCard).toHaveBeenCalledTimes(2);
    });

    it('FPS-57 clearing the selection cancels the request and ignores late data', () => {
      loadProposals([makeProposal(P1, JOB_1)]);
      service.selectProposal(P1);
      const call = last(fake.detailCalls);

      service.clearSelection();

      expect(call.subject.observed).toBe(false);
      expect(service.selected()).toBeNull();

      respond(
        call.subject,
        makeDetail(JOB_1, { proposals: [makeProposal(P1, JOB_1)] }),
      );

      expect(service.detail()).toBeNull();
      expect(service.selectionState()).toBe('none');
    });

    it('FPS-58 distinguishes list membership from authoritative existence', () => {
      const proposal = makeProposal(P1, JOB_1);
      openProposal(proposal);

      expect(service.selectedMissingFromList()).toBe(false);

      // The next list no longer contains the selection.
      loadProposals([makeProposal(P2, JOB_2)]);

      expect(service.selectedMissingFromList()).toBe(true);
      expect(service.selectedListRecord()).toBeNull();
      expect(service.entityExistence()).toBe('confirmed');
      expect(service.selectedProposal()).toBe(proposal);
      expect(service.selectionState()).toBe('ready');
    });

    it('FPS-59 does not report membership loss before the list is loaded or after a filter reset', () => {
      openProposal(makeProposal(P1, JOB_1));

      service.setProposalStatusFilter('Cancelled');

      expect(service.proposals()).toBeNull();
      expect(service.selectedMissingFromList()).toBe(false);
      expect(service.selectionState()).toBe('ready');
    });

    it('FPS-60 list loading and detail loading are independent', () => {
      loadProposals([makeProposal(P1, JOB_1)]);
      service.selectProposal(P1);
      service.refreshProposals();

      expect(service.isProposalsLoading()).toBe(true);
      expect(service.isDetailLoading()).toBe(true);

      respond(last(fake.detailCalls).subject, makeDetail(JOB_1));

      expect(service.isProposalsLoading()).toBe(true);
      expect(service.isDetailLoading()).toBe(false);
    });
  });

  describe('pricing and review state', () => {
    it('FPS-61 exposes read-only items, prices, quantities, versions, notes and audit', () => {
      const proposal = makeProposal(P1, JOB_1, {
        items: [
          makeItem(ITEM_1, { version: 3, linkedIssueId: uuid(8, 1) }),
          makeItem(ITEM_2, {
            title: 'Labour',
            kind: 'Labour',
            qty: 1,
            unitPrice: 500,
            amount: 500,
            status: 'Approved',
          }),
        ],
      });

      openProposal(proposal);

      const review = service.pricingReview();

      expect(review?.proposalId).toBe(P1);
      expect(review?.items).toHaveLength(2);
      expect(review?.items[0]).toMatchObject({
        id: ITEM_1,
        title: 'Brake pads',
        kind: 'Part',
        status: 'Proposed',
        qty: 2,
        version: 3,
        linkedIssueId: uuid(8, 1),
        unitPrice: 1500.5,
        unitPriceFormatted: '1500.50',
        amount: 3001,
        amountFormatted: '3001.00',
        calculatedAmountFormatted: '3001.00',
        amountMatchesCalculation: true,
      });
      expect(review?.managerNote).toBe('Manager internal note');
      expect(review?.mechanicNote).toBe('Mechanic private note');
      expect(review?.customerNote).toBe('Customer private note');
      expect(review?.audit.map(entry => entry.action)).toEqual([
        'Submitted',
        'Priced',
      ]);
      expect(service.proposalAudit()).toBe(proposal.audit);
    });

    it('FPS-62 preserves backend totals and reports no diagnostics when consistent', () => {
      openProposal(makeProposal(P1, JOB_1));

      const review = service.pricingReview();

      expect(review?.backendTotal).toBe(3501);
      expect(review?.backendTotalFormatted).toBe('3501.00');
      expect(review?.backendApprovedTotal).toBe(500);
      expect(review?.backendApprovedTotalFormatted).toBe('500.00');
      expect(review?.itemsAmountSumFormatted).toBe('3501.00');
      expect(review?.approvedItemsAmountSumFormatted).toBe('500.00');
      expect(review?.totalMatches).toBe(true);
      expect(review?.approvedTotalMatches).toBe(true);
      expect(service.pricingDiagnostics()).toEqual([]);
    });

    it('FPS-63 never replaces a discrepant backend total; it only adds a safe diagnostic', () => {
      openProposal(makeProposal(P1, JOB_1, { total: 999 }));

      const review = service.pricingReview();

      expect(review?.backendTotal).toBe(999);
      expect(review?.backendTotalFormatted).toBe('999.00');
      expect(review?.itemsAmountSumFormatted).toBe('3501.00');
      expect(review?.totalMatches).toBe(false);
      expect(review?.diagnostics.map(d => d.code)).toEqual([
        'total-mismatch',
      ]);
      expect(review?.diagnostics[0].message).not.toContain('999');
    });

    it('FPS-64 reports line amount and approved total discrepancies without altering backend values', () => {
      openProposal(
        makeProposal(P1, JOB_1, {
          approvedTotal: 123,
          items: [
            makeItem(ITEM_1, { amount: 3000 }),
            makeItem(ITEM_2, {
              qty: 1,
              unitPrice: 500,
              amount: 500,
              status: 'Approved',
            }),
          ],
          total: 3500,
        }),
      );

      const review = service.pricingReview();

      expect(review?.items[0].amount).toBe(3000);
      expect(review?.items[0].calculatedAmountFormatted).toBe('3001.00');
      expect(review?.items[0].amountMatchesCalculation).toBe(false);
      expect(review?.backendApprovedTotal).toBe(123);
      expect(review?.diagnostics.map(d => d.code)).toEqual([
        'line-amount-mismatch',
        'approved-total-mismatch',
      ]);
      expect(review?.diagnostics[0].itemId).toBe(ITEM_1);
    });

    it('FPS-65 uses exact cent arithmetic instead of binary floating point', () => {
      // 0.1 * 3 === 0.30000000000000004 in binary floating point.
      const review = analyzeProposalPricing(
        makeProposal(P1, JOB_1, {
          items: [makeItem(ITEM_1, { qty: 3, unitPrice: 0.1, amount: 0.3 })],
          total: 0.3,
          approvedTotal: 0,
        }),
      );

      expect(0.1 * 3).not.toBe(0.3);
      expect(review.items[0].amountMatchesCalculation).toBe(true);
      expect(review.items[0].calculatedAmountFormatted).toBe('0.30');
      expect(review.itemsAmountSumFormatted).toBe('0.30');
      expect(review.totalMatches).toBe(true);
      expect(review.diagnostics).toEqual([]);

      const many = analyzeProposalPricing(
        makeProposal(P1, JOB_1, {
          items: [
            makeItem(ITEM_1, { qty: 1, unitPrice: 0.1, amount: 0.1 }),
            makeItem(ITEM_2, { qty: 1, unitPrice: 0.2, amount: 0.2 }),
          ],
          total: 0.3,
          approvedTotal: 0,
        }),
      );

      expect(0.1 + 0.2).not.toBe(0.3);
      expect(many.itemsAmountSumFormatted).toBe('0.30');
      expect(many.totalMatches).toBe(true);
    });

    it('FPS-66 marks unverifiable values and unknown item statuses without guessing', () => {
      const review = analyzeProposalPricing(
        makeProposal(P1, JOB_1, {
          items: [
            makeItem(ITEM_1, {
              status: 'FutureItemStatus',
              unitPrice: 1.005,
              amount: 2.01,
              qty: 2,
            }),
          ],
          total: 2.01,
          approvedTotal: 0,
        }),
      );

      expect(review.items[0].unitPriceFormatted).toBeNull();
      expect(review.items[0].amountMatchesCalculation).toBeNull();
      expect(review.approvedTotalMatches).toBeNull();
      expect(review.approvedItemsAmountSumFormatted).toBeNull();
      expect(review.diagnostics.map(d => d.code)).toEqual([
        'unverifiable-amount',
        'unverifiable-approved-total',
      ]);
    });

    it('FPS-67 exposes change request details read-only and no pricing for it', () => {
      const request = makeChangeRequest(CR1, JOB_1, {
        managerNote: 'Manager says',
        mechanicNote: 'Mechanic says',
      });

      openChangeRequest(request);

      const selected = service.selectedChangeRequest();

      expect(selected?.details).toBe('Customer wants extra work');
      expect(selected?.managerNote).toBe('Manager says');
      expect(selected?.mechanicNote).toBe('Mechanic says');
      expect(selected?.number).toBe(request.number);
      expect(service.pricingReview()).toBeNull();
      expect(service.proposalAudit()).toEqual([]);
    });

    it('FPS-68 pricing is only derived from the authoritative proposal, not the list record', () => {
      loadProposals([makeProposal(P1, JOB_1, { total: 111 })]);
      service.selectProposal(P1);

      expect(service.pricingReview()).toBeNull();

      respond(
        last(fake.detailCalls).subject,
        makeDetail(JOB_1, { proposals: [makeProposal(P1, JOB_1)] }),
      );

      expect(service.pricingReview()?.backendTotal).toBe(3501);
    });
  });

  describe('advisory action eligibility', () => {
    it('FPS-69 uses the authoritative job status for a pending proposal', () => {
      openProposal(makeProposal(P1, JOB_1), 'AwaitingManagerReview');

      const actions = service.proposalActions();

      expect(actions?.advisory).toBe(true);
      expect(actions?.contextState).toBe('ready');
      expect(actions?.forward.actionReady).toBe(true);
      expect(actions?.forward.eligibility.status).toBe('allowed');
      expect(actions?.returnToMechanic.actionReady).toBe(true);
      expect(actions?.release.actionReady).toBe(false);
      expect(actions?.release.eligibility.status).toBe('blocked-by-backend');
      expect(actions?.release.eligibility.backendSupported).toBe(false);
    });

    it('FPS-70 offers set price per item on a pending proposal and blocks revision', () => {
      openProposal(makeProposal(P1, JOB_1));

      const items = service.proposalActions()?.items ?? [];

      expect(items.map(item => item.itemId)).toEqual([ITEM_1, ITEM_2]);

      for (const item of items) {
        expect(item.setPrice.actionReady).toBe(true);
        expect(item.revise.actionReady).toBe(false);
        expect(item.revise.eligibility.status).toBe('blocked-by-backend');
      }
    });

    it('FPS-71 allows revision on a published proposal and blocks set price', () => {
      openProposal(
        makeProposal(P1, JOB_1, { status: 'AwaitingCustomer' }),
        'AwaitingCustomerApproval',
      );

      const actions = service.proposalActions();

      expect(actions?.items[0].revise.actionReady).toBe(true);
      expect(actions?.items[0].setPrice.actionReady).toBe(false);
      expect(actions?.forward.eligibility.status).toBe('blocked-by-backend');
    });

    it('FPS-72 allows release only after the customer responded', () => {
      openProposal(
        makeProposal(P1, JOB_1, { status: 'CustomerResponded' }),
        'AwaitingRelease',
      );

      const actions = service.proposalActions();

      expect(actions?.release.actionReady).toBe(true);
      expect(actions?.forward.actionReady).toBe(false);
      expect(actions?.items[0].revise.actionReady).toBe(true);
    });

    it('FPS-73 blocks revising items of a released proposal by frontend safety', () => {
      openProposal(
        makeProposal(P1, JOB_1, { status: 'ReleasedToMechanic' }),
        'InProgress',
      );

      const released = service.proposalActions()?.items[0].revise;

      expect(released?.actionReady).toBe(false);
      expect(released?.eligibility.status).toBe('blocked-by-frontend-safety');
      expect(released?.eligibility.backendSupported).toBe(true);
      expect(released?.eligibility.reason).toBe(
        'released-proposal-revision-restricted',
      );
    });

    it('FPS-74 blocks revising a Released item on an editable proposal', () => {
      openProposal(
        makeProposal(P1, JOB_1, {
          status: 'CustomerResponded',
          items: [makeItem(ITEM_1, { status: 'Released' })],
        }),
        'AwaitingRelease',
      );

      const revise = service.proposalActions()?.items[0].revise;

      expect(revise?.actionReady).toBe(false);
      expect(revise?.eligibility.reason).toBe(
        'released-item-revision-restricted',
      );
    });

    it('FPS-75 blocks every action for terminal jobs by frontend safety', () => {
      for (const status of ['Completed', 'Closed']) {
        openProposal(makeProposal(P1, JOB_1), status);

        const actions = service.proposalActions();

        expect(actions?.forward.actionReady).toBe(false);
        expect(actions?.forward.eligibility.status).toBe(
          'blocked-by-frontend-safety',
        );
        expect(actions?.forward.eligibility.reason).toBe(
          'terminal-job-status',
        );
        expect(actions?.forward.eligibility.backendSupported).toBe(true);
        expect(actions?.items[0].setPrice.actionReady).toBe(false);

        service.clearSelection();
        fake.detailCalls.length = 0;
      }
    });

    it('FPS-76 treats unknown and missing job statuses as unresolved', () => {
      openProposal(makeProposal(P1, JOB_1), 'FutureJobStatus');

      expect(service.proposalActions()?.forward.eligibility.status).toBe(
        'unresolved',
      );
      expect(service.proposalActions()?.forward.eligibility.reason).toBe(
        'unknown-job-status',
      );
      expect(service.proposalActions()?.forward.actionReady).toBe(false);

      service.clearSelection();
      openProposal(makeProposal(P1, JOB_1), '');

      expect(service.proposalActions()?.forward.eligibility.reason).toBe(
        'missing-authoritative-job-status',
      );
      expect(service.proposalActions()?.forward.actionReady).toBe(false);
    });

    it('FPS-77 treats unknown proposal and item statuses as unresolved', () => {
      openProposal(makeProposal(P1, JOB_1, { status: 'FutureStatus' }));

      const actions = service.proposalActions();

      expect(actions?.forward.eligibility.status).toBe('unresolved');
      expect(actions?.forward.eligibility.reason).toBe(
        'unknown-proposal-status',
      );
      expect(actions?.items[0].revise.eligibility.reason).toBe(
        'unknown-proposal-status',
      );

      service.clearSelection();
      openProposal(
        makeProposal(P1, JOB_1, {
          items: [makeItem(ITEM_1, { status: 'FutureItemStatus' })],
        }),
      );

      const item = service.proposalActions()?.items[0];

      expect(item?.setPrice.eligibility.status).toBe('unresolved');
      expect(item?.setPrice.eligibility.reason).toBe('unknown-item-status');
      expect(item?.setPrice.actionReady).toBe(false);
    });

    it('FPS-78 never infers job status from proposal status', () => {
      // A released proposal does not make a Completed job actionable.
      openProposal(
        makeProposal(P1, JOB_1, { status: 'PendingManagerReview' }),
        'Completed',
      );

      expect(service.authoritativeJobStatus()).toBe('Completed');
      expect(service.proposalActions()?.forward.actionReady).toBe(false);

      service.clearSelection();
      openProposal(
        makeProposal(P1, JOB_1, { status: 'PendingManagerReview' }),
        'Open',
      );

      expect(service.proposalActions()?.forward.actionReady).toBe(true);
    });

    it('FPS-79 evaluates change request actions from the authoritative job status', () => {
      openChangeRequest(makeChangeRequest(CR1, JOB_1), 'InProgress');

      const actions = service.changeRequestActions();

      expect(actions?.advisory).toBe(true);
      expect(actions?.forward.actionReady).toBe(true);
      expect(actions?.decline.actionReady).toBe(true);
      expect(service.proposalActions()).toBeNull();
    });

    it('FPS-80 blocks handled, unknown and terminal change requests', () => {
      openChangeRequest(
        makeChangeRequest(CR1, JOB_1, { status: 'Declined' }),
        'InProgress',
      );

      expect(service.changeRequestActions()?.forward.eligibility.status).toBe(
        'blocked-by-backend',
      );
      expect(service.changeRequestActions()?.decline.actionReady).toBe(false);

      service.clearSelection();
      openChangeRequest(
        makeChangeRequest(CR1, JOB_1, { status: 'FutureStatus' }),
      );

      expect(service.changeRequestActions()?.forward.eligibility.status).toBe(
        'unresolved',
      );

      service.clearSelection();
      openChangeRequest(makeChangeRequest(CR1, JOB_1), 'Closed');

      expect(service.changeRequestActions()?.forward.eligibility.reason).toBe(
        'terminal-job-status',
      );
      expect(service.changeRequestActions()?.forward.actionReady).toBe(false);
    });

    it('FPS-81 blocks readiness while detail is loading, unavailable, stale or unresolved', () => {
      loadProposals([makeProposal(P1, JOB_1)]);
      service.selectProposal(P1);

      expect(service.actionContextState()).toBe('loading');
      expect(service.proposalActions()?.forward.contextState).toBe('loading');
      expect(service.proposalActions()?.forward.actionReady).toBe(false);
      expect(service.proposalActions()?.forward.eligibility.status).toBe(
        'unresolved',
      );

      last(fake.detailCalls).subject.error(apiError(500, 'SERVER_ERROR'));
      expect(service.actionContextState()).toBe('detail-unavailable');
      expect(service.proposalActions()?.release.actionReady).toBe(false);

      service.refreshDetail();
      respond(
        last(fake.detailCalls).subject,
        makeDetail(JOB_1, { proposals: [makeProposal(P1, JOB_1)] }),
      );
      expect(service.actionContextState()).toBe('ready');
      expect(service.proposalActions()?.forward.actionReady).toBe(true);

      service.refreshDetail();
      last(fake.detailCalls).subject.error(apiError(500, 'SERVER_ERROR'));
      expect(service.actionContextState()).toBe('stale');
      expect(service.proposalActions()?.forward.actionReady).toBe(false);
      expect(service.proposalActions()?.forward.contextState).toBe('stale');
      expect(service.proposalActions()?.items[0].setPrice.actionReady).toBe(
        false,
      );
    });

    it('FPS-82 has no action readiness without a selection', () => {
      loadProposals([makeProposal(P1, JOB_1)]);

      expect(service.proposalActions()).toBeNull();
      expect(service.changeRequestActions()).toBeNull();
      expect(service.actionContextState()).toBe('no-selection');
    });

    it('FPS-83 unresolved context messages are fixed and safe', () => {
      loadProposals([makeProposal(P1, JOB_1)]);
      service.selectProposal(P1);
      last(fake.detailCalls).subject.error(new Error(SENSITIVE));

      const message =
        service.proposalActions()?.forward.eligibility.message ?? '';

      expect(message).not.toBe('');
      expect(message).not.toContain('secret');
      expect(message).not.toContain('sig=');
    });

    it('FPS-84 session expiry between timer ticks is caught before actions are used', () => {
      session.setSession(makeSession('manager-001', 20_000));
      TestBed.tick();
      openProposal(makeProposal(P1, JOB_1));

      expect(service.proposalActions()?.forward.actionReady).toBe(true);

      vi.setSystemTime(START + 30_000);
      service.reevaluateActionContext();

      expect(service.proposalActions()).toBeNull();
      expect(service.selected()).toBeNull();
      expect(service.actionContextState()).toBe('no-selection');
      expect(service.authFailure()).toBe('unauthorized');
    });
  });

  describe('session security', () => {
    it('FPS-85 refuses to load without a session and reports unauthorized', () => {
      session.clearSession();
      TestBed.tick();

      service.refreshProposals();
      service.refreshChangeRequests();
      service.refreshDetail();

      expect(service.selectProposal(P1)).toBe(false);
      expect(service.setProposalStatusFilter('Cancelled')).toBe(false);
      expect(service.setPendingOnly(true)).toBe(false);
      expect(fake.fixProofApi.getProposals).not.toHaveBeenCalled();
      expect(fake.fixProofApi.getChangeRequests).not.toHaveBeenCalled();
      expect(fake.jobApi.getJobCard).not.toHaveBeenCalled();
      expect(service.authFailure()).toBe('unauthorized');
      expect(service.proposalsViewState()).toBe('error');
      expect(serviceTimers()).toBe(0);
    });

    it('FPS-86 logout clears every list, the selection and the detail and cancels requests', () => {
      loadProposals([makeProposal(P1, JOB_1)]);
      loadChangeRequests([makeChangeRequest(CR1, JOB_1)]);
      openProposal(makeProposal(P1, JOB_1));
      service.refreshProposals();
      service.refreshChangeRequests();
      service.refreshDetail();
      const pendingProposals = last(fake.proposalCalls);
      const pendingChanges = last(fake.changeCalls);
      const pendingDetail = last(fake.detailCalls);

      session.clearSession();
      TestBed.tick();

      expect(pendingProposals.subject.observed).toBe(false);
      expect(pendingChanges.subject.observed).toBe(false);
      expect(pendingDetail.subject.observed).toBe(false);

      expect(service.proposals()).toBeNull();
      expect(service.changeRequests()).toBeNull();
      expect(service.selected()).toBeNull();
      expect(service.detail()).toBeNull();
      expect(service.pricingReview()).toBeNull();
      expect(service.isProposalsLoading()).toBe(false);
      expect(service.isChangeRequestsLoading()).toBe(false);
      expect(service.isDetailLoading()).toBe(false);
      expect(service.authFailure()).toBe('unauthorized');
      expect(serviceTimers()).toBe(0);

      respond(pendingProposals.subject, [makeProposal(P2, JOB_2)]);
      respond(pendingChanges.subject, [makeChangeRequest(CR2, JOB_2)]);
      respond(pendingDetail.subject, makeDetail(JOB_1));

      expect(service.proposals()).toBeNull();
      expect(service.detail()).toBeNull();
    });

    it('FPS-87 session expiry clears protected state through the local check', () => {
      session.setSession(makeSession('manager-001', 20_000));
      TestBed.tick();
      openProposal(makeProposal(P1, JOB_1));

      vi.advanceTimersByTime(FIXPROOF_STATE_CHECK_INTERVAL_MS);
      expect(service.proposals()).not.toBeNull();

      vi.advanceTimersByTime(FIXPROOF_STATE_CHECK_INTERVAL_MS);

      expect(service.proposals()).toBeNull();
      expect(service.detail()).toBeNull();
      expect(service.selected()).toBeNull();
      expect(service.authFailure()).toBe('unauthorized');
      expect(serviceTimers()).toBe(0);
    });

    it('FPS-88 session replacement clears previous user data and rejects late responses', () => {
      service.refreshProposals();
      const oldProposals = last(fake.proposalCalls);
      service.refreshChangeRequests();
      const oldChanges = last(fake.changeCalls);

      session.setSession(makeSession('manager-002'));
      TestBed.tick();

      expect(service.isProposalsLoading()).toBe(false);
      expect(service.authFailure()).toBeNull();

      respond(oldProposals.subject, [makeProposal(P1, JOB_1)]);
      respond(oldChanges.subject, [makeChangeRequest(CR1, JOB_1)]);

      expect(service.proposals()).toBeNull();
      expect(service.changeRequests()).toBeNull();
    });

    it('FPS-89 a replaced session cannot receive the previous selection detail', () => {
      loadProposals([makeProposal(P1, JOB_1)]);
      service.selectProposal(P1);
      const old = last(fake.detailCalls);

      session.setSession(makeSession('manager-002'));
      TestBed.tick();

      respond(
        old.subject,
        makeDetail(JOB_1, { proposals: [makeProposal(P1, JOB_1)] }),
      );

      expect(service.selected()).toBeNull();
      expect(service.detail()).toBeNull();
      expect(service.selectedProposal()).toBeNull();
    });

    it('FPS-90 a new session loads independently and sees no previous customer data', () => {
      loadProposals([
        makeProposal(P1, JOB_1, { customerName: 'Previous Customer' }),
      ]);
      openProposal(makeProposal(P1, JOB_1));

      session.setSession(makeSession('manager-002'));
      TestBed.tick();

      loadProposals([makeProposal(P2, JOB_2)]);

      expect(service.proposals()).toHaveLength(1);
      expect(JSON.stringify(service.proposals())).not.toContain(
        'Previous Customer',
      );
      expect(service.selected()).toBeNull();
    });

    it('FPS-91 can load again after logout and a fresh sign-in', () => {
      loadChangeRequests([makeChangeRequest(CR1, JOB_1)]);

      session.clearSession();
      TestBed.tick();
      expect(service.authFailure()).toBe('unauthorized');

      session.setSession(makeSession('manager-003'));
      TestBed.tick();
      loadChangeRequests([makeChangeRequest(CR2, JOB_2)]);

      expect(service.authFailure()).toBeNull();
      expect(service.changeRequests()?.[0].id).toBe(CR2);
    });

    it('FPS-92 treats HTTP 401 on the proposal list as ended session and clears everything', () => {
      loadChangeRequests([makeChangeRequest(CR1, JOB_1)]);
      openProposal(makeProposal(P1, JOB_1));
      service.refreshProposals();
      last(fake.proposalCalls).subject.error(apiError(401, 'UNAUTHORIZED'));

      expect(service.authFailure()).toBe('unauthorized');
      expect(service.proposalsError()?.requiresSignIn).toBe(true);
      expect(service.changeRequests()).toBeNull();
      expect(service.selected()).toBeNull();
      expect(service.detail()).toBeNull();
      expect(service.proposalsError()?.message).not.toContain('secret');
    });

    it('FPS-93 treats HTTP 403 on the change request list as forbidden and clears everything', () => {
      loadProposals([makeProposal(P1, JOB_1)]);
      service.refreshChangeRequests();
      last(fake.changeCalls).subject.error(apiError(403, 'FORBIDDEN'));

      expect(service.authFailure()).toBe('forbidden');
      expect(service.proposals()).toBeNull();
      expect(service.changeRequestsViewState()).toBe('error');
    });

    it('FPS-94 treats HTTP 401 and 403 on the detail as access loss for the whole state', () => {
      loadProposals([makeProposal(P1, JOB_1)]);
      service.selectProposal(P1);
      last(fake.detailCalls).subject.error(apiError(401, 'UNAUTHORIZED'));

      expect(service.authFailure()).toBe('unauthorized');
      expect(service.proposals()).toBeNull();
      expect(service.selected()).toBeNull();
      expect(service.selectionState()).toBe('error');

      // The revoked session cannot reload; a different valid session can.
      service.refreshProposals();
      expect(fake.fixProofApi.getProposals).toHaveBeenCalledTimes(1);
      expect(service.authFailure()).toBe('unauthorized');

      session.setSession(makeSession('manager-002'));
      TestBed.tick();
      loadProposals([makeProposal(P1, JOB_1)]);
      expect(service.authFailure()).toBeNull();

      service.selectProposal(P1);
      last(fake.detailCalls).subject.error(apiError(403, 'FORBIDDEN'));

      expect(service.authFailure()).toBe('forbidden');
      expect(service.detail()).toBeNull();
    });

    it('FPS-95 never uses browser storage', () => {
      const getItem = vi.spyOn(Storage.prototype, 'getItem');
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      const removeItem = vi.spyOn(Storage.prototype, 'removeItem');

      loadProposals([makeProposal(P1, JOB_1)]);
      openProposal(makeProposal(P1, JOB_1));
      session.clearSession();
      TestBed.tick();

      expect(getItem).not.toHaveBeenCalled();
      expect(setItem).not.toHaveBeenCalled();
      expect(removeItem).not.toHaveBeenCalled();
    });

    it('FPS-96 does not log tokens, records or backend errors', () => {
      const spies = [
        vi.spyOn(console, 'log'),
        vi.spyOn(console, 'warn'),
        vi.spyOn(console, 'error'),
        vi.spyOn(console, 'info'),
        vi.spyOn(console, 'debug'),
      ];

      openProposal(makeProposal(P1, JOB_1));
      service.refreshProposals();
      last(fake.proposalCalls).subject.error(apiError(500, 'SERVER_ERROR'));
      service.refreshDetail();
      last(fake.detailCalls).subject.error(new Error(SENSITIVE));

      for (const spy of spies) {
        expect(spy).not.toHaveBeenCalled();
      }
    });

    it('FPS-97 error messages never contain backend text, tokens or media URLs', () => {
      service.refreshProposals();
      last(fake.proposalCalls).subject.error(apiError(500, 'SERVER_ERROR'));
      service.refreshChangeRequests();
      last(fake.changeCalls).subject.error(new Error(SENSITIVE));

      const messages = [
        service.proposalsError()?.message,
        service.changeRequestsError()?.message,
      ];

      for (const message of messages) {
        expect(message).toBeTruthy();
        expect(message).not.toContain('secret');
        expect(message).not.toContain('sig=');
        expect(message).not.toContain('/api/');
        expect(message).not.toContain('abc123');
      }
    });
  });

  describe('feature access revocation', () => {
    const KINDS: FixProofAccessRevocationKind[] = ['unauthorized', 'forbidden'];

    function counts(): number[] {
      return [
        fake.proposalCalls.length,
        fake.changeCalls.length,
        fake.detailCalls.length,
      ];
    }

    /** Lists, a ready selection with detail, and a stale proposal list. */
    function populate(): void {
      loadChangeRequests([makeChangeRequest(CR1, JOB_1)]);
      openProposal(makeProposal(P1, JOB_1));
      service.refreshProposals();
      last(fake.proposalCalls).subject.error(apiError(500, 'SERVER_ERROR'));
    }

    function expectRevoked(kind: FixProofAccessRevocationKind): void {
      expect(service.accessRevoked()).toBe(true);
      expect(service.authFailure()).toBe(kind);
      expect(service.proposals()).toBeNull();
      expect(service.changeRequests()).toBeNull();
      expect(service.visibleProposals()).toEqual([]);
      expect(service.visibleChangeRequests()).toEqual([]);
      expect(service.selected()).toBeNull();
      expect(service.detail()).toBeNull();
      expect(service.authoritativeJobStatus()).toBeNull();
      expect(service.selectedProposal()).toBeNull();
      expect(service.selectedChangeRequest()).toBeNull();
      expect(service.selectedListRecord()).toBeNull();
      expect(service.pricingReview()).toBeNull();
      expect(service.pricingDiagnostics()).toEqual([]);
      expect(service.proposalAudit()).toEqual([]);
      expect(service.changeRequestChanges()).toEqual([]);
      expect(service.isProposalsStale()).toBe(false);
      expect(service.isChangeRequestsStale()).toBe(false);
      expect(service.isDetailStale()).toBe(false);
      expect(service.proposalsRefreshError()).toBeNull();
      expect(service.changeRequestsRefreshError()).toBeNull();
      expect(service.detailRefreshError()).toBeNull();
      expect(service.proposalsLastSyncedAt()).toBeNull();
      expect(service.changeRequestsLastSyncedAt()).toBeNull();
      expect(service.detailLastSyncedAt()).toBeNull();
      expect(service.isProposalsLoading()).toBe(false);
      expect(service.isChangeRequestsLoading()).toBe(false);
      expect(service.isDetailLoading()).toBe(false);
      expect(service.proposalActions()).toBeNull();
      expect(service.changeRequestActions()).toBeNull();
      expect(service.actionContextState()).toBe('no-selection');
      expect(service.selectionState()).toBe('error');
      expect(service.proposalsViewState()).toBe('error');
      expect(service.changeRequestsViewState()).toBe('error');
    }

    it.each(KINDS)(
      'FPS-109 revokeFeatureAccess(%s) synchronously clears every protected value without HTTP',
      kind => {
        populate();

        expect(service.isProposalsStale()).toBe(true);
        expect(service.pricingReview()).not.toBeNull();
        expect(service.proposalActions()?.forward.actionReady).toBe(true);
        expect(serviceTimers()).toBe(1);

        const before = counts();

        service.revokeFeatureAccess(kind);

        expectRevoked(kind);
        expect(counts()).toEqual(before);
        expect(serviceTimers()).toBe(0);
        httpMock.expectNone(() => true);
      },
    );

    it('FPS-110 cancels pending proposal, change request and detail reads and ignores late successes', () => {
      populate();
      service.refreshProposals();
      service.refreshChangeRequests();
      service.refreshDetail();
      const proposals = last(fake.proposalCalls);
      const changes = last(fake.changeCalls);
      const detail = last(fake.detailCalls);

      expect(service.isProposalsLoading()).toBe(true);
      expect(service.isChangeRequestsLoading()).toBe(true);
      expect(service.isDetailLoading()).toBe(true);

      service.revokeFeatureAccess('unauthorized');

      expect(proposals.subject.observed).toBe(false);
      expect(changes.subject.observed).toBe(false);
      expect(detail.subject.observed).toBe(false);
      expectRevoked('unauthorized');

      respond(proposals.subject, [makeProposal(P2, JOB_2)]);
      respond(changes.subject, [makeChangeRequest(CR2, JOB_2)]);
      respond(
        detail.subject,
        makeDetail(JOB_1, { proposals: [makeProposal(P1, JOB_1)] }),
      );
      TestBed.tick();

      expectRevoked('unauthorized');
    });

    it('FPS-111 ignores late network and HTTP 500 failures and requests that never complete', () => {
      loadProposals([makeProposal(P1, JOB_1)]);
      service.selectProposal(P1);
      const neverCompletes = last(fake.detailCalls);
      service.refreshProposals();
      service.refreshChangeRequests();
      const proposals = last(fake.proposalCalls);
      const changes = last(fake.changeCalls);

      service.revokeFeatureAccess('forbidden');

      proposals.subject.error(apiError(0, 'NETWORK_ERROR'));
      changes.subject.error(apiError(500, 'SERVER_ERROR'));
      vi.advanceTimersByTime(FIXPROOF_STATE_CHECK_INTERVAL_MS * 4);
      TestBed.tick();

      expect(neverCompletes.subject.observed).toBe(false);
      expectRevoked('forbidden');
      expect(service.changeRequestsError()?.kind).toBe('forbidden');
      expect(serviceTimers()).toBe(0);
    });

    it('FPS-112 refresh, selection and server filter changes are refused for the revoked session', () => {
      populate();
      service.revokeFeatureAccess('forbidden');
      const before = counts();

      service.refreshProposals();
      service.refreshChangeRequests();
      service.refreshDetail();
      expect(service.selectProposal(P1)).toBe(false);
      expect(service.selectChangeRequest(CR1)).toBe(false);
      expect(service.setProposalStatusFilter('Cancelled')).toBe(false);
      expect(service.setPendingOnly(true)).toBe(false);
      service.setProposalSearch('Kavitha');
      service.setChangeRequestLocalStatus('PendingManagerReview');
      service.clearSelection();
      service.reevaluateActionContext();
      TestBed.tick();

      expect(counts()).toEqual(before);
      expect(service.proposalFilter()).toEqual({ status: null });
      expect(service.changeRequestFilter()).toEqual({ pendingOnly: false });
      expect(service.inputError()).toBeNull();
      expectRevoked('forbidden');
    });

    it('FPS-113 the same session instance, logout and the local timer never lift the revocation', () => {
      loadProposals([makeProposal(P1, JOB_1)]);
      const current = session.session() as AuthSession;

      service.revokeFeatureAccess('unauthorized');

      session.setSession(current);
      TestBed.tick();
      vi.advanceTimersByTime(FIXPROOF_STATE_CHECK_INTERVAL_MS * 4);
      service.reevaluateActionContext();
      service.refreshProposals();

      expect(service.accessRevoked()).toBe(true);
      expect(service.authFailure()).toBe('unauthorized');

      session.clearSession();
      TestBed.tick();
      service.refreshProposals();
      service.refreshChangeRequests();

      expect(service.accessRevoked()).toBe(true);
      expect(fake.fixProofApi.getProposals).toHaveBeenCalledTimes(1);
      expect(fake.fixProofApi.getChangeRequests).not.toHaveBeenCalled();
    });

    it('FPS-114 a different valid session lifts the revocation without reloading and loads independently', () => {
      loadProposals([
        makeProposal(P1, JOB_1, { customerName: 'Previous Customer' }),
      ]);
      service.revokeFeatureAccess('forbidden');
      const before = counts();

      session.setSession(makeSession('manager-002'));
      TestBed.tick();

      expect(service.accessRevoked()).toBe(false);
      expect(service.authFailure()).toBeNull();
      expect(service.proposals()).toBeNull();
      expect(counts()).toEqual(before);

      loadProposals([makeProposal(P2, JOB_2)]);

      expect(service.proposals()?.map(p => p.id)).toEqual([P2]);
      expect(JSON.stringify(service.proposals())).not.toContain(
        'Previous Customer',
      );
    });

    it('FPS-115 reads started before the revocation never reach the next session', () => {
      service.refreshProposals();
      service.refreshChangeRequests();
      const proposals = last(fake.proposalCalls);
      const changes = last(fake.changeCalls);

      service.revokeFeatureAccess('unauthorized');
      session.setSession(makeSession('manager-002'));
      TestBed.tick();

      respond(proposals.subject, [makeProposal(P1, JOB_1)]);
      respond(changes.subject, [makeChangeRequest(CR1, JOB_1)]);

      expect(service.proposals()).toBeNull();
      expect(service.changeRequests()).toBeNull();
      expect(service.accessRevoked()).toBe(false);
    });

    it('FPS-116 repeated revocation is safe, adds no requests or timers and is ignored after destroy', () => {
      populate();
      const before = counts();

      expect(() => {
        service.revokeFeatureAccess('unauthorized');
        service.revokeFeatureAccess('unauthorized');
        service.revokeFeatureAccess('forbidden');
      }).not.toThrow();

      expectRevoked('forbidden');
      expect(counts()).toEqual(before);
      expect(serviceTimers()).toBe(0);

      service.ngOnDestroy();

      expect(() => service.revokeFeatureAccess('unauthorized')).not.toThrow();
      expect(service.authFailure()).toBeNull();
      expect(counts()).toEqual(before);
    });

    it.each([
      ['proposal list', 401, 'UNAUTHORIZED', 'unauthorized'],
      ['change request list', 403, 'FORBIDDEN', 'forbidden'],
      ['detail', 403, 'FORBIDDEN', 'forbidden'],
    ] as [string, number, ApiErrorCode, FixProofAccessRevocationKind][])(
      'FPS-117 HTTP 401/403 on the own %s read is latched until a new session',
      (source, status, code, kind) => {
        loadProposals([makeProposal(P1, JOB_1)]);

        if (source === 'proposal list') {
          service.refreshProposals();
          last(fake.proposalCalls).subject.error(apiError(status, code));
        } else if (source === 'change request list') {
          service.refreshChangeRequests();
          last(fake.changeCalls).subject.error(apiError(status, code));
        } else {
          service.selectProposal(P1);
          last(fake.detailCalls).subject.error(apiError(status, code));
        }

        const before = counts();

        service.refreshProposals();
        service.refreshChangeRequests();
        expect(service.selectProposal(P1)).toBe(false);

        expect(counts()).toEqual(before);
        expectRevoked(kind);

        session.setSession(makeSession('manager-002'));
        TestBed.tick();
        loadProposals([makeProposal(P2, JOB_2)]);

        expect(service.accessRevoked()).toBe(false);
        expect(service.authFailure()).toBeNull();
        expect(service.proposals()?.[0].id).toBe(P2);
      },
    );

    it('FPS-118 uses fixed messages, never backend text, and fails closed for an unknown kind', () => {
      service.refreshProposals();
      last(fake.proposalCalls).subject.error(apiError(500, 'SERVER_ERROR'));

      service.revokeFeatureAccess('forbidden');

      const forbidden = resolveFixProofError(
        new ApiError(403, 'FORBIDDEN', 'x'),
        'read',
      ).message;

      expect(service.proposalsError()?.message).toBe(forbidden);
      expect(service.detailError()?.message).toBe(forbidden);

      service.revokeFeatureAccess('bogus' as FixProofAccessRevocationKind);

      expect(service.authFailure()).toBe('unauthorized');
      expect(service.proposalsError()?.requiresSignIn).toBe(true);

      const exposed = JSON.stringify([
        service.proposalsError(),
        service.changeRequestsError(),
        service.detailError(),
      ]);

      expect(exposed).not.toContain('Access revoked');
      expect(exposed).not.toContain('secret');
      expect(exposed).not.toContain('sig=');
      expect(exposed).not.toContain('test-access-token');
    });
  });

  describe('lifecycle and cleanup', () => {
    it('FPS-98 runs a single local timer that never performs HTTP', () => {
      expect(serviceTimers()).toBe(0);

      service.refreshProposals();
      service.refreshChangeRequests();
      loadProposals([makeProposal(P1, JOB_1)]);
      service.selectProposal(P1);

      expect(serviceTimers()).toBe(1);

      respond(
        last(fake.detailCalls).subject,
        makeDetail(JOB_1, { proposals: [makeProposal(P1, JOB_1)] }),
      );
      respond(last(fake.changeCalls).subject, []);

      const calls = [
        fake.fixProofApi.getProposals.mock.calls.length,
        fake.fixProofApi.getChangeRequests.mock.calls.length,
        fake.jobApi.getJobCard.mock.calls.length,
      ];

      vi.advanceTimersByTime(FIXPROOF_STATE_CHECK_INTERVAL_MS * 10);

      expect([
        fake.fixProofApi.getProposals.mock.calls.length,
        fake.fixProofApi.getChangeRequests.mock.calls.length,
        fake.jobApi.getJobCard.mock.calls.length,
      ]).toEqual(calls);
      expect(serviceTimers()).toBe(1);
      httpMock.expectNone(() => true);
    });

    it('FPS-99 destroy cancels requests, clears state and removes the timer', () => {
      service.refreshProposals();
      const proposals = last(fake.proposalCalls);
      service.refreshChangeRequests();
      const changes = last(fake.changeCalls);
      loadProposals([makeProposal(P1, JOB_1)]);
      service.selectProposal(P1);
      const detail = last(fake.detailCalls);

      service.ngOnDestroy();

      expect(proposals.subject.observed).toBe(false);
      expect(changes.subject.observed).toBe(false);
      expect(detail.subject.observed).toBe(false);
      expect(serviceTimers()).toBe(0);
      expect(service.proposals()).toBeNull();
      expect(service.selected()).toBeNull();
    });

    it('FPS-100 ignores late responses and all actions after destroy', () => {
      service.refreshProposals();
      const proposals = last(fake.proposalCalls);
      service.refreshChangeRequests();
      const changes = last(fake.changeCalls);

      service.ngOnDestroy();

      respond(proposals.subject, [makeProposal(P1, JOB_1)]);
      respond(changes.subject, [makeChangeRequest(CR1, JOB_1)]);

      const counts = [
        fake.fixProofApi.getProposals.mock.calls.length,
        fake.fixProofApi.getChangeRequests.mock.calls.length,
      ];

      service.refreshProposals();
      service.refreshChangeRequests();
      service.refreshDetail();
      service.reevaluateActionContext();
      service.clearSelection();

      expect(service.selectProposal(P1)).toBe(false);
      expect(service.selectChangeRequest(CR1)).toBe(false);
      expect(service.setProposalStatusFilter('Cancelled')).toBe(false);
      expect(service.setPendingOnly(true)).toBe(false);
      expect([
        fake.fixProofApi.getProposals.mock.calls.length,
        fake.fixProofApi.getChangeRequests.mock.calls.length,
      ]).toEqual(counts);
      expect(service.proposals()).toBeNull();
      expect(service.changeRequests()).toBeNull();
      expect(serviceTimers()).toBe(0);
    });

    it('FPS-101 destroy is idempotent and later session changes are ignored', () => {
      loadProposals([makeProposal(P1, JOB_1)]);

      expect(() => {
        service.ngOnDestroy();
        service.ngOnDestroy();
      }).not.toThrow();

      session.clearSession();
      session.setSession(makeSession('manager-009'));
      TestBed.tick();

      expect(service.authFailure()).toBeNull();
      expect(service.proposals()).toBeNull();
      expect(serviceTimers()).toBe(0);
    });
  });

  describe('read-only contract', () => {
    it('FPS-102 never calls the mutation API', () => {
      openProposal(makeProposal(P1, JOB_1));
      loadChangeRequests([makeChangeRequest(CR1, JOB_1)]);
      service.selectChangeRequest(CR1);
      service.refreshDetail();
      service.setProposalStatusFilter('Cancelled');
      service.setPendingOnly(true);
      service.proposalActions();
      service.changeRequestActions();

      for (const spy of Object.values(fake.mutationApi)) {
        expect(spy).not.toHaveBeenCalled();
      }

      httpMock.expectNone(() => true);
    });

    it('FPS-103 only uses the read operations of the injected APIs', () => {
      expect(Object.keys(fake.fixProofApi).sort()).toEqual([
        'getChangeRequests',
        'getProposals',
      ]);
      expect(Object.keys(fake.jobApi)).toEqual(['getJobCard']);
    });

    it('FPS-104 exposes no mutation, pricing submission, release or optimistic operations', () => {
      const names = Object.getOwnPropertyNames(
        Object.getPrototypeOf(service),
      );
      const forbidden =
        /^(set(Item|Price)|revise|forward|return|release|decline|submit|approve|reject|assign|save|post|put|patch|update|apply|optimistic|reconcile)/i;

      expect(names.filter(name => forbidden.test(name))).toEqual([]);
    });

    it('FPS-105 never requests media', () => {
      openProposal(makeProposal(P1, JOB_1));
      vi.advanceTimersByTime(FIXPROOF_STATE_CHECK_INTERVAL_MS * 4);

      httpMock.expectNone(request => request.url.includes('/media/'));
    });
  });
});

describe('FixProofStateService with the real APIs (GET only)', () => {
  let service: FixProofStateService;
  let httpMock: HttpTestingController;
  let session: SessionService;

  const PROPOSALS_URL = `${BASE}/api/v1/manager/approvals/proposals`;
  const CHANGES_URL = `${BASE}/api/v1/manager/approvals/change-requests`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
        FixProofStateService,
      ],
    });

    session = TestBed.inject(SessionService);
    httpMock = TestBed.inject(HttpTestingController);
    session.setSession(makeSession());
    service = TestBed.inject(FixProofStateService);
    TestBed.tick();
  });

  afterEach(() => {
    service.ngOnDestroy();
  });

  it('FPS-106 sends only GET requests, one JobDetail per selection and none per row', () => {
    service.refreshProposals();
    const proposals = [
      makeProposal(P1, JOB_1),
      makeProposal(P2, JOB_2),
      makeProposal(P3, JOB_3),
    ];
    const listReq = httpMock.expectOne(
      request => request.url === PROPOSALS_URL,
    );

    expect(listReq.request.method).toBe('GET');
    expect(listReq.request.params.has('status')).toBe(false);
    listReq.flush(proposals);

    service.refreshChangeRequests();
    const changeReq = httpMock.expectOne(
      request => request.url === CHANGES_URL,
    );

    expect(changeReq.request.method).toBe('GET');
    expect(changeReq.request.params.get('pendingOnly')).toBe('false');
    changeReq.flush([makeChangeRequest(CR1, JOB_1)]);

    httpMock.expectNone(request => request.url.includes('/jobs/'));

    service.selectProposal(P2);
    const detailReq = httpMock.expectOne(
      `${BASE}/api/v1/manager/jobs/${JOB_2}`,
    );

    expect(detailReq.request.method).toBe('GET');
    detailReq.flush(makeDetail(JOB_2, { proposals: [proposals[1]] }));

    expect(service.selectionState()).toBe('ready');
    expect(service.selectedProposal()?.id).toBe(P2);

    httpMock.expectNone(() => true);
  });

  it('FPS-107 sends the explicit Cancelled status and pendingOnly parameters and cancels superseded reads', () => {
    service.refreshProposals();
    const first = httpMock.expectOne(
      request => request.url === PROPOSALS_URL,
    );

    service.setProposalStatusFilter('Cancelled');

    expect(first.cancelled).toBe(true);

    const second = httpMock.expectOne(
      request => request.url === PROPOSALS_URL,
    );

    expect(second.request.params.get('status')).toBe('Cancelled');
    second.flush([makeProposal(P1, JOB_1, { status: 'Cancelled' })]);

    service.setPendingOnly(true);
    const changeReq = httpMock.expectOne(
      request => request.url === CHANGES_URL,
    );

    expect(changeReq.request.params.get('pendingOnly')).toBe('true');
    changeReq.flush([]);

    expect(service.proposals()?.[0].status).toBe('Cancelled');
    expect(service.changeRequestsViewState()).toBe('empty');
  });

  it('FPS-108 cancels the HTTP detail request when the selection changes or on logout', () => {
    service.refreshProposals();
    httpMock
      .expectOne(request => request.url === PROPOSALS_URL)
      .flush([makeProposal(P1, JOB_1), makeProposal(P2, JOB_2)]);

    service.selectProposal(P1);
    const first = httpMock.expectOne(`${BASE}/api/v1/manager/jobs/${JOB_1}`);

    service.selectProposal(P2);

    expect(first.cancelled).toBe(true);

    const second = httpMock.expectOne(`${BASE}/api/v1/manager/jobs/${JOB_2}`);

    session.clearSession();
    TestBed.tick();

    expect(second.cancelled).toBe(true);
    expect(service.authFailure()).toBe('unauthorized');
  });

  it('FPS-119 revocation cancels in-flight HTTP reads, sends nothing and only a new session reads again', () => {
    service.refreshProposals();
    httpMock
      .expectOne(request => request.url === PROPOSALS_URL)
      .flush([makeProposal(P1, JOB_1)]);
    service.selectProposal(P1);
    const detailReq = httpMock.expectOne(`${BASE}/api/v1/manager/jobs/${JOB_1}`);
    service.refreshProposals();
    const listReq = httpMock.expectOne(request => request.url === PROPOSALS_URL);
    service.refreshChangeRequests();
    const changeReq = httpMock.expectOne(request => request.url === CHANGES_URL);

    service.revokeFeatureAccess('forbidden');

    expect(detailReq.cancelled).toBe(true);
    expect(listReq.cancelled).toBe(true);
    expect(changeReq.cancelled).toBe(true);
    expect(service.proposals()).toBeNull();
    expect(service.authFailure()).toBe('forbidden');

    service.refreshProposals();
    service.refreshChangeRequests();
    service.selectProposal(P1);
    TestBed.tick();
    httpMock.expectNone(() => true);

    session.setSession(makeSession('manager-002'));
    TestBed.tick();
    httpMock.expectNone(() => true);

    service.refreshProposals();
    httpMock
      .expectOne(request => request.url === PROPOSALS_URL)
      .flush([makeProposal(P2, JOB_2)]);

    expect(service.proposals()?.[0].id).toBe(P2);
    expect(service.authFailure()).toBeNull();
    httpMock.verify();
  });
});

describe('FixProofStateService K13-A04-R1 cross-feature isolation and memory hygiene', () => {
  let fixProof: FixProofStateService;
  let jobCards: JobCardStateService;
  let coordinator: Day06AuthorizationCoordinatorService;
  let httpMock: HttpTestingController;
  let session: SessionService;

  const JOBS_URL = `${BASE}/api/v1/manager/jobs`;
  const JOB_1_URL = `${BASE}/api/v1/manager/jobs/${JOB_1}`;
  const JOB_2_URL = `${BASE}/api/v1/manager/jobs/${JOB_2}`;
  const PROPOSALS_URL = `${BASE}/api/v1/manager/approvals/proposals`;
  const CHANGES_URL = `${BASE}/api/v1/manager/approvals/change-requests`;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor, authInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
        JobCardStateService,
        FixProofStateService,
      ],
    });

    session = TestBed.inject(SessionService);
    httpMock = TestBed.inject(HttpTestingController);
    coordinator = TestBed.inject(Day06AuthorizationCoordinatorService);
    session.setSession(makeSession());
    jobCards = TestBed.inject(JobCardStateService);
    fixProof = TestBed.inject(FixProofStateService);
    TestBed.tick();
  });

  afterEach(() => {
    fixProof.ngOnDestroy();
    jobCards.ngOnDestroy();
    httpMock.verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function populateBothFeatures(): void {
    jobCards.refreshList();
    httpMock
      .expectOne(r => r.url === JOBS_URL)
      .flush([makeJobSummary(JOB_1, 'AwaitingManagerReview')]);
    jobCards.selectJob(JOB_1);
    httpMock
      .expectOne(JOB_1_URL)
      .flush(makeDetail(JOB_1, { status: 'AwaitingManagerReview' }));

    fixProof.refreshProposals();
    httpMock
      .expectOne(r => r.url === PROPOSALS_URL)
      .flush([makeProposal(P1, JOB_1)]);
    fixProof.refreshChangeRequests();
    httpMock
      .expectOne(r => r.url === CHANGES_URL)
      .flush([makeChangeRequest(CR1, JOB_1)]);
    fixProof.selectProposal(P1);
    httpMock
      .expectOne(JOB_1_URL)
      .flush(
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          proposals: [makeProposal(P1, JOB_1)],
        }),
      );
  }

  it('FPS-120 Job Cards HTTP 401 synchronously invalidates FixProof, cancels pending reads and recovers only on new session', () => {
    populateBothFeatures();

    fixProof.refreshProposals();
    const pendingProposals = httpMock.expectOne(r => r.url === PROPOSALS_URL);
    fixProof.refreshChangeRequests();
    const pendingChanges = httpMock.expectOne(r => r.url === CHANGES_URL);
    fixProof.refreshDetail();
    const pendingFixProofDetail = httpMock.expectOne(JOB_1_URL);

    jobCards.refreshList();
    const jobs401Req = httpMock.expectOne(r => r.url === JOBS_URL);
    expect(jobs401Req.request.headers.get('Authorization')).toBe(
      'Bearer test-access-token',
    );
    jobs401Req.flush(
      { message: SENSITIVE },
      { status: 401, statusText: 'Unauthorized' },
    );

    // Synchronous invalidation before TestBed.tick()
    expect(jobCards.accessRevoked()).toBe(true);
    expect(jobCards.authFailure()).toBe('unauthorized');
    expect(fixProof.accessRevoked()).toBe(true);
    expect(fixProof.authFailure()).toBe('unauthorized');
    expect(fixProof.proposals()).toBeNull();
    expect(fixProof.changeRequests()).toBeNull();
    expect(fixProof.detail()).toBeNull();
    expect(fixProof.selected()).toBeNull();
    expect(pendingProposals.cancelled).toBe(true);
    expect(pendingChanges.cancelled).toBe(true);
    expect(pendingFixProofDetail.cancelled).toBe(true);
    expect(session.isAuthenticated()).toBe(true);

    // Same-session reads refused on both features with zero unintended HTTP.
    fixProof.refreshProposals();
    fixProof.refreshChangeRequests();
    expect(fixProof.selectProposal(P1)).toBe(false);
    jobCards.refreshList();
    httpMock.expectNone(() => true);

    // New valid session lifts both without auto-reload.
    session.setSession(makeSession('manager-002'));
    TestBed.tick();
    expect(fixProof.accessRevoked()).toBe(false);
    expect(jobCards.accessRevoked()).toBe(false);
    httpMock.expectNone(() => true);

    fixProof.refreshProposals();
    httpMock
      .expectOne(r => r.url === PROPOSALS_URL)
      .flush([makeProposal(P2, JOB_2)]);
    expect(fixProof.proposals()?.[0].id).toBe(P2);
  });

  it('FPS-121 FixProof HTTP 401 synchronously invalidates Job Cards, cancels pending reads and refuses same-session reloads', () => {
    populateBothFeatures();

    jobCards.refreshList();
    const pendingJobsList = httpMock.expectOne(r => r.url === JOBS_URL);
    jobCards.refreshDetail();
    const pendingJobsDetail = httpMock.expectOne(JOB_1_URL);

    fixProof.refreshProposals();
    const proposals401 = httpMock.expectOne(r => r.url === PROPOSALS_URL);
    expect(proposals401.request.headers.get('Authorization')).toBe(
      'Bearer test-access-token',
    );
    proposals401.flush(
      { message: SENSITIVE },
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(fixProof.accessRevoked()).toBe(true);
    expect(fixProof.authFailure()).toBe('unauthorized');
    expect(jobCards.accessRevoked()).toBe(true);
    expect(jobCards.authFailure()).toBe('unauthorized');
    expect(jobCards.serverRows()).toBeNull();
    expect(jobCards.detail()).toBeNull();
    expect(jobCards.selectedJobId()).toBeNull();
    expect(jobCards.evidence()).toEqual([]);
    expect(pendingJobsList.cancelled).toBe(true);
    expect(pendingJobsDetail.cancelled).toBe(true);

    jobCards.refreshList();
    expect(jobCards.selectJob(JOB_1)).toBe(false);
    httpMock.expectNone(() => true);

    session.setSession(makeSession('manager-002'));
    TestBed.tick();
    expect(jobCards.accessRevoked()).toBe(false);
    expect(fixProof.accessRevoked()).toBe(false);
    httpMock.expectNone(() => true);
  });

  it('FPS-122 isolates non-shared HTTP 403 strictly per feature while enforcing shared GET /jobs/{id} resource invalidation', () => {
    populateBothFeatures();

    // Job Cards list 403 revokes only Job Cards; FixProof (and its loaded detail) stays active.
    jobCards.refreshList();
    const jobsList403 = httpMock.expectOne(r => r.url === JOBS_URL);
    expect(jobsList403.request.headers.get('Authorization')).toBe(
      'Bearer test-access-token',
    );
    jobsList403.flush(
      { message: SENSITIVE },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(jobCards.accessRevoked()).toBe(true);
    expect(jobCards.authFailure()).toBe('forbidden');
    expect(jobCards.serverRows()).toBeNull();
    expect(fixProof.accessRevoked()).toBe(false);
    expect(fixProof.authFailure()).toBeNull();
    expect(fixProof.proposals()).not.toBeNull();
    expect(fixProof.detail()).not.toBeNull();
    expect(session.isAuthenticated()).toBe(true);

    // Recover Job Cards under new session, then verify shared JOB_1 403 invalidates JOB_1 in FixProof while keeping JOB_2 active.
    session.setSession(makeSession('manager-002'));
    TestBed.tick();
    populateBothFeatures();
    fixProof.refreshProposals();
    httpMock
      .expectOne(r => r.url === PROPOSALS_URL)
      .flush([makeProposal(P1, JOB_1), makeProposal(P2, JOB_2)]);

    jobCards.refreshDetail();
    const sharedDetail403 = httpMock.expectOne(JOB_1_URL);
    expect(sharedDetail403.request.headers.get('Authorization')).toBe(
      'Bearer test-access-token',
    );
    sharedDetail403.flush(
      { message: SENSITIVE },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(jobCards.accessRevoked()).toBe(true);
    expect(jobCards.authFailure()).toBe('forbidden');
    // FixProof stays unrevoked for unrelated JOB_2, while JOB_1 detail & rows are invalidated.
    expect(fixProof.accessRevoked()).toBe(false);
    expect(fixProof.detail()).toBeNull();
    expect(fixProof.selected()).toBeNull();
    expect(fixProof.proposals()?.map(p => p.id)).toEqual([P2]);
    expect(fixProof.changeRequests()).toEqual([]);

    // Now test FixProof feature-only 403 isolation under manager-003.
    session.setSession(makeSession('manager-003'));
    TestBed.tick();
    populateBothFeatures();

    fixProof.refreshChangeRequests();
    const changes403 = httpMock.expectOne(r => r.url === CHANGES_URL);
    expect(changes403.request.headers.get('Authorization')).toBe(
      'Bearer test-access-token',
    );
    changes403.flush(
      { message: SENSITIVE },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(fixProof.accessRevoked()).toBe(true);
    expect(fixProof.authFailure()).toBe('forbidden');
    expect(fixProof.proposals()).toBeNull();
    expect(jobCards.accessRevoked()).toBe(false);
    expect(jobCards.authFailure()).toBeNull();
    expect(jobCards.serverRows()).not.toBeNull();
    expect(jobCards.detail()).not.toBeNull();
    expect(session.isAuthenticated()).toBe(true);
  });

  it('FPS-123 late session A 401 failure after replacement by session B and manual ApiError do not revoke session B', () => {
    const sessionA = session.session() as AuthSession;
    const staleProvenance = coordinator.createRequestProvenance(
      'job-cards',
      sessionA,
      'api/v1/manager/jobs',
      'GET',
    );

    jobCards.refreshList();
    const sessionAJobs = httpMock.expectOne(r => r.url === JOBS_URL);
    expect(sessionAJobs.request.headers.get('Authorization')).toBe(
      `Bearer ${sessionA.accessToken}`,
    );

    fixProof.refreshProposals();
    const sessionAProposals = httpMock.expectOne(r => r.url === PROPOSALS_URL);

    const sessionB = makeSession('manager-002');
    session.setSession(sessionB);
    TestBed.tick();
    expect(sessionAJobs.cancelled).toBe(true);
    expect(sessionAProposals.cancelled).toBe(true);

    // Load session B in both features.
    fixProof.refreshProposals();
    httpMock
      .expectOne(r => r.url === PROPOSALS_URL)
      .flush([makeProposal(P2, JOB_2)]);
    jobCards.refreshList();
    httpMock
      .expectOne(r => r.url === JOBS_URL)
      .flush([makeJobSummary(JOB_2, 'AwaitingManagerReview')]);

    // Stale manual ApiError or stale session A report after session B is active must not revoke session B.
    expect(
      coordinator.reportUnauthorized(
        staleProvenance,
        new ApiError(401, 'UNAUTHORIZED', 'Stale'),
      ),
    ).toBe(false);

    expect(coordinator.isSessionRevoked(sessionB)).toBe(false);
    expect(fixProof.accessRevoked()).toBe(false);
    expect(fixProof.proposals()?.[0].id).toBe(P2);
    expect(jobCards.accessRevoked()).toBe(false);
    expect(jobCards.serverRows()?.[0].id).toBe(JOB_2);
  });

  it('FPS-124 supports multiple active instances, newly constructed instance under revoked session and destroy cleanup', () => {
    const env = createEnvironmentInjector(
      [FixProofStateService],
      TestBed.inject(EnvironmentInjector),
    );
    const secondFixProof = env.get(FixProofStateService);

    secondFixProof.refreshProposals();
    const secondReq = httpMock.expectOne(r => r.url === PROPOSALS_URL);

    jobCards.refreshList();
    httpMock
      .expectOne(r => r.url === JOBS_URL)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(fixProof.accessRevoked()).toBe(true);
    expect(secondFixProof.accessRevoked()).toBe(true);
    expect(secondReq.cancelled).toBe(true);

    // Newly constructed FixProofStateService under the already-revoked session
    const envLate = createEnvironmentInjector(
      [FixProofStateService],
      TestBed.inject(EnvironmentInjector),
    );
    const lateFixProof = envLate.get(FixProofStateService);
    expect(lateFixProof.accessRevoked()).toBe(true);
    expect(lateFixProof.authFailure()).toBe('unauthorized');
    lateFixProof.refreshProposals();
    httpMock.expectNone(() => true);

    env.destroy();
    envLate.destroy();
    expect(secondFixProof.authFailure()).toBeNull();
    expect(lateFixProof.authFailure()).toBeNull();
  });

  it('FPS-125 clears sensitive free-text search filters across 401/403, logout, expiry and replacement while preserving safe status filters', () => {
    fixProof.setProposalLocalStatus('PendingManagerReview');
    fixProof.setChangeRequestLocalStatus('PendingManagerReview');
    fixProof.setProposalSearch('Customer Perera 0779999999');
    fixProof.setChangeRequestSearch('WP-CAB-9999 urgent');

    // 1. 401
    fixProof.refreshProposals();
    httpMock
      .expectOne(r => r.url === PROPOSALS_URL)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(fixProof.proposalLocalFilters()).toEqual({
      search: '',
      status: 'PendingManagerReview',
    });
    expect(fixProof.changeRequestLocalFilters()).toEqual({
      search: '',
      status: 'PendingManagerReview',
    });

    fixProof.setProposalSearch('Blocked While Revoked');
    fixProof.setChangeRequestSearch('Blocked While Revoked');
    expect(fixProof.proposalLocalFilters().search).toBe('');
    expect(fixProof.changeRequestLocalFilters().search).toBe('');

    // 2. 403 and explicit logout
    session.setSession(makeSession('manager-002'));
    TestBed.tick();
    fixProof.setProposalSearch('Forbidden Search');
    fixProof.setChangeRequestSearch('Forbidden CR Search');
    fixProof.refreshProposals();
    httpMock
      .expectOne(r => r.url === PROPOSALS_URL)
      .flush(null, { status: 403, statusText: 'Forbidden' });
    expect(fixProof.proposalLocalFilters()).toEqual({
      search: '',
      status: 'PendingManagerReview',
    });
    expect(fixProof.changeRequestLocalFilters()).toEqual({
      search: '',
      status: 'PendingManagerReview',
    });

    session.setSession(makeSession('manager-002b'));
    TestBed.tick();
    fixProof.setProposalSearch('Logout Search');
    fixProof.setChangeRequestSearch('Logout CR Search');
    session.clearSession();
    TestBed.tick();
    expect(fixProof.proposalLocalFilters().search).toBe('');
    expect(fixProof.changeRequestLocalFilters().search).toBe('');

    // 3. Session replacement
    session.setSession(makeSession('manager-002c'));
    TestBed.tick();
    fixProof.setProposalSearch('Replacement Search');
    fixProof.setChangeRequestSearch('Replacement CR Search');
    session.setSession(makeSession('manager-003'));
    TestBed.tick();
    expect(fixProof.proposalLocalFilters().search).toBe('');
    expect(fixProof.changeRequestLocalFilters().search).toBe('');

    // 4. Expiry
    session.setSession(makeSession('manager-004', 10_000));
    TestBed.tick();
    fixProof.refreshProposals();
    httpMock
      .expectOne(r => r.url === PROPOSALS_URL)
      .flush([makeProposal(P1, JOB_1)]);
    fixProof.setProposalSearch('Expiry Search');
    fixProof.setChangeRequestSearch('Expiry CR Search');
    vi.advanceTimersByTime(FIXPROOF_STATE_CHECK_INTERVAL_MS);
    expect(fixProof.proposalLocalFilters().search).toBe('');
    expect(fixProof.changeRequestLocalFilters().search).toBe('');
    expect(fixProof.proposalLocalFilters().status).toBe('PendingManagerReview');
    expect(fixProof.changeRequestLocalFilters().status).toBe(
      'PendingManagerReview',
    );
  });

  it('FPS-126 revokes all active and newly constructed FixProofStateService instances synchronously on FixProof HTTP 403', () => {
    const env = createEnvironmentInjector(
      [FixProofStateService],
      TestBed.inject(EnvironmentInjector),
    );
    const secondFixProof = env.get(FixProofStateService);

    secondFixProof.refreshProposals();
    const pendingProposals = httpMock.expectOne(r => r.url === PROPOSALS_URL);
    jobCards.refreshList();
    httpMock
      .expectOne(r => r.url === JOBS_URL)
      .flush([makeJobSummary(JOB_1, 'AwaitingManagerReview')]);

    fixProof.refreshChangeRequests();
    const changes403 = httpMock.expectOne(r => r.url === CHANGES_URL);
    expect(changes403.request.headers.get('Authorization')).toBe(
      'Bearer test-access-token',
    );
    changes403.flush(
      { message: SENSITIVE },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(fixProof.accessRevoked()).toBe(true);
    expect(fixProof.authFailure()).toBe('forbidden');
    expect(secondFixProof.accessRevoked()).toBe(true);
    expect(secondFixProof.authFailure()).toBe('forbidden');
    expect(pendingProposals.cancelled).toBe(true);
    expect(jobCards.accessRevoked()).toBe(false);

    // Newly constructed FixProofStateService under 403-revoked session latches immediately with zero HTTP.
    const lateEnv = createEnvironmentInjector(
      [FixProofStateService],
      TestBed.inject(EnvironmentInjector),
    );
    const lateFixProof = lateEnv.get(FixProofStateService);
    expect(lateFixProof.accessRevoked()).toBe(true);
    expect(lateFixProof.authFailure()).toBe('forbidden');
    lateFixProof.refreshProposals();
    httpMock.expectNone(() => true);

    env.destroy();
    lateEnv.destroy();

    session.setSession(makeSession('manager-002'));
    TestBed.tick();
    expect(fixProof.accessRevoked()).toBe(false);
  });

  it('FPS-127 shared JOB_1 403 preserves truncation warning, blocks late pending JOB_1 responses and leaves JOB_2 active', () => {
    const proposals = Array.from(
      { length: FIXPROOF_PROPOSALS_LIST_LIMIT },
      (_, index) =>
        index === 0
          ? makeProposal(P1, JOB_1)
          : makeProposal(uuid(2, index + 1), JOB_2),
    );
    fixProof.refreshProposals();
    httpMock.expectOne(r => r.url === PROPOSALS_URL).flush(proposals);
    expect(fixProof.possiblyTruncatedProposals()).toBe(true);

    fixProof.refreshChangeRequests();
    httpMock
      .expectOne(r => r.url === CHANGES_URL)
      .flush([makeChangeRequest(CR1, JOB_1), makeChangeRequest(CR2, JOB_2)]);

    fixProof.selectProposal(P1);
    const pendingFixProofJob1 = httpMock.expectOne(JOB_1_URL);

    jobCards.refreshList();
    httpMock
      .expectOne(r => r.url === JOBS_URL)
      .flush([makeJobSummary(JOB_1, 'AwaitingManagerReview')]);
    jobCards.selectJob(JOB_1);
    const jcDetail403 = httpMock.expectOne(JOB_1_URL);
    expect(jcDetail403.request.headers.get('Authorization')).toBe(
      'Bearer test-access-token',
    );
    jcDetail403.flush(
      { message: SENSITIVE },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(pendingFixProofJob1.cancelled).toBe(true);
    expect(fixProof.accessRevoked()).toBe(false);
    expect(fixProof.detail()).toBeNull();
    expect(fixProof.selected()).toBeNull();
    expect(fixProof.proposals()?.some(p => p.jobCardId === JOB_1)).toBe(false);
    expect(fixProof.changeRequests()?.some(c => c.jobCardId === JOB_1)).toBe(
      false,
    );
    expect(fixProof.possiblyTruncatedProposals()).toBe(true);

    // Subsequent reload of proposals still excludes denied JOB_1 in this session while JOB_2 stays usable.
    fixProof.refreshProposals();
    httpMock
      .expectOne(r => r.url === PROPOSALS_URL)
      .flush([makeProposal(P1, JOB_1), makeProposal(P2, JOB_2)]);
    expect(fixProof.proposals()?.map(p => p.id)).toEqual([P2]);

    expect(fixProof.selectProposal(P2)).toBe(true);
    httpMock
      .expectOne(JOB_2_URL)
      .flush(
        makeDetail(JOB_2, {
          status: 'AwaitingManagerReview',
          proposals: [makeProposal(P2, JOB_2)],
        }),
      );
    expect(fixProof.detail()?.job.id).toBe(JOB_2);
    expect(fixProof.selectionState()).toBe('ready');
  });
});

describe('FixProofStateService K13-A04-R3-R1 manual read recovery', () => {
  const CANCELLED = 'The request was cancelled. Refresh to try again.';

  let service: FixProofStateService;
  let fake: ReturnType<typeof createFakes>;
  let session: SessionService;
  let coordinator: Day06AuthorizationCoordinatorService;
  let httpMock: HttpTestingController;

  function setup(real = false): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor, authInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
        FixProofStateService,
        ...(real
          ? []
          : [
              { provide: FixProofApiService, useValue: fake.fixProofApi },
              { provide: JobCardApiService, useValue: fake.jobApi },
              { provide: FixProofMutationApiService, useValue: fake.mutationApi },
            ]),
      ],
    });

    session = TestBed.inject(SessionService);
    coordinator = TestBed.inject(Day06AuthorizationCoordinatorService);
    httpMock = TestBed.inject(HttpTestingController);
    session.setSession(makeSession());
    service = TestBed.inject(FixProofStateService);
    TestBed.tick();
  }

  function apiCalls(): number {
    return (
      fake.fixProofApi.getProposals.mock.calls.length +
      fake.fixProofApi.getChangeRequests.mock.calls.length +
      fake.jobApi.getJobCard.mock.calls.length
    );
  }

  function openProposal(proposal: ProposalDto): void {
    service.refreshProposals();
    respond(last(fake.proposalCalls).subject, [proposal]);
    service.selectProposal(proposal.id);
    respond(
      last(fake.detailCalls).subject,
      makeDetail(proposal.jobCardId, { proposals: [proposal] }),
    );
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    fake = createFakes();
    setup();
  });

  afterEach(() => {
    service.ngOnDestroy();
    httpMock.verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('FPS-128 cancels a never-completing proposal list, ignores its late answer, counts the cancellation and recovers manually without retry', () => {
    const unauthorized = vi.spyOn(coordinator, 'reportUnauthorized');
    const forbidden = vi.spyOn(coordinator, 'reportForbidden');

    service.refreshProposals();
    const hanging = last(fake.proposalCalls).subject;

    expect(service.cancelProposalsRequest()).toBe(true);
    expect(service.isProposalsLoading()).toBe(false);
    expect(hanging.observed).toBe(false);
    expect(service.proposalsCancellations()).toBe(1);
    expect(service.proposalsError()?.message).toBe(CANCELLED);
    expect(service.proposalsError()?.kind).not.toBe('unauthorized');
    expect(service.proposalsError()?.kind).not.toBe('forbidden');
    expect(service.authFailure()).toBeNull();

    respond(hanging, [makeProposal(P1, JOB_1)]);
    expect(service.proposals()).toBeNull();

    vi.advanceTimersByTime(FIXPROOF_STATE_CHECK_INTERVAL_MS * 3);
    expect(fake.fixProofApi.getProposals).toHaveBeenCalledTimes(1);

    service.refreshProposals();
    respond(last(fake.proposalCalls).subject, [makeProposal(P2, JOB_2)]);
    expect(service.proposals()?.map(p => p.id)).toEqual([P2]);
    expect(service.proposalsError()).toBeNull();
    expect(service.proposalsCancellations()).toBe(1);
    expect(unauthorized).not.toHaveBeenCalled();
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('FPS-129 cancelling a change-request refresh keeps cached rows stale and leaves the proposal lane running', () => {
    service.refreshChangeRequests();
    respond(last(fake.changeCalls).subject, [makeChangeRequest(CR1, JOB_1)]);
    const synced = service.changeRequestsLastSyncedAt();

    service.refreshProposals();
    const proposals = last(fake.proposalCalls).subject;
    service.refreshChangeRequests();

    expect(service.cancelChangeRequestsRequest()).toBe(true);
    expect(service.changeRequests()?.map(c => c.id)).toEqual([CR1]);
    expect(service.changeRequestsRefreshError()?.message).toBe(CANCELLED);
    expect(service.changeRequestsError()).toBeNull();
    expect(service.changeRequestsLastSyncedAt()).toBe(synced);
    expect(service.changeRequestsCancellations()).toBe(1);

    expect(service.isProposalsLoading()).toBe(true);
    expect(service.proposalsCancellations()).toBe(0);
    respond(proposals, [makeProposal(P1, JOB_1)]);
    expect(service.proposals()?.length).toBe(1);
  });

  it('FPS-130 cancelling a detail refresh keeps the selection, blocks action readiness as stale and recovers with refreshDetail', () => {
    openProposal(makeProposal(P1, JOB_1));
    expect(service.actionContextState()).toBe('ready');

    service.refreshDetail();
    const hanging = last(fake.detailCalls).subject;

    expect(service.cancelDetailRequest()).toBe(true);
    expect(hanging.observed).toBe(false);
    expect(service.selected()?.id).toBe(P1);
    expect(service.detailRefreshError()?.message).toBe(CANCELLED);
    expect(service.actionContextState()).toBe('stale');
    expect(service.detailCancellations()).toBe(1);

    respond(
      hanging,
      makeDetail(JOB_1, { proposals: [makeProposal(P1, JOB_1)] }),
    );
    expect(service.actionContextState()).toBe('stale');

    service.refreshDetail();
    respond(
      last(fake.detailCalls).subject,
      makeDetail(JOB_1, { proposals: [makeProposal(P1, JOB_1)] }),
    );
    expect(service.actionContextState()).toBe('ready');
    expect(service.detailRefreshError()).toBeNull();
  });

  it('FPS-131 cancelling the initial detail leaves the selection detail-unavailable, never ready', () => {
    service.refreshProposals();
    respond(last(fake.proposalCalls).subject, [makeProposal(P1, JOB_1)]);
    service.selectProposal(P1);

    expect(service.cancelDetailRequest()).toBe(true);
    expect(service.detail()).toBeNull();
    expect(service.detailError()?.message).toBe(CANCELLED);
    expect(service.actionContextState()).toBe('detail-unavailable');
  });

  it('FPS-132 cancellation is idempotent, refused after session change or destroy and never sends HTTP or coordinator reports', () => {
    const unauthorized = vi.spyOn(coordinator, 'reportUnauthorized');
    const forbidden = vi.spyOn(coordinator, 'reportForbidden');

    expect(service.cancelProposalsRequest()).toBe(false);
    expect(service.cancelChangeRequestsRequest()).toBe(false);
    expect(service.cancelDetailRequest()).toBe(false);

    service.refreshProposals();
    expect(service.cancelProposalsRequest()).toBe(true);
    expect(service.cancelProposalsRequest()).toBe(false);
    expect(service.proposalsCancellations()).toBe(1);

    service.refreshChangeRequests();
    const pending = last(fake.changeCalls).subject;
    session.setSession(makeSession('manager-002'));

    expect(service.cancelChangeRequestsRequest()).toBe(false);
    expect(service.changeRequestsCancellations()).toBe(0);
    respond(pending, [makeChangeRequest(CR1, JOB_1)]);
    expect(service.changeRequests()).toBeNull();

    service.refreshProposals();
    service.ngOnDestroy();
    expect(service.cancelProposalsRequest()).toBe(false);

    expect(apiCalls()).toBe(3);
    expect(unauthorized).not.toHaveBeenCalled();
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('FPS-133 synchronous of, throwError and EMPTY reads leave nothing to cancel', () => {
    fake.fixProofApi.getProposals.mockReturnValueOnce(
      of([makeProposal(P1, JOB_1)]),
    );
    service.refreshProposals();
    expect(service.cancelProposalsRequest()).toBe(false);
    expect(service.proposals()?.length).toBe(1);

    fake.fixProofApi.getChangeRequests.mockReturnValueOnce(
      throwError(() => apiError(500, 'SERVER_ERROR')),
    );
    service.refreshChangeRequests();
    expect(service.isChangeRequestsLoading()).toBe(false);
    expect(service.cancelChangeRequestsRequest()).toBe(false);
    expect(service.changeRequestsError()?.message).not.toBe(CANCELLED);

    fake.jobApi.getJobCard.mockReturnValueOnce(EMPTY);
    service.selectProposal(P1);
    expect(service.isDetailLoading()).toBe(false);
    expect(service.cancelDetailRequest()).toBe(false);
    expect(service.detailCancellations()).toBe(0);
  });

  it('FPS-134 a selection cleared during a synchronous detail answer never applies it and never leaves the lane loading', () => {
    service.refreshProposals();
    respond(last(fake.proposalCalls).subject, [
      makeProposal(P1, JOB_1),
      makeProposal(P2, JOB_2),
    ]);

    // A synchronous answer that arrives after the selection already moved.
    fake.jobApi.getJobCard.mockImplementationOnce(() => {
      service.clearSelection();
      return of(makeDetail(JOB_1, { proposals: [makeProposal(P1, JOB_1)] }));
    });
    service.selectProposal(P1);

    expect(service.isDetailLoading()).toBe(false);
    expect(service.detail()).toBeNull();
  });

  it('FPS-135 real HTTP: each cancel aborts only its own GET and a manual refresh issues exactly one new GET', () => {
    service.ngOnDestroy();
    setup(true);

    const proposalsUrl = `${BASE}/api/v1/manager/approvals/proposals`;
    const changesUrl = `${BASE}/api/v1/manager/approvals/change-requests`;

    service.refreshProposals();
    service.refreshChangeRequests();
    const proposals = httpMock.expectOne(r => r.url === proposalsUrl);
    const changes = httpMock.expectOne(r => r.url === changesUrl);

    expect(service.cancelProposalsRequest()).toBe(true);
    expect(proposals.cancelled).toBe(true);
    expect(changes.cancelled).toBe(false);

    expect(service.cancelChangeRequestsRequest()).toBe(true);
    expect(changes.cancelled).toBe(true);
    httpMock.expectNone(() => true);

    service.refreshProposals();
    const again = httpMock.expectOne(r => r.url === proposalsUrl);
    expect(again.request.method).toBe('GET');
    again.flush([makeProposal(P1, JOB_1)]);
    expect(service.proposals()?.length).toBe(1);
    expect(service.authFailure()).toBeNull();
  });
});
