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
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { defer, finalize, forkJoin } from 'rxjs';

import { ApiError } from '../../../../core/models/api-error.model';
import { Button } from '../../../../shared/components/button/button';
import { Modal } from '../../../../shared/components/modal/modal';
import { Select } from '../../../../shared/components/select/select';

import {
  BOOKING_MANAGER_NOTE_MAX_LENGTH,
} from '../../models/booking.model';

import type { Booking } from '../../models/booking.model';

import type {
  MechanicRosterDto,
  BayDto,
} from '../../models/booking-support.model';

import {
  BookingActionApiService,
} from '../../services/booking-action-api.service';

import {
  BookingRequestError,
  validateConfirmBookingRequest,
} from '../../utils/booking-action.validator';

import {
  resolveBookingActionError,
} from '../../utils/booking-error.mapper';

@Component({
  selector: 'app-confirm-booking',
  standalone: true,
  imports: [Button, Modal, Select, FormsModule, DatePipe],
  templateUrl: './confirm-booking.html',
  styleUrl: './confirm-booking.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmBooking implements OnInit {
  private readonly api = inject(BookingActionApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly booking = input.required<Booking>();

  readonly confirmed = output<Booking>();
  readonly cancelled = output<void>();
  readonly refreshRequired = output<void>();

  readonly mechanics = signal<readonly MechanicRosterDto[]>([]);
  readonly bays = signal<readonly BayDto[]>([]);

  readonly mechanicId = signal('');
  readonly bayId = signal('');
  readonly note = signal('');

  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly completed = signal(false);
  readonly requiresRefresh = signal(false);

  readonly resourceError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);

  readonly maxNoteLength = BOOKING_MANAGER_NOTE_MAX_LENGTH;

  readonly mechanicOptions = computed(() =>
    this.mechanics().map(mechanic => ({
      value: mechanic.id,
      label: `${mechanic.name} (${mechanic.onDuty ? 'On duty' : 'Off duty'})`,
    })),
  );

  readonly bayOptions = computed(() =>
    this.bays()
      .filter(bay => bay.active)
      .map(bay => ({
        value: bay.id,
        label: bay.name,
      })),
  );

  readonly canSubmit = computed(() =>
    this.booking().status === 'Requested' &&
    !this.loading() &&
    !this.submitting() &&
    !this.completed() &&
    !this.requiresRefresh() &&
    !this.resourceError() &&
    this.mechanicOptions().some(
      option => option.value === this.mechanicId(),
    ) &&
    this.bayOptions().some(
      option => option.value === this.bayId(),
    ) &&
    this.note().length <= this.maxNoteLength,
  );

  ngOnInit(): void {
    this.loadResources();
  }

  loadResources(): void {
    if (
      this.loading() ||
      this.submitting() ||
      this.completed() ||
      this.requiresRefresh() ||
      this.booking().status !== 'Requested'
    ) {
      return;
    }

    this.loading.set(true);
    this.resourceError.set(null);
    this.actionError.set(null);

    this.mechanics.set([]);
    this.bays.set([]);
    this.mechanicId.set('');
    this.bayId.set('');

    defer(() => forkJoin({
      mechanics: this.api.getMechanics(),
      bays: this.api.getBays(),
    }))
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: result => {
          this.mechanics.set(result.mechanics);
          this.bays.set(result.bays);
        },
        error: () => {
          this.resourceError.set(
            'Unable to load mechanics and bays. Please try again.',
          );
        },
      });
  }

  submit(): void {
    if (!this.canSubmit()) {
      return;
    }

    this.actionError.set(null);

    const bookingId = this.booking().id;

    const request = {
      mechanicId: this.mechanicId(),
      bayId: this.bayId(),
      note: this.note(),
    };

    this.submitting.set(true);

    defer(() => this.api.confirmBooking(
      bookingId,
      validateConfirmBookingRequest(request),
    ))
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: booking => {
          if (
            booking.status !== 'Confirmed' ||
            booking.id.toLowerCase() !== bookingId.toLowerCase() ||
            booking.mechanicId?.toLowerCase() !== request.mechanicId.toLowerCase() ||
            booking.bayId?.toLowerCase() !== request.bayId.toLowerCase() ||
            booking.managerNote !== (request.note.trim() || null)
          ) {
            this.requiresRefresh.set(true);
            this.actionError.set(
              'Confirmation could not be verified. Refresh and review the booking.',
            );
            return;
          }

          this.completed.set(true);
          this.confirmed.emit(booking);
        },
        error: (error: unknown) => {
          if (error instanceof BookingRequestError) {
            this.actionError.set(
              'Please review the mechanic, bay and manager note.',
            );
            return;
          }

          this.actionError.set(
            resolveBookingActionError(error),
          );

          const safeCorrection =
            error instanceof ApiError &&
            (
              error.status === 400 ||
              error.status === 422 ||
              error.status === 429 ||
              (
                error.status === 409 &&
                (
                  error.conflictCode === 'mechanic_busy' ||
                  error.conflictCode === 'bay_busy'
                )
              )
            );

          if (!safeCorrection) {
            this.requiresRefresh.set(true);
          }
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
