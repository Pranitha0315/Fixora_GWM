import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

interface NavigationItem {
  readonly label: string;
  readonly route: string;
  readonly icon: string;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sidebar {
  protected readonly navigationItems: readonly NavigationItem[] = [
    { label: 'Home', route: '/dashboard', icon: '01' },
    { label: 'Bookings', route: '/bookings', icon: '02' },
    { label: 'Vehicles', route: '/vehicles', icon: '03' },
    { label: 'Job Cards', route: '/job-cards', icon: '04' },
    { label: 'Mechanics', route: '/mechanics', icon: '05' },
    { label: 'Spare Parts', route: '/spare-parts', icon: '06' },
    { label: 'Inventory', route: '/inventory', icon: '07' },
    { label: 'Billing', route: '/billing', icon: '08' },
    { label: 'Reports', route: '/reports', icon: '09' },
    { label: 'Notifications', route: '/notifications', icon: '10' },
  ];
}
