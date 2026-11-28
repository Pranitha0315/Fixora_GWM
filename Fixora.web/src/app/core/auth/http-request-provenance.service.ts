import {
  HttpContext,
  HttpContextToken,
  HttpErrorResponse,
} from '@angular/common/http';
import type { HttpRequest } from '@angular/common/http';
import { Injectable } from '@angular/core';

import { ApiError } from '../models/api-error.model';
import type { AuthSession } from '../models/auth-session.model';

const DISPATCH_TICKET_BRAND: unique symbol = Symbol(
  'fixora-http-dispatch-ticket',
);

interface DispatchTicket {
  readonly brand: typeof DISPATCH_TICKET_BRAND;
}

interface DispatchState {
  authenticated: boolean;
  errorBound: boolean;
  consumed: boolean;
  session: AuthSession | null;
  resolvedUrl: string;
  resolvedMethod: string;
  skipAuth: boolean;
  authHeaderAttached: boolean;
}

/**
 * Runtime HTTP provenance bound to an `ApiError` normalized by
 * `errorInterceptor` from an `authInterceptor`-authenticated `HttpRequest`.
 *
 * Contains no raw tokens, Authorization header strings, or business payloads.
 * Client-side request attestation confirms only what this browser client
 * dispatched through its interceptors, never server authorization state.
 */
export interface AuthenticatedHttpErrorProvenance {
  readonly session: AuthSession;
  readonly resolvedUrl: string;
  readonly method: string;
  readonly skipAuth: false;
  readonly authHeaderAttached: true;
}

const DISPATCH_TICKET_TOKEN = new HttpContextToken<DispatchTicket | null>(
  () => null,
);

function cloneHttpContext(
  source: HttpContext,
  ticket: DispatchTicket,
): HttpContext {
  const cloned = new HttpContext();

  for (const key of source.keys()) {
    if (key === DISPATCH_TICKET_TOKEN) {
      continue;
    }

    cloned.set(key as HttpContextToken<unknown>, source.get(key));
  }

  cloned.set(DISPATCH_TICKET_TOKEN, ticket);
  return cloned;
}

function createTicket(): DispatchTicket {
  return Object.freeze({
    brand: DISPATCH_TICKET_BRAND,
  });
}

function isTrustedHttpsUrl(rawUrl: string): URL | null {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return null;
  }

  try {
    const parsed = new URL(rawUrl);

    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.hash
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function matchesHttpsOriginAndPathname(
  leftUrl: string,
  rightUrl: string,
): boolean {
  const left = isTrustedHttpsUrl(leftUrl);
  const right = isTrustedHttpsUrl(rightUrl);

  return (
    left !== null &&
    right !== null &&
    left.origin === right.origin &&
    left.pathname === right.pathname
  );
}

function isValidSessionReference(session: AuthSession | null | undefined): session is AuthSession {
  return (
    session !== null &&
    session !== undefined &&
    typeof session.accessToken === 'string' &&
    session.accessToken.trim().length > 0 &&
    Number.isFinite(session.expiresAt)
  );
}

/**
 * Root-injector-scoped per-dispatch HTTP request provenance registry.
 *
 * Bridges `errorInterceptor` and `authInterceptor` across `HttpRequest.clone()`
 * boundaries by allocating an isolated, single-use dispatch ticket inside a
 * cloned `HttpContext` per subscription—preventing shared mutable `HttpContext`,
 * concurrent identical URLs, repeated cold subscriptions, or forged `ApiError`
 * instances from sharing or fabricating request provenance.
 */
@Injectable({
  providedIn: 'root',
})
export class HttpRequestProvenanceService {
  private readonly dispatchRecords = new WeakMap<DispatchTicket, DispatchState>();
  private readonly errorRecords = new WeakMap<
    ApiError,
    AuthenticatedHttpErrorProvenance
  >();

  /**
   * Called by `errorInterceptor` when an HTTP request enters the pipeline.
   * Allocates a fresh scoped `HttpContext` + dispatch ticket per subscription,
   * or binds to an unbound `authInterceptor` ticket when interceptors run in
   * `[authInterceptor, errorInterceptor]` order.
   */
  beginErrorInterceptorDispatch(
    request: HttpRequest<unknown>,
    skipAuth: boolean,
  ): {
    readonly request: HttpRequest<unknown>;
    readonly ticket: DispatchTicket;
  } {
    const existingTicket = request.context.get(DISPATCH_TICKET_TOKEN);
    const existingRecord =
      existingTicket !== null
        ? this.dispatchRecords.get(existingTicket)
        : undefined;

    if (
      existingTicket !== null &&
      existingRecord !== undefined &&
      !existingRecord.errorBound &&
      !existingRecord.consumed
    ) {
      existingRecord.errorBound = true;
      if (skipAuth) {
        existingRecord.skipAuth = true;
        existingRecord.authenticated = false;
        existingRecord.session = null;
        existingRecord.authHeaderAttached = false;
      }
      return { request, ticket: existingTicket };
    }

    const ticket = createTicket();
    this.dispatchRecords.set(ticket, {
      authenticated: false,
      errorBound: true,
      consumed: false,
      session: null,
      resolvedUrl: '',
      resolvedMethod: '',
      skipAuth,
      authHeaderAttached: false,
    });

    const scopedContext = cloneHttpContext(request.context, ticket);
    return {
      request: request.clone({ context: scopedContext }),
      ticket,
    };
  }

  /**
   * Called by `authInterceptor` only after verifying `!SKIP_AUTH`, trusted API
   * origin, valid non-empty `AuthSession` reference, and attaching the
   * `Authorization: Bearer ...` header on the cloned request.
   */
  recordAuthenticatedDispatch(
    authenticatedRequest: HttpRequest<unknown>,
    session: AuthSession,
    skipAuth: boolean,
  ): HttpRequest<unknown> {
    if (
      skipAuth !== false ||
      !authenticatedRequest.headers.has('Authorization') ||
      !isValidSessionReference(session) ||
      isTrustedHttpsUrl(authenticatedRequest.url) === null
    ) {
      this.markUnauthenticated(authenticatedRequest);
      return authenticatedRequest;
    }

    const existingTicket = authenticatedRequest.context.get(DISPATCH_TICKET_TOKEN);
    const existingRecord =
      existingTicket !== null
        ? this.dispatchRecords.get(existingTicket)
        : undefined;

    if (
      existingTicket !== null &&
      existingRecord !== undefined &&
      !existingRecord.consumed
    ) {
      existingRecord.authenticated = true;
      existingRecord.session = session;
      existingRecord.resolvedUrl = authenticatedRequest.url;
      existingRecord.resolvedMethod = authenticatedRequest.method.toUpperCase();
      existingRecord.skipAuth = false;
      existingRecord.authHeaderAttached = true;
      return authenticatedRequest;
    }

    const ticket = createTicket();
    this.dispatchRecords.set(ticket, {
      authenticated: true,
      errorBound: false,
      consumed: false,
      session,
      resolvedUrl: authenticatedRequest.url,
      resolvedMethod: authenticatedRequest.method.toUpperCase(),
      skipAuth: false,
      authHeaderAttached: true,
    });

    const scopedContext = cloneHttpContext(authenticatedRequest.context, ticket);
    return authenticatedRequest.clone({ context: scopedContext });
  }

  /** Marks an active dispatch unauthenticated so downstream errors cannot propagate. */
  markUnauthenticated(request: HttpRequest<unknown>): void {
    const ticket = request.context.get(DISPATCH_TICKET_TOKEN);
    const record =
      ticket !== null ? this.dispatchRecords.get(ticket) : undefined;

    if (record === undefined) {
      return;
    }

    record.authenticated = false;
    record.session = null;
    record.authHeaderAttached = false;
    record.resolvedUrl = '';
    record.resolvedMethod = '';
  }

  /**
   * Associates a normalized `ApiError` with its originating authenticated
   * dispatch record when `errorInterceptor` catches an `HttpErrorResponse`.
   */
  associateNormalizedError(
    ticket: DispatchTicket,
    request: HttpRequest<unknown>,
    httpError: HttpErrorResponse,
    apiError: ApiError,
  ): void {
    const record = this.dispatchRecords.get(ticket);
    this.dispatchRecords.delete(ticket);

    if (
      record === undefined ||
      record.consumed ||
      !record.authenticated ||
      record.skipAuth ||
      !record.authHeaderAttached ||
      !isValidSessionReference(record.session) ||
      httpError.status !== apiError.status ||
      record.resolvedMethod !== request.method.toUpperCase() ||
      !matchesHttpsOriginAndPathname(record.resolvedUrl, request.url)
    ) {
      return;
    }

    if (
      typeof httpError.url === 'string' &&
      httpError.url.length > 0 &&
      !matchesHttpsOriginAndPathname(httpError.url, record.resolvedUrl)
    ) {
      return;
    }

    record.consumed = true;
    this.errorRecords.set(
      apiError,
      Object.freeze({
        session: record.session,
        resolvedUrl: record.resolvedUrl,
        method: record.resolvedMethod,
        skipAuth: false as const,
        authHeaderAttached: true as const,
      }),
    );
  }

  /** Releases any unconsumed dispatch record when an HTTP observable settles or cancels. */
  releaseDispatch(ticket: DispatchTicket): void {
    this.dispatchRecords.delete(ticket);
  }

  /**
   * Consumes and returns verified HTTP dispatch provenance for an `ApiError`
   * once. Returns `null` for manually constructed errors, non-authenticated
   * requests, or previously consumed errors.
   */
  consumeErrorProvenance(error: unknown): AuthenticatedHttpErrorProvenance | null {
    if (!(error instanceof ApiError)) {
      return null;
    }

    const record = this.errorRecords.get(error) ?? null;

    if (record !== null) {
      this.errorRecords.delete(error);
    }

    return record;
  }
}
