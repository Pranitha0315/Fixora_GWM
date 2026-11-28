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
import type { ApiConfig } from '../../../core/config/api.config';
import { authInterceptor } from '../../../core/interceptors/auth.interceptor';
import { errorInterceptor } from '../../../core/interceptors/error.interceptor';
import { ApiError } from '../../../core/models/api-error.model';
import type { ApiErrorCode } from '../../../core/models/api-error.model';
import type { AuthSession } from '../../../core/models/auth-session.model';

import { JOB_CARDS_LIST_LIMIT } from '../models/job-card.model';
import type {
  JobDetailDto,
  JobListQuery,
  JobSummaryDto,
} from '../models/job-card.model';
import { resolveJobCardsError } from '../utils/job-card-error.mapper';

import { Day06AuthorizationCoordinatorService } from './day06-authorization-coordinator.service';
import {
  JOB_CARD_STATE_CHECK_INTERVAL_MS,
  JobCardStateService,
} from './job-card-state.service';
import { JobCardApiService } from './job-card-api.service';
import { FixProofStateService } from '../../fixproof-review/services/fixproof-state.service';

const BASE = 'https://api.fixora.test';
const START = Date.UTC(2027, 0, 15, 8, 0, 0);
const START_SECONDS = Math.floor(START / 1000);
const MEDIA_HEX = '0123456789abcdef0123456789abcdef';
const SIG = 'a1'.repeat(32);
const SENSITIVE =
  'secret-token=abc123 sig=deadbeef /api/v1/media/leak.jpg?exp=1&sig=zzz';

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}

const JOB_A = uuid(1);
const JOB_B = uuid(2);
const JOB_C = uuid(3);
const CUSTOMER_1 = uuid(101);
const CUSTOMER_2 = uuid(102);
const ISSUE_1 = uuid(301);
const ISSUE_2 = uuid(302);

function signedUrl(
  ext = 'jpg',
  exp: number = START_SECONDS + 900,
  hex: string = MEDIA_HEX,
): string {
  return `/api/v1/media/${hex}.${ext}?exp=${exp}&sig=${SIG}`;
}

function makeJob(
  id: string,
  overrides: Partial<JobSummaryDto> = {},
): JobSummaryDto {
  return {
    id,
    number: `JC-${id.slice(-3)}`,
    customerId: CUSTOMER_1,
    customerName: 'Kavitha',
    vehicleId: uuid(201),
    vehicleLabel: 'Suzuki Wagon R (NP CAB-4521)',
    mechanicId: uuid(401),
    mechanicName: 'Ravi',
    bayId: uuid(501),
    bayName: 'Bay 1',
    status: 'Inspecting',
    priority: 1,
    queuePosition: 1,
    etaAt: '2027-01-15T10:30:00Z',
    estimatedMinutes: 90,
    elapsedMinutes: 25,
    createdAt: '2027-01-15T08:00:00Z',
    startedAt: '2027-01-15T08:15:00Z',
    completedAt: null,
    complaint: 'Brake squeal',
    managerNote: 'Internal manager note',
    ...overrides,
  };
}

function makeIssue(
  id: string,
  mediaUrls: readonly string[],
): JobDetailDto['issues'][number] {
  return {
    id,
    component: 'Front Brakes',
    findingEn: 'Pads worn',
    findingTa: 'Pads worn',
    recommendationEn: 'Replace pads',
    recommendationTa: 'Replace pads',
    severity: 'Urgent',
    mediaUrls,
    reportVersion: 1,
    confirmedAt: '2027-01-15T08:30:00Z',
  };
}

function makeDetail(
  id: string,
  overrides: Partial<JobDetailDto> = {},
): JobDetailDto {
  return {
    job: makeJob(id),
    timeline: [
      {
        stage: 'Open',
        message: 'Job opened',
        percent: 5,
        actorRole: 'Manager',
        at: '2027-01-15T08:00:00Z',
      },
    ],
    issues: [],
    proposals: [],
    changeRequests: [],
    invoice: null,
    queue: {
      jobId: id,
      position: 1,
      etaAt: null,
      status: 'Inspecting',
      indicative: true,
    },
    ...overrides,
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

interface ListCall {
  readonly query: JobListQuery | undefined;
  readonly subject: Subject<readonly JobSummaryDto[]>;
}

interface DetailCall {
  readonly id: string;
  readonly subject: Subject<JobDetailDto>;
}

function createFakeApi() {
  const lists: ListCall[] = [];
  const details: DetailCall[] = [];

  const api = {
    getJobCards: vi.fn((query?: JobListQuery) => {
      const subject = new Subject<readonly JobSummaryDto[]>();
      lists.push({ query, subject });
      return subject.asObservable();
    }),
    getJobCard: vi.fn((id: string) => {
      const subject = new Subject<JobDetailDto>();
      details.push({ id, subject });
      return subject.asObservable();
    }),
  };

  return { api, lists, details };
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

describe('JobCardStateService', () => {
  let service: JobCardStateService;
  let fake: ReturnType<typeof createFakeApi>;
  let session: SessionService;
  let httpMock: HttpTestingController;
  let timerBaseline = 0;

  function configure(config: ApiConfig = { baseUrl: BASE }): void {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: config },
        JobCardStateService,
        { provide: JobCardApiService, useValue: fake.api },
      ],
    });

    session = TestBed.inject(SessionService);
    httpMock = TestBed.inject(HttpTestingController);
    session.setSession(makeSession());
    service = TestBed.inject(JobCardStateService);

    // Run the service's initial session effect so framework scheduling
    // timers do not count as service timers.
    TestBed.tick();
    timerBaseline = vi.getTimerCount();
  }

  function serviceTimers(): number {
    return vi.getTimerCount() - timerBaseline;
  }

  function loadList(rows: readonly JobSummaryDto[]): void {
    service.refreshList();
    respond(last(fake.lists).subject, rows);
  }

  function loadDetail(id: string, detail?: JobDetailDto): void {
    service.selectJob(id);
    respond(last(fake.details).subject, detail ?? makeDetail(id));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);

    fake = createFakeApi();
    configure();
  });

  afterEach(() => {
    service.ngOnDestroy();
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('JCS-01 is feature scoped, not provided in root', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [{ provide: JobCardApiService, useValue: fake.api }],
      });

      expect(() => TestBed.inject(JobCardStateService)).toThrow();
    });

    it('JCS-02 makes no request on construction and starts idle', () => {
      expect(fake.api.getJobCards).not.toHaveBeenCalled();
      expect(fake.api.getJobCard).not.toHaveBeenCalled();
      expect(service.serverRows()).toBeNull();
      expect(service.visibleJobs()).toEqual([]);
      expect(service.listViewState()).toBe('idle');
      expect(service.detailViewState()).toBe('idle');
      expect(service.selectedJobId()).toBeNull();
      expect(service.detail()).toBeNull();
      expect(service.isListLoading()).toBe(false);
      expect(service.isDetailLoading()).toBe(false);
      expect(service.listError()).toBeNull();
      expect(service.detailError()).toBeNull();
      expect(service.authFailure()).toBeNull();
      expect(service.possiblyTruncated()).toBe(false);
      expect(service.evidence()).toEqual([]);
      expect(serviceTimers()).toBe(0);
    });

    it('JCS-03 defaults to the active-only server filter without a customer', () => {
      expect(service.serverFilter()).toEqual({
        activeOnly: true,
        customerId: null,
      });
      expect(service.localFilter()).toEqual({
        search: '',
        status: null,
        priority: null,
      });
    });
  });

  describe('list loading', () => {
    it('JCS-04 loads with the default server query and reports loading then ready', () => {
      service.refreshList();

      expect(fake.api.getJobCards).toHaveBeenCalledTimes(1);
      expect(last(fake.lists).query).toEqual({
        activeOnly: true,
        customerId: null,
      });
      expect(service.isListLoading()).toBe(true);
      expect(service.isListInitialLoading()).toBe(true);
      expect(service.listViewState()).toBe('loading');

      const rows = [makeJob(JOB_A), makeJob(JOB_B)];
      respond(last(fake.lists).subject, rows);

      expect(service.isListLoading()).toBe(false);
      expect(service.listViewState()).toBe('ready');
      expect(service.serverRows()).toBe(rows);
      expect(service.listLastSyncedAt()?.getTime()).toBe(START);
      expect(service.isListStale()).toBe(false);
      expect(service.listError()).toBeNull();
    });

    it('JCS-05 reports a successful empty list', () => {
      loadList([]);

      expect(service.listViewState()).toBe('empty');
      expect(service.isListEmpty()).toBe(true);
      expect(service.isFilteredEmpty()).toBe(false);
      expect(service.listError()).toBeNull();
    });

    it('JCS-06 reports an initial failure with a safe message and allows retry', () => {
      service.refreshList();
      last(fake.lists).subject.error(apiError(500, 'SERVER_ERROR'));

      expect(service.listViewState()).toBe('error');
      expect(service.listError()?.kind).toBe('server-failure');
      expect(service.listError()?.message).not.toContain('secret');
      expect(service.listError()?.message).not.toContain('sig=');
      expect(service.listError()?.message).not.toContain('/api/');
      expect(service.isListLoading()).toBe(false);
      expect(service.serverRows()).toBeNull();

      loadList([makeJob(JOB_A)]);

      expect(service.listViewState()).toBe('ready');
      expect(service.listError()).toBeNull();
    });

    it('JCS-07 keeps stale rows and marks them when a refresh fails', () => {
      const rows = [makeJob(JOB_A)];
      loadList(rows);

      service.refreshList();

      expect(service.isListRefreshing()).toBe(true);
      expect(service.listViewState()).toBe('ready');

      last(fake.lists).subject.error(apiError(0, 'NETWORK_ERROR'));

      expect(service.serverRows()).toBe(rows);
      expect(service.isListStale()).toBe(true);
      expect(service.listStaleReason()).toBe('refresh-failed');
      expect(service.listRefreshError()?.kind).toBe('network-failure');
      expect(service.listError()).toBeNull();
      expect(service.listViewState()).toBe('ready');

      loadList([makeJob(JOB_B)]);

      expect(service.isListStale()).toBe(false);
      expect(service.listRefreshError()).toBeNull();
      expect(service.serverRows()?.[0].id).toBe(JOB_B);
    });

    it('JCS-08 ignores a duplicate refresh while one is in flight', () => {
      service.refreshList();
      service.refreshList();
      service.refreshList();

      expect(fake.api.getJobCards).toHaveBeenCalledTimes(1);

      respond(last(fake.lists).subject, [makeJob(JOB_A)]);
      service.refreshList();

      expect(fake.api.getJobCards).toHaveBeenCalledTimes(2);
    });

    it('JCS-09 treats a completed response without a value as a failure', () => {
      service.refreshList();
      last(fake.lists).subject.complete();

      expect(service.listViewState()).toBe('error');
      expect(service.listError()?.kind).toBeDefined();
      expect(service.serverRows()).toBeNull();
    });

    it('JCS-10 maps unexpected errors to a safe unknown message', () => {
      service.refreshList();
      last(fake.lists).subject.error(new Error(SENSITIVE));

      expect(service.listError()).not.toBeNull();
      expect(service.listError()?.message).not.toContain('secret');
      expect(service.listError()?.message).not.toContain('sig=');
    });
  });

  describe('server-side filters', () => {
    it('JCS-11 switches to all jobs with a new request and discards previous rows', () => {
      loadList([makeJob(JOB_A)]);

      expect(service.setActiveOnly(false)).toBe(true);

      expect(fake.api.getJobCards).toHaveBeenCalledTimes(2);
      expect(last(fake.lists).query).toEqual({
        activeOnly: false,
        customerId: null,
      });
      expect(service.serverFilter().activeOnly).toBe(false);
      expect(service.serverRows()).toBeNull();
      expect(service.listViewState()).toBe('loading');

      respond(last(fake.lists).subject, [
        makeJob(JOB_A),
        makeJob(JOB_B, { status: 'Completed' }),
      ]);

      expect(service.serverRows()).toHaveLength(2);
    });

    it('JCS-12 applies a validated customer filter server-side', () => {
      expect(service.setCustomerId(CUSTOMER_2)).toBe(true);

      expect(last(fake.lists).query).toEqual({
        activeOnly: true,
        customerId: CUSTOMER_2,
      });
      expect(service.serverFilter().customerId).toBe(CUSTOMER_2);

      expect(service.setCustomerId(null)).toBe(true);
      expect(last(fake.lists).query).toEqual({
        activeOnly: true,
        customerId: null,
      });
    });

    it('JCS-13 rejects invalid server filters without a request or state change', () => {
      expect(service.setCustomerId('not-a-guid')).toBe(false);
      expect(service.setServerFilter('nope')).toBe(false);
      expect(service.setServerFilter({ activeOnly: 'yes' })).toBe(false);

      expect(fake.api.getJobCards).not.toHaveBeenCalled();
      expect(service.serverFilter()).toEqual({
        activeOnly: true,
        customerId: null,
      });
      expect(service.inputError()).not.toBeNull();
      expect(service.inputError()?.message).not.toContain('not-a-guid');

      expect(service.setActiveOnly(false)).toBe(true);
      expect(service.inputError()).toBeNull();
    });

    it('JCS-14 does not reload when the server filter is unchanged', () => {
      loadList([makeJob(JOB_A)]);

      expect(service.setActiveOnly(true)).toBe(true);
      expect(service.setServerFilter({ activeOnly: true })).toBe(true);
      expect(service.setCustomerId(null)).toBe(true);

      expect(fake.api.getJobCards).toHaveBeenCalledTimes(1);
      expect(service.serverRows()).toHaveLength(1);

      service.setCustomerId(CUSTOMER_1.toUpperCase());
      expect(fake.api.getJobCards).toHaveBeenCalledTimes(2);
      service.setCustomerId(CUSTOMER_1);
      expect(fake.api.getJobCards).toHaveBeenCalledTimes(2);
    });

    it('JCS-15 cancels the superseded request and ignores its late response', () => {
      service.refreshList();
      const first = last(fake.lists);

      service.setActiveOnly(false);
      const second = last(fake.lists);

      expect(first.subject.observed).toBe(false);
      expect(second.subject.observed).toBe(true);

      respond(first.subject, [makeJob(JOB_A)]);

      expect(service.serverRows()).toBeNull();
      expect(service.isListLoading()).toBe(true);

      respond(second.subject, [makeJob(JOB_B)]);

      expect(service.serverRows()?.[0].id).toBe(JOB_B);
    });

    it('JCS-16 keeps only the latest of rapid filter changes', () => {
      service.setActiveOnly(false);
      const calls = [last(fake.lists)];
      service.setCustomerId(CUSTOMER_2);
      calls.push(last(fake.lists));
      service.setActiveOnly(true);
      calls.push(last(fake.lists));

      respond(calls[2].subject, [makeJob(JOB_C)]);
      respond(calls[0].subject, [makeJob(JOB_A)]);
      respond(calls[1].subject, [makeJob(JOB_B)]);

      expect(service.serverRows()).toHaveLength(1);
      expect(service.serverRows()?.[0].id).toBe(JOB_C);
      expect(service.serverFilter()).toEqual({
        activeOnly: true,
        customerId: CUSTOMER_2,
      });
    });

    it('JCS-17 keeps server filters separate from local filters', () => {
      loadList([makeJob(JOB_A)]);

      service.setSearch('brake');
      service.setStatusFilter('Inspecting');
      service.setPriorityFilter(1);

      expect(fake.api.getJobCards).toHaveBeenCalledTimes(1);
      expect(service.serverFilter()).toEqual({
        activeOnly: true,
        customerId: null,
      });
      expect(service.localFilter()).toEqual({
        search: 'brake',
        status: 'Inspecting',
        priority: 1,
      });
    });
  });

  describe('local filtering', () => {
    const rows = [
      makeJob(JOB_C, {
        number: 'JC-0003',
        customerName: 'Nimal',
        vehicleLabel: 'Toyota Aqua',
        mechanicName: 'Saman',
        bayName: 'Bay 2',
        status: 'InProgress',
        priority: 2,
        complaint: 'Engine noise',
      }),
      makeJob(JOB_A, {
        number: 'JC-0001',
        customerName: 'Kavitha',
        vehicleLabel: 'Suzuki Wagon R',
        mechanicName: 'Ravi',
        bayName: 'Bay 1',
        status: 'Inspecting',
        priority: 1,
        complaint: 'Brake squeal',
      }),
      makeJob(JOB_B, {
        number: 'JC-0002',
        customerName: 'Perera',
        vehicleLabel: 'Honda Fit',
        mechanicName: null,
        bayName: null,
        status: 'FutureStatus',
        priority: 1,
        complaint: null,
      }),
    ];

    beforeEach(() => {
      loadList(rows);
    });

    function visibleIds(): string[] {
      return service.visibleJobs().map(job => job.id);
    }

    it('JCS-18 preserves backend ordering and returns the source when unfiltered', () => {
      expect(visibleIds()).toEqual([JOB_C, JOB_A, JOB_B]);
      expect(service.visibleJobs()).toBe(service.serverRows());
    });

    it('JCS-19 searches case-insensitively across supported job fields', () => {
      service.setSearch('  BRAKE ');
      expect(visibleIds()).toEqual([JOB_A]);

      service.setSearch('jc-0003');
      expect(visibleIds()).toEqual([JOB_C]);

      service.setSearch('perera');
      expect(visibleIds()).toEqual([JOB_B]);

      service.setSearch('toyota');
      expect(visibleIds()).toEqual([JOB_C]);

      service.setSearch('saman');
      expect(visibleIds()).toEqual([JOB_C]);

      service.setSearch('bay 1');
      expect(visibleIds()).toEqual([JOB_A]);

      service.setSearch('futurestatus');
      expect(visibleIds()).toEqual([JOB_B]);
    });

    it('JCS-20 does not search ids or the internal manager note', () => {
      service.setSearch('internal manager');
      expect(visibleIds()).toEqual([]);

      service.setSearch(JOB_A);
      expect(visibleIds()).toEqual([]);
    });

    it('JCS-21 filters by exact status including unknown statuses', () => {
      service.setStatusFilter('FutureStatus');
      expect(visibleIds()).toEqual([JOB_B]);

      service.setStatusFilter('inspecting');
      expect(visibleIds()).toEqual([]);

      service.setStatusFilter('Inspecting');
      expect(visibleIds()).toEqual([JOB_A]);

      expect(service.statusOptions()).toEqual([
        'InProgress',
        'Inspecting',
        'FutureStatus',
      ]);
    });

    it('JCS-22 filters by priority and lists priority options ascending', () => {
      service.setPriorityFilter(1);
      expect(visibleIds()).toEqual([JOB_A, JOB_B]);

      service.setPriorityFilter(2);
      expect(visibleIds()).toEqual([JOB_C]);

      expect(service.priorityOptions()).toEqual([1, 2]);
    });

    it('JCS-23 combines filters, reports filtered-empty and clears them', () => {
      service.setStatusFilter('Inspecting');
      service.setPriorityFilter(2);

      expect(visibleIds()).toEqual([]);
      expect(service.isFilteredEmpty()).toBe(true);
      expect(service.isListEmpty()).toBe(false);
      expect(service.listViewState()).toBe('ready');
      expect(service.hasLocalFilters()).toBe(true);

      service.clearLocalFilters();

      expect(visibleIds()).toEqual([JOB_C, JOB_A, JOB_B]);
      expect(service.hasLocalFilters()).toBe(false);
      expect(service.isFilteredEmpty()).toBe(false);
    });

    it('JCS-24 ignores invalid local filter inputs', () => {
      service.setSearch(42);
      service.setStatusFilter(7);
      service.setPriorityFilter('1');
      service.setPriorityFilter(1.5);

      expect(service.localFilter()).toEqual({
        search: '',
        status: null,
        priority: null,
      });
      expect(visibleIds()).toEqual([JOB_C, JOB_A, JOB_B]);
    });

    it('JCS-25 never mutates source records (deep frozen) and is deterministic', () => {
      const frozen = deepFreeze([makeJob(JOB_A), makeJob(JOB_B)]);

      loadList(frozen);
      service.setSearch('kavitha');
      service.setStatusFilter('Inspecting');

      const first = service.visibleJobs();
      service.setSearch('kavitha');
      const second = service.visibleJobs();

      expect(first.map(job => job.id)).toEqual(second.map(job => job.id));
      expect(service.serverRows()).toBe(frozen);
      expect(frozen).toHaveLength(2);
    });

    it('JCS-26 keeps local filters when the rows are reloaded', () => {
      service.setSearch('brake');
      loadList(rows);

      expect(service.localFilter().search).toBe('brake');
      expect(visibleIds()).toEqual([JOB_A]);
    });
  });

  describe('possible truncation', () => {
    function many(count: number): JobSummaryDto[] {
      return Array.from({ length: count }, (_, index) =>
        makeJob(uuid(1000 + index)),
      );
    }

    it('JCS-27 flags a possibly truncated list at the 200 row cap only', () => {
      expect(JOB_CARDS_LIST_LIMIT).toBe(200);

      loadList(many(199));
      expect(service.possiblyTruncated()).toBe(false);

      loadList(many(200));
      expect(service.possiblyTruncated()).toBe(true);

      loadList([]);
      expect(service.possiblyTruncated()).toBe(false);
    });

    it('JCS-28 does not fabricate totals, pages or completeness', () => {
      loadList(many(200));

      const exposed = Object.keys(service);

      for (const name of ['total', 'totalCount', 'page', 'pageSize', 'hasMore']) {
        expect(exposed).not.toContain(name);
      }

      expect(service.serverRows()).toHaveLength(200);
    });

    it('JCS-29 truncation reflects loaded rows, not the local filter', () => {
      loadList(many(200));
      service.setSearch('no-such-job');

      expect(service.visibleJobs()).toHaveLength(0);
      expect(service.possiblyTruncated()).toBe(true);
    });
  });

  describe('selected job detail', () => {
    it('JCS-30 loads the authoritative detail for a validated id', () => {
      expect(service.selectJob(JOB_A)).toBe(true);

      expect(fake.api.getJobCard).toHaveBeenCalledWith(JOB_A);
      expect(service.selectedJobId()).toBe(JOB_A);
      expect(service.isDetailLoading()).toBe(true);
      expect(service.isDetailInitialLoading()).toBe(true);
      expect(service.detailViewState()).toBe('loading');
      expect(service.detail()).toBeNull();

      const detail = makeDetail(JOB_A);
      respond(last(fake.details).subject, detail);

      expect(service.detail()).toBe(detail);
      expect(service.detailViewState()).toBe('ready');
      expect(service.detailLastSyncedAt()?.getTime()).toBe(START);
      expect(service.isDetailLoading()).toBe(false);
    });

    it('JCS-31 exposes job, timeline, issues, proposals, change requests, invoice and queue', () => {
      const detail = makeDetail(JOB_A, {
        issues: [makeIssue(ISSUE_1, [])],
      });

      loadDetail(JOB_A, detail);

      expect(service.job()).toBe(detail.job);
      expect(service.timeline()).toBe(detail.timeline);
      expect(service.issues()).toBe(detail.issues);
      expect(service.proposals()).toBe(detail.proposals);
      expect(service.changeRequests()).toBe(detail.changeRequests);
      expect(service.invoice()).toBeNull();
      expect(service.queue()).toBe(detail.queue);
    });

    it('JCS-32 exposes empty collections and nulls without a detail', () => {
      expect(service.job()).toBeNull();
      expect(service.timeline()).toEqual([]);
      expect(service.issues()).toEqual([]);
      expect(service.proposals()).toEqual([]);
      expect(service.changeRequests()).toEqual([]);
      expect(service.invoice()).toBeNull();
      expect(service.queue()).toBeNull();
    });

    it('JCS-33 rejects an invalid id without changing the selection or requesting', () => {
      loadDetail(JOB_A);
      const calls = fake.api.getJobCard.mock.calls.length;

      for (const bad of [
        '',
        'abc',
        '00000000-0000-0000-0000-000000000000',
        null,
        undefined,
        42,
        `${JOB_B}/../x`,
      ]) {
        expect(service.selectJob(bad)).toBe(false);
      }

      expect(fake.api.getJobCard.mock.calls.length).toBe(calls);
      expect(service.selectedJobId()).toBe(JOB_A);
      expect(service.detail()?.job.id).toBe(JOB_A);
      expect(service.inputError()).not.toBeNull();
    });

    it('JCS-34 never fabricates a detail from a list summary', () => {
      loadList([makeJob(JOB_A)]);
      service.selectJob(JOB_A);

      expect(service.selectedListSummary()?.id).toBe(JOB_A);
      expect(service.detail()).toBeNull();
      expect(service.job()).toBeNull();
      expect(service.timeline()).toEqual([]);
      expect(service.queue()).toBeNull();

      last(fake.details).subject.error(apiError(500, 'SERVER_ERROR'));

      expect(service.detail()).toBeNull();
      expect(service.detailViewState()).toBe('error');
    });

    it('JCS-35 selecting another job cancels the previous request and clears its data', () => {
      loadDetail(JOB_A);
      service.selectJob(JOB_B);

      expect(service.selectedJobId()).toBe(JOB_B);
      expect(service.detail()).toBeNull();
      expect(service.detailViewState()).toBe('loading');
    });

    it('JCS-36 ignores a late response for a previously selected job', () => {
      service.selectJob(JOB_A);
      const first = last(fake.details);
      service.selectJob(JOB_B);
      const second = last(fake.details);

      expect(first.subject.observed).toBe(false);

      respond(first.subject, makeDetail(JOB_A));

      expect(service.detail()).toBeNull();
      expect(service.selectedJobId()).toBe(JOB_B);
      expect(service.isDetailLoading()).toBe(true);

      respond(second.subject, makeDetail(JOB_B));

      expect(service.detail()?.job.id).toBe(JOB_B);
    });

    it('JCS-37 keeps only the latest of rapid selection changes', () => {
      service.selectJob(JOB_A);
      const a = last(fake.details);
      service.selectJob(JOB_B);
      const b = last(fake.details);
      service.selectJob(JOB_C);
      const c = last(fake.details);

      respond(c.subject, makeDetail(JOB_C));
      respond(a.subject, makeDetail(JOB_A));
      respond(b.subject, makeDetail(JOB_B));

      expect(service.selectedJobId()).toBe(JOB_C);
      expect(service.detail()?.job.id).toBe(JOB_C);
    });

    it('JCS-38 re-selecting the current job does not repeat the request', () => {
      service.selectJob(JOB_A);
      service.selectJob(JOB_A);
      service.selectJob(JOB_A.toUpperCase());

      expect(fake.api.getJobCard).toHaveBeenCalledTimes(1);

      respond(last(fake.details).subject, makeDetail(JOB_A));
      service.selectJob(JOB_A);

      expect(fake.api.getJobCard).toHaveBeenCalledTimes(1);
    });

    it('JCS-39 re-selecting the current job after a failure retries', () => {
      service.selectJob(JOB_A);
      last(fake.details).subject.error(apiError(500, 'SERVER_ERROR'));

      service.selectJob(JOB_A);

      expect(fake.api.getJobCard).toHaveBeenCalledTimes(2);
      expect(service.detailViewState()).toBe('loading');
    });

    it('JCS-40 reports not-found for a missing job and keeps the selection', () => {
      service.selectJob(JOB_A);
      last(fake.details).subject.error(apiError(404, 'NOT_FOUND'));

      expect(service.detailViewState()).toBe('not-found');
      expect(service.isDetailNotFound()).toBe(true);
      expect(service.detail()).toBeNull();
      expect(service.selectedJobId()).toBe(JOB_A);
      expect(service.detailError()?.kind).toBe('not-found');
      expect(service.detailError()?.message).not.toContain('secret');
    });

    it('JCS-41 clears a loaded detail when a refresh reports not-found', () => {
      loadDetail(JOB_A);
      service.refreshDetail();
      last(fake.details).subject.error(apiError(404, 'NOT_FOUND'));

      expect(service.detail()).toBeNull();
      expect(service.detailViewState()).toBe('not-found');
      expect(service.isDetailStale()).toBe(false);
      expect(service.evidence()).toEqual([]);
    });

    it('JCS-42 keeps a stale detail marked when a refresh fails', () => {
      const detail = makeDetail(JOB_A);
      loadDetail(JOB_A, detail);

      service.refreshDetail();

      expect(service.isDetailRefreshing()).toBe(true);
      expect(service.detailViewState()).toBe('ready');

      last(fake.details).subject.error(apiError(500, 'SERVER_ERROR'));

      expect(service.detail()).toBe(detail);
      expect(service.isDetailStale()).toBe(true);
      expect(service.detailRefreshError()?.kind).toBe('server-failure');
      expect(service.detailError()).toBeNull();

      service.refreshDetail();
      const fresh = makeDetail(JOB_A);
      respond(last(fake.details).subject, fresh);

      expect(service.detail()).toBe(fresh);
      expect(service.isDetailStale()).toBe(false);
      expect(service.detailRefreshError()).toBeNull();
    });

    it('JCS-43 ignores duplicate detail refreshes and refresh without a selection', () => {
      service.refreshDetail();
      expect(fake.api.getJobCard).not.toHaveBeenCalled();

      loadDetail(JOB_A);
      service.refreshDetail();
      service.refreshDetail();

      expect(fake.api.getJobCard).toHaveBeenCalledTimes(2);
    });

    it('JCS-44 clearing the selection cancels the request and ignores late data', () => {
      service.selectJob(JOB_A);
      const call = last(fake.details);

      service.clearSelection();

      expect(call.subject.observed).toBe(false);
      expect(service.selectedJobId()).toBeNull();
      expect(service.isDetailLoading()).toBe(false);

      respond(call.subject, makeDetail(JOB_A));

      expect(service.detail()).toBeNull();
      expect(service.detailViewState()).toBe('idle');
    });

    it('JCS-45 treats a detail for a different job id as a failure', () => {
      service.selectJob(JOB_A);
      respond(last(fake.details).subject, makeDetail(JOB_B));

      expect(service.detail()).toBeNull();
      expect(service.detailViewState()).toBe('error');
      expect(service.detailError()).not.toBeNull();
    });
  });

  describe('list and detail independence', () => {
    it('JCS-46 list loading does not disturb the loaded detail', () => {
      loadDetail(JOB_A);
      service.refreshList();

      expect(service.isListLoading()).toBe(true);
      expect(service.isDetailLoading()).toBe(false);
      expect(service.detailViewState()).toBe('ready');
    });

    it('JCS-47 detail loading does not disturb the loaded list', () => {
      const rows = [makeJob(JOB_A)];
      loadList(rows);
      service.selectJob(JOB_A);

      expect(service.isDetailLoading()).toBe(true);
      expect(service.isListLoading()).toBe(false);
      expect(service.listViewState()).toBe('ready');
      expect(service.serverRows()).toBe(rows);
    });

    it('JCS-48 a detail failure does not affect the list and vice versa', () => {
      loadList([makeJob(JOB_A)]);
      service.selectJob(JOB_A);
      last(fake.details).subject.error(apiError(500, 'SERVER_ERROR'));

      expect(service.listViewState()).toBe('ready');
      expect(service.listError()).toBeNull();
      expect(service.detailError()).not.toBeNull();

      service.refreshList();
      last(fake.lists).subject.error(apiError(500, 'SERVER_ERROR'));

      expect(service.isListStale()).toBe(true);
      expect(service.detailViewState()).toBe('error');
    });

    it('JCS-49 both reads can be in flight and resolve in any order', () => {
      service.refreshList();
      service.selectJob(JOB_A);

      respond(last(fake.details).subject, makeDetail(JOB_A));
      respond(last(fake.lists).subject, [makeJob(JOB_A)]);

      expect(service.listViewState()).toBe('ready');
      expect(service.detailViewState()).toBe('ready');
    });

    it('JCS-50 keeps the detail when the selected job disappears from the list', () => {
      loadList([makeJob(JOB_A), makeJob(JOB_B)]);
      loadDetail(JOB_A);

      expect(service.selectedMissingFromList()).toBe(false);

      service.setActiveOnly(false);
      respond(last(fake.lists).subject, [makeJob(JOB_A)]);
      service.refreshList();
      respond(last(fake.lists).subject, [makeJob(JOB_B)]);

      expect(service.selectedMissingFromList()).toBe(true);
      expect(service.selectedListSummary()).toBeNull();
      expect(service.detail()?.job.id).toBe(JOB_A);
      expect(service.detailViewState()).toBe('ready');
    });

    it('JCS-51 does not report a missing selection before the list is loaded', () => {
      service.selectJob(JOB_A);

      expect(service.selectedMissingFromList()).toBe(false);
    });
  });

  describe('inspection evidence', () => {
    function issueEvidence(index = 0) {
      return service.evidence()[index];
    }

    it('JCS-52 describes a valid image with a trusted absolute URL', () => {
      const raw = signedUrl('jpg');
      loadDetail(
        JOB_A,
        makeDetail(JOB_A, { issues: [makeIssue(ISSUE_1, [raw])] }),
      );

      const item = issueEvidence().items[0];

      expect(issueEvidence().issueId).toBe(ISSUE_1);
      expect(issueEvidence().hasMedia).toBe(true);
      expect(item.status).toBe('valid');
      expect(item.url).toBe(`${BASE}${raw}`);
      expect(item.previewKind).toBe('image');
      expect(item.previewable).toBe(true);
      expect(item.needsRefresh).toBe(false);
      expect(item.message).toBeNull();
      expect(item.reason).toBeNull();
      expect(item.mediaRef).toBe(`${MEDIA_HEX}.jpg`);
      expect(item.remainingSeconds).toBe(900);
      expect(item.key).toBe(`${ISSUE_1}:0`);
      expect(service.hasEvidence()).toBe(true);
      expect(service.evidenceNeedsRefresh()).toBe(false);
    });

    it('JCS-53 recognises video and audio hints from the extension only', () => {
      loadDetail(
        JOB_A,
        makeDetail(JOB_A, {
          issues: [
            makeIssue(ISSUE_1, [signedUrl('mp4'), signedUrl('mp3')]),
          ],
        }),
      );

      const items = issueEvidence().items;

      expect(items[0].previewKind).toBe('video');
      expect(items[1].previewKind).toBe('audio');
      expect(items.every(item => item.previewable)).toBe(true);
    });

    it('JCS-54 marks expired media as needing a detail refresh and hides its URL', () => {
      loadDetail(
        JOB_A,
        makeDetail(JOB_A, {
          issues: [
            makeIssue(ISSUE_1, [signedUrl('jpg', START_SECONDS - 1)]),
          ],
        }),
      );

      const item = issueEvidence().items[0];

      expect(item.status).toBe('expired');
      expect(item.url).toBeNull();
      expect(item.previewable).toBe(false);
      expect(item.needsRefresh).toBe(true);
      expect(item.message).toBeTruthy();
      expect(service.evidenceNeedsRefresh()).toBe(true);
    });

    it('JCS-55 rejects malformed and untrusted media without exposing the raw URL', () => {
      const evil = `https://evil.test${signedUrl('jpg')}`;
      const script = 'javascript:alert(document.cookie)';
      const traversal = `/api/v1/media/../secret.jpg?exp=${START_SECONDS + 900}&sig=${SIG}`;

      loadDetail(
        JOB_A,
        makeDetail(JOB_A, {
          issues: [makeIssue(ISSUE_1, [evil, script, traversal, ''])],
        }),
      );

      const items = issueEvidence().items;

      expect(items.map(item => item.status)).toEqual([
        'untrusted',
        'untrusted',
        'malformed',
        'malformed',
      ]);

      for (const item of items) {
        expect(item.url).toBeNull();
        expect(item.previewable).toBe(false);
        expect(item.previewKind).toBe('unsupported');
        expect(item.needsRefresh).toBe(false);

        const exposed = JSON.stringify(item);

        expect(exposed).not.toContain(SIG);
        expect(exposed).not.toContain('evil.test');
        expect(exposed).not.toContain('javascript');
        expect(exposed).not.toContain('alert(');
        expect(exposed).not.toContain('..');
      }
    });

    it('JCS-56 never treats SVG, HTML or unknown types as previewable', () => {
      loadDetail(
        JOB_A,
        makeDetail(JOB_A, {
          issues: [
            makeIssue(ISSUE_1, [
              signedUrl('svg'),
              signedUrl('html'),
              signedUrl('pdf'),
            ]),
          ],
        }),
      );

      for (const item of issueEvidence().items) {
        expect(item.previewKind).toBe('unsupported');
        expect(item.previewable).toBe(false);
      }
    });

    it('JCS-57 reports an unconfigured API origin as unconfigured media', () => {
      service.ngOnDestroy();
      TestBed.resetTestingModule();
      configure({ baseUrl: null });

      loadDetail(
        JOB_A,
        makeDetail(JOB_A, {
          issues: [makeIssue(ISSUE_1, [signedUrl('jpg')])],
        }),
      );

      const item = issueEvidence().items[0];

      expect(item.status).toBe('unconfigured');
      expect(item.url).toBeNull();
      expect(item.previewable).toBe(false);
    });

    it('JCS-58 represents missing media and does not invent metadata', () => {
      loadDetail(
        JOB_A,
        makeDetail(JOB_A, {
          issues: [makeIssue(ISSUE_1, []), makeIssue(ISSUE_2, [signedUrl()])],
        }),
      );

      expect(service.evidence()).toHaveLength(2);
      expect(service.evidence()[0].hasMedia).toBe(false);
      expect(service.evidence()[0].items).toEqual([]);
      expect(service.evidence()[1].hasMedia).toBe(true);

      const item = service.evidence()[1].items[0];

      for (const invented of ['caption', 'mimeType', 'contentType', 'phase']) {
        expect(Object.keys(item)).not.toContain(invented);
      }
    });

    it('JCS-59 reports no evidence for a job without issues', () => {
      loadDetail(JOB_A);

      expect(service.evidence()).toEqual([]);
      expect(service.hasEvidence()).toBe(false);
    });

    it('JCS-60 re-evaluates expiry on the local timer without any request', () => {
      loadDetail(
        JOB_A,
        makeDetail(JOB_A, {
          issues: [makeIssue(ISSUE_1, [signedUrl('jpg')])],
        }),
      );

      expect(issueEvidence().items[0].status).toBe('valid');

      const calls = fake.api.getJobCard.mock.calls.length;

      vi.advanceTimersByTime(915_000);

      expect(issueEvidence().items[0].status).toBe('expired');
      expect(issueEvidence().items[0].url).toBeNull();
      expect(service.evidenceNeedsRefresh()).toBe(true);
      expect(fake.api.getJobCard.mock.calls.length).toBe(calls);
    });

    it('JCS-61 re-evaluates expiry before use even between timer ticks', () => {
      loadDetail(
        JOB_A,
        makeDetail(JOB_A, {
          issues: [makeIssue(ISSUE_1, [signedUrl('jpg')])],
        }),
      );

      vi.setSystemTime(START + 901_000);

      expect(issueEvidence().items[0].status).toBe('valid');

      const fresh = service.getEvidenceForUse(ISSUE_1, 0);

      expect(fresh?.status).toBe('expired');
      expect(fresh?.url).toBeNull();
      expect(service.getEvidenceForUse(ISSUE_1, 5)).toBeNull();
      expect(service.getEvidenceForUse(ISSUE_2, 0)).toBeNull();
    });

    it('JCS-62 refreshes signed media only through a job detail reload', () => {
      loadDetail(
        JOB_A,
        makeDetail(JOB_A, {
          issues: [
            makeIssue(ISSUE_1, [signedUrl('jpg', START_SECONDS + 1)]),
          ],
        }),
      );

      vi.advanceTimersByTime(JOB_CARD_STATE_CHECK_INTERVAL_MS);
      expect(service.evidenceNeedsRefresh()).toBe(true);

      service.refreshEvidence();

      expect(fake.api.getJobCard).toHaveBeenCalledTimes(2);
      expect(last(fake.details).id).toBe(JOB_A);

      respond(
        last(fake.details).subject,
        makeDetail(JOB_A, {
          issues: [
            makeIssue(ISSUE_1, [signedUrl('jpg', START_SECONDS + 5_000)]),
          ],
        }),
      );

      expect(service.evidenceNeedsRefresh()).toBe(false);
      expect(issueEvidence().items[0].status).toBe('valid');
    });

    it('JCS-63 keeps stale expired evidence marked when the refresh fails', () => {
      loadDetail(
        JOB_A,
        makeDetail(JOB_A, {
          issues: [
            makeIssue(ISSUE_1, [signedUrl('jpg', START_SECONDS + 1)]),
          ],
        }),
      );

      vi.advanceTimersByTime(JOB_CARD_STATE_CHECK_INTERVAL_MS);
      service.refreshEvidence();
      last(fake.details).subject.error(apiError(500, 'SERVER_ERROR'));

      expect(service.isDetailStale()).toBe(true);
      expect(service.evidenceNeedsRefresh()).toBe(true);
      expect(issueEvidence().items[0].url).toBeNull();
    });

    it('JCS-64 never fetches media directly', () => {
      loadDetail(
        JOB_A,
        makeDetail(JOB_A, {
          issues: [makeIssue(ISSUE_1, [signedUrl('jpg'), signedUrl('mp4')])],
        }),
      );

      service.getEvidenceForUse(ISSUE_1, 0);
      vi.advanceTimersByTime(60_000);

      httpMock.expectNone(() => true);
    });

    it('JCS-65 clears evidence with the selection', () => {
      loadDetail(
        JOB_A,
        makeDetail(JOB_A, {
          issues: [makeIssue(ISSUE_1, [signedUrl('jpg')])],
        }),
      );

      service.clearSelection();

      expect(service.evidence()).toEqual([]);
      expect(service.hasEvidence()).toBe(false);
    });
  });

  describe('session security', () => {
    it('JCS-66 refuses to load without a session and reports unauthorized', () => {
      session.clearSession();
      TestBed.tick();

      service.refreshList();
      expect(service.selectJob(JOB_A)).toBe(false);

      expect(fake.api.getJobCards).not.toHaveBeenCalled();
      expect(fake.api.getJobCard).not.toHaveBeenCalled();
      expect(service.authFailure()).toBe('unauthorized');
      expect(service.listViewState()).toBe('error');
      expect(service.serverRows()).toBeNull();
      expect(serviceTimers()).toBe(0);
    });

    it('JCS-67 logout clears list, detail, selection, evidence and cancels requests', () => {
      loadList([makeJob(JOB_A)]);
      loadDetail(
        JOB_A,
        makeDetail(JOB_A, {
          issues: [makeIssue(ISSUE_1, [signedUrl('jpg')])],
        }),
      );
      service.refreshList();
      service.refreshDetail();
      const pendingList = last(fake.lists);
      const pendingDetail = last(fake.details);

      session.clearSession();
      TestBed.tick();

      expect(pendingList.subject.observed).toBe(false);
      expect(pendingDetail.subject.observed).toBe(false);
      expect(service.serverRows()).toBeNull();
      expect(service.detail()).toBeNull();
      expect(service.selectedJobId()).toBeNull();
      expect(service.evidence()).toEqual([]);
      expect(service.isListLoading()).toBe(false);
      expect(service.isDetailLoading()).toBe(false);
      expect(service.authFailure()).toBe('unauthorized');
      expect(serviceTimers()).toBe(0);

      respond(pendingList.subject, [makeJob(JOB_B)]);
      respond(pendingDetail.subject, makeDetail(JOB_A));

      expect(service.serverRows()).toBeNull();
      expect(service.detail()).toBeNull();
    });

    it('JCS-68 session expiry clears protected state through the local check', () => {
      session.setSession(makeSession('manager-001', 20_000));
      TestBed.tick();

      loadList([makeJob(JOB_A)]);
      loadDetail(JOB_A);

      vi.advanceTimersByTime(JOB_CARD_STATE_CHECK_INTERVAL_MS);
      expect(service.serverRows()).not.toBeNull();

      vi.advanceTimersByTime(JOB_CARD_STATE_CHECK_INTERVAL_MS);

      expect(service.serverRows()).toBeNull();
      expect(service.detail()).toBeNull();
      expect(service.selectedJobId()).toBeNull();
      expect(service.authFailure()).toBe('unauthorized');
      expect(serviceTimers()).toBe(0);
    });

    it('JCS-69 session replacement clears the previous user data and rejects late responses', () => {
      service.refreshList();
      const oldList = last(fake.lists);
      service.selectJob(JOB_A);
      const oldDetail = last(fake.details);

      session.setSession(makeSession('manager-002'));
      TestBed.tick();

      expect(service.serverRows()).toBeNull();
      expect(service.selectedJobId()).toBeNull();
      expect(service.isListLoading()).toBe(false);
      expect(service.authFailure()).toBeNull();

      respond(oldList.subject, [makeJob(JOB_A)]);
      respond(oldDetail.subject, makeDetail(JOB_A));

      expect(service.serverRows()).toBeNull();
      expect(service.detail()).toBeNull();
      expect(service.evidence()).toEqual([]);
    });

    it('JCS-70 a new session loads independently after replacement', () => {
      loadList([makeJob(JOB_A, { customerName: 'Previous User Customer' })]);
      loadDetail(JOB_A);

      session.setSession(makeSession('manager-002'));
      TestBed.tick();

      loadList([makeJob(JOB_B)]);

      expect(service.serverRows()).toHaveLength(1);
      expect(service.serverRows()?.[0].id).toBe(JOB_B);
      expect(JSON.stringify(service.serverRows())).not.toContain(
        'Previous User Customer',
      );
      expect(service.detail()).toBeNull();
    });

    it('JCS-71 can load again after logout and a fresh sign-in', () => {
      loadList([makeJob(JOB_A)]);

      session.clearSession();
      TestBed.tick();
      expect(service.authFailure()).toBe('unauthorized');

      session.setSession(makeSession('manager-003'));
      TestBed.tick();
      loadList([makeJob(JOB_C)]);

      expect(service.authFailure()).toBeNull();
      expect(service.serverRows()?.[0].id).toBe(JOB_C);
    });

    it('JCS-72 treats HTTP 401 on the list as ended session and clears everything', () => {
      loadDetail(JOB_A);
      service.refreshList();
      last(fake.lists).subject.error(apiError(401, 'UNAUTHORIZED'));

      expect(service.authFailure()).toBe('unauthorized');
      expect(service.listError()?.requiresSignIn).toBe(true);
      expect(service.detail()).toBeNull();
      expect(service.selectedJobId()).toBeNull();
      expect(service.serverRows()).toBeNull();
      expect(service.listError()?.message).not.toContain('secret');
    });

    it('JCS-73 treats HTTP 403 on the list as forbidden and clears everything', () => {
      loadList([makeJob(JOB_A)]);
      service.refreshList();
      last(fake.lists).subject.error(apiError(403, 'FORBIDDEN'));

      expect(service.authFailure()).toBe('forbidden');
      expect(service.serverRows()).toBeNull();
      expect(service.listViewState()).toBe('error');
    });

    it('JCS-74 treats HTTP 401 and 403 on the detail as latched access loss until a new session', () => {
      loadList([makeJob(JOB_A)]);
      service.selectJob(JOB_A);
      last(fake.details).subject.error(apiError(401, 'UNAUTHORIZED'));

      expect(service.authFailure()).toBe('unauthorized');
      expect(service.accessRevoked()).toBe(true);
      expect(service.serverRows()).toBeNull();
      expect(service.selectedJobId()).toBeNull();
      expect(service.detailViewState()).toBe('error');

      // Same revoked session stays refused; only a new valid session recovers.
      service.refreshList();
      expect(fake.api.getJobCards).toHaveBeenCalledTimes(1);
      expect(service.authFailure()).toBe('unauthorized');

      session.setSession(makeSession('manager-002'));
      TestBed.tick();
      loadList([makeJob(JOB_A)]);
      expect(service.authFailure()).toBeNull();
      expect(service.accessRevoked()).toBe(false);

      service.selectJob(JOB_A);
      last(fake.details).subject.error(apiError(403, 'FORBIDDEN'));

      expect(service.authFailure()).toBe('forbidden');
      expect(service.accessRevoked()).toBe(true);
      expect(service.detail()).toBeNull();

      service.refreshList();
      expect(fake.api.getJobCards).toHaveBeenCalledTimes(2);
    });

    it('JCS-75 never uses browser storage', () => {
      const getItem = vi.spyOn(Storage.prototype, 'getItem');
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      const removeItem = vi.spyOn(Storage.prototype, 'removeItem');

      loadList([makeJob(JOB_A)]);
      loadDetail(
        JOB_A,
        makeDetail(JOB_A, {
          issues: [makeIssue(ISSUE_1, [signedUrl('jpg')])],
        }),
      );
      session.clearSession();
      TestBed.tick();

      expect(getItem).not.toHaveBeenCalled();
      expect(setItem).not.toHaveBeenCalled();
      expect(removeItem).not.toHaveBeenCalled();
    });

    it('JCS-76 does not log signed URLs, tokens or backend text', () => {
      const spies = [
        vi.spyOn(console, 'log'),
        vi.spyOn(console, 'warn'),
        vi.spyOn(console, 'error'),
        vi.spyOn(console, 'info'),
        vi.spyOn(console, 'debug'),
      ];

      loadDetail(
        JOB_A,
        makeDetail(JOB_A, {
          issues: [
            makeIssue(ISSUE_1, [
              signedUrl('jpg'),
              `https://evil.test${signedUrl()}`,
            ]),
          ],
        }),
      );
      service.refreshList();
      last(fake.lists).subject.error(apiError(500, 'SERVER_ERROR'));

      for (const spy of spies) {
        expect(spy).not.toHaveBeenCalled();
      }
    });
  });

  describe('lifecycle and cleanup', () => {
    it('JCS-77 runs a single local timer that never performs HTTP', () => {
      expect(serviceTimers()).toBe(0);

      service.refreshList();
      service.selectJob(JOB_A);
      service.refreshDetail();

      expect(serviceTimers()).toBe(1);

      respond(last(fake.lists).subject, [makeJob(JOB_A)]);
      respond(last(fake.details).subject, makeDetail(JOB_A));

      const listCalls = fake.api.getJobCards.mock.calls.length;
      const detailCalls = fake.api.getJobCard.mock.calls.length;

      vi.advanceTimersByTime(JOB_CARD_STATE_CHECK_INTERVAL_MS * 10);

      expect(fake.api.getJobCards.mock.calls.length).toBe(listCalls);
      expect(fake.api.getJobCard.mock.calls.length).toBe(detailCalls);
      expect(serviceTimers()).toBe(1);
      httpMock.expectNone(() => true);
    });

    it('JCS-78 destroy cancels requests, clears state and removes the timer', () => {
      service.refreshList();
      const list = last(fake.lists);
      service.selectJob(JOB_A);
      const detail = last(fake.details);

      service.ngOnDestroy();

      expect(list.subject.observed).toBe(false);
      expect(detail.subject.observed).toBe(false);
      expect(serviceTimers()).toBe(0);
      expect(service.serverRows()).toBeNull();
      expect(service.selectedJobId()).toBeNull();
    });

    it('JCS-79 ignores late responses and all actions after destroy', () => {
      service.refreshList();
      const list = last(fake.lists);
      service.selectJob(JOB_A);
      const detail = last(fake.details);

      service.ngOnDestroy();

      respond(list.subject, [makeJob(JOB_A)]);
      respond(detail.subject, makeDetail(JOB_A));

      const listCalls = fake.api.getJobCards.mock.calls.length;
      const detailCalls = fake.api.getJobCard.mock.calls.length;

      service.refreshList();
      service.refreshDetail();
      service.refreshEvidence();
      service.reevaluateEvidence();

      expect(service.selectJob(JOB_B)).toBe(false);
      expect(service.setActiveOnly(false)).toBe(false);
      expect(fake.api.getJobCards.mock.calls.length).toBe(listCalls);
      expect(fake.api.getJobCard.mock.calls.length).toBe(detailCalls);
      expect(service.serverRows()).toBeNull();
      expect(service.detail()).toBeNull();
      expect(serviceTimers()).toBe(0);
    });

    it('JCS-80 destroy is idempotent', () => {
      service.refreshList();

      expect(() => {
        service.ngOnDestroy();
        service.ngOnDestroy();
      }).not.toThrow();
      expect(serviceTimers()).toBe(0);
    });

    it('JCS-81 does not react to later session changes after destroy', () => {
      loadList([makeJob(JOB_A)]);
      service.ngOnDestroy();

      session.clearSession();
      session.setSession(makeSession('manager-009'));
      TestBed.tick();

      expect(service.authFailure()).toBeNull();
      expect(service.serverRows()).toBeNull();
    });
  });

  describe('read-only contract', () => {
    it('JCS-82 only depends on the two read operations of the API service', () => {
      loadList([makeJob(JOB_A)]);
      loadDetail(JOB_A);
      service.refreshList();
      service.refreshDetail();
      service.setActiveOnly(false);

      const used = Object.keys(fake.api).sort();

      expect(used).toEqual(['getJobCard', 'getJobCards']);
      httpMock.expectNone(() => true);
    });

    it('JCS-83 exposes no mutation, assignment, pricing or approval operations', () => {
      const proto = Object.getOwnPropertyNames(
        Object.getPrototypeOf(service),
      );
      const forbidden =
        /^(create|update|delete|submit|approve|reject|assign|reassign|price|publish|upload|release|close|cancel(Job|Request)|save|post|put|patch)/i;

      expect(proto.filter(name => forbidden.test(name))).toEqual([]);
    });
  });
});

describe('JobCardStateService with the real JobCardApiService (GET only)', () => {
  let service: JobCardStateService;
  let httpMock: HttpTestingController;
  let session: SessionService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
        JobCardStateService,
      ],
    });

    session = TestBed.inject(SessionService);
    httpMock = TestBed.inject(HttpTestingController);
    session.setSession(makeSession());
    service = TestBed.inject(JobCardStateService);
    TestBed.tick();
  });

  afterEach(() => {
    service.ngOnDestroy();
  });

  it('JCS-84 sends only GET requests for list, filters and detail, never for media', () => {
    service.refreshList();
    const listReq = httpMock.expectOne(
      request => request.url === `${BASE}/api/v1/manager/jobs`,
    );

    expect(listReq.request.method).toBe('GET');
    expect(listReq.request.params.get('activeOnly')).toBe('true');
    expect(listReq.request.params.has('customerId')).toBe(false);
    listReq.flush([makeJob(JOB_A)]);

    service.setCustomerId(CUSTOMER_2);
    service.setActiveOnly(false);
    const filtered = httpMock.match(
      request => request.url === `${BASE}/api/v1/manager/jobs`,
    );

    expect(filtered.length).toBe(2);
    expect(filtered[0].cancelled).toBe(true);
    expect(filtered[1].request.params.get('activeOnly')).toBe('false');
    expect(filtered[1].request.params.get('customerId')).toBe(CUSTOMER_2);
    filtered[1].flush([makeJob(JOB_A)]);

    service.selectJob(JOB_A);
    const detailReq = httpMock.expectOne(
      `${BASE}/api/v1/manager/jobs/${JOB_A}`,
    );

    expect(detailReq.request.method).toBe('GET');
    detailReq.flush(
      makeDetail(JOB_A, {
        issues: [makeIssue(ISSUE_1, [signedUrl('jpg')])],
      }),
    );

    expect(service.detailViewState()).toBe('ready');
    expect(service.evidence()[0].items[0].status).toBe('valid');

    service.refreshEvidence();
    httpMock
      .expectOne(`${BASE}/api/v1/manager/jobs/${JOB_A}`)
      .flush(makeDetail(JOB_A));

    httpMock.expectNone(() => true);
  });

  it('JCS-85 cancels the superseded HTTP detail request when the selection changes', () => {
    service.selectJob(JOB_A);
    const first = httpMock.expectOne(
      `${BASE}/api/v1/manager/jobs/${JOB_A}`,
    );

    service.selectJob(JOB_B);

    expect(first.cancelled).toBe(true);

    httpMock
      .expectOne(`${BASE}/api/v1/manager/jobs/${JOB_B}`)
      .flush(makeDetail(JOB_B));

    expect(service.detail()?.job.id).toBe(JOB_B);
  });

  it('JCS-86 cancels in-flight HTTP reads on logout', () => {
    service.refreshList();
    const req = httpMock.expectOne(
      request => request.url === `${BASE}/api/v1/manager/jobs`,
    );

    session.clearSession();
    TestBed.tick();

    expect(req.cancelled).toBe(true);
    expect(service.authFailure()).toBe('unauthorized');
  });
});

describe('JobCardStateService K13-A04-R1 authorization latch and hygiene', () => {
  let service: JobCardStateService;
  let fake: ReturnType<typeof createFakeApi>;
  let session: SessionService;
  let coordinator: Day06AuthorizationCoordinatorService;
  let httpMock: HttpTestingController;

  function setup(config: ApiConfig | null = { baseUrl: BASE }): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor, authInterceptor])),
        provideHttpClientTesting(),
        ...(config === null ? [] : [{ provide: API_CONFIG, useValue: config }]),
        JobCardStateService,
        { provide: JobCardApiService, useValue: fake.api },
      ],
    });

    session = TestBed.inject(SessionService);
    coordinator = TestBed.inject(Day06AuthorizationCoordinatorService);
    httpMock = TestBed.inject(HttpTestingController);
    session.setSession(makeSession());
    service = TestBed.inject(JobCardStateService);
    TestBed.tick();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    fake = createFakeApi();
    setup();
  });

  afterEach(() => {
    service.ngOnDestroy();
    httpMock.verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each([
    ['list', 401, 'UNAUTHORIZED', 'unauthorized'],
    ['list', 403, 'FORBIDDEN', 'forbidden'],
    ['detail', 401, 'UNAUTHORIZED', 'unauthorized'],
    ['detail', 403, 'FORBIDDEN', 'forbidden'],
  ] as const)(
    'JCS-87 %s HTTP %s latches revocation, clears protected/stale state, cancels pending reads and blocks same-session bypasses',
    (source, status, code, expectedFailure) => {
      service.refreshList();
      respond(last(fake.lists).subject, [makeJob(JOB_A)]);
      service.selectJob(JOB_A);
      respond(
        last(fake.details).subject,
        makeDetail(JOB_A, { issues: [makeIssue(ISSUE_1, [signedUrl('jpg')])] }),
      );

      // Put list & detail into stale state via a non-auth refresh failure first.
      service.refreshList();
      last(fake.lists).subject.error(apiError(500, 'SERVER_ERROR'));
      service.refreshDetail();
      last(fake.details).subject.error(apiError(500, 'SERVER_ERROR'));
      expect(service.isListStale()).toBe(true);
      expect(service.isDetailStale()).toBe(true);

      // Start concurrent pending list + detail reads.
      service.refreshList();
      const pendingList = last(fake.lists);
      service.refreshDetail();
      const pendingDetail = last(fake.details);

      if (source === 'list') {
        pendingList.subject.error(apiError(status, code));
      } else {
        pendingDetail.subject.error(apiError(status, code));
      }

      const expectedMsg = resolveJobCardsError(
        apiError(status, code),
        'read',
      ).message;

      expect(service.accessRevoked()).toBe(true);
      expect(service.authFailure()).toBe(expectedFailure);
      expect(service.listError()?.message).toBe(expectedMsg);
      expect(service.detailError()?.message).toBe(expectedMsg);
      expect(service.listError()?.requiresSignIn).toBe(status === 401);
      expect(service.serverRows()).toBeNull();
      expect(service.visibleJobs()).toEqual([]);
      expect(service.selectedJobId()).toBeNull();
      expect(service.detail()).toBeNull();
      expect(service.evidence()).toEqual([]);
      expect(service.proposals()).toEqual([]);
      expect(service.changeRequests()).toEqual([]);
      expect(service.isListLoading()).toBe(false);
      expect(service.isDetailLoading()).toBe(false);
      expect(service.isListStale()).toBe(false);
      expect(service.isDetailStale()).toBe(false);
      expect(service.listLastSyncedAt()).toBeNull();
      expect(service.detailLastSyncedAt()).toBeNull();
      expect(pendingList.subject.observed).toBe(false);
      expect(pendingDetail.subject.observed).toBe(false);

      // Late success/failure emissions must not restore state.
      respond(pendingList.subject, [makeJob(JOB_B)]);
      respond(pendingDetail.subject, makeDetail(JOB_B));
      pendingList.subject.error(apiError(500, 'SERVER_ERROR'));
      pendingDetail.subject.error(apiError(500, 'SERVER_ERROR'));

      expect(service.serverRows()).toBeNull();
      expect(service.detail()).toBeNull();
      expect(service.authFailure()).toBe(expectedFailure);

      const listCalls = fake.api.getJobCards.mock.calls.length;
      const detailCalls = fake.api.getJobCard.mock.calls.length;

      // Same session refresh, selection and server-filter changes stay refused.
      service.refreshList();
      service.refreshDetail();
      service.refreshEvidence();
      expect(service.selectJob(JOB_B)).toBe(false);
      expect(service.setServerFilter({ activeOnly: false })).toBe(false);
      expect(service.setActiveOnly(false)).toBe(false);
      expect(service.setCustomerId(CUSTOMER_2)).toBe(false);

      // Re-setting the identical session reference or logging out does not lift latch.
      const sameSession = session.session() as AuthSession;
      session.setSession(sameSession);
      TestBed.tick();
      service.refreshList();

      session.clearSession();
      TestBed.tick();
      service.refreshList();

      expect(fake.api.getJobCards).toHaveBeenCalledTimes(listCalls);
      expect(fake.api.getJobCard).toHaveBeenCalledTimes(detailCalls);
      expect(service.accessRevoked()).toBe(true);
      expect(service.authFailure()).toBe(expectedFailure);

      // Replacement with a new valid session lifts the latch without auto-reload.
      session.setSession(makeSession('manager-002'));
      TestBed.tick();
      expect(service.accessRevoked()).toBe(false);
      expect(service.authFailure()).toBeNull();
      expect(service.serverRows()).toBeNull();
      expect(fake.api.getJobCards).toHaveBeenCalledTimes(listCalls);

      service.refreshList();
      expect(fake.api.getJobCards).toHaveBeenCalledTimes(listCalls + 1);
      respond(last(fake.lists).subject, [makeJob(JOB_C)]);
      expect(service.serverRows()?.[0].id).toBe(JOB_C);
    },
  );

  it('JCS-88 clears sensitive free-text search and customerId across logout, expiry, replacement and 401/403 while keeping safe preferences', () => {
    service.setActiveOnly(false);
    respond(last(fake.lists).subject, [makeJob(JOB_A)]);
    service.setCustomerId(CUSTOMER_2);
    respond(last(fake.lists).subject, [makeJob(JOB_A)]);
    service.setSearch('Kavitha Perera WP-CAB-1234');
    service.setStatusFilter('Inspecting');
    service.setPriorityFilter(2);

    // 1. Authorization failure (403)
    service.refreshList();
    last(fake.lists).subject.error(apiError(403, 'FORBIDDEN'));
    expect(service.localFilter()).toEqual({
      search: '',
      status: 'Inspecting',
      priority: 2,
    });
    expect(service.serverFilter()).toEqual({
      activeOnly: false,
      customerId: null,
    });

    // Free-text search is ignored while revoked.
    service.setSearch('Secret Customer');
    expect(service.localFilter().search).toBe('');

    // Search entered before any read also clears on replacement and logout.
    session.setSession(makeSession('manager-002-idle'));
    TestBed.tick();
    service.setSearch('Pre-Read Sensitive');
    session.setSession(makeSession('manager-002'));
    TestBed.tick();
    expect(service.localFilter().search).toBe('');

    // 2. Session replacement clears search & customerId
    service.setCustomerId(CUSTOMER_1);
    respond(last(fake.lists).subject, [makeJob(JOB_B)]);
    service.setSearch('Vehicle 9988');

    session.setSession(makeSession('manager-003'));
    TestBed.tick();
    expect(service.localFilter().search).toBe('');
    expect(service.serverFilter().customerId).toBeNull();
    expect(service.localFilter().status).toBe('Inspecting');
    expect(service.localFilter().priority).toBe(2);
    expect(service.serverFilter().activeOnly).toBe(false);

    // 3. Logout clears search & customerId
    service.setCustomerId(CUSTOMER_2);
    respond(last(fake.lists).subject, [makeJob(JOB_C)]);
    service.setSearch('Phone 0771234567');
    session.clearSession();
    TestBed.tick();
    expect(service.localFilter().search).toBe('');
    expect(service.serverFilter().customerId).toBeNull();

    // 4. Expiry clears search & customerId
    session.setSession(makeSession('manager-004', 10_000));
    TestBed.tick();
    service.setCustomerId(CUSTOMER_1);
    respond(last(fake.lists).subject, [makeJob(JOB_A)]);
    service.setSearch('Expiring Search');
    vi.advanceTimersByTime(JOB_CARD_STATE_CHECK_INTERVAL_MS);
    expect(service.localFilter().search).toBe('');
    expect(service.serverFilter().customerId).toBeNull();
  });

  it('JCS-89 newly constructed JobCardStateService under an already-revoked session latches immediately with zero HTTP and rejects manual ApiError propagation', () => {
    service.ngOnDestroy();
    TestBed.resetTestingModule();
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
    const active = makeSession();
    session.setSession(active);
    service = TestBed.inject(JobCardStateService);
    const fixProof = TestBed.inject(FixProofStateService);
    TestBed.tick();

    // Manually constructed ApiError(401) without actual HTTP provenance must not propagate.
    const manualProv = coordinator.createRequestProvenance(
      'fixproof-read',
      active,
      'api/v1/manager/approvals/proposals',
      'GET',
    );
    expect(
      coordinator.reportUnauthorized(manualProv, apiError(401, 'UNAUTHORIZED')),
    ).toBe(false);
    expect(coordinator.isSessionRevoked(active)).toBe(false);

    // Real authenticated HTTP 401 from FixProof propagates across features.
    fixProof.refreshProposals();
    const proposalsReq = httpMock.expectOne(
      r => r.url === `${BASE}/api/v1/manager/approvals/proposals`,
    );
    expect(proposalsReq.request.headers.get('Authorization')).toBe(
      `Bearer ${active.accessToken}`,
    );
    proposalsReq.flush(
      { message: SENSITIVE },
      { status: 401, statusText: 'Unauthorized' },
    );
    expect(coordinator.isSessionRevoked(active)).toBe(true);

    const env = createEnvironmentInjector(
      [JobCardStateService],
      TestBed.inject(EnvironmentInjector),
    );
    const secondInstance = env.get(JobCardStateService);

    expect(secondInstance.accessRevoked()).toBe(true);
    expect(secondInstance.authFailure()).toBe('unauthorized');
    secondInstance.refreshList();
    expect(secondInstance.selectJob(JOB_A)).toBe(false);
    httpMock.expectNone(() => true);

    fixProof.ngOnDestroy();
    env.destroy();
  });

  it('JCS-90 handles multiple active instances, repeated 401 notifications and unregisters on destroy', () => {
    service.ngOnDestroy();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor, authInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
        JobCardStateService,
      ],
    });
    session = TestBed.inject(SessionService);
    httpMock = TestBed.inject(HttpTestingController);
    coordinator = TestBed.inject(Day06AuthorizationCoordinatorService);
    const active = makeSession();
    session.setSession(active);
    service = TestBed.inject(JobCardStateService);
    TestBed.tick();

    const env = createEnvironmentInjector(
      [JobCardStateService],
      TestBed.inject(EnvironmentInjector),
    );
    const secondInstance = env.get(JobCardStateService);

    service.refreshList();
    const firstLoad = httpMock.expectOne(
      r => r.url === `${BASE}/api/v1/manager/jobs`,
    );
    expect(firstLoad.request.headers.get('Authorization')).toBe(
      `Bearer ${active.accessToken}`,
    );
    firstLoad.flush([makeJob(JOB_A)]);

    secondInstance.refreshList();
    const secondListCall = httpMock.expectOne(
      r => r.url === `${BASE}/api/v1/manager/jobs`,
    );

    service.refreshList();
    const first401Call = httpMock.expectOne(
      r => r.url === `${BASE}/api/v1/manager/jobs`,
    );
    expect(first401Call.request.headers.get('Authorization')).toBe(
      `Bearer ${active.accessToken}`,
    );
    first401Call.flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(service.accessRevoked()).toBe(true);
    expect(secondInstance.accessRevoked()).toBe(true);
    expect(secondInstance.authFailure()).toBe('unauthorized');
    expect(secondListCall.cancelled).toBe(true);

    // Repeated coordinator reports (or manual ApiError) for the same session do not throw or send HTTP.
    const provenance = coordinator.createRequestProvenance(
      'job-cards',
      session.session() as AuthSession,
      'api/v1/manager/jobs',
      'GET',
    );
    expect(
      coordinator.reportUnauthorized(provenance, apiError(401, 'UNAUTHORIZED')),
    ).toBe(false);
    httpMock.expectNone(() => true);

    env.destroy();
    const afterDestroySession = makeSession('manager-005');
    session.setSession(afterDestroySession);
    TestBed.tick();

    expect(service.accessRevoked()).toBe(false);
    expect(secondInstance.authFailure()).toBeNull();
  });

  it('JCS-91 missing or invalid API_CONFIG.baseUrl refuses cross-feature propagation on 401 while keeping local latch', () => {
    for (const invalidConfig of [
      { baseUrl: null },
      { baseUrl: 'http://untrusted.example' },
    ] as const) {
      service.ngOnDestroy();
      setup(invalidConfig);
      const active = session.session() as AuthSession;

      service.refreshList();
      last(fake.lists).subject.error(apiError(401, 'UNAUTHORIZED'));

      expect(service.accessRevoked()).toBe(true);
      expect(service.authFailure()).toBe('unauthorized');
      expect(coordinator.isSessionRevoked(active)).toBe(false);
    }
  });

  it('JCS-92 real HttpTestingController HTTP 401 and 403 latch same-session refusal and recover only on new session', () => {
    service.ngOnDestroy();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor, authInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
        JobCardStateService,
      ],
    });
    session = TestBed.inject(SessionService);
    httpMock = TestBed.inject(HttpTestingController);
    session.setSession(makeSession());
    service = TestBed.inject(JobCardStateService);
    TestBed.tick();

    service.refreshList();
    const initialListReq = httpMock.expectOne(
      `${BASE}/api/v1/manager/jobs?activeOnly=true`,
    );
    expect(initialListReq.request.headers.get('Authorization')).toBe(
      'Bearer test-access-token',
    );
    initialListReq.flush([makeJob(JOB_A)]);
    service.selectJob(JOB_A);
    const detailReq = httpMock.expectOne(
      `${BASE}/api/v1/manager/jobs/${JOB_A}`,
    );
    expect(detailReq.request.headers.get('Authorization')).toBe(
      'Bearer test-access-token',
    );
    service.refreshList();
    const pendingListReq = httpMock.expectOne(
      `${BASE}/api/v1/manager/jobs?activeOnly=true`,
    );

    detailReq.flush(
      { message: SENSITIVE },
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(pendingListReq.cancelled).toBe(true);
    expect(service.accessRevoked()).toBe(true);
    expect(service.authFailure()).toBe('unauthorized');
    expect(service.serverRows()).toBeNull();
    expect(service.detail()).toBeNull();

    service.refreshList();
    expect(service.selectJob(JOB_A)).toBe(false);
    httpMock.expectNone(() => true);

    session.setSession(makeSession('manager-002'));
    TestBed.tick();
    httpMock.expectNone(() => true);
    expect(service.accessRevoked()).toBe(false);

    service.refreshList();
    const session2ListReq = httpMock.expectOne(
      `${BASE}/api/v1/manager/jobs?activeOnly=true`,
    );
    expect(session2ListReq.request.headers.get('Authorization')).toBe(
      'Bearer test-access-token',
    );
    session2ListReq.flush([makeJob(JOB_B)]);
    expect(service.serverRows()?.[0].id).toBe(JOB_B);

    // HTTP 403 on real HttpTestingController also latches same-session refusal and clears state.
    service.refreshList();
    httpMock
      .expectOne(`${BASE}/api/v1/manager/jobs?activeOnly=true`)
      .flush({ message: SENSITIVE }, { status: 403, statusText: 'Forbidden' });
    expect(service.accessRevoked()).toBe(true);
    expect(service.authFailure()).toBe('forbidden');
    expect(service.serverRows()).toBeNull();
    expect(session.isAuthenticated()).toBe(true);
    service.refreshList();
    httpMock.expectNone(() => true);
  });

  it('JCS-93 revokes all active and newly constructed JobCardStateService instances on feature HTTP 403 while preserving FixProof isolation', () => {
    service.ngOnDestroy();
    TestBed.resetTestingModule();
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
    session.setSession(makeSession());
    service = TestBed.inject(JobCardStateService);
    const fixProof = TestBed.inject(FixProofStateService);
    const env = createEnvironmentInjector(
      [JobCardStateService],
      TestBed.inject(EnvironmentInjector),
    );
    const secondJobCards = env.get(JobCardStateService);
    TestBed.tick();

    fixProof.refreshProposals();
    httpMock
      .expectOne(r => r.url === `${BASE}/api/v1/manager/approvals/proposals`)
      .flush([]);

    secondJobCards.refreshList();
    const secondLoad = httpMock.expectOne(
      r => r.url === `${BASE}/api/v1/manager/jobs`,
    );
    secondLoad.flush([makeJob(JOB_A)]);
    secondJobCards.selectJob(JOB_A);
    const secondPendingDetail = httpMock.expectOne(
      `${BASE}/api/v1/manager/jobs/${JOB_A}`,
    );

    service.refreshList();
    const list403 = httpMock.expectOne(
      r => r.url === `${BASE}/api/v1/manager/jobs`,
    );
    expect(list403.request.headers.get('Authorization')).toBe(
      'Bearer test-access-token',
    );
    list403.flush(
      { message: SENSITIVE },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(service.accessRevoked()).toBe(true);
    expect(service.authFailure()).toBe('forbidden');
    expect(secondJobCards.accessRevoked()).toBe(true);
    expect(secondJobCards.authFailure()).toBe('forbidden');
    expect(secondJobCards.serverRows()).toBeNull();
    expect(secondPendingDetail.cancelled).toBe(true);
    expect(fixProof.accessRevoked()).toBe(false);
    expect(session.isAuthenticated()).toBe(true);

    // Late emitted detail or newly constructed JobCardStateService respects existing feature 403.
    const lateEnv = createEnvironmentInjector(
      [JobCardStateService],
      TestBed.inject(EnvironmentInjector),
    );
    const lateJobCards = lateEnv.get(JobCardStateService);
    expect(lateJobCards.accessRevoked()).toBe(true);
    expect(lateJobCards.authFailure()).toBe('forbidden');
    lateJobCards.refreshList();
    expect(lateJobCards.selectJob(JOB_A)).toBe(false);
    httpMock.expectNone(() => true);

    session.setSession(makeSession('manager-002'));
    TestBed.tick();
    expect(service.accessRevoked()).toBe(false);
    expect(secondJobCards.accessRevoked()).toBe(false);
    expect(lateJobCards.accessRevoked()).toBe(false);

    fixProof.ngOnDestroy();
    env.destroy();
    lateEnv.destroy();
  });

  it('JCS-94 invalidates only shared denied job detail on FixProof GET /jobs/{id} 403 while preserving unrelated JOB_B', () => {
    service.ngOnDestroy();
    TestBed.resetTestingModule();
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
    session.setSession(makeSession());
    service = TestBed.inject(JobCardStateService);
    const fixProof = TestBed.inject(FixProofStateService);
    TestBed.tick();

    service.refreshList();
    httpMock
      .expectOne(r => r.url === `${BASE}/api/v1/manager/jobs`)
      .flush([makeJob(JOB_A), makeJob(JOB_B)]);
    service.selectJob(JOB_A);
    httpMock
      .expectOne(`${BASE}/api/v1/manager/jobs/${JOB_A}`)
      .flush(
        makeDetail(JOB_A, { issues: [makeIssue(ISSUE_1, [signedUrl('jpg')])] }),
      );
    service.refreshDetail();
    const pendingJobCardsDetail = httpMock.expectOne(
      `${BASE}/api/v1/manager/jobs/${JOB_A}`,
    );

    const proposalId = uuid(201);
    fixProof.refreshProposals();
    httpMock
      .expectOne(r => r.url === `${BASE}/api/v1/manager/approvals/proposals`)
      .flush([
        {
          id: proposalId,
          jobCardId: JOB_A,
          jobNumber: 'JC-001',
          vehicleLabel: 'Suzuki Wagon R',
          customerName: 'Kavitha',
          status: 'PendingManagerReview',
          mechanicId: uuid(401),
          mechanicName: 'Ravi',
          mechanicNote: null,
          managerNote: null,
          customerNote: null,
          submittedAt: '2027-01-15T08:00:00Z',
          publishedAt: null,
          respondedAt: null,
          releasedAt: null,
          total: 500,
          approvedTotal: 0,
          items: [
            {
              id: uuid(301),
              title: 'Brake pads',
              kind: 'Part',
              qty: 1,
              unitPrice: 500,
              amount: 500,
              version: 1,
              status: 'Proposed',
              linkedIssueId: null,
            },
          ],
          audit: [],
        },
      ]);
    fixProof.selectProposal(proposalId);
    const fixProofDetailReq = httpMock.expectOne(
      `${BASE}/api/v1/manager/jobs/${JOB_A}`,
    );
    expect(fixProofDetailReq.request.headers.get('Authorization')).toBe(
      'Bearer test-access-token',
    );
    fixProofDetailReq.flush(
      { message: SENSITIVE },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(pendingJobCardsDetail.cancelled).toBe(true);
    expect(service.detail()).toBeNull();
    expect(service.evidence()).toEqual([]);
    expect(service.selectedJobId()).toBeNull();
    expect(service.detailError()?.kind).toBe('forbidden');
    expect(service.accessRevoked()).toBe(false);

    // Same-session retry on denied JOB_A stays refused; unrelated JOB_B still loads cleanly.
    expect(service.selectJob(JOB_A)).toBe(false);
    httpMock.expectNone(`${BASE}/api/v1/manager/jobs/${JOB_A}`);

    expect(service.selectJob(JOB_B)).toBe(true);
    httpMock
      .expectOne(`${BASE}/api/v1/manager/jobs/${JOB_B}`)
      .flush(makeDetail(JOB_B));
    expect(service.detail()?.job.id).toBe(JOB_B);

    fixProof.ngOnDestroy();
  });
});

describe('JobCardStateService K13-A04-R2-R1 synchronous evidence authorization', () => {
  const OTHER_HEX = 'fedcba9876543210fedcba9876543210';

  let service: JobCardStateService;
  let fake: ReturnType<typeof createFakeApi>;
  let session: SessionService;
  let coordinator: Day06AuthorizationCoordinatorService;
  let httpMock: HttpTestingController;
  let cleanups: (() => void)[];

  function setup(): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor, authInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
        JobCardStateService,
        { provide: JobCardApiService, useValue: fake.api },
      ],
    });

    session = TestBed.inject(SessionService);
    coordinator = TestBed.inject(Day06AuthorizationCoordinatorService);
    httpMock = TestBed.inject(HttpTestingController);
    session.setSession(makeSession());
    service = TestBed.inject(JobCardStateService);
    TestBed.tick();
  }

  function setupReal(): FixProofStateService {
    service.ngOnDestroy();
    TestBed.resetTestingModule();
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
    coordinator = TestBed.inject(Day06AuthorizationCoordinatorService);
    httpMock = TestBed.inject(HttpTestingController);
    session.setSession(makeSession());
    service = TestBed.inject(JobCardStateService);
    const fixProof = TestBed.inject(FixProofStateService);
    TestBed.tick();
    cleanups.push(() => fixProof.ngOnDestroy());

    return fixProof;
  }

  function evidenceDetail(id: string, hex = MEDIA_HEX): JobDetailDto {
    return makeDetail(id, {
      issues: [
        makeIssue(ISSUE_1, [signedUrl('jpg', START_SECONDS + 900, hex)]),
      ],
    });
  }

  function loadEvidence(id: string, hex = MEDIA_HEX): void {
    service.selectJob(id);
    respond(last(fake.details).subject, evidenceDetail(id, hex));
  }

  function loadRealEvidence(id: string, hex = MEDIA_HEX): void {
    service.selectJob(id);
    httpMock
      .expectOne(`${BASE}/api/v1/manager/jobs/${id}`)
      .flush(evidenceDetail(id, hex));
  }

  function expectNoProtectedEvidence(): void {
    expect(service.detail()).toBeNull();
    expect(service.job()).toBeNull();
    expect(service.issues()).toEqual([]);
    expect(service.evidence()).toEqual([]);
    expect(service.hasEvidence()).toBe(false);
    expect(service.evidenceNeedsRefresh()).toBe(false);

    const exposed = JSON.stringify([
      service.detail(),
      service.issues(),
      service.evidence(),
    ]);

    expect(exposed).not.toContain(SIG);
    expect(exposed).not.toContain(MEDIA_HEX);
  }

  function apiCalls(): number {
    return (
      fake.api.getJobCards.mock.calls.length +
      fake.api.getJobCard.mock.calls.length
    );
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    fake = createFakeApi();
    cleanups = [];
    setup();
  });

  afterEach(() => {
    service.ngOnDestroy();
    for (const cleanup of cleanups) {
      cleanup();
    }
    httpMock.verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('JCS-95 rejects evidence when the session expires between timer ticks while the media URL is still valid', () => {
    session.setSession(makeSession('manager-001', 20_000));
    TestBed.tick();
    loadEvidence(JOB_A);

    expect(service.getEvidenceForUse(ISSUE_1, 0)?.status).toBe('valid');

    const calls = apiCalls();

    // 20.5 s: past session expiry, before the 30 s tick, media still valid until 900 s.
    vi.setSystemTime(START + 20_500);

    expect(service.getEvidenceForUse(ISSUE_1, 0)).toBeNull();
    expect(service.authFailure()).toBe('unauthorized');
    expect(service.selectedJobId()).toBeNull();
    expectNoProtectedEvidence();
    expect(apiCalls()).toBe(calls);
    httpMock.expectNone(() => true);
  });

  it('JCS-96 rejects evidence immediately after logout, before effect flushing, including public signals', () => {
    loadEvidence(JOB_A);
    expect(service.getEvidenceForUse(ISSUE_1, 0)?.status).toBe('valid');

    const calls = apiCalls();

    session.clearSession();

    // The session effect has not run yet: nothing has been cleared or reported.
    expect(service.authFailure()).toBeNull();
    expectNoProtectedEvidence();

    expect(service.getEvidenceForUse(ISSUE_1, 0)).toBeNull();
    expect(service.authFailure()).toBe('unauthorized');
    expect(service.selectedJobId()).toBeNull();

    TestBed.tick();

    expect(service.authFailure()).toBe('unauthorized');
    expectNoProtectedEvidence();
    expect(apiCalls()).toBe(calls);
    httpMock.expectNone(() => true);
  });

  it('JCS-97 rejects previous-session evidence immediately after replacement and never leaks it into the new session', () => {
    loadEvidence(JOB_A);
    expect(service.getEvidenceForUse(ISSUE_1, 0)?.status).toBe('valid');

    const calls = apiCalls();

    session.setSession(makeSession('manager-002'));

    expectNoProtectedEvidence();
    expect(service.getEvidenceForUse(ISSUE_1, 0)).toBeNull();
    expect(service.selectedJobId()).toBeNull();
    expect(service.authFailure()).toBeNull();
    expect(apiCalls()).toBe(calls);

    TestBed.tick();
    expectNoProtectedEvidence();

    loadEvidence(JOB_B, OTHER_HEX);

    const fresh = service.getEvidenceForUse(ISSUE_1, 0);

    expect(fresh?.status).toBe('valid');
    expect(fresh?.url).toBe(
      `${BASE}${signedUrl('jpg', START_SECONDS + 900, OTHER_HEX)}`,
    );
    expect(JSON.stringify(service.evidence())).not.toContain(MEDIA_HEX);
    expect(service.detail()?.job.id).toBe(JOB_B);
    httpMock.expectNone(() => true);
  });

  it('JCS-98 reevaluateEvidence clears evidence after session expiry without HTTP', () => {
    session.setSession(makeSession('manager-001', 20_000));
    TestBed.tick();
    loadEvidence(JOB_A);

    const calls = apiCalls();

    vi.setSystemTime(START + 20_500);
    service.reevaluateEvidence();

    expect(service.authFailure()).toBe('unauthorized');
    expectNoProtectedEvidence();
    expect(apiCalls()).toBe(calls);
    httpMock.expectNone(() => true);
  });

  it.each(['logout', 'replacement'] as const)(
    'JCS-99 reevaluateEvidence clears evidence after %s before effect flushing',
    change => {
      loadEvidence(JOB_A);

      const calls = apiCalls();

      if (change === 'logout') {
        session.clearSession();
      } else {
        session.setSession(makeSession('manager-002'));
      }

      service.reevaluateEvidence();

      expect(service.selectedJobId()).toBeNull();
      expect(service.authFailure()).toBe(
        change === 'logout' ? 'unauthorized' : null,
      );
      expectNoProtectedEvidence();
      expect(apiCalls()).toBe(calls);
      httpMock.expectNone(() => true);
    },
  );

  it('JCS-100 keeps valid current-session evidence and validates media expiry at the point of use without reloading', () => {
    const raw = signedUrl('jpg');
    loadEvidence(JOB_A);

    const calls = apiCalls();
    const valid = service.getEvidenceForUse(ISSUE_1, 0);

    expect(valid?.status).toBe('valid');
    expect(valid?.url).toBe(`${BASE}${raw}`);
    expect(service.detail()?.job.id).toBe(JOB_A);
    expect(service.authFailure()).toBeNull();

    service.reevaluateEvidence();
    expect(service.evidence()[0].items[0].url).toBe(`${BASE}${raw}`);

    // Valid session, expired media URL: masked and flagged, never reloaded.
    vi.setSystemTime(START + 901_000);
    const expired = service.getEvidenceForUse(ISSUE_1, 0);

    expect(expired?.status).toBe('expired');
    expect(expired?.url).toBeNull();
    expect(expired?.needsRefresh).toBe(true);
    expect(service.detail()?.job.id).toBe(JOB_A);
    expect(service.evidenceNeedsRefresh()).toBe(true);
    expect(service.authFailure()).toBeNull();
    expect(apiCalls()).toBe(calls);
    httpMock.expectNone(() => true);
  });

  it('JCS-101 refuses evidence access and reevaluation after destroy', () => {
    loadEvidence(JOB_A);

    const calls = apiCalls();

    service.ngOnDestroy();

    expect(service.getEvidenceForUse(ISSUE_1, 0)).toBeNull();
    expect(() => service.reevaluateEvidence()).not.toThrow();
    expectNoProtectedEvidence();
    expect(apiCalls()).toBe(calls);
    httpMock.expectNone(() => true);
  });

  it('JCS-102 refuses evidence for a denied selected job even before the denial listener has cleared it', () => {
    loadEvidence(JOB_A);

    const calls = apiCalls();

    vi.spyOn(coordinator, 'isJobResourceDenied').mockImplementation(
      (_session, jobId) => jobId?.toLowerCase() === JOB_A.toLowerCase(),
    );

    expect(service.getEvidenceForUse(ISSUE_1, 0)).toBeNull();
    expect(service.selectedJobId()).toBeNull();
    expect(service.detailError()?.kind).toBe('forbidden');
    expect(service.accessRevoked()).toBe(false);
    expectNoProtectedEvidence();
    expect(apiCalls()).toBe(calls);
    httpMock.expectNone(() => true);
  });

  it('JCS-103 verified cross-feature HTTP 401 revokes evidence access; already captured items are not rewritten', () => {
    const fixProof = setupReal();
    loadRealEvidence(JOB_A);

    const captured = service.getEvidenceForUse(ISSUE_1, 0);

    expect(captured?.status).toBe('valid');

    fixProof.refreshProposals();
    const proposals401 = httpMock.expectOne(
      r => r.url === `${BASE}/api/v1/manager/approvals/proposals`,
    );

    expect(proposals401.request.headers.get('Authorization')).toBe(
      'Bearer test-access-token',
    );
    proposals401.flush(
      { message: SENSITIVE },
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(service.accessRevoked()).toBe(true);
    expect(service.authFailure()).toBe('unauthorized');
    expect(service.getEvidenceForUse(ISSUE_1, 0)).toBeNull();
    service.reevaluateEvidence();
    expectNoProtectedEvidence();
    httpMock.expectNone(() => true);

    // State cleanup cannot revoke a URL a consumer already holds; the backend
    // keeps honouring it until `exp`.
    expect(captured?.url).toBe(`${BASE}${signedUrl('jpg')}`);
  });

  it('JCS-104 feature-specific Job Cards HTTP 403 revokes evidence access without HTTP during local checks', () => {
    setupReal();
    loadRealEvidence(JOB_A);

    service.refreshList();
    httpMock
      .expectOne(r => r.url === `${BASE}/api/v1/manager/jobs`)
      .flush({ message: SENSITIVE }, { status: 403, statusText: 'Forbidden' });

    expect(service.authFailure()).toBe('forbidden');
    expect(service.getEvidenceForUse(ISSUE_1, 0)).toBeNull();
    service.reevaluateEvidence();
    expectNoProtectedEvidence();
    expect(session.isAuthenticated()).toBe(true);
    httpMock.expectNone(() => true);
  });

  it('JCS-105 shared same-job denial reported by FixProof removes only that job evidence while Job Cards stays usable for unrelated jobs', () => {
    const fixProof = setupReal();
    loadRealEvidence(JOB_A);

    const proposalId = uuid(201);
    fixProof.refreshProposals();
    httpMock
      .expectOne(r => r.url === `${BASE}/api/v1/manager/approvals/proposals`)
      .flush([
        {
          id: proposalId,
          jobCardId: JOB_A,
          jobNumber: 'JC-001',
          vehicleLabel: 'Suzuki Wagon R',
          customerName: 'Kavitha',
          status: 'PendingManagerReview',
          mechanicId: uuid(401),
          mechanicName: 'Ravi',
          mechanicNote: null,
          managerNote: null,
          customerNote: null,
          submittedAt: '2027-01-15T08:00:00Z',
          publishedAt: null,
          respondedAt: null,
          releasedAt: null,
          total: 500,
          approvedTotal: 0,
          items: [],
          audit: [],
        },
      ]);
    fixProof.selectProposal(proposalId);
    httpMock
      .expectOne(`${BASE}/api/v1/manager/jobs/${JOB_A}`)
      .flush({ message: SENSITIVE }, { status: 403, statusText: 'Forbidden' });

    expect(service.getEvidenceForUse(ISSUE_1, 0)).toBeNull();
    expect(service.detailError()?.kind).toBe('forbidden');
    expect(service.accessRevoked()).toBe(false);
    expect(fixProof.authFailure()).toBe('forbidden');
    expectNoProtectedEvidence();
    expect(coordinator.isJobResourceDenied(session.session(), JOB_A)).toBe(true);
    expect(coordinator.isFeatureForbidden(session.session(), 'job-cards')).toBe(
      false,
    );
    httpMock.expectNone(() => true);

    expect(service.selectJob(JOB_A)).toBe(false);
    httpMock.expectNone(() => true);

    loadRealEvidence(JOB_B, OTHER_HEX);

    expect(service.getEvidenceForUse(ISSUE_1, 0)?.status).toBe('valid');
    expect(service.detail()?.job.id).toBe(JOB_B);
    expect(service.accessRevoked()).toBe(false);
    httpMock.expectNone(() => true);
  });
});

describe('JobCardStateService K13-A04-R3-R1 manual read recovery', () => {
  const CANCELLED = 'The request was cancelled. Refresh to try again.';

  let service: JobCardStateService;
  let fake: ReturnType<typeof createFakeApi>;
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
        JobCardStateService,
        ...(real ? [] : [{ provide: JobCardApiService, useValue: fake.api }]),
      ],
    });

    session = TestBed.inject(SessionService);
    coordinator = TestBed.inject(Day06AuthorizationCoordinatorService);
    httpMock = TestBed.inject(HttpTestingController);
    session.setSession(makeSession());
    service = TestBed.inject(JobCardStateService);
    TestBed.tick();
  }

  function evidenceDetail(id: string): JobDetailDto {
    return makeDetail(id, {
      issues: [makeIssue(ISSUE_1, [signedUrl('jpg')])],
    });
  }

  function apiCalls(): number {
    return (
      fake.api.getJobCards.mock.calls.length +
      fake.api.getJobCard.mock.calls.length
    );
  }

  function expectCancelledResolution(
    resolution: ReturnType<typeof service.listError>,
  ): void {
    expect(resolution?.message).toBe(CANCELLED);
    expect(resolution?.kind).not.toBe('unauthorized');
    expect(resolution?.kind).not.toBe('forbidden');
    expect(JSON.stringify(resolution)).not.toContain(SENSITIVE);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    fake = createFakeApi();
    setup();
  });

  afterEach(() => {
    service.ngOnDestroy();
    httpMock.verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('JCS-106 cancels a never-completing initial list request, ignores its late answer and recovers with a manual refresh', () => {
    const unauthorized = vi.spyOn(coordinator, 'reportUnauthorized');
    const forbidden = vi.spyOn(coordinator, 'reportForbidden');

    service.refreshList();
    const hanging = last(fake.lists).subject;

    expect(service.isListLoading()).toBe(true);
    expect(service.cancelListRequest()).toBe(true);

    expect(service.isListLoading()).toBe(false);
    expect(hanging.observed).toBe(false);
    expect(service.listViewState()).toBe('error');
    expectCancelledResolution(service.listError());
    expect(service.authFailure()).toBeNull();
    expect(service.accessRevoked()).toBe(false);

    respond(hanging, [makeJob(JOB_A)]);
    expect(service.serverRows()).toBeNull();

    // No retry: nothing is requested until the manager refreshes.
    vi.advanceTimersByTime(JOB_CARD_STATE_CHECK_INTERVAL_MS * 3);
    expect(fake.api.getJobCards).toHaveBeenCalledTimes(1);

    service.refreshList();
    expect(fake.api.getJobCards).toHaveBeenCalledTimes(2);
    respond(last(fake.lists).subject, [makeJob(JOB_B)]);

    expect(service.serverRows()?.map(row => row.id)).toEqual([JOB_B]);
    expect(service.listError()).toBeNull();
    expect(unauthorized).not.toHaveBeenCalled();
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('JCS-107 cancelling a list refresh keeps cached rows as stale and leaves the detail request untouched', () => {
    service.refreshList();
    respond(last(fake.lists).subject, [makeJob(JOB_A)]);
    const synced = service.listLastSyncedAt();

    service.selectJob(JOB_A);
    const detail = last(fake.details).subject;

    service.refreshList();
    expect(service.cancelListRequest()).toBe(true);

    expect(service.serverRows()?.map(row => row.id)).toEqual([JOB_A]);
    expect(service.isListStale()).toBe(true);
    expect(service.listRefreshError()?.message).toBe(CANCELLED);
    expect(service.listError()).toBeNull();
    expect(service.listLastSyncedAt()).toBe(synced);

    expect(service.isDetailLoading()).toBe(true);
    expect(detail.observed).toBe(true);
    respond(detail, makeDetail(JOB_A));
    expect(service.detail()?.job.id).toBe(JOB_A);
  });

  it('JCS-108 cancels a never-completing detail request, keeps the selection and recovers with refreshDetail without touching the list', () => {
    service.refreshList();
    const list = last(fake.lists).subject;

    service.selectJob(JOB_A);
    const hanging = last(fake.details).subject;

    expect(service.cancelDetailRequest()).toBe(true);
    expect(service.isDetailLoading()).toBe(false);
    expect(hanging.observed).toBe(false);
    expect(service.selectedJobId()).toBe(JOB_A);
    expect(service.detailViewState()).toBe('error');
    expectCancelledResolution(service.detailError());

    respond(hanging, makeDetail(JOB_A));
    expect(service.detail()).toBeNull();

    expect(service.isListLoading()).toBe(true);
    expect(list.observed).toBe(true);

    service.refreshDetail();
    expect(fake.api.getJobCard).toHaveBeenCalledTimes(2);
    respond(last(fake.details).subject, makeDetail(JOB_A));
    expect(service.detail()?.job.id).toBe(JOB_A);
    expect(service.detailError()).toBeNull();
  });

  it('JCS-109 cancelEvidenceRefresh keeps loaded evidence stale behind the R2-R1 point-of-use checks', () => {
    service.selectJob(JOB_A);
    respond(last(fake.details).subject, evidenceDetail(JOB_A));

    service.refreshEvidence();
    const hanging = last(fake.details).subject;

    expect(service.cancelEvidenceRefresh()).toBe(true);
    expect(service.isDetailLoading()).toBe(false);
    expect(hanging.observed).toBe(false);
    expect(service.isDetailStale()).toBe(true);
    expect(service.detailRefreshError()?.message).toBe(CANCELLED);
    expect(service.getEvidenceForUse(ISSUE_1, 0)?.status).toBe('valid');

    const calls = apiCalls();

    session.setSession(makeSession('manager-002'));

    expect(service.getEvidenceForUse(ISSUE_1, 0)).toBeNull();
    expect(service.detail()).toBeNull();
    expect(apiCalls()).toBe(calls);

    respond(hanging, evidenceDetail(JOB_A));
    expect(service.detail()).toBeNull();
  });

  it('JCS-110 cancellation is idempotent, lane-specific and never sends HTTP or coordinator reports', () => {
    const unauthorized = vi.spyOn(coordinator, 'reportUnauthorized');
    const forbidden = vi.spyOn(coordinator, 'reportForbidden');

    expect(service.cancelListRequest()).toBe(false);
    expect(service.cancelDetailRequest()).toBe(false);
    expect(service.cancelEvidenceRefresh()).toBe(false);

    service.refreshList();
    service.selectJob(JOB_A);

    expect(service.cancelListRequest()).toBe(true);
    expect(service.cancelListRequest()).toBe(false);
    expect(service.isDetailLoading()).toBe(true);

    expect(service.cancelDetailRequest()).toBe(true);
    expect(service.cancelEvidenceRefresh()).toBe(false);

    expect(apiCalls()).toBe(2);
    expect(unauthorized).not.toHaveBeenCalled();
    expect(forbidden).not.toHaveBeenCalled();

    service.refreshList();
    service.ngOnDestroy();
    expect(service.cancelListRequest()).toBe(false);
    expect(service.cancelDetailRequest()).toBe(false);
    expect(apiCalls()).toBe(3);
  });

  it('JCS-111 a session change clears the lanes first; cancellation then reports nothing and late old-session answers are ignored', () => {
    service.refreshList();
    service.selectJob(JOB_A);
    const list = last(fake.lists).subject;
    const detail = last(fake.details).subject;

    session.setSession(makeSession('manager-002'));

    expect(service.cancelListRequest()).toBe(false);
    expect(service.cancelDetailRequest()).toBe(false);
    expect(service.isListLoading()).toBe(false);
    expect(service.listError()?.message).not.toBe(CANCELLED);

    respond(list, [makeJob(JOB_A)]);
    respond(detail, makeDetail(JOB_A));
    expect(service.serverRows()).toBeNull();
    expect(service.detail()).toBeNull();
  });

  it('JCS-112 synchronous of, throwError and EMPTY reads leave nothing to cancel', () => {
    fake.api.getJobCards.mockReturnValueOnce(of([makeJob(JOB_A)]));
    service.refreshList();
    expect(service.cancelListRequest()).toBe(false);
    expect(service.serverRows()?.length).toBe(1);

    fake.api.getJobCards.mockReturnValueOnce(
      throwError(() => apiError(500, 'SERVER_ERROR')),
    );
    service.refreshList();
    expect(service.isListLoading()).toBe(false);
    expect(service.cancelListRequest()).toBe(false);
    expect(service.listRefreshError()?.message).not.toBe(CANCELLED);

    fake.api.getJobCard.mockReturnValueOnce(EMPTY);
    service.selectJob(JOB_A);
    expect(service.isDetailLoading()).toBe(false);
    expect(service.cancelDetailRequest()).toBe(false);
    expect(service.detailError()).not.toBeNull();
    expect(service.detailError()?.message).not.toBe(CANCELLED);
  });

  it('JCS-113 real HTTP: cancelling list and detail aborts only the browser read and a manual refresh issues one new GET', () => {
    service.ngOnDestroy();
    setup(true);

    service.refreshList();
    service.selectJob(JOB_A);

    const list = httpMock.expectOne(r => r.url === `${BASE}/api/v1/manager/jobs`);
    const detail = httpMock.expectOne(`${BASE}/api/v1/manager/jobs/${JOB_A}`);

    expect(service.cancelListRequest()).toBe(true);
    expect(list.cancelled).toBe(true);
    expect(detail.cancelled).toBe(false);

    expect(service.cancelDetailRequest()).toBe(true);
    expect(detail.cancelled).toBe(true);
    httpMock.expectNone(() => true);

    service.refreshList();
    const again = httpMock.expectOne(r => r.url === `${BASE}/api/v1/manager/jobs`);

    expect(again.request.method).toBe('GET');
    again.flush([makeJob(JOB_A)]);
    expect(service.serverRows()?.length).toBe(1);
    expect(service.authFailure()).toBeNull();
  });
});
