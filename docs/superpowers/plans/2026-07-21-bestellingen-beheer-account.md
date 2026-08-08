# Bestellingen in Beheer en op de accountpagina Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 21-07-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A medewerker can see, filter, and approve/reject real bestellingen in Beheer; a klant sees their own real bestellingen alongside their existing mock order history on `/account`.

**Architecture:** Both tasks follow established patterns exactly: the Beheer side mirrors `KlantenSection`/`KlantModal` (DataTable + Modal, fetch-in-`BeheerShell`, optimistic local update on approve/reject); the account side extends the existing `useAllOrders` hook with a third, real data source alongside its two mock sources.

**Tech Stack:** Next.js 14 (App Router), React 18, `firebase` (Firestore client SDK), `next-intl`, Vitest + Testing Library.

## Global Constraints

- `bestelheaders`/`bestellines` field names and values (from the previous plan): `klantId`, `besteldatum` (Firestore Timestamp), `status` (`'Te beoordelen' | 'Goedgekeurd' | 'Afgewezen'`); each `bestellines` doc has `kunstwerkId`/`maatId`/`materiaalId` (currently always `null`) and `quantity` (number).
- Security rules gain exactly one change: medewerkers may `update` a `bestelheaders` doc (no field restriction, mirroring the existing `klanten` update rule). Nothing else about the rules changes.
- Beheer's Bestellingen section: read + approve/reject only. No further statuses (production/shipping/delivery) — that's explicitly out of scope.
- The account page's real orders are read-only display — no new customer-facing actions.
- `useOrders`/`useAllOrders`'s existing mock sources (`placedOrders`, seed orders) are unchanged; real orders are a third, additive source.
- New translation keys: Beheer keys go only in `messages/nl.json` (existing Beheer convention — Dutch-only admin area). Account-page keys go in all 4 locale files.
- Spec reference: `docs/superpowers/specs/2026-07-21-bestellingen-beheer-account-design.md`.

---

### Task 1: Beheer — Bestellingen section

**Files:**
- Create: `src/components/beheer/BestellingenSection.tsx`
- Create: `src/components/beheer/BestellingModal.tsx`
- Create: `tests/components/beheer/BestellingenSection.test.tsx`
- Create: `tests/components/beheer/BestellingModal.test.tsx`
- Modify: `src/components/beheer/BeheerNav.tsx`
- Modify: `src/components/beheer/BeheerShell.tsx`
- Modify: `tests/components/beheer/BeheerNav.test.tsx`
- Modify: `tests/components/beheer/BeheerShell.test.tsx`
- Modify: `firestore.rules`
- Modify: `messages/nl.json`

**Interfaces:**
- Consumes: `DataTable<T>`/`Column<T>` from `@/components/DataTable`, `Modal` from `@/components/Modal` (both already exist, unchanged).
- Produces: `Bestelling`/`BestellingLine` types exported from `BestellingenSection.tsx`. Not consumed by Task 2 (the two tasks are independent).

- [ ] **Step 1: Security rules**

In `firestore.rules`, inside the existing `match /bestelheaders/{id} { ... }` block, change:

```
      allow update, delete: if false;
```

to:

```
      allow update: if request.auth != null && exists(/databases/$(database)/documents/medewerkers/$(request.auth.uid));
      allow delete: if false;
```

(Only this one line changes. The nested `bestellines` rules below it are untouched.)

- [ ] **Step 2: Translation keys**

In `messages/nl.json`, in the `beheer` namespace, append these keys right after the last existing key (`"matenVerwijderen": "Verwijderen"`, currently the last key before the namespace's closing brace) — add a comma after the existing last line and insert:

```json
    "matenVerwijderen": "Verwijderen",
    "bestellingenLoadError": "Kon de bestellingen niet laden. Probeer de pagina te verversen.",
    "bestellingenActionError": "Er is iets misgegaan. Probeer het opnieuw.",
    "bestellingenEmpty": "Geen bestellingen gevonden.",
    "bestellingenColKlant": "Klant",
    "bestellingenColDatum": "Besteldatum",
    "bestellingenColAantal": "Aantal",
    "bestellingenColStatus": "Status",
    "bestellingenRegelOnbekend": "Onbekend",
    "bestellingenGoedkeuren": "Goedkeuren",
    "bestellingenAfwijzen": "Afwijzen"
```

(`navBestellingen` already exists from when the item was a disabled placeholder — no change needed there.)

- [ ] **Step 3: `BestellingenSection.tsx`**

Create `src/components/beheer/BestellingenSection.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { BestellingModal } from './BestellingModal';

export interface BestellingLine {
  id: string;
  kunstwerkId: string | null;
  maatId: string | null;
  materiaalId: string | null;
  quantity: number;
}

export interface Bestelling {
  id: string;
  klantId: string;
  companyName: string;
  besteldatum: string;
  status: 'Te beoordelen' | 'Goedgekeurd' | 'Afgewezen';
  lineCount: number;
  totalQuantity: number;
  lines: BestellingLine[];
}

interface BestellingenSectionProps {
  bestellingen: Bestelling[] | null;
  loadError: string | null;
  onBestellingUpdated: (bestelling: Bestelling) => void;
}

export function BestellingenSection({
  bestellingen,
  loadError,
  onBestellingUpdated,
}: BestellingenSectionProps) {
  const t = useTranslations('beheer');
  const [selectedBestelling, setSelectedBestelling] = useState<Bestelling | null>(null);

  if (loadError) {
    return (
      <p data-testid="bestellingen-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (bestellingen === null) {
    return null;
  }

  const columns: Column<Bestelling>[] = [
    { key: 'companyName', label: t('bestellingenColKlant'), filterType: 'text' },
    { key: 'besteldatum', label: t('bestellingenColDatum'), filterType: 'text' },
    {
      key: 'lineCount',
      label: t('bestellingenColAantal'),
      filterType: 'text',
      render: (row) => `${row.lineCount} / ${row.totalQuantity}`,
    },
    {
      key: 'status',
      label: t('bestellingenColStatus'),
      filterType: 'select',
      filterOptions: ['Te beoordelen', 'Goedgekeurd', 'Afgewezen'],
    },
  ];

  return (
    <div data-testid="bestellingen-section">
      <DataTable<Bestelling>
        columns={columns}
        rows={bestellingen}
        getRowId={(row) => row.id}
        onRowClick={setSelectedBestelling}
        defaultFilters={{ status: 'Te beoordelen' }}
        emptyLabel={t('bestellingenEmpty')}
      />
      <BestellingModal
        bestelling={selectedBestelling}
        onClose={() => setSelectedBestelling(null)}
        onUpdated={(updated) => {
          onBestellingUpdated(updated);
          setSelectedBestelling(null);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 4: `BestellingModal.tsx`**

Create `src/components/beheer/BestellingModal.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Modal } from '@/components/Modal';
import type { Bestelling } from './BestellingenSection';

interface BestellingModalProps {
  bestelling: Bestelling | null;
  onClose: () => void;
  onUpdated: (bestelling: Bestelling) => void;
}

export function BestellingModal({ bestelling, onClose, onUpdated }: BestellingModalProps) {
  const t = useTranslations('beheer');
  const [error, setError] = useState<string | null>(null);

  async function handleGoedkeuren() {
    if (!bestelling) return;
    try {
      await updateDoc(doc(db, 'bestelheaders', bestelling.id), { status: 'Goedgekeurd' });
      onUpdated({ ...bestelling, status: 'Goedgekeurd' });
    } catch {
      setError(t('bestellingenActionError'));
    }
  }

  async function handleAfwijzen() {
    if (!bestelling) return;
    try {
      await updateDoc(doc(db, 'bestelheaders', bestelling.id), { status: 'Afgewezen' });
      onUpdated({ ...bestelling, status: 'Afgewezen' });
    } catch {
      setError(t('bestellingenActionError'));
    }
  }

  return (
    <Modal isOpen={bestelling !== null} onClose={onClose} closeLabel={t('modalClose')}>
      {bestelling && (
        <div data-testid="bestelling-modal" className="flex flex-col gap-3 text-sm text-white/80">
          <p>{bestelling.companyName}</p>
          <p className="text-white/60">{bestelling.besteldatum}</p>

          <ul className="flex flex-col gap-1 text-xs">
            {bestelling.lines.map((line) => (
              <li
                key={line.id}
                data-testid={`bestelling-modal-line-${line.id}`}
                className="flex justify-between"
              >
                <span>{line.kunstwerkId ?? t('bestellingenRegelOnbekend')}</span>
                <span>×{line.quantity}</span>
              </li>
            ))}
          </ul>

          {error && (
            <p data-testid="bestelling-modal-error" className="text-xs text-red-400">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleGoedkeuren}
              data-testid="bestelling-modal-goedkeuren"
              className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
            >
              {t('bestellingenGoedkeuren')}
            </button>
            <button
              type="button"
              onClick={handleAfwijzen}
              data-testid="bestelling-modal-afwijzen"
              className="rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
            >
              {t('bestellingenAfwijzen')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 5: Write the failing tests**

Create `tests/components/beheer/BestellingModal.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BestellingModal } from '@/components/beheer/BestellingModal';
import type { Bestelling } from '@/components/beheer/BestellingenSection';
import messages from '../../../messages/nl.json';

const updateDocMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
}));

const BESTELLING: Bestelling = {
  id: 'header-1',
  klantId: 'uid-1',
  companyName: 'Testbedrijf BV',
  besteldatum: '1-7-2026',
  status: 'Te beoordelen',
  lineCount: 2,
  totalQuantity: 5,
  lines: [
    { id: 'line-1', kunstwerkId: null, maatId: null, materiaalId: null, quantity: 3 },
    { id: 'line-2', kunstwerkId: null, maatId: null, materiaalId: null, quantity: 2 },
  ],
};

function renderModal(bestelling: Bestelling | null) {
  const onClose = vi.fn();
  const onUpdated = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <BestellingModal bestelling={bestelling} onClose={onClose} onUpdated={onUpdated} />
    </NextIntlClientProvider>
  );
  return { onClose, onUpdated };
}

beforeEach(() => {
  updateDocMock.mockReset();
});

describe('BestellingModal', () => {
  it('renders nothing when bestelling is null', () => {
    renderModal(null);
    expect(screen.queryByTestId('bestelling-modal')).not.toBeInTheDocument();
  });

  it('shows the bestelling details and each line with quantity', () => {
    renderModal(BESTELLING);
    expect(screen.getByTestId('bestelling-modal')).toHaveTextContent('Testbedrijf BV');
    expect(screen.getByTestId('bestelling-modal-line-line-1')).toHaveTextContent('×3');
    expect(screen.getByTestId('bestelling-modal-line-line-2')).toHaveTextContent('×2');
    expect(screen.getAllByText('Onbekend')).toHaveLength(2);
  });

  it('approves the bestelling and calls onUpdated with status Goedgekeurd', async () => {
    updateDocMock.mockResolvedValue(undefined);
    const { onUpdated } = renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-goedkeuren'));

    await waitFor(() =>
      expect(updateDocMock).toHaveBeenCalledWith(
        { collectionName: 'bestelheaders', id: 'header-1' },
        { status: 'Goedgekeurd' }
      )
    );
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ ...BESTELLING, status: 'Goedgekeurd' }));
  });

  it('rejects the bestelling and calls onUpdated with status Afgewezen', async () => {
    updateDocMock.mockResolvedValue(undefined);
    const { onUpdated } = renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen'));

    await waitFor(() =>
      expect(updateDocMock).toHaveBeenCalledWith(
        { collectionName: 'bestelheaders', id: 'header-1' },
        { status: 'Afgewezen' }
      )
    );
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ ...BESTELLING, status: 'Afgewezen' }));
  });

  it('shows an error and does not call onUpdated when updateDoc fails', async () => {
    updateDocMock.mockRejectedValue(new Error('offline'));
    const { onUpdated } = renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen'));

    expect(await screen.findByTestId('bestelling-modal-error')).toBeInTheDocument();
    expect(onUpdated).not.toHaveBeenCalled();
  });
});
```

Create `tests/components/beheer/BestellingenSection.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BestellingenSection, type Bestelling } from '@/components/beheer/BestellingenSection';
import messages from '../../../messages/nl.json';

const updateDocMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
}));

const BESTELLINGEN: Bestelling[] = [
  {
    id: 'header-1',
    klantId: 'uid-1',
    companyName: 'Testbedrijf BV',
    besteldatum: '1-7-2026',
    status: 'Te beoordelen',
    lineCount: 1,
    totalQuantity: 3,
    lines: [{ id: 'line-1', kunstwerkId: null, maatId: null, materiaalId: null, quantity: 3 }],
  },
  {
    id: 'header-2',
    klantId: 'uid-2',
    companyName: 'Ander Bedrijf',
    besteldatum: '2-7-2026',
    status: 'Goedgekeurd',
    lineCount: 1,
    totalQuantity: 1,
    lines: [{ id: 'line-2', kunstwerkId: null, maatId: null, materiaalId: null, quantity: 1 }],
  },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof BestellingenSection>> = {}) {
  const onBestellingUpdated = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <BestellingenSection
        bestellingen={BESTELLINGEN}
        loadError={null}
        onBestellingUpdated={onBestellingUpdated}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  return { onBestellingUpdated };
}

beforeEach(() => {
  updateDocMock.mockReset();
});

describe('BestellingenSection', () => {
  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('bestellingen-error')).toHaveTextContent('Kon niet laden.');
    expect(screen.queryByTestId('data-table')).not.toBeInTheDocument();
  });

  it('renders nothing while bestellingen is null and there is no error', () => {
    renderSection({ bestellingen: null });
    expect(screen.queryByTestId('bestellingen-section')).not.toBeInTheDocument();
  });

  it('shows only the "Te beoordelen" bestelling by default (status filter defaults to Te beoordelen)', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-header-1')).toBeInTheDocument();
    expect(screen.queryByTestId('data-table-row-header-2')).not.toBeInTheDocument();
  });

  it('shows all bestellingen when the status filter is cleared', () => {
    renderSection();
    fireEvent.change(screen.getByTestId('data-table-filter-status'), { target: { value: '' } });
    expect(screen.getByTestId('data-table-row-header-1')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-header-2')).toBeInTheDocument();
  });

  it("opens the BestellingModal with the clicked bestelling's data when a row is clicked", () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-header-1'));
    expect(screen.getByTestId('bestelling-modal')).toHaveTextContent('Testbedrijf BV');
  });

  it('closes the modal and reports the updated bestelling via onBestellingUpdated after approving', async () => {
    updateDocMock.mockResolvedValue(undefined);
    const { onBestellingUpdated } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-header-1'));
    fireEvent.click(screen.getByTestId('bestelling-modal-goedkeuren'));

    await waitFor(() =>
      expect(onBestellingUpdated).toHaveBeenCalledWith({ ...BESTELLINGEN[0], status: 'Goedgekeurd' })
    );
    await waitFor(() => expect(screen.queryByTestId('bestelling-modal')).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 6: Run the tests to confirm they pass**

Run: `npx vitest run tests/components/beheer/BestellingenSection.test.tsx tests/components/beheer/BestellingModal.test.tsx`
Expected: PASS — 11 tests green (5 in `BestellingModal.test.tsx`, 6 in `BestellingenSection.test.tsx`).

- [ ] **Step 7: Wire `bestellingen` into `BeheerNav.tsx`**

Replace the full contents of `src/components/beheer/BeheerNav.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';

export type BeheerSection =
  | 'klanten'
  | 'facturen'
  | 'bestellingen'
  | 'materiaalsoorten'
  | 'materialen'
  | 'maten';

interface BeheerNavProps {
  activeSection: BeheerSection;
  onSelect: (section: BeheerSection) => void;
  onLogout: () => void;
  klantenCount: number;
  facturenCount: number;
  bestellingenCount: number;
  materiaalsoortenCount: number;
  materialenCount: number;
  matenCount: number;
}

const ACTIVE_ITEMS: { id: BeheerSection; labelKey: string }[] = [
  { id: 'klanten', labelKey: 'navKlanten' },
  { id: 'facturen', labelKey: 'navFacturen' },
  { id: 'bestellingen', labelKey: 'navBestellingen' },
  { id: 'materiaalsoorten', labelKey: 'navMateriaalsoorten' },
  { id: 'materialen', labelKey: 'navMaterialen' },
  { id: 'maten', labelKey: 'navMaten' },
];

const DISABLED_ITEMS: { id: string; labelKey: string }[] = [
  { id: 'retouren', labelKey: 'navRetouren' },
  { id: 'prijsgroepen', labelKey: 'navPrijsgroepen' },
  { id: 'kunstwerken', labelKey: 'navKunstwerken' },
  { id: 'glassartDesign', labelKey: 'navGlassartDesign' },
];

export function BeheerNav({
  activeSection,
  onSelect,
  onLogout,
  klantenCount,
  facturenCount,
  bestellingenCount,
  materiaalsoortenCount,
  materialenCount,
  matenCount,
}: BeheerNavProps) {
  const t = useTranslations('beheer');
  const counts: Record<BeheerSection, number> = {
    klanten: klantenCount,
    facturen: facturenCount,
    bestellingen: bestellingenCount,
    materiaalsoorten: materiaalsoortenCount,
    materialen: materialenCount,
    maten: matenCount,
  };

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

- [ ] **Step 8: Update `tests/components/beheer/BeheerNav.test.tsx`**

Replace the full contents:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BeheerNav, type BeheerSection } from '@/components/beheer/BeheerNav';
import messages from '../../../messages/nl.json';

function renderNav(activeSection: BeheerSection = 'klanten') {
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
        bestellingenCount={5}
        materiaalsoortenCount={4}
        materialenCount={6}
        matenCount={2}
      />
    </NextIntlClientProvider>
  );
  return { onSelect, onLogout };
}

describe('BeheerNav', () => {
  it('renders the 6 active items with their counters, and the 4 disabled placeholder items', () => {
    renderNav();
    expect(screen.getByTestId('beheer-nav-klanten')).toHaveTextContent('Klanten');
    expect(screen.getByTestId('beheer-nav-klanten')).toHaveTextContent('3');
    expect(screen.getByTestId('beheer-nav-facturen')).toHaveTextContent('Facturen');
    expect(screen.getByTestId('beheer-nav-facturen')).toHaveTextContent('7');
    expect(screen.getByTestId('beheer-nav-bestellingen')).toHaveTextContent('Bestellingen');
    expect(screen.getByTestId('beheer-nav-bestellingen')).toHaveTextContent('5');
    expect(screen.getByTestId('beheer-nav-materiaalsoorten')).toHaveTextContent('Materiaalsoorten');
    expect(screen.getByTestId('beheer-nav-materiaalsoorten')).toHaveTextContent('4');
    expect(screen.getByTestId('beheer-nav-materialen')).toHaveTextContent('Materialen');
    expect(screen.getByTestId('beheer-nav-materialen')).toHaveTextContent('6');
    expect(screen.getByTestId('beheer-nav-maten')).toHaveTextContent('Maten');
    expect(screen.getByTestId('beheer-nav-maten')).toHaveTextContent('2');

    ['retouren', 'prijsgroepen', 'kunstwerken', 'glassartDesign'].forEach((id) => {
      expect(screen.getByTestId(`beheer-nav-${id}`)).toBeDisabled();
    });
  });

  it('marks the active section with aria-current', () => {
    renderNav('materialen');
    expect(screen.getByTestId('beheer-nav-materialen')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('beheer-nav-klanten')).not.toHaveAttribute('aria-current');
  });

  it('calls onSelect with the clicked section id', () => {
    const { onSelect } = renderNav();
    fireEvent.click(screen.getByTestId('beheer-nav-bestellingen'));
    expect(onSelect).toHaveBeenCalledWith('bestellingen');
  });

  it('calls onLogout when the logout button is clicked', () => {
    const { onLogout } = renderNav();
    fireEvent.click(screen.getByTestId('beheer-nav-logout'));
    expect(onLogout).toHaveBeenCalled();
  });
});
```

- [ ] **Step 9: Run it to confirm it passes**

Run: `npx vitest run tests/components/beheer/BeheerNav.test.tsx`
Expected: PASS — all 4 tests green.

- [ ] **Step 10: Wire the fetch + section switch into `BeheerShell.tsx`**

Replace the full contents of `src/components/beheer/BeheerShell.tsx`:

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { GlassPanel } from '@/components/GlassPanel';
import { BeheerNav, type BeheerSection } from './BeheerNav';
import { KlantenSection, type Klant } from './KlantenSection';
import { FacturenSection } from './FacturenSection';
import { BestellingenSection, type Bestelling, type BestellingLine } from './BestellingenSection';
import { MateriaalsoortenSection } from './MateriaalsoortenSection';
import { MaterialenSection } from './MaterialenSection';
import { MatenSection } from './MatenSection';
import type { Materiaalsoort, Materiaal, Maat } from './materiaalTypes';
import { MOCK_ADMIN_INVOICES } from '@/data/mockAdminInvoices';
import { useFirestoreCollection } from '@/lib/useFirestoreCollection';
import { MATERIAALSOORTEN_SEED, buildMaterialenSeed } from '@/data/materiaalsoortenSeed';

interface BeheerShellProps {
  email: string;
  onLogout: () => void;
}

type RawBestelling = Omit<Bestelling, 'companyName'>;

export function BeheerShell({ email, onLogout }: BeheerShellProps) {
  const t = useTranslations('beheer');
  const [activeSection, setActiveSection] = useState<BeheerSection>('klanten');
  const [klanten, setKlanten] = useState<Klant[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rawBestellingen, setRawBestellingen] = useState<RawBestelling[] | null>(null);
  const [bestellingenLoadError, setBestellingenLoadError] = useState<string | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    async function loadBestellingen() {
      try {
        const headersSnapshot = await getDocs(collection(db, 'bestelheaders'));
        const rows = await Promise.all(
          headersSnapshot.docs.map(async (headerDoc) => {
            const linesSnapshot = await getDocs(
              collection(db, 'bestelheaders', headerDoc.id, 'bestellines')
            );
            const lines: BestellingLine[] = linesSnapshot.docs.map((lineDoc) => {
              const lineData = lineDoc.data();
              return {
                id: lineDoc.id,
                kunstwerkId: lineData.kunstwerkId,
                maatId: lineData.maatId,
                materiaalId: lineData.materiaalId,
                quantity: lineData.quantity,
              };
            });
            const data = headerDoc.data();
            return {
              id: headerDoc.id,
              klantId: data.klantId,
              besteldatum: data.besteldatum?.toDate().toLocaleDateString('nl-NL') ?? '',
              status: data.status,
              lineCount: lines.length,
              totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0),
              lines,
            } as RawBestelling;
          })
        );
        if (!cancelled) {
          setRawBestellingen(rows);
          setBestellingenLoadError(null);
        }
      } catch {
        if (!cancelled) {
          setBestellingenLoadError(t('bestellingenLoadError'));
        }
      }
    }
    loadBestellingen();
    return () => {
      cancelled = true;
    };
  }, [t]);

  function handleKlantUpdated(updated: Klant) {
    setKlanten((current) => (current ?? []).map((klant) => (klant.id === updated.id ? updated : klant)));
  }

  function handleBestellingUpdated(updated: Bestelling) {
    setRawBestellingen((current) =>
      (current ?? []).map((row) => (row.id === updated.id ? { ...row, status: updated.status } : row))
    );
  }

  const bestellingen = useMemo(() => {
    if (rawBestellingen === null) return null;
    return rawBestellingen.map((row) => ({
      ...row,
      companyName: (klanten ?? []).find((klant) => klant.id === row.klantId)?.companyName ?? row.klantId,
    }));
  }, [rawBestellingen, klanten]);

  const materiaalsoorten = useFirestoreCollection<Materiaalsoort>('materiaalsoorten', {
    seed: MATERIAALSOORTEN_SEED,
  });
  const materialenSeed = materiaalsoorten.items ? buildMaterialenSeed(materiaalsoorten.items) : undefined;
  const materialen = useFirestoreCollection<Materiaal>('materialen', {
    seed: materialenSeed,
    skip: materiaalsoorten.items === null,
  });
  const maten = useFirestoreCollection<Maat>('maten');

  const klantenCount = (klanten ?? []).filter((klant) => klant.status === 'Beoordelen').length;
  const facturenCount = MOCK_ADMIN_INVOICES.filter((invoice) => invoice.status === 'Te betalen').length;
  const bestellingenCount = (bestellingen ?? []).filter((b) => b.status === 'Te beoordelen').length;
  const materiaalsoortenCount = (materiaalsoorten.items ?? []).length;
  const materialenCount = (materialen.items ?? []).length;
  const matenCount = (maten.items ?? []).length;

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
          bestellingenCount={bestellingenCount}
          materiaalsoortenCount={materiaalsoortenCount}
          materialenCount={materialenCount}
          matenCount={matenCount}
        />
      </GlassPanel>
      <GlassPanel className="w-full">
        {activeSection === 'klanten' ? (
          <KlantenSection klanten={klanten} loadError={loadError} onKlantUpdated={handleKlantUpdated} />
        ) : activeSection === 'facturen' ? (
          <FacturenSection />
        ) : activeSection === 'bestellingen' ? (
          <BestellingenSection
            bestellingen={bestellingen}
            loadError={bestellingenLoadError}
            onBestellingUpdated={handleBestellingUpdated}
          />
        ) : activeSection === 'materiaalsoorten' ? (
          <MateriaalsoortenSection
            materiaalsoorten={materiaalsoorten.items}
            materialen={materialen.items}
            // Note: a write that succeeds but whose follow-up refetch fails also sets
            // error to 'load' (not 'action'), so it surfaces here as a full-section
            // error rather than the modal's actionError banner — treated as acceptable
            // since the shown data is now stale and worth a hard refresh anyway.
            loadError={materiaalsoorten.error === 'load' ? t('materiaalsoortenLoadError') : null}
            onAdd={materiaalsoorten.add}
            onUpdate={materiaalsoorten.update}
            onRemove={materiaalsoorten.remove}
          />
        ) : activeSection === 'materialen' ? (
          <MaterialenSection
            materialen={materialen.items}
            materiaalsoorten={materiaalsoorten.items}
            loadError={materialen.error === 'load' ? t('materialenLoadError') : null}
            onAdd={materialen.add}
            onUpdate={materialen.update}
            onRemove={materialen.remove}
          />
        ) : (
          <MatenSection
            maten={maten.items}
            loadError={maten.error === 'load' ? t('matenLoadError') : null}
            onAdd={maten.add}
            onUpdate={maten.update}
            onRemove={maten.remove}
          />
        )}
      </GlassPanel>
    </div>
  );
}
```

- [ ] **Step 11: Update `tests/components/beheer/BeheerShell.test.tsx`**

First, change the shared `collection` mock (near the top of the file) from:

```tsx
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ name })),
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  addDoc: (...args: unknown[]) => addDocMock(...args),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));
```

to:

```tsx
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...segments: string[]) => ({ name: segments.join('/') })),
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  addDoc: (...args: unknown[]) => addDocMock(...args),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));
```

(This is backward compatible: a single-segment call like `collection(db, 'klanten')` still produces `{ name: 'klanten' }`, since `['klanten'].join('/')` is just `'klanten'`.)

Then add `bestelheaders: []` to `DEFAULT_COLLECTIONS`:

```tsx
const DEFAULT_COLLECTIONS: Record<string, Array<{ id: string; data: Record<string, unknown> }>> = {
  klanten: [],
  bestelheaders: [],
  materiaalsoorten: [{ id: 'soort-1', data: { omschrijving: 'Veiligheidsglas' } }],
  materialen: [{ id: 'mat-1', data: { materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'Test' } }],
  maten: [{ id: 'maat-1', data: { breedte: 40, hoogte: 60 } }],
};
```

Then append this test at the end of the `describe('BeheerShell', ...)` block:

```tsx
  it('shows the bestellingen count and switches to the Bestellingen section', async () => {
    mockCollections({
      klanten: [{ id: 'uid-1', data: KLANT_DATA }],
      bestelheaders: [
        {
          id: 'header-1',
          data: {
            klantId: 'uid-1',
            besteldatum: { toDate: () => new Date('2026-07-01') },
            status: 'Te beoordelen',
          },
        },
      ],
      'bestelheaders/header-1/bestellines': [
        { id: 'line-1', data: { kunstwerkId: null, maatId: null, materiaalId: null, quantity: 3 } },
      ],
    });
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-bestellingen')).toHaveTextContent('1'));
    screen.getByTestId('beheer-nav-bestellingen').click();
    expect(await screen.findByTestId('bestellingen-section')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-header-1')).toHaveTextContent('Testbedrijf BV');
  });
```

- [ ] **Step 12: Run it to confirm it passes**

Run: `npx vitest run tests/components/beheer/BeheerShell.test.tsx`
Expected: PASS — all 9 tests green (8 existing + 1 new).

- [ ] **Step 13: Run the full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 14: Commit**

```bash
git add firestore.rules messages/nl.json src/components/beheer/BestellingenSection.tsx src/components/beheer/BestellingModal.tsx src/components/beheer/BeheerNav.tsx src/components/beheer/BeheerShell.tsx tests/components/beheer/BestellingenSection.test.tsx tests/components/beheer/BestellingModal.test.tsx tests/components/beheer/BeheerNav.test.tsx tests/components/beheer/BeheerShell.test.tsx
git commit -m "$(cat <<'EOF'
feat: activate Bestellingen in Beheer (read + goedkeuren/afwijzen)

New BestellingenSection/BestellingModal, same DataTable+Modal pattern
as Klanten/Facturen. Fetches bestelheaders + each header's bestellines
subcollection in BeheerShell, resolves the customer name via the
already-loaded klanten list. Medewerkers can now update a
bestelheader's status via the security rules.
EOF
)"
```

---

### Task 2: Accountpagina — echte bestellingen

**Files:**
- Modify: `src/lib/useAllOrders.tsx`
- Modify: `tests/lib/useAllOrders.test.tsx`
- Modify: `tests/components/account/OrdersSection.test.tsx`
- Modify: `tests/components/account/ReturnsSection.test.tsx`
- Modify: `messages/nl.json`
- Modify: `messages/en.json`
- Modify: `messages/de.json`
- Modify: `messages/fr.json`

**Interfaces:**
- Consumes: `useCustomerAuth` from `@/lib/useCustomerAuth` (existing, from the previous plan).
- Produces: `useAllOrders(): DisplayOrder[]` — unchanged signature. `OrdersSection.tsx`/`ReturnsSection.tsx` (not modified) keep working unchanged.

- [ ] **Step 1: Translation keys — `accountPage.orders` in all 4 locales**

In `messages/nl.json`, inside `accountPage`, right after `"logout": "Uitloggen",` and before `"invoices": {`, insert:

```json
    "logout": "Uitloggen",
    "orders": {
      "lineSummary": "{lines, plural, one {# regel} other {# regels}}, {quantity, plural, one {# stuk} other {# stuks}}",
      "statusTeBeoordelen": "Te beoordelen",
      "statusGoedgekeurd": "Goedgekeurd",
      "statusAfgewezen": "Afgewezen"
    },
```

In `messages/en.json`, same position:

```json
    "logout": "Log out",
    "orders": {
      "lineSummary": "{lines, plural, one {# line} other {# lines}}, {quantity, plural, one {# piece} other {# pieces}}",
      "statusTeBeoordelen": "Under review",
      "statusGoedgekeurd": "Approved",
      "statusAfgewezen": "Rejected"
    },
```

In `messages/de.json`, same position:

```json
    "logout": "Abmelden",
    "orders": {
      "lineSummary": "{lines, plural, one {# Position} other {# Positionen}}, {quantity} Stück",
      "statusTeBeoordelen": "In Prüfung",
      "statusGoedgekeurd": "Genehmigt",
      "statusAfgewezen": "Abgelehnt"
    },
```

In `messages/fr.json`, same position:

```json
    "logout": "Déconnexion",
    "orders": {
      "lineSummary": "{lines, plural, one {# ligne} other {# lignes}}, {quantity, plural, one {# pièce} other {# pièces}}",
      "statusTeBeoordelen": "En cours d'examen",
      "statusGoedgekeurd": "Approuvée",
      "statusAfgewezen": "Refusée"
    },
```

(Match each file's existing `"logout"` value verbatim — only the new `"orders": {...}` block is added after it; do not change the `logout` line itself.)

- [ ] **Step 2: Write the failing test**

Replace the full contents of `tests/lib/useAllOrders.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { OrdersProvider, useOrders } from '@/lib/useOrders';
import { ReturnsProvider, useReturns } from '@/lib/useReturns';
import { CustomerAuthProvider } from '@/lib/useCustomerAuth';
import { useAllOrders } from '@/lib/useAllOrders';
import messages from '../../messages/nl.json';

const onAuthStateChangedMock = vi.fn();
const getDocMock = vi.fn();
const getDocsMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => onAuthStateChangedMock(...args),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  collection: vi.fn((_db, ...segments: string[]) => ({ name: segments.join('/') })),
  query: vi.fn((collectionRef, ...constraints) => ({ collectionRef, constraints })),
  where: vi.fn((field, op, value) => ({ field, op, value })),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
}));

function signedOut() {
  onAuthStateChangedMock.mockImplementation((_auth, callback) => {
    callback(null);
    return () => {};
  });
  getDocsMock.mockResolvedValue({ docs: [] });
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerAuthProvider>
        <OrdersProvider>
          <ReturnsProvider>{children}</ReturnsProvider>
        </OrdersProvider>
      </CustomerAuthProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  onAuthStateChangedMock.mockReset();
  getDocMock.mockReset();
  getDocsMock.mockReset();
  signedOut();
});

describe('useAllOrders', () => {
  it('returns the 4 seed orders with translated description/status when nothing else exists', () => {
    const { result } = renderHook(() => useAllOrders(), { wrapper });
    expect(result.current).toHaveLength(4);
    const seedOrder = result.current.find((o) => o.id === 'GD-10234');
    expect(seedOrder?.description).toBe('Abstract paneel 60x90cm');
    expect(seedOrder?.status).toBe('In behandeling');
    expect(seedOrder?.hasReturnRequest).toBe(false);
  });

  it('places a newly placed order before the seed orders', () => {
    const { result } = renderHook(
      () => ({ orders: useAllOrders(), placeOrder: useOrders().placeOrder }),
      { wrapper }
    );
    act(() => {
      result.current.placeOrder('Nieuwe bestelling', 'Aangevraagd');
    });
    expect(result.current.orders).toHaveLength(5);
    expect(result.current.orders[0].description).toBe('Nieuwe bestelling');
  });

  it('overlays "Retour aangemeld" status for an order with a registered return', () => {
    const { result } = renderHook(
      () => ({ orders: useAllOrders(), registerReturn: useReturns().registerReturn }),
      { wrapper }
    );
    act(() => {
      result.current.registerReturn('GD-10234', 'Beschadigd', 'Kapot aangekomen');
    });
    const order = result.current.orders.find((o) => o.id === 'GD-10234');
    expect(order?.status).toBe('Retour aangemeld');
    expect(order?.hasReturnRequest).toBe(true);
  });

  it("shows the customer's own real bestellingen before the mock orders", async () => {
    getDocMock.mockResolvedValue({ exists: () => true, data: () => ({ status: 'Goedgekeurd' }) });
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-1', email: 'klant@example.com' });
      return () => {};
    });
    getDocsMock.mockImplementation((ref: { name?: string; collectionRef?: { name: string } }) => {
      const name = ref.name ?? ref.collectionRef?.name;
      if (name === 'bestelheaders') {
        return Promise.resolve({
          docs: [
            {
              id: 'header-1',
              data: () => ({
                klantId: 'uid-1',
                besteldatum: { toDate: () => new Date('2026-07-01') },
                status: 'Te beoordelen',
              }),
            },
          ],
        });
      }
      if (name === 'bestelheaders/header-1/bestellines') {
        return Promise.resolve({
          docs: [{ id: 'line-1', data: () => ({ quantity: 3 }) }],
        });
      }
      return Promise.resolve({ docs: [] });
    });

    const { result } = renderHook(() => useAllOrders(), { wrapper });
    await waitFor(() => expect(result.current).toHaveLength(5));
    expect(result.current[0].id).toBe('header-1');
    expect(result.current[0].description).toBe('1 regel, 3 stuks');
    expect(result.current[0].status).toBe('Te beoordelen');
  });
});
```

- [ ] **Step 3: Run it to confirm the new test fails**

Run: `npx vitest run tests/lib/useAllOrders.test.tsx`
Expected: FAIL on the new "shows the customer's own real bestellingen" test — `useAllOrders` doesn't call `useCustomerAuth`/Firestore yet, so it throws ("must be used within a CustomerAuthProvider" is not the failure here since the hook doesn't call it yet — the actual failure is the result length staying at 4, not 5). The first 3 (pre-existing) tests should still pass since `signedOut()` keeps the real-orders source empty.

- [ ] **Step 4: Rewrite `useAllOrders.tsx`**

Replace the full contents of `src/lib/useAllOrders.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { MOCK_ORDERS } from '@/data/mockOrders';
import { useOrders } from './useOrders';
import { useReturns } from './useReturns';
import { useCustomerAuth } from './useCustomerAuth';

export interface DisplayOrder {
  id: string;
  date: string;
  description: string;
  status: string;
  hasReturnRequest: boolean;
}

interface RealOrder {
  id: string;
  date: string;
  status: string;
  lineCount: number;
  totalQuantity: number;
}

export function useAllOrders(): DisplayOrder[] {
  const tOrders = useTranslations('orders');
  const tAccount = useTranslations('accountPage');
  const { placedOrders } = useOrders();
  const { returnsByOrderId } = useReturns();
  const { user } = useCustomerAuth();
  const [realOrders, setRealOrders] = useState<RealOrder[]>([]);

  useEffect(() => {
    if (!user) {
      setRealOrders([]);
      return;
    }
    let cancelled = false;
    async function loadRealOrders() {
      const headersSnapshot = await getDocs(
        query(collection(db, 'bestelheaders'), where('klantId', '==', user!.uid))
      );
      const orders = await Promise.all(
        headersSnapshot.docs.map(async (headerDoc) => {
          const linesSnapshot = await getDocs(
            collection(db, 'bestelheaders', headerDoc.id, 'bestellines')
          );
          const totalQuantity = linesSnapshot.docs.reduce(
            (sum, lineDoc) => sum + (lineDoc.data().quantity ?? 0),
            0
          );
          const data = headerDoc.data();
          return {
            id: headerDoc.id,
            date: data.besteldatum?.toDate().toISOString().slice(0, 10) ?? '',
            status: data.status,
            lineCount: linesSnapshot.docs.length,
            totalQuantity,
          };
        })
      );
      if (!cancelled) {
        setRealOrders(orders);
      }
    }
    loadRealOrders();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return useMemo(() => {
    const statusLabels: Record<string, string> = {
      'Te beoordelen': tAccount('orders.statusTeBeoordelen'),
      Goedgekeurd: tAccount('orders.statusGoedgekeurd'),
      Afgewezen: tAccount('orders.statusAfgewezen'),
    };

    const real: DisplayOrder[] = realOrders.map((order) => ({
      id: order.id,
      date: order.date,
      description: tAccount('orders.lineSummary', {
        lines: order.lineCount,
        quantity: order.totalQuantity,
      }),
      status: statusLabels[order.status] ?? order.status,
      hasReturnRequest: false,
    }));

    const placed: DisplayOrder[] = placedOrders.map((order) => ({
      id: order.id,
      date: order.date,
      description: order.description,
      status: order.status,
      hasReturnRequest: false,
    }));

    const seeded: DisplayOrder[] = MOCK_ORDERS.map((order) => ({
      id: order.id,
      date: order.date,
      description: tOrders(`items.${order.messageKey}.description`),
      status: tOrders(`items.${order.messageKey}.status`),
      hasReturnRequest: false,
    }));

    return [...real, ...placed, ...seeded].map((order) => {
      const hasReturnRequest = Boolean(returnsByOrderId[order.id]);
      return {
        ...order,
        status: hasReturnRequest ? tAccount('returns.statusRegistered') : order.status,
        hasReturnRequest,
      };
    });
  }, [realOrders, placedOrders, returnsByOrderId, tOrders, tAccount]);
}
```

- [ ] **Step 5: Run it to confirm all 4 tests pass**

Run: `npx vitest run tests/lib/useAllOrders.test.tsx`
Expected: PASS — all 4 tests green.

- [ ] **Step 6: Update `tests/components/account/OrdersSection.test.tsx`**

Replace the full contents:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { OrdersProvider } from '@/lib/useOrders';
import { ReturnsProvider } from '@/lib/useReturns';
import { CustomerAuthProvider } from '@/lib/useCustomerAuth';
import { OrdersSection } from '@/components/account/OrdersSection';
import messages from '../../../messages/nl.json';

const onAuthStateChangedMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => onAuthStateChangedMock(...args),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  getDoc: vi.fn(),
  collection: vi.fn((_db, ...segments: string[]) => ({ name: segments.join('/') })),
  query: vi.fn((collectionRef, ...constraints) => ({ collectionRef, constraints })),
  where: vi.fn((field, op, value) => ({ field, op, value })),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
}));

function renderSection() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerAuthProvider>
        <OrdersProvider>
          <ReturnsProvider>
            <OrdersSection />
          </ReturnsProvider>
        </OrdersProvider>
      </CustomerAuthProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  onAuthStateChangedMock.mockReset();
  onAuthStateChangedMock.mockImplementation((_auth, callback) => {
    callback(null);
    return () => {};
  });
});

describe('OrdersSection', () => {
  it('renders all 4 seed orders with description and status', () => {
    renderSection();
    expect(screen.getByTestId('account-order-GD-10234')).toBeInTheDocument();
    expect(screen.getByTestId('account-order-GD-10221')).toBeInTheDocument();
    expect(screen.getByTestId('account-order-GD-10198')).toBeInTheDocument();
    expect(screen.getByTestId('account-order-GD-10177')).toBeInTheDocument();
    expect(screen.getByText('Abstract paneel 60x90cm')).toBeInTheDocument();
    expect(screen.getByText('In behandeling')).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Update `tests/components/account/ReturnsSection.test.tsx`**

Add the same mocks and `CustomerAuthProvider` wrapper used in Step 6, without changing any of the existing test bodies. Replace the full contents:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { OrdersProvider } from '@/lib/useOrders';
import { ReturnsProvider } from '@/lib/useReturns';
import { CustomerAuthProvider } from '@/lib/useCustomerAuth';
import { ReturnsSection } from '@/components/account/ReturnsSection';
import messages from '../../../messages/nl.json';

const onAuthStateChangedMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => onAuthStateChangedMock(...args),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  getDoc: vi.fn(),
  collection: vi.fn((_db, ...segments: string[]) => ({ name: segments.join('/') })),
  query: vi.fn((collectionRef, ...constraints) => ({ collectionRef, constraints })),
  where: vi.fn((field, op, value) => ({ field, op, value })),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
}));

function renderSection() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerAuthProvider>
        <OrdersProvider>
          <ReturnsProvider>
            <ReturnsSection />
          </ReturnsProvider>
        </OrdersProvider>
      </CustomerAuthProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  onAuthStateChangedMock.mockReset();
  onAuthStateChangedMock.mockImplementation((_auth, callback) => {
    callback(null);
    return () => {};
  });
});

describe('ReturnsSection', () => {
  it('renders the order select, reason select (4 options), note field and submit button', () => {
    renderSection();
    expect(screen.getByTestId('returns-order-select')).toBeInTheDocument();
    const reasonSelect = screen.getByTestId('returns-reason-select') as HTMLSelectElement;
    expect(reasonSelect.options).toHaveLength(4);
    expect(screen.getByTestId('returns-note')).toBeInTheDocument();
    expect(screen.getByTestId('returns-submit')).toBeInTheDocument();
  });

  it('registers a return, shows a confirmation, and removes that order from the select', () => {
    renderSection();
    const orderSelect = screen.getByTestId('returns-order-select') as HTMLSelectElement;
    fireEvent.change(orderSelect, { target: { value: 'GD-10234' } });
    fireEvent.change(screen.getByTestId('returns-reason-select'), {
      target: { value: 'reasonDamaged' },
    });
    fireEvent.change(screen.getByTestId('returns-note'), {
      target: { value: 'Glas gebarsten' },
    });
    fireEvent.click(screen.getByTestId('returns-submit'));

    expect(screen.getByTestId('returns-confirmation')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /GD-10234/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('return-registered-GD-10234')).toBeInTheDocument();
  });

  it('shows the "no eligible orders" message once every seed order has a return registered', () => {
    renderSection();
    for (const id of ['GD-10234', 'GD-10221', 'GD-10198', 'GD-10177']) {
      fireEvent.change(screen.getByTestId('returns-order-select'), { target: { value: id } });
      fireEvent.click(screen.getByTestId('returns-submit'));
    }
    expect(screen.getByTestId('returns-no-eligible')).toBeInTheDocument();
    expect(screen.queryByTestId('returns-order-select')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/useAllOrders.tsx tests/lib/useAllOrders.test.tsx tests/components/account/OrdersSection.test.tsx tests/components/account/ReturnsSection.test.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json
git commit -m "$(cat <<'EOF'
feat: show the customer's real bestellingen in Mijn bestellingen

useAllOrders gains a third source alongside its two mock sources: the
logged-in klant's own bestelheaders (+ line/quantity counts from each
header's bestellines subcollection), shown first in the list with a
translated status and a line/quantity description.
EOF
)"
```
