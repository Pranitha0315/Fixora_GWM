import { inject, Injectable, InjectionToken } from '@angular/core';

import { API_CONFIG } from '../../../core/config/api.config';

import {
  resolveSignedMediaUrl,
  resolveTrustedApiOrigin,
} from '../utils/signed-media-url.util';

import type {
  SignedMediaResolutionResult,
} from '../utils/signed-media-url.util';

/**
 * Deterministic clock token (epoch milliseconds) for signed media
 * expiry checks. Override in tests to avoid wall-clock flakiness.
 */
export const SIGNED_MEDIA_CLOCK = new InjectionToken<() => number>(
  'FIXORA_SIGNED_MEDIA_CLOCK',
  {
    providedIn: 'root',
    factory: () => () => Date.now(),
  },
);

/**
 * Resolves and validates backend-signed inspection evidence URLs against
 * the configured trusted HTTPS API origin without weakening ApiUrlService.
 *
 * - Performs structural, origin, and expiry checks only.
 * - Never appends bearer tokens or logs signed URLs.
 * - Never fetches media or auto-refreshes expired links; callers refresh
 *   evidence links by reloading authoritative JobDetailDto over HTTP.
 */
@Injectable({
  providedIn: 'root',
})
export class SignedMediaUrlService {
  private readonly config = inject(API_CONFIG);
  private readonly clock = inject(SIGNED_MEDIA_CLOCK);

  /** True when API_CONFIG.baseUrl is a valid trusted HTTPS origin. */
  isOriginConfigured(): boolean {
    return resolveTrustedApiOrigin(this.config.baseUrl).ok;
  }

  /** Resolves one backend-signed media URL using the injected or explicit clock. */
  resolve(
    rawUrl: unknown,
    nowMs?: number,
  ): SignedMediaResolutionResult {
    const timestampMs = nowMs === undefined ? this.clock() : nowMs;

    return resolveSignedMediaUrl(
      rawUrl,
      this.config.baseUrl,
      timestampMs,
    );
  }

  /** Resolves a list of backend-signed media URLs in order using a single clock reading. */
  resolveAll(
    rawUrls: readonly unknown[],
    nowMs?: number,
  ): readonly SignedMediaResolutionResult[] {
    const timestampMs = nowMs === undefined ? this.clock() : nowMs;

    return rawUrls.map((rawUrl) =>
      resolveSignedMediaUrl(rawUrl, this.config.baseUrl, timestampMs),
    );
  }
}
