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

import { SessionService } from '../auth/session.service';
import { API_CONFIG } from '../config/api.config';
import type { ApiConfig } from '../config/api.config';
import type { AuthSession } from '../models/auth-session.model';

import {
  authInterceptor,
  SKIP_AUTH,
} from './auth.interceptor';

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
});
