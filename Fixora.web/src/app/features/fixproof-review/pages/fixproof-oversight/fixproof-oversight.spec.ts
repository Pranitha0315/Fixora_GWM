import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { SessionService } from '../../../../core/auth/session.service';
import { API_CONFIG } from '../../../../core/config/api.config';
import { authInterceptor } from '../../../../core/interceptors/auth.interceptor';
import { errorInterceptor } from '../../../../core/interceptors/error.interceptor';
import type { AuthSession } from '../../../../core/models/auth-session.model';

import type { JobDetailDto } from '../../../job-cards/models/job-card.model';
import { SIGNED_MEDIA_CLOCK } from '../../../job-cards/services/signed-media-url.service';

import type {
  ChangeRequestDto,
  ProposalDto,
} from '../../models/fixproof.model';
import { FixProofMutationStateService } from '../../services/fixproof-mutation-state.service';
import { FixProofNavigationConfirmationService } from '../../services/fixproof-navigation-confirmation.service';
import {
  FIXPROOF_BEFORE_UNLOAD_TARGET,
  FixProofNavigationProtectionService,
} from '../../services/fixproof-navigation-protection.service';
import { FixProofStateService } from '../../services/fixproof-state.service';

import { FixProofOversight } from './fixproof-oversight';

const BASE_TIME = Date.UTC(2026, 10, 28, 12, 0, 0);
const API_BASE = 'https://api.fixora.test';
const JOB_1 = '11111111-1111-4111-8111-111111111111';
const PROP_1 = '22222222-2222-4222-8222-222222222222';
const ITEM_1 = '33333333-3333-4333-8333-333333333333';
const CR_1 = '44444444-4444-4444-8444-444444444444';
const ISSUE_1 = '55555555-5555-4555-8555-555555555555';
const MECH_1 = '66666666-6666-4666-8666-666666666666';
const CUST_1 = '77777777-7777-4777-8777-777777777777';
const VEH_1 = '88888888-8888-4888-8888-888888888888';

const VALID_EXP = Math.floor(BASE_TIME / 1000) + 600;
const RAW_SIGNED_URL = `${API_BASE}/api/v1/media/evidence-brake.jpg?exp=${VALID_EXP}&sig=YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY`;

function makeSession(id = 'mgr-1'): AuthSession {
  return {
    accessToken: `token-${id}`,
    expiresAt: BASE_TIME + 300_000,
    user: {
      id,
      displayName: 'Workshop Manager',
      email: `${id}@fixora.test`,
      roles: ['Manager'],
    },
  };
}

function makeProposal(overrides: Partial<ProposalDto> = {}): ProposalDto {
  return {
    id: PROP_1,
    jobCardId: JOB_1,
    jobNumber: 'JC-2026-001',
    vehicleLabel: 'Toyota Corolla (CAB-1234)',
    customerName: 'Nimal Perera',
    status: 'PendingManagerReview',
    mechanicId: MECH_1,
    mechanicName: 'Kamal Silva',
    mechanicNote: 'Front pads worn below limit',
    managerNote: null,
    customerNote: null,
    submittedAt: '2026-11-28T09:00:00Z',
    publishedAt: null,
    respondedAt: null,
    releasedAt: null,
    total: 12500,
    approvedTotal: 0,
    items: [
      {
        id: ITEM_1,
        title: 'Front brake pad set',
        kind: 'Part',
        qty: 1,
        unitPrice: 12500,
        amount: 12500,
        version: 1,
        status: 'Proposed',
        linkedIssueId: ISSUE_1,
      },
    ],
    audit: [
      {
        actorRole: 'Mechanic',
        action: 'Submitted',
        detail: 'Initial proposal submitted',
        at: '2026-11-28T09:00:00Z',
      },
    ],
    ...overrides,
  };
}

function makeChangeRequest(
  overrides: Partial<ChangeRequestDto> = {},
): ChangeRequestDto {
  return {
    id: CR_1,
    jobCardId: JOB_1,
    jobNumber: 'JC-2026-001',
    number: 'CR-001',
    changes: ['Add rear wiper blade replacement'],
    details: 'Customer asked to check rear wiper as well.',
    status: 'PendingManagerReview',
    managerNote: null,
    mechanicNote: null,
    createdAt: '2026-11-28T09:30:00Z',
    ...overrides,
  };
}

function makeJobDetail(
  proposal: ProposalDto = makeProposal(),
  changeRequest: ChangeRequestDto = makeChangeRequest(),
): JobDetailDto {
  return {
    job: {
      id: JOB_1,
      number: 'JC-2026-001',
      customerId: CUST_1,
      customerName: 'Nimal Perera',
      vehicleId: VEH_1,
      vehicleLabel: 'Toyota Corolla (CAB-1234)',
      mechanicId: MECH_1,
      mechanicName: 'Kamal Silva',
      bayId: null,
      bayName: null,
      status: 'AwaitingManagerReview',
      priority: 1,
      queuePosition: 2,
      etaAt: null,
      estimatedMinutes: 90,
      elapsedMinutes: 15,
      createdAt: '2026-11-28T08:00:00Z',
      startedAt: '2026-11-28T08:15:00Z',
      completedAt: null,
      complaint: 'Brake squeal on front wheels',
      managerNote: 'Staff-only note',
    },
    timeline: [],
    issues: [
      {
        id: ISSUE_1,
        component: 'Front Brakes',
        findingEn: 'Front brake pads worn to 2mm.',
        findingTa: 'முன் பிரேக் பேடுகள் தேய்ந்துள்ளன.',
        recommendationEn: 'Replace front brake pad set.',
        recommendationTa: 'முன் பிரேக் பேடுகளை மாற்றவும்.',
        severity: 'Urgent',
        mediaUrls: [RAW_SIGNED_URL],
        reportVersion: 1,
        confirmedAt: '2026-11-28T08:45:00Z',
      },
    ],
    proposals: [proposal],
    changeRequests: [changeRequest],
    invoice: null,
    queue: {
      jobId: JOB_1,
      position: 2,
      etaAt: null,
      status: 'AwaitingManagerReview',
      indicative: true,
    },
  };
}

describe('FixProofOversight (K14)', () => {
  let fixture: ComponentFixture<FixProofOversight>;
  let component: FixProofOversight;
  let http: HttpTestingController;
  let session: SessionService;
  let protection: FixProofNavigationProtectionService;
  let activeSession: AuthSession;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);

    await TestBed.configureTestingModule({
      imports: [FixProofOversight],
      providers: [
        provideRouter([]),
        provideHttpClient(
          withInterceptors([errorInterceptor, authInterceptor]),
        ),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: API_BASE } },
        { provide: SIGNED_MEDIA_CLOCK, useValue: () => BASE_TIME },
        {
          provide: FIXPROOF_BEFORE_UNLOAD_TARGET,
          useValue: {
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          },
        },
        FixProofStateService,
        FixProofMutationStateService,
        FixProofNavigationConfirmationService,
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);
    protection = TestBed.inject(FixProofNavigationProtectionService);
    activeSession = makeSession();
    session.setSession(activeSession);

    fixture = TestBed.createComponent(FixProofOversight);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    http.verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function flushInitial(
    proposals: readonly ProposalDto[] = [makeProposal()],
    changeRequests: readonly ChangeRequestDto[] = [makeChangeRequest()],
  ) {
    fixture.detectChanges();
    http
      .expectOne(`${API_BASE}/api/v1/manager/approvals/proposals`)
      .flush(proposals);
    http
      .expectOne(
        `${API_BASE}/api/v1/manager/approvals/change-requests?pendingOnly=false`,
      )
      .flush(changeRequests);
    fixture.detectChanges();
  }

  it('FPO-01 shows initial loading state, then renders server proposals, change requests, KPIs and Job Cards link', () => {
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Loading repair proposals...');
    expect(el.textContent).toContain('Loading change requests...');

    http
      .expectOne(`${API_BASE}/api/v1/manager/approvals/proposals`)
      .flush([makeProposal()]);
    http
      .expectOne(
        `${API_BASE}/api/v1/manager/approvals/change-requests?pendingOnly=false`,
      )
      .flush([makeChangeRequest()]);
    fixture.detectChanges();

    expect(el.textContent).toContain('JC-2026-001');
    expect(el.textContent).toContain('Nimal Perera');
    expect(el.textContent).toContain('12500.00');
    expect(el.textContent).toContain('CR-001');
    expect(
      el.querySelector('[data-testid="back-to-job-cards"]')?.textContent,
    ).toContain('Back to Job Cards');
  });

  it('FPO-02 sends exact server status filter and pendingOnly query parameters', () => {
    flushInitial();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain(
      'Cancelled proposals are excluded unless the Cancelled status filter is selected.',
    );

    const statusSelect = el.querySelector(
      '#fp-proposal-server-status',
    ) as HTMLSelectElement;
    statusSelect.value = 'Cancelled';
    statusSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const cancelledReq = http.expectOne(
      `${API_BASE}/api/v1/manager/approvals/proposals?status=Cancelled`,
    );
    cancelledReq.flush([]);
    fixture.detectChanges();
    expect(el.textContent).toContain('No repair proposals');

    const pendingToggle = el.querySelector(
      '#fp-cr-pending-only',
    ) as HTMLInputElement;
    pendingToggle.checked = true;
    pendingToggle.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    http
      .expectOne(
        `${API_BASE}/api/v1/manager/approvals/change-requests?pendingOnly=true`,
      )
      .flush([makeChangeRequest()]);
    fixture.detectChanges();
  });

  it('FPO-03 displays honest 100-cap truncation advisories for proposals and change requests', () => {
    const hundredProposals = Array.from({ length: 100 }, (_, i) =>
      makeProposal({
        id: `22222222-2222-4222-8222-${String(i).padStart(12, '0')}`,
        jobNumber: `JC-${i}`,
      }),
    );
    const hundredCrs = Array.from({ length: 100 }, (_, i) =>
      makeChangeRequest({
        id: `44444444-4444-4444-8444-${String(i).padStart(12, '0')}`,
        number: `CR-${i}`,
      }),
    );

    flushInitial(hundredProposals, hundredCrs);
    const el = fixture.nativeElement as HTMLElement;

    expect(
      el.querySelector('[data-testid="proposals-truncation-alert"]'),
    ).toBeTruthy();
    expect(el.querySelector('[data-testid="cr-truncation-alert"]')).toBeTruthy();
  });

  it('FPO-04 handles empty, filtered-empty, and Clear filters recovery', () => {
    flushInitial();
    const el = fixture.nativeElement as HTMLElement;

    const searchInput = el.querySelector(
      '#fp-proposal-search',
    ) as HTMLInputElement;
    searchInput.value = 'nonexistent-vehicle-xyz';
    searchInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(el.textContent).toContain('No matching proposals');

    component.clearProposalFilters();
    fixture.detectChanges();
    expect(el.textContent).toContain('JC-2026-001');
  });

  it('FPO-05 shows stale/refresh-failed warning while preserving loaded rows', () => {
    flushInitial();
    component.refreshProposals();
    fixture.detectChanges();

    http
      .expectOne(`${API_BASE}/api/v1/manager/approvals/proposals`)
      .flush(
        { code: 'internal_error', message: 'Temporary failure' },
        { status: 500, statusText: 'Server Error' },
      );
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="proposals-stale-alert"]')).toBeTruthy();
    expect(el.textContent).toContain('JC-2026-001');
  });

  it('FPO-06 shows initial error state and supports manual retry', () => {
    fixture.detectChanges();
    http
      .expectOne(`${API_BASE}/api/v1/manager/approvals/proposals`)
      .flush(
        { code: 'internal_error', message: 'Error' },
        { status: 500, statusText: 'Server Error' },
      );
    http
      .expectOne(
        `${API_BASE}/api/v1/manager/approvals/change-requests?pendingOnly=false`,
      )
      .flush([]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Unable to load repair proposals');

    component.refreshProposals();
    http
      .expectOne(`${API_BASE}/api/v1/manager/approvals/proposals`)
      .flush([makeProposal()]);
    fixture.detectChanges();
    expect(el.textContent).toContain('JC-2026-001');
  });

  it('FPO-07 supports manual request cancellation on proposals, change requests, and detail lanes', () => {
    fixture.detectChanges();
    const pReq = http.expectOne(
      `${API_BASE}/api/v1/manager/approvals/proposals`,
    );
    const crReq = http.expectOne(
      `${API_BASE}/api/v1/manager/approvals/change-requests?pendingOnly=false`,
    );

    component.cancelProposalsLoad();
    component.cancelChangeRequestsLoad();
    fixture.detectChanges();

    expect(pReq.cancelled).toBe(true);
    expect(crReq.cancelled).toBe(true);

    // Reload clean, select proposal, then cancel detail load
    component.refreshAll();
    http
      .expectOne(`${API_BASE}/api/v1/manager/approvals/proposals`)
      .flush([makeProposal()]);
    http
      .expectOne(
        `${API_BASE}/api/v1/manager/approvals/change-requests?pendingOnly=false`,
      )
      .flush([makeChangeRequest()]);
    fixture.detectChanges();

    component.selectProposal(PROP_1);
    fixture.detectChanges();
    const detailReq = http.expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`);
    component.cancelDetailLoad();
    fixture.detectChanges();
    expect(detailReq.cancelled).toBe(true);
  });

  it('FPO-08 displays authoritative job detail, pricing review, bilingual findings, B-01 release block, and zero raw signed media URLs in DOM', () => {
    flushInitial();
    const el = fixture.nativeElement as HTMLElement;

    const inspectBtn = el.querySelector(
      `[data-testid="inspect-proposal-${PROP_1}"]`,
    ) as HTMLButtonElement;
    expect(inspectBtn.getAttribute('aria-pressed')).toBe('false');
    inspectBtn.click();
    fixture.detectChanges();

    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeJobDetail());
    fixture.detectChanges();

    expect(inspectBtn.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('[data-testid="proposal-pricing-review"]')).toBeTruthy();
    expect(el.textContent).toContain('Job: AwaitingManagerReview');
    expect(el.textContent).toContain('Front brake pad set');
    expect(el.textContent).toContain('Release: Disabled (B-01)');
    expect(el.textContent).toContain('Front brake pads worn to 2mm.');
    expect(el.textContent).toContain('முன் பிரேக் பேடுகள் தேய்ந்துள்ளன.');
    expect(
      el.querySelector('[data-testid="media-restriction-alert"]'),
    ).toBeTruthy();
    expect(el.textContent).toContain('Attachments: 1');

    // Security invariant: raw signed media URL and signature never appear in DOM and no live media tags are rendered
    expect(el.innerHTML).not.toContain('evidence-brake.jpg');
    expect(el.innerHTML).not.toContain('YWJjZGVm');
    expect(el.querySelector('img, video, audio')).toBeNull();
  });

  it('FPO-09 displays selected change request context and supports closing selection', () => {
    flushInitial();
    const el = fixture.nativeElement as HTMLElement;

    const inspectCr = el.querySelector(
      `[data-testid="inspect-cr-${CR_1}"]`,
    ) as HTMLButtonElement;
    inspectCr.click();
    fixture.detectChanges();

    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeJobDetail());
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="change-request-detail"]')).toBeTruthy();
    expect(el.textContent).toContain('Add rear wiper blade replacement');

    component.clearSelection();
    fixture.detectChanges();
    expect(el.textContent).toContain('Select a proposal or change request');
  });

  it('FPO-10 escapes server-provided HTML/script strings safely without DOM injection', () => {
    const xssProposal = makeProposal({
      customerName: '<script>window.__xss=1</script>SafeCustomer',
      vehicleLabel: '<img src=x onerror=alert(1)>Sedan',
    });
    flushInitial([xssProposal], []);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('script')).toBeNull();
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('<script>window.__xss=1</script>SafeCustomer');
  });

  it('FPO-11 clears all protected data on HTTP 401/403, disables controls, and exposes /login link on 401', () => {
    flushInitial();
    component.refreshProposals();
    fixture.detectChanges();

    http
      .expectOne(`${API_BASE}/api/v1/manager/approvals/proposals`)
      .flush(
        { code: 'unauthorized', message: 'Expired' },
        { status: 401, statusText: 'Unauthorized' },
      );
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Access revoked');
    expect(el.querySelector('[data-testid="reauth-login-link"]')).toBeTruthy();
    expect(el.textContent).not.toContain('Nimal Perera');
    expect(
      (el.querySelector('#fp-proposal-server-status') as HTMLSelectElement)
        .disabled,
    ).toBe(true);
  });

  it('FPO-12 clears all rendered protected data when session ends or is replaced', () => {
    flushInitial();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Nimal Perera');

    session.clearSession();
    fixture.detectChanges();

    expect(el.textContent).not.toContain('Nimal Perera');
    expect(component.state.proposals()).toBeNull();
  });

  it('FPO-13 surfaces current-session unresolved notices with honest disclaimer and dismissal without browser storage', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    flushInitial();

    protection.recordNotice(activeSession, {
      action: 'forward',
      reason: 'destroyed-while-submitting',
    });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(
      el.querySelector('[data-testid="session-notices-section"]'),
    ).toBeTruthy();
    expect(el.textContent).toContain('does not prove the server outcome');
    expect(setItemSpy).not.toHaveBeenCalled();

    component.dismissAllSessionNotices();
    fixture.detectChanges();
    expect(
      el.querySelector('[data-testid="session-notices-section"]'),
    ).toBeNull();
  });

  it('FPO-14 surfaces active mutation recovery controls (stopWaiting, reconcile, acknowledge) with zero auto-retries', () => {
    flushInitial();
    component.selectProposal(PROP_1);
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeJobDetail());
    fixture.detectChanges();

    // Start a forwardProposal mutation through FixProofMutationStateService to verify recovery panel wiring
    const start = component.mutation.forwardProposal(
      PROP_1,
      'Check brake pads',
    );
    expect(start.started).toBe(true);
    fixture.detectChanges();

    // Flush preflight GET so mutation enters 'submitting'
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeJobDetail());
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(
      el.querySelector('[data-testid="mutation-recovery-panel"]'),
    ).toBeTruthy();
    expect(el.querySelector('[data-testid="stop-waiting-btn"]')).toBeTruthy();

    // Verify mutation POST was dispatched exactly once and stopWaiting detaches without aborting
    const postReq = http.expectOne(
      `${API_BASE}/api/v1/manager/approvals/proposals/${PROP_1}/forward`,
    );
    component.stopWaitingForMutation();
    fixture.detectChanges();

    expect(postReq.cancelled).toBe(false);
    expect(component.mutation.detachedRequestPending()).toBe(true);
    expect(
      el.querySelector('[data-testid="cancel-reconciliation-btn"]'),
    ).toBeTruthy();

    // Initial automatic read-only reconciliation read can be cancelled cleanly
    const initialRecon = http.expectOne(
      `${API_BASE}/api/v1/manager/jobs/${JOB_1}`,
    );
    component.cancelMutationReconciliation();
    fixture.detectChanges();

    expect(initialRecon.cancelled).toBe(true);
    expect(el.querySelector('[data-testid="reconcile-btn"]')).toBeTruthy();

    // Trigger manual read-only reconciliation
    component.reconcileMutation();
    fixture.detectChanges();
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeJobDetail());
    fixture.detectChanges();

    expect(
      el.querySelector('[data-testid="reconciliation-disclaimer"]'),
    ).toBeTruthy();
    expect(el.querySelector('[data-testid="acknowledge-btn"]')).toBeTruthy();

    // Acknowledge reviewed state (triggers post-ack read-only refresh; does not abort detached transport or retry)
    component.acknowledgeMutation();
    fixture.detectChanges();
    expect(component.mutation.phase()).toBe('idle');
    expect(component.mutation.detachedRequestPending()).toBe(true);
    expect(postReq.cancelled).toBe(false);

    // Flush the post-acknowledgement authoritative read-only refreshes
    http
      .expectOne(`${API_BASE}/api/v1/manager/approvals/proposals`)
      .flush([makeProposal()]);
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeJobDetail());
    fixture.detectChanges();
  });

  it('FPO-15 cleans up in-flight requests cleanly on component destruction', () => {
    fixture.detectChanges();
    const pReq = http.expectOne(
      `${API_BASE}/api/v1/manager/approvals/proposals`,
    );
    const crReq = http.expectOne(
      `${API_BASE}/api/v1/manager/approvals/change-requests?pendingOnly=false`,
    );

    fixture.destroy();

    expect(pReq.cancelled).toBe(true);
    expect(crReq.cancelled).toBe(true);
  });
});
