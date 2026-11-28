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

import { ADAPTIVE_QUEUE_ROUTES } from '../adaptive-queue/adaptive-queue.routes';
import { AdaptiveQueuePage } from '../adaptive-queue/pages/adaptive-queue/adaptive-queue';
import {
  ADAPTIVE_QUEUE_HUB_CONNECTION_FACTORY,
  type AdaptiveQueueHubConnection,
  type AdaptiveQueueHubConnectionConfig,
} from '../adaptive-queue/services/adaptive-queue-realtime.service';

import { FIXPROOF_REVIEW_ROUTES } from '../fixproof-review/fixproof-review.routes';
import type {
  ChangeRequestDto,
  ProposalDto,
} from '../fixproof-review/models/fixproof.model';
import { FixProofOversight } from '../fixproof-review/pages/fixproof-oversight/fixproof-oversight';
import { FixProofMutationStateService } from '../fixproof-review/services/fixproof-mutation-state.service';
import { FIXPROOF_BEFORE_UNLOAD_TARGET } from '../fixproof-review/services/fixproof-navigation-protection.service';
import { FixProofStateService } from '../fixproof-review/services/fixproof-state.service';

import { JOB_CARDS_WORKSPACE_ROUTES } from './job-cards.routes';
import type { JobDetailDto, JobSummaryDto } from './models/job-card.model';
import {
  WORKSHOP_REALTIME_COALESCE_WINDOW_MS,
  type WorkshopHubConnection,
  type WorkshopHubConnectionConfig,
} from './models/workshop-realtime-contract.model';
import { JobCardDetail } from './pages/job-card-detail/job-card-detail';
import { JobCards } from './pages/job-cards/job-cards';
import { Day06AuthorizationCoordinatorService } from './services/day06-authorization-coordinator.service';
import { WorkshopRealtimeCoordinatorService } from './services/workshop-realtime-coordinator.service';
import {
  WORKSHOP_HUB_CONNECTION_FACTORY,
  WorkshopRealtimeService,
} from './services/workshop-realtime.service';

const API_BASE = 'https://api.fixora.test';
const BASE_TIME = Date.UTC(2026, 10, 28, 12, 0, 0);
const JOB_1 = '11111111-1111-4111-8111-111111111111';
const PROP_1 = '22222222-2222-4222-8222-222222222222';
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

class FakeHub implements WorkshopHubConnection, AdaptiveQueueHubConnection {
  readonly handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  readonly startSpy = vi.fn(() => Promise.resolve());
  readonly stopSpy = vi.fn(() => Promise.resolve());
  readonly onSpy = vi.fn();
  readonly offSpy = vi.fn();
  private closeCb: ((err?: Error) => void) | null = null;
  private reconnectingCb: ((err?: Error) => void) | null = null;
  private reconnectedCb: ((id?: string) => void) | null = null;

  constructor(
    readonly config: WorkshopHubConnectionConfig | AdaptiveQueueHubConnectionConfig,
  ) {}

  start() {
    return this.startSpy();
  }
  stop() {
    return this.stopSpy();
  }
  on(name: string, fn: (...args: unknown[]) => void) {
    this.onSpy(name, fn);
    const s = this.handlers.get(name) ?? new Set();
    s.add(fn);
    this.handlers.set(name, s);
  }
  off(name: string, fn: (...args: unknown[]) => void) {
    this.offSpy(name, fn);
    this.handlers.get(name)?.delete(fn);
  }
  onclose(cb: (err?: Error) => void) {
    this.closeCb = cb;
  }
  onreconnecting(cb: (err?: Error) => void) {
    this.reconnectingCb = cb;
  }
  onreconnected(cb: (id?: string) => void) {
    this.reconnectedCb = cb;
  }

  emit(name: string, payload: unknown) {
    for (const fn of this.handlers.get(name) ?? []) {
      fn(payload);
    }
  }
  triggerReconnecting() {
    this.reconnectingCb?.(new Error('drop'));
  }
  triggerReconnected() {
    this.reconnectedCb?.('conn-2');
  }
  triggerClose(err?: Error) {
    this.closeCb?.(err);
  }
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

function makeJobSummary(overrides: Partial<JobSummaryDto> = {}): JobSummaryDto {
  return {
    id: JOB_1,
    number: 'JC-2026-701',
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
    managerNote: 'Verify parts availability',
    ...overrides,
  };
}

function makeProposal(overrides: Partial<ProposalDto> = {}): ProposalDto {
  return {
    id: PROP_1,
    jobCardId: JOB_1,
    jobNumber: 'JC-2026-701',
    vehicleLabel: 'Tata Nexon KA-05-XY-7777',
    customerName: 'Ananya',
    status: 'PendingManagerReview',
    mechanicId: '77777777-7777-4777-8777-777777777777',
    mechanicName: 'Deepak',
    mechanicNote: 'Front strut bush cracked',
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
        status: 'Proposed',
        version: 1,
        linkedIssueId: null,
      },
    ],
    audit: [
      {
        actorRole: 'Mechanic',
        action: 'Submitted proposal',
        detail: 'Initial estimate',
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
    jobNumber: 'JC-2026-701',
    number: 'CR-2026-101',
    changes: ['Inspect rear shocks'],
    details: 'Customer wants rear shocks checked',
    status: 'PendingManagerReview',
    managerNote: null,
    mechanicNote: null,
    createdAt: '2026-11-28T09:30:00Z',
    ...overrides,
  };
}

function makeDetail(
  jobOverrides: Partial<JobSummaryDto> = {},
  propOverrides: Partial<ProposalDto> = {},
): JobDetailDto {
  return {
    job: makeJobSummary(jobOverrides),
    timeline: [],
    issues: [],
    proposals: [makeProposal(propOverrides)],
    changeRequests: [makeChangeRequest()],
    invoice: null,
    queue: {
      jobId: JOB_1,
      position: 1,
      etaAt: '2026-11-28T16:00:00Z',
      status: jobOverrides.status ?? 'AwaitingManagerReview',
      indicative: true,
    },
  };
}

@Component({
  selector: 'test-wri-shell',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>',
})
class TestShell {}

@Component({
  selector: 'test-wri-stub',
  standalone: true,
  template: '<p>Workspace Stub</p>',
})
class TestStub {}

describe('Workshop SignalR Realtime Workspace Integration (K17)', () => {
  let cleanupDialog: (() => void) | null = null;
  let workshopHubs: FakeHub[];
  let day05Hubs: FakeHub[];
  let workshopFactory: ReturnType<
    typeof vi.fn<(config: WorkshopHubConnectionConfig) => WorkshopHubConnection>
  >;
  let day05Factory: ReturnType<
    typeof vi.fn<
      (config: AdaptiveQueueHubConnectionConfig) => AdaptiveQueueHubConnection
    >
  >;

  beforeAll(async () => {
    await Promise.all([
      import('./pages/job-cards/job-cards'),
      import('./pages/job-card-detail/job-card-detail'),
      import('../fixproof-review/fixproof-review.routes'),
      import('../fixproof-review/pages/fixproof-oversight/fixproof-oversight'),
      import('../adaptive-queue/pages/adaptive-queue/adaptive-queue'),
    ]);
  });

  beforeEach(() => {
    cleanupDialog = installDialogTestMethods();
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    workshopHubs = [];
    day05Hubs = [];
    workshopFactory = vi.fn(config => {
      const h = new FakeHub(config);
      workshopHubs.push(h);
      return h;
    });
    day05Factory = vi.fn(config => {
      const h = new FakeHub(config);
      day05Hubs.push(h);
      return h;
    });
  });

  afterEach(() => {
    cleanupDialog?.();
    cleanupDialog = null;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function setupAppWorkspace() {
    // Mirrors app.routes.ts lazy-loaded workspace boundary (K18-B / FE-03):
    // app.routes.ts MUST NOT eagerly provide realtime services on 'job-cards'.
    const shellRoute = appRoutes.find(r => r.path === '' && r.children);
    const jobCardsRoute = shellRoute?.children?.find(r => r.path === 'job-cards');
    expect(jobCardsRoute?.providers).toBeUndefined();

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
            loadChildren: () => Promise.resolve(JOB_CARDS_WORKSPACE_ROUTES),
          },
          {
            path: 'adaptive-queue',
            loadChildren: () => Promise.resolve(ADAPTIVE_QUEUE_ROUTES),
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
        { provide: WORKSHOP_HUB_CONNECTION_FACTORY, useValue: workshopFactory },
        {
          provide: ADAPTIVE_QUEUE_HUB_CONNECTION_FACTORY,
          useValue: day05Factory,
        },
        {
          provide: FIXPROOF_BEFORE_UNLOAD_TARGET,
          useValue: {
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          },
        },
      ],
    });

    expect(JobCards).toBeDefined();
    expect(JobCardDetail).toBeDefined();
    expect(FIXPROOF_REVIEW_ROUTES).toBeDefined();
    expect(FixProofOversight).toBeDefined();
    expect(AdaptiveQueuePage).toBeDefined();

    return {
      router: TestBed.inject(Router),
      http: TestBed.inject(HttpTestingController),
      session: TestBed.inject(SessionService),
      auth: TestBed.inject(Day06AuthorizationCoordinatorService),
    };
  }

  it('WRI-01 maintains ONE single Day06 hub connection across /job-cards -> /job-cards/:jobId -> /job-cards/fixproof with truthful status badges', async () => {
    const { http, session } = setupAppWorkspace();
    session.setSession(makeManagerSession());

    // Confirm services remain non-root
    expect(
      TestBed.inject(WorkshopRealtimeService, null, { optional: true }),
    ).toBeNull();
    expect(
      TestBed.inject(WorkshopRealtimeCoordinatorService, null, {
        optional: true,
      }),
    ).toBeNull();

    const harness = await RouterTestingHarness.create();

    // 1. Enter /job-cards
    await harness.navigateByUrl('/job-cards');
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs?activeOnly=true`)
      .flush([makeJobSummary()]);
    await Promise.resolve();
    harness.detectChanges();

    expect(workshopFactory).toHaveBeenCalledTimes(1);
    expect(workshopHubs[0].startSpy).toHaveBeenCalledTimes(1);
    expect(workshopHubs[0].onSpy).toHaveBeenCalledTimes(4);
    expect(
      harness.routeNativeElement?.querySelector(
        '[data-testid="jobs-realtime-status"]',
      )?.textContent,
    ).toContain('Live updates connected');

    // 2. Navigate to /job-cards/:jobId -> NO reconnect, NO duplicate hub
    await harness.navigateByUrl(`/job-cards/${JOB_1}`);
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeDetail());
    await Promise.resolve();
    harness.detectChanges();

    expect(workshopFactory).toHaveBeenCalledTimes(1);
    expect(workshopHubs[0].stopSpy).not.toHaveBeenCalled();
    expect(
      harness.routeNativeElement?.querySelector(
        '[data-testid="detail-realtime-status"]',
      )?.textContent,
    ).toContain('Live updates connected');

    // 3. Navigate to /job-cards/fixproof -> STILL the exact same single hub
    await harness.navigateByUrl(`/job-cards/fixproof?proposalId=${PROP_1}`);
    http
      .expectOne(`${API_BASE}/api/v1/manager/approvals/proposals`)
      .flush([makeProposal()]);
    http
      .expectOne(
        `${API_BASE}/api/v1/manager/approvals/change-requests?pendingOnly=false`,
      )
      .flush([makeChangeRequest()]);
    await Promise.resolve();
    harness.detectChanges();
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeDetail());
    harness.detectChanges();

    expect(workshopFactory).toHaveBeenCalledTimes(1);
    expect(workshopHubs[0].stopSpy).not.toHaveBeenCalled();
    expect(
      harness.routeNativeElement?.querySelector(
        '[data-testid="fixproof-realtime-status"]',
      )?.textContent,
    ).toContain('Live updates connected');

    // 4. Live job.updated invalidation triggers authoritative detail refresh
    workshopHubs[0].emit('job.updated', { id: JOB_1, number: 'JC-2026-701' });
    vi.advanceTimersByTime(WORKSHOP_REALTIME_COALESCE_WINDOW_MS);
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeDetail({ priority: 2 }));
    harness.detectChanges();

    http.verify();
  });

  it('WRI-02 tears down workspace hub cleanly on exit to /dashboard and opens a fresh authorized connection on re-entry', async () => {
    const { http, session } = setupAppWorkspace();
    session.setSession(makeManagerSession());

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/job-cards');
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs?activeOnly=true`)
      .flush([makeJobSummary()]);
    await Promise.resolve();
    harness.detectChanges();
    expect(workshopFactory).toHaveBeenCalledTimes(1);

    // Exit workspace to /dashboard -> microtask teardown stops hub & removes all 4 handlers
    await harness.navigateByUrl('/dashboard');
    await Promise.resolve();
    harness.detectChanges();

    expect(workshopHubs[0].stopSpy).toHaveBeenCalledTimes(1);
    expect(workshopHubs[0].offSpy).toHaveBeenCalledTimes(4);

    // Stale event after workspace exit triggers ZERO HTTP requests
    workshopHubs[0].emit('queue.updated', [{ id: JOB_1 }]);
    vi.advanceTimersByTime(WORKSHOP_REALTIME_COALESCE_WINDOW_MS);
    http.expectNone(`${API_BASE}/api/v1/manager/jobs?activeOnly=true`);

    // Re-enter /job-cards -> fresh authorized hub created cleanly
    await harness.navigateByUrl('/job-cards');
    for (const req of http.match(
      `${API_BASE}/api/v1/manager/jobs?activeOnly=true`,
    )) {
      req.flush([makeJobSummary()]);
    }
    await Promise.resolve();
    harness.detectChanges();

    expect(workshopFactory).toHaveBeenCalledTimes(2);
    expect(workshopHubs[1].startSpy).toHaveBeenCalledTimes(1);
    http.verify();
  });

  it('WRI-03 preserves K16 component-scoped FixProof services and active ProposalCostEditor pricing drafts across realtime invalidation', async () => {
    const { http, session } = setupAppWorkspace();
    session.setSession(makeManagerSession());

    // K16 lifecycle invariant: FixProof state & mutation services stay strictly non-root
    expect(
      TestBed.inject(FixProofStateService, null, { optional: true }),
    ).toBeNull();
    expect(
      TestBed.inject(FixProofMutationStateService, null, { optional: true }),
    ).toBeNull();

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
    await Promise.resolve();
    harness.detectChanges();
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeDetail());
    harness.detectChanges();

    const el = harness.routeNativeElement as HTMLElement;

    // Open pricing editor and enter an unsaved user draft
    const editBtn = el.querySelector(
      `[data-testid="edit-price-btn-${ITEM_1}"] button`,
    ) as HTMLButtonElement;
    expect(editBtn).toBeTruthy();
    editBtn.click();
    harness.detectChanges();

    const priceInput = el.querySelector(
      '[data-testid="cost-unit-price-input"]',
    ) as HTMLInputElement;
    expect(priceInput).toBeTruthy();
    priceInput.value = '1875.50';
    priceInput.dispatchEvent(new Event('input'));
    harness.detectChanges();

    // Incoming approval.updated triggers authoritative read-only refresh
    workshopHubs[0].emit('approval.updated', {
      id: PROP_1,
      jobCardId: JOB_1,
      status: 'PendingManagerReview',
    });
    vi.advanceTimersByTime(WORKSHOP_REALTIME_COALESCE_WINDOW_MS);

    http
      .expectOne(`${API_BASE}/api/v1/manager/approvals/proposals`)
      .flush([makeProposal({ mechanicNote: 'Updated server note' })]);
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeDetail({}, { mechanicNote: 'Updated server note' }));
    harness.detectChanges();

    // User's unsaved pricing draft & active selection remain completely preserved!
    const refreshedInput = el.querySelector(
      '[data-testid="cost-unit-price-input"]',
    ) as HTMLInputElement;
    expect(refreshedInput).toBeTruthy();
    expect(refreshedInput.value).toBe('1875.50');
    http.verify();
  });

  it('WRI-04 never retries mutations, never resets unresolved phases, and never fabricates outcomes on realtime events', async () => {
    const { http, session } = setupAppWorkspace();
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
    await Promise.resolve();
    harness.detectChanges();
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeDetail());
    harness.detectChanges();

    const el = harness.routeNativeElement as HTMLElement;

    // Trigger real forwardProposal mutation
    const forwardBtn = el.querySelector(
      '[data-testid="forward-proposal-btn"] button',
    ) as HTMLButtonElement;
    forwardBtn.click();
    harness.detectChanges();

    const confirmBtn = Array.from(el.querySelectorAll('button')).find(
      b => b.textContent?.includes('Forward to customer') && b !== forwardBtn,
    );
    confirmBtn!.click();
    harness.detectChanges();

    // Flush preflight GET -> enters 'submitting'
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeDetail());
    harness.detectChanges();

    // Simulate network drop -> uncertain -> reconciliation-required
    const postReq = http.expectOne(
      `${API_BASE}/api/v1/manager/approvals/proposals/${PROP_1}/forward`,
    );
    postReq.error(new ProgressEvent('error'), { status: 0 });
    harness.detectChanges();

    // Flush FixProofMutationStateService's own automatic uncertain-phase reconciliation reads
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeDetail());
    harness.detectChanges();
    http
      .expectOne(`${API_BASE}/api/v1/manager/approvals/proposals`)
      .flush([makeProposal()]);
    harness.detectChanges();
    for (const req of http.match(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)) {
      req.flush(makeDetail());
    }
    harness.detectChanges();

    // Confirm zero pending HTTP requests before realtime events arrive
    http.verify();

    // Realtime events arrive claiming proposal moved to AwaitingCustomer
    workshopHubs[0].emit('approval.updated', {
      id: PROP_1,
      jobCardId: JOB_1,
      status: 'AwaitingCustomer',
    });
    workshopHubs[0].emit('job.updated', {
      id: JOB_1,
      number: 'JC-2026-701',
    });
    workshopHubs[0].triggerReconnecting();
    workshopHubs[0].triggerReconnected();
    vi.advanceTimersByTime(WORKSHOP_REALTIME_COALESCE_WINDOW_MS);
    harness.detectChanges();

    // ZERO automatic mutation retries, ZERO realtime refreshes interfering with unresolved phase
    http.expectNone(req => req.method === 'POST');
    http.expectNone(`${API_BASE}/api/v1/manager/approvals/proposals`);
    http.expectNone(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`);
    expect(
      el.querySelector('[data-testid="mutation-recovery-panel"]'),
    ).toBeTruthy();

    http.verify();
  });

  it('WRI-05 keeps Day06 Workshop realtime completely isolated from Day05 Adaptive Queue realtime', async () => {
    const { http, session } = setupAppWorkspace();
    session.setSession(makeManagerSession());

    const harness = await RouterTestingHarness.create();

    // 1. Start in Day06 /job-cards -> uses ONLY workshopFactory
    await harness.navigateByUrl('/job-cards');
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs?activeOnly=true`)
      .flush([makeJobSummary()]);
    await Promise.resolve();
    harness.detectChanges();

    expect(workshopFactory).toHaveBeenCalledTimes(1);
    expect(day05Factory).toHaveBeenCalledTimes(0);

    // 2. Navigate to Day05 /adaptive-queue -> Day06 stops cleanly, Day05 opens its own hub
    await harness.navigateByUrl('/adaptive-queue');
    for (const req of http.match(() => true)) {
      req.flush([]);
    }
    await Promise.resolve();
    harness.detectChanges();

    expect(workshopHubs[0].stopSpy).toHaveBeenCalledTimes(1);
    expect(workshopHubs[0].offSpy).toHaveBeenCalledTimes(4);
    expect(day05Factory).toHaveBeenCalledTimes(1);
    expect(day05Hubs[0].startSpy).toHaveBeenCalledTimes(1);
    // Day05 subscribes strictly to its own 2 events (queue.updated + job.updated), never Day06 approval events
    expect(Array.from(day05Hubs[0].handlers.keys()).sort()).toEqual([
      'job.updated',
      'queue.updated',
    ]);

    // 3. Return to Day06 /job-cards -> Day05 stops cleanly, Day06 opens a fresh hub
    await harness.navigateByUrl('/job-cards');
    for (const req of http.match(
      `${API_BASE}/api/v1/manager/jobs?activeOnly=true`,
    )) {
      req.flush([makeJobSummary()]);
    }
    await Promise.resolve();
    harness.detectChanges();

    expect(day05Hubs[0].stopSpy).toHaveBeenCalledTimes(1);
    expect(workshopFactory).toHaveBeenCalledTimes(2);
    expect(workshopHubs[1].startSpy).toHaveBeenCalledTimes(1);

    http.verify();
  });

  it('WRI-06 tears down hub on Day06 401 revocation or logout without blocking navigation to /login', async () => {
    const { router, http, session } = setupAppWorkspace();
    const s1 = makeManagerSession('mgr-1');
    session.setSession(s1);

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/job-cards');
    await Promise.resolve();
    expect(workshopFactory).toHaveBeenCalledTimes(1);

    // Real HTTP 401 from /api/v1/manager/jobs propagates through Day06AuthorizationCoordinatorService and stops hub immediately
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs?activeOnly=true`)
      .flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    harness.detectChanges();
    expect(workshopHubs[0].stopSpy).toHaveBeenCalledTimes(1);

    // Stale event dropped without HTTP
    workshopHubs[0].emit('job.updated', { id: JOB_1, number: 'JC-2026-701' });
    vi.advanceTimersByTime(WORKSHOP_REALTIME_COALESCE_WINDOW_MS);
    http.expectNone(`${API_BASE}/api/v1/manager/jobs?activeOnly=true`);

    // Logout & navigate to /login never blocked
    session.clearSession();
    expect(await router.navigateByUrl('/login')).toBe(true);
    expect(router.url).toBe('/login');
    http.verify();
  });

  it('WRI-07 (FE-01) recovers deferred FixProof realtime invalidations after preflight cancellation and after manual acknowledgement without retrying mutations', async () => {
    const { http, session } = setupAppWorkspace();
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
    await Promise.resolve();
    harness.detectChanges();
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeDetail());
    harness.detectChanges();

    const el = harness.routeNativeElement as HTMLElement;

    // Part A: Start forward -> stays in preflight while detail GET is pending
    const forwardBtn = el.querySelector(
      '[data-testid="forward-proposal-btn"] button',
    ) as HTMLButtonElement;
    forwardBtn.click();
    harness.detectChanges();

    const confirmBtn = Array.from(el.querySelectorAll('button')).find(
      b => b.textContent?.includes('Forward to customer') && b !== forwardBtn,
    );
    confirmBtn!.click();
    harness.detectChanges();

    const preflightReq = http.expectOne(
      `${API_BASE}/api/v1/manager/jobs/${JOB_1}`,
    );

    // Realtime changeRequest.updated arrives during preflight -> suppressed & deferred
    workshopHubs[0].emit('changeRequest.updated', {
      id: CR_1,
      jobCardId: JOB_1,
      status: 'PendingManagerReview',
    });
    vi.advanceTimersByTime(WORKSHOP_REALTIME_COALESCE_WINDOW_MS);
    http.expectNone(
      `${API_BASE}/api/v1/manager/approvals/change-requests?pendingOnly=false`,
    );

    // Cancel preflight -> returns to idle -> deferred invalidation flushes after 400ms!
    const cancelPreflightBtn = el.querySelector(
      '[data-testid="cancel-preflight-btn"] button',
    ) as HTMLButtonElement;
    expect(cancelPreflightBtn).toBeTruthy();
    cancelPreflightBtn.click();
    harness.detectChanges();
    expect(preflightReq.cancelled).toBe(true);

    vi.advanceTimersByTime(WORKSHOP_REALTIME_COALESCE_WINDOW_MS);
    http
      .expectOne(
        `${API_BASE}/api/v1/manager/approvals/change-requests?pendingOnly=false`,
      )
      .flush([makeChangeRequest()]);
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeDetail());
    harness.detectChanges();

    // ZERO automatic POST mutation retries occurred
    http.expectNone(req => req.method === 'POST');
    http.verify();
  });

  it('WRI-09 (FE-01) preserves suppressed realtime invalidation across uncertain outcome and flushes once after manual acknowledgement', async () => {
    const { http, session } = setupAppWorkspace();
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
    await Promise.resolve();
    harness.detectChanges();
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeDetail());
    harness.detectChanges();

    const el = harness.routeNativeElement as HTMLElement;

    // Trigger real forwardProposal -> network error -> uncertain / reconciliation-required
    const forwardBtn = el.querySelector(
      '[data-testid="forward-proposal-btn"] button',
    ) as HTMLButtonElement;
    forwardBtn.click();
    harness.detectChanges();
    const confirmBtn = Array.from(el.querySelectorAll('button')).find(
      b => b.textContent?.includes('Forward to customer') && b !== forwardBtn,
    );
    confirmBtn!.click();
    harness.detectChanges();

    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeDetail());
    harness.detectChanges();

    http
      .expectOne(
        `${API_BASE}/api/v1/manager/approvals/proposals/${PROP_1}/forward`,
      )
      .error(new ProgressEvent('error'), { status: 0 });
    harness.detectChanges();

    // Flush mutation state's own reconciliation reads
    for (const req of http.match(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)) {
      req.flush(makeDetail());
    }
    harness.detectChanges();
    for (const req of http.match(
      `${API_BASE}/api/v1/manager/approvals/proposals`,
    )) {
      req.flush([makeProposal()]);
    }
    harness.detectChanges();
    for (const req of http.match(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)) {
      req.flush(makeDetail());
    }
    harness.detectChanges();
    http.verify();

    // Unrelated changeRequest.updated arrives while uncertain -> suppressed & deferred
    workshopHubs[0].emit('changeRequest.updated', {
      id: CR_1,
      jobCardId: JOB_1,
      status: 'PendingManagerReview',
    });
    vi.advanceTimersByTime(WORKSHOP_REALTIME_COALESCE_WINDOW_MS);
    http.expectNone(
      `${API_BASE}/api/v1/manager/approvals/change-requests?pendingOnly=false`,
    );

    // Manager clicks Acknowledge -> returns to idle (explicitly reviewed)
    const ackBtn = el.querySelector(
      '[data-testid="acknowledge-btn"] button',
    ) as HTMLButtonElement;
    expect(ackBtn).toBeTruthy();
    ackBtn.click();
    harness.detectChanges();

    // Flush any immediate post-acknowledgement reads initiated by FixProofOversight
    for (const req of http.match(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)) {
      req.flush(makeDetail());
    }
    for (const req of http.match(
      `${API_BASE}/api/v1/manager/approvals/proposals`,
    )) {
      req.flush([makeProposal()]);
    }
    for (const req of http.match(
      `${API_BASE}/api/v1/manager/approvals/change-requests?pendingOnly=false`,
    )) {
      req.flush([makeChangeRequest()]);
    }
    harness.detectChanges();

    // After 400ms coalescing window, deferred changeRequest invalidation recovers cleanly!
    vi.advanceTimersByTime(WORKSHOP_REALTIME_COALESCE_WINDOW_MS);
    http
      .expectOne(
        `${API_BASE}/api/v1/manager/approvals/change-requests?pendingOnly=false`,
      )
      .flush([makeChangeRequest()]);
    for (const req of http.match(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)) {
      req.flush(makeDetail());
    }
    harness.detectChanges();

    http.expectNone(req => req.method === 'POST');
    http.verify();
  });

  it('WRI-08 (FE-02 & A11y) serializes rapid leave-and-reenter over async stop and exposes polite ARIA status live regions on all 3 Day06 pages', async () => {
    const { http, session } = setupAppWorkspace();
    session.setSession(makeManagerSession());

    let resolveStop1!: () => void;
    workshopFactory.mockImplementationOnce(config => {
      const h = new FakeHub(config);
      h.stopSpy.mockImplementation(
        () =>
          new Promise<void>(resolve => {
            resolveStop1 = resolve;
          }),
      );
      workshopHubs.push(h);
      return h;
    });

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/job-cards');
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs?activeOnly=true`)
      .flush([makeJobSummary()]);
    await Promise.resolve();
    harness.detectChanges();

    const jobsStatus = harness.routeNativeElement?.querySelector(
      '[data-testid="jobs-realtime-status"]',
    );
    expect(jobsStatus?.getAttribute('role')).toBe('status');
    expect(jobsStatus?.getAttribute('aria-live')).toBe('polite');
    expect(jobsStatus?.getAttribute('aria-atomic')).toBe('true');

    // Leave to /dashboard -> conn1.stop() is pending asynchronously
    await harness.navigateByUrl('/dashboard');
    await Promise.resolve();
    expect(workshopHubs[0].stopSpy).toHaveBeenCalledTimes(1);

    // Rapidly re-enter /job-cards BEFORE conn1.stop() settles
    await harness.navigateByUrl('/job-cards');
    for (const req of http.match(
      `${API_BASE}/api/v1/manager/jobs?activeOnly=true`,
    )) {
      req.flush([makeJobSummary()]);
    }
    await Promise.resolve();
    harness.detectChanges();

    // No overlapping second hub created until conn1.stop() finishes
    expect(workshopFactory).toHaveBeenCalledTimes(1);

    resolveStop1();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    harness.detectChanges();

    expect(workshopFactory).toHaveBeenCalledTimes(2);
    expect(workshopHubs[1].startSpy).toHaveBeenCalledTimes(1);

    // Check ARIA live regions on JobCardDetail & FixProofOversight as well
    await harness.navigateByUrl(`/job-cards/${JOB_1}`);
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeDetail());
    harness.detectChanges();
    const detailStatus = harness.routeNativeElement?.querySelector(
      '[data-testid="detail-realtime-status"]',
    );
    expect(detailStatus?.getAttribute('role')).toBe('status');
    expect(detailStatus?.getAttribute('aria-live')).toBe('polite');

    await harness.navigateByUrl('/job-cards/fixproof');
    http
      .expectOne(`${API_BASE}/api/v1/manager/approvals/proposals`)
      .flush([]);
    http
      .expectOne(
        `${API_BASE}/api/v1/manager/approvals/change-requests?pendingOnly=false`,
      )
      .flush([]);
    harness.detectChanges();
    const fixproofStatus = harness.routeNativeElement?.querySelector(
      '[data-testid="fixproof-realtime-status"]',
    );
    expect(fixproofStatus?.getAttribute('role')).toBe('status');
    expect(fixproofStatus?.getAttribute('aria-live')).toBe('polite');

    http.verify();
  });
});
