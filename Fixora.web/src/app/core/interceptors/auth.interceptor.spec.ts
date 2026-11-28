import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  HttpContext,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';

import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { Day06AuthorizationCoordinatorService } from '../../features/job-cards/services/day06-authorization-coordinator.service';
import { HttpRequestProvenanceService } from '../auth/http-request-provenance.service';
import { SessionService } from '../auth/session.service';
import { API_CONFIG } from '../config/api.config';
import type { ApiConfig } from '../config/api.config';
import { ApiError } from '../models/api-error.model';
import type { AuthSession } from '../models/auth-session.model';

import {
  authInterceptor,
  SKIP_AUTH,
} from './auth.interceptor';
import { errorInterceptor } from './error.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let session: SessionService;
  let config: { baseUrl: ApiConfig['baseUrl'] };

  const apiUrl = 'https://api.example.test/api';

  const createSession = (): AuthSession => ({
    accessToken: 'test-access-token',
    expiresAt: Date.now() + 60000,
    user: {
      id: 'test-manager-001',
      displayName: 'Test Manager',
      email: 'manager@example.test',
      roles: ['Manager'],
    },
  });

  beforeEach(() => {
    config = { baseUrl: apiUrl };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([authInterceptor]),
        ),
        provideHttpClientTesting(),
        {
          provide: API_CONFIG,
          useValue: config,
        },
      ],
    });

    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);
  });

  afterEach(() => {
    controller.verify();
  });

  it('should attach a valid access token', () => {
    session.setSession(createSession());

    http.get(`${apiUrl}/bookings`).subscribe();

    const request = controller.expectOne(
      `${apiUrl}/bookings`,
    );

    expect(
      request.request.headers.get('Authorization'),
    ).toBe('Bearer test-access-token');

    request.flush({});
  });

  it('should not attach a token without a session', () => {
    http.get(`${apiUrl}/bookings`).subscribe();

    const request = controller.expectOne(
      `${apiUrl}/bookings`,
    );

    expect(
      request.request.headers.has('Authorization'),
    ).toBe(false);

    request.flush({});
  });

  it('should not attach a token to external domains', () => {
    session.setSession(createSession());

    const url = 'https://external.example.test/data';

    http.get(url).subscribe();

    const request = controller.expectOne(url);

    expect(
      request.request.headers.has('Authorization'),
    ).toBe(false);

    request.flush({});
  });

  it('should reject misleading API domain names', () => {
    session.setSession(createSession());

    const url =
      'https://api.example.test.external.test/api/bookings';

    http.get(url).subscribe();

    const request = controller.expectOne(url);

    expect(
      request.request.headers.has('Authorization'),
    ).toBe(false);

    request.flush({});
  });

  it('should not attach a token outside the API path', () => {
    session.setSession(createSession());

    const url = 'https://api.example.test/public';

    http.get(url).subscribe();

    const request = controller.expectOne(url);

    expect(
      request.request.headers.has('Authorization'),
    ).toBe(false);

    request.flush({});
  });

  it('should reject misleading API path prefixes', () => {
    session.setSession(createSession());

    const url = 'https://api.example.test/api-other/data';

    http.get(url).subscribe();

    const request = controller.expectOne(url);

    expect(
      request.request.headers.has('Authorization'),
    ).toBe(false);

    request.flush({});
  });

  it('should not attach a token to insecure HTTP requests', () => {
    session.setSession(createSession());

    const url = 'http://api.example.test/api/bookings';

    http.get(url).subscribe();

    const request = controller.expectOne(url);

    expect(
      request.request.headers.has('Authorization'),
    ).toBe(false);

    request.flush({});
  });

  it('should support skipping authentication', () => {
    session.setSession(createSession());

    const url = `${apiUrl}/auth/login`;

    http.post(url, {}, {
      context: new HttpContext().set(SKIP_AUTH, true),
    }).subscribe();

    const request = controller.expectOne(url);

    expect(
      request.request.headers.has('Authorization'),
    ).toBe(false);

    request.flush({});
  });

  it('should preserve an existing authorization header', () => {
    session.setSession(createSession());

    const url = `${apiUrl}/bookings`;

    http.get(url, {
      headers: {
        Authorization: 'Bearer explicit-token',
      },
    }).subscribe();

    const request = controller.expectOne(url);

    expect(
      request.request.headers.get('Authorization'),
    ).toBe('Bearer explicit-token');

    request.flush({});
  });

  it('should not attach a token when API URL is missing', () => {
    config.baseUrl = null;

    session.setSession(createSession());

    const url = `${apiUrl}/bookings`;

    http.get(url).subscribe();

    const request = controller.expectOne(url);

    expect(
      request.request.headers.has('Authorization'),
    ).toBe(false);

    request.flush({});
  });

  it('should not attach a token after logout', () => {
    session.setSession(createSession());
    session.clearSession();

    const url = `${apiUrl}/bookings`;

    http.get(url).subscribe();

    const request = controller.expectOne(url);

    expect(
      request.request.headers.has('Authorization'),
    ).toBe(false);

    request.flush({});
  });

  it('should reject encoded API path traversal', () => {
    session.setSession(createSession());

    const url = `${apiUrl}/%252e%252e/private`;

    http.get(url).subscribe();

    const request = controller.expectOne(url);

    expect(
      request.request.headers.has('Authorization'),
    ).toBe(false);

    request.flush({});
  });

  it('should record runtime HTTP provenance only when authInterceptor attaches a valid Bearer token', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([errorInterceptor, authInterceptor]),
        ),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: config },
      ],
    });

    const wiredHttp = TestBed.inject(HttpClient);
    const wiredController = TestBed.inject(HttpTestingController);
    const wiredSession = TestBed.inject(SessionService);
    const provenance = TestBed.inject(HttpRequestProvenanceService);

    const active = createSession();
    wiredSession.setSession(active);

    let capturedError: unknown;
    wiredHttp.get(`${apiUrl}/bookings`).subscribe({
      error: err => {
        capturedError = err;
      },
    });

    const authedReq = wiredController.expectOne(`${apiUrl}/bookings`);
    expect(authedReq.request.headers.get('Authorization')).toBe(
      'Bearer test-access-token',
    );
    authedReq.flush(null, { status: 401, statusText: 'Unauthorized' });

    const meta = provenance.consumeErrorProvenance(capturedError);
    expect(meta).toEqual({
      session: active,
      resolvedUrl: `${apiUrl}/bookings`,
      method: 'GET',
      skipAuth: false,
      authHeaderAttached: true,
    });
    expect(Object.keys(meta as object).sort()).toEqual([
      'authHeaderAttached',
      'method',
      'resolvedUrl',
      'session',
      'skipAuth',
    ]);
    expect(JSON.stringify({ ...meta, session: undefined })).not.toContain(
      'test-access-token',
    );
    expect(JSON.stringify(meta)).not.toContain('Bearer');

    // SKIP_AUTH error never records authenticated provenance.
    let skipError: unknown;
    wiredHttp
      .post(`${apiUrl}/auth/login`, {}, {
        context: new HttpContext().set(SKIP_AUTH, true),
      })
      .subscribe({
        error: err => {
          skipError = err;
        },
      });

    const skipReq = wiredController.expectOne(`${apiUrl}/auth/login`);
    expect(skipReq.request.headers.has('Authorization')).toBe(false);
    skipReq.flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(provenance.consumeErrorProvenance(skipError)).toBeNull();

    // Anonymous / external URL never records authenticated provenance.
    let externalError: unknown;
    wiredHttp.get('https://external.example.test/data').subscribe({
      error: err => {
        externalError = err;
      },
    });

    const extReq = wiredController.expectOne('https://external.example.test/data');
    expect(extReq.request.headers.has('Authorization')).toBe(false);
    extReq.flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(provenance.consumeErrorProvenance(externalError)).toBeNull();

    wiredController.verify();
  });
});

describe('authInterceptor signed media bearer protection', () => {
  const ORIGIN = 'https://api.example.test';
  const MEDIA_PATH =
    '/api/v1/media/0123456789abcdef0123456789abcdef.jpg';
  const MEDIA_QUERY = `?exp=1800000000&sig=${'a1'.repeat(32)}`;
  const MEDIA_URL = `${ORIGIN}${MEDIA_PATH}${MEDIA_QUERY}`;

  let http: HttpClient;
  let controller: HttpTestingController;
  let session: SessionService;
  let provenance: HttpRequestProvenanceService;
  let config: { baseUrl: ApiConfig['baseUrl'] };
  let active: AuthSession;

  function configure(baseUrl: string): void {
    config = { baseUrl };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([errorInterceptor, authInterceptor]),
        ),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: config },
      ],
    });

    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);
    provenance = TestBed.inject(HttpRequestProvenanceService);
    active = {
      accessToken: 'test-access-token',
      expiresAt: Date.now() + 60000,
      user: {
        id: 'test-manager-001',
        displayName: 'Test Manager',
        email: 'manager@example.test',
        roles: ['Manager'],
      },
    };
    session.setSession(active);
  }

  function authorizationFor(
    url: string,
    options: Parameters<HttpClient['get']>[1] = {},
  ): string | null {
    http.get(url, options).subscribe({ error: () => undefined });

    const request = controller.expectOne(url);
    const header = request.request.headers.get('Authorization');

    expect(request.request.urlWithParams).toBe(url);
    request.flush({});

    return header;
  }

  afterEach(() => {
    controller.verify();
  });

  describe.each([
    ['root origin', ORIGIN],
    ['/api base path', `${ORIGIN}/api`],
  ])('with a %s configuration', (_label, baseUrl) => {
    beforeEach(() => configure(baseUrl));

    it('FE02-01 sends trusted signed media requests without an automatic Bearer token and preserves the signed query', () => {
      expect(authorizationFor(MEDIA_URL)).toBeNull();
    });

    it.each([
      `${ORIGIN}/API/V1/MEDIA/0123456789abcdef0123456789abcdef.jpg${MEDIA_QUERY}`,
      `${ORIGIN}/api/v1/%6Dedia/0123456789abcdef0123456789abcdef.jpg${MEDIA_QUERY}`,
      `${ORIGIN}//api/v1/media/0123456789abcdef0123456789abcdef.jpg${MEDIA_QUERY}`,
      `${ORIGIN}/api/v1/media`,
    ])('FE02-02 treats the backend-routable media variant %s as anonymous', url => {
      expect(authorizationFor(url)).toBeNull();
    });

    it.each([
      `${ORIGIN}/api/v1/manager/jobs`,
      `${ORIGIN}/api/v1/manager/jobs/00000000-0000-4000-8000-000000000001`,
      `${ORIGIN}/api/v1/manager/approvals/proposals`,
      `${ORIGIN}/api/v1/manager/approvals/change-requests`,
    ])('FE02-03 keeps Bearer authentication for manager endpoint %s', url => {
      expect(authorizationFor(url)).toBe('Bearer test-access-token');
    });

    it.each([
      `${ORIGIN}/api/v1/manager/jobs?next=/api/v1/media/x.jpg`,
      `${ORIGIN}/api/v1/manager/jobs?ref=${encodeURIComponent(MEDIA_PATH)}`,
      `${ORIGIN}/api/v1/media-library/items`,
      `${ORIGIN}/api/v1/mediax/1`,
      `${ORIGIN}/api/v1/manager/media/1`,
      `${ORIGIN}/api/v2/media/1`,
    ])('FE02-04 does not disable authentication for non-media endpoint %s', url => {
      expect(authorizationFor(url)).toBe('Bearer test-access-token');
    });

    it('FE02-05 keeps SKIP_AUTH and explicit Authorization behavior unchanged', () => {
      expect(
        authorizationFor(MEDIA_URL, {
          context: new HttpContext().set(SKIP_AUTH, true),
        }),
      ).toBeNull();
      expect(
        authorizationFor(`${ORIGIN}/api/v1/manager/jobs`, {
          context: new HttpContext().set(SKIP_AUTH, true),
        }),
      ).toBeNull();
      expect(
        authorizationFor(`${ORIGIN}/api/v1/manager/jobs`, {
          headers: { Authorization: 'Bearer explicit-token' },
        }),
      ).toBe('Bearer explicit-token');
      expect(
        authorizationFor(MEDIA_URL, {
          headers: { Authorization: 'Bearer explicit-token' },
        }),
      ).toBe('Bearer explicit-token');
    });

    it('FE02-06 keeps foreign-origin, insecure and relative media requests anonymous', () => {
      expect(
        authorizationFor(`https://evil.example.test${MEDIA_PATH}${MEDIA_QUERY}`),
      ).toBeNull();
      expect(
        authorizationFor(`http://api.example.test${MEDIA_PATH}${MEDIA_QUERY}`),
      ).toBeNull();
      expect(authorizationFor(`${MEDIA_PATH}${MEDIA_QUERY}`)).toBeNull();
    });

    it('FE02-07 media errors never carry authenticated provenance, so they cannot drive Day06 revocation', () => {
      const coordinator = TestBed.inject(Day06AuthorizationCoordinatorService);

      for (const status of [401, 403]) {
        let mediaError: unknown;
        http.get(MEDIA_URL).subscribe({
          error: err => {
            mediaError = err;
          },
        });

        const request = controller.expectOne(MEDIA_URL);
        expect(request.request.headers.has('Authorization')).toBe(false);
        request.flush(null, { status, statusText: 'Denied' });

        expect(mediaError).toBeInstanceOf(ApiError);
        expect(provenance.consumeErrorProvenance(mediaError)).toBeNull();

        const jobsProvenance = coordinator.createRequestProvenance(
          'job-cards',
          active,
          'api/v1/manager/jobs',
          'GET',
        );
        const reported =
          status === 401
            ? coordinator.reportUnauthorized(jobsProvenance, mediaError)
            : coordinator.reportForbidden(jobsProvenance, mediaError);

        expect(reported).toBe(false);
      }

      expect(coordinator.isSessionRevoked(active)).toBe(false);
      expect(coordinator.isFeatureForbidden(active, 'job-cards')).toBe(false);

      // A legitimate authenticated manager request still records provenance.
      let jobsError: unknown;
      http.get(`${ORIGIN}/api/v1/manager/jobs`).subscribe({
        error: err => {
          jobsError = err;
        },
      });
      const jobs = controller.expectOne(`${ORIGIN}/api/v1/manager/jobs`);
      expect(jobs.request.headers.get('Authorization')).toBe(
        'Bearer test-access-token',
      );
      jobs.flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(provenance.consumeErrorProvenance(jobsError)).toEqual({
        session: active,
        resolvedUrl: `${ORIGIN}/api/v1/manager/jobs`,
        method: 'GET',
        skipAuth: false,
        authHeaderAttached: true,
      });
    });
  });
});
