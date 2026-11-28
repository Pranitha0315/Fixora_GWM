import {
  BookingResponseError,
  validateJobSummaryResponse,
} from '../../bookings/utils/booking-response.validator';

import {
  FixProofResponseError,
  validateChangeRequestResponse,
  validateProposalResponse,
} from '../../fixproof-review/utils/fixproof.validator';

import type {
  InvoiceDto,
  InvoiceLineDto,
  IssueDto,
  JobDetailDto,
  JobListQuery,
  JobSummaryDto,
  ProgressDto,
  QueueEstimateDto,
} from '../models/job-card.model';

const BOOKING_ERROR_PREFIX = 'Invalid booking response: ';
const FIXPROOF_ERROR_PREFIX = 'Invalid FixProof response: ';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';

const DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/i;

const INT32_MAX = 2_147_483_647;

/**
 * Thrown when a Job Cards API response violates the backend contract.
 * `field` is a structural path only; it never contains response values
 * or signed media URLs.
 */
export class JobCardResponseError extends Error {
  constructor(readonly field: string) {
    super(`Invalid job card response: ${field}`);
    this.name = 'JobCardResponseError';
  }
}

/**
 * Thrown when a Job Cards API request parameter is invalid.
 */
export class JobCardRequestError extends Error {
  constructor(readonly field: string) {
    super(`Invalid job card request: ${field}`);
    this.name = 'JobCardRequestError';
  }
}

function toJobCardResponseError(
  error: BookingResponseError | FixProofResponseError,
): JobCardResponseError {
  if (error instanceof FixProofResponseError) {
    return new JobCardResponseError(error.field);
  }

  const field = error.message.startsWith(BOOKING_ERROR_PREFIX)
    ? error.message.slice(BOOKING_ERROR_PREFIX.length)
    : error.message.startsWith(FIXPROOF_ERROR_PREFIX)
      ? error.message.slice(FIXPROOF_ERROR_PREFIX.length)
      : 'response';

  return new JobCardResponseError(field);
}

function reuseValidator<T>(validate: () => T): T {
  try {
    return validate();
  } catch (error) {
    if (
      error instanceof BookingResponseError ||
      error instanceof FixProofResponseError
    ) {
      throw toJobCardResponseError(error);
    }

    throw error;
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
    throw new JobCardResponseError(path);
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
    throw new JobCardResponseError(`${path}.${field}`);
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

function readUuidAllowingEmpty(
  source: Record<string, unknown>,
  field: string,
  path: string,
): string {
  const value = readString(source, field, path);

  if (!UUID_PATTERN.test(value)) {
    throw new JobCardResponseError(`${path}.${field}`);
  }

  return value;
}

function readNonEmptyUuid(
  source: Record<string, unknown>,
  field: string,
  path: string,
): string {
  const value = readUuidAllowingEmpty(source, field, path);

  if (value === EMPTY_UUID) {
    throw new JobCardResponseError(`${path}.${field}`);
  }

  return value;
}

function readBoolean(
  source: Record<string, unknown>,
  field: string,
  path: string,
): boolean {
  const value = source[field];

  if (typeof value !== 'boolean') {
    throw new JobCardResponseError(`${path}.${field}`);
  }

  return value;
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
    throw new JobCardResponseError(`${path}.${field}`);
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
    throw new JobCardResponseError(`${path}.${field}`);
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
    throw new JobCardResponseError(`${path}.${field}`);
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
    throw new JobCardResponseError(`${path}.${field}`);
  }

  return value.map((item: unknown, index) => {
    if (typeof item !== 'string') {
      throw new JobCardResponseError(`${path}.${field}[${index}]`);
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
      throw new JobCardResponseError(`${path}[${index}].id`);
    }

    seen.add(key);
  });
}

/**
 * Validates one JobSummaryDto by reusing the existing bookings
 * validator. Anonymous walk-in jobs (`Guid.Empty` customerId/vehicleId)
 * and unrecognized status strings are preserved cleanly.
 */
export function validateJobCardSummaryResponse(
  response: unknown,
  path = 'job',
): JobSummaryDto {
  const job = reuseValidator(() =>
    validateJobSummaryResponse(response, path),
  );

  if (job.id === EMPTY_UUID) {
    throw new JobCardResponseError(`${path}.id`);
  }

  return job;
}

/**
 * Validates GET /api/v1/manager/jobs response array.
 * Rejects duplicate job IDs. Preserves backend order and 200-cap output.
 */
export function validateJobCardListResponse(
  response: unknown,
  path = 'jobs',
): readonly JobSummaryDto[] {
  if (!Array.isArray(response)) {
    throw new JobCardResponseError(path);
  }

  const jobs = response.map((item: unknown, index) =>
    validateJobCardSummaryResponse(item, `${path}[${index}]`),
  );
  assertUniqueIds(jobs, path);

  return jobs;
}

/**
 * Validates QueueEstimateDto (WorkshopDtos.cs:19).
 * Uses exact backend field name `position` (not `queuePosition`).
 */
export function validateQueueEstimateResponse(
  response: unknown,
  path = 'queue',
): QueueEstimateDto {
  const source = readObject(response, path);

  return {
    jobId: readNonEmptyUuid(source, 'jobId', path),
    position: readInteger(source, 'position', path, 0, INT32_MAX),
    etaAt: readNullableDateTime(source, 'etaAt', path),
    status: readString(source, 'status', path),
    indicative: readBoolean(source, 'indicative', path),
  };
}

/** Validates ProgressDto (WorkshopDtos.cs:21). */
export function validateProgressResponse(
  response: unknown,
  path = 'timeline',
): ProgressDto {
  const source = readObject(response, path);

  return {
    stage: readString(source, 'stage', path),
    message: readString(source, 'message', path),
    percent: readInteger(source, 'percent', path, 0, 100),
    actorRole: readString(source, 'actorRole', path),
    at: readDateTime(source, 'at', path),
  };
}

/**
 * Validates IssueDto (WorkshopDtos.cs:27-28).
 * Structural validation of `mediaUrls` only; signed-URL security
 * verification happens in the dedicated media URL service (K07).
 */
export function validateIssueResponse(
  response: unknown,
  path = 'issue',
): IssueDto {
  const source = readObject(response, path);

  return {
    id: readNonEmptyUuid(source, 'id', path),
    component: readString(source, 'component', path),
    findingEn: readString(source, 'findingEn', path),
    findingTa: readString(source, 'findingTa', path),
    recommendationEn: readString(source, 'recommendationEn', path),
    recommendationTa: readString(source, 'recommendationTa', path),
    severity: readString(source, 'severity', path),
    mediaUrls: readStringArray(source, 'mediaUrls', path),
    reportVersion: readInteger(
      source,
      'reportVersion',
      path,
      1,
      INT32_MAX,
    ),
    confirmedAt: readDateTime(source, 'confirmedAt', path),
  };
}

/** Validates InvoiceLineDto (WorkshopDtos.cs:42). */
export function validateInvoiceLineResponse(
  response: unknown,
  path = 'line',
): InvoiceLineDto {
  const source = readObject(response, path);

  return {
    description: readString(source, 'description', path),
    qty: readInteger(source, 'qty', path, 1, INT32_MAX),
    unitPrice: readNonNegativeNumber(source, 'unitPrice', path),
    amount: readNonNegativeNumber(source, 'amount', path),
  };
}

/**
 * Validates InvoiceDto (WorkshopDtos.cs:44-45).
 * Allows `Guid.Empty` for `customerId` because anonymous walk-in jobs
 * carry `Guid.Empty` customer identity into BillingService.
 */
export function validateInvoiceResponse(
  response: unknown,
  path = 'invoice',
): InvoiceDto {
  const source = readObject(response, path);

  const rawLines = source['lines'];
  if (!Array.isArray(rawLines)) {
    throw new JobCardResponseError(`${path}.lines`);
  }

  const lines = rawLines.map((line: unknown, index) =>
    validateInvoiceLineResponse(line, `${path}.lines[${index}]`),
  );

  return {
    id: readNonEmptyUuid(source, 'id', path),
    number: readString(source, 'number', path),
    jobCardId: readNonEmptyUuid(source, 'jobCardId', path),
    customerId: readUuidAllowingEmpty(source, 'customerId', path),
    subtotal: readNonNegativeNumber(source, 'subtotal', path),
    tax: readNonNegativeNumber(source, 'tax', path),
    loyaltyDiscount: readNonNegativeNumber(
      source,
      'loyaltyDiscount',
      path,
    ),
    total: readNonNegativeNumber(source, 'total', path),
    status: readString(source, 'status', path),
    paymentMethod: readNullableString(source, 'paymentMethod', path),
    issuedAt: readDateTime(source, 'issuedAt', path),
    paidAt: readNullableDateTime(source, 'paidAt', path),
    lines,
  };
}

/**
 * Validates the complete JobDetailDto returned by
 * GET /api/v1/manager/jobs/{id} (WorkshopDtos.cs:47-48).
 */
export function validateJobDetailResponse(
  response: unknown,
  path = 'jobDetail',
): JobDetailDto {
  const source = readObject(response, path);

  const job = validateJobCardSummaryResponse(
    source['job'],
    `${path}.job`,
  );
  const jobIdKey = job.id.toLowerCase();

  const rawTimeline = source['timeline'];
  if (!Array.isArray(rawTimeline)) {
    throw new JobCardResponseError(`${path}.timeline`);
  }
  const timeline = rawTimeline.map((entry: unknown, index) =>
    validateProgressResponse(entry, `${path}.timeline[${index}]`),
  );

  const rawIssues = source['issues'];
  if (!Array.isArray(rawIssues)) {
    throw new JobCardResponseError(`${path}.issues`);
  }
  const issues = rawIssues.map((issue: unknown, index) =>
    validateIssueResponse(issue, `${path}.issues[${index}]`),
  );
  assertUniqueIds(issues, `${path}.issues`);

  const rawProposals = source['proposals'];
  if (!Array.isArray(rawProposals)) {
    throw new JobCardResponseError(`${path}.proposals`);
  }
  const proposals = rawProposals.map((proposal: unknown, index) => {
    const validated = reuseValidator(() =>
      validateProposalResponse(
        proposal,
        `${path}.proposals[${index}]`,
      ),
    );

    if (validated.jobCardId.toLowerCase() !== jobIdKey) {
      throw new JobCardResponseError(
        `${path}.proposals[${index}].jobCardId`,
      );
    }

    return validated;
  });
  assertUniqueIds(proposals, `${path}.proposals`);

  const rawChangeRequests = source['changeRequests'];
  if (!Array.isArray(rawChangeRequests)) {
    throw new JobCardResponseError(`${path}.changeRequests`);
  }
  const changeRequests = rawChangeRequests.map((cr: unknown, index) => {
    const validated = reuseValidator(() =>
      validateChangeRequestResponse(
        cr,
        `${path}.changeRequests[${index}]`,
      ),
    );

    if (validated.jobCardId.toLowerCase() !== jobIdKey) {
      throw new JobCardResponseError(
        `${path}.changeRequests[${index}].jobCardId`,
      );
    }

    return validated;
  });
  assertUniqueIds(changeRequests, `${path}.changeRequests`);

  const invoice =
    source['invoice'] === null
      ? null
      : validateInvoiceResponse(source['invoice'], `${path}.invoice`);

  if (invoice !== null && invoice.jobCardId.toLowerCase() !== jobIdKey) {
    throw new JobCardResponseError(`${path}.invoice.jobCardId`);
  }

  const queue = validateQueueEstimateResponse(
    source['queue'],
    `${path}.queue`,
  );

  if (queue.jobId.toLowerCase() !== jobIdKey) {
    throw new JobCardResponseError(`${path}.queue.jobId`);
  }

  return {
    job,
    timeline,
    issues,
    proposals,
    changeRequests,
    invoice,
    queue,
  };
}

export function validateJobCardId(
  value: unknown,
  field = 'jobId',
): string {
  if (
    typeof value !== 'string' ||
    !UUID_PATTERN.test(value) ||
    value === EMPTY_UUID
  ) {
    throw new JobCardRequestError(field);
  }

  return value;
}

export function validateJobListQuery(
  query: unknown,
): JobListQuery {
  if (query === undefined || query === null) {
    return { activeOnly: true, customerId: null };
  }

  if (typeof query !== 'object' || Array.isArray(query)) {
    throw new JobCardRequestError('query');
  }

  const source = query as Record<string, unknown>;
  const rawActiveOnly = source['activeOnly'];
  const rawCustomerId = source['customerId'];

  const activeOnly =
    rawActiveOnly === undefined
      ? true
      : typeof rawActiveOnly === 'boolean'
        ? rawActiveOnly
        : (() => {
            throw new JobCardRequestError('activeOnly');
          })();

  let customerId: string | null = null;

  if (rawCustomerId !== undefined && rawCustomerId !== null) {
    customerId = validateJobCardId(rawCustomerId, 'customerId');
  }

  return { activeOnly, customerId };
}
