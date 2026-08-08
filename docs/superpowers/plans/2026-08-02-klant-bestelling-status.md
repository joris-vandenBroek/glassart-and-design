# Klant-bestellingsstatus Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 02-08-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a customer-friendly order status ("In behandeling" / "Afgewezen") on the account "Bestellingen" page, mapped from the 4 internal `bestelheaders` statuses, without exposing the internal drukker-workflow to customers.

**Architecture:** A single shared mapping helper (`src/lib/klantBestellingStatus.ts`) reduces the 4 internal statuses to 2 customer-facing ones and provides the badge CSS classes. The `status` field is restored to the client data flow (`useAllOrders.tsx`) and rendered as a colored pill in both the order list (`OrdersSection.tsx`) and the order detail modal (`AccountOrderModal.tsx`).

**Tech Stack:** Next.js 14 App Router, TypeScript, `next-intl`, Vitest + Testing Library, Tailwind CSS.

## Global Constraints

- Mapping: `Te beoordelen` / `Te versturen naar drukker` / `Verstuurd naar drukker` → `inBehandeling` ("In behandeling"); `Afgewezen` → `afgewezen` ("Afgewezen").
- Status badge must appear in both the orders list AND the order detail modal.
- Translation keys live under `accountPage.orders` in all 4 locale files (`messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json`).
- New key: `statusInBehandeling` (nl "In behandeling", en "In progress", de "In Bearbeitung", fr "En cours de traitement"). Keep `statusAfgewezen` as-is. Remove the now-dead `statusTeBeoordelen` and `statusGoedgekeurd` keys (relics of an older 3-status model, unused anywhere in `src`).
- Badge colors reuse the beheer palette: sky (`bg-sky-400/10 text-sky-300`) for "In behandeling", red (`bg-red-400/10 text-red-400`) for "Afgewezen".
- Full spec: `docs/superpowers/specs/2026-08-02-klant-bestelling-status-design.md`.

---

### Task 1: Klant-status mapping helper

**Files:**
- Create: `src/lib/klantBestellingStatus.ts`
- Test: `tests/lib/klantBestellingStatus.test.ts`

**Interfaces:**
- Consumes: `Bestelling['status']` type from `src/components/beheer/BestellingenSection.tsx` (existing union: `'Te beoordelen' | 'Te versturen naar drukker' | 'Verstuurd naar drukker' | 'Afgewezen'`).
- Produces: `type KlantBestellingStatus = 'inBehandeling' | 'afgewezen'`, `function toKlantBestellingStatus(status: Bestelling['status']): KlantBestellingStatus`, `const KLANT_STATUS_BADGE_CLASS: Record<KlantBestellingStatus, string>`. These three are imported by Task 3 and Task 4.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/klantBestellingStatus.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { toKlantBestellingStatus, KLANT_STATUS_BADGE_CLASS } from '@/lib/klantBestellingStatus';

describe('toKlantBestellingStatus', () => {
  it('maps "Te beoordelen" to inBehandeling', () => {
    expect(toKlantBestellingStatus('Te beoordelen')).toBe('inBehandeling');
  });

  it('maps "Te versturen naar drukker" to inBehandeling', () => {
    expect(toKlantBestellingStatus('Te versturen naar drukker')).toBe('inBehandeling');
  });

  it('maps "Verstuurd naar drukker" to inBehandeling', () => {
    expect(toKlantBestellingStatus('Verstuurd naar drukker')).toBe('inBehandeling');
  });

  it('maps "Afgewezen" to afgewezen', () => {
    expect(toKlantBestellingStatus('Afgewezen')).toBe('afgewezen');
  });

  it('provides a badge class for both klant statuses', () => {
    expect(KLANT_STATUS_BADGE_CLASS.inBehandeling).toBe('bg-sky-400/10 text-sky-300');
    expect(KLANT_STATUS_BADGE_CLASS.afgewezen).toBe('bg-red-400/10 text-red-400');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/klantBestellingStatus.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/klantBestellingStatus"`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/klantBestellingStatus.ts`:

```ts
import type { Bestelling } from '@/components/beheer/BestellingenSection';

export type KlantBestellingStatus = 'inBehandeling' | 'afgewezen';

const KLANT_STATUS_MAP: Record<Bestelling['status'], KlantBestellingStatus> = {
  'Te beoordelen': 'inBehandeling',
  'Te versturen naar drukker': 'inBehandeling',
  'Verstuurd naar drukker': 'inBehandeling',
  Afgewezen: 'afgewezen',
};

export function toKlantBestellingStatus(status: Bestelling['status']): KlantBestellingStatus {
  return KLANT_STATUS_MAP[status];
}

export const KLANT_STATUS_BADGE_CLASS: Record<KlantBestellingStatus, string> = {
  inBehandeling: 'bg-sky-400/10 text-sky-300',
  afgewezen: 'bg-red-400/10 text-red-400',
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/klantBestellingStatus.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/klantBestellingStatus.ts tests/lib/klantBestellingStatus.test.ts
git commit -m "feat: add klant-facing bestelling status mapping helper"
```

---

### Task 2: Restore `status` to the client order data flow

**Files:**
- Modify: `src/lib/useAllOrders.tsx:19-25` (`DisplayOrder`), `:27-33` (`RealOrder`), `:58-72` (response type), `:73-79` (`orders.map`), `:96-112` (`useMemo` building `DisplayOrder[]`)
- Modify: `tests/components/account/AccountOrderModal.test.tsx` (add `status` to every inline `DisplayOrder` object literal — required now that `DisplayOrder.status` is non-optional)
- Test: `tests/lib/useAllOrders.test.tsx:51-71` (extend existing test)

**Interfaces:**
- Consumes: `Bestelling['status']` type and `toKlantBestellingStatus`/`KLANT_STATUS_BADGE_CLASS` are NOT used in this task (this task only carries the raw status through).
- Produces: `DisplayOrder.status: Bestelling['status']` — consumed by Task 3 (`OrdersSection.tsx`) and Task 4 (`AccountOrderModal.tsx`).

- [ ] **Step 1: Write the failing test**

In `tests/lib/useAllOrders.test.tsx`, extend the existing `"shows the customer's own real bestellingen"` test (replace lines 51-71) to assert the status is carried through:

```tsx
  it("shows the customer's own real bestellingen", async () => {
    signedIn();
    ordersResponse = {
      ok: true,
      body: [
        {
          id: 'header-1',
          bestelnr: 'GD-00001',
          besteldatum: '2026-07-01T14:30:00',
          status: 'Te versturen naar drukker',
          lines: [{ id: 'line-1', quantity: 3 }],
        },
      ],
    };

    const { result } = renderHook(() => useAllOrders(), { wrapper });
    await waitFor(() => expect(result.current.orders).toHaveLength(1));
    expect(result.current.orders[0].id).toBe('GD-00001');
    expect(result.current.orders[0].description).toBe('1 bestelregel, totaal 3 stuks');
    expect(result.current.orders[0].status).toBe('Te versturen naar drukker');
    expect(result.current.loadError).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/useAllOrders.test.tsx`
Expected: FAIL — `expect(result.current.orders[0].status).toBe('Te versturen naar drukker')` receives `undefined`

- [ ] **Step 3: Write minimal implementation**

In `src/lib/useAllOrders.tsx`, add the import and thread `status` through every layer:

```ts
import type { Bestelling } from '@/components/beheer/BestellingenSection';
```

Update `DisplayOrder` (was `:19-25`):

```ts
export interface DisplayOrder {
  id: string;
  date: string;
  time: string;
  description: string;
  status: Bestelling['status'];
  lines: DisplayOrderLine[] | null;
}
```

Update `RealOrder` (was `:27-33`):

```ts
interface RealOrder {
  id: string;
  date: Date | null;
  status: Bestelling['status'];
  lineCount: number;
  totalQuantity: number;
  lines: DisplayOrderLine[];
}
```

Update the response type inside `loadRealOrders` (was `:58-72`) by adding `status: Bestelling['status'];` right after `besteldatum: string;`:

```ts
        const headers = (await response.json()) as Array<{
          id: string;
          bestelnr: string;
          besteldatum: string;
          status: Bestelling['status'];
          lines: Array<{
            id: string;
            kunstwerkId: string | null;
            maatId: string | null;
            materiaalId: string | null;
            breedte?: number;
            hoogte?: number;
            prijs: number | null;
            quantity: number;
          }>;
        }>;
```

Update the `orders.map` inside `loadRealOrders` (was `:73-79`) to carry `status` into `RealOrder`:

```ts
        const orders = headers.map((header) => ({
          id: header.bestelnr ?? header.id,
          date: header.besteldatum ? new Date(header.besteldatum) : null,
          status: header.status,
          lineCount: header.lines.length,
          totalQuantity: header.lines.reduce((sum, line) => sum + (line.quantity ?? 0), 0),
          lines: header.lines,
        }));
```

Update the `useMemo` that builds `DisplayOrder[]` (was `:96-112`) to carry `status` into `DisplayOrder`:

```ts
  const orders = useMemo(() => {
    return realOrders.map((order) => {
      const { date, time } = order.date
        ? formatOrderDateTime(order.date)
        : { date: '', time: '' };
      return {
        id: order.id,
        date,
        time,
        status: order.status,
        description: tAccount('orders.lineSummary', {
          lines: order.lineCount,
          quantity: order.totalQuantity,
        }),
        lines: order.lines,
      };
    });
  }, [realOrders, tAccount]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/useAllOrders.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Fix now-incomplete `DisplayOrder` literals in `AccountOrderModal.test.tsx`**

`DisplayOrder.status` is now a required field. Update every inline order object in
`tests/components/account/AccountOrderModal.test.tsx` (4 call sites: lines 46-49, 59-62,
74-77, 85-88) to include a `status` field.

The block `id: 'GD-00001', date: '1-7-2026', time: '14:30', description: '',` (each field
on its own line) is byte-for-byte identical at 3 call sites (lines 46-49, 74-77, 85-88), so
a single **`replace_all`** edit of:

```ts
      id: 'GD-00001',
      date: '1-7-2026',
      time: '14:30',
      description: '',
```

with:

```ts
      id: 'GD-00001',
      date: '1-7-2026',
      time: '14:30',
      status: 'Te beoordelen',
      description: '',
```

updates all 3 at once. Then a separate, non-`replace_all` edit for the remaining GD-00002
call site (lines 59-62), from:

```ts
      id: 'GD-00002',
      date: '2-7-2026',
      time: '09:00',
      description: '',
```

to:

```ts
      id: 'GD-00002',
      date: '2-7-2026',
      time: '09:00',
      status: 'Te beoordelen',
      description: '',
```

- [ ] **Step 6: Run the full test suite to verify nothing else broke**

Run: `npx vitest run tests/lib/useAllOrders.test.tsx tests/components/account/AccountOrderModal.test.tsx tests/components/account/OrdersSection.test.tsx`
Expected: PASS (all tests — `OrdersSection.test.tsx` already sends `status` in its fixtures, `AccountOrderModal.test.tsx` now has valid literals)

- [ ] **Step 7: Commit**

```bash
git add src/lib/useAllOrders.tsx tests/lib/useAllOrders.test.tsx tests/components/account/AccountOrderModal.test.tsx
git commit -m "feat: carry bestelling status through useAllOrders"
```

---

### Task 3: Status badge in the orders list

**Files:**
- Modify: `src/lib/klantBestellingStatus.ts` — no change (already produced by Task 1)
- Modify: `src/components/account/OrdersSection.tsx:1-45`
- Modify: `messages/nl.json:245-249`, `messages/en.json:248-252`, `messages/de.json:245-249`, `messages/fr.json:245-249`
- Modify: `tests/components/account/OrdersSection.test.tsx:74-82`

**Interfaces:**
- Consumes: `toKlantBestellingStatus`, `KLANT_STATUS_BADGE_CLASS` from `@/lib/klantBestellingStatus` (Task 1); `DisplayOrder.status` from `@/lib/useAllOrders` (Task 2).
- Produces: nothing consumed by later tasks — Task 4 defines its own badge markup independently (same helper, different component).

- [ ] **Step 1: Update the translation files**

In `messages/nl.json`, replace (lines 247-249):

```json
      "statusTeBeoordelen": "Te beoordelen",
      "statusGoedgekeurd": "Goedgekeurd",
      "statusAfgewezen": "Afgewezen",
```

with:

```json
      "statusInBehandeling": "In behandeling",
      "statusAfgewezen": "Afgewezen",
```

In `messages/en.json`, replace (lines 250-252):

```json
      "statusTeBeoordelen": "Under review",
      "statusGoedgekeurd": "Approved",
      "statusAfgewezen": "Rejected",
```

with:

```json
      "statusInBehandeling": "In progress",
      "statusAfgewezen": "Rejected",
```

In `messages/de.json`, replace (lines 247-249):

```json
      "statusTeBeoordelen": "In Prüfung",
      "statusGoedgekeurd": "Genehmigt",
      "statusAfgewezen": "Abgelehnt",
```

with:

```json
      "statusInBehandeling": "In Bearbeitung",
      "statusAfgewezen": "Abgelehnt",
```

In `messages/fr.json`, replace (lines 247-249):

```json
      "statusTeBeoordelen": "En cours d'examen",
      "statusGoedgekeurd": "Approuvée",
      "statusAfgewezen": "Refusée",
```

with:

```json
      "statusInBehandeling": "En cours de traitement",
      "statusAfgewezen": "Refusée",
```

- [ ] **Step 2: Write the failing test**

In `tests/components/account/OrdersSection.test.tsx`, replace the test at lines 74-82
(`'renders a real order with bestelnr, description, date and time, and no status'`) with:

```tsx
  it('renders a real order with bestelnr, description, date, time and a status badge', async () => {
    signedInWithOneOrder();
    renderSection();

    await waitFor(() => expect(screen.getByTestId('account-order-GD-00001')).toBeInTheDocument());
    expect(screen.getByText('1 bestelregel, totaal 2 stuks')).toBeInTheDocument();
    expect(screen.getByText('1-7-2026 14:30')).toBeInTheDocument();
    expect(screen.getByTestId('account-order-GD-00001-status')).toHaveTextContent('In behandeling');
  });

  it('shows "Afgewezen" for a rejected order', async () => {
    authUser = { id: 'uid-1', email: 'klant@example.com', status: 'Goedgekeurd' };
    ordersResponse = {
      ok: true,
      body: [
        {
          id: 'header-1',
          bestelnr: 'GD-00002',
          besteldatum: '2026-07-01T14:30:00',
          status: 'Afgewezen',
          lines: [{ id: 'line-1', kunstwerkId: null, maatId: null, materiaalId: null, prijs: null, quantity: 1 }],
        },
      ],
    };
    renderSection();

    await waitFor(() => expect(screen.getByTestId('account-order-GD-00002')).toBeInTheDocument());
    expect(screen.getByTestId('account-order-GD-00002-status')).toHaveTextContent('Afgewezen');
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/components/account/OrdersSection.test.tsx`
Expected: FAIL — `Unable to find an element by: [data-testid="account-order-GD-00001-status"]`

- [ ] **Step 4: Write minimal implementation**

Replace the full contents of `src/components/account/OrdersSection.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAllOrders, type DisplayOrder } from '@/lib/useAllOrders';
import { useApiCollection } from '@/lib/useApiCollection';
import { toKlantBestellingStatus, KLANT_STATUS_BADGE_CLASS } from '@/lib/klantBestellingStatus';
import type { Kunstwerk, Materiaal, Maat } from '@/components/beheer/materiaalTypes';
import { AccountOrderModal } from './AccountOrderModal';

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
                className="flex w-full items-center justify-between gap-3 rounded-sm px-2 py-2 text-left text-xs text-white/80 hover:bg-white/5"
              >
                <span className="font-medium">{order.id}</span>
                <span className="flex-1 truncate px-3 text-white/60">{order.description}</span>
                <span
                  data-testid={`account-order-${order.id}-status`}
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] uppercase tracking-wide ${KLANT_STATUS_BADGE_CLASS[klantStatus]}`}
                >
                  {klantStatus === 'afgewezen' ? t('orders.statusAfgewezen') : t('orders.statusInBehandeling')}
                </span>
                <span className="whitespace-nowrap text-white/50">
                  {order.date} {order.time}
                </span>
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

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/components/account/OrdersSection.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/account/OrdersSection.tsx tests/components/account/OrdersSection.test.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json
git commit -m "feat: show klant-facing status badge in orders list"
```

---

### Task 4: Status badge in the order detail modal

**Files:**
- Modify: `src/components/account/AccountOrderModal.tsx:1-48`
- Modify: `tests/components/account/AccountOrderModal.test.tsx`

**Interfaces:**
- Consumes: `toKlantBestellingStatus`, `KLANT_STATUS_BADGE_CLASS` from `@/lib/klantBestellingStatus` (Task 1); `DisplayOrder.status` (Task 2, already present in every test literal after Task 2 Step 5).

- [ ] **Step 1: Write the failing test**

Append to `tests/components/account/AccountOrderModal.test.tsx`, inside the `describe('AccountOrderModal', ...)` block:

```tsx
  it('shows an "In behandeling" status badge for an active order', () => {
    renderModal({
      id: 'GD-00001',
      date: '1-7-2026',
      time: '14:30',
      status: 'Te versturen naar drukker',
      description: '',
      lines: [{ id: 'line-1', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
    });
    expect(screen.getByTestId('account-order-modal-status')).toHaveTextContent('In behandeling');
  });

  it('shows an "Afgewezen" status badge for a rejected order', () => {
    renderModal({
      id: 'GD-00001',
      date: '1-7-2026',
      time: '14:30',
      status: 'Afgewezen',
      description: '',
      lines: [{ id: 'line-1', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
    });
    expect(screen.getByTestId('account-order-modal-status')).toHaveTextContent('Afgewezen');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/account/AccountOrderModal.test.tsx`
Expected: FAIL — `Unable to find an element by: [data-testid="account-order-modal-status"]`

- [ ] **Step 3: Write minimal implementation**

In `src/components/account/AccountOrderModal.tsx`, add the import:

```ts
import { toKlantBestellingStatus, KLANT_STATUS_BADGE_CLASS } from '@/lib/klantBestellingStatus';
```

Replace the date/time paragraph block (was lines 46-48) with the paragraph plus a new
status badge, inserted right after it and before the lines list:

```tsx
          <p className="text-white/60">
            {order.date} {order.time}
          </p>
          <span
            data-testid="account-order-modal-status"
            className={`w-fit rounded-full px-3 py-1 text-xs uppercase tracking-wide ${KLANT_STATUS_BADGE_CLASS[toKlantBestellingStatus(order.status)]}`}
          >
            {toKlantBestellingStatus(order.status) === 'afgewezen' ? t('statusAfgewezen') : t('statusInBehandeling')}
          </span>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/account/AccountOrderModal.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/account/AccountOrderModal.tsx tests/components/account/AccountOrderModal.test.tsx
git commit -m "feat: show klant-facing status badge in order detail modal"
```

---

### Task 5: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests PASS, no failures

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no errors

- [ ] **Step 3: Run a production build to catch any TypeScript type errors**

Run: `npm run build`
Expected: build succeeds (this is the step that would catch a missed `DisplayOrder.status`
literal or a typo in the `Bestelling['status']` union — `vitest` does not type-check)

- [ ] **Step 4: Manually verify in the dev server**

Start `npm run dev`, log in as a klant test account (see memory: `joris.vandenbroek@gmail.com`
is a valid medewerker login — for a klant-side check, use or create a klant test account with
at least one real order in each of the 4 statuses), open `/account`, and confirm:
- the orders list shows a status pill per row ("In behandeling" or "Afgewezen")
- opening an order shows the same status as a pill in the detail modal
- switching the browser locale (nl/en/de/fr) shows the translated label

If any step fails, fix the underlying issue and re-run from Step 1 — do not proceed to
declaring the feature done until all 4 steps are clean.
