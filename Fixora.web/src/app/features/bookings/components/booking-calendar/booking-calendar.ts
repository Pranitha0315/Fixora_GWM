import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal
} from '@angular/core';

import {
  buildCalendarDays,
  CALENDAR_WEEKDAYS,
  getCalendarMonth,
  getCalendarMonthLabel,
  getWorkshopToday,
  isValidCalendarDate,
  shiftCalendarMonth
} from '../../utils/booking-calendar.utils';

@Component({
  selector: 'app-booking-calendar',
  standalone: true,
  templateUrl: './booking-calendar.html',
  styleUrl: './booking-calendar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BookingCalendar {
  readonly selectedDate = input<string | null>(null);
  readonly disabled = input(false);

  readonly expanded = signal(false);

  toggleCalendar(): void {
    if (this.disabled()) {
      return;
    }

    this.expanded.update(value => !value);
  }

  readonly dateSelected = output<string>();

  readonly weekdays = CALENDAR_WEEKDAYS;
  readonly today = signal(getWorkshopToday());

  readonly visibleMonth = signal(
    getCalendarMonth(this.today())
  );

  readonly monthLabel = computed(() =>
    getCalendarMonthLabel(this.visibleMonth())
  );

  readonly days = computed(() =>
    buildCalendarDays(
      this.visibleMonth(),
      this.selectedDate(),
      this.today()
    )
  );

  readonly canPrevious = computed(() =>
    this.visibleMonth().year > 100 ||
    this.visibleMonth().month > 1
  );

  readonly canNext = computed(() =>
    this.visibleMonth().year < 9998 ||
    this.visibleMonth().month < 12
  );

  constructor() {
    effect(() => {
      const date = this.selectedDate();

      if (date !== null && isValidCalendarDate(date)) {
        const year = Number(date.slice(0, 4));

        if (year >= 100 && year <= 9998) {
          this.visibleMonth.set(getCalendarMonth(date));
        }
      }
    });
  }

  previousMonth(): void {
    if (this.disabled() || !this.canPrevious()) {
      return;
    }

    this.today.set(getWorkshopToday());

    this.visibleMonth.update(month =>
      shiftCalendarMonth(month, -1)
    );
  }

  nextMonth(): void {
    if (this.disabled() || !this.canNext()) {
      return;
    }

    this.today.set(getWorkshopToday());

    this.visibleMonth.update(month =>
      shiftCalendarMonth(month, 1)
    );
  }

  goToToday(): void {
    if (this.disabled()) {
      return;
    }

    const date = getWorkshopToday();

    this.today.set(date);
    this.visibleMonth.set(getCalendarMonth(date));
    this.dateSelected.emit(date);
  }

  selectDate(date: string): void {
    if (this.disabled() || !isValidCalendarDate(date)) {
      return;
    }

    const year = Number(date.slice(0, 4));

    if (year < 100 || year > 9998) {
      return;
    }

    this.today.set(getWorkshopToday());
    this.visibleMonth.set(getCalendarMonth(date));
    this.dateSelected.emit(date);
  }
}