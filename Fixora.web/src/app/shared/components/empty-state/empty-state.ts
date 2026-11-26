import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

import { Button } from '../button/button';
import type { ButtonVariant } from '../button/button';

export type EmptyStateIcon =
  | 'inbox'
  | 'search'
  | 'calendar'
  | 'file';

@Component({
  selector: 'fx-empty-state',
  standalone: true,
  imports: [Button],
  templateUrl: './empty-state.html',
  styleUrl: './empty-state.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyState {
  readonly title = input('No records found');
  readonly description = input('There are no records to display.');

  readonly icon = input<EmptyStateIcon>('inbox');
  readonly showIcon = input(true);

  readonly actionLabel = input('');
  readonly actionVariant = input<ButtonVariant>('primary');
  readonly actionDisabled = input(false);

  readonly compact = input(false);

  readonly actionRequested = output<void>();

  handleAction(): void {
    if (!this.actionLabel().trim() || this.actionDisabled()) {
      return;
    }

    this.actionRequested.emit();
  }
}