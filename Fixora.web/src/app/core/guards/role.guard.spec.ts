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
import type { AuthRole } from '../models/auth-role.model';
import type { AuthSession } from '../models/auth-session.model';

import {
  createRoleGuard,
  createRoleChildGuard,
  managerRoleGuard,
  managerRoleChildGuard,
} from './role.guard';

describe('Role Guards', () => {
  let session: SessionService;
  let router: Router;

  const createSession = (
    roles: readonly AuthRole[],
  ): AuthSession => ({
    accessToken: 'test-access-token',
    expiresAt: Date.now() + 60000,
    user: {
      id: 'test-user-001',
      displayName: 'Test User',
      email: 'user@example.test',
      roles,
    },
  });

  const route = {} as ActivatedRouteSnapshot;

  const state = (url: string): RouterStateSnapshot =>
    ({ url }) as RouterStateSnapshot;

  const runManagerGuard = (url = '/dashboard') =>
    TestBed.runInInjectionContext(() =>
      managerRoleGuard(route, state(url)),
    );

  const runManagerChildGuard = (url = '/bookings') =>
    TestBed.runInInjectionContext(() =>
      managerRoleChildGuard(route, state(url)),
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

  it('should allow an owner', () => {
    session.setSession(createSession(['Owner']));

    expect(runManagerGuard()).toBe(true);
  });

  it('should allow a manager', () => {
    session.setSession(createSession(['Manager']));

    expect(runManagerGuard()).toBe(true);
  });

  it('should allow a user with multiple permitted roles', () => {
    session.setSession(
      createSession(['Owner', 'Manager']),
    );

    expect(runManagerGuard()).toBe(true);
  });

  it('should reject platform admin-only access', () => {
    session.setSession(
      createSession(['PlatformAdmin']),
    );

    expect(runManagerGuard()).toBeInstanceOf(UrlTree);
  });

  it('should redirect unauthorized roles', () => {
    session.setSession(
      createSession(['PlatformAdmin']),
    );

    const result = runManagerGuard() as UrlTree;

    expect(router.serializeUrl(result)).toBe(
      '/login?reason=access-denied',
    );
  });

  it('should reject users without roles', () => {
    session.setSession(createSession([]));

    expect(runManagerGuard()).toBeInstanceOf(UrlTree);
  });

  it('should reject unauthenticated users', () => {
    const result = runManagerGuard() as UrlTree;

    expect(router.serializeUrl(result)).toBe(
      '/login?returnUrl=%2Fdashboard',
    );
  });

  it('should reject expired sessions', () => {
    const validSession = createSession(['Owner']);

    session.setSession(validSession);

    vi.spyOn(Date, 'now')
      .mockReturnValue(validSession.expiresAt + 1000);

    expect(runManagerGuard()).toBeInstanceOf(UrlTree);
    expect(session.session()).toBeNull();
  });

  it('should allow owner-only protected routes', () => {
    session.setSession(createSession(['Owner']));

    const ownerGuard = createRoleGuard(['Owner']);

    const result = TestBed.runInInjectionContext(() =>
      ownerGuard(route, state('/settings')),
    );

    expect(result).toBe(true);
  });

  it('should reject managers from owner-only routes', () => {
    session.setSession(createSession(['Manager']));

    const ownerGuard = createRoleGuard(['Owner']);

    const result = TestBed.runInInjectionContext(() =>
      ownerGuard(route, state('/settings')),
    );

    expect(result).toBeInstanceOf(UrlTree);
  });

  it('should deny access when allowed roles are empty', () => {
    session.setSession(createSession(['Owner']));

    const restrictedGuard = createRoleGuard([]);

    const result = TestBed.runInInjectionContext(() =>
      restrictedGuard(route, state('/restricted')),
    );

    expect(result).toBeInstanceOf(UrlTree);
  });

  it('should allow authorized child navigation', () => {
    session.setSession(createSession(['Manager']));

    expect(runManagerChildGuard()).toBe(true);
  });

  it('should reject unauthorized child navigation', () => {
    session.setSession(
      createSession(['PlatformAdmin']),
    );

    expect(runManagerChildGuard())
      .toBeInstanceOf(UrlTree);
  });

  it('should support custom child role restrictions', () => {
    session.setSession(createSession(['Manager']));

    const ownerChildGuard = createRoleChildGuard([
      'Owner',
    ]);

    const result = TestBed.runInInjectionContext(() =>
      ownerChildGuard(route, state('/settings')),
    );

    expect(result).toBeInstanceOf(UrlTree);
  });
});
