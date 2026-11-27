import {
  BookingRequestError,
  validateConfirmBookingRequest,
  validateDeclineBookingRequest,
  validateRescheduleRequest,
  validateWalkInRequest,
  validateAssignJobRequest,
  validateBookingSlotQuery,
} from './booking-action.validator';

const BAY_ID = '10000000-0000-4000-8000-000000000001';
const MECHANIC_ID = '10000000-0000-4000-8000-000000000002';
const SERVICE_ID = '10000000-0000-4000-8000-000000000003';
const CUSTOMER_ID = '10000000-0000-4000-8000-000000000004';
const VEHICLE_ID = '10000000-0000-4000-8000-000000000005';
const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';

const CONFIRM = {
  bayId: BAY_ID,
  mechanicId: MECHANIC_ID,
  note: null,
};

const WALK_IN = {
  customerId: null,
  customerName: 'Test Customer',
  vehicleId: null,
  vehicleLabel: 'Test Vehicle',
  serviceId: SERVICE_ID,
  bayId: BAY_ID,
  mechanicId: MECHANIC_ID,
  priority: 0,
  complaint: null,
};

const ASSIGN = {
  mechanicId: MECHANIC_ID,
  bayId: BAY_ID,
};

const SLOT_QUERY = {
  date: '2026-12-01',
  serviceId: SERVICE_ID,
};

describe('Confirm booking request validator', () => {
  it('BRV-01 accepts valid confirmation', () => {
    expect(validateConfirmBookingRequest(CONFIRM))
      .toEqual(CONFIRM);
  });

  it('BRV-02 accepts Manager Note text', () => {
    const request = { ...CONFIRM, note: 'Internal instruction' };

    expect(validateConfirmBookingRequest(request))
      .toEqual(request);
  });

  it('BRV-03 trims Manager Note whitespace', () => {
    expect(validateConfirmBookingRequest({
      ...CONFIRM,
      note: '  Internal instruction  ',
    }).note).toBe('Internal instruction');
  });

  it('BRV-04 converts blank Manager Note to null', () => {
    expect(validateConfirmBookingRequest({
      ...CONFIRM,
      note: '   ',
    }).note).toBeNull();
  });

  it('BRV-05 accepts exactly 500 characters', () => {
    const note = 'a'.repeat(500);

    expect(validateConfirmBookingRequest({
      ...CONFIRM,
      note,
    }).note).toBe(note);
  });

  it('BRV-06 rejects 501 characters', () => {
    expect(() => validateConfirmBookingRequest({
      ...CONFIRM,
      note: 'a'.repeat(501),
    })).toThrow('note');
  });

  it('BRV-07 rejects invalid bay UUID', () => {
    expect(() => validateConfirmBookingRequest({
      ...CONFIRM,
      bayId: 'invalid',
    })).toThrow('bayId');
  });

  it('BRV-08 rejects invalid mechanic UUID', () => {
    expect(() => validateConfirmBookingRequest({
      ...CONFIRM,
      mechanicId: 'invalid',
    })).toThrow('mechanicId');
  });

  it('BRV-09 rejects empty UUID', () => {
    expect(() => validateConfirmBookingRequest({
      ...CONFIRM,
      bayId: EMPTY_UUID,
    })).toThrow('bayId');
  });

  it('BRV-10 rejects non-string Manager Note', () => {
    expect(() => validateConfirmBookingRequest({
      ...CONFIRM,
      note: 123,
    })).toThrow('note');
  });

  it('BRV-11 rejects missing Manager Note field', () => {
    expect(() => validateConfirmBookingRequest({
      bayId: BAY_ID,
      mechanicId: MECHANIC_ID,
    })).toThrow('note');
  });

  it('BRV-12 rejects null request', () => {
    expect(() => validateConfirmBookingRequest(null))
      .toThrow(BookingRequestError);
  });

  it('BRV-13 does not mutate the input', () => {
    const request = Object.freeze({
      ...CONFIRM,
      note: '  Test  ',
    });

    const result = validateConfirmBookingRequest(request);

    expect(result.note).toBe('Test');
    expect(request.note).toBe('  Test  ');
    expect(result).not.toBe(request);
  });
});

describe('Decline booking request validator', () => {
  it('BRV-14 accepts a valid reason', () => {
    expect(validateDeclineBookingRequest({
      reason: 'Workshop unavailable',
    })).toEqual({ reason: 'Workshop unavailable' });
  });

  it('BRV-15 trims reason whitespace', () => {
    expect(validateDeclineBookingRequest({
      reason: '  Workshop unavailable  ',
    }).reason).toBe('Workshop unavailable');
  });

  it('BRV-16 rejects an empty reason', () => {
    expect(() => validateDeclineBookingRequest({
      reason: '',
    })).toThrow('reason');
  });

  it('BRV-17 rejects a whitespace-only reason', () => {
    expect(() => validateDeclineBookingRequest({
      reason: '   ',
    })).toThrow('reason');
  });

  it('BRV-18 rejects a non-string reason', () => {
    expect(() => validateDeclineBookingRequest({
      reason: 123,
    })).toThrow('reason');
  });

  it('BRV-19 rejects a missing reason', () => {
    expect(() => validateDeclineBookingRequest({}))
      .toThrow('reason');
  });
});

describe('Reschedule request validator', () => {
  it('BRV-20 accepts UTC date-time', () => {
    const request = {
      slotStart: '2026-12-01T04:30:00Z',
    };

    expect(validateRescheduleRequest(request))
      .toEqual(request);
  });

  it('BRV-21 accepts Sri Lanka timezone offset', () => {
    const request = {
      slotStart: '2026-12-01T10:00:00+05:30',
    };

    expect(validateRescheduleRequest(request))
      .toEqual(request);
  });

  it('BRV-22 accepts fractional seconds', () => {
    const request = {
      slotStart: '2026-12-01T04:30:00.1234567Z',
    };

    expect(validateRescheduleRequest(request))
      .toEqual(request);
  });

  it('BRV-23 rejects missing timezone', () => {
    expect(() => validateRescheduleRequest({
      slotStart: '2026-12-01T10:00:00',
    })).toThrow('slotStart');
  });

  it('BRV-24 rejects invalid calendar date', () => {
    expect(() => validateRescheduleRequest({
      slotStart: '2026-02-30T10:00:00Z',
    })).toThrow('slotStart');
  });

  it('BRV-25 rejects invalid hour', () => {
    expect(() => validateRescheduleRequest({
      slotStart: '2026-12-01T25:00:00Z',
    })).toThrow('slotStart');
  });

  it('BRV-26 rejects invalid timezone offset', () => {
    expect(() => validateRescheduleRequest({
      slotStart: '2026-12-01T10:00:00+15:00',
    })).toThrow('slotStart');
  });

  it('BRV-27 rejects date without time', () => {
    expect(() => validateRescheduleRequest({
      slotStart: '2026-12-01',
    })).toThrow('slotStart');
  });
});

describe('Walk-in request validator', () => {
  it('BRV-28 accepts a normal walk-in', () => {
    expect(validateWalkInRequest(WALK_IN))
      .toEqual(WALK_IN);
  });

  it('BRV-29 accepts High priority', () => {
    expect(validateWalkInRequest({
      ...WALK_IN,
      priority: 1,
    }).priority).toBe(1);
  });

  it('BRV-30 accepts Urgent priority', () => {
    expect(validateWalkInRequest({
      ...WALK_IN,
      priority: 2,
    }).priority).toBe(2);
  });

  it('BRV-31 rejects priority 999', () => {
    expect(() => validateWalkInRequest({
      ...WALK_IN,
      priority: 999,
    })).toThrow('priority');
  });

  it('BRV-32 rejects negative priority', () => {
    expect(() => validateWalkInRequest({
      ...WALK_IN,
      priority: -1,
    })).toThrow('priority');
  });

  it('BRV-33 rejects priority 3', () => {
    expect(() => validateWalkInRequest({
      ...WALK_IN,
      priority: 3,
    })).toThrow('priority');
  });

  it('BRV-34 rejects string priority', () => {
    expect(() => validateWalkInRequest({
      ...WALK_IN,
      priority: '1',
    })).toThrow('priority');
  });

  it('BRV-35 rejects fractional priority', () => {
    expect(() => validateWalkInRequest({
      ...WALK_IN,
      priority: 1.5,
    })).toThrow('priority');
  });

  it('BRV-36 accepts existing customer and vehicle IDs', () => {
    const request = {
      ...WALK_IN,
      customerId: CUSTOMER_ID,
      vehicleId: VEHICLE_ID,
    };

    expect(validateWalkInRequest(request))
      .toEqual(request);
  });

  it('BRV-37 rejects invalid customer ID', () => {
    expect(() => validateWalkInRequest({
      ...WALK_IN,
      customerId: 'invalid',
    })).toThrow('customerId');
  });

  it('BRV-38 rejects invalid vehicle ID', () => {
    expect(() => validateWalkInRequest({
      ...WALK_IN,
      vehicleId: 'invalid',
    })).toThrow('vehicleId');
  });

  it('BRV-39 rejects blank customer name', () => {
    expect(() => validateWalkInRequest({
      ...WALK_IN,
      customerName: '   ',
    })).toThrow('customerName');
  });

  it('BRV-40 rejects blank vehicle label', () => {
    expect(() => validateWalkInRequest({
      ...WALK_IN,
      vehicleLabel: '',
    })).toThrow('vehicleLabel');
  });

  it('BRV-41 rejects invalid service ID', () => {
    expect(() => validateWalkInRequest({
      ...WALK_IN,
      serviceId: 'invalid',
    })).toThrow('serviceId');
  });

  it('BRV-42 rejects empty bay ID', () => {
    expect(() => validateWalkInRequest({
      ...WALK_IN,
      bayId: EMPTY_UUID,
    })).toThrow('bayId');
  });

  it('BRV-43 rejects empty mechanic ID', () => {
    expect(() => validateWalkInRequest({
      ...WALK_IN,
      mechanicId: EMPTY_UUID,
    })).toThrow('mechanicId');
  });

  it('BRV-44 trims complaint text', () => {
    expect(validateWalkInRequest({
      ...WALK_IN,
      complaint: '  Brake noise  ',
    }).complaint).toBe('Brake noise');
  });

  it('BRV-45 converts blank complaint to null', () => {
    expect(validateWalkInRequest({
      ...WALK_IN,
      complaint: '   ',
    }).complaint).toBeNull();
  });

  it('BRV-46 rejects invalid complaint type', () => {
    expect(() => validateWalkInRequest({
      ...WALK_IN,
      complaint: false,
    })).toThrow('complaint');
  });
});

describe('Job assignment request validator', () => {
  it('BRV-47 accepts valid assignment', () => {
    expect(validateAssignJobRequest(ASSIGN))
      .toEqual(ASSIGN);
  });

  it('BRV-48 rejects invalid mechanic ID', () => {
    expect(() => validateAssignJobRequest({
      ...ASSIGN,
      mechanicId: 'invalid',
    })).toThrow('mechanicId');
  });

  it('BRV-49 rejects invalid bay ID', () => {
    expect(() => validateAssignJobRequest({
      ...ASSIGN,
      bayId: 'invalid',
    })).toThrow('bayId');
  });

  it('BRV-50 rejects an array request', () => {
    expect(() => validateAssignJobRequest([]))
      .toThrow(BookingRequestError);
  });
});

describe('Booking slot query validator', () => {
  it('BRV-51 accepts a valid slot query', () => {
    expect(validateBookingSlotQuery(SLOT_QUERY))
      .toEqual(SLOT_QUERY);
  });

  it('BRV-52 accepts a valid leap-year date', () => {
    expect(validateBookingSlotQuery({
      ...SLOT_QUERY,
      date: '2028-02-29',
    }).date).toBe('2028-02-29');
  });

  it('BRV-53 rejects a non-leap-year February 29', () => {
    expect(() => validateBookingSlotQuery({
      ...SLOT_QUERY,
      date: '2026-02-29',
    })).toThrow('date');
  });

  it('BRV-54 rejects an invalid month', () => {
    expect(() => validateBookingSlotQuery({
      ...SLOT_QUERY,
      date: '2026-13-01',
    })).toThrow('date');
  });

  it('BRV-55 rejects a date-time instead of date', () => {
    expect(() => validateBookingSlotQuery({
      ...SLOT_QUERY,
      date: '2026-12-01T00:00:00Z',
    })).toThrow('date');
  });

  it('BRV-56 rejects an invalid service ID', () => {
    expect(() => validateBookingSlotQuery({
      ...SLOT_QUERY,
      serviceId: 'invalid',
    })).toThrow('serviceId');
  });

  it('BRV-57 rejects year zero', () => {
    expect(() => validateBookingSlotQuery({
      ...SLOT_QUERY,
      date: '0000-01-01',
    })).toThrow('date');
  });

  it('BRV-58 rejects a non-object request', () => {
    expect(() => validateBookingSlotQuery('invalid'))
      .toThrow(BookingRequestError);
  });
});
