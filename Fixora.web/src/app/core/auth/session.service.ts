import { computed, Injectable, signal } from '@angular/core';

import type { AuthRole } from '../models/auth-role.model';
import type { AuthSession } from '../models/auth-session.model';
import type { AuthUser } from '../models/auth-user.model';

@Injectable({
  providedIn: 'root',
})
export class SessionService {
  private readonly sessionState = signal<AuthSession | null>(null);

  readonly session = this.sessionState.asReadonly();

  readonly user = computed(() => this.sessionState()?.user ?? null);

  setSession(session: AuthSession): void {
    if (
      !session.accessToken.trim() ||
      !Number.isFinite(session.expiresAt) ||
      session.expiresAt <= Date.now()
    ) {
      this.clearSession();
      throw new Error('Invalid or expired authentication session');
    }

    this.sessionState.set(session);
  }

  isAuthenticated(): boolean {
    const session = this.sessionState();

    return (
      session !== null &&
      session.accessToken.trim().length > 0 &&
      session.expiresAt > Date.now()
    );
  }

  getAccessToken(): string | null {
    if (!this.isAuthenticated()) {
      return null;
    }

    return this.sessionState()?.accessToken ?? null;
  }

  getUser(): AuthUser | null {
    if (!this.isAuthenticated()) {
      return null;
    }

    return this.sessionState()?.user ?? null;
  }

  hasRole(role: AuthRole): boolean {
    return this.getUser()?.roles.includes(role) ?? false;
  }

  hasAnyRole(roles: readonly AuthRole[]): boolean {
    return roles.some((role) => this.hasRole(role));
  }

  clearSession(): void {
    this.sessionState.set(null);
  }
}
