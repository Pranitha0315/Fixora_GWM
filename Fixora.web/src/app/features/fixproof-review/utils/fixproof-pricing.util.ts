import {
  isKnownJobStatus,
  isTerminalJobStatus,
} from '../../job-cards/models/job-card.model';

import {
  CHANGE_REQUEST_STATUSES,
  FIXPROOF_MAX_QTY,
  FIXPROOF_MAX_SQL_DECIMAL_CENTS,
  FIXPROOF_MAX_UNIT_PRICE_CENTS,
  FIXPROOF_MIN_QTY,
  PROPOSAL_STATUSES,
  REPAIR_ITEM_KINDS,
  REPAIR_ITEM_STATUSES,
} from '../models/fixproof.model';

import type {
  AuthoritativeJobContext,
  ChangeRequestManagerAction,
  ChangeRequestStatus,
  FixProofActionEligibility,
  FixProofItemEditEligibility,
  FixProofRevisionImpactInput,
  FixProofRevisionImpactResult,
  MoneyParseResult,
  ProposalManagerAction,
  ProposalStatus,
  QuantityParseResult,
  RepairItemKind,
  RepairItemStatus,
  RevisionImpactTrigger,
} from '../models/fixproof.model';

const DECIMAL_2_PATTERN = /^\d+(?:\.\d{1,2})?$/;
const EXCESSIVE_DECIMAL_PATTERN = /^\d+\.\d{3,}$/;
const DIGITS_ONLY_PATTERN = /^\d+$/;
const NEGATIVE_DIGITS_PATTERN = /^-\d+$/;
const NEGATIVE_DECIMAL_PATTERN = /^-\d+(?:\.\d+)?$/;

export function isKnownProposalStatus(
  value: string,
): value is ProposalStatus {
  return (PROPOSAL_STATUSES as readonly string[]).includes(value);
}

export function isKnownRepairItemStatus(
  value: string,
): value is RepairItemStatus {
  return (REPAIR_ITEM_STATUSES as readonly string[]).includes(value);
}

export function isKnownRepairItemKind(
  value: string,
): value is RepairItemKind {
  return (REPAIR_ITEM_KINDS as readonly string[]).includes(value);
}

export function isKnownChangeRequestStatus(
  value: string,
): value is ChangeRequestStatus {
  return (CHANGE_REQUEST_STATUSES as readonly string[]).includes(value);
}

/**
 * Formats an exact BigInt minor-unit amount (cents = Rs * 100) into a
 * canonical 2-decimal string without binary floating-point conversion.
 */
export function formatCents(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = absolute / 100n;
  const frac = (absolute % 100n).toString().padStart(2, '0');

  return `${negative ? '-' : ''}${whole.toString()}.${frac}`;
}

function roundTripsExactCents(
  numericValue: number,
  expectedCents: bigint,
): boolean {
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return false;
  }

  const serialized = String(numericValue);

  if (!DECIMAL_2_PATTERN.test(serialized)) {
    return false;
  }

  const [wholePart, fracPart = ''] = serialized.split('.');
  const roundTrippedCents =
    BigInt(wholePart) * 100n + BigInt(fracPart.padEnd(2, '0'));

  return roundTrippedCents === expectedCents;
}

/**
 * Parses a non-negative monetary amount into exact scaled BigInt cents
 * (scale 2, matching SQL Server decimal(18, 2)).
 * Rejects NaN, Infinity, negative numbers, scientific notation,
 * excessive decimal places (> 2), and values above collision-free
 * IEEE-754 binary64 JSON round-trip limits (`< 2^46`, i.e., `70_368_744_177_663.99`).
 */
export function parseMoneyToCents(
  input: string | number,
): MoneyParseResult {
  let raw: string;

  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      return { ok: false, error: 'invalid-format' };
    }

    if (input < 0) {
      return { ok: false, error: 'negative' };
    }

    raw = String(input);

    if (/[eE]/.test(raw)) {
      return {
        ok: false,
        error: input >= 1 ? 'overflow' : 'excessive-precision',
      };
    }
  } else if (typeof input === 'string') {
    raw = input.trim();

    if (!raw) {
      return { ok: false, error: 'required' };
    }
  } else {
    return { ok: false, error: 'invalid-format' };
  }

  if (NEGATIVE_DECIMAL_PATTERN.test(raw)) {
    return { ok: false, error: 'negative' };
  }

  if (EXCESSIVE_DECIMAL_PATTERN.test(raw)) {
    return { ok: false, error: 'excessive-precision' };
  }

  if (!DECIMAL_2_PATTERN.test(raw)) {
    return { ok: false, error: 'invalid-format' };
  }

  const [wholePart, fracPart = ''] = raw.split('.');
  const cents =
    BigInt(wholePart) * 100n + BigInt(fracPart.padEnd(2, '0'));

  if (cents > FIXPROOF_MAX_UNIT_PRICE_CENTS) {
    return { ok: false, error: 'overflow' };
  }

  const formatted = formatCents(cents);
  const numericValue = Number(formatted);

  if (!roundTripsExactCents(numericValue, cents)) {
    return { ok: false, error: 'overflow' };
  }

  return {
    ok: true,
    cents,
    numericValue,
    formatted,
  };
}

/**
 * Parses a positive Int32 quantity matching C# PriceRequest.Qty
 * (`int Qty`, `qty > 0`, max `2_147_483_647`).
 */
export function parseQuantity(
  input: string | number,
): QuantityParseResult {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || !Number.isInteger(input)) {
      return { ok: false, error: 'invalid-format' };
    }

    if (input < FIXPROOF_MIN_QTY) {
      return { ok: false, error: 'non-positive' };
    }

    if (input > FIXPROOF_MAX_QTY) {
      return { ok: false, error: 'overflow' };
    }

    return { ok: true, qty: input };
  }

  if (typeof input !== 'string') {
    return { ok: false, error: 'invalid-format' };
  }

  const raw = input.trim();

  if (!raw) {
    return { ok: false, error: 'required' };
  }

  if (NEGATIVE_DIGITS_PATTERN.test(raw)) {
    return { ok: false, error: 'non-positive' };
  }

  if (!DIGITS_ONLY_PATTERN.test(raw)) {
    return { ok: false, error: 'invalid-format' };
  }

  const value = BigInt(raw);

  if (value < BigInt(FIXPROOF_MIN_QTY)) {
    return { ok: false, error: 'non-positive' };
  }

  if (value > BigInt(FIXPROOF_MAX_QTY)) {
    return { ok: false, error: 'overflow' };
  }

  return { ok: true, qty: Number(value) };
}

/**
 * Computes exact line total in cents, returning null if it exceeds
 * SQL Server decimal(18, 2) max (`999_999_999_999_999_999n` cents).
 */
export function calculateLineAmountCents(
  unitPriceCents: bigint,
  qty: number,
): bigint | null {
  if (
    unitPriceCents < 0n ||
    !Number.isSafeInteger(qty) ||
    qty < FIXPROOF_MIN_QTY ||
    qty > FIXPROOF_MAX_QTY
  ) {
    return null;
  }

  const amount = unitPriceCents * BigInt(qty);

  return amount <= FIXPROOF_MAX_SQL_DECIMAL_CENTS ? amount : null;
}

/**
 * Evaluates BR-FP-08 renewed-approval impact using exact BigInt
 * scaled-integer arithmetic (zero binary floating-point decisions).
 *
 * Matches Approvals.cs:149-167 with RevisionTolerance = 0.10m:
 * - oldAmount = currentQty * currentUnitPrice
 * - newAmount = proposedQty * proposedUnitPrice
 * - increase = oldAmount == 0 ? (newAmount > 0 ? 1m : 0m) : (newAmount - oldAmount) / oldAmount
 * - wasAccepted = status is Approved or Released
 * - needsApproval = !wasAccepted || proposedQty != currentQty || increase > 0.10m
 *
 * For oldAmount > 0, `(newAmount - oldAmount) / oldAmount > 1/10` is
 * algebraically identical to `10n * (newCents - oldCents) > oldCents`.
 *
 * All frontend outputs are strictly indicative; the server-returned
 * ProposalDto remains authoritative.
 */
export function evaluateRevisionImpact(
  input: FixProofRevisionImpactInput,
): FixProofRevisionImpactResult {
  if (!isKnownRepairItemStatus(input.currentItemStatus)) {
    return { ok: false, error: 'unknown-item-status' };
  }

  const oldPrice = parseMoneyToCents(input.currentUnitPrice);
  if (!oldPrice.ok) {
    return { ok: false, error: 'invalid-current-price' };
  }

  const oldQty = parseQuantity(input.currentQty);
  if (!oldQty.ok) {
    return { ok: false, error: 'invalid-current-qty' };
  }

  const newPrice = parseMoneyToCents(input.proposedUnitPrice);
  if (!newPrice.ok) {
    return { ok: false, error: 'invalid-proposed-price' };
  }

  const newQty = parseQuantity(input.proposedQty);
  if (!newQty.ok) {
    return { ok: false, error: 'invalid-proposed-qty' };
  }

  const oldAmountCents = calculateLineAmountCents(
    oldPrice.cents,
    oldQty.qty,
  );
  const newAmountCents = calculateLineAmountCents(
    newPrice.cents,
    newQty.qty,
  );

  if (oldAmountCents === null || newAmountCents === null) {
    return { ok: false, error: 'amount-overflow' };
  }

  const deltaCents = newAmountCents - oldAmountCents;
  const wasAccepted =
    input.currentItemStatus === 'Approved' ||
    input.currentItemStatus === 'Released';
  const qtyChanged = newQty.qty !== oldQty.qty;
  const zeroToPositive =
    oldAmountCents === 0n && newAmountCents > 0n;
  const exceedsTolerance =
    oldAmountCents === 0n
      ? newAmountCents > 0n
      : 10n * deltaCents > oldAmountCents;

  const triggers: RevisionImpactTrigger[] = [];

  if (!wasAccepted) {
    triggers.push('previously-unaccepted');
  }
  if (qtyChanged) {
    triggers.push('quantity-changed');
  }
  if (zeroToPositive) {
    triggers.push('zero-to-positive');
  } else if (exceedsTolerance) {
    triggers.push('exceeds-tolerance');
  }

  const needsRenewedApproval =
    !wasAccepted || qtyChanged || exceedsTolerance;

  return {
    ok: true,
    indicative: true,
    oldAmountCents,
    newAmountCents,
    deltaCents,
    oldAmountFormatted: formatCents(oldAmountCents),
    newAmountFormatted: formatCents(newAmountCents),
    deltaFormatted: formatCents(deltaCents),
    wasAccepted,
    qtyChanged,
    exceedsTolerance,
    needsRenewedApproval,
    triggers,
  };
}

/**
 * Pure backend eligibility rules for manager proposal actions
 * verified from Fixora.Manager.Domain/Approvals.cs (lines 69-168).
 * Returns null if proposalStatus is unrecognized.
 */
export function getBackendProposalActionSupport(
  proposalStatus: string,
  action: ProposalManagerAction,
): boolean | null {
  if (!isKnownProposalStatus(proposalStatus)) {
    return null;
  }

  switch (action) {
    case 'set-price':
    case 'forward':
    case 'return':
      return proposalStatus === 'PendingManagerReview';

    case 'release':
      return proposalStatus === 'CustomerResponded';

    case 'revise':
      return (
        proposalStatus === 'AwaitingCustomer' ||
        proposalStatus === 'CustomerResponded' ||
        proposalStatus === 'ReleasedToMechanic'
      );
  }
}

/**
 * Pure backend eligibility rules for manager change-request actions
 * verified from Fixora.Manager.Domain/Approvals.cs (lines 242-259).
 * Returns null if changeRequestStatus is unrecognized.
 */
export function getBackendChangeRequestActionSupport(
  changeRequestStatus: string,
  action: ChangeRequestManagerAction,
): boolean | null {
  if (!isKnownChangeRequestStatus(changeRequestStatus)) {
    return null;
  }

  switch (action) {
    case 'forward':
    case 'decline':
      return changeRequestStatus === 'PendingManagerReview';
  }
}

function evaluateJobContextRestriction(
  context: AuthoritativeJobContext | undefined,
): FixProofActionEligibility | null {
  const jobStatus = context?.jobStatus?.trim() ?? '';

  if (!jobStatus) {
    return {
      backendSupported: true,
      frontendAllowed: false,
      status: 'unresolved',
      reason: 'missing-authoritative-job-status',
      message:
        'Authoritative job status is unavailable. Refresh job details ' +
        'before performing this action.',
    };
  }

  if (!isKnownJobStatus(jobStatus)) {
    return {
      backendSupported: true,
      frontendAllowed: false,
      status: 'unresolved',
      reason: 'unknown-job-status',
      message:
        'Job status is unrecognized. Refresh and review the job card ' +
        'before performing this action.',
    };
  }

  if (isTerminalJobStatus(jobStatus)) {
    return {
      backendSupported: true,
      frontendAllowed: false,
      status: 'blocked-by-frontend-safety',
      reason: 'terminal-job-status',
      message:
        'Actions are blocked in the web portal for Completed or Closed jobs ' +
        'to prevent reactivating finished work.',
    };
  }

  return null;
}

/**
 * Evaluates both backend support and frontend safety restrictions
 * for a manager proposal action.
 */
export function evaluateProposalActionEligibility(
  proposalStatus: string,
  action: ProposalManagerAction,
  context?: AuthoritativeJobContext,
): FixProofActionEligibility {
  const backendSupported = getBackendProposalActionSupport(
    proposalStatus,
    action,
  );

  if (backendSupported === null) {
    return {
      backendSupported: false,
      frontendAllowed: false,
      status: 'unresolved',
      reason: 'unknown-proposal-status',
      message:
        'Proposal status is unrecognized. Refresh to verify current state.',
    };
  }

  if (!backendSupported) {
    if (action === 'revise') {
      return {
        backendSupported: false,
        frontendAllowed: false,
        status: 'blocked-by-backend',
        reason: 'proposal-not-published',
        message:
          'Post-forward revision is only supported for published proposals.',
      };
    }

    return {
      backendSupported: false,
      frontendAllowed: false,
      status: 'blocked-by-backend',
      reason: 'proposal-status-disallows-action',
      message:
        'This action is not permitted in the proposal\'s current status.',
    };
  }

  if (
    action === 'revise' &&
    proposalStatus === 'ReleasedToMechanic'
  ) {
    return {
      backendSupported: true,
      frontendAllowed: false,
      status: 'blocked-by-frontend-safety',
      reason: 'released-proposal-revision-restricted',
      message:
        'Revising a released proposal is disabled to prevent duplicate ' +
        'inventory consumption and invoice discrepancies.',
    };
  }

  const jobRestriction = evaluateJobContextRestriction(context);

  if (jobRestriction !== null) {
    return jobRestriction;
  }

  return {
    backendSupported: true,
    frontendAllowed: true,
    status: 'allowed',
    reason: null,
    message: null,
  };
}

/**
 * Evaluates post-forward item revision eligibility, preserving backend
 * rules separately from frontend safety blocks on Released proposals/items
 * and terminal/unresolved job states.
 */
export function evaluateProposalItemRevisionEligibility(
  proposalStatus: string,
  itemStatus: string,
  context?: AuthoritativeJobContext,
): FixProofActionEligibility {
  const backendSupported = getBackendProposalActionSupport(
    proposalStatus,
    'revise',
  );

  if (backendSupported === null) {
    return {
      backendSupported: false,
      frontendAllowed: false,
      status: 'unresolved',
      reason: 'unknown-proposal-status',
      message:
        'Proposal status is unrecognized. Refresh to verify current state.',
    };
  }

  if (!isKnownRepairItemStatus(itemStatus)) {
    return {
      backendSupported: false,
      frontendAllowed: false,
      status: 'unresolved',
      reason: 'unknown-item-status',
      message:
        'Repair item status is unrecognized. Refresh to verify current state.',
    };
  }

  if (!backendSupported) {
    return {
      backendSupported: false,
      frontendAllowed: false,
      status: 'blocked-by-backend',
      reason: 'proposal-not-published',
      message:
        'Post-forward revision is only supported for published proposals.',
    };
  }

  if (proposalStatus === 'ReleasedToMechanic') {
    return {
      backendSupported: true,
      frontendAllowed: false,
      status: 'blocked-by-frontend-safety',
      reason: 'released-proposal-revision-restricted',
      message:
        'Revising items on a released proposal is disabled to prevent ' +
        'duplicate inventory consumption and invoice discrepancies.',
    };
  }

  if (itemStatus === 'Released') {
    return {
      backendSupported: true,
      frontendAllowed: false,
      status: 'blocked-by-frontend-safety',
      reason: 'released-item-revision-restricted',
      message:
        'Revising a released item is disabled to prevent duplicate ' +
        'inventory consumption and invoice discrepancies.',
    };
  }

  const jobRestriction = evaluateJobContextRestriction(context);

  if (jobRestriction !== null) {
    return jobRestriction;
  }

  return {
    backendSupported: true,
    frontendAllowed: true,
    status: 'allowed',
    reason: null,
    message: null,
  };
}

/**
 * Determines whether a repair item should use pre-forward pricing,
 * post-forward revision, or remain read-only.
 */
export function evaluateProposalItemEditEligibility(
  proposalStatus: string,
  itemStatus: string,
  context?: AuthoritativeJobContext,
): FixProofItemEditEligibility {
  if (!isKnownProposalStatus(proposalStatus)) {
    return {
      mode: 'none',
      eligibility: {
        backendSupported: false,
        frontendAllowed: false,
        status: 'unresolved',
        reason: 'unknown-proposal-status',
        message:
          'Proposal status is unrecognized. Refresh to verify current state.',
      },
    };
  }

  if (proposalStatus === 'PendingManagerReview') {
    if (!isKnownRepairItemStatus(itemStatus)) {
      return {
        mode: 'set-price',
        eligibility: {
          backendSupported: false,
          frontendAllowed: false,
          status: 'unresolved',
          reason: 'unknown-item-status',
          message:
            'Repair item status is unrecognized. Refresh to verify current state.',
        },
      };
    }

    return {
      mode: 'set-price',
      eligibility: evaluateProposalActionEligibility(
        proposalStatus,
        'set-price',
        context,
      ),
    };
  }

  if (
    proposalStatus === 'AwaitingCustomer' ||
    proposalStatus === 'CustomerResponded' ||
    proposalStatus === 'ReleasedToMechanic'
  ) {
    return {
      mode: 'revise',
      eligibility: evaluateProposalItemRevisionEligibility(
        proposalStatus,
        itemStatus,
        context,
      ),
    };
  }

  return {
    mode: 'none',
    eligibility: {
      backendSupported: false,
      frontendAllowed: false,
      status: 'blocked-by-backend',
      reason: 'proposal-status-disallows-action',
      message:
        'Repair item pricing cannot be edited in this proposal status.',
    },
  };
}

/**
 * Evaluates both backend support and frontend safety restrictions
 * for a manager change-request action.
 */
export function evaluateChangeRequestActionEligibility(
  changeRequestStatus: string,
  action: ChangeRequestManagerAction,
  context?: AuthoritativeJobContext,
): FixProofActionEligibility {
  const backendSupported = getBackendChangeRequestActionSupport(
    changeRequestStatus,
    action,
  );

  if (backendSupported === null) {
    return {
      backendSupported: false,
      frontendAllowed: false,
      status: 'unresolved',
      reason: 'unknown-change-request-status',
      message:
        'Change request status is unrecognized. Refresh to verify current state.',
    };
  }

  if (!backendSupported) {
    return {
      backendSupported: false,
      frontendAllowed: false,
      status: 'blocked-by-backend',
      reason: 'change-request-already-handled',
      message:
        'This change request has already been handled and cannot be modified.',
    };
  }

  const jobRestriction = evaluateJobContextRestriction(context);

  if (jobRestriction !== null) {
    return jobRestriction;
  }

  return {
    backendSupported: true,
    frontendAllowed: true,
    status: 'allowed',
    reason: null,
    message: null,
  };
}
