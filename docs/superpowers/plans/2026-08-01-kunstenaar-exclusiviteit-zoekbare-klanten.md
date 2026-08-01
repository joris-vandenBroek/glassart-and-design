# Kunstenaar-exclusiviteit: zoekbare klantselectie Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the checkbox-per-klant list for `Kunstenaar.exclusieveKlantIds` in `KunstenaarsSection.tsx` with two independent searchable dropdowns ("Klant 1" / "Klant 2"), built from the existing `Combobox` component, so the field scales to many klanten.

**Architecture:** The single `exclusieveKlantIds: string[]` form state becomes two fixed slots, `klant1Id` / `klant2Id` (`string | null`), with the array re-derived from them (`[klant1Id, klant2Id].filter(Boolean)`) wherever the save payload or existing validation logic needs it. One handler, `selectKlant(slot, nextId)`, replaces `toggleExclusieveKlant` and re-runs the existing "if 2 selected, one must be the artist's own linked klant" rule (`eigenKlantId`, unchanged) whenever a change would bring the count to 2. No database, API, or `resolveOrderRight` changes — this is UI-only.

**Tech Stack:** Next.js 14 (App Router), TypeScript, React, `next-intl`, Vitest + `@testing-library/react`.

## Global Constraints

- `messages/nl.json`'s `beheer` namespace exists **only** in that file (not `en`/`de`/`fr`) — this whole feature is beheer-only, so all new i18n keys go in `nl.json` alone.
- Business rule (unchanged): 0 selected klanten = open to everyone; 1 selected = only that klant may order; 2 selected requires one of the two to be the klant whose `Klant.kunstenaarId` points back to this kunstenaar — enforced by `eigenKlantId` + the existing inline error, not a DB constraint.
- `Combobox` (`src/components/Combobox.tsx`) is not modified — reuse it exactly as `KlantModal.tsx:449-457` already does for `Klant.kunstenaarId`.
- Testing a `Combobox` selection follows the pattern already used in `tests/components/beheer/KlantModal.test.tsx:401-402`: `fireEvent.focus(screen.getByTestId('<testId>'))` opens the option list, then `fireEvent.click(screen.getByTestId('<testId>-option-<value>'))` (or `-option-clear`) picks it. The list only exists in the DOM while open.
- `tests/components/beheer/KunstenaarsSection.test.tsx` mocks `fetch` directly (`vi.stubGlobal('fetch', fetchMock)`) — it does not touch the real database, so none of the DB-cleanup rules in `CLAUDE.md` apply to this file.

---

### Task 1: Add i18n keys for the two klant-search fields

**Files:**
- Modify: `messages/nl.json`

**Interfaces:**
- Produces: translation keys `kunstenaarsLabelKlant1`, `kunstenaarsLabelKlant2`, `kunstenaarsKlantPlaceholder`, `kunstenaarsKlantGeenResultaten`, `kunstenaarsKlantGeen`, consumed by Task 2.

- [ ] **Step 1: Add the new keys next to the existing `kunstenaarsLabelKlant` entry**

In `messages/nl.json`, change:
```json
    "kunstenaarsExclusiviteitOpen": "Open voor alle klanten",
    "kunstenaarsExclusiviteitOngeldig": "Bij 2 klanten moet één daarvan het klantaccount van deze kunstenaar zelf zijn.",
    "kunstenaarsLabelKlant": "Exclusief verkooprecht voor klant",
    "kunstenaarsToevoegen": "Kunstenaar toevoegen",
```
to:
```json
    "kunstenaarsExclusiviteitOpen": "Open voor alle klanten",
    "kunstenaarsExclusiviteitOngeldig": "Bij 2 klanten moet één daarvan het klantaccount van deze kunstenaar zelf zijn.",
    "kunstenaarsLabelKlant": "Exclusief verkooprecht voor klant",
    "kunstenaarsLabelKlant1": "Klant 1",
    "kunstenaarsLabelKlant2": "Klant 2",
    "kunstenaarsKlantPlaceholder": "Zoek een klant…",
    "kunstenaarsKlantGeenResultaten": "Geen klanten gevonden.",
    "kunstenaarsKlantGeen": "Geen",
    "kunstenaarsToevoegen": "Kunstenaar toevoegen",
```

- [ ] **Step 2: Verify the JSON is still valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/nl.json','utf8')); console.log('ok')"`
Expected: prints `ok` with no error.

- [ ] **Step 3: Commit**

```bash
git add messages/nl.json
git commit -m "feat: add i18n keys for the Klant 1/Klant 2 search fields"
```

---

### Task 2: Replace the checkbox fieldset with two searchable Comboboxes

**Files:**
- Modify: `src/components/beheer/KunstenaarsSection.tsx`
- Test: `tests/components/beheer/KunstenaarsSection.test.tsx`

**Interfaces:**
- Consumes: `Combobox` (`src/components/Combobox.tsx`) — `{ options: {value, label}[], value: string | null, onChange: (value: string | null) => void, placeholder: string, noResultsLabel: string, clearLabel?: string, testId: string }`. i18n keys from Task 1.
- Produces: no change to `KunstenaarsSectionProps` or to the shape of data passed to `onUpdate`/the `POST /api/kunstenaars` body — `exclusieveKlantIds: string[]` remains identical to before.

- [ ] **Step 1: Rewrite the affected tests in `tests/components/beheer/KunstenaarsSection.test.tsx`**

Replace the checkbox click in the "adds a new kunstenaar" test (around line 236):
```ts
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-klant-1'));
```
with:
```ts
    fireEvent.focus(screen.getByTestId('kunstenaar-modal-klant-1'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-1-option-klant-1'));
```

Replace the whole "a new kunstenaar cannot select a second exclusieve klant" test (lines 265-274):
```ts
  it('a new kunstenaar cannot select a second exclusieve klant -- there is no own account yet to satisfy the rule', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstenaars-add'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-klant-1'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-klant-2'));
    expect(screen.getByTestId('kunstenaar-modal-error')).toHaveTextContent(
      'Bij 2 klanten moet één daarvan het klantaccount van deze kunstenaar zelf zijn.'
    );
    expect(screen.getByTestId('kunstenaar-modal-klant-klant-2')).not.toBeChecked();
  });
```
with:
```ts
  it('a new kunstenaar cannot select a second exclusieve klant -- there is no own account yet to satisfy the rule', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstenaars-add'));
    fireEvent.focus(screen.getByTestId('kunstenaar-modal-klant-1'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-1-option-klant-1'));
    fireEvent.focus(screen.getByTestId('kunstenaar-modal-klant-2'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-2-option-klant-2'));
    expect(screen.getByTestId('kunstenaar-modal-error')).toHaveTextContent(
      'Bij 2 klanten moet één daarvan het klantaccount van deze kunstenaar zelf zijn.'
    );
    expect(screen.getByTestId('kunstenaar-modal-klant-2')).toHaveValue('');
  });
```

Replace the whole "allows a second exclusieve klant" test (lines 276-293):
```ts
  it('allows a second exclusieve klant on an existing kunstenaar when one of the two is its own linked klant', async () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));
    // Opslaan stays disabled until the async prijsafspraken fetch settles (see the
    // sibling 'opens a row for editing pre-filled...' test) -- wait for it before saving.
    await waitFor(() => expect(screen.getByTestId('kunstenaar-modal-opslaan')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-klant-1'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-klant-2'));
    expect(screen.queryByTestId('kunstenaar-modal-error')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('kunstenaar-modal-opslaan'));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(
        'ka-1',
        expect.objectContaining({ exclusieveKlantIds: ['klant-1', 'klant-2'] })
      )
    );
  });
```
with:
```ts
  it('allows a second exclusieve klant on an existing kunstenaar when one of the two is its own linked klant', async () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));
    // Opslaan stays disabled until the async prijsafspraken fetch settles (see the
    // sibling 'opens a row for editing pre-filled...' test) -- wait for it before saving.
    await waitFor(() => expect(screen.getByTestId('kunstenaar-modal-opslaan')).not.toBeDisabled());
    fireEvent.focus(screen.getByTestId('kunstenaar-modal-klant-1'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-1-option-klant-1'));
    fireEvent.focus(screen.getByTestId('kunstenaar-modal-klant-2'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-2-option-klant-2'));
    expect(screen.queryByTestId('kunstenaar-modal-error')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('kunstenaar-modal-opslaan'));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(
        'ka-1',
        expect.objectContaining({ exclusieveKlantIds: ['klant-1', 'klant-2'] })
      )
    );
  });
```

Replace the whole "blocks picking two klanten that are both not the kunstenaar's own linked klant" test (lines 295-305):
```ts
  it('blocks picking two klanten that are both not the kunstenaar\'s own linked klant, even in edit mode', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));
    await waitFor(() => expect(screen.getByTestId('kunstenaar-modal-opslaan')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-klant-1'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-klant-3'));
    expect(screen.getByTestId('kunstenaar-modal-error')).toHaveTextContent(
      'Bij 2 klanten moet één daarvan het klantaccount van deze kunstenaar zelf zijn.'
    );
    expect(screen.getByTestId('kunstenaar-modal-klant-klant-3')).not.toBeChecked();
  });
```
with:
```ts
  it('blocks picking two klanten that are both not the kunstenaar\'s own linked klant, even in edit mode', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));
    await waitFor(() => expect(screen.getByTestId('kunstenaar-modal-opslaan')).not.toBeDisabled());
    fireEvent.focus(screen.getByTestId('kunstenaar-modal-klant-1'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-1-option-klant-1'));
    fireEvent.focus(screen.getByTestId('kunstenaar-modal-klant-2'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-2-option-klant-3'));
    expect(screen.getByTestId('kunstenaar-modal-error')).toHaveTextContent(
      'Bij 2 klanten moet één daarvan het klantaccount van deze kunstenaar zelf zijn.'
    );
    expect(screen.getByTestId('kunstenaar-modal-klant-2')).toHaveValue('');
  });
```

Replace the whole "disables a third klant checkbox once two are already checked" test (lines 307-315) — there is no third field anymore once two slots exist, so this becomes a test of the duplicate-exclusion behaviour instead:
```ts
  it('disables a third klant checkbox once two are already checked', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));
    await waitFor(() => expect(screen.getByTestId('kunstenaar-modal-opslaan')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-klant-1'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-klant-2'));
    expect(screen.queryByTestId('kunstenaar-modal-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('kunstenaar-modal-klant-klant-3')).toBeDisabled();
  });
```
with:
```ts
  it('excludes the klant already chosen in the other slot from a combobox\'s option list', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));
    await waitFor(() => expect(screen.getByTestId('kunstenaar-modal-opslaan')).not.toBeDisabled());
    fireEvent.focus(screen.getByTestId('kunstenaar-modal-klant-1'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-1-option-klant-1'));
    fireEvent.focus(screen.getByTestId('kunstenaar-modal-klant-2'));
    expect(screen.queryByTestId('kunstenaar-modal-klant-2-option-klant-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('kunstenaar-modal-klant-2-option-klant-2')).toBeInTheDocument();
  });
```

Replace the checked-checkbox assertion in "opens a row for editing pre-filled and updates it, keeping its exclusieveKlantIds" (around line 408):
```ts
    expect(screen.getByTestId('kunstenaar-modal-klant-klant-1')).toBeChecked();
```
with:
```ts
    expect(screen.getByTestId('kunstenaar-modal-klant-1')).toHaveValue('Galerie De Boer');
    expect(screen.getByTestId('kunstenaar-modal-klant-2')).toHaveValue('');
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/KunstenaarsSection.test.tsx`
Expected: FAIL — `kunstenaar-modal-klant-1`/`kunstenaar-modal-klant-2` don't exist yet (the component still renders `kunstenaar-modal-klant-<klantId>` checkboxes).

- [ ] **Step 3: Update imports and `LEGE_FORM` in `src/components/beheer/KunstenaarsSection.tsx`**

Change:
```ts
import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
import { useKunstwerkFotoUpload } from '@/lib/useKunstwerkFotoUpload';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Kunstenaar } from './kunstenaarTypes';
import type { Klant } from './KlantenSection';
import type { Kunstwerk } from './materiaalTypes';
```
to:
```ts
import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { Combobox } from '@/components/Combobox';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
import { useKunstwerkFotoUpload } from '@/lib/useKunstwerkFotoUpload';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Kunstenaar } from './kunstenaarTypes';
import type { Klant } from './KlantenSection';
import type { Kunstwerk } from './materiaalTypes';
```

Change:
```ts
const LEGE_FORM = {
  foto: null as string | null,
  naam: '',
  omschrijvingNl: '',
  omschrijvingFr: '',
  omschrijvingDe: '',
  omschrijvingEn: '',
  prijsafspraken: '',
  prijsopslag: 0 as number,
  exclusieveKlantIds: [] as string[],
};
```
to:
```ts
const LEGE_FORM = {
  foto: null as string | null,
  naam: '',
  omschrijvingNl: '',
  omschrijvingFr: '',
  omschrijvingDe: '',
  omschrijvingEn: '',
  prijsafspraken: '',
  prijsopslag: 0 as number,
};
```

- [ ] **Step 4: Replace the `exclusieveKlantIds` state with two slots and a derived value**

Change:
```ts
  const [prijsopslag, setPrijsopslag] = useState(LEGE_FORM.prijsopslag);
  const [exclusieveKlantIds, setExclusieveKlantIds] = useState<string[]>(LEGE_FORM.exclusieveKlantIds);
  const [prijsafsprakenLaden, setPrijsafsprakenLaden] = useState(false);
```
to:
```ts
  const [prijsopslag, setPrijsopslag] = useState(LEGE_FORM.prijsopslag);
  const [klant1Id, setKlant1Id] = useState<string | null>(null);
  const [klant2Id, setKlant2Id] = useState<string | null>(null);
  const [prijsafsprakenLaden, setPrijsafsprakenLaden] = useState(false);
```

Change:
```ts
  // De klant (indien aanwezig) wiens kunstenaarId naar déze kunstenaar wijst -- gebruikt
  // om de "bij 2 klanten moet 1 de kunstenaar zelf zijn"-regel te valideren.
  function eigenKlantId(kunstenaarId: string | null): string | null {
    if (kunstenaarId === null) return null;
    return (klanten ?? []).find((klant) => klant.kunstenaarId === kunstenaarId)?.id ?? null;
  }

  if (loadError) {
```
to:
```ts
  // De klant (indien aanwezig) wiens kunstenaarId naar déze kunstenaar wijst -- gebruikt
  // om de "bij 2 klanten moet 1 de kunstenaar zelf zijn"-regel te valideren.
  function eigenKlantId(kunstenaarId: string | null): string | null {
    if (kunstenaarId === null) return null;
    return (klanten ?? []).find((klant) => klant.kunstenaarId === kunstenaarId)?.id ?? null;
  }

  const exclusieveKlantIds = [klant1Id, klant2Id].filter((id): id is string => id !== null);

  if (loadError) {
```

- [ ] **Step 5: Update `resetForm` and `openEdit`**

Change:
```ts
    setPrijsafspraken(LEGE_FORM.prijsafspraken);
    setPrijsopslag(LEGE_FORM.prijsopslag);
    setExclusieveKlantIds(LEGE_FORM.exclusieveKlantIds);
    setPrijsafsprakenLaden(false);
    setActionError(null);
  }
```
to:
```ts
    setPrijsafspraken(LEGE_FORM.prijsafspraken);
    setPrijsopslag(LEGE_FORM.prijsopslag);
    setKlant1Id(null);
    setKlant2Id(null);
    setPrijsafsprakenLaden(false);
    setActionError(null);
  }
```

Change:
```ts
    setPrijsafspraken(LEGE_FORM.prijsafspraken);
    setPrijsopslag(LEGE_FORM.prijsopslag);
    setExclusieveKlantIds(kunstenaar.exclusieveKlantIds);
    setActionError(null);
```
to:
```ts
    setPrijsafspraken(LEGE_FORM.prijsafspraken);
    setPrijsopslag(LEGE_FORM.prijsopslag);
    setKlant1Id(kunstenaar.exclusieveKlantIds[0] ?? null);
    setKlant2Id(kunstenaar.exclusieveKlantIds[1] ?? null);
    setActionError(null);
```

- [ ] **Step 6: Replace `toggleExclusieveKlant` with `selectKlant`**

Change:
```ts
  function toggleExclusieveKlant(klantId: string, huidigeKunstenaarId: string | null) {
    const isChecked = exclusieveKlantIds.includes(klantId);
    if (isChecked) {
      setActionError(null);
      setExclusieveKlantIds((current) => current.filter((id) => id !== klantId));
      return;
    }
    if (exclusieveKlantIds.length >= 2) return;
    const next = [...exclusieveKlantIds, klantId];
    if (next.length === 2) {
      const eigenId = eigenKlantId(huidigeKunstenaarId);
      if (eigenId === null || !next.includes(eigenId)) {
        setActionError(t('kunstenaarsExclusiviteitOngeldig'));
        return;
      }
    }
    setActionError(null);
    setExclusieveKlantIds(next);
  }
```
to:
```ts
  function selectKlant(slot: 'klant1' | 'klant2', nextId: string | null) {
    const huidigeKunstenaarId = modalState?.mode === 'edit' ? modalState.kunstenaar.id : null;
    const nextKlant1 = slot === 'klant1' ? nextId : klant1Id;
    const nextKlant2 = slot === 'klant2' ? nextId : klant2Id;
    const nextIds = [nextKlant1, nextKlant2].filter((id): id is string => id !== null);
    if (nextIds.length === 2) {
      const eigenId = eigenKlantId(huidigeKunstenaarId);
      if (eigenId === null || !nextIds.includes(eigenId)) {
        setActionError(t('kunstenaarsExclusiviteitOngeldig'));
        return;
      }
    }
    setActionError(null);
    setKlant1Id(nextKlant1);
    setKlant2Id(nextKlant2);
  }
```

- [ ] **Step 7: Replace the checkbox `<fieldset>` with two Comboboxes**

Change:
```tsx
          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs uppercase tracking-wide text-white/60">
              {t('kunstenaarsLabelKlant')}
            </legend>
            {(klanten ?? []).map((klant) => {
              const huidigeKunstenaarId = modalState?.mode === 'edit' ? modalState.kunstenaar.id : null;
              const isChecked = exclusieveKlantIds.includes(klant.id);
              const isDisabled = !isChecked && exclusieveKlantIds.length >= 2;
              return (
                <label key={klant.id} className="flex items-center gap-2 text-sm text-white/80">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={isDisabled}
                    onChange={() => toggleExclusieveKlant(klant.id, huidigeKunstenaarId)}
                    data-testid={`kunstenaar-modal-klant-${klant.id}`}
                  />
                  {klant.companyName}
                </label>
              );
            })}
          </fieldset>
```
to:
```tsx
          <fieldset className="flex flex-col gap-3">
            <legend className="text-xs uppercase tracking-wide text-white/60">
              {t('kunstenaarsLabelKlant')}
            </legend>
            <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
              {t('kunstenaarsLabelKlant1')}
              <Combobox
                options={(klanten ?? [])
                  .filter((klant) => klant.id !== klant2Id)
                  .map((klant) => ({ value: klant.id, label: klant.companyName }))}
                value={klant1Id}
                onChange={(value) => selectKlant('klant1', value)}
                placeholder={t('kunstenaarsKlantPlaceholder')}
                noResultsLabel={t('kunstenaarsKlantGeenResultaten')}
                clearLabel={t('kunstenaarsKlantGeen')}
                testId="kunstenaar-modal-klant-1"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
              {t('kunstenaarsLabelKlant2')}
              <Combobox
                options={(klanten ?? [])
                  .filter((klant) => klant.id !== klant1Id)
                  .map((klant) => ({ value: klant.id, label: klant.companyName }))}
                value={klant2Id}
                onChange={(value) => selectKlant('klant2', value)}
                placeholder={t('kunstenaarsKlantPlaceholder')}
                noResultsLabel={t('kunstenaarsKlantGeenResultaten')}
                clearLabel={t('kunstenaarsKlantGeen')}
                testId="kunstenaar-modal-klant-2"
              />
            </label>
          </fieldset>
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/KunstenaarsSection.test.tsx`
Expected: PASS (29 tests).

- [ ] **Step 9: Run the full test suite for regressions**

Run: `npx vitest run`
Expected: PASS, same pass count as the pre-change baseline (no other file references `toggleExclusieveKlant`, `exclusieveKlantIds` as component state, or the old `kunstenaar-modal-klant-<klantId>` test id).

- [ ] **Step 10: Commit**

```bash
git add src/components/beheer/KunstenaarsSection.tsx tests/components/beheer/KunstenaarsSection.test.tsx
git commit -m "feat: replace exclusieve-klanten checkboxes with two searchable comboboxes"
```

---

### Task 3: Manual verification in the browser

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Open the Kunstenaars beheer screen and exercise the new fields**

Navigate to `/nl/beheer` (Kunstenaars tab), open an existing kunstenaar (or add one), and confirm:
- "Klant 1" and "Klant 2" each show a text input that filters the klanten list as you type.
- Picking the same klant in both fields is not offered (already selected in one is missing from the other's list).
- Picking a second klant that isn't the kunstenaar's own linked klant shows the existing inline error and leaves that field empty.
- Saving with 0, 1, or 2 (valid) klanten works and the table's summary column still lists the right klant name(s) afterwards.

- [ ] **Step 3: Stop the dev server once confirmed**
