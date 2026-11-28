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

import {
  FIXPROOF_CHANGE_REQUESTS_LIST_LIMIT,
  FIXPROOF_PROPOSALS_LIST_LIMIT,
  PROPOSAL_STATUSES,
} from '../models/fixproof.model';
import {
  resolveFixProofError,
} from '../utils/fixproof-error.mapper';
import {
  FixProofRequestError,
  FixProofResponseError,
} from '../utils/fixproof.validator';

import { FixProofApiService } from './fixproof-api.service';

const BASE = 'https://api.fixora.test';
const PROPOSALS_URL = `${BASE}/api/v1/manager/approvals/proposals`;
const CHANGES_URL = `${BASE}/api/v1/manager/approvals/change-requests`;

const MECHANIC_ID = '55555555-5555-4555-8555-555555555555';
const ISSUE_ID = '77777777-7777-4777-8777-777777777777';
const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';

const SIGNED_URL =
  '/api/v1/media/0123456789abcdef0123456789abcdef.jpg?exp=1800000000&sig=' +
  'a1'.repeat(32);

const LEAKY_BACKEND_BODY = {
  code: 'secret_internal_code',
  message: 'Leaky backend message token=abc123 sig=deadbeef',
  traceId: 'trace-secret',
};

function uuidFor(prefix: number, n: number): string {
  const head = n.toString(16).padStart(8, '0');
  const mid = prefix.toString(16).padStart(4, '0');

  return `${head}-${mid}-4000-8000-000000000000`;
}

const PROPOSAL_ID = uuidFor(1, 1);
const PROPOSAL_ID_2 = uuidFor(1, 2);
const JOB_ID = uuidFor(2, 1);
const CR_ID = uuidFor(3, 1);
const CR_ID_2 = uuidFor(3, 2);

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

function createProposal(
  id: string = PROPOSAL_ID,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    jobCardId: JOB_ID,
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
        id: uuidFor(4, Number.parseInt(id.slice(0, 8), 16)),
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
    ...overrides,
  };
}

function createChangeRequest(
  id: string = CR_ID,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    jobCardId: JOB_ID,
    jobNumber: 'JC-2026-0042',
    number: 'CR-2026-0001',
    changes: ['Keep old parts'],
    details: 'Place old pads in the boot.',
    status: 'PendingManagerReview',
    managerNote: null,
    mechanicNote: null,
    createdAt: '2026-11-27T09:00:00Z',
    ...overrides,
  };
}

describe('FixProofApiService', () => {
  let service: FixProofApiService;
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

    service = TestBed.inject(FixProofApiService);
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

  describe('getProposals request contract', () => {
    it('FPA-01 sends GET to the verified proposals endpoint with no query by default', () => {
      observe(service.getProposals());

      const req = http.expectOne(PROPOSALS_URL);

      expect(req.request.method).toBe('GET');
      expect(req.request.url).toBe(PROPOSALS_URL);
      expect(req.request.urlWithParams).toBe(PROPOSALS_URL);
      expect(req.request.params.keys()).toEqual([]);
      expect(req.request.body).toBeNull();
      req.flush([]);
    });

    it('FPA-02 treats undefined, null and empty queries as the backend default', () => {
      observe(service.getProposals({}));
      observe(service.getProposals({ status: null }));
      observe(service.getProposals(undefined));

      const requests = http.match(PROPOSALS_URL);

      expect(requests).toHaveLength(3);
      requests.forEach(req => req.flush([]));
    });

    it.each(PROPOSAL_STATUSES.map(status => [status]))(
      'FPA-03 sends status=%s as a supported filter',
      status => {
        observe(service.getProposals({ status }));

        const req = http.expectOne(`${PROPOSALS_URL}?status=${status}`);

        expect(req.request.method).toBe('GET');
        expect(req.request.params.keys()).toEqual(['status']);
        expect(req.request.params.get('status')).toBe(status);
        req.flush([]);
      },
    );

    it('FPA-04 never fabricates pagination or unsupported query parameters', () => {
      observe(
        service.getProposals({
          page: 2,
          pageSize: 50,
          jobId: JOB_ID,
          offset: 10,
        } as never),
      );

      const req = http.expectOne(PROPOSALS_URL);

      expect(req.request.params.keys()).toEqual([]);
      req.flush([]);
    });

    it('FPA-05 is lazy and issues no request until subscribed', () => {
      service.getProposals();
      service.getChangeRequests();

      http.expectNone(() => true);
    });

    it.each([
      ['unknown status', { status: 'FutureStatus' }],
      ['lower-case status', { status: 'pendingmanagerreview' }],
      ['numeric string status', { status: '1' }],
      ['all keyword', { status: 'all' }],
      ['empty status', { status: '' }],
      ['numeric status', { status: 1 }],
      ['object status', { status: {} }],
      ['status with injection', { status: 'Cancelled&pendingOnly=true' }],
      ['string query', 'status=Cancelled'],
      ['array query', []],
    ])('FPA-06 rejects invalid proposal query (%s) without any HTTP request', (_label, query) => {
      expect(() => service.getProposals(query as never)).not.toThrow();

      const outcome = observe(service.getProposals(query as never));

      expect(outcome.error).toBeInstanceOf(FixProofRequestError);
      expect(outcome.completed).toBe(false);
      http.expectNone(() => true);
    });
  });

  describe('getProposals responses', () => {
    it('FPA-07 returns validated proposals preserving backend order', () => {
      const outcome = observe(service.getProposals());

      http.expectOne(PROPOSALS_URL).flush([
        createProposal(PROPOSAL_ID_2, { submittedAt: '2026-11-27T10:00:00Z' }),
        createProposal(PROPOSAL_ID, { submittedAt: '2026-11-27T08:40:00Z' }),
      ]);

      expect(outcome.completed).toBe(true);
      expect(outcome.value?.map(proposal => proposal.id)).toEqual([
        PROPOSAL_ID_2,
        PROPOSAL_ID,
      ]);
    });

    it('FPA-08 does not re-sort even when the backend order looks unusual', () => {
      const outcome = observe(service.getProposals());

      http.expectOne(PROPOSALS_URL).flush([
        createProposal(PROPOSAL_ID, { submittedAt: '2026-11-27T08:00:00Z' }),
        createProposal(PROPOSAL_ID_2, { submittedAt: '2026-11-27T12:00:00Z' }),
      ]);

      expect(outcome.value?.map(proposal => proposal.id)).toEqual([
        PROPOSAL_ID,
        PROPOSAL_ID_2,
      ]);
    });

    it('FPA-09 returns an empty list without fabricating totals', () => {
      const outcome = observe(service.getProposals());

      http.expectOne(PROPOSALS_URL).flush([]);

      expect(outcome.value).toEqual([]);
      expect(outcome.completed).toBe(true);
      expect(outcome.error).toBeUndefined();
    });

    it('FPA-10 passes through a full backend-capped list unchanged and unflagged', () => {
      const rows = Array.from(
        { length: FIXPROOF_PROPOSALS_LIST_LIMIT },
        (_unused, index) => createProposal(uuidFor(1, index + 1)),
      );
      const outcome = observe(service.getProposals());

      http.expectOne(PROPOSALS_URL).flush(rows);

      expect(FIXPROOF_PROPOSALS_LIST_LIMIT).toBe(100);
      expect(outcome.value).toHaveLength(100);
      expect(Object.keys(outcome.value as object)).not.toContain('total');
    });

    it('FPA-11 preserves unknown proposal, item and kind values', () => {
      const proposal = createProposal(PROPOSAL_ID, {
        status: 'FutureProposalStatus',
      });
      const item = (proposal['items'] as Record<string, unknown>[])[0];

      item['status'] = 'FutureItemStatus';
      item['kind'] = 'FutureKind';

      const outcome = observe(service.getProposals());

      http.expectOne(PROPOSALS_URL).flush([proposal]);

      expect(outcome.error).toBeUndefined();
      expect(outcome.value?.[0].status).toBe('FutureProposalStatus');
      expect(outcome.value?.[0].items[0].status).toBe('FutureItemStatus');
      expect(outcome.value?.[0].items[0].kind).toBe('FutureKind');
    });

    it('FPA-12 does not infer or expose any job status from a proposal', () => {
      const outcome = observe(service.getProposals());

      http
        .expectOne(PROPOSALS_URL)
        .flush([createProposal(PROPOSAL_ID, { status: 'ReleasedToMechanic' })]);

      expect(outcome.value?.[0].status).toBe('ReleasedToMechanic');
      expect(Object.keys(outcome.value?.[0] ?? {})).not.toContain('jobStatus');
    });

    it('FPA-13 returns cancelled proposals only when they are returned by the backend', () => {
      const outcome = observe(service.getProposals({ status: 'Cancelled' }));

      http
        .expectOne(`${PROPOSALS_URL}?status=Cancelled`)
        .flush([createProposal(PROPOSAL_ID, { status: 'Cancelled' })]);

      expect(outcome.value?.[0].status).toBe('Cancelled');
    });

    it.each([
      ['object', {}],
      ['null', null],
      ['string', 'proposals'],
      ['paged envelope', { items: [], total: 0, page: 1 }],
    ])('FPA-14 rejects a non-array response (%s)', (_label, body) => {
      const outcome = observe(service.getProposals());

      http.expectOne(PROPOSALS_URL).flush(body);

      expect(outcome.error).toBeInstanceOf(FixProofResponseError);
      expect(outcome.value).toBeUndefined();
    });

    it.each([
      ['null row', [null]],
      ['bad proposal id', [createProposal('bad')]],
      ['empty proposal id', [createProposal(EMPTY_UUID)]],
      ['empty job id', [createProposal(PROPOSAL_ID, { jobCardId: EMPTY_UUID })]],
      ['empty mechanic id', [createProposal(PROPOSAL_ID, { mechanicId: EMPTY_UUID })]],
      ['negative total', [createProposal(PROPOSAL_ID, { total: -1 })]],
      ['non-numeric total', [createProposal(PROPOSAL_ID, { total: '4200' })]],
      ['invalid submittedAt', [createProposal(PROPOSAL_ID, { submittedAt: 'yesterday' })]],
      ['numeric status', [createProposal(PROPOSAL_ID, { status: 3 })]],
      ['items not an array', [createProposal(PROPOSAL_ID, { items: {} })]],
      ['audit missing', [createProposal(PROPOSAL_ID, { audit: undefined })]],
      ['audit entry malformed', [createProposal(PROPOSAL_ID, { audit: [{ action: 'x' }] })]],
      ['item with bad qty', [createProposal(PROPOSAL_ID, { items: [{ id: uuidFor(4, 1), title: 'x', kind: 'Part', qty: 'one', unitPrice: 1, amount: 1, version: 1, status: 'Proposed', linkedIssueId: null }] })]],
    ])('FPA-15 rejects nested DTO violation (%s)', (_label, rows) => {
      const outcome = observe(service.getProposals());

      http.expectOne(PROPOSALS_URL).flush(rows);

      expect(outcome.error).toBeInstanceOf(FixProofResponseError);
      expect(outcome.value).toBeUndefined();
    });

    it('FPA-16 rejects duplicate proposal ids and duplicate item ids', () => {
      const duplicateProposals = [
        createProposal(PROPOSAL_ID),
        createProposal(PROPOSAL_ID.toUpperCase()),
      ];
      const duplicateItems = createProposal(PROPOSAL_ID);
      const item = (duplicateItems['items'] as Record<string, unknown>[])[0];

      duplicateItems['items'] = [item, { ...item }];

      for (const rows of [duplicateProposals, [duplicateItems]]) {
        const outcome = observe(service.getProposals());

        http.expectOne(PROPOSALS_URL).flush(rows);

        expect(outcome.error).toBeInstanceOf(FixProofResponseError);
        expect(outcome.value).toBeUndefined();
      }
    });

    it('FPA-17 response errors expose structural paths only, never values or signed URLs', () => {
      const proposal = createProposal(PROPOSAL_ID, {
        customerName: SIGNED_URL,
        total: -5,
      });
      const outcome = observe(service.getProposals());

      http.expectOne(PROPOSALS_URL).flush([proposal]);

      const error = outcome.error as FixProofResponseError;
      const text = `${error.message} ${error.field} ${resolveFixProofError(error).message}`;

      expect(error).toBeInstanceOf(FixProofResponseError);
      expect(text).not.toContain('sig=');
      expect(text).not.toContain('/api/v1/media');
      expect(text).not.toContain('Kavitha');
    });
  });

  describe('getChangeRequests request contract', () => {
    it('FPA-18 sends GET to the verified change-requests endpoint with the backend default pendingOnly=false', () => {
      observe(service.getChangeRequests());

      const req = http.expectOne(`${CHANGES_URL}?pendingOnly=false`);

      expect(req.request.method).toBe('GET');
      expect(req.request.url).toBe(CHANGES_URL);
      expect(req.request.params.keys()).toEqual(['pendingOnly']);
      expect(req.request.params.get('pendingOnly')).toBe('false');
      expect(req.request.body).toBeNull();
      req.flush([]);
    });

    it('FPA-19 sends pendingOnly=true when requested', () => {
      observe(service.getChangeRequests({ pendingOnly: true }));

      const req = http.expectOne(`${CHANGES_URL}?pendingOnly=true`);

      expect(req.request.params.get('pendingOnly')).toBe('true');
      req.flush([]);
    });

    it('FPA-20 treats omitted fields as defaults and never sends pagination', () => {
      observe(service.getChangeRequests({}));
      observe(
        service.getChangeRequests({ page: 3, pageSize: 10 } as never),
      );

      const requests = http.match(`${CHANGES_URL}?pendingOnly=false`);

      expect(requests).toHaveLength(2);
      requests.forEach(req => {
        expect(req.request.params.keys()).toEqual(['pendingOnly']);
        req.flush([]);
      });
    });

    it.each([
      ['string true', { pendingOnly: 'true' }],
      ['number', { pendingOnly: 1 }],
      ['null', { pendingOnly: null }],
      ['object', { pendingOnly: {} }],
      ['string query', 'pendingOnly=true'],
      ['array query', []],
    ])('FPA-21 rejects invalid change request query (%s) without any HTTP request', (_label, query) => {
      expect(() => service.getChangeRequests(query as never)).not.toThrow();

      const outcome = observe(service.getChangeRequests(query as never));

      expect(outcome.error).toBeInstanceOf(FixProofRequestError);
      http.expectNone(() => true);
    });
  });

  describe('getChangeRequests responses', () => {
    it('FPA-22 returns validated change requests preserving backend order', () => {
      const outcome = observe(service.getChangeRequests());

      http.expectOne(`${CHANGES_URL}?pendingOnly=false`).flush([
        createChangeRequest(CR_ID_2, { createdAt: '2026-11-27T11:00:00Z' }),
        createChangeRequest(CR_ID, { createdAt: '2026-11-27T09:00:00Z' }),
      ]);

      expect(outcome.completed).toBe(true);
      expect(outcome.value?.map(change => change.id)).toEqual([
        CR_ID_2,
        CR_ID,
      ]);
    });

    it('FPA-23 returns an empty list', () => {
      const outcome = observe(service.getChangeRequests({ pendingOnly: true }));

      http.expectOne(`${CHANGES_URL}?pendingOnly=true`).flush([]);

      expect(outcome.value).toEqual([]);
      expect(outcome.completed).toBe(true);
    });

    it('FPA-24 passes through a full backend-capped list unchanged and unflagged', () => {
      const rows = Array.from(
        { length: FIXPROOF_CHANGE_REQUESTS_LIST_LIMIT },
        (_unused, index) => createChangeRequest(uuidFor(3, index + 1)),
      );
      const outcome = observe(service.getChangeRequests());

      http.expectOne(`${CHANGES_URL}?pendingOnly=false`).flush(rows);

      expect(FIXPROOF_CHANGE_REQUESTS_LIST_LIMIT).toBe(100);
      expect(outcome.value).toHaveLength(100);
      expect(Object.keys(outcome.value as object)).not.toContain('total');
    });

    it('FPA-25 preserves unknown change request statuses', () => {
      const outcome = observe(service.getChangeRequests());

      http
        .expectOne(`${CHANGES_URL}?pendingOnly=false`)
        .flush([createChangeRequest(CR_ID, { status: 'FutureChangeStatus' })]);

      expect(outcome.error).toBeUndefined();
      expect(outcome.value?.[0].status).toBe('FutureChangeStatus');
    });

    it.each([
      ['object', {}],
      ['null', null],
      ['string', 'changes'],
      ['paged envelope', { items: [], total: 0 }],
    ])('FPA-26 rejects a non-array response (%s)', (_label, body) => {
      const outcome = observe(service.getChangeRequests());

      http.expectOne(`${CHANGES_URL}?pendingOnly=false`).flush(body);

      expect(outcome.error).toBeInstanceOf(FixProofResponseError);
      expect(outcome.value).toBeUndefined();
    });

    it.each([
      ['null row', [null]],
      ['bad id', [createChangeRequest('bad')]],
      ['empty job id', [createChangeRequest(CR_ID, { jobCardId: EMPTY_UUID })]],
      ['changes not an array', [createChangeRequest(CR_ID, { changes: 'Keep old parts' })]],
      ['changes with non-string', [createChangeRequest(CR_ID, { changes: ['ok', 5] })]],
      ['details missing', [createChangeRequest(CR_ID, { details: undefined })]],
      ['invalid createdAt', [createChangeRequest(CR_ID, { createdAt: 'later' })]],
      ['numeric status', [createChangeRequest(CR_ID, { status: 2 })]],
    ])('FPA-27 rejects nested DTO violation (%s)', (_label, rows) => {
      const outcome = observe(service.getChangeRequests());

      http.expectOne(`${CHANGES_URL}?pendingOnly=false`).flush(rows);

      expect(outcome.error).toBeInstanceOf(FixProofResponseError);
      expect(outcome.value).toBeUndefined();
    });

    it('FPA-28 rejects duplicate change request ids case-insensitively', () => {
      const outcome = observe(service.getChangeRequests());

      http
        .expectOne(`${CHANGES_URL}?pendingOnly=false`)
        .flush([
          createChangeRequest(CR_ID),
          createChangeRequest(CR_ID.toUpperCase()),
        ]);

      expect(outcome.error).toBeInstanceOf(FixProofResponseError);
      expect(outcome.value).toBeUndefined();
    });
  });

  describe('HTTP and network failures', () => {
    const FAILURES = [
      [400, 'BAD_REQUEST', 'invalid-request'],
      [401, 'UNAUTHORIZED', 'unauthorized'],
      [403, 'FORBIDDEN', 'forbidden'],
      [404, 'NOT_FOUND', 'not-found'],
      [409, 'CONFLICT', 'conflict'],
      [422, 'VALIDATION_ERROR', 'validation-error'],
      [429, 'RATE_LIMITED', 'rate-limited'],
      [500, 'SERVER_ERROR', 'server-failure'],
    ] as const;

    for (const [status, code, kind] of FAILURES) {
      it(`FPA-29 proposals HTTP ${status} maps to ${code} with a safe message`, () => {
        const outcome = observe(service.getProposals());

        http
          .expectOne(PROPOSALS_URL)
          .flush({ ...LEAKY_BACKEND_BODY, status }, { status, statusText: 'Failure' });

        const error = outcome.error as ApiError;
        const resolution = resolveFixProofError(error);

        expect(error).toBeInstanceOf(ApiError);
        expect(error.status).toBe(status);
        expect(error.code).toBe(code);
        expect(error.message).not.toContain('Leaky');
        expect(error.message).not.toContain('token=');
        expect(resolution.kind).toBe(kind);
        expect(resolution.outcome).toBe('not-applicable');
        expect(JSON.stringify(resolution)).not.toContain('Leaky');
        expect(JSON.stringify(resolution)).not.toContain('secret_internal_code');
        expect(resolution.requiresSignIn).toBe(status === 401);
        expect(outcome.value).toBeUndefined();
      });

      it(`FPA-30 change requests HTTP ${status} maps to ${code} with a safe message`, () => {
        const outcome = observe(service.getChangeRequests());

        http
          .expectOne(`${CHANGES_URL}?pendingOnly=false`)
          .flush({ ...LEAKY_BACKEND_BODY, status }, { status, statusText: 'Failure' });

        const error = outcome.error as ApiError;
        const resolution = resolveFixProofError(error);

        expect(error).toBeInstanceOf(ApiError);
        expect(error.code).toBe(code);
        expect(resolution.kind).toBe(kind);
        expect(JSON.stringify(resolution)).not.toContain('Leaky');
        expect(outcome.value).toBeUndefined();
      });
    }

    it('FPA-31 network errors map to NETWORK_ERROR for both lists', () => {
      const proposals = observe(service.getProposals());

      http.expectOne(PROPOSALS_URL).error(new ProgressEvent('error'));

      const changes = observe(service.getChangeRequests());

      http
        .expectOne(`${CHANGES_URL}?pendingOnly=false`)
        .error(new ProgressEvent('error'));

      for (const outcome of [proposals, changes]) {
        const error = outcome.error as ApiError;

        expect(error).toBeInstanceOf(ApiError);
        expect(error.code).toBe('NETWORK_ERROR');
        expect(resolveFixProofError(error).kind).toBe('network-failure');
      }
    });

    it('FPA-32 does not retry after a failure', () => {
      observe(service.getProposals());

      http
        .expectOne(PROPOSALS_URL)
        .flush(null, { status: 500, statusText: 'Server Error' });

      observe(service.getChangeRequests());

      http
        .expectOne(`${CHANGES_URL}?pendingOnly=false`)
        .flush(null, { status: 500, statusText: 'Server Error' });

      http.expectNone(() => true);
    });
  });

  describe('API origin configuration', () => {
    it('FPA-33 an unconfigured origin errors safely without any HTTP request', () => {
      TestBed.resetTestingModule();
      setup({ baseUrl: null });

      const proposals = observe(service.getProposals());
      const changes = observe(service.getChangeRequests());

      expect(proposals.error).toBeInstanceOf(Error);
      expect(changes.error).toBeInstanceOf(Error);
      expect(proposals.error).not.toBeInstanceOf(ApiError);
      expect(resolveFixProofError(proposals.error).kind).toBe('unknown');
      http.expectNone(() => true);
    });

    it.each([
      'http://api.fixora.test',
      'https://user:pw@api.fixora.test',
      'https://api.fixora.test/?x=1',
      'not a url',
    ])('FPA-34 invalid origin %s is refused without any HTTP request', baseUrl => {
      TestBed.resetTestingModule();
      setup({ baseUrl });

      const outcome = observe(service.getProposals());

      expect(outcome.error).toBeInstanceOf(Error);
      http.expectNone(() => true);
    });

    it('FPA-35 invalid queries are reported before the origin is consulted', () => {
      TestBed.resetTestingModule();
      setup({ baseUrl: null });

      const outcome = observe(service.getProposals({ status: 'Nope' } as never));

      expect(outcome.error).toBeInstanceOf(FixProofRequestError);
    });

    it('FPA-36 honours a configured base path prefix', () => {
      TestBed.resetTestingModule();
      setup({ baseUrl: `${BASE}/gateway/` });

      observe(service.getProposals({ status: 'AwaitingCustomer' }));

      http
        .expectOne(
          `${BASE}/gateway/api/v1/manager/approvals/proposals?status=AwaitingCustomer`,
        )
        .flush([]);
    });
  });

  describe('authentication through existing interceptors', () => {
    it('FPA-37 attaches the bearer token for trusted API-origin requests', () => {
      signIn();

      observe(service.getProposals());
      observe(service.getChangeRequests());

      const proposals = http.expectOne(PROPOSALS_URL);
      const changes = http.expectOne(`${CHANGES_URL}?pendingOnly=false`);

      for (const req of [proposals, changes]) {
        expect(req.request.headers.get('Authorization')).toBe(
          'Bearer test-access-token',
        );
        expect(req.request.urlWithParams).not.toContain('test-access-token');
      }

      proposals.flush([]);
      changes.flush([]);
    });

    it('FPA-38 sends no Authorization header when there is no session', () => {
      observe(service.getProposals());

      const req = http.expectOne(PROPOSALS_URL);

      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush([]);
    });

    it('FPA-39 attaches the token under a trusted base path prefix', () => {
      TestBed.resetTestingModule();
      setup({ baseUrl: `${BASE}/gateway` });
      signIn();

      observe(service.getChangeRequests());

      const req = http.expectOne(
        `${BASE}/gateway/api/v1/manager/approvals/change-requests?pendingOnly=false`,
      );

      expect(req.request.headers.get('Authorization')).toBe(
        'Bearer test-access-token',
      );
      req.flush([]);
    });

    it('FPA-40 sets no credentials or custom headers of its own', () => {
      observe(service.getProposals());

      const req = http.expectOne(PROPOSALS_URL);

      expect(req.request.withCredentials).toBe(false);
      expect(req.request.headers.keys()).toEqual([]);
      req.flush([]);
    });
  });

  describe('read-only guarantees', () => {
    it('FPA-41 exposes only the two verified list methods and no mutation or detail methods', () => {
      const methods = Object.getOwnPropertyNames(
        Object.getPrototypeOf(service),
      ).filter(name => name !== 'constructor');

      expect(methods.sort()).toEqual(['getChangeRequests', 'getProposals']);
    });

    it('FPA-42 every request is a GET and exactly one request is made per call', () => {
      observe(service.getProposals());
      observe(service.getChangeRequests());

      const requests = http.match(() => true);

      expect(requests).toHaveLength(2);
      expect(requests.map(req => req.request.method)).toEqual(['GET', 'GET']);

      requests[0].flush([]);
      requests[1].flush([]);
    });

    it('FPA-43 never requests media or other endpoints after a successful load', () => {
      const proposal = createProposal(PROPOSAL_ID, {
        mechanicNote: SIGNED_URL,
      });

      observe(service.getProposals());

      http.expectOne(PROPOSALS_URL).flush([proposal]);

      http.expectNone(request => request.url.includes('/media/'));
      http.expectNone(() => true);
    });
  });
});
