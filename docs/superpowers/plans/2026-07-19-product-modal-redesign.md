# Product Modal Redesign Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 19-07-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hover-reveal "Toevoegen aan mandje" button on each `ProductsGrid` card with a single shared `ProductModal` that opens when the card itself is clicked, styled with a new gold accent color scoped to the cart/CTA flow.

**Architecture:** `AddToCartButton.tsx` (one instance per card, its own open/closed state) is deleted and replaced by `ProductModal.tsx`, a single component rendered once by `ProductsGrid` and controlled by which image is currently "selected" (`useState<SegmentImage | null>`). Clicking any product card sets that state; clicking the modal's backdrop, its close button, or pressing Escape clears it. The modal calls the existing `useCart().addItem(...)` exactly as `AddToCartButton` did — only the UI shell and trigger mechanism change, not the cart data model. New `gold`/`gold-bright` Tailwind tokens are used only inside the modal (confirm button, quantity-stepper hover, segment title) — everything else on the site keeps its existing silver styling.

**Tech Stack:** Same as the existing project — Next.js 14 (App Router) + TypeScript, Tailwind CSS, next-intl v3, Vitest + React Testing Library.

## Global Constraints

- Gold is scoped **only** to the add-to-cart modal (confirm button, quantity-stepper hover state, segment title) — `NavBar`, `LanguageSwitcher`, login button, `CartPanel`'s existing nav dropdown, and `AccountMenu` all keep their current silver styling, untouched.
- `CartPanel` (the nav cart icon + badge + dropdown list + "Toevoegen aan bestelling" flow) is **not modified** by this plan at all.
- `useCart`, `useOrders`, `AccountMenu`, and order-placement behavior are **not modified** — this plan only changes how an item gets added to the cart, not what happens after.
- Add-to-cart stays confined to `ProductsGrid` cards — the homepage's "Uitgelichte werken" placeholders still get no add-to-cart affordance.
- On confirm: add the item to the cart, flash the confirm button green with "Toegevoegd!" (translated) for 600ms, then close the modal and reset the modal's local size/quantity state back to defaults.
- The modal closes via: clicking the backdrop, clicking a close (×) button, or pressing Escape — none of these three exceptions save/discard anything beyond just closing.

---

## File Structure Overview

```
tailwind.config.ts                          (MODIFY — add gold/gold-bright color tokens)
messages/{nl,en,de,fr}.json                  (MODIFY — add cart.added, cart.close keys)
src/components/ProductModal.tsx              (CREATE)
src/components/ProductsGrid.tsx              (MODIFY — click-to-open instead of per-card button)
src/components/AddToCartButton.tsx           (DELETE)
tests/components/ProductModal.test.tsx       (CREATE)
tests/components/ProductsGrid.test.tsx       (MODIFY — replace add-to-cart-button assertions with modal-open assertions)
tests/components/AddToCartButton.test.tsx    (DELETE)
```

---

### Task 1: Gold color tokens and new cart translation keys

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `messages/nl.json`
- Modify: `messages/en.json`
- Modify: `messages/de.json`
- Modify: `messages/fr.json`

**Interfaces:**
- Produces: Tailwind utility classes `bg-gold`, `text-gold`, `hover:bg-gold-bright`, etc. (from the new `gold`/`gold-bright` color tokens) — used by Task 2 (`ProductModal`).
- Produces: message keys `cart.added`, `cart.close` — used by Task 2 (`ProductModal`).

- [ ] **Step 1: Add the gold color tokens to `tailwind.config.ts`**

Current content:

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#060607',
        charcoal: '#1c1e22',
        graphite: '#2a2d33',
        silver: '#e2e4e8',
        'silver-dim': '#9aa0aa',
      },
    },
  },
  plugins: [],
};

export default config;
```

Replace the `colors` block with:

```ts
      colors: {
        ink: '#060607',
        charcoal: '#1c1e22',
        graphite: '#2a2d33',
        silver: '#e2e4e8',
        'silver-dim': '#9aa0aa',
        gold: '#D4AF37',
        'gold-bright': '#E8C468',
      },
```

- [ ] **Step 2: Add `cart.added` and `cart.close` to `messages/nl.json`**

In the existing `"cart"` object, add two keys (after `"requestedStatus"`):

```json
    "requestedStatus": "Aangevraagd",
    "added": "Toegevoegd!",
    "close": "Sluiten"
```

- [ ] **Step 3: Add `cart.added` and `cart.close` to `messages/en.json`**

```json
    "requestedStatus": "Requested",
    "added": "Added!",
    "close": "Close"
```

- [ ] **Step 4: Add `cart.added` and `cart.close` to `messages/de.json`**

```json
    "requestedStatus": "Angefragt",
    "added": "Hinzugefügt!",
    "close": "Schließen"
```

- [ ] **Step 5: Add `cart.added` and `cart.close` to `messages/fr.json`**

```json
    "requestedStatus": "Demandée",
    "added": "Ajouté !",
    "close": "Fermer"
```

- [ ] **Step 6: Verify all 4 locale files still have identical key structure**

Run: `node -e "const fs=require('fs'); const locales=['nl','en','de','fr']; const keys = locales.map(l => JSON.stringify(Object.keys(JSON.parse(fs.readFileSync('messages/'+l+'.json')).cart).sort())); console.log(keys.every(k => k === keys[0]) ? 'MATCH' : 'MISMATCH: ' + keys.join(' | '))"`
Expected: `MATCH`

- [ ] **Step 7: Run the full test suite to confirm nothing broke**

Run: `npm test`
Expected: PASS — all existing tests still green (this task only adds new keys/tokens, doesn't remove anything yet).

- [ ] **Step 8: Commit**

```bash
git add tailwind.config.ts messages/nl.json messages/en.json messages/de.json messages/fr.json
git commit -m "feat: add gold accent color tokens and cart added/close translation keys"
```

---

### Task 2: ProductModal component

**Files:**
- Create: `src/components/ProductModal.tsx`
- Create: `tests/components/ProductModal.test.tsx`

**Interfaces:**
- Consumes: `STANDARD_SIZES` (`@/data/sizes`), `useCart` (`@/lib/useCart`), `SegmentImage` type (`@/data/segments`), message keys `cart.{size,quantity,confirm,added,close}` and `segments.*.title` (all exist from Task 1 and earlier work).
- Produces: `ProductModal({ image, onClose }: { image: SegmentImage | null; onClose: () => void })` — used by Task 3 (`ProductsGrid`). Renders nothing when `image` is `null`. When open, renders `data-testid="product-modal"`, `data-testid="product-modal-backdrop"`, `data-testid="product-modal-close"`, `data-testid="product-modal-size"` (a `<select>`), `data-testid="product-modal-quantity-minus"`, `data-testid="product-modal-quantity-value"`, `data-testid="product-modal-quantity-plus"`, `data-testid="product-modal-confirm"`.

- [ ] **Step 1: Write the failing tests**

Create `tests/components/ProductModal.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ProductModal } from '@/components/ProductModal';
import { CartProvider, useCart } from '@/lib/useCart';
import messages from '../../messages/nl.json';

const SAMPLE_IMAGE = {
  id: 'wellness-0',
  src: 'https://images.unsplash.com/example.jpg',
  segmentSlug: 'wellness',
  segmentMessageKey: 'wellness',
};

function renderModal(onClose: () => void = () => {}) {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CartProvider>
        <ProductModal image={SAMPLE_IMAGE} onClose={onClose} />
      </CartProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ProductModal', () => {
  it('renders nothing when image is null', () => {
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CartProvider>
          <ProductModal image={null} onClose={() => {}} />
        </CartProvider>
      </NextIntlClientProvider>
    );
    expect(screen.queryByTestId('product-modal')).not.toBeInTheDocument();
  });

  it('shows the segment title, default size, and quantity 1 when open', () => {
    renderModal();
    expect(screen.getByText('Wellness')).toBeInTheDocument();
    expect(screen.getByTestId('product-modal-size')).toHaveValue('40x60cm');
    expect(screen.getByTestId('product-modal-quantity-value')).toHaveTextContent('1');
  });

  it('increments and decrements quantity, never below 1', () => {
    renderModal();
    fireEvent.click(screen.getByTestId('product-modal-quantity-minus'));
    expect(screen.getByTestId('product-modal-quantity-value')).toHaveTextContent('1');
    fireEvent.click(screen.getByTestId('product-modal-quantity-plus'));
    fireEvent.click(screen.getByTestId('product-modal-quantity-plus'));
    expect(screen.getByTestId('product-modal-quantity-value')).toHaveTextContent('3');
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    renderModal(onClose);
    fireEvent.click(screen.getByTestId('product-modal-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    renderModal(onClose);
    fireEvent.click(screen.getByTestId('product-modal-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    renderModal(onClose);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('adds the chosen size/quantity to the cart, shows the confirmed state, then closes after the delay', () => {
    const onClose = vi.fn();

    function Probe() {
      const { items } = useCart();
      return <div data-testid="probe">{JSON.stringify(items)}</div>;
    }

    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CartProvider>
          <ProductModal image={SAMPLE_IMAGE} onClose={onClose} />
          <Probe />
        </CartProvider>
      </NextIntlClientProvider>
    );

    fireEvent.change(screen.getByTestId('product-modal-size'), { target: { value: '60x90cm' } });
    fireEvent.click(screen.getByTestId('product-modal-quantity-plus'));
    fireEvent.click(screen.getByTestId('product-modal-confirm'));

    const items = JSON.parse(screen.getByTestId('probe').textContent ?? '[]');
    expect(items).toHaveLength(1);
    expect(items[0].size).toBe('60x90cm');
    expect(items[0].quantity).toBe(2);

    expect(screen.getByTestId('product-modal-confirm')).toHaveTextContent('Toegevoegd!');
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- ProductModal`
Expected: FAIL — `Cannot find module '@/components/ProductModal'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/ProductModal.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { STANDARD_SIZES } from '@/data/sizes';
import { useCart } from '@/lib/useCart';
import type { SegmentImage } from '@/data/segments';

const CONFIRM_FEEDBACK_MS = 600;

interface ProductModalProps {
  image: SegmentImage | null;
  onClose: () => void;
}

export function ProductModal({ image, onClose }: ProductModalProps) {
  const t = useTranslations('cart');
  const tSegments = useTranslations('segments');
  const [size, setSize] = useState<string>(STANDARD_SIZES[0]);
  const [quantity, setQuantity] = useState(1);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const { addItem } = useCart();

  useEffect(() => {
    if (!image) {
      return;
    }
    setSize(STANDARD_SIZES[0]);
    setQuantity(1);
    setIsConfirmed(false);
  }, [image]);

  useEffect(() => {
    if (!image) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [image, onClose]);

  if (!image) {
    return null;
  }

  function handleConfirm() {
    addItem({
      segmentSlug: image.segmentSlug,
      segmentMessageKey: image.segmentMessageKey,
      imageSrc: image.src,
      size,
      quantity,
    });
    setIsConfirmed(true);
    setTimeout(() => {
      onClose();
    }, CONFIRM_FEEDBACK_MS);
  }

  return (
    <div data-testid="product-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        data-testid="product-modal-backdrop"
        onClick={onClose}
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
      />
      <div className="relative z-10 grid w-full max-w-2xl grid-cols-1 overflow-hidden rounded-lg border border-white/10 bg-charcoal sm:grid-cols-2">
        <button
          type="button"
          data-testid="product-modal-close"
          aria-label={t('close')}
          onClick={onClose}
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white/80 hover:text-white"
        >
          ×
        </button>
        <img
          src={image.src}
          alt={tSegments(`${image.segmentMessageKey}.title`)}
          className="h-56 w-full object-cover sm:h-full"
        />
        <div className="flex flex-col gap-4 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-gold">
            {tSegments(`${image.segmentMessageKey}.title`)}
          </p>
          <label className="flex flex-col gap-1 text-[0.65rem] uppercase tracking-wide text-white/60">
            {t('size')}
            <select
              data-testid="product-modal-size"
              value={size}
              onChange={(event) => setSize(event.target.value)}
              className="rounded-sm bg-black/40 px-2 py-1.5 text-sm text-white"
            >
              {STANDARD_SIZES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center justify-between gap-2 text-sm text-white/80">
            <span className="text-[0.65rem] uppercase tracking-wide text-white/60">
              {t('quantity')}
            </span>
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
            className={`rounded-sm px-4 py-2.5 text-xs tracking-[0.15em] transition ${
              isConfirmed
                ? 'bg-green-500 text-white'
                : 'bg-gold text-ink hover:-translate-y-0.5 hover:bg-gold-bright'
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- ProductModal`
Expected: PASS — 7 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/ProductModal.tsx tests/components/ProductModal.test.tsx
git commit -m "feat: add ProductModal for click-to-open add-to-cart"
```

---

### Task 3: Wire ProductModal into ProductsGrid, remove AddToCartButton

**Files:**
- Modify: `src/components/ProductsGrid.tsx`
- Modify: `tests/components/ProductsGrid.test.tsx`
- Delete: `src/components/AddToCartButton.tsx`
- Delete: `tests/components/AddToCartButton.test.tsx`

**Interfaces:**
- Consumes: `ProductModal` (Task 2, `@/components/ProductModal`).
- Produces: `ProductsGrid` — same public interface (no props). Each `product-card` is now clickable (`onClick`), no longer renders `AddToCartButton`. A single `ProductModal` is rendered alongside the grid, controlled by the grid's own `selectedImage` state.

- [ ] **Step 1: Update `tests/components/ProductsGrid.test.tsx`**

Replace the file in full:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ProductsGrid } from '@/components/ProductsGrid';
import { CartProvider } from '@/lib/useCart';
import messages from '../../messages/nl.json';

function renderProductsGrid() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CartProvider>
        <ProductsGrid />
      </CartProvider>
    </NextIntlClientProvider>
  );
}

describe('ProductsGrid', () => {
  it('shows all 36 images and 7 filter buttons (all + 6 segments) by default', () => {
    renderProductsGrid();
    expect(screen.getAllByTestId('product-card')).toHaveLength(36);
    expect(screen.getByTestId('filter-all')).toBeInTheDocument();
    expect(screen.getByTestId('filter-hotel')).toBeInTheDocument();
    expect(screen.getByTestId('filter-restaurant')).toBeInTheDocument();
    expect(screen.getByTestId('filter-wellness')).toBeInTheDocument();
    expect(screen.getByTestId('filter-office')).toBeInTheDocument();
    expect(screen.getByTestId('filter-abstract')).toBeInTheDocument();
    expect(screen.getByTestId('filter-artist-collections')).toBeInTheDocument();
  });

  it('shows only that segment\'s 6 images after clicking its filter button', () => {
    renderProductsGrid();
    fireEvent.click(screen.getByTestId('filter-wellness'));
    expect(screen.getAllByTestId('product-card')).toHaveLength(6);
  });

  it('returns to all 36 images after clicking the "Alle" filter again', () => {
    renderProductsGrid();
    fireEvent.click(screen.getByTestId('filter-wellness'));
    fireEvent.click(screen.getByTestId('filter-all'));
    expect(screen.getAllByTestId('product-card')).toHaveLength(36);
  });

  it('marks the active filter button with aria-pressed', () => {
    renderProductsGrid();
    expect(screen.getByTestId('filter-all')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('filter-office'));
    expect(screen.getByTestId('filter-office')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('filter-all')).toHaveAttribute('aria-pressed', 'false');
  });

  it('opens the product modal when a card is clicked, closed by default', () => {
    renderProductsGrid();
    expect(screen.queryByTestId('product-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByTestId('product-card')[0]);
    expect(screen.getByTestId('product-modal')).toBeInTheDocument();
  });

  it('closes the product modal when its backdrop is clicked', () => {
    renderProductsGrid();
    fireEvent.click(screen.getAllByTestId('product-card')[0]);
    expect(screen.getByTestId('product-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('product-modal-backdrop'));
    expect(screen.queryByTestId('product-modal')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify the new tests fail**

Run: `npm test -- ProductsGrid`
Expected: FAIL — the two new modal tests fail (`product-modal` never appears, since `ProductsGrid.tsx` hasn't changed yet); the 4 pre-existing filter tests still pass.

- [ ] **Step 3: Update `src/components/ProductsGrid.tsx`**

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { SEGMENTS, getAllImages, type SegmentImage } from '@/data/segments';
import { ProductModal } from './ProductModal';

const ALL_FILTER = 'all';

export function ProductsGrid() {
  const tSegments = useTranslations('segments');
  const tCollections = useTranslations('collectionsPage');
  const [activeFilter, setActiveFilter] = useState(ALL_FILTER);
  const [selectedImage, setSelectedImage] = useState<SegmentImage | null>(null);
  const allImages = useMemo(() => getAllImages(), []);

  const visibleImages =
    activeFilter === ALL_FILTER
      ? allImages
      : allImages.filter((image) => image.segmentSlug === activeFilter);

  function filterButtonClass(isActive: boolean) {
    return isActive
      ? 'rounded-full bg-silver px-4 py-1.5 text-xs tracking-wide text-ink'
      : 'rounded-full border border-white/20 px-4 py-1.5 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white';
  }

  return (
    <>
      <div className="mx-auto mb-8 flex max-w-5xl flex-wrap justify-center gap-2">
        <button
          type="button"
          data-testid="filter-all"
          aria-pressed={activeFilter === ALL_FILTER}
          onClick={() => setActiveFilter(ALL_FILTER)}
          className={filterButtonClass(activeFilter === ALL_FILTER)}
        >
          {tCollections('filterAll')} ({allImages.length})
        </button>
        {SEGMENTS.map((segment) => (
          <button
            key={segment.slug}
            type="button"
            data-testid={`filter-${segment.slug}`}
            aria-pressed={activeFilter === segment.slug}
            onClick={() => setActiveFilter(segment.slug)}
            className={filterButtonClass(activeFilter === segment.slug)}
          >
            {tSegments(`${segment.messageKey}.title`)} ({segment.images.length})
          </button>
        ))}
      </div>

      <div
        data-testid="products-grid"
        className="mx-auto grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      >
        {visibleImages.map((image) => (
          <div
            key={image.id}
            data-testid="product-card"
            onClick={() => setSelectedImage(image)}
            className="relative cursor-pointer overflow-hidden rounded border border-white/10 transition hover:brightness-110"
          >
            <img
              src={image.src}
              alt={tSegments(`${image.segmentMessageKey}.title`)}
              className="aspect-square w-full object-cover"
            />
            <span className="absolute left-2 top-2 rounded-sm bg-black/70 px-2 py-1 text-[0.6rem] uppercase tracking-wide text-white">
              {tSegments(`${image.segmentMessageKey}.title`)}
            </span>
          </div>
        ))}
      </div>

      <ProductModal image={selectedImage} onClose={() => setSelectedImage(null)} />
    </>
  );
}
```

- [ ] **Step 4: Delete `src/components/AddToCartButton.tsx` and `tests/components/AddToCartButton.test.tsx`**

```bash
git rm src/components/AddToCartButton.tsx tests/components/AddToCartButton.test.tsx
```

- [ ] **Step 5: Run tests to verify everything passes**

Run: `npm test`
Expected: PASS — all tests green (`AddToCartButton.test.tsx` no longer exists, so it's no longer collected).

- [ ] **Step 6: Commit**

```bash
git add src/components/ProductsGrid.tsx tests/components/ProductsGrid.test.tsx
git commit -m "feat: replace per-card add-to-cart button with click-to-open ProductModal"
```

---

### Task 4: Static export build verification

**Files:**
- No new files. This task verifies the redesign builds correctly and works end-to-end in a real browser.

- [ ] **Step 1: Run the production build**

Run: `npm run build`
Expected: build completes successfully, no new errors.

- [ ] **Step 2: Run the full test suite one final time**

Run: `npm test`
Expected: PASS — all tests green.

- [ ] **Step 3: Verify the gold color made it into the compiled CSS**

The modal is a client component that only renders after a click, so its translated strings won't appear in the pre-rendered static HTML — that's expected, not a bug. What we can check statically is that Tailwind actually compiled the new `gold`/`gold-bright` utility classes into the CSS bundle (Tailwind scans source files at build time regardless of when a component renders at runtime).

Run: `grep -o "D4AF37\|E8C468" out/_next/static/css/*.css | sort -u`
Expected: both `D4AF37` and `E8C468` found (case may be lowercased by the CSS minifier — if the exact-case grep finds nothing, retry with `grep -io`).

- [ ] **Step 4: Manually verify in the browser**

Run: `npx serve out -l 4175` (or reuse whatever static server command was used for previous plans) and open the site.

Check:
- On `/collecties`, product cards show a pointer cursor and a subtle hover effect, with NO visible button overlay.
- Clicking a card opens a centered modal: image on one side, segment title (in gold), size dropdown, quantity stepper, and a gold confirm button.
- The quantity stepper's +/- buttons turn gold on hover.
- Clicking confirm: the button briefly turns green with "Toegevoegd!", then the modal closes automatically.
- The cart icon badge in the nav updates with the new total quantity.
- Clicking a card again, then clicking the backdrop (outside the panel), closes the modal without adding anything.
- Clicking a card again, then pressing Escape, closes the modal without adding anything.
- Clicking a card again, then clicking the × close button, closes the modal without adding anything.
- Adding the same artwork + size twice still merges into one line with quantity 2 (existing `useCart` merge behavior, unaffected by this plan).
- Switching languages updates the modal's labels and the "Toegevoegd!" text correctly.
- Mobile width (375px): the modal stacks to one column (image on top, details below) and remains usable, no horizontal overflow.
- Confirm the rest of the site (`NavBar`, `LanguageSwitcher`, login button, `CartPanel`'s dropdown, `AccountMenu`) still shows silver, not gold — gold appears only inside the product modal.

- [ ] **Step 5: Commit**

No code changes expected in this task. If Steps 1–4 surfaced a fix, commit it with a message describing what was broken, then re-run Steps 1–4.
