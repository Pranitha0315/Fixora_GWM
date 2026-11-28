import { inject, InjectionToken } from '@angular/core';
import type { CanDeactivateFn } from '@angular/router';

import { isObservable, Observable } from 'rxjs';

import { SessionService } from '../../../core/auth/session.service';

import {
  FixProofNavigationProtectionService,
  type FixProofNavigationEvaluation,
  type FixProofNavigationProtectionSnapshot,
} from '../services/fixproof-navigation-protection.service';

/**
 * Context passed to a configured `FIXPROOF_NAVIGATION_CONFIRMATION` handler.
 * Contains only non-sensitive protection metadata and fixed safe wording.
 */
export interface FixProofNavigationConfirmationContext {
  readonly snapshot: FixProofNavigationProtectionSnapshot;
  readonly targetUrl: string | null;
  readonly message: string;
}

/**
 * Injectable confirmation callback used by `fixProofMutationCanDeactivateGuard`
 * when leaving a route with active/unresolved FixProof mutation risk.
 *
 * Returning `true` authorizes deactivation ONLY if the session and set of
 * protected operations have not introduced a new/different protected operation
 * while confirmation was pending. Any other value, thrown error, rejected
 * promise, observable error, or empty observable completion fails closed
 * (`false`).
 */
export type FixProofNavigationConfirmationHandler = (
  context: FixProofNavigationConfirmationContext,
) => boolean | Promise<boolean> | Observable<boolean>;

/**
 * Injectable confirmation contract for `fixProofMutationCanDeactivateGuard`.
 * Defaults to `null` (fail-closed: navigation is blocked unless an explicit
 * UI confirmation handler is provided and the manager confirms leaving).
 */
export const FIXPROOF_NAVIGATION_CONFIRMATION =
  new InjectionToken<FixProofNavigationConfirmationHandler | null>(
    'FIXORA_FIXPROOF_NAVIGATION_CONFIRMATION',
    {
      providedIn: 'root',
      factory: () => null,
    },
  );

const DEFAULT_CONFIRMATION_MESSAGE =
  'A FixProof action is still in progress or unresolved. Leaving this page does not establish whether the server-side mutation executed and does not roll back an already executed mutation.';

function isLoginRouteUrl(url: string | null | undefined): boolean {
  if (typeof url !== 'string' || !url.trim()) {
    return false;
  }

  const pathname = url.trim().split(/[?#]/, 1)[0].replace(/\/+$/, '');
  return pathname === '/login';
}

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

function evaluateAfterConfirmation(
  confirmed: unknown,
  before: FixProofNavigationEvaluation,
  nextUrl: string | undefined,
  sessionService: SessionService,
  protection: FixProofNavigationProtectionService,
): boolean {
  if (!sessionService.isAuthenticated()) {
    return true;
  }

  const after = protection.evaluateProtection();

  if (
    !after.snapshot.protected ||
    (isLoginRouteUrl(nextUrl) && after.snapshot.allowReauthenticationNavigation)
  ) {
    return true;
  }

  if (confirmed !== true) {
    return false;
  }

  if (before.session === null || after.session !== before.session) {
    return false;
  }

  for (const key of after.protectionKeys) {
    if (!before.protectionKeys.has(key)) {
      return false;
    }
  }

  return true;
}

/**
 * Standalone Angular `CanDeactivateFn` protecting routes that host FixProof
 * mutation workflows against accidental in-app navigation while a mutation is
 * in flight, unresolved, awaiting acknowledgement, or has a pending detached
 * transport.
 *
 * Security & lifecycle invariants:
 * - Never traps an unauthenticated user inside a protected route (preserves
 *   `Topbar.logout()` and expired-session redirects to `/login`).
 * - Allows legitimate re-authentication navigation to `/login` after session
 *   revocation or access loss.
 * - Fails closed (`false`) when protection is required and no confirmation
 *   handler is configured, or on errors / empty observable completion.
 * - Prevents overlapping confirmation prompts via root-scoped confirmation
 *   locking and releases ownership cleanly on completion or router
 *   cancellation/supersession.
 * - Re-evaluates session and protection state after async confirmation and
 *   rejects stale confirmations if a new/different protected operation began.
 * - Never sends or retries any mutation and never weakens authentication or
 *   role guards.
 */
export const fixProofMutationCanDeactivateGuard: CanDeactivateFn<unknown> = (
  _component,
  _currentRoute,
  _currentState,
  nextState,
) => {
  const sessionService = inject(SessionService);
  const protection = inject(FixProofNavigationProtectionService);
  const confirmHandler = inject(FIXPROOF_NAVIGATION_CONFIRMATION, {
    optional: true,
  });

  // 1. Never trap an unauthenticated user (preserves logout & expiry redirects).
  if (!sessionService.isAuthenticated()) {
    return true;
  }

  const nextUrl = nextState?.url;
  const before = protection.evaluateProtection();

  // 2. Allow immediately when no applicable unresolved mutation risk exists.
  if (!before.snapshot.protected) {
    return true;
  }

  // 3. Preserve legitimate re-authentication to /login after access loss / 401.
  if (
    isLoginRouteUrl(nextUrl) &&
    before.snapshot.allowReauthenticationNavigation
  ) {
    return true;
  }

  // 4. Fail closed when no confirmation handler is configured.
  if (typeof confirmHandler !== 'function') {
    return false;
  }

  // 5. Prevent overlapping confirmation prompts.
  const lockToken = protection.tryAcquireConfirmationLock();

  if (lockToken === null) {
    return false;
  }

  const context: FixProofNavigationConfirmationContext = Object.freeze({
    snapshot: before.snapshot,
    targetUrl: nextUrl ?? null,
    message: before.snapshot.message ?? DEFAULT_CONFIRMATION_MESSAGE,
  });

  let rawResult: boolean | Promise<boolean> | Observable<boolean>;

  try {
    rawResult = confirmHandler(context);
  } catch {
    protection.releaseConfirmationLock(lockToken);
    return false;
  }

  if (typeof rawResult === 'boolean') {
    try {
      return evaluateAfterConfirmation(
        rawResult,
        before,
        nextUrl,
        sessionService,
        protection,
      );
    } finally {
      protection.releaseConfirmationLock(lockToken);
    }
  }

  if (isObservable(rawResult)) {
    return new Observable<boolean>(subscriber => {
      let settled = false;
      let released = false;

      const releaseOnce = () => {
        if (!released) {
          released = true;
          protection.releaseConfirmationLock(lockToken);
        }
      };

      const finish = (decision: boolean) => {
        if (settled) {
          return;
        }

        settled = true;
        releaseOnce();
        subscriber.next(decision);
        subscriber.complete();
      };

      const innerSubscription = rawResult.subscribe({
        next: value => {
          finish(
            evaluateAfterConfirmation(
              value,
              before,
              nextUrl,
              sessionService,
              protection,
            ),
          );
        },
        error: () => {
          finish(
            evaluateAfterConfirmation(
              false,
              before,
              nextUrl,
              sessionService,
              protection,
            ),
          );
        },
        complete: () => {
          // Empty observable completion fails closed when still protected.
          finish(
            evaluateAfterConfirmation(
              false,
              before,
              nextUrl,
              sessionService,
              protection,
            ),
          );
        },
      });

      return () => {
        settled = true;
        innerSubscription.unsubscribe();
        releaseOnce();
      };
    });
  }

  if (isPromiseLike<boolean>(rawResult)) {
    return new Observable<boolean>(subscriber => {
      let active = true;
      let released = false;

      const releaseOnce = () => {
        if (!released) {
          released = true;
          protection.releaseConfirmationLock(lockToken);
        }
      };

      rawResult.then(
        value => {
          if (!active) {
            return;
          }

          active = false;
          releaseOnce();
          subscriber.next(
            evaluateAfterConfirmation(
              value,
              before,
              nextUrl,
              sessionService,
              protection,
            ),
          );
          subscriber.complete();
        },
        () => {
          if (!active) {
            return;
          }

          active = false;
          releaseOnce();
          subscriber.next(
            evaluateAfterConfirmation(
              false,
              before,
              nextUrl,
              sessionService,
              protection,
            ),
          );
          subscriber.complete();
        },
      );

      return () => {
        active = false;
        releaseOnce();
      };
    });
  }

  // Non-boolean, non-Promise, non-Observable return value fails closed.
  protection.releaseConfirmationLock(lockToken);
  return false;
};
