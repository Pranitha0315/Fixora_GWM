import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export type ModalCloseReason =
  | 'button'
  | 'escape'
  | 'backdrop';

@Component({
  selector: 'fx-modal',
  standalone: true,
  templateUrl: './modal.html',
  styleUrl: './modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Modal {
  readonly dialogId = input.required<string>();
  readonly title = input.required<string>();

  readonly open = input(false);
  readonly size = input<ModalSize>('md');

  readonly dismissible = input(true);
  readonly closeOnEscape = input(true);
  readonly closeOnBackdrop = input(false);

  readonly busy = input(false);

  readonly closeRequested =
    output<ModalCloseReason>();

  readonly dialog =
    viewChild<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const dialog = this.dialog()?.nativeElement;
      const shouldOpen = this.open();

      if (!dialog) {
        return;
      }

      if (shouldOpen && !dialog.open) {
        dialog.showModal();
      } else if (!shouldOpen && dialog.open) {
        dialog.close();
      }
    });
  }

  requestClose(reason: ModalCloseReason): void {
    if (
      !this.open() ||
      !this.dismissible() ||
      this.busy()
    ) {
      return;
    }

    if (reason === 'escape' && !this.closeOnEscape()) {
      return;
    }

    if (reason === 'backdrop' && !this.closeOnBackdrop()) {
      return;
    }

    this.closeRequested.emit(reason);
  }

  handleCancel(event: Event): void {
    event.preventDefault();

    this.requestClose('escape');
  }

  handleBackdrop(event: MouseEvent): void {
    const dialog = this.dialog()?.nativeElement;

    if (!dialog || event.target !== dialog) {
      return;
    }

    const rect = dialog.getBoundingClientRect();

    const outside =
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom;

    if (outside) {
      this.requestClose('backdrop');
    }
  }
}