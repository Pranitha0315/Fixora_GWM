import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { Sidebar } from '../sidebar/sidebar';
import { Topbar } from '../topbar/topbar';

@Component({
  selector: 'app-manager-shell',
  standalone: true,
  imports: [RouterOutlet, Sidebar, Topbar],
  templateUrl: './manager-shell.html',
  styleUrl: './manager-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManagerShell {}
