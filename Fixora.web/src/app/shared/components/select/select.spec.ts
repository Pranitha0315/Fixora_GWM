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

import { Select } from './select';
import type { SelectOption } from './select';

@Component({
  standalone: true,
  imports: [Select, ReactiveFormsModule],
  template: `
    <fx-select
      controlId="service"
      label="Service type"
      placeholder="Select service"
      [options]="options"
      [required]="true"
      [formControl]="control"
      [error]="error()"
      helperText="Choose a workshop service"
    />
  `,
})
class SelectTestHost {
  readonly control = new FormControl(
    '',
    {
      nonNullable: true,
      validators: [Validators.required],
    },
  );

  readonly options: readonly SelectOption[] = [
    { value: 'oil', label: 'Oil Change' },
    { value: 'general', label: 'General Service' },
    {
      value: 'engine',
      label: 'Engine Repair',
      disabled: true,
    },
  ];

  readonly error = signal('');
}

describe('Select', () => {
  let fixture: ComponentFixture<SelectTestHost>;
  let host: SelectTestHost;

  function field(): HTMLSelectElement {
    return fixture.nativeElement.querySelector('select');
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SelectTestHost],
    }).compileComponents();

    fixture = TestBed.createComponent(SelectTestHost);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the select', () => {
    expect(field()).not.toBeNull();
  });

  it('should associate the label with its select', () => {
    const label: HTMLLabelElement =
      fixture.nativeElement.querySelector('label');

    expect(label.htmlFor).toBe('service');
    expect(field().id).toBe('service');
  });

  it('should render the placeholder and options', () => {
    expect(field().options.length).toBe(4);
    expect(field().options[0].textContent)
      .toContain('Select service');
  });

  it('should display a programmatically selected value', () => {
    host.control.setValue('general');
    fixture.detectChanges();

    expect(field().value).toBe('general');
  });

  it('should update the Angular form on selection', () => {
    field().value = 'oil';

    field().dispatchEvent(new Event('change', {
      bubbles: true,
    }));

    expect(host.control.value).toBe('oil');
  });

  it('should disable unavailable options', () => {
    expect(field().options[3].disabled).toBe(true);
  });

  it('should reject a manually dispatched disabled option', () => {
    field().value = 'engine';

    field().dispatchEvent(new Event('change', {
      bubbles: true,
    }));

    expect(host.control.value).toBe('');
  });

  it('should disable the native select with the form', () => {
    host.control.disable();
    fixture.detectChanges();

    expect(field().disabled).toBe(true);
  });

  it('should enable the native select with the form', () => {
    host.control.disable();
    host.control.enable();
    fixture.detectChanges();

    expect(field().disabled).toBe(false);
  });

  it('should mark the control as touched on blur', () => {
    field().dispatchEvent(new Event('blur'));

    expect(host.control.touched).toBe(true);
  });

  it('should support form reset', () => {
    host.control.setValue('oil');
    fixture.detectChanges();

    host.control.reset();
    fixture.detectChanges();

    expect(field().value).toBe('');
  });

  it('should support required validation', () => {
    expect(host.control.hasError('required')).toBe(true);

    host.control.setValue('oil');

    expect(host.control.valid).toBe(true);
  });

  it('should render accessible helper text', () => {
    expect(field().getAttribute('aria-describedby'))
      .toBe('service-helper');

    expect(fixture.nativeElement.textContent)
      .toContain('Choose a workshop service');
  });

  it('should render accessible error text', () => {
    host.error.set('Service is required');
    fixture.detectChanges();

    expect(field().getAttribute('aria-invalid')).toBe('true');

    expect(field().getAttribute('aria-describedby'))
      .toBe('service-error');

    expect(fixture.nativeElement.textContent)
      .toContain('Service is required');
  });
});