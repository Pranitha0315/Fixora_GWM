import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Subject } from 'rxjs';

import { SessionService } from '../../../core/auth/session.service';
import { ApiError } from '../../../core/models/api-error.model';
import type { ApiErrorCode } from '../../../core/models/api-error.model';
import type { AuthSession } from '../../../core/models/auth-session.model';

import type {
  BayDto,
  JobSummaryDto,
  MechanicRosterDto,
} from '../../bookings/models/booking-support.model';

import { resolveAdaptiveQueueError } from '../utils/adaptive-queue-error.mapper';
import { buildAdaptiveQueueSnapshot } from '../utils/adaptive-queue.mapper';
import { AdaptiveQueueResponseError } from '../utils/adaptive-queue.validator';

import { AdaptiveQueueApiService } from './adaptive-queue-api.service';

import {
  ADAPTIVE_QUEUE_STALE_AFTER_MS,
  ADAPTIVE_QUEUE_STALE_CHECK_INTERVAL_MS,
  AdaptiveQueueStateService,
} from './adaptive-queue-state.service';

const START = new Date('2026-11-27T08:00:00Z');
const SENSITIVE = 'SqlException: password=hunter2 at Server.Internal';

const BAY_1 = uuid(101);
const BAY_2 = uuid(102);

function uuid(value: number): string {
  return `10000000-0000-4000-8000-${value
    .toString()
    .padStart(12, '0')}`;
}

let jobCounter = 0;

function makeJob(
  overrides: Partial<JobSummaryDto> = {},
): JobSummaryDto {
  jobCounter += 1;

  return {
    id: uuid(jobCounter),
    number: `JC-${jobCounter}`,
    customerId: uuid(500),
    customerName: 'Test Customer',
    vehicleId: uuid(501),
    vehicleLabel: 'Toyota Aqua',
    mechanicId: null,
    mechanicName: null,
    bayId: null,
    bayName: null,
    status: 'Open',
    priority: 0,
    queuePosition: 1,
    etaAt: null,
    estimatedMinutes: 60,
    elapsedMinutes: 0,
    createdAt: '2026-11-27T04:00:00Z',
    startedAt: null,
    completedAt: null,
    complaint: null,
    managerNote: null,
    ...overrides,
  };
}

function makeBay(
  id: string,
  name: string,
  active = true,
): BayDto {
  return { id, name, active };
}

function makeMechanic(
  value: number,
  overrides: Partial<MechanicRosterDto> = {},
): MechanicRosterDto {
  return {
    id: uuid(200 + value),
    name: `Mechanic ${value}`,
    phone: '0770000000',
    employeeCode: `EMP-${value}`,
    onDuty: true,
    activeJobs: 0,
    ...overrides,
  };
}

function makeSession(
  userId = 'manager-001',
  lifetimeMs = 3_600_000,
): AuthSession {
  return {
    accessToken: 'test-access-token',
    expiresAt: Date.now() + lifetimeMs,
    user: {
      id: userId,
      displayName: 'Test Manager',
      email: 'manager@example.test',
      roles: ['Manager'],
    },
  };
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }

    Object.freeze(value);
  }

  return value;
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

function apiError(
  status: number,
  code: ApiErrorCode,
): ApiError {
  return new ApiError(status, code, SENSITIVE);
}

describe('AdaptiveQueueStateService', () => {
  let service: AdaptiveQueueStateService;
  let fake: ReturnType<typeof createFakeApi>;
  let session: SessionService;
  let timerBaseline = 0;

  /** Timers owned by the service (excludes framework timers). */
  function serviceTimers(): number {
    return vi.getTimerCount() - timerBaseline;
  }

  function signIn(userId?: string, lifetimeMs?: number): void {
    session.setSession(makeSession(userId, lifetimeMs));
  }

  function loadBoard(
    jobs: readonly JobSummaryDto[] = [],
    bays: readonly BayDto[] = [makeBay(BAY_1, 'Bay 1')],
  ): void {
    service.refresh();
    respond(last(fake.jobs), jobs);
    respond(last(fake.bays), bays);
  }

  function failRequired(
    error: unknown,
    which: 'jobs' | 'bays' = 'jobs',
  ): void {
    service.refresh();

    if (which === 'jobs') {
      last(fake.jobs).error(error);
    } else {
      last(fake.bays).error(error);
    }
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);

    jobCounter = 0;
    fake = createFakeApi();

    TestBed.configureTestingModule({
      providers: [
        AdaptiveQueueStateService,
        { provide: AdaptiveQueueApiService, useValue: fake.api },
      ],
    });

    session = TestBed.inject(SessionService);
    signIn();

    service = TestBed.inject(AdaptiveQueueStateService);

    // Run the service's initial session effect so framework
    // scheduling timers do not count as service timers.
    TestBed.tick();
    timerBaseline = vi.getTimerCount();
  });

  afterEach(() => {
    service.ngOnDestroy();
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('ASS-01 does not call the API on construction', () => {
      expect(fake.api.getActiveJobs).not.toHaveBeenCalled();
      expect(fake.api.getBays).not.toHaveBeenCalled();
      expect(fake.api.getMechanics).not.toHaveBeenCalled();
    });

    it('ASS-02 starts idle with no data, errors or timestamps', () => {
      expect(service.jobs()).toBeNull();
      expect(service.bays()).toBeNull();
      expect(service.mechanics()).toBeNull();
      expect(service.snapshot()).toBeNull();
      expect(service.capacity()).toBeNull();
      expect(service.jobLimit()).toBeNull();
      expect(service.hasBoard()).toBe(false);
      expect(service.waitingJobs()).toEqual([]);
      expect(service.activePhaseJobs()).toEqual([]);
      expect(service.unrecognizedStatusJobs()).toEqual([]);
      expect(service.bayColumns()).toEqual([]);
      expect(service.unassignedJobs()).toEqual([]);
      expect(service.inactiveBayAssignments()).toEqual([]);
      expect(service.unknownBayAssignments()).toEqual([]);
      expect(service.duplicateBayAssignments()).toEqual([]);
      expect(service.duplicateMechanicAssignments()).toEqual([]);
      expect(service.warnings()).toEqual([]);
      expect(service.isLoading()).toBe(false);
      expect(service.isInitialLoading()).toBe(false);
      expect(service.isRefreshing()).toBe(false);
      expect(service.isEmpty()).toBe(false);
      expect(service.initialLoadError()).toBeNull();
      expect(service.refreshError()).toBeNull();
      expect(service.mechanicsError()).toBeNull();
      expect(service.mechanicsStatus()).toBe('idle');
      expect(service.lastSyncedAt()).toBeNull();
      expect(service.isStale()).toBe(false);
      expect(service.staleReason()).toBeNull();
      expect(service.authFailure()).toBeNull();
      expect(service.viewState()).toBe('idle');
    });
  });

  describe('initial load', () => {
    it('ASS-03 requests jobs, bays and mechanics once and shows loading', () => {
      service.refresh();

      expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);
      expect(fake.api.getBays).toHaveBeenCalledTimes(1);
      expect(fake.api.getMechanics).toHaveBeenCalledTimes(1);
      expect(service.isLoading()).toBe(true);
      expect(service.isInitialLoading()).toBe(true);
      expect(service.isRefreshing()).toBe(false);
      expect(service.viewState()).toBe('loading');
    });

    it('ASS-04 publishes nothing while bays are still pending', () => {
      service.refresh();
      respond(last(fake.jobs), [makeJob()]);

      expect(service.jobs()).toBeNull();
      expect(service.bays()).toBeNull();
      expect(service.snapshot()).toBeNull();
      expect(service.viewState()).toBe('loading');
      expect(service.lastSyncedAt()).toBeNull();
    });

    it('ASS-05 publishes nothing while jobs are still pending', () => {
      service.refresh();
      respond(last(fake.bays), [makeBay(BAY_1, 'Bay 1')]);

      expect(service.jobs()).toBeNull();
      expect(service.bays()).toBeNull();
      expect(service.viewState()).toBe('loading');
      expect(service.lastSyncedAt()).toBeNull();
    });

    it('ASS-06 publishes jobs and bays together once both succeed', () => {
      const jobs = [makeJob({ queuePosition: 1 })];
      const bays = [makeBay(BAY_1, 'Bay 1')];

      loadBoard(jobs, bays);

      expect(service.jobs()).toBe(jobs);
      expect(service.bays()).toBe(bays);
      expect(service.hasBoard()).toBe(true);
      expect(service.isLoading()).toBe(false);
      expect(service.isInitialLoading()).toBe(false);
      expect(service.viewState()).toBe('ready');
      expect(service.initialLoadError()).toBeNull();
      expect(service.lastSyncedAt()).toEqual(START);
    });

    it('ASS-07 exposes the K09 mapper output unchanged', () => {
      const jobs = [
        makeJob({ status: 'Open', queuePosition: 2, bayId: BAY_1 }),
        makeJob({ status: 'InProgress', queuePosition: 0, bayId: BAY_1 }),
        makeJob({ status: 'Paused', queuePosition: 0, bayId: BAY_1 }),
        makeJob({ status: 'Open', queuePosition: 1, bayId: null }),
      ];
      const bays = [makeBay(BAY_1, 'Bay 1'), makeBay(BAY_2, 'Bay 2', false)];

      loadBoard(jobs, bays);

      const expected = buildAdaptiveQueueSnapshot(jobs, bays);

      expect(service.snapshot()).toEqual(expected);
      expect(service.waitingJobs()).toEqual(expected.waitingJobs);
      expect(service.activePhaseJobs()).toEqual(expected.activePhaseJobs);
      expect(service.unrecognizedStatusJobs())
        .toEqual(expected.unrecognizedStatusJobs);
      expect(service.bayColumns()).toEqual(expected.bayColumns);
      expect(service.unassignedJobs()).toEqual(expected.unassignedJobs);
      expect(service.inactiveBayAssignments())
        .toEqual(expected.inactiveBayAssignments);
      expect(service.unknownBayAssignments())
        .toEqual(expected.unknownBayAssignments);
      expect(service.duplicateBayAssignments())
        .toEqual(expected.duplicateBayAssignments);
      expect(service.duplicateMechanicAssignments())
        .toEqual(expected.duplicateMechanicAssignments);
      expect(service.capacity()).toEqual(expected.capacity);
      expect(service.jobLimit()).toEqual(expected.jobLimit);
      expect(service.warnings()).toEqual(expected.warnings);
      expect(service.duplicateBayAssignments()).toHaveLength(1);
    });

    it('ASS-08 keeps backend queue positions, ETA and job identity', () => {
      const third = makeJob({ queuePosition: 3, etaAt: '2026-11-27T10:00:00Z' });
      const first = makeJob({ queuePosition: 1, etaAt: null });
      const second = makeJob({ queuePosition: 2, etaAt: '2026-11-27T09:00:00Z' });

      loadBoard([third, first, second]);

      const waiting = service.waitingJobs();

      expect(waiting.map(item => item.job.queuePosition))
        .toEqual([1, 2, 3]);
      expect(waiting[0].job).toBe(first);
      expect(waiting[1].job.etaAt).toBe('2026-11-27T09:00:00Z');
      expect(waiting[2].job.etaAt).toBe('2026-11-27T10:00:00Z');
      expect(waiting[0].job.etaAt).toBeNull();
    });

    it('ASS-09 treats a successful empty job list as empty, not an error', () => {
      loadBoard([], [makeBay(BAY_1, 'Bay 1')]);

      expect(service.viewState()).toBe('empty');
      expect(service.isEmpty()).toBe(true);
      expect(service.hasBoard()).toBe(true);
      expect(service.initialLoadError()).toBeNull();
      expect(service.refreshError()).toBeNull();
      expect(service.lastSyncedAt()).toEqual(START);
      expect(service.bayColumns()).toHaveLength(1);
    });

    it('ASS-10 treats zero active bays as a valid board with an advisory', () => {
      loadBoard([makeJob({ status: 'Open' })], []);

      expect(service.viewState()).toBe('ready');
      expect(service.initialLoadError()).toBeNull();
      expect(service.capacity()?.saturation).toBe('no-active-bays');
      expect(service.warnings().map(warning => warning.code))
        .toContain('no-active-bays');
      expect(service.waitingJobs()).toHaveLength(1);
    });

    it('ASS-11 treats no jobs and no bays as an empty board', () => {
      loadBoard([], []);

      expect(service.viewState()).toBe('empty');
      expect(service.initialLoadError()).toBeNull();
    });

    it('ASS-12 treats a list with only terminal jobs as empty', () => {
      loadBoard([
        makeJob({ status: 'Completed' }),
        makeJob({ status: 'Closed' }),
      ]);

      expect(service.viewState()).toBe('empty');
      expect(service.capacity()?.excludedTerminalJobCount).toBe(2);
    });
  });

  describe('required request failures', () => {
    it('ASS-13 reports a jobs failure without publishing a board', () => {
      service.refresh();
      respond(last(fake.bays), [makeBay(BAY_1, 'Bay 1')]);
      last(fake.jobs).error(apiError(500, 'SERVER_ERROR'));

      expect(service.viewState()).toBe('error');
      expect(service.initialLoadError()?.kind).toBe('server-failure');
      expect(service.refreshError()).toBeNull();
      expect(service.jobs()).toBeNull();
      expect(service.bays()).toBeNull();
      expect(service.lastSyncedAt()).toBeNull();
      expect(service.isLoading()).toBe(false);
    });

    it('ASS-14 reports a bays failure without a partial board', () => {
      service.refresh();
      respond(last(fake.jobs), [makeJob()]);
      last(fake.bays).error(apiError(500, 'SERVER_ERROR'));

      expect(service.viewState()).toBe('error');
      expect(service.jobs()).toBeNull();
      expect(service.waitingJobs()).toEqual([]);
      expect(service.snapshot()).toBeNull();
      expect(service.lastSyncedAt()).toBeNull();
    });

    it('ASS-15 cancels the other pending required request on failure', () => {
      service.refresh();

      expect(last(fake.bays).observed).toBe(true);

      last(fake.jobs).error(apiError(500, 'SERVER_ERROR'));

      expect(last(fake.bays).observed).toBe(false);
    });

    it('ASS-16 never substitutes a failed request with empty data', () => {
      failRequired(apiError(0, 'NETWORK_ERROR'));

      expect(service.jobs()).toBeNull();
      expect(service.bays()).toBeNull();
      expect(service.isEmpty()).toBe(false);
      expect(service.viewState()).not.toBe('empty');
    });

    const cases: readonly {
      readonly status: number;
      readonly code: ApiErrorCode;
    }[] = [
      { status: 0, code: 'NETWORK_ERROR' },
      { status: 400, code: 'BAD_REQUEST' },
      { status: 401, code: 'UNAUTHORIZED' },
      { status: 403, code: 'FORBIDDEN' },
      { status: 404, code: 'NOT_FOUND' },
      { status: 409, code: 'CONFLICT' },
      { status: 422, code: 'VALIDATION_ERROR' },
      { status: 429, code: 'RATE_LIMITED' },
      { status: 500, code: 'SERVER_ERROR' },
      { status: 418, code: 'UNKNOWN_ERROR' },
    ];

    for (const item of cases) {
      it(`ASS-17 maps ${item.status} ${item.code} with the K09 error mapper`, () => {
        const error = apiError(item.status, item.code);

        failRequired(error);

        expect(service.initialLoadError())
          .toEqual(resolveAdaptiveQueueError(error, 'read'));
      });
    }

    it('ASS-18 maps an invalid response error', () => {
      failRequired(new AdaptiveQueueResponseError('jobs[0].id'));

      expect(service.initialLoadError()?.kind).toBe('invalid-response');
    });

    it('ASS-19 maps a non-API error to unknown', () => {
      failRequired(new Error(SENSITIVE));

      expect(service.initialLoadError()?.kind).toBe('unknown');
    });

    it('ASS-20 exposes only safe error messages', () => {
      failRequired(apiError(500, 'SERVER_ERROR'));

      const message = service.initialLoadError()?.message ?? '';

      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toContain('hunter2');
      expect(message).not.toContain('SqlException');
    });

    it('ASS-21 reports authentication and permission failures', () => {
      failRequired(apiError(401, 'UNAUTHORIZED'));
      expect(service.authFailure()).toBe('unauthorized');
      expect(service.initialLoadError()?.requiresSignIn).toBe(true);

      failRequired(apiError(403, 'FORBIDDEN'), 'bays');
      expect(service.authFailure()).toBe('forbidden');

      failRequired(apiError(500, 'SERVER_ERROR'));
      expect(service.authFailure()).toBeNull();
    });

    it('ASS-22 clears the initial error when a retry starts and succeeds', () => {
      failRequired(apiError(500, 'SERVER_ERROR'));

      service.refresh();

      expect(service.initialLoadError()).toBeNull();
      expect(service.viewState()).toBe('loading');

      respond(last(fake.jobs), [makeJob()]);
      respond(last(fake.bays), [makeBay(BAY_1, 'Bay 1')]);

      expect(service.viewState()).toBe('ready');
      expect(service.initialLoadError()).toBeNull();
      expect(service.lastSyncedAt()).toEqual(START);
    });

    it('ASS-23 treats a synchronous API throw as a failure', () => {
      fake.api.getActiveJobs.mockImplementationOnce(() => {
        throw new Error(SENSITIVE);
      });

      service.refresh();

      expect(service.viewState()).toBe('error');
      expect(service.initialLoadError()?.kind).toBe('unknown');
      expect(service.isLoading()).toBe(false);
    });

    it('ASS-24 treats a required request that completes empty as a failure', () => {
      service.refresh();
      last(fake.jobs).complete();
      last(fake.bays).complete();

      expect(service.viewState()).toBe('error');
      expect(service.initialLoadError()?.kind).toBe('unknown');
      expect(service.jobs()).toBeNull();
    });
  });

  describe('optional mechanic roster', () => {
    it('ASS-25 loads independently of the required board', () => {
      const roster = [makeMechanic(1)];

      service.refresh();
      respond(last(fake.mechanics), roster);

      expect(service.mechanics()).toBe(roster);
      expect(service.mechanicsStatus()).toBe('loaded');
      expect(service.viewState()).toBe('loading');
      expect(service.jobs()).toBeNull();
    });

    it('ASS-26 does not delay the board while the roster is pending', () => {
      service.refresh();
      respond(last(fake.jobs), [makeJob()]);
      respond(last(fake.bays), [makeBay(BAY_1, 'Bay 1')]);

      expect(service.viewState()).toBe('ready');
      expect(service.mechanicsStatus()).toBe('loading');
      expect(service.mechanics()).toBeNull();

      const roster = [makeMechanic(1, { activeJobs: 2 })];
      respond(last(fake.mechanics), roster);

      expect(service.mechanicsStatus()).toBe('loaded');
      expect(service.mechanics()).toBe(roster);
      expect(service.viewState()).toBe('ready');
    });

    it('ASS-27 keeps a valid board when the roster fails', () => {
      service.refresh();
      last(fake.mechanics).error(apiError(500, 'SERVER_ERROR'));
      respond(last(fake.jobs), [makeJob()]);
      respond(last(fake.bays), [makeBay(BAY_1, 'Bay 1')]);

      expect(service.viewState()).toBe('ready');
      expect(service.mechanicsStatus()).toBe('failed');
      expect(service.mechanicsError()?.kind).toBe('server-failure');
      expect(service.mechanics()).toBeNull();
      expect(service.initialLoadError()).toBeNull();
      expect(service.refreshError()).toBeNull();
      expect(service.isStale()).toBe(false);
      expect(service.lastSyncedAt()).toEqual(START);
    });

    // K11-C: the original assertion (roster 401 leaves the board
    // untouched) is replaced. A 401 is a session invalidation for the
    // whole page, so the board is cleared. A resource-specific roster
    // 403 keeps the board and is the case this test now covers.
    it('ASS-28 does not treat a roster permission denial as a board auth failure', () => {
      service.refresh();
      last(fake.mechanics).error(apiError(403, 'FORBIDDEN'));
      respond(last(fake.jobs), [makeJob()]);
      respond(last(fake.bays), [makeBay(BAY_1, 'Bay 1')]);

      expect(service.mechanicsError()?.kind).toBe('forbidden');
      expect(service.authFailure()).toBeNull();
      expect(service.viewState()).toBe('ready');
    });

    it('ASS-29 keeps the last good roster when a reload fails, then recovers', () => {
      const roster = [makeMechanic(1)];

      loadBoard();
      respond(last(fake.mechanics), roster);

      service.refresh();
      last(fake.mechanics).error(apiError(500, 'SERVER_ERROR'));

      expect(service.mechanics()).toBe(roster);
      expect(service.mechanicsStatus()).toBe('failed');
      expect(service.mechanicsError()).not.toBeNull();

      const reloaded = [makeMechanic(2)];
      respond(last(fake.jobs), [makeJob()]);
      respond(last(fake.bays), [makeBay(BAY_1, 'Bay 1')]);
      service.refresh();
      respond(last(fake.mechanics), reloaded);

      expect(service.mechanics()).toBe(reloaded);
      expect(service.mechanicsError()).toBeNull();
      expect(service.mechanicsStatus()).toBe('loaded');
    });

    it('ASS-30 preserves onDuty and activeJobs values', () => {
      const roster = [
        makeMechanic(1, { onDuty: true, activeJobs: 3 }),
        makeMechanic(2, { onDuty: false, activeJobs: 0 }),
      ];

      service.refresh();
      respond(last(fake.mechanics), roster);

      expect(service.mechanics()?.map(item => item.onDuty))
        .toEqual([true, false]);
      expect(service.mechanics()?.map(item => item.activeJobs))
        .toEqual([3, 0]);
    });

    it('ASS-31 keeps the roster when a required request fails', () => {
      const roster = [makeMechanic(1)];

      service.refresh();
      respond(last(fake.mechanics), roster);
      last(fake.jobs).error(apiError(500, 'SERVER_ERROR'));

      expect(service.mechanics()).toBe(roster);
      expect(service.viewState()).toBe('error');
    });

    it('ASS-32 cancels a pending roster request when a new cycle starts', () => {
      loadBoard();
      const first = last(fake.mechanics);

      service.refresh();

      expect(first.observed).toBe(false);

      respond(last(fake.mechanics), [makeMechanic(2)]);
      first.next([makeMechanic(1)]);

      expect(service.mechanics()?.[0].name).toBe('Mechanic 2');
    });

    it('ASS-33 treats a roster that completes empty as a roster failure', () => {
      service.refresh();
      last(fake.mechanics).complete();

      expect(service.mechanicsStatus()).toBe('failed');
      expect(service.mechanicsError()?.kind).toBe('unknown');
      expect(service.mechanics()).toBeNull();
    });
  });

  describe('background refresh', () => {
    it('ASS-34 keeps the board visible while refreshing', () => {
      const jobs = [makeJob()];
      loadBoard(jobs);

      service.refresh();

      expect(service.isRefreshing()).toBe(true);
      expect(service.isInitialLoading()).toBe(false);
      expect(service.viewState()).toBe('ready');
      expect(service.jobs()).toBe(jobs);
    });

    it('ASS-35 replaces the board and advances the sync time on success', () => {
      loadBoard([makeJob()]);

      vi.setSystemTime(new Date('2026-11-27T08:01:00Z'));

      const next = [makeJob({ queuePosition: 4 })];
      service.refresh();
      respond(last(fake.jobs), next);
      respond(last(fake.bays), [makeBay(BAY_1, 'Bay 1')]);

      expect(service.jobs()).toBe(next);
      expect(service.isRefreshing()).toBe(false);
      expect(service.lastSyncedAt())
        .toEqual(new Date('2026-11-27T08:01:00Z'));
    });

    it('ASS-36 keeps the last valid board when a refresh fails', () => {
      const jobs = [makeJob()];
      loadBoard(jobs);

      vi.setSystemTime(new Date('2026-11-27T08:01:00Z'));
      failRequired(apiError(500, 'SERVER_ERROR'));

      expect(service.jobs()).toBe(jobs);
      expect(service.viewState()).toBe('ready');
      expect(service.refreshError()?.kind).toBe('server-failure');
      expect(service.initialLoadError()).toBeNull();
      expect(service.lastSyncedAt()).toEqual(START);
      expect(service.isStale()).toBe(true);
      expect(service.staleReason()).toBe('refresh-failed');
    });

    it('ASS-37 clears the refresh error and stale flag after a later success', () => {
      loadBoard([makeJob()]);
      failRequired(apiError(500, 'SERVER_ERROR'));

      expect(service.isStale()).toBe(true);

      loadBoard([makeJob()]);

      expect(service.refreshError()).toBeNull();
      expect(service.isStale()).toBe(false);
    });

    it('ASS-38 does not apply a partial refresh when one request fails', () => {
      const jobs = [makeJob()];
      const bays = [makeBay(BAY_1, 'Bay 1')];
      loadBoard(jobs, bays);

      service.refresh();
      respond(last(fake.jobs), [makeJob(), makeJob()]);
      last(fake.bays).error(apiError(500, 'SERVER_ERROR'));

      expect(service.jobs()).toBe(jobs);
      expect(service.bays()).toBe(bays);
      expect(service.refreshError()).not.toBeNull();
      expect(service.lastSyncedAt()).toEqual(START);
    });

    it('ASS-39 does not update the sync time until both requests succeed', () => {
      loadBoard([makeJob()]);

      vi.setSystemTime(new Date('2026-11-27T08:02:00Z'));
      service.refresh();
      respond(last(fake.jobs), [makeJob()]);

      expect(service.lastSyncedAt()).toEqual(START);

      respond(last(fake.bays), [makeBay(BAY_1, 'Bay 1')]);

      expect(service.lastSyncedAt())
        .toEqual(new Date('2026-11-27T08:02:00Z'));
    });

    // K11-C: the original assertion kept the board after a refresh
    // 401. Protected data must not remain visible once access is
    // rejected, so the board is cleared and the failure is reported
    // as a sign-in requirement instead of a retryable refresh error.
    it('ASS-40 clears the board and requires sign-in after a refresh 401', () => {
      loadBoard([makeJob()]);

      failRequired(apiError(401, 'UNAUTHORIZED'));

      expect(service.authFailure()).toBe('unauthorized');
      expect(service.jobs()).toBeNull();
      expect(service.hasBoard()).toBe(false);
      expect(service.refreshError()).toBeNull();
      expect(service.initialLoadError()?.requiresSignIn).toBe(true);
      expect(service.viewState()).toBe('error');
    });

    it('ASS-41 keeps the empty state when a refresh of an empty board fails', () => {
      loadBoard([]);
      failRequired(apiError(500, 'SERVER_ERROR'));

      expect(service.viewState()).toBe('empty');
      expect(service.isStale()).toBe(true);
    });

    it('ASS-42 does not start an initial-loading state during a refresh failure', () => {
      loadBoard([makeJob()]);
      service.refresh();
      last(fake.jobs).error(apiError(0, 'NETWORK_ERROR'));

      expect(service.isInitialLoading()).toBe(false);
      expect(service.isLoading()).toBe(false);
      expect(service.initialLoadError()).toBeNull();
    });
  });

  describe('request coalescing and lifecycle', () => {
    it('ASS-43 does not start a second request while one is in flight', () => {
      service.refresh();
      service.refresh();
      service.refresh();

      expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);
      expect(fake.api.getBays).toHaveBeenCalledTimes(1);
      expect(fake.api.getMechanics).toHaveBeenCalledTimes(1);
    });

    it('ASS-44 runs exactly one follow-up request after calls during a load', () => {
      service.refresh();
      service.refresh();
      service.refresh();

      respond(last(fake.jobs), [makeJob()]);
      respond(last(fake.bays), [makeBay(BAY_1, 'Bay 1')]);

      expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(2);
      expect(fake.api.getBays).toHaveBeenCalledTimes(2);
      expect(service.isRefreshing()).toBe(true);

      respond(last(fake.jobs), [makeJob()]);
      respond(last(fake.bays), [makeBay(BAY_1, 'Bay 1')]);

      expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(2);
      expect(service.isLoading()).toBe(false);
    });

    it('ASS-45 publishes the follow-up response as the latest board', () => {
      service.refresh();
      service.refresh();
      respond(last(fake.jobs), [makeJob({ number: 'OLD' })]);
      respond(last(fake.bays), [makeBay(BAY_1, 'Bay 1')]);

      const latest = [makeJob({ number: 'NEW' })];
      respond(last(fake.jobs), latest);
      respond(last(fake.bays), [makeBay(BAY_1, 'Bay 1')]);

      expect(service.jobs()).toBe(latest);
    });

    it('ASS-46 runs the queued follow-up after a non-auth failure', () => {
      service.refresh();
      service.refresh();
      last(fake.jobs).error(apiError(500, 'SERVER_ERROR'));

      expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(2);
      expect(service.isLoading()).toBe(true);
    });

    it('ASS-47 does not run the queued follow-up after an auth failure', () => {
      service.refresh();
      service.refresh();
      last(fake.jobs).error(apiError(401, 'UNAUTHORIZED'));

      expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);
      expect(service.isLoading()).toBe(false);
      expect(service.authFailure()).toBe('unauthorized');
    });

    it('ASS-48 allows a new refresh after a completed load', () => {
      loadBoard();
      service.refresh();

      expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(2);
    });

    it('ASS-49 cancels all in-flight requests on destroy', () => {
      service.refresh();

      expect(last(fake.jobs).observed).toBe(true);
      expect(last(fake.bays).observed).toBe(true);
      expect(last(fake.mechanics).observed).toBe(true);

      service.ngOnDestroy();

      expect(last(fake.jobs).observed).toBe(false);
      expect(last(fake.bays).observed).toBe(false);
      expect(last(fake.mechanics).observed).toBe(false);
    });

    it('ASS-50 ignores late responses after destroy', () => {
      service.refresh();
      const jobs = last(fake.jobs);
      const bays = last(fake.bays);

      service.ngOnDestroy();

      respond(jobs, [makeJob()]);
      respond(bays, [makeBay(BAY_1, 'Bay 1')]);

      expect(service.jobs()).toBeNull();
      expect(service.lastSyncedAt()).toBeNull();
    });

    it('ASS-51 ignores refresh and markPotentiallyStale after destroy', () => {
      loadBoard();
      service.ngOnDestroy();

      service.refresh();
      service.markPotentiallyStale();

      expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);
      expect(service.staleReason()).toBeNull();
    });

    it('ASS-52 can be destroyed more than once and stops its timer', () => {
      loadBoard();

      expect(serviceTimers()).toBe(1);

      service.ngOnDestroy();
      service.ngOnDestroy();

      expect(serviceTimers()).toBe(0);
    });

    it('ASS-53 drops the queued follow-up when destroyed', () => {
      service.refresh();
      service.refresh();

      service.ngOnDestroy();

      expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);
    });
  });

  describe('stale data handling', () => {
    // K13-B: the original assertion expected no timer until the first
    // sync. The local timer now starts when the first protected request
    // starts, so session expiry is noticed before a board has loaded.
    // Staleness itself is still absent before the first sync.
    it('ASS-54 reports no staleness before the first sync, with a single local timer', () => {
      expect(serviceTimers()).toBe(0);

      service.refresh();

      expect(serviceTimers()).toBe(1);
      expect(service.isStale()).toBe(false);
      expect(service.staleReason()).toBeNull();
    });

    it('ASS-55 is fresh immediately after a successful sync', () => {
      loadBoard();

      expect(service.isStale()).toBe(false);
      expect(service.staleReason()).toBeNull();
    });

    it('ASS-56 is not stale at the threshold and stale after it', () => {
      loadBoard();

      vi.advanceTimersByTime(ADAPTIVE_QUEUE_STALE_AFTER_MS);

      expect(service.isStale()).toBe(false);

      vi.advanceTimersByTime(ADAPTIVE_QUEUE_STALE_CHECK_INTERVAL_MS);

      expect(service.isStale()).toBe(true);
      expect(service.staleReason()).toBe('aged');
    });

    it('ASS-57 clears aged staleness after a successful refresh', () => {
      loadBoard();
      vi.advanceTimersByTime(ADAPTIVE_QUEUE_STALE_AFTER_MS + 30_000);

      expect(service.staleReason()).toBe('aged');

      loadBoard();

      expect(service.isStale()).toBe(false);
    });

    it('ASS-58 keeps the board while aged', () => {
      const jobs = [makeJob()];
      loadBoard(jobs);

      vi.advanceTimersByTime(ADAPTIVE_QUEUE_STALE_AFTER_MS + 30_000);

      expect(service.jobs()).toBe(jobs);
      expect(service.viewState()).toBe('ready');
    });

    it('ASS-59 flags the board as potentially stale on request', () => {
      loadBoard();

      service.markPotentiallyStale();

      expect(service.isStale()).toBe(true);
      expect(service.staleReason()).toBe('signalled');
    });

    it('ASS-60 clears the signalled flag only on a successful refresh', () => {
      loadBoard();
      service.markPotentiallyStale();

      service.refresh();

      expect(service.staleReason()).toBe('signalled');

      respond(last(fake.jobs), [makeJob()]);
      respond(last(fake.bays), [makeBay(BAY_1, 'Bay 1')]);

      expect(service.isStale()).toBe(false);
    });

    it('ASS-61 ignores markPotentiallyStale without a board', () => {
      service.markPotentiallyStale();

      expect(service.isStale()).toBe(false);
      expect(service.staleReason()).toBeNull();

      loadBoard();

      expect(service.isStale()).toBe(false);
    });

    it('ASS-62 gives refresh failure priority over other reasons', () => {
      loadBoard();
      service.markPotentiallyStale();
      vi.advanceTimersByTime(ADAPTIVE_QUEUE_STALE_AFTER_MS + 30_000);

      failRequired(apiError(500, 'SERVER_ERROR'));

      expect(service.staleReason()).toBe('refresh-failed');
    });

    it('ASS-63 reports signalled before aged', () => {
      loadBoard();
      service.markPotentiallyStale();
      vi.advanceTimersByTime(ADAPTIVE_QUEUE_STALE_AFTER_MS + 30_000);

      expect(service.staleReason()).toBe('signalled');
    });

    it('ASS-64 uses a single timer across repeated syncs', () => {
      loadBoard();
      loadBoard();
      loadBoard();

      expect(serviceTimers()).toBe(1);
    });

    it('ASS-65 does not mark an initial failure as stale', () => {
      failRequired(apiError(500, 'SERVER_ERROR'));

      expect(service.isStale()).toBe(false);
      expect(service.staleReason()).toBeNull();
    });
  });

  describe('encapsulation and safety', () => {
    const publicSignals = [
      'jobs',
      'bays',
      'mechanics',
      'mechanicsStatus',
      'mechanicsError',
      'snapshot',
      'hasBoard',
      'waitingJobs',
      'activePhaseJobs',
      'unrecognizedStatusJobs',
      'bayColumns',
      'unassignedJobs',
      'inactiveBayAssignments',
      'unknownBayAssignments',
      'duplicateBayAssignments',
      'duplicateMechanicAssignments',
      'capacity',
      'jobLimit',
      'warnings',
      'isLoading',
      'isInitialLoading',
      'isRefreshing',
      'isEmpty',
      'initialLoadError',
      'refreshError',
      'lastSyncedAt',
      'staleReason',
      'isStale',
      'authFailure',
      'viewState',
    ] as const;

    for (const name of publicSignals) {
      it(`ASS-66 exposes ${name} as a read-only signal`, () => {
        const exposed = service[name] as unknown as Record<
          string,
          unknown
        >;

        expect(typeof exposed).toBe('function');
        expect(exposed['set']).toBeUndefined();
        expect(exposed['update']).toBeUndefined();
      });
    }

    it('ASS-67 does not mutate frozen API responses', () => {
      const jobs = deepFreeze([
        makeJob({ status: 'Open', queuePosition: 2, bayId: BAY_1 }),
        makeJob({ status: 'InProgress', queuePosition: 0, bayId: BAY_1 }),
      ]);
      const bays = deepFreeze([makeBay(BAY_1, 'Bay 1')]);
      const roster = deepFreeze([makeMechanic(1)]);

      service.refresh();
      respond(last(fake.mechanics), roster);
      respond(last(fake.jobs), jobs);

      expect(() => respond(last(fake.bays), bays)).not.toThrow();
      expect(service.waitingJobs()).toHaveLength(1);
      expect(service.mechanics()).toBe(roster);
    });

    it('ASS-68 calls only the three read operations', () => {
      loadBoard();

      expect(Object.keys(fake.api).sort()).toEqual([
        'getActiveJobs',
        'getBays',
        'getMechanics',
      ]);
      expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);
      expect(fake.api.getBays).toHaveBeenCalledTimes(1);
      expect(fake.api.getMechanics).toHaveBeenCalledTimes(1);
    });

    it('ASS-69 is not provided in root', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: AdaptiveQueueApiService, useValue: fake.api },
        ],
      });

      expect(() => TestBed.inject(AdaptiveQueueStateService)).toThrow();
    });

    it('ASS-70 does not share state between separately provided instances', () => {
      const parent = TestBed.inject(Injector);

      const create = (): AdaptiveQueueStateService =>
        Injector.create({
          providers: [
            {
              provide: AdaptiveQueueStateService,
              useClass: AdaptiveQueueStateService,
              deps: [],
            },
          ],
          parent,
        }).get(AdaptiveQueueStateService);

      const first = create();
      const second = create();

      expect(first).not.toBe(second);

      first.refresh();
      respond(last(fake.jobs), [makeJob()]);
      respond(last(fake.bays), [makeBay(BAY_1, 'Bay 1')]);

      expect(first.hasBoard()).toBe(true);
      expect(second.hasBoard()).toBe(false);
      expect(second.viewState()).toBe('idle');

      first.ngOnDestroy();
      second.ngOnDestroy();
    });
  });

  describe('session lifecycle security', () => {
    function expectNoQueueData(): void {
      expect(service.jobs()).toBeNull();
      expect(service.bays()).toBeNull();
      expect(service.mechanics()).toBeNull();
      expect(service.snapshot()).toBeNull();
      expect(service.capacity()).toBeNull();
      expect(service.jobLimit()).toBeNull();
      expect(service.hasBoard()).toBe(false);
      expect(service.waitingJobs()).toEqual([]);
      expect(service.activePhaseJobs()).toEqual([]);
      expect(service.unrecognizedStatusJobs()).toEqual([]);
      expect(service.bayColumns()).toEqual([]);
      expect(service.unassignedJobs()).toEqual([]);
      expect(service.warnings()).toEqual([]);
      expect(service.lastSyncedAt()).toBeNull();
      expect(service.staleReason()).toBeNull();
      expect(service.isStale()).toBe(false);
      expect(service.isLoading()).toBe(false);
      expect(service.refreshError()).toBeNull();
      expect(service.mechanicsError()).toBeNull();
      expect(service.mechanicsStatus()).toBe('idle');
    }

    function loadBoardAndRoster(): void {
      service.refresh();
      respond(last(fake.mechanics), [makeMechanic(1)]);
      respond(last(fake.jobs), [makeJob()]);
      respond(last(fake.bays), [makeBay(BAY_1, 'Bay 1')]);
    }

    function endSession(): void {
      session.clearSession();
      TestBed.tick();
    }

    describe('logout', () => {
      it('ASS-71 clears all queue data when the session is cleared', () => {
        loadBoardAndRoster();
        service.markPotentiallyStale();

        endSession();

        expectNoQueueData();
        expect(service.authFailure()).toBe('unauthorized');
        expect(service.viewState()).toBe('error');
      });

      it('ASS-72 cancels in-flight required and roster requests', () => {
        service.refresh();

        expect(last(fake.jobs).observed).toBe(true);
        expect(last(fake.bays).observed).toBe(true);
        expect(last(fake.mechanics).observed).toBe(true);

        endSession();

        expect(last(fake.jobs).observed).toBe(false);
        expect(last(fake.bays).observed).toBe(false);
        expect(last(fake.mechanics).observed).toBe(false);
        expect(service.isLoading()).toBe(false);
        expect(service.mechanicsStatus()).toBe('idle');
      });

      it('ASS-73 discards a queued refresh and never re-requests by itself', () => {
        service.refresh();
        service.refresh();

        endSession();
        signIn();
        TestBed.tick();
        vi.advanceTimersByTime(600_000);

        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);
        expect(fake.api.getBays).toHaveBeenCalledTimes(1);
        expect(service.isLoading()).toBe(false);
      });

      it('ASS-74 stops the age timer', () => {
        loadBoard();
        expect(serviceTimers()).toBe(1);

        endSession();

        expect(serviceTimers()).toBe(0);
      });

      it('ASS-75 reports only a fixed safe sign-in message', () => {
        loadBoardAndRoster();
        endSession();

        const error = service.initialLoadError();

        expect(error?.kind).toBe('unauthorized');
        expect(error?.requiresSignIn).toBe(true);
        expect(JSON.stringify(error)).not.toContain(SENSITIVE);
      });

      it('ASS-76 drops late required responses without waiting for the effect', () => {
        service.refresh();
        const jobs = last(fake.jobs);
        const bays = last(fake.bays);

        session.clearSession();
        // The effect has not run yet; the response itself must be refused.
        respond(jobs, [makeJob()]);
        respond(bays, [makeBay(BAY_1, 'Bay 1')]);

        expectNoQueueData();
        expect(service.authFailure()).toBe('unauthorized');
      });

      it('ASS-77 drops a late roster response without waiting for the effect', () => {
        service.refresh();
        const roster = last(fake.mechanics);

        session.clearSession();
        respond(roster, [makeMechanic(1)]);

        expect(service.mechanics()).toBeNull();
        expect(service.mechanicsStatus()).toBe('idle');
      });

      it('ASS-78 does not restore data from responses that arrive after the reset', () => {
        service.refresh();
        const jobs = last(fake.jobs);
        const bays = last(fake.bays);
        const roster = last(fake.mechanics);

        endSession();
        respond(jobs, [makeJob()]);
        respond(bays, [makeBay(BAY_1, 'Bay 1')]);
        respond(roster, [makeMechanic(1)]);

        expectNoQueueData();
      });

      it('ASS-79 clears derived snapshots, timestamps and stale flags', () => {
        loadBoard([makeJob()]);
        service.markPotentiallyStale();
        vi.advanceTimersByTime(ADAPTIVE_QUEUE_STALE_AFTER_MS + 1);

        endSession();

        expectNoQueueData();
      });

      it('ASS-80 refuses refresh while signed out and sends no request', () => {
        loadBoard();
        endSession();

        service.refresh();
        service.refresh();

        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);
        expect(fake.api.getBays).toHaveBeenCalledTimes(1);
        expect(fake.api.getMechanics).toHaveBeenCalledTimes(1);
        expect(service.isLoading()).toBe(false);
        expect(service.authFailure()).toBe('unauthorized');
        expect(service.hasBoard()).toBe(false);
      });

      it('ASS-81 refuses refresh with no session at all, before the effect runs', () => {
        loadBoard();
        session.clearSession();

        service.refresh();

        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);
        expect(service.hasBoard()).toBe(false);
        expect(service.authFailure()).toBe('unauthorized');
      });

      it('ASS-82 loads again after a new valid session, without stale leftovers', () => {
        service.markPotentiallyStale();
        loadBoardAndRoster();
        service.markPotentiallyStale();
        endSession();

        signIn();
        loadBoard([makeJob()]);

        expect(service.viewState()).toBe('ready');
        expect(service.authFailure()).toBeNull();
        expect(service.initialLoadError()).toBeNull();
        expect(service.staleReason()).toBeNull();
        expect(service.lastSyncedAt()).toEqual(START);
      });
    });

    describe('identity change', () => {
      it('ASS-83 clears queue data when a different user signs in', () => {
        loadBoardAndRoster();

        signIn('manager-002');
        TestBed.tick();

        expectNoQueueData();
        expect(service.viewState()).toBe('idle');
        expect(service.authFailure()).toBeNull();
        expect(service.initialLoadError()).toBeNull();
      });

      it('ASS-84 cancels requests that belong to the previous user', () => {
        service.refresh();

        signIn('manager-002');
        TestBed.tick();

        expect(last(fake.jobs).observed).toBe(false);
        expect(last(fake.bays).observed).toBe(false);
        expect(last(fake.mechanics).observed).toBe(false);
        expect(service.isLoading()).toBe(false);
      });

      it('ASS-85 refuses responses for the previous user before the effect runs', () => {
        service.refresh();
        const jobs = last(fake.jobs);
        const bays = last(fake.bays);

        signIn('manager-002');
        respond(jobs, [makeJob()]);
        respond(bays, [makeBay(BAY_1, 'Bay 1')]);

        expectNoQueueData();
      });

      it('ASS-86 clears the previous user board when refresh runs first', () => {
        loadBoardAndRoster();

        signIn('manager-002');
        service.refresh();

        expect(service.hasBoard()).toBe(false);
        expect(service.mechanics()).toBeNull();
        expect(service.isInitialLoading()).toBe(true);

        respond(last(fake.mechanics), []);
        respond(last(fake.jobs), []);
        respond(last(fake.bays), []);

        expect(service.viewState()).toBe('empty');
      });

      // K13-B: the original assertion kept the board when the same user
      // got a replacement session. Data is now bound to the exact
      // session instance, so any replacement clears it.
      it('ASS-87 clears the board when the same user session is replaced', () => {
        loadBoardAndRoster();

        signIn('manager-001', 7_200_000);
        TestBed.tick();

        expectNoQueueData();
        expect(service.viewState()).toBe('idle');
        expect(service.authFailure()).toBeNull();
        expect(service.initialLoadError()).toBeNull();
      });

      it('ASS-88 stops the age timer on identity change', () => {
        loadBoard();

        signIn('manager-002');
        TestBed.tick();

        expect(serviceTimers()).toBe(0);
      });
    });

    describe('session expiry', () => {
      it('ASS-89 clears queue data when the session expires locally', () => {
        loadBoardAndRoster();

        vi.advanceTimersByTime(3_600_000 + ADAPTIVE_QUEUE_STALE_CHECK_INTERVAL_MS);

        expectNoQueueData();
        expect(service.authFailure()).toBe('unauthorized');
        expect(serviceTimers()).toBe(0);
      });

      it('ASS-90 refuses refresh on an expired session', () => {
        loadBoard();
        vi.setSystemTime(new Date(START.getTime() + 3_600_001));

        service.refresh();

        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);
        expect(service.hasBoard()).toBe(false);
        expect(service.authFailure()).toBe('unauthorized');
      });

      it('ASS-91 drops responses that arrive after the session expired', () => {
        service.refresh();
        const jobs = last(fake.jobs);
        const bays = last(fake.bays);

        vi.setSystemTime(new Date(START.getTime() + 3_600_001));
        respond(jobs, [makeJob()]);
        respond(bays, [makeBay(BAY_1, 'Bay 1')]);

        expectNoQueueData();
        expect(service.authFailure()).toBe('unauthorized');
      });

      it('ASS-92 keeps the board while the session is still valid', () => {
        const jobs = [makeJob()];
        loadBoard(jobs);

        vi.advanceTimersByTime(3_000_000);

        expect(service.jobs()).toBe(jobs);
        expect(service.authFailure()).toBeNull();
      });
    });

    describe('required resource authorization', () => {
      it('ASS-93 clears everything on a refresh 401', () => {
        loadBoardAndRoster();
        service.markPotentiallyStale();

        failRequired(apiError(401, 'UNAUTHORIZED'));

        expectNoQueueData();
        expect(service.authFailure()).toBe('unauthorized');
        expect(service.initialLoadError()?.kind).toBe('unauthorized');
        expect(serviceTimers()).toBe(0);
      });

      it('ASS-94 clears everything on a refresh 403', () => {
        loadBoardAndRoster();

        failRequired(apiError(403, 'FORBIDDEN'), 'bays');

        expectNoQueueData();
        expect(service.authFailure()).toBe('forbidden');
        expect(service.initialLoadError()?.kind).toBe('forbidden');
        expect(service.viewState()).toBe('error');
        expect(serviceTimers()).toBe(0);
      });

      it('ASS-95 cancels the sibling request and roster on a required 403', () => {
        service.refresh();
        const bays = last(fake.bays);
        const roster = last(fake.mechanics);

        last(fake.jobs).error(apiError(403, 'FORBIDDEN'));

        expect(bays.observed).toBe(false);
        expect(roster.observed).toBe(false);
        expect(service.mechanicsStatus()).toBe('idle');
      });

      it('ASS-96 discards the queued refresh after a required 403', () => {
        service.refresh();
        service.refresh();

        last(fake.jobs).error(apiError(403, 'FORBIDDEN'));

        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);
        expect(service.isLoading()).toBe(false);
      });

      it('ASS-97 ignores a late roster response after a required 401', () => {
        service.refresh();
        const roster = last(fake.mechanics);

        last(fake.jobs).error(apiError(401, 'UNAUTHORIZED'));
        respond(roster, [makeMechanic(1)]);

        expect(service.mechanics()).toBeNull();
      });

      it('ASS-98 lets the user retry after a 401 while the local session is valid', () => {
        loadBoard();
        failRequired(apiError(401, 'UNAUTHORIZED'));

        loadBoard([makeJob()]);

        expect(service.viewState()).toBe('ready');
        expect(service.authFailure()).toBeNull();
      });

      it('ASS-99 does not retain error text from the server', () => {
        loadBoard();
        failRequired(apiError(403, 'FORBIDDEN'));

        expect(JSON.stringify(service.initialLoadError()))
          .not.toContain(SENSITIVE);
      });
    });

    describe('optional roster authorization', () => {
      it('ASS-100 treats a roster 401 as a session invalidation', () => {
        loadBoardAndRoster();

        service.refresh();
        last(fake.mechanics).error(apiError(401, 'UNAUTHORIZED'));

        expectNoQueueData();
        expect(service.authFailure()).toBe('unauthorized');
        expect(service.initialLoadError()?.requiresSignIn).toBe(true);
        expect(serviceTimers()).toBe(0);
      });

      it('ASS-101 cancels pending required requests on a roster 401', () => {
        service.refresh();
        const jobs = last(fake.jobs);
        const bays = last(fake.bays);

        last(fake.mechanics).error(apiError(401, 'UNAUTHORIZED'));

        expect(jobs.observed).toBe(false);
        expect(bays.observed).toBe(false);

        respond(jobs, [makeJob()]);
        respond(bays, [makeBay(BAY_1, 'Bay 1')]);

        expectNoQueueData();
      });

      it('ASS-102 keeps the board but drops the roster on a roster 403', () => {
        const jobs = [makeJob()];
        service.refresh();
        respond(last(fake.mechanics), [makeMechanic(1)]);
        respond(last(fake.jobs), jobs);
        respond(last(fake.bays), [makeBay(BAY_1, 'Bay 1')]);

        service.refresh();
        last(fake.mechanics).error(apiError(403, 'FORBIDDEN'));

        expect(service.mechanics()).toBeNull();
        expect(service.mechanicsStatus()).toBe('failed');
        expect(service.mechanicsError()?.kind).toBe('forbidden');
        expect(service.authFailure()).toBeNull();
        expect(service.jobs()).toBe(jobs);
        expect(service.initialLoadError()).toBeNull();
        expect(service.refreshError()).toBeNull();
      });

      it('ASS-103 completes the board after a roster 403', () => {
        service.refresh();
        last(fake.mechanics).error(apiError(403, 'FORBIDDEN'));
        respond(last(fake.jobs), [makeJob()]);
        respond(last(fake.bays), [makeBay(BAY_1, 'Bay 1')]);

        expect(service.viewState()).toBe('ready');
        expect(service.lastSyncedAt()).toEqual(START);
        expect(service.mechanics()).toBeNull();
      });

      it('ASS-104 still keeps the last roster after a non-authorization failure', () => {
        const roster = [makeMechanic(1)];
        loadBoard();
        respond(last(fake.mechanics), roster);

        service.refresh();
        last(fake.mechanics).error(apiError(500, 'SERVER_ERROR'));

        expect(service.mechanics()).toBe(roster);
      });

      it('ASS-105 exposes no sensitive text from a roster failure', () => {
        loadBoard();
        service.refresh();
        last(fake.mechanics).error(apiError(403, 'FORBIDDEN'));

        expect(JSON.stringify(service.mechanicsError()))
          .not.toContain(SENSITIVE);
      });
    });

    describe('cancellation races and lifecycle', () => {
      it('ASS-106 lets an old request neither finish nor overwrite a newer session', () => {
        service.refresh();
        const oldJobs = last(fake.jobs);
        const oldBays = last(fake.bays);

        endSession();
        signIn('manager-002');
        service.refresh();

        const newJobs = [makeJob()];
        respond(last(fake.mechanics), []);
        respond(last(fake.jobs), newJobs);
        respond(last(fake.bays), [makeBay(BAY_1, 'Bay 1')]);

        respond(oldJobs, [makeJob(), makeJob()]);
        respond(oldBays, []);

        expect(service.jobs()).toBe(newJobs);
        expect(service.viewState()).toBe('ready');
      });

      it('ASS-107 ignores a cancelled request failing after the reset', () => {
        service.refresh();
        const oldJobs = last(fake.jobs);

        endSession();
        signIn('manager-002');
        loadBoard([makeJob()]);

        oldJobs.error(apiError(500, 'SERVER_ERROR'));

        expect(service.viewState()).toBe('ready');
        expect(service.refreshError()).toBeNull();
      });

      it('ASS-108 does not let an invalidation during a refresh leave loading stuck', () => {
        loadBoard();
        service.refresh();

        expect(service.isRefreshing()).toBe(true);

        endSession();

        expect(service.isLoading()).toBe(false);
        expect(service.isRefreshing()).toBe(false);
      });

      it('ASS-109 clears queue data and cancels requests on destroy', () => {
        loadBoardAndRoster();
        service.refresh();
        const jobs = last(fake.jobs);

        service.ngOnDestroy();

        expect(jobs.observed).toBe(false);
        expectNoQueueData();
        expect(serviceTimers()).toBe(0);
      });

      it('ASS-110 ignores session changes after destroy', () => {
        service.ngOnDestroy();

        expect(() => {
          signIn('manager-002');
          TestBed.tick();
          session.clearSession();
          TestBed.tick();
        }).not.toThrow();

        service.refresh();

        expect(fake.api.getActiveJobs).not.toHaveBeenCalled();
        expect(service.authFailure()).toBeNull();
      });

      it('ASS-111 cleans up the session watcher together with the timer', () => {
        loadBoard();
        service.ngOnDestroy();

        signIn('manager-002');
        TestBed.tick();
        vi.advanceTimersByTime(600_000);

        expect(serviceTimers()).toBe(0);
        expect(service.initialLoadError()).toBeNull();
      });
    });

    describe('no polling, retries or storage', () => {
      it('ASS-112 makes no HTTP requests from the age timer', () => {
        loadBoard();
        vi.advanceTimersByTime(3_000_000);

        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);
        expect(fake.api.getBays).toHaveBeenCalledTimes(1);
        expect(fake.api.getMechanics).toHaveBeenCalledTimes(1);
      });

      it('ASS-113 does not retry automatically after a failure', () => {
        failRequired(apiError(500, 'SERVER_ERROR'));
        vi.advanceTimersByTime(3_000_000);

        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);
      });

      it('ASS-114 does not retry automatically after an authorization failure', () => {
        loadBoard();
        failRequired(apiError(401, 'UNAUTHORIZED'));
        vi.advanceTimersByTime(3_000_000);

        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(2);
      });

      it('ASS-115 never reads the token and never uses browser storage', () => {
        const token = vi.spyOn(session, 'getAccessToken');
        const getItem = vi.spyOn(Storage.prototype, 'getItem');
        const setItem = vi.spyOn(Storage.prototype, 'setItem');
        const removeItem = vi.spyOn(Storage.prototype, 'removeItem');

        loadBoardAndRoster();
        service.markPotentiallyStale();
        failRequired(apiError(401, 'UNAUTHORIZED'));
        signIn('manager-002');
        TestBed.tick();
        endSession();

        expect(token).not.toHaveBeenCalled();
        expect(getItem).not.toHaveBeenCalled();
        expect(setItem).not.toHaveBeenCalled();
        expect(removeItem).not.toHaveBeenCalled();
      });

      it('ASS-116 does not renew or modify the session', () => {
        const setSession = vi.spyOn(session, 'setSession');
        const clearSession = vi.spyOn(session, 'clearSession');

        loadBoardAndRoster();
        failRequired(apiError(401, 'UNAUTHORIZED'));
        failRequired(apiError(403, 'FORBIDDEN'));

        expect(setSession).not.toHaveBeenCalled();
        expect(clearSession).not.toHaveBeenCalled();
        expect(session.isAuthenticated()).toBe(true);
      });
    });

    describe('session instance binding (K13-B)', () => {
      it('ASS-117 cancels in-flight requests when the same user gets a new session', () => {
        service.refresh();

        signIn('manager-001');
        TestBed.tick();

        expect(last(fake.jobs).observed).toBe(false);
        expect(last(fake.bays).observed).toBe(false);
        expect(last(fake.mechanics).observed).toBe(false);
        expect(service.isLoading()).toBe(false);
      });

      it('ASS-118 drops responses of the replaced session before the effect runs', () => {
        service.refresh();
        const jobs = last(fake.jobs);
        const bays = last(fake.bays);

        signIn('manager-001');
        respond(jobs, [makeJob()]);
        respond(bays, [makeBay(BAY_1, 'Bay 1')]);

        expectNoQueueData();
      });

      it('ASS-119 clears roster, timestamps, stale flags and errors on replacement', () => {
        loadBoardAndRoster();
        service.markPotentiallyStale();
        failRequired(apiError(500, 'SERVER_ERROR'));

        signIn('manager-001');
        TestBed.tick();

        expectNoQueueData();
        expect(service.initialLoadError()).toBeNull();
      });

      it('ASS-120 discards a queued refresh on replacement', () => {
        service.refresh();
        service.refresh();

        signIn('manager-001');
        TestBed.tick();
        vi.advanceTimersByTime(600_000);

        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);
      });

      it('ASS-121 clears the old board first when refresh runs before the effect', () => {
        loadBoardAndRoster();

        signIn('manager-001');
        service.refresh();

        expect(service.hasBoard()).toBe(false);
        expect(service.mechanics()).toBeNull();
        expect(service.isInitialLoading()).toBe(true);
      });

      it('ASS-122 stops the local timer on same-user replacement', () => {
        loadBoard();
        expect(serviceTimers()).toBe(1);

        signIn('manager-001');
        TestBed.tick();

        expect(serviceTimers()).toBe(0);
      });

      it('ASS-123 keeps the board when the very same session instance is set again', () => {
        const same = makeSession('manager-001');
        session.setSession(same);
        TestBed.tick();

        const jobs = [makeJob()];
        loadBoard(jobs);

        session.setSession(same);
        TestBed.tick();

        expect(service.jobs()).toBe(jobs);
      });

      it('ASS-124 does not let late responses restore data after replacement and refresh', () => {
        service.refresh();
        const oldJobs = last(fake.jobs);
        const oldBays = last(fake.bays);

        signIn('manager-001');
        TestBed.tick();
        loadBoard([makeJob({ number: 'NEW' })]);

        respond(oldJobs, [makeJob({ number: 'OLD' })]);
        respond(oldBays, []);

        expect(service.jobs()?.map(job => job.number)).toEqual(['NEW']);
      });
    });

    describe('expiry before a board is loaded (K13-B)', () => {
      it('ASS-125 notices expiry while the first request is in flight', () => {
        service.refresh();
        const jobs = last(fake.jobs);

        vi.advanceTimersByTime(
          3_600_000 + ADAPTIVE_QUEUE_STALE_CHECK_INTERVAL_MS,
        );

        expect(service.isLoading()).toBe(false);
        expect(jobs.observed).toBe(false);
        expect(service.authFailure()).toBe('unauthorized');
        expect(service.viewState()).toBe('error');
        expect(serviceTimers()).toBe(0);
      });

      it('ASS-126 notices expiry after an initial load failure', () => {
        failRequired(apiError(500, 'SERVER_ERROR'));
        expect(service.authFailure()).toBeNull();

        vi.advanceTimersByTime(
          3_600_000 + ADAPTIVE_QUEUE_STALE_CHECK_INTERVAL_MS,
        );

        expect(service.authFailure()).toBe('unauthorized');
        expect(service.initialLoadError()?.requiresSignIn).toBe(true);
      });

      it('ASS-127 starts one timer for the first request and no polling', () => {
        service.refresh();
        service.refresh();

        expect(serviceTimers()).toBe(1);

        vi.advanceTimersByTime(3_000_000);

        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);
      });

      it('ASS-128 stops the timer when access is revoked before any board', () => {
        failRequired(apiError(401, 'UNAUTHORIZED'));

        expect(serviceTimers()).toBe(0);
      });
    });

    describe('realtime invalidation (K13-B)', () => {
      it('ASS-129 flags the board as possibly stale without touching its data', () => {
        const jobs = [makeJob()];
        loadBoard(jobs);

        service.invalidate();

        expect(service.staleReason()).toBe('signalled');
        expect(service.isStale()).toBe(true);
        expect(service.jobs()).toBe(jobs);
        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);
        expect(service.lastSyncedAt()).toEqual(START);
      });

      it('ASS-130 does not request anything by itself', () => {
        loadBoard();

        service.invalidate();
        service.invalidate();
        vi.advanceTimersByTime(600_000);

        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(1);
        expect(fake.api.getBays).toHaveBeenCalledTimes(1);
      });

      it('ASS-131 is ignored before any session-bound request exists', () => {
        service.invalidate();

        expect(service.staleReason()).toBeNull();
        expect(service.viewState()).toBe('idle');
        expect(fake.api.getActiveJobs).not.toHaveBeenCalled();
      });

      it('ASS-132 does not flag staleness without a board', () => {
        service.refresh();

        service.invalidate();

        expect(service.staleReason()).toBeNull();
      });

      it('ASS-133 lets a request started after the invalidation clear it', () => {
        loadBoard();
        service.invalidate();

        service.refresh();
        loadBoard([makeJob()]);

        expect(service.staleReason()).toBeNull();
        expect(service.isStale()).toBe(false);
      });

      it('ASS-134 keeps a newer invalidation when an older request completes', () => {
        loadBoard();
        service.refresh();
        const jobs = last(fake.jobs);
        const bays = last(fake.bays);

        service.invalidate();
        respond(last(fake.mechanics), []);
        respond(jobs, [makeJob({ number: 'OLDER' })]);
        respond(bays, [makeBay(BAY_1, 'Bay 1')]);

        expect(service.jobs()?.map(job => job.number)).toEqual(['OLDER']);
        expect(service.staleReason()).toBe('signalled');
      });

      it('ASS-135 clears that invalidation only after a later request completes', () => {
        loadBoard();
        service.refresh();
        const jobs = last(fake.jobs);
        const bays = last(fake.bays);

        service.invalidate();
        respond(jobs, []);
        respond(bays, [makeBay(BAY_1, 'Bay 1')]);
        expect(service.staleReason()).toBe('signalled');

        service.refresh();
        loadBoard([makeJob()]);

        expect(service.staleReason()).toBeNull();
      });

      it('ASS-136 reuses the single-flight and one queued follow-up', () => {
        loadBoard();
        service.refresh();

        service.invalidate();
        service.refresh();
        service.refresh();
        service.refresh();

        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(2);

        respond(last(fake.mechanics), []);
        respond(last(fake.jobs), []);
        respond(last(fake.bays), [makeBay(BAY_1, 'Bay 1')]);

        expect(fake.api.getActiveJobs).toHaveBeenCalledTimes(3);
        expect(service.isLoading()).toBe(true);
      });

      it('ASS-137 ignores invalidation after the session ended', () => {
        loadBoard();
        session.clearSession();

        service.invalidate();

        expectNoQueueData();
        expect(service.authFailure()).toBe('unauthorized');
      });

      it('ASS-138 ignores invalidation after destruction', () => {
        loadBoard();
        service.ngOnDestroy();

        expect(() => service.invalidate()).not.toThrow();
        expect(service.staleReason()).toBeNull();
      });

      it('ASS-139 keeps the stale marker when the refresh after an invalidation fails', () => {
        loadBoard();
        service.invalidate();

        failRequired(apiError(500, 'SERVER_ERROR'));

        expect(service.staleReason()).toBe('refresh-failed');
        expect(service.hasBoard()).toBe(true);
      });
    });
  });
});
