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

import { JOB_CARDS_ROUTES } from '../job-cards/job-cards.routes';

import { FIXPROOF_REVIEW_ROUTES } from './fixproof-review.routes';
import { fixProofMutationCanDeactivateGuard } from './guards/fixproof-mutation-navigation.guard';
import { FixProofOversight } from './pages/fixproof-oversight/fixproof-oversight';
import { FixProofMutationStateService } from './services/fixproof-mutation-state.service';
import { FixProofNavigationConfirmationService } from './services/fixproof-navigation-confirmation.service';
import {
  FIXPROOF_BEFORE_UNLOAD_TARGET,
  FixProofNavigationProtectionService,
  type FixProofMutationProtectionSource,
} from './services/fixproof-navigation-protection.service';
import { FixProofStateService } from './services/fixproof-state.service';

const BASE_TIME = Date.UTC(2026, 10, 28, 12, 0, 0);
const API_BASE = 'https://api.fixora.test';

function makeSession(
  id = 'manager-001',
  roles: AuthSession['user']['roles'] = ['Manager'],
): AuthSession {
  return {
    accessToken: `token-${id}`,
    expiresAt: BASE_TIME + 300_000,
    user: {
      id,
      displayName: 'Test User',
      email: `${id}@fixora.test`,
      roles,
    },
  };
}

@Component({
  selector: 'test-fpr-shell',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>',
})
class TestShell {}

@Component({
  selector: 'test-fpr-stub',
  standalone: true,
  template: '<p>Stub</p>',
})
class TestStub {}

// Native dialog compatibility for jsdom unit tests (matches confirmation-dialog.spec.ts).
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

describe('FIXPROOF_REVIEW_ROUTES integration (K14)', () => {
  let cleanupDialog: (() => void) | null = null;

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

  function setupTestBed() {
    const testRoutes: Routes = [
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
        provideRouter(testRoutes),
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

    return {
      router: TestBed.inject(Router),
      session: TestBed.inject(SessionService),
      http: TestBed.inject(HttpTestingController),
      protection: TestBed.inject(FixProofNavigationProtectionService),
    };
  }

  it('FPR-01 mounts under /job-cards/fixproof behind shell guards without modifying top-level routes', async () => {
    expect(FIXPROOF_REVIEW_ROUTES).toHaveLength(1);
    expect(FIXPROOF_REVIEW_ROUTES[0].path).toBe('');
    expect(FIXPROOF_REVIEW_ROUTES[0].title).toBe('FIXORA | FixProof Oversight');
    expect(FIXPROOF_REVIEW_ROUTES[0].canDeactivate).toEqual([
      fixProofMutationCanDeactivateGuard,
    ]);

    const shell = appRoutes.find(
      route => route.path === '' && Array.isArray(route.children),
    );
    const workspacePaths = shell?.children
      ?.filter(route => route.path !== '')
      .map(route => route.path);
    expect(workspacePaths).toHaveLength(11);
    expect(workspacePaths).not.toContain('fixproof');
    expect(workspacePaths).not.toContain('fixproof-review');

    const { router, session, http } = setupTestBed();
    session.setSession(makeSession());

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/job-cards/fixproof');
    expect(router.url).toBe('/job-cards/fixproof');
    expect(
      harness.routeNativeElement?.querySelector('app-fixproof-oversight'),
    ).toBeTruthy();
    expect(FixProofOversight).toBeDefined();

    http.expectOne(`${API_BASE}/api/v1/manager/approvals/proposals`).flush([]);
    http
      .expectOne(
        `${API_BASE}/api/v1/manager/approvals/change-requests?pendingOnly=false`,
      )
      .flush([]);
    http.verify();
  });

  it('FPR-02 redirects unauthenticated users and blocks non-manager roles from /job-cards/fixproof', async () => {
    const { router, session, http } = setupTestBed();
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/job-cards/fixproof');
    expect(router.url).toContain('/login');

    session.setSession(makeSession('admin-1', ['PlatformAdmin']));
    await harness.navigateByUrl('/job-cards/fixproof');
    expect(router.url).not.toBe('/job-cards/fixproof');
    http.verify();
  });

  it('FPR-03 keeps FixProofStateService, FixProofMutationStateService and confirmation service non-root', () => {
    setupTestBed();
    expect(
      TestBed.inject(FixProofStateService, null, { optional: true }),
    ).toBeNull();
    expect(
      TestBed.inject(FixProofMutationStateService, null, { optional: true }),
    ).toBeNull();
    expect(
      TestBed.inject(FixProofNavigationConfirmationService, null, {
        optional: true,
      }),
    ).toBeNull();
  });

  it('FPR-04 wires fixProofMutationCanDeactivateGuard to the real ConfirmationDialog on /job-cards/fixproof', async () => {
    const { router, session, http, protection } = setupTestBed();
    const activeSession = makeSession();
    session.setSession(activeSession);

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/job-cards/fixproof');
    http.expectOne(`${API_BASE}/api/v1/manager/approvals/proposals`).flush([]);
    http
      .expectOne(
        `${API_BASE}/api/v1/manager/approvals/change-requests?pendingOnly=false`,
      )
      .flush([]);
    harness.detectChanges();

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

    const waitForDialogOpen = async (el: HTMLElement) => {
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
        harness.detectChanges();
        const dlg = el.querySelector('dialog') as HTMLDialogElement | null;
        if (dlg?.open) {
          return dlg;
        }
      }
      return null;
    };

    const el = harness.routeNativeElement as HTMLElement;

    // Trigger navigation while protected -> dialog opens and blocks until user responds.
    const firstAttempt = router.navigateByUrl('/dashboard');
    const firstDialog = await waitForDialogOpen(el);
    expect(firstDialog?.open).toBe(true);
    expect(el.textContent).toContain('Leave FixProof Oversight?');

    const stayBtn = Array.from(el.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('Stay on page'),
    );
    expect(stayBtn).toBeTruthy();
    stayBtn!.click();
    harness.detectChanges();

    expect(await firstAttempt).toBe(false);
    expect(router.url).toBe('/job-cards/fixproof');

    // Second attempt -> confirm leaving allows navigation cleanly.
    const secondAttempt = router.navigateByUrl('/dashboard');
    const secondDialog = await waitForDialogOpen(el);
    expect(secondDialog?.open).toBe(true);

    const leaveBtn = Array.from(el.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('Leave page'),
    );
    expect(leaveBtn).toBeTruthy();
    leaveBtn!.click();
    harness.detectChanges();

    expect(await secondAttempt).toBe(true);
    expect(router.url).toBe('/dashboard');

    unregister();
    http.verify();
  });

  it('FPR-05 never traps logout navigation when session is cleared during protected mutation', async () => {
    const { router, session, http, protection } = setupTestBed();
    const activeSession = makeSession();
    session.setSession(activeSession);

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/job-cards/fixproof');
    http.expectOne(`${API_BASE}/api/v1/manager/approvals/proposals`).flush([]);
    http
      .expectOne(
        `${API_BASE}/api/v1/manager/approvals/change-requests?pendingOnly=false`,
      )
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

    session.clearSession();
    expect(await router.navigateByUrl('/login')).toBe(true);
    expect(router.url).toBe('/login');

    unregister();
    http.verify();
  });
});
