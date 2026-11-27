import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { BookingCalendar } from './booking-calendar';

describe('BookingCalendar', () => {
  let fixture: ComponentFixture<BookingCalendar>;
  let component: BookingCalendar;
  let emitted: string[];

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });

    vi.setSystemTime(
      new Date('2026-11-26T06:00:00Z')
    );

    await TestBed.configureTestingModule({
      imports: [BookingCalendar]
    }).compileComponents();

    fixture = TestBed.createComponent(BookingCalendar);
    component = fixture.componentInstance;

    emitted = [];

    component.dateSelected.subscribe(date => {
      emitted.push(date);
    });

    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function button(selector: string): HTMLButtonElement {
    const element =
      root().querySelector<HTMLButtonElement>(selector);

    if (!element) {
      throw new Error(`Button not found: ${selector}`);
    }

    return element;
  }

  function setSelected(date: string | null): void {
    fixture.componentRef.setInput('selectedDate', date);
    fixture.detectChanges();
  }

  function disable(): void {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
  }

  it('K12D01 starts collapsed', () => {
    expect(component.expanded()).toBe(false);
    expect(button('.calendar-toggle').getAttribute('aria-expanded'))
      .toBe('false');

    expect(root().querySelector<HTMLElement>('.calendar-body')?.hidden)
      .toBe(true);
  });

  it('K12D02 expands through the disclosure button', () => {
    button('.calendar-toggle').click();
    fixture.detectChanges();

    expect(component.expanded()).toBe(true);
    expect(button('.calendar-toggle').getAttribute('aria-expanded'))
      .toBe('true');

    expect(root().querySelector<HTMLElement>('.calendar-body')?.hidden)
      .toBe(false);
  });

  it('K12D03 collapses again', () => {
    button('.calendar-toggle').click();
    fixture.detectChanges();

    button('.calendar-toggle').click();
    fixture.detectChanges();

    expect(component.expanded()).toBe(false);
    expect(root().querySelector<HTMLElement>('.calendar-body')?.hidden)
      .toBe(true);
  });

  it('K12D04 does not emit dates when toggled', () => {
    component.toggleCalendar();
    component.toggleCalendar();

    expect(emitted).toEqual([]);
  });

  it('K12D05 preserves the visible month', () => {
    component.toggleCalendar();
    component.nextMonth();
    component.toggleCalendar();
    component.toggleCalendar();

    expect(component.monthLabel()).toBe('December 2026');
  });

  it('K12D06 preserves the selected date', () => {
    setSelected('2026-11-20');

    component.toggleCalendar();
    component.toggleCalendar();
    fixture.detectChanges();

    expect(component.selectedDate()).toBe('2026-11-20');
    expect(emitted).toEqual([]);
  });

  it('K12D07 blocks disclosure when disabled', () => {
    disable();

    expect(button('.calendar-toggle').disabled).toBe(true);

    component.toggleCalendar();

    expect(component.expanded()).toBe(false);
  });

  it('K12D08 retains date selection after expansion', () => {
    button('.calendar-toggle').click();
    fixture.detectChanges();

    button('[data-date="2026-11-20"]').click();
    fixture.detectChanges();

    expect(emitted).toEqual(['2026-11-20']);
  });

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  it('initializes with Sri Lanka today', () => {
    expect(component.today()).toBe('2026-11-26');
  });

  it('initializes November 2026', () => {
    expect(component.visibleMonth()).toEqual({
      year: 2026,
      month: 11
    });
  });

  it('renders the current month label', () => {
    expect(root().querySelector('h2')?.textContent)
      .toContain('November 2026');
  });

  it('renders seven weekday headings', () => {
    expect(root().querySelectorAll('.calendar-weekday'))
      .toHaveLength(7);
  });

  it('renders 42 calendar day buttons', () => {
    expect(root().querySelectorAll('.calendar-day'))
      .toHaveLength(42);
  });

  it('renders 30 current-month days', () => {
    expect(root().querySelectorAll(
      '.calendar-day:not(.outside-month)'
    )).toHaveLength(30);
  });

  it('marks today with aria-current', () => {
    expect(button('[data-date="2026-11-26"]')
      .getAttribute('aria-current')).toBe('date');
  });

  it('does not select a date automatically', () => {
    expect(root().querySelectorAll(
      '.calendar-day.selected'
    )).toHaveLength(0);

    expect(emitted).toEqual([]);
  });

  it('displays no selected date initially', () => {
    expect(root().textContent)
      .toContain('No date selected');
  });

  it('navigates to previous month by button click', () => {
    button('[aria-label="Previous month"]').click();

    fixture.detectChanges();

    expect(component.monthLabel())
      .toBe('October 2026');

    expect(emitted).toEqual([]);
  });

  it('navigates to next month by button click', () => {
    button('[aria-label="Next month"]').click();

    fixture.detectChanges();

    expect(component.monthLabel())
      .toBe('December 2026');

    expect(emitted).toEqual([]);
  });

  it('navigates December to January', () => {
    component.nextMonth();
    component.nextMonth();

    fixture.detectChanges();

    expect(component.monthLabel())
      .toBe('January 2027');
  });

  it('navigates January to previous December', () => {
    setSelected('2026-01-15');

    component.previousMonth();
    fixture.detectChanges();

    expect(component.monthLabel())
      .toBe('December 2025');
  });

  it('emits the selected date on native click', () => {
    button('[data-date="2026-11-20"]').click();

    fixture.detectChanges();

    expect(emitted).toEqual(['2026-11-20']);
  });

  it('does not mutate the controlled selected-date input', () => {
    component.selectDate('2026-11-20');

    expect(component.selectedDate()).toBeNull();
    expect(emitted).toEqual(['2026-11-20']);
  });

  it('highlights a parent-selected date', () => {
    setSelected('2026-11-20');

    expect(button('[data-date="2026-11-20"]')
      .classList.contains('selected')).toBe(true);
  });

  it('sets aria-pressed for selected date', () => {
    setSelected('2026-11-20');

    expect(button('[data-date="2026-11-20"]')
      .getAttribute('aria-pressed')).toBe('true');
  });

  it('clears selection when parent clears the input', () => {
    setSelected('2026-11-20');
    setSelected(null);

    expect(root().querySelectorAll(
      '.calendar-day.selected'
    )).toHaveLength(0);
  });

  it('synchronizes month with an external date', () => {
    setSelected('2027-02-10');

    expect(component.monthLabel())
      .toBe('February 2027');

    expect(emitted).toEqual([]);
  });

  it('allows month browsing with an existing selection', () => {
    setSelected('2026-11-20');

    component.nextMonth();
    fixture.detectChanges();

    expect(component.monthLabel())
      .toBe('December 2026');

    expect(component.selectedDate())
      .toBe('2026-11-20');

    expect(emitted).toEqual([]);
  });

  it('selects a following-month calendar cell', () => {
    button('[data-date="2026-12-01"]').click();

    fixture.detectChanges();

    expect(component.monthLabel())
      .toBe('December 2026');

    expect(emitted).toEqual(['2026-12-01']);
  });

  it('selects a preceding-month calendar cell', () => {
    component.nextMonth();
    fixture.detectChanges();

    button('[data-date="2026-11-29"]').click();

    fixture.detectChanges();

    expect(component.monthLabel())
      .toBe('November 2026');

    expect(emitted).toEqual(['2026-11-29']);
  });

  it('returns to today using the Today button', () => {
    component.nextMonth();

    fixture.detectChanges();

    const todayButton = Array.from(
      root().querySelectorAll<HTMLButtonElement>(
        '.calendar-navigation button'
      )
    ).find(item => item.textContent?.trim() === 'Today');

    expect(todayButton).toBeDefined();

    todayButton!.click();
    fixture.detectChanges();

    expect(component.monthLabel())
      .toBe('November 2026');

    expect(emitted).toEqual(['2026-11-26']);
  });

  it('refreshes workshop today after midnight', () => {
    vi.setSystemTime(
      new Date('2026-11-26T18:30:00Z')
    );

    component.goToToday();

    fixture.detectChanges();

    expect(component.today()).toBe('2026-11-27');
    expect(emitted).toEqual(['2026-11-27']);
  });

  it('rejects an invalid date selection', () => {
    component.selectDate('2026-02-30');

    expect(emitted).toEqual([]);

    expect(component.monthLabel())
      .toBe('November 2026');
  });

  it('rejects an empty date selection', () => {
    component.selectDate('');

    expect(emitted).toEqual([]);
  });

  it('rejects a date outside supported calendar years', () => {
    component.selectDate('0099-12-31');

    expect(emitted).toEqual([]);
  });

  it('disables all 46 calendar, navigation and disclosure buttons', () => {
    disable();

    const buttons = Array.from(
      root().querySelectorAll<HTMLButtonElement>('button')
    );

    expect(buttons).toHaveLength(46);

    expect(buttons.every(item => item.disabled))
      .toBe(true);
  });

  it('blocks previous-month navigation when disabled', () => {
    disable();

    component.previousMonth();

    expect(component.monthLabel())
      .toBe('November 2026');
  });

  it('blocks next-month navigation when disabled', () => {
    disable();

    component.nextMonth();

    expect(component.monthLabel())
      .toBe('November 2026');
  });

  it('blocks Today action when disabled', () => {
    disable();

    component.goToToday();

    expect(emitted).toEqual([]);
  });

  it('blocks date selection when disabled', () => {
    disable();

    component.selectDate('2026-11-20');

    expect(emitted).toEqual([]);
  });

  it('blocks navigation below supported year range', () => {
    setSelected('0100-01-01');

    expect(component.canPrevious()).toBe(false);

    component.previousMonth();

    expect(component.visibleMonth()).toEqual({
      year: 100,
      month: 1
    });
  });

  it('blocks navigation above supported year range', () => {
    setSelected('9998-12-31');

    expect(component.canNext()).toBe(false);

    component.nextMonth();

    expect(component.visibleMonth()).toEqual({
      year: 9998,
      month: 12
    });
  });

  it('renders date labels for calendar buttons', () => {
    const buttons = Array.from(
      root().querySelectorAll<HTMLButtonElement>(
        '.calendar-day'
      )
    );

    expect(buttons.every(item =>
      item.getAttribute('aria-label') ===
      item.getAttribute('data-date')
    )).toBe(true);
  });

  it('uses non-submit buttons throughout the calendar', () => {
    const buttons = Array.from(
      root().querySelectorAll<HTMLButtonElement>('button')
    );

    expect(buttons.every(item => item.type === 'button'))
      .toBe(true);
  });
});