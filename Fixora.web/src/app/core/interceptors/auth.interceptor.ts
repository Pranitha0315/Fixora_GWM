import { inject } from '@angular/core';
import { HttpContextToken } from '@angular/common/http';
import type { HttpInterceptorFn } from '@angular/common/http';

import { SessionService } from '../auth/session.service';
import { HttpRequestProvenanceService } from '../auth/http-request-provenance.service';
import { API_CONFIG } from '../config/api.config';

export const SKIP_AUTH = new HttpContextToken<boolean>(
  () => false,
);

const SIGNED_MEDIA_PATH_PATTERN = /^\/+api\/+v1\/+media(?:\/|$)/i;

/**
 * Signed media (`GET /api/v1/media/{mediaRef}?exp=&sig=`) is anonymous: the
 * HMAC query is its only credential, so a Bearer token is never attached.
 * Matched on the decoded pathname because backend routing is
 * case-insensitive and decodes the path. HttpClient media loaders must still
 * set SKIP_AUTH and must not supply an Authorization header themselves.
 */
function isSignedMediaPath(pathname: string): boolean {
  let decoded = pathname;

  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // Malformed escapes: match the raw pathname.
  }

  return (
    SIGNED_MEDIA_PATH_PATTERN.test(pathname) ||
    SIGNED_MEDIA_PATH_PATTERN.test(decoded)
  );
}

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
      target.pathname.includes('\\') ||
      isSignedMediaPath(target.pathname)
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
  const provenance = inject(HttpRequestProvenanceService, { optional: true });

  if (
    request.context.get(SKIP_AUTH) ||
    request.headers.has('Authorization') ||
    !isTrustedApiRequest(request.url, config.baseUrl)
  ) {
    provenance?.markUnauthenticated(request);
    return next(request);
  }

  const token = session.getAccessToken();
  const activeSession = session.session();

  if (
    !token ||
    activeSession === null ||
    activeSession.accessToken !== token
  ) {
    provenance?.markUnauthenticated(request);
    return next(request);
  }

  const authenticatedRequest = request.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`,
    },
  });

  const trackedRequest = provenance
    ? provenance.recordAuthenticatedDispatch(
        authenticatedRequest,
        activeSession,
        authenticatedRequest.context.get(SKIP_AUTH),
      )
    : authenticatedRequest;

  return next(trackedRequest);
};
