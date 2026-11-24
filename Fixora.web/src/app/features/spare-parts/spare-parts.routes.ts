import { Routes } from '@angular/router';

export const SPARE_PARTS_ROUTES: Routes = [
  {
    path: '',
    title: 'FIXORA | Spare Parts',
    loadComponent: () =>
      import('./pages/spare-parts/spare-parts').then((m) => m.SpareParts),
  },
];
