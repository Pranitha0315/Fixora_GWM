import { Component, signal } from '@angular/core';

import {
  ComponentFixture,
  TestBed,
} from '@angular/core/testing';

import {
  FormControl,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { Input } from './input';

@Component({
  standalone: true,
  imports: [Input, ReactiveFormsModule],
  template: `
    <fx-input
      controlId="email"
      label="Email address"
      type="email"
      placeholder="Enter email"
      autocomplete="email"
      [required]="true"
      [readonly]="readOnly()"
      [formControl]="control"
      [error]="error()"
      helperText="Registered email address"
    />
  `,
})
class InputTestHost {
  readonly control = new FormControl(
    '',
    {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    },
  );

  readonly error = signal('');
  readonly readOnly = signal(false);
}

describe('Input', () => {
  let fixture: ComponentFixture<InputTestHost>;
  let host: InputTestHost;

  function field(): HTMLInputElement {
    return fixture.nativeElement.querySelector('input');
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InputTestHost],
    }).compileComponents();

    fixture = TestBed.createComponent(InputTestHost);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the input', () => {
    expect(field()).not.toBeNull();
  });

  it('should associate the label with its input', () => {
    const label: HTMLLabelElement =
      fixture.nativeElement.querySelector('label');

    expect(label.htmlFor).toBe('email');
    expect(field().id).toBe('email');
  });

  it('should configure native input attributes', () => {
    expect(field().type).toBe('email');
    expect(field().placeholder).toBe('Enter email');
    expect(field().autocomplete).toBe('email');
    expect(field().required).toBe(true);
  });

  it('should display a programmatically assigned value', () => {
    host.control.setValue('manager@example.com');
    fixture.detectChanges();

    expect(field().value).toBe('manager@example.com');
  });

  it('should update the Angular form on input', () => {
    field().value = 'owner@example.com';
    field().dispatchEvent(new Event('input', {
      bubbles: true,
    }));

    expect(host.control.value).toBe('owner@example.com');
  });

  it('should mark the form control as touched on blur', () => {
    field().dispatchEvent(new Event('blur'));

    expect(host.control.touched).toBe(true);
  });

  it('should disable the native input when the form is disabled', () => {
    host.control.disable();
    fixture.detectChanges();

    expect(field().disabled).toBe(true);
  });

  it('should enable the input when the form is enabled', () => {
    host.control.disable();
    host.control.enable();
    fixture.detectChanges();

    expect(field().disabled).toBe(false);
  });

  it('should support form reset', () => {
    host.control.setValue('manager@example.com');
    host.control.reset();
    fixture.detectChanges();

    expect(field().value).toBe('');
  });

  it('should support required field validation', () => {
    expect(host.control.hasError('required')).toBe(true);

    host.control.setValue('manager@example.com');

    expect(host.control.valid).toBe(true);
  });

  it('should support email validation', () => {
    host.control.setValue('invalid-email');

    expect(host.control.hasError('email')).toBe(true);
  });

  it('should render accessible helper text', () => {
    expect(field().getAttribute('aria-describedby'))
      .toBe('email-helper');

    expect(fixture.nativeElement.textContent)
      .toContain('Registered email address');
  });

  it('should render accessible error text', () => {
    host.error.set('Email is required');
    fixture.detectChanges();

    expect(field().getAttribute('aria-invalid')).toBe('true');

    expect(field().getAttribute('aria-describedby'))
      .toBe('email-error');

    expect(fixture.nativeElement.textContent)
      .toContain('Email is required');
  });

  it('should support readonly state', () => {
    host.readOnly.set(true);
    fixture.detectChanges();

    expect(field().readOnly).toBe(true);
  });
});