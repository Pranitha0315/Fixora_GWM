import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { defer, finalize, throwIfEmpty } from 'rxjs';

import { Button } from '../../../../shared/components/button/button';
import { Modal } from '../../../../shared/components/modal/modal';

import type { Booking } from '../../models/booking.model';

import {
  BookingActionApiService,
} from '../../services/booking-action-api.service';

import {
  BookingRequestError,
  validateDeclineBookingRequest,
} from '../../utils/booking-action.validator';

import {
  resolveBookingActionError,
} from '../../utils/booking-error.mapper';

@Component({
  selector: 'app-reject-booking',
  standalone: true,
  imports: [Button, Modal, FormsModule, DatePipe],
  templateUrl: './reject-booking.html',
  styleUrl: './reject-booking.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RejectBooking {
  private readonly api = inject(BookingActionApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly booking = input.required<Booking>();

  readonly rejected = output<Booking>();
  readonly cancelled = output<void>();
  readonly refreshRequired = output<void>();

  readonly reason = signal('');
  readonly submitting = signal(false);
  readonly completed = signal(false);
  readonly requiresRefresh = signal(false);

  readonly actionError = signal<string | null>(null);

  readonly locked = computed(() =>
    this.submitting() ||
    this.completed() ||
    this.requiresRefresh(),
  );

  readonly canSubmit = computed(() =>
    this.booking().status === 'Requested' &&
    this.reason().trim().length > 0 &&
    !this.locked(),
  );

  changeReason(value: string): void {
    if (this.locked()) {
      return;
    }

    this.reason.set(value);
    this.actionError.set(null);
  }

  submit(): void {
    if (!this.canSubmit()) {
      return;
    }

    this.actionError.set(null);

    const bookingId = this.booking().id;
    const reason = this.reason().trim();

    this.submitting.set(true);

    defer(() =>
      this.api.declineBooking(
        bookingId,
        validateDeclineBookingRequest({ reason }),
      ),
    )
      .pipe(
        throwIfEmpty(),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: booking => {
          if (
            booking.id.toLowerCase() !== bookingId.toLowerCase() ||
            booking.status !== 'Declined' ||
            booking.declineReason !== reason
          ) {
            this.requiresRefresh.set(true);
            this.actionError.set(
              'Rejection could not be verified. Refresh and review the booking.',
            );
            return;
          }

          this.completed.set(true);
          this.rejected.emit(booking);
        },
        error: (error: unknown) => {
          if (error instanceof BookingRequestError) {
            this.actionError.set(
              'Please enter a valid rejection reason.',
            );
            return;
          }

          this.requiresRefresh.set(true);
          this.actionError.set(
            resolveBookingActionError(error),
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