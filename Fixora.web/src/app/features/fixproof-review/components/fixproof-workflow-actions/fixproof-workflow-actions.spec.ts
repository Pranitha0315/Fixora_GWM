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
import type {
  ChangeRequestDto,
  ProposalDto,
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

function makeSession(id = 'manager-001'): AuthSession {
  return {
    accessToken: `token-${id}`,
    expiresAt: BASE_TIME + 300_000,
    user: {
      id,
      displayName: 'Test Manager',
      email: `${id}@fixora.test`,
      roles: ['Manager'],
    },
  };
}

function makeProposal(overrides: Partial<ProposalDto> = {}): ProposalDto {
  return {
    id: PROP_1,
    jobCardId: JOB_1,
    jobNumber: 'JC-2026-501',
    vehicleLabel: 'Hyundai Creta',
    customerName: 'Vikram',
    status: 'PendingManagerReview',
    mechanicId: '44444444-4444-4444-8444-444444444444',
    mechanicName: 'Karthik',
    mechanicNote: null,
    managerNote: null,
    customerNote: null,
    submittedAt: '2026-11-28T09:00:00Z',
    publishedAt: null,
    respondedAt: null,
    releasedAt: null,
    total: 2500,
    approvedTotal: 0,
    items: [
      {
        id: '55555555-5555-4555-8555-555555555555',
        title: 'Air Filter',
        kind: 'Part',
        qty: 1,
        unitPrice: 2500,
        amount: 2500,
        version: 1,
        status: 'Proposed',
        linkedIssueId: null,
      },
    ],
    audit: [],
    ...overrides,
  };
}

function makeChangeRequest(
  overrides: Partial<ChangeRequestDto> = {},
): ChangeRequestDto {
  return {
    id: CR_1,
    jobCardId: JOB_1,
    jobNumber: 'JC-2026-501',
    number: 'CR-2026-042',
    changes: ['Inspect cabin filter'],
    details: 'Customer requested cabin filter inspection',
    status: 'PendingManagerReview',
    managerNote: null,
    mechanicNote: null,
    createdAt: '2026-11-28T09:30:00Z',
    ...overrides,
  };
}

function makeJobDetail(
  proposal: ProposalDto = makeProposal(),
  cr: ChangeRequestDto = makeChangeRequest(),
  jobStatus = 'AwaitingManagerReview',
): JobDetailDto {
  return {
    job: {
      id: JOB_1,
      number: 'JC-2026-501',
      customerId: '66666666-6666-4666-8666-666666666666',
      customerName: 'Vikram',
      vehicleId: '77777777-7777-4777-8777-777777777777',
      vehicleLabel: 'Hyundai Creta',
      mechanicId: '44444444-4444-4444-8444-444444444444',
      mechanicName: 'Karthik',
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

describe('FixProofWorkflowActions (K15)', () => {
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

  function selectProposal(
    proposal: ProposalDto = makeProposal(),
    jobStatus = 'AwaitingManagerReview',
  ): void {
    state.refreshProposals();
    http
      .expectOne(`${API_BASE}/api/v1/manager/approvals/proposals`)
      .flush([proposal]);
    state.selectProposal(proposal.id);
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeJobDetail(proposal, makeChangeRequest(), jobStatus));
    fixture.detectChanges();
  }

  function selectChangeRequest(
    cr: ChangeRequestDto = makeChangeRequest(),
    jobStatus = 'AwaitingManagerReview',
  ): void {
    state.refreshChangeRequests();
    http
      .expectOne(
        `${API_BASE}/api/v1/manager/approvals/change-requests?pendingOnly=false`,
      )
      .flush([cr]);
    state.selectChangeRequest(cr.id);
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeJobDetail(makeProposal(), cr, jobStatus));
    fixture.detectChanges();
  }

  it('FWA-01 confirms and dispatches forwardProposal once with optional manager note, never retrying automatically', () => {
    const prop = makeProposal();
    selectProposal(prop);

    component.forwardNoteDraft.set('Approved pricing verified');
    component.requestForwardProposal();
    fixture.detectChanges();
    expect(component.pendingConfirmation()?.action).toBe('forward-proposal');

    // Cancel first -> zero HTTP requests
    component.cancelConfirmation();
    fixture.detectChanges();
    http.expectNone(() => true);

    // Confirm -> authoritative preflight + single POST .../forward + refreshes
    component.requestForwardProposal();
    component.confirmWorkflowAction();
    fixture.detectChanges();

    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeJobDetail(prop));

    const forwarded = makeProposal({
      status: 'AwaitingCustomer',
      publishedAt: '2026-11-28T12:00:00Z',
      managerNote: 'Approved pricing verified',
    });
    const postReq = http.expectOne(
      `${API_BASE}/api/v1/manager/approvals/proposals/${PROP_1}/forward`,
    );
    expect(postReq.request.method).toBe('POST');
    expect(postReq.request.body).toEqual({ note: 'Approved pricing verified' });
    postReq.flush(forwarded);

    http
      .expectOne(`${API_BASE}/api/v1/manager/approvals/proposals`)
      .flush([forwarded]);
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeJobDetail(forwarded, makeChangeRequest(), 'AwaitingCustomerApproval'));
    fixture.detectChanges();

    expect(mutation.phase()).toBe('succeeded');
    expect(component.forwardNoteDraft()).toBe('');
  });

  it('FWA-02 enforces mandatory non-blank reason before confirming returnProposal', () => {
    const prop = makeProposal();
    selectProposal(prop);

    component.mandatoryReasonDraft.set('   ');
    component.requestReturnProposal();
    fixture.detectChanges();

    expect(component.pendingConfirmation()).toBeNull();
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="proposal-return-reason-error"]',
      ),
    ).toBeTruthy();

    component.mandatoryReasonDraft.set('Verify brake rotor thickness');
    component.requestReturnProposal();
    component.confirmWorkflowAction();
    fixture.detectChanges();

    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeJobDetail(prop));

    const returned = makeProposal({
      status: 'ReturnedToMechanic',
      managerNote: 'Verify brake rotor thickness',
    });
    const postReq = http.expectOne(
      `${API_BASE}/api/v1/manager/approvals/proposals/${PROP_1}/return`,
    );
    expect(postReq.request.body).toEqual({
      note: 'Verify brake rotor thickness',
    });
    postReq.flush(returned);

    http
      .expectOne(`${API_BASE}/api/v1/manager/approvals/proposals`)
      .flush([returned]);
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeJobDetail(returned, makeChangeRequest(), 'Inspecting'));
    fixture.detectChanges();

    expect(mutation.phase()).toBe('succeeded');
  });

  it('FWA-03 keeps live releaseProposal permanently disabled (B-01) even when proposal status is CustomerResponded', () => {
    const releaseSpy = vi.spyOn(mutation, 'releaseProposal');
    const responded = makeProposal({
      status: 'CustomerResponded',
      publishedAt: '2026-11-28T09:30:00Z',
      respondedAt: '2026-11-28T10:00:00Z',
      approvedTotal: 2500,
    });

    selectProposal(responded, 'AwaitingRelease');
    const el = fixture.nativeElement as HTMLElement;

    const releaseBtn = el.querySelector(
      '[data-testid="release-proposal-disabled-btn"] button',
    ) as HTMLButtonElement | null;
    expect(releaseBtn).toBeTruthy();
    expect(releaseBtn!.disabled).toBe(true);
    expect(el.textContent).toContain('Release: Disabled (B-01)');
    expect(releaseSpy).not.toHaveBeenCalled();
  });

  it('FWA-04 confirms and dispatches forwardChangeRequest with optional manager note', () => {
    const cr = makeChangeRequest();
    selectChangeRequest(cr);

    component.forwardNoteDraft.set('Inspect during routine check');
    component.requestForwardChangeRequest();
    component.confirmWorkflowAction();
    fixture.detectChanges();

    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeJobDetail(makeProposal(), cr));

    const forwarded = makeChangeRequest({
      status: 'ForwardedToMechanic',
      managerNote: 'Inspect during routine check',
    });
    const postReq = http.expectOne(
      `${API_BASE}/api/v1/manager/approvals/change-requests/${CR_1}/forward`,
    );
    expect(postReq.request.body).toEqual({
      note: 'Inspect during routine check',
    });
    postReq.flush(forwarded);

    http
      .expectOne(
        `${API_BASE}/api/v1/manager/approvals/change-requests?pendingOnly=false`,
      )
      .flush([forwarded]);
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeJobDetail(makeProposal(), forwarded));
    fixture.detectChanges();

    expect(mutation.phase()).toBe('succeeded');
  });

  it('FWA-05 enforces mandatory non-blank reason before confirming declineChangeRequest', () => {
    const cr = makeChangeRequest();
    selectChangeRequest(cr);

    component.mandatoryReasonDraft.set('');
    component.requestDeclineChangeRequest();
    fixture.detectChanges();

    expect(component.pendingConfirmation()).toBeNull();
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="cr-decline-reason-error"]',
      ),
    ).toBeTruthy();

    component.mandatoryReasonDraft.set('Out of scope for current service booking');
    component.requestDeclineChangeRequest();
    component.confirmWorkflowAction();
    fixture.detectChanges();

    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeJobDetail(makeProposal(), cr));

    const declined = makeChangeRequest({
      status: 'Declined',
      managerNote: 'Out of scope for current service booking',
    });
    const postReq = http.expectOne(
      `${API_BASE}/api/v1/manager/approvals/change-requests/${CR_1}/decline`,
    );
    expect(postReq.request.body).toEqual({
      note: 'Out of scope for current service booking',
    });
    postReq.flush(declined);

    http
      .expectOne(
        `${API_BASE}/api/v1/manager/approvals/change-requests?pendingOnly=false`,
      )
      .flush([declined]);
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeJobDetail(makeProposal(), declined));
    fixture.detectChanges();

    expect(mutation.phase()).toBe('succeeded');
  });

  it('FWA-06 blocks duplicate submissions while an unresolved/detached operation exists and preserves stopWaiting detach contract', () => {
    const prop = makeProposal();
    selectProposal(prop);

    component.requestForwardProposal();
    component.confirmWorkflowAction();
    fixture.detectChanges();

    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeJobDetail(prop));

    const postReq = http.expectOne(
      `${API_BASE}/api/v1/manager/approvals/proposals/${PROP_1}/forward`,
    );

    // Stop waiting detaches without aborting HTTP (BE-R3-01) and keeps actions locked
    mutation.stopWaiting();
    fixture.detectChanges();
    expect(postReq.cancelled).toBe(false);
    expect(component.canForwardProposal()).toBe(false);
    expect(component.canReturnProposal()).toBe(false);

    // Flush initial reconciliation read started by stopWaiting
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeJobDetail(prop));
    fixture.detectChanges();

    // Flush the K12 authoritative read-only refresh triggered after reconciliation
    http
      .expectOne(`${API_BASE}/api/v1/manager/approvals/proposals`)
      .flush([prop]);
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeJobDetail(prop));
    fixture.detectChanges();

    // Actions remain locked until explicit manager acknowledgement
    expect(component.canForwardProposal()).toBe(false);
    expect(mutation.requiresAcknowledgement()).toBe(true);
  });

  it('FWA-07 clears draft inputs and closes confirmation dialog on session replacement or access revocation', () => {
    const prop = makeProposal();
    selectProposal(prop);

    component.forwardNoteDraft.set('Sensitive draft note');
    component.requestForwardProposal();
    fixture.detectChanges();
    expect(component.pendingConfirmation()).not.toBeNull();

    // Replace session -> clears state, drafts, and confirmation dialog
    session.setSession(makeSession('manager-002'));
    fixture.detectChanges();

    expect(component.forwardNoteDraft()).toBe('');
    expect(component.pendingConfirmation()).toBeNull();
  });
});
