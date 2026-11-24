import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { throwError } from 'rxjs';
import { vi } from 'vitest';

import { ManagerShell } from './manager-shell';
import { AUTH_GATEWAY } from '../../core/auth/auth-gateway';
import type { AuthGateway } from '../../core/auth/auth-gateway';

describe('ManagerShell', () => {
  let component: ManagerShell;
  let fixture: ComponentFixture<ManagerShell>;

  const gateway: AuthGateway = {
    login: vi.fn(() =>
      throwError(() =>
        new Error('Unexpected login request in shell test'),
      ),
    ),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManagerShell],
      providers: [
        provideRouter([]),
        {
          provide: AUTH_GATEWAY,
          useValue: gateway,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ManagerShell);
    component = fixture.componentInstance;

    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
    expect(gateway.login).not.toHaveBeenCalled();
  });
});
