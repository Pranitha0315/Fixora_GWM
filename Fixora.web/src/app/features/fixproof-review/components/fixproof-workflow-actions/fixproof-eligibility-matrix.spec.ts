import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { SessionService } from '../../../../core/auth/session.service';
import { API_CONFIG } from '../../../../core/config/api.config';
import { authInterceptor } from '../../../../core/interceptors/auth.interceptor';
import { errorInterceptor } from '../../../../core/interceptors/error.interceptor';
import type { AuthSession } from '../../../../core/models/auth-session.model';

import type { JobDetailDto } from '../../../job-cards/models/job-card.model';
import {
  CHANGE_REQUEST_STATUSES,
  PROPOSAL_STATUSES,
  type ChangeRequestDto,
  type ChangeRequestStatus,
  type ProposalDto,
  type ProposalStatus,
} from '../../models/fixproof.model';
import { FixProofMutationStateService } from '../../services/fixproof-mutation-state.service';
import { FIXPROOF_BEFORE_UNLOAD_TARGET } from '../../services/fixproof-navigation-protection.service';
import { FixProofStateService } from '../../services/fixproof-state.service';
import { FixProofWorkflowActions } from './fixproof-workflow-actions';

const API_BASE = 'https://api.fixora.test';
const BASE_TIME = Date.UTC(2026, 10, 28, 12, 0, 0);
const JOB_1 = '11111111-1111-4111-8111-111111111111';
const PROP_1 = '22222222-2222-4222-8222-222222222222';
const CR_1 = '33333333-3333-4333-8333-333333333333';

function installDialogTestMethods(): () => void {
  const prototype = HTMLDialogElement.prototype;
  const originalShowModal = Object.getOwnPropertyDescriptor(
    prototype,
    'showModal',
  );
  const originalClose = Object.getOwnPropertyDescriptor(prototype, 'close');

  if (typeof prototype.showModal !== 'function') {
    Object.defineProperty(prototype, 'showModal', {
      configurable: true,
      writable: true,
      value: function (this: HTMLDialogElement): void {
        this.setAttribute('open', '');
      },
    });
  }

  if (typeof prototype.close !== 'function') {
    Object.defineProperty(prototype, 'close', {
      configurable: true,
      writable: true,
      value: function (this: HTMLDialogElement): void {
        this.removeAttribute('open');
      },
    });
  }

  return () => {
    if (originalShowModal) {
      Object.defineProperty(prototype, 'showModal', originalShowModal);
    } else {
      Reflect.deleteProperty(prototype, 'showModal');
    }

    if (originalClose) {
      Object.defineProperty(prototype, 'close', originalClose);
    } else {
      Reflect.deleteProperty(prototype, 'close');
    }
  };
}

function makeSession(): AuthSession {
  return {
    accessToken: 'token-manager-matrix',
    expiresAt: BASE_TIME + 300_000,
    user: {
      id: 'manager-matrix',
      displayName: 'Matrix Manager',
      email: 'matrix@fixora.test',
      roles: ['Manager'],
    },
  };
}

function makeProposal(status: ProposalStatus): ProposalDto {
  return {
    id: PROP_1,
    jobCardId: JOB_1,
    jobNumber: 'JC-2026-701',
    vehicleLabel: 'Maruti Baleno',
    customerName: 'Rohan',
    status,
    mechanicId: '44444444-4444-4444-8444-444444444444',
    mechanicName: 'Arun',
    mechanicNote: null,
    managerNote: null,
    customerNote: null,
    submittedAt: '2026-11-28T09:00:00Z',
    publishedAt:
      status === 'AwaitingCustomer' ||
      status === 'CustomerResponded' ||
      status === 'ReleasedToMechanic'
        ? '2026-11-28T09:30:00Z'
        : null,
    respondedAt:
      status === 'CustomerResponded' || status === 'ReleasedToMechanic'
        ? '2026-11-28T10:00:00Z'
        : null,
    releasedAt:
      status === 'ReleasedToMechanic' ? '2026-11-28T10:30:00Z' : null,
    total: 1500,
    approvedTotal:
      status === 'CustomerResponded' || status === 'ReleasedToMechanic'
        ? 1500
        : 0,
    items: [
      {
        id: '55555555-5555-4555-8555-555555555555',
        title: 'Engine Oil Filter',
        kind: 'Part',
        qty: 1,
        unitPrice: 1500,
        amount: 1500,
        version: 1,
        status: status === 'ReleasedToMechanic' ? 'Released' : 'Proposed',
        linkedIssueId: null,
      },
    ],
    audit: [],
  };
}

function makeChangeRequest(status: ChangeRequestStatus): ChangeRequestDto {
  return {
    id: CR_1,
    jobCardId: JOB_1,
    jobNumber: 'JC-2026-701',
    number: 'CR-2026-701',
    changes: ['Wheel alignment'],
    details: 'Add wheel alignment check',
    status,
    managerNote: null,
    mechanicNote: null,
    createdAt: '2026-11-28T09:15:00Z',
  };
}

function makeDetail(
  proposal: ProposalDto,
  cr: ChangeRequestDto,
  jobStatus = 'AwaitingManagerReview',
): JobDetailDto {
  return {
    job: {
      id: JOB_1,
      number: 'JC-2026-701',
      customerId: '66666666-6666-4666-8666-666666666666',
      customerName: 'Rohan',
      vehicleId: '77777777-7777-4777-8777-777777777777',
      vehicleLabel: 'Maruti Baleno',
      mechanicId: '44444444-4444-4444-8444-444444444444',
      mechanicName: 'Arun',
      bayId: null,
      bayName: null,
      status: jobStatus,
      priority: 1,
      queuePosition: 1,
      etaAt: null,
      estimatedMinutes: 60,
      elapsedMinutes: 0,
      createdAt: '2026-11-28T08:00:00Z',
      startedAt: null,
      completedAt: null,
      complaint: null,
      managerNote: null,
    },
    timeline: [],
    issues: [],
    proposals: [proposal],
    changeRequests: [cr],
    invoice: null,
    queue: {
      jobId: JOB_1,
      position: 1,
      etaAt: null,
      status: jobStatus,
      indicative: true,
    },
  };
}

describe('FixProof Action Eligibility Matrix & Conflict Recovery (K16)', () => {
  let fixture: ComponentFixture<FixProofWorkflowActions>;
  let component: FixProofWorkflowActions;
  let http: HttpTestingController;
  let session: SessionService;
  let state: FixProofStateService;
  let mutation: FixProofMutationStateService;
  let cleanupDialog: (() => void) | null = null;

  beforeEach(async () => {
    cleanupDialog = installDialogTestMethods();
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);

    await TestBed.configureTestingModule({
      imports: [FixProofWorkflowActions],
      providers: [
        provideHttpClient(
          withInterceptors([errorInterceptor, authInterceptor]),
        ),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: API_BASE } },
        {
          provide: FIXPROOF_BEFORE_UNLOAD_TARGET,
          useValue: {
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          },
        },
        FixProofStateService,
        FixProofMutationStateService,
      ],
    }).compileComponents();

    session = TestBed.inject(SessionService);
    http = TestBed.inject(HttpTestingController);
    state = TestBed.inject(FixProofStateService);
    mutation = TestBed.inject(FixProofMutationStateService);
    session.setSession(makeSession());

    fixture = TestBed.createComponent(FixProofWorkflowActions);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    http.verify();
    cleanupDialog?.();
    cleanupDialog = null;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function loadProposal(
    status: ProposalStatus,
    jobStatus = 'AwaitingManagerReview',
  ): ProposalDto {
    const proposal = makeProposal(status);
    state.clearSelection();
    state.setProposalStatusFilter(status);
    http
      .expectOne(
        `${API_BASE}/api/v1/manager/approvals/proposals?status=${status}`,
      )
      .flush([proposal]);
    state.selectProposal(proposal.id);
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeDetail(proposal, makeChangeRequest('PendingManagerReview'), jobStatus));
    fixture.detectChanges();
    return proposal;
  }

  function loadChangeRequest(
    status: ChangeRequestStatus,
    jobStatus = 'AwaitingManagerReview',
  ): ChangeRequestDto {
    const cr = makeChangeRequest(status);
    state.clearSelection();
    state.refreshChangeRequests();
    http
      .expectOne(
        `${API_BASE}/api/v1/manager/approvals/change-requests?pendingOnly=false`,
      )
      .flush([cr]);
    state.selectChangeRequest(cr.id);
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeDetail(makeProposal('PendingManagerReview'), cr, jobStatus));
    fixture.detectChanges();
    return cr;
  }

  it('FEM-01 enforces exact eligibility matrix across all 6 ProposalStatus states and keeps B-01 release permanently disabled', () => {
    const expected: Record<
      ProposalStatus,
      { forward: boolean; ret: boolean }
    > = {
      PendingManagerReview: { forward: true, ret: true },
      ReturnedToMechanic: { forward: false, ret: false },
      AwaitingCustomer: { forward: false, ret: false },
      CustomerResponded: { forward: false, ret: false },
      ReleasedToMechanic: { forward: false, ret: false },
      Cancelled: { forward: false, ret: false },
    };

    for (const status of PROPOSAL_STATUSES) {
      loadProposal(status);
      expect(component.canForwardProposal()).toBe(expected[status].forward);
      expect(component.canReturnProposal()).toBe(expected[status].ret);

      const el = fixture.nativeElement as HTMLElement;
      const releaseBtn = el.querySelector(
        '[data-testid="release-proposal-disabled-btn"] button',
      ) as HTMLButtonElement | null;
      expect(releaseBtn?.disabled).toBe(true);
      expect(el.textContent).not.toContain('inventory deducted successfully');
    }
  });

  it('FEM-02 enforces exact eligibility matrix across all 4 ChangeRequestStatus states', () => {
    const expected: Record<
      ChangeRequestStatus,
      { forward: boolean; decline: boolean }
    > = {
      PendingManagerReview: { forward: true, decline: true },
      ForwardedToMechanic: { forward: false, decline: false },
      Declined: { forward: false, decline: false },
      Acknowledged: { forward: false, decline: false },
    };

    for (const status of CHANGE_REQUEST_STATUSES) {
      loadChangeRequest(status);
      expect(component.canForwardChangeRequest()).toBe(expected[status].forward);
      expect(component.canDeclineChangeRequest()).toBe(expected[status].decline);
    }
  });

  it('FEM-03 handles HTTP 409 proposal_wrong_state cleanly by rejecting safely and refreshing authoritative data', () => {
    const prop = loadProposal('PendingManagerReview');

    component.requestForwardProposal();
    component.confirmWorkflowAction();
    fixture.detectChanges();

    // Preflight GET returns current state, then POST returns HTTP 409 proposal_wrong_state
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeDetail(prop, makeChangeRequest('PendingManagerReview')));

    http
      .expectOne(`${API_BASE}/api/v1/manager/approvals/proposals/${PROP_1}/forward`)
      .flush(
        { code: 'proposal_wrong_state', message: 'RAW_INTERNAL_SQL_STACK' },
        { status: 409, statusText: 'Conflict' },
      );

    // Authoritative post-rejection refresh
    const updated = makeProposal('AwaitingCustomer');
    http
      .expectOne(
        `${API_BASE}/api/v1/manager/approvals/proposals?status=PendingManagerReview`,
      )
      .flush([]);
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeDetail(updated, makeChangeRequest('PendingManagerReview')));
    fixture.detectChanges();

    expect(mutation.phase()).toBe('rejected');
    expect(mutation.result()?.message).not.toContain('RAW_INTERNAL_SQL_STACK');
    expect(component.pendingConfirmation()).toBeNull();
  });

  it('FEM-04 handles HTTP 409 change_wrong_state on change-request decline with authoritative refresh', () => {
    const cr = loadChangeRequest('PendingManagerReview');

    component.mandatoryReasonDraft.set('Already included in active scope');
    component.requestDeclineChangeRequest();
    component.confirmWorkflowAction();
    fixture.detectChanges();

    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeDetail(makeProposal('PendingManagerReview'), cr));

    http
      .expectOne(
        `${API_BASE}/api/v1/manager/approvals/change-requests/${CR_1}/decline`,
      )
      .flush(
        { code: 'change_wrong_state', message: 'INTERNAL_SECRET_TRACE' },
        { status: 409, statusText: 'Conflict' },
      );

    const handled = makeChangeRequest('ForwardedToMechanic');
    http
      .expectOne(
        `${API_BASE}/api/v1/manager/approvals/change-requests?pendingOnly=false`,
      )
      .flush([handled]);
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeDetail(makeProposal('PendingManagerReview'), handled));
    fixture.detectChanges();

    expect(mutation.phase()).toBe('rejected');
    expect(mutation.result()?.message).not.toContain('INTERNAL_SECRET_TRACE');
  });

  it('FEM-05 transitions to uncertain/reconciliation-required on network drop, never auto-retries, and requires explicit non-definitive acknowledgement', () => {
    const prop = loadProposal('PendingManagerReview');

    component.requestForwardProposal();
    component.confirmWorkflowAction();
    fixture.detectChanges();

    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeDetail(prop, makeChangeRequest('PendingManagerReview')));

    // Simulate network drop (status 0)
    http
      .expectOne(`${API_BASE}/api/v1/manager/approvals/proposals/${PROP_1}/forward`)
      .error(new ProgressEvent('error'));
    fixture.detectChanges();

    // Automatic read-only reconciliation GET fires (never a second POST)
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeDetail(prop, makeChangeRequest('PendingManagerReview')));
    http
      .expectOne(
        `${API_BASE}/api/v1/manager/approvals/proposals?status=PendingManagerReview`,
      )
      .flush([prop]);
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeDetail(prop, makeChangeRequest('PendingManagerReview')));
    fixture.detectChanges();

    expect(mutation.phase()).toBe('reconciliation-required');
    expect(mutation.reconciliation()?.definitive).toBe(false);
    expect(component.canForwardProposal()).toBe(false);
    http.expectNone(req => req.method === 'POST');

    // Explicit acknowledgement never claims proof of outcome and does not auto-retry
    const ack = mutation.acknowledge({ reviewed: true });
    expect(ack.acknowledged).toBe(true);
    expect(mutation.lastAcknowledgement()?.proofOfOutcome).toBe('none');
    expect(mutation.phase()).toBe('idle');
    expect(mutation.hasUnresolvedOperation()).toBe(false);
    http.expectNone(req => req.method === 'POST');
    fixture.detectChanges();
  });

  it('FEM-06 blocks proposal and change-request workflow actions when authoritative job status is terminal (Completed/Closed)', () => {
    loadProposal('PendingManagerReview', 'Completed');
    expect(component.canForwardProposal()).toBe(false);
    expect(component.canReturnProposal()).toBe(false);

    loadChangeRequest('PendingManagerReview', 'Closed');
    expect(component.canForwardChangeRequest()).toBe(false);
    expect(component.canDeclineChangeRequest()).toBe(false);
  });
});
