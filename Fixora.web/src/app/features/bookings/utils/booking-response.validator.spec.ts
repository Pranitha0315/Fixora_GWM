import {
  BookingResponseError,
  validateBookingResponse,
  validateBookingListResponse,
  validateBookingPageResponse,
} from './booking-response.validator';

import type { Booking } from '../models/booking.model';

const VALID_BOOKING: Booking = {
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

describe('Booking response validator', () => {
  it('BV-01 accepts a valid booking', () => {
    expect(validateBookingResponse(VALID_BOOKING))
      .toEqual(VALID_BOOKING);
  });

  it('BV-02 accepts a valid booking list', () => {
    expect(validateBookingListResponse([VALID_BOOKING]))
      .toEqual([VALID_BOOKING]);
  });

  it('BV-03 accepts an empty booking list', () => {
    expect(validateBookingListResponse([])).toEqual([]);
  });

  it('BV-04 rejects a null list', () => {
    expect(() => validateBookingListResponse(null))
      .toThrow(BookingResponseError);
  });

  it('BV-05 rejects an object instead of an array', () => {
    expect(() => validateBookingListResponse({}))
      .toThrow(BookingResponseError);
  });

  it('BV-06 rejects a string instead of an array', () => {
    expect(() => validateBookingListResponse('invalid'))
      .toThrow(BookingResponseError);
  });

  it('BV-07 rejects a null booking', () => {
    expect(() => validateBookingResponse(null))
      .toThrow(BookingResponseError);
  });

  it('BV-08 rejects an array as a booking', () => {
    expect(() => validateBookingResponse([]))
      .toThrow(BookingResponseError);
  });

  it('BV-09 rejects an invalid booking UUID', () => {
    expect(() => validateBookingResponse({
      ...VALID_BOOKING,
      id: 'invalid-id',
    })).toThrow('booking.id');
  });

  it('BV-10 rejects an invalid customer UUID', () => {
    expect(() => validateBookingResponse({
      ...VALID_BOOKING,
      customerId: 'invalid',
    })).toThrow('booking.customerId');
  });

  it('BV-11 rejects an invalid vehicle UUID', () => {
    expect(() => validateBookingResponse({
      ...VALID_BOOKING,
      vehicleId: 'invalid',
    })).toThrow('booking.vehicleId');
  });

  it('BV-12 rejects an invalid service UUID', () => {
    expect(() => validateBookingResponse({
      ...VALID_BOOKING,
      serviceId: 'invalid',
    })).toThrow('booking.serviceId');
  });

  it('BV-13 accepts nullable fields', () => {
    const result = validateBookingResponse(VALID_BOOKING);

    expect(result.jobCardId).toBeNull();
    expect(result.bayId).toBeNull();
    expect(result.bayName).toBeNull();
    expect(result.mechanicId).toBeNull();
    expect(result.mechanicName).toBeNull();
    expect(result.notes).toBeNull();
    expect(result.managerNote).toBeNull();
    expect(result.promoCode).toBeNull();
    expect(result.declineReason).toBeNull();
  });

  it('BV-14 accepts assigned mechanic and bay', () => {
    const assigned = {
      ...VALID_BOOKING,
      status: 'Confirmed',
      bayId: '10000000-0000-4000-8000-000000000005',
      bayName: 'Bay 1',
      mechanicId: '10000000-0000-4000-8000-000000000006',
      mechanicName: 'Test Mechanic',
    };

    expect(validateBookingResponse(assigned))
      .toEqual(assigned);
  });

  it('BV-15 rejects an invalid nullable UUID', () => {
    expect(() => validateBookingResponse({
      ...VALID_BOOKING,
      mechanicId: 'invalid',
    })).toThrow('booking.mechanicId');
  });

  it('BV-16 rejects an invalid nullable string', () => {
    expect(() => validateBookingResponse({
      ...VALID_BOOKING,
      notes: 123,
    })).toThrow('booking.notes');
  });

  it('BV-17 rejects an invalid slot start', () => {
    expect(() => validateBookingResponse({
      ...VALID_BOOKING,
      slotStart: 'invalid-date',
    })).toThrow('booking.slotStart');
  });

  it('BV-18 rejects an invalid slot end', () => {
    expect(() => validateBookingResponse({
      ...VALID_BOOKING,
      slotEnd: '2026-13-01T05:30:00Z',
    })).toThrow('booking.slotEnd');
  });

  it('BV-19 rejects an invalid creation date', () => {
    expect(() => validateBookingResponse({
      ...VALID_BOOKING,
      createdAt: '2026-11-25',
    })).toThrow('booking.createdAt');
  });

  it('BV-20 rejects a missing required field', () => {
    const invalid: Record<string, unknown> = {
      ...VALID_BOOKING,
    };

    delete invalid['customerName'];

    expect(() => validateBookingResponse(invalid))
      .toThrow('booking.customerName');
  });

  it('BV-21 rejects a missing nullable field', () => {
    const invalid: Record<string, unknown> = {
      ...VALID_BOOKING,
    };

    delete invalid['notes'];

    expect(() => validateBookingResponse(invalid))
      .toThrow('booking.notes');
  });

  it('BV-22 accepts a future status string', () => {
    const result = validateBookingResponse({
      ...VALID_BOOKING,
      status: 'FutureStatus',
    });

    expect(result.status).toBe('FutureStatus');
  });

  it('BV-23 accepts a future source string', () => {
    const result = validateBookingResponse({
      ...VALID_BOOKING,
      source: 'FutureSource',
    });

    expect(result.source).toBe('FutureSource');
  });

  it('BV-24 identifies the invalid list record', () => {
    expect(() => validateBookingListResponse([
      VALID_BOOKING,
      { ...VALID_BOOKING, id: 'invalid' },
    ])).toThrow('bookings[1].id');
  });

  it('BV-25 does not mutate the original response', () => {
    const original = Object.freeze({
      ...VALID_BOOKING,
    });

    const result = validateBookingResponse(original);

    expect(result).toEqual(original);
    expect(result).not.toBe(original);
  });

  it('BV-26 rejects a non-string status', () => {
    expect(() => validateBookingResponse({
      ...VALID_BOOKING,
      status: 1,
    })).toThrow('booking.status');
  });

  it('BV-27 rejects a non-string source', () => {
    expect(() => validateBookingResponse({
      ...VALID_BOOKING,
      source: false,
    })).toThrow('booking.source');
  });
});


describe('Booking pagination response validator', () => {
  const VALID_PAGE = {
    items: [VALID_BOOKING],
    page: 1,
    pageSize: 50,
    total: 1,
  };

  it('BV-28 accepts a valid paginated response', () => {
    expect(validateBookingPageResponse(VALID_PAGE))
      .toEqual(VALID_PAGE);
  });

  it('BV-29 accepts an empty booking page', () => {
    const empty = {
      ...VALID_PAGE,
      items: [],
      total: 0,
    };

    expect(validateBookingPageResponse(empty))
      .toEqual(empty);
  });

  it('BV-30 accepts Manager Note text separately', () => {
    const booking = {
      ...VALID_BOOKING,
      notes: 'Customer complaint',
      managerNote: 'Internal workshop instruction',
    };

    const result = validateBookingResponse(booking);

    expect(result.notes).toBe('Customer complaint');
    expect(result.managerNote)
      .toBe('Internal workshop instruction');
  });

  it('BV-31 accepts a null Manager Note', () => {
    expect(validateBookingResponse(VALID_BOOKING).managerNote)
      .toBeNull();
  });

  it('BV-32 rejects a missing Manager Note field', () => {
    const invalid: Record<string, unknown> = {
      ...VALID_BOOKING,
    };

    delete invalid['managerNote'];

    expect(() => validateBookingResponse(invalid))
      .toThrow('booking.managerNote');
  });

  it('BV-33 rejects a non-string Manager Note', () => {
    expect(() => validateBookingResponse({
      ...VALID_BOOKING,
      managerNote: 123,
    })).toThrow('booking.managerNote');
  });

  it('BV-34 rejects the old array response', () => {
    expect(() => validateBookingPageResponse([VALID_BOOKING]))
      .toThrow(BookingResponseError);
  });

  it('BV-35 rejects a zero page number', () => {
    expect(() => validateBookingPageResponse({
      ...VALID_PAGE,
      page: 0,
    })).toThrow('response.page');
  });

  it('BV-36 rejects a fractional page number', () => {
    expect(() => validateBookingPageResponse({
      ...VALID_PAGE,
      page: 1.5,
    })).toThrow('response.page');
  });

  it('BV-37 rejects a string page number', () => {
    expect(() => validateBookingPageResponse({
      ...VALID_PAGE,
      page: '1',
    })).toThrow('response.page');
  });

  it('BV-38 rejects a zero page size', () => {
    expect(() => validateBookingPageResponse({
      ...VALID_PAGE,
      pageSize: 0,
    })).toThrow('response.pageSize');
  });

  it('BV-39 rejects page size above 100', () => {
    expect(() => validateBookingPageResponse({
      ...VALID_PAGE,
      pageSize: 101,
    })).toThrow('response.pageSize');
  });

  it('BV-40 rejects a negative total', () => {
    expect(() => validateBookingPageResponse({
      ...VALID_PAGE,
      total: -1,
    })).toThrow('response.total');
  });

  it('BV-41 rejects invalid items structure', () => {
    expect(() => validateBookingPageResponse({
      ...VALID_PAGE,
      items: {},
    })).toThrow('response.items');
  });

  it('BV-42 rejects items exceeding page size', () => {
    expect(() => validateBookingPageResponse({
      ...VALID_PAGE,
      items: [VALID_BOOKING, VALID_BOOKING],
      pageSize: 1,
      total: 2,
    })).toThrow('response.items.length');
  });

  it('BV-43 rejects items exceeding total', () => {
    expect(() => validateBookingPageResponse({
      ...VALID_PAGE,
      total: 0,
    })).toThrow('response.items.length');
  });

  it('BV-44 identifies an invalid booking inside a page', () => {
    expect(() => validateBookingPageResponse({
      ...VALID_PAGE,
      items: [
        VALID_BOOKING,
        { ...VALID_BOOKING, id: 'invalid' },
      ],
      total: 2,
    })).toThrow('response.items[1].id');
  });

  it('BV-45 accepts a subsequent page', () => {
    const page = {
      ...VALID_PAGE,
      page: 2,
      pageSize: 100,
      total: 101,
    };

    expect(validateBookingPageResponse(page))
      .toEqual(page);
  });
});
