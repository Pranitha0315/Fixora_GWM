import { Routes } from '@angular/router';

export const BOOKINGS_ROUTES: Routes = [
  {
    path: '',
    title: 'FIXORA | Bookings',
    loadComponent: () =>
      import('./pages/bookings/bookings').then((m) => m.Bookings),
  },
];
