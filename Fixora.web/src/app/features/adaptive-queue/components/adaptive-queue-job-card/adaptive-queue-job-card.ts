import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

import { StatusBadge } from '../../../../shared/components/status-badge/status-badge';
import type { StatusBadgeTone } from '../../../../shared/components/status-badge/status-badge';

import type { AdaptiveQueueJob } from '../../models/adaptive-queue.model';

export const ADAPTIVE_QUEUE_ETA_UNAVAILABLE = 'ETA unavailable';

/**
 * Read-only presentation of one job on the Adaptive Queue board.
 *
 * Queue position and ETA are shown exactly as the backend supplied
 * them (the ETA through the K09 formatter, already applied by the
 * mapper). Nothing is recalculated or inferred here, and a bay is
 * only ever described as an assignment, never as confirmed
 * physical occupancy.
 */
@Component({
  selector: 'app-adaptive-queue-job-card',
  standalone: true,
  imports: [StatusBadge],
  templateUrl: './adaptive-queue-job-card.html',
  styleUrl: './adaptive-queue-job-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdaptiveQueueJobCard {
  readonly item = input.required<AdaptiveQueueJob>();

  /** Show the backend queue position (waiting jobs only). */
  readonly showQueuePosition = input(false);

  protected readonly statusLabel = computed(() => {
    const { phase, job } = this.item();

    if (phase === 'waiting') {
      return 'Waiting';
    }

    // JobStatus names are PascalCase (for example "InProgress").
    return job.status.replace(/([a-z])([A-Z])/g, '$1 $2');
  });

  protected readonly statusTone = computed<StatusBadgeTone>(() => {
    const { phase, job } = this.item();

    if (phase === 'waiting') {
      return 'info';
    }

    if (phase === 'unrecognized' || job.status === 'Paused') {
      return 'warning';
    }

    return 'primary';
  });

  protected readonly priorityTone = computed<StatusBadgeTone>(() => {
    switch (this.item().priorityLevel) {
      case 2:
        return 'danger';
      case 1:
        return 'warning';
      case 0:
        return 'neutral';
      default:
        return 'neutral';
    }
  });

  protected readonly mechanicText = computed(() => {
    const { mechanicId, mechanicName } = this.item().job;

    if (mechanicName !== null && mechanicName.trim() !== '') {
      return mechanicName;
    }

    return mechanicId === null
      ? 'No mechanic assigned'
      : 'Mechanic name unavailable';
  });

  protected readonly bayText = computed(() => {
    const { bayId, bayName } = this.item().job;

    if (bayId === null) {
      return 'No bay assigned';
    }

    return bayName !== null && bayName.trim() !== ''
      ? bayName
      : 'Bay name unavailable';
  });

  protected readonly etaText = computed(
    () => this.item().etaDisplay ?? ADAPTIVE_QUEUE_ETA_UNAVAILABLE,
  );

  protected readonly hasEta = computed(
    () => this.item().etaDisplay !== null,
  );
}
