# Btw verplicht bij klant goedkeuren Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A medewerker cannot approve ("Goedkeuren") a klant in Beheer unless the klant's (invoice)land has a matching entry in the btw-tarieven list, and sees a clear warning explaining why when it's missing. The `standaardPercentage` fallback rate is removed from the system entirely.

**Architecture:** Remove the `standaardPercentage` field from the `BtwTarieven` type/seed/settings-UI. Introduce a single shared `resolveBtwPercentage(tarieven, land)` helper in `src/lib/resolveBtw.ts` that both order-popups (`BestellingModal.tsx`, `AccountOrderModal.tsx`) already know how to treat as "no match → hide the btw rows" (existing null-guards). Thread a new `btwTarieven` prop into `KlantModal.tsx` (via `KlantenSection.tsx` and `BeheerShell.tsx`, reusing the `useApiRecord('instellingen', 'btwtarieven', ...)` call that already exists) and use the same helper there to show a warning and gate the existing Goedkeuren-knop.

**Tech Stack:** Next.js 14 App Router, TypeScript, React, `next-intl`, Vitest + Testing Library.

## Global Constraints

- Tests run against the real shared staging MySQL database — never write a test cleanup that does an unscoped `DELETE`/`TRUNCATE`. This plan touches no server/DB code, so this should not come up, but keep it in mind if a task needs a fixture beyond what's listed.
- `npm test` runs Vitest once (not watch mode); run single files with `npx vitest run <path>` while iterating.
- Follow existing code style exactly: 2-space indent, no semicolindent surprises — just match the surrounding file.
- Dutch is the only locale that needs new/changed translation keys for this change (`messages/nl.json`, `beheer` namespace) — `beheer` is not translated to en/de/fr elsewhere in the codebase, so don't add en/de/fr keys.
- No activiteitenlog entry for this validation state (matches the existing, un-logged `!prijsgroepId` Goedkeuren-blokkade).
- No changes to the klanten overview table (`KlantenSection.tsx`'s `DataTable` columns) — the warning is modal-only.

---

## Task 1: Remove `standaardPercentage` from the data model and Instellingen UI

**Files:**
- Modify: `src/components/beheer/btwTarievenTypes.ts`
- Modify: `src/data/btwTarievenSeed.ts`
- Modify: `src/components/beheer/InstellingenSection.tsx:181-196` (remove the "Standaardtarief" field)
- Modify: `messages/nl.json` (remove key `instellingenBtwStandaardtarief`)
- Modify: `tests/components/beheer/InstellingenSection.test.tsx`
- Modify: `tests/components/beheer/BeheerShell.test.tsx:89` (fixture literal only)
- Modify: `tests/components/account/AccountDashboard.test.tsx:53` (fixture literal only)
- Modify: `tests/components/account/OrdersSection.test.tsx:15,49,327` (fixture literals only)

**Interfaces:**
- Produces: `BtwTarieven` becomes `{ tarieven: BtwTarief[] }` (no `standaardPercentage`) — every later task and every other file that constructs a `BtwTarieven` literal must drop the field.
- Produces: `BTWTARIEVEN_SEED` becomes `{ tarieven: [{ land: 'NL', percentage: 21 }] }`.

- [ ] **Step 1: Update the failing/changed tests in `InstellingenSection.test.tsx` first**

Edit `tests/components/beheer/InstellingenSection.test.tsx`:

Change line 28 from:
```ts
const BTWTARIEVEN: BtwTarieven = { tarieven: [{ land: 'NL', percentage: 21 }], standaardPercentage: 21 };
```
to:
```ts
const BTWTARIEVEN: BtwTarieven = { tarieven: [{ land: 'NL', percentage: 21 }] };
```

Remove the `expect(screen.getByTestId('instellingen-btw-standaard')).toHaveValue(21);` line from all three tests that contain it (around lines 125, 144 — the "falls back to the BTWTARIEVEN_SEED..." test and the "pre-fills the btw-tarieven rows and the standaardtarief" test; rename that second test's title to `'pre-fills the btw-tarieven rows'`).

In the two tests asserting `onSaveBtw` payloads (around lines 130-140 and 175-192), remove `standaardPercentage: 21,` from the expected object, e.g.:
```ts
expect(onSaveBtw).toHaveBeenCalledWith({
  tarieven: [{ land: 'NL', percentage: 20 }],
});
```

In the "removes a row via its verwijder-knop" test (around line 160-169), remove `standaardPercentage: 21,` from the inline `btwTarieven` override.

- [ ] **Step 2: Run the test file and confirm it now fails against the current implementation**

Run: `npx vitest run tests/components/beheer/InstellingenSection.test.tsx`
Expected: FAIL — `instellingen-btw-standaard` still renders / `onSaveBtw` payload assertions mismatch because `standaardPercentage` is still part of the type and UI.

- [ ] **Step 3: Update the type**

`src/components/beheer/btwTarievenTypes.ts`, full file:
```ts
export interface BtwTarief {
  land: string;
  percentage: number;
}

export interface BtwTarieven {
  tarieven: BtwTarief[];
}
```

- [ ] **Step 4: Update the seed**

`src/data/btwTarievenSeed.ts`, full file:
```ts
import type { BtwTarieven } from '@/components/beheer/btwTarievenTypes';

export const BTWTARIEVEN_SEED: BtwTarieven = {
  tarieven: [{ land: 'NL', percentage: 21 }],
};
```

- [ ] **Step 5: Remove the Standaardtarief field from InstellingenSection.tsx**

In `src/components/beheer/InstellingenSection.tsx`, delete the entire block at lines 181-196:
```tsx
          <label className="flex w-40 flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('instellingenBtwStandaardtarief')}
            <input
              type="number"
              min={0}
              step={0.1}
              value={btwForm.standaardPercentage}
              onChange={(event) =>
                setBtwForm((current) =>
                  current ? { ...current, standaardPercentage: Number(event.target.value) } : current
                )
              }
              data-testid="instellingen-btw-standaard"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
```
(the closing `</div>` of the surrounding btw block on the next line stays — only the `<label>...</label>` block is removed).

- [ ] **Step 6: Remove the now-unused translation key**

In `messages/nl.json`, delete the line:
```json
    "instellingenBtwStandaardtarief": "Standaardtarief",
```

- [ ] **Step 7: Strip `standaardPercentage` from the three unrelated fixture files**

In `tests/components/beheer/BeheerShell.test.tsx`, change line 89 from:
```ts
const BTWTARIEVEN_FIXTURE = { tarieven: [{ land: 'NL', percentage: 21 }], standaardPercentage: 21 };
```
to:
```ts
const BTWTARIEVEN_FIXTURE = { tarieven: [{ land: 'NL', percentage: 21 }] };
```

In `tests/components/account/AccountDashboard.test.tsx`, change line 53 from:
```ts
      return { ok: true, json: async () => ({ tarieven: [{ land: 'NL', percentage: 21 }], standaardPercentage: 21 }) };
```
to:
```ts
      return { ok: true, json: async () => ({ tarieven: [{ land: 'NL', percentage: 21 }] }) };
```

In `tests/components/account/OrdersSection.test.tsx`, remove `, standaardPercentage: 21` from the object literals on lines 15, 49, and 327 (three occurrences of the same pattern — the module-level `let btwTarievenResponse`, its reset in `beforeEach`, and the one-off override in the "passes the klant's own land through" test).

- [ ] **Step 8: Run the full affected test set and confirm everything passes**

Run: `npx vitest run tests/components/beheer/InstellingenSection.test.tsx tests/components/beheer/BeheerShell.test.tsx tests/components/account/AccountDashboard.test.tsx tests/components/account/OrdersSection.test.tsx`
Expected: PASS (note: `BestellingModal.test.tsx` and `AccountOrderModal.test.tsx` still reference `standaardPercentage` and will fail a type-check/test run until Tasks 3 and 4 — that's expected, don't fix them here)

- [ ] **Step 9: Commit**

```bash
git add src/components/beheer/btwTarievenTypes.ts src/data/btwTarievenSeed.ts src/components/beheer/InstellingenSection.tsx messages/nl.json tests/components/beheer/InstellingenSection.test.tsx tests/components/beheer/BeheerShell.test.tsx tests/components/account/AccountDashboard.test.tsx tests/components/account/OrdersSection.test.tsx
git commit -m "refactor: remove standaardPercentage fallback from btw-tarieven"
```

---

## Task 2: Shared `resolveBtwPercentage` helper

**Files:**
- Create: `src/lib/resolveBtw.ts`
- Test: `tests/lib/resolveBtw.test.ts`

**Interfaces:**
- Consumes: `BtwTarief` from `src/components/beheer/btwTarievenTypes.ts` (from Task 1: `{ land: string; percentage: number }`).
- Produces: `resolveBtwPercentage(tarieven: BtwTarief[], land: string | null): number | null` — used by Task 3 (`BestellingModal.tsx`), Task 4 (`AccountOrderModal.tsx`), and Task 5 (`KlantModal.tsx`).

- [ ] **Step 1: Write the failing test**

Create `tests/lib/resolveBtw.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { resolveBtwPercentage } from '@/lib/resolveBtw';
import type { BtwTarief } from '@/components/beheer/btwTarievenTypes';

const TARIEVEN: BtwTarief[] = [
  { land: 'NL', percentage: 21 },
  { land: 'BE', percentage: 6 },
];

describe('resolveBtwPercentage', () => {
  it('returns the matching percentage for a land in the list', () => {
    expect(resolveBtwPercentage(TARIEVEN, 'NL')).toBe(21);
    expect(resolveBtwPercentage(TARIEVEN, 'BE')).toBe(6);
  });

  it('returns null when the land has no matching tarief', () => {
    expect(resolveBtwPercentage(TARIEVEN, 'DE')).toBeNull();
  });

  it('returns null when land is null', () => {
    expect(resolveBtwPercentage(TARIEVEN, null)).toBeNull();
  });

  it('returns null for an empty tarieven list', () => {
    expect(resolveBtwPercentage([], 'NL')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/resolveBtw.test.ts`
Expected: FAIL with a module-not-found error for `@/lib/resolveBtw`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/resolveBtw.ts`:
```ts
import type { BtwTarief } from '@/components/beheer/btwTarievenTypes';

export function resolveBtwPercentage(tarieven: BtwTarief[], land: string | null): number | null {
  if (!land) return null;
  return tarieven.find((tarief) => tarief.land === land)?.percentage ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/resolveBtw.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/resolveBtw.ts tests/lib/resolveBtw.test.ts
git commit -m "feat: add shared resolveBtwPercentage helper"
```

---

## Task 3: Wire `BestellingModal.tsx` to the shared helper

**Files:**
- Modify: `src/components/beheer/BestellingModal.tsx:96-97`
- Modify: `tests/components/beheer/BestellingModal.test.tsx`

**Interfaces:**
- Consumes: `resolveBtwPercentage` from `src/lib/resolveBtw.ts` (Task 2); `BtwTarieven` without `standaardPercentage` (Task 1).

- [ ] **Step 1: Update the test file's fixtures and the now-invalid "fallback" test**

In `tests/components/beheer/BestellingModal.test.tsx`:

Change line 73 from:
```ts
const BTWTARIEVEN: BtwTarieven = { tarieven: [{ land: 'NL', percentage: 21 }], standaardPercentage: 21 };
```
to:
```ts
const BTWTARIEVEN: BtwTarieven = { tarieven: [{ land: 'NL', percentage: 21 }] };
```

Replace the test at lines 463-483 (`'falls back to standaardPercentage when the klant has no land set'`) with:
```ts
  it('shows no btw block when the klant has no land set', () => {
    const klantZonderLand = { ...KLANTEN[0], land: undefined };
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <BestellingModal
          bestelling={BESTELLING}
          kunstwerken={KUNSTWERKEN}
          materialen={MATERIALEN}
          maten={MATEN}
          materiaalsoorten={MATERIAALSOORTEN}
          klanten={[klantZonderLand]}
          btwTarieven={{ tarieven: [{ land: 'DE', percentage: 19 }] }}
          onClose={vi.fn()}
          onUpdated={vi.fn()}
          onLinePrijsVastgesteld={vi.fn()}
          onLineUpdated={vi.fn()}
        />
      </NextIntlClientProvider>
    );
    expect(screen.queryByTestId('bestelling-modal-btw')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-totaal-incl')).not.toBeInTheDocument();
  });
```

In the "uses invoiceLand over land when both are set" test (starting around line 491), remove `standaardPercentage: 21,` from its inline `btwTarieven` object.

- [ ] **Step 2: Run the test file to verify it fails**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx`
Expected: FAIL — the new "shows no btw block when the klant has no land set" test fails because the current implementation still falls back to `btwTarieven.standaardPercentage`, which no longer exists on the type (TS error) and the old runtime behavior would show `21` from `undefined ?? undefined` — check the actual failure output, it must fail before Step 3.

- [ ] **Step 3: Update the resolve expression in BestellingModal.tsx**

In `src/components/beheer/BestellingModal.tsx`, add the import near the other `@/lib/...` imports at the top of the file:
```ts
import { resolveBtwPercentage } from '@/lib/resolveBtw';
```

Replace lines 96-97:
```ts
  const btwPercentage =
    btwTarieven && (btwTarieven.tarieven.find((t) => t.land === land)?.percentage ?? btwTarieven.standaardPercentage);
```
with:
```ts
  const btwPercentage = btwTarieven ? resolveBtwPercentage(btwTarieven.tarieven, land) : null;
```

- [ ] **Step 4: Run the test file to verify it passes**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/BestellingModal.tsx tests/components/beheer/BestellingModal.test.tsx
git commit -m "refactor: use resolveBtwPercentage in BestellingModal"
```

---

## Task 4: Wire `AccountOrderModal.tsx` to the shared helper

**Files:**
- Modify: `src/components/account/AccountOrderModal.tsx:61-62`
- Modify: `tests/components/account/AccountOrderModal.test.tsx`

**Interfaces:**
- Consumes: `resolveBtwPercentage` from `src/lib/resolveBtw.ts` (Task 2); `BtwTarieven` without `standaardPercentage` (Task 1).

- [ ] **Step 1: Update the test file's fixtures and the now-invalid "fallback" test**

In `tests/components/account/AccountOrderModal.test.tsx`:

Change line 29 from:
```ts
const BTWTARIEVEN: BtwTarieven = { tarieven: [{ land: 'NL', percentage: 21 }], standaardPercentage: 21 };
```
to:
```ts
const BTWTARIEVEN: BtwTarieven = { tarieven: [{ land: 'NL', percentage: 21 }] };
```

Replace the test at lines 233-247 (`'falls back to standaardPercentage when land is null'`) with:
```ts
  it('shows no btw block when land is null', () => {
    renderModal(
      {
        id: 'GD-00001',
        date: '1-7-2026',
        time: '14:30',
        status: 'Te beoordelen',
        description: '',
        lines: [{ id: 'line-1', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
      },
      null,
      { tarieven: [{ land: 'DE', percentage: 19 }] }
    );
    expect(screen.queryByTestId('account-order-modal-btw')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-order-modal-totaal-incl')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test file to verify it fails**

Run: `npx vitest run tests/components/account/AccountOrderModal.test.tsx`
Expected: FAIL — the new "shows no btw block when land is null" test fails against the current fallback-to-standaardPercentage implementation.

- [ ] **Step 3: Update the resolve expression in AccountOrderModal.tsx**

In `src/components/account/AccountOrderModal.tsx`, add the import near the other imports at the top:
```ts
import { resolveBtwPercentage } from '@/lib/resolveBtw';
```

Replace lines 61-62:
```ts
  const btwPercentage =
    btwTarieven && (btwTarieven.tarieven.find((t) => t.land === land)?.percentage ?? btwTarieven.standaardPercentage);
```
with:
```ts
  const btwPercentage = btwTarieven ? resolveBtwPercentage(btwTarieven.tarieven, land) : null;
```

- [ ] **Step 4: Run the test file to verify it passes**

Run: `npx vitest run tests/components/account/AccountOrderModal.test.tsx`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add src/components/account/AccountOrderModal.tsx tests/components/account/AccountOrderModal.test.tsx
git commit -m "refactor: use resolveBtwPercentage in AccountOrderModal"
```

---

## Task 5: Warning + Goedkeuren-blokkade in KlantModal

**Files:**
- Modify: `src/components/beheer/KlantModal.tsx`
- Modify: `src/components/beheer/KlantenSection.tsx`
- Modify: `src/components/beheer/BeheerShell.tsx:317-323`
- Modify: `messages/nl.json` (new key `klantenBtwWaarschuwing`)
- Modify: `tests/components/beheer/KlantModal.test.tsx`
- Modify: `tests/components/beheer/KlantenSection.test.tsx`

**Interfaces:**
- Consumes: `resolveBtwPercentage` from `src/lib/resolveBtw.ts` (Task 2); `BtwTarieven`/`BtwTarief` from `src/components/beheer/btwTarievenTypes.ts` (Task 1); `landNaam` from `src/data/landen.ts` (existing).
- Produces: `KlantModal` gains a required prop `btwTarieven: BtwTarieven | null`; `KlantenSection` gains a required prop `btwTarieven: BtwTarieven | null` that it passes straight through to `KlantModal`.

- [ ] **Step 1: Update `KlantModal.test.tsx`'s render helper and existing fixtures so `land: 'NL'` always resolves a valid tarief**

In `tests/components/beheer/KlantModal.test.tsx`, add the import:
```ts
import type { BtwTarieven } from '@/components/beheer/btwTarievenTypes';
```

Add a fixture constant near `KUNSTENAARS`:
```ts
const BTWTARIEVEN: BtwTarieven = { tarieven: [{ land: 'NL', percentage: 21 }] };
```

Update `renderModal` to accept and pass a `btwTarieven` param, defaulting to `BTWTARIEVEN`:
```ts
function renderModal(
  klant: Klant | null,
  prijsgroepen: Prijsgroep[] | null = PRIJSGROEPEN,
  kunstenaars: Kunstenaar[] | null = KUNSTENAARS,
  klanten: Klant[] | null = [KLANT, ANDERE_KLANT],
  btwTarieven: BtwTarieven | null = BTWTARIEVEN
) {
  const onClose = vi.fn();
  const onUpdated = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <KlantModal
        klant={klant}
        prijsgroepen={prijsgroepen}
        kunstenaars={kunstenaars}
        klanten={klanten}
        btwTarieven={btwTarieven}
        onClose={onClose}
        onUpdated={onUpdated}
      />
    </NextIntlClientProvider>
  );
  return { onClose, onUpdated };
}
```

- [ ] **Step 2: Add new tests for the warning and the Goedkeuren-blokkade**

Add these tests to the end of the `describe('KlantModal', ...)` block in `tests/components/beheer/KlantModal.test.tsx`, right before the closing `});`:
```ts
  it('shows a btw warning and blocks Goedkeuren when the klant land has no matching tarief', () => {
    renderModal({ ...KLANT, land: 'DE', prijsgroepId: 'pg-1' }, PRIJSGROEPEN, KUNSTENAARS, [KLANT, ANDERE_KLANT], {
      tarieven: [{ land: 'NL', percentage: 21 }],
    });
    expect(screen.getByTestId('klant-modal-btw-waarschuwing')).toHaveTextContent('Duitsland');
    expect(screen.getByTestId('klant-modal-goedkeuren')).toBeDisabled();
  });

  it('does not show a btw warning and does not block Goedkeuren when the klant land has a matching tarief', () => {
    renderModal({ ...KLANT, land: 'NL', prijsgroepId: 'pg-1' });
    expect(screen.queryByTestId('klant-modal-btw-waarschuwing')).not.toBeInTheDocument();
    expect(screen.getByTestId('klant-modal-goedkeuren')).not.toBeDisabled();
  });

  it('resolves the btw warning against invoiceLand over land when both are set', () => {
    renderModal(
      { ...KLANT, land: 'NL', invoiceLand: 'DE', prijsgroepId: 'pg-1' },
      PRIJSGROEPEN,
      KUNSTENAARS,
      [KLANT, ANDERE_KLANT],
      { tarieven: [{ land: 'NL', percentage: 21 }] }
    );
    expect(screen.getByTestId('klant-modal-btw-waarschuwing')).toHaveTextContent('Duitsland');
  });

  it('still shows the btw warning for an already Goedgekeurd klant whose land tarief is missing', () => {
    renderModal({ ...KLANT, land: 'DE', status: 'Goedgekeurd', prijsgroepId: 'pg-1' }, PRIJSGROEPEN, KUNSTENAARS, [
      KLANT,
      ANDERE_KLANT,
    ], { tarieven: [{ land: 'NL', percentage: 21 }] });
    expect(screen.getByTestId('klant-modal-btw-waarschuwing')).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run the test file to verify the new tests fail**

Run: `npx vitest run tests/components/beheer/KlantModal.test.tsx`
Expected: FAIL — `KlantModal` doesn't accept a `btwTarieven` prop yet and renders no `klant-modal-btw-waarschuwing` element; the two "matching tarief" tests may also fail to compile/render until the prop exists.

- [ ] **Step 4: Add the `btwTarieven` prop, warning banner, and Goedkeuren-blokkade to KlantModal.tsx**

In `src/components/beheer/KlantModal.tsx`, add imports:
```ts
import { resolveBtwPercentage } from '@/lib/resolveBtw';
import type { BtwTarieven } from './btwTarievenTypes';
```

Add `btwTarieven` to `KlantModalProps`:
```ts
interface KlantModalProps {
  klant: Klant | null;
  prijsgroepen: Prijsgroep[] | null;
  kunstenaars: Kunstenaar[] | null;
  klanten: Klant[] | null;
  btwTarieven: BtwTarieven | null;
  onClose: () => void;
  onUpdated: (klant: Klant) => void;
}
```

Add it to the destructured props in the `KlantModal` function signature:
```ts
export function KlantModal({
  klant,
  prijsgroepen,
  kunstenaars,
  klanten,
  btwTarieven,
  onClose,
  onUpdated,
}: KlantModalProps) {
```

Right after the `const { user } = useAdminAuth();` line, add the resolution logic:
```ts
  const land = fields ? fields.invoiceLand || fields.land || null : null;
  const btwPercentage = btwTarieven ? resolveBtwPercentage(btwTarieven.tarieven, land) : null;
  const heeftGeldigBtwTarief = btwPercentage !== null;
```

Update the Goedkeuren button's `disabled` prop from:
```tsx
              disabled={!prijsgroepId}
```
to:
```tsx
              disabled={!prijsgroepId || !heeftGeldigBtwTarief}
```

Add the warning banner right after the status-badge/bewerken-knop `<div className="flex items-center justify-between">...</div>` block (i.e. right after its closing `</div>`, before the `<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">` that holds the address fields):
```tsx
          {!heeftGeldigBtwTarief && (
            <p data-testid="klant-modal-btw-waarschuwing" className="text-xs text-amber-400">
              {t('klantenBtwWaarschuwing', { land: landNaam(land) })}
            </p>
          )}
```

- [ ] **Step 5: Add the translation key**

In `messages/nl.json`, add a new key right after `klantenLabelLand` (line 408):
```json
    "klantenLabelLand": "Land",
    "klantenBtwWaarschuwing": "Geen btw-tarief ingesteld voor {land}. Voeg dit toe bij Instellingen voordat je deze klant kunt goedkeuren.",
```

- [ ] **Step 6: Run the test file to verify it passes**

Run: `npx vitest run tests/components/beheer/KlantModal.test.tsx`
Expected: PASS (all tests in the file, including the 4 new ones)

- [ ] **Step 7: Thread `btwTarieven` through `KlantenSection.tsx`**

In `tests/components/beheer/KlantenSection.test.tsx`:
- Add the import `import type { BtwTarieven } from '@/components/beheer/btwTarievenTypes';`.
- Add `land: 'NL', invoiceLand: '',` to both entries in the `KLANTEN` fixture array (after `city` in each).
- Add a fixture constant: `const BTWTARIEVEN: BtwTarieven = { tarieven: [{ land: 'NL', percentage: 21 }] };`
- Add `btwTarieven={BTWTARIEVEN}` to the `<KlantenSection ...>` render call inside `renderSection`.

Run: `npx vitest run tests/components/beheer/KlantenSection.test.tsx`
Expected: FAIL — `KlantenSection` doesn't declare or forward a `btwTarieven` prop yet, so it never reaches `KlantModal`, which now requires it.

In `src/components/beheer/KlantenSection.tsx`:
- Add the import `import type { BtwTarieven } from './btwTarievenTypes';`.
- Add `btwTarieven: BtwTarieven | null;` to `KlantenSectionProps`.
- Add `btwTarieven` to the destructured props of `KlantenSection`.
- Add `btwTarieven={btwTarieven}` to the `<KlantModal ...>` call.

Run: `npx vitest run tests/components/beheer/KlantenSection.test.tsx`
Expected: PASS

- [ ] **Step 8: Wire `BeheerShell.tsx` to pass its existing btw-tarieven data into `KlantenSection`**

In `src/components/beheer/BeheerShell.tsx`, update the `<KlantenSection ...>` call (around line 317-323) to add one line:
```tsx
          <KlantenSection
            klanten={klanten}
            prijsgroepen={prijsgroepen.items}
            kunstenaars={kunstenaars.items}
            btwTarieven={btwtarieven.data}
            loadError={loadError}
            onKlantUpdated={handleKlantUpdated}
          />
```

Run: `npx vitest run tests/components/beheer/BeheerShell.test.tsx`
Expected: PASS (this file already defines `BTWTARIEVEN_FIXTURE` and mocks the `btwtarieven` API response from Task 1's step 7, so no further test changes are needed here — just confirm nothing regressed)

- [ ] **Step 9: Run the full test suite**

Run: `npm test`
Expected: PASS — every test file touched across Tasks 1-5 is green, and no other file references `standaardPercentage` anymore. If anything outside the files listed in this plan still references `standaardPercentage`, investigate before proceeding (it means an earlier grep missed a usage).

- [ ] **Step 10: Commit**

```bash
git add src/components/beheer/KlantModal.tsx src/components/beheer/KlantenSection.tsx src/components/beheer/BeheerShell.tsx messages/nl.json tests/components/beheer/KlantModal.test.tsx tests/components/beheer/KlantenSection.test.tsx
git commit -m "feat: require a valid btw-tarief to approve a klant"
```

---

## Manual verification (after all tasks)

This plan changes only client-rendered Beheer UI (no server/API/schema changes), so a quick manual pass in the browser preview is worthwhile before calling the branch done:

1. Start the dev server and open Beheer → Instellingen. Confirm the "Standaardtarief" field is gone and the btw-tarieven rows still add/edit/remove/save correctly.
2. Open Beheer → Klanten, pick (or create via registration) a klant whose land has no matching btw-tarief row (e.g. `DE` if only `NL` is configured). Confirm the amber warning appears under the status badge and the "Goedkeuren" button is disabled even with a prijsgroep selected.
3. Add a `DE` row to the btw-tarieven list in Instellingen, save, reopen the same klant — confirm the warning disappears and "Goedkeuren" becomes enabled.
4. Open an existing bestelling for a klant whose land still has no tarief — confirm the btw/totaal-incl. rows are simply absent (no crash, no "undefined%").
