import { Routes } from '@angular/router';

import {
  authGuard,
  authChildGuard,
} from './core/guards/auth.guard';

import {
  managerRoleGuard,
  managerRoleChildGuard,
} from './core/guards/role.guard';


export const routes: Routes = [
  {
    path: 'login',
    loadChildren: () =>
      import('./features/authentication/authentication.routes')
        .then((m) => m.AUTHENTICATION_ROUTES),
  },
  {
    path: '',
    canActivate: [authGuard, managerRoleGuard],
    canActivateChild: [authChildGuard, managerRoleChildGuard],
    loadComponent: () =>
      import('./layout/manager-shell/manager-shell')
        .then((m) => m.ManagerShell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
      {
        path: 'dashboard',
        loadChildren: () =>
          import('./features/dashboard/dashboard.routes')
            .then((m) => m.DASHBOARD_ROUTES),
      },
      {
        path: 'bookings',
        loadChildren: () =>
          import('./features/bookings/bookings.routes')
            .then((m) => m.BOOKINGS_ROUTES),
      },
      {
        path: 'vehicles',
        loadChildren: () =>
          import('./features/vehicles/vehicles.routes')
            .then((m) => m.VEHICLES_ROUTES),
      },
      {
        path: 'job-cards',
        loadChildren: () =>
          import('./features/job-cards/job-cards.routes')
            .then((m) => m.JOB_CARDS_ROUTES),
      },
      {
        path: 'mechanics',
        loadChildren: () =>
          import('./features/mechanics/mechanics.routes')
            .then((m) => m.MECHANICS_ROUTES),
      },
      {
        path: 'spare-parts',
        loadChildren: () =>
          import('./features/spare-parts/spare-parts.routes')
            .then((m) => m.SPARE_PARTS_ROUTES),
      },
      {
        path: 'inventory',
        loadChildren: () =>
          import('./features/inventory/inventory.routes')
            .then((m) => m.INVENTORY_ROUTES),
      },
      {
        path: 'billing',
        loadChildren: () =>
          import('./features/billing/billing.routes')
            .then((m) => m.BILLING_ROUTES),
      },
      {
        path: 'reports',
        loadChildren: () =>
          import('./features/reports/reports.routes')
            .then((m) => m.REPORTS_ROUTES),
      },
      {
        path: 'notifications',
        loadChildren: () =>
          import('./features/notifications/notifications.routes')
            .then((m) => m.NOTIFICATIONS_ROUTES),
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
