import type { TemplateRef } from '@angular/core';

export type DataTableValue =
  | string
  | number
  | boolean
  | null
  | undefined;

export type DataTableSortDirection =
  | 'asc'
  | 'desc';

export type DataTableAlignment =
  | 'start'
  | 'center'
  | 'end';

export interface DataTableCellContext<T> {
  readonly $implicit: T;
  readonly row: T;
  readonly value: DataTableValue;
}

export interface DataTableColumn<T> {
  readonly key: string;
  readonly header: string;
  readonly value: (row: T) => DataTableValue;

  readonly sortable?: boolean;
  readonly searchable?: boolean;
  readonly align?: DataTableAlignment;

  readonly template?:
    TemplateRef<DataTableCellContext<T>>;
}

export interface DataTableAction<T> {
  readonly id: string;
  readonly label: string;

  readonly disabled?: (row: T) => boolean;
}

export interface DataTableActionEvent<T> {
  readonly actionId: string;
  readonly row: T;
}

export interface DataTableFilterOption {
  readonly label: string;
  readonly value: string;
}

export interface DataTableFilter<T> {
  readonly label: string;

  readonly options:
    readonly DataTableFilterOption[];

  readonly matches:
    (row: T, value: string) => boolean;
}

export interface DataTableSort {
  readonly key: string;
  readonly direction: DataTableSortDirection;
}