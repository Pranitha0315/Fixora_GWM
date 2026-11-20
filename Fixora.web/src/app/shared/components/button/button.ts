import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'danger'
  | 'ghost';

export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonType = 'button' | 'submit' | 'reset';

@Component({
  selector: 'fx-button',
  standalone: true,
  templateUrl: './button.html',
  styleUrl: './button.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.fx-button-full]': 'fullWidth()',
  },
})
export class Button {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly type = input<ButtonType>('button');

  readonly disabled = input(false);
  readonly loading = input(false);
  readonly fullWidth = input(false);

  readonly loadingText = input('Processing...');
  readonly accessibleLabel = input<string | null>(null);

  readonly pressed = output<MouseEvent>();

  readonly isDisabled = computed(
    () => this.disabled() || this.loading(),
  );

  readonly buttonClasses = computed(
    () =>
      `fx-button fx-button--${this.variant()} fx-button--${this.size()}`,
  );

  handleClick(event: MouseEvent): void {
    if (this.isDisabled()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    this.pressed.emit(event);
  }
}