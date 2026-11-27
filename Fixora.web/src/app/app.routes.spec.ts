import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';

import {
  provideRouter,
  Router,
  RouterOutlet,
} from '@angular/router';

import { RouterTestingHarness } from '@angular/router/testing';

import type { Routes } from '@angular/router';

import { routes } from './app.routes';

import { SessionService } from './core/auth/session.service';

import type { AuthRole } from './core/models/auth-role.model';
import type { AuthSession } from './core/models/auth-session.model';

import {
  authGuard,
  authChildGuard,
} from './core/guards/auth.guard';

import {
  managerRoleGuard,
  managerRoleChildGuard,
} from './core/guards/role.guard';

@Component({
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>',
})
class TestShell {}

@Component({
  standalone: true,
  template: '<p>Test workspace page</p>',
})
class TestPage {}

describe('Application Route Security', () => {
  let session: SessionService;
  let router: Router;

  const shell = routes.find(
    (route) => route.path === '' && route.children,
  )!;

  const login = routes.find(
    (route) => route.path === 'login',
  )!;

  const menuPaths = [
    'dashboard',
    'bookings',
    'vehicles',
    'job-cards',
    'adaptive-queue',
    'mechanics',
    'spare-parts',
    'inventory',
    'billing',
    'reports',
    'notifications',
  ];

  const testRoutes: Routes = [
    {
      path: login.path,
      canActivate: login.canActivate,
      component: TestPage,
    },
    {
      path: shell.path,
      canActivate: shell.canActivate,
      canActivateChild: shell.canActivateChild,
      component: TestShell,
      children: (shell.children ?? []).map(
        (child) =>
          child.redirectTo !== undefined
            ? {
                path: child.path,
                pathMatch: child.pathMatch,
                redirectTo: child.redirectTo,
              }
            : {
                path: child.path,
                canActivate: child.canActivate,
                component: TestPage,
              },
      ),
    },
    {
      path: '**',
      redirectTo: 'dashboard',
    },
  ];

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

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(testRoutes)],
    });

    session = TestBed.inject(SessionService);
    router = TestBed.inject(Router);
  });

  it('should configure both parent guards', () => {
    expect(shell.canActivate).toEqual([
      authGuard,
      managerRoleGuard,
    ]);
  });

  it('should configure both child guards', () => {
    expect(shell.canActivateChild).toEqual([
      authChildGuard,
      managerRoleChildGuard,
    ]);
  });

  it('should configure all eleven workspace routes', () => {
    const configuredPaths = shell.children
      ?.filter((route) => route.path !== '')
      .map((route) => route.path);

    expect(configuredPaths).toEqual(
      expect.arrayContaining(menuPaths),
    );

    expect(configuredPaths).toHaveLength(11);
  });

  it('should keep the adaptive queue route separate from job cards', () => {
    const paths = shell.children?.map((route) => route.path);
    const adaptiveQueue = shell.children?.find(
      (route) => route.path === 'adaptive-queue',
    );

    expect(paths).toContain('job-cards');
    expect(adaptiveQueue).toBeDefined();
    expect(adaptiveQueue?.loadChildren).toBeTypeOf('function');
    expect(adaptiveQueue?.redirectTo).toBeUndefined();
    expect(paths?.indexOf('adaptive-queue')).toBe(
      (paths?.indexOf('job-cards') ?? -2) + 1,
    );
  });

  it('should lazy-load the adaptive queue routes behind the shell guards', async () => {
    const adaptiveQueue = shell.children?.find(
      (route) => route.path === 'adaptive-queue',
    );

    const loaded = await (
      adaptiveQueue?.loadChildren as () => Promise<Routes>
    )();

    expect(loaded).toHaveLength(1);
    expect(loaded[0].path).toBe('');
    expect(loaded[0].title).toBe('FIXORA | Adaptive Queue');
    expect(shell.canActivate).toEqual([
      authGuard,
      managerRoleGuard,
    ]);
  });

  it('should allow a manager to open the adaptive queue route', async () => {
    session.setSession(createSession(['Manager']));

    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/adaptive-queue');

    expect(router.url).toBe('/adaptive-queue');
  });

  it('should reject unauthorized roles from the adaptive queue route', async () => {
    session.setSession(createSession(['PlatformAdmin']));

    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/adaptive-queue');

    expect(router.url).toBe('/login?reason=access-denied');
  });

  it('should allow public login access', async () => {
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/login');

    expect(router.url).toBe('/login');
  });

  for (const path of menuPaths) {
    it(`should block unauthenticated access to ${path}`, async () => {
      const harness = await RouterTestingHarness.create();

      await harness.navigateByUrl(`/${path}`);

      expect(router.url).toBe(
        `/login?returnUrl=%2F${path}`,
      );
    });
  }

  it('should allow owner dashboard access', async () => {
    session.setSession(createSession(['Owner']));

    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/dashboard');

    expect(router.url).toBe('/dashboard');
  });

  it('should allow manager dashboard access', async () => {
    session.setSession(createSession(['Manager']));

    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/dashboard');

    expect(router.url).toBe('/dashboard');
  });

  it('should reject unauthorized roles', async () => {
    session.setSession(
      createSession(['PlatformAdmin']),
    );

    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/dashboard');

    expect(router.url).toBe(
      '/login?reason=access-denied',
    );
  });

  it('should allow authenticated child navigation', async () => {
    session.setSession(createSession(['Manager']));

    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/dashboard');
    await harness.navigateByUrl('/bookings');

    expect(router.url).toBe('/bookings');
  });

  it('should block child navigation after logout', async () => {
    session.setSession(createSession(['Manager']));

    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/dashboard');

    session.clearSession();

    await harness.navigateByUrl('/vehicles');

    expect(router.url).toBe(
      '/login?returnUrl=%2Fvehicles',
    );
  });

  it('should redirect the default route to protected dashboard', async () => {
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/');

    expect(router.url).toBe(
      '/login?returnUrl=%2Fdashboard',
    );
  });
});
