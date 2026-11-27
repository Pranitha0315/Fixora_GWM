import { ApiError } from '../../../core/models/api-error.model';

import type {
  ApiErrorCode,
} from '../../../core/models/api-error.model';

import { BookingResponseError } from '../../bookings/utils/booking-response.validator';

import type {
  AdaptiveQueueErrorKind,
  AdaptiveQueueMutationOutcome,
} from '../models/adaptive-queue.model';

import {
  classifyAdaptiveQueueError,
  resolveAdaptiveQueueError,
  resolveAdaptiveQueueErrorMessage,
} from './adaptive-queue-error.mapper';

import { AdaptiveQueueResponseError } from './adaptive-queue.validator';

const SENSITIVE = 'SqlException: password=hunter2 at Server.Internal';

interface Case {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly kind: AdaptiveQueueErrorKind;
  readonly outcome: AdaptiveQueueMutationOutcome;
  readonly refresh: boolean;
}

const CASES: readonly Case[] = [
  { status: 400, code: 'BAD_REQUEST', kind: 'invalid-request', outcome: 'rejected', refresh: false },
  { status: 401, code: 'UNAUTHORIZED', kind: 'unauthorized', outcome: 'rejected', refresh: false },
  { status: 403, code: 'FORBIDDEN', kind: 'forbidden', outcome: 'rejected', refresh: false },
  { status: 404, code: 'NOT_FOUND', kind: 'not-found', outcome: 'rejected', refresh: true },
  { status: 409, code: 'CONFLICT', kind: 'conflict', outcome: 'rejected', refresh: true },
  { status: 422, code: 'VALIDATION_ERROR', kind: 'validation-error', outcome: 'rejected', refresh: false },
  { status: 429, code: 'RATE_LIMITED', kind: 'rate-limited', outcome: 'rejected', refresh: false },
  { status: 0, code: 'NETWORK_ERROR', kind: 'network-failure', outcome: 'uncertain', refresh: true },
  { status: 500, code: 'SERVER_ERROR', kind: 'server-failure', outcome: 'uncertain', refresh: true },
  { status: 503, code: 'SERVER_ERROR', kind: 'server-failure', outcome: 'uncertain', refresh: true },
  { status: 418, code: 'UNKNOWN_ERROR', kind: 'unknown', outcome: 'uncertain', refresh: true },
];

function apiError(testCase: Case): ApiError {
  return new ApiError(testCase.status, testCase.code, SENSITIVE);
}

describe('classifyAdaptiveQueueError', () => {
  for (const testCase of CASES) {
    it(`AQE-01 classifies ${testCase.status} ${testCase.code} as ${testCase.kind}`, () => {
      expect(classifyAdaptiveQueueError(apiError(testCase)))
        .toBe(testCase.kind);
    });
  }

  it('AQE-02 classifies queue response errors as invalid-response', () => {
    expect(
      classifyAdaptiveQueueError(
        new AdaptiveQueueResponseError('jobs[0].id'),
      ),
    ).toBe('invalid-response');
  });

  it('AQE-03 classifies reused booking validator errors as invalid-response', () => {
    expect(
      classifyAdaptiveQueueError(new BookingResponseError('job.id')),
    ).toBe('invalid-response');
  });

  for (const value of [
    new Error(SENSITIVE),
    new TypeError(SENSITIVE),
    SENSITIVE,
    null,
    undefined,
    42,
    {},
  ]) {
    it(`AQE-04 classifies a non-API error as unknown (${typeof value})`, () => {
      expect(classifyAdaptiveQueueError(value)).toBe('unknown');
    });
  }
});

describe('resolveAdaptiveQueueError: read operations', () => {
  for (const testCase of CASES) {
    it(`AQE-05 resolves a read ${testCase.status} ${testCase.code}`, () => {
      const resolution = resolveAdaptiveQueueError(
        apiError(testCase),
        'read',
      );

      expect(resolution.kind).toBe(testCase.kind);
      expect(resolution.outcome).toBe('not-applicable');
      expect(resolution.requiresRefresh).toBe(false);
      expect(resolution.message.length).toBeGreaterThan(0);
    });
  }

  it('AQE-06 defaults to a read operation', () => {
    const resolution = resolveAdaptiveQueueError(
      new ApiError(0, 'NETWORK_ERROR', SENSITIVE),
    );

    expect(resolution.outcome).toBe('not-applicable');
    expect(resolution.requiresRefresh).toBe(false);
  });

  it('AQE-07 gives a specific user-safe message for each read failure', () => {
    const messages = CASES
      .filter(testCase => testCase.status !== 503)
      .map(testCase =>
        resolveAdaptiveQueueErrorMessage(apiError(testCase), 'read'),
      );

    expect(new Set(messages).size).toBe(messages.length);
  });

  it('AQE-08 produces a message for an invalid read response', () => {
    expect(
      resolveAdaptiveQueueErrorMessage(
        new AdaptiveQueueResponseError('jobs'),
        'read',
      ),
    ).toBe(
      'The queue data received from the server was not in the '
      + 'expected format. Refresh and try again.',
    );
  });

  it('AQE-09 produces a message for an unknown read error', () => {
    expect(resolveAdaptiveQueueErrorMessage(new Error(SENSITIVE)))
      .toBe('The queue could not be loaded. Refresh and try again.');
  });
});

describe('resolveAdaptiveQueueError: mutations', () => {
  for (const testCase of CASES) {
    it(`AQE-10 resolves a mutation ${testCase.status} ${testCase.code} as ${testCase.outcome}`, () => {
      const resolution = resolveAdaptiveQueueError(
        apiError(testCase),
        'mutation',
      );

      expect(resolution.kind).toBe(testCase.kind);
      expect(resolution.outcome).toBe(testCase.outcome);
      expect(resolution.requiresRefresh).toBe(testCase.refresh);
    });
  }

  it('AQE-11 treats an invalid mutation response as uncertain', () => {
    const resolution = resolveAdaptiveQueueError(
      new AdaptiveQueueResponseError('job.id'),
      'mutation',
    );

    expect(resolution.kind).toBe('invalid-response');
    expect(resolution.outcome).toBe('uncertain');
    expect(resolution.requiresRefresh).toBe(true);
    expect(resolution.message).toContain('may have been applied');
  });

  it('AQE-12 treats a non-API mutation error as uncertain', () => {
    const resolution = resolveAdaptiveQueueError(
      new Error(SENSITIVE),
      'mutation',
    );

    expect(resolution.kind).toBe('unknown');
    expect(resolution.outcome).toBe('uncertain');
    expect(resolution.requiresRefresh).toBe(true);
  });

  it('AQE-13 states that rejected requests made no change where it is certain', () => {
    for (const code of [
      'BAD_REQUEST',
      'VALIDATION_ERROR',
      'FORBIDDEN',
    ] as const) {
      const resolution = resolveAdaptiveQueueError(
        new ApiError(400, code, SENSITIVE),
        'mutation',
      );

      expect(resolution.outcome).toBe('rejected');
      expect(resolution.message).toContain('No change was made');
    }
  });

  it('AQE-14 says it is not known whether an uncertain change was applied', () => {
    for (const code of ['NETWORK_ERROR', 'SERVER_ERROR'] as const) {
      const resolution = resolveAdaptiveQueueError(
        new ApiError(0, code, SENSITIVE),
        'mutation',
      );

      expect(resolution.outcome).toBe('uncertain');
      expect(resolution.message).toContain('not known whether');
      expect(resolution.message).not.toContain('No change was made');
    }
  });

  it('AQE-15 does not claim an uncertain mutation was rejected', () => {
    const resolution = resolveAdaptiveQueueError(
      new ApiError(500, 'SERVER_ERROR', SENSITIVE),
      'mutation',
    );

    expect(resolution.message.toLowerCase()).not.toContain('rejected');
  });

  it('AQE-16 asks for sign-in only for unauthorized errors', () => {
    for (const testCase of CASES) {
      for (const operation of ['read', 'mutation'] as const) {
        expect(
          resolveAdaptiveQueueError(apiError(testCase), operation)
            .requiresSignIn,
        ).toBe(testCase.kind === 'unauthorized');
      }
    }
  });

  it('AQE-17 does not require a refresh after a plain validation rejection', () => {
    for (const code of ['BAD_REQUEST', 'VALIDATION_ERROR'] as const) {
      expect(
        resolveAdaptiveQueueError(
          new ApiError(400, code, SENSITIVE),
          'mutation',
        ).requiresRefresh,
      ).toBe(false);
    }
  });
});

describe('resolveAdaptiveQueueError: safety', () => {
  const operations = ['read', 'mutation'] as const;

  it('AQE-18 never exposes raw server or exception text', () => {
    const inputs: unknown[] = [
      ...CASES.map(apiError),
      new Error(SENSITIVE),
      new AdaptiveQueueResponseError(SENSITIVE),
      new BookingResponseError(SENSITIVE),
      SENSITIVE,
    ];

    for (const input of inputs) {
      for (const operation of operations) {
        const message = resolveAdaptiveQueueErrorMessage(
          input,
          operation,
        );

        expect(message).not.toContain('hunter2');
        expect(message).not.toContain('SqlException');
        expect(message).not.toContain('Server.Internal');
        expect(message).not.toContain('jobs[');
      }
    }
  });

  it('AQE-19 does not interpret or invent backend conflict codes', () => {
    const plain = resolveAdaptiveQueueError(
      new ApiError(409, 'CONFLICT', SENSITIVE),
      'mutation',
    );
    const withBookingCode = resolveAdaptiveQueueError(
      new ApiError(409, 'CONFLICT', SENSITIVE, 'bay_busy'),
      'mutation',
    );

    expect(withBookingCode).toEqual(plain);
    expect(withBookingCode.message.toLowerCase())
      .not.toContain('bay is');
    expect(withBookingCode.message.toLowerCase())
      .not.toContain('mechanic');
  });

  it('AQE-20 returns a fixed message for every kind and operation', () => {
    const kinds = new Set<AdaptiveQueueErrorKind>();

    for (const testCase of CASES) {
      kinds.add(classifyAdaptiveQueueError(apiError(testCase)));
    }

    kinds.add('invalid-response');

    for (const kind of kinds) {
      for (const operation of operations) {
        const source =
          kind === 'invalid-response'
            ? new AdaptiveQueueResponseError('jobs')
            : apiError(
                CASES.find(item => item.kind === kind) as Case,
              );

        const first = resolveAdaptiveQueueErrorMessage(source, operation);
        const second = resolveAdaptiveQueueErrorMessage(source, operation);

        expect(first).toBe(second);
        expect(first.length).toBeGreaterThan(0);
      }
    }

    expect(kinds.size).toBe(11);
  });

  it('AQE-21 returns the same message from both resolver functions', () => {
    for (const testCase of CASES) {
      for (const operation of operations) {
        expect(
          resolveAdaptiveQueueErrorMessage(apiError(testCase), operation),
        ).toBe(
          resolveAdaptiveQueueError(apiError(testCase), operation)
            .message,
        );
      }
    }
  });

  it('AQE-22 produces distinct read and mutation messages for each kind', () => {
    for (const testCase of CASES) {
      expect(
        resolveAdaptiveQueueErrorMessage(apiError(testCase), 'read'),
      ).not.toBe(
        resolveAdaptiveQueueErrorMessage(apiError(testCase), 'mutation'),
      );
    }
  });
});
