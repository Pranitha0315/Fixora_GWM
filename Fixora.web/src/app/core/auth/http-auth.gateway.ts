import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { defer, map } from 'rxjs';
import type { Observable } from 'rxjs';

import type { AuthGateway } from './auth-gateway';
import type { AuthSession } from '../models/auth-session.model';
import type { AuthRole } from '../models/auth-role.model';
import type { LoginCredentials } from '../models/login-credentials.model';

import { ApiUrlService } from '../config/api-url.service';
import { SKIP_AUTH } from '../interceptors/auth.interceptor';

interface ManagerLoginResponse {
  readonly accessToken: string;
  readonly accessTokenExpiresAt: string;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: string;
  readonly userId: string;
  readonly role: string;
  readonly name: string;
}

@Injectable({
  providedIn: 'root',
})
export class HttpAuthGateway implements AuthGateway {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(ApiUrlService);

  login(credentials: LoginCredentials): Observable<AuthSession> {
    return defer(() =>
      this.http.post<ManagerLoginResponse>(
        this.apiUrl.resolve('api/v1/manager/auth/login'),
        {
          email: credentials.email.trim(),
          password: credentials.password,
        },
        {
          context: new HttpContext().set(SKIP_AUTH, true),
        },
      ),
    ).pipe(
      map((response) => {
        if (
          !response ||
          typeof response.accessToken !== 'string' ||
          !response.accessToken.trim() ||
          typeof response.userId !== 'string' ||
          !response.userId.trim() ||
          typeof response.name !== 'string' ||
          !response.name.trim() ||
          typeof response.accessTokenExpiresAt !== 'string'
        ) {
          throw new Error('Invalid authentication response');
        }

        const expiresAt = Date.parse(
          response.accessTokenExpiresAt,
        );

        if (
          !Number.isFinite(expiresAt) ||
          expiresAt <= Date.now()
        ) {
          throw new Error('Invalid or expired access token');
        }

        const role = this.validateRole(response.role);

        return {
          accessToken: response.accessToken,
          expiresAt,
          user: {
            id: response.userId,
            displayName: response.name,
            email: credentials.email.trim(),
            roles: [role],
          },
        };
      }),
    );
  }

  private validateRole(role: unknown): AuthRole {
    if (role === 'Owner' || role === 'Manager') {
      return role;
    }

    throw new Error('Access to Manager Portal is not permitted');
  }
}
