import { inject } from '@angular/core';
import { HttpContextToken } from '@angular/common/http';
import type { HttpInterceptorFn } from '@angular/common/http';

import { SessionService } from '../auth/session.service';
import { API_CONFIG } from '../config/api.config';

export const SKIP_AUTH = new HttpContextToken<boolean>(
  () => false,
);

function isTrustedApiRequest(
  requestUrl: string,
  configuredBaseUrl: string | null,
): boolean {
  if (!configuredBaseUrl?.trim()) {
    return false;
  }

  try {
    const base = new URL(configuredBaseUrl.trim());
    const target = new URL(requestUrl);

    if (
      base.protocol !== 'https:' ||
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      target.protocol !== 'https:' ||
      target.username ||
      target.password ||
      target.hash ||
      target.origin !== base.origin
    ) {
      return false;
    }

    const basePath = base.pathname.replace(/\/+$/, '');

    if (
      /%(?:2f|5c|2e|25)/i.test(target.pathname) ||
      target.pathname.includes('\\')
    ) {
      return false;
    }

    return (
      target.pathname === basePath ||
      target.pathname.startsWith(`${basePath}/`)
    );
  } catch {
    return false;
  }
}

export const authInterceptor: HttpInterceptorFn = (
  request,
  next,
) => {
  const session = inject(SessionService);
  const config = inject(API_CONFIG);

  if (
    request.context.get(SKIP_AUTH) ||
    request.headers.has('Authorization') ||
    !isTrustedApiRequest(request.url, config.baseUrl)
  ) {
    return next(request);
  }

  const token = session.getAccessToken();

  if (!token) {
    return next(request);
  }

  const authenticatedRequest = request.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`,
    },
  });

  return next(authenticatedRequest);
};
