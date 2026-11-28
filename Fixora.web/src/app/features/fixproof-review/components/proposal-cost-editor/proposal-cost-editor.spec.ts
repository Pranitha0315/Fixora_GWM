import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { SessionService } from '../../../../core/auth/session.service';
import { API_CONFIG } from '../../../../core/config/api.config';
import { authInterceptor } from '../../../../core/interceptors/auth.interceptor';
import { errorInterceptor } from '../../../../core/interceptors/error.interceptor';
import type { AuthSession } from '../../../../core/models/auth-session.model';

import type { JobDetailDto } from '../../../job-cards/models/job-card.model';
import type { ProposalDto } from '../../models/fixproof.model';
import { FixProofMutationStateService } from '../../services/fixproof-mutation-state.service';
import { FIXPROOF_BEFORE_UNLOAD_TARGET } from '../../services/fixproof-navigation-protection.service';
import { FixProofStateService } from '../../services/fixproof-state.service';
import { ProposalCostEditor } from './proposal-cost-editor';

const API_BASE = 'https://api.fixora.test';
const BASE_TIME = Date.UTC(2026, 10, 28, 12, 0, 0);
const JOB_1 = '11111111-1111-4111-8111-111111111111';
const PROP_1 = '22222222-2222-4222-8222-222222222222';
const ITEM_1 = '33333333-3333-4333-8333-333333333333';

function installDialogTestMethods(): () => void {
  const prototype = HTMLDialogElement.prototype;
  const originalShowModal = Object.getOwnPropertyDescriptor(
    prototype,
    'showModal',
  );
  const originalClose = Object.getOwnPropertyDescriptor(prototype, 'close');

  if (typeof prototype.showModal !== 'function') {
    Object.defineProperty(prototype, 'showModal', {
      configurable: true,
      writable: true,
      value: function (this: HTMLDialogElement): void {
        this.setAttribute('open', '');
      },
    });
  }

  if (typeof prototype.close !== 'function') {
    Object.defineProperty(prototype, 'close', {
      configurable: true,
      writable: true,
      value: function (this: HTMLDialogElement): void {
        this.removeAttribute('open');
      },
    });
  }

  return () => {
    if (originalShowModal) {
      Object.defineProperty(prototype, 'showModal', originalShowModal);
    } else {
      Reflect.deleteProperty(prototype, 'showModal');
    }

    if (originalClose) {
      Object.defineProperty(prototype, 'close', originalClose);
    } else {
      Reflect.deleteProperty(prototype, 'close');
    }
  };
}

function makeSession(id = 'manager-001'): AuthSession {
  return {
    accessToken: `token-${id}`,
    expiresAt: BASE_TIME + 300_000,
    user: {
      id,
      displayName: 'Test Manager',
      email: `${id}@fixora.test`,
      roles: ['Manager'],
    },
  };
}

function makeProposal(overrides: Partial<ProposalDto> = {}): ProposalDto {
  return {
    id: PROP_1,
    jobCardId: JOB_1,
    jobNumber: 'JC-2026-401',
    vehicleLabel: 'Honda City',
    customerName: 'Arjun',
    status: 'PendingManagerReview',
    mechanicId: '44444444-4444-4444-8444-444444444444',
    mechanicName: 'Ravi',
    mechanicNote: null,
    managerNote: null,
    customerNote: null,
    submittedAt: '2026-11-28T09:00:00Z',
    publishedAt: null,
    respondedAt: null,
    releasedAt: null,
    total: 1000,
    approvedTotal: 0,
    items: [
      {
        id: ITEM_1,
        title: 'Brake Pad Set',
        kind: 'Part',
        qty: 1,
        unitPrice: 1000,
        amount: 1000,
        version: 1,
        status: 'Proposed',
        linkedIssueId: null,
      },
    ],
    audit: [],
    ...overrides,
  };
}

function makeJobDetail(
  proposal: ProposalDto = makeProposal(),
  jobStatus = 'AwaitingManagerReview',
): JobDetailDto {
  return {
    job: {
      id: JOB_1,
      number: 'JC-2026-401',
      customerId: '55555555-5555-4555-8555-555555555555',
      customerName: 'Arjun',
      vehicleId: '66666666-6666-4666-8666-666666666666',
      vehicleLabel: 'Honda City',
      mechanicId: '44444444-4444-4444-8444-444444444444',
      mechanicName: 'Ravi',
      bayId: null,
      bayName: null,
      status: jobStatus,
      priority: 1,
      queuePosition: 1,
      etaAt: null,
      estimatedMinutes: 60,
      elapsedMinutes: 0,
      createdAt: '2026-11-28T08:00:00Z',
      startedAt: null,
      completedAt: null,
      complaint: null,
      managerNote: null,
    },
    timeline: [],
    issues: [],
    proposals: [proposal],
    changeRequests: [],
    invoice: null,
    queue: {
      jobId: JOB_1,
      position: 1,
      etaAt: null,
      status: jobStatus,
      indicative: true,
    },
  };
}

describe('ProposalCostEditor (K15)', () => {
  let fixture: ComponentFixture<ProposalCostEditor>;
  let component: ProposalCostEditor;
  let http: HttpTestingController;
  let session: SessionService;
  let state: FixProofStateService;
  let mutation: FixProofMutationStateService;
  let cleanupDialog: (() => void) | null = null;

  beforeEach(async () => {
    cleanupDialog = installDialogTestMethods();
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);

    await TestBed.configureTestingModule({
      imports: [ProposalCostEditor],
      providers: [
        provideHttpClient(
          withInterceptors([errorInterceptor, authInterceptor]),
        ),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: API_BASE } },
        {
          provide: FIXPROOF_BEFORE_UNLOAD_TARGET,
          useValue: {
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          },
        },
        FixProofStateService,
        FixProofMutationStateService,
      ],
    }).compileComponents();

    session = TestBed.inject(SessionService);
    http = TestBed.inject(HttpTestingController);
    state = TestBed.inject(FixProofStateService);
    mutation = TestBed.inject(FixProofMutationStateService);
    session.setSession(makeSession());

    fixture = TestBed.createComponent(ProposalCostEditor);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    http.verify();
    cleanupDialog?.();
    cleanupDialog = null;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function loadSelectedProposal(
    proposal: ProposalDto = makeProposal(),
    jobStatus = 'AwaitingManagerReview',
  ): void {
    state.refreshProposals();
    http
      .expectOne(`${API_BASE}/api/v1/manager/approvals/proposals`)
      .flush([proposal]);
    state.selectProposal(proposal.id);
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeJobDetail(proposal, jobStatus));
    fixture.detectChanges();
  }

  it('PCE-01 validates unit price (<=2 decimals, non-negative) and integer quantity >= 1 before enabling submit', () => {
    loadSelectedProposal();
    const item = state.selectedProposal()!.items[0];
    component.startEdit(item, 'set-price');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector(`[data-testid="cost-editor-form-${ITEM_1}"]`)).toBeTruthy();

    // Negative price rejected
    component.unitPriceDraft.set('-10');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="cost-price-error"]')).toBeTruthy();
    expect(component.canSubmitEdit()).toBe(false);

    // >2 decimal places rejected
    component.unitPriceDraft.set('125.123');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="cost-price-error"]')).toBeTruthy();
    expect(component.canSubmitEdit()).toBe(false);

    // Non-positive quantity rejected
    component.unitPriceDraft.set('1250.50');
    component.qtyDraft.set('0');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="cost-qty-error"]')).toBeTruthy();
    expect(component.canSubmitEdit()).toBe(false);

    // Valid values enable submit and compute exact BigInt indicative line total
    component.qtyDraft.set('2');
    fixture.detectChanges();
    expect(component.canSubmitEdit()).toBe(true);
    expect(
      el.querySelector('[data-testid="cost-indicative-line-total"]')?.textContent,
    ).toContain('2501.00');
  });

  it('PCE-02 requires explicit confirmation before single-dispatch setItemPrice and clears draft on authoritative success', () => {
    const initial = makeProposal();
    loadSelectedProposal(initial);

    component.startEdit(initial.items[0], 'set-price');
    component.unitPriceDraft.set('1450.25');
    component.qtyDraft.set('2');
    fixture.detectChanges();

    // Cancel confirmation -> zero HTTP calls
    component.requestSubmitConfirmation();
    fixture.detectChanges();
    expect(component.pendingConfirmation()).not.toBeNull();
    component.cancelConfirmation();
    fixture.detectChanges();
    http.expectNone(() => true);

    // Confirm -> authoritative preflight GET + single PUT .../price + post-mutation refreshes
    component.requestSubmitConfirmation();
    component.confirmSubmit();
    fixture.detectChanges();

    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeJobDetail(initial));

    const updated = makeProposal({
      total: 2900.5,
      items: [
        {
          ...initial.items[0],
          unitPrice: 1450.25,
          qty: 2,
          amount: 2900.5,
        },
      ],
    });
    const putReq = http.expectOne(
      `${API_BASE}/api/v1/manager/approvals/proposals/${PROP_1}/items/${ITEM_1}/price`,
    );
    expect(putReq.request.method).toBe('PUT');
    expect(putReq.request.body).toEqual({ unitPrice: 1450.25, qty: 2 });
    putReq.flush(updated);

    // Post-mutation authoritative refresh
    http
      .expectOne(`${API_BASE}/api/v1/manager/approvals/proposals`)
      .flush([updated]);
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeJobDetail(updated));
    fixture.detectChanges();

    expect(mutation.phase()).toBe('succeeded');
    expect(component.editingItemId()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('2900.50');
  });

  it('PCE-03 renders indicative BigInt BR-FP-08 impact preview for post-forward pre-release revisions and dispatches PUT .../revise', () => {
    const published = makeProposal({
      status: 'CustomerResponded',
      publishedAt: '2026-11-28T09:30:00Z',
      respondedAt: '2026-11-28T10:00:00Z',
      approvedTotal: 1000,
      items: [
        {
          id: ITEM_1,
          title: 'Brake Pad Set',
          kind: 'Part',
          qty: 1,
          unitPrice: 1000,
          amount: 1000,
          version: 2,
          status: 'Approved',
          linkedIssueId: null,
        },
      ],
    });

    loadSelectedProposal(published, 'AwaitingRelease');
    component.startEdit(published.items[0], 'revise');

    // Exactly +10% (1000 -> 1100, same qty, Approved) -> within 10% tolerance
    component.unitPriceDraft.set('1100.00');
    component.qtyDraft.set('1');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(
      el.querySelector('[data-testid="br-fp-08-impact-preview"]')?.textContent,
    ).toContain('Within 10% revision tolerance');

    // >10% (1000 -> 1100.01) -> triggers renewed customer approval
    component.unitPriceDraft.set('1100.01');
    fixture.detectChanges();
    expect(
      el.querySelector('[data-testid="br-fp-08-impact-preview"]')?.textContent,
    ).toContain('Renewed customer approval likely required');

    component.requestSubmitConfirmation();
    component.confirmSubmit();
    fixture.detectChanges();

    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeJobDetail(published, 'AwaitingRelease'));

    const revised = makeProposal({
      ...published,
      status: 'AwaitingCustomer',
      total: 1100.01,
      items: [
        {
          ...published.items[0],
          unitPrice: 1100.01,
          amount: 1100.01,
          version: 3,
          status: 'AwaitingCustomer',
        },
      ],
    });

    const reviseReq = http.expectOne(
      `${API_BASE}/api/v1/manager/approvals/proposals/${PROP_1}/items/${ITEM_1}/revise`,
    );
    expect(reviseReq.request.method).toBe('PUT');
    expect(reviseReq.request.body).toEqual({ unitPrice: 1100.01, qty: 1 });
    reviseReq.flush(revised);

    http
      .expectOne(`${API_BASE}/api/v1/manager/approvals/proposals`)
      .flush([revised]);
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeJobDetail(revised, 'AwaitingCustomerApproval'));
    fixture.detectChanges();

    expect(mutation.phase()).toBe('succeeded');
  });

  it('PCE-04 enforces backend B-07 restriction by blocking post-release item revision on ReleasedToMechanic proposals', () => {
    const released = makeProposal({
      status: 'ReleasedToMechanic',
      publishedAt: '2026-11-28T09:30:00Z',
      respondedAt: '2026-11-28T10:00:00Z',
      releasedAt: '2026-11-28T10:30:00Z',
      approvedTotal: 1000,
      items: [
        {
          id: ITEM_1,
          title: 'Brake Pad Set',
          kind: 'Part',
          qty: 1,
          unitPrice: 1000,
          amount: 1000,
          version: 3,
          status: 'Released',
          linkedIssueId: null,
        },
      ],
    });

    loadSelectedProposal(released, 'InProgress');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="b07-post-release-alert"]')).toBeTruthy();
    expect(
      el.querySelector(`[data-testid="revise-blocked-btn-${ITEM_1}"]`),
    ).toBeTruthy();
    expect(el.querySelector(`[data-testid="revise-item-btn-${ITEM_1}"]`)).toBeNull();
    expect(el.querySelector(`[data-testid="edit-price-btn-${ITEM_1}"]`)).toBeNull();

    // Direct call to startEdit must remain refused
    component.startEdit(released.items[0], 'revise');
    expect(component.editingItemId()).toBeNull();
  });

  it('PCE-05 prevents duplicate submission while a mutation is in flight and clears draft on access loss', () => {
    const initial = makeProposal();
    loadSelectedProposal(initial);

    component.startEdit(initial.items[0], 'set-price');
    component.unitPriceDraft.set('1200.00');
    component.qtyDraft.set('1');
    fixture.detectChanges();

    component.requestSubmitConfirmation();
    component.confirmSubmit();
    fixture.detectChanges();

    // While preflight GET is open, canSubmitEdit() is false -> duplicate submit blocked
    expect(component.canSubmitEdit()).toBe(false);
    const preflightReq = http.expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`);

    // Revoke access (401) -> cancels preflight & clears draft cleanly
    preflightReq.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(component.editingItemId()).toBeNull();
    expect(component.pendingConfirmation()).toBeNull();
  });

  it('PCE-06 exposes zero add/remove item controls and safely renders XSS item titles', () => {
    const xssTitle = '<script>alert(1)</script>Brake Disc';
    const prop = makeProposal({
      items: [{ ...makeProposal().items[0], title: xssTitle }],
    });
    loadSelectedProposal(prop);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('script')).toBeNull();
    expect(el.textContent).toContain('<script>alert(1)</script>Brake Disc');
    expect(el.textContent?.toLowerCase()).not.toContain('add item');
    expect(el.textContent?.toLowerCase()).not.toContain('delete item');
  });
});
