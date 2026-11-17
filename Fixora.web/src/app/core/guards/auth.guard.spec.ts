import { TestBed } from '@angular/core/testing';
import {
  provideRouter,
  Router,
  UrlTree,
} from '@angular/router';

import type {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
} from '@angular/router';

import { vi } from 'vitest';

import { SessionService } from '../auth/session.service';
import type { AuthSession } from '../models/auth-session.model';

import {
  authGuard,
  authChildGuard,
} from './auth.guard';

describe('Authentication Guards', () => {
  let session: SessionService;
  let router: Router;

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

  const route = {} as ActivatedRouteSnapshot;

  const state = (
    url: string,
  ): RouterStateSnapshot =>
    ({ url }) as RouterStateSnapshot;

  const runGuard = (url: string) =>
    TestBed.runInInjectionContext(() =>
      authGuard(route, state(url)),
    );

  const runChildGuard = (url: string) =>
    TestBed.runInInjectionContext(() =>
      authChildGuard(route, state(url)),
    );

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });

    session = TestBed.inject(SessionService);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should allow an authenticated user', () => {
    session.setSession(createSession());

    expect(runGuard('/dashboard')).toBe(true);
  });

  it('should block an unauthenticated user', () => {
    const result = runGuard('/dashboard');

    expect(result).toBeInstanceOf(UrlTree);
  });

  it('should redirect unauthenticated users to login', () => {
    const result = runGuard('/dashboard') as UrlTree;

    expect(router.serializeUrl(result)).toBe(
      '/login?returnUrl=%2Fdashboard',
    );
  });

  it('should preserve the requested route', () => {
    const result = runGuard('/bookings') as UrlTree;

    expect(result.queryParams['returnUrl'])
      .toBe('/bookings');
  });

  it('should preserve route query parameters', () => {
    const url = '/bookings?status=pending';

    const result = runGuard(url) as UrlTree;

    expect(result.queryParams['returnUrl']).toBe(url);
  });

  it('should block an expired session', () => {
    const validSession = createSession();

    session.setSession(validSession);

    vi.spyOn(Date, 'now')
      .mockReturnValue(validSession.expiresAt + 1000);

    const result = runGuard('/vehicles');

    expect(result).toBeInstanceOf(UrlTree);
    expect(session.session()).toBeNull();
  });

  it('should block access after logout', () => {
    session.setSession(createSession());

    session.clearSession();

    expect(runGuard('/reports'))
      .toBeInstanceOf(UrlTree);
  });

  it('should allow authenticated child navigation', () => {
    session.setSession(createSession());

    expect(runChildGuard('/inventory')).toBe(true);
  });

  it('should block unauthenticated child navigation', () => {
    const result = runChildGuard('/billing') as UrlTree;

    expect(result).toBeInstanceOf(UrlTree);
    expect(result.queryParams['returnUrl'])
      .toBe('/billing');
  });

  it('should block expired sessions on child navigation', () => {
    const validSession = createSession();

    session.setSession(validSession);

    vi.spyOn(Date, 'now')
      .mockReturnValue(validSession.expiresAt + 1000);

    expect(runChildGuard('/notifications'))
      .toBeInstanceOf(UrlTree);

    expect(session.session()).toBeNull();
  });
});
