import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  defer,
  finalize,
  forkJoin,
  switchMap,
  throwIfEmpty,
  tap,
} from 'rxjs';

import { Booking } from '../../models/booking.model';
import {
  BayDto,
  JobSummaryDto,
  MechanicRosterDto,
} from '../../models/booking-support.model';
import { BookingActionApiService } from '../../services/booking-action-api.service';
import { validateAssignJobRequest } from '../../utils/booking-action.validator';
import { resolveBookingActionError } from '../../utils/booking-error.mapper';

@Component({
  selector: 'app-assign-booking',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './assign-booking.html',
  styleUrl: './assign-booking.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssignBooking implements OnInit {
  private readonly api = inject(BookingActionApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly booking = input.required<Booking>();

  readonly assigned = output<JobSummaryDto>();
  readonly cancelled = output<void>();
  readonly refreshRequired = output<void>();

  readonly job = signal<JobSummaryDto | null>(null);
  readonly mechanics = signal<readonly MechanicRosterDto[]>([]);
  readonly bays = signal<readonly BayDto[]>([]);

  readonly mechanicId = signal('');
  readonly bayId = signal('');

  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly completed = signal(false);
  readonly requiresRefresh = signal(false);

  readonly resourceError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);

  readonly locked = computed(() =>
    this.loading() ||
    this.submitting() ||
    this.completed() ||
    this.requiresRefresh()
  );

  readonly availableMechanics = computed(() =>
    this.mechanics().filter(mechanic => mechanic.onDuty)
  );

  readonly availableBays = computed(() =>
    this.bays().filter(bay => bay.active)
  );

  private isEligibleJob(job: JobSummaryDto): boolean {
    return job.status === 'Open';
  }

  readonly canSubmit = computed(() => {
    const job = this.job();

    if (
      !job ||
      this.locked() ||
      this.resourceError() ||
      !this.isEligibleJob(job) ||
      this.booking().status !== 'CheckedIn'
    ) {
      return false;
    }

    const mechanicId = this.mechanicId();
    const bayId = this.bayId();

    return (
      this.availableMechanics().some(
        mechanic => mechanic.id === mechanicId
      ) &&
      this.availableBays().some(
        bay => bay.id === bayId
      ) &&
      (
        job.mechanicId !== mechanicId ||
        job.bayId !== bayId
      )
    );
  });

  ngOnInit(): void {
    this.loadResources();
  }

  loadResources(): void {
    if (this.locked()) {
      return;
    }

    const booking = this.booking();
    const jobId = booking.jobCardId;

    this.resourceError.set(null);
    this.actionError.set(null);
    this.job.set(null);
    this.mechanics.set([]);
    this.bays.set([]);
    this.mechanicId.set('');
    this.bayId.set('');

    if (!jobId || booking.status !== 'CheckedIn') {
      this.resourceError.set(
        'This booking has no eligible checked-in job card.'
      );
      return;
    }

    this.loading.set(true);

    defer(() => forkJoin({
      job: this.api.getJobDetails(jobId),
      mechanics: this.api.getMechanics(),
      bays: this.api.getBays(),
    })).pipe(
      throwIfEmpty(),
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.loading.set(false)),
    ).subscribe({
      next: result => {
        if (
          result.job.id.toLowerCase() !== jobId.toLowerCase() ||
          result.job.customerId.toLowerCase() !==
            booking.customerId.toLowerCase() ||
          result.job.vehicleId.toLowerCase() !==
            booking.vehicleId.toLowerCase()
        ) {
          this.resourceError.set(
            'Job identity could not be verified.'
          );
          return;
        }

        this.job.set(result.job);
        this.mechanics.set(result.mechanics);
        this.bays.set(result.bays);

        this.mechanicId.set(result.job.mechanicId ?? '');
        this.bayId.set(result.job.bayId ?? '');

        if (!this.isEligibleJob(result.job)) {
          this.resourceError.set(
            'Assignment is currently limited to open job cards.'
          );
        }
      },
      error: () => {
        this.resourceError.set(
          'Unable to load current job details and resources.'
        );
      },
    });
  }

  changeMechanic(value: string): void {
    if (!this.locked()) {
      this.mechanicId.set(value);
      this.actionError.set(null);
    }
  }

  changeBay(value: string): void {
    if (!this.locked()) {
      this.bayId.set(value);
      this.actionError.set(null);
    }
  }

  submit(): void {
    if (!this.canSubmit()) {
      return;
    }

    const original = this.job();

    if (!original) {
      return;
    }

    const mechanicId = this.mechanicId();
    const bayId = this.bayId();

    const matchesAssignment = (job: JobSummaryDto): boolean =>
      job.id.toLowerCase() === original.id.toLowerCase() &&
      job.customerId === original.customerId &&
      job.vehicleId === original.vehicleId &&
      job.status === original.status &&
      job.mechanicId === mechanicId &&
      job.bayId === bayId;

    this.actionError.set(null);
    this.submitting.set(true);

    defer(() => {
      const request = validateAssignJobRequest({
        mechanicId,
        bayId,
      });

      return this.api.assignJob(original.id, request);
    }).pipe(
      throwIfEmpty(),
      tap(result => {
        if (!matchesAssignment(result)) {
          throw new Error('Assignment response mismatch');
        }
      }),
      switchMap(() =>
        this.api.getJobDetails(original.id)
      ),
      throwIfEmpty(),
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.submitting.set(false)),
    ).subscribe({
      next: updated => {
        if (!matchesAssignment(updated)) {
          this.requiresRefresh.set(true);
          this.actionError.set(
            'Updated assignment could not be verified. Review the job before retrying.'
          );
          return;
        }

        this.job.set(updated);
        this.completed.set(true);
        this.assigned.emit(updated);
      },
      error: error => {
        this.requiresRefresh.set(true);
        this.actionError.set(
          resolveBookingActionError(error) +
          ' Review current job details before attempting another assignment.'
        );
      },
    });
  }

  close(): void {
    if (this.submitting() || this.completed()) {
      return;
    }

    if (this.requiresRefresh()) {
      this.refreshRequired.emit();
      return;
    }

    this.cancelled.emit();
  }
}