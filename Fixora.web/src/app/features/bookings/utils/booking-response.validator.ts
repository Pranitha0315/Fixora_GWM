import type {
  MechanicRosterDto,
  BayDto,
  ServiceDto,
  SlotDto,
  JobSummaryDto,
} from '../models/booking-support.model';

import { BOOKING_MAX_PAGE_SIZE } from '../models/booking.model';

import type {
  Booking,
  BookingList,
  BookingPage,
} from '../models/booking.model';

export class BookingResponseError extends Error {
  constructor(field: string) {
    super(`Invalid booking response: ${field}`);
    this.name = 'BookingResponseError';
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/i;

function readObject(
  value: unknown,
  path: string,
): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new BookingResponseError(path);
  }

  return value as Record<string, unknown>;
}

function readString(
  source: Record<string, unknown>,
  field: string,
  path: string,
): string {
  const value = source[field];

  if (typeof value !== 'string') {
    throw new BookingResponseError(`${path}.${field}`);
  }

  return value;
}

function readNullableString(
  source: Record<string, unknown>,
  field: string,
  path: string,
): string | null {
  if (source[field] === null) {
    return null;
  }

  return readString(source, field, path);
}

function readUuid(
  source: Record<string, unknown>,
  field: string,
  path: string,
): string {
  const value = readString(source, field, path);

  if (!UUID_PATTERN.test(value)) {
    throw new BookingResponseError(`${path}.${field}`);
  }

  return value;
}

function readNullableUuid(
  source: Record<string, unknown>,
  field: string,
  path: string,
): string | null {
  if (source[field] === null) {
    return null;
  }

  return readUuid(source, field, path);
}

function readDateTime(
  source: Record<string, unknown>,
  field: string,
  path: string,
): string {
  const value = readString(source, field, path);

  if (
    !DATE_TIME_PATTERN.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new BookingResponseError(`${path}.${field}`);
  }

  return value;
}

export function validateBookingResponse(
  response: unknown,
  path = 'booking',
): Booking {
  const source = readObject(response, path);

  return {
    id: readUuid(source, 'id', path),
    customerId: readUuid(source, 'customerId', path),
    customerName: readString(source, 'customerName', path),
    vehicleId: readUuid(source, 'vehicleId', path),
    vehicleLabel: readString(source, 'vehicleLabel', path),
    serviceId: readUuid(source, 'serviceId', path),
    serviceName: readString(source, 'serviceName', path),
    slotStart: readDateTime(source, 'slotStart', path),
    slotEnd: readDateTime(source, 'slotEnd', path),
    status: readString(source, 'status', path),
    source: readString(source, 'source', path),
    jobCardId: readNullableUuid(source, 'jobCardId', path),
    bayId: readNullableUuid(source, 'bayId', path),
    bayName: readNullableString(source, 'bayName', path),
    mechanicId: readNullableUuid(source, 'mechanicId', path),
    mechanicName: readNullableString(source, 'mechanicName', path),
    notes: readNullableString(source, 'notes', path),
    managerNote: readNullableString(source, 'managerNote', path),
    promoCode: readNullableString(source, 'promoCode', path),
    declineReason: readNullableString(source, 'declineReason', path),
    createdAt: readDateTime(source, 'createdAt', path),
  };
}

export function validateBookingListResponse(
  response: unknown,
): BookingList {
  if (!Array.isArray(response)) {
    throw new BookingResponseError('response');
  }

  return response.map((item, index) =>
    validateBookingResponse(item, `bookings[${index}]`),
  );
}


function readInteger(
  source: Record<string, unknown>,
  field: string,
  path: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const value = source[field];

  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new BookingResponseError(`${path}.${field}`);
  }

  return value;
}

export function validateBookingPageResponse(
  response: unknown,
): BookingPage {
  const source = readObject(response, 'response');

  const page = readInteger(
    source,
    'page',
    'response',
    1,
  );

  const pageSize = readInteger(
    source,
    'pageSize',
    'response',
    1,
    BOOKING_MAX_PAGE_SIZE,
  );

  const total = readInteger(
    source,
    'total',
    'response',
    0,
  );

  const rawItems = source['items'];

  if (!Array.isArray(rawItems)) {
    throw new BookingResponseError('response.items');
  }

  if (
    rawItems.length > pageSize ||
    rawItems.length > total
  ) {
    throw new BookingResponseError('response.items.length');
  }

  const items = rawItems.map((item, index) =>
    validateBookingResponse(
      item,
      `response.items[${index}]`,
    ),
  );

  return {
    items,
    page,
    pageSize,
    total,
  };
}


function readBoolean(
  source: Record<string, unknown>,
  field: string,
  path: string,
): boolean {
  const value = source[field];

  if (typeof value !== 'boolean') {
    throw new BookingResponseError(`${path}.${field}`);
  }

  return value;
}

function readNumber(
  source: Record<string, unknown>,
  field: string,
  path: string,
  minimum = 0,
): number {
  const value = source[field];

  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum
  ) {
    throw new BookingResponseError(`${path}.${field}`);
  }

  return value;
}

function readNullableDateTime(
  source: Record<string, unknown>,
  field: string,
  path: string,
): string | null {
  if (source[field] === null) {
    return null;
  }

  return readDateTime(source, field, path);
}

function readResponseArray<T>(
  response: unknown,
  path: string,
  validator: (item: unknown, path: string) => T,
): readonly T[] {
  if (!Array.isArray(response)) {
    throw new BookingResponseError(path);
  }

  return response.map((item, index) =>
    validator(item, `${path}[${index}]`),
  );
}

export function validateMechanicResponse(
  response: unknown,
  path = 'mechanic',
): MechanicRosterDto {
  const source = readObject(response, path);

  return {
    id: readUuid(source, 'id', path),
    name: readString(source, 'name', path),
    phone: readString(source, 'phone', path),
    employeeCode: readString(source, 'employeeCode', path),
    onDuty: readBoolean(source, 'onDuty', path),
    activeJobs: readInteger(source, 'activeJobs', path, 0),
  };
}

export function validateMechanicListResponse(
  response: unknown,
): readonly MechanicRosterDto[] {
  return readResponseArray(
    response,
    'mechanics',
    validateMechanicResponse,
  );
}

export function validateBayResponse(
  response: unknown,
  path = 'bay',
): BayDto {
  const source = readObject(response, path);

  return {
    id: readUuid(source, 'id', path),
    name: readString(source, 'name', path),
    active: readBoolean(source, 'active', path),
  };
}

export function validateBayListResponse(
  response: unknown,
): readonly BayDto[] {
  return readResponseArray(
    response,
    'bays',
    validateBayResponse,
  );
}

export function validateServiceResponse(
  response: unknown,
  path = 'service',
): ServiceDto {
  const source = readObject(response, path);

  return {
    id: readUuid(source, 'id', path),
    name: readString(source, 'name', path),
    category: readString(source, 'category', path),
    standardMinutes: readInteger(
      source,
      'standardMinutes',
      path,
      1,
    ),
    basePrice: readNumber(source, 'basePrice', path),
  };
}

export function validateServiceListResponse(
  response: unknown,
): readonly ServiceDto[] {
  return readResponseArray(
    response,
    'services',
    validateServiceResponse,
  );
}

export function validateSlotResponse(
  response: unknown,
  path = 'slot',
): SlotDto {
  const source = readObject(response, path);

  const start = readDateTime(source, 'start', path);
  const end = readDateTime(source, 'end', path);

  if (Date.parse(end) <= Date.parse(start)) {
    throw new BookingResponseError(`${path}.end`);
  }

  return {
    start,
    end,
    freeBays: readInteger(source, 'freeBays', path, 1),
  };
}

export function validateSlotListResponse(
  response: unknown,
): readonly SlotDto[] {
  return readResponseArray(
    response,
    'slots',
    validateSlotResponse,
  );
}

export function validateJobSummaryResponse(
  response: unknown,
  path = 'job',
): JobSummaryDto {
  const source = readObject(response, path);

  return {
    id: readUuid(source, 'id', path),
    number: readString(source, 'number', path),
    customerId: readUuid(source, 'customerId', path),
    customerName: readString(source, 'customerName', path),
    vehicleId: readUuid(source, 'vehicleId', path),
    vehicleLabel: readString(source, 'vehicleLabel', path),
    mechanicId: readNullableUuid(source, 'mechanicId', path),
    mechanicName: readNullableString(source, 'mechanicName', path),
    bayId: readNullableUuid(source, 'bayId', path),
    bayName: readNullableString(source, 'bayName', path),
    status: readString(source, 'status', path),
    priority: readInteger(source, 'priority', path, 0, 2),
    queuePosition: readInteger(source, 'queuePosition', path, 0),
    etaAt: readNullableDateTime(source, 'etaAt', path),
    estimatedMinutes: readInteger(source, 'estimatedMinutes', path, 0),
    elapsedMinutes: readNumber(source, 'elapsedMinutes', path),
    createdAt: readDateTime(source, 'createdAt', path),
    startedAt: readNullableDateTime(source, 'startedAt', path),
    completedAt: readNullableDateTime(source, 'completedAt', path),
    complaint: readNullableString(source, 'complaint', path),
    managerNote: readNullableString(source, 'managerNote', path),
  };
}
