import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

export type KpiTone =
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

export type KpiTrendDirection =
  | 'up'
  | 'down'
  | 'neutral';

@Component({
  selector: 'fx-kpi-card',
  standalone: true,
  templateUrl: './kpi-card.html',
  styleUrl: './kpi-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KpiCard {
  readonly label = input.required<string>();
  readonly value = input.required<number | string>();

  readonly description = input('');
  readonly tone = input<KpiTone>('primary');

  readonly trend = input('');
  readonly trendDirection = input<KpiTrendDirection>('neutral');
  readonly trendTone = input<KpiTone>('primary');

  readonly showIcon = input(true);
  readonly loading = input(false);
  readonly loadingText = input('Loading statistic...');

  readonly trendSymbol = computed(() => {
    switch (this.trendDirection()) {
      case 'up':
        return '\u2191';
      case 'down':
        return '\u2193';
      default:
        return '\u2014';
    }
  });
}