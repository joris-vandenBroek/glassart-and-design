# Kunstwerk Formaat "Alle" + generieke maatloos-prijs-per-m² Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth `KunstwerkFormaat` value `'alle'` (selects every maat by default), generalize the existing "materiaalloos → Prijs per m²" mechanism so it also triggers whenever 0 maten are selected (even with a materiaal chosen), give the shown price in the klant-dialoog one shared "Prijs" label, and make the custom Breedte/Hoogte inputs provably equal width.

**Architecture:** No new tables/endpoints. `KunstwerkFormaat` gets a 4th literal value. `KunstwerkenSection.tsx` (beheer) and `ProductModal.tsx` (klant/preview) each get a new derived boolean (`isMaatloos`) that is a superset of the existing `isMateriaalloos`, replacing several `isMateriaalloos`-only checks. `ProductsGrid.tsx`'s formaat facet filter treats `'alle'` as matching every option.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind, `next-intl`, Vitest + Testing Library.

## Global Constraints

- Full spec: [docs/superpowers/specs/2026-07-30-kunstwerk-formaat-alle-design.md](../specs/2026-07-30-kunstwerk-formaat-alle-design.md).
- `npm test` runs the whole suite against the real shared staging MySQL database (see CLAUDE.md) — none of these tests touch the database (pure component tests), so no cleanup concerns apply here.
- Beheer-facing copy is Dutch-only (`messages/nl.json`); klant-facing copy needs all four locales (`nl`/`en`/`de`/`fr`).
- Every new/changed `data-testid` must follow the existing kebab-case convention already used in the touched files.
- Run each task's test file with `npx vitest run <path>` before moving on; do not run the full suite between tasks (per this repo's "scope test runs" convention — save the full run for the very end).

---

### Task 1: `KunstwerkFormaat` gets `'alle'`, beheer Formaat radio + maat-compatibiliteit

**Files:**
- Modify: `src/components/beheer/materiaalTypes.ts:23`
- Modify: `src/components/beheer/KunstwerkenSection.tsx` (Formaat fieldset ~line 631-643, `setFormaat` ~line 255-266, maat-checkbox `incompatibel` ~line 704-706)
- Modify: `messages/nl.json:506-509`
- Test: `tests/components/beheer/KunstwerkenSection.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `KunstwerkFormaat = 'vierkant' | 'liggend' | 'staand' | 'alle'`, used by every later task in this plan.

- [ ] **Step 1: Write the failing tests**

Add these two tests inside the existing `describe('KunstwerkenSection', ...)` block in `tests/components/beheer/KunstwerkenSection.test.tsx`, right after the existing `'deselects and disables incompatible maten when the formaat is changed, in both directions'` test:

```tsx
  it('selects every maat and disables none when Formaat "Alle" is chosen', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-alle'));
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-1')).toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-2')).toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-3')).toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-1')).not.toBeDisabled();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-3')).not.toBeDisabled();
  });

  it('re-enables and re-checks every maat when switching from a narrower formaat to Alle', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-kw-1')); // kw-1: formaat 'staand', maatIds ['maat-1']
    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-vierkant'));
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-1')).toBeDisabled();

    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-alle'));
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-1')).not.toBeDisabled();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-1')).toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-3')).not.toBeDisabled();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-3')).toBeChecked();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: FAIL — `getByTestId('kunstwerk-modal-formaat-alle')` cannot find the element (radio button doesn't exist yet).

- [ ] **Step 3: Add `'alle'` to the type**

In `src/components/beheer/materiaalTypes.ts:23`, change:

```ts
export type KunstwerkFormaat = 'vierkant' | 'liggend' | 'staand';
```

to:

```ts
export type KunstwerkFormaat = 'vierkant' | 'liggend' | 'staand' | 'alle';
```

- [ ] **Step 4: Add the "Alle" translation**

In `messages/nl.json`, right after line 508 (`"kunstwerkenFormaat_staand": "Staand",`) and before line 509 (`"kunstwerkenFormaatVerplicht": ...`), add:

```json
    "kunstwerkenFormaat_alle": "Alle",
```

- [ ] **Step 5: Render the 4th radio button**

In `src/components/beheer/KunstwerkenSection.tsx`, change (around line 632):

```tsx
              {(['vierkant', 'liggend', 'staand'] as const).map((optie) => (
```

to:

```tsx
              {(['vierkant', 'liggend', 'staand', 'alle'] as const).map((optie) => (
```

- [ ] **Step 6: Make `setFormaat` select every maat for `'alle'`**

Change `setFormaat` (around line 255-266) from:

```ts
  function setFormaat(optie: KunstwerkFormaat) {
    setFormaatState(optie);
    setMaatIds(
      (maten ?? [])
        .filter((maat) => (optie === 'vierkant' ? isVierkanteMaat(maat) : !isVierkanteMaat(maat)))
        .map((maat) => maat.id)
    );
    // A kunstwerk with every materiaal unchecked is deliberately materiaalloos (priced per
    // m² instead), not "hasn't picked yet" — resetForm() always starts non-empty, so an
    // empty selection here only ever means the admin chose that. Leave it alone.
    setMateriaalIds((current) => (current.length === 0 ? current : (materialen ?? []).map((materiaal) => materiaal.id)));
  }
```

to:

```ts
  function setFormaat(optie: KunstwerkFormaat) {
    setFormaatState(optie);
    setMaatIds(
      (maten ?? [])
        .filter((maat) => {
          if (optie === 'alle') return true;
          return optie === 'vierkant' ? isVierkanteMaat(maat) : !isVierkanteMaat(maat);
        })
        .map((maat) => maat.id)
    );
    // A kunstwerk with every materiaal unchecked is deliberately materiaalloos (priced per
    // m² instead), not "hasn't picked yet" — resetForm() always starts non-empty, so an
    // empty selection here only ever means the admin chose that. Leave it alone.
    setMateriaalIds((current) => (current.length === 0 ? current : (materialen ?? []).map((materiaal) => materiaal.id)));
  }
```

- [ ] **Step 7: Never grey out/disable a maat when formaat is `'alle'`**

Change (around line 704-706):

```ts
                const incompatibel =
                  formaat !== null && (formaat === 'vierkant' ? !isVierkanteMaat(maat) : isVierkanteMaat(maat));
```

to:

```ts
                const incompatibel =
                  formaat !== null &&
                  formaat !== 'alle' &&
                  (formaat === 'vierkant' ? !isVierkanteMaat(maat) : isVierkanteMaat(maat));
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: PASS (all tests in the file, including the 2 new ones)

- [ ] **Step 9: Commit**

```bash
git add src/components/beheer/materiaalTypes.ts src/components/beheer/KunstwerkenSection.tsx messages/nl.json tests/components/beheer/KunstwerkenSection.test.tsx
git commit -m "feat: add Formaat Alle, selecting every maat by default"
```

---

### Task 2: Beheer — generieke maatloos-staat (0 maten, ongeacht formaat) toont Prijs per m² en staat opslaan toe

**Files:**
- Modify: `src/components/beheer/KunstwerkenSection.tsx` (`isMateriaalloos`/new `isMaatloos` ~line 191, `buildKunstwerkData` ~line 196-221, `opslaanDisabled` ~line 403-412, Prijs-per-m² input visibility ~line 870, backfill filter ~line 458-463)
- Test: `tests/components/beheer/KunstwerkenSection.test.tsx`

**Interfaces:**
- Consumes: `KunstwerkFormaat` with `'alle'` (Task 1).
- Produces: `isMaatloos` (boolean, superset of `isMateriaalloos`) used by this file's own JSX; no other task depends on this file's internals.

- [ ] **Step 1: Write the failing tests**

Add these two tests inside `describe('KunstwerkenSection', ...)`, right after the existing `'shows a "Prijs per m²" field instead of the price matrix once every materiaal is unchecked, and saves it'` test:

```tsx
  it('shows a "Prijs per m²" field and allows opslaan when a materiaal is chosen but every maat is unchecked, regardless of formaat', async () => {
    uploadMock.mockResolvedValue('https://storage.example.com/nieuw.jpg');
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-segment-seg-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-vierkant'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materialen-maten-toggle'));
    // 'vierkant' auto-selects only the square maat (maat-3); unchecking it leaves 0 maten
    // while mat-1/mat-2 stay checked, so this is "materiaal wel, maat niet" — not materiaalloos.
    fireEvent.click(screen.getByTestId('kunstwerk-modal-maat-maat-3'));

    expect(screen.queryByTestId('kunstwerk-modal-prijzen')).not.toBeInTheDocument();
    expect(screen.getByTestId('kunstwerk-modal-prijs-per-m2')).toBeInTheDocument();

    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-foto-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-foto-preview')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('kunstwerk-modal-naam'), { target: { value: '4mm veiligheidsglas per m2' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Op maat gezaagd.' } });
    expect(screen.getByTestId('kunstwerk-modal-opslaan')).toBeDisabled();

    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-per-m2'), { target: { value: '65' } });
    expect(screen.getByTestId('kunstwerk-modal-opslaan')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          formaat: 'vierkant',
          materiaalIds: ['mat-1', 'mat-2'],
          maatIds: [],
          prijzen: [],
          prijsPerM2: 65,
        })
      )
    );
  });

  it('never targets a maatloos-met-materiaal kunstwerk (0 maten, materiaal wel gekozen) with the "Materialen/maten aanvullen" backfill', async () => {
    const maatloosMetMateriaal: Kunstwerk = {
      ...KUNSTWERKEN[0],
      id: 'kw-veiligheidsglas-per-m2',
      materiaalIds: ['mat-1'],
      maatIds: [],
      prijzen: [],
      prijsPerM2: 65,
    };
    const onUpdate = vi.fn().mockResolvedValue(true);
    renderSection({ kunstwerken: [KUNSTWERKEN[0], maatloosMetMateriaal], onUpdate });

    const button = screen.getByTestId('kunstwerken-backfill-materialen-maten');
    expect(button).toHaveTextContent('1'); // only kw-1 should be counted
    fireEvent.click(button);

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('kw-1', expect.anything()));
    expect(onUpdate).not.toHaveBeenCalledWith('kw-veiligheidsglas-per-m2', expect.anything());
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: FAIL — the first new test fails because `kunstwerk-modal-prijs-per-m2` is not rendered (Opslaan stays disabled instead, since today only `isMateriaalloos` shows that field); the second new test fails because the backfill button counts 2 instead of 1 (it currently also targets the maatloos-met-materiaal row).

- [ ] **Step 3: Add the generic `isMaatloos` flag**

Change (line 191):

```ts
  const isMateriaalloos = materiaalIds.length === 0;
```

to:

```ts
  const isMateriaalloos = materiaalIds.length === 0;
  // Superset of isMateriaalloos: also true when a materiaal is chosen but every maat is
  // deliberately unchecked (e.g. "4mm veiligheidsglas, custom size, priced per m²").
  const isMaatloos = isMateriaalloos || maatIds.length === 0;
```

- [ ] **Step 4: Use `isMaatloos` in `buildKunstwerkData`**

Change (around lines 196-221):

```ts
  function buildKunstwerkData(): Omit<Kunstwerk, 'id'> {
    const basis = {
      foto,
      naam,
      kunstenaarId: kunstenaarId || null,
      formaat,
      segmentIds,
      materiaalIds,
      maatIds: isMateriaalloos ? [] : maatIds,
      stijlIds,
      onderwerpIds,
      aiGegenereerd,
      prijzen: isMateriaalloos
        ? []
        : prijsCombinaties.map(({ materiaalId, maatId }) => ({
            materiaalId,
            maatId,
            prijs: Number(prijzen[prijsKey(materiaalId, maatId)]),
          })),
      omschrijvingNl,
      omschrijvingFr,
      omschrijvingDe,
      omschrijvingEn,
    };
    return isMateriaalloos ? { ...basis, prijsPerM2: Number(prijsPerM2) } : basis;
  }
```

to:

```ts
  function buildKunstwerkData(): Omit<Kunstwerk, 'id'> {
    const basis = {
      foto,
      naam,
      kunstenaarId: kunstenaarId || null,
      formaat,
      segmentIds,
      materiaalIds,
      maatIds: isMaatloos ? [] : maatIds,
      stijlIds,
      onderwerpIds,
      aiGegenereerd,
      prijzen: isMaatloos
        ? []
        : prijsCombinaties.map(({ materiaalId, maatId }) => ({
            materiaalId,
            maatId,
            prijs: Number(prijzen[prijsKey(materiaalId, maatId)]),
          })),
      omschrijvingNl,
      omschrijvingFr,
      omschrijvingDe,
      omschrijvingEn,
    };
    return isMaatloos ? { ...basis, prijsPerM2: Number(prijsPerM2) } : basis;
  }
```

- [ ] **Step 5: Use `isMaatloos` in `opslaanDisabled`**

Change (around lines 403-412):

```ts
  const opslaanDisabled =
    !foto ||
    formaat === null ||
    uploading ||
    !naam ||
    segmentIds.length === 0 ||
    (isMateriaalloos
      ? !prijsPerM2 || Number(prijsPerM2) <= 0
      : maatIds.length === 0 || !allePrijzenIngevuld) ||
    !omschrijvingNl;
```

to (the `maatIds.length === 0` half of the else-branch is now unreachable dead code — `isMaatloos` is already true whenever `maatIds.length === 0`, so the else-branch only ever runs when `maatIds.length > 0` — so it's dropped):

```ts
  const opslaanDisabled =
    !foto ||
    formaat === null ||
    uploading ||
    !naam ||
    segmentIds.length === 0 ||
    (isMaatloos ? !prijsPerM2 || Number(prijsPerM2) <= 0 : !allePrijzenIngevuld) ||
    !omschrijvingNl;
```

- [ ] **Step 6: Show the Prijs-per-m² input whenever `isMaatloos`**

Change (around line 870):

```tsx
          {isMateriaalloos && (
```

to:

```tsx
          {isMaatloos && (
```

- [ ] **Step 7: Exclude a maatloos-met-materiaal kunstwerk from the "aanvullen" backfill**

Change (around lines 458-463):

```ts
  const kunstwerkenZonderAlleMaterialenMaten = kunstwerken.filter(
    (kunstwerk) =>
      kunstwerk.materiaalIds.length > 0 &&
      (alleMateriaalIds.some((id) => !kunstwerk.materiaalIds.includes(id)) ||
        alleMaatIds.some((id) => !kunstwerk.maatIds.includes(id)))
  );
```

to:

```ts
  const kunstwerkenZonderAlleMaterialenMaten = kunstwerken.filter(
    (kunstwerk) =>
      kunstwerk.materiaalIds.length > 0 &&
      kunstwerk.maatIds.length > 0 &&
      (alleMateriaalIds.some((id) => !kunstwerk.materiaalIds.includes(id)) ||
        alleMaatIds.some((id) => !kunstwerk.maatIds.includes(id)))
  );
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: PASS (all tests in the file)

- [ ] **Step 9: Commit**

```bash
git add src/components/beheer/KunstwerkenSection.tsx tests/components/beheer/KunstwerkenSection.test.tsx
git commit -m "feat: generalize materiaalloos-per-m2 pricing to any 0-maten kunstwerk"
```

---

### Task 3: ProductModal — generieke maatloos-flow (materiaal blijft kiesbaar) + gedeeld "Prijs"-label

**Files:**
- Modify: `src/components/ProductModal.tsx` (derived flags ~line 146-150 and ~174-177, select visibility ~line 337/362/382, price block ~line 421-437, `canConfirm` ~line 183-188, `handleConfirm` ~line 199-224)
- Modify: `messages/nl.json:111`, `messages/en.json:111`, `messages/de.json:111`, `messages/fr.json:111`
- Test: `tests/components/ProductModal.test.tsx`

**Interfaces:**
- Consumes: `Kunstwerk.maatIds`/`materiaalIds`/`prijsPerM2` (unchanged shape).
- Produces: nothing consumed by later tasks in this plan (Task 4/ProductsGrid is independent of this file).

- [ ] **Step 1: Write the failing tests**

In `tests/components/ProductModal.test.tsx`, add a new fixture right after `MATERIAALLOOS_KUNSTWERK` (around line 77):

```tsx
const MAATLOOS_MET_MATERIAAL_KUNSTWERK: Kunstwerk = {
  id: 'kw-veiligheidsglas-per-m2',
  foto: 'https://example.com/veiligheidsglas.jpg',
  naam: '4mm veiligheidsglas per m2',
  kunstenaarId: null,
  segmentIds: [],
  materiaalIds: ['mat-1'],
  maatIds: [],
  prijzen: [],
  prijsPerM2: 65,
  omschrijvingNl: 'Op maat gezaagd 4mm veiligheidsglas.',
  omschrijvingFr: '',
  omschrijvingDe: '',
  omschrijvingEn: '',
};
```

Then add these tests inside `describe('ProductModal', ...)`, right after the existing `'adds a materiaalloos item to the cart with the computed price and no material/maat, logging mandje_toegevoegd'` test:

```tsx
  it('shows the materiaal select but hides the maat select for a maatloos kunstwerk that still has a materiaal, showing free-size inputs', () => {
    renderModal(() => {}, MAATLOOS_MET_MATERIAAL_KUNSTWERK);
    expect(screen.getByTestId('product-modal-materiaal')).toBeInTheDocument();
    expect(screen.queryByTestId('product-modal-maat')).not.toBeInTheDocument();
    expect(screen.getByTestId('product-modal-maat-custom-breedte')).toBeInTheDocument();
    expect(screen.getByTestId('product-modal-maat-custom-hoogte')).toBeInTheDocument();
  });

  it('computes and shows a live price for a maatloos-met-materiaal kunstwerk based on the entered size and prijsPerM2', () => {
    renderModal(() => {}, MAATLOOS_MET_MATERIAAL_KUNSTWERK);
    expect(screen.queryByTestId('product-modal-prijs')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-breedte'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-hoogte'), { target: { value: '200' } });
    expect(screen.getByTestId('product-modal-prijs')).toHaveTextContent('€ 130,00');
  });

  it('adds a maatloos-met-materiaal item to the cart with the chosen materiaal, computed price and entered size', async () => {
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
              kunstwerk={MAATLOOS_MET_MATERIAAL_KUNSTWERK}
              materialen={MATERIALEN}
              maten={MATEN}
              materiaalsoorten={MATERIAALSOORTEN}
              kunstenaars={KUNSTENAARS}
              segmenten={SEGMENTEN}
              stijlen={STIJLEN}
              onderwerpen={ONDERWERPEN}
              onClose={() => {}}
            />
            <Probe />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-breedte'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-hoogte'), { target: { value: '200' } });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.click(screen.getByTestId('product-modal-confirm'));

    const items = JSON.parse(screen.getByTestId('probe').textContent ?? '[]');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kunstwerkId: 'kw-veiligheidsglas-per-m2',
      materiaalId: 'mat-1',
      materiaalLabel: '4mm Veiligheidsglas',
      maatId: '',
      breedte: 100,
      hoogte: 200,
      maatLabel: '100×200 cm (eigen maat)',
      prijs: 130,
      quantity: 1,
    });
  });

  it('labels the shown price with "Prijs" for a normal kunstwerk with a chosen materiaal/maat', () => {
    renderModal();
    expect(screen.getByText('Prijs')).toBeInTheDocument();
    expect(screen.getByTestId('product-modal-prijs')).toHaveTextContent('€ 150,00');
  });

  it('labels "Prijs op aanvraag" with the same "Prijs" heading for an eigen-maat kunstwerk', () => {
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <ProductModal
              kunstwerk={KUNSTWERK}
              materialen={MATERIALEN}
              maten={MATEN}
              materiaalsoorten={MATERIAALSOORTEN_MET_EIGEN_MAAT}
              kunstenaars={KUNSTENAARS}
              segmenten={SEGMENTEN}
              stijlen={STIJLEN}
              onderwerpen={ONDERWERPEN}
              onClose={() => {}}
            />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );
    fireEvent.change(screen.getByTestId('product-modal-maat'), { target: { value: '__eigen_maat__' } });
    expect(screen.getByText('Prijs')).toBeInTheDocument();
    expect(screen.getByTestId('product-modal-prijs')).toHaveTextContent('Prijs op aanvraag');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/ProductModal.test.tsx`
Expected: FAIL — the maatloos-met-materiaal tests fail because today the maat `<select>` still renders empty and no breedte/hoogte inputs show (`isMateriaalloos` is false for this fixture); the "Prijs" label tests fail because no such text exists anywhere in the DOM yet.

- [ ] **Step 3: Add the generic `isMaatloos` flag**

Change (around line 146-150):

```ts
  const isCustomSize = maatId === CUSTOM_MAAT_VALUE;
  const isMateriaalloos = kunstwerk.materiaalIds.length === 0;
  const prijsRegel = !isCustomSize
    ? kunstwerk.prijzen.find((regel) => regel.materiaalId === materiaalId && regel.maatId === maatId)
    : undefined;
```

to:

```ts
  const isCustomSize = maatId === CUSTOM_MAAT_VALUE;
  const isMateriaalloos = kunstwerk.materiaalIds.length === 0;
  // A materiaalloos kunstwerk is always persisted with maatIds: [] (see buildKunstwerkData
  // in KunstwerkenSection.tsx), so isMaatloos is a superset of isMateriaalloos: it also covers
  // "materiaal wel gekozen, maar 0 maten" (e.g. custom-size glass priced per m²).
  const isMaatloos = kunstwerk.maatIds.length === 0;
  const prijsRegel = !isCustomSize
    ? kunstwerk.prijzen.find((regel) => regel.materiaalId === materiaalId && regel.maatId === maatId)
    : undefined;
```

- [ ] **Step 4: Rename `materiaalloosPrijs` to `prijsPerM2Prijs`, gate it on `isMaatloos`, and add `prijsWeergave`**

Change (around lines 168-177):

```ts
  const customBreedteNum = Number(customBreedte);
  const customHoogteNum = Number(customHoogte);
  const customSizeFilledIn =
    customBreedte !== '' && customHoogte !== '' && customBreedteNum > 0 && customHoogteNum > 0;
  const customSizeExceedsMax = customSizeFilledIn && !withinMax(customBreedteNum, customHoogteNum, geselecteerdSoort);
  const customSizeValid = customSizeFilledIn && !customSizeExceedsMax;
  const materiaalloosPrijs =
    isMateriaalloos && customSizeValid && kunstwerk.prijsPerM2
      ? Math.round((customBreedteNum / 100) * (customHoogteNum / 100) * kunstwerk.prijsPerM2 * 100) / 100
      : null;
```

to:

```ts
  const customBreedteNum = Number(customBreedte);
  const customHoogteNum = Number(customHoogte);
  const customSizeFilledIn =
    customBreedte !== '' && customHoogte !== '' && customBreedteNum > 0 && customHoogteNum > 0;
  const customSizeExceedsMax = customSizeFilledIn && !withinMax(customBreedteNum, customHoogteNum, geselecteerdSoort);
  const customSizeValid = customSizeFilledIn && !customSizeExceedsMax;
  const prijsPerM2Prijs =
    isMaatloos && customSizeValid && kunstwerk.prijsPerM2
      ? Math.round((customBreedteNum / 100) * (customHoogteNum / 100) * kunstwerk.prijsPerM2 * 100) / 100
      : null;
  const prijsWeergave: string | null = isMaatloos
    ? prijsPerM2Prijs !== null
      ? formatCurrency(prijsPerM2Prijs)
      : null
    : isCustomSize
      ? t('priceOnRequest')
      : prijsRegel
        ? formatCurrency(prijsRegel.prijs)
        : null;
```

- [ ] **Step 5: Use `isMaatloos` in `canConfirm`**

Change (around lines 183-188):

```ts
  const canConfirm =
    (isMateriaalloos
      ? customSizeValid && Boolean(kunstwerk.prijsPerM2) && (kunstwerk.prijsPerM2 ?? 0) > 0
      : isCustomSize
        ? customSizeValid
        : Boolean(prijsRegel)) && quantityValid;
```

to:

```ts
  const canConfirm =
    (isMaatloos
      ? customSizeValid && Boolean(kunstwerk.prijsPerM2) && (kunstwerk.prijsPerM2 ?? 0) > 0
      : isCustomSize
        ? customSizeValid
        : Boolean(prijsRegel)) && quantityValid;
```

- [ ] **Step 6: Extend `handleConfirm`'s maatloos branch to carry a chosen materiaal**

Change (around lines 199-224):

```ts
  function handleConfirm() {
    if (isConfirmed || !canConfirm || !kunstwerk) {
      return;
    }
    if (isMateriaalloos) {
      addItem({
        kunstwerkId: kunstwerk.id,
        foto: kunstwerk.foto,
        omschrijving,
        materiaalId: '',
        materiaalLabel: MATERIAALLOOS_LABEL,
        maatId: '',
        maatLabel: `${customBreedteNum}×${customHoogteNum} cm${t('customSizeSuffix')}`,
        breedte: customBreedteNum,
        hoogte: customHoogteNum,
        prijs: materiaalloosPrijs,
        quantity: quantityNum,
      });
      void logActiviteit('mandje_toegevoegd', actorFromCustomer(user));
      setIsConfirmed(true);
      closeTimeoutRef.current = setTimeout(() => {
        closeTimeoutRef.current = null;
        onClose();
      }, CONFIRM_FEEDBACK_MS);
      return;
    }
    const gekozenMateriaal = beschikbareMaterialen.find((materiaal) => materiaal.id === materiaalId);
    if (!gekozenMateriaal) {
      return;
    }
    if (isCustomSize) {
```

to:

```ts
  function handleConfirm() {
    if (isConfirmed || !canConfirm || !kunstwerk) {
      return;
    }
    if (isMaatloos) {
      if (isMateriaalloos) {
        addItem({
          kunstwerkId: kunstwerk.id,
          foto: kunstwerk.foto,
          omschrijving,
          materiaalId: '',
          materiaalLabel: MATERIAALLOOS_LABEL,
          maatId: '',
          maatLabel: `${customBreedteNum}×${customHoogteNum} cm${t('customSizeSuffix')}`,
          breedte: customBreedteNum,
          hoogte: customHoogteNum,
          prijs: prijsPerM2Prijs,
          quantity: quantityNum,
        });
      } else {
        const gekozenMateriaal = beschikbareMaterialen.find((materiaal) => materiaal.id === materiaalId);
        if (!gekozenMateriaal) {
          return;
        }
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
          prijs: prijsPerM2Prijs,
          quantity: quantityNum,
        });
      }
      void logActiviteit('mandje_toegevoegd', actorFromCustomer(user));
      setIsConfirmed(true);
      closeTimeoutRef.current = setTimeout(() => {
        closeTimeoutRef.current = null;
        onClose();
      }, CONFIRM_FEEDBACK_MS);
      return;
    }
    const gekozenMateriaal = beschikbareMaterialen.find((materiaal) => materiaal.id === materiaalId);
    if (!gekozenMateriaal) {
      return;
    }
    if (isCustomSize) {
```

- [ ] **Step 7: Hide the maat select, show breedte/hoogte, whenever `isMaatloos`**

Change the maat-select guard (around line 362):

```tsx
        {!isMateriaalloos && (
          <label className="flex flex-col gap-1 text-[0.65rem] uppercase tracking-wide text-white/60">
            {t('size')}
```

to:

```tsx
        {!isMateriaalloos && !isMaatloos && (
          <label className="flex flex-col gap-1 text-[0.65rem] uppercase tracking-wide text-white/60">
            {t('size')}
```

Change the breedte/hoogte guard (around line 382):

```tsx
        {(isCustomSize || isMateriaalloos) && (
```

to:

```tsx
        {(isCustomSize || isMaatloos) && (
```

(Leave the materiaal-select guard at line 337, `{!isMateriaalloos && (`, unchanged — it must keep showing for a maatloos-met-materiaal kunstwerk.)

- [ ] **Step 8: Replace the three-branch price block with the single labeled `prijsWeergave`**

Change (around lines 421-437):

```tsx
        {isMateriaalloos ? (
          materiaalloosPrijs !== null && (
            <p data-testid="product-modal-prijs" className="text-sm text-white/80">
              {formatCurrency(materiaalloosPrijs)}
            </p>
          )
        ) : isCustomSize ? (
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
```

to:

```tsx
        {prijsWeergave !== null && (
          <div className="flex flex-col gap-1">
            <span className="text-[0.65rem] uppercase tracking-wide text-white/60">{t('priceLabel')}</span>
            <p data-testid="product-modal-prijs" className="text-sm text-white/80">
              {prijsWeergave}
            </p>
          </div>
        )}
```

- [ ] **Step 9: Add the `priceLabel` translation to all four locales**

In `messages/nl.json:111`, change:

```json
    "minimumQuantityError": "Minimaal {minimum} stuks"
```

to:

```json
    "minimumQuantityError": "Minimaal {minimum} stuks",
    "priceLabel": "Prijs"
```

In `messages/en.json:111`, change `"minimumQuantityError": "Minimum {minimum} pieces"` to:

```json
    "minimumQuantityError": "Minimum {minimum} pieces",
    "priceLabel": "Price"
```

In `messages/de.json:111`, change `"minimumQuantityError": "Mindestens {minimum} Stück"` to:

```json
    "minimumQuantityError": "Mindestens {minimum} Stück",
    "priceLabel": "Preis"
```

In `messages/fr.json:111`, change `"minimumQuantityError": "Minimum {minimum} pièces"` to:

```json
    "minimumQuantityError": "Minimum {minimum} pièces",
    "priceLabel": "Prix"
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npx vitest run tests/components/ProductModal.test.tsx`
Expected: PASS (all tests in the file)

- [ ] **Step 11: Commit**

```bash
git add src/components/ProductModal.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json tests/components/ProductModal.test.tsx
git commit -m "feat: generalize maatloos pricing to kunstwerken with a chosen materiaal, add shared Prijs label"
```

---

### Task 4: ProductModal — Breedte/Hoogte gegarandeerd even breed

**Files:**
- Modify: `src/components/ProductModal.tsx` (breedte/hoogte `<label>` wrappers, ~line 385 and ~395)
- Test: `tests/components/ProductModal.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Write the failing test**

Add this test inside `describe('ProductModal', ...)` in `tests/components/ProductModal.test.tsx`, right after the `'shows a lead-time warning and no max error for an oversized custom veiligheidsglas size'` test:

```tsx
  it('gives the custom breedte and hoogte inputs matching min-w-0 flex-1 wrappers so they split the row evenly', () => {
    renderModal(() => {}, MATERIAALLOOS_KUNSTWERK);
    const breedteWrapper = screen.getByTestId('product-modal-maat-custom-breedte').closest('label');
    const hoogteWrapper = screen.getByTestId('product-modal-maat-custom-hoogte').closest('label');
    expect(breedteWrapper?.className).toMatch(/(^|\s)min-w-0(\s|$)/);
    expect(breedteWrapper?.className).toMatch(/(^|\s)flex-1(\s|$)/);
    expect(hoogteWrapper?.className).toMatch(/(^|\s)min-w-0(\s|$)/);
    expect(hoogteWrapper?.className).toMatch(/(^|\s)flex-1(\s|$)/);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/ProductModal.test.tsx -t "min-w-0"`
Expected: FAIL — neither wrapper's className currently contains `min-w-0`.

- [ ] **Step 3: Add `min-w-0` to both wrappers**

Change (around line 385):

```tsx
              <label className="flex flex-1 flex-col gap-1 text-[0.65rem] uppercase tracking-wide text-white/60">
                {t('customWidthLabel')}
```

to:

```tsx
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-[0.65rem] uppercase tracking-wide text-white/60">
                {t('customWidthLabel')}
```

Change (around line 395):

```tsx
              <label className="flex flex-1 flex-col gap-1 text-[0.65rem] uppercase tracking-wide text-white/60">
                {t('customHeightLabel')}
```

to:

```tsx
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-[0.65rem] uppercase tracking-wide text-white/60">
                {t('customHeightLabel')}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/components/ProductModal.test.tsx -t "min-w-0"`
Expected: PASS

- [ ] **Step 5: Visually verify in the browser**

Start the dev server preview (`preview_start` with the project's `dev` launch config), open a kunstwerk with 0 materialen (e.g. via `/nl/beheer` → Kunstwerken → open a materiaalloos row, or any public collectie item that has one), and use `javascript_tool` to compare:

```js
JSON.stringify([
  document.querySelector('[data-testid="product-modal-maat-custom-breedte"]').getBoundingClientRect().width,
  document.querySelector('[data-testid="product-modal-maat-custom-hoogte"]').getBoundingClientRect().width,
])
```

Expected: both widths equal. If they were already equal before this change (jsdom can't verify real layout, so this is the first real-browser confirmation), that's fine — the `min-w-0` addition is a no-op safety net in that case, not a regression.

- [ ] **Step 6: Commit**

```bash
git add src/components/ProductModal.tsx tests/components/ProductModal.test.tsx
git commit -m "fix: guarantee equal width for the custom breedte/hoogte inputs"
```

---

### Task 5: ProductsGrid — Formaat "Alle" telt mee bij elk formaat-filter

**Files:**
- Modify: `src/components/ProductsGrid.tsx` (`matchesFormaat` ~line 57-58, facet count ~line 256)
- Test: `tests/components/ProductsGrid.test.tsx`

**Interfaces:**
- Consumes: `Kunstwerk.formaat` including `'alle'` (Task 1).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Write the failing test**

Add this test inside `describe('ProductsGrid', ...)` in `tests/components/ProductsGrid.test.tsx`, right after the `'excludes a kunstwerk with no formaat when a formaat filter is active, without crashing'` test:

```tsx
  it('matches a kunstwerk with Formaat "Alle" against every formaat filter and its count', async () => {
    mockCollections({
      kunstwerken: [
        ...KUNSTWERKEN,
        {
          id: 'kw-alle',
          foto: 'https://example.com/kw-alle.jpg',
          segmentIds: ['seg-hotel'],
          materiaalIds: ['mat-1'],
          maatIds: [],
          formaat: 'alle',
          prijzen: [],
          prijsPerM2: 65,
          stijlIds: [],
          onderwerpIds: [],
          omschrijvingNl: 'Op maat, elk formaat',
          omschrijvingFr: '',
          omschrijvingDe: '',
          omschrijvingEn: '',
        },
      ],
    });
    renderProductsGrid();
    expect(await screen.findAllByTestId('product-card')).toHaveLength(4);

    expect(screen.getByTestId('facet-formaat-option-staand')).toHaveTextContent('2'); // kw-1 + kw-alle
    expect(screen.getByTestId('facet-formaat-option-liggend')).toHaveTextContent('2'); // kw-2 + kw-alle
    expect(screen.getByTestId('facet-formaat-option-vierkant')).toHaveTextContent('2'); // kw-3 + kw-alle

    fireEvent.click(screen.getByTestId('facet-formaat-option-staand'));
    expect(screen.getAllByTestId('product-card')).toHaveLength(2); // kw-1 and kw-alle both match

    fireEvent.click(screen.getByTestId('facet-formaat-option-staand'));
    fireEvent.click(screen.getByTestId('facet-formaat-option-vierkant'));
    expect(screen.getAllByTestId('product-card')).toHaveLength(2); // kw-3 and kw-alle both match
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx -t "Formaat \"Alle\""`
Expected: FAIL — the facet counts show `1` instead of `2`, and the "kw-alle" card is missing from the filtered results (today `'alle'` isn't in `formaatFilters`, so `matchesFormaat` returns `false` for it once a filter is active).

- [ ] **Step 3: Make `matchesFormaat` treat `'alle'` as a universal match**

Change (around lines 57-58):

```ts
  function matchesFormaat(kunstwerk: Kunstwerk) {
    return formaatFilters.size === 0 || (kunstwerk.formaat != null && formaatFilters.has(kunstwerk.formaat));
  }
```

to:

```ts
  function matchesFormaat(kunstwerk: Kunstwerk) {
    return (
      formaatFilters.size === 0 ||
      kunstwerk.formaat === 'alle' ||
      (kunstwerk.formaat != null && formaatFilters.has(kunstwerk.formaat))
    );
  }
```

- [ ] **Step 4: Count `'alle'` kunstwerken toward every facet option**

Change (around line 256):

```ts
              const count = formaatCountBase.filter((kunstwerk) => kunstwerk.formaat === formaat).length;
```

to:

```ts
              const count = formaatCountBase.filter(
                (kunstwerk) => kunstwerk.formaat === formaat || kunstwerk.formaat === 'alle'
              ).length;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx`
Expected: PASS (all tests in the file)

- [ ] **Step 6: Commit**

```bash
git add src/components/ProductsGrid.tsx tests/components/ProductsGrid.test.tsx
git commit -m "feat: match Formaat Alle kunstwerken against every formaat filter"
```

---

### Task 6: Volledige testrun

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the pre-existing suite (this touches the real shared staging database per CLAUDE.md for unrelated API-route tests — that's expected and not something this plan's changes affect).

- [ ] **Step 2: Run the linter**

Run: `npm run lint`
Expected: no new errors in the 5 touched source files.

- [ ] **Step 3: Manual smoke test in the browser**

Start the `dev` preview, go to `/nl/beheer` → Kunstwerken → "Kunstwerk toevoegen", click through: pick Formaat "Alle" (confirm every maat gets checked and none are greyed out), then uncheck every maat manually (confirm the Prijs per m² field appears and Opslaan stays enabled once a value + the other required fields are filled). Then open the live preview panel next to the form and confirm the materiaal select stays visible, the maat select disappears, and breedte/hoogte inputs with a computed price appear as you type a size.

This step has no fixed "expected" output beyond "behaves as described in the spec" — it's a manual confirmation that the 6 tasks compose correctly end-to-end, not just in isolation per test file.
