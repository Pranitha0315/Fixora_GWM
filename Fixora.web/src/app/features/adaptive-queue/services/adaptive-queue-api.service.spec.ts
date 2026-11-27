import {
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';

import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { TestBed } from '@angular/core/testing';

import { of } from 'rxjs';
import type { Observable } from 'rxjs';

import { API_CONFIG } from '../../../core/config/api.config';
import type { ApiConfig } from '../../../core/config/api.config';

import { SessionService } from '../../../core/auth/session.service';
import { authInterceptor } from '../../../core/interceptors/auth.interceptor';
import { errorInterceptor } from '../../../core/interceptors/error.interceptor';

import { ApiError } from '../../../core/models/api-error.model';
import type { ApiErrorCode } from '../../../core/models/api-error.model';

import { BookingActionApiService } from '../../bookings/services/booking-action-api.service';

import type {
  BayDto,
  MechanicRosterDto,
} from '../../bookings/models/booking-support.model';

import type { AdaptiveQueueErrorKind } from '../models/adaptive-queue.model';

import {
  classifyAdaptiveQueueError,
  resolveAdaptiveQueueError,
} from '../utils/adaptive-queue-error.mapper';

import { AdaptiveQueueResponseError } from '../utils/adaptive-queue.validator';

import { AdaptiveQueueApiService } from './adaptive-queue-api.service';

const ORIGIN = 'https://api.example.test';
const MANAGER = `${ORIGIN}/api/v1/manager`;
const JOBS_URL = `${MANAGER}/jobs`;
const BAYS_URL = `${MANAGER}/settings/bays`;
const MECHANICS_URL = `${MANAGER}/mechanics`;

const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';
const SENSITIVE = 'SqlException: password=hunter2 at Server.Internal';

function uuid(value: number): string {
  return `10000000-0000-4000-8000-${value
    .toString()
    .padStart(12, '0')}`;
}

function makeJob(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: uuid(1),
    number: 'JC-0001',
    customerId: uuid(2),
    customerName: 'Test Customer',
    vehicleId: uuid(3),
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
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return { id: uuid(100), name: 'Bay 1', active: true, ...overrides };
}

function makeMechanic(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: uuid(200),
    name: 'Nimal',
    phone: '0770000000',
    employeeCode: 'EMP-001',
    onDuty: true,
    activeJobs: 1,
    ...overrides,
  };
}

interface Operation {
  readonly name: string;
  readonly url: string;
  readonly call: (
    service: AdaptiveQueueApiService,
  ) => Observable<unknown>;
}

const OPERATIONS: readonly Operation[] = [
  {
    name: 'getActiveJobs',
    url: JOBS_URL,
    call: service => service.getActiveJobs(),
  },
  {
    name: 'getBays',
    url: BAYS_URL,
    call: service => service.getBays(),
  },
  {
    name: 'getMechanics',
    url: MECHANICS_URL,
    call: service => service.getMechanics(),
  },
];

interface FailureCase {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly kind: AdaptiveQueueErrorKind;
}

const FAILURES: readonly FailureCase[] = [
  { status: 400, code: 'BAD_REQUEST', kind: 'invalid-request' },
  { status: 401, code: 'UNAUTHORIZED', kind: 'unauthorized' },
  { status: 403, code: 'FORBIDDEN', kind: 'forbidden' },
  { status: 404, code: 'NOT_FOUND', kind: 'not-found' },
  { status: 409, code: 'CONFLICT', kind: 'conflict' },
  { status: 429, code: 'RATE_LIMITED', kind: 'rate-limited' },
  { status: 500, code: 'SERVER_ERROR', kind: 'server-failure' },
];

interface Outcome {
  values: unknown[];
  error: unknown;
  completed: boolean;
}

function track(source: Observable<unknown>): {
  readonly outcome: Outcome;
  readonly unsubscribe: () => void;
} {
  const outcome: Outcome = {
    values: [],
    error: undefined,
    completed: false,
  };

  const subscription = source.subscribe({
    next: value => outcome.values.push(value),
    error: error => (outcome.error = error),
    complete: () => (outcome.completed = true),
  });

  return {
    outcome,
    unsubscribe: () => subscription.unsubscribe(),
  };
}

describe('AdaptiveQueueApiService', () => {
  let service: AdaptiveQueueApiService;
  let http: HttpTestingController;
  let session: SessionService;
  let config: { baseUrl: ApiConfig['baseUrl'] };

  beforeEach(() => {
    config = { baseUrl: ORIGIN };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([errorInterceptor, authInterceptor]),
        ),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: config },
      ],
    });

    service = TestBed.inject(AdaptiveQueueApiService);
    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);
  });

  afterEach(() => {
    http.verify();
  });

  it('AQA-01 creates the service', () => {
    expect(service).toBeTruthy();
  });

  describe('getActiveJobs', () => {
    it('AQA-02 sends one GET to the manager jobs URL', () => {
      track(service.getActiveJobs());

      const req = http.expectOne(
        request => request.url === JOBS_URL,
      );

      expect(req.request.method).toBe('GET');
      expect(req.request.url).toBe(JOBS_URL);
      expect(req.request.body).toBeNull();

      req.flush([]);
    });

    it('AQA-03 sets activeOnly=true through HttpParams', () => {
      track(service.getActiveJobs());

      const req = http.expectOne(
        request => request.url === JOBS_URL,
      );

      expect(req.request.params.get('activeOnly')).toBe('true');
      expect(req.request.urlWithParams)
        .toBe(`${JOBS_URL}?activeOnly=true`);

      req.flush([]);
    });

    it('AQA-04 sends no pagination or filter parameters', () => {
      track(service.getActiveJobs());

      const req = http.expectOne(
        request => request.url === JOBS_URL,
      );

      expect(req.request.params.keys()).toEqual(['activeOnly']);

      req.flush([]);
    });

    it('AQA-05 is cold and sends nothing until subscribed', () => {
      const source = service.getActiveJobs();

      http.expectNone(JOBS_URL);

      track(source);

      http.expectOne(request => request.url === JOBS_URL).flush([]);
    });

    it('AQA-06 returns a valid job list', () => {
      const jobs = [
        makeJob({ id: uuid(1), number: 'JC-1' }),
        makeJob({ id: uuid(2), number: 'JC-2', queuePosition: 2 }),
      ];

      const { outcome } = track(service.getActiveJobs());

      http.expectOne(request => request.url === JOBS_URL).flush(jobs);

      expect(outcome.values).toEqual([jobs]);
      expect(outcome.completed).toBe(true);
      expect(outcome.error).toBeUndefined();
    });

    it('AQA-07 supports an empty job list', () => {
      const { outcome } = track(service.getActiveJobs());

      http.expectOne(request => request.url === JOBS_URL).flush([]);

      expect(outcome.values).toEqual([[]]);
      expect(outcome.completed).toBe(true);
    });

    for (const body of [{}, { items: [] }, 'jobs', 42, null]) {
      it(`AQA-08 rejects a malformed response body (${JSON.stringify(
        body,
      )})`, () => {
        const { outcome } = track(service.getActiveJobs());

        http.expectOne(request => request.url === JOBS_URL).flush(body);

        expect(outcome.error).toBeInstanceOf(AdaptiveQueueResponseError);
        expect(outcome.values).toEqual([]);
        expect(outcome.completed).toBe(false);
      });
    }

    it('AQA-09 rejects a job with a missing required field', () => {
      const job = makeJob();
      delete job['queuePosition'];

      const { outcome } = track(service.getActiveJobs());

      http.expectOne(request => request.url === JOBS_URL).flush([job]);

      expect(outcome.error).toBeInstanceOf(AdaptiveQueueResponseError);
      expect((outcome.error as AdaptiveQueueResponseError).field)
        .toBe('jobs[0].queuePosition');
    });

    it('AQA-10 rejects duplicate job identities', () => {
      const { outcome } = track(service.getActiveJobs());

      http.expectOne(request => request.url === JOBS_URL).flush([
        makeJob({ id: uuid(1) }),
        makeJob({ id: uuid(1), number: 'JC-DUP' }),
      ]);

      expect(outcome.error).toBeInstanceOf(AdaptiveQueueResponseError);
      expect((outcome.error as AdaptiveQueueResponseError).field)
        .toBe('jobs[1].id');
      expect(outcome.values).toEqual([]);
    });

    for (const priority of [-1, 3, 1.5, '1']) {
      it(`AQA-11 rejects invalid priority ${JSON.stringify(
        priority,
      )}`, () => {
        const { outcome } = track(service.getActiveJobs());

        http.expectOne(request => request.url === JOBS_URL)
          .flush([makeJob({ priority })]);

        expect(outcome.error).toBeInstanceOf(AdaptiveQueueResponseError);
        expect((outcome.error as AdaptiveQueueResponseError).field)
          .toBe('jobs[0].priority');
      });
    }

    for (const queuePosition of [-1, 1.5, '2']) {
      it(`AQA-12 rejects invalid queue position ${JSON.stringify(
        queuePosition,
      )}`, () => {
        const { outcome } = track(service.getActiveJobs());

        http.expectOne(request => request.url === JOBS_URL)
          .flush([makeJob({ queuePosition })]);

        expect(outcome.error).toBeInstanceOf(AdaptiveQueueResponseError);
        expect((outcome.error as AdaptiveQueueResponseError).field)
          .toBe('jobs[0].queuePosition');
      });
    }

    it('AQA-13 accepts nullable ETA, mechanic and bay values', () => {
      const jobs = [
        makeJob({
          etaAt: null,
          mechanicId: null,
          mechanicName: null,
          bayId: null,
          bayName: null,
        }),
      ];

      const { outcome } = track(service.getActiveJobs());

      http.expectOne(request => request.url === JOBS_URL).flush(jobs);

      expect(outcome.values).toEqual([jobs]);
    });

    it('AQA-14 accepts anonymous walk-in Guid.Empty identities', () => {
      const jobs = [
        makeJob({
          customerId: EMPTY_GUID,
          vehicleId: EMPTY_GUID,
          customerName: 'Walk-in Customer',
        }),
      ];

      const { outcome } = track(service.getActiveJobs());

      http.expectOne(request => request.url === JOBS_URL).flush(jobs);

      expect(outcome.error).toBeUndefined();
      expect(outcome.values).toEqual([jobs]);
    });

    it('AQA-15 preserves the backend response order', () => {
      const jobs = [
        makeJob({ id: uuid(3), number: 'C', queuePosition: 3 }),
        makeJob({ id: uuid(1), number: 'A', queuePosition: 1 }),
        makeJob({ id: uuid(4), number: 'D', queuePosition: 0, status: 'InProgress' }),
        makeJob({ id: uuid(2), number: 'B', queuePosition: 2 }),
      ];

      const { outcome } = track(service.getActiveJobs());

      http.expectOne(request => request.url === JOBS_URL).flush(jobs);

      const result = outcome.values[0] as { readonly number: string }[];

      expect(result.map(job => job.number)).toEqual([
        'C',
        'A',
        'D',
        'B',
      ]);
    });

    it('AQA-16 preserves queuePosition, priority and etaAt exactly', () => {
      const jobs = [
        makeJob({
          id: uuid(1),
          priority: 2,
          queuePosition: 7,
          etaAt: '2026-11-27T08:30:00Z',
        }),
        makeJob({
          id: uuid(2),
          priority: 1,
          queuePosition: 9,
          etaAt: '2026-11-27T08:30:00.1234567',
        }),
      ];

      const { outcome } = track(service.getActiveJobs());

      http.expectOne(request => request.url === JOBS_URL).flush(jobs);

      const result = outcome.values[0] as {
        readonly priority: number;
        readonly queuePosition: number;
        readonly etaAt: string | null;
      }[];

      expect(result.map(job => job.priority)).toEqual([2, 1]);
      expect(result.map(job => job.queuePosition)).toEqual([7, 9]);
      expect(result.map(job => job.etaAt)).toEqual([
        '2026-11-27T08:30:00Z',
        '2026-11-27T08:30:00.1234567',
      ]);
    });

    it('AQA-17 does not fabricate queueOrder, source or appointmentId', () => {
      const { outcome } = track(service.getActiveJobs());

      http.expectOne(request => request.url === JOBS_URL).flush([
        makeJob(),
      ]);

      const [job] = outcome.values[0] as Record<string, unknown>[];

      expect(Object.keys(job).sort()).toEqual(
        Object.keys(makeJob()).sort(),
      );
      expect(job).not.toHaveProperty('queueOrder');
      expect(job).not.toHaveProperty('source');
      expect(job).not.toHaveProperty('appointmentId');
    });

    it('AQA-18 returns a response containing 200 jobs', () => {
      const jobs = Array.from({ length: 200 }, (_, index) =>
        makeJob({ id: uuid(index + 1), queuePosition: index + 1 }),
      );

      const { outcome } = track(service.getActiveJobs());

      http.expectOne(request => request.url === JOBS_URL).flush(jobs);

      expect(outcome.error).toBeUndefined();
      expect(outcome.values[0]).toHaveLength(200);
    });

    it('AQA-19 does not truncate or filter the response', () => {
      const jobs = [
        ...Array.from({ length: 200 }, (_, index) =>
          makeJob({ id: uuid(index + 1), queuePosition: index + 1 }),
        ),
        makeJob({ id: uuid(900), status: 'Completed' }),
      ];

      const { outcome } = track(service.getActiveJobs());

      http.expectOne(request => request.url === JOBS_URL).flush(jobs);

      expect(outcome.values[0]).toHaveLength(201);
    });
  });

  describe('getBays', () => {
    it('AQA-20 sends one GET to the bays URL without parameters', () => {
      track(service.getBays());

      const req = http.expectOne(BAYS_URL);

      expect(req.request.method).toBe('GET');
      expect(req.request.params.keys()).toEqual([]);
      expect(req.request.body).toBeNull();

      req.flush([]);
    });

    it('AQA-21 reuses BookingActionApiService.getBays', () => {
      const bays: BayDto[] = [
        { id: uuid(100), name: 'Bay 1', active: true },
      ];
      const spy = vi
        .spyOn(TestBed.inject(BookingActionApiService), 'getBays')
        .mockReturnValue(of(bays));

      const { outcome } = track(service.getBays());

      expect(spy).toHaveBeenCalledTimes(1);
      expect(outcome.values).toEqual([bays]);
    });

    it('AQA-22 preserves active and inactive bays in backend order', () => {
      const bays = [
        makeBay({ id: uuid(103), name: 'Bay 3', active: false }),
        makeBay({ id: uuid(101), name: 'Bay 1', active: true }),
        makeBay({ id: uuid(102), name: 'Bay 2', active: true }),
      ];

      const { outcome } = track(service.getBays());

      http.expectOne(BAYS_URL).flush(bays);

      expect(outcome.values).toEqual([bays]);
    });

    it('AQA-23 supports an empty bay list', () => {
      const { outcome } = track(service.getBays());

      http.expectOne(BAYS_URL).flush([]);

      expect(outcome.values).toEqual([[]]);
      expect(outcome.completed).toBe(true);
    });

    it('AQA-24 rejects duplicate bay identities', () => {
      const { outcome } = track(service.getBays());

      http.expectOne(BAYS_URL).flush([
        makeBay({ id: uuid(100), name: 'Bay 1' }),
        makeBay({ id: uuid(101), name: 'Bay 2' }),
        makeBay({ id: uuid(100), name: 'Bay 1 copy' }),
      ]);

      expect(outcome.error).toBeInstanceOf(AdaptiveQueueResponseError);
      expect((outcome.error as AdaptiveQueueResponseError).field)
        .toBe('bays[2].id');
      expect(outcome.values).toEqual([]);
    });

    for (const body of [{}, null, 'bays']) {
      it(`AQA-25 rejects a malformed bay response (${JSON.stringify(
        body,
      )})`, () => {
        const { outcome } = track(service.getBays());

        http.expectOne(BAYS_URL).flush(body);

        expect(outcome.error).toBeInstanceOf(Error);
        expect(classifyAdaptiveQueueError(outcome.error))
          .toBe('invalid-response');
        expect(outcome.values).toEqual([]);
      });
    }

    it('AQA-26 returns bays without computed occupancy fields', () => {
      const { outcome } = track(service.getBays());

      http.expectOne(BAYS_URL).flush([makeBay()]);

      const [bay] = outcome.values[0] as Record<string, unknown>[];

      expect(Object.keys(bay).sort()).toEqual(['active', 'id', 'name']);
    });
  });

  describe('getMechanics', () => {
    it('AQA-27 sends one GET to the mechanics URL without parameters', () => {
      track(service.getMechanics());

      const req = http.expectOne(MECHANICS_URL);

      expect(req.request.method).toBe('GET');
      expect(req.request.params.keys()).toEqual([]);
      expect(req.request.body).toBeNull();

      req.flush([]);
    });

    it('AQA-28 reuses BookingActionApiService.getMechanics', () => {
      const mechanics: MechanicRosterDto[] = [
        {
          id: uuid(200),
          name: 'Nimal',
          phone: '0770000000',
          employeeCode: 'EMP-001',
          onDuty: true,
          activeJobs: 2,
        },
      ];
      const spy = vi
        .spyOn(TestBed.inject(BookingActionApiService), 'getMechanics')
        .mockReturnValue(of(mechanics));

      const { outcome } = track(service.getMechanics());

      expect(spy).toHaveBeenCalledTimes(1);
      expect(outcome.values).toEqual([mechanics]);
    });

    it('AQA-29 preserves onDuty and activeJobs values', () => {
      const mechanics = [
        makeMechanic({ id: uuid(200), onDuty: true, activeJobs: 3 }),
        makeMechanic({ id: uuid(201), onDuty: false, activeJobs: 0 }),
      ];

      const { outcome } = track(service.getMechanics());

      http.expectOne(MECHANICS_URL).flush(mechanics);

      expect(outcome.values).toEqual([mechanics]);
    });

    it('AQA-30 supports an empty mechanic roster', () => {
      const { outcome } = track(service.getMechanics());

      http.expectOne(MECHANICS_URL).flush([]);

      expect(outcome.values).toEqual([[]]);
    });

    for (const body of [
      [makeMechanic({ onDuty: 'yes' })],
      [makeMechanic({ activeJobs: -1 })],
      [makeMechanic({ id: 'not-a-uuid' })],
      {},
    ]) {
      it(`AQA-31 rejects an invalid mechanic response (${JSON.stringify(
        body,
      ).slice(0, 40)})`, () => {
        const { outcome } = track(service.getMechanics());

        http.expectOne(MECHANICS_URL).flush(body);

        expect(classifyAdaptiveQueueError(outcome.error))
          .toBe('invalid-response');
        expect(outcome.values).toEqual([]);
      });
    }

    it('AQA-32 fails independently of the jobs and bays requests', () => {
      const jobs = track(service.getActiveJobs());
      const bays = track(service.getBays());
      const mechanics = track(service.getMechanics());

      http.expectOne(request => request.url === JOBS_URL)
        .flush([makeJob()]);
      http.expectOne(BAYS_URL).flush([makeBay()]);
      http.expectOne(MECHANICS_URL).flush(
        { message: SENSITIVE },
        { status: 500, statusText: 'Server Error' },
      );

      expect(jobs.outcome.completed).toBe(true);
      expect(jobs.outcome.values).toHaveLength(1);
      expect(bays.outcome.completed).toBe(true);
      expect(bays.outcome.values).toHaveLength(1);
      expect(mechanics.outcome.error).toBeInstanceOf(ApiError);
      expect(mechanics.outcome.values).toEqual([]);
    });
  });

  describe('HTTP failures', () => {
    for (const operation of OPERATIONS) {
      for (const failure of FAILURES) {
        it(`AQA-33 ${operation.name} propagates HTTP ${failure.status} as ApiError`, () => {
          const { outcome } = track(operation.call(service));

          http
            .expectOne(request => request.url === operation.url)
            .flush(
              { message: SENSITIVE },
              { status: failure.status, statusText: 'Failure' },
            );

          expect(outcome.error).toBeInstanceOf(ApiError);
          expect((outcome.error as ApiError).status)
            .toBe(failure.status);
          expect((outcome.error as ApiError).code).toBe(failure.code);
          expect(classifyAdaptiveQueueError(outcome.error))
            .toBe(failure.kind);
          expect(outcome.values).toEqual([]);
          expect(outcome.completed).toBe(false);
        });
      }

      it(`AQA-34 ${operation.name} propagates a network failure`, () => {
        const { outcome } = track(operation.call(service));

        http
          .expectOne(request => request.url === operation.url)
          .error(new ProgressEvent('error'));

        expect(outcome.error).toBeInstanceOf(ApiError);
        expect((outcome.error as ApiError).code).toBe('NETWORK_ERROR');
        expect(classifyAdaptiveQueueError(outcome.error))
          .toBe('network-failure');
        expect(outcome.values).toEqual([]);
        expect(outcome.completed).toBe(false);
      });

      it(`AQA-35 ${operation.name} errors map to safe user messages`, () => {
        const { outcome } = track(operation.call(service));

        http
          .expectOne(request => request.url === operation.url)
          .flush(
            { message: SENSITIVE },
            { status: 500, statusText: 'Server Error' },
          );

        const resolution = resolveAdaptiveQueueError(
          outcome.error,
          'read',
        );

        expect(resolution.kind).toBe('server-failure');
        expect(resolution.message).not.toContain('hunter2');
        expect(resolution.message).not.toContain('SqlException');
      });

      it(`AQA-36 ${operation.name} does not retry after a failure`, async () => {
        const { outcome } = track(operation.call(service));

        http
          .expectOne(request => request.url === operation.url)
          .flush(null, { status: 500, statusText: 'Server Error' });

        await new Promise(resolve => setTimeout(resolve, 20));

        http.expectNone(request => request.url === operation.url);
        expect(outcome.error).toBeInstanceOf(ApiError);
      });
    }
  });

  describe('API configuration', () => {
    for (const operation of OPERATIONS) {
      for (const baseUrl of [
        null,
        '',
        '   ',
        'http://api.example.test',
      ]) {
        it(`AQA-37 ${operation.name} fails without a request when baseUrl is ${JSON.stringify(
          baseUrl,
        )}`, () => {
          config.baseUrl = baseUrl;

          let source: Observable<unknown> | undefined;

          expect(() => {
            source = operation.call(service);
          }).not.toThrow();

          const { outcome } = track(source as Observable<unknown>);

          http.expectNone(() => true);

          expect(outcome.error).toBeInstanceOf(Error);
          expect(outcome.error).not.toBeInstanceOf(ApiError);
          expect(outcome.values).toEqual([]);
          expect(outcome.completed).toBe(false);
          expect(classifyAdaptiveQueueError(outcome.error))
            .toBe('unknown');
        });
      }
    }
  });

  describe('cancellation', () => {
    for (const operation of OPERATIONS) {
      it(`AQA-38 ${operation.name} cancels the request when unsubscribed`, () => {
        const { outcome, unsubscribe } = track(operation.call(service));

        const req = http.expectOne(
          request => request.url === operation.url,
        );

        expect(req.cancelled).toBe(false);

        unsubscribe();

        expect(req.cancelled).toBe(true);
        expect(outcome.values).toEqual([]);
        expect(outcome.error).toBeUndefined();
        expect(outcome.completed).toBe(false);
      });
    }
  });

  describe('authentication and request safety', () => {
    function createSession(): void {
      session.setSession({
        accessToken: 'test-access-token',
        expiresAt: Date.now() + 60_000,
        user: {
          id: 'test-manager-001',
          displayName: 'Test Manager',
          email: 'manager@example.test',
          roles: ['Manager'],
        },
      });
    }

    for (const operation of OPERATIONS) {
      it(`AQA-39 ${operation.name} receives the Bearer token from the existing interceptor`, () => {
        createSession();

        track(operation.call(service));

        const req = http.expectOne(
          request => request.url === operation.url,
        );

        expect(req.request.headers.get('Authorization'))
          .toBe('Bearer test-access-token');
        expect(req.request.urlWithParams).not.toContain(
          'test-access-token',
        );

        req.flush([]);
      });

      it(`AQA-40 ${operation.name} sends no Authorization header without a session`, () => {
        track(operation.call(service));

        const req = http.expectOne(
          request => request.url === operation.url,
        );

        expect(req.request.headers.has('Authorization')).toBe(false);

        req.flush([]);
      });
    }

    it('AQA-41 issues only GET requests across all operations', () => {
      for (const operation of OPERATIONS) {
        track(operation.call(service));
      }

      const requests = http.match(() => true);

      expect(requests).toHaveLength(3);
      expect(requests.map(req => req.request.method))
        .toEqual(['GET', 'GET', 'GET']);

      for (const req of requests) {
        req.flush([]);
      }
    });

    it('AQA-42 sends exactly one request per operation', () => {
      for (const operation of OPERATIONS) {
        track(operation.call(service));

        const matching = http.match(
          request => request.url === operation.url,
        );

        expect(matching).toHaveLength(1);

        matching[0].flush([]);
      }
    });

    it('AQA-43 exposes read operations only', () => {
      const methods = Object.getOwnPropertyNames(
        AdaptiveQueueApiService.prototype,
      )
        .filter(name => name !== 'constructor')
        .sort();

      expect(methods).toEqual([
        'getActiveJobs',
        'getBays',
        'getMechanics',
      ]);
    });
  });
});
