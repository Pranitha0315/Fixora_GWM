import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import type { OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Alert } from '../../../../shared/components/alert/alert';
import { Button } from '../../../../shared/components/button/button';
import { Card } from '../../../../shared/components/card/card';
import { EmptyState } from '../../../../shared/components/empty-state/empty-state';
import { ErrorState } from '../../../../shared/components/error-state/error-state';
import { KpiCard } from '../../../../shared/components/kpi-card/kpi-card';
import { LoadingState } from '../../../../shared/components/loading-state/loading-state';
import { StatusBadge } from '../../../../shared/components/status-badge/status-badge';
import type { StatusBadgeTone } from '../../../../shared/components/status-badge/status-badge';

import { FixProofNavigationProtectionService } from '../../../fixproof-review/services/fixproof-navigation-protection.service';

import { JOB_CARDS_LIST_LIMIT } from '../../models/job-card.model';
import type { WorkshopRealtimeConnectionState } from '../../models/workshop-realtime-contract.model';
import { JobCardStateService } from '../../services/job-card-state.service';
import { WorkshopRealtimeCoordinatorService } from '../../services/workshop-realtime-coordinator.service';

const REALTIME_TONES: Readonly<
  Record<WorkshopRealtimeConnectionState, StatusBadgeTone>
> = {
  connecting: 'info',
  connected: 'success',
  reconnecting: 'warning',
  disconnected: 'neutral',
  unavailable: 'warning',
};

const JOB_STATUS_LABELS: Readonly<Record<string, string>> = {
  Open: 'Open',
  Inspecting: 'Inspecting',
  AwaitingManagerReview: 'Awaiting manager review',
  AwaitingCustomerApproval: 'Awaiting customer approval',
  AwaitingRelease: 'Awaiting release',
  InProgress: 'In progress',
  Paused: 'Paused',
  Completed: 'Completed',
  Closed: 'Closed',
};

const JOB_STATUS_TONES: Readonly<Record<string, StatusBadgeTone>> = {
  Open: 'info',
  Inspecting: 'info',
  AwaitingManagerReview: 'warning',
  AwaitingCustomerApproval: 'primary',
  AwaitingRelease: 'warning',
  InProgress: 'primary',
  Paused: 'danger',
  Completed: 'success',
  Closed: 'neutral',
};

/**
 * K15 Job Cards Operational Queue page (`/job-cards`).
 *
 * Consumes feature-scoped `JobCardStateService` (provided on `JOB_CARDS_ROUTES`,
 * never root-scoped) plus root `FixProofNavigationProtectionService` for
 * session-scoped unresolved notices.
 *
 * Security & scope invariants:
 * - Zero fabricated pagination or server totals; displays truthful 200-cap
 *   truncation advisory when `possiblyTruncated()` is true.
 * - Preserves manual refresh/cancellation with zero automatic retries or
 *   automatic HTTP timeouts.
 * - Safe Angular text interpolation only; zero `bypassSecurityTrust*` or
 *   browser storage writes.
 */
@Component({
  selector: 'app-job-cards',
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    Alert,
    Button,
    Card,
    EmptyState,
    ErrorState,
    KpiCard,
    LoadingState,
    StatusBadge,
  ],
  templateUrl: './job-cards.html',
  styleUrl: './job-cards.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JobCards implements OnInit {
  readonly state = inject(JobCardStateService);
  readonly navigationProtection = inject(FixProofNavigationProtectionService);
  readonly realtime = inject(WorkshopRealtimeCoordinatorService, {
    optional: true,
  });

  private readonly destroyRef = inject(DestroyRef);

  readonly realtimeConnection = computed(
    () => this.realtime?.connection() ?? null,
  );

  readonly realtimeConnectionTone = computed<StatusBadgeTone>(() => {
    const view = this.realtimeConnection();
    return view ? REALTIME_TONES[view.state] : 'neutral';
  });

  readonly canReconnectRealtime = computed(
    () => (this.realtime?.canReconnect() ?? false) && !this.state.accessRevoked(),
  );

  readonly listLimit = JOB_CARDS_LIST_LIMIT;
  readonly customerIdDraft = signal('');

  readonly totalLoadedCount = computed(
    () => this.state.serverRows()?.length ?? 0,
  );

  readonly awaitingReviewCount = computed(() => {
    const rows = this.state.serverRows();
    if (!rows) {
      return 0;
    }

    return rows.filter(
      row =>
        row.status === 'AwaitingManagerReview' ||
        row.status === 'AwaitingRelease',
    ).length;
  });

  readonly inProgressCount = computed(() => {
    const rows = this.state.serverRows();
    if (!rows) {
      return 0;
    }

    return rows.filter(
      row => row.status === 'InProgress' || row.status === 'Inspecting',
    ).length;
  });

  readonly authFailureMessage = computed(() => {
    const failure = this.state.authFailure();
    if (failure === 'unauthorized') {
      return 'Your session is no longer authorized for Job Cards. Protected workshop data has been cleared. Sign in again to continue.';
    }

    if (failure === 'forbidden') {
      return 'Your current account does not have permission to view Job Cards. Protected workshop data has been cleared.';
    }

    return null;
  });

  constructor() {
    const releaseRealtime = this.realtime?.attachConsumer({
      kind: 'jobs-list',
      isAccessRevoked: () => this.state.accessRevoked(),
      hasAuthFailure: () => this.state.authFailure() !== null,
      refreshJobsList: () => this.state.refreshList(),
    });

    this.destroyRef.onDestroy(() => {
      releaseRealtime?.();
      this.state.cancelListRequest();
    });
  }

  reconnectRealtime(): void {
    this.realtime?.reconnect();
  }

  ngOnInit(): void {
    this.customerIdDraft.set(this.state.serverFilter().customerId ?? '');
    this.state.refreshList();
  }

  refreshList(): void {
    this.state.refreshList();
  }

  cancelListLoad(): void {
    this.state.cancelListRequest();
  }

  onActiveOnlyToggle(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.state.setActiveOnly(checked);
  }

  onCustomerIdInput(event: Event): void {
    this.customerIdDraft.set((event.target as HTMLInputElement).value);
  }

  applyCustomerIdFilter(): void {
    const trimmed = this.customerIdDraft().trim();
    this.state.setCustomerId(trimmed === '' ? null : trimmed);
  }

  clearCustomerIdFilter(): void {
    this.customerIdDraft.set('');
    this.state.setCustomerId(null);
  }

  onSearchInput(event: Event): void {
    this.state.setSearch((event.target as HTMLInputElement).value);
  }

  onStatusFilterChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.state.setStatusFilter(value === '' ? null : value);
  }

  onPriorityFilterChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.state.setPriorityFilter(value === '' ? null : Number(value));
  }

  clearLocalFilters(): void {
    this.state.clearLocalFilters();
  }

  dismissSessionNotice(noticeId: number): void {
    this.navigationProtection.dismissNotice(noticeId);
  }

  dismissAllSessionNotices(): void {
    this.navigationProtection.dismissAllNotices();
  }

  jobStatusLabel(status: string): string {
    return JOB_STATUS_LABELS[status] ?? status;
  }

  jobStatusTone(status: string): StatusBadgeTone {
    return JOB_STATUS_TONES[status] ?? 'neutral';
  }

  priorityLabel(priority: number): string {
    if (priority <= 1) {
      return `P${priority} (High)`;
    }
    if (priority === 2) {
      return `P${priority} (Normal)`;
    }
    return `P${priority}`;
  }

  priorityTone(priority: number): StatusBadgeTone {
    if (priority <= 1) {
      return 'danger';
    }
    if (priority === 2) {
      return 'warning';
    }
    return 'neutral';
  }
}
