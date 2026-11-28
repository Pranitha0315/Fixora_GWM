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
import { StatusBadge } from '../../../../shared/components/status-badge/status-badge';
import type { StatusBadgeTone } from '../../../../shared/components/status-badge/status-badge';

import type {
  FixProofRevisionImpactResult,
  RepairItemDto,
  RevisionImpactTrigger,
} from '../../models/fixproof.model';
import {
  calculateLineAmountCents,
  evaluateRevisionImpact,
  formatCents,
  parseMoneyToCents,
  parseQuantity,
} from '../../utils/fixproof-pricing.util';
import { FixProofMutationStateService } from '../../services/fixproof-mutation-state.service';
import {
  FixProofStateService,
  type FixProofItemActionAvailability,
} from '../../services/fixproof-state.service';

export type CostEditorActionMode = 'set-price' | 'revise';

interface PendingItemConfirmation {
  readonly mode: CostEditorActionMode;
  readonly proposalId: string;
  readonly itemId: string;
  readonly itemTitle: string;
  readonly unitPrice: number;
  readonly unitPriceFormatted: string;
  readonly qty: number;
  readonly lineAmountFormatted: string;
  readonly message: string;
}

const ITEM_STATUS_TONES: Readonly<Record<string, StatusBadgeTone>> = {
  Proposed: 'info',
  AwaitingCustomer: 'primary',
  Approved: 'success',
  Rejected: 'danger',
  Released: 'success',
};

const TRIGGER_LABELS: Readonly<Record<RevisionImpactTrigger, string>> = {
  'previously-unaccepted': 'Item was not previously accepted by the customer',
  'quantity-changed': 'Quantity changed from current value',
  'zero-to-positive': 'Line amount increases from 0.00 to a positive amount',
  'exceeds-tolerance': 'Line amount increase exceeds the 10% BR-FP-08 tolerance',
};

/**
 * K15 Repair Proposal & Cost Editor component.
 *
 * Consumes feature-scoped `FixProofStateService` and
 * `FixProofMutationStateService` from the host route injector.
 *
 * Security & financial invariants:
 * - Pre-forward (`setItemPrice`) and post-forward pre-release (`reviseItem`)
 *   only; post-release revision remains blocked (`B-07`).
 * - Uses exact `BigInt` scaled-integer arithmetic (`parseMoneyToCents`,
 *   `parseQuantity`, `evaluateRevisionImpact`) for validation and indicative
 *   BR-FP-08 preview; server-returned `ProposalDto` totals remain authoritative.
 * - Zero add/remove item CRUD, zero optimistic updates, zero automatic retries.
 */
@Component({
  selector: 'app-proposal-cost-editor',
  standalone: true,
  imports: [Alert, Button, ConfirmationDialog, StatusBadge],
  templateUrl: './proposal-cost-editor.html',
  styleUrl: './proposal-cost-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProposalCostEditor {
  readonly state = inject(FixProofStateService);
  readonly mutation = inject(FixProofMutationStateService);

  readonly editingItemId = signal<string | null>(null);
  readonly editingMode = signal<CostEditorActionMode | null>(null);
  readonly unitPriceDraft = signal('');
  readonly qtyDraft = signal('');
  readonly pendingConfirmation = signal<PendingItemConfirmation | null>(null);

  readonly proposal = computed(() => this.state.selectedProposal());
  readonly actions = computed(() => this.state.proposalActions());

  readonly isPostReleaseBlocked = computed(() => {
    const prop = this.proposal();
    return prop?.status === 'ReleasedToMechanic';
  });

  readonly activeItem = computed<RepairItemDto | null>(() => {
    const id = this.editingItemId();
    const prop = this.proposal();
    if (!id || !prop) {
      return null;
    }

    return prop.items.find(item => item.id === id) ?? null;
  });

  readonly parsedUnitPrice = computed(() =>
    parseMoneyToCents(this.unitPriceDraft()),
  );

  readonly parsedQty = computed(() => parseQuantity(this.qtyDraft()));

  readonly unitPriceError = computed<string | null>(() => {
    const parsed = this.parsedUnitPrice();
    if (parsed.ok) {
      return null;
    }

    switch (parsed.error) {
      case 'required':
        return 'Unit price is required.';
      case 'negative':
        return 'Unit price cannot be negative.';
      case 'excessive-precision':
        return 'Unit price may have at most 2 decimal places.';
      case 'overflow':
        return 'Unit price exceeds the maximum supported monetary precision.';
      default:
        return 'Enter a valid non-negative decimal price (e.g. 1250.00).';
    }
  });

  readonly qtyError = computed<string | null>(() => {
    const parsed = this.parsedQty();
    if (parsed.ok) {
      return null;
    }

    switch (parsed.error) {
      case 'required':
        return 'Quantity is required.';
      case 'non-positive':
        return 'Quantity must be a whole number of at least 1.';
      case 'overflow':
        return 'Quantity exceeds the maximum integer limit.';
      default:
        return 'Enter a whole number quantity (e.g. 1, 2).';
    }
  });

  readonly calculatedLineAmount = computed<string | null>(() => {
    const price = this.parsedUnitPrice();
    const qty = this.parsedQty();
    if (!price.ok || !qty.ok) {
      return null;
    }

    const total = calculateLineAmountCents(price.cents, qty.qty);
    return total !== null ? formatCents(total) : null;
  });

  readonly lineOverflowError = computed<string | null>(() => {
    const price = this.parsedUnitPrice();
    const qty = this.parsedQty();
    if (!price.ok || !qty.ok) {
      return null;
    }

    return calculateLineAmountCents(price.cents, qty.qty) === null
      ? 'Calculated line amount exceeds the maximum supported SQL decimal limit.'
      : null;
  });

  readonly revisionImpact = computed<FixProofRevisionImpactResult | null>(() => {
    if (this.editingMode() !== 'revise') {
      return null;
    }

    const item = this.activeItem();
    if (!item || this.unitPriceError() || this.qtyError() || this.lineOverflowError()) {
      return null;
    }

    return evaluateRevisionImpact({
      currentUnitPrice: item.unitPrice,
      currentQty: item.qty,
      currentItemStatus: item.status,
      proposedUnitPrice: this.unitPriceDraft(),
      proposedQty: this.qtyDraft(),
    });
  });

  readonly canSubmitEdit = computed(() => {
    const item = this.activeItem();
    const mode = this.editingMode();
    if (!item || !mode) {
      return false;
    }

    if (this.state.accessRevoked() || !this.mutation.canExecute()) {
      return false;
    }

    if (
      this.unitPriceError() !== null ||
      this.qtyError() !== null ||
      this.lineOverflowError() !== null
    ) {
      return false;
    }

    const avail = this.availabilityFor(item.id);
    if (!avail) {
      return false;
    }

    return mode === 'set-price'
      ? avail.setPrice.actionReady
      : avail.revise.actionReady;
  });

  constructor() {
    // Clear drafts & close confirmation on selection change, access revocation, or mutation success.
    effect(() => {
      this.proposal()?.id;
      const revoked = this.state.accessRevoked();
      const phase = this.mutation.phase();

      untracked(() => {
        if (revoked || phase === 'succeeded') {
          this.cancelEdit();
        } else {
          // If the currently edited item no longer exists on the active proposal, reset.
          const currentId = this.editingItemId();
          const prop = this.proposal();
          if (currentId && (!prop || !prop.items.some(i => i.id === currentId))) {
            this.cancelEdit();
          }
        }
      });
    });
  }

  availabilityFor(itemId: string): FixProofItemActionAvailability | null {
    const actions = this.actions();
    if (!actions) {
      return null;
    }

    return actions.items.find(entry => entry.itemId === itemId) ?? null;
  }

  isItemBlockedPostRelease(item: RepairItemDto): boolean {
    if (this.isPostReleaseBlocked() || item.status === 'Released') {
      return true;
    }

    const reason = this.availabilityFor(item.id)?.revise.eligibility?.reason;
    return (
      reason === 'released-proposal-revision-restricted' ||
      reason === 'released-item-revision-restricted'
    );
  }

  itemStatusTone(status: string): StatusBadgeTone {
    return ITEM_STATUS_TONES[status] ?? 'neutral';
  }

  formatAmount(value: number): string {
    const parsed = parseMoneyToCents(value);
    return parsed.ok ? formatCents(parsed.cents) : String(value);
  }

  triggerLabel(trigger: RevisionImpactTrigger): string {
    return TRIGGER_LABELS[trigger];
  }

  startEdit(item: RepairItemDto, mode: CostEditorActionMode): void {
    if (this.state.accessRevoked() || !this.mutation.canExecute()) {
      return;
    }

    const avail = this.availabilityFor(item.id);
    if (!avail) {
      return;
    }

    const allowed =
      mode === 'set-price'
        ? avail.setPrice.actionReady
        : avail.revise.actionReady;
    if (!allowed) {
      return;
    }

    this.pendingConfirmation.set(null);
    this.editingItemId.set(item.id);
    this.editingMode.set(mode);
    this.unitPriceDraft.set(this.formatAmount(item.unitPrice));
    this.qtyDraft.set(String(item.qty));
  }

  cancelEdit(): void {
    this.editingItemId.set(null);
    this.editingMode.set(null);
    this.unitPriceDraft.set('');
    this.qtyDraft.set('');
    this.pendingConfirmation.set(null);
  }

  onUnitPriceInput(event: Event): void {
    this.unitPriceDraft.set((event.target as HTMLInputElement).value);
  }

  onQtyInput(event: Event): void {
    this.qtyDraft.set((event.target as HTMLInputElement).value);
  }

  requestSubmitConfirmation(): void {
    if (!this.canSubmitEdit()) {
      return;
    }

    const prop = this.proposal();
    const item = this.activeItem();
    const mode = this.editingMode();
    const price = this.parsedUnitPrice();
    const qty = this.parsedQty();
    const lineAmountFormatted = this.calculatedLineAmount();

    if (!prop || !item || !mode || !price.ok || !qty.ok || !lineAmountFormatted) {
      return;
    }

    let impactNote = '';
    if (mode === 'revise') {
      const impact = this.revisionImpact();
      if (impact && impact.ok) {
        impactNote = impact.needsRenewedApproval
          ? ' Indicative BR-FP-08 check: renewed customer approval will likely be required.'
          : ' Indicative BR-FP-08 check: within 10% tolerance (server remains authoritative).';
      }
    }

    const actionLabel =
      mode === 'set-price' ? 'Set pre-forward price' : 'Submit post-forward revision';

    this.pendingConfirmation.set({
      mode,
      proposalId: prop.id,
      itemId: item.id,
      itemTitle: item.title,
      unitPrice: price.numericValue,
      unitPriceFormatted: price.formatted,
      qty: qty.qty,
      lineAmountFormatted,
      message: `${actionLabel} for "${item.title}": ${qty.qty} x ${price.formatted} = ${lineAmountFormatted}.${impactNote} The server will perform an authoritative preflight check and return authoritative totals.`,
    });
  }

  cancelConfirmation(): void {
    this.pendingConfirmation.set(null);
  }

  confirmSubmit(): void {
    const pending = this.pendingConfirmation();
    this.pendingConfirmation.set(null);
    if (!pending || this.state.accessRevoked() || !this.mutation.canExecute()) {
      return;
    }

    if (pending.mode === 'set-price') {
      this.mutation.setItemPrice(pending.proposalId, pending.itemId, {
        unitPrice: pending.unitPrice,
        qty: pending.qty,
      });
    } else {
      this.mutation.reviseItem(pending.proposalId, pending.itemId, {
        unitPrice: pending.unitPrice,
        qty: pending.qty,
      });
    }
  }
}
