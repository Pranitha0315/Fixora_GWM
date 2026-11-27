import { TestBed } from '@angular/core/testing';

import { SessionService } from '../../../core/auth/session.service';
import { API_CONFIG } from '../../../core/config/api.config';
import type { AuthSession } from '../../../core/models/auth-session.model';

import {
  ADAPTIVE_QUEUE_HUB_CONNECTION_FACTORY,
  ADAPTIVE_QUEUE_HUB_PATH,
  ADAPTIVE_QUEUE_RECONNECT_DELAYS_MS,
  AdaptiveQueueRealtimeService,
  classifyAdaptiveQueuePayload,
} from './adaptive-queue-realtime.service';

import type {
  AdaptiveQueueHubConnection,
  AdaptiveQueueHubConnectionConfig,
  AdaptiveQueueInvalidation,
  AdaptiveQueueRealtimeConnected,
} from './adaptive-queue-realtime.service';

const START = new Date('2026-11-27T08:00:00Z');
const TOKEN = 'test-access-token-abc123';
const SECRET_ERROR = 'SqlException: password=hunter2 at Server.Internal';
const SESSION_LIFETIME_MS = 3_600_000;

const JOB_1 = '11111111-1111-4111-8111-111111111111';
const JOB_2 = '22222222-2222-4222-8222-222222222222';

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

  listenerCount(name: string): number {
    return this.listeners.get(name)?.size ?? 0;
  }

  close(error?: Error): void {
    this.closeCallbacks.forEach(callback => callback(error));
  }

  reconnecting(): void {
    this.reconnectingCallbacks.forEach(callback => callback());
  }

  reconnected(): void {
    this.reconnectedCallbacks.forEach(callback => callback('id'));
  }
}

function makeSession(
  userId = 'manager-001',
  accessToken = TOKEN,
  lifetimeMs = SESSION_LIFETIME_MS,
): AuthSession {
  return {
    accessToken,
    expiresAt: Date.now() + lifetimeMs,
    user: {
      id: userId,
      displayName: 'Test Manager',
      email: 'manager@example.test',
      roles: ['Manager'],
    },
  };
}

function configure(baseUrl: string | null): {
  hubs: FakeHub[];
  configs: AdaptiveQueueHubConnectionConfig[];
  factory: ReturnType<typeof vi.fn>;
} {
  const hubs: FakeHub[] = [];
  const configs: AdaptiveQueueHubConnectionConfig[] = [];

  const factory = vi.fn((config: AdaptiveQueueHubConnectionConfig) => {
    const hub = new FakeHub();
    hubs.push(hub);
    configs.push(config);
    return hub;
  });

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      AdaptiveQueueRealtimeService,
      { provide: API_CONFIG, useValue: { baseUrl } },
      { provide: ADAPTIVE_QUEUE_HUB_CONNECTION_FACTORY, useValue: factory },
    ],
  });

  return { hubs, configs, factory };
}

describe('AdaptiveQueueRealtimeService', () => {
  let service: AdaptiveQueueRealtimeService;
  let session: SessionService;
  let hubs: FakeHub[];
  let configs: AdaptiveQueueHubConnectionConfig[];
  let factory: ReturnType<typeof vi.fn>;
  let invalidations: AdaptiveQueueInvalidation[];
  let connectedEvents: AdaptiveQueueRealtimeConnected[];
  let timerBaseline = 0;

  function setup(baseUrl: string | null = 'https://api.fixora.example'): void {
    ({ hubs, configs, factory } = configure(baseUrl));

    session = TestBed.inject(SessionService);
    session.setSession(makeSession());

    service = TestBed.inject(AdaptiveQueueRealtimeService);
    invalidations = [];
    connectedEvents = [];
    service.invalidated$.subscribe(event => invalidations.push(event));
    service.connected$.subscribe(event => connectedEvents.push(event));

    TestBed.tick();
    timerBaseline = vi.getTimerCount();
  }

  function serviceTimers(): number {
    return vi.getTimerCount() - timerBaseline;
  }

  function hub(index = hubs.length - 1): FakeHub {
    return hubs[index];
  }

  async function connect(): Promise<FakeHub> {
    const promise = service.start();
    const connection = hub();

    connection.resolveStart();
    await promise;

    return connection;
  }

  async function settle(): Promise<void> {
    for (let i = 0; i < 6; i += 1) {
      await Promise.resolve();
    }
  }

  function endSession(): void {
    session.clearSession();
    TestBed.tick();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    setup();
  });

  afterEach(() => {
    service.ngOnDestroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('configuration', () => {
    it('RT-01 is not provided in root', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [{ provide: API_CONFIG, useValue: { baseUrl: null } }],
      });

      expect(() => TestBed.inject(AdaptiveQueueRealtimeService)).toThrow();
    });

    it('RT-02 does not connect on construction', () => {
      expect(factory).not.toHaveBeenCalled();
      expect(service.status()).toBe('disconnected');
      expect(service.failure()).toBeNull();
      expect(service.isConnected()).toBe(false);
    });

    it('RT-03 targets the /hubs/fixora endpoint on the HTTPS API origin', async () => {
      void service.start();

      expect(configs[0].url).toBe('https://api.fixora.example/hubs/fixora');
      expect(ADAPTIVE_QUEUE_HUB_PATH).toBe('hubs/fixora');
    });

    it('RT-04 uses only the origin when the API base URL has a path', () => {
      setup('https://api.fixora.example/api/v1/');
      void service.start();

      expect(configs[0].url).toBe('https://api.fixora.example/hubs/fixora');
    });

    it('RT-05 keeps an explicit port in the origin', () => {
      setup('https://localhost:7080');
      void service.start();

      expect(configs[0].url).toBe('https://localhost:7080/hubs/fixora');
    });

    it('RT-06 refuses a non-HTTPS API origin', async () => {
      setup('http://api.fixora.example');

      await service.start();

      expect(factory).not.toHaveBeenCalled();
      expect(service.status()).toBe('failed');
      expect(service.failure()).toBe('not-configured');
    });

    it('RT-07 refuses a missing API base URL', async () => {
      setup(null);

      await service.start();

      expect(factory).not.toHaveBeenCalled();
      expect(service.failure()).toBe('not-configured');
    });

    it('RT-08 never puts the token in the URL or config', () => {
      void service.start();

      expect(configs[0].url).not.toContain(TOKEN);
      expect(JSON.stringify({ ...configs[0], accessTokenFactory: 0 }))
        .not.toContain(TOKEN);
    });

    it('RT-09 bounds automatic reconnect to the configured delays', () => {
      void service.start();
      const policy = configs[0].reconnectPolicy;

      const delays = ADAPTIVE_QUEUE_RECONNECT_DELAYS_MS.map((_, index) =>
        policy.nextRetryDelayInMilliseconds({
          previousRetryCount: index,
          elapsedMilliseconds: 0,
          retryReason: new Error('x'),
        }),
      );

      expect(delays).toEqual([0, 2_000, 5_000, 10_000, 30_000]);
      expect(
        policy.nextRetryDelayInMilliseconds({
          previousRetryCount: ADAPTIVE_QUEUE_RECONNECT_DELAYS_MS.length,
          elapsedMilliseconds: 0,
          retryReason: new Error('x'),
        }),
      ).toBeNull();
    });

    it('RT-10 stops reconnecting once the session is gone', () => {
      void service.start();
      const policy = configs[0].reconnectPolicy;

      session.clearSession();

      expect(
        policy.nextRetryDelayInMilliseconds({
          previousRetryCount: 0,
          elapsedMilliseconds: 0,
          retryReason: new Error('x'),
        }),
      ).toBeNull();
    });

    it('RT-11 builds a real SignalR connection by default without connecting', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [{ provide: API_CONFIG, useValue: { baseUrl: null } }],
      });

      const create = TestBed.inject(ADAPTIVE_QUEUE_HUB_CONNECTION_FACTORY);
      const real = create({
        url: 'https://api.fixora.example/hubs/fixora',
        accessTokenFactory: () => '',
        reconnectPolicy: { nextRetryDelayInMilliseconds: () => null },
      });

      expect(typeof real.start).toBe('function');
      expect(typeof real.on).toBe('function');
      expect(typeof real.onreconnected).toBe('function');
    });
  });

  describe('token factory', () => {
    it('RT-12 returns the current session token', () => {
      void service.start();

      expect(configs[0].accessTokenFactory()).toBe(TOKEN);
    });

    it('RT-13 returns an empty token after the session is cleared', () => {
      void service.start();
      session.clearSession();

      expect(configs[0].accessTokenFactory()).toBe('');
    });

    it('RT-14 returns an empty token after the session expires', () => {
      void service.start();
      vi.setSystemTime(new Date(START.getTime() + SESSION_LIFETIME_MS));

      expect(configs[0].accessTokenFactory()).toBe('');
    });

    it('RT-15 never hands a replacement session token to the old connection', () => {
      void service.start();
      session.setSession(makeSession('manager-001', 'replacement-token'));

      expect(configs[0].accessTokenFactory()).toBe('');
    });

    it('RT-16 returns an empty token after destruction', () => {
      void service.start();
      service.ngOnDestroy();

      expect(configs[0].accessTokenFactory()).toBe('');
    });

    it('RT-17 does not log, persist or expose the token', async () => {
      const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const)
        .map(method => vi.spyOn(console, method).mockImplementation(() => undefined));
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      const getItem = vi.spyOn(Storage.prototype, 'getItem');

      const connection = await connect();
      connection.emit('queue.updated', [{ id: JOB_1, number: 'JC-1' }]);
      connection.reconnecting();
      connection.reconnected();
      endSession();

      for (const spy of consoleSpies) {
        expect(spy).not.toHaveBeenCalled();
      }

      expect(setItem).not.toHaveBeenCalled();
      expect(getItem).not.toHaveBeenCalled();
      expect(JSON.stringify(invalidations)).not.toContain(TOKEN);
      expect(JSON.stringify(connectedEvents)).not.toContain(TOKEN);
      expect(service.failure() ?? '').not.toContain(TOKEN);
    });
  });

  describe('session gating', () => {
    it('RT-18 does not connect without a session', async () => {
      session.clearSession();

      await service.start();

      expect(factory).not.toHaveBeenCalled();
      expect(service.status()).toBe('disconnected');
      expect(service.failure()).toBe('session-unavailable');
    });

    it('RT-19 does not connect with an expired session', async () => {
      vi.setSystemTime(new Date(START.getTime() + SESSION_LIFETIME_MS + 1));

      await service.start();

      expect(factory).not.toHaveBeenCalled();
      expect(service.failure()).toBe('session-unavailable');
    });

    it('RT-20 connects once a valid session exists', async () => {
      session.clearSession();
      await service.start();

      session.setSession(makeSession());
      await connect();

      expect(service.status()).toBe('connected');
      expect(service.failure()).toBeNull();
    });
  });

  describe('connection lifecycle', () => {
    it('RT-21 reports connecting, then connected, and notifies', async () => {
      const promise = service.start();

      expect(service.status()).toBe('connecting');
      expect(connectedEvents).toHaveLength(0);

      hub().resolveStart();
      await promise;

      expect(service.status()).toBe('connected');
      expect(service.isConnected()).toBe(true);
      expect(connectedEvents).toHaveLength(1);
      expect(connectedEvents[0].reason).toBe('initial');
      expect(connectedEvents[0].at).toEqual(START);
    });

    it('RT-22 registers exactly the queue and job event handlers', async () => {
      await connect();

      expect([...hub().listeners.keys()].sort())
        .toEqual(['job.updated', 'queue.updated']);
      expect(hub().listenerCount('queue.updated')).toBe(1);
      expect(hub().listenerCount('job.updated')).toBe(1);
    });

    it('RT-23 exposes no way to join job groups', () => {
      const names = Object.getOwnPropertyNames(FakeHub.prototype)
        .concat(Object.keys(new FakeHub()));

      expect(names).not.toContain('invoke');
      expect(names).not.toContain('send');
      expect(names.join(' ')).not.toMatch(/join/i);
    });

    it('RT-24 does not open a second connection while connecting', async () => {
      const first = service.start();
      const second = service.start();

      expect(factory).toHaveBeenCalledTimes(1);
      expect(second).toBe(first);

      hub().resolveStart();
      await first;
    });

    it('RT-25 does not open a second connection or handlers while connected', async () => {
      await connect();
      await service.start();
      await service.start();

      expect(factory).toHaveBeenCalledTimes(1);
      expect(hub().on).toHaveBeenCalledTimes(2);
      expect(hub().listenerCount('queue.updated')).toBe(1);
    });

    it('RT-26 fails safely when the initial connection fails', async () => {
      const promise = service.start();
      hub().rejectStart(new Error(SECRET_ERROR));
      await promise;

      expect(service.status()).toBe('failed');
      expect(service.failure()).toBe('connect-failed');
      expect(hub().stop).toHaveBeenCalled();
      expect(hub().listenerCount('queue.updated')).toBe(0);
      expect(connectedEvents).toHaveLength(0);
      expect(JSON.stringify(service.failure())).not.toContain(SECRET_ERROR);
    });

    it('RT-27 never retries the initial connection by itself', async () => {
      const promise = service.start();
      hub().rejectStart(new Error('offline'));
      await promise;

      vi.advanceTimersByTime(600_000);
      await settle();

      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('RT-28 can be started again after a failure without duplicate handlers', async () => {
      const first = service.start();
      hub().rejectStart(new Error('offline'));
      await first;

      await connect();

      expect(factory).toHaveBeenCalledTimes(2);
      expect(service.status()).toBe('connected');
      expect(hubs[0].listenerCount('queue.updated')).toBe(0);
      expect(hubs[1].listenerCount('queue.updated')).toBe(1);
    });

    it('RT-29 survives a connection factory that throws', async () => {
      factory.mockImplementationOnce(() => {
        throw new Error(SECRET_ERROR);
      });

      await service.start();

      expect(service.status()).toBe('failed');
      expect(service.failure()).toBe('connect-failed');
    });

    it('RT-30 stop closes the connection and removes handlers', async () => {
      const connection = await connect();

      service.stop();

      expect(service.status()).toBe('disconnected');
      expect(connection.stop).toHaveBeenCalledTimes(1);
      expect(connection.listenerCount('queue.updated')).toBe(0);
      expect(connection.listenerCount('job.updated')).toBe(0);
    });

    it('RT-31 stop is idempotent', async () => {
      const connection = await connect();

      service.stop();
      service.stop();

      expect(connection.stop).toHaveBeenCalledTimes(1);
    });

    it('RT-32 ignores events after stop', async () => {
      const connection = await connect();
      const handler = [...connection.listeners.get('queue.updated')!][0];

      service.stop();
      handler([]);

      expect(invalidations).toHaveLength(0);
    });
  });

  describe('automatic reconnect', () => {
    it('RT-33 reports reconnecting', async () => {
      const connection = await connect();

      connection.reconnecting();

      expect(service.status()).toBe('reconnecting');
      expect(service.isConnected()).toBe(false);
    });

    it('RT-34 reports connected again and notifies after a reconnect', async () => {
      const connection = await connect();
      connection.reconnecting();

      connection.reconnected();

      expect(service.status()).toBe('connected');
      expect(connectedEvents.map(event => event.reason))
        .toEqual(['initial', 'reconnected']);
    });

    it('RT-35 fails with reconnect-exhausted when reconnecting gives up', async () => {
      const connection = await connect();
      connection.reconnecting();

      connection.close(new Error(SECRET_ERROR));

      expect(service.status()).toBe('failed');
      expect(service.failure()).toBe('reconnect-exhausted');
      expect(connection.stop).toHaveBeenCalled();
      expect(connection.listenerCount('queue.updated')).toBe(0);
    });

    it('RT-36 fails with connection-closed on an unexpected close', async () => {
      const connection = await connect();

      connection.close();

      expect(service.status()).toBe('failed');
      expect(service.failure()).toBe('connection-closed');
    });

    it('RT-37 does not restart after the reconnect budget is exhausted', async () => {
      const connection = await connect();
      connection.reconnecting();
      connection.close();

      vi.advanceTimersByTime(600_000);
      await settle();

      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('RT-38 ignores reconnect callbacks from a replaced connection', async () => {
      const old = await connect();
      service.stop();
      await connect();

      old.reconnected();
      old.close();

      expect(service.status()).toBe('connected');
      expect(connectedEvents).toHaveLength(2);
    });

    it('RT-39 ignores a reconnect that completes after logout', async () => {
      const connection = await connect();
      connection.reconnecting();

      session.clearSession();
      connection.reconnected();

      expect(service.status()).toBe('disconnected');
      expect(service.failure()).toBe('session-ended');
      expect(connectedEvents).toHaveLength(1);
    });
  });

  describe('realtime events', () => {
    it('RT-40 treats a queue.updated board as an invalidation only', async () => {
      const connection = await connect();

      connection.emit('queue.updated', [
        { id: JOB_1, number: 'JC-1', customerName: 'Secret Customer' },
        { id: JOB_2, number: 'JC-2', customerName: 'Other Customer' },
      ]);

      expect(invalidations).toHaveLength(1);
      expect(invalidations[0]).toMatchObject({
        event: 'queue.updated',
        shape: 'job-board',
        jobId: null,
      });
    });

    it('RT-41 treats an empty queue.updated board as valid', async () => {
      const connection = await connect();

      connection.emit('queue.updated', []);

      expect(invalidations[0].shape).toBe('job-board');
    });

    it('RT-42 recognizes a job.updated job summary', async () => {
      const connection = await connect();

      connection.emit('job.updated', { id: JOB_1, number: 'JC-1' });

      expect(invalidations[0]).toMatchObject({
        event: 'job.updated',
        shape: 'job-summary',
        jobId: JOB_1,
      });
    });

    it('RT-43 recognizes the billing job.updated variant', async () => {
      const connection = await connect();

      connection.emit('job.updated', { jobId: JOB_1, status: 'Completed' });

      expect(invalidations[0]).toMatchObject({
        event: 'job.updated',
        shape: 'job-status',
        jobId: JOB_1,
      });
    });

    it('RT-44 recognizes a queue estimate payload', async () => {
      const connection = await connect();

      connection.emit('queue.updated', {
        jobId: JOB_1,
        queuePosition: 2,
        etaAt: '2026-11-27T08:30:00Z',
        status: 'Open',
      });

      expect(invalidations[0]).toMatchObject({
        event: 'queue.updated',
        shape: 'queue-estimate',
        jobId: JOB_1,
      });
    });

    const malformed: readonly [string, unknown[]][] = [
      ['no arguments', []],
      ['null', [null]],
      ['undefined', [undefined]],
      ['a string', ['text']],
      ['a number', [42]],
      ['a boolean', [true]],
      ['an array of numbers', [[1, 2]]],
      ['an array with a non-object item', [[{ id: JOB_1 }, 5]]],
      ['an empty object', [{}]],
      ['an invalid summary id', [{ id: 'not-a-guid', number: 'JC-1' }]],
      ['a summary without a number', [{ id: JOB_1 }]],
      ['an invalid job id', [{ jobId: 'bad', status: 'Open' }]],
      ['a job id without status', [{ jobId: JOB_1 }]],
      ['a numeric job id', [{ jobId: 7, status: 'Open' }]],
    ];

    for (const event of ['queue.updated', 'job.updated']) {
      for (const [name, args] of malformed) {
        it(`RT-45 handles ${name} on ${event} without throwing`, async () => {
          const connection = await connect();

          expect(() => connection.emit(event, ...args)).not.toThrow();
          expect(invalidations).toHaveLength(1);
          expect(invalidations[0].shape).toBe('unrecognized');
          expect(invalidations[0].jobId).toBeNull();
          expect(invalidations[0].event).toBe(event);
          expect(service.status()).toBe('connected');
        });
      }
    }

    it('RT-46 classifies payloads without throwing for hostile input', () => {
      const hostile = {
        get id(): string {
          return JOB_1;
        },
        get number(): string {
          return 'JC-1';
        },
      };

      expect(classifyAdaptiveQueuePayload(hostile).shape).toBe('job-summary');
      expect(classifyAdaptiveQueuePayload(Object.create(null)).shape)
        .toBe('unrecognized');
    });

    it('RT-47 exposes no payload data in an invalidation', async () => {
      const connection = await connect();

      connection.emit('job.updated', {
        id: JOB_1,
        number: 'JC-1',
        customerName: 'Secret Customer',
        managerNote: 'Private note',
      });

      expect(Object.keys(invalidations[0]).sort())
        .toEqual(['event', 'jobId', 'receivedAt', 'shape']);
      expect(JSON.stringify(invalidations[0])).not.toContain('Secret Customer');
      expect(JSON.stringify(invalidations[0])).not.toContain('Private note');
    });

    it('RT-48 does not mutate frozen payloads', async () => {
      const connection = await connect();
      const payload = Object.freeze([
        Object.freeze({ id: JOB_1, number: 'JC-1' }),
      ]);

      expect(() => connection.emit('queue.updated', payload)).not.toThrow();
      expect(invalidations).toHaveLength(1);
    });

    it('RT-49 only considers the first event argument', async () => {
      const connection = await connect();

      connection.emit('job.updated', { id: JOB_1, number: 'JC-1' }, 'extra', 7);

      expect(invalidations).toHaveLength(1);
      expect(invalidations[0].jobId).toBe(JOB_1);
    });

    it('RT-50 stamps invalidations with the receive time', async () => {
      const connection = await connect();
      vi.setSystemTime(new Date('2026-11-27T08:05:00Z'));

      connection.emit('queue.updated', []);

      expect(invalidations[0].receivedAt)
        .toEqual(new Date('2026-11-27T08:05:00Z'));
    });

    it('RT-51 emits one invalidation per event, with no deduplication', async () => {
      const connection = await connect();

      connection.emit('queue.updated', []);
      connection.emit('queue.updated', []);
      connection.emit('job.updated', { jobId: JOB_1, status: 'Open' });

      expect(invalidations).toHaveLength(3);
    });

    it('RT-52 ignores events once the session has ended', async () => {
      const connection = await connect();
      const handler = [...connection.listeners.get('queue.updated')!][0];

      session.clearSession();
      handler([]);

      expect(invalidations).toHaveLength(0);
      expect(service.status()).toBe('disconnected');
    });

    it('RT-53 ignores events from a replaced connection', async () => {
      const old = await connect();
      const oldHandler = [...old.listeners.get('queue.updated')!][0];

      service.stop();
      await connect();

      oldHandler([]);
      hub().emit('queue.updated', []);

      expect(invalidations).toHaveLength(1);
    });
  });

  describe('logout, session replacement and expiry', () => {
    it('RT-54 stops and cleans up on logout', async () => {
      const connection = await connect();

      endSession();

      expect(service.status()).toBe('disconnected');
      expect(service.failure()).toBe('session-ended');
      expect(connection.stop).toHaveBeenCalledTimes(1);
      expect(connection.listenerCount('queue.updated')).toBe(0);
      expect(serviceTimers()).toBe(0);
    });

    it('RT-55 stops when the session is replaced by the same user', async () => {
      const connection = await connect();

      session.setSession(makeSession('manager-001', 'replacement-token'));
      TestBed.tick();

      expect(service.status()).toBe('disconnected');
      expect(connection.stop).toHaveBeenCalled();
    });

    it('RT-56 stops when another user signs in', async () => {
      const connection = await connect();

      session.setSession(makeSession('manager-002'));
      TestBed.tick();

      expect(service.status()).toBe('disconnected');
      expect(connection.stop).toHaveBeenCalled();
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('RT-57 does not reconnect by itself after the session is replaced', async () => {
      await connect();
      session.setSession(makeSession('manager-002'));
      TestBed.tick();

      vi.advanceTimersByTime(600_000);
      await settle();

      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('RT-58 connects for the new session only when started again', async () => {
      await connect();
      session.setSession(makeSession('manager-002', 'second-token'));
      TestBed.tick();

      void service.start();

      expect(factory).toHaveBeenCalledTimes(2);
      expect(configs[1].accessTokenFactory()).toBe('second-token');
      expect(configs[0].accessTokenFactory()).toBe('');
    });

    it('RT-59 ends the connection when the session expires', async () => {
      const connection = await connect();

      vi.advanceTimersByTime(SESSION_LIFETIME_MS);

      expect(service.status()).toBe('disconnected');
      expect(service.failure()).toBe('session-ended');
      expect(connection.stop).toHaveBeenCalled();
    });

    it('RT-60 uses one expiry timer and no polling', async () => {
      expect(serviceTimers()).toBe(0);

      await connect();

      expect(serviceTimers()).toBe(1);

      vi.advanceTimersByTime(SESSION_LIFETIME_MS - 1_000);
      await settle();

      expect(serviceTimers()).toBe(1);
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('RT-61 clears the expiry timer on stop and destruction', async () => {
      await connect();
      service.stop();

      expect(serviceTimers()).toBe(0);

      await connect();
      service.ngOnDestroy();

      expect(serviceTimers()).toBe(0);
    });

    it('RT-62 re-checks a clamped expiry timer for very long sessions', async () => {
      const lifetime = 40 * 24 * 3_600_000;

      session.setSession(makeSession('manager-001', TOKEN, lifetime));
      await connect();

      vi.advanceTimersByTime(2_147_483_647);

      expect(service.status()).toBe('connected');
      expect(serviceTimers()).toBe(1);

      vi.advanceTimersByTime(lifetime);

      expect(service.status()).toBe('disconnected');
    });

    it('RT-63 never touches the session on its own', async () => {
      const setSession = vi.spyOn(session, 'setSession');
      const clearSession = vi.spyOn(session, 'clearSession');

      await connect();
      endSession();

      expect(setSession).not.toHaveBeenCalled();
      expect(clearSession).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancellation races', () => {
    it('RT-64 does not restore access when start succeeds after logout', async () => {
      const promise = service.start();
      const connection = hub();

      endSession();
      connection.resolveStart();
      await promise;

      expect(service.status()).toBe('disconnected');
      expect(service.failure()).toBe('session-ended');
      expect(connectedEvents).toHaveLength(0);
      expect(connection.stop).toHaveBeenCalled();
    });

    it('RT-65 does not restore access without waiting for the session effect', async () => {
      const promise = service.start();
      const connection = hub();

      session.clearSession();
      connection.resolveStart();
      await promise;

      expect(service.status()).toBe('disconnected');
      expect(connectedEvents).toHaveLength(0);
    });

    it('RT-66 ignores a start failure that arrives after logout', async () => {
      const promise = service.start();
      const connection = hub();

      endSession();
      connection.rejectStart(new Error(SECRET_ERROR));
      await promise;

      expect(service.status()).toBe('disconnected');
      expect(service.failure()).toBe('session-ended');
    });

    it('RT-67 ignores the old start result after the session was replaced and restarted', async () => {
      const first = service.start();
      const oldHub = hub();

      session.setSession(makeSession('manager-002'));
      TestBed.tick();

      const second = service.start();
      const newHub = hub();

      expect(hubs).toHaveLength(2);

      newHub.resolveStart();
      await second;
      oldHub.resolveStart();
      await first;

      expect(service.status()).toBe('connected');
      expect(connectedEvents).toHaveLength(1);
      expect(oldHub.stop).toHaveBeenCalled();
      expect(newHub.stop).not.toHaveBeenCalled();
    });

    it('RT-68 ignores a failure of an old start after a new connection succeeded', async () => {
      const first = service.start();
      const oldHub = hub();

      service.stop();
      const second = service.start();
      hub().resolveStart();
      await second;

      oldHub.rejectStart(new Error('cancelled'));
      await first;

      expect(service.status()).toBe('connected');
      expect(service.failure()).toBeNull();
    });

    it('RT-69 ignores an old start success after stop and a new start', async () => {
      const first = service.start();
      const oldHub = hub();

      service.stop();
      void service.start();
      oldHub.resolveStart();
      await first;

      expect(service.status()).toBe('connecting');
      expect(connectedEvents).toHaveLength(0);
    });

    it('RT-70 stops a connection that was cancelled while connecting', async () => {
      const promise = service.start();
      const connection = hub();

      service.stop();

      expect(connection.stop).toHaveBeenCalledTimes(1);

      connection.rejectStart(new Error('stopped during negotiation'));
      await promise;

      expect(service.status()).toBe('disconnected');
      expect(service.failure()).toBeNull();
    });

    it('RT-71 does not deliver events from a connection cancelled while connecting', async () => {
      const promise = service.start();
      const connection = hub();
      const handler = [...connection.listeners.get('queue.updated')!][0];

      service.stop();
      handler([]);
      connection.resolveStart();
      await promise;

      expect(invalidations).toHaveLength(0);
    });
  });

  describe('destruction', () => {
    it('RT-72 stops the connection and releases everything on destroy', async () => {
      const connection = await connect();

      service.ngOnDestroy();

      expect(service.status()).toBe('disconnected');
      expect(connection.stop).toHaveBeenCalledTimes(1);
      expect(connection.listenerCount('queue.updated')).toBe(0);
      expect(serviceTimers()).toBe(0);
    });

    it('RT-73 completes the notification streams on destroy', () => {
      let invalidationCompleted = false;
      let connectedCompleted = false;

      service.invalidated$.subscribe({ complete: () => (invalidationCompleted = true) });
      service.connected$.subscribe({ complete: () => (connectedCompleted = true) });

      service.ngOnDestroy();

      expect(invalidationCompleted).toBe(true);
      expect(connectedCompleted).toBe(true);
    });

    it('RT-74 can be destroyed more than once', async () => {
      const connection = await connect();

      service.ngOnDestroy();
      service.ngOnDestroy();

      expect(connection.stop).toHaveBeenCalledTimes(1);
    });

    it('RT-75 does not start after destruction', async () => {
      service.ngOnDestroy();

      await service.start();

      expect(factory).not.toHaveBeenCalled();
      expect(service.status()).toBe('disconnected');
    });

    it('RT-76 ignores a start that completes after destruction', async () => {
      const promise = service.start();
      const connection = hub();

      service.ngOnDestroy();
      connection.resolveStart();
      await promise;

      expect(service.status()).toBe('disconnected');
      expect(connectedEvents).toHaveLength(0);
      expect(connection.stop).toHaveBeenCalled();
    });

    it('RT-77 ignores session changes after destruction', async () => {
      await connect();
      service.ngOnDestroy();

      expect(() => {
        session.setSession(makeSession('manager-002'));
        TestBed.tick();
        session.clearSession();
        TestBed.tick();
      }).not.toThrow();

      expect(service.failure()).toBeNull();
    });

    it('RT-78 exposes read-only status signals', () => {
      expect('set' in service.status).toBe(false);
      expect('set' in service.failure).toBe(false);
      expect('set' in service.isConnected).toBe(false);
    });
  });
});
