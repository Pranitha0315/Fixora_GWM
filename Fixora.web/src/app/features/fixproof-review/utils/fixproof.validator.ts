import {
  FIXPROOF_MAX_QTY,
  FIXPROOF_MIN_QTY,
} from '../models/fixproof.model';

import type {
  AuditDto,
  ChangeRequestDto,
  ChangeRequestListQuery,
  NoteRequest,
  PriceRequest,
  ProposalDto,
  ProposalListQuery,
  RepairItemDto,
} from '../models/fixproof.model';

import {
  calculateLineAmountCents,
  isKnownProposalStatus,
  parseMoneyToCents,
  parseQuantity,
} from './fixproof-pricing.util';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';

const DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/i;

/**
 * Thrown when a FixProof API response violates the backend contract.
 * `field` is a structural path only; it never contains response values.
 */
export class FixProofResponseError extends Error {
  constructor(readonly field: string) {
    super(`Invalid FixProof response: ${field}`);
    this.name = 'FixProofResponseError';
  }
}

/**
 * Thrown when a FixProof API request fails client-side validation.
 * `field` identifies the invalid input without leaking user input values.
 */
export class FixProofRequestError extends Error {
  constructor(readonly field: string) {
    super(`Invalid FixProof request: ${field}`);
    this.name = 'FixProofRequestError';
  }
}

function readObject(
  value: unknown,
  path: string,
): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new FixProofResponseError(path);
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
    throw new FixProofResponseError(`${path}.${field}`);
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

function readNonEmptyUuid(
  source: Record<string, unknown>,
  field: string,
  path: string,
): string {
  const value = readString(source, field, path);

  if (!UUID_PATTERN.test(value) || value === EMPTY_UUID) {
    throw new FixProofResponseError(`${path}.${field}`);
  }

  return value;
}

function readNullableNonEmptyUuid(
  source: Record<string, unknown>,
  field: string,
  path: string,
): string | null {
  if (source[field] === null) {
    return null;
  }

  return readNonEmptyUuid(source, field, path);
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
    throw new FixProofResponseError(`${path}.${field}`);
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

function readNonNegativeNumber(
  source: Record<string, unknown>,
  field: string,
  path: string,
): number {
  const value = source[field];

  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new FixProofResponseError(`${path}.${field}`);
  }

  return value;
}

function readInteger(
  source: Record<string, unknown>,
  field: string,
  path: string,
  min: number,
  max?: number,
): number {
  const value = source[field];

  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < min ||
    (max !== undefined && value > max)
  ) {
    throw new FixProofResponseError(`${path}.${field}`);
  }

  return value;
}

function readStringArray(
  source: Record<string, unknown>,
  field: string,
  path: string,
): readonly string[] {
  const value = source[field];

  if (!Array.isArray(value)) {
    throw new FixProofResponseError(`${path}.${field}`);
  }

  return value.map((item: unknown, index) => {
    if (typeof item !== 'string') {
      throw new FixProofResponseError(`${path}.${field}[${index}]`);
    }

    return item;
  });
}

function assertUniqueIds(
  items: readonly { readonly id: string }[],
  path: string,
): void {
  const seen = new Set<string>();

  items.forEach((item, index) => {
    const key = item.id.toLowerCase();

    if (seen.has(key)) {
      throw new FixProofResponseError(`${path}[${index}].id`);
    }

    seen.add(key);
  });
}

export function validateRepairItemResponse(
  response: unknown,
  path = 'item',
): RepairItemDto {
  const source = readObject(response, path);

  return {
    id: readNonEmptyUuid(source, 'id', path),
    title: readString(source, 'title', path),
    kind: readString(source, 'kind', path),
    qty: readInteger(
      source,
      'qty',
      path,
      FIXPROOF_MIN_QTY,
      FIXPROOF_MAX_QTY,
    ),
    unitPrice: readNonNegativeNumber(source, 'unitPrice', path),
    amount: readNonNegativeNumber(source, 'amount', path),
    version: readInteger(source, 'version', path, 1, FIXPROOF_MAX_QTY),
    status: readString(source, 'status', path),
    linkedIssueId: readNullableNonEmptyUuid(
      source,
      'linkedIssueId',
      path,
    ),
  };
}

export function validateAuditEntryResponse(
  response: unknown,
  path = 'audit',
): AuditDto {
  const source = readObject(response, path);

  return {
    actorRole: readString(source, 'actorRole', path),
    action: readString(source, 'action', path),
    detail: readNullableString(source, 'detail', path),
    at: readDateTime(source, 'at', path),
  };
}

export function validateProposalResponse(
  response: unknown,
  path = 'proposal',
): ProposalDto {
  const source = readObject(response, path);

  const rawItems = source['items'];
  if (!Array.isArray(rawItems)) {
    throw new FixProofResponseError(`${path}.items`);
  }

  const items = rawItems.map((item: unknown, index) =>
    validateRepairItemResponse(item, `${path}.items[${index}]`),
  );
  assertUniqueIds(items, `${path}.items`);

  const rawAudit = source['audit'];
  if (!Array.isArray(rawAudit)) {
    throw new FixProofResponseError(`${path}.audit`);
  }

  const audit = rawAudit.map((entry: unknown, index) =>
    validateAuditEntryResponse(entry, `${path}.audit[${index}]`),
  );

  return {
    id: readNonEmptyUuid(source, 'id', path),
    jobCardId: readNonEmptyUuid(source, 'jobCardId', path),
    jobNumber: readString(source, 'jobNumber', path),
    vehicleLabel: readString(source, 'vehicleLabel', path),
    customerName: readString(source, 'customerName', path),
    status: readString(source, 'status', path),
    mechanicId: readNonEmptyUuid(source, 'mechanicId', path),
    mechanicName: readNullableString(source, 'mechanicName', path),
    mechanicNote: readNullableString(source, 'mechanicNote', path),
    managerNote: readNullableString(source, 'managerNote', path),
    customerNote: readNullableString(source, 'customerNote', path),
    submittedAt: readDateTime(source, 'submittedAt', path),
    publishedAt: readNullableDateTime(source, 'publishedAt', path),
    respondedAt: readNullableDateTime(source, 'respondedAt', path),
    releasedAt: readNullableDateTime(source, 'releasedAt', path),
    total: readNonNegativeNumber(source, 'total', path),
    approvedTotal: readNonNegativeNumber(
      source,
      'approvedTotal',
      path,
    ),
    items,
    audit,
  };
}

export function validateProposalListResponse(
  response: unknown,
  path = 'proposals',
): readonly ProposalDto[] {
  if (!Array.isArray(response)) {
    throw new FixProofResponseError(path);
  }

  const proposals = response.map((item: unknown, index) =>
    validateProposalResponse(item, `${path}[${index}]`),
  );
  assertUniqueIds(proposals, path);

  return proposals;
}

export function validateChangeRequestResponse(
  response: unknown,
  path = 'changeRequest',
): ChangeRequestDto {
  const source = readObject(response, path);

  return {
    id: readNonEmptyUuid(source, 'id', path),
    jobCardId: readNonEmptyUuid(source, 'jobCardId', path),
    jobNumber: readString(source, 'jobNumber', path),
    number: readString(source, 'number', path),
    changes: readStringArray(source, 'changes', path),
    details: readString(source, 'details', path),
    status: readString(source, 'status', path),
    managerNote: readNullableString(source, 'managerNote', path),
    mechanicNote: readNullableString(source, 'mechanicNote', path),
    createdAt: readDateTime(source, 'createdAt', path),
  };
}

export function validateChangeRequestListResponse(
  response: unknown,
  path = 'changeRequests',
): readonly ChangeRequestDto[] {
  if (!Array.isArray(response)) {
    throw new FixProofResponseError(path);
  }

  const changeRequests = response.map((item: unknown, index) =>
    validateChangeRequestResponse(item, `${path}[${index}]`),
  );
  assertUniqueIds(changeRequests, path);

  return changeRequests;
}

export function validateFixProofResourceId(
  value: unknown,
  field: string,
): string {
  if (
    typeof value !== 'string' ||
    !UUID_PATTERN.test(value) ||
    value === EMPTY_UUID
  ) {
    throw new FixProofRequestError(field);
  }

  return value;
}

/**
 * Validates PriceRequest(decimal UnitPrice, int Qty) using exact
 * BigInt scaled-integer rules so precision, Int32 bounds, and
 * SQL decimal(18, 2) line-total overflow are verified before HTTP.
 */
export function validatePriceRequest(
  request: unknown,
): PriceRequest {
  if (
    typeof request !== 'object' ||
    request === null ||
    Array.isArray(request)
  ) {
    throw new FixProofRequestError('request');
  }

  const source = request as Record<string, unknown>;
  const rawPrice = source['unitPrice'];
  const rawQty = source['qty'];

  if (typeof rawPrice !== 'number' && typeof rawPrice !== 'string') {
    throw new FixProofRequestError('unitPrice');
  }

  if (typeof rawQty !== 'number' && typeof rawQty !== 'string') {
    throw new FixProofRequestError('qty');
  }

  const parsedPrice = parseMoneyToCents(rawPrice);
  if (!parsedPrice.ok) {
    throw new FixProofRequestError('unitPrice');
  }

  const parsedQty = parseQuantity(rawQty);
  if (!parsedQty.ok) {
    throw new FixProofRequestError('qty');
  }

  if (
    calculateLineAmountCents(parsedPrice.cents, parsedQty.qty) === null
  ) {
    throw new FixProofRequestError('amount');
  }

  return {
    unitPrice: parsedPrice.numericValue,
    qty: parsedQty.qty,
  };
}

/**
 * Validates NoteRequest for endpoints with an optional note
 * (proposal forward, proposal release, change-request forward).
 */
export function validateOptionalNoteRequest(
  request: unknown,
): NoteRequest {
  if (
    typeof request !== 'object' ||
    request === null ||
    Array.isArray(request)
  ) {
    throw new FixProofRequestError('request');
  }

  const source = request as Record<string, unknown>;
  const rawNote = source['note'];

  if (rawNote === null || rawNote === undefined) {
    return { note: null };
  }

  if (typeof rawNote !== 'string') {
    throw new FixProofRequestError('note');
  }

  const trimmed = rawNote.trim();

  return { note: trimmed ? trimmed : null };
}

/**
 * Validates NoteRequest for endpoints requiring a non-blank reason
 * (proposal return: Approvals.cs:92; change-request decline: Approvals.cs:255).
 */
export function validateRequiredNoteRequest(
  request: unknown,
): NoteRequest {
  if (
    typeof request !== 'object' ||
    request === null ||
    Array.isArray(request)
  ) {
    throw new FixProofRequestError('request');
  }

  const source = request as Record<string, unknown>;
  const rawNote = source['note'];

  if (typeof rawNote !== 'string' || !rawNote.trim()) {
    throw new FixProofRequestError('note');
  }

  return { note: rawNote.trim() };
}

export function validateProposalListQuery(
  query: unknown,
): ProposalListQuery {
  if (query === undefined || query === null) {
    return { status: null };
  }

  if (typeof query !== 'object' || Array.isArray(query)) {
    throw new FixProofRequestError('query');
  }

  const source = query as Record<string, unknown>;
  const status = source['status'];

  if (status === undefined || status === null) {
    return { status: null };
  }

  if (typeof status !== 'string' || !isKnownProposalStatus(status)) {
    throw new FixProofRequestError('status');
  }

  return { status };
}

export function validateChangeRequestListQuery(
  query: unknown,
): ChangeRequestListQuery {
  if (query === undefined || query === null) {
    return { pendingOnly: false };
  }

  if (typeof query !== 'object' || Array.isArray(query)) {
    throw new FixProofRequestError('query');
  }

  const source = query as Record<string, unknown>;
  const pendingOnly = source['pendingOnly'];

  if (pendingOnly === undefined) {
    return { pendingOnly: false };
  }

  if (typeof pendingOnly !== 'boolean') {
    throw new FixProofRequestError('pendingOnly');
  }

  return { pendingOnly };
}
