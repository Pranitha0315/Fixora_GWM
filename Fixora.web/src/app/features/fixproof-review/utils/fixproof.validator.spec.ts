import { FIXPROOF_MAX_QTY } from '../models/fixproof.model';

import {
  FixProofRequestError,
  FixProofResponseError,
  validateAuditEntryResponse,
  validateChangeRequestListQuery,
  validateChangeRequestListResponse,
  validateChangeRequestResponse,
  validateFixProofResourceId,
  validateOptionalNoteRequest,
  validatePriceRequest,
  validateProposalListQuery,
  validateProposalListResponse,
  validateProposalResponse,
  validateRepairItemResponse,
  validateRequiredNoteRequest,
} from './fixproof.validator';

const PROPOSAL_ID = '11111111-1111-4111-8111-111111111111';
const PROPOSAL_ID_2 = '22222222-2222-4222-8222-222222222222';
const JOB_ID = '33333333-3333-4333-8333-333333333333';
const MECHANIC_ID = '44444444-4444-4444-8444-444444444444';
const ITEM_ID = '55555555-5555-4555-8555-555555555555';
const ITEM_ID_2 = '66666666-6666-4666-8666-666666666666';
const ISSUE_ID = '77777777-7777-4777-8777-777777777777';
const CR_ID = '88888888-8888-4888-8888-888888888888';
const CR_ID_2 = '99999999-9999-4999-8999-999999999999';
const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';

function createItem(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: ITEM_ID,
    title: 'Front brake pads',
    kind: 'Part',
    qty: 1,
    unitPrice: 4200,
    amount: 4200,
    version: 1,
    status: 'Proposed',
    linkedIssueId: ISSUE_ID,
    ...overrides,
  };
}

function createProposal(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: PROPOSAL_ID,
    jobCardId: JOB_ID,
    jobNumber: 'JC-2026-0042',
    vehicleLabel: 'Suzuki Wagon R',
    customerName: 'Kavitha',
    status: 'PendingManagerReview',
    mechanicId: MECHANIC_ID,
    mechanicName: 'Ravi',
    mechanicNote: 'Pads worn',
    managerNote: null,
    customerNote: null,
    submittedAt: '2026-11-27T08:00:00Z',
    publishedAt: null,
    respondedAt: null,
    releasedAt: null,
    total: 4200,
    approvedTotal: 0,
    items: [createItem()],
    audit: [
      {
        actorRole: 'Mechanic',
        action: 'Submitted to manager',
        detail: null,
        at: '2026-11-27T08:00:00Z',
      },
    ],
    ...overrides,
  };
}

function createChangeRequest(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: CR_ID,
    jobCardId: JOB_ID,
    jobNumber: 'JC-2026-0042',
    number: 'CR-2026-0001',
    changes: ['Keep old parts', 'Add wash'],
    details: 'Bag old pads please.',
    status: 'PendingManagerReview',
    managerNote: null,
    mechanicNote: null,
    createdAt: '2026-11-27T09:00:00Z',
    ...overrides,
  };
}

describe('fixproof.validator', () => {
  describe('response validators', () => {
    it('validates RepairItemDto with nullable linkedIssueId and unknown enum values', () => {
      const item = validateRepairItemResponse(
        createItem({
          linkedIssueId: null,
          kind: 'FutureKind',
          status: 'FutureItemStatus',
          unitPrice: 0,
          amount: 0,
        }),
      );

      expect(item.linkedIssueId).toBeNull();
      expect(item.kind).toBe('FutureKind');
      expect(item.status).toBe('FutureItemStatus');
    });

    it('rejects RepairItemDto with empty UUID, non-positive qty, or version < 1', () => {
      expect(() =>
        validateRepairItemResponse(createItem({ id: EMPTY_UUID })),
      ).toThrowError(new FixProofResponseError('item.id'));

      expect(() =>
        validateRepairItemResponse(createItem({ linkedIssueId: EMPTY_UUID })),
      ).toThrowError(new FixProofResponseError('item.linkedIssueId'));

      expect(() =>
        validateRepairItemResponse(createItem({ qty: 0 })),
      ).toThrowError(new FixProofResponseError('item.qty'));

      expect(() =>
        validateRepairItemResponse(createItem({ version: 0 })),
      ).toThrowError(new FixProofResponseError('item.version'));
    });

    it('validates AuditDto and rejects invalid timestamp', () => {
      const audit = validateAuditEntryResponse({
        actorRole: 'Auto',
        action: 'Sent to customer (Auto mode)',
        detail: null,
        at: '2026-11-27T09:00:00Z',
      });
      expect(audit.actorRole).toBe('Auto');
      expect(audit.detail).toBeNull();

      expect(() =>
        validateAuditEntryResponse({
          actorRole: 'Manager',
          action: 'Price set',
          detail: 'x',
          at: 'not-a-date',
        }),
      ).toThrowError(new FixProofResponseError('audit.at'));
    });

    it('validates ProposalDto and preserves unknown proposal status', () => {
      const proposal = validateProposalResponse(
        createProposal({
          status: 'FutureProposalStatus',
          mechanicName: null,
          mechanicNote: null,
        }),
      );

      expect(proposal.status).toBe('FutureProposalStatus');
      expect(proposal.mechanicName).toBeNull();
      expect(proposal.items).toHaveLength(1);
    });

    it('rejects duplicate repair item IDs within a proposal', () => {
      expect(() =>
        validateProposalResponse(
          createProposal({
            items: [
              createItem({ id: ITEM_ID }),
              createItem({ id: ITEM_ID.toUpperCase() }),
            ],
          }),
        ),
      ).toThrowError(new FixProofResponseError('proposal.items[1].id'));
    });

    it('rejects duplicate proposal IDs in proposal list', () => {
      expect(() =>
        validateProposalListResponse([
          createProposal({ id: PROPOSAL_ID }),
          createProposal({ id: PROPOSAL_ID }),
        ]),
      ).toThrowError(new FixProofResponseError('proposals[1].id'));
    });

    it('validates ProposalListResponse with distinct items', () => {
      const list = validateProposalListResponse([
        createProposal({
          id: PROPOSAL_ID,
          items: [createItem({ id: ITEM_ID }), createItem({ id: ITEM_ID_2 })],
        }),
        createProposal({ id: PROPOSAL_ID_2 }),
      ]);
      expect(list).toHaveLength(2);
    });

    it('validates ChangeRequestDto including empty jobNumber/details and unknown status', () => {
      const cr = validateChangeRequestResponse(
        createChangeRequest({
          jobNumber: '',
          details: '',
          status: 'FutureChangeStatus',
        }),
      );

      expect(cr.jobNumber).toBe('');
      expect(cr.status).toBe('FutureChangeStatus');
      expect(cr.changes).toEqual(['Keep old parts', 'Add wash']);
    });

    it('rejects duplicate change-request IDs and malformed changes array', () => {
      expect(() =>
        validateChangeRequestListResponse([
          createChangeRequest({ id: CR_ID }),
          createChangeRequest({ id: CR_ID.toUpperCase() }),
        ]),
      ).toThrowError(new FixProofResponseError('changeRequests[1].id'));

      expect(() =>
        validateChangeRequestResponse(createChangeRequest({ changes: [123] })),
      ).toThrowError(new FixProofResponseError('changeRequest.changes[0]'));

      expect(
        validateChangeRequestListResponse([
          createChangeRequest({ id: CR_ID }),
          createChangeRequest({ id: CR_ID_2 }),
        ]),
      ).toHaveLength(2);
    });
  });

  describe('request validators', () => {
    it('validates resource IDs and rejects empty or malformed UUIDs', () => {
      expect(validateFixProofResourceId(PROPOSAL_ID, 'proposalId')).toBe(
        PROPOSAL_ID,
      );
      expect(() =>
        validateFixProofResourceId(EMPTY_UUID, 'proposalId'),
      ).toThrowError(new FixProofRequestError('proposalId'));
      expect(() =>
        validateFixProofResourceId('bad-id', 'itemId'),
      ).toThrowError(new FixProofRequestError('itemId'));
    });

    it('validates PriceRequest with exact decimal and Int32 bounds', () => {
      expect(validatePriceRequest({ unitPrice: 0, qty: 1 })).toEqual({
        unitPrice: 0,
        qty: 1,
      });
      expect(validatePriceRequest({ unitPrice: '4200.50', qty: '2' })).toEqual({
        unitPrice: 4200.5,
        qty: 2,
      });
    });

    it('rejects invalid prices, excessive decimals, bad qty, and amount overflow', () => {
      expect(() =>
        validatePriceRequest({ unitPrice: -1, qty: 1 }),
      ).toThrowError(new FixProofRequestError('unitPrice'));
      expect(() =>
        validatePriceRequest({ unitPrice: '10.123', qty: 1 }),
      ).toThrowError(new FixProofRequestError('unitPrice'));
      expect(() =>
        validatePriceRequest({ unitPrice: 100, qty: 0 }),
      ).toThrowError(new FixProofRequestError('qty'));
      expect(() =>
        validatePriceRequest({ unitPrice: 100, qty: FIXPROOF_MAX_QTY + 1 }),
      ).toThrowError(new FixProofRequestError('qty'));
      expect(
        validatePriceRequest({ unitPrice: '70368744177663.99', qty: 1 }),
      ).toEqual({
        unitPrice: 70368744177663.99,
        qty: 1,
      });
      expect(() =>
        validatePriceRequest({ unitPrice: '70368744177664.00', qty: 1 }),
      ).toThrowError(new FixProofRequestError('unitPrice'));
      expect(() =>
        validatePriceRequest({ unitPrice: '70368744177664.01', qty: 1 }),
      ).toThrowError(new FixProofRequestError('unitPrice'));
      expect(() =>
        validatePriceRequest({
          unitPrice: '50000000000000.00',
          qty: 1000,
        }),
      ).toThrowError(new FixProofRequestError('amount'));
    });

    it('validates optional vs required notes', () => {
      expect(validateOptionalNoteRequest({ note: null })).toEqual({
        note: null,
      });
      expect(validateOptionalNoteRequest({ note: '   ' })).toEqual({
        note: null,
      });
      expect(validateOptionalNoteRequest({ note: '  Checked photos  ' })).toEqual(
        { note: 'Checked photos' },
      );

      expect(validateRequiredNoteRequest({ note: '  Add clearer photo ' })).toEqual(
        { note: 'Add clearer photo' },
      );
      expect(() =>
        validateRequiredNoteRequest({ note: '   ' }),
      ).toThrowError(new FixProofRequestError('note'));
      expect(() =>
        validateRequiredNoteRequest({ note: null }),
      ).toThrowError(new FixProofRequestError('note'));
    });

    it('validates list query parameters', () => {
      expect(validateProposalListQuery(undefined)).toEqual({ status: null });
      expect(
        validateProposalListQuery({ status: 'PendingManagerReview' }),
      ).toEqual({ status: 'PendingManagerReview' });
      expect(() =>
        validateProposalListQuery({ status: 'InvalidStatus' }),
      ).toThrowError(new FixProofRequestError('status'));

      expect(validateChangeRequestListQuery(undefined)).toEqual({
        pendingOnly: false,
      });
      expect(validateChangeRequestListQuery({ pendingOnly: true })).toEqual({
        pendingOnly: true,
      });
      expect(() =>
        validateChangeRequestListQuery({ pendingOnly: 'yes' }),
      ).toThrowError(new FixProofRequestError('pendingOnly'));
    });
  });
});
