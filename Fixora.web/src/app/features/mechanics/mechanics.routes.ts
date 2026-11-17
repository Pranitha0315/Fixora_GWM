import { Routes } from '@angular/router';

export const MECHANICS_ROUTES: Routes = [
  {
    path: '',
    title: 'FIXORA | Mechanics',
    loadComponent: () =>
      import('./pages/mechanics/mechanics').then((m) => m.Mechanics),
  },
];
