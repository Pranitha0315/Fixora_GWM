import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

import { Button } from '../button/button';

@Component({
  selector: 'fx-error-state',
  standalone: true,
  imports: [Button],
  templateUrl: './error-state.html',
  styleUrl: './error-state.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorState {
  readonly title = input('Something went wrong');

  readonly description = input(
    'Unable to load the requested information.',
  );

  readonly retryLabel = input('Try Again');
  readonly retryLoadingText = input('Retrying...');

  readonly showRetry = input(true);
  readonly retryDisabled = input(false);
  readonly retrying = input(false);

  readonly showIcon = input(true);
  readonly compact = input(false);

  readonly announceError = input(true);

  readonly retryRequested = output<void>();

  handleRetry(): void {
    if (
      !this.showRetry() ||
      !this.retryLabel().trim() ||
      this.retryDisabled() ||
      this.retrying()
    ) {
      return;
    }

    this.retryRequested.emit();
  }
}