# Producten-pagina met filter Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 18-07-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 6 separate segment pages and the tile-based overview page with a single `/collecties` page showing all 36 images in one filterable grid (Zeus-style filter buttons + counts), and simplify the NavBar's "Collecties" item from a hover-dropdown to a plain link.

**Architecture:** `CollectiesPage` stays a server component (`getTranslations`, `setRequestLocale` — same pattern as before), but its body changes to render a new client component, `ProductsGrid`, which owns the filter state (`useState`) and reads segment/image data from `@/data/segments`. A new pure helper, `getAllImages()`, flattens all 6 segments' images into one tagged list so the grid and its filtering logic don't need to know about per-segment structure. The old `[segment]` dynamic route is deleted entirely. `SegmentCta` is renamed to `BecomeClientCta` since it's no longer tied to a specific segment page — same component, same hide-when-logged-in behavior, now rendered once at the bottom of the unified page.

**Tech Stack:** Same as the existing project — Next.js 14 (App Router) + TypeScript, Tailwind CSS, next-intl v3, Vitest + React Testing Library.

## Global Constraints

- 36 images across 6 segments (`hotel`, `restaurant`, `wellness`, `office`, `abstract`, `artist-collections`) — all shown on one page, filterable client-side, no page navigation on filter.
- Segment intro texts (`segments.*.intro`) are explicitly dropped per the design spec — do not preserve them anywhere (not as a caption, not as a tooltip).
- `segments.*.title` keys are kept (used for filter button labels and per-image badges).
- NavBar's "Collecties" becomes a plain link to `/collecties` — no dropdown, no hover state, no per-segment sub-links.
- The existing "no `useTranslations` in a Server Component" architecture rule still applies: `ProductsGrid` (interactive, needs client state) must have `'use client'`; `CollectiesPage` (the page itself) stays a server component using `getTranslations`.
- Reuse the existing "Glass Reflection" visual language (`GlassPanel`, gradient background, silver/zwart accents) — filter buttons get a pill/underline active state in that palette, not Zeus's own colors.

---

## File Structure Overview

```
messages/{nl,en,de,fr}.json                    (MODIFY — remove segments.*.intro, add collectionsPage.filterAll)
src/data/segments.ts                            (MODIFY — add SegmentImage type + getAllImages())
src/components/BecomeClientCta.tsx              (CREATE — renamed from SegmentCta.tsx)
src/components/SegmentCta.tsx                   (DELETE)
src/components/ProductsGrid.tsx                 (CREATE)
src/components/NavBar.tsx                       (MODIFY — remove dropdown)
src/app/[locale]/collecties/page.tsx            (MODIFY — render ProductsGrid + BecomeClientCta)
src/app/[locale]/collecties/[segment]/page.tsx  (DELETE — whole directory)
tests/data/segments.test.ts                     (MODIFY — add getAllImages tests)
tests/components/BecomeClientCta.test.tsx       (CREATE — renamed from SegmentCta.test.tsx)
tests/components/SegmentCta.test.tsx            (DELETE)
tests/components/ProductsGrid.test.tsx          (CREATE)
tests/components/NavBar.test.tsx                (MODIFY — remove dropdown test case)
```

---

### Task 1: Update translation messages

**Files:**
- Modify: `messages/nl.json`
- Modify: `messages/en.json`
- Modify: `messages/de.json`
- Modify: `messages/fr.json`

**Interfaces:**
- Removes: `segments.*.intro` for all 6 segments, in all 4 locale files.
- Produces: `collectionsPage.filterAll` — used by Task 4 (`ProductsGrid`).
- Preserves unchanged: `segments.*.title`, `collectionsPage.title`, `collectionsPage.intro`, and every other existing key.

- [ ] **Step 1: Update `messages/nl.json`**

Remove every `"intro": "..."` line under `segments.hotel`, `segments.restaurant`, `segments.wellness`, `segments.office`, `segments.abstract`, `segments.artistCollections` (keep `"title"` in each), and add `"filterAll": "Alle"` inside `collectionsPage`. The `segments` block should read:

```json
  "collectionsPage": {
    "title": "Collecties",
    "intro": "Ontdek onze kunstwerken op glas, gerangschikt per toepassing.",
    "filterAll": "Alle"
  },
  "segments": {
    "hotel": {
      "title": "Hotel"
    },
    "restaurant": {
      "title": "Restaurant"
    },
    "wellness": {
      "title": "Wellness"
    },
    "office": {
      "title": "Office"
    },
    "abstract": {
      "title": "Abstract"
    },
    "artistCollections": {
      "title": "Artist Collections"
    }
  },
```

Everything else in the file (`hero`, `about`, `works`, `contact`, `nav`, `orders`) stays exactly as-is.

- [ ] **Step 2: Update `messages/en.json`** — same structural change, English values:

```json
  "collectionsPage": {
    "title": "Collections",
    "intro": "Discover our artwork on glass, organized by application.",
    "filterAll": "All"
  },
  "segments": {
    "hotel": { "title": "Hotel" },
    "restaurant": { "title": "Restaurant" },
    "wellness": { "title": "Wellness" },
    "office": { "title": "Office" },
    "abstract": { "title": "Abstract" },
    "artistCollections": { "title": "Artist Collections" }
  },
```

- [ ] **Step 3: Update `messages/de.json`** — same structural change, German values:

```json
  "collectionsPage": {
    "title": "Kollektionen",
    "intro": "Entdecken Sie unsere Kunstwerke auf Glas, gegliedert nach Einsatzbereich.",
    "filterAll": "Alle"
  },
  "segments": {
    "hotel": { "title": "Hotel" },
    "restaurant": { "title": "Restaurant" },
    "wellness": { "title": "Wellness" },
    "office": { "title": "Office" },
    "abstract": { "title": "Abstrakt" },
    "artistCollections": { "title": "Artist Collections" }
  },
```

- [ ] **Step 4: Update `messages/fr.json`** — same structural change, French values:

```json
  "collectionsPage": {
    "title": "Collections",
    "intro": "Découvrez nos œuvres sur verre, classées par application.",
    "filterAll": "Tous"
  },
  "segments": {
    "hotel": { "title": "Hôtel" },
    "restaurant": { "title": "Restaurant" },
    "wellness": { "title": "Bien-être" },
    "office": { "title": "Bureaux" },
    "abstract": { "title": "Abstrait" },
    "artistCollections": { "title": "Artist Collections" }
  },
```

- [ ] **Step 5: Verify all 4 files are valid JSON with identical key structure**

Run: `node -e "const fs=require('fs'); const locales=['nl','en','de','fr']; const keys = locales.map(l => JSON.stringify(Object.keys(JSON.parse(fs.readFileSync('messages/'+l+'.json'))).sort())); console.log(keys.every(k => k === keys[0]) ? 'MATCH' : 'MISMATCH: ' + keys.join(' | '))"`
Expected: `MATCH`

- [ ] **Step 6: Commit**

```bash
git add messages/nl.json messages/en.json messages/de.json messages/fr.json
git commit -m "feat: drop segment intro copy, add collectionsPage.filterAll translation key"
```

---

### Task 2: Flattened, filterable image list helper

**Files:**
- Modify: `src/data/segments.ts`
- Modify: `tests/data/segments.test.ts`

**Interfaces:**
- Produces: `SegmentImage = { id: string; src: string; segmentSlug: string; segmentMessageKey: string }` and `getAllImages(): SegmentImage[]` from `@/data/segments` — used by Task 4 (`ProductsGrid`).

- [ ] **Step 1: Write the failing test**

Append to `tests/data/segments.test.ts` (after the existing `describe('getSegment', ...)` block, do not modify the existing tests above it):

```ts
describe('getAllImages', () => {
  it('returns all 36 images (6 segments × 6 images) tagged with their segment', () => {
    const images = getAllImages();
    expect(images).toHaveLength(36);
    expect(images.filter((img) => img.segmentSlug === 'wellness')).toHaveLength(6);
  });

  it('gives every image a unique id', () => {
    const ids = getAllImages().map((img) => img.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('tags each image with the correct messageKey for its segment', () => {
    const artistImages = getAllImages().filter((img) => img.segmentSlug === 'artist-collections');
    expect(artistImages).toHaveLength(6);
    for (const img of artistImages) {
      expect(img.segmentMessageKey).toBe('artistCollections');
    }
  });
});
```

Also update the top import line to include the new function:

```ts
import { SEGMENTS, getSegment, getAllImages } from '@/data/segments';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- segments`
Expected: FAIL — `getAllImages` is not exported / is not a function.

- [ ] **Step 3: Implement `getAllImages` in `src/data/segments.ts`**

Add this below the existing `getSegment` function (keep everything above it — `Segment` interface, `SEGMENTS` array, `getSegment` — completely unchanged):

```ts
export interface SegmentImage {
  id: string;
  src: string;
  segmentSlug: string;
  segmentMessageKey: string;
}

export function getAllImages(): SegmentImage[] {
  return SEGMENTS.flatMap((segment) =>
    segment.images.map((src, index) => ({
      id: `${segment.slug}-${index}`,
      src,
      segmentSlug: segment.slug,
      segmentMessageKey: segment.messageKey,
    }))
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- segments`
Expected: PASS — 8 tests passed (5 existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/data/segments.ts tests/data/segments.test.ts
git commit -m "feat: add getAllImages helper for the unified products grid"
```

---

### Task 3: Rename SegmentCta to BecomeClientCta, delete the segment route

**Files:**
- Create: `src/components/BecomeClientCta.tsx`
- Delete: `src/components/SegmentCta.tsx`
- Create: `tests/components/BecomeClientCta.test.tsx`
- Delete: `tests/components/SegmentCta.test.tsx`
- Delete: `src/app/[locale]/collecties/[segment]/page.tsx` (and the now-empty `[segment]` directory)

**Interfaces:**
- Produces: `BecomeClientCta({ contactHref }: { contactHref: string })` — same props and behavior as the old `SegmentCta`, used by Task 5 (`CollectiesPage`).

- [ ] **Step 1: Create `src/components/BecomeClientCta.tsx`**

Identical content to the current `src/components/SegmentCta.tsx`, just the function/export name changed:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useMockAuth } from '@/lib/useMockAuth';

export function BecomeClientCta({ contactHref }: { contactHref: string }) {
  const t = useTranslations('nav');
  const { isHydrated, isLoggedIn } = useMockAuth();

  if (isHydrated && isLoggedIn) {
    return null;
  }

  return (
    <a
      href={contactHref}
      data-testid="segment-cta"
      className="inline-block rounded-sm bg-silver px-6 py-3 text-xs tracking-[0.2em] text-ink"
    >
      {t('becomeClient')}
    </a>
  );
}
```

(The `data-testid="segment-cta"` is kept as-is — it's a generic "become a client CTA" marker, not tied to the old per-segment page, so renaming it isn't necessary and would only churn the test file for no reason.)

- [ ] **Step 2: Create `tests/components/BecomeClientCta.test.tsx`**

Identical to the current `tests/components/SegmentCta.test.tsx`, just updated import path and component name:

```tsx
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BecomeClientCta } from '@/components/BecomeClientCta';
import { MockAuthProvider } from '@/lib/useMockAuth';
import messages from '../../messages/nl.json';

function renderBecomeClientCta() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <MockAuthProvider>
        <BecomeClientCta contactHref="/nl/#contact" />
      </MockAuthProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('BecomeClientCta', () => {
  it('shows the "Word klant" link when logged out', () => {
    renderBecomeClientCta();
    expect(screen.getByTestId('segment-cta')).toHaveAttribute('href', '/nl/#contact');
  });

  it('hides the link when already logged in', () => {
    window.localStorage.setItem('glassart-mock-logged-in', 'true');
    renderBecomeClientCta();
    expect(screen.queryByTestId('segment-cta')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the new test to verify it passes**

Run: `npm test -- BecomeClientCta`
Expected: PASS — 2 tests passed.

- [ ] **Step 4: Delete the old component/test and the whole segment route**

The old `[segment]/page.tsx` is the only remaining importer of `SegmentCta`. Delete it in the same step so there's never a commit with a dangling import:

```bash
git rm src/components/SegmentCta.tsx tests/components/SegmentCta.test.tsx
git rm -r "src/app/[locale]/collecties/[segment]"
```

- [ ] **Step 5: Verify no dangling references remain**

Run: `npx tsc --noEmit`
Expected: no errors (confirms nothing still imports the deleted `SegmentCta` or references the deleted route).

Run: `npm test`
Expected: PASS — all tests green (the old `SegmentCta.test.tsx` no longer exists, so it doesn't run).

- [ ] **Step 6: Commit**

```bash
git add src/components/BecomeClientCta.tsx tests/components/BecomeClientCta.test.tsx
git commit -m "refactor: rename SegmentCta to BecomeClientCta, delete old per-segment route"
```

---

### Task 4: ProductsGrid component (filter buttons + image grid)

**Files:**
- Create: `src/components/ProductsGrid.tsx`
- Create: `tests/components/ProductsGrid.test.tsx`

**Interfaces:**
- Consumes: `SEGMENTS`, `getAllImages` (Task 2, `@/data/segments`), message keys `collectionsPage.filterAll`, `segments.*.title` (Task 1).
- Produces: `ProductsGrid()` — no props, used by Task 5 (`CollectiesPage`). Renders `data-testid="filter-all"` and `data-testid="filter-<slug>"` per segment (6 filter buttons + "all"), `data-testid="products-grid"` wrapping `data-testid="product-card"` per visible image.

- [ ] **Step 1: Write the failing test**

Create `tests/components/ProductsGrid.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ProductsGrid } from '@/components/ProductsGrid';
import messages from '../../messages/nl.json';

function renderProductsGrid() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <ProductsGrid />
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ProductsGrid`
Expected: FAIL — `Cannot find module '@/components/ProductsGrid'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/ProductsGrid.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { SEGMENTS, getAllImages } from '@/data/segments';

const ALL_FILTER = 'all';

export function ProductsGrid() {
  const tSegments = useTranslations('segments');
  const tCollections = useTranslations('collectionsPage');
  const [activeFilter, setActiveFilter] = useState(ALL_FILTER);
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
            className="relative overflow-hidden rounded border border-white/10"
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
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ProductsGrid`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/ProductsGrid.tsx tests/components/ProductsGrid.test.tsx
git commit -m "feat: add ProductsGrid with client-side segment filtering"
```

---

### Task 5: Rewrite the collections page

**Files:**
- Modify: `src/app/[locale]/collecties/page.tsx`

**Interfaces:**
- Consumes: `ProductsGrid` (Task 4), `BecomeClientCta` (Task 3), `GlassPanel` (existing), `BASE_PATH` (existing, `@/lib/basePath`), message keys `collectionsPage.title`/`collectionsPage.intro` (Task 1).
- Produces: `CollectiesPage()` — async Server Component, no unit test per this project's established convention (verified in Task 7's build).

- [ ] **Step 1: Replace `src/app/[locale]/collecties/page.tsx`**

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { GlassPanel } from '@/components/GlassPanel';
import { ProductsGrid } from '@/components/ProductsGrid';
import { BecomeClientCta } from '@/components/BecomeClientCta';
import { BASE_PATH } from '@/lib/basePath';

export default async function CollectiesPage({
  params,
}: {
  params: { locale: string };
}) {
  const { locale } = params;
  setRequestLocale(locale);
  const t = await getTranslations('collectionsPage');
  const contactHref = `${BASE_PATH}/${locale}/#contact`;

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-ink via-charcoal to-graphite px-4 pb-16 pt-24 sm:px-8">
      <GlassPanel className="mx-auto mb-10 max-w-3xl text-center">
        <h1 className="text-2xl font-light text-white sm:text-3xl">{t('title')}</h1>
        <p className="mt-3 text-sm text-white/70">{t('intro')}</p>
      </GlassPanel>

      <ProductsGrid />

      <div className="mx-auto mt-10 max-w-3xl text-center">
        <BecomeClientCta contactHref={contactHref} />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Run `tsc --noEmit` and the full test suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: PASS — all tests green.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/collecties/page.tsx"
git commit -m "feat: rewrite collections page as a unified, filterable products grid"
```

---

### Task 6: Simplify NavBar (remove the Collections dropdown)

**Files:**
- Modify: `src/components/NavBar.tsx`
- Modify: `tests/components/NavBar.test.tsx`

**Interfaces:**
- Produces: `NavBar()` — same public interface as before (no props), but `"Collecties"` is now a single `Link` with no dropdown, no `isCollectionsOpen` state, no `SEGMENTS` import.

- [ ] **Step 1: Update the test first**

Replace `tests/components/NavBar.test.tsx` in full:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { NavBar } from '@/components/NavBar';
import { MockAuthProvider } from '@/lib/useMockAuth';
import messages from '../../messages/nl.json';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => '/',
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@/components/AccountMenu', () => ({
  AccountMenu: () => <div data-testid="account-menu-stub" />,
}));

function renderNavBar() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <MockAuthProvider>
        <NavBar />
      </MockAuthProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('NavBar', () => {
  it('shows "Word klant" and "Inloggen" when logged out, no account menu', () => {
    renderNavBar();
    expect(screen.getByTestId('nav-become-client')).toBeInTheDocument();
    expect(screen.getByTestId('nav-login')).toBeInTheDocument();
    expect(screen.queryByTestId('account-menu-stub')).not.toBeInTheDocument();
  });

  it('renders Collecties as a single direct link, no dropdown', () => {
    renderNavBar();
    expect(screen.getByTestId('nav-collections')).toHaveAttribute('href', '/collecties');
    expect(screen.queryByTestId('collections-dropdown')).not.toBeInTheDocument();
  });

  it('shows the account menu instead of "Word klant"/"Inloggen" after clicking login', () => {
    renderNavBar();
    fireEvent.click(screen.getByTestId('nav-login'));
    expect(screen.getByTestId('account-menu-stub')).toBeInTheDocument();
    expect(screen.queryByTestId('nav-become-client')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nav-login')).not.toBeInTheDocument();
  });

  it('points Contact and Word klant at the homepage contact anchor', () => {
    renderNavBar();
    expect(screen.getByTestId('nav-contact')).toHaveAttribute('href', '/nl/#contact');
    expect(screen.getByTestId('nav-become-client')).toHaveAttribute('href', '/nl/#contact');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- NavBar.test`
Expected: FAIL — the "renders Collecties as a single direct link" test fails because `collections-dropdown` still exists / the dropdown behavior is still present.

- [ ] **Step 3: Simplify `src/components/NavBar.tsx`**

```tsx
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useMockAuth } from '@/lib/useMockAuth';
import { BASE_PATH } from '@/lib/basePath';
import { LanguageSwitcher } from './LanguageSwitcher';
import { AccountMenu } from './AccountMenu';

export function NavBar() {
  const locale = useLocale();
  const t = useTranslations('nav');
  const { isLoggedIn, isHydrated, login } = useMockAuth();
  const contactHref = `${BASE_PATH}/${locale}/#contact`;

  return (
    <nav
      data-testid="navbar"
      className="fixed left-0 top-0 z-40 flex w-full flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-black/60 px-4 py-3 backdrop-blur-sm sm:px-8"
    >
      <div className="flex items-center gap-6 text-xs tracking-[0.15em] text-white/70">
        <Link href="/" data-testid="nav-home" className="hover:text-white">
          {t('home')}
        </Link>
        <Link href="/collecties" data-testid="nav-collections" className="hover:text-white">
          {t('collections')}
        </Link>
        <a href={contactHref} data-testid="nav-contact" className="hover:text-white">
          {t('contact')}
        </a>
      </div>

      <div className="flex items-center gap-3">
        {isHydrated && isLoggedIn ? (
          <AccountMenu />
        ) : (
          <>
            <a
              href={contactHref}
              data-testid="nav-become-client"
              className="hidden text-xs tracking-[0.15em] text-white/70 hover:text-white sm:inline"
            >
              {t('becomeClient')}
            </a>
            <button
              type="button"
              data-testid="nav-login"
              onClick={login}
              className="rounded-sm bg-silver px-4 py-2 text-xs tracking-[0.15em] text-ink"
            >
              {t('login')}
            </button>
          </>
        )}
        <LanguageSwitcher />
      </div>
    </nav>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- NavBar.test`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests green (this also confirms `tests/components/NavBarAccountMenuIntegration.test.tsx` still passes unaffected, since it never referenced the dropdown).

- [ ] **Step 6: Commit**

```bash
git add src/components/NavBar.tsx tests/components/NavBar.test.tsx
git commit -m "refactor: simplify NavBar Collecties item to a plain link, remove dropdown"
```

---

### Task 7: Static export build verification

**Files:**
- No new files. This task verifies the previous 6 tasks produce a working static export with no leftover references to the deleted segment pages.

- [ ] **Step 1: Run the production build**

Run: `npm run build`
Expected: build completes successfully. The route list should show `/[locale]/collecties` (4 pages, one per locale) and should NOT show any `/[locale]/collecties/[segment]` routes anymore (28 fewer routes than before this plan: the old 24 segment pages are gone, replaced by nothing new at the route level since `/collecties` already existed).

- [ ] **Step 2: Verify the segment routes are gone and the collections page still exists**

Run: `ls out/nl/collecties/index.html out/en/collecties/index.html out/de/collecties/index.html out/fr/collecties/index.html`
Expected: all 4 files exist.

Run: `ls out/nl/collecties/hotel/index.html 2>&1 || echo "gone as expected"`
Expected: `gone as expected` (or an equivalent "No such file" message) — confirms the old segment route was actually removed from the export, not just hidden.

- [ ] **Step 3: Verify actual page CONTENT**

Run: `grep -c "product-card\|data-testid=\"product-card\"" out/nl/collecties/index.html`
Expected: a non-zero count (the grid markup is present in the static HTML).

Run: `grep -o "Wellness\|Abstract\|Hotel" out/nl/collecties/index.html | sort -u`
Expected: all three strings found (confirms segment badge labels are present in the rendered output, not just in client-side JS).

- [ ] **Step 4: Run the full test suite one final time**

Run: `npm test`
Expected: PASS — all tests green.

- [ ] **Step 5: Manually verify in the browser**

Run: `npx serve out -l 4173` (or reuse whatever static server command was used for previous plans) and open `http://localhost:4173` in a browser.

Check:
- Clicking "Collecties" in the nav goes directly to `/collecties` with no dropdown appearing on hover.
- The `/collecties` page shows a filter row (Alle + 6 segments, each with a count) and a grid of images below it.
- Clicking a segment filter (e.g. "Wellness") immediately narrows the grid to just that segment's 6 images, with no page reload/navigation.
- Clicking "Alle" restores all 36 images.
- Each image shows a small segment-name badge.
- The "Word klant" button at the bottom of the page behaves as before (visible when logged out, hidden after clicking "Inloggen" in the nav).
- Switching languages (NL/EN/DE/FR) updates the filter button labels and image badges correctly.
- Visiting an old segment URL directly (e.g. `/nl/collecties/hotel/`) returns a 404 (confirms the old route is genuinely gone, not just unlinked).
- Mobile width (375px): filter buttons wrap cleanly, grid drops to 2 columns, no horizontal overflow.

- [ ] **Step 6: Commit**

No code changes expected in this task. If Steps 1–5 surfaced a fix, commit it with a message describing what was broken, then re-run Steps 1–5.
