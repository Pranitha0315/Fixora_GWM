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
import { BookingApiService } from './booking-api.service';
import { BookingResponseError } from '../utils/booking-response.validator';

import type {
  Booking,
  BookingPage,
} from '../models/booking.model';

const ENDPOINT =
  'https://localhost:7080/api/v1/manager/bookings';

const BOOKING: Booking = {
  id: '10000000-0000-4000-8000-000000000001',
  customerId: '10000000-0000-4000-8000-000000000002',
  customerName: 'Test Customer',
  vehicleId: '10000000-0000-4000-8000-000000000003',
  vehicleLabel: 'Test Vehicle',
  serviceId: '10000000-0000-4000-8000-000000000004',
  serviceName: 'General Service',
  slotStart: '2026-12-01T04:30:00Z',
  slotEnd: '2026-12-01T05:30:00Z',
  status: 'Requested',
  source: 'App',
  jobCardId: null,
  bayId: null,
  bayName: null,
  mechanicId: null,
  mechanicName: null,
  notes: null,
  managerNote: null,
  promoCode: null,
  declineReason: null,
  createdAt: '2026-11-25T04:30:00Z',
};


const EMPTY_PAGE: BookingPage = {
  items: [],
  page: 1,
  pageSize: 50,
  total: 0,
};

const BOOKING_PAGE: BookingPage = {
  items: [BOOKING],
  page: 1,
  pageSize: 50,
  total: 1,
};

describe('BookingApiService', () => {
  let service: BookingApiService;
  let http: HttpTestingController;
  let resolvedPaths: string[];

  beforeEach(() => {
    resolvedPaths = [];

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        BookingApiService,
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

    service = TestBed.inject(BookingApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('BA-01 creates the service', () => {
    expect(service).toBeTruthy();
  });

  it('BA-02 sends GET to the correct endpoint', () => {
    service.getBookings().subscribe();

    const request = http.expectOne(req => req.url === ENDPOINT);

    expect(request.request.method).toBe('GET');
    expect(request.request.body).toBeNull();

    request.flush(EMPTY_PAGE);
  });

  it('BA-03 uses the existing API URL resolver', () => {
    service.getBookings().subscribe();

    expect(resolvedPaths).toEqual([
      'api/v1/manager/bookings',
    ]);

    http.expectOne(req => req.url === ENDPOINT).flush(EMPTY_PAGE);
  });

  it('BA-04 returns validated booking records', () => {
    let result: BookingPage | undefined;

    service.getBookings().subscribe(value => {
      result = value;
    });

    http.expectOne(req => req.url === ENDPOINT).flush(BOOKING_PAGE);

    expect(result).toEqual(BOOKING_PAGE);
  });

  it('BA-05 accepts an empty booking list', () => {
    let result: BookingPage | undefined;

    service.getBookings().subscribe(value => {
      result = value;
    });

    http.expectOne(req => req.url === ENDPOINT).flush(EMPTY_PAGE);

    expect(result).toEqual(EMPTY_PAGE);
  });

  it('BA-06 sends the date filter', () => {
    service.getBookings({
      date: '2026-11-25',
    }).subscribe();

    const request = http.expectOne(
      req => req.url === ENDPOINT,
    );

    expect(request.request.params.get('date'))
      .toBe('2026-11-25');

    expect(request.request.params.has('status'))
      .toBe(false);

    request.flush(EMPTY_PAGE);
  });

  it('BA-07 sends the status filter', () => {
    service.getBookings({
      status: 'Requested',
    }).subscribe();

    const request = http.expectOne(
      req => req.url === ENDPOINT,
    );

    expect(request.request.params.get('status'))
      .toBe('Requested');

    expect(request.request.params.has('date'))
      .toBe(false);

    request.flush(EMPTY_PAGE);
  });

  it('BA-08 sends combined date and status filters', () => {
    service.getBookings({
      date: '2026-11-25',
      status: 'Confirmed',
    }).subscribe();

    const request = http.expectOne(
      req => req.url === ENDPOINT,
    );

    expect(request.request.params.get('date'))
      .toBe('2026-11-25');

    expect(request.request.params.get('status'))
      .toBe('Confirmed');

    expect(request.request.params.keys().length)
      .toBe(4);

    request.flush(EMPTY_PAGE);
  });

  it('BA-09 omits an empty date filter', () => {
    service.getBookings({
      date: '',
    }).subscribe();

    const request = http.expectOne(req => req.url === ENDPOINT);

    expect(request.request.params.keys().sort())
      .toEqual(['page', 'pageSize']);

    request.flush(EMPTY_PAGE);
  });

  it('BA-10 rejects an invalid response structure', () => {
    let failure: unknown;

    service.getBookings().subscribe({
      error: error => {
        failure = error;
      },
    });

    http.expectOne(req => req.url === ENDPOINT).flush({
      invalid: true,
    });

    expect(failure).toBeInstanceOf(
      BookingResponseError,
    );
  });

  it('BA-11 rejects an invalid booking record', () => {
    let failure: unknown;

    service.getBookings().subscribe({
      error: error => {
        failure = error;
      },
    });

    http.expectOne(req => req.url === ENDPOINT).flush({
      ...BOOKING_PAGE,
      items: [{ ...BOOKING, id: 'invalid' }],
    });

    expect(failure).toBeInstanceOf(
      BookingResponseError,
    );
  });

  it('BA-12 propagates HTTP 401 errors', () => {
    let failure: HttpErrorResponse | undefined;

    service.getBookings().subscribe({
      error: error => {
        failure = error;
      },
    });

    http.expectOne(req => req.url === ENDPOINT).flush(
      { message: 'Unauthorized' },
      {
        status: 401,
        statusText: 'Unauthorized',
      },
    );

    expect(failure?.status).toBe(401);
  });

  it('BA-13 propagates HTTP 403 errors', () => {
    let failure: HttpErrorResponse | undefined;

    service.getBookings().subscribe({
      error: error => {
        failure = error;
      },
    });

    http.expectOne(req => req.url === ENDPOINT).flush(
      { message: 'Forbidden' },
      {
        status: 403,
        statusText: 'Forbidden',
      },
    );

    expect(failure?.status).toBe(403);
  });

  it('BA-14 propagates HTTP 500 errors', () => {
    let failure: HttpErrorResponse | undefined;

    service.getBookings().subscribe({
      error: error => {
        failure = error;
      },
    });

    http.expectOne(req => req.url === ENDPOINT).flush(
      { message: 'Server error' },
      {
        status: 500,
        statusText: 'Internal Server Error',
      },
    );

    expect(failure?.status).toBe(500);
  });

  it('BA-15 propagates network failures', () => {
    let failure: HttpErrorResponse | undefined;

    service.getBookings().subscribe({
      error: error => {
        failure = error;
      },
    });

    http.expectOne(req => req.url === ENDPOINT).error(
      new ProgressEvent('error'),
    );

    expect(failure?.status).toBe(0);
  });

  it('BA-16 defers the request until subscription', () => {
    const result = service.getBookings();

    http.expectNone(req => req.url === ENDPOINT);
    expect(resolvedPaths).toEqual([]);

    result.subscribe();

    http.expectOne(req => req.url === ENDPOINT).flush(EMPTY_PAGE);
  });

  it('BA-17 supports independent subscriptions', () => {
    const result = service.getBookings();

    result.subscribe();
    http.expectOne(req => req.url === ENDPOINT).flush(EMPTY_PAGE);

    result.subscribe();
    http.expectOne(req => req.url === ENDPOINT).flush(EMPTY_PAGE);

    expect(resolvedPaths.length).toBe(2);
  });


  it('BA-18 sends default pagination parameters', () => {
    service.getBookings().subscribe();

    const request = http.expectOne(
      req => req.url === ENDPOINT,
    );

    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('pageSize')).toBe('50');

    request.flush(EMPTY_PAGE);
  });

  it('BA-19 supports custom pagination parameters', () => {
    let result: BookingPage | undefined;

    service.getBookings({
      page: 2,
      pageSize: 100,
    }).subscribe(value => {
      result = value;
    });

    const request = http.expectOne(
      req => req.url === ENDPOINT,
    );

    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('pageSize')).toBe('100');

    const page: BookingPage = {
      items: [BOOKING],
      page: 2,
      pageSize: 100,
      total: 101,
    };

    request.flush(page);

    expect(result).toEqual(page);
  });

  it('BA-20 combines pagination and booking filters', () => {
    service.getBookings({
      date: '2026-11-25',
      status: 'Confirmed',
      page: 2,
      pageSize: 10,
    }).subscribe();

    const request = http.expectOne(
      req => req.url === ENDPOINT,
    );

    expect(request.request.params.get('date'))
      .toBe('2026-11-25');

    expect(request.request.params.get('status'))
      .toBe('Confirmed');

    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('pageSize')).toBe('10');

    request.flush({
      items: [],
      page: 2,
      pageSize: 10,
      total: 0,
    });
  });

  it('BA-21 rejects page zero before sending HTTP', () => {
    let failure: unknown;

    service.getBookings({ page: 0 }).subscribe({
      error: error => failure = error,
    });

    expect(failure).toBeInstanceOf(RangeError);

    http.expectNone(req => req.url === ENDPOINT);
  });

  it('BA-22 rejects fractional page numbers', () => {
    let failure: unknown;

    service.getBookings({ page: 1.5 }).subscribe({
      error: error => failure = error,
    });

    expect(failure).toBeInstanceOf(RangeError);

    http.expectNone(req => req.url === ENDPOINT);
  });

  it('BA-23 rejects page size zero', () => {
    let failure: unknown;

    service.getBookings({ pageSize: 0 }).subscribe({
      error: error => failure = error,
    });

    expect(failure).toBeInstanceOf(RangeError);

    http.expectNone(req => req.url === ENDPOINT);
  });

  it('BA-24 rejects page size above 100', () => {
    let failure: unknown;

    service.getBookings({ pageSize: 101 }).subscribe({
      error: error => failure = error,
    });

    expect(failure).toBeInstanceOf(RangeError);

    http.expectNone(req => req.url === ENDPOINT);
  });

  it('BA-25 rejects fractional page size', () => {
    let failure: unknown;

    service.getBookings({ pageSize: 10.5 }).subscribe({
      error: error => failure = error,
    });

    expect(failure).toBeInstanceOf(RangeError);

    http.expectNone(req => req.url === ENDPOINT);
  });

  it('BA-26 rejects a page number above Int32 range', () => {
    let failure: unknown;

    service.getBookings({
      page: 2147483648,
    }).subscribe({
      error: error => failure = error,
    });

    expect(failure).toBeInstanceOf(RangeError);

    http.expectNone(req => req.url === ENDPOINT);
  });

  it('BA-27 rejects the old array response', () => {
    let failure: unknown;

    service.getBookings().subscribe({
      error: error => failure = error,
    });

    http.expectOne(req => req.url === ENDPOINT)
      .flush([BOOKING]);

    expect(failure).toBeInstanceOf(BookingResponseError);
  });

  it('BA-28 rejects mismatched response page', () => {
    let failure: unknown;

    service.getBookings().subscribe({
      error: error => failure = error,
    });

    http.expectOne(req => req.url === ENDPOINT)
      .flush({
        ...EMPTY_PAGE,
        page: 2,
      });

    expect(failure).toBeInstanceOf(BookingResponseError);
    expect((failure as Error).message)
      .toContain('response.page');
  });

  it('BA-29 rejects mismatched response page size', () => {
    let failure: unknown;

    service.getBookings().subscribe({
      error: error => failure = error,
    });

    http.expectOne(req => req.url === ENDPOINT)
      .flush({
        ...EMPTY_PAGE,
        pageSize: 25,
      });

    expect(failure).toBeInstanceOf(BookingResponseError);
    expect((failure as Error).message)
      .toContain('response.pageSize');
  });

  it('BA-30 preserves Manager Note separately', () => {
    let result: BookingPage | undefined;

    service.getBookings().subscribe(value => {
      result = value;
    });

    http.expectOne(req => req.url === ENDPOINT)
      .flush({
        ...BOOKING_PAGE,
        items: [{
          ...BOOKING,
          notes: 'Customer complaint',
          managerNote: 'Internal staff instruction',
        }],
      });

    expect(result?.items[0]?.notes)
      .toBe('Customer complaint');

    expect(result?.items[0]?.managerNote)
      .toBe('Internal staff instruction');
  });
});
