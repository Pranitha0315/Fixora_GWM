import { TestBed } from '@angular/core/testing';

import {
  HttpClient,
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
