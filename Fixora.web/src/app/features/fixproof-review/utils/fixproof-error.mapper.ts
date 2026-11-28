import { ApiError } from '../../../core/models/api-error.model';

import type {
  FixProofErrorKind,
  FixProofErrorResolution,
  FixProofMutationOutcome,
  FixProofOperation,
} from '../models/fixproof.model';

import {
  FixProofRequestError,
  FixProofResponseError,
} from './fixproof.validator';

interface MessagePair {
  readonly read: string;
  readonly mutation: string;
}

const MESSAGES: Readonly<Record<FixProofErrorKind, MessagePair>> = {
  'invalid-request': {
    read: 'The FixProof request was not valid. Refresh and try again.',
    mutation:
      'The submitted values were rejected. Check required notes, quantities, ' +
      'and prices, then try again.',
  },
  unauthorized: {
    read: 'Your session is no longer authorized. Please sign in again.',
    mutation:
      'Your session is no longer authorized. The action was rejected. ' +
      'Please sign in again.',
  },
  forbidden: {
    read: 'You do not have permission to view FixProof approvals.',
    mutation:
      'You do not have permission to perform this FixProof action. ' +
      'No change was made.',
  },
  'not-found': {
    read:
      'The requested proposal or change request was not found. ' +
      'Refresh and try again.',
    mutation:
      'The proposal, item, or change request was not found. Refresh and ' +
      'review the latest state before trying again.',
  },
  'proposal-wrong-state': {
    read:
      'The proposal state changed while loading. Refresh and try again.',
    mutation:
      'This proposal status has changed, so the action was rejected. ' +
      'Refresh to review the latest state before trying again.',
  },
  'proposal-not-published': {
    read:
      'This proposal has not been published yet. Refresh and try again.',
    mutation:
      'This proposal has not been published to the customer. Edit prices ' +
      'before forwarding instead.',
  },
  'change-wrong-state': {
    read:
      'The change request status changed while loading. Refresh and try again.',
    mutation:
      'This change request has already been handled. Refresh to see the ' +
      'latest status.',
  },
  'concurrency-conflict': {
    read:
      'FixProof data changed concurrently. Refresh and try again.',
    mutation:
      'This record was modified concurrently and the update was rejected. ' +
      'Refresh and verify the latest values before trying again.',
  },
  conflict: {
    read:
      'FixProof data conflicts with current records. Refresh and try again.',
    mutation:
      'This action conflicts with current proposal or change-request data ' +
      'and was rejected. Refresh and review before trying again.',
  },
  'validation-error': {
    read: 'The FixProof request could not be validated. Refresh and try again.',
    mutation:
      'The action failed validation and was rejected. Check required fields ' +
      'and try again.',
  },
  'rate-limited': {
    read: 'Too many requests. Please wait before refreshing.',
    mutation:
      'Too many requests. The action was rejected. Please wait before ' +
      'trying again.',
  },
  'network-failure': {
    read:
      'Unable to reach the server. Check your connection and refresh.',
    mutation:
      'The connection was lost, so it is not known whether the change was ' +
      'applied. Refresh and verify the current state before trying again.',
  },
  'server-failure': {
    read: 'The server could not load FixProof data. Please try again.',
    mutation:
      'The server could not complete the request, so it is not known ' +
      'whether the change was applied. Refresh and verify before trying again.',
  },
  'invalid-response': {
    read:
      'The FixProof data received from the server was not in the expected ' +
      'format. Refresh and try again.',
    mutation:
      'The server response could not be verified, so the change may have ' +
      'been applied. Refresh and verify the current state before trying again.',
  },
  unknown: {
    read: 'FixProof data could not be loaded. Refresh and try again.',
    mutation:
      'The outcome of this action could not be verified. Refresh and review ' +
      'the current state before trying again.',
  },
};

const MUTATION_OUTCOMES: Readonly<
  Record<FixProofErrorKind, FixProofMutationOutcome>
> = {
  'invalid-request': 'rejected',
  unauthorized: 'rejected',
  forbidden: 'rejected',
  'not-found': 'rejected',
  'proposal-wrong-state': 'rejected',
  'proposal-not-published': 'rejected',
  'change-wrong-state': 'rejected',
  'concurrency-conflict': 'rejected',
  conflict: 'rejected',
  'validation-error': 'rejected',
  'rate-limited': 'rejected',
  'network-failure': 'uncertain',
  'server-failure': 'uncertain',
  'invalid-response': 'uncertain',
  unknown: 'uncertain',
};

const MUTATION_REFRESH_KINDS: ReadonlySet<FixProofErrorKind> =
  new Set<FixProofErrorKind>([
    'not-found',
    'proposal-wrong-state',
    'proposal-not-published',
    'change-wrong-state',
    'concurrency-conflict',
    'conflict',
    'network-failure',
    'server-failure',
    'invalid-response',
    'unknown',
  ]);

export function classifyFixProofError(
  error: unknown,
): FixProofErrorKind {
  if (error instanceof FixProofRequestError) {
    return 'invalid-request';
  }

  if (error instanceof FixProofResponseError) {
    return 'invalid-response';
  }

  if (!(error instanceof ApiError)) {
    return 'unknown';
  }

  if (error.code === 'CONFLICT') {
    if (error.fixProofConflictCode === 'proposal_wrong_state') {
      return 'proposal-wrong-state';
    }

    if (error.fixProofConflictCode === 'proposal_not_published') {
      return 'proposal-not-published';
    }

    if (error.fixProofConflictCode === 'change_wrong_state') {
      return 'change-wrong-state';
    }

    if (error.conflictCode === 'concurrency_conflict') {
      return 'concurrency-conflict';
    }

    return 'conflict';
  }

  switch (error.code) {
    case 'BAD_REQUEST':
      return 'invalid-request';
    case 'UNAUTHORIZED':
      return 'unauthorized';
    case 'FORBIDDEN':
      return 'forbidden';
    case 'NOT_FOUND':
      return 'not-found';
    case 'VALIDATION_ERROR':
      return 'validation-error';
    case 'RATE_LIMITED':
      return 'rate-limited';
    case 'NETWORK_ERROR':
      return 'network-failure';
    case 'SERVER_ERROR':
      return 'server-failure';
    default:
      return 'unknown';
  }
}

/**
 * Maps any thrown value into a fixed, safe user-facing resolution.
 * Never exposes raw server exception text, media URLs, tokens, or
 * internal details. Clearly distinguishes rejected 4xx mutations
 * from uncertain network/server/response outcomes.
 */
export function resolveFixProofError(
  error: unknown,
  operation: FixProofOperation = 'read',
): FixProofErrorResolution {
  const kind = classifyFixProofError(error);
  const isMutation = operation === 'mutation';

  return {
    kind,
    outcome: isMutation ? MUTATION_OUTCOMES[kind] : 'not-applicable',
    message: MESSAGES[kind][operation],
    requiresRefresh: isMutation && MUTATION_REFRESH_KINDS.has(kind),
    requiresSignIn: kind === 'unauthorized',
  };
}

export function resolveFixProofErrorMessage(
  error: unknown,
  operation: FixProofOperation = 'read',
): string {
  return resolveFixProofError(error, operation).message;
}
