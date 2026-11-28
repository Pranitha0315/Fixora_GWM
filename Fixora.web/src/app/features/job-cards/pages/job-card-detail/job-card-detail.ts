import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
} from '@angular/core';
import type { OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { Alert } from '../../../../shared/components/alert/alert';
import { Button } from '../../../../shared/components/button/button';
import { Card } from '../../../../shared/components/card/card';
import { EmptyState } from '../../../../shared/components/empty-state/empty-state';
import { ErrorState } from '../../../../shared/components/error-state/error-state';
import { LoadingState } from '../../../../shared/components/loading-state/loading-state';
import { StatusBadge } from '../../../../shared/components/status-badge/status-badge';
import type { StatusBadgeTone } from '../../../../shared/components/status-badge/status-badge';

import type {
  ChangeRequestDto,
  ProposalDto,
} from '../../../fixproof-review/models/fixproof.model';
import { FixProofNavigationProtectionService } from '../../../fixproof-review/services/fixproof-navigation-protection.service';
import {
  evaluateChangeRequestActionEligibility,
  evaluateProposalActionEligibility,
  formatCents,
  parseMoneyToCents,
} from '../../../fixproof-review/utils/fixproof-pricing.util';

import type { IssueDto } from '../../models/job-card.model';
import type { WorkshopRealtimeConnectionState } from '../../models/workshop-realtime-contract.model';
import {
  JobCardStateService,
  type JobCardIssueEvidence,
} from '../../services/job-card-state.service';
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

export interface JobDetailProposalSummaryView {
  readonly proposal: ProposalDto;
  readonly forwardEligible: boolean;
  readonly returnEligible: boolean;
  readonly isReleasedPostBlock: boolean;
}

export interface JobDetailChangeRequestSummaryView {
  readonly changeRequest: ChangeRequestDto;
  readonly forwardEligible: boolean;
  readonly declineEligible: boolean;
}

export interface JobDetailIssueView {
  readonly issue: IssueDto;
  readonly severityTone: StatusBadgeTone;
  readonly mediaCount: number;
  readonly validCount: number;
  readonly expiredCount: number;
  readonly rejectedOrUnsupportedCount: number;
  readonly needsRefresh: boolean;
}

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

const SEVERITY_TONES: Readonly<Record<string, StatusBadgeTone>> = {
  Safe: 'success',
  Attention: 'warning',
  Urgent: 'danger',
};

const PROPOSAL_STATUS_TONES: Readonly<Record<string, StatusBadgeTone>> = {
  PendingManagerReview: 'warning',
  ReturnedToMechanic: 'info',
  AwaitingCustomer: 'primary',
  CustomerResponded: 'success',
  ReleasedToMechanic: 'success',
  Cancelled: 'neutral',
};

const CHANGE_REQUEST_STATUS_TONES: Readonly<Record<string, StatusBadgeTone>> = {
  PendingManagerReview: 'warning',
  ForwardedToMechanic: 'info',
  Declined: 'danger',
  Acknowledged: 'success',
};

/**
 * K15 Job Card Detail page (`/job-cards/:jobId`).
 *
 * Consumes feature-scoped `JobCardStateService` (provided on `JOB_CARDS_ROUTES`,
 * never root-scoped) for authoritative `JobDetailDto` rendering.
 *
 * Security & scope invariants:
 * - Validates `:jobId` via `JobCardStateService.selectJob()` before any HTTP call.
 * - Consumes inspection media strictly through `JobCardStateService.evidence()`;
 *   never renders raw signed URLs in the DOM and keeps live preview/download
 *   disabled while backend `BE-01`, `BE-02`, and `F-A04-06` remain unresolved.
 * - Links directly to `/job-cards/fixproof` for protected proposal & change-request
 *   mutations without duplicating `FixProofStateService` / `FixProofMutationStateService`.
 */
@Component({
  selector: 'app-job-card-detail',
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    Alert,
    Button,
    Card,
    EmptyState,
    ErrorState,
    LoadingState,
    StatusBadge,
  ],
  templateUrl: './job-card-detail.html',
  styleUrl: './job-card-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JobCardDetail implements OnInit {
  readonly state = inject(JobCardStateService);
  readonly navigationProtection = inject(FixProofNavigationProtectionService);
  readonly realtime = inject(WorkshopRealtimeCoordinatorService, {
    optional: true,
  });

  private readonly route = inject(ActivatedRoute);
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

  readonly proposalSummaryViews = computed<
    readonly JobDetailProposalSummaryView[]
  >(() => {
    const job = this.state.job();
    if (!job || this.state.accessRevoked()) {
      return [];
    }

    const ctx = { jobStatus: job.status };
    return this.state.proposals().map(proposal => ({
      proposal,
      forwardEligible: evaluateProposalActionEligibility(
        proposal.status,
        'forward',
        ctx,
      ).frontendAllowed,
      returnEligible: evaluateProposalActionEligibility(
        proposal.status,
        'return',
        ctx,
      ).frontendAllowed,
      isReleasedPostBlock: proposal.status === 'ReleasedToMechanic',
    }));
  });

  readonly changeRequestSummaryViews = computed<
    readonly JobDetailChangeRequestSummaryView[]
  >(() => {
    const job = this.state.job();
    if (!job || this.state.accessRevoked()) {
      return [];
    }

    const ctx = { jobStatus: job.status };
    return this.state.changeRequests().map(changeRequest => ({
      changeRequest,
      forwardEligible: evaluateChangeRequestActionEligibility(
        changeRequest.status,
        'forward',
        ctx,
      ).frontendAllowed,
      declineEligible: evaluateChangeRequestActionEligibility(
        changeRequest.status,
        'decline',
        ctx,
      ).frontendAllowed,
    }));
  });

  readonly authFailureMessage = computed(() => {
    const failure = this.state.authFailure();
    if (failure === 'unauthorized') {
      return 'Your session is no longer authorized for Job Cards. Protected job detail has been cleared. Sign in again to continue.';
    }

    if (failure === 'forbidden') {
      return 'Your current account does not have permission to view this job card. Protected job detail has been cleared.';
    }

    return null;
  });

  /**
   * Projects inspection findings with safe evidence status counts derived strictly
   * from `JobCardStateService.evidence()`. Raw signed URLs are never exposed.
   */
  readonly issueViews = computed<readonly JobDetailIssueView[]>(() => {
    if (this.state.accessRevoked()) {
      return [];
    }

    const issues = this.state.issues();
    const evidenceByIssue = new Map<string, JobCardIssueEvidence>();
    for (const group of this.state.evidence()) {
      evidenceByIssue.set(group.issueId, group);
    }

    return issues.map(issue => {
      const group = evidenceByIssue.get(issue.id);
      const items = group?.items ?? [];
      let validCount = 0;
      let expiredCount = 0;
      let rejectedOrUnsupportedCount = 0;
      let needsRefresh = false;

      for (const item of items) {
        if (item.status === 'valid' && item.previewKind !== 'unsupported') {
          validCount += 1;
        } else if (item.status === 'expired') {
          expiredCount += 1;
          needsRefresh = true;
        } else {
          rejectedOrUnsupportedCount += 1;
        }
      }

      return {
        issue,
        severityTone: SEVERITY_TONES[issue.severity] ?? 'neutral',
        mediaCount: items.length,
        validCount,
        expiredCount,
        rejectedOrUnsupportedCount,
        needsRefresh,
      };
    });
  });

  constructor() {
    const releaseRealtime = this.realtime?.attachConsumer({
      kind: 'job-detail',
      getSelectedJobId: () => this.state.selectedJobId(),
      isAccessRevoked: () => this.state.accessRevoked(),
      hasAuthFailure: () => this.state.authFailure() !== null,
      refreshJobDetail: () => this.state.refreshDetail(),
    });

    this.destroyRef.onDestroy(() => {
      releaseRealtime?.();
      this.state.cancelDetailRequest();
      this.state.cancelEvidenceRefresh();
    });
  }

  reconnectRealtime(): void {
    this.realtime?.reconnect();
  }

  ngOnInit(): void {
    const sub = this.route.paramMap.subscribe(params => {
      const jobId = params.get('jobId');
      this.state.selectJob(jobId);
    });
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  refreshDetail(): void {
    this.state.refreshDetail();
  }

  cancelDetailLoad(): void {
    this.state.cancelDetailRequest();
  }

  refreshEvidence(): void {
    this.state.refreshEvidence();
  }

  cancelEvidenceRefresh(): void {
    this.state.cancelEvidenceRefresh();
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

  proposalStatusTone(status: string): StatusBadgeTone {
    return PROPOSAL_STATUS_TONES[status] ?? 'neutral';
  }

  changeRequestStatusTone(status: string): StatusBadgeTone {
    return CHANGE_REQUEST_STATUS_TONES[status] ?? 'neutral';
  }

  invoiceStatusTone(status: string): StatusBadgeTone {
    return status === 'Paid' ? 'success' : 'warning';
  }

  formatAmount(amount: number): string {
    const parsed = parseMoneyToCents(amount);
    return parsed.ok ? formatCents(parsed.cents) : String(amount);
  }
}
