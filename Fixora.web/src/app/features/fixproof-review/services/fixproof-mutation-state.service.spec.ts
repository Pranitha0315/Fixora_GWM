import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { defer, EMPTY, of, Subject, throwError, TimeoutError } from 'rxjs';

import { SessionService } from '../../../core/auth/session.service';
import { API_CONFIG } from '../../../core/config/api.config';
import { ApiUrlService } from '../../../core/config/api-url.service';
import { authInterceptor } from '../../../core/interceptors/auth.interceptor';
import { errorInterceptor } from '../../../core/interceptors/error.interceptor';
import { ApiError } from '../../../core/models/api-error.model';
import type {
  ApiErrorCode,
  BookingConflictCode,
  FixProofConflictCode,
} from '../../../core/models/api-error.model';
import type { AuthSession } from '../../../core/models/auth-session.model';

import type {
  JobDetailDto,
  JobSummaryDto,
} from '../../job-cards/models/job-card.model';
import { Day06AuthorizationCoordinatorService } from '../../job-cards/services/day06-authorization-coordinator.service';
import { JobCardApiService } from '../../job-cards/services/job-card-api.service';
import { JobCardStateService } from '../../job-cards/services/job-card-state.service';

import type {
  ChangeRequestDto,
  ProposalDto,
  RepairItemDto,
} from '../models/fixproof.model';
import { resolveFixProofError } from '../utils/fixproof-error.mapper';
import {
  FixProofRequestError,
  FixProofResponseError,
} from '../utils/fixproof.validator';

import { FixProofApiService } from './fixproof-api.service';
import {
  FixProofActionBlockedError,
  FixProofApiOriginError,
  FixProofMutationApiService,
} from './fixproof-mutation-api.service';
import {
  FIXPROOF_MUTATION_STATE_CHECK_INTERVAL_MS,
  FixProofMutationStateService,
} from './fixproof-mutation-state.service';
import type {
  FixProofMutationAction,
  FixProofMutationStartResult,
} from './fixproof-mutation-state.service';
import {
  FIXPROOF_BEFORE_UNLOAD_TARGET,
  FixProofNavigationProtectionService,
  type FixProofBeforeUnloadTarget,
} from './fixproof-navigation-protection.service';
import { FixProofStateService } from './fixproof-state.service';
import type { FixProofAccessRevocationKind } from './fixproof-state.service';

const BASE = 'https://api.fixora.test';
const APPROVALS = `${BASE}/api/v1/manager/approvals`;
const JOBS = `${BASE}/api/v1/manager/jobs`;
const START = Date.UTC(2027, 0, 15, 8, 0, 0);
const SENSITIVE =
  'secret-token=abc123 sig=deadbeef /api/v1/media/leak.jpg?exp=1&sig=zzz';
const TOKEN = 'test-access-token';

function uuid(prefix: number, value: number): string {
  return `${String(prefix).padStart(8, '0')}-0000-4000-8000-${String(
    value,
  ).padStart(12, '0')}`;
}

const JOB_1 = uuid(1, 1);
const JOB_2 = uuid(1, 2);
const P1 = uuid(2, 1);
const P2 = uuid(2, 2);
const CR1 = uuid(3, 1);
const CR2 = uuid(3, 2);
const ITEM_1 = uuid(4, 1);
const ITEM_2 = uuid(4, 2);
const MECHANIC = uuid(5, 1);

const NOTE_FORWARD = 'Please approve';
const NOTE_RETURN = 'Add photos';
const NOTE_RELEASE = 'Go ahead';
const NOTE_CR_FORWARD = 'Fine by us';
const NOTE_CR_DECLINE = 'Not possible';

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

function item2(status = 'Approved'): RepairItemDto {
  return makeItem(ITEM_2, {
    title: 'Brake labour',
    kind: 'Labour',
    qty: 1,
    unitPrice: 500,
    amount: 500,
    status,
  });
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
    managerNote: null,
    customerNote: 'Customer private note',
    submittedAt: '2027-01-15T08:00:00Z',
    publishedAt: null,
    respondedAt: null,
    releasedAt: null,
    total: 3501,
    approvedTotal: 500,
    items: [makeItem(ITEM_1), item2()],
    audit: [
      {
        actorRole: 'Mechanic',
        action: 'Submitted',
        detail: null,
        at: '2027-01-15T08:00:00Z',
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
    readonly timelineEntries?: number;
  } = {},
): JobDetailDto {
  return {
    job: makeJobSummary(jobId, options.status ?? 'AwaitingManagerReview'),
    timeline: Array.from({ length: options.timelineEntries ?? 0 }, (_, i) => ({
      stage: i === 0 ? 'Approved work' : `Stage ${i}`,
      message: 'Progress entry',
      percent: 10 * (i + 1),
      actorRole: 'Manager',
      at: '2027-01-15T10:00:00Z',
    })),
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
    accessToken: TOKEN,
    expiresAt: Date.now() + lifetimeMs,
    user: {
      id: userId,
      displayName: 'Test Manager',
      email: 'manager@example.test',
      roles: ['Manager'],
    },
  };
}

function last<T>(items: readonly T[]): T {
  return items[items.length - 1];
}

function respond<T>(subject: Subject<T>, value: T): void {
  subject.next(value);
  subject.complete();
}

function apiError(
  status: number,
  code: ApiErrorCode,
  conflictCode?: BookingConflictCode,
  fixProofConflictCode?: FixProofConflictCode,
): ApiError {
  return new ApiError(
    status,
    code,
    SENSITIVE,
    conflictCode,
    fixProofConflictCode,
  );
}

type Entity = ProposalDto | ChangeRequestDto;

interface MutationCall {
  readonly method: string;
  readonly args: readonly unknown[];
  readonly subject: Subject<Entity>;
}

function createFakes() {
  const proposalCalls: Subject<readonly ProposalDto[]>[] = [];
  const changeCalls: Subject<readonly ChangeRequestDto[]>[] = [];
  const detailCalls: { id: string; subject: Subject<JobDetailDto> }[] = [];
  const mutationCalls: MutationCall[] = [];

  const fixProofApi = {
    getProposals: vi.fn(() => {
      const subject = new Subject<readonly ProposalDto[]>();
      proposalCalls.push(subject);
      return subject.asObservable();
    }),
    getChangeRequests: vi.fn(() => {
      const subject = new Subject<readonly ChangeRequestDto[]>();
      changeCalls.push(subject);
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

  function method(name: string) {
    return vi.fn((...args: unknown[]) => {
      const subject = new Subject<Entity>();
      mutationCalls.push({ method: name, args, subject });
      return subject.asObservable();
    });
  }

  const mutationApi = {
    setItemPrice: method('setItemPrice'),
    reviseItem: method('reviseItem'),
    forwardProposal: method('forwardProposal'),
    returnProposal: method('returnProposal'),
    releaseProposal: method('releaseProposal'),
    forwardChangeRequest: method('forwardChangeRequest'),
    declineChangeRequest: method('declineChangeRequest'),
  };

  return {
    fixProofApi,
    jobApi,
    mutationApi,
    proposalCalls,
    changeCalls,
    detailCalls,
    mutationCalls,
  };
}

interface Scenario {
  readonly name: string;
  readonly action: FixProofMutationAction;
  readonly method: string;
  readonly kind: 'proposal' | 'change-request';
  readonly entityId: string;
  readonly itemId: string | null;
  readonly note: string | null;
  readonly jobStatus: string;
  readonly afterJobStatus: string;
  readonly base: () => Entity;
  readonly changed: () => Entity;
  readonly success: () => Entity;
  readonly args: readonly unknown[];
  readonly invoke: () => FixProofMutationStartResult;
  readonly afterTimeline: number;
}

const PRICE_INPUT = { unitPrice: '1200.50', qty: '2' };
const PRICE_CANONICAL = { unitPrice: 1200.5, qty: 2 };

function audit(action: string) {
  return {
    actorRole: 'Manager',
    action,
    detail: null,
    at: '2027-01-15T10:00:00Z',
  };
}

function pendingProposal(overrides: Partial<ProposalDto> = {}): ProposalDto {
  return makeProposal(P1, JOB_1, overrides);
}

function publishedProposal(
  status: string,
  overrides: Partial<ProposalDto> = {},
): ProposalDto {
  return makeProposal(P1, JOB_1, {
    status,
    items: [
      makeItem(ITEM_1, { status: 'Approved' }),
      item2('Approved'),
    ],
    ...overrides,
  });
}

describe('FixProofMutationStateService', () => {
  let mutation: FixProofMutationStateService;
  let fixProof: FixProofStateService;
  let fake: ReturnType<typeof createFakes>;
  let session: SessionService;

  function tick(): void {
    TestBed.tick();
  }

  function detailOf(
    entity: Entity,
    jobStatus: string,
    timelineEntries = 0,
  ): JobDetailDto {
    return 'items' in entity
      ? makeDetail(entity.jobCardId, {
          status: jobStatus,
          proposals: [entity],
          timelineEntries,
        })
      : makeDetail(entity.jobCardId, {
          status: jobStatus,
          changeRequests: [entity],
          timelineEntries,
        });
  }

  function open(
    entity: Entity,
    jobStatus: string,
    extra = true,
  ): void {
    if ('items' in entity) {
      fixProof.refreshProposals();
      respond(
        last(fake.proposalCalls),
        extra ? [entity, makeProposal(P2, JOB_2)] : [entity],
      );
      fixProof.selectProposal(entity.id);
    } else {
      fixProof.refreshChangeRequests();
      respond(
        last(fake.changeCalls),
        extra ? [entity, makeChangeRequest(CR2, JOB_2)] : [entity],
      );
      fixProof.selectChangeRequest(entity.id);
    }

    respond(last(fake.detailCalls).subject, detailOf(entity, jobStatus));
    tick();
  }

  const scenarios: Scenario[] = [
    {
      name: 'set item price',
      action: 'set-price',
      method: 'setItemPrice',
      kind: 'proposal',
      entityId: P1,
      itemId: ITEM_1,
      note: null,
      jobStatus: 'AwaitingManagerReview',
      afterJobStatus: 'AwaitingManagerReview',
      base: () => pendingProposal(),
      changed: () =>
        pendingProposal({
          audit: [...pendingProposal().audit, audit('Other edit')],
        }),
      success: () =>
        pendingProposal({
          items: [
            makeItem(ITEM_1, { unitPrice: 1200.5, qty: 2, amount: 2401 }),
            item2(),
          ],
          total: 2901,
        }),
      args: [
        P1,
        ITEM_1,
        PRICE_CANONICAL,
        {
          proposalStatus: 'PendingManagerReview',
          itemStatus: 'Proposed',
          jobStatus: 'AwaitingManagerReview',
        },
      ],
      invoke: () => mutation.setItemPrice(P1, ITEM_1, PRICE_INPUT),
      afterTimeline: 0,
    },
    {
      name: 'revise repair item',
      action: 'revise',
      method: 'reviseItem',
      kind: 'proposal',
      entityId: P1,
      itemId: ITEM_1,
      note: null,
      jobStatus: 'AwaitingCustomerApproval',
      afterJobStatus: 'AwaitingCustomerApproval',
      base: () => publishedProposal('AwaitingCustomer'),
      changed: () =>
        publishedProposal('AwaitingCustomer', {
          items: [
            makeItem(ITEM_1, { status: 'Approved', version: 2 }),
            item2('Approved'),
          ],
        }),
      success: () =>
        publishedProposal('AwaitingCustomer', {
          items: [
            makeItem(ITEM_1, {
              status: 'Approved',
              unitPrice: 1200.5,
              qty: 2,
              amount: 2401,
              version: 2,
            }),
            item2('Approved'),
          ],
          total: 2901,
        }),
      args: [
        P1,
        ITEM_1,
        PRICE_CANONICAL,
        {
          proposalStatus: 'AwaitingCustomer',
          itemStatus: 'Approved',
          jobStatus: 'AwaitingCustomerApproval',
        },
      ],
      invoke: () => mutation.reviseItem(P1, ITEM_1, PRICE_INPUT),
      afterTimeline: 0,
    },
    {
      name: 'forward proposal',
      action: 'forward',
      method: 'forwardProposal',
      kind: 'proposal',
      entityId: P1,
      itemId: null,
      note: NOTE_FORWARD,
      jobStatus: 'AwaitingManagerReview',
      afterJobStatus: 'AwaitingCustomerApproval',
      base: () => pendingProposal(),
      changed: () =>
        pendingProposal({
          audit: [...pendingProposal().audit, audit('Other edit')],
        }),
      success: () =>
        pendingProposal({
          status: 'AwaitingCustomer',
          managerNote: NOTE_FORWARD,
          audit: [...pendingProposal().audit, audit('Sent to customer')],
        }),
      args: [
        P1,
        NOTE_FORWARD,
        {
          proposalStatus: 'PendingManagerReview',
          jobStatus: 'AwaitingManagerReview',
        },
      ],
      invoke: () => mutation.forwardProposal(P1, NOTE_FORWARD),
      afterTimeline: 0,
    },
    {
      name: 'return proposal',
      action: 'return',
      method: 'returnProposal',
      kind: 'proposal',
      entityId: P1,
      itemId: null,
      note: NOTE_RETURN,
      jobStatus: 'AwaitingManagerReview',
      afterJobStatus: 'Inspecting',
      base: () => pendingProposal(),
      changed: () =>
        pendingProposal({
          audit: [...pendingProposal().audit, audit('Other edit')],
        }),
      success: () =>
        pendingProposal({
          status: 'ReturnedToMechanic',
          managerNote: NOTE_RETURN,
          audit: [...pendingProposal().audit, audit('Returned to mechanic')],
        }),
      args: [
        P1,
        NOTE_RETURN,
        {
          proposalStatus: 'PendingManagerReview',
          jobStatus: 'AwaitingManagerReview',
        },
      ],
      invoke: () => mutation.returnProposal(P1, NOTE_RETURN),
      afterTimeline: 0,
    },
    {
      name: 'release proposal',
      action: 'release',
      method: 'releaseProposal',
      kind: 'proposal',
      entityId: P1,
      itemId: null,
      note: NOTE_RELEASE,
      jobStatus: 'AwaitingRelease',
      afterJobStatus: 'InProgress',
      base: () => publishedProposal('CustomerResponded'),
      changed: () =>
        publishedProposal('CustomerResponded', {
          audit: [...pendingProposal().audit, audit('Other edit')],
        }),
      success: () =>
        publishedProposal('ReleasedToMechanic', {
          managerNote: NOTE_RELEASE,
          releasedAt: '2027-01-15T10:00:00Z',
          items: [
            makeItem(ITEM_1, { status: 'Released' }),
            item2('Released'),
          ],
          audit: [...pendingProposal().audit, audit('Released to mechanic')],
        }),
      args: [
        P1,
        NOTE_RELEASE,
        {
          proposalStatus: 'CustomerResponded',
          jobStatus: 'AwaitingRelease',
        },
      ],
      invoke: () => mutation.releaseProposal(P1, NOTE_RELEASE),
      afterTimeline: 1,
    },
    {
      name: 'forward change request',
      action: 'forward-change-request',
      method: 'forwardChangeRequest',
      kind: 'change-request',
      entityId: CR1,
      itemId: null,
      note: NOTE_CR_FORWARD,
      jobStatus: 'InProgress',
      afterJobStatus: 'InProgress',
      base: () => makeChangeRequest(CR1, JOB_1),
      changed: () =>
        makeChangeRequest(CR1, JOB_1, { details: 'Edited by someone' }),
      success: () =>
        makeChangeRequest(CR1, JOB_1, {
          status: 'ForwardedToMechanic',
          managerNote: NOTE_CR_FORWARD,
        }),
      args: [
        CR1,
        NOTE_CR_FORWARD,
        { changeRequestStatus: 'PendingManagerReview', jobStatus: 'InProgress' },
      ],
      invoke: () => mutation.forwardChangeRequest(CR1, NOTE_CR_FORWARD),
      afterTimeline: 0,
    },
    {
      name: 'decline change request',
      action: 'decline-change-request',
      method: 'declineChangeRequest',
      kind: 'change-request',
      entityId: CR1,
      itemId: null,
      note: NOTE_CR_DECLINE,
      jobStatus: 'InProgress',
      afterJobStatus: 'InProgress',
      base: () => makeChangeRequest(CR1, JOB_1),
      changed: () =>
        makeChangeRequest(CR1, JOB_1, { details: 'Edited by someone' }),
      success: () =>
        makeChangeRequest(CR1, JOB_1, {
          status: 'Declined',
          managerNote: NOTE_CR_DECLINE,
        }),
      args: [
        CR1,
        NOTE_CR_DECLINE,
        { changeRequestStatus: 'PendingManagerReview', jobStatus: 'InProgress' },
      ],
      invoke: () => mutation.declineChangeRequest(CR1, NOTE_CR_DECLINE),
      afterTimeline: 0,
    },
  ];

  function openScenario(s: Scenario): void {
    open(s.base(), s.jobStatus);
  }

  function answerPreflight(
    s: Scenario,
    entity: Entity = s.base(),
    jobStatus: string = s.jobStatus,
  ): void {
    respond(last(fake.detailCalls).subject, detailOf(entity, jobStatus));
  }

  /** Opens, starts and passes the preflight so the mutation is in flight. */
  function submit(s: Scenario): MutationCall {
    openScenario(s);
    expect(s.invoke()).toEqual({ started: true, reason: null });
    answerPreflight(s);

    return last(fake.mutationCalls);
  }

  function respondRefresh(s: Scenario, entity: Entity, jobStatus: string): void {
    if (s.kind === 'proposal') {
      respond(last(fake.proposalCalls), [entity as ProposalDto]);
    } else {
      respond(last(fake.changeCalls), [entity as ChangeRequestDto]);
    }

    respond(last(fake.detailCalls).subject, detailOf(entity, jobStatus));
    tick();
  }

  /** Mutation fails with an uncertain outcome; reconciliation read pending. */
  function makeUncertain(s: Scenario): void {
    submit(s);
    last(fake.mutationCalls).subject.error(apiError(500, 'SERVER_ERROR'));
  }

  function reconcileWith(entity: Entity, jobStatus: string, timeline = 0): void {
    respond(
      last(fake.detailCalls).subject,
      detailOf(entity, jobStatus, timeline),
    );
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);

    fake = createFakes();

    TestBed.configureTestingModule({
      providers: [
        FixProofStateService,
        FixProofMutationStateService,
        { provide: FixProofApiService, useValue: fake.fixProofApi },
        { provide: JobCardApiService, useValue: fake.jobApi },
        { provide: FixProofMutationApiService, useValue: fake.mutationApi },
      ],
    });

    session = TestBed.inject(SessionService);
    session.setSession(makeSession());
    fixProof = TestBed.inject(FixProofStateService);
    mutation = TestBed.inject(FixProofMutationStateService);
    tick();
  });

  afterEach(() => {
    mutation.ngOnDestroy();
    fixProof.ngOnDestroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('construction and scope', () => {
    it('K13-01 is feature scoped, not provided in root', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: FixProofApiService, useValue: fake.fixProofApi },
          { provide: JobCardApiService, useValue: fake.jobApi },
          { provide: FixProofMutationApiService, useValue: fake.mutationApi },
        ],
      });

      expect(() => TestBed.inject(FixProofMutationStateService)).toThrow();
    });

    it('K13-02 starts idle, sends nothing and starts no timer', () => {
      expect(mutation.phase()).toBe('idle');
      expect(mutation.result()).toBeNull();
      expect(mutation.operation()).toBeNull();
      expect(mutation.reconciliation()).toBeNull();
      expect(mutation.accessLoss()).toBeNull();
      expect(mutation.isBusy()).toBe(false);
      expect(mutation.hasUnresolvedOperation()).toBe(false);
      expect(mutation.canExecute()).toBe(false);
      expect(fake.jobApi.getJobCard).not.toHaveBeenCalled();
      expect(fake.mutationCalls).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('K13-03 exposes the documented time constant', () => {
      expect(FIXPROOF_MUTATION_STATE_CHECK_INTERVAL_MS).toBe(15_000);
    });
  });

  for (const s of scenarios) {
    describe(`${s.name}`, () => {
      it(`K13-10 ${s.name}: valid execution does a fresh preflight and then delegates exactly once to K10`, () => {
        openScenario(s);
        const readsBefore = fake.detailCalls.length;

        expect(s.invoke()).toEqual({ started: true, reason: null });
        expect(mutation.phase()).toBe('validating');
        expect(fake.detailCalls).toHaveLength(readsBefore + 1);
        expect(last(fake.detailCalls).id).toBe(JOB_1);
        expect(fake.mutationCalls).toHaveLength(0);
        expect(mutation.operation()?.dispatched).toBe(false);

        answerPreflight(s);

        expect(fake.mutationCalls).toHaveLength(1);
        expect(last(fake.mutationCalls).method).toBe(s.method);
        expect(last(fake.mutationCalls).args).toEqual(s.args);
        expect(mutation.phase()).toBe('submitting');
        expect(mutation.operation()).toMatchObject({
          action: s.action,
          kind: s.kind,
          entityId: s.entityId,
          jobCardId: JOB_1,
          itemId: s.itemId,
          dispatched: true,
          noteProvided: s.note !== null,
        });
      });

      it(`K13-11 ${s.name}: no optimistic update while the mutation is in flight`, () => {
        openScenario(s);
        const detailRef = fixProof.detail();
        const proposalsRef = fixProof.proposals();
        const changesRef = fixProof.changeRequests();

        s.invoke();
        answerPreflight(s);

        expect(mutation.phase()).toBe('submitting');
        expect(fixProof.detail()).toBe(detailRef);
        expect(fixProof.proposals()).toBe(proposalsRef);
        expect(fixProof.changeRequests()).toBe(changesRef);
      });

      it(`K13-12 ${s.name}: a validated response refreshes through K12 and ends succeeded with one mutation`, () => {
        const call = submit(s);
        const detailReads = fake.detailCalls.length;

        respond(call.subject, s.success());

        expect(mutation.phase()).toBe('refreshing');
        expect(mutation.result()?.status).toBe('succeeded');
        expect(mutation.result()?.dispatched).toBe(true);
        expect(fake.detailCalls).toHaveLength(detailReads + 1);
        expect(
          s.kind === 'proposal'
            ? fake.proposalCalls.length
            : fake.changeCalls.length,
        ).toBeGreaterThan(1);

        respondRefresh(s, s.success(), s.afterJobStatus);

        expect(mutation.phase()).toBe('succeeded');
        expect(mutation.result()).toMatchObject({
          status: 'succeeded',
          reviewRequired: false,
          potentiallyExecuted: false,
          confirmed: { entityStatus: s.success().status },
          refresh: {
            list: 'refreshed',
            detail: 'refreshed',
            selectionChanged: false,
            stateChangedSinceResponse: false,
          },
        });
        expect(fake.mutationCalls).toHaveLength(1);
        expect(mutation.isBusy()).toBe(false);
        expect(mutation.hasUnresolvedOperation()).toBe(false);
        expect(fixProof.selected()?.id).toBe(s.entityId);
      });

      it(`K13-13 ${s.name}: blocks and asks for review when the reviewed data changed before dispatch`, () => {
        openScenario(s);
        const readsBefore = fake.detailCalls.length;

        s.invoke();
        answerPreflight(s, s.changed());

        expect(fake.mutationCalls).toHaveLength(0);
        expect(mutation.phase()).toBe('rejected');
        expect(mutation.result()).toMatchObject({
          status: 'not-dispatched',
          dispatched: false,
          reason: 'review-required',
          reviewRequired: true,
        });
        expect(mutation.result()?.changedFields.length).toBeGreaterThan(0);
        expect(mutation.result()?.message).toContain('Nothing was sent');
        // The review state is refreshed (read only) - values are never rewritten.
        expect(fake.detailCalls).toHaveLength(readsBefore + 2);
        expect(mutation.operation()).toBeNull();
      });

      it(`K13-14 ${s.name}: blocks a terminal job found by the fresh preflight`, () => {
        openScenario(s);
        s.invoke();
        answerPreflight(s, s.base(), 'Completed');

        expect(fake.mutationCalls).toHaveLength(0);
        expect(mutation.result()).toMatchObject({
          status: 'not-dispatched',
          reason: 'eligibility-blocked',
          dispatched: false,
        });
        expect(mutation.result()?.eligibility?.frontendAllowed).toBe(false);
      });

      it(`K13-15 ${s.name}: blocks an unknown job status found by the fresh preflight`, () => {
        openScenario(s);
        s.invoke();
        answerPreflight(s, s.base(), 'SomethingNew');

        expect(fake.mutationCalls).toHaveLength(0);
        expect(mutation.result()).toMatchObject({
          status: 'not-dispatched',
          reason: 'eligibility-blocked',
        });
        expect(mutation.result()?.eligibility?.status).toBe('unresolved');
      });

      it(`K13-16 ${s.name}: eligibility uses the fresh job status, not the proposal status`, () => {
        openScenario(s);
        s.invoke();
        answerPreflight(s, s.base(), 'Closed');

        expect(mutation.result()?.reason).toBe('eligibility-blocked');
        expect(fake.mutationCalls).toHaveLength(0);
      });

      it(`K13-17 ${s.name}: duplicate submissions during preflight and mutation are refused`, () => {
        openScenario(s);
        const readsBefore = fake.detailCalls.length;

        expect(s.invoke().started).toBe(true);
        expect(s.invoke()).toEqual({ started: false, reason: 'busy' });
        expect(fake.detailCalls).toHaveLength(readsBefore + 1);

        answerPreflight(s);

        expect(s.invoke()).toEqual({ started: false, reason: 'busy' });
        expect(fake.mutationCalls).toHaveLength(1);
        expect(mutation.canExecute()).toBe(false);
      });

      it(`K13-18 ${s.name}: a conflicting action from another lane is refused while busy`, () => {
        openScenario(s);
        s.invoke();

        const other = scenarios.find(c => c.action !== s.action) as Scenario;

        expect(other.invoke()).toEqual({ started: false, reason: 'busy' });
        expect(fake.mutationCalls).toHaveLength(0);
      });

      it(`K13-19 ${s.name}: a changed selection before dispatch blocks without sending`, () => {
        openScenario(s);
        s.invoke();
        const preflight = last(fake.detailCalls);

        if (s.kind === 'proposal') {
          fixProof.selectProposal(P2);
        } else {
          fixProof.selectChangeRequest(CR2);
        }

        respond(preflight.subject, detailOf(s.base(), s.jobStatus));

        expect(fake.mutationCalls).toHaveLength(0);
        expect(mutation.result()).toMatchObject({
          status: 'not-dispatched',
          reason: 'selection-changed',
          dispatched: false,
        });
      });

      it(`K13-20 ${s.name}: a changed selection after dispatch keeps the original operation and skips the detail refresh`, () => {
        const call = submit(s);

        if (s.kind === 'proposal') {
          fixProof.selectProposal(P2);
        } else {
          fixProof.selectChangeRequest(CR2);
        }

        expect(call.subject.observed).toBe(true);
        expect(mutation.phase()).toBe('submitting');
        expect(mutation.selectionDiffersFromOperation()).toBe(true);

        respond(call.subject, s.success());

        expect(mutation.result()?.status).toBe('succeeded');

        if (s.kind === 'proposal') {
          respond(last(fake.proposalCalls), [s.success() as ProposalDto]);
        } else {
          respond(last(fake.changeCalls), [s.success() as ChangeRequestDto]);
        }

        tick();

        expect(mutation.phase()).toBe('succeeded');
        expect(mutation.result()?.refresh).toMatchObject({
          list: 'refreshed',
          detail: 'skipped',
          selectionChanged: true,
        });
        expect(fixProof.selected()?.id).not.toBe(s.entityId);
      });

      it(`K13-21 ${s.name}: a response for a different entity is uncertain, never success`, () => {
        const call = submit(s);
        const wrong = {
          ...s.success(),
          id: s.kind === 'proposal' ? P2 : CR2,
        } as Entity;

        respond(call.subject, wrong);

        expect(mutation.phase()).toBe('uncertain');
        expect(mutation.result()).toMatchObject({
          status: 'uncertain',
          dispatched: true,
          errorKind: 'invalid-response',
          potentiallyExecuted: true,
        });
      });

      it(`K13-22 ${s.name}: a response for a different job is uncertain`, () => {
        const call = submit(s);

        respond(call.subject, { ...s.success(), jobCardId: JOB_2 } as Entity);

        expect(mutation.phase()).toBe('uncertain');
        expect(mutation.result()?.status).toBe('uncertain');
      });

      it(`K13-23 ${s.name}: an empty completion after dispatch is uncertain`, () => {
        const call = submit(s);

        call.subject.complete();

        expect(mutation.phase()).toBe('uncertain');
        expect(mutation.result()).toMatchObject({
          status: 'uncertain',
          errorKind: 'invalid-response',
        });
      });

      it(`K13-24 ${s.name}: an invalid response error from K10 is uncertain`, () => {
        const call = submit(s);

        call.subject.error(new FixProofResponseError('status'));

        expect(mutation.result()).toMatchObject({
          status: 'uncertain',
          errorKind: 'invalid-response',
        });
      });

      it(`K13-25 ${s.name}: HTTP 500 is uncertain, reconciles read-only and never replays`, () => {
        const call = submit(s);
        const readsBefore = fake.detailCalls.length;

        call.subject.error(apiError(500, 'SERVER_ERROR'));

        expect(mutation.phase()).toBe('uncertain');
        expect(mutation.result()).toMatchObject({
          status: 'uncertain',
          errorKind: 'server-failure',
          potentiallyExecuted: true,
        });
        expect(mutation.reconciliation()?.state).toBe('reading');
        expect(fake.detailCalls).toHaveLength(readsBefore + 1);
        expect(last(fake.detailCalls).id).toBe(JOB_1);
        expect(fake.mutationCalls).toHaveLength(1);
      });

      it(`K13-26 ${s.name}: a network failure is uncertain`, () => {
        const call = submit(s);

        call.subject.error(apiError(0, 'NETWORK_ERROR'));

        expect(mutation.phase()).toBe('uncertain');
        expect(mutation.result()?.errorKind).toBe('network-failure');
      });

      it(`K13-27 ${s.name}: an unknown error after dispatch is uncertain`, () => {
        const call = submit(s);

        call.subject.error(new Error(SENSITIVE));

        expect(mutation.result()).toMatchObject({
          status: 'uncertain',
          errorKind: 'unknown',
        });
        expect(JSON.stringify(mutation.result())).not.toContain('secret-token');
      });

      it(`K13-28 ${s.name}: an unresolved outcome blocks every new mutation`, () => {
        makeUncertain(s);

        for (const other of scenarios) {
          expect(other.invoke()).toEqual({
            started: false,
            reason: 'unresolved-operation',
          });
        }

        expect(fake.mutationCalls).toHaveLength(1);
        expect(mutation.canExecute()).toBe(false);
      });

      it(`K13-29 ${s.name}: reconciliation reports a consistent observation without claiming proof`, () => {
        makeUncertain(s);
        reconcileWith(s.success(), s.afterJobStatus, s.afterTimeline);

        const rec = mutation.reconciliation();

        expect(mutation.phase()).toBe('reconciliation-required');
        expect(rec?.state).toBe('complete');
        expect(rec?.observation).toBe('consistent');
        expect(rec?.definitive).toBe(false);
        expect(rec?.evidence.length).toBeGreaterThan(0);
        expect(rec?.warnings.map(w => w.code)).toContain(
          'not-proof-of-this-request',
        );
        expect(mutation.result()?.status).toBe('uncertain');
        expect(fake.mutationCalls).toHaveLength(1);
      });

      it(`K13-30 ${s.name}: an unchanged state is inconsistent but never proves the request cannot run later`, () => {
        makeUncertain(s);
        reconcileWith(s.base(), s.jobStatus);

        const rec = mutation.reconciliation();

        expect(rec?.observation).toBe('inconsistent');
        expect(rec?.definitive).toBe(false);
        expect(rec?.warnings.map(w => w.code)).toContain(
          'may-still-execute-later',
        );
        expect(mutation.hasUnresolvedOperation()).toBe(true);
        expect(mutation.result()?.status).toBe('uncertain');
      });

      it(`K13-31 ${s.name}: a missing original entity is entity-unavailable`, () => {
        makeUncertain(s);
        respond(last(fake.detailCalls).subject, makeDetail(JOB_1));

        expect(mutation.reconciliation()?.observation).toBe(
          'entity-unavailable',
        );
        expect(mutation.hasUnresolvedOperation()).toBe(true);
      });

      it(`K13-32 ${s.name}: a missing original job (404) is entity-unavailable`, () => {
        makeUncertain(s);
        last(fake.detailCalls).subject.error(apiError(404, 'NOT_FOUND'));

        expect(mutation.reconciliation()?.observation).toBe(
          'entity-unavailable',
        );
      });

      it(`K13-33 ${s.name}: a failed reconciliation read stays unresolved`, () => {
        makeUncertain(s);
        last(fake.detailCalls).subject.error(apiError(500, 'SERVER_ERROR'));

        const rec = mutation.reconciliation();

        expect(rec?.observation).toBe('read-failed');
        expect(rec?.warnings.map(w => w.code)).toContain('outcome-unresolved');
        expect(mutation.phase()).toBe('reconciliation-required');
        expect(mutation.hasUnresolvedOperation()).toBe(true);
        expect(JSON.stringify(rec)).not.toContain('secret-token');
      });

      it(`K13-34 ${s.name}: a job identity mismatch during reconciliation is unresolved`, () => {
        makeUncertain(s);
        respond(
          last(fake.detailCalls).subject,
          makeDetail(JOB_2, {
            proposals: s.kind === 'proposal' ? [s.success() as ProposalDto] : [],
            changeRequests:
              s.kind === 'change-request'
                ? [s.success() as ChangeRequestDto]
                : [],
          }),
        );

        expect(mutation.reconciliation()?.observation).toBe('unresolved');
      });

      it(`K13-35 ${s.name}: manual reconciliation is read-only, deduplicated and never unlocks`, () => {
        makeUncertain(s);
        reconcileWith(s.success(), s.afterJobStatus, s.afterTimeline);

        const readsBefore = fake.detailCalls.length;

        expect(mutation.reconcile()).toBe(true);
        expect(mutation.reconcile()).toBe(false);
        expect(fake.detailCalls).toHaveLength(readsBefore + 1);
        expect(mutation.reconciliation()?.state).toBe('reading');
        expect(mutation.reconciliation()?.attempts).toBe(2);

        reconcileWith(s.success(), s.afterJobStatus, s.afterTimeline);

        expect(mutation.reconciliation()?.state).toBe('complete');
        expect(mutation.hasUnresolvedOperation()).toBe(true);
        expect(mutation.canExecute()).toBe(false);
        expect(fake.mutationCalls).toHaveLength(1);
      });

      it(`K13-36 ${s.name}: acknowledgement needs review and a finished reconciliation and is not proof`, () => {
        makeUncertain(s);

        expect(mutation.acknowledge({ reviewed: true })).toEqual({
          acknowledged: false,
          reason: 'reconciliation-in-progress',
        });

        reconcileWith(s.base(), s.jobStatus);

        expect(mutation.acknowledge({ reviewed: false })).toEqual({
          acknowledged: false,
          reason: 'review-required',
        });
        expect(mutation.hasUnresolvedOperation()).toBe(true);

        expect(mutation.acknowledge({ reviewed: true })).toEqual({
          acknowledged: true,
          reason: null,
        });
        expect(mutation.phase()).toBe('idle');
        expect(mutation.hasUnresolvedOperation()).toBe(false);
        expect(mutation.operation()).toBeNull();
        expect(mutation.lastAcknowledgement()).toMatchObject({
          action: s.action,
          observation: 'inconsistent',
          proofOfOutcome: 'none',
        });
        expect(fake.mutationCalls).toHaveLength(1);
      });

      it(`K13-37 ${s.name}: an unresolved outcome survives selection, filter and list refresh changes`, () => {
        makeUncertain(s);
        reconcileWith(s.success(), s.afterJobStatus, s.afterTimeline);

        if (s.kind === 'proposal') {
          fixProof.selectProposal(P2);
          fixProof.setProposalStatusFilter('Cancelled');
        } else {
          fixProof.selectChangeRequest(CR2);
          fixProof.setPendingOnly(true);
        }

        fixProof.clearSelection();
        fixProof.refreshProposals();
        fixProof.refreshChangeRequests();
        tick();

        expect(mutation.phase()).toBe('reconciliation-required');
        expect(mutation.hasUnresolvedOperation()).toBe(true);
        expect(mutation.operation()?.entityId).toBe(s.entityId);
        expect(mutation.reconciliation()?.observation).toBe('consistent');
        expect(s.invoke()).toEqual({
          started: false,
          reason: 'unresolved-operation',
        });
      });

      it(`K13-38 ${s.name}: session expiry during the mutation reports potential execution and cancels`, () => {
        const call = submit(s);

        session.clearSession();
        tick();

        expect(call.subject.observed).toBe(false);
        expect(mutation.phase()).toBe('access-lost');
        expect(mutation.accessLoss()).toEqual({
          action: s.action,
          potentiallyExecuted: true,
          mutationConfirmed: false,
        });
        expect(mutation.result()).toMatchObject({
          status: 'access-lost',
          potentiallyExecuted: true,
        });
        expect(mutation.operation()).toBeNull();
        expect(mutation.reconciliation()).toBeNull();
        expect(mutation.hasUnresolvedOperation()).toBe(true);

        const proposalReads = fake.proposalCalls.length;

        call.subject.next(s.success());
        call.subject.complete();

        expect(mutation.phase()).toBe('access-lost');
        expect(fake.proposalCalls).toHaveLength(proposalReads);
        expect(mutation.result()?.status).toBe('access-lost');
      });

      it(`K13-39 ${s.name}: session replacement during reconciliation never reconciles for another user`, () => {
        makeUncertain(s);
        const pending = last(fake.detailCalls);

        session.setSession(makeSession('manager-002'));
        tick();

        expect(pending.subject.observed).toBe(false);
        expect(mutation.phase()).toBe('access-lost');
        expect(mutation.accessLoss()?.potentiallyExecuted).toBe(true);
        expect(mutation.reconciliation()).toBeNull();

        respond(pending.subject, detailOf(s.success(), s.afterJobStatus));

        expect(mutation.reconciliation()).toBeNull();
        expect(mutation.reconcile()).toBe(false);
        expect(mutation.operation()).toBeNull();
      });

      it(`K13-40 ${s.name}: session loss during preflight blocks dispatch and is not potential execution`, () => {
        openScenario(s);
        s.invoke();
        const pending = last(fake.detailCalls);

        session.clearSession();
        tick();

        expect(pending.subject.observed).toBe(false);
        expect(mutation.phase()).toBe('access-lost');
        expect(mutation.accessLoss()?.potentiallyExecuted).toBe(false);
        expect(mutation.hasUnresolvedOperation()).toBe(false);

        respond(pending.subject, detailOf(s.base(), s.jobStatus));

        expect(fake.mutationCalls).toHaveLength(0);
      });

      it(`K13-41 ${s.name}: destroy cancels in-flight work, clears state and stops the timer`, () => {
        openScenario(s);
        const timersBefore = vi.getTimerCount();

        s.invoke();
        answerPreflight(s);
        const call = last(fake.mutationCalls);

        expect(vi.getTimerCount()).toBe(timersBefore + 1);

        mutation.ngOnDestroy();

        expect(call.subject.observed).toBe(false);
        expect(mutation.phase()).toBe('idle');
        expect(mutation.operation()).toBeNull();
        expect(vi.getTimerCount()).toBe(timersBefore);
        expect(s.invoke()).toEqual({ started: false, reason: 'destroyed' });
        expect(mutation.reconcile()).toBe(false);
        expect(mutation.acknowledge({ reviewed: true }).reason).toBe(
          'destroyed',
        );

        const proposalReads = fake.proposalCalls.length;
        call.subject.next(s.success());
        expect(fake.proposalCalls).toHaveLength(proposalReads);
      });
    });
  }

  describe('input validation and gating (no mutation dispatched)', () => {
    function expectNotDispatched(
      result: FixProofMutationStartResult,
      reason: string,
    ): void {
      expect(result).toEqual({ started: false, reason: 'not-dispatched' });
      expect(mutation.result()).toMatchObject({
        status: 'not-dispatched',
        dispatched: false,
        reason,
      });
      expect(mutation.result()?.message).toContain('Nothing was sent');
      expect(mutation.phase()).toBe('rejected');
      expect(fake.mutationCalls).toHaveLength(0);
    }

    it.each([
      ['malformed proposal id', () => mutation.forwardProposal('nope')],
      ['non-string proposal id', () => mutation.forwardProposal(5 as never)],
      [
        'malformed item id',
        () => mutation.setItemPrice(P1, 'nope', PRICE_INPUT),
      ],
      [
        'negative price',
        () => mutation.setItemPrice(P1, ITEM_1, { unitPrice: '-1', qty: '2' }),
      ],
      [
        'non numeric price',
        () => mutation.setItemPrice(P1, ITEM_1, { unitPrice: 'abc', qty: '2' }),
      ],
      [
        'three decimal price',
        () => mutation.reviseItem(P1, ITEM_1, { unitPrice: '1.234', qty: '2' }),
      ],
      [
        'zero quantity',
        () => mutation.setItemPrice(P1, ITEM_1, { unitPrice: '1', qty: '0' }),
      ],
      [
        'fractional quantity',
        () => mutation.setItemPrice(P1, ITEM_1, { unitPrice: '1', qty: '1.5' }),
      ],
      ['missing return note', () => mutation.returnProposal(P1, '')],
      ['blank return note', () => mutation.returnProposal(P1, '    ')],
      [
        'null return note',
        () => mutation.returnProposal(P1, null as never),
      ],
      ['missing decline reason', () => mutation.declineChangeRequest(CR1, '')],
      [
        'blank decline reason',
        () => mutation.declineChangeRequest(CR1, '   '),
      ],
      [
        'non string forward note',
        () => mutation.forwardProposal(P1, 12 as never),
      ],
    ])('K13-50 rejects %s before any request is made', (_name, invoke) => {
      open(pendingProposal(), 'AwaitingManagerReview');
      open(makeChangeRequest(CR1, JOB_1), 'InProgress');
      const readsBefore = fake.detailCalls.length;

      const result = invoke();

      expectNotDispatched(result, 'invalid-input');
      expect(fake.detailCalls).toHaveLength(readsBefore);
      expect(mutation.operation()).toBeNull();
    });

    it('K13-51 trims notes, drops blank optional notes and passes validated values to K10', () => {
      open(pendingProposal(), 'AwaitingManagerReview');

      mutation.forwardProposal(P1, '  Please approve  ');
      answerPreflight(scenarios[2]);

      expect(last(fake.mutationCalls).args[1]).toBe('Please approve');
    });

    it('K13-52 a blank optional note is sent as null', () => {
      open(pendingProposal(), 'AwaitingManagerReview');

      mutation.forwardProposal(P1, '   ');
      answerPreflight(scenarios[2]);

      expect(last(fake.mutationCalls).args[1]).toBeNull();
      expect(mutation.operation()?.noteProvided).toBe(false);
    });

    it('K13-53 refuses when nothing is selected', () => {
      expectNotDispatched(mutation.forwardProposal(P1), 'selection-mismatch');
    });

    it('K13-54 refuses an id that differs from the selected record', () => {
      open(pendingProposal(), 'AwaitingManagerReview');

      expectNotDispatched(mutation.forwardProposal(P2), 'selection-mismatch');
    });

    it('K13-55 refuses a change request action for a selected proposal and vice versa', () => {
      open(pendingProposal(), 'AwaitingManagerReview');

      expectNotDispatched(
        mutation.forwardChangeRequest(CR1),
        'selection-mismatch',
      );
    });

    it('K13-56 refuses an item id that is not part of the selected proposal', () => {
      open(pendingProposal(), 'AwaitingManagerReview');

      const result = mutation.setItemPrice(P1, uuid(4, 99), PRICE_INPUT);

      expect(result.started).toBe(false);
      expect(mutation.result()?.status).toBe('not-dispatched');
      expect(fake.mutationCalls).toHaveLength(0);
    });

    it('K13-57 refuses while the selected detail is still loading', () => {
      fixProof.refreshProposals();
      respond(last(fake.proposalCalls), [pendingProposal()]);
      fixProof.selectProposal(P1);

      expectNotDispatched(mutation.forwardProposal(P1), 'selection-unresolved');
    });

    it('K13-58 refuses when the selected entity is missing from the job detail', () => {
      fixProof.refreshProposals();
      respond(last(fake.proposalCalls), [pendingProposal()]);
      fixProof.selectProposal(P1);
      respond(last(fake.detailCalls).subject, makeDetail(JOB_1));
      tick();

      expectNotDispatched(mutation.forwardProposal(P1), 'selection-unresolved');
    });

    it('K13-59 refuses when the detail refresh failed and the data is stale', () => {
      open(pendingProposal(), 'AwaitingManagerReview');
      fixProof.refreshDetail();
      last(fake.detailCalls).subject.error(apiError(500, 'SERVER_ERROR'));
      tick();

      const result = mutation.forwardProposal(P1);

      expect(result).toEqual({ started: false, reason: 'not-dispatched' });
      expect(mutation.result()?.status).toBe('not-dispatched');
      expect(fake.mutationCalls).toHaveLength(0);
    });

    it('K13-60 blocks an action the proposal status does not allow', () => {
      open(publishedProposal('AwaitingCustomer'), 'AwaitingCustomerApproval');

      expectNotDispatched(mutation.forwardProposal(P1), 'eligibility-blocked');
      expect(mutation.result()?.eligibility?.status).toBe(
        'blocked-by-backend',
      );
    });

    it('K13-61 blocks revising items of a released proposal', () => {
      open(publishedProposal('ReleasedToMechanic'), 'InProgress');

      expectNotDispatched(
        mutation.reviseItem(P1, ITEM_1, PRICE_INPUT),
        'eligibility-blocked',
      );
      expect(mutation.result()?.eligibility?.status).toBe(
        'blocked-by-frontend-safety',
      );
    });

    it('K13-62 blocks revising a released item', () => {
      open(
        publishedProposal('CustomerResponded', {
          items: [makeItem(ITEM_1, { status: 'Released' }), item2('Approved')],
        }),
        'AwaitingRelease',
      );

      expectNotDispatched(
        mutation.reviseItem(P1, ITEM_1, PRICE_INPUT),
        'eligibility-blocked',
      );
    });

    it('K13-63 blocks actions on terminal jobs known to K12', () => {
      open(pendingProposal(), 'Completed');

      expectNotDispatched(mutation.forwardProposal(P1), 'eligibility-blocked');
    });

    it('K13-64 blocks actions on jobs with an unknown status known to K12', () => {
      open(pendingProposal(), 'SomethingNew');

      expectNotDispatched(mutation.forwardProposal(P1), 'eligibility-blocked');
    });

    it('K13-65 blocks a non pending change request', () => {
      open(
        makeChangeRequest(CR1, JOB_1, { status: 'ForwardedToMechanic' }),
        'InProgress',
      );

      expectNotDispatched(
        mutation.declineChangeRequest(CR1, NOTE_CR_DECLINE),
        'eligibility-blocked',
      );
    });

    it('K13-66 a gated attempt can be replaced by a later valid attempt', () => {
      open(pendingProposal(), 'AwaitingManagerReview');
      mutation.returnProposal(P1, '');

      expect(mutation.phase()).toBe('rejected');

      expect(mutation.returnProposal(P1, NOTE_RETURN).started).toBe(true);
      expect(mutation.phase()).toBe('validating');
      expect(mutation.result()).toBeNull();
    });

    it('K13-67 without a session nothing is sent and access loss is reported', () => {
      open(pendingProposal(), 'AwaitingManagerReview');
      session.clearSession();

      const result = mutation.forwardProposal(P1);

      expect(result).toEqual({ started: false, reason: 'session-invalid' });
      expect(mutation.phase()).toBe('access-lost');
      expect(mutation.accessLoss()?.potentiallyExecuted).toBe(false);
      expect(mutation.hasUnresolvedOperation()).toBe(false);
      expect(fake.mutationCalls).toHaveLength(0);
    });

    it('K13-68 a preflight identity mismatch for the job blocks dispatch', () => {
      open(pendingProposal(), 'AwaitingManagerReview');
      mutation.forwardProposal(P1);
      respond(
        last(fake.detailCalls).subject,
        makeDetail(JOB_2, { proposals: [pendingProposal()] }),
      );

      expect(mutation.result()?.reason).toBe('job-identity-mismatch');
      expect(fake.mutationCalls).toHaveLength(0);
    });

    it('K13-69 a preflight detail without the entity blocks dispatch', () => {
      open(pendingProposal(), 'AwaitingManagerReview');
      mutation.forwardProposal(P1);
      respond(last(fake.detailCalls).subject, makeDetail(JOB_1));

      expect(mutation.result()?.reason).toBe('entity-unresolved');
      expect(fake.mutationCalls).toHaveLength(0);
    });

    it('K13-70 a preflight detail with a nested entity of another job blocks dispatch', () => {
      open(pendingProposal(), 'AwaitingManagerReview');
      mutation.forwardProposal(P1);
      respond(
        last(fake.detailCalls).subject,
        makeDetail(JOB_1, {
          proposals: [makeProposal(P1, JOB_2)],
        }),
      );

      expect(mutation.result()?.reason).toBe('entity-unresolved');
      expect(fake.mutationCalls).toHaveLength(0);
    });

    it('K13-71 a preflight detail without the target item blocks dispatch', () => {
      open(pendingProposal(), 'AwaitingManagerReview');
      mutation.setItemPrice(P1, ITEM_1, PRICE_INPUT);
      respond(
        last(fake.detailCalls).subject,
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          proposals: [pendingProposal({ items: [item2()] })],
        }),
      );

      expect(mutation.result()?.reason).toBe('entity-unresolved');
      expect(fake.mutationCalls).toHaveLength(0);
    });

    it('K13-72 an item version change blocks set price and asks for renewed review', () => {
      open(publishedProposal('AwaitingCustomer'), 'AwaitingCustomerApproval');
      mutation.reviseItem(P1, ITEM_1, PRICE_INPUT);
      answerPreflight(
        scenarios[1],
        publishedProposal('AwaitingCustomer', {
          items: [
            makeItem(ITEM_1, { status: 'Approved', version: 5 }),
            item2('Approved'),
          ],
        }),
      );

      expect(mutation.result()).toMatchObject({
        reason: 'review-required',
        dispatched: false,
      });
      expect(mutation.result()?.changedFields).toContain('item-version');
      expect(fake.mutationCalls).toHaveLength(0);
    });

    it('K13-73 price, quantity and status changes are reported with the changed fields', () => {
      open(pendingProposal(), 'AwaitingManagerReview');
      mutation.setItemPrice(P1, ITEM_1, PRICE_INPUT);
      answerPreflight(
        scenarios[0],
        pendingProposal({
          items: [
            makeItem(ITEM_1, {
              unitPrice: 9,
              qty: 3,
              amount: 27,
              status: 'Priced',
            }),
            item2(),
          ],
        }),
      );

      expect(mutation.result()?.changedFields).toEqual(
        expect.arrayContaining([
          'item-price',
          'item-quantity',
          'item-amount',
          'item-status',
        ]),
      );
      expect(fake.mutationCalls).toHaveLength(0);
    });

    it('K13-74 a proposal status change and job status change are detected', () => {
      open(pendingProposal(), 'AwaitingManagerReview');
      mutation.forwardProposal(P1);
      answerPreflight(
        scenarios[2],
        pendingProposal({ status: 'Cancelled' }),
        'InProgress',
      );

      expect(mutation.result()?.changedFields).toEqual(
        expect.arrayContaining(['proposal-status', 'job-status']),
      );
    });

    it('K13-75 the user values are never changed by a blocked preflight', () => {
      open(pendingProposal(), 'AwaitingManagerReview');
      mutation.setItemPrice(P1, ITEM_1, PRICE_INPUT);
      answerPreflight(scenarios[0], scenarios[0].changed());

      expect(JSON.stringify(mutation.result())).not.toContain('1200');
      expect(fake.mutationApi.setItemPrice).not.toHaveBeenCalled();
    });

    it('K13-76 a K10 refusal before the request is treated as not dispatched', () => {
      open(pendingProposal(), 'AwaitingManagerReview');
      mutation.forwardProposal(P1);
      fake.mutationApi.forwardProposal.mockImplementationOnce(() => {
        throw new FixProofRequestError('note');
      });
      answerPreflight(scenarios[2]);

      expect(mutation.result()).toMatchObject({
        status: 'not-dispatched',
        dispatched: false,
        reason: 'refused-by-api-gate',
      });
      expect(mutation.operation()).toBeNull();
    });

    it('K13-77 a K10 blocked-action error is treated as not dispatched', () => {
      open(pendingProposal(), 'AwaitingManagerReview');
      mutation.forwardProposal(P1);
      const call = (() => {
        answerPreflight(scenarios[2]);
        return last(fake.mutationCalls);
      })();

      expect(call.subject.observed).toBe(true);

      call.subject.error(
        new FixProofActionBlockedError('forward', {
          backendSupported: true,
          frontendAllowed: false,
          status: 'blocked-by-frontend-safety',
          reason: 'terminal-job-status',
          message: 'blocked',
        }),
      );

      expect(mutation.result()).toMatchObject({
        status: 'not-dispatched',
        dispatched: false,
        reason: 'refused-by-api-gate',
      });
      expect(mutation.result()?.eligibility?.reason).toBe(
        'terminal-job-status',
      );
    });

    it('K13-78 a preflight read failure is not dispatched and says so', () => {
      open(pendingProposal(), 'AwaitingManagerReview');
      mutation.forwardProposal(P1);
      last(fake.detailCalls).subject.error(apiError(500, 'SERVER_ERROR'));

      expect(mutation.result()).toMatchObject({
        status: 'not-dispatched',
        reason: 'preflight-read-failed',
        dispatched: false,
      });
      expect(mutation.result()?.message).toContain('Nothing was sent');
      expect(fake.mutationCalls).toHaveLength(0);
    });

    it('K13-79 a preflight 404 for the job is reported as job not found', () => {
      open(pendingProposal(), 'AwaitingManagerReview');
      mutation.forwardProposal(P1);
      last(fake.detailCalls).subject.error(apiError(404, 'NOT_FOUND'));

      expect(mutation.result()?.reason).toBe('job-not-found');
      expect(fake.mutationCalls).toHaveLength(0);
    });

    it('K13-80 a preflight 401 is access loss without dispatch', () => {
      open(pendingProposal(), 'AwaitingManagerReview');
      mutation.forwardProposal(P1);
      last(fake.detailCalls).subject.error(apiError(401, 'UNAUTHORIZED'));

      expect(mutation.phase()).toBe('access-lost');
      expect(mutation.accessLoss()?.potentiallyExecuted).toBe(false);
      expect(fake.mutationCalls).toHaveLength(0);
    });
  });

  describe('rejected outcomes', () => {
    const FAILURES: readonly (readonly [
      string,
      () => ApiError,
      string,
    ])[] = [
      ['HTTP 400', () => apiError(400, 'BAD_REQUEST'), 'invalid-request'],
      ['HTTP 404', () => apiError(404, 'NOT_FOUND'), 'not-found'],
      ['HTTP 409', () => apiError(409, 'CONFLICT'), 'conflict'],
      [
        '409 proposal_wrong_state',
        () => apiError(409, 'CONFLICT', undefined, 'proposal_wrong_state'),
        'proposal-wrong-state',
      ],
      [
        '409 proposal_not_published',
        () => apiError(409, 'CONFLICT', undefined, 'proposal_not_published'),
        'proposal-not-published',
      ],
      [
        '409 change_wrong_state',
        () => apiError(409, 'CONFLICT', undefined, 'change_wrong_state'),
        'change-wrong-state',
      ],
      [
        '409 concurrency_conflict',
        () => apiError(409, 'CONFLICT', 'concurrency_conflict'),
        'concurrency-conflict',
      ],
      [
        'HTTP 422',
        () => apiError(422, 'VALIDATION_ERROR'),
        'validation-error',
      ],
      ['HTTP 429', () => apiError(429, 'RATE_LIMITED'), 'rate-limited'],
    ];

    for (const s of scenarios) {
      for (const [label, make, kind] of FAILURES) {
        it(`K13-90 ${s.name}: ${label} is rejected with a safe message, never retried`, () => {
          const call = submit(s);
          const resolution = resolveFixProofError(make(), 'mutation');

          call.subject.error(make());

          expect(resolution.kind).toBe(kind);
          expect(mutation.result()).toMatchObject({
            status: 'rejected',
            dispatched: true,
            errorKind: kind,
            reviewRequired: resolution.requiresRefresh,
            potentiallyExecuted: false,
          });
          expect(mutation.result()?.message).toBe(resolution.message);
          expect(JSON.stringify(mutation.result())).not.toContain('secret');
          expect(JSON.stringify(mutation.result())).not.toContain('sig=');

          if (resolution.requiresRefresh) {
            expect(mutation.phase()).toBe('refreshing');
            respondRefresh(s, s.base(), s.jobStatus);
          }

          expect(mutation.phase()).toBe('rejected');
          expect(mutation.hasUnresolvedOperation()).toBe(false);
          expect(fake.mutationCalls).toHaveLength(1);
          expect(mutation.canExecute()).toBe(true);
        });
      }

      for (const [label, makeError, kind] of [
        ['HTTP 408', () => apiError(408, 'UNKNOWN_ERROR'), 'unknown'],
        ['HTTP 504', () => apiError(504, 'SERVER_ERROR'), 'server-failure'],
        ['RxJS TimeoutError', () => new TimeoutError(), 'unknown'],
      ] as const) {
        it(`K13-90u ${s.name}: ${label} remains uncertain, triggers reconciliation, and never retries`, () => {
          const call = submit(s);

          call.subject.error(makeError());

          expect(mutation.phase()).toBe('uncertain');
          expect(mutation.result()).toMatchObject({
            status: 'uncertain',
            dispatched: true,
            errorKind: kind,
            reviewRequired: true,
            potentiallyExecuted: true,
          });
          expect(mutation.hasUnresolvedOperation()).toBe(true);
          expect(fake.mutationCalls).toHaveLength(1);
          expect(fake.detailCalls.length).toBeGreaterThanOrEqual(2);
        });
      }
    }

    it('K13-91 state and concurrency conflicts refresh authoritative data and require renewed review', () => {
      const s = scenarios[2];
      const call = submit(s);
      const listReads = fake.proposalCalls.length;
      const detailReads = fake.detailCalls.length;

      call.subject.error(apiError(409, 'CONFLICT', 'concurrency_conflict'));

      expect(fake.proposalCalls).toHaveLength(listReads + 1);
      expect(fake.detailCalls).toHaveLength(detailReads + 1);
      expect(mutation.result()?.reviewRequired).toBe(true);

      respondRefresh(
        s,
        pendingProposal({ audit: [...pendingProposal().audit, audit('x')] }),
        s.jobStatus,
      );

      expect(mutation.phase()).toBe('rejected');
      expect(fixProof.selectedProposal()?.audit).toHaveLength(2);

      // Renewed review: the next attempt starts from the refreshed record, so
      // data that no longer matches what the user reviewed blocks dispatch.
      expect(s.invoke().started).toBe(true);
      answerPreflight(s);

      expect(mutation.result()).toMatchObject({
        status: 'not-dispatched',
        reason: 'review-required',
      });
      expect(fake.mutationCalls).toHaveLength(1);
    });

    it('K13-92 401 and 403 are access loss, not potential execution, and revoke K12 directly without reads', () => {
      for (const [status, code, kind] of [
        [401, 'UNAUTHORIZED', 'unauthorized'],
        [403, 'FORBIDDEN', 'forbidden'],
      ] as const) {
        const s = scenarios[2];
        const call = submit(s);
        const reads = [
          fake.proposalCalls.length,
          fake.changeCalls.length,
          fake.detailCalls.length,
        ];

        call.subject.error(apiError(status, code));

        expect(mutation.phase()).toBe('access-lost');
        expect(mutation.accessLoss()).toEqual({
          action: 'forward',
          potentiallyExecuted: false,
          mutationConfirmed: false,
        });
        expect(mutation.result()).toMatchObject({
          status: 'access-lost',
          dispatched: true,
          potentiallyExecuted: false,
          errorKind: kind,
        });
        expect(mutation.operation()).toBeNull();
        expect(mutation.hasUnresolvedOperation()).toBe(false);
        expect(fixProof.selected()).toBeNull();
        expect(fixProof.proposals()).toBeNull();
        expect(fixProof.detail()).toBeNull();
        expect(fixProof.authFailure()).toBe(kind);
        expect(fixProof.accessRevoked()).toBe(true);

        tick();

        expect([
          fake.proposalCalls.length,
          fake.changeCalls.length,
          fake.detailCalls.length,
        ]).toEqual(reads);
        expect(fixProof.proposals()).toBeNull();

        // reset for the next iteration
        expect(mutation.dismissOutcome()).toBe(true);
        mutation.ngOnDestroy();
        fixProof.ngOnDestroy();
        TestBed.resetTestingModule();
        fake = createFakes();
        TestBed.configureTestingModule({
          providers: [
            FixProofStateService,
            FixProofMutationStateService,
            { provide: FixProofApiService, useValue: fake.fixProofApi },
            { provide: JobCardApiService, useValue: fake.jobApi },
            {
              provide: FixProofMutationApiService,
              useValue: fake.mutationApi,
            },
          ],
        });
        session = TestBed.inject(SessionService);
        session.setSession(makeSession());
        fixProof = TestBed.inject(FixProofStateService);
        mutation = TestBed.inject(FixProofMutationStateService);
        tick();
      }
    });

    it('K13-93 a rejected outcome without refresh needs no acknowledgement and can be dismissed', () => {
      const call = submit(scenarios[0]);

      call.subject.error(apiError(422, 'VALIDATION_ERROR'));

      expect(mutation.phase()).toBe('rejected');
      expect(mutation.acknowledge({ reviewed: true }).reason).toBe(
        'nothing-to-acknowledge',
      );
      expect(mutation.dismissOutcome()).toBe(true);
      expect(mutation.phase()).toBe('idle');
      expect(mutation.result()).toBeNull();
    });

    it('K13-94 dismiss never clears an unresolved outcome', () => {
      makeUncertain(scenarios[2]);

      expect(mutation.dismissOutcome()).toBe(false);
      expect(mutation.hasUnresolvedOperation()).toBe(true);
    });
  });

  describe('success and refresh handling', () => {
    const s = scenarios[2];

    it('K13-100 success is kept when the refresh fails', () => {
      const call = submit(s);

      respond(call.subject, s.success());
      last(fake.proposalCalls).error(apiError(500, 'SERVER_ERROR'));
      last(fake.detailCalls).subject.error(apiError(500, 'SERVER_ERROR'));
      tick();

      expect(mutation.phase()).toBe('succeeded');
      expect(mutation.result()).toMatchObject({
        status: 'succeeded',
        refresh: { list: 'failed', detail: 'failed' },
      });
      expect(mutation.hasUnresolvedOperation()).toBe(false);
      expect(fake.mutationCalls).toHaveLength(1);
    });

    it('K13-101 stale data after a failed refresh blocks further actions', () => {
      const call = submit(s);

      respond(call.subject, s.success());
      last(fake.proposalCalls).error(apiError(500, 'SERVER_ERROR'));
      last(fake.detailCalls).subject.error(apiError(500, 'SERVER_ERROR'));
      tick();

      expect(mutation.canExecute()).toBe(
        fixProof.actionContextState() === 'ready',
      );
      expect(mutation.forwardProposal(P1).started).toBe(false);
      expect(fake.mutationCalls).toHaveLength(1);
    });

    it('K13-102 disappearance from the filtered list is neither deletion nor failure', () => {
      const call = submit(s);

      respond(call.subject, s.success());
      respond(last(fake.proposalCalls), []);
      respond(
        last(fake.detailCalls).subject,
        detailOf(s.success(), s.afterJobStatus),
      );
      tick();

      expect(mutation.phase()).toBe('succeeded');
      expect(mutation.result()).toMatchObject({
        status: 'succeeded',
        refresh: { list: 'refreshed', detail: 'refreshed' },
      });
      expect(mutation.result()?.message).not.toMatch(/delet|remov|fail/i);
    });

    it('K13-103 flags that the refreshed state changed since the confirmed response', () => {
      const call = submit(s);

      respond(call.subject, s.success());
      respond(last(fake.proposalCalls), [s.success() as ProposalDto]);
      respond(
        last(fake.detailCalls).subject,
        detailOf(
          pendingProposal({
            status: 'CustomerResponded',
            managerNote: NOTE_FORWARD,
          }),
          'AwaitingRelease',
        ),
      );
      tick();

      expect(mutation.result()).toMatchObject({
        status: 'succeeded',
        refresh: { stateChangedSinceResponse: true },
      });
    });

    it('K13-104 an older in-flight K12 read does not stand in for the post-mutation refresh', () => {
      openScenario(s);
      fixProof.refreshProposals();
      const older = last(fake.proposalCalls);

      s.invoke();
      answerPreflight(s);
      respond(last(fake.mutationCalls).subject, s.success());

      // K12 ignores a refresh while its own read is in flight, so K13 waits.
      const readsDuring = fake.proposalCalls.length;

      expect(mutation.phase()).toBe('refreshing');
      respond(older, [s.base() as ProposalDto]);
      tick();

      // The list refresh starts only after the older read finished.
      expect(fake.proposalCalls.length).toBe(readsDuring + 1);
      respond(last(fake.proposalCalls), [s.success() as ProposalDto]);
      respond(
        last(fake.detailCalls).subject,
        detailOf(s.success(), s.afterJobStatus),
      );
      tick();

      expect(mutation.phase()).toBe('succeeded');
    });

    it('K13-105 refreshing never triggers another mutation', () => {
      const call = submit(s);

      respond(call.subject, s.success());
      respondRefresh(s, s.success(), s.afterJobStatus);
      fixProof.refreshProposals();
      fixProof.refreshDetail();
      tick();

      expect(fake.mutationCalls).toHaveLength(1);
      for (const fn of Object.values(fake.mutationApi)) {
        expect(fn.mock.calls.length).toBeLessThanOrEqual(1);
      }
    });

    it('K13-106 an authorization failure during the refresh is access loss with the mutation confirmed', () => {
      const call = submit(s);

      respond(call.subject, s.success());
      last(fake.proposalCalls).error(apiError(401, 'UNAUTHORIZED'));
      tick();

      expect(mutation.phase()).toBe('access-lost');
      expect(mutation.accessLoss()).toMatchObject({
        mutationConfirmed: true,
        potentiallyExecuted: false,
      });
      expect(mutation.hasUnresolvedOperation()).toBe(false);
    });

    it('K13-107 session expiry while refreshing keeps the mutation confirmed and stops', () => {
      const call = submit(s);

      respond(call.subject, s.success());
      expect(mutation.phase()).toBe('refreshing');

      session.clearSession();
      tick();

      expect(mutation.phase()).toBe('access-lost');
      expect(mutation.accessLoss()).toMatchObject({
        mutationConfirmed: true,
        potentiallyExecuted: false,
      });
      expect(mutation.operation()).toBeNull();
    });

    it('K13-108 does not force a new selection after success', () => {
      const call = submit(s);

      respond(call.subject, s.success());
      respondRefresh(s, s.success(), s.afterJobStatus);

      expect(fixProof.selected()).toMatchObject({ kind: 'proposal', id: P1 });
    });

    it('K13-109 a new action is allowed after success and replaces the old outcome', () => {
      const call = submit(s);

      respond(call.subject, s.success());
      respondRefresh(s, s.success(), s.afterJobStatus);

      expect(mutation.canExecute()).toBe(true);
      expect(mutation.dismissOutcome()).toBe(true);
      expect(mutation.phase()).toBe('idle');
    });
  });

  describe('reconciliation detail', () => {
    it('K13-110 set price: matching price with an unchanged baseline match is unresolved', () => {
      open(pendingProposal(), 'AwaitingManagerReview');
      mutation.setItemPrice(P1, ITEM_1, { unitPrice: '1500.50', qty: '2' });
      answerPreflight(scenarios[0]);
      last(fake.mutationCalls).subject.error(apiError(500, 'SERVER_ERROR'));
      reconcileWith(pendingProposal(), 'AwaitingManagerReview');

      const rec = mutation.reconciliation();

      expect(rec?.observation).toBe('unresolved');
      expect(rec?.warnings.map(w => w.code)).toEqual(
        expect.arrayContaining(['baseline-already-matched', 'outcome-unresolved']),
      );
    });

    it('K13-111 set price: a version change means another change, not this request', () => {
      makeUncertain(scenarios[0]);
      reconcileWith(
        pendingProposal({
          items: [
            makeItem(ITEM_1, {
              unitPrice: 1200.5,
              qty: 2,
              amount: 2401,
              version: 4,
            }),
            item2(),
          ],
        }),
        'AwaitingManagerReview',
      );

      expect(mutation.reconciliation()?.observation).toBe('inconsistent');
      expect(mutation.reconciliation()?.warnings.map(w => w.code)).toContain(
        'concurrent-change-observed',
      );
    });

    it('K13-112 set price: a matching price alone is never definitive', () => {
      makeUncertain(scenarios[0]);
      reconcileWith(scenarios[0].success(), 'AwaitingManagerReview');

      expect(mutation.reconciliation()).toMatchObject({
        observation: 'consistent',
        definitive: false,
      });
      expect(mutation.reconciliation()?.warnings.map(w => w.code)).toContain(
        'not-proof-of-this-request',
      );
      expect(mutation.result()?.status).toBe('uncertain');
    });

    it('K13-113 revise: matching values without a version increase are unresolved', () => {
      makeUncertain(scenarios[1]);
      reconcileWith(
        publishedProposal('AwaitingCustomer', {
          items: [
            makeItem(ITEM_1, {
              status: 'Approved',
              unitPrice: 1200.5,
              qty: 2,
              amount: 2401,
            }),
            item2('Approved'),
          ],
        }),
        'AwaitingCustomerApproval',
      );

      expect(mutation.reconciliation()?.observation).toBe('unresolved');
    });

    it('K13-114 revise: several version increases are unresolved, not proof', () => {
      makeUncertain(scenarios[1]);
      reconcileWith(
        publishedProposal('AwaitingCustomer', {
          items: [
            makeItem(ITEM_1, {
              status: 'Approved',
              unitPrice: 1200.5,
              qty: 2,
              amount: 2401,
              version: 4,
            }),
            item2('Approved'),
          ],
        }),
        'AwaitingCustomerApproval',
      );

      expect(mutation.reconciliation()?.observation).toBe('unresolved');
      expect(mutation.reconciliation()?.warnings.map(w => w.code)).toContain(
        'multiple-version-changes',
      );
    });

    it('K13-115 revise: a version increase with different values is inconsistent', () => {
      makeUncertain(scenarios[1]);
      reconcileWith(
        publishedProposal('AwaitingCustomer', {
          items: [
            makeItem(ITEM_1, { status: 'Approved', unitPrice: 77, version: 2 }),
            item2('Approved'),
          ],
        }),
        'AwaitingCustomerApproval',
      );

      expect(mutation.reconciliation()?.observation).toBe('inconsistent');
    });

    it('K13-116 revise: renewed approval is left to the backend, not estimated', () => {
      makeUncertain(scenarios[1]);
      reconcileWith(scenarios[1].success(), 'AwaitingCustomerApproval');

      const rec = mutation.reconciliation();

      expect(rec?.warnings.map(w => w.code)).toContain(
        'renewed-approval-decided-by-backend',
      );
      expect(JSON.stringify(rec)).not.toMatch(/10%|tolerance/i);
    });

    it('K13-117 forward: the awaiting-customer status is not unique proof', () => {
      makeUncertain(scenarios[2]);
      reconcileWith(scenarios[2].success(), 'AwaitingCustomerApproval');

      const rec = mutation.reconciliation();

      expect(rec?.evidence.map(e => e.code)).toEqual(
        expect.arrayContaining([
          'status-matches-requested-transition',
          'audit-entry-observed',
          'manager-note-matches',
          'job-status-matches-transition',
        ]),
      );
      expect(rec?.warnings.map(w => w.code)).toEqual(
        expect.arrayContaining(['not-proof-of-this-request', 'note-match-not-unique']),
      );
    });

    it('K13-118 forward: another proposal status than the target is inconsistent', () => {
      makeUncertain(scenarios[2]);
      reconcileWith(
        pendingProposal({ status: 'Cancelled' }),
        'AwaitingManagerReview',
      );

      expect(mutation.reconciliation()?.observation).toBe('inconsistent');
      expect(mutation.reconciliation()?.warnings.map(w => w.code)).toContain(
        'concurrent-change-observed',
      );
    });

    it('K13-119 return: a note match is not unique proof', () => {
      makeUncertain(scenarios[3]);
      reconcileWith(scenarios[3].success(), 'Inspecting');

      const rec = mutation.reconciliation();

      expect(rec?.observation).toBe('consistent');
      expect(rec?.evidence.map(e => e.code)).toContain('manager-note-matches');
      expect(rec?.warnings.map(w => w.code)).toContain('note-match-not-unique');
    });

    it('K13-120 release: always warns that inventory and queue side effects are unverifiable', () => {
      makeUncertain(scenarios[4]);
      reconcileWith(scenarios[4].success(), 'InProgress', 1);

      const rec = mutation.reconciliation();

      expect(rec?.observation).toBe('consistent');
      expect(rec?.evidence.map(e => e.code)).toEqual(
        expect.arrayContaining([
          'release-timestamp-present',
          'approved-items-released',
          'approved-work-progress-entry',
          'audit-entry-observed',
        ]),
      );
      expect(rec?.warnings.map(w => w.code)).toContain(
        'release-side-effects-unverified',
      );
      expect(
        rec?.warnings.find(w => w.code === 'release-side-effects-unverified')
          ?.message,
      ).toMatch(/inventory/i);
    });

    it('K13-121 release: an unchanged proposal still warns and is never repeated', () => {
      makeUncertain(scenarios[4]);
      reconcileWith(scenarios[4].base(), 'AwaitingRelease');

      expect(mutation.reconciliation()?.observation).toBe('inconsistent');
      expect(mutation.reconciliation()?.warnings.map(w => w.code)).toEqual(
        expect.arrayContaining([
          'release-side-effects-unverified',
          'may-still-execute-later',
        ]),
      );
      expect(fake.mutationApi.releaseProposal).toHaveBeenCalledTimes(1);
    });

    it('K13-122 change request forward: acknowledged counts as past forwarded, with no audit warning', () => {
      makeUncertain(scenarios[5]);
      reconcileWith(
        makeChangeRequest(CR1, JOB_1, {
          status: 'Acknowledged',
          managerNote: NOTE_CR_FORWARD,
        }),
        'InProgress',
      );

      const rec = mutation.reconciliation();

      expect(rec?.observation).toBe('consistent');
      expect(rec?.evidence.map(e => e.code)).toContain('status-past-forwarded');
      expect(rec?.warnings.map(w => w.code)).toContain(
        'no-audit-trail-for-change-requests',
      );
    });

    it('K13-123 change request decline: a different handled status is inconsistent', () => {
      makeUncertain(scenarios[6]);
      reconcileWith(
        makeChangeRequest(CR1, JOB_1, { status: 'ForwardedToMechanic' }),
        'InProgress',
      );

      expect(mutation.reconciliation()?.observation).toBe('inconsistent');
    });

    it('K13-124 a mismatched response identity is reconciled from the original job', () => {
      const s = scenarios[2];
      const call = submit(s);

      respond(call.subject, { ...s.success(), id: P2 } as Entity);

      expect(last(fake.detailCalls).id).toBe(JOB_1);
      reconcileWith(s.success(), s.afterJobStatus);
      expect(mutation.reconciliation()?.observation).toBe('consistent');
    });

    it('K13-125 reconciliation refreshes K12 read-only afterwards without a mutation', () => {
      const s = scenarios[2];

      makeUncertain(s);
      const listReads = fake.proposalCalls.length;

      reconcileWith(s.success(), s.afterJobStatus);

      expect(fake.proposalCalls.length).toBe(listReads + 1);
      expect(fake.mutationCalls).toHaveLength(1);
      expect(mutation.phase()).toBe('reconciliation-required');
    });

    it('K13-126 acknowledgement is allowed after a consistent observation and still is not proof', () => {
      makeUncertain(scenarios[2]);
      reconcileWith(scenarios[2].success(), 'AwaitingCustomerApproval');

      expect(mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);
      expect(mutation.lastAcknowledgement()).toMatchObject({
        observation: 'consistent',
        proofOfOutcome: 'none',
      });
      expect(mutation.result()).toBeNull();
      expect(mutation.hasUnresolvedOperation()).toBe(false);
      expect(mutation.phase()).toBe('idle');
    });

    it('K13-127 acknowledgement after access loss is allowed and clears the notice', () => {
      const s = scenarios[2];
      submit(s);

      session.clearSession();
      tick();
      session.setSession(makeSession('manager-009'));
      tick();

      expect(mutation.phase()).toBe('access-lost');
      expect(s.invoke()).toEqual({
        started: false,
        reason: 'unresolved-operation',
      });
      expect(mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);
      expect(mutation.phase()).toBe('idle');
      expect(mutation.accessLoss()).toBeNull();
    });
  });

  describe('direct K12 revocation on access loss', () => {
    const s = scenarios[2];
    const ACCESS: [number, ApiErrorCode, FixProofAccessRevocationKind][] = [
      [401, 'UNAUTHORIZED', 'unauthorized'],
      [403, 'FORBIDDEN', 'forbidden'],
    ];

    function reads(): number[] {
      return [
        fake.proposalCalls.length,
        fake.changeCalls.length,
        fake.detailCalls.length,
      ];
    }

    function loadChanges(): void {
      fixProof.refreshChangeRequests();
      respond(last(fake.changeCalls), [makeChangeRequest(CR2, JOB_2)]);
    }

    function expectK12Revoked(kind: FixProofAccessRevocationKind): void {
      expect(fixProof.accessRevoked()).toBe(true);
      expect(fixProof.authFailure()).toBe(kind);
      expect(fixProof.proposals()).toBeNull();
      expect(fixProof.changeRequests()).toBeNull();
      expect(fixProof.visibleProposals()).toEqual([]);
      expect(fixProof.visibleChangeRequests()).toEqual([]);
      expect(fixProof.selected()).toBeNull();
      expect(fixProof.detail()).toBeNull();
      expect(fixProof.selectedProposal()).toBeNull();
      expect(fixProof.selectedChangeRequest()).toBeNull();
      expect(fixProof.pricingReview()).toBeNull();
      expect(fixProof.proposalAudit()).toEqual([]);
      expect(fixProof.changeRequestChanges()).toEqual([]);
      expect(fixProof.isProposalsStale()).toBe(false);
      expect(fixProof.isChangeRequestsStale()).toBe(false);
      expect(fixProof.isDetailStale()).toBe(false);
      expect(fixProof.proposalsLastSyncedAt()).toBeNull();
      expect(fixProof.changeRequestsLastSyncedAt()).toBeNull();
      expect(fixProof.detailLastSyncedAt()).toBeNull();
      expect(fixProof.isProposalsLoading()).toBe(false);
      expect(fixProof.isChangeRequestsLoading()).toBe(false);
      expect(fixProof.isDetailLoading()).toBe(false);
      expect(fixProof.proposalActions()).toBeNull();
      expect(fixProof.changeRequestActions()).toBeNull();
      expect(fixProof.actionContextState()).toBe('no-selection');
      expect(mutation.canExecute()).toBe(false);
    }

    it.each(ACCESS)(
      'K13-150 mutation HTTP %i clears every protected K12 value at once and sends no read',
      (status, code, kind) => {
        loadChanges();
        const call = submit(s);

        expect(fixProof.pricingReview()).not.toBeNull();
        expect(fixProof.changeRequests()).not.toBeNull();

        const before = reads();

        call.subject.error(apiError(status, code));

        expectK12Revoked(kind);
        expect(reads()).toEqual(before);
        expect(mutation.result()).toMatchObject({
          status: 'access-lost',
          dispatched: true,
          potentiallyExecuted: false,
          errorKind: kind,
        });
        expect(mutation.hasUnresolvedOperation()).toBe(false);

        tick();
        vi.advanceTimersByTime(FIXPROOF_MUTATION_STATE_CHECK_INTERVAL_MS * 4);
        tick();

        expectK12Revoked(kind);
        expect(reads()).toEqual(before);
        expect(vi.getTimerCount()).toBe(0);
      },
    );

    it.each(ACCESS)(
      'K13-151 mutation HTTP %i cancels pending K12 proposal, change request and detail reads; late successes are ignored',
      (status, code, kind) => {
        loadChanges();
        const call = submit(s);
        fixProof.refreshProposals();
        fixProof.refreshChangeRequests();
        fixProof.refreshDetail();
        const proposals = last(fake.proposalCalls);
        const changes = last(fake.changeCalls);
        const detail = last(fake.detailCalls);

        expect(fixProof.isProposalsLoading()).toBe(true);
        expect(fixProof.isChangeRequestsLoading()).toBe(true);
        expect(fixProof.isDetailLoading()).toBe(true);

        call.subject.error(apiError(status, code));

        expect(proposals.observed).toBe(false);
        expect(changes.observed).toBe(false);
        expect(detail.subject.observed).toBe(false);
        expectK12Revoked(kind);

        respond(proposals, [s.base() as ProposalDto]);
        respond(changes, [makeChangeRequest(CR1, JOB_1)]);
        respond(detail.subject, detailOf(s.base(), s.jobStatus));
        tick();

        expectK12Revoked(kind);
      },
    );

    it('K13-152 late network and HTTP 500 failures and never-completing K12 reads change nothing', () => {
      loadChanges();
      const call = submit(s);
      fixProof.refreshProposals();
      fixProof.refreshChangeRequests();
      fixProof.refreshDetail();
      const proposals = last(fake.proposalCalls);
      const changes = last(fake.changeCalls);
      const neverCompletes = last(fake.detailCalls);

      call.subject.error(apiError(403, 'FORBIDDEN'));

      proposals.error(apiError(0, 'NETWORK_ERROR'));
      changes.error(apiError(500, 'SERVER_ERROR'));
      vi.advanceTimersByTime(FIXPROOF_MUTATION_STATE_CHECK_INTERVAL_MS * 4);
      tick();

      expect(neverCompletes.subject.observed).toBe(false);
      expectK12Revoked('forbidden');
      expect(fixProof.proposalsRefreshError()).toBeNull();
      expect(fixProof.changeRequestsError()?.kind).toBe('forbidden');
    });

    it.each(ACCESS)(
      'K13-153 preflight GET HTTP %i revokes K12 and is reported as not dispatched',
      (status, code, kind) => {
        openScenario(s);
        loadChanges();
        expect(s.invoke().started).toBe(true);
        const before = reads();

        last(fake.detailCalls).subject.error(apiError(status, code));

        expectK12Revoked(kind);
        expect(reads()).toEqual(before);
        expect(fake.mutationCalls).toHaveLength(0);
        expect(mutation.phase()).toBe('access-lost');
        expect(mutation.result()).toMatchObject({
          status: 'access-lost',
          dispatched: false,
          potentiallyExecuted: false,
          errorKind: kind,
        });
        expect(mutation.result()?.message).toContain(
          'Nothing was sent to the server',
        );
        expect(mutation.accessLoss()).toEqual({
          action: s.action,
          potentiallyExecuted: false,
          mutationConfirmed: false,
        });
        expect(mutation.hasUnresolvedOperation()).toBe(false);
      },
    );

    it.each(ACCESS)(
      'K13-154 automatic reconciliation GET HTTP %i revokes K12 and keeps the dispatched operation unresolved',
      (status, code, kind) => {
        loadChanges();
        makeUncertain(s);
        expect(mutation.reconciliation()?.state).toBe('reading');
        const before = reads();

        last(fake.detailCalls).subject.error(apiError(status, code));

        expectK12Revoked(kind);
        expect(reads()).toEqual(before);
        expect(mutation.phase()).toBe('access-lost');
        expect(mutation.result()).toMatchObject({
          status: 'access-lost',
          dispatched: true,
          potentiallyExecuted: true,
          errorKind: kind,
        });
        expect(mutation.accessLoss()).toEqual({
          action: s.action,
          potentiallyExecuted: true,
          mutationConfirmed: false,
        });
        expect(mutation.hasUnresolvedOperation()).toBe(true);
        expect(mutation.reconciliation()).toBeNull();
        expect(fake.mutationCalls).toHaveLength(1);
      },
    );

    it.each(ACCESS)(
      'K13-155 manual reconciliation GET HTTP %i revokes K12, cancels the K12 refresh and stays unresolved',
      (status, code, kind) => {
        loadChanges();
        makeUncertain(s);
        reconcileWith(s.base(), s.jobStatus);

        expect(mutation.phase()).toBe('reconciliation-required');
        expect(fixProof.isProposalsLoading()).toBe(true);

        const planList = last(fake.proposalCalls);

        expect(mutation.reconcile()).toBe(true);

        const manual = last(fake.detailCalls);
        const before = reads();

        manual.subject.error(apiError(status, code));

        expect(planList.observed).toBe(false);
        expectK12Revoked(kind);
        expect(reads()).toEqual(before);
        expect(mutation.result()).toMatchObject({
          status: 'access-lost',
          dispatched: true,
          potentiallyExecuted: true,
          errorKind: kind,
        });
        expect(mutation.hasUnresolvedOperation()).toBe(true);
        expect(mutation.reconcile()).toBe(false);
        expect(fake.mutationCalls).toHaveLength(1);
      },
    );

    it.each(ACCESS)(
      'K13-156 after mutation HTTP %i duplicate attempts are refused and nothing is replayed',
      (status, code) => {
        const call = submit(s);
        call.subject.error(apiError(status, code));
        const before = reads();

        expect(s.invoke()).toEqual({ started: false, reason: 'access-revoked' });
        expect(mutation.setItemPrice(P1, ITEM_1, PRICE_INPUT)).toEqual({
          started: false,
          reason: 'access-revoked',
        });
        expect(mutation.result()?.status).toBe('access-lost');
        expect(mutation.phase()).toBe('access-lost');

        expect(mutation.dismissOutcome()).toBe(true);
        expect(s.invoke()).toEqual({ started: false, reason: 'access-revoked' });

        vi.advanceTimersByTime(FIXPROOF_MUTATION_STATE_CHECK_INTERVAL_MS * 4);
        tick();

        expect(fake.mutationCalls).toHaveLength(1);
        expect(reads()).toEqual(before);
      },
    );

    it('K13-157 an acknowledged potentially executed operation still cannot start a new attempt in the revoked session', () => {
      makeUncertain(s);
      last(fake.detailCalls).subject.error(apiError(403, 'FORBIDDEN'));

      expect(s.invoke()).toEqual({
        started: false,
        reason: 'unresolved-operation',
      });
      expect(mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);
      expect(s.invoke()).toEqual({ started: false, reason: 'access-revoked' });
      expect(fake.mutationCalls).toHaveLength(1);
    });

    it('K13-158 normal K12 refresh, selection and filter changes after revocation keep the access loss', () => {
      loadChanges();
      const call = submit(s);
      call.subject.error(apiError(403, 'FORBIDDEN'));
      const before = reads();

      fixProof.refreshProposals();
      fixProof.refreshChangeRequests();
      fixProof.refreshDetail();
      expect(fixProof.selectProposal(P1)).toBe(false);
      expect(fixProof.selectChangeRequest(CR2)).toBe(false);
      expect(fixProof.setProposalStatusFilter('Cancelled')).toBe(false);
      expect(fixProof.setPendingOnly(true)).toBe(false);
      fixProof.setProposalSearch('Kavitha');
      fixProof.reevaluateActionContext();
      tick();

      expect(reads()).toEqual(before);
      expectK12Revoked('forbidden');
      expect(mutation.phase()).toBe('access-lost');
    });

    it('K13-159 the same session instance, logout and timers never lift the revocation', () => {
      const current = session.session() as AuthSession;
      const call = submit(s);
      call.subject.error(apiError(401, 'UNAUTHORIZED'));
      const before = reads();

      session.setSession(current);
      tick();
      vi.advanceTimersByTime(FIXPROOF_MUTATION_STATE_CHECK_INTERVAL_MS * 4);
      fixProof.reevaluateActionContext();
      tick();

      expect(fixProof.accessRevoked()).toBe(true);
      expect(mutation.canExecute()).toBe(false);

      session.clearSession();
      tick();
      fixProof.refreshProposals();

      expect(fixProof.accessRevoked()).toBe(true);
      expect(s.invoke()).toEqual({ started: false, reason: 'access-revoked' });
      expect(reads()).toEqual(before);
      expect(fake.mutationCalls).toHaveLength(1);
    });

    it('K13-160 a new valid session recovers explicitly, without automatic reload or replay', () => {
      const call = submit(s);
      call.subject.error(apiError(401, 'UNAUTHORIZED'));
      const before = reads();

      session.setSession(makeSession('manager-002'));
      tick();
      vi.advanceTimersByTime(FIXPROOF_MUTATION_STATE_CHECK_INTERVAL_MS * 4);
      tick();

      expect(fixProof.accessRevoked()).toBe(false);
      expect(fixProof.authFailure()).toBeNull();
      expect(fixProof.proposals()).toBeNull();
      expect(reads()).toEqual(before);
      expect(fake.mutationCalls).toHaveLength(1);

      openScenario(s);

      expect(mutation.canExecute()).toBe(true);
      expect(s.invoke()).toEqual({ started: true, reason: null });
      answerPreflight(s);

      expect(fake.mutationCalls).toHaveLength(2);
      expect(mutation.phase()).toBe('submitting');
    });

    it('K13-161 session replacement after revocation isolates late responses from the revoked session', () => {
      loadChanges();
      const call = submit(s);
      fixProof.refreshProposals();
      fixProof.refreshChangeRequests();
      const staleProposals = last(fake.proposalCalls);
      const staleChanges = last(fake.changeCalls);

      call.subject.error(apiError(403, 'FORBIDDEN'));
      session.setSession(makeSession('manager-002'));
      tick();

      respond(staleProposals, [
        makeProposal(P1, JOB_1, { customerName: 'Previous Customer' }),
      ]);
      respond(staleChanges, [makeChangeRequest(CR1, JOB_1)]);
      tick();

      expect(fixProof.proposals()).toBeNull();
      expect(fixProof.changeRequests()).toBeNull();

      fixProof.refreshProposals();
      respond(last(fake.proposalCalls), [makeProposal(P2, JOB_2)]);

      expect(fixProof.proposals()?.map(p => p.id)).toEqual([P2]);
      expect(JSON.stringify(fixProof.proposals())).not.toContain(
        'Previous Customer',
      );
    });

    it('K13-162 repeated revocation is safe and changes neither the outcome nor the requests', () => {
      const call = submit(s);
      call.subject.error(apiError(401, 'UNAUTHORIZED'));
      tick();
      const loss = mutation.accessLoss();
      const result = mutation.result();
      const before = reads();
      const timers = vi.getTimerCount();

      expect(timers).toBe(0);

      expect(() => {
        fixProof.revokeFeatureAccess('unauthorized');
        fixProof.revokeFeatureAccess('unauthorized');
      }).not.toThrow();
      tick();

      expect(mutation.accessLoss()).toEqual(loss);
      expect(mutation.result()).toEqual(result);
      expect(mutation.phase()).toBe('access-lost');
      expect(reads()).toEqual(before);
      expect(vi.getTimerCount()).toBe(timers);
      expectK12Revoked('unauthorized');
    });

    it('K13-163 a K12 read 403 during preflight ends the operation as not dispatched', () => {
      openScenario(s);
      s.invoke();
      const preflight = last(fake.detailCalls);
      fixProof.refreshChangeRequests();

      last(fake.changeCalls).error(apiError(403, 'FORBIDDEN'));
      tick();

      expect(preflight.subject.observed).toBe(false);
      expect(mutation.phase()).toBe('access-lost');
      expect(mutation.result()).toMatchObject({
        dispatched: false,
        potentiallyExecuted: false,
        errorKind: 'forbidden',
      });

      respond(preflight.subject, detailOf(s.base(), s.jobStatus));
      expect(fake.mutationCalls).toHaveLength(0);
    });

    it('K13-164 a K12 read 401 while the mutation is in flight reports potential execution', () => {
      const call = submit(s);
      fixProof.refreshChangeRequests();

      last(fake.changeCalls).error(apiError(401, 'UNAUTHORIZED'));
      tick();

      expect(call.subject.observed).toBe(false);
      expect(mutation.phase()).toBe('access-lost');
      expect(mutation.result()).toMatchObject({
        dispatched: true,
        potentiallyExecuted: true,
        errorKind: 'unauthorized',
      });
      expect(mutation.hasUnresolvedOperation()).toBe(true);
      expect(fake.mutationCalls).toHaveLength(1);
    });

    it('K13-165 a K12 read 403 after a confirmed success clears the finished operation view', () => {
      const call = submit(s);
      respond(call.subject, s.success());
      respondRefresh(s, s.success(), s.afterJobStatus);

      expect(mutation.phase()).toBe('succeeded');
      expect(mutation.operation()).not.toBeNull();

      fixProof.refreshProposals();
      last(fake.proposalCalls).error(apiError(403, 'FORBIDDEN'));
      tick();

      expect(mutation.operation()).toBeNull();
      expect(mutation.phase()).toBe('access-lost');
      expect(mutation.accessLoss()).toEqual({
        action: s.action,
        potentiallyExecuted: false,
        mutationConfirmed: true,
      });
      expect(mutation.result()).toMatchObject({
        dispatched: true,
        potentiallyExecuted: false,
        errorKind: 'forbidden',
      });
      expect(mutation.hasUnresolvedOperation()).toBe(false);
    });

    it('K13-166 access loss never exposes backend text, tokens or notes', () => {
      const call = submit(s);
      call.subject.error(apiError(403, 'FORBIDDEN'));

      const exposed = JSON.stringify([
        mutation.result(),
        mutation.accessLoss(),
        mutation.operation(),
        fixProof.proposalsError(),
        fixProof.changeRequestsError(),
        fixProof.detailError(),
      ]);

      expect(exposed).not.toContain('secret-token');
      expect(exposed).not.toContain('sig=');
      expect(exposed).not.toContain('/api/');
      expect(exposed).not.toContain(TOKEN);
      expect(exposed).not.toContain(NOTE_FORWARD);
      expect(exposed).not.toContain('Access revoked');
      expect(fixProof.proposalsError()?.message).toBe(
        resolveFixProofError(new ApiError(403, 'FORBIDDEN', 'x'), 'read')
          .message,
      );
    });
  });

  describe('timers, storage, logging and receipts', () => {
    it('K13-130 the session check timer runs only while an operation is active or unresolved', () => {
      const s = scenarios[2];
      const before = vi.getTimerCount();

      openScenario(s);
      const withK12 = vi.getTimerCount();

      s.invoke();
      expect(vi.getTimerCount()).toBe(withK12 + 1);

      answerPreflight(s);
      respond(last(fake.mutationCalls).subject, s.success());
      respondRefresh(s, s.success(), s.afterJobStatus);

      expect(mutation.phase()).toBe('succeeded');
      expect(vi.getTimerCount()).toBe(withK12);
      expect(before).toBeLessThanOrEqual(withK12);
    });

    it('K13-131 the unresolved state keeps the timer until acknowledged', () => {
      const s = scenarios[2];

      openScenario(s);
      const withK12 = vi.getTimerCount();

      s.invoke();
      answerPreflight(s);
      last(fake.mutationCalls).subject.error(apiError(500, 'SERVER_ERROR'));
      reconcileWith(s.base(), s.jobStatus);

      expect(vi.getTimerCount()).toBeGreaterThan(withK12);

      const unresolved = vi.getTimerCount();

      mutation.acknowledge({ reviewed: true });
      expect(vi.getTimerCount()).toBe(unresolved - 1);
    });

    it('K13-132 the local timer detects an expired session during preflight without HTTP', () => {
      session.setSession(makeSession('manager-001', 40_000));
      tick();
      const s = scenarios[2];

      openScenario(s);
      s.invoke();
      const reads = fake.detailCalls.length;

      vi.advanceTimersByTime(FIXPROOF_MUTATION_STATE_CHECK_INTERVAL_MS * 3);

      expect(mutation.phase()).toBe('access-lost');
      expect(mutation.accessLoss()?.potentiallyExecuted).toBe(false);
      expect(fake.detailCalls).toHaveLength(reads);
      expect(fake.mutationCalls).toHaveLength(0);
    });

    it('K13-133 uses no browser storage', () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      const getItem = vi.spyOn(Storage.prototype, 'getItem');
      const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
      const s = scenarios[2];

      makeUncertain(s);
      reconcileWith(s.success(), s.afterJobStatus);
      mutation.acknowledge({ reviewed: true });

      expect(setItem).not.toHaveBeenCalled();
      expect(getItem).not.toHaveBeenCalled();
      expect(removeItem).not.toHaveBeenCalled();
    });

    it('K13-134 never logs and never exposes backend text, tokens or notes', () => {
      const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
        method => vi.spyOn(console, method).mockImplementation(() => undefined),
      );
      const s = scenarios[2];
      const call = submit(s);

      call.subject.error(apiError(500, 'SERVER_ERROR'));
      reconcileWith(s.base(), s.jobStatus);

      const exposed = JSON.stringify([
        mutation.result(),
        mutation.operation(),
        mutation.reconciliation(),
        mutation.accessLoss(),
        mutation.lastAcknowledgement(),
      ]);

      for (const spy of spies) {
        expect(spy).not.toHaveBeenCalled();
      }

      expect(exposed).not.toContain('secret-token');
      expect(exposed).not.toContain('sig=');
      expect(exposed).not.toContain(TOKEN);
      expect(exposed).not.toContain(NOTE_FORWARD);
    });

    it('K13-135 fabricates no receipt, idempotency key, token or operation id', () => {
      const s = scenarios[2];
      const call = submit(s);

      call.subject.error(apiError(500, 'SERVER_ERROR'));

      const keys = [
        ...Object.keys(mutation.operation() ?? {}),
        ...Object.keys(mutation.result() ?? {}),
        ...Object.keys(mutation.reconciliation() ?? {}),
      ].join(',');

      expect(keys).not.toMatch(
        /receipt|idempot|token|operationId|etag|ifMatch|correlation/i,
      );
      // K10 gets exactly the documented arguments, nothing extra.
      expect(call.args).toHaveLength(3);
      expect(mutation.operation()?.sequence).toBe(1);
    });

    it('K13-136 the operation view never contains note text or the session', () => {
      const s = scenarios[3];
      submit(s);

      const view = JSON.stringify(mutation.operation());

      expect(view).not.toContain(NOTE_RETURN);
      expect(view).not.toContain('manager@example.test');
      expect(view).not.toContain(TOKEN);
    });

    it('K13-137 uses an increasing local sequence per attempt', () => {
      const s = scenarios[3];

      submit(s);
      expect(mutation.operation()?.sequence).toBe(1);
      last(fake.mutationCalls).subject.error(apiError(422, 'VALIDATION_ERROR'));
      expect(mutation.dismissOutcome()).toBe(true);

      expect(s.invoke().started).toBe(true);

      expect(mutation.operation()?.sequence).toBe(2);
    });

    it('K13-138 unrelated K12 reads and refreshes never start a mutation', () => {
      openScenario(scenarios[2]);

      fixProof.refreshProposals();
      fixProof.refreshChangeRequests();
      fixProof.refreshDetail();
      tick();

      for (const fn of Object.values(fake.mutationApi)) {
        expect(fn).not.toHaveBeenCalled();
      }
    });

    it('K13-139 K10 receives a cold observable subscribed exactly once per dispatch', () => {
      const s = scenarios[2];
      const call = submit(s);

      expect(fake.mutationApi.forwardProposal).toHaveBeenCalledTimes(1);
      expect(call.subject.observers).toHaveLength(1);

      call.subject.error(apiError(0, 'NETWORK_ERROR'));
      tick();
      vi.advanceTimersByTime(FIXPROOF_MUTATION_STATE_CHECK_INTERVAL_MS * 4);

      expect(fake.mutationApi.forwardProposal).toHaveBeenCalledTimes(1);
    });
  });

  describe('K13-A03-R1 F-01 synchronous observables and pre-HTTP origin refusal', () => {
    it('K13-F01-01 handles synchronous preflight of(), throwError(), EMPTY, and defer() without null dereference', () => {
      const s = scenarios[2];

      openScenario(s);
      fake.jobApi.getJobCard.mockReturnValueOnce(
        of(detailOf(s.base(), s.jobStatus)),
      );
      fake.mutationApi.forwardProposal.mockReturnValueOnce(of(s.success() as ProposalDto));
      fake.fixProofApi.getProposals.mockReturnValueOnce(of([s.success() as ProposalDto]));
      fake.jobApi.getJobCard.mockReturnValueOnce(
        of(detailOf(s.success(), s.afterJobStatus)),
      );

      expect(s.invoke()).toEqual({ started: true, reason: null });
      tick();
      expect(mutation.phase()).toBe('succeeded');
      expect(mutation.result()?.refresh).toMatchObject({
        list: 'refreshed',
        detail: 'refreshed',
      });

      expect(mutation.dismissOutcome()).toBe(true);
      fixProof.clearSelection();
      openScenario(s);
      fake.jobApi.getJobCard.mockReturnValueOnce(
        throwError(() => apiError(500, 'SERVER_ERROR')),
      );
      expect(s.invoke()).toEqual({ started: true, reason: null });
      expect(mutation.result()).toMatchObject({
        status: 'not-dispatched',
        reason: 'preflight-read-failed',
      });

      expect(mutation.dismissOutcome()).toBe(true);
      fake.jobApi.getJobCard.mockReturnValueOnce(EMPTY);
      expect(s.invoke()).toEqual({ started: true, reason: null });
      expect(mutation.result()).toMatchObject({
        status: 'not-dispatched',
        reason: 'preflight-read-failed',
      });

      expect(mutation.dismissOutcome()).toBe(true);
      fake.jobApi.getJobCard.mockReturnValueOnce(
        defer(() => {
          throw apiError(404, 'NOT_FOUND');
        }),
      );
      expect(s.invoke()).toEqual({ started: true, reason: null });
      expect(mutation.result()).toMatchObject({
        status: 'not-dispatched',
        reason: 'job-not-found',
      });
    });

    it('K13-F01-02 handles synchronous mutation of(), throwError(), EMPTY, and defer() without null dereference', () => {
      const s = scenarios[0];

      openScenario(s);
      fake.mutationApi.setItemPrice.mockReturnValueOnce(
        of(s.success() as ProposalDto),
      );
      expect(s.invoke()).toEqual({ started: true, reason: null });
      answerPreflight(s);
      expect(mutation.phase()).toBe('refreshing');
      respondRefresh(s, s.success(), s.afterJobStatus);
      expect(mutation.phase()).toBe('succeeded');
      expect(mutation.dismissOutcome()).toBe(true);

      fixProof.clearSelection();
      openScenario(s);
      fake.mutationApi.setItemPrice.mockReturnValueOnce(
        throwError(() => apiError(500, 'SERVER_ERROR')),
      );
      fake.jobApi.getJobCard.mockReturnValueOnce(
        of(detailOf(s.base(), s.jobStatus)),
      );
      fake.jobApi.getJobCard.mockReturnValueOnce(
        of(detailOf(s.base(), s.jobStatus)),
      );
      expect(s.invoke()).toEqual({ started: true, reason: null });
      expect(mutation.phase()).toBe('reconciliation-required');
      expect(mutation.reconciliation()?.observation).toBe('inconsistent');
      respondRefresh(s, s.base(), s.jobStatus);
      expect(mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);

      fake.mutationApi.setItemPrice.mockReturnValueOnce(EMPTY);
      expect(s.invoke()).toEqual({ started: true, reason: null });
      answerPreflight(s);
      expect(mutation.phase()).toBe('uncertain');
      expect(mutation.result()?.errorKind).toBe('invalid-response');
      reconcileWith(s.base(), s.jobStatus);
      respondRefresh(s, s.base(), s.jobStatus);
      expect(mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);

      fake.mutationApi.setItemPrice.mockReturnValueOnce(
        defer(() => throwError(() => apiError(422, 'VALIDATION_ERROR'))),
      );
      expect(s.invoke()).toEqual({ started: true, reason: null });
      answerPreflight(s);
      expect(mutation.phase()).toBe('rejected');
      expect(mutation.result()?.errorKind).toBe('validation-error');
    });

    it('K13-F01-03 handles synchronous reconciliation of(), throwError(), EMPTY, and defer() safely', () => {
      const s = scenarios[2];

      openScenario(s);
      fake.mutationApi.forwardProposal.mockReturnValueOnce(
        defer(() => throwError(() => new TimeoutError())),
      );
      fake.jobApi.getJobCard.mockReturnValueOnce(
        of(detailOf(s.base(), s.jobStatus)),
      );
      fake.jobApi.getJobCard.mockReturnValueOnce(EMPTY);
      expect(s.invoke()).toEqual({ started: true, reason: null });
      expect(mutation.reconciliation()?.observation).toBe('read-failed');
      respondRefresh(s, s.base(), s.jobStatus);

      fake.jobApi.getJobCard.mockReturnValueOnce(
        throwError(() => apiError(500, 'SERVER_ERROR')),
      );
      expect(mutation.reconcile()).toBe(true);
      expect(mutation.reconciliation()?.observation).toBe('read-failed');
      expect(mutation.reconciliation()?.attempts).toBe(2);
      respondRefresh(s, s.base(), s.jobStatus);

      fake.jobApi.getJobCard.mockReturnValueOnce(
        of(detailOf(s.success(), s.afterJobStatus)),
      );
      expect(mutation.reconcile()).toBe(true);
      expect(mutation.reconciliation()?.observation).toBe('consistent');
      expect(mutation.reconciliation()?.attempts).toBe(3);
    });

    it('K13-F01-04 synchronous reentrant start during preflight/mutation completion does not clobber the newer subscription', () => {
      const s = scenarios[2];

      openScenario(s);
      const secondPreflight = new Subject<JobDetailDto>();
      let callCount = 0;

      fake.jobApi.getJobCard.mockImplementation(() => {
        callCount += 1;
        if (callCount === 1) {
          return defer(() => of(detailOf(s.changed(), s.jobStatus)));
        }

        if (callCount === 2) {
          return of(detailOf(s.base(), s.jobStatus));
        }

        return secondPreflight.asObservable();
      });

      const originalRefreshDetail = fixProof.refreshDetail.bind(fixProof);
      let restarted = false;

      vi.spyOn(fixProof, 'refreshDetail').mockImplementation(() => {
        originalRefreshDetail();
        if (!restarted) {
          restarted = true;
          expect(mutation.forwardProposal(P1, NOTE_FORWARD)).toEqual({
            started: true,
            reason: null,
          });
        }
      });

      expect(s.invoke()).toEqual({ started: true, reason: null });

      expect(mutation.phase()).toBe('validating');
      expect(secondPreflight.observed).toBe(true);
    });

    it('K13-F01-05 classifies FixProofApiOriginError as not-dispatched (api-not-configured) while keeping arbitrary Errors uncertain', () => {
      const s = scenarios[2];

      openScenario(s);
      fake.mutationApi.forwardProposal.mockReturnValueOnce(
        defer(() => {
          throw new FixProofApiOriginError();
        }),
      );
      expect(s.invoke()).toEqual({ started: true, reason: null });
      answerPreflight(s);

      expect(mutation.phase()).toBe('rejected');
      expect(mutation.result()).toMatchObject({
        status: 'not-dispatched',
        dispatched: false,
        reason: 'api-not-configured',
        potentiallyExecuted: false,
      });
      expect(mutation.operation()).toBeNull();
      expect(mutation.hasUnresolvedOperation()).toBe(false);

      expect(mutation.dismissOutcome()).toBe(true);
      fake.mutationApi.forwardProposal.mockReturnValueOnce(
        defer(() => {
          throw new Error('Unexpected synchronous failure');
        }),
      );
      expect(s.invoke()).toEqual({ started: true, reason: null });
      answerPreflight(s);

      expect(mutation.phase()).toBe('uncertain');
      expect(mutation.result()).toMatchObject({
        status: 'uncertain',
        dispatched: true,
        potentiallyExecuted: true,
      });
      expect(mutation.operation()?.dispatched).toBe(true);
    });
  });

  describe('K13-A03-R1 F-02 reconciliation attempts >= 2 and K12 refresh barrier', () => {
    it('K13-F02-01 refreshes K12 on every reconciliation attempt >= 2 and updates authoritative detail', () => {
      const s = scenarios[2];

      makeUncertain(s);
      reconcileWith(s.base(), s.jobStatus);
      respondRefresh(s, s.base(), s.jobStatus);
      expect(fixProof.selectedProposal()?.status).toBe('PendingManagerReview');

      const listsBefore = fake.proposalCalls.length;
      const detailsBefore = fake.detailCalls.length;

      expect(mutation.reconcile()).toBe(true);
      reconcileWith(s.success(), s.afterJobStatus);

      expect(fake.proposalCalls.length).toBe(listsBefore + 1);
      expect(fake.detailCalls.length).toBe(detailsBefore + 2);

      respondRefresh(s, s.success(), s.afterJobStatus);
      expect(fixProof.selectedProposal()?.status).toBe('AwaitingCustomer');
      expect(mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);
      expect(mutation.canExecute()).toBe(true);
    });

    it('K13-F02-02 blocks execution after early acknowledge until attempt-2 authoritative refresh completes', () => {
      const s = scenarios[2];

      makeUncertain(s);
      reconcileWith(s.base(), s.jobStatus);
      // Attempt 1 K12 reads are still in flight when attempt 2 finishes.
      const attempt1List = last(fake.proposalCalls);
      const attempt1Detail = last(fake.detailCalls).subject;

      expect(mutation.reconcile()).toBe(true);
      reconcileWith(s.success(), s.afterJobStatus);

      // Acknowledge before attempt 1/2 K12 reads finish.
      expect(mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);
      expect(mutation.phase()).toBe('idle');
      expect(mutation.canExecute()).toBe(false);
      expect(mutation.forwardProposal(P1, NOTE_FORWARD)).toEqual({
        started: false,
        reason: 'not-dispatched',
      });
      expect(mutation.result()?.reason).toBe('selection-unresolved');

      // Completing attempt 1 with stale data triggers attempt 2's fresh read,
      // keeping execution blocked until attempt 2's read completes cleanly.
      respond(attempt1List, [s.base() as ProposalDto]);
      respond(attempt1Detail, detailOf(s.base(), s.jobStatus));
      tick();

      expect(mutation.canExecute()).toBe(false);
      expect(fixProof.selectedProposal()?.status).toBe('PendingManagerReview');

      respondRefresh(s, s.success(), s.afterJobStatus);
      expect(fixProof.selectedProposal()?.status).toBe('AwaitingCustomer');
      expect(mutation.canExecute()).toBe(true);
    });

    it('K13-F02-03 keeps execution blocked when attempt-2 K12 detail refresh fails', () => {
      const s = scenarios[2];

      makeUncertain(s);
      reconcileWith(s.base(), s.jobStatus);
      respondRefresh(s, s.base(), s.jobStatus);

      expect(mutation.reconcile()).toBe(true);
      reconcileWith(s.success(), s.afterJobStatus);
      expect(mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);

      respond(last(fake.proposalCalls), [s.success() as ProposalDto]);
      last(fake.detailCalls).subject.error(apiError(500, 'SERVER_ERROR'));
      tick();

      expect(fixProof.isDetailStale()).toBe(true);
      expect(mutation.canExecute()).toBe(false);
      expect(mutation.forwardProposal(P1, NOTE_FORWARD).reason).toBe(
        'not-dispatched',
      );
      expect(mutation.result()?.reason).toBe('selection-unresolved');

      fixProof.refreshDetail();
      respond(last(fake.detailCalls).subject, detailOf(s.success(), s.afterJobStatus));
      tick();
      expect(fixProof.isDetailStale()).toBe(false);
      expect(mutation.canExecute()).toBe(true);
    });

    it('K13-F02-04 handles selection change, session replacement, and access revocation during post-ack refresh', () => {
      const s = scenarios[2];

      makeUncertain(s);
      reconcileWith(s.base(), s.jobStatus);
      respond(last(fake.proposalCalls), [s.base() as ProposalDto, makeProposal(P2, JOB_2)]);
      respond(last(fake.detailCalls).subject, detailOf(s.base(), s.jobStatus));
      tick();

      expect(mutation.reconcile()).toBe(true);
      reconcileWith(s.success(), s.afterJobStatus);
      expect(mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);

      // Switching to another job loads that job's detail and is not stuck on JOB_1.
      expect(fixProof.selectProposal(P2)).toBe(true);
      respond(last(fake.detailCalls).subject, detailOf(makeProposal(P2, JOB_2), 'AwaitingManagerReview'));
      tick();
      respond(last(fake.proposalCalls), [s.success() as ProposalDto, makeProposal(P2, JOB_2)]);
      tick();
      expect(mutation.canExecute()).toBe(true);

      // Replacing the session clears any pending post-ack refresh plan cleanly.
      makeUncertain(scenarios[2]);
      reconcileWith(s.success(), s.afterJobStatus);
      expect(mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);
      session.setSession(makeSession('manager-099'));
      tick();
      expect(mutation.canExecute()).toBe(false);
    });
  });

  describe('K13-A03-R1 F-03 concurrent pricing and status transitions', () => {
    it('K13-F03-01 set-price flags non-versioned concurrent price/qty edits as inconsistent (never mayStillExecute)', () => {
      makeUncertain(scenarios[0]);
      reconcileWith(
        pendingProposal({
          items: [
            makeItem(ITEM_1, {
              unitPrice: 1999.99,
              qty: 3,
              amount: 5999.97,
              version: 1,
            }),
            item2(),
          ],
        }),
        'AwaitingManagerReview',
      );

      const rec = mutation.reconciliation();

      expect(rec?.observation).toBe('inconsistent');
      expect(rec?.warnings.map(w => w.code)).toContain(
        'concurrent-change-observed',
      );
      expect(rec?.warnings.map(w => w.code)).not.toContain(
        'may-still-execute-later',
      );
    });

    it('K13-F03-02 set-price flags concurrent forward/return/cancel/release status transitions even when version & values match', () => {
      for (const status of [
        'AwaitingCustomer',
        'ReturnedToMechanic',
        'Cancelled',
        'ReleasedToMechanic',
      ]) {
        makeUncertain(scenarios[0]);
        reconcileWith(
          pendingProposal({
            status,
            items: [
              makeItem(ITEM_1, {
                unitPrice: 1200.5,
                qty: 2,
                amount: 2401,
                version: 1,
              }),
              item2(),
            ],
          }),
          'AwaitingCustomerApproval',
        );

        const rec = mutation.reconciliation();

        expect(rec?.observation).toBe('inconsistent');
        expect(rec?.warnings.map(w => w.code)).toContain(
          'concurrent-change-observed',
        );
        expect(rec?.warnings.map(w => w.code)).not.toContain(
          'may-still-execute-later',
        );

        respondRefresh(scenarios[0], scenarios[0].base(), scenarios[0].jobStatus);
        expect(mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);
      }
    });

    it('K13-F03-03 revise detects concurrent cancellation, release, customer response, and unapproved item changes', () => {
      for (const [proposalStatus, itemStatus] of [
        ['Cancelled', 'Approved'],
        ['ReturnedToMechanic', 'Approved'],
        ['ReleasedToMechanic', 'Released'],
        ['CustomerResponded', 'Approved'],
        ['AwaitingCustomer', 'Rejected'],
      ] as const) {
        makeUncertain(scenarios[1]);
        reconcileWith(
          publishedProposal(proposalStatus, {
            items: [
              makeItem(ITEM_1, {
                status: itemStatus,
                unitPrice: 1200.5,
                qty: 2,
                amount: 2401,
                version: 2,
              }),
              item2('Approved'),
            ],
          }),
          'AwaitingCustomerApproval',
        );

        const rec = mutation.reconciliation();

        expect(rec?.observation).toBe('inconsistent');
        expect(rec?.warnings.map(w => w.code)).toContain(
          'concurrent-change-observed',
        );
        expect(rec?.warnings.map(w => w.code)).not.toContain(
          'may-still-execute-later',
        );

        respondRefresh(scenarios[1], scenarios[1].base(), scenarios[1].jobStatus);
        expect(mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);
      }

      // Expected CustomerResponded -> AwaitingCustomer transition when item enters AwaitingCustomer stays consistent (definitive: false).
      fixProof.clearSelection();
      open(publishedProposal('CustomerResponded'), 'AwaitingRelease');
      expect(mutation.reviseItem(P1, ITEM_1, PRICE_INPUT).started).toBe(true);
      answerPreflight(
        scenarios[1],
        publishedProposal('CustomerResponded'),
        'AwaitingRelease',
      );
      last(fake.mutationCalls).subject.error(apiError(500, 'SERVER_ERROR'));
      reconcileWith(
        publishedProposal('AwaitingCustomer', {
          items: [
            makeItem(ITEM_1, {
              status: 'AwaitingCustomer',
              unitPrice: 1200.5,
              qty: 2,
              amount: 2401,
              version: 2,
            }),
            item2('Approved'),
          ],
        }),
        'AwaitingCustomerApproval',
      );

      expect(mutation.reconciliation()).toMatchObject({
        observation: 'consistent',
        definitive: false,
      });
    });
  });

  describe('K13-A03-R1 F-04 managerNote divergence detection', () => {
    it('K13-F04-01 forwardProposal and returnProposal detect managerNote divergence (including null forward note vs non-null)', () => {
      makeUncertain(scenarios[2]);
      reconcileWith(
        pendingProposal({
          status: 'AwaitingCustomer',
          managerNote: 'Different manager note',
        }),
        'AwaitingCustomerApproval',
      );
      expect(mutation.reconciliation()?.observation).toBe('inconsistent');
      expect(mutation.reconciliation()?.warnings.map(w => w.code)).toContain(
        'concurrent-change-observed',
      );
      respondRefresh(scenarios[2], scenarios[2].base(), scenarios[2].jobStatus);
      expect(mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);

      // Forward with null note must overwrite any earlier note; non-null observed diverges.
      fixProof.clearSelection();
      open(
        pendingProposal({ managerNote: 'Previous note' }),
        'AwaitingManagerReview',
      );
      expect(mutation.forwardProposal(P1, null).started).toBe(true);
      answerPreflight(
        scenarios[2],
        pendingProposal({ managerNote: 'Previous note' }),
      );
      last(fake.mutationCalls).subject.error(apiError(500, 'SERVER_ERROR'));
      reconcileWith(
        pendingProposal({
          status: 'AwaitingCustomer',
          managerNote: 'Previous note',
        }),
        'AwaitingCustomerApproval',
      );
      expect(mutation.reconciliation()?.observation).toBe('inconsistent');
      respondRefresh(scenarios[2], scenarios[2].base(), scenarios[2].jobStatus);
      expect(mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);

      // Return requires a non-blank note and flags mismatched observed note.
      makeUncertain(scenarios[3]);
      reconcileWith(
        pendingProposal({
          status: 'ReturnedToMechanic',
          managerNote: 'Other reason',
        }),
        'Inspecting',
      );
      expect(mutation.reconciliation()?.observation).toBe('inconsistent');
      expect(mutation.reconciliation()?.warnings.map(w => w.code)).toContain(
        'concurrent-change-observed',
      );
    });

    it('K13-F04-02 releaseProposal detects divergence when note was sent and preserves prior note when null note was sent', () => {
      makeUncertain(scenarios[4]);
      reconcileWith(
        publishedProposal('ReleasedToMechanic', {
          managerNote: 'Different release note',
          releasedAt: '2027-01-15T10:00:00Z',
        }),
        'InProgress',
        1,
      );
      expect(mutation.reconciliation()?.observation).toBe('inconsistent');
      expect(mutation.reconciliation()?.warnings.map(w => w.code)).toEqual(
        expect.arrayContaining([
          'release-side-effects-unverified',
          'concurrent-change-observed',
        ]),
      );
      respondRefresh(scenarios[4], scenarios[4].base(), scenarios[4].jobStatus);
      expect(mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);

      // Release with null note preserves baseline.managerNote on the backend.
      fixProof.clearSelection();
      open(
        publishedProposal('CustomerResponded', {
          managerNote: 'Kept earlier note',
        }),
        'AwaitingRelease',
      );
      expect(mutation.releaseProposal(P1, null).started).toBe(true);
      answerPreflight(
        scenarios[4],
        publishedProposal('CustomerResponded', {
          managerNote: 'Kept earlier note',
        }),
      );
      last(fake.mutationCalls).subject.error(apiError(500, 'SERVER_ERROR'));
      reconcileWith(
        publishedProposal('ReleasedToMechanic', {
          managerNote: 'Kept earlier note',
          releasedAt: '2027-01-15T10:00:00Z',
        }),
        'InProgress',
        1,
      );
      expect(mutation.reconciliation()?.observation).toBe('consistent');
      expect(mutation.reconciliation()?.warnings.map(w => w.code)).toContain(
        'release-side-effects-unverified',
      );
    });

    it('K13-F04-03 forwardChangeRequest and declineChangeRequest detect managerNote divergence while keeping no-audit warning', () => {
      makeUncertain(scenarios[5]);
      reconcileWith(
        makeChangeRequest(CR1, JOB_1, {
          status: 'Acknowledged',
          managerNote: null,
        }),
        'InProgress',
      );
      expect(mutation.reconciliation()?.observation).toBe('inconsistent');
      expect(mutation.reconciliation()?.warnings.map(w => w.code)).toEqual(
        expect.arrayContaining([
          'no-audit-trail-for-change-requests',
          'concurrent-change-observed',
        ]),
      );
      respondRefresh(scenarios[5], scenarios[5].base(), scenarios[5].jobStatus);
      expect(mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);

      makeUncertain(scenarios[6]);
      reconcileWith(
        makeChangeRequest(CR1, JOB_1, {
          status: 'Declined',
          managerNote: 'Different decline reason',
        }),
        'InProgress',
      );
      expect(mutation.reconciliation()?.observation).toBe('inconsistent');
      expect(mutation.reconciliation()?.warnings.map(w => w.code)).toEqual(
        expect.arrayContaining([
          'no-audit-trail-for-change-requests',
          'concurrent-change-observed',
        ]),
      );
    });
  });

  describe('K13-A04-R3-R1 manual lifecycle recovery', () => {
    const s = scenarios[2];

    function mutationCount(): number {
      return fake.mutationCalls.length;
    }

    function codes(): string[] {
      return mutation.reconciliation()?.warnings.map(w => w.code) ?? [];
    }

    // ---------------------------------------------------------- B. preflight

    it('R3R1-B01 cancelPreflight cancels a hanging preflight, records not-dispatched and a late answer can never dispatch', () => {
      openScenario(s);
      expect(s.invoke().started).toBe(true);
      const preflight = last(fake.detailCalls).subject;

      expect(mutation.phase()).toBe('validating');
      expect(mutation.cancelPreflight()).toBe(true);

      expect(preflight.observed).toBe(false);
      expect(mutation.phase()).toBe('rejected');
      expect(mutation.isBusy()).toBe(false);
      expect(mutation.result()).toMatchObject({
        status: 'not-dispatched',
        dispatched: false,
        reason: 'preflight-cancelled',
        potentiallyExecuted: false,
      });
      expect(mutation.result()?.message).toContain('Nothing was sent');
      expect(mutation.operation()).toBeNull();

      answerPreflight(s);
      tick();
      expect(mutationCount()).toBe(0);
      expect(mutation.cancelPreflight()).toBe(false);

      // The lane is released: a new, explicit start works.
      expect(mutation.canExecute()).toBe(true);
      expect(s.invoke().started).toBe(true);
      answerPreflight(s);
      expect(mutationCount()).toBe(1);
    });

    it('R3R1-B02 a selection change during preflight cancels it automatically with zero mutations', () => {
      openScenario(s);
      s.invoke();
      const preflight = last(fake.detailCalls).subject;

      fixProof.selectProposal(P2);
      tick();

      expect(preflight.observed).toBe(false);
      expect(mutation.phase()).toBe('rejected');
      expect(mutation.result()?.reason).toBe('selection-changed');
      expect(mutation.result()?.message).toContain('Nothing was sent');

      answerPreflight(s);
      tick();
      expect(mutationCount()).toBe(0);
    });

    it('R3R1-B03 cancelPreflight is refused outside validating and after destroy', () => {
      expect(mutation.cancelPreflight()).toBe(false);

      const call = submit(s);

      expect(mutation.phase()).toBe('submitting');
      expect(mutation.cancelPreflight()).toBe(false);
      expect(call.subject.observed).toBe(true);

      respond(call.subject, s.success());
      respondRefresh(s, s.success(), s.afterJobStatus);
      expect(mutation.cancelPreflight()).toBe(false);

      mutation.ngOnDestroy();
      expect(mutation.cancelPreflight()).toBe(false);
    });

    it('R3R1-B04 session replacement or revocation during preflight still wins; cancel is then refused and nothing dispatches', () => {
      openScenario(s);
      s.invoke();
      const preflight = last(fake.detailCalls).subject;

      session.setSession(makeSession('manager-002'));
      tick();

      expect(mutation.phase()).toBe('access-lost');
      expect(preflight.observed).toBe(false);
      expect(mutation.cancelPreflight()).toBe(false);
      answerPreflight(s);
      expect(mutationCount()).toBe(0);
      expect(mutation.dismissOutcome()).toBe(true);

      open(s.base(), s.jobStatus);
      s.invoke();
      fixProof.revokeFeatureAccess('unauthorized');
      tick();

      expect(mutation.phase()).toBe('access-lost');
      expect(mutation.cancelPreflight()).toBe(false);
      answerPreflight(s);
      expect(mutationCount()).toBe(0);
    });

    // ---------------------------------------------------------- C. stop waiting

    it.each(scenarios.map(item => [item.name, item] as const))(
      'R3R1-C01 stopWaiting on a hanging %s keeps the transport, enters uncertain and blocks duplicates',
      (_name, scenario) => {
        const call = submit(scenario);
        const operation = mutation.operation();

        expect(mutation.stopWaiting()).toBe(true);

        expect(call.subject.observed).toBe(true);
        expect(mutation.detachedRequestPending()).toBe(true);
        expect(mutation.phase()).toBe('uncertain');
        expect(mutation.operation()).toEqual(operation);
        expect(mutation.result()).toMatchObject({
          status: 'uncertain',
          dispatched: true,
          potentiallyExecuted: true,
          reviewRequired: true,
        });
        expect(mutation.result()?.message).toContain(
          'may already have been applied',
        );
        expect(mutation.result()?.message).toContain(
          'Nothing was cancelled on the server',
        );
        expect(mutation.result()?.message).not.toContain('Nothing was sent');

        expect(mutation.hasUnresolvedOperation()).toBe(true);
        expect(mutation.canExecute()).toBe(false);
        expect(scenario.invoke().started).toBe(false);
        expect(mutation.stopWaiting()).toBe(false);
        expect(fake.mutationCalls).toHaveLength(1);
        expect(mutation.reconciliation()?.state).toBe('reading');
      },
    );

    it('R3R1-C02 a late success after stopWaiting is never applied and never unlocks the lane', () => {
      const call = submit(s);
      const lists = fake.proposalCalls.length;

      mutation.stopWaiting();
      respond(call.subject, s.success());
      tick();

      expect(mutation.detachedRequestPending()).toBe(false);
      expect(mutation.phase()).toBe('uncertain');
      expect(mutation.result()?.status).toBe('uncertain');
      expect(mutation.result()?.confirmed).toBeNull();
      expect(mutation.canExecute()).toBe(false);
      expect(fake.proposalCalls.length).toBe(lists);
      expect(fake.mutationCalls).toHaveLength(1);
    });

    it('R3R1-C03 a late failure after stopWaiting is never applied as a rejection or access loss', () => {
      const call = submit(s);

      mutation.stopWaiting();
      call.subject.error(apiError(409, 'CONFLICT'));
      tick();

      expect(mutation.detachedRequestPending()).toBe(false);
      expect(mutation.phase()).toBe('uncertain');
      expect(mutation.result()?.potentiallyExecuted).toBe(true);
      expect(fixProof.accessRevoked()).toBe(false);
      expect(fake.mutationCalls).toHaveLength(1);
    });

    it('R3R1-C04 reconciliation warns that the original request is still pending; acknowledgement needs review and a late answer afterwards changes nothing', () => {
      const call = submit(s);

      mutation.stopWaiting();
      reconcileWith(s.base(), s.jobStatus);

      expect(mutation.phase()).toBe('reconciliation-required');
      expect(codes()).toContain('original-request-still-pending');
      expect(mutation.reconciliation()?.definitive).toBe(false);

      respondRefresh(s, s.base(), s.jobStatus);
      expect(mutation.acknowledge({ reviewed: false }).acknowledged).toBe(false);
      expect(mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);
      expect(mutation.lastAcknowledgement()?.proofOfOutcome).toBe('none');
      expect(mutation.phase()).toBe('idle');
      expect(mutation.detachedRequestPending()).toBe(true);

      respond(call.subject, s.success());
      tick();

      expect(mutation.detachedRequestPending()).toBe(false);
      expect(mutation.phase()).toBe('idle');
      expect(mutation.result()).toBeNull();
      expect(mutation.lastAcknowledgement()).not.toBeNull();
      expect(fake.mutationCalls).toHaveLength(1);
    });

    it('R3R1-C05 a late answer of a detached request never touches a newer operation', () => {
      const first = submit(s);

      mutation.stopWaiting();
      reconcileWith(s.base(), s.jobStatus);
      respondRefresh(s, s.base(), s.jobStatus);
      mutation.acknowledge({ reviewed: true });

      expect(s.invoke().started).toBe(true);
      answerPreflight(s);
      const second = last(fake.mutationCalls);

      expect(second).not.toBe(first);
      expect(mutation.phase()).toBe('submitting');

      respond(first.subject, s.success());
      tick();
      expect(mutation.phase()).toBe('submitting');
      expect(second.subject.observed).toBe(true);

      first.subject.error(apiError(500, 'SERVER_ERROR'));
      expect(mutation.phase()).toBe('submitting');

      respond(second.subject, s.success());
      respondRefresh(s, s.success(), s.afterJobStatus);
      expect(mutation.phase()).toBe('succeeded');
      expect(fake.mutationCalls).toHaveLength(2);
    });

    it('R3R1-C06 stopWaiting is refused outside submitting and after destroy', () => {
      expect(mutation.stopWaiting()).toBe(false);

      openScenario(s);
      s.invoke();
      expect(mutation.stopWaiting()).toBe(false);
      answerPreflight(s);

      last(fake.mutationCalls).subject.error(apiError(500, 'SERVER_ERROR'));
      expect(mutation.phase()).toBe('uncertain');
      expect(mutation.stopWaiting()).toBe(false);

      mutation.ngOnDestroy();
      expect(mutation.stopWaiting()).toBe(false);
    });

    it('R3R1-C07 session replacement releases the detached transport and keeps potentiallyExecuted', () => {
      const call = submit(s);

      mutation.stopWaiting();
      session.setSession(makeSession('manager-002'));
      tick();

      expect(call.subject.observed).toBe(false);
      expect(mutation.detachedRequestPending()).toBe(false);
      expect(mutation.phase()).toBe('access-lost');
      expect(mutation.accessLoss()?.potentiallyExecuted).toBe(true);
      expect(fake.mutationCalls).toHaveLength(1);
    });

    it('R3R1-C08 K12 feature revocation releases the detached transport without HTTP', () => {
      const call = submit(s);

      mutation.stopWaiting();
      const reads = fake.detailCalls.length + fake.proposalCalls.length;

      fixProof.revokeFeatureAccess('forbidden');
      tick();

      expect(call.subject.observed).toBe(false);
      expect(mutation.detachedRequestPending()).toBe(false);
      expect(mutation.phase()).toBe('access-lost');
      expect(mutation.accessLoss()?.potentiallyExecuted).toBe(true);
      expect(fake.detailCalls.length + fake.proposalCalls.length).toBe(reads);
    });

    it('R3R1-C09 destroy releases a detached transport and its timer', () => {
      const call = submit(s);

      mutation.stopWaiting();
      reconcileWith(s.base(), s.jobStatus);
      respondRefresh(s, s.base(), s.jobStatus);
      mutation.acknowledge({ reviewed: true });
      expect(mutation.detachedRequestPending()).toBe(true);

      mutation.ngOnDestroy();

      expect(call.subject.observed).toBe(false);
      expect(mutation.detachedRequestPending()).toBe(false);
      respond(call.subject, s.success());
      expect(fake.mutationCalls).toHaveLength(1);
    });

    it('R3R1-C10 session expiry while only a detached transport remains is enforced by the ticker', () => {
      session.setSession(makeSession('manager-001', 120_000));
      tick();
      const call = submit(s);

      mutation.stopWaiting();
      reconcileWith(s.base(), s.jobStatus);
      respondRefresh(s, s.base(), s.jobStatus);
      mutation.acknowledge({ reviewed: true });
      expect(mutation.phase()).toBe('idle');
      expect(call.subject.observed).toBe(true);

      vi.advanceTimersByTime(
        120_000 + FIXPROOF_MUTATION_STATE_CHECK_INTERVAL_MS,
      );

      expect(call.subject.observed).toBe(false);
      expect(mutation.detachedRequestPending()).toBe(false);
      expect(fake.mutationCalls).toHaveLength(1);
    });

    // --------------------------------------------- D. confirmed-success refresh

    it('R3R1-D01 a hanging older list read can be cancelled; the plan finishes with the success confirmed and no new list read', () => {
      openScenario(s);
      fixProof.refreshProposals();

      s.invoke();
      answerPreflight(s);
      respond(last(fake.mutationCalls).subject, s.success());
      respond(
        last(fake.detailCalls).subject,
        detailOf(s.success(), s.afterJobStatus),
      );
      tick();

      expect(mutation.phase()).toBe('refreshing');
      const lists = fake.proposalCalls.length;

      expect(fixProof.cancelProposalsRequest()).toBe(true);
      tick();

      expect(mutation.phase()).toBe('succeeded');
      expect(mutation.result()).toMatchObject({
        status: 'succeeded',
        refresh: { list: 'failed', detail: 'refreshed' },
      });
      expect(fake.proposalCalls.length).toBe(lists);
      expect(fake.mutationCalls).toHaveLength(1);
    });

    it('R3R1-D02 cancelling the plan detail refresh keeps the confirmation, and stale detail blocks new actions until a manual refresh', () => {
      const call = submit(s);

      respond(call.subject, s.success());
      respond(last(fake.proposalCalls), [s.success() as ProposalDto]);
      expect(fixProof.isDetailLoading()).toBe(true);

      expect(fixProof.cancelDetailRequest()).toBe(true);
      tick();

      expect(mutation.phase()).toBe('succeeded');
      expect(mutation.result()).toMatchObject({
        status: 'succeeded',
        refresh: { list: 'refreshed', detail: 'failed' },
      });
      expect(fixProof.actionContextState()).toBe('stale');
      expect(mutation.canExecute()).toBe(false);

      fixProof.refreshDetail();
      respond(
        last(fake.detailCalls).subject,
        detailOf(s.success(), s.afterJobStatus),
      );
      tick();
      expect(mutation.canExecute()).toBe(true);
      expect(fake.mutationCalls).toHaveLength(1);
    });

    it('R3R1-D03 the post-acknowledgement plan is recoverable by cancelling its hanging detail read', () => {
      makeUncertain(s);
      reconcileWith(s.base(), s.jobStatus);
      expect(mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);
      expect(mutation.canExecute()).toBe(false);

      respond(last(fake.proposalCalls), [s.base() as ProposalDto]);
      expect(fixProof.cancelDetailRequest()).toBe(true);
      tick();

      expect(fixProof.actionContextState()).toBe('stale');
      expect(mutation.canExecute()).toBe(false);

      fixProof.refreshDetail();
      respond(last(fake.detailCalls).subject, detailOf(s.base(), s.jobStatus));
      tick();
      expect(mutation.canExecute()).toBe(true);
      expect(fake.mutationCalls).toHaveLength(1);
    });

    // ------------------------------------------------------ E. reconciliation

    it('R3R1-E01 cancelReconciliation records a cancelled observation, keeps the operation unresolved and ignores the late read', () => {
      makeUncertain(s);
      const read = last(fake.detailCalls).subject;
      const lists = fake.proposalCalls.length;

      expect(mutation.reconciliation()?.state).toBe('reading');
      expect(mutation.cancelReconciliation()).toBe(true);

      expect(read.observed).toBe(false);
      expect(mutation.reconciliation()).toMatchObject({
        state: 'complete',
        attempts: 1,
        observation: 'cancelled',
        definitive: false,
      });
      expect(codes()).toEqual(
        expect.arrayContaining([
          'reconciliation-cancelled',
          'may-still-execute-later',
          'outcome-unresolved',
        ]),
      );
      expect(mutation.phase()).toBe('reconciliation-required');
      expect(mutation.result()?.potentiallyExecuted).toBe(true);
      expect(mutation.hasUnresolvedOperation()).toBe(true);
      expect(mutation.isBusy()).toBe(false);
      expect(mutation.canReconcile()).toBe(true);
      expect(mutation.canExecute()).toBe(false);
      expect(mutation.cancelReconciliation()).toBe(false);

      reconcileWith(s.success(), s.afterJobStatus);
      expect(mutation.reconciliation()?.observation).toBe('cancelled');
      expect(fake.proposalCalls.length).toBe(lists);
    });

    it('R3R1-E02 another reconciliation may be started after cancellation', () => {
      makeUncertain(s);
      mutation.cancelReconciliation();

      expect(mutation.reconcile()).toBe(true);
      expect(mutation.reconciliation()).toMatchObject({
        state: 'reading',
        attempts: 2,
      });
      reconcileWith(s.success(), s.afterJobStatus);
      expect(mutation.reconciliation()?.observation).toBe('consistent');
      expect(fake.mutationCalls).toHaveLength(1);
    });

    it('R3R1-E03 a cancelled reconciliation counts as attempted; acknowledgement still needs review and proves nothing', () => {
      makeUncertain(s);
      mutation.cancelReconciliation();

      expect(mutation.acknowledge({ reviewed: false }).reason).toBe(
        'review-required',
      );
      expect(mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);
      expect(mutation.lastAcknowledgement()).toMatchObject({
        observation: 'cancelled',
        proofOfOutcome: 'none',
      });
      expect(fake.mutationCalls).toHaveLength(1);
    });

    it('R3R1-E04 cancelReconciliation is refused when no reconciliation read is running', () => {
      expect(mutation.cancelReconciliation()).toBe(false);

      makeUncertain(s);
      reconcileWith(s.base(), s.jobStatus);
      expect(mutation.cancelReconciliation()).toBe(false);
      expect(mutation.reconciliation()?.observation).not.toBe('cancelled');
    });

    // ------------------------------------------------------ F. refresh summary

    it('R3R1-F01 a selection cleared during the detail refresh is reported as skipped, never refreshed', () => {
      const call = submit(s);

      respond(call.subject, s.success());
      fixProof.clearSelection();
      respond(last(fake.proposalCalls), [s.success() as ProposalDto]);
      tick();

      expect(mutation.result()?.refresh).toMatchObject({
        list: 'refreshed',
        detail: 'skipped',
        selectionChanged: true,
      });
    });

    it('R3R1-F02 a detail loaded for another job during the refresh is reported as skipped, never refreshed', () => {
      const call = submit(s);

      respond(call.subject, s.success());
      fixProof.selectProposal(P2);
      respond(
        last(fake.detailCalls).subject,
        makeDetail(JOB_2, {
          status: 'AwaitingManagerReview',
          proposals: [makeProposal(P2, JOB_2)],
        }),
      );
      respond(last(fake.proposalCalls), [s.success() as ProposalDto]);
      tick();

      expect(mutation.result()?.refresh?.detail).toBe('skipped');
      expect(mutation.result()?.refresh?.selectionChanged).toBe(true);
    });

    it('R3R1-F03 a null sync marker after the refresh is failed, never refreshed', () => {
      const call = submit(s);

      respond(call.subject, s.success());
      vi.spyOn(fixProof, 'detailLastSyncedAt').mockReturnValue(null);
      respondRefresh(s, s.success(), s.afterJobStatus);

      expect(mutation.phase()).toBe('succeeded');
      expect(mutation.result()?.refresh).toMatchObject({
        list: 'refreshed',
        detail: 'failed',
      });
    });

    it('R3R1-F04 a genuine refresh of the same selection and job is refreshed', () => {
      const call = submit(s);

      respond(call.subject, s.success());
      respondRefresh(s, s.success(), s.afterJobStatus);

      expect(mutation.result()?.refresh).toMatchObject({
        list: 'refreshed',
        detail: 'refreshed',
        selectionChanged: false,
      });
    });

    // ------------------------------------------------------- G. hardening

    it.each([
      ['of', () => of(s.success()), 'refreshing'],
      ['throwError', () => throwError(() => apiError(500, 'SERVER_ERROR')), 'uncertain'],
      ['EMPTY', () => EMPTY, 'uncertain'],
    ] as const)(
      'R3R1-G01 a synchronous %s mutation answer leaves nothing to stop',
      (_name, source, phase) => {
        openScenario(s);
        fake.mutationApi.forwardProposal.mockReturnValueOnce(source());
        s.invoke();
        answerPreflight(s);

        expect(mutation.phase()).toBe(phase);
        expect(mutation.stopWaiting()).toBe(false);
        expect(mutation.detachedRequestPending()).toBe(false);
        expect(fake.mutationApi.forwardProposal).toHaveBeenCalledTimes(1);
      },
    );

    it('R3R1-G02 a synchronous preflight leaves nothing to cancel', () => {
      openScenario(s);
      fake.jobApi.getJobCard.mockReturnValueOnce(
        of(detailOf(s.base(), s.jobStatus)),
      );
      s.invoke();

      expect(mutation.phase()).toBe('submitting');
      expect(mutation.cancelPreflight()).toBe(false);
      expect(fake.mutationCalls).toHaveLength(1);
    });

    it('R3R1-G03 destroy while a preflight or reconciliation read is pending cancels it without HTTP', () => {
      openScenario(s);
      s.invoke();
      const preflight = last(fake.detailCalls).subject;
      const reads = fake.detailCalls.length;

      mutation.ngOnDestroy();

      expect(preflight.observed).toBe(false);
      expect(mutation.cancelPreflight()).toBe(false);
      expect(mutation.cancelReconciliation()).toBe(false);
      expect(fake.detailCalls.length).toBe(reads);
      expect(fake.mutationCalls).toHaveLength(0);
    });
  });
});

describe('FixProofMutationStateService with real K10, K12 and K08 services', () => {
  let http: HttpTestingController;
  let session: SessionService;
  let fixProof: FixProofStateService;
  let mutation: FixProofMutationStateService;

  const PROPOSALS_URL = `${APPROVALS}/proposals`;
  const CHANGES_URL = `${APPROVALS}/change-requests`;
  const JOB_URL = `${JOBS}/${JOB_1}`;

  function flushGet(url: string, body: object | null): void {
    http.expectOne(r => r.method === 'GET' && r.url === url).flush(body);
  }

  function pendingAll(): ProposalDto[] {
    return [makeProposal(P1, JOB_1)];
  }

  function openForward(
    proposal = makeProposal(P1, JOB_1),
    jobStatus = 'AwaitingManagerReview',
  ): void {
    fixProof.clearSelection();
    fixProof.refreshProposals();
    flushGet(PROPOSALS_URL, [proposal]);
    fixProof.selectProposal(proposal.id);
    flushGet(JOB_URL, makeDetail(JOB_1, { status: jobStatus, proposals: [proposal] }));
    TestBed.tick();
  }

  function startForward(): void {
    expect(mutation.forwardProposal(P1, NOTE_FORWARD).started).toBe(true);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingManagerReview',
        proposals: pendingAll(),
      }),
    );
  }

  function forwardResponse(): ProposalDto {
    return makeProposal(P1, JOB_1, {
      status: 'AwaitingCustomer',
      managerNote: NOTE_FORWARD,
      audit: [
        ...makeProposal(P1, JOB_1).audit,
        audit('Sent to customer'),
      ],
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor, authInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
        FixProofStateService,
        FixProofMutationStateService,
      ],
    });

    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);
    session.setSession(makeSession());
    fixProof = TestBed.inject(FixProofStateService);
    mutation = TestBed.inject(FixProofMutationStateService);
    TestBed.tick();
  });

  afterEach(() => {
    mutation.ngOnDestroy();
    fixProof.ngOnDestroy();
    vi.useRealTimers();
  });

  it('K13-IT-01 forwards a proposal end to end with exactly one POST and the K12 refresh GETs', () => {
    openForward();
    startForward();

    const post = http.expectOne(
      r => r.method === 'POST' && r.url === `${PROPOSALS_URL}/${P1}/forward`,
    );

    expect(post.request.body).toEqual({ note: NOTE_FORWARD });
    expect(post.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    expect(post.request.headers.has('Idempotency-Key')).toBe(false);
    expect(post.request.headers.has('If-Match')).toBe(false);
    post.flush(forwardResponse());

    expect(mutation.phase()).toBe('refreshing');

    flushGet(PROPOSALS_URL, [forwardResponse()]);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingCustomerApproval',
        proposals: [forwardResponse()],
      }),
    );
    TestBed.tick();

    expect(mutation.phase()).toBe('succeeded');
    expect(mutation.result()?.refresh).toMatchObject({
      list: 'refreshed',
      detail: 'refreshed',
    });
    http.expectNone(r => r.method !== 'GET');
    http.expectNone(r => r.url.includes('/media/'));
    http.verify();
  });

  it('K13-IT-02 sets an item price over HTTP with the validated body', () => {
    openForward();
    expect(
      mutation.setItemPrice(P1, ITEM_1, { unitPrice: '1200.50', qty: '2' })
        .started,
    ).toBe(true);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingManagerReview',
        proposals: pendingAll(),
      }),
    );

    const put = http.expectOne(
      r =>
        r.method === 'PUT' &&
        r.url === `${PROPOSALS_URL}/${P1}/items/${ITEM_1}/price`,
    );

    expect(put.request.body).toEqual({ unitPrice: 1200.5, qty: 2 });

    const priced = makeProposal(P1, JOB_1, {
      items: [
        makeItem(ITEM_1, { unitPrice: 1200.5, qty: 2, amount: 2401 }),
        item2(),
      ],
      total: 2901,
    });

    put.flush(priced);
    flushGet(PROPOSALS_URL, [priced]);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, { status: 'AwaitingManagerReview', proposals: [priced] }),
    );
    TestBed.tick();

    expect(mutation.phase()).toBe('succeeded');
    http.verify();
  });

  it('K13-IT-03 a blank mandatory return note sends no HTTP request at all', () => {
    openForward();
    expect(mutation.returnProposal(P1, '   ').started).toBe(false);
    http.expectNone(() => true);
    expect(mutation.result()?.reason).toBe('invalid-input');
  });

  it('K13-IT-04 HTTP 500 on the POST is uncertain, read-only reconciled and never replayed', () => {
    openForward();
    startForward();

    http
      .expectOne(r => r.method === 'POST')
      .flush({ message: SENSITIVE }, { status: 500, statusText: 'Server Error' });

    expect(mutation.phase()).toBe('uncertain');
    expect(mutation.result()?.errorKind).toBe('server-failure');
    expect(JSON.stringify(mutation.result())).not.toContain('secret');

    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingManagerReview',
        proposals: pendingAll(),
      }),
    );

    expect(mutation.reconciliation()?.observation).toBe('inconsistent');
    http.expectNone(r => r.method !== 'GET');
  });

  it('K13-IT-05 a network failure on the POST is uncertain and not retried', () => {
    openForward();
    startForward();

    http.expectOne(r => r.method === 'POST').error(new ProgressEvent('error'));
    vi.advanceTimersByTime(FIXPROOF_MUTATION_STATE_CHECK_INTERVAL_MS * 4);

    expect(mutation.phase()).toBe('uncertain');
    expect(mutation.result()?.errorKind).toBe('network-failure');
    http.expectNone(r => r.method !== 'GET');
  });

  it('K13-IT-06 an invalid success body validated by K10 is uncertain', () => {
    openForward();
    startForward();

    http
      .expectOne(r => r.method === 'POST')
      .flush({ ...forwardResponse(), status: 'ReturnedToMechanic' });

    expect(mutation.phase()).toBe('uncertain');
    expect(mutation.result()?.errorKind).toBe('invalid-response');
  });

  it('K13-IT-07 a mismatched managerNote in the success body is uncertain', () => {
    openForward();
    startForward();

    http
      .expectOne(r => r.method === 'POST')
      .flush({ ...forwardResponse(), managerNote: 'Different' });

    expect(mutation.phase()).toBe('uncertain');
  });

  it.each([
    ['proposal_wrong_state', 'proposal-wrong-state'],
    ['proposal_not_published', 'proposal-not-published'],
    ['concurrency_conflict', 'concurrency-conflict'],
  ])('K13-IT-08 HTTP 409 %s is rejected, refreshed and needs renewed review', (code, kind) => {
    openForward();
    startForward();

    http
      .expectOne(r => r.method === 'POST')
      .flush({ code, message: SENSITIVE }, { status: 409, statusText: 'Conflict' });

    expect(mutation.result()).toMatchObject({
      status: 'rejected',
      errorKind: kind,
      reviewRequired: true,
    });
    expect(mutation.phase()).toBe('refreshing');

    flushGet(PROPOSALS_URL, pendingAll());
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingManagerReview',
        proposals: pendingAll(),
      }),
    );
    TestBed.tick();

    expect(mutation.phase()).toBe('rejected');
    http.expectNone(r => r.method !== 'GET');
    http.verify();
  });

  it('K13-IT-09 HTTP 401 on the POST is access loss and K12 is revoked directly without any read', () => {
    openForward();
    startForward();

    http
      .expectOne(r => r.method === 'POST')
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(mutation.phase()).toBe('access-lost');
    expect(mutation.result()).toMatchObject({
      status: 'access-lost',
      dispatched: true,
      potentiallyExecuted: false,
      errorKind: 'unauthorized',
    });
    expect(fixProof.selected()).toBeNull();
    expect(fixProof.proposals()).toBeNull();
    expect(fixProof.detail()).toBeNull();
    expect(fixProof.authFailure()).toBe('unauthorized');
    http.expectNone(() => true);

    TestBed.tick();

    http.expectNone(() => true);
    expect(fixProof.authFailure()).toBe('unauthorized');
    expect(fixProof.accessRevoked()).toBe(true);
    expect(mutation.hasUnresolvedOperation()).toBe(false);
    http.verify();
  });

  it('K13-IT-10 a preflight 500 sends no POST', () => {
    openForward();
    expect(mutation.forwardProposal(P1, NOTE_FORWARD).started).toBe(true);

    http
      .expectOne(r => r.method === 'GET' && r.url === JOB_URL)
      .flush(null, { status: 500, statusText: 'Server Error' });

    expect(mutation.result()?.reason).toBe('preflight-read-failed');
    http.expectNone(r => r.method !== 'GET');
  });

  it('K13-IT-11 a changed proposal at preflight sends no POST', () => {
    openForward();
    expect(mutation.forwardProposal(P1, NOTE_FORWARD).started).toBe(true);

    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingManagerReview',
        proposals: [
          makeProposal(P1, JOB_1, {
            audit: [...makeProposal(P1, JOB_1).audit, audit('Other edit')],
          }),
        ],
      }),
    );

    expect(mutation.result()?.reason).toBe('review-required');
    http.expectNone(r => r.method !== 'GET');
  });

  it('K13-IT-12 session loss during the POST cancels the request', () => {
    openForward();
    startForward();

    const post = http.expectOne(r => r.method === 'POST');

    session.clearSession();
    TestBed.tick();

    expect(post.cancelled).toBe(true);
    expect(mutation.accessLoss()?.potentiallyExecuted).toBe(true);
    expect(mutation.phase()).toBe('access-lost');
  });

  it('K13-IT-13 the K12 selection is never altered by orchestration', () => {
    openForward();
    startForward();
    http.expectOne(r => r.method === 'POST').flush(forwardResponse());

    expect(fixProof.selected()).toMatchObject({ kind: 'proposal', id: P1 });
  });

  it('K13-IT-14 HTTP 403 on the POST cancels pending K12 GETs, sends nothing more and refuses retries', () => {
    openForward();
    startForward();
    fixProof.refreshProposals();
    fixProof.refreshChangeRequests();
    const pendingList = http.expectOne(
      r => r.method === 'GET' && r.url === PROPOSALS_URL,
    );
    const pendingChanges = http.expectOne(
      r => r.method === 'GET' && r.url === CHANGES_URL,
    );

    http
      .expectOne(r => r.method === 'POST')
      .flush({ message: SENSITIVE }, { status: 403, statusText: 'Forbidden' });

    expect(pendingList.cancelled).toBe(true);
    expect(pendingChanges.cancelled).toBe(true);
    expect(fixProof.authFailure()).toBe('forbidden');
    expect(fixProof.proposals()).toBeNull();
    expect(fixProof.detail()).toBeNull();
    expect(mutation.result()).toMatchObject({
      status: 'access-lost',
      dispatched: true,
      potentiallyExecuted: false,
      errorKind: 'forbidden',
    });

    fixProof.refreshProposals();
    fixProof.refreshChangeRequests();
    expect(fixProof.selectProposal(P1)).toBe(false);
    expect(mutation.forwardProposal(P1, NOTE_FORWARD)).toEqual({
      started: false,
      reason: 'access-revoked',
    });
    TestBed.tick();
    vi.advanceTimersByTime(FIXPROOF_MUTATION_STATE_CHECK_INTERVAL_MS * 4);

    http.expectNone(() => true);
    expect(
      JSON.stringify([mutation.result(), fixProof.proposalsError()]),
    ).not.toContain('secret');
    http.verify();
  });

  it.each([
    [401, 'Unauthorized', 'unauthorized'],
    [403, 'Forbidden', 'forbidden'],
  ] as [number, string, FixProofAccessRevocationKind][])('K13-IT-15 HTTP %i on the preflight GET sends no POST and revokes K12', (status, statusText, kind) => {
    openForward();
    expect(mutation.forwardProposal(P1, NOTE_FORWARD).started).toBe(true);

    http
      .expectOne(r => r.method === 'GET' && r.url === JOB_URL)
      .flush(null, { status, statusText });

    expect(fixProof.authFailure()).toBe(kind);
    expect(fixProof.proposals()).toBeNull();
    expect(mutation.result()).toMatchObject({
      status: 'access-lost',
      dispatched: false,
      potentiallyExecuted: false,
      errorKind: kind,
    });
    TestBed.tick();
    http.expectNone(() => true);
    http.verify();
  });

  it.each([
    [401, 'Unauthorized', 'unauthorized'],
    [403, 'Forbidden', 'forbidden'],
  ] as [number, string, FixProofAccessRevocationKind][])('K13-IT-16 HTTP %i on the reconciliation GET keeps the POST unresolved and revokes K12', (status, statusText, kind) => {
    openForward();
    startForward();

    http
      .expectOne(r => r.method === 'POST')
      .flush(null, { status: 500, statusText: 'Server Error' });
    http
      .expectOne(r => r.method === 'GET' && r.url === JOB_URL)
      .flush(null, { status, statusText });

    expect(mutation.phase()).toBe('access-lost');
    expect(mutation.result()).toMatchObject({
      dispatched: true,
      potentiallyExecuted: true,
      errorKind: kind,
    });
    expect(mutation.hasUnresolvedOperation()).toBe(true);
    expect(fixProof.authFailure()).toBe(kind);
    expect(fixProof.proposals()).toBeNull();
    TestBed.tick();
    http.expectNone(() => true);
    http.verify();
  });

  it('K13-IT-17 only a new valid session reads again over HTTP and the POST is never replayed', () => {
    openForward();
    startForward();
    http
      .expectOne(r => r.method === 'POST')
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    fixProof.refreshProposals();
    http.expectNone(() => true);

    session.setSession(makeSession('manager-002'));
    TestBed.tick();
    http.expectNone(() => true);

    fixProof.refreshProposals();
    flushGet(PROPOSALS_URL, pendingAll());
    vi.advanceTimersByTime(FIXPROOF_MUTATION_STATE_CHECK_INTERVAL_MS * 4);
    TestBed.tick();

    expect(fixProof.proposals()?.[0].id).toBe(P1);
    expect(fixProof.authFailure()).toBeNull();
    http.expectNone(r => r.method !== 'GET');
    http.verify();
  });

  it('K13-IT-18 covers reviseItem end to end across success (within & above tolerance), 409 conflicts, and 500 reconciliation', () => {
    const basePublished = publishedProposal('AwaitingCustomer');

    fixProof.refreshProposals();
    flushGet(PROPOSALS_URL, [basePublished]);
    fixProof.selectProposal(P1);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingCustomerApproval',
        proposals: [basePublished],
      }),
    );
    TestBed.tick();

    expect(
      mutation.reviseItem(P1, ITEM_1, { unitPrice: '1550.00', qty: '2' }).started,
    ).toBe(true);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingCustomerApproval',
        proposals: [basePublished],
      }),
    );

    const put = http.expectOne(
      r =>
        r.method === 'PUT' &&
        r.url === `${PROPOSALS_URL}/${P1}/items/${ITEM_1}/revise`,
    );
    expect(put.request.body).toEqual({ unitPrice: 1550, qty: 2 });

    const revised = publishedProposal('AwaitingCustomer', {
      items: [
        makeItem(ITEM_1, {
          status: 'Approved',
          unitPrice: 1550,
          qty: 2,
          amount: 3100,
          version: 2,
        }),
        item2('Approved'),
      ],
    });
    put.flush(revised);
    flushGet(PROPOSALS_URL, [revised]);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingCustomerApproval',
        proposals: [revised],
      }),
    );
    TestBed.tick();
    expect(mutation.phase()).toBe('succeeded');
    expect(mutation.result()?.confirmed?.itemVersion).toBe(2);

    // Renewed approval conflict + recovery
    expect(
      mutation.reviseItem(P1, ITEM_1, { unitPrice: '2000.00', qty: '2' }).started,
    ).toBe(true);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingCustomerApproval',
        proposals: [revised],
      }),
    );
    http
      .expectOne(
        r =>
          r.method === 'PUT' &&
          r.url === `${PROPOSALS_URL}/${P1}/items/${ITEM_1}/revise`,
      )
      .flush({ code: 'proposal_not_published' }, { status: 409, statusText: 'Conflict' });
    expect(mutation.result()).toMatchObject({
      status: 'rejected',
      errorKind: 'proposal-not-published',
      reviewRequired: true,
    });
    flushGet(PROPOSALS_URL, [revised]);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingCustomerApproval',
        proposals: [revised],
      }),
    );
    TestBed.tick();
    expect(mutation.phase()).toBe('rejected');

    // 500 uncertain -> reconciliation attempt 1 & attempt 2
    expect(
      mutation.reviseItem(P1, ITEM_1, { unitPrice: '2000.00', qty: '2' }).started,
    ).toBe(true);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingCustomerApproval',
        proposals: [revised],
      }),
    );
    http
      .expectOne(
        r =>
          r.method === 'PUT' &&
          r.url === `${PROPOSALS_URL}/${P1}/items/${ITEM_1}/revise`,
      )
      .flush(null, { status: 500, statusText: 'Server Error' });
    expect(mutation.phase()).toBe('uncertain');

    const revisedAbove = publishedProposal('AwaitingCustomer', {
      items: [
        makeItem(ITEM_1, {
          status: 'AwaitingCustomer',
          unitPrice: 2000,
          qty: 2,
          amount: 4000,
          version: 3,
        }),
        item2('Approved'),
      ],
    });
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingCustomerApproval',
        proposals: [revised],
      }),
    );
    expect(mutation.reconciliation()?.observation).toBe('inconsistent');
    flushGet(PROPOSALS_URL, [revised]);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingCustomerApproval',
        proposals: [revised],
      }),
    );
    TestBed.tick();

    expect(mutation.reconcile()).toBe(true);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingCustomerApproval',
        proposals: [revisedAbove],
      }),
    );
    expect(mutation.reconciliation()).toMatchObject({
      attempts: 2,
      observation: 'consistent',
    });
    flushGet(PROPOSALS_URL, [revisedAbove]);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingCustomerApproval',
        proposals: [revisedAbove],
      }),
    );
    TestBed.tick();
    expect(fixProof.selectedProposal()?.items[0].status).toBe('AwaitingCustomer');
    http.verify();
  });

  it('K13-IT-19 covers returnProposal and releaseProposal end to end (note trimming, null note, 409, and reconciliation)', () => {
    openForward();
    expect(mutation.returnProposal(P1, `  ${NOTE_RETURN}  `).started).toBe(true);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingManagerReview',
        proposals: pendingAll(),
      }),
    );

    const returnPost = http.expectOne(
      r => r.method === 'POST' && r.url === `${PROPOSALS_URL}/${P1}/return`,
    );
    expect(returnPost.request.body).toEqual({ note: NOTE_RETURN });
    const returned = makeProposal(P1, JOB_1, {
      status: 'ReturnedToMechanic',
      managerNote: NOTE_RETURN,
      audit: [...makeProposal(P1, JOB_1).audit, audit('Returned to mechanic')],
    });
    returnPost.flush(returned);
    flushGet(PROPOSALS_URL, [returned]);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, { status: 'Inspecting', proposals: [returned] }),
    );
    TestBed.tick();
    expect(mutation.phase()).toBe('succeeded');

    // Release proposal with null note preserves prior note
    const awaitingRelease = publishedProposal('CustomerResponded', {
      managerNote: 'Earlier release note',
    });
    fixProof.clearSelection();
    fixProof.refreshProposals();
    flushGet(PROPOSALS_URL, [awaitingRelease]);
    fixProof.selectProposal(P1);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingRelease',
        proposals: [awaitingRelease],
      }),
    );
    TestBed.tick();

    expect(mutation.releaseProposal(P1, null).started).toBe(true);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingRelease',
        proposals: [awaitingRelease],
      }),
    );
    const releasePost = http.expectOne(
      r => r.method === 'POST' && r.url === `${PROPOSALS_URL}/${P1}/release`,
    );
    expect(releasePost.request.body).toEqual({ note: null });
    const released = publishedProposal('ReleasedToMechanic', {
      managerNote: 'Earlier release note',
      releasedAt: '2027-01-15T10:00:00Z',
      items: [makeItem(ITEM_1, { status: 'Released' }), item2('Released')],
      audit: [...awaitingRelease.audit, audit('Released to mechanic')],
    });
    releasePost.flush(released);
    flushGet(PROPOSALS_URL, [released]);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'InProgress',
        proposals: [released],
        timelineEntries: 1,
      }),
    );
    TestBed.tick();
    expect(mutation.phase()).toBe('succeeded');

    // Return 409 proposal_wrong_state and release 500 reconciliation
    openForward();
    expect(mutation.returnProposal(P1, NOTE_RETURN).started).toBe(true);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingManagerReview',
        proposals: pendingAll(),
      }),
    );
    http
      .expectOne(r => r.method === 'POST' && r.url === `${PROPOSALS_URL}/${P1}/return`)
      .flush({ code: 'proposal_wrong_state' }, { status: 409, statusText: 'Conflict' });
    expect(mutation.result()).toMatchObject({
      status: 'rejected',
      errorKind: 'proposal-wrong-state',
      reviewRequired: true,
    });
    flushGet(PROPOSALS_URL, pendingAll());
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingManagerReview',
        proposals: pendingAll(),
      }),
    );
    TestBed.tick();
    expect(mutation.phase()).toBe('rejected');

    fixProof.clearSelection();
    fixProof.refreshProposals();
    flushGet(PROPOSALS_URL, [awaitingRelease]);
    fixProof.selectProposal(P1);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingRelease',
        proposals: [awaitingRelease],
      }),
    );
    TestBed.tick();
    expect(mutation.releaseProposal(P1, NOTE_RELEASE).started).toBe(true);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingRelease',
        proposals: [awaitingRelease],
      }),
    );
    http
      .expectOne(r => r.method === 'POST' && r.url === `${PROPOSALS_URL}/${P1}/release`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'InProgress',
        proposals: [
          publishedProposal('ReleasedToMechanic', {
            managerNote: NOTE_RELEASE,
            releasedAt: '2027-01-15T10:00:00Z',
            items: [makeItem(ITEM_1, { status: 'Released' }), item2('Released')],
            audit: [...awaitingRelease.audit, audit('Released to mechanic')],
          }),
        ],
        timelineEntries: 1,
      }),
    );
    expect(mutation.reconciliation()?.observation).toBe('consistent');
    expect(mutation.reconciliation()?.warnings.map(w => w.code)).toContain(
      'release-side-effects-unverified',
    );
    flushGet(PROPOSALS_URL, [released]);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'InProgress',
        proposals: [released],
        timelineEntries: 1,
      }),
    );
    TestBed.tick();
    http.expectNone(r => r.method !== 'GET');
    http.verify();
  });

  it('K13-IT-20 covers forwardChangeRequest and declineChangeRequest end to end (success, 409, 500 reconciliation, and 401 access loss)', () => {
    const baseCr = makeChangeRequest(CR1, JOB_1);

    fixProof.refreshChangeRequests();
    flushGet(CHANGES_URL, [baseCr]);
    fixProof.selectChangeRequest(CR1);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, { status: 'InProgress', changeRequests: [baseCr] }),
    );
    TestBed.tick();

    expect(mutation.forwardChangeRequest(CR1, NOTE_CR_FORWARD).started).toBe(true);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, { status: 'InProgress', changeRequests: [baseCr] }),
    );
    const fwdPost = http.expectOne(
      r => r.method === 'POST' && r.url === `${CHANGES_URL}/${CR1}/forward`,
    );
    expect(fwdPost.request.body).toEqual({ note: NOTE_CR_FORWARD });
    const forwardedCr = makeChangeRequest(CR1, JOB_1, {
      status: 'ForwardedToMechanic',
      managerNote: NOTE_CR_FORWARD,
    });
    fwdPost.flush(forwardedCr);
    flushGet(CHANGES_URL, [forwardedCr]);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'InProgress',
        changeRequests: [forwardedCr],
      }),
    );
    TestBed.tick();
    expect(mutation.phase()).toBe('succeeded');

    // Decline change request: 409 change_wrong_state -> refresh -> 500 -> reconciliation -> 401
    fixProof.clearSelection();
    fixProof.refreshChangeRequests();
    flushGet(CHANGES_URL, [baseCr]);
    fixProof.selectChangeRequest(CR1);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, { status: 'InProgress', changeRequests: [baseCr] }),
    );
    TestBed.tick();

    expect(mutation.declineChangeRequest(CR1, `  ${NOTE_CR_DECLINE}  `).started).toBe(
      true,
    );
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, { status: 'InProgress', changeRequests: [baseCr] }),
    );
    http
      .expectOne(
        r => r.method === 'POST' && r.url === `${CHANGES_URL}/${CR1}/decline`,
      )
      .flush({ code: 'change_wrong_state' }, { status: 409, statusText: 'Conflict' });
    expect(mutation.result()).toMatchObject({
      status: 'rejected',
      errorKind: 'change-wrong-state',
      reviewRequired: true,
    });
    flushGet(CHANGES_URL, [baseCr]);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, { status: 'InProgress', changeRequests: [baseCr] }),
    );
    TestBed.tick();

    expect(mutation.declineChangeRequest(CR1, NOTE_CR_DECLINE).started).toBe(
      true,
    );
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, { status: 'InProgress', changeRequests: [baseCr] }),
    );
    http
      .expectOne(
        r => r.method === 'POST' && r.url === `${CHANGES_URL}/${CR1}/decline`,
      )
      .flush(null, { status: 504, statusText: 'Gateway Timeout' });
    expect(mutation.phase()).toBe('uncertain');
    expect(mutation.result()?.errorKind).toBe('server-failure');

    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'InProgress',
        changeRequests: [
          makeChangeRequest(CR1, JOB_1, {
            status: 'Declined',
            managerNote: 'Different reason',
          }),
        ],
      }),
    );
    expect(mutation.reconciliation()?.observation).toBe('inconsistent');
    expect(mutation.reconciliation()?.warnings.map(w => w.code)).toContain(
      'concurrent-change-observed',
    );
    const pendingDetailRefresh = http.expectOne(
      r => r.method === 'GET' && r.url === JOB_URL,
    );
    http
      .expectOne(r => r.method === 'GET' && r.url === CHANGES_URL)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    TestBed.tick();

    expect(pendingDetailRefresh.cancelled).toBe(true);
    expect(mutation.phase()).toBe('access-lost');
    expect(fixProof.accessRevoked()).toBe(true);
    http.verify();
  });

  it('K13-IT-21 treats HTTP 408 and 504 on mutations as uncertain without retry and rejects HTTP 422 and 429', () => {
    for (const [status, statusText, expectedStatus, expectedKind, expectedPhase] of [
      [408, 'Request Timeout', 'uncertain', 'unknown', 'uncertain'],
      [504, 'Gateway Timeout', 'uncertain', 'server-failure', 'uncertain'],
      [422, 'Unprocessable Content', 'rejected', 'validation-error', 'rejected'],
      [429, 'Too Many Requests', 'rejected', 'rate-limited', 'rejected'],
    ] as const) {
      openForward();
      startForward();
      http
        .expectOne(r => r.method === 'POST')
        .flush({ message: SENSITIVE }, { status, statusText });

      expect(mutation.phase()).toBe(expectedPhase);
      expect(mutation.result()).toMatchObject({
        status: expectedStatus,
        errorKind: expectedKind,
      });
      expect(JSON.stringify(mutation.result())).not.toContain('secret');
      http.expectNone(r => r.method !== 'GET');

      if (expectedStatus === 'uncertain') {
        flushGet(
          JOB_URL,
          makeDetail(JOB_1, {
            status: 'AwaitingManagerReview',
            proposals: pendingAll(),
          }),
        );
        flushGet(PROPOSALS_URL, pendingAll());
        flushGet(
          JOB_URL,
          makeDetail(JOB_1, {
            status: 'AwaitingManagerReview',
            proposals: pendingAll(),
          }),
        );
        TestBed.tick();
        expect(mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);
      } else {
        expect(mutation.dismissOutcome()).toBe(true);
      }
      http.verify();
    }
  });

  it('K13-IT-22 real K10 unconfigured API_CONFIG refuses mutations with api-not-configured and zero HTTP', () => {
    mutation.ngOnDestroy();
    fixProof.ngOnDestroy();
    TestBed.resetTestingModule();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor, authInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: null } },
        FixProofStateService,
        FixProofMutationStateService,
      ],
    });

    const unconfiguredHttp = TestBed.inject(HttpTestingController);
    const unconfiguredSession = TestBed.inject(SessionService);
    unconfiguredSession.setSession(makeSession());
    const unconfiguredState = TestBed.inject(FixProofStateService);
    const unconfiguredMutation = TestBed.inject(FixProofMutationStateService);

    expect(unconfiguredMutation.forwardProposal(P1, NOTE_FORWARD)).toEqual({
      started: false,
      reason: 'not-dispatched',
    });

    // Directly test real K10 FixProofMutationApiService with unconfigured API origin.
    const realMutationApi = TestBed.inject(FixProofMutationApiService);
    let captured: unknown = null;

    realMutationApi
      .forwardProposal(P1, NOTE_FORWARD, {
        proposalStatus: 'PendingManagerReview',
        jobStatus: 'AwaitingManagerReview',
      })
      .subscribe({
        error: err => {
          captured = err;
        },
      });

    expect(captured).toBeInstanceOf(FixProofApiOriginError);
    expect((captured as FixProofApiOriginError).requestSent).toBe(false);
    unconfiguredHttp.expectNone(() => true);
    unconfiguredState.ngOnDestroy();
    unconfiguredMutation.ngOnDestroy();
    unconfiguredHttp.verify();

    // Also prove FixProofMutationStateService -> real FixProofMutationApiService
    // classifies a pre-HTTP ApiUrlService error at dispatch time as not-dispatched.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor, authInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
        FixProofStateService,
        FixProofMutationStateService,
      ],
    });
    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);
    session.setSession(makeSession());
    fixProof = TestBed.inject(FixProofStateService);
    mutation = TestBed.inject(FixProofMutationStateService);
    TestBed.tick();

    openForward();
    expect(mutation.forwardProposal(P1, NOTE_FORWARD).started).toBe(true);
    const apiUrl = TestBed.inject(ApiUrlService);
    const originalResolve = apiUrl.resolve.bind(apiUrl);
    const preflightReq = http.expectOne(
      r => r.method === 'GET' && r.url === JOB_URL,
    );
    vi.spyOn(apiUrl, 'resolve').mockImplementationOnce(() => {
      throw new Error('FIXORA API base URL is not configured');
    });
    preflightReq.flush(
      makeDetail(JOB_1, {
        status: 'AwaitingManagerReview',
        proposals: pendingAll(),
      }),
    );

    expect(mutation.phase()).toBe('rejected');
    expect(mutation.result()).toMatchObject({
      status: 'not-dispatched',
      dispatched: false,
      reason: 'api-not-configured',
      potentiallyExecuted: false,
    });
    expect(mutation.hasUnresolvedOperation()).toBe(false);
    http.expectNone(r => r.method !== 'GET');
    expect(apiUrl.resolve('api/test')).toBe(originalResolve('api/test'));
    http.verify();
  });

  it('K13-IT-23 covers setItemPrice uncertain reconciliation, TimeoutError passthrough, and reviseItem 403 access revocation over HTTP', () => {
    openForward();
    expect(
      mutation.setItemPrice(P1, ITEM_1, { unitPrice: '1400.00', qty: '2' }).started,
    ).toBe(true);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingManagerReview',
        proposals: pendingAll(),
      }),
    );

    const api = TestBed.inject(FixProofMutationApiService);
    expect(api).toBeTruthy();

    http
      .expectOne(
        r =>
          r.method === 'PUT' &&
          r.url === `${PROPOSALS_URL}/${P1}/items/${ITEM_1}/price`,
      )
      .error(new ProgressEvent('error'));
    expect(mutation.phase()).toBe('uncertain');
    expect(mutation.result()?.errorKind).toBe('network-failure');

    // Non-versioned concurrent price change detected over HTTP reconciliation
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingManagerReview',
        proposals: [
          makeProposal(P1, JOB_1, {
            items: [
              makeItem(ITEM_1, {
                unitPrice: 1800,
                qty: 2,
                amount: 3600,
                version: 1,
              }),
              item2(),
            ],
          }),
        ],
      }),
    );
    expect(mutation.reconciliation()?.observation).toBe('inconsistent');
    expect(mutation.reconciliation()?.warnings.map(w => w.code)).toContain(
      'concurrent-change-observed',
    );
    flushGet(PROPOSALS_URL, pendingAll());
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingManagerReview',
        proposals: pendingAll(),
      }),
    );
    TestBed.tick();
    expect(mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);

    // TimeoutError thrown from mutation pipeline stays uncertain with zero retry
    vi.spyOn(api, 'reviseItem').mockReturnValueOnce(
      throwError(() => new TimeoutError()),
    );
    const published = publishedProposal('AwaitingCustomer');
    fixProof.clearSelection();
    fixProof.refreshProposals();
    flushGet(PROPOSALS_URL, [published]);
    fixProof.selectProposal(P1);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingCustomerApproval',
        proposals: [published],
      }),
    );
    TestBed.tick();

    expect(
      mutation.reviseItem(P1, ITEM_1, { unitPrice: '1550.00', qty: '2' }).started,
    ).toBe(true);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingCustomerApproval',
        proposals: [published],
      }),
    );
    expect(mutation.phase()).toBe('uncertain');
    expect(mutation.result()?.errorKind).toBe('unknown');

    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingCustomerApproval',
        proposals: [published],
      }),
    );
    flushGet(PROPOSALS_URL, [published]);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingCustomerApproval',
        proposals: [published],
      }),
    );
    TestBed.tick();
    expect(mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);

    // Real HTTP 403 on reviseItem revokes K12 immediately
    expect(
      mutation.reviseItem(P1, ITEM_1, { unitPrice: '1550.00', qty: '2' }).started,
    ).toBe(true);
    flushGet(
      JOB_URL,
      makeDetail(JOB_1, {
        status: 'AwaitingCustomerApproval',
        proposals: [published],
      }),
    );
    http
      .expectOne(
        r =>
          r.method === 'PUT' &&
          r.url === `${PROPOSALS_URL}/${P1}/items/${ITEM_1}/revise`,
      )
      .flush(null, { status: 403, statusText: 'Forbidden' });
    expect(mutation.phase()).toBe('access-lost');
    expect(fixProof.accessRevoked()).toBe(true);
    expect(fixProof.authFailure()).toBe('forbidden');
    http.expectNone(() => true);
    http.verify();
  });
});

describe('FixProofMutationStateService K13-A04-R1 cross-feature isolation and hygiene', () => {
  let http: HttpTestingController;
  let session: SessionService;
  let coordinator: Day06AuthorizationCoordinatorService;
  let jobCards: JobCardStateService;
  let fixProof: FixProofStateService;
  let mutation: FixProofMutationStateService;

  const JOBS_URL = JOBS;
  const JOB_1_URL = `${JOBS}/${JOB_1}`;
  const PROPOSALS_URL = `${APPROVALS}/proposals`;

  function makeSummary(id: string = JOB_1): JobSummaryDto {
    return {
      id,
      number: `JC-${id.slice(-3)}`,
      customerId: uuid(6, 1),
      customerName: 'Kavitha',
      vehicleId: uuid(7, 1),
      vehicleLabel: 'Honda Fit',
      mechanicId: MECHANIC,
      mechanicName: 'Saman',
      bayId: null,
      bayName: null,
      status: 'AwaitingManagerReview',
      priority: 1,
      queuePosition: 1,
      etaAt: null,
      estimatedMinutes: 60,
      elapsedMinutes: 5,
      createdAt: '2027-01-15T08:00:00Z',
      startedAt: null,
      completedAt: null,
      complaint: null,
      managerNote: null,
    };
  }

  function setup(reverseRegistrationOrder: boolean = false): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor, authInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
        ...(reverseRegistrationOrder
          ? [FixProofStateService, FixProofMutationStateService, JobCardStateService]
          : [JobCardStateService, FixProofStateService, FixProofMutationStateService]),
      ],
    });

    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);
    coordinator = TestBed.inject(Day06AuthorizationCoordinatorService);
    session.setSession(makeSession());

    if (reverseRegistrationOrder) {
      fixProof = TestBed.inject(FixProofStateService);
      mutation = TestBed.inject(FixProofMutationStateService);
      jobCards = TestBed.inject(JobCardStateService);
    } else {
      jobCards = TestBed.inject(JobCardStateService);
      fixProof = TestBed.inject(FixProofStateService);
      mutation = TestBed.inject(FixProofMutationStateService);
    }

    TestBed.tick();
  }

  function pricedProposal(status: string = 'PendingManagerReview'): ProposalDto {
    return makeProposal(P1, JOB_1, {
      status,
      items: [makeItem(ITEM_1)],
      total: 3001,
    });
  }

  function openBothAndSelectProposal(): void {
    jobCards.refreshList();
    http.expectOne(r => r.url === JOBS_URL).flush([makeSummary(JOB_1)]);
    jobCards.selectJob(JOB_1);
    http
      .expectOne(JOB_1_URL)
      .flush(
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          proposals: [pricedProposal()],
        }),
      );

    fixProof.refreshProposals();
    http.expectOne(r => r.url === PROPOSALS_URL).flush([pricedProposal()]);
    fixProof.selectProposal(P1);
    http
      .expectOne(JOB_1_URL)
      .flush(
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          proposals: [pricedProposal()],
        }),
      );
    TestBed.tick();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    setup(false);
  });

  afterEach(() => {
    mutation.ngOnDestroy();
    fixProof.ngOnDestroy();
    jobCards.ngOnDestroy();
    http.verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('K13-A04-01 Job Cards 401 during mutation preflight cancels preflight GET and blocks dispatch', () => {
    openBothAndSelectProposal();
    expect(mutation.canExecute()).toBe(true);

    expect(mutation.forwardProposal(P1, NOTE_FORWARD).started).toBe(true);
    expect(mutation.phase()).toBe('validating');
    const preflightGet = http.expectOne(JOB_1_URL);

    jobCards.refreshList();
    http
      .expectOne(r => r.url === JOBS_URL)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(preflightGet.cancelled).toBe(true);
    expect(mutation.phase()).toBe('access-lost');
    expect(mutation.canExecute()).toBe(false);
    expect(mutation.hasUnresolvedOperation()).toBe(false);
    expect(mutation.result()).toMatchObject({
      status: 'access-lost',
      dispatched: false,
      potentiallyExecuted: false,
      errorKind: 'unauthorized',
    });
    expect(fixProof.accessRevoked()).toBe(true);
    expect(jobCards.accessRevoked()).toBe(true);
    expect(mutation.forwardProposal(P1, NOTE_FORWARD)).toEqual({
      started: false,
      reason: 'access-revoked',
    });
    http.expectNone(() => true);
  });

  it.each([false, true])(
    'K13-A04-02 Job Cards 401 during dispatched mutation preserves potentiallyExecuted regardless of listener order (reverse=%s)',
    reverseOrder => {
      mutation.ngOnDestroy();
      fixProof.ngOnDestroy();
      jobCards.ngOnDestroy();
      setup(reverseOrder);
      openBothAndSelectProposal();

      expect(mutation.forwardProposal(P1, NOTE_FORWARD).started).toBe(true);
      http
        .expectOne(JOB_1_URL)
        .flush(
          makeDetail(JOB_1, {
            status: 'AwaitingManagerReview',
            proposals: [pricedProposal()],
          }),
        );

      expect(mutation.phase()).toBe('submitting');
      const postReq = http.expectOne(
        r => r.method === 'POST' && r.url === `${PROPOSALS_URL}/${P1}/forward`,
      );

      jobCards.refreshList();
      http
        .expectOne(r => r.url === JOBS_URL)
        .flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(postReq.cancelled).toBe(true);
      expect(mutation.phase()).toBe('access-lost');
      expect(mutation.canExecute()).toBe(false);
      expect(mutation.hasUnresolvedOperation()).toBe(true);
      expect(mutation.accessLoss()).toEqual({
        action: 'forward',
        potentiallyExecuted: true,
        mutationConfirmed: false,
      });
      expect(mutation.result()).toMatchObject({
        status: 'access-lost',
        dispatched: true,
        potentiallyExecuted: true,
        errorKind: 'unauthorized',
      });
      expect(fixProof.accessRevoked()).toBe(true);
      expect(jobCards.accessRevoked()).toBe(true);

      // New session recovers Job Cards & FixProof without replaying POST, while warning stays until acknowledged.
      session.setSession(makeSession('manager-002'));
      TestBed.tick();
      http.expectNone(() => true);
      expect(mutation.hasUnresolvedOperation()).toBe(true);
      expect(mutation.canExecute()).toBe(false);
      expect(mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);
      expect(mutation.phase()).toBe('idle');
    },
  );

  it('K13-A04-03 Job Cards 401 during read-only reconciliation cancels reconcile GET and preserves potentiallyExecuted', () => {
    openBothAndSelectProposal();
    expect(mutation.forwardProposal(P1, NOTE_FORWARD).started).toBe(true);
    http
      .expectOne(JOB_1_URL)
      .flush(
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          proposals: [pricedProposal()],
        }),
      );
    http
      .expectOne(
        r => r.method === 'POST' && r.url === `${PROPOSALS_URL}/${P1}/forward`,
      )
      .flush(null, { status: 500, statusText: 'Server Error' });

    expect(mutation.phase()).toBe('uncertain');
    const reconcileGet = http.expectOne(JOB_1_URL);

    jobCards.refreshDetail();
    http
      .expectOne(JOB_1_URL)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(reconcileGet.cancelled).toBe(true);
    expect(mutation.phase()).toBe('access-lost');
    expect(mutation.accessLoss()).toEqual({
      action: 'forward',
      potentiallyExecuted: true,
      mutationConfirmed: false,
    });
    expect(mutation.canExecute()).toBe(false);
    http.expectNone(() => true);
  });

  it('K13-A04-04 handles Job Cards 401 during confirmed refresh and post-acknowledgement refresh safely', () => {
    openBothAndSelectProposal();
    expect(mutation.forwardProposal(P1, NOTE_FORWARD).started).toBe(true);
    http
      .expectOne(JOB_1_URL)
      .flush(
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          proposals: [pricedProposal()],
        }),
      );
    const baseProposal = pricedProposal();
    const forwarded = makeProposal(P1, JOB_1, {
      status: 'AwaitingCustomer',
      managerNote: NOTE_FORWARD,
      items: baseProposal.items,
      total: baseProposal.total,
      approvedTotal: baseProposal.approvedTotal,
      audit: [
        ...baseProposal.audit,
        {
          actorRole: 'Manager',
          action: 'Forwarded',
          detail: null,
          at: '2027-01-15T09:00:00Z',
        },
      ],
    });
    http
      .expectOne(
        r => r.method === 'POST' && r.url === `${PROPOSALS_URL}/${P1}/forward`,
      )
      .flush(forwarded);

    expect(mutation.phase()).toBe('refreshing');
    const listRefresh = http.expectOne(r => r.url === PROPOSALS_URL);
    const detailRefresh = http.expectOne(JOB_1_URL);

    jobCards.refreshList();
    http
      .expectOne(r => r.url === JOBS_URL)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(listRefresh.cancelled).toBe(true);
    expect(detailRefresh.cancelled).toBe(true);
    expect(mutation.phase()).toBe('access-lost');
    expect(mutation.accessLoss()).toEqual({
      action: 'forward',
      potentiallyExecuted: false,
      mutationConfirmed: true,
    });

    // Post-acknowledgement refresh invalidated on Job Cards 401 while K12 refresh is still pending
    session.setSession(makeSession('manager-002'));
    TestBed.tick();
    expect(mutation.dismissOutcome()).toBe(true);
    openBothAndSelectProposal();

    expect(mutation.forwardProposal(P1, NOTE_FORWARD).started).toBe(true);
    http
      .expectOne(JOB_1_URL)
      .flush(
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          proposals: [pricedProposal()],
        }),
      );
    http
      .expectOne(
        r => r.method === 'POST' && r.url === `${PROPOSALS_URL}/${P1}/forward`,
      )
      .flush(null, { status: 500, statusText: 'Server Error' });
    http
      .expectOne(JOB_1_URL)
      .flush(
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          proposals: [pricedProposal()],
        }),
      );

    expect(mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);
    expect(mutation.lastAcknowledgement()).not.toBeNull();
    expect(mutation.canExecute()).toBe(false);

    const postAckProposals = http.expectOne(r => r.url === PROPOSALS_URL);
    const postAckDetail = http.expectOne(JOB_1_URL);

    // Job Cards 401 on manager-002 cancels pending post-ack K12 refresh and clears acknowledgement
    jobCards.refreshList();
    http
      .expectOne(r => r.url === JOBS_URL)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(postAckProposals.cancelled).toBe(true);
    expect(postAckDetail.cancelled).toBe(true);
    expect(mutation.lastAcknowledgement()).toBeNull();
    expect(mutation.canExecute()).toBe(false);
  });

  it('K13-A04-05 FixProof mutation 401 propagates to Job Cards, cancels pending reads and clears search/detail', () => {
    openBothAndSelectProposal();
    jobCards.setSearch('Customer Kavitha');
    jobCards.refreshList();
    const pendingJobsList = http.expectOne(r => r.url === JOBS_URL);
    jobCards.refreshDetail();
    const pendingJobsDetail = http.expectOne(JOB_1_URL);

    expect(mutation.forwardProposal(P1, NOTE_FORWARD).started).toBe(true);
    http
      .expectOne(JOB_1_URL)
      .flush(
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          proposals: [pricedProposal()],
        }),
      );
    const post401 = http.expectOne(
      r => r.method === 'POST' && r.url === `${PROPOSALS_URL}/${P1}/forward`,
    );
    expect(post401.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    post401.flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(pendingJobsList.cancelled).toBe(true);
    expect(pendingJobsDetail.cancelled).toBe(true);
    expect(jobCards.accessRevoked()).toBe(true);
    expect(jobCards.authFailure()).toBe('unauthorized');
    expect(jobCards.serverRows()).toBeNull();
    expect(jobCards.detail()).toBeNull();
    expect(jobCards.localFilter().search).toBe('');
    expect(mutation.phase()).toBe('access-lost');
    expect(mutation.accessLoss()?.potentiallyExecuted).toBe(false);
    http.expectNone(() => true);
  });

  it('K13-A04-06 FixProof mutation 403 stays scoped to FixProof without revoking Job Cards', () => {
    openBothAndSelectProposal();
    expect(mutation.forwardProposal(P1, NOTE_FORWARD).started).toBe(true);
    http
      .expectOne(JOB_1_URL)
      .flush(
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          proposals: [pricedProposal()],
        }),
      );
    const post403 = http.expectOne(
      r => r.method === 'POST' && r.url === `${PROPOSALS_URL}/${P1}/forward`,
    );
    expect(post403.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    post403.flush(null, { status: 403, statusText: 'Forbidden' });

    expect(fixProof.accessRevoked()).toBe(true);
    expect(fixProof.authFailure()).toBe('forbidden');
    expect(mutation.phase()).toBe('access-lost');
    expect(mutation.canExecute()).toBe(false);
    expect(jobCards.accessRevoked()).toBe(false);
    expect(jobCards.authFailure()).toBeNull();
    expect(jobCards.serverRows()).not.toBeNull();
    expect(jobCards.detail()).not.toBeNull();
    expect(session.isAuthenticated()).toBe(true);
  });

  it('K13-A04-07 clears previous-session acknowledgement on logout, expiry and replacement while preserving unacknowledged potentiallyExecuted warning', () => {
    openBothAndSelectProposal();
    expect(mutation.forwardProposal(P1, NOTE_FORWARD).started).toBe(true);
    http
      .expectOne(JOB_1_URL)
      .flush(
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          proposals: [pricedProposal()],
        }),
      );
    http
      .expectOne(
        r => r.method === 'POST' && r.url === `${PROPOSALS_URL}/${P1}/forward`,
      )
      .flush(null, { status: 500, statusText: 'Server Error' });
    http
      .expectOne(JOB_1_URL)
      .flush(
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          proposals: [pricedProposal()],
        }),
      );
    http.expectOne(r => r.url === PROPOSALS_URL).flush([pricedProposal()]);
    http
      .expectOne(JOB_1_URL)
      .flush(
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          proposals: [pricedProposal()],
        }),
      );
    TestBed.tick();
    expect(mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);
    expect(mutation.lastAcknowledgement()).not.toBeNull();

    // Replacing session clears previous-session acknowledgement immediately.
    session.setSession(makeSession('manager-002'));
    TestBed.tick();
    expect(mutation.lastAcknowledgement()).toBeNull();

    // Logout clears acknowledgement too.
    openBothAndSelectProposal();
    expect(mutation.forwardProposal(P1, NOTE_FORWARD).started).toBe(true);
    http
      .expectOne(JOB_1_URL)
      .flush(
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          proposals: [pricedProposal()],
        }),
      );
    http
      .expectOne(
        r => r.method === 'POST' && r.url === `${PROPOSALS_URL}/${P1}/forward`,
      )
      .flush(null, { status: 500, statusText: 'Server Error' });
    http
      .expectOne(JOB_1_URL)
      .flush(
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          proposals: [pricedProposal()],
        }),
      );
    http.expectOne(r => r.url === PROPOSALS_URL).flush([pricedProposal()]);
    http
      .expectOne(JOB_1_URL)
      .flush(
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          proposals: [pricedProposal()],
        }),
      );
    TestBed.tick();
    expect(mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);
    session.clearSession();
    TestBed.tick();
    expect(mutation.lastAcknowledgement()).toBeNull();

    // Expiry clears acknowledgement too.
    session.setSession(makeSession('manager-002b', 10_000));
    TestBed.tick();
    openBothAndSelectProposal();
    expect(mutation.forwardProposal(P1, NOTE_FORWARD).started).toBe(true);
    http
      .expectOne(JOB_1_URL)
      .flush(
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          proposals: [pricedProposal()],
        }),
      );
    http
      .expectOne(
        r => r.method === 'POST' && r.url === `${PROPOSALS_URL}/${P1}/forward`,
      )
      .flush(null, { status: 500, statusText: 'Server Error' });
    http
      .expectOne(JOB_1_URL)
      .flush(
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          proposals: [pricedProposal()],
        }),
      );
    http.expectOne(r => r.url === PROPOSALS_URL).flush([pricedProposal()]);
    http
      .expectOne(JOB_1_URL)
      .flush(
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          proposals: [pricedProposal()],
        }),
      );
    TestBed.tick();
    expect(mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);
    expect(mutation.lastAcknowledgement()).not.toBeNull();
    vi.advanceTimersByTime(FIXPROOF_MUTATION_STATE_CHECK_INTERVAL_MS);
    TestBed.tick();
    expect(mutation.lastAcknowledgement()).toBeNull();

    // Unacknowledged potentiallyExecuted warning survives replacement safely until acknowledged.
    session.setSession(makeSession('manager-003'));
    TestBed.tick();
    openBothAndSelectProposal();
    expect(mutation.forwardProposal(P1, NOTE_FORWARD).started).toBe(true);
    http
      .expectOne(JOB_1_URL)
      .flush(
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          proposals: [pricedProposal()],
        }),
      );
    http
      .expectOne(
        r => r.method === 'POST' && r.url === `${PROPOSALS_URL}/${P1}/forward`,
      )
      .flush(null, { status: 500, statusText: 'Server Error' });
    http
      .expectOne(JOB_1_URL)
      .flush(
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          proposals: [pricedProposal()],
        }),
      );
    http.expectOne(r => r.url === PROPOSALS_URL).flush([pricedProposal()]);
    http
      .expectOne(JOB_1_URL)
      .flush(
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          proposals: [pricedProposal()],
        }),
      );
    TestBed.tick();
    session.clearSession();
    TestBed.tick();
    session.setSession(makeSession('manager-004'));
    TestBed.tick();

    expect(mutation.phase()).toBe('access-lost');
    expect(mutation.accessLoss()).toEqual({
      action: 'forward',
      potentiallyExecuted: true,
      mutationConfirmed: false,
    });
    expect(
      JSON.stringify([mutation.accessLoss(), mutation.result()]),
    ).not.toContain(NOTE_FORWARD);
  });

  it('K13-A04-08 handles multiple active mutation instances, stale session A HTTP/manual 401 isolation and destruction cleanup', () => {
    const env = createEnvironmentInjector(
      [FixProofStateService, FixProofMutationStateService],
      TestBed.inject(EnvironmentInjector),
    );
    const secondFixProof = env.get(FixProofStateService);
    const secondMutation = env.get(FixProofMutationStateService);

    const sessionA = session.session() as AuthSession;
    const staleProv = coordinator.createRequestProvenance(
      'fixproof-mutation',
      sessionA,
      `api/v1/manager/approvals/proposals/${P1}/forward`,
      'POST',
    );

    const sessionB = makeSession('manager-002');
    session.setSession(sessionB);
    TestBed.tick();

    // Late session A / manual ApiError cannot revoke session B.
    expect(
      coordinator.reportUnauthorized(
        staleProv,
        new ApiError(401, 'UNAUTHORIZED', 'Stale'),
      ),
    ).toBe(false);
    expect(fixProof.accessRevoked()).toBe(false);
    expect(secondFixProof.accessRevoked()).toBe(false);

    // Valid session B Job Cards 401 revokes both FixProof/mutation instances synchronously.
    openBothAndSelectProposal();
    expect(mutation.canExecute()).toBe(true);
    jobCards.refreshList();
    const jobs401 = http.expectOne(r => r.url === JOBS_URL);
    expect(jobs401.request.headers.get('Authorization')).toBe(
      `Bearer ${sessionB.accessToken}`,
    );
    jobs401.flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(mutation.canExecute()).toBe(false);
    expect(secondMutation.canExecute()).toBe(false);
    expect(secondFixProof.accessRevoked()).toBe(true);

    // Newly constructed FixProofMutationStateService under already-revoked session B refuses immediately.
    const lateEnv = createEnvironmentInjector(
      [FixProofStateService, FixProofMutationStateService],
      TestBed.inject(EnvironmentInjector),
    );
    const lateMutation = lateEnv.get(FixProofMutationStateService);
    expect(lateMutation.canExecute()).toBe(false);
    expect(lateMutation.forwardProposal(P1, NOTE_FORWARD)).toEqual({
      started: false,
      reason: 'access-revoked',
    });
    lateEnv.destroy();

    env.destroy();
    session.setSession(makeSession('manager-003'));
    TestBed.tick();
    expect(secondFixProof.authFailure()).toBeNull();
  });

  it('K13-A04-09 revokes all FixProof mutation instances on feature 403 while preserving warnings and Job Cards isolation', () => {
    const env = createEnvironmentInjector(
      [FixProofStateService, FixProofMutationStateService],
      TestBed.inject(EnvironmentInjector),
    );
    const secondFixProof = env.get(FixProofStateService);
    const secondMutation = env.get(FixProofMutationStateService);

    openBothAndSelectProposal();
    secondFixProof.refreshProposals();
    httpMockFlushSecondProposals(secondFixProof);

    // Confirmed success on instance 1, waiting on refresh when instance 2 gets 403 during reconcile.
    expect(mutation.forwardProposal(P1, NOTE_FORWARD).started).toBe(true);
    http
      .expectOne(JOB_1_URL)
      .flush(
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          proposals: [pricedProposal()],
        }),
      );
    const forwarded = makeProposal(P1, JOB_1, {
      status: 'AwaitingCustomer',
      managerNote: NOTE_FORWARD,
    });
    const forwardReq = http.expectOne(
      r => r.method === 'POST' && r.url === `${PROPOSALS_URL}/${P1}/forward`,
    );
    expect(forwardReq.request.headers.get('Authorization')).toBe(
      `Bearer ${TOKEN}`,
    );
    forwardReq.flush(forwarded);
    expect(mutation.phase()).toBe('refreshing');
    const pendingRefreshList = http.expectOne(r => r.url === PROPOSALS_URL);
    const pendingRefreshDetail = http.expectOne(JOB_1_URL);

    // Second instance triggers FixProof 403 via change-requests list.
    secondFixProof.refreshChangeRequests();
    const cr403 = http.expectOne(r => r.url === `${APPROVALS}/change-requests`);
    expect(cr403.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    cr403.flush(null, { status: 403, statusText: 'Forbidden' });

    expect(pendingRefreshList.cancelled).toBe(true);
    expect(pendingRefreshDetail.cancelled).toBe(true);
    expect(mutation.phase()).toBe('access-lost');
    expect(mutation.accessLoss()?.mutationConfirmed).toBe(true);
    expect(mutation.accessLoss()?.potentiallyExecuted).toBe(false);
    expect(fixProof.accessRevoked()).toBe(true);
    expect(secondFixProof.accessRevoked()).toBe(true);
    expect(secondMutation.canExecute()).toBe(false);
    expect(jobCards.accessRevoked()).toBe(false);

    // Newly constructed FixProofMutationStateService refuses under 403-revoked session.
    const lateEnv = createEnvironmentInjector(
      [FixProofStateService, FixProofMutationStateService],
      TestBed.inject(EnvironmentInjector),
    );
    const lateMutation = lateEnv.get(FixProofMutationStateService);
    expect(lateMutation.canExecute()).toBe(false);
    expect(lateMutation.forwardProposal(P1, NOTE_FORWARD)).toEqual({
      started: false,
      reason: 'access-revoked',
    });

    lateEnv.destroy();
    env.destroy();
    http.expectNone(() => true);
  });

  it('K13-A04-10 preserves potentiallyExecuted on dispatched mutation when FixProof reconcile hits 403 and propagates to siblings', () => {
    const env = createEnvironmentInjector(
      [FixProofStateService, FixProofMutationStateService],
      TestBed.inject(EnvironmentInjector),
    );
    const secondFixProof = env.get(FixProofStateService);
    const secondMutation = env.get(FixProofMutationStateService);

    openBothAndSelectProposal();
    expect(mutation.forwardProposal(P1, NOTE_FORWARD).started).toBe(true);
    http
      .expectOne(JOB_1_URL)
      .flush(
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          proposals: [pricedProposal()],
        }),
      );
    http
      .expectOne(
        r => r.method === 'POST' && r.url === `${PROPOSALS_URL}/${P1}/forward`,
      )
      .flush(null, { status: 500, statusText: 'Server Error' });

    expect(mutation.phase()).toBe('uncertain');
    const reconcileGet = http.expectOne(JOB_1_URL);
    expect(reconcileGet.request.headers.get('Authorization')).toBe(
      `Bearer ${TOKEN}`,
    );
    reconcileGet.flush(null, { status: 403, statusText: 'Forbidden' });

    expect(mutation.phase()).toBe('access-lost');
    expect(mutation.accessLoss()).toEqual({
      action: 'forward',
      potentiallyExecuted: true,
      mutationConfirmed: false,
    });
    expect(secondFixProof.accessRevoked()).toBe(true);
    expect(secondFixProof.authFailure()).toBe('forbidden');
    expect(secondMutation.canExecute()).toBe(false);
    expect(jobCards.detail()).toBeNull();
    expect(jobCards.detailError()?.kind).toBe('forbidden');
    http.expectNone(() => true);

    env.destroy();
  });

  it('K13-A04-11 invalidates JOB_1 mutation eligibility on Job Cards shared GET /jobs/{id} 403 while keeping JOB_2 mutable', () => {
    const job2Proposal = makeProposal(P2, JOB_2, {
      status: 'PendingManagerReview',
      items: [makeItem(ITEM_2)],
      total: 3001,
    });
    jobCards.refreshList();
    http.expectOne(r => r.url === JOBS_URL).flush([makeSummary(JOB_1), makeSummary(JOB_2)]);
    jobCards.selectJob(JOB_1);
    http
      .expectOne(JOB_1_URL)
      .flush(
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          proposals: [pricedProposal()],
        }),
      );

    fixProof.refreshProposals();
    http
      .expectOne(r => r.url === PROPOSALS_URL)
      .flush([pricedProposal(), job2Proposal]);
    fixProof.selectProposal(P1);
    http
      .expectOne(JOB_1_URL)
      .flush(
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          proposals: [pricedProposal()],
        }),
      );
    TestBed.tick();

    expect(mutation.canExecute()).toBe(true);
    expect(mutation.forwardProposal(P1, NOTE_FORWARD).started).toBe(true);
    const preflightGet = http.expectOne(JOB_1_URL);

    // Job Cards gets 403 on shared GET /api/v1/manager/jobs/{JOB_1}
    jobCards.refreshDetail();
    const jc403 = http.expectOne(JOB_1_URL);
    expect(jc403.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    jc403.flush(null, { status: 403, statusText: 'Forbidden' });

    expect(preflightGet.cancelled).toBe(true);
    expect(mutation.phase()).toBe('access-lost');
    expect(mutation.accessLoss()?.potentiallyExecuted).toBe(false);
    // FixProof stays usable for unrelated JOB_2!
    expect(fixProof.accessRevoked()).toBe(false);
    expect(fixProof.proposals()?.map(p => p.id)).toEqual([P2]);

    expect(fixProof.selectProposal(P2)).toBe(true);
    http
      .expectOne(`${JOBS}/${JOB_2}`)
      .flush(
        makeDetail(JOB_2, {
          status: 'AwaitingManagerReview',
          proposals: [job2Proposal],
        }),
      );
    TestBed.tick();
    expect(mutation.canExecute()).toBe(true);
    expect(mutation.forwardProposal(P2, NOTE_FORWARD).started).toBe(true);
    http
      .expectOne(`${JOBS}/${JOB_2}`)
      .flush(
        makeDetail(JOB_2, {
          status: 'AwaitingManagerReview',
          proposals: [job2Proposal],
        }),
      );
    const p2Post = http.expectOne(
      r => r.method === 'POST' && r.url === `${PROPOSALS_URL}/${P2}/forward`,
    );
    expect(p2Post.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    const p2Forwarded = makeProposal(P2, JOB_2, {
      status: 'AwaitingCustomer',
      managerNote: NOTE_FORWARD,
      items: [makeItem(ITEM_2)],
      total: 3001,
    });
    p2Post.flush(p2Forwarded);
    http.expectOne(r => r.url === PROPOSALS_URL).flush([p2Forwarded]);
    http
      .expectOne(`${JOBS}/${JOB_2}`)
      .flush(
        makeDetail(JOB_2, {
          status: 'AwaitingCustomerApproval',
          proposals: [p2Forwarded],
        }),
      );
    TestBed.tick();
    expect(mutation.phase()).toBe('succeeded');
  });

  describe('K13-A04-R3-R1 real HTTP recovery', () => {
    const FORWARD_URL = `${PROPOSALS_URL}/${P1}/forward`;

    function pricedDetail(): JobDetailDto {
      return makeDetail(JOB_1, {
        status: 'AwaitingManagerReview',
        proposals: [pricedProposal()],
      });
    }

    function stopWaitingOnForward() {
      openBothAndSelectProposal();
      expect(mutation.forwardProposal(P1, NOTE_FORWARD).started).toBe(true);
      http.expectOne(JOB_1_URL).flush(pricedDetail());
      const post = http.expectOne(
        r => r.method === 'POST' && r.url === FORWARD_URL,
      );

      expect(mutation.stopWaiting()).toBe(true);

      return post;
    }

    function reconcileAndAcknowledge(): void {
      http.expectOne(JOB_1_URL).flush(pricedDetail());
      http.expectOne(r => r.url === PROPOSALS_URL).flush([pricedProposal()]);
      http.expectOne(JOB_1_URL).flush(pricedDetail());
      TestBed.tick();
      expect(mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);
    }

    it('K13-R3R1-IT-01 stopWaiting keeps the real POST open, never resends it and a late answer after acknowledgement changes nothing', () => {
      const unauthorized = vi.spyOn(coordinator, 'reportUnauthorized');
      const forbidden = vi.spyOn(coordinator, 'reportForbidden');
      const post = stopWaitingOnForward();

      expect(post.cancelled).toBe(false);
      expect(mutation.phase()).toBe('uncertain');
      expect(mutation.result()?.potentiallyExecuted).toBe(true);

      reconcileAndAcknowledge();
      expect(mutation.phase()).toBe('idle');
      expect(mutation.detachedRequestPending()).toBe(true);

      post.flush(
        makeProposal(P1, JOB_1, {
          status: 'AwaitingCustomer',
          managerNote: NOTE_FORWARD,
          items: [makeItem(ITEM_1)],
          total: 3001,
        }),
      );
      TestBed.tick();

      expect(mutation.detachedRequestPending()).toBe(false);
      expect(mutation.phase()).toBe('idle');
      expect(mutation.result()).toBeNull();
      expect(http.match(r => r.method === 'POST')).toHaveLength(0);
      http.expectNone(() => true);
      expect(unauthorized).not.toHaveBeenCalled();
      expect(forbidden).not.toHaveBeenCalled();
    });

    it('K13-R3R1-IT-02 a verified Job Cards 401 releases the detached POST and keeps potentiallyExecuted', () => {
      const post = stopWaitingOnForward();
      const reconcileGet = http.expectOne(JOB_1_URL);

      jobCards.refreshList();
      http
        .expectOne(r => r.url === JOBS_URL)
        .flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(post.cancelled).toBe(true);
      expect(reconcileGet.cancelled).toBe(true);
      expect(mutation.detachedRequestPending()).toBe(false);
      expect(mutation.phase()).toBe('access-lost');
      expect(mutation.accessLoss()?.potentiallyExecuted).toBe(true);
      http.expectNone(() => true);
    });

    it('K13-R3R1-IT-03 a shared JOB_1 403 after acknowledgement releases the detached POST without other HTTP', () => {
      const post = stopWaitingOnForward();

      reconcileAndAcknowledge();
      expect(post.cancelled).toBe(false);

      jobCards.refreshDetail();
      http
        .expectOne(JOB_1_URL)
        .flush(null, { status: 403, statusText: 'Forbidden' });

      expect(coordinator.isJobResourceDenied(session.session(), JOB_1)).toBe(
        true,
      );
      expect(post.cancelled).toBe(true);
      expect(mutation.detachedRequestPending()).toBe(false);
      expect(fixProof.accessRevoked()).toBe(false);
      http.expectNone(() => true);
    });

    it('K13-R3R1-IT-04 cancelPreflight aborts the real preflight GET and sends no POST', () => {
      openBothAndSelectProposal();
      expect(mutation.forwardProposal(P1, NOTE_FORWARD).started).toBe(true);
      const preflight = http.expectOne(JOB_1_URL);

      expect(mutation.cancelPreflight()).toBe(true);
      expect(preflight.cancelled).toBe(true);
      expect(mutation.result()?.reason).toBe('preflight-cancelled');
      expect(mutation.canExecute()).toBe(true);
      http.expectNone(() => true);
    });

    it('K13-R3R1-IT-05 cancelReconciliation aborts only the real reconciliation GET; the POST outcome stays unresolved', () => {
      openBothAndSelectProposal();
      mutation.forwardProposal(P1, NOTE_FORWARD);
      http.expectOne(JOB_1_URL).flush(pricedDetail());
      http
        .expectOne(r => r.method === 'POST' && r.url === FORWARD_URL)
        .flush(null, { status: 500, statusText: 'Server Error' });
      const reconcileGet = http.expectOne(JOB_1_URL);

      expect(mutation.cancelReconciliation()).toBe(true);
      expect(reconcileGet.cancelled).toBe(true);
      expect(mutation.reconciliation()?.observation).toBe('cancelled');
      expect(mutation.hasUnresolvedOperation()).toBe(true);
      expect(fixProof.accessRevoked()).toBe(false);
      http.expectNone(() => true);
    });
  });

  function httpMockFlushSecondProposals(target: FixProofStateService): void {
    const req = http.expectOne(r => r.url === PROPOSALS_URL);
    req.flush([pricedProposal()]);
    expect(target.proposals()).not.toBeNull();
  }
});

describe('FixProofMutationStateService K13-A04-R4 navigation protection and R3 interoperability', () => {
  let mutation: FixProofMutationStateService;
  let fixProof: FixProofStateService;
  let protection: FixProofNavigationProtectionService;
  let session: SessionService;
  let fake: ReturnType<typeof createFakes>;
  let listeners: Set<(event: BeforeUnloadEvent) => void>;

  function createUnloadTarget(): FixProofBeforeUnloadTarget {
    listeners = new Set();
    return {
      addEventListener(type, listener) {
        if (type === 'beforeunload') {
          listeners.add(listener);
        }
      },
      removeEventListener(type, listener) {
        if (type === 'beforeunload') {
          listeners.delete(listener);
        }
      },
    };
  }

  function respond<T>(subject: Subject<T>, value: T): void {
    subject.next(value);
    subject.complete();
  }

  function last<T>(items: readonly T[]): T {
    return items[items.length - 1];
  }

  function openProposal(proposal: ProposalDto, jobStatus: string): void {
    fixProof.refreshProposals();
    respond(last(fake.proposalCalls), [proposal]);
    fixProof.selectProposal(proposal.id);
    respond(
      last(fake.detailCalls).subject,
      makeDetail(proposal.jobCardId, { status: jobStatus, proposals: [proposal] }),
    );
    TestBed.tick();
  }

  function openChangeRequest(cr: ChangeRequestDto, jobStatus: string): void {
    fixProof.refreshChangeRequests();
    respond(last(fake.changeCalls), [cr]);
    fixProof.selectChangeRequest(cr.id);
    respond(
      last(fake.detailCalls).subject,
      makeDetail(cr.jobCardId, { status: jobStatus, changeRequests: [cr] }),
    );
    TestBed.tick();
  }

  function openAndDispatchProposalForward(): MutationCall {
    const base = pendingProposal({
      items: [makeItem(ITEM_1), item2('Proposed')],
    });
    openProposal(base, 'AwaitingManagerReview');
    expect(mutation.forwardProposal(P1, NOTE_FORWARD).started).toBe(true);
    expect(mutation.phase()).toBe('validating');
    expect(protection.requiresNavigationProtection()).toBe(false);
    expect(listeners.size).toBe(0);

    respond(
      last(fake.detailCalls).subject,
      makeDetail(JOB_1, { status: 'AwaitingManagerReview', proposals: [base] }),
    );
    expect(mutation.phase()).toBe('submitting');
    return last(fake.mutationCalls);
  }

  const allSevenActions: readonly {
    readonly action: FixProofMutationAction;
    readonly dispatch: () => void;
    readonly baseDetail: () => JobDetailDto;
  }[] = [
    {
      action: 'set-price',
      dispatch: () => {
        const base = pendingProposal({
          items: [makeItem(ITEM_1), item2('Proposed')],
        });
        openProposal(base, 'AwaitingManagerReview');
        expect(mutation.setItemPrice(P1, ITEM_1, PRICE_INPUT).started).toBe(true);
        respond(
          last(fake.detailCalls).subject,
          makeDetail(JOB_1, { status: 'AwaitingManagerReview', proposals: [base] }),
        );
      },
      baseDetail: () =>
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          proposals: [pendingProposal({ items: [makeItem(ITEM_1), item2('Proposed')] })],
        }),
    },
    {
      action: 'revise',
      dispatch: () => {
        const base = publishedProposal('AwaitingCustomer');
        openProposal(base, 'AwaitingCustomerApproval');
        expect(mutation.reviseItem(P1, ITEM_1, PRICE_INPUT).started).toBe(true);
        respond(
          last(fake.detailCalls).subject,
          makeDetail(JOB_1, { status: 'AwaitingCustomerApproval', proposals: [base] }),
        );
      },
      baseDetail: () =>
        makeDetail(JOB_1, {
          status: 'AwaitingCustomerApproval',
          proposals: [publishedProposal('AwaitingCustomer')],
        }),
    },
    {
      action: 'forward',
      dispatch: () => {
        const base = pendingProposal({
          items: [makeItem(ITEM_1), item2('Proposed')],
        });
        openProposal(base, 'AwaitingManagerReview');
        expect(mutation.forwardProposal(P1, NOTE_FORWARD).started).toBe(true);
        respond(
          last(fake.detailCalls).subject,
          makeDetail(JOB_1, { status: 'AwaitingManagerReview', proposals: [base] }),
        );
      },
      baseDetail: () =>
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          proposals: [pendingProposal({ items: [makeItem(ITEM_1), item2('Proposed')] })],
        }),
    },
    {
      action: 'return',
      dispatch: () => {
        const base = pendingProposal({
          items: [makeItem(ITEM_1), item2('Proposed')],
        });
        openProposal(base, 'AwaitingManagerReview');
        expect(mutation.returnProposal(P1, NOTE_RETURN).started).toBe(true);
        respond(
          last(fake.detailCalls).subject,
          makeDetail(JOB_1, { status: 'AwaitingManagerReview', proposals: [base] }),
        );
      },
      baseDetail: () =>
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          proposals: [pendingProposal({ items: [makeItem(ITEM_1), item2('Proposed')] })],
        }),
    },
    {
      action: 'release',
      dispatch: () => {
        const base = publishedProposal('CustomerResponded');
        openProposal(base, 'AwaitingCustomerApproval');
        expect(mutation.releaseProposal(P1, NOTE_RELEASE).started).toBe(true);
        respond(
          last(fake.detailCalls).subject,
          makeDetail(JOB_1, { status: 'AwaitingCustomerApproval', proposals: [base] }),
        );
      },
      baseDetail: () =>
        makeDetail(JOB_1, {
          status: 'AwaitingCustomerApproval',
          proposals: [publishedProposal('CustomerResponded')],
        }),
    },
    {
      action: 'forward-change-request',
      dispatch: () => {
        const base = makeChangeRequest(CR1, JOB_1);
        openChangeRequest(base, 'AwaitingManagerReview');
        expect(mutation.forwardChangeRequest(CR1, NOTE_CR_FORWARD).started).toBe(
          true,
        );
        respond(
          last(fake.detailCalls).subject,
          makeDetail(JOB_1, { status: 'AwaitingManagerReview', changeRequests: [base] }),
        );
      },
      baseDetail: () =>
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          changeRequests: [makeChangeRequest(CR1, JOB_1)],
        }),
    },
    {
      action: 'decline-change-request',
      dispatch: () => {
        const base = makeChangeRequest(CR1, JOB_1);
        openChangeRequest(base, 'AwaitingManagerReview');
        expect(mutation.declineChangeRequest(CR1, NOTE_CR_DECLINE).started).toBe(
          true,
        );
        respond(
          last(fake.detailCalls).subject,
          makeDetail(JOB_1, { status: 'AwaitingManagerReview', changeRequests: [base] }),
        );
      },
      baseDetail: () =>
        makeDetail(JOB_1, {
          status: 'AwaitingManagerReview',
          changeRequests: [makeChangeRequest(CR1, JOB_1)],
        }),
    },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);

    fake = createFakes();

    TestBed.configureTestingModule({
      providers: [
        FixProofStateService,
        FixProofMutationStateService,
        { provide: FIXPROOF_BEFORE_UNLOAD_TARGET, useValue: createUnloadTarget() },
        { provide: FixProofApiService, useValue: fake.fixProofApi },
        { provide: JobCardApiService, useValue: fake.jobApi },
        { provide: FixProofMutationApiService, useValue: fake.mutationApi },
      ],
    });

    session = TestBed.inject(SessionService);
    session.setSession(makeSession());
    protection = TestBed.inject(FixProofNavigationProtectionService);
    fixProof = TestBed.inject(FixProofStateService);
    mutation = TestBed.inject(FixProofMutationStateService);
    TestBed.tick();
  });

  afterEach(() => {
    mutation.ngOnDestroy();
    fixProof.ngOnDestroy();
    protection.ngOnDestroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each(allSevenActions.map(entry => [entry.action, entry] as const))(
    'R4-R3-01 %s activates navigation/beforeunload protection immediately on dispatch and preserves action notice on destroy',
    (actionName, entry) => {
      entry.dispatch();

      expect(mutation.phase()).toBe('submitting');
      expect(protection.requiresNavigationProtection()).toBe(true);
      expect(protection.hasInFlightMutation()).toBe(true);
      expect(listeners.size).toBe(1);

      mutation.ngOnDestroy();

      expect(protection.requiresNavigationProtection()).toBe(false);
      expect(listeners.size).toBe(0);
      expect(fake.mutationCalls).toHaveLength(1);

      const notices = protection.currentSessionNotices();
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatchObject({
        action: actionName,
        reason: 'destroyed-while-submitting',
        detachedCount: 0,
        potentiallyExecuted: true,
        proofOfOutcome: 'none',
      });
      expect(JSON.stringify(notices)).not.toContain(JOB_1);
      expect(JSON.stringify(notices)).not.toContain(P1);
      expect(JSON.stringify(notices)).not.toContain(CR1);
      expect(JSON.stringify(notices)).not.toContain(ITEM_1);
      expect(JSON.stringify(notices)).not.toContain(NOTE_FORWARD);
      expect(JSON.stringify(notices)).not.toContain(TOKEN);
    },
  );

  it('R4-R3-02 cancelPreflight never activates protection and leaves zero notices on destroy', () => {
    const base = pendingProposal({
      items: [makeItem(ITEM_1), item2('Proposed')],
    });
    openProposal(base, 'AwaitingManagerReview');

    expect(mutation.forwardProposal(P1, NOTE_FORWARD).started).toBe(true);
    expect(mutation.phase()).toBe('validating');
    expect(protection.requiresNavigationProtection()).toBe(false);
    expect(listeners.size).toBe(0);

    expect(mutation.cancelPreflight()).toBe(true);
    expect(mutation.phase()).toBe('rejected');
    expect(mutation.result()?.status).toBe('not-dispatched');
    expect(mutation.result()?.reason).toBe('preflight-cancelled');
    expect(protection.requiresNavigationProtection()).toBe(false);
    expect(listeners.size).toBe(0);

    mutation.ngOnDestroy();
    expect(protection.currentSessionNotices()).toEqual([]);
    expect(fake.mutationCalls).toHaveLength(0);
  });

  it('R4-R3-03 stopWaiting, cancelReconciliation, acknowledgement with pending detached transport, and late settlement keep protection accurate with zero retries', () => {
    const call = openAndDispatchProposalForward();
    expect(protection.requiresNavigationProtection()).toBe(true);
    expect(listeners.size).toBe(1);

    // stopWaiting -> uncertain + detached transport still open.
    expect(mutation.stopWaiting()).toBe(true);
    expect(mutation.phase()).toBe('uncertain');
    expect(mutation.detachedRequestPending()).toBe(true);
    expect(protection.requiresNavigationProtection()).toBe(true);
    expect(protection.hasUnresolvedOperation()).toBe(true);
    expect(protection.hasDetachedTransport()).toBe(true);
    expect(listeners.size).toBe(1);

    // cancelReconciliation -> reconciliation-required, protection stays active.
    expect(mutation.cancelReconciliation()).toBe(true);
    expect(mutation.phase()).toBe('reconciliation-required');
    expect(protection.requiresNavigationProtection()).toBe(true);
    expect(listeners.size).toBe(1);

    // acknowledge -> phase returns to idle, BUT detached transport still pending so protection STAYS active!
    expect(mutation.acknowledge({ reviewed: true })).toEqual({
      acknowledged: true,
      reason: null,
    });
    expect(mutation.phase()).toBe('idle');
    expect(mutation.detachedRequestPending()).toBe(true);
    expect(protection.requiresNavigationProtection()).toBe(true);
    expect(protection.protectionSnapshot().reasons).toEqual([
      'detached-request-pending',
    ]);
    expect(listeners.size).toBe(1);

    // Late detached transport settles -> protection immediately deactivates, zero retries or replays.
    respond(
      call.subject,
      makeProposal(P1, JOB_1, { status: 'AwaitingCustomer' }),
    );
    expect(mutation.detachedRequestPending()).toBe(false);
    expect(protection.requiresNavigationProtection()).toBe(false);
    expect(listeners.size).toBe(0);
    expect(fake.mutationCalls).toHaveLength(1);
  });

  it('R4-R3-04 destruction while uncertain, reconciliation-required, or access-lost (potentiallyExecuted) records accurate non-sensitive notices', () => {
    // 1. Destroy while uncertain.
    const call1 = openAndDispatchProposalForward();
    call1.subject.error(new ApiError(500, 'SERVER_ERROR', 'Server error'));
    expect(mutation.phase()).toBe('uncertain');
    mutation.ngOnDestroy();

    expect(protection.currentSessionNotices()).toHaveLength(1);
    expect(protection.currentSessionNotices()[0]).toMatchObject({
      action: 'forward',
      reason: 'destroyed-while-uncertain',
      potentiallyExecuted: true,
      proofOfOutcome: 'none',
    });
    expect(protection.dismissAllNotices()).toBe(true);

    // 2. Destroy while reconciliation-required (same-session re-entry via fresh instance).
    const env2 = createEnvironmentInjector(
      [FixProofStateService, FixProofMutationStateService],
      TestBed.inject(EnvironmentInjector),
    );
    const fp2 = env2.get(FixProofStateService);
    const mut2 = env2.get(FixProofMutationStateService);
    const base = pendingProposal({
      items: [makeItem(ITEM_1), item2('Proposed')],
    });
    fp2.refreshProposals();
    respond(last(fake.proposalCalls), [base]);
    fp2.selectProposal(P1);
    respond(
      last(fake.detailCalls).subject,
      makeDetail(JOB_1, { status: 'AwaitingManagerReview', proposals: [base] }),
    );
    TestBed.tick();
    mut2.returnProposal(P1, NOTE_RETURN);
    respond(
      last(fake.detailCalls).subject,
      makeDetail(JOB_1, { status: 'AwaitingManagerReview', proposals: [base] }),
    );
    last(fake.mutationCalls).subject.error(
      new ApiError(500, 'SERVER_ERROR', 'Server error'),
    );
    expect(mut2.cancelReconciliation()).toBe(true);
    expect(mut2.phase()).toBe('reconciliation-required');
    env2.destroy();

    expect(protection.currentSessionNotices()).toHaveLength(1);
    expect(protection.currentSessionNotices()[0]).toMatchObject({
      action: 'return',
      reason: 'destroyed-while-reconciliation-required',
      potentiallyExecuted: true,
    });
    expect(protection.dismissAllNotices()).toBe(true);

    // 3. Destroy while access-lost with potentiallyExecuted === true.
    const env3 = createEnvironmentInjector(
      [FixProofStateService, FixProofMutationStateService],
      TestBed.inject(EnvironmentInjector),
    );
    const fp3 = env3.get(FixProofStateService);
    const mut3 = env3.get(FixProofMutationStateService);
    fp3.refreshProposals();
    respond(last(fake.proposalCalls), [base]);
    fp3.selectProposal(P1);
    respond(
      last(fake.detailCalls).subject,
      makeDetail(JOB_1, { status: 'AwaitingManagerReview', proposals: [base] }),
    );
    TestBed.tick();
    mut3.forwardProposal(P1, NOTE_FORWARD);
    respond(
      last(fake.detailCalls).subject,
      makeDetail(JOB_1, { status: 'AwaitingManagerReview', proposals: [base] }),
    );
    fp3.revokeFeatureAccess('forbidden');
    TestBed.tick();
    expect(mut3.phase()).toBe('access-lost');
    expect(mut3.accessLoss()?.potentiallyExecuted).toBe(true);
    env3.destroy();

    expect(protection.currentSessionNotices()).toHaveLength(1);
    expect(protection.currentSessionNotices()[0]).toMatchObject({
      action: 'forward',
      reason: 'destroyed-while-access-lost',
      potentiallyExecuted: true,
    });
  });

  it('R4-R3-05 destruction with acknowledged detached transport(s) preserves risk with action === null and never misattributes to a newer operation', () => {
    // First operation: forward -> stopWaiting -> cancelReconciliation -> acknowledge (detached #1 remains).
    openAndDispatchProposalForward();
    expect(mutation.stopWaiting()).toBe(true);
    expect(mutation.cancelReconciliation()).toBe(true);
    expect(mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);

    // Second operation: return -> stopWaiting -> cancelReconciliation -> acknowledge (detached #2 remains).
    const base = pendingProposal({
      items: [makeItem(ITEM_1), item2('Proposed')],
    });
    openProposal(base, 'AwaitingManagerReview');
    expect(mutation.returnProposal(P1, NOTE_RETURN).started).toBe(true);
    respond(
      last(fake.detailCalls).subject,
      makeDetail(JOB_1, { status: 'AwaitingManagerReview', proposals: [base] }),
    );
    expect(mutation.stopWaiting()).toBe(true);
    expect(mutation.cancelReconciliation()).toBe(true);
    expect(mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);

    // Start a third operation (set-price) that only enters validating (not dispatched).
    openProposal(base, 'AwaitingManagerReview');
    expect(mutation.setItemPrice(P1, ITEM_1, PRICE_INPUT).started).toBe(true);
    expect(mutation.phase()).toBe('validating');
    expect(protection.requiresNavigationProtection()).toBe(true);
    expect(protection.protectionSnapshot().detachedTransportCount).toBe(2);

    mutation.ngOnDestroy();

    // Preserved notice must record detachedCount: 2 with action: null (NEVER misattributed to 'set-price').
    const notices = protection.currentSessionNotices();
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      action: null,
      reason: 'destroyed-with-detached-request',
      detachedCount: 2,
      potentiallyExecuted: true,
      proofOfOutcome: 'none',
    });
  });

  it('R4-R3-06 definitively resolved operations (succeeded, rejected, access-lost without potential execution) record zero notices on destroy', () => {
    const call = openAndDispatchProposalForward();
    const forwarded = makeProposal(P1, JOB_1, { status: 'AwaitingCustomer' });
    respond(call.subject, forwarded);
    respond(last(fake.proposalCalls), [forwarded]);
    respond(
      last(fake.detailCalls).subject,
      makeDetail(JOB_1, {
        status: 'AwaitingCustomerApproval',
        proposals: [forwarded],
      }),
    );
    TestBed.tick();

    expect(mutation.phase()).toBe('succeeded');
    expect(protection.requiresNavigationProtection()).toBe(false);
    expect(listeners.size).toBe(0);

    mutation.ngOnDestroy();
    expect(protection.currentSessionNotices()).toEqual([]);
  });

  it('R4-R3-07 isolates notices across session replacement and preserves protection when an idle sibling instance is destroyed', () => {
    const siblingEnv = createEnvironmentInjector(
      [FixProofStateService, FixProofMutationStateService],
      TestBed.inject(EnvironmentInjector),
    );
    siblingEnv.get(FixProofMutationStateService);

    openAndDispatchProposalForward();
    expect(protection.protectionSnapshot().activeInstanceCount).toBe(2);
    expect(protection.requiresNavigationProtection()).toBe(true);
    expect(listeners.size).toBe(1);

    // Destroying idle sibling keeps primary protection and beforeunload active.
    siblingEnv.destroy();
    expect(protection.protectionSnapshot().activeInstanceCount).toBe(1);
    expect(protection.requiresNavigationProtection()).toBe(true);
    expect(listeners.size).toBe(1);

    // Destroy primary -> notice recorded for session A.
    mutation.ngOnDestroy();
    expect(protection.currentSessionNotices()).toHaveLength(1);

    // Replace session -> session B sees zero notices from session A.
    session.setSession(makeSession('manager-002'));
    expect(protection.currentSessionNotices()).toEqual([]);
    expect(protection.hasCurrentSessionNotices()).toBe(false);
  });
});
