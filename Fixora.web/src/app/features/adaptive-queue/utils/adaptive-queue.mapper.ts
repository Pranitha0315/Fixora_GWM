import type {
  BayDto,
  JobSummaryDto,
} from '../../bookings/models/booking-support.model';

import { BOOKING_PRIORITIES } from '../../bookings/models/booking.model';
import type { BookingPriority } from '../../bookings/models/booking.model';

import { WORKSHOP_TIME_ZONE } from '../../bookings/utils/booking-calendar.utils';

import {
  ADAPTIVE_QUEUE_ACTIVE_PHASE_STATUSES,
  ADAPTIVE_QUEUE_JOB_LIMIT,
  ADAPTIVE_QUEUE_TERMINAL_STATUSES,
  ADAPTIVE_QUEUE_WAITING_STATUS,
} from '../models/adaptive-queue.model';

import type {
  AdaptiveQueueBayAssignmentGroup,
  AdaptiveQueueBayColumn,
  AdaptiveQueueCapacitySummary,
  AdaptiveQueueDuplicateBayAssignment,
  AdaptiveQueueDuplicateMechanicAssignment,
  AdaptiveQueueJob,
  AdaptiveQueueJobLimitAdvisory,
  AdaptiveQueueJobPhase,
  AdaptiveQueueSaturation,
  AdaptiveQueueSnapshot,
  AdaptiveQueueStatusClass,
  AdaptiveQueueWarning,
} from '../models/adaptive-queue.model';

const UNKNOWN_BAY_LABEL = 'Unknown bay';
const UNKNOWN_MECHANIC_LABEL = 'Unknown mechanic';
const UNKNOWN_PRIORITY_LABEL = 'Unknown';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/**
 * Backend DateTime shape: System.Text.Json writes UTC values with a
 * trailing "Z", but a DateTime read back from SQL Server has an
 * unspecified kind and is written with NO offset at all. Both are
 * UTC. Fractional seconds can have up to seven digits.
 */
const BACKEND_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:(Z)|([+-])(\d{2}):(\d{2}))?$/i;

/**
 * Parses a backend timestamp to epoch milliseconds without relying
 * on Date.parse, which rolls impossible calendar dates over (for
 * example 2026-02-30 becomes 2 March) and so would invent a time.
 * Returns null for anything that is not a real calendar instant.
 * A timestamp without an offset is UTC. Sub-second digits are
 * ignored (truncated, never rounded up into the next minute).
 */
function parseBackendTimestamp(value: string): number | null {
  const match = BACKEND_TIMESTAMP_PATTERN.exec(value);

  if (match === null) {
    return null;
  }

  const part = (index: number): number => Number(match[index] ?? '');

  const year = part(1);
  const month = part(2);
  const day = part(3);
  const hour = part(4);
  const minute = part(5);
  const second = part(6);

  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }

  const date = new Date(0);

  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);

  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }

  const sign = match[8];

  if (sign === undefined) {
    return date.getTime();
  }

  const offsetHours = part(9);
  const offsetMinutes = part(10);

  if (offsetHours > 23 || offsetMinutes > 59) {
    return null;
  }

  const offset = (offsetHours * 60 + offsetMinutes) * 60_000;

  return date.getTime() - (sign === '-' ? -offset : offset);
}

/**
 * Classifies a backend JobStatus string (exact, case-sensitive
 * enum names). Any string that is not a known backend status is
 * 'unrecognized' so the job is surfaced instead of being lost.
 */
export function classifyAdaptiveQueueStatus(
  status: string,
): AdaptiveQueueStatusClass {
  if (status === ADAPTIVE_QUEUE_WAITING_STATUS) {
    return 'waiting';
  }

  if (
    (ADAPTIVE_QUEUE_TERMINAL_STATUSES as readonly string[])
      .includes(status)
  ) {
    return 'terminal';
  }

  if (
    (ADAPTIVE_QUEUE_ACTIVE_PHASE_STATUSES as readonly string[])
      .includes(status)
  ) {
    return 'active-phase';
  }

  return 'unrecognized';
}

/** Returns the BookingPriority for 0, 1 or 2; otherwise null. */
export function getAdaptiveQueuePriorityLevel(
  priority: number,
): BookingPriority | null {
  const match = BOOKING_PRIORITIES.find(
    item => item.value === priority,
  );

  return match ? match.value : null;
}

/** Priority 0 = Normal, 1 = High, 2 = Urgent. */
export function getAdaptiveQueuePriorityLabel(
  priority: number,
): string {
  const match = BOOKING_PRIORITIES.find(
    item => item.value === priority,
  );

  return match ? match.label : UNKNOWN_PRIORITY_LABEL;
}

/**
 * Formats a backend EtaAt (indicative completion time, not a
 * start time) in Asia/Colombo, for example "27 Nov 2026, 14:00".
 * Timestamps without a UTC offset are treated as UTC because the
 * backend stores UTC. Returns null for null or unparsable input;
 * no replacement value is ever produced.
 */
export function formatAdaptiveQueueEta(
  etaAt: string | null,
): string | null {
  if (typeof etaAt !== 'string') {
    return null;
  }

  const time = parseBackendTimestamp(etaAt);

  if (time === null) {
    return null;
  }

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: WORKSHOP_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(time));

  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find(part => part.type === type)?.value ?? '';

  const month = MONTH_NAMES[Number(read('month')) - 1];

  if (month === undefined) {
    return null;
  }

  return `${read('day')} ${month} ${read('year')}, `
    + `${read('hour')}:${read('minute')}`;
}

function toQueueJob(
  job: JobSummaryDto,
  phase: AdaptiveQueueJobPhase,
): AdaptiveQueueJob {
  return {
    job,
    phase,
    priorityLevel: getAdaptiveQueuePriorityLevel(job.priority),
    priorityLabel: getAdaptiveQueuePriorityLabel(job.priority),
    etaDisplay: formatAdaptiveQueueEta(job.etaAt),
  };
}

function idKey(id: string): string {
  return id.toLowerCase();
}

function nonBlank(value: string | null): string | null {
  return value !== null && value.trim() !== '' ? value : null;
}

function firstBayName(
  jobs: readonly AdaptiveQueueJob[],
): string | null {
  for (const item of jobs) {
    const name = nonBlank(item.job.bayName);

    if (name !== null) {
      return name;
    }
  }

  return null;
}

function firstMechanicName(
  jobs: readonly AdaptiveQueueJob[],
): string | null {
  for (const item of jobs) {
    const name = nonBlank(item.job.mechanicName);

    if (name !== null) {
      return name;
    }
  }

  return null;
}

function groupBy(
  jobs: readonly AdaptiveQueueJob[],
  keyOf: (item: AdaptiveQueueJob) => string | null,
): Map<string, AdaptiveQueueJob[]> {
  const groups = new Map<string, AdaptiveQueueJob[]>();

  for (const item of jobs) {
    const key = keyOf(item);

    if (key === null) {
      continue;
    }

    const group = groups.get(key);

    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  return groups;
}

function resolveSaturation(
  activeBayCount: number,
  activePhaseJobCount: number,
): AdaptiveQueueSaturation {
  if (activeBayCount === 0) {
    return 'no-active-bays';
  }

  if (activePhaseJobCount > activeBayCount) {
    return 'exceeds-active-bay-count';
  }

  if (activePhaseJobCount === activeBayCount) {
    return 'equals-active-bay-count';
  }

  return 'below-active-bay-count';
}

function buildWarnings(input: {
  readonly capacity: AdaptiveQueueCapacitySummary;
  readonly jobLimit: AdaptiveQueueJobLimitAdvisory;
  readonly duplicateBays: readonly AdaptiveQueueDuplicateBayAssignment[];
  readonly duplicateMechanics:
    readonly AdaptiveQueueDuplicateMechanicAssignment[];
  readonly unassignedActivePhaseCount: number;
  readonly inactiveJobCount: number;
  readonly unknownJobCount: number;
}): readonly AdaptiveQueueWarning[] {
  const warnings: AdaptiveQueueWarning[] = [];
  const { capacity } = input;

  if (input.jobLimit.reached) {
    warnings.push({
      code: 'job-limit-reached',
      severity: 'warning',
      message:
        `The server returns at most ${input.jobLimit.limit} active jobs `
        + `and ${input.jobLimit.receivedCount} were received. `
        + 'The list may be incomplete.',
      advisory: true,
    });
  }

  if (capacity.saturation === 'no-active-bays') {
    warnings.push({
      code: 'no-active-bays',
      severity: 'warning',
      message:
        'No active bays are configured. Jobs are still listed, and '
        + 'queue positions and ETAs are calculated by the backend.',
      advisory: true,
    });
  } else if (
    capacity.saturation === 'equals-active-bay-count'
    || capacity.saturation === 'exceeds-active-bay-count'
  ) {
    const relation =
      capacity.saturation === 'equals-active-bay-count'
        ? 'equal'
        : 'exceed';

    warnings.push({
      code: 'capacity-saturation',
      severity: 'info',
      message:
        `Active-phase jobs (${capacity.activePhaseJobCount}) `
        + `${relation} the number of active bays `
        + `(${capacity.activeBayCount}). This is advisory: bay `
        + 'assignment does not confirm physical occupancy, and '
        + 'waiting jobs remain in the global queue.',
      advisory: true,
    });
  }

  if (input.duplicateBays.length > 0) {
    warnings.push({
      code: 'duplicate-active-bay-assignment',
      severity: 'warning',
      message:
        `${input.duplicateBays.length} bay assignment(s) are shared `
        + 'by more than one active-phase job. Advisory only; this is '
        + 'not a backend-enforced conflict.',
      advisory: true,
    });
  }

  if (input.duplicateMechanics.length > 0) {
    warnings.push({
      code: 'duplicate-active-mechanic-assignment',
      severity: 'warning',
      message:
        `${input.duplicateMechanics.length} mechanic assignment(s) `
        + 'are shared by more than one active-phase job. Advisory '
        + 'only; this is not a backend-enforced conflict.',
      advisory: true,
    });
  }

  if (input.unassignedActivePhaseCount > 0) {
    warnings.push({
      code: 'unassigned-active-phase-jobs',
      severity: 'info',
      message:
        `${input.unassignedActivePhaseCount} active-phase job(s) `
        + 'have no bay assignment.',
      advisory: true,
    });
  }

  if (input.inactiveJobCount > 0) {
    warnings.push({
      code: 'inactive-bay-assignments',
      severity: 'warning',
      message:
        `${input.inactiveJobCount} job(s) reference an inactive bay.`,
      advisory: true,
    });
  }

  if (input.unknownJobCount > 0) {
    warnings.push({
      code: 'unknown-bay-assignments',
      severity: 'warning',
      message:
        `${input.unknownJobCount} job(s) reference a bay that is `
        + 'not in the bay list.',
      advisory: true,
    });
  }

  if (capacity.unrecognizedStatusJobCount > 0) {
    warnings.push({
      code: 'unrecognized-status-jobs',
      severity: 'warning',
      message:
        `${capacity.unrecognizedStatusJobCount} job(s) have a status `
        + 'this portal does not recognise. They are listed but not '
        + 'counted as waiting or active-phase jobs.',
      advisory: true,
    });
  }

  return warnings;
}

/**
 * Builds the read-only adaptive queue view from the backend job
 * list and bay list. Pure and deterministic; inputs are never
 * mutated. Inputs are expected to have passed the adaptive queue
 * validators (unique job ids and unique bay ids).
 *
 * - Open = waiting; other known non-terminal statuses =
 *   active-phase; Completed/Closed are excluded; any other status
 *   is kept as 'unrecognized'.
 * - Waiting jobs are ordered by backend queuePosition ascending,
 *   equal positions keep server order. Nothing is recalculated.
 * - Every non-terminal job appears in exactly one of: an active
 *   bay column, an inactive bay group, an unknown bay group, or
 *   the unassigned list.
 * - Bay assignment is not physical occupancy. Waiting jobs are
 *   never counted as occupying a bay and never produce duplicate
 *   assignment warnings.
 */
export function buildAdaptiveQueueSnapshot(
  jobs: readonly JobSummaryDto[],
  bays: readonly BayDto[],
): AdaptiveQueueSnapshot {
  const waiting: AdaptiveQueueJob[] = [];
  const activePhase: AdaptiveQueueJob[] = [];
  const unrecognized: AdaptiveQueueJob[] = [];
  const boardJobs: AdaptiveQueueJob[] = [];
  let excludedTerminalJobCount = 0;

  for (const job of jobs) {
    const statusClass = classifyAdaptiveQueueStatus(job.status);

    if (statusClass === 'terminal') {
      excludedTerminalJobCount += 1;
      continue;
    }

    const item = toQueueJob(job, statusClass);

    boardJobs.push(item);

    if (statusClass === 'waiting') {
      waiting.push(item);
    } else if (statusClass === 'active-phase') {
      activePhase.push(item);
    } else {
      unrecognized.push(item);
    }
  }

  const waitingJobs = [...waiting].sort(
    (left, right) =>
      left.job.queuePosition - right.job.queuePosition,
  );

  // Unique bays in backend order (first occurrence wins).
  const bayByKey = new Map<string, BayDto>();

  for (const bay of bays) {
    const key = idKey(bay.id);

    if (!bayByKey.has(key)) {
      bayByKey.set(key, bay);
    }
  }

  const uniqueBays = [...bayByKey.values()];

  const jobsByActiveBay = new Map<string, AdaptiveQueueJob[]>();
  const jobsByInactiveBay = new Map<string, AdaptiveQueueJob[]>();
  const jobsByUnknownBay = new Map<string, AdaptiveQueueJob[]>();
  const unassignedJobs: AdaptiveQueueJob[] = [];

  for (const item of boardJobs) {
    const bayId = item.job.bayId;

    if (bayId === null) {
      unassignedJobs.push(item);
      continue;
    }

    const key = idKey(bayId);
    const bay = bayByKey.get(key);

    const target =
      bay === undefined
        ? jobsByUnknownBay
        : bay.active
          ? jobsByActiveBay
          : jobsByInactiveBay;

    const group = target.get(key);

    if (group) {
      group.push(item);
    } else {
      target.set(key, [item]);
    }
  }

  const bayColumns: AdaptiveQueueBayColumn[] = uniqueBays
    .filter(bay => bay.active)
    .map(bay => {
      const columnJobs = jobsByActiveBay.get(idKey(bay.id)) ?? [];
      const activePhaseJobs = columnJobs.filter(
        item => item.phase === 'active-phase',
      );

      return {
        bay,
        activePhaseJobs,
        preAssignedWaitingJobs: columnJobs.filter(
          item => item.phase === 'waiting',
        ),
        unrecognizedStatusJobs: columnJobs.filter(
          item => item.phase === 'unrecognized',
        ),
        hasDuplicateActivePhaseAssignment:
          activePhaseJobs.length > 1,
      };
    });

  const inactiveBayAssignments: AdaptiveQueueBayAssignmentGroup[] =
    uniqueBays
      .filter(bay => !bay.active)
      .flatMap(bay => {
        const groupJobs = jobsByInactiveBay.get(idKey(bay.id));

        return groupJobs
          ? [{
              bayId: bay.id,
              bay,
              bayLabel: bay.name,
              jobs: groupJobs,
            }]
          : [];
      });

  const unknownBayAssignments: AdaptiveQueueBayAssignmentGroup[] =
    [...jobsByUnknownBay.values()].map(groupJobs => ({
      bayId: groupJobs[0].job.bayId ?? '',
      bay: null,
      bayLabel: firstBayName(groupJobs) ?? UNKNOWN_BAY_LABEL,
      jobs: groupJobs,
    }));

  // Duplicate detection considers active-phase jobs only.
  const duplicateBayAssignments:
    AdaptiveQueueDuplicateBayAssignment[] = [
      ...groupBy(activePhase, item =>
        item.job.bayId === null ? null : idKey(item.job.bayId),
      ).entries(),
    ]
      .filter(([, group]) => group.length > 1)
      .map(([key, group]) => ({
        bayId: group[0].job.bayId ?? '',
        bayLabel:
          bayByKey.get(key)?.name
          ?? firstBayName(group)
          ?? UNKNOWN_BAY_LABEL,
        jobs: group,
      }));

  const duplicateMechanicAssignments:
    AdaptiveQueueDuplicateMechanicAssignment[] = [
      ...groupBy(activePhase, item =>
        item.job.mechanicId === null
          ? null
          : idKey(item.job.mechanicId),
      ).values(),
    ]
      .filter(group => group.length > 1)
      .map(group => ({
        mechanicId: group[0].job.mechanicId ?? '',
        mechanicLabel:
          firstMechanicName(group) ?? UNKNOWN_MECHANIC_LABEL,
        jobs: group,
      }));

  const activeBayCount = bayColumns.length;

  const capacity: AdaptiveQueueCapacitySummary = {
    totalBayCount: uniqueBays.length,
    activeBayCount,
    inactiveBayCount: uniqueBays.length - activeBayCount,
    activePhaseJobCount: activePhase.length,
    waitingJobCount: waiting.length,
    unrecognizedStatusJobCount: unrecognized.length,
    boardJobCount: boardJobs.length,
    excludedTerminalJobCount,
    saturation: resolveSaturation(
      activeBayCount,
      activePhase.length,
    ),
  };

  const jobLimit: AdaptiveQueueJobLimitAdvisory = {
    limit: ADAPTIVE_QUEUE_JOB_LIMIT,
    receivedCount: jobs.length,
    reached: jobs.length >= ADAPTIVE_QUEUE_JOB_LIMIT,
  };

  const countJobs = (
    groups: readonly AdaptiveQueueBayAssignmentGroup[],
  ): number =>
    groups.reduce((total, group) => total + group.jobs.length, 0);

  return {
    waitingJobs,
    activePhaseJobs: activePhase,
    unrecognizedStatusJobs: unrecognized,
    bayColumns,
    unassignedJobs,
    inactiveBayAssignments,
    unknownBayAssignments,
    duplicateBayAssignments,
    duplicateMechanicAssignments,
    capacity,
    jobLimit,
    warnings: buildWarnings({
      capacity,
      jobLimit,
      duplicateBays: duplicateBayAssignments,
      duplicateMechanics: duplicateMechanicAssignments,
      unassignedActivePhaseCount: unassignedJobs.filter(
        item => item.phase === 'active-phase',
      ).length,
      inactiveJobCount: countJobs(inactiveBayAssignments),
      unknownJobCount: countJobs(unknownBayAssignments),
    }),
  };
}
