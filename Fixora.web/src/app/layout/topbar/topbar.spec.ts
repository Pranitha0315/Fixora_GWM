import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { Topbar } from './topbar';
import { AuthService } from '../../core/auth/auth.service';
import type { AuthUser } from '../../core/models/auth-user.model';

describe('Topbar', () => {
  let fixture: ComponentFixture<Topbar>;
  let component: Topbar;
  let router: Router;

  const manager: AuthUser = {
    id: 'test-manager-001',
    displayName: 'Test Manager',
    email: 'manager@example.test',
    roles: ['Manager'],
  };

  const auth = {
    getCurrentUser: vi.fn<AuthService['getCurrentUser']>(),
    logout: vi.fn(),
  };

  beforeEach(async () => {
    auth.getCurrentUser.mockReset();
    auth.logout.mockReset();

    auth.getCurrentUser.mockReturnValue(manager);

    await TestBed.configureTestingModule({
      imports: [Topbar],
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

    fixture = TestBed.createComponent(Topbar);
    component = fixture.componentInstance;

    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('TB-01 creates the topbar', () => {
    expect(component).toBeTruthy();
  });

  it('TB-02 displays the workspace title', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(
      element.querySelector('.workspace-title')?.textContent,
    ).toContain('Workshop Management');
  });

  it('TB-03 provides notifications navigation', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(
      element.querySelector('a[href="/notifications"]'),
    ).toBeTruthy();
  });

  it('TB-04 displays the authenticated manager name', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(
      element.querySelector('.account-name')?.textContent,
    ).toContain('Test Manager');
  });

  it('TB-05 displays the manager role', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(
      element.querySelector('.account-role')?.textContent,
    ).toContain('Manager');
  });

  it('TB-06 generates the profile avatar initial', () => {
    expect(component.accountInitial).toBe('T');

    const element = fixture.nativeElement as HTMLElement;

    expect(
      element.querySelector('.account-avatar')?.textContent,
    ).toContain('T');
  });

  it('TB-07 supports an owner profile', () => {
    auth.getCurrentUser.mockReturnValue({
      ...manager,
      displayName: 'Test Owner',
      roles: ['Owner'],
    });

    expect(component.accountName).toBe('Test Owner');
    expect(component.accountRole).toBe('Owner');
  });

  it('TB-08 handles a missing authenticated user', () => {
    auth.getCurrentUser.mockReturnValue(null);

    expect(component.accountName).toBe('Guest');
    expect(component.accountRole).toBe('Signed out');
    expect(component.accountInitial).toBe('G');
  });

  it('TB-09 provides an accessible logout button', () => {
    const element = fixture.nativeElement as HTMLElement;

    const button = element.querySelector<HTMLButtonElement>(
      '.logout-button',
    );

    expect(button).not.toBeNull();
    expect(button?.getAttribute('aria-label')).toBe('Sign out');
    expect(button?.disabled).toBe(false);
  });

  it('TB-10 requests local session clearance', async () => {
    await component.logout();

    expect(auth.logout).toHaveBeenCalledTimes(1);
  });

  it('TB-11 redirects to login after logout', async () => {
    await component.logout();

    expect(router.navigate).toHaveBeenCalledWith(
      ['/login'],
      { replaceUrl: true },
    );

    expect(component.isLoggingOut()).toBe(false);
  });

  it('TB-12 prevents duplicate logout requests', async () => {
    let completeNavigation!: (value: boolean) => void;

    const navigation = new Promise<boolean>((resolve) => {
      completeNavigation = resolve;
    });

    vi.mocked(router.navigate).mockReturnValue(navigation);

    const first = component.logout();

    expect(component.isLoggingOut()).toBe(true);

    await component.logout();

    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledTimes(1);

    completeNavigation(true);

    await first;

    expect(component.isLoggingOut()).toBe(false);
  });

  it('TB-13 handles failed logout navigation', async () => {
    vi.mocked(router.navigate).mockResolvedValue(false);

    await component.logout();

    expect(auth.logout).toHaveBeenCalledTimes(1);

    expect(component.logoutError()).toBe(
      'Signed out. Please reopen the login page.',
    );

    expect(component.isLoggingOut()).toBe(false);
  });

  it('TB-14 handles navigation exceptions', async () => {
    vi.mocked(router.navigate).mockRejectedValue(
      new Error('Navigation failed'),
    );

    await component.logout();

    expect(auth.logout).toHaveBeenCalledTimes(1);

    expect(component.logoutError()).toContain(
      'Signed out',
    );

    expect(component.isLoggingOut()).toBe(false);
  });

  it('TB-15 triggers logout through the actual button', async () => {
    const element = fixture.nativeElement as HTMLElement;

    const button = element.querySelector<HTMLButtonElement>(
      '.logout-button',
    );

    expect(button).not.toBeNull();

    button!.click();

    await fixture.whenStable();

    expect(auth.logout).toHaveBeenCalledTimes(1);

    expect(router.navigate).toHaveBeenCalledWith(
      ['/login'],
      { replaceUrl: true },
    );
  });
});
