import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';

import { Alert } from '../alert/alert';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'fx-toast',
  standalone: true,
  imports: [Alert],
  templateUrl: './toast.html',
  styleUrl: './toast.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Toast {
  readonly service = inject(ToastService);
  readonly notifications = this.service.notifications;

  onMouseLeave(id: number, element: HTMLElement): void {
    if (!element.contains(element.ownerDocument.activeElement)) {
      this.service.resume(id);
    }
  }

  onFocusOut(
    id: number,
    element: HTMLElement,
    event: FocusEvent,
  ): void {
    const next = event.relatedTarget as Node | null;

    if (
      !element.contains(next) &&
      !element.matches(':hover')
    ) {
      this.service.resume(id);
    }
  }
}