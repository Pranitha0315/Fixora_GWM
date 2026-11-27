import type {
  BayDto,
  JobSummaryDto,
} from '../../bookings/models/booking-support.model';

import {
  ADAPTIVE_QUEUE_ACTIVE_PHASE_STATUSES,
  ADAPTIVE_QUEUE_JOB_LIMIT,
  ADAPTIVE_QUEUE_TERMINAL_STATUSES,
} from '../models/adaptive-queue.model';

import type {
  AdaptiveQueueJob,
  AdaptiveQueueSnapshot,
  AdaptiveQueueWarningCode,
} from '../models/adaptive-queue.model';

import {
  buildAdaptiveQueueSnapshot,
  classifyAdaptiveQueueStatus,
  formatAdaptiveQueueEta,
  getAdaptiveQueuePriorityLabel,
  getAdaptiveQueuePriorityLevel,
} from './adaptive-queue.mapper';

const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

const BAY_1 = uuid(101);
const BAY_2 = uuid(102);
const BAY_3 = uuid(103);
const BAY_UNKNOWN = uuid(199);

const MECHANIC_A = uuid(201);
const MECHANIC_B = uuid(202);

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

const ACTIVE_BAYS: readonly BayDto[] = [
  makeBay(BAY_1, 'Bay 1'),
  makeBay(BAY_2, 'Bay 2'),
];

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }

    Object.freeze(value);
  }

  return value;
}

function warningCodes(
  snapshot: AdaptiveQueueSnapshot,
): readonly AdaptiveQueueWarningCode[] {
  return snapshot.warnings.map(warning => warning.code);
}

function locatedJobIds(
  snapshot: AdaptiveQueueSnapshot,
): readonly string[] {
  return [
    ...snapshot.bayColumns.flatMap(column => [
      ...column.activePhaseJobs,
      ...column.preAssignedWaitingJobs,
      ...column.unrecognizedStatusJobs,
    ]),
    ...snapshot.inactiveBayAssignments.flatMap(group => group.jobs),
    ...snapshot.unknownBayAssignments.flatMap(group => group.jobs),
    ...snapshot.unassignedJobs,
  ].map(item => item.job.id);
}

beforeEach(() => {
  jobCounter = 0;
});

describe('classifyAdaptiveQueueStatus', () => {
  it('AQM-01 classifies Open as waiting', () => {
    expect(classifyAdaptiveQueueStatus('Open')).toBe('waiting');
  });

  for (const status of ADAPTIVE_QUEUE_ACTIVE_PHASE_STATUSES) {
    it(`AQM-02 classifies ${status} as active-phase`, () => {
      expect(classifyAdaptiveQueueStatus(status)).toBe('active-phase');
    });
  }

  for (const status of ADAPTIVE_QUEUE_TERMINAL_STATUSES) {
    it(`AQM-03 classifies ${status} as terminal`, () => {
      expect(classifyAdaptiveQueueStatus(status)).toBe('terminal');
    });
  }

  for (const status of ['Archived', '', 'open', 'INPROGRESS', ' Open']) {
    it(`AQM-04 classifies unknown status ${JSON.stringify(
      status,
    )} as unrecognized`, () => {
      expect(classifyAdaptiveQueueStatus(status)).toBe('unrecognized');
    });
  }

  it('AQM-05 covers exactly the nine backend JobStatus values', () => {
    expect(ADAPTIVE_QUEUE_ACTIVE_PHASE_STATUSES).toHaveLength(6);
    expect(ADAPTIVE_QUEUE_TERMINAL_STATUSES).toHaveLength(2);
  });
});

describe('priority helpers', () => {
  const cases = [
    { value: 0, label: 'Normal' },
    { value: 1, label: 'High' },
    { value: 2, label: 'Urgent' },
  ] as const;

  for (const item of cases) {
    it(`AQM-06 maps priority ${item.value} to ${item.label}`, () => {
      expect(getAdaptiveQueuePriorityLabel(item.value))
        .toBe(item.label);
      expect(getAdaptiveQueuePriorityLevel(item.value))
        .toBe(item.value);
    });
  }

  for (const value of [-1, 3, 1.5, Number.NaN]) {
    it(`AQM-07 maps out-of-contract priority ${value} to Unknown`, () => {
      expect(getAdaptiveQueuePriorityLabel(value)).toBe('Unknown');
      expect(getAdaptiveQueuePriorityLevel(value)).toBeNull();
    });
  }
});

describe('formatAdaptiveQueueEta', () => {
  it('AQM-08 formats a UTC timestamp in Asia/Colombo', () => {
    expect(formatAdaptiveQueueEta('2026-11-27T08:30:00Z'))
      .toBe('27 Nov 2026, 14:00');
  });

  it('AQM-09 applies the UTC+05:30 half-hour offset', () => {
    expect(formatAdaptiveQueueEta('2026-11-27T08:00:00Z'))
      .toBe('27 Nov 2026, 13:30');
  });

  it('AQM-10 rolls the date forward across midnight', () => {
    expect(formatAdaptiveQueueEta('2026-12-31T20:00:00Z'))
      .toBe('01 Jan 2027, 01:30');
  });

  it('AQM-11 renders local midnight as 00:00', () => {
    expect(formatAdaptiveQueueEta('2026-11-27T18:30:00Z'))
      .toBe('28 Nov 2026, 00:00');
  });

  it('AQM-12 treats a timestamp without an offset as UTC', () => {
    expect(formatAdaptiveQueueEta('2026-11-27T08:30:00'))
      .toBe('27 Nov 2026, 14:00');
    expect(formatAdaptiveQueueEta('2026-11-27T08:30:00.1234567'))
      .toBe('27 Nov 2026, 14:00');
  });

  it('AQM-13 honours an explicit numeric offset', () => {
    expect(formatAdaptiveQueueEta('2026-11-27T14:00:00+05:30'))
      .toBe('27 Nov 2026, 14:00');
    expect(formatAdaptiveQueueEta('2026-11-27T10:00:00+01:00'))
      .toBe('27 Nov 2026, 14:30');
  });

  it('AQM-14 returns null for a null ETA', () => {
    expect(formatAdaptiveQueueEta(null)).toBeNull();
  });

  for (const value of ['', 'not-a-date', '2026-13-45T00:00:00Z']) {
    it(`AQM-15 returns null for an unparsable ETA ${JSON.stringify(
      value,
    )}`, () => {
      expect(formatAdaptiveQueueEta(value)).toBeNull();
    });
  }

  it('AQM-16 formats another month consistently in Asia/Colombo', () => {
    const first = formatAdaptiveQueueEta('2026-06-01T00:00:00Z');
    const second = formatAdaptiveQueueEta('2026-06-01T00:00:00Z');

    expect(first).toBe('01 Jun 2026, 05:30');
    expect(second).toBe(first);
  });

  // K14: Date.parse rolls impossible calendar dates over (2026-02-30
  // becomes 2 March), which would present an invented time.
  for (const value of [
    '2026-02-30T10:00:00Z',
    '2026-02-29T10:00:00Z',
    '2026-04-31T10:00:00',
    '2026-11-27T24:00:00Z',
    '2026-11-27T10:60:00Z',
    '2026-11-27T10:00:60Z',
    '2026-11-27T10:00:00+24:00',
    '2026-11-27T10:00:00+05:60',
    '2026-11-27',
    '2026-11-27T08:30Z',
  ]) {
    it(`AQM-70 never invents a time for the impossible ETA ${JSON.stringify(
      value,
    )}`, () => {
      expect(formatAdaptiveQueueEta(value)).toBeNull();
    });
  }

  it('AQM-71 accepts a real leap day', () => {
    expect(formatAdaptiveQueueEta('2028-02-29T10:00:00Z'))
      .toBe('29 Feb 2028, 15:30');
  });

  it('AQM-72 truncates, and never rounds, seven-digit fractional seconds', () => {
    // The backend serializes DateTime with up to seven fractional digits.
    expect(formatAdaptiveQueueEta('2026-11-27T08:29:59.9999999Z'))
      .toBe('27 Nov 2026, 13:59');
    expect(formatAdaptiveQueueEta('2026-11-27T08:29:59.9999999'))
      .toBe('27 Nov 2026, 13:59');
  });

  it('AQM-73 reads Z in either case and gives the same instant for equivalent forms', () => {
    const expected = '27 Nov 2026, 14:00';

    expect(formatAdaptiveQueueEta('2026-11-27T08:30:00z')).toBe(expected);
    expect(formatAdaptiveQueueEta('2026-11-27T08:30:00Z')).toBe(expected);
    expect(formatAdaptiveQueueEta('2026-11-27T08:30:00')).toBe(expected);
    expect(formatAdaptiveQueueEta('2026-11-27T14:00:00+05:30')).toBe(expected);
    expect(formatAdaptiveQueueEta('2026-11-27T03:00:00-05:30')).toBe(expected);
  });
});

describe('buildAdaptiveQueueSnapshot: empty input', () => {
  it('AQM-17 returns an empty snapshot for no jobs and no bays', () => {
    const snapshot = buildAdaptiveQueueSnapshot([], []);

    expect(snapshot.waitingJobs).toEqual([]);
    expect(snapshot.activePhaseJobs).toEqual([]);
    expect(snapshot.unrecognizedStatusJobs).toEqual([]);
    expect(snapshot.bayColumns).toEqual([]);
    expect(snapshot.unassignedJobs).toEqual([]);
    expect(snapshot.inactiveBayAssignments).toEqual([]);
    expect(snapshot.unknownBayAssignments).toEqual([]);
    expect(snapshot.duplicateBayAssignments).toEqual([]);
    expect(snapshot.duplicateMechanicAssignments).toEqual([]);
    expect(snapshot.capacity).toEqual({
      totalBayCount: 0,
      activeBayCount: 0,
      inactiveBayCount: 0,
      activePhaseJobCount: 0,
      waitingJobCount: 0,
      unrecognizedStatusJobCount: 0,
      boardJobCount: 0,
      excludedTerminalJobCount: 0,
      saturation: 'no-active-bays',
    });
    expect(snapshot.jobLimit).toEqual({
      limit: ADAPTIVE_QUEUE_JOB_LIMIT,
      receivedCount: 0,
      reached: false,
    });
  });

  it('AQM-18 shows active bay columns even when there are no jobs', () => {
    const snapshot = buildAdaptiveQueueSnapshot([], ACTIVE_BAYS);

    expect(snapshot.bayColumns.map(column => column.bay.name))
      .toEqual(['Bay 1', 'Bay 2']);
    expect(snapshot.bayColumns.every(
      column =>
        column.activePhaseJobs.length === 0
        && column.preAssignedWaitingJobs.length === 0,
    )).toBe(true);
    expect(snapshot.capacity.saturation)
      .toBe('below-active-bay-count');
    expect(warningCodes(snapshot)).toEqual([]);
  });
});

describe('buildAdaptiveQueueSnapshot: status handling', () => {
  it('AQM-19 separates waiting and active-phase jobs by status', () => {
    const waiting = makeJob({ status: 'Open', queuePosition: 1 });
    const working = makeJob({ status: 'InProgress', queuePosition: 0 });

    const snapshot = buildAdaptiveQueueSnapshot(
      [working, waiting],
      ACTIVE_BAYS,
    );

    expect(snapshot.waitingJobs.map(item => item.job.id))
      .toEqual([waiting.id]);
    expect(snapshot.activePhaseJobs.map(item => item.job.id))
      .toEqual([working.id]);
    expect(snapshot.waitingJobs[0].phase).toBe('waiting');
    expect(snapshot.activePhaseJobs[0].phase).toBe('active-phase');
  });

  for (const status of ADAPTIVE_QUEUE_ACTIVE_PHASE_STATUSES) {
    it(`AQM-20 treats ${status} as an active-phase job`, () => {
      const job = makeJob({ status, queuePosition: 0 });

      const snapshot = buildAdaptiveQueueSnapshot([job], ACTIVE_BAYS);

      expect(snapshot.activePhaseJobs.map(item => item.job.id))
        .toEqual([job.id]);
      expect(snapshot.waitingJobs).toEqual([]);
      expect(snapshot.capacity.activePhaseJobCount).toBe(1);
    });
  }

  for (const status of ADAPTIVE_QUEUE_TERMINAL_STATUSES) {
    it(`AQM-21 excludes ${status} jobs from every list`, () => {
      const kept = makeJob({ status: 'Open' });
      const terminal = makeJob({
        status,
        bayId: BAY_1,
        mechanicId: MECHANIC_A,
      });

      const snapshot = buildAdaptiveQueueSnapshot(
        [terminal, kept],
        ACTIVE_BAYS,
      );

      expect(locatedJobIds(snapshot)).toEqual([kept.id]);
      expect(snapshot.waitingJobs.map(item => item.job.id))
        .toEqual([kept.id]);
      expect(snapshot.activePhaseJobs).toEqual([]);
      expect(snapshot.capacity.excludedTerminalJobCount).toBe(1);
      expect(snapshot.capacity.boardJobCount).toBe(1);
    });
  }

  it('AQM-22 keeps unrecognised statuses visible without claiming occupancy', () => {
    const unknown = makeJob({
      status: 'FutureStatus',
      bayId: BAY_1,
      mechanicId: MECHANIC_A,
    });

    const snapshot = buildAdaptiveQueueSnapshot(
      [unknown],
      ACTIVE_BAYS,
    );

    expect(snapshot.unrecognizedStatusJobs.map(item => item.job.id))
      .toEqual([unknown.id]);
    expect(snapshot.unrecognizedStatusJobs[0].phase)
      .toBe('unrecognized');
    expect(snapshot.waitingJobs).toEqual([]);
    expect(snapshot.activePhaseJobs).toEqual([]);
    expect(snapshot.capacity.activePhaseJobCount).toBe(0);
    expect(snapshot.capacity.waitingJobCount).toBe(0);
    expect(snapshot.capacity.unrecognizedStatusJobCount).toBe(1);
    expect(snapshot.capacity.boardJobCount).toBe(1);
    expect(snapshot.bayColumns[0].unrecognizedStatusJobs)
      .toHaveLength(1);
    expect(snapshot.bayColumns[0].activePhaseJobs).toEqual([]);
    expect(snapshot.bayColumns[0].preAssignedWaitingJobs).toEqual([]);
    expect(warningCodes(snapshot)).toContain('unrecognized-status-jobs');
  });

  it('AQM-23 does not count unrecognised jobs in duplicate detection', () => {
    const snapshot = buildAdaptiveQueueSnapshot(
      [
        makeJob({ status: 'FutureA', bayId: BAY_1, mechanicId: MECHANIC_A }),
        makeJob({ status: 'FutureB', bayId: BAY_1, mechanicId: MECHANIC_A }),
      ],
      ACTIVE_BAYS,
    );

    expect(snapshot.duplicateBayAssignments).toEqual([]);
    expect(snapshot.duplicateMechanicAssignments).toEqual([]);
    expect(snapshot.bayColumns[0].hasDuplicateActivePhaseAssignment)
      .toBe(false);
  });

  it('AQM-24 maps priority and ETA display onto each job', () => {
    const urgent = makeJob({
      priority: 2,
      etaAt: '2026-11-27T08:30:00Z',
    });
    const normal = makeJob({ priority: 0, etaAt: null });

    const snapshot = buildAdaptiveQueueSnapshot(
      [urgent, normal],
      ACTIVE_BAYS,
    );

    const byId = new Map(
      snapshot.waitingJobs.map(
        (item): [string, AdaptiveQueueJob] => [item.job.id, item],
      ),
    );

    expect(byId.get(urgent.id)?.priorityLabel).toBe('Urgent');
    expect(byId.get(urgent.id)?.priorityLevel).toBe(2);
    expect(byId.get(urgent.id)?.etaDisplay)
      .toBe('27 Nov 2026, 14:00');
    expect(byId.get(normal.id)?.priorityLabel).toBe('Normal');
    expect(byId.get(normal.id)?.priorityLevel).toBe(0);
    expect(byId.get(normal.id)?.etaDisplay).toBeNull();
  });

  it('AQM-25 never replaces the backend ETA or queue position', () => {
    const job = makeJob({
      queuePosition: 7,
      etaAt: '2026-11-27T08:30:00Z',
    });

    const snapshot = buildAdaptiveQueueSnapshot([job], ACTIVE_BAYS);

    expect(snapshot.waitingJobs[0].job).toBe(job);
    expect(snapshot.waitingJobs[0].job.queuePosition).toBe(7);
    expect(snapshot.waitingJobs[0].job.etaAt)
      .toBe('2026-11-27T08:30:00Z');
  });
});

describe('buildAdaptiveQueueSnapshot: waiting order', () => {
  it('AQM-26 sorts waiting jobs by queuePosition ascending', () => {
    const third = makeJob({ queuePosition: 3 });
    const first = makeJob({ queuePosition: 1 });
    const second = makeJob({ queuePosition: 2 });

    const snapshot = buildAdaptiveQueueSnapshot(
      [third, first, second],
      ACTIVE_BAYS,
    );

    expect(snapshot.waitingJobs.map(item => item.job.queuePosition))
      .toEqual([1, 2, 3]);
  });

  it('AQM-27 preserves server order for equal queue positions', () => {
    const a = makeJob({ queuePosition: 2, number: 'A' });
    const b = makeJob({ queuePosition: 1, number: 'B' });
    const c = makeJob({ queuePosition: 2, number: 'C' });
    const d = makeJob({ queuePosition: 2, number: 'D' });

    const snapshot = buildAdaptiveQueueSnapshot(
      [a, b, c, d],
      ACTIVE_BAYS,
    );

    expect(snapshot.waitingJobs.map(item => item.job.number))
      .toEqual(['B', 'A', 'C', 'D']);
  });

  it('AQM-28 does not reorder by priority or recalculate positions', () => {
    const normalFirst = makeJob({ priority: 0, queuePosition: 1 });
    const urgentSecond = makeJob({ priority: 2, queuePosition: 2 });
    const gap = makeJob({ priority: 1, queuePosition: 9 });

    const snapshot = buildAdaptiveQueueSnapshot(
      [gap, urgentSecond, normalFirst],
      ACTIVE_BAYS,
    );

    expect(snapshot.waitingJobs.map(item => item.job.queuePosition))
      .toEqual([1, 2, 9]);
    expect(snapshot.waitingJobs.map(item => item.priorityLabel))
      .toEqual(['Normal', 'Urgent', 'High']);
  });

  it('AQM-29 preserves server order for active-phase jobs', () => {
    const a = makeJob({ status: 'InProgress', queuePosition: 0, number: 'A' });
    const b = makeJob({ status: 'Paused', queuePosition: 0, number: 'B' });
    const c = makeJob({ status: 'Inspecting', queuePosition: 0, number: 'C' });

    const snapshot = buildAdaptiveQueueSnapshot([c, a, b], ACTIVE_BAYS);

    expect(snapshot.activePhaseJobs.map(item => item.job.number))
      .toEqual(['C', 'A', 'B']);
  });
});

describe('buildAdaptiveQueueSnapshot: bay columns', () => {
  it('AQM-30 creates one column per active bay in backend order', () => {
    const bays = [
      makeBay(BAY_3, 'Bay C'),
      makeBay(BAY_1, 'Bay A'),
      makeBay(BAY_2, 'Bay B'),
    ];

    const snapshot = buildAdaptiveQueueSnapshot([], bays);

    expect(snapshot.bayColumns.map(column => column.bay.name))
      .toEqual(['Bay C', 'Bay A', 'Bay B']);
  });

  it('AQM-31 does not create columns for inactive bays', () => {
    const bays = [
      makeBay(BAY_1, 'Bay 1'),
      makeBay(BAY_2, 'Bay 2', false),
      makeBay(BAY_3, 'Bay 3'),
    ];

    const snapshot = buildAdaptiveQueueSnapshot([], bays);

    expect(snapshot.bayColumns.map(column => column.bay.id))
      .toEqual([BAY_1, BAY_3]);
    expect(snapshot.capacity.totalBayCount).toBe(3);
    expect(snapshot.capacity.activeBayCount).toBe(2);
    expect(snapshot.capacity.inactiveBayCount).toBe(1);
  });

  it('AQM-32 separates active-phase jobs from pre-assigned waiting jobs', () => {
    const working = makeJob({
      status: 'InProgress',
      queuePosition: 0,
      bayId: BAY_1,
    });
    const waiting = makeJob({
      status: 'Open',
      queuePosition: 1,
      bayId: BAY_1,
    });

    const snapshot = buildAdaptiveQueueSnapshot(
      [working, waiting],
      ACTIVE_BAYS,
    );

    const column = snapshot.bayColumns[0];

    expect(column.activePhaseJobs.map(item => item.job.id))
      .toEqual([working.id]);
    expect(column.preAssignedWaitingJobs.map(item => item.job.id))
      .toEqual([waiting.id]);
    expect(snapshot.bayColumns[1].activePhaseJobs).toEqual([]);
  });

  it('AQM-33 does not count waiting jobs as bay occupancy', () => {
    const snapshot = buildAdaptiveQueueSnapshot(
      [
        makeJob({ status: 'Open', queuePosition: 1, bayId: BAY_1 }),
        makeJob({ status: 'Open', queuePosition: 2, bayId: BAY_1 }),
        makeJob({ status: 'Open', queuePosition: 3, bayId: BAY_2 }),
      ],
      ACTIVE_BAYS,
    );

    expect(snapshot.capacity.activePhaseJobCount).toBe(0);
    expect(snapshot.capacity.waitingJobCount).toBe(3);
    expect(snapshot.capacity.saturation)
      .toBe('below-active-bay-count');
    expect(warningCodes(snapshot)).toEqual([]);
  });

  it('AQM-34 keeps backend order of jobs inside a column', () => {
    const a = makeJob({ status: 'Open', queuePosition: 2, bayId: BAY_1, number: 'A' });
    const b = makeJob({ status: 'Open', queuePosition: 1, bayId: BAY_1, number: 'B' });

    const snapshot = buildAdaptiveQueueSnapshot([a, b], ACTIVE_BAYS);

    expect(
      snapshot.bayColumns[0].preAssignedWaitingJobs.map(
        item => item.job.number,
      ),
    ).toEqual(['A', 'B']);
    expect(snapshot.waitingJobs.map(item => item.job.number))
      .toEqual(['B', 'A']);
  });

  it('AQM-35 matches bay ids case-insensitively', () => {
    const job = makeJob({
      status: 'InProgress',
      queuePosition: 0,
      bayId: BAY_1.toUpperCase(),
    });

    const snapshot = buildAdaptiveQueueSnapshot([job], ACTIVE_BAYS);

    expect(snapshot.bayColumns[0].activePhaseJobs).toHaveLength(1);
    expect(snapshot.unknownBayAssignments).toEqual([]);
  });

  it('AQM-36 uses the first occurrence when bay ids repeat', () => {
    const job = makeJob({ status: 'InProgress', queuePosition: 0, bayId: BAY_1 });

    const snapshot = buildAdaptiveQueueSnapshot(
      [job],
      [makeBay(BAY_1, 'First'), makeBay(BAY_1, 'Second')],
    );

    expect(snapshot.bayColumns).toHaveLength(1);
    expect(snapshot.bayColumns[0].bay.name).toBe('First');
    expect(locatedJobIds(snapshot)).toEqual([job.id]);
  });
});

describe('buildAdaptiveQueueSnapshot: duplicate active-phase assignments', () => {
  it('AQM-37 flags multiple active-phase jobs sharing one bay', () => {
    const first = makeJob({ status: 'InProgress', queuePosition: 0, bayId: BAY_1 });
    const second = makeJob({ status: 'Paused', queuePosition: 0, bayId: BAY_1 });

    const snapshot = buildAdaptiveQueueSnapshot(
      [first, second],
      ACTIVE_BAYS,
    );

    expect(snapshot.bayColumns[0].hasDuplicateActivePhaseAssignment)
      .toBe(true);
    expect(snapshot.bayColumns[0].activePhaseJobs).toHaveLength(2);
    expect(snapshot.duplicateBayAssignments).toHaveLength(1);
    expect(snapshot.duplicateBayAssignments[0].bayId).toBe(BAY_1);
    expect(snapshot.duplicateBayAssignments[0].bayLabel).toBe('Bay 1');
    expect(
      snapshot.duplicateBayAssignments[0].jobs.map(item => item.job.id),
    ).toEqual([first.id, second.id]);
    expect(snapshot.bayColumns[1].hasDuplicateActivePhaseAssignment)
      .toBe(false);
  });

  it('AQM-38 reports the duplicate bay warning as advisory only', () => {
    const snapshot = buildAdaptiveQueueSnapshot(
      [
        makeJob({ status: 'InProgress', queuePosition: 0, bayId: BAY_1 }),
        makeJob({ status: 'InProgress', queuePosition: 0, bayId: BAY_1 }),
      ],
      ACTIVE_BAYS,
    );

    const warning = snapshot.warnings.find(
      item => item.code === 'duplicate-active-bay-assignment',
    );

    expect(warning).toBeDefined();
    expect(warning?.advisory).toBe(true);
    expect(warning?.severity).toBe('warning');
    expect(warning?.message).toContain('not a backend-enforced conflict');
  });

  it('AQM-39 does not flag multiple waiting jobs sharing a bay', () => {
    const snapshot = buildAdaptiveQueueSnapshot(
      [
        makeJob({ status: 'Open', queuePosition: 1, bayId: BAY_1 }),
        makeJob({ status: 'Open', queuePosition: 2, bayId: BAY_1 }),
      ],
      ACTIVE_BAYS,
    );

    expect(snapshot.bayColumns[0].hasDuplicateActivePhaseAssignment)
      .toBe(false);
    expect(snapshot.bayColumns[0].preAssignedWaitingJobs).toHaveLength(2);
    expect(snapshot.duplicateBayAssignments).toEqual([]);
    expect(warningCodes(snapshot))
      .not.toContain('duplicate-active-bay-assignment');
  });

  it('AQM-40 does not flag one active-phase job sharing a bay with waiting jobs', () => {
    const snapshot = buildAdaptiveQueueSnapshot(
      [
        makeJob({ status: 'InProgress', queuePosition: 0, bayId: BAY_1 }),
        makeJob({ status: 'Open', queuePosition: 1, bayId: BAY_1 }),
        makeJob({ status: 'Open', queuePosition: 2, bayId: BAY_1 }),
      ],
      ACTIVE_BAYS,
    );

    expect(snapshot.bayColumns[0].hasDuplicateActivePhaseAssignment)
      .toBe(false);
    expect(snapshot.duplicateBayAssignments).toEqual([]);
  });

  it('AQM-41 detects duplicate active-phase jobs on an inactive or unknown bay', () => {
    const snapshot = buildAdaptiveQueueSnapshot(
      [
        makeJob({ status: 'InProgress', queuePosition: 0, bayId: BAY_3 }),
        makeJob({ status: 'InProgress', queuePosition: 0, bayId: BAY_3 }),
        makeJob({
          status: 'InProgress',
          queuePosition: 0,
          bayId: BAY_UNKNOWN,
          bayName: 'Legacy Bay',
        }),
        makeJob({
          status: 'InProgress',
          queuePosition: 0,
          bayId: BAY_UNKNOWN,
          bayName: 'Legacy Bay',
        }),
      ],
      [...ACTIVE_BAYS, makeBay(BAY_3, 'Bay 3', false)],
    );

    expect(
      snapshot.duplicateBayAssignments.map(item => item.bayLabel),
    ).toEqual(['Bay 3', 'Legacy Bay']);
  });

  it('AQM-42 flags multiple active-phase jobs sharing one mechanic', () => {
    const first = makeJob({
      status: 'InProgress',
      queuePosition: 0,
      mechanicId: MECHANIC_A,
      mechanicName: 'Nimal',
      bayId: BAY_1,
    });
    const second = makeJob({
      status: 'Inspecting',
      queuePosition: 0,
      mechanicId: MECHANIC_A,
      mechanicName: 'Nimal',
      bayId: BAY_2,
    });
    const other = makeJob({
      status: 'InProgress',
      queuePosition: 0,
      mechanicId: MECHANIC_B,
      mechanicName: 'Kamal',
    });

    const snapshot = buildAdaptiveQueueSnapshot(
      [first, other, second],
      ACTIVE_BAYS,
    );

    expect(snapshot.duplicateMechanicAssignments).toHaveLength(1);
    expect(snapshot.duplicateMechanicAssignments[0].mechanicId)
      .toBe(MECHANIC_A);
    expect(snapshot.duplicateMechanicAssignments[0].mechanicLabel)
      .toBe('Nimal');
    expect(
      snapshot.duplicateMechanicAssignments[0].jobs.map(
        item => item.job.id,
      ),
    ).toEqual([first.id, second.id]);
    expect(snapshot.duplicateBayAssignments).toEqual([]);

    const warning = snapshot.warnings.find(
      item => item.code === 'duplicate-active-mechanic-assignment',
    );

    expect(warning?.advisory).toBe(true);
    expect(warning?.message).toContain('not a backend-enforced conflict');
  });

  it('AQM-43 does not flag waiting jobs that share a mechanic', () => {
    const snapshot = buildAdaptiveQueueSnapshot(
      [
        makeJob({ status: 'Open', queuePosition: 1, mechanicId: MECHANIC_A }),
        makeJob({ status: 'Open', queuePosition: 2, mechanicId: MECHANIC_A }),
        makeJob({ status: 'InProgress', queuePosition: 0, mechanicId: MECHANIC_A }),
      ],
      ACTIVE_BAYS,
    );

    expect(snapshot.duplicateMechanicAssignments).toEqual([]);
    expect(warningCodes(snapshot))
      .not.toContain('duplicate-active-mechanic-assignment');
  });

  it('AQM-44 ignores null bay and mechanic assignments when grouping', () => {
    const snapshot = buildAdaptiveQueueSnapshot(
      [
        makeJob({ status: 'InProgress', queuePosition: 0 }),
        makeJob({ status: 'InProgress', queuePosition: 0 }),
      ],
      ACTIVE_BAYS,
    );

    expect(snapshot.duplicateBayAssignments).toEqual([]);
    expect(snapshot.duplicateMechanicAssignments).toEqual([]);
  });

  it('AQM-45 falls back to a generic mechanic label when no name exists', () => {
    const snapshot = buildAdaptiveQueueSnapshot(
      [
        makeJob({ status: 'InProgress', queuePosition: 0, mechanicId: MECHANIC_A }),
        makeJob({ status: 'InProgress', queuePosition: 0, mechanicId: MECHANIC_A }),
      ],
      ACTIVE_BAYS,
    );

    expect(snapshot.duplicateMechanicAssignments[0].mechanicLabel)
      .toBe('Unknown mechanic');
  });
});

describe('buildAdaptiveQueueSnapshot: fallback buckets', () => {
  it('AQM-46 places null bay assignments in the unassigned list', () => {
    const waiting = makeJob({ status: 'Open', queuePosition: 1, bayId: null });
    const working = makeJob({ status: 'InProgress', queuePosition: 0, bayId: null });

    const snapshot = buildAdaptiveQueueSnapshot(
      [waiting, working],
      ACTIVE_BAYS,
    );

    expect(snapshot.unassignedJobs.map(item => item.job.id))
      .toEqual([waiting.id, working.id]);
    expect(snapshot.bayColumns.every(
      column =>
        column.activePhaseJobs.length === 0
        && column.preAssignedWaitingJobs.length === 0,
    )).toBe(true);
  });

  it('AQM-47 warns only about unassigned active-phase jobs', () => {
    const waitingOnly = buildAdaptiveQueueSnapshot(
      [makeJob({ status: 'Open', bayId: null })],
      ACTIVE_BAYS,
    );
    const withActive = buildAdaptiveQueueSnapshot(
      [makeJob({ status: 'InProgress', queuePosition: 0, bayId: null })],
      ACTIVE_BAYS,
    );

    expect(warningCodes(waitingOnly))
      .not.toContain('unassigned-active-phase-jobs');
    expect(warningCodes(withActive))
      .toContain('unassigned-active-phase-jobs');
    expect(
      withActive.warnings.find(
        item => item.code === 'unassigned-active-phase-jobs',
      )?.severity,
    ).toBe('info');
  });

  it('AQM-48 groups inactive bay assignments by bay in backend bay order', () => {
    const bays = [
      makeBay(BAY_1, 'Bay 1'),
      makeBay(BAY_3, 'Bay 3', false),
      makeBay(BAY_2, 'Bay 2', false),
    ];

    const onBay2 = makeJob({ status: 'Open', queuePosition: 1, bayId: BAY_2 });
    const onBay3 = makeJob({ status: 'InProgress', queuePosition: 0, bayId: BAY_3 });
    const onBay3Too = makeJob({ status: 'Open', queuePosition: 2, bayId: BAY_3 });

    const snapshot = buildAdaptiveQueueSnapshot(
      [onBay2, onBay3, onBay3Too],
      bays,
    );

    expect(snapshot.inactiveBayAssignments.map(group => group.bayLabel))
      .toEqual(['Bay 3', 'Bay 2']);
    expect(snapshot.inactiveBayAssignments[0].bay).toEqual(bays[1]);
    expect(snapshot.inactiveBayAssignments[0].bayId).toBe(BAY_3);
    expect(
      snapshot.inactiveBayAssignments[0].jobs.map(item => item.job.id),
    ).toEqual([onBay3.id, onBay3Too.id]);
    expect(snapshot.bayColumns).toHaveLength(1);
    expect(snapshot.bayColumns[0].activePhaseJobs).toEqual([]);

    const warning = snapshot.warnings.find(
      item => item.code === 'inactive-bay-assignments',
    );

    expect(warning?.message).toContain('3 job(s)');
  });

  it('AQM-49 groups unknown bay assignments and keeps a safe label', () => {
    const named = makeJob({
      status: 'InProgress',
      queuePosition: 0,
      bayId: BAY_UNKNOWN,
      bayName: 'Legacy Bay',
    });
    const unnamed = makeJob({
      status: 'Open',
      queuePosition: 1,
      bayId: uuid(198),
      bayName: null,
    });

    const snapshot = buildAdaptiveQueueSnapshot(
      [named, unnamed],
      ACTIVE_BAYS,
    );

    expect(snapshot.unknownBayAssignments).toHaveLength(2);
    expect(snapshot.unknownBayAssignments[0].bay).toBeNull();
    expect(snapshot.unknownBayAssignments[0].bayId).toBe(BAY_UNKNOWN);
    expect(snapshot.unknownBayAssignments[0].bayLabel).toBe('Legacy Bay');
    expect(snapshot.unknownBayAssignments[1].bayLabel).toBe('Unknown bay');
    expect(warningCodes(snapshot)).toContain('unknown-bay-assignments');
  });

  it('AQM-50 treats Guid.Empty and a missing bay list as unknown bays', () => {
    const emptyGuidJob = makeJob({ status: 'Open', bayId: EMPTY_GUID });
    const noBaysJob = makeJob({ status: 'Open', queuePosition: 2, bayId: BAY_1 });

    const snapshot = buildAdaptiveQueueSnapshot(
      [emptyGuidJob, noBaysJob],
      [],
    );

    expect(snapshot.unknownBayAssignments).toHaveLength(2);
    expect([...locatedJobIds(snapshot)].sort())
      .toEqual([emptyGuidJob.id, noBaysJob.id].sort());
  });

  it('AQM-51 puts jobs from one unknown bay in the same group', () => {
    const snapshot = buildAdaptiveQueueSnapshot(
      [
        makeJob({ status: 'Open', queuePosition: 1, bayId: BAY_UNKNOWN }),
        makeJob({ status: 'Open', queuePosition: 2, bayId: BAY_UNKNOWN }),
      ],
      ACTIVE_BAYS,
    );

    expect(snapshot.unknownBayAssignments).toHaveLength(1);
    expect(snapshot.unknownBayAssignments[0].jobs).toHaveLength(2);
  });

  it('AQM-52 places every board job in exactly one location', () => {
    const jobs = [
      makeJob({ status: 'Open', queuePosition: 1, bayId: BAY_1 }),
      makeJob({ status: 'Open', queuePosition: 2, bayId: null }),
      makeJob({ status: 'Open', queuePosition: 3, bayId: BAY_3 }),
      makeJob({ status: 'Open', queuePosition: 4, bayId: BAY_UNKNOWN }),
      makeJob({ status: 'InProgress', queuePosition: 0, bayId: BAY_1 }),
      makeJob({ status: 'Paused', queuePosition: 0, bayId: BAY_1 }),
      makeJob({ status: 'AwaitingRelease', queuePosition: 0, bayId: BAY_2 }),
      makeJob({ status: 'Inspecting', queuePosition: 0, bayId: BAY_3 }),
      makeJob({ status: 'AwaitingManagerReview', queuePosition: 0, bayId: null }),
      makeJob({ status: 'AwaitingCustomerApproval', queuePosition: 0, bayId: BAY_UNKNOWN }),
      makeJob({ status: 'FutureStatus', bayId: BAY_2 }),
      makeJob({ status: 'FutureStatus', bayId: null }),
      makeJob({ status: 'Completed', bayId: BAY_1 }),
      makeJob({ status: 'Closed', bayId: null }),
    ];

    const snapshot = buildAdaptiveQueueSnapshot(jobs, [
      ...ACTIVE_BAYS,
      makeBay(BAY_3, 'Bay 3', false),
    ]);

    const located = locatedJobIds(snapshot);
    const expected = jobs
      .filter(job => !['Completed', 'Closed'].includes(job.status))
      .map(job => job.id);

    expect(new Set(located).size).toBe(located.length);
    expect([...located].sort()).toEqual([...expected].sort());
    expect(snapshot.capacity.boardJobCount).toBe(expected.length);
    expect(snapshot.capacity.excludedTerminalJobCount).toBe(2);
    expect(
      snapshot.waitingJobs.length
        + snapshot.activePhaseJobs.length
        + snapshot.unrecognizedStatusJobs.length,
    ).toBe(expected.length);
  });
});

describe('buildAdaptiveQueueSnapshot: capacity', () => {
  it('AQM-53 handles zero active bays without hiding jobs', () => {
    const waiting = makeJob({ status: 'Open', queuePosition: 1, bayId: BAY_1 });
    const working = makeJob({ status: 'InProgress', queuePosition: 0, bayId: null });

    const snapshot = buildAdaptiveQueueSnapshot(
      [waiting, working],
      [makeBay(BAY_1, 'Bay 1', false)],
    );

    expect(snapshot.bayColumns).toEqual([]);
    expect(snapshot.capacity.activeBayCount).toBe(0);
    expect(snapshot.capacity.saturation).toBe('no-active-bays');
    expect(snapshot.waitingJobs).toHaveLength(1);
    expect(snapshot.activePhaseJobs).toHaveLength(1);
    expect([...locatedJobIds(snapshot)].sort())
      .toEqual([waiting.id, working.id].sort());
    expect(warningCodes(snapshot)).toContain('no-active-bays');
    expect(warningCodes(snapshot)).not.toContain('capacity-saturation');
  });

  it('AQM-54 reports no active bays when the bay list is empty', () => {
    const snapshot = buildAdaptiveQueueSnapshot(
      [makeJob({ status: 'Open' })],
      [],
    );

    expect(snapshot.capacity.totalBayCount).toBe(0);
    expect(snapshot.capacity.saturation).toBe('no-active-bays');
  });

  it('AQM-55 reports below capacity when active-phase jobs are fewer than active bays', () => {
    const snapshot = buildAdaptiveQueueSnapshot(
      [makeJob({ status: 'InProgress', queuePosition: 0, bayId: BAY_1 })],
      ACTIVE_BAYS,
    );

    expect(snapshot.capacity.saturation)
      .toBe('below-active-bay-count');
    expect(warningCodes(snapshot)).toEqual([]);
  });

  it('AQM-56 reports full capacity as advisory information', () => {
    const snapshot = buildAdaptiveQueueSnapshot(
      [
        makeJob({ status: 'InProgress', queuePosition: 0, bayId: BAY_1 }),
        makeJob({ status: 'InProgress', queuePosition: 0, bayId: BAY_2 }),
        makeJob({ status: 'Open', queuePosition: 1 }),
      ],
      ACTIVE_BAYS,
    );

    const warning = snapshot.warnings.find(
      item => item.code === 'capacity-saturation',
    );

    expect(snapshot.capacity.saturation)
      .toBe('equals-active-bay-count');
    expect(snapshot.capacity.activePhaseJobCount).toBe(2);
    expect(snapshot.capacity.waitingJobCount).toBe(1);
    expect(warning?.severity).toBe('info');
    expect(warning?.advisory).toBe(true);
    expect(warning?.message).toContain('equal');
    expect(warning?.message)
      .toContain('does not confirm physical occupancy');
    expect(warningCodes(snapshot))
      .not.toContain('duplicate-active-bay-assignment');
  });

  it('AQM-57 reports exceeding the active bay count', () => {
    const snapshot = buildAdaptiveQueueSnapshot(
      [
        makeJob({ status: 'InProgress', queuePosition: 0, bayId: BAY_1 }),
        makeJob({ status: 'Paused', queuePosition: 0, bayId: BAY_2 }),
        makeJob({ status: 'AwaitingCustomerApproval', queuePosition: 0 }),
      ],
      ACTIVE_BAYS,
    );

    expect(snapshot.capacity.saturation)
      .toBe('exceeds-active-bay-count');
    expect(
      snapshot.warnings.find(item => item.code === 'capacity-saturation')
        ?.message,
    ).toContain('exceed');
  });

  it('AQM-58 does not let waiting or terminal jobs affect saturation', () => {
    const snapshot = buildAdaptiveQueueSnapshot(
      [
        ...Array.from({ length: 5 }, (_, index) =>
          makeJob({
            status: 'Open',
            queuePosition: index + 1,
            bayId: BAY_1,
          }),
        ),
        makeJob({ status: 'Completed' }),
        makeJob({ status: 'Closed' }),
      ],
      ACTIVE_BAYS,
    );

    expect(snapshot.capacity.activePhaseJobCount).toBe(0);
    expect(snapshot.capacity.waitingJobCount).toBe(5);
    expect(snapshot.capacity.saturation)
      .toBe('below-active-bay-count');
  });

  it('AQM-59 counts all capacity totals for a mixed data set', () => {
    const snapshot = buildAdaptiveQueueSnapshot(
      [
        makeJob({ status: 'Open', queuePosition: 1 }),
        makeJob({ status: 'Open', queuePosition: 2 }),
        makeJob({ status: 'InProgress', queuePosition: 0 }),
        makeJob({ status: 'FutureStatus' }),
        makeJob({ status: 'Closed' }),
      ],
      [
        makeBay(BAY_1, 'Bay 1'),
        makeBay(BAY_2, 'Bay 2', false),
        makeBay(BAY_3, 'Bay 3'),
      ],
    );

    expect(snapshot.capacity).toEqual({
      totalBayCount: 3,
      activeBayCount: 2,
      inactiveBayCount: 1,
      activePhaseJobCount: 1,
      waitingJobCount: 2,
      unrecognizedStatusJobCount: 1,
      boardJobCount: 4,
      excludedTerminalJobCount: 1,
      saturation: 'below-active-bay-count',
    });
  });
});

describe('buildAdaptiveQueueSnapshot: 200-record advisory', () => {
  function jobsOfLength(length: number): JobSummaryDto[] {
    return Array.from({ length }, (_, index) =>
      makeJob({ queuePosition: index + 1 }),
    );
  }

  it('AQM-60 does not advise below the limit', () => {
    const snapshot = buildAdaptiveQueueSnapshot(
      jobsOfLength(ADAPTIVE_QUEUE_JOB_LIMIT - 1),
      ACTIVE_BAYS,
    );

    expect(snapshot.jobLimit).toEqual({
      limit: 200,
      receivedCount: 199,
      reached: false,
    });
    expect(warningCodes(snapshot)).not.toContain('job-limit-reached');
  });

  it('AQM-61 advises when exactly 200 jobs were received', () => {
    const snapshot = buildAdaptiveQueueSnapshot(
      jobsOfLength(ADAPTIVE_QUEUE_JOB_LIMIT),
      ACTIVE_BAYS,
    );

    const warning = snapshot.warnings.find(
      item => item.code === 'job-limit-reached',
    );

    expect(snapshot.jobLimit.reached).toBe(true);
    expect(snapshot.jobLimit.receivedCount).toBe(200);
    expect(warning?.severity).toBe('warning');
    expect(warning?.advisory).toBe(true);
    expect(warning?.message).toContain('200');
    expect(warning?.message).toContain('may be incomplete');
    expect(snapshot.waitingJobs).toHaveLength(200);
  });

  it('AQM-62 advises above the limit', () => {
    const snapshot = buildAdaptiveQueueSnapshot(
      jobsOfLength(ADAPTIVE_QUEUE_JOB_LIMIT + 1),
      ACTIVE_BAYS,
    );

    expect(snapshot.jobLimit.reached).toBe(true);
    expect(snapshot.jobLimit.receivedCount).toBe(201);
  });

  it('AQM-63 measures the limit on received jobs including terminal ones', () => {
    const jobs = [
      ...jobsOfLength(ADAPTIVE_QUEUE_JOB_LIMIT - 1),
      makeJob({ status: 'Completed' }),
    ];

    const snapshot = buildAdaptiveQueueSnapshot(jobs, ACTIVE_BAYS);

    expect(snapshot.jobLimit.reached).toBe(true);
    expect(snapshot.capacity.boardJobCount).toBe(199);
  });
});

describe('buildAdaptiveQueueSnapshot: purity', () => {
  function buildMixedInput(): {
    readonly jobs: JobSummaryDto[];
    readonly bays: BayDto[];
  } {
    return {
      jobs: [
        makeJob({ status: 'Open', queuePosition: 3, bayId: BAY_1, priority: 1 }),
        makeJob({ status: 'Open', queuePosition: 1, bayId: null, etaAt: '2026-11-27T08:30:00Z' }),
        makeJob({ status: 'InProgress', queuePosition: 0, bayId: BAY_1, mechanicId: MECHANIC_A }),
        makeJob({ status: 'Paused', queuePosition: 0, bayId: BAY_1, mechanicId: MECHANIC_A }),
        makeJob({ status: 'FutureStatus', bayId: BAY_UNKNOWN }),
        makeJob({ status: 'Completed' }),
      ],
      bays: [
        makeBay(BAY_1, 'Bay 1'),
        makeBay(BAY_2, 'Bay 2', false),
      ],
    };
  }

  it('AQM-64 does not mutate frozen input arrays or objects', () => {
    const input = deepFreeze(buildMixedInput());
    const before = JSON.stringify(input);

    expect(() =>
      buildAdaptiveQueueSnapshot(input.jobs, input.bays),
    ).not.toThrow();
    expect(JSON.stringify(input)).toBe(before);
  });

  it('AQM-65 returns new arrays rather than the input arrays', () => {
    const input = buildMixedInput();

    const snapshot = buildAdaptiveQueueSnapshot(input.jobs, input.bays);

    expect(snapshot.waitingJobs).not.toBe(input.jobs);
    expect(snapshot.activePhaseJobs).not.toBe(input.jobs);
    expect(
      snapshot.bayColumns.map(column => column.bay),
    ).toEqual([input.bays[0]]);
  });

  it('AQM-66 does not change the order of the input array', () => {
    const input = buildMixedInput();
    const idsBefore = input.jobs.map(job => job.id);

    buildAdaptiveQueueSnapshot(input.jobs, input.bays);

    expect(input.jobs.map(job => job.id)).toEqual(idsBefore);
  });

  it('AQM-67 is deterministic for identical input', () => {
    const input = buildMixedInput();

    expect(buildAdaptiveQueueSnapshot(input.jobs, input.bays))
      .toEqual(buildAdaptiveQueueSnapshot(input.jobs, input.bays));
  });

  it('AQM-68 references the original job objects in the view models', () => {
    const input = buildMixedInput();

    const snapshot = buildAdaptiveQueueSnapshot(input.jobs, input.bays);

    expect(snapshot.waitingJobs.every(
      item => input.jobs.includes(item.job),
    )).toBe(true);
  });
});
