import { ApiError } from '../../../core/models/api-error.model';

import { BookingResponseError } from '../../bookings/utils/booking-response.validator';

import type {
  AdaptiveQueueErrorKind,
  AdaptiveQueueErrorResolution,
  AdaptiveQueueMutationOutcome,
  AdaptiveQueueOperation,
} from '../models/adaptive-queue.model';

import { AdaptiveQueueResponseError } from './adaptive-queue.validator';

interface MessagePair {
  readonly read: string;
  readonly mutation: string;
}

const MESSAGES: Readonly<
  Record<AdaptiveQueueErrorKind, MessagePair>
> = {
  'invalid-request': {
    read: 'The queue request was not valid. Refresh and try again.',
    mutation:
      'The request was rejected as invalid. No change was made. '
      + 'Review the information and try again.',
  },
  unauthorized: {
    read: 'Your session is no longer authorized. Please sign in again.',
    mutation:
      'Your session is no longer authorized. The request was '
      + 'rejected. Please sign in again.',
  },
  forbidden: {
    read: 'You do not have permission to view the adaptive queue.',
    mutation:
      'You do not have permission to perform this queue action. '
      + 'No change was made.',
  },
  'not-found': {
    read: 'The requested queue data was not found. Refresh and try again.',
    mutation:
      'The job was not found. It may have changed. Refresh the '
      + 'queue and review it before trying again.',
  },
  conflict: {
    read: 'The queue data conflicts with current data. Refresh and try again.',
    mutation:
      'The request conflicts with the current queue data and was '
      + 'rejected. Refresh and review the queue before trying again.',
  },
  'validation-error': {
    read: 'The queue request could not be validated. Refresh and try again.',
    mutation:
      'The request failed validation and was rejected. No change '
      + 'was made. Review the information and try again.',
  },
  'rate-limited': {
    read: 'Too many requests. Please wait before refreshing.',
    mutation:
      'Too many requests. The request was rejected. Please wait '
      + 'before trying again.',
  },
  'network-failure': {
    read: 'Unable to reach the server. Check the connection and refresh.',
    mutation:
      'The connection was lost, so it is not known whether the '
      + 'change was applied. Refresh and verify the queue before '
      + 'trying again.',
  },
  'server-failure': {
    read: 'The server could not complete the request. Please try again.',
    mutation:
      'The server could not complete the request, so it is not '
      + 'known whether the change was applied. Refresh and verify '
      + 'the queue before trying again.',
  },
  'invalid-response': {
    read:
      'The queue data received from the server was not in the '
      + 'expected format. Refresh and try again.',
    mutation:
      'The server response could not be verified, so the change may '
      + 'have been applied. Refresh and verify the queue before '
      + 'trying again.',
  },
  unknown: {
    read: 'The queue could not be loaded. Refresh and try again.',
    mutation:
      'The result of this action could not be verified. Refresh '
      + 'and review the queue before trying again.',
  },
};

/** Outcomes of mutations for each error kind. */
const MUTATION_OUTCOMES: Readonly<
  Record<AdaptiveQueueErrorKind, AdaptiveQueueMutationOutcome>
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

/** Mutation errors after which the board must be reloaded. */
const MUTATION_REFRESH_KINDS: ReadonlySet<AdaptiveQueueErrorKind> =
  new Set<AdaptiveQueueErrorKind>([
    'not-found',
    'conflict',
    'network-failure',
    'server-failure',
    'invalid-response',
    'unknown',
  ]);

export function classifyAdaptiveQueueError(
  error: unknown,
): AdaptiveQueueErrorKind {
  if (
    error instanceof AdaptiveQueueResponseError
    || error instanceof BookingResponseError
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
 * Maps any thrown value to a fixed, user-safe resolution. The
 * message never includes raw server or exception text, and
 * backend conflict codes are not interpreted.
 *
 * For mutations, 4xx responses are known rejections ('rejected');
 * network failures, server failures, invalid responses and
 * unknown errors are 'uncertain' because the change may have been
 * applied.
 */
export function resolveAdaptiveQueueError(
  error: unknown,
  operation: AdaptiveQueueOperation = 'read',
): AdaptiveQueueErrorResolution {
  const kind = classifyAdaptiveQueueError(error);
  const isMutation = operation === 'mutation';

  return {
    kind,
    outcome: isMutation ? MUTATION_OUTCOMES[kind] : 'not-applicable',
    message: MESSAGES[kind][operation],
    requiresRefresh: isMutation && MUTATION_REFRESH_KINDS.has(kind),
    requiresSignIn: kind === 'unauthorized',
  };
}

export function resolveAdaptiveQueueErrorMessage(
  error: unknown,
  operation: AdaptiveQueueOperation = 'read',
): string {
  return resolveAdaptiveQueueError(error, operation).message;
}
