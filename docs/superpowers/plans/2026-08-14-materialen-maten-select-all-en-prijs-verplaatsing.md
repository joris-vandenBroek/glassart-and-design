# Materialen/Maten select-all + prijs per m² naar Materiaal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a select-all/deselect-all toggle to the Materialen and Maten checkbox lists in
the kunstwerk form, and move "prijs per m²" from Kunstwerk to Materiaal for every kunstwerk
that has at least one materiaal linked (materiaalloze kunstwerken keep pricing it on the
kunstwerk itself, since they have no materiaal to hang a price on).

**Architecture:** Two independent slices sharing one file
(`src/components/beheer/KunstwerkenSection.tsx`). Slice A is pure client-side state/JSX. Slice
B adds a nullable `prijsPerM2` column to `materialen`, adds the field to the Materiaal
admin form, narrows the existing Kunstwerk-level price field to only the "materiaalloos" case,
and updates the three server call sites that price a bestellijn to prefer the chosen
materiaal's price over the kunstwerk's once the kunstwerk has materialen.

**Tech Stack:** Next.js 14 (App Router), TypeScript, MySQL (raw `mysql2`, no ORM), Vitest +
Testing Library, `next-intl`.

## Global Constraints

- Tests run against the real shared staging MySQL database (`tests/setup.ts` loads
  `.env.local`) — no mocking. `vitest.config.ts` has `fileParallelism: false`; don't change
  that.
- Any test that inserts a row must clean up exactly that row (by captured id) in
  `afterEach`/`finally` — never a blanket `DELETE FROM <table>` with no `WHERE`. Wrap each
  cleanup table in its own `try/catch` (or the existing `veiligOpruimen` helper) so one
  table's cleanup failure doesn't skip the rest.
- Beheer-only UI strings go in `messages/nl.json` only (no en/de/fr — this app is Dutch-only
  for beheer).
- Follow existing patterns in the touched files rather than introducing new ones (e.g. no new
  form-library, no new state-management pattern).
- Full design context: `docs/superpowers/specs/2026-08-14-materialen-maten-select-all-en-prijs-verplaatsing-design.md`.

---

## Part A — Select-all toggle for Materialen and Maten

### Task 1: `alleGeselecteerd` helper + select-all toggle for the Materialen tab

**Files:**
- Modify: `src/components/beheer/KunstwerkenSection.tsx:51-53` (near the existing `toggle`
  helper), and the Materialen tab render block (currently lines ~1106-1123)
- Modify: `messages/nl.json` (beheer block, near `kunstwerkenLabelMaterialen`)
- Test: `tests/components/beheer/KunstwerkenSection.test.tsx`

**Interfaces:**
- Produces: `alleGeselecteerd(alleIds: string[], huidigeIds: string[]): boolean`, exported
  from the same module scope as the existing `toggle()` — used again by Task 2.

- [ ] **Step 1: Write the failing tests**

Add to `tests/components/beheer/KunstwerkenSection.test.tsx`, inside the `describe` block that
covers the Materialen tab (find the existing tests that click
`kunstwerk-modal-materiaal-mat-1` for the right place/imports/fixtures to match):

```tsx
it('toggles all materialen on and off with the select-all link', () => {
  renderSection();
  fireEvent.click(screen.getByTestId('kunstwerken-add'));
  expect(screen.getByTestId('kunstwerk-modal-materialen-allesToggle')).toHaveTextContent(
    'Alles selecteren'
  );

  fireEvent.click(screen.getByTestId('kunstwerk-modal-materialen-allesToggle'));
  expect(screen.getByTestId('kunstwerk-modal-materiaal-mat-1')).toBeChecked();
  expect(screen.getByTestId('kunstwerk-modal-materiaal-mat-2')).toBeChecked();
  expect(screen.getByTestId('kunstwerk-modal-materialen-allesToggle')).toHaveTextContent(
    'Alles deselecteren'
  );

  fireEvent.click(screen.getByTestId('kunstwerk-modal-materialen-allesToggle'));
  expect(screen.getByTestId('kunstwerk-modal-materiaal-mat-1')).not.toBeChecked();
  expect(screen.getByTestId('kunstwerk-modal-materiaal-mat-2')).not.toBeChecked();
  expect(screen.getByTestId('kunstwerk-modal-materialen-allesToggle')).toHaveTextContent(
    'Alles selecteren'
  );
});

it('shows "Alles deselecteren" once every materiaal is already checked individually', () => {
  renderSection();
  fireEvent.click(screen.getByTestId('kunstwerken-add'));
  fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-1'));
  fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-2'));
  expect(screen.getByTestId('kunstwerk-modal-materialen-allesToggle')).toHaveTextContent(
    'Alles deselecteren'
  );
});
```

Check the existing test file's `MATERIALEN` fixture near the top — it must have at least two
entries (`mat-1`, `mat-2`) for this test to be meaningful; the file already uses those ids
elsewhere (see the tests around line 564-679 read during planning), so no fixture change
should be needed.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx -t "select-all"`
Expected: FAIL — `kunstwerk-modal-materialen-allesToggle` not found.

- [ ] **Step 3: Add the helper and the translation keys**

In `src/components/beheer/KunstwerkenSection.tsx`, right after the existing `toggle` function
(around line 51-53):

```ts
function alleGeselecteerd(alleIds: string[], huidigeIds: string[]): boolean {
  return alleIds.length > 0 && alleIds.every((id) => huidigeIds.includes(id));
}
```

In `messages/nl.json`, beheer block, next to `"kunstwerkenLabelMaterialen": "Materialen",`:

```json
    "kunstwerkenAllesSelecteren": "Alles selecteren",
    "kunstwerkenAllesDeselecteren": "Alles deselecteren",
```

- [ ] **Step 4: Add the toggle link above the Materialen checkbox list**

Find the Materialen tab render block (the `<label>` for `kunstwerkenLabelMaterialen` followed
by the `{(materialen ?? []).map((materiaal) => ...)}` list, around line 1106-1123). Add a
button right after the label/heading and before the `.map()`:

```tsx
<button
  type="button"
  onClick={() => {
    const alleIds = (materialen ?? []).map((materiaal) => materiaal.id);
    setMateriaalIds(alleGeselecteerd(alleIds, materiaalIds) ? [] : alleIds);
  }}
  data-testid="kunstwerk-modal-materialen-allesToggle"
  className="text-xs text-white/60 underline hover:text-white"
>
  {alleGeselecteerd(
    (materialen ?? []).map((materiaal) => materiaal.id),
    materiaalIds
  )
    ? t('kunstwerkenAllesDeselecteren')
    : t('kunstwerkenAllesSelecteren')}
</button>
```

There's no existing lightweight inline text-link in this file to copy exactly (the closest
precedent, `kunstwerken-backfill-materialen-maten` around line 692-700, is a full bordered
button meant for a table header, not an inline toggle above a checkbox list) — the
`text-xs text-white/60 underline hover:text-white` classes above are a deliberate minimal
choice consistent with this file's dark theme (`text-white/60` bodies, `hover:text-white`),
not a placeholder.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx -t "select-all\|materiaal"`
Expected: PASS

- [ ] **Step 6: Run the full file to check for regressions**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/beheer/KunstwerkenSection.tsx messages/nl.json tests/components/beheer/KunstwerkenSection.test.tsx
git commit -m "feat: select-all toggle for Materialen in kunstwerk-formulier"
```

### Task 2: Select-all toggle for the Maten tab (respecting incompatible maten)

**Files:**
- Modify: `src/components/beheer/KunstwerkenSection.tsx` (Maten tab render block, currently
  lines ~1125-1149)
- Test: `tests/components/beheer/KunstwerkenSection.test.tsx`

**Interfaces:**
- Consumes: `alleGeselecteerd` from Task 1.

- [ ] **Step 1: Write the failing tests**

```tsx
it('toggles only the compatible maten on and off with the select-all link', async () => {
  renderSection();
  fireEvent.click(screen.getByTestId('kunstwerken-add'));
  fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-vierkant'));
  // 'vierkant' makes only maat-3 (square) selectable; maat-1/maat-2 stay disabled.
  await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-maat-maat-3')).toBeChecked());
  fireEvent.click(screen.getByTestId('kunstwerk-modal-maat-maat-3')); // uncheck it first

  expect(screen.getByTestId('kunstwerk-modal-maten-allesToggle')).toHaveTextContent(
    'Alles selecteren'
  );
  fireEvent.click(screen.getByTestId('kunstwerk-modal-maten-allesToggle'));
  expect(screen.getByTestId('kunstwerk-modal-maat-maat-3')).toBeChecked();
  expect(screen.getByTestId('kunstwerk-modal-maat-maat-1')).not.toBeChecked();
  expect(screen.getByTestId('kunstwerk-modal-maten-allesToggle')).toHaveTextContent(
    'Alles deselecteren'
  );

  fireEvent.click(screen.getByTestId('kunstwerk-modal-maten-allesToggle'));
  expect(screen.getByTestId('kunstwerk-modal-maat-maat-3')).not.toBeChecked();
});
```

The file's `MATEN` fixture (line 49-52) is `maat-1` (40×60), `maat-2` (60×90), `maat-3`
(50×50, the square one) — confirmed, so the ids above are exact.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx -t "compatible maten"`
Expected: FAIL — `kunstwerk-modal-maten-allesToggle` not found.

- [ ] **Step 3: Add the toggle link above the Maten checkbox list**

In the Maten tab render block (lines ~1125-1149), the existing code already computes
`incompatibel` per maat inside the `.map()`. Before the `.map()`, compute the compatible id
list once:

```tsx
const compatibeleMaatIds = (maten ?? [])
  .filter((maat) => {
    if (formaat === null || formaat === 'alle') return true;
    return formaat === 'vierkant' ? isVierkanteMaat(maat) : !isVierkanteMaat(maat);
  })
  .map((maat) => maat.id);
```

Then, right after the Maten label/heading and before the list:

```tsx
<button
  type="button"
  onClick={() =>
    setMaatIds(alleGeselecteerd(compatibeleMaatIds, maatIds) ? [] : compatibeleMaatIds)
  }
  data-testid="kunstwerk-modal-maten-allesToggle"
  className="text-xs text-white/60 underline hover:text-white"
>
  {alleGeselecteerd(compatibeleMaatIds, maatIds)
    ? t('kunstwerkenAllesDeselecteren')
    : t('kunstwerkenAllesSelecteren')}
</button>
```

Reuse the same `kunstwerkenAllesSelecteren`/`kunstwerkenAllesDeselecteren` keys from Task 1 —
no new translation keys needed.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/KunstwerkenSection.tsx tests/components/beheer/KunstwerkenSection.test.tsx
git commit -m "feat: select-all toggle for Maten in kunstwerk-formulier"
```

---

## Part B — Prijs per m² naar Materiaal

### Task 3: Migration, schema, allow-list and type for `materialen.prijsPerM2`

**Files:**
- Create: `db/migrations/2026-08-14-prijs-per-m2-materiaal.sql`
- Modify: `db/schema.sql` (`materialen` table definition)
- Modify: `src/lib/server/tableColumns.ts` (`materialen` entry)
- Modify: `src/components/beheer/materiaalTypes.ts` (`Materiaal` interface)

**Interfaces:**
- Produces: `Materiaal.prijsPerM2?: number` — consumed by Tasks 4, 6, 7, 8.

- [ ] **Step 1: Write the migration**

`db/migrations/2026-08-14-prijs-per-m2-materiaal.sql`:

```sql
-- Voegt prijsPerM2 toe aan materialen zodat kunstwerken met een gekoppeld materiaal hun
-- maatloze prijs voortaan van het materiaal halen in plaats van van het kunstwerk.
-- kunstwerken.prijsPerM2 blijft bestaan (nog steeds nodig voor materiaalloze kunstwerken,
-- bv. Akoestische stof, die geen materiaal hebben om de prijs aan te hangen).
-- Ontwerp: docs/superpowers/specs/2026-08-14-materialen-maten-select-all-en-prijs-verplaatsing-design.md
--
-- Zuivere toevoeging, geen drop -- geen risicovenster tussen migratie en deploy nodig.
ALTER TABLE materialen ADD COLUMN prijsPerM2 DECIMAL(10,2);
```

- [ ] **Step 2: Apply the migration to staging**

Run: `npm run db:migrate -- staging`
Expected: reports the new migration applied. Tests in later tasks need this column to exist
on the shared staging database.

- [ ] **Step 3: Update `db/schema.sql`**

Find the `materialen` table definition (around line 95-104) and add the column, matching the
existing `kunstwerken.prijsPerM2` column style:

```sql
CREATE TABLE materialen (
  id CHAR(36) PRIMARY KEY,
  materiaalsoortId CHAR(36) NOT NULL,
  materiaaldikte DECIMAL(5,1) NOT NULL,
  prijsPerM2 DECIMAL(10,2),
  omschrijvingNl VARCHAR(255) NOT NULL,
  omschrijvingFr VARCHAR(255),
  omschrijvingDe VARCHAR(255),
  omschrijvingEn VARCHAR(255),
  FOREIGN KEY (materiaalsoortId) REFERENCES materiaalsoorten(id)
);
```

- [ ] **Step 4: Add `prijsPerM2` to the `materialen` allow-list**

In `src/lib/server/tableColumns.ts`, find the `materialen` entry (around line 62-70):

```ts
materialen: ['id', 'materiaalsoortId', 'materiaaldikte', 'prijsPerM2', 'omschrijvingNl', 'omschrijvingFr', 'omschrijvingDe', 'omschrijvingEn'],
```

Leave the `kunstwerken` entry's `prijsPerM2` untouched.

- [ ] **Step 5: Add the field to the `Materiaal` type**

In `src/components/beheer/materiaalTypes.ts`:

```ts
export interface Materiaal {
  id: string;
  materiaalsoortId: string;
  materiaaldikte: number;
  prijsPerM2?: number;
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;
}
```

Leave the `Kunstwerk` interface's `prijsPerM2?: number` field untouched.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (existing code that builds a `Materiaal` object without `prijsPerM2`
still compiles, since the field is optional).

- [ ] **Step 7: Commit**

```bash
git add db/migrations/2026-08-14-prijs-per-m2-materiaal.sql db/schema.sql src/lib/server/tableColumns.ts src/components/beheer/materiaalTypes.ts
git commit -m "feat: voeg prijsPerM2 toe aan materialen (schema, allow-list, type)"
```

### Task 4: "Prijs per m²" field in the Materiaal admin form

**Files:**
- Modify: `src/components/beheer/MaterialenSection.tsx`
- Test: `tests/components/beheer/MaterialenSection.test.tsx`

**Interfaces:**
- Consumes: `Materiaal.prijsPerM2` from Task 3.

- [ ] **Step 1: Update the test fixtures and existing tests that will otherwise break**

The `MATERIALEN` fixture (`tests/components/beheer/MaterialenSection.test.tsx:38-57`) needs a
`prijsPerM2` on both entries so the "opens a row for editing pre-filled" test can assert a
pre-filled value:

```ts
const MATERIALEN: Materiaal[] = [
  {
    id: 'mat-1',
    materiaalsoortId: 'soort-1',
    materiaaldikte: 4,
    prijsPerM2: 65,
    omschrijvingNl: 'Kristalhelder',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
  {
    id: 'mat-2',
    materiaalsoortId: 'soort-2',
    materiaaldikte: 3,
    prijsPerM2: 40,
    omschrijvingNl: 'Licht en helder',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
];
```

Update the "adds a new materiaal..." test (line 109-128) to fill in the new required field and
expect it in the `onAdd` call:

```ts
it('adds a new materiaal with the selected materiaalsoort, dikte, prijs per m2 and omschrijving', async () => {
  const { onAdd } = renderSection();
  fireEvent.click(screen.getByTestId('materialen-add'));
  fireEvent.change(screen.getByTestId('materiaal-modal-materiaalsoort'), { target: { value: 'soort-2' } });
  fireEvent.change(screen.getByTestId('materiaal-modal-dikte'), { target: { value: '5' } });
  fireEvent.change(screen.getByTestId('materiaal-modal-prijs-per-m2'), { target: { value: '80' } });
  fireEvent.change(screen.getByTestId('materiaal-modal-omschrijving'), {
    target: { value: 'Extra diepte' },
  });
  fireEvent.click(screen.getByTestId('materiaal-modal-opslaan'));
  await waitFor(() =>
    expect(onAdd).toHaveBeenCalledWith({
      materiaalsoortId: 'soort-2',
      materiaaldikte: 5,
      prijsPerM2: 80,
      omschrijvingNl: 'Extra diepte',
      omschrijvingFr: '',
      omschrijvingDe: '',
      omschrijvingEn: '',
    })
  );
});
```

Update the "opens a row for editing pre-filled" test (line 130-147) to also assert/change the
new field:

```ts
it('opens a row for editing pre-filled, and updates it', async () => {
  const { onUpdate } = renderSection();
  fireEvent.click(screen.getByTestId('data-table-row-mat-1'));
  expect(screen.getByTestId('materiaal-modal-materiaalsoort')).toHaveValue('soort-1');
  expect(screen.getByTestId('materiaal-modal-dikte')).toHaveValue(4);
  expect(screen.getByTestId('materiaal-modal-prijs-per-m2')).toHaveValue(65);
  fireEvent.change(screen.getByTestId('materiaal-modal-dikte'), { target: { value: '6' } });
  fireEvent.change(screen.getByTestId('materiaal-modal-prijs-per-m2'), { target: { value: '70' } });
  fireEvent.click(screen.getByTestId('materiaal-modal-opslaan'));
  await waitFor(() =>
    expect(onUpdate).toHaveBeenCalledWith('mat-1', {
      materiaalsoortId: 'soort-1',
      materiaaldikte: 6,
      prijsPerM2: 70,
      omschrijvingNl: 'Kristalhelder',
      omschrijvingFr: '',
      omschrijvingDe: '',
      omschrijvingEn: '',
    })
  );
});
```

Update "accepts 0 as a valid dikte" (line 149-157) to also fill in a valid `prijsPerM2` so the
save button isn't blocked by the new required field:

```ts
it('accepts 0 as a valid dikte', async () => {
  const { onAdd } = renderSection();
  fireEvent.click(screen.getByTestId('materialen-add'));
  fireEvent.change(screen.getByTestId('materiaal-modal-dikte'), { target: { value: '0' } });
  fireEvent.change(screen.getByTestId('materiaal-modal-prijs-per-m2'), { target: { value: '50' } });
  fireEvent.change(screen.getByTestId('materiaal-modal-omschrijving'), { target: { value: 'Stof' } });
  expect(screen.getByTestId('materiaal-modal-opslaan')).not.toBeDisabled();
  fireEvent.click(screen.getByTestId('materiaal-modal-opslaan'));
  await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ materiaaldikte: 0 })));
});
```

Add two new tests for the required-field behaviour of the new field specifically:

```ts
it('disables opslaan while prijs per m2 is empty', () => {
  renderSection();
  fireEvent.click(screen.getByTestId('materialen-add'));
  fireEvent.change(screen.getByTestId('materiaal-modal-dikte'), { target: { value: '4' } });
  fireEvent.change(screen.getByTestId('materiaal-modal-omschrijving'), { target: { value: 'Stof' } });
  expect(screen.getByTestId('materiaal-modal-opslaan')).toBeDisabled();
});

it('disables opslaan when prijs per m2 is 0 or negative', () => {
  renderSection();
  fireEvent.click(screen.getByTestId('materialen-add'));
  fireEvent.change(screen.getByTestId('materiaal-modal-dikte'), { target: { value: '4' } });
  fireEvent.change(screen.getByTestId('materiaal-modal-omschrijving'), { target: { value: 'Stof' } });
  fireEvent.change(screen.getByTestId('materiaal-modal-prijs-per-m2'), { target: { value: '0' } });
  expect(screen.getByTestId('materiaal-modal-opslaan')).toBeDisabled();
  fireEvent.change(screen.getByTestId('materiaal-modal-prijs-per-m2'), { target: { value: '-5' } });
  expect(screen.getByTestId('materiaal-modal-opslaan')).toBeDisabled();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/MaterialenSection.test.tsx`
Expected: FAIL — `materiaal-modal-prijs-per-m2` not found; existing add/edit tests fail on the
missing key in the expected `onAdd`/`onUpdate` payload.

- [ ] **Step 3: Add the field to `MaterialenSection.tsx`**

Add state near the other field state (around line 38-43):

```ts
const [prijsPerM2, setPrijsPerM2] = useState('');
```

In `openAdd()` (around line 69-78), reset it:

```ts
setPrijsPerM2('');
```

In `openEdit()` (around line 80-89), pre-fill it:

```ts
setPrijsPerM2(materiaal.prijsPerM2 != null ? String(materiaal.prijsPerM2) : '');
```

In `handleSave()`'s `data` object (around line 97-104):

```ts
const data = {
  materiaalsoortId,
  materiaaldikte: Number(materiaaldikte),
  prijsPerM2: Number(prijsPerM2),
  omschrijvingNl,
  omschrijvingFr,
  omschrijvingDe,
  omschrijvingEn,
};
```

Add the required-clause to the opslaan button's `disabled` condition (around line 181):

```tsx
disabled={!materiaalsoortId || materiaaldikte === '' || !prijsPerM2 || Number(prijsPerM2) <= 0 || !omschrijvingNl}
```

Add the input itself, right after the "Dikte" field block (after line 231, before the
"Omschrijving NL" label block):

```tsx
<label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
  <span>
    {t('materialenLabelPrijsPerM2')}
    <RequiredMark />
  </span>
  <input
    type="number"
    value={prijsPerM2}
    onChange={(event) => setPrijsPerM2(event.target.value)}
    data-testid="materiaal-modal-prijs-per-m2"
    className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
  />
</label>
```

- [ ] **Step 4: Add the translation key**

In `messages/nl.json`, beheer block, next to `"materialenLabelDikte": "Dikte (mm)",`:

```json
    "materialenLabelPrijsPerM2": "Prijs per m² (€)",
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/MaterialenSection.test.tsx`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/beheer/MaterialenSection.tsx messages/nl.json tests/components/beheer/MaterialenSection.test.tsx
git commit -m "feat: verplicht veld prijs per m2 op het materiaal-formulier"
```

### Task 5: Narrow the Kunstwerk-level price field to the materiaalloos case

**Files:**
- Modify: `src/components/beheer/KunstwerkenSection.tsx`
- Test: `tests/components/beheer/KunstwerkenSection.test.tsx`

**Interfaces:**
- Consumes: existing `isMaatloos` (line 256) and `isMateriaalloos` (line 253) locals — no
  change to their definitions, only to which one gates the price field.

- [ ] **Step 1: Update the test that currently expects the field for "maatloos-met-materiaal"**

The test `'shows a "Prijs per m²" field and allows opslaan when a materiaal is chosen but
every maat is unchecked, regardless of formaat'` (line 608-643) currently asserts the OLD
behaviour. Replace it with a test asserting the NEW behaviour — the field must NOT appear, and
opslaan must NOT require a price, once a materiaal is chosen but no maat is:

```ts
it('does not show the "Prijs per m²" field when a materiaal is chosen but every maat is unchecked (price now lives on the materiaal)', async () => {
  uploadMock.mockResolvedValue('https://storage.example.com/nieuw.jpg');
  const { onAdd } = renderSection();
  fireEvent.click(screen.getByTestId('kunstwerken-add'));
  fireEvent.click(screen.getByTestId('kunstwerk-modal-segment-seg-1'));
  fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-vierkant'));
  // 'vierkant' auto-selects only the square maat (maat-3); unchecking it leaves 0 maten
  // while mat-1/mat-2 stay checked -- "materiaal wel, maat niet" -- not materiaalloos.
  fireEvent.click(screen.getByTestId('kunstwerk-modal-maat-maat-3'));

  expect(screen.queryByTestId('kunstwerk-modal-prijzen')).not.toBeInTheDocument();
  expect(screen.queryByTestId('kunstwerk-modal-prijs-per-m2')).not.toBeInTheDocument();

  const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
  fireEvent.change(screen.getByTestId('kunstwerk-modal-foto-input'), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-foto-preview')).toBeInTheDocument());
  fireEvent.change(screen.getByTestId('kunstwerk-modal-code'), { target: { value: 'GLA-VEI-00001' } });
  fireEvent.change(screen.getByTestId('kunstwerk-modal-kunstenaar'), { target: { value: 'KU-00001' } });
  fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Op maat gezaagd.' } });
  // No prijs-per-m2 filled in -- save should still be enabled, price comes from the materiaal now.
  expect(screen.getByTestId('kunstwerk-modal-opslaan')).not.toBeDisabled();
  fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

  await waitFor(() =>
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        formaat: 'vierkant',
        materiaalIds: ['mat-1', 'mat-2'],
        maatIds: [],
      })
    )
  );
  const laatsteAdd = onAdd.mock.calls[onAdd.mock.calls.length - 1][0];
  expect(laatsteAdd).not.toHaveProperty('prijsPerM2');
});
```

Leave the test right after it (`'does not show the "kies minimaal één maat" hint...'`,
line 645-660) unchanged — it doesn't touch the price field.

Leave the materiaalloos test (`'shows a "Prijs per m²" field instead of the price matrix once
every materiaal is unchecked, and saves it'`, line 564-606) unchanged — that scenario
(`materiaalIds: []`) is still `isMateriaalloos`, so the field must still appear and still be
required there.

Leave the backfill tests at line 543-562 and 662-679 unchanged — they test button-counting
logic, not the price field, and the `Kunstwerk` type still carries `prijsPerM2` so those
fixtures remain valid.

- [ ] **Step 2: Run the changed test to verify it fails against the current code**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx -t "does not show the .Prijs per m². field when a materiaal is chosen"`
Expected: FAIL — the field is currently shown and the save button is currently disabled
without a price, because the code still keys off `isMaatloos`.

- [ ] **Step 3: Swap the gating condition from `isMaatloos` to `isMateriaalloos`**

In `buildKunstwerkData()` (around line 311):

```ts
return isMateriaalloos ? { ...basis, prijsPerM2: Number(prijsPerM2) } : basis;
```

In the `matenHeeftFout`/`opslaanDisabled` computations (around line 513 and 521):

```ts
const matenHeeftFout = isMateriaalloos && (!prijsPerM2 || Number(prijsPerM2) <= 0);
```

```ts
const opslaanDisabled =
  !foto ||
  formaat === null ||
  uploading ||
  !code.trim() ||
  kunstenaarHeeftFout ||
  (isMateriaalloos && (!prijsPerM2 || Number(prijsPerM2) <= 0)) ||
  !omschrijvingNl;
```

In the render block, the price-field wrapper condition (around line 1151):

```tsx
{isMateriaalloos && (
```

(The rest of that block — the input, its `data-testid="kunstwerk-modal-prijs-per-m2"`, its
error styling and hint text — stays exactly as it is; only the wrapping condition changes.)

Do not touch `isMaatloos` itself (line 256) or the matrix-prijsvoorbeeld `useEffect` (line
260-292) — both keep using `isMaatloos` for their existing, unrelated purpose (deciding
matrix vs. formule pricing path, and whether to fetch a matrix preview).

- [ ] **Step 4: Run the full file to check for regressions**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/KunstwerkenSection.tsx tests/components/beheer/KunstwerkenSection.test.tsx
git commit -m "fix: prijs-per-m2-veld op kunstwerk alleen nog voor materiaalloze kunstwerken"
```

### Task 6: `bestellijnPrijsResolver.ts` prefers the materiaal's price once the kunstwerk has materialen

**Files:**
- Modify: `src/lib/server/bestellijnPrijsResolver.ts`
- Test: `tests/app/api/bestelheaders-prijsvoorbeeld.test.ts`

**Interfaces:**
- Consumes: `materialen.prijsPerM2` (Task 3), unchanged `berekenBestellijnPrijs` signature
  from `prijsmodule.ts` (no change in this plan).

- [ ] **Step 1: Write the failing test**

Add to `tests/app/api/bestelheaders-prijsvoorbeeld.test.ts`, in the same `describe` block as
the existing `'geeft op-aanvraag voor eigen-maat zonder matrixprijs en berekent via
prijsPerM2 met breedte/hoogte'` test (line 183-197):

```ts
it('gebruikt de prijsPerM2 van het materiaal, niet van het kunstwerk, zodra het kunstwerk materialen heeft', async () => {
  const klant = await maakKlant('prijsvoorbeeld-materiaal-prijs@example.com');
  const header = await maakBestelling(klant.klantnr);
  const materiaalId = await maakMateriaal();
  await getPool().query('UPDATE materialen SET prijsPerM2 = ? WHERE id = ?', [150, materiaalId]);
  // kunstwerk.prijsPerM2 zelf blijft ingevuld (bv. nog niet opgeruimde oude data) -- moet
  // genegeerd worden zodra er een materiaal gekoppeld is.
  const kunstwerk = await maakKunstwerk('AUTOTEST-pv-materiaalprijs', materiaalId, '', null, 999);

  const url = new URL(
    `http://localhost/api?kunstwerkId=${kunstwerk.id}&materiaalId=${materiaalId}&maatId=&breedte=100&hoogte=50`
  );
  const cookie = await medewerkerCookie();
  const response = await prijsvoorbeeld(new Request(url, { headers: { cookie } }), { params: { id: header.id } });
  expect(response.status).toBe(200);
  // 1m x 0.5m x 150/m2 = 75 -- van het materiaal, niet de 999 van het kunstwerk.
  expect(await response.json()).toEqual({ status: 'vast', code: 'AUTOTEST-pv-materiaalprijs', prijs: 75 });
});
```

Note this reuses the file's existing `maakMateriaal()` and `maakKunstwerk()` helpers as-is
(no signature change needed — the test sets the materiaal's price with a direct `UPDATE`
after creating it, since `maakMateriaal()` doesn't take a price parameter).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/app/api/bestelheaders-prijsvoorbeeld.test.ts -t "prijsPerM2 van het materiaal"`
Expected: FAIL — 75 expected, actual would be based on the kunstwerk's 999 (2970).

- [ ] **Step 3: Update `resolveerBestellijnPrijs`**

In `src/lib/server/bestellijnPrijsResolver.ts`, after `materiaalIds` is computed (line 54) and
the existing "materiaal-niet-beschikbaar" check (line 56-58), insert:

```ts
let effectievePrijsPerM2 = kunstwerk.prijsPerM2;
if (materiaalIds.length > 0) {
  const [materiaalRows] = await connection.query('SELECT prijsPerM2 FROM materialen WHERE id = ?', [
    input.materiaalId,
  ]);
  const materiaalRow = (materiaalRows as Array<{ prijsPerM2: string | null }>)[0];
  effectievePrijsPerM2 = materiaalRow?.prijsPerM2 != null ? Number(materiaalRow.prijsPerM2) : null;
}
```

Then change the `berekenBestellijnPrijs` call (line 72-77) to use it instead of
`kunstwerk.prijsPerM2`:

```ts
const resultaat = await berekenBestellijnPrijs(
  connection,
  { kunstenaarnr: kunstwerk.kunstenaarnr, maatIds, prijsPerM2: effectievePrijsPerM2 },
  input,
  klantId
);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/app/api/bestelheaders-prijsvoorbeeld.test.ts`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/bestellijnPrijsResolver.ts tests/app/api/bestelheaders-prijsvoorbeeld.test.ts
git commit -m "fix: prijsvoorbeeld gebruikt materiaal-prijs zodra het kunstwerk materialen heeft"
```

### Task 7: `bestelheaders/route.ts` prefers the materiaal's price the same way

**Files:**
- Modify: `src/app/api/bestelheaders/route.ts`
- Test: `tests/app/api/bestelheaders.test.ts`

**Interfaces:**
- Same precedence rule as Task 6, duplicated here because this route computes the price
  itself rather than calling `resolveerBestellijnPrijs`.

- [ ] **Step 1: Write the failing test**

Add to `tests/app/api/bestelheaders.test.ts`, near the existing maatloos test (line 319-341):

```ts
it('uses the materiaal\'s prijsPerM2, not the kunstwerk\'s, once a materiaal is linked', async () => {
  const { cookie } = await klant('materiaal-prijs@example.com');
  const materiaalId = await maakMateriaal();
  await getPool().query('UPDATE materialen SET prijsPerM2 = ? WHERE id = ?', [150, materiaalId]);
  const kunstwerk = await insertRow<{ id: string }>('kunstwerken', {
    code: 'test-bestelheaders-materiaalprijs',
    prijsPerM2: 999,
  } as never);
  createdKunstwerkIds.push(kunstwerk.id);
  await vervangRelaties(getPool(), kunstwerk.id, { materiaalIds: [materiaalId], maatIds: [] });

  const response = await createHeader(
    postRequest(
      {
        lines: [
          {
            kunstwerkId: kunstwerk.id,
            maatId: '',
            materiaalId,
            prijs: 1,
            quantity: 1,
            breedte: 100,
            hoogte: 50,
          },
        ],
      },
      cookie
    )
  );
  expect(response.status).toBe(201);
  const body = await response.json();
  const [lineRows] = await getPool().query('SELECT prijs FROM bestellines WHERE bestelnr = ?', [body.bestelnr]);
  // 1m x 0.5m x 150/m2 (materiaal) = 75 -- niet 999 (kunstwerk).
  expect(Number((lineRows as Array<{ prijs: string }>)[0].prijs)).toBe(75);
});
```

This uses the file's existing `maakMateriaal()`, `vervangRelaties` (already imported, line 10)
and `insertRow`/`createdKunstwerkIds` cleanup pattern already used elsewhere in the file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/app/api/bestelheaders.test.ts -t "materiaal.s prijsPerM2"`
Expected: FAIL — price computed as 999×0.5 instead of 75.

- [ ] **Step 3: Update the route**

In `src/app/api/bestelheaders/route.ts`, after `haalRelatiesOpVoorEen` (line 102) and the
existing "materiaal-niet-beschikbaar" check (line 104-107), insert:

```ts
let effectievePrijsPerM2 =
  kunstwerkRow.prijsPerM2 != null ? Number(kunstwerkRow.prijsPerM2) : null;
if (materiaalIds.length > 0) {
  const [materiaalRows] = await connection.query('SELECT prijsPerM2 FROM materialen WHERE id = ?', [
    line.materiaalId,
  ]);
  const materiaalRow = (materiaalRows as Array<{ prijsPerM2: string | null }>)[0];
  effectievePrijsPerM2 = materiaalRow?.prijsPerM2 != null ? Number(materiaalRow.prijsPerM2) : null;
}
```

Then change the `berekenBestellijnPrijs` call (line 130-139) to use it:

```ts
const resultaat = await berekenBestellijnPrijs(
  connection,
  {
    kunstenaarnr: kunstwerkRow.kunstenaarnr,
    maatIds,
    prijsPerM2: effectievePrijsPerM2,
  },
  line,
  klantId
);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/app/api/bestelheaders.test.ts`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/bestelheaders/route.ts tests/app/api/bestelheaders.test.ts
git commit -m "fix: bestelheaders-route gebruikt materiaal-prijs zodra het kunstwerk materialen heeft"
```

### Task 8: `ProductModal.tsx` live prijsvoorbeeld uses the materiaal's price

**Files:**
- Modify: `src/components/ProductModal.tsx`
- Test: `tests/components/ProductModal.test.tsx`

**Interfaces:**
- Consumes: `materialen` prop (already passed in, `Materiaal[] | null`), `materiaalId` state
  and `geselecteerdMateriaal`/`isMateriaalloos` locals (already computed at lines 153, 158).

- [ ] **Step 1: Update the fixtures**

In `tests/components/ProductModal.test.tsx`, move the price from the kunstwerk fixture to the
materiaal fixture. Change `MATERIALEN` (line 41-44):

```ts
const MATERIALEN: Materiaal[] = [
  { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 4, prijsPerM2: 65, omschrijvingNl: 'Extra diepte en stevigheid voor een indrukwekkend effect.', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
  { id: 'mat-2', materiaalsoortId: 'soort-2', materiaaldikte: 3, omschrijvingNl: 'Lichtgewicht en flexibel voor grote oppervlaktes.', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
];
```

Change `MAATLOOS_MET_MATERIAAL_KUNSTWERK` (line 70-83) to drop its own `prijsPerM2` (the
materiaal now carries it):

```ts
const MAATLOOS_MET_MATERIAAL_KUNSTWERK: Kunstwerk = {
  id: 'kw-veiligheidsglas-per-m2',
  foto: 'https://example.com/veiligheidsglas.jpg',
  code: '4mm veiligheidsglas per m2',
  kunstenaarnr: null,
  segmentIds: [],
  materiaalIds: ['mat-1'],
  maatIds: [],
  omschrijvingNl: 'Op maat gezaagd 4mm veiligheidsglas.',
  omschrijvingFr: '',
  omschrijvingDe: '',
  omschrijvingEn: '',
};
```

Leave `MATERIAALLOOS_KUNSTWERK` (line 56-69, `prijsPerM2: 180` on the kunstwerk itself)
unchanged — that path still reads from the kunstwerk.

The tests at line 895-919 and 921+ (prijsberekening and add-to-cart for
`MAATLOOS_MET_MATERIAAL_KUNSTWERK`) keep their existing expected amounts (`€ 130,00` for
100×200cm at 65/m², `€ 360,00` for the bad-data fixture) — those numbers don't change, only
where the `65` now lives.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/ProductModal.test.tsx -t "maatloos-met-materiaal"`
Expected: FAIL — price now reads `undefined` from the kunstwerk, so no price/`€ 130,00` shown.

- [ ] **Step 3: Update `ProductModal.tsx`**

Around line 153, `geselecteerdMateriaal` and `isMateriaalloos` are already computed. Add a
resolved-price local right before `prijsPerM2Prijs` (currently around line 192):

```ts
const effectievePrijsPerM2 = isMateriaalloos ? kunstwerk.prijsPerM2 : geselecteerdMateriaal?.prijsPerM2;
```

Change `prijsPerM2Prijs` (line 192-198) to use it:

```ts
const prijsPerM2Prijs =
  isMaatloos && customSizeValid && effectievePrijsPerM2
    ? pasPrijsgroepToe(
        Math.round((customBreedteNum / 100) * (customHoogteNum / 100) * effectievePrijsPerM2 * 100) / 100,
        user?.prijsgroep ?? null
      )
    : null;
```

Change `canConfirm` (line 213-218) the same way:

```ts
const canConfirm =
  (isMaatloos
    ? customSizeValid && Boolean(effectievePrijsPerM2) && (effectievePrijsPerM2 ?? 0) > 0
    : isCustomSize
      ? customSizeValid
      : Boolean(prijsRegel)) && quantityValid;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/ProductModal.test.tsx`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ProductModal.tsx tests/components/ProductModal.test.tsx
git commit -m "fix: live prijsvoorbeeld gebruikt materiaal-prijs voor maatloos-met-materiaal kunstwerken"
```

### Task 9: Gebruikershandleiding bijwerken

**Files:**
- Modify: `src/components/beheer/documentatie/chapters/StamgegevensChapter.tsx`
- Modify: `src/components/beheer/documentatie/chapters/KunstwerkenChapter.tsx`

- [ ] **Step 1: Update the Materialen subsection text**

In `StamgegevensChapter.tsx`, the `stamgegevens-materialen` `SubSection` (line 21-26):

```tsx
<SubSection id="stamgegevens-materialen" title="Materialen">
  <P>
    Een specifieke uitvoering binnen een materiaalsoort, met een dikte — bijvoorbeeld &quot;6mm Glas
    — Blank helder&quot;. Elk materiaal hoort bij één materiaalsoort. Vul ook de prijs per m² in — die
    prijs gebruiken we voor elk kunstwerk met dit materiaal dat geen vaste maten heeft, bijvoorbeeld
    &quot;4mm veiligheidsglas, eigen maat&quot;.
  </P>
</SubSection>
```

- [ ] **Step 2: Update the kunstwerken-formaat subsection text**

In `KunstwerkenChapter.tsx`, the `kunstwerken-formaat` `SubSection` (line 62-77), replace the
paragraph about the "prijs per m²" field (line 72-76):

```tsx
<P>
  Vink geen enkel materiaal aan, dan verschijnt in plaats daarvan een veld &quot;prijs per
  m²&quot; op dit scherm — dat gebruiken we voor producten zonder materiaal, zoals akoestische
  stof. Heb je wél een materiaal gekozen maar geen vaste maat (bijvoorbeeld voor een product
  waarbij de klant zelf zijn breedte en hoogte opgeeft), dan komt de prijs per m² niet van dit
  scherm maar van het gekozen materiaal — zie{' '}
  <DocLink anchor="stamgegevens-materialen">Materialen</DocLink>.
</P>
```

This requires adding `DocLink` to the existing import line at the top of the file (check
whether it's already imported before adding it again).

- [ ] **Step 3: Verify the chapters still render**

Run: `npx vitest run tests/components/beheer/documentatie/chapterScreenshots.test.tsx`
Expected: PASS (this test only checks the screenshot `<img>` is present and the file exists on
disk — it doesn't check the prose, so it should already pass; run it to catch a broken import
or JSX typo).

- [ ] **Step 4: Commit**

```bash
git add src/components/beheer/documentatie/chapters/StamgegevensChapter.tsx src/components/beheer/documentatie/chapters/KunstwerkenChapter.tsx
git commit -m "docs: handleiding bijwerken voor prijs-per-m2 op materiaal"
```

### Task 10: Refresh the `stamgegevens.png` screenshot

**Files:**
- Modify: `public/documentatie/stamgegevens.png`

The screenshot's own caption says it shows the Materialen screen "as an example" of every
stamgegevens screen — since Task 4 added a new field to that exact screen, the screenshot is
now stale.

- [ ] **Step 1: Take the new screenshot**

Follow the project's established screenshot technique (claude-in-chrome MCP navigate to the
Materialen screen on staging beheer with the Stamgegevens menu expanded, as the existing
`alt` text describes → `gif_creator` with `download: true` → crop with PIL to match the
existing image's framing) to produce a new `stamgegevens.png` showing the Materialen table
and the add/edit modal with the new "Prijs per m²" field visible, then overwrite
`public/documentatie/stamgegevens.png`.

- [ ] **Step 2: Verify**

Run: `npx vitest run tests/components/beheer/documentatie/chapterScreenshots.test.tsx`
Expected: PASS (file-exists check only; visually confirm the new screenshot shows the price
field by opening `public/documentatie/stamgegevens.png` directly).

- [ ] **Step 3: Commit**

```bash
git add public/documentatie/stamgegevens.png
git commit -m "docs: screenshot vernieuwen voor prijs-per-m2-veld op materialen"
```

---

## Final full-suite check

- [ ] **Run the complete test suite once all tasks are done**

Run: `npm test`
Expected: all PASS. This is the first point where cross-task interactions (e.g. Task 5's
gating change combined with Task 6/7/8's pricing source change) get exercised together.

- [ ] **Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.
