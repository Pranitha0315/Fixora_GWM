import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY, of, Subject, throwError } from 'rxjs';

import { WalkInBooking } from './walk-in-booking';
import { ApiError } from '../../../../core/models/api-error.model';
import { BookingActionApiService } from '../../services/booking-action-api.service';

import type {
  MechanicRosterDto,
  BayDto,
  ServiceDto,
  JobSummaryDto,
} from '../../models/booking-support.model';

const EMPTY_ID = '00000000-0000-0000-0000-000000000000';
const SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const MECHANIC_ID = '22222222-2222-4222-8222-222222222222';
const OFF_DUTY_ID = '33333333-3333-4333-8333-333333333333';
const BAY_ID = '44444444-4444-4444-8444-444444444444';
const INACTIVE_BAY_ID = '55555555-5555-4555-8555-555555555555';
const JOB_ID = '66666666-6666-4666-8666-666666666666';

const SERVICES: ServiceDto[] = [{
  id: SERVICE_ID,
  name: 'General Service',
  category: 'Maintenance',
  standardMinutes: 60,
  basePrice: 2500,
}];

const MECHANICS: MechanicRosterDto[] = [
  {
    id: MECHANIC_ID,
    name: 'Mechanic One',
    phone: '0770000000',
    employeeCode: 'EMP-001',
    onDuty: true,
    activeJobs: 2,
  },
  {
    id: OFF_DUTY_ID,
    name: 'Mechanic Two',
    phone: '0770000001',
    employeeCode: 'EMP-002',
    onDuty: false,
    activeJobs: 0,
  },
];

const BAYS: BayDto[] = [
  { id: BAY_ID, name: 'Bay One', active: true },
  { id: INACTIVE_BAY_ID, name: 'Bay Two', active: false },
];

const JOB: JobSummaryDto = {
  id: JOB_ID,
  number: 'JOB-001',
  customerId: EMPTY_ID,
  customerName: 'Test Customer',
  vehicleId: EMPTY_ID,
  vehicleLabel: 'Toyota Prius',
  mechanicId: MECHANIC_ID,
  mechanicName: 'Mechanic One',
  bayId: BAY_ID,
  bayName: 'Bay One',
  status: 'Open',
  priority: 0,
  queuePosition: 2,
  etaAt: '2099-01-05T05:30:00Z',
  estimatedMinutes: 60,
  elapsedMinutes: 0,
  createdAt: '2099-01-05T04:30:00Z',
  startedAt: null,
  completedAt: null,
  complaint: null,
  managerNote: null,
};

describe('WalkInBooking', () => {
  let fixture: ComponentFixture<WalkInBooking>;
  let component: WalkInBooking;

  const api = {
    getServices: vi.fn(),
    getMechanics: vi.fn(),
    getBays: vi.fn(),
    createWalkIn: vi.fn(),
  };

  function create(): void {
    fixture = TestBed.createComponent(WalkInBooking);
    component = fixture.componentInstance;
    component.ngOnInit();
  }

  function fillValid(): void {
    component.customerName.set('Test Customer');
    component.vehicleLabel.set('Toyota Prius');
    component.serviceId.set(SERVICE_ID);
    component.mechanicId.set(MECHANIC_ID);
    component.bayId.set(BAY_ID);
  }

  function expectBlocked(): void {
    expect(component.canSubmit()).toBe(false);
    component.submit();
    expect(api.createWalkIn).not.toHaveBeenCalled();
  }

  function expectUnverified(): void {
    expect(component.createdJob()).toBeNull();
    expect(component.requiresRefresh()).toBe(true);
    expect(component.canSubmit()).toBe(false);
    expect(component.actionError()).toBeTruthy();
    component.submit();
    expect(api.createWalkIn).toHaveBeenCalledTimes(1);
  }

  beforeEach(async () => {
    vi.resetAllMocks();

    api.getServices.mockReturnValue(of(SERVICES));
    api.getMechanics.mockReturnValue(of(MECHANICS));
    api.getBays.mockReturnValue(of(BAYS));
    api.createWalkIn.mockReturnValue(of(JOB));

    await TestBed.configureTestingModule({
      imports: [WalkInBooking],
      providers: [{
        provide: BookingActionApiService,
        useValue: api,
      }],
    }).compileComponents();
  });

  it('WI01 loads all three resource collections', () => {
    create();
    expect(api.getServices).toHaveBeenCalledTimes(1);
    expect(api.getMechanics).toHaveBeenCalledTimes(1);
    expect(api.getBays).toHaveBeenCalledTimes(1);
    expect(component.services()).toEqual(SERVICES);
    expect(component.mechanics()).toEqual(MECHANICS);
    expect(component.bays()).toEqual(BAYS);
    expect(component.resourcesLoaded()).toBe(true);
    expect(component.loading()).toBe(false);
  });

  it('WI02 blocks submission during resource loading', () => {
    const pending = new Subject<ServiceDto[]>();
    api.getServices.mockReturnValue(pending);
    create();
    fillValid();
    expect(component.loading()).toBe(true);
    expectBlocked();
    pending.next(SERVICES);
    pending.complete();
    expect(component.resourcesLoaded()).toBe(true);
    expect(component.loading()).toBe(false);
  });

  it('WI03 handles resource failure and retries safely', () => {
    api.getMechanics.mockReturnValue(
      throwError(() => new Error('Private error')),
    );
    create();
    expect(component.resourceError()).toBeTruthy();
    expect(component.resourceError()).not.toContain('Private error');
    expect(component.resourcesLoaded()).toBe(false);
    expectBlocked();

    api.getMechanics.mockReturnValue(of(MECHANICS));
    component.loadResources();

    expect(component.resourceError()).toBeNull();
    expect(component.resourcesLoaded()).toBe(true);
    expect(api.getMechanics).toHaveBeenCalledTimes(2);
  });

  it('WI04 rejects missing resource emissions', () => {
    api.getBays.mockReturnValue(EMPTY);
    create();
    expect(component.resourceError()).toBeTruthy();
    expect(component.loading()).toBe(false);
    expectBlocked();
  });

  it('WI05 prevents concurrent resource loading', () => {
    const pending = new Subject<ServiceDto[]>();
    api.getServices.mockReturnValue(pending);
    create();
    component.loadResources();
    expect(api.getServices).toHaveBeenCalledTimes(1);
    pending.next(SERVICES);
    pending.complete();
  });

  it('WI06 rejects empty customer name', () => {
    create();
    fillValid();
    component.customerName.set('');
    expectBlocked();
  });

  it('WI07 rejects whitespace customer name', () => {
    create();
    fillValid();
    component.customerName.set('   ');
    expectBlocked();
  });

  it('WI08 rejects empty vehicle details', () => {
    create();
    fillValid();
    component.vehicleLabel.set('');
    expectBlocked();
  });

  it('WI09 rejects whitespace vehicle details', () => {
    create();
    fillValid();
    component.vehicleLabel.set('   ');
    expectBlocked();
  });

  it('WI10 excludes off-duty mechanics', () => {
    create();
    expect(component.onDutyMechanics()).toEqual([MECHANICS[0]]);
    fillValid();
    component.mechanicId.set(OFF_DUTY_ID);
    expectBlocked();
  });

  it('WI11 excludes inactive bays', () => {
    create();
    expect(component.activeBays()).toEqual([BAYS[0]]);
    fillValid();
    component.bayId.set(INACTIVE_BAY_ID);
    expectBlocked();
  });

  it('WI12 rejects unknown service', () => {
    create();
    fillValid();
    component.serviceId.set('unknown');
    expectBlocked();
  });

  it('WI13 rejects unknown mechanic', () => {
    create();
    fillValid();
    component.mechanicId.set('unknown');
    expectBlocked();
  });

  it('WI14 rejects unknown bay', () => {
    create();
    fillValid();
    component.bayId.set('unknown');
    expectBlocked();
  });

  it('WI15 defaults to Normal priority', () => {
    create();
    expect(component.priority()).toBe(0);
    expect(component.priorities).toEqual([
      { value: 0, label: 'Normal' },
      { value: 1, label: 'High' },
      { value: 2, label: 'Urgent' },
    ]);
  });

  it('WI16 accepts High priority', () => {
    create();
    component.changePriority(1);
    expect(component.priority()).toBe(1);
  });

  it('WI17 accepts Urgent priority', () => {
    create();
    component.changePriority(2);
    expect(component.priority()).toBe(2);
  });

  it('WI18 ignores invalid priority values', () => {
    create();
    component.changePriority(1);
    for (const value of [999, -1, 3, '2', null, undefined]) {
      component.changePriority(value);
      expect(component.priority()).toBe(1);
    }
  });

  it('WI19 sends the exact unlinked walk-in request', () => {
    create();
    fillValid();
    expect(component.canSubmit()).toBe(true);
    component.submit();

    expect(api.createWalkIn).toHaveBeenCalledWith({
      customerId: null,
      customerName: 'Test Customer',
      vehicleId: null,
      vehicleLabel: 'Toyota Prius',
      serviceId: SERVICE_ID,
      mechanicId: MECHANIC_ID,
      bayId: BAY_ID,
      priority: 0,
      complaint: null,
    });
    expect(component.createdJob()).toEqual(JOB);
  });

  it('WI20 trims customer, vehicle and complaint', () => {
    api.createWalkIn.mockReturnValue(
      of({ ...JOB, complaint: 'Brake noise' }),
    );
    create();
    fillValid();
    component.customerName.set('  Test Customer  ');
    component.vehicleLabel.set('  Toyota Prius  ');
    component.complaint.set('  Brake noise  ');
    component.submit();

    expect(api.createWalkIn).toHaveBeenCalledWith(
      expect.objectContaining({
        customerName: 'Test Customer',
        vehicleLabel: 'Toyota Prius',
        complaint: 'Brake noise',
      }),
    );
    expect(component.createdJob()).not.toBeNull();
  });

  it('WI21 normalizes whitespace complaint to null', () => {
    create();
    fillValid();
    component.complaint.set('   ');
    component.submit();
    expect(api.createWalkIn).toHaveBeenCalledWith(
      expect.objectContaining({ complaint: null }),
    );
  });

  it('WI22 sends Urgent priority in the request', () => {
    api.createWalkIn.mockReturnValue(of({ ...JOB, priority: 2 }));
    create();
    fillValid();
    component.changePriority(2);
    component.submit();

    expect(api.createWalkIn).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 2 }),
    );
    expect(component.createdJob()?.priority).toBe(2);
  });

  it('WI23 prevents duplicate pending submission', () => {
    const pending = new Subject<JobSummaryDto>();
    api.createWalkIn.mockReturnValue(pending);
    create();
    fillValid();
    component.submit();
    component.submit();

    expect(api.createWalkIn).toHaveBeenCalledTimes(1);
    expect(component.submitting()).toBe(true);
    expect(component.locked()).toBe(true);

    pending.next(JOB);
    pending.complete();

    expect(component.submitting()).toBe(false);
    expect(component.createdJob()).toEqual(JOB);
  });

  it('WI24 prevents another submission after success', () => {
    create();
    fillValid();
    component.submit();
    component.submit();
    expect(api.createWalkIn).toHaveBeenCalledTimes(1);
    expect(component.canSubmit()).toBe(false);
  });

  it('WI25 prevents resubmission after uncertain failure', () => {
    api.createWalkIn.mockReturnValue(
      throwError(() => new Error('Unknown outcome')),
    );
    create();
    fillValid();
    component.submit();
    expectUnverified();
  });

  it('WI26 preserves verified job number, queue and ETA', () => {
    create();
    fillValid();
    component.submit();

    expect(component.createdJob()?.number).toBe('JOB-001');
    expect(component.createdJob()?.queuePosition).toBe(2);
    expect(component.createdJob()?.etaAt).toBe(JOB.etaAt);
    expect(component.requiresRefresh()).toBe(false);
  });

  it('WI27 rejects empty job identity or number', () => {
    create();
    fillValid();
    api.createWalkIn.mockReturnValue(
      of({ ...JOB, id: EMPTY_ID }),
    );
    component.submit();
    expectUnverified();
  });

  it('WI28 rejects mismatched customer or vehicle identity', () => {
    create();
    fillValid();
    api.createWalkIn.mockReturnValue(
      of({ ...JOB, customerId: JOB_ID }),
    );
    component.submit();
    expectUnverified();
  });

  it('WI29 rejects mismatched resource assignments', () => {
    create();
    fillValid();
    api.createWalkIn.mockReturnValue(
      of({ ...JOB, mechanicId: OFF_DUTY_ID }),
    );
    component.submit();
    expectUnverified();
  });

  it('WI30 rejects mismatched priority', () => {
    create();
    fillValid();
    api.createWalkIn.mockReturnValue(
      of({ ...JOB, priority: 2 }),
    );
    component.submit();
    expectUnverified();
  });

  it('WI31 rejects unexpected job status', () => {
    create();
    fillValid();
    api.createWalkIn.mockReturnValue(
      of({ ...JOB, status: 'Completed' }),
    );
    component.submit();
    expectUnverified();
  });

  it('WI32 handles network failure without retry', () => {
    api.createWalkIn.mockReturnValue(
      throwError(() => new ApiError(
        0, 'NETWORK_ERROR', 'Private network details',
      )),
    );
    create();
    fillValid();
    component.submit();

    expect(component.actionError()).toContain('Connection lost');
    expectUnverified();
  });

  it('WI33 hides internal server error details', () => {
    api.createWalkIn.mockReturnValue(
      throwError(() => new ApiError(
        500, 'SERVER_ERROR', 'Sensitive server details',
      )),
    );
    create();
    fillValid();
    component.submit();

    expect(component.actionError()).not.toContain('Sensitive server details');
    expectUnverified();
  });

  it('WI34 handles conflict without automatic retry', () => {
    api.createWalkIn.mockReturnValue(
      throwError(() => new ApiError(
        409, 'CONFLICT', 'Raw conflict', 'bay_busy',
      )),
    );
    create();
    fillValid();
    component.submit();

    expect(component.actionError()).toContain('Selected bay');
    expectUnverified();
  });

  it('WI35 treats an empty creation response as uncertain', () => {
    api.createWalkIn.mockReturnValue(EMPTY);
    create();
    fillValid();
    component.submit();

    expect(component.submitting()).toBe(false);
    expectUnverified();
  });

  it('WI36 rejects malformed selected resource before API', () => {
    api.getServices.mockReturnValue(
      of([{ ...SERVICES[0], id: 'invalid-id' }]),
    );
    create();
    fillValid();
    component.serviceId.set('invalid-id');
    component.submit();

    expect(component.actionError()).toContain('review');
    expect(api.createWalkIn).not.toHaveBeenCalled();
    expect(component.submitting()).toBe(false);
  });

  it('WI37 emits cancellation before submission', () => {
    create();
    const cancelled = vi.spyOn(component.cancelled, 'emit');
    component.close();
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(api.createWalkIn).not.toHaveBeenCalled();
  });

  it('WI38 blocks close and priority changes while pending', () => {
    const pending = new Subject<JobSummaryDto>();
    api.createWalkIn.mockReturnValue(pending);
    create();
    fillValid();

    const cancelled = vi.spyOn(component.cancelled, 'emit');
    const created = vi.spyOn(component.created, 'emit');
    const refresh = vi.spyOn(component.refreshRequired, 'emit');

    component.submit();
    component.close();
    component.changePriority(2);

    expect(cancelled).not.toHaveBeenCalled();
    expect(created).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(component.priority()).toBe(0);

    pending.next(JOB);
    pending.complete();
  });

  it('WI39 emits verified job only when closing success', () => {
    create();
    fillValid();

    const created = vi.spyOn(component.created, 'emit');
    const cancelled = vi.spyOn(component.cancelled, 'emit');

    component.submit();
    expect(created).not.toHaveBeenCalled();

    component.close();
    expect(created).toHaveBeenCalledTimes(1);
    expect(created).toHaveBeenCalledWith(JOB);
    expect(cancelled).not.toHaveBeenCalled();
  });

  it('WI40 emits review requirement after uncertain outcome', () => {
    api.createWalkIn.mockReturnValue(EMPTY);
    create();
    fillValid();

    const refresh = vi.spyOn(component.refreshRequired, 'emit');
    const created = vi.spyOn(component.created, 'emit');
    const cancelled = vi.spyOn(component.cancelled, 'emit');

    component.submit();
    component.close();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(created).not.toHaveBeenCalled();
    expect(cancelled).not.toHaveBeenCalled();
  });
});