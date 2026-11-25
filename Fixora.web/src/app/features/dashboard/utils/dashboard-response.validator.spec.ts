import { describe, expect, it } from 'vitest';

import {
  DashboardResponseError,
  validateDashboardResponse,
} from './dashboard-response.validator';

import type { DashboardData } from '../models/dashboard.model';

describe('Dashboard response validator', () => {
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

  it('DV-01 accepts valid numeric response', () => {
    expect(validateDashboardResponse(valid)).toEqual(valid);
  });

  it('DV-02 converts numeric strings', () => {
    const response = Object.fromEntries(
      Object.entries(valid).map(([key, value]) => [
        key,
        String(value),
      ]),
    );

    expect(validateDashboardResponse(response)).toEqual(valid);
  });

  it('DV-03 accepts mixed number and string values', () => {
    expect(
      validateDashboardResponse({
        ...valid,
        todayBookings: '2',
        revenueThisWeek: '144500',
      }),
    ).toEqual(valid);
  });

  it('DV-04 accepts zero values', () => {
    const zero = Object.fromEntries(
      Object.keys(valid).map((key) => [key, 0]),
    );

    expect(validateDashboardResponse(zero)).toEqual(zero);
  });

  it('DV-05 accepts decimal financial values', () => {
    const response = {
      ...valid,
      revenueThisWeek: '144500.75',
    };

    expect(
      validateDashboardResponse(response).revenueThisWeek,
    ).toBe(144500.75);
  });

  it('DV-06 rejects null response', () => {
    expect(() => validateDashboardResponse(null))
      .toThrow(DashboardResponseError);
  });

  it('DV-07 rejects undefined response', () => {
    expect(() => validateDashboardResponse(undefined))
      .toThrow(DashboardResponseError);
  });

  it('DV-08 rejects array response', () => {
    expect(() => validateDashboardResponse([]))
      .toThrow(DashboardResponseError);
  });

  it('DV-09 rejects primitive response', () => {
    expect(() => validateDashboardResponse('invalid'))
      .toThrow(DashboardResponseError);
  });

  it('DV-10 rejects missing required fields', () => {
    for (const field of Object.keys(valid)) {
      const response: Record<string, unknown> = { ...valid };
      delete response[field];

      expect(() => validateDashboardResponse(response))
        .toThrow(DashboardResponseError);
    }
  });

  it('DV-11 rejects null field values', () => {
    expect(() =>
      validateDashboardResponse({
        ...valid,
        activeJobs: null,
      }),
    ).toThrow(DashboardResponseError);
  });

  it('DV-12 rejects boolean field values', () => {
    expect(() =>
      validateDashboardResponse({
        ...valid,
        activeJobs: true,
      }),
    ).toThrow(DashboardResponseError);
  });

  it('DV-13 rejects empty numeric strings', () => {
    expect(() =>
      validateDashboardResponse({
        ...valid,
        activeJobs: '',
      }),
    ).toThrow(DashboardResponseError);
  });

  it('DV-14 rejects non-numeric strings', () => {
    expect(() =>
      validateDashboardResponse({
        ...valid,
        activeJobs: 'invalid',
      }),
    ).toThrow(DashboardResponseError);
  });

  it('DV-15 rejects fractional counts', () => {
    expect(() =>
      validateDashboardResponse({
        ...valid,
        activeJobs: 1.5,
      }),
    ).toThrow(DashboardResponseError);
  });

  it('DV-16 rejects out-of-range integer counts', () => {
    expect(() =>
      validateDashboardResponse({
        ...valid,
        activeJobs: 2147483648,
      }),
    ).toThrow(DashboardResponseError);
  });

  it('DV-17 rejects NaN', () => {
    expect(() =>
      validateDashboardResponse({
        ...valid,
        revenueThisWeek: NaN,
      }),
    ).toThrow(DashboardResponseError);
  });

  it('DV-18 rejects infinite values', () => {
    expect(() =>
      validateDashboardResponse({
        ...valid,
        revenueThisWeek: Infinity,
      }),
    ).toThrow(DashboardResponseError);
  });

  it('DV-19 ignores unknown response fields', () => {
    expect(
      validateDashboardResponse({
        ...valid,
        unexpectedField: 'ignored',
      }),
    ).toEqual(valid);
  });

  it('DV-20 preserves signed values allowed by contract', () => {
    const response = {
      ...valid,
      activeJobs: -1,
      revenueThisWeek: -100.5,
    };

    expect(validateDashboardResponse(response))
      .toEqual(response);
  });
});
