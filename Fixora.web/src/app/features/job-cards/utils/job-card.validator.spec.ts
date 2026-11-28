import {
  JobCardRequestError,
  JobCardResponseError,
  validateInvoiceLineResponse,
  validateInvoiceResponse,
  validateIssueResponse,
  validateJobCardId,
  validateJobCardListResponse,
  validateJobCardSummaryResponse,
  validateJobDetailResponse,
  validateJobListQuery,
  validateProgressResponse,
  validateQueueEstimateResponse,
} from './job-card.validator';

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const JOB_ID_2 = '22222222-2222-4222-8222-222222222222';
const CUSTOMER_ID = '33333333-3333-4333-8333-333333333333';
const VEHICLE_ID = '44444444-4444-4444-8444-444444444444';
const MECHANIC_ID = '55555555-5555-4555-8555-555555555555';
const BAY_ID = '66666666-6666-4666-8666-666666666666';
const ISSUE_ID = '77777777-7777-4777-8777-777777777777';
const PROPOSAL_ID = '88888888-8888-4888-8888-888888888888';
const ITEM_ID = '99999999-9999-4999-8999-999999999999';
const CR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INVOICE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';

function createJobSummary(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: JOB_ID,
    number: 'JC-2026-0042',
    customerId: CUSTOMER_ID,
    customerName: 'Kavitha',
    vehicleId: VEHICLE_ID,
    vehicleLabel: 'Suzuki Wagon R (NP CAB-4521)',
    mechanicId: MECHANIC_ID,
    mechanicName: 'Ravi',
    bayId: BAY_ID,
    bayName: 'Bay 1',
    status: 'Inspecting',
    priority: 1,
    queuePosition: 1,
    etaAt: '2026-11-27T10:30:00Z',
    estimatedMinutes: 90,
    elapsedMinutes: 25.5,
    createdAt: '2026-11-27T08:00:00Z',
    startedAt: '2026-11-27T08:15:00Z',
    completedAt: null,
    complaint: 'Brake squeal',
    managerNote: 'Check front pads closely',
    ...overrides,
  };
}

function createIssue(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: ISSUE_ID,
    component: 'Front Brakes',
    findingEn: 'Front brake pads worn to 2 mm.',
    findingTa: 'முன் பிரேக் பேடுகள் தேய்ந்துள்ளன.',
    recommendationEn: 'Replace front brake pads.',
    recommendationTa: 'முன் பிரேக் பேடுகளை மாற்றவும்.',
    severity: 'Urgent',
    mediaUrls: ['/api/v1/media/abcdef0123456789abcdef0123456789.jpg?exp=1800000000&sig=00'],
    reportVersion: 1,
    confirmedAt: '2026-11-27T08:30:00Z',
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
    vehicleLabel: 'Suzuki Wagon R (NP CAB-4521)',
    customerName: 'Kavitha',
    status: 'PendingManagerReview',
    mechanicId: MECHANIC_ID,
    mechanicName: 'Ravi',
    mechanicNote: 'Pads at 2 mm',
    managerNote: null,
    customerNote: null,
    submittedAt: '2026-11-27T08:40:00Z',
    publishedAt: null,
    respondedAt: null,
    releasedAt: null,
    total: 4200,
    approvedTotal: 0,
    items: [
      {
        id: ITEM_ID,
        title: 'Front brake pads',
        kind: 'Part',
        qty: 1,
        unitPrice: 4200,
        amount: 4200,
        version: 1,
        status: 'Proposed',
        linkedIssueId: ISSUE_ID,
      },
    ],
    audit: [
      {
        actorRole: 'Mechanic',
        action: 'Submitted to manager',
        detail: '1 item(s)',
        at: '2026-11-27T08:40:00Z',
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
    changes: ['Keep old parts'],
    details: 'Place old pads in the boot.',
    status: 'PendingManagerReview',
    managerNote: null,
    mechanicNote: null,
    createdAt: '2026-11-27T09:00:00Z',
    ...overrides,
  };
}

function createInvoice(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: INVOICE_ID,
    number: 'INV-2026-0001',
    jobCardId: JOB_ID,
    customerId: CUSTOMER_ID,
    subtotal: 6700,
    tax: 0,
    loyaltyDiscount: 200,
    total: 6500,
    status: 'Unpaid',
    paymentMethod: null,
    issuedAt: '2026-11-27T11:00:00Z',
    paidAt: null,
    lines: [
      {
        description: 'Brake Inspection',
        qty: 1,
        unitPrice: 2500,
        amount: 2500,
      },
      {
        description: 'Front brake pads',
        qty: 1,
        unitPrice: 4200,
        amount: 4200,
      },
    ],
    ...overrides,
  };
}

function createQueueEstimate(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    jobId: JOB_ID,
    position: 1,
    etaAt: '2026-11-27T10:30:00Z',
    status: 'Inspecting',
    indicative: true,
    ...overrides,
  };
}

function createJobDetail(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    job: createJobSummary(),
    timeline: [
      {
        stage: 'Checked in',
        message: 'Vehicle received at the workshop.',
        percent: 5,
        actorRole: 'Manager',
        at: '2026-11-27T08:00:00Z',
      },
    ],
    issues: [createIssue()],
    proposals: [createProposal()],
    changeRequests: [createChangeRequest()],
    invoice: createInvoice(),
    queue: createQueueEstimate(),
    ...overrides,
  };
}

describe('job-card.validator', () => {
  describe('validateJobCardSummaryResponse & validateJobCardListResponse', () => {
    it('validates a standard job summary and preserves nullable fields', () => {
      const dto = validateJobCardSummaryResponse(
        createJobSummary({
          mechanicId: null,
          mechanicName: null,
          bayId: null,
          bayName: null,
          etaAt: null,
          startedAt: null,
          completedAt: null,
          complaint: null,
          managerNote: null,
        }),
      );

      expect(dto.id).toBe(JOB_ID);
      expect(dto.mechanicId).toBeNull();
      expect(dto.bayId).toBeNull();
      expect(dto.managerNote).toBeNull();
    });

    it('accepts valid anonymous walk-in customerId and vehicleId (Guid.Empty)', () => {
      const dto = validateJobCardSummaryResponse(
        createJobSummary({
          customerId: EMPTY_UUID,
          vehicleId: EMPTY_UUID,
        }),
      );

      expect(dto.customerId).toBe(EMPTY_UUID);
      expect(dto.vehicleId).toBe(EMPTY_UUID);
    });

    it('rejects empty UUID as job id', () => {
      expect(() =>
        validateJobCardSummaryResponse(createJobSummary({ id: EMPTY_UUID })),
      ).toThrowError(JobCardResponseError);
    });

    it('preserves unknown job status strings without throwing', () => {
      const dto = validateJobCardSummaryResponse(
        createJobSummary({ status: 'FutureWorkflowStatus' }),
      );

      expect(dto.status).toBe('FutureWorkflowStatus');
    });

    it('rejects duplicate job IDs case-insensitively in job list', () => {
      expect(() =>
        validateJobCardListResponse([
          createJobSummary({ id: JOB_ID }),
          createJobSummary({ id: JOB_ID.toUpperCase() }),
        ]),
      ).toThrowError(new JobCardResponseError('jobs[1].id'));
    });

    it('accepts an empty job list and multiple distinct jobs', () => {
      expect(validateJobCardListResponse([])).toEqual([]);
      const list = validateJobCardListResponse([
        createJobSummary({ id: JOB_ID }),
        createJobSummary({ id: JOB_ID_2, number: 'JC-2026-0043' }),
      ]);
      expect(list).toHaveLength(2);
    });
  });

  describe('nested DTO validators', () => {
    it('validates QueueEstimateDto with exact backend field name position', () => {
      const queue = validateQueueEstimateResponse(
        createQueueEstimate({ etaAt: null, status: 'FutureStatus' }),
      );

      expect(queue.position).toBe(1);
      expect(queue.etaAt).toBeNull();
      expect(queue.status).toBe('FutureStatus');
      expect(queue.indicative).toBe(true);
    });

    it('rejects QueueEstimateDto missing position or using queuePosition', () => {
      const bad = {
        jobId: JOB_ID,
        queuePosition: 1,
        etaAt: null,
        status: 'Open',
        indicative: true,
      };
      expect(() => validateQueueEstimateResponse(bad)).toThrowError(
        new JobCardResponseError('queue.position'),
      );
    });

    it('rejects malformed ProgressDto percent out of range', () => {
      expect(() =>
        validateProgressResponse({
          stage: 'Repair',
          message: 'Working',
          percent: 105,
          actorRole: 'Mechanic',
          at: '2026-11-27T08:00:00Z',
        }),
      ).toThrowError(new JobCardResponseError('timeline.percent'));
    });

    it('validates IssueDto with empty Tamil text and unknown severity', () => {
      const issue = validateIssueResponse(
        createIssue({
          findingTa: '',
          recommendationEn: '',
          recommendationTa: '',
          severity: 'CriticalFuture',
          mediaUrls: [],
        }),
      );

      expect(issue.severity).toBe('CriticalFuture');
      expect(issue.mediaUrls).toEqual([]);
    });

    it('rejects IssueDto with non-string mediaUrls entry without leaking URL values', () => {
      try {
        validateIssueResponse(
          createIssue({
            mediaUrls: [
              '/api/v1/media/secret.jpg?exp=1800000000&sig=deadbeef',
              42,
            ],
          }),
        );
        expect.fail('Expected JobCardResponseError');
      } catch (error) {
        expect(error).toBeInstanceOf(JobCardResponseError);
        expect((error as JobCardResponseError).field).toBe(
          'issue.mediaUrls[1]',
        );
        expect((error as Error).message).not.toContain('deadbeef');
      }
    });

    it('validates InvoiceDto with anonymous walk-in customerId (Guid.Empty) and unknown status', () => {
      const invoice = validateInvoiceResponse(
        createInvoice({
          customerId: EMPTY_UUID,
          status: 'FutureInvoiceStatus',
          paymentMethod: 'Cash',
          paidAt: '2026-11-27T12:00:00Z',
        }),
      );

      expect(invoice.customerId).toBe(EMPTY_UUID);
      expect(invoice.status).toBe('FutureInvoiceStatus');
      expect(invoice.lines).toHaveLength(2);
    });

    it('rejects InvoiceLineDto with non-positive qty or negative amount', () => {
      expect(() =>
        validateInvoiceLineResponse({
          description: 'Service',
          qty: 0,
          unitPrice: 1000,
          amount: 0,
        }),
      ).toThrowError(new JobCardResponseError('line.qty'));

      expect(() =>
        validateInvoiceLineResponse({
          description: 'Service',
          qty: 1,
          unitPrice: 1000,
          amount: -1,
        }),
      ).toThrowError(new JobCardResponseError('line.amount'));
    });
  });

  describe('validateJobDetailResponse', () => {
    it('validates a complete JobDetailDto with null invoice', () => {
      const detail = validateJobDetailResponse(
        createJobDetail({ invoice: null }),
      );

      expect(detail.job.id).toBe(JOB_ID);
      expect(detail.invoice).toBeNull();
      expect(detail.issues).toHaveLength(1);
      expect(detail.proposals).toHaveLength(1);
      expect(detail.changeRequests).toHaveLength(1);
      expect(detail.queue.jobId).toBe(JOB_ID);
    });

    it('rejects duplicate issue IDs inside JobDetailDto', () => {
      expect(() =>
        validateJobDetailResponse(
          createJobDetail({
            issues: [createIssue(), createIssue()],
          }),
        ),
      ).toThrowError(new JobCardResponseError('jobDetail.issues[1].id'));
    });

    it('rejects nested proposal, changeRequest, invoice, or queue belonging to another job', () => {
      expect(() =>
        validateJobDetailResponse(
          createJobDetail({
            proposals: [createProposal({ jobCardId: JOB_ID_2 })],
          }),
        ),
      ).toThrowError(
        new JobCardResponseError('jobDetail.proposals[0].jobCardId'),
      );

      expect(() =>
        validateJobDetailResponse(
          createJobDetail({
            changeRequests: [createChangeRequest({ jobCardId: JOB_ID_2 })],
          }),
        ),
      ).toThrowError(
        new JobCardResponseError('jobDetail.changeRequests[0].jobCardId'),
      );

      expect(() =>
        validateJobDetailResponse(
          createJobDetail({
            invoice: createInvoice({ jobCardId: JOB_ID_2 }),
          }),
        ),
      ).toThrowError(
        new JobCardResponseError('jobDetail.invoice.jobCardId'),
      );

      expect(() =>
        validateJobDetailResponse(
          createJobDetail({
            queue: createQueueEstimate({ jobId: JOB_ID_2 }),
          }),
        ),
      ).toThrowError(new JobCardResponseError('jobDetail.queue.jobId'));
    });

    it('converts malformed nested proposal errors into JobCardResponseError', () => {
      expect(() =>
        validateJobDetailResponse(
          createJobDetail({
            proposals: [createProposal({ total: -50 })],
          }),
        ),
      ).toThrowError(
        new JobCardResponseError('jobDetail.proposals[0].total'),
      );
    });
  });

  describe('request validators', () => {
    it('validates non-empty job UUID and rejects malformed or empty UUIDs', () => {
      expect(validateJobCardId(JOB_ID)).toBe(JOB_ID);
      expect(() => validateJobCardId(EMPTY_UUID)).toThrowError(
        JobCardRequestError,
      );
      expect(() => validateJobCardId('not-a-uuid')).toThrowError(
        JobCardRequestError,
      );
    });

    it('validates JobListQuery defaults and optional customerId', () => {
      expect(validateJobListQuery(undefined)).toEqual({
        activeOnly: true,
        customerId: null,
      });
      expect(
        validateJobListQuery({ activeOnly: false, customerId: CUSTOMER_ID }),
      ).toEqual({
        activeOnly: false,
        customerId: CUSTOMER_ID,
      });
      expect(() =>
        validateJobListQuery({ activeOnly: 'true' }),
      ).toThrowError(JobCardRequestError);
      expect(() =>
        validateJobListQuery({ customerId: EMPTY_UUID }),
      ).toThrowError(JobCardRequestError);
    });
  });
});
