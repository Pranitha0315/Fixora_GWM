import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';

import { Login } from './login';
import { AuthService } from '../../../../core/auth/auth.service';
import type { AuthUser } from '../../../../core/models/auth-user.model';

describe('Login', () => {
  let component: Login;
  let fixture: ComponentFixture<Login>;
  let router: Router;

  const auth = {
    login: vi.fn<AuthService['login']>(),
    logout: vi.fn(),
  };

  const user: AuthUser = {
    id: 'test-manager-001',
    displayName: 'Test Manager',
    email: 'manager@example.test',
    roles: ['Manager'],
  };

  const fillValidForm = (): void => {
    component.loginForm.controls.email.setValue(
      'manager@example.test',
    );

    component.loginForm.controls.password.setValue(
      'test-password',
    );
  };

  beforeEach(async () => {
    auth.login.mockReset();
    auth.logout.mockReset();

    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: auth,
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);

    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(Login);
    component = fixture.componentInstance;

    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('LG-01 creates the login component', () => {
    expect(component).toBeTruthy();
  });

  it('LG-02 rejects an empty form', () => {
    component.onSubmit();

    expect(auth.login).not.toHaveBeenCalled();
    expect(component.loginForm.invalid).toBe(true);
  });

  it('LG-03 rejects an invalid email', () => {
    fillValidForm();

    component.loginForm.controls.email.setValue('invalid');

    component.onSubmit();

    expect(auth.login).not.toHaveBeenCalled();
  });

  it('LG-04 submits valid credentials', () => {
    fillValidForm();
    auth.login.mockReturnValue(of(user));

    component.onSubmit();

    expect(auth.login).toHaveBeenCalledWith({
      email: 'manager@example.test',
      password: 'test-password',
    });
  });

  it('LG-05 navigates to dashboard after login', () => {
    fillValidForm();
    auth.login.mockReturnValue(of(user));

    component.onSubmit();

    expect(router.navigate).toHaveBeenCalledWith([
      '/dashboard',
    ]);
  });

  it('LG-06 manages the loading state', () => {
    fillValidForm();

    const response = new Subject<AuthUser>();

    auth.login.mockReturnValue(response);

    component.onSubmit();

    expect(component.isLoading()).toBe(true);

    response.next(user);
    response.complete();

    expect(component.isLoading()).toBe(false);
  });

  it('LG-07 prevents duplicate login requests', () => {
    fillValidForm();

    const response = new Subject<AuthUser>();

    auth.login.mockReturnValue(response);

    component.onSubmit();
    component.onSubmit();

    expect(auth.login).toHaveBeenCalledTimes(1);

    response.complete();
  });

  it('LG-08 handles invalid credentials', () => {
    fillValidForm();

    auth.login.mockReturnValue(
      throwError(() => ({ status: 401 })),
    );

    component.onSubmit();

    expect(component.loginMessage()).toBe(
      'Invalid credentials or access not permitted.',
    );

    expect(router.navigate).not.toHaveBeenCalled();
    expect(component.isLoading()).toBe(false);
  });

  it('LG-09 handles unavailable backend', () => {
    fillValidForm();

    auth.login.mockReturnValue(
      throwError(() => ({ status: 0 })),
    );

    component.onSubmit();

    expect(component.loginMessage()).toBe(
      'Unable to connect to the server.',
    );
  });

  it('LG-10 clears password after successful login', () => {
    fillValidForm();

    auth.login.mockReturnValue(of(user));

    component.onSubmit();

    expect(component.loginForm.controls.password.value)
      .toBe('');

    expect(component.showPassword()).toBe(false);
  });

  it('LG-11 disables persistent login', () => {
    expect(
      component.loginForm.controls.rememberMe.disabled,
    ).toBe(true);
  });

  it('LG-12 clears session when navigation fails', async () => {
    fillValidForm();

    vi.mocked(router.navigate).mockResolvedValue(false);

    auth.login.mockReturnValue(of(user));

    component.onSubmit();

    await fixture.whenStable();

    expect(auth.logout).toHaveBeenCalled();

    expect(component.loginMessage()).toContain(
      'Unable to open the dashboard',
    );
  });
});
