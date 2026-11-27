import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';

import type { JobSummaryDto } from '../../../bookings/models/booking-support.model';

import type { AdaptiveQueueJob } from '../../models/adaptive-queue.model';
import { buildAdaptiveQueueSnapshot } from '../../utils/adaptive-queue.mapper';

import {
  ADAPTIVE_QUEUE_ETA_UNAVAILABLE,
  AdaptiveQueueJobCard,
} from './adaptive-queue-job-card';

function makeJob(overrides: Partial<JobSummaryDto> = {}): JobSummaryDto {
  return {
    id: 'job-1',
    number: 'JC-1001',
    customerId: 'customer-1',
    customerName: 'Nimal Perera',
    vehicleId: 'vehicle-1',
    vehicleLabel: 'Toyota Axio CAB-1234',
    mechanicId: 'mechanic-1',
    mechanicName: 'Kasun Silva',
    bayId: 'bay-1',
    bayName: 'Bay 1',
    status: 'Open',
    priority: 0,
    queuePosition: 4,
    etaAt: '2026-11-27T08:30:00Z',
    estimatedMinutes: 60,
    elapsedMinutes: 0,
    createdAt: '2026-11-27T06:00:00Z',
    startedAt: null,
    completedAt: null,
    complaint: null,
    managerNote: null,
    ...overrides,
  };
}

function toItem(job: JobSummaryDto): AdaptiveQueueJob {
  const snapshot = buildAdaptiveQueueSnapshot([job], []);

  return (
    snapshot.waitingJobs[0]
    ?? snapshot.activePhaseJobs[0]
    ?? snapshot.unrecognizedStatusJobs[0]
  );
}

describe('AdaptiveQueueJobCard', () => {
  let fixture: ComponentFixture<AdaptiveQueueJobCard>;

  function render(
    job: JobSummaryDto,
    showQueuePosition = false,
  ): HTMLElement {
    fixture = TestBed.createComponent(AdaptiveQueueJobCard);
    fixture.componentRef.setInput('item', toItem(job));
    fixture.componentRef.setInput('showQueuePosition', showQueuePosition);
    fixture.detectChanges();

    return fixture.nativeElement as HTMLElement;
  }

  function text(host: HTMLElement, selector: string): string {
    return host.querySelector(selector)?.textContent?.trim() ?? '';
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdaptiveQueueJobCard],
    }).compileComponents();
  });

  it('AQJ-01 shows job number, customer, vehicle, mechanic and bay', () => {
    const host = render(makeJob());

    expect(text(host, '.job-card-number')).toBe('JC-1001');
    expect(text(host, '.job-card-customer')).toBe('Nimal Perera');
    expect(text(host, '.job-card-vehicle')).toBe('Toyota Axio CAB-1234');
    expect(text(host, '.job-card-mechanic')).toBe('Kasun Silva');
    expect(text(host, '.job-card-bay')).toBe('Bay 1');
  });

  it('AQJ-02 shows the backend queue position only when requested', () => {
    expect(text(render(makeJob(), true), '.job-card-position'))
      .toBe('Queue #4');
    expect(render(makeJob(), false).querySelector('.job-card-position'))
      .toBeNull();
  });

  it('AQJ-03 formats the backend ETA in Asia/Colombo', () => {
    const host = render(makeJob({ etaAt: '2026-11-27T08:30:00Z' }));

    expect(text(host, '.job-card-eta')).toBe('27 Nov 2026, 14:00');
  });

  it('AQJ-04 shows an explicit unavailable ETA instead of inventing one', () => {
    const host = render(makeJob({ etaAt: null }));

    expect(text(host, '.job-card-eta')).toBe(ADAPTIVE_QUEUE_ETA_UNAVAILABLE);
    expect(host.querySelector('.job-card-eta--unavailable')).not.toBeNull();
  });

  it('AQJ-05 treats an unparsable ETA as unavailable', () => {
    const host = render(makeJob({ etaAt: 'not-a-date' }));

    expect(text(host, '.job-card-eta')).toBe(ADAPTIVE_QUEUE_ETA_UNAVAILABLE);
  });

  it('AQJ-06 labels the ETA as an indicative completion', () => {
    const host = render(makeJob());

    expect(host.textContent).toContain('Indicative completion');
  });

  it('AQJ-07 labels waiting jobs as Waiting', () => {
    const host = render(makeJob({ status: 'Open' }));

    expect(text(host, '.job-card-status')).toBe('Waiting');
    expect(host.querySelector('.job-card')?.getAttribute('data-phase'))
      .toBe('waiting');
  });

  it('AQJ-08 spaces PascalCase active-phase statuses', () => {
    const host = render(makeJob({ status: 'InProgress' }));

    expect(text(host, '.job-card-status')).toBe('In Progress');
    expect(host.querySelector('.job-card')?.getAttribute('data-phase'))
      .toBe('active-phase');
  });

  it('AQJ-09 shows an unrecognized status as received', () => {
    const host = render(makeJob({ status: 'Mystery' }));

    expect(text(host, '.job-card-status')).toBe('Mystery');
    expect(host.querySelector('.job-card')?.getAttribute('data-phase'))
      .toBe('unrecognized');
  });

  it('AQJ-10 shows the priority label', () => {
    expect(text(render(makeJob({ priority: 2 })), '.job-card-priority'))
      .toBe('Urgent priority');
    expect(text(render(makeJob({ priority: 1 })), '.job-card-priority'))
      .toBe('High priority');
    expect(text(render(makeJob({ priority: 0 })), '.job-card-priority'))
      .toBe('Normal priority');
    expect(text(render(makeJob({ priority: 9 })), '.job-card-priority'))
      .toBe('Unknown priority');
  });

  it('AQJ-11 shows explicit text when no mechanic is assigned', () => {
    const host = render(
      makeJob({ mechanicId: null, mechanicName: null }),
    );

    expect(text(host, '.job-card-mechanic')).toBe('No mechanic assigned');
  });

  it('AQJ-12 shows explicit text when a mechanic name is missing', () => {
    const host = render(makeJob({ mechanicName: null }));

    expect(text(host, '.job-card-mechanic'))
      .toBe('Mechanic name unavailable');
  });

  it('AQJ-13 shows explicit text when no bay is assigned', () => {
    const host = render(makeJob({ bayId: null, bayName: null }));

    expect(text(host, '.job-card-bay')).toBe('No bay assigned');
  });

  it('AQJ-14 shows explicit text when a bay name is missing', () => {
    const host = render(makeJob({ bayName: null }));

    expect(text(host, '.job-card-bay')).toBe('Bay name unavailable');
  });

  it('AQJ-15 describes bays only as assignments', () => {
    const host = render(makeJob());

    expect(host.textContent).toContain('Bay assignment');
    expect(host.textContent?.toLowerCase()).not.toContain('occup');
  });

  it('AQJ-16 contains no buttons or links', () => {
    const host = render(makeJob());

    expect(host.querySelector('button')).toBeNull();
    expect(host.querySelector('a')).toBeNull();
  });

  it('AQJ-17 escapes markup in backend text', () => {
    const host = render(
      makeJob({ customerName: '<img src=x onerror=alert(1)>' }),
    );

    expect(host.querySelector('img')).toBeNull();
    expect(text(host, '.job-card-customer'))
      .toBe('<img src=x onerror=alert(1)>');
  });
});
