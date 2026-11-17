import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

export type CardPadding = 'none' | 'sm' | 'md' | 'lg';
export type CardElevation = 'none' | 'sm' | 'md';

@Component({
  selector: 'fx-card',
  standalone: true,
  templateUrl: './card.html',
  styleUrl: './card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Card {
  readonly title = input('');
  readonly subtitle = input('');

  readonly padding = input<CardPadding>('md');
  readonly elevation = input<CardElevation>('sm');

  readonly bordered = input(true);
  readonly showHeader = input(true);
  readonly showFooter = input(false);

  readonly cardClasses = computed(() => [
    'fx-card',
    `fx-card--padding-${this.padding()}`,
    `fx-card--elevation-${this.elevation()}`,
    this.bordered() ? 'fx-card--bordered' : '',
  ].filter(Boolean).join(' '));
}