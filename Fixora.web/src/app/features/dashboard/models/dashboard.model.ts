export interface DashboardData {
  readonly todayBookings: number;
  readonly pendingBookings: number;
  readonly activeJobs: number;
  readonly proposalsToReview: number;
  readonly approvalsToRelease: number;
  readonly changeRequestsToReview: number;
  readonly openSos: number;
  readonly lowStockParts: number;
  readonly unpaidInvoices: number;
  readonly revenueThisWeek: number;
  readonly revenueLastWeek: number;
  readonly platformEarningsThisMonth: number;
}

export type DashboardApiResponse = {
  readonly [K in keyof DashboardData]: number | string;
};
