import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { SessionService } from '../../../../core/auth/session.service';
import { API_CONFIG } from '../../../../core/config/api.config';
import { authInterceptor } from '../../../../core/interceptors/auth.interceptor';
import { errorInterceptor } from '../../../../core/interceptors/error.interceptor';
import type { AuthSession } from '../../../../core/models/auth-session.model';

import {
  FIXPROOF_BEFORE_UNLOAD_TARGET,
  FixProofNavigationProtectionService,
} from '../../../fixproof-review/services/fixproof-navigation-protection.service';

import {
  JOB_CARDS_LIST_LIMIT,
  type JobSummaryDto,
} from '../../models/job-card.model';
import { JobCardStateService } from '../../services/job-card-state.service';
import { JobCards } from './job-cards';

const API_BASE = 'https://api.fixora.test';
const BASE_TIME = Date.UTC(2026, 10, 28, 12, 0, 0);
const JOB_1 = '11111111-1111-4111-8111-111111111111';
const JOB_2 = '22222222-2222-4222-8222-222222222222';
const CUST_1 = '33333333-3333-4333-8333-333333333333';
const VEH_1 = '44444444-4444-4444-8444-444444444444';

function makeSession(
  id = 'manager-001',
  roles: AuthSession['user']['roles'] = ['Manager'],
): AuthSession {
  return {
    accessToken: `token-${id}`,
    expiresAt: BASE_TIME + 300_000,
    user: {
      id,
      displayName: 'Test Manager',
      email: `${id}@fixora.test`,
      roles,
    },
  };
}

function makeJob(overrides: Partial<JobSummaryDto> = {}): JobSummaryDto {
  return {
    id: JOB_1,
    number: 'JC-2026-101',
    customerId: CUST_1,
    customerName: 'Arjun Kumar',
    vehicleId: VEH_1,
    vehicleLabel: 'Honda City KA-01-AB-1234',
    mechanicId: '55555555-5555-4555-8555-555555555555',
    mechanicName: 'Ravi',
    bayId: '66666666-6666-4666-8666-666666666666',
    bayName: 'Bay 2',
    status: 'AwaitingManagerReview',
    priority: 1,
    queuePosition: 2,
    etaAt: '2026-11-28T15:00:00Z',
    estimatedMinutes: 90,
    elapsedMinutes: 25,
    createdAt: '2026-11-28T09:00:00Z',
    startedAt: '2026-11-28T09:15:00Z',
    completedAt: null,
    complaint: 'Brake squealing',
    managerNote: 'Priority fleet vehicle',
    ...overrides,
  };
}

describe('JobCards Operational Queue (K15)', () => {
  let fixture: ComponentFixture<JobCards>;
  let component: JobCards;
  let http: HttpTestingController;
  let session: SessionService;
  let protection: FixProofNavigationProtectionService;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);

    await TestBed.configureTestingModule({
      imports: [JobCards],
      providers: [
        provideRouter([]),
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
        JobCardStateService,
      ],
    }).compileComponents();

    session = TestBed.inject(SessionService);
    http = TestBed.inject(HttpTestingController);
    protection = TestBed.inject(FixProofNavigationProtectionService);
    session.setSession(makeSession());

    fixture = TestBed.createComponent(JobCards);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    http.verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function flushInitial(jobs: readonly JobSummaryDto[] = [makeJob()]): void {
    fixture.detectChanges();
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs?activeOnly=true`)
      .flush(jobs);
    fixture.detectChanges();
  }

  it('JCP-01 renders initial loading state, loads authoritative jobs, and links to detail and FixProof oversight', () => {
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Loading job cards');
    expect(
      el.querySelector('[data-testid="open-fixproof-oversight-link"]'),
    ).toBeTruthy();

    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs?activeOnly=true`)
      .flush([makeJob()]);
    fixture.detectChanges();

    expect(el.textContent).toContain('JC-2026-101');
    expect(el.textContent).toContain('Arjun Kumar');
    expect(el.textContent).toContain('Honda City KA-01-AB-1234');
    expect(el.querySelector(`[data-testid="open-job-detail-${JOB_1}"]`)).toBeTruthy();
  });

  it('JCP-02 supports server activeOnly toggle and customerId filter with invalid UUID rejection', () => {
    flushInitial();
    const el = fixture.nativeElement as HTMLElement;

    // Toggle activeOnly off -> sends activeOnly=false
    const toggle = el.querySelector(
      '[data-testid="active-only-toggle"]',
    ) as HTMLInputElement;
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs?activeOnly=false`)
      .flush([makeJob({ status: 'Completed' })]);
    fixture.detectChanges();
    expect(el.textContent).toContain('Completed');

    // Invalid customerId -> sets inputError without sending HTTP request
    component.customerIdDraft.set('not-a-valid-uuid');
    component.applyCustomerIdFilter();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="jobs-input-error"]')).toBeTruthy();
    http.expectNone(req => req.url.includes('not-a-valid-uuid'));

    // Valid customerId -> sends customerId query parameter
    component.customerIdDraft.set(CUST_1);
    component.applyCustomerIdFilter();
    fixture.detectChanges();
    http
      .expectOne(
        `${API_BASE}/api/v1/manager/jobs?activeOnly=false&customerId=${CUST_1}`,
      )
      .flush([makeJob()]);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="jobs-input-error"]')).toBeNull();
  });

  it('JCP-03 supports local search, status filter, priority filter, and filtered-empty reset', () => {
    flushInitial([
      makeJob({ id: JOB_1, number: 'JC-101', status: 'Open', priority: 1 }),
      makeJob({
        id: JOB_2,
        number: 'JC-102',
        customerName: 'Meera',
        status: 'InProgress',
        priority: 2,
      }),
    ]);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector(`[data-testid="job-row-${JOB_1}"]`)).toBeTruthy();
    expect(el.querySelector(`[data-testid="job-row-${JOB_2}"]`)).toBeTruthy();

    component.state.setSearch('Meera');
    fixture.detectChanges();
    expect(el.querySelector(`[data-testid="job-row-${JOB_1}"]`)).toBeNull();
    expect(el.querySelector(`[data-testid="job-row-${JOB_2}"]`)).toBeTruthy();

    component.state.setStatusFilter('Open');
    fixture.detectChanges();
    expect(el.textContent).toContain('No matching job cards');

    component.clearLocalFilters();
    fixture.detectChanges();
    expect(el.querySelector(`[data-testid="job-row-${JOB_1}"]`)).toBeTruthy();
    expect(el.querySelector(`[data-testid="job-row-${JOB_2}"]`)).toBeTruthy();
  });

  it('JCP-04 displays truthful 200-cap truncation advisory without fabricating pagination totals', () => {
    const manyJobs = Array.from({ length: JOB_CARDS_LIST_LIMIT }, (_, idx) =>
      makeJob({
        id: `10000000-0000-4000-8000-${String(idx).padStart(12, '0')}`,
        number: `JC-${idx + 1}`,
      }),
    );

    flushInitial(manyJobs);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="jobs-truncation-alert"]')).toBeTruthy();
    expect(el.textContent).toContain('200');
  });

  it('JCP-05 renders empty state and initial error state with manual retry', () => {
    fixture.detectChanges();
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs?activeOnly=true`)
      .flush('Server error', { status: 500, statusText: 'Internal Server Error' });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Unable to load job cards');

    component.refreshList();
    fixture.detectChanges();
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs?activeOnly=true`)
      .flush([]);
    fixture.detectChanges();
    expect(el.textContent).toContain('No job cards found');
  });

  it('JCP-06 supports manual refresh cancellation, duplicate request prevention, and stale banner on refresh failure', () => {
    flushInitial();

    component.refreshList();
    // Duplicate refresh while in-flight must not issue a second HTTP call
    component.refreshList();
    fixture.detectChanges();

    const refreshReq = http.expectOne(
      `${API_BASE}/api/v1/manager/jobs?activeOnly=true`,
    );
    expect(
      fixture.nativeElement.querySelector('[data-testid="cancel-jobs-btn"]'),
    ).toBeTruthy();

    component.cancelListLoad();
    fixture.detectChanges();
    expect(refreshReq.cancelled).toBe(true);

    // Trigger refresh that fails -> preserves loaded rows with stale banner
    component.refreshList();
    fixture.detectChanges();
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs?activeOnly=true`)
      .flush('Unavailable', { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="jobs-stale-alert"]')).toBeTruthy();
    expect(el.textContent).toContain('JC-2026-101');
  });

  it('JCP-07 clears protected data and shows re-authentication link on HTTP 401 authorization loss', () => {
    flushInitial();

    component.refreshList();
    fixture.detectChanges();
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs?activeOnly=true`)
      .flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="jobs-auth-failure-banner"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="jobs-reauth-login-link"]')).toBeTruthy();
    expect(el.textContent).not.toContain('JC-2026-101');
  });

  it('JCP-08 safely renders server-provided text containing script/HTML payloads without execution', () => {
    const xss = '<img src=x onerror="window.__xss=1"><script>alert(1)</script>';
    flushInitial([
      makeJob({
        customerName: xss,
        complaint: xss,
      }),
    ]);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('script')).toBeNull();
    expect(el.querySelector('img[onerror]')).toBeNull();
    expect(el.textContent).toContain('<script>alert(1)</script>');
  });

  it('JCP-09 surfaces current-session unresolved FixProof notices without browser storage', () => {
    const activeSession = session.session()!;
    protection.recordNotice(activeSession, {
      reason: 'destroyed-while-uncertain',
      action: 'forward',
    });

    flushInitial();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="jobs-session-notices"]')).toBeTruthy();
    expect(el.textContent).toContain('does not prove the server outcome');

    component.dismissAllSessionNotices();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="jobs-session-notices"]')).toBeNull();
  });

  it('JCP-10 cancels in-flight list request cleanly on component destruction', () => {
    fixture.detectChanges();
    const req = http.expectOne(
      `${API_BASE}/api/v1/manager/jobs?activeOnly=true`,
    );

    fixture.destroy();
    expect(req.cancelled).toBe(true);
  });
});
