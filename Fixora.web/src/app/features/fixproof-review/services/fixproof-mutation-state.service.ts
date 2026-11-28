import {
  computed,
  effect,
  inject,
  Injectable,
  signal,
  untracked,
} from '@angular/core';

import type { EffectRef, OnDestroy, Signal } from '@angular/core';

import { defer, Subscription } from 'rxjs';
import type { Observable } from 'rxjs';

import { SessionService } from '../../../core/auth/session.service';
import type { AuthSession } from '../../../core/models/auth-session.model';

import type { JobDetailDto } from '../../job-cards/models/job-card.model';
import {
  Day06AuthorizationCoordinatorService,
  type Day06ForbiddenEvent,
  type Day06RequestProvenance,
} from '../../job-cards/services/day06-authorization-coordinator.service';
import { JobCardApiService } from '../../job-cards/services/job-card-api.service';
import { resolveJobCardsError } from '../../job-cards/utils/job-card-error.mapper';

import type {
  ChangeRequestDto,
  FixProofActionEligibility,
  FixProofErrorKind,
  PriceRequest,
  ProposalDto,
  RepairItemDto,
} from '../models/fixproof.model';

import { resolveFixProofError } from '../utils/fixproof-error.mapper';
import {
  evaluateChangeRequestActionEligibility,
  evaluateProposalActionEligibility,
  evaluateProposalItemEditEligibility,
  evaluateProposalItemRevisionEligibility,
} from '../utils/fixproof-pricing.util';
import {
  FixProofRequestError,
  FixProofResponseError,
  validateFixProofResourceId,
  validateOptionalNoteRequest,
  validatePriceRequest,
  validateRequiredNoteRequest,
} from '../utils/fixproof.validator';

import {
  FixProofActionBlockedError,
  FixProofApiOriginError,
  FixProofMutationApiService,
} from './fixproof-mutation-api.service';
import type {
  ChangeRequestActionContext,
  ProposalActionContext,
  ProposalItemActionContext,
} from './fixproof-mutation-api.service';
import { FixProofNavigationProtectionService } from './fixproof-navigation-protection.service';
import { FixProofStateService } from './fixproof-state.service';
import type {
  FixProofAccessRevocationKind,
  FixProofAdvisoryEligibility,
} from './fixproof-state.service';

/**
 * How often the local session validity is re-checked while an operation is
 * active or unresolved. This timer never performs HTTP.
 */
export const FIXPROOF_MUTATION_STATE_CHECK_INTERVAL_MS = 15_000;

export type FixProofMutationAction =
  | 'set-price'
  | 'revise'
  | 'forward'
  | 'return'
  | 'release'
  | 'forward-change-request'
  | 'decline-change-request';

export type FixProofMutationPhase =
  | 'idle'
  | 'validating'
  | 'submitting'
  | 'refreshing'
  | 'succeeded'
  | 'rejected'
  | 'uncertain'
  | 'reconciliation-required'
  | 'access-lost';

/** Synchronous answer to an execute call. Details live in `result()`. */
export type FixProofMutationStartRefusal =
  | 'destroyed'
  | 'busy'
  | 'unresolved-operation'
  | 'session-invalid'
  | 'access-revoked'
  | 'not-dispatched';

export interface FixProofMutationStartResult {
  readonly started: boolean;
  readonly reason: FixProofMutationStartRefusal | null;
}

export type FixProofNotDispatchedReason =
  | 'invalid-input'
  | 'selection-mismatch'
  | 'selection-unresolved'
  | 'eligibility-blocked'
  | 'entity-unresolved'
  | 'preflight-read-failed'
  | 'job-not-found'
  | 'job-identity-mismatch'
  | 'review-required'
  | 'selection-changed'
  | 'preflight-cancelled'
  | 'refused-by-api-gate'
  | 'api-not-configured';

export type FixProofChangedField =
  | 'job-status'
  | 'proposal-status'
  | 'proposal-total'
  | 'proposal-approved-total'
  | 'proposal-manager-note'
  | 'proposal-audit'
  | 'proposal-items'
  | 'item-version'
  | 'item-price'
  | 'item-quantity'
  | 'item-amount'
  | 'item-status'
  | 'change-request-status'
  | 'change-request-details'
  | 'change-request-changes'
  | 'change-request-note';

export type FixProofMutationStatus =
  | 'not-dispatched'
  | 'succeeded'
  | 'rejected'
  | 'uncertain'
  | 'access-lost';

export interface FixProofRefreshSummary {
  readonly list: 'refreshed' | 'failed';
  readonly detail: 'refreshed' | 'failed' | 'skipped';
  /** The K12 selection no longer matches the original operation. */
  readonly selectionChanged: boolean;
  /** The refreshed record differs from the validated mutation response. */
  readonly stateChangedSinceResponse: boolean;
}

/**
 * Final or current outcome of the latest operation. Messages are fixed and
 * safe; backend text is never copied. `succeeded` means the mutation response
 * validated; it never depends on the follow-up refresh succeeding.
 */
export interface FixProofMutationResult {
  readonly action: FixProofMutationAction;
  readonly status: FixProofMutationStatus;
  /** False means it is known that no mutation request was sent. */
  readonly dispatched: boolean;
  readonly reason: FixProofNotDispatchedReason | null;
  readonly errorKind: FixProofErrorKind | null;
  readonly message: string;
  /** The user must review refreshed data before trying anything again. */
  readonly reviewRequired: boolean;
  readonly changedFields: readonly FixProofChangedField[];
  readonly eligibility: FixProofActionEligibility | null;
  /** True when the server may have applied the change (never a claim either way). */
  readonly potentiallyExecuted: boolean;
  readonly confirmed: {
    readonly entityStatus: string;
    readonly itemVersion: number | null;
  } | null;
  readonly refresh: FixProofRefreshSummary | null;
}

/** Sanitized view of the operation. Notes and the session are never exposed. */
export interface FixProofOperationView {
  /** Local, in-memory attempt counter. Not an idempotency key or receipt. */
  readonly sequence: number;
  readonly action: FixProofMutationAction;
  readonly kind: 'proposal' | 'change-request';
  readonly entityId: string;
  readonly jobCardId: string;
  readonly itemId: string | null;
  readonly price: PriceRequest | null;
  readonly noteProvided: boolean;
  readonly dispatched: boolean;
}

export type FixProofReconciliationObservation =
  | 'consistent'
  | 'inconsistent'
  | 'entity-unavailable'
  | 'read-failed'
  /** The manager cancelled the read; nothing was observed. */
  | 'cancelled'
  | 'unresolved';

export interface FixProofReconciliationNote {
  readonly code: string;
  readonly message: string;
}

/**
 * Read-only observation of the original job. It is NEVER definitive proof
 * that this request did or did not execute.
 */
export interface FixProofReconciliation {
  readonly state: 'reading' | 'complete';
  readonly attempts: number;
  readonly observation: FixProofReconciliationObservation | null;
  readonly evidence: readonly FixProofReconciliationNote[];
  readonly warnings: readonly FixProofReconciliationNote[];
  readonly definitive: false;
  readonly readAt: Date | null;
}

export interface FixProofAccessLoss {
  readonly action: FixProofMutationAction;
  /** The request may have been executed; it cannot be reconciled any more. */
  readonly potentiallyExecuted: boolean;
  /** The mutation response had validated before access was lost. */
  readonly mutationConfirmed: boolean;
}

export interface FixProofAcknowledgement {
  readonly action: FixProofMutationAction;
  readonly observation: FixProofReconciliationObservation | null;
  readonly acknowledgedAt: Date;
  /** Acknowledgement is not proof of success or failure. */
  readonly proofOfOutcome: 'none';
}

export type FixProofAcknowledgeRefusal =
  | 'nothing-to-acknowledge'
  | 'review-required'
  | 'reconciliation-in-progress'
  | 'reconciliation-not-attempted'
  | 'destroyed';

export interface FixProofMutationInput {
  readonly unitPrice: number | string;
  readonly qty: number | string;
}

interface ItemSnapshot {
  readonly id: string;
  readonly version: number;
  readonly unitPrice: number;
  readonly qty: number;
  readonly amount: number;
  readonly status: string;
}

interface ProposalSnapshot {
  readonly id: string;
  readonly status: string;
  readonly total: number;
  readonly approvedTotal: number;
  readonly managerNote: string | null;
  readonly auditCount: number;
  readonly items: readonly ItemSnapshot[];
}

interface ChangeRequestSnapshot {
  readonly id: string;
  readonly status: string;
  readonly details: string;
  readonly changes: string;
  readonly managerNote: string | null;
}

interface Snapshot {
  readonly jobStatus: string;
  readonly timelineCount: number;
  readonly proposal: ProposalSnapshot | null;
  readonly changeRequest: ChangeRequestSnapshot | null;
}

interface Context {
  readonly sequence: number;
  readonly action: FixProofMutationAction;
  readonly kind: 'proposal' | 'change-request';
  readonly entityId: string;
  readonly jobCardId: string;
  readonly itemId: string | null;
  readonly price: PriceRequest | null;
  readonly note: string | null;
  readonly session: AuthSession;
  readonly reviewed: Snapshot;
}

type AccessLossCause = FixProofAccessRevocationKind | 'session-ended';

interface AccessLossFacts {
  readonly cause: AccessLossCause;
  readonly dispatched: boolean;
  readonly potentiallyExecuted: boolean;
  readonly mutationConfirmed: boolean;
}

interface EntityLookup {
  readonly state: 'ready' | 'missing' | 'mismatch';
  readonly proposal: ProposalDto | null;
  readonly changeRequest: ChangeRequestDto | null;
}

type PlanTargetId = 'list' | 'detail';
type PlanMode = 'success' | 'rejected' | 'uncertain';

interface PlanTarget {
  readonly id: PlanTargetId;
  state: 'waiting' | 'running' | 'ok' | 'failed' | 'skipped';
  before: Date | null;
  /** K12 manual cancellation count of the lane when the plan was created. */
  readonly cancellations: number;
}

/**
 * A dispatched mutation transport the manager stopped waiting for. It is not
 * aborted on purpose; it stays owned here, bound to its original operation,
 * session and job, until it settles, access for that session or job is lost,
 * or the service is destroyed. Its result is never applied.
 */
interface DetachedTransport {
  readonly subscription: Subscription;
  readonly sequence: number;
  readonly session: AuthSession;
  readonly jobCardId: string;
}

interface Plan {
  readonly mode: PlanMode;
  readonly sequence: number;
  readonly kind: 'proposal' | 'change-request';
  readonly entityId: string;
  readonly jobCardId: string;
  readonly session: AuthSession;
  readonly targets: PlanTarget[];
}

const ACTION_KIND: Readonly<
  Record<FixProofMutationAction, 'proposal' | 'change-request'>
> = {
  'set-price': 'proposal',
  revise: 'proposal',
  forward: 'proposal',
  return: 'proposal',
  release: 'proposal',
  'forward-change-request': 'change-request',
  'decline-change-request': 'change-request',
};

const NOT_DISPATCHED_MESSAGES: Readonly<
  Record<FixProofNotDispatchedReason, string>
> = {
  'invalid-input':
    'The submitted values are not valid. Nothing was sent to the server.',
  'selection-mismatch':
    'The action does not match the selected record. Nothing was sent to the server.',
  'selection-unresolved':
    'The selected record is not loaded, is outdated or could not be verified. Refresh and review it first. Nothing was sent to the server.',
  'eligibility-blocked':
    'This action is not available for the current state. Nothing was sent to the server.',
  'entity-unresolved':
    'The selected record or item could not be verified in the job details. Nothing was sent to the server.',
  'preflight-read-failed':
    'The latest job details could not be loaded to verify the action. Nothing was sent to the server.',
  'job-not-found':
    'The job could not be found. Nothing was sent to the server.',
  'job-identity-mismatch':
    'The job details did not match the selected record. Nothing was sent to the server.',
  'review-required':
    'The record changed after you reviewed it. Nothing was sent to the server. Review the updated details and try again.',
  'selection-changed':
    'The selection changed before the action could be sent. Nothing was sent to the server.',
  'preflight-cancelled':
    'The check of the latest job details was cancelled before the action was sent. Nothing was sent to the server.',
  'refused-by-api-gate':
    'The action was refused before it was sent. Nothing was sent to the server.',
  'api-not-configured':
    'The API origin is not configured or invalid. Nothing was sent to the server.',
};

const ACCESS_LOST_MESSAGE =
  'Access was lost. Sign in again. If an action was in progress, it may or may not have been applied.';

const ACCESS_LOST_NOT_SENT_MESSAGE =
  'Access was lost before the action was sent. Nothing was sent to the server. Sign in again.';

const ACCESS_LOST_NOT_APPLIED_MESSAGE =
  'The server did not apply the action and access was lost. Sign in again.';

const ACCESS_LOST_CONFIRMED_MESSAGE =
  'The server confirmed the change, but access was lost before the latest details could be loaded. Sign in again.';

const UNRESOLVED_RECONCILIATION_MESSAGE =
  'The latest state could not prove whether this request was applied.';

/**
 * Stopping the wait is local only: the request was already sent, the server
 * may have applied it or may still apply it, and nothing is cancelled there.
 */
const STOPPED_WAITING_MESSAGE =
  'You stopped waiting for the server. The request was already sent and may already have been applied, or may still be applied later. Nothing was cancelled on the server. Check the latest state before doing anything else.';

const RECONCILIATION_CANCELLED_NOTE: FixProofReconciliationNote = {
  code: 'reconciliation-cancelled',
  message: 'The check of the latest state was cancelled, so nothing was observed.',
};

const ORIGINAL_REQUEST_PENDING_NOTE: FixProofReconciliationNote = {
  code: 'original-request-still-pending',
  message: 'The original request has not answered yet. It may still be applied after this check.',
};

function sameId(left: string | null, right: string | null): boolean {
  return (
    left !== null &&
    right !== null &&
    left.toLowerCase() === right.toLowerCase()
  );
}

function note(code: string, message: string): FixProofReconciliationNote {
  return { code, message };
}

const EVIDENCE = {
  valuesMatch: note(
    'item-matches-requested-values',
    'The item price and quantity match the requested values.',
  ),
  versionAdvanced: note(
    'item-version-advanced',
    'The item version is higher than before the request.',
  ),
  versionUnchanged: note(
    'item-version-unchanged',
    'The item version is unchanged, as expected for setting a price.',
  ),
  statusMatches: note(
    'status-matches-requested-transition',
    'The record status matches the status this action produces.',
  ),
  statusPastTarget: note(
    'status-past-forwarded',
    'The request is already past the forwarded status.',
  ),
  jobStatusMatches: note(
    'job-status-matches-transition',
    'The job status matches the status this action produces.',
  ),
  noteMatches: note(
    'manager-note-matches',
    'The manager note matches the submitted note.',
  ),
  auditObserved: note(
    'audit-entry-observed',
    'A new manager audit entry with the expected action text was observed.',
  ),
  releaseStamp: note(
    'release-timestamp-present',
    'The proposal now has a release time.',
  ),
  itemsReleased: note(
    'approved-items-released',
    'Items that were approved are now released.',
  ),
  progressEntry: note(
    'approved-work-progress-entry',
    'A new "Approved work" progress entry was observed.',
  ),
} as const;

const WARNINGS = {
  notUnique: note(
    'not-proof-of-this-request',
    'The observed state would look the same if another person or request caused it.',
  ),
  baselineAlready: note(
    'baseline-already-matched',
    'The state already matched the requested outcome before the request, so it cannot show the request ran.',
  ),
  mayStillExecute: note(
    'may-still-execute-later',
    'An unchanged state does not prove the request cannot still be applied.',
  ),
  concurrent: note(
    'concurrent-change-observed',
    'The record was changed by something other than the requested values.',
  ),
  versionJump: note(
    'multiple-version-changes',
    'The item version advanced more than once.',
  ),
  backendApproval: note(
    'renewed-approval-decided-by-backend',
    'Whether the customer must approve again is decided by the backend, not by this app.',
  ),
  releaseSideEffects: note(
    'release-side-effects-unverified',
    'Inventory deductions, queue recalculation and notifications cannot be verified from the job details.',
  ),
  noAudit: note(
    'no-audit-trail-for-change-requests',
    'Change requests have no audit trail to confirm who changed them.',
  ),
  noteNotUnique: note(
    'note-match-not-unique',
    'A matching note does not identify this specific request.',
  ),
  identity: note(
    'identity-unverified',
    'The job or record identity could not be verified in the latest details.',
  ),
} as const;

function snapshotItem(item: RepairItemDto): ItemSnapshot {
  return {
    id: item.id,
    version: item.version,
    unitPrice: item.unitPrice,
    qty: item.qty,
    amount: item.amount,
    status: item.status,
  };
}

function snapshotOf(
  detail: JobDetailDto,
  proposal: ProposalDto | null,
  changeRequest: ChangeRequestDto | null,
): Snapshot {
  return {
    jobStatus: detail.job.status,
    timelineCount: detail.timeline.length,
    proposal:
      proposal === null
        ? null
        : {
            id: proposal.id,
            status: proposal.status,
            total: proposal.total,
            approvedTotal: proposal.approvedTotal,
            managerNote: proposal.managerNote,
            auditCount: proposal.audit.length,
            items: proposal.items.map(snapshotItem),
          },
    changeRequest:
      changeRequest === null
        ? null
        : {
            id: changeRequest.id,
            status: changeRequest.status,
            details: changeRequest.details,
            changes: changeRequest.changes.join('\u0000'),
            managerNote: changeRequest.managerNote,
          },
  };
}

function findEntity(
  detail: JobDetailDto,
  kind: 'proposal' | 'change-request',
  entityId: string,
  jobCardId: string,
): EntityLookup {
  const none = {
    proposal: null,
    changeRequest: null,
  };

  if (!sameId(detail.job.id, jobCardId)) {
    return { state: 'mismatch', ...none };
  }

  if (kind === 'proposal') {
    const matches = detail.proposals.filter(p => sameId(p.id, entityId));

    if (matches.length === 0) {
      return { state: 'missing', ...none };
    }

    if (matches.length > 1 || !sameId(matches[0].jobCardId, jobCardId)) {
      return { state: 'mismatch', ...none };
    }

    return { state: 'ready', proposal: matches[0], changeRequest: null };
  }

  const matches = detail.changeRequests.filter(c => sameId(c.id, entityId));

  if (matches.length === 0) {
    return { state: 'missing', ...none };
  }

  if (matches.length > 1 || !sameId(matches[0].jobCardId, jobCardId)) {
    return { state: 'mismatch', ...none };
  }

  return { state: 'ready', proposal: null, changeRequest: matches[0] };
}

function findItems(
  proposal: ProposalDto,
  itemId: string,
): RepairItemDto | null {
  const matches = proposal.items.filter(item => sameId(item.id, itemId));

  return matches.length === 1 ? matches[0] : null;
}

function diffItems(
  reviewed: ItemSnapshot,
  fresh: ItemSnapshot,
  out: FixProofChangedField[],
): void {
  if (reviewed.version !== fresh.version) {
    out.push('item-version');
  }

  if (reviewed.unitPrice !== fresh.unitPrice) {
    out.push('item-price');
  }

  if (reviewed.qty !== fresh.qty) {
    out.push('item-quantity');
  }

  if (reviewed.amount !== fresh.amount) {
    out.push('item-amount');
  }

  if (reviewed.status !== fresh.status) {
    out.push('item-status');
  }
}

/**
 * Compares the snapshot the user reviewed with the fresh snapshot. For item
 * actions only the target item (and proposal level state) is relevant; for
 * proposal level actions every item is.
 */
function diffSnapshots(
  reviewed: Snapshot,
  fresh: Snapshot,
  itemId: string | null,
): readonly FixProofChangedField[] {
  const out: FixProofChangedField[] = [];

  if (reviewed.jobStatus !== fresh.jobStatus) {
    out.push('job-status');
  }

  const a = reviewed.proposal;
  const b = fresh.proposal;

  if (a !== null && b !== null) {
    if (a.status !== b.status) {
      out.push('proposal-status');
    }

    if (a.auditCount !== b.auditCount) {
      out.push('proposal-audit');
    }

    const aIds = a.items.map(item => item.id.toLowerCase()).sort();
    const bIds = b.items.map(item => item.id.toLowerCase()).sort();

    if (aIds.join() !== bIds.join()) {
      out.push('proposal-items');
    }

    if (itemId !== null) {
      const left = a.items.find(item => sameId(item.id, itemId));
      const right = b.items.find(item => sameId(item.id, itemId));

      if (left !== undefined && right !== undefined) {
        diffItems(left, right, out);
      }
    } else {
      if (a.total !== b.total) {
        out.push('proposal-total');
      }

      if (a.approvedTotal !== b.approvedTotal) {
        out.push('proposal-approved-total');
      }

      if (a.managerNote !== b.managerNote) {
        out.push('proposal-manager-note');
      }

      for (const left of a.items) {
        const right = b.items.find(item => sameId(item.id, left.id));

        if (right !== undefined) {
          diffItems(left, right, out);
        }
      }
    }
  }

  const c = reviewed.changeRequest;
  const d = fresh.changeRequest;

  if (c !== null && d !== null) {
    if (c.status !== d.status) {
      out.push('change-request-status');
    }

    if (c.details !== d.details) {
      out.push('change-request-details');
    }

    if (c.changes !== d.changes) {
      out.push('change-request-changes');
    }

    if (c.managerNote !== d.managerNote) {
      out.push('change-request-note');
    }
  }

  return [...new Set(out)];
}

/**
 * Backend transition semantics (Approvals.cs, ApprovalWorkflowService.cs,
 * ChangeRequestService.cs) used to interpret a later read:
 * - set price: item price/qty change, Version NOT bumped; audit "Price set".
 * - revise: Version + 1; audit "Revised ..."; renewed approval is backend-decided.
 * - forward: AwaitingCustomer, job AwaitingCustomerApproval; audit "Sent to customer".
 * - return: ReturnedToMechanic, job Inspecting; audit "Returned to mechanic".
 * - release: ReleasedToMechanic, approved items Released, job InProgress,
 *   "Approved work" progress entry; audit "Released to mechanic"; inventory
 *   and queue effects are NOT visible in JobDetail.
 * - change request forward/decline: ForwardedToMechanic/Declined; no audit.
 * Every result is an observation, never proof for this specific request.
 */
function newManagerAudit(
  baseline: ProposalSnapshot,
  fresh: ProposalDto,
  prefix: string,
): boolean {
  return fresh.audit
    .slice(baseline.auditCount)
    .some(
      entry =>
        entry.actorRole === 'Manager' && entry.action.startsWith(prefix),
    );
}

interface Observation {
  readonly observation: FixProofReconciliationObservation;
  readonly evidence: readonly FixProofReconciliationNote[];
  readonly warnings: readonly FixProofReconciliationNote[];
}

function observe(
  observation: FixProofReconciliationObservation,
  evidence: FixProofReconciliationNote[],
  warnings: FixProofReconciliationNote[],
): Observation {
  return { observation, evidence, warnings };
}

function analyzePricing(
  context: Context,
  baseline: Snapshot,
  proposal: ProposalDto,
  item: RepairItemDto,
): Observation {
  const requested = context.price as PriceRequest;
  const baseItem = baseline.proposal?.items.find(entry =>
    sameId(entry.id, item.id),
  );
  const evidence: FixProofReconciliationNote[] = [];
  const warnings: FixProofReconciliationNote[] = [];

  const matches =
    item.unitPrice === requested.unitPrice && item.qty === requested.qty;
  const baselineMatched =
    baseItem !== undefined &&
    baseItem.unitPrice === requested.unitPrice &&
    baseItem.qty === requested.qty;
  const versionChanged =
    baseItem !== undefined && item.version !== baseItem.version;

  if (
    context.action === 'set-price' &&
    newManagerAudit(
      baseline.proposal as ProposalSnapshot,
      proposal,
      'Price set',
    )
  ) {
    evidence.push(EVIDENCE.auditObserved);
  }

  if (context.action === 'set-price') {
    const baseProposalStatus = baseline.proposal?.status;
    const proposalStatusChanged =
      baseProposalStatus !== undefined && proposal.status !== baseProposalStatus;
    const itemStatusChanged =
      baseItem !== undefined && item.status !== baseItem.status;
    const statusChanged = proposalStatusChanged || itemStatusChanged;
    const valuesChangedFromBaseline =
      baseItem !== undefined &&
      (item.unitPrice !== baseItem.unitPrice || item.qty !== baseItem.qty);

    if (versionChanged) {
      warnings.push(WARNINGS.concurrent);

      return observe('inconsistent', evidence, warnings);
    }

    evidence.push(EVIDENCE.versionUnchanged);

    if (statusChanged) {
      if (matches) {
        evidence.push(EVIDENCE.valuesMatch);
      }

      warnings.push(WARNINGS.concurrent);

      return observe('inconsistent', evidence, warnings);
    }

    if (matches) {
      evidence.push(EVIDENCE.valuesMatch);

      if (baselineMatched) {
        warnings.push(WARNINGS.baselineAlready);

        return observe('unresolved', evidence, warnings);
      }

      warnings.push(WARNINGS.notUnique);

      return observe('consistent', evidence, warnings);
    }

    if (valuesChangedFromBaseline) {
      warnings.push(WARNINGS.concurrent);

      return observe('inconsistent', evidence, warnings);
    }

    warnings.push(WARNINGS.mayStillExecute);

    return observe('inconsistent', evidence, warnings);
  }

  // revise
  warnings.push(WARNINGS.backendApproval);

  const advanced = baseItem !== undefined && item.version > baseItem.version;
  const versionRegressed =
    baseItem !== undefined && item.version < baseItem.version;
  const versionJump =
    baseItem !== undefined && item.version - baseItem.version > 1;
  const valuesChangedFromBaseline =
    baseItem !== undefined &&
    (item.unitPrice !== baseItem.unitPrice || item.qty !== baseItem.qty);
  const baseProposalStatus = baseline.proposal?.status;
  const expectedProposalStatus =
    baseProposalStatus !== undefined &&
    (proposal.status === baseProposalStatus ||
      proposal.status === 'AwaitingCustomer');
  const expectedItemStatus =
    baseItem !== undefined &&
    (item.status === baseItem.status || item.status === 'AwaitingCustomer');
  const unexpectedApprovalTransition =
    baseProposalStatus === 'CustomerResponded' &&
    proposal.status === 'AwaitingCustomer' &&
    baseItem !== undefined &&
    item.status !== 'AwaitingCustomer';
  const statusDiverged =
    !expectedProposalStatus ||
    !expectedItemStatus ||
    unexpectedApprovalTransition;
  const canStillExecute =
    proposal.status === 'AwaitingCustomer' ||
    proposal.status === 'CustomerResponded';

  if (advanced) {
    evidence.push(EVIDENCE.versionAdvanced);

    if (versionJump) {
      warnings.push(WARNINGS.versionJump);
    }
  }

  if (
    advanced &&
    newManagerAudit(
      baseline.proposal as ProposalSnapshot,
      proposal,
      'Revised',
    )
  ) {
    evidence.push(EVIDENCE.auditObserved);
  }

  if (matches && advanced) {
    evidence.push(EVIDENCE.valuesMatch);

    if (statusDiverged) {
      warnings.push(WARNINGS.concurrent);

      return observe(
        versionJump ? 'unresolved' : 'inconsistent',
        evidence,
        warnings,
      );
    }

    warnings.push(WARNINGS.notUnique);

    return observe(
      versionJump ? 'unresolved' : 'consistent',
      evidence,
      warnings,
    );
  }

  if (matches) {
    evidence.push(EVIDENCE.valuesMatch);

    if (statusDiverged || versionRegressed) {
      warnings.push(WARNINGS.concurrent);

      return observe('inconsistent', evidence, warnings);
    }

    warnings.push(WARNINGS.baselineAlready);

    return observe('unresolved', evidence, warnings);
  }

  if (
    advanced ||
    versionRegressed ||
    valuesChangedFromBaseline ||
    statusDiverged
  ) {
    warnings.push(WARNINGS.concurrent);

    return observe('inconsistent', evidence, warnings);
  }

  warnings.push(
    canStillExecute ? WARNINGS.mayStillExecute : WARNINGS.concurrent,
  );

  return observe('inconsistent', evidence, warnings);
}

const PROPOSAL_TRANSITIONS: Readonly<
  Record<
    'forward' | 'return' | 'release',
    {
      readonly status: string;
      readonly jobStatus: string;
      readonly audit: string;
    }
  >
> = {
  forward: {
    status: 'AwaitingCustomer',
    jobStatus: 'AwaitingCustomerApproval',
    audit: 'Sent to customer',
  },
  return: {
    status: 'ReturnedToMechanic',
    jobStatus: 'Inspecting',
    audit: 'Returned to mechanic',
  },
  release: {
    status: 'ReleasedToMechanic',
    jobStatus: 'InProgress',
    audit: 'Released to mechanic',
  },
};

function analyzeProposalTransition(
  context: Context,
  baseline: Snapshot,
  detail: JobDetailDto,
  proposal: ProposalDto,
): Observation {
  const action = context.action as 'forward' | 'return' | 'release';
  const expected = PROPOSAL_TRANSITIONS[action];
  const base = baseline.proposal as ProposalSnapshot;
  const evidence: FixProofReconciliationNote[] = [];
  const warnings: FixProofReconciliationNote[] = [];

  if (action === 'release') {
    warnings.push(WARNINGS.releaseSideEffects);
  }

  if (proposal.status !== expected.status) {
    if (proposal.status === base.status) {
      warnings.push(WARNINGS.mayStillExecute);
    } else {
      warnings.push(WARNINGS.concurrent);
    }

    return observe('inconsistent', evidence, warnings);
  }

  evidence.push(EVIDENCE.statusMatches);

  if (detail.job.status === expected.jobStatus) {
    evidence.push(EVIDENCE.jobStatusMatches);
  }

  if (newManagerAudit(base, proposal, expected.audit)) {
    evidence.push(EVIDENCE.auditObserved);
  }

  const shouldCheckSubmittedNote =
    action !== 'release' || context.note !== null;
  const noteDiverged = shouldCheckSubmittedNote
    ? proposal.managerNote !== context.note
    : proposal.managerNote !== base.managerNote;

  if (
    !noteDiverged &&
    context.note !== null &&
    proposal.managerNote === context.note
  ) {
    evidence.push(EVIDENCE.noteMatches);
    warnings.push(WARNINGS.noteNotUnique);
  }

  if (action === 'release') {
    if (proposal.releasedAt !== null) {
      evidence.push(EVIDENCE.releaseStamp);
    }

    const releasedNow = base.items.some(
      before =>
        before.status === 'Approved' &&
        proposal.items.some(
          item => sameId(item.id, before.id) && item.status === 'Released',
        ),
    );

    if (releasedNow) {
      evidence.push(EVIDENCE.itemsReleased);
    }

    if (detail.timeline.length > baseline.timelineCount) {
      evidence.push(EVIDENCE.progressEntry);
    }
  }

  if (noteDiverged) {
    warnings.push(WARNINGS.concurrent);

    return observe('inconsistent', evidence, warnings);
  }

  warnings.push(WARNINGS.notUnique);

  return observe('consistent', evidence, warnings);
}

function analyzeChangeRequest(
  context: Context,
  baseline: Snapshot,
  request: ChangeRequestDto,
): Observation {
  const forward = context.action === 'forward-change-request';
  const target = forward ? 'ForwardedToMechanic' : 'Declined';
  const base = baseline.changeRequest as ChangeRequestSnapshot;
  const evidence: FixProofReconciliationNote[] = [];
  const warnings: FixProofReconciliationNote[] = [WARNINGS.noAudit];

  const matches =
    request.status === target ||
    (forward && request.status === 'Acknowledged');

  if (!matches) {
    warnings.push(
      request.status === base.status
        ? WARNINGS.mayStillExecute
        : WARNINGS.concurrent,
    );

    return observe('inconsistent', evidence, warnings);
  }

  evidence.push(
    request.status === target ? EVIDENCE.statusMatches : EVIDENCE.statusPastTarget,
  );

  if (request.managerNote !== context.note) {
    warnings.push(WARNINGS.concurrent);

    return observe('inconsistent', evidence, warnings);
  }

  warnings.push(WARNINGS.notUnique);

  if (context.note !== null && request.managerNote === context.note) {
    evidence.push(EVIDENCE.noteMatches);
    warnings.push(WARNINGS.noteNotUnique);
  }

  return observe('consistent', evidence, warnings);
}

/**
 * Feature-scoped mutation orchestration for FixProof, reusing:
 * - K10 `FixProofMutationApiService` for every mutation request (no endpoint
 *   is re-implemented here),
 * - K12 `FixProofStateService` for review state and refresh integration, and
 * - K08 `JobCardApiService.getJobCard` for fresh authoritative JobDetail.
 *
 * Provide it on the page component next to `FixProofStateService`.
 *
 * Flow per action (single execution lane per instance):
 * 1. Synchronous gates: busy / unresolved operation, session, K12 selection
 *    and readiness (resolved, non-stale), K12 advisory eligibility, input
 *    validation with the K06/K10 validators (return and decline notes stay
 *    mandatory).
 * 2. Fresh authoritative JobDetail for the original job (K08). Job and nested
 *    entity identities are verified, K06 eligibility is re-evaluated with the
 *    fresh job status (never inferred from proposal status), and the reviewed
 *    snapshot is compared with the fresh one (item version, price, quantity,
 *    status, proposal state). Any relevant change blocks the action and asks
 *    for renewed review; the user's values are never changed.
 * 3. One dispatch through K10. No retry, no replay, no optimistic update, no
 *    fabricated idempotency key or receipt. The dispatched mutation is not
 *    cancelled because the selection changed.
 * 4. Success needs a validated response for the original job and entity.
 *    K12 lists and the selected detail are then refreshed through its public
 *    refresh methods; a failed refresh never turns a confirmed success into a
 *    failure. Filtered-list disappearance is not treated as deletion.
 * 5. Rejections use the K06 classification and fixed messages; state and
 *    concurrency conflicts refresh K12 and require renewed review.
 * 6. Uncertain outcomes (network, 5xx, invalid or empty response, unknown)
 *    trigger one bounded read-only reconciliation through the ORIGINAL job's
 *    JobDetail. Observations are conservative and never definitive. The
 *    operation stays unresolved until the user explicitly acknowledges it.
 * 7. Manual recovery, never automatic: `cancelPreflight()` (nothing was
 *    sent), `stopWaiting()` (stops LOCAL waiting only; the sent request may
 *    already have been applied or may still be applied, so the operation
 *    becomes uncertain) and `cancelReconciliation()` (cancels only the read).
 *    No timeout, retry or replay is introduced, and no frontend cancellation
 *    is ever treated as a backend rollback.
 *
 * This is advisory frontend protection only. The backend has no idempotency
 * key, operation receipt or concurrency token for these endpoints (only
 * `RepairItem.Version`), so a read can never prove which request caused a
 * state. In-memory protection cannot survive a page reload, logout or service
 * destruction; no browser storage is used to hide that limitation.
 *
 * Access loss: logout, expiry or replacement clears operation data and
 * cancels reads; a dispatched but unconfirmed request is then reported as
 * potentially executed. HTTP 401/403 on the mutation, the preflight read or a
 * reconciliation read calls `FixProofStateService.revokeFeatureAccess`, which
 * clears every protected K12 value synchronously and sends no request; no
 * follow-up read is needed or trusted to complete the revocation. A K12
 * revocation observed from K12's own reads ends the operation the same way.
 * The global session is not changed (the interceptors never end it on 401),
 * so new actions stay refused until a different valid session exists.
 */
@Injectable()
export class FixProofMutationStateService implements OnDestroy {
  private readonly fixProof = inject(FixProofStateService);
  private readonly mutationApi = inject(FixProofMutationApiService);
  private readonly jobApi = inject(JobCardApiService);
  private readonly sessionService = inject(SessionService);
  private readonly authCoordinator = inject(
    Day06AuthorizationCoordinatorService,
  );
  private readonly navigationProtection = inject(
    FixProofNavigationProtectionService,
  );

  private readonly phaseState = signal<FixProofMutationPhase>('idle');
  private readonly resultState = signal<FixProofMutationResult | null>(null);
  private readonly operationState = signal<FixProofOperationView | null>(
    null,
  );
  private readonly dispatchedState = signal(false);
  private readonly reconciliationState =
    signal<FixProofReconciliation | null>(null);
  private readonly accessLossState = signal<FixProofAccessLoss | null>(null);
  private readonly acknowledgementState =
    signal<FixProofAcknowledgement | null>(null);

  private context: Context | null = null;
  private baseline: Snapshot | null = null;
  private boundSession: AuthSession | null = null;
  private acknowledgementSession: AuthSession | null = null;
  private acknowledgementJobCardId: string | null = null;
  private accessLossJobCardId: string | null = null;
  private accessLossSession: AuthSession | null = null;
  private accessLossSequence: number | null = null;
  private confirmedResponse: Snapshot | null = null;
  private plan: Plan | null = null;
  private readonly postAckPlanState = signal<Plan | null>(null);
  private sequence = 0;
  private destroyed = false;
  private tickHandle: ReturnType<typeof setInterval> | null = null;

  private preflightSubscription: Subscription | null = null;
  private mutationSubscription: Subscription | null = null;
  private reconcileSubscription: Subscription | null = null;
  private preflightGeneration = 0;
  private mutationGeneration = 0;
  private reconcileGeneration = 0;
  private readonly detachedTransports = new Set<DetachedTransport>();
  private readonly detachedCount = signal(0);

  private readonly refreshWatch = computed(() => ({
    listLoading: this.fixProof.isProposalsLoading(),
    changeLoading: this.fixProof.isChangeRequestsLoading(),
    detailLoading: this.fixProof.isDetailLoading(),
    proposalsCancellations: this.fixProof.proposalsCancellations(),
    changesCancellations: this.fixProof.changeRequestsCancellations(),
    detailCancellations: this.fixProof.detailCancellations(),
    proposalsSynced: this.fixProof.proposalsLastSyncedAt(),
    changesSynced: this.fixProof.changeRequestsLastSyncedAt(),
    detailSynced: this.fixProof.detailLastSyncedAt(),
    proposalsError:
      this.fixProof.proposalsRefreshError() ?? this.fixProof.proposalsError(),
    changesError:
      this.fixProof.changeRequestsRefreshError() ??
      this.fixProof.changeRequestsError(),
    detailError:
      this.fixProof.detailRefreshError() ?? this.fixProof.detailError(),
    authFailure: this.fixProof.authFailure(),
    selected: this.fixProof.selected(),
    postAckPlan: this.postAckPlanState(),
  }));

  private readonly sessionWatcher: EffectRef = effect(() => {
    this.sessionService.session();
    untracked(() => {
      this.enforceSession();
    });
  });

  private readonly refreshWatcher: EffectRef = effect(() => {
    this.refreshWatch();
    untracked(() => {
      this.advancePlan();
    });
  });

  private readonly revocationWatcher: EffectRef = effect(() => {
    if (this.fixProof.accessRevoked()) {
      untracked(() => {
        this.enforceAccess();
      });
    }
  });

  private readonly unregisterAuthListener = this.authCoordinator.registerListener(
    revokedSession => {
      this.handleCrossFeatureUnauthorized(revokedSession);
    },
  );

  private readonly unregisterForbiddenListener =
    this.authCoordinator.registerForbiddenListener(event => {
      this.handleCoordinatorForbidden(event);
    });

  private readonly unregisterNavigationProtection: () => void;

  constructor() {
    this.unregisterNavigationProtection =
      this.navigationProtection.registerSource({
        isDestroyed: () => this.destroyed,
        phase: () => this.phaseState(),
        hasUnresolvedOperation: () => this.hasUnresolvedOperation(),
        detachedRequestPending: () => this.detachedRequestPending(),
        accessLoss: () => this.accessLossState(),
        activeSequence: () =>
          this.context?.sequence ??
          this.operationState()?.sequence ??
          this.accessLossSequence,
        isBoundToSession: session => {
          if (this.destroyed) {
            return false;
          }

          return this.phaseState() === 'access-lost'
            ? this.accessLossSession === session
            : this.boundSession === session;
        },
        detachedSequencesForSession: session => {
          if (
            this.destroyed ||
            this.detachedTransports.size === 0 ||
            this.fixProof.accessRevoked() ||
            this.authCoordinator.isSessionRevoked(session) ||
            this.authCoordinator.isFeatureForbidden(session, 'fixproof')
          ) {
            return [];
          }

          const sequences: number[] = [];

          for (const transport of this.detachedTransports) {
            if (
              transport.session === session &&
              !this.authCoordinator.isJobResourceDenied(
                session,
                transport.jobCardId,
              )
            ) {
              sequences.push(transport.sequence);
            }
          }

          return sequences;
        },
      });
  }

  // ------------------------------------------------------------ public state

  readonly phase: Signal<FixProofMutationPhase> =
    this.phaseState.asReadonly();

  readonly result: Signal<FixProofMutationResult | null> =
    this.resultState.asReadonly();

  readonly operation: Signal<FixProofOperationView | null> = computed(
    () => {
      const operation = this.operationState();

      return operation === null
        ? null
        : { ...operation, dispatched: this.dispatchedState() };
    },
  );

  readonly reconciliation: Signal<FixProofReconciliation | null> =
    this.reconciliationState.asReadonly();

  readonly accessLoss: Signal<FixProofAccessLoss | null> =
    this.accessLossState.asReadonly();

  readonly lastAcknowledgement: Signal<FixProofAcknowledgement | null> =
    this.acknowledgementState.asReadonly();

  /**
   * A request the manager stopped waiting for has not answered yet. It may
   * still be applied by the server; its answer is never applied here.
   */
  readonly detachedRequestPending: Signal<boolean> = computed(
    () => this.detachedCount() > 0,
  );

  /** Preflight, submission, refresh or reconciliation read in progress. */
  readonly isBusy: Signal<boolean> = computed(() => {
    const phase = this.phaseState();

    return (
      phase === 'validating' ||
      phase === 'submitting' ||
      phase === 'refreshing' ||
      this.reconciliationState()?.state === 'reading'
    );
  });

  /** An outcome that may have been applied and is not yet acknowledged. */
  readonly hasUnresolvedOperation: Signal<boolean> = computed(() => {
    const phase = this.phaseState();

    return (
      phase === 'uncertain' ||
      phase === 'reconciliation-required' ||
      (phase === 'access-lost' &&
        this.accessLossState()?.potentiallyExecuted === true)
    );
  });

  readonly requiresAcknowledgement: Signal<boolean> = this
    .hasUnresolvedOperation;

  readonly canReconcile: Signal<boolean> = computed(() => {
    const phase = this.phaseState();

    return (
      (phase === 'uncertain' || phase === 'reconciliation-required') &&
      this.reconciliationState()?.state !== 'reading'
    );
  });

  private readonly postAckRefreshBlocking: Signal<boolean> = computed(() => {
    const pending = this.postAckPlanState();

    if (pending === null || !this.detailMatchesPlan(pending)) {
      return false;
    }

    return pending.targets.some(
      target => target.state === 'waiting' || target.state === 'running',
    );
  });

  /** True when a new action may be started: nothing busy or unresolved, K12 ready. */
  readonly canExecute: Signal<boolean> = computed(() => {
    const current = this.currentSession();
    const selected = this.fixProof.selected();

    return (
      !this.isBusy() &&
      !this.hasUnresolvedOperation() &&
      !this.postAckRefreshBlocking() &&
      !this.fixProof.accessRevoked() &&
      !this.authCoordinator.isSessionRevoked(current) &&
      !this.authCoordinator.isFeatureForbidden(current, 'fixproof') &&
      (selected === null ||
        !this.authCoordinator.isJobResourceDenied(
          current,
          selected.jobCardId,
        )) &&
      this.fixProof.actionContextState() === 'ready'
    );
  });

  /** The K12 selection no longer points at the record of the current operation. */
  readonly selectionDiffersFromOperation: Signal<boolean> = computed(() => {
    const operation = this.operationState();

    if (operation === null) {
      return false;
    }

    const selected = this.fixProof.selected();

    return (
      selected === null ||
      selected.kind !== operation.kind ||
      !sameId(selected.id, operation.entityId)
    );
  });

  // ------------------------------------------------------------ actions

  setItemPrice(
    proposalId: string,
    itemId: string,
    price: FixProofMutationInput,
  ): FixProofMutationStartResult {
    return this.start({
      action: 'set-price',
      entityId: proposalId,
      itemId,
      price,
    });
  }

  reviseItem(
    proposalId: string,
    itemId: string,
    price: FixProofMutationInput,
  ): FixProofMutationStartResult {
    return this.start({
      action: 'revise',
      entityId: proposalId,
      itemId,
      price,
    });
  }

  forwardProposal(
    proposalId: string,
    noteText?: string | null,
  ): FixProofMutationStartResult {
    return this.start({
      action: 'forward',
      entityId: proposalId,
      note: noteText ?? null,
    });
  }

  /** The note is mandatory. */
  returnProposal(
    proposalId: string,
    noteText: string,
  ): FixProofMutationStartResult {
    return this.start({
      action: 'return',
      entityId: proposalId,
      note: noteText,
      noteRequired: true,
    });
  }

  releaseProposal(
    proposalId: string,
    noteText?: string | null,
  ): FixProofMutationStartResult {
    return this.start({
      action: 'release',
      entityId: proposalId,
      note: noteText ?? null,
    });
  }

  forwardChangeRequest(
    changeRequestId: string,
    noteText?: string | null,
  ): FixProofMutationStartResult {
    return this.start({
      action: 'forward-change-request',
      entityId: changeRequestId,
      note: noteText ?? null,
    });
  }

  /** The reason is mandatory. */
  declineChangeRequest(
    changeRequestId: string,
    noteText: string,
  ): FixProofMutationStartResult {
    return this.start({
      action: 'decline-change-request',
      entityId: changeRequestId,
      note: noteText,
      noteRequired: true,
    });
  }

  /**
   * Explicit read-only reconciliation of the ORIGINAL unresolved operation
   * through its own job (never a filtered list). It does not unlock anything
   * and never sends a mutation. Ignored while a read is already running.
   */
  reconcile(): boolean {
    if (this.destroyed || !this.canReconcile()) {
      return false;
    }

    return this.startReconciliation();
  }

  /**
   * Stops waiting locally for a dispatched mutation (`submitting` only).
   *
   * This is NOT a cancellation of the backend request. The request was
   * already sent and may already have been applied, or may still be applied
   * later; aborting the browser request would not roll anything back on the
   * server either. The transport is therefore kept (not aborted on purpose),
   * owned by this service and bound to the original operation, session and
   * job until it settles or access is lost. Its late answer is never applied.
   *
   * The operation becomes `uncertain` with `potentiallyExecuted`, keeps its
   * identity, blocks new actions and starts the usual read-only
   * reconciliation of the ORIGINAL job. Nothing is resent.
   */
  stopWaiting(): boolean {
    const context = this.context;

    if (
      this.destroyed ||
      context === null ||
      this.phaseState() !== 'submitting' ||
      !this.enforceAccess() ||
      this.context !== context
    ) {
      return false;
    }

    const subscription = this.mutationSubscription;

    this.mutationGeneration += 1;
    this.mutationSubscription = null;

    if (subscription !== null && !subscription.closed) {
      const transport: DetachedTransport = {
        subscription,
        sequence: context.sequence,
        session: context.session,
        jobCardId: context.jobCardId,
      };

      this.detachedTransports.add(transport);
      subscription.add(() => this.forgetDetached(transport));
      this.detachedCount.set(this.detachedTransports.size);
    }

    this.onUncertain(context, 'unknown', STOPPED_WAITING_MESSAGE);
    this.syncTicker();

    return true;
  }

  /**
   * Cancels the preflight read (`validating` only). No mutation was sent and
   * none will be: the read is unsubscribed and its generation invalidated, so
   * a late answer can never dispatch. Also used automatically when the K12
   * selection moves away from the record under validation.
   */
  cancelPreflight(): boolean {
    const context = this.context;

    if (
      this.destroyed ||
      context === null ||
      this.phaseState() !== 'validating' ||
      this.dispatchedState()
    ) {
      return false;
    }

    if (!this.enforceAccess() || this.context !== context) {
      return false;
    }

    this.finishNotDispatched(context.action, 'preflight-cancelled');

    return true;
  }

  /**
   * Cancels a running reconciliation read only. The operation stays
   * unresolved with `potentiallyExecuted`; nothing is unlocked and nothing is
   * resent. The attempt is recorded with observation `cancelled` (nothing
   * observed) and counts as an attempt for `acknowledge()`, which still
   * requires explicit review. Another `reconcile()` may be started.
   */
  cancelReconciliation(): boolean {
    const context = this.context;
    const reconciliation = this.reconciliationState();

    if (
      this.destroyed ||
      context === null ||
      reconciliation?.state !== 'reading'
    ) {
      return false;
    }

    if (!this.enforceAccess() || this.context !== context) {
      return false;
    }

    this.reconcileGeneration += 1;
    this.reconcileSubscription?.unsubscribe();
    this.reconcileSubscription = null;

    this.reconciliationState.set({
      state: 'complete',
      attempts: reconciliation.attempts,
      observation: 'cancelled',
      evidence: [],
      warnings: this.withPendingWarning(context, [
        RECONCILIATION_CANCELLED_NOTE,
        WARNINGS.mayStillExecute,
        note('outcome-unresolved', UNRESOLVED_RECONCILIATION_MESSAGE),
      ]),
      definitive: false,
      readAt: null,
    });
    this.setPhase('reconciliation-required');

    return true;
  }

  /**
   * Clears an unresolved operation after explicit review. This is NOT proof
   * of success or failure. It is refused while a reconciliation read is
   * running or when a reconciliation was possible but never attempted.
   */
  acknowledge(review: {
    readonly reviewed: boolean;
  }): { readonly acknowledged: boolean; readonly reason: FixProofAcknowledgeRefusal | null } {
    const refuse = (reason: FixProofAcknowledgeRefusal) => ({
      acknowledged: false,
      reason,
    });

    if (this.destroyed) {
      return refuse('destroyed');
    }

    if (!this.hasUnresolvedOperation()) {
      return refuse('nothing-to-acknowledge');
    }

    if (review?.reviewed !== true) {
      return refuse('review-required');
    }

    const phase = this.phaseState();
    const reconciliation = this.reconciliationState();

    if (phase !== 'access-lost') {
      if (reconciliation?.state === 'reading') {
        return refuse('reconciliation-in-progress');
      }

      if (reconciliation === null) {
        return refuse('reconciliation-not-attempted');
      }
    }

    const action =
      this.context?.action ?? this.accessLossState()?.action ?? null;

    if (action !== null) {
      this.acknowledgementSession = this.currentSession();
      this.acknowledgementJobCardId =
        this.context?.jobCardId ??
        this.operationState()?.jobCardId ??
        this.accessLossJobCardId;
      this.acknowledgementState.set({
        action,
        observation: reconciliation?.observation ?? null,
        acknowledgedAt: new Date(Date.now()),
        proofOfOutcome: 'none',
      });
    }

    const pendingUncertainPlan =
      this.plan !== null &&
      this.plan.mode === 'uncertain' &&
      this.plan.targets.some(
        target => target.state === 'waiting' || target.state === 'running',
      )
        ? this.plan
        : null;

    this.resetOperation();

    if (pendingUncertainPlan !== null) {
      this.postAckPlanState.set(pendingUncertainPlan);
      this.advancePlan();
    }

    return { acknowledged: true, reason: null };
  }

  /** Clears a finished (succeeded or rejected) outcome. Never clears unresolved ones. */
  dismissOutcome(): boolean {
    const phase = this.phaseState();
    const dismissible =
      phase === 'succeeded' ||
      phase === 'rejected' ||
      (phase === 'access-lost' &&
        this.accessLossState()?.potentiallyExecuted === false);

    if (!dismissible) {
      return false;
    }

    this.resetOperation();

    return true;
  }

  ngOnDestroy(): void {
    this.handoffNavigationNoticesBeforeDestroy();
    this.destroyed = true;
    this.unregisterAuthListener();
    this.unregisterForbiddenListener();
    this.sessionWatcher.destroy();
    this.refreshWatcher.destroy();
    this.revocationWatcher.destroy();
    this.postAckPlanState.set(null);
    this.clearAcknowledgement();
    this.cancelAll();
    this.releaseDetached(() => true);
    this.resetOperation();
    this.unregisterNavigationProtection();
  }

  // ----------------------------------------------------------- start / flow

  private start(spec: {
    readonly action: FixProofMutationAction;
    readonly entityId: unknown;
    readonly itemId?: unknown;
    readonly price?: unknown;
    readonly note?: unknown;
    readonly noteRequired?: boolean;
  }): FixProofMutationStartResult {
    const refused = (
      reason: FixProofMutationStartRefusal,
    ): FixProofMutationStartResult => ({ started: false, reason });

    if (this.destroyed) {
      return refused('destroyed');
    }

    if (this.hasUnresolvedOperation()) {
      return refused('unresolved-operation');
    }

    if (this.isBusy()) {
      return refused('busy');
    }

    // Keeps the current access-loss notice; only a new session lifts this.
    const activeSession = this.currentSession();

    if (
      this.fixProof.accessRevoked() ||
      this.authCoordinator.isSessionRevoked(activeSession) ||
      this.authCoordinator.isFeatureForbidden(activeSession, 'fixproof')
    ) {
      return refused('access-revoked');
    }

    const session = activeSession;

    if (session === null) {
      this.resetOperation();
      this.accessLossState.set({
        action: spec.action,
        potentiallyExecuted: false,
        mutationConfirmed: false,
      });
      this.resultState.set(
        this.accessLostResult(spec.action, {
          cause: 'session-ended',
          dispatched: false,
          potentiallyExecuted: false,
          mutationConfirmed: false,
        }),
      );
      this.setPhase('access-lost');

      return refused('session-invalid');
    }

    // A previous finished outcome is replaced by the new attempt.
    this.resetOperation();

    const kind = ACTION_KIND[spec.action];
    const failBefore = (
      reason: FixProofNotDispatchedReason,
      extra: {
        readonly eligibility?: FixProofActionEligibility | null;
      } = {},
    ): FixProofMutationStartResult => {
      this.finishNotDispatched(spec.action, reason, [], extra.eligibility ?? null);

      return refused('not-dispatched');
    };

    let entityId: string;
    let itemId: string | null = null;
    let price: PriceRequest | null = null;
    let noteValue: string | null = null;

    try {
      entityId = validateFixProofResourceId(
        spec.entityId,
        kind === 'proposal' ? 'proposalId' : 'changeRequestId',
      );

      if (spec.action === 'set-price' || spec.action === 'revise') {
        itemId = validateFixProofResourceId(spec.itemId, 'itemId');
        price = validatePriceRequest(spec.price);
      } else if (spec.noteRequired === true) {
        noteValue = validateRequiredNoteRequest({ note: spec.note }).note;
      } else {
        noteValue = validateOptionalNoteRequest({ note: spec.note }).note;
      }
    } catch (error: unknown) {
      if (error instanceof FixProofRequestError) {
        return failBefore('invalid-input');
      }

      throw error;
    }

    const selected = this.fixProof.selected();

    if (
      selected === null ||
      selected.kind !== kind ||
      !sameId(selected.id, entityId)
    ) {
      return failBefore('selection-mismatch');
    }

    if (this.authCoordinator.isJobResourceDenied(session, selected.jobCardId)) {
      return failBefore('selection-unresolved');
    }

    const advisory = this.reviewedEligibility(
      spec.action,
      entityId,
      itemId,
    );

    if (
      this.postAckRefreshBlocking() ||
      this.fixProof.actionContextState() !== 'ready' ||
      this.fixProof.selectionState() !== 'ready' ||
      this.fixProof.isDetailStale() ||
      advisory === null ||
      advisory.contextState !== 'ready'
    ) {
      return failBefore('selection-unresolved');
    }

    if (!advisory.actionReady) {
      return failBefore('eligibility-blocked', {
        eligibility: advisory.eligibility,
      });
    }

    const detail = this.fixProof.detail();
    const found =
      detail === null
        ? null
        : findEntity(detail, kind, entityId, selected.jobCardId);

    if (
      detail === null ||
      found === null ||
      found.state !== 'ready' ||
      (itemId !== null &&
        (found.proposal === null || findItems(found.proposal, itemId) === null))
    ) {
      return failBefore('entity-unresolved');
    }

    const context: Context = Object.freeze({
      sequence: ++this.sequence,
      action: spec.action,
      kind,
      entityId,
      jobCardId: selected.jobCardId,
      itemId,
      price: price === null ? null : Object.freeze({ ...price }),
      note: noteValue,
      session,
      reviewed: snapshotOf(detail, found.proposal, found.changeRequest),
    });

    this.context = context;
    this.boundSession = session;
    this.baseline = null;
    this.confirmedResponse = null;
    this.operationState.set({
      sequence: context.sequence,
      action: context.action,
      kind,
      entityId,
      jobCardId: context.jobCardId,
      itemId,
      price: context.price,
      noteProvided: noteValue !== null,
      dispatched: false,
    });
    this.dispatchedState.set(false);
    this.setPhase('validating');

    this.runPreflight(context);

    return { started: true, reason: null };
  }

  private reviewedEligibility(
    action: FixProofMutationAction,
    entityId: string,
    itemId: string | null,
  ): FixProofAdvisoryEligibility | null {
    if (ACTION_KIND[action] === 'proposal') {
      const actions = this.fixProof.proposalActions();

      if (actions === null || !sameId(actions.proposalId, entityId)) {
        return null;
      }

      switch (action) {
        case 'forward':
          return actions.forward;
        case 'return':
          return actions.returnToMechanic;
        case 'release':
          return actions.release;
        default: {
          const item = actions.items.find(entry =>
            sameId(entry.itemId, itemId),
          );

          if (item === undefined) {
            return null;
          }

          return action === 'set-price' ? item.setPrice : item.revise;
        }
      }
    }

    const actions = this.fixProof.changeRequestActions();

    if (actions === null || !sameId(actions.changeRequestId, entityId)) {
      return null;
    }

    return action === 'forward-change-request'
      ? actions.forward
      : actions.decline;
  }

  private runPreflight(context: Context): void {
    this.preflightSubscription?.unsubscribe();

    const generation = ++this.preflightGeneration;
    const provenance = this.authCoordinator.createRequestProvenance(
      'fixproof-mutation',
      context.session,
      `api/v1/manager/jobs/${context.jobCardId}`,
      'GET',
    );
    let received: { readonly value: JobDetailDto } | null = null;
    const subscription = new Subscription();

    this.preflightSubscription = subscription;
    subscription.add(
      defer(() => this.jobApi.getJobCard(context.jobCardId)).subscribe({
        next: value => {
          received = { value };
        },
        error: (error: unknown) =>
          this.onPreflightResult(
            generation,
            subscription,
            context,
            provenance,
            null,
            error,
          ),
        complete: () =>
          this.onPreflightResult(
            generation,
            subscription,
            context,
            provenance,
            received,
            undefined,
          ),
      }),
    );
  }

  private isCurrent(context: Context): boolean {
    return !this.destroyed && this.context === context;
  }

  private onPreflightResult(
    generation: number,
    subscription: Subscription,
    context: Context,
    provenance: Day06RequestProvenance | null,
    box: { readonly value: JobDetailDto } | null,
    error: unknown,
  ): void {
    if (
      generation !== this.preflightGeneration ||
      !this.isCurrent(context) ||
      this.phaseState() !== 'validating'
    ) {
      return;
    }

    // Enforcement may end the operation synchronously; re-check afterwards.
    if (
      !this.enforceAccess() ||
      generation !== this.preflightGeneration ||
      !this.isCurrent(context)
    ) {
      return;
    }

    if (this.preflightSubscription === subscription) {
      this.preflightSubscription = null;
    }

    if (box === null) {
      const kind = resolveJobCardsError(
        error ?? new Error('No response received'),
        'read',
      ).kind;

      if (kind === 'unauthorized' || kind === 'forbidden') {
        const canPropagate = this.currentSession() === context.session;

        // Nothing was dispatched: never potential execution.
        this.enterAccessLost(false, false, kind);

        if (canPropagate) {
          if (kind === 'unauthorized') {
            this.authCoordinator.reportUnauthorized(provenance, error);
          } else {
            this.authCoordinator.reportForbidden(provenance, error);
          }
        }

        return;
      }

      this.finishNotDispatched(
        context.action,
        kind === 'not-found' ? 'job-not-found' : 'preflight-read-failed',
      );
      return;
    }

    const detail = box.value;
    const selected = this.fixProof.selected();

    if (
      selected === null ||
      selected.kind !== context.kind ||
      !sameId(selected.id, context.entityId)
    ) {
      this.finishNotDispatched(context.action, 'selection-changed');
      return;
    }

    if (!sameId(detail.job.id, context.jobCardId)) {
      this.finishNotDispatched(context.action, 'job-identity-mismatch');
      return;
    }

    const found = findEntity(
      detail,
      context.kind,
      context.entityId,
      context.jobCardId,
    );
    const item =
      context.itemId !== null && found.proposal !== null
        ? findItems(found.proposal, context.itemId)
        : null;

    if (
      found.state !== 'ready' ||
      (context.itemId !== null && item === null)
    ) {
      this.finishNotDispatched(context.action, 'entity-unresolved');
      return;
    }

    const eligibility = this.evaluateFresh(
      context,
      detail.job.status,
      found.proposal,
      item,
      found.changeRequest,
    );
    const fresh = snapshotOf(detail, found.proposal, found.changeRequest);
    const changed = diffSnapshots(context.reviewed, fresh, context.itemId);

    if (!eligibility.frontendAllowed || eligibility.status !== 'allowed') {
      this.finishNotDispatched(
        context.action,
        'eligibility-blocked',
        changed,
        eligibility,
      );

      if (changed.length > 0) {
        this.fixProof.refreshDetail();
      }

      return;
    }

    if (changed.length > 0) {
      this.finishNotDispatched(context.action, 'review-required', changed);
      // Bring the visible review state up to date (read only).
      this.fixProof.refreshDetail();
      return;
    }

    if (this.fixProof.actionContextState() !== 'ready') {
      this.finishNotDispatched(context.action, 'selection-unresolved');
      return;
    }

    this.baseline = fresh;
    this.dispatch(context, detail.job.status, found, item);
  }

  private evaluateFresh(
    context: Context,
    jobStatus: string,
    proposal: ProposalDto | null,
    item: RepairItemDto | null,
    changeRequest: ChangeRequestDto | null,
  ): FixProofActionEligibility {
    const job = { jobStatus };

    switch (context.action) {
      case 'set-price': {
        const edit = evaluateProposalItemEditEligibility(
          proposal?.status ?? '',
          item?.status ?? '',
          job,
        );

        return edit.mode === 'set-price'
          ? edit.eligibility
          : evaluateProposalActionEligibility(
              proposal?.status ?? '',
              'set-price',
              job,
            );
      }
      case 'revise':
        return evaluateProposalItemRevisionEligibility(
          proposal?.status ?? '',
          item?.status ?? '',
          job,
        );
      case 'forward':
      case 'return':
      case 'release':
        return evaluateProposalActionEligibility(
          proposal?.status ?? '',
          context.action,
          job,
        );
      case 'forward-change-request':
        return evaluateChangeRequestActionEligibility(
          changeRequest?.status ?? '',
          'forward',
          job,
        );
      case 'decline-change-request':
        return evaluateChangeRequestActionEligibility(
          changeRequest?.status ?? '',
          'decline',
          job,
        );
    }
  }

  private dispatch(
    context: Context,
    jobStatus: string,
    found: EntityLookup,
    item: RepairItemDto | null,
  ): void {
    // Final synchronous gates: nothing may have changed since preflight.
    if (!this.enforceAccess()) {
      return;
    }

    const selected = this.fixProof.selected();

    if (
      selected === null ||
      selected.kind !== context.kind ||
      !sameId(selected.id, context.entityId)
    ) {
      this.finishNotDispatched(context.action, 'selection-changed');
      return;
    }

    let source: Observable<ProposalDto | ChangeRequestDto>;

    try {
      source = this.callApi(context, jobStatus, found, item);
    } catch (error: unknown) {
      this.onMutationError(context, 0, null, null, error);
      return;
    }

    const provenance = this.authCoordinator.createRequestProvenance(
      'fixproof-mutation',
      context.session,
      this.mutationEndpointPath(context),
      this.mutationHttpMethod(context.action),
    );

    this.dispatchedState.set(true);
    this.setPhase('submitting');

    const generation = ++this.mutationGeneration;
    let received: { readonly value: ProposalDto | ChangeRequestDto } | null =
      null;
    const subscription = new Subscription();

    this.mutationSubscription = subscription;
    subscription.add(
      source.subscribe({
        next: value => {
          // The first response wins; HTTP emits exactly once.
          received ??= { value };
        },
        error: (error: unknown) =>
          this.onMutationError(
            context,
            generation,
            subscription,
            provenance,
            error,
          ),
        complete: () =>
          this.onMutationComplete(context, generation, subscription, received),
      }),
    );
  }

  private callApi(
    context: Context,
    jobStatus: string,
    found: EntityLookup,
    item: RepairItemDto | null,
  ): Observable<ProposalDto | ChangeRequestDto> {
    const proposalContext: ProposalActionContext = {
      proposalStatus: found.proposal?.status ?? '',
      jobStatus,
    };
    const itemContext: ProposalItemActionContext = {
      ...proposalContext,
      itemStatus: item?.status ?? '',
    };
    const changeContext: ChangeRequestActionContext = {
      changeRequestStatus: found.changeRequest?.status ?? '',
      jobStatus,
    };
    const price = context.price as PriceRequest;

    switch (context.action) {
      case 'set-price':
        return this.mutationApi.setItemPrice(
          context.entityId,
          context.itemId as string,
          price,
          itemContext,
        );
      case 'revise':
        return this.mutationApi.reviseItem(
          context.entityId,
          context.itemId as string,
          price,
          itemContext,
        );
      case 'forward':
        return this.mutationApi.forwardProposal(
          context.entityId,
          context.note,
          proposalContext,
        );
      case 'return':
        return this.mutationApi.returnProposal(
          context.entityId,
          context.note as string,
          proposalContext,
        );
      case 'release':
        return this.mutationApi.releaseProposal(
          context.entityId,
          context.note,
          proposalContext,
        );
      case 'forward-change-request':
        return this.mutationApi.forwardChangeRequest(
          context.entityId,
          context.note,
          changeContext,
        );
      case 'decline-change-request':
        return this.mutationApi.declineChangeRequest(
          context.entityId,
          context.note as string,
          changeContext,
        );
    }
  }

  // ------------------------------------------------------------ outcomes

  private onMutationComplete(
    context: Context,
    generation: number,
    subscription: Subscription,
    box: { readonly value: ProposalDto | ChangeRequestDto } | null,
  ): void {
    // A detached answer is never applied, whatever it says.
    this.releaseDetachedTransport(subscription);

    if (
      generation !== this.mutationGeneration ||
      !this.isCurrent(context) ||
      this.phaseState() !== 'submitting'
    ) {
      return;
    }

    // Enforcement may end the operation synchronously; re-check afterwards.
    if (
      !this.enforceAccess() ||
      generation !== this.mutationGeneration ||
      !this.isCurrent(context)
    ) {
      return;
    }

    if (this.mutationSubscription === subscription) {
      this.mutationSubscription = null;
    }

    if (box === null) {
      this.onUncertain(
        context,
        resolveFixProofError(
          new FixProofResponseError('response.empty'),
          'mutation',
        ).kind,
      );
      return;
    }

    const response = box.value;

    if (
      !sameId(response.id, context.entityId) ||
      !sameId(response.jobCardId, context.jobCardId) ||
      !this.responseMatchesKind(context, response)
    ) {
      this.onUncertain(
        context,
        resolveFixProofError(
          new FixProofResponseError('response.identity'),
          'mutation',
        ).kind,
      );
      return;
    }

    const proposal = context.kind === 'proposal' ? (response as ProposalDto) : null;
    const changeRequest =
      context.kind === 'change-request' ? (response as ChangeRequestDto) : null;
    const item =
      proposal !== null && context.itemId !== null
        ? findItems(proposal, context.itemId)
        : null;

    this.confirmedResponse = {
      jobStatus: '',
      timelineCount: 0,
      proposal:
        proposal === null
          ? null
          : {
              id: proposal.id,
              status: proposal.status,
              total: proposal.total,
              approvedTotal: proposal.approvedTotal,
              managerNote: proposal.managerNote,
              auditCount: proposal.audit.length,
              items: proposal.items.map(snapshotItem),
            },
      changeRequest:
        changeRequest === null
          ? null
          : {
              id: changeRequest.id,
              status: changeRequest.status,
              details: changeRequest.details,
              changes: changeRequest.changes.join('\u0000'),
              managerNote: changeRequest.managerNote,
            },
    };

    this.resultState.set({
      action: context.action,
      status: 'succeeded',
      dispatched: true,
      reason: null,
      errorKind: null,
      message:
        'The server confirmed the change. Refreshing the latest details.',
      reviewRequired: false,
      changedFields: [],
      eligibility: null,
      potentiallyExecuted: false,
      confirmed: {
        entityStatus: (proposal ?? (changeRequest as ChangeRequestDto)).status,
        itemVersion: item?.version ?? null,
      },
      refresh: null,
    });

    this.beginRefresh('success');
  }

  private responseMatchesKind(
    context: Context,
    response: ProposalDto | ChangeRequestDto,
  ): boolean {
    return context.kind === 'proposal'
      ? 'items' in response
      : 'changes' in response;
  }

  private onMutationError(
    context: Context,
    generation: number,
    subscription: Subscription | null,
    provenance: Day06RequestProvenance | null,
    error: unknown,
  ): void {
    if (subscription !== null) {
      // A detached answer is never applied, whatever it says.
      this.releaseDetachedTransport(subscription);
    }

    if (generation !== 0 && generation !== this.mutationGeneration) {
      return;
    }

    if (!this.isCurrent(context)) {
      return;
    }

    if (
      generation !== 0 &&
      (this.phaseState() !== 'submitting' ||
        !this.enforceAccess() ||
        generation !== this.mutationGeneration ||
        !this.isCurrent(context))
    ) {
      return;
    }

    if (
      subscription !== null &&
      this.mutationSubscription === subscription
    ) {
      this.mutationSubscription = null;
    }

    // Raised by K10 before any HTTP request is made (explicit contract).
    if (
      error instanceof FixProofActionBlockedError ||
      error instanceof FixProofRequestError ||
      error instanceof FixProofApiOriginError
    ) {
      this.dispatchedState.set(false);
      this.finishNotDispatched(
        context.action,
        error instanceof FixProofApiOriginError
          ? 'api-not-configured'
          : 'refused-by-api-gate',
        [],
        error instanceof FixProofActionBlockedError
          ? error.eligibility
          : null,
      );
      return;
    }

    const resolution = resolveFixProofError(error, 'mutation');

    if (
      resolution.kind === 'unauthorized' ||
      resolution.kind === 'forbidden'
    ) {
      const canPropagate = this.currentSession() === context.session;

      // The server refused the request: dispatched, not potentially executed.
      this.enterAccessLost(false, false, resolution.kind);

      if (canPropagate) {
        if (resolution.kind === 'unauthorized') {
          this.authCoordinator.reportUnauthorized(provenance, error);
        } else {
          this.authCoordinator.reportForbidden(provenance, error);
        }
      }

      return;
    }

    if (resolution.outcome === 'rejected') {
      this.resultState.set({
        action: context.action,
        status: 'rejected',
        dispatched: true,
        reason: null,
        errorKind: resolution.kind,
        message: resolution.message,
        reviewRequired: resolution.requiresRefresh,
        changedFields: [],
        eligibility: null,
        potentiallyExecuted: false,
        confirmed: null,
        refresh: null,
      });

      if (resolution.requiresRefresh) {
        this.beginRefresh('rejected');
      } else {
        this.settle('rejected');
      }

      return;
    }

    this.onUncertain(context, resolution.kind, resolution.message);
  }

  private onUncertain(
    context: Context,
    errorKind: FixProofErrorKind,
    message?: string,
  ): void {
    const resolved =
      message ??
      resolveFixProofError(
        new FixProofResponseError('response'),
        'mutation',
      ).message;

    this.dispatchedState.set(true);
    this.resultState.set({
      action: context.action,
      status: 'uncertain',
      dispatched: true,
      reason: null,
      errorKind,
      message: resolved,
      reviewRequired: true,
      changedFields: [],
      eligibility: null,
      potentiallyExecuted: true,
      confirmed: null,
      refresh: null,
    });
    this.setPhase('uncertain');
    this.startReconciliation();
  }

  private finishNotDispatched(
    action: FixProofMutationAction,
    reason: FixProofNotDispatchedReason,
    changedFields: readonly FixProofChangedField[] = [],
    eligibility: FixProofActionEligibility | null = null,
  ): void {
    this.cancelReads();
    this.resultState.set({
      action,
      status: 'not-dispatched',
      dispatched: false,
      reason,
      errorKind: null,
      message: NOT_DISPATCHED_MESSAGES[reason],
      reviewRequired:
        reason === 'review-required' || changedFields.length > 0,
      changedFields,
      eligibility,
      potentiallyExecuted: false,
      confirmed: null,
      refresh: null,
    });
    // Nothing was dispatched, so there is no operation to show.
    this.operationState.set(null);
    this.dispatchedState.set(false);
    this.settle('rejected');
  }

  /** Ends the operation in a terminal phase and drops sensitive values. */
  private settle(phase: 'succeeded' | 'rejected'): void {
    this.context = null;
    this.baseline = null;
    this.confirmedResponse = null;
    this.plan = null;
    this.setPhase(phase);
  }

  // ------------------------------------------------------------ refresh plan

  private beginRefresh(mode: PlanMode): void {
    const context = this.context;

    if (context === null) {
      return;
    }

    if (mode !== 'uncertain') {
      this.setPhase('refreshing');
    }

    this.plan = {
      mode,
      sequence: context.sequence,
      kind: context.kind,
      entityId: context.entityId,
      jobCardId: context.jobCardId,
      session: context.session,
      targets: [
        {
          id: 'list',
          state: 'waiting',
          before: null,
          cancellations: this.listCancellations(context),
        },
        {
          id: 'detail',
          state: 'waiting',
          before: null,
          cancellations: this.fixProof.detailCancellations(),
        },
      ],
    };

    this.advancePlan();
  }

  private listCancellations(plan: Pick<Plan, 'kind'>): number {
    return plan.kind === 'proposal'
      ? this.fixProof.proposalsCancellations()
      : this.fixProof.changeRequestsCancellations();
  }

  private targetCancelled(plan: Plan, target: PlanTarget): boolean {
    const current =
      target.id === 'list'
        ? this.listCancellations(plan)
        : this.fixProof.detailCancellations();

    return current !== target.cancellations;
  }

  private detailTargetApplies(plan: Plan): boolean {
    return plan.mode === 'uncertain'
      ? this.detailMatchesPlan(plan)
      : this.selectionMatches(plan);
  }

  /**
   * Classifies a target whose read is no longer loading. `ok` only when the
   * sync marker moved past the one recorded before the plan's own refresh,
   * the lane reports no failure, the read was not cancelled, the plan's
   * session is still the authorized current session and, for the detail,
   * the selection and loaded job still belong to the plan. Never `ok` by
   * default: confirmation of the mutation does not depend on this.
   */
  private classifyTarget(
    plan: Plan,
    target: PlanTarget,
  ): 'ok' | 'failed' | 'skipped' {
    if (target.id === 'detail' && !this.detailTargetApplies(plan)) {
      return 'skipped';
    }

    if (this.targetCancelled(plan, target)) {
      return 'failed';
    }

    const synced =
      target.id === 'list'
        ? this.listSynced(plan)
        : this.fixProof.detailLastSyncedAt();
    const failed =
      target.id === 'list' ? this.listFailed(plan) : this.detailFailed();
    const authorized =
      this.currentSession() === plan.session &&
      !this.fixProof.accessRevoked() &&
      !this.authCoordinator.isSessionRevoked(plan.session) &&
      !this.authCoordinator.isFeatureForbidden(plan.session, 'fixproof') &&
      !this.authCoordinator.isJobResourceDenied(plan.session, plan.jobCardId);
    const detail = this.fixProof.detail();
    const detailBelongs =
      target.id === 'list' ||
      (detail !== null && sameId(detail.job.id, plan.jobCardId));

    return synced !== null &&
      synced !== target.before &&
      !failed &&
      authorized &&
      detailBelongs
      ? 'ok'
      : 'failed';
  }

  private listLoading(plan: Pick<Plan, 'kind'>): boolean {
    return plan.kind === 'proposal'
      ? this.fixProof.isProposalsLoading()
      : this.fixProof.isChangeRequestsLoading();
  }

  private listSynced(plan: Pick<Plan, 'kind'>): Date | null {
    return plan.kind === 'proposal'
      ? this.fixProof.proposalsLastSyncedAt()
      : this.fixProof.changeRequestsLastSyncedAt();
  }

  private listFailed(plan: Pick<Plan, 'kind'>): boolean {
    return plan.kind === 'proposal'
      ? (this.fixProof.proposalsRefreshError() ??
          this.fixProof.proposalsError()) !== null
      : (this.fixProof.changeRequestsRefreshError() ??
          this.fixProof.changeRequestsError()) !== null;
  }

  private detailFailed(): boolean {
    return (
      (this.fixProof.detailRefreshError() ?? this.fixProof.detailError()) !==
      null
    );
  }

  private selectionMatches(plan: Pick<Plan, 'kind' | 'entityId'>): boolean {
    const selected = this.fixProof.selected();

    return (
      selected !== null &&
      selected.kind === plan.kind &&
      sameId(selected.id, plan.entityId)
    );
  }

  private detailMatchesPlan(plan: Pick<Plan, 'jobCardId'>): boolean {
    const selected = this.fixProof.selected();

    return selected !== null && sameId(selected.jobCardId, plan.jobCardId);
  }

  private advancePlanTargets(plan: Plan): boolean {
    for (const target of plan.targets) {
      if (target.state === 'waiting') {
        if (target.id === 'detail' && !this.detailTargetApplies(plan)) {
          target.state = 'skipped';
          continue;
        }

        if (this.targetCancelled(plan, target)) {
          // The manager cancelled this lane: never re-request it here.
          target.state = 'failed';
          continue;
        }

        const loading =
          target.id === 'list'
            ? this.listLoading(plan)
            : this.fixProof.isDetailLoading();

        if (loading) {
          // An older K12 read is in flight; it may predate the mutation.
          continue;
        }

        target.before =
          target.id === 'list'
            ? this.listSynced(plan)
            : this.fixProof.detailLastSyncedAt();

        if (target.id === 'list') {
          if (plan.kind === 'proposal') {
            this.fixProof.refreshProposals();
          } else {
            this.fixProof.refreshChangeRequests();
          }
        } else {
          this.fixProof.refreshDetail();
        }

        const loadingNow =
          target.id === 'list'
            ? this.listLoading(plan)
            : this.fixProof.isDetailLoading();

        target.state = loadingNow ? 'running' : this.classifyTarget(plan, target);

        continue;
      }

      if (target.state === 'running') {
        if (target.id === 'detail' && !this.detailTargetApplies(plan)) {
          // A detail load for another selection must never count as ours.
          target.state = 'skipped';
          continue;
        }

        if (this.targetCancelled(plan, target)) {
          target.state = 'failed';
          continue;
        }

        const loading =
          target.id === 'list'
            ? this.listLoading(plan)
            : this.fixProof.isDetailLoading();

        if (loading) {
          continue;
        }

        target.state = this.classifyTarget(plan, target);
      }
    }

    return plan.targets.every(
      target => target.state !== 'waiting' && target.state !== 'running',
    );
  }

  private advancePlan(): void {
    if (this.destroyed) {
      return;
    }

    this.enforceSession();
    this.cancelPreflightOnSelectionChange();

    const postAck = this.postAckPlanState();

    if (postAck !== null) {
      if (
        this.currentSession() !== postAck.session ||
        this.fixProof.accessRevoked() ||
        this.authCoordinator.isSessionRevoked(postAck.session) ||
        this.authCoordinator.isFeatureForbidden(postAck.session, 'fixproof') ||
        this.authCoordinator.isJobResourceDenied(
          postAck.session,
          postAck.jobCardId,
        )
      ) {
        this.postAckPlanState.set(null);
      } else if (this.advancePlanTargets(postAck)) {
        this.postAckPlanState.set(null);
      }
    }

    const plan = this.plan;
    const context = this.context;

    if (
      plan === null ||
      context === null ||
      plan.sequence !== context.sequence
    ) {
      return;
    }

    if (!this.enforceAccess()) {
      return;
    }

    const authFailure = this.fixProof.authFailure();

    if (authFailure !== null) {
      this.plan = null;
      this.enterAccessLost(
        plan.mode === 'uncertain',
        plan.mode === 'success',
        authFailure,
      );
      return;
    }

    if (this.advancePlanTargets(plan)) {
      this.finishPlan(plan, context);
    }
  }

  /**
   * The K12 selection moved away from the record under validation: the
   * preflight read is cancelled at once and nothing is sent. The synchronous
   * selection check in `dispatch` stays as the final gate. Never touches a
   * mutation that was already dispatched.
   */
  private cancelPreflightOnSelectionChange(): void {
    const context = this.context;

    if (
      context === null ||
      this.phaseState() !== 'validating' ||
      this.dispatchedState() ||
      this.selectionMatches(context)
    ) {
      return;
    }

    if (!this.enforceAccess() || this.context !== context) {
      return;
    }

    this.finishNotDispatched(context.action, 'selection-changed');
  }

  private finishPlan(plan: Plan, context: Context): void {
    const list = plan.targets.find(target => target.id === 'list');
    const detail = plan.targets.find(target => target.id === 'detail');
    const selectionChanged = !this.selectionMatches(plan);

    const summary: FixProofRefreshSummary = {
      list: list?.state === 'ok' ? 'refreshed' : 'failed',
      detail:
        detail?.state === 'ok'
          ? 'refreshed'
          : detail?.state === 'skipped'
            ? 'skipped'
            : 'failed',
      selectionChanged,
      stateChangedSinceResponse:
        plan.mode === 'success' &&
        detail?.state === 'ok' &&
        this.refreshedDiffersFromResponse(context),
    };

    const current = this.resultState();

    if (current !== null) {
      this.resultState.set({ ...current, refresh: summary });
    }

    this.plan = null;

    if (plan.mode === 'success') {
      this.settle('succeeded');
    } else if (plan.mode === 'rejected') {
      this.settle('rejected');
    }
  }

  private refreshedDiffersFromResponse(context: Context): boolean {
    const response = this.confirmedResponse;

    if (response === null) {
      return false;
    }

    const detail = this.fixProof.detail();
    const found =
      detail === null
        ? null
        : findEntity(detail, context.kind, context.entityId, context.jobCardId);

    if (found === null || found.state !== 'ready') {
      return true;
    }

    const refreshed = snapshotOf(detail as JobDetailDto, found.proposal, found.changeRequest);

    if (response.proposal !== null && refreshed.proposal !== null) {
      const left = response.proposal;
      const right = refreshed.proposal;

      return (
        left.status !== right.status ||
        left.total !== right.total ||
        left.approvedTotal !== right.approvedTotal ||
        left.items
          .map(item => JSON.stringify(item))
          .sort()
          .join() !==
          right.items
            .map(item => JSON.stringify(item))
            .sort()
            .join()
      );
    }

    if (response.changeRequest !== null && refreshed.changeRequest !== null) {
      return response.changeRequest.status !== refreshed.changeRequest.status;
    }

    return true;
  }

  // ---------------------------------------------------------- reconciliation

  private startReconciliation(): boolean {
    const context = this.context;

    if (
      context === null ||
      this.destroyed ||
      this.reconciliationState()?.state === 'reading' ||
      this.baseline === null
    ) {
      return false;
    }

    if (!this.enforceAccess()) {
      return false;
    }

    this.reconcileSubscription?.unsubscribe();

    const generation = ++this.reconcileGeneration;
    const attempts = (this.reconciliationState()?.attempts ?? 0) + 1;
    const provenance = this.authCoordinator.createRequestProvenance(
      'fixproof-mutation',
      context.session,
      `api/v1/manager/jobs/${context.jobCardId}`,
      'GET',
    );

    this.reconciliationState.set({
      state: 'reading',
      attempts,
      observation: null,
      evidence: [],
      warnings: [],
      definitive: false,
      readAt: null,
    });

    let received: { readonly value: JobDetailDto } | null = null;
    const subscription = new Subscription();

    this.reconcileSubscription = subscription;
    subscription.add(
      defer(() => this.jobApi.getJobCard(context.jobCardId)).subscribe({
        next: value => {
          received = { value };
        },
        error: (error: unknown) =>
          this.onReconciled(
            generation,
            subscription,
            context,
            provenance,
            attempts,
            null,
            error,
          ),
        complete: () =>
          this.onReconciled(
            generation,
            subscription,
            context,
            provenance,
            attempts,
            received,
            undefined,
          ),
      }),
    );

    return true;
  }

  private onReconciled(
    generation: number,
    subscription: Subscription,
    context: Context,
    provenance: Day06RequestProvenance | null,
    attempts: number,
    box: { readonly value: JobDetailDto } | null,
    error: unknown,
  ): void {
    if (generation !== this.reconcileGeneration || !this.isCurrent(context)) {
      return;
    }

    // Enforcement may end the operation synchronously; re-check afterwards.
    if (
      !this.enforceAccess() ||
      generation !== this.reconcileGeneration ||
      !this.isCurrent(context)
    ) {
      return;
    }

    if (this.reconcileSubscription === subscription) {
      this.reconcileSubscription = null;
    }

    let outcome: Observation;

    if (box === null) {
      const kind = resolveJobCardsError(
        error ?? new Error('No response received'),
        'read',
      ).kind;

      if (kind === 'unauthorized' || kind === 'forbidden') {
        const canPropagate = this.currentSession() === context.session;

        // The dispatched request stays unresolved, never rejected.
        this.enterAccessLost(true, false, kind);

        if (canPropagate) {
          if (kind === 'unauthorized') {
            this.authCoordinator.reportUnauthorized(provenance, error);
          } else {
            this.authCoordinator.reportForbidden(provenance, error);
          }
        }

        return;
      }

      outcome =
        kind === 'not-found'
          ? observe('entity-unavailable', [], [])
          : observe('read-failed', [], []);
    } else {
      outcome = this.analyze(context, box.value);
    }

    const warnings = this.withPendingWarning(
      context,
      outcome.observation === 'unresolved' ||
        outcome.observation === 'read-failed'
        ? [
            ...outcome.warnings,
            note('outcome-unresolved', UNRESOLVED_RECONCILIATION_MESSAGE),
          ]
        : outcome.warnings,
    );

    this.reconciliationState.set({
      state: 'complete',
      attempts,
      observation: outcome.observation,
      evidence: outcome.evidence,
      warnings,
      definitive: false,
      readAt: new Date(Date.now()),
    });
    this.setPhase('reconciliation-required');

    // Every completed reconciliation attempt refreshes K12 read-only state so
    // older data from earlier attempts can never remain actionable.
    this.beginRefresh('uncertain');
  }

  private analyze(context: Context, detail: JobDetailDto): Observation {
    const baseline = this.baseline as Snapshot;

    if (!sameId(detail.job.id, context.jobCardId)) {
      return observe('unresolved', [], [WARNINGS.identity]);
    }

    const found = findEntity(
      detail,
      context.kind,
      context.entityId,
      context.jobCardId,
    );

    if (found.state === 'missing') {
      return observe('entity-unavailable', [], []);
    }

    if (found.state === 'mismatch') {
      return observe('unresolved', [], [WARNINGS.identity]);
    }

    if (context.kind === 'change-request') {
      return analyzeChangeRequest(
        context,
        baseline,
        found.changeRequest as ChangeRequestDto,
      );
    }

    const proposal = found.proposal as ProposalDto;

    if (context.itemId !== null) {
      const item = findItems(proposal, context.itemId);

      return item === null
        ? observe('entity-unavailable', [], [])
        : analyzePricing(context, baseline, proposal, item);
    }

    return analyzeProposalTransition(context, baseline, detail, proposal);
  }

  // ---------------------------------------------------------------- session

  private currentSession(): AuthSession | null {
    return this.sessionService.isAuthenticated()
      ? this.sessionService.session()
      : null;
  }

  /**
   * Verifies the exact session of the operation is still the valid current
   * session. Returns false (after clearing) when it is not.
   */
  private enforceSession(): boolean {
    this.releaseDetachedWithoutAccess();

    const postAck = this.postAckPlanState();

    if (
      postAck !== null &&
      (this.destroyed ||
        this.currentSession() !== postAck.session ||
        this.authCoordinator.isSessionRevoked(postAck.session) ||
        this.authCoordinator.isFeatureForbidden(postAck.session, 'fixproof') ||
        this.authCoordinator.isJobResourceDenied(
          postAck.session,
          postAck.jobCardId,
        ))
    ) {
      this.postAckPlanState.set(null);
    }

    if (
      this.acknowledgementSession !== null &&
      (this.destroyed ||
        this.currentSession() !== this.acknowledgementSession ||
        this.authCoordinator.isSessionRevoked(this.acknowledgementSession) ||
        this.authCoordinator.isFeatureForbidden(
          this.acknowledgementSession,
          'fixproof',
        ) ||
        (this.acknowledgementJobCardId !== null &&
          this.authCoordinator.isJobResourceDenied(
            this.acknowledgementSession,
            this.acknowledgementJobCardId,
          )))
    ) {
      this.clearAcknowledgement();
    }

    if (this.destroyed || this.boundSession === null) {
      this.navigationProtection.sync();
      return true;
    }

    if (this.currentSession() === this.boundSession) {
      this.navigationProtection.sync();
      return true;
    }

    this.onAccessLost('session-ended');

    return false;
  }

  /**
   * `enforceSession` plus the K12 feature revocation: an operation bound to a
   * session whose FixProof access was revoked (by any HTTP 401/403) ends here.
   */
  private enforceAccess(): boolean {
    if (!this.enforceSession()) {
      return false;
    }

    if (
      this.acknowledgementSession !== null &&
      (this.fixProof.accessRevoked() ||
        this.authCoordinator.isFeatureForbidden(
          this.acknowledgementSession,
          'fixproof',
        )) &&
      (this.currentSession() === this.acknowledgementSession ||
        this.currentSession() === null)
    ) {
      this.clearAcknowledgement();
    }

    if (this.destroyed || this.boundSession === null) {
      return true;
    }

    const activeJobId =
      this.context?.jobCardId ?? this.operationState()?.jobCardId ?? null;

    if (
      this.fixProof.accessRevoked() ||
      this.authCoordinator.isSessionRevoked(this.boundSession) ||
      this.authCoordinator.isFeatureForbidden(this.boundSession, 'fixproof')
    ) {
      this.onAccessLost(
        this.fixProof.authFailure() ??
          (this.authCoordinator.isFeatureForbidden(
            this.boundSession,
            'fixproof',
          )
            ? 'forbidden'
            : 'unauthorized'),
      );

      return false;
    }

    if (
      activeJobId !== null &&
      this.authCoordinator.isJobResourceDenied(this.boundSession, activeJobId)
    ) {
      this.onAccessLost('forbidden', false);

      return false;
    }

    return true;
  }

  private handleCrossFeatureUnauthorized(revokedSession: AuthSession): void {
    if (this.destroyed) {
      return;
    }

    this.releaseDetached(transport => transport.session === revokedSession);

    const postAck = this.postAckPlanState();

    if (postAck !== null && postAck.session === revokedSession) {
      this.postAckPlanState.set(null);
    }

    if (this.acknowledgementSession === revokedSession) {
      this.clearAcknowledgement();
    }

    if (this.boundSession === revokedSession) {
      this.onAccessLost('unauthorized');
    }
  }

  private handleCoordinatorForbidden(event: Day06ForbiddenEvent): void {
    if (this.destroyed) {
      return;
    }

    const { session, scope, deniedJobId } = event;
    const postAck = this.postAckPlanState();

    this.releaseDetached(
      transport =>
        transport.session === session &&
        (scope === 'fixproof' ||
          (deniedJobId !== null &&
            sameId(transport.jobCardId, deniedJobId))),
    );

    if (scope === 'fixproof') {
      if (postAck !== null && postAck.session === session) {
        this.postAckPlanState.set(null);
      }

      if (this.acknowledgementSession === session) {
        this.clearAcknowledgement();
      }

      if (this.boundSession === session) {
        this.onAccessLost('forbidden');
      }

      return;
    }

    if (deniedJobId !== null) {
      if (
        postAck !== null &&
        postAck.session === session &&
        sameId(postAck.jobCardId, deniedJobId)
      ) {
        this.postAckPlanState.set(null);
      }

      if (
        this.acknowledgementSession === session &&
        this.acknowledgementJobCardId !== null &&
        sameId(this.acknowledgementJobCardId, deniedJobId)
      ) {
        this.clearAcknowledgement();
      }

      const activeJobId =
        this.context?.jobCardId ?? this.operationState()?.jobCardId ?? null;

      if (
        this.boundSession === session &&
        activeJobId !== null &&
        sameId(activeJobId, deniedJobId)
      ) {
        this.onAccessLost('forbidden', false);
      }
    }
  }

  private clearAcknowledgement(): void {
    this.acknowledgementSession = null;
    this.acknowledgementJobCardId = null;
    this.acknowledgementState.set(null);
  }

  private mutationHttpMethod(action: FixProofMutationAction): 'PUT' | 'POST' {
    return action === 'set-price' || action === 'revise' ? 'PUT' : 'POST';
  }

  private mutationEndpointPath(context: Context): string {
    switch (context.action) {
      case 'set-price':
        return `api/v1/manager/approvals/proposals/${context.entityId}/items/${context.itemId}/price`;
      case 'revise':
        return `api/v1/manager/approvals/proposals/${context.entityId}/items/${context.itemId}/revise`;
      case 'forward':
        return `api/v1/manager/approvals/proposals/${context.entityId}/forward`;
      case 'return':
        return `api/v1/manager/approvals/proposals/${context.entityId}/return`;
      case 'release':
        return `api/v1/manager/approvals/proposals/${context.entityId}/release`;
      case 'forward-change-request':
        return `api/v1/manager/approvals/change-requests/${context.entityId}/forward`;
      case 'decline-change-request':
        return `api/v1/manager/approvals/change-requests/${context.entityId}/decline`;
    }
  }

  private onAccessLost(
    cause: AccessLossCause,
    revokeFixProof = true,
  ): void {
    const phase = this.phaseState();

    switch (phase) {
      case 'submitting':
      case 'uncertain':
      case 'reconciliation-required':
        this.enterAccessLost(true, false, cause, revokeFixProof);
        return;
      case 'refreshing':
        this.enterAccessLost(
          false,
          this.resultState()?.status === 'succeeded',
          cause,
          revokeFixProof,
        );
        return;
      case 'validating':
        this.enterAccessLost(false, false, cause, revokeFixProof);
        return;
      case 'succeeded':
      case 'rejected':
        if (cause !== 'session-ended') {
          // The finished operation view still holds ids and price values.
          this.enterAccessLost(
            false,
            this.resultState()?.status === 'succeeded',
            cause,
            revokeFixProof,
          );
          return;
        }
        break;
      default:
        break;
    }

    if (cause === 'session-ended') {
      this.postAckPlanState.set(null);
      this.cancelAll();
      this.resetOperation();
    }
  }

  /**
   * Clears all operation data and cancels every read. A dispatched request is
   * NOT assumed rolled back by cancellation: `potentiallyExecuted` is kept as
   * a minimal, non-sensitive notice (action name only). HTTP 401/403 also
   * revokes K12 directly and synchronously, without any request when feature-wide.
   */
  private enterAccessLost(
    potentiallyExecuted: boolean,
    mutationConfirmed: boolean,
    cause: AccessLossCause,
    revokeFixProof = true,
  ): void {
    const action = this.context?.action ?? this.resultState()?.action;
    const jobCardId =
      this.context?.jobCardId ?? this.operationState()?.jobCardId ?? null;
    const dispatched =
      potentiallyExecuted || mutationConfirmed || this.dispatchedState();
    const sequence = this.context?.sequence ?? this.operationState()?.sequence;
    const lostSession = this.boundSession;

    this.postAckPlanState.set(null);
    this.clearAcknowledgement();
    this.cancelAll();
    this.releaseDetached(transport => transport.sequence === sequence);

    if (cause !== 'session-ended' && revokeFixProof) {
      this.fixProof.revokeFeatureAccess(cause);
    }

    this.releaseDetachedWithoutAccess();

    this.context = null;
    this.baseline = null;
    this.confirmedResponse = null;
    this.operationState.set(null);
    this.dispatchedState.set(false);
    this.reconciliationState.set(null);
    this.boundSession = null;
    this.accessLossJobCardId = jobCardId;

    if (action === undefined) {
      this.accessLossSession = null;
      this.accessLossSequence = null;
      this.resultState.set(null);
      this.setPhase('idle');
      return;
    }

    this.accessLossSession = lostSession;
    this.accessLossSequence = sequence ?? null;
    this.accessLossState.set({
      action,
      potentiallyExecuted,
      mutationConfirmed,
    });
    this.resultState.set(
      this.accessLostResult(action, {
        cause,
        dispatched,
        potentiallyExecuted,
        mutationConfirmed,
      }),
    );
    this.setPhase('access-lost');
  }

  private accessLostResult(
    action: FixProofMutationAction,
    facts: AccessLossFacts,
  ): FixProofMutationResult {
    let message = ACCESS_LOST_NOT_SENT_MESSAGE;

    if (facts.potentiallyExecuted) {
      message = ACCESS_LOST_MESSAGE;
    } else if (facts.mutationConfirmed) {
      message = ACCESS_LOST_CONFIRMED_MESSAGE;
    } else if (facts.dispatched) {
      message = ACCESS_LOST_NOT_APPLIED_MESSAGE;
    }

    return {
      action,
      status: 'access-lost',
      dispatched: facts.dispatched,
      reason: null,
      errorKind: facts.cause === 'session-ended' ? null : facts.cause,
      message,
      reviewRequired: true,
      changedFields: [],
      eligibility: null,
      potentiallyExecuted: facts.potentiallyExecuted,
      confirmed: null,
      refresh: null,
    };
  }

  // ---------------------------------------------------------------- cleanup

  private cancelReads(): void {
    this.preflightGeneration += 1;
    this.preflightSubscription?.unsubscribe();
    this.preflightSubscription = null;
    this.reconcileGeneration += 1;
    this.reconcileSubscription?.unsubscribe();
    this.reconcileSubscription = null;
  }

  private cancelAll(): void {
    this.cancelReads();
    this.mutationGeneration += 1;
    this.mutationSubscription?.unsubscribe();
    this.mutationSubscription = null;
    this.plan = null;
  }

  private forgetDetached(transport: DetachedTransport): void {
    if (this.detachedTransports.delete(transport)) {
      this.detachedCount.set(this.detachedTransports.size);
      this.syncTicker();
      this.navigationProtection.sync();
    }
  }

  /** Releases the detached record of exactly this transport, if any. */
  private releaseDetachedTransport(subscription: Subscription): void {
    for (const transport of this.detachedTransports) {
      if (transport.subscription === subscription) {
        transport.subscription.unsubscribe();
        this.forgetDetached(transport);
      }
    }
  }

  private releaseDetached(
    matches: (transport: DetachedTransport) => boolean,
  ): void {
    for (const transport of [...this.detachedTransports]) {
      if (matches(transport)) {
        transport.subscription.unsubscribe();
        this.forgetDetached(transport);
      }
    }
  }

  /**
   * A detached transport is only kept while its own session is the
   * authorized current session with FixProof and job access. Otherwise it is
   * released (never resent); release proves nothing about the server.
   */
  private releaseDetachedWithoutAccess(): void {
    if (this.detachedTransports.size === 0) {
      return;
    }

    const current = this.currentSession();

    this.releaseDetached(
      transport =>
        this.destroyed ||
        current !== transport.session ||
        this.fixProof.accessRevoked() ||
        this.authCoordinator.isSessionRevoked(transport.session) ||
        this.authCoordinator.isFeatureForbidden(transport.session, 'fixproof') ||
        this.authCoordinator.isJobResourceDenied(
          transport.session,
          transport.jobCardId,
        ),
    );
  }

  private withPendingWarning(
    context: Context,
    warnings: readonly FixProofReconciliationNote[],
  ): readonly FixProofReconciliationNote[] {
    const pending = [...this.detachedTransports].some(
      transport => transport.sequence === context.sequence,
    );

    return pending ? [...warnings, ORIGINAL_REQUEST_PENDING_NOTE] : warnings;
  }

  private handoffNavigationNoticesBeforeDestroy(): void {
    if (this.destroyed) {
      return;
    }

    const current = this.currentSession();

    if (current === null) {
      return;
    }

    const phase = this.phaseState();
    const accessLoss = this.accessLossState();
    const currentSequence =
      this.context?.sequence ??
      this.operationState()?.sequence ??
      this.accessLossSequence;

    const activeOpBoundToCurrent =
      (phase === 'submitting' ||
        phase === 'uncertain' ||
        phase === 'reconciliation-required') &&
      this.boundSession === current;

    const accessLostBoundToCurrent =
      phase === 'access-lost' &&
      accessLoss?.potentiallyExecuted === true &&
      this.accessLossSession === current;

    const currentAction =
      this.context?.action ??
      this.operationState()?.action ??
      accessLoss?.action ??
      null;

    const detachedPermitted =
      !this.fixProof.accessRevoked() &&
      !this.authCoordinator.isSessionRevoked(current) &&
      !this.authCoordinator.isFeatureForbidden(current, 'fixproof');

    const matchingDetached = detachedPermitted
      ? [...this.detachedTransports].filter(
          transport =>
            transport.session === current &&
            !this.authCoordinator.isJobResourceDenied(
              current,
              transport.jobCardId,
            ),
        )
      : [];

    if (activeOpBoundToCurrent) {
      const reason =
        phase === 'submitting'
          ? 'destroyed-while-submitting'
          : phase === 'uncertain'
            ? 'destroyed-while-uncertain'
            : 'destroyed-while-reconciliation-required';

      this.navigationProtection.recordNotice(current, {
        action: currentAction,
        reason,
      });

      const otherDetachedCount = matchingDetached.filter(
        transport => transport.sequence !== currentSequence,
      ).length;

      if (otherDetachedCount > 0) {
        this.navigationProtection.recordNotice(current, {
          action: null,
          reason: 'destroyed-with-detached-request',
          detachedCount: otherDetachedCount,
        });
      }

      return;
    }

    if (accessLostBoundToCurrent) {
      this.navigationProtection.recordNotice(current, {
        action: accessLoss.action,
        reason: 'destroyed-while-access-lost',
      });

      const otherDetachedCount = matchingDetached.filter(
        transport => transport.sequence !== currentSequence,
      ).length;

      if (otherDetachedCount > 0) {
        this.navigationProtection.recordNotice(current, {
          action: null,
          reason: 'destroyed-with-detached-request',
          detachedCount: otherDetachedCount,
        });
      }

      return;
    }

    if (matchingDetached.length > 0) {
      this.navigationProtection.recordNotice(current, {
        action: null,
        reason: 'destroyed-with-detached-request',
        detachedCount: matchingDetached.length,
      });
    }
  }

  private resetOperation(): void {
    this.cancelAll();
    this.context = null;
    this.baseline = null;
    this.confirmedResponse = null;
    this.boundSession = null;
    this.accessLossJobCardId = null;
    this.accessLossSession = null;
    this.accessLossSequence = null;
    this.operationState.set(null);
    this.dispatchedState.set(false);
    this.resultState.set(null);
    this.reconciliationState.set(null);
    this.accessLossState.set(null);
    this.setPhase('idle');
  }

  private setPhase(phase: FixProofMutationPhase): void {
    this.phaseState.set(phase);
    this.syncTicker();
    this.navigationProtection.sync();
  }

  /** Runs the access ticker while an operation or a detached transport needs it. */
  private syncTicker(): void {
    const phase = this.phaseState();
    const needsTicker =
      phase === 'validating' ||
      phase === 'submitting' ||
      phase === 'refreshing' ||
      phase === 'uncertain' ||
      phase === 'reconciliation-required' ||
      this.detachedTransports.size > 0;

    if (needsTicker && !this.destroyed) {
      if (this.tickHandle === null) {
        this.tickHandle = setInterval(() => {
          this.enforceAccess();
        }, FIXPROOF_MUTATION_STATE_CHECK_INTERVAL_MS);
      }
    } else if (this.tickHandle !== null) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
  }
}
