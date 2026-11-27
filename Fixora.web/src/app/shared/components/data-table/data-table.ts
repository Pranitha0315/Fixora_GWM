import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';

import { NgTemplateOutlet } from '@angular/common';

import type {
  DataTableAction,
  DataTableActionEvent,
  DataTableColumn,
  DataTableFilter,
  DataTableSort,
  DataTableValue,
} from './data-table.models';

@Component({
  selector: 'fx-data-table',
  standalone: true,
  imports: [NgTemplateOutlet],
  templateUrl: './data-table.html',
  styleUrl: './data-table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataTable<T> {
  private static nextInstanceId = 0;

  private readonly instanceId =
    ++DataTable.nextInstanceId;

  readonly searchControlId =
    `fx-data-table-${this.instanceId}-search`;

  readonly filterControlId =
    `fx-data-table-${this.instanceId}-filter`;

  readonly columns =
    input.required<readonly DataTableColumn<T>[]>();

  readonly rows =
    input.required<readonly T[]>();

  readonly rowKey =
    input.required<(row: T) => string | number>();

  readonly actions =
    input<readonly DataTableAction<T>[]>([]);

  readonly filter =
    input<DataTableFilter<T> | null>(null);

  readonly tableLabel = input('Data table');

  readonly compactActions = input(false);

  readonly searchable = input(true);
  readonly pagination = input(true);

  readonly pageSize = input(10);

  readonly loading = input(false);

  readonly searchPlaceholder =
    input('Search records...');

  readonly emptyTitle = input('No records found');

  readonly emptyMessage =
    input('There are no records to display.');

  readonly actionTriggered =
    output<DataTableActionEvent<T>>();

  readonly searchQuery = signal('');
  readonly filterValue = signal('');

  readonly sort = signal<DataTableSort | null>(null);

  private readonly requestedPage = signal(0);

  readonly effectivePageSize = computed(() => {
    const size = this.pageSize();

    return Number.isFinite(size) && size > 0
      ? Math.max(1, Math.floor(size))
      : 10;
  });

  readonly filteredRows = computed(() => {
    const query = this.searchable()
      ? this.searchQuery().trim().toLowerCase()
      : '';

    const filter = this.filter();
    const filterValue = this.filterValue();

    const validFilter = filter?.options.some(
      option => option.value === filterValue,
    );

    const searchableColumns = this.columns().filter(
      column => column.searchable !== false,
    );

    return this.rows().filter(row => {
      const matchesSearch =
        !query ||
        searchableColumns.some(column =>
          this.formatValue(column.value(row))
            .toLowerCase()
            .includes(query),
        );

      const matchesFilter =
        !filter ||
        !filterValue ||
        !validFilter ||
        filter.matches(row, filterValue);

      return matchesSearch && matchesFilter;
    });
  });

  readonly sortedRows = computed(() => {
    const rows = [...this.filteredRows()];
    const sort = this.sort();

    if (!sort) {
      return rows;
    }

    const column = this.columns().find(
      item => item.key === sort.key && item.sortable,
    );

    if (!column) {
      return rows;
    }

    const multiplier =
      sort.direction === 'asc' ? 1 : -1;

    return rows.sort((a, b) =>
      multiplier * this.compareValues(
        column.value(a),
        column.value(b),
      ),
    );
  });

  readonly totalRecords = computed(
    () => this.sortedRows().length,
  );

  readonly pageCount = computed(() =>
    this.pagination()
      ? Math.max(
          1,
          Math.ceil(
            this.totalRecords() /
              this.effectivePageSize(),
          ),
        )
      : 1,
  );

  readonly currentPage = computed(() =>
    this.pagination()
      ? Math.max(
          0,
          Math.min(
            this.requestedPage(),
            this.pageCount() - 1,
          ),
        )
      : 0,
  );

  readonly visibleRows = computed(() => {
    const rows = this.sortedRows();

    if (!this.pagination()) {
      return rows;
    }

    const start =
      this.currentPage() * this.effectivePageSize();

    return rows.slice(
      start,
      start + this.effectivePageSize(),
    );
  });

  readonly firstRecord = computed(() =>
    this.totalRecords() === 0
      ? 0
      : this.pagination()
        ? this.currentPage() *
            this.effectivePageSize() + 1
        : 1,
  );

  readonly lastRecord = computed(() =>
    this.totalRecords() === 0
      ? 0
      : this.firstRecord() +
        this.visibleRows().length - 1,
  );

  readonly columnCount = computed(() =>
    Math.max(
      1,
      this.columns().length +
        (this.actions().length > 0 ? 1 : 0),
    ),
  );

  onSearch(event: Event): void {
    this.searchQuery.set(
      (event.target as HTMLInputElement).value,
    );

    this.requestedPage.set(0);
  }

  onFilter(event: Event): void {
    this.filterValue.set(
      (event.target as HTMLSelectElement).value,
    );

    this.requestedPage.set(0);
  }

  toggleSort(column: DataTableColumn<T>): void {
    if (!column.sortable || this.loading()) {
      return;
    }

    const current = this.sort();

    if (
      current?.key === column.key &&
      current.direction === 'asc'
    ) {
      this.sort.set({
        key: column.key,
        direction: 'desc',
      });
    } else if (
      current?.key === column.key &&
      current.direction === 'desc'
    ) {
      this.sort.set(null);
    } else {
      this.sort.set({
        key: column.key,
        direction: 'asc',
      });
    }

    this.requestedPage.set(0);
  }

  sortState(
    column: DataTableColumn<T>,
  ): 'ascending' | 'descending' | 'none' | null {
    if (!column.sortable) {
      return null;
    }

    const sort = this.sort();

    if (!sort || sort.key !== column.key) {
      return 'none';
    }

    return sort.direction === 'asc'
      ? 'ascending'
      : 'descending';
  }

  sortSymbol(column: DataTableColumn<T>): string {
    const state = this.sortState(column);

    if (state === 'ascending') {
      return '\u2191';
    }

    if (state === 'descending') {
      return '\u2193';
    }

    return '\u2195';
  }

  previousPage(): void {
    if (this.loading() || !this.pagination()) {
      return;
    }

    this.requestedPage.set(
      Math.max(0, this.currentPage() - 1),
    );
  }

  nextPage(): void {
    if (this.loading() || !this.pagination()) {
      return;
    }

    this.requestedPage.set(
      Math.min(
        this.pageCount() - 1,
        this.currentPage() + 1,
      ),
    );
  }

  actionMenuId(row: T): string {
    const key = this.rowKey()(row);

    return `fx-table-menu-${this.instanceId}-${typeof key}-${encodeURIComponent(String(key))}`;
  }

  positionActionMenu(
    event: Event,
    menu: HTMLElement,
  ): void {
    const trigger = event.currentTarget;

    if (!(trigger instanceof HTMLElement)) {
      return;
    }

    if (menu.matches(':popover-open')) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(240, viewportWidth - 16);

    menu.style.width = `${width}px`;

    const left = Math.max(
      8,
      Math.min(
        rect.right - width,
        viewportWidth - width - 8,
      ),
    );

    menu.style.left = `${left}px`;

    const below = Math.max(
      0,
      viewportHeight - rect.bottom - 16,
    );

    const above = Math.max(0, rect.top - 16);

    if (below >= 230 || below >= above) {
      menu.style.top = `${rect.bottom + 6}px`;
      menu.style.bottom = 'auto';
      menu.style.maxHeight = `${below}px`;
    } else {
      menu.style.top = 'auto';
      menu.style.bottom =
        `${viewportHeight - rect.top + 6}px`;
      menu.style.maxHeight = `${above}px`;
    }
  }

  closeActionMenu(menu: HTMLElement): void {
    if (menu.matches(':popover-open')) {
      menu.hidePopover();
    }
  }

  selectCompactAction(
    action: DataTableAction<T>,
    row: T,
    menu: HTMLElement,
  ): void {
    if (this.isActionDisabled(action, row)) {
      return;
    }

    this.closeActionMenu(menu);
    this.triggerAction(action, row);
  }

  isActionDisabled(
    action: DataTableAction<T>,
    row: T,
  ): boolean {
    return this.loading() ||
      (action.disabled?.(row) ?? false);
  }

  triggerAction(
    action: DataTableAction<T>,
    row: T,
  ): void {
    if (this.isActionDisabled(action, row)) {
      return;
    }

    this.actionTriggered.emit({
      actionId: action.id,
      row,
    });
  }

  formatValue(value: DataTableValue): string {
    return value === null || value === undefined
      ? '\u2014'
      : String(value);
  }

  private compareValues(
    a: DataTableValue,
    b: DataTableValue,
  ): number {
    if (a === b) {
      return 0;
    }

    if (a === null || a === undefined) {
      return 1;
    }

    if (b === null || b === undefined) {
      return -1;
    }

    if (
      typeof a === 'number' &&
      typeof b === 'number'
    ) {
      return a - b;
    }

    return String(a).localeCompare(
      String(b),
      undefined,
      {
        numeric: true,
        sensitivity: 'base',
      },
    );
  }
}