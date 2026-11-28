import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { SessionService } from '../../../core/auth/session.service';
import { API_CONFIG } from '../../../core/config/api.config';
import type { AuthSession } from '../../../core/models/auth-session.model';

import {
  WORKSHOP_REALTIME_COALESCE_WINDOW_MS,
  WORKSHOP_REALTIME_MAX_DEFERRED_JOB_IDS,
  type WorkshopHubConnection,
  type WorkshopHubConnectionConfig,
  type WorkshopRealtimeConsumer,
} from '../models/workshop-realtime-contract.model';
import { Day06AuthorizationCoordinatorService } from './day06-authorization-coordinator.service';
import { WorkshopRealtimeCoordinatorService } from './workshop-realtime-coordinator.service';
import {
  WORKSHOP_HUB_CONNECTION_FACTORY,
  WorkshopRealtimeService,
} from './workshop-realtime.service';

const API_BASE = 'https://api.fixora.test';
const BASE_TIME = Date.UTC(2026, 10, 28, 12, 0, 0);
const JOB_1 = '11111111-1111-4111-8111-111111111111';
const JOB_2 = '99999999-9999-4999-8999-999999999999';
const PROP_1 = '22222222-2222-4222-8222-222222222222';
const CR_1 = '33333333-3333-4333-8333-333333333333';

function makeSession(id = 'mgr-001'): AuthSession {
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

class FakeHub implements WorkshopHubConnection {
  readonly handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  readonly startSpy = vi.fn(() => Promise.resolve());
  readonly stopSpy = vi.fn(() => Promise.resolve());
  private closeCb: ((err?: Error) => void) | null = null;
  private reconnectingCb: ((err?: Error) => void) | null = null;
  private reconnectedCb: ((id?: string) => void) | null = null;

  constructor(readonly config: WorkshopHubConnectionConfig) {}

  start() {
    return this.startSpy();
  }
  stop() {
    return this.stopSpy();
  }
  on(name: string, fn: (...args: unknown[]) => void) {
    const s = this.handlers.get(name) ?? new Set();
    s.add(fn);
    this.handlers.set(name, s);
  }
  off(name: string, fn: (...args: unknown[]) => void) {
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

describe('WorkshopRealtimeCoordinatorService (K17)', () => {
  let hubs: FakeHub[];
  let factorySpy: ReturnType<
    typeof vi.fn<(config: WorkshopHubConnectionConfig) => WorkshopHubConnection>
  >;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    hubs = [];
    factorySpy = vi.fn(config => {
      const h = new FakeHub(config);
      hubs.push(h);
      return h;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function setup(provideCoordinator = true) {
    TestBed.configureTestingModule({
      providers: [
        { provide: API_CONFIG, useValue: { baseUrl: API_BASE } },
        { provide: WORKSHOP_HUB_CONNECTION_FACTORY, useValue: factorySpy },
        ...(provideCoordinator
          ? [WorkshopRealtimeService, WorkshopRealtimeCoordinatorService]
          : []),
      ],
    });

    return {
      session: TestBed.inject(SessionService),
      auth: TestBed.inject(Day06AuthorizationCoordinatorService),
      realtime: provideCoordinator
        ? TestBed.inject(WorkshopRealtimeService)
        : null,
      coordinator: provideCoordinator
        ? TestBed.inject(WorkshopRealtimeCoordinatorService)
        : null,
    };
  }

  it('WRC-01 is non-root, preserves ONE connection across child handoff, and stops immediately on workspace exit', async () => {
    setup(false);
    expect(
      TestBed.inject(WorkshopRealtimeCoordinatorService, null, {
        optional: true,
      }),
    ).toBeNull();
    TestBed.resetTestingModule();

    const { session, coordinator } = setup(true);
    session.setSession(makeSession());

    const releaseJobs = coordinator!.attachConsumer({
      kind: 'jobs-list',
      refreshJobsList: vi.fn(),
    });
    await Promise.resolve();

    expect(factorySpy).toHaveBeenCalledTimes(1);
    expect(coordinator!.active()).toBe(true);
    expect(coordinator!.activeConsumerCount).toBe(1);

    // Simulate child-route transition: release JobCards, attach JobCardDetail synchronously
    releaseJobs();
    const releaseDetail = coordinator!.attachConsumer({
      kind: 'job-detail',
      getSelectedJobId: () => JOB_1,
      refreshJobDetail: vi.fn(),
    });
    await Promise.resolve();

    // Still the exact same single hub connection, never stopped or recreated
    expect(factorySpy).toHaveBeenCalledTimes(1);
    expect(hubs[0].stopSpy).not.toHaveBeenCalled();
    expect(coordinator!.active()).toBe(true);
    expect(coordinator!.activeConsumerCount).toBe(1);

    // Workspace exit: release last consumer without replacement -> stops on microtask
    releaseDetail();
    expect(coordinator!.activeConsumerCount).toBe(0);
    await Promise.resolve();

    expect(hubs[0].stopSpy).toHaveBeenCalledTimes(1);
    expect(coordinator!.active()).toBe(false);
  });

  it('WRC-02 coalesces burst events within 400ms and maps each event type strictly to its authoritative targets', async () => {
    const { session, coordinator } = setup(true);
    session.setSession(makeSession());

    const refreshJobsList = vi.fn();
    const refreshDetail = vi.fn();
    const refreshProposals = vi.fn();
    const refreshChangeRequests = vi.fn();
    const refreshFixProofDetail = vi.fn();

    coordinator!.attachConsumer({ kind: 'jobs-list', refreshJobsList });
    coordinator!.attachConsumer({
      kind: 'job-detail',
      getSelectedJobId: () => JOB_1,
      refreshJobDetail: refreshDetail,
    });
    coordinator!.attachConsumer({
      kind: 'fixproof',
      getSelectedJobId: () => JOB_1,
      refreshProposals,
      refreshChangeRequests,
      refreshJobDetail: refreshFixProofDetail,
    });
    await Promise.resolve();

    // Burst: approval.updated + job.updated + queue.updated inside one 400ms window
    hubs[0].emit('approval.updated', {
      id: PROP_1,
      jobCardId: JOB_1,
      status: 'AwaitingCustomer',
    });
    hubs[0].emit('job.updated', { id: JOB_1, number: 'JC-1' });
    hubs[0].emit('queue.updated', [{ id: JOB_1 }]);

    // Before 400ms window completes: 0 refreshes
    vi.advanceTimersByTime(WORKSHOP_REALTIME_COALESCE_WINDOW_MS - 1);
    expect(refreshJobsList).toHaveBeenCalledTimes(0);

    // Window flushes: at most 1 refresh per applicable target
    vi.advanceTimersByTime(1);
    expect(refreshJobsList).toHaveBeenCalledTimes(1);
    expect(refreshDetail).toHaveBeenCalledTimes(1);
    expect(refreshProposals).toHaveBeenCalledTimes(1);
    expect(refreshFixProofDetail).toHaveBeenCalledTimes(1);
    expect(refreshChangeRequests).toHaveBeenCalledTimes(0);

    // changeRequest.updated refreshes CRs + matching detail, NOT jobs list
    hubs[0].emit('changeRequest.updated', {
      id: CR_1,
      jobCardId: JOB_1,
      status: 'PendingManagerReview',
    });
    vi.advanceTimersByTime(WORKSHOP_REALTIME_COALESCE_WINDOW_MS);
    expect(refreshJobsList).toHaveBeenCalledTimes(1);
    expect(refreshChangeRequests).toHaveBeenCalledTimes(1);
    expect(refreshDetail).toHaveBeenCalledTimes(2);
    expect(refreshFixProofDetail).toHaveBeenCalledTimes(2);
  });

  it('WRC-03 ignores events targeting a different jobCardId on JobCardDetail and FixProofOversight', async () => {
    const { session, coordinator } = setup(true);
    session.setSession(makeSession());

    const refreshDetail = vi.fn();
    const refreshFixProofDetail = vi.fn();
    const refreshProposals = vi.fn();

    coordinator!.attachConsumer({
      kind: 'job-detail',
      getSelectedJobId: () => JOB_1,
      refreshJobDetail: refreshDetail,
    });
    coordinator!.attachConsumer({
      kind: 'fixproof',
      getSelectedJobId: () => JOB_1,
      refreshProposals,
      refreshJobDetail: refreshFixProofDetail,
    });
    await Promise.resolve();

    hubs[0].emit('job.updated', { id: JOB_2, number: 'JC-OTHER' });
    vi.advanceTimersByTime(WORKSHOP_REALTIME_COALESCE_WINDOW_MS);

    expect(refreshDetail).not.toHaveBeenCalled();
    expect(refreshFixProofDetail).not.toHaveBeenCalled();
    expect(refreshProposals).not.toHaveBeenCalled();
  });

  it('WRC-04 suppresses automatic FixProof refreshes while a mutation is active or unresolved (mutation safety gate)', async () => {
    const { session, coordinator } = setup(true);
    session.setSession(makeSession());

    let mutationBlocked = true;
    const refreshProposals = vi.fn();
    const refreshChangeRequests = vi.fn();
    const refreshJobDetail = vi.fn();

    const consumer: WorkshopRealtimeConsumer = {
      kind: 'fixproof',
      getSelectedJobId: () => JOB_1,
      isMutationBlocked: () => mutationBlocked,
      refreshProposals,
      refreshChangeRequests,
      refreshJobDetail,
    };

    coordinator!.attachConsumer(consumer);
    await Promise.resolve();

    hubs[0].emit('approval.updated', {
      id: PROP_1,
      jobCardId: JOB_1,
      status: 'AwaitingCustomer',
    });
    hubs[0].triggerReconnecting();
    hubs[0].triggerReconnected();
    vi.advanceTimersByTime(WORKSHOP_REALTIME_COALESCE_WINDOW_MS);

    expect(refreshProposals).not.toHaveBeenCalled();
    expect(refreshChangeRequests).not.toHaveBeenCalled();
    expect(refreshJobDetail).not.toHaveBeenCalled();

    // Once manager finishes/acknowledges mutation -> idle -> normal invalidation resumes
    mutationBlocked = false;
    hubs[0].emit('approval.updated', {
      id: PROP_1,
      jobCardId: JOB_1,
      status: 'AwaitingCustomer',
    });
    vi.advanceTimersByTime(WORKSHOP_REALTIME_COALESCE_WINDOW_MS);
    expect(refreshProposals).toHaveBeenCalledTimes(1);
    expect(refreshJobDetail).toHaveBeenCalledTimes(1);
  });

  it('WRC-05 reconciles on reconnect (not on initial connect), exposes truthful connection views, and gates manual reconnect on auth', async () => {
    const { session, coordinator } = setup(true);
    session.setSession(makeSession());

    const refreshJobsList = vi.fn();
    coordinator!.attachConsumer({ kind: 'jobs-list', refreshJobsList });

    // Connecting state before start() resolves
    expect(coordinator!.connection().state).toBe('connecting');
    await Promise.resolve();

    // Initial connect: NO duplicate automatic refresh
    expect(coordinator!.connection().state).toBe('connected');
    expect(coordinator!.canReconnect()).toBe(false);
    vi.advanceTimersByTime(WORKSHOP_REALTIME_COALESCE_WINDOW_MS);
    expect(refreshJobsList).toHaveBeenCalledTimes(0);

    // Reconnecting -> Reconnected -> 1 reconciliation refresh
    hubs[0].triggerReconnecting();
    expect(coordinator!.connection().state).toBe('reconnecting');
    hubs[0].triggerReconnected();
    expect(coordinator!.connection().state).toBe('connected');
    vi.advanceTimersByTime(WORKSHOP_REALTIME_COALESCE_WINDOW_MS);
    expect(refreshJobsList).toHaveBeenCalledTimes(1);

    // Non-auth close -> unavailable + manual reconnect enabled
    hubs[0].triggerClose(new Error('transport dropped'));
    expect(coordinator!.connection().state).toBe('unavailable');
    expect(coordinator!.canReconnect()).toBe(true);

    coordinator!.reconnect();
    await Promise.resolve();
    expect(factorySpy).toHaveBeenCalledTimes(2);
    expect(coordinator!.connection().state).toBe('connected');

    // Auth close (401) -> unavailable + manual reconnect blocked
    hubs[1].triggerClose(
      Object.assign(new Error('401 Unauthorized'), { statusCode: 401 }),
    );
    expect(coordinator!.connection().state).toBe('unavailable');
    expect(coordinator!.canReconnect()).toBe(false);
  });

  it('WRC-06 drops pending coalesced refreshes on session replacement or logout without cross-session leakage', async () => {
    const { session, coordinator } = setup(true);
    const s1 = makeSession('mgr-1');
    session.setSession(s1);

    const refreshJobsList = vi.fn();
    coordinator!.attachConsumer({ kind: 'jobs-list', refreshJobsList });
    await Promise.resolve();

    // Queue a pending refresh under session 1
    hubs[0].emit('job.updated', { id: JOB_1, number: 'JC-1' });
    vi.advanceTimersByTime(100);

    // Logout before 400ms flush -> pending refresh must be cancelled and hub stopped
    session.clearSession();
    TestBed.flushEffects();
    vi.advanceTimersByTime(WORKSHOP_REALTIME_COALESCE_WINDOW_MS);

    expect(refreshJobsList).not.toHaveBeenCalled();
    expect(hubs[0].stopSpy).toHaveBeenCalledTimes(1);
    expect(coordinator!.connection().state).toBe('disconnected');
    expect(coordinator!.canReconnect()).toBe(false);

    // Fresh replacement session reconnects cleanly (serialized after prior stop settles)
    session.setSession(makeSession('mgr-2'));
    TestBed.flushEffects();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(factorySpy).toHaveBeenCalledTimes(2);
    expect(coordinator!.connection().state).toBe('connected');
  });

  it('WRC-07 (FE-01) preserves suppressed invalidations while mutation-blocked and auto-flushes once via reactive signal return to idle', async () => {
    const { session, coordinator } = setup(true);
    session.setSession(makeSession());

    const blocked = signal(true);
    const refreshProposals = vi.fn();
    const refreshChangeRequests = vi.fn();
    const refreshJobDetail = vi.fn();

    coordinator!.attachConsumer({
      kind: 'fixproof',
      getSelectedJobId: () => JOB_1,
      isMutationBlocked: () => blocked(),
      refreshProposals,
      refreshChangeRequests,
      refreshJobDetail,
    });
    await Promise.resolve();

    // Multiple events arrive during blocked mutation phase
    hubs[0].emit('approval.updated', {
      id: PROP_1,
      jobCardId: JOB_1,
      status: 'AwaitingCustomer',
    });
    hubs[0].emit('changeRequest.updated', {
      id: CR_1,
      jobCardId: JOB_2,
      status: 'PendingManagerReview',
    });
    vi.advanceTimersByTime(WORKSHOP_REALTIME_COALESCE_WINDOW_MS);
    TestBed.flushEffects();

    // While still blocked: ZERO refreshes, ZERO repeated scheduling, deferred retained
    expect(refreshProposals).toHaveBeenCalledTimes(0);
    expect(refreshChangeRequests).toHaveBeenCalledTimes(0);
    expect(refreshJobDetail).toHaveBeenCalledTimes(0);
    expect(coordinator!.deferredConsumerCount).toBe(1);

    vi.advanceTimersByTime(WORKSHOP_REALTIME_COALESCE_WINDOW_MS * 3);
    expect(refreshProposals).toHaveBeenCalledTimes(0);

    // Return to idle -> reactive effect schedules ONE 400ms coalesced flush
    blocked.set(false);
    TestBed.flushEffects();

    vi.advanceTimersByTime(WORKSHOP_REALTIME_COALESCE_WINDOW_MS - 1);
    expect(refreshProposals).toHaveBeenCalledTimes(0);

    vi.advanceTimersByTime(1);
    expect(refreshProposals).toHaveBeenCalledTimes(1);
    expect(refreshChangeRequests).toHaveBeenCalledTimes(1);
    expect(refreshJobDetail).toHaveBeenCalledTimes(1);
    expect(coordinator!.deferredConsumerCount).toBe(0);

    // No duplicate refreshes or infinite loops after flush
    vi.advanceTimersByTime(WORKSHOP_REALTIME_COALESCE_WINDOW_MS * 3);
    expect(refreshProposals).toHaveBeenCalledTimes(1);
    expect(refreshChangeRequests).toHaveBeenCalledTimes(1);
    expect(refreshJobDetail).toHaveBeenCalledTimes(1);
  });

  it('WRC-08 (FE-01) merges deferred invalidations with new events, respects job ID filtering, and bounds deferred ID accumulation', async () => {
    const { session, coordinator } = setup(true);
    session.setSession(makeSession());

    let blocked = true;
    const refreshProposals = vi.fn();
    const refreshChangeRequests = vi.fn();
    const refreshJobDetail = vi.fn();

    coordinator!.attachConsumer({
      kind: 'fixproof',
      getSelectedJobId: () => JOB_1,
      isMutationBlocked: () => blocked,
      refreshProposals,
      refreshChangeRequests,
      refreshJobDetail,
    });
    await Promise.resolve();

    // Unrelated job ID event while blocked -> should NOT refresh JOB_1 detail upon flush
    hubs[0].emit('changeRequest.updated', {
      id: CR_1,
      jobCardId: JOB_2,
      status: 'PendingManagerReview',
    });
    vi.advanceTimersByTime(WORKSHOP_REALTIME_COALESCE_WINDOW_MS);
    expect(refreshChangeRequests).toHaveBeenCalledTimes(0);

    // Unblock via imperative notification + simultaneous approval.updated -> single coalesced flush
    blocked = false;
    coordinator!.notifyMutationStateChanged();
    hubs[0].emit('approval.updated', {
      id: PROP_1,
      jobCardId: JOB_2,
      status: 'PendingManagerReview',
    });
    vi.advanceTimersByTime(WORKSHOP_REALTIME_COALESCE_WINDOW_MS);

    expect(refreshProposals).toHaveBeenCalledTimes(1);
    expect(refreshChangeRequests).toHaveBeenCalledTimes(1);
    expect(refreshJobDetail).toHaveBeenCalledTimes(0); // Neither event targeted JOB_1

    // Bound check: flood > WORKSHOP_REALTIME_MAX_DEFERRED_JOB_IDS distinct unrelated job IDs while blocked
    blocked = true;
    for (let i = 0; i < WORKSHOP_REALTIME_MAX_DEFERRED_JOB_IDS + 5; i++) {
      const hex = i.toString(16).padStart(12, '0');
      hubs[0].emit('job.updated', {
        id: `aaaaaaaa-aaaa-4aaa-8aaa-${hex}`,
        number: `JC-${i}`,
      });
    }
    vi.advanceTimersByTime(WORKSHOP_REALTIME_COALESCE_WINDOW_MS);
    expect(refreshJobDetail).toHaveBeenCalledTimes(0);

    // Collapses safely to jobDetailAll = true so selected JOB_1 refreshes once on unblock
    blocked = false;
    coordinator!.notifyMutationStateChanged();
    vi.advanceTimersByTime(WORKSHOP_REALTIME_COALESCE_WINDOW_MS);
    expect(refreshJobDetail).toHaveBeenCalledTimes(1);
    expect(coordinator!.deferredConsumerCount).toBe(0);
  });

  it('WRC-09 (FE-01) clears deferred invalidations on logout, session replacement, auth revocation, consumer detach, and workspace exit', async () => {
    const { session, auth, coordinator } = setup(true);
    const s1 = makeSession('mgr-1');
    session.setSession(s1);

    const blocked = signal(true);
    const refreshProposals = vi.fn();
    const release = coordinator!.attachConsumer({
      kind: 'fixproof',
      getSelectedJobId: () => JOB_1,
      isMutationBlocked: () => blocked(),
      refreshProposals,
    });
    await Promise.resolve();

    // 1. Capture deferred under s1 -> session replacement must purge s1's deferred batch
    hubs[0].emit('approval.updated', {
      id: PROP_1,
      jobCardId: JOB_1,
      status: 'AwaitingCustomer',
    });
    vi.advanceTimersByTime(WORKSHOP_REALTIME_COALESCE_WINDOW_MS);
    expect(coordinator!.deferredConsumerCount).toBe(1);

    const s2 = makeSession('mgr-2');
    session.setSession(s2);
    TestBed.flushEffects();
    expect(coordinator!.deferredConsumerCount).toBe(0);

    blocked.set(false);
    TestBed.flushEffects();
    vi.advanceTimersByTime(WORKSHOP_REALTIME_COALESCE_WINDOW_MS);
    expect(refreshProposals).toHaveBeenCalledTimes(0);

    // 2. Capture deferred under s2 -> consumer access revocation purges deferred batch
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const revoked = signal(false);
    const refreshProposalsRevoked = vi.fn();
    const releaseRevoked = coordinator!.attachConsumer({
      kind: 'fixproof',
      getSelectedJobId: () => JOB_1,
      isMutationBlocked: () => blocked(),
      isAccessRevoked: () => revoked(),
      refreshProposals: refreshProposalsRevoked,
    });
    blocked.set(true);
    hubs[1].emit('approval.updated', {
      id: PROP_1,
      jobCardId: JOB_1,
      status: 'AwaitingCustomer',
    });
    vi.advanceTimersByTime(WORKSHOP_REALTIME_COALESCE_WINDOW_MS);
    expect(coordinator!.deferredConsumerCount).toBe(2);

    revoked.set(true);
    blocked.set(false);
    TestBed.flushEffects();
    vi.advanceTimersByTime(WORKSHOP_REALTIME_COALESCE_WINDOW_MS);
    expect(refreshProposalsRevoked).toHaveBeenCalledTimes(0);
    releaseRevoked();

    // 3. Consumer detach clears deferred entry and workspace exit clears cleanly
    const s3 = makeSession('mgr-3');
    session.setSession(s3);
    TestBed.flushEffects();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    blocked.set(true);
    hubs[2].emit('approval.updated', {
      id: PROP_1,
      jobCardId: JOB_1,
      status: 'AwaitingCustomer',
    });
    vi.advanceTimersByTime(WORKSHOP_REALTIME_COALESCE_WINDOW_MS);
    expect(coordinator!.deferredConsumerCount).toBe(1);

    release();
    expect(coordinator!.deferredConsumerCount).toBe(0);
    await Promise.resolve();
    expect(coordinator!.active()).toBe(false);
    expect(auth).toBeDefined();
  });
});
