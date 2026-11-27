import { TestBed } from '@angular/core/testing';

import {
  HttpClient,
  HttpErrorResponse,
  HttpRequest,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';

import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { firstValueFrom, throwError } from 'rxjs';

import { ApiError } from '../models/api-error.model';
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
    { status: 409, code: 'CONFLICT' },
    { status: 422, code: 'VALIDATION_ERROR' },
    { status: 429, code: 'RATE_LIMITED' },
    { status: 500, code: 'SERVER_ERROR' },
    { status: 503, code: 'SERVER_ERROR' },
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
});
