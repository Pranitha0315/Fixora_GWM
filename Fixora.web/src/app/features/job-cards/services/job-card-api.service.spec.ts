import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import type { Observable } from 'rxjs';

import { SessionService } from '../../../core/auth/session.service';
import { API_CONFIG } from '../../../core/config/api.config';
import type { ApiConfig } from '../../../core/config/api.config';
import { authInterceptor } from '../../../core/interceptors/auth.interceptor';
import { errorInterceptor } from '../../../core/interceptors/error.interceptor';
import { ApiError } from '../../../core/models/api-error.model';

import { JOB_CARDS_LIST_LIMIT } from '../models/job-card.model';
import {
  JobCardRequestError,
  JobCardResponseError,
} from '../utils/job-card.validator';
import {
  resolveJobCardsError,
  resolveJobCardsErrorMessage,
} from '../utils/job-card-error.mapper';

import { JobCardApiService } from './job-card-api.service';

const BASE = 'https://api.fixora.test';
const JOBS_URL = `${BASE}/api/v1/manager/jobs`;

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const JOB_ID_2 = '22222222-2222-4222-8222-222222222222';
const CUSTOMER_ID = '33333333-3333-4333-8333-333333333333';
const VEHICLE_ID = '44444444-4444-4444-8444-444444444444';
const MECHANIC_ID = '55555555-5555-4555-8555-555555555555';
const BAY_ID = '66666666-6666-4666-8666-666666666666';
const ISSUE_ID = '77777777-7777-4777-8777-777777777777';
const PROPOSAL_ID = '88888888-8888-4888-8888-888888888888';
const ITEM_ID = '99999999-9999-4999-8999-999999999999';
const CR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INVOICE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';

const SIGNED_URL =
  '/api/v1/media/0123456789abcdef0123456789abcdef.jpg?exp=1800000000&sig=' +
  'a1'.repeat(32);

const LEAKY_BACKEND_BODY = {
  status: 0,
  code: 'secret_internal_code',
  message: 'Leaky backend message token=abc123 sig=deadbeef',
  traceId: 'trace-secret',
};

interface Outcome<T> {
  value?: T;
  error?: unknown;
  completed: boolean;
}

function observe<T>(source: Observable<T>): Outcome<T> {
  const outcome: Outcome<T> = { completed: false };

  source.subscribe({
    next: value => {
      outcome.value = value;
    },
    error: (error: unknown) => {
      outcome.error = error;
    },
    complete: () => {
      outcome.completed = true;
    },
  });

  return outcome;
}

function createJobSummary(
  id: string = JOB_ID,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    number: 'JC-2026-0042',
    customerId: CUSTOMER_ID,
    customerName: 'Kavitha',
    vehicleId: VEHICLE_ID,
    vehicleLabel: 'Suzuki Wagon R (NP CAB-4521)',
    mechanicId: MECHANIC_ID,
    mechanicName: 'Ravi',
    bayId: BAY_ID,
    bayName: 'Bay 1',
    status: 'Inspecting',
    priority: 1,
    queuePosition: 1,
    etaAt: '2026-11-27T10:30:00Z',
    estimatedMinutes: 90,
    elapsedMinutes: 25.5,
    createdAt: '2026-11-27T08:00:00Z',
    startedAt: '2026-11-27T08:15:00Z',
    completedAt: null,
    complaint: 'Brake squeal',
    managerNote: 'Check front pads closely',
    ...overrides,
  };
}

function createIssue(): Record<string, unknown> {
  return {
    id: ISSUE_ID,
    component: 'Front Brakes',
    findingEn: 'Front brake pads worn to 2 mm.',
    findingTa: 'Front brake pads worn to 2 mm.',
    recommendationEn: 'Replace front brake pads.',
    recommendationTa: 'Replace front brake pads.',
    severity: 'Urgent',
    mediaUrls: [SIGNED_URL],
    reportVersion: 1,
    confirmedAt: '2026-11-27T08:30:00Z',
  };
}

function createProposal(jobId: string): Record<string, unknown> {
  return {
    id: PROPOSAL_ID,
    jobCardId: jobId,
    jobNumber: 'JC-2026-0042',
    vehicleLabel: 'Suzuki Wagon R (NP CAB-4521)',
    customerName: 'Kavitha',
    status: 'PendingManagerReview',
    mechanicId: MECHANIC_ID,
    mechanicName: 'Ravi',
    mechanicNote: 'Pads at 2 mm',
    managerNote: null,
    customerNote: null,
    submittedAt: '2026-11-27T08:40:00Z',
    publishedAt: null,
    respondedAt: null,
    releasedAt: null,
    total: 4200,
    approvedTotal: 0,
    items: [
      {
        id: ITEM_ID,
        title: 'Front brake pads',
        kind: 'Part',
        qty: 1,
        unitPrice: 4200,
        amount: 4200,
        version: 1,
        status: 'Proposed',
        linkedIssueId: ISSUE_ID,
      },
    ],
    audit: [
      {
        actorRole: 'Mechanic',
        action: 'Submitted to manager',
        detail: '1 item(s)',
        at: '2026-11-27T08:40:00Z',
      },
    ],
  };
}

function createChangeRequest(jobId: string): Record<string, unknown> {
  return {
    id: CR_ID,
    jobCardId: jobId,
    jobNumber: 'JC-2026-0042',
    number: 'CR-2026-0001',
    changes: ['Keep old parts'],
    details: 'Place old pads in the boot.',
    status: 'PendingManagerReview',
    managerNote: null,
    mechanicNote: null,
    createdAt: '2026-11-27T09:00:00Z',
  };
}

function createInvoice(
  jobId: string,
  customerId: string = CUSTOMER_ID,
): Record<string, unknown> {
  return {
    id: INVOICE_ID,
    number: 'INV-2026-0001',
    jobCardId: jobId,
    customerId,
    subtotal: 6700,
    tax: 0,
    loyaltyDiscount: 200,
    total: 6500,
    status: 'Unpaid',
    paymentMethod: null,
    issuedAt: '2026-11-27T11:00:00Z',
    paidAt: null,
    lines: [
      { description: 'Brake Inspection', qty: 1, unitPrice: 2500, amount: 2500 },
      { description: 'Front brake pads', qty: 1, unitPrice: 4200, amount: 4200 },
    ],
  };
}

function createJobDetail(
  jobId: string = JOB_ID,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    job: createJobSummary(jobId),
    timeline: [
      {
        stage: 'Checked in',
        message: 'Vehicle received at the workshop.',
        percent: 5,
        actorRole: 'Manager',
        at: '2026-11-27T08:00:00Z',
      },
    ],
    issues: [createIssue()],
    proposals: [createProposal(jobId)],
    changeRequests: [createChangeRequest(jobId)],
    invoice: createInvoice(jobId),
    queue: {
      jobId,
      position: 1,
      etaAt: '2026-11-27T10:30:00Z',
      status: 'Inspecting',
      indicative: true,
    },
    ...overrides,
  };
}

function uuidFor(n: number): string {
  return `${n.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;
}

describe('JobCardApiService', () => {
  let service: JobCardApiService;
  let http: HttpTestingController;
  let session: SessionService;

  function setup(config: ApiConfig = { baseUrl: BASE }): void {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([errorInterceptor, authInterceptor]),
        ),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: config },
      ],
    });

    service = TestBed.inject(JobCardApiService);
    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);
  }

  function signIn(): void {
    session.setSession({
      accessToken: 'test-access-token',
      expiresAt: Date.now() + 60_000,
      user: {
        id: 'test-manager-001',
        displayName: 'Test Manager',
        email: 'manager@example.test',
        roles: ['Manager'],
      },
    });
  }

  beforeEach(() => {
    setup();
  });

  afterEach(() => {
    http.verify();
  });

  describe('getJobCards request contract', () => {
    it('JCA-01 sends GET to the jobs endpoint with the backend default activeOnly=true and nothing else', () => {
      observe(service.getJobCards());

      const req = http.expectOne(JOBS_URL + '?activeOnly=true');

      expect(req.request.method).toBe('GET');
      expect(req.request.url).toBe(JOBS_URL);
      expect(req.request.params.keys()).toEqual(['activeOnly']);
      expect(req.request.params.get('activeOnly')).toBe('true');
      expect(req.request.body).toBeNull();
      req.flush([]);
    });

    it('JCA-02 sends activeOnly=false and customerId when supplied', () => {
      observe(
        service.getJobCards({ activeOnly: false, customerId: CUSTOMER_ID }),
      );

      const req = http.expectOne(
        `${JOBS_URL}?activeOnly=false&customerId=${CUSTOMER_ID}`,
      );

      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('activeOnly')).toBe('false');
      expect(req.request.params.get('customerId')).toBe(CUSTOMER_ID);
      req.flush([]);
    });

    it('JCA-03 treats omitted and null fields as defaults', () => {
      observe(service.getJobCards({}));
      observe(service.getJobCards({ activeOnly: undefined, customerId: null }));

      const requests = http.match(JOBS_URL + '?activeOnly=true');

      expect(requests).toHaveLength(2);
      requests.forEach(req => req.flush([]));
    });

    it('JCA-04 never fabricates pagination or unsupported query parameters', () => {
      observe(
        service.getJobCards({
          page: 2,
          pageSize: 50,
          status: 'Open',
          offset: 10,
        } as never),
      );

      const req = http.expectOne(JOBS_URL + '?activeOnly=true');

      expect(req.request.params.keys()).toEqual(['activeOnly']);
      req.flush([]);
    });

    it('JCA-05 is lazy and issues no request until subscribed', () => {
      service.getJobCards();
      service.getJobCard(JOB_ID);

      http.expectNone(() => true);
    });

    it.each([
      ['activeOnly as string', { activeOnly: 'true' }],
      ['activeOnly as number', { activeOnly: 1 }],
      ['non-guid customerId', { customerId: 'not-a-guid' }],
      ['empty-guid customerId', { customerId: EMPTY_UUID }],
      ['customerId with traversal', { customerId: `${CUSTOMER_ID}/../x` }],
      ['numeric customerId', { customerId: 123 }],
      ['string query', 'activeOnly=true'],
      ['array query', []],
    ])('JCA-06 rejects invalid query (%s) without any HTTP request', (_label, query) => {
      expect(() => service.getJobCards(query as never)).not.toThrow();

      const outcome = observe(service.getJobCards(query as never));

      expect(outcome.error).toBeInstanceOf(JobCardRequestError);
      expect(outcome.completed).toBe(false);
      http.expectNone(() => true);
    });
  });

  describe('getJobCards responses', () => {
    it('JCA-07 returns validated job summaries in backend order', () => {
      const outcome = observe(service.getJobCards());

      http
        .expectOne(JOBS_URL + '?activeOnly=true')
        .flush([
          createJobSummary(JOB_ID_2, { number: 'JC-2026-0043', queuePosition: 1 }),
          createJobSummary(JOB_ID, { queuePosition: 2 }),
        ]);

      expect(outcome.completed).toBe(true);
      expect(outcome.value?.map(job => job.id)).toEqual([JOB_ID_2, JOB_ID]);
      expect(Array.isArray(outcome.value)).toBe(true);
    });

    it('JCA-08 returns an empty list without fabricating totals', () => {
      const outcome = observe(service.getJobCards());

      http.expectOne(JOBS_URL + '?activeOnly=true').flush([]);

      expect(outcome.value).toEqual([]);
      expect(outcome.completed).toBe(true);
      expect(outcome.error).toBeUndefined();
    });

    it('JCA-09 passes through a full backend-capped list unchanged and unflagged', () => {
      const rows = Array.from({ length: JOB_CARDS_LIST_LIMIT }, (_unused, i) =>
        createJobSummary(uuidFor(i + 1), { queuePosition: i + 1 }),
      );
      const outcome = observe(service.getJobCards());

      http.expectOne(JOBS_URL + '?activeOnly=true').flush(rows);

      expect(JOB_CARDS_LIST_LIMIT).toBe(200);
      expect(outcome.value).toHaveLength(200);
      expect(Object.keys(outcome.value as object)).not.toContain('total');
    });

    it('JCA-10 preserves anonymous walk-in jobs and unknown statuses', () => {
      const outcome = observe(service.getJobCards({ activeOnly: false }));

      http
        .expectOne(`${JOBS_URL}?activeOnly=false`)
        .flush([
          createJobSummary(JOB_ID, {
            customerId: EMPTY_UUID,
            vehicleId: EMPTY_UUID,
            status: 'FutureWorkflowStatus',
          }),
        ]);

      expect(outcome.value?.[0].customerId).toBe(EMPTY_UUID);
      expect(outcome.value?.[0].vehicleId).toBe(EMPTY_UUID);
      expect(outcome.value?.[0].status).toBe('FutureWorkflowStatus');
    });

    it.each([
      ['object', {}],
      ['null', null],
      ['string', 'jobs'],
      ['paged envelope', { items: [], total: 0, page: 1 }],
    ])('JCA-11 rejects a non-array list response (%s)', (_label, body) => {
      const outcome = observe(service.getJobCards());

      http.expectOne(JOBS_URL + '?activeOnly=true').flush(body);

      expect(outcome.error).toBeInstanceOf(JobCardResponseError);
      expect(outcome.value).toBeUndefined();
    });

    it('JCA-12 rejects malformed rows, empty job ids and duplicate ids', () => {
      for (const rows of [
        [createJobSummary(JOB_ID, { id: 'bad' })],
        [createJobSummary(JOB_ID, { id: EMPTY_UUID })],
        [createJobSummary(JOB_ID, { number: 5 })],
        [null],
        [createJobSummary(JOB_ID), createJobSummary(JOB_ID.toUpperCase())],
      ]) {
        const outcome = observe(service.getJobCards());

        http.expectOne(JOBS_URL + '?activeOnly=true').flush(rows);

        expect(outcome.error).toBeInstanceOf(JobCardResponseError);
        expect(outcome.value).toBeUndefined();
      }
    });
  });

  describe('getJobCard request contract', () => {
    it('JCA-13 sends GET to the job detail endpoint with no query or body', () => {
      observe(service.getJobCard(JOB_ID));

      const req = http.expectOne(`${JOBS_URL}/${JOB_ID}`);

      expect(req.request.method).toBe('GET');
      expect(req.request.params.keys()).toEqual([]);
      expect(req.request.urlWithParams).toBe(`${JOBS_URL}/${JOB_ID}`);
      expect(req.request.body).toBeNull();
      req.flush(createJobDetail());
    });

    it.each([
      ['empty', ''],
      ['whitespace', ' '],
      ['not a guid', 'not-a-uuid'],
      ['empty guid', EMPTY_UUID],
      ['leading space', ` ${JOB_ID}`],
      ['trailing space', `${JOB_ID} `],
      ['query suffix', `${JOB_ID}?x=1`],
      ['path suffix', `${JOB_ID}/assign`],
      ['traversal', `${JOB_ID}/../${JOB_ID_2}`],
      ['encoded slash', `${JOB_ID}%2f`],
      ['no hyphens', JOB_ID.replaceAll('-', '')],
      ['null', null],
      ['undefined', undefined],
      ['number', 42],
      ['object', {}],
    ])('JCA-14 rejects invalid job id (%s) without any HTTP request', (_label, id) => {
      expect(() => service.getJobCard(id as never)).not.toThrow();

      const outcome = observe(service.getJobCard(id as never));

      expect(outcome.error).toBeInstanceOf(JobCardRequestError);
      http.expectNone(() => true);
    });

    it('JCA-15 accepts an upper-case id and matches the response id case-insensitively', () => {
      const outcome = observe(service.getJobCard(JOB_ID.toUpperCase()));

      http.expectOne(`${JOBS_URL}/${JOB_ID.toUpperCase()}`).flush(createJobDetail());

      expect(outcome.error).toBeUndefined();
      expect(outcome.value?.job.id).toBe(JOB_ID);
    });
  });

  describe('getJobCard responses', () => {
    it('JCA-16 returns the validated detail with every nested section', () => {
      const outcome = observe(service.getJobCard(JOB_ID));

      http.expectOne(`${JOBS_URL}/${JOB_ID}`).flush(createJobDetail());

      const detail = outcome.value;

      expect(outcome.completed).toBe(true);
      expect(detail?.job.id).toBe(JOB_ID);
      expect(detail?.timeline).toHaveLength(1);
      expect(detail?.issues).toHaveLength(1);
      expect(detail?.proposals).toHaveLength(1);
      expect(detail?.changeRequests).toHaveLength(1);
      expect(detail?.invoice?.id).toBe(INVOICE_ID);
      expect(detail?.queue.jobId).toBe(JOB_ID);
    });

    it('JCA-17 returns signed media URLs untouched and never fetches them', () => {
      const outcome = observe(service.getJobCard(JOB_ID));

      http.expectOne(`${JOBS_URL}/${JOB_ID}`).flush(createJobDetail());

      expect(outcome.value?.issues[0].mediaUrls).toEqual([SIGNED_URL]);
      http.expectNone(request => request.url.includes('/media/'));
      http.expectNone(() => true);
    });

    it('JCA-18 accepts a detail with no invoice and empty collections', () => {
      const outcome = observe(service.getJobCard(JOB_ID));

      http.expectOne(`${JOBS_URL}/${JOB_ID}`).flush(
        createJobDetail(JOB_ID, {
          timeline: [],
          issues: [],
          proposals: [],
          changeRequests: [],
          invoice: null,
        }),
      );

      expect(outcome.value?.invoice).toBeNull();
      expect(outcome.value?.issues).toEqual([]);
    });

    it('JCA-19 preserves anonymous walk-in jobs and unknown statuses', () => {
      const outcome = observe(service.getJobCard(JOB_ID));
      const detail = createJobDetail(JOB_ID, {
        job: createJobSummary(JOB_ID, {
          customerId: EMPTY_UUID,
          vehicleId: EMPTY_UUID,
          status: 'FutureWorkflowStatus',
        }),
        invoice: createInvoice(JOB_ID, EMPTY_UUID),
        queue: {
          jobId: JOB_ID,
          position: 3,
          etaAt: null,
          status: 'FutureQueueStatus',
          indicative: false,
        },
      });

      http.expectOne(`${JOBS_URL}/${JOB_ID}`).flush(detail);

      expect(outcome.error).toBeUndefined();
      expect(outcome.value?.job.customerId).toBe(EMPTY_UUID);
      expect(outcome.value?.job.status).toBe('FutureWorkflowStatus');
      expect(outcome.value?.queue.status).toBe('FutureQueueStatus');
      expect(outcome.value?.invoice?.customerId).toBe(EMPTY_UUID);
    });

    it('JCA-20 rejects a response for a different job than requested', () => {
      const outcome = observe(service.getJobCard(JOB_ID));

      http
        .expectOne(`${JOBS_URL}/${JOB_ID}`)
        .flush(createJobDetail(JOB_ID_2));

      expect(outcome.error).toBeInstanceOf(JobCardResponseError);
      expect((outcome.error as JobCardResponseError).field).toBe(
        'jobDetail.job.id',
      );
      expect(outcome.value).toBeUndefined();
    });

    it.each([
      ['null', null],
      ['array', []],
      ['string', 'detail'],
      ['empty object', {}],
      ['list instead of detail', [createJobSummary()]],
    ])('JCA-21 rejects a malformed detail payload (%s)', (_label, body) => {
      const outcome = observe(service.getJobCard(JOB_ID));

      http.expectOne(`${JOBS_URL}/${JOB_ID}`).flush(body);

      expect(outcome.error).toBeInstanceOf(JobCardResponseError);
      expect(outcome.value).toBeUndefined();
    });

    it.each([
      ['missing job', { job: undefined }],
      ['timeline not an array', { timeline: {} }],
      ['issues missing', { issues: undefined }],
      ['issue with non-array mediaUrls', { issues: [{ ...createIssue(), mediaUrls: SIGNED_URL }] }],
      ['proposals not an array', { proposals: null }],
      ['proposal for another job', { proposals: [createProposal(JOB_ID_2)] }],
      ['change requests missing', { changeRequests: undefined }],
      ['change request for another job', { changeRequests: [createChangeRequest(JOB_ID_2)] }],
      ['invoice for another job', { invoice: createInvoice(JOB_ID_2) }],
      ['invoice with bad total', { invoice: { ...createInvoice(JOB_ID), total: 'x' } }],
      ['queue for another job', { queue: { jobId: JOB_ID_2, position: 1, etaAt: null, status: 'Open', indicative: true } }],
      ['queue using queuePosition', { queue: { jobId: JOB_ID, queuePosition: 1, etaAt: null, status: 'Open', indicative: true } }],
      ['queue missing', { queue: undefined }],
    ])('JCA-22 rejects nested DTO violation (%s)', (_label, overrides) => {
      const outcome = observe(service.getJobCard(JOB_ID));

      http
        .expectOne(`${JOBS_URL}/${JOB_ID}`)
        .flush(createJobDetail(JOB_ID, overrides));

      expect(outcome.error).toBeInstanceOf(JobCardResponseError);
      expect(outcome.value).toBeUndefined();
    });

    it('JCA-23 response errors expose structural paths only, never signed URLs or values', () => {
      const outcome = observe(service.getJobCard(JOB_ID));

      http.expectOne(`${JOBS_URL}/${JOB_ID}`).flush(
        createJobDetail(JOB_ID, {
          issues: [{ ...createIssue(), mediaUrls: [SIGNED_URL, 42] }],
        }),
      );

      const error = outcome.error as JobCardResponseError;
      const text = `${error.message} ${error.field} ${resolveJobCardsErrorMessage(error)}`;

      expect(error).toBeInstanceOf(JobCardResponseError);
      expect(text).not.toContain('sig=');
      expect(text).not.toContain('/api/v1/media');
      expect(text).not.toContain('a1a1a1');
    });
  });

  describe('HTTP and network failures', () => {
    const FAILURES = [
      [400, 'BAD_REQUEST', 'invalid-request'],
      [401, 'UNAUTHORIZED', 'unauthorized'],
      [403, 'FORBIDDEN', 'forbidden'],
      [404, 'NOT_FOUND', 'not-found'],
      [409, 'CONFLICT', 'conflict'],
      [429, 'RATE_LIMITED', 'rate-limited'],
      [500, 'SERVER_ERROR', 'server-failure'],
    ] as const;

    for (const [status, code, kind] of FAILURES) {
      it(`JCA-24 list HTTP ${status} maps to ${code} with a safe message and no retry`, () => {
        const outcome = observe(service.getJobCards());

        http
          .expectOne(JOBS_URL + '?activeOnly=true')
          .flush({ ...LEAKY_BACKEND_BODY, status }, { status, statusText: 'Failure' });

        const error = outcome.error as ApiError;
        const resolution = resolveJobCardsError(error);

        expect(error).toBeInstanceOf(ApiError);
        expect(error.status).toBe(status);
        expect(error.code).toBe(code);
        expect(error.message).not.toContain('Leaky');
        expect(error.message).not.toContain('token=');
        expect(resolution.kind).toBe(kind);
        expect(resolution.outcome).toBe('not-applicable');
        expect(resolution.message).not.toContain('Leaky');
        expect(resolution.requiresSignIn).toBe(status === 401);
        expect(outcome.value).toBeUndefined();
      });

      it(`JCA-25 detail HTTP ${status} maps to ${code} with a safe message and no retry`, () => {
        const outcome = observe(service.getJobCard(JOB_ID));

        http
          .expectOne(`${JOBS_URL}/${JOB_ID}`)
          .flush({ ...LEAKY_BACKEND_BODY, status }, { status, statusText: 'Failure' });

        const error = outcome.error as ApiError;

        expect(error).toBeInstanceOf(ApiError);
        expect(error.code).toBe(code);
        expect(resolveJobCardsError(error).kind).toBe(kind);
        expect(JSON.stringify(resolveJobCardsError(error))).not.toContain(
          'secret_internal_code',
        );
        expect(outcome.value).toBeUndefined();
      });
    }

    it('JCA-26 network errors map to NETWORK_ERROR for list and detail', () => {
      const list = observe(service.getJobCards());

      http
        .expectOne(JOBS_URL + '?activeOnly=true')
        .error(new ProgressEvent('error'));

      const detail = observe(service.getJobCard(JOB_ID));

      http
        .expectOne(`${JOBS_URL}/${JOB_ID}`)
        .error(new ProgressEvent('error'));

      for (const outcome of [list, detail]) {
        const error = outcome.error as ApiError;

        expect(error).toBeInstanceOf(ApiError);
        expect(error.code).toBe('NETWORK_ERROR');
        expect(resolveJobCardsError(error).kind).toBe('network-failure');
      }
    });

    it('JCA-27 does not retry after a failure', () => {
      observe(service.getJobCards());

      http
        .expectOne(JOBS_URL + '?activeOnly=true')
        .flush(null, { status: 500, statusText: 'Server Error' });

      http.expectNone(() => true);
    });
  });

  describe('API origin configuration', () => {
    it('JCA-28 an unconfigured origin errors safely without any HTTP request', () => {
      TestBed.resetTestingModule();
      setup({ baseUrl: null });

      const list = observe(service.getJobCards());
      const detail = observe(service.getJobCard(JOB_ID));

      expect(list.error).toBeInstanceOf(Error);
      expect(detail.error).toBeInstanceOf(Error);
      expect(list.error).not.toBeInstanceOf(ApiError);
      expect(resolveJobCardsError(list.error).kind).toBe('unknown');
      http.expectNone(() => true);
    });

    it('JCA-29 a non-https origin is refused without any HTTP request', () => {
      TestBed.resetTestingModule();
      setup({ baseUrl: 'http://api.fixora.test' });

      const outcome = observe(service.getJobCards());

      expect(outcome.error).toBeInstanceOf(Error);
      http.expectNone(() => true);
    });

    it('JCA-30 invalid ids are reported before the origin is consulted', () => {
      TestBed.resetTestingModule();
      setup({ baseUrl: null });

      const outcome = observe(service.getJobCard('bad'));

      expect(outcome.error).toBeInstanceOf(JobCardRequestError);
    });

    it('JCA-31 honours a configured base path prefix', () => {
      TestBed.resetTestingModule();
      setup({ baseUrl: `${BASE}/gateway/` });

      observe(service.getJobCard(JOB_ID));

      http
        .expectOne(`${BASE}/gateway/api/v1/manager/jobs/${JOB_ID}`)
        .flush(createJobDetail());
    });
  });

  describe('authentication through existing interceptors', () => {
    it('JCA-32 attaches the bearer token for trusted API-origin requests', () => {
      signIn();

      observe(service.getJobCards());
      observe(service.getJobCard(JOB_ID));

      const list = http.expectOne(JOBS_URL + '?activeOnly=true');
      const detail = http.expectOne(`${JOBS_URL}/${JOB_ID}`);

      expect(list.request.headers.get('Authorization')).toBe(
        'Bearer test-access-token',
      );
      expect(detail.request.headers.get('Authorization')).toBe(
        'Bearer test-access-token',
      );
      expect(list.request.urlWithParams).not.toContain('test-access-token');
      expect(detail.request.urlWithParams).not.toContain('test-access-token');
      list.flush([]);
      detail.flush(createJobDetail());
    });

    it('JCA-33 sends no Authorization header when there is no session', () => {
      observe(service.getJobCards());

      const req = http.expectOne(JOBS_URL + '?activeOnly=true');

      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush([]);
    });

    it('JCA-34 attaches the token under a trusted base path prefix', () => {
      TestBed.resetTestingModule();
      setup({ baseUrl: `${BASE}/gateway` });
      signIn();

      observe(service.getJobCards());

      const req = http.expectOne(
        `${BASE}/gateway/api/v1/manager/jobs?activeOnly=true`,
      );

      expect(req.request.headers.get('Authorization')).toBe(
        'Bearer test-access-token',
      );
      req.flush([]);
    });

    it('JCA-35 sets no credentials or custom headers of its own', () => {
      observe(service.getJobCards());

      const req = http.expectOne(JOBS_URL + '?activeOnly=true');

      expect(req.request.withCredentials).toBe(false);
      expect(req.request.headers.keys()).toEqual([]);
      req.flush([]);
    });
  });

  describe('read-only guarantees', () => {
    it('JCA-36 exposes no mutation methods', () => {
      const methods = Object.getOwnPropertyNames(
        Object.getPrototypeOf(service),
      ).filter(name => name !== 'constructor');

      expect(methods.sort()).toEqual(['getJobCard', 'getJobCards']);
    });

    it('JCA-37 every request is a GET and exactly one request is made per call', () => {
      observe(service.getJobCards());
      observe(service.getJobCard(JOB_ID));

      const requests = http.match(() => true);

      expect(requests).toHaveLength(2);
      expect(requests.map(req => req.request.method)).toEqual(['GET', 'GET']);

      requests[0].flush([]);
      requests[1].flush(createJobDetail());
    });

    it('JCA-38 never requests media, refresh or other endpoints after a successful detail load', () => {
      observe(service.getJobCard(JOB_ID));

      http.expectOne(`${JOBS_URL}/${JOB_ID}`).flush(createJobDetail());

      http.expectNone(() => true);
    });
  });
});
