import { Injectable, signal } from '@angular/core';
import type { OnDestroy, Signal } from '@angular/core';

import { Observable } from 'rxjs';

import type { FixProofNavigationConfirmationContext } from '../guards/fixproof-mutation-navigation.guard';

export interface FixProofPendingNavigationConfirmation {
  readonly context: FixProofNavigationConfirmationContext;
}

/**
 * Feature-scoped bridge connecting `fixProofMutationCanDeactivateGuard`
 * (via `FIXPROOF_NAVIGATION_CONFIRMATION`) to the shared
 * `<fx-confirmation-dialog>` hosted by `FixProofOversight`.
 *
 * Security & lifecycle invariants:
 * - Feature-scoped (`@Injectable()`, never `providedIn: 'root'`).
 * - Fails closed (`false`) if no dialog host is currently mounted, if a
 *   confirmation prompt is already open, if the router cancels/supersedes
 *   navigation, or if the service is destroyed.
 * - Never writes to browser storage, never logs sensitive data, and never
 *   dispatches or retries HTTP requests.
 */
@Injectable()
export class FixProofNavigationConfirmationService implements OnDestroy {
  private readonly pendingState =
    signal<FixProofPendingNavigationConfirmation | null>(null);

  private activeHostCount = 0;
  private activeResolve: ((confirmed: boolean) => void) | null = null;
  private destroyed = false;

  readonly pendingRequest: Signal<FixProofPendingNavigationConfirmation | null> =
    this.pendingState.asReadonly();

  /**
   * Registers a mounted component host rendering `<fx-confirmation-dialog>`.
   * Returns an idempotent cleanup callback to invoke on component teardown.
   */
  registerHost(): () => void {
    if (this.destroyed) {
      return () => undefined;
    }

    this.activeHostCount += 1;
    let released = false;

    return () => {
      if (released) {
        return;
      }

      released = true;
      this.activeHostCount = Math.max(0, this.activeHostCount - 1);

      if (this.activeHostCount === 0) {
        this.settle(false);
      }
    };
  }

  /**
   * Invoked by `FIXPROOF_NAVIGATION_CONFIRMATION` when the router attempts
   * to deactivate a protected FixProof route.
   */
  requestConfirmation(
    context: FixProofNavigationConfirmationContext,
  ): boolean | Observable<boolean> {
    if (
      this.destroyed ||
      this.activeHostCount === 0 ||
      this.activeResolve !== null
    ) {
      return false;
    }

    return new Observable<boolean>(subscriber => {
      let settled = false;

      const finish = (confirmed: boolean): void => {
        if (settled) {
          return;
        }

        settled = true;

        if (this.activeResolve === finish) {
          this.activeResolve = null;
        }

        this.pendingState.set(null);
        subscriber.next(confirmed);
        subscriber.complete();
      };

      this.activeResolve = finish;
      this.pendingState.set(Object.freeze({ context }));

      return () => {
        if (!settled) {
          settled = true;

          if (this.activeResolve === finish) {
            this.activeResolve = null;
          }

          this.pendingState.set(null);
        }
      };
    });
  }

  /** Called when the manager explicitly confirms leaving the page. */
  confirm(): void {
    this.settle(true);
  }

  /** Called when the manager declines leaving or closes the dialog. */
  cancel(): void {
    this.settle(false);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.activeHostCount = 0;
    this.settle(false);
  }

  private settle(confirmed: boolean): void {
    const resolve = this.activeResolve;
    this.activeResolve = null;
    this.pendingState.set(null);

    if (resolve !== null) {
      resolve(confirmed);
    }
  }
}
