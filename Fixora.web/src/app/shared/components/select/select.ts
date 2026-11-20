import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';

import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

@Component({
  selector: 'fx-select',
  standalone: true,
  templateUrl: './select.html',
  styleUrl: './select.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => Select),
      multi: true,
    },
  ],
})
export class Select implements ControlValueAccessor {
  readonly controlId = input.required<string>();
  readonly label = input.required<string>();

  readonly options = input<readonly SelectOption[]>([]);
  readonly placeholder = input('Select an option');

  readonly required = input(false);
  readonly disabled = input(false);

  readonly error = input('');
  readonly helperText = input('');

  readonly value = signal('');
  private readonly formDisabled = signal(false);

  readonly isDisabled = computed(
    () => this.disabled() || this.formDisabled(),
  );

  readonly describedBy = computed(() => {
    if (this.error()) {
      return `${this.controlId()}-error`;
    }

    if (this.helperText()) {
      return `${this.controlId()}-helper`;
    }

    return null;
  });

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.formDisabled.set(disabled);
  }

  handleChange(event: Event): void {
    if (this.isDisabled()) {
      return;
    }

    const value = (event.target as HTMLSelectElement).value;

    const allowed = value === ''
      || this.options().some(
        option => option.value === value && !option.disabled,
      );

    if (!allowed) {
      return;
    }

    this.value.set(value);
    this.onChange(value);
  }

  handleBlur(): void {
    this.onTouched();
  }
}