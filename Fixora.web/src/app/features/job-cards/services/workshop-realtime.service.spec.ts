import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { RetryContext } from '@microsoft/signalr';
import { vi } from 'vitest';

import { SessionService } from '../../../core/auth/session.service';
import { API_CONFIG } from '../../../core/config/api.config';
import { authInterceptor } from '../../../core/interceptors/auth.interceptor';
import { errorInterceptor } from '../../../core/interceptors/error.interceptor';
import type { AuthRole } from '../../../core/models/auth-role.model';
import type { AuthSession } from '../../../core/models/auth-session.model';

import {
  WORKSHOP_REALTIME_EVENTS,
  WORKSHOP_REALTIME_RECONNECT_DELAYS_MS,
  type WorkshopHubConnection,
  type WorkshopHubConnectionConfig,
  type WorkshopRealtimeConnectedEvent,
  type WorkshopRealtimeInvalidationSignal,
} from '../models/workshop-realtime-contract.model';
import { JobCardStateService } from './job-card-state.service';
import {
  classifyWorkshopRealtimePayload,
  WORKSHOP_HUB_CONNECTION_FACTORY,
  WorkshopRealtimeService,
} from './workshop-realtime.service';

const API_BASE = 'https://api.fixora.test';
const BASE_TIME = Date.UTC(2026, 10, 28, 12, 0, 0);
const JOB_1 = '11111111-1111-4111-8111-111111111111';
const PROP_1 = '22222222-2222-4222-8222-222222222222';
const CR_1 = '33333333-3333-4333-8333-333333333333';

function makeSession(
  id = 'mgr-001',
  roles: readonly AuthRole[] = ['Manager'],
  ttlMs = 300_000,
): AuthSession {
  return {
    accessToken: `token-${id}`,
    expiresAt: BASE_TIME + ttlMs,
    user: {
      id,
      displayName: 'Workshop Manager',
      email: `${id}@fixora.test`,
      roles,
    },
  };
}

class FakeWorkshopHubConnection implements WorkshopHubConnection {
  readonly handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  readonly startSpy = vi.fn<() => Promise<void>>();
  readonly stopSpy = vi.fn<() => Promise<void>>(() => Promise.resolve());
  readonly onSpy = vi.fn();
  readonly offSpy = vi.fn();

  private closeCallback: ((error?: Error) => void) | null = null;
  private reconnectingCallback: ((error?: Error) => void) | null = null;
  private reconnectedCallback: ((connectionId?: string) => void) | null = null;

  constructor(readonly config: WorkshopHubConnectionConfig) {
    this.startSpy.mockImplementation(() => Promise.resolve());
  }

  start(): Promise<void> {
    return this.startSpy();
  }

  stop(): Promise<void> {
    return this.stopSpy();
  }

  on(methodName: string, handler: (...args: unknown[]) => void): void {
    this.onSpy(methodName, handler);
    const set = this.handlers.get(methodName) ?? new Set();
    set.add(handler);
    this.handlers.set(methodName, set);
  }

  off(methodName: string, handler: (...args: unknown[]) => void): void {
    this.offSpy(methodName, handler);
    this.handlers.get(methodName)?.delete(handler);
  }

  onclose(callback: (error?: Error) => void): void {
    this.closeCallback = callback;
  }

  onreconnecting(callback: (error?: Error) => void): void {
    this.reconnectingCallback = callback;
  }

  onreconnected(callback: (connectionId?: string) => void): void {
    this.reconnectedCallback = callback;
  }

  emit(methodName: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(methodName) ?? []) {
      handler(...args);
    }
  }

  triggerReconnecting(error?: Error): void {
    this.reconnectingCallback?.(error);
  }

  triggerReconnected(connectionId = 'conn-2'): void {
    this.reconnectedCallback?.(connectionId);
  }

  triggerClose(error?: Error): void {
    this.closeCallback?.(error);
  }
}

describe('WorkshopRealtimeService (K17)', () => {
  let connections: FakeWorkshopHubConnection[];
  let factorySpy: ReturnType<
    typeof vi.fn<(config: WorkshopHubConnectionConfig) => WorkshopHubConnection>
  >;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    connections = [];
    factorySpy = vi.fn((config: WorkshopHubConnectionConfig) => {
      const conn = new FakeWorkshopHubConnection(config);
      connections.push(conn);
      return conn;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function setup(provideService = true) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([errorInterceptor, authInterceptor]),
        ),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: API_BASE } },
        { provide: WORKSHOP_HUB_CONNECTION_FACTORY, useValue: factorySpy },
        ...(provideService
          ? [WorkshopRealtimeService, JobCardStateService]
          : []),
      ],
    });

    return {
      session: TestBed.inject(SessionService),
      http: TestBed.inject(HttpTestingController),
      jobState: provideService ? TestBed.inject(JobCardStateService) : null,
      service: provideService ? TestBed.inject(WorkshopRealtimeService) : null,
    };
  }

  it('WRS-01 is strictly non-root, connects to /hubs/fixora, registers all 4 exact events once, and emits initial connected$', async () => {
    setup(false);
    expect(
      TestBed.inject(WorkshopRealtimeService, null, { optional: true }),
    ).toBeNull();
    TestBed.resetTestingModule();

    const { session, service } = setup(true);
    session.setSession(makeSession());

    const connected: WorkshopRealtimeConnectedEvent[] = [];
    service!.connected$.subscribe(ev => connected.push(ev));

    await service!.start();

    expect(factorySpy).toHaveBeenCalledTimes(1);
    const conn = connections[0];
    expect(conn.config.url).toBe('https://api.fixora.test/hubs/fixora');
    expect(conn.config.accessTokenFactory()).toBe('token-mgr-001');
    expect(conn.startSpy).toHaveBeenCalledTimes(1);
    expect(conn.onSpy).toHaveBeenCalledTimes(4);
    expect(Array.from(conn.handlers.keys()).sort()).toEqual(
      [
        WORKSHOP_REALTIME_EVENTS.approvalUpdated,
        WORKSHOP_REALTIME_EVENTS.changeRequestUpdated,
        WORKSHOP_REALTIME_EVENTS.jobUpdated,
        WORKSHOP_REALTIME_EVENTS.queueUpdated,
      ].sort(),
    );
    expect(service!.status()).toBe('connected');
    expect(service!.isConnected()).toBe(true);
    expect(service!.failure()).toBeNull();
    expect(connected).toHaveLength(1);
    expect(connected[0].reason).toBe('initial');
  });

  it('WRS-02 prevents duplicate connections, duplicate start calls, and duplicate event handlers', async () => {
    const { session, service } = setup(true);
    session.setSession(makeSession());

    let resolveStart!: () => void;
    factorySpy.mockImplementationOnce(config => {
      const conn = new FakeWorkshopHubConnection(config);
      conn.startSpy.mockImplementation(
        () =>
          new Promise<void>(resolve => {
            resolveStart = resolve;
          }),
      );
      connections.push(conn);
      return conn;
    });

    const p1 = service!.start();
    const p2 = service!.start();
    expect(service!.status()).toBe('connecting');
    expect(factorySpy).toHaveBeenCalledTimes(1);
    expect(connections[0].startSpy).toHaveBeenCalledTimes(1);

    resolveStart();
    await Promise.all([p1, p2]);
    await service!.start();

    expect(factorySpy).toHaveBeenCalledTimes(1);
    expect(connections[0].startSpy).toHaveBeenCalledTimes(1);
    expect(connections[0].onSpy).toHaveBeenCalledTimes(4);
  });

  it('WRS-03 emits invalidation-only signals for all 4 verified event types without exposing raw DTO fields', async () => {
    const { session, service } = setup(true);
    session.setSession(makeSession());
    await service!.start();

    const received: WorkshopRealtimeInvalidationSignal[] = [];
    service!.invalidated$.subscribe(sig => received.push(sig));

    const conn = connections[0];
    conn.emit(WORKSHOP_REALTIME_EVENTS.queueUpdated, [
      { id: JOB_1, number: 'JC-1', managerNote: 'SENSITIVE_NOTE' },
    ]);
    conn.emit(WORKSHOP_REALTIME_EVENTS.queueUpdated, {
      jobId: JOB_1,
      position: 2,
      etaAt: '2026-11-28T16:00:00Z',
      status: 'InProgress',
      indicative: true,
    });
    conn.emit(WORKSHOP_REALTIME_EVENTS.jobUpdated, {
      id: JOB_1,
      number: 'JC-1',
      customerName: 'Secret Name',
    });
    conn.emit(WORKSHOP_REALTIME_EVENTS.jobUpdated, {
      jobId: JOB_1,
      status: 'Closed',
    });
    conn.emit(WORKSHOP_REALTIME_EVENTS.approvalUpdated, {
      id: PROP_1,
      jobCardId: JOB_1,
      status: 'PendingManagerReview',
      total: 4200,
    });
    conn.emit(WORKSHOP_REALTIME_EVENTS.changeRequestUpdated, {
      id: CR_1,
      jobCardId: JOB_1,
      status: 'PendingManagerReview',
      details: 'Private customer details',
    });

    expect(received).toHaveLength(6);
    expect(received[0]).toMatchObject({
      event: 'queue.updated',
      shape: 'job-board',
      jobCardId: null,
      entityId: null,
    });
    expect(received[1]).toMatchObject({
      event: 'queue.updated',
      shape: 'queue-estimate',
      jobCardId: JOB_1,
      entityId: null,
    });
    expect(received[2]).toMatchObject({
      event: 'job.updated',
      shape: 'job-summary',
      jobCardId: JOB_1,
      entityId: null,
    });
    expect(received[3]).toMatchObject({
      event: 'job.updated',
      shape: 'job-status',
      jobCardId: JOB_1,
      entityId: null,
    });
    expect(received[4]).toMatchObject({
      event: 'approval.updated',
      shape: 'proposal',
      jobCardId: JOB_1,
      entityId: PROP_1,
    });
    expect(received[5]).toMatchObject({
      event: 'changeRequest.updated',
      shape: 'change-request',
      jobCardId: JOB_1,
      entityId: CR_1,
    });

    // Verify zero raw payload properties leak onto emitted signals
    const serialized = JSON.stringify(received);
    expect(serialized).not.toContain('SENSITIVE_NOTE');
    expect(serialized).not.toContain('Secret Name');
    expect(serialized).not.toContain('Private customer details');
  });

  it('WRS-04 rejects malformed or unrecognized payloads safely across all 4 events', async () => {
    const { session, service } = setup(true);
    session.setSession(makeSession());
    await service!.start();

    const received: WorkshopRealtimeInvalidationSignal[] = [];
    service!.invalidated$.subscribe(sig => received.push(sig));

    const conn = connections[0];
    conn.emit('queue.updated', null);
    conn.emit('queue.updated', ['not-an-object']);
    conn.emit('queue.updated', { jobId: 'bad-guid', position: 1, status: 'Open' });
    // K18-B / RT-01: old/wrong queuePosition field MUST be rejected (backend sends `position`)
    conn.emit('queue.updated', { jobId: JOB_1, queuePosition: 1, status: 'Open' });
    conn.emit('queue.updated', { jobId: JOB_1, position: -1, status: 'Open' });
    conn.emit('queue.updated', { jobId: JOB_1, position: 1.5, status: 'Open' });
    conn.emit('queue.updated', { jobId: JOB_1, position: 1, status: '   ' });
    conn.emit('queue.updated', { jobId: '00000000-0000-0000-0000-000000000000', position: 1, status: 'Open' });
    conn.emit('job.updated', { id: 'not-a-uuid', number: 'JC-1' });
    conn.emit('job.updated', { id: JOB_1, number: '   ' });
    conn.emit('job.updated', { jobId: JOB_1 }); // missing status
    conn.emit('job.updated', { jobId: JOB_1, status: '' });
    conn.emit('approval.updated', { id: PROP_1, status: 'PendingManagerReview' }); // missing jobCardId
    conn.emit('approval.updated', { id: 'bad', jobCardId: JOB_1, status: 'PendingManagerReview' });
    conn.emit('approval.updated', { id: PROP_1, jobCardId: JOB_1, status: '' });
    conn.emit('changeRequest.updated', { id: CR_1, jobCardId: 'bad', status: 'PendingManagerReview' });
    conn.emit('changeRequest.updated', { id: CR_1, jobCardId: JOB_1, status: '  ' });
    conn.emit('changeRequest.updated', undefined);

    expect(received).toHaveLength(0);
    expect(
      classifyWorkshopRealtimePayload('approval.updated', { id: PROP_1 }),
    ).toBeNull();
    expect(
      classifyWorkshopRealtimePayload('queue.updated', {
        jobId: JOB_1,
        queuePosition: 2,
        status: 'Open',
      }),
    ).toBeNull();
    expect(
      classifyWorkshopRealtimePayload(
        'booking.updated' as unknown as typeof WORKSHOP_REALTIME_EVENTS.jobUpdated,
        { id: JOB_1, number: 'JC-1' },
      ),
    ).toBeNull();
  });

  it('WRS-05 enforces approved Day05 reconnect delays and transitions through reconnecting, reconnected, and reconnect-exhausted', async () => {
    const { session, service } = setup(true);
    session.setSession(makeSession());
    await service!.start();

    const conn = connections[0];
    const connected: WorkshopRealtimeConnectedEvent[] = [];
    service!.connected$.subscribe(ev => connected.push(ev));

    // Verify exact approved backoff schedule
    for (let i = 0; i < WORKSHOP_REALTIME_RECONNECT_DELAYS_MS.length; i++) {
      const ctx = {
        previousRetryCount: i,
        elapsedMilliseconds: 0,
        retryReason: new Error('drop'),
      } as RetryContext;
      expect(conn.config.reconnectPolicy.nextRetryDelayInMilliseconds(ctx)).toBe(
        WORKSHOP_REALTIME_RECONNECT_DELAYS_MS[i],
      );
    }
    expect(
      conn.config.reconnectPolicy.nextRetryDelayInMilliseconds({
        previousRetryCount: WORKSHOP_REALTIME_RECONNECT_DELAYS_MS.length,
        elapsedMilliseconds: 50_000,
        retryReason: new Error('drop'),
      } as RetryContext),
    ).toBeNull();

    // Reconnecting -> Reconnected
    conn.triggerReconnecting(new Error('network drop'));
    expect(service!.status()).toBe('reconnecting');

    conn.triggerReconnected('conn-2');
    expect(service!.status()).toBe('connected');
    expect(service!.failure()).toBeNull();
    expect(connected).toHaveLength(1);
    expect(connected[0].reason).toBe('reconnected');

    // Reconnecting -> exhausted close
    conn.triggerReconnecting(new Error('network drop 2'));
    conn.triggerClose(new Error('gave up'));
    expect(service!.status()).toBe('failed');
    expect(service!.failure()).toBe('reconnect-exhausted');
    expect(conn.offSpy).toHaveBeenCalledTimes(4);
  });

  it('WRS-06 classifies hub 401/403 errors as auth-failed and refuses unauthenticated or non-staff sessions', async () => {
    const { session, service } = setup(true);

    // Unauthenticated
    await service!.start();
    expect(factorySpy).not.toHaveBeenCalled();
    expect(service!.status()).toBe('disconnected');
    expect(service!.failure()).toBe('session-unavailable');

    // Non-staff role
    session.setSession(makeSession('admin-1', ['PlatformAdmin']));
    await service!.start();
    expect(factorySpy).not.toHaveBeenCalled();
    expect(service!.failure()).toBe('session-unavailable');

    // Hub 401 negotiation rejection
    session.setSession(makeSession('mgr-1', ['Manager']));
    factorySpy.mockImplementationOnce(config => {
      const conn = new FakeWorkshopHubConnection(config);
      conn.startSpy.mockRejectedValue(
        Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
      );
      connections.push(conn);
      return conn;
    });

    await service!.start();
    expect(service!.status()).toBe('failed');
    expect(service!.failure()).toBe('auth-failed');
  });

  it('WRS-07 tears down immediately on logout, expiry, session replacement, and Day06 401 revocation, rejecting stale events', async () => {
    const { session, http, jobState, service } = setup(true);
    const s1 = makeSession('mgr-1', ['Manager'], 10_000);
    session.setSession(s1);
    await service!.start();
    const conn1 = connections[0];

    const received: WorkshopRealtimeInvalidationSignal[] = [];
    service!.invalidated$.subscribe(sig => received.push(sig));

    // Real provenance-verified Day06 HTTP 401 on JobCards immediately revokes hub access
    jobState!.refreshList();
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs?activeOnly=true`)
      .flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    expect(service!.status()).toBe('disconnected');
    expect(service!.failure()).toBe('access-revoked');
    expect(conn1.stopSpy).toHaveBeenCalledTimes(1);
    expect(conn1.offSpy).toHaveBeenCalledTimes(4);
    expect(conn1.config.accessTokenFactory()).toBe('');
    expect(
      conn1.config.reconnectPolicy.nextRetryDelayInMilliseconds({
        previousRetryCount: 0,
        elapsedMilliseconds: 0,
        retryReason: new Error('drop'),
      } as RetryContext),
    ).toBeNull();

    // Stale callback emitted from old connection is completely dropped
    conn1.emit('job.updated', { id: JOB_1, number: 'JC-1' });
    expect(received).toHaveLength(0);

    // Refuses restarting under revoked session
    await service!.start();
    expect(factorySpy).toHaveBeenCalledTimes(1);
    expect(service!.failure()).toBe('access-revoked');

    // Fresh replacement session succeeds cleanly
    const s2 = makeSession('mgr-2', ['Owner'], 5_000);
    session.setSession(s2);
    await service!.start();
    expect(factorySpy).toHaveBeenCalledTimes(2);
    expect(service!.status()).toBe('connected');

    // Local session expiry timer tears down automatically without polling
    vi.advanceTimersByTime(5_001);
    expect(service!.status()).toBe('disconnected');
    expect(service!.failure()).toBe('session-ended');
    expect(connections[1].stopSpy).toHaveBeenCalledTimes(1);
    http.verify();
  });

  it('WRS-08 cleans up handlers, stops connection, and completes observables on ngOnDestroy', async () => {
    const { session, service } = setup(true);
    session.setSession(makeSession());
    await service!.start();

    let completed = false;
    service!.invalidated$.subscribe({ complete: () => (completed = true) });

    service!.ngOnDestroy();
    expect(connections[0].offSpy).toHaveBeenCalledTimes(4);
    expect(connections[0].stopSpy).toHaveBeenCalledTimes(1);
    expect(completed).toBe(true);
    expect(service!.status()).toBe('disconnected');

    // Subsequent start after destroy is a no-op
    await service!.start();
    expect(factorySpy).toHaveBeenCalledTimes(1);
  });

  it('WRS-09 (FE-02) serializes rapid stop-then-start so a new connection never overlaps an in-flight async stop', async () => {
    const { session, service } = setup(true);
    session.setSession(makeSession());

    let resolveStop1!: () => void;
    factorySpy.mockImplementationOnce(config => {
      const conn = new FakeWorkshopHubConnection(config);
      conn.stopSpy.mockImplementation(
        () =>
          new Promise<void>(resolve => {
            resolveStop1 = resolve;
          }),
      );
      connections.push(conn);
      return conn;
    });

    await service!.start();
    expect(factorySpy).toHaveBeenCalledTimes(1);
    expect(service!.status()).toBe('connected');

    // Leave workspace -> stop() begins asynchronously
    service!.stop();
    expect(connections[0].stopSpy).toHaveBeenCalledTimes(1);
    expect(service!.status()).toBe('disconnected');

    // Rapid re-entry before conn1.stop() settles + overlapping duplicate start()
    const restartA = service!.start();
    const restartB = service!.start();
    expect(service!.status()).toBe('connecting');
    // Connection 2 MUST NOT be created while connection 1 is still stopping!
    expect(factorySpy).toHaveBeenCalledTimes(1);

    // Finish conn1.stop() -> now conn2 is constructed and started exactly once
    resolveStop1();
    await Promise.all([restartA, restartB]);

    expect(factorySpy).toHaveBeenCalledTimes(2);
    expect(connections[1].startSpy).toHaveBeenCalledTimes(1);
    expect(connections[1].onSpy).toHaveBeenCalledTimes(4);
    expect(service!.status()).toBe('connected');
  });

  it('WRS-10 (FE-02) handles async stop rejection safely without blocking subsequent start or leaking unhandled rejections', async () => {
    const { session, service } = setup(true);
    session.setSession(makeSession());

    let rejectStop1!: (err: Error) => void;
    factorySpy.mockImplementationOnce(config => {
      const conn = new FakeWorkshopHubConnection(config);
      conn.stopSpy.mockImplementation(
        () =>
          new Promise<void>((_, reject) => {
            rejectStop1 = reject;
          }),
      );
      connections.push(conn);
      return conn;
    });

    await service!.start();
    service!.stop();

    const restartPromise = service!.start();
    expect(factorySpy).toHaveBeenCalledTimes(1);

    rejectStop1(new Error('socket already closed'));
    await restartPromise;

    expect(factorySpy).toHaveBeenCalledTimes(2);
    expect(connections[1].startSpy).toHaveBeenCalledTimes(1);
    expect(service!.status()).toBe('connected');
  });

  it('WRS-11 (FE-02) cancels a queued post-stop start on logout, session replacement, or Day06 revocation without blocking re-authentication', async () => {
    const { session, http, jobState, service } = setup(true);
    const s1 = makeSession('mgr-1');
    session.setSession(s1);

    let resolveStop1!: () => void;
    factorySpy.mockImplementationOnce(config => {
      const conn = new FakeWorkshopHubConnection(config);
      conn.stopSpy.mockImplementation(
        () =>
          new Promise<void>(resolve => {
            resolveStop1 = resolve;
          }),
      );
      connections.push(conn);
      return conn;
    });

    await service!.start();
    service!.stop();

    // Queue start while stop1 is still pending
    const queuedStart = service!.start();
    expect(service!.status()).toBe('connecting');
    expect(factorySpy).toHaveBeenCalledTimes(1);

    // Logout occurs before stop1 settles -> immediate disconnected state, never constructs conn2
    session.clearSession();
    TestBed.flushEffects();
    expect(service!.status()).toBe('disconnected');
    expect(service!.failure()).toBe('session-ended');

    resolveStop1();
    await queuedStart;
    expect(factorySpy).toHaveBeenCalledTimes(1);

    // Legitimate re-authentication with fresh Owner session succeeds cleanly
    const s2 = makeSession('owner-2', ['Owner']);
    session.setSession(s2);

    let resolveStop2!: () => void;
    factorySpy.mockImplementationOnce(config => {
      const conn = new FakeWorkshopHubConnection(config);
      conn.stopSpy.mockImplementation(
        () =>
          new Promise<void>(resolve => {
            resolveStop2 = resolve;
          }),
      );
      connections.push(conn);
      return conn;
    });
    await service!.start();
    expect(factorySpy).toHaveBeenCalledTimes(2);
    expect(service!.status()).toBe('connected');

    // Now test Day06 401 revocation while a start is queued behind stop2
    service!.stop();
    const queuedAfterRevoke = service!.start();
    expect(service!.status()).toBe('connecting');

    jobState!.refreshList();
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs?activeOnly=true`)
      .flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    expect(service!.status()).toBe('disconnected');
    expect(service!.failure()).toBe('access-revoked');

    resolveStop2();
    await queuedAfterRevoke;
    expect(factorySpy).toHaveBeenCalledTimes(2);
    http.verify();
  });

  it('WRS-12 (ENV-01) constructs trusted HTTPS /hubs/fixora URLs and rejects insecure HTTP or null API configuration without silent downgrade', async () => {
    // 1. HTTPS development base URL resolves cleanly
    TestBed.configureTestingModule({
      providers: [
        { provide: API_CONFIG, useValue: { baseUrl: 'https://localhost:7080' } },
        { provide: WORKSHOP_HUB_CONNECTION_FACTORY, useValue: factorySpy },
        WorkshopRealtimeService,
      ],
    });
    const devSession = TestBed.inject(SessionService);
    const devService = TestBed.inject(WorkshopRealtimeService);
    devSession.setSession(makeSession('dev-mgr', ['Manager']));
    await devService.start();
    expect(factorySpy).toHaveBeenCalledTimes(1);
    expect(connections[0].config.url).toBe('https://localhost:7080/hubs/fixora');
    devService.ngOnDestroy();
    TestBed.resetTestingModule();

    // 2. Insecure HTTP base URL is strictly rejected (zero silent HTTPS downgrade)
    TestBed.configureTestingModule({
      providers: [
        { provide: API_CONFIG, useValue: { baseUrl: 'http://localhost:5080' } },
        { provide: WORKSHOP_HUB_CONNECTION_FACTORY, useValue: factorySpy },
        WorkshopRealtimeService,
      ],
    });
    const httpSession = TestBed.inject(SessionService);
    const httpService = TestBed.inject(WorkshopRealtimeService);
    httpSession.setSession(makeSession('http-mgr', ['Manager']));
    await httpService.start();
    expect(factorySpy).toHaveBeenCalledTimes(1);
    expect(httpService.status()).toBe('failed');
    expect(httpService.failure()).toBe('not-configured');
    httpService.ngOnDestroy();
    TestBed.resetTestingModule();

    // 3. Null production default base URL fails safely without connecting
    TestBed.configureTestingModule({
      providers: [
        { provide: API_CONFIG, useValue: { baseUrl: null } },
        { provide: WORKSHOP_HUB_CONNECTION_FACTORY, useValue: factorySpy },
        WorkshopRealtimeService,
      ],
    });
    const nullSession = TestBed.inject(SessionService);
    const nullService = TestBed.inject(WorkshopRealtimeService);
    nullSession.setSession(makeSession('null-mgr', ['Owner']));
    await nullService.start();
    expect(factorySpy).toHaveBeenCalledTimes(1);
    expect(nullService.status()).toBe('failed');
    expect(nullService.failure()).toBe('not-configured');
    nullService.ngOnDestroy();
  });

  it('WRS-13 (FE-04) preserves Manager/Owner authorization boundary and refuses PlatformAdmin or empty-role sessions', async () => {
    const { session, service } = setup(true);

    session.setSession(makeSession('empty-1', []));
    await service!.start();
    expect(factorySpy).toHaveBeenCalledTimes(0);
    expect(service!.failure()).toBe('session-unavailable');

    session.setSession(makeSession('admin-1', ['PlatformAdmin']));
    await service!.start();
    expect(factorySpy).toHaveBeenCalledTimes(0);
    expect(service!.failure()).toBe('session-unavailable');

    session.setSession(makeSession('owner-1', ['Owner']));
    await service!.start();
    expect(factorySpy).toHaveBeenCalledTimes(1);
    expect(service!.status()).toBe('connected');
  });
});
