/**
 * FixProof approval workflow & change request DTOs, constants,
 * request contracts, pricing/eligibility models, and safe error types.
 *
 * Verified against:
 * - Fixora.Manager.Contracts/WorkshopDtos.cs
 * - Fixora.Manager.Domain/Approvals.cs
 * - Fixora.Manager.Api/Controllers/ManagerControllers.cs
 * - Fixora.Manager.Application/Approvals/ApprovalWorkflowService.cs
 * - Fixora.Manager.Application/Approvals/ChangeRequestService.cs
 * - Fixora.Manager.Infrastructure/Persistence/ManagerDbContext.cs
 */

/** Hard backend cap in ApprovalWorkflowService.ListForStaffAsync (Take(100)). */
export const FIXPROOF_PROPOSALS_LIST_LIMIT = 100;

/** Hard backend cap in ChangeRequestService.ListForStaffAsync (Take(100)). */
export const FIXPROOF_CHANGE_REQUESTS_LIST_LIMIT = 100;

/** BR-FP-08 tolerance fraction (10% = 1/10) from ApprovalWorkflowService.RevisionTolerance. */
export const FIXPROOF_REVISION_TOLERANCE_PERCENT = 10;

/** C# PriceRequest.Qty is Int32 (qty > 0). */
export const FIXPROOF_MIN_QTY = 1;
export const FIXPROOF_MAX_QTY = 2_147_483_647;

/** SQL Server decimal(18, 2) scale from ManagerDbContext.ConfigureConventions. */
export const FIXPROOF_MAX_DECIMAL_SCALE = 2;

/**
 * Maximum unit price in minor units (cents = Rs * 100) guaranteed to
 * preserve exact 2-decimal cent distinctions and round-trip without
 * IEEE-754 binary64 collisions when serialized as a JSON number.
 *
 * Derivation: IEEE-754 binary64 has a 53-bit significand, so in [2^e, 2^(e+1))
 * consecutive doubles are spaced by ulp = 2^(e - 52). Requiring ulp < 0.01
 * yields 2^(e - 52) < 1/100 => e <= 45 (x < 2^46 = 70_368_744_177_664, where
 * ulp <= 2^-7 = 0.0078125 < 0.01). Above 2^46, ulp becomes 2^-6 = 0.015625
 * and distinct cent values collide (e.g. 70_368_744_177_664.01 rounds to .02).
 *
 * Stricter frontend limit than Number.MAX_SAFE_INTEGER cents
 * (90_071_992_547_409.91) and SQL Server decimal(18, 2) max
 * (9_999_999_999_999_999.99):
 * 7_036_874_417_766_399n cents = 70_368_744_177_663.99 (< 2^46).
 */
export const FIXPROOF_MAX_UNIT_PRICE_CENTS = 7_036_874_417_766_399n;

/**
 * Maximum line/total amount in minor units (cents) supported by
 * SQL Server decimal(18, 2): 9_999_999_999_999_999.99.
 */
export const FIXPROOF_MAX_SQL_DECIMAL_CENTS = 999_999_999_999_999_999n;

/** Known backend ProposalStatus enum values (Approvals.cs). */
export const PROPOSAL_STATUSES = [
  'PendingManagerReview',
  'ReturnedToMechanic',
  'AwaitingCustomer',
  'CustomerResponded',
  'ReleasedToMechanic',
  'Cancelled',
] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/** Known backend RepairItemStatus enum values (Approvals.cs). */
export const REPAIR_ITEM_STATUSES = [
  'Proposed',
  'AwaitingCustomer',
  'Approved',
  'Rejected',
  'Released',
] as const;

export type RepairItemStatus = (typeof REPAIR_ITEM_STATUSES)[number];

/** Known backend RepairItemKind enum values (Approvals.cs). */
export const REPAIR_ITEM_KINDS = [
  'Part',
  'Labour',
] as const;

export type RepairItemKind = (typeof REPAIR_ITEM_KINDS)[number];

/** Known backend ChangeRequestStatus enum values (Approvals.cs). */
export const CHANGE_REQUEST_STATUSES = [
  'PendingManagerReview',
  'ForwardedToMechanic',
  'Declined',
  'Acknowledged',
] as const;

export type ChangeRequestStatus =
  (typeof CHANGE_REQUEST_STATUSES)[number];

/**
 * Matches RepairItemDto in WorkshopDtos.cs (line 30).
 * Enum fields are stored as `string` so unknown future backend values
 * do not break deserialization; helpers classify known values safely.
 */
export interface RepairItemDto {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly qty: number;
  readonly unitPrice: number;
  readonly amount: number;
  readonly version: number;
  readonly status: string;
  readonly linkedIssueId: string | null;
}

/** Matches AuditDto in WorkshopDtos.cs (line 32). */
export interface AuditDto {
  readonly actorRole: string;
  readonly action: string;
  readonly detail: string | null;
  readonly at: string;
}

/** Matches ProposalDto in WorkshopDtos.cs (lines 34-37). */
export interface ProposalDto {
  readonly id: string;
  readonly jobCardId: string;
  readonly jobNumber: string;
  readonly vehicleLabel: string;
  readonly customerName: string;
  readonly status: string;
  readonly mechanicId: string;
  readonly mechanicName: string | null;
  readonly mechanicNote: string | null;
  readonly managerNote: string | null;
  readonly customerNote: string | null;
  readonly submittedAt: string;
  readonly publishedAt: string | null;
  readonly respondedAt: string | null;
  readonly releasedAt: string | null;
  readonly total: number;
  readonly approvedTotal: number;
  readonly items: readonly RepairItemDto[];
  readonly audit: readonly AuditDto[];
}

/** Matches ChangeRequestDto in WorkshopDtos.cs (lines 39-40). */
export interface ChangeRequestDto {
  readonly id: string;
  readonly jobCardId: string;
  readonly jobNumber: string;
  readonly number: string;
  readonly changes: readonly string[];
  readonly details: string;
  readonly status: string;
  readonly managerNote: string | null;
  readonly mechanicNote: string | null;
  readonly createdAt: string;
}

/** Matches PriceRequest(decimal UnitPrice, int Qty) in ManagerControllers.cs (line 32). */
export interface PriceRequest {
  readonly unitPrice: number;
  readonly qty: number;
}

/** Matches NoteRequest(string? Note) in ManagerControllers.cs (line 31). */
export interface NoteRequest {
  readonly note: string | null;
}

/** Query parameters for GET /api/v1/manager/approvals/proposals. */
export interface ProposalListQuery {
  readonly status?: ProposalStatus | null;
}

/** Query parameters for GET /api/v1/manager/approvals/change-requests. */
export interface ChangeRequestListQuery {
  readonly pendingOnly?: boolean;
}

/** Manager actions on a repair proposal. */
export type ProposalManagerAction =
  | 'set-price'
  | 'forward'
  | 'return'
  | 'release'
  | 'revise';

/** Manager actions on a customer change request. */
export type ChangeRequestManagerAction =
  | 'forward'
  | 'decline';

/** Whether an item edit uses pre-forward pricing or post-forward revision. */
export type ProposalItemEditMode =
  | 'set-price'
  | 'revise'
  | 'none';

/**
 * Authoritative job context required by frontend safety checks.
 * Missing or unrecognized job status is treated as unresolved,
 * never automatically allowed.
 */
export interface AuthoritativeJobContext {
  readonly jobStatus?: string | null;
}

export type FixProofEligibilityStatus =
  | 'allowed'
  | 'blocked-by-backend'
  | 'blocked-by-frontend-safety'
  | 'unresolved';

export type FixProofRestrictionReason =
  | 'unknown-proposal-status'
  | 'proposal-status-disallows-action'
  | 'proposal-not-published'
  | 'unknown-item-status'
  | 'released-proposal-revision-restricted'
  | 'released-item-revision-restricted'
  | 'terminal-job-status'
  | 'missing-authoritative-job-status'
  | 'unknown-job-status'
  | 'unknown-change-request-status'
  | 'change-request-already-handled';

export interface FixProofActionEligibility {
  /** Whether the backend state machine accepts this action. */
  readonly backendSupported: boolean;
  /** Whether the frontend permits executing this action. */
  readonly frontendAllowed: boolean;
  readonly status: FixProofEligibilityStatus;
  readonly reason: FixProofRestrictionReason | null;
  readonly message: string | null;
}

export interface FixProofItemEditEligibility {
  readonly mode: ProposalItemEditMode;
  readonly eligibility: FixProofActionEligibility;
}

export type MoneyParseErrorCode =
  | 'required'
  | 'invalid-format'
  | 'negative'
  | 'excessive-precision'
  | 'overflow';

export type QuantityParseErrorCode =
  | 'required'
  | 'invalid-format'
  | 'non-positive'
  | 'overflow';

export type MoneyParseResult =
  | {
      readonly ok: true;
      readonly cents: bigint;
      readonly numericValue: number;
      readonly formatted: string;
    }
  | {
      readonly ok: false;
      readonly error: MoneyParseErrorCode;
    };

export type QuantityParseResult =
  | {
      readonly ok: true;
      readonly qty: number;
    }
  | {
      readonly ok: false;
      readonly error: QuantityParseErrorCode;
    };

export type RevisionImpactTrigger =
  | 'previously-unaccepted'
  | 'quantity-changed'
  | 'zero-to-positive'
  | 'exceeds-tolerance';

export type RevisionImpactErrorCode =
  | 'invalid-current-price'
  | 'invalid-current-qty'
  | 'invalid-proposed-price'
  | 'invalid-proposed-qty'
  | 'unknown-item-status'
  | 'amount-overflow';

export interface FixProofRevisionImpactInput {
  readonly currentUnitPrice: number | string;
  readonly currentQty: number | string;
  readonly currentItemStatus: string;
  readonly proposedUnitPrice: number | string;
  readonly proposedQty: number | string;
}

export type FixProofRevisionImpactResult =
  | {
      readonly ok: true;
      /** Always indicative; server-returned ProposalDto is authoritative. */
      readonly indicative: true;
      readonly oldAmountCents: bigint;
      readonly newAmountCents: bigint;
      readonly deltaCents: bigint;
      readonly oldAmountFormatted: string;
      readonly newAmountFormatted: string;
      readonly deltaFormatted: string;
      readonly wasAccepted: boolean;
      readonly qtyChanged: boolean;
      readonly exceedsTolerance: boolean;
      readonly needsRenewedApproval: boolean;
      readonly triggers: readonly RevisionImpactTrigger[];
    }
  | {
      readonly ok: false;
      readonly error: RevisionImpactErrorCode;
    };

export type FixProofOperation = 'read' | 'mutation';

export type FixProofErrorKind =
  | 'invalid-request'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'proposal-wrong-state'
  | 'proposal-not-published'
  | 'change-wrong-state'
  | 'concurrency-conflict'
  | 'conflict'
  | 'validation-error'
  | 'rate-limited'
  | 'network-failure'
  | 'server-failure'
  | 'invalid-response'
  | 'unknown';

export type FixProofMutationOutcome =
  | 'not-applicable'
  | 'rejected'
  | 'uncertain';

export interface FixProofErrorResolution {
  readonly kind: FixProofErrorKind;
  readonly outcome: FixProofMutationOutcome;
  readonly message: string;
  readonly requiresRefresh: boolean;
  readonly requiresSignIn: boolean;
}
