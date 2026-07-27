# Collectiepagina tegel- en detail-redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the `/collecties` tiles to a photo-first gallery grid (3 columns, gold border, contain-fit, hover-reveal omschrijving), move all kunstwerk metadata into the existing `ProductModal` detail dialog, give the beheer edit form a live read-only `ProductModal` preview instead of the `KunstwerkSpecCard` print-label preview, and delete `KunstwerkSpecCard` entirely once nothing uses it.

**Architecture:** `ProductModal` grows a `variant?: 'dialog' | 'preview'` prop and three new reference-data props (`segmenten`, `stijlen`, `onderwerpen`) so the same component renders both the customer-facing order dialog and a non-interactive admin preview. `ProductsGrid` and `KunstwerkenSection` both consume it; `KunstwerkSpecCard` becomes unreferenced and is deleted.

**Tech Stack:** Next.js (App Router), React, TypeScript, Tailwind CSS, next-intl, Vitest + Testing Library.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-27-collectiepagina-tegel-en-detail-redesign-design.md`
- Gold border color token: `gold` (`#D4AF37`, `tailwind.config.ts:12`) — use `border-gold/50` at rest, `border-gold` on hover/active.
- Dark background token for letterboxed images in the dialog: `ink` (`#060607`, `tailwind.config.ts:8`).
- All new user-facing strings go through next-intl `useTranslations`, added to all 4 locale files (`messages/nl.json`, `en.json`, `fr.json`, `de.json`) with the same key structure in each.
- Every existing `data-testid` referenced by current tests must keep working unless the spec explicitly says otherwise (only the tile's material-label testid usage goes away, per spec section 6).

---

### Task 1: `ProductModal` — full artwork on a dark, gold-bordered panel (no cropping)

**Files:**
- Modify: `src/components/ProductModal.tsx:263` (the `WatermarkedImage` call inside the dialog)
- Test: `tests/components/ProductModal.test.tsx`

**Interfaces:**
- Consumes: existing `WatermarkedImage` component (`src/components/WatermarkedImage.tsx`), which already supports `fit="contain"` and forwards `className` to its root `data-testid="watermarked-image"` div.
- Produces: no new exports; this is a pure JSX/className change inside `ProductModal`.

- [ ] **Step 1: Write the failing test**

Add this test inside the existing `describe('ProductModal', ...)` block in `tests/components/ProductModal.test.tsx` (place it near the other rendering tests, e.g. right after the `'shows the resolved description...'` test):

```tsx
  it('shows the full artwork on a dark, gold-bordered panel instead of a cropped white one', () => {
    renderModal();
    const image = screen.getByTestId('watermarked-image');
    expect(image).toHaveClass('border-gold/50');
    expect(image).toHaveClass('bg-ink');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/ProductModal.test.tsx -t "gold-bordered panel"`
Expected: FAIL — `image` does not have class `border-gold/50` (current className is `"h-56 w-full sm:h-full"`, no `fit` prop so it defaults to `"cover"`).

- [ ] **Step 3: Update the implementation**

In `src/components/ProductModal.tsx`, replace line 263:

```tsx
        <WatermarkedImage src={kunstwerk.foto} alt={omschrijving} className="h-56 w-full sm:h-full" />
```

with:

```tsx
        <WatermarkedImage
          src={kunstwerk.foto}
          alt={omschrijving}
          fit="contain"
          className="h-56 w-full border-b border-gold/50 bg-ink sm:h-full sm:border-b-0 sm:border-r"
        />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/ProductModal.test.tsx`
Expected: PASS — all tests in the file, including the new one and the existing `'shows a watermark overlay on the photo'` test (unaffected, since `fit="contain"` still renders `data-testid="watermark-overlay"` in the no-canvas-support fallback path).

- [ ] **Step 5: Commit**

```bash
git add src/components/ProductModal.tsx tests/components/ProductModal.test.tsx
git commit -m "feat: show full artwork on a dark gold-bordered panel in the detail dialog"
```

---

### Task 2: `ProductModal` — artiest/collectie/stijl/onderwerp info block

**Files:**
- Modify: `src/components/ProductModal.tsx` (imports, props, new computed labels, new JSX block)
- Modify: `messages/nl.json`, `messages/en.json`, `messages/fr.json`, `messages/de.json` (new `cart` keys)
- Test: `tests/components/ProductModal.test.tsx`

**Interfaces:**
- Consumes: `Segment`, `Stijl`, `Onderwerp` types from `src/components/beheer/materiaalTypes.ts` (already defined: `{ id: string; omschrijving: string }`).
- Produces: `ProductModal` now requires three new props: `segmenten: Segment[] | null`, `stijlen: Stijl[] | null`, `onderwerpen: Onderwerp[] | null`. Every caller of `<ProductModal>` must pass them from now on (Task 4 and Task 5 update the two current call sites).

- [ ] **Step 1: Write the failing tests**

Add these tests inside `describe('ProductModal', ...)` in `tests/components/ProductModal.test.tsx`. First, update the shared `renderModal` helper (around line 137) to accept and forward the three new props, defaulting to empty arrays so existing calls keep working:

```tsx
function renderModal(
  onClose: () => void = () => {},
  kunstwerk: Kunstwerk | null = KUNSTWERK,
  kunstenaars: Kunstenaar[] | null = KUNSTENAARS,
  segmenten: Segment[] | null = SEGMENTEN,
  stijlen: Stijl[] | null = STIJLEN,
  onderwerpen: Onderwerp[] | null = ONDERWERPEN
) {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerAuthProvider>
        <CartProvider>
          <ProductModal
            kunstwerk={kunstwerk}
            materialen={MATERIALEN}
            maten={MATEN}
            materiaalsoorten={MATERIAALSOORTEN}
            kunstenaars={kunstenaars}
            segmenten={segmenten}
            stijlen={stijlen}
            onderwerpen={onderwerpen}
            onClose={onClose}
          />
        </CartProvider>
      </CustomerAuthProvider>
    </NextIntlClientProvider>
  );
}
```

Add the new imports and fixtures near the top of the file (after the existing `MATERIAALSOORTEN` const, around line 70):

```tsx
import type { Segment, Stijl, Onderwerp } from '@/components/beheer/materiaalTypes';

const SEGMENTEN: Segment[] = [{ id: 'seg-1', omschrijving: 'Hotel' }];
const STIJLEN: Stijl[] = [{ id: 'stijl-1', omschrijving: 'Abstract' }];
const ONDERWERPEN: Onderwerp[] = [{ id: 'onderwerp-1', omschrijving: 'Bloemen' }];
```

(Add the `import type { Segment, Stijl, Onderwerp }` line next to the other top-of-file imports, not inline — put it directly under the existing `import type { Kunstwerk, Materiaal, Maat, Materiaalsoort } from '@/components/beheer/materiaalTypes';` line.)

Then add the new test cases:

```tsx
  it('shows artiest, collectie, stijl and onderwerp when the kunstwerk has them', () => {
    renderModal(() => {}, {
      ...KUNSTWERK,
      kunstenaarId: 'ka-open',
      segmentIds: ['seg-1'],
      stijlIds: ['stijl-1'],
      onderwerpIds: ['onderwerp-1'],
    });
    expect(screen.getByTestId('product-modal-artiest')).toHaveTextContent('Open Artiest');
    expect(screen.getByTestId('product-modal-collecties')).toHaveTextContent('Hotel');
    expect(screen.getByTestId('product-modal-stijl')).toHaveTextContent('Abstract');
    expect(screen.getByTestId('product-modal-onderwerp')).toHaveTextContent('Bloemen');
  });

  it('omits the whole info block when the kunstwerk has no artiest, collectie, stijl or onderwerp', () => {
    renderModal(() => {}, { ...KUNSTWERK, kunstenaarId: null, segmentIds: [], stijlIds: [], onderwerpIds: [] });
    expect(screen.queryByTestId('product-modal-meta')).not.toBeInTheDocument();
  });

  it('only shows the fields that have data, omitting the rest', () => {
    renderModal(() => {}, { ...KUNSTWERK, kunstenaarId: null, segmentIds: ['seg-1'], stijlIds: [], onderwerpIds: [] });
    expect(screen.getByTestId('product-modal-collecties')).toHaveTextContent('Hotel');
    expect(screen.queryByTestId('product-modal-artiest')).not.toBeInTheDocument();
    expect(screen.queryByTestId('product-modal-stijl')).not.toBeInTheDocument();
    expect(screen.queryByTestId('product-modal-onderwerp')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/ProductModal.test.tsx -t "artiest, collectie, stijl and onderwerp"`
Expected: FAIL — `ProductModal` doesn't accept `segmenten`/`stijlen`/`onderwerpen` props yet and renders no info block (TypeScript will also flag the missing props once Step 3 hasn't happened; for a JS-only test run the block/testids simply won't exist).

- [ ] **Step 3: Add the translation keys**

In `messages/nl.json`, inside the `"cart"` object (right after `"close": "Sluiten",` at line 100), add:

```json
    "artistLabel": "Artiest",
    "collectionsLabel": "Collectie",
    "stijlLabel": "Stijl",
    "onderwerpLabel": "Onderwerp",
```

In `messages/en.json`, same position (after `"close": "Close",`):

```json
    "artistLabel": "Artist",
    "collectionsLabel": "Collection",
    "stijlLabel": "Style",
    "onderwerpLabel": "Subject",
```

In `messages/fr.json`, same position (after `"close": "Fermer",`):

```json
    "artistLabel": "Artiste",
    "collectionsLabel": "Collection",
    "stijlLabel": "Style",
    "onderwerpLabel": "Sujet",
```

In `messages/de.json`, same position (after `"close": "Schließen",`):

```json
    "artistLabel": "Künstler",
    "collectionsLabel": "Kollektion",
    "stijlLabel": "Stil",
    "onderwerpLabel": "Motiv",
```

- [ ] **Step 4: Update `ProductModal.tsx`**

Change the type import at the top of `src/components/ProductModal.tsx` from:

```tsx
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort } from './beheer/materiaalTypes';
```

to:

```tsx
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort, Segment, Stijl, Onderwerp } from './beheer/materiaalTypes';
```

Update the props interface (currently at line 39):

```tsx
interface ProductModalProps {
  kunstwerk: Kunstwerk | null;
  materialen: Materiaal[] | null;
  maten: Maat[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  kunstenaars: Kunstenaar[] | null;
  segmenten: Segment[] | null;
  stijlen: Stijl[] | null;
  onderwerpen: Onderwerp[] | null;
  onClose: () => void;
}
```

Update the function signature (currently line 48):

```tsx
export function ProductModal({
  kunstwerk,
  materialen,
  maten,
  materiaalsoorten,
  kunstenaars,
  segmenten,
  stijlen,
  onderwerpen,
  onClose,
}: ProductModalProps) {
```

Right after the existing `const omschrijving = resolveKunstwerkOmschrijving(kunstwerk, locale);` line (currently line 136), add:

```tsx
  const artiestNaam = kunstwerk.kunstenaarId
    ? (kunstenaars ?? []).find((kunstenaar) => kunstenaar.id === kunstwerk.kunstenaarId)?.naam ?? ''
    : '';
  const collectieLabels = kunstwerk.segmentIds.map(
    (segmentId) => (segmenten ?? []).find((segment) => segment.id === segmentId)?.omschrijving ?? segmentId
  );
  const stijlLabels = (kunstwerk.stijlIds ?? []).map(
    (stijlId) => (stijlen ?? []).find((stijl) => stijl.id === stijlId)?.omschrijving ?? stijlId
  );
  const onderwerpLabels = (kunstwerk.onderwerpIds ?? []).map(
    (onderwerpId) => (onderwerpen ?? []).find((onderwerp) => onderwerp.id === onderwerpId)?.omschrijving ?? onderwerpId
  );
  const heeftMetaInfo =
    Boolean(artiestNaam) || collectieLabels.length > 0 || stijlLabels.length > 0 || onderwerpLabels.length > 0;
```

Then, right after the `<p data-testid="product-modal-omschrijving" ...>{omschrijving}</p>` block (currently lines 265-267), add the new info block:

```tsx
          {heeftMetaInfo && (
            <dl
              data-testid="product-modal-meta"
              className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-y border-gold/30 py-3 text-xs"
            >
              {artiestNaam && (
                <>
                  <dt className="font-head text-[10px] uppercase tracking-wide text-gold/90">{t('artistLabel')}</dt>
                  <dd data-testid="product-modal-artiest" className="text-white/75">
                    {artiestNaam}
                  </dd>
                </>
              )}
              {collectieLabels.length > 0 && (
                <>
                  <dt className="font-head text-[10px] uppercase tracking-wide text-gold/90">{t('collectionsLabel')}</dt>
                  <dd data-testid="product-modal-collecties" className="text-white/75">
                    {collectieLabels.join(', ')}
                  </dd>
                </>
              )}
              {stijlLabels.length > 0 && (
                <>
                  <dt className="font-head text-[10px] uppercase tracking-wide text-gold/90">{t('stijlLabel')}</dt>
                  <dd data-testid="product-modal-stijl" className="text-white/75">
                    {stijlLabels.join(', ')}
                  </dd>
                </>
              )}
              {onderwerpLabels.length > 0 && (
                <>
                  <dt className="font-head text-[10px] uppercase tracking-wide text-gold/90">{t('onderwerpLabel')}</dt>
                  <dd data-testid="product-modal-onderwerp" className="text-white/75">
                    {onderwerpLabels.join(', ')}
                  </dd>
                </>
              )}
            </dl>
          )}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/components/ProductModal.test.tsx`
Expected: PASS — all tests, including the 3 new ones.

- [ ] **Step 6: Commit**

```bash
git add src/components/ProductModal.tsx tests/components/ProductModal.test.tsx messages/nl.json messages/en.json messages/fr.json messages/de.json
git commit -m "feat: show artiest/collectie/stijl/onderwerp in the detail dialog"
```

---

### Task 3: `ProductModal` — `variant="preview"` embedded, non-ordering mode

**Files:**
- Modify: `src/components/ProductModal.tsx`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/fr.json`, `messages/de.json` (one new `cart` key)
- Test: `tests/components/ProductModal.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ProductModal` accepts an optional `variant?: 'dialog' | 'preview'` prop, default `'dialog'`. `variant="preview"` renders the same content inline (no fixed overlay/backdrop/close button, no `role="dialog"`), keeps the materiaal/maat/aantal controls interactive, but disables the confirm button and never calls `addItem`/`logActiviteit`. Task 5 is the consumer that passes `variant="preview"`.

- [ ] **Step 1: Write the failing tests**

Add these tests inside `describe('ProductModal', ...)` in `tests/components/ProductModal.test.tsx`:

```tsx
  it('preview variant: renders inline without a backdrop, close button or dialog role', () => {
    renderModal(() => {}, KUNSTWERK, KUNSTENAARS, SEGMENTEN, STIJLEN, ONDERWERPEN, 'preview');
    expect(screen.queryByTestId('product-modal-backdrop')).not.toBeInTheDocument();
    expect(screen.queryByTestId('product-modal-close')).not.toBeInTheDocument();
    expect(screen.getByTestId('product-modal')).not.toHaveAttribute('role', 'dialog');
  });

  it('preview variant: disables the confirm button and never adds to the cart', () => {
    function Probe() {
      const { items } = useCart();
      return <div data-testid="probe">{JSON.stringify(items)}</div>;
    }
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <ProductModal
              variant="preview"
              kunstwerk={KUNSTWERK}
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
    const confirmButton = screen.getByTestId('product-modal-confirm');
    expect(confirmButton).toBeDisabled();
    expect(confirmButton).toHaveTextContent('Bestellen niet mogelijk in dit voorbeeld');
    fireEvent.click(confirmButton);
    expect(screen.getByTestId('probe')).toHaveTextContent('[]');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });

  it('preview variant: keeps the materiaal/maat selects interactive', () => {
    renderModal(() => {}, KUNSTWERK, KUNSTENAARS, SEGMENTEN, STIJLEN, ONDERWERPEN, 'preview');
    fireEvent.change(screen.getByTestId('product-modal-materiaal'), { target: { value: 'mat-2' } });
    expect(screen.getByTestId('product-modal-materiaal')).toHaveValue('mat-2');
  });
```

Update the `renderModal` helper signature once more (from Task 2) to accept the variant as a final optional argument:

```tsx
function renderModal(
  onClose: () => void = () => {},
  kunstwerk: Kunstwerk | null = KUNSTWERK,
  kunstenaars: Kunstenaar[] | null = KUNSTENAARS,
  segmenten: Segment[] | null = SEGMENTEN,
  stijlen: Stijl[] | null = STIJLEN,
  onderwerpen: Onderwerp[] | null = ONDERWERPEN,
  variant: 'dialog' | 'preview' = 'dialog'
) {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerAuthProvider>
        <CartProvider>
          <ProductModal
            variant={variant}
            kunstwerk={kunstwerk}
            materialen={MATERIALEN}
            maten={MATEN}
            materiaalsoorten={MATERIAALSOORTEN}
            kunstenaars={kunstenaars}
            segmenten={segmenten}
            stijlen={stijlen}
            onderwerpen={onderwerpen}
            onClose={onClose}
          />
        </CartProvider>
      </CustomerAuthProvider>
    </NextIntlClientProvider>
  );
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/ProductModal.test.tsx -t "preview variant"`
Expected: FAIL — `variant` prop doesn't exist yet, so the dialog still renders the backdrop/close button and an active confirm button.

- [ ] **Step 3: Add the translation key**

Add to `messages/nl.json`, inside `"cart"`, right after the new `onderwerpLabel` key added in Task 2:

```json
    "previewOrderDisabled": "Bestellen niet mogelijk in dit voorbeeld",
```

`messages/en.json`:

```json
    "previewOrderDisabled": "Ordering is not possible in this preview",
```

`messages/fr.json`:

```json
    "previewOrderDisabled": "Commander n'est pas possible dans cet aperçu",
```

`messages/de.json`:

```json
    "previewOrderDisabled": "Bestellen ist in dieser Vorschau nicht möglich",
```

- [ ] **Step 4: Update `ProductModal.tsx`**

Add `variant` to the props interface (from Task 2's version):

```tsx
interface ProductModalProps {
  kunstwerk: Kunstwerk | null;
  materialen: Materiaal[] | null;
  maten: Maat[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  kunstenaars: Kunstenaar[] | null;
  segmenten: Segment[] | null;
  stijlen: Stijl[] | null;
  onderwerpen: Onderwerp[] | null;
  onClose: () => void;
  variant?: 'dialog' | 'preview';
}
```

Add it to the function signature with a default:

```tsx
export function ProductModal({
  kunstwerk,
  materialen,
  maten,
  materiaalsoorten,
  kunstenaars,
  segmenten,
  stijlen,
  onderwerpen,
  onClose,
  variant = 'dialog',
}: ProductModalProps) {
```

Change the `useOverlayDismiss` call (currently `isOpen: kunstwerk !== null`) to:

```tsx
  useOverlayDismiss({
    isOpen: variant === 'dialog' && kunstwerk !== null,
    onClose,
    containerRef: modalRef,
    initialFocusRef: closeButtonRef,
  });
```

Now restructure the returned JSX. Replace everything from `return (` (currently line 239) down to the matching closing `);` (currently line 433) with:

```tsx
  const closeButton =
    variant === 'dialog' ? (
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
    ) : null;

  const body = (
    <>
      <WatermarkedImage
        src={kunstwerk.foto}
        alt={omschrijving}
        fit="contain"
        className="h-56 w-full border-b border-gold/50 bg-ink sm:h-full sm:border-b-0 sm:border-r"
      />
      <div className="flex flex-col gap-4 p-6">
        <p data-testid="product-modal-omschrijving" className="text-sm leading-relaxed text-white/80">
          {omschrijving}
        </p>
        {heeftMetaInfo && (
          <dl
            data-testid="product-modal-meta"
            className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-y border-gold/30 py-3 text-xs"
          >
            {artiestNaam && (
              <>
                <dt className="font-head text-[10px] uppercase tracking-wide text-gold/90">{t('artistLabel')}</dt>
                <dd data-testid="product-modal-artiest" className="text-white/75">
                  {artiestNaam}
                </dd>
              </>
            )}
            {collectieLabels.length > 0 && (
              <>
                <dt className="font-head text-[10px] uppercase tracking-wide text-gold/90">{t('collectionsLabel')}</dt>
                <dd data-testid="product-modal-collecties" className="text-white/75">
                  {collectieLabels.join(', ')}
                </dd>
              </>
            )}
            {stijlLabels.length > 0 && (
              <>
                <dt className="font-head text-[10px] uppercase tracking-wide text-gold/90">{t('stijlLabel')}</dt>
                <dd data-testid="product-modal-stijl" className="text-white/75">
                  {stijlLabels.join(', ')}
                </dd>
              </>
            )}
            {onderwerpLabels.length > 0 && (
              <>
                <dt className="font-head text-[10px] uppercase tracking-wide text-gold/90">{t('onderwerpLabel')}</dt>
                <dd data-testid="product-modal-onderwerp" className="text-white/75">
                  {onderwerpLabels.join(', ')}
                </dd>
              </>
            )}
          </dl>
        )}
        {!isMateriaalloos && (
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
        )}
        {!isMateriaalloos && (
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
        )}
        {(isCustomSize || isMateriaalloos) && (
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
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2 text-sm text-white/80">
            <span className="text-[0.65rem] uppercase tracking-wide text-white/60">{t('quantity')}</span>
            <div className="flex h-10 items-center overflow-hidden rounded-full border border-white/20">
              <button
                type="button"
                data-testid="product-modal-quantity-minus"
                onClick={() =>
                  setQuantityInput((current) =>
                    String(Math.max(effectiveMinimum, (Number(current) || effectiveMinimum) - 1))
                  )
                }
                className="flex h-full w-9 items-center justify-center text-white/80 transition hover:bg-gold hover:text-ink"
              >
                −
              </button>
              <input
                type="number"
                data-testid="product-modal-quantity-value"
                value={quantityInput}
                onChange={(event) => setQuantityInput(event.target.value)}
                className="h-full w-14 bg-transparent text-center text-sm text-white"
              />
              <button
                type="button"
                data-testid="product-modal-quantity-plus"
                onClick={() => setQuantityInput((current) => String((Number(current) || effectiveMinimum) + 1))}
                className="flex h-full w-9 items-center justify-center text-white/80 transition hover:bg-gold hover:text-ink"
              >
                +
              </button>
            </div>
          </div>
          {!quantityValid && (
            <p data-testid="product-modal-quantity-error" className="text-right text-xs text-red-400">
              {t('minimumQuantityError', { minimum: effectiveMinimum })}
            </p>
          )}
        </div>
        {variant === 'dialog' && blockedReason && (
          <p data-testid="product-modal-order-blocked" className="text-xs text-amber-400">
            {blockedReason === 'exclusive'
              ? t('orderBlockedExclusive')
              : blockedReason === 'artistOnly'
              ? t('orderBlockedArtistOnly')
              : t('orderBlockedUnavailable')}
          </p>
        )}
        <button
          type="button"
          data-testid="product-modal-confirm"
          onClick={variant === 'preview' ? undefined : handleConfirm}
          disabled={variant === 'preview' || isConfirmed || !canConfirm || !canOrder}
          className={`rounded-sm px-4 py-2.5 text-xs tracking-[0.15em] transition disabled:opacity-40 ${
            isConfirmed ? 'cursor-default bg-green-500 text-white' : 'btn-gold'
          }`}
        >
          {variant === 'preview' ? t('previewOrderDisabled') : isConfirmed ? t('added') : t('confirm')}
        </button>
      </div>
    </>
  );

  const panelClassName =
    'relative z-10 grid w-full max-w-2xl grid-cols-1 overflow-hidden rounded-lg border border-white/10 bg-charcoal sm:grid-cols-2';

  if (variant === 'preview') {
    return (
      <div data-testid="product-modal" className={panelClassName}>
        {body}
      </div>
    );
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
      <div className={panelClassName}>
        {closeButton}
        {body}
      </div>
    </div>
  );
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/components/ProductModal.test.tsx`
Expected: PASS — the full suite, including the 3 new preview tests. Double check the pre-existing `'exposes dialog semantics for assistive tech'` test still passes (it renders with the default `variant='dialog'`, so `role="dialog"`/`aria-modal="true"` are still present there).

- [ ] **Step 6: Commit**

```bash
git add src/components/ProductModal.tsx tests/components/ProductModal.test.tsx messages/nl.json messages/en.json messages/fr.json messages/de.json
git commit -m "feat: add a variant=\"preview\" mode to ProductModal for embedded, read-only use"
```

---

### Task 4: `ProductsGrid` — photo-first tegel grid (3 columns, gold border, hover reveal)

**Files:**
- Modify: `src/components/ProductsGrid.tsx`
- Test: `tests/components/ProductsGrid.test.tsx`

**Interfaces:**
- Consumes: `ProductModal` with its Task 1–3 props (`segmenten`, `stijlen`, `onderwerpen` now required).
- Produces: no new exports. `KunstwerkSpecCard` import is removed from this file (its only remaining consumer after this task is `KunstwerkenSection.tsx`, handled in Task 5).

- [ ] **Step 1: Write the failing tests**

In `tests/components/ProductsGrid.test.tsx`, replace the existing test `'shows the resolved materiaal label on each kunstwerk card'` (lines 304-308) — that assertion no longer holds since materiaal moves into the dialog — with:

```tsx
  it('shows the omschrijving as the card\'s accessible label and hover caption, without any other text', () => {
    renderProductsGrid();
    const cards = screen.getAllByTestId('product-card');
    expect(cards[0]).toHaveAttribute('aria-label', 'Hotel paneel');
    expect(cards[0]).toHaveTextContent('Hotel paneel');
    expect(cards[0]).not.toHaveTextContent('4mm Veiligheidsglas');
  });
```

Also add a new test confirming the ProductModal now receives the reference data it needs to show the info block, right after the existing `'opens the product modal with the resolved description when a card is clicked'` test:

```tsx
  it('shows the artiest/collectie/stijl/onderwerp info block once the dialog is opened', async () => {
    renderProductsGrid();
    const cards = await screen.findAllByTestId('product-card');
    fireEvent.click(cards[0]); // kw-1: kunstenaarId 'ka-1', segmentIds ['seg-hotel'], stijlIds ['stijl-abstract'], onderwerpIds ['onderwerp-bloemen']
    expect(screen.getByTestId('product-modal-artiest')).toHaveTextContent('Sabrina Glasser');
    expect(screen.getByTestId('product-modal-collecties')).toHaveTextContent('Hotel');
    expect(screen.getByTestId('product-modal-stijl')).toHaveTextContent('Abstract');
    expect(screen.getByTestId('product-modal-onderwerp')).toHaveTextContent('Bloemen');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx -t "accessible label"`
Run: `npx vitest run tests/components/ProductsGrid.test.tsx -t "info block once the dialog"`
Expected: both FAIL — the tile still renders the full `KunstwerkSpecCard` (code/titel/artiest/collectie/materiaal always visible, so the "not.toHaveTextContent('4mm Veiligheidsglas')" assertion fails), and `ProductModal` isn't receiving `segmenten`/`stijlen`/`onderwerpen` yet so the info block never renders.

- [ ] **Step 3: Update `ProductsGrid.tsx`**

Remove these two now-unused imports (lines 12-13):

```tsx
import { KunstwerkSpecCard } from './KunstwerkSpecCard';
```

and remove the `resolveKunstwerkMateriaalLabel` import (line 8):

```tsx
import { resolveKunstwerkMateriaalLabel } from '@/lib/kunstwerkMateriaal';
```

Remove the now-unused `kunstenaarNaamById` map (currently line 106):

```tsx
  const kunstenaarNaamById = new Map((kunstenaars.items ?? []).map((kunstenaar) => [kunstenaar.id, kunstenaar.naam]));
```

Replace the grid + tile block (currently lines 389-430) with:

```tsx
          <div data-testid="products-grid" className="grid grid-cols-3 gap-3">
            {visibleKunstwerken.map((kunstwerk) => {
              const omschrijving = resolveKunstwerkOmschrijving(kunstwerk, locale);
              return (
                <div
                  key={kunstwerk.id}
                  data-testid="product-card"
                  role="button"
                  tabIndex={0}
                  aria-label={omschrijving}
                  onClick={() => handleSelect(kunstwerk)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      if (event.key === ' ') {
                        event.preventDefault();
                      }
                      handleSelect(kunstwerk);
                    }
                  }}
                  className="group relative aspect-square cursor-pointer overflow-hidden rounded border border-gold/50 bg-white transition duration-300 hover:-translate-y-1 hover:border-gold hover:shadow-[0_8px_24px_rgba(212,175,55,0.25)] focus-visible:-translate-y-1 focus-visible:border-gold focus-visible:outline-none"
                >
                  <WatermarkedImage src={kunstwerk.foto} alt={omschrijving} className="h-full w-full" fit="contain" />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-black/80 via-black/10 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
                  >
                    <p className="font-head text-xs italic leading-snug text-white line-clamp-3">{omschrijving}</p>
                  </div>
                </div>
              );
            })}
          </div>
```

Finally, update the `<ProductModal>` call at the bottom of the file (currently lines 434-441) to pass the three new props:

```tsx
      <ProductModal
        kunstwerk={selectedKunstwerk}
        materialen={materialen.items}
        maten={maten.items}
        materiaalsoorten={materiaalsoorten.items}
        kunstenaars={kunstenaars.items}
        segmenten={segmenten.items}
        stijlen={stijlen.items}
        onderwerpen={onderwerpen.items}
        onClose={() => setSelectedKunstwerk(null)}
      />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx`
Expected: PASS — the full file. Confirm no other test in the file still expects `KunstwerkSpecCard`-only markup (e.g. `kunstwerk-spec-card-*` testids) — none currently do, per the earlier grep.

- [ ] **Step 5: Commit**

```bash
git add src/components/ProductsGrid.tsx tests/components/ProductsGrid.test.tsx
git commit -m "feat: redesign collectiepagina tiles to a 3-column photo-first gallery grid"
```

---

### Task 5: `KunstwerkenSection` — live `ProductModal` preview instead of the print-label card

**Files:**
- Modify: `src/components/beheer/KunstwerkenSection.tsx`
- Test: `tests/components/beheer/KunstwerkenSection.test.tsx`

**Interfaces:**
- Consumes: `ProductModal` with `variant="preview"` (Task 3).
- Produces: a `previewKunstwerk: Kunstwerk` value built from the live form state, recomputed only when the relevant form fields actually change (via `useMemo`), shared with `handleSave` through a new `buildKunstwerkData()` helper so the two don't duplicate the field-mapping logic.

- [ ] **Step 1: Write the failing tests**

In `tests/components/beheer/KunstwerkenSection.test.tsx`, the `renderSection` helper (lines 92-119) needs Firebase-adjacent providers now that `KunstwerkenSection` embeds `ProductModal` (which uses `useCustomerAuth`/`useCart`/`useFirestoreDocument`). Add these imports and mocks near the top of the file, right after the existing `vi.mock('@/lib/logActiviteit', ...)` block (line 37):

```tsx
import { CustomerAuthProvider } from '@/lib/useCustomerAuth';
import { CartProvider } from '@/lib/useCart';

const onAuthStateChangedMock = vi.fn();
const getDocMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => onAuthStateChangedMock(...args),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection, id) => ({ collection, id })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  setDoc: vi.fn(),
}));
```

Update the `renderSection` function's `render(...)` call to wrap `<KunstwerkenSection>` with the two providers:

```tsx
  const result = render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerAuthProvider>
        <CartProvider>
          <KunstwerkenSection
            kunstwerken={KUNSTWERKEN}
            segmenten={SEGMENTEN}
            materialen={MATERIALEN}
            maten={MATEN}
            stijlen={STIJLEN}
            onderwerpen={ONDERWERPEN}
            kunstenaars={KUNSTENAARS}
            loadError={null}
            onAdd={onAdd}
            onUpdate={onUpdate}
            onRemove={onRemove}
            onAddStijl={onAddStijl}
            onAddOnderwerp={onAddOnderwerp}
            {...overrides}
          />
        </CartProvider>
      </CustomerAuthProvider>
    </NextIntlClientProvider>
  );
```

Add these resets to the existing `beforeEach` (currently lines 121-130):

```tsx
  onAuthStateChangedMock.mockReset();
  getDocMock.mockReset();
  onAuthStateChangedMock.mockImplementation((_auth, callback) => {
    callback(null);
    return () => {};
  });
  getDocMock.mockResolvedValue({ exists: () => false });
  window.localStorage.clear();
```

Now add the new tests, in a new `describe` block at the end of the file (before the final closing of the top-level `describe('KunstwerkenSection', ...)`):

```tsx
  describe('klant-dialoog preview', () => {
    it('shows a live ProductModal preview instead of the old print-label card when the add form is open', () => {
      renderSection();
      fireEvent.click(screen.getByTestId('kunstwerken-add'));
      expect(screen.getByTestId('product-modal')).toBeInTheDocument();
      expect(screen.queryByTestId('kunstwerk-spec-card')).not.toBeInTheDocument();
    });

    it('updates the preview omschrijving as the admin types it', () => {
      renderSection();
      fireEvent.click(screen.getByTestId('kunstwerken-add'));
      fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), {
        target: { value: 'Nieuw kunstwerk in wording' },
      });
      expect(screen.getByTestId('product-modal-omschrijving')).toHaveTextContent('Nieuw kunstwerk in wording');
    });

    it('disables ordering in the preview', () => {
      renderSection();
      fireEvent.click(screen.getByTestId('kunstwerken-add'));
      expect(screen.getByTestId('product-modal-confirm')).toBeDisabled();
    });

    it('reflects the segment checkboxes as the collectie label in the preview', () => {
      renderSection();
      fireEvent.click(screen.getByTestId('kunstwerken-add'));
      fireEvent.click(screen.getByTestId('kunstwerk-modal-segment-seg-1'));
      expect(screen.getByTestId('product-modal-collecties')).toHaveTextContent('Hotel');
    });

    it('preloads the preview with the existing kunstwerk data when editing', () => {
      renderSection();
      fireEvent.click(screen.getByTestId('data-table-row-kw-1'));
      expect(screen.getByTestId('product-modal-omschrijving')).toHaveTextContent('Hotel paneel 1');
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx -t "klant-dialoog preview"`
Expected: FAIL — `KunstwerkenSection` still renders `KunstwerkSpecCard` (`data-testid="kunstwerk-spec-card"`), not `ProductModal`. Confirm the rest of the file's *other* (pre-existing) tests fail too until the provider-wrapping change lands, since embedded `ProductModal` will throw `useCustomerAuth must be used within a CustomerAuthProvider` as soon as any test opens the add/edit form — that's expected at this point and gets fixed by Step 3 together with the provider wrapping done in Step 1.

- [ ] **Step 3: Update `KunstwerkenSection.tsx`**

Replace the import of `KunstwerkSpecCard` (line 7) and drop the now-unused `resolveKunstwerkMateriaalLabel` import (line 8):

```tsx
import { ProductModal } from '@/components/ProductModal';
```

(Delete the `import { KunstwerkSpecCard } from '@/components/KunstwerkSpecCard';` and `import { resolveKunstwerkMateriaalLabel } from '@/lib/kunstwerkMateriaal';` lines entirely; nothing else in this file uses `resolveKunstwerkMateriaalLabel`.)

Add `useMemo` to the existing React import (line 3, already imports `useMemo` — no change needed there, it's already imported).

Right after the `kunstenaarNaamById` memo (currently lines 186-190), add the shared data-building helper and the memoized preview object:

```tsx
  function buildKunstwerkData(): Omit<Kunstwerk, 'id'> {
    const materiaalloos = materiaalIds.length === 0;
    const combinaties = materiaalIds.flatMap((materiaalId) => maatIds.map((maatId) => ({ materiaalId, maatId })));
    const basis = {
      foto,
      naam,
      kunstenaarId: kunstenaarId || null,
      formaat,
      segmentIds,
      materiaalIds,
      maatIds: materiaalloos ? [] : maatIds,
      stijlIds,
      onderwerpIds,
      aiGegenereerd,
      prijzen: materiaalloos
        ? []
        : combinaties.map(({ materiaalId, maatId }) => ({
            materiaalId,
            maatId,
            prijs: Number(prijzen[prijsKey(materiaalId, maatId)]),
          })),
      omschrijvingNl,
      omschrijvingFr,
      omschrijvingDe,
      omschrijvingEn,
    };
    return materiaalloos ? { ...basis, prijsPerM2: Number(prijsPerM2) } : basis;
  }

  const previewKunstwerk: Kunstwerk = useMemo(
    () => ({
      id: modalState?.mode === 'edit' ? modalState.kunstwerk.id : 'nieuw-kunstwerk',
      ...buildKunstwerkData(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      foto,
      naam,
      kunstenaarId,
      formaat,
      segmentIds,
      materiaalIds,
      maatIds,
      stijlIds,
      onderwerpIds,
      aiGegenereerd,
      prijzen,
      prijsPerM2,
      omschrijvingNl,
      omschrijvingFr,
      omschrijvingDe,
      omschrijvingEn,
      modalState,
    ]
  );
```

(The `eslint-disable-next-line` is needed because `buildKunstwerkData` itself isn't listed as a dependency — it's a plain function redefined every render from the same state already listed, so listing it too would just force a recompute every render, defeating the point of memoizing.)

Now simplify `handleSave` (currently lines 358-395) to reuse `buildKunstwerkData()` instead of building `basisData`/`data` inline:

```tsx
  async function handleSave() {
    if (!modalState) return;
    const data = buildKunstwerkData();
    const success = modalState.mode === 'add' ? await onAdd(data) : await onUpdate(modalState.kunstwerk.id, data);
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'kunstwerk_toegevoegd' : 'kunstwerk_gewijzigd',
        actorFromMedewerker(user),
        naam
      );
      closeModal();
    } else {
      setActionError(t('kunstwerkenActionError'));
    }
  }
```

Note that the `isMateriaalloos`, `prijsCombinaties` and `allePrijzenIngevuld` consts just above `handleSave` (currently lines 340-346) are still needed as-is for `opslaanDisabled` — leave them untouched, they're independent of `buildKunstwerkData`.

Finally, replace the label-preview block (currently lines 891-907):

```tsx
          <div className="lg:sticky lg:top-0 lg:pt-10">
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-white/60">{t('kunstwerkenLabelPreview')}</span>
              <KunstwerkSpecCard
                fotoSlot={
                  foto ? (
                    <img src={foto} alt={naam} data-testid="kunstwerk-spec-card-foto" className="h-full w-full object-contain" />
                  ) : undefined
                }
                code={naam}
                titel={omschrijvingNl}
                artiest={kunstenaarNaamById.get(kunstenaarId) ?? ''}
                collectieLabels={segmentIds.map((segmentId) => segmentNaamById.get(segmentId) ?? segmentId)}
                materiaalLabel={resolveKunstwerkMateriaalLabel({ materiaalIds }, materialen ?? [], materiaalsoorten ?? [])}
              />
            </div>
          </div>
```

with:

```tsx
          <div className="lg:sticky lg:top-0 lg:pt-10">
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-white/60">{t('kunstwerkenLabelPreview')}</span>
              <ProductModal
                variant="preview"
                kunstwerk={previewKunstwerk}
                materialen={materialen}
                maten={maten}
                materiaalsoorten={materiaalsoorten}
                kunstenaars={kunstenaars}
                segmenten={segmenten}
                stijlen={stijlen}
                onderwerpen={onderwerpen}
                onClose={() => {}}
              />
            </div>
          </div>
```

`kunstenaarNaamById` and `segmentNaamById` are still used elsewhere in this file (`rows` mapping, `materiaalLabel` table) — leave those memos in place.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: PASS — the full file, including the pre-existing ~30 tests (now provider-wrapped) and the 5 new preview tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/KunstwerkenSection.tsx tests/components/beheer/KunstwerkenSection.test.tsx
git commit -m "feat: replace the admin print-label preview with a live ProductModal preview"
```

---

### Task 6: Delete `KunstwerkSpecCard`

**Files:**
- Delete: `src/components/KunstwerkSpecCard.tsx`
- Delete: `tests/components/KunstwerkSpecCard.test.tsx`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/fr.json`, `messages/de.json` (remove the `kunstwerkSpecCard` namespace)

**Interfaces:**
- Consumes: nothing (this task only removes code now that Tasks 4 and 5 removed the last two callers).
- Produces: nothing new.

- [ ] **Step 1: Confirm nothing references `KunstwerkSpecCard` anymore**

Run: `grep -rn "KunstwerkSpecCard" src tests --include="*.tsx" --include="*.ts"`
Expected: no output (both real call sites were removed in Tasks 4 and 5; the only remaining hits before this task are the component file itself and its test file, which this task deletes).

- [ ] **Step 2: Delete the component and its test**

```bash
git rm src/components/KunstwerkSpecCard.tsx tests/components/KunstwerkSpecCard.test.tsx
```

- [ ] **Step 3: Remove the `kunstwerkSpecCard` translation namespace**

In each of `messages/nl.json`, `messages/en.json`, `messages/fr.json`, `messages/de.json`, remove this block (it's identical in shape across all four files, at line 56):

```json
  "kunstwerkSpecCard": {
    "collectie": "...",
    "materiaal": "...",
    "tagline": "Gallery quality printing"
  },
```

(Keep the surrounding `"collectionsPage": { ... },` block above it and `"segments": { ... }` block below it intact — only the `kunstwerkSpecCard` object itself is removed.)

- [ ] **Step 4: Run the full test suite and type check**

Run: `npx vitest run`
Expected: PASS — every test file, with no leftover references to the deleted component or its translations.

Run: `npx tsc --noEmit`
Expected: no errors (confirms no other file still imports the deleted component or its types).

- [ ] **Step 5: Commit**

```bash
git add messages/nl.json messages/en.json messages/fr.json messages/de.json
git commit -m "chore: remove KunstwerkSpecCard now that nothing uses it"
```

---

## Manual verification (after all tasks)

Since this feature is UI-visible and was validated via mockups during brainstorming, do a quick manual pass in the browser before calling it done:

1. Start the dev server and open `/collecties`. Confirm: 3 tiles per row at all viewport widths, white letterbox with a gold border around each photo (landscape/portrait/square all take equal tile space), and hovering (or tabbing to) a tile reveals the omschrijving over a dark gradient.
2. Click a tile. Confirm the dialog shows the full artwork on a dark gold-bordered panel (no cropping), the artiest/collectie/stijl/onderwerp block (only for fields that have data), and that ordering (materiaal/maat/aantal/toevoegen) still works exactly as before.
3. Open `/beheer`, go to Kunstwerken, click "Toevoegen" or an existing row. Confirm the sticky right panel shows the live `ProductModal` preview (not the old white print-label card), that editing any field updates the preview, and that its "Toevoegen"-equivalent button is disabled with the preview-only message.
