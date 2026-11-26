import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

import type {
  NotificationTone,
} from '../../models/notification.models';

@Component({
  selector: 'fx-alert',
  standalone: true,
  templateUrl: './alert.html',
  styleUrl: './alert.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Alert {
  readonly tone = input<NotificationTone>('info');
  readonly title = input.required<string>();
  readonly message = input('');
  readonly dismissible = input(false);
  readonly showIcon = input(true);
  readonly announce = input(true);
  readonly dismissLabel = input('Dismiss notification');

  readonly dismissed = output<void>();

  readonly alertClasses = computed(() =>
    `fx-alert fx-alert--${this.tone()}`,
  );

  readonly announcementRole = computed(() => {
    if (!this.announce()) {
      return null;
    }

    return this.tone() === 'error'
      ? 'alert'
      : 'status';
  });

  dismiss(): void {
    if (this.dismissible()) {
      this.dismissed.emit();
    }
  }
}