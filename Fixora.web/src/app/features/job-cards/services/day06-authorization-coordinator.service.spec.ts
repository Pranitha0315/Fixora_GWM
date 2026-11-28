import {
  HttpClient,
  HttpContext,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TimeoutError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionService } from '../../../core/auth/session.service';
import { API_CONFIG } from '../../../core/config/api.config';
import type { ApiConfig } from '../../../core/config/api.config';
import {
  authInterceptor,
  SKIP_AUTH,
} from '../../../core/interceptors/auth.interceptor';
import { errorInterceptor } from '../../../core/interceptors/error.interceptor';
import { ApiError } from '../../../core/models/api-error.model';
import type { AuthSession } from '../../../core/models/auth-session.model';

import {
  Day06AuthorizationCoordinatorService,
  type Day06ForbiddenEvent,
  type Day06RequestProvenance,
} from './day06-authorization-coordinator.service';

const BASE = 'https://api.fixora.test';
const START = new Date('2026-11-28T09:30:00.000Z').getTime();
const JOB_1 = '11111111-1111-4111-8111-111111111111';
const JOB_2 = '22222222-2222-4222-8222-222222222222';
const PROPOSAL_1 = '33333333-3333-4333-8333-333333333331';
const ITEM_1 = '44444444-4444-4444-8444-444444444441';

function makeSession(
  id: string = 'manager-001',
  ttlMs: number = 60 * 60 * 1000,
  token: string = `token-${id}`,
): AuthSession {
  return {
    accessToken: token,
    expiresAt: START + ttlMs,
    user: {
      id,
      displayName: `Manager ${id}`,
      email: `${id}@fixora.test`,
      roles: ['Manager'],
    },
  };
}

function api401(): ApiError {
  return new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
}

function api403(): ApiError {
  return new ApiError(403, 'FORBIDDEN', 'Permission denied.');
}

describe('Day06AuthorizationCoordinatorService', () => {
  let coordinator: Day06AuthorizationCoordinatorService;
  let sessionService: SessionService;
  let http: HttpClient;
  let httpMock: HttpTestingController;

  function configure(
    config?: ApiConfig | null,
    withAuthInterceptor: boolean = true,
  ): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors(
            withAuthInterceptor
              ? [errorInterceptor, authInterceptor]
              : [errorInterceptor],
          ),
        ),
        provideHttpClientTesting(),
        ...(config === undefined
          ? []
          : [{ provide: API_CONFIG, useValue: config }]),
      ],
    });

    coordinator = TestBed.inject(Day06AuthorizationCoordinatorService);
    sessionService = TestBed.inject(SessionService);
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  }

  function dispatchAndFailHttp(
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    status: 401 | 403,
    options: {
      readonly expectedToken?: string;
      readonly context?: HttpContext;
      readonly headers?: Record<string, string>;
    } = {},
  ): unknown {
    let capturedError: unknown;
    const obs$ =
      method === 'GET'
        ? http.get(url, { context: options.context, headers: options.headers })
        : method === 'PUT'
          ? http.put(url, {}, { context: options.context, headers: options.headers })
          : http.post(url, {}, { context: options.context, headers: options.headers });

    obs$.subscribe({
      error: err => {
        capturedError = err;
      },
    });

    const req = httpMock.expectOne(r => r.url === url && r.method === method);
    if (options.expectedToken !== undefined) {
      expect(req.request.headers.get('Authorization')).toBe(
        `Bearer ${options.expectedToken}`,
      );
    }

    req.flush(
      { message: 'Auth failure' },
      { status, statusText: status === 401 ? 'Unauthorized' : 'Forbidden' },
    );

    return capturedError;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    configure({ baseUrl: BASE });
  });

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('DAC-01 builds immutable provenance with method verification for Day06 endpoints', () => {
    const session = makeSession('manager-001');
    sessionService.setSession(session);

    const jobsProvenance = coordinator.createRequestProvenance(
      'job-cards',
      session,
      'api/v1/manager/jobs',
      'GET',
    );
    const approvalsProvenance = coordinator.createRequestProvenance(
      'fixproof-read',
      session,
      '/api/v1/manager/approvals/proposals',
      'GET',
    );
    const mutationProvenance = coordinator.createRequestProvenance(
      'fixproof-mutation',
      session,
      `api/v1/manager/approvals/proposals/${PROPOSAL_1}/forward`,
      'POST',
    );
    const priceProvenance = coordinator.createRequestProvenance(
      'fixproof-mutation',
      session,
      `api/v1/manager/approvals/proposals/${PROPOSAL_1}/items/${ITEM_1}/price`,
      'PUT',
    );

    expect(jobsProvenance).toEqual({
      feature: 'job-cards',
      session,
      endpointPath: 'api/v1/manager/jobs',
      resolvedUrl: `${BASE}/api/v1/manager/jobs`,
      method: 'GET',
      skipAuth: false,
    });
    expect(Object.isFrozen(jobsProvenance)).toBe(true);
    expect(approvalsProvenance?.resolvedUrl).toBe(
      `${BASE}/api/v1/manager/approvals/proposals`,
    );
    expect(mutationProvenance?.resolvedUrl).toBe(
      `${BASE}/api/v1/manager/approvals/proposals/${PROPOSAL_1}/forward`,
    );
    expect(priceProvenance?.method).toBe('PUT');

    // Invalid feature/method/path pairings are rejected.
    expect(
      coordinator.createRequestProvenance(
        'job-cards',
        session,
        'api/v1/manager/jobs',
        'POST',
      ),
    ).toBeNull();
    expect(
      coordinator.createRequestProvenance(
        'fixproof-read',
        session,
        `api/v1/manager/approvals/proposals/${PROPOSAL_1}/forward`,
        'GET',
      ),
    ).toBeNull();
    expect(
      coordinator.createRequestProvenance(
        'fixproof-mutation',
        session,
        `api/v1/manager/approvals/proposals/${PROPOSAL_1}/forward`,
        'GET',
      ),
    ).toBeNull();
  });

  it('DAC-02 supports trusted API_CONFIG with a sub-path prefix via actual authenticated HTTP dispatch', () => {
    configure({ baseUrl: `${BASE}/gateway/` });
    const session = makeSession('manager-001', 60_000, 'tok-gw');
    sessionService.setSession(session);

    const provenance = coordinator.createRequestProvenance(
      'job-cards',
      session,
      'api/v1/manager/jobs',
      'GET',
    );

    expect(provenance?.resolvedUrl).toBe(
      `${BASE}/gateway/api/v1/manager/jobs`,
    );

    const httpError = dispatchAndFailHttp(
      'GET',
      `${BASE}/gateway/api/v1/manager/jobs`,
      401,
      { expectedToken: 'tok-gw' },
    );

    expect(coordinator.reportUnauthorized(provenance, httpError)).toBe(true);
    expect(coordinator.isSessionRevoked(session)).toBe(true);
  });

  it('DAC-03 rejects missing, null, empty, HTTP, credentialed and query API_CONFIG without bypassing validation', () => {
    const configs: Array<ApiConfig | null | undefined> = [
      undefined,
      null,
      { baseUrl: null },
      { baseUrl: '' },
      { baseUrl: '   ' },
      { baseUrl: 'http://api.fixora.test' },
      { baseUrl: 'https://user:pass@api.fixora.test' },
      { baseUrl: 'https://api.fixora.test?env=prod' },
      { baseUrl: 'https://api.fixora.test#frag' },
      { baseUrl: 'not-a-url' },
    ];

    for (const cfg of configs) {
      configure(cfg);
      const session = makeSession();
      sessionService.setSession(session);

      const provenance = coordinator.createRequestProvenance(
        'job-cards',
        session,
        'api/v1/manager/jobs',
        'GET',
      );
      expect(provenance).toBeNull();

      const forged: Day06RequestProvenance = {
        feature: 'job-cards',
        session,
        endpointPath: 'api/v1/manager/jobs',
        resolvedUrl: `${BASE}/api/v1/manager/jobs`,
        method: 'GET',
        skipAuth: false,
      };

      expect(coordinator.reportUnauthorized(forged, api401())).toBe(false);
      expect(coordinator.reportForbidden(forged, api403())).toBe(false);
      expect(coordinator.isSessionRevoked(session)).toBe(false);
      expect(coordinator.isCurrentSessionRevoked()).toBe(false);
    }
  });

  it('DAC-04 excludes login, anonymous media, non-Day06 paths, skipAuth and path-traversal endpoints', () => {
    const session = makeSession();
    sessionService.setSession(session);

    const disallowedPaths = [
      'api/v1/manager/auth/login',
      'api/v1/manager/auth/refresh',
      'api/v1/media/photo.jpg',
      'api/v1/manager/jobs/media/1',
      'api/v1/manager/bookings',
      'api/v1/manager/jobs/../auth/login',
      'api/v1/manager/jobs%2f..%2fauth',
      'api/v1/manager/jobs?activeOnly=true',
      'api/v1/manager/jobs#hash',
      '',
    ];

    for (const path of disallowedPaths) {
      expect(
        coordinator.createRequestProvenance('job-cards', session, path, 'GET'),
      ).toBeNull();

      const forged: Day06RequestProvenance = {
        feature: 'job-cards',
        session,
        endpointPath: path,
        resolvedUrl: `${BASE}/${path}`,
        method: 'GET',
        skipAuth: false,
      };
      expect(coordinator.reportUnauthorized(forged, api401())).toBe(false);
    }

    const skipAuthForged = {
      feature: 'job-cards' as const,
      session,
      endpointPath: 'api/v1/manager/jobs',
      resolvedUrl: `${BASE}/api/v1/manager/jobs`,
      method: 'GET' as const,
      skipAuth: true,
    } as unknown as Day06RequestProvenance;

    const realHttpErr = dispatchAndFailHttp(
      'GET',
      `${BASE}/api/v1/manager/jobs`,
      401,
      { expectedToken: session.accessToken },
    );
    expect(coordinator.reportUnauthorized(skipAuthForged, realHttpErr)).toBe(
      false,
    );
    expect(coordinator.isSessionRevoked(session)).toBe(false);

    // Real SKIP_AUTH HTTP request even with Day06 URL is rejected.
    const validProv = coordinator.createRequestProvenance(
      'job-cards',
      session,
      'api/v1/manager/jobs',
      'GET',
    );
    const skipContextErr = dispatchAndFailHttp(
      'GET',
      `${BASE}/api/v1/manager/jobs`,
      401,
      { context: new HttpContext().set(SKIP_AUTH, true) },
    );
    expect(coordinator.reportUnauthorized(validProv, skipContextErr)).toBe(
      false,
    );
    expect(coordinator.isSessionRevoked(session)).toBe(false);
  });

  it('DAC-05 rejects manual ApiError, pre-HTTP errors, missing authInterceptor, missing Bearer token, wrong method and mismatched endpoints', () => {
    const session = makeSession('manager-001', 60_000, 'tok-05');
    sessionService.setSession(session);
    const provenance = coordinator.createRequestProvenance(
      'job-cards',
      session,
      'api/v1/manager/jobs',
      'GET',
    );

    const invalidErrors: unknown[] = [
      api401(),
      new Error('UNAUTHORIZED'),
      new TypeError('Failed to fetch'),
      new TimeoutError(),
      new ApiError(403, 'FORBIDDEN', 'Forbidden'),
      new ApiError(500, 'UNAUTHORIZED', 'Forged status'),
      new ApiError(401, 'SERVER_ERROR', 'Forged code'),
      new HttpErrorResponse({
        status: 401,
        url: `${BASE}/api/v1/manager/jobs`,
      }),
      dispatchAndFailHttp('GET', 'https://untrusted.example/api/v1/manager/jobs', 401),
      dispatchAndFailHttp('GET', `${BASE}/api/v1/manager/auth/login`, 401),
      dispatchAndFailHttp('GET', `${BASE}/api/v1/media/pic.jpg`, 401),
      dispatchAndFailHttp('GET', `${BASE}/api/v1/manager/approvals/proposals`, 401),
      dispatchAndFailHttp('POST', `${BASE}/api/v1/manager/jobs`, 401),
      dispatchAndFailHttp('GET', `${BASE}/api/v1/manager/jobs`, 401, {
        headers: { Authorization: 'Bearer caller-supplied-not-session' },
      }),
    ];

    for (const err of invalidErrors) {
      expect(coordinator.reportUnauthorized(provenance, err)).toBe(false);
      expect(coordinator.isSessionRevoked(session)).toBe(false);
    }

    // Without authInterceptor, HTTP 401 has no auth provenance and is rejected.
    configure({ baseUrl: BASE }, false);
    sessionService.setSession(session);
    const noAuthProv = coordinator.createRequestProvenance(
      'job-cards',
      session,
      'api/v1/manager/jobs',
      'GET',
    );
    const noAuthErr = dispatchAndFailHttp('GET', `${BASE}/api/v1/manager/jobs`, 401);
    expect(coordinator.reportUnauthorized(noAuthProv, noAuthErr)).toBe(false);
    expect(coordinator.isSessionRevoked(session)).toBe(false);

    // With full interceptor chain and matching Bearer request, 401 propagates once.
    configure({ baseUrl: BASE }, true);
    sessionService.setSession(session);
    const authedProv = coordinator.createRequestProvenance(
      'job-cards',
      session,
      'api/v1/manager/jobs',
      'GET',
    );
    const matchingErr = dispatchAndFailHttp(
      'GET',
      `${BASE}/api/v1/manager/jobs`,
      401,
      { expectedToken: 'tok-05' },
    );
    expect(coordinator.reportUnauthorized(authedProv, matchingErr)).toBe(true);
    expect(coordinator.isSessionRevoked(session)).toBe(true);
    // Replay of the exact same ApiError object is rejected (single-use provenance).
    expect(coordinator.reportUnauthorized(authedProv, matchingErr)).toBe(false);
  });

  it('DAC-06 rejects stale session A HTTP errors after replacement before dispatch or delivery, logout or expiry at/before dispatch', () => {
    const sessionA = makeSession('manager-A', 60_000, 'tok-A');
    sessionService.setSession(sessionA);
    const provenanceA = coordinator.createRequestProvenance(
      'job-cards',
      sessionA,
      'api/v1/manager/jobs',
      'GET',
    );

    // 1. Dispatched under session A; session replaced by session B before error arrives.
    let staleErr: unknown;
    http.get(`${BASE}/api/v1/manager/jobs`).subscribe({
      error: err => {
        staleErr = err;
      },
    });
    const reqA = httpMock.expectOne(`${BASE}/api/v1/manager/jobs`);
    expect(reqA.request.headers.get('Authorization')).toBe('Bearer tok-A');

    const sessionB = makeSession('manager-B', 60_000, 'tok-B');
    sessionService.setSession(sessionB);

    reqA.flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(coordinator.reportUnauthorized(provenanceA, staleErr)).toBe(false);
    expect(coordinator.isSessionRevoked(sessionA)).toBe(false);
    expect(coordinator.isSessionRevoked(sessionB)).toBe(false);

    // 2. Session replacement before dispatch cannot satisfy stale session A provenance using session B's 401.
    const errFromB = dispatchAndFailHttp('GET', `${BASE}/api/v1/manager/jobs`, 401, {
      expectedToken: 'tok-B',
    });
    expect(coordinator.reportUnauthorized(provenanceA, errFromB)).toBe(false);
    expect(coordinator.isSessionRevoked(sessionA)).toBe(false);
    expect(coordinator.isSessionRevoked(sessionB)).toBe(false);

    // 3. Same user id as a new AuthSession object reference is still distinct.
    const sessionA2 = makeSession('manager-A', 60_000, 'tok-A');
    sessionService.setSession(sessionA2);
    const provenanceA2 = coordinator.createRequestProvenance(
      'fixproof-read',
      sessionA2,
      'api/v1/manager/approvals/proposals',
      'GET',
    );
    const errA2 = dispatchAndFailHttp(
      'GET',
      `${BASE}/api/v1/manager/approvals/proposals`,
      401,
      { expectedToken: 'tok-A' },
    );

    vi.advanceTimersByTime(60_001);
    expect(coordinator.reportUnauthorized(provenanceA2, errA2)).toBe(false);
    expect(coordinator.isSessionRevoked(sessionA2)).toBe(false);

    // 4. Session already expired at dispatch: authInterceptor omits Authorization and 401 cannot propagate.
    const expiring = makeSession('manager-exp', 120_000, 'tok-exp');
    sessionService.setSession(expiring);
    const provExp = coordinator.createRequestProvenance(
      'job-cards',
      expiring,
      'api/v1/manager/jobs',
      'GET',
    );
    vi.advanceTimersByTime(120_001);
    let expiredDispatchErr: unknown;
    http.get(`${BASE}/api/v1/manager/jobs`).subscribe({
      error: err => {
        expiredDispatchErr = err;
      },
    });
    const expReq = httpMock.expectOne(`${BASE}/api/v1/manager/jobs`);
    expect(expReq.request.headers.has('Authorization')).toBe(false);
    expReq.flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(coordinator.reportUnauthorized(provExp, expiredDispatchErr)).toBe(
      false,
    );
    expect(coordinator.isSessionRevoked(expiring)).toBe(false);

    // 5. Logout before error report prevents propagation.
    const sessionC = makeSession('manager-C', 300_000, 'tok-C');
    sessionService.setSession(sessionC);
    const provenanceC = coordinator.createRequestProvenance(
      'fixproof-read',
      sessionC,
      'api/v1/manager/approvals/proposals',
      'GET',
    );
    const errC = dispatchAndFailHttp(
      'GET',
      `${BASE}/api/v1/manager/approvals/proposals`,
      401,
      { expectedToken: 'tok-C' },
    );
    sessionService.clearSession();
    expect(coordinator.reportUnauthorized(provenanceC, errC)).toBe(false);
    expect(coordinator.isSessionRevoked(sessionC)).toBe(false);
  });

  it('DAC-07 marks session revoked before notifying listeners synchronously and prevents recursion', () => {
    const session = makeSession();
    sessionService.setSession(session);
    const provenance = coordinator.createRequestProvenance(
      'job-cards',
      session,
      'api/v1/manager/jobs',
      'GET',
    );

    const err1 = dispatchAndFailHttp('GET', `${BASE}/api/v1/manager/jobs`, 401, {
      expectedToken: session.accessToken,
    });
    const err2 = dispatchAndFailHttp('GET', `${BASE}/api/v1/manager/jobs`, 401, {
      expectedToken: session.accessToken,
    });

    const events: string[] = [];
    let recursiveReturn: boolean | null = null;

    const unsub1 = coordinator.registerListener(revoked => {
      events.push(
        `L1:revoked=${coordinator.isSessionRevoked(revoked)}`,
      );
      recursiveReturn = coordinator.reportUnauthorized(provenance, err2);
    });
    const unsub2 = coordinator.registerListener(revoked => {
      events.push(
        `L2:revoked=${coordinator.isSessionRevoked(revoked)}`,
      );
    });

    expect(coordinator.reportUnauthorized(provenance, err1)).toBe(true);
    expect(events).toEqual(['L1:revoked=true', 'L2:revoked=true']);
    expect(recursiveReturn).toBe(false);
    expect(coordinator.revocationVersion()).toBe(1);

    // Repeated 401 on the same session is idempotent and does not re-notify.
    expect(coordinator.reportUnauthorized(provenance, err2)).toBe(false);
    expect(events).toEqual(['L1:revoked=true', 'L2:revoked=true']);
    expect(coordinator.revocationVersion()).toBe(1);

    unsub1();
    unsub2();
  });

  it('DAC-08 unregisters listeners cleanly and tracks revocation without HTTP, storage or logging', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      method => vi.spyOn(console, method).mockImplementation(() => undefined),
    );

    const session = makeSession();
    sessionService.setSession(session);
    const provenance = coordinator.createRequestProvenance(
      'job-cards',
      session,
      'api/v1/manager/jobs',
      'GET',
    );
    const err = dispatchAndFailHttp('GET', `${BASE}/api/v1/manager/jobs`, 401, {
      expectedToken: session.accessToken,
    });

    let firstCalls = 0;
    let secondCalls = 0;

    const unsub1 = coordinator.registerListener(() => {
      firstCalls++;
    });
    const unsub2 = coordinator.registerListener(() => {
      secondCalls++;
    });

    unsub1();
    expect(coordinator.reportUnauthorized(provenance, err)).toBe(true);
    expect(firstCalls).toBe(0);
    expect(secondCalls).toBe(1);

    unsub2();
    httpMock.expectNone(() => true);
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    for (const spy of consoleSpies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it('DAC-09 records session-scoped feature 403 synchronously with recursion protection without global session revocation', () => {
    const session = makeSession();
    sessionService.setSession(session);

    const jcProv = coordinator.createRequestProvenance(
      'job-cards',
      session,
      'api/v1/manager/jobs',
      'GET',
    );

    // Manual ApiError(403) is rejected.
    expect(coordinator.reportForbidden(jcProv, api403())).toBe(false);
    expect(coordinator.isFeatureForbidden(session, 'job-cards')).toBe(false);

    const err1 = dispatchAndFailHttp('GET', `${BASE}/api/v1/manager/jobs`, 403, {
      expectedToken: session.accessToken,
    });
    const err2 = dispatchAndFailHttp('GET', `${BASE}/api/v1/manager/jobs`, 403, {
      expectedToken: session.accessToken,
    });

    const received: Day06ForbiddenEvent[] = [];
    let recursiveResult: boolean | null = null;

    const unsub = coordinator.registerForbiddenListener(event => {
      received.push(event);
      expect(coordinator.isFeatureForbidden(session, 'job-cards')).toBe(true);
      recursiveResult = coordinator.reportForbidden(jcProv, err2);
    });

    expect(coordinator.reportForbidden(jcProv, err1)).toBe(true);
    expect(received).toEqual([
      { session, scope: 'job-cards', deniedJobId: null },
    ]);
    expect(recursiveResult).toBe(false);
    expect(coordinator.isFeatureForbidden(session, 'fixproof')).toBe(false);
    expect(coordinator.isSessionRevoked(session)).toBe(false);

    // Replacing session lifts feature-specific 403.
    const nextSession = makeSession('manager-002');
    sessionService.setSession(nextSession);
    expect(coordinator.isFeatureForbidden(nextSession, 'job-cards')).toBe(false);
    expect(coordinator.isCurrentFeatureForbidden('job-cards')).toBe(false);

    unsub();
  });

  it('DAC-10 records canonical shared-job resource 403 only for verified GET /api/v1/manager/jobs/{id} on exact session', () => {
    const session = makeSession();
    sessionService.setSession(session);

    const detailProv = coordinator.createRequestProvenance(
      'fixproof-read',
      session,
      `api/v1/manager/jobs/${JOB_1.toUpperCase()}`,
      'GET',
    );
    const err = dispatchAndFailHttp(
      'GET',
      `${BASE}/api/v1/manager/jobs/${JOB_1.toUpperCase()}`,
      403,
      { expectedToken: session.accessToken },
    );

    const events: Day06ForbiddenEvent[] = [];
    const unsub = coordinator.registerForbiddenListener(e => events.push(e));

    expect(coordinator.reportForbidden(detailProv, err)).toBe(true);
    expect(events).toEqual([
      { session, scope: 'fixproof', deniedJobId: JOB_1 },
    ]);
    expect(coordinator.isJobResourceDenied(session, JOB_1)).toBe(true);
    expect(coordinator.isJobResourceDenied(session, JOB_1.toUpperCase())).toBe(
      true,
    );
    expect(coordinator.isJobResourceDenied(session, JOB_2)).toBe(false);
    expect(coordinator.isFeatureForbidden(session, 'job-cards')).toBe(false);

    // A non-detail mutation 403 never adds a job resource denial.
    const mutProv = coordinator.createRequestProvenance(
      'fixproof-mutation',
      session,
      `api/v1/manager/approvals/proposals/${PROPOSAL_1}/forward`,
      'POST',
    );
    const mutErr = dispatchAndFailHttp(
      'POST',
      `${BASE}/api/v1/manager/approvals/proposals/${PROPOSAL_1}/forward`,
      403,
      { expectedToken: session.accessToken },
    );
    // Already fixproof-forbidden on this session, so idempotent false.
    expect(coordinator.reportForbidden(mutProv, mutErr)).toBe(false);

    // New valid session is unaffected by previous session's deniedJobId.
    const session2 = makeSession('manager-002');
    sessionService.setSession(session2);
    expect(coordinator.isJobResourceDenied(session2, JOB_1)).toBe(false);
    expect(coordinator.isCurrentJobResourceDenied(JOB_1)).toBe(false);

    unsub();
  });
});
