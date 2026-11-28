import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';

import { SessionService } from '../../../../core/auth/session.service';
import { API_CONFIG } from '../../../../core/config/api.config';
import { authInterceptor } from '../../../../core/interceptors/auth.interceptor';
import { errorInterceptor } from '../../../../core/interceptors/error.interceptor';
import type { AuthSession } from '../../../../core/models/auth-session.model';

import type { JobDetailDto } from '../../models/job-card.model';
import { JobCardStateService } from '../../services/job-card-state.service';
import { SIGNED_MEDIA_CLOCK } from '../../services/signed-media-url.service';
import { JobCardDetail } from './job-card-detail';

const API_BASE = 'https://api.fixora.test';
const BASE_TIME = Date.UTC(2026, 10, 28, 12, 0, 0);
const JOB_1 = '11111111-1111-4111-8111-111111111111';
const JOB_2 = '22222222-2222-4222-8222-222222222222';
const PROP_1 = '33333333-3333-4333-8333-333333333333';
const CR_1 = '44444444-4444-4444-8444-444444444444';
const ISSUE_1 = '55555555-5555-4555-8555-555555555555';
const INV_1 = '66666666-6666-4666-8666-666666666666';

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

function makeDetail(overrides: Partial<JobDetailDto> = {}): JobDetailDto {
  const validExp = Math.floor((BASE_TIME + 600_000) / 1000);
  const expiredExp = Math.floor((BASE_TIME - 60_000) / 1000);

  return {
    job: {
      id: JOB_1,
      number: 'JC-2026-301',
      customerId: '77777777-7777-4777-8777-777777777777',
      customerName: 'Kavya Nair',
      vehicleId: '88888888-8888-4888-8888-888888888888',
      vehicleLabel: 'Hyundai i20 TN-09-CD-4321',
      mechanicId: '99999999-9999-4999-8999-999999999999',
      mechanicName: 'Suresh',
      bayId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      bayName: 'Bay 4',
      status: 'AwaitingManagerReview',
      priority: 1,
      queuePosition: 3,
      etaAt: '2026-11-28T16:30:00Z',
      estimatedMinutes: 120,
      elapsedMinutes: 45,
      createdAt: '2026-11-28T08:00:00Z',
      startedAt: '2026-11-28T08:30:00Z',
      completedAt: null,
      complaint: 'Front brake vibration',
      managerNote: 'VIP corporate account - notify before release',
    },
    timeline: [
      {
        stage: 'Inspecting',
        message: 'Inspection started by mechanic',
        percent: 35,
        actorRole: 'Mechanic',
        at: '2026-11-28T08:45:00Z',
      },
    ],
    issues: [
      {
        id: ISSUE_1,
        component: 'Front Brake Pads',
        findingEn: 'Brake pads worn below 2mm',
        findingTa: 'பிரேக் பேடுகள் 2mm க்கு கீழ் தேய்ந்துள்ளன',
        recommendationEn: 'Replace front brake pad set',
        recommendationTa: 'முன் பிரேக் பேடுகளை மாற்றவும்',
        severity: 'Urgent',
        mediaUrls: [
          `${API_BASE}/api/v1/media/${'a'.repeat(32)}.jpg?exp=${validExp}&sig=${'0'.repeat(64)}`,
          `${API_BASE}/api/v1/media/${'b'.repeat(32)}.jpg?exp=${expiredExp}&sig=${'1'.repeat(64)}`,
          `${API_BASE}/api/v1/media/${'c'.repeat(32)}.svg?exp=${validExp}&sig=${'2'.repeat(64)}`,
        ],
        reportVersion: 2,
        confirmedAt: '2026-11-28T09:15:00Z',
      },
    ],
    proposals: [
      {
        id: PROP_1,
        jobCardId: JOB_1,
        jobNumber: 'JC-2026-301',
        vehicleLabel: 'Hyundai i20 TN-09-CD-4321',
        customerName: 'Kavya Nair',
        status: 'PendingManagerReview',
        mechanicId: '99999999-9999-4999-8999-999999999999',
        mechanicName: 'Suresh',
        mechanicNote: 'Urgent replacement',
        managerNote: null,
        customerNote: null,
        submittedAt: '2026-11-28T09:20:00Z',
        publishedAt: null,
        respondedAt: null,
        releasedAt: null,
        total: 4200,
        approvedTotal: 0,
        items: [
          {
            id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            title: 'Front Brake Pad Set',
            kind: 'Part',
            qty: 1,
            unitPrice: 4200,
            amount: 4200,
            version: 1,
            status: 'Proposed',
            linkedIssueId: ISSUE_1,
          },
        ],
        audit: [
          {
            actorRole: 'Mechanic',
            action: 'Submitted',
            detail: 'Initial estimate',
            at: '2026-11-28T09:20:00Z',
          },
        ],
      },
    ],
    changeRequests: [
      {
        id: CR_1,
        jobCardId: JOB_1,
        jobNumber: 'JC-2026-301',
        number: 'CR-2026-011',
        changes: ['Add wiper blade check'],
        details: 'Please inspect rear wiper blade as well',
        status: 'PendingManagerReview',
        managerNote: null,
        mechanicNote: null,
        createdAt: '2026-11-28T10:00:00Z',
      },
    ],
    invoice: {
      id: INV_1,
      number: 'INV-2026-888',
      jobCardId: JOB_1,
      customerId: '77777777-7777-4777-8777-777777777777',
      subtotal: 4200,
      tax: 756,
      loyaltyDiscount: 100,
      total: 4856,
      status: 'Unpaid',
      paymentMethod: null,
      issuedAt: '2026-11-28T11:00:00Z',
      paidAt: null,
      lines: [
        {
          description: 'Front Brake Pad Set',
          qty: 1,
          unitPrice: 4200,
          amount: 4200,
        },
      ],
    },
    queue: {
      jobId: JOB_1,
      position: 3,
      etaAt: '2026-11-28T16:30:00Z',
      status: 'AwaitingManagerReview',
      indicative: true,
    },
    ...overrides,
  };
}

describe('JobCardDetail Page (K15)', () => {
  let fixture: ComponentFixture<JobCardDetail>;
  let component: JobCardDetail;
  let http: HttpTestingController;
  let session: SessionService;
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    paramMap$ = new BehaviorSubject(convertToParamMap({ jobId: JOB_1 }));

    await TestBed.configureTestingModule({
      imports: [JobCardDetail],
      providers: [
        provideRouter([]),
        provideHttpClient(
          withInterceptors([errorInterceptor, authInterceptor]),
        ),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: API_BASE } },
        { provide: SIGNED_MEDIA_CLOCK, useValue: () => BASE_TIME },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: paramMap$.asObservable() },
        },
        JobCardStateService,
      ],
    }).compileComponents();

    session = TestBed.inject(SessionService);
    http = TestBed.inject(HttpTestingController);
    session.setSession(makeSession());

    fixture = TestBed.createComponent(JobCardDetail);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    http.verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function flushDetail(detail: JobDetailDto = makeDetail()): void {
    fixture.detectChanges();
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${detail.job.id}`)
      .flush(detail);
    fixture.detectChanges();
  }

  it('JCD-01 renders complete authoritative JobDetailDto including staff note, queue, timeline, bilingual issues, invoice, and FixProof deep links', () => {
    flushDetail();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('JC-2026-301');
    expect(el.textContent).toContain('Kavya Nair');
    expect(el.textContent).toContain('Hyundai i20 TN-09-CD-4321');
    expect(el.textContent).toContain('Suresh');
    expect(el.textContent).toContain('Bay 4');
    expect(el.querySelector('[data-testid="staff-manager-note"]')?.textContent).toContain(
      'VIP corporate account',
    );
    expect(el.querySelector('[data-testid="job-queue-card"]')?.textContent).toContain(
      'Position #3',
    );
    expect(el.querySelector('[data-testid="job-timeline-card"]')?.textContent).toContain(
      'Inspecting (35%)',
    );
    expect(el.textContent).toContain('Brake pads worn below 2mm');
    expect(el.textContent).toContain('பிரேக் பேடுகள் 2mm க்கு கீழ் தேய்ந்துள்ளன');
    expect(el.querySelector('[data-testid="job-invoice-card"]')?.textContent).toContain(
      'INV-2026-888',
    );
    expect(el.textContent).toContain('4856.00');
    expect(
      el.querySelector(`[data-testid="open-proposal-workflow-${PROP_1}"]`),
    ).toBeTruthy();
    expect(
      el.querySelector(`[data-testid="open-cr-workflow-${CR_1}"]`),
    ).toBeTruthy();
  });

  it('JCD-02 enforces media security restrictions: never renders raw signed URLs or live media tags and allows authoritative evidence refresh', () => {
    flushDetail();
    const el = fixture.nativeElement as HTMLElement;

    expect(
      el.querySelector('[data-testid="detail-media-restriction-alert"]'),
    ).toBeTruthy();
    expect(el.innerHTML).not.toContain('a'.repeat(32));
    expect(el.innerHTML).not.toContain('0'.repeat(64));
    expect(el.innerHTML).not.toContain('b'.repeat(32));
    expect(el.innerHTML).not.toContain('c'.repeat(32));
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('video')).toBeNull();
    expect(el.querySelector('audio')).toBeNull();

    const evidenceText =
      el.querySelector(`[data-testid="issue-evidence-${ISSUE_1}"]`)?.textContent ??
      '';
    expect(evidenceText).toContain('valid: 1');
    expect(evidenceText).toContain('expired: 1');
    expect(evidenceText).toContain('blocked/unsupported: 1');

    // Refresh evidence reloads authoritative job detail
    component.refreshEvidence();
    fixture.detectChanges();
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush(makeDetail());
    fixture.detectChanges();
  });

  it('JCD-03 rejects malformed :jobId route parameters without issuing any HTTP request', () => {
    paramMap$.next(convertToParamMap({ jobId: 'not-a-valid-guid' }));
    fixture.detectChanges();

    http.expectNone(() => true);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="invalid-job-id-state"]')).toBeTruthy();
  });

  it('JCD-04 renders explicit 404 not-found state when server returns HTTP 404', () => {
    fixture.detectChanges();
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush('Not found', { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="job-not-found-state"]'),
    ).toBeTruthy();
  });

  it('JCD-05 renders cleanly when invoice is null and timeline, issues, proposals, and change requests are empty', () => {
    flushDetail(
      makeDetail({
        timeline: [],
        issues: [],
        proposals: [],
        changeRequests: [],
        invoice: null,
      }),
    );

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No invoice issued');
    expect(el.textContent).toContain('No progress milestones yet');
    expect(el.textContent).toContain('No inspection findings recorded');
    expect(el.textContent).toContain('No repair proposals');
    expect(el.textContent).toContain('No customer change requests');
  });

  it('JCD-06 clears previous job detail when :jobId route param changes', () => {
    flushDetail();
    expect(fixture.nativeElement.textContent).toContain('JC-2026-301');

    paramMap$.next(convertToParamMap({ jobId: JOB_2 }));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('JC-2026-301');
    http.expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_2}`).flush(
      makeDetail({
        job: { ...makeDetail().job, id: JOB_2, number: 'JC-2026-999' },
        proposals: [],
        changeRequests: [],
        invoice: null,
        queue: { ...makeDetail().queue, jobId: JOB_2 },
      }),
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('JC-2026-999');
  });

  it('JCD-07 clears detail and displays access-revoked banner on HTTP 401/403', () => {
    flushDetail();

    component.refreshDetail();
    fixture.detectChanges();
    http
      .expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`)
      .flush('Forbidden', { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="detail-auth-failure-banner"]')).toBeTruthy();
    expect(el.textContent).not.toContain('JC-2026-301');
  });

  it('JCD-08 safely renders XSS payloads in server-provided text', () => {
    const xss = '<script>window.__pwned=1</script><img src=x onerror=alert(1)>';
    flushDetail(
      makeDetail({
        job: { ...makeDetail().job, managerNote: xss, complaint: xss },
      }),
    );

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('script')).toBeNull();
    expect(el.querySelector('img[onerror]')).toBeNull();
    expect(el.textContent).toContain('<script>window.__pwned=1</script>');
  });

  it('JCD-09 cancels active detail request cleanly on component destruction', () => {
    fixture.detectChanges();
    const req = http.expectOne(`${API_BASE}/api/v1/manager/jobs/${JOB_1}`);

    fixture.destroy();
    expect(req.cancelled).toBe(true);
  });
});
