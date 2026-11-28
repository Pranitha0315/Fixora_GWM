import { ApiError } from '../../../core/models/api-error.model';

import { BookingResponseError } from '../../bookings/utils/booking-response.validator';
import { FixProofResponseError } from '../../fixproof-review/utils/fixproof.validator';

import {
  classifyJobCardsError,
  resolveJobCardsError,
  resolveJobCardsErrorMessage,
} from './job-card-error.mapper';

import {
  JobCardRequestError,
  JobCardResponseError,
} from './job-card.validator';

describe('job-card-error.mapper', () => {
  it('classifies validator and ApiError codes accurately', () => {
    expect(classifyJobCardsError(new JobCardRequestError('jobId'))).toBe(
      'invalid-request',
    );
    expect(classifyJobCardsError(new JobCardResponseError('job.id'))).toBe(
      'invalid-response',
    );
    expect(classifyJobCardsError(new BookingResponseError('job.id'))).toBe(
      'invalid-response',
    );
    expect(classifyJobCardsError(new FixProofResponseError('proposal.id'))).toBe(
      'invalid-response',
    );
    expect(
      classifyJobCardsError(new ApiError(401, 'UNAUTHORIZED', 'secret')),
    ).toBe('unauthorized');
    expect(
      classifyJobCardsError(new ApiError(403, 'FORBIDDEN', 'secret')),
    ).toBe('forbidden');
    expect(
      classifyJobCardsError(new ApiError(404, 'NOT_FOUND', 'secret')),
    ).toBe('not-found');
    expect(
      classifyJobCardsError(new ApiError(409, 'CONFLICT', 'secret')),
    ).toBe('conflict');
    expect(
      classifyJobCardsError(new ApiError(0, 'NETWORK_ERROR', 'secret')),
    ).toBe('network-failure');
    expect(
      classifyJobCardsError(new ApiError(500, 'SERVER_ERROR', 'secret')),
    ).toBe('server-failure');
    expect(classifyJobCardsError(new Error('raw error'))).toBe('unknown');
  });

  it('distinguishes rejected mutations from uncertain mutation outcomes', () => {
    const rejected = resolveJobCardsError(
      new ApiError(409, 'CONFLICT', 'Raw SQL conflict detail'),
      'mutation',
    );
    expect(rejected.outcome).toBe('rejected');
    expect(rejected.requiresRefresh).toBe(true);
    expect(rejected.requiresSignIn).toBe(false);

    const uncertain = resolveJobCardsError(
      new ApiError(0, 'NETWORK_ERROR', 'Socket reset'),
      'mutation',
    );
    expect(uncertain.outcome).toBe('uncertain');
    expect(uncertain.requiresRefresh).toBe(true);

    const invalidResp = resolveJobCardsError(
      new JobCardResponseError('jobDetail.queue'),
      'mutation',
    );
    expect(invalidResp.outcome).toBe('uncertain');
    expect(invalidResp.requiresRefresh).toBe(true);
  });

  it('sets outcome to not-applicable for reads and flags requiresSignIn on 401', () => {
    const readAuth = resolveJobCardsError(
      new ApiError(401, 'UNAUTHORIZED', 'Bearer token expired'),
      'read',
    );
    expect(readAuth.outcome).toBe('not-applicable');
    expect(readAuth.requiresSignIn).toBe(true);
    expect(readAuth.requiresRefresh).toBe(false);
  });

  it('never leaks raw backend messages, media URLs, or tokens', () => {
    const sensitive =
      'Bearer eyJ.secret /api/v1/media/abc.jpg?exp=1&sig=deadbeef SQL error';
    const message = resolveJobCardsErrorMessage(
      new ApiError(500, 'SERVER_ERROR', sensitive),
      'read',
    );

    expect(message).not.toContain('Bearer');
    expect(message).not.toContain('deadbeef');
    expect(message).not.toContain('SQL');
  });
});
