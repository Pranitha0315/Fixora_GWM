import {
  ADAPTIVE_QUEUE_ACTIVE_PHASE_STATUSES,
  ADAPTIVE_QUEUE_JOB_LIMIT,
  ADAPTIVE_QUEUE_TERMINAL_STATUSES,
  ADAPTIVE_QUEUE_WAITING_STATUS,
} from '../models/adaptive-queue.model';

import {
  AdaptiveQueueResponseError,
  validateAdaptiveQueueBaysResponse,
  validateAdaptiveQueueJobResponse,
  validateAdaptiveQueueJobsResponse,
} from './adaptive-queue.validator';

const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

const REQUIRED_JOB_FIELDS = [
  'id',
  'number',
  'customerId',
  'customerName',
  'vehicleId',
  'vehicleLabel',
  'mechanicId',
  'mechanicName',
  'bayId',
  'bayName',
  'status',
  'priority',
  'queuePosition',
  'etaAt',
  'estimatedMinutes',
  'elapsedMinutes',
  'createdAt',
  'startedAt',
  'completedAt',
  'complaint',
  'managerNote',
] as const;

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
  return {
    id: uuid(100),
    name: 'Bay 1',
    active: true,
    ...overrides,
  };
}

function captureError(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }

  return undefined;
}

function expectResponseError(
  action: () => unknown,
  field: string,
): void {
  const error = captureError(action);

  expect(error).toBeInstanceOf(AdaptiveQueueResponseError);
  expect((error as AdaptiveQueueResponseError).field).toBe(field);
}

describe('validateAdaptiveQueueJobsResponse', () => {
  it('AQV-01 accepts an empty job list', () => {
    expect(validateAdaptiveQueueJobsResponse([])).toEqual([]);
  });

  it('AQV-02 accepts valid jobs and preserves server order', () => {
    const response = [
      makeJob({ id: uuid(3), number: 'JC-3', queuePosition: 3 }),
      makeJob({ id: uuid(1), number: 'JC-1', queuePosition: 1 }),
      makeJob({ id: uuid(2), number: 'JC-2', queuePosition: 2 }),
    ];

    const result = validateAdaptiveQueueJobsResponse(response);

    expect(result.map(job => job.number)).toEqual([
      'JC-3',
      'JC-1',
      'JC-2',
    ]);
    expect(result.map(job => job.queuePosition)).toEqual([3, 1, 2]);
  });

  it('AQV-03 returns every validated field unchanged', () => {
    const response = makeJob({
      mechanicId: uuid(10),
      mechanicName: 'Nimal',
      bayId: uuid(100),
      bayName: 'Bay 1',
      status: 'InProgress',
      priority: 2,
      queuePosition: 0,
      etaAt: '2026-11-27T08:30:00Z',
      estimatedMinutes: 90,
      elapsedMinutes: 12.5,
      startedAt: '2026-11-27T05:00:00Z',
      complaint: 'Brake noise',
      managerNote: 'Priority customer',
    });

    expect(validateAdaptiveQueueJobsResponse([response])[0])
      .toEqual(response);
  });

  for (const value of [
    null,
    undefined,
    'jobs',
    42,
    true,
    {},
    { items: [] },
  ]) {
    it(`AQV-04 rejects a non-array response (${JSON.stringify(
      value,
    )})`, () => {
      expectResponseError(
        () => validateAdaptiveQueueJobsResponse(value),
        'jobs',
      );
    });
  }

  for (const value of [null, 'job', 7, [], undefined]) {
    it(`AQV-05 rejects a non-object job item (${JSON.stringify(
      value,
    )})`, () => {
      expectResponseError(
        () => validateAdaptiveQueueJobsResponse([value]),
        'jobs[0]',
      );
    });
  }

  for (const field of REQUIRED_JOB_FIELDS) {
    it(`AQV-06 rejects a job missing ${field}`, () => {
      const job = makeJob();
      delete job[field];

      expectResponseError(
        () => validateAdaptiveQueueJobsResponse([makeJob(), job]),
        `jobs[1].${field}`,
      );
    });
  }

  for (const field of ['id', 'customerId', 'vehicleId']) {
    it(`AQV-07 rejects an invalid ${field} UUID`, () => {
      expectResponseError(
        () =>
          validateAdaptiveQueueJobsResponse([
            makeJob({ [field]: 'not-a-uuid' }),
          ]),
        `jobs[0].${field}`,
      );
    });
  }

  for (const field of ['mechanicId', 'bayId']) {
    it(`AQV-08 rejects an invalid non-null ${field} UUID`, () => {
      expectResponseError(
        () =>
          validateAdaptiveQueueJobsResponse([
            makeJob({ [field]: 'not-a-uuid' }),
          ]),
        `jobs[0].${field}`,
      );
    });
  }

  it('AQV-09 accepts anonymous walk-in Guid.Empty customer and vehicle ids', () => {
    const result = validateAdaptiveQueueJobsResponse([
      makeJob({
        customerId: EMPTY_GUID,
        vehicleId: EMPTY_GUID,
        customerName: 'Walk-in Customer',
      }),
    ]);

    expect(result[0].customerId).toBe(EMPTY_GUID);
    expect(result[0].vehicleId).toBe(EMPTY_GUID);
  });

  it('AQV-10 accepts null ETA, mechanic and bay assignments', () => {
    const result = validateAdaptiveQueueJobsResponse([
      makeJob({
        etaAt: null,
        mechanicId: null,
        mechanicName: null,
        bayId: null,
        bayName: null,
      }),
    ]);

    expect(result[0].etaAt).toBeNull();
    expect(result[0].mechanicId).toBeNull();
    expect(result[0].bayId).toBeNull();
  });

  it('AQV-11 accepts ETA with and without a UTC designator', () => {
    const result = validateAdaptiveQueueJobsResponse([
      makeJob({ id: uuid(1), etaAt: '2026-11-27T08:30:00Z' }),
      makeJob({ id: uuid(2), etaAt: '2026-11-27T08:30:00.1234567' }),
      makeJob({ id: uuid(3), etaAt: '2026-11-27T14:00:00+05:30' }),
    ]);

    expect(result).toHaveLength(3);
  });

  for (const value of ['tomorrow', '2026-13-45T00:00:00Z', 12345, '']) {
    it(`AQV-12 rejects an invalid ETA (${JSON.stringify(
      value,
    )})`, () => {
      expectResponseError(
        () =>
          validateAdaptiveQueueJobsResponse([
            makeJob({ etaAt: value }),
          ]),
        'jobs[0].etaAt',
      );
    });
  }

  it('AQV-13 rejects duplicate job ids and reports the second index', () => {
    expectResponseError(
      () =>
        validateAdaptiveQueueJobsResponse([
          makeJob({ id: uuid(1) }),
          makeJob({ id: uuid(2) }),
          makeJob({ id: uuid(1) }),
        ]),
      'jobs[2].id',
    );
  });

  it('AQV-14 treats job ids case-insensitively when detecting duplicates', () => {
    expectResponseError(
      () =>
        validateAdaptiveQueueJobsResponse([
          makeJob({ id: 'ABCDEF00-0000-4000-8000-000000000001' }),
          makeJob({ id: 'abcdef00-0000-4000-8000-000000000001' }),
        ]),
      'jobs[1].id',
    );
  });

  it('AQV-15 allows different jobs that share bay and mechanic ids', () => {
    const result = validateAdaptiveQueueJobsResponse([
      makeJob({
        id: uuid(1),
        bayId: uuid(100),
        mechanicId: uuid(10),
      }),
      makeJob({
        id: uuid(2),
        bayId: uuid(100),
        mechanicId: uuid(10),
      }),
    ]);

    expect(result).toHaveLength(2);
  });

  for (const priority of [0, 1, 2]) {
    it(`AQV-16 accepts priority ${priority}`, () => {
      expect(
        validateAdaptiveQueueJobsResponse([makeJob({ priority })])[0]
          .priority,
      ).toBe(priority);
    });
  }

  for (const priority of [-1, 3, 1.5, '1', null, Number.NaN]) {
    it(`AQV-17 rejects invalid priority ${String(priority)}`, () => {
      expectResponseError(
        () =>
          validateAdaptiveQueueJobsResponse([makeJob({ priority })]),
        'jobs[0].priority',
      );
    });
  }

  for (const queuePosition of [0, 1, 25]) {
    it(`AQV-18 accepts queuePosition ${queuePosition}`, () => {
      expect(
        validateAdaptiveQueueJobsResponse([
          makeJob({ queuePosition }),
        ])[0].queuePosition,
      ).toBe(queuePosition);
    });
  }

  for (const queuePosition of [-1, 1.5, '1', null, Number.NaN]) {
    it(`AQV-19 rejects invalid queuePosition ${String(
      queuePosition,
    )}`, () => {
      expectResponseError(
        () =>
          validateAdaptiveQueueJobsResponse([
            makeJob({ queuePosition }),
          ]),
        'jobs[0].queuePosition',
      );
    });
  }

  const knownStatuses = [
    ADAPTIVE_QUEUE_WAITING_STATUS,
    ...ADAPTIVE_QUEUE_ACTIVE_PHASE_STATUSES,
    ...ADAPTIVE_QUEUE_TERMINAL_STATUSES,
  ];

  for (const status of knownStatuses) {
    it(`AQV-20 accepts known status ${status}`, () => {
      expect(
        validateAdaptiveQueueJobsResponse([makeJob({ status })])[0]
          .status,
      ).toBe(status);
    });
  }

  it('AQV-21 accepts an unrecognised status string without repairing it', () => {
    expect(
      validateAdaptiveQueueJobsResponse([
        makeJob({ status: 'FutureStatus' }),
      ])[0].status,
    ).toBe('FutureStatus');
  });

  it('AQV-22 rejects a non-string status', () => {
    expectResponseError(
      () =>
        validateAdaptiveQueueJobsResponse([makeJob({ status: 3 })]),
      'jobs[0].status',
    );
  });

  it('AQV-23 does not enforce the 200-job limit during validation', () => {
    const response = Array.from(
      { length: ADAPTIVE_QUEUE_JOB_LIMIT + 1 },
      (_, index) => makeJob({ id: uuid(index + 1) }),
    );

    expect(validateAdaptiveQueueJobsResponse(response)).toHaveLength(
      ADAPTIVE_QUEUE_JOB_LIMIT + 1,
    );
  });

  it('AQV-24 reports the index of the first invalid job', () => {
    expectResponseError(
      () =>
        validateAdaptiveQueueJobsResponse([
          makeJob({ id: uuid(1) }),
          makeJob({ id: uuid(2) }),
          makeJob({ id: uuid(3), estimatedMinutes: -5 }),
        ]),
      'jobs[2].estimatedMinutes',
    );
  });

  it('AQV-25 does not mutate the response and returns new objects', () => {
    const response = Object.freeze([
      Object.freeze(makeJob({ id: uuid(1) })),
    ]);
    const before = JSON.stringify(response);

    const result = validateAdaptiveQueueJobsResponse(response);

    expect(JSON.stringify(response)).toBe(before);
    expect(result[0]).not.toBe(response[0]);
  });

  it('AQV-26 does not include response values in the error message', () => {
    const error = captureError(() =>
      validateAdaptiveQueueJobsResponse([
        makeJob({ id: 'secret-token-value' }),
      ]),
    ) as Error;

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AdaptiveQueueResponseError');
    expect(error.message).toBe(
      'Invalid adaptive queue response: jobs[0].id',
    );
    expect(error.message).not.toContain('secret-token-value');
  });
});

describe('validateAdaptiveQueueJobResponse', () => {
  it('AQV-27 accepts a valid single job', () => {
    const response = makeJob({ status: 'Paused' });

    expect(validateAdaptiveQueueJobResponse(response))
      .toEqual(response);
  });

  it('AQV-28 uses the supplied path in errors', () => {
    expectResponseError(
      () =>
        validateAdaptiveQueueJobResponse(
          makeJob({ number: 5 }),
          'payload',
        ),
      'payload.number',
    );
  });

  it('AQV-29 defaults the path to job', () => {
    expectResponseError(
      () => validateAdaptiveQueueJobResponse(null),
      'job',
    );
  });

  it('AQV-30 rejects the partial BillingService job.updated payload', () => {
    expectResponseError(
      () =>
        validateAdaptiveQueueJobResponse({
          jobId: uuid(1),
          status: 'Closed',
        }),
      'job.id',
    );
  });
});

describe('validateAdaptiveQueueBaysResponse', () => {
  it('AQV-31 accepts an empty bay list', () => {
    expect(validateAdaptiveQueueBaysResponse([])).toEqual([]);
  });

  it('AQV-32 accepts active and inactive bays in server order', () => {
    const response = [
      makeBay({ id: uuid(102), name: 'Bay 3', active: false }),
      makeBay({ id: uuid(100), name: 'Bay 1', active: true }),
      makeBay({ id: uuid(101), name: 'Bay 2', active: true }),
    ];

    const result = validateAdaptiveQueueBaysResponse(response);

    expect(result).toEqual(response);
    expect(result.map(bay => bay.name)).toEqual([
      'Bay 3',
      'Bay 1',
      'Bay 2',
    ]);
  });

  for (const value of [null, undefined, {}, 'bays', 5]) {
    it(`AQV-33 rejects a non-array bay response (${JSON.stringify(
      value,
    )})`, () => {
      expectResponseError(
        () => validateAdaptiveQueueBaysResponse(value),
        'bays',
      );
    });
  }

  for (const field of ['id', 'name', 'active']) {
    it(`AQV-34 rejects a bay missing ${field}`, () => {
      const bay = makeBay();
      delete bay[field];

      expectResponseError(
        () => validateAdaptiveQueueBaysResponse([bay]),
        `bays[0].${field}`,
      );
    });
  }

  it('AQV-35 rejects an invalid bay UUID', () => {
    expectResponseError(
      () =>
        validateAdaptiveQueueBaysResponse([
          makeBay({ id: 'bay-one' }),
        ]),
      'bays[0].id',
    );
  });

  it('AQV-36 rejects a non-boolean active flag', () => {
    expectResponseError(
      () =>
        validateAdaptiveQueueBaysResponse([
          makeBay({ active: 'true' }),
        ]),
      'bays[0].active',
    );
  });

  it('AQV-37 rejects duplicate bay ids', () => {
    expectResponseError(
      () =>
        validateAdaptiveQueueBaysResponse([
          makeBay({ id: uuid(100), name: 'Bay 1' }),
          makeBay({ id: uuid(101), name: 'Bay 2' }),
          makeBay({ id: uuid(100), name: 'Bay 1 copy' }),
        ]),
      'bays[2].id',
    );
  });

  it('AQV-38 treats bay ids case-insensitively when detecting duplicates', () => {
    expectResponseError(
      () =>
        validateAdaptiveQueueBaysResponse([
          makeBay({ id: 'ABCDEF00-0000-4000-8000-000000000100' }),
          makeBay({ id: 'abcdef00-0000-4000-8000-000000000100' }),
        ]),
      'bays[1].id',
    );
  });

  it('AQV-39 allows duplicate bay names with different ids', () => {
    expect(
      validateAdaptiveQueueBaysResponse([
        makeBay({ id: uuid(100), name: 'Bay' }),
        makeBay({ id: uuid(101), name: 'Bay' }),
      ]),
    ).toHaveLength(2);
  });
});
