import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import type { OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { Alert } from '../../../../shared/components/alert/alert';
import { Button } from '../../../../shared/components/button/button';
import { Card } from '../../../../shared/components/card/card';
import { ConfirmationDialog } from '../../../../shared/components/confirmation-dialog/confirmation-dialog';
import { EmptyState } from '../../../../shared/components/empty-state/empty-state';
import { ErrorState } from '../../../../shared/components/error-state/error-state';
import { KpiCard } from '../../../../shared/components/kpi-card/kpi-card';
import { LoadingState } from '../../../../shared/components/loading-state/loading-state';
import { StatusBadge } from '../../../../shared/components/status-badge/status-badge';
import type { StatusBadgeTone } from '../../../../shared/components/status-badge/status-badge';

import type { IssueDto } from '../../../job-cards/models/job-card.model';
import type { WorkshopRealtimeConnectionState } from '../../../job-cards/models/workshop-realtime-contract.model';
import { SignedMediaUrlService } from '../../../job-cards/services/signed-media-url.service';
import { WorkshopRealtimeCoordinatorService } from '../../../job-cards/services/workshop-realtime-coordinator.service';

import { FixProofWorkflowActions } from '../../components/fixproof-workflow-actions/fixproof-workflow-actions';
import { ProposalCostEditor } from '../../components/proposal-cost-editor/proposal-cost-editor';

import {
  FIXPROOF_CHANGE_REQUESTS_LIST_LIMIT,
  FIXPROOF_PROPOSALS_LIST_LIMIT,
  PROPOSAL_STATUSES,
  type ProposalStatus,
} from '../../models/fixproof.model';
import {
  formatCents,
  parseMoneyToCents,
} from '../../utils/fixproof-pricing.util';
import {
  FixProofRequestError,
  validateFixProofResourceId,
} from '../../utils/fixproof.validator';

import { FixProofMutationStateService } from '../../services/fixproof-mutation-state.service';
import { FixProofNavigationConfirmationService } from '../../services/fixproof-navigation-confirmation.service';
import { FixProofNavigationProtectionService } from '../../services/fixproof-navigation-protection.service';
import { FixProofStateService } from '../../services/fixproof-state.service';

export interface FixProofLinkedIssueSummary {
  readonly id: string;
  readonly component: string;
  readonly findingEn: string;
  readonly findingTa: string;
  readonly recommendationEn: string;
  readonly recommendationTa: string;
  readonly severity: string;
  readonly severityTone: StatusBadgeTone;
  readonly reportVersion: number;
  readonly confirmedAt: string;
  readonly mediaCount: number;
  readonly validMediaCount: number;
  readonly expiredMediaCount: number;
  readonly unsupportedOrRejectedCount: number;
}

const PROPOSAL_STATUS_LABELS: Readonly<Record<string, string>> = {
  PendingManagerReview: 'Pending manager review',
  ReturnedToMechanic: 'Returned to mechanic',
  AwaitingCustomer: 'Awaiting customer',
  CustomerResponded: 'Customer responded',
  ReleasedToMechanic: 'Released to mechanic',
  Cancelled: 'Cancelled',
};

const PROPOSAL_STATUS_TONES: Readonly<Record<string, StatusBadgeTone>> = {
  PendingManagerReview: 'warning',
  ReturnedToMechanic: 'info',
  AwaitingCustomer: 'primary',
  CustomerResponded: 'success',
  ReleasedToMechanic: 'success',
  Cancelled: 'neutral',
};

const CHANGE_REQUEST_STATUS_LABELS: Readonly<Record<string, string>> = {
  PendingManagerReview: 'Pending manager review',
  ForwardedToMechanic: 'Forwarded to mechanic',
  Declined: 'Declined',
  Acknowledged: 'Acknowledged',
};

const CHANGE_REQUEST_STATUS_TONES: Readonly<Record<string, StatusBadgeTone>> = {
  PendingManagerReview: 'warning',
  ForwardedToMechanic: 'info',
  Declined: 'danger',
  Acknowledged: 'success',
};

const SEVERITY_TONES: Readonly<Record<string, StatusBadgeTone>> = {
  Safe: 'success',
  Attention: 'warning',
  Urgent: 'danger',
};

const REALTIME_TONES: Readonly<
  Record<WorkshopRealtimeConnectionState, StatusBadgeTone>
> = {
  connecting: 'info',
  connected: 'success',
  reconnecting: 'warning',
  disconnected: 'neutral',
  unavailable: 'warning',
};

/**
 * K14/K15 FixProof Oversight Board & Workflow page (`/job-cards/fixproof`).
 *
 * Consumes component-scoped `FixProofStateService` and
 * `FixProofMutationStateService` (provided on `FixProofOversight`, never
 * root-scoped, so `ngOnDestroy()`, cancellation, protection unregistration,
 * and unresolved session notice handoff always run on route exit), route-scoped
 * `FixProofNavigationConfirmationService`, and root
 * `FixProofNavigationProtectionService` and `SignedMediaUrlService`.
 *
 * Security & scope invariants:
 * - Hosts FixProof oversight lists, linked inspection context, pricing review,
 *   K15 cost editor (`ProposalCostEditor`), K15 confirmed workflow actions
 *   (`FixProofWorkflowActions`), session notices, and manual recovery controls.
 * - Live `releaseProposal` remains disabled/gated (`B-01`), post-release
 *   `reviseItem` remains blocked (`B-07`), and live inspection media
 *   preview/download remains disabled while `BE-01`/`BE-02`/`F-A04-06` are
 *   unresolved; raw signed media URLs are never rendered or bound to DOM.
 * - Zero `bypassSecurityTrust*`, zero browser storage writes, zero automatic
 *   HTTP timeouts, and zero automatic mutation retries.
 */
@Component({
  selector: 'app-fixproof-oversight',
  standalone: true,
  providers: [FixProofStateService, FixProofMutationStateService],
  imports: [
    DatePipe,
    RouterLink,
    Alert,
    Button,
    Card,
    ConfirmationDialog,
    EmptyState,
    ErrorState,
    KpiCard,
    LoadingState,
    StatusBadge,
    ProposalCostEditor,
    FixProofWorkflowActions,
  ],
  templateUrl: './fixproof-oversight.html',
  styleUrl: './fixproof-oversight.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FixProofOversight implements OnInit {
  readonly state = inject(FixProofStateService);
  readonly mutation = inject(FixProofMutationStateService);
  readonly navigationProtection = inject(FixProofNavigationProtectionService);
  readonly confirmationDialog = inject(FixProofNavigationConfirmationService, {
    optional: true,
  });
  readonly realtime = inject(WorkshopRealtimeCoordinatorService, {
    optional: true,
  });

  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly signedMedia = inject(SignedMediaUrlService);
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

  private readonly pendingDeepLink = signal<{
    readonly kind: 'proposal' | 'change-request';
    readonly id: string;
  } | null>(null);

  readonly deepLinkNotice = signal<string | null>(null);

  readonly proposalStatusFilterOptions: readonly ProposalStatus[] =
    PROPOSAL_STATUSES;
  readonly proposalsLimit = FIXPROOF_PROPOSALS_LIST_LIMIT;
  readonly changeRequestsLimit = FIXPROOF_CHANGE_REQUESTS_LIST_LIMIT;

  readonly isAnyListLoading = computed(
    () => this.state.isProposalsLoading() || this.state.isChangeRequestsLoading(),
  );

  readonly pendingProposalCount = computed(() => {
    const rows = this.state.proposals();
    if (!rows) {
      return 0;
    }

    return rows.filter(row => row.status === 'PendingManagerReview').length;
  });

  readonly pendingChangeRequestCount = computed(() => {
    const rows = this.state.changeRequests();
    if (!rows) {
      return 0;
    }

    return rows.filter(row => row.status === 'PendingManagerReview').length;
  });

  readonly authFailureMessage = computed(() => {
    const failure = this.state.authFailure();
    if (failure === 'unauthorized') {
      return 'Your session is no longer authorized for FixProof oversight. Protected data has been cleared. Sign in again to continue.';
    }

    if (failure === 'forbidden') {
      return 'Your current account does not have permission to view FixProof oversight data. Protected data has been cleared.';
    }

    return null;
  });

  /**
   * Linked inspection findings evaluated safely without exposing raw signed
   * media URLs to templates or activating live media preview/download while
   * backend BE-01 / BE-02 / F-A04-06 remain unresolved.
   */
  readonly linkedIssues = computed<readonly FixProofLinkedIssueSummary[]>(() => {
    const detail = this.state.detail();
    if (!detail || this.state.accessRevoked()) {
      return [];
    }

    return detail.issues.map(issue => this.summarizeIssue(issue));
  });

  readonly showMutationRecoveryPanel = computed(() => {
    const phase = this.mutation.phase();
    return (
      phase !== 'idle' ||
      this.mutation.detachedRequestPending() ||
      this.mutation.hasUnresolvedOperation()
    );
  });

  readonly navConfirmOpen = computed(
    () => this.confirmationDialog?.pendingRequest() !== null && this.confirmationDialog !== null,
  );

  readonly navConfirmMessage = computed(
    () =>
      this.confirmationDialog?.pendingRequest()?.context.message ??
      'A FixProof action is still in progress or unresolved. Leaving this page does not establish the server outcome and does not roll back the request.',
  );

  constructor() {
    const unregisterHost = this.confirmationDialog?.registerHost();
    const releaseRealtime = this.realtime?.attachConsumer({
      kind: 'fixproof',
      getSelectedJobId: () => this.state.detail()?.job.id ?? null,
      isMutationBlocked: () =>
        this.mutation.isBusy() ||
        this.mutation.hasUnresolvedOperation() ||
        this.mutation.detachedRequestPending(),
      isAccessRevoked: () => this.state.accessRevoked(),
      hasAuthFailure: () => this.state.authFailure() !== null,
      refreshProposals: () => this.state.refreshProposals(),
      refreshChangeRequests: () => this.state.refreshChangeRequests(),
      refreshJobDetail: () => this.state.refreshDetail(),
    });
    this.destroyRef.onDestroy(() => {
      releaseRealtime?.();
      unregisterHost?.();
      this.state.cancelProposalsRequest();
      this.state.cancelChangeRequestsRequest();
      this.state.cancelDetailRequest();
    });

    // Apply deep-linked proposalId / changeRequestId once the corresponding list loads.
    effect(() => {
      const target = this.pendingDeepLink();
      if (this.state.accessRevoked()) {
        untracked(() => {
          this.pendingDeepLink.set(null);
          this.deepLinkNotice.set(null);
        });
        return;
      }

      if (!target) {
        return;
      }

      if (target.kind === 'proposal') {
        const rows = this.state.proposals();
        if (rows === null) {
          return;
        }
        untracked(() => {
          this.pendingDeepLink.set(null);
          if (rows.some(r => r.id.toLowerCase() === target.id.toLowerCase())) {
            this.deepLinkNotice.set(null);
            this.state.selectProposal(target.id);
          } else {
            this.deepLinkNotice.set(
              'The linked repair proposal was not found in the currently loaded list. Adjust the server status filter (such as Cancelled) or refresh.',
            );
          }
        });
      } else {
        const rows = this.state.changeRequests();
        if (rows === null) {
          return;
        }
        untracked(() => {
          this.pendingDeepLink.set(null);
          if (rows.some(r => r.id.toLowerCase() === target.id.toLowerCase())) {
            this.deepLinkNotice.set(null);
            this.state.selectChangeRequest(target.id);
          } else {
            this.deepLinkNotice.set(
              'The linked customer change request was not found in the currently loaded list. Disable Pending only or refresh to verify.',
            );
          }
        });
      }
    });
  }

  ngOnInit(): void {
    const sub = this.route?.queryParamMap.subscribe(params => {
      const rawProposalId = params.get('proposalId');
      const rawChangeRequestId = params.get('changeRequestId');

      if (rawProposalId !== null && rawProposalId.trim() !== '') {
        try {
          const validId = validateFixProofResourceId(
            rawProposalId,
            'proposalId',
          );
          this.deepLinkNotice.set(null);
          this.pendingDeepLink.set({ kind: 'proposal', id: validId });
        } catch (err: unknown) {
          this.pendingDeepLink.set(null);
          if (err instanceof FixProofRequestError) {
            this.deepLinkNotice.set(
              'The linked proposal identifier in the URL is not a valid UUID.',
            );
          }
        }
      } else if (
        rawChangeRequestId !== null &&
        rawChangeRequestId.trim() !== ''
      ) {
        try {
          const validId = validateFixProofResourceId(
            rawChangeRequestId,
            'changeRequestId',
          );
          this.deepLinkNotice.set(null);
          this.pendingDeepLink.set({ kind: 'change-request', id: validId });
        } catch (err: unknown) {
          this.pendingDeepLink.set(null);
          if (err instanceof FixProofRequestError) {
            this.deepLinkNotice.set(
              'The linked change request identifier in the URL is not a valid UUID.',
            );
          }
        }
      }
    });
    if (sub) {
      this.destroyRef.onDestroy(() => sub.unsubscribe());
    }

    this.state.refreshProposals();
    this.state.refreshChangeRequests();
  }

  dismissDeepLinkNotice(): void {
    this.deepLinkNotice.set(null);
  }

  refreshAll(): void {
    this.state.refreshProposals();
    this.state.refreshChangeRequests();
  }

  reconnectRealtime(): void {
    this.realtime?.reconnect();
  }

  refreshProposals(): void {
    this.state.refreshProposals();
  }

  cancelProposalsLoad(): void {
    this.state.cancelProposalsRequest();
  }

  onProposalServerStatusChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.state.setProposalStatusFilter(value === '' ? null : value);
  }

  onProposalSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.state.setProposalSearch(value);
  }

  onProposalLocalStatusChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.state.setProposalLocalStatus(value === '' ? null : value);
  }

  clearProposalFilters(): void {
    this.state.clearProposalLocalFilters();
  }

  refreshChangeRequests(): void {
    this.state.refreshChangeRequests();
  }

  cancelChangeRequestsLoad(): void {
    this.state.cancelChangeRequestsRequest();
  }

  onPendingOnlyToggle(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.state.setPendingOnly(checked);
  }

  onChangeRequestSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.state.setChangeRequestSearch(value);
  }

  onChangeRequestLocalStatusChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.state.setChangeRequestLocalStatus(value === '' ? null : value);
  }

  clearChangeRequestFilters(): void {
    this.state.clearChangeRequestLocalFilters();
  }

  selectProposal(proposalId: string): void {
    this.state.selectProposal(proposalId);
  }

  selectChangeRequest(changeRequestId: string): void {
    this.state.selectChangeRequest(changeRequestId);
  }

  refreshDetail(): void {
    this.state.refreshDetail();
  }

  cancelDetailLoad(): void {
    this.state.cancelDetailRequest();
  }

  clearSelection(): void {
    this.state.clearSelection();
  }

  dismissSessionNotice(noticeId: number): void {
    this.navigationProtection.dismissNotice(noticeId);
  }

  dismissAllSessionNotices(): void {
    this.navigationProtection.dismissAllNotices();
  }

  stopWaitingForMutation(): void {
    this.mutation.stopWaiting();
  }

  cancelMutationPreflight(): void {
    this.mutation.cancelPreflight();
  }

  reconcileMutation(): void {
    this.mutation.reconcile();
  }

  cancelMutationReconciliation(): void {
    this.mutation.cancelReconciliation();
  }

  acknowledgeMutation(): void {
    this.mutation.acknowledge({ reviewed: true });
  }

  dismissMutationOutcome(): void {
    this.mutation.dismissOutcome();
  }

  confirmLeaveNavigation(): void {
    this.confirmationDialog?.confirm();
  }

  cancelLeaveNavigation(): void {
    this.confirmationDialog?.cancel();
  }

  isSelected(kind: 'proposal' | 'change-request', id: string): boolean {
    const current = this.state.selected();
    return (
      current !== null &&
      current.kind === kind &&
      current.id.toLowerCase() === id.toLowerCase()
    );
  }

  proposalStatusLabel(status: string): string {
    return PROPOSAL_STATUS_LABELS[status] ?? status;
  }

  proposalStatusTone(status: string): StatusBadgeTone {
    return PROPOSAL_STATUS_TONES[status] ?? 'neutral';
  }

  changeRequestStatusLabel(status: string): string {
    return CHANGE_REQUEST_STATUS_LABELS[status] ?? status;
  }

  changeRequestStatusTone(status: string): StatusBadgeTone {
    return CHANGE_REQUEST_STATUS_TONES[status] ?? 'neutral';
  }

  formatAmount(amount: number): string {
    const parsed = parseMoneyToCents(amount);
    return parsed.ok ? formatCents(parsed.cents) : String(amount);
  }

  private summarizeIssue(issue: IssueDto): FixProofLinkedIssueSummary {
    const results = this.signedMedia.resolveAll(issue.mediaUrls);
    let validMediaCount = 0;
    let expiredMediaCount = 0;
    let unsupportedOrRejectedCount = 0;

    for (const res of results) {
      if (res.status === 'valid' && res.previewHint !== 'unsupported') {
        validMediaCount += 1;
      } else if (res.status === 'expired') {
        expiredMediaCount += 1;
      } else {
        unsupportedOrRejectedCount += 1;
      }
    }

    return {
      id: issue.id,
      component: issue.component,
      findingEn: issue.findingEn,
      findingTa: issue.findingTa,
      recommendationEn: issue.recommendationEn,
      recommendationTa: issue.recommendationTa,
      severity: issue.severity,
      severityTone: SEVERITY_TONES[issue.severity] ?? 'neutral',
      reportVersion: issue.reportVersion,
      confirmedAt: issue.confirmedAt,
      mediaCount: issue.mediaUrls.length,
      validMediaCount,
      expiredMediaCount,
      unsupportedOrRejectedCount,
    };
  }
}
