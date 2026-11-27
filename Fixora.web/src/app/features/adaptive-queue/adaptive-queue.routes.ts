import { Routes } from '@angular/router';

export const ADAPTIVE_QUEUE_ROUTES: Routes = [
  {
    path: '',
    title: 'FIXORA | Adaptive Queue',
    loadComponent: () =>
      import('./pages/adaptive-queue/adaptive-queue')
        .then((m) => m.AdaptiveQueuePage),
  },
];
