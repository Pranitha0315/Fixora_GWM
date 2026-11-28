import { Component, inject } from '@angular/core';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet } from '@angular/router';
import type { Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { EMPTY, of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';

import { SessionService } from '../../../core/auth/session.service';
import { authChildGuard, authGuard } from '../../../core/guards/auth.guard';
import {
  managerRoleChildGuard,
  managerRoleGuard,
} from '../../../core/guards/role.guard';
import type { AuthRole } from '../../../core/models/auth-role.model';
import type { AuthSession } from '../../../core/models/auth-session.model';
import { ApiError } from '../../../core/models/api-error.model';

import {
  Day06AuthorizationCoordinatorService,
} from '../../job-cards/services/day06-authorization-coordinator.service';
import type { JobDetailDto } from '../../job-cards/models/job-card.model';
import { JobCardApiService } from '../../job-cards/services/job-card-api.service';

import type { ProposalDto } from '../models/fixproof.model';
import { FixProofApiService } from '../services/fixproof-api.service';
import { FixProofMutationApiService } from '../services/fixproof-mutation-api.service';
import { FixProofMutationStateService } from '../services/fixproof-mutation-state.service';
import {
  FIXPROOF_BEFORE_UNLOAD_TARGET,
  FixProofNavigationProtectionService,
  type FixProofBeforeUnloadTarget,
  type FixProofMutationProtectionSource,
} from '../services/fixproof-navigation-protection.service';
import { FixProofStateService } from '../services/fixproof-state.service';

import {
  FIXPROOF_NAVIGATION_CONFIRMATION,
  fixProofMutationCanDeactivateGuard,
  type FixProofNavigationConfirmationContext,
  type FixProofNavigationConfirmationHandler,
} from './fixproof-mutation-navigation.guard';

const BASE_TIME = Date.UTC(2026, 10, 28, 12, 0, 0);
const JOB_ID = '11111111-1111-4111-8111-111111111111';
const PROP_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';
const SECRET_NOTE = 'Sensitive manager note for customer vehicle';

function makeSession(
  id = 'manager-001',
  roles: readonly AuthRole[] = ['Manager'],
): AuthSession {
  return {
    accessToken: `secret-token-${id}`,
    expiresAt: BASE_TIME + 300_000,
    user: {
      id,
      displayName: `Manager ${id}`,
      email: `${id}@fixora.test`,
      roles,
    },
  };
}

function makeProposal(status = 'PendingManagerReview'): ProposalDto {
  return {
    id: PROP_ID,
    jobCardId: JOB_ID,
    jobNumber: 'JC-1001',
    vehicleLabel: 'Toyota Corolla',
    customerName: 'Test Customer',
    status,
    mechanicId: '66666666-6666-4666-8666-666666666666',
    mechanicName: 'Ravi',
    mechanicNote: null,
    managerNote: null,
    customerNote: null,
    submittedAt: '2026-11-28T10:00:00Z',
    publishedAt: null,
    respondedAt: null,
    releasedAt: null,
    total: 150,
    approvedTotal: 0,
    items: [
      {
        id: ITEM_ID,
        title: 'Brake pads',
        kind: 'Part',
        qty: 1,
        unitPrice: 150,
        amount: 150,
        status: 'Proposed',
        version: 1,
        linkedIssueId: null,
      },
    ],
    audit: [],
  };
}

function makeDetail(
  jobStatus = 'AwaitingManagerReview',
  proposal = makeProposal(),
): JobDetailDto {
  return {
    job: {
      id: JOB_ID,
      number: 'JC-1001',
      status: jobStatus,
      priority: 1,
      customerId: '44444444-4444-4444-8444-444444444444',
      customerName: 'Test Customer',
      vehicleId: '55555555-5555-4555-8555-555555555555',
      vehicleLabel: 'Toyota Corolla',
      bayId: null,
      bayName: null,
      mechanicId: '66666666-6666-4666-8666-666666666666',
      mechanicName: 'Ravi',
      queuePosition: 1,
      etaAt: null,
      estimatedMinutes: 60,
      elapsedMinutes: 10,
      createdAt: '2026-11-28T09:00:00Z',
      startedAt: null,
      completedAt: null,
      complaint: 'Brakes squeaking',
      managerNote: null,
    },
    timeline: [],
    issues: [],
    proposals: [proposal],
    changeRequests: [],
    invoice: null,
    queue: {
      jobId: JOB_ID,
      position: 1,
      etaAt: null,
      status: jobStatus,
      indicative: false,
    },
  };
}

@Component({
  selector: 'test-r4-shell-host',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>',
})
class ShellHost {}

@Component({
  selector: 'test-r4-target-page',
  standalone: true,
  template: '<p>Target Page</p>',
})
class TargetPage {}

@Component({
  selector: 'test-r4-fixproof-host',
  standalone: true,
  providers: [FixProofStateService, FixProofMutationStateService],
  template: '<p>FixProof Host</p>',
})
class FixProofHostPage {
  readonly fixProof = inject(FixProofStateService);
  readonly mutation = inject(FixProofMutationStateService);
}

function createNoopUnloadTarget(): FixProofBeforeUnloadTarget {
  return {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

describe('fixProofMutationCanDeactivateGuard (K13-A04-R4)', () => {
  let router: Router;
  let session: SessionService;
  let protection: FixProofNavigationProtectionService;
  let proposalCalls: Subject<readonly ProposalDto[]>[];
  let detailCalls: Subject<JobDetailDto>[];
  let forwardCalls: Subject<ProposalDto>[];
  let confirmationImpl: FixProofNavigationConfirmationHandler | null;

  const testRoutes: Routes = [
    { path: 'login', component: TargetPage },
    {
      path: '',
      canActivate: [authGuard, managerRoleGuard],
      canActivateChild: [authChildGuard, managerRoleChildGuard],
      component: ShellHost,
      children: [
        { path: 'dashboard', component: TargetPage },
        { path: 'bookings', component: TargetPage },
        {
          path: 'job-cards',
          canDeactivate: [fixProofMutationCanDeactivateGuard],
          component: FixProofHostPage,
        },
      ],
    },
  ];

  function setup(
    confirmHandler: FixProofNavigationConfirmationHandler | null = null,
  ): void {
    confirmationImpl = confirmHandler;
    proposalCalls = [];
    detailCalls = [];
    forwardCalls = [];

    const fakeFixProofApi = {
      getProposals: vi.fn(() => {
        const s = new Subject<readonly ProposalDto[]>();
        proposalCalls.push(s);
        return s.asObservable();
      }),
      getChangeRequests: vi.fn(() => of([])),
    };

    const fakeJobApi = {
      getJobCards: vi.fn(() => of([])),
      getJobCard: vi.fn(() => {
        const s = new Subject<JobDetailDto>();
        detailCalls.push(s);
        return s.asObservable();
      }),
    };

    const fakeMutationApi = {
      setItemPrice: vi.fn(),
      reviseItem: vi.fn(),
      forwardProposal: vi.fn(() => {
        const s = new Subject<ProposalDto>();
        forwardCalls.push(s);
        return s.asObservable();
      }),
      returnProposal: vi.fn(),
      releaseProposal: vi.fn(),
      forwardChangeRequest: vi.fn(),
      declineChangeRequest: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideRouter(testRoutes),
        {
          provide: FIXPROOF_BEFORE_UNLOAD_TARGET,
          useValue: createNoopUnloadTarget(),
        },
        ...(confirmationImpl !== null
          ? [
              {
                provide: FIXPROOF_NAVIGATION_CONFIRMATION,
                useValue: confirmationImpl,
              },
            ]
          : []),
        { provide: FixProofApiService, useValue: fakeFixProofApi },
        { provide: JobCardApiService, useValue: fakeJobApi },
        { provide: FixProofMutationApiService, useValue: fakeMutationApi },
      ],
    });

    router = TestBed.inject(Router);
    session = TestBed.inject(SessionService);
    protection = TestBed.inject(FixProofNavigationProtectionService);
    session.setSession(makeSession());
  }

  async function waitForConfirmationStart(): Promise<void> {
    for (let i = 0; i < 30 && !protection.isConfirmationInProgress(); i++) {
      await Promise.resolve();
    }
  }

  async function openHostPage(
    harness: RouterTestingHarness,
  ): Promise<FixProofHostPage> {
    await harness.navigateByUrl('/job-cards');
    const debugEl = harness.fixture.debugElement.query(
      By.directive(FixProofHostPage),
    );
    expect(debugEl).not.toBeNull();
    return debugEl.componentInstance as FixProofHostPage;
  }

  function startSubmitting(host: FixProofHostPage): Subject<ProposalDto> {
    host.fixProof.refreshProposals();
    const listSub = proposalCalls[proposalCalls.length - 1];
    listSub.next([makeProposal()]);
    listSub.complete();

    host.fixProof.selectProposal(PROP_ID);
    const openDetail = detailCalls[detailCalls.length - 1];
    openDetail.next(makeDetail());
    openDetail.complete();
    TestBed.tick();

    const started = host.mutation.forwardProposal(PROP_ID, SECRET_NOTE);
    expect(started).toEqual({ started: true, reason: null });
    expect(host.mutation.phase()).toBe('validating');

    const preflight = detailCalls[detailCalls.length - 1];
    preflight.next(makeDetail());
    preflight.complete();
    TestBed.tick();

    expect(host.mutation.phase()).toBe('submitting');
    return forwardCalls[forwardCalls.length - 1];
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('R4-GD-01 allows navigation freely when idle or validating (preflight only)', async () => {
    setup();
    const harness = await RouterTestingHarness.create();
    const host = await openHostPage(harness);

    expect(router.url).toBe('/job-cards');
    expect(await router.navigateByUrl('/dashboard')).toBe(true);
    expect(router.url).toBe('/dashboard');

    // Re-enter and start preflight (validating only, nothing dispatched) -> still allowed.
    const host2 = await openHostPage(harness);
    host2.fixProof.refreshProposals();
    proposalCalls[proposalCalls.length - 1].next([makeProposal()]);
    proposalCalls[proposalCalls.length - 1].complete();
    host2.fixProof.selectProposal(PROP_ID);
    detailCalls[detailCalls.length - 1].next(makeDetail());
    detailCalls[detailCalls.length - 1].complete();
    TestBed.tick();

    host2.mutation.forwardProposal(PROP_ID, SECRET_NOTE);
    expect(host2.mutation.phase()).toBe('validating');
    expect(await router.navigateByUrl('/dashboard')).toBe(true);
    expect(router.url).toBe('/dashboard');
    expect(forwardCalls).toHaveLength(0);
    expect(protection.currentSessionNotices()).toEqual([]);
  });

  it('R4-GD-02 blocks protected navigation by default (fail-closed) and keeps component and mutation state alive', async () => {
    setup(null);
    const harness = await RouterTestingHarness.create();
    const host = await openHostPage(harness);
    const call = startSubmitting(host);

    const navigated = await router.navigateByUrl('/dashboard');

    expect(navigated).toBe(false);
    expect(router.url).toBe('/job-cards');
    expect(host.mutation.phase()).toBe('submitting');
    expect(call.observed).toBe(true);
    expect(forwardCalls).toHaveLength(1);
    expect(protection.currentSessionNotices()).toEqual([]);
  });

  it('R4-GD-03 declined confirmation preserves component, mutation state and non-sensitive wording', async () => {
    const receivedContexts: FixProofNavigationConfirmationContext[] = [];
    setup(ctx => {
      receivedContexts.push(ctx);
      return false;
    });

    const harness = await RouterTestingHarness.create();
    const host = await openHostPage(harness);
    const call = startSubmitting(host);

    expect(await router.navigateByUrl('/dashboard')).toBe(false);
    expect(router.url).toBe('/job-cards');
    expect(host.mutation.phase()).toBe('submitting');
    expect(call.observed).toBe(true);
    expect(receivedContexts).toHaveLength(1);
    expect(receivedContexts[0].targetUrl).toBe('/dashboard');
    expect(receivedContexts[0].message).toContain('does not roll back');
    expect(receivedContexts[0].message).not.toContain(JOB_ID);
    expect(receivedContexts[0].message).not.toContain(PROP_ID);
    expect(receivedContexts[0].message).not.toContain(SECRET_NOTE);
    expect(JSON.stringify(receivedContexts[0])).not.toContain('secret-token');
    expect(protection.isConfirmationInProgress()).toBe(false);
  });

  it('R4-GD-04 explicit synchronous confirmation allows navigation, cleans up transport without resending, and preserves session notice', async () => {
    setup(() => true);
    const harness = await RouterTestingHarness.create();
    const host = await openHostPage(harness);
    const call = startSubmitting(host);

    expect(await router.navigateByUrl('/dashboard')).toBe(true);
    expect(router.url).toBe('/dashboard');
    expect(call.observed).toBe(false);
    expect(forwardCalls).toHaveLength(1);

    // Same-session notice preserved so re-entry still knows a mutation may have executed.
    const notices = protection.currentSessionNotices();
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      action: 'forward',
      reason: 'destroyed-while-submitting',
      potentiallyExecuted: true,
      proofOfOutcome: 'none',
    });
    expect(JSON.stringify(notices)).not.toContain(JOB_ID);
    expect(JSON.stringify(notices)).not.toContain(PROP_ID);
    expect(JSON.stringify(notices)).not.toContain(SECRET_NOTE);
  });

  it('R4-GD-05 supports Promise confirmation (resolve true, resolve false, and rejection fails closed)', async () => {
    let resolver: ((value: boolean) => void) | null = null;
    let rejecter: ((err: unknown) => void) | null = null;
    let mode: 'resolve' | 'reject' = 'resolve';

    setup(
      () =>
        new Promise<boolean>((resolve, reject) => {
          if (mode === 'resolve') {
            resolver = resolve;
          } else {
            rejecter = reject;
          }
        }),
    );

    const harness = await RouterTestingHarness.create();
    const host = await openHostPage(harness);
    startSubmitting(host);

    // 1. Promise rejects -> fails closed, lock released.
    mode = 'reject';
    const navReject = router.navigateByUrl('/dashboard');
    await waitForConfirmationStart();
    expect(protection.isConfirmationInProgress()).toBe(true);
    rejecter!(new Error('Dialog failed'));
    expect(await navReject).toBe(false);
    expect(router.url).toBe('/job-cards');
    expect(protection.isConfirmationInProgress()).toBe(false);

    // 2. Promise resolves false -> stays.
    mode = 'resolve';
    const navFalse = router.navigateByUrl('/dashboard');
    await waitForConfirmationStart();
    resolver!(false);
    expect(await navFalse).toBe(false);
    expect(router.url).toBe('/job-cards');
    expect(protection.isConfirmationInProgress()).toBe(false);

    // 3. Promise resolves true -> leaves.
    const navTrue = router.navigateByUrl('/dashboard');
    await waitForConfirmationStart();
    resolver!(true);
    expect(await navTrue).toBe(true);
    expect(router.url).toBe('/dashboard');
    expect(protection.isConfirmationInProgress()).toBe(false);
  });

  it('R4-GD-06 supports Observable confirmation (true, false, error, and empty completion fail closed)', async () => {
    let nextReturn: ReturnType<FixProofNavigationConfirmationHandler> = EMPTY;
    setup(() => nextReturn);

    const harness = await RouterTestingHarness.create();
    const host = await openHostPage(harness);
    startSubmitting(host);

    // Empty completion -> fails closed.
    nextReturn = EMPTY;
    expect(await router.navigateByUrl('/dashboard')).toBe(false);
    expect(protection.isConfirmationInProgress()).toBe(false);

    // Error -> fails closed.
    nextReturn = throwError(() => new Error('Stream failed'));
    expect(await router.navigateByUrl('/dashboard')).toBe(false);
    expect(protection.isConfirmationInProgress()).toBe(false);

    // Synchronous throw -> fails closed.
    nextReturn = (() => {
      throw new Error('Sync throw');
    }) as unknown as boolean;
    // Direct test with throwing handler below in R4-GD-07; verify of(false) & of(true) here:
    nextReturn = of(false);
    expect(await router.navigateByUrl('/dashboard')).toBe(false);

    nextReturn = of(true);
    expect(await router.navigateByUrl('/dashboard')).toBe(true);
    expect(router.url).toBe('/dashboard');
  });

  it('R4-GD-07 fails closed when confirmation handler throws synchronously and releases lock', async () => {
    setup(() => {
      throw new Error('Unexpected dialog exception');
    });

    const harness = await RouterTestingHarness.create();
    const host = await openHostPage(harness);
    startSubmitting(host);

    expect(await router.navigateByUrl('/dashboard')).toBe(false);
    expect(router.url).toBe('/job-cards');
    expect(protection.isConfirmationInProgress()).toBe(false);
  });

  it('R4-GD-08 prevents overlapping confirmation prompts and handles superseded/canceled router navigation safely', async () => {
    const prompts: Subject<boolean>[] = [];
    const handlerSpy = vi.fn(() => {
      const subject = new Subject<boolean>();
      prompts.push(subject);
      return subject.asObservable();
    });

    setup(handlerSpy);
    const harness = await RouterTestingHarness.create();
    const host = await openHostPage(harness);
    startSubmitting(host);

    // Start first navigation -> opens prompt #1.
    const firstNav = router.navigateByUrl('/dashboard');
    await waitForConfirmationStart();
    expect(handlerSpy).toHaveBeenCalledTimes(1);
    expect(protection.isConfirmationInProgress()).toBe(true);
    expect(prompts[0].observed).toBe(true);

    // Overlapping direct guard invocation while lock is held MUST NOT invoke handler a second time.
    const overlapDecision = TestBed.runInInjectionContext(() =>
      fixProofMutationCanDeactivateGuard(
        host,
        {} as never,
        {} as never,
        { url: '/bookings' } as never,
      ),
    );
    expect(overlapDecision).toBe(false);
    expect(handlerSpy).toHaveBeenCalledTimes(1);

    // Superseded router navigation to /bookings cancels first navigation, unsubscribes prompt #1,
    // releases its lock, and starts prompt #2 cleanly.
    const secondNav = router.navigateByUrl('/bookings');
    expect(await firstNav).toBe(false);
    await waitForConfirmationStart();
    expect(prompts[0].observed).toBe(false);
    expect(handlerSpy).toHaveBeenCalledTimes(2);
    expect(protection.isConfirmationInProgress()).toBe(true);

    // Confirm second navigation -> navigates to /bookings and releases lock.
    prompts[1].next(true);
    prompts[1].complete();
    expect(await secondNav).toBe(true);
    expect(router.url).toBe('/bookings');
    expect(protection.isConfirmationInProgress()).toBe(false);
  });

  it('R4-GD-09 rejects stale confirmation if a different protected operation begins while confirmation is pending', async () => {
    const promptSubject = new Subject<boolean>();
    setup(() => promptSubject.asObservable());

    const harness = await RouterTestingHarness.create();
    const host = await openHostPage(harness);

    // Start operation #1 and move to uncertain -> reconciliation-required.
    const call1 = startSubmitting(host);
    call1.error(new ApiError(500, 'SERVER_ERROR', 'Server error'));
    const recDetail = detailCalls[detailCalls.length - 1];
    recDetail.next(makeDetail());
    recDetail.complete();
    proposalCalls[proposalCalls.length - 1].next([makeProposal()]);
    proposalCalls[proposalCalls.length - 1].complete();
    detailCalls[detailCalls.length - 1].next(makeDetail());
    detailCalls[detailCalls.length - 1].complete();
    TestBed.tick();
    expect(host.mutation.phase()).toBe('reconciliation-required');

    // Begin navigation -> confirmation prompt opens for op #1.
    const navPromise = router.navigateByUrl('/dashboard');
    await waitForConfirmationStart();
    expect(protection.isConfirmationInProgress()).toBe(true);

    // While confirmation is pending: acknowledge op #1 and start brand-new op #2!
    expect(host.mutation.acknowledge({ reviewed: true }).acknowledged).toBe(true);
    const call2 = startSubmitting(host);
    expect(host.mutation.phase()).toBe('submitting');

    // Now stale confirmation for op #1 resolves true -> MUST BE REJECTED!
    promptSubject.next(true);
    promptSubject.complete();

    expect(await navPromise).toBe(false);
    expect(router.url).toBe('/job-cards');
    expect(host.mutation.phase()).toBe('submitting');
    expect(call2.observed).toBe(true);
    expect(protection.isConfirmationInProgress()).toBe(false);
  });

  it('R4-GD-10 rejects stale confirmation if session changes and new session has a protected operation, but allows if resolved', async () => {
    const prompt1 = new Subject<boolean>();
    const prompt2 = new Subject<boolean>();
    let callIdx = 0;
    setup(() => (callIdx++ === 0 ? prompt1.asObservable() : prompt2.asObservable()));

    const harness = await RouterTestingHarness.create();
    const host = await openHostPage(harness);
    const mutCall = startSubmitting(host);

    // Start nav #1 while submitting; before prompt resolves, mutation succeeds!
    const nav1 = router.navigateByUrl('/dashboard');
    await waitForConfirmationStart();
    expect(protection.isConfirmationInProgress()).toBe(true);
    mutCall.next(makeProposal('AwaitingCustomer'));
    mutCall.complete();
    proposalCalls[proposalCalls.length - 1].next([makeProposal('AwaitingCustomer')]);
    proposalCalls[proposalCalls.length - 1].complete();
    detailCalls[detailCalls.length - 1].next(
      makeDetail('AwaitingCustomerApproval', makeProposal('AwaitingCustomer')),
    );
    detailCalls[detailCalls.length - 1].complete();
    TestBed.tick();
    expect(host.mutation.phase()).toBe('succeeded');

    // Even if prompt answers false, nothing is protected anymore -> navigation allowed.
    prompt1.next(false);
    prompt1.complete();
    expect(await nav1).toBe(true);
    expect(router.url).toBe('/dashboard');

    // Re-enter and test session replacement with a new protected source on session B.
    const host2 = await openHostPage(harness);
    startSubmitting(host2);
    const nav2 = router.navigateByUrl('/bookings');
    await waitForConfirmationStart();
    expect(protection.isConfirmationInProgress()).toBe(true);

    const sessionB = makeSession('manager-002');
    session.setSession(sessionB);
    TestBed.tick();

    // Register a new protected source bound to sessionB while prompt2 (from sessionA) is pending.
    const sourceB: FixProofMutationProtectionSource = {
      isDestroyed: () => false,
      phase: () => 'submitting',
      hasUnresolvedOperation: () => false,
      detachedRequestPending: () => false,
      accessLoss: () => null,
      activeSequence: () => 99,
      isBoundToSession: s => s === sessionB,
      detachedSequencesForSession: () => [],
    };
    const unregisterB = protection.registerSource(sourceB);

    prompt2.next(true);
    prompt2.complete();

    expect(await nav2).toBe(false);
    expect(router.url).toBe('/job-cards');
    unregisterB();
  });

  it('R4-GD-11 preserves Topbar logout flow and never traps an unauthenticated user inside a protected route', async () => {
    const confirmSpy = vi.fn(() => false);
    setup(confirmSpy);

    const harness = await RouterTestingHarness.create();
    const host = await openHostPage(harness);
    startSubmitting(host);

    // Simulate Topbar.logout(): clearSession() runs BEFORE router.navigate(['/login']).
    session.clearSession();
    TestBed.tick();

    const navigated = await router.navigate(['/login'], { replaceUrl: true });

    expect(navigated).toBe(true);
    expect(router.url).toBe('/login');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(protection.currentSessionNotices()).toEqual([]);
  });

  it('R4-GD-12 allows re-authentication to /login after HTTP 401/403 access loss while still protecting workspace navigation', async () => {
    const confirmSpy = vi.fn(() => false);
    setup(confirmSpy);

    const harness = await RouterTestingHarness.create();
    const host = await openHostPage(harness);
    const call = startSubmitting(host);

    // Move to uncertain, then trigger FixProof access revocation (HTTP 403) while SessionService remains active.
    call.error(new ApiError(500, 'SERVER_ERROR', 'Server error'));
    host.fixProof.revokeFeatureAccess('forbidden');
    TestBed.tick();

    expect(host.mutation.phase()).toBe('access-lost');
    expect(host.mutation.accessLoss()?.potentiallyExecuted).toBe(true);
    expect(session.isAuthenticated()).toBe(true);

    // Navigating to another workspace route (/dashboard) is STILL protected so warning is not silently lost.
    expect(await router.navigateByUrl('/dashboard')).toBe(false);
    expect(router.url).toBe('/job-cards');
    expect(confirmSpy).toHaveBeenCalledTimes(1);

    // Navigating to /login (re-authentication) MUST succeed without blocking.
    expect(await router.navigateByUrl('/login?reason=access-denied')).toBe(true);
    expect(router.url).toBe('/login?reason=access-denied');
    expect(confirmSpy).toHaveBeenCalledTimes(1);
  });

  it('R4-GD-13 preserves existing authGuard and managerRoleGuard enforcement without weakening authorization', async () => {
    setup();
    const harness = await RouterTestingHarness.create();

    // Unauthenticated user cannot open /job-cards -> redirected to /login?returnUrl=%2Fjob-cards.
    session.clearSession();
    await harness.navigateByUrl('/job-cards');
    expect(router.url).toBe('/login?returnUrl=%2Fjob-cards');

    // Unauthorized role cannot open /job-cards -> redirected to /login?reason=access-denied.
    session.setSession(makeSession('admin-001', ['PlatformAdmin']));
    await harness.navigateByUrl('/job-cards');
    expect(router.url).toBe('/login?reason=access-denied');

    // Authorized Manager can open /job-cards.
    session.setSession(makeSession('manager-001', ['Manager']));
    await harness.navigateByUrl('/job-cards');
    expect(router.url).toBe('/job-cards');

    // Coordinator remains untouched and available.
    expect(TestBed.inject(Day06AuthorizationCoordinatorService)).toBeTruthy();
  });

  it('R4-GD-14 ignores late Promise resolution from a canceled/superseded navigation and preserves new lock ownership', async () => {
    const resolvers: ((value: boolean) => void)[] = [];
    setup(
      () =>
        new Promise<boolean>(resolve => {
          resolvers.push(resolve);
        }),
    );

    const harness = await RouterTestingHarness.create();
    const host = await openHostPage(harness);
    startSubmitting(host);

    const nav1 = router.navigateByUrl('/dashboard');
    await waitForConfirmationStart();
    expect(resolvers).toHaveLength(1);
    expect(protection.isConfirmationInProgress()).toBe(true);

    // Supersede nav1 with nav2 -> nav1 cancels, releases its lock, and nav2 acquires a fresh lock.
    const nav2 = router.navigateByUrl('/bookings');
    expect(await nav1).toBe(false);
    await waitForConfirmationStart();
    expect(resolvers).toHaveLength(2);
    expect(protection.isConfirmationInProgress()).toBe(true);

    // Late resolution of canceled nav1's Promise must NOT release nav2's lock or navigate.
    resolvers[0](true);
    await Promise.resolve();
    await Promise.resolve();
    expect(protection.isConfirmationInProgress()).toBe(true);
    expect(router.url).toBe('/job-cards');

    // Resolving nav2 completes navigation cleanly and releases lock.
    resolvers[1](true);
    expect(await nav2).toBe(true);
    expect(router.url).toBe('/bookings');
    expect(protection.isConfirmationInProgress()).toBe(false);
  });
});
