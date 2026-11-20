import { InjectionToken } from '@angular/core';
import type { Observable } from 'rxjs';

import type { AuthSession } from '../models/auth-session.model';
import type { LoginCredentials } from '../models/login-credentials.model';

export interface AuthGateway {
  login(credentials: LoginCredentials): Observable<AuthSession>;
}

export const AUTH_GATEWAY = new InjectionToken<AuthGateway>(
  'FIXORA_AUTH_GATEWAY',
);
