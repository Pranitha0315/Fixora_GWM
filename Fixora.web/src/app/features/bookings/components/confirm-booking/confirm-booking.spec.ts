import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of, Subject, throwError } from 'rxjs';

import { ConfirmBooking } from './confirm-booking';

import { ApiError } from '../../../../core/models/api-error.model';

import type { Booking } from '../../models/booking.model';

import type {
  MechanicRosterDto,
  BayDto,
} from '../../models/booking-support.model';

import {
  BookingActionApiService,
} from '../../services/booking-action-api.service';

describe('ConfirmBooking', () => {
  const bookingId = '11111111-1111-4111-8111-111111111111';
  const mechanicId = '22222222-2222-4222-8222-222222222222';
  const offDutyId = '33333333-3333-4333-8333-333333333333';
  const bayId = '44444444-4444-4444-8444-444444444444';
  const inactiveBayId = '55555555-5555-4555-8555-555555555555';

  const booking: Booking = {
    id: bookingId,
    customerId: '66666666-6666-4666-8666-666666666666',
    customerName: 'Test Customer',
    vehicleId: '77777777-7777-4777-8777-777777777777',
    vehicleLabel: 'Toyota Prius',
    serviceId: '88888888-8888-4888-8888-888888888888',
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
    notes: null,
    managerNote: null,
    promoCode: null,
    declineReason: null,
    createdAt: '2026-11-25T04:30:00Z',
  };

  const mechanics: MechanicRosterDto[] = [
    {
      id: mechanicId,
      name: 'Mechanic One',
      phone: '0771234567',
      employeeCode: 'EMP-001',
      onDuty: true,
      activeJobs: 0,
    },
    {
      id: offDutyId,
      name: 'Mechanic Two',
      phone: '0771234568',
      employeeCode: 'EMP-002',
      onDuty: false,
      activeJobs: 0,
    },
  ];

  const bays: BayDto[] = [
    { id: bayId, name: 'Bay One', active: true },
    { id: inactiveBayId, name: 'Bay Two', active: false },
  ];

  const confirmedBooking: Booking = {
    ...booking,
    status: 'Confirmed',
    mechanicId,
    mechanicName: 'Mechanic One',
    bayId,
    bayName: 'Bay One',
  };

  let fixture: ComponentFixture<ConfirmBooking>;
  let component: ConfirmBooking;

  const api = {
    getMechanics: vi.fn(),
    getBays: vi.fn(),
    confirmBooking: vi.fn(),
  };

  function create(status = 'Requested'): void {
    fixture = TestBed.createComponent(ConfirmBooking);
    fixture.componentRef.setInput('booking', {
      ...booking,
      status,
    });

    component = fixture.componentInstance;
    component.ngOnInit();
  }

  function selectValidResources(): void {
    component.mechanicId.set(mechanicId);
    component.bayId.set(bayId);
  }

  beforeEach(async () => {
    vi.resetAllMocks();

    api.getMechanics.mockReturnValue(of(mechanics));
    api.getBays.mockReturnValue(of(bays));
    api.confirmBooking.mockReturnValue(of(confirmedBooking));

    await TestBed.configureTestingModule({
      imports: [ConfirmBooking],
      providers: [
        {
          provide: BookingActionApiService,
          useValue: api,
        },
      ],
    }).compileComponents();
  });

  it('CB01 loads mechanics and bays', () => {
    create();

    expect(api.getMechanics).toHaveBeenCalledTimes(1);
    expect(api.getBays).toHaveBeenCalledTimes(1);
    expect(component.mechanics()).toEqual(mechanics);
    expect(component.bays()).toEqual(bays);
    expect(component.loading()).toBe(false);
  });

  it('CB02 includes off-duty mechanics for selection', () => {
    create();

    expect(component.mechanicOptions()).toContainEqual({
      value: offDutyId,
      label: 'Mechanic Two (Off duty)',
    });
  });

  it('CB03 excludes inactive bays', () => {
    create();

    expect(component.bayOptions()).toEqual([
      { value: bayId, label: 'Bay One' },
    ]);
  });

  it('CB04 disables confirmation without selections', () => {
    create();

    expect(component.canSubmit()).toBe(false);
    component.submit();

    expect(api.confirmBooking).not.toHaveBeenCalled();
  });

  it('CB05 enables confirmation with valid selections', () => {
    create();
    selectValidResources();

    expect(component.canSubmit()).toBe(true);
  });

  it('CB06 rejects an unknown mechanic selection', () => {
    create();
    selectValidResources();

    component.mechanicId.set('unknown');

    expect(component.canSubmit()).toBe(false);
  });

  it('CB07 rejects an inactive bay selection', () => {
    create();
    selectValidResources();

    component.bayId.set(inactiveBayId);

    expect(component.canSubmit()).toBe(false);
  });

  it('CB08 accepts a note of 500 characters', () => {
    create();
    selectValidResources();

    component.note.set('a'.repeat(500));

    expect(component.canSubmit()).toBe(true);
  });

  it('CB09 rejects a note exceeding 500 characters', () => {
    create();
    selectValidResources();

    component.note.set('a'.repeat(501));
    component.submit();

    expect(component.canSubmit()).toBe(false);
    expect(api.confirmBooking).not.toHaveBeenCalled();
  });

  it('CB10 blocks non-requested bookings', () => {
    create('Confirmed');

    expect(api.getMechanics).not.toHaveBeenCalled();
    expect(api.getBays).not.toHaveBeenCalled();
    expect(component.canSubmit()).toBe(false);

    component.submit();

    expect(api.confirmBooking).not.toHaveBeenCalled();
  });

  it('CB11 sends a valid request and emits success', () => {
    create();
    selectValidResources();

    const emit = vi.spyOn(component.confirmed, 'emit');

    const response: Booking = {
      ...confirmedBooking,
      managerNote: 'Internal instructions',
    };

    api.confirmBooking.mockReturnValue(of(response));

    component.note.set('  Internal instructions  ');
    component.submit();

    expect(api.confirmBooking).toHaveBeenCalledWith(
      bookingId,
      {
        mechanicId,
        bayId,
        note: 'Internal instructions',
      },
    );

    expect(emit).toHaveBeenCalledWith(response);
    expect(component.completed()).toBe(true);
    expect(component.submitting()).toBe(false);
    expect(component.canSubmit()).toBe(false);
  });

  it('CB12 sends null for an empty optional note', () => {
    create();
    selectValidResources();

    component.submit();

    expect(api.confirmBooking).toHaveBeenCalledWith(
      bookingId,
      { mechanicId, bayId, note: null },
    );
  });

  it('CB13 prevents duplicate submission while pending', () => {
    const pending = new Subject<Booking>();

    api.confirmBooking.mockReturnValue(pending);

    create();
    selectValidResources();

    component.submit();
    component.submit();

    expect(api.confirmBooking).toHaveBeenCalledTimes(1);
    expect(component.submitting()).toBe(true);

    pending.next(confirmedBooking);
    pending.complete();

    expect(component.submitting()).toBe(false);
    expect(component.completed()).toBe(true);
  });

  it('CB14 blocks cancellation during submission', () => {
    const pending = new Subject<Booking>();

    api.confirmBooking.mockReturnValue(pending);

    create();
    selectValidResources();

    const emit = vi.spyOn(component.cancelled, 'emit');

    component.submit();
    component.close();

    expect(emit).not.toHaveBeenCalled();

    pending.complete();
  });

  it('CB15 displays resource loading failure and allows retry', () => {
    api.getMechanics.mockReturnValue(
      throwError(() => new Error('Resource unavailable')),
    );

    create();

    expect(component.resourceError()).toBeTruthy();
    expect(component.loading()).toBe(false);
    expect(component.canSubmit()).toBe(false);

    api.getMechanics.mockReturnValue(of(mechanics));

    component.loadResources();

    expect(component.resourceError()).toBeNull();
    expect(component.mechanics()).toEqual(mechanics);
  });

  it('CB16 handles mechanic conflict without automatic retry', () => {
    api.confirmBooking.mockReturnValue(
      throwError(() => new ApiError(
        409,
        'CONFLICT',
        'Raw server message',
        'mechanic_busy',
      )),
    );

    create();
    selectValidResources();
    component.submit();

    expect(component.actionError()).toContain(
      'Selected mechanic is already booked',
    );

    expect(component.requiresRefresh()).toBe(false);
    expect(api.confirmBooking).toHaveBeenCalledTimes(1);
  });

  it('CB17 handles bay conflict without automatic retry', () => {
    api.confirmBooking.mockReturnValue(
      throwError(() => new ApiError(
        409,
        'CONFLICT',
        'Raw server message',
        'bay_busy',
      )),
    );

    create();
    selectValidResources();
    component.submit();

    expect(component.actionError()).toContain(
      'Selected bay is already occupied',
    );

    expect(component.requiresRefresh()).toBe(false);
    expect(api.confirmBooking).toHaveBeenCalledTimes(1);
  });

  it('CB18 blocks resubmission after uncertain network outcome', () => {
    api.confirmBooking.mockReturnValue(
      throwError(() => new ApiError(
        0,
        'NETWORK_ERROR',
        'Connection lost',
      )),
    );

    create();
    selectValidResources();

    const refresh = vi.spyOn(component.refreshRequired, 'emit');

    component.submit();
    component.submit();

    expect(component.requiresRefresh()).toBe(true);
    expect(component.canSubmit()).toBe(false);
    expect(api.confirmBooking).toHaveBeenCalledTimes(1);

    component.close();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('CB19 requires refresh for an unexpected success status', () => {
    api.confirmBooking.mockReturnValue(of(booking));

    create();
    selectValidResources();

    const emit = vi.spyOn(component.confirmed, 'emit');

    component.submit();

    expect(component.requiresRefresh()).toBe(true);
    expect(component.completed()).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });

  it('CB21 blocks success when the assigned mechanic differs', () => {
    api.confirmBooking.mockReturnValue(of({
      ...confirmedBooking,
      mechanicId: offDutyId,
    }));

    create();
    selectValidResources();

    const emit = vi.spyOn(component.confirmed, 'emit');

    component.submit();

    expect(component.requiresRefresh()).toBe(true);
    expect(component.completed()).toBe(false);
    expect(component.canSubmit()).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });

  it('CB22 blocks success when the assigned bay differs', () => {
    api.confirmBooking.mockReturnValue(of({
      ...confirmedBooking,
      bayId: inactiveBayId,
    }));

    create();
    selectValidResources();

    const emit = vi.spyOn(component.confirmed, 'emit');

    component.submit();

    expect(component.requiresRefresh()).toBe(true);
    expect(component.completed()).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });

  it('CB23 blocks success when the manager note differs', () => {
    create();
    selectValidResources();

    component.note.set('Internal instructions');

    const emit = vi.spyOn(component.confirmed, 'emit');

    component.submit();

    expect(component.requiresRefresh()).toBe(true);
    expect(component.completed()).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });

  it('CB24 blocks success when the booking identifier differs', () => {
    api.confirmBooking.mockReturnValue(of({
      ...confirmedBooking,
      id: offDutyId,
    }));

    create();
    selectValidResources();

    const emit = vi.spyOn(component.confirmed, 'emit');

    component.submit();

    expect(component.requiresRefresh()).toBe(true);
    expect(component.completed()).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });

  it('CB25 blocks success when resource assignments are missing', () => {
    api.confirmBooking.mockReturnValue(of({
      ...confirmedBooking,
      mechanicId: null,
      bayId: null,
    }));

    create();
    selectValidResources();

    const emit = vi.spyOn(component.confirmed, 'emit');

    component.submit();

    expect(component.requiresRefresh()).toBe(true);
    expect(component.completed()).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });

  it('CB26 blocks success when the server outcome is uncertain', () => {
    api.confirmBooking.mockReturnValue(
      throwError(() => new ApiError(
        500,
        'SERVER_ERROR',
        'Sensitive internal server information',
      )),
    );

    create();
    selectValidResources();

    const emit = vi.spyOn(component.confirmed, 'emit');

    component.submit();
    component.submit();

    expect(component.requiresRefresh()).toBe(true);
    expect(component.canSubmit()).toBe(false);
    expect(component.actionError()).not.toContain(
      'Sensitive internal server information',
    );
    expect(api.confirmBooking).toHaveBeenCalledTimes(1);
    expect(emit).not.toHaveBeenCalled();
  });

  it('CB20 emits cancellation when no submission is pending', () => {
    create();

    const emit = vi.spyOn(component.cancelled, 'emit');

    component.close();

    expect(emit).toHaveBeenCalledTimes(1);
    expect(api.confirmBooking).not.toHaveBeenCalled();
  });
});
