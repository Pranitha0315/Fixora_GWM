import { Routes } from '@angular/router';

export const VEHICLES_ROUTES: Routes = [
  {
    path: '',
    title: 'FIXORA | Vehicles',
    loadComponent: () =>
      import('./pages/vehicles/vehicles').then((m) => m.Vehicles),
  },
];
