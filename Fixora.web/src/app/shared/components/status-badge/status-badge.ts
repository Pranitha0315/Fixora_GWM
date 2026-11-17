import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

export type StatusBadgeTone =
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral';

export type StatusBadgeSize =
  | 'sm'
  | 'md'
  | 'lg';

export type StatusBadgeAppearance =
  | 'filled'
  | 'outline';

@Component({
  selector: 'fx-status-badge',
  standalone: true,
  templateUrl: './status-badge.html',
  styleUrl: './status-badge.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadge {
  readonly label = input.required<string>();

  readonly tone = input<StatusBadgeTone>('neutral');

  readonly size = input<StatusBadgeSize>('md');

  readonly appearance =
    input<StatusBadgeAppearance>('filled');

  readonly showDot = input(true);

  readonly announceChanges = input(false);

  readonly accessibleLabel =
    input<string | null>(null);

  readonly badgeClasses = computed(() => [
    'fx-status-badge',
    `fx-status-badge--${this.tone()}`,
    `fx-status-badge--${this.size()}`,
    `fx-status-badge--${this.appearance()}`,
  ].join(' '));
}