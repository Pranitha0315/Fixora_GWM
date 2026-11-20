import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';

import type { AuthSession } from '../models/auth-session.model';
import type { AuthRole } from '../models/auth-role.model';

import { AUTH_GATEWAY } from './auth-gateway';
import type { AuthGateway } from './auth-gateway';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

describe('AuthService', () => {
  let service: AuthService;
  let sessionService: SessionService;

  const gateway = {
    login: vi.fn<AuthGateway['login']>(),
  };

  const credentials = {
    email: 'manager@example.test',
    password: 'test-password',
  };

  const createSession = (
    roles: readonly AuthRole[] = ['Manager'],
  ): AuthSession => ({
    accessToken: 'test-access-token',
    expiresAt: Date.now() + 60000,
    user: {
      id: 'test-user-001',
      displayName: 'Test User',
      email: 'manager@example.test',
      roles,
    },
  });

  beforeEach(() => {
    gateway.login.mockReset();

    TestBed.configureTestingModule({
      providers: [
        {
          provide: AUTH_GATEWAY,
          useValue: gateway,
        },
      ],
    });

    service = TestBed.inject(AuthService);
    sessionService = TestBed.inject(SessionService);
  });

  it('should create the authentication service', () => {
    expect(service).toBeTruthy();
  });

  it('should start without authentication', () => {
    expect(service.isAuthenticated()).toBe(false);
    expect(service.getCurrentUser()).toBeNull();
  });

  it('should authenticate a manager', async () => {
    gateway.login.mockReturnValue(of(createSession()));

    const user = await firstValueFrom(
      service.login(credentials),
    );

    expect(user.roles).toContain('Manager');
    expect(service.isAuthenticated()).toBe(true);
  });

  it('should authenticate an owner', async () => {
    gateway.login.mockReturnValue(
      of(createSession(['Owner'])),
    );

    await firstValueFrom(service.login(credentials));

    expect(service.hasRole('Owner')).toBe(true);
  });

  it('should reject an unauthorized role', async () => {
    gateway.login.mockReturnValue(
      of(createSession(['PlatformAdmin'])),
    );

    await expect(
      firstValueFrom(service.login(credentials)),
    ).rejects.toThrow('Access to Manager Portal is not permitted');

    expect(service.isAuthenticated()).toBe(false);
  });

  it('should reject missing credentials', async () => {
    await expect(
      firstValueFrom(
        service.login({ email: '', password: '' }),
      ),
    ).rejects.toThrow('Email and password are required');

    expect(gateway.login).not.toHaveBeenCalled();
  });

  it('should handle authentication failure', async () => {
    gateway.login.mockReturnValue(
      throwError(() => new Error('Invalid credentials')),
    );

    await expect(
      firstValueFrom(service.login(credentials)),
    ).rejects.toThrow('Invalid credentials');

    expect(service.isAuthenticated()).toBe(false);
  });

  it('should store the authenticated session', async () => {
    gateway.login.mockReturnValue(of(createSession()));

    await firstValueFrom(service.login(credentials));

    expect(sessionService.getAccessToken())
      .toBe('test-access-token');
  });

  it('should reject an expired session', async () => {
    gateway.login.mockReturnValue(
      of({
        ...createSession(),
        expiresAt: Date.now() - 1000,
      }),
    );

    await expect(
      firstValueFrom(service.login(credentials)),
    ).rejects.toThrow('Invalid or expired authentication session');

    expect(service.isAuthenticated()).toBe(false);
  });

  it('should provide the current authenticated user', async () => {
    gateway.login.mockReturnValue(of(createSession()));

    await firstValueFrom(service.login(credentials));

    expect(service.getCurrentUser()?.id)
      .toBe('test-user-001');
  });

  it('should clear authentication during logout', async () => {
    gateway.login.mockReturnValue(of(createSession()));

    await firstValueFrom(service.login(credentials));

    service.logout();

    expect(service.isAuthenticated()).toBe(false);
    expect(service.getCurrentUser()).toBeNull();
  });

  it('should reject a delayed login response after logout', async () => {
    const response = new Subject<AuthSession>();

    gateway.login.mockReturnValue(response);

    const result = firstValueFrom(service.login(credentials));

    service.logout();

    response.next(createSession());

    await expect(result).rejects.toThrow(
      'Authentication request was superseded',
    );

    expect(service.isAuthenticated()).toBe(false);
  });
});
