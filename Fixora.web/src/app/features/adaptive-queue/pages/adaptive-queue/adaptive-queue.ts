import { DatePipe } from '@angular/common';

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';

import type { OnInit } from '@angular/core';

import { Alert } from '../../../../shared/components/alert/alert';
import { Button } from '../../../../shared/components/button/button';
import { EmptyState } from '../../../../shared/components/empty-state/empty-state';
import { ErrorState } from '../../../../shared/components/error-state/error-state';
import { KpiCard } from '../../../../shared/components/kpi-card/kpi-card';
import { LoadingState } from '../../../../shared/components/loading-state/loading-state';
import { StatusBadge } from '../../../../shared/components/status-badge/status-badge';

import { AdaptiveQueueJobCard } from '../../components/adaptive-queue-job-card/adaptive-queue-job-card';

import type {
  AdaptiveQueueJob,
  AdaptiveQueueWarningCode,
} from '../../models/adaptive-queue.model';

import { AdaptiveQueueRealtimeCoordinator } from '../../services/adaptive-queue-realtime-coordinator.service';
import type { AdaptiveQueueConnectionState } from '../../services/adaptive-queue-realtime-coordinator.service';
import { AdaptiveQueueRealtimeService } from '../../services/adaptive-queue-realtime.service';
import { AdaptiveQueueStateService } from '../../services/adaptive-queue-state.service';

import type { StatusBadgeTone } from '../../../../shared/components/status-badge/status-badge';

import { getAdaptiveQueueReorderAvailability } from '../../utils/adaptive-queue-reorder-availability';

/** Connection state to badge tone. Never implies data freshness. */
const CONNECTION_TONES: Readonly<
  Record<AdaptiveQueueConnectionState, StatusBadgeTone>
> = {
  connecting: 'info',
  connected: 'success',
  reconnecting: 'warning',
  unavailable: 'warning',
};

const WARNING_TITLES: Readonly<
  Record<AdaptiveQueueWarningCode, string>
> = {
  'no-active-bays': 'No active bays configured',
  'capacity-saturation': 'Capacity overview',
  'duplicate-active-bay-assignment': 'Shared bay assignments',
  'duplicate-active-mechanic-assignment':
    'Shared mechanic assignments',
  'unassigned-active-phase-jobs':
    'Active-phase jobs without a bay',
  'inactive-bay-assignments': 'Jobs referencing inactive bays',
  'unknown-bay-assignments': 'Jobs referencing unknown bays',
  'unrecognized-status-jobs': 'Unrecognized job statuses',
  'job-limit-reached': 'Job list may be incomplete',
};

/**
 * Read-only Adaptive Queue board.
 *
 * The state, realtime and coordination services are provided here
 * so requests, timers, the SignalR connection and session watchers
 * live and die with this page. The page performs no mutations and
 * no polling. The board is always loaded over HTTP, independently
 * of the realtime connection; realtime notifications only trigger
 * a bounded HTTP reload. It exposes manual refresh, retry and
 * (when useful) a manual live-updates reconnect.
 */
@Component({
  selector: 'app-adaptive-queue',
  standalone: true,
  imports: [
    DatePipe,
    Alert,
    Button,
    EmptyState,
    ErrorState,
    KpiCard,
    LoadingState,
    StatusBadge,
    AdaptiveQueueJobCard,
  ],
  providers: [
    AdaptiveQueueStateService,
    AdaptiveQueueRealtimeService,
    AdaptiveQueueRealtimeCoordinator,
  ],
  templateUrl: './adaptive-queue.html',
  styleUrl: './adaptive-queue.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdaptiveQueuePage implements OnInit {
  protected readonly state = inject(AdaptiveQueueStateService);
  protected readonly realtime = inject(AdaptiveQueueRealtimeCoordinator);

  /** Walk-in reorder is backend-limited: explained, never offered. */
  protected readonly reorderAvailability =
    getAdaptiveQueueReorderAvailability();

  protected readonly connectionTone = computed(
    () => CONNECTION_TONES[this.realtime.connection().state],
  );

  /** Null while the roster is unavailable: never shown as zero. */
  protected readonly rosterSummary = computed(() => {
    const roster = this.state.mechanics();

    if (roster === null) {
      return null;
    }

    return {
      onDuty: roster.filter(mechanic => mechanic.onDuty).length,
      total: roster.length,
    };
  });

  protected readonly mechanicsKpi = computed(() => {
    const summary = this.rosterSummary();

    if (summary !== null) {
      return {
        value: summary.onDuty,
        description: `of ${summary.total} on the roster`,
      };
    }

    return this.state.mechanicsStatus() === 'loading'
      ? { value: 'Loading...', description: '' }
      : {
          value: 'Unavailable',
          description: 'Mechanic roster not available',
        };
  });

  protected readonly errorTitle = computed(() => {
    switch (this.state.authFailure()) {
      case 'unauthorized':
        return 'Sign-in required';
      case 'forbidden':
        return 'Access denied';
      default:
        return 'Adaptive Queue unavailable';
    }
  });

  protected readonly errorDescription = computed(
    () => this.state.initialLoadError()?.message ?? '',
  );

  /** Retrying cannot fix a rejected session or missing permission. */
  protected readonly canRetry = computed(
    () => this.state.authFailure() === null,
  );

  protected readonly staleMessage = computed(() => {
    switch (this.state.staleReason()) {
      case 'aged':
        return 'This board has not been refreshed for over two '
          + 'minutes and may no longer match the server. Refresh '
          + 'to reload it.';
      case 'signalled':
        return 'This board may no longer match the server. '
          + 'Refresh to reload it.';
      default:
        return '';
    }
  });

  protected readonly refreshFailureMessage = computed(() => {
    const error = this.state.refreshError();

    return error === null
      ? ''
      : `${error.message} Showing the last data received.`;
  });

  protected readonly rosterAlertMessage = computed(() => {
    if (this.state.mechanicsStatus() !== 'failed') {
      return '';
    }

    return this.state.mechanicsError()?.kind === 'forbidden'
      ? 'You do not have permission to view the mechanic roster. '
        + 'The queue is shown without mechanic availability.'
      : 'Mechanic availability could not be loaded. The queue is '
        + 'shown without it.';
  });

  /**
   * Waiting jobs without a bay already appear in the waiting
   * queue, so only active-phase jobs are listed here.
   */
  protected readonly unassignedActivePhaseJobs = computed(
    (): readonly AdaptiveQueueJob[] =>
      this.state
        .unassignedJobs()
        .filter(item => item.phase === 'active-phase'),
  );

  protected readonly hasFallbackGroups = computed(
    () =>
      this.unassignedActivePhaseJobs().length > 0
      || this.state.inactiveBayAssignments().length > 0
      || this.state.unknownBayAssignments().length > 0,
  );

  protected readonly hasSharedAssignments = computed(
    () =>
      this.state.duplicateBayAssignments().length > 0
      || this.state.duplicateMechanicAssignments().length > 0,
  );

  ngOnInit(): void {
    // The HTTP load starts first and never waits for the hub.
    this.state.refresh();
    this.realtime.activate();
  }

  /** Manual refresh and error retry. Always an HTTP reload. */
  refresh(): void {
    this.realtime.refresh();
  }

  /** Manual live-updates reconnect. Does not reload the board. */
  reconnect(): void {
    this.realtime.reconnect();
  }

  protected warningTitle(code: AdaptiveQueueWarningCode): string {
    return WARNING_TITLES[code];
  }
}
