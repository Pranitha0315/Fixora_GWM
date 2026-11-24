import { Injectable, signal } from '@angular/core';

export type AppTheme = 'light' | 'dark';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly storageKey = 'fixora-manager-theme';

  private readonly currentTheme = signal<AppTheme>(
    this.readStoredTheme()
  );

  readonly theme = this.currentTheme.asReadonly();

  readonly isDarkMode = () => this.theme() === 'dark';

  constructor() {
    this.applyTheme(this.theme());
  }

  setTheme(theme: AppTheme): void {
    this.currentTheme.set(theme);
    this.applyTheme(theme);

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.storageKey, theme);
      }
    } catch {
      // Storage may be unavailable in restricted browsers.
    }
  }

  private readStoredTheme(): AppTheme {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(this.storageKey);

        if (stored === 'dark' || stored === 'light') {
          return stored;
        }
      }
    } catch {
      // Use light theme when storage is unavailable.
    }

    return 'light';
  }

  private applyTheme(theme: AppTheme): void {
    if (typeof document === 'undefined') {
      return;
    }

    document.documentElement.classList.toggle(
      'dark-theme',
      theme === 'dark'
    );

    document.documentElement.style.colorScheme = theme;
  }
}