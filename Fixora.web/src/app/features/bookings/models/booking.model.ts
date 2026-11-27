export const BOOKING_STATUSES = [
  'Requested',
  'Confirmed',
  'Declined',
  'Cancelled',
  'CheckedIn',
  'Completed',
  'NoShow',
] as const;

export type BookingStatus =
  (typeof BOOKING_STATUSES)[number];

export const BOOKING_SOURCES = [
  'App',
  'WalkIn',
  'DriveSense',
  'Sos',
  'Promo',
] as const;

export type BookingSource =
  (typeof BOOKING_SOURCES)[number];

export const BOOKING_PRIORITIES = [
  { value: 0, label: 'Normal' },
  { value: 1, label: 'High' },
  { value: 2, label: 'Urgent' },
] as const;

export type BookingPriority =
  (typeof BOOKING_PRIORITIES)[number]['value'];

export interface Booking {
  readonly id: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly vehicleId: string;
  readonly vehicleLabel: string;
  readonly serviceId: string;
  readonly serviceName: string;
  readonly slotStart: string;
  readonly slotEnd: string;
  readonly status: string;
  readonly source: string;
  readonly jobCardId: string | null;
  readonly bayId: string | null;
  readonly bayName: string | null;
  readonly mechanicId: string | null;
  readonly mechanicName: string | null;
  readonly notes: string | null;
  readonly managerNote: string | null;
  readonly promoCode: string | null;
  readonly declineReason: string | null;
  readonly createdAt: string;
}

export interface BookingListQuery {
  readonly date?: string;
  readonly status?: BookingStatus;
  readonly page?: number;
  readonly pageSize?: number;
}

export type BookingList = readonly Booking[];

export interface BookingPage {
  readonly items: BookingList;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export const BOOKING_DEFAULT_PAGE_SIZE = 50;
export const BOOKING_MAX_PAGE_SIZE = 100;
export const BOOKING_MANAGER_NOTE_MAX_LENGTH = 500;
