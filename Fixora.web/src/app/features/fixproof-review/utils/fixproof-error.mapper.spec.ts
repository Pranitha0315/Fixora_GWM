import { TimeoutError } from 'rxjs';

import { ApiError } from '../../../core/models/api-error.model';

import {
  classifyFixProofError,
  resolveFixProofError,
  resolveFixProofErrorMessage,
} from './fixproof-error.mapper';

import {
  FixProofRequestError,
  FixProofResponseError,
} from './fixproof.validator';

describe('fixproof-error.mapper', () => {
  it('maps allowlisted FixProof 409 conflict codes and concurrency_conflict', () => {
    expect(
      classifyFixProofError(
        new ApiError(409, 'CONFLICT', 'raw', undefined, 'proposal_wrong_state'),
      ),
    ).toBe('proposal-wrong-state');

    expect(
      classifyFixProofError(
        new ApiError(
          409,
          'CONFLICT',
          'raw',
          undefined,
          'proposal_not_published',
        ),
      ),
    ).toBe('proposal-not-published');

    expect(
      classifyFixProofError(
        new ApiError(409, 'CONFLICT', 'raw', undefined, 'change_wrong_state'),
      ),
    ).toBe('change-wrong-state');

    expect(
      classifyFixProofError(
        new ApiError(409, 'CONFLICT', 'raw', 'concurrency_conflict'),
      ),
    ).toBe('concurrency-conflict');

    expect(
      classifyFixProofError(new ApiError(409, 'CONFLICT', 'raw')),
    ).toBe('conflict');
  });

  it('classifies validator, HTTP, and unknown errors accurately', () => {
    expect(classifyFixProofError(new FixProofRequestError('note'))).toBe(
      'invalid-request',
    );
    expect(classifyFixProofError(new FixProofResponseError('proposal.id'))).toBe(
      'invalid-response',
    );
    expect(
      classifyFixProofError(new ApiError(400, 'BAD_REQUEST', 'raw')),
    ).toBe('invalid-request');
    expect(
      classifyFixProofError(new ApiError(401, 'UNAUTHORIZED', 'raw')),
    ).toBe('unauthorized');
    expect(
      classifyFixProofError(new ApiError(403, 'FORBIDDEN', 'raw')),
    ).toBe('forbidden');
    expect(
      classifyFixProofError(new ApiError(404, 'NOT_FOUND', 'raw')),
    ).toBe('not-found');
    expect(
      classifyFixProofError(new ApiError(0, 'NETWORK_ERROR', 'raw')),
    ).toBe('network-failure');
    expect(
      classifyFixProofError(new ApiError(500, 'SERVER_ERROR', 'raw')),
    ).toBe('server-failure');
    expect(
      classifyFixProofError(new ApiError(408, 'UNKNOWN_ERROR', 'raw')),
    ).toBe('unknown');
    expect(
      classifyFixProofError(new ApiError(422, 'VALIDATION_ERROR', 'raw')),
    ).toBe('validation-error');
    expect(
      classifyFixProofError(new ApiError(429, 'RATE_LIMITED', 'raw')),
    ).toBe('rate-limited');
    expect(
      classifyFixProofError(new ApiError(504, 'SERVER_ERROR', 'raw')),
    ).toBe('server-failure');
    expect(classifyFixProofError(new TimeoutError())).toBe('unknown');
    expect(classifyFixProofError(new Error('unexpected'))).toBe('unknown');
  });

  it('distinguishes rejected 4xx mutations from uncertain network/server/response outcomes', () => {
    const conflict = resolveFixProofError(
      new ApiError(409, 'CONFLICT', 'raw', undefined, 'proposal_wrong_state'),
      'mutation',
    );
    expect(conflict.outcome).toBe('rejected');
    expect(conflict.requiresRefresh).toBe(true);
    expect(conflict.requiresSignIn).toBe(false);

    for (const err of [
      new ApiError(400, 'BAD_REQUEST', 'raw'),
      new ApiError(422, 'VALIDATION_ERROR', 'raw'),
      new ApiError(429, 'RATE_LIMITED', 'raw'),
    ]) {
      const validation = resolveFixProofError(err, 'mutation');
      expect(validation.outcome).toBe('rejected');
      expect(validation.requiresRefresh).toBe(false);
    }

    for (const err of [
      new ApiError(0, 'NETWORK_ERROR', 'raw'),
      new ApiError(408, 'UNKNOWN_ERROR', 'raw'),
      new ApiError(503, 'SERVER_ERROR', 'raw'),
      new ApiError(504, 'SERVER_ERROR', 'raw'),
      new TimeoutError(),
      new FixProofResponseError('proposal.total'),
      new Error('unexpected'),
    ]) {
      const resolved = resolveFixProofError(err, 'mutation');
      expect(resolved.outcome).toBe('uncertain');
      expect(resolved.requiresRefresh).toBe(true);
    }
  });

  it('never leaks raw backend messages, signed media URLs, credentials, or tokens', () => {
    const sensitive =
      'Token=eyJ.abc /api/v1/media/123.jpg?exp=1&sig=beef Password=123';

    const msg = resolveFixProofErrorMessage(
      new ApiError(409, 'CONFLICT', sensitive, undefined, 'change_wrong_state'),
      'mutation',
    );

    expect(msg).not.toContain('eyJ');
    expect(msg).not.toContain('beef');
    expect(msg).not.toContain('Password');
    expect(msg).toContain('change request');
  });
});
