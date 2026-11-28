import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet } from '@angular/router';
import type { Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';

import { routes as appRoutes } from '../../app.routes';
import { SessionService } from '../../core/auth/session.service';
import { API_CONFIG } from '../../core/config/api.config';
import { authChildGuard, authGuard } from '../../core/guards/auth.guard';
import {
  managerRoleChildGuard,
  managerRoleGuard,
} from '../../core/guards/role.guard';
import { authInterceptor } from '../../core/interceptors/auth.interceptor';
import { errorInterceptor } from '../../core/interceptors/error.interceptor';
import type { AuthSession } from '../../core/models/auth-session.model';

import { FIXPROOF_REVIEW_ROUTES } from '../fixproof-review/fixproof-review.routes';
import { FixProofOversight } from '../fixproof-review/pages/fixproof-oversight/fixproof-oversight';
import type {
  ChangeRequestDto,
  ProposalDto,
} from '../fixproof-review/models/fixproof.model';
import { FixProofMutationStateService } from '../fixproof-review/services/fixproof-mutation-state.service';
import { FixProofNavigationConfirmationService } from '../fixproof-review/services/fixproof-navigation-confirmation.service';
import {
  FIXPROOF_BEFORE_UNLOAD_TARGET,
  FixProofNavigationProtectionService,
} from '../fixproof-review/services/fixproof-navigation-protection.service';
import { FixProofStateService } from '../fixproof-review/services/fixproof-state.service';

import { JOB_CARDS_ROUTES } from './job-cards.routes';
import type { JobDetailDto, JobSummaryDto } from './models/job-card.model';
import {
  WORKSHOP_REALTIME_EVENTS,
  WORKSHOP_REALTIME_HUB_PATH,
} from './models/workshop-realtime-contract.model';
import { JobCardDetail } from './pages/job-card-detail/job-card-detail';
import { JobCards } from './pages/job-cards/job-cards';
import { JobCardStateService } from './services/job-card-state.service';

const API_BASE = 'https://api.fixora.test';
const BASE_TIME = Date.UTC(2026, 10, 28, 12, 0, 0);
const JOB_1 = '11111111-1111-4111-8111-111111111111';
const PROP_1 = '22222222-2222-4222-8222-222222222222';
const PROP_ABSENT = '99999999-9999-4999-8999-999999999999';
const CR_1 = '33333333-3333-4333-8333-333333333333';
const ITEM_1 = '44444444-4444-4444-8444-444444444444';

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

function makeManagerSession(id = 'manager-001'): AuthSession {
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

function makeJobSummary(): JobSummaryDto {
  return {
    id: JOB_1,
    number: 'JC-2026-601',
    customerId: '55555555-5555-4555-8555-555555555555',
    customerName: 'Ananya',
    vehicleId: '66666666-6666-4666-8666-666666666666',
    vehicleLabel: 'Tata Nexon KA-05-XY-7777',
    mechanicId: '77777777-7777-4777-8777-777777777777',
    mechanicName: 'Deepak',
    bayId: '88888888-8888-4888-8888-888888888888',
    bayName: 'Bay 1',
    status: 'AwaitingManagerReview',
    priority: 1,
    queuePosition: 1,
    etaAt: '2026-11-28T16:00:00Z',
    estimatedMinutes: 90,
    elapsedMinutes: 20,
    createdAt: '2026-11-28T08:00:00Z',
    startedAt: '2026-11-28T08:15:00Z',
    completedAt: null,
    complaint: 'Suspension rattle',
    managerNote: 'Verify parts availability before forwarding',
  };
}

function makeProposal(): ProposalDto {
  return {
    id: PROP_1,
    jobCardId: JOB_1,
    jobNumber: 'JC-2026-601',
    vehicleLabel: 'Tata Nexon KA-05-XY-7777',
    customerName: 'Ananya',
    status: 'PendingManagerReview',
    mechanicId: '77777777-7777-4777-8777-777777777777',
    mechanicName: 'Deepak',
    mechanicNote: 'Front strut bush worn',
    managerNote: null,
    customerNote: null,
    submittedAt: '2026-11-28T09:00:00Z',
    publishedAt: null,
    respondedAt: null,
    releasedAt: null,
    total: 3400,
    approvedTotal: 0,
    items: [
      {
        id: ITEM_1,
        title: 'Front Strut Bush Kit',
        kind: 'Part',
        qty: 2,
        unitPrice: 1700,
        amount: 3400,
        version: 1,
        status: 'Proposed',
        linkedIssueId: null,
      },
    ],
    audit: [
      {
        actorRole: 'Mechanic',
        action: 'Submitted',
        detail: 'Initial proposal',
        at: '2026-11-28T09:00:00Z',
      },
    ],
  };
}

function makeChangeRequest(): ChangeRequestDto {
  return {
    id: CR_1,
    jobCardId: JOB_1,
    jobNumber: 'JC-2026-601',
    number: 'CR-2026-099',
    changes: ['Check rear shocks'],
    details: 'Customer also wants rear shocks inspected',
    status: 'PendingManagerReview',
    managerNote: null,
    mechanicNote: null,
    createdAt: '2026-11-28T09:45:00Z',
  };
}

function makeDetail(): JobDetailDto {
  return {
    job: makeJobSummary(),
    timeline: [],
    issues: [],
    proposals: [makeProposal()],
    changeRequests: [makeChangeRequest()],
    invoice: null,
    queue: {
      jobId: JOB_1,
      position: 1,
      etaAt: '2026-11-28T16:00:00Z',
      status: 'AwaitingManagerReview',
      indicative: true,
    },
  };
}

@Component({
  selector: 'test-wki-shell',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>',
})
class TestShell {}

@Component({
  selector: 'test-wki-stub',
  standalone: true,
  template: '<p>Stub</p>',
})
class TestStub {}

describe('Job Cards & FixProof Workspace Integration (K16)', () => {
  let cleanupDialog: (() => void) | null = null;

  beforeAll(async () => {
    // Pre-warm lazy route dynamic imports before per-test timers so worker CPU contention
    // never skews WKI-01 cold module loading while still exercising real lazy routes.
    await Promise.all([
      import('./pages/job-cards/job-cards'),
      import('./pages/job-card-detail/job-card-detail'),
      import('../fixproof-review/fixproof-review.routes'),
      import('../fixproof-review/pages/fixproof-oversight/fixproof-oversight'),
    ]);
  });

  beforeEach(() => {
    cleanupDialog = installDialogTestMethods();
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
  });

  afterEach(() => {
    cleanupDialog?.();
    cleanupDialog = null;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function setupWorkspace() {
    const routes: Routes = [
      { path: 'login', component: TestStub },
      {
        path: '',
        canActivate: [authGuard, managerRoleGuard],
        canActivateChild: [authChildGuard, managerRoleChildGuard],
        component: TestShell,
        children: [
          { path: 'dashboard', component: TestStub },
          {
            path: 'job-cards',
            loadChildren: () => Promise.resolve(JOB_CARDS_ROUTES),
          },
        ],
      },
    ];

    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
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
      ],
    });

    // Reference standalone components and lazy routes statically so Vite pre-transforms them before test timers.
    expect(JobCards).toBeDefined();
    expect(JobCardDetail).toBeDefined();
    expect(FIXPROOF_REVIEW_ROUTES).toBeDefined();
    expect(FixProofOversight).toBeDefined();

    return {
      router: TestBed.inject(Router),
      http: TestBed.inject(HttpTestingController),
      session: TestBed.inject(SessionService),
      protection: TestBed.inject(FixProofNavigationProtectionService),
    };
  }

  it('WKI-01a navigates /job-cards -> /job-cards/:jobId -> /job-cards with embedded proposal breakdown and B-01 badge', async () => {
    const { router, http, session } = setupWorkspace();
    session.setSession(makeManagerSession());

    const harness = await RouterTestingHarness.create();

    // 1. Operational Queue (/job-cards)
    await harness.navigateByUrl('/job-cards');
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs?activeOnly=true`)
      .flush([makeJobSummary()]);
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('JC-2026-601');

    // 2. Job Card Detail (/job-cards/:jobId) with embedded proposal breakdown & B-01 badge
    await harness.navigateByUrl(`/job-cards/${JOB_1}`);
    http.expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`).flush(makeDetail());
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain(
      'Front Strut Bush Kit',
    );
    expect(harness.routeNativeElement?.textContent).toContain(
      'Release: Disabled (B-01)',
    );
    expect(
      harness.routeNativeElement?.querySelector(
        '[data-testid="job-proposals-card"]',
      ),
    ).toBeTruthy();

    // 3. Back to Queue (/job-cards) -> preserves list cleanly
    await harness.navigateByUrl('/job-cards');
    const backQueueReqs = http.match(
      `${API_BASE}/api/v1/manager/jobs?activeOnly=true`,
    );
    for (const req of backQueueReqs) {
      req.flush([makeJobSummary()]);
    }
    harness.detectChanges();
    expect(router.url).toBe('/job-cards');
    expect(harness.routeNativeElement?.textContent).toContain('KA-05-XY-7777');
    http.verify();
  });

  it('WKI-01b deep-links /job-cards/:jobId -> /job-cards/fixproof?proposalId=... and returns cleanly to /job-cards/:jobId', async () => {
    const { router, http, session } = setupWorkspace();
    session.setSession(makeManagerSession());

    const harness = await RouterTestingHarness.create();

    // 1. Job Card Detail (/job-cards/:jobId)
    await harness.navigateByUrl(`/job-cards/${JOB_1}`);
    http.expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`).flush(makeDetail());
    harness.detectChanges();

    // 2. Deep link into FixProof Oversight (?proposalId=PROP_1) auto-selects PROP_1 and loads detail
    await harness.navigateByUrl(`/job-cards/fixproof?proposalId=${PROP_1}`);
    http
      .expectOne(`${API_BASE}/api/v1/manager/approvals/proposals`)
      .flush([makeProposal()]);
    http
      .expectOne(
        `${API_BASE}/api/v1/manager/approvals/change-requests?pendingOnly=false`,
      )
      .flush([makeChangeRequest()]);
    harness.detectChanges();

    // Auto-selection triggers authoritative job detail load
    http.expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`).flush(makeDetail());
    harness.detectChanges();
    expect(
      harness.routeNativeElement?.querySelector(
        '[data-testid="proposal-cost-editor"]',
      ),
    ).toBeTruthy();
    expect(
      harness.routeNativeElement?.querySelector(
        '[data-testid="proposal-workflow-actions"]',
      ),
    ).toBeTruthy();

    // 3. Back to Job Detail (/job-cards/:jobId) -> preserves JOB_1 detail without redundant GET
    await harness.navigateByUrl(`/job-cards/${JOB_1}`);
    harness.detectChanges();
    expect(router.url).toBe(`/job-cards/${JOB_1}`);
    expect(harness.routeNativeElement?.textContent).toContain('KA-05-XY-7777');
    expect(
      harness.routeNativeElement?.querySelector(
        '[data-testid="job-proposals-card"]',
      ),
    ).toBeTruthy();
    http.verify();
  });

  it('WKI-02 auto-selects linked customer change request via /job-cards/fixproof?changeRequestId=...', async () => {
    const { http, session } = setupWorkspace();
    session.setSession(makeManagerSession());

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/job-cards/fixproof?changeRequestId=${CR_1}`);

    http
      .expectOne(`${API_BASE}/api/v1/manager/approvals/proposals`)
      .flush([makeProposal()]);
    http
      .expectOne(
        `${API_BASE}/api/v1/manager/approvals/change-requests?pendingOnly=false`,
      )
      .flush([makeChangeRequest()]);
    harness.detectChanges();

    http.expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`).flush(makeDetail());
    harness.detectChanges();

    expect(
      harness.routeNativeElement?.querySelector(
        '[data-testid="cr-workflow-actions"]',
      ),
    ).toBeTruthy();
    expect(harness.routeNativeElement?.textContent).toContain('CR-2026-099');
    http.verify();
  });

  it('WKI-03 handles invalid and missing deep-link IDs safely without firing extra detail HTTP requests', async () => {
    const { http, session } = setupWorkspace();
    session.setSession(makeManagerSession());

    const harness = await RouterTestingHarness.create();

    // Invalid UUID in ?proposalId -> shows deepLinkNotice immediately, zero detail HTTP
    await harness.navigateByUrl('/job-cards/fixproof?proposalId=not-a-uuid');
    http.expectOne(`${API_BASE}/api/v1/manager/approvals/proposals`).flush([]);
    http
      .expectOne(
        `${API_BASE}/api/v1/manager/approvals/change-requests?pendingOnly=false`,
      )
      .flush([]);
    harness.detectChanges();

    expect(
      harness.routeNativeElement?.querySelector(
        '[data-testid="deep-link-notice-banner"]',
      )?.textContent,
    ).toContain('not a valid UUID');

    // Valid UUID not present in loaded list -> shows honest missing-from-list advisory
    await harness.navigateByUrl(`/job-cards/fixproof?proposalId=${PROP_ABSENT}`);
    harness.detectChanges();
    expect(
      harness.routeNativeElement?.querySelector(
        '[data-testid="deep-link-notice-banner"]',
      )?.textContent,
    ).toContain('not found in the currently loaded list');

    http.verify();
  });

  it('WKI-04 preserves feature-scoped DI lifetimes and cancels in-flight HTTP on route exit', async () => {
    const { http, session } = setupWorkspace();
    session.setSession(makeManagerSession());

    // All four feature state/dialog services MUST be null in root injector
    expect(TestBed.inject(JobCardStateService, null, { optional: true })).toBeNull();
    expect(TestBed.inject(FixProofStateService, null, { optional: true })).toBeNull();
    expect(
      TestBed.inject(FixProofMutationStateService, null, { optional: true }),
    ).toBeNull();
    expect(
      TestBed.inject(FixProofNavigationConfirmationService, null, {
        optional: true,
      }),
    ).toBeNull();

    // Verify all 11 Manager Shell workspace routes remain intact
    const shell = appRoutes.find(r => r.path === '' && Array.isArray(r.children));
    const paths = shell?.children?.filter(r => r.path !== '').map(r => r.path);
    expect(paths).toHaveLength(11);

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/job-cards');
    const pendingList = http.expectOne(
      `${API_BASE}/api/v1/manager/jobs?activeOnly=true`,
    );

    // Navigate away while list request is in flight -> cleanly cancelled
    await harness.navigateByUrl('/dashboard');
    expect(pendingList.cancelled).toBe(true);

    // Navigate to JobCardDetail and exit while detail request is in flight -> cleanly cancelled
    await harness.navigateByUrl(`/job-cards/${JOB_1}`);
    const pendingDetail = http.expectOne(
      `${API_BASE}/api/v1/manager/jobs/${JOB_1}`,
    );
    await harness.navigateByUrl('/dashboard');
    expect(pendingDetail.cancelled).toBe(true);

    http.verify();
  });

  it('WKI-05 enforces confirmation dialog on FixProof -> JobDetail exit during unresolved operation and surfaces session notice on JobDetail and JobCards without browser storage', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const { router, http, session } = setupWorkspace();
    session.setSession(makeManagerSession());

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/job-cards/fixproof?proposalId=${PROP_1}`);
    http
      .expectOne(`${API_BASE}/api/v1/manager/approvals/proposals`)
      .flush([makeProposal()]);
    http
      .expectOne(
        `${API_BASE}/api/v1/manager/approvals/change-requests?pendingOnly=false`,
      )
      .flush([makeChangeRequest()]);
    harness.detectChanges();
    http.expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`).flush(makeDetail());
    harness.detectChanges();

    // Start a real forwardProposal mutation so the route is genuinely protected
    const oversightEl = harness.routeNativeElement as HTMLElement;
    const forwardBtn = oversightEl.querySelector(
      '[data-testid="forward-proposal-btn"] button',
    ) as HTMLButtonElement;
    forwardBtn.click();
    harness.detectChanges();

    const confirmBtn = Array.from(oversightEl.querySelectorAll('button')).find(
      b => b.textContent?.includes('Forward to customer') && b !== forwardBtn,
    );
    expect(confirmBtn).toBeTruthy();
    confirmBtn!.click();
    harness.detectChanges();

    // Flush preflight GET so mutation enters 'submitting'
    http.expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`).flush(makeDetail());
    harness.detectChanges();
    const postReq = http.expectOne(
      `${API_BASE}/api/v1/manager/approvals/proposals/${PROP_1}/forward`,
    );
    expect(postReq.cancelled).toBe(false);

    const waitForLeaveDialog = async () => {
      for (let i = 0; i < 40; i++) {
        await vi.advanceTimersByTimeAsync(0);
        harness.detectChanges();
        const dlg = oversightEl.querySelector(
          'dialog[id="fixproof-nav-leave-dialog"]',
        ) as HTMLDialogElement | null;
        if (dlg?.open || dlg?.getAttribute('aria-modal') === 'true') {
          return dlg;
        }
      }
      return null;
    };

    // Attempt leaving to /job-cards/:jobId -> Stay blocks navigation
    const blockedAttempt = router.navigateByUrl(`/job-cards/${JOB_1}`);
    const dlg1 = await waitForLeaveDialog();
    expect(dlg1).not.toBeNull();
    expect(dlg1?.open || dlg1?.getAttribute('aria-modal') === 'true').toBe(true);
    const stayBtn = Array.from(oversightEl.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Stay on page'),
    );
    stayBtn!.click();
    harness.detectChanges();
    expect(await blockedAttempt).toBe(false);
    expect(router.url).toContain('/job-cards/fixproof');

    // Second attempt -> Leave allows navigation to JobCardDetail and hands off session notice
    const allowedAttempt = router.navigateByUrl(`/job-cards/${JOB_1}`);
    const dlg2 = await waitForLeaveDialog();
    expect(dlg2).not.toBeNull();
    expect(dlg2?.open || dlg2?.getAttribute('aria-modal') === 'true').toBe(true);
    const leaveBtn = Array.from(oversightEl.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Leave page'),
    );
    leaveBtn!.click();
    harness.detectChanges();
    expect(await allowedAttempt).toBe(true);
    expect(router.url).toBe(`/job-cards/${JOB_1}`);
    harness.detectChanges();

    http.expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`).flush(makeDetail());
    harness.detectChanges();

    // Session notice is surfaced on JobCardDetail with zero browser storage writes
    expect(
      harness.routeNativeElement?.querySelector(
        '[data-testid="detail-session-notices"]',
      ),
    ).toBeTruthy();
    expect(setItemSpy).not.toHaveBeenCalled();

    // And also visible when navigating to /job-cards
    await harness.navigateByUrl('/job-cards');
    const queueReqs = http.match(
      `${API_BASE}/api/v1/manager/jobs?activeOnly=true`,
    );
    for (const req of queueReqs) {
      req.flush([makeJobSummary()]);
    }
    harness.detectChanges();
    expect(
      harness.routeNativeElement?.querySelector(
        '[data-testid="jobs-session-notices"]',
      ),
    ).toBeTruthy();

    http.verify();
  });

  it('WKI-06 propagates HTTP 401 authorization loss across Day06 workspace routes until session replacement', async () => {
    const { http, session } = setupWorkspace();
    session.setSession(makeManagerSession('manager-revoked'));

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/job-cards/fixproof');

    http
      .expectOne(`${API_BASE}/api/v1/manager/approvals/proposals`)
      .flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    const crReq = http.match(
      `${API_BASE}/api/v1/manager/approvals/change-requests?pendingOnly=false`,
    );
    expect(crReq.length).toBeLessThanOrEqual(1);
    harness.detectChanges();

    // Navigating to /job-cards with the same revoked session must not dispatch jobs GET
    await harness.navigateByUrl('/job-cards');
    harness.detectChanges();
    http.expectNone(`${API_BASE}/api/v1/manager/jobs?activeOnly=true`);
    expect(
      harness.routeNativeElement?.querySelector(
        '[data-testid="jobs-auth-failure-banner"]',
      ),
    ).toBeTruthy();

    // Replacing session with a fresh valid session restores read capability cleanly
    session.setSession(makeManagerSession('manager-fresh'));
    harness.detectChanges();
    await harness.navigateByUrl(`/job-cards/${JOB_1}`);
    http.expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`).flush(makeDetail());
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('JC-2026-601');

    http.verify();
  });

  it('WKI-07 preserves verified K17 realtime handoff contract constants without activating live SignalR in K16', () => {
    expect(WORKSHOP_REALTIME_HUB_PATH).toBe('hubs/fixora');
    expect(WORKSHOP_REALTIME_EVENTS).toEqual({
      jobUpdated: 'job.updated',
      queueUpdated: 'queue.updated',
      approvalUpdated: 'approval.updated',
      changeRequestUpdated: 'changeRequest.updated',
    });
  });
});
