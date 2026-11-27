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


  function enableCompactActions(): void {
    fixture.componentRef.setInput('actions', ACTIONS);
    fixture.componentRef.setInput('compactActions', true);
    fixture.detectChanges();
  }

  function floatingMenu(index = 0): HTMLElement {
    return dataRows()[index].querySelector(
      '.fx-table-action-options',
    ) as HTMLElement;
  }

  function floatingTrigger(index = 0): HTMLButtonElement {
    return dataRows()[index].querySelector(
      '.fx-table-more',
    ) as HTMLButtonElement;
  }

  it('FM01 preserves default inline actions', () => {
    fixture.componentRef.setInput('actions', ACTIONS);
    fixture.detectChanges();

    expect(component.compactActions()).toBe(false);
    expect(element('.fx-table-more')).toBeNull();
    expect(element('[popover]')).toBeNull();

    expect(
      fixture.nativeElement.querySelectorAll('.fx-table-action').length,
    ).toBe(6);
  });

  it('FM02 renders compact action triggers for each row', () => {
    enableCompactActions();

    expect(
      fixture.nativeElement.querySelectorAll('.fx-table-more').length,
    ).toBe(3);

    expect(
      fixture.nativeElement.querySelectorAll('[popover="auto"]').length,
    ).toBe(3);
  });

  it('FM03 keeps View outside the floating menu', () => {
    enableCompactActions();

    const row = dataRows()[0];

    expect(
      row.querySelector('[aria-label="View BK-003"]'),
    ).not.toBeNull();

    expect(
      floatingMenu().querySelector('[aria-label="View BK-003"]'),
    ).toBeNull();

    expect(
      floatingMenu().querySelector('[aria-label="Edit BK-003"]'),
    ).not.toBeNull();
  });

  it('FM04 assigns matching popover targets and menu IDs', () => {
    enableCompactActions();

    ROWS.forEach((row, index) => {
      const menu = floatingMenu(index);
      const trigger = floatingTrigger(index);

      expect(menu.id).toBe(component.actionMenuId(row));
      expect(trigger.getAttribute('popovertarget')).toBe(menu.id);
      expect(menu.getAttribute('popover')).toBe('auto');
    });
  });

  it('FM05 generates distinct stable row menu identifiers', () => {
    enableCompactActions();

    const ids = ROWS.map(row => component.actionMenuId(row));

    expect(new Set(ids).size).toBe(3);

    component.toggleSort(COLUMNS[1]);
    fixture.detectChanges();

    expect(
      ROWS.map(row => component.actionMenuId(row)),
    ).toEqual(ids);
  });

  it('FM06 generates unique menu IDs across table instances', () => {
    enableCompactActions();

    const second = TestBed.createComponent(DataTable<TestRow>);

    try {
      second.componentRef.setInput('rows', ROWS);
      second.componentRef.setInput('columns', COLUMNS);
      second.componentRef.setInput(
        'rowKey',
        (row: TestRow) => row.id,
      );
      second.componentRef.setInput('actions', ACTIONS);
      second.componentRef.setInput('compactActions', true);
      second.detectChanges();

      expect(
        second.componentInstance.actionMenuId(ROWS[0]),
      ).not.toBe(component.actionMenuId(ROWS[0]));
    } finally {
      second.destroy();
    }
  });

  it('FM07 emits View directly in compact mode', () => {
    enableCompactActions();

    const handler = vi.fn();
    component.actionTriggered.subscribe(handler);

    const button = dataRows()[0].querySelector(
      '[aria-label="View BK-003"]',
    ) as HTMLButtonElement;

    button.click();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      actionId: 'view',
      row: ROWS[0],
    });
  });

  it('FM08 emits an enabled compact action exactly once', () => {
    enableCompactActions();

    const handler = vi.fn();
    component.actionTriggered.subscribe(handler);

    const close = vi.spyOn(
      component,
      'closeActionMenu',
    ).mockImplementation(() => {});

    try {
      const button = floatingMenu(1).querySelector(
        '[aria-label="Edit BK-001"]',
      ) as HTMLButtonElement;

      button.click();

      expect(close).toHaveBeenCalledWith(floatingMenu(1));
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({
        actionId: 'edit',
        row: ROWS[1],
      });
    } finally {
      close.mockRestore();
    }
  });

  it('FM09 blocks disabled compact actions', () => {
    enableCompactActions();

    const handler = vi.fn();
    component.actionTriggered.subscribe(handler);

    const menu = floatingMenu();

    const button = menu.querySelector(
      '[aria-label="Edit BK-003"]',
    ) as HTMLButtonElement;

    const close = vi.spyOn(
      component,
      'closeActionMenu',
    ).mockImplementation(() => {});

    try {
      expect(button.disabled).toBe(true);

      button.click();
      component.selectCompactAction(ACTIONS[1], ROWS[0], menu);

      expect(handler).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
    } finally {
      close.mockRestore();
    }
  });

  it('FM10 blocks compact actions during loading', () => {
    enableCompactActions();

    const menu = floatingMenu(1);
    const handler = vi.fn();

    component.actionTriggered.subscribe(handler);

    fixture.componentRef.setInput('loading', true);

    component.selectCompactAction(ACTIONS[1], ROWS[1], menu);

    fixture.detectChanges();

    expect(handler).not.toHaveBeenCalled();
    expect(element('.fx-table-more')).toBeNull();
  });

  it('FM11 closes an open popover', () => {
    enableCompactActions();

    const menu = floatingMenu();
    const hide = vi.fn();

    Object.defineProperty(menu, 'hidePopover', {
      configurable: true,
      value: hide,
    });

    const matches = vi.spyOn(menu, 'matches').mockReturnValue(true);

    try {
      component.closeActionMenu(menu);

      expect(matches).toHaveBeenCalledWith(':popover-open');
      expect(hide).toHaveBeenCalledTimes(1);
    } finally {
      matches.mockRestore();
    }
  });

  it('FM12 does not close an already closed popover', () => {
    enableCompactActions();

    const menu = floatingMenu();
    const hide = vi.fn();

    Object.defineProperty(menu, 'hidePopover', {
      configurable: true,
      value: hide,
    });

    const matches = vi.spyOn(menu, 'matches').mockReturnValue(false);

    try {
      component.closeActionMenu(menu);

      expect(hide).not.toHaveBeenCalled();
    } finally {
      matches.mockRestore();
    }
  });

  function positionFloatingMenu(
    rect: DOMRect,
    width: number,
    height: number,
  ): HTMLElement {
    enableCompactActions();

    const trigger = floatingTrigger();
    const menu = floatingMenu();

    const matches = vi.spyOn(menu, 'matches').mockReturnValue(false);

    const bounds = vi.spyOn(
      trigger,
      'getBoundingClientRect',
    ).mockReturnValue(rect);

    const originalWidth = Object.getOwnPropertyDescriptor(
      window,
      'innerWidth',
    );

    const originalHeight = Object.getOwnPropertyDescriptor(
      window,
      'innerHeight',
    );

    try {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: width,
      });

      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: height,
      });

      component.positionActionMenu(
        { currentTarget: trigger } as unknown as Event,
        menu,
      );

      return menu;
    } finally {
      matches.mockRestore();
      bounds.mockRestore();

      if (originalWidth) {
        Object.defineProperty(window, 'innerWidth', originalWidth);
      } else {
        Reflect.deleteProperty(window, 'innerWidth');
      }

      if (originalHeight) {
        Object.defineProperty(window, 'innerHeight', originalHeight);
      } else {
        Reflect.deleteProperty(window, 'innerHeight');
      }
    }
  }

  it('FM13 positions the floating menu below when space is available', () => {
    const menu = positionFloatingMenu(
      new DOMRect(900, 100, 40, 40),
      1200,
      800,
    );

    expect(menu.style.width).toBe('240px');
    expect(menu.style.left).toBe('700px');
    expect(menu.style.top).toBe('146px');
    expect(menu.style.bottom).toBe('auto');
    expect(menu.style.maxHeight).toBe('644px');
  });

  it('FM14 positions the floating menu above near the viewport bottom', () => {
    const menu = positionFloatingMenu(
      new DOMRect(900, 720, 40, 40),
      1200,
      800,
    );

    expect(menu.style.top).toBe('auto');
    expect(menu.style.bottom).toBe('86px');
    expect(menu.style.maxHeight).toBe('704px');
  });

  it('FM15 constrains the floating menu within a narrow viewport', () => {
    const menu = positionFloatingMenu(
      new DOMRect(160, 100, 30, 40),
      200,
      600,
    );

    expect(menu.style.width).toBe('184px');
    expect(menu.style.left).toBe('8px');
    expect(menu.style.top).toBe('146px');
  });

  it('AT01 should provide a search input identifier', () => {
    const control = element('.fx-table-search') as HTMLInputElement;

    expect(control).not.toBeNull();
    expect(control.id).toMatch(/^fx-data-table-\d+-search$/);
    expect(control.id).toBe(component.searchControlId);
  });

  it('AT02 should provide a search input name', () => {
    const control = element('.fx-table-search') as HTMLInputElement;

    expect(control.name).toBeTruthy();
    expect(control.name).toBe(control.id);
  });

  it('AT03 should provide a filter dropdown identifier', () => {
    fixture.componentRef.setInput('filter', FILTER);
    fixture.detectChanges();

    const control = element('.fx-table-filter') as HTMLSelectElement;

    expect(control).not.toBeNull();
    expect(control.id).toMatch(/^fx-data-table-\d+-filter$/);
    expect(control.id).toBe(component.filterControlId);
  });

  it('AT04 should provide a filter dropdown name', () => {
    fixture.componentRef.setInput('filter', FILTER);
    fixture.detectChanges();

    const control = element('.fx-table-filter') as HTMLSelectElement;

    expect(control.name).toBeTruthy();
    expect(control.name).toBe(control.id);
  });

  it('AT05 should use distinct search and filter identifiers', () => {
    fixture.componentRef.setInput('filter', FILTER);
    fixture.detectChanges();

    const searchInput = element('.fx-table-search') as HTMLInputElement;
    const filterInput = element('.fx-table-filter') as HTMLSelectElement;

    expect(searchInput.id).not.toBe(filterInput.id);
    expect(searchInput.name).not.toBe(filterInput.name);
  });

  it('AT06 should use unique identifiers across table instances', () => {
    fixture.componentRef.setInput('filter', FILTER);
    fixture.detectChanges();

    const second = TestBed.createComponent(DataTable<TestRow>);

    try {
      second.componentRef.setInput('rows', ROWS);
      second.componentRef.setInput('columns', COLUMNS);
      second.componentRef.setInput('rowKey', (row: TestRow) => row.id);
      second.componentRef.setInput('filter', FILTER);
      second.detectChanges();

      const controls = [
        element('.fx-table-search') as HTMLInputElement,
        element('.fx-table-filter') as HTMLSelectElement,
        second.nativeElement.querySelector('.fx-table-search') as HTMLInputElement,
        second.nativeElement.querySelector('.fx-table-filter') as HTMLSelectElement,
      ];

      const ids = controls.map(control => control.id);
      const names = controls.map(control => control.name);

      expect(ids.every(id => id.length > 0)).toBe(true);
      expect(names.every(name => name.length > 0)).toBe(true);
      expect(new Set(ids).size).toBe(4);
      expect(new Set(names).size).toBe(4);
    } finally {
      second.destroy();
    }
  });

  it('AT07 should preserve identifiers during table interactions', () => {
    fixture.componentRef.setInput('filter', FILTER);
    fixture.detectChanges();

    const searchId = element('.fx-table-search')!.id;
    const filterId = element('.fx-table-filter')!.id;

    search('Honda');
    component.toggleSort(COLUMNS[1]);
    fixture.detectChanges();

    expect(element('.fx-table-search')!.id).toBe(searchId);
    expect(element('.fx-table-filter')!.id).toBe(filterId);

    fixture.componentRef.setInput('searchable', false);
    fixture.componentRef.setInput('filter', null);
    fixture.detectChanges();

    expect(element('.fx-table-search')).toBeNull();
    expect(element('.fx-table-filter')).toBeNull();

    fixture.componentRef.setInput('searchable', true);
    fixture.componentRef.setInput('filter', FILTER);
    fixture.detectChanges();

    expect(element('.fx-table-search')!.id).toBe(searchId);
    expect(element('.fx-table-filter')!.id).toBe(filterId);
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