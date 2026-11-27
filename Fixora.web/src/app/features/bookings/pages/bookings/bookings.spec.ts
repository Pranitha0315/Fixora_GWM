import {
  ComponentFixture,
  TestBed,
} from '@angular/core/testing';

import {
  Observable,
  Subject,
  of,
  throwError,
} from 'rxjs';

import { Bookings } from './bookings';
import { BookingCalendar } from '../../components/booking-calendar/booking-calendar';
import { WalkInBooking } from '../../components/walk-in-booking/walk-in-booking';
import type { JobSummaryDto } from '../../models/booking-support.model';
import { By } from '@angular/platform-browser';
import { ConfirmBooking } from '../../components/confirm-booking/confirm-booking';
import { RejectBooking } from '../../components/reject-booking/reject-booking';
import { RescheduleBooking } from '../../components/reschedule-booking/reschedule-booking';
import { AssignBooking } from '../../components/assign-booking/assign-booking';
import { BookingActionApiService } from '../../services/booking-action-api.service';
import { ToastService } from '../../../../shared/services/toast.service';

import { ApiError } from '../../../../core/models/api-error.model';

import { BookingApiService } from '../../services/booking-api.service';

import { BookingResponseError } from '../../utils/booking-response.validator';

import type {
  Booking,
  BookingPage,
  BookingListQuery,
} from '../../models/booking.model';

const BOOKING: Booking = {
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

function bookingPage(
  items: readonly Booking[] = [BOOKING],
  page = 1,
  total = items.length,
): BookingPage {
  return {
    items,
    page,
    pageSize: 10,
    total,
  };
}

// Native dialog compatibility for unit tests.
function installDialogTestMethods(): () => void {
  const prototype = HTMLDialogElement.prototype;

  const originalShowModal =
    Object.getOwnPropertyDescriptor(prototype, 'showModal');

  const originalClose =
    Object.getOwnPropertyDescriptor(prototype, 'close');

  if (typeof prototype.showModal !== 'function') {
    Object.defineProperty(prototype, 'showModal', {
      configurable: true,
      writable: true,
      value: function (this: HTMLDialogElement): void {
        this.setAttribute('open', '');
      },
    });
  }

  if (typeof prototype.close !== 'function') {
    Object.defineProperty(prototype, 'close', {
      configurable: true,
      writable: true,
      value: function (this: HTMLDialogElement): void {
        this.removeAttribute('open');
      },
    });
  }

  return () => {
    if (originalShowModal) {
      Object.defineProperty(
        prototype,
        'showModal',
        originalShowModal,
      );
    } else {
      Reflect.deleteProperty(prototype, 'showModal');
    }

    if (originalClose) {
      Object.defineProperty(
        prototype,
        'close',
        originalClose,
      );
    } else {
      Reflect.deleteProperty(prototype, 'close');
    }
  };
}

describe('Bookings', () => {
  let fixture: ComponentFixture<Bookings>;
  let component: Bookings;
  let response$: Observable<BookingPage>;
  let requestCount: number;
  let lastQuery: BookingListQuery;

  const toast = {
    success: vi.fn(),
    warning: vi.fn(),
  };

  const actionApi = {
    getMechanics: vi.fn(),
    getBays: vi.fn(),
    confirmBooking: vi.fn(),
    declineBooking: vi.fn(),
    getSlots: vi.fn(),
    rescheduleBooking: vi.fn(),
    getServices: vi.fn(),
    createWalkIn: vi.fn(),
    getJobDetails: vi.fn(),
    assignJob: vi.fn(),
  };

  const mechanicId = '20000000-0000-4000-8000-000000000001';
  const bayId = '20000000-0000-4000-8000-000000000002';

  const confirmedBooking: Booking = {
    ...BOOKING,
    status: 'Confirmed',
    mechanicId,
    mechanicName: 'Test Mechanic',
    bayId,
    bayName: 'Test Bay',
    managerNote: 'Internal instructions',
  };

  let restoreDialogTestMethods: (() => void) | undefined;

  beforeEach(async () => {
    restoreDialogTestMethods = installDialogTestMethods();

    response$ = of(bookingPage());
    requestCount = 0;
    lastQuery = {};

    toast.success.mockReset();
    toast.warning.mockReset();

    actionApi.getMechanics.mockReset();
    actionApi.getBays.mockReset();
    actionApi.confirmBooking.mockReset();
    actionApi.declineBooking.mockReset();
    actionApi.getSlots.mockReset();
    actionApi.rescheduleBooking.mockReset();
    actionApi.getSlots.mockReturnValue(of([]));
    actionApi.getServices.mockReset();
    actionApi.createWalkIn.mockReset();
    actionApi.getJobDetails.mockReset();
    actionApi.assignJob.mockReset();
    actionApi.getJobDetails.mockImplementation(
      () => new Subject(),
    );

    actionApi.getServices.mockReturnValue(of([{
      id: BOOKING.serviceId,
      name: 'General Service',
      category: 'Maintenance',
      standardMinutes: 60,
      basePrice: 2500,
    }]));

    actionApi.getMechanics.mockReturnValue(of([
      {
        id: mechanicId,
        name: 'Test Mechanic',
        phone: '0770000000',
        employeeCode: 'EMP-TEST',
        onDuty: true,
        activeJobs: 0,
      },
    ]));

    actionApi.getBays.mockReturnValue(of([
      {
        id: bayId,
        name: 'Test Bay',
        active: true,
      },
    ]));

    actionApi.confirmBooking.mockReturnValue(of(confirmedBooking));

    await TestBed.configureTestingModule({
      imports: [Bookings],
      providers: [
        {
          provide: BookingActionApiService,
          useValue: actionApi,
        },
        {
          provide: ToastService,
          useValue: toast,
        },
        {
          provide: BookingApiService,
          useValue: {
            getBookings: (query: BookingListQuery = {}) => {
              lastQuery = query;
              requestCount++;
              return response$;
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Bookings);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    restoreDialogTestMethods?.();
    restoreDialogTestMethods = undefined;
  });


  it('PI01 enables confirmation for requested bookings', () => {
    fixture.detectChanges();

    const action = component.actions.find(
      item => item.id === 'confirm',
    );

    expect(action).toBeDefined();
    expect(action?.disabled?.(BOOKING)).toBe(false);
  });

  it('PI02 disables confirmation for other booking statuses', () => {
    fixture.detectChanges();

    const action = component.actions.find(
      item => item.id === 'confirm',
    );

    for (const status of [
      'Confirmed',
      'Declined',
      'Cancelled',
      'CheckedIn',
      'Completed',
      'NoShow',
      'UnknownStatus',
    ]) {
      expect(action?.disabled?.({
        ...BOOKING,
        status,
      })).toBe(true);
    }
  });

  it('PI03 opens the confirmation component with the selected booking', () => {
    fixture.detectChanges();

    component.handleAction({
      actionId: 'view',
      row: BOOKING,
    });

    component.handleAction({
      actionId: 'confirm',
      row: BOOKING,
    });

    fixture.detectChanges();

    const child = fixture.debugElement.query(
      By.directive(ConfirmBooking),
    );

    expect(child).not.toBeNull();
    expect(child.componentInstance.booking()).toEqual(BOOKING);
    expect(component.selectedBooking()).toBeNull();
    expect(component.actionModalOpen()).toBe(true);
    expect(actionApi.getMechanics).toHaveBeenCalledTimes(1);
    expect(actionApi.getBays).toHaveBeenCalledTimes(1);
  });

  it('PI04 prevents duplicate confirmation dialogs', () => {
    fixture.detectChanges();

    component.handleAction({
      actionId: 'confirm',
      row: BOOKING,
    });

    component.handleAction({
      actionId: 'confirm',
      row: BOOKING,
    });

    component.handleAction({
      actionId: 'view',
      row: BOOKING,
    });

    fixture.detectChanges();

    expect(fixture.debugElement.queryAll(
      By.directive(ConfirmBooking),
    )).toHaveLength(1);

    expect(component.selectedBooking()).toBeNull();
    expect(actionApi.getMechanics).toHaveBeenCalledTimes(1);
    expect(actionApi.confirmBooking).not.toHaveBeenCalled();
  });

  it('PI05 rejects missing or stale booking records', () => {
    response$ = of(bookingPage([
      { ...BOOKING, status: 'Confirmed' },
    ]));

    fixture.detectChanges();

    component.handleAction({
      actionId: 'confirm',
      row: BOOKING,
    });

    expect(component.confirmingBooking()).toBeNull();

    component.handleAction({
      actionId: 'confirm',
      row: {
        ...BOOKING,
        id: mechanicId,
      },
    });

    expect(component.confirmingBooking()).toBeNull();
    expect(actionApi.confirmBooking).not.toHaveBeenCalled();
  });

  it('PI06 protects pagination and filters while confirmation is open', () => {
    response$ = of(bookingPage([BOOKING], 2, 30));
    fixture.detectChanges();

    component.handleAction({
      actionId: 'confirm',
      row: BOOKING,
    });

    component.refresh();
    component.previousPage();
    component.nextPage();
    component.firstPage();
    component.loadBookings(3);
    component.changeDate('2026-12-01');
    component.changeStatus('Confirmed');
    component.clearFilters();

    expect(requestCount).toBe(1);
    expect(component.currentPage()).toBe(2);
    expect(component.selectedDate()).toBe('');
    expect(component.selectedStatus()).toBe('');
    expect(component.confirmingBooking()).toEqual(BOOKING);
  });

  it('PI07 closes the parent dialog on child cancellation', () => {
    fixture.detectChanges();

    component.handleAction({
      actionId: 'confirm',
      row: BOOKING,
    });

    fixture.detectChanges();

    const child = fixture.debugElement.query(
      By.directive(ConfirmBooking),
    ).componentInstance as ConfirmBooking;

    child.close();
    fixture.detectChanges();

    expect(component.confirmingBooking()).toBeNull();
    expect(component.actionModalOpen()).toBe(false);

    expect(fixture.debugElement.query(
      By.directive(ConfirmBooking),
    )).toBeNull();

    expect(requestCount).toBe(1);
    expect(actionApi.confirmBooking).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('PI08 submits through the child and displays a success notification', () => {
    fixture.detectChanges();

    component.handleAction({
      actionId: 'confirm',
      row: BOOKING,
    });

    fixture.detectChanges();

    const child = fixture.debugElement.query(
      By.directive(ConfirmBooking),
    ).componentInstance as ConfirmBooking;

    child.mechanicId.set(mechanicId);
    child.bayId.set(bayId);
    child.note.set('  Internal instructions  ');

    response$ = of(bookingPage([confirmedBooking]));

    child.submit();

    expect(actionApi.confirmBooking).toHaveBeenCalledTimes(1);

    expect(actionApi.confirmBooking).toHaveBeenCalledWith(
      BOOKING.id,
      {
        mechanicId,
        bayId,
        note: 'Internal instructions',
      },
    );

    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith(
      'Booking confirmed',
      'Confirmation received. Refreshing the booking list.',
    );

    expect(component.confirmingBooking()).toBeNull();
    expect(component.bookings()).toEqual([confirmedBooking]);
    expect(requestCount).toBe(2);
  });

  it('PI09 refreshes the current page and preserves active filters', () => {
    fixture.detectChanges();

    component.changeDate('2026-12-01');
    component.changeStatus('Requested');

    response$ = of(bookingPage([BOOKING], 2, 21));
    component.loadBookings(2);

    component.handleAction({
      actionId: 'confirm',
      row: BOOKING,
    });

    const countBefore = requestCount;

    response$ = of(bookingPage([], 2, 20));

    component.onBookingConfirmed(confirmedBooking);

    expect(requestCount).toBe(countBefore + 1);
    expect(lastQuery.page).toBe(2);
    expect(lastQuery.pageSize).toBe(10);
    expect(lastQuery.date).toBe('2026-12-01');
    expect(lastQuery.status).toBe('Requested');
    expect(component.bookings()).toEqual([]);
    expect(component.confirmingBooking()).toBeNull();
  });

  it('PI10 rejects an incorrect confirmation event without success notification', () => {
    fixture.detectChanges();

    component.handleAction({
      actionId: 'confirm',
      row: BOOKING,
    });

    component.onBookingConfirmed({
      ...confirmedBooking,
      id: mechanicId,
    });

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(component.confirmingBooking()).toBeNull();
    expect(requestCount).toBe(2);

    component.onBookingConfirmed(confirmedBooking);

    expect(toast.success).not.toHaveBeenCalled();
    expect(requestCount).toBe(2);
  });

  it('PI11 warns and refreshes after an uncertain confirmation outcome', () => {
    fixture.detectChanges();

    component.handleAction({
      actionId: 'confirm',
      row: BOOKING,
    });

    fixture.detectChanges();

    const child = fixture.debugElement.query(
      By.directive(ConfirmBooking),
    ).componentInstance as ConfirmBooking;

    actionApi.confirmBooking.mockReturnValue(
      throwError(() => new ApiError(
        0,
        'NETWORK_ERROR',
        'Internal network information',
      )),
    );

    child.mechanicId.set(mechanicId);
    child.bayId.set(bayId);

    child.submit();
    child.submit();

    expect(child.requiresRefresh()).toBe(true);
    expect(actionApi.confirmBooking).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();

    child.close();

    expect(toast.warning).toHaveBeenCalledWith(
      'Confirmation requires review',
      'Review the latest booking status before attempting confirmation again.',
    );

    expect(component.confirmingBooking()).toBeNull();
    expect(requestCount).toBe(2);
  });

  it('PI12 prevents child cancellation and duplicate submission during a pending request', () => {
    fixture.detectChanges();

    component.handleAction({
      actionId: 'confirm',
      row: BOOKING,
    });

    fixture.detectChanges();

    const child = fixture.debugElement.query(
      By.directive(ConfirmBooking),
    ).componentInstance as ConfirmBooking;

    const pending = new Subject<Booking>();

    actionApi.confirmBooking.mockReturnValue(pending);

    child.mechanicId.set(mechanicId);
    child.bayId.set(bayId);
    child.note.set('Internal instructions');

    child.submit();
    child.submit();
    child.close();

    expect(child.submitting()).toBe(true);
    expect(component.actionModalOpen()).toBe(true);
    expect(actionApi.confirmBooking).toHaveBeenCalledTimes(1);
    expect(requestCount).toBe(1);

    response$ = of(bookingPage([confirmedBooking]));

    pending.next(confirmedBooking);
    pending.complete();

    fixture.detectChanges();

    expect(component.actionModalOpen()).toBe(false);
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(requestCount).toBe(2);

    expect(fixture.debugElement.query(
      By.directive(ConfirmBooking),
    )).toBeNull();
  });


  const walkInJob: JobSummaryDto = {
    id: '30000000-0000-4000-8000-000000000001',
    number: 'JOB-WI-001',
    customerId: '00000000-0000-0000-0000-000000000000',
    customerName: 'Walk-in Customer',
    vehicleId: '00000000-0000-0000-0000-000000000000',
    vehicleLabel: 'Toyota Prius',
    mechanicId,
    mechanicName: 'Test Mechanic',
    bayId,
    bayName: 'Test Bay',
    status: 'Open',
    priority: 0,
    queuePosition: 2,
    etaAt: '2026-12-01T05:30:00Z',
    estimatedMinutes: 60,
    elapsedMinutes: 0,
    createdAt: '2026-12-01T04:30:00Z',
    startedAt: null,
    completedAt: null,
    complaint: null,
    managerNote: null,
  };

  function walkInChild(): WalkInBooking {
    return fixture.debugElement.query(
      By.directive(WalkInBooking),
    ).componentInstance as WalkInBooking;
  }

  function clickButton(label: string): void {
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement)
        .querySelectorAll<HTMLButtonElement>('button'),
    );

    const button = buttons.find(
      item => item.textContent?.trim() === label,
    );

    expect(button).toBeDefined();
    expect(button?.disabled).toBe(false);
    button!.click();
    fixture.detectChanges();
  }

  function openWalkInChild(): WalkInBooking {
    fixture.detectChanges();
    clickButton('New Walk-in');
    return walkInChild();
  }

  function fillWalkIn(child: WalkInBooking): void {
    child.customerName.set('Walk-in Customer');
    child.vehicleLabel.set('Toyota Prius');
    child.serviceId.set(BOOKING.serviceId);
    child.mechanicId.set(mechanicId);
    child.bayId.set(bayId);
    fixture.detectChanges();
  }

  it('WPI01 opens walk-in using the actual page button', () => {
    openWalkInChild();

    expect(component.walkInOpen()).toBe(true);
    expect(component.actionModalOpen()).toBe(true);
    expect(actionApi.getServices).toHaveBeenCalledTimes(1);
    expect(actionApi.getMechanics).toHaveBeenCalledTimes(1);
    expect(actionApi.getBays).toHaveBeenCalledTimes(1);
  });

  it('WPI02 prevents duplicate walk-in dialogs', () => {
    openWalkInChild();

    component.openWalkIn();
    fixture.detectChanges();

    expect(fixture.debugElement.queryAll(
      By.directive(WalkInBooking),
    )).toHaveLength(1);

    expect(actionApi.getServices).toHaveBeenCalledTimes(1);
  });

  it('WPI03 prevents walk-in while bookings are loading', () => {
    response$ = new Subject<BookingPage>();
    fixture.detectChanges();

    component.openWalkIn();

    expect(component.walkInOpen()).toBe(false);
  });

  it('WPI04 prevents walk-in after booking list failure', () => {
    response$ = throwError(() => new Error('List failure'));
    fixture.detectChanges();

    component.openWalkIn();

    expect(component.walkInOpen()).toBe(false);
  });

  it('WPI05 prevents walk-in while booking details are open', () => {
    fixture.detectChanges();

    component.handleAction({
      actionId: 'view',
      row: BOOKING,
    });

    component.openWalkIn();

    expect(component.walkInOpen()).toBe(false);
  });

  it('WPI06 prevents simultaneous confirmation and walk-in', () => {
    openWalkInChild();

    component.handleAction({
      actionId: 'confirm',
      row: BOOKING,
    });

    expect(component.confirmingBooking()).toBeNull();

    component.closeWalkIn();

    component.handleAction({
      actionId: 'confirm',
      row: BOOKING,
    });

    component.openWalkIn();

    expect(component.walkInOpen()).toBe(false);
    expect(component.confirmingBooking()).toEqual(BOOKING);
  });

  it('WPI07 protects filters and pagination during walk-in', () => {
    response$ = of(bookingPage([BOOKING], 2, 30));
    openWalkInChild();

    component.refresh();
    component.previousPage();
    component.nextPage();
    component.firstPage();
    component.changeDate('2026-12-01');
    component.changeStatus('Confirmed');
    component.clearFilters();

    expect(requestCount).toBe(1);
    expect(component.currentPage()).toBe(2);
    expect(component.selectedDate()).toBe('');
    expect(component.selectedStatus()).toBe('');
  });

  it('WPI08 cancels through the actual modal button', () => {
    openWalkInChild();

    clickButton('Cancel');

    expect(component.walkInOpen()).toBe(false);
    expect(component.actionModalOpen()).toBe(false);
    expect(actionApi.createWalkIn).not.toHaveBeenCalled();
    expect(requestCount).toBe(1);
  });

  it('WPI09 creates a job and refreshes only after Done', () => {
    actionApi.createWalkIn.mockReturnValue(of(walkInJob));

    const child = openWalkInChild();
    fillWalkIn(child);

    clickButton('Create Walk-in');

    expect(actionApi.createWalkIn).toHaveBeenCalledTimes(1);
    expect(child.createdJob()).toEqual(walkInJob);
    expect(fixture.nativeElement.textContent)
      .toContain('JOB-WI-001');

    expect(toast.success).not.toHaveBeenCalled();
    expect(requestCount).toBe(1);

    clickButton('Done');

    expect(component.walkInOpen()).toBe(false);
    expect(toast.success).toHaveBeenCalledWith(
      'Walk-in created',
      'Job Card JOB-WI-001 created successfully.',
    );
    expect(requestCount).toBe(2);
  });

  it('WPI10 blocks duplicate submission and close while pending', () => {
    const pending = new Subject<JobSummaryDto>();

    actionApi.createWalkIn.mockReturnValue(pending);

    const child = openWalkInChild();
    fillWalkIn(child);

    clickButton('Create Walk-in');

    child.submit();
    child.close();

    expect(child.submitting()).toBe(true);
    expect(component.walkInOpen()).toBe(true);
    expect(actionApi.createWalkIn).toHaveBeenCalledTimes(1);

    pending.next(walkInJob);
    pending.complete();
    fixture.detectChanges();

    clickButton('Done');

    expect(component.walkInOpen()).toBe(false);
    expect(requestCount).toBe(2);
  });

  it('WPI11 warns and refreshes after uncertain creation', () => {
    actionApi.createWalkIn.mockReturnValue(
      throwError(() => new ApiError(
        0,
        'NETWORK_ERROR',
        'Private network details',
      )),
    );

    const child = openWalkInChild();
    fillWalkIn(child);

    clickButton('Create Walk-in');

    expect(child.requiresRefresh()).toBe(true);

    child.submit();

    expect(actionApi.createWalkIn).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();

    clickButton('Review bookings');

    expect(component.walkInOpen()).toBe(false);
    expect(toast.warning).toHaveBeenCalledWith(
      'Walk-in requires review',
      'Review bookings and job cards before creating another walk-in.',
    );
    expect(requestCount).toBe(2);
  });

  it('WPI12 retries resource loading using the actual button', () => {
    actionApi.getServices.mockReturnValue(
      throwError(() => new Error('Resource failure')),
    );

    const child = openWalkInChild();

    expect(child.resourceError()).toBeTruthy();

    actionApi.getServices.mockReturnValue(of([{
      id: BOOKING.serviceId,
      name: 'General Service',
      category: 'Maintenance',
      standardMinutes: 60,
      basePrice: 2500,
    }]));

    clickButton('Retry loading resources');

    expect(child.resourcesLoaded()).toBe(true);
    expect(child.resourceError()).toBeNull();
    expect(actionApi.getServices).toHaveBeenCalledTimes(2);
    expect(actionApi.createWalkIn).not.toHaveBeenCalled();
  });


  function calendarChild(): BookingCalendar {
    return fixture.debugElement.query(
      By.directive(BookingCalendar),
    ).componentInstance as BookingCalendar;
  }

  it('CPI01 renders the booking calendar', () => {
    fixture.detectChanges();

    expect(fixture.debugElement.query(
      By.directive(BookingCalendar),
    )).not.toBeNull();

    expect(calendarChild().selectedDate()).toBeNull();
    expect(requestCount).toBe(1);
  });

  it('CPI02 loads bookings for a calendar selection', () => {
    fixture.detectChanges();

    calendarChild().selectDate('2026-12-01');
    fixture.detectChanges();

    expect(component.selectedDate()).toBe('2026-12-01');
    expect(lastQuery.date).toBe('2026-12-01');
    expect(lastQuery.page).toBe(1);
    expect(requestCount).toBe(2);
  });

  it('CPI03 resets pagination after calendar selection', () => {
    fixture.detectChanges();

    response$ = of(bookingPage([BOOKING], 2, 21));
    component.loadBookings(2);

    expect(component.currentPage()).toBe(2);

    response$ = of(bookingPage());
    calendarChild().selectDate('2026-12-01');

    expect(lastQuery.page).toBe(1);
    expect(component.currentPage()).toBe(1);
  });

  it('CPI04 synchronizes the manual date filter', () => {
    fixture.detectChanges();

    component.changeDate('2026-12-01');
    fixture.detectChanges();

    expect(calendarChild().selectedDate())
      .toBe('2026-12-01');

    expect(calendarChild().visibleMonth().year)
      .toBe(2026);

    expect(calendarChild().visibleMonth().month)
      .toBe(12);
  });

  it('CPI05 navigates months without loading bookings', () => {
    fixture.detectChanges();

    const calendar = calendarChild();
    const initial = calendar.visibleMonth();

    calendar.nextMonth();
    fixture.detectChanges();

    expect(calendar.visibleMonth()).not.toEqual(initial);
    expect(requestCount).toBe(1);

    calendar.previousMonth();
    fixture.detectChanges();

    expect(calendar.visibleMonth()).toEqual(initial);
    expect(requestCount).toBe(1);
  });

  it('CPI06 preserves the selected status', () => {
    fixture.detectChanges();

    component.changeStatus('Confirmed');

    calendarChild().selectDate('2026-12-01');
    fixture.detectChanges();

    expect(lastQuery.date).toBe('2026-12-01');
    expect(lastQuery.status).toBe('Confirmed');
    expect(lastQuery.page).toBe(1);
  });

  it('CPI07 clears the calendar selection with filters', () => {
    fixture.detectChanges();

    calendarChild().selectDate('2026-12-01');
    component.changeStatus('Confirmed');
    fixture.detectChanges();

    component.clearFilters();
    fixture.detectChanges();

    expect(calendarChild().selectedDate()).toBeNull();
    expect(component.selectedDate()).toBe('');
    expect(lastQuery.date).toBeUndefined();
    expect(lastQuery.status).toBeUndefined();
    expect(lastQuery.page).toBe(1);
  });

  it('CPI08 disables calendar during booking loading', () => {
    response$ = new Subject<BookingPage>();

    fixture.detectChanges();

    const calendar = calendarChild();

    expect(calendar.disabled()).toBe(true);

    calendar.selectDate('2026-12-01');

    expect(component.selectedDate()).toBe('');
    expect(requestCount).toBe(1);
  });

  it('CPI09 disables calendar during confirmation', () => {
    fixture.detectChanges();

    component.handleAction({
      actionId: 'confirm',
      row: BOOKING,
    });

    fixture.detectChanges();

    expect(calendarChild().disabled()).toBe(true);

    calendarChild().selectDate('2026-12-01');

    expect(component.selectedDate()).toBe('');
    expect(requestCount).toBe(1);

    component.closeConfirmation();
    fixture.detectChanges();

    expect(calendarChild().disabled()).toBe(false);
  });

  it('CPI10 disables calendar during walk-in', () => {
    fixture.detectChanges();

    component.openWalkIn();
    fixture.detectChanges();

    expect(calendarChild().disabled()).toBe(true);

    calendarChild().selectDate('2026-12-01');

    expect(component.selectedDate()).toBe('');
    expect(requestCount).toBe(1);

    component.closeWalkIn();
    fixture.detectChanges();

    expect(calendarChild().disabled()).toBe(false);
  });

  it('CPI11 disables calendar during booking details', () => {
    fixture.detectChanges();

    component.handleAction({
      actionId: 'view',
      row: BOOKING,
    });

    fixture.detectChanges();

    expect(calendarChild().disabled()).toBe(true);

    calendarChild().selectDate('2026-12-01');

    expect(component.selectedDate()).toBe('');
    expect(requestCount).toBe(1);

    component.closeDetails();
    fixture.detectChanges();

    expect(calendarChild().disabled()).toBe(false);
  });

  it('CPI12 prevents duplicate requests for the same date', () => {
    fixture.detectChanges();

    calendarChild().selectDate('2026-12-01');
    fixture.detectChanges();

    const count = requestCount;

    calendarChild().selectDate('2026-12-01');
    fixture.detectChanges();

    expect(requestCount).toBe(count);
    expect(component.selectedDate()).toBe('2026-12-01');
  });


  const rejectionReason = 'Workshop fully booked';

  const rejectedBooking: Booking = {
    ...BOOKING,
    status: 'Declined',
    declineReason: rejectionReason,
  };

  function openRejectChild(): RejectBooking {
    fixture.detectChanges();

    component.handleAction({
      actionId: 'reject',
      row: BOOKING,
    });

    fixture.detectChanges();

    return fixture.debugElement.query(
      By.directive(RejectBooking),
    ).componentInstance as RejectBooking;
  }

  it('RPI01 enables rejection for requested bookings', () => {
    fixture.detectChanges();

    const action = component.actions.find(
      item => item.id === 'reject',
    );

    expect(action).toBeDefined();
    expect(action?.disabled?.(BOOKING)).toBe(false);
  });

  it('RPI02 disables rejection for other statuses', () => {
    fixture.detectChanges();

    const action = component.actions.find(
      item => item.id === 'reject',
    );

    for (const status of [
      'Confirmed',
      'Declined',
      'Cancelled',
      'CheckedIn',
      'Completed',
      'NoShow',
      'Unknown',
    ]) {
      expect(action?.disabled?.({
        ...BOOKING,
        status,
      })).toBe(true);
    }
  });

  it('RPI03 opens rejection using the actual row button', () => {
    fixture.detectChanges();

    clickButton('Reject');

    const child = fixture.debugElement.query(
      By.directive(RejectBooking),
    );

    expect(child).not.toBeNull();
    expect(child.componentInstance.booking()).toEqual(BOOKING);
    expect(component.rejectingBooking()).toEqual(BOOKING);
    expect(component.actionModalOpen()).toBe(true);
    expect(actionApi.declineBooking).not.toHaveBeenCalled();
  });

  it('RPI04 blocks stale and missing booking records', () => {
    response$ = of(bookingPage([
      { ...BOOKING, status: 'Confirmed' },
    ]));

    fixture.detectChanges();

    component.handleAction({
      actionId: 'reject',
      row: BOOKING,
    });

    component.handleAction({
      actionId: 'reject',
      row: { ...BOOKING, id: mechanicId },
    });

    expect(component.rejectingBooking()).toBeNull();
    expect(actionApi.declineBooking).not.toHaveBeenCalled();
  });

  it('RPI05 prevents simultaneous action dialogs', () => {
    openRejectChild();

    component.handleAction({
      actionId: 'reject',
      row: BOOKING,
    });

    component.handleAction({
      actionId: 'confirm',
      row: BOOKING,
    });

    component.handleAction({
      actionId: 'view',
      row: BOOKING,
    });

    component.openWalkIn();

    fixture.detectChanges();

    expect(fixture.debugElement.queryAll(
      By.directive(RejectBooking),
    )).toHaveLength(1);

    expect(component.confirmingBooking()).toBeNull();
    expect(component.selectedBooking()).toBeNull();
    expect(component.walkInOpen()).toBe(false);
  });

  it('RPI06 protects filters pagination and calendar', () => {
    response$ = of(bookingPage([BOOKING], 2, 30));

    openRejectChild();

    component.refresh();
    component.previousPage();
    component.nextPage();
    component.firstPage();
    component.changeDate('2026-12-01');
    component.changeStatus('Confirmed');
    component.clearFilters();

    expect(calendarChild().disabled()).toBe(true);

    calendarChild().selectDate('2026-12-01');

    expect(requestCount).toBe(1);
    expect(component.currentPage()).toBe(2);
    expect(component.selectedDate()).toBe('');
    expect(component.selectedStatus()).toBe('');
  });

  it('RPI07 cancels without submitting a rejection', () => {
    const child = openRejectChild();

    child.close();
    fixture.detectChanges();

    expect(component.rejectingBooking()).toBeNull();
    expect(component.actionModalOpen()).toBe(false);
    expect(calendarChild().disabled()).toBe(false);
    expect(actionApi.declineBooking).not.toHaveBeenCalled();
    expect(requestCount).toBe(1);
  });

  it('RPI08 submits and refreshes after successful rejection', () => {
    actionApi.declineBooking.mockReturnValue(
      of(rejectedBooking),
    );

    const child = openRejectChild();

    child.changeReason('  Workshop fully booked  ');

    response$ = of(bookingPage([rejectedBooking]));

    child.submit();

    expect(actionApi.declineBooking).toHaveBeenCalledTimes(1);

    expect(actionApi.declineBooking).toHaveBeenCalledWith(
      BOOKING.id,
      { reason: rejectionReason },
    );

    expect(toast.success).toHaveBeenCalledWith(
      'Booking rejected',
      'Rejection received. Refreshing the booking list.',
    );

    expect(component.rejectingBooking()).toBeNull();
    expect(component.bookings()).toEqual([rejectedBooking]);
    expect(requestCount).toBe(2);
  });

  it('RPI09 preserves active filters after rejection', () => {
    fixture.detectChanges();

    component.changeDate('2026-12-01');
    component.changeStatus('Requested');

    response$ = of(bookingPage([BOOKING], 2, 21));
    component.loadBookings(2);

    component.handleAction({
      actionId: 'reject',
      row: BOOKING,
    });

    const countBefore = requestCount;

    response$ = of(bookingPage([], 2, 20));

    component.onBookingRejected(rejectedBooking);

    expect(requestCount).toBe(countBefore + 1);
    expect(lastQuery.page).toBe(2);
    expect(lastQuery.date).toBe('2026-12-01');
    expect(lastQuery.status).toBe('Requested');
    expect(component.bookings()).toEqual([]);
  });

  it('RPI10 rejects invalid success events', () => {
    openRejectChild();

    component.onBookingRejected({
      ...rejectedBooking,
      id: mechanicId,
    });

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(component.rejectingBooking()).toBeNull();
    expect(requestCount).toBe(2);

    component.onBookingRejected(rejectedBooking);

    expect(requestCount).toBe(2);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('RPI11 warns and refreshes after an uncertain outcome', () => {
    actionApi.declineBooking.mockReturnValue(
      throwError(() => new ApiError(
        0,
        'NETWORK_ERROR',
        'Private network details',
      )),
    );

    const child = openRejectChild();

    child.changeReason(rejectionReason);
    child.submit();
    child.submit();

    expect(child.requiresRefresh()).toBe(true);
    expect(actionApi.declineBooking).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();

    child.close();

    expect(toast.warning).toHaveBeenCalledWith(
      'Rejection requires review',
      'Review the latest booking status before attempting rejection again.',
    );

    expect(component.rejectingBooking()).toBeNull();
    expect(requestCount).toBe(2);
  });

  it('RPI12 blocks duplicate submission and closing while pending', () => {
    const pending = new Subject<Booking>();

    actionApi.declineBooking.mockReturnValue(pending);

    const child = openRejectChild();

    child.changeReason(rejectionReason);
    child.submit();
    child.submit();
    child.close();

    expect(child.submitting()).toBe(true);
    expect(component.actionModalOpen()).toBe(true);
    expect(actionApi.declineBooking).toHaveBeenCalledTimes(1);
    expect(requestCount).toBe(1);

    response$ = of(bookingPage([rejectedBooking]));

    pending.next(rejectedBooking);
    pending.complete();

    fixture.detectChanges();

    expect(component.actionModalOpen()).toBe(false);
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(requestCount).toBe(2);
  });


  const rescheduledBooking: Booking = {
    ...BOOKING,
    slotStart: '2099-12-02T04:30:00Z',
    slotEnd: '2099-12-02T05:30:00Z',
  };

  function openRescheduleChild(): RescheduleBooking {
    fixture.detectChanges();

    component.handleAction({
      actionId: 'reschedule',
      row: BOOKING,
    });

    fixture.detectChanges();

    const child = fixture.debugElement.query(
      By.directive(RescheduleBooking),
    );

    expect(child).not.toBeNull();

    return child.componentInstance as RescheduleBooking;
  }

  it('RSPI01 enables requested and confirmed bookings', () => {
    fixture.detectChanges();

    const action = component.actions.find(
      item => item.id === 'reschedule',
    );

    expect(action).toBeDefined();
    expect(action?.disabled?.(BOOKING)).toBe(false);
    expect(action?.disabled?.(confirmedBooking)).toBe(false);
  });

  it('RSPI02 disables ineligible booking statuses', () => {
    fixture.detectChanges();

    const action = component.actions.find(
      item => item.id === 'reschedule',
    );

    for (const status of [
      'Declined',
      'Cancelled',
      'CheckedIn',
      'Completed',
      'NoShow',
      'Unknown',
    ]) {
      expect(action?.disabled?.({
        ...BOOKING,
        status,
      })).toBe(true);
    }
  });

  it('RSPI03 opens reschedule using the actual row button', () => {
    fixture.detectChanges();

    clickButton('Reschedule');

    const child = fixture.debugElement.query(
      By.directive(RescheduleBooking),
    );

    expect(child).not.toBeNull();
    expect(child.componentInstance.booking()).toEqual(BOOKING);
    expect(component.reschedulingBooking()).toEqual(BOOKING);
    expect(component.actionModalOpen()).toBe(true);
    expect(actionApi.rescheduleBooking).not.toHaveBeenCalled();
  });

  it('RSPI04 uses the current confirmed booking record', () => {
    response$ = of(bookingPage([confirmedBooking]));

    const child = openRescheduleChild();

    expect(child.booking()).toEqual(confirmedBooking);
    expect(component.reschedulingBooking())
      .toEqual(confirmedBooking);
  });

  it('RSPI05 blocks stale and missing booking records', () => {
    response$ = of(bookingPage([
      { ...BOOKING, status: 'Completed' },
    ]));

    fixture.detectChanges();

    component.handleAction({
      actionId: 'reschedule',
      row: BOOKING,
    });

    component.handleAction({
      actionId: 'reschedule',
      row: { ...BOOKING, id: mechanicId },
    });

    expect(component.reschedulingBooking()).toBeNull();
    expect(actionApi.rescheduleBooking).not.toHaveBeenCalled();
  });

  it('RSPI06 prevents simultaneous action dialogs', () => {
    openRescheduleChild();

    for (const actionId of [
      'view',
      'confirm',
      'reject',
      'reschedule',
    ]) {
      component.handleAction({
        actionId,
        row: BOOKING,
      });
    }

    component.openWalkIn();
    fixture.detectChanges();

    expect(fixture.debugElement.queryAll(
      By.directive(RescheduleBooking),
    )).toHaveLength(1);

    expect(component.selectedBooking()).toBeNull();
    expect(component.confirmingBooking()).toBeNull();
    expect(component.rejectingBooking()).toBeNull();
    expect(component.walkInOpen()).toBe(false);
  });

  it('RSPI07 protects pagination filters and calendar', () => {
    response$ = of(bookingPage([BOOKING], 2, 30));

    openRescheduleChild();

    component.refresh();
    component.previousPage();
    component.nextPage();
    component.firstPage();
    component.loadBookings(3);
    component.changeDate('2026-12-01');
    component.changeStatus('Confirmed');
    component.clearFilters();

    expect(calendarChild().disabled()).toBe(true);

    calendarChild().selectDate('2026-12-01');

    expect(requestCount).toBe(1);
    expect(component.currentPage()).toBe(2);
    expect(component.selectedDate()).toBe('');
    expect(component.selectedStatus()).toBe('');
  });

  it('RSPI08 closes on child cancellation without mutation', () => {
    const child = openRescheduleChild();

    child.cancelled.emit();
    fixture.detectChanges();

    expect(component.reschedulingBooking()).toBeNull();
    expect(component.actionModalOpen()).toBe(false);
    expect(calendarChild().disabled()).toBe(false);

    expect(fixture.debugElement.query(
      By.directive(RescheduleBooking),
    )).toBeNull();

    expect(actionApi.rescheduleBooking).not.toHaveBeenCalled();
    expect(requestCount).toBe(1);
  });

  it('RSPI09 refreshes on a valid child success event', () => {
    const child = openRescheduleChild();

    response$ = of(bookingPage([rescheduledBooking]));

    child.rescheduled.emit(rescheduledBooking);

    expect(toast.success).toHaveBeenCalledWith(
      'Booking rescheduled',
      'Reschedule received. Refreshing the booking list.',
    );

    expect(component.reschedulingBooking()).toBeNull();
    expect(component.bookings()).toEqual([rescheduledBooking]);
    expect(requestCount).toBe(2);
  });

  it('RSPI10 preserves filters and page after reschedule', () => {
    fixture.detectChanges();

    component.changeDate('2026-12-01');
    component.changeStatus('Requested');

    response$ = of(bookingPage([BOOKING], 2, 21));
    component.loadBookings(2);

    component.handleAction({
      actionId: 'reschedule',
      row: BOOKING,
    });

    const before = requestCount;

    response$ = of(bookingPage([], 2, 20));

    component.onBookingRescheduled(rescheduledBooking);

    expect(requestCount).toBe(before + 1);
    expect(lastQuery.page).toBe(2);
    expect(lastQuery.date).toBe('2026-12-01');
    expect(lastQuery.status).toBe('Requested');
    expect(component.bookings()).toEqual([]);
  });

  it('RSPI11 rejects invalid reschedule success events', () => {
    fixture.detectChanges();

    const invalidResponses: Booking[] = [
      { ...rescheduledBooking, id: mechanicId },
      { ...rescheduledBooking, status: 'Confirmed' },
      { ...rescheduledBooking, mechanicId },
      { ...rescheduledBooking, bayId },
      { ...rescheduledBooking, slotEnd: '2099-12-02T06:30:00Z' },
      { ...rescheduledBooking, slotStart: 'invalid' },
      BOOKING,
    ];

    for (const invalid of invalidResponses) {
      component.handleAction({
        actionId: 'reschedule',
        row: BOOKING,
      });

      expect(component.reschedulingBooking()).not.toBeNull();

      component.onBookingRescheduled(invalid);

      expect(component.reschedulingBooking()).toBeNull();
    }

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning)
      .toHaveBeenCalledTimes(invalidResponses.length);

    expect(requestCount)
      .toBe(1 + invalidResponses.length);
  });

  it('RSPI12 warns and refreshes once after uncertain outcome', () => {
    const child = openRescheduleChild();

    child.refreshRequired.emit();

    expect(toast.warning).toHaveBeenCalledWith(
      'Reschedule requires review',
      'Review the latest appointment before attempting reschedule again.',
    );

    expect(component.reschedulingBooking()).toBeNull();
    expect(requestCount).toBe(2);
    expect(toast.success).not.toHaveBeenCalled();

    component.onRescheduleRefreshRequired();
    component.onBookingRescheduled(rescheduledBooking);

    expect(requestCount).toBe(2);
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
  });


  const assignmentBooking: Booking = {
    ...BOOKING,
    status: 'CheckedIn',
    jobCardId: walkInJob.id,
    mechanicId,
    mechanicName: 'Test Mechanic',
    bayId,
    bayName: 'Test Bay',
  };

  const assignedJob: JobSummaryDto = {
    ...walkInJob,
    customerId: assignmentBooking.customerId,
    customerName: assignmentBooking.customerName,
    vehicleId: assignmentBooking.vehicleId,
    vehicleLabel: assignmentBooking.vehicleLabel,
    mechanicId,
    bayId,
    status: 'Open',
  };

  function openAssignmentChild(): AssignBooking {
    response$ = of(bookingPage([assignmentBooking]));

    fixture.detectChanges();

    component.handleAction({
      actionId: 'assign',
      row: assignmentBooking,
    });

    fixture.detectChanges();

    const child = fixture.debugElement.query(
      By.directive(AssignBooking),
    );

    expect(child).not.toBeNull();

    return child.componentInstance as AssignBooking;
  }

  it('API01 enables assignment for checked-in bookings with job cards', () => {
    fixture.detectChanges();

    const action = component.actions.find(
      item => item.id === 'assign',
    );

    expect(action).toBeDefined();
    expect(action?.disabled?.(assignmentBooking)).toBe(false);
  });

  it('API02 disables assignment for ineligible booking statuses', () => {
    fixture.detectChanges();

    const action = component.actions.find(
      item => item.id === 'assign',
    );

    for (const status of [
      'Requested',
      'Confirmed',
      'Declined',
      'Cancelled',
      'Completed',
      'NoShow',
      'Unknown',
    ]) {
      expect(action?.disabled?.({
        ...assignmentBooking,
        status,
      })).toBe(true);
    }
  });

  it('API03 rejects missing and invalid job card identifiers', () => {
    fixture.detectChanges();

    const action = component.actions.find(
      item => item.id === 'assign',
    );

    for (const jobCardId of [
      null,
      '',
      'invalid',
      '00000000-0000-0000-0000-000000000000',
    ]) {
      expect(action?.disabled?.({
        ...assignmentBooking,
        jobCardId,
      })).toBe(true);
    }
  });

  it('API04 opens assignment using the actual row button', () => {
    response$ = of(bookingPage([assignmentBooking]));

    fixture.detectChanges();

    clickButton('Assign Mechanic & Bay');

    const child = fixture.debugElement.query(
      By.directive(AssignBooking),
    );

    expect(child).not.toBeNull();
    expect(child.componentInstance.booking())
      .toEqual(assignmentBooking);

    expect(component.assigningBooking())
      .toEqual(assignmentBooking);

    expect(component.actionModalOpen()).toBe(true);
    expect(actionApi.assignJob).not.toHaveBeenCalled();
  });

  it('API05 blocks stale and missing booking records', () => {
    response$ = of(bookingPage([
      {
        ...assignmentBooking,
        status: 'Completed',
      },
    ]));

    fixture.detectChanges();

    component.handleAction({
      actionId: 'assign',
      row: assignmentBooking,
    });

    component.handleAction({
      actionId: 'assign',
      row: {
        ...assignmentBooking,
        id: mechanicId,
      },
    });

    expect(component.assigningBooking()).toBeNull();
    expect(actionApi.assignJob).not.toHaveBeenCalled();
  });

  it('API06 uses the current booking record rather than the stale row', () => {
    response$ = of(bookingPage([assignmentBooking]));

    fixture.detectChanges();

    component.handleAction({
      actionId: 'assign',
      row: BOOKING,
    });

    expect(component.assigningBooking())
      .toEqual(assignmentBooking);
  });

  it('API07 prevents simultaneous action dialogs', () => {
    openAssignmentChild();

    for (const actionId of [
      'view',
      'confirm',
      'reject',
      'reschedule',
      'assign',
    ]) {
      component.handleAction({
        actionId,
        row: assignmentBooking,
      });
    }

    component.openWalkIn();
    fixture.detectChanges();

    expect(fixture.debugElement.queryAll(
      By.directive(AssignBooking),
    )).toHaveLength(1);

    expect(component.selectedBooking()).toBeNull();
    expect(component.confirmingBooking()).toBeNull();
    expect(component.rejectingBooking()).toBeNull();
    expect(component.reschedulingBooking()).toBeNull();
    expect(component.walkInOpen()).toBe(false);
  });

  it('API08 protects pagination filters and calendar', () => {
    openAssignmentChild();

    const before = requestCount;

    component.refresh();
    component.loadBookings(2);
    component.nextPage();
    component.previousPage();
    component.firstPage();
    component.changeDate('2026-12-01');
    component.changeStatus('Confirmed');
    component.clearFilters();

    expect(calendarChild().disabled()).toBe(true);

    calendarChild().selectDate('2026-12-01');

    expect(requestCount).toBe(before);
    expect(component.selectedDate()).toBe('');
    expect(component.selectedStatus()).toBe('');
    expect(component.currentPage()).toBe(1);
  });

  it('API09 closes assignment on cancellation without mutation', () => {
    const child = openAssignmentChild();

    child.cancelled.emit();
    fixture.detectChanges();

    expect(component.assigningBooking()).toBeNull();
    expect(component.actionModalOpen()).toBe(false);
    expect(calendarChild().disabled()).toBe(false);
    expect(actionApi.assignJob).not.toHaveBeenCalled();
    expect(requestCount).toBe(1);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('API10 refreshes after verified job assignment without rewriting booking fields', () => {
    const child = openAssignmentChild();

    const updatedJob: JobSummaryDto = {
      ...assignedJob,
      mechanicId: '90000000-0000-4000-8000-000000000001',
      bayId: '90000000-0000-4000-8000-000000000002',
    };

    response$ = of(bookingPage([assignmentBooking]));

    child.assigned.emit(updatedJob);

    expect(component.assigningBooking()).toBeNull();

    expect(toast.success).toHaveBeenCalledWith(
      'Job assignment updated',
      'Job Card assignment updated. Booking assignment details may differ.',
    );

    expect(component.bookings()).toEqual([assignmentBooking]);
    expect(component.bookings()[0]?.mechanicId).toBe(mechanicId);
    expect(component.bookings()[0]?.bayId).toBe(bayId);
    expect(requestCount).toBe(2);
  });

  it('API11 rejects invalid assignment success events', () => {
    response$ = of(bookingPage([assignmentBooking]));

    fixture.detectChanges();

    const invalidResponses: JobSummaryDto[] = [
      { ...assignedJob, id: mechanicId },
      { ...assignedJob, status: 'Completed' },
      { ...assignedJob, mechanicId: null },
      { ...assignedJob, bayId: null },
      {
        ...assignedJob,
        mechanicId: '00000000-0000-0000-0000-000000000000',
      },
      {
        ...assignedJob,
        bayId: '00000000-0000-0000-0000-000000000000',
      },
    ];

    for (const invalid of invalidResponses) {
      component.handleAction({
        actionId: 'assign',
        row: assignmentBooking,
      });

      expect(component.assigningBooking()).not.toBeNull();

      component.onJobAssigned(invalid);

      expect(component.assigningBooking()).toBeNull();
    }

    expect(toast.success).not.toHaveBeenCalled();

    expect(toast.warning)
      .toHaveBeenCalledTimes(invalidResponses.length);

    expect(requestCount)
      .toBe(1 + invalidResponses.length);
  });

  it('API12 warns and refreshes once after an uncertain assignment outcome', () => {
    const child = openAssignmentChild();

    child.refreshRequired.emit();

    expect(toast.warning).toHaveBeenCalledWith(
      'Assignment requires review',
      'Review the latest Job Card assignment before attempting another update.',
    );

    expect(component.assigningBooking()).toBeNull();
    expect(requestCount).toBe(2);

    component.onAssignmentRefreshRequired();
    component.onJobAssigned(assignedJob);

    expect(requestCount).toBe(2);
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('BC-01 creates the component', () => {
    expect(component).toBeTruthy();
  });

  it('BC-02 loads bookings on initialization', () => {
    fixture.detectChanges();

    expect(requestCount).toBe(1);
    expect(component.bookings()).toEqual([BOOKING]);
  });

  it('BC-03 displays loading state', () => {
    response$ = new Subject<BookingPage>();

    fixture.detectChanges();

    expect(component.isLoading()).toBe(true);
    expect(fixture.nativeElement.textContent)
      .toContain('Loading bookings');
  });

  it('BC-04 displays retrieved booking records', () => {
    fixture.detectChanges();
    fixture.detectChanges();

    expect(component.bookings()).toEqual([BOOKING]);
    expect(component.isLoading()).toBe(false);
    expect(fixture.nativeElement.textContent)
      .toContain('Test Customer');
  });

  it('BC-05 accepts an empty booking list', () => {
    response$ = of(bookingPage([]));

    fixture.detectChanges();

    expect(component.bookings()).toEqual([]);
    expect(component.errorMessage()).toBeNull();
    expect(fixture.nativeElement.textContent)
      .toContain('No bookings found');
  });

  it('BC-06 records successful update time', () => {
    fixture.detectChanges();

    expect(component.lastUpdated())
      .toBeInstanceOf(Date);
  });

  it('BC-07 handles invalid booking responses', () => {
    response$ = throwError(
      () => new BookingResponseError('bookings[0]'),
    );

    fixture.detectChanges();

    expect(component.errorMessage())
      .toContain('invalid booking information');

    expect(component.isLoading()).toBe(false);
  });

  it('BC-08 handles network errors', () => {
    response$ = throwError(
      () => new ApiError(0, 'NETWORK_ERROR', 'Network'),
    );

    fixture.detectChanges();

    expect(component.errorMessage())
      .toContain('Unable to connect');
  });

  it('BC-09 handles unauthorized errors', () => {
    response$ = throwError(
      () => new ApiError(401, 'UNAUTHORIZED', 'Unauthorized'),
    );

    fixture.detectChanges();

    expect(component.errorMessage())
      .toContain('sign in again');
  });

  it('BC-10 handles forbidden errors', () => {
    response$ = throwError(
      () => new ApiError(403, 'FORBIDDEN', 'Forbidden'),
    );

    fixture.detectChanges();

    expect(component.errorMessage())
      .toContain('permission');
  });

  it('BC-11 handles rate limit errors', () => {
    response$ = throwError(
      () => new ApiError(429, 'RATE_LIMITED', 'Rate limited'),
    );

    fixture.detectChanges();

    expect(component.errorMessage())
      .toContain('Too many requests');
  });

  it('BC-12 handles server errors', () => {
    response$ = throwError(
      () => new ApiError(500, 'SERVER_ERROR', 'Server error'),
    );

    fixture.detectChanges();

    expect(component.errorMessage())
      .toContain('Unable to load bookings');
  });

  it('BC-13 handles unexpected errors safely', () => {
    response$ = throwError(
      () => new Error('Internal diagnostic information'),
    );

    fixture.detectChanges();

    expect(component.errorMessage())
      .toBe('Unable to load bookings. Please try again.');

    expect(component.bookings()).toEqual([]);
    expect(component.lastUpdated()).toBeNull();
    expect(component.isLoading()).toBe(false);
  });

  it('BC-14 refreshes booking records', () => {
    fixture.detectChanges();

    response$ = of(bookingPage([
      { ...BOOKING, status: 'Confirmed' },
    ]));

    component.refresh();

    expect(requestCount).toBe(2);
    expect(component.bookings()[0]?.status)
      .toBe('Confirmed');
  });

  it('BC-15 prevents duplicate loading requests', () => {
    const pending = new Subject<BookingPage>();
    response$ = pending;

    fixture.detectChanges();

    component.refresh();
    component.refresh();

    expect(requestCount).toBe(1);

    pending.next(bookingPage());
    pending.complete();

    expect(component.isLoading()).toBe(false);
  });

  it('BC-16 recovers after a failed request', () => {
    response$ = throwError(
      () => new Error('Initial failure'),
    );

    fixture.detectChanges();

    expect(component.errorMessage()).not.toBeNull();

    response$ = of(bookingPage());

    component.refresh();

    expect(component.errorMessage()).toBeNull();
    expect(component.bookings()).toEqual([BOOKING]);
    expect(component.isLoading()).toBe(false);
  });

  it('BC-17 selects a booking through the view action', () => {
    fixture.detectChanges();

    component.handleAction({
      actionId: 'view',
      row: BOOKING,
    });

    expect(component.selectedBooking()).toEqual(BOOKING);
  });

  it('BC-18 clears booking details on close', () => {
    fixture.detectChanges();

    component.handleAction({
      actionId: 'view',
      row: BOOKING,
    });

    component.closeDetails();

    expect(component.selectedBooking()).toBeNull();
  });

  it('BC-19 ignores unknown booking actions', () => {
    fixture.detectChanges();

    component.handleAction({
      actionId: 'unknown',
      row: BOOKING,
    });

    expect(component.selectedBooking()).toBeNull();
  });

  it('BC-20 maps all known status tones', () => {
    expect(component.statusTone('Requested')).toBe('warning');
    expect(component.statusTone('Confirmed')).toBe('info');
    expect(component.statusTone('Declined')).toBe('danger');
    expect(component.statusTone('Cancelled')).toBe('neutral');
    expect(component.statusTone('CheckedIn')).toBe('primary');
    expect(component.statusTone('Completed')).toBe('success');
    expect(component.statusTone('NoShow')).toBe('danger');
  });

  it('BC-21 uses a neutral tone for unknown statuses', () => {
    expect(component.statusTone('FutureStatus'))
      .toBe('neutral');

    expect(component.statusTone('constructor'))
      .toBe('neutral');
  });

  it('BC-22 formats booking status labels', () => {
    expect(component.statusLabel('CheckedIn'))
      .toBe('Checked In');

    expect(component.statusLabel('NoShow'))
      .toBe('No Show');

    expect(component.statusLabel('Requested'))
      .toBe('Requested');
  });

  it('BC-23 exposes all seven status filter options', () => {
    expect(component.statusOptions.map(option => option.value))
      .toEqual([
        'Requested',
        'Confirmed',
        'Declined',
        'Cancelled',
        'CheckedIn',
        'Completed',
        'NoShow',
      ]);
  });

  it('BC-24 sends the selected status to the server', () => {
    fixture.detectChanges();

    component.changeStatus('Confirmed');

    expect(lastQuery.status).toBe('Confirmed');
    expect(lastQuery.page).toBe(1);
    expect(component.selectedStatus()).toBe('Confirmed');
  });

  it('BC-25 calculates pages from the server total', () => {
    response$ = of(bookingPage([BOOKING], 1, 301));

    fixture.detectChanges();

    expect(component.totalRecords()).toBe(301);
    expect(component.pageCount()).toBe(31);
    expect(component.canNext()).toBe(true);
  });

  it('BC-26 disables next on the final page', () => {
    fixture.detectChanges();

    response$ = of(bookingPage([BOOKING], 3, 21));

    component.loadBookings(3);

    expect(component.pageCount()).toBe(3);
    expect(component.canNext()).toBe(false);
    expect(component.canPrevious()).toBe(true);
  });

  it('BC-27 unsubscribes when the component is destroyed', () => {
    let unsubscribed = false;

    response$ = new Observable<BookingPage>(() => {
      return () => {
        unsubscribed = true;
      };
    });

    fixture.detectChanges();

    expect(unsubscribed).toBe(false);

    fixture.destroy();

    expect(unsubscribed).toBe(true);
  });


  it('BC-28 requests page one with ten records initially', () => {
    fixture.detectChanges();

    expect(lastQuery.page).toBe(1);
    expect(lastQuery.pageSize).toBe(10);
    expect(lastQuery.date).toBeUndefined();
    expect(lastQuery.status).toBeUndefined();
  });

  it('BC-29 navigates to the next server page', () => {
    response$ = of(bookingPage([BOOKING], 1, 21));
    fixture.detectChanges();

    response$ = of(bookingPage([BOOKING], 2, 21));
    component.nextPage();

    expect(lastQuery.page).toBe(2);
    expect(component.currentPage()).toBe(2);
    expect(requestCount).toBe(2);
  });

  it('BC-30 navigates to the previous server page', () => {
    fixture.detectChanges();

    response$ = of(bookingPage([BOOKING], 2, 21));
    component.loadBookings(2);

    response$ = of(bookingPage([BOOKING], 1, 21));
    component.previousPage();

    expect(lastQuery.page).toBe(1);
    expect(component.currentPage()).toBe(1);
  });

  it('BC-31 prevents navigation before page one', () => {
    fixture.detectChanges();

    component.previousPage();

    expect(requestCount).toBe(1);
    expect(component.currentPage()).toBe(1);
  });

  it('BC-32 prevents navigation beyond the last page', () => {
    fixture.detectChanges();

    component.nextPage();

    expect(requestCount).toBe(1);
    expect(component.canNext()).toBe(false);
  });

  it('BC-33 sends the local date and resets pagination', () => {
    fixture.detectChanges();

    response$ = of(bookingPage([BOOKING], 2, 21));
    component.loadBookings(2);

    response$ = of(bookingPage());
    component.changeDate('2026-11-25');

    expect(lastQuery.date).toBe('2026-11-25');
    expect(lastQuery.page).toBe(1);
    expect(component.currentPage()).toBe(1);
  });

  it('BC-34 rejects invalid calendar dates', () => {
    fixture.detectChanges();

    component.changeDate('2026-02-30');
    component.changeDate('invalid');

    expect(requestCount).toBe(1);
    expect(component.selectedDate()).toBe('');
  });

  it('BC-35 rejects unknown status filter values', () => {
    fixture.detectChanges();

    component.changeStatus('UnknownStatus');

    expect(requestCount).toBe(1);
    expect(component.selectedStatus()).toBe('');
  });

  it('BC-36 combines server date and status filters', () => {
    fixture.detectChanges();

    component.changeDate('2026-11-25');
    component.changeStatus('Confirmed');

    expect(lastQuery.date).toBe('2026-11-25');
    expect(lastQuery.status).toBe('Confirmed');
    expect(lastQuery.page).toBe(1);
  });

  it('BC-37 clears both filters and returns to page one', () => {
    fixture.detectChanges();

    component.changeDate('2026-11-25');
    component.changeStatus('Confirmed');

    component.clearFilters();

    expect(component.selectedDate()).toBe('');
    expect(component.selectedStatus()).toBe('');
    expect(lastQuery.date).toBeUndefined();
    expect(lastQuery.status).toBeUndefined();
    expect(lastQuery.page).toBe(1);
  });

  it('BC-38 calculates the retrieved record range', () => {
    fixture.detectChanges();

    response$ = of(bookingPage([BOOKING], 3, 21));
    component.loadBookings(3);

    expect(component.firstRecord()).toBe(21);
    expect(component.lastRecord()).toBe(21);
    expect(component.totalRecords()).toBe(21);
  });

  it('BC-39 recovers from an unavailable page', () => {
    fixture.detectChanges();

    response$ = of(bookingPage([], 3, 1));
    component.loadBookings(3);

    expect(component.currentPage())
      .toBeGreaterThan(component.pageCount());

    expect(component.firstRecord()).toBe(0);
    expect(component.lastRecord()).toBe(0);

    response$ = of(bookingPage());
    component.firstPage();

    expect(lastQuery.page).toBe(1);
    expect(component.currentPage()).toBe(1);
    expect(component.bookings()).toEqual([BOOKING]);
  });

  it('BC-40 refreshes the current page with active filters', () => {
    fixture.detectChanges();

    component.changeDate('2026-11-25');
    component.changeStatus('Confirmed');

    response$ = of(bookingPage([BOOKING], 2, 21));
    component.loadBookings(2);

    component.refresh();

    expect(lastQuery.page).toBe(2);
    expect(lastQuery.date).toBe('2026-11-25');
    expect(lastQuery.status).toBe('Confirmed');
  });


  it('BC-41 displays the manager note in booking details', () => {
    fixture.detectChanges();

    component.selectedBooking.set({
      ...BOOKING,
      managerNote: 'Inspect brake pads before service.',
    });

    fixture.detectChanges();

    const note = fixture.nativeElement.querySelector(
      '[data-testid="booking-manager-note"]',
    ) as HTMLElement | null;

    expect(note).not.toBeNull();
    expect(note?.querySelector('dd')?.textContent?.trim())
      .toBe('Inspect brake pads before service.');
  });

  it('BC-42 displays a fallback when manager note is null', () => {
    fixture.detectChanges();

    component.selectedBooking.set({
      ...BOOKING,
      managerNote: null,
    });

    fixture.detectChanges();

    const note = fixture.nativeElement.querySelector(
      '[data-testid="booking-manager-note"]',
    ) as HTMLElement | null;

    expect(note).not.toBeNull();
    expect(note?.querySelector('dd')?.textContent?.trim())
      .toBe('No manager note');
  });

  it('BC-43 keeps customer notes separate from manager notes', () => {
    fixture.detectChanges();

    component.selectedBooking.set({
      ...BOOKING,
      notes: 'Customer requested brake inspection.',
      managerNote: 'Internal workshop instruction.',
    });

    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;

    const managerNote = root.querySelector(
      '[data-testid="booking-manager-note"]',
    );

    const details = Array.from(
      root.querySelectorAll('.booking-details-grid > div'),
    );

    const customerNotes = details.find(
      detail =>
        detail.querySelector('dt')?.textContent?.trim() === 'Notes',
    );

    expect(customerNotes).toBeDefined();
    expect(customerNotes?.querySelector('dd')?.textContent?.trim())
      .toBe('Customer requested brake inspection.');

    expect(managerNote?.querySelector('dd')?.textContent?.trim())
      .toBe('Internal workshop instruction.');

    expect(customerNotes?.textContent)
      .not.toContain('Internal workshop instruction.');

    expect(managerNote?.textContent)
      .not.toContain('Customer requested brake inspection.');
  });

  it('BC-44 displays the internal manager note visibility label', () => {
    fixture.detectChanges();

    component.selectedBooking.set({
      ...BOOKING,
      managerNote: 'Internal note.',
    });

    fixture.detectChanges();

    const note = fixture.nativeElement.querySelector(
      '[data-testid="booking-manager-note"]',
    ) as HTMLElement | null;

    expect(note).not.toBeNull();
    expect(note?.textContent)
      .toContain('Internal - staff and mechanic only.');
  });

  it('BC-45 renders manager note HTML as plain text', () => {
    fixture.detectChanges();

    const unsafeNote =
      '<img src="invalid" onerror="alert(1)">';

    component.selectedBooking.set({
      ...BOOKING,
      managerNote: unsafeNote,
    });

    fixture.detectChanges();

    const note = fixture.nativeElement.querySelector(
      '[data-testid="booking-manager-note"]',
    ) as HTMLElement | null;

    expect(note).not.toBeNull();
    expect(note?.querySelector('dd')?.textContent?.trim())
      .toBe(unsafeNote);

    expect(note?.querySelector('img')).toBeNull();
  });
});
