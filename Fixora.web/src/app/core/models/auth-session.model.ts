import type { AuthUser } from './auth-user.model';

export interface AuthSession {
  readonly accessToken: string;
  readonly expiresAt: number;
  readonly user: AuthUser;
}
