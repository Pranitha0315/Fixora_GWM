import {
  Component,
  signal,
} from '@angular/core';

import {
  ComponentFixture,
  TestBed,
} from '@angular/core/testing';

import { Card } from '../components/card/card';
import { KpiCard } from '../components/kpi-card/kpi-card';

@Component({
  standalone: true,
  imports: [Card, KpiCard],
  template: `
    <fx-card
      title="Workshop Overview"
      subtitle="Daily workshop performance"
      [showFooter]="true"
    >
      <button
        card-actions
        type="button"
        (click)="refreshDashboard()"
      >
        Refresh
      </button>

      <section class="dashboard-kpis">
        <fx-kpi-card
          data-testid="bookings"
          label="Today's Bookings"
          [value]="bookings()"
          tone="primary"
          trend="+12%"
          trendDirection="up"
          trendTone="success"
          [loading]="loading()"
        >
          <span kpi-icon>BK</span>
        </fx-kpi-card>

        <fx-kpi-card
          data-testid="jobs"
          label="Active Job Cards"
          [value]="jobs()"
          tone="info"
          description="Jobs in progress"
          [loading]="loading() || jobsLoading()"
        >
          <span kpi-icon>JB</span>
        </fx-kpi-card>

        <fx-kpi-card
          data-testid="mechanics"
          label="Available Mechanics"
          [value]="mechanics()"
          tone="success"
          description="Ready for assignment"
          [loading]="loading()"
        >
          <span kpi-icon>MC</span>
        </fx-kpi-card>

        <fx-kpi-card
          data-testid="approvals"
          label="Pending Approvals"
          [value]="approvals()"
          tone="warning"
          description="Needs attention"
          [loading]="loading()"
        >
          <span kpi-icon>AP</span>
        </fx-kpi-card>
      </section>

      <span card-footer>
        Last updated: {{ lastUpdated() }}
      </span>
    </fx-card>
  `,
})
class DashboardIntegrationHost {
  readonly bookings = signal(24);
  readonly jobs = signal(18);
  readonly mechanics = signal(8);
  readonly approvals = signal(5);

  readonly loading = signal(false);
  readonly jobsLoading = signal(false);

  readonly refreshCount = signal(0);
  readonly lastUpdated = signal('Initial load');

  refreshDashboard(): void {
    this.refreshCount.update(value => value + 1);
    this.loading.set(true);
  }

  completeRefresh(): void {
    this.bookings.set(28);
    this.jobs.set(20);
    this.lastUpdated.set('Refresh completed');
    this.loading.set(false);
  }
}

describe('Shared UI dashboard integration', () => {
  let fixture: ComponentFixture<DashboardIntegrationHost>;
  let host: DashboardIntegrationHost;
  let root: HTMLElement;

  function element(
    selector: string,
  ): HTMLElement | null {
    return root.querySelector(selector);
  }

  function kpi(id: string): HTMLElement {
    const result = element(
      `fx-kpi-card[data-testid="${id}"]`,
    );

    if (!result) {
      throw new Error(`KPI card not found: ${id}`);
    }

    return result;
  }

  function kpiValue(id: string): string | undefined {
    return kpi(id)
      .querySelector('.fx-kpi-value')
      ?.textContent?.trim();
  }

  async function refresh(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardIntegrationHost],
    }).compileComponents();

    fixture = TestBed.createComponent(
      DashboardIntegrationHost,
    );

    host = fixture.componentInstance;
    root = fixture.nativeElement as HTMLElement;

    await refresh();
  });

  it('DIT-01 renders the dashboard card and body', () => {
    expect(element('fx-card')).not.toBeNull();

    expect(element('.fx-card')).not.toBeNull();

    expect(
      element('.fx-card-body .dashboard-kpis'),
    ).not.toBeNull();
  });

  it('DIT-02 renders dashboard title and subtitle', () => {
    expect(
      element('.fx-card-title')?.textContent,
    ).toContain('Workshop Overview');

    expect(
      element('.fx-card-subtitle')?.textContent,
    ).toContain('Daily workshop performance');
  });

  it('DIT-03 renders four KPI cards inside the card body', () => {
    expect(
      root.querySelectorAll(
        '.fx-card-body fx-kpi-card',
      ),
    ).toHaveLength(4);
  });

  it('DIT-04 displays the correct KPI values', () => {
    expect(kpiValue('bookings')).toBe('24');
    expect(kpiValue('jobs')).toBe('18');
    expect(kpiValue('mechanics')).toBe('8');
    expect(kpiValue('approvals')).toBe('5');
  });

  it('DIT-05 projects custom KPI icons', () => {
    const expectedIcons = [
      ['bookings', 'BK'],
      ['jobs', 'JB'],
      ['mechanics', 'MC'],
      ['approvals', 'AP'],
    ];

    for (const [id, text] of expectedIcons) {
      const icon = kpi(id).querySelector(
        '.fx-kpi-icon',
      );

      expect(icon?.textContent).toContain(text);

      expect(
        icon?.getAttribute('aria-hidden'),
      ).toBe('true');
    }
  });

  it('DIT-06 displays the configured KPI trend', () => {
    const trend = kpi('bookings').querySelector(
      '.fx-kpi-trend',
    );

    expect(trend?.textContent).toContain('+12%');
    expect(trend?.textContent).toContain('\u2191');

    expect(
      trend?.classList.contains(
        'fx-kpi-text--success',
      ),
    ).toBe(true);
  });

  it('DIT-07 displays loading states for all KPI cards', async () => {
    host.loading.set(true);

    await refresh();

    expect(
      root.querySelectorAll('.fx-kpi-skeleton'),
    ).toHaveLength(4);

    expect(
      root.querySelectorAll('.fx-kpi-value'),
    ).toHaveLength(0);

    expect(
      root.querySelectorAll(
        '.fx-kpi-card[aria-busy="true"]',
      ),
    ).toHaveLength(4);
  });

  it('DIT-08 restores KPI data when loading finishes', async () => {
    host.loading.set(true);

    await refresh();

    host.completeRefresh();

    await refresh();

    expect(
      root.querySelectorAll('.fx-kpi-skeleton'),
    ).toHaveLength(0);

    expect(
      root.querySelectorAll('.fx-kpi-value'),
    ).toHaveLength(4);

    expect(kpiValue('bookings')).toBe('28');
    expect(kpiValue('jobs')).toBe('20');

    expect(
      root.querySelectorAll(
        '.fx-kpi-card[aria-busy="true"]',
      ),
    ).toHaveLength(0);
  });

  it('DIT-09 reflects dynamic KPI value updates', async () => {
    host.bookings.set(32);
    host.jobs.set(21);
    host.mechanics.set(6);
    host.approvals.set(0);

    await refresh();

    expect(kpiValue('bookings')).toBe('32');
    expect(kpiValue('jobs')).toBe('21');
    expect(kpiValue('mechanics')).toBe('6');
    expect(kpiValue('approvals')).toBe('0');
  });

  it('DIT-10 triggers refresh from the projected header action', async () => {
    const button = root.querySelector<HTMLButtonElement>(
      '.fx-card-actions button',
    );

    expect(button).not.toBeNull();

    button!.click();

    await refresh();

    expect(host.refreshCount()).toBe(1);
    expect(host.loading()).toBe(true);

    expect(
      root.querySelectorAll('.fx-kpi-skeleton'),
    ).toHaveLength(4);
  });

  it('DIT-11 renders and updates projected footer content', async () => {
    expect(
      element('.fx-card-footer')?.textContent,
    ).toContain('Last updated: Initial load');

    host.completeRefresh();

    await refresh();

    expect(
      element('.fx-card-footer')?.textContent,
    ).toContain('Last updated: Refresh completed');
  });

  it('DIT-12 supports independent KPI loading states', async () => {
    host.jobsLoading.set(true);

    await refresh();

    expect(
      kpi('jobs').querySelector('.fx-kpi-skeleton'),
    ).not.toBeNull();

    expect(kpiValue('jobs')).toBeUndefined();

    expect(kpiValue('bookings')).toBe('24');
    expect(kpiValue('mechanics')).toBe('8');
    expect(kpiValue('approvals')).toBe('5');

    expect(
      root.querySelectorAll('.fx-kpi-skeleton'),
    ).toHaveLength(1);

    host.jobsLoading.set(false);

    await refresh();

    expect(kpiValue('jobs')).toBe('18');

    expect(
      root.querySelectorAll('.fx-kpi-skeleton'),
    ).toHaveLength(0);
  });
});