/**
 * Secure signed media URL validation and resolution for Job Cards evidence.
 *
 * Verified backend contract:
 * - Fixora.Shared.Infrastructure/Media/LocalMediaStorage.cs (lines 19-55):
 *   - `mediaRef` = `${Guid.NewGuid():N}${ext.ToLowerInvariant()}` (32 lowercase hex + `.{1..5}` ext, fallback `.bin`)
 *   - `GetSignedUrl` returns `/api/v1/media/{mediaRef}?exp={unixSeconds}&sig={hmacSha256LowerHex64}`
 *   - `TryOpen` rejects `/`, `\`, `..`, expired `UtcNow.ToUnixTimeSeconds() > exp`, and invalid HMAC-SHA256 hex signatures
 * - Fixora.Shared.Infrastructure/Api/SharedControllers.cs (lines 90-102):
 *   - `GET /api/v1/media/{mediaRef}?exp={long}&sig={string}` (`[AllowAnonymous]`)
 *   - Returns `PhysicalFile(path, type)` on success, `404 NotFound` on expired/invalid signature or missing file
 * - Fixora.Manager.Application/Common/WorkshopReadModel.cs (lines 48-50):
 *   - `IssueDto.MediaUrls` signs each `MediaRef` with a 15-minute TTL; no `ContentType`, `Phase`, or `Caption` is returned
 * - Fixora.Mechanic.Application/FixProof/FixProofCaptureService.cs (line 34):
 *   - Upload allows `image/*`, `video/*`, and `audio/*`
 *
 * Security boundaries:
 * - Frontend validates URL structure, trusted HTTPS API origin, and expiry timestamp only;
 *   cryptographic HMAC signature verification remains exclusively on the backend.
 * - Never appends bearer tokens or alters signed path/query values.
 * - Never logs signed media URLs or includes raw URLs/signatures in error messages.
 * - Extension-based `previewHint` is a rendering hint only, never an authoritative MIME type.
 */

/** Exact relative media endpoint prefix emitted by LocalMediaStorage.GetSignedUrl. */
export const SIGNED_MEDIA_PATH_PREFIX = '/api/v1/media/';

/** Exact TTL (seconds) used by WorkshopReadModel.Issue (15 minutes). */
export const SIGNED_MEDIA_DEFAULT_TTL_SECONDS = 900;

/**
 * Matches `LocalMediaStorage.SaveAsync`: 32 lowercase hex GUID ("N" format)
 * plus a single lowercased extension of 1..5 safe characters (`.Length <= 6`).
 */
const MEDIA_REF_PATTERN = /^[0-9a-f]{32}\.[a-z0-9_-]{1,5}$/;

/** Matches non-negative Unix timestamp in seconds without leading zeros. */
const UNIX_SECONDS_PATTERN = /^(?:0|[1-9]\d{0,18})$/;

/** Matches 64 lowercase hexadecimal chars from Convert.ToHexString(HMACSHA256).ToLowerInvariant(). */
const HMAC_SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

/** Maximum signed 64-bit integer (`long.MaxValue`) accepted by MediaController `[FromQuery] long exp`. */
const INT64_MAX = 9_223_372_036_854_775_807n;

/** Maximum Unix seconds representable cleanly in JS Date (`+-8.64e15 ms`). */
const MAX_JS_DATE_UNIX_SECONDS = 8_640_000_000_000n;

const SCHEME_PREFIX_PATTERN = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;
const CONTROL_OR_WHITESPACE_PATTERN = /[\u0000-\u001f\u007f\s]/;

/**
 * Extension-based preview hints only (never authoritative MIME types).
 * `.svg` is intentionally excluded from `image` to avoid active script content.
 */
const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'bmp',
  'avif',
]);

const VIDEO_EXTENSIONS: ReadonlySet<string> = new Set([
  'mp4',
  'webm',
  'mov',
  'm4v',
  '3gp',
]);

const AUDIO_EXTENSIONS: ReadonlySet<string> = new Set([
  'mp3',
  'wav',
  'ogg',
  'm4a',
  'aac',
  'opus',
  'flac',
]);

export type SignedMediaPreviewHint =
  | 'image'
  | 'video'
  | 'audio'
  | 'unsupported';

export type SignedMediaResolutionStatus =
  | 'valid'
  | 'expired'
  | 'malformed'
  | 'untrusted'
  | 'unconfigured';

export type SignedMediaUnconfiguredReason =
  | 'api-base-url-not-configured'
  | 'invalid-api-base-url';

export type SignedMediaUntrustedReason =
  | 'insecure-scheme'
  | 'unsupported-scheme'
  | 'protocol-relative-url'
  | 'embedded-credentials'
  | 'untrusted-origin';

export type SignedMediaMalformedReason =
  | 'empty-url'
  | 'invalid-characters'
  | 'fragment-not-allowed'
  | 'backslash-not-allowed'
  | 'encoded-characters-not-allowed'
  | 'path-traversal'
  | 'unexpected-path'
  | 'invalid-media-ref'
  | 'missing-query'
  | 'unexpected-query-parameter'
  | 'duplicate-query-parameter'
  | 'invalid-expiry'
  | 'invalid-signature'
  | 'ambiguous-url-normalization'
  | 'invalid-clock-time';

export type SignedMediaRejectionReason =
  | SignedMediaUnconfiguredReason
  | SignedMediaUntrustedReason
  | SignedMediaMalformedReason
  | 'media-url-expired';

export interface SignedMediaValidResult {
  readonly ok: true;
  readonly status: 'valid';
  /** Trusted absolute HTTPS URL with exact signed path & query preserved verbatim. */
  readonly url: string;
  readonly mediaRef: string;
  /** File-extension rendering hint only, never an authoritative Content-Type. */
  readonly previewHint: SignedMediaPreviewHint;
  readonly expiresAtUnixSeconds: number;
  readonly expiresAt: Date | null;
  readonly remainingSeconds: number;
  readonly reason: null;
  readonly message: null;
}

export interface SignedMediaExpiredResult {
  readonly ok: false;
  readonly status: 'expired';
  readonly url: null;
  readonly mediaRef: string;
  readonly previewHint: SignedMediaPreviewHint;
  readonly expiresAtUnixSeconds: number;
  readonly expiresAt: Date | null;
  readonly remainingSeconds: 0;
  readonly reason: 'media-url-expired';
  readonly message: string;
}

export interface SignedMediaMalformedResult {
  readonly ok: false;
  readonly status: 'malformed';
  readonly url: null;
  readonly mediaRef: null;
  readonly previewHint: 'unsupported';
  readonly expiresAtUnixSeconds: null;
  readonly expiresAt: null;
  readonly remainingSeconds: null;
  readonly reason: SignedMediaMalformedReason;
  readonly message: string;
}

export interface SignedMediaUntrustedResult {
  readonly ok: false;
  readonly status: 'untrusted';
  readonly url: null;
  readonly mediaRef: null;
  readonly previewHint: 'unsupported';
  readonly expiresAtUnixSeconds: null;
  readonly expiresAt: null;
  readonly remainingSeconds: null;
  readonly reason: SignedMediaUntrustedReason;
  readonly message: string;
}

export interface SignedMediaUnconfiguredResult {
  readonly ok: false;
  readonly status: 'unconfigured';
  readonly url: null;
  readonly mediaRef: null;
  readonly previewHint: 'unsupported';
  readonly expiresAtUnixSeconds: null;
  readonly expiresAt: null;
  readonly remainingSeconds: null;
  readonly reason: SignedMediaUnconfiguredReason;
  readonly message: string;
}

export type SignedMediaResolutionResult =
  | SignedMediaValidResult
  | SignedMediaExpiredResult
  | SignedMediaMalformedResult
  | SignedMediaUntrustedResult
  | SignedMediaUnconfiguredResult;

const SAFE_EXPIRED_MESSAGE =
  'This evidence link has expired. Refresh job details to load a new link.';
const SAFE_MALFORMED_MESSAGE =
  'This evidence link is invalid and cannot be displayed.';
const SAFE_UNTRUSTED_MESSAGE =
  'This evidence link points to an untrusted source and was blocked.';
const SAFE_UNCONFIGURED_MESSAGE =
  'Evidence previews are unavailable because the API address is not configured.';

function unconfigured(
  reason: SignedMediaUnconfiguredReason,
): SignedMediaUnconfiguredResult {
  return {
    ok: false,
    status: 'unconfigured',
    url: null,
    mediaRef: null,
    previewHint: 'unsupported',
    expiresAtUnixSeconds: null,
    expiresAt: null,
    remainingSeconds: null,
    reason,
    message: SAFE_UNCONFIGURED_MESSAGE,
  };
}

function untrusted(
  reason: SignedMediaUntrustedReason,
): SignedMediaUntrustedResult {
  return {
    ok: false,
    status: 'untrusted',
    url: null,
    mediaRef: null,
    previewHint: 'unsupported',
    expiresAtUnixSeconds: null,
    expiresAt: null,
    remainingSeconds: null,
    reason,
    message: SAFE_UNTRUSTED_MESSAGE,
  };
}

function malformed(
  reason: SignedMediaMalformedReason,
): SignedMediaMalformedResult {
  return {
    ok: false,
    status: 'malformed',
    url: null,
    mediaRef: null,
    previewHint: 'unsupported',
    expiresAtUnixSeconds: null,
    expiresAt: null,
    remainingSeconds: null,
    reason,
    message: SAFE_MALFORMED_MESSAGE,
  };
}

/**
 * Extracts a trusted HTTPS API origin from `API_CONFIG.baseUrl`.
 * Applies the same strict HTTPS, no-credentials, no-query, no-hash rules
 * enforced by `ApiUrlService`.
 */
export function resolveTrustedApiOrigin(
  apiBaseUrl: string | null | undefined,
):
  | { readonly ok: true; readonly origin: string }
  | { readonly ok: false; readonly reason: SignedMediaUnconfiguredReason } {
  const trimmed = apiBaseUrl?.trim();

  if (!trimmed) {
    return { ok: false, reason: 'api-base-url-not-configured' };
  }

  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'invalid-api-base-url' };
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    return { ok: false, reason: 'invalid-api-base-url' };
  }

  return { ok: true, origin: parsed.origin };
}

/**
 * Classifies a validated `mediaRef` extension into a rendering hint only.
 * Never treated as an authoritative Content-Type.
 */
export function inferMediaPreviewHint(
  mediaRef: string,
): SignedMediaPreviewHint {
  const dotIndex = mediaRef.lastIndexOf('.');

  if (dotIndex <= 0 || dotIndex === mediaRef.length - 1) {
    return 'unsupported';
  }

  const ext = mediaRef.slice(dotIndex + 1).toLowerCase();

  if (IMAGE_EXTENSIONS.has(ext)) {
    return 'image';
  }

  if (VIDEO_EXTENSIONS.has(ext)) {
    return 'video';
  }

  if (AUDIO_EXTENSIONS.has(ext)) {
    return 'audio';
  }

  return 'unsupported';
}

/**
 * Validates and resolves a backend-generated signed media URL against
 * the configured trusted HTTPS API origin.
 *
 * Raw input is validated before URL normalization, and the signed
 * path/query is preserved verbatim so HMAC signatures are never altered.
 *
 * Expiry matches `LocalMediaStorage.TryOpen` (line 42):
 * expired iff `Math.floor(nowMs / 1000) > exp`.
 */
export function resolveSignedMediaUrl(
  rawUrl: unknown,
  apiBaseUrl: string | null | undefined,
  nowMs: number = Date.now(),
): SignedMediaResolutionResult {
  const trusted = resolveTrustedApiOrigin(apiBaseUrl);

  if (!trusted.ok) {
    return unconfigured(trusted.reason);
  }

  if (!Number.isFinite(nowMs)) {
    return malformed('invalid-clock-time');
  }

  if (typeof rawUrl !== 'string' || rawUrl.length === 0) {
    return malformed('empty-url');
  }

  if (CONTROL_OR_WHITESPACE_PATTERN.test(rawUrl)) {
    return malformed('invalid-characters');
  }

  if (rawUrl.includes('\\')) {
    return malformed('backslash-not-allowed');
  }

  if (rawUrl.includes('#')) {
    return malformed('fragment-not-allowed');
  }

  if (rawUrl.startsWith('//')) {
    return untrusted('protocol-relative-url');
  }

  let relativePart: string;
  const schemeMatch = SCHEME_PREFIX_PATTERN.exec(rawUrl);

  if (schemeMatch !== null) {
    const scheme = schemeMatch[1].toLowerCase();

    if (scheme === 'http') {
      return untrusted('insecure-scheme');
    }

    if (scheme !== 'https') {
      return untrusted('unsupported-scheme');
    }

    // Must begin with literal "https://" (not "https:foo" or "https:/foo").
    if (!/^https:\/\//i.test(rawUrl)) {
      return malformed('ambiguous-url-normalization');
    }

    // Reject embedded credentials before URL parsing (e.g. user:pass@host or @host).
    const afterScheme = rawUrl.slice('https://'.length);
    const firstPathDelimiter = afterScheme.search(/[/?]/);
    const rawAuthority =
      firstPathDelimiter === -1
        ? afterScheme
        : afterScheme.slice(0, firstPathDelimiter);

    if (rawAuthority.includes('@')) {
      return untrusted('embedded-credentials');
    }

    let parsedAbsolute: URL;

    try {
      parsedAbsolute = new URL(rawUrl);
    } catch {
      return malformed('ambiguous-url-normalization');
    }

    if (parsedAbsolute.username || parsedAbsolute.password) {
      return untrusted('embedded-credentials');
    }

    if (parsedAbsolute.origin !== trusted.origin) {
      return untrusted('untrusted-origin');
    }

    if (firstPathDelimiter === -1 || afterScheme[firstPathDelimiter] !== '/') {
      return malformed('unexpected-path');
    }

    // Reject ambiguous authority normalization (e.g. default :443, trailing dot, uppercase host).
    if (`https://${rawAuthority}` !== trusted.origin) {
      return malformed('ambiguous-url-normalization');
    }

    relativePart = afterScheme.slice(firstPathDelimiter);
  } else {
    relativePart = rawUrl;
  }

  // Raw path/query checks BEFORE any URL normalization.
  if (relativePart.includes('%')) {
    return malformed('encoded-characters-not-allowed');
  }

  if (relativePart.includes('..')) {
    return malformed('path-traversal');
  }

  if (!relativePart.startsWith(SIGNED_MEDIA_PATH_PREFIX)) {
    return malformed('unexpected-path');
  }

  const firstQuestion = relativePart.indexOf('?');

  if (firstQuestion === -1) {
    return malformed('missing-query');
  }

  if (relativePart.indexOf('?', firstQuestion + 1) !== -1) {
    return malformed('unexpected-query-parameter');
  }

  const rawPath = relativePart.slice(0, firstQuestion);
  const rawQuery = relativePart.slice(firstQuestion + 1);

  if (!rawQuery) {
    return malformed('missing-query');
  }

  const mediaRef = rawPath.slice(SIGNED_MEDIA_PATH_PREFIX.length);

  if (!mediaRef || mediaRef.includes('/')) {
    return malformed('unexpected-path');
  }

  if (!MEDIA_REF_PATTERN.test(mediaRef)) {
    return malformed('invalid-media-ref');
  }

  // Strict query parsing: only `exp` and `sig`, no duplicates, no extras.
  const segments = rawQuery.split('&');
  let expRaw: string | null = null;
  let sigRaw: string | null = null;

  for (const segment of segments) {
    if (!segment) {
      return malformed('unexpected-query-parameter');
    }

    const eqIndex = segment.indexOf('=');

    if (eqIndex <= 0 || segment.indexOf('=', eqIndex + 1) !== -1) {
      return malformed('unexpected-query-parameter');
    }

    const key = segment.slice(0, eqIndex);
    const value = segment.slice(eqIndex + 1);

    if (key === 'exp') {
      if (expRaw !== null) {
        return malformed('duplicate-query-parameter');
      }

      expRaw = value;
    } else if (key === 'sig') {
      if (sigRaw !== null) {
        return malformed('duplicate-query-parameter');
      }

      sigRaw = value;
    } else {
      return malformed('unexpected-query-parameter');
    }
  }

  if (expRaw === null || sigRaw === null) {
    return malformed('missing-query');
  }

  if (!UNIX_SECONDS_PATTERN.test(expRaw)) {
    return malformed('invalid-expiry');
  }

  const expBigInt = BigInt(expRaw);

  if (expBigInt > INT64_MAX) {
    return malformed('invalid-expiry');
  }

  if (!HMAC_SHA256_HEX_PATTERN.test(sigRaw)) {
    return malformed('invalid-signature');
  }

  // Preserve the exact signed path & query verbatim.
  const resolvedUrl = `${trusted.origin}${relativePart}`;

  let verified: URL;

  try {
    verified = new URL(resolvedUrl);
  } catch {
    return malformed('ambiguous-url-normalization');
  }

  if (
    verified.protocol !== 'https:' ||
    verified.origin !== trusted.origin ||
    verified.username !== '' ||
    verified.password !== '' ||
    verified.hash !== '' ||
    verified.pathname !== rawPath ||
    verified.search !== `?${rawQuery}`
  ) {
    return malformed('ambiguous-url-normalization');
  }

  const nowUnixSeconds = BigInt(Math.floor(nowMs / 1000));
  const previewHint = inferMediaPreviewHint(mediaRef);
  const expiresAtUnixSeconds =
    expBigInt <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(expBigInt)
      : Number.MAX_SAFE_INTEGER;
  const expiresAt =
    expBigInt <= MAX_JS_DATE_UNIX_SECONDS
      ? new Date(Number(expBigInt) * 1000)
      : null;

  // Matches LocalMediaStorage.TryOpen (line 42): UtcNow.ToUnixTimeSeconds() > exp
  if (nowUnixSeconds > expBigInt) {
    return {
      ok: false,
      status: 'expired',
      url: null,
      mediaRef,
      previewHint,
      expiresAtUnixSeconds,
      expiresAt,
      remainingSeconds: 0,
      reason: 'media-url-expired',
      message: SAFE_EXPIRED_MESSAGE,
    };
  }

  const remainingBigInt = expBigInt - nowUnixSeconds;
  const remainingSeconds =
    remainingBigInt <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(remainingBigInt)
      : Number.MAX_SAFE_INTEGER;

  return {
    ok: true,
    status: 'valid',
    url: resolvedUrl,
    mediaRef,
    previewHint,
    expiresAtUnixSeconds,
    expiresAt,
    remainingSeconds,
    reason: null,
    message: null,
  };
}
