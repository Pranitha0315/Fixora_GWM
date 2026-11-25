import type { DashboardData } from '../models/dashboard.model';

export class DashboardResponseError extends Error {
  constructor(field: string) {
    super(`Invalid dashboard response: ${field}`);
    this.name = 'DashboardResponseError';
  }
}

function readNumber(
  source: Record<string, unknown>,
  field: keyof DashboardData,
  integer: boolean,
): number {
  const raw = source[field];

  if (typeof raw !== 'number' && typeof raw !== 'string') {
    throw new DashboardResponseError(field);
  }

  if (typeof raw === 'string') {
    const pattern = integer
      ? /^-?(?:0|[1-9]\d*)$/
      : /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

    if (!pattern.test(raw)) {
      throw new DashboardResponseError(field);
    }
  }

  const value = Number(raw);

  if (!Number.isFinite(value)) {
    throw new DashboardResponseError(field);
  }

  if (
    integer &&
    (!Number.isSafeInteger(value) ||
      value < -2147483648 ||
      value > 2147483647)
  ) {
    throw new DashboardResponseError(field);
  }

  return value;
}

export function validateDashboardResponse(
  response: unknown,
): DashboardData {
  if (
    typeof response !== 'object' ||
    response === null ||
    Array.isArray(response)
  ) {
    throw new DashboardResponseError('response');
  }

  const source = response as Record<string, unknown>;

  return {
    todayBookings: readNumber(source, 'todayBookings', true),
    pendingBookings: readNumber(source, 'pendingBookings', true),
    activeJobs: readNumber(source, 'activeJobs', true),
    proposalsToReview: readNumber(source, 'proposalsToReview', true),
    approvalsToRelease: readNumber(source, 'approvalsToRelease', true),
    changeRequestsToReview: readNumber(source, 'changeRequestsToReview', true),
    openSos: readNumber(source, 'openSos', true),
    lowStockParts: readNumber(source, 'lowStockParts', true),
    unpaidInvoices: readNumber(source, 'unpaidInvoices', true),
    revenueThisWeek: readNumber(source, 'revenueThisWeek', false),
    revenueLastWeek: readNumber(source, 'revenueLastWeek', false),
    platformEarningsThisMonth: readNumber(
      source,
      'platformEarningsThisMonth',
      false,
    ),
  };
}
