import { inject } from '@angular/core';
import { Router } from '@angular/router';

import type {
  CanActivateFn,
  CanActivateChildFn,
  UrlTree,
} from '@angular/router';

import { SessionService } from '../auth/session.service';
import type { AuthRole } from '../models/auth-role.model';
import { MANAGER_PORTAL_ROLES } from '../models/auth-role.model';

function verifyRoles(
  allowedRoles: readonly AuthRole[],
  requestedUrl: string,
): boolean | UrlTree {
  const session = inject(SessionService);
  const router = inject(Router);

  if (!session.isAuthenticated()) {
    session.clearSession();

    return router.createUrlTree(['/login'], {
      queryParams: {
        returnUrl: requestedUrl,
      },
    });
  }

  if (
    allowedRoles.length > 0 &&
    session.hasAnyRole(allowedRoles)
  ) {
    return true;
  }

  return router.createUrlTree(['/login'], {
    queryParams: {
      reason: 'access-denied',
    },
  });
}

export function createRoleGuard(
  allowedRoles: readonly AuthRole[],
): CanActivateFn {
  return (_route, state) =>
    verifyRoles(allowedRoles, state.url);
}

export function createRoleChildGuard(
  allowedRoles: readonly AuthRole[],
): CanActivateChildFn {
  return (_route, state) =>
    verifyRoles(allowedRoles, state.url);
}

export const managerRoleGuard =
  createRoleGuard(MANAGER_PORTAL_ROLES);

export const managerRoleChildGuard =
  createRoleChildGuard(MANAGER_PORTAL_ROLES);
