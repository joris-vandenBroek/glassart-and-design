# Standaardmaten per materiaal + eigen maat opgeven Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 23-07-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the 11 real standard sizes for veiligheidsglas/plexi(Acryl)/Dibond to the database, and let customers request a custom size in the order popup — with a 3-month lead-time warning for veiligheidsglas, a 200x300cm cap (no extra lead time) for Acryl/Dibond, and manual/offerte pricing for every custom-size order.

**Architecture:** `Materiaalsoort` gets 4 new optional fields (`staatEigenMaatToe`, `maxBreedte`, `maxHoogte`, `levertijdMaandenEigenMaat`) driving a new "eigen maat" branch in `ProductModal`. `CartItem`/bestellines gain optional `breedte`/`hoogte` and a nullable `prijs` (`null` = "op aanvraag"). The admin review flow (`BestellingModal`) gets a per-line "Prijs vaststellen" control and blocks approval until every line is priced. Firestore rules are loosened to allow a null `prijs` at creation and a one-time admin price-set update on an existing line.

**Tech Stack:** Next.js 14 + React 18, TypeScript, Firebase/Firestore, next-intl, Vitest + Testing Library.

## Global Constraints

- Standard sizes (cm, all materials): 30x30, 50x50, 50x70, 50x100, 60x80, 80x80, 80x120, 100x100, 120x120, 120x180, 100x150.
- Veiligheidsglas: custom sizes allowed, no upper bound, lead time = 3 months.
- Dibond & Acryl: custom sizes allowed, capped at 200x300cm (smallest side <=200, largest side <=300), no extra lead time.
- Akoestische stof: unaffected by this feature.
- Custom-size pricing is always manual/offerte (`prijs: null` until an admin sets it) — no price formula.
- Test runner is `vitest run` (`npm test`); test files live under `tests/...` mirroring `src/...`, not colocated.
- Admin (`beheer`) UI strings are Dutch-only (`messages/nl.json` only has a `beheer` key); customer-facing strings (`cart.*`, `accountPage.orders.*`) must be mirrored across `messages/{nl,en,fr,de}.json`.
- Every new activiteitenlog event name must be added to both `src/lib/logActiviteit.ts`'s `ActiviteitType` union and the `activiteitenlog` create-rule whitelist in `firestore.rules`.

---

## File Structure

**Modify:**
- `src/components/beheer/materiaalTypes.ts` — 4 new optional `Materiaalsoort` fields.
- `src/components/beheer/MateriaalsoortenSection.tsx` — admin UI for the new fields.
- `src/data/materiaalsoortenSeed.ts` — seed values for the 3 affected materiaalsoorten.
- `src/data/kunstwerkenSeed.ts` — `MATEN_SEED` becomes the 11 real sizes.
- `src/lib/useCart.tsx` — nullable `prijs`, optional `breedte`/`hoogte`, custom-size-aware item id, `unpricedLineCount`.
- `src/lib/logActiviteit.ts` — 2 new `ActiviteitType` members.
- `src/components/ProductModal.tsx` — the "eigen maat" ordering flow.
- `src/components/CartPanel.tsx` — custom-size display, order write, "prijs volgt na offerte" note.
- `src/lib/useAllOrders.tsx` — nullable `prijs`, optional `breedte`/`hoogte` on `DisplayOrderLine`.
- `src/components/account/AccountOrderModal.tsx` — custom-size fallback display, "prijs op aanvraag".
- `src/components/beheer/BestellingenSection.tsx` — nullable `prijs` on `BestellingLine`, new `onLinePrijsVastgesteld` prop.
- `src/components/beheer/BestellingModal.tsx` — custom-size fallback, "Prijs vaststellen" control, blocks Goedkeuren while unpriced.
- `src/components/beheer/BeheerShell.tsx` — nullable-price line mapping, wires the new callback.
- `firestore.rules` — nullable `prijs` + `breedte`/`hoogte` keys on bestellines create, a scoped admin update rule, activiteitenlog whitelist.
- `messages/nl.json`, `messages/en.json`, `messages/fr.json`, `messages/de.json` — new copy (customer-facing keys in all 4; admin keys in `nl.json` only).

**Tests (create/modify to match):**
- `tests/components/beheer/MateriaalsoortenSection.test.tsx`
- `tests/data/materiaalsoortenSeed.test.ts`, `tests/data/kunstwerkenSeed.test.ts`
- `tests/lib/useCart.test.ts`
- `tests/components/ProductModal.test.tsx`
- `tests/components/CartPanel.test.tsx`
- `tests/lib/useAllOrders.test.tsx`
- `tests/components/account/AccountOrderModal.test.tsx` (new file — none exists today)
- `tests/components/beheer/BestellingModal.test.tsx`, `tests/components/beheer/BestellingenSection.test.tsx`

No production-data script is needed: `maten`/`materiaalsoorten` already have live data (the `useFirestoreCollection` seed mechanism only fires on an empty collection), and Task 1 delivers the exact admin-UI fields needed to enter the real data by hand — see Task 9.

---

### Task 1: Materiaalsoort data model + admin UI fields

**Files:**
- Modify: `src/components/beheer/materiaalTypes.ts`
- Modify: `src/components/beheer/MateriaalsoortenSection.tsx`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/MateriaalsoortenSection.test.tsx`

**Interfaces:**
- Produces: `Materiaalsoort.staatEigenMaatToe?: boolean`, `Materiaalsoort.maxBreedte?: number`, `Materiaalsoort.maxHoogte?: number`, `Materiaalsoort.levertijdMaandenEigenMaat?: number` — consumed by Tasks 2, 4, 7.

- [ ] **Step 1: Add the 3 new tests + update the 2 existing payload assertions**

In `tests/components/beheer/MateriaalsoortenSection.test.tsx`, change the two existing assertions:

```tsx
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ omschrijving: 'Acryl', staatEigenMaatToe: false }));
```
(replaces the old `await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ omschrijving: 'Acryl' }));` in the `'adds a new materiaalsoort and closes the modal'` test)

```tsx
    fireEvent.click(screen.getByTestId('materiaalsoort-modal-opslaan'));
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('soort-2', { omschrijving: 'Dibond 3mm', staatEigenMaatToe: false })
    );
```
(replaces the old assertion in the `'opens a row for editing pre-filled, and updates it'` test)

Then add these 3 tests just before the final closing `});` of the `describe('MateriaalsoortenSection', ...)` block:

```tsx
  it('shows the max-afmeting and levertijd fields only when "staat eigen maat toe" is checked', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('materiaalsoorten-add'));
    expect(screen.queryByTestId('materiaalsoort-modal-max-breedte')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('materiaalsoort-modal-eigen-maat'));
    expect(screen.getByTestId('materiaalsoort-modal-max-breedte')).toBeInTheDocument();
    expect(screen.getByTestId('materiaalsoort-modal-max-hoogte')).toBeInTheDocument();
    expect(screen.getByTestId('materiaalsoort-modal-levertijd-maanden')).toBeInTheDocument();
  });

  it('saves the eigen-maat fields when adding with "staat eigen maat toe" checked', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('materiaalsoorten-add'));
    fireEvent.change(screen.getByTestId('materiaalsoort-modal-omschrijving'), { target: { value: 'Acryl' } });
    fireEvent.click(screen.getByTestId('materiaalsoort-modal-eigen-maat'));
    fireEvent.change(screen.getByTestId('materiaalsoort-modal-max-breedte'), { target: { value: '200' } });
    fireEvent.change(screen.getByTestId('materiaalsoort-modal-max-hoogte'), { target: { value: '300' } });
    fireEvent.click(screen.getByTestId('materiaalsoort-modal-opslaan'));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({
        omschrijving: 'Acryl',
        staatEigenMaatToe: true,
        maxBreedte: 200,
        maxHoogte: 300,
      })
    );
  });

  it('pre-fills the eigen-maat fields when editing a materiaalsoort that has them set', () => {
    renderSection({
      materiaalsoorten: [
        { id: 'soort-1', omschrijving: 'Veiligheidsglas', staatEigenMaatToe: true, levertijdMaandenEigenMaat: 3 },
      ],
    });
    fireEvent.click(screen.getByTestId('data-table-row-soort-1'));
    expect(screen.getByTestId('materiaalsoort-modal-eigen-maat')).toBeChecked();
    expect(screen.getByTestId('materiaalsoort-modal-levertijd-maanden')).toHaveValue(3);
  });
```

- [ ] **Step 2: Run the tests to verify the new/changed ones fail**

Run: `npm test -- MateriaalsoortenSection`
Expected: FAIL — `materiaalsoort-modal-eigen-maat` etc. are not found, and the two payload assertions don't match the current (unchanged) component output.

- [ ] **Step 3: Add the 4 fields to `Materiaalsoort`**

In `src/components/beheer/materiaalTypes.ts`, replace:

```ts
export interface Materiaalsoort {
  id: string;
  omschrijving: string;
}
```

with:

```ts
export interface Materiaalsoort {
  id: string;
  omschrijving: string;
  staatEigenMaatToe?: boolean;
  maxBreedte?: number;
  maxHoogte?: number;
  levertijdMaandenEigenMaat?: number;
}
```

- [ ] **Step 4: Add the 4 new i18n labels**

In `messages/nl.json`, insert these 4 lines right after `"materiaalsoortenVerwijderBlocked": "Deze materiaalsoort is nog gekoppeld aan materialen en kan niet verwijderd worden.",` (line 317) and before `"materialenVerwijderBlocked"`:

```json
    "materiaalsoortenLabelStaatEigenMaatToe": "Klant mag eigen maat opgeven",
    "materiaalsoortenLabelMaxBreedte": "Maximale breedte (cm, optioneel)",
    "materiaalsoortenLabelMaxHoogte": "Maximale hoogte (cm, optioneel)",
    "materiaalsoortenLabelLevertijdMaanden": "Levertijd bij eigen maat (maanden, optioneel)",
```

- [ ] **Step 5: Implement the admin UI**

Replace the full contents of `src/components/beheer/MateriaalsoortenSection.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Materiaalsoort, Materiaal } from './materiaalTypes';

interface MateriaalsoortenSectionProps {
  materiaalsoorten: Materiaalsoort[] | null;
  materialen: Materiaal[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Materiaalsoort, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Materiaalsoort, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

type ModalState = { mode: 'add' } | { mode: 'edit'; materiaalsoort: Materiaalsoort } | null;

export function MateriaalsoortenSection({
  materiaalsoorten,
  materialen,
  loadError,
  onAdd,
  onUpdate,
  onRemove,
}: MateriaalsoortenSectionProps) {
  const t = useTranslations('beheer');
  const [modalState, setModalState] = useState<ModalState>(null);
  const [omschrijving, setOmschrijving] = useState('');
  const [staatEigenMaatToe, setStaatEigenMaatToe] = useState(false);
  const [maxBreedte, setMaxBreedte] = useState('');
  const [maxHoogte, setMaxHoogte] = useState('');
  const [levertijdMaanden, setLevertijdMaanden] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const { user } = useAdminAuth();

  if (loadError) {
    return (
      <p data-testid="materiaalsoorten-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (materiaalsoorten === null) {
    return null;
  }

  function openAdd() {
    setOmschrijving('');
    setStaatEigenMaatToe(false);
    setMaxBreedte('');
    setMaxHoogte('');
    setLevertijdMaanden('');
    setActionError(null);
    setModalState({ mode: 'add' });
  }

  function openEdit(materiaalsoort: Materiaalsoort) {
    setOmschrijving(materiaalsoort.omschrijving);
    setStaatEigenMaatToe(materiaalsoort.staatEigenMaatToe ?? false);
    setMaxBreedte(materiaalsoort.maxBreedte != null ? String(materiaalsoort.maxBreedte) : '');
    setMaxHoogte(materiaalsoort.maxHoogte != null ? String(materiaalsoort.maxHoogte) : '');
    setLevertijdMaanden(
      materiaalsoort.levertijdMaandenEigenMaat != null ? String(materiaalsoort.levertijdMaandenEigenMaat) : ''
    );
    setActionError(null);
    setModalState({ mode: 'edit', materiaalsoort });
  }

  function closeModal() {
    setModalState(null);
  }

  async function handleSave() {
    if (!modalState) return;
    const data: Omit<Materiaalsoort, 'id'> = {
      omschrijving,
      staatEigenMaatToe,
      ...(staatEigenMaatToe && maxBreedte ? { maxBreedte: Number(maxBreedte) } : {}),
      ...(staatEigenMaatToe && maxHoogte ? { maxHoogte: Number(maxHoogte) } : {}),
      ...(staatEigenMaatToe && levertijdMaanden ? { levertijdMaandenEigenMaat: Number(levertijdMaanden) } : {}),
    };
    const success =
      modalState.mode === 'add' ? await onAdd(data) : await onUpdate(modalState.materiaalsoort.id, data);
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'materiaalsoort_toegevoegd' : 'materiaalsoort_gewijzigd',
        actorFromMedewerker(user)
      );
      closeModal();
    } else {
      setActionError(t('materiaalsoortenActionError'));
    }
  }

  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const inUse = (materialen ?? []).some(
      (materiaal) => materiaal.materiaalsoortId === modalState.materiaalsoort.id
    );
    if (inUse) {
      setActionError(t('materiaalsoortenVerwijderBlocked'));
      return;
    }
    const success = await onRemove(modalState.materiaalsoort.id);
    if (success) {
      void logActiviteit('materiaalsoort_verwijderd', actorFromMedewerker(user));
      closeModal();
    } else {
      setActionError(t('materiaalsoortenActionError'));
    }
  }

  const columns: Column<Materiaalsoort>[] = [{ key: 'omschrijving', label: t('materiaalsoortenColOmschrijving') }];

  return (
    <div data-testid="materiaalsoorten-section">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={openAdd}
          data-testid="materiaalsoorten-add"
          className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
        >
          {t('materiaalsoortenToevoegen')}
        </button>
      </div>
      <DataTable<Materiaalsoort>
        columns={columns}
        rows={materiaalsoorten}
        getRowId={(row) => row.id}
        onRowClick={openEdit}
        emptyLabel={t('materiaalsoortenEmpty')}
        searchPlaceholder={t('dataTableSearchPlaceholder')}
      />
      <Modal isOpen={modalState !== null} onClose={closeModal} closeLabel={t('modalClose')}>
        <div data-testid="materiaalsoort-modal" className="flex flex-col gap-2 text-sm text-white/80">
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('materiaalsoortenLabelOmschrijving')}
            <input
              type="text"
              value={omschrijving}
              onChange={(event) => setOmschrijving(event.target.value)}
              data-testid="materiaalsoort-modal-omschrijving"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>

          <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/60">
            <input
              type="checkbox"
              checked={staatEigenMaatToe}
              onChange={(event) => setStaatEigenMaatToe(event.target.checked)}
              data-testid="materiaalsoort-modal-eigen-maat"
            />
            {t('materiaalsoortenLabelStaatEigenMaatToe')}
          </label>

          {staatEigenMaatToe && (
            <>
              <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
                {t('materiaalsoortenLabelMaxBreedte')}
                <input
                  type="number"
                  value={maxBreedte}
                  onChange={(event) => setMaxBreedte(event.target.value)}
                  data-testid="materiaalsoort-modal-max-breedte"
                  className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
                {t('materiaalsoortenLabelMaxHoogte')}
                <input
                  type="number"
                  value={maxHoogte}
                  onChange={(event) => setMaxHoogte(event.target.value)}
                  data-testid="materiaalsoort-modal-max-hoogte"
                  className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
                {t('materiaalsoortenLabelLevertijdMaanden')}
                <input
                  type="number"
                  value={levertijdMaanden}
                  onChange={(event) => setLevertijdMaanden(event.target.value)}
                  data-testid="materiaalsoort-modal-levertijd-maanden"
                  className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
                />
              </label>
            </>
          )}

          {actionError && (
            <p data-testid="materiaalsoort-modal-error" className="text-xs text-red-400">
              {actionError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!omschrijving}
              data-testid="materiaalsoort-modal-opslaan"
              className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('materiaalsoortenOpslaan')}
            </button>
            {modalState?.mode === 'edit' && (
              <button
                type="button"
                onClick={handleRemove}
                data-testid="materiaalsoort-modal-verwijderen"
                className="rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('materiaalsoortenVerwijderen')}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- MateriaalsoortenSection`
Expected: PASS (all tests in the file, including the 3 new ones).

- [ ] **Step 7: Commit**

```bash
git add src/components/beheer/materiaalTypes.ts src/components/beheer/MateriaalsoortenSection.tsx messages/nl.json tests/components/beheer/MateriaalsoortenSection.test.tsx
git commit -m "feat: add eigen-maat settings (max size, lead time) to Materiaalsoort"
```

---

### Task 2: Seed data — real standard sizes and materiaalsoort defaults

**Files:**
- Modify: `src/data/materiaalsoortenSeed.ts`
- Modify: `src/data/kunstwerkenSeed.ts`
- Test: `tests/data/materiaalsoortenSeed.test.ts`
- Test: `tests/data/kunstwerkenSeed.test.ts`

**Interfaces:**
- Consumes: `Materiaalsoort` fields from Task 1.
- Produces: `MATEN_SEED` (11 entries) consumed by fresh/dev environments only (Task 9 handles the already-populated production collections by hand).

- [ ] **Step 1: Update the failing seed-value tests**

In `tests/data/materiaalsoortenSeed.test.ts`, replace the `MATERIAALSOORTEN_SEED` describe block:

```ts
describe('MATERIAALSOORTEN_SEED', () => {
  it('contains the 4 material types from the homepage, with eigen-maat settings for glas/dibond/acryl', () => {
    expect(MATERIAALSOORTEN_SEED).toEqual([
      { omschrijving: 'Veiligheidsglas', staatEigenMaatToe: true, levertijdMaandenEigenMaat: 3 },
      { omschrijving: 'Dibond', staatEigenMaatToe: true, maxBreedte: 200, maxHoogte: 300 },
      { omschrijving: 'Acryl', staatEigenMaatToe: true, maxBreedte: 200, maxHoogte: 300 },
      { omschrijving: 'Akoestische stof' },
    ]);
  });
});
```

In `tests/data/kunstwerkenSeed.test.ts`, replace the `MATEN_SEED` describe block:

```ts
describe('MATEN_SEED', () => {
  it('contains the 11 real standard sizes for veiligheidsglas/plexi/dibond', () => {
    expect(MATEN_SEED).toEqual([
      { breedte: 30, hoogte: 30 },
      { breedte: 50, hoogte: 50 },
      { breedte: 50, hoogte: 70 },
      { breedte: 50, hoogte: 100 },
      { breedte: 60, hoogte: 80 },
      { breedte: 80, hoogte: 80 },
      { breedte: 80, hoogte: 120 },
      { breedte: 100, hoogte: 100 },
      { breedte: 120, hoogte: 120 },
      { breedte: 120, hoogte: 180 },
      { breedte: 100, hoogte: 150 },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- materiaalsoortenSeed kunstwerkenSeed`
Expected: FAIL on both updated assertions (current seed arrays don't match).

- [ ] **Step 3: Update `MATERIAALSOORTEN_SEED`**

In `src/data/materiaalsoortenSeed.ts`, replace:

```ts
export const MATERIAALSOORTEN_SEED: Omit<Materiaalsoort, 'id'>[] = [
  { omschrijving: 'Veiligheidsglas' },
  { omschrijving: 'Dibond' },
  { omschrijving: 'Acryl' },
  { omschrijving: 'Akoestische stof' },
];
```

with:

```ts
export const MATERIAALSOORTEN_SEED: Omit<Materiaalsoort, 'id'>[] = [
  { omschrijving: 'Veiligheidsglas', staatEigenMaatToe: true, levertijdMaandenEigenMaat: 3 },
  { omschrijving: 'Dibond', staatEigenMaatToe: true, maxBreedte: 200, maxHoogte: 300 },
  { omschrijving: 'Acryl', staatEigenMaatToe: true, maxBreedte: 200, maxHoogte: 300 },
  { omschrijving: 'Akoestische stof' },
];
```

- [ ] **Step 4: Update `MATEN_SEED`**

In `src/data/kunstwerkenSeed.ts`, replace:

```ts
export const MATEN_SEED: Omit<Maat, 'id'>[] = [
  { breedte: 40, hoogte: 60 },
  { breedte: 60, hoogte: 90 },
  { breedte: 80, hoogte: 120 },
];
```

with:

```ts
export const MATEN_SEED: Omit<Maat, 'id'>[] = [
  { breedte: 30, hoogte: 30 },
  { breedte: 50, hoogte: 50 },
  { breedte: 50, hoogte: 70 },
  { breedte: 50, hoogte: 100 },
  { breedte: 60, hoogte: 80 },
  { breedte: 80, hoogte: 80 },
  { breedte: 80, hoogte: 120 },
  { breedte: 100, hoogte: 100 },
  { breedte: 120, hoogte: 120 },
  { breedte: 120, hoogte: 180 },
  { breedte: 100, hoogte: 150 },
];
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- materiaalsoortenSeed kunstwerkenSeed`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/materiaalsoortenSeed.ts src/data/kunstwerkenSeed.ts tests/data/materiaalsoortenSeed.test.ts tests/data/kunstwerkenSeed.test.ts
git commit -m "feat: seed the 11 real standard sizes and eigen-maat defaults"
```

---

### Task 3: Nullable price + custom-size fields on `CartItem`

**Files:**
- Modify: `src/lib/useCart.tsx`
- Test: `tests/lib/useCart.test.ts`

**Interfaces:**
- Produces: `CartItem.prijs: number | null`, `CartItem.breedte?: number`, `CartItem.hoogte?: number`, `CartValue.unpricedLineCount: number` — consumed by Tasks 4 and 5.

- [ ] **Step 1: Write the failing tests**

Add these 3 tests to `tests/lib/useCart.test.ts`, just before the final closing `});`:

```ts
  it('treats a null prijs as 0 in totalPrice, and counts it in unpricedLineCount', () => {
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    act(() => {
      result.current.addItem({ ...SAMPLE_ITEM, maatId: '', breedte: 90, hoogte: 140, prijs: null, quantity: 1 });
    });
    expect(result.current.totalPrice).toBe(0);
    expect(result.current.unpricedLineCount).toBe(1);
  });

  it('does not count a priced item in unpricedLineCount', () => {
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    act(() => {
      result.current.addItem(SAMPLE_ITEM);
    });
    expect(result.current.unpricedLineCount).toBe(0);
  });

  it('gives two different custom sizes of the same kunstwerk+materiaal separate cart lines', () => {
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    act(() => {
      result.current.addItem({ ...SAMPLE_ITEM, maatId: '', breedte: 90, hoogte: 140, prijs: null, quantity: 1 });
    });
    act(() => {
      result.current.addItem({ ...SAMPLE_ITEM, maatId: '', breedte: 70, hoogte: 110, prijs: null, quantity: 1 });
    });
    expect(result.current.items).toHaveLength(2);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- useCart`
Expected: FAIL — TypeScript/runtime errors, since `prijs: null`/`breedte`/`hoogte` aren't valid on `CartItem` yet and `unpricedLineCount` doesn't exist.

- [ ] **Step 3: Implement the changes**

Replace the full contents of `src/lib/useCart.tsx` with:

```tsx
'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const STORAGE_KEY = 'glassart-cart';

export interface CartItem {
  id: string;
  kunstwerkId: string;
  foto: string;
  omschrijving: string;
  materiaalId: string;
  materiaalLabel: string;
  maatId: string;
  maatLabel: string;
  breedte?: number;
  hoogte?: number;
  prijs: number | null;
  quantity: number;
}

type AddItemInput = Omit<CartItem, 'id'>;

interface CartValue {
  items: CartItem[];
  isHydrated: boolean;
  totalQuantity: number;
  totalPrice: number;
  unpricedLineCount: number;
  addItem: (input: AddItemInput) => void;
  removeItem: (id: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartValue | null>(null);

function makeItemId(
  kunstwerkId: string,
  materiaalId: string,
  maatId: string,
  breedte?: number,
  hoogte?: number
): string {
  if (maatId) {
    return `${kunstwerkId}__${materiaalId}__${maatId}`;
  }
  return `${kunstwerkId}__${materiaalId}__custom__${breedte}x${hoogte}`;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setItems(JSON.parse(stored));
      } catch {
        setItems([]);
      }
    }
    setIsHydrated(true);
  }, []);

  const addItem = useCallback((input: AddItemInput) => {
    setItems((current) => {
      const id = makeItemId(input.kunstwerkId, input.materiaalId, input.maatId, input.breedte, input.hoogte);
      const existing = current.find((item) => item.id === id);
      const next = existing
        ? current.map((item) =>
            item.id === id ? { ...item, quantity: item.quantity + input.quantity } : item
          )
        : [...current, { id, ...input }];
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((current) => {
      const next = current.filter((item) => item.id !== id);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  const totalQuantity = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items]
  );

  const totalPrice = useMemo(
    () => items.reduce((sum, item) => sum + (item.prijs ?? 0) * item.quantity, 0),
    [items]
  );

  const unpricedLineCount = useMemo(
    () => items.filter((item) => item.prijs === null).length,
    [items]
  );

  const value = useMemo(
    () => ({ items, isHydrated, totalQuantity, totalPrice, unpricedLineCount, addItem, removeItem, clear }),
    [items, isHydrated, totalQuantity, totalPrice, unpricedLineCount, addItem, removeItem, clear]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- useCart`
Expected: PASS (all tests, including the 3 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/useCart.tsx tests/lib/useCart.test.ts
git commit -m "feat: support nullable price and custom-size cart lines"
```

---

### Task 4: ProductModal — the "eigen maat" ordering flow

**Files:**
- Modify: `src/lib/logActiviteit.ts`
- Modify: `src/components/ProductModal.tsx`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/fr.json`, `messages/de.json` (all in the `cart` object)
- Test: `tests/components/ProductModal.test.tsx`

**Interfaces:**
- Consumes: `Materiaalsoort.staatEigenMaatToe`/`maxBreedte`/`maxHoogte`/`levertijdMaandenEigenMaat` (Task 1), `CartItem.breedte`/`hoogte`/nullable `prijs` (Task 3).
- Produces: `'mandje_eigen_maat_toegevoegd'` activiteit event, consumed nowhere else (logging only).

- [ ] **Step 1: Add the new `ActiviteitType` member**

In `src/lib/logActiviteit.ts`, change:

```ts
  | 'bedrijfsgegevens_gewijzigd';
```

to:

```ts
  | 'bedrijfsgegevens_gewijzigd'
  | 'mandje_eigen_maat_toegevoegd';
```

- [ ] **Step 2: Add the new `cart` i18n keys to all 4 locale files**

In `messages/nl.json`, replace:

```json
    "added": "Toegevoegd!",
    "close": "Sluiten"
  },
```

with:

```json
    "added": "Toegevoegd!",
    "close": "Sluiten",
    "customSizeOption": "Eigen maat opgeven",
    "customWidthLabel": "Breedte (cm)",
    "customHeightLabel": "Hoogte (cm)",
    "customSizeSuffix": " (eigen maat)",
    "customSizeMaxError": "Deze maat is te groot. Maximaal {maxBreedte}×{maxHoogte} cm.",
    "customSizeLeadTime": "Let op: bij deze maat is de levertijd minimaal {months, plural, one {# maand} other {# maanden}}.",
    "priceOnRequest": "Prijs op aanvraag"
  },
```

In `messages/en.json`, replace:

```json
    "added": "Added!",
    "close": "Close"
  },
```

with:

```json
    "added": "Added!",
    "close": "Close",
    "customSizeOption": "Enter custom size",
    "customWidthLabel": "Width (cm)",
    "customHeightLabel": "Height (cm)",
    "customSizeSuffix": " (custom size)",
    "customSizeMaxError": "This size is too large. Maximum {maxBreedte}×{maxHoogte} cm.",
    "customSizeLeadTime": "Note: this size has a lead time of at least {months, plural, one {# month} other {# months}}.",
    "priceOnRequest": "Price on request"
  },
```

In `messages/fr.json`, replace:

```json
    "added": "Ajouté !",
    "close": "Fermer"
  },
```

with:

```json
    "added": "Ajouté !",
    "close": "Fermer",
    "customSizeOption": "Indiquer une taille personnalisée",
    "customWidthLabel": "Largeur (cm)",
    "customHeightLabel": "Hauteur (cm)",
    "customSizeSuffix": " (taille personnalisée)",
    "customSizeMaxError": "Cette taille est trop grande. Maximum {maxBreedte}×{maxHoogte} cm.",
    "customSizeLeadTime": "Attention : cette taille a un délai de livraison d'au moins {months, plural, one {# mois} other {# mois}}.",
    "priceOnRequest": "Prix sur demande"
  },
```

In `messages/de.json`, replace:

```json
    "added": "Hinzugefügt!",
    "close": "Schließen"
  },
```

with:

```json
    "added": "Hinzugefügt!",
    "close": "Schließen",
    "customSizeOption": "Eigene Größe angeben",
    "customWidthLabel": "Breite (cm)",
    "customHeightLabel": "Höhe (cm)",
    "customSizeSuffix": " (individuelle Größe)",
    "customSizeMaxError": "Diese Größe ist zu groß. Maximal {maxBreedte}×{maxHoogte} cm.",
    "customSizeLeadTime": "Achtung: bei dieser Größe beträgt die Lieferzeit mindestens {months, plural, one {# Monat} other {# Monate}}.",
    "priceOnRequest": "Preis auf Anfrage"
  },
```

- [ ] **Step 3: Write the failing tests**

Add these tests to `tests/components/ProductModal.test.tsx`, just before the final closing `});`. They rely on `MATERIAALSOORTEN[1]` (`soort-2`, `'Acryl'`, linked to `mat-2`) being given `staatEigenMaatToe`/`maxBreedte`/`maxHoogte`, so first add a local override fixture at the top of the `describe('ProductModal', ...)` block (right after the `describe('ProductModal', () => {` line):

```tsx
  const MATERIAALSOORTEN_MET_EIGEN_MAAT: Materiaalsoort[] = [
    { id: 'soort-1', omschrijving: 'Veiligheidsglas', staatEigenMaatToe: true, levertijdMaandenEigenMaat: 3 },
    { id: 'soort-2', omschrijving: 'Acryl', staatEigenMaatToe: true, maxBreedte: 200, maxHoogte: 300 },
  ];
```

Then add:

```tsx
  it('does not offer an "eigen maat opgeven" option for a materiaal whose soort does not allow it', () => {
    renderModal();
    const options = Array.from(
      screen.getByTestId('product-modal-maat').querySelectorAll('option')
    ).map((option) => option.textContent);
    expect(options).not.toContain('Eigen maat opgeven');
  });

  it('offers and selects "eigen maat opgeven", showing breedte/hoogte inputs and "Prijs op aanvraag"', () => {
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <ProductModal
              kunstwerk={KUNSTWERK}
              materialen={MATERIALEN}
              maten={MATEN}
              materiaalsoorten={MATERIAALSOORTEN_MET_EIGEN_MAAT}
              onClose={() => {}}
            />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );
    fireEvent.change(screen.getByTestId('product-modal-materiaal'), { target: { value: 'mat-2' } });
    fireEvent.change(screen.getByTestId('product-modal-maat'), { target: { value: '__eigen_maat__' } });
    expect(screen.getByTestId('product-modal-maat-custom-breedte')).toBeInTheDocument();
    expect(screen.getByTestId('product-modal-maat-custom-hoogte')).toBeInTheDocument();
    expect(screen.getByTestId('product-modal-prijs')).toHaveTextContent('Prijs op aanvraag');
    expect(screen.getByTestId('product-modal-confirm')).toBeDisabled();
  });

  it('shows a lead-time warning and no max error for an oversized custom veiligheidsglas size', () => {
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <ProductModal
              kunstwerk={KUNSTWERK}
              materialen={MATERIALEN}
              maten={MATEN}
              materiaalsoorten={MATERIAALSOORTEN_MET_EIGEN_MAAT}
              onClose={() => {}}
            />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );
    fireEvent.change(screen.getByTestId('product-modal-maat'), { target: { value: '__eigen_maat__' } });
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-breedte'), { target: { value: '400' } });
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-hoogte'), { target: { value: '500' } });
    expect(screen.getByTestId('product-modal-maat-levertijd-warning')).toHaveTextContent(
      'Let op: bij deze maat is de levertijd minimaal 3 maanden.'
    );
    expect(screen.queryByTestId('product-modal-maat-custom-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('product-modal-confirm')).not.toBeDisabled();
  });

  it('shows a max-size error and disables confirm for an oversized custom Acryl size', () => {
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <ProductModal
              kunstwerk={KUNSTWERK}
              materialen={MATERIALEN}
              maten={MATEN}
              materiaalsoorten={MATERIAALSOORTEN_MET_EIGEN_MAAT}
              onClose={() => {}}
            />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );
    fireEvent.change(screen.getByTestId('product-modal-materiaal'), { target: { value: 'mat-2' } });
    fireEvent.change(screen.getByTestId('product-modal-maat'), { target: { value: '__eigen_maat__' } });
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-breedte'), { target: { value: '250' } });
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-hoogte'), { target: { value: '280' } });
    expect(screen.getByTestId('product-modal-maat-custom-error')).toHaveTextContent(
      'Deze maat is te groot. Maximaal 200×300 cm.'
    );
    expect(screen.getByTestId('product-modal-confirm')).toBeDisabled();
  });

  it('adds a valid custom-size line to the cart with a null price and logs mandje_eigen_maat_toegevoegd', async () => {
    vi.useRealTimers();
    function Probe() {
      const { items } = useCart();
      return <div data-testid="probe">{JSON.stringify(items)}</div>;
    }
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <ProductModal
              kunstwerk={KUNSTWERK}
              materialen={MATERIALEN}
              maten={MATEN}
              materiaalsoorten={MATERIAALSOORTEN_MET_EIGEN_MAAT}
              onClose={() => {}}
            />
            <Probe />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );
    fireEvent.change(screen.getByTestId('product-modal-maat'), { target: { value: '__eigen_maat__' } });
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-breedte'), { target: { value: '90' } });
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-hoogte'), { target: { value: '140' } });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.click(screen.getByTestId('product-modal-confirm'));

    const items = JSON.parse(screen.getByTestId('probe').textContent ?? '[]');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kunstwerkId: 'kw-1',
      materiaalId: 'mat-1',
      maatId: '',
      breedte: 90,
      hoogte: 140,
      maatLabel: '90×140 cm (eigen maat)',
      prijs: null,
      quantity: 1,
    });
    expect(logActiviteitMock).toHaveBeenCalledWith('mandje_eigen_maat_toegevoegd', {
      id: null,
      email: 'Onbekend',
      naam: 'Onbekend',
    });
  });

  it('resets to a standard maat when switching to a materiaal whose soort does not allow eigen maat', () => {
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <ProductModal
              kunstwerk={KUNSTWERK}
              materialen={MATERIALEN}
              maten={MATEN}
              materiaalsoorten={MATERIAALSOORTEN_MET_EIGEN_MAAT}
              onClose={() => {}}
            />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );
    fireEvent.change(screen.getByTestId('product-modal-materiaal'), { target: { value: 'mat-2' } });
    fireEvent.change(screen.getByTestId('product-modal-maat'), { target: { value: '__eigen_maat__' } });
    expect(screen.getByTestId('product-modal-maat-custom-breedte')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('product-modal-materiaal'), { target: { value: 'mat-1' } });
    expect(screen.queryByTestId('product-modal-maat-custom-breedte')).not.toBeInTheDocument();
    expect(screen.getByTestId('product-modal-maat')).toHaveValue('maat-1');
  });
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm test -- ProductModal`
Expected: FAIL — none of the `product-modal-maat-custom-*` testids or `t('customSizeOption')` etc. exist yet.

- [ ] **Step 5: Implement the eigen-maat flow**

Replace the full contents of `src/components/ProductModal.tsx` with:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useCart } from '@/lib/useCart';
import { useCustomerAuth } from '@/lib/useCustomerAuth';
import { logActiviteit, actorFromCustomer } from '@/lib/logActiviteit';
import { useOverlayDismiss } from '@/lib/useOverlayDismiss';
import { resolveKunstwerkOmschrijving } from '@/lib/resolveKunstwerkOmschrijving';
import { formatCurrency } from '@/lib/formatCurrency';
import { WatermarkedImage } from './WatermarkedImage';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort } from './beheer/materiaalTypes';

const CONFIRM_FEEDBACK_MS = 600;
const CUSTOM_MAAT_VALUE = '__eigen_maat__';

function materiaalLabel(materiaal: Materiaal, materiaalsoortNaam: string): string {
  return `${materiaal.materiaaldikte}mm ${materiaalsoortNaam}`;
}

function maatLabel(maat: Maat): string {
  return `${maat.breedte}×${maat.hoogte} cm`;
}

function withinMax(breedte: number, hoogte: number, soort: Materiaalsoort | undefined): boolean {
  if (!soort || soort.maxBreedte == null || soort.maxHoogte == null) {
    return true;
  }
  const smallest = Math.min(breedte, hoogte);
  const largest = Math.max(breedte, hoogte);
  return smallest <= soort.maxBreedte && largest <= soort.maxHoogte;
}

interface ProductModalProps {
  kunstwerk: Kunstwerk | null;
  materialen: Materiaal[] | null;
  maten: Maat[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  onClose: () => void;
}

export function ProductModal({ kunstwerk, materialen, maten, materiaalsoorten, onClose }: ProductModalProps) {
  const t = useTranslations('cart');
  const locale = useLocale();
  const [materiaalId, setMateriaalId] = useState('');
  const [maatId, setMaatId] = useState('');
  const [customBreedte, setCustomBreedte] = useState('');
  const [customHoogte, setCustomHoogte] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const { addItem } = useCart();
  const { user } = useCustomerAuth();
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!kunstwerk) {
      return;
    }
    setMateriaalId(kunstwerk.materiaalIds[0] ?? '');
    setMaatId(kunstwerk.maatIds[0] ?? '');
    setCustomBreedte('');
    setCustomHoogte('');
    setQuantity(1);
    setIsConfirmed(false);
  }, [kunstwerk]);

  // Ensure a pending "close after confirm" timer never fires for a stale
  // kunstwerk: clear it whenever `kunstwerk` changes, and on unmount.
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };
  }, [kunstwerk]);

  useOverlayDismiss({
    isOpen: kunstwerk !== null,
    onClose,
    containerRef: modalRef,
    initialFocusRef: closeButtonRef,
  });

  if (!kunstwerk) {
    return null;
  }

  const beschikbareMaterialen = (materialen ?? []).filter((materiaal) =>
    kunstwerk.materiaalIds.includes(materiaal.id)
  );
  const beschikbareMaten = (maten ?? []).filter((maat) => kunstwerk.maatIds.includes(maat.id));
  const materiaalsoortNaamById = new Map(
    (materiaalsoorten ?? []).map((soort) => [soort.id, soort.omschrijving])
  );
  function resolvedMateriaalLabel(materiaal: Materiaal): string {
    return materiaalLabel(materiaal, materiaalsoortNaamById.get(materiaal.materiaalsoortId) ?? materiaal.materiaalsoortId);
  }
  const geselecteerdMateriaal = beschikbareMaterialen.find((materiaal) => materiaal.id === materiaalId);
  const geselecteerdSoort = (materiaalsoorten ?? []).find(
    (soort) => soort.id === geselecteerdMateriaal?.materiaalsoortId
  );
  const isCustomSize = maatId === CUSTOM_MAAT_VALUE;
  const prijsRegel = !isCustomSize
    ? kunstwerk.prijzen.find((regel) => regel.materiaalId === materiaalId && regel.maatId === maatId)
    : undefined;
  const omschrijving = resolveKunstwerkOmschrijving(kunstwerk, locale);

  const customBreedteNum = Number(customBreedte);
  const customHoogteNum = Number(customHoogte);
  const customSizeFilledIn =
    customBreedte !== '' && customHoogte !== '' && customBreedteNum > 0 && customHoogteNum > 0;
  const customSizeExceedsMax = customSizeFilledIn && !withinMax(customBreedteNum, customHoogteNum, geselecteerdSoort);
  const customSizeValid = customSizeFilledIn && !customSizeExceedsMax;

  const canConfirm = isCustomSize ? customSizeValid : Boolean(prijsRegel);

  function handleMateriaalChange(nextMateriaalId: string) {
    setMateriaalId(nextMateriaalId);
    const nextMateriaal = beschikbareMaterialen.find((materiaal) => materiaal.id === nextMateriaalId);
    const nextSoort = (materiaalsoorten ?? []).find((soort) => soort.id === nextMateriaal?.materiaalsoortId);
    if (isCustomSize && !nextSoort?.staatEigenMaatToe) {
      setMaatId(beschikbareMaten[0]?.id ?? '');
    }
  }

  function handleConfirm() {
    if (isConfirmed || !canConfirm || !kunstwerk) {
      return;
    }
    const gekozenMateriaal = beschikbareMaterialen.find((materiaal) => materiaal.id === materiaalId);
    if (!gekozenMateriaal) {
      return;
    }
    if (isCustomSize) {
      addItem({
        kunstwerkId: kunstwerk.id,
        foto: kunstwerk.foto,
        omschrijving,
        materiaalId,
        materiaalLabel: resolvedMateriaalLabel(gekozenMateriaal),
        maatId: '',
        maatLabel: `${customBreedteNum}×${customHoogteNum} cm${t('customSizeSuffix')}`,
        breedte: customBreedteNum,
        hoogte: customHoogteNum,
        prijs: null,
        quantity,
      });
      void logActiviteit('mandje_eigen_maat_toegevoegd', actorFromCustomer(user));
    } else {
      const gekozenMaat = beschikbareMaten.find((maat) => maat.id === maatId);
      if (!gekozenMaat || !prijsRegel) {
        return;
      }
      addItem({
        kunstwerkId: kunstwerk.id,
        foto: kunstwerk.foto,
        omschrijving,
        materiaalId,
        materiaalLabel: resolvedMateriaalLabel(gekozenMateriaal),
        maatId,
        maatLabel: maatLabel(gekozenMaat),
        prijs: prijsRegel.prijs,
        quantity,
      });
      void logActiviteit('mandje_toegevoegd', actorFromCustomer(user));
    }
    setIsConfirmed(true);
    closeTimeoutRef.current = setTimeout(() => {
      closeTimeoutRef.current = null;
      onClose();
    }, CONFIRM_FEEDBACK_MS);
  }

  return (
    <div
      ref={modalRef}
      data-testid="product-modal"
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        data-testid="product-modal-backdrop"
        onClick={onClose}
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
      />
      <div className="relative z-10 grid w-full max-w-2xl grid-cols-1 overflow-hidden rounded-lg border border-white/10 bg-charcoal sm:grid-cols-2">
        <button
          ref={closeButtonRef}
          type="button"
          data-testid="product-modal-close"
          aria-label={t('close')}
          onClick={onClose}
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white/80 hover:text-white"
        >
          ×
        </button>
        <WatermarkedImage src={kunstwerk.foto} alt={omschrijving} className="h-56 w-full sm:h-full" />
        <div className="flex flex-col gap-4 p-6">
          <p data-testid="product-modal-omschrijving" className="text-sm leading-relaxed text-white/80">
            {omschrijving}
          </p>
          <label className="flex flex-col gap-1 text-[0.65rem] uppercase tracking-wide text-white/60">
            {t('material')}
            <select
              data-testid="product-modal-materiaal"
              value={materiaalId}
              onChange={(event) => handleMateriaalChange(event.target.value)}
              className="rounded-sm bg-black/40 px-2 py-1.5 text-sm text-white"
            >
              {beschikbareMaterialen.map((materiaal) => (
                <option key={materiaal.id} value={materiaal.id}>
                  {resolvedMateriaalLabel(materiaal)}
                </option>
              ))}
            </select>
            {geselecteerdMateriaal && (
              <span
                data-testid="product-modal-materiaal-omschrijving"
                className="pt-1 text-[0.7rem] normal-case tracking-normal text-white/50"
              >
                {geselecteerdMateriaal.omschrijving}
              </span>
            )}
          </label>
          <label className="flex flex-col gap-1 text-[0.65rem] uppercase tracking-wide text-white/60">
            {t('size')}
            <select
              data-testid="product-modal-maat"
              value={maatId}
              onChange={(event) => setMaatId(event.target.value)}
              className="rounded-sm bg-black/40 px-2 py-1.5 text-sm text-white"
            >
              {beschikbareMaten.map((maat) => (
                <option key={maat.id} value={maat.id}>
                  {maatLabel(maat)}
                </option>
              ))}
              {geselecteerdSoort?.staatEigenMaatToe && (
                <option value={CUSTOM_MAAT_VALUE}>{t('customSizeOption')}</option>
              )}
            </select>
          </label>
          {isCustomSize && (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <label className="flex flex-1 flex-col gap-1 text-[0.65rem] uppercase tracking-wide text-white/60">
                  {t('customWidthLabel')}
                  <input
                    type="number"
                    data-testid="product-modal-maat-custom-breedte"
                    value={customBreedte}
                    onChange={(event) => setCustomBreedte(event.target.value)}
                    className="rounded-sm bg-black/40 px-2 py-1.5 text-sm text-white"
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1 text-[0.65rem] uppercase tracking-wide text-white/60">
                  {t('customHeightLabel')}
                  <input
                    type="number"
                    data-testid="product-modal-maat-custom-hoogte"
                    value={customHoogte}
                    onChange={(event) => setCustomHoogte(event.target.value)}
                    className="rounded-sm bg-black/40 px-2 py-1.5 text-sm text-white"
                  />
                </label>
              </div>
              {customSizeExceedsMax && (
                <p data-testid="product-modal-maat-custom-error" className="text-xs text-red-400">
                  {t('customSizeMaxError', {
                    maxBreedte: geselecteerdSoort?.maxBreedte ?? 0,
                    maxHoogte: geselecteerdSoort?.maxHoogte ?? 0,
                  })}
                </p>
              )}
              {Boolean(geselecteerdSoort?.levertijdMaandenEigenMaat) && (
                <p data-testid="product-modal-maat-levertijd-warning" className="text-xs text-amber-400">
                  {t('customSizeLeadTime', { months: geselecteerdSoort?.levertijdMaandenEigenMaat ?? 0 })}
                </p>
              )}
            </div>
          )}
          {isCustomSize ? (
            <p data-testid="product-modal-prijs" className="text-sm text-white/80">
              {t('priceOnRequest')}
            </p>
          ) : (
            prijsRegel && (
              <p data-testid="product-modal-prijs" className="text-sm text-white/80">
                {formatCurrency(prijsRegel.prijs)}
              </p>
            )
          )}
          <div className="flex items-center justify-between gap-2 text-sm text-white/80">
            <span className="text-[0.65rem] uppercase tracking-wide text-white/60">{t('quantity')}</span>
            <div className="flex h-10 items-center overflow-hidden rounded-full border border-white/20">
              <button
                type="button"
                data-testid="product-modal-quantity-minus"
                onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                className="flex h-full w-9 items-center justify-center text-white/80 transition hover:bg-gold hover:text-ink"
              >
                −
              </button>
              <span data-testid="product-modal-quantity-value" className="w-9 text-center">
                {quantity}
              </span>
              <button
                type="button"
                data-testid="product-modal-quantity-plus"
                onClick={() => setQuantity((current) => current + 1)}
                className="flex h-full w-9 items-center justify-center text-white/80 transition hover:bg-gold hover:text-ink"
              >
                +
              </button>
            </div>
          </div>
          <button
            type="button"
            data-testid="product-modal-confirm"
            onClick={handleConfirm}
            disabled={isConfirmed || !canConfirm}
            className={`rounded-sm px-4 py-2.5 text-xs tracking-[0.15em] transition disabled:opacity-40 ${
              isConfirmed ? 'cursor-default bg-green-500 text-white' : 'btn-gold'
            }`}
          >
            {isConfirmed ? t('added') : t('confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- ProductModal`
Expected: PASS (all tests, old and new).

- [ ] **Step 7: Commit**

```bash
git add src/lib/logActiviteit.ts src/components/ProductModal.tsx messages/nl.json messages/en.json messages/fr.json messages/de.json tests/components/ProductModal.test.tsx
git commit -m "feat: let customers request a custom size in the order popup"
```

---

### Task 5: CartPanel — custom-size display, order write, offerte note

**Files:**
- Modify: `src/components/CartPanel.tsx`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/fr.json`, `messages/de.json` (`cart.customSizeNote`)
- Test: `tests/components/CartPanel.test.tsx`

**Interfaces:**
- Consumes: `CartValue.unpricedLineCount` (Task 3), `CartItem.prijs: number | null` / `breedte` / `hoogte` (Task 3).

- [ ] **Step 1: Add the `customSizeNote` key to all 4 locale files**

In `messages/nl.json`, add `"customSizeNote"` right after the `"priceOnRequest"` key added in Task 4 (inside the `cart` object):

```json
    "priceOnRequest": "Prijs op aanvraag",
    "customSizeNote": "{count, plural, one {+ # artikel, prijs volgt na offerte} other {+ # artikelen, prijs volgt na offerte}}"
  },
```

In `messages/en.json`:

```json
    "priceOnRequest": "Price on request",
    "customSizeNote": "{count, plural, one {+ # item, price to follow after quote} other {+ # items, price to follow after quote}}"
  },
```

In `messages/fr.json`:

```json
    "priceOnRequest": "Prix sur demande",
    "customSizeNote": "{count, plural, one {+ # article, prix à confirmer après devis} other {+ # articles, prix à confirmer après devis}}"
  },
```

In `messages/de.json`:

```json
    "priceOnRequest": "Preis auf Anfrage",
    "customSizeNote": "{count, plural, one {+ # Artikel, Preis folgt nach Angebot} other {+ # Artikel, Preis folgt nach Angebot}}"
  },
```

- [ ] **Step 2: Write the failing tests**

Add these tests to `tests/components/CartPanel.test.tsx`, just before the final closing `});`:

```tsx
  it('shows "Prijs op aanvraag" for a custom-size item and excludes it from the total', () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));

    // seeding the second (custom) item requires a second Seed button; render it inline instead
  });

  it('shows the unpriced-items note and excludes a custom-size item from the total', () => {
    function SeedCustom() {
      const { addItem } = useCart();
      return (
        <button
          type="button"
          data-testid="seed-custom-cart"
          onClick={() =>
            addItem({
              kunstwerkId: 'kw-2',
              foto: 'https://example.com/kw-2.jpg',
              omschrijving: 'Eigen maat paneel',
              materiaalId: 'mat-2',
              materiaalLabel: '3mm — Acryl',
              maatId: '',
              maatLabel: '90×140 cm (eigen maat)',
              breedte: 90,
              hoogte: 140,
              prijs: null,
              quantity: 1,
            })
          }
        >
          Seed custom
        </button>
      );
    }
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <SeedCustom />
            <CartPanel />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );
    fireEvent.click(screen.getByTestId('seed-custom-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));

    expect(screen.getByTestId('cart-total')).toHaveTextContent('€ 0,00');
    expect(screen.getByTestId('cart-unpriced-note')).toHaveTextContent('+ 1 artikel, prijs volgt na offerte');
    expect(screen.getByText('Prijs op aanvraag')).toBeInTheDocument();
  });

  it('writes breedte/hoogte and a null prijs to the bestelline for a custom-size cart item', async () => {
    function SeedCustom() {
      const { addItem } = useCart();
      return (
        <button
          type="button"
          data-testid="seed-custom-cart"
          onClick={() =>
            addItem({
              kunstwerkId: 'kw-2',
              foto: 'https://example.com/kw-2.jpg',
              omschrijving: 'Eigen maat paneel',
              materiaalId: 'mat-2',
              materiaalLabel: '3mm — Acryl',
              maatId: '',
              maatLabel: '90×140 cm (eigen maat)',
              breedte: 90,
              hoogte: 140,
              prijs: null,
              quantity: 1,
            })
          }
        >
          Seed custom
        </button>
      );
    }
    addDocMock.mockResolvedValueOnce({ id: 'header-1' }).mockResolvedValue({ id: 'line-1' });
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <SeedCustom />
            <CartPanel />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );
    fireEvent.click(screen.getByTestId('seed-custom-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));

    await screen.findByTestId('cart-order-confirmation');
    expect(addDocMock).toHaveBeenNthCalledWith(
      2,
      { path: ['bestelheaders', 'header-1', 'bestellines'] },
      { kunstwerkId: 'kw-2', maatId: '', materiaalId: 'mat-2', prijs: null, quantity: 1, breedte: 90, hoogte: 140 }
    );
  });
```

Remove the placeholder first test (`'shows "Prijs op aanvraag" for a custom-size item and excludes it from the total'`) you just added — it was a scaffolding note, not a real test; the two tests below it cover this behavior. Also add `useCart` to the existing `import { CartProvider, useCart } from '@/lib/useCart';` import at the top of the file if not already imported (it already is, since `Seed` uses it).

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- CartPanel`
Expected: FAIL — `cart-unpriced-note` doesn't exist, the bestelline write doesn't include `breedte`/`hoogte`, and the total doesn't correctly stay at `€ 0,00` (it does today by coincidence of `?? 0` not existing yet — this will fail once `unpricedLineCount`/note assertions are added).

- [ ] **Step 4: Implement the changes**

In `src/components/CartPanel.tsx`, change the destructuring line:

```tsx
  const { items, isHydrated, totalQuantity, totalPrice, removeItem, clear } = useCart();
```

to:

```tsx
  const { items, isHydrated, totalQuantity, totalPrice, unpricedLineCount, removeItem, clear } = useCart();
```

Change the bestelline write inside `handlePlaceOrder`:

```tsx
      await Promise.all(
        items.map((item) =>
          addDoc(collection(db, 'bestelheaders', headerDoc.id, 'bestellines'), {
            kunstwerkId: item.kunstwerkId,
            maatId: item.maatId,
            materiaalId: item.materiaalId,
            prijs: item.prijs,
            quantity: item.quantity,
          })
        )
      );
```

to:

```tsx
      await Promise.all(
        items.map((item) =>
          addDoc(collection(db, 'bestelheaders', headerDoc.id, 'bestellines'), {
            kunstwerkId: item.kunstwerkId,
            maatId: item.maatId,
            materiaalId: item.materiaalId,
            prijs: item.prijs,
            quantity: item.quantity,
            ...(item.breedte != null ? { breedte: item.breedte } : {}),
            ...(item.hoogte != null ? { hoogte: item.hoogte } : {}),
          })
        )
      );
```

Change the per-item price line:

```tsx
                          <p className="text-white/50">{formatCurrency(item.prijs * item.quantity)}</p>
```

to:

```tsx
                          <p className="text-white/50">
                            {item.prijs !== null ? formatCurrency(item.prijs * item.quantity) : t('priceOnRequest')}
                          </p>
```

Change the total footer block:

```tsx
                  {items.length > 0 && (
                    <p data-testid="cart-total" className="flex justify-between text-sm text-white/80">
                      <span>{t('total')}</span>
                      <span>{formatCurrency(totalPrice)}</span>
                    </p>
                  )}
```

to:

```tsx
                  {items.length > 0 && (
                    <p data-testid="cart-total" className="flex justify-between text-sm text-white/80">
                      <span>{t('total')}</span>
                      <span>{formatCurrency(totalPrice)}</span>
                    </p>
                  )}
                  {unpricedLineCount > 0 && (
                    <p data-testid="cart-unpriced-note" className="text-xs text-white/60">
                      {t('customSizeNote', { count: unpricedLineCount })}
                    </p>
                  )}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- CartPanel`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/CartPanel.tsx messages/nl.json messages/en.json messages/fr.json messages/de.json tests/components/CartPanel.test.tsx
git commit -m "feat: show price-on-request and offerte note for custom-size cart items"
```

---

### Task 6: Customer order history — nullable price, custom-size fallback

**Files:**
- Modify: `src/lib/useAllOrders.tsx`
- Modify: `src/components/account/AccountOrderModal.tsx`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/fr.json`, `messages/de.json` (`accountPage.orders.modalLinePriceOnRequest`)
- Test: `tests/lib/useAllOrders.test.tsx`
- Test: `tests/components/account/AccountOrderModal.test.tsx` (new file)

**Interfaces:**
- Produces: `DisplayOrderLine.prijs: number | null`, `DisplayOrderLine.breedte?: number`, `DisplayOrderLine.hoogte?: number`.

- [ ] **Step 1: Add the `modalLinePriceOnRequest` key to all 4 locale files**

In `messages/nl.json`, inside `accountPage.orders`, replace:

```json
      "modalLineUnknown": "Onbekend artikel",
      "loadError": "Bestellingen konden niet worden geladen. Probeer het later opnieuw."
```

with:

```json
      "modalLineUnknown": "Onbekend artikel",
      "modalLinePriceOnRequest": "Prijs op aanvraag",
      "loadError": "Bestellingen konden niet worden geladen. Probeer het later opnieuw."
```

In `messages/en.json`, inside `accountPage.orders`, replace:

```json
      "modalLineUnknown": "Unknown item",
      "loadError": "Couldn't load your orders. Please try again later."
```

with:

```json
      "modalLineUnknown": "Unknown item",
      "modalLinePriceOnRequest": "Price on request",
      "loadError": "Couldn't load your orders. Please try again later."
```

In `messages/fr.json`, inside `accountPage.orders`, replace:

```json
      "modalLineUnknown": "Article inconnu",
      "loadError": "Impossible de charger vos commandes. Veuillez réessayer plus tard."
```

with:

```json
      "modalLineUnknown": "Article inconnu",
      "modalLinePriceOnRequest": "Prix sur demande",
      "loadError": "Impossible de charger vos commandes. Veuillez réessayer plus tard."
```

In `messages/de.json`, inside `accountPage.orders`, replace:

```json
      "modalLineUnknown": "Unbekannter Artikel",
      "loadError": "Bestellungen konnten nicht geladen werden. Bitte versuchen Sie es später erneut."
```

with:

```json
      "modalLineUnknown": "Unbekannter Artikel",
      "modalLinePriceOnRequest": "Preis auf Anfrage",
      "loadError": "Bestellungen konnten nicht geladen werden. Bitte versuchen Sie es später erneut."
```

- [ ] **Step 2: Write the failing test for `useAllOrders`**

Add this test to `tests/lib/useAllOrders.test.tsx`, just before the final closing `});`:

```tsx
  it('maps a missing prijs to null and passes through breedte/hoogte for a custom-size line', async () => {
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
                bestelnr: 'GD-00001',
                besteldatum: { toDate: () => new Date('2026-07-01T14:30:00') },
                status: 'Te beoordelen',
              }),
            },
          ],
        });
      }
      if (name === 'bestelheaders/header-1/bestellines') {
        return Promise.resolve({
          docs: [{ id: 'line-1', data: () => ({ maatId: '', breedte: 90, hoogte: 140, quantity: 1 }) }],
        });
      }
      return Promise.resolve({ docs: [] });
    });

    const { result } = renderHook(() => useAllOrders(), { wrapper });
    await waitFor(() => expect(result.current.orders).toHaveLength(1));
    const line = result.current.orders[0].lines?.[0];
    expect(line).toMatchObject({ prijs: null, breedte: 90, hoogte: 140 });
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- useAllOrders`
Expected: FAIL — `line.prijs` is currently `0` (not `null`) and `breedte`/`hoogte` are `undefined` on the mapped object (no `toMatchObject` match).

- [ ] **Step 4: Update `useAllOrders.tsx`**

In `src/lib/useAllOrders.tsx`, replace:

```ts
export interface DisplayOrderLine {
  id: string;
  kunstwerkId: string | null;
  maatId: string | null;
  materiaalId: string | null;
  prijs: number;
  quantity: number;
}
```

with:

```ts
export interface DisplayOrderLine {
  id: string;
  kunstwerkId: string | null;
  maatId: string | null;
  materiaalId: string | null;
  breedte?: number;
  hoogte?: number;
  prijs: number | null;
  quantity: number;
}
```

Replace:

```ts
            const lines: DisplayOrderLine[] = linesSnapshot.docs.map((lineDoc) => {
              const lineData = lineDoc.data();
              return {
                id: lineDoc.id,
                kunstwerkId: lineData.kunstwerkId ?? null,
                maatId: lineData.maatId ?? null,
                materiaalId: lineData.materiaalId ?? null,
                prijs: lineData.prijs ?? 0,
                quantity: lineData.quantity ?? 0,
              };
            });
```

with:

```ts
            const lines: DisplayOrderLine[] = linesSnapshot.docs.map((lineDoc) => {
              const lineData = lineDoc.data();
              return {
                id: lineDoc.id,
                kunstwerkId: lineData.kunstwerkId ?? null,
                maatId: lineData.maatId ?? null,
                materiaalId: lineData.materiaalId ?? null,
                breedte: lineData.breedte,
                hoogte: lineData.hoogte,
                prijs: lineData.prijs ?? null,
                quantity: lineData.quantity ?? 0,
              };
            });
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- useAllOrders`
Expected: PASS.

- [ ] **Step 6: Write the new `AccountOrderModal.test.tsx` file (TDD for the component change)**

Create `tests/components/account/AccountOrderModal.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AccountOrderModal } from '@/components/account/AccountOrderModal';
import type { DisplayOrder } from '@/lib/useAllOrders';
import type { Kunstwerk, Materiaal, Maat } from '@/components/beheer/materiaalTypes';
import messages from '../../../messages/nl.json';

const KUNSTWERKEN: Kunstwerk[] = [
  {
    id: 'kw-1',
    foto: 'https://example.com/kw-1.jpg',
    naam: 'Hotel paneel',
    artiest: '',
    segmentIds: [],
    materiaalIds: ['mat-1'],
    maatIds: ['maat-1'],
    prijzen: [],
    omschrijvingNl: 'Hotel paneel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
];
const MATERIALEN: Materiaal[] = [
  { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'Extra diepte en stevigheid.' },
];
const MATEN: Maat[] = [{ id: 'maat-1', breedte: 40, hoogte: 60 }];

function renderModal(order: DisplayOrder | null) {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <AccountOrderModal
        order={order}
        kunstwerken={KUNSTWERKEN}
        materialen={MATERIALEN}
        maten={MATEN}
        onClose={() => {}}
      />
    </NextIntlClientProvider>
  );
}

describe('AccountOrderModal', () => {
  it('shows the resolved maat and price for a standard-size line', () => {
    renderModal({
      id: 'GD-00001',
      date: '1-7-2026',
      time: '14:30',
      description: '',
      lines: [{ id: 'line-1', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
    });
    const line = screen.getByTestId('account-order-modal-line-line-1');
    expect(line).toHaveTextContent('40×60 cm');
    expect(line).toHaveTextContent('€ 150,00');
  });

  it('falls back to breedte×hoogte and "Prijs op aanvraag" for a custom-size line', () => {
    renderModal({
      id: 'GD-00002',
      date: '2-7-2026',
      time: '09:00',
      description: '',
      lines: [
        { id: 'line-2', kunstwerkId: 'kw-1', maatId: '', materiaalId: 'mat-1', breedte: 90, hoogte: 140, prijs: null, quantity: 1 },
      ],
    });
    const line = screen.getByTestId('account-order-modal-line-line-2');
    expect(line).toHaveTextContent('90×140 cm');
    expect(line).toHaveTextContent('Prijs op aanvraag');
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npm test -- AccountOrderModal`
Expected: FAIL — the second test fails (shows empty string for maat and `€ NaN` or similar for price) because the component doesn't yet handle `maatId === ''` or `prijs === null`.

- [ ] **Step 8: Update `AccountOrderModal.tsx`**

In `src/components/account/AccountOrderModal.tsx`, replace:

```tsx
                          <p className="text-white/50">
                            {materiaal ? materiaalLabel(materiaal) : line.materiaalId}
                            {' · '}
                            {maat ? maatLabel(maat) : line.maatId}
                            {' · '}
                            {formatCurrency(line.prijs)}
                          </p>
```

with:

```tsx
                          <p className="text-white/50">
                            {materiaal ? materiaalLabel(materiaal) : line.materiaalId}
                            {' · '}
                            {maat
                              ? maatLabel(maat)
                              : line.breedte != null && line.hoogte != null
                                ? `${line.breedte}×${line.hoogte} cm`
                                : line.maatId}
                            {' · '}
                            {line.prijs !== null ? formatCurrency(line.prijs) : t('modalLinePriceOnRequest')}
                          </p>
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npm test -- AccountOrderModal`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/useAllOrders.tsx src/components/account/AccountOrderModal.tsx messages/nl.json messages/en.json messages/fr.json messages/de.json tests/lib/useAllOrders.test.tsx tests/components/account/AccountOrderModal.test.tsx
git commit -m "feat: show custom-size and price-on-request in customer order history"
```

---

### Task 7: Admin bestelling review — custom-size fallback, "Prijs vaststellen", blocked approval

**Files:**
- Modify: `src/components/beheer/BestellingenSection.tsx`
- Modify: `src/components/beheer/BestellingModal.tsx`
- Modify: `src/components/beheer/BeheerShell.tsx`
- Modify: `messages/nl.json` (`beheer` namespace)
- Test: `tests/components/beheer/BestellingModal.test.tsx`
- Test: `tests/components/beheer/BestellingenSection.test.tsx`

**Interfaces:**
- Produces: `'bestelling_prijs_vastgesteld'` activiteit event; `BestellingenSectionProps.onLinePrijsVastgesteld: (bestellingId: string, lineId: string, prijs: number) => void`; `BestellingModalProps.onLinePrijsVastgesteld` (same signature).

- [ ] **Step 1: Add the new `ActiviteitType` member**

In `src/lib/logActiviteit.ts`, change:

```ts
  | 'bedrijfsgegevens_gewijzigd'
  | 'mandje_eigen_maat_toegevoegd';
```

to:

```ts
  | 'bedrijfsgegevens_gewijzigd'
  | 'mandje_eigen_maat_toegevoegd'
  | 'bestelling_prijs_vastgesteld';
```

- [ ] **Step 2: Add the new i18n keys (nl.json only)**

In `messages/nl.json`, replace:

```json
    "bestellingenModalLabelAantal": "Aantal",
    "bestellingenGoedkeuren": "Goedkeuren",
```

with:

```json
    "bestellingenModalLabelAantal": "Aantal",
    "bestellingenModalPrijsOpAanvraag": "Prijs op aanvraag",
    "bestellingenModalPrijsVaststellen": "Prijs vaststellen",
    "bestellingenGoedkeurenBlocked": "Alle regels moeten eerst een prijs krijgen voordat u kunt goedkeuren.",
    "bestellingenGoedkeuren": "Goedkeuren",
```

- [ ] **Step 3: Write the failing tests**

In `tests/components/beheer/BestellingModal.test.tsx`, update the `renderModal` helper to pass the new required prop and return it:

```tsx
function renderModal(bestelling: Bestelling | null) {
  const onClose = vi.fn();
  const onUpdated = vi.fn();
  const onLinePrijsVastgesteld = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <BestellingModal
        bestelling={bestelling}
        kunstwerken={KUNSTWERKEN}
        materialen={MATERIALEN}
        maten={MATEN}
        materiaalsoorten={MATERIAALSOORTEN}
        onClose={onClose}
        onUpdated={onUpdated}
        onLinePrijsVastgesteld={onLinePrijsVastgesteld}
      />
    </NextIntlClientProvider>
  );
  return { onClose, onUpdated, onLinePrijsVastgesteld };
}
```

Then add a fixture with an unpriced (custom-size) line and 4 new tests, just before the final closing `});`:

```tsx
const BESTELLING_MET_EIGEN_MAAT: Bestelling = {
  id: 'header-2',
  klantId: 'uid-2',
  companyName: 'Ander Bedrijf',
  besteldatum: '3-7-2026',
  status: 'Te beoordelen',
  lineCount: 1,
  totalQuantity: 1,
  lines: [
    { id: 'line-3', kunstwerkId: 'kw-1', maatId: '', materiaalId: 'mat-1', breedte: 90, hoogte: 140, prijs: null, quantity: 1 },
  ],
};

describe('BestellingModal — eigen maat / offerte pricing', () => {
  it('shows the custom breedte×hoogte and "Prijs op aanvraag" for an unpriced line, and disables Goedkeuren', () => {
    renderModal(BESTELLING_MET_EIGEN_MAAT);
    const line = screen.getByTestId('bestelling-modal-line-line-3');
    expect(line).toHaveTextContent('90×140 cm');
    expect(line).toHaveTextContent('Prijs op aanvraag');
    expect(screen.getByTestId('bestelling-modal-goedkeuren')).toBeDisabled();
    expect(screen.getByTestId('bestelling-modal-goedkeuren-blocked')).toHaveTextContent(
      'Alle regels moeten eerst een prijs krijgen voordat u kunt goedkeuren.'
    );
  });

  it('sets a price on an unpriced line via "Prijs vaststellen", updates Firestore, logs the event, and re-enables Goedkeuren', async () => {
    updateDocMock.mockResolvedValue(undefined);
    const { onLinePrijsVastgesteld } = renderModal(BESTELLING_MET_EIGEN_MAAT);
    fireEvent.change(screen.getByTestId('bestelling-modal-prijs-input-line-3'), { target: { value: '275' } });
    fireEvent.click(screen.getByTestId('bestelling-modal-prijs-vaststellen-line-3'));

    await waitFor(() =>
      expect(updateDocMock).toHaveBeenCalledWith(
        { collectionName: 'bestelheaders', id: 'header-2/bestellines' },
        { prijs: 275 }
      )
    );
    await waitFor(() => expect(onLinePrijsVastgesteld).toHaveBeenCalledWith('header-2', 'line-3', 275));
    expect(logActiviteitMock).toHaveBeenCalledWith('bestelling_prijs_vastgesteld', {
      id: 'staff-1',
      email: 'paul@glassartanddesign.com',
      naam: 'paul@glassartanddesign.com',
    });
  });

  it('keeps the "Prijs vaststellen" button disabled until a positive number is entered', () => {
    renderModal(BESTELLING_MET_EIGEN_MAAT);
    expect(screen.getByTestId('bestelling-modal-prijs-vaststellen-line-3')).toBeDisabled();
    fireEvent.change(screen.getByTestId('bestelling-modal-prijs-input-line-3'), { target: { value: '0' } });
    expect(screen.getByTestId('bestelling-modal-prijs-vaststellen-line-3')).toBeDisabled();
    fireEvent.change(screen.getByTestId('bestelling-modal-prijs-input-line-3'), { target: { value: '275' } });
    expect(screen.getByTestId('bestelling-modal-prijs-vaststellen-line-3')).not.toBeDisabled();
  });

  it('does not disable Goedkeuren when every line already has a price', () => {
    renderModal(BESTELLING);
    expect(screen.getByTestId('bestelling-modal-goedkeuren')).not.toBeDisabled();
    expect(screen.queryByTestId('bestelling-modal-goedkeuren-blocked')).not.toBeInTheDocument();
  });
});
```

Note the mock `doc` in this test file is `vi.fn((_db, collectionName, id) => ({ collectionName, id }))` and only receives 3 args at each call site today; for the nested `bestellines` path, the implementation below calls `doc(db, 'bestelheaders', bestelling.id, 'bestellines', line.id)` — 4 path segments after `db`. Update the mock to accept a variable path and build `{ collectionName, id }` from the *last two* segments, matching how `BestellingModal`'s existing `doc(db, 'bestelheaders', bestelling.id)` call (2 segments) already works. Replace the mock in this test file:

```tsx
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, ...segments: string[]) => ({
    collectionName: segments.slice(0, -1).join('/'),
    id: segments[segments.length - 1],
  })),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
}));
```

With this mock, `doc(db, 'bestelheaders', 'header-2')` resolves to `{ collectionName: 'bestelheaders', id: 'header-2' }` (unchanged from before), and `doc(db, 'bestelheaders', 'header-2', 'bestellines', 'line-3')` resolves to `{ collectionName: 'bestelheaders/header-2/bestellines', id: 'line-3' }`. Update the 3 existing approve/reject `updateDocMock` assertions accordingly — they still expect `{ collectionName: 'bestelheaders', id: 'header-1' }` which still matches (2-segment call), so no change needed there. Fix the "sets a price" test above to match this shape:

```tsx
    await waitFor(() =>
      expect(updateDocMock).toHaveBeenCalledWith(
        { collectionName: 'bestelheaders/header-2/bestellines', id: 'line-3' },
        { prijs: 275 }
      )
    );
```

(replacing the earlier draft of that assertion in Step 3 above).

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm test -- BestellingModal`
Expected: FAIL — `onLinePrijsVastgesteld` is not a valid prop yet (TS error) and none of the new testids exist.

- [ ] **Step 5: Implement `BestellingModal.tsx`**

Replace the full contents of `src/components/beheer/BestellingModal.tsx` with:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Modal } from '@/components/Modal';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import { formatCurrency } from '@/lib/formatCurrency';
import type { Bestelling, BestellingLine } from './BestellingenSection';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort } from './materiaalTypes';

interface BestellingModalProps {
  bestelling: Bestelling | null;
  kunstwerken: Kunstwerk[] | null;
  materialen: Materiaal[] | null;
  maten: Maat[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  onClose: () => void;
  onUpdated: (bestelling: Bestelling) => void;
  onLinePrijsVastgesteld: (bestellingId: string, lineId: string, prijs: number) => void;
}

export function BestellingModal({
  bestelling,
  kunstwerken,
  materialen,
  maten,
  materiaalsoorten,
  onClose,
  onUpdated,
  onLinePrijsVastgesteld,
}: BestellingModalProps) {
  const t = useTranslations('beheer');
  const [error, setError] = useState<string | null>(null);
  const [prijsDrafts, setPrijsDrafts] = useState<Record<string, string>>({});
  const { user } = useAdminAuth();

  useEffect(() => {
    if (bestelling) {
      setError(null);
      setPrijsDrafts({});
    }
  }, [bestelling]);

  const materiaalsoortNaamById = new Map(
    (materiaalsoorten ?? []).map((soort) => [soort.id, soort.omschrijving])
  );

  const heeftOngeprijsdeRegel = (bestelling?.lines ?? []).some((line) => line.prijs === null);

  async function handleGoedkeuren() {
    if (!bestelling) return;
    try {
      await updateDoc(doc(db, 'bestelheaders', bestelling.id), { status: 'Goedgekeurd' });
      void logActiviteit('bestelling_goedgekeurd', actorFromMedewerker(user));
      onUpdated({ ...bestelling, status: 'Goedgekeurd' });
    } catch {
      setError(t('bestellingenActionError'));
    }
  }

  async function handleAfwijzen() {
    if (!bestelling) return;
    try {
      await updateDoc(doc(db, 'bestelheaders', bestelling.id), { status: 'Afgewezen' });
      void logActiviteit('bestelling_afgewezen', actorFromMedewerker(user));
      onUpdated({ ...bestelling, status: 'Afgewezen' });
    } catch {
      setError(t('bestellingenActionError'));
    }
  }

  async function handlePrijsVaststellen(line: BestellingLine) {
    if (!bestelling) return;
    const prijs = Number(prijsDrafts[line.id]);
    if (!prijs || prijs <= 0) return;
    try {
      await updateDoc(doc(db, 'bestelheaders', bestelling.id, 'bestellines', line.id), { prijs });
      void logActiviteit('bestelling_prijs_vastgesteld', actorFromMedewerker(user));
      onLinePrijsVastgesteld(bestelling.id, line.id, prijs);
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

          <ul className="flex flex-col gap-2 text-xs">
            {bestelling.lines.map((line) => {
              const kunstwerk = (kunstwerken ?? []).find((k) => k.id === line.kunstwerkId);
              const materiaal = (materialen ?? []).find((m) => m.id === line.materiaalId);
              const maat = (maten ?? []).find((m) => m.id === line.maatId);
              const maatWeergave = maat
                ? `${maat.breedte}×${maat.hoogte} cm`
                : line.breedte != null && line.hoogte != null
                  ? `${line.breedte}×${line.hoogte} cm`
                  : line.maatId;
              return (
                <li
                  key={line.id}
                  data-testid={`bestelling-modal-line-${line.id}`}
                  className="flex items-start justify-between gap-3 border-b border-white/10 pb-2 last:border-0"
                >
                  {kunstwerk ? (
                    <div className="flex items-start gap-2">
                      <img src={kunstwerk.foto} alt="" className="h-10 w-10 rounded object-cover" />
                      <div>
                        <p className="text-white/90">{kunstwerk.omschrijvingNl}</p>
                        <p className="text-white/50">
                          <span className="text-white/35">{t('bestellingenModalLabelMateriaal')}: </span>
                          {materiaal
                            ? `${materiaal.materiaaldikte}mm ${
                                materiaalsoortNaamById.get(materiaal.materiaalsoortId) ?? materiaal.materiaalsoortId
                              } — ${materiaal.omschrijving}`
                            : line.materiaalId}
                        </p>
                        <p className="text-white/50">
                          <span className="text-white/35">{t('bestellingenModalLabelMaat')}: </span>
                          {maatWeergave}
                        </p>
                        <p className="text-white/50">
                          <span className="text-white/35">{t('bestellingenModalLabelPrijs')}: </span>
                          {line.prijs !== null ? formatCurrency(line.prijs) : t('bestellingenModalPrijsOpAanvraag')}
                        </p>
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
                              className="rounded-sm border border-white/20 px-2 py-1 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white disabled:opacity-40"
                            >
                              {t('bestellingenModalPrijsVaststellen')}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span>{t('bestellingenRegelOnbekend')}</span>
                  )}
                  <p className="shrink-0 text-right">
                    <span className="block text-white/35">{t('bestellingenModalLabelAantal')}</span>×{line.quantity}
                  </p>
                </li>
              );
            })}
          </ul>

          {error && (
            <p data-testid="bestelling-modal-error" className="text-xs text-red-400">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-2">
            {heeftOngeprijsdeRegel && (
              <p data-testid="bestelling-modal-goedkeuren-blocked" className="text-xs text-amber-400">
                {t('bestellingenGoedkeurenBlocked')}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleGoedkeuren}
                disabled={heeftOngeprijsdeRegel}
                data-testid="bestelling-modal-goedkeuren"
                className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
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
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- BestellingModal`
Expected: PASS.

- [ ] **Step 7: Update `BestellingLine`, `BestellingenSection.tsx` and its test**

In `src/components/beheer/BestellingenSection.tsx`, replace:

```ts
export interface BestellingLine {
  id: string;
  kunstwerkId: string | null;
  maatId: string | null;
  materiaalId: string | null;
  prijs: number;
  quantity: number;
}
```

with:

```ts
export interface BestellingLine {
  id: string;
  kunstwerkId: string | null;
  maatId: string | null;
  materiaalId: string | null;
  breedte?: number;
  hoogte?: number;
  prijs: number | null;
  quantity: number;
}
```

Replace the props interface and component signature:

```ts
interface BestellingenSectionProps {
  bestellingen: Bestelling[] | null;
  kunstwerken: Kunstwerk[] | null;
  materialen: Materiaal[] | null;
  maten: Maat[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  loadError: string | null;
  onBestellingUpdated: (bestelling: Bestelling) => void;
}

export function BestellingenSection({
  bestellingen,
  kunstwerken,
  materialen,
  maten,
  materiaalsoorten,
  loadError,
  onBestellingUpdated,
}: BestellingenSectionProps) {
```

with:

```ts
interface BestellingenSectionProps {
  bestellingen: Bestelling[] | null;
  kunstwerken: Kunstwerk[] | null;
  materialen: Materiaal[] | null;
  maten: Maat[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  loadError: string | null;
  onBestellingUpdated: (bestelling: Bestelling) => void;
  onLinePrijsVastgesteld: (bestellingId: string, lineId: string, prijs: number) => void;
}

export function BestellingenSection({
  bestellingen,
  kunstwerken,
  materialen,
  maten,
  materiaalsoorten,
  loadError,
  onBestellingUpdated,
  onLinePrijsVastgesteld,
}: BestellingenSectionProps) {
```

Add a wrapper function right after the `const [selectedBestelling, ...] = useState(...)` line:

```tsx
  function handleLinePrijsVastgesteld(bestellingId: string, lineId: string, prijs: number) {
    onLinePrijsVastgesteld(bestellingId, lineId, prijs);
    setSelectedBestelling((current) =>
      current && current.id === bestellingId
        ? { ...current, lines: current.lines.map((line) => (line.id === lineId ? { ...line, prijs } : line)) }
        : current
    );
  }
```

Replace the `<BestellingModal ... />` element:

```tsx
      <BestellingModal
        bestelling={selectedBestelling}
        kunstwerken={kunstwerken}
        materialen={materialen}
        maten={maten}
        materiaalsoorten={materiaalsoorten}
        onClose={() => setSelectedBestelling(null)}
        onUpdated={(updated) => {
          onBestellingUpdated(updated);
          setSelectedBestelling(null);
        }}
      />
```

with:

```tsx
      <BestellingModal
        bestelling={selectedBestelling}
        kunstwerken={kunstwerken}
        materialen={materialen}
        maten={maten}
        materiaalsoorten={materiaalsoorten}
        onClose={() => setSelectedBestelling(null)}
        onUpdated={(updated) => {
          onBestellingUpdated(updated);
          setSelectedBestelling(null);
        }}
        onLinePrijsVastgesteld={handleLinePrijsVastgesteld}
      />
```

In `tests/components/beheer/BestellingenSection.test.tsx`, update `renderSection` to pass and return the new prop:

```tsx
function renderSection(overrides: Partial<React.ComponentProps<typeof BestellingenSection>> = {}) {
  const onBestellingUpdated = vi.fn();
  const onLinePrijsVastgesteld = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <BestellingenSection
        bestellingen={BESTELLINGEN}
        kunstwerken={KUNSTWERKEN}
        materialen={MATERIALEN}
        maten={MATEN}
        materiaalsoorten={MATERIAALSOORTEN}
        loadError={null}
        onBestellingUpdated={onBestellingUpdated}
        onLinePrijsVastgesteld={onLinePrijsVastgesteld}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  return { onBestellingUpdated, onLinePrijsVastgesteld };
}
```

Add a test just before the final closing `});`:

```tsx
  it('keeps the modal open and reflects the new price after "Prijs vaststellen", without closing it', async () => {
    updateDocMock.mockResolvedValue(undefined);
    const bestellingenMetEigenMaat = [
      {
        ...BESTELLINGEN[0],
        lines: [{ id: 'line-3', kunstwerkId: 'kw-1', maatId: '', materiaalId: 'mat-1', breedte: 90, hoogte: 140, prijs: null, quantity: 1 }],
      },
    ];
    const { onLinePrijsVastgesteld } = renderSection({ bestellingen: bestellingenMetEigenMaat });
    fireEvent.click(screen.getByTestId('data-table-row-header-1'));
    fireEvent.change(screen.getByTestId('bestelling-modal-prijs-input-line-3'), { target: { value: '275' } });
    fireEvent.click(screen.getByTestId('bestelling-modal-prijs-vaststellen-line-3'));

    await waitFor(() => expect(onLinePrijsVastgesteld).toHaveBeenCalledWith('header-1', 'line-3', 275));
    expect(screen.getByTestId('bestelling-modal')).toBeInTheDocument();
    expect(screen.getByTestId('bestelling-modal-line-line-3')).toHaveTextContent('€ 275,00');
  });
```

- [ ] **Step 8: Run the `BestellingenSection` tests to verify they pass**

Run: `npm test -- BestellingenSection`
Expected: PASS.

- [ ] **Step 9: Wire `BeheerShell.tsx`**

In `src/components/beheer/BeheerShell.tsx`, replace the bestellines mapping inside `loadBestellingen`:

```ts
            const lines: BestellingLine[] = linesSnapshot.docs.map((lineDoc) => {
              const lineData = lineDoc.data();
              return {
                id: lineDoc.id,
                kunstwerkId: lineData.kunstwerkId,
                maatId: lineData.maatId,
                materiaalId: lineData.materiaalId,
                prijs: lineData.prijs,
                quantity: lineData.quantity,
              };
            });
```

with:

```ts
            const lines: BestellingLine[] = linesSnapshot.docs.map((lineDoc) => {
              const lineData = lineDoc.data();
              return {
                id: lineDoc.id,
                kunstwerkId: lineData.kunstwerkId,
                maatId: lineData.maatId,
                materiaalId: lineData.materiaalId,
                breedte: lineData.breedte,
                hoogte: lineData.hoogte,
                prijs: lineData.prijs ?? null,
                quantity: lineData.quantity,
              };
            });
```

Add a new handler right after `handleBestellingUpdated`:

```ts
  function handleLinePrijsVastgesteld(bestellingId: string, lineId: string, prijs: number) {
    setRawBestellingen((current) =>
      (current ?? []).map((row) =>
        row.id === bestellingId
          ? { ...row, lines: row.lines.map((line) => (line.id === lineId ? { ...line, prijs } : line)) }
          : row
      )
    );
  }
```

Replace the `<BestellingenSection ... />` element:

```tsx
          <BestellingenSection
            bestellingen={bestellingen}
            kunstwerken={kunstwerken.items}
            materialen={materialen.items}
            maten={maten.items}
            materiaalsoorten={materiaalsoorten.items}
            loadError={bestellingenLoadError}
            onBestellingUpdated={handleBestellingUpdated}
          />
```

with:

```tsx
          <BestellingenSection
            bestellingen={bestellingen}
            kunstwerken={kunstwerken.items}
            materialen={materialen.items}
            maten={maten.items}
            materiaalsoorten={materiaalsoorten.items}
            loadError={bestellingenLoadError}
            onBestellingUpdated={handleBestellingUpdated}
            onLinePrijsVastgesteld={handleLinePrijsVastgesteld}
          />
```

- [ ] **Step 10: Run the full suite to verify nothing regressed**

Run: `npm test`
Expected: PASS — all suites, including `BeheerShell.test.tsx` (no prop-shape assertions there depend on the changed fields, per the earlier research).

- [ ] **Step 11: Commit**

```bash
git add src/lib/logActiviteit.ts messages/nl.json src/components/beheer/BestellingModal.tsx src/components/beheer/BestellingenSection.tsx src/components/beheer/BeheerShell.tsx tests/components/beheer/BestellingModal.test.tsx tests/components/beheer/BestellingenSection.test.tsx
git commit -m "feat: let admins set a price for custom-size orders and block approval until priced"
```

---

### Task 8: Firestore rules — nullable price, custom-size keys, scoped price-set update

**Files:**
- Modify: `firestore.rules`

**Interfaces:**
- Consumes: the 2 new `ActiviteitType` values added in Tasks 4 and 7 (`'mandje_eigen_maat_toegevoegd'`, `'bestelling_prijs_vastgesteld'`).

There is no local rules test harness in this project (no firebase emulator test suite exists), so this task is verified by careful manual review of the rule logic against the scenarios below, plus a real deploy.

- [ ] **Step 1: Update the `bestellines` match block**

In `firestore.rules`, replace:

```
      match /bestellines/{lineId} {
        allow create: if request.auth != null &&
          request.auth.uid == get(/databases/$(database)/documents/bestelheaders/$(id)).data.klantId &&
          request.resource.data.keys().hasOnly(['kunstwerkId', 'maatId', 'materiaalId', 'prijs', 'quantity']) &&
          request.resource.data.kunstwerkId is string && request.resource.data.kunstwerkId.size() > 0 &&
          request.resource.data.maatId is string && request.resource.data.maatId.size() > 0 &&
          request.resource.data.materiaalId is string && request.resource.data.materiaalId.size() > 0 &&
          request.resource.data.prijs is number && request.resource.data.prijs > 0 &&
          request.resource.data.quantity is int && request.resource.data.quantity > 0;
        allow read: if request.auth != null &&
          (request.auth.uid == get(/databases/$(database)/documents/bestelheaders/$(id)).data.klantId ||
           exists(/databases/$(database)/documents/medewerkers/$(request.auth.uid)));
        allow update, delete: if false;
      }
```

with:

```
      match /bestellines/{lineId} {
        allow create: if request.auth != null &&
          request.auth.uid == get(/databases/$(database)/documents/bestelheaders/$(id)).data.klantId &&
          request.resource.data.keys().hasOnly(['kunstwerkId', 'maatId', 'materiaalId', 'breedte', 'hoogte', 'prijs', 'quantity']) &&
          request.resource.data.kunstwerkId is string && request.resource.data.kunstwerkId.size() > 0 &&
          request.resource.data.maatId is string &&
          request.resource.data.materiaalId is string && request.resource.data.materiaalId.size() > 0 &&
          (request.resource.data.prijs == null || (request.resource.data.prijs is number && request.resource.data.prijs > 0)) &&
          request.resource.data.quantity is int && request.resource.data.quantity > 0;
        allow read: if request.auth != null &&
          (request.auth.uid == get(/databases/$(database)/documents/bestelheaders/$(id)).data.klantId ||
           exists(/databases/$(database)/documents/medewerkers/$(request.auth.uid)));
        allow update: if request.auth != null &&
          exists(/databases/$(database)/documents/medewerkers/$(request.auth.uid)) &&
          request.resource.data.keys().hasOnly(['kunstwerkId', 'maatId', 'materiaalId', 'breedte', 'hoogte', 'prijs', 'quantity']) &&
          request.resource.data.prijs is number && request.resource.data.prijs > 0 &&
          request.resource.data.kunstwerkId == resource.data.kunstwerkId &&
          request.resource.data.maatId == resource.data.maatId &&
          request.resource.data.materiaalId == resource.data.materiaalId &&
          request.resource.data.quantity == resource.data.quantity;
        allow delete: if false;
      }
```

This: (a) allows `maatId` to be an empty string for custom-size lines instead of requiring a non-empty id, (b) allows `prijs` to be `null` at creation (custom sizes) while still requiring a positive number for standard-size lines, (c) allows `breedte`/`hoogte` as optional keys, and (d) adds a scoped `update` rule that only lets an authenticated medewerker change `prijs` to a positive number, while `kunstwerkId`/`maatId`/`materiaalId`/`quantity` must stay identical to the stored document — this is exactly what `BestellingModal`'s "Prijs vaststellen" button needs (Task 7) and nothing more.

- [ ] **Step 2: Update the `activiteitenlog` type whitelist**

In `firestore.rules`, replace:

```
      allow create: if request.resource.data.type in
          ['kunstwerk_bekeken','mandje_toegevoegd','bestelling_geplaatst','account_bezocht',
           'word_klant_bezocht','word_klant_aanvraag','klant_goedgekeurd','klant_afgewezen',
           'bestelling_goedgekeurd','bestelling_afgewezen',
           'materiaalsoort_toegevoegd','materiaalsoort_gewijzigd','materiaalsoort_verwijderd',
           'materiaal_toegevoegd','materiaal_gewijzigd','materiaal_verwijderd',
           'maat_toegevoegd','maat_gewijzigd','maat_verwijderd',
           'segment_toegevoegd','segment_gewijzigd','segment_verwijderd',
           'kunstwerk_toegevoegd','kunstwerk_gewijzigd','kunstwerk_verwijderd',
           'prijsgroep_toegevoegd','prijsgroep_gewijzigd','prijsgroep_verwijderd',
           'bedrijfsgegevens_gewijzigd']
```

with:

```
      allow create: if request.resource.data.type in
          ['kunstwerk_bekeken','mandje_toegevoegd','bestelling_geplaatst','account_bezocht',
           'word_klant_bezocht','word_klant_aanvraag','klant_goedgekeurd','klant_afgewezen',
           'bestelling_goedgekeurd','bestelling_afgewezen',
           'materiaalsoort_toegevoegd','materiaalsoort_gewijzigd','materiaalsoort_verwijderd',
           'materiaal_toegevoegd','materiaal_gewijzigd','materiaal_verwijderd',
           'maat_toegevoegd','maat_gewijzigd','maat_verwijderd',
           'segment_toegevoegd','segment_gewijzigd','segment_verwijderd',
           'kunstwerk_toegevoegd','kunstwerk_gewijzigd','kunstwerk_verwijderd',
           'prijsgroep_toegevoegd','prijsgroep_gewijzigd','prijsgroep_verwijderd',
           'bedrijfsgegevens_gewijzigd','mandje_eigen_maat_toegevoegd','bestelling_prijs_vastgesteld']
```

- [ ] **Step 3: Manually verify the rule logic against the required scenarios**

Confirm by inspection that:
- A customer creating a custom-size line (`maatId: ''`, `prijs: null`, `breedte`/`hoogte` set) passes `create`.
- A customer creating a standard-size line (`maatId` non-empty, `prijs` a positive number, no `breedte`/`hoogte`) still passes `create`, unchanged from before.
- A customer creating a line with `prijs: 0` or a negative number still fails `create` (unchanged).
- An admin calling `updateDoc(..., { prijs: 275 })` on an existing unpriced line passes `update` (medewerker exists, `prijs` becomes a positive number, other fields unchanged since the partial update leaves them as stored).
- A non-medewerker (or unauthenticated) update attempt fails.
- An admin attempting to change `kunstwerkId`/`maatId`/`materiaalId`/`quantity` via the same update path fails (blocked by the equality checks).

- [ ] **Step 4: Deploy the rules**

Run: `npx --yes firebase-tools deploy --only firestore:rules`
Expected: deploy succeeds (the CLI validates rule syntax before deploying; a syntax error would fail here).

- [ ] **Step 5: Commit**

```bash
git add firestore.rules
git commit -m "feat: allow nullable-price custom-size bestellines and admin price-set updates"
```

---

### Task 9: Production data rollout (manual — no code)

This task has no tests; it is a one-time data-entry pass using the admin UI built in Tasks 1 and 2, run after this branch is merged and deployed. `maten` and `materiaalsoorten` are live Firestore collections already populated in production, so the `useFirestoreCollection` seed-on-empty mechanism (Task 2) will not touch them — the real data must be entered by hand via Beheer.

- [ ] **Step 1: Add the 11 standard sizes**

In the deployed site, go to **Beheer → Maten**. For each of the following, click "Maat toevoegen" and enter the breedte/hoogte (cm), then save: 30×30, 50×50, 50×70, 50×100, 60×80, 80×80, 80×120, 100×100, 120×120, 120×180, 100×150. Skip any that already exist with the same breedte/hoogte.

- [ ] **Step 2: Configure eigen-maat settings on the 3 materiaalsoorten**

In **Beheer → Materiaalsoorten**, open each row and set:
- **Veiligheidsglas**: check "Klant mag eigen maat opgeven"; leave max breedte/hoogte empty; set levertijd to `3`.
- **Dibond**: check "Klant mag eigen maat opgeven"; set max breedte `200`, max hoogte `300`; leave levertijd empty.
- **Acryl**: check "Klant mag eigen maat opgeven"; set max breedte `200`, max hoogte `300`; leave levertijd empty.
- Leave **Akoestische stof** unchanged.

- [ ] **Step 3: Link the new sizes to the relevant kunstwerken**

In **Beheer → Kunstwerken**, for each artwork that should offer the new sizes, open it, tick the new maten under "Maten", and fill in the price for every newly-ticked (materiaal × maat) combination in the price matrix before saving. This is a per-artwork pricing decision, not something to automate.

No commit for this task — it's a data change in production Firestore, not a code change.

---

## Self-Review Notes

- **Spec coverage**: 11 standard sizes (Task 2), veiligheidsglas unbounded custom size + 3-month warning (Tasks 1, 4), Acryl/Dibond 200x300 cap with no extra lead time (Tasks 1, 4), manual/offerte pricing (Tasks 3–7), popup UX (Task 4), cart/order/admin handling (Tasks 5–7), production rollout (Task 9), activiteitenlog events (Tasks 4, 7) are all covered.
- **Type consistency checked**: `Materiaalsoort.staatEigenMaatToe/maxBreedte/maxHoogte/levertijdMaandenEigenMaat` (Task 1) are used identically in `ProductModal.tsx` (Task 4) and the seed files (Task 2). `CartItem.breedte/hoogte/prijs: number | null` (Task 3) match the fields written in `ProductModal.tsx` (Task 4) and read in `CartPanel.tsx` (Task 5). `DisplayOrderLine` (Task 6) and `BestellingLine` (Task 7) both gained the same `breedte?/hoogte?/prijs: number | null` shape independently, matching how they're already independent types in this codebase.
- **No placeholders**: every step has complete, runnable code; no "add tests for the above" or "TBD" steps remain.
