import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { defer, finalize, forkJoin, throwIfEmpty } from 'rxjs';

import { Button } from '../../../../shared/components/button/button';
import { Modal } from '../../../../shared/components/modal/modal';

import {
  BOOKING_PRIORITIES,
} from '../../models/booking.model';

import type {
  BookingPriority,
} from '../../models/booking.model';

import type {
  WalkInRequest,
} from '../../models/booking-action.model';

import type {
  MechanicRosterDto,
  BayDto,
  ServiceDto,
  JobSummaryDto,
} from '../../models/booking-support.model';

import {
  BookingActionApiService,
} from '../../services/booking-action-api.service';

import {
  validateWalkInRequest,
} from '../../utils/booking-action.validator';

import {
  resolveBookingActionError,
} from '../../utils/booking-error.mapper';

const EMPTY_ID = '00000000-0000-0000-0000-000000000000';

@Component({
  selector: 'app-walk-in-booking',
  standalone: true,
  imports: [Button, Modal, FormsModule, DatePipe],
  templateUrl: './walk-in-booking.html',
  styleUrl: './walk-in-booking.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalkInBooking implements OnInit {
  private readonly api = inject(BookingActionApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly created = output<JobSummaryDto>();
  readonly cancelled = output<void>();
  readonly refreshRequired = output<void>();

  readonly customerName = signal('');
  readonly vehicleLabel = signal('');
  readonly serviceId = signal('');
  readonly mechanicId = signal('');
  readonly bayId = signal('');
  readonly priority = signal<BookingPriority>(0);
  readonly complaint = signal('');

  readonly services = signal<readonly ServiceDto[]>([]);
  readonly mechanics = signal<readonly MechanicRosterDto[]>([]);
  readonly bays = signal<readonly BayDto[]>([]);

  readonly priorities = BOOKING_PRIORITIES;

  readonly loading = signal(false);
  readonly resourcesLoaded = signal(false);
  readonly submitting = signal(false);
  readonly requiresRefresh = signal(false);

  readonly resourceError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly createdJob = signal<JobSummaryDto | null>(null);

  readonly onDutyMechanics = computed(() =>
    this.mechanics().filter(item => item.onDuty),
  );

  readonly activeBays = computed(() =>
    this.bays().filter(item => item.active),
  );

  readonly locked = computed(() =>
    this.submitting() ||
    this.requiresRefresh() ||
    this.createdJob() !== null,
  );

  readonly canSubmit = computed(() =>
    this.resourcesLoaded() &&
    !this.loading() &&
    !this.locked() &&
    !this.resourceError() &&
    this.customerName().trim().length > 0 &&
    this.vehicleLabel().trim().length > 0 &&
    this.services().some(item => item.id === this.serviceId()) &&
    this.onDutyMechanics().some(item => item.id === this.mechanicId()) &&
    this.activeBays().some(item => item.id === this.bayId()) &&
    this.priorities.some(item => item.value === this.priority()),
  );

  ngOnInit(): void {
    this.loadResources();
  }

  loadResources(): void {
    if (this.loading() || this.locked()) {
      return;
    }

    this.loading.set(true);
    this.resourcesLoaded.set(false);
    this.resourceError.set(null);

    this.services.set([]);
    this.mechanics.set([]);
    this.bays.set([]);

    this.serviceId.set('');
    this.mechanicId.set('');
    this.bayId.set('');

    defer(() =>
      forkJoin({
        services: this.api.getServices(),
        mechanics: this.api.getMechanics(),
        bays: this.api.getBays(),
      }),
    )
      .pipe(
        throwIfEmpty(() => new Error('Missing resources')),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: result => {
          this.services.set(result.services);
          this.mechanics.set(result.mechanics);
          this.bays.set(result.bays);
          this.resourcesLoaded.set(true);
        },
        error: () => {
          this.resourceError.set(
            'Unable to load workshop resources. Please try again.',
          );
        },
      });
  }

  changePriority(value: unknown): void {
    if (this.locked()) {
      return;
    }

    const selected = this.priorities.find(
      item => item.value === value,
    );

    if (selected) {
      this.priority.set(selected.value);
    }
  }

  submit(): void {
    if (!this.canSubmit()) {
      return;
    }

    let request: WalkInRequest;

    try {
      request = validateWalkInRequest({
        customerId: null,
        customerName: this.customerName(),
        vehicleId: null,
        vehicleLabel: this.vehicleLabel(),
        serviceId: this.serviceId(),
        mechanicId: this.mechanicId(),
        bayId: this.bayId(),
        priority: this.priority(),
        complaint: this.complaint(),
      });
    } catch {
      this.actionError.set(
        'Please review the required walk-in details.',
      );
      return;
    }

    this.actionError.set(null);
    this.submitting.set(true);

    defer(() => this.api.createWalkIn(request))
      .pipe(
        throwIfEmpty(() => new Error('Missing creation response')),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: job => {
          if (!this.matchesRequest(job, request)) {
            this.requiresRefresh.set(true);
            this.actionError.set(
              'Creation could not be verified. Review bookings and job cards before creating another walk-in.',
            );
            return;
          }

          this.createdJob.set(job);
        },
        error: (error: unknown) => {
          this.requiresRefresh.set(true);
          this.actionError.set(
            resolveBookingActionError(error),
          );
        },
      });
  }

  private matchesRequest(
    job: JobSummaryDto,
    request: WalkInRequest,
  ): boolean {
    return (
      job.id !== EMPTY_ID &&
      job.number.trim().length > 0 &&
      job.customerId === EMPTY_ID &&
      job.vehicleId === EMPTY_ID &&
      job.customerName === request.customerName &&
      job.vehicleLabel === request.vehicleLabel &&
      job.mechanicId?.toLowerCase() === request.mechanicId.toLowerCase() &&
      job.bayId?.toLowerCase() === request.bayId.toLowerCase() &&
      job.priority === request.priority &&
      job.complaint === request.complaint &&
      job.status === 'Open'
    );
  }

  close(): void {
    if (this.submitting()) {
      return;
    }

    const job = this.createdJob();

    if (job) {
      this.created.emit(job);
      return;
    }

    if (this.requiresRefresh()) {
      this.refreshRequired.emit();
      return;
    }

    this.cancelled.emit();
  }
}
