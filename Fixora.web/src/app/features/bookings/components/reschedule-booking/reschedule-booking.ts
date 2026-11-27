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
import type { SlotDto } from '../../models/booking-support.model';

import {
  BookingActionApiService,
} from '../../services/booking-action-api.service';

import {
  BookingRequestError,
  validateBookingSlotQuery,
  validateRescheduleRequest,
} from '../../utils/booking-action.validator';

import {
  resolveBookingActionError,
} from '../../utils/booking-error.mapper';

@Component({
  selector: 'app-reschedule-booking',
  standalone: true,
  imports: [Button, Modal, FormsModule, DatePipe],
  templateUrl: './reschedule-booking.html',
  styleUrl: './reschedule-booking.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RescheduleBooking {
  private readonly api = inject(BookingActionApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly booking = input.required<Booking>();

  readonly rescheduled = output<Booking>();
  readonly cancelled = output<void>();
  readonly refreshRequired = output<void>();

  readonly selectedDate = signal('');
  readonly selectedSlot = signal('');
  readonly slots = signal<readonly SlotDto[]>([]);

  readonly loadingSlots = signal(false);
  readonly slotsLoaded = signal(false);
  readonly submitting = signal(false);
  readonly completed = signal(false);
  readonly requiresRefresh = signal(false);

  readonly slotError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);

  readonly minimumDate = new Date(
    Date.now() + 330 * 60_000,
  ).toISOString().slice(0, 10);

  readonly eligible = computed(() =>
    this.booking().status === 'Requested' ||
    this.booking().status === 'Confirmed',
  );

  readonly locked = computed(() =>
    this.submitting() ||
    this.completed() ||
    this.requiresRefresh(),
  );

  readonly canLoadSlots = computed(() =>
    this.eligible() &&
    !this.locked() &&
    !this.loadingSlots() &&
    this.selectedDate() >= this.minimumDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(this.selectedDate()),
  );

  readonly canSubmit = computed(() =>
    this.eligible() &&
    !this.locked() &&
    !this.loadingSlots() &&
    this.slotsLoaded() &&
    this.slots().some(
      slot => slot.start === this.selectedSlot(),
    ) &&
    Date.parse(this.selectedSlot()) >
      Date.now() &&
    Date.parse(this.selectedSlot()) !==
      Date.parse(this.booking().slotStart),
  );

  changeDate(value: string): void {
    if (this.locked() || this.loadingSlots()) {
      return;
    }

    this.selectedDate.set(value);
    this.selectedSlot.set('');
    this.slots.set([]);
    this.slotsLoaded.set(false);
    this.slotError.set(null);
    this.actionError.set(null);
  }

  changeSlot(value: string): void {
    if (this.locked() || this.loadingSlots()) {
      return;
    }

    this.selectedSlot.set(
      this.slots().some(slot => slot.start === value)
        ? value
        : '',
    );

    this.actionError.set(null);
  }

  loadSlots(): void {
    if (!this.canLoadSlots()) {
      return;
    }

    const date = this.selectedDate();
    const booking = this.booking();

    this.selectedSlot.set('');
    this.slots.set([]);
    this.slotsLoaded.set(false);
    this.slotError.set(null);
    this.actionError.set(null);
    this.loadingSlots.set(true);

    defer(() =>
      this.api.getSlots(
        validateBookingSlotQuery({
          date,
          serviceId: booking.serviceId,
        }),
      ),
    )
      .pipe(
        throwIfEmpty(),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loadingSlots.set(false)),
      )
      .subscribe({
        next: slots => {
          const validSlots = slots.filter(slot => {
            const start = Date.parse(slot.start);

            if (
              !Number.isFinite(start) ||
              start <= Date.now() ||
              start === Date.parse(booking.slotStart) ||
              slot.freeBays < 1
            ) {
              return false;
            }

            try {
              validateRescheduleRequest({
                slotStart: slot.start,
              });

              const localDate = new Date(
                start + 330 * 60_000,
              ).toISOString().slice(0, 10);

              return localDate === date;
            } catch {
              return false;
            }
          });

          this.slots.set(validSlots);
          this.slotsLoaded.set(true);
        },
        error: () => {
          this.slotError.set(
            'Unable to load time slots. Please try loading slots again.',
          );
        },
      });
  }

  submit(): void {
    if (!this.canSubmit()) {
      return;
    }

    const booking = this.booking();
    const slotStart = this.selectedSlot();

    this.actionError.set(null);
    this.submitting.set(true);

    defer(() =>
      this.api.rescheduleBooking(
        booking.id,
        validateRescheduleRequest({ slotStart }),
      ),
    )
      .pipe(
        throwIfEmpty(),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: updated => {
          const originalDuration =
            Date.parse(booking.slotEnd) -
            Date.parse(booking.slotStart);

          const updatedDuration =
            Date.parse(updated.slotEnd) -
            Date.parse(updated.slotStart);

          if (
            updated.id.toLowerCase() !==
              booking.id.toLowerCase() ||
            updated.status !== booking.status ||
            Date.parse(updated.slotStart) !==
              Date.parse(slotStart) ||
            !Number.isFinite(originalDuration) ||
            originalDuration <= 0 ||
            updatedDuration !== originalDuration
          ) {
            this.requiresRefresh.set(true);
            this.actionError.set(
              'Reschedule result could not be verified. Refresh and review the booking.',
            );
            return;
          }

          this.completed.set(true);
          this.rescheduled.emit(updated);
        },
        error: (error: unknown) => {
          if (error instanceof BookingRequestError) {
            this.actionError.set(
              'Please select a valid appointment time.',
            );
            return;
          }

          this.requiresRefresh.set(true);

          this.actionError.set(
            'Reschedule could not be confirmed. ' +
            'Refresh the booking and review the selected time ' +
            'before attempting another change. ' +
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