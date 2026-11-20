import { inject, Injectable } from '@angular/core';
import { catchError, defer, map, throwError } from 'rxjs';
import type { Observable } from 'rxjs';

import { MANAGER_PORTAL_ROLES } from '../models/auth-role.model';
import type { AuthRole } from '../models/auth-role.model';
import type { AuthUser } from '../models/auth-user.model';
import type { LoginCredentials } from '../models/login-credentials.model';

import { AUTH_GATEWAY } from './auth-gateway';
import { SessionService } from './session.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly gateway = inject(AUTH_GATEWAY);
  private readonly sessionService = inject(SessionService);
  private operationId = 0;

  login(credentials: LoginCredentials): Observable<AuthUser> {
    return defer(() => {
      const currentOperation = ++this.operationId;

      this.sessionService.clearSession();

      const email = credentials.email.trim();
      const password = credentials.password;

      if (!email || !password.trim()) {
        return throwError(
          () => new Error('Email and password are required'),
        );
      }

      return defer(() => this.gateway.login({ email, password })).pipe(
        map((session) => {
          if (currentOperation !== this.operationId) {
            throw new Error('Authentication request was superseded');
          }

          const allowed = session.user.roles.some((role) =>
            MANAGER_PORTAL_ROLES.includes(role),
          );

          if (!allowed) {
            throw new Error('Access to Manager Portal is not permitted');
          }

          this.sessionService.setSession(session);

          return session.user;
        }),
        catchError((error: unknown) => {
          if (currentOperation === this.operationId) {
            this.sessionService.clearSession();
          }

          return throwError(() => error);
        }),
      );
    });
  }

  logout(): void {
    this.operationId++;
    this.sessionService.clearSession();
  }

  isAuthenticated(): boolean {
    return this.sessionService.isAuthenticated();
  }

  getCurrentUser(): AuthUser | null {
    return this.sessionService.getUser();
  }

  hasRole(role: AuthRole): boolean {
    return this.sessionService.hasRole(role);
  }
}
