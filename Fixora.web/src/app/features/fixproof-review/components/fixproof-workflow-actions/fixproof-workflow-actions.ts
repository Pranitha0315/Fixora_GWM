import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';

import { Alert } from '../../../../shared/components/alert/alert';
import { Button } from '../../../../shared/components/button/button';
import { ConfirmationDialog } from '../../../../shared/components/confirmation-dialog/confirmation-dialog';
import type { ConfirmationTone } from '../../../../shared/components/confirmation-dialog/confirmation-dialog';

import { FixProofMutationStateService } from '../../services/fixproof-mutation-state.service';
import { FixProofStateService } from '../../services/fixproof-state.service';

export type WorkflowMutationActionKind =
  | 'forward-proposal'
  | 'return-proposal'
  | 'forward-change-request'
  | 'decline-change-request';

interface PendingWorkflowConfirmation {
  readonly action: WorkflowMutationActionKind;
  readonly entityId: string;
  readonly note: string | null;
  readonly title: string;
  readonly message: string;
  readonly confirmText: string;
  readonly tone: ConfirmationTone;
}

/**
 * K15 FixProof Mutation Workflow Actions component.
 *
 * Exposes confirmed, single-dispatch manager actions for the currently selected
 * proposal or customer change request via feature-scoped
 * `FixProofMutationStateService`:
 * - Proposal: `forwardProposal`, `returnProposal` (mandatory reason).
 * - Proposal `releaseProposal`: permanently disabled/gated pending backend `B-01`.
 * - Change Request: `forwardChangeRequest`, `declineChangeRequest` (mandatory reason).
 *
 * Security invariants:
 * - Zero live `releaseProposal` invocation while `B-01` remains open.
 * - Mandatory non-blank reasons enforced before confirmation for Return & Decline.
 * - Explicit `<fx-confirmation-dialog>` before single dispatch; zero auto-retries.
 * - Clears drafts & closes dialog on selection switch, access loss, or completion.
 */
@Component({
  selector: 'app-fixproof-workflow-actions',
  standalone: true,
  imports: [Alert, Button, ConfirmationDialog],
  templateUrl: './fixproof-workflow-actions.html',
  styleUrl: './fixproof-workflow-actions.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FixProofWorkflowActions {
  readonly state = inject(FixProofStateService);
  readonly mutation = inject(FixProofMutationStateService);

  readonly forwardNoteDraft = signal('');
  readonly mandatoryReasonDraft = signal('');
  readonly reasonTouched = signal(false);
  readonly pendingConfirmation = signal<PendingWorkflowConfirmation | null>(null);

  readonly proposal = computed(() => this.state.selectedProposal());
  readonly proposalActions = computed(() => this.state.proposalActions());

  readonly changeRequest = computed(() => this.state.selectedChangeRequest());
  readonly changeRequestActions = computed(() =>
    this.state.changeRequestActions(),
  );

  readonly canForwardProposal = computed(
    () =>
      !this.state.accessRevoked() &&
      this.mutation.canExecute() &&
      this.proposalActions()?.forward.actionReady === true,
  );

  readonly canReturnProposal = computed(
    () =>
      !this.state.accessRevoked() &&
      this.mutation.canExecute() &&
      this.proposalActions()?.returnToMechanic.actionReady === true,
  );

  readonly canForwardChangeRequest = computed(
    () =>
      !this.state.accessRevoked() &&
      this.mutation.canExecute() &&
      this.changeRequestActions()?.forward.actionReady === true,
  );

  readonly canDeclineChangeRequest = computed(
    () =>
      !this.state.accessRevoked() &&
      this.mutation.canExecute() &&
      this.changeRequestActions()?.decline.actionReady === true,
  );

  readonly trimmedReason = computed(() => this.mandatoryReasonDraft().trim());

  readonly mandatoryReasonError = computed<string | null>(() => {
    if (!this.reasonTouched()) {
      return null;
    }

    return this.trimmedReason().length === 0
      ? 'A non-blank manager reason is required before submitting.'
      : null;
  });

  private lastSelectedKey: string | null = null;

  constructor() {
    effect(() => {
      const selected = this.state.selected();
      const selectedKey = selected ? `${selected.kind}:${selected.id}` : null;
      const revoked = this.state.accessRevoked();
      const phase = this.mutation.phase();

      untracked(() => {
        const selectionChanged = selectedKey !== this.lastSelectedKey;
        this.lastSelectedKey = selectedKey;
        if (selectionChanged || revoked || phase === 'succeeded') {
          this.resetForm();
        }
      });
    });
  }

  onForwardNoteInput(event: Event): void {
    this.forwardNoteDraft.set((event.target as HTMLTextAreaElement).value);
  }

  onMandatoryReasonInput(event: Event): void {
    this.mandatoryReasonDraft.set((event.target as HTMLTextAreaElement).value);
    if (this.reasonTouched() && this.mandatoryReasonDraft().trim().length > 0) {
      this.reasonTouched.set(false);
    }
  }

  requestForwardProposal(): void {
    const prop = this.proposal();
    if (!prop || !this.canForwardProposal()) {
      return;
    }

    const note = this.forwardNoteDraft().trim() || null;
    this.pendingConfirmation.set({
      action: 'forward-proposal',
      entityId: prop.id,
      note,
      title: 'Forward proposal to customer',
      message: `Forward proposal for job ${prop.jobNumber} to the customer for approval? A fresh authoritative preflight check will run before dispatching a single request.`,
      confirmText: 'Forward to customer',
      tone: 'primary',
    });
  }

  requestReturnProposal(): void {
    const prop = this.proposal();
    if (!prop || !this.canReturnProposal()) {
      return;
    }

    const reason = this.trimmedReason();
    if (reason.length === 0) {
      this.reasonTouched.set(true);
      return;
    }

    this.pendingConfirmation.set({
      action: 'return-proposal',
      entityId: prop.id,
      note: reason,
      title: 'Return proposal to mechanic',
      message: `Return proposal for job ${prop.jobNumber} to the mechanic with your required reason? A single request will be dispatched after authoritative preflight.`,
      confirmText: 'Return to mechanic',
      tone: 'warning',
    });
  }

  requestForwardChangeRequest(): void {
    const cr = this.changeRequest();
    if (!cr || !this.canForwardChangeRequest()) {
      return;
    }

    const note = this.forwardNoteDraft().trim() || null;
    this.pendingConfirmation.set({
      action: 'forward-change-request',
      entityId: cr.id,
      note,
      title: 'Forward change request to mechanic',
      message: `Forward customer change request ${cr.number} (job ${cr.jobNumber}) to the mechanic? A single request will be dispatched after authoritative preflight.`,
      confirmText: 'Forward request',
      tone: 'primary',
    });
  }

  requestDeclineChangeRequest(): void {
    const cr = this.changeRequest();
    if (!cr || !this.canDeclineChangeRequest()) {
      return;
    }

    const reason = this.trimmedReason();
    if (reason.length === 0) {
      this.reasonTouched.set(true);
      return;
    }

    this.pendingConfirmation.set({
      action: 'decline-change-request',
      entityId: cr.id,
      note: reason,
      title: 'Decline customer change request',
      message: `Decline customer change request ${cr.number} (job ${cr.jobNumber}) with your mandatory reason? A single request will be dispatched after authoritative preflight.`,
      confirmText: 'Decline request',
      tone: 'danger',
    });
  }

  cancelConfirmation(): void {
    this.pendingConfirmation.set(null);
  }

  confirmWorkflowAction(): void {
    const pending = this.pendingConfirmation();
    this.pendingConfirmation.set(null);
    if (!pending || this.state.accessRevoked() || !this.mutation.canExecute()) {
      return;
    }

    switch (pending.action) {
      case 'forward-proposal':
        this.mutation.forwardProposal(pending.entityId, pending.note);
        break;
      case 'return-proposal':
        if (pending.note) {
          this.mutation.returnProposal(pending.entityId, pending.note);
        }
        break;
      case 'forward-change-request':
        this.mutation.forwardChangeRequest(pending.entityId, pending.note);
        break;
      case 'decline-change-request':
        if (pending.note) {
          this.mutation.declineChangeRequest(pending.entityId, pending.note);
        }
        break;
    }
  }

  private resetForm(): void {
    this.forwardNoteDraft.set('');
    this.mandatoryReasonDraft.set('');
    this.reasonTouched.set(false);
    this.pendingConfirmation.set(null);
  }
}
