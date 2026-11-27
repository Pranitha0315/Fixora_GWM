import {
  provideHttpClient,
  HttpErrorResponse,
} from '@angular/common/http';

import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { TestBed } from '@angular/core/testing';

import { ApiUrlService } from '../../../core/config/api-url.service';

import { BookingActionApiService } from './booking-action-api.service';

import { BookingRequestError } from '../utils/booking-action.validator';

import { BookingResponseError } from '../utils/booking-response.validator';

import type { Booking } from '../models/booking.model';

import type {
  ConfirmBookingRequest,
  WalkInRequest,
  AssignJobRequest,
} from '../models/booking-action.model';

import type {
  JobSummaryDto,
} from '../models/booking-support.model';

const BASE = 'https://localhost:7080/api/v1/manager';

const ID = '10000000-0000-4000-8000-000000000001';
const OTHER_ID = '10000000-0000-4000-8000-000000000002';

const EMPTY_ID = '00000000-0000-0000-0000-000000000000';

const FUTURE_SLOT = '2099-12-01T04:30:00Z';

const MECHANIC = {
  id: ID,
  name: 'Test Mechanic',
  phone: '0770000000',
  employeeCode: 'EMP-001',
  onDuty: true,
  activeJobs: 1,
};

const BAY = {
  id: ID,
  name: 'Bay 1',
  active: true,
};

const SERVICE = {
  id: ID,
  name: 'General Service',
  category: 'Maintenance',
  standardMinutes: 60,
  basePrice: 2500,
};

const SLOT = {
  start: FUTURE_SLOT,
  end: '2099-12-01T05:30:00Z',
  freeBays: 1,
};

const BOOKING: Booking = {
  id: ID,
  customerId: ID,
  customerName: 'Test Customer',
  vehicleId: ID,
  vehicleLabel: 'Test Vehicle',
  serviceId: ID,
  serviceName: 'General Service',
  slotStart: FUTURE_SLOT,
  slotEnd: SLOT.end,
  status: 'Confirmed',
  source: 'App',
  jobCardId: null,
  bayId: ID,
  bayName: 'Bay 1',
  mechanicId: ID,
  mechanicName: 'Test Mechanic',
  notes: null,
  managerNote: null,
  promoCode: null,
  declineReason: null,
  createdAt: '2026-11-25T04:30:00Z',
};

const JOB: JobSummaryDto = {
  id: ID,
  number: 'JOB-001',
  customerId: ID,
  customerName: 'Test Customer',
  vehicleId: ID,
  vehicleLabel: 'Test Vehicle',
  mechanicId: ID,
  mechanicName: 'Test Mechanic',
  bayId: ID,
  bayName: 'Bay 1',
  status: 'Open',
  priority: 0,
  queuePosition: 1,
  etaAt: FUTURE_SLOT,
  estimatedMinutes: 60,
  elapsedMinutes: 0,
  createdAt: '2026-11-25T04:30:00Z',
  startedAt: null,
  completedAt: null,
  complaint: null,
  managerNote: null,
};

const CONFIRM: ConfirmBookingRequest = {
  bayId: ID,
  mechanicId: ID,
  note: 'Internal instruction',
};

const WALK_IN: WalkInRequest = {
  customerId: null,
  customerName: 'Test Customer',
  vehicleId: null,
  vehicleLabel: 'Test Vehicle',
  serviceId: ID,
  bayId: ID,
  mechanicId: ID,
  priority: 0,
  complaint: 'Brake noise',
};

const ASSIGN: AssignJobRequest = {
  mechanicId: ID,
  bayId: ID,
};

describe('BookingActionApiService', () => {
  let service: BookingActionApiService;
  let http: HttpTestingController;
  let resolvedPaths: string[];

  beforeEach(() => {
    resolvedPaths = [];

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        BookingActionApiService,
        {
          provide: ApiUrlService,
          useValue: {
            resolve: (path: string) => {
              resolvedPaths.push(path);
              return `https://localhost:7080/${path}`;
            },
          },
        },
      ],
    });

    service = TestBed.inject(BookingActionApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('BAS-01 creates the service', () => {
    expect(service).toBeTruthy();
  });

  it('BAS-02 retrieves mechanics using GET', () => {
    service.getMechanics().subscribe(value => {
      expect(value).toEqual([MECHANIC]);
    });

    const req = http.expectOne(`${BASE}/mechanics`);

    expect(req.request.method).toBe('GET');
    expect(req.request.body).toBeNull();

    req.flush([MECHANIC]);
  });

  it('BAS-03 preserves off-duty mechanics', () => {
    service.getMechanics().subscribe(value => {
      expect(value[0]?.onDuty).toBe(false);
    });

    http.expectOne(`${BASE}/mechanics`).flush([
      { ...MECHANIC, onDuty: false },
    ]);
  });

  it('BAS-04 rejects malformed mechanic responses', () => {
    let failure: unknown;

    service.getMechanics().subscribe({
      error: error => failure = error,
    });

    http.expectOne(`${BASE}/mechanics`).flush([
      { ...MECHANIC, onDuty: 'invalid' },
    ]);

    expect(failure).toBeInstanceOf(BookingResponseError);
  });

  it('BAS-05 retrieves bays using GET', () => {
    service.getBays().subscribe(value => {
      expect(value).toEqual([BAY]);
    });

    const req = http.expectOne(`${BASE}/settings/bays`);

    expect(req.request.method).toBe('GET');

    req.flush([BAY]);
  });

  it('BAS-06 preserves inactive bay information', () => {
    service.getBays().subscribe(value => {
      expect(value[0]?.active).toBe(false);
    });

    http.expectOne(`${BASE}/settings/bays`).flush([
      { ...BAY, active: false },
    ]);
  });

  it('BAS-07 rejects malformed bay responses', () => {
    let failure: unknown;

    service.getBays().subscribe({
      error: error => failure = error,
    });

    http.expectOne(`${BASE}/settings/bays`).flush({});

    expect(failure).toBeInstanceOf(BookingResponseError);
  });

  it('BAS-08 retrieves services using GET', () => {
    service.getServices().subscribe(value => {
      expect(value).toEqual([SERVICE]);
    });

    const req = http.expectOne(`${BASE}/settings/services`);

    expect(req.request.method).toBe('GET');

    req.flush([SERVICE]);
  });

  it('BAS-09 rejects malformed service responses', () => {
    let failure: unknown;

    service.getServices().subscribe({
      error: error => failure = error,
    });

    http.expectOne(`${BASE}/settings/services`).flush([
      { ...SERVICE, basePrice: 'invalid' },
    ]);

    expect(failure).toBeInstanceOf(BookingResponseError);
  });

  it('BAS-10 retrieves slots with exact query parameters', () => {
    service.getSlots({
      date: '2099-12-01',
      serviceId: ID,
    }).subscribe(value => {
      expect(value).toEqual([SLOT]);
    });

    const req = http.expectOne(
      request => request.url === `${BASE}/bookings/slots`,
    );

    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('date')).toBe('2099-12-01');
    expect(req.request.params.get('serviceId')).toBe(ID);
    expect(req.request.params.keys().length).toBe(2);

    req.flush([SLOT]);
  });

  it('BAS-11 accepts an empty slot list', () => {
    service.getSlots({
      date: '2099-12-01',
      serviceId: ID,
    }).subscribe(value => {
      expect(value).toEqual([]);
    });

    http.expectOne(
      request => request.url === `${BASE}/bookings/slots`,
    ).flush([]);
  });

  it('BAS-12 rejects invalid slot dates before HTTP', () => {
    let failure: unknown;

    service.getSlots({
      date: 'invalid',
      serviceId: ID,
    }).subscribe({
      error: error => failure = error,
    });

    expect(failure).toBeInstanceOf(BookingRequestError);
    http.expectNone(() => true);
  });

  it('BAS-13 rejects invalid slot service IDs', () => {
    let failure: unknown;

    service.getSlots({
      date: '2099-12-01',
      serviceId: 'invalid',
    }).subscribe({
      error: error => failure = error,
    });

    expect(failure).toBeInstanceOf(BookingRequestError);
    http.expectNone(() => true);
  });

  it('BAS-14 rejects malformed slot responses', () => {
    let failure: unknown;

    service.getSlots({
      date: '2099-12-01',
      serviceId: ID,
    }).subscribe({
      error: error => failure = error,
    });

    http.expectOne(
      request => request.url === `${BASE}/bookings/slots`,
    ).flush([{ ...SLOT, freeBays: -1 }]);

    expect(failure).toBeInstanceOf(BookingResponseError);
  });

  it('BAS-15 confirms a booking using POST', () => {
    service.confirmBooking(ID, CONFIRM).subscribe(value => {
      expect(value).toEqual(BOOKING);
    });

    const req = http.expectOne(`${BASE}/bookings/${ID}/confirm`);

    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(CONFIRM);

    req.flush(BOOKING);
  });

  it('BAS-16 preserves the returned Manager Note', () => {
    service.confirmBooking(ID, CONFIRM).subscribe(value => {
      expect(value.managerNote).toBe(CONFIRM.note);
      expect(value.notes).toBe('Customer complaint');
    });

    http.expectOne(`${BASE}/bookings/${ID}/confirm`).flush({
      ...BOOKING,
      notes: 'Customer complaint',
      managerNote: CONFIRM.note,
    });
  });

  it('BAS-17 rejects invalid booking resource IDs', () => {
    let failure: unknown;

    service.confirmBooking('invalid', CONFIRM).subscribe({
      error: error => failure = error,
    });

    expect(failure).toBeInstanceOf(BookingRequestError);
    http.expectNone(() => true);
  });

  it('BAS-18 rejects empty booking resource IDs', () => {
    let failure: unknown;

    service.confirmBooking(EMPTY_ID, CONFIRM).subscribe({
      error: error => failure = error,
    });

    expect(failure).toBeInstanceOf(BookingRequestError);
    http.expectNone(() => true);
  });

  it('BAS-19 rejects invalid confirmation assignments', () => {
    let failure: unknown;

    service.confirmBooking(ID, {
      ...CONFIRM,
      mechanicId: 'invalid',
    }).subscribe({
      error: error => failure = error,
    });

    expect(failure).toBeInstanceOf(BookingRequestError);
    http.expectNone(() => true);
  });

  it('BAS-20 rejects Manager Notes above 500 characters', () => {
    let failure: unknown;

    service.confirmBooking(ID, {
      ...CONFIRM,
      note: 'x'.repeat(501),
    }).subscribe({
      error: error => failure = error,
    });

    expect(failure).toBeInstanceOf(BookingRequestError);
    http.expectNone(() => true);
  });

  it('BAS-21 rejects a mismatched booking response ID', () => {
    let failure: unknown;

    service.confirmBooking(ID, CONFIRM).subscribe({
      error: error => failure = error,
    });

    http.expectOne(`${BASE}/bookings/${ID}/confirm`).flush({
      ...BOOKING,
      id: OTHER_ID,
    });

    expect(failure).toBeInstanceOf(BookingResponseError);
  });

  it('BAS-22 declines a booking using POST', () => {
    const body = { reason: 'Workshop unavailable' };

    service.declineBooking(ID, body).subscribe(value => {
      expect(value.status).toBe('Declined');
    });

    const req = http.expectOne(`${BASE}/bookings/${ID}/decline`);

    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);

    req.flush({
      ...BOOKING,
      status: 'Declined',
      declineReason: body.reason,
    });
  });

  it('BAS-23 rejects a blank decline reason', () => {
    let failure: unknown;

    service.declineBooking(ID, {
      reason: '   ',
    }).subscribe({
      error: error => failure = error,
    });

    expect(failure).toBeInstanceOf(BookingRequestError);
    http.expectNone(() => true);
  });

  it('BAS-24 reschedules a booking using POST', () => {
    const body = { slotStart: FUTURE_SLOT };

    service.rescheduleBooking(ID, body).subscribe(value => {
      expect(value.slotStart).toBe(FUTURE_SLOT);
    });

    const req = http.expectOne(
      `${BASE}/bookings/${ID}/reschedule`,
    );

    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);

    req.flush(BOOKING);
  });

  it('BAS-25 rejects an invalid reschedule timestamp', () => {
    let failure: unknown;

    service.rescheduleBooking(ID, {
      slotStart: 'invalid',
    }).subscribe({
      error: error => failure = error,
    });

    expect(failure).toBeInstanceOf(BookingRequestError);
    http.expectNone(() => true);
  });

  it('BAS-26 creates a walk-in using POST', () => {
    service.createWalkIn(WALK_IN).subscribe(value => {
      expect(value).toEqual(JOB);
    });

    const req = http.expectOne(`${BASE}/bookings/walk-in`);

    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(WALK_IN);

    req.flush(JOB);
  });

  it('BAS-27 sends High priority correctly', () => {
    service.createWalkIn({
      ...WALK_IN,
      priority: 1,
    }).subscribe(value => {
      expect(value.priority).toBe(1);
    });

    const req = http.expectOne(`${BASE}/bookings/walk-in`);

    expect(req.request.body.priority).toBe(1);

    req.flush({ ...JOB, priority: 1 });
  });

  it('BAS-28 sends Urgent priority correctly', () => {
    service.createWalkIn({
      ...WALK_IN,
      priority: 2,
    }).subscribe(value => {
      expect(value.priority).toBe(2);
    });

    const req = http.expectOne(`${BASE}/bookings/walk-in`);

    expect(req.request.body.priority).toBe(2);

    req.flush({ ...JOB, priority: 2 });
  });

  it('BAS-29 rejects invalid walk-in priority', () => {
    let failure: unknown;

    const invalid = {
      ...WALK_IN,
      priority: 999,
    } as unknown as WalkInRequest;

    service.createWalkIn(invalid).subscribe({
      error: error => failure = error,
    });

    expect(failure).toBeInstanceOf(BookingRequestError);
    http.expectNone(() => true);
  });

  it('BAS-30 rejects a blank walk-in customer name', () => {
    let failure: unknown;

    service.createWalkIn({
      ...WALK_IN,
      customerName: ' ',
    }).subscribe({
      error: error => failure = error,
    });

    expect(failure).toBeInstanceOf(BookingRequestError);
    http.expectNone(() => true);
  });

  it('BAS-31 rejects malformed walk-in responses', () => {
    let failure: unknown;

    service.createWalkIn(WALK_IN).subscribe({
      error: error => failure = error,
    });

    http.expectOne(`${BASE}/bookings/walk-in`).flush({});

    expect(failure).toBeInstanceOf(BookingResponseError);
  });

  it('BAS-32 assigns a job using the job endpoint', () => {
    service.assignJob(ID, ASSIGN).subscribe(value => {
      expect(value).toEqual(JOB);
    });

    const req = http.expectOne(`${BASE}/jobs/${ID}/assign`);

    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(ASSIGN);

    req.flush(JOB);
  });

  it('BAS-33 rejects invalid job IDs', () => {
    let failure: unknown;

    service.assignJob('invalid', ASSIGN).subscribe({
      error: error => failure = error,
    });

    expect(failure).toBeInstanceOf(BookingRequestError);
    http.expectNone(() => true);
  });

  it('BAS-34 rejects invalid job assignment payloads', () => {
    let failure: unknown;

    service.assignJob(ID, {
      ...ASSIGN,
      bayId: 'invalid',
    }).subscribe({
      error: error => failure = error,
    });

    expect(failure).toBeInstanceOf(BookingRequestError);
    http.expectNone(() => true);
  });

  it('BAS-35 rejects a mismatched job response ID', () => {
    let failure: unknown;

    service.assignJob(ID, ASSIGN).subscribe({
      error: error => failure = error,
    });

    http.expectOne(`${BASE}/jobs/${ID}/assign`).flush({
      ...JOB,
      id: OTHER_ID,
    });

    expect(failure).toBeInstanceOf(BookingResponseError);
  });

  it('BAS-36 defers GET until subscription', () => {
    const result = service.getMechanics();

    http.expectNone(() => true);
    expect(resolvedPaths).toEqual([]);

    result.subscribe();

    http.expectOne(`${BASE}/mechanics`).flush([]);
  });

  it('BAS-37 defers POST until subscription', () => {
    const result = service.confirmBooking(ID, CONFIRM);

    http.expectNone(() => true);
    expect(resolvedPaths).toEqual([]);

    result.subscribe();

    http.expectOne(`${BASE}/bookings/${ID}/confirm`)
      .flush(BOOKING);
  });

  it('BAS-38 uses the shared API URL resolver', () => {
    service.getBays().subscribe();

    expect(resolvedPaths).toEqual([
      'api/v1/manager/settings/bays',
    ]);

    http.expectOne(`${BASE}/settings/bays`).flush([]);
  });

  it('BAS-39 propagates HTTP 409 without retrying', () => {
    let failure: HttpErrorResponse | undefined;

    service.confirmBooking(ID, CONFIRM).subscribe({
      error: error => failure = error,
    });

    http.expectOne(`${BASE}/bookings/${ID}/confirm`).flush(
      { code: 'mechanic_busy' },
      { status: 409, statusText: 'Conflict' },
    );

    expect(failure?.status).toBe(409);
    http.expectNone(() => true);
  });

  it('BAS-40 propagates HTTP 400 without retrying', () => {
    let failure: HttpErrorResponse | undefined;

    service.createWalkIn(WALK_IN).subscribe({
      error: error => failure = error,
    });

    http.expectOne(`${BASE}/bookings/walk-in`).flush(
      {},
      { status: 400, statusText: 'Bad Request' },
    );

    expect(failure?.status).toBe(400);
    http.expectNone(() => true);
  });

  it('BAS-41 propagates HTTP 401 errors', () => {
    let failure: HttpErrorResponse | undefined;

    service.getMechanics().subscribe({
      error: error => failure = error,
    });

    http.expectOne(`${BASE}/mechanics`).flush(
      {},
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(failure?.status).toBe(401);
  });

  it('BAS-42 propagates HTTP 403 errors', () => {
    let failure: HttpErrorResponse | undefined;

    service.assignJob(ID, ASSIGN).subscribe({
      error: error => failure = error,
    });

    http.expectOne(`${BASE}/jobs/${ID}/assign`).flush(
      {},
      { status: 403, statusText: 'Forbidden' },
    );

    expect(failure?.status).toBe(403);
  });

  it('BAS-43 propagates HTTP 404 errors', () => {
    let failure: HttpErrorResponse | undefined;

    service.declineBooking(ID, {
      reason: 'Unavailable',
    }).subscribe({
      error: error => failure = error,
    });

    http.expectOne(`${BASE}/bookings/${ID}/decline`).flush(
      {},
      { status: 404, statusText: 'Not Found' },
    );

    expect(failure?.status).toBe(404);
  });

  it('BAS-44 propagates HTTP 500 without retrying', () => {
    let failure: HttpErrorResponse | undefined;

    service.createWalkIn(WALK_IN).subscribe({
      error: error => failure = error,
    });

    http.expectOne(`${BASE}/bookings/walk-in`).flush(
      {},
      { status: 500, statusText: 'Server Error' },
    );

    expect(failure?.status).toBe(500);
    http.expectNone(() => true);
  });

  it('BAS-46 retrieves nested job details using GET', () => {
    let result: JobSummaryDto | undefined;

    service.getJobDetails(ID).subscribe(value => result = value);

    const req = http.expectOne(`${BASE}/jobs/${ID}`);

    expect(req.request.method).toBe('GET');
    expect(req.request.body).toBeNull();

    req.flush({
      job: JOB,
      timeline: [],
      issues: [],
      proposals: [],
      changeRequests: [],
      invoice: null,
      queue: {},
    });

    expect(result).toEqual(JOB);
  });

  it('BAS-47 defers job details GET until subscription', () => {
    const result = service.getJobDetails(ID);

    http.expectNone(() => true);
    expect(resolvedPaths).toEqual([]);

    result.subscribe();

    http.expectOne(`${BASE}/jobs/${ID}`).flush({ job: JOB });
  });

  it('BAS-48 uses the shared API URL resolver', () => {
    service.getJobDetails(ID).subscribe();

    expect(resolvedPaths).toEqual([
      `api/v1/manager/jobs/${ID}`,
    ]);

    http.expectOne(`${BASE}/jobs/${ID}`).flush({ job: JOB });
  });

  it('BAS-49 rejects malformed job resource IDs', () => {
    let failure: unknown;

    service.getJobDetails('invalid').subscribe({
      error: error => failure = error,
    });

    expect(failure).toBeInstanceOf(BookingRequestError);
    http.expectNone(() => true);
  });

  it('BAS-50 rejects empty GUID job resource IDs', () => {
    let failure: unknown;

    service.getJobDetails(EMPTY_ID).subscribe({
      error: error => failure = error,
    });

    expect(failure).toBeInstanceOf(BookingRequestError);
    http.expectNone(() => true);
  });

  it('BAS-51 rejects null response envelopes', () => {
    let failure: unknown;

    service.getJobDetails(ID).subscribe({
      error: error => failure = error,
    });

    http.expectOne(`${BASE}/jobs/${ID}`).flush(null);

    expect(failure).toBeInstanceOf(BookingResponseError);
  });

  it('BAS-52 rejects array response envelopes', () => {
    let failure: unknown;

    service.getJobDetails(ID).subscribe({
      error: error => failure = error,
    });

    http.expectOne(`${BASE}/jobs/${ID}`).flush([JOB]);

    expect(failure).toBeInstanceOf(BookingResponseError);
  });

  it('BAS-53 rejects missing nested job properties', () => {
    let failure: unknown;

    service.getJobDetails(ID).subscribe({
      error: error => failure = error,
    });

    http.expectOne(`${BASE}/jobs/${ID}`).flush({});

    expect(failure).toBeInstanceOf(BookingResponseError);
  });

  it('BAS-54 rejects null nested jobs', () => {
    let failure: unknown;

    service.getJobDetails(ID).subscribe({
      error: error => failure = error,
    });

    http.expectOne(`${BASE}/jobs/${ID}`).flush({
      job: null,
    });

    expect(failure).toBeInstanceOf(BookingResponseError);
  });

  it('BAS-55 rejects malformed job assignment fields', () => {
    let failure: unknown;

    service.getJobDetails(ID).subscribe({
      error: error => failure = error,
    });

    http.expectOne(`${BASE}/jobs/${ID}`).flush({
      job: { ...JOB, mechanicId: 'invalid' },
    });

    expect(failure).toBeInstanceOf(BookingResponseError);
  });

  it('BAS-56 rejects mismatched job identities', () => {
    let failure: unknown;

    service.getJobDetails(ID).subscribe({
      error: error => failure = error,
    });

    http.expectOne(`${BASE}/jobs/${ID}`).flush({
      job: { ...JOB, id: OTHER_ID },
    });

    expect(failure).toBeInstanceOf(BookingResponseError);
  });

  it('BAS-57 accepts matching GUIDs regardless of case', () => {
    const jobId = 'abcdefab-0000-4000-8000-000000000001';
    let result: JobSummaryDto | undefined;

    service.getJobDetails(jobId).subscribe(
      value => result = value,
    );

    http.expectOne(`${BASE}/jobs/${jobId}`).flush({
      job: { ...JOB, id: jobId.toUpperCase() },
    });

    expect(result?.id).toBe(jobId.toUpperCase());
  });

  it('BAS-58 preserves unassigned job resources', () => {
    let result: JobSummaryDto | undefined;

    service.getJobDetails(ID).subscribe(
      value => result = value,
    );

    http.expectOne(`${BASE}/jobs/${ID}`).flush({
      job: {
        ...JOB,
        mechanicId: null,
        mechanicName: null,
        bayId: null,
        bayName: null,
      },
    });

    expect(result?.mechanicId).toBeNull();
    expect(result?.bayId).toBeNull();
  });

  it('BAS-59 propagates job not found without retry', () => {
    let failure: HttpErrorResponse | undefined;

    service.getJobDetails(ID).subscribe({
      error: error => failure = error,
    });

    http.expectOne(`${BASE}/jobs/${ID}`).flush(
      {},
      { status: 404, statusText: 'Not Found' },
    );

    expect(failure?.status).toBe(404);
    http.expectNone(() => true);
  });

  it('BAS-60 propagates network failure without retry', () => {
    let failure: HttpErrorResponse | undefined;

    service.getJobDetails(ID).subscribe({
      error: error => failure = error,
    });

    http.expectOne(`${BASE}/jobs/${ID}`)
      .error(new ProgressEvent('error'));

    expect(failure?.status).toBe(0);
    http.expectNone(() => true);
  });

  it('BAS-45 propagates network failure without retrying', () => {
    let failure: HttpErrorResponse | undefined;

    service.confirmBooking(ID, CONFIRM).subscribe({
      error: error => failure = error,
    });

    http.expectOne(`${BASE}/bookings/${ID}/confirm`)
      .error(new ProgressEvent('error'));

    expect(failure?.status).toBe(0);
    http.expectNone(() => true);
  });
});
