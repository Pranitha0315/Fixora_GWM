import {
  Component,
  signal,
} from '@angular/core';

import {
  ComponentFixture,
  TestBed,
} from '@angular/core/testing';

import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { Input } from '../components/input/input';
import { Select } from '../components/select/select';
import { Button } from '../components/button/button';

interface BookingFormValue {
  customerName: string;
  serviceType: string;
}

@Component({
  standalone: true,
  imports: [
    ReactiveFormsModule,
    Input,
    Select,
    Button,
  ],
  template: `
    <form
      [formGroup]="form"
      (ngSubmit)="submit()"
    >
      <fx-input
        controlId="customer-name"
        label="Customer name"
        formControlName="customerName"
        [required]="true"
        [error]="
          form.controls.customerName.touched &&
          form.controls.customerName.invalid
            ? 'Customer name is required'
            : ''
        "
      />

      <fx-select
        controlId="service-type"
        label="Service type"
        formControlName="serviceType"
        [options]="services"
        [required]="true"
        [error]="
          form.controls.serviceType.touched &&
          form.controls.serviceType.invalid
            ? 'Service type is required'
            : ''
        "
      />

      <fx-button
        type="submit"
        [disabled]="!form.valid"
        [loading]="saving()"
        loadingText="Saving..."
      >
        Create Booking
      </fx-button>
    </form>
  `,
})
class FormIntegrationHost {
  readonly saving = signal(false);

  readonly submissions =
    signal<readonly BookingFormValue[]>([]);

  readonly services = [
    {
      value: 'oil-change',
      label: 'Oil Change',
    },
    {
      value: 'general-service',
      label: 'General Service',
    },
    {
      value: 'brake-repair',
      label: 'Brake Repair',
    },
  ];

  readonly form = new FormGroup({
    customerName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),

    serviceType: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  submit(): void {
    if (!this.form.valid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submissions.update(items => [
      ...items,
      this.form.getRawValue(),
    ]);
  }
}

describe('Shared UI form integration', () => {
  let fixture: ComponentFixture<FormIntegrationHost>;
  let host: FormIntegrationHost;

  function customerInput(): HTMLInputElement {
    return fixture.nativeElement.querySelector(
      'fx-input input',
    );
  }

  function serviceSelect(): HTMLSelectElement {
    return fixture.nativeElement.querySelector(
      'fx-select select',
    );
  }

  function submitButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector(
      'fx-button button',
    );
  }

  function formElement(): HTMLFormElement {
    return fixture.nativeElement.querySelector('form');
  }

  async function refresh(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function enterCustomer(
    value: string,
  ): Promise<void> {
    const element = customerInput();

    element.value = value;

    element.dispatchEvent(
      new Event('input', { bubbles: true }),
    );

    await refresh();
  }

  async function selectService(
    value: string,
  ): Promise<void> {
    const element = serviceSelect();

    element.value = value;

    element.dispatchEvent(
      new Event('change', { bubbles: true }),
    );

    await refresh();
  }

  async function fillValidForm(): Promise<void> {
    await enterCustomer('Test Customer');
    await selectService('general-service');
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormIntegrationHost],
    }).compileComponents();

    fixture = TestBed.createComponent(
      FormIntegrationHost,
    );

    host = fixture.componentInstance;

    await refresh();
  });

  it('FIT-01 renders all form components', () => {
    expect(customerInput()).not.toBeNull();
    expect(serviceSelect()).not.toBeNull();
    expect(submitButton()).not.toBeNull();
    expect(submitButton().type).toBe('submit');
  });

  it('FIT-02 starts with an invalid form', () => {
    expect(host.form.invalid).toBe(true);
    expect(submitButton().disabled).toBe(true);
    expect(host.submissions()).toHaveLength(0);
  });

  it('FIT-03 updates the form from input events', async () => {
    await enterCustomer('Test Customer');

    expect(
      host.form.controls.customerName.value,
    ).toBe('Test Customer');
  });

  it('FIT-04 updates the form from select events', async () => {
    await selectService('oil-change');

    expect(
      host.form.controls.serviceType.value,
    ).toBe('oil-change');
  });

  it('FIT-05 displays required field errors', async () => {
    customerInput().dispatchEvent(
      new Event('blur'),
    );

    serviceSelect().dispatchEvent(
      new Event('blur'),
    );

    await refresh();

    expect(
      host.form.controls.customerName.touched,
    ).toBe(true);

    expect(
      host.form.controls.serviceType.touched,
    ).toBe(true);

    expect(fixture.nativeElement.textContent)
      .toContain('Customer name is required');

    expect(fixture.nativeElement.textContent)
      .toContain('Service type is required');
  });

  it('FIT-06 enables submission when valid', async () => {
    await fillValidForm();

    expect(host.form.valid).toBe(true);
    expect(submitButton().disabled).toBe(false);
  });

  it('FIT-07 submits valid values through the button', async () => {
    await fillValidForm();

    submitButton().click();

    await refresh();

    expect(host.submissions()).toEqual([
      {
        customerName: 'Test Customer',
        serviceType: 'general-service',
      },
    ]);
  });

  it('FIT-08 blocks invalid form submission', async () => {
    formElement().dispatchEvent(
      new Event('submit', {
        bubbles: true,
        cancelable: true,
      }),
    );

    await refresh();

    expect(host.submissions()).toHaveLength(0);
    expect(host.form.invalid).toBe(true);
  });

  it('FIT-09 blocks submission while saving', async () => {
    await fillValidForm();

    host.saving.set(true);

    await refresh();

    expect(submitButton().disabled).toBe(true);

    expect(submitButton().textContent)
      .toContain('Saving...');

    submitButton().click();

    formElement().dispatchEvent(
      new Event('submit', {
        bubbles: true,
        cancelable: true,
      }),
    );

    await refresh();

    expect(host.submissions()).toHaveLength(0);
  });

  it('FIT-10 propagates disabled form state', async () => {
    await fillValidForm();

    host.form.disable();

    await refresh();

    expect(customerInput().disabled).toBe(true);
    expect(serviceSelect().disabled).toBe(true);
    expect(submitButton().disabled).toBe(true);

    host.form.enable();

    await refresh();

    expect(customerInput().disabled).toBe(false);
    expect(serviceSelect().disabled).toBe(false);
    expect(submitButton().disabled).toBe(false);
  });

  it('FIT-11 clears component values on form reset', async () => {
    await fillValidForm();

    host.form.reset();

    await refresh();

    expect(customerInput().value).toBe('');
    expect(serviceSelect().value).toBe('');
    expect(host.form.invalid).toBe(true);
    expect(submitButton().disabled).toBe(true);
  });

  it('FIT-12 reflects programmatic form values', async () => {
    host.form.setValue({
      customerName: 'Updated Customer',
      serviceType: 'brake-repair',
    });

    await refresh();

    expect(customerInput().value)
      .toBe('Updated Customer');

    expect(serviceSelect().value)
      .toBe('brake-repair');

    expect(host.form.valid).toBe(true);
    expect(submitButton().disabled).toBe(false);
  });
});