import { ApiError } from '../../../core/models/api-error.model';

import { BookingResponseError } from '../../bookings/utils/booking-response.validator';
import { FixProofResponseError } from '../../fixproof-review/utils/fixproof.validator';

import type {
  JobCardsErrorKind,
  JobCardsErrorResolution,
  JobCardsMutationOutcome,
  JobCardsOperation,
} from '../models/job-card.model';

import {
  JobCardRequestError,
  JobCardResponseError,
} from './job-card.validator';

interface MessagePair {
  readonly read: string;
  readonly mutation: string;
}

const MESSAGES: Readonly<Record<JobCardsErrorKind, MessagePair>> = {
  'invalid-request': {
    read: 'The job card request was not valid. Refresh and try again.',
    mutation:
      'The job card action was rejected as invalid. No change was made. ' +
      'Review the information and try again.',
  },
  unauthorized: {
    read: 'Your session is no longer authorized. Please sign in again.',
    mutation:
      'Your session is no longer authorized. The request was rejected. ' +
      'Please sign in again.',
  },
  forbidden: {
    read: 'You do not have permission to view job cards.',
    mutation:
      'You do not have permission to perform this job card action. ' +
      'No change was made.',
  },
  'not-found': {
    read:
      'The requested job card was not found. It may have changed or ' +
      'been removed.',
    mutation:
      'The job card was not found. Refresh and review the latest list ' +
      'before trying again.',
  },
  conflict: {
    read:
      'The job card data conflicts with current workshop records. ' +
      'Refresh and try again.',
    mutation:
      'The request conflicts with current job card data and was rejected. ' +
      'Refresh and review the job card before trying again.',
  },
  'validation-error': {
    read: 'The job card request could not be validated. Refresh and try again.',
    mutation:
      'The request failed validation and was rejected. No change was made.',
  },
  'rate-limited': {
    read: 'Too many requests. Please wait before refreshing.',
    mutation:
      'Too many requests. The request was rejected. Please wait before ' +
      'trying again.',
  },
  'network-failure': {
    read:
      'Unable to reach the server. Check your connection and refresh.',
    mutation:
      'The connection was lost, so it is not known whether the change was ' +
      'applied. Refresh and verify the job card before trying again.',
  },
  'server-failure': {
    read: 'The server could not load job card data. Please try again.',
    mutation:
      'The server could not complete the request, so it is not known ' +
      'whether the change was applied. Refresh and verify before trying again.',
  },
  'invalid-response': {
    read:
      'The job card data received from the server was not in the expected ' +
      'format. Refresh and try again.',
    mutation:
      'The server response could not be verified, so the change may have ' +
      'been applied. Refresh and verify the job card before trying again.',
  },
  unknown: {
    read: 'Job card data could not be loaded. Refresh and try again.',
    mutation:
      'The result of this action could not be verified. Refresh and review ' +
      'the job card before trying again.',
  },
};

const MUTATION_OUTCOMES: Readonly<
  Record<JobCardsErrorKind, JobCardsMutationOutcome>
> = {
  'invalid-request': 'rejected',
  unauthorized: 'rejected',
  forbidden: 'rejected',
  'not-found': 'rejected',
  conflict: 'rejected',
  'validation-error': 'rejected',
  'rate-limited': 'rejected',
  'network-failure': 'uncertain',
  'server-failure': 'uncertain',
  'invalid-response': 'uncertain',
  unknown: 'uncertain',
};

const MUTATION_REFRESH_KINDS: ReadonlySet<JobCardsErrorKind> =
  new Set<JobCardsErrorKind>([
    'not-found',
    'conflict',
    'network-failure',
    'server-failure',
    'invalid-response',
    'unknown',
  ]);

export function classifyJobCardsError(
  error: unknown,
): JobCardsErrorKind {
  if (error instanceof JobCardRequestError) {
    return 'invalid-request';
  }

  if (
    error instanceof JobCardResponseError ||
    error instanceof BookingResponseError ||
    error instanceof FixProofResponseError
  ) {
    return 'invalid-response';
  }

  if (!(error instanceof ApiError)) {
    return 'unknown';
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
    case 'CONFLICT':
      return 'conflict';
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
 * Maps any thrown value to a safe, user-facing resolution.
 * Never exposes raw backend messages, signed media URLs, credentials, or tokens.
 */
export function resolveJobCardsError(
  error: unknown,
  operation: JobCardsOperation = 'read',
): JobCardsErrorResolution {
  const kind = classifyJobCardsError(error);
  const isMutation = operation === 'mutation';

  return {
    kind,
    outcome: isMutation ? MUTATION_OUTCOMES[kind] : 'not-applicable',
    message: MESSAGES[kind][operation],
    requiresRefresh: isMutation && MUTATION_REFRESH_KINDS.has(kind),
    requiresSignIn: kind === 'unauthorized',
  };
}

export function resolveJobCardsErrorMessage(
  error: unknown,
  operation: JobCardsOperation = 'read',
): string {
  return resolveJobCardsError(error, operation).message;
}
