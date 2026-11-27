import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SessionService } from '../../../core/auth/session.service';
import { API_CONFIG } from '../../../core/config/api.config';
import type { AuthSession } from '../../../core/models/auth-session.model';

import {
  ADAPTIVE_QUEUE_RECONCILE_WINDOW_MS,
  AdaptiveQueueRealtimeCoordinator,
} from './adaptive-queue-realtime-coordinator.service';

import {
  ADAPTIVE_QUEUE_HUB_CONNECTION_FACTORY,
  AdaptiveQueueRealtimeService,
} from './adaptive-queue-realtime.service';
import type {
  AdaptiveQueueHubConnection,
  AdaptiveQueueHubConnectionConfig,
} from './adaptive-queue-realtime.service';

import { AdaptiveQueueStateService } from './adaptive-queue-state.service';

const START = new Date('2026-11-27T08:00:00Z');
const WINDOW = ADAPTIVE_QUEUE_RECONCILE_WINDOW_MS;
const JOB_1 = '11111111-1111-4111-8111-111111111111';

type Handler = (...args: unknown[]) => void;

class FakeHub implements AdaptiveQueueHubConnection {
  readonly listeners = new Map<string, Set<Handler>>();
  readonly closeCallbacks: ((error?: Error) => void)[] = [];
  readonly reconnectingCallbacks: ((error?: Error) => void)[] = [];
  readonly reconnectedCallbacks: ((id?: string) => void)[] = [];

  resolveStart: () => void = () => undefined;
  rejectStart: (error: unknown) => void = () => undefined;

  readonly start = vi.fn(
    () =>
      new Promise<void>((resolve, reject) => {
        this.resolveStart = resolve;
        this.rejectStart = reject;
      }),
  );

  readonly stop = vi.fn(() => Promise.resolve());

  readonly on = vi.fn((name: string, handler: Handler) => {
    const set = this.listeners.get(name) ?? new Set<Handler>();
    set.add(handler);
    this.listeners.set(name, set);
  });

  readonly off = vi.fn((name: string, handler: Handler) => {
    this.listeners.get(name)?.delete(handler);
  });

  readonly onclose = vi.fn((callback: (error?: Error) => void) => {
    this.closeCallbacks.push(callback);
  });

  readonly onreconnecting = vi.fn((callback: (error?: Error) => void) => {
    this.reconnectingCallbacks.push(callback);
  });

  readonly onreconnected = vi.fn((callback: (id?: string) => void) => {
    this.reconnectedCallbacks.push(callback);
  });

  emit(name: string, ...args: unknown[]): void {
    for (const handler of [...(this.listeners.get(name) ?? [])]) {
      handler(...args);
    }
  }

  close(): void {
    this.closeCallbacks.forEach(callback => callback());
  }

  reconnecting(): void {
    this.reconnectingCallbacks.forEach(callback => callback());
  }

  reconnected(): void {
    this.reconnectedCallbacks.forEach(callback => callback('id'));
  }
}

function makeSession(userId = 'manager-001', lifetimeMs = 3_600_000): AuthSession {
  return {
    accessToken: `token-${userId}`,
    expiresAt: Date.now() + lifetimeMs,
    user: {
      id: userId,
      displayName: 'Test Manager',
      email: 'manager@example.test',
      roles: ['Manager'],
    },
  };
}

/** Minimal stand-in: the coordinator only uses these members. */
function makeFakeState() {
  return {
    authFailure: signal<'unauthorized' | 'forbidden' | null>(null),
    viewState: signal<'idle' | 'loading' | 'ready' | 'error'>('ready'),
    refresh: vi.fn(),
    invalidate: vi.fn(),
  };
}

describe('AdaptiveQueueRealtimeCoordinator', () => {
  let coordinator: AdaptiveQueueRealtimeCoordinator;
  let realtime: AdaptiveQueueRealtimeService;
  let session: SessionService;
  let fakeState: ReturnType<typeof makeFakeState>;
  let hubs: FakeHub[];
  let factory: ReturnType<typeof vi.fn>;

  function setup(baseUrl: string | null = 'https://api.fixora.example'): void {
    hubs = [];
    fakeState = makeFakeState();
    factory = vi.fn((config: AdaptiveQueueHubConnectionConfig) => {
      void config;
      const hub = new FakeHub();
      hubs.push(hub);
      return hub;
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AdaptiveQueueRealtimeService,
        AdaptiveQueueRealtimeCoordinator,
        { provide: AdaptiveQueueStateService, useValue: fakeState },
        { provide: API_CONFIG, useValue: { baseUrl } },
        { provide: ADAPTIVE_QUEUE_HUB_CONNECTION_FACTORY, useValue: factory },
      ],
    });

    session = TestBed.inject(SessionService);
    session.setSession(makeSession());
    realtime = TestBed.inject(AdaptiveQueueRealtimeService);
    coordinator = TestBed.inject(AdaptiveQueueRealtimeCoordinator);
    TestBed.tick();
  }

  function hub(): FakeHub {
    return hubs[hubs.length - 1];
  }

  async function settle(): Promise<void> {
    for (let i = 0; i < 6; i += 1) {
      await Promise.resolve();
    }
  }

  async function connect(): Promise<FakeHub> {
    coordinator.activate();
    const connection = hub();

    connection.resolveStart();
    await settle();

    return connection;
  }

  function signIn(userId = 'manager-001'): void {
    session.setSession(makeSession(userId));
    TestBed.tick();
  }

  function advance(ms: number): void {
    vi.advanceTimersByTime(ms);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    setup();
  });

  afterEach(() => {
    coordinator.ngOnDestroy();
    realtime.ngOnDestroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('lifecycle', () => {
    it('RC-01 is not provided in root', () => {
      TestBed.resetTestingModule();

      expect(() =>
        TestBed.inject(AdaptiveQueueRealtimeCoordinator),
      ).toThrow();
    });

    it('RC-02 does not connect before activation', () => {
      expect(factory).not.toHaveBeenCalled();
      expect(realtime.status()).toBe('disconnected');
      expect(vi.getTimerCount()).toBe(0);
    });

    it('RC-03 starts the connection once on activation', () => {
      coordinator.activate();
      coordinator.activate();

      expect(factory).toHaveBeenCalledTimes(1);
      expect(realtime.status()).toBe('connecting');
    });

    it('RC-04 subscribes before the connection starts', async () => {
      coordinator.activate();
      hub().resolveStart();
      await settle();

      // The initial connection event is observed, not missed.
      advance(WINDOW);

      expect(fakeState.refresh).toHaveBeenCalledTimes(1);
    });

    it('RC-05 does not request the board itself on activation', () => {
      coordinator.activate();

      expect(fakeState.refresh).not.toHaveBeenCalled();
      expect(fakeState.invalidate).not.toHaveBeenCalled();
    });

    it('RC-06 never connects without a valid session', () => {
      session.clearSession();
      TestBed.tick();

      coordinator.activate();

      expect(factory).not.toHaveBeenCalled();
      expect(realtime.status()).not.toBe('connecting');
    });

    it('RC-07 never connects while an authorization failure is active', () => {
      fakeState.authFailure.set('unauthorized');

      coordinator.activate();

      expect(factory).not.toHaveBeenCalled();
    });

    it('RC-08 reports connection failure without touching HTTP loading', async () => {
      coordinator.activate();
      hub().rejectStart(new Error('boom'));
      await settle();

      expect(realtime.status()).toBe('failed');
      expect(fakeState.refresh).not.toHaveBeenCalled();
      expect(fakeState.invalidate).not.toHaveBeenCalled();
    });

    it('RC-09 stops the connection and every timer on destroy', async () => {
      const connection = await connect();
      connection.emit('queue.updated', []);
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      coordinator.ngOnDestroy();

      expect(realtime.status()).toBe('disconnected');
      expect(connection.stop).toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('RC-10 ignores activation and events after destroy', async () => {
      const connection = await connect();
      coordinator.ngOnDestroy();

      coordinator.activate();
      connection.emit('queue.updated', []);
      advance(10 * WINDOW);

      expect(factory).toHaveBeenCalledTimes(1);
      expect(fakeState.refresh).not.toHaveBeenCalled();
    });

    it('RC-11 does not leave background timers after destroy', async () => {
      await connect();
      advance(WINDOW);
      coordinator.ngOnDestroy();
      realtime.ngOnDestroy();

      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('reconciliation', () => {
    it('RC-12 reconciles over HTTP after the initial connection', async () => {
      await connect();

      expect(fakeState.refresh).not.toHaveBeenCalled();

      advance(WINDOW - 1);
      expect(fakeState.refresh).not.toHaveBeenCalled();

      advance(1);
      expect(fakeState.refresh).toHaveBeenCalledTimes(1);
    });

    it('RC-13 does not flag the board stale on the initial connection', async () => {
      await connect();
      advance(WINDOW);

      expect(fakeState.invalidate).not.toHaveBeenCalled();
    });

    it('RC-14 flags the board and reconciles after every reconnect', async () => {
      const connection = await connect();
      advance(WINDOW);
      fakeState.refresh.mockClear();

      connection.reconnecting();
      connection.reconnected();

      expect(fakeState.invalidate).toHaveBeenCalledTimes(1);
      advance(WINDOW);
      expect(fakeState.refresh).toHaveBeenCalledTimes(1);

      connection.reconnecting();
      connection.reconnected();
      advance(WINDOW);

      expect(fakeState.invalidate).toHaveBeenCalledTimes(2);
      expect(fakeState.refresh).toHaveBeenCalledTimes(2);
    });

    it('RC-15 invalidates immediately and reloads after the window', async () => {
      const connection = await connect();
      advance(WINDOW);
      fakeState.refresh.mockClear();

      connection.emit('job.updated', { jobId: JOB_1, status: 'Completed' });

      expect(fakeState.invalidate).toHaveBeenCalledTimes(1);
      expect(fakeState.refresh).not.toHaveBeenCalled();

      advance(WINDOW);
      expect(fakeState.refresh).toHaveBeenCalledTimes(1);
    });

    it('RC-16 coalesces a burst into one reload', async () => {
      const connection = await connect();
      advance(WINDOW);
      fakeState.refresh.mockClear();

      for (let i = 0; i < 50; i += 1) {
        connection.emit('queue.updated', []);
        advance(5);
      }
      advance(WINDOW);

      expect(fakeState.refresh).toHaveBeenCalledTimes(1);
    });

    it('RC-17 does not extend the window for later events', async () => {
      const connection = await connect();
      advance(WINDOW);
      fakeState.refresh.mockClear();

      connection.emit('queue.updated', []);
      advance(WINDOW - 50);
      connection.emit('queue.updated', []);
      advance(50);

      expect(fakeState.refresh).toHaveBeenCalledTimes(1);
    });

    it('RC-18 reconciles repeatedly during sustained events, never starving', async () => {
      const connection = await connect();
      advance(WINDOW);
      fakeState.refresh.mockClear();

      // An event every 100 ms for 4 s.
      for (let i = 0; i < 40; i += 1) {
        connection.emit('queue.updated', []);
        advance(100);
      }

      expect(fakeState.refresh.mock.calls.length).toBeGreaterThanOrEqual(9);
      expect(fakeState.refresh.mock.calls.length).toBeLessThanOrEqual(10);
    });

    it('RC-19 opens a new window for an event after a reload', async () => {
      const connection = await connect();
      advance(WINDOW);
      fakeState.refresh.mockClear();

      connection.emit('queue.updated', []);
      advance(WINDOW);
      connection.emit('queue.updated', []);
      advance(WINDOW);

      expect(fakeState.refresh).toHaveBeenCalledTimes(2);
    });

    it('RC-20 keeps the window between 300 and 500 ms', () => {
      expect(WINDOW).toBeGreaterThanOrEqual(300);
      expect(WINDOW).toBeLessThanOrEqual(500);
    });

    it('RC-21 merges an initial connection with an immediate event', async () => {
      coordinator.activate();
      const connection = hub();
      connection.resolveStart();
      await settle();

      connection.emit('queue.updated', []);
      advance(WINDOW);

      expect(fakeState.refresh).toHaveBeenCalledTimes(1);
    });

    it('RC-22 does not poll while the connection is quiet', async () => {
      await connect();
      advance(WINDOW);
      fakeState.refresh.mockClear();

      advance(10 * 60_000);

      expect(fakeState.refresh).not.toHaveBeenCalled();
    });

    it('RC-23 only ever uses invalidate and refresh, never event data', async () => {
      const connection = await connect();
      advance(WINDOW);
      fakeState.refresh.mockClear();

      connection.emit('queue.updated', [{ id: JOB_1, secret: 'x' }]);
      advance(WINDOW);

      expect(fakeState.invalidate).toHaveBeenCalledWith();
      expect(fakeState.refresh).toHaveBeenCalledWith();
    });
  });

  describe('malformed and partial events', () => {
    it.each([
      ['no payload', []],
      ['null payload', [null]],
      ['string payload', ['garbage']],
      ['number payload', [42]],
      ['empty object', [{}]],
      ['unexpected object', [{ unexpected: true }]],
      ['invalid job id', [{ jobId: 'not-a-guid', status: 'Done' }]],
      ['extra arguments', [[], 'extra', 3]],
    ])('RC-24 still reconciles safely for %s', async (_name, args) => {
      const connection = await connect();
      advance(WINDOW);
      fakeState.refresh.mockClear();

      expect(() => connection.emit('job.updated', ...args)).not.toThrow();
      advance(WINDOW);

      expect(fakeState.refresh).toHaveBeenCalledTimes(1);
    });

    it('RC-25 ignores events with an unknown name', async () => {
      const connection = await connect();
      advance(WINDOW);
      fakeState.refresh.mockClear();

      connection.emit('something.else', []);
      advance(WINDOW);

      expect(fakeState.invalidate).not.toHaveBeenCalled();
      expect(fakeState.refresh).not.toHaveBeenCalled();
    });
  });

  describe('session and authorization', () => {
    it('RC-26 stops realtime and cancels reconciliation on authorization failure', async () => {
      const connection = await connect();
      connection.emit('queue.updated', []);

      fakeState.authFailure.set('unauthorized');
      TestBed.tick();
      advance(WINDOW);

      expect(realtime.status()).toBe('disconnected');
      expect(fakeState.refresh).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('RC-27 treats a forbidden failure the same way', async () => {
      await connect();

      fakeState.authFailure.set('forbidden');
      TestBed.tick();

      expect(realtime.status()).toBe('disconnected');
    });

    it('RC-28 ignores events that arrive before the failure is observed', async () => {
      const connection = await connect();
      advance(WINDOW);
      fakeState.refresh.mockClear();
      fakeState.invalidate.mockClear();

      fakeState.authFailure.set('unauthorized');
      connection.emit('queue.updated', []);
      advance(WINDOW);

      expect(fakeState.invalidate).not.toHaveBeenCalled();
      expect(fakeState.refresh).not.toHaveBeenCalled();
      expect(realtime.status()).toBe('disconnected');
    });

    it('RC-29 drops a scheduled reconciliation on logout', async () => {
      const connection = await connect();
      advance(WINDOW);
      fakeState.refresh.mockClear();

      connection.emit('queue.updated', []);
      session.clearSession();
      TestBed.tick();
      advance(WINDOW);

      expect(fakeState.refresh).not.toHaveBeenCalled();
      expect(realtime.status()).toBe('disconnected');
    });

    it('RC-30 drops a scheduled reconciliation when the same user gets a new session', async () => {
      const connection = await connect();
      advance(WINDOW);
      fakeState.refresh.mockClear();

      connection.emit('queue.updated', []);
      signIn('manager-001');
      advance(WINDOW);

      expect(fakeState.refresh).not.toHaveBeenCalled();
      expect(realtime.status()).toBe('disconnected');
    });

    it('RC-53 does not reconcile for a replaced session even before effects have run', async () => {
      const connection = await connect();
      advance(WINDOW);
      fakeState.refresh.mockClear();

      connection.emit('queue.updated', []);
      // No effect flush: the reconcile callback runs before the session
      // watcher could drop it, so it has to verify the session itself.
      session.setSession(makeSession('manager-001'));
      (coordinator as unknown as { runReconcile(): void }).runReconcile();

      expect(fakeState.refresh).not.toHaveBeenCalled();
    });

    it('RC-31 drops a scheduled reconciliation when another user signs in', async () => {
      const connection = await connect();
      advance(WINDOW);
      fakeState.refresh.mockClear();

      connection.emit('queue.updated', []);
      signIn('manager-002');
      advance(WINDOW);

      expect(fakeState.refresh).not.toHaveBeenCalled();
      expect(connection.stop).toHaveBeenCalled();
    });

    it('RC-32 does not reconnect by itself after a session replacement', async () => {
      await connect();

      signIn('manager-002');
      advance(60_000);

      expect(factory).toHaveBeenCalledTimes(1);
      expect(realtime.status()).toBe('disconnected');
    });

    it('RC-33 ignores events of the replaced connection', async () => {
      const connection = await connect();
      advance(WINDOW);
      fakeState.refresh.mockClear();
      fakeState.invalidate.mockClear();

      signIn('manager-002');
      connection.emit('queue.updated', []);
      advance(WINDOW);

      expect(fakeState.invalidate).not.toHaveBeenCalled();
      expect(fakeState.refresh).not.toHaveBeenCalled();
    });

    it('RC-34 stops everything when the session expires', async () => {
      await connect();
      advance(WINDOW);

      advance(3_600_000);

      expect(realtime.status()).toBe('disconnected');
      expect(realtime.failure()).toBe('session-ended');
    });

    it('RC-35 does not reconcile for an expired session', async () => {
      const connection = await connect();
      advance(WINDOW);
      fakeState.refresh.mockClear();

      connection.emit('queue.updated', []);
      vi.setSystemTime(new Date(START.getTime() + 3_700_000));
      advance(WINDOW);

      expect(fakeState.refresh).not.toHaveBeenCalled();
    });
  });

  describe('manual refresh and reconnect', () => {
    it('RC-36 refresh reloads over HTTP and keeps a healthy connection', async () => {
      await connect();
      advance(WINDOW);
      fakeState.refresh.mockClear();

      coordinator.refresh();

      expect(fakeState.refresh).toHaveBeenCalledTimes(1);
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('RC-37 refresh works when realtime failed and does not reconnect it', async () => {
      coordinator.activate();
      hub().rejectStart(new Error('boom'));
      await settle();

      coordinator.refresh();

      expect(fakeState.refresh).toHaveBeenCalledTimes(1);
      expect(factory).toHaveBeenCalledTimes(1);
      expect(realtime.status()).toBe('failed');
    });

    it('RC-38 refresh restarts a stopped connection with a valid session', async () => {
      await connect();
      signIn('manager-002');
      expect(realtime.status()).toBe('disconnected');

      coordinator.refresh();

      expect(factory).toHaveBeenCalledTimes(2);
      expect(realtime.status()).toBe('connecting');
    });

    it('RC-39 refresh before activation only reloads the board', () => {
      coordinator.refresh();

      expect(fakeState.refresh).toHaveBeenCalledTimes(1);
      expect(factory).not.toHaveBeenCalled();
    });

    it('RC-40 refresh does not start realtime after an authorization failure', async () => {
      await connect();
      fakeState.authFailure.set('unauthorized');
      TestBed.tick();

      coordinator.refresh();

      expect(factory).toHaveBeenCalledTimes(1);
      expect(realtime.status()).toBe('disconnected');
    });

    it('RC-41 reconnect starts a new connection after a failure', async () => {
      coordinator.activate();
      hub().rejectStart(new Error('boom'));
      await settle();
      expect(coordinator.canReconnect()).toBe(true);

      coordinator.reconnect();

      expect(factory).toHaveBeenCalledTimes(2);
      expect(realtime.status()).toBe('connecting');
      expect(fakeState.refresh).not.toHaveBeenCalled();
    });

    it('RC-42 reconnect cannot create duplicate connections', async () => {
      await connect();

      coordinator.reconnect();
      coordinator.reconnect();

      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('RC-43 reconnect reconciles once the new connection is up', async () => {
      coordinator.activate();
      hub().rejectStart(new Error('boom'));
      await settle();

      coordinator.reconnect();
      hub().resolveStart();
      await settle();
      advance(WINDOW);

      expect(realtime.status()).toBe('connected');
      expect(fakeState.refresh).toHaveBeenCalledTimes(1);
    });

    it('RC-44 reconnect is refused after destroy, without a session and after auth failure', async () => {
      coordinator.activate();
      hub().rejectStart(new Error('boom'));
      await settle();

      session.clearSession();
      TestBed.tick();
      coordinator.reconnect();
      expect(factory).toHaveBeenCalledTimes(1);

      setup();
      coordinator.activate();
      hub().rejectStart(new Error('boom'));
      await settle();
      fakeState.authFailure.set('forbidden');
      coordinator.reconnect();
      expect(factory).toHaveBeenCalledTimes(1);

      setup();
      coordinator.activate();
      hub().rejectStart(new Error('boom'));
      await settle();
      coordinator.ngOnDestroy();
      coordinator.reconnect();
      expect(factory).toHaveBeenCalledTimes(1);
    });
  });

  describe('connection status', () => {
    it('RC-45 reports connecting while the connection opens', () => {
      coordinator.activate();

      expect(coordinator.connection().state).toBe('connecting');
      expect(coordinator.connection().label).toBe(
        'Connecting to live updates...',
      );
    });

    it('RC-46 reports connected without promising current data', async () => {
      await connect();

      const view = coordinator.connection();

      expect(view.state).toBe('connected');
      expect(view.label).toBe('Live updates connected');
      expect(view.description).toContain('does not guarantee');
    });

    it('RC-47 reports reconnecting', async () => {
      const connection = await connect();

      connection.reconnecting();

      expect(coordinator.connection().state).toBe('reconnecting');
      expect(coordinator.connection().label).toBe(
        'Reconnecting to live updates...',
      );
    });

    it('RC-48 reports unavailable after a failure', async () => {
      coordinator.activate();
      hub().rejectStart(new Error('boom'));
      await settle();

      expect(coordinator.connection().state).toBe('unavailable');
      expect(coordinator.connection().label).toBe('Live updates unavailable');
    });

    it('RC-49 reports unavailable when the hub is not configured', () => {
      setup(null);

      coordinator.activate();

      expect(coordinator.connection().state).toBe('unavailable');
      expect(coordinator.canReconnect()).toBe(true);
    });

    it('RC-50 shows the status only while active, authorized and loaded', async () => {
      expect(coordinator.showConnection()).toBe(false);

      await connect();
      expect(coordinator.showConnection()).toBe(true);

      fakeState.viewState.set('idle');
      expect(coordinator.showConnection()).toBe(false);

      fakeState.viewState.set('ready');
      fakeState.authFailure.set('unauthorized');
      expect(coordinator.showConnection()).toBe(false);
    });

    it('RC-51 offers reconnect only when stopped or failed and authorized', async () => {
      expect(coordinator.canReconnect()).toBe(false);

      coordinator.activate();
      expect(coordinator.canReconnect()).toBe(false);

      hub().resolveStart();
      await settle();
      expect(coordinator.canReconnect()).toBe(false);

      hub().reconnecting();
      expect(coordinator.canReconnect()).toBe(false);

      hub().close();
      expect(coordinator.canReconnect()).toBe(true);

      fakeState.authFailure.set('unauthorized');
      expect(coordinator.canReconnect()).toBe(false);
    });

    it('RC-52 exposes no connection secrets in any status text', async () => {
      const connection = await connect();
      connection.close();

      const text = JSON.stringify([
        coordinator.connection(),
        realtime.failure(),
      ]);

      expect(text).not.toContain('token');
      expect(text).not.toContain('https://');
    });
  });
});
