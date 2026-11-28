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

import { resolveFixProofError } from '../utils/fixproof-error.mapper';
import { evaluateRevisionImpact } from '../utils/fixproof-pricing.util';
import {
  FixProofRequestError,
  FixProofResponseError,
} from '../utils/fixproof.validator';

import {
  FixProofActionBlockedError,
  FixProofApiOriginError,
  FixProofMutationApiService,
} from './fixproof-mutation-api.service';
import type { PriceInput } from './fixproof-mutation-api.service';

const BASE = 'https://api.fixora.test';
const APPROVALS = `${BASE}/api/v1/manager/approvals`;

function uuidFor(prefix: number, n: number): string {
  const head = n.toString(16).padStart(8, '0');
  const mid = prefix.toString(16).padStart(4, '0');

  return `${head}-${mid}-4000-8000-000000000000`;
}

const P = uuidFor(1, 1);
const OTHER_P = uuidFor(1, 9);
const JOB = uuidFor(2, 1);
const CR = uuidFor(3, 1);
const OTHER_CR = uuidFor(3, 9);
const I = uuidFor(4, 1);
const I2 = uuidFor(4, 2);
const MECH = uuidFor(5, 1);
const EMPTY = '00000000-0000-0000-0000-000000000000';

const SIGNED_URL =
  '/api/v1/media/0123456789abcdef0123456789abcdef.jpg?exp=1800000000&sig=' +
  'a1'.repeat(32);

const LEAKY_BACKEND_BODY = {
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

interface ProposalFixture {
  id?: string;
  status?: string;
  managerNote?: string | null;
  itemId?: string;
  unitPrice?: number;
  qty?: number;
  itemStatus?: string;
  itemKind?: string;
}

function proposalResponse(f: ProposalFixture = {}): Record<string, unknown> {
  const unitPrice = f.unitPrice ?? 1250.5;
  const qty = f.qty ?? 2;

  return {
    id: f.id ?? P,
    jobCardId: JOB,
    jobNumber: 'JC-2026-0042',
    vehicleLabel: 'Suzuki Wagon R (NP CAB-4521)',
    customerName: 'Kavitha',
    status: f.status ?? 'PendingManagerReview',
    mechanicId: MECH,
    mechanicName: 'Ravi',
    mechanicNote: 'Pads at 2 mm',
    managerNote: f.managerNote === undefined ? null : f.managerNote,
    customerNote: null,
    submittedAt: '2026-11-27T08:40:00Z',
    publishedAt: null,
    respondedAt: null,
    releasedAt: null,
    total: unitPrice * qty,
    approvedTotal: 0,
    items: [
      {
        id: f.itemId ?? I,
        title: 'Front brake pads',
        kind: f.itemKind ?? 'Part',
        qty,
        unitPrice,
        amount: unitPrice * qty,
        version: 2,
        status: f.itemStatus ?? 'Proposed',
        linkedIssueId: null,
      },
    ],
    audit: [
      {
        actorRole: 'Manager',
        action: 'Updated',
        detail: null,
        at: '2026-11-27T08:50:00Z',
      },
    ],
  };
}

function changeResponse(
  status: string,
  managerNote: string | null,
  id: string = CR,
): Record<string, unknown> {
  return {
    id,
    jobCardId: JOB,
    jobNumber: 'JC-2026-0042',
    number: 'CR-2026-0001',
    changes: ['Keep old parts'],
    details: 'Place old pads in the boot.',
    status,
    managerNote,
    mechanicNote: null,
    createdAt: '2026-11-27T09:00:00Z',
  };
}

interface Args {
  id: string;
  itemId: string;
  price: PriceInput;
  note: string | null | undefined;
  context: Record<string, unknown>;
}

interface OpDef {
  readonly name: string;
  readonly method: 'PUT' | 'POST';
  readonly url: string;
  readonly kind: 'proposal' | 'change';
  readonly hasItem: boolean;
  readonly hasPrice: boolean;
  readonly noteKind: 'none' | 'optional' | 'required';
  readonly note: string | null;
  readonly expectedBody: Record<string, unknown>;
  readonly defaultContext: Record<string, unknown>;
  readonly invoke: (s: FixProofMutationApiService, a: Args) => Observable<unknown>;
  readonly success: (patch?: ProposalFixture) => Record<string, unknown>;
}

const PRICE: PriceInput = { unitPrice: '1250.50', qty: '2' };

const OPS: readonly OpDef[] = [
  {
    name: 'setItemPrice',
    method: 'PUT',
    url: `${APPROVALS}/proposals/${P}/items/${I}/price`,
    kind: 'proposal',
    hasItem: true,
    hasPrice: true,
    noteKind: 'none',
    note: null,
    expectedBody: { unitPrice: 1250.5, qty: 2 },
    defaultContext: {
      proposalStatus: 'PendingManagerReview',
      itemStatus: 'Proposed',
      jobStatus: 'AwaitingManagerReview',
    },
    invoke: (s, a) => s.setItemPrice(a.id, a.itemId, a.price, a.context as never),
    success: patch => proposalResponse({ status: 'PendingManagerReview', ...patch }),
  },
  {
    name: 'reviseItem',
    method: 'PUT',
    url: `${APPROVALS}/proposals/${P}/items/${I}/revise`,
    kind: 'proposal',
    hasItem: true,
    hasPrice: true,
    noteKind: 'none',
    note: null,
    expectedBody: { unitPrice: 1250.5, qty: 2 },
    defaultContext: {
      proposalStatus: 'AwaitingCustomer',
      itemStatus: 'AwaitingCustomer',
      jobStatus: 'AwaitingCustomerApproval',
    },
    invoke: (s, a) => s.reviseItem(a.id, a.itemId, a.price, a.context as never),
    success: patch =>
      proposalResponse({ status: 'AwaitingCustomer', itemStatus: 'AwaitingCustomer', ...patch }),
  },
  {
    name: 'forwardProposal',
    method: 'POST',
    url: `${APPROVALS}/proposals/${P}/forward`,
    kind: 'proposal',
    hasItem: false,
    hasPrice: false,
    noteKind: 'optional',
    note: 'Please approve',
    expectedBody: { note: 'Please approve' },
    defaultContext: {
      proposalStatus: 'PendingManagerReview',
      jobStatus: 'AwaitingManagerReview',
    },
    invoke: (s, a) => s.forwardProposal(a.id, a.note, a.context as never),
    success: patch =>
      proposalResponse({ status: 'AwaitingCustomer', managerNote: 'Please approve', ...patch }),
  },
  {
    name: 'returnProposal',
    method: 'POST',
    url: `${APPROVALS}/proposals/${P}/return`,
    kind: 'proposal',
    hasItem: false,
    hasPrice: false,
    noteKind: 'required',
    note: 'Add photos',
    expectedBody: { note: 'Add photos' },
    defaultContext: {
      proposalStatus: 'PendingManagerReview',
      jobStatus: 'AwaitingManagerReview',
    },
    invoke: (s, a) => s.returnProposal(a.id, a.note as string, a.context as never),
    success: patch =>
      proposalResponse({ status: 'ReturnedToMechanic', managerNote: 'Add photos', ...patch }),
  },
  {
    name: 'releaseProposal',
    method: 'POST',
    url: `${APPROVALS}/proposals/${P}/release`,
    kind: 'proposal',
    hasItem: false,
    hasPrice: false,
    noteKind: 'optional',
    note: 'Go ahead',
    expectedBody: { note: 'Go ahead' },
    defaultContext: {
      proposalStatus: 'CustomerResponded',
      jobStatus: 'AwaitingRelease',
    },
    invoke: (s, a) => s.releaseProposal(a.id, a.note, a.context as never),
    success: patch =>
      proposalResponse({
        status: 'ReleasedToMechanic',
        managerNote: 'Go ahead',
        itemStatus: 'Released',
        ...patch,
      }),
  },
  {
    name: 'forwardChangeRequest',
    method: 'POST',
    url: `${APPROVALS}/change-requests/${CR}/forward`,
    kind: 'change',
    hasItem: false,
    hasPrice: false,
    noteKind: 'optional',
    note: 'Fine by us',
    expectedBody: { note: 'Fine by us' },
    defaultContext: {
      changeRequestStatus: 'PendingManagerReview',
      jobStatus: 'InProgress',
    },
    invoke: (s, a) => s.forwardChangeRequest(a.id, a.note, a.context as never),
    success: patch =>
      changeResponse('ForwardedToMechanic', 'Fine by us', patch?.id),
  },
  {
    name: 'declineChangeRequest',
    method: 'POST',
    url: `${APPROVALS}/change-requests/${CR}/decline`,
    kind: 'change',
    hasItem: false,
    hasPrice: false,
    noteKind: 'required',
    note: 'Not possible',
    expectedBody: { note: 'Not possible' },
    defaultContext: {
      changeRequestStatus: 'PendingManagerReview',
      jobStatus: 'InProgress',
    },
    invoke: (s, a) => s.declineChangeRequest(a.id, a.note as string, a.context as never),
    success: patch => changeResponse('Declined', 'Not possible', patch?.id),
  },
];

function idFor(op: OpDef): string {
  return op.kind === 'change' ? CR : P;
}

function otherIdFor(op: OpDef): string {
  return op.kind === 'change' ? OTHER_CR : OTHER_P;
}

function args(op: OpDef, over: Partial<Args> = {}): Args {
  return {
    id: idFor(op),
    itemId: I,
    price: PRICE,
    note: op.note,
    context: op.defaultContext,
    ...over,
  };
}

function wrongStatusResponse(op: OpDef): Record<string, unknown> {
  return op.kind === 'change'
    ? changeResponse('Acknowledged', op.note)
    : op.success({ status: 'Cancelled' });
}

describe('FixProofMutationApiService', () => {
  let service: FixProofMutationApiService;
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

    service = TestBed.inject(FixProofMutationApiService);
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

  function run(op: OpDef, over: Partial<Args> = {}): Outcome<unknown> {
    return observe(op.invoke(service, args(op, over)));
  }

  function expectBlocked(
    outcome: Outcome<unknown>,
    status: string,
    reason: string,
    backendSupported?: boolean,
  ): void {
    const error = outcome.error as FixProofActionBlockedError;

    expect(error).toBeInstanceOf(FixProofActionBlockedError);
    expect(error.requestSent).toBe(false);
    expect(error.eligibility.frontendAllowed).toBe(false);
    expect(error.eligibility.status).toBe(status);
    expect(error.eligibility.reason).toBe(reason);

    if (backendSupported !== undefined) {
      expect(error.eligibility.backendSupported).toBe(backendSupported);
    }

    expect(outcome.completed).toBe(false);
    expect(outcome.value).toBeUndefined();
    http.expectNone(() => true);
  }

  beforeEach(() => {
    setup();
  });

  afterEach(() => {
    http.verify();
  });

  describe('verified endpoint contracts', () => {
    for (const op of OPS) {
      it(`FMA-01 ${op.name} sends exactly one ${op.method} to the verified route with the exact body`, () => {
        const outcome = run(op);
        const req = http.expectOne(op.url);

        expect(req.request.method).toBe(op.method);
        expect(req.request.url).toBe(op.url);
        expect(req.request.urlWithParams).toBe(op.url);
        expect(req.request.params.keys()).toEqual([]);
        expect(req.request.body).toEqual(op.expectedBody);
        expect(Object.keys(req.request.body as object)).toEqual(
          Object.keys(op.expectedBody),
        );

        req.flush(op.success());

        expect(outcome.completed).toBe(true);
        expect(outcome.error).toBeUndefined();
        expect((outcome.value as { id: string }).id).toBe(idFor(op));
      });

      it(`FMA-02 ${op.name} is cold: nothing is sent until subscribed`, () => {
        op.invoke(service, args(op));

        http.expectNone(() => true);
      });
    }

    it('FMA-03 exposes exactly the seven verified mutations and no read, retry or other methods', () => {
      const methods = Object.getOwnPropertyNames(
        Object.getPrototypeOf(service),
      )
        .filter(name => !name.startsWith('constructor'))
        .filter(name => !['priceBody', 'noteBody', 'verifyPricedProposal', 'verifyNotedProposal', 'verifyChangeRequest'].includes(name));

      expect(methods.sort()).toEqual(
        [
          'declineChangeRequest',
          'forwardChangeRequest',
          'forwardProposal',
          'releaseProposal',
          'returnProposal',
          'reviseItem',
          'setItemPrice',
        ].sort(),
      );
    });

    it('FMA-04 uses only PUT for pricing and POST for transitions, never DELETE or PATCH', () => {
      expect(
        OPS.map(op => `${op.method} ${op.name}`),
      ).toEqual([
        'PUT setItemPrice',
        'PUT reviseItem',
        'POST forwardProposal',
        'POST returnProposal',
        'POST releaseProposal',
        'POST forwardChangeRequest',
        'POST declineChangeRequest',
      ]);
    });

    it('FMA-05 normalizes decimal strings and numbers to exact numeric body values', () => {
      const op = OPS[0];

      for (const [price, expected] of [
        [{ unitPrice: '12.50', qty: '3' }, { unitPrice: 12.5, qty: 3 }],
        [{ unitPrice: 12.5, qty: 3 }, { unitPrice: 12.5, qty: 3 }],
        [{ unitPrice: '0', qty: 1 }, { unitPrice: 0, qty: 1 }],
        [{ unitPrice: '0.00', qty: 1 }, { unitPrice: 0, qty: 1 }],
        [{ unitPrice: '0.01', qty: 2147483647 }, { unitPrice: 0.01, qty: 2147483647 }],
      ] as const) {
        observe(service.setItemPrice(P, I, price, op.defaultContext as never));

        const req = http.expectOne(op.url);

        expect(req.request.body).toEqual(expected);
        req.flush(
          proposalResponse({ unitPrice: expected.unitPrice, qty: expected.qty }),
        );
      }
    });
  });

  describe('identifier validation (no HTTP)', () => {
    const BAD_IDS: readonly [string, unknown][] = [
      ['empty string', ''],
      ['whitespace', ' '],
      ['not a guid', 'not-a-guid'],
      ['empty guid', EMPTY],
      ['path traversal', `${P}/../${OTHER_P}`],
      ['query injection', `${P}?x=1`],
      ['path suffix', `${P}/release`],
      ['encoded slash', `${P}%2f`],
      ['leading space', ` ${P}`],
      ['no hyphens', P.replaceAll('-', '')],
      ['null', null],
      ['undefined', undefined],
      ['number', 7],
      ['object', {}],
    ];

    for (const op of OPS) {
      it.each(BAD_IDS)(`FMA-06 ${op.name} rejects invalid primary id (%s)`, (_label, bad) => {
        expect(() => op.invoke(service, args(op, { id: bad as string }))).not.toThrow();

        const outcome = run(op, { id: bad as string });

        expect(outcome.error).toBeInstanceOf(FixProofRequestError);
        expect(resolveFixProofError(outcome.error, 'mutation').kind).toBe(
          'invalid-request',
        );
        http.expectNone(() => true);
      });

      if (op.hasItem) {
        it.each(BAD_IDS)(`FMA-07 ${op.name} rejects invalid item id (%s)`, (_label, bad) => {
          const outcome = run(op, { itemId: bad as string });

          expect(outcome.error).toBeInstanceOf(FixProofRequestError);
          expect((outcome.error as FixProofRequestError).field).toBe('itemId');
          http.expectNone(() => true);
        });
      }
    }

    it('FMA-08 accepts upper-case ids and matches the response identity case-insensitively', () => {
      const op = OPS[2];

      observe(op.invoke(service, args(op, { id: P.toUpperCase() })));

      http
        .expectOne(`${APPROVALS}/proposals/${P.toUpperCase()}/forward`)
        .flush(op.success());
    });
  });

  describe('price and quantity validation (no HTTP)', () => {
    const priceOps = OPS.filter(op => op.hasPrice);

    const BAD_PRICES: readonly [string, unknown][] = [
      ['empty', ''],
      ['text', 'abc'],
      ['negative', '-1'],
      ['negative zero-ish', '-0.01'],
      ['three decimals', '1.005'],
      ['exponent', '1e3'],
      ['hex', '0x10'],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['overflow', '99999999999999999999'],
      ['null', null],
      ['undefined', undefined],
      ['object', {}],
      ['boolean', true],
    ];

    const BAD_QTYS: readonly [string, unknown][] = [
      ['zero', 0],
      ['negative', -1],
      ['fractional', 1.5],
      ['text', 'x'],
      ['empty', ''],
      ['int32 overflow', 2_147_483_648],
      ['null', null],
      ['undefined', undefined],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['object', {}],
    ];

    for (const op of priceOps) {
      it.each(BAD_PRICES)(`FMA-09 ${op.name} rejects invalid unit price (%s)`, (_label, bad) => {
        const outcome = run(op, {
          price: { unitPrice: bad, qty: 1 } as never,
        });

        expect(outcome.error).toBeInstanceOf(FixProofRequestError);
        expect((outcome.error as FixProofRequestError).field).toBe('unitPrice');
        http.expectNone(() => true);
      });

      it.each(BAD_QTYS)(`FMA-10 ${op.name} rejects invalid quantity (%s)`, (_label, bad) => {
        const outcome = run(op, {
          price: { unitPrice: '10.00', qty: bad } as never,
        });

        expect(outcome.error).toBeInstanceOf(FixProofRequestError);
        expect((outcome.error as FixProofRequestError).field).toBe('qty');
        http.expectNone(() => true);
      });

      it(`FMA-11 ${op.name} rejects a line amount that overflows SQL decimal(18,2)`, () => {
        const outcome = run(op, {
          price: { unitPrice: '70368744177663.99', qty: 2_147_483_647 },
        });

        expect(outcome.error).toBeInstanceOf(FixProofRequestError);
        expect((outcome.error as FixProofRequestError).field).toBe('amount');
        http.expectNone(() => true);
      });

      it(`FMA-11b ${op.name} rejects IEEE-754 cent-colliding unit prices above 70_368_744_177_663.99 before HTTP`, () => {
        for (const unsafe of ['70368744177664.00', '70368744177664.01']) {
          const outcome = run(op, {
            price: { unitPrice: unsafe, qty: 1 },
          });

          expect(outcome.error).toBeInstanceOf(FixProofRequestError);
          expect((outcome.error as FixProofRequestError).field).toBe(
            'unitPrice',
          );
        }

        http.expectNone(() => true);
      });

      it(`FMA-12 ${op.name} rejects a non-object or missing price request`, () => {
        for (const bad of [null, undefined, 'x', 5, []]) {
          const outcome = run(op, { price: bad as never });

          expect(outcome.error).toBeInstanceOf(FixProofRequestError);
        }

        http.expectNone(() => true);
      });
    }
  });

  describe('mandatory and optional notes (no HTTP for invalid)', () => {
    for (const op of OPS.filter(o => o.noteKind === 'required')) {
      it.each([
        ['empty', ''],
        ['whitespace', '   '],
        ['tabs and newlines', '\t\n'],
        ['null', null],
        ['undefined', undefined],
        ['number', 5],
        ['object', {}],
      ])(`FMA-13 ${op.name} requires a non-blank note (%s)`, (_label, bad) => {
        const outcome = run(op, { note: bad as never });

        expect(outcome.error).toBeInstanceOf(FixProofRequestError);
        expect((outcome.error as FixProofRequestError).field).toBe('note');
        http.expectNone(() => true);
      });

      it(`FMA-14 ${op.name} trims the note before sending`, () => {
        const trimmed = op.note as string;

        run(op, { note: `  ${trimmed}  ` });

        const req = http.expectOne(op.url);

        expect(req.request.body).toEqual({ note: trimmed });
        req.flush(op.success());
      });
    }

    for (const op of OPS.filter(o => o.noteKind === 'optional')) {
      it.each([
        ['null', null],
        ['undefined', undefined],
        ['empty', ''],
        ['whitespace', '   '],
      ])(`FMA-15 ${op.name} sends note:null for a blank optional note (%s)`, (_label, blank) => {
        const outcome = run(op, { note: blank });
        const req = http.expectOne(op.url);

        expect(req.request.body).toEqual({ note: null });

        req.flush(
          op.kind === 'change'
            ? changeResponse('ForwardedToMechanic', null)
            : op.success({ managerNote: null }),
        );

        expect(outcome.error).toBeUndefined();
        expect(outcome.completed).toBe(true);
      });

      it.each([
        ['number', 5],
        ['object', {}],
        ['boolean', false],
      ])(`FMA-16 ${op.name} rejects a non-string note (%s)`, (_label, bad) => {
        const outcome = run(op, { note: bad as never });

        expect(outcome.error).toBeInstanceOf(FixProofRequestError);
        expect((outcome.error as FixProofRequestError).field).toBe('note');
        http.expectNone(() => true);
      });
    }
  });

  describe('action eligibility (backend support vs frontend safety)', () => {
    for (const op of OPS) {
      it(`FMA-17 ${op.name} blocks Completed and Closed jobs by frontend safety without any request`, () => {
        for (const jobStatus of ['Completed', 'Closed']) {
          const outcome = run(op, {
            context: { ...op.defaultContext, jobStatus },
          });

          expectBlocked(
            outcome,
            'blocked-by-frontend-safety',
            'terminal-job-status',
            true,
          );
        }
      });

      it.each([
        ['undefined', undefined],
        ['null', null],
        ['empty', ''],
        ['whitespace', '   '],
      ])(`FMA-18 ${op.name} is unresolved when the authoritative job status is missing (%s)`, (_label, jobStatus) => {
        const outcome = run(op, {
          context: { ...op.defaultContext, jobStatus },
        });

        expectBlocked(
          outcome,
          'unresolved',
          'missing-authoritative-job-status',
        );
      });

      it(`FMA-19 ${op.name} is unresolved for an unknown job status`, () => {
        const outcome = run(op, {
          context: { ...op.defaultContext, jobStatus: 'FutureJobStatus' },
        });

        expectBlocked(outcome, 'unresolved', 'unknown-job-status');
      });

      it(`FMA-20 ${op.name} never infers job status from entity status`, () => {
        const context = { ...op.defaultContext };

        delete context['jobStatus'];

        expectBlocked(
          run(op, { context }),
          'unresolved',
          'missing-authoritative-job-status',
        );
        expect(run(op, { context: undefined as never }).error).toBeInstanceOf(
          FixProofActionBlockedError,
        );
        http.expectNone(() => true);
      });

      it.each([
        'AwaitingManagerReview',
        'AwaitingCustomerApproval',
        'AwaitingRelease',
        'InProgress',
        'Paused',
        'Open',
        'Inspecting',
      ])(`FMA-21 ${op.name} is allowed for non-terminal job status %s`, jobStatus => {
        const outcome = run(op, {
          context: { ...op.defaultContext, jobStatus },
        });

        http.expectOne(op.url).flush(op.success());

        expect(outcome.completed).toBe(true);
      });
    }

    it.each([
      'ReturnedToMechanic',
      'AwaitingCustomer',
      'CustomerResponded',
      'ReleasedToMechanic',
      'Cancelled',
    ])('FMA-22 setItemPrice is blocked by the backend state machine in %s', proposalStatus => {
      const op = OPS[0];

      expectBlocked(
        run(op, { context: { ...op.defaultContext, proposalStatus } }),
        'blocked-by-backend',
        'proposal-status-disallows-action',
        false,
      );
    });

    it('FMA-23 setItemPrice is unresolved for an unknown item status or unknown proposal status', () => {
      const op = OPS[0];

      expectBlocked(
        run(op, { context: { ...op.defaultContext, itemStatus: 'FutureItem' } }),
        'unresolved',
        'unknown-item-status',
      );
      expectBlocked(
        run(op, { context: { ...op.defaultContext, proposalStatus: 'FutureStatus' } }),
        'unresolved',
        'unknown-proposal-status',
      );
    });

    for (const op of [OPS[2], OPS[3]]) {
      it.each([
        'ReturnedToMechanic',
        'AwaitingCustomer',
        'CustomerResponded',
        'ReleasedToMechanic',
        'Cancelled',
      ])(`FMA-24 ${op.name} is blocked by the backend state machine in %s`, proposalStatus => {
        expectBlocked(
          run(op, { context: { ...op.defaultContext, proposalStatus } }),
          'blocked-by-backend',
          'proposal-status-disallows-action',
          false,
        );
      });
    }

    it.each([
      'PendingManagerReview',
      'ReturnedToMechanic',
      'AwaitingCustomer',
      'ReleasedToMechanic',
      'Cancelled',
    ])('FMA-25 releaseProposal is blocked by the backend state machine in %s', proposalStatus => {
      const op = OPS[4];

      expectBlocked(
        run(op, { context: { ...op.defaultContext, proposalStatus } }),
        'blocked-by-backend',
        'proposal-status-disallows-action',
        false,
      );
    });

    it('FMA-26 every proposal action is unresolved for an unknown proposal status', () => {
      for (const op of OPS.filter(o => o.kind === 'proposal')) {
        expectBlocked(
          run(op, { context: { ...op.defaultContext, proposalStatus: 'FutureStatus' } }),
          'unresolved',
          'unknown-proposal-status',
        );
      }
    });

    it.each(['PendingManagerReview', 'ReturnedToMechanic', 'Cancelled'])(
      'FMA-27 reviseItem is blocked by the backend (not published) in %s',
      proposalStatus => {
        const op = OPS[1];

        expectBlocked(
          run(op, { context: { ...op.defaultContext, proposalStatus } }),
          'blocked-by-backend',
          'proposal-not-published',
          false,
        );
      },
    );

    it('FMA-28 reviseItem is blocked by frontend safety for a ReleasedToMechanic proposal even though the backend supports it', () => {
      const op = OPS[1];

      expectBlocked(
        run(op, {
          context: { ...op.defaultContext, proposalStatus: 'ReleasedToMechanic' },
        }),
        'blocked-by-frontend-safety',
        'released-proposal-revision-restricted',
        true,
      );
    });

    it('FMA-29 reviseItem is blocked by frontend safety for a Released repair item', () => {
      const op = OPS[1];

      expectBlocked(
        run(op, {
          context: {
            ...op.defaultContext,
            proposalStatus: 'CustomerResponded',
            itemStatus: 'Released',
          },
        }),
        'blocked-by-frontend-safety',
        'released-item-revision-restricted',
        true,
      );
    });

    it('FMA-30 reviseItem is unresolved for unknown item or proposal status', () => {
      const op = OPS[1];

      expectBlocked(
        run(op, { context: { ...op.defaultContext, itemStatus: 'FutureItem' } }),
        'unresolved',
        'unknown-item-status',
      );
      expectBlocked(
        run(op, { context: { ...op.defaultContext, proposalStatus: 'FutureStatus' } }),
        'unresolved',
        'unknown-proposal-status',
      );
    });

    it.each([
      ['AwaitingCustomer', 'Proposed'],
      ['AwaitingCustomer', 'AwaitingCustomer'],
      ['AwaitingCustomer', 'Approved'],
      ['AwaitingCustomer', 'Rejected'],
      ['CustomerResponded', 'Approved'],
      ['CustomerResponded', 'Rejected'],
    ])('FMA-31 reviseItem is allowed for proposal %s with item %s', (proposalStatus, itemStatus) => {
      const op = OPS[1];

      run(op, {
        context: { ...op.defaultContext, proposalStatus, itemStatus },
      });

      http.expectOne(op.url).flush(op.success());
    });

    it.each([
      'ForwardedToMechanic',
      'Declined',
      'Acknowledged',
    ])('FMA-32 change request actions are blocked by the backend once handled (%s)', changeRequestStatus => {
      for (const op of OPS.filter(o => o.kind === 'change')) {
        expectBlocked(
          run(op, { context: { ...op.defaultContext, changeRequestStatus } }),
          'blocked-by-backend',
          'change-request-already-handled',
          false,
        );
      }
    });

    it('FMA-33 change request actions are unresolved for an unknown change request status', () => {
      for (const op of OPS.filter(o => o.kind === 'change')) {
        expectBlocked(
          run(op, { context: { ...op.defaultContext, changeRequestStatus: 'Future' } }),
          'unresolved',
          'unknown-change-request-status',
        );
      }
    });

    it('FMA-34 blocked errors expose a fixed code message and no backend text', () => {
      const outcome = run(OPS[2], {
        context: { ...OPS[2].defaultContext, jobStatus: 'Completed' },
      });
      const error = outcome.error as FixProofActionBlockedError;

      expect(error.message).toBe(
        'FixProof action blocked: forward (terminal-job-status)',
      );
      expect(error.name).toBe('FixProofActionBlockedError');
    });
  });

  describe('revision tolerance boundaries (backend decides; client estimate is indicative)', () => {
    const REVISE_CONTEXT = {
      proposalStatus: 'CustomerResponded',
      itemStatus: 'Approved',
      jobStatus: 'AwaitingRelease',
    };

    function impact(proposedUnitPrice: string, proposedQty = 1) {
      return evaluateRevisionImpact({
        currentUnitPrice: '1000.00',
        currentQty: 1,
        currentItemStatus: 'Approved',
        proposedUnitPrice,
        proposedQty,
      });
    }

    it('FMA-35 exactly +10% is within tolerance and the exact body is sent', () => {
      const estimate = impact('1100.00');

      expect(estimate.ok && estimate.exceedsTolerance).toBe(false);

      const outcome = observe(
        service.reviseItem(P, I, { unitPrice: '1100.00', qty: 1 }, REVISE_CONTEXT as never),
      );
      const req = http.expectOne(`${APPROVALS}/proposals/${P}/items/${I}/revise`);

      expect(req.request.body).toEqual({ unitPrice: 1100, qty: 1 });
      req.flush(
        proposalResponse({
          status: 'CustomerResponded',
          itemStatus: 'Approved',
          unitPrice: 1100,
          qty: 1,
        }),
      );

      expect(outcome.error).toBeUndefined();
      expect((outcome.value as { status: string }).status).toBe('CustomerResponded');
    });

    it('FMA-36 just above +10% needs renewed approval according to the backend response', () => {
      const estimate = impact('1100.01');

      expect(estimate.ok && estimate.exceedsTolerance).toBe(true);

      const outcome = observe(
        service.reviseItem(P, I, { unitPrice: '1100.01', qty: 1 }, REVISE_CONTEXT as never),
      );

      http.expectOne(`${APPROVALS}/proposals/${P}/items/${I}/revise`).flush(
        proposalResponse({
          status: 'AwaitingCustomer',
          itemStatus: 'AwaitingCustomer',
          unitPrice: 1100.01,
          qty: 1,
        }),
      );

      expect((outcome.value as { status: string }).status).toBe('AwaitingCustomer');
    });

    it('FMA-37 a quantity change needs renewed approval even at the same line amount', () => {
      const estimate = impact('500.00', 2);

      expect(estimate.ok && estimate.needsRenewedApproval).toBe(true);

      const outcome = observe(
        service.reviseItem(P, I, { unitPrice: '500.00', qty: 2 }, REVISE_CONTEXT as never),
      );

      http.expectOne(`${APPROVALS}/proposals/${P}/items/${I}/revise`).flush(
        proposalResponse({
          status: 'AwaitingCustomer',
          itemStatus: 'AwaitingCustomer',
          unitPrice: 500,
          qty: 2,
        }),
      );

      expect(outcome.error).toBeUndefined();
    });

    it('FMA-38 a price decrease is within tolerance and sent unchanged', () => {
      const estimate = impact('900.00');

      expect(estimate.ok && estimate.exceedsTolerance).toBe(false);

      observe(
        service.reviseItem(P, I, { unitPrice: '900.00', qty: 1 }, REVISE_CONTEXT as never),
      );

      const req = http.expectOne(`${APPROVALS}/proposals/${P}/items/${I}/revise`);

      expect(req.request.body).toEqual({ unitPrice: 900, qty: 1 });
      req.flush(
        proposalResponse({
          status: 'CustomerResponded',
          itemStatus: 'Approved',
          unitPrice: 900,
          qty: 1,
        }),
      );
    });

    it('FMA-39 never blocks a revision client-side because of the tolerance estimate', () => {
      observe(
        service.reviseItem(P, I, { unitPrice: '99999.00', qty: 1 }, REVISE_CONTEXT as never),
      );

      const req = http.expectOne(`${APPROVALS}/proposals/${P}/items/${I}/revise`);

      expect(req.request.body).toEqual({ unitPrice: 99999, qty: 1 });
      req.flush(
        proposalResponse({
          status: 'AwaitingCustomer',
          itemStatus: 'AwaitingCustomer',
          unitPrice: 99999,
          qty: 1,
        }),
      );
    });
  });

  describe('response validation and identity (success is never reported for invalid responses)', () => {
    for (const op of OPS) {
      it.each([
        ['null', null],
        ['array', []],
        ['string', 'ok'],
        ['empty object', {}],
        ['number', 42],
      ])(`FMA-40 ${op.name} rejects an invalid response payload (%s) as an uncertain outcome`, (_label, body) => {
        const outcome = run(op);

        http.expectOne(op.url).flush(body);

        const resolution = resolveFixProofError(outcome.error, 'mutation');

        expect(outcome.error).toBeInstanceOf(FixProofResponseError);
        expect(outcome.value).toBeUndefined();
        expect(outcome.completed).toBe(false);
        expect(resolution.kind).toBe('invalid-response');
        expect(resolution.outcome).toBe('uncertain');
        expect(resolution.requiresRefresh).toBe(true);
      });

      it(`FMA-41 ${op.name} rejects a response for a different record`, () => {
        const outcome = run(op);

        http.expectOne(op.url).flush(op.success({ id: otherIdFor(op) }));

        expect(outcome.error).toBeInstanceOf(FixProofResponseError);
        expect(outcome.value).toBeUndefined();
        expect(resolveFixProofError(outcome.error, 'mutation').outcome).toBe(
          'uncertain',
        );
      });

      it(`FMA-42 ${op.name} rejects a response with an unexpected resulting status`, () => {
        const outcome = run(op);

        http.expectOne(op.url).flush(wrongStatusResponse(op));

        expect(outcome.error).toBeInstanceOf(FixProofResponseError);
        expect(outcome.value).toBeUndefined();
      });
    }

    it('FMA-43 forward, return and decline reject a response whose managerNote does not match what was sent', () => {
      for (const op of [OPS[2], OPS[3], OPS[5], OPS[6]]) {
        const outcome = run(op);
        const base = op.success();

        base['managerNote'] = 'Something else';
        http.expectOne(op.url).flush(base);

        expect(outcome.error).toBeInstanceOf(FixProofResponseError);
        expect((outcome.error as FixProofResponseError).field).toMatch(
          /managerNote$/,
        );
      }
    });

    it('FMA-44 release verifies the note only when one was sent', () => {
      const op = OPS[4];
      const withNote = run(op);

      http
        .expectOne(op.url)
        .flush(op.success({ managerNote: 'Different' }));
      expect(withNote.error).toBeInstanceOf(FixProofResponseError);

      const noNote = run(op, { note: null });

      http
        .expectOne(op.url)
        .flush(op.success({ managerNote: 'Earlier note kept by backend' }));
      expect(noNote.error).toBeUndefined();
      expect(noNote.completed).toBe(true);
    });

    for (const op of OPS.filter(o => o.hasPrice)) {
      it(`FMA-45 ${op.name} rejects a response whose item price, quantity or identity does not match the request`, () => {
        for (const patch of [
          { unitPrice: 999 },
          { qty: 7 },
          { itemId: I2 },
        ] as ProposalFixture[]) {
          const outcome = run(op);

          http.expectOne(op.url).flush(op.success(patch));

          expect(outcome.error).toBeInstanceOf(FixProofResponseError);
          expect(outcome.value).toBeUndefined();
        }
      });
    }

    it('FMA-46 rejects nested DTO violations in an otherwise matching response', () => {
      const op = OPS[2];

      for (const mutate of [
        (r: Record<string, unknown>) => { r['items'] = {}; },
        (r: Record<string, unknown>) => { r['audit'] = undefined; },
        (r: Record<string, unknown>) => { r['total'] = -1; },
        (r: Record<string, unknown>) => { r['submittedAt'] = 'yesterday'; },
        (r: Record<string, unknown>) => { r['mechanicId'] = EMPTY; },
      ]) {
        const outcome = run(op);
        const body = op.success();

        mutate(body);
        http.expectOne(op.url).flush(body);

        expect(outcome.error).toBeInstanceOf(FixProofResponseError);
        expect(outcome.value).toBeUndefined();
      }
    });

    it('FMA-47 preserves unknown item status and kind values in a valid response', () => {
      const op = OPS[0];
      const outcome = run(op);

      http.expectOne(op.url).flush(
        op.success({ itemStatus: 'FutureItemStatus', itemKind: 'FutureKind' }),
      );

      const proposal = outcome.value as {
        items: { status: string; kind: string }[];
      };

      expect(outcome.error).toBeUndefined();
      expect(proposal.items[0].status).toBe('FutureItemStatus');
      expect(proposal.items[0].kind).toBe('FutureKind');
    });

    it('FMA-48 response errors expose structural paths only, never values or signed URLs', () => {
      const op = OPS[2];
      const outcome = run(op);
      const body = op.success();

      body['customerName'] = SIGNED_URL;
      body['total'] = -5;
      http.expectOne(op.url).flush(body);

      const error = outcome.error as FixProofResponseError;
      const text = `${error.message} ${error.field} ${resolveFixProofError(error, 'mutation').message}`;

      expect(text).not.toContain('sig=');
      expect(text).not.toContain('/api/v1/media');
      expect(text).not.toContain('Kavitha');
    });
  });

  describe('HTTP failures and outcome classification', () => {
    const FAILURES = [
      [400, 'BAD_REQUEST', 'invalid-request', 'rejected'],
      [401, 'UNAUTHORIZED', 'unauthorized', 'rejected'],
      [403, 'FORBIDDEN', 'forbidden', 'rejected'],
      [404, 'NOT_FOUND', 'not-found', 'rejected'],
      [408, 'UNKNOWN_ERROR', 'unknown', 'uncertain'],
      [409, 'CONFLICT', 'conflict', 'rejected'],
      [422, 'VALIDATION_ERROR', 'validation-error', 'rejected'],
      [429, 'RATE_LIMITED', 'rate-limited', 'rejected'],
      [500, 'SERVER_ERROR', 'server-failure', 'uncertain'],
      [504, 'SERVER_ERROR', 'server-failure', 'uncertain'],
    ] as const;

    for (const op of OPS) {
      for (const [status, code, kind, classification] of FAILURES) {
        it(`FMA-49 ${op.name} HTTP ${status} maps to ${code} (${classification}) with a safe message and no retry`, () => {
          const outcome = run(op);

          http
            .expectOne(op.url)
            .flush({ ...LEAKY_BACKEND_BODY, status }, { status, statusText: 'Failure' });

          const error = outcome.error as ApiError;
          const resolution = resolveFixProofError(error, 'mutation');

          expect(error).toBeInstanceOf(ApiError);
          expect(error.status).toBe(status);
          expect(error.code).toBe(code);
          expect(error.message).not.toContain('Leaky');
          expect(error.message).not.toContain('token=');
          expect(resolution.kind).toBe(kind);
          expect(resolution.outcome).toBe(classification);
          expect(resolution.requiresSignIn).toBe(status === 401);
          expect(JSON.stringify(resolution)).not.toContain('Leaky');
          expect(JSON.stringify(resolution)).not.toContain('secret_internal_code');
          expect(outcome.value).toBeUndefined();
          expect(outcome.completed).toBe(false);
          http.expectNone(() => true);
        });
      }

      it(`FMA-50 ${op.name} network failure is an uncertain outcome and is not retried`, () => {
        const outcome = run(op);

        http.expectOne(op.url).error(new ProgressEvent('error'));

        const error = outcome.error as ApiError;
        const resolution = resolveFixProofError(error, 'mutation');

        expect(error).toBeInstanceOf(ApiError);
        expect(error.code).toBe('NETWORK_ERROR');
        expect(resolution.kind).toBe('network-failure');
        expect(resolution.outcome).toBe('uncertain');
        expect(resolution.requiresRefresh).toBe(true);
        http.expectNone(() => true);
      });
    }

    it.each([
      ['proposal_wrong_state', 'proposal-wrong-state'],
      ['proposal_not_published', 'proposal-not-published'],
      ['change_wrong_state', 'change-wrong-state'],
      ['concurrency_conflict', 'concurrency-conflict'],
      ['some_unknown_code', 'conflict'],
      ['item_version_changed', 'conflict'],
    ])('FMA-51 409 code %s is classified as %s and stays a rejected outcome', (code, kind) => {
      const outcome = run(OPS[0]);

      http
        .expectOne(OPS[0].url)
        .flush({ ...LEAKY_BACKEND_BODY, code }, { status: 409, statusText: 'Conflict' });

      const resolution = resolveFixProofError(outcome.error, 'mutation');

      expect(outcome.error).toBeInstanceOf(ApiError);
      expect(resolution.kind).toBe(kind);
      expect(resolution.outcome).toBe('rejected');
      expect(JSON.stringify(resolution)).not.toContain('Leaky');
    });

    it('FMA-52 a failed mutation is never replayed or duplicated', () => {
      const op = OPS[4];

      run(op);

      http
        .expectOne(op.url)
        .flush(null, { status: 500, statusText: 'Server Error' });

      http.expectNone(() => true);
    });

    it('FMA-53 a malformed success response is not retried either', () => {
      const op = OPS[3];

      run(op);

      http.expectOne(op.url).flush({});

      http.expectNone(() => true);
    });

    it('FMA-54 one subscription results in exactly one request', () => {
      const op = OPS[2];
      const source = op.invoke(service, args(op));

      source.subscribe();

      expect(http.match(() => true)).toHaveLength(1);
    });
  });

  describe('API origin configuration', () => {
    it('FMA-55 an unconfigured origin errors without any HTTP request', () => {
      TestBed.resetTestingModule();
      setup({ baseUrl: null });

      for (const op of OPS) {
        const outcome = run(op);

        expect(outcome.error).toBeInstanceOf(FixProofApiOriginError);
        expect(outcome.error).not.toBeInstanceOf(ApiError);
        expect((outcome.error as FixProofApiOriginError).requestSent).toBe(false);
      }

      http.expectNone(() => true);
    });

    it.each([
      'http://api.fixora.test',
      'https://user:pw@api.fixora.test',
      'https://api.fixora.test/?x=1',
      'not a url',
    ])('FMA-56 invalid origin %s is refused without any HTTP request', baseUrl => {
      TestBed.resetTestingModule();
      setup({ baseUrl });

      const outcome = run(OPS[2]);

      expect(outcome.error).toBeInstanceOf(FixProofApiOriginError);
      expect((outcome.error as FixProofApiOriginError).requestSent).toBe(false);
      http.expectNone(() => true);
    });

    it('FMA-57 invalid requests are reported before the origin is consulted', () => {
      TestBed.resetTestingModule();
      setup({ baseUrl: null });

      expect(run(OPS[2], { id: 'bad' }).error).toBeInstanceOf(
        FixProofRequestError,
      );
    });

    it('FMA-58 honours a configured base path prefix', () => {
      TestBed.resetTestingModule();
      setup({ baseUrl: `${BASE}/gateway/` });

      const op = OPS[2];

      run(op);

      http
        .expectOne(`${BASE}/gateway/api/v1/manager/approvals/proposals/${P}/forward`)
        .flush(op.success());
    });
  });

  describe('authentication through existing interceptors', () => {
    it('FMA-59 attaches the bearer token for every trusted API-origin mutation and never in the URL or body', () => {
      signIn();

      for (const op of OPS) {
        run(op);

        const req = http.expectOne(op.url);

        expect(req.request.headers.get('Authorization')).toBe(
          'Bearer test-access-token',
        );
        expect(req.request.urlWithParams).not.toContain('test-access-token');
        expect(JSON.stringify(req.request.body)).not.toContain('test-access-token');
        req.flush(op.success());
      }
    });

    it('FMA-60 sends no Authorization header without a session', () => {
      const op = OPS[2];

      run(op);

      const req = http.expectOne(op.url);

      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush(op.success());
    });

    it('FMA-61 attaches the token under a trusted base path prefix', () => {
      TestBed.resetTestingModule();
      setup({ baseUrl: `${BASE}/gateway` });
      signIn();

      const op = OPS[5];

      run(op);

      const req = http.expectOne(
        `${BASE}/gateway/api/v1/manager/approvals/change-requests/${CR}/forward`,
      );

      expect(req.request.headers.get('Authorization')).toBe(
        'Bearer test-access-token',
      );
      req.flush(op.success());
    });

    it('FMA-62 sets no credentials, idempotency key, concurrency token or custom headers of its own', () => {
      const op = OPS[2];

      run(op);

      const req = http.expectOne(op.url);

      expect(req.request.withCredentials).toBe(false);
      expect(req.request.headers.keys()).toEqual([]);
      expect(req.request.headers.has('Idempotency-Key')).toBe(false);
      expect(req.request.headers.has('If-Match')).toBe(false);
      req.flush(op.success());
    });
  });

  describe('blocked and rejected request outcome semantics', () => {
    it('FMA-63 pre-flight request errors are rejected outcomes (nothing was sent)', () => {
      const outcome = run(OPS[3], { note: '  ' });
      const resolution = resolveFixProofError(outcome.error, 'mutation');

      expect(resolution.kind).toBe('invalid-request');
      expect(resolution.outcome).toBe('rejected');
      http.expectNone(() => true);
    });

    it('FMA-64 blocked actions carry requestSent=false and no media or other endpoint is called', () => {
      const outcome = run(OPS[4], {
        context: { ...OPS[4].defaultContext, jobStatus: 'Closed' },
      });

      expect((outcome.error as FixProofActionBlockedError).requestSent).toBe(false);
      http.expectNone(request => request.url.includes('/media/'));
      http.expectNone(() => true);
    });
  });
});
