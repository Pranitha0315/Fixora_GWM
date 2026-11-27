import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY, of, Subject, throwError } from 'rxjs';

import { RejectBooking } from './reject-booking';
import { ApiError } from '../../../../core/models/api-error.model';
import type { Booking } from '../../models/booking.model';

import {
  BookingActionApiService,
} from '../../services/booking-action-api.service';

import {
  BookingRequestError,
} from '../../utils/booking-action.validator';

describe('RejectBooking', () => {
  const bookingId = '11111111-1111-4111-8111-111111111111';
  const reason = 'Workshop fully booked';

  const booking: Booking = {
    id: bookingId,
    customerId: '22222222-2222-4222-8222-222222222222',
    customerName: 'Test Customer',
    vehicleId: '33333333-3333-4333-8333-333333333333',
    vehicleLabel: 'Toyota Prius',
    serviceId: '44444444-4444-4444-8444-444444444444',
    serviceName: 'Oil Change',
    slotStart: '2099-01-05T04:30:00Z',
    slotEnd: '2099-01-05T05:30:00Z',
    status: 'Requested',
    source: 'App',
    jobCardId: null,
    bayId: null,
    bayName: null,
    mechanicId: null,
    mechanicName: null,
    notes: 'Original customer note',
    managerNote: null,
    promoCode: null,
    declineReason: null,
    createdAt: '2026-11-25T04:30:00Z',
  };

  const declinedBooking: Booking = {
    ...booking,
    status: 'Declined',
    declineReason: reason,
  };

  let fixture: ComponentFixture<RejectBooking>;
  let component: RejectBooking;

  const api = {
    declineBooking: vi.fn(),
  };

  function create(status = 'Requested'): void {
    fixture = TestBed.createComponent(RejectBooking);
    fixture.componentRef.setInput('booking', {
      ...booking,
      status,
    });

    component = fixture.componentInstance;
  }

  function prepare(): void {
    create();
    component.changeReason(reason);
  }

  beforeEach(async () => {
    vi.resetAllMocks();

    api.declineBooking.mockReturnValue(of(declinedBooking));

    await TestBed.configureTestingModule({
      imports: [RejectBooking],
      providers: [
        {
          provide: BookingActionApiService,
          useValue: api,
        },
      ],
    }).compileComponents();
  });

  it('RB01 creates the component', () => {
    create();

    expect(component).toBeTruthy();
    expect(component.submitting()).toBe(false);
    expect(component.completed()).toBe(false);
  });

  it('RB02 exposes the selected booking details', () => {
    create();

    expect(component.booking()).toEqual(booking);
    expect(component.booking().customerName).toBe('Test Customer');
    expect(component.booking().vehicleLabel).toBe('Toyota Prius');
    expect(component.booking().serviceName).toBe('Oil Change');
  });

  it('RB03 permits a requested booking with a valid reason', () => {
    prepare();

    expect(component.canSubmit()).toBe(true);
  });

  it.each([
    'Confirmed',
    'Declined',
    'Cancelled',
    'CheckedIn',
    'Completed',
    'NoShow',
    'Unknown',
  ])('RB04 blocks non-requested status %s', status => {
    create(status);
    component.changeReason(reason);
    component.submit();

    expect(component.canSubmit()).toBe(false);
    expect(api.declineBooking).not.toHaveBeenCalled();
  });

  it('RB05 blocks an empty reason', () => {
    create();
    component.submit();

    expect(component.canSubmit()).toBe(false);
    expect(api.declineBooking).not.toHaveBeenCalled();
  });

  it('RB06 blocks whitespace-only reasons', () => {
    create();
    component.changeReason('   \t\n ');
    component.submit();

    expect(component.canSubmit()).toBe(false);
    expect(api.declineBooking).not.toHaveBeenCalled();
  });

  it('RB07 enables rejection after entering a reason', () => {
    create();

    expect(component.canSubmit()).toBe(false);

    component.changeReason(reason);

    expect(component.canSubmit()).toBe(true);
  });

  it('RB08 sends the correct decline request', () => {
    prepare();
    component.submit();

    expect(api.declineBooking).toHaveBeenCalledTimes(1);
    expect(api.declineBooking).toHaveBeenCalledWith(
      bookingId,
      { reason },
    );
  });

  it('RB09 trims the rejection reason', () => {
    create();
    component.changeReason('  Workshop fully booked  ');
    component.submit();

    expect(api.declineBooking).toHaveBeenCalledWith(
      bookingId,
      { reason },
    );
    expect(component.completed()).toBe(true);
  });

  it('RB10 emits the verified declined response', () => {
    prepare();

    const emit = vi.spyOn(component.rejected, 'emit');

    component.submit();

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(declinedBooking);
    expect(component.completed()).toBe(true);
    expect(component.submitting()).toBe(false);
    expect(component.canSubmit()).toBe(false);
  });

  it('RB11 prevents duplicate submission while pending', () => {
    const pending = new Subject<Booking>();

    api.declineBooking.mockReturnValue(pending);

    prepare();

    component.submit();
    component.submit();

    expect(api.declineBooking).toHaveBeenCalledTimes(1);
    expect(component.submitting()).toBe(true);
    expect(component.canSubmit()).toBe(false);

    pending.next(declinedBooking);
    pending.complete();

    expect(component.submitting()).toBe(false);
    expect(component.completed()).toBe(true);
  });

  it('RB12 cancels without an API call', () => {
    prepare();

    const emit = vi.spyOn(component.cancelled, 'emit');

    component.close();

    expect(emit).toHaveBeenCalledTimes(1);
    expect(api.declineBooking).not.toHaveBeenCalled();
  });

  it('RB13 handles HTTP 400 safely', () => {
    api.declineBooking.mockReturnValue(
      throwError(() => new ApiError(
        400,
        'BAD_REQUEST',
        'Sensitive raw error',
      )),
    );

    prepare();
    component.submit();

    expect(component.actionError()).toBeTruthy();
    expect(component.actionError()).not.toContain('Sensitive raw error');
    expect(component.requiresRefresh()).toBe(true);
    expect(component.canSubmit()).toBe(false);
  });

  it('RB14 handles a booking status conflict', () => {
    api.declineBooking.mockReturnValue(
      throwError(() => new ApiError(
        409,
        'CONFLICT',
        'Raw conflict message',
        'booking_not_requested',
      )),
    );

    prepare();
    component.submit();

    expect(component.actionError()).toBeTruthy();
    expect(component.requiresRefresh()).toBe(true);
    expect(component.completed()).toBe(false);
  });

  it('RB15 locks submission after a network error', () => {
    api.declineBooking.mockReturnValue(
      throwError(() => new ApiError(
        0,
        'NETWORK_ERROR',
        'Connection lost',
      )),
    );

    prepare();

    component.submit();
    component.submit();

    expect(component.requiresRefresh()).toBe(true);
    expect(component.canSubmit()).toBe(false);
    expect(api.declineBooking).toHaveBeenCalledTimes(1);
  });

  it('RB16 hides sensitive server errors', () => {
    api.declineBooking.mockReturnValue(
      throwError(() => new ApiError(
        500,
        'SERVER_ERROR',
        'Sensitive internal server information',
      )),
    );

    prepare();

    const emit = vi.spyOn(component.rejected, 'emit');

    component.submit();

    expect(component.actionError()).toBeTruthy();
    expect(component.actionError()).not.toContain(
      'Sensitive internal server information',
    );
    expect(component.requiresRefresh()).toBe(true);
    expect(emit).not.toHaveBeenCalled();
  });

  it('RB17 rejects an incorrect response identifier', () => {
    api.declineBooking.mockReturnValue(of({
      ...declinedBooking,
      id: '55555555-5555-4555-8555-555555555555',
    }));

    prepare();

    const emit = vi.spyOn(component.rejected, 'emit');

    component.submit();

    expect(component.requiresRefresh()).toBe(true);
    expect(component.completed()).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });

  it('RB18 rejects an incorrect response status', () => {
    api.declineBooking.mockReturnValue(of(booking));

    prepare();

    const emit = vi.spyOn(component.rejected, 'emit');

    component.submit();

    expect(component.requiresRefresh()).toBe(true);
    expect(component.completed()).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });

  it('RB19 rejects an incorrect response reason', () => {
    api.declineBooking.mockReturnValue(of({
      ...declinedBooking,
      declineReason: 'Different reason',
    }));

    prepare();

    const emit = vi.spyOn(component.rejected, 'emit');

    component.submit();

    expect(component.requiresRefresh()).toBe(true);
    expect(component.completed()).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });

  it('RB20 handles an empty API response', () => {
    api.declineBooking.mockReturnValue(EMPTY);

    prepare();

    const emit = vi.spyOn(component.rejected, 'emit');

    component.submit();

    expect(component.requiresRefresh()).toBe(true);
    expect(component.submitting()).toBe(false);
    expect(component.completed()).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });

  it('RB21 blocks closing during submission', () => {
    const pending = new Subject<Booking>();

    api.declineBooking.mockReturnValue(pending);

    prepare();

    const cancel = vi.spyOn(component.cancelled, 'emit');
    const refresh = vi.spyOn(component.refreshRequired, 'emit');

    component.submit();
    component.close();

    expect(cancel).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();

    pending.next(declinedBooking);
    pending.complete();
  });

  it('RB22 emits refresh after an uncertain outcome', () => {
    api.declineBooking.mockReturnValue(EMPTY);

    prepare();

    const refresh = vi.spyOn(component.refreshRequired, 'emit');
    const cancel = vi.spyOn(component.cancelled, 'emit');

    component.submit();
    component.close();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('RB23 prevents editing after an uncertain outcome', () => {
    api.declineBooking.mockReturnValue(EMPTY);

    prepare();
    component.submit();
    component.changeReason('Another reason');

    expect(component.reason()).toBe(reason);
    expect(component.canSubmit()).toBe(false);
  });

  it('RB24 prevents repeated submission after success', () => {
    prepare();

    component.submit();
    component.submit();

    expect(api.declineBooking).toHaveBeenCalledTimes(1);
    expect(component.completed()).toBe(true);
  });

  it('RB25 permits correction after a local request validation error', () => {
    api.declineBooking.mockReturnValue(
      throwError(() => new BookingRequestError('reason')),
    );

    prepare();
    component.submit();

    expect(component.requiresRefresh()).toBe(false);
    expect(component.submitting()).toBe(false);
    expect(component.actionError()).toBeTruthy();

    component.changeReason('Updated reason');

    expect(component.actionError()).toBeNull();
    expect(component.canSubmit()).toBe(true);
  });
});