export interface CalendarMonth {
  readonly year: number;
  readonly month: number;
}

export interface CalendarDay {
  readonly date: string;
  readonly day: number;
  readonly inCurrentMonth: boolean;
  readonly isToday: boolean;
  readonly isSelected: boolean;
}

export const WORKSHOP_TIME_ZONE = 'Asia/Colombo';

export const CALENDAR_WEEKDAYS = [
  'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'
] as const;

function assertMonth(value: CalendarMonth): void {
  if (
    !Number.isInteger(value.year) ||
    value.year < 100 ||
    value.year > 9998 ||
    !Number.isInteger(value.month) ||
    value.month < 1 ||
    value.month > 12
  ) {
    throw new RangeError('Invalid calendar month');
  }
}

export function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    Number.isFinite(date.getTime()) &&
    value.slice(0, 4) !== '0000' &&
    date.toISOString().slice(0, 10) === value
  );
}

export function getWorkshopToday(
  now: Date = new Date()
): string {
  if (!Number.isFinite(now.getTime())) {
    throw new RangeError('Invalid current date');
  }

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: WORKSHOP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);

  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  const day = parts.find(part => part.type === 'day')?.value;

  const value = `${year?.padStart(4, '0')}-${month}-${day}`;

  if (!isValidCalendarDate(value)) {
    throw new RangeError('Invalid workshop date');
  }

  return value;
}

export function getCalendarMonth(date: string): CalendarMonth {
  if (!isValidCalendarDate(date)) {
    throw new RangeError('Invalid calendar date');
  }

  const result = {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7))
  };

  assertMonth(result);
  return result;
}

export function shiftCalendarMonth(
  value: CalendarMonth,
  offset: number
): CalendarMonth {
  assertMonth(value);

  if (!Number.isSafeInteger(offset)) {
    throw new RangeError('Invalid month offset');
  }

  const index = value.year * 12 + value.month - 1 + offset;

  const result = {
    year: Math.floor(index / 12),
    month: ((index % 12) + 12) % 12 + 1
  };

  assertMonth(result);
  return result;
}

export function getCalendarMonthLabel(
  value: CalendarMonth
): string {
  assertMonth(value);

  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(
    new Date(Date.UTC(value.year, value.month - 1, 1))
  );
}

export function buildCalendarDays(
  value: CalendarMonth,
  selectedDate: string | null,
  today: string
): readonly CalendarDay[] {
  assertMonth(value);

  if (!isValidCalendarDate(today)) {
    throw new RangeError('Invalid today date');
  }

  if (
    selectedDate !== null &&
    !isValidCalendarDate(selectedDate)
  ) {
    throw new RangeError('Invalid selected date');
  }

  const first = new Date(
    Date.UTC(value.year, value.month - 1, 1)
  );

  const startOffset = first.getUTCDay();

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(
      Date.UTC(
        value.year,
        value.month - 1,
        1 - startOffset + index
      )
    );

    const key = date.toISOString().slice(0, 10);

    return {
      date: key,
      day: date.getUTCDate(),
      inCurrentMonth:
        date.getUTCFullYear() === value.year &&
        date.getUTCMonth() + 1 === value.month,
      isToday: key === today,
      isSelected: key === selectedDate
    };
  });
}