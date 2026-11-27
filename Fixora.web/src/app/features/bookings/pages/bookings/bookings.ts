import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import type {
  OnInit,
  TemplateRef,
} from '@angular/core';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { defer, finalize } from 'rxjs';

import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Input } from '../../../../shared/components/input/input';
import { Select } from '../../../../shared/components/select/select';

import { ApiError } from '../../../../core/models/api-error.model';

import { Button } from '../../../../shared/components/button/button';
import { DataTable } from '../../../../shared/components/data-table/data-table';
import { StatusBadge } from '../../../../shared/components/status-badge/status-badge';
import { LoadingState } from '../../../../shared/components/loading-state/loading-state';
import { ErrorState } from '../../../../shared/components/error-state/error-state';
import { Modal } from '../../../../shared/components/modal/modal';

import type {
  DataTableAction,
  DataTableActionEvent,
  DataTableCellContext,
  DataTableColumn,
  DataTableFilterOption,
} from '../../../../shared/components/data-table/data-table.models';

import type {
  StatusBadgeTone,
} from '../../../../shared/components/status-badge/status-badge';

import {
  BOOKING_STATUSES,
} from '../../models/booking.model';

import type {
  Booking,
  BookingList,
  BookingStatus,
} from '../../models/booking.model';

import { BookingApiService } from '../../services/booking-api.service';
import { ConfirmBooking } from '../../components/confirm-booking/confirm-booking';
import { RejectBooking } from '../../components/reject-booking/reject-booking';
import { RescheduleBooking } from '../../components/reschedule-booking/reschedule-booking';
import { AssignBooking } from '../../components/assign-booking/assign-booking';
import { WalkInBooking } from '../../components/walk-in-booking/walk-in-booking';
import { BookingCalendar } from '../../components/booking-calendar/booking-calendar';
import type { JobSummaryDto } from '../../models/booking-support.model';
import { ToastService } from '../../../../shared/services/toast.service';

import {
  BookingResponseError,
} from '../../utils/booking-response.validator';

const STATUS_TONES: Record<BookingStatus, StatusBadgeTone> = {
  Requested: 'warning',
  Confirmed: 'info',
  Declined: 'danger',
  Cancelled: 'neutral',
  CheckedIn: 'primary',
  Completed: 'success',
  NoShow: 'danger',
};

const COLUMNS: readonly DataTableColumn<Booking>[] = [
  {
    key: 'customer',
    header: 'Customer',
    value: row => row.customerName,
    sortable: true,
  },
  {
    key: 'vehicle',
    header: 'Vehicle',
    value: row => row.vehicleLabel,
    sortable: true,
  },
  {
    key: 'service',
    header: 'Service',
    value: row => row.serviceName,
    sortable: true,
  },
  {
    key: 'slotStart',
    header: 'Appointment',
    value: row => row.slotStart,
    sortable: true,
  },
  {
    key: 'mechanic',
    header: 'Mechanic',
    value: row => row.mechanicName,
    sortable: true,
  },
  {
    key: 'bay',
    header: 'Bay',
    value: row => row.bayName,
    sortable: true,
  },
  {
    key: 'status',
    header: 'Status',
    value: row => row.status,
    sortable: true,
  },
];

@Component({
  imports: [
    Button,
    DataTable,
    StatusBadge,
    LoadingState,
    ErrorState,
    Modal,
    DatePipe,
    FormsModule,
    Input,
    Select,
    ConfirmBooking,
    RejectBooking,
    RescheduleBooking,
    AssignBooking,
    WalkInBooking,
    BookingCalendar,
  ],
  selector: 'app-bookings',
  styleUrl: './bookings.scss',
  templateUrl: './bookings.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Bookings implements OnInit {
  private readonly bookingApi = inject(BookingApiService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly bookings = signal<BookingList>([]);

  readonly pageSize = 10;
  readonly currentPage = signal(1);
  readonly totalRecords = signal(0);

  readonly selectedDate = signal('');
  readonly selectedStatus = signal('');

  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.totalRecords() / this.pageSize)),
  );

  readonly firstRecord = computed(() =>
    this.bookings().length === 0
      ? 0
      : (this.currentPage() - 1) * this.pageSize + 1,
  );

  readonly lastRecord = computed(() =>
    this.bookings().length === 0
      ? 0
      : this.firstRecord() + this.bookings().length - 1,
  );

  readonly canPrevious = computed(() =>
    !this.isLoading() &&
    !this.errorMessage() &&
    this.currentPage() > 1,
  );

  readonly canNext = computed(() =>
    !this.isLoading() &&
    !this.errorMessage() &&
    this.currentPage() < this.pageCount(),
  );
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly lastUpdated = signal<Date | null>(null);

  readonly selectedBooking = signal<Booking | null>(null);
  readonly confirmingBooking = signal<Booking | null>(null);
  readonly rejectingBooking = signal<Booking | null>(null);
  readonly reschedulingBooking = signal<Booking | null>(null);
  readonly assigningBooking = signal<Booking | null>(null);

  readonly walkInOpen = signal(false);

  readonly actionModalOpen = computed(() =>
    this.confirmingBooking() !== null ||
    this.rejectingBooking() !== null ||
    this.reschedulingBooking() !== null ||
    this.assigningBooking() !== null ||
    this.walkInOpen(),
  );

  readonly rowKey = (row: Booking): string => row.id;

  readonly actions: readonly DataTableAction<Booking>[] = [
    {
      id: 'view',
      label: 'View',
      disabled: () => this.actionModalOpen(),
    },
    {
      id: 'confirm',
      label: 'Confirm',
      disabled: row =>
        row.status !== 'Requested' ||
        this.isLoading() ||
        this.actionModalOpen(),
    },
    {
      id: 'reject',
      label: 'Reject',
      disabled: row =>
        row.status !== 'Requested' ||
        this.isLoading() ||
        this.actionModalOpen(),
    },
    {
      id: 'reschedule',
      label: 'Reschedule',
      disabled: row =>
        !this.canReschedule(row) ||
        this.isLoading() ||
        this.actionModalOpen(),
    },
    {
      id: 'assign',
      label: 'Assign Mechanic & Bay',
      disabled: row =>
        !this.canAssign(row) ||
        this.isLoading() ||
        !!this.errorMessage() ||
        this.actionModalOpen(),
    },
  ];

  readonly statusOptions: readonly DataTableFilterOption[] =
    BOOKING_STATUSES.map(status => ({
      label: this.statusLabel(status),
      value: status,
    }));

  readonly statusCell =
    viewChild<TemplateRef<DataTableCellContext<Booking>>>(
      'statusCell',
    );

  readonly appointmentCell =
    viewChild<TemplateRef<DataTableCellContext<Booking>>>(
      'appointmentCell',
    );

  readonly columns = computed(() =>
    COLUMNS.map(column => {
      if (column.key === 'status') {
        return {
          ...column,
          template: this.statusCell(),
        };
      }

      if (column.key === 'slotStart') {
        return {
          ...column,
          template: this.appointmentCell(),
        };
      }

      return column;
    }),
  );



  ngOnInit(): void {
    this.loadBookings();
  }

  loadBookings(page = this.currentPage()): void {
    if (
      this.isLoading() ||
      this.actionModalOpen() ||
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 2147483647
    ) {
      return;
    }

    this.currentPage.set(page);
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.bookings.set([]);
    this.totalRecords.set(0);
    this.selectedBooking.set(null);
    this.lastUpdated.set(null);

    defer(() => this.bookingApi.getBookings({
      page,
      pageSize: this.pageSize,
      date: this.selectedDate() || undefined,
      status: BOOKING_STATUSES.find(
        status => status === this.selectedStatus(),
      ),
    }))
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isLoading.set(false)),
      )
      .subscribe({
        next: response => {
          this.bookings.set(response.items);
          this.currentPage.set(response.page);
          this.totalRecords.set(response.total);
          this.lastUpdated.set(new Date());
        },
        error: (error: unknown) => {
          this.bookings.set([]);
          this.totalRecords.set(0);
          this.errorMessage.set(this.resolveError(error));
        },
      });
  }

  refresh(): void {
    this.loadBookings();
  }

  previousPage(): void {
    if (this.canPrevious()) {
      this.loadBookings(this.currentPage() - 1);
    }
  }

  nextPage(): void {
    if (this.canNext()) {
      this.loadBookings(this.currentPage() + 1);
    }
  }

  firstPage(): void {
    if (!this.isLoading() && this.currentPage() !== 1) {
      this.loadBookings(1);
    }
  }

  changeDate(value: string): void {
    if (
      this.isLoading() ||
      this.actionModalOpen() ||
      value === this.selectedDate()
    ) {
      return;
    }

    if (value !== '') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return;
      }

      const date = new Date(`${value}T00:00:00Z`);

      if (
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value ||
        value.startsWith('0000-')
      ) {
        return;
      }
    }

    this.selectedDate.set(value);
    this.loadBookings(1);
  }

  changeStatus(value: string): void {
    if (
      this.isLoading() ||
      this.actionModalOpen() ||
      value === this.selectedStatus() ||
      (
        value !== '' &&
        !this.statusOptions.some(option => option.value === value)
      )
    ) {
      return;
    }

    this.selectedStatus.set(value);
    this.loadBookings(1);
  }

  clearFilters(): void {
    if (this.isLoading() || this.actionModalOpen()) {
      return;
    }

    this.selectedDate.set('');
    this.selectedStatus.set('');
    this.loadBookings(1);
  }

  handleAction(event: DataTableActionEvent<Booking>): void {
    if (
      this.isLoading() ||
      this.errorMessage() ||
      this.actionModalOpen()
    ) {
      return;
    }

    if (event.actionId === 'view') {
      this.selectedBooking.set(event.row);
      return;
    }

    if (
      event.actionId !== 'confirm' &&
      event.actionId !== 'reject' &&
      event.actionId !== 'reschedule' &&
      event.actionId !== 'assign'
    ) {
      return;
    }

    const current = this.bookings().find(
      booking => booking.id === event.row.id,
    );

    if (!current) {
      return;
    }

    if (event.actionId === 'assign') {
      if (!this.canAssign(current)) {
        return;
      }

      this.selectedBooking.set(null);
      this.assigningBooking.set(current);
      return;
    }

    if (event.actionId === 'reschedule') {
      if (!this.canReschedule(current)) {
        return;
      }

      this.selectedBooking.set(null);
      this.reschedulingBooking.set(current);
      return;
    }

    if (current.status !== 'Requested') {
      return;
    }

    this.selectedBooking.set(null);

    if (event.actionId === 'reject') {
      this.rejectingBooking.set(current);
      return;
    }

    this.confirmingBooking.set(current);
  }

  closeConfirmation(): void {
    this.confirmingBooking.set(null);
  }

  onBookingConfirmed(booking: Booking): void {
    const pending = this.confirmingBooking();

    if (!pending) {
      return;
    }

    if (
      booking.id.toLowerCase() !== pending.id.toLowerCase() ||
      booking.status !== 'Confirmed'
    ) {
      this.onConfirmationRefreshRequired();
      return;
    }

    this.confirmingBooking.set(null);

    this.toast.success(
      'Booking confirmed',
      'Confirmation received. Refreshing the booking list.',
    );

    this.loadBookings();
  }

  onConfirmationRefreshRequired(): void {
    if (!this.confirmingBooking()) {
      return;
    }

    this.confirmingBooking.set(null);

    this.toast.warning(
      'Confirmation requires review',
      'Review the latest booking status before attempting confirmation again.',
    );

    this.loadBookings();
  }

  closeRejection(): void {
    this.rejectingBooking.set(null);
  }

  onBookingRejected(booking: Booking): void {
    const pending = this.rejectingBooking();

    if (!pending) {
      return;
    }

    if (
      booking.id.toLowerCase() !== pending.id.toLowerCase() ||
      booking.status !== 'Declined' ||
      !booking.declineReason?.trim()
    ) {
      this.onRejectionRefreshRequired();
      return;
    }

    this.rejectingBooking.set(null);

    this.toast.success(
      'Booking rejected',
      'Rejection received. Refreshing the booking list.',
    );

    this.loadBookings();
  }

  onRejectionRefreshRequired(): void {
    if (!this.rejectingBooking()) {
      return;
    }

    this.rejectingBooking.set(null);

    this.toast.warning(
      'Rejection requires review',
      'Review the latest booking status before attempting rejection again.',
    );

    this.loadBookings();
  }

  private canReschedule(booking: Booking): boolean {
    return booking.status === 'Requested' ||
      booking.status === 'Confirmed';
  }

  closeReschedule(): void {
    this.reschedulingBooking.set(null);
  }

  onBookingRescheduled(booking: Booking): void {
    const pending = this.reschedulingBooking();

    if (!pending) {
      return;
    }

    const oldStart = Date.parse(pending.slotStart);
    const oldEnd = Date.parse(pending.slotEnd);
    const newStart = Date.parse(booking.slotStart);
    const newEnd = Date.parse(booking.slotEnd);

    if (
      booking.id.toLowerCase() !== pending.id.toLowerCase() ||
      booking.status !== pending.status ||
      !this.canReschedule(booking) ||
      !Number.isFinite(oldStart) ||
      !Number.isFinite(oldEnd) ||
      !Number.isFinite(newStart) ||
      !Number.isFinite(newEnd) ||
      newStart === oldStart ||
      newEnd <= newStart ||
      newEnd - newStart !== oldEnd - oldStart ||
      booking.mechanicId !== pending.mechanicId ||
      booking.bayId !== pending.bayId
    ) {
      this.onRescheduleRefreshRequired();
      return;
    }

    this.reschedulingBooking.set(null);

    this.toast.success(
      'Booking rescheduled',
      'Reschedule received. Refreshing the booking list.',
    );

    this.loadBookings();
  }

  onRescheduleRefreshRequired(): void {
    if (!this.reschedulingBooking()) {
      return;
    }

    this.reschedulingBooking.set(null);

    this.toast.warning(
      'Reschedule requires review',
      'Review the latest appointment before attempting reschedule again.',
    );

    this.loadBookings();
  }

  private canAssign(booking: Booking): boolean {
    const jobId = booking.jobCardId;

    return booking.status === 'CheckedIn' &&
      typeof jobId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId) &&
      jobId !== '00000000-0000-0000-0000-000000000000';
  }

  closeAssignment(): void {
    this.assigningBooking.set(null);
  }

  onJobAssigned(job: JobSummaryDto): void {
    const pending = this.assigningBooking();

    if (!pending) {
      return;
    }

    if (
      !this.canAssign(pending) ||
      job.id.toLowerCase() !== pending.jobCardId?.toLowerCase() ||
      job.status !== 'Open' ||
      !job.mechanicId ||
      !job.bayId ||
      job.mechanicId === '00000000-0000-0000-0000-000000000000' ||
      job.bayId === '00000000-0000-0000-0000-000000000000'
    ) {
      this.onAssignmentRefreshRequired();
      return;
    }

    this.assigningBooking.set(null);

    this.toast.success(
      'Job assignment updated',
      'Job Card assignment updated. Booking assignment details may differ.',
    );

    this.loadBookings();
  }

  onAssignmentRefreshRequired(): void {
    if (!this.assigningBooking()) {
      return;
    }

    this.assigningBooking.set(null);

    this.toast.warning(
      'Assignment requires review',
      'Review the latest Job Card assignment before attempting another update.',
    );

    this.loadBookings();
  }

  openWalkIn(): void {
    if (
      this.isLoading() ||
      this.errorMessage() ||
      this.actionModalOpen() ||
      this.selectedBooking()
    ) {
      return;
    }

    this.walkInOpen.set(true);
  }

  closeWalkIn(): void {
    this.walkInOpen.set(false);
  }

  onWalkInCreated(job: JobSummaryDto): void {
    if (!this.walkInOpen()) {
      return;
    }

    this.walkInOpen.set(false);

    this.toast.success(
      'Walk-in created',
      `Job Card ${job.number} created successfully.`,
    );

    this.loadBookings();
  }

  onWalkInRefreshRequired(): void {
    if (!this.walkInOpen()) {
      return;
    }

    this.walkInOpen.set(false);

    this.toast.warning(
      'Walk-in requires review',
      'Review bookings and job cards before creating another walk-in.',
    );

    this.loadBookings();
  }

  closeDetails(): void {
    this.selectedBooking.set(null);
  }

  statusLabel(status: string): string {
    switch (status) {
      case 'CheckedIn':
        return 'Checked In';
      case 'NoShow':
        return 'No Show';
      default:
        return status;
    }
  }

  statusTone(status: string): StatusBadgeTone {
    if (Object.prototype.hasOwnProperty.call(
      STATUS_TONES,
      status,
    )) {
      return STATUS_TONES[status as BookingStatus];
    }

    return 'neutral';
  }

  private resolveError(error: unknown): string {
    if (error instanceof BookingResponseError) {
      return 'The server returned invalid booking information. Please try again.';
    }

    if (error instanceof ApiError) {
      switch (error.status) {
        case 0:
          return 'Unable to connect to the server. Check your connection.';
        case 401:
          return 'Your session is no longer valid. Please sign in again.';
        case 403:
          return 'You do not have permission to access bookings.';
        case 429:
          return 'Too many requests. Please try again later.';
        default:
          return 'Unable to load bookings. Please try again.';
      }
    }

    return 'Unable to load bookings. Please try again.';
  }
}
