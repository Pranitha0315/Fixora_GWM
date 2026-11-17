import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

export type LoadingVariant = 'spinner' | 'skeleton';
export type LoadingSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'fx-loading-state',
  standalone: true,
  templateUrl: './loading-state.html',
  styleUrl: './loading-state.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadingState {
  readonly variant = input<LoadingVariant>('spinner');
  readonly size = input<LoadingSize>('md');

  readonly message = input('Loading...');
  readonly description = input('');

  readonly skeletonRows = input(4);
  readonly compact = input(false);

  readonly rows = computed(() => {
    const value = this.skeletonRows();

    const count = Number.isFinite(value)
      ? Math.max(1, Math.min(20, Math.floor(value)))
      : 4;

    return Array.from(
      { length: count },
      (_, index) => index,
    );
  });
}