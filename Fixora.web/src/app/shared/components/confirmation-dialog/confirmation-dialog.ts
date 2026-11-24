import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

import { Modal } from '../modal/modal';
import type { ModalCloseReason } from '../modal/modal';

import { Button } from '../button/button';
import type { ButtonVariant } from '../button/button';

export type ConfirmationTone =
  | 'primary'
  | 'danger'
  | 'warning'
  | 'success';

@Component({
  selector: 'fx-confirmation-dialog',
  standalone: true,
  imports: [Modal, Button],
  templateUrl: './confirmation-dialog.html',
  styleUrl: './confirmation-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmationDialog {
  readonly dialogId = input.required<string>();

  readonly open = input(false);

  readonly title = input('Confirm action');
  readonly message = input.required<string>();

  readonly tone = input<ConfirmationTone>('primary');

  readonly confirmText = input('Confirm');
  readonly cancelText = input('Cancel');

  readonly processingText = input('Processing...');

  readonly busy = input(false);
  readonly confirmDisabled = input(false);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  readonly buttonVariant = computed<ButtonVariant>(
    () => this.tone() === 'danger' ? 'danger' : 'primary',
  );

  confirm(): void {
    if (
      !this.open() ||
      this.busy() ||
      this.confirmDisabled()
    ) {
      return;
    }

    this.confirmed.emit();
  }

  cancel(): void {
    if (!this.open() || this.busy()) {
      return;
    }

    this.cancelled.emit();
  }

  handleClose(_reason: ModalCloseReason): void {
    this.cancel();
  }
}