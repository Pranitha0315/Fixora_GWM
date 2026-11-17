import { Routes } from '@angular/router';

export const AUTHENTICATION_ROUTES: Routes = [
  {
    path: '',
    title: 'FIXORA | Login',
    loadComponent: () =>
      import('./pages/login/login').then((m) => m.Login),
  },
];
