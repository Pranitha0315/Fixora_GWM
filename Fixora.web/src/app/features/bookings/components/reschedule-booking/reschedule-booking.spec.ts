import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError, EMPTY } from 'rxjs';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { RescheduleBooking } from './reschedule-booking';
import { BookingActionApiService } from '../../services/booking-action-api.service';
import type { Booking } from '../../models/booking.model';
import type { SlotDto } from '../../models/booking-support.model';

describe('RescheduleBooking', () => {
  let fixture: ComponentFixture<RescheduleBooking>;
  let component: RescheduleBooking;

  const api = {
    getSlots: vi.fn(),
    rescheduleBooking: vi.fn(),
  };

  const future = new Date(Date.now() + 7 * 86400000);
  const date = new Date(
    future.getTime() + 330 * 60000,
  ).toISOString().slice(0, 10);

  const start = `${date}T04:30:00Z`;
  const end = `${date}T05:30:00Z`;

  const booking: Booking = {
    id: '11111111-1111-1111-1111-111111111111',
    customerId: '22222222-2222-2222-2222-222222222222',
    customerName: 'Kavitha',
    vehicleId: '33333333-3333-3333-3333-333333333333',
    vehicleLabel: 'Suzuki Wagon R',
    serviceId: '44444444-4444-4444-4444-444444444444',
    serviceName: 'Brake Inspection',
    slotStart: `${date}T02:30:00Z`,
    slotEnd: `${date}T03:30:00Z`,
    status: 'Requested',
    source: 'App',
    jobCardId: null,
    bayId: null,
    bayName: null,
    mechanicId: null,
    mechanicName: null,
    notes: 'Original customer notes',
    managerNote: null,
    promoCode: null,
    declineReason: null,
    createdAt: '2026-01-01T00:00:00Z',
  };

  const slot: SlotDto = {
    start,
    end,
    freeBays: 2,
  };

  const updated: Booking = {
    ...booking,
    slotStart: start,
    slotEnd: end,
  };

  function setBooking(value: Booking): void {
    fixture.componentRef.setInput('booking', value);
  }

  function loadValidSlots(): void {
    component.changeDate(date);
    component.loadSlots();
  }

  function prepareSubmission(): void {
    loadValidSlots();
    component.changeSlot(start);
  }

  beforeEach(async () => {
    vi.resetAllMocks();

    api.getSlots.mockReturnValue(of([slot]));
    api.rescheduleBooking.mockReturnValue(of(updated));

    await TestBed.configureTestingModule({
      imports: [RescheduleBooking],
      providers: [
        {
          provide: BookingActionApiService,
          useValue: api,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RescheduleBooking);
    component = fixture.componentInstance;
    setBooking(booking);
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('RS01 creates the component', () => {
    expect(component).toBeTruthy();
  });

  it('RS02 initially prevents submission', () => {
    expect(component.canSubmit()).toBe(false);
    expect(component.canLoadSlots()).toBe(false);
  });

  it.each(['Requested', 'Confirmed'])(
    'RS03 allows eligible status %s',
    status => {
      setBooking({ ...booking, status });
      expect(component.eligible()).toBe(true);
    },
  );

  it.each([
    'Declined',
    'Cancelled',
    'CheckedIn',
    'Completed',
    'NoShow',
    'Unknown',
  ])('RS04 blocks ineligible status %s', status => {
    setBooking({ ...booking, status });
    component.changeDate(date);
    component.loadSlots();
    component.submit();

    expect(component.eligible()).toBe(false);
    expect(api.getSlots).not.toHaveBeenCalled();
    expect(api.rescheduleBooking).not.toHaveBeenCalled();
  });

  it('RS05 blocks past dates', () => {
    component.changeDate('2000-01-01');
    component.loadSlots();

    expect(component.canLoadSlots()).toBe(false);
    expect(api.getSlots).not.toHaveBeenCalled();
  });

  it('RS06 blocks malformed dates', () => {
    component.changeDate('invalid');
    component.loadSlots();

    expect(api.getSlots).not.toHaveBeenCalled();
  });

  it('RS07 requests slots for the booking service', () => {
    loadValidSlots();

    expect(api.getSlots).toHaveBeenCalledWith({
      date,
      serviceId: booking.serviceId,
    });

    expect(component.slotsLoaded()).toBe(true);
    expect(component.slots()).toEqual([slot]);
  });

  it('RS08 handles empty slot results', () => {
    api.getSlots.mockReturnValue(of([]));
    loadValidSlots();

    expect(component.slotsLoaded()).toBe(true);
    expect(component.slots()).toEqual([]);
    expect(component.canSubmit()).toBe(false);
  });

  it('RS09 handles slot loading errors', () => {
    api.getSlots.mockReturnValue(
      throwError(() => new Error('Network failure')),
    );

    loadValidSlots();

    expect(component.slotError()).toBeTruthy();
    expect(component.loadingSlots()).toBe(false);
    expect(component.canSubmit()).toBe(false);
  });

  it('RS10 permits slot retrieval retry', () => {
    api.getSlots.mockReturnValueOnce(
      throwError(() => new Error('Network failure')),
    );

    loadValidSlots();
    component.loadSlots();

    expect(component.slotError()).toBeNull();
    expect(component.slots()).toEqual([slot]);
    expect(api.getSlots).toHaveBeenCalledTimes(2);
  });

  it('RS11 excludes the original appointment', () => {
    api.getSlots.mockReturnValue(of([
      {
        start: booking.slotStart,
        end: booking.slotEnd,
        freeBays: 1,
      },
      slot,
    ]));

    loadValidSlots();

    expect(component.slots()).toEqual([slot]);
  });

  it('RS12 excludes slots without free bays', () => {
    api.getSlots.mockReturnValue(of([
      { ...slot, freeBays: 0 },
    ]));

    loadValidSlots();

    expect(component.slots()).toEqual([]);
  });

  it('RS13 excludes expired slots', () => {
    api.getSlots.mockReturnValue(of([
      {
        start: '2000-01-01T04:30:00Z',
        end: '2000-01-01T05:30:00Z',
        freeBays: 1,
      },
    ]));

    loadValidSlots();

    expect(component.slots()).toEqual([]);
  });

  it('RS14 excludes slots from another local date', () => {
    const anotherStart = new Date(
      Date.parse(start) + 86400000,
    ).toISOString();

    const anotherEnd = new Date(
      Date.parse(end) + 86400000,
    ).toISOString();

    api.getSlots.mockReturnValue(of([
      {
        start: anotherStart,
        end: anotherEnd,
        freeBays: 1,
      },
    ]));

    loadValidSlots();

    expect(component.slots()).toEqual([]);
  });

  it('RS15 excludes malformed slot timestamps', () => {
    api.getSlots.mockReturnValue(of([
      { ...slot, start: 'invalid' },
    ]));

    loadValidSlots();

    expect(component.slots()).toEqual([]);
  });

  it('RS16 rejects arbitrary slot selection', () => {
    loadValidSlots();
    component.changeSlot('invalid');

    expect(component.selectedSlot()).toBe('');
    expect(component.canSubmit()).toBe(false);
  });

  it('RS17 enables submission for a valid selection', () => {
    prepareSubmission();

    expect(component.canSubmit()).toBe(true);
  });

  it('RS18 clears stale slots when date changes', () => {
    prepareSubmission();
    component.changeDate('');

    expect(component.selectedSlot()).toBe('');
    expect(component.slots()).toEqual([]);
    expect(component.slotsLoaded()).toBe(false);
    expect(component.canSubmit()).toBe(false);
  });

  it('RS19 prevents duplicate slot retrieval', () => {
    const pending = new Subject<readonly SlotDto[]>();
    api.getSlots.mockReturnValue(pending);

    component.changeDate(date);
    component.loadSlots();
    component.loadSlots();

    expect(component.loadingSlots()).toBe(true);
    expect(api.getSlots).toHaveBeenCalledTimes(1);

    pending.next([slot]);
    pending.complete();

    expect(component.loadingSlots()).toBe(false);
  });

  it('RS20 prevents date changes while loading slots', () => {
    const pending = new Subject<readonly SlotDto[]>();
    api.getSlots.mockReturnValue(pending);

    component.changeDate(date);
    component.loadSlots();
    component.changeDate('');

    expect(component.selectedDate()).toBe(date);

    pending.complete();
  });

  it('RS21 submits the exact selected slot', () => {
    prepareSubmission();
    component.submit();

    expect(api.rescheduleBooking).toHaveBeenCalledWith(
      booking.id,
      { slotStart: start },
    );

    expect(component.completed()).toBe(true);
  });

  it('RS22 emits verified success', () => {
    const emit = vi.spyOn(component.rescheduled, 'emit');

    prepareSubmission();
    component.submit();

    expect(emit).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith(updated);
  });

  it('RS23 preserves confirmed status', () => {
    setBooking({ ...booking, status: 'Confirmed' });

    api.rescheduleBooking.mockReturnValue(of({
      ...updated,
      status: 'Confirmed',
    }));

    prepareSubmission();
    component.submit();

    expect(component.completed()).toBe(true);
  });

  it('RS24 blocks duplicate mutation requests', () => {
    const pending = new Subject<Booking>();
    api.rescheduleBooking.mockReturnValue(pending);

    prepareSubmission();
    component.submit();
    component.submit();

    expect(component.submitting()).toBe(true);
    expect(api.rescheduleBooking).toHaveBeenCalledTimes(1);

    pending.next(updated);
    pending.complete();

    expect(component.completed()).toBe(true);
    expect(component.submitting()).toBe(false);
  });

  it('RS25 blocks closing while submitting', () => {
    const pending = new Subject<Booking>();
    api.rescheduleBooking.mockReturnValue(pending);

    const cancel = vi.spyOn(component.cancelled, 'emit');
    const refresh = vi.spyOn(component.refreshRequired, 'emit');

    prepareSubmission();
    component.submit();
    component.close();

    expect(cancel).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();

    pending.next(updated);
    pending.complete();
  });

  it.each([
    { id: 'wrong-id' },
    { status: 'Declined' },
    { slotStart: booking.slotStart },
    { slotEnd: booking.slotEnd },
  ])('RS26 rejects mismatched mutation response %j', patch => {
    api.rescheduleBooking.mockReturnValue(of({
      ...updated,
      ...patch,
    }));

    const emit = vi.spyOn(component.rescheduled, 'emit');

    prepareSubmission();
    component.submit();

    expect(component.requiresRefresh()).toBe(true);
    expect(component.completed()).toBe(false);
    expect(component.canSubmit()).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });

  it('RS27 locks uncertain mutation outcomes', () => {
    api.rescheduleBooking.mockReturnValue(
      throwError(() => new Error('Connection lost')),
    );

    prepareSubmission();
    component.submit();
    component.submit();

    expect(component.requiresRefresh()).toBe(true);
    expect(component.actionError()).toBeTruthy();
    expect(api.rescheduleBooking).toHaveBeenCalledTimes(1);
  });

  it('RS28 treats empty mutation response as uncertain', () => {
    api.rescheduleBooking.mockReturnValue(EMPTY);

    prepareSubmission();
    component.submit();

    expect(component.requiresRefresh()).toBe(true);
    expect(component.completed()).toBe(false);
  });

  it('RS29 requests refresh after uncertain outcome', () => {
    api.rescheduleBooking.mockReturnValue(
      throwError(() => new Error('Connection lost')),
    );

    const emit = vi.spyOn(component.refreshRequired, 'emit');

    prepareSubmission();
    component.submit();
    component.close();

    expect(emit).toHaveBeenCalledOnce();
  });

  it('RS30 emits cancellation without mutation', () => {
    const emit = vi.spyOn(component.cancelled, 'emit');

    component.close();

    expect(emit).toHaveBeenCalledOnce();
    expect(api.rescheduleBooking).not.toHaveBeenCalled();
  });

  it('RS31 prevents resubmission after success', () => {
    prepareSubmission();
    component.submit();
    component.submit();

    expect(api.rescheduleBooking).toHaveBeenCalledTimes(1);
  });

  it('RS32 ignores date and slot changes after success', () => {
    prepareSubmission();
    component.submit();

    component.changeDate('');
    component.changeSlot('');

    expect(component.selectedDate()).toBe(date);
    expect(component.selectedSlot()).toBe(start);
  });
});