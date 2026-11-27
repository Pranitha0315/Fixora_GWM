import {
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import type { HttpInterceptorFn } from '@angular/common/http';

import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';

import { SessionService } from '../../../../core/auth/session.service';
import { API_CONFIG } from '../../../../core/config/api.config';
import { authInterceptor } from '../../../../core/interceptors/auth.interceptor';
import { errorInterceptor } from '../../../../core/interceptors/error.interceptor';

import { AdaptiveQueueApiService } from '../../services/adaptive-queue-api.service';
import { ADAPTIVE_QUEUE_RECONCILE_WINDOW_MS } from '../../services/adaptive-queue-realtime-coordinator.service';
import { AdaptiveQueueRealtimeCoordinator } from '../../services/adaptive-queue-realtime-coordinator.service';
import {
  ADAPTIVE_QUEUE_HUB_CONNECTION_FACTORY,
  AdaptiveQueueRealtimeService,
} from '../../services/adaptive-queue-realtime.service';
import type { AdaptiveQueueHubConnection } from '../../services/adaptive-queue-realtime.service';
import { AdaptiveQueueStateService } from '../../services/adaptive-queue-state.service';

import { AdaptiveQueuePage } from './adaptive-queue';

/**
 * K16: walk-in reorder is BACKEND-LIMITED. These tests run the whole
 * page against the real API service and record every HTTP request,
 * to prove that no board state, interaction, event, failure or
 * session change can ever produce a reorder (or any other) POST.
 */

const START = new Date('2026-11-27T08:00:00Z');
const ORIGIN = 'https://api.example.test';
const MANAGER = `${ORIGIN}/api/v1/manager`;
const JOBS_URL = `${MANAGER}/jobs`;
const BAYS_URL = `${MANAGER}/settings/bays`;
const MECHANICS_URL = `${MANAGER}/mechanics`;
const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';
const SENSITIVE = 'SqlException: password=hunter2 at Server.Internal';

const NOTE = 'Reordering is not supported from this page yet.';

type Handler = (...args: unknown[]) => void;

class FakeHub implements AdaptiveQueueHubConnection {
  readonly listeners = new Map<string, Set<Handler>>();

  readonly start = vi.fn(() => new Promise<void>(() => undefined));
  readonly stop = vi.fn(() => Promise.resolve());

  readonly on = vi.fn((name: string, handler: Handler) => {
    const set = this.listeners.get(name) ?? new Set<Handler>();
    set.add(handler);
    this.listeners.set(name, set);
  });

  readonly off = vi.fn((name: string, handler: Handler) => {
    this.listeners.get(name)?.delete(handler);
  });

  readonly onclose = vi.fn();
  readonly onreconnecting = vi.fn();
  readonly onreconnected = vi.fn();

  emit(name: string, ...args: unknown[]): void {
    for (const handler of [...(this.listeners.get(name) ?? [])]) {
      handler(...args);
    }
  }
}

function uuid(value: number): string {
  return `10000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;
}

let counter = 0;

/** A JobSummaryDto exactly as the backend serializes it. */
function job(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  counter += 1;

  return {
    id: uuid(counter),
    number: `JC-${counter}`,
    customerId: uuid(1000 + counter),
    customerName: `Customer ${counter}`,
    vehicleId: uuid(2000 + counter),
    vehicleLabel: `Vehicle ${counter}`,
    mechanicId: null,
    mechanicName: null,
    bayId: null,
    bayName: null,
    status: 'Open',
    priority: 0,
    queuePosition: counter,
    etaAt: '2026-11-27T09:00:00',
    estimatedMinutes: 60,
    elapsedMinutes: 0,
    createdAt: '2026-11-27T06:00:00Z',
    startedAt: null,
    completedAt: null,
    complaint: null,
    managerNote: null,
    ...overrides,
  };
}

const BAY = { id: uuid(100), name: 'Bay 1', active: true };

const MECHANIC = {
  id: uuid(200),
  name: 'Kasun',
  phone: '0770000000',
  employeeCode: 'EMP-001',
  onDuty: true,
  activeJobs: 0,
};

describe('Adaptive Queue walk-in reorder compatibility (K16)', () => {
  let fixture: ComponentFixture<AdaptiveQueuePage>;
  let http: HttpTestingController;
  let session: SessionService;
  let hubs: FakeHub[];
  let sent: { readonly method: string; readonly url: string }[];

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function all(selector: string): HTMLElement[] {
    return Array.from(host().querySelectorAll<HTMLElement>(selector));
  }

  function one(selector: string): HTMLElement | null {
    return host().querySelector<HTMLElement>(selector);
  }

  function text(selector: string): string {
    return one(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function pageText(): string {
    return host().textContent?.replace(/\s+/g, ' ') ?? '';
  }

  function render(): void {
    TestBed.tick();
    fixture.detectChanges();
  }

  function signIn(userId = 'manager-001'): void {
    session.setSession({
      accessToken: 'test-access-token',
      expiresAt: Date.now() + 3_600_000,
      user: {
        id: userId,
        displayName: 'Test Manager',
        email: 'manager@example.test',
        roles: ['Manager'],
      },
    });
  }

  /** Answers the three board requests the page has outstanding. */
  function flushBoard(
    jobs: readonly Record<string, unknown>[],
    bays: readonly unknown[] = [BAY],
  ): void {
    http.expectOne(request => request.url === JOBS_URL).flush(jobs);
    http.expectOne(request => request.url === BAYS_URL).flush(bays);
    http.expectOne(request => request.url === MECHANICS_URL).flush([MECHANIC]);
    render();
  }

  /**
   * Answers the board requests with a jobs response (success or
   * failure) delivered last: a failing jobs request makes the page
   * cancel its sibling requests, so those are answered first.
   */
  function flushJobsLast(
    body: object,
    options?: { readonly status: number; readonly statusText: string },
  ): void {
    http.expectOne(request => request.url === BAYS_URL).flush([BAY]);
    http.expectOne(request => request.url === MECHANICS_URL).flush([MECHANIC]);
    http.expectOne(request => request.url === JOBS_URL).flush(body, options);
    render();
  }

  function advance(ms: number): void {
    vi.advanceTimersByTime(ms);
    render();
  }

  function controls(): string[] {
    return all('button').map(element => element.textContent?.trim() ?? '');
  }

  function expectOnlyGets(): void {
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.filter(request => request.method !== 'GET')).toEqual([]);
    expect(sent.some(request => /reorder|walk-in/i.test(request.url)))
      .toBe(false);
    expect(http.match(request => request.method !== 'GET')).toEqual([]);
  }

  function expectNoReorderControl(): void {
    expect(all('[draggable="true"], [cdkdrag], [cdkDrag]')).toHaveLength(0);
    expect(all('input, select, textarea, a')).toHaveLength(0);
    expect(controls().every(label => label === 'Refresh'
      || label === 'Try Again')).toBe(true);
    expect(pageText()).not.toMatch(/\b(drag|move up|move down|move to front)\b/i);
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    counter = 0;
    hubs = [];
    sent = [];

    const recorder: HttpInterceptorFn = (request, next) => {
      sent.push({ method: request.method, url: request.url });
      return next(request);
    };

    await TestBed.configureTestingModule({
      imports: [AdaptiveQueuePage],
      providers: [
        provideHttpClient(
          withInterceptors([recorder, errorInterceptor, authInterceptor]),
        ),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: ORIGIN } },
        {
          provide: ADAPTIVE_QUEUE_HUB_CONNECTION_FACTORY,
          useValue: () => {
            const created = new FakeHub();
            hubs.push(created);
            return created;
          },
        },
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);
    signIn();

    fixture = TestBed.createComponent(AdaptiveQueuePage);
    render();
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
  });

  describe('what the page offers', () => {
    it('ARC-01 explains that reorder is unsupported and offers no reorder control', () => {
      flushBoard([
        job({ number: 'W-1', queuePosition: 1 }),
        job({ number: 'W-2', queuePosition: 2, priority: 1 }),
        job({ number: 'A-1', status: 'InProgress', queuePosition: 0, bayId: BAY.id, bayName: 'Bay 1' }),
      ]);

      expect(text('.queue-reorder-note')).toContain(NOTE);
      expect(text('.queue-reorder-note')).toContain('stored queue order');
      expect(text('.queue-reorder-note')).toContain('walk-in');
      expect(controls()).toEqual(['Refresh']);
      expectNoReorderControl();
      expectOnlyGets();
    });

    it('ARC-02 shows the note once, in the waiting section, and only when jobs wait', () => {
      flushBoard([
        job({ number: 'A-1', status: 'InProgress', queuePosition: 0, bayId: BAY.id, bayName: 'Bay 1' }),
      ]);

      expect(one('.queue-reorder-note')).toBeNull();
    });

    it('ARC-03 puts the note inside the waiting section only', () => {
      flushBoard([job({ number: 'W-1', queuePosition: 1 })]);

      expect(all('.queue-reorder-note')).toHaveLength(1);
      expect(one('.queue-waiting .queue-reorder-note')).not.toBeNull();
    });

    it('ARC-04 no job state gets a reorder control', () => {
      flushBoard([
        job({ number: 'S-1', status: 'Open', queuePosition: 1 }),
        job({ number: 'S-2', status: 'InProgress', queuePosition: 0 }),
        job({ number: 'S-3', status: 'Paused', queuePosition: 0 }),
        job({ number: 'S-4', status: 'AwaitingRelease', queuePosition: 0 }),
        job({ number: 'S-5', status: 'Mystery', queuePosition: 0 }),
        job({ number: 'S-6', status: 'Completed', queuePosition: 0 }),
        job({ number: 'S-7', status: 'Closed', queuePosition: 0 }),
      ]);

      expect(pageText()).not.toContain('S-6');
      expect(pageText()).not.toContain('S-7');
      expect(all('.job-card')).toHaveLength(5);
      expect(all('.job-card button')).toHaveLength(0);
      expect(controls()).toEqual(['Refresh']);
      expectOnlyGets();
    });

    it('ARC-05 never presents an anonymous job as a walk-in and never reads bookings', () => {
      flushBoard([
        job({
          number: 'ANON-1',
          customerId: EMPTY_GUID,
          vehicleId: EMPTY_GUID,
          customerName: 'Walk-in Guest',
          queuePosition: 1,
        }),
        job({ number: 'BOOKED-1', queuePosition: 2 }),
      ]);

      const waiting = text('.queue-waiting-list');

      expect(all('.job-card button')).toHaveLength(0);
      expect(all('.job-card-source, .job-card-walk-in, [data-walk-in]'))
        .toHaveLength(0);
      expect(waiting).not.toMatch(/\bwalk-in\b(?! guest)/i);
      expect(sent.some(request => /bookings/i.test(request.url))).toBe(false);
      expectOnlyGets();
    });
  });

  describe('interaction attempts', () => {
    it('ARC-06 drag, drop, keyboard and click gestures on jobs send nothing', () => {
      flushBoard([
        job({ number: 'W-1', queuePosition: 1 }),
        job({ number: 'W-2', queuePosition: 2 }),
      ]);
      const before = sent.length;

      for (const element of all('.job-card, .job-card *')) {
        for (const type of ['dragstart', 'dragover', 'drop', 'dragend', 'click', 'dblclick', 'contextmenu']) {
          element.dispatchEvent(new Event(type, { bubbles: true }));
        }

        for (const key of ['ArrowUp', 'ArrowDown', 'Enter', ' ', 'Home']) {
          element.dispatchEvent(
            new KeyboardEvent('keydown', { key, altKey: true, bubbles: true }),
          );
        }
      }
      render();

      expect(sent.length).toBe(before);
      expect(all('.job-card-number').map(el => el.textContent?.trim()))
        .toEqual(['W-1', 'W-2']);
      expectOnlyGets();
    });

    it('ARC-07 the only control, Refresh, performs GET reads', () => {
      flushBoard([job({ number: 'W-1', queuePosition: 1 })]);

      (one('.queue-refresh button') as HTMLButtonElement).click();
      render();

      const requests = http.match(request => request.url !== '');

      expect(requests.map(request => request.request.method))
        .toEqual(['GET', 'GET', 'GET']);

      for (const request of requests) {
        request.flush(request.request.url === JOBS_URL ? [] : []);
      }
      render();

      expectOnlyGets();
    });
  });

  describe('board states', () => {
    it('ARC-08 an out-of-contract priority rejects the response and shows no reorder UI', () => {
      flushJobsLast([job({ priority: 7 })]);

      expect(one('fx-error-state')).not.toBeNull();
      expect(one('.queue-reorder-note')).toBeNull();
      expect(pageText()).not.toContain(NOTE);
      expectNoReorderControl();
      expectOnlyGets();
    });

    it('ARC-09 a stale board keeps the truthful note and still has no reorder control', () => {
      flushBoard([job({ number: 'W-1', queuePosition: 1 })]);

      advance(150_000 + 15_000);

      expect(one('.queue-sync-stale')).not.toBeNull();
      expect(text('.queue-reorder-note')).toContain(NOTE);
      expect(controls()).toEqual(['Refresh']);
      expectOnlyGets();
    });

    it('ARC-10 a failed reconciliation keeps the last board, the note and GET-only traffic', () => {
      flushBoard([job({ number: 'W-1', queuePosition: 1 })]);

      hubs[0].emit('queue.updated', []);
      advance(ADAPTIVE_QUEUE_RECONCILE_WINDOW_MS);
      flushJobsLast(
        { message: SENSITIVE },
        { status: 500, statusText: 'Server Error' },
      );

      expect(text('.queue-refresh-alert')).toContain('Showing the last data received.');
      expect(text('.queue-reorder-note')).toContain(NOTE);
      expect(pageText()).not.toContain(SENSITIVE);
      expect(controls()).toEqual(['Refresh']);
      expectOnlyGets();
    });

    it('ARC-11 realtime events, including malformed ones, cause GET reconciliation only', () => {
      flushBoard([job({ number: 'W-1', queuePosition: 1 })]);
      const before = sent.length;

      hubs[0].emit('queue.updated', [{ queueOrder: 1, priority: 2 }]);
      hubs[0].emit('job.updated', { jobId: uuid(1), priority: 2, queueOrder: 0 });
      hubs[0].emit('job.updated');
      hubs[0].emit('queue.updated', 'garbage');
      advance(ADAPTIVE_QUEUE_RECONCILE_WINDOW_MS);

      const requests = http.match(request => request.url !== '');

      expect(sent.length - before).toBe(3);
      expect(requests.map(request => request.request.method))
        .toEqual(['GET', 'GET', 'GET']);

      for (const request of requests) {
        request.flush(request.request.url === JOBS_URL
          ? [job({ number: 'W-1', queuePosition: 1 })]
          : request.request.url === BAYS_URL ? [BAY] : [MECHANIC]);
      }
      render();

      expect(pageText()).not.toMatch(/queueOrder/i);
      expectOnlyGets();
    });
  });

  describe('authorization and session', () => {
    for (const status of [401, 403]) {
      it(`ARC-12 a ${status} removes the note and every control but retry`, () => {
        flushBoard([job({ number: 'W-1', queuePosition: 1 })]);

        (one('.queue-refresh button') as HTMLButtonElement).click();
        render();
        flushJobsLast(
          { message: SENSITIVE },
          { status, statusText: 'Failure' },
        );

        expect(one('fx-error-state')).not.toBeNull();
        expect(one('.queue-reorder-note')).toBeNull();
        expect(pageText()).not.toContain('W-1');
        expect(pageText()).not.toContain(SENSITIVE);
        expectNoReorderControl();
        expectOnlyGets();
      });
    }

    it('ARC-13 session replacement clears the note and the board and sends nothing', () => {
      flushBoard([job({ number: 'W-1', queuePosition: 1 })]);
      const before = sent.length;

      signIn('manager-002');
      render();
      advance(10 * 60_000);

      expect(one('.queue-reorder-note')).toBeNull();
      expect(pageText()).not.toContain('W-1');
      expect(sent.length).toBe(before);
      expectOnlyGets();
    });

    it('ARC-14 logout clears the note and the board and sends nothing', () => {
      flushBoard([job({ number: 'W-1', queuePosition: 1 })]);
      const before = sent.length;

      session.clearSession();
      render();
      advance(10 * 60_000);

      expect(one('.queue-reorder-note')).toBeNull();
      expect(pageText()).not.toContain('W-1');
      expect(sent.length).toBe(before);
      expectOnlyGets();
    });

    it('ARC-15 a reload for the new session restores the note without a mutation', () => {
      flushBoard([job({ number: 'W-1', queuePosition: 1 })]);

      signIn('manager-002');
      render();
      (one('fx-empty-state button') as HTMLButtonElement).click();
      render();
      flushBoard([job({ number: 'W-9', queuePosition: 1 })]);

      expect(text('.queue-reorder-note')).toContain(NOTE);
      expect(pageText()).toContain('W-9');
      expectOnlyGets();
    });
  });

  describe('code surface', () => {
    it('ARC-16 no feature class has a mutation, reorder or ordering method', () => {
      const pattern =
        /reorder|assign|extend|walk|priority|queueOrder|submit|move|post|mutat|send|save|update(?!d)/i;

      for (const type of [
        AdaptiveQueueApiService,
        AdaptiveQueueStateService,
        AdaptiveQueueRealtimeService,
        AdaptiveQueueRealtimeCoordinator,
        AdaptiveQueuePage,
      ]) {
        const offenders = Object.getOwnPropertyNames(type.prototype)
          .filter(name => name !== 'constructor')
          .filter(name =>
            typeof Object.getOwnPropertyDescriptor(type.prototype, name)?.value
              === 'function',
          )
          .filter(name => pattern.test(name));

        expect(offenders, type.name).toEqual([]);
      }
    });
  });
});
