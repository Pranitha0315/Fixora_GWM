import type { AuthRole } from './auth-role.model';

export interface AuthUser {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
  readonly roles: readonly AuthRole[];
}
