# Besteloverzicht + besteldetail bol.com-stijl — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the customer bestellingen list + both order-detail popups (customer `AccountOrderModal` and beheer `BestellingModal`) with a bol.com-inspired look: stacked per-order thumbnails in the list, per-line "kaart" styling with a unit-price × aantal = subtotaal row, and an order-wide total shown in the popup header.

**Architecture:** Purely a presentational redesign of three existing client components (`OrdersSection.tsx`, `AccountOrderModal.tsx`, `BestellingModal.tsx`) plus one shared-infrastructure fix (`Modal.tsx`'s subtitle wrapper, needed so a richer `subtitle` `ReactNode` — text + status badge + total block — renders as valid HTML instead of a `<div>` nested inside a `<p>`). No API, database, or cart/checkout changes.

**Tech Stack:** Next.js 14 (App Router) client components, TypeScript, Tailwind CSS, `next-intl`, Vitest + Testing Library.

## Global Constraints

- Design source of truth: `docs/superpowers/specs/2026-08-04-bestelling-overzicht-bolcom-stijl-design.md` — approved 2026-08-04.
- `beheer` is a Dutch-only staff namespace: it exists **only** in `messages/nl.json` (verified — no `"beheer"` key in `en.json`/`de.json`/`fr.json`). New `beheer.*` i18n keys go in `nl.json` only.
- `accountPage.orders` is customer-facing and localized: new keys there must be added to all four `messages/{nl,en,de,fr}.json` files.
- Preserve every existing `data-testid` used by `tests/components/account/OrdersSection.test.tsx`, `tests/components/account/AccountOrderModal.test.tsx`, and `tests/components/beheer/BestellingModal.test.tsx` unless a step below explicitly says a test's *assertion text* changes (the testid itself never moves/disappears, only its position in the DOM or the literal text it wraps, per the redesign).
- `tests/components/beheer/BestellingenSection.test.tsx` is untouched — the beheer bestellingen list stays the existing `DataTable`, out of scope per the design doc.
- Run `npx vitest run <file>` for the specific test file after each task; do not run the full `npm test` suite until the final task.

---

## File Structure

- **Modify** `src/components/Modal.tsx` — subtitle wrapper element (`<p>` → `<div>`) so a richer `subtitle` node (flex row with a status badge + total block) is valid HTML. No other change to this file.
- **Modify** `src/components/account/OrdersSection.tsx` — adds a per-row stacked-thumbnail component and a responsive (mobile 2-line / desktop 1-line) grid layout for id/description/status/date.
- **Modify** `src/components/account/AccountOrderModal.tsx` — per-line card styling with a subtotal row, order total moved into the `Modal` header subtitle alongside the status badge.
- **Modify** `src/components/beheer/BestellingModal.tsx` — same per-line card styling and header total, with all existing edit/prijs-vaststellen/goedkeuren/afwijzen behavior preserved unchanged.
- **Modify** `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json` — new `accountPage.orders` keys (all four files) and new `beheer` keys (`nl.json` only).
- **Modify** `tests/components/account/OrdersSection.test.tsx`, `tests/components/account/AccountOrderModal.test.tsx`, `tests/components/beheer/BestellingModal.test.tsx` — new tests for the added behavior, plus updates to a small number of existing assertions whose literal expected text changes because the old `×{quantity}` pill is replaced by the new `{quantity} × {unit price}` price-row copy (this is an intentional, user-approved copy change, not a regression).

---

### Task 1: `Modal.tsx` — subtitle wrapper supports rich content

**Files:**
- Modify: `src/components/Modal.tsx:74-77`
- Test: `tests/components/Modal.test.tsx`

**Interfaces:**
- Consumes: nothing new (no prop signature change — `subtitle?: ReactNode` already exists).
- Produces: the header now renders `subtitle` inside a `<div>` instead of a `<p>`, so later tasks can pass a `<div className="flex ...">` (status badge + total block) without invalid `<div>`-inside-`<p>` nesting. `AccountOrderModal`/`BestellingModal` (Tasks 3–4) rely on this.

- [ ] **Step 1: Write the failing test**

Add to `tests/components/Modal.test.tsx`, right after the existing "renders the subtitle in the header when provided" test (after line 51):

```tsx
  it('renders a non-text subtitle (e.g. a flex row with a badge) without nesting block content in a <p>', () => {
    renderWithIntl(
      <Modal
        isOpen
        onClose={vi.fn()}
        closeLabel="Sluiten"
        title="Testmodal"
        subtitle={
          <div data-testid="rich-subtitle" className="flex items-center gap-2">
            <span>Extra context</span>
            <span data-testid="badge">Badge</span>
          </div>
        }
      >
        <p>Inhoud</p>
      </Modal>
    );
    const subtitleEl = screen.getByTestId('rich-subtitle');
    expect(subtitleEl.tagName).toBe('DIV');
    expect(subtitleEl.closest('p')).toBeNull();
    expect(screen.getByTestId('badge')).toHaveTextContent('Badge');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/Modal.test.tsx`
Expected: FAIL — `subtitleEl.closest('p')` is not `null` (jsdom still parses the invalid nesting into a DOM tree where the `div` ends up inside the `p`, or React throws a hydration warning) — the assertion `expect(subtitleEl.closest('p')).toBeNull()` fails today.

- [ ] **Step 3: Fix `Modal.tsx`**

In `src/components/Modal.tsx`, change the header block (currently lines 74–77):

```tsx
        <div data-testid="modal-header" className="shrink-0 border-b border-white/10 px-6 pb-3 pt-6 pr-10">
          <h2 className="text-base font-semibold tracking-wide text-white">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-white/50">{subtitle}</p>}
        </div>
```

to:

```tsx
        <div data-testid="modal-header" className="shrink-0 border-b border-white/10 px-6 pb-3 pt-6 pr-10">
          <h2 className="text-base font-semibold tracking-wide text-white">{title}</h2>
          {subtitle && <div className="mt-0.5 text-xs text-white/50">{subtitle}</div>}
        </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/Modal.test.tsx`
Expected: PASS (all tests in the file, including the new one and the pre-existing "renders the subtitle in the header when provided" test).

- [ ] **Step 5: Commit**

```bash
git add src/components/Modal.tsx tests/components/Modal.test.tsx
git commit -m "fix: render Modal subtitle in a div instead of a p, so rich subtitle content is valid HTML"
```

---

### Task 2: `OrdersSection.tsx` — stacked thumbnails + responsive row

**Files:**
- Modify: `src/components/account/OrdersSection.tsx`
- Test: `tests/components/account/OrdersSection.test.tsx`

**Interfaces:**
- Consumes: `DisplayOrder`/`DisplayOrderLine` from `@/lib/useAllOrders` (already imported), `Kunstwerk` from `@/components/beheer/materiaalTypes` (already imported), `ProductImage` from `@/components/ProductImage` (new import: `{ src: string; alt: string; className?: string }`).
- Produces: no exported interface change — `OrdersSection` remains a zero-prop component. Two new local (non-exported) helpers: `resolveOrderThumbnails(lines: DisplayOrderLine[] | null, kunstwerken: Kunstwerk[] | null): OrderThumbnail[]` and the `OrderThumbnailStack` subcomponent — both private to this file, not consumed elsewhere.

- [ ] **Step 1: Write the failing tests**

In `tests/components/account/OrdersSection.test.tsx`, replace the `beforeEach` block (lines 40–54) with a version that also serves `/api/kunstwerken`:

```tsx
let kunstwerkenResponse: unknown[] = [];

beforeEach(() => {
  window.localStorage.clear();
  authUser = null;
  ordersResponse = { ok: true, body: [] };
  kunstwerkenResponse = [];
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/auth/me?type=klant') {
      return { ok: true, json: async () => ({ user: authUser }) };
    }
    if (url.startsWith('/api/bestelheaders')) {
      return { ok: ordersResponse.ok, json: async () => ordersResponse.body };
    }
    if (url === '/api/kunstwerken') {
      return { ok: true, json: async () => kunstwerkenResponse };
    }
    return { ok: true, json: async () => [] };
  });
});
```

Then add these tests at the end of the `describe('OrdersSection', ...)` block (right before its closing `});` on line 116):

```tsx
  it('shows a single unknown-item placeholder thumbnail when no line has a resolvable kunstwerkId', async () => {
    signedInWithOneOrder();
    renderSection();
    await waitFor(() => expect(screen.getByTestId('account-order-GD-00001')).toBeInTheDocument());

    const stack = screen.getByTestId('account-order-GD-00001-thumbnails');
    expect(stack.children).toHaveLength(1);
    expect(stack).toHaveTextContent('?');
  });

  it('shows a real thumbnail image for a line with a resolvable kunstwerkId', async () => {
    authUser = { id: 'uid-1', email: 'klant@example.com', status: 'Goedgekeurd' };
    kunstwerkenResponse = [
      {
        id: 'kw-1',
        foto: 'https://example.com/kw-1.jpg',
        naam: 'Hotel paneel',
        kunstenaarId: null,
        segmentIds: [],
        materiaalIds: [],
        maatIds: [],
        omschrijvingNl: 'Hotel paneel',
        omschrijvingFr: '',
        omschrijvingDe: '',
        omschrijvingEn: '',
      },
    ];
    ordersResponse = {
      ok: true,
      body: [
        {
          id: 'header-1',
          bestelnr: 'GD-00003',
          besteldatum: '2026-07-01T14:30:00',
          status: 'Te beoordelen',
          lines: [{ id: 'line-1', kunstwerkId: 'kw-1', maatId: null, materiaalId: null, prijs: null, quantity: 1 }],
        },
      ],
    };
    renderSection();

    await waitFor(() => expect(screen.getByTestId('account-order-GD-00003')).toBeInTheDocument());
    const stack = screen.getByTestId('account-order-GD-00003-thumbnails');
    expect(stack.children).toHaveLength(1);
    expect(stack.querySelector('img')).toHaveAttribute('src', 'https://example.com/kw-1.jpg');
  });

  it('caps the thumbnail stack at 3 and shows a "+N" badge for more than 3 unique kunstwerken', async () => {
    authUser = { id: 'uid-1', email: 'klant@example.com', status: 'Goedgekeurd' };
    kunstwerkenResponse = ['kw-1', 'kw-2', 'kw-3', 'kw-4'].map((id) => ({
      id,
      foto: `https://example.com/${id}.jpg`,
      naam: id,
      kunstenaarId: null,
      segmentIds: [],
      materiaalIds: [],
      maatIds: [],
      omschrijvingNl: id,
      omschrijvingFr: '',
      omschrijvingDe: '',
      omschrijvingEn: '',
    }));
    ordersResponse = {
      ok: true,
      body: [
        {
          id: 'header-1',
          bestelnr: 'GD-00004',
          besteldatum: '2026-07-01T14:30:00',
          status: 'Te beoordelen',
          lines: ['kw-1', 'kw-2', 'kw-3', 'kw-4'].map((id, index) => ({
            id: `line-${index}`,
            kunstwerkId: id,
            maatId: null,
            materiaalId: null,
            prijs: null,
            quantity: 1,
          })),
        },
      ],
    };
    renderSection();

    await waitFor(() => expect(screen.getByTestId('account-order-GD-00004')).toBeInTheDocument());
    const stack = screen.getByTestId('account-order-GD-00004-thumbnails');
    expect(stack.children).toHaveLength(3);
    expect(stack).toHaveTextContent('+2');
  });

  it('gives the id/description/status/date row both a mobile (2-row grid) and a desktop (1-row grid) layout', async () => {
    signedInWithOneOrder();
    renderSection();
    await waitFor(() => expect(screen.getByTestId('account-order-GD-00001')).toBeInTheDocument());

    const row = screen.getByTestId('account-order-GD-00001-row');
    expect(row.className).toMatch(/grid-cols-\[minmax\(0,1fr\)_auto\]/);
    expect(row.className).toMatch(/sm:grid-cols-\[auto_minmax\(0,1fr\)_auto_auto\]/);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/account/OrdersSection.test.tsx`
Expected: FAIL — `account-order-GD-00001-thumbnails` and `account-order-GD-00001-row` don't exist yet.

- [ ] **Step 3: Implement the redesign**

Replace the full contents of `src/components/account/OrdersSection.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAllOrders, type DisplayOrder, type DisplayOrderLine } from '@/lib/useAllOrders';
import { useApiCollection } from '@/lib/useApiCollection';
import { ProductImage } from '@/components/ProductImage';
import {
  toKlantBestellingStatus,
  KLANT_STATUS_BADGE_CLASS,
  KLANT_STATUS_TRANSLATION_KEY,
} from '@/lib/klantBestellingStatus';
import type { Kunstwerk, Materiaal, Maat } from '@/components/beheer/materiaalTypes';
import { AccountOrderModal } from './AccountOrderModal';

const MAX_VISIBLE_THUMBNAILS = 3;

type OrderThumbnail =
  | { key: string; kind: 'kunstwerk'; foto: string }
  | { key: string; kind: 'unknown' }
  | { key: 'overflow'; kind: 'overflow'; overflowCount: number };

function resolveOrderThumbnails(
  lines: DisplayOrderLine[] | null,
  kunstwerken: Kunstwerk[] | null
): OrderThumbnail[] {
  if (!lines || lines.length === 0) return [];

  const uniqueIds = Array.from(
    new Set(lines.map((line) => line.kunstwerkId).filter((id): id is string => id !== null))
  );

  if (uniqueIds.length === 0) {
    return [{ key: 'unknown', kind: 'unknown' }];
  }

  const shown: OrderThumbnail[] = uniqueIds.slice(0, MAX_VISIBLE_THUMBNAILS).map((id) => {
    const kunstwerk = (kunstwerken ?? []).find((k) => k.id === id);
    return kunstwerk ? { key: id, kind: 'kunstwerk', foto: kunstwerk.foto } : { key: id, kind: 'unknown' };
  });

  if (uniqueIds.length > MAX_VISIBLE_THUMBNAILS) {
    shown[MAX_VISIBLE_THUMBNAILS - 1] = {
      key: 'overflow',
      kind: 'overflow',
      overflowCount: uniqueIds.length - (MAX_VISIBLE_THUMBNAILS - 1),
    };
  }

  return shown;
}

function OrderThumbnailStack({ orderId, thumbnails }: { orderId: string; thumbnails: OrderThumbnail[] }) {
  if (thumbnails.length === 0) return null;
  return (
    <div data-testid={`account-order-${orderId}-thumbnails`} className="flex shrink-0">
      {thumbnails.map((thumb, index) => (
        <div
          key={thumb.key}
          className={`h-9 w-9 shrink-0 overflow-hidden rounded-md ring-1 ring-charcoal ${index > 0 ? '-ml-3' : ''}`}
        >
          {thumb.kind === 'kunstwerk' ? (
            <ProductImage src={thumb.foto} alt="" className="h-full w-full" />
          ) : thumb.kind === 'overflow' ? (
            <div className="flex h-full w-full items-center justify-center bg-white/10 text-[0.6rem] text-white/60">
              +{thumb.overflowCount}
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-white/5 text-xs text-white/25">?</div>
          )}
        </div>
      ))}
    </div>
  );
}

export function OrdersSection() {
  const t = useTranslations('accountPage');
  const { orders, loadError } = useAllOrders();
  const kunstwerken = useApiCollection<Kunstwerk>('kunstwerken');
  const materialen = useApiCollection<Materiaal>('materialen');
  const maten = useApiCollection<Maat>('maten');
  const [selectedOrder, setSelectedOrder] = useState<DisplayOrder | null>(null);

  return (
    <div data-testid="orders-section">
      <p className="mb-3 text-[0.65rem] uppercase tracking-[0.2em] text-white/50">
        {t('navOrders')}
      </p>
      {loadError && (
        <p data-testid="orders-load-error" className="mb-3 text-xs text-red-400">
          {t('orders.loadError')}
        </p>
      )}
      <ul className="flex flex-col gap-1">
        {orders.map((order) => {
          const klantStatus = toKlantBestellingStatus(order.status);
          return (
            <li key={order.id}>
              <button
                type="button"
                data-testid={`account-order-${order.id}`}
                onClick={() => setSelectedOrder(order)}
                className="flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left text-xs text-white/80 hover:bg-white/5"
              >
                <OrderThumbnailStack
                  orderId={order.id}
                  thumbnails={resolveOrderThumbnails(order.lines, kunstwerken.items)}
                />
                <div
                  data-testid={`account-order-${order.id}-row`}
                  className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:gap-x-3"
                >
                  <span className="col-start-1 row-start-1 font-medium sm:col-start-1 sm:row-start-1">
                    {order.id}
                  </span>
                  <span
                    data-testid={`account-order-${order.id}-status`}
                    className={`col-start-2 row-start-1 w-fit shrink-0 justify-self-end rounded-full px-2 py-0.5 text-[0.65rem] uppercase tracking-wide sm:col-start-3 sm:row-start-1 sm:justify-self-auto ${KLANT_STATUS_BADGE_CLASS[klantStatus]}`}
                  >
                    {t(`orders.${KLANT_STATUS_TRANSLATION_KEY[klantStatus]}`)}
                  </span>
                  <span className="col-start-1 row-start-2 min-w-0 truncate text-white/60 sm:col-start-2 sm:row-start-1">
                    {order.description}
                  </span>
                  <span className="col-start-2 row-start-2 whitespace-nowrap text-white/50 sm:col-start-4 sm:row-start-1">
                    {order.date} {order.time}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <AccountOrderModal
        order={selectedOrder}
        kunstwerken={kunstwerken.items}
        materialen={materialen.items}
        maten={maten.items}
        onClose={() => setSelectedOrder(null)}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/account/OrdersSection.test.tsx`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Commit**

```bash
git add src/components/account/OrdersSection.tsx tests/components/account/OrdersSection.test.tsx
git commit -m "feat: stacked per-order thumbnails and a responsive row layout in the bestellingen list"
```

---

### Task 3: `AccountOrderModal.tsx` — line cards, subtotal, header total

**Files:**
- Modify: `src/components/account/AccountOrderModal.tsx`
- Modify: `messages/nl.json:245-254`, `messages/en.json:248-257`, `messages/de.json:245-254`, `messages/fr.json:245-254` (the `accountPage.orders` block in each)
- Test: `tests/components/account/AccountOrderModal.test.tsx`

**Interfaces:**
- Consumes: `Modal`'s `subtitle?: ReactNode` (now rendered in a `<div>`, Task 1), `ProductImage` (unchanged), `formatCurrency(amount: number): string` (unchanged), `DisplayOrder`/`DisplayOrderLine` (unchanged).
- Produces: no prop-signature change on `AccountOrderModalProps` — same 5 props as today.

- [ ] **Step 1: Add the new i18n keys**

In `messages/nl.json`, inside the `accountPage.orders` object (currently lines 245–254), add three keys after `"modalLinePriceOnRequest"` (line 251):

```json
      "modalLinePriceOnRequest": "Prijs op aanvraag",
      "modalLabelMateriaal": "Materiaal",
      "modalLabelMaat": "Maat",
      "modalTotalLabel": "Totaal",
      "modalTotalIncomplete": "Wordt nog vastgesteld",
      "modalTitel": "Bestelling {id}",
```

In `messages/en.json`, same position (after line 254 `"modalLinePriceOnRequest": "Price on request",`):

```json
      "modalLinePriceOnRequest": "Price on request",
      "modalLabelMateriaal": "Material",
      "modalLabelMaat": "Size",
      "modalTotalLabel": "Total",
      "modalTotalIncomplete": "To be determined",
      "modalTitel": "Order {id}",
```

In `messages/de.json`, same position (after line 251 `"modalLinePriceOnRequest": "Preis auf Anfrage",`):

```json
      "modalLinePriceOnRequest": "Preis auf Anfrage",
      "modalLabelMateriaal": "Material",
      "modalLabelMaat": "Größe",
      "modalTotalLabel": "Gesamt",
      "modalTotalIncomplete": "Wird noch festgelegt",
      "modalTitel": "Bestellung {id}",
```

In `messages/fr.json`, same position (after line 251 `"modalLinePriceOnRequest": "Prix sur demande",`):

```json
      "modalLinePriceOnRequest": "Prix sur demande",
      "modalLabelMateriaal": "Matériau",
      "modalLabelMaat": "Taille",
      "modalTotalLabel": "Total",
      "modalTotalIncomplete": "À déterminer",
      "modalTitel": "Commande {id}",
```

- [ ] **Step 2: Write the failing tests**

Add these tests at the end of `describe('AccountOrderModal', ...)` in `tests/components/account/AccountOrderModal.test.tsx` (right before its closing `});` on line 123):

```tsx
  it('shows the order total in the header when every line has a price', () => {
    renderModal({
      id: 'GD-00005',
      date: '1-7-2026',
      time: '14:30',
      status: 'Te beoordelen',
      description: '',
      lines: [
        { id: 'line-1', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 },
        { id: 'line-2', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 50, quantity: 1 },
      ],
    });
    expect(screen.getByTestId('account-order-modal-total')).toHaveTextContent('€ 350,00');
  });

  it('shows a subtotal per line (aantal × stukprijs)', () => {
    renderModal({
      id: 'GD-00001',
      date: '1-7-2026',
      time: '14:30',
      status: 'Te beoordelen',
      description: '',
      lines: [{ id: 'line-1', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
    });
    const line = screen.getByTestId('account-order-modal-line-line-1');
    expect(line).toHaveTextContent('2 × € 150,00');
    expect(line).toHaveTextContent('€ 300,00');
  });

  it('shows an incomplete-total placeholder instead of a wrong total when a line has no price yet', () => {
    renderModal({
      id: 'GD-00002',
      date: '2-7-2026',
      time: '09:00',
      status: 'Te beoordelen',
      description: '',
      lines: [
        { id: 'line-2', kunstwerkId: 'kw-1', maatId: '', materiaalId: 'mat-1', breedte: 90, hoogte: 140, prijs: null, quantity: 1 },
      ],
    });
    expect(screen.getByTestId('account-order-modal-total')).toHaveTextContent('Wordt nog vastgesteld');
  });

  it('shows no total block for an order with no line detail', () => {
    renderModal({
      id: 'GD-00006',
      date: '1-7-2026',
      time: '14:30',
      status: 'Te beoordelen',
      description: '3 bestelregels, totaal 5 stuks',
      lines: null,
    });
    expect(screen.queryByTestId('account-order-modal-total')).not.toBeInTheDocument();
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/components/account/AccountOrderModal.test.tsx`
Expected: FAIL — `account-order-modal-total` doesn't exist yet; the subtotal test fails because the current markup doesn't render `2 × € 150,00`.

- [ ] **Step 4: Implement the redesign**

Replace the full contents of `src/components/account/AccountOrderModal.tsx` with:

```tsx
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal';
import { ProductImage } from '@/components/ProductImage';
import { resolveKunstwerkOmschrijving } from '@/lib/resolveKunstwerkOmschrijving';
import { formatCurrency } from '@/lib/formatCurrency';
import {
  toKlantBestellingStatus,
  KLANT_STATUS_BADGE_CLASS,
  KLANT_STATUS_TRANSLATION_KEY,
} from '@/lib/klantBestellingStatus';
import type { DisplayOrder } from '@/lib/useAllOrders';
import type { Kunstwerk, Materiaal, Maat } from '@/components/beheer/materiaalTypes';

function materiaalLabel(materiaal: Materiaal): string {
  return `${materiaal.materiaaldikte}mm — ${materiaal.omschrijving}`;
}

function maatLabel(maat: Maat): string {
  return `${maat.breedte}×${maat.hoogte} cm`;
}

interface AccountOrderModalProps {
  order: DisplayOrder | null;
  kunstwerken: Kunstwerk[] | null;
  materialen: Materiaal[] | null;
  maten: Maat[] | null;
  onClose: () => void;
}

export function AccountOrderModal({
  order,
  kunstwerken,
  materialen,
  maten,
  onClose,
}: AccountOrderModalProps) {
  const t = useTranslations('accountPage.orders');
  const locale = useLocale();
  const klantStatus = order ? toKlantBestellingStatus(order.status) : null;

  const heeftRegels = !!order?.lines && order.lines.length > 0;
  const heeftOngeprijsdeRegel = heeftRegels && order!.lines!.some((line) => line.prijs === null);
  const totaalWeergave = !heeftRegels
    ? null
    : heeftOngeprijsdeRegel
      ? t('modalTotalIncomplete')
      : formatCurrency(order!.lines!.reduce((sum, line) => sum + (line.prijs ?? 0) * line.quantity, 0));

  return (
    <Modal
      isOpen={order !== null}
      onClose={onClose}
      closeLabel={t('modalClose')}
      title={order ? t('modalTitel', { id: order.id }) : ''}
      subtitle={
        order ? (
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col items-start gap-1">
              <span>
                {order.date} {order.time}
              </span>
              <span
                data-testid="account-order-modal-status"
                className={`w-fit rounded-full px-3 py-1 text-xs uppercase tracking-wide ${KLANT_STATUS_BADGE_CLASS[klantStatus!]}`}
              >
                {t(KLANT_STATUS_TRANSLATION_KEY[klantStatus!])}
              </span>
            </div>
            {totaalWeergave !== null && (
              <div className="shrink-0 text-right">
                <p className="text-[0.65rem] uppercase tracking-wide text-white/40">{t('modalTotalLabel')}</p>
                <p data-testid="account-order-modal-total" className="text-sm font-semibold text-white">
                  {totaalWeergave}
                </p>
              </div>
            )}
          </div>
        ) : undefined
      }
    >
      {order && (
        <div data-testid="account-order-modal" className="flex flex-col gap-3 text-sm text-white/80">
          {heeftRegels ? (
            <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto text-xs">
              {order.lines!.map((line) => {
                const kunstwerk = (kunstwerken ?? []).find((k) => k.id === line.kunstwerkId);
                const materiaal = (materialen ?? []).find((m) => m.id === line.materiaalId);
                const maat = (maten ?? []).find((m) => m.id === line.maatId);
                const maatWeergave = maat
                  ? maatLabel(maat)
                  : line.breedte != null && line.hoogte != null
                    ? `${line.breedte}×${line.hoogte} cm`
                    : line.maatId;

                return (
                  <li
                    key={line.id}
                    data-testid={`account-order-modal-line-${line.id}`}
                    className="flex gap-3 rounded-md border border-white/10 bg-white/[0.02] p-3"
                  >
                    {kunstwerk ? (
                      <ProductImage src={kunstwerk.foto} alt="" className="h-[72px] w-[72px] shrink-0 rounded-md" />
                    ) : (
                      <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-md bg-white/5 text-lg text-white/25">
                        ?
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      {kunstwerk ? (
                        <>
                          <p className="font-semibold text-white/90">
                            {resolveKunstwerkOmschrijving(kunstwerk, locale)}
                          </p>
                          <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[0.68rem] text-white/60">
                            <span className="text-white/35">{t('modalLabelMateriaal')}</span>
                            <span>{materiaal ? materiaalLabel(materiaal) : line.materiaalId}</span>
                            <span className="text-white/35">{t('modalLabelMaat')}</span>
                            <span>{maatWeergave}</span>
                          </div>
                        </>
                      ) : (
                        <p className="font-semibold text-white/90">{t('modalLineUnknown')}</p>
                      )}
                      <div className="mt-2 flex items-baseline justify-between border-t border-white/10 pt-1.5">
                        {line.prijs !== null ? (
                          <>
                            <span className="text-white/45">
                              {line.quantity} × {formatCurrency(line.prijs)}
                            </span>
                            <span className="font-semibold text-white/90">
                              {formatCurrency(line.prijs * line.quantity)}
                            </span>
                          </>
                        ) : (
                          <span className="text-white/45">{t('modalLinePriceOnRequest')}</span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-white/70">{order.description}</p>
          )}
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/components/account/AccountOrderModal.test.tsx`
Expected: PASS (all tests, old and new).

- [ ] **Step 6: Commit**

```bash
git add src/components/account/AccountOrderModal.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json tests/components/account/AccountOrderModal.test.tsx
git commit -m "feat: bol.com-style line cards with per-line subtotal and an order total in the account order modal"
```

---

### Task 4: `BestellingModal.tsx` — line cards, subtotal, header total (beheer)

**Files:**
- Modify: `src/components/beheer/BestellingModal.tsx`
- Modify: `messages/nl.json:460-479` (the `beheer` block — `nl.json` only, see Global Constraints)
- Test: `tests/components/beheer/BestellingModal.test.tsx`

**Interfaces:**
- Consumes: same as Task 3 (`Modal` subtitle now a `<div>`, `formatCurrency`), plus everything `BestellingModal` already consumes (`useAdminAuth`, `logActiviteit`/`actorFromMedewerker`, `Bestelling`/`BestellingLine` types).
- Produces: no prop-signature change on `BestellingModalProps` — same props/handlers as today (`onUpdated`, `onLinePrijsVastgesteld`, `onLineUpdated` all unchanged).

- [ ] **Step 1: Add the new i18n keys (`nl.json` only)**

In `messages/nl.json`, inside the `beheer` block, add two keys right after `"bestellingenModalLabelAantal": "Aantal",` (line 469):

```json
    "bestellingenModalLabelAantal": "Aantal",
    "bestellingenModalTotalLabel": "Totaal",
    "bestellingenModalTotalIncomplete": "Wordt nog vastgesteld",
    "bestellingenModalPrijsOpAanvraag": "Prijs op aanvraag",
```

- [ ] **Step 2: Update the existing test assertions that reference the old `×{quantity}` pill**

The old design showed a standalone `×{quantity}` pill on the right of each line; the new design replaces it with a `{quantity} × {stukprijs}` price-row (per the approved design, style B has no separate quantity pill). Update `tests/components/beheer/BestellingModal.test.tsx`:

Change (around line 110):
```tsx
    expect(line1).toHaveTextContent('€ 150,00');
    expect(line1).toHaveTextContent('×3');
```
to:
```tsx
    expect(line1).toHaveTextContent('3 × € 150,00');
    expect(line1).toHaveTextContent('€ 450,00');
```

Change (around line 118):
```tsx
    expect(line2).toHaveTextContent('Onbekend');
    expect(line2).toHaveTextContent('×2');
    expect(line2.querySelector('img')).not.toBeInTheDocument();
```
to:
```tsx
    expect(line2).toHaveTextContent('Onbekend');
    expect(line2).toHaveTextContent('2 × € 0,00');
    expect(line2.querySelector('img')).not.toBeInTheDocument();
```

Change (around line 372, in the "discards edits when Annuleren is clicked" test):
```tsx
    expect(screen.getByTestId('bestelling-modal-line-line-1')).toHaveTextContent('×3');
```
to:
```tsx
    expect(screen.getByTestId('bestelling-modal-line-line-1')).toHaveTextContent('3 × € 150,00');
```

- [ ] **Step 3: Write the new failing tests**

Add these tests at the end of the file, in a new `describe` block (after the closing `});` of `'BestellingModal — regel bewerken'` on line 406):

```tsx
describe('BestellingModal — bestelling-totaal', () => {
  it('shows the order total in the header, computed from all lines', () => {
    renderModal(BESTELLING);
    // line-1: 150 × 3 = 450, line-2: 0 × 2 = 0 → total 450
    expect(screen.getByTestId('bestelling-modal-total')).toHaveTextContent('€ 450,00');
  });

  it('shows an incomplete-total placeholder and disables Goedkeuren when a line has no price yet', () => {
    renderModal(BESTELLING_MET_EIGEN_MAAT);
    expect(screen.getByTestId('bestelling-modal-total')).toHaveTextContent('Wordt nog vastgesteld');
    expect(screen.getByTestId('bestelling-modal-goedkeuren')).toBeDisabled();
  });
});
```

- [ ] **Step 4: Run tests to verify the new/updated ones fail**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx`
Expected: FAIL — `bestelling-modal-total` doesn't exist yet; the updated `×3`/`×2` assertions fail against the still-unchanged component.

- [ ] **Step 5: Implement the redesign**

In `src/components/beheer/BestellingModal.tsx`:

**5a.** Add `heeftOngeprijsdeRegel`-based total computation right after the existing `heeftOngeprijsdeRegel` line (currently line 75):

```tsx
  const heeftOngeprijsdeRegel = (bestelling?.lines ?? []).some((line) => line.prijs === null);
  const totaalWeergave =
    bestelling && bestelling.lines.length > 0
      ? heeftOngeprijsdeRegel
        ? t('bestellingenModalTotalIncomplete')
        : formatCurrency(bestelling.lines.reduce((sum, line) => sum + (line.prijs ?? 0) * line.quantity, 0))
      : null;
```

**5b.** Replace the `Modal` call's `subtitle` prop (currently line 197, a single string) with a rich header that keeps the status badge and adds the total, and remove the old in-body status `<span>` (currently lines 224–229) since it moves into the header:

```tsx
      subtitle={
        bestelling ? (
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col items-start gap-1">
              <span>
                {bestelling.companyName} · {bestelling.besteldatum}
              </span>
              <span
                data-testid="bestelling-modal-status"
                className={`w-fit rounded-full px-3 py-1 text-xs uppercase tracking-wide ${STATUS_BADGE_CLASS[bestelling.status]}`}
              >
                {bestelling.status}
              </span>
            </div>
            {totaalWeergave !== null && (
              <div className="shrink-0 text-right">
                <p className="text-[0.65rem] uppercase tracking-wide text-white/40">{t('bestellingenModalTotalLabel')}</p>
                <p data-testid="bestelling-modal-total" className="text-sm font-semibold text-white">
                  {totaalWeergave}
                </p>
              </div>
            )}
          </div>
        ) : undefined
      }
```

Then delete the old top-of-content status `<span>` block (the one directly inside `{bestelling && (<div data-testid="bestelling-modal" ...>` before the `<ul>`):

```tsx
          <span
            data-testid="bestelling-modal-status"
            className={`w-fit rounded-full px-3 py-1 text-xs uppercase tracking-wide ${STATUS_BADGE_CLASS[bestelling.status]}`}
          >
            {bestelling.status}
          </span>

```
(delete this whole block — it's now rendered in `subtitle` instead).

**5c.** Restyle each `<li>` read-only line into a card and replace the old thumbnail/price/quantity markup. Replace the whole `<li ...> ... </li>` block (currently lines 250–444) with:

```tsx
                <li
                  key={line.id}
                  data-testid={`bestelling-modal-line-${line.id}`}
                  className="flex gap-3 rounded-md border border-white/10 bg-white/[0.02] p-3"
                >
                  {kunstwerk ? (
                    <ProductImage src={kunstwerk.foto} alt="" className="h-[72px] w-[72px] shrink-0 rounded-md" />
                  ) : (
                    <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-md bg-white/5 text-lg text-white/25">
                      ?
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-white/90">
                      {kunstwerk ? kunstwerk.omschrijvingNl : t('bestellingenRegelOnbekend')}
                    </p>

                    {!isEditingLine ? (
                      <>
                        {kunstwerk && (
                          <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-white/60">
                            <span className="text-white/35">{t('bestellingenModalLabelMateriaal')}</span>
                            <span>
                              {materiaal
                                ? `${materiaal.materiaaldikte}mm ${
                                    materiaalsoortNaamById.get(materiaal.materiaalsoortId) ??
                                    materiaal.materiaalsoortId
                                  } — ${materiaal.omschrijving}`
                                : line.materiaalId}
                            </span>
                            <span className="text-white/35">{t('bestellingenModalLabelMaat')}</span>
                            <span>{maatWeergave}</span>
                          </div>
                        )}
                        <div className="mt-2 flex items-baseline justify-between border-t border-white/10 pt-1.5">
                          {line.prijs !== null ? (
                            <>
                              <span className="text-white/45">
                                {line.quantity} × {formatCurrency(line.prijs)}
                              </span>
                              <span className="font-semibold text-white/90">
                                {formatCurrency(line.prijs * line.quantity)}
                              </span>
                            </>
                          ) : (
                            <span className="text-white/45">{t('bestellingenModalPrijsOpAanvraag')}</span>
                          )}
                        </div>
                        {line.prijs === null && (
                          <div className="mt-1 flex items-center gap-2">
                            <input
                              type="number"
                              data-testid={`bestelling-modal-prijs-input-${line.id}`}
                              value={prijsDrafts[line.id] ?? ''}
                              onChange={(event) =>
                                setPrijsDrafts((current) => ({ ...current, [line.id]: event.target.value }))
                              }
                              className="w-20 rounded-sm bg-black/40 px-2 py-1 text-xs text-white"
                            />
                            <button
                              type="button"
                              data-testid={`bestelling-modal-prijs-vaststellen-${line.id}`}
                              onClick={() => handlePrijsVaststellen(line)}
                              disabled={!prijsDrafts[line.id] || Number(prijsDrafts[line.id]) <= 0}
                              className="btn-beheer-secondary rounded-sm border border-white/20 px-2 py-1 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white disabled:opacity-40"
                            >
                              {t('bestellingenModalPrijsVaststellen')}
                            </button>
                          </div>
                        )}
                        {kunstwerk && (
                          <button
                            type="button"
                            onClick={() => startEditRegel(line)}
                            data-testid={`bestelling-modal-regel-bewerken-${line.id}`}
                            className="mt-1.5 text-[0.65rem] uppercase tracking-wide text-white/40 underline underline-offset-2 hover:text-white/70"
                          >
                            {t('bewerken')}
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="mt-1.5 flex flex-col gap-2">
                        <select
                          value={lineDraft?.materiaalId ?? ''}
                          onChange={(event) =>
                            setLineDraft((current) =>
                              current ? { ...current, materiaalId: event.target.value } : current
                            )
                          }
                          data-testid={`bestelling-modal-regel-materiaal-${line.id}`}
                          className="rounded-sm bg-black/40 px-2 py-1.5 text-xs text-white"
                        >
                          {kunstwerkMaterialen.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.materiaaldikte}mm {materiaalsoortNaamById.get(m.materiaalsoortId) ?? m.materiaalsoortId}
                            </option>
                          ))}
                        </select>

                        {isCustomLine(line) ? (
                          <div className="flex gap-2">
                            <input
                              type="number"
                              value={lineDraft?.breedte ?? ''}
                              onChange={(event) =>
                                setLineDraft((current) =>
                                  current ? { ...current, breedte: event.target.value } : current
                                )
                              }
                              data-testid={`bestelling-modal-regel-breedte-${line.id}`}
                              className="w-20 rounded-sm bg-black/40 px-2 py-1 text-xs text-white"
                            />
                            <input
                              type="number"
                              value={lineDraft?.hoogte ?? ''}
                              onChange={(event) =>
                                setLineDraft((current) =>
                                  current ? { ...current, hoogte: event.target.value } : current
                                )
                              }
                              data-testid={`bestelling-modal-regel-hoogte-${line.id}`}
                              className="w-20 rounded-sm bg-black/40 px-2 py-1 text-xs text-white"
                            />
                          </div>
                        ) : (
                          <select
                            value={lineDraft?.maatId ?? ''}
                            onChange={(event) =>
                              setLineDraft((current) =>
                                current ? { ...current, maatId: event.target.value } : current
                              )
                            }
                            data-testid={`bestelling-modal-regel-maat-${line.id}`}
                            className="rounded-sm bg-black/40 px-2 py-1.5 text-xs text-white"
                          >
                            {kunstwerkMaten.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.breedte}×{m.hoogte} cm
                              </option>
                            ))}
                          </select>
                        )}

                        <div className="flex gap-2">
                          <input
                            type="number"
                            placeholder={t('bestellingenModalLabelPrijs')}
                            value={lineDraft?.prijs ?? ''}
                            onChange={(event) =>
                              setLineDraft((current) =>
                                current ? { ...current, prijs: event.target.value } : current
                              )
                            }
                            data-testid={`bestelling-modal-regel-prijs-${line.id}`}
                            className="w-24 rounded-sm bg-black/40 px-2 py-1 text-xs text-white"
                          />
                          <input
                            type="number"
                            min={1}
                            placeholder={t('bestellingenModalLabelAantal')}
                            value={lineDraft?.quantity ?? ''}
                            onChange={(event) =>
                              setLineDraft((current) =>
                                current ? { ...current, quantity: event.target.value } : current
                              )
                            }
                            data-testid={`bestelling-modal-regel-aantal-${line.id}`}
                            className="w-16 rounded-sm bg-black/40 px-2 py-1 text-xs text-white"
                          />
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpslaanRegel(line)}
                            data-testid={`bestelling-modal-regel-opslaan-${line.id}`}
                            className="btn-beheer-primary rounded-sm bg-silver px-3 py-1.5 text-xs tracking-wide text-ink"
                          >
                            {t('bestellingenModalRegelOpslaan')}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditRegel}
                            data-testid={`bestelling-modal-regel-annuleren-${line.id}`}
                            className="btn-beheer-secondary rounded-sm border border-white/20 px-3 py-1.5 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
                          >
                            {t('annuleren')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </li>
```

Note what was deliberately dropped from the old markup: the raw `<img>` (replaced by `ProductImage`, same as `AccountOrderModal`) and the standalone right-aligned `×{quantity}` `<p>` pill (its job is now done by the `{line.quantity} × {formatCurrency(line.prijs)}` price-row text, per Step 2's updated test assertions). Everything else — every handler, every `data-testid`, the edit-mode form — is unchanged, just moved inside the new card wrapper.

**5d.** Add the `ProductImage` import at the top of the file, next to the existing imports:

```tsx
import { ProductImage } from '@/components/ProductImage';
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx`
Expected: PASS (all tests, old and new).

- [ ] **Step 7: Commit**

```bash
git add src/components/beheer/BestellingModal.tsx messages/nl.json tests/components/beheer/BestellingModal.test.tsx
git commit -m "feat: bol.com-style line cards with per-line subtotal and an order total in the beheer bestelling modal"
```

---

### Task 5: Full regression check + manual visual verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests pass, including `tests/components/beheer/BestellingenSection.test.tsx` (untouched, must still pass unmodified) and every other suite in the repo.

- [ ] **Step 2: Run the linter**

Run: `npm run lint`
Expected: PASS — no new lint errors from the JSX/TS changes across the four modified components.

- [ ] **Step 3: Manual visual check in the browser**

Start the dev server (`npm run dev`), sign in as the test klant account (see `reference_medewerker_test_account`/test klant accounts in memory, or use any klant with orders on staging data), and open `/nl/account` → Bestellingen:
- Confirm the list shows stacked thumbnails per row, resize the window to ~375px width and confirm the row reflows into the two-line mobile layout (thumbnail column left, id+status on top, description+date below) matching the approved mockup.
- Click a multi-line order and confirm each line renders as a bordered card with a subtotal row, and the header shows a total (or the "Wordt nog vastgesteld" placeholder for an order with an unpriced line).
- Repeat for the beheer side: sign in as a medewerker, open Beheer → Bestellingen, click a bestelling, and confirm the same card/total treatment, and that Bewerken/Prijs vaststellen/Goedkeuren/Afwijzen still all work.

- [ ] **Step 4: Report the outcome**

No commit for this task (verification only) — report the manual-check outcome back to the user before considering the feature done.

---

## Self-Review Notes

- **Spec coverage:** Section A (list thumbnails + responsive row) → Task 2. Section B (line cards + subtotal) → Tasks 3–4. Section C (header total, placeholder for incomplete pricing) → Tasks 3–4. i18n section → Tasks 3–4 Step 1. Testing section (preserve testids, update the ones whose copy changed) → all tasks. "Niet in scope" items are not touched by any task.
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code.
- **Type consistency:** `OrderThumbnail` (Task 2), `resolveOrderThumbnails`, `heeftRegels`/`totaalWeergave` naming is consistent within each file; `formatCurrency`, `ProductImage`, `Modal` prop names match their real signatures verified against the current source in Tasks 1–4.
