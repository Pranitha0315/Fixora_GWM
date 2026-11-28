import { inject, Injectable, signal } from '@angular/core';
import type { Signal } from '@angular/core';

import { HttpRequestProvenanceService } from '../../../core/auth/http-request-provenance.service';
import { SessionService } from '../../../core/auth/session.service';
import { API_CONFIG } from '../../../core/config/api.config';
import { ApiError } from '../../../core/models/api-error.model';
import type { AuthSession } from '../../../core/models/auth-session.model';

/** Day06 feature lane that initiated a trusted authenticated API request. */
export type Day06ApiFeature =
  | 'job-cards'
  | 'fixproof-read'
  | 'fixproof-mutation';

/** Feature authorization scope used for session-scoped HTTP 403 isolation. */
export type Day06FeatureScope = 'job-cards' | 'fixproof';

/** HTTP methods used by verified Day06 manager endpoints. */
export type Day06HttpMethod = 'GET' | 'POST' | 'PUT';

/**
 * Immutable provenance bound to one authenticated Day06 API request when it is
 * initiated. Never holds raw tokens, customer data, notes or media URLs.
 */
export interface Day06RequestProvenance {
  readonly feature: Day06ApiFeature;
  readonly session: AuthSession;
  readonly endpointPath: string;
  readonly method: Day06HttpMethod;
  readonly resolvedUrl: string;
  readonly skipAuth: false;
}

export interface Day06ForbiddenEvent {
  readonly session: AuthSession;
  readonly scope: Day06FeatureScope;
  readonly deniedJobId: string | null;
}

export type Day06UnauthorizedListener = (revokedSession: AuthSession) => void;
export type Day06ForbiddenListener = (event: Day06ForbiddenEvent) => void;

const ALLOWED_DAY06_PATH_PATTERN =
  /^api\/v1\/manager\/(?:jobs|approvals)(?:\/[a-zA-Z0-9_-]+)*$/;

const JOB_DETAIL_PATH_PATTERN =
  /^api\/v1\/manager\/jobs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const DISALLOWED_PATH_SEGMENTS_PATTERN =
  /(?:^|\/)(?:auth|media)(?:\/|$)/i;

const ENCODED_OR_BACKSLASH_PATTERN = /(?:%(?:2f|5c|2e|25)|\\)/i;

function normalizeTrustedApiBase(
  configuredBaseUrl: string | null | undefined,
): { readonly baseUrl: string; readonly origin: string; readonly basePath: string } | null {
  const trimmed = configuredBaseUrl?.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);

    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }

    const normalizedHref = parsed.href.replace(/\/+$/, '');
    const basePath = parsed.pathname.replace(/\/+$/, '');

    return {
      baseUrl: normalizedHref,
      origin: parsed.origin,
      basePath,
    };
  } catch {
    return null;
  }
}

function normalizeDay06ManagerPath(endpointPath: string): string | null {
  if (typeof endpointPath !== 'string') {
    return null;
  }

  const trimmed = endpointPath.trim();

  if (
    !trimmed ||
    trimmed.includes('?') ||
    trimmed.includes('#') ||
    ENCODED_OR_BACKSLASH_PATTERN.test(trimmed)
  ) {
    return null;
  }

  const normalized = trimmed.replace(/^\/+/, '');

  if (
    !ALLOWED_DAY06_PATH_PATTERN.test(normalized) ||
    DISALLOWED_PATH_SEGMENTS_PATTERN.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

function isAllowedFeatureMethodAndPath(
  feature: Day06ApiFeature,
  method: Day06HttpMethod,
  normalizedPath: string,
): boolean {
  switch (feature) {
    case 'job-cards':
      return (
        method === 'GET' &&
        (normalizedPath === 'api/v1/manager/jobs' ||
          JOB_DETAIL_PATH_PATTERN.test(normalizedPath))
      );
    case 'fixproof-read':
      return (
        method === 'GET' &&
        (normalizedPath === 'api/v1/manager/approvals/proposals' ||
          normalizedPath === 'api/v1/manager/approvals/change-requests' ||
          JOB_DETAIL_PATH_PATTERN.test(normalizedPath))
      );
    case 'fixproof-mutation':
      if (method === 'GET') {
        return JOB_DETAIL_PATH_PATTERN.test(normalizedPath);
      }
      return (
        (method === 'POST' || method === 'PUT') &&
        normalizedPath.startsWith('api/v1/manager/approvals/')
      );
  }
}

function matchesTrustedDay06Url(
  targetUrl: string,
  base: { readonly origin: string; readonly basePath: string },
): boolean {
  if (typeof targetUrl !== 'string' || !targetUrl.trim()) {
    return false;
  }

  try {
    const target = new URL(targetUrl);

    if (
      target.protocol !== 'https:' ||
      target.username ||
      target.password ||
      target.hash ||
      target.origin !== base.origin ||
      ENCODED_OR_BACKSLASH_PATTERN.test(target.pathname)
    ) {
      return false;
    }

    const prefix = base.basePath === '' ? '' : base.basePath;

    if (
      target.pathname !== prefix &&
      !target.pathname.startsWith(`${prefix}/`)
    ) {
      return false;
    }

    const relativePath = target.pathname
      .slice(prefix.length)
      .replace(/^\/+/, '');

    return normalizeDay06ManagerPath(relativePath) !== null;
  } catch {
    return false;
  }
}

function sameTrustedOriginAndPathname(
  leftUrl: string,
  rightUrl: string,
): boolean {
  try {
    const left = new URL(leftUrl);
    const right = new URL(rightUrl);

    return (
      left.protocol === 'https:' &&
      right.protocol === 'https:' &&
      left.origin === right.origin &&
      left.pathname === right.pathname
    );
  } catch {
    return false;
  }
}

function extractCanonicalDeniedJobId(
  method: Day06HttpMethod,
  normalizedPath: string,
): string | null {
  if (method !== 'GET') {
    return null;
  }

  const match = JOB_DETAIL_PATH_PATTERN.exec(normalizedPath);
  return match ? match[1].toLowerCase() : null;
}

function isValidSession(
  session: AuthSession | null | undefined,
  nowMs: number = Date.now(),
): session is AuthSession {
  return (
    session !== null &&
    session !== undefined &&
    typeof session.accessToken === 'string' &&
    session.accessToken.trim().length > 0 &&
    Number.isFinite(session.expiresAt) &&
    session.expiresAt > nowMs
  );
}

/**
 * Root-injector-scoped cross-feature and cross-instance authorization
 * coordinator for Day06 (`JobCardStateService`, `FixProofStateService`, and
 * `FixProofMutationStateService`).
 *
 * Security invariants:
 * - Scoped to Angular DI (`providedIn: 'root'`), never module-level static state.
 * - Uses exact `AuthSession` reference identity inside `WeakSet`/`WeakMap`,
 *   retaining no strong references to expired or replaced sessions.
 * - Propagates HTTP 401 and feature/resource HTTP 403 ONLY when backed by
 *   valid trusted `API_CONFIG`, matching request provenance, exact active
 *   `SessionService` reference, and runtime `HttpRequestProvenanceService`
 *   attestation proving `errorInterceptor` normalized an `authInterceptor`
 *   authenticated request (`SKIP_AUTH === false`, `Authorization` attached).
 * - HTTP 401 revokes all Day06 features for that exact session.
 * - HTTP 403 stays strictly feature-scoped across all active instances of the
 *   denied feature (`job-cards` vs `fixproof`), plus conservative shared-job
 *   invalidation for `GET /api/v1/manager/jobs/{id}`.
 * - Never clears `SessionService` and performs zero HTTP requests, browser
 *   storage writes, or logging.
 */
@Injectable({
  providedIn: 'root',
})
export class Day06AuthorizationCoordinatorService {
  private readonly sessionService = inject(SessionService);
  private readonly httpProvenance = inject(HttpRequestProvenanceService);
  private readonly apiConfig = inject(API_CONFIG, { optional: true });

  private readonly revokedSessions = new WeakSet<AuthSession>();
  private readonly forbiddenFeaturesBySession = new WeakMap<
    AuthSession,
    Set<Day06FeatureScope>
  >();
  private readonly deniedJobsBySession = new WeakMap<
    AuthSession,
    Set<string>
  >();

  private readonly unauthorizedListeners =
    new Set<Day06UnauthorizedListener>();
  private readonly forbiddenListeners = new Set<Day06ForbiddenListener>();

  private readonly revocationVersionState = signal(0);
  private readonly forbiddenVersionState = signal(0);
  private readonly resourceDenialVersionState = signal(0);

  /** Monotonic version incremented whenever a Day06 session is newly revoked (401). */
  readonly revocationVersion: Signal<number> =
    this.revocationVersionState.asReadonly();

  /** Monotonic version incremented whenever a Day06 feature scope is newly forbidden (403). */
  readonly forbiddenVersion: Signal<number> =
    this.forbiddenVersionState.asReadonly();

  /** Monotonic version incremented whenever a shared job resource is newly denied (403). */
  readonly resourceDenialVersion: Signal<number> =
    this.resourceDenialVersionState.asReadonly();

  /**
   * Creates request provenance metadata bound to the caller's intent at dispatch.
   * Runtime HTTP execution is verified separately via `HttpRequestProvenanceService`.
   */
  createRequestProvenance(
    feature: Day06ApiFeature,
    session: AuthSession,
    endpointPath: string,
    method: Day06HttpMethod = 'GET',
  ): Day06RequestProvenance | null {
    const base = normalizeTrustedApiBase(this.apiConfig?.baseUrl);

    if (base === null) {
      return null;
    }

    const normalizedPath = normalizeDay06ManagerPath(endpointPath);

    if (
      normalizedPath === null ||
      !isAllowedFeatureMethodAndPath(feature, method, normalizedPath)
    ) {
      return null;
    }

    if (
      !isValidSession(session) ||
      !this.sessionService.isAuthenticated() ||
      this.sessionService.session() !== session
    ) {
      return null;
    }

    const resolvedUrl = `${base.baseUrl}/${normalizedPath}`;

    if (!matchesTrustedDay06Url(resolvedUrl, base)) {
      return null;
    }

    return Object.freeze({
      feature,
      session,
      endpointPath: normalizedPath,
      method,
      resolvedUrl,
      skipAuth: false as const,
    });
  }

  /** True when the given exact session reference has been revoked via Day06 401. */
  isSessionRevoked(session: AuthSession | null | undefined): boolean {
    return (
      session !== null &&
      session !== undefined &&
      this.revokedSessions.has(session)
    );
  }

  /** True when the current authenticated session is already revoked for Day06. */
  isCurrentSessionRevoked(): boolean {
    this.revocationVersionState();

    if (!this.sessionService.isAuthenticated()) {
      return false;
    }

    return this.isSessionRevoked(this.sessionService.session());
  }

  /** True when the exact session reference has been 403-revoked for `scope`. */
  isFeatureForbidden(
    session: AuthSession | null | undefined,
    scope: Day06FeatureScope,
  ): boolean {
    return (
      session !== null &&
      session !== undefined &&
      (this.forbiddenFeaturesBySession.get(session)?.has(scope) ?? false)
    );
  }

  /** Reactive helper checking feature-level 403 revocation on the active session. */
  isCurrentFeatureForbidden(scope: Day06FeatureScope): boolean {
    this.forbiddenVersionState();

    if (!this.sessionService.isAuthenticated()) {
      return false;
    }

    return this.isFeatureForbidden(this.sessionService.session(), scope);
  }

  /** True when `GET /api/v1/manager/jobs/{id}` returned verified 403 for `session`. */
  isJobResourceDenied(
    session: AuthSession | null | undefined,
    jobCardId: string | null | undefined,
  ): boolean {
    if (
      session === null ||
      session === undefined ||
      typeof jobCardId !== 'string' ||
      !jobCardId.trim()
    ) {
      return false;
    }

    return (
      this.deniedJobsBySession
        .get(session)
        ?.has(jobCardId.trim().toLowerCase()) ?? false
    );
  }

  /** Reactive helper checking shared job resource denial on the active session. */
  isCurrentJobResourceDenied(jobCardId: string | null | undefined): boolean {
    this.resourceDenialVersionState();

    if (!this.sessionService.isAuthenticated()) {
      return false;
    }

    return this.isJobResourceDenied(this.sessionService.session(), jobCardId);
  }

  /** Registers a synchronous HTTP 401 cross-feature revocation listener. */
  registerListener(listener: Day06UnauthorizedListener): () => void {
    this.unauthorizedListeners.add(listener);

    return () => {
      this.unauthorizedListeners.delete(listener);
    };
  }

  /** Registers a synchronous HTTP 403 feature/resource denial listener. */
  registerForbiddenListener(listener: Day06ForbiddenListener): () => void {
    this.forbiddenListeners.add(listener);

    return () => {
      this.forbiddenListeners.delete(listener);
    };
  }

  /**
   * Propagates a verified authenticated Day06 HTTP 401 across all active Day06
   * instances for the exact `provenance.session`.
   */
  reportUnauthorized(
    provenance: Day06RequestProvenance | null,
    error: unknown,
  ): boolean {
    const validated = this.verifyHttpErrorProvenance(
      provenance,
      error,
      401,
      'UNAUTHORIZED',
    );

    if (validated === null) {
      return false;
    }

    const { session } = validated;

    if (this.revokedSessions.has(session)) {
      return false;
    }

    // Mark session revoked BEFORE notifying listeners to prevent recursion.
    this.revokedSessions.add(session);
    this.revocationVersionState.update(version => version + 1);

    for (const listener of [...this.unauthorizedListeners]) {
      listener(session);
    }

    return true;
  }

  /**
   * Propagates a verified authenticated Day06 HTTP 403 across all active
   * instances of the reporting feature scope (`job-cards` or `fixproof`), plus
   * shared-job resource invalidation when the request was `GET /jobs/{id}`.
   */
  reportForbidden(
    provenance: Day06RequestProvenance | null,
    error: unknown,
  ): boolean {
    const validated = this.verifyHttpErrorProvenance(
      provenance,
      error,
      403,
      'FORBIDDEN',
    );

    if (validated === null) {
      return false;
    }

    const { session, normalizedPath, method, feature } = validated;
    const scope: Day06FeatureScope =
      feature === 'job-cards' ? 'job-cards' : 'fixproof';
    const deniedJobId = extractCanonicalDeniedJobId(method, normalizedPath);

    let featureSet = this.forbiddenFeaturesBySession.get(session);
    const scopeAdded = !(featureSet?.has(scope) ?? false);

    let jobSet =
      deniedJobId !== null ? this.deniedJobsBySession.get(session) : undefined;
    const jobAdded =
      deniedJobId !== null && !(jobSet?.has(deniedJobId) ?? false);

    if (!scopeAdded && !jobAdded) {
      return false;
    }

    // Record denials BEFORE notifying listeners to guarantee non-recursion.
    if (scopeAdded) {
      if (featureSet === undefined) {
        featureSet = new Set<Day06FeatureScope>();
        this.forbiddenFeaturesBySession.set(session, featureSet);
      }
      featureSet.add(scope);
      this.forbiddenVersionState.update(version => version + 1);
    }

    if (jobAdded && deniedJobId !== null) {
      if (jobSet === undefined) {
        jobSet = new Set<string>();
        this.deniedJobsBySession.set(session, jobSet);
      }
      jobSet.add(deniedJobId);
      this.resourceDenialVersionState.update(version => version + 1);
    }

    const event: Day06ForbiddenEvent = Object.freeze({
      session,
      scope,
      deniedJobId,
    });

    for (const listener of [...this.forbiddenListeners]) {
      listener(event);
    }

    return true;
  }

  private verifyHttpErrorProvenance(
    provenance: Day06RequestProvenance | null,
    error: unknown,
    expectedStatus: 401 | 403,
    expectedCode: 'UNAUTHORIZED' | 'FORBIDDEN',
  ): {
    readonly session: AuthSession;
    readonly normalizedPath: string;
    readonly method: Day06HttpMethod;
    readonly feature: Day06ApiFeature;
  } | null {
    if (provenance === null || provenance.skipAuth !== false) {
      return null;
    }

    const base = normalizeTrustedApiBase(this.apiConfig?.baseUrl);

    if (base === null) {
      return null;
    }

    const normalizedPath = normalizeDay06ManagerPath(provenance.endpointPath);

    if (
      normalizedPath === null ||
      normalizedPath !== provenance.endpointPath ||
      !isAllowedFeatureMethodAndPath(
        provenance.feature,
        provenance.method,
        normalizedPath,
      ) ||
      !matchesTrustedDay06Url(provenance.resolvedUrl, base)
    ) {
      return null;
    }

    if (
      !(error instanceof ApiError) ||
      error.status !== expectedStatus ||
      error.code !== expectedCode
    ) {
      return null;
    }

    const verifiedHttp = this.httpProvenance.consumeErrorProvenance(error);

    if (
      verifiedHttp === null ||
      verifiedHttp.skipAuth !== false ||
      !verifiedHttp.authHeaderAttached ||
      verifiedHttp.session !== provenance.session ||
      verifiedHttp.method !== provenance.method ||
      !matchesTrustedDay06Url(verifiedHttp.resolvedUrl, base) ||
      !sameTrustedOriginAndPathname(
        verifiedHttp.resolvedUrl,
        provenance.resolvedUrl,
      )
    ) {
      return null;
    }

    const session = provenance.session;

    if (
      !isValidSession(session) ||
      !this.sessionService.isAuthenticated() ||
      this.sessionService.session() !== session
    ) {
      return null;
    }

    return {
      session,
      normalizedPath,
      method: provenance.method,
      feature: provenance.feature,
    };
  }
}
