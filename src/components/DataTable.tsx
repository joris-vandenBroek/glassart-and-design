'use client';

import { useMemo, useState, type ReactNode } from 'react';

export interface Column<T> {
  key: keyof T & string;
  label: string;
  sortable?: boolean;
  render?: (row: T) => ReactNode;
}

export interface StatusQuickFilterOption {
  value: string; // '' betekent: geen filter, alle rijen
  label: string;
  testId: string; // los van `value`, want statuswaarden bevatten spaties
}

export interface StatusQuickFilter<T> {
  key: keyof T & string;
  options: StatusQuickFilterOption[];
  value: string;
  onChange: (value: string) => void;
}

export interface RowSelection<T> {
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
  isSelectable: (row: T) => boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  onRowClick: (row: T) => void;
  quickFilter?: StatusQuickFilter<T>;
  selection?: RowSelection<T>;
  emptyLabel: string;
  searchPlaceholder: string;
  /**
   * Kolom waarop de tabel bij het openen gesorteerd staat. Standaard de eerste
   * sorteerbare kolom; geef `null` door om te starten in de volgorde waarin de
   * rijen worden aangeleverd.
   */
  defaultSortKey?: (keyof T & string) | null;
  defaultSortDirection?: 'asc' | 'desc';
}

type SortDirection = 'asc' | 'desc' | null;

const collator = new Intl.Collator('nl', { numeric: true, sensitivity: 'base' });

function compareValues(aValue: unknown, bValue: unknown): number {
  if (typeof aValue === 'number' && typeof bValue === 'number') {
    return aValue - bValue;
  }
  if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
    return Number(aValue) - Number(bValue);
  }
  return collator.compare(String(aValue ?? ''), String(bValue ?? ''));
}

export function DataTable<T extends object>({
  columns,
  rows,
  getRowId,
  onRowClick,
  quickFilter,
  selection,
  emptyLabel,
  searchPlaceholder,
  defaultSortKey,
  defaultSortDirection = 'asc',
}: DataTableProps<T>) {
  const initialSortKey =
    defaultSortKey !== undefined ? defaultSortKey : columns.find((column) => column.sortable !== false)?.key ?? null;
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(initialSortKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>(initialSortKey ? defaultSortDirection : null);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (quickFilter && quickFilter.value && String(row[quickFilter.key] ?? '') !== quickFilter.value) {
        return false;
      }
      if (!search) {
        return true;
      }
      const query = search.toLowerCase();
      return columns.some((column) => String(row[column.key] ?? '').toLowerCase().includes(query));
    });
  }, [rows, columns, search, quickFilter]);

  const sortedRows = useMemo(() => {
    if (!sortKey || !sortDirection) {
      return filteredRows;
    }
    const factor = sortDirection === 'asc' ? 1 : -1;
    return [...filteredRows].sort(
      (a, b) => factor * compareValues(a[sortKey as keyof T], b[sortKey as keyof T])
    );
  }, [filteredRows, sortKey, sortDirection]);

  const selectableVisibleIds = useMemo(() => {
    if (!selection) return [];
    return sortedRows.filter((row) => selection.isSelectable(row)).map((row) => getRowId(row));
  }, [sortedRows, selection, getRowId]);

  const allVisibleSelected =
    selectableVisibleIds.length > 0 && selectableVisibleIds.every((id) => selection?.selectedIds.has(id));

  function handleHeaderClick(column: Column<T>) {
    if (column.sortable === false) {
      return;
    }
    // De kolom waarop de tabel standaard staat begint in `defaultSortDirection`
    // -- klikken draait dus vanaf díe richting om, anders zou de eerste klik op
    // een kolom met een aflopende standaard meteen in de reset-tak vallen en
    // niets doen.
    const startDirection = column.key === initialSortKey ? defaultSortDirection : 'asc';
    if (sortKey !== column.key) {
      setSortKey(column.key);
      setSortDirection(startDirection);
    } else if (sortDirection === startDirection) {
      setSortDirection(startDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Derde klik: terug naar de standaardsortering van deze tabel.
      setSortKey(initialSortKey);
      setSortDirection(initialSortKey ? defaultSortDirection : null);
    }
  }

  return (
    <div data-testid="data-table">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={searchPlaceholder}
          data-testid="data-table-search"
          className="w-full max-w-xs rounded-sm bg-black/40 px-3 py-2 text-xs text-white placeholder:text-white/40"
        />
        {quickFilter && (
          <div className="flex items-center gap-4 text-xs">
            {quickFilter.options.map((option) => (
              <button
                key={option.testId}
                type="button"
                onClick={() => quickFilter.onChange(option.value)}
                data-testid={`data-table-quick-${option.testId}`}
                className={
                  quickFilter.value === option.value
                    ? 'text-white underline underline-offset-4'
                    : 'text-white/50 hover:text-white'
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-white/80">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-white/60">
              {selection && (
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    data-testid="data-table-select-all"
                    checked={allVisibleSelected}
                    onChange={() => selection.onToggleAll(selectableVisibleIds)}
                    className="h-3.5 w-3.5"
                  />
                </th>
              )}
              {columns.map((column) => (
                <th key={column.key} className="px-3 py-2">
                  <button
                    type="button"
                    data-testid={`data-table-sort-${column.key}`}
                    onClick={() => handleHeaderClick(column)}
                    className="flex items-center gap-1 hover:text-white"
                  >
                    {column.label}
                    {sortKey === column.key && (sortDirection === 'asc' ? ' ▲' : sortDirection === 'desc' ? ' ▼' : '')}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr
                key={getRowId(row)}
                data-testid={`data-table-row-${getRowId(row)}`}
                onClick={() => onRowClick(row)}
                className="cursor-pointer border-b border-white/5 hover:bg-white/5"
              >
                {selection && (
                  <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                    {selection.isSelectable(row) && (
                      <input
                        type="checkbox"
                        data-testid={`data-table-row-select-${getRowId(row)}`}
                        checked={selection.selectedIds.has(getRowId(row))}
                        onChange={() => selection.onToggle(getRowId(row))}
                        className="h-3.5 w-3.5"
                      />
                    )}
                  </td>
                )}
                {columns.map((column) => (
                  <td key={column.key} className="px-3 py-2">
                    {column.render ? column.render(row) : String(row[column.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {sortedRows.length === 0 && (
          <p data-testid="data-table-empty" className="px-3 py-4 text-xs text-white/60">
            {emptyLabel}
          </p>
        )}
      </div>
    </div>
  );
}
