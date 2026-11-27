import {
  BookingResponseError,
  validateMechanicResponse,
  validateMechanicListResponse,
  validateBayResponse,
  validateBayListResponse,
  validateServiceResponse,
  validateServiceListResponse,
  validateSlotResponse,
  validateSlotListResponse,
  validateJobSummaryResponse,
} from './booking-response.validator';

const ID = '10000000-0000-4000-8000-000000000001';

const MECHANIC = {
  id: ID,
  name: 'Test Mechanic',
  phone: '0770000000',
  employeeCode: 'EMP-001',
  onDuty: true,
  activeJobs: 2,
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
  basePrice: 2500.50,
};

const SLOT = {
  start: '2026-12-01T04:30:00Z',
  end: '2026-12-01T05:30:00Z',
  freeBays: 2,
};

const JOB = {
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
  etaAt: '2026-12-01T06:30:00Z',
  estimatedMinutes: 60,
  elapsedMinutes: 0,
  createdAt: '2026-12-01T04:30:00Z',
  startedAt: null,
  completedAt: null,
  complaint: null,
  managerNote: null,
};

describe('Mechanic response validation', () => {
  it('BSV-01 accepts a valid mechanic', () => {
    expect(validateMechanicResponse(MECHANIC))
      .toEqual(MECHANIC);
  });

  it('BSV-02 accepts an off-duty mechanic', () => {
    expect(validateMechanicResponse({
      ...MECHANIC, onDuty: false,
    }).onDuty).toBe(false);
  });

  it('BSV-03 rejects invalid UUID', () => {
    expect(() => validateMechanicResponse({
      ...MECHANIC, id: 'invalid',
    })).toThrow('id');
  });

  it('BSV-04 rejects non-boolean duty status', () => {
    expect(() => validateMechanicResponse({
      ...MECHANIC, onDuty: 'true',
    })).toThrow('onDuty');
  });

  it('BSV-05 rejects negative active jobs', () => {
    expect(() => validateMechanicResponse({
      ...MECHANIC, activeJobs: -1,
    })).toThrow('activeJobs');
  });

  it('BSV-06 rejects fractional active jobs', () => {
    expect(() => validateMechanicResponse({
      ...MECHANIC, activeJobs: 1.5,
    })).toThrow('activeJobs');
  });

  it('BSV-07 accepts mechanic arrays', () => {
    expect(validateMechanicListResponse([MECHANIC]))
      .toEqual([MECHANIC]);
  });

  it('BSV-08 accepts an empty mechanic list', () => {
    expect(validateMechanicListResponse([])).toEqual([]);
  });

  it('BSV-09 rejects a non-array mechanic list', () => {
    expect(() => validateMechanicListResponse({}))
      .toThrow(BookingResponseError);
  });

  it('BSV-10 identifies the invalid array item', () => {
    expect(() => validateMechanicListResponse([
      MECHANIC,
      { ...MECHANIC, onDuty: null },
    ])).toThrow('mechanics[1].onDuty');
  });
});

describe('Bay response validation', () => {
  it('BSV-11 accepts a valid bay', () => {
    expect(validateBayResponse(BAY)).toEqual(BAY);
  });

  it('BSV-12 accepts an inactive bay', () => {
    expect(validateBayResponse({
      ...BAY, active: false,
    }).active).toBe(false);
  });

  it('BSV-13 rejects invalid bay UUID', () => {
    expect(() => validateBayResponse({
      ...BAY, id: 'invalid',
    })).toThrow('id');
  });

  it('BSV-14 rejects invalid active flag', () => {
    expect(() => validateBayResponse({
      ...BAY, active: 1,
    })).toThrow('active');
  });

  it('BSV-15 accepts bay arrays', () => {
    expect(validateBayListResponse([BAY])).toEqual([BAY]);
  });

  it('BSV-16 accepts an empty bay list', () => {
    expect(validateBayListResponse([])).toEqual([]);
  });

  it('BSV-17 rejects a non-array bay list', () => {
    expect(() => validateBayListResponse(null))
      .toThrow(BookingResponseError);
  });

  it('BSV-18 rejects a missing bay name', () => {
    expect(() => validateBayResponse({
      id: ID, active: true,
    })).toThrow('name');
  });
});

describe('Service response validation', () => {
  it('BSV-19 accepts a valid service', () => {
    expect(validateServiceResponse(SERVICE))
      .toEqual(SERVICE);
  });

  it('BSV-20 accepts zero base price', () => {
    expect(validateServiceResponse({
      ...SERVICE, basePrice: 0,
    }).basePrice).toBe(0);
  });

  it('BSV-21 rejects zero service duration', () => {
    expect(() => validateServiceResponse({
      ...SERVICE, standardMinutes: 0,
    })).toThrow('standardMinutes');
  });

  it('BSV-22 rejects fractional service duration', () => {
    expect(() => validateServiceResponse({
      ...SERVICE, standardMinutes: 1.5,
    })).toThrow('standardMinutes');
  });

  it('BSV-23 rejects negative base price', () => {
    expect(() => validateServiceResponse({
      ...SERVICE, basePrice: -1,
    })).toThrow('basePrice');
  });

  it('BSV-24 rejects non-finite base price', () => {
    expect(() => validateServiceResponse({
      ...SERVICE, basePrice: Infinity,
    })).toThrow('basePrice');
  });

  it('BSV-25 rejects string base price', () => {
    expect(() => validateServiceResponse({
      ...SERVICE, basePrice: '2500',
    })).toThrow('basePrice');
  });

  it('BSV-26 accepts service arrays', () => {
    expect(validateServiceListResponse([SERVICE]))
      .toEqual([SERVICE]);
  });

  it('BSV-27 accepts an empty service list', () => {
    expect(validateServiceListResponse([])).toEqual([]);
  });

  it('BSV-28 rejects a non-array service list', () => {
    expect(() => validateServiceListResponse({}))
      .toThrow(BookingResponseError);
  });
});

describe('Slot response validation', () => {
  it('BSV-29 accepts a valid slot', () => {
    expect(validateSlotResponse(SLOT)).toEqual(SLOT);
  });

  it('BSV-30 accepts one available bay', () => {
    expect(validateSlotResponse({
      ...SLOT, freeBays: 1,
    }).freeBays).toBe(1);
  });

  it('BSV-31 rejects zero available bays', () => {
    expect(() => validateSlotResponse({
      ...SLOT, freeBays: 0,
    })).toThrow('freeBays');
  });

  it('BSV-32 rejects invalid start time', () => {
    expect(() => validateSlotResponse({
      ...SLOT, start: 'invalid',
    })).toThrow('start');
  });

  it('BSV-33 rejects invalid end time', () => {
    expect(() => validateSlotResponse({
      ...SLOT, end: 'invalid',
    })).toThrow('end');
  });

  it('BSV-34 rejects equal start and end times', () => {
    expect(() => validateSlotResponse({
      ...SLOT, end: SLOT.start,
    })).toThrow('end');
  });

  it('BSV-35 rejects an end before the start', () => {
    expect(() => validateSlotResponse({
      ...SLOT, end: '2026-12-01T03:30:00Z',
    })).toThrow('end');
  });

  it('BSV-36 accepts slot arrays', () => {
    expect(validateSlotListResponse([SLOT]))
      .toEqual([SLOT]);
  });

  it('BSV-37 accepts no available slots', () => {
    expect(validateSlotListResponse([])).toEqual([]);
  });

  it('BSV-38 rejects a non-array slot list', () => {
    expect(() => validateSlotListResponse(null))
      .toThrow(BookingResponseError);
  });
});

describe('Job summary response validation', () => {
  it('BSV-39 accepts a valid job summary', () => {
    expect(validateJobSummaryResponse(JOB)).toEqual(JOB);
  });

  it('BSV-40 accepts High priority', () => {
    expect(validateJobSummaryResponse({
      ...JOB, priority: 1,
    }).priority).toBe(1);
  });

  it('BSV-41 accepts Urgent priority', () => {
    expect(validateJobSummaryResponse({
      ...JOB, priority: 2,
    }).priority).toBe(2);
  });

  it('BSV-42 rejects unsupported priority', () => {
    expect(() => validateJobSummaryResponse({
      ...JOB, priority: 999,
    })).toThrow('priority');
  });

  it('BSV-43 rejects a negative queue position', () => {
    expect(() => validateJobSummaryResponse({
      ...JOB, queuePosition: -1,
    })).toThrow('queuePosition');
  });

  it('BSV-44 accepts a null assignment and ETA', () => {
    const job = {
      ...JOB,
      mechanicId: null,
      mechanicName: null,
      bayId: null,
      bayName: null,
      etaAt: null,
    };

    expect(validateJobSummaryResponse(job)).toEqual(job);
  });

  it('BSV-45 accepts separate Manager Note and complaint', () => {
    const job = {
      ...JOB,
      complaint: 'Brake noise',
      managerNote: 'Internal instruction',
    };

    expect(validateJobSummaryResponse(job)).toEqual(job);
  });

  it('BSV-46 rejects invalid Manager Note type', () => {
    expect(() => validateJobSummaryResponse({
      ...JOB, managerNote: 123,
    })).toThrow('managerNote');
  });

  it('BSV-47 rejects missing Manager Note field', () => {
    const { managerNote, ...job } = JOB;

    expect(managerNote).toBeNull();

    expect(() => validateJobSummaryResponse(job))
      .toThrow('managerNote');
  });

  it('BSV-48 rejects invalid ETA', () => {
    expect(() => validateJobSummaryResponse({
      ...JOB, etaAt: 'invalid',
    })).toThrow('etaAt');
  });

  it('BSV-49 rejects negative elapsed minutes', () => {
    expect(() => validateJobSummaryResponse({
      ...JOB, elapsedMinutes: -1,
    })).toThrow('elapsedMinutes');
  });

  it('BSV-50 rejects an invalid job response object', () => {
    expect(() => validateJobSummaryResponse(null))
      .toThrow(BookingResponseError);
  });
});
