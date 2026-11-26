import { inject } from '@angular/core';
import { Router } from '@angular/router';

import type {
  CanActivateFn,
  CanActivateChildFn,
  UrlTree,
} from '@angular/router';

import { SessionService } from '../auth/session.service';

function verifyAuthentication(
  requestedUrl: string,
): boolean | UrlTree {
  const session = inject(SessionService);
  const router = inject(Router);

  if (session.isAuthenticated()) {
    return true;
  }

  session.clearSession();

  return router.createUrlTree(['/login'], {
    queryParams: {
      returnUrl: requestedUrl,
    },
  });
}

export const authGuard: CanActivateFn = (
  _route,
  state,
) => {
  return verifyAuthentication(state.url);
};

export const authChildGuard: CanActivateChildFn = (
  _childRoute,
  state,
) => {
  return verifyAuthentication(state.url);
};
