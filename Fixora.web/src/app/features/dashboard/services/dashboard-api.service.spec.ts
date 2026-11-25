import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ApiUrlService } from '../../../core/config/api-url.service';
import { DashboardApiService } from './dashboard-api.service';
import type { DashboardData } from '../models/dashboard.model';
import { DashboardResponseError } from '../utils/dashboard-response.validator';

describe('DashboardApiService', () => {
  let service: DashboardApiService;
  let http: HttpTestingController;

  const endpoint = 'https://localhost:7080/api/v1/manager/dashboard';

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

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        DashboardApiService,
        {
          provide: ApiUrlService,
          useValue: {
            resolve: (path: string) =>
              `https://localhost:7080/${path}`,
          },
        },
      ],
    });

    service = TestBed.inject(DashboardApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('DA-01 creates the service', () => {
    expect(service).toBeTruthy();
  });

  it('DA-02 uses the correct HTTPS endpoint', async () => {
    const result = firstValueFrom(service.getDashboard());

    const request = http.expectOne(endpoint);

    expect(request.request.url).toBe(endpoint);

    request.flush(valid);
    await result;
  });

  it('DA-03 uses GET without a request body', async () => {
    const result = firstValueFrom(service.getDashboard());

    const request = http.expectOne(endpoint);

    expect(request.request.method).toBe('GET');
    expect(request.request.body).toBeNull();

    request.flush(valid);
    await result;
  });

  it('DA-04 returns validated dashboard data', async () => {
    const result = firstValueFrom(service.getDashboard());

    http.expectOne(endpoint).flush(valid);

    await expect(result).resolves.toEqual(valid);
  });

  it('DA-05 converts numeric strings', async () => {
    const result = firstValueFrom(service.getDashboard());

    http.expectOne(endpoint).flush({
      ...valid,
      todayBookings: '2',
      revenueThisWeek: '144500',
    });

    await expect(result).resolves.toEqual(valid);
  });

  it('DA-06 rejects missing required fields', async () => {
    const result = firstValueFrom(service.getDashboard());
    const assertion = expect(result)
      .rejects.toBeInstanceOf(DashboardResponseError);

    http.expectOne(endpoint).flush({
      todayBookings: 2,
    });

    await assertion;
  });

  it('DA-07 rejects invalid field values', async () => {
    const result = firstValueFrom(service.getDashboard());
    const assertion = expect(result)
      .rejects.toBeInstanceOf(DashboardResponseError);

    http.expectOne(endpoint).flush({
      ...valid,
      activeJobs: 'invalid',
    });

    await assertion;
  });

  it('DA-08 propagates HTTP 401', async () => {
    const result = firstValueFrom(service.getDashboard());
    const assertion = expect(result)
      .rejects.toMatchObject({ status: 401 });

    http.expectOne(endpoint).flush(null, {
      status: 401,
      statusText: 'Unauthorized',
    });

    await assertion;
  });

  it('DA-09 propagates HTTP 403', async () => {
    const result = firstValueFrom(service.getDashboard());
    const assertion = expect(result)
      .rejects.toMatchObject({ status: 403 });

    http.expectOne(endpoint).flush(null, {
      status: 403,
      statusText: 'Forbidden',
    });

    await assertion;
  });

  it('DA-10 propagates HTTP 500', async () => {
    const result = firstValueFrom(service.getDashboard());
    const assertion = expect(result)
      .rejects.toMatchObject({ status: 500 });

    http.expectOne(endpoint).flush(null, {
      status: 500,
      statusText: 'Internal Server Error',
    });

    await assertion;
  });

  it('DA-11 propagates network failure', async () => {
    const result = firstValueFrom(service.getDashboard());
    const assertion = expect(result)
      .rejects.toMatchObject({ status: 0 });

    http.expectOne(endpoint).error(
      new ProgressEvent('error'),
    );

    await assertion;
  });

  it('DA-12 cancels an unsubscribed request', () => {
    const subscription = service.getDashboard().subscribe();

    const request = http.expectOne(endpoint);

    subscription.unsubscribe();

    expect(request.cancelled).toBe(true);
  });
});
