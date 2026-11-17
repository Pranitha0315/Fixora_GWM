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

export type InputType =
  | 'text'
  | 'email'
  | 'password'
  | 'tel'
  | 'search'
  | 'url'
  | 'date';

@Component({
  selector: 'fx-input',
  standalone: true,
  templateUrl: './input.html',
  styleUrl: './input.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => Input),
      multi: true,
    },
  ],
})
export class Input implements ControlValueAccessor {
  readonly controlId = input.required<string>();
  readonly label = input.required<string>();

  readonly type = input<InputType>('text');
  readonly placeholder = input('');
  readonly autocomplete = input('off');

  readonly required = input(false);
  readonly disabled = input(false);
  readonly readonly = input(false);

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

  handleInput(event: Event): void {
    if (this.isDisabled() || this.readonly()) {
      return;
    }

    const value = (event.target as HTMLInputElement).value;

    this.value.set(value);
    this.onChange(value);
  }

  handleBlur(): void {
    this.onTouched();
  }
}