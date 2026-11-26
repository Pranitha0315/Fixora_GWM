import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';

import { Router, RouterLink } from '@angular/router';

import { ThemeService } from '../../core/services/theme.service';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './topbar.html',
  styleUrl: './topbar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Topbar {
  private readonly themeService = inject(ThemeService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly isDarkMode = this.themeService.isDarkMode;
  readonly isLoggingOut = signal(false);
  readonly logoutError = signal('');

  get accountName(): string {
    return this.authService.getCurrentUser()?.displayName
      ?? 'Guest';
  }

  get accountRole(): string {
    return this.authService.getCurrentUser()?.roles.join(', ')
      || 'Signed out';
  }

  get accountInitial(): string {
    return this.accountName.trim().charAt(0).toUpperCase()
      || '?';
  }

  toggleTheme(): void {
    this.themeService.setTheme(
      this.isDarkMode() ? 'light' : 'dark',
    );
  }

  async logout(): Promise<void> {
    if (this.isLoggingOut()) {
      return;
    }

    this.isLoggingOut.set(true);
    this.logoutError.set('');

    this.authService.logout();

    try {
      const navigated = await this.router.navigate(
        ['/login'],
        { replaceUrl: true },
      );

      if (!navigated) {
        this.logoutError.set(
          'Signed out. Please reopen the login page.',
        );
      }
    } catch {
      this.logoutError.set(
        'Signed out. Please reopen the login page.',
      );
    } finally {
      this.isLoggingOut.set(false);
    }
  }
}
