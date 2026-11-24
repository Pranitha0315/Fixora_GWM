import {
  Component,
  computed,
  signal,
  viewChild,
} from '@angular/core';

import type { TemplateRef } from '@angular/core';

import {
  ComponentFixture,
  TestBed,
} from '@angular/core/testing';

import { DataTable } from '../components/data-table/data-table';
import { StatusBadge } from '../components/status-badge/status-badge';

import type {
  DataTableAction,
  DataTableActionEvent,
  DataTableCellContext,
  DataTableColumn,
  DataTableFilter,
} from '../components/data-table/data-table.models';

import type {
  StatusBadgeTone,
} from '../components/status-badge/status-badge';

type BookingStatus =
  | 'Pending'
  | 'Confirmed'
  | 'Completed'
  | 'Cancelled';

interface Booking {
  readonly id: string;
  readonly customer: string;
  readonly vehicle: string;
  readonly service: string;
  readonly status: BookingStatus;
}

const BOOKINGS: readonly Booking[] = [
  {
    id: 'BK-001',
    customer: 'Arun',
    vehicle: 'Toyota Aqua',
    service: 'Oil Change',
    status: 'Confirmed',
  },
  {
    id: 'BK-002',
    customer: 'Kavin',
    vehicle: 'Honda Fit',
    service: 'General Service',
    status: 'Pending',
  },
  {
    id: 'BK-003',
    customer: 'Priya',
    vehicle: 'Suzuki Swift',
    service: 'Brake Repair',
    status: 'Completed',
  },
  {
    id: 'BK-004',
    customer: 'Ravi',
    vehicle: 'Toyota Prius',
    service: 'Inspection',
    status: 'Cancelled',
  },
  {
    id: 'BK-005',
    customer: 'Shan',
    vehicle: 'Honda Vezel',
    service: 'Oil Change',
    status: 'Pending',
  },
];

const STATUS_TONES: Record<BookingStatus, StatusBadgeTone> = {
  Pending: 'warning',
  Confirmed: 'info',
  Completed: 'success',
  Cancelled: 'danger',
};

const COLUMNS: readonly DataTableColumn<Booking>[] = [
  {
    key: 'id',
    header: 'Booking ID',
    value: row => row.id,
    sortable: true,
  },
  {
    key: 'customer',
    header: 'Customer',
    value: row => row.customer,
    sortable: true,
  },
  {
    key: 'vehicle',
    header: 'Vehicle',
    value: row => row.vehicle,
    sortable: true,
  },
  {
    key: 'service',
    header: 'Service',
    value: row => row.service,
  },
  {
    key: 'status',
    header: 'Status',
    value: row => row.status,
  },
];

const FILTER: DataTableFilter<Booking> = {
  label: 'Booking status',
  options: [
    { label: 'Pending', value: 'Pending' },
    { label: 'Confirmed', value: 'Confirmed' },
    { label: 'Completed', value: 'Completed' },
    { label: 'Cancelled', value: 'Cancelled' },
  ],
  matches: (row, value) => row.status === value,
};

@Component({
  standalone: true,
  imports: [DataTable, StatusBadge],
  template: `
    <ng-template #statusCell let-row>
      <fx-status-badge
        [label]="row.status"
        [tone]="statusTone(row.status)"
      />
    </ng-template>

    <fx-data-table
      tableLabel="Workshop bookings"
      searchPlaceholder="Search bookings..."
      emptyTitle="No bookings found"
      emptyMessage="Try another search or filter."
      [rows]="bookings()"
      [columns]="columns()"
      [rowKey]="rowKey"
      [actions]="actions"
      [filter]="filter"
      [pageSize]="pageSize()"
      [loading]="loading()"
      (actionTriggered)="handleAction($event)"
    />

    @if (selectedBooking(); as booking) {
      <section class="booking-details">
        {{ booking.id }} - {{ booking.customer }}
      </section>
    }
  `,
})
class BookingTableIntegrationHost {
  readonly bookings = signal<readonly Booking[]>(BOOKINGS);
  readonly loading = signal(false);
  readonly pageSize = signal(5);

  readonly selectedBooking = signal<Booking | null>(null);

  readonly lastAction =
    signal<DataTableActionEvent<Booking> | null>(null);

  readonly rowKey = (row: Booking) => row.id;

  readonly filter = FILTER;

  readonly actions: readonly DataTableAction<Booking>[] = [
    { id: 'view', label: 'View' },
  ];

  readonly statusCell =
    viewChild<TemplateRef<DataTableCellContext<Booking>>>(
      'statusCell',
    );

  readonly columns = computed(() =>
    COLUMNS.map(column =>
      column.key === 'status'
        ? {
            ...column,
            template: this.statusCell(),
          }
        : column,
    ),
  );

  statusTone(status: BookingStatus): StatusBadgeTone {
    return STATUS_TONES[status];
  }

  handleAction(event: DataTableActionEvent<Booking>): void {
    this.lastAction.set(event);

    if (event.actionId === 'view') {
      this.selectedBooking.set(event.row);
    }
  }

  updateStatus(id: string, status: BookingStatus): void {
    this.bookings.update(rows =>
      rows.map(row =>
        row.id === id
          ? { ...row, status }
          : row,
      ),
    );
  }
}

describe('Shared UI booking table integration', () => {
  let fixture: ComponentFixture<BookingTableIntegrationHost>;
  let host: BookingTableIntegrationHost;
  let root: HTMLElement;

  function find<T extends HTMLElement>(selector: string): T {
    const result = root.querySelector<T>(selector);

    if (!result) {
      throw new Error(`Missing element: ${selector}`);
    }

    return result;
  }

  function rows(): HTMLTableRowElement[] {
    return Array.from(
      root.querySelectorAll<HTMLTableRowElement>(
        '.fx-table-data-row',
      ),
    );
  }

  function bookingIds(): string[] {
    return rows().map(row =>
      row.cells[0].textContent?.trim() ?? '',
    );
  }

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function search(value: string): Promise<void> {
    const input = find<HTMLInputElement>('.fx-table-search');

    input.value = value;
    input.dispatchEvent(
      new Event('input', { bubbles: true }),
    );

    await render();
  }

  async function filter(value: string): Promise<void> {
    const select = find<HTMLSelectElement>('.fx-table-filter');

    select.value = value;
    select.dispatchEvent(
      new Event('change', { bubbles: true }),
    );

    await render();
  }

  async function click(selector: string): Promise<void> {
    find<HTMLButtonElement>(selector).click();
    await render();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BookingTableIntegrationHost],
    }).compileComponents();

    fixture = TestBed.createComponent(
      BookingTableIntegrationHost,
    );

    host = fixture.componentInstance;
    root = fixture.nativeElement;

    await render();
  });

  it('BIT-01 renders the booking management table', () => {
    expect(root.querySelector('fx-data-table')).not.toBeNull();

    expect(find('caption').textContent)
      .toContain('Workshop bookings');

    expect(root.querySelectorAll('thead th').length).toBe(6);
  });

  it('BIT-02 renders all booking records correctly', () => {
    expect(rows().length).toBe(5);

    expect(bookingIds()).toEqual(
      BOOKINGS.map(booking => booking.id),
    );

    expect(rows()[0].textContent).toContain('Arun');
    expect(rows()[0].textContent).toContain('Toyota Aqua');
    expect(rows()[0].textContent).toContain('Oil Change');
  });

  it('BIT-03 projects status badges into booking cells', () => {
    expect(
      root.querySelectorAll('tbody fx-status-badge').length,
    ).toBe(5);

    rows().forEach((row, index) => {
      expect(
        row.querySelector('.fx-status-badge-label')
          ?.textContent?.trim(),
      ).toBe(BOOKINGS[index].status);
    });
  });

  it('BIT-04 applies the correct semantic status tones', () => {
    rows().forEach((row, index) => {
      const badge = row.querySelector('.fx-status-badge');

      const tone = STATUS_TONES[BOOKINGS[index].status];

      expect(
        badge?.classList.contains(`fx-status-badge--${tone}`),
      ).toBe(true);
    });
  });

  it('BIT-05 searches bookings using real input events', async () => {
    await search('  TOYOTA  ');

    expect(bookingIds()).toEqual(['BK-001', 'BK-004']);

    await search('');

    expect(rows().length).toBe(5);
  });

  it('BIT-06 filters bookings by their status', async () => {
    await filter('Pending');

    expect(bookingIds()).toEqual(['BK-002', 'BK-005']);

    expect(
      root.querySelectorAll('.fx-status-badge--warning').length,
    ).toBe(2);

    await search('Honda Vezel');

    expect(bookingIds()).toEqual(['BK-005']);

    await search('');
    await filter('');

    expect(rows().length).toBe(5);
  });

  it('BIT-07 sorts bookings through the column header', async () => {
    const selector = 'thead th:nth-child(2) .fx-table-sort';

    await click(selector);

    expect(bookingIds()).toEqual([
      'BK-001', 'BK-002', 'BK-003', 'BK-004', 'BK-005',
    ]);

    expect(
      find('thead th:nth-child(2)').getAttribute('aria-sort'),
    ).toBe('ascending');

    await click(selector);

    expect(bookingIds()).toEqual([
      'BK-005', 'BK-004', 'BK-003', 'BK-002', 'BK-001',
    ]);

    await click(selector);

    expect(bookingIds()).toEqual(
      BOOKINGS.map(booking => booking.id),
    );
  });

  it('BIT-08 navigates between booking result pages', async () => {
    host.pageSize.set(2);
    await render();

    expect(bookingIds()).toEqual(['BK-001', 'BK-002']);

    const next = '.fx-table-page-button:last-child';
    const previous = '.fx-table-page-button:first-child';

    expect(find<HTMLButtonElement>(previous).disabled).toBe(true);

    await click(next);

    expect(bookingIds()).toEqual(['BK-003', 'BK-004']);

    await click(next);

    expect(bookingIds()).toEqual(['BK-005']);
    expect(find<HTMLButtonElement>(next).disabled).toBe(true);

    await click(previous);

    expect(bookingIds()).toEqual(['BK-003', 'BK-004']);
  });

  it('BIT-09 emits the selected booking action to its parent', async () => {
    await click('button[aria-label="View BK-002"]');

    expect(host.lastAction()).toEqual({
      actionId: 'view',
      row: BOOKINGS[1],
    });

    expect(host.selectedBooking()?.id).toBe('BK-002');

    expect(find('.booking-details').textContent)
      .toContain('BK-002 - Kavin');
  });

  it('BIT-10 updates badge labels and tones dynamically', async () => {
    host.updateStatus('BK-002', 'Confirmed');

    await render();

    const row = rows().find(
      item => item.cells[0].textContent?.trim() === 'BK-002',
    );

    const badge = row?.querySelector('.fx-status-badge');

    expect(badge?.textContent).toContain('Confirmed');

    expect(
      badge?.classList.contains('fx-status-badge--info'),
    ).toBe(true);

    expect(
      badge?.classList.contains('fx-status-badge--warning'),
    ).toBe(false);

    expect(BOOKINGS[1].status).toBe('Pending');
  });

  it('BIT-11 displays and recovers from empty search results', async () => {
    await search('UNKNOWN-BOOKING');

    expect(rows().length).toBe(0);
    expect(find('.fx-table-state').textContent)
      .toContain('No bookings found');

    expect(find('.fx-table-summary').textContent)
      .toContain('Showing 0-0');

    expect(root.querySelector('tbody fx-status-badge')).toBeNull();

    await search('');

    expect(rows().length).toBe(5);
  });

  it('BIT-12 displays loading and restores booking records', async () => {
    host.loading.set(true);
    await render();

    expect(rows().length).toBe(0);

    expect(
      find('.fx-data-table').getAttribute('aria-busy'),
    ).toBe('true');

    expect(root.querySelector('.fx-table-spinner')).not.toBeNull();
    expect(find<HTMLInputElement>('.fx-table-search').disabled)
      .toBe(true);

    expect(find<HTMLSelectElement>('.fx-table-filter').disabled)
      .toBe(true);

    expect(root.querySelector('.fx-table-action')).toBeNull();

    host.loading.set(false);
    await render();

    expect(rows().length).toBe(5);

    expect(
      root.querySelectorAll('tbody fx-status-badge').length,
    ).toBe(5);

    expect(root.querySelector('.fx-table-spinner')).toBeNull();
  });
});