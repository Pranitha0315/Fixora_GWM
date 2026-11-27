import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';

import { Subject } from 'rxjs';

import { SessionService } from '../../../../core/auth/session.service';
import { API_CONFIG } from '../../../../core/config/api.config';
import { ApiError } from '../../../../core/models/api-error.model';
import type { ApiErrorCode } from '../../../../core/models/api-error.model';

import type {
  BayDto,
  JobSummaryDto,
  MechanicRosterDto,
} from '../../../bookings/models/booking-support.model';

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

const START = new Date('2026-11-27T08:00:00Z');
const WINDOW = ADAPTIVE_QUEUE_RECONCILE_WINDOW_MS;

type Handler = (...args: unknown[]) => void;

/** In-memory hub: no network, no SignalR. */
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

  reconnecting(): void {
    this.reconnectingCallbacks.forEach(callback => callback());
  }

  reconnected(): void {
    this.reconnectedCallbacks.forEach(callback => callback('id'));
  }

  close(): void {
    this.closeCallbacks.forEach(callback => callback());
  }
}
const SENSITIVE = 'SqlException: password=hunter2 at Server.Internal';

const BAY_1 = 'bay-0001';
const BAY_2 = 'bay-0002';
const BAY_INACTIVE = 'bay-0003';
const BAY_UNKNOWN = 'bay-9999';

let counter = 0;

function makeJob(overrides: Partial<JobSummaryDto> = {}): JobSummaryDto {
  counter += 1;

  return {
    id: `job-${counter}`,
    number: `JC-${counter}`,
    customerId: `customer-${counter}`,
    customerName: `Customer ${counter}`,
    vehicleId: `vehicle-${counter}`,
    vehicleLabel: `Vehicle ${counter}`,
    mechanicId: null,
    mechanicName: null,
    bayId: null,
    bayName: null,
    status: 'Open',
    priority: 0,
    queuePosition: counter,
    etaAt: null,
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

function makeBay(id: string, name: string, active = true): BayDto {
  return { id, name, active };
}

function makeMechanic(id: number, onDuty = true): MechanicRosterDto {
  return {
    id: `mechanic-${id}`,
    name: `Mechanic ${id}`,
    phone: '0770000000',
    employeeCode: `M${id}`,
    onDuty,
    activeJobs: 0,
  };
}

function createFakeApi() {
  const jobs: Subject<readonly JobSummaryDto[]>[] = [];
  const bays: Subject<readonly BayDto[]>[] = [];
  const mechanics: Subject<readonly MechanicRosterDto[]>[] = [];

  const api = {
    getActiveJobs: vi.fn(() => {
      const subject = new Subject<readonly JobSummaryDto[]>();
      jobs.push(subject);
      return subject.asObservable();
    }),
    getBays: vi.fn(() => {
      const subject = new Subject<readonly BayDto[]>();
      bays.push(subject);
      return subject.asObservable();
    }),
    getMechanics: vi.fn(() => {
      const subject = new Subject<readonly MechanicRosterDto[]>();
      mechanics.push(subject);
      return subject.asObservable();
    }),
  };

  return { api, jobs, bays, mechanics };
}

function last<T>(items: readonly T[]): T {
  return items[items.length - 1];
}

function respond<T>(subject: Subject<T>, value: T): void {
  subject.next(value);
  subject.complete();
}

function apiError(status: number, code: ApiErrorCode): ApiError {
  return new ApiError(status, code, SENSITIVE);
}

describe('AdaptiveQueuePage', () => {
  let fixture: ComponentFixture<AdaptiveQueuePage>;
  let fake: ReturnType<typeof createFakeApi>;
  let session: SessionService;
  let hubs: FakeHub[];
  let hubFactory: ReturnType<typeof vi.fn>;

  function hub(): FakeHub {
    return hubs[hubs.length - 1];
  }

  async function settle(): Promise<void> {
    for (let i = 0; i < 6; i += 1) {
      await Promise.resolve();
    }
  }

  async function connectHub(): Promise<void> {
    hub().resolveStart();
    await settle();
    render();
  }

  function advance(ms: number): void {
    vi.advanceTimersByTime(ms);
    render();
  }

  /** Board loaded and the first (initial) reconciliation done. */
  async function settleLive(
    jobs: readonly JobSummaryDto[] = [makeJob()],
  ): Promise<void> {
    loadBoard(jobs);
    await connectHub();
    advance(WINDOW);
    loadBoard(jobs);
    fake.api.getActiveJobs.mockClear();
    fake.api.getBays.mockClear();
    fake.api.getMechanics.mockClear();
  }

  function connectionText(): string {
    return text('.queue-connection');
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

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function render(): void {
    TestBed.tick();
    fixture.detectChanges();
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

  function numbers(selector: string): string[] {
    return all(`${selector} .job-card-number`).map(
      element => element.textContent?.trim() ?? '',
    );
  }

  function kpi(name: string): string {
    return text(`.queue-kpi-${name} .fx-kpi-value`);
  }

  function state(): AdaptiveQueueStateService {
    return fixture.debugElement.injector.get(AdaptiveQueueStateService);
  }

  function loadBoard(
    jobs: readonly JobSummaryDto[] = [],
    bays: readonly BayDto[] = [makeBay(BAY_1, 'Bay 1')],
    roster: readonly MechanicRosterDto[] | null = [makeMechanic(1)],
  ): void {
    if (roster !== null) {
      respond(last(fake.mechanics), roster);
    }

    respond(last(fake.jobs), jobs);
    respond(last(fake.bays), bays);
    render();
  }

  function clickRefresh(): void {
    one('.queue-refresh button')?.click();
    render();
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(START);

    counter = 0;
    fake = createFakeApi();
    hubs = [];
    hubFactory = vi.fn(() => {
      const created = new FakeHub();
      hubs.push(created);
      return created;
    });

    await TestBed.configureTestingModule({
      imports: [AdaptiveQueuePage],
      providers: [
        { provide: AdaptiveQueueApiService, useValue: fake.api },
        { provide: API_CONFIG, useValue: { baseUrl: 'https://api.fixora.example' } },
        { provide: ADAPTIVE_QUEUE_HUB_CONNECTION_FACTORY, useValue: hubFactory },
      ],
    }).compileComponents();

    session = TestBed.inject(SessionService);
    signIn();

    fixture = TestBed.createComponent(AdaptiveQueuePage);
    render();
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
  });

  describe('lifecycle and loading', () => {
    it('AQP-01 creates the page with a heading', () => {
      expect(fixture.componentInstance).toBeTruthy();
      expect(text('h1')).toBe('Adaptive Queue');
    });

    it('AQP-02 provides the state service at page scope', () => {
      expect(state()).toBeInstanceOf(AdaptiveQueueStateService);
      expect(() => TestBed.inject(AdaptiveQueueStateService)).toThrow();
    });

    it('AQP-03 starts the initial refresh once on init', () => {
      expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);
      expect(fake.api.getBays).toHaveBeenCalledTimes(1);
      expect(fake.api.getMechanics).toHaveBeenCalledTimes(1);
    });

    it('AQP-04 shows the loading state before data arrives', () => {
      expect(one('fx-loading-state')).not.toBeNull();
      expect(pageText()).toContain('Loading adaptive queue...');
      expect(one('.queue-summary')).toBeNull();
    });

    it('AQP-05 disables the refresh button while loading', () => {
      const button = one('.queue-refresh button') as HTMLButtonElement;

      expect(button.disabled).toBe(true);
    });

    it('AQP-06 cancels requests and stops the timer when destroyed', () => {
      loadBoard();
      clickRefresh();
      const pendingJobs = last(fake.jobs);
      const timersWhileAlive = vi.getTimerCount();

      expect(pendingJobs.observed).toBe(true);

      fixture.destroy();

      expect(pendingJobs.observed).toBe(false);
      expect(vi.getTimerCount()).toBeLessThan(timersWhileAlive);
    });

    it('AQP-07 never uses browser storage or reads the token', () => {
      const token = vi.spyOn(session, 'getAccessToken');
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      const getItem = vi.spyOn(Storage.prototype, 'getItem');

      loadBoard([makeJob()]);
      session.clearSession();
      render();

      expect(token).not.toHaveBeenCalled();
      expect(setItem).not.toHaveBeenCalled();
      expect(getItem).not.toHaveBeenCalled();
    });
  });

  describe('summary and synchronization', () => {
    it('AQP-08 shows waiting, active-phase and active bay counts', () => {
      loadBoard(
        [
          makeJob({ status: 'Open' }),
          makeJob({ status: 'Open' }),
          makeJob({ status: 'InProgress', bayId: BAY_1, bayName: 'Bay 1' }),
        ],
        [
          makeBay(BAY_1, 'Bay 1'),
          makeBay(BAY_2, 'Bay 2'),
          makeBay(BAY_INACTIVE, 'Bay 3', false),
        ],
      );

      expect(kpi('waiting')).toBe('2');
      expect(kpi('active-phase')).toBe('1');
      expect(kpi('bays')).toBe('2');
    });

    it('AQP-09 shows the on-duty mechanic count with the roster size', () => {
      loadBoard(
        [],
        [makeBay(BAY_1, 'Bay 1')],
        [makeMechanic(1), makeMechanic(2, false), makeMechanic(3)],
      );

      expect(kpi('mechanics')).toBe('2');
      expect(text('.queue-kpi-mechanics')).toContain('of 3 on the roster');
    });

    it('AQP-10 shows zero on-duty mechanics only for an empty loaded roster', () => {
      loadBoard([], [makeBay(BAY_1, 'Bay 1')], []);

      expect(kpi('mechanics')).toBe('0');
    });

    it('AQP-11 does not show a missing roster as zero mechanics', () => {
      respond(last(fake.jobs), []);
      respond(last(fake.bays), [makeBay(BAY_1, 'Bay 1')]);
      render();

      expect(kpi('mechanics')).toBe('Loading...');
      expect(kpi('mechanics')).not.toBe('0');
    });

    it('AQP-12 shows the last synchronization time after a sync', () => {
      loadBoard();

      expect(text('.queue-sync-time')).toContain('Last synced:');
      expect(one('.queue-sync-stale')).toBeNull();
    });

    it('AQP-13 does not show a synchronization status before the first sync', () => {
      expect(one('.queue-sync')).toBeNull();
    });
  });

  describe('queue groups', () => {
    it('AQP-14 lists waiting jobs in backend queue-position order', () => {
      loadBoard([
        makeJob({ number: 'W-3', queuePosition: 3 }),
        makeJob({ number: 'W-1', queuePosition: 1 }),
        makeJob({ number: 'W-2', queuePosition: 2 }),
      ]);

      expect(numbers('.queue-waiting-list')).toEqual(['W-1', 'W-2', 'W-3']);
      expect(
        all('.queue-waiting-list .job-card-position').map(
          element => element.textContent?.trim(),
        ),
      ).toEqual(['Queue #1', 'Queue #2', 'Queue #3']);
    });

    it('AQP-15 shows the waiting count in the heading', () => {
      loadBoard([makeJob(), makeJob()]);

      expect(text('#waiting-heading')).toBe('Waiting queue (2)');
    });

    it('AQP-16 shows an explicit message when nothing is waiting', () => {
      loadBoard([
        makeJob({ status: 'InProgress', bayId: BAY_1, bayName: 'Bay 1' }),
      ]);

      expect(text('.queue-waiting-empty')).toBe('No jobs are waiting.');
    });

    it('AQP-17 renders active bay columns in backend bay order', () => {
      loadBoard(
        [],
        [
          makeBay(BAY_2, 'Bay B'),
          makeBay(BAY_1, 'Bay A'),
          makeBay(BAY_INACTIVE, 'Bay C', false),
        ],
      );

      expect(all('.queue-bay h3').map(el => el.textContent?.trim()))
        .toEqual(['Bay B', 'Bay A']);
      expect(text('#bays-heading')).toBe('Active bays (2)');
    });

    it('AQP-18 separates active-phase and pre-assigned waiting jobs per bay', () => {
      loadBoard(
        [
          makeJob({
            number: 'A-1',
            status: 'InProgress',
            bayId: BAY_1,
            bayName: 'Bay 1',
          }),
          makeJob({
            number: 'P-1',
            status: 'Open',
            bayId: BAY_1,
            bayName: 'Bay 1',
            queuePosition: 1,
          }),
        ],
      );

      expect(numbers('.queue-bay-active')).toEqual(['A-1']);
      expect(numbers('.queue-bay-preassigned')).toEqual(['P-1']);
    });

    it('AQP-19 shows explicit empty text for a bay without assigned jobs', () => {
      loadBoard();

      expect(text('.queue-bay-active .queue-none'))
        .toBe('No active-phase job is assigned to this bay.');
      expect(text('.queue-bay-preassigned .queue-none'))
        .toBe('No waiting jobs are pre-assigned to this bay.');
    });

    it('AQP-20 shows an explicit message when there are no active bays', () => {
      loadBoard([], [makeBay(BAY_INACTIVE, 'Bay 3', false)]);

      expect(text('.queue-bays-empty')).toBe('No active bays are configured.');
    });

    it('AQP-21 lists active-phase jobs without a bay as unassigned', () => {
      loadBoard([makeJob({ number: 'U-1', status: 'Inspecting' })]);

      expect(numbers('.queue-unassigned')).toEqual(['U-1']);
    });

    it('AQP-22 does not repeat waiting jobs without a bay in the fallback groups', () => {
      loadBoard([makeJob({ number: 'W-1' })]);

      expect(one('.queue-fallbacks')).toBeNull();
      expect(numbers('.queue-waiting-list')).toEqual(['W-1']);
    });

    it('AQP-23 groups jobs on an inactive bay', () => {
      loadBoard(
        [
          makeJob({
            number: 'I-1',
            status: 'InProgress',
            bayId: BAY_INACTIVE,
            bayName: 'Bay 3',
          }),
        ],
        [makeBay(BAY_1, 'Bay 1'), makeBay(BAY_INACTIVE, 'Bay 3', false)],
      );

      expect(text('.queue-inactive-bay h3')).toContain('(inactive bay)');
      expect(numbers('.queue-inactive-bay')).toEqual(['I-1']);
    });

    it('AQP-24 groups jobs on an unknown bay', () => {
      loadBoard([
        makeJob({
          number: 'K-1',
          status: 'InProgress',
          bayId: BAY_UNKNOWN,
          bayName: 'Ghost bay',
        }),
      ]);

      expect(text('.queue-unknown-bay h3')).toContain('(not in the bay list)');
      expect(numbers('.queue-unknown-bay')).toEqual(['K-1']);
    });

    it('AQP-25 shows jobs with an unrecognized status', () => {
      loadBoard([makeJob({ number: 'X-1', status: 'Mystery' })]);

      expect(numbers('.queue-unrecognized')).toEqual(['X-1']);
      expect(text('.queue-unrecognized .job-card-status')).toBe('Mystery');
      expect(kpi('waiting')).toBe('0');
      expect(kpi('active-phase')).toBe('0');
    });

    it('AQP-26 omits the unrecognized section when there are none', () => {
      loadBoard([makeJob()]);

      expect(one('.queue-unrecognized')).toBeNull();
    });

    it('AQP-27 excludes completed and closed jobs from the board', () => {
      loadBoard([
        makeJob({ number: 'C-1', status: 'Completed' }),
        makeJob({ number: 'C-2', status: 'Closed' }),
        makeJob({ number: 'W-1' }),
      ]);

      expect(pageText()).not.toContain('C-1');
      expect(pageText()).not.toContain('C-2');
      expect(numbers('.queue-waiting-list')).toEqual(['W-1']);
    });
  });

  describe('job details and ETA', () => {
    it('AQP-28 shows the formatted ETA on a job', () => {
      loadBoard([makeJob({ etaAt: '2026-11-27T08:30:00Z' })]);

      expect(text('.queue-waiting-list .job-card-eta'))
        .toBe('27 Nov 2026, 14:00');
    });

    it('AQP-29 shows an unavailable ETA explicitly', () => {
      loadBoard([makeJob({ etaAt: null })]);

      expect(text('.queue-waiting-list .job-card-eta'))
        .toBe('ETA unavailable');
    });

    it('AQP-30 shows customer, vehicle, mechanic and priority', () => {
      loadBoard([
        makeJob({
          customerName: 'Nimal Perera',
          vehicleLabel: 'Axio CAB-1234',
          mechanicId: 'mechanic-1',
          mechanicName: 'Kasun Silva',
          priority: 2,
        }),
      ]);

      expect(text('.job-card-customer')).toBe('Nimal Perera');
      expect(text('.job-card-vehicle')).toBe('Axio CAB-1234');
      expect(text('.job-card-mechanic')).toBe('Kasun Silva');
      expect(text('.job-card-priority')).toBe('Urgent priority');
    });

    it('AQP-31 never invents a queue position for active-phase jobs', () => {
      loadBoard([
        makeJob({ status: 'InProgress', bayId: BAY_1, bayName: 'Bay 1' }),
      ]);

      expect(one('.queue-bay-active .job-card-position')).toBeNull();
    });
  });

  describe('capacity and advisories', () => {
    it('AQP-32 warns when there are no active bays', () => {
      loadBoard([], []);

      expect(pageText()).toContain('No active bays configured');
      expect(pageText()).toContain('No active bays are configured. Jobs are still listed');
    });

    it('AQP-33 warns when the 200-record limit is reached', () => {
      const jobs = Array.from({ length: 200 }, () => makeJob());

      loadBoard(jobs);

      expect(pageText()).toContain('Job list may be incomplete');
      expect(pageText()).toContain('at most 200 active jobs');
    });

    it('AQP-34 does not warn about the limit below 200 records', () => {
      loadBoard([makeJob()]);

      expect(pageText()).not.toContain('Job list may be incomplete');
    });

    it('AQP-35 shows shared active-phase bay assignments as advisory only', () => {
      loadBoard([
        makeJob({
          number: 'A-1',
          status: 'InProgress',
          bayId: BAY_1,
          bayName: 'Bay 1',
        }),
        makeJob({
          number: 'A-2',
          status: 'Paused',
          bayId: BAY_1,
          bayName: 'Bay 1',
        }),
      ]);

      expect(text('.queue-shared-bay')).toContain('Bay 1');
      expect(text('.queue-shared-bay')).toContain('A-1');
      expect(text('.queue-shared-bay')).toContain('A-2');
      expect(text('.queue-shared-bay')).toContain('not confirmed physical occupancy');
      expect(text('.queue-bay-advisory')).toContain('Shared assignment (advisory)');
    });

    it('AQP-36 shows shared mechanic assignments as advisory only', () => {
      loadBoard([
        makeJob({
          number: 'A-1',
          status: 'InProgress',
          bayId: BAY_1,
          bayName: 'Bay 1',
          mechanicId: 'mechanic-1',
          mechanicName: 'Kasun',
        }),
        makeJob({
          number: 'A-2',
          status: 'InProgress',
          bayId: BAY_2,
          bayName: 'Bay 2',
          mechanicId: 'mechanic-1',
          mechanicName: 'Kasun',
        }),
      ], [makeBay(BAY_1, 'Bay 1'), makeBay(BAY_2, 'Bay 2')]);

      expect(text('.queue-shared-mechanic')).toContain('Kasun');
      expect(text('.queue-shared-mechanic')).toContain('Advisory only');
    });

    it('AQP-37 does not treat waiting jobs sharing a bay as a conflict', () => {
      loadBoard([
        makeJob({ status: 'Open', bayId: BAY_1, bayName: 'Bay 1', queuePosition: 1 }),
        makeJob({ status: 'Open', bayId: BAY_1, bayName: 'Bay 1', queuePosition: 2 }),
      ]);

      expect(one('.queue-shared-bay')).toBeNull();
      expect(one('.queue-bay-advisory')).toBeNull();
      expect(pageText()).not.toContain('Shared bay assignments');
      expect(all('.queue-bay-preassigned .job-card')).toHaveLength(2);
    });

    it('AQP-38 states that a bay assignment is not physical occupancy', () => {
      loadBoard();

      expect(text('.queue-bays .queue-hint'))
        .toContain('does not confirm that a vehicle is physically in the bay');
    });

    it('AQP-39 never describes bays as occupied, free or available', () => {
      loadBoard([
        makeJob({ status: 'InProgress', bayId: BAY_1, bayName: 'Bay 1' }),
        makeJob({ status: 'Open', bayId: BAY_2, bayName: 'Bay 2' }),
      ], [makeBay(BAY_1, 'Bay 1'), makeBay(BAY_2, 'Bay 2')]);

      expect(pageText()).not.toMatch(/\boccupied\b/i);
      expect(pageText()).not.toMatch(/\b(free|available|vacant)\b/i);
    });

    it('AQP-40 explains the ETA time zone and meaning', () => {
      loadBoard();

      expect(text('.queue-footnote')).toContain('Asia/Colombo');
      expect(text('.queue-footnote')).toContain('indicative estimate');
    });
  });

  describe('empty, error and refresh states', () => {
    it('AQP-41 shows the empty state while keeping bay columns visible', () => {
      loadBoard([], [makeBay(BAY_1, 'Bay 1')]);

      expect(text('.queue-empty')).toContain('No active jobs');
      expect(all('.queue-bay')).toHaveLength(1);
      expect(kpi('waiting')).toBe('0');
    });

    it('AQP-42 shows a safe error when the initial load fails', () => {
      last(fake.jobs).error(apiError(500, 'SERVER_ERROR'));
      render();

      expect(one('fx-error-state')).not.toBeNull();
      expect(text('fx-error-state h2')).toBe('Adaptive Queue unavailable');
      expect(pageText()).not.toContain(SENSITIVE);
      expect(pageText()).not.toContain('SqlException');
      expect(one('.queue-summary')).toBeNull();
    });

    it('AQP-43 retries from the error state', () => {
      last(fake.jobs).error(apiError(500, 'SERVER_ERROR'));
      render();

      (one('fx-error-state button') as HTMLButtonElement).click();
      render();

      expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(2);
      expect(one('fx-loading-state')).not.toBeNull();

      loadBoard([makeJob()]);

      expect(one('fx-error-state')).toBeNull();
      expect(all('.queue-waiting-list .job-card')).toHaveLength(1);
    });

    it('AQP-44 manual refresh requests the board again and keeps it visible', () => {
      loadBoard([makeJob({ number: 'W-1' })]);

      clickRefresh();

      expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(2);
      expect(text('.queue-sync-refreshing')).toBe('Refreshing...');
      expect(numbers('.queue-waiting-list')).toEqual(['W-1']);
      expect(one('fx-loading-state')).toBeNull();
    });

    it('AQP-45 does not send a second request while refreshing', () => {
      loadBoard([makeJob()]);
      clickRefresh();

      const button = one('.queue-refresh button') as HTMLButtonElement;

      expect(button.disabled).toBe(true);
      button.click();
      render();

      expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(2);
    });

    it('AQP-46 replaces the board with the refreshed data', () => {
      loadBoard([makeJob({ number: 'W-1' })]);
      clickRefresh();

      respond(last(fake.mechanics), [makeMechanic(1)]);
      respond(last(fake.jobs), [makeJob({ number: 'W-2' })]);
      respond(last(fake.bays), [makeBay(BAY_1, 'Bay 1')]);
      render();

      expect(numbers('.queue-waiting-list')).toEqual(['W-2']);
      expect(one('.queue-sync-refreshing')).toBeNull();
    });

    it('AQP-47 keeps the board and shows a warning when a refresh fails', () => {
      loadBoard([makeJob({ number: 'W-1' })]);
      clickRefresh();

      last(fake.jobs).error(apiError(500, 'SERVER_ERROR'));
      render();

      expect(one('.queue-refresh-alert')).not.toBeNull();
      expect(text('.queue-refresh-alert')).toContain('Latest refresh failed');
      expect(text('.queue-refresh-alert')).toContain('Showing the last data received.');
      expect(numbers('.queue-waiting-list')).toEqual(['W-1']);
      expect(one('.queue-sync-stale')).not.toBeNull();
      expect(pageText()).not.toContain(SENSITIVE);
    });

    it('AQP-48 clears the refresh warning after a later successful refresh', () => {
      loadBoard([makeJob()]);
      clickRefresh();
      last(fake.jobs).error(apiError(500, 'SERVER_ERROR'));
      render();

      clickRefresh();
      loadBoard([makeJob({ number: 'W-9' })]);

      expect(one('.queue-refresh-alert')).toBeNull();
      expect(one('.queue-sync-stale')).toBeNull();
    });
  });

  describe('stale board', () => {
    it('AQP-49 marks the board as possibly out of date after the freshness window', () => {
      loadBoard([makeJob()]);

      vi.advanceTimersByTime(165_000);
      render();

      expect(one('.queue-sync-stale')).not.toBeNull();
      expect(text('.queue-stale-alert')).toContain('may no longer match the server');
    });

    it('AQP-50 does not poll the network while aging', () => {
      loadBoard([makeJob()]);

      vi.advanceTimersByTime(600_000);
      render();

      expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);
      expect(fake.api.getBays).toHaveBeenCalledTimes(1);
      expect(fake.api.getMechanics).toHaveBeenCalledTimes(1);
    });

    it('AQP-51 clears the stale marker after a successful refresh', () => {
      loadBoard([makeJob()]);
      vi.advanceTimersByTime(165_000);
      render();

      clickRefresh();
      loadBoard([makeJob()]);

      expect(one('.queue-sync-stale')).toBeNull();
      expect(one('.queue-stale-alert')).toBeNull();
    });
  });

  describe('optional mechanic roster', () => {
    it('AQP-52 shows the board when the roster fails', () => {
      last(fake.mechanics).error(apiError(500, 'SERVER_ERROR'));
      loadBoard([makeJob({ number: 'W-1' })], [makeBay(BAY_1, 'Bay 1')], null);

      expect(numbers('.queue-waiting-list')).toEqual(['W-1']);
      expect(text('.queue-roster-alert')).toContain('Mechanic roster unavailable');
      expect(kpi('mechanics')).toBe('Unavailable');
      expect(pageText()).not.toContain(SENSITIVE);
    });

    it('AQP-53 explains a roster permission denial without hiding the board', () => {
      last(fake.mechanics).error(apiError(403, 'FORBIDDEN'));
      loadBoard([makeJob({ number: 'W-1' })], [makeBay(BAY_1, 'Bay 1')], null);

      expect(text('.queue-roster-alert'))
        .toContain('permission to view the mechanic roster');
      expect(numbers('.queue-waiting-list')).toEqual(['W-1']);
      expect(one('fx-error-state')).toBeNull();
      expect(kpi('mechanics')).toBe('Unavailable');
    });

    it('AQP-54 does not retain roster data after a roster permission denial', () => {
      loadBoard([makeJob()]);
      expect(kpi('mechanics')).toBe('1');

      clickRefresh();
      last(fake.mechanics).error(apiError(403, 'FORBIDDEN'));
      respond(last(fake.jobs), [makeJob()]);
      respond(last(fake.bays), [makeBay(BAY_1, 'Bay 1')]);
      render();

      expect(kpi('mechanics')).toBe('Unavailable');
    });

    it('AQP-55 invalidates the whole page on a roster 401', () => {
      loadBoard([makeJob({ customerName: 'Secret Customer' })]);
      clickRefresh();

      last(fake.mechanics).error(apiError(401, 'UNAUTHORIZED'));
      render();

      expect(text('fx-error-state h2')).toBe('Sign-in required');
      expect(pageText()).not.toContain('Secret Customer');
    });
  });

  describe('authentication and permission failures', () => {
    it('AQP-56 presents a 401 as sign-in required without a retry button', () => {
      last(fake.jobs).error(apiError(401, 'UNAUTHORIZED'));
      render();

      expect(text('fx-error-state h2')).toBe('Sign-in required');
      expect(text('fx-error-state')).toContain('sign in again');
      expect(one('fx-error-state button')).toBeNull();
      expect(pageText()).not.toContain(SENSITIVE);
    });

    it('AQP-57 presents a 403 as access denied without a retry button', () => {
      last(fake.bays).error(apiError(403, 'FORBIDDEN'));
      render();

      expect(text('fx-error-state h2')).toBe('Access denied');
      expect(text('fx-error-state')).toContain('do not have permission');
      expect(one('fx-error-state button')).toBeNull();
    });

    it('AQP-58 clears the visible board on a refresh 401', () => {
      loadBoard([makeJob({ customerName: 'Secret Customer' })]);
      clickRefresh();

      last(fake.jobs).error(apiError(401, 'UNAUTHORIZED'));
      render();

      expect(text('fx-error-state h2')).toBe('Sign-in required');
      expect(one('.queue-summary')).toBeNull();
      expect(one('.queue-sync')).toBeNull();
      expect(pageText()).not.toContain('Secret Customer');
    });

    it('AQP-59 clears the visible board on a refresh 403', () => {
      loadBoard([makeJob({ customerName: 'Secret Customer' })]);
      clickRefresh();

      last(fake.bays).error(apiError(403, 'FORBIDDEN'));
      render();

      expect(text('fx-error-state h2')).toBe('Access denied');
      expect(pageText()).not.toContain('Secret Customer');
    });

    it('AQP-60 still allows a manual refresh after an authorization failure', () => {
      last(fake.jobs).error(apiError(401, 'UNAUTHORIZED'));
      render();

      clickRefresh();
      loadBoard([makeJob()]);

      expect(one('fx-error-state')).toBeNull();
      expect(all('.queue-waiting-list .job-card')).toHaveLength(1);
    });
  });

  describe('session lifecycle', () => {
    it('AQP-61 hides protected data after logout', () => {
      loadBoard([makeJob({ customerName: 'Secret Customer' })]);

      session.clearSession();
      render();

      expect(text('fx-error-state h2')).toBe('Sign-in required');
      expect(pageText()).not.toContain('Secret Customer');
      expect(one('.queue-summary')).toBeNull();
    });

    it('AQP-62 does not request data when refreshed while signed out', () => {
      loadBoard([makeJob()]);
      session.clearSession();
      render();

      clickRefresh();

      expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);
      expect(text('fx-error-state h2')).toBe('Sign-in required');
    });

    it('AQP-63 does not restore data from a response that arrives after logout', () => {
      const pendingJobs = last(fake.jobs);
      const pendingBays = last(fake.bays);

      session.clearSession();
      respond(pendingJobs, [makeJob({ customerName: 'Secret Customer' })]);
      respond(pendingBays, [makeBay(BAY_1, 'Bay 1')]);
      render();

      expect(pageText()).not.toContain('Secret Customer');
      expect(text('fx-error-state h2')).toBe('Sign-in required');
    });

    it('AQP-64 clears the previous user board when another user signs in', () => {
      loadBoard([makeJob({ customerName: 'Secret Customer' })]);

      signIn('manager-002');
      render();

      expect(pageText()).not.toContain('Secret Customer');
      expect(text('fx-empty-state h2')).toBe('Queue not loaded');
      expect(one('fx-error-state')).toBeNull();
    });

    it('AQP-65 reloads for the new user from the idle state', () => {
      loadBoard([makeJob({ customerName: 'Old Customer' })]);
      signIn('manager-002');
      render();

      (one('fx-empty-state button') as HTMLButtonElement).click();
      render();

      expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(2);

      loadBoard([makeJob({ customerName: 'New Customer' })]);

      expect(pageText()).toContain('New Customer');
      expect(pageText()).not.toContain('Old Customer');
    });
  });

  describe('read-only behaviour', () => {
    it('AQP-66 offers no mutation controls on the board', () => {
      loadBoard([
        makeJob({ status: 'InProgress', bayId: BAY_1, bayName: 'Bay 1' }),
        makeJob(),
      ]);

      expect(all('button').map(el => el.textContent?.trim()))
        .toEqual(['Refresh']);
      expect(all('a')).toHaveLength(0);
      expect(all('input, select, textarea')).toHaveLength(0);
    });

    // K13-B: the original assertion forbade any "live"/"connected"
    // text because there was no realtime connection. The page now
    // shows a truthful connection status, so this checks that it
    // makes no claim of guaranteed, complete or instant data.
    it('AQP-67 makes no overclaiming statement about live data', () => {
      loadBoard([makeJob()]);

      expect(pageText()).not.toMatch(
        /\b(real-?time data|always (up to date|current)|guaranteed|up to the second|instant)\b/i,
      );
      expect(pageText()).not.toMatch(/\b(live (data|board|queue))\b/i);
    });

    it('AQP-68 never shows complaints or manager notes', () => {
      loadBoard([
        makeJob({
          complaint: 'Private complaint text',
          managerNote: 'Private manager note',
        }),
      ]);

      expect(pageText()).not.toContain('Private complaint text');
      expect(pageText()).not.toContain('Private manager note');
    });

    it('AQP-69 exposes the state through the page-scoped service only', () => {
      loadBoard([makeJob()]);

      expect(state().hasBoard()).toBe(true);
      expect(state().waitingJobs()).toHaveLength(1);
    });
  });

  describe('realtime integration (K13-B)', () => {
    describe('connection lifecycle', () => {
      it('AQP-70 provides the realtime services at page scope', () => {
        const injector = fixture.debugElement.injector;

        expect(injector.get(AdaptiveQueueRealtimeService)).toBeInstanceOf(
          AdaptiveQueueRealtimeService,
        );
        expect(injector.get(AdaptiveQueueRealtimeCoordinator)).toBeInstanceOf(
          AdaptiveQueueRealtimeCoordinator,
        );
        expect(() => TestBed.inject(AdaptiveQueueRealtimeService)).toThrow();
        expect(() =>
          TestBed.inject(AdaptiveQueueRealtimeCoordinator),
        ).toThrow();
      });

      it('AQP-71 starts the HTTP load before, and independent of, the connection', () => {
        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);
        expect(hubFactory).toHaveBeenCalledTimes(1);
        expect(fake.api.getActiveJobs.mock.invocationCallOrder[0]).toBeLessThan(
          hubFactory.mock.invocationCallOrder[0],
        );
        expect(hub().start).toHaveBeenCalledTimes(1);
      });

      it('AQP-72 shows Connecting while the hub opens and the board loads over HTTP', () => {
        expect(connectionText()).toContain('Connecting to live updates...');

        loadBoard([makeJob({ customerName: 'Http Customer' })]);

        expect(pageText()).toContain('Http Customer');
        expect(connectionText()).toContain('Connecting to live updates...');
      });

      it('AQP-73 loads the board over HTTP when SignalR fails', async () => {
        hub().rejectStart(new Error(SENSITIVE));
        await settle();
        loadBoard([makeJob({ customerName: 'Http Customer' })]);

        expect(pageText()).toContain('Http Customer');
        expect(connectionText()).toContain('Live updates unavailable');
        expect(pageText()).not.toContain('hunter2');
        expect(one('.queue-reconnect')).not.toBeNull();
      });

      it('AQP-74 shows Live updates connected without promising current data', async () => {
        loadBoard([makeJob()]);
        await connectHub();

        expect(connectionText()).toContain('Live updates connected');
        expect(connectionText()).toContain('does not guarantee');
        expect(one('.queue-reconnect')).toBeNull();
      });

      it('AQP-75 keeps connection status separate from snapshot freshness', async () => {
        await settleLive();

        state().invalidate();
        render();

        expect(connectionText()).toContain('Live updates connected');
        expect(one('.queue-sync-stale')).not.toBeNull();
        expect(one('.queue-stale-alert')).not.toBeNull();
      });

      it('AQP-76 shows Reconnecting and then connected again', async () => {
        await settleLive();

        hub().reconnecting();
        render();
        expect(connectionText()).toContain('Reconnecting to live updates...');

        hub().reconnected();
        render();
        expect(connectionText()).toContain('Live updates connected');
      });

      it('AQP-77 offers a reconnect only when the connection is unavailable', async () => {
        await settleLive();
        expect(one('.queue-reconnect')).toBeNull();

        hub().close();
        render();

        expect(connectionText()).toContain('Live updates unavailable');
        expect(text('.queue-reconnect')).toBe('Reconnect live updates');
      });

      it('AQP-78 shows no connection status before anything was requested', () => {
        fixture.destroy();
        fixture = TestBed.createComponent(AdaptiveQueuePage);

        expect(one('.queue-connection')).toBeNull();
      });
    });

    describe('HTTP reconciliation', () => {
      it('AQP-79 reconciles over HTTP after the initial connection', async () => {
        loadBoard([makeJob()]);
        await connectHub();
        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);

        advance(WINDOW);

        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(2);
        expect(fake.api.getBays).toHaveBeenCalledTimes(2);
      });

      it('AQP-80 does not flash a stale warning for the initial connection', async () => {
        loadBoard([makeJob()]);
        await connectHub();
        render();

        expect(one('.queue-sync-stale')).toBeNull();
        expect(one('.queue-stale-alert')).toBeNull();
      });

      it('AQP-81 treats an event as a signal: board kept, stale flagged, then reloaded', async () => {
        await settleLive([makeJob({ customerName: 'Before' })]);

        hub().emit('job.updated', { jobId: 'x', customerName: 'Injected' });
        render();

        expect(pageText()).toContain('Before');
        expect(pageText()).not.toContain('Injected');
        expect(one('.queue-sync-stale')).not.toBeNull();
        expect(fake.api.getActiveJobs).not.toHaveBeenCalled();

        advance(WINDOW);
        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);

        loadBoard([makeJob({ customerName: 'After' })]);

        expect(pageText()).toContain('After');
        expect(pageText()).not.toContain('Before');
        expect(pageText()).not.toContain('Injected');
        expect(one('.queue-sync-stale')).toBeNull();
      });

      it('AQP-82 never renders event payloads', async () => {
        await settleLive();

        hub().emit('queue.updated', [
          makeJob({ customerName: 'Payload Customer', complaint: 'Payload Complaint' }),
        ]);
        render();

        expect(pageText()).not.toContain('Payload Customer');
        expect(pageText()).not.toContain('Payload Complaint');
      });

      it('AQP-83 coalesces a burst of events into one reload', async () => {
        await settleLive();

        for (let i = 0; i < 40; i += 1) {
          hub().emit('queue.updated', []);
          advance(5);
        }
        advance(WINDOW);

        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);
      });

      it('AQP-84 keeps reconciling during sustained events, in bounded steps', async () => {
        await settleLive();

        for (let i = 0; i < 30; i += 1) {
          hub().emit('queue.updated', []);
          advance(100);
          if (last(fake.jobs).observed) {
            respond(last(fake.jobs), [makeJob()]);
            respond(last(fake.bays), [makeBay(BAY_1, 'Bay 1')]);
            respond(last(fake.mechanics), [makeMechanic(1)]);
          }
        }

        const calls = fake.api.getActiveJobs.mock.calls.length;

        expect(calls).toBeGreaterThanOrEqual(6);
        expect(calls).toBeLessThanOrEqual(8);
      });

      it('AQP-85 follows up on an event that arrives during an HTTP reload', async () => {
        await settleLive([makeJob({ customerName: 'Old' })]);

        clickRefresh();
        const first = {
          jobs: last(fake.jobs),
          bays: last(fake.bays),
          mechanics: last(fake.mechanics),
        };

        hub().emit('queue.updated', []);
        respond(first.mechanics, [makeMechanic(1)]);
        respond(first.jobs, [makeJob({ customerName: 'Older Response' })]);
        respond(first.bays, [makeBay(BAY_1, 'Bay 1')]);
        render();

        expect(pageText()).toContain('Older Response');
        expect(one('.queue-sync-stale')).not.toBeNull();

        advance(WINDOW);
        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(2);

        loadBoard([makeJob({ customerName: 'Newest' })]);

        expect(pageText()).toContain('Newest');
        expect(one('.queue-sync-stale')).toBeNull();
      });

      it('AQP-86 reuses single-flight protection for overlapping reloads', async () => {
        await settleLive();

        clickRefresh();
        hub().emit('queue.updated', []);
        advance(WINDOW);
        hub().emit('queue.updated', []);
        advance(WINDOW);

        // One in flight, one queued follow-up, never more.
        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);
        expect(fake.jobs.filter(subject => subject.observed)).toHaveLength(1);
      });

      it('AQP-87 flags the board and reconciles after a reconnect', async () => {
        await settleLive();

        hub().reconnecting();
        hub().reconnected();
        render();

        expect(one('.queue-sync-stale')).not.toBeNull();

        advance(WINDOW);
        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);
      });

      it('AQP-88 does not poll while connected and quiet', async () => {
        await settleLive();

        advance(10 * 60_000);

        expect(fake.api.getActiveJobs).not.toHaveBeenCalled();
      });

      it('AQP-89 handles malformed and partial events without breaking the page', async () => {
        await settleLive([makeJob({ customerName: 'Kept' })]);

        expect(() => {
          hub().emit('job.updated');
          hub().emit('queue.updated', null);
          hub().emit('queue.updated', 'garbage');
          hub().emit('job.updated', { jobId: 12 });
          hub().emit('unknown.event', []);
        }).not.toThrow();
        render();

        expect(pageText()).toContain('Kept');
        expect(text('.queue-connection')).toContain('Live updates connected');

        advance(WINDOW);
        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);
      });
    });

    describe('manual refresh and reconnect', () => {
      it('AQP-90 manual refresh reloads over HTTP while realtime is unavailable', async () => {
        loadBoard([makeJob()]);
        hub().rejectStart(new Error('boom'));
        await settle();
        render();

        clickRefresh();

        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(2);
        expect(hubFactory).toHaveBeenCalledTimes(1);
      });

      it('AQP-91 the reconnect button opens one new connection and keeps the board', async () => {
        loadBoard([makeJob({ customerName: 'Kept' })]);
        hub().rejectStart(new Error('boom'));
        await settle();
        render();

        (one('.queue-reconnect button') as HTMLButtonElement).click();
        render();

        expect(hubFactory).toHaveBeenCalledTimes(2);
        expect(connectionText()).toContain('Connecting to live updates...');
        expect(one('.queue-reconnect')).toBeNull();
        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);
        expect(pageText()).toContain('Kept');
      });

      it('AQP-92 a successful manual reconnect reconciles over HTTP', async () => {
        loadBoard([makeJob()]);
        hub().rejectStart(new Error('boom'));
        await settle();
        render();

        (one('.queue-reconnect button') as HTMLButtonElement).click();
        await connectHub();
        advance(WINDOW);

        expect(connectionText()).toContain('Live updates connected');
        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(2);
      });

      it('AQP-93 offers only read-only controls when realtime is unavailable', async () => {
        loadBoard([makeJob()]);
        hub().close();
        render();

        expect(
          all('button').map(el => el.textContent?.trim()).sort(),
        ).toEqual(['Reconnect live updates', 'Refresh']);
      });

      it('AQP-94 error retry reloads over HTTP and does not touch a healthy connection', async () => {
        await connectHub();
        last(fake.jobs).error(apiError(500, 'SERVER_ERROR'));
        render();

        (one('fx-error-state button') as HTMLButtonElement).click();
        render();

        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(2);
        expect(hubFactory).toHaveBeenCalledTimes(1);
      });
    });

    describe('session security', () => {
      it('AQP-95 stops realtime and clears the board on logout', async () => {
        await settleLive([makeJob({ customerName: 'Secret Customer' })]);
        const connection = hub();

        session.clearSession();
        render();

        expect(connection.stop).toHaveBeenCalled();
        expect(pageText()).not.toContain('Secret Customer');
        expect(text('fx-error-state h2')).toBe('Sign-in required');
        expect(one('.queue-connection')).toBeNull();
      });

      it('AQP-96 stops realtime and clears the board on session expiry, even before a board loaded', async () => {
        await connectHub();
        const connection = hub();

        advance(3_600_000 + 15_000);

        expect(connection.stop).toHaveBeenCalled();
        expect(text('fx-error-state h2')).toBe('Sign-in required');
        expect(one('.queue-connection')).toBeNull();
      });

      it('AQP-97 clears the board and realtime when the same user gets a new session', async () => {
        await settleLive([makeJob({ customerName: 'Secret Customer' })]);
        const connection = hub();

        signIn('manager-001');
        render();

        expect(connection.stop).toHaveBeenCalled();
        expect(pageText()).not.toContain('Secret Customer');
        expect(text('fx-empty-state h2')).toBe('Queue not loaded');
        expect(state().hasBoard()).toBe(false);
        expect(state().mechanics()).toBeNull();
        expect(state().lastSyncedAt()).toBeNull();
        expect(hubFactory).toHaveBeenCalledTimes(1);
      });

      it('AQP-98 clears the board and realtime when another user signs in', async () => {
        await settleLive([makeJob({ customerName: 'Secret Customer' })]);
        const connection = hub();

        signIn('manager-002');
        render();

        expect(connection.stop).toHaveBeenCalled();
        expect(pageText()).not.toContain('Secret Customer');
        expect(text('fx-empty-state h2')).toBe('Queue not loaded');
      });

      it('AQP-99 reloads and reconnects for the replacement session on manual refresh', async () => {
        await settleLive([makeJob({ customerName: 'Old Customer' })]);

        signIn('manager-001');
        render();
        (one('fx-empty-state button') as HTMLButtonElement).click();
        render();

        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);
        expect(hubFactory).toHaveBeenCalledTimes(2);

        loadBoard([makeJob({ customerName: 'New Customer' })]);

        expect(pageText()).toContain('New Customer');
        expect(pageText()).not.toContain('Old Customer');
      });

      it('AQP-100 does not run a scheduled reload after the session changed', async () => {
        await settleLive();

        hub().emit('queue.updated', []);
        signIn('manager-001');
        render();
        advance(WINDOW * 3);

        expect(fake.api.getActiveJobs).not.toHaveBeenCalled();
      });

      it('AQP-101 ignores hub callbacks of a replaced session', async () => {
        await settleLive([makeJob({ customerName: 'Secret Customer' })]);
        const connection = hub();

        signIn('manager-002');
        render();
        connection.emit('queue.updated', []);
        connection.reconnecting();
        connection.reconnected();
        advance(WINDOW * 3);

        expect(fake.api.getActiveJobs).not.toHaveBeenCalled();
        expect(pageText()).not.toContain('Secret Customer');
        expect(one('.queue-connection')).toBeNull();
      });

      it('AQP-102 ignores late HTTP responses after the session was replaced', async () => {
        await settleLive();
        clickRefresh();
        const jobs = last(fake.jobs);
        const bays = last(fake.bays);

        signIn('manager-001');
        respond(jobs, [makeJob({ customerName: 'Late Customer' })]);
        respond(bays, [makeBay(BAY_1, 'Bay 1')]);
        render();

        expect(pageText()).not.toContain('Late Customer');
        expect(state().hasBoard()).toBe(false);
      });

      it('AQP-103 makes no request or connection after logout', async () => {
        await settleLive();
        session.clearSession();
        render();

        advance(10 * 60_000);

        expect(fake.api.getActiveJobs).not.toHaveBeenCalled();
        expect(hubFactory).toHaveBeenCalledTimes(1);
      });
    });

    describe('authorization failures', () => {
      it('AQP-104 stops realtime on a required 401', async () => {
        await settleLive();
        const connection = hub();

        clickRefresh();
        last(fake.jobs).error(apiError(401, 'UNAUTHORIZED'));
        render();

        expect(connection.stop).toHaveBeenCalled();
        expect(text('fx-error-state h2')).toBe('Sign-in required');
        expect(one('.queue-connection')).toBeNull();
      });

      it('AQP-105 stops realtime on a required 403', async () => {
        await settleLive();
        const connection = hub();

        clickRefresh();
        last(fake.bays).error(apiError(403, 'FORBIDDEN'));
        render();

        expect(connection.stop).toHaveBeenCalled();
        expect(text('fx-error-state h2')).toBe('Access denied');
        expect(one('.queue-connection')).toBeNull();
      });

      it('AQP-106 stops realtime and clears protected data on a roster 401', async () => {
        await settleLive([makeJob({ customerName: 'Secret Customer' })]);
        const connection = hub();

        clickRefresh();
        respond(last(fake.jobs), [makeJob({ customerName: 'Secret Customer' })]);
        respond(last(fake.bays), [makeBay(BAY_1, 'Bay 1')]);
        last(fake.mechanics).error(apiError(401, 'UNAUTHORIZED'));
        render();

        expect(connection.stop).toHaveBeenCalled();
        expect(pageText()).not.toContain('Secret Customer');
        expect(text('fx-error-state h2')).toBe('Sign-in required');
      });

      it('AQP-107 keeps the board and realtime on an optional roster 403', async () => {
        await settleLive([makeJob({ customerName: 'Kept' })]);
        const connection = hub();

        clickRefresh();
        respond(last(fake.jobs), [makeJob({ customerName: 'Kept' })]);
        respond(last(fake.bays), [makeBay(BAY_1, 'Bay 1')]);
        last(fake.mechanics).error(apiError(403, 'FORBIDDEN'));
        render();

        expect(connection.stop).not.toHaveBeenCalled();
        expect(pageText()).toContain('Kept');
        expect(one('.queue-roster-alert')).not.toBeNull();
        expect(connectionText()).toContain('Live updates connected');
      });

      it('AQP-108 ignores events and pending reloads after an authorization failure', async () => {
        await settleLive();

        hub().emit('queue.updated', []);
        clickRefresh();
        last(fake.jobs).error(apiError(401, 'UNAUTHORIZED'));
        render();
        fake.api.getActiveJobs.mockClear();

        hub().emit('queue.updated', []);
        advance(WINDOW * 3);

        expect(fake.api.getActiveJobs).not.toHaveBeenCalled();
      });

      it('AQP-109 shows no reconnect action after an authorization failure', async () => {
        await settleLive();

        clickRefresh();
        last(fake.jobs).error(apiError(403, 'FORBIDDEN'));
        render();

        expect(one('.queue-reconnect')).toBeNull();
        expect(hubFactory).toHaveBeenCalledTimes(1);
      });
    });

    describe('navigation and destruction', () => {
      it('AQP-110 closes the connection and cancels everything on destroy', async () => {
        await settleLive();
        const connection = hub();
        hub().emit('queue.updated', []);
        clickRefresh();
        const pending = last(fake.jobs);

        fixture.destroy();

        expect(connection.stop).toHaveBeenCalled();
        expect(pending.observed).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
      });

      it('AQP-111 removes the hub handlers on destroy', async () => {
        await settleLive();
        const connection = hub();

        fixture.destroy();

        expect(connection.listeners.get('queue.updated')?.size ?? 0).toBe(0);
        expect(connection.listeners.get('job.updated')?.size ?? 0).toBe(0);
      });

      it('AQP-112 creates no connection or request after destroy', async () => {
        await settleLive();
        const connection = hub();
        fixture.destroy();

        connection.emit('queue.updated', []);
        connection.reconnected();
        advance(10 * 60_000);

        expect(fake.api.getActiveJobs).not.toHaveBeenCalled();
        expect(hubFactory).toHaveBeenCalledTimes(1);
      });

      it('AQP-113 does not connect when destroyed before the connection opened', () => {
        fixture.destroy();

        expect(hub().stop).toHaveBeenCalled();
        advance(10 * 60_000);

        expect(hubFactory).toHaveBeenCalledTimes(1);
        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);
      });

      it('AQP-114 does not restore a connection that finishes opening after destroy', async () => {
        const connection = hub();
        fixture.destroy();

        connection.resolveStart();
        await settle();
        advance(WINDOW * 3);

        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
      });

      it('AQP-115 a new page instance starts from scratch', async () => {
        await settleLive([makeJob({ customerName: 'First Visit' })]);
        fixture.destroy();

        fixture = TestBed.createComponent(AdaptiveQueuePage);
        render();

        expect(hubFactory).toHaveBeenCalledTimes(2);
        expect(pageText()).not.toContain('First Visit');
        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);
      });
    });

    describe('safety', () => {
      it('AQP-116 never reads, shows or stores the token or hub URL', async () => {
        const token = vi.spyOn(session, 'getAccessToken');
        const setItem = vi.spyOn(Storage.prototype, 'setItem');

        await settleLive();
        hub().reconnecting();
        hub().close();
        render();

        expect(token).not.toHaveBeenCalled();
        expect(setItem).not.toHaveBeenCalled();
        expect(pageText()).not.toContain('test-access-token');
        expect(pageText()).not.toContain('https://');
        expect(pageText()).not.toContain('hubs/fixora');
      });

      it('AQP-117 offers no mutation controls alongside the connection status', async () => {
        await settleLive([
          makeJob({ status: 'InProgress', bayId: BAY_1, bayName: 'Bay 1' }),
        ]);

        expect(all('button').map(el => el.textContent?.trim()))
          .toEqual(['Refresh']);
        expect(all('input, select, textarea')).toHaveLength(0);
      });
    });
  });

  /**
   * K14/K15: the full frontend flow with mocked HTTP and SignalR.
   * Backend event -> bounded coalescing -> authoritative HTTP
   * reconciliation -> updated ETA and capacity presentation. The
   * events carry deliberately misleading payloads: nothing from them
   * may ever reach the page.
   */
  describe('backend-reconciled ETA and capacity (K14/K15)', () => {
    const BAY_4 = 'bay-0004';
    const OLD_ETA = '2026-11-27T08:30:00Z'; // 14:00 in Asia/Colombo
    const NEW_ETA = '2026-11-27T09:15:00.1234567'; // SQL Server form, no offset

    const THREE_BAYS = [
      makeBay(BAY_1, 'Bay 1'),
      makeBay(BAY_2, 'Bay 2'),
      makeBay(BAY_4, 'Bay 4'),
    ];

    async function goLive(
      jobs: readonly JobSummaryDto[],
      bays: readonly BayDto[] = [makeBay(BAY_1, 'Bay 1')],
      roster: readonly MechanicRosterDto[] = [makeMechanic(1)],
    ): Promise<void> {
      loadBoard(jobs, bays, roster);
      await connectHub();
      advance(WINDOW);
      loadBoard(jobs, bays, roster);
      fake.api.getActiveJobs.mockClear();
      fake.api.getBays.mockClear();
      fake.api.getMechanics.mockClear();
    }

    /** One backend change: event, bounded window, then the HTTP answer. */
    function serverChange(
      jobs: readonly JobSummaryDto[],
      bays: readonly BayDto[] = [makeBay(BAY_1, 'Bay 1')],
      roster: readonly MechanicRosterDto[] = [makeMechanic(1)],
    ): void {
      hub().emit('queue.updated', [{ misleading: 'payload' }]);
      advance(WINDOW);
      loadBoard(jobs, bays, roster);
    }

    function card(scope: string, number: string): HTMLElement | undefined {
      return all(`${scope} .job-card`).find(
        element =>
          element.querySelector('.job-card-number')?.textContent?.trim()
          === number,
      );
    }

    function etaOf(scope: string, number: string): string {
      return (
        card(scope, number)
          ?.querySelector('.job-card-eta')
          ?.textContent?.replace(/\s+/g, ' ')
          .trim() ?? ''
      );
    }

    function positionOf(scope: string, number: string): string {
      return (
        card(scope, number)
          ?.querySelector('.job-card-position')
          ?.textContent?.replace(/\s+/g, ' ')
          .trim() ?? ''
      );
    }

    function advisories(): string {
      return text('.queue-advisories');
    }

    describe('ETA', () => {
      it('AQP-118 shows a changed ETA only after the authoritative reload, in event order', async () => {
        await goLive([
          makeJob({ number: 'W-1', queuePosition: 1, etaAt: OLD_ETA }),
        ]);
        const waiting = '.queue-waiting-list';

        // The backend publishes job.updated BEFORE it recalculates.
        hub().emit('job.updated', {
          id: 'x', number: 'W-1', etaAt: '2026-11-27T11:00:00Z',
        });
        advance(WINDOW);
        // queue.updated follows while the first reload is in flight.
        hub().emit('queue.updated', [{ etaAt: '2026-11-27T11:00:00Z' }]);

        // The reload that raced the recalculation still has the old ETA.
        respond(last(fake.mechanics), [makeMechanic(1)]);
        respond(last(fake.jobs), [
          makeJob({ number: 'W-1', queuePosition: 1, etaAt: OLD_ETA }),
        ]);
        respond(last(fake.bays), [makeBay(BAY_1, 'Bay 1')]);
        render();

        expect(etaOf(waiting, 'W-1')).toBe('27 Nov 2026, 14:00');
        expect(one('.queue-sync-stale')).not.toBeNull();

        // The follow-up reload carries the recalculated ETA.
        advance(WINDOW);
        loadBoard([
          makeJob({ number: 'W-1', queuePosition: 1, etaAt: NEW_ETA }),
        ]);

        expect(etaOf(waiting, 'W-1')).toBe('27 Nov 2026, 14:45');
        expect(positionOf(waiting, 'W-1')).toBe('Queue #1');
        expect(one('.queue-sync-stale')).toBeNull();
        expect(pageText()).not.toContain('16:30'); // payload ETA, never shown
      });

      it('AQP-119 reorders on a position change while each ETA stays as the backend sent it', async () => {
        const etaFirst = '2026-11-27T08:30:00Z';
        const etaSecond = '2026-11-27T09:30:00Z';
        await goLive([
          makeJob({ number: 'W-1', queuePosition: 1, etaAt: etaFirst }),
          makeJob({ number: 'W-2', queuePosition: 2, etaAt: etaSecond }),
        ]);
        const waiting = '.queue-waiting-list';

        serverChange([
          makeJob({ number: 'W-1', queuePosition: 2, etaAt: etaFirst }),
          makeJob({ number: 'W-2', queuePosition: 1, etaAt: etaSecond }),
        ]);

        expect(numbers(waiting)).toEqual(['W-2', 'W-1']);
        expect(positionOf(waiting, 'W-2')).toBe('Queue #1');
        expect(positionOf(waiting, 'W-1')).toBe('Queue #2');
        expect(etaOf(waiting, 'W-1')).toBe('27 Nov 2026, 14:00');
        expect(etaOf(waiting, 'W-2')).toBe('27 Nov 2026, 15:00');
      });

      it('AQP-120 moves a job from waiting to active-phase without inventing a position', async () => {
        await goLive([
          makeJob({
            number: 'J-1', queuePosition: 1, etaAt: OLD_ETA,
            bayId: BAY_1, bayName: 'Bay 1',
          }),
        ]);

        serverChange([
          makeJob({
            number: 'J-1', status: 'InProgress', queuePosition: 0,
            etaAt: NEW_ETA, bayId: BAY_1, bayName: 'Bay 1',
          }),
        ]);

        expect(kpi('waiting')).toBe('0');
        expect(kpi('active-phase')).toBe('1');
        expect(one('.queue-waiting-empty')).not.toBeNull();
        expect(numbers('.queue-bay-active')).toEqual(['J-1']);
        expect(positionOf('.queue-bay-active', 'J-1')).toBe('');
        expect(etaOf('.queue-bay-active', 'J-1')).toBe('27 Nov 2026, 14:45');
        expect(text('.queue-bay-active .job-card-field:last-child dt'))
          .toBe('Indicative completion');
      });

      it('AQP-121 removes a completed job and shows the recalculated ETA of the job behind it', async () => {
        await goLive([
          makeJob({
            number: 'A-1', status: 'InProgress', queuePosition: 0,
            etaAt: OLD_ETA, bayId: BAY_1, bayName: 'Bay 1',
          }),
          makeJob({
            number: 'W-1', queuePosition: 1, etaAt: '2026-11-27T09:30:00Z',
          }),
        ]);
        expect(etaOf('.queue-waiting-list', 'W-1')).toBe('27 Nov 2026, 15:00');

        // The mechanic completes A-1; the backend drops it from the
        // active list and moves W-1 up.
        serverChange([
          makeJob({
            number: 'W-1', queuePosition: 1, etaAt: '2026-11-27T08:45:00Z',
          }),
        ]);

        expect(pageText()).not.toContain('A-1');
        expect(kpi('active-phase')).toBe('0');
        expect(text('.queue-bay-active')).toContain(
          'No active-phase job is assigned to this bay.',
        );
        expect(etaOf('.queue-waiting-list', 'W-1')).toBe('27 Nov 2026, 14:15');
      });

      it('AQP-122 keeps the last authorized ETAs with a warning when a reconciliation fails, then recovers', async () => {
        await goLive([
          makeJob({ number: 'W-1', queuePosition: 1, etaAt: OLD_ETA }),
        ]);
        const waiting = '.queue-waiting-list';

        hub().emit('queue.updated', []);
        advance(WINDOW);
        last(fake.jobs).error(apiError(500, 'SERVER_ERROR'));
        render();

        expect(etaOf(waiting, 'W-1')).toBe('27 Nov 2026, 14:00');
        expect(text('.queue-refresh-alert')).toContain(
          'Showing the last data received.',
        );
        expect(one('.queue-sync-stale')).not.toBeNull();
        expect(pageText()).not.toContain(SENSITIVE);
        expect(one('fx-error-state')).toBeNull();

        // The next event reconciles successfully.
        serverChange([
          makeJob({ number: 'W-1', queuePosition: 1, etaAt: NEW_ETA }),
        ]);

        expect(etaOf(waiting, 'W-1')).toBe('27 Nov 2026, 14:45');
        expect(one('.queue-refresh-alert')).toBeNull();
        expect(one('.queue-sync-stale')).toBeNull();
      });

      it('AQP-123 shows the reconciled ETA after a reconnect without any event', async () => {
        await goLive([
          makeJob({ number: 'W-1', queuePosition: 1, etaAt: OLD_ETA }),
        ]);

        hub().reconnecting();
        hub().reconnected();
        render();

        expect(one('.queue-sync-stale')).not.toBeNull();
        expect(etaOf('.queue-waiting-list', 'W-1')).toBe('27 Nov 2026, 14:00');

        advance(WINDOW);
        loadBoard([
          makeJob({ number: 'W-1', queuePosition: 1, etaAt: NEW_ETA }),
        ]);

        expect(etaOf('.queue-waiting-list', 'W-1')).toBe('27 Nov 2026, 14:45');
        expect(one('.queue-sync-stale')).toBeNull();
      });
    });

    describe('capacity', () => {
      it('AQP-124 reflects a bay deactivation and reactivation after reconciliation', async () => {
        const job = makeJob({
          number: 'J-1', status: 'InProgress', queuePosition: 0,
          bayId: BAY_2, bayName: 'Bay 2',
        });
        await goLive([job], THREE_BAYS);
        expect(kpi('bays')).toBe('3');
        expect(one('.queue-inactive-bay')).toBeNull();

        serverChange(
          [job],
          [makeBay(BAY_1, 'Bay 1'), makeBay(BAY_2, 'Bay 2', false), makeBay(BAY_4, 'Bay 4')],
        );

        expect(kpi('bays')).toBe('2');
        expect(all('.queue-bay')).toHaveLength(2);
        expect(numbers('.queue-inactive-bay')).toEqual(['J-1']);
        expect(advisories()).toContain('Jobs referencing inactive bays');

        serverChange([job], THREE_BAYS);

        expect(kpi('bays')).toBe('3');
        expect(one('.queue-inactive-bay')).toBeNull();
        expect(one('.queue-advisories')).toBeNull();
      });

      it('AQP-125 moves a reassigned job to its new bay and mechanic', async () => {
        await goLive(
          [
            makeJob({
              number: 'J-1', status: 'InProgress', queuePosition: 0,
              bayId: BAY_1, bayName: 'Bay 1',
              mechanicId: 'mechanic-1', mechanicName: 'Kasun',
            }),
          ],
          THREE_BAYS,
        );
        const bayCards = (index: number): string[] =>
          Array.from(
            all('.queue-bay')[index].querySelectorAll('.queue-bay-active .job-card-number'),
          ).map(element => element.textContent?.trim() ?? '');

        expect(bayCards(0)).toEqual(['J-1']);

        serverChange(
          [
            makeJob({
              number: 'J-1', status: 'InProgress', queuePosition: 0,
              bayId: BAY_2, bayName: 'Bay 2',
              mechanicId: 'mechanic-2', mechanicName: 'Nimal',
            }),
          ],
          THREE_BAYS,
        );

        expect(bayCards(0)).toEqual([]);
        expect(bayCards(1)).toEqual(['J-1']);
        expect(text('.queue-bay-active .job-card-mechanic')).toBe('Nimal');

        serverChange(
          [
            makeJob({
              number: 'J-1', status: 'InProgress', queuePosition: 0,
              bayId: null, mechanicId: 'mechanic-2', mechanicName: 'Nimal',
            }),
          ],
          THREE_BAYS,
        );

        expect(bayCards(1)).toEqual([]);
        expect(numbers('.queue-unassigned')).toEqual(['J-1']);
      });

      it('AQP-126 shows shared-assignment advisories while they exist and clears them afterwards', async () => {
        const waiting = [
          makeJob({ number: 'W-1', queuePosition: 1, bayId: BAY_2, bayName: 'Bay 2' }),
          makeJob({ number: 'W-2', queuePosition: 2, bayId: BAY_2, bayName: 'Bay 2' }),
        ];
        await goLive(
          [
            makeJob({
              number: 'A-1', status: 'InProgress', queuePosition: 0,
              bayId: BAY_1, bayName: 'Bay 1',
              mechanicId: 'mechanic-1', mechanicName: 'Kasun',
            }),
            makeJob({
              number: 'A-2', status: 'Paused', queuePosition: 0,
              bayId: BAY_1, bayName: 'Bay 1',
              mechanicId: 'mechanic-1', mechanicName: 'Kasun',
            }),
            ...waiting,
          ],
          THREE_BAYS,
        );

        expect(advisories()).toContain('Shared bay assignments');
        expect(advisories()).toContain('Shared mechanic assignments');
        // Only Bay 1 is shared by active-phase jobs: the two waiting
        // jobs pre-assigned to Bay 2 are no conflict.
        expect(all('.queue-shared-bay')).toHaveLength(1);
        expect(text('.queue-shared-bay')).toContain('Bay 1');

        serverChange(
          [
            makeJob({
              number: 'A-1', status: 'InProgress', queuePosition: 0,
              bayId: BAY_1, bayName: 'Bay 1',
              mechanicId: 'mechanic-1', mechanicName: 'Kasun',
            }),
            makeJob({
              number: 'A-2', status: 'Paused', queuePosition: 0,
              bayId: BAY_2, bayName: 'Bay 2',
              mechanicId: 'mechanic-2', mechanicName: 'Nimal',
            }),
            ...waiting,
          ],
          THREE_BAYS,
        );

        // A-2 now shares Bay 2 only with waiting jobs.
        expect(one('.queue-advisories')).toBeNull();
        expect(one('.queue-bay-advisory')).toBeNull();
      });

      it('AQP-127 shows zero-bay and incomplete-list warnings only while they apply', async () => {
        await goLive([makeJob({ number: 'W-1', queuePosition: 1 })]);
        expect(one('.queue-advisories')).toBeNull();

        serverChange([makeJob({ number: 'W-1', queuePosition: 1 })], []);
        expect(advisories()).toContain('No active bays configured');

        serverChange(
          Array.from({ length: 200 }, (_, index) =>
            makeJob({ queuePosition: index + 1 }),
          ),
        );
        expect(advisories()).toContain('Job list may be incomplete');
        expect(advisories()).not.toContain('No active bays configured');

        serverChange([makeJob({ number: 'W-1', queuePosition: 1 })]);
        expect(one('.queue-advisories')).toBeNull();
      });

      it('AQP-128 treats full capacity as advisory information, not an invalid queue', async () => {
        await goLive([
          makeJob({
            number: 'A-1', status: 'InProgress', queuePosition: 0,
            bayId: BAY_1, bayName: 'Bay 1',
          }),
        ]);

        // One active-phase job, one active bay: capacity is full.
        expect(advisories()).toContain('Capacity overview');
        expect(text('.queue-advisory')).toContain('This is advisory');
        expect(one('fx-error-state')).toBeNull();
        expect(numbers('.queue-bay-active')).toEqual(['A-1']);

        // The job completes: the advisory goes away with the data.
        serverChange([]);

        expect(one('.queue-advisories')).toBeNull();
      });
    });

    describe('session safety during reconciliation', () => {
      it('AQP-129 never shows data of a reconciliation that is in flight at logout', async () => {
        await goLive([makeJob({ number: 'W-1', queuePosition: 1 })]);
        const connection = hub();

        hub().emit('queue.updated', []);
        advance(WINDOW);
        const jobs = last(fake.jobs);
        const bays = last(fake.bays);
        const roster = last(fake.mechanics);

        session.clearSession();
        render();
        respond(roster, [makeMechanic(1)]);
        respond(jobs, [makeJob({ number: 'LATE-1', customerName: 'Late Customer' })]);
        respond(bays, [makeBay(BAY_1, 'Bay 1')]);
        render();

        expect(pageText()).not.toContain('Late Customer');
        expect(pageText()).not.toContain('LATE-1');
        expect(text('fx-error-state h2')).toBe('Sign-in required');
        expect(connection.stop).toHaveBeenCalled();

        fake.api.getActiveJobs.mockClear();
        connection.emit('queue.updated', []);
        advance(WINDOW * 3);

        expect(fake.api.getActiveJobs).not.toHaveBeenCalled();
      });
    });
  });
});
