import { TestBed } from '@angular/core/testing';

import type { AuthSession } from '../models/auth-session.model';
import { SessionService } from './session.service';

describe('SessionService', () => {
  let service: SessionService;

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
    TestBed.configureTestingModule({});
    service = TestBed.inject(SessionService);
  });

  it('should create the service', () => {
    expect(service).toBeTruthy();
  });

  it('should start without authentication', () => {
    expect(service.isAuthenticated()).toBe(false);
    expect(service.getAccessToken()).toBeNull();
    expect(service.getUser()).toBeNull();
  });

  it('should accept a valid session', () => {
    service.setSession(createSession());

    expect(service.isAuthenticated()).toBe(true);
  });

  it('should return the access token', () => {
    service.setSession(createSession());

    expect(service.getAccessToken()).toBe('test-access-token');
  });

  it('should return the authenticated user', () => {
    service.setSession(createSession());

    expect(service.getUser()?.displayName).toBe('Test Manager');
  });

  it('should identify an assigned role', () => {
    service.setSession(createSession());

    expect(service.hasRole('Manager')).toBe(true);
    expect(service.hasRole('Owner')).toBe(false);
  });

  it('should support multiple allowed roles', () => {
    service.setSession(createSession());

    expect(service.hasAnyRole(['Owner', 'Manager'])).toBe(true);
    expect(service.hasAnyRole(['PlatformAdmin'])).toBe(false);
  });

  it('should reject an expired session', () => {
    const expiredSession: AuthSession = {
      ...createSession(),
      expiresAt: Date.now() - 1000,
    };

    expect(() => service.setSession(expiredSession)).toThrow();
    expect(service.isAuthenticated()).toBe(false);
  });

  it('should reject an empty access token', () => {
    const invalidSession: AuthSession = {
      ...createSession(),
      accessToken: '',
    };

    expect(() => service.setSession(invalidSession)).toThrow();
    expect(service.isAuthenticated()).toBe(false);
  });

  it('should clear authentication during logout', () => {
    service.setSession(createSession());
    service.clearSession();

    expect(service.isAuthenticated()).toBe(false);
    expect(service.getAccessToken()).toBeNull();
    expect(service.getUser()).toBeNull();
  });
});
