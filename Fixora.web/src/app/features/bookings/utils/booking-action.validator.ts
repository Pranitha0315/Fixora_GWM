import {
  BOOKING_MANAGER_NOTE_MAX_LENGTH,
  BOOKING_PRIORITIES,
} from '../models/booking.model';

import type { BookingPriority } from '../models/booking.model';

import type {
  ConfirmBookingRequest,
  DeclineBookingRequest,
  RescheduleRequest,
  WalkInRequest,
  AssignJobRequest,
  BookingSlotQuery,
} from '../models/booking-action.model';

export class BookingRequestError extends Error {
  constructor(readonly field: string) {
    super(`Invalid booking request: ${field}`);
    this.name = 'BookingRequestError';
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';

function readObject(value: unknown): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new BookingRequestError('request');
  }

  return value as Record<string, unknown>;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BookingRequestError(field);
  }

  return value.trim();
}

function nullableText(value: unknown, field: string): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new BookingRequestError(field);
  }

  return value.trim() || null;
}

function requiredUuid(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    !UUID_PATTERN.test(value) ||
    value === EMPTY_UUID
  ) {
    throw new BookingRequestError(field);
  }

  return value;
}

function nullableUuid(value: unknown, field: string): string | null {
  return value === null ? null : requiredUuid(value, field);
}

function validDate(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value.startsWith('0000')
  ) {
    throw new BookingRequestError(field);
  }

  const date = new Date(`${value}T00:00:00Z`);

  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new BookingRequestError(field);
  }

  return value;
}

function validDateTime(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new BookingRequestError(field);
  }

  const pattern =
    /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,7})?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/;

  if (!pattern.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new BookingRequestError(field);
  }

  validDate(value.slice(0, 10), field);

  return value;
}

function validPriority(value: unknown): BookingPriority {
  const priority = BOOKING_PRIORITIES.find(
    option => option.value === value,
  );

  if (!priority) {
    throw new BookingRequestError('priority');
  }

  return priority.value;
}

export function validateConfirmBookingRequest(
  request: unknown,
): ConfirmBookingRequest {
  const source = readObject(request);

  const note = nullableText(source['note'], 'note');

  if (
    typeof source['note'] === 'string' &&
    source['note'].length > BOOKING_MANAGER_NOTE_MAX_LENGTH
  ) {
    throw new BookingRequestError('note');
  }

  return {
    bayId: requiredUuid(source['bayId'], 'bayId'),
    mechanicId: requiredUuid(source['mechanicId'], 'mechanicId'),
    note,
  };
}

export function validateDeclineBookingRequest(
  request: unknown,
): DeclineBookingRequest {
  const source = readObject(request);

  return {
    reason: requiredText(source['reason'], 'reason'),
  };
}

export function validateRescheduleRequest(
  request: unknown,
): RescheduleRequest {
  const source = readObject(request);

  return {
    slotStart: validDateTime(source['slotStart'], 'slotStart'),
  };
}

export function validateWalkInRequest(
  request: unknown,
): WalkInRequest {
  const source = readObject(request);

  return {
    customerId: nullableUuid(source['customerId'], 'customerId'),
    customerName: requiredText(source['customerName'], 'customerName'),
    vehicleId: nullableUuid(source['vehicleId'], 'vehicleId'),
    vehicleLabel: requiredText(source['vehicleLabel'], 'vehicleLabel'),
    serviceId: requiredUuid(source['serviceId'], 'serviceId'),
    bayId: requiredUuid(source['bayId'], 'bayId'),
    mechanicId: requiredUuid(source['mechanicId'], 'mechanicId'),
    priority: validPriority(source['priority']),
    complaint: nullableText(source['complaint'], 'complaint'),
  };
}

export function validateAssignJobRequest(
  request: unknown,
): AssignJobRequest {
  const source = readObject(request);

  return {
    mechanicId: requiredUuid(source['mechanicId'], 'mechanicId'),
    bayId: requiredUuid(source['bayId'], 'bayId'),
  };
}

export function validateBookingSlotQuery(
  request: unknown,
): BookingSlotQuery {
  const source = readObject(request);

  return {
    date: validDate(source['date'], 'date'),
    serviceId: requiredUuid(source['serviceId'], 'serviceId'),
  };
}
