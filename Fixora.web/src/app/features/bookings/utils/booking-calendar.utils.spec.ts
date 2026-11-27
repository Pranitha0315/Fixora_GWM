import { describe, expect, it } from 'vitest';

import {
  buildCalendarDays,
  CALENDAR_WEEKDAYS,
  getCalendarMonth,
  getCalendarMonthLabel,
  getWorkshopToday,
  isValidCalendarDate,
  shiftCalendarMonth,
  WORKSHOP_TIME_ZONE
} from './booking-calendar.utils';

describe('Booking calendar utilities', () => {

  it('uses Sri Lanka timezone', () => {
    expect(WORKSHOP_TIME_ZONE).toBe('Asia/Colombo');
  });

  it('uses Sunday-first weekdays', () => {
    expect(CALENDAR_WEEKDAYS).toEqual([
      'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'
    ]);
  });

  it.each([
    '2026-11-26',
    '2024-02-29',
    '2000-02-29',
    '2026-01-01',
    '2026-12-31'
  ])('accepts valid date %s', date => {
    expect(isValidCalendarDate(date)).toBe(true);
  });

  it.each([
    '',
    '2026-2-01',
    '2026-02-29',
    '1900-02-29',
    '2026-04-31',
    '2026-13-01',
    '2026-00-01',
    '2026-11-00',
    '0000-01-01',
    '2026-11-26T00:00:00Z'
  ])('rejects invalid date %s', date => {
    expect(isValidCalendarDate(date)).toBe(false);
  });

  it('returns Sri Lanka local date before midnight', () => {
    expect(getWorkshopToday(
      new Date('2026-11-26T18:29:59Z')
    )).toBe('2026-11-26');
  });

  it('returns next local date at midnight', () => {
    expect(getWorkshopToday(
      new Date('2026-11-26T18:30:00Z')
    )).toBe('2026-11-27');
  });

  it('handles Sri Lanka new year boundary', () => {
    expect(getWorkshopToday(
      new Date('2026-12-31T18:30:00Z')
    )).toBe('2027-01-01');
  });

  it('rejects invalid current time', () => {
    expect(() => getWorkshopToday(
      new Date('invalid')
    )).toThrow(RangeError);
  });

  it('extracts calendar month', () => {
    expect(getCalendarMonth('2026-11-26')).toEqual({
      year: 2026, month: 11
    });
  });

  it('rejects invalid month source date', () => {
    expect(() => getCalendarMonth('2026-02-30'))
      .toThrow(RangeError);
  });

  it('moves to next month', () => {
    expect(shiftCalendarMonth({
      year: 2026, month: 11
    }, 1)).toEqual({
      year: 2026, month: 12
    });
  });

  it('moves to previous month', () => {
    expect(shiftCalendarMonth({
      year: 2026, month: 11
    }, -1)).toEqual({
      year: 2026, month: 10
    });
  });

  it('moves December to January', () => {
    expect(shiftCalendarMonth({
      year: 2026, month: 12
    }, 1)).toEqual({
      year: 2027, month: 1
    });
  });

  it('moves January to previous December', () => {
    expect(shiftCalendarMonth({
      year: 2026, month: 1
    }, -1)).toEqual({
      year: 2025, month: 12
    });
  });

  it('supports zero month offset', () => {
    expect(shiftCalendarMonth({
      year: 2026, month: 11
    }, 0)).toEqual({
      year: 2026, month: 11
    });
  });

  it('rejects fractional offset', () => {
    expect(() => shiftCalendarMonth({
      year: 2026, month: 11
    }, 1.5)).toThrow(RangeError);
  });

  it('rejects invalid month number', () => {
    expect(() => shiftCalendarMonth({
      year: 2026, month: 13
    }, 1)).toThrow(RangeError);
  });

  it('formats calendar month label', () => {
    expect(getCalendarMonthLabel({
      year: 2026, month: 11
    })).toBe('November 2026');
  });

  const month = { year: 2026, month: 11 };
  const today = '2026-11-26';

  it('creates exactly 42 calendar cells', () => {
    expect(buildCalendarDays(
      month, null, today
    )).toHaveLength(42);
  });

  it('starts November 2026 on Sunday', () => {
    expect(buildCalendarDays(
      month, null, today
    )[0].date).toBe('2026-11-01');
  });

  it('includes preceding month dates when required', () => {
    const days = buildCalendarDays(
      { year: 2026, month: 12 }, null, today
    );

    expect(days[0].date).toBe('2026-11-29');
    expect(days[0].inCurrentMonth).toBe(false);
  });

  it('includes following month dates', () => {
    const days = buildCalendarDays(month, null, today);

    expect(days[41].date).toBe('2026-12-12');
    expect(days[41].inCurrentMonth).toBe(false);
  });

  it('marks all 30 November dates', () => {
    expect(buildCalendarDays(
      month, null, today
    ).filter(day => day.inCurrentMonth))
      .toHaveLength(30);
  });

  it('includes 29 days in leap February', () => {
    expect(buildCalendarDays(
      { year: 2024, month: 2 }, null, today
    ).filter(day => day.inCurrentMonth))
      .toHaveLength(29);
  });

  it('includes 28 days in non-leap February', () => {
    expect(buildCalendarDays(
      { year: 2026, month: 2 }, null, today
    ).filter(day => day.inCurrentMonth))
      .toHaveLength(28);
  });

  it('marks today exactly once', () => {
    const days = buildCalendarDays(month, null, today);

    expect(days.filter(day => day.isToday))
      .toHaveLength(1);

    expect(days.find(day => day.isToday)?.date)
      .toBe(today);
  });

  it('marks selected date independently', () => {
    const days = buildCalendarDays(
      month, '2026-11-20', today
    );

    expect(days.filter(day => day.isSelected))
      .toHaveLength(1);

    expect(days.find(day => day.isSelected)?.date)
      .toBe('2026-11-20');
  });

  it('supports no selected date', () => {
    expect(buildCalendarDays(
      month, null, today
    ).some(day => day.isSelected)).toBe(false);
  });

  it('rejects invalid selected date', () => {
    expect(() => buildCalendarDays(
      month, '2026-11-31', today
    )).toThrow(RangeError);
  });

});