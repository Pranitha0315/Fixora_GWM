import { Routes } from '@angular/router';

export const JOB_CARDS_ROUTES: Routes = [
  {
    path: '',
    title: 'FIXORA | Job Cards',
    loadComponent: () =>
      import('./pages/job-cards/job-cards').then((m) => m.JobCards),
  },
];
