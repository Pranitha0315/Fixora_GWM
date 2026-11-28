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

import {
  FIXPROOF_NAVIGATION_CONFIRMATION,
  fixProofMutationCanDeactivateGuard,
} from '../fixproof-review/guards/fixproof-mutation-navigation.guard';
import { FixProofOversight } from '../fixproof-review/pages/fixproof-oversight/fixproof-oversight';
import {
  FIXPROOF_BEFORE_UNLOAD_TARGET,
  FixProofNavigationProtectionService,
  type FixProofMutationProtectionSource,
} from '../fixproof-review/services/fixproof-navigation-protection.service';

import { JOB_CARDS_ROUTES, JOB_CARDS_WORKSPACE_ROUTES } from './job-cards.routes';
import { JobCardDetail } from './pages/job-card-detail/job-card-detail';
import { JobCards } from './pages/job-cards/job-cards';
import { JobCardStateService } from './services/job-card-state.service';
import { WorkshopRealtimeCoordinatorService } from './services/workshop-realtime-coordinator.service';
import { WorkshopRealtimeService } from './services/workshop-realtime.service';

const API_BASE = 'https://api.fixora.test';
const BASE_TIME = Date.UTC(2026, 10, 28, 12, 0, 0);
const JOB_ID = '11111111-1111-4111-8111-111111111111';

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

@Component({
  selector: 'test-jcr-shell',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>',
})
class TestShell {}

@Component({
  selector: 'test-jcr-dashboard',
  standalone: true,
  template: '<p>Dashboard Stub</p>',
})
class TestDashboard {}

describe('JOB_CARDS_ROUTES actual wiring (K13-A04-R4 / K14 / K15)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('JCR-01 attaches fixProofMutationCanDeactivateGuard while preserving path, title and lazy JobCards loader', async () => {
    expect(JOB_CARDS_ROUTES).toHaveLength(3);
    expect(JOB_CARDS_ROUTES[0].path).toBe('');
    expect(JOB_CARDS_ROUTES[0].title).toBe('FIXORA | Job Cards');
    expect(JOB_CARDS_ROUTES[0].canDeactivate).toEqual([
      fixProofMutationCanDeactivateGuard,
    ]);
    expect(JOB_CARDS_ROUTES[0].loadComponent).toBeTypeOf('function');

    const loaded = await (
      JOB_CARDS_ROUTES[0].loadComponent as () => Promise<unknown>
    )();
    expect(loaded).toBe(JobCards);

    expect(JOB_CARDS_ROUTES[1].path).toBe('fixproof');
    expect(JOB_CARDS_ROUTES[1].loadChildren).toBeTypeOf('function');

    expect(JOB_CARDS_ROUTES[2].path).toBe(':jobId');
    expect(JOB_CARDS_ROUTES[2].title).toBe('FIXORA | Job Card Detail');
    expect(JOB_CARDS_ROUTES[2].canDeactivate).toEqual([
      fixProofMutationCanDeactivateGuard,
    ]);
    expect(JOB_CARDS_ROUTES[2].loadComponent).toBeTypeOf('function');
  });

  it('JCR-04 lazy-loads FIXPROOF_REVIEW_ROUTES on static fixproof child route with navigation guard active', async () => {
    const fixproofRoute = JOB_CARDS_ROUTES.find(r => r.path === 'fixproof');
    expect(fixproofRoute?.loadChildren).toBeTypeOf('function');

    const loaded = await (
      fixproofRoute!.loadChildren as () => Promise<Routes>
    )();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].path).toBe('');
    expect(loaded[0].title).toBe('FIXORA | FixProof Oversight');
    expect(loaded[0].canDeactivate).toEqual([
      fixProofMutationCanDeactivateGuard,
    ]);
  });

  it('JCR-02 is lazy-loaded by app.routes.ts behind existing shell auth/role guards without adding a top-level FixProof route', async () => {
    const shell = appRoutes.find(
      route => route.path === '' && Array.isArray(route.children),
    );
    expect(shell).toBeDefined();
    expect(shell?.canActivate).toEqual([authGuard, managerRoleGuard]);
    expect(shell?.canActivateChild).toEqual([
      authChildGuard,
      managerRoleChildGuard,
    ]);

    const workspacePaths = shell?.children
      ?.filter(route => route.path !== '')
      .map(route => route.path);
    expect(workspacePaths).toHaveLength(11);
    expect(workspacePaths).toContain('job-cards');
    expect(workspacePaths).not.toContain('fixproof-review');

    const jobCardsRoute = shell?.children?.find(
      route => route.path === 'job-cards',
    );
    expect(jobCardsRoute?.loadChildren).toBeTypeOf('function');
    // K18-B / FE-03: app.routes.ts MUST NOT eagerly provide realtime services
    // so @microsoft/signalr stays excluded from the initial bundle.
    expect(jobCardsRoute?.providers).toBeUndefined();

    const loadedRoutes = await (
      jobCardsRoute?.loadChildren as () => Promise<Routes>
    )();
    expect(loadedRoutes).toBe(JOB_CARDS_WORKSPACE_ROUTES);
    expect(loadedRoutes).toHaveLength(1);
    expect(loadedRoutes[0].path).toBe('');
    expect(loadedRoutes[0].providers).toEqual([
      WorkshopRealtimeService,
      WorkshopRealtimeCoordinatorService,
    ]);
    expect(loadedRoutes[0].children).toBe(JOB_CARDS_ROUTES);
    expect(loadedRoutes[0].children?.[0].canDeactivate).toEqual([
      fixProofMutationCanDeactivateGuard,
    ]);
  });

  it('JCR-03 invokes the real JOB_CARDS_ROUTES canDeactivate guard during router navigation', async () => {
    const confirmSpy = vi.fn(() => false);

    const routes: Routes = [
      { path: 'login', component: TestDashboard },
      {
        path: '',
        canActivate: [authGuard, managerRoleGuard],
        canActivateChild: [authChildGuard, managerRoleChildGuard],
        component: TestShell,
        children: [
          { path: 'dashboard', component: TestDashboard },
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
        {
          provide: FIXPROOF_NAVIGATION_CONFIRMATION,
          useValue: confirmSpy,
        },
      ],
    });

    const session = TestBed.inject(SessionService);
    const router = TestBed.inject(Router);
    const http = TestBed.inject(HttpTestingController);
    const protection = TestBed.inject(FixProofNavigationProtectionService);
    const activeSession = makeManagerSession();
    session.setSession(activeSession);

    const harness = await RouterTestingHarness.create();

    // Unprotected JobCards route navigates away freely.
    await harness.navigateByUrl('/job-cards');
    expect(router.url).toBe('/job-cards');
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs?activeOnly=true`)
      .flush([]);

    expect(await router.navigateByUrl('/dashboard')).toBe(true);
    expect(router.url).toBe('/dashboard');
    expect(confirmSpy).not.toHaveBeenCalled();

    // Re-enter /job-cards and simulate an active protected mutation source.
    await harness.navigateByUrl('/job-cards');
    expect(router.url).toBe('/job-cards');
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs?activeOnly=true`)
      .flush([]);

    const activeSource: FixProofMutationProtectionSource = {
      isDestroyed: () => false,
      phase: () => 'submitting',
      hasUnresolvedOperation: () => false,
      detachedRequestPending: () => false,
      accessLoss: () => null,
      activeSequence: () => 1,
      isBoundToSession: s => s === activeSession,
      detachedSequencesForSession: () => [],
    };
    const unregister = protection.registerSource(activeSource);

    // Real JOB_CARDS_ROUTES guard blocks leaving /job-cards when declined.
    expect(await router.navigateByUrl('/dashboard')).toBe(false);
    expect(router.url).toBe('/job-cards');
    expect(confirmSpy).toHaveBeenCalledTimes(1);

    // Once confirmed, leaving succeeds.
    confirmSpy.mockReturnValueOnce(true);
    expect(await router.navigateByUrl('/dashboard')).toBe(true);
    expect(router.url).toBe('/dashboard');

    unregister();
    http.verify();
  });

  it('JCR-05 keeps static fixproof route ahead of :jobId, mounts JobCardDetail with feature-scoped JobCardStateService', async () => {
    const routes: Routes = [
      { path: 'login', component: TestDashboard },
      {
        path: '',
        canActivate: [authGuard, managerRoleGuard],
        canActivateChild: [authChildGuard, managerRoleChildGuard],
        component: TestShell,
        children: [
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

    // JobCardStateService must remain strictly feature-scoped, never root-scoped.
    expect(TestBed.inject(JobCardStateService, null, { optional: true })).toBeNull();
    expect(JobCardDetail).toBeDefined();
    expect(FixProofOversight).toBeDefined();

    const session = TestBed.inject(SessionService);
    const router = TestBed.inject(Router);
    const http = TestBed.inject(HttpTestingController);
    session.setSession(makeManagerSession());

    const harness = await RouterTestingHarness.create();

    // 1. /job-cards/fixproof MUST resolve to FixProofOversight, never :jobId!
    await harness.navigateByUrl('/job-cards/fixproof');
    expect(router.url).toBe('/job-cards/fixproof');
    expect(
      harness.routeNativeElement?.querySelector('app-fixproof-oversight'),
    ).toBeTruthy();
    expect(
      harness.routeNativeElement?.querySelector('app-job-card-detail'),
    ).toBeNull();

    http.expectOne(`${API_BASE}/api/v1/manager/approvals/proposals`).flush([]);
    http
      .expectOne(
        `${API_BASE}/api/v1/manager/approvals/change-requests?pendingOnly=false`,
      )
      .flush([]);

    // 2. /job-cards/:jobId resolves to JobCardDetail and fetches authoritative detail.
    await harness.navigateByUrl(`/job-cards/${JOB_ID}`);
    expect(router.url).toBe(`/job-cards/${JOB_ID}`);
    expect(
      harness.routeNativeElement?.querySelector('app-job-card-detail'),
    ).toBeTruthy();

    http.expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_ID}`).flush({
      job: {
        id: JOB_ID,
        number: 'JC-2026-001',
        customerId: '22222222-2222-4222-8222-222222222222',
        customerName: 'Arjun',
        vehicleId: '33333333-3333-4333-8333-333333333333',
        vehicleLabel: 'Honda City',
        mechanicId: null,
        mechanicName: null,
        bayId: null,
        bayName: null,
        status: 'Open',
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
      proposals: [],
      changeRequests: [],
      invoice: null,
      queue: {
        jobId: JOB_ID,
        position: 1,
        etaAt: null,
        status: 'Open',
        indicative: true,
      },
    });
    http.verify();
  });
});
