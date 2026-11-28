import {
  FIXPROOF_MAX_QTY,
  PROPOSAL_STATUSES,
  CHANGE_REQUEST_STATUSES,
} from '../models/fixproof.model';

import type {
  ProposalManagerAction,
} from '../models/fixproof.model';

import {
  calculateLineAmountCents,
  evaluateChangeRequestActionEligibility,
  evaluateProposalActionEligibility,
  evaluateProposalItemEditEligibility,
  evaluateProposalItemRevisionEligibility,
  evaluateRevisionImpact,
  formatCents,
  getBackendChangeRequestActionSupport,
  getBackendProposalActionSupport,
  parseMoneyToCents,
  parseQuantity,
} from './fixproof-pricing.util';

describe('fixproof-pricing.util', () => {
  describe('parseMoneyToCents, parseQuantity, and overflow checks', () => {
    it('parses valid monetary values into exact BigInt cents', () => {
      expect(parseMoneyToCents('0')).toEqual({
        ok: true,
        cents: 0n,
        numericValue: 0,
        formatted: '0.00',
      });
      expect(parseMoneyToCents('4200.5')).toEqual({
        ok: true,
        cents: 420050n,
        numericValue: 4200.5,
        formatted: '4200.50',
      });
      expect(parseMoneyToCents(0.11)).toEqual({
        ok: true,
        cents: 11n,
        numericValue: 0.11,
        formatted: '0.11',
      });
      expect(formatCents(-420050n)).toBe('-4200.50');
    });

    it('rejects invalid decimals, negative values, excessive precision, and overflow', () => {
      expect(parseMoneyToCents('')).toEqual({ ok: false, error: 'required' });
      expect(parseMoneyToCents('-10.00')).toEqual({
        ok: false,
        error: 'negative',
      });
      expect(parseMoneyToCents(-0.01)).toEqual({
        ok: false,
        error: 'negative',
      });
      expect(parseMoneyToCents('10.123')).toEqual({
        ok: false,
        error: 'excessive-precision',
      });
      expect(parseMoneyToCents(0.001)).toEqual({
        ok: false,
        error: 'excessive-precision',
      });
      expect(parseMoneyToCents(1e-7)).toEqual({
        ok: false,
        error: 'excessive-precision',
      });
      expect(parseMoneyToCents('1e5')).toEqual({
        ok: false,
        error: 'invalid-format',
      });
      expect(parseMoneyToCents('.50')).toEqual({
        ok: false,
        error: 'invalid-format',
      });
      expect(parseMoneyToCents(Number.NaN)).toEqual({
        ok: false,
        error: 'invalid-format',
      });
      expect(parseMoneyToCents('90071992547409.92')).toEqual({
        ok: false,
        error: 'overflow',
      });
      expect(parseMoneyToCents(1e21)).toEqual({
        ok: false,
        error: 'overflow',
      });
    });

    it('enforces the collision-free IEEE-754 cent boundary (< 2^46) and rejects colliding cent prices', () => {
      const boundary = parseMoneyToCents('70368744177663.99');
      const boundaryMinusOne = parseMoneyToCents('70368744177663.98');

      expect(boundary).toEqual({
        ok: true,
        cents: 7_036_874_417_766_399n,
        numericValue: 70368744177663.99,
        formatted: '70368744177663.99',
      });
      expect(boundaryMinusOne).toEqual({
        ok: true,
        cents: 7_036_874_417_766_398n,
        numericValue: 70368744177663.98,
        formatted: '70368744177663.98',
      });
      if (boundary.ok && boundaryMinusOne.ok) {
        expect(boundary.numericValue).not.toBe(boundaryMinusOne.numericValue);
      }

      for (let cent = 0; cent <= 99; cent += 1) {
        const input = `70368744177663.${String(cent).padStart(2, '0')}`;
        const parsed = parseMoneyToCents(input);
        expect(parsed.ok).toBe(true);
        if (parsed.ok) {
          const roundTripped = parseMoneyToCents(String(parsed.numericValue));
          expect(roundTripped).toEqual(parsed);
        }
      }

      // Above 2^46 (70_368_744_177_664.00), IEEE-754 binary64 ulp becomes 0.015625 > 0.01
      // and .01/.02 collide onto the same float64 value; reject before HTTP.
      expect(Number('70368744177664.01')).toBe(Number('70368744177664.02'));
      for (const unsafe of [
        '70368744177664.00',
        '70368744177664.01',
        '70368744177664.02',
        '90071992547409.91',
      ]) {
        expect(parseMoneyToCents(unsafe)).toEqual({
          ok: false,
          error: 'overflow',
        });
      }
    });

    it('enforces Int32 positive quantity bounds', () => {
      expect(parseQuantity(1)).toEqual({ ok: true, qty: 1 });
      expect(parseQuantity(FIXPROOF_MAX_QTY)).toEqual({
        ok: true,
        qty: FIXPROOF_MAX_QTY,
      });
      expect(parseQuantity('25')).toEqual({ ok: true, qty: 25 });

      expect(parseQuantity('')).toEqual({ ok: false, error: 'required' });
      expect(parseQuantity(0)).toEqual({ ok: false, error: 'non-positive' });
      expect(parseQuantity('0')).toEqual({ ok: false, error: 'non-positive' });
      expect(parseQuantity(-3)).toEqual({ ok: false, error: 'non-positive' });
      expect(parseQuantity('-3')).toEqual({ ok: false, error: 'non-positive' });
      expect(parseQuantity(1.5)).toEqual({ ok: false, error: 'invalid-format' });
      expect(parseQuantity('1.5')).toEqual({
        ok: false,
        error: 'invalid-format',
      });
      expect(parseQuantity(FIXPROOF_MAX_QTY + 1)).toEqual({
        ok: false,
        error: 'overflow',
      });
      expect(parseQuantity('2147483648')).toEqual({
        ok: false,
        error: 'overflow',
      });
    });

    it('detects SQL decimal(18, 2) line-total overflow', () => {
      expect(calculateLineAmountCents(9_000_000_000_000_000n, 100)).toBe(
        900_000_000_000_000_000n,
      );
      expect(
        calculateLineAmountCents(9_000_000_000_000_000n, 1000),
      ).toBeNull();
    });
  });

  describe('BR-FP-08 evaluateRevisionImpact (exact BigInt)', () => {
    it('keeps approval on an exact 10% increase for an approved item', () => {
      const res = evaluateRevisionImpact({
        currentUnitPrice: '4000.00',
        currentQty: 1,
        currentItemStatus: 'Approved',
        proposedUnitPrice: '4400.00',
        proposedQty: 1,
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.indicative).toBe(true);
        expect(res.exceedsTolerance).toBe(false);
        expect(res.needsRenewedApproval).toBe(false);
        expect(res.triggers).toEqual([]);
        expect(res.deltaFormatted).toBe('400.00');
      }
    });

    it('avoids IEEE-754 floating-point bug on exact 10% increase (0.10 -> 0.11)', () => {
      // In IEEE-754 binary float, (0.11 - 0.10) / 0.10 === 0.10000000000000009 > 0.10.
      const res = evaluateRevisionImpact({
        currentUnitPrice: 0.1,
        currentQty: 1,
        currentItemStatus: 'Approved',
        proposedUnitPrice: 0.11,
        proposedQty: 1,
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.exceedsTolerance).toBe(false);
        expect(res.needsRenewedApproval).toBe(false);
      }
    });

    it('requires renewed approval when increase exceeds 10% by 1 cent', () => {
      const res = evaluateRevisionImpact({
        currentUnitPrice: '4000.00',
        currentQty: 1,
        currentItemStatus: 'Approved',
        proposedUnitPrice: '4400.01',
        proposedQty: 1,
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.exceedsTolerance).toBe(true);
        expect(res.needsRenewedApproval).toBe(true);
        expect(res.triggers).toEqual(['exceeds-tolerance']);
      }
    });

    it('keeps approval on a price decrease when previously accepted and qty unchanged', () => {
      const res = evaluateRevisionImpact({
        currentUnitPrice: 4200,
        currentQty: 1,
        currentItemStatus: 'Approved',
        proposedUnitPrice: 3500,
        proposedQty: 1,
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.exceedsTolerance).toBe(false);
        expect(res.needsRenewedApproval).toBe(false);
        expect(res.deltaFormatted).toBe('-700.00');
      }
    });

    it('requires renewed approval on any quantity change even if total decreases', () => {
      const res = evaluateRevisionImpact({
        currentUnitPrice: 1000,
        currentQty: 2,
        currentItemStatus: 'Approved',
        proposedUnitPrice: 1000,
        proposedQty: 1,
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.qtyChanged).toBe(true);
        expect(res.exceedsTolerance).toBe(false);
        expect(res.needsRenewedApproval).toBe(true);
        expect(res.triggers).toEqual(['quantity-changed']);
      }
    });

    it('requires renewed approval for previously unaccepted items even on price decrease', () => {
      for (const status of ['Proposed', 'AwaitingCustomer', 'Rejected']) {
        const res = evaluateRevisionImpact({
          currentUnitPrice: 4200,
          currentQty: 1,
          currentItemStatus: status,
          proposedUnitPrice: 3000,
          proposedQty: 1,
        });

        expect(res.ok).toBe(true);
        if (res.ok) {
          expect(res.wasAccepted).toBe(false);
          expect(res.needsRenewedApproval).toBe(true);
          expect(res.triggers).toContain('previously-unaccepted');
        }
      }
    });

    it('handles zero-to-positive vs zero-to-zero amounts per Approvals.cs:156', () => {
      const zeroToPositive = evaluateRevisionImpact({
        currentUnitPrice: 0,
        currentQty: 1,
        currentItemStatus: 'Approved',
        proposedUnitPrice: '0.01',
        proposedQty: 1,
      });
      expect(zeroToPositive.ok).toBe(true);
      if (zeroToPositive.ok) {
        expect(zeroToPositive.exceedsTolerance).toBe(true);
        expect(zeroToPositive.needsRenewedApproval).toBe(true);
        expect(zeroToPositive.triggers).toEqual(['zero-to-positive']);
      }

      const zeroToZero = evaluateRevisionImpact({
        currentUnitPrice: 0,
        currentQty: 1,
        currentItemStatus: 'Approved',
        proposedUnitPrice: 0,
        proposedQty: 1,
      });
      expect(zeroToZero.ok).toBe(true);
      if (zeroToZero.ok) {
        expect(zeroToZero.exceedsTolerance).toBe(false);
        expect(zeroToZero.needsRenewedApproval).toBe(false);
      }
    });

    it('returns structured error for unknown item status or amount overflow', () => {
      expect(
        evaluateRevisionImpact({
          currentUnitPrice: 100,
          currentQty: 1,
          currentItemStatus: 'UnknownStatus',
          proposedUnitPrice: 100,
          proposedQty: 1,
        }),
      ).toEqual({ ok: false, error: 'unknown-item-status' });

      expect(
        evaluateRevisionImpact({
          currentUnitPrice: 100,
          currentQty: 1,
          currentItemStatus: 'Approved',
          proposedUnitPrice: '50000000000000.00',
          proposedQty: 1000,
        }),
      ).toEqual({ ok: false, error: 'amount-overflow' });
    });
  });

  describe('proposal & change-request eligibility + frontend safety restrictions', () => {
    it('matches exact backend support matrix across all ProposalStatus values', () => {
      const expected: Record<string, readonly ProposalManagerAction[]> = {
        PendingManagerReview: ['set-price', 'forward', 'return'],
        ReturnedToMechanic: [],
        AwaitingCustomer: ['revise'],
        CustomerResponded: ['release', 'revise'],
        ReleasedToMechanic: ['revise'],
        Cancelled: [],
      };

      const allActions: readonly ProposalManagerAction[] = [
        'set-price',
        'forward',
        'return',
        'release',
        'revise',
      ];

      for (const status of PROPOSAL_STATUSES) {
        for (const action of allActions) {
          expect(getBackendProposalActionSupport(status, action)).toBe(
            expected[status].includes(action),
          );
        }
      }

      expect(getBackendProposalActionSupport('FutureStatus', 'forward')).toBeNull();
    });

    it('blocks revision of ReleasedToMechanic proposals even though backend supports it', () => {
      const proposalElig = evaluateProposalActionEligibility(
        'ReleasedToMechanic',
        'revise',
        { jobStatus: 'InProgress' },
      );

      expect(proposalElig.backendSupported).toBe(true);
      expect(proposalElig.frontendAllowed).toBe(false);
      expect(proposalElig.status).toBe('blocked-by-frontend-safety');
      expect(proposalElig.reason).toBe('released-proposal-revision-restricted');
    });

    it('blocks revision of Released items even on AwaitingCustomer / CustomerResponded proposals', () => {
      const itemElig = evaluateProposalItemRevisionEligibility(
        'AwaitingCustomer',
        'Released',
        { jobStatus: 'AwaitingCustomerApproval' },
      );

      expect(itemElig.backendSupported).toBe(true);
      expect(itemElig.frontendAllowed).toBe(false);
      expect(itemElig.status).toBe('blocked-by-frontend-safety');
      expect(itemElig.reason).toBe('released-item-revision-restricted');
    });

    it('blocks mutations on Completed or Closed jobs when authoritative job status is known', () => {
      for (const terminal of ['Completed', 'Closed']) {
        const proposalElig = evaluateProposalActionEligibility(
          'PendingManagerReview',
          'forward',
          { jobStatus: terminal },
        );
        expect(proposalElig.backendSupported).toBe(true);
        expect(proposalElig.frontendAllowed).toBe(false);
        expect(proposalElig.status).toBe('blocked-by-frontend-safety');
        expect(proposalElig.reason).toBe('terminal-job-status');

        const crElig = evaluateChangeRequestActionEligibility(
          'PendingManagerReview',
          'forward',
          { jobStatus: terminal },
        );
        expect(crElig.backendSupported).toBe(true);
        expect(crElig.frontendAllowed).toBe(false);
        expect(crElig.status).toBe('blocked-by-frontend-safety');
        expect(crElig.reason).toBe('terminal-job-status');
      }
    });

    it('treats missing or unknown authoritative job status as unresolved, never automatically allowed', () => {
      const missing = evaluateProposalActionEligibility(
        'PendingManagerReview',
        'forward',
      );
      expect(missing.backendSupported).toBe(true);
      expect(missing.frontendAllowed).toBe(false);
      expect(missing.status).toBe('unresolved');
      expect(missing.reason).toBe('missing-authoritative-job-status');

      const nullStatus = evaluateChangeRequestActionEligibility(
        'PendingManagerReview',
        'decline',
        { jobStatus: null },
      );
      expect(nullStatus.frontendAllowed).toBe(false);
      expect(nullStatus.status).toBe('unresolved');
      expect(nullStatus.reason).toBe('missing-authoritative-job-status');

      const unknownJob = evaluateProposalItemRevisionEligibility(
        'AwaitingCustomer',
        'Approved',
        { jobStatus: 'FutureJobStatus' },
      );
      expect(unknownJob.frontendAllowed).toBe(false);
      expect(unknownJob.status).toBe('unresolved');
      expect(unknownJob.reason).toBe('unknown-job-status');
    });

    it('allows safe frontend actions when both backend state and active job status permit', () => {
      const forward = evaluateProposalActionEligibility(
        'PendingManagerReview',
        'forward',
        { jobStatus: 'AwaitingManagerReview' },
      );
      expect(forward).toEqual({
        backendSupported: true,
        frontendAllowed: true,
        status: 'allowed',
        reason: null,
        message: null,
      });

      const revise = evaluateProposalItemEditEligibility(
        'CustomerResponded',
        'Approved',
        { jobStatus: 'AwaitingRelease' },
      );
      expect(revise.mode).toBe('revise');
      expect(revise.eligibility.frontendAllowed).toBe(true);
      expect(revise.eligibility.status).toBe('allowed');

      const setPrice = evaluateProposalItemEditEligibility(
        'PendingManagerReview',
        'Proposed',
        { jobStatus: 'AwaitingManagerReview' },
      );
      expect(setPrice.mode).toBe('set-price');
      expect(setPrice.eligibility.frontendAllowed).toBe(true);
    });

    it('evaluates change request eligibility across all ChangeRequestStatus values', () => {
      for (const status of CHANGE_REQUEST_STATUSES) {
        const expectedBackend = status === 'PendingManagerReview';
        expect(getBackendChangeRequestActionSupport(status, 'forward')).toBe(
          expectedBackend,
        );
        expect(getBackendChangeRequestActionSupport(status, 'decline')).toBe(
          expectedBackend,
        );

        const res = evaluateChangeRequestActionEligibility(status, 'forward', {
          jobStatus: 'InProgress',
        });
        expect(res.backendSupported).toBe(expectedBackend);
        expect(res.frontendAllowed).toBe(expectedBackend);
      }

      const unknown = evaluateChangeRequestActionEligibility(
        'FutureCrStatus',
        'decline',
        { jobStatus: 'InProgress' },
      );
      expect(unknown.status).toBe('unresolved');
      expect(unknown.frontendAllowed).toBe(false);
    });
  });
});
