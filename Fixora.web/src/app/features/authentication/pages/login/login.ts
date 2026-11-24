import {
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';

import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';

import { ThemeService } from '../../../../core/services/theme.service';
import { AuthService } from '../../../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  readonly showPassword = signal(false);
  readonly submitted = signal(false);
  readonly loginMessage = signal('');
  readonly isLoading = signal(false);

  private readonly themeService = inject(ThemeService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly isDarkMode = this.themeService.isDarkMode;

  readonly loginForm = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    rememberMe: new FormControl(
      { value: false, disabled: true },
      { nonNullable: true },
    ),
  });

  togglePassword(): void {
    this.showPassword.update((visible) => !visible);
  }

  setTheme(dark: boolean): void {
    this.themeService.setTheme(dark ? 'dark' : 'light');
  }

  onSubmit(): void {
    if (this.isLoading()) {
      return;
    }

    this.submitted.set(true);
    this.loginMessage.set('');

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const { email, password } = this.loginForm.getRawValue();

    this.isLoading.set(true);

    this.authService.login({ email, password }).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.isLoading.set(false)),
    ).subscribe({
      next: () => {
        this.loginForm.controls.password.reset();
        this.showPassword.set(false);

        void this.router.navigate(['/dashboard']).then(
          (navigated) => {
            if (!navigated) {
              this.authService.logout();
              this.loginMessage.set(
                'Unable to open the dashboard. Please sign in again.',
              );
            }
          },
          () => {
            this.authService.logout();
            this.loginMessage.set(
              'Unable to open the dashboard. Please sign in again.',
            );
          },
        );
      },
      error: (error: unknown) => {
        this.loginForm.controls.password.reset();
        this.showPassword.set(false);
        this.loginMessage.set(this.getLoginError(error));
      },
    });
  }

  private getLoginError(error: unknown): string {
    const status =
      typeof error === 'object' &&
      error !== null &&
      'status' in error
        ? error.status
        : undefined;

    switch (status) {
      case 0:
        return 'Unable to connect to the server.';
      case 400:
      case 401:
      case 403:
        return 'Invalid credentials or access not permitted.';
      case 429:
        return 'Too many attempts. Please try again later.';
      default:
        return 'Unable to sign in. Please try again.';
    }
  }
}
