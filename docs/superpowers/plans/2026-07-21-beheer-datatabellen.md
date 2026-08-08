# Beheer Datatabellen Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 21-07-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat `/beheer` klantaanvragen-cards with a left-nav (menu + tellers) framework backed by a generic, reusable sortable/filterable `DataTable` and a generic `Modal`, covering two working sections — Klanten (real Firestore data) and Facturen (mockup data) — plus 7 disabled placeholder menu items for future sub-projects.

**Architecture:** Two new generic, reusable UI primitives (`DataTable`, `Modal`) live outside `beheer/` so they can be reused on the customer account page later without redesign. `BeheerShell` (new) owns the active-section state and fetches the klanten list once, sharing it between the nav counter and the Klanten table — mirroring the existing `AccountNav`/`AccountDashboard` pattern. `AdminDashboard` keeps its existing auth-gate role and renders `BeheerShell` once authorized.

**Tech Stack:** Next.js 14 (App Router, static export), React 18, next-intl, Tailwind CSS, `firebase` (Firestore, already installed), Vitest + Testing Library.

## Global Constraints

- Site stays a fully static export (`output: 'export'`) on GitHub Pages.
- `/beheer` and the `beheer` translation namespace are Dutch-only — every new translation key in this plan goes in `messages/nl.json` only, never en/de/fr.
- `DataTable` and `Modal` must not import anything Beheer-specific (no Firestore, no `beheer` translation namespace) — they take everything through props, so they're genuinely reusable later.
- Per-column filtering is the only "show more/less" mechanism — no separate "show all" toggle. Sorting cycles unsorted → ascending → descending → unsorted.
- `KlantAanvragenSection.tsx` and its test are deleted — fully replaced by `KlantenSection.tsx` + `KlantModal.tsx`.
- Spec: `docs/superpowers/specs/2026-07-21-beheer-datatabellen-design.md`.

---

## Task 1: Generic `DataTable` component

**Files:**
- Create: `src/components/DataTable.tsx`
- Test: `tests/components/DataTable.test.tsx`

**Interfaces:**
- Produces: `Column<T>` type (`{ key: keyof T & string; label: string; filterType: 'text' | 'select'; filterOptions?: string[]; sortable?: boolean; render?: (row: T) => React.ReactNode }`) and `DataTable<T>` component with props `{ columns: Column<T>[]; rows: T[]; getRowId: (row: T) => string; onRowClick: (row: T) => void; defaultFilters?: Record<string, string>; emptyLabel: string }`. Consumed by Task 5 (`KlantenSection`) and Task 6 (`FacturenSection`).

- [ ] **Step 1: Write the failing tests**

Create `tests/components/DataTable.test.tsx`:

```tsx
import { describe, expect, it, fireEvent, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataTable, type Column } from '@/components/DataTable';

interface Row {
  id: string;
  name: string;
  amount: number;
  status: string;
}

const ROWS: Row[] = [
  { id: 'a', name: 'Bravo', amount: 20, status: 'Open' },
  { id: 'b', name: 'Alpha', amount: 5, status: 'Gesloten' },
  { id: 'c', name: 'Charlie', amount: 10, status: 'Open' },
];

const COLUMNS: Column<Row>[] = [
  { key: 'name', label: 'Naam', filterType: 'text' },
  { key: 'amount', label: 'Bedrag', filterType: 'text' },
  { key: 'status', label: 'Status', filterType: 'select', filterOptions: ['Open', 'Gesloten'] },
];

function renderTable(overrides: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) {
  const onRowClick = vi.fn();
  render(
    <DataTable
      columns={COLUMNS}
      rows={ROWS}
      getRowId={(row) => row.id}
      onRowClick={onRowClick}
      emptyLabel="Geen rijen gevonden."
      {...overrides}
    />
  );
  return { onRowClick };
}

describe('DataTable', () => {
  it('renders every row and every column header', () => {
    renderTable();
    expect(screen.getByTestId('data-table-row-a')).toHaveTextContent('Bravo');
    expect(screen.getByTestId('data-table-row-b')).toHaveTextContent('Alpha');
    expect(screen.getByTestId('data-table-row-c')).toHaveTextContent('Charlie');
    expect(screen.getByTestId('data-table-sort-name')).toHaveTextContent('Naam');
  });

  it('calls onRowClick with the full row when a row is clicked', () => {
    const { onRowClick } = renderTable();
    fireEvent.click(screen.getByTestId('data-table-row-b'));
    expect(onRowClick).toHaveBeenCalledWith(ROWS[1]);
  });

  it('sorts a column ascending, then descending, then back to unsorted on repeated header clicks', () => {
    renderTable();
    const header = screen.getByTestId('data-table-sort-name');
    const rowOrder = () => screen.getAllByTestId(/^data-table-row-/).map((row) => row.textContent);

    fireEvent.click(header);
    expect(rowOrder()[0]).toContain('Alpha');

    fireEvent.click(header);
    expect(rowOrder()[0]).toContain('Charlie');

    fireEvent.click(header);
    expect(rowOrder()[0]).toContain('Bravo');
  });

  it('sorts a numeric column numerically, not lexicographically', () => {
    renderTable();
    fireEvent.click(screen.getByTestId('data-table-sort-amount'));
    const rowOrder = () => screen.getAllByTestId(/^data-table-row-/).map((row) => row.getAttribute('data-testid'));
    expect(rowOrder()).toEqual(['data-table-row-b', 'data-table-row-c', 'data-table-row-a']);
  });

  it('filters rows via a text filter (case-insensitive substring match)', () => {
    renderTable();
    fireEvent.change(screen.getByTestId('data-table-filter-name'), { target: { value: 'lph' } });
    expect(screen.getByTestId('data-table-row-b')).toBeInTheDocument();
    expect(screen.queryByTestId('data-table-row-a')).not.toBeInTheDocument();
    expect(screen.queryByTestId('data-table-row-c')).not.toBeInTheDocument();
  });

  it('filters rows via a select filter (exact match)', () => {
    renderTable();
    fireEvent.change(screen.getByTestId('data-table-filter-status'), { target: { value: 'Gesloten' } });
    expect(screen.getByTestId('data-table-row-b')).toBeInTheDocument();
    expect(screen.queryByTestId('data-table-row-a')).not.toBeInTheDocument();
    expect(screen.queryByTestId('data-table-row-c')).not.toBeInTheDocument();
  });

  it('applies defaultFilters on first render', () => {
    renderTable({ defaultFilters: { status: 'Open' } });
    expect(screen.getByTestId('data-table-row-a')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-c')).toBeInTheDocument();
    expect(screen.queryByTestId('data-table-row-b')).not.toBeInTheDocument();
  });

  it('shows the emptyLabel when no rows match the current filters', () => {
    renderTable();
    fireEvent.change(screen.getByTestId('data-table-filter-name'), { target: { value: 'zzz' } });
    expect(screen.getByTestId('data-table-empty')).toHaveTextContent('Geen rijen gevonden.');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/DataTable.test.tsx`
Expected: FAIL — `Cannot find module '@/components/DataTable'`.

- [ ] **Step 3: Implement `src/components/DataTable.tsx`**

```tsx
'use client';

import { useMemo, useState, type ReactNode } from 'react';

export interface Column<T> {
  key: keyof T & string;
  label: string;
  filterType: 'text' | 'select';
  filterOptions?: string[];
  sortable?: boolean;
  render?: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  onRowClick: (row: T) => void;
  defaultFilters?: Record<string, string>;
  emptyLabel: string;
}

type SortDirection = 'asc' | 'desc' | null;

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  getRowId,
  onRowClick,
  defaultFilters,
  emptyLabel,
}: DataTableProps<T>) {
  const [filters, setFilters] = useState<Record<string, string>>(defaultFilters ?? {});
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const filteredRows = useMemo(() => {
    return rows.filter((row) =>
      columns.every((column) => {
        const filterValue = filters[column.key];
        if (!filterValue) {
          return true;
        }
        const cellValue = String(row[column.key] ?? '');
        if (column.filterType === 'select') {
          return cellValue === filterValue;
        }
        return cellValue.toLowerCase().includes(filterValue.toLowerCase());
      })
    );
  }, [rows, columns, filters]);

  const sortedRows = useMemo(() => {
    if (!sortKey || !sortDirection) {
      return filteredRows;
    }
    const sorted = [...filteredRows].sort((a, b) => {
      const aValue = a[sortKey as keyof T];
      const bValue = b[sortKey as keyof T];
      if (aValue === bValue) return 0;
      return (aValue as never) > (bValue as never) ? 1 : -1;
    });
    return sortDirection === 'asc' ? sorted : sorted.reverse();
  }, [filteredRows, sortKey, sortDirection]);

  function handleHeaderClick(column: Column<T>) {
    if (column.sortable === false) {
      return;
    }
    if (sortKey !== column.key) {
      setSortKey(column.key);
      setSortDirection('asc');
    } else if (sortDirection === 'asc') {
      setSortDirection('desc');
    } else if (sortDirection === 'desc') {
      setSortKey(null);
      setSortDirection(null);
    } else {
      setSortDirection('asc');
    }
  }

  return (
    <div data-testid="data-table" className="overflow-x-auto">
      <table className="w-full text-left text-sm text-white/80">
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-white/60">
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
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="px-3 py-2">
                {column.filterType === 'select' ? (
                  <select
                    value={filters[column.key] ?? ''}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, [column.key]: event.target.value }))
                    }
                    data-testid={`data-table-filter-${column.key}`}
                    className="w-full rounded-sm bg-black/40 px-2 py-1 text-xs text-white"
                  >
                    <option value="">—</option>
                    {(column.filterOptions ?? []).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={filters[column.key] ?? ''}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, [column.key]: event.target.value }))
                    }
                    data-testid={`data-table-filter-${column.key}`}
                    className="w-full rounded-sm bg-black/40 px-2 py-1 text-xs text-white"
                  />
                )}
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
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/DataTable.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/DataTable.tsx tests/components/DataTable.test.tsx
git commit -m "feat: add generic DataTable component (sort, filter, row click)"
```

---

## Task 2: Generic `Modal` component

**Files:**
- Create: `src/components/Modal.tsx`
- Test: `tests/components/Modal.test.tsx`

**Interfaces:**
- Consumes: `useOverlayDismiss` from `src/lib/useOverlayDismiss.ts` (existing).
- Produces: `Modal` component with props `{ isOpen: boolean; onClose: () => void; closeLabel: string; children: React.ReactNode }`. Consumed by Task 5 (`KlantModal`) and Task 6 (`FactuurModal`).

- [ ] **Step 1: Write the failing tests**

Create `tests/components/Modal.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '@/components/Modal';

describe('Modal', () => {
  it('renders nothing when isOpen is false', () => {
    render(
      <Modal isOpen={false} onClose={vi.fn()} closeLabel="Sluiten">
        <p>Inhoud</p>
      </Modal>
    );
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('renders its children when isOpen is true', () => {
    render(
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten">
        <p data-testid="modal-content">Inhoud</p>
      </Modal>
    );
    expect(screen.getByTestId('modal')).toBeInTheDocument();
    expect(screen.getByTestId('modal-content')).toHaveTextContent('Inhoud');
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} closeLabel="Sluiten">
        <p>Inhoud</p>
      </Modal>
    );
    fireEvent.click(screen.getByTestId('modal-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} closeLabel="Sluiten">
        <p>Inhoud</p>
      </Modal>
    );
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} closeLabel="Sluiten">
        <p>Inhoud</p>
      </Modal>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('uses closeLabel as the close button\'s aria-label', () => {
    render(
      <Modal isOpen onClose={vi.fn()} closeLabel="Close it">
        <p>Inhoud</p>
      </Modal>
    );
    expect(screen.getByTestId('modal-close')).toHaveAttribute('aria-label', 'Close it');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/Modal.test.tsx`
Expected: FAIL — `Cannot find module '@/components/Modal'`.

- [ ] **Step 3: Implement `src/components/Modal.tsx`**

```tsx
'use client';

import { useRef, type ReactNode } from 'react';
import { useOverlayDismiss } from '@/lib/useOverlayDismiss';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
}

export function Modal({ isOpen, onClose, closeLabel, children }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useOverlayDismiss({
    isOpen,
    onClose,
    containerRef: modalRef,
    initialFocusRef: closeButtonRef,
  });

  if (!isOpen) {
    return null;
  }

  return (
    <div
      ref={modalRef}
      data-testid="modal"
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        data-testid="modal-backdrop"
        onClick={onClose}
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
      />
      <div className="relative z-10 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-white/10 bg-charcoal p-6">
        <button
          ref={closeButtonRef}
          type="button"
          data-testid="modal-close"
          aria-label={closeLabel}
          onClick={onClose}
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white/80 hover:text-white"
        >
          ×
        </button>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/Modal.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/Modal.tsx tests/components/Modal.test.tsx
git commit -m "feat: add generic Modal component"
```

---

## Task 3: Mockup Facturen data

**Files:**
- Create: `src/data/mockAdminInvoices.ts`
- Test: `tests/data/mockAdminInvoices.test.ts`

**Interfaces:**
- Produces: `AdminInvoice` interface (`{ invoiceNumber: string; date: string; companyName: string; amount: number; status: 'Te betalen' | 'Betaald' }`), `MOCK_ADMIN_INVOICES: AdminInvoice[]`, and `formatCurrency(amount: number): string`. Consumed by Task 6 (`FacturenSection`, `FactuurModal`).

- [ ] **Step 1: Write the failing test**

Create `tests/data/mockAdminInvoices.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MOCK_ADMIN_INVOICES, formatCurrency } from '@/data/mockAdminInvoices';

describe('MOCK_ADMIN_INVOICES', () => {
  it('contains at least one "Te betalen" and one "Betaald" invoice', () => {
    expect(MOCK_ADMIN_INVOICES.filter((invoice) => invoice.status === 'Te betalen').length).toBeGreaterThan(0);
    expect(MOCK_ADMIN_INVOICES.filter((invoice) => invoice.status === 'Betaald').length).toBeGreaterThan(0);
  });

  it('has a unique invoiceNumber for every invoice', () => {
    expect(new Set(MOCK_ADMIN_INVOICES.map((invoice) => invoice.invoiceNumber)).size).toBe(
      MOCK_ADMIN_INVOICES.length
    );
  });

  it('stores amount as a number, not a formatted string', () => {
    MOCK_ADMIN_INVOICES.forEach((invoice) => {
      expect(typeof invoice.amount).toBe('number');
    });
  });
});

describe('formatCurrency', () => {
  it('formats a number as Dutch euro currency', () => {
    expect(formatCurrency(645)).toBe('€ 645,00');
    expect(formatCurrency(1240.5)).toBe('€ 1.240,50');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/data/mockAdminInvoices.test.ts`
Expected: FAIL — `Cannot find module '@/data/mockAdminInvoices'`.

- [ ] **Step 3: Implement `src/data/mockAdminInvoices.ts`**

```ts
export interface AdminInvoice {
  invoiceNumber: string;
  date: string;
  companyName: string;
  amount: number;
  status: 'Te betalen' | 'Betaald';
}

export const MOCK_ADMIN_INVOICES: AdminInvoice[] = [
  { invoiceNumber: 'INV-3051', date: '2026-06-20', companyName: 'Hotel De Zilveren Zwaan', amount: 645, status: 'Te betalen' },
  { invoiceNumber: 'INV-3038', date: '2026-06-05', companyName: 'Restaurant De Gouden Lepel', amount: 289, status: 'Te betalen' },
  { invoiceNumber: 'INV-3021', date: '2026-05-22', companyName: 'Wellness Oase', amount: 1240.5, status: 'Te betalen' },
  { invoiceNumber: 'INV-2987', date: '2026-04-30', companyName: 'Kantoor Van Dijk & Partners', amount: 410, status: 'Betaald' },
  { invoiceNumber: 'INV-2965', date: '2026-04-14', companyName: 'Hotel De Zilveren Zwaan', amount: 875, status: 'Betaald' },
  { invoiceNumber: 'INV-2942', date: '2026-03-28', companyName: 'Restaurant De Gouden Lepel', amount: 320, status: 'Betaald' },
];

export function formatCurrency(amount: number): string {
  return amount.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/data/mockAdminInvoices.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/mockAdminInvoices.ts tests/data/mockAdminInvoices.test.ts
git commit -m "feat: add mockup Facturen data for the Beheer Facturen section"
```

---

## Task 4: `BeheerNav` component

**Files:**
- Create: `src/components/beheer/BeheerNav.tsx`
- Test: `tests/components/beheer/BeheerNav.test.tsx`
- Modify: `messages/nl.json`

**Interfaces:**
- Produces: `BeheerSection` type (`'klanten' | 'facturen'`) and `BeheerNav` component with props `{ activeSection: BeheerSection; onSelect: (section: BeheerSection) => void; onLogout: () => void; klantenCount: number; facturenCount: number }`. Consumed by Task 7 (`BeheerShell`).

- [ ] **Step 1: Add the new translation keys**

In `messages/nl.json`, inside the `"beheer"` object, add after `"logout": "Uitloggen"` (remember the trailing comma):

```json
    "navKlanten": "Klanten",
    "navFacturen": "Facturen",
    "navBestellingen": "Bestellingen",
    "navRetouren": "Retouren",
    "navPrijsgroepen": "Prijsgroepen",
    "navMaten": "Maten",
    "navMaterialen": "Materialen",
    "navKunstwerken": "Kunstwerken",
    "navGlassartDesign": "Glassart and Design"
```

- [ ] **Step 2: Write the failing tests**

Create `tests/components/beheer/BeheerNav.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BeheerNav } from '@/components/beheer/BeheerNav';
import messages from '../../../messages/nl.json';

function renderNav(activeSection: 'klanten' | 'facturen' = 'klanten') {
  const onSelect = vi.fn();
  const onLogout = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <BeheerNav
        activeSection={activeSection}
        onSelect={onSelect}
        onLogout={onLogout}
        klantenCount={3}
        facturenCount={7}
      />
    </NextIntlClientProvider>
  );
  return { onSelect, onLogout };
}

describe('BeheerNav', () => {
  it('renders the 2 active items with their counters, and the 7 disabled placeholder items', () => {
    renderNav();
    expect(screen.getByTestId('beheer-nav-klanten')).toHaveTextContent('Klanten');
    expect(screen.getByTestId('beheer-nav-klanten')).toHaveTextContent('3');
    expect(screen.getByTestId('beheer-nav-facturen')).toHaveTextContent('Facturen');
    expect(screen.getByTestId('beheer-nav-facturen')).toHaveTextContent('7');

    ['bestellingen', 'retouren', 'prijsgroepen', 'maten', 'materialen', 'kunstwerken', 'glassartDesign'].forEach(
      (id) => {
        expect(screen.getByTestId(`beheer-nav-${id}`)).toBeDisabled();
      }
    );
  });

  it('marks the active section with aria-current', () => {
    renderNav('facturen');
    expect(screen.getByTestId('beheer-nav-facturen')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('beheer-nav-klanten')).not.toHaveAttribute('aria-current');
  });

  it('calls onSelect with the clicked section id', () => {
    const { onSelect } = renderNav();
    fireEvent.click(screen.getByTestId('beheer-nav-facturen'));
    expect(onSelect).toHaveBeenCalledWith('facturen');
  });

  it('calls onLogout when the logout button is clicked', () => {
    const { onLogout } = renderNav();
    fireEvent.click(screen.getByTestId('beheer-nav-logout'));
    expect(onLogout).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/BeheerNav.test.tsx`
Expected: FAIL — `Cannot find module '@/components/beheer/BeheerNav'`.

- [ ] **Step 4: Implement `src/components/beheer/BeheerNav.tsx`**

```tsx
'use client';

import { useTranslations } from 'next-intl';

export type BeheerSection = 'klanten' | 'facturen';

interface BeheerNavProps {
  activeSection: BeheerSection;
  onSelect: (section: BeheerSection) => void;
  onLogout: () => void;
  klantenCount: number;
  facturenCount: number;
}

const ACTIVE_ITEMS: { id: BeheerSection; labelKey: string }[] = [
  { id: 'klanten', labelKey: 'navKlanten' },
  { id: 'facturen', labelKey: 'navFacturen' },
];

const DISABLED_ITEMS: { id: string; labelKey: string }[] = [
  { id: 'bestellingen', labelKey: 'navBestellingen' },
  { id: 'retouren', labelKey: 'navRetouren' },
  { id: 'prijsgroepen', labelKey: 'navPrijsgroepen' },
  { id: 'maten', labelKey: 'navMaten' },
  { id: 'materialen', labelKey: 'navMaterialen' },
  { id: 'kunstwerken', labelKey: 'navKunstwerken' },
  { id: 'glassartDesign', labelKey: 'navGlassartDesign' },
];

export function BeheerNav({
  activeSection,
  onSelect,
  onLogout,
  klantenCount,
  facturenCount,
}: BeheerNavProps) {
  const t = useTranslations('beheer');
  const counts: Record<BeheerSection, number> = { klanten: klantenCount, facturen: facturenCount };

  return (
    <nav data-testid="beheer-nav" className="flex flex-col gap-1 text-xs tracking-wide">
      {ACTIVE_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          data-testid={`beheer-nav-${item.id}`}
          aria-current={activeSection === item.id ? 'true' : undefined}
          onClick={() => onSelect(item.id)}
          className={`flex items-center justify-between rounded-sm px-3 py-2 text-left ${
            activeSection === item.id
              ? 'bg-white/15 text-white'
              : 'text-white/60 hover:bg-white/10 hover:text-white'
          }`}
        >
          <span>{t(item.labelKey)}</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.65rem]">{counts[item.id]}</span>
        </button>
      ))}
      {DISABLED_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          disabled
          data-testid={`beheer-nav-${item.id}`}
          className="cursor-not-allowed rounded-sm px-3 py-2 text-left text-white/30"
        >
          {t(item.labelKey)}
        </button>
      ))}
      <button
        type="button"
        data-testid="beheer-nav-logout"
        onClick={onLogout}
        className="mt-4 rounded-sm border border-white/20 px-3 py-2 text-left text-white/60 hover:bg-white/10 hover:text-white"
      >
        {t('logout')}
      </button>
    </nav>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/BeheerNav.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Validate the JSON and run the full test suite**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/nl.json','utf8'))" && npm test`
Expected: no JSON errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/beheer/BeheerNav.tsx tests/components/beheer/BeheerNav.test.tsx messages/nl.json
git commit -m "feat: add BeheerNav (menu, counters, disabled placeholder items)"
```

---

## Task 5: `KlantenSection` + `KlantModal`

**Files:**
- Create: `src/components/beheer/KlantenSection.tsx`
- Test: `tests/components/beheer/KlantenSection.test.tsx`
- Create: `src/components/beheer/KlantModal.tsx`
- Test: `tests/components/beheer/KlantModal.test.tsx`
- Modify: `messages/nl.json`

**Interfaces:**
- Consumes: `DataTable`/`Column` (Task 1), `Modal` (Task 2).
- Produces: `Klant` interface (`{ id: string; companyName: string; kvk: string; contactPerson: string; email: string; phone: string; contactPreference: string; address: string; postcode: string; city: string; status: 'Beoordelen' | 'Goedgekeurd' | 'Afgewezen'; prijsgroep: string }`), `KlantenSection` component with props `{ klanten: Klant[] | null; loadError: string | null; onKlantUpdated: (klant: Klant) => void }`. Consumed by Task 7 (`BeheerShell`).

Note: `src/components/beheer/KlantAanvragenSection.tsx` and its test are NOT deleted in this task — `AdminDashboard.tsx` still imports and uses it until Task 7 swaps it for `BeheerShell`. Deleting it now would break the build for the duration of Tasks 5 and 6. This task only *adds* the new, parallel files; Task 7 removes the old one in the same step that stops referencing it.

Note: this task only *adds* new translation keys — it does not remove the old `klantaanvragen*` keys, because `KlantAanvragenSection.tsx` (still wired into `AdminDashboard.tsx` until Task 7) still uses them, including in exact-text test assertions. Removing them now would silently break `KlantAanvragenSection.test.tsx`'s error-message assertions (next-intl falls back to rendering the raw key name for a missing key, not a build error). Task 7 removes both the old keys and the file that uses them, together.

- [ ] **Step 1: Add the new translation keys**

In `messages/nl.json`, inside the `"beheer"` object, add after the `navGlassartDesign` key added in Task 4 (remember the trailing comma):

```json
    "modalClose": "Sluiten",
    "klantenLoadError": "Kon de klanten niet laden. Probeer de pagina te verversen.",
    "klantenActionError": "Er is iets misgegaan. Probeer het opnieuw.",
    "klantenEmpty": "Geen klanten gevonden.",
    "klantenColCompanyName": "Bedrijfsnaam",
    "klantenColKvk": "KvK-nummer",
    "klantenColContactPerson": "Contactpersoon",
    "klantenColEmail": "E-mailadres",
    "klantenColPhone": "Telefoonnummer",
    "klantenColStatus": "Status",
    "klantenContactPreference": "Contactvoorkeur",
    "klantenLabelPrijsgroep": "Prijsgroep",
    "klantenGoedkeuren": "Goedkeuren",
    "klantenAfwijzen": "Afwijzen"
```

- [ ] **Step 2: Write the failing tests for `KlantModal`**

Create `tests/components/beheer/KlantModal.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { KlantModal } from '@/components/beheer/KlantModal';
import type { Klant } from '@/components/beheer/KlantenSection';
import messages from '../../../messages/nl.json';

const updateDocMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
}));

const KLANT: Klant = {
  id: 'uid-1',
  companyName: 'Testbedrijf BV',
  kvk: '12345678',
  contactPerson: 'Jan Jansen',
  email: 'jan@example.com',
  phone: '0612345678',
  contactPreference: 'email',
  address: 'Teststraat 1',
  postcode: '1234 AB',
  city: 'Teststad',
  status: 'Beoordelen',
  prijsgroep: '',
};

function renderModal(klant: Klant | null) {
  const onClose = vi.fn();
  const onUpdated = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <KlantModal klant={klant} onClose={onClose} onUpdated={onUpdated} />
    </NextIntlClientProvider>
  );
  return { onClose, onUpdated };
}

beforeEach(() => {
  updateDocMock.mockReset();
});

describe('KlantModal', () => {
  it('renders nothing when klant is null', () => {
    renderModal(null);
    expect(screen.queryByTestId('klant-modal')).not.toBeInTheDocument();
  });

  it('shows the klant details and pre-fills the prijsgroep field', () => {
    renderModal({ ...KLANT, prijsgroep: 'Standaard' });
    expect(screen.getByTestId('klant-modal')).toHaveTextContent('Testbedrijf BV');
    expect(screen.getByTestId('klant-modal')).toHaveTextContent('12345678');
    expect(screen.getByTestId('klant-modal-prijsgroep')).toHaveValue('Standaard');
  });

  it('disables Goedkeuren until a prijsgroep is filled in', () => {
    renderModal(KLANT);
    expect(screen.getByTestId('klant-modal-goedkeuren')).toBeDisabled();
    fireEvent.change(screen.getByTestId('klant-modal-prijsgroep'), { target: { value: 'Standaard' } });
    expect(screen.getByTestId('klant-modal-goedkeuren')).not.toBeDisabled();
  });

  it('approves the klant and calls onUpdated with the updated klant', async () => {
    updateDocMock.mockResolvedValue(undefined);
    const { onUpdated } = renderModal(KLANT);
    fireEvent.change(screen.getByTestId('klant-modal-prijsgroep'), { target: { value: 'Premium' } });
    fireEvent.click(screen.getByTestId('klant-modal-goedkeuren'));

    await waitFor(() =>
      expect(updateDocMock).toHaveBeenCalledWith(
        { collectionName: 'klanten', id: 'uid-1' },
        { status: 'Goedgekeurd', prijsgroep: 'Premium' }
      )
    );
    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith({ ...KLANT, status: 'Goedgekeurd', prijsgroep: 'Premium' })
    );
  });

  it('rejects the klant and calls onUpdated with the updated klant', async () => {
    updateDocMock.mockResolvedValue(undefined);
    const { onUpdated } = renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen'));

    await waitFor(() =>
      expect(updateDocMock).toHaveBeenCalledWith(
        { collectionName: 'klanten', id: 'uid-1' },
        { status: 'Afgewezen' }
      )
    );
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ ...KLANT, status: 'Afgewezen' }));
  });

  it('shows an error and does not call onUpdated when updateDoc fails', async () => {
    updateDocMock.mockRejectedValue(new Error('offline'));
    const { onUpdated } = renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen'));

    expect(await screen.findByTestId('klant-modal-error')).toBeInTheDocument();
    expect(onUpdated).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/KlantModal.test.tsx`
Expected: FAIL — `Cannot find module '@/components/beheer/KlantModal'` (and `@/components/beheer/KlantenSection` for the `Klant` type import).

- [ ] **Step 4: Implement `src/components/beheer/KlantenSection.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { KlantModal } from './KlantModal';

export interface Klant {
  id: string;
  companyName: string;
  kvk: string;
  contactPerson: string;
  email: string;
  phone: string;
  contactPreference: string;
  address: string;
  postcode: string;
  city: string;
  status: 'Beoordelen' | 'Goedgekeurd' | 'Afgewezen';
  prijsgroep: string;
}

interface KlantenSectionProps {
  klanten: Klant[] | null;
  loadError: string | null;
  onKlantUpdated: (klant: Klant) => void;
}

export function KlantenSection({ klanten, loadError, onKlantUpdated }: KlantenSectionProps) {
  const t = useTranslations('beheer');
  const [selectedKlant, setSelectedKlant] = useState<Klant | null>(null);

  if (loadError) {
    return (
      <p data-testid="klanten-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (klanten === null) {
    return null;
  }

  const columns: Column<Klant>[] = [
    { key: 'companyName', label: t('klantenColCompanyName'), filterType: 'text' },
    { key: 'kvk', label: t('klantenColKvk'), filterType: 'text' },
    { key: 'contactPerson', label: t('klantenColContactPerson'), filterType: 'text' },
    { key: 'email', label: t('klantenColEmail'), filterType: 'text' },
    { key: 'phone', label: t('klantenColPhone'), filterType: 'text' },
    {
      key: 'status',
      label: t('klantenColStatus'),
      filterType: 'select',
      filterOptions: ['Beoordelen', 'Goedgekeurd', 'Afgewezen'],
    },
  ];

  return (
    <div data-testid="klanten-section">
      <DataTable
        columns={columns}
        rows={klanten}
        getRowId={(row) => row.id}
        onRowClick={setSelectedKlant}
        defaultFilters={{ status: 'Beoordelen' }}
        emptyLabel={t('klantenEmpty')}
      />
      <KlantModal
        klant={selectedKlant}
        onClose={() => setSelectedKlant(null)}
        onUpdated={(updated) => {
          onKlantUpdated(updated);
          setSelectedKlant(null);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Implement `src/components/beheer/KlantModal.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Modal } from '@/components/Modal';
import type { Klant } from './KlantenSection';

interface KlantModalProps {
  klant: Klant | null;
  onClose: () => void;
  onUpdated: (klant: Klant) => void;
}

export function KlantModal({ klant, onClose, onUpdated }: KlantModalProps) {
  const t = useTranslations('beheer');
  const [prijsgroep, setPrijsgroep] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (klant) {
      setPrijsgroep(klant.prijsgroep);
      setError(null);
    }
  }, [klant]);

  async function handleGoedkeuren() {
    if (!klant) return;
    try {
      await updateDoc(doc(db, 'klanten', klant.id), { status: 'Goedgekeurd', prijsgroep });
      onUpdated({ ...klant, status: 'Goedgekeurd', prijsgroep });
    } catch {
      setError(t('klantenActionError'));
    }
  }

  async function handleAfwijzen() {
    if (!klant) return;
    try {
      await updateDoc(doc(db, 'klanten', klant.id), { status: 'Afgewezen' });
      onUpdated({ ...klant, status: 'Afgewezen' });
    } catch {
      setError(t('klantenActionError'));
    }
  }

  return (
    <Modal isOpen={klant !== null} onClose={onClose} closeLabel={t('modalClose')}>
      {klant && (
        <div data-testid="klant-modal" className="flex flex-col gap-2 text-sm text-white/80">
          <p>
            {klant.companyName} — {klant.kvk}
          </p>
          <p>{klant.contactPerson}</p>
          <p>
            {klant.email} — {klant.phone}
          </p>
          <p>
            {klant.address}, {klant.postcode} {klant.city}
          </p>
          <p>
            {t('klantenContactPreference')}: {klant.contactPreference}
          </p>

          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('klantenLabelPrijsgroep')}
            <input
              type="text"
              value={prijsgroep}
              onChange={(event) => setPrijsgroep(event.target.value)}
              data-testid="klant-modal-prijsgroep"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>

          {error && (
            <p data-testid="klant-modal-error" className="text-xs text-red-400">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleGoedkeuren}
              disabled={!prijsgroep}
              data-testid="klant-modal-goedkeuren"
              className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('klantenGoedkeuren')}
            </button>
            <button
              type="button"
              onClick={handleAfwijzen}
              data-testid="klant-modal-afwijzen"
              className="rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
            >
              {t('klantenAfwijzen')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 6: Run the `KlantModal` tests to verify they pass**

Run: `npx vitest run tests/components/beheer/KlantModal.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 7: Write the failing tests for `KlantenSection`**

Create `tests/components/beheer/KlantenSection.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { KlantenSection, type Klant } from '@/components/beheer/KlantenSection';
import messages from '../../../messages/nl.json';

const updateDocMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
}));

const KLANTEN: Klant[] = [
  {
    id: 'uid-1',
    companyName: 'Testbedrijf BV',
    kvk: '12345678',
    contactPerson: 'Jan Jansen',
    email: 'jan@example.com',
    phone: '0612345678',
    contactPreference: 'email',
    address: 'Teststraat 1',
    postcode: '1234 AB',
    city: 'Teststad',
    status: 'Beoordelen',
    prijsgroep: '',
  },
  {
    id: 'uid-2',
    companyName: 'Ander Bedrijf',
    kvk: '87654321',
    contactPerson: 'Piet Pietersen',
    email: 'piet@example.com',
    phone: '0698765432',
    contactPreference: 'phone',
    address: 'Anderstraat 2',
    postcode: '4321 BA',
    city: 'Anderstad',
    status: 'Goedgekeurd',
    prijsgroep: 'Standaard',
  },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof KlantenSection>> = {}) {
  const onKlantUpdated = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <KlantenSection klanten={KLANTEN} loadError={null} onKlantUpdated={onKlantUpdated} {...overrides} />
    </NextIntlClientProvider>
  );
  return { onKlantUpdated };
}

beforeEach(() => {
  updateDocMock.mockReset();
});

describe('KlantenSection', () => {
  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('klanten-error')).toHaveTextContent('Kon niet laden.');
    expect(screen.queryByTestId('data-table')).not.toBeInTheDocument();
  });

  it('renders nothing while klanten is null and there is no error', () => {
    renderSection({ klanten: null });
    expect(screen.queryByTestId('klanten-section')).not.toBeInTheDocument();
  });

  it('shows only the "Beoordelen" klant by default (status filter defaults to Beoordelen)', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-uid-1')).toBeInTheDocument();
    expect(screen.queryByTestId('data-table-row-uid-2')).not.toBeInTheDocument();
  });

  it('shows all klanten when the status filter is cleared', () => {
    renderSection();
    fireEvent.change(screen.getByTestId('data-table-filter-status'), { target: { value: '' } });
    expect(screen.getByTestId('data-table-row-uid-1')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-uid-2')).toBeInTheDocument();
  });

  it('opens the KlantModal with the clicked klant\'s data when a row is clicked', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-uid-1'));
    expect(screen.getByTestId('klant-modal')).toHaveTextContent('Testbedrijf BV');
  });

  it('closes the modal and reports the updated klant via onKlantUpdated after approving', async () => {
    updateDocMock.mockResolvedValue(undefined);
    const { onKlantUpdated } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-uid-1'));
    fireEvent.change(screen.getByTestId('klant-modal-prijsgroep'), { target: { value: 'Premium' } });
    fireEvent.click(screen.getByTestId('klant-modal-goedkeuren'));

    await waitFor(() =>
      expect(onKlantUpdated).toHaveBeenCalledWith({ ...KLANTEN[0], status: 'Goedgekeurd', prijsgroep: 'Premium' })
    );
    await waitFor(() => expect(screen.queryByTestId('klant-modal')).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 8: Run the `KlantenSection` tests to verify they pass**

Run: `npx vitest run tests/components/beheer/KlantenSection.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 9: Validate JSON and run the full test suite**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/nl.json','utf8'))" && npm test`
Expected: no JSON errors, all tests pass (the old `KlantAanvragenSection.tsx` and its test are untouched in this task and keep passing; the new `KlantenSection`/`KlantModal` files exist alongside it, unused by anything yet — that's expected and fine).

- [ ] **Step 10: Commit**

```bash
git add src/components/beheer/KlantenSection.tsx tests/components/beheer/KlantenSection.test.tsx src/components/beheer/KlantModal.tsx tests/components/beheer/KlantModal.test.tsx messages/nl.json
git commit -m "feat: add KlantenSection (table) + KlantModal, alongside the still-active KlantAanvragenSection"
```

---

## Task 6: `FacturenSection` + `FactuurModal`

**Files:**
- Create: `src/components/beheer/FacturenSection.tsx`
- Test: `tests/components/beheer/FacturenSection.test.tsx`
- Create: `src/components/beheer/FactuurModal.tsx`
- Test: `tests/components/beheer/FactuurModal.test.tsx`
- Modify: `messages/nl.json`

**Interfaces:**
- Consumes: `DataTable`/`Column` (Task 1), `Modal` (Task 2), `AdminInvoice`/`MOCK_ADMIN_INVOICES`/`formatCurrency` (Task 3).
- Produces: `FacturenSection` component (no props — owns its own `selectedFactuur` state, reads directly from `MOCK_ADMIN_INVOICES`). Consumed by Task 7 (`BeheerShell`).

- [ ] **Step 1: Add the new translation keys**

In `messages/nl.json`, inside the `"beheer"` object, add after the `klantenAfwijzen` key added in Task 5 (remember the trailing comma):

```json
    "facturenColInvoiceNumber": "Factuurnummer",
    "facturenColDate": "Factuurdatum",
    "facturenColCompanyName": "Bedrijfsnaam",
    "facturenColAmount": "Factuurbedrag",
    "facturenColStatus": "Status",
    "facturenEmpty": "Geen facturen gevonden."
```

- [ ] **Step 2: Write the failing tests for `FactuurModal`**

Create `tests/components/beheer/FactuurModal.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { FactuurModal } from '@/components/beheer/FactuurModal';
import type { AdminInvoice } from '@/data/mockAdminInvoices';
import messages from '../../../messages/nl.json';

const FACTUUR: AdminInvoice = {
  invoiceNumber: 'INV-9001',
  date: '2026-07-01',
  companyName: 'Testbedrijf BV',
  amount: 500,
  status: 'Te betalen',
};

function renderModal(factuur: AdminInvoice | null) {
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <FactuurModal factuur={factuur} onClose={onClose} />
    </NextIntlClientProvider>
  );
  return { onClose };
}

describe('FactuurModal', () => {
  it('renders nothing when factuur is null', () => {
    renderModal(null);
    expect(screen.queryByTestId('factuur-modal')).not.toBeInTheDocument();
  });

  it('shows the factuur details, with the amount formatted as currency', () => {
    renderModal(FACTUUR);
    expect(screen.getByTestId('factuur-modal')).toHaveTextContent('INV-9001');
    expect(screen.getByTestId('factuur-modal')).toHaveTextContent('Testbedrijf BV');
    expect(screen.getByTestId('factuur-modal')).toHaveTextContent('€ 500,00');
    expect(screen.getByTestId('factuur-modal')).toHaveTextContent('Te betalen');
  });

  it('has no action buttons (read-only)', () => {
    renderModal(FACTUUR);
    expect(screen.queryByRole('button', { name: /goedkeuren|afwijzen/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/FactuurModal.test.tsx`
Expected: FAIL — `Cannot find module '@/components/beheer/FactuurModal'`.

- [ ] **Step 4: Implement `src/components/beheer/FactuurModal.tsx`**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal';
import { formatCurrency, type AdminInvoice } from '@/data/mockAdminInvoices';

interface FactuurModalProps {
  factuur: AdminInvoice | null;
  onClose: () => void;
}

export function FactuurModal({ factuur, onClose }: FactuurModalProps) {
  const t = useTranslations('beheer');

  return (
    <Modal isOpen={factuur !== null} onClose={onClose} closeLabel={t('modalClose')}>
      {factuur && (
        <div data-testid="factuur-modal" className="flex flex-col gap-2 text-sm text-white/80">
          <p>
            {t('facturenColInvoiceNumber')}: {factuur.invoiceNumber}
          </p>
          <p>
            {t('facturenColDate')}: {factuur.date}
          </p>
          <p>
            {t('facturenColCompanyName')}: {factuur.companyName}
          </p>
          <p>
            {t('facturenColAmount')}: {formatCurrency(factuur.amount)}
          </p>
          <p>
            {t('facturenColStatus')}: {factuur.status}
          </p>
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 5: Run the `FactuurModal` tests to verify they pass**

Run: `npx vitest run tests/components/beheer/FactuurModal.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Write the failing tests for `FacturenSection`**

Create `tests/components/beheer/FacturenSection.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { FacturenSection } from '@/components/beheer/FacturenSection';
import { MOCK_ADMIN_INVOICES } from '@/data/mockAdminInvoices';
import messages from '../../../messages/nl.json';

function renderSection() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <FacturenSection />
    </NextIntlClientProvider>
  );
}

describe('FacturenSection', () => {
  it('shows only "Te betalen" facturen by default', () => {
    renderSection();
    const teBetalenCount = MOCK_ADMIN_INVOICES.filter((invoice) => invoice.status === 'Te betalen').length;
    const betaaldCount = MOCK_ADMIN_INVOICES.filter((invoice) => invoice.status === 'Betaald').length;
    expect(teBetalenCount).toBeGreaterThan(0);
    expect(betaaldCount).toBeGreaterThan(0);

    MOCK_ADMIN_INVOICES.filter((invoice) => invoice.status === 'Te betalen').forEach((invoice) => {
      expect(screen.getByTestId(`data-table-row-${invoice.invoiceNumber}`)).toBeInTheDocument();
    });
    MOCK_ADMIN_INVOICES.filter((invoice) => invoice.status === 'Betaald').forEach((invoice) => {
      expect(screen.queryByTestId(`data-table-row-${invoice.invoiceNumber}`)).not.toBeInTheDocument();
    });
  });

  it('shows all facturen when the status filter is cleared', () => {
    renderSection();
    fireEvent.change(screen.getByTestId('data-table-filter-status'), { target: { value: '' } });
    MOCK_ADMIN_INVOICES.forEach((invoice) => {
      expect(screen.getByTestId(`data-table-row-${invoice.invoiceNumber}`)).toBeInTheDocument();
    });
  });

  it('opens the FactuurModal with the clicked factuur\'s data when a row is clicked', () => {
    renderSection();
    const firstOpen = MOCK_ADMIN_INVOICES.find((invoice) => invoice.status === 'Te betalen')!;
    fireEvent.click(screen.getByTestId(`data-table-row-${firstOpen.invoiceNumber}`));
    expect(screen.getByTestId('factuur-modal')).toHaveTextContent(firstOpen.invoiceNumber);
  });
});
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/FacturenSection.test.tsx`
Expected: FAIL — `Cannot find module '@/components/beheer/FacturenSection'`.

- [ ] **Step 8: Implement `src/components/beheer/FacturenSection.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { MOCK_ADMIN_INVOICES, formatCurrency, type AdminInvoice } from '@/data/mockAdminInvoices';
import { FactuurModal } from './FactuurModal';

export function FacturenSection() {
  const t = useTranslations('beheer');
  const [selectedFactuur, setSelectedFactuur] = useState<AdminInvoice | null>(null);

  const columns: Column<AdminInvoice>[] = [
    { key: 'invoiceNumber', label: t('facturenColInvoiceNumber'), filterType: 'text' },
    { key: 'date', label: t('facturenColDate'), filterType: 'text' },
    { key: 'companyName', label: t('facturenColCompanyName'), filterType: 'text' },
    {
      key: 'amount',
      label: t('facturenColAmount'),
      filterType: 'text',
      render: (row) => formatCurrency(row.amount),
    },
    {
      key: 'status',
      label: t('facturenColStatus'),
      filterType: 'select',
      filterOptions: ['Te betalen', 'Betaald'],
    },
  ];

  return (
    <div data-testid="facturen-section">
      <DataTable
        columns={columns}
        rows={MOCK_ADMIN_INVOICES}
        getRowId={(row) => row.invoiceNumber}
        onRowClick={setSelectedFactuur}
        defaultFilters={{ status: 'Te betalen' }}
        emptyLabel={t('facturenEmpty')}
      />
      <FactuurModal factuur={selectedFactuur} onClose={() => setSelectedFactuur(null)} />
    </div>
  );
}
```

- [ ] **Step 9: Run the `FacturenSection` tests to verify they pass**

Run: `npx vitest run tests/components/beheer/FacturenSection.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 10: Validate JSON and run the full test suite**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/nl.json','utf8'))" && npm test`
Expected: no JSON errors, all tests pass.

- [ ] **Step 11: Commit**

```bash
git add src/components/beheer/FacturenSection.tsx tests/components/beheer/FacturenSection.test.tsx src/components/beheer/FactuurModal.tsx tests/components/beheer/FactuurModal.test.tsx messages/nl.json
git commit -m "feat: add FacturenSection (mockup data) + FactuurModal"
```

---

## Task 7: `BeheerShell` + wire into `AdminDashboard` + page width fix

**Files:**
- Create: `src/components/beheer/BeheerShell.tsx`
- Test: `tests/components/beheer/BeheerShell.test.tsx`
- Modify: `src/components/beheer/AdminDashboard.tsx`
- Modify: `tests/components/beheer/AdminDashboard.test.tsx`
- Modify: `src/app/[locale]/beheer/page.tsx`
- Modify: `messages/nl.json`

**Interfaces:**
- Consumes: `BeheerNav`/`BeheerSection` (Task 4), `KlantenSection`/`Klant` (Task 5), `FacturenSection` (Task 6), `GlassPanel` (existing).
- Produces: `BeheerShell` component with props `{ email: string; onLogout: () => void }`.

No new translation keys are needed to start this task — `BeheerShell` reuses `klantenLoadError` (added in Task 5). The old `klantaanvragen*` keys are removed later in this task, in the same step that deletes the file that uses them (Step 5).

- [ ] **Step 1: Write the failing tests for `BeheerShell`**

Create `tests/components/beheer/BeheerShell.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BeheerShell } from '@/components/beheer/BeheerShell';
import messages from '../../../messages/nl.json';

const getDocsMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ name })),
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  updateDoc: vi.fn(),
}));

function makeSnapshot(docsData: Array<{ id: string; data: Record<string, unknown> }>) {
  return {
    docs: docsData.map(({ id, data }) => ({ id, data: () => data })),
  };
}

const KLANT_DATA = {
  companyName: 'Testbedrijf BV',
  kvk: '12345678',
  contactPerson: 'Jan Jansen',
  email: 'jan@example.com',
  phone: '0612345678',
  contactPreference: 'email',
  address: 'Teststraat 1',
  postcode: '1234 AB',
  city: 'Teststad',
  status: 'Beoordelen',
  prijsgroep: '',
};

function renderShell() {
  const onLogout = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <BeheerShell email="paul@glassartanddesign.com" onLogout={onLogout} />
    </NextIntlClientProvider>
  );
  return { onLogout };
}

beforeEach(() => {
  getDocsMock.mockReset();
});

describe('BeheerShell', () => {
  it('shows the logged-in email and defaults to the Klanten section', async () => {
    getDocsMock.mockResolvedValue(makeSnapshot([{ id: 'uid-1', data: KLANT_DATA }]));
    renderShell();
    expect(screen.getByTestId('beheer-logged-in-as')).toHaveTextContent('paul@glassartanddesign.com');
    expect(await screen.findByTestId('klanten-section')).toBeInTheDocument();
  });

  it('shows the count of "Beoordelen" klanten on the Klanten nav item', async () => {
    getDocsMock.mockResolvedValue(
      makeSnapshot([
        { id: 'uid-1', data: KLANT_DATA },
        { id: 'uid-2', data: { ...KLANT_DATA, status: 'Goedgekeurd' } },
      ])
    );
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-klanten')).toHaveTextContent('1'));
  });

  it('switches to the Facturen section when its nav item is clicked', async () => {
    getDocsMock.mockResolvedValue(makeSnapshot([]));
    renderShell();
    await waitFor(() => expect(getDocsMock).toHaveBeenCalled());
    screen.getByTestId('beheer-nav-facturen').click();
    expect(await screen.findByTestId('facturen-section')).toBeInTheDocument();
    expect(screen.queryByTestId('klanten-section')).not.toBeInTheDocument();
  });

  it('calls onLogout when the nav logout button is clicked', async () => {
    getDocsMock.mockResolvedValue(makeSnapshot([]));
    const { onLogout } = renderShell();
    await waitFor(() => expect(getDocsMock).toHaveBeenCalled());
    screen.getByTestId('beheer-nav-logout').click();
    expect(onLogout).toHaveBeenCalled();
  });

  it('shows a load error on the Klanten section when getDocs fails', async () => {
    getDocsMock.mockRejectedValue(new Error('offline'));
    renderShell();
    expect(await screen.findByTestId('klanten-error')).toHaveTextContent(
      'Kon de klanten niet laden. Probeer de pagina te verversen.'
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/BeheerShell.test.tsx`
Expected: FAIL — `Cannot find module '@/components/beheer/BeheerShell'`.

- [ ] **Step 3: Implement `src/components/beheer/BeheerShell.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { GlassPanel } from '@/components/GlassPanel';
import { BeheerNav, type BeheerSection } from './BeheerNav';
import { KlantenSection, type Klant } from './KlantenSection';
import { FacturenSection } from './FacturenSection';
import { MOCK_ADMIN_INVOICES } from '@/data/mockAdminInvoices';

interface BeheerShellProps {
  email: string;
  onLogout: () => void;
}

export function BeheerShell({ email, onLogout }: BeheerShellProps) {
  const t = useTranslations('beheer');
  const [activeSection, setActiveSection] = useState<BeheerSection>('klanten');
  const [klanten, setKlanten] = useState<Klant[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadKlanten() {
      try {
        const snapshot = await getDocs(collection(db, 'klanten'));
        if (cancelled) return;
        setKlanten(
          snapshot.docs.map((docSnapshot) => {
            const data = docSnapshot.data();
            return {
              id: docSnapshot.id,
              companyName: data.companyName,
              kvk: data.kvk,
              contactPerson: data.contactPerson,
              email: data.email,
              phone: data.phone,
              contactPreference: data.contactPreference,
              address: data.address,
              postcode: data.postcode,
              city: data.city,
              status: data.status,
              prijsgroep: data.prijsgroep,
            } as Klant;
          })
        );
        setLoadError(null);
      } catch {
        if (!cancelled) {
          setLoadError(t('klantenLoadError'));
        }
      }
    }
    loadKlanten();
    return () => {
      cancelled = true;
    };
  }, [t]);

  function handleKlantUpdated(updated: Klant) {
    setKlanten((current) => (current ?? []).map((klant) => (klant.id === updated.id ? updated : klant)));
  }

  const klantenCount = (klanten ?? []).filter((klant) => klant.status === 'Beoordelen').length;
  const facturenCount = MOCK_ADMIN_INVOICES.filter((invoice) => invoice.status === 'Te betalen').length;

  return (
    <div
      data-testid="beheer-dashboard"
      className="mx-auto grid max-w-5xl grid-cols-1 gap-8 lg:grid-cols-[220px_1fr]"
    >
      <GlassPanel className="w-full">
        <p data-testid="beheer-logged-in-as" className="mb-4 text-xs text-white/60">
          {t('loggedInAs', { email })}
        </p>
        <BeheerNav
          activeSection={activeSection}
          onSelect={setActiveSection}
          onLogout={onLogout}
          klantenCount={klantenCount}
          facturenCount={facturenCount}
        />
      </GlassPanel>
      <GlassPanel className="w-full">
        {activeSection === 'klanten' ? (
          <KlantenSection klanten={klanten} loadError={loadError} onKlantUpdated={handleKlantUpdated} />
        ) : (
          <FacturenSection />
        )}
      </GlassPanel>
    </div>
  );
}
```

- [ ] **Step 4: Run the `BeheerShell` tests to verify they pass**

Run: `npx vitest run tests/components/beheer/BeheerShell.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Delete `KlantAanvragenSection`, wire `BeheerShell` into `AdminDashboard.tsx`**

First, remove the now-fully-superseded old section and its dedicated translation keys — this is safe now because this same step also stops `AdminDashboard.tsx` from importing it:

```bash
git rm src/components/beheer/KlantAanvragenSection.tsx tests/components/beheer/KlantAanvragenSection.test.tsx
```

In `messages/nl.json`, inside the `"beheer"` object, remove these 8 keys (no longer referenced by anything once this step is done): `klantaanvragenTitle`, `klantaanvragenEmpty`, `klantaanvragenContactPreference`, `klantaanvragenLabelPrijsgroep`, `klantaanvragenGoedkeuren`, `klantaanvragenAfwijzen`, `klantaanvragenLoadError`, `klantaanvragenActionError`.

Then replace `src/components/beheer/AdminDashboard.tsx` with:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { GlassPanel } from '@/components/GlassPanel';
import { AdminLoginForm } from './AdminLoginForm';
import { BeheerShell } from './BeheerShell';

export function AdminDashboard() {
  const t = useTranslations('beheer');
  const { user, isAdmin, isHydrated, logout } = useAdminAuth();
  const hasSignedOutUnauthorized = useRef(false);

  const isUnauthorized = isHydrated && !!user && !isAdmin;

  useEffect(() => {
    if (isUnauthorized && !hasSignedOutUnauthorized.current) {
      hasSignedOutUnauthorized.current = true;
      logout();
    }
    if (!isUnauthorized) {
      hasSignedOutUnauthorized.current = false;
    }
  }, [isUnauthorized, logout]);

  if (!isHydrated) {
    return null;
  }

  if (isUnauthorized) {
    return (
      <GlassPanel className="mx-auto !max-w-lg">
        <p data-testid="beheer-unauthorized" className="text-sm text-white/80">
          {t('unauthorized')}
        </p>
      </GlassPanel>
    );
  }

  if (!user) {
    return (
      <GlassPanel className="mx-auto !max-w-lg">
        <AdminLoginForm />
      </GlassPanel>
    );
  }

  return <BeheerShell email={user.email ?? ''} onLogout={() => logout()} />;
}
```

- [ ] **Step 6: Update `src/app/[locale]/beheer/page.tsx`**

Replace the width-constrained wrapper (which was sized for the login form only) with an unconstrained container, since `AdminDashboard` now manages its own width per state (narrow for login/unauthorized, wide for the shell) — same pattern as `src/app/[locale]/account/page.tsx`:

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { GlassPanel } from '@/components/GlassPanel';
import { AdminDashboard } from '@/components/beheer/AdminDashboard';

export function generateStaticParams() {
  return [{ locale: 'nl' }];
}

export const dynamicParams = false;

export default async function BeheerPage({
  params,
}: {
  params: { locale: string };
}) {
  const { locale } = params;
  setRequestLocale(locale);
  const t = await getTranslations('beheer');

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-ink via-charcoal to-graphite px-4 pb-16 pt-24 sm:px-8">
      <GlassPanel className="mx-auto mb-10 !max-w-lg text-center">
        <h1 className="text-2xl font-light text-white sm:text-3xl">{t('title')}</h1>
      </GlassPanel>

      <AdminDashboard />
    </main>
  );
}
```

(Only the second `GlassPanel` wrapper around `<AdminDashboard />` is removed — the title panel above it is unchanged.)

- [ ] **Step 7: Update `tests/components/beheer/AdminDashboard.test.tsx`**

Replace `tests/components/beheer/AdminDashboard.test.tsx` with:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AdminDashboard } from '@/components/beheer/AdminDashboard';
import messages from '../../../messages/nl.json';

const logoutMock = vi.fn();
const getDocsMock = vi.fn();
let mockAuthState: {
  user: { uid: string; email: string | null } | null;
  isAdmin: boolean;
  isHydrated: boolean;
};

vi.mock('@/lib/useAdminAuth', () => ({
  useAdminAuth: () => ({
    ...mockAuthState,
    login: vi.fn(),
    resetPassword: vi.fn(),
    logout: logoutMock,
  }),
}));

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ name })),
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  updateDoc: vi.fn(),
}));

function renderDashboard() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <AdminDashboard />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  logoutMock.mockReset();
  getDocsMock.mockReset();
  getDocsMock.mockResolvedValue({ docs: [] });
});

describe('AdminDashboard', () => {
  it('renders nothing while not hydrated', () => {
    mockAuthState = { user: null, isAdmin: false, isHydrated: false };
    renderDashboard();
    expect(screen.queryByTestId('beheer-login-email')).not.toBeInTheDocument();
    expect(screen.queryByTestId('beheer-dashboard')).not.toBeInTheDocument();
  });

  it('shows the login form when hydrated with no user', () => {
    mockAuthState = { user: null, isAdmin: false, isHydrated: true };
    renderDashboard();
    expect(screen.getByTestId('beheer-login-email')).toBeInTheDocument();
  });

  it('shows the BeheerShell with the logged-in email when authorized', async () => {
    mockAuthState = {
      user: { uid: 'uid-1', email: 'paul@glassartanddesign.com' },
      isAdmin: true,
      isHydrated: true,
    };
    renderDashboard();
    expect(screen.getByTestId('beheer-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('beheer-logged-in-as')).toHaveTextContent(
      'paul@glassartanddesign.com'
    );
    await waitFor(() => expect(getDocsMock).toHaveBeenCalled());
  });

  it('shows an access-denied message and signs out when logged in without a medewerkers document', async () => {
    mockAuthState = {
      user: { uid: 'uid-2', email: 'onbekend@glassartanddesign.com' },
      isAdmin: false,
      isHydrated: true,
    };
    renderDashboard();
    expect(screen.getByTestId('beheer-unauthorized')).toBeInTheDocument();
    expect(screen.queryByTestId('beheer-login-email')).not.toBeInTheDocument();
    await waitFor(() => expect(logoutMock).toHaveBeenCalled());
  });
});
```

- [ ] **Step 8: Run the full test suite and a production build**

Run: `npm test && npm run build`
Expected: all tests pass, build succeeds, `/nl/beheer` still the only generated Beheer route.

- [ ] **Step 9: Commit**

```bash
git add src/components/beheer/BeheerShell.tsx tests/components/beheer/BeheerShell.test.tsx src/components/beheer/AdminDashboard.tsx tests/components/beheer/AdminDashboard.test.tsx "src/app/[locale]/beheer/page.tsx" messages/nl.json
git commit -m "feat: wire BeheerShell into AdminDashboard, remove KlantAanvragenSection, widen the Beheer page layout"
```

(The `git rm` from Step 5 was already staged — it lands in this same commit alongside the other changes.)

- [ ] **Step 10: Manual verification (after deploying)**

- On `/beheer`, log in — confirm you land on the Klanten table (not the old cards), with the "Beoordelen" filter pre-applied and the Klanten nav counter showing the right number.
- Clear the status filter — confirm previously-approved/rejected klanten also show up.
- Click a row — confirm the modal shows the klant's details, approve/reject still works and updates the row's status without removing it from the list.
- Click "Facturen" in the nav — confirm the mockup invoices table shows, filtered to "Te betalen" by default, with a working row-click modal (read-only).
- Confirm the 7 disabled menu items (Bestellingen, Retouren, Prijsgroepen, Maten, Materialen, Kunstwerken, Glassart and Design) are visible but not clickable.
