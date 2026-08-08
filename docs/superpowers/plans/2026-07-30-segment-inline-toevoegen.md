# Segment inline toevoegen bij kunstwerk Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 30-07-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff type a brand-new Segment name directly on the kunstwerk beheer form and have it added to the `segmenten` lookup table and auto-selected on the kunstwerk — the same inline "add new value" interaction that already exists for Stijl and Onderwerp.

**Architecture:** `KunstwerkenSection.tsx` gets a new `onAddSegment` prop plus the same three-piece state/effect/handler group Stijl already has (`nieuweSegmentNaam` input state, a `pendingNieuweSegmentNaam` marker, a `useEffect` that auto-checks the segment once it appears in the refetched `segmenten` list, and a `handleAddNieuweSegment()` handler). The Segmenten `<fieldset>` gets the same text-input + "Toevoegen" button block Stijl's fieldset has. `BeheerShell.tsx` wires the prop to the `segmenten.add` function it already has from `useApiCollection<Segment>('segmenten')`. No schema, API route, or storefront changes — `segmentIds` is already a fully-wired required field on `kunstwerken`.

**Tech Stack:** Next.js 14, React (client component, `useState`/`useEffect`), TypeScript, Vitest + Testing Library, `next-intl`.

## Global Constraints

- Mirror the existing Stijl pattern exactly — same state shape, same handler logic (case-insensitive existing-name match before creating), same `useEffect` auto-select mechanism.
- Reuse the existing `segment_toegevoegd` activiteitenlog action type (already defined in `src/lib/logActiviteit.ts`) — do not add a new action type.
- The `beheer` i18n namespace exists only in `messages/nl.json` (`en`/`de`/`fr` have no `beheer` section) — new translation keys go only into `nl.json`.
- No changes to the database schema, `src/lib/server/lookupResources.ts`, the generic `[resource]` API route, or any storefront component (`ProductsGrid.tsx`, `CollectiesDropdown.tsx`).
- Existing `segmentIds` required-field validation (red border + `kunstwerkenSegmentenVerplicht` hint) must keep working unchanged.

---

### Task 1: Inline "add new segment" on the kunstwerk form

**Files:**
- Modify: `messages/nl.json:512-513` (add 3 new keys after the existing Segmenten keys)
- Modify: `src/components/beheer/KunstwerkenSection.tsx` (prop, state, effect, handler, reset, fieldset JSX)
- Modify: `src/components/beheer/BeheerShell.tsx:358-373` (wire `onAddSegment={segmenten.add}`)
- Test: `tests/components/beheer/KunstwerkenSection.test.tsx`

**Interfaces:**
- Consumes: `Segment` type from `src/components/beheer/materiaalTypes.ts` (`{ id: string; omschrijving: string }`, already imported in `KunstwerkenSection.tsx:11`); `logActiviteit`/`actorFromMedewerker` from `src/lib/logActiviteit.ts` (already imported); `segmenten.add` from `useApiCollection<Segment>('segmenten')` in `BeheerShell.tsx:201` (already has the exact signature `(data: Omit<Segment, 'id'>) => Promise<boolean>`, same as `stijlen.add`).
- Produces: new `KunstwerkenSectionProps.onAddSegment: (data: Omit<Segment, 'id'>) => Promise<boolean>` — a required prop, so every render site (only `BeheerShell.tsx` and the test file) must be updated in this same task.

- [ ] **Step 1: Add the three new translation keys to `messages/nl.json`**

Open `messages/nl.json` and insert these lines immediately after line 513 (`"kunstwerkenSegmentenVerplicht": "Kies minimaal één segment.",`), before the `"kunstwerkenLabelMaterialenMaten"` line:

```json
    "kunstwerkenNieuweSegmentPlaceholder": "Nieuw segment…",
    "kunstwerkenNieuweSegmentToevoegen": "Toevoegen",
    "kunstwerkenNieuweSegmentError": "Kon het segment niet toevoegen. Probeer het opnieuw.",
```

- [ ] **Step 2: Write the failing test**

In `tests/components/beheer/KunstwerkenSection.test.tsx`, add this test immediately after the existing `'creates a brand-new stijl inline, adds it to the Stijlen table, and auto-selects it on the kunstwerk'` test (right after its closing `});` — currently ending at line 904):

```typescript
  it('creates a brand-new segment inline, adds it to the Segmenten table, and auto-selects it on the kunstwerk', async () => {
    const onAddSegment = vi.fn().mockResolvedValue(true);
    const { rerender } = renderSection({ onAddSegment });
    fireEvent.click(screen.getByTestId('kunstwerken-add'));

    fireEvent.change(screen.getByTestId('kunstwerk-modal-nieuwe-segment-naam'), { target: { value: 'Kantoor' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-nieuwe-segment-toevoegen'));
    await waitFor(() => expect(onAddSegment).toHaveBeenCalledWith({ omschrijving: 'Kantoor' }));

    // Simulate BeheerShell re-rendering this component with the freshly-refetched segmenten list,
    // the way it really would once onAddSegment's API call resolves and useApiCollection refetches.
    rerender(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <KunstwerkenSection
              kunstwerken={KUNSTWERKEN}
              segmenten={[...SEGMENTEN, { id: 'seg-3', omschrijving: 'Kantoor' }]}
              materialen={MATERIALEN}
              materiaalsoorten={null}
              maten={MATEN}
              stijlen={STIJLEN}
              onderwerpen={ONDERWERPEN}
              kunstenaars={KUNSTENAARS}
              loadError={null}
              onAdd={vi.fn().mockResolvedValue(true)}
              onUpdate={vi.fn().mockResolvedValue(true)}
              onRemove={vi.fn().mockResolvedValue(true)}
              onAddStijl={vi.fn().mockResolvedValue(true)}
              onAddOnderwerp={vi.fn().mockResolvedValue(true)}
              onAddSegment={onAddSegment}
            />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );

    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-segment-seg-3')).toBeChecked());
  });
```

Also update the `renderSection` helper so `onAddSegment` has the same default-mock treatment as `onAddStijl`/`onAddOnderwerp`. In the same test file, change:

```typescript
function renderSection(overrides: Partial<React.ComponentProps<typeof KunstwerkenSection>> = {}) {
  const onAdd = overrides.onAdd ?? vi.fn().mockResolvedValue(true);
  const onUpdate = overrides.onUpdate ?? vi.fn().mockResolvedValue(true);
  const onRemove = overrides.onRemove ?? vi.fn().mockResolvedValue(true);
  const onAddStijl = overrides.onAddStijl ?? vi.fn().mockResolvedValue(true);
  const onAddOnderwerp = overrides.onAddOnderwerp ?? vi.fn().mockResolvedValue(true);
  const result = render(
```

to:

```typescript
function renderSection(overrides: Partial<React.ComponentProps<typeof KunstwerkenSection>> = {}) {
  const onAdd = overrides.onAdd ?? vi.fn().mockResolvedValue(true);
  const onUpdate = overrides.onUpdate ?? vi.fn().mockResolvedValue(true);
  const onRemove = overrides.onRemove ?? vi.fn().mockResolvedValue(true);
  const onAddStijl = overrides.onAddStijl ?? vi.fn().mockResolvedValue(true);
  const onAddOnderwerp = overrides.onAddOnderwerp ?? vi.fn().mockResolvedValue(true);
  const onAddSegment = overrides.onAddSegment ?? vi.fn().mockResolvedValue(true);
  const result = render(
```

and inside the rendered `<KunstwerkenSection>` JSX in that same helper, add `onAddSegment={onAddSegment}` right after the existing `onAddOnderwerp={onAddOnderwerp}` line, and add `onAddSegment` to the helper's `return { onAdd, onUpdate, onRemove, onAddStijl, onAddOnderwerp, rerender: result.rerender };` line so it reads `return { onAdd, onUpdate, onRemove, onAddStijl, onAddOnderwerp, onAddSegment, rerender: result.rerender };`.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx -t "creates a brand-new segment inline"`
Expected: FAIL — TypeScript error / runtime error that `onAddSegment` is missing from props, or `getByTestId('kunstwerk-modal-nieuwe-segment-naam')` cannot find the element (the input doesn't exist yet).

- [ ] **Step 4: Add the `onAddSegment` prop and new state to `KunstwerkenSection.tsx`**

In the `KunstwerkenSectionProps` interface (around line 16-31), add the new prop after `onRemove` and before `onAddStijl`:

```typescript
  onRemove: (id: string) => Promise<boolean>;
  onAddSegment: (data: Omit<Segment, 'id'>) => Promise<boolean>;
  onAddStijl: (data: Omit<Stijl, 'id'>) => Promise<boolean>;
```

In the component's destructured props (around line 64-79), add `onAddSegment` in the matching position:

```typescript
  onRemove,
  onAddSegment,
  onAddStijl,
```

Add the new state, right before the existing `const [nieuweStijlNaam, setNieuweStijlNaam] = useState('');` line (currently line 94):

```typescript
  const [nieuweSegmentNaam, setNieuweSegmentNaam] = useState('');
  const [pendingNieuweSegmentNaam, setPendingNieuweSegmentNaam] = useState<string | null>(null);
  const [segmentToevoegenError, setSegmentToevoegenError] = useState<string | null>(null);
```

- [ ] **Step 5: Add the auto-select `useEffect` and the `handleAddNieuweSegment` handler**

Add this `useEffect`, right before the existing Stijl `useEffect` (currently starting at line 111):

```typescript
  useEffect(() => {
    if (!pendingNieuweSegmentNaam) return;
    const gevonden = (segmenten ?? []).find((segment) => segment.omschrijving === pendingNieuweSegmentNaam);
    if (gevonden) {
      setSegmentIds((current) => (current.includes(gevonden.id) ? current : [...current, gevonden.id]));
      setPendingNieuweSegmentNaam(null);
      setNieuweSegmentNaam('');
    }
  }, [segmenten, pendingNieuweSegmentNaam]);
```

Add this handler, right before the existing `handleAddNieuweStijl` function (currently starting at line 131):

```typescript
  async function handleAddNieuweSegment() {
    const naam = nieuweSegmentNaam.trim();
    if (!naam) return;
    setSegmentToevoegenError(null);
    const bestaande = (segmenten ?? []).find(
      (segment) => segment.omschrijving.toLowerCase() === naam.toLowerCase()
    );
    if (bestaande) {
      setSegmentIds((current) => (current.includes(bestaande.id) ? current : [...current, bestaande.id]));
      setNieuweSegmentNaam('');
      return;
    }
    setPendingNieuweSegmentNaam(naam);
    const success = await onAddSegment({ omschrijving: naam });
    if (success) {
      void logActiviteit('segment_toegevoegd', actorFromMedewerker(user));
    } else {
      setPendingNieuweSegmentNaam(null);
      setSegmentToevoegenError(t('kunstwerkenNieuweSegmentError'));
    }
  }
```

- [ ] **Step 6: Reset the new state in `resetForm()`**

In `resetForm()` (around line 299-323), right after the existing `setSegmentIds(LEGE_FORM.segmentIds);` line, add:

```typescript
    setNieuweSegmentNaam('');
    setPendingNieuweSegmentNaam(null);
    setSegmentToevoegenError(null);
```

- [ ] **Step 7: Add the input + button + error UI to the Segmenten fieldset**

In the JSX, the Segmenten `<fieldset>` currently reads (around line 689-713):

```tsx
          <fieldset
            className={`flex flex-col gap-1 rounded-sm border px-2 py-1.5 ${
              segmentIds.length === 0 ? 'border-red-500/70' : 'border-transparent'
            }`}
          >
            <legend className="text-xs uppercase tracking-wide text-white/60">
              {t('kunstwerkenLabelSegmenten')}
            </legend>
            {(segmenten ?? []).map((segment) => (
              <label key={segment.id} className="flex items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={segmentIds.includes(segment.id)}
                  onChange={() => setSegmentIds((current) => toggle(current, segment.id))}
                  data-testid={`kunstwerk-modal-segment-${segment.id}`}
                />
                {segment.omschrijving}
              </label>
            ))}
            {segmentIds.length === 0 && (
              <span data-testid="kunstwerk-modal-segmenten-hint" className="text-xs text-red-400">
                {t('kunstwerkenSegmentenVerplicht')}
              </span>
            )}
          </fieldset>
```

Replace it with (adds the input+button block and error span after the checkbox list, before the existing "verplicht" hint):

```tsx
          <fieldset
            className={`flex flex-col gap-1 rounded-sm border px-2 py-1.5 ${
              segmentIds.length === 0 ? 'border-red-500/70' : 'border-transparent'
            }`}
          >
            <legend className="text-xs uppercase tracking-wide text-white/60">
              {t('kunstwerkenLabelSegmenten')}
            </legend>
            {(segmenten ?? []).map((segment) => (
              <label key={segment.id} className="flex items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={segmentIds.includes(segment.id)}
                  onChange={() => setSegmentIds((current) => toggle(current, segment.id))}
                  data-testid={`kunstwerk-modal-segment-${segment.id}`}
                />
                {segment.omschrijving}
              </label>
            ))}
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={nieuweSegmentNaam}
                onChange={(event) => setNieuweSegmentNaam(event.target.value)}
                placeholder={t('kunstwerkenNieuweSegmentPlaceholder')}
                data-testid="kunstwerk-modal-nieuwe-segment-naam"
                className="flex-1 rounded-sm bg-black/40 px-3 py-1.5 text-sm text-white"
              />
              <button
                type="button"
                onClick={handleAddNieuweSegment}
                disabled={!nieuweSegmentNaam.trim()}
                data-testid="kunstwerk-modal-nieuwe-segment-toevoegen"
                className="btn-beheer-secondary rounded-sm border border-white/20 px-3 py-1.5 text-xs text-white/70 hover:border-white/40 hover:text-white disabled:opacity-40"
              >
                {t('kunstwerkenNieuweSegmentToevoegen')}
              </button>
            </div>
            {segmentToevoegenError && (
              <span data-testid="kunstwerk-modal-nieuwe-segment-error" className="text-xs text-red-400">
                {segmentToevoegenError}
              </span>
            )}
            {segmentIds.length === 0 && (
              <span data-testid="kunstwerk-modal-segmenten-hint" className="text-xs text-red-400">
                {t('kunstwerkenSegmentenVerplicht')}
              </span>
            )}
          </fieldset>
```

- [ ] **Step 8: Wire `onAddSegment` in `BeheerShell.tsx`**

In `BeheerShell.tsx`, the `<KunstwerkenSection>` render (around line 358-373) currently ends with:

```tsx
            onAdd={kunstwerken.add}
            onUpdate={kunstwerken.update}
            onRemove={kunstwerken.remove}
            onAddStijl={stijlen.add}
            onAddOnderwerp={onderwerpen.add}
          />
```

Change it to:

```tsx
            onAdd={kunstwerken.add}
            onUpdate={kunstwerken.update}
            onRemove={kunstwerken.remove}
            onAddSegment={segmenten.add}
            onAddStijl={stijlen.add}
            onAddOnderwerp={onderwerpen.add}
          />
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: PASS — all tests in the file pass, including the new `'creates a brand-new segment inline...'` test.

- [ ] **Step 10: Run the full test suite to check for regressions**

Run: `npm test`
Expected: PASS — no failures in `BeheerShell.test.tsx` or elsewhere caused by the new required `onAddSegment` prop.

- [ ] **Step 11: Commit**

```bash
git add messages/nl.json src/components/beheer/KunstwerkenSection.tsx src/components/beheer/BeheerShell.tsx tests/components/beheer/KunstwerkenSection.test.tsx
git commit -m "feat: add inline 'add new segment' to kunstwerk form, matching Stijl/Onderwerp"
```
