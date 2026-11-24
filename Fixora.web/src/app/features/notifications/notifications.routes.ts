import { Routes } from '@angular/router';

export const NOTIFICATIONS_ROUTES: Routes = [
  {
    path: '',
    title: 'FIXORA | Notifications',
    loadComponent: () =>
      import('./pages/notifications/notifications').then((m) => m.Notifications),
  },
];
