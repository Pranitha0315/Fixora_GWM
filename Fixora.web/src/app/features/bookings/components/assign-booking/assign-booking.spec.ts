import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY, Subject, of, throwError } from 'rxjs';

import { AssignBooking } from './assign-booking';
import { Booking } from '../../models/booking.model';
import {
  BayDto,
  JobSummaryDto,
  MechanicRosterDto,
} from '../../models/booking-support.model';
import { BookingActionApiService } from '../../services/booking-action-api.service';

const JOB_ID = '10000000-0000-4000-8000-000000000001';
const CUSTOMER_ID = '20000000-0000-4000-8000-000000000001';
const VEHICLE_ID = '30000000-0000-4000-8000-000000000001';

const M1 = '40000000-0000-4000-8000-000000000001';
const M2 = '40000000-0000-4000-8000-000000000002';
const M3 = '40000000-0000-4000-8000-000000000003';

const B1 = '50000000-0000-4000-8000-000000000001';
const B2 = '50000000-0000-4000-8000-000000000002';
const B3 = '50000000-0000-4000-8000-000000000003';

const BOOKING: Booking = {
  id: '60000000-0000-4000-8000-000000000001',
  customerId: CUSTOMER_ID,
  customerName: 'Test Customer',
  vehicleId: VEHICLE_ID,
  vehicleLabel: 'Toyota Prius',
  serviceId: '70000000-0000-4000-8000-000000000001',
  serviceName: 'Brake Inspection',
  slotStart: '2026-11-26T04:30:00Z',
  slotEnd: '2026-11-26T05:30:00Z',
  status: 'CheckedIn',
  source: 'WalkIn',
  jobCardId: JOB_ID,
  mechanicId: M1,
  mechanicName: 'Mechanic One',
  bayId: B1,
  bayName: 'Bay One',
  notes: null,
  managerNote: null,
  promoCode: null,
  declineReason: null,
  createdAt: '2026-11-26T04:00:00Z',
};

const JOB: JobSummaryDto = {
  id: JOB_ID,
  number: 'JC-TEST-001',
  customerId: CUSTOMER_ID,
  customerName: BOOKING.customerName,
  vehicleId: VEHICLE_ID,
  vehicleLabel: BOOKING.vehicleLabel,
  mechanicId: M1,
  mechanicName: 'Mechanic One',
  bayId: B1,
  bayName: 'Bay One',
  status: 'Open',
  priority: 0,
  queuePosition: 1,
  etaAt: null,
  estimatedMinutes: 60,
  elapsedMinutes: 0,
  createdAt: BOOKING.createdAt,
  startedAt: null,
  completedAt: null,
  complaint: null,
  managerNote: null,
};

const UPDATED: JobSummaryDto = {
  ...JOB,
  mechanicId: M2,
  mechanicName: 'Mechanic Two',
  bayId: B2,
  bayName: 'Bay Two',
};

const MECHANICS: MechanicRosterDto[] = [
  {
    id: M1,
    name: 'Mechanic One',
    phone: '0700000001',
    employeeCode: 'EMP-001',
    onDuty: true,
    activeJobs: 1,
  },
  {
    id: M2,
    name: 'Mechanic Two',
    phone: '0700000002',
    employeeCode: 'EMP-002',
    onDuty: true,
    activeJobs: 0,
  },
  {
    id: M3,
    name: 'Mechanic Three',
    phone: '0700000003',
    employeeCode: 'EMP-003',
    onDuty: false,
    activeJobs: 0,
  },
];

const BAYS: BayDto[] = [
  { id: B1, name: 'Bay One', active: true },
  { id: B2, name: 'Bay Two', active: true },
  { id: B3, name: 'Bay Three', active: false },
];

describe('AssignBooking', () => {
  let fixture: ComponentFixture<AssignBooking>;
  let component: AssignBooking;

  const api = {
    getJobDetails: vi.fn(),
    getMechanics: vi.fn(),
    getBays: vi.fn(),
    assignJob: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    api.getJobDetails.mockReturnValue(of(JOB));
    api.getMechanics.mockReturnValue(of(MECHANICS));
    api.getBays.mockReturnValue(of(BAYS));
    api.assignJob.mockReturnValue(of(UPDATED));

    await TestBed.configureTestingModule({
      imports: [AssignBooking],
      providers: [
        { provide: BookingActionApiService, useValue: api },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AssignBooking);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('booking', BOOKING);
  });

  function load(): void {
    component.loadResources();
  }

  function selectNewAssignment(): void {
    component.changeMechanic(M2);
    component.changeBay(B2);
  }

  function prepareSubmission(): void {
    load();
    selectNewAssignment();
    api.getJobDetails.mockReturnValue(of(UPDATED));
  }

  it('AB-01 creates the component', () => {
    expect(component).toBeTruthy();
    expect(component.canSubmit()).toBe(false);
  });

  it('AB-02 loads authoritative job and resources on init', () => {
    component.ngOnInit();

    expect(api.getJobDetails).toHaveBeenCalledWith(JOB_ID);
    expect(api.getMechanics).toHaveBeenCalledTimes(1);
    expect(api.getBays).toHaveBeenCalledTimes(1);
    expect(component.job()).toEqual(JOB);
  });

  it('AB-03 rejects bookings without a job card', () => {
    fixture.componentRef.setInput('booking', {
      ...BOOKING,
      jobCardId: null,
    });

    load();

    expect(component.resourceError()).toBeTruthy();
    expect(api.getJobDetails).not.toHaveBeenCalled();
  });

  it('AB-04 rejects bookings not checked in', () => {
    fixture.componentRef.setInput('booking', {
      ...BOOKING,
      status: 'Confirmed',
    });

    load();

    expect(component.resourceError()).toBeTruthy();
    expect(api.getJobDetails).not.toHaveBeenCalled();
  });

  it('AB-05 rejects a mismatched job identity', () => {
    api.getJobDetails.mockReturnValue(of({
      ...JOB,
      id: CUSTOMER_ID,
    }));

    load();

    expect(component.job()).toBeNull();
    expect(component.resourceError()).toBeTruthy();
  });

  it('AB-06 rejects a mismatched customer identity', () => {
    api.getJobDetails.mockReturnValue(of({
      ...JOB,
      customerId: VEHICLE_ID,
    }));

    load();

    expect(component.job()).toBeNull();
    expect(component.resourceError()).toBeTruthy();
  });

  it('AB-07 rejects a mismatched vehicle identity', () => {
    api.getJobDetails.mockReturnValue(of({
      ...JOB,
      vehicleId: CUSTOMER_ID,
    }));

    load();

    expect(component.job()).toBeNull();
    expect(component.resourceError()).toBeTruthy();
  });

  it('AB-08 prevents assignment to non-open jobs', () => {
    api.getJobDetails.mockReturnValue(of({
      ...JOB,
      status: 'InProgress',
    }));

    load();
    selectNewAssignment();

    expect(component.resourceError()).toBeTruthy();
    expect(component.canSubmit()).toBe(false);
  });

  it('AB-09 filters out off-duty mechanics', () => {
    load();

    expect(component.availableMechanics().map(m => m.id))
      .toEqual([M1, M2]);
  });

  it('AB-10 filters out inactive bays', () => {
    load();

    expect(component.availableBays().map(b => b.id))
      .toEqual([B1, B2]);
  });

  it('AB-11 uses current job assignments instead of booking assignments', () => {
    api.getJobDetails.mockReturnValue(of(UPDATED));

    load();

    expect(component.mechanicId()).toBe(M2);
    expect(component.bayId()).toBe(B2);
  });

  it('AB-12 disables unchanged assignments', () => {
    load();

    expect(component.canSubmit()).toBe(false);

    component.submit();

    expect(api.assignJob).not.toHaveBeenCalled();
  });

  it('AB-13 enables a valid mechanic-only change', () => {
    load();
    component.changeMechanic(M2);

    expect(component.canSubmit()).toBe(true);
  });

  it('AB-14 enables a valid bay-only change', () => {
    load();
    component.changeBay(B2);

    expect(component.canSubmit()).toBe(true);
  });

  it('AB-15 rejects an off-duty mechanic selection', () => {
    load();
    component.changeMechanic(M3);

    expect(component.canSubmit()).toBe(false);
  });

  it('AB-16 rejects an inactive bay selection', () => {
    load();
    component.changeBay(B3);

    expect(component.canSubmit()).toBe(false);
  });

  it('AB-17 rejects unknown resource IDs', () => {
    load();
    component.changeMechanic('unknown');
    component.changeBay('unknown');

    component.submit();

    expect(component.canSubmit()).toBe(false);
    expect(api.assignJob).not.toHaveBeenCalled();
  });

  it('AB-18 handles resource loading failure', () => {
    api.getBays.mockReturnValue(
      throwError(() => new Error('Network failure')),
    );

    load();

    expect(component.resourceError()).toBeTruthy();
    expect(component.loading()).toBe(false);
    expect(component.canSubmit()).toBe(false);
  });

  it('AB-19 allows retrying failed read-only resource loads', () => {
    api.getBays.mockReturnValue(
      throwError(() => new Error('Network failure')),
    );

    load();

    api.getBays.mockReturnValue(of(BAYS));

    load();

    expect(component.resourceError()).toBeNull();
    expect(component.job()).toEqual(JOB);
  });

  it('AB-20 blocks duplicate resource loading', () => {
    const pending = new Subject<JobSummaryDto>();

    api.getJobDetails.mockReturnValue(pending);

    load();
    load();

    expect(api.getJobDetails).toHaveBeenCalledTimes(1);
    expect(component.loading()).toBe(true);

    pending.next(JOB);
    pending.complete();

    expect(component.loading()).toBe(false);
  });

  it('AB-21 submits the exact job ID and resource payload', () => {
    prepareSubmission();

    component.submit();

    expect(api.assignJob).toHaveBeenCalledExactlyOnceWith(
      JOB_ID,
      { mechanicId: M2, bayId: B2 },
    );
  });

  it('AB-22 verifies updated job details after POST', () => {
    prepareSubmission();

    const assigned = vi.fn();
    component.assigned.subscribe(assigned);

    component.submit();

    expect(api.getJobDetails).toHaveBeenCalledTimes(2);
    expect(component.job()).toEqual(UPDATED);
    expect(component.completed()).toBe(true);
    expect(assigned).toHaveBeenCalledExactlyOnceWith(UPDATED);
  });

  it('AB-23 blocks duplicate mutation submission', () => {
    prepareSubmission();

    const pending = new Subject<JobSummaryDto>();

    api.assignJob.mockReturnValue(pending);

    component.submit();
    component.submit();

    expect(api.assignJob).toHaveBeenCalledTimes(1);
    expect(component.submitting()).toBe(true);

    pending.next(UPDATED);
    pending.complete();
  });

  it('AB-24 blocks close and selection changes during submission', () => {
    prepareSubmission();

    const pending = new Subject<JobSummaryDto>();
    const cancelled = vi.fn();

    component.cancelled.subscribe(cancelled);
    api.assignJob.mockReturnValue(pending);

    component.submit();

    component.close();
    component.changeMechanic(M1);
    component.changeBay(B1);

    expect(cancelled).not.toHaveBeenCalled();
    expect(component.mechanicId()).toBe(M2);
    expect(component.bayId()).toBe(B2);

    pending.next(UPDATED);
    pending.complete();
  });

  it('AB-25 locks when the mutation response mismatches', () => {
    prepareSubmission();

    api.assignJob.mockReturnValue(of({
      ...UPDATED,
      bayId: B1,
    }));

    const assigned = vi.fn();
    component.assigned.subscribe(assigned);

    component.submit();

    expect(component.requiresRefresh()).toBe(true);
    expect(component.canSubmit()).toBe(false);
    expect(assigned).not.toHaveBeenCalled();
  });

  it('AB-26 locks when authoritative read-back mismatches', () => {
    prepareSubmission();

    api.getJobDetails.mockReturnValue(of(JOB));

    const assigned = vi.fn();
    component.assigned.subscribe(assigned);

    component.submit();

    expect(component.requiresRefresh()).toBe(true);
    expect(component.completed()).toBe(false);
    expect(assigned).not.toHaveBeenCalled();
  });

  it('AB-27 locks when post-assignment GET fails', () => {
    prepareSubmission();

    api.getJobDetails.mockReturnValue(
      throwError(() => new Error('Read-back failed')),
    );

    component.submit();

    expect(component.requiresRefresh()).toBe(true);
    expect(component.completed()).toBe(false);
    expect(api.assignJob).toHaveBeenCalledTimes(1);
  });

  it('AB-28 handles empty mutation responses without retry', () => {
    prepareSubmission();

    api.assignJob.mockReturnValue(EMPTY);

    component.submit();
    component.submit();

    expect(component.requiresRefresh()).toBe(true);
    expect(api.assignJob).toHaveBeenCalledTimes(1);
  });

  it('AB-29 requests review after uncertain mutation outcome', () => {
    prepareSubmission();

    api.assignJob.mockReturnValue(
      throwError(() => new Error('Unknown outcome')),
    );

    const refresh = vi.fn();
    const cancelled = vi.fn();

    component.refreshRequired.subscribe(refresh);
    component.cancelled.subscribe(cancelled);

    component.submit();
    component.close();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(cancelled).not.toHaveBeenCalled();
    expect(component.requiresRefresh()).toBe(true);
  });

  it('AB-30 cancels safely before mutation', () => {
    load();

    const cancelled = vi.fn();

    component.cancelled.subscribe(cancelled);

    component.close();

    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(api.assignJob).not.toHaveBeenCalled();
  });
});