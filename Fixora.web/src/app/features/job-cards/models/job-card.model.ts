import type { JobSummaryDto } from '../../bookings/models/booking-support.model';

import type {
  ChangeRequestDto,
  ProposalDto,
} from '../../fixproof-review/models/fixproof.model';

export type { JobSummaryDto };

/**
 * Job Cards DTOs, enums, query contracts, and safe error types.
 *
 * Verified against:
 * - Fixora.Manager.Contracts/WorkshopDtos.cs
 * - Fixora.Manager.Domain/Jobs.cs
 * - Fixora.Manager.Domain/Billing.cs
 * - Fixora.Manager.Application/Common/WorkshopReadModel.cs
 * - Fixora.Manager.Application/Jobs/JobService.cs
 */

/** Hard backend cap in JobService.ListAsync (Take(200)). */
export const JOB_CARDS_LIST_LIMIT = 200;

/** Known backend JobStatus enum values (Jobs.cs lines 5-16). */
export const JOB_STATUSES = [
  'Open',
  'Inspecting',
  'AwaitingManagerReview',
  'AwaitingCustomerApproval',
  'AwaitingRelease',
  'InProgress',
  'Paused',
  'Completed',
  'Closed',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

/** Terminal job statuses excluded when activeOnly=true (Jobs.cs line 45). */
export const JOB_TERMINAL_STATUSES = [
  'Completed',
  'Closed',
] as const;

export type JobTerminalStatus = (typeof JOB_TERMINAL_STATUSES)[number];

/** Known backend IssueSeverity enum values (Jobs.cs line 113). */
export const ISSUE_SEVERITIES = [
  'Safe',
  'Attention',
  'Urgent',
] as const;

export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

/** Known backend InvoiceStatus enum values (Billing.cs line 5). */
export const INVOICE_STATUSES = [
  'Unpaid',
  'Paid',
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** Matches QueueEstimateDto in WorkshopDtos.cs (line 19). */
export interface QueueEstimateDto {
  readonly jobId: string;
  readonly position: number;
  readonly etaAt: string | null;
  readonly status: string;
  readonly indicative: boolean;
}

/** Matches ProgressDto in WorkshopDtos.cs (line 21). */
export interface ProgressDto {
  readonly stage: string;
  readonly message: string;
  readonly percent: number;
  readonly actorRole: string;
  readonly at: string;
}

/** Matches IssueDto in WorkshopDtos.cs (lines 27-28). */
export interface IssueDto {
  readonly id: string;
  readonly component: string;
  readonly findingEn: string;
  readonly findingTa: string;
  readonly recommendationEn: string;
  readonly recommendationTa: string;
  readonly severity: string;
  readonly mediaUrls: readonly string[];
  readonly reportVersion: number;
  readonly confirmedAt: string;
}

/** Matches InvoiceLineDto in WorkshopDtos.cs (line 42). */
export interface InvoiceLineDto {
  readonly description: string;
  readonly qty: number;
  readonly unitPrice: number;
  readonly amount: number;
}

/** Matches InvoiceDto in WorkshopDtos.cs (lines 44-45). */
export interface InvoiceDto {
  readonly id: string;
  readonly number: string;
  readonly jobCardId: string;
  readonly customerId: string;
  readonly subtotal: number;
  readonly tax: number;
  readonly loyaltyDiscount: number;
  readonly total: number;
  readonly status: string;
  readonly paymentMethod: string | null;
  readonly issuedAt: string;
  readonly paidAt: string | null;
  readonly lines: readonly InvoiceLineDto[];
}

/** Matches JobDetailDto in WorkshopDtos.cs (lines 47-48). */
export interface JobDetailDto {
  readonly job: JobSummaryDto;
  readonly timeline: readonly ProgressDto[];
  readonly issues: readonly IssueDto[];
  readonly proposals: readonly ProposalDto[];
  readonly changeRequests: readonly ChangeRequestDto[];
  readonly invoice: InvoiceDto | null;
  readonly queue: QueueEstimateDto;
}

/** Query parameters for GET /api/v1/manager/jobs. */
export interface JobListQuery {
  readonly activeOnly?: boolean;
  readonly customerId?: string | null;
}

export type JobCardsOperation = 'read' | 'mutation';

export type JobCardsErrorKind =
  | 'invalid-request'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'validation-error'
  | 'rate-limited'
  | 'network-failure'
  | 'server-failure'
  | 'invalid-response'
  | 'unknown';

export type JobCardsMutationOutcome =
  | 'not-applicable'
  | 'rejected'
  | 'uncertain';

export interface JobCardsErrorResolution {
  readonly kind: JobCardsErrorKind;
  readonly outcome: JobCardsMutationOutcome;
  readonly message: string;
  readonly requiresRefresh: boolean;
  readonly requiresSignIn: boolean;
}

export function isKnownJobStatus(value: string): value is JobStatus {
  return (JOB_STATUSES as readonly string[]).includes(value);
}

export function isTerminalJobStatus(
  value: string,
): value is JobTerminalStatus {
  return (JOB_TERMINAL_STATUSES as readonly string[]).includes(value);
}

export function isKnownIssueSeverity(
  value: string,
): value is IssueSeverity {
  return (ISSUE_SEVERITIES as readonly string[]).includes(value);
}

export function isKnownInvoiceStatus(
  value: string,
): value is InvoiceStatus {
  return (INVOICE_STATUSES as readonly string[]).includes(value);
}
