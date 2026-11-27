import type { BookingPriority } from './booking.model';

export interface ConfirmBookingRequest {
  readonly bayId: string;
  readonly mechanicId: string;
  readonly note: string | null;
}

export interface DeclineBookingRequest {
  readonly reason: string;
}

export interface RescheduleRequest {
  readonly slotStart: string;
}

export interface WalkInRequest {
  readonly customerId: string | null;
  readonly customerName: string;
  readonly vehicleId: string | null;
  readonly vehicleLabel: string;
  readonly serviceId: string;
  readonly bayId: string;
  readonly mechanicId: string;
  readonly priority: BookingPriority;
  readonly complaint: string | null;
}

export interface AssignJobRequest {
  readonly mechanicId: string;
  readonly bayId: string;
}

export interface BookingSlotQuery {
  readonly date: string;
  readonly serviceId: string;
}
