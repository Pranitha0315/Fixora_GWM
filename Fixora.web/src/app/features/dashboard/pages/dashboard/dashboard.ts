import { DecimalPipe, DatePipe } from '@angular/common';
import { KpiCard } from '../../../../shared/components/kpi-card/kpi-card';
import { LoadingState } from '../../../../shared/components/loading-state/loading-state';
import { ErrorState } from '../../../../shared/components/error-state/error-state';
import { EmptyState } from '../../../../shared/components/empty-state/empty-state';
import { Button } from '../../../../shared/components/button/button';

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';

import type { OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { defer, finalize } from 'rxjs';

import { ApiError } from '../../../../core/models/api-error.model';
import type { DashboardData } from '../../models/dashboard.model';
import { DashboardApiService } from '../../services/dashboard-api.service';
import { DashboardResponseError } from '../../utils/dashboard-response.validator';

@Component({
  imports: [KpiCard, LoadingState, ErrorState, EmptyState, Button, DecimalPipe, DatePipe],
  selector: 'app-dashboard',
  styleUrl: './dashboard.scss',
  templateUrl: './dashboard.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard implements OnInit {
  private readonly dashboardApi = inject(DashboardApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly data = signal<DashboardData | null>(null);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly lastUpdated = signal<Date | null>(null);

  ngOnInit(): void {
    this.loadDashboard();
  }

  loadDashboard(): void {
    if (this.isLoading()) {
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.data.set(null);
    this.lastUpdated.set(null);

    defer(() => this.dashboardApi.getDashboard())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isLoading.set(false)),
      )
      .subscribe({
        next: (response) => {
          this.data.set(response);
          this.lastUpdated.set(new Date());
        },
        error: (error: unknown) => {
          this.data.set(null);
          this.lastUpdated.set(null);
          this.errorMessage.set(this.resolveError(error));
        },
      });
  }

  refresh(): void {
    this.loadDashboard();
  }

  private resolveError(error: unknown): string {
    if (error instanceof DashboardResponseError) {
      return 'The server returned invalid dashboard information. Please try again.';
    }

    if (error instanceof ApiError) {
      switch (error.status) {
        case 0:
          return 'Unable to connect to the server. Check your connection.';
        case 401:
          return 'Your session is no longer valid. Please sign in again.';
        case 403:
          return 'You do not have permission to access this dashboard.';
        case 429:
          return 'Too many requests. Please try again later.';
        default:
          return 'Unable to load dashboard information. Please try again.';
      }
    }

    return 'Unable to load dashboard information. Please try again.';
  }
}
