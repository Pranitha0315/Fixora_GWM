import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { SessionService } from '../../../core/auth/session.service';
import type { AuthSession } from '../../../core/models/auth-session.model';

import type {
  FixProofAccessLoss,
  FixProofMutationPhase,
} from './fixproof-mutation-state.service';
import {
  FIXPROOF_BEFORE_UNLOAD_TARGET,
  FixProofNavigationProtectionService,
  type FixProofBeforeUnloadTarget,
  type FixProofMutationProtectionSource,
} from './fixproof-navigation-protection.service';

const BASE_TIME = Date.UTC(2026, 10, 28, 12, 0, 0);

function makeSession(
  id = 'manager-001',
  ttlMs = 300_000,
): AuthSession {
  return {
    accessToken: `token-${id}`,
    expiresAt: BASE_TIME + ttlMs,
    user: {
      id,
      displayName: `Manager ${id}`,
      email: `${id}@fixora.test`,
      roles: ['Manager'],
    },
  };
}

interface FakeBeforeUnloadTarget extends FixProofBeforeUnloadTarget {
  readonly listeners: Set<(event: BeforeUnloadEvent) => void>;
  readonly addCalls: number;
  readonly removeCalls: number;
  dispatchBeforeUnload(): {
    readonly defaultPrevented: boolean;
    readonly returnValue: unknown;
  };
}

function createFakeTarget(): FakeBeforeUnloadTarget {
  const listeners = new Set<(event: BeforeUnloadEvent) => void>();
  let addCalls = 0;
  let removeCalls = 0;

  return {
    listeners,
    get addCalls() {
      return addCalls;
    },
    get removeCalls() {
      return removeCalls;
    },
    addEventListener(type, listener) {
      if (type === 'beforeunload') {
        addCalls += 1;
        listeners.add(listener);
      }
    },
    removeEventListener(type, listener) {
      if (type === 'beforeunload') {
        removeCalls += 1;
        listeners.delete(listener);
      }
    },
    dispatchBeforeUnload() {
      let defaultPrevented = false;
      const fakeEvent = {
        returnValue: undefined as unknown,
        preventDefault: () => {
          defaultPrevented = true;
        },
      } as unknown as BeforeUnloadEvent;

      for (const listener of [...listeners]) {
        listener(fakeEvent);
      }

      return {
        defaultPrevented,
        returnValue: fakeEvent.returnValue,
      };
    },
  };
}

interface MutableSourceState {
  destroyed: boolean;
  phase: FixProofMutationPhase;
  hasUnresolved: boolean;
  detachedPending: boolean;
  accessLoss: FixProofAccessLoss | null;
  activeSequence: number | null;
  boundSession: AuthSession | null;
  detachedSessions: { readonly session: AuthSession; readonly sequence: number }[];
}

function createMutableSource(
  initial: Partial<MutableSourceState> = {},
): {
  readonly state: MutableSourceState;
  readonly source: FixProofMutationProtectionSource;
} {
  const state: MutableSourceState = {
    destroyed: false,
    phase: 'idle',
    hasUnresolved: false,
    detachedPending: false,
    accessLoss: null,
    activeSequence: null,
    boundSession: null,
    detachedSessions: [],
    ...initial,
  };

  const source: FixProofMutationProtectionSource = {
    isDestroyed: () => state.destroyed,
    phase: () => state.phase,
    hasUnresolvedOperation: () => state.hasUnresolved,
    detachedRequestPending: () => state.detachedPending,
    accessLoss: () => state.accessLoss,
    activeSequence: () => state.activeSequence,
    isBoundToSession: session => !state.destroyed && state.boundSession === session,
    detachedSequencesForSession: session =>
      state.destroyed
        ? []
        : state.detachedSessions
            .filter(entry => entry.session === session)
            .map(entry => entry.sequence),
  };

  return { state, source };
}

describe('FixProofNavigationProtectionService (K13-A04-R4)', () => {
  let service: FixProofNavigationProtectionService;
  let session: SessionService;
  let target: FakeBeforeUnloadTarget;
  let activeSession: AuthSession;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);

    target = createFakeTarget();

    TestBed.configureTestingModule({
      providers: [
        { provide: FIXPROOF_BEFORE_UNLOAD_TARGET, useValue: target },
      ],
    });

    session = TestBed.inject(SessionService);
    activeSession = makeSession();
    session.setSession(activeSession);
    service = TestBed.inject(FixProofNavigationProtectionService);
    TestBed.tick();
  });

  afterEach(() => {
    service.ngOnDestroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('R4-NP-01 starts unprotected with zero instances, zero listeners, zero timers and zero storage writes', () => {
    const localSetSpy = vi.spyOn(Storage.prototype, 'setItem');

    expect(service.requiresNavigationProtection()).toBe(false);
    expect(service.hasInFlightMutation()).toBe(false);
    expect(service.hasUnresolvedOperation()).toBe(false);
    expect(service.hasDetachedTransport()).toBe(false);
    expect(service.isBeforeUnloadAttached()).toBe(false);
    expect(service.protectionSnapshot()).toEqual({
      protected: false,
      activeInstanceCount: 0,
      protectedInstanceCount: 0,
      submittingCount: 0,
      uncertainCount: 0,
      reconciliationRequiredCount: 0,
      accessLostUnresolvedCount: 0,
      detachedTransportCount: 0,
      reasons: [],
      allowReauthenticationNavigation: false,
      message: null,
    });
    expect(target.listeners.size).toBe(0);
    expect(target.addCalls).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(localSetSpy).not.toHaveBeenCalled();
  });

  it('R4-NP-02 classifies every protected and unprotected phase according to the protection matrix', () => {
    const { state, source } = createMutableSource({
      boundSession: activeSession,
      activeSequence: 1,
    });
    const unregister = service.registerSource(source);

    const unprotectedPhases: readonly FixProofMutationPhase[] = [
      'idle',
      'validating',
      'refreshing',
      'succeeded',
      'rejected',
    ];

    for (const phase of unprotectedPhases) {
      state.phase = phase;
      state.hasUnresolved = false;
      state.accessLoss = null;
      service.sync();

      expect(service.requiresNavigationProtection()).toBe(false);
      expect(service.isBeforeUnloadAttached()).toBe(false);
      expect(target.listeners.size).toBe(0);
    }

    // access-lost without potentiallyExecuted is unprotected.
    state.phase = 'access-lost';
    state.hasUnresolved = false;
    state.accessLoss = {
      action: 'forward',
      potentiallyExecuted: false,
      mutationConfirmed: true,
    };
    service.sync();
    expect(service.requiresNavigationProtection()).toBe(false);
    expect(target.listeners.size).toBe(0);

    // submitting -> protected immediately and synchronously.
    state.phase = 'submitting';
    state.hasUnresolved = false;
    state.accessLoss = null;
    service.sync();
    expect(service.requiresNavigationProtection()).toBe(true);
    expect(service.hasInFlightMutation()).toBe(true);
    expect(service.protectionSnapshot().reasons).toEqual(['mutation-submitting']);
    expect(service.protectionSnapshot().allowReauthenticationNavigation).toBe(false);
    expect(service.isBeforeUnloadAttached()).toBe(true);
    expect(target.listeners.size).toBe(1);

    // uncertain -> protected, single listener reused (never double-attached).
    state.phase = 'uncertain';
    state.hasUnresolved = true;
    service.sync();
    expect(service.requiresNavigationProtection()).toBe(true);
    expect(service.hasUnresolvedOperation()).toBe(true);
    expect(service.protectionSnapshot().reasons).toEqual(['mutation-uncertain']);
    expect(target.listeners.size).toBe(1);
    expect(target.addCalls).toBe(1);

    // reconciliation-required -> protected.
    state.phase = 'reconciliation-required';
    state.hasUnresolved = true;
    service.sync();
    expect(service.requiresNavigationProtection()).toBe(true);
    expect(service.protectionSnapshot().reasons).toEqual([
      'reconciliation-required',
    ]);
    expect(target.listeners.size).toBe(1);

    // access-lost with potentiallyExecuted -> protected, re-auth allowed.
    state.phase = 'access-lost';
    state.hasUnresolved = true;
    state.accessLoss = {
      action: 'release',
      potentiallyExecuted: true,
      mutationConfirmed: false,
    };
    service.sync();
    expect(service.requiresNavigationProtection()).toBe(true);
    expect(service.protectionSnapshot().reasons).toEqual([
      'access-lost-potentially-executed',
    ]);
    expect(service.protectionSnapshot().allowReauthenticationNavigation).toBe(true);
    expect(target.listeners.size).toBe(1);

    // Return to idle -> listener detached immediately.
    state.phase = 'idle';
    state.hasUnresolved = false;
    state.accessLoss = null;
    service.sync();
    expect(service.requiresNavigationProtection()).toBe(false);
    expect(service.isBeforeUnloadAttached()).toBe(false);
    expect(target.listeners.size).toBe(0);
    expect(target.removeCalls).toBe(1);

    unregister();
  });

  it('R4-NP-03 gives detached transport risk precedence over otherwise unprotected phases', () => {
    const { state, source } = createMutableSource({
      boundSession: activeSession,
      detachedPending: true,
      detachedSessions: [{ session: activeSession, sequence: 7 }],
    });
    const unregister = service.registerSource(source);

    const otherwiseUnprotected: readonly FixProofMutationPhase[] = [
      'idle',
      'validating',
      'refreshing',
      'succeeded',
      'rejected',
    ];

    for (const phase of otherwiseUnprotected) {
      state.phase = phase;
      state.hasUnresolved = false;
      state.accessLoss = null;
      service.sync();

      expect(service.requiresNavigationProtection()).toBe(true);
      expect(service.hasDetachedTransport()).toBe(true);
      expect(service.protectionSnapshot().detachedTransportCount).toBe(1);
      expect(service.protectionSnapshot().reasons).toContain(
        'detached-request-pending',
      );
      expect(target.listeners.size).toBe(1);
    }

    // Also takes precedence over access-lost with potentiallyExecuted === false.
    state.phase = 'access-lost';
    state.accessLoss = {
      action: 'set-price',
      potentiallyExecuted: false,
      mutationConfirmed: false,
    };
    service.sync();
    expect(service.requiresNavigationProtection()).toBe(true);
    expect(service.protectionSnapshot().reasons).toEqual([
      'detached-request-pending',
    ]);

    // Clearing detached transport detaches listener immediately.
    state.detachedPending = false;
    state.detachedSessions = [];
    service.sync();
    expect(service.requiresNavigationProtection()).toBe(false);
    expect(target.listeners.size).toBe(0);

    unregister();
  });

  it('R4-NP-04 beforeunload listener calls preventDefault and sets returnValue only while protected', () => {
    const { state, source } = createMutableSource({
      boundSession: activeSession,
      phase: 'submitting',
      activeSequence: 1,
    });
    const unregister = service.registerSource(source);

    const activeOutcome = target.dispatchBeforeUnload();
    expect(activeOutcome.defaultPrevented).toBe(true);
    expect(activeOutcome.returnValue).toBe('');
    expect(vi.getTimerCount()).toBe(0);

    // If session is cleared before CD tick, firing beforeunload does NOT block and detaches immediately.
    session.clearSession();
    const afterLogout = target.dispatchBeforeUnload();
    expect(afterLogout.defaultPrevented).toBe(false);
    expect(afterLogout.returnValue).toBeUndefined();
    expect(target.listeners.size).toBe(0);
    expect(service.isBeforeUnloadAttached()).toBe(false);

    state.phase = 'idle';
    unregister();
  });

  it('R4-NP-05 aggregates multiple simultaneous instances and prevents premature detachment', () => {
    const first = createMutableSource({
      boundSession: activeSession,
      phase: 'idle',
    });
    const second = createMutableSource({
      boundSession: activeSession,
      phase: 'submitting',
      activeSequence: 2,
    });

    const unregisterFirst = service.registerSource(first.source);
    const unregisterSecond = service.registerSource(second.source);

    expect(service.protectionSnapshot().activeInstanceCount).toBe(2);
    expect(service.protectionSnapshot().protectedInstanceCount).toBe(1);
    expect(target.listeners.size).toBe(1);
    expect(target.addCalls).toBe(1);

    // Destroying the idle first instance must NOT detach protection for the second.
    first.state.destroyed = true;
    unregisterFirst();

    expect(service.protectionSnapshot().activeInstanceCount).toBe(1);
    expect(service.protectionSnapshot().protectedInstanceCount).toBe(1);
    expect(service.requiresNavigationProtection()).toBe(true);
    expect(target.listeners.size).toBe(1);
    expect(target.removeCalls).toBe(0);

    // Settling the second instance detaches the listener.
    second.state.phase = 'succeeded';
    service.sync();
    expect(service.requiresNavigationProtection()).toBe(false);
    expect(target.listeners.size).toBe(0);
    expect(target.removeCalls).toBe(1);

    unregisterSecond();
  });

  it('R4-NP-06 excludes stale session instances and detaches listener on session replacement or expiry', () => {
    const staleSession = makeSession('manager-old');
    const stale = createMutableSource({
      boundSession: staleSession,
      phase: 'submitting',
      activeSequence: 1,
      detachedPending: true,
      detachedSessions: [{ session: staleSession, sequence: 1 }],
    });
    const unregisterStale = service.registerSource(stale.source);

    expect(service.requiresNavigationProtection()).toBe(false);
    expect(target.listeners.size).toBe(0);

    const current = createMutableSource({
      boundSession: activeSession,
      phase: 'uncertain',
      hasUnresolved: true,
      activeSequence: 2,
    });
    const unregisterCurrent = service.registerSource(current.source);
    expect(service.requiresNavigationProtection()).toBe(true);
    expect(target.listeners.size).toBe(1);

    // Replace session with manager-002 -> previous session's source is excluded and listener detaches.
    session.setSession(makeSession('manager-002'));
    TestBed.tick();
    expect(service.requiresNavigationProtection()).toBe(false);
    expect(target.listeners.size).toBe(0);

    // Advance past session expiry for a newly bound source -> unprotected.
    const sessionC = makeSession('manager-003', 30_000);
    session.setSession(sessionC);
    current.state.boundSession = sessionC;
    service.sync();
    expect(service.requiresNavigationProtection()).toBe(true);

    vi.advanceTimersByTime(31_000);
    service.sync();
    expect(service.requiresNavigationProtection()).toBe(false);
    expect(target.listeners.size).toBe(0);

    unregisterStale();
    unregisterCurrent();
  });

  it('R4-NP-07 operates safely when browser beforeunload target is unavailable (SSR)', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: FIXPROOF_BEFORE_UNLOAD_TARGET, useValue: null },
      ],
    });

    const ssrSession = TestBed.inject(SessionService);
    const ssrAuth = makeSession('ssr-manager');
    ssrSession.setSession(ssrAuth);
    const ssrService = TestBed.inject(FixProofNavigationProtectionService);

    const { source } = createMutableSource({
      boundSession: ssrAuth,
      phase: 'submitting',
      activeSequence: 1,
    });
    const unregister = ssrService.registerSource(source);

    expect(ssrService.requiresNavigationProtection()).toBe(true);
    expect(ssrService.isBeforeUnloadAttached()).toBe(false);

    unregister();
    ssrService.ngOnDestroy();
  });

  it('R4-NP-08 detaches beforeunload listener cleanly when the coordinator itself is destroyed', () => {
    const { source } = createMutableSource({
      boundSession: activeSession,
      phase: 'submitting',
      activeSequence: 1,
    });
    service.registerSource(source);

    expect(target.listeners.size).toBe(1);
    service.ngOnDestroy();

    expect(target.listeners.size).toBe(0);
    expect(target.removeCalls).toBe(1);
    expect(service.isBeforeUnloadAttached()).toBe(false);
    expect(service.evaluateProtection().snapshot.protected).toBe(false);
  });

  it('R4-NP-09 preserves safe session-scoped notices, enforces null action on detached notices, isolates sessions and supports explicit dismissal', () => {
    const localSetSpy = vi.spyOn(Storage.prototype, 'setItem');

    // Recording for non-current session is refused.
    const wrongSession = makeSession('other-manager');
    expect(
      service.recordNotice(wrongSession, {
        action: 'forward',
        reason: 'destroyed-while-submitting',
      }),
    ).toBeNull();
    expect(service.currentSessionNotices()).toEqual([]);

    // Record submitting notice.
    const submittingNotice = service.recordNotice(activeSession, {
      action: 'release',
      reason: 'destroyed-while-submitting',
    });
    expect(submittingNotice).not.toBeNull();
    expect(submittingNotice).toMatchObject({
      action: 'release',
      reason: 'destroyed-while-submitting',
      detachedCount: 0,
      potentiallyExecuted: true,
      proofOfOutcome: 'none',
    });
    expect(submittingNotice?.message).toContain('did not cancel or roll back');

    // Detached-only notice NEVER fabricates or retains an action even if caller passes one.
    const detachedNotice = service.recordNotice(activeSession, {
      action: 'forward',
      reason: 'destroyed-with-detached-request',
      detachedCount: 2,
    });
    expect(detachedNotice).toMatchObject({
      action: null,
      reason: 'destroyed-with-detached-request',
      detachedCount: 2,
      potentiallyExecuted: true,
      proofOfOutcome: 'none',
    });
    expect(service.currentSessionNotices()).toHaveLength(2);
    expect(service.hasCurrentSessionNotices()).toBe(true);

    // Dismissing one notice removes only that notice.
    expect(service.dismissNotice(submittingNotice!.id)).toBe(true);
    expect(service.dismissNotice(99999)).toBe(false);
    expect(service.currentSessionNotices()).toHaveLength(1);
    expect(service.currentSessionNotices()[0].id).toBe(detachedNotice!.id);

    // Switching sessions hides previous session's notices completely (zero cross-session leak).
    const secondSession = makeSession('manager-002');
    session.setSession(secondSession);
    expect(service.currentSessionNotices()).toEqual([]);
    expect(service.hasCurrentSessionNotices()).toBe(false);

    // Dismissing all on current session when empty returns false.
    expect(service.dismissAllNotices()).toBe(false);

    // Recording and dismissing all on second session works independently.
    service.recordNotice(secondSession, {
      action: 'revise',
      reason: 'destroyed-while-uncertain',
    });
    expect(service.currentSessionNotices()).toHaveLength(1);
    expect(service.dismissAllNotices()).toBe(true);
    expect(service.currentSessionNotices()).toEqual([]);

    // Logout clears visibility and refuses new recordings.
    session.clearSession();
    expect(service.currentSessionNotices()).toEqual([]);
    expect(
      service.recordNotice(secondSession, {
        action: 'forward',
        reason: 'destroyed-while-uncertain',
      }),
    ).toBeNull();

    expect(localSetSpy).not.toHaveBeenCalled();
  });
});
