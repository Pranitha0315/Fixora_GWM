import {
  Component,
  computed,
  viewChild,
} from '@angular/core';

import type { TemplateRef } from '@angular/core';

import {
  ComponentFixture,
  TestBed,
} from '@angular/core/testing';

import { vi } from 'vitest';

import { DataTable } from './data-table';

import { StatusBadge } from '../status-badge/status-badge';

import type {
  DataTableAction,
  DataTableCellContext,
  DataTableColumn,
  DataTableFilter,
} from './data-table.models';

interface TestRow {
  readonly id: string;
  readonly name: string;
  readonly amount: number;
  readonly status: string;
}

const ROWS: readonly TestRow[] = [
  {
    id: 'BK-003',
    name: 'Suzuki Swift',
    amount: 100,
    status: 'Pending',
  },
  {
    id: 'BK-001',
    name: 'Toyota Aqua',
    amount: 20,
    status: 'Confirmed',
  },
  {
    id: 'BK-002',
    name: 'Honda Fit',
    amount: 5,
    status: 'Confirmed',
  },
];

const COLUMNS: readonly DataTableColumn<TestRow>[] = [
  {
    key: 'id',
    header: 'Booking ID',
    value: row => row.id,
    sortable: true,
  },
  {
    key: 'name',
    header: 'Vehicle',
    value: row => row.name,
    sortable: true,
  },
  {
    key: 'amount',
    header: 'Amount',
    value: row => row.amount,
    sortable: true,
    searchable: false,
    align: 'end',
  },
  {
    key: 'status',
    header: 'Status',
    value: row => row.status,
  },
];

const FILTER: DataTableFilter<TestRow> = {
  label: 'Booking status',
  options: [
    { label: 'Pending', value: 'Pending' },
    { label: 'Confirmed', value: 'Confirmed' },
  ],
  matches: (row, value) => row.status === value,
};

const ACTIONS: readonly DataTableAction<TestRow>[] = [
  { id: 'view', label: 'View' },
  {
    id: 'edit',
    label: 'Edit',
    disabled: row => row.status === 'Pending',
  },
];

@Component({
  standalone: true,
  imports: [DataTable, StatusBadge],
  template: `
    <ng-template #statusCell let-value="value">
      <fx-status-badge
        [label]="value"
        tone="success"
      />
    </ng-template>

    <fx-data-table
      [rows]="rows"
      [columns]="columns()"
      [rowKey]="rowKey"
    />
  `,
})
class CustomCellTestHost {
  readonly rows = ROWS;
  readonly rowKey = (row: TestRow) => row.id;

  readonly statusCell = viewChild<
    TemplateRef<DataTableCellContext<TestRow>>
  >('statusCell');

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
}

describe('DataTable', () => {
  let fixture: ComponentFixture<DataTable<TestRow>>;
  let component: DataTable<TestRow>;

  function element(selector: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(selector);
  }

  function dataRows(): NodeListOf<HTMLTableRowElement> {
    return fixture.nativeElement.querySelectorAll(
      '.fx-table-data-row',
    );
  }

  function search(value: string): void {
    const input = element(
      '.fx-table-search',
    ) as HTMLInputElement;

    input.value = value;

    input.dispatchEvent(
      new Event('input', { bubbles: true }),
    );

    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DataTable, CustomCellTestHost],
    }).compileComponents();

    fixture = TestBed.createComponent(DataTable<TestRow>);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('rows', ROWS);
    fixture.componentRef.setInput('columns', COLUMNS);

    fixture.componentRef.setInput(
      'rowKey',
      (row: TestRow) => row.id,
    );

    fixture.detectChanges();
  });

  it('should create the data table', () => {
    expect(component).toBeTruthy();
  });

  it('should render dynamic column headers', () => {
    expect(
      fixture.nativeElement.querySelectorAll('th').length,
    ).toBe(4);
  });

  it('should render dynamic rows', () => {
    expect(dataRows().length).toBe(3);
    expect(dataRows()[0].textContent)
      .toContain('Suzuki Swift');
  });

  it('should render an accessible table caption', () => {
    fixture.componentRef.setInput(
      'tableLabel',
      'Workshop bookings',
    );

    fixture.detectChanges();

    expect(element('caption')?.textContent)
      .toContain('Workshop bookings');
  });

  it('should search records case insensitively', () => {
    search('TOYOTA');

    expect(dataRows().length).toBe(1);
    expect(dataRows()[0].textContent)
      .toContain('Toyota Aqua');
  });

  it('should trim search whitespace', () => {
    search('  Honda  ');

    expect(dataRows().length).toBe(1);
  });

  it('should exclude non-searchable columns', () => {
    search('100');

    expect(dataRows().length).toBe(0);
  });

  it('should restore all records when search is cleared', () => {
    search('Honda');
    search('');

    expect(dataRows().length).toBe(3);
  });

  it('should support disabling search', () => {
    search('Honda');

    fixture.componentRef.setInput('searchable', false);
    fixture.detectChanges();

    expect(element('.fx-table-search')).toBeNull();
    expect(dataRows().length).toBe(3);
  });

  it('should filter records using the configured filter', () => {
    fixture.componentRef.setInput('filter', FILTER);
    fixture.detectChanges();

    const select = element(
      '.fx-table-filter',
    ) as HTMLSelectElement;

    select.value = 'Confirmed';

    select.dispatchEvent(
      new Event('change', { bubbles: true }),
    );

    fixture.detectChanges();

    expect(dataRows().length).toBe(2);
  });

  it('should combine search and filtering', () => {
    fixture.componentRef.setInput('filter', FILTER);
    fixture.detectChanges();

    component.filterValue.set('Confirmed');
    search('Honda');

    expect(dataRows().length).toBe(1);
    expect(dataRows()[0].textContent)
      .toContain('Honda Fit');
  });

  it('should sort string values in ascending order', () => {
    component.toggleSort(COLUMNS[1]);
    fixture.detectChanges();

    expect(dataRows()[0].textContent)
      .toContain('Honda Fit');
  });

  it('should sort string values in descending order', () => {
    component.toggleSort(COLUMNS[1]);
    component.toggleSort(COLUMNS[1]);
    fixture.detectChanges();

    expect(dataRows()[0].textContent)
      .toContain('Toyota Aqua');
  });

  it('should reset sorting on the third activation', () => {
    component.toggleSort(COLUMNS[1]);
    component.toggleSort(COLUMNS[1]);
    component.toggleSort(COLUMNS[1]);
    fixture.detectChanges();

    expect(dataRows()[0].textContent)
      .toContain('Suzuki Swift');
  });

  it('should sort numeric values numerically', () => {
    component.toggleSort(COLUMNS[2]);

    expect(
      component.sortedRows().map(row => row.amount),
    ).toEqual([5, 20, 100]);
  });

  it('should not sort non-sortable columns', () => {
    component.toggleSort(COLUMNS[3]);

    expect(component.sort()).toBeNull();
  });

  it('should expose accessible sort state', () => {
    component.toggleSort(COLUMNS[1]);
    fixture.detectChanges();

    expect(
      element('th[aria-sort="ascending"]')?.textContent,
    ).toContain('Vehicle');
  });

  it('should not mutate source records during sorting', () => {
    const before = ROWS.map(row => row.id);

    component.toggleSort(COLUMNS[1]);
    component.sortedRows();

    expect(ROWS.map(row => row.id)).toEqual(before);
  });

  it('should respect the configured page size', () => {
    fixture.componentRef.setInput('pageSize', 2);
    fixture.detectChanges();

    expect(dataRows().length).toBe(2);
    expect(component.pageCount()).toBe(2);
  });

  it('should navigate to the next page', () => {
    fixture.componentRef.setInput('pageSize', 2);
    fixture.detectChanges();

    component.nextPage();
    fixture.detectChanges();

    expect(dataRows().length).toBe(1);
    expect(component.currentPage()).toBe(1);
  });

  it('should navigate to the previous page', () => {
    fixture.componentRef.setInput('pageSize', 2);

    component.nextPage();
    component.previousPage();
    fixture.detectChanges();

    expect(component.currentPage()).toBe(0);
  });

  it('should prevent navigation beyond page boundaries', () => {
    fixture.componentRef.setInput('pageSize', 2);

    component.previousPage();

    expect(component.currentPage()).toBe(0);

    component.nextPage();
    component.nextPage();

    expect(component.currentPage()).toBe(1);
  });

  it('should reset pagination when searching', () => {
    fixture.componentRef.setInput('pageSize', 1);
    fixture.detectChanges();

    component.nextPage();
    search('Toyota');

    expect(component.currentPage()).toBe(0);
    expect(dataRows().length).toBe(1);
  });

  it('should clamp the page when records are reduced', () => {
    fixture.componentRef.setInput('pageSize', 1);

    component.nextPage();
    component.nextPage();

    fixture.componentRef.setInput(
      'rows',
      [ROWS[0]],
    );

    fixture.detectChanges();

    expect(component.currentPage()).toBe(0);
    expect(dataRows().length).toBe(1);
  });

  it('should use a safe fallback for invalid page size', () => {
    fixture.componentRef.setInput('pageSize', 0);

    expect(component.effectivePageSize()).toBe(10);
  });

  it('should support disabling pagination', () => {
    fixture.componentRef.setInput('pageSize', 1);
    fixture.componentRef.setInput('pagination', false);

    fixture.detectChanges();

    expect(dataRows().length).toBe(3);
    expect(element('.fx-table-pagination')).toBeNull();
  });

  it('should display an empty state', () => {
    fixture.componentRef.setInput('rows', []);
    fixture.detectChanges();

    expect(dataRows().length).toBe(0);

    expect(element('.fx-table-state')?.textContent)
      .toContain('No records found');
  });

  it('should support a custom empty state', () => {
    fixture.componentRef.setInput('rows', []);

    fixture.componentRef.setInput(
      'emptyTitle',
      'No bookings available',
    );

    fixture.detectChanges();

    expect(element('.fx-table-state')?.textContent)
      .toContain('No bookings available');
  });

  it('should display loading instead of records', () => {
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();

    expect(dataRows().length).toBe(0);
    expect(element('.fx-table-spinner')).not.toBeNull();
  });

  it('should expose the loading state accessibly', () => {
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();

    expect(
      element('.fx-data-table')?.getAttribute('aria-busy'),
    ).toBe('true');

    expect(element('[role="status"]')?.textContent)
      .toContain('Loading records...');
  });

  it('should render configured row actions', () => {
    fixture.componentRef.setInput('actions', ACTIONS);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelectorAll(
        '.fx-table-action',
      ).length,
    ).toBe(6);
  });

  it('should emit the selected row and action identifier', () => {
    fixture.componentRef.setInput('actions', ACTIONS);
    fixture.detectChanges();

    const handler = vi.fn();

    component.actionTriggered.subscribe(handler);

    const button = element(
      '.fx-table-action',
    ) as HTMLButtonElement;

    button.click();

    expect(handler).toHaveBeenCalledWith({
      actionId: 'view',
      row: ROWS[0],
    });
  });

  it('should disable unavailable row actions', () => {
    fixture.componentRef.setInput('actions', ACTIONS);
    fixture.detectChanges();

    const buttons = dataRows()[0].querySelectorAll('button');

    expect(buttons[1].disabled).toBe(true);
  });

  it('should not emit disabled actions', () => {
    const handler = vi.fn();

    component.actionTriggered.subscribe(handler);

    component.triggerAction(ACTIONS[1], ROWS[0]);

    expect(handler).not.toHaveBeenCalled();
  });

  it('should block actions while loading', () => {
    fixture.componentRef.setInput('loading', true);

    const handler = vi.fn();

    component.actionTriggered.subscribe(handler);

    component.triggerAction(ACTIONS[0], ROWS[0]);

    expect(handler).not.toHaveBeenCalled();
  });

  it('should render null values safely', () => {
    expect(component.formatValue(null)).toBe('\u2014');
    expect(component.formatValue(undefined)).toBe('\u2014');
    expect(component.formatValue(0)).toBe('0');
  });

  it('should render cell text without interpreting HTML', () => {
    fixture.componentRef.setInput('rows', [
      {
        ...ROWS[0],
        name: '<b>Unsafe HTML</b>',
      },
    ]);

    fixture.detectChanges();

    expect(dataRows()[0].textContent)
      .toContain('<b>Unsafe HTML</b>');

    expect(dataRows()[0].querySelector('b')).toBeNull();
  });

  it('should display a custom cell with a status badge', async () => {
    const host =
      TestBed.createComponent(CustomCellTestHost);

    host.detectChanges();
    await host.whenStable();
    host.detectChanges();

    const badge: HTMLElement =
      host.nativeElement.querySelector(
        'fx-status-badge',
      );

    expect(badge).not.toBeNull();
    expect(badge.textContent).toContain('Pending');
  });

  it('should report the displayed record range', () => {
    fixture.componentRef.setInput('pageSize', 2);
    fixture.detectChanges();

    expect(component.firstRecord()).toBe(1);
    expect(component.lastRecord()).toBe(2);

    component.nextPage();

    expect(component.firstRecord()).toBe(3);
    expect(component.lastRecord()).toBe(3);
  });

  it('should report zero range for empty records', () => {
    fixture.componentRef.setInput('rows', []);

    expect(component.firstRecord()).toBe(0);
    expect(component.lastRecord()).toBe(0);
    expect(component.totalRecords()).toBe(0);
  });
});