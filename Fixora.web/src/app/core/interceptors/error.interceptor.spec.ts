import { TestBed } from '@angular/core/testing';

import {
  HttpClient,
  HttpContext,
  HttpErrorResponse,
  HttpRequest,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';

import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { firstValueFrom, throwError, TimeoutError } from 'rxjs';

import { HttpRequestProvenanceService } from '../auth/http-request-provenance.service';
import { SessionService } from '../auth/session.service';
import { API_CONFIG } from '../config/api.config';
import type { AuthSession } from '../models/auth-session.model';
import { ApiError } from '../models/api-error.model';
import { authInterceptor } from './auth.interceptor';
import { errorInterceptor } from './error.interceptor';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;

  const url = 'https://api.example.test/api/bookings';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([errorInterceptor]),
        ),
        provideHttpClientTesting(),
      ],
    });

    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    controller.verify();
  });

  it('should preserve a successful response', async () => {
    const result = firstValueFrom(http.get(url));

    controller.expectOne(url).flush({
      success: true,
    });

    await expect(result).resolves.toEqual({
      success: true,
    });
  });

  it('should normalize network errors', async () => {
    const result = firstValueFrom(http.get(url));

    const assertion = expect(result).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      code: 'NETWORK_ERROR',
    });

    controller.expectOne(url).error(
      new ProgressEvent('error'),
    );

    await assertion;
  });

  const errorCases = [
    { status: 400, code: 'BAD_REQUEST' },
    { status: 401, code: 'UNAUTHORIZED' },
    { status: 403, code: 'FORBIDDEN' },
    { status: 404, code: 'NOT_FOUND' },
    { status: 408, code: 'UNKNOWN_ERROR' },
    { status: 409, code: 'CONFLICT' },
    { status: 422, code: 'VALIDATION_ERROR' },
    { status: 429, code: 'RATE_LIMITED' },
    { status: 500, code: 'SERVER_ERROR' },
    { status: 503, code: 'SERVER_ERROR' },
    { status: 504, code: 'SERVER_ERROR' },
    { status: 418, code: 'UNKNOWN_ERROR' },
  ] as const;

  for (const testCase of errorCases) {
    it(`should normalize HTTP ${testCase.status}`, async () => {
      const result = firstValueFrom(http.get(url));

      const assertion = expect(result).rejects.toMatchObject({
        name: 'ApiError',
        status: testCase.status,
        code: testCase.code,
      });

      controller.expectOne(url).flush(
        {},
        {
          status: testCase.status,
          statusText: 'Test HTTP error',
        },
      );

      await assertion;
    });
  }

  it('should not expose sensitive backend error details', async () => {
    const result = firstValueFrom(http.get(url));

    const assertion = expect(result).rejects.toEqual(
      new ApiError(
        500,
        'SERVER_ERROR',
        'A server error occurred. Please try again later.',
      ),
    );

    controller.expectOne(url).flush(
      {
        message: 'Sensitive internal database information',
        stackTrace: 'Internal application stack trace',
      },
      {
        status: 500,
        statusText: 'Internal Server Error',
      },
    );

    await assertion;
  });

  const approvedConflicts = [
    'mechanic_busy',
    'bay_busy',
    'slot_full',
    'booking_not_requested',
    'booking_not_reschedulable',
    'booking_not_confirmed',
    'concurrency_conflict',
  ] as const;

  for (const code of approvedConflicts) {
    it(`CE-01 preserves approved conflict ${code}`, async () => {
      const result = firstValueFrom(http.get(url));

      const assertion = expect(result).rejects.toMatchObject({
        name: 'ApiError',
        status: 409,
        code: 'CONFLICT',
        conflictCode: code,
        message: 'The request conflicts with existing data.',
      });

      controller.expectOne(url).flush(
        { code },
        {
          status: 409,
          statusText: 'Conflict',
        },
      );

      await assertion;
    });
  }

  const invalidConflictBodies = [
    { label: 'unknown code', body: { code: 'unknown_conflict' } },
    { label: 'missing code', body: {} },
    { label: 'null code', body: { code: null } },
    { label: 'numeric code', body: { code: 123 } },
    { label: 'boolean code', body: { code: true } },
    { label: 'array code', body: { code: ['mechanic_busy'] } },
    { label: 'nested code', body: { error: { code: 'mechanic_busy' } } },
    { label: 'uppercase code', body: { code: 'MECHANIC_BUSY' } },
    { label: 'string body', body: 'mechanic_busy' },
    { label: 'null body', body: null },
  ];

  for (const testCase of invalidConflictBodies) {
    it(`CE-02 rejects ${testCase.label}`, async () => {
      const result = firstValueFrom(http.get(url));

      const assertion = expect(result).rejects.toEqual(
        new ApiError(
          409,
          'CONFLICT',
          'The request conflicts with existing data.',
        ),
      );

      controller.expectOne(url).flush(
        testCase.body,
        {
          status: 409,
          statusText: 'Conflict',
        },
      );

      await assertion;
    });
  }

  const nonConflictStatuses = [
    { status: 400, code: 'BAD_REQUEST' },
    { status: 401, code: 'UNAUTHORIZED' },
    { status: 403, code: 'FORBIDDEN' },
    { status: 500, code: 'SERVER_ERROR' },
  ] as const;

  for (const testCase of nonConflictStatuses) {
    it(`CE-03 ignores conflict code on HTTP ${testCase.status}`, async () => {
      const result = firstValueFrom(http.get(url));

      const assertion = expect(result).rejects.toMatchObject({
        status: testCase.status,
        code: testCase.code,
        conflictCode: undefined,
      });

      controller.expectOne(url).flush(
        { code: 'mechanic_busy' },
        {
          status: testCase.status,
          statusText: 'Test HTTP error',
        },
      );

      await assertion;
    });
  }

  it('CE-04 does not expose sensitive conflict details', async () => {
    const result = firstValueFrom(http.get(url));

    const assertion = expect(result).rejects.toEqual(
      new ApiError(
        409,
        'CONFLICT',
        'The request conflicts with existing data.',
        'bay_busy',
      ),
    );

    controller.expectOne(url).flush(
      {
        code: 'bay_busy',
        message: 'Sensitive database information',
        stackTrace: 'Internal stack trace',
        connectionString: 'Sensitive connection details',
      },
      {
        status: 409,
        statusText: 'Conflict',
      },
    );

    await assertion;
  });

  it('CE-05 rejects inherited conflict properties', async () => {
    const body = Object.create({
      code: 'mechanic_busy',
    });

    const original = new HttpErrorResponse({
      status: 409,
      statusText: 'Conflict',
      error: body,
    });

    const result = firstValueFrom(
      TestBed.runInInjectionContext(() =>
        errorInterceptor(
          new HttpRequest('GET', url),
          () => throwError(() => original),
        ),
      ),
    );

    await expect(result).rejects.toEqual(
      new ApiError(
        409,
        'CONFLICT',
        'The request conflicts with existing data.',
      ),
    );
  });

  it('CE-06 does not execute conflict property getters', async () => {
    let getterCalls = 0;

    const body = Object.defineProperty({}, 'code', {
      get: () => {
        getterCalls++;
        return 'mechanic_busy';
      },
    });

    const original = new HttpErrorResponse({
      status: 409,
      statusText: 'Conflict',
      error: body,
    });

    const result = firstValueFrom(
      TestBed.runInInjectionContext(() =>
        errorInterceptor(
          new HttpRequest('GET', url),
          () => throwError(() => original),
        ),
      ),
    );

    await expect(result).rejects.toEqual(
      new ApiError(
        409,
        'CONFLICT',
        'The request conflicts with existing data.',
      ),
    );

    expect(getterCalls).toBe(0);
  });

  it('CE-07 preserves the existing ApiError constructor contract', () => {
    const error = new ApiError(
      409,
      'CONFLICT',
      'Existing message',
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ApiError');
    expect(error.status).toBe(409);
    expect(error.code).toBe('CONFLICT');
    expect(error.message).toBe('Existing message');
    expect(error.conflictCode).toBeUndefined();
  });

  it('should preserve non-HTTP errors', async () => {
    const originalError = new Error('Application error');

    const result = firstValueFrom(
      TestBed.runInInjectionContext(() =>
        errorInterceptor(
          new HttpRequest('GET', url),
          () => throwError(() => originalError),
        ),
      ),
    );

    await expect(result).rejects.toBe(originalError);
  });

  const approvedFixProofConflicts = [
    'proposal_wrong_state',
    'proposal_not_published',
    'change_wrong_state',
  ] as const;

  for (const code of approvedFixProofConflicts) {
    it(`FP-01 preserves approved FixProof conflict ${code}`, async () => {
      const result = firstValueFrom(http.get(url));

      const assertion = expect(result).rejects.toMatchObject({
        name: 'ApiError',
        status: 409,
        code: 'CONFLICT',
        conflictCode: undefined,
        fixProofConflictCode: code,
        message: 'The request conflicts with existing data.',
      });

      controller.expectOne(url).flush(
        { code },
        {
          status: 409,
          statusText: 'Conflict',
        },
      );

      await assertion;
    });
  }

  const disallowedFixProofCodes = [
    { label: 'customer-only item_version_changed', body: { code: 'item_version_changed' } },
    { label: 'mechanic-only change_not_forwarded', body: { code: 'change_not_forwarded' } },
    { label: 'uppercase proposal_wrong_state', body: { code: 'PROPOSAL_WRONG_STATE' } },
  ];

  for (const testCase of disallowedFixProofCodes) {
    it(`FP-02 rejects unlisted FixProof code (${testCase.label})`, async () => {
      const result = firstValueFrom(http.get(url));

      const assertion = expect(result).rejects.toEqual(
        new ApiError(
          409,
          'CONFLICT',
          'The request conflicts with existing data.',
        ),
      );

      controller.expectOne(url).flush(
        testCase.body,
        {
          status: 409,
          statusText: 'Conflict',
        },
      );

      await assertion;
    });
  }

  for (const testCase of nonConflictStatuses) {
    it(`FP-03 ignores FixProof conflict code on HTTP ${testCase.status}`, async () => {
      const result = firstValueFrom(http.get(url));

      const assertion = expect(result).rejects.toMatchObject({
        status: testCase.status,
        code: testCase.code,
        conflictCode: undefined,
        fixProofConflictCode: undefined,
      });

      controller.expectOne(url).flush(
        { code: 'proposal_wrong_state' },
        {
          status: testCase.status,
          statusText: 'Test HTTP error',
        },
      );

      await assertion;
    });
  }

  it('FP-04 does not expose sensitive FixProof conflict details', async () => {
    const result = firstValueFrom(http.get(url));

    const assertion = expect(result).rejects.toEqual(
      new ApiError(
        409,
        'CONFLICT',
        'The request conflicts with existing data.',
        undefined,
        'proposal_not_published',
      ),
    );

    controller.expectOne(url).flush(
      {
        code: 'proposal_not_published',
        message: 'Raw backend exception message',
        stackTrace: 'Internal stack trace',
      },
      {
        status: 409,
        statusText: 'Conflict',
      },
    );

    await assertion;
  });

  it('FP-05 rejects inherited and getter FixProof conflict codes', async () => {
    const inheritedBody = Object.create({
      code: 'change_wrong_state',
    });

    const inheritedError = new HttpErrorResponse({
      status: 409,
      statusText: 'Conflict',
      error: inheritedBody,
    });

    const inheritedResult = firstValueFrom(
      TestBed.runInInjectionContext(() =>
        errorInterceptor(
          new HttpRequest('GET', url),
          () => throwError(() => inheritedError),
        ),
      ),
    );

    await expect(inheritedResult).rejects.toEqual(
      new ApiError(
        409,
        'CONFLICT',
        'The request conflicts with existing data.',
      ),
    );

    let getterCalls = 0;

    const getterBody = Object.defineProperty({}, 'code', {
      get: () => {
        getterCalls++;
        return 'proposal_wrong_state';
      },
    });

    const getterError = new HttpErrorResponse({
      status: 409,
      statusText: 'Conflict',
      error: getterBody,
    });

    const getterResult = firstValueFrom(
      TestBed.runInInjectionContext(() =>
        errorInterceptor(
          new HttpRequest('GET', url),
          () => throwError(() => getterError),
        ),
      ),
    );

    await expect(getterResult).rejects.toEqual(
      new ApiError(
        409,
        'CONFLICT',
        'The request conflicts with existing data.',
      ),
    );

    expect(getterCalls).toBe(0);
  });

  it('passes through RxJS TimeoutError without wrapping or retrying', async () => {
    const timeoutErr = new TimeoutError();

    const result = firstValueFrom(
      TestBed.runInInjectionContext(() =>
        errorInterceptor(
          new HttpRequest('POST', url, {}),
          () => throwError(() => timeoutErr),
        ),
      ),
    );

    await expect(result).rejects.toBe(timeoutErr);
  });

  it('correlates normalized ApiError with authenticated request provenance across cloned requests without leaking caller context', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([errorInterceptor, authInterceptor]),
        ),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: 'https://api.example.test/api' } },
      ],
    });

    const authedHttp = TestBed.inject(HttpClient);
    const authedController = TestBed.inject(HttpTestingController);
    const session = TestBed.inject(SessionService);
    const provenance = TestBed.inject(HttpRequestProvenanceService);

    const active: AuthSession = {
      accessToken: 'error-interceptor-token',
      expiresAt: Date.now() + 60_000,
      user: {
        id: 'm1',
        displayName: 'Manager One',
        email: 'm1@example.test',
        roles: ['Manager'],
      },
    };
    session.setSession(active);

    const sharedContext = new HttpContext();
    const firstPromise = firstValueFrom(
      authedHttp.get(url, { context: sharedContext }),
    ).catch(err => err as unknown);
    const secondPromise = firstValueFrom(
      authedHttp.get(url, { context: sharedContext }),
    ).catch(err => err as unknown);

    const pending = authedController.match(url);
    expect(pending).toHaveLength(2);
    expect(pending[0].request.headers.get('Authorization')).toBe(
      'Bearer error-interceptor-token',
    );
    expect(pending[1].request.headers.get('Authorization')).toBe(
      'Bearer error-interceptor-token',
    );

    pending[0].flush(null, { status: 401, statusText: 'Unauthorized' });
    pending[1].flush({ ok: true });

    const firstError = await firstPromise;
    const secondOk = await secondPromise;
    expect(firstError).toBeInstanceOf(ApiError);
    expect(secondOk).toEqual({ ok: true });

    const meta = provenance.consumeErrorProvenance(firstError);
    expect(meta).toEqual({
      session: active,
      resolvedUrl: url,
      method: 'GET',
      skipAuth: false,
      authHeaderAttached: true,
    });
    expect(provenance.consumeErrorProvenance(new ApiError(401, 'UNAUTHORIZED', 'Manual'))).toBeNull();

    authedController.verify();
  });
});
