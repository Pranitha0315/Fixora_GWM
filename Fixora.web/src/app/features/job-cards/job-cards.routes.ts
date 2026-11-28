import { Routes } from '@angular/router';

import { fixProofMutationCanDeactivateGuard } from '../fixproof-review/guards/fixproof-mutation-navigation.guard';
import { JobCardStateService } from './services/job-card-state.service';
import { WorkshopRealtimeCoordinatorService } from './services/workshop-realtime-coordinator.service';
import { WorkshopRealtimeService } from './services/workshop-realtime.service';

/**
 * Job Cards workspace child routes mounted under `/job-cards`.
 *
 * Route-ordering & scoping invariants:
 * - Static `'fixproof'` route MUST precede dynamic `':jobId'` so
 *   `/job-cards/fixproof` is never captured as a job card identifier.
 * - `JobCardStateService` is strictly feature/route-scoped (never root-scoped).
 * - `fixProofMutationCanDeactivateGuard` remains active across Job Cards routes.
 */
export const JOB_CARDS_ROUTES: Routes = [
  {
    path: '',
    title: 'FIXORA | Job Cards',
    providers: [JobCardStateService],
    canDeactivate: [fixProofMutationCanDeactivateGuard],
    loadComponent: () =>
      import('./pages/job-cards/job-cards').then((m) => m.JobCards),
  },
  {
    path: 'fixproof',
    loadChildren: () =>
      import('../fixproof-review/fixproof-review.routes').then(
        (m) => m.FIXPROOF_REVIEW_ROUTES,
      ),
  },
  {
    path: ':jobId',
    title: 'FIXORA | Job Card Detail',
    providers: [JobCardStateService],
    canDeactivate: [fixProofMutationCanDeactivateGuard],
    loadComponent: () =>
      import('./pages/job-card-detail/job-card-detail').then(
        (m) => m.JobCardDetail,
      ),
  },
];

/**
 * Lazy-loaded Job Cards workspace route boundary (K18-B / FE-03).
 *
 * Provides `WorkshopRealtimeService` and `WorkshopRealtimeCoordinatorService`
 * strictly inside the lazy `/job-cards` chunk so `@microsoft/signalr` is never
 * bundled into the initial application chunk, while preserving ONE shared
 * workspace-scoped realtime connection across `/job-cards`, `/job-cards/:jobId`,
 * and `/job-cards/fixproof`.
 */
export const JOB_CARDS_WORKSPACE_ROUTES: Routes = [
  {
    path: '',
    providers: [
      WorkshopRealtimeService,
      WorkshopRealtimeCoordinatorService,
    ],
    children: JOB_CARDS_ROUTES,
  },
];
