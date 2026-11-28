import {
  HttpClient,
  HttpContext,
  HttpContextToken,
  HttpErrorResponse,
  HttpRequest,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_CONFIG } from '../config/api.config';
import { authInterceptor, SKIP_AUTH } from '../interceptors/auth.interceptor';
import { errorInterceptor } from '../interceptors/error.interceptor';
import { ApiError } from '../models/api-error.model';
import type { AuthSession } from '../models/auth-session.model';

import { HttpRequestProvenanceService } from './http-request-provenance.service';
import { SessionService } from './session.service';

const BASE = 'https://api.fixora.test';
const CALLER_TOKEN = new HttpContextToken<string>(() => 'default');

function makeSession(
  id: string = 'manager-001',
  token: string = `secret-jwt-${id}`,
): AuthSession {
  return {
    accessToken: token,
    expiresAt: Date.now() + 60_000,
    user: {
      id,
      displayName: `Manager ${id}`,
      email: `${id}@fixora.test`,
      roles: ['Manager'],
    },
  };
}

function captureError<T>(observable$: import('rxjs').Observable<T>): {
  error: unknown;
  completed: boolean;
} {
  const state: { error: unknown; completed: boolean } = {
    error: undefined,
    completed: false,
  };

  observable$.subscribe({
    error: err => {
      state.error = err;
    },
    complete: () => {
      state.completed = true;
    },
  });

  return state;
}

describe('HttpRequestProvenanceService', () => {
  let provenance: HttpRequestProvenanceService;
  let sessionService: SessionService;
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([errorInterceptor, authInterceptor]),
        ),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
      ],
    });

    provenance = TestBed.inject(HttpRequestProvenanceService);
    sessionService = TestBed.inject(SessionService);
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
  });

  it('HRP-01 binds provenance across errorInterceptor -> authInterceptor clones using a per-dispatch ticket', () => {
    const activeSession = makeSession('manager-001', 'jwt-token-hrp-01');
    sessionService.setSession(activeSession);

    const callerContext = new HttpContext().set(CALLER_TOKEN, 'caller-value');
    const captured = captureError(
      http.get(`${BASE}/api/v1/manager/jobs`, { context: callerContext }),
    );

    const req = httpMock.expectOne(`${BASE}/api/v1/manager/jobs`);
    expect(req.request.headers.get('Authorization')).toBe(
      'Bearer jwt-token-hrp-01',
    );
    expect(req.request.context.get(CALLER_TOKEN)).toBe('caller-value');
    // Caller's context instance is never mutated with a dispatch ticket.
    expect(req.request.context).not.toBe(callerContext);

    req.flush(
      { message: 'Unauthorized' },
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(captured.error).toBeInstanceOf(ApiError);
    const meta = provenance.consumeErrorProvenance(captured.error);

    expect(meta).not.toBeNull();
    expect(meta?.session).toBe(activeSession);
    expect(meta?.method).toBe('GET');
    expect(meta?.resolvedUrl).toBe(`${BASE}/api/v1/manager/jobs`);
    expect(meta?.skipAuth).toBe(false);
    expect(meta?.authHeaderAttached).toBe(true);
    // Does not store copied tokens, Authorization headers, or extra fields outside the exact AuthSession reference.
    expect(Object.keys(meta as object).sort()).toEqual([
      'authHeaderAttached',
      'method',
      'resolvedUrl',
      'session',
      'skipAuth',
    ]);
    expect(JSON.stringify({ ...meta, session: undefined })).not.toContain(
      'jwt-token-hrp-01',
    );
    expect(JSON.stringify(meta)).not.toContain('Bearer');
    // Consumed provenance is single-use.
    expect(provenance.consumeErrorProvenance(captured.error)).toBeNull();
  });

  it('HRP-02 supports outer authInterceptor -> inner errorInterceptor ordering without cross-talk', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([authInterceptor, errorInterceptor]),
        ),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
      ],
    });

    provenance = TestBed.inject(HttpRequestProvenanceService);
    sessionService = TestBed.inject(SessionService);
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);

    const activeSession = makeSession('manager-002', 'jwt-token-hrp-02');
    sessionService.setSession(activeSession);

    const captured = captureError(http.post(`${BASE}/api/v1/manager/approvals/proposals/p1/forward`, {}));
    const req = httpMock.expectOne(
      `${BASE}/api/v1/manager/approvals/proposals/p1/forward`,
    );

    expect(req.request.headers.get('Authorization')).toBe(
      'Bearer jwt-token-hrp-02',
    );
    req.flush(null, { status: 403, statusText: 'Forbidden' });

    const meta = provenance.consumeErrorProvenance(captured.error);
    expect(meta).toEqual({
      session: activeSession,
      resolvedUrl: `${BASE}/api/v1/manager/approvals/proposals/p1/forward`,
      method: 'POST',
      skipAuth: false,
      authHeaderAttached: true,
    });
  });

  it('HRP-03 rejects manually constructed ApiError, pre-existing Authorization headers, SKIP_AUTH and missing authInterceptor', () => {
    const manualError = new ApiError(401, 'UNAUTHORIZED', 'Forged');
    expect(provenance.consumeErrorProvenance(manualError)).toBeNull();

    const activeSession = makeSession();
    sessionService.setSession(activeSession);

    // 1. SKIP_AUTH request leaves no authenticated provenance.
    const skipCaptured = captureError(
      http.post(
        `${BASE}/api/v1/manager/auth/login`,
        {},
        { context: new HttpContext().set(SKIP_AUTH, true) },
      ),
    );
    const skipReq = httpMock.expectOne(`${BASE}/api/v1/manager/auth/login`);
    expect(skipReq.request.headers.has('Authorization')).toBe(false);
    skipReq.flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(provenance.consumeErrorProvenance(skipCaptured.error)).toBeNull();

    // 2. Caller-supplied explicit Authorization header is not authInterceptor-authenticated.
    const customAuthCaptured = captureError(
      http.get(`${BASE}/api/v1/manager/jobs`, {
        headers: { Authorization: 'Bearer explicit-caller-header' },
      }),
    );
    const customReq = httpMock.expectOne(`${BASE}/api/v1/manager/jobs`);
    expect(customReq.request.headers.get('Authorization')).toBe(
      'Bearer explicit-caller-header',
    );
    customReq.flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(
      provenance.consumeErrorProvenance(customAuthCaptured.error),
    ).toBeNull();

    // 3. Error interceptor alone (missing authInterceptor) produces no provenance.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
      ],
    });
    const isolatedProvenance = TestBed.inject(HttpRequestProvenanceService);
    const isolatedHttp = TestBed.inject(HttpClient);
    const isolatedMock = TestBed.inject(HttpTestingController);
    TestBed.inject(SessionService).setSession(activeSession);

    const noAuthCaptured = captureError(
      isolatedHttp.get(`${BASE}/api/v1/manager/jobs`),
    );
    const noAuthReq = isolatedMock.expectOne(`${BASE}/api/v1/manager/jobs`);
    expect(noAuthReq.request.headers.has('Authorization')).toBe(false);
    noAuthReq.flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(
      isolatedProvenance.consumeErrorProvenance(noAuthCaptured.error),
    ).toBeNull();
    isolatedMock.verify();
  });

  it('HRP-04 isolates concurrent requests to identical URLs and repeated cold subscriptions', () => {
    const sessionA = makeSession('manager-A', 'token-A');
    const sessionB = makeSession('manager-B', 'token-B');

    const sharedContext = new HttpContext().set(CALLER_TOKEN, 'shared-input');
    const coldObs$ = http.get(`${BASE}/api/v1/manager/jobs`, {
      context: sharedContext,
    });

    sessionService.setSession(sessionA);
    const firstSub = captureError(coldObs$);

    sessionService.setSession(sessionB);
    const secondSub = captureError(coldObs$);

    const requests = httpMock.match(`${BASE}/api/v1/manager/jobs`);
    expect(requests).toHaveLength(2);
    expect(requests[0].request.headers.get('Authorization')).toBe(
      'Bearer token-A',
    );
    expect(requests[1].request.headers.get('Authorization')).toBe(
      'Bearer token-B',
    );

    // Succeed the second request and fail the first request: provenance must remain bound to sessionA only.
    requests[1].flush([]);
    expect(secondSub.completed).toBe(true);
    expect(secondSub.error).toBeUndefined();

    requests[0].flush(null, { status: 401, statusText: 'Unauthorized' });
    const meta = provenance.consumeErrorProvenance(firstSub.error);
    expect(meta?.session).toBe(sessionA);
    expect(meta?.method).toBe('GET');
  });

  it('HRP-05 rejects untrusted URLs, mismatched HttpErrorResponse URLs, missing sessions and releases tickets on cancellation', () => {
    const activeSession = makeSession();
    sessionService.setSession(activeSession);

    // Untrusted HTTP (non-HTTPS) request gets no provenance
    const insecureSub = captureError(
      http.get('http://api.fixora.test/api/v1/manager/jobs'),
    );
    const insecureReq = httpMock.expectOne(
      'http://api.fixora.test/api/v1/manager/jobs',
    );
    expect(insecureReq.request.headers.has('Authorization')).toBe(false);
    insecureReq.flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(provenance.consumeErrorProvenance(insecureSub.error)).toBeNull();

    // Direct ticket mismatch check (redirected/mismatched HttpErrorResponse.url)
    const req = new HttpRequest('GET', `${BASE}/api/v1/manager/jobs`);
    const dispatch = provenance.beginErrorInterceptorDispatch(req, false);
    const authClone = dispatch.request.clone({
      setHeaders: { Authorization: `Bearer ${activeSession.accessToken}` },
    });
    provenance.recordAuthenticatedDispatch(authClone, activeSession, false);

    const mismatchedApiError = new ApiError(401, 'UNAUTHORIZED', 'Mismatch');
    provenance.associateNormalizedError(
      dispatch.ticket,
      authClone,
      new HttpErrorResponse({
        status: 401,
        url: `${BASE}/api/v1/manager/approvals/proposals`,
      }),
      mismatchedApiError,
    );
    expect(provenance.consumeErrorProvenance(mismatchedApiError)).toBeNull();

    // Cancelled subscription cleans up cleanly with zero storage or console calls
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      method => vi.spyOn(console, method).mockImplementation(() => undefined),
    );

    const cancelledSub = http
      .get(`${BASE}/api/v1/manager/jobs`)
      .subscribe();
    httpMock.expectOne(`${BASE}/api/v1/manager/jobs`);
    cancelledSub.unsubscribe();

    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    for (const spy of consoleSpies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});
