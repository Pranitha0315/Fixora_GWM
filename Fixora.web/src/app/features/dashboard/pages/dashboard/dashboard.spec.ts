import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';

import { Subject } from 'rxjs';

import { Dashboard } from './dashboard';
import { DashboardApiService } from '../../services/dashboard-api.service';
import type { DashboardData } from '../../models/dashboard.model';
import { DashboardResponseError } from '../../utils/dashboard-response.validator';
import { ApiError } from '../../../../core/models/api-error.model';

describe('Dashboard', () => {
  let fixture: ComponentFixture<Dashboard>;
  let component: Dashboard;
  let requests: Subject<DashboardData>[];

  const valid: DashboardData = {
    todayBookings: 2,
    pendingBookings: 1,
    activeJobs: 2,
    proposalsToReview: 0,
    approvalsToRelease: 0,
    changeRequestsToReview: 0,
    openSos: 0,
    lowStockParts: 1,
    unpaidInvoices: 0,
    revenueThisWeek: 144500,
    revenueLastWeek: 184000,
    platformEarningsThisMonth: 5000,
  };

  beforeEach(async () => {
    requests = [];

    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        {
          provide: DashboardApiService,
          useValue: {
            getDashboard: () => {
              const request = new Subject<DashboardData>();
              requests.push(request);
              return request.asObservable();
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Dashboard);
    component = fixture.componentInstance;

    fixture.detectChanges();
  });

  function completeRequest(
    response: DashboardData = valid,
    index = requests.length - 1,
  ): void {
    requests[index].next(response);
    requests[index].complete();
    fixture.detectChanges();
  }

  function pageText(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  it('DC-01 creates the dashboard', () => {
    expect(component).toBeTruthy();
  });

  it('DC-02 requests data automatically', () => {
    expect(requests.length).toBe(1);
    expect(component.isLoading()).toBe(true);
  });

  it('DC-03 displays loading state', () => {
    expect(
      fixture.nativeElement.querySelector('fx-loading-state'),
    ).not.toBeNull();

    expect(pageText()).toContain('Loading dashboard...');
  });

  it('DC-04 stores a successful response', () => {
    completeRequest();

    expect(component.data()).toEqual(valid);
    expect(component.isLoading()).toBe(false);
    expect(component.errorMessage()).toBeNull();
  });

  it('DC-05 renders all twelve KPI cards', () => {
    completeRequest();

    const cards = fixture.nativeElement.querySelectorAll(
      'fx-kpi-card',
    );

    expect(cards.length).toBe(12);
    expect(pageText()).toContain("Today's Bookings");
    expect(pageText()).toContain('Financial Overview');
    expect(pageText()).toContain('144,500.00');
  });

  it('DC-06 displays last updated information', () => {
    completeRequest();

    expect(component.lastUpdated()).toBeInstanceOf(Date);
    expect(pageText()).toContain('Last updated:');
  });

  it('DC-07 prevents duplicate requests', () => {
    component.refresh();
    component.refresh();

    expect(requests.length).toBe(1);
  });

  it('DC-08 refreshes dashboard data', () => {
    completeRequest();

    const button = fixture.nativeElement.querySelector(
      '.dashboard-header button',
    ) as HTMLButtonElement;

    button.click();

    expect(requests.length).toBe(2);

    completeRequest({
      ...valid,
      todayBookings: 7,
    });

    expect(component.data()?.todayBookings).toBe(7);
  });

  it('DC-09 handles network errors', () => {
    requests[0].error(
      new ApiError(0, 'NETWORK_ERROR', 'Network failure'),
    );

    fixture.detectChanges();

    expect(component.isLoading()).toBe(false);
    expect(pageText()).toContain('Unable to connect');
  });

  it('DC-10 handles unauthorized errors', () => {
    requests[0].error(
      new ApiError(401, 'UNAUTHORIZED', 'Unauthorized'),
    );

    fixture.detectChanges();

    expect(pageText()).toContain('Please sign in again');
    expect(component.data()).toBeNull();
  });

  it('DC-11 handles forbidden errors', () => {
    requests[0].error(
      new ApiError(403, 'FORBIDDEN', 'Forbidden'),
    );

    fixture.detectChanges();

    expect(pageText()).toContain(
      'You do not have permission',
    );
  });

  it('DC-12 handles rate-limit errors', () => {
    requests[0].error(
      new ApiError(429, 'RATE_LIMITED', 'Rate limited'),
    );

    fixture.detectChanges();

    expect(pageText()).toContain('Too many requests');
  });

  it('DC-13 handles server errors safely', () => {
    requests[0].error(
      new ApiError(500, 'SERVER_ERROR', 'Internal details'),
    );

    fixture.detectChanges();

    expect(pageText()).toContain(
      'Unable to load dashboard information',
    );

    expect(pageText()).not.toContain('Internal details');
  });

  it('DC-14 handles invalid dashboard responses', () => {
    requests[0].error(
      new DashboardResponseError('activeJobs'),
    );

    fixture.detectChanges();

    expect(pageText()).toContain(
      'invalid dashboard information',
    );

    expect(component.data()).toBeNull();
  });

  it('DC-15 retries after an error', () => {
    requests[0].error(
      new ApiError(500, 'SERVER_ERROR', 'Failed'),
    );

    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      'fx-error-state button',
    ) as HTMLButtonElement;

    button.click();

    expect(requests.length).toBe(2);

    completeRequest();

    expect(component.errorMessage()).toBeNull();
    expect(component.data()).toEqual(valid);
  });

  it('DC-16 clears stale data during failed refresh', () => {
    completeRequest();

    component.refresh();

    expect(component.data()).toBeNull();
    expect(component.lastUpdated()).toBeNull();

    requests[1].error(
      new ApiError(500, 'SERVER_ERROR', 'Failed'),
    );

    fixture.detectChanges();

    expect(component.data()).toBeNull();

    expect(
      fixture.nativeElement.querySelectorAll('fx-kpi-card').length,
    ).toBe(0);
  });

  it('DC-17 renders zero values as valid statistics', () => {
    const zero = Object.fromEntries(
      Object.keys(valid).map((key) => [key, 0]),
    ) as unknown as DashboardData;

    completeRequest(zero);

    expect(component.data()).toEqual(zero);

    expect(
      fixture.nativeElement.querySelectorAll('fx-kpi-card').length,
    ).toBe(12);

    expect(
      fixture.nativeElement.querySelector('fx-empty-state'),
    ).toBeNull();
  });

  it('DC-18 unsubscribes when the component is destroyed', () => {
    expect(requests[0].observed).toBe(true);

    fixture.destroy();

    expect(requests[0].observed).toBe(false);
  });
});
