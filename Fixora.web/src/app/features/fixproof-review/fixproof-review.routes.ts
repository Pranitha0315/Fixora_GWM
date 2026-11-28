import { inject } from '@angular/core';
import type { Routes } from '@angular/router';

import {
  FIXPROOF_NAVIGATION_CONFIRMATION,
  fixProofMutationCanDeactivateGuard,
  type FixProofNavigationConfirmationContext,
} from './guards/fixproof-mutation-navigation.guard';
import { FixProofNavigationConfirmationService } from './services/fixproof-navigation-confirmation.service';

/**
 * Lazy-loaded FixProof Oversight routes mounted under `/job-cards/fixproof`.
 *
 * Security & lifecycle invariants:
 * - `FixProofStateService` and `FixProofMutationStateService` are strictly
 *   component-scoped on `FixProofOversight` (never root-scoped and never
 *   retained in a long-lived route EnvironmentInjector), so `ngOnDestroy()`,
 *   protected state teardown, navigation-protection unregistration, and
 *   unresolved session notice handoff execute reliably on every route exit.
 * - `FixProofNavigationConfirmationService` is route-scoped so
 *   `fixProofMutationCanDeactivateGuard` (via `FIXPROOF_NAVIGATION_CONFIRMATION`)
 *   and `FixProofOversight`'s `<fx-confirmation-dialog>` share the same host.
 */
export const FIXPROOF_REVIEW_ROUTES: Routes = [
  {
    path: '',
    title: 'FIXORA | FixProof Oversight',
    providers: [
      FixProofNavigationConfirmationService,
      {
        provide: FIXPROOF_NAVIGATION_CONFIRMATION,
        useFactory: () => {
          const dialog = inject(FixProofNavigationConfirmationService);
          return (context: FixProofNavigationConfirmationContext) =>
            dialog.requestConfirmation(context);
        },
      },
    ],
    canDeactivate: [fixProofMutationCanDeactivateGuard],
    loadComponent: () =>
      import('./pages/fixproof-oversight/fixproof-oversight').then(
        m => m.FixProofOversight,
      ),
  },
];
