# Collectiepagina filters + breadcrumb + Stijl/Onderwerp/AI-taxonomie Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 26-07-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the `/collecties` page a breadcrumb, a filter sidebar (Collectie, Kunstenaar, Formaat, Stijl, Onderwerp, AI-gegenereerd) with removable active-filter chips, and a navbar dropdown that deep-links into a pre-selected segment — backed by two new beheer-maintained taxonomy tables (Stijlen, Onderwerpen) that a kunstwerk can be tagged with many-to-many, including creating a brand-new Stijl/Onderwerp inline while editing a kunstwerk.

**Architecture:** Two new small, reusable presentational components (`Breadcrumb`, `FilterSection`); a restructuring of `ProductsGrid` from a top pill-row into a two-column shell (sidebar + content) that reuses the existing single-select segment logic and adds four new multi/boolean-select facets (`formaat`, `stijlIds`, `onderwerpIds`, `aiGegenereerd`); two new beheer CRUD sections (`StijlenSection`, `OnderwerpenSection`) cloned from the existing `SegmentenSection` pattern; an extension of `KunstwerkenSection`'s form with multi-select checkboxes plus an inline "add new" row for both; and a new `CollectiesDropdown` client component wired into `NavBar`. `Stijl`/`Onderwerp` are new Firestore collections shaped exactly like the existing `Segment` ({id, omschrijving}); `Kunstwerk` gains 3 new **optional** fields (`stijlIds?`, `onderwerpIds?`, `aiGegenereerd?`) so existing, already-saved kunstwerken keep working untouched.

**Tech Stack:** Next.js 14 (App Router), React 18, TypeScript, next-intl, Firebase client SDK (Firestore), Vitest + Testing Library.

## Global Constraints

- **Run this plan in an isolated git worktree** (`superpowers:using-git-worktrees`) before starting Task 1. `src/data/materiaalsoortenSeed.ts` is already modified, uncommitted, in this working directory by a concurrent session, and that session's plan (`docs/superpowers/plans/2026-07-26-materiaal-maat-defaults-akoestisch-paneel.md`) also touches `ProductsGrid.tsx`, `KunstwerkSpecCard.tsx` and all 4 `messages/*.json` files — files this plan touches too. Working in a worktree avoids clobbering that session's uncommitted work.
- Do **not** add a materiaalsoort or maat filter to the public collectiepagina. The concurrent plan above makes every kunstwerk default to "all materialen/maten available", which makes those two facets non-discriminating. `formaat`, `stijl`, `onderwerp` and `aiGegenereerd` are the facets in this plan.
- `Stijl` and `Onderwerp` are new Firestore collections, both shaped `{ id: string; omschrijving: string }` — structurally identical to `Segment` but kept as distinct types/collections/beheer sections, following this codebase's existing convention of one dedicated type + one dedicated beheer `*Section.tsx` per collection (no shared generic CRUD abstraction exists today — don't introduce one).
- `Kunstwerk.stijlIds`, `Kunstwerk.onderwerpIds` and `Kunstwerk.aiGegenereerd` are **optional** (`?`). Firestore documents already saved before this plan ships won't have them; every read site must default with `kunstwerk.stijlIds ?? []` / `kunstwerk.onderwerpIds ?? []` / `kunstwerk.aiGegenereerd ?? false` — never assume they exist. This mirrors the existing `formaat?: KunstwerkFormaat | null` convention. No backfill script is needed — unlike the concurrent materiaal/maat-defaults plan, there is no "everything must flip to true" requirement here; existing kunstwerken simply show as untagged until an admin edits them.
- The `beheer` translation namespace exists **only** in `messages/nl.json` — never add beheer keys to `en.json`/`de.json`/`fr.json`. The public-facing `collectionsPage` namespace exists in all 4 files and must stay in sync.
- Every new user-facing string goes in the relevant locale file(s) in the same task that introduces it — never "add later".
- `useFirestoreCollection<T>('collectionName').add(data)` returns `Promise<boolean>` (success/failure), **not** the new document's id — this contract is used by ~8 existing beheer sections and this plan does not change it. Task 7's inline "add new Stijl/Onderwerp" therefore cannot get the new id back directly from `.add()`; it reconciles by matching on `omschrijving` once the parent's refreshed `stijlen`/`onderwerpen` prop arrives (see Task 7 for the exact mechanism). Do not attempt to change `useFirestoreCollection`'s return type — that ripples through every `*Section.tsx` prop interface in the app for no benefit here.
- Keep every existing `data-testid` in `ProductsGrid.tsx` unchanged (`filter-all`, `filter-{segmentId}`, `kunstenaar-filter`, `kunstenaar-banner`, `products-grid`, `product-card`, `product-modal*`) so the existing tests in `tests/components/ProductsGrid.test.tsx` keep passing without modification unless a task explicitly says otherwise.
- Run tests with `npx vitest run <path>` (no watch mode). Task 4 has no runtime behavior to test (pure type additions) — verify it with `npx tsc --noEmit` instead.
- Out of scope for this plan (explicitly deferred, do not build): sort dropdown (no sortable field exists yet), kleur/sfeer facets (no taxonomy fields exist and weren't asked for), materiaalsoort/maat facets (see above), URL persistence of anything beyond the initial `?segment=` (Task 13).

## File Map

- `src/components/Breadcrumb.tsx` — **new**: generic breadcrumb (Task 1)
- `src/components/FilterSection.tsx` — **new**: collapsible sidebar section wrapper (Task 2)
- `src/components/ProductsGrid.tsx` — sidebar layout + breadcrumb (Task 3); Formaat facet (Task 8); Stijl facet (Task 9); Onderwerp facet (Task 10); AI-gegenereerd facet (Task 11); active-filter chips + clear-all for every facet (Task 12); `initialSegmentId` prop (Task 13)
- `src/app/[locale]/collecties/page.tsx` — read `searchParams.segment`, pass to `ProductsGrid` (Task 13)
- `src/components/CollectiesDropdown.tsx` — **new**: navbar hover-dropdown (Task 14)
- `src/components/NavBar.tsx` — use `CollectiesDropdown` instead of a plain link (Task 14)
- `src/components/beheer/materiaalTypes.ts` — `Stijl`, `Onderwerp` types; `Kunstwerk.stijlIds/onderwerpIds/aiGegenereerd` (Task 4)
- `src/lib/logActiviteit.ts`, `src/components/beheer/ActiviteitSection.tsx` — 6 new activiteit types + labels (Task 4)
- `src/components/beheer/StijlenSection.tsx` — **new**: CRUD table, cloned from `SegmentenSection.tsx` (Task 5)
- `src/components/beheer/OnderwerpenSection.tsx` — **new**: CRUD table, cloned from `SegmentenSection.tsx` (Task 6)
- `src/components/beheer/BeheerNav.tsx`, `src/components/beheer/BeheerShell.tsx` — wire the 2 new sections in (Tasks 5, 6)
- `src/components/beheer/KunstwerkenSection.tsx` — Stijl/Onderwerp multi-select + inline "add new" + AI-gegenereerd checkbox (Task 7)
- `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json` — new keys added per task (3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14)
- Tests: `tests/components/Breadcrumb.test.tsx`, `tests/components/FilterSection.test.tsx`, `tests/components/ProductsGrid.test.tsx`, `tests/components/beheer/materiaalTypes.test.ts` (unchanged, just re-run), `tests/components/beheer/ActiviteitSection.test.tsx`, `tests/components/beheer/StijlenSection.test.tsx` (new), `tests/components/beheer/OnderwerpenSection.test.tsx` (new), `tests/components/beheer/BeheerNav.test.tsx`, `tests/components/beheer/BeheerShell.test.tsx`, `tests/components/beheer/KunstwerkenSection.test.tsx`, `tests/components/CollectiesDropdown.test.tsx` (new), `tests/components/NavBar.test.tsx`

---

### Task 1: Breadcrumb component

**Files:**
- Create: `src/components/Breadcrumb.tsx`
- Test: `tests/components/Breadcrumb.test.tsx`

**Interfaces:**
- Consumes: `Link` from `@/i18n/navigation`
- Produces: `export interface BreadcrumbItem { label: string; href?: string }` and `export function Breadcrumb({ items }: { items: BreadcrumbItem[] })` — Task 3 renders `<Breadcrumb items={[...]} />` inside `ProductsGrid`. The last item in `items` always renders as plain (non-link) text with `aria-current="page"`, regardless of whether it has an `href`.

- [ ] **Step 1: Write the failing test**

Create `tests/components/Breadcrumb.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Breadcrumb } from '@/components/Breadcrumb';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('Breadcrumb', () => {
  it('renders every item separated by a visual separator', () => {
    render(
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Collecties', href: '/collecties' },
          { label: 'Hotel' },
        ]}
      />
    );
    expect(screen.getByTestId('breadcrumb-item-0')).toHaveTextContent('Home');
    expect(screen.getByTestId('breadcrumb-item-1')).toHaveTextContent('Collecties');
    expect(screen.getByTestId('breadcrumb-item-2')).toHaveTextContent('Hotel');
  });

  it('renders every item except the last as a link', () => {
    render(
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Collecties', href: '/collecties' },
          { label: 'Hotel' },
        ]}
      />
    );
    expect(screen.getByTestId('breadcrumb-item-0').tagName).toBe('A');
    expect(screen.getByTestId('breadcrumb-item-0')).toHaveAttribute('href', '/');
    expect(screen.getByTestId('breadcrumb-item-1').tagName).toBe('A');
    expect(screen.getByTestId('breadcrumb-item-2').tagName).not.toBe('A');
  });

  it('marks the last item with aria-current="page", even when it has an href', () => {
    render(
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Hotel', href: '/collecties?segment=hotel' },
        ]}
      />
    );
    expect(screen.getByTestId('breadcrumb-item-1')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('breadcrumb-item-1').tagName).not.toBe('A');
    expect(screen.getByTestId('breadcrumb-item-0')).not.toHaveAttribute('aria-current');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/Breadcrumb.test.tsx`
Expected: FAIL with "Cannot find module '@/components/Breadcrumb'"

- [ ] **Step 3: Write the implementation**

Create `src/components/Breadcrumb.tsx`:

```tsx
import { Link } from '@/i18n/navigation';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      data-testid="breadcrumb"
      className="mx-auto mb-6 flex max-w-5xl flex-wrap items-center gap-2 text-xs text-white/60"
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`} className="flex items-center gap-2">
            {index > 0 && (
              <span aria-hidden="true" className="text-white/30">
                /
              </span>
            )}
            {item.href && !isLast ? (
              <Link href={item.href} data-testid={`breadcrumb-item-${index}`} className="hover:text-gold">
                {item.label}
              </Link>
            ) : (
              <span
                data-testid={`breadcrumb-item-${index}`}
                aria-current={isLast ? 'page' : undefined}
                className={isLast ? 'text-white' : ''}
              >
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/Breadcrumb.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/Breadcrumb.tsx tests/components/Breadcrumb.test.tsx
git commit -m "feat: add reusable Breadcrumb component"
```

---

### Task 2: FilterSection component (collapsible sidebar wrapper)

**Files:**
- Create: `src/components/FilterSection.tsx`
- Test: `tests/components/FilterSection.test.tsx`

**Interfaces:**
- Consumes: nothing new
- Produces: `export function FilterSection({ title, testId, defaultOpen = true, children }: { title: string; testId: string; defaultOpen?: boolean; children: ReactNode })`. Task 3 wraps the existing Collectie list and the Kunstenaar combobox in it; Tasks 8–11 wrap Formaat/Stijl/Onderwerp/AI-gegenereerd in it.

- [ ] **Step 1: Write the failing test**

Create `tests/components/FilterSection.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterSection } from '@/components/FilterSection';

describe('FilterSection', () => {
  it('renders the title and children when open by default', () => {
    render(
      <FilterSection title="Formaat" testId="formaat">
        <p data-testid="formaat-content">inhoud</p>
      </FilterSection>
    );
    expect(screen.getByText('Formaat')).toBeInTheDocument();
    expect(screen.getByTestId('formaat-content')).toBeInTheDocument();
  });

  it('hides children and flips aria-expanded when the header is clicked', () => {
    render(
      <FilterSection title="Formaat" testId="formaat">
        <p data-testid="formaat-content">inhoud</p>
      </FilterSection>
    );
    const toggle = screen.getByTestId('filter-section-formaat-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('formaat-content')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByTestId('formaat-content')).toBeInTheDocument();
  });

  it('starts collapsed when defaultOpen is false', () => {
    render(
      <FilterSection title="Kunstenaar" testId="kunstenaar" defaultOpen={false}>
        <p data-testid="kunstenaar-content">inhoud</p>
      </FilterSection>
    );
    expect(screen.queryByTestId('kunstenaar-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('filter-section-kunstenaar-toggle')).toHaveAttribute('aria-expanded', 'false');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/FilterSection.test.tsx`
Expected: FAIL with "Cannot find module '@/components/FilterSection'"

- [ ] **Step 3: Write the implementation**

Create `src/components/FilterSection.tsx`:

```tsx
'use client';

import { useState, type ReactNode } from 'react';

interface FilterSectionProps {
  title: string;
  testId: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function FilterSection({ title, testId, defaultOpen = true, children }: FilterSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div data-testid={`filter-section-${testId}`} className="border-b border-white/10 py-4 first:pt-0 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        data-testid={`filter-section-${testId}-toggle`}
        className="flex w-full items-center justify-between text-left text-xs font-head uppercase tracking-[0.14em] text-white/80"
      >
        {title}
        <span
          aria-hidden="true"
          className={`text-[10px] text-white/40 transition-transform ${open ? '' : '-rotate-90'}`}
        >
          &#9662;
        </span>
      </button>
      {open && <div className="mt-3 flex flex-col gap-2">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/FilterSection.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/FilterSection.tsx tests/components/FilterSection.test.tsx
git commit -m "feat: add reusable FilterSection collapsible wrapper"
```

---

### Task 3: ProductsGrid sidebar layout + breadcrumb (no new filter dimensions yet)

**Files:**
- Modify: `src/components/ProductsGrid.tsx`
- Modify: `tests/components/ProductsGrid.test.tsx`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json`

**Interfaces:**
- Consumes: `Breadcrumb`/`BreadcrumbItem` from Task 1, `FilterSection` from Task 2
- Produces: `ProductsGrid` now renders a two-column layout (`<aside>` sidebar + content area) instead of a flat stack. All existing state (`activeFilter`, `kunstenaarFilter`, `selectedKunstwerk`) and all existing `data-testid`s are unchanged — only the JSX structure and the addition of `Breadcrumb` change. Later tasks (8–13) add to this same file.

- [ ] **Step 1: Add the new translation keys**

In `messages/nl.json`, inside `"collectionsPage"`, add two keys (after `"kunstenaarFilterNoResults"`):

```json
    "kunstenaarFilterNoResults": "Geen kunstenaars gevonden",
    "breadcrumbHome": "Home",
    "collectieFacetTitle": "Collectie",
    "kunstenaarFacetTitle": "Kunstenaar"
```

In `messages/en.json`, same location:

```json
    "kunstenaarFilterNoResults": "No artists found",
    "breadcrumbHome": "Home",
    "collectieFacetTitle": "Collection",
    "kunstenaarFacetTitle": "Artist"
```

In `messages/fr.json`, same location:

```json
    "kunstenaarFilterNoResults": "Aucun artiste trouvé",
    "breadcrumbHome": "Accueil",
    "collectieFacetTitle": "Collection",
    "kunstenaarFacetTitle": "Artiste"
```

In `messages/de.json`, same location:

```json
    "kunstenaarFilterNoResults": "Keine Künstler gefunden",
    "breadcrumbHome": "Home",
    "collectieFacetTitle": "Kollektion",
    "kunstenaarFacetTitle": "Künstler"
```

- [ ] **Step 2: Write the failing test**

In `tests/components/ProductsGrid.test.tsx`, add inside the `describe('ProductsGrid', ...)` block (after the existing `'shows all 3 kunstwerken...'` test):

```tsx
  it('shows a breadcrumb that ends on "Collecties" when no segment is selected, and on the segment name once one is', async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    expect(screen.getByTestId('breadcrumb-item-0')).toHaveTextContent('Home');
    expect(screen.getByTestId('breadcrumb-item-1')).toHaveTextContent('Collecties');
    expect(screen.getByTestId('breadcrumb-item-1')).toHaveAttribute('aria-current', 'page');

    fireEvent.click(screen.getByTestId('filter-seg-hotel'));
    expect(screen.getByTestId('breadcrumb-item-1')).toHaveTextContent('Collecties');
    expect(screen.getByTestId('breadcrumb-item-1')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('breadcrumb-item-2')).toHaveTextContent('Hotel');
    expect(screen.getByTestId('breadcrumb-item-2')).toHaveAttribute('aria-current', 'page');
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx`
Expected: FAIL — no element with `data-testid="breadcrumb-item-0"` (Breadcrumb not rendered yet)

- [ ] **Step 4: Restructure the component**

In `src/components/ProductsGrid.tsx`, add two imports (after the existing `Combobox` import):

```tsx
import { Breadcrumb } from './Breadcrumb';
import { FilterSection } from './FilterSection';
```

Replace the entire `return ( ... )` block (from `return (` through the closing `</>` before `);`) with:

```tsx
  const geselecteerdSegment =
    activeFilter === ALL_FILTER ? null : (segmenten.items ?? []).find((segment) => segment.id === activeFilter) ?? null;

  const breadcrumbItems = [
    { label: tCollections('breadcrumbHome'), href: '/' },
    geselecteerdSegment
      ? { label: tCollections('title'), href: '/collecties' }
      : { label: tCollections('title') },
    ...(geselecteerdSegment ? [{ label: geselecteerdSegment.omschrijving }] : []),
  ];

  return (
    <>
      <Breadcrumb items={breadcrumbItems} />

      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="flex flex-col">
          <FilterSection title={tCollections('collectieFacetTitle')} testId="collectie">
            <div className="flex flex-col gap-2">
              <button
                type="button"
                data-testid="filter-all"
                aria-pressed={activeFilter === ALL_FILTER}
                onClick={() => setActiveFilter(ALL_FILTER)}
                className={filterButtonClass(activeFilter === ALL_FILTER)}
              >
                {tCollections('filterAll')} ({allKunstwerken.length})
              </button>
              {segmenten.items.map((segment) => (
                <button
                  key={segment.id}
                  type="button"
                  data-testid={`filter-${segment.id}`}
                  aria-pressed={activeFilter === segment.id}
                  onClick={() => setActiveFilter(segment.id)}
                  className={filterButtonClass(activeFilter === segment.id)}
                >
                  {segment.omschrijving} (
                  {allKunstwerken.filter((kunstwerk) => kunstwerk.segmentIds.includes(segment.id)).length})
                </button>
              ))}
            </div>
          </FilterSection>

          <FilterSection title={tCollections('kunstenaarFacetTitle')} testId="kunstenaar">
            <Combobox
              options={(kunstenaars.items ?? []).map((kunstenaar) => ({ value: kunstenaar.id, label: kunstenaar.naam }))}
              value={kunstenaarFilter}
              onChange={setKunstenaarFilter}
              placeholder={tCollections('kunstenaarFilterPlaceholder')}
              noResultsLabel={tCollections('kunstenaarFilterNoResults')}
              clearLabel={tCollections('kunstenaarFilterClear')}
              testId="kunstenaar-filter"
            />
          </FilterSection>
        </aside>

        <div>
          {geselecteerdeKunstenaar && (
            <div
              data-testid="kunstenaar-banner"
              className="mb-8 flex items-center gap-4 rounded border border-white/10 p-4 text-left"
            >
              {geselecteerdeKunstenaar.foto && (
                <img
                  src={geselecteerdeKunstenaar.foto}
                  alt={geselecteerdeKunstenaar.naam}
                  className="h-20 w-20 rounded-full object-cover"
                />
              )}
              <div>
                <p className="font-head text-sm font-semibold text-white">{geselecteerdeKunstenaar.naam}</p>
                <p className="text-xs text-white/70">{resolveKunstenaarOmschrijving(geselecteerdeKunstenaar, locale)}</p>
              </div>
            </div>
          )}

          <div data-testid="products-grid" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visibleKunstwerken.map((kunstwerk) => {
              const omschrijving = resolveKunstwerkOmschrijving(kunstwerk, locale);
              const beschikbareMaterialen = (materialen.items ?? []).filter((materiaal) =>
                kunstwerk.materiaalIds.includes(materiaal.id)
              );
              const beschikbareMaten = (maten.items ?? []).filter((maat) => kunstwerk.maatIds.includes(maat.id));
              const collectieLabels = kunstwerk.segmentIds.map(
                (segmentId) => segmenten.items?.find((segment) => segment.id === segmentId)?.omschrijving ?? segmentId
              );
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
                  className="group relative cursor-pointer overflow-hidden rounded border border-white/10 transition hover:-translate-y-1"
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-br from-gold/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  />
                  <KunstwerkSpecCard
                    fotoSlot={
                      <WatermarkedImage src={kunstwerk.foto} alt={omschrijving} className="h-full w-full" fit="contain" />
                    }
                    code={kunstwerk.naam}
                    titel={omschrijving}
                    artiest={kunstwerk.kunstenaarId ? kunstenaarNaamById.get(kunstwerk.kunstenaarId) ?? '' : ''}
                    collectieLabels={collectieLabels}
                    materiaalLabels={beschikbareMaterialen.map((materiaal) =>
                      materiaalLabel(materiaal, materiaalsoortNaamById.get(materiaal.materiaalsoortId) ?? materiaal.materiaalsoortId)
                    )}
                    maatLabels={beschikbareMaten.map(maatLabel)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <ProductModal
        kunstwerk={selectedKunstwerk}
        materialen={materialen.items}
        maten={maten.items}
        materiaalsoorten={materiaalsoorten.items}
        kunstenaars={kunstenaars.items}
        onClose={() => setSelectedKunstwerk(null)}
      />
    </>
  );
}
```

Note what changed vs. the original: the top pill-row and the `max-w-xs` combobox wrapper are gone (moved into the sidebar `FilterSection`s); `products-grid` and `kunstenaar-banner` lost their own `mx-auto max-w-*` classes because the new outer grid already centers and constrains width; every existing `data-testid` is preserved verbatim.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx`
Expected: PASS (all previous tests + the new breadcrumb test)

- [ ] **Step 6: Commit**

```bash
git add src/components/ProductsGrid.tsx tests/components/ProductsGrid.test.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json
git commit -m "feat: restructure collectiepagina into sidebar + breadcrumb layout"
```

---

### Task 4: Data model — Stijl/Onderwerp types, Kunstwerk fields, activiteitenlog types

**Files:**
- Modify: `src/components/beheer/materiaalTypes.ts`
- Modify: `src/lib/logActiviteit.ts`
- Modify: `src/components/beheer/ActiviteitSection.tsx`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/ActiviteitSection.test.tsx`

**Interfaces:**
- Consumes: nothing new
- Produces: `export interface Stijl { id: string; omschrijving: string }`, `export interface Onderwerp { id: string; omschrijving: string }` in `materiaalTypes.ts`; `Kunstwerk.stijlIds?: string[]`, `Kunstwerk.onderwerpIds?: string[]`, `Kunstwerk.aiGegenereerd?: boolean`; 6 new `ActiviteitType` values (`stijl_toegevoegd`, `stijl_gewijzigd`, `stijl_verwijderd`, `onderwerp_toegevoegd`, `onderwerp_gewijzigd`, `onderwerp_verwijderd`) with matching `TYPE_LABEL_KEYS` entries. Tasks 5–11 consume these.

- [ ] **Step 1: Add the two new types and extend Kunstwerk**

In `src/components/beheer/materiaalTypes.ts`, add after the `Segment` interface:

```ts
export interface Segment {
  id: string;
  omschrijving: string;
}

export interface Stijl {
  id: string;
  omschrijving: string;
}

export interface Onderwerp {
  id: string;
  omschrijving: string;
}
```

Then extend `Kunstwerk` (add 3 fields after `maatIds: string[];`):

```ts
export interface Kunstwerk {
  id: string;
  foto: string;
  naam: string;
  kunstenaarId: string | null;
  formaat?: KunstwerkFormaat | null;
  segmentIds: string[];
  materiaalIds: string[];
  maatIds: string[];
  stijlIds?: string[];
  onderwerpIds?: string[];
  aiGegenereerd?: boolean;
  prijzen: PrijsRegel[];
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;
}
```

- [ ] **Step 2: Add the 6 new activiteitenlog types**

In `src/lib/logActiviteit.ts`, extend the `ActiviteitType` union (replace the last line, `| 'klant_minimale_afname_gewijzigd';`, with):

```ts
  | 'klant_minimale_afname_gewijzigd'
  | 'stijl_toegevoegd'
  | 'stijl_gewijzigd'
  | 'stijl_verwijderd'
  | 'onderwerp_toegevoegd'
  | 'onderwerp_gewijzigd'
  | 'onderwerp_verwijderd';
```

- [ ] **Step 3: Add the matching labels and translations**

In `src/components/beheer/ActiviteitSection.tsx`, add to `TYPE_LABEL_KEYS` (after the `klant_minimale_afname_gewijzigd` entry):

```ts
  klant_minimale_afname_gewijzigd: 'activiteitTypeKlantMinimaleAfnameGewijzigd',
  stijl_toegevoegd: 'activiteitTypeStijlToegevoegd',
  stijl_gewijzigd: 'activiteitTypeStijlGewijzigd',
  stijl_verwijderd: 'activiteitTypeStijlVerwijderd',
  onderwerp_toegevoegd: 'activiteitTypeOnderwerpToegevoegd',
  onderwerp_gewijzigd: 'activiteitTypeOnderwerpGewijzigd',
  onderwerp_verwijderd: 'activiteitTypeOnderwerpVerwijderd',
```

In `messages/nl.json`, inside `"beheer"`, add (near the other `activiteitType*` keys, e.g. after `"activiteitTypeKlantMinimaleAfnameGewijzigd"`):

```json
    "activiteitTypeStijlToegevoegd": "Stijl toegevoegd",
    "activiteitTypeStijlGewijzigd": "Stijl gewijzigd",
    "activiteitTypeStijlVerwijderd": "Stijl verwijderd",
    "activiteitTypeOnderwerpToegevoegd": "Onderwerp toegevoegd",
    "activiteitTypeOnderwerpGewijzigd": "Onderwerp gewijzigd",
    "activiteitTypeOnderwerpVerwijderd": "Onderwerp verwijderd"
```

- [ ] **Step 4: Write the failing test**

In `tests/components/beheer/ActiviteitSection.test.tsx`, add inside `describe('ActiviteitSection', ...)`:

```tsx
  it('shows Dutch labels for the new Stijl and Onderwerp activiteit types', () => {
    renderSection([
      { id: 'log-3', type: 'stijl_toegevoegd', actorEmail: 'paul@glassartanddesign.com', actorNaam: 'Paul', timestamp: null },
      { id: 'log-4', type: 'onderwerp_verwijderd', actorEmail: 'paul@glassartanddesign.com', actorNaam: 'Paul', timestamp: null },
    ]);
    expect(screen.getByTestId('data-table-row-log-3')).toHaveTextContent('Stijl toegevoegd');
    expect(screen.getByTestId('data-table-row-log-4')).toHaveTextContent('Onderwerp verwijderd');
  });
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx vitest run tests/components/beheer/ActiviteitSection.test.tsx`
Expected: FAIL — `TYPE_LABEL_KEYS[activiteit.type]` is `undefined`, so the row shows the raw type string instead of the Dutch label

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/components/beheer/ActiviteitSection.test.tsx`
Expected: PASS (all previous tests + the new one)

- [ ] **Step 7: Verify the type changes compile**

Run: `npx tsc --noEmit`
Expected: no new errors (the 3 `Kunstwerk` fields are optional, so no existing object literal typed as `Kunstwerk`/`Omit<Kunstwerk, 'id'>` needs updating)

- [ ] **Step 8: Commit**

```bash
git add src/components/beheer/materiaalTypes.ts src/lib/logActiviteit.ts src/components/beheer/ActiviteitSection.tsx messages/nl.json tests/components/beheer/ActiviteitSection.test.tsx
git commit -m "feat: add Stijl/Onderwerp types, Kunstwerk fields, and activiteitenlog types"
```

---

### Task 5: StijlenSection beheer CRUD

**Files:**
- Create: `src/components/beheer/StijlenSection.tsx` (cloned from `SegmentenSection.tsx`)
- Modify: `src/components/beheer/BeheerNav.tsx`
- Modify: `src/components/beheer/BeheerShell.tsx`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/StijlenSection.test.tsx` (new), `tests/components/beheer/BeheerNav.test.tsx`, `tests/components/beheer/BeheerShell.test.tsx`

**Interfaces:**
- Consumes: `Stijl` type from Task 4, `DataTable`/`Modal` (existing), `useAdminAuth`/`logActiviteit`/`actorFromMedewerker` (existing)
- Produces: `export function StijlenSection({ stijlen, loadError, onAdd, onUpdate, onRemove }: { stijlen: Stijl[] | null; loadError: string | null; onAdd: (data: Omit<Stijl, 'id'>) => Promise<boolean>; onUpdate: (id: string, data: Omit<Stijl, 'id'>) => Promise<boolean>; onRemove: (id: string) => Promise<boolean> })`. Task 7 also needs `beheerShell`'s `stijlen.items` and `stijlen.add` passed down to `KunstwerkenSection` — this task is where those are first read via `useFirestoreCollection<Stijl>('stijlen')`.

- [ ] **Step 1: Add the new translation keys**

In `messages/nl.json`, inside `"beheer"`, add (after `"navSegmenten"` and its `segmenten*` block, i.e. right before `"navKunstwerken"`):

```json
    "navStijlen": "Stijlen",
    "stijlenLoadError": "Kon de stijlen niet laden. Probeer de pagina te verversen.",
    "stijlenActionError": "Er is iets misgegaan. Probeer het opnieuw.",
    "stijlenEmpty": "Geen stijlen gevonden.",
    "stijlenColOmschrijving": "Omschrijving",
    "stijlenLabelOmschrijving": "Omschrijving",
    "stijlenToevoegen": "Stijl toevoegen",
    "stijlenOpslaan": "Opslaan",
    "stijlenVerwijderen": "Verwijderen",
```

- [ ] **Step 2: Write the failing test**

Create `tests/components/beheer/StijlenSection.test.tsx` (this is `tests/components/beheer/SegmentenSection.test.tsx` with every `Segment`/`segment`/`Segmenten`/`segmenten` renamed to `Stijl`/`stijl`/`Stijlen`/`stijlen`):

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { StijlenSection } from '@/components/beheer/StijlenSection';
import type { Stijl } from '@/components/beheer/materiaalTypes';
import messages from '../../../messages/nl.json';

const logActiviteitMock = vi.fn();

vi.mock('@/lib/useAdminAuth', () => ({
  useAdminAuth: () => ({ user: { uid: 'staff-1', email: 'paul@glassartanddesign.com' } }),
}));

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: (...args: unknown[]) => logActiviteitMock(...args),
  actorFromMedewerker: (user: { uid: string; email: string | null } | null) =>
    user
      ? { id: user.uid, email: user.email ?? 'Onbekend', naam: user.email ?? 'Onbekend' }
      : { id: null, email: 'Onbekend', naam: 'Onbekend' },
}));

beforeEach(() => {
  logActiviteitMock.mockReset();
});

const STIJLEN: Stijl[] = [
  { id: 'stijl-1', omschrijving: 'Abstract' },
  { id: 'stijl-2', omschrijving: 'Minimalistisch' },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof StijlenSection>> = {}) {
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <StijlenSection
        stijlen={STIJLEN}
        loadError={null}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onRemove={onRemove}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  return { onAdd, onUpdate, onRemove };
}

describe('StijlenSection', () => {
  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('stijlen-error')).toHaveTextContent('Kon niet laden.');
  });

  it('renders nothing while stijlen is null and there is no error', () => {
    renderSection({ stijlen: null });
    expect(screen.queryByTestId('stijlen-section')).not.toBeInTheDocument();
  });

  it('lists the stijlen in the table', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-stijl-1')).toHaveTextContent('Abstract');
    expect(screen.getByTestId('data-table-row-stijl-2')).toHaveTextContent('Minimalistisch');
  });

  it('adds a new stijl and closes the modal', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('stijlen-add'));
    fireEvent.change(screen.getByTestId('stijl-modal-omschrijving'), { target: { value: 'Impressionistisch' } });
    fireEvent.click(screen.getByTestId('stijl-modal-opslaan'));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ omschrijving: 'Impressionistisch' }));
    await waitFor(() => expect(screen.queryByTestId('stijl-modal')).not.toBeInTheDocument());
  });

  it('opens a row for editing pre-filled, updates it, and deletes it', async () => {
    const { onUpdate, onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-stijl-2'));
    expect(screen.getByTestId('stijl-modal-omschrijving')).toHaveValue('Minimalistisch');
    fireEvent.change(screen.getByTestId('stijl-modal-omschrijving'), { target: { value: 'Minimalisme' } });
    fireEvent.click(screen.getByTestId('stijl-modal-opslaan'));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('stijl-2', { omschrijving: 'Minimalisme' }));

    fireEvent.click(screen.getByTestId('data-table-row-stijl-1'));
    fireEvent.click(screen.getByTestId('stijl-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('stijl-1'));
  });

  it('logs stijl_toegevoegd/gewijzigd/verwijderd with the logged-in medewerker', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('stijlen-add'));
    fireEvent.change(screen.getByTestId('stijl-modal-omschrijving'), { target: { value: 'Impressionistisch' } });
    fireEvent.click(screen.getByTestId('stijl-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('stijl_toegevoegd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/components/beheer/StijlenSection.test.tsx`
Expected: FAIL with "Cannot find module '@/components/beheer/StijlenSection'"

- [ ] **Step 4: Create the implementation**

Create `src/components/beheer/StijlenSection.tsx` (identical structure to `SegmentenSection.tsx`, renamed):

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Stijl } from './materiaalTypes';

interface StijlenSectionProps {
  stijlen: Stijl[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Stijl, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Stijl, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

type ModalState = { mode: 'add' } | { mode: 'edit'; stijl: Stijl } | null;

export function StijlenSection({ stijlen, loadError, onAdd, onUpdate, onRemove }: StijlenSectionProps) {
  const t = useTranslations('beheer');
  const [modalState, setModalState] = useState<ModalState>(null);
  const [omschrijving, setOmschrijving] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const { user } = useAdminAuth();

  if (loadError) {
    return (
      <p data-testid="stijlen-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (stijlen === null) {
    return null;
  }

  function openAdd() {
    setOmschrijving('');
    setActionError(null);
    setModalState({ mode: 'add' });
  }

  function openEdit(stijl: Stijl) {
    setOmschrijving(stijl.omschrijving);
    setActionError(null);
    setModalState({ mode: 'edit', stijl });
  }

  function closeModal() {
    setModalState(null);
  }

  async function handleSave() {
    if (!modalState) return;
    const success =
      modalState.mode === 'add' ? await onAdd({ omschrijving }) : await onUpdate(modalState.stijl.id, { omschrijving });
    if (success) {
      void logActiviteit(modalState.mode === 'add' ? 'stijl_toegevoegd' : 'stijl_gewijzigd', actorFromMedewerker(user));
      closeModal();
    } else {
      setActionError(t('stijlenActionError'));
    }
  }

  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const success = await onRemove(modalState.stijl.id);
    if (success) {
      void logActiviteit('stijl_verwijderd', actorFromMedewerker(user));
      closeModal();
    } else {
      setActionError(t('stijlenActionError'));
    }
  }

  const columns: Column<Stijl>[] = [{ key: 'omschrijving', label: t('stijlenColOmschrijving') }];

  return (
    <div data-testid="stijlen-section">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={openAdd}
          data-testid="stijlen-add"
          className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
        >
          {t('stijlenToevoegen')}
        </button>
      </div>
      <DataTable<Stijl>
        columns={columns}
        rows={stijlen}
        getRowId={(row) => row.id}
        onRowClick={openEdit}
        emptyLabel={t('stijlenEmpty')}
        searchPlaceholder={t('dataTableSearchPlaceholder')}
      />
      <Modal isOpen={modalState !== null} onClose={closeModal} closeLabel={t('modalClose')}>
        <div data-testid="stijl-modal" className="flex flex-col gap-2 text-sm text-white/80">
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('stijlenLabelOmschrijving')}
            <input
              type="text"
              value={omschrijving}
              onChange={(event) => setOmschrijving(event.target.value)}
              data-testid="stijl-modal-omschrijving"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>

          {actionError && (
            <p data-testid="stijl-modal-error" className="text-xs text-red-400">
              {actionError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!omschrijving}
              data-testid="stijl-modal-opslaan"
              className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('stijlenOpslaan')}
            </button>
            {modalState?.mode === 'edit' && (
              <button
                type="button"
                onClick={handleRemove}
                data-testid="stijl-modal-verwijderen"
                className="rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('stijlenVerwijderen')}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/components/beheer/StijlenSection.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 6: Wire "stijlen" into BeheerNav**

In `src/components/beheer/BeheerNav.tsx`:

Add `'stijlen'` to the `BeheerSection` union (after `'segmenten'`):

```ts
export type BeheerSection =
  | 'klanten'
  | 'bestellingen'
  | 'materiaalsoorten'
  | 'materialen'
  | 'maten'
  | 'segmenten'
  | 'stijlen'
  | 'onderwerpen'
  | 'kunstwerken'
  | 'kunstenaars'
  | 'prijsgroepen'
  | 'drukkers'
  | 'activiteit'
  | 'glassartDesign'
  | 'instellingen';
```

(`'onderwerpen'` is added here too so Task 6 doesn't need to touch this union again.)

Add `stijlenCount: number;` and `onderwerpenCount: number;` to `BeheerNavProps` (after `segmentenCount: number;`).

Add both to `ACTIVE_ITEMS` (after the `segmenten` entry):

```ts
  { id: 'segmenten', labelKey: 'navSegmenten' },
  { id: 'stijlen', labelKey: 'navStijlen' },
  { id: 'onderwerpen', labelKey: 'navOnderwerpen' },
  { id: 'kunstwerken', labelKey: 'navKunstwerken' },
```

Add both to the function signature and the `counts` record (after `segmentenCount`):

```ts
  segmentenCount,
  stijlenCount,
  onderwerpenCount,
  kunstwerkenCount,
```

```ts
    segmenten: segmentenCount,
    stijlen: stijlenCount,
    onderwerpen: onderwerpenCount,
    kunstwerken: kunstwerkenCount,
```

- [ ] **Step 7: Update BeheerNav's test**

In `tests/components/beheer/BeheerNav.test.tsx`, add `stijlenCount: 5, onderwerpenCount: 4,` to `defaultCounts` and the corresponding props in `renderNav`'s `<BeheerNav ... />` call, and add to the first `it`:

```tsx
    expect(screen.getByTestId('beheer-nav-stijlen')).toHaveTextContent('Stijlen');
    expect(screen.getByTestId('beheer-nav-stijlen')).toHaveTextContent('5');
    expect(screen.getByTestId('beheer-nav-onderwerpen')).toHaveTextContent('Onderwerpen');
    expect(screen.getByTestId('beheer-nav-onderwerpen')).toHaveTextContent('4');
```

- [ ] **Step 8: Wire "stijlen" into BeheerShell**

In `src/components/beheer/BeheerShell.tsx`, add the import (after the `SegmentenSection` import):

```tsx
import { StijlenSection } from './StijlenSection';
```

Add `Stijl` to the existing type import:

```tsx
import type { Materiaalsoort, Materiaal, Maat, Segment, Stijl, Kunstwerk, Prijsgroep, Drukker } from './materiaalTypes';
```

Add the hook (after `const segmenten = useFirestoreCollection<Segment>('segmenten', { seed: SEGMENTEN_SEED });`):

```tsx
  const stijlen = useFirestoreCollection<Stijl>('stijlen');
```

Add the count (after `const segmentenCount = ...`):

```tsx
  const stijlenCount = (stijlen.items ?? []).length;
```

Pass it to `<BeheerNav>` (after `segmentenCount={segmentenCount}`):

```tsx
          stijlenCount={stijlenCount}
```

Add the render branch (after the `segmenten` branch, before `kunstwerken`):

```tsx
        ) : activeSection === 'stijlen' ? (
          <StijlenSection
            stijlen={stijlen.items}
            loadError={stijlen.error === 'load' ? t('stijlenLoadError') : null}
            onAdd={stijlen.add}
            onUpdate={stijlen.update}
            onRemove={stijlen.remove}
          />
```

- [ ] **Step 9: Run the full beheer test suite**

Run: `npx vitest run tests/components/beheer`
Expected: PASS — `BeheerNav.test.tsx` and `BeheerShell.test.tsx` pass with the new `stijlenCount` prop wired through (unlisted `stijlen` collection in `BeheerShell.test.tsx`'s Firestore mock defaults to empty, same as every other untouched collection there)

- [ ] **Step 10: Commit**

```bash
git add src/components/beheer/StijlenSection.tsx src/components/beheer/BeheerNav.tsx src/components/beheer/BeheerShell.tsx messages/nl.json tests/components/beheer/StijlenSection.test.tsx tests/components/beheer/BeheerNav.test.tsx
git commit -m "feat: add Stijlen beheer CRUD section"
```

---

### Task 6: OnderwerpenSection beheer CRUD

**Files:**
- Create: `src/components/beheer/OnderwerpenSection.tsx` (cloned from `StijlenSection.tsx`)
- Modify: `src/components/beheer/BeheerShell.tsx`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/OnderwerpenSection.test.tsx` (new)

**Interfaces:**
- Consumes: `Onderwerp` type from Task 4. `BeheerNav`'s `'onderwerpen'` section id, `onderwerpenCount` prop and `ACTIVE_ITEMS` entry were already added in Task 5, step 6 — this task only wires `BeheerShell`.
- Produces: `export function OnderwerpenSection(...)`, identical shape to `StijlenSection` but for `Onderwerp`.

- [ ] **Step 1: Add the new translation keys**

In `messages/nl.json`, inside `"beheer"`, add (right after the `stijlen*` block from Task 5):

```json
    "navOnderwerpen": "Onderwerpen",
    "onderwerpenLoadError": "Kon de onderwerpen niet laden. Probeer de pagina te verversen.",
    "onderwerpenActionError": "Er is iets misgegaan. Probeer het opnieuw.",
    "onderwerpenEmpty": "Geen onderwerpen gevonden.",
    "onderwerpenColOmschrijving": "Omschrijving",
    "onderwerpenLabelOmschrijving": "Omschrijving",
    "onderwerpenToevoegen": "Onderwerp toevoegen",
    "onderwerpenOpslaan": "Opslaan",
    "onderwerpenVerwijderen": "Verwijderen",
```

(Note: `"navOnderwerpen"` was already referenced by `BeheerNav`'s `ACTIVE_ITEMS` in Task 5 — this is where the label text is actually defined.)

- [ ] **Step 2: Write the failing test**

Create `tests/components/beheer/OnderwerpenSection.test.tsx` — identical to `tests/components/beheer/StijlenSection.test.tsx` with `Stijl`→`Onderwerp`, `stijl`→`onderwerp` (including the `stijl_*` activiteit types → `onderwerp_*`):

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { OnderwerpenSection } from '@/components/beheer/OnderwerpenSection';
import type { Onderwerp } from '@/components/beheer/materiaalTypes';
import messages from '../../../messages/nl.json';

const logActiviteitMock = vi.fn();

vi.mock('@/lib/useAdminAuth', () => ({
  useAdminAuth: () => ({ user: { uid: 'staff-1', email: 'paul@glassartanddesign.com' } }),
}));

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: (...args: unknown[]) => logActiviteitMock(...args),
  actorFromMedewerker: (user: { uid: string; email: string | null } | null) =>
    user
      ? { id: user.uid, email: user.email ?? 'Onbekend', naam: user.email ?? 'Onbekend' }
      : { id: null, email: 'Onbekend', naam: 'Onbekend' },
}));

beforeEach(() => {
  logActiviteitMock.mockReset();
});

const ONDERWERPEN: Onderwerp[] = [
  { id: 'onderwerp-1', omschrijving: 'Bloemen' },
  { id: 'onderwerp-2', omschrijving: 'Landschappen' },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof OnderwerpenSection>> = {}) {
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <OnderwerpenSection
        onderwerpen={ONDERWERPEN}
        loadError={null}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onRemove={onRemove}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  return { onAdd, onUpdate, onRemove };
}

describe('OnderwerpenSection', () => {
  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('onderwerpen-error')).toHaveTextContent('Kon niet laden.');
  });

  it('renders nothing while onderwerpen is null and there is no error', () => {
    renderSection({ onderwerpen: null });
    expect(screen.queryByTestId('onderwerpen-section')).not.toBeInTheDocument();
  });

  it('lists the onderwerpen in the table', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-onderwerp-1')).toHaveTextContent('Bloemen');
    expect(screen.getByTestId('data-table-row-onderwerp-2')).toHaveTextContent('Landschappen');
  });

  it('adds a new onderwerp and closes the modal', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('onderwerpen-add'));
    fireEvent.change(screen.getByTestId('onderwerp-modal-omschrijving'), { target: { value: 'Dieren' } });
    fireEvent.click(screen.getByTestId('onderwerp-modal-opslaan'));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ omschrijving: 'Dieren' }));
    await waitFor(() => expect(screen.queryByTestId('onderwerp-modal')).not.toBeInTheDocument());
  });

  it('opens a row for editing pre-filled, updates it, and deletes it', async () => {
    const { onUpdate, onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-onderwerp-2'));
    expect(screen.getByTestId('onderwerp-modal-omschrijving')).toHaveValue('Landschappen');
    fireEvent.change(screen.getByTestId('onderwerp-modal-omschrijving'), { target: { value: 'Landschap' } });
    fireEvent.click(screen.getByTestId('onderwerp-modal-opslaan'));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('onderwerp-2', { omschrijving: 'Landschap' }));

    fireEvent.click(screen.getByTestId('data-table-row-onderwerp-1'));
    fireEvent.click(screen.getByTestId('onderwerp-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('onderwerp-1'));
  });

  it('logs onderwerp_toegevoegd with the logged-in medewerker', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('onderwerpen-add'));
    fireEvent.change(screen.getByTestId('onderwerp-modal-omschrijving'), { target: { value: 'Dieren' } });
    fireEvent.click(screen.getByTestId('onderwerp-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('onderwerp_toegevoegd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/components/beheer/OnderwerpenSection.test.tsx`
Expected: FAIL with "Cannot find module '@/components/beheer/OnderwerpenSection'"

- [ ] **Step 4: Create the implementation**

Create `src/components/beheer/OnderwerpenSection.tsx` — identical to `src/components/beheer/StijlenSection.tsx` from Task 5, with every `Stijl`/`stijl`/`Stijlen`/`stijlen` renamed to `Onderwerp`/`onderwerp`/`Onderwerpen`/`onderwerpen`:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Onderwerp } from './materiaalTypes';

interface OnderwerpenSectionProps {
  onderwerpen: Onderwerp[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Onderwerp, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Onderwerp, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

type ModalState = { mode: 'add' } | { mode: 'edit'; onderwerp: Onderwerp } | null;

export function OnderwerpenSection({ onderwerpen, loadError, onAdd, onUpdate, onRemove }: OnderwerpenSectionProps) {
  const t = useTranslations('beheer');
  const [modalState, setModalState] = useState<ModalState>(null);
  const [omschrijving, setOmschrijving] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const { user } = useAdminAuth();

  if (loadError) {
    return (
      <p data-testid="onderwerpen-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (onderwerpen === null) {
    return null;
  }

  function openAdd() {
    setOmschrijving('');
    setActionError(null);
    setModalState({ mode: 'add' });
  }

  function openEdit(onderwerp: Onderwerp) {
    setOmschrijving(onderwerp.omschrijving);
    setActionError(null);
    setModalState({ mode: 'edit', onderwerp });
  }

  function closeModal() {
    setModalState(null);
  }

  async function handleSave() {
    if (!modalState) return;
    const success =
      modalState.mode === 'add'
        ? await onAdd({ omschrijving })
        : await onUpdate(modalState.onderwerp.id, { omschrijving });
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'onderwerp_toegevoegd' : 'onderwerp_gewijzigd',
        actorFromMedewerker(user)
      );
      closeModal();
    } else {
      setActionError(t('onderwerpenActionError'));
    }
  }

  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const success = await onRemove(modalState.onderwerp.id);
    if (success) {
      void logActiviteit('onderwerp_verwijderd', actorFromMedewerker(user));
      closeModal();
    } else {
      setActionError(t('onderwerpenActionError'));
    }
  }

  const columns: Column<Onderwerp>[] = [{ key: 'omschrijving', label: t('onderwerpenColOmschrijving') }];

  return (
    <div data-testid="onderwerpen-section">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={openAdd}
          data-testid="onderwerpen-add"
          className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
        >
          {t('onderwerpenToevoegen')}
        </button>
      </div>
      <DataTable<Onderwerp>
        columns={columns}
        rows={onderwerpen}
        getRowId={(row) => row.id}
        onRowClick={openEdit}
        emptyLabel={t('onderwerpenEmpty')}
        searchPlaceholder={t('dataTableSearchPlaceholder')}
      />
      <Modal isOpen={modalState !== null} onClose={closeModal} closeLabel={t('modalClose')}>
        <div data-testid="onderwerp-modal" className="flex flex-col gap-2 text-sm text-white/80">
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('onderwerpenLabelOmschrijving')}
            <input
              type="text"
              value={omschrijving}
              onChange={(event) => setOmschrijving(event.target.value)}
              data-testid="onderwerp-modal-omschrijving"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>

          {actionError && (
            <p data-testid="onderwerp-modal-error" className="text-xs text-red-400">
              {actionError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!omschrijving}
              data-testid="onderwerp-modal-opslaan"
              className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('onderwerpenOpslaan')}
            </button>
            {modalState?.mode === 'edit' && (
              <button
                type="button"
                onClick={handleRemove}
                data-testid="onderwerp-modal-verwijderen"
                className="rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('onderwerpenVerwijderen')}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/components/beheer/OnderwerpenSection.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 6: Wire "onderwerpen" into BeheerShell**

In `src/components/beheer/BeheerShell.tsx`, add the import:

```tsx
import { OnderwerpenSection } from './OnderwerpenSection';
```

Add `Onderwerp` to the type import (extending the line from Task 5):

```tsx
import type { Materiaalsoort, Materiaal, Maat, Segment, Stijl, Onderwerp, Kunstwerk, Prijsgroep, Drukker } from './materiaalTypes';
```

Add the hook (right after the `stijlen` hook from Task 5):

```tsx
  const onderwerpen = useFirestoreCollection<Onderwerp>('onderwerpen');
```

Add the count (after `stijlenCount`):

```tsx
  const onderwerpenCount = (onderwerpen.items ?? []).length;
```

Pass it to `<BeheerNav>` (after `stijlenCount={stijlenCount}`):

```tsx
          onderwerpenCount={onderwerpenCount}
```

Add the render branch (right after the `stijlen` branch, before `kunstwerken`):

```tsx
        ) : activeSection === 'onderwerpen' ? (
          <OnderwerpenSection
            onderwerpen={onderwerpen.items}
            loadError={onderwerpen.error === 'load' ? t('onderwerpenLoadError') : null}
            onAdd={onderwerpen.add}
            onUpdate={onderwerpen.update}
            onRemove={onderwerpen.remove}
          />
```

- [ ] **Step 7: Run the full beheer test suite**

Run: `npx vitest run tests/components/beheer`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/beheer/OnderwerpenSection.tsx src/components/beheer/BeheerShell.tsx messages/nl.json tests/components/beheer/OnderwerpenSection.test.tsx
git commit -m "feat: add Onderwerpen beheer CRUD section"
```

---

### Task 7: KunstwerkenSection — Stijl/Onderwerp multi-select with inline "add new", and AI-gegenereerd checkbox

**Files:**
- Modify: `src/components/beheer/KunstwerkenSection.tsx`
- Modify: `src/components/beheer/BeheerShell.tsx`
- Modify: `messages/nl.json`
- Modify: `tests/components/beheer/KunstwerkenSection.test.tsx`

**Interfaces:**
- Consumes: `Stijl`/`Onderwerp` types (Task 4), `stijlen.items`/`stijlen.add` and `onderwerpen.items`/`onderwerpen.add` from `BeheerShell` (Tasks 5–6)
- Produces: `KunstwerkenSectionProps` gains `stijlen: Stijl[] | null`, `onderwerpen: Onderwerp[] | null`, `onAddStijl: (data: Omit<Stijl, 'id'>) => Promise<boolean>`, `onAddOnderwerp: (data: Omit<Onderwerp, 'id'>) => Promise<boolean>`. Saved `Kunstwerk`s now carry `stijlIds`, `onderwerpIds`, `aiGegenereerd`. Tasks 9–11 read these 3 fields from `Kunstwerk` on the public collectiepagina.

**Why "add inline" can't just call `onAddStijl` and grab an id:** `useFirestoreCollection.add()` returns `Promise<boolean>`, not the new document's id (see Global Constraints). The mechanism here is: remember the just-typed name in `pendingNieuweStijlNaam`; once `onAddStijl` resolves `true`, `BeheerShell`'s own `stijlen` state has already been refetched (that happens *inside* `add()` before it resolves) and re-renders `KunstwerkenSection` with a fresh `stijlen` prop; a `useEffect` watching that prop finds the entry whose `omschrijving` matches the pending name and adds its id to `stijlIds`.

- [ ] **Step 1: Add the new translation keys**

In `messages/nl.json`, inside `"beheer"`, add (after `"kunstwerkenLabelMaten"`):

```json
    "kunstwerkenLabelMaten": "Maten",
    "kunstwerkenLabelStijlen": "Stijlen",
    "kunstwerkenNieuweStijlPlaceholder": "Nieuwe stijl…",
    "kunstwerkenNieuweStijlToevoegen": "Toevoegen",
    "kunstwerkenNieuweStijlError": "Kon de stijl niet toevoegen. Probeer het opnieuw.",
    "kunstwerkenLabelOnderwerpen": "Onderwerpen",
    "kunstwerkenNieuweOnderwerpPlaceholder": "Nieuw onderwerp…",
    "kunstwerkenNieuweOnderwerpToevoegen": "Toevoegen",
    "kunstwerkenNieuweOnderwerpError": "Kon het onderwerp niet toevoegen. Probeer het opnieuw.",
    "kunstwerkenLabelAiGegenereerd": "AI-gegenereerd",
```

- [ ] **Step 2: Extend the test fixtures and write the failing tests**

In `tests/components/beheer/KunstwerkenSection.test.tsx`, extend the type import:

```tsx
import type { Kunstwerk, Segment, Materiaal, Maat, Stijl, Onderwerp } from '@/components/beheer/materiaalTypes';
```

Add fixtures (after `const MATEN`):

```tsx
const STIJLEN: Stijl[] = [
  { id: 'stijl-1', omschrijving: 'Abstract' },
  { id: 'stijl-2', omschrijving: 'Minimalistisch' },
];
const ONDERWERPEN: Onderwerp[] = [
  { id: 'onderwerp-1', omschrijving: 'Bloemen' },
  { id: 'onderwerp-2', omschrijving: 'Landschappen' },
];
```

Update `renderSection` to pass them (and default `onAddStijl`/`onAddOnderwerp` mocks):

```tsx
function renderSection(overrides: Partial<React.ComponentProps<typeof KunstwerkenSection>> = {}) {
  const onAdd = overrides.onAdd ?? vi.fn().mockResolvedValue(true);
  const onUpdate = overrides.onUpdate ?? vi.fn().mockResolvedValue(true);
  const onRemove = overrides.onRemove ?? vi.fn().mockResolvedValue(true);
  const onAddStijl = overrides.onAddStijl ?? vi.fn().mockResolvedValue(true);
  const onAddOnderwerp = overrides.onAddOnderwerp ?? vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
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
    </NextIntlClientProvider>
  );
  return { onAdd, onUpdate, onRemove, onAddStijl, onAddOnderwerp };
}
```

Add inside `describe('KunstwerkenSection', ...)`:

```tsx
  it('toggles an existing stijl/onderwerp checkbox and an AI-gegenereerd checkbox into the saved payload', async () => {
    uploadMock.mockResolvedValue('https://storage.example.com/nieuw.jpg');
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-foto-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-foto-preview')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('kunstwerk-modal-naam'), { target: { value: 'Test' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-staand'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-segment-seg-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-maat-maat-1'));
    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Test omschrijving' } });

    fireEvent.click(screen.getByTestId('kunstwerk-modal-stijl-stijl-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-onderwerp-onderwerp-2'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-ai-gegenereerd'));

    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          stijlIds: ['stijl-1'],
          onderwerpIds: ['onderwerp-2'],
          aiGegenereerd: true,
        })
      )
    );
  });

  it('creates a brand-new stijl inline, adds it to the Stijlen table, and auto-selects it on the kunstwerk', async () => {
    const onAddStijl = vi.fn().mockResolvedValue(true);
    const { rerender } = renderSection({ onAddStijl });
    fireEvent.click(screen.getByTestId('kunstwerken-add'));

    fireEvent.change(screen.getByTestId('kunstwerk-modal-nieuwe-stijl-naam'), { target: { value: 'Jugendstil' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-nieuwe-stijl-toevoegen'));
    await waitFor(() => expect(onAddStijl).toHaveBeenCalledWith({ omschrijving: 'Jugendstil' }));

    // Simulate BeheerShell re-rendering this component with the freshly-refetched stijlen list,
    // the way it really would once useFirestoreCollection('stijlen').add() resolves.
    rerender(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <KunstwerkenSection
          kunstwerken={KUNSTWERKEN}
          segmenten={SEGMENTEN}
          materialen={MATERIALEN}
          maten={MATEN}
          stijlen={[...STIJLEN, { id: 'stijl-3', omschrijving: 'Jugendstil' }]}
          onderwerpen={ONDERWERPEN}
          kunstenaars={KUNSTENAARS}
          loadError={null}
          onAdd={vi.fn().mockResolvedValue(true)}
          onUpdate={vi.fn().mockResolvedValue(true)}
          onRemove={vi.fn().mockResolvedValue(true)}
          onAddStijl={onAddStijl}
          onAddOnderwerp={vi.fn().mockResolvedValue(true)}
        />
      </NextIntlClientProvider>
    );

    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-stijl-stijl-3')).toBeChecked());
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: FAIL — `KunstwerkenSection` doesn't accept `stijlen`/`onderwerpen`/`onAddStijl`/`onAddOnderwerp` props yet, and none of the new test-ids exist

- [ ] **Step 4: Extend the component's props, state and payload**

In `src/components/beheer/KunstwerkenSection.tsx`, extend the type import:

```tsx
import type { Kunstwerk, Segment, Materiaal, Materiaalsoort, Maat, PrijsRegel, KunstwerkFormaat, Stijl, Onderwerp } from './materiaalTypes';
```

Extend `KunstwerkenSectionProps`:

```tsx
interface KunstwerkenSectionProps {
  kunstwerken: Kunstwerk[] | null;
  segmenten: Segment[] | null;
  materialen: Materiaal[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  maten: Maat[] | null;
  stijlen: Stijl[] | null;
  onderwerpen: Onderwerp[] | null;
  kunstenaars: Kunstenaar[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Kunstwerk, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Kunstwerk, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
  onAddStijl: (data: Omit<Stijl, 'id'>) => Promise<boolean>;
  onAddOnderwerp: (data: Omit<Onderwerp, 'id'>) => Promise<boolean>;
}
```

Extend `LEGE_FORM`:

```ts
const LEGE_FORM = {
  foto: '',
  naam: '',
  kunstenaarId: '' as string,
  formaat: null as KunstwerkFormaat | null,
  segmentIds: [] as string[],
  materiaalIds: [] as string[],
  maatIds: [] as string[],
  stijlIds: [] as string[],
  onderwerpIds: [] as string[],
  aiGegenereerd: false,
  prijzen: {} as PrijzenState,
  omschrijvingNl: '',
  omschrijvingFr: '',
  omschrijvingDe: '',
  omschrijvingEn: '',
};
```

Destructure the 2 new props and add state (after the `kunstenaars` destructure, and after the `maatIds` state respectively):

```tsx
export function KunstwerkenSection({
  kunstwerken,
  segmenten,
  materialen,
  materiaalsoorten,
  maten,
  stijlen,
  onderwerpen,
  kunstenaars,
  loadError,
  onAdd,
  onUpdate,
  onRemove,
  onAddStijl,
  onAddOnderwerp,
}: KunstwerkenSectionProps) {
```

```tsx
  const [stijlIds, setStijlIds] = useState<string[]>(LEGE_FORM.stijlIds);
  const [onderwerpIds, setOnderwerpIds] = useState<string[]>(LEGE_FORM.onderwerpIds);
  const [aiGegenereerd, setAiGegenereerd] = useState<boolean>(LEGE_FORM.aiGegenereerd);
  const [nieuweStijlNaam, setNieuweStijlNaam] = useState('');
  const [nieuweOnderwerpNaam, setNieuweOnderwerpNaam] = useState('');
  const [pendingNieuweStijlNaam, setPendingNieuweStijlNaam] = useState<string | null>(null);
  const [pendingNieuweOnderwerpNaam, setPendingNieuweOnderwerpNaam] = useState<string | null>(null);
  const [stijlToevoegenError, setStijlToevoegenError] = useState<string | null>(null);
  const [onderwerpToevoegenError, setOnderwerpToevoegenError] = useState<string | null>(null);
```

Reconcile once a freshly-created stijl/onderwerp shows up in the props (place right after the state declarations, this needs `useEffect` added to the existing `import { useMemo, useRef, useState } from 'react';` line, changed to `import { useEffect, useMemo, useRef, useState } from 'react';`):

```tsx
  useEffect(() => {
    if (!pendingNieuweStijlNaam) return;
    const gevonden = (stijlen ?? []).find((stijl) => stijl.omschrijving === pendingNieuweStijlNaam);
    if (gevonden) {
      setStijlIds((current) => (current.includes(gevonden.id) ? current : [...current, gevonden.id]));
      setPendingNieuweStijlNaam(null);
      setNieuweStijlNaam('');
    }
  }, [stijlen, pendingNieuweStijlNaam]);

  useEffect(() => {
    if (!pendingNieuweOnderwerpNaam) return;
    const gevonden = (onderwerpen ?? []).find((onderwerp) => onderwerp.omschrijving === pendingNieuweOnderwerpNaam);
    if (gevonden) {
      setOnderwerpIds((current) => (current.includes(gevonden.id) ? current : [...current, gevonden.id]));
      setPendingNieuweOnderwerpNaam(null);
      setNieuweOnderwerpNaam('');
    }
  }, [onderwerpen, pendingNieuweOnderwerpNaam]);

  async function handleAddNieuweStijl() {
    const naam = nieuweStijlNaam.trim();
    if (!naam) return;
    setStijlToevoegenError(null);
    const bestaande = (stijlen ?? []).find((stijl) => stijl.omschrijving.toLowerCase() === naam.toLowerCase());
    if (bestaande) {
      setStijlIds((current) => (current.includes(bestaande.id) ? current : [...current, bestaande.id]));
      setNieuweStijlNaam('');
      return;
    }
    setPendingNieuweStijlNaam(naam);
    const success = await onAddStijl({ omschrijving: naam });
    if (success) {
      void logActiviteit('stijl_toegevoegd', actorFromMedewerker(user));
    } else {
      setPendingNieuweStijlNaam(null);
      setStijlToevoegenError(t('kunstwerkenNieuweStijlError'));
    }
  }

  async function handleAddNieuweOnderwerp() {
    const naam = nieuweOnderwerpNaam.trim();
    if (!naam) return;
    setOnderwerpToevoegenError(null);
    const bestaande = (onderwerpen ?? []).find(
      (onderwerp) => onderwerp.omschrijving.toLowerCase() === naam.toLowerCase()
    );
    if (bestaande) {
      setOnderwerpIds((current) => (current.includes(bestaande.id) ? current : [...current, bestaande.id]));
      setNieuweOnderwerpNaam('');
      return;
    }
    setPendingNieuweOnderwerpNaam(naam);
    const success = await onAddOnderwerp({ omschrijving: naam });
    if (success) {
      void logActiviteit('onderwerp_toegevoegd', actorFromMedewerker(user));
    } else {
      setPendingNieuweOnderwerpNaam(null);
      setOnderwerpToevoegenError(t('kunstwerkenNieuweOnderwerpError'));
    }
  }
```

Add resets to `closeModal`'s reset block (find the block starting `setMateriaalIds(LEGE_FORM.materiaalIds);` / `setMaatIds(LEGE_FORM.maatIds);`):

```ts
    setMateriaalIds(LEGE_FORM.materiaalIds);
    setMaatIds(LEGE_FORM.maatIds);
    setStijlIds(LEGE_FORM.stijlIds);
    setOnderwerpIds(LEGE_FORM.onderwerpIds);
    setAiGegenereerd(LEGE_FORM.aiGegenereerd);
    setNieuweStijlNaam('');
    setNieuweOnderwerpNaam('');
    setPendingNieuweStijlNaam(null);
    setPendingNieuweOnderwerpNaam(null);
    setStijlToevoegenError(null);
    setOnderwerpToevoegenError(null);
```

Add to `openEdit`'s pre-fill block (find `setMateriaalIds(kunstwerk.materiaalIds);` / `setMaatIds(kunstwerk.maatIds);`):

```ts
    setMateriaalIds(kunstwerk.materiaalIds);
    setMaatIds(kunstwerk.maatIds);
    setStijlIds(kunstwerk.stijlIds ?? []);
    setOnderwerpIds(kunstwerk.onderwerpIds ?? []);
    setAiGegenereerd(kunstwerk.aiGegenereerd ?? false);
```

Add the 3 fields to the `handleSave` payload (find the `const data = { ... }` block):

```ts
    const data = {
      foto,
      naam,
      kunstenaarId: kunstenaarId || null,
      formaat,
      segmentIds,
      materiaalIds,
      maatIds,
      stijlIds,
      onderwerpIds,
      aiGegenereerd,
      prijzen: prijzenArray,
      omschrijvingNl,
      omschrijvingFr,
      omschrijvingDe,
      omschrijvingEn,
    };
```

- [ ] **Step 5: Add the 3 form sections to the JSX**

In `src/components/beheer/KunstwerkenSection.tsx`, add after the closing `</fieldset>` of the Materialen fieldset (before the Maten fieldset, or after it — placement among the existing fieldsets doesn't matter functionally; put it right after Materialen):

```tsx
          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs uppercase tracking-wide text-white/60">
              {t('kunstwerkenLabelStijlen')}
            </legend>
            {(stijlen ?? []).map((stijl) => (
              <label key={stijl.id} className="flex items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={stijlIds.includes(stijl.id)}
                  onChange={() => setStijlIds((current) => toggle(current, stijl.id))}
                  data-testid={`kunstwerk-modal-stijl-${stijl.id}`}
                />
                {stijl.omschrijving}
              </label>
            ))}
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={nieuweStijlNaam}
                onChange={(event) => setNieuweStijlNaam(event.target.value)}
                placeholder={t('kunstwerkenNieuweStijlPlaceholder')}
                data-testid="kunstwerk-modal-nieuwe-stijl-naam"
                className="flex-1 rounded-sm bg-black/40 px-3 py-1.5 text-sm text-white"
              />
              <button
                type="button"
                onClick={handleAddNieuweStijl}
                disabled={!nieuweStijlNaam.trim()}
                data-testid="kunstwerk-modal-nieuwe-stijl-toevoegen"
                className="rounded-sm border border-white/20 px-3 py-1.5 text-xs text-white/70 hover:border-white/40 hover:text-white disabled:opacity-40"
              >
                {t('kunstwerkenNieuweStijlToevoegen')}
              </button>
            </div>
            {stijlToevoegenError && (
              <span data-testid="kunstwerk-modal-nieuwe-stijl-error" className="text-xs text-red-400">
                {stijlToevoegenError}
              </span>
            )}
          </fieldset>

          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs uppercase tracking-wide text-white/60">
              {t('kunstwerkenLabelOnderwerpen')}
            </legend>
            {(onderwerpen ?? []).map((onderwerp) => (
              <label key={onderwerp.id} className="flex items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={onderwerpIds.includes(onderwerp.id)}
                  onChange={() => setOnderwerpIds((current) => toggle(current, onderwerp.id))}
                  data-testid={`kunstwerk-modal-onderwerp-${onderwerp.id}`}
                />
                {onderwerp.omschrijving}
              </label>
            ))}
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={nieuweOnderwerpNaam}
                onChange={(event) => setNieuweOnderwerpNaam(event.target.value)}
                placeholder={t('kunstwerkenNieuweOnderwerpPlaceholder')}
                data-testid="kunstwerk-modal-nieuwe-onderwerp-naam"
                className="flex-1 rounded-sm bg-black/40 px-3 py-1.5 text-sm text-white"
              />
              <button
                type="button"
                onClick={handleAddNieuweOnderwerp}
                disabled={!nieuweOnderwerpNaam.trim()}
                data-testid="kunstwerk-modal-nieuwe-onderwerp-toevoegen"
                className="rounded-sm border border-white/20 px-3 py-1.5 text-xs text-white/70 hover:border-white/40 hover:text-white disabled:opacity-40"
              >
                {t('kunstwerkenNieuweOnderwerpToevoegen')}
              </button>
            </div>
            {onderwerpToevoegenError && (
              <span data-testid="kunstwerk-modal-nieuwe-onderwerp-error" className="text-xs text-red-400">
                {onderwerpToevoegenError}
              </span>
            )}
          </fieldset>

          <label className="flex items-center gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              checked={aiGegenereerd}
              onChange={(event) => setAiGegenereerd(event.target.checked)}
              data-testid="kunstwerk-modal-ai-gegenereerd"
            />
            {t('kunstwerkenLabelAiGegenereerd')}
          </label>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: PASS (all previous tests + the 2 new ones)

- [ ] **Step 7: Wire the 2 new props from BeheerShell**

In `src/components/beheer/BeheerShell.tsx`, pass the 4 new props to `<KunstwerkenSection>`:

```tsx
        ) : activeSection === 'kunstwerken' ? (
          <KunstwerkenSection
            kunstwerken={kunstwerken.items}
            segmenten={segmenten.items}
            materialen={materialen.items}
            materiaalsoorten={materiaalsoorten.items}
            maten={maten.items}
            stijlen={stijlen.items}
            onderwerpen={onderwerpen.items}
            kunstenaars={kunstenaars.items}
            loadError={kunstwerken.error === 'load' ? t('kunstwerkenLoadError') : null}
            onAdd={kunstwerken.add}
            onUpdate={kunstwerken.update}
            onRemove={kunstwerken.remove}
            onAddStijl={stijlen.add}
            onAddOnderwerp={onderwerpen.add}
          />
```

- [ ] **Step 8: Run the full beheer test suite**

Run: `npx vitest run tests/components/beheer`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/components/beheer/KunstwerkenSection.tsx src/components/beheer/BeheerShell.tsx messages/nl.json tests/components/beheer/KunstwerkenSection.test.tsx
git commit -m "feat: let kunstwerken be tagged with multiple stijlen/onderwerpen, inline-creatable, plus AI-gegenereerd"
```

---

### Task 8: Formaat facet (multi-select)

**Files:**
- Modify: `src/components/ProductsGrid.tsx`
- Modify: `tests/components/ProductsGrid.test.tsx`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json`

**Interfaces:**
- Consumes: `FilterSection` (Task 2), `KunstwerkFormaat` type from `./beheer/materiaalTypes`
- Produces: `formaatFilters: Set<KunstwerkFormaat>` state and `toggleFormaat(formaat: KunstwerkFormaat)` handler inside `ProductsGrid`. Task 12 reads `formaatFilters` to render its chip row and `toggleFormaat`/`setFormaatFilters` to remove one.

- [ ] **Step 1: Add the new translation keys**

In `messages/nl.json`, inside `"collectionsPage"`, add (after `"kunstenaarFacetTitle"`):

```json
    "kunstenaarFacetTitle": "Kunstenaar",
    "formaatFacetTitle": "Formaat",
    "formaatStaand": "Staand",
    "formaatLiggend": "Liggend",
    "formaatVierkant": "Vierkant"
```

In `messages/en.json`:

```json
    "kunstenaarFacetTitle": "Artist",
    "formaatFacetTitle": "Format",
    "formaatStaand": "Portrait",
    "formaatLiggend": "Landscape",
    "formaatVierkant": "Square"
```

In `messages/fr.json`:

```json
    "kunstenaarFacetTitle": "Artiste",
    "formaatFacetTitle": "Format",
    "formaatStaand": "Portrait",
    "formaatLiggend": "Paysage",
    "formaatVierkant": "Carré"
```

In `messages/de.json`:

```json
    "kunstenaarFacetTitle": "Künstler",
    "formaatFacetTitle": "Format",
    "formaatStaand": "Hochformat",
    "formaatLiggend": "Querformat",
    "formaatVierkant": "Quadratisch"
```

- [ ] **Step 2: Extend the test fixtures with a formaat per kunstwerk**

In `tests/components/ProductsGrid.test.tsx`, update the `KUNSTWERKEN` fixture (find the `const KUNSTWERKEN = [` block) to add a `formaat` field to each of the 3 entries — `kw-1` gets `formaat: 'staand'`, `kw-2` gets `formaat: 'liggend'`, `kw-3` gets `formaat: 'vierkant'`:

```tsx
const KUNSTWERKEN = [
  {
    id: 'kw-1',
    data: {
      foto: 'https://example.com/kw-1.jpg',
      segmentIds: ['seg-hotel'],
      materiaalIds: ['mat-1'],
      maatIds: ['maat-1'],
      formaat: 'staand',
      prijzen: [{ materiaalId: 'mat-1', maatId: 'maat-1', prijs: 150 }],
      kunstenaarId: 'ka-1',
      omschrijvingNl: 'Hotel paneel',
      omschrijvingFr: '',
      omschrijvingDe: '',
      omschrijvingEn: '',
    },
  },
  {
    id: 'kw-2',
    data: {
      foto: 'https://example.com/kw-2.jpg',
      segmentIds: ['seg-wellness'],
      materiaalIds: ['mat-1'],
      maatIds: ['maat-1'],
      formaat: 'liggend',
      prijzen: [{ materiaalId: 'mat-1', maatId: 'maat-1', prijs: 200 }],
      omschrijvingNl: 'Wellness paneel',
      omschrijvingFr: '',
      omschrijvingDe: '',
      omschrijvingEn: '',
    },
  },
  {
    id: 'kw-3',
    data: {
      foto: 'https://example.com/kw-3.jpg',
      segmentIds: ['seg-hotel', 'seg-wellness'],
      materiaalIds: ['mat-1'],
      maatIds: ['maat-1'],
      formaat: 'vierkant',
      prijzen: [{ materiaalId: 'mat-1', maatId: 'maat-1', prijs: 175 }],
      omschrijvingNl: 'Kunstwerk in beide segmenten',
      omschrijvingFr: '',
      omschrijvingDe: '',
      omschrijvingEn: '',
    },
  },
];
```

- [ ] **Step 3: Write the failing test**

Add inside `describe('ProductsGrid', ...)`:

```tsx
  it('filters by formaat, combines with segment via AND, and shows counts per formaat option', async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');

    expect(screen.getByTestId('facet-formaat-option-staand')).toHaveTextContent('1');
    expect(screen.getByTestId('facet-formaat-option-liggend')).toHaveTextContent('1');
    expect(screen.getByTestId('facet-formaat-option-vierkant')).toHaveTextContent('1');

    fireEvent.click(screen.getByTestId('facet-formaat-option-vierkant'));
    expect(screen.getAllByTestId('product-card')).toHaveLength(1); // only kw-3

    fireEvent.click(screen.getByTestId('filter-seg-wellness'));
    expect(screen.getAllByTestId('product-card')).toHaveLength(1); // kw-3 is in both seg-wellness and vierkant

    fireEvent.click(screen.getByTestId('facet-formaat-option-vierkant'));
    expect(screen.getAllByTestId('product-card')).toHaveLength(2); // seg-wellness alone: kw-2 and kw-3
  });
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx`
Expected: FAIL — no element with `data-testid="facet-formaat-option-staand"`

- [ ] **Step 5: Implement the facet**

In `src/components/ProductsGrid.tsx`, add the import (extend the existing type import line):

```tsx
import type { Segment, Kunstwerk, Materiaal, Maat, Materiaalsoort, KunstwerkFormaat } from './beheer/materiaalTypes';
```

Add state (after the existing `kunstenaarFilter` state):

```tsx
  const [formaatFilters, setFormaatFilters] = useState<Set<KunstwerkFormaat>>(new Set());
```

Add the toggle handler and the option list (after the `handleSelect` function):

```tsx
  function toggleFormaat(formaat: KunstwerkFormaat) {
    setFormaatFilters((current) => {
      const next = new Set(current);
      if (next.has(formaat)) {
        next.delete(formaat);
      } else {
        next.add(formaat);
      }
      return next;
    });
  }

  const FORMAAT_OPTIES: KunstwerkFormaat[] = ['staand', 'liggend', 'vierkant'];
  const formaatLabels: Record<KunstwerkFormaat, string> = {
    staand: tCollections('formaatStaand'),
    liggend: tCollections('formaatLiggend'),
    vierkant: tCollections('formaatVierkant'),
  };
```

Change the `bySegment`/`visibleKunstwerken` derivation (find the two `const` lines right below `const allKunstwerken = kunstwerken.items;`) to insert the formaat filter between segment and kunstenaar filtering:

```tsx
  const allKunstwerken = kunstwerken.items;
  const bySegment =
    activeFilter === ALL_FILTER
      ? allKunstwerken
      : allKunstwerken.filter((kunstwerk) => kunstwerk.segmentIds.includes(activeFilter));
  const byFormaat =
    formaatFilters.size === 0 ? bySegment : bySegment.filter((kunstwerk) => kunstwerk.formaat != null && formaatFilters.has(kunstwerk.formaat));
  const visibleKunstwerken =
    kunstenaarFilter === null ? byFormaat : byFormaat.filter((kunstwerk) => kunstwerk.kunstenaarId === kunstenaarFilter);
```

Add the facet UI inside `<aside>`, right after the closing `</FilterSection>` of the Kunstenaar section, still inside `<aside>`:

```tsx
          <FilterSection title={tCollections('formaatFacetTitle')} testId="formaat">
            {FORMAAT_OPTIES.map((formaat) => {
              const isChecked = formaatFilters.has(formaat);
              const count = bySegment.filter((kunstwerk) => kunstwerk.formaat === formaat).length;
              return (
                <label
                  key={formaat}
                  data-testid={`facet-formaat-option-${formaat}`}
                  className="flex cursor-pointer items-center gap-2 text-xs text-white/70"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleFormaat(formaat)}
                    className="h-3.5 w-3.5 accent-gold"
                  />
                  <span className={isChecked ? 'text-white' : ''}>{formaatLabels[formaat]}</span>
                  <span className="ml-auto text-[11px] text-white/40">{count}</span>
                </label>
              );
            })}
          </FilterSection>
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx`
Expected: PASS (all previous tests + the new formaat test)

- [ ] **Step 7: Commit**

```bash
git add src/components/ProductsGrid.tsx tests/components/ProductsGrid.test.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json
git commit -m "feat: add formaat filter facet to collectiepagina"
```

---

### Task 9: Stijl facet (multi-select)

**Files:**
- Modify: `src/components/ProductsGrid.tsx`
- Modify: `tests/components/ProductsGrid.test.tsx`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json`

**Interfaces:**
- Consumes: `FilterSection` (Task 2), `Stijl` type (Task 4)
- Produces: `stijlFilters: Set<string>` state and `toggleStijl(stijlId: string)` handler. Task 12 reads these for its chip row.

- [ ] **Step 1: Add the new translation keys**

In `messages/nl.json`: `"stijlFacetTitle": "Stijl"`. In `messages/en.json`: `"stijlFacetTitle": "Style"`. In `messages/fr.json`: `"stijlFacetTitle": "Style"`. In `messages/de.json`: `"stijlFacetTitle": "Stil"`. Add each right after `"formaatVierkant"` in the respective file.

- [ ] **Step 2: Extend the test fixtures**

In `tests/components/ProductsGrid.test.tsx`, add a `stijlen` collection to `mockCollections()`'s `data` record:

```tsx
function mockCollections() {
  const data: Record<string, Array<{ id: string; data: Record<string, unknown> }>> = {
    segmenten: SEGMENTEN,
    kunstwerken: KUNSTWERKEN,
    materialen: MATERIALEN,
    maten: MATEN,
    kunstenaars: KUNSTENAARS,
    stijlen: STIJLEN,
    onderwerpen: ONDERWERPEN,
  };
```

Add the fixtures (after `const KUNSTWERKEN = [...]`, before `mockCollections`):

```tsx
const STIJLEN = [
  { id: 'stijl-abstract', data: { omschrijving: 'Abstract' } },
  { id: 'stijl-minimalistisch', data: { omschrijving: 'Minimalistisch' } },
];
const ONDERWERPEN = [
  { id: 'onderwerp-bloemen', data: { omschrijving: 'Bloemen' } },
  { id: 'onderwerp-dieren', data: { omschrijving: 'Dieren' } },
];
```

Add `stijlIds`/`onderwerpIds` to each `KUNSTWERKEN` entry's `data` (kw-1 gets `stijlIds: ['stijl-abstract'], onderwerpIds: ['onderwerp-bloemen']`; kw-2 gets `stijlIds: ['stijl-minimalistisch'], onderwerpIds: ['onderwerp-dieren']`; kw-3 gets `stijlIds: ['stijl-abstract', 'stijl-minimalistisch'], onderwerpIds: []`).

- [ ] **Step 3: Write the failing test**

Add inside `describe('ProductsGrid', ...)`:

```tsx
  it('filters by stijl (OR within the facet) combined with segment via AND', async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');

    expect(screen.getByTestId('facet-stijl-option-stijl-abstract')).toHaveTextContent('2'); // kw-1, kw-3
    expect(screen.getByTestId('facet-stijl-option-stijl-minimalistisch')).toHaveTextContent('2'); // kw-2, kw-3

    fireEvent.click(screen.getByTestId('facet-stijl-option-stijl-abstract'));
    expect(screen.getAllByTestId('product-card')).toHaveLength(2); // kw-1, kw-3

    fireEvent.click(screen.getByTestId('facet-stijl-option-stijl-minimalistisch'));
    expect(screen.getAllByTestId('product-card')).toHaveLength(3); // OR: any of the 2 stijlen matches all 3
  });
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx`
Expected: FAIL — no element with `data-testid="facet-stijl-option-stijl-abstract"`

- [ ] **Step 5: Implement the facet**

In `src/components/ProductsGrid.tsx`, add `Stijl` to the type import:

```tsx
import type { Segment, Kunstwerk, Materiaal, Maat, Materiaalsoort, KunstwerkFormaat, Stijl } from './beheer/materiaalTypes';
```

Add the collection read (after the `materiaalsoorten` collection read):

```tsx
  const stijlen = useFirestoreCollection<Stijl>('stijlen');
```

Add state (after `formaatFilters`):

```tsx
  const [stijlFilters, setStijlFilters] = useState<Set<string>>(new Set());
```

Add the toggle handler (after `toggleFormaat`):

```tsx
  function toggleStijl(stijlId: string) {
    setStijlFilters((current) => {
      const next = new Set(current);
      if (next.has(stijlId)) {
        next.delete(stijlId);
      } else {
        next.add(stijlId);
      }
      return next;
    });
  }
```

Insert the stijl filter into the funnel, between `byFormaat` and `visibleKunstwerken`:

```tsx
  const byStijl =
    stijlFilters.size === 0
      ? byFormaat
      : byFormaat.filter((kunstwerk) => (kunstwerk.stijlIds ?? []).some((id) => stijlFilters.has(id)));
  const visibleKunstwerken =
    kunstenaarFilter === null ? byStijl : byStijl.filter((kunstwerk) => kunstwerk.kunstenaarId === kunstenaarFilter);
```

(This replaces the `kunstenaarFilter === null ? byFormaat : byFormaat.filter(...)` line from Task 8 — `byStijl` now sits between `byFormaat` and the kunstenaar filter.)

Add the facet UI inside `<aside>`, right after the Formaat `FilterSection`:

```tsx
          <FilterSection title={tCollections('stijlFacetTitle')} testId="stijl">
            {(stijlen.items ?? []).map((stijl) => {
              const isChecked = stijlFilters.has(stijl.id);
              const count = byFormaat.filter((kunstwerk) => (kunstwerk.stijlIds ?? []).includes(stijl.id)).length;
              return (
                <label
                  key={stijl.id}
                  data-testid={`facet-stijl-option-${stijl.id}`}
                  className="flex cursor-pointer items-center gap-2 text-xs text-white/70"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleStijl(stijl.id)}
                    className="h-3.5 w-3.5 accent-gold"
                  />
                  <span className={isChecked ? 'text-white' : ''}>{stijl.omschrijving}</span>
                  <span className="ml-auto text-[11px] text-white/40">{count}</span>
                </label>
              );
            })}
          </FilterSection>
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx`
Expected: PASS (all previous tests + the new stijl test)

- [ ] **Step 7: Commit**

```bash
git add src/components/ProductsGrid.tsx tests/components/ProductsGrid.test.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json
git commit -m "feat: add stijl filter facet to collectiepagina"
```

---

### Task 10: Onderwerp facet (multi-select)

**Files:**
- Modify: `src/components/ProductsGrid.tsx`
- Modify: `tests/components/ProductsGrid.test.tsx`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json`

**Interfaces:**
- Consumes: `FilterSection` (Task 2), `Onderwerp` type (Task 4)
- Produces: `onderwerpFilters: Set<string>` state and `toggleOnderwerp(onderwerpId: string)` handler. Task 12 reads these for its chip row. This is a structural clone of Task 9.

- [ ] **Step 1: Add the new translation keys**

In `messages/nl.json`: `"onderwerpFacetTitle": "Onderwerp"`. In `messages/en.json`: `"onderwerpFacetTitle": "Subject"`. In `messages/fr.json`: `"onderwerpFacetTitle": "Sujet"`. In `messages/de.json`: `"onderwerpFacetTitle": "Motiv"`. Add each right after `"stijlFacetTitle"` in the respective file.

- [ ] **Step 2: Write the failing test**

The `ONDERWERPEN` fixture and each `KUNSTWERKEN` entry's `onderwerpIds` were already added in Task 9, step 2. Add inside `describe('ProductsGrid', ...)`:

```tsx
  it('filters by onderwerp (OR within the facet) combined with segment via AND', async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');

    expect(screen.getByTestId('facet-onderwerp-option-onderwerp-bloemen')).toHaveTextContent('1'); // kw-1
    expect(screen.getByTestId('facet-onderwerp-option-onderwerp-dieren')).toHaveTextContent('1'); // kw-2

    fireEvent.click(screen.getByTestId('facet-onderwerp-option-onderwerp-bloemen'));
    expect(screen.getAllByTestId('product-card')).toHaveLength(1); // only kw-1 (kw-3 has no onderwerpen)
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx`
Expected: FAIL — no element with `data-testid="facet-onderwerp-option-onderwerp-bloemen"`

- [ ] **Step 4: Implement the facet**

In `src/components/ProductsGrid.tsx`, add `Onderwerp` to the type import:

```tsx
import type { Segment, Kunstwerk, Materiaal, Maat, Materiaalsoort, KunstwerkFormaat, Stijl, Onderwerp } from './beheer/materiaalTypes';
```

Add the collection read (after `stijlen`):

```tsx
  const onderwerpen = useFirestoreCollection<Onderwerp>('onderwerpen');
```

Add state (after `stijlFilters`):

```tsx
  const [onderwerpFilters, setOnderwerpFilters] = useState<Set<string>>(new Set());
```

Add the toggle handler (after `toggleStijl`):

```tsx
  function toggleOnderwerp(onderwerpId: string) {
    setOnderwerpFilters((current) => {
      const next = new Set(current);
      if (next.has(onderwerpId)) {
        next.delete(onderwerpId);
      } else {
        next.add(onderwerpId);
      }
      return next;
    });
  }
```

Insert the onderwerp filter between `byStijl` and `visibleKunstwerken`:

```tsx
  const byOnderwerp =
    onderwerpFilters.size === 0
      ? byStijl
      : byStijl.filter((kunstwerk) => (kunstwerk.onderwerpIds ?? []).some((id) => onderwerpFilters.has(id)));
  const visibleKunstwerken =
    kunstenaarFilter === null ? byOnderwerp : byOnderwerp.filter((kunstwerk) => kunstwerk.kunstenaarId === kunstenaarFilter);
```

Add the facet UI inside `<aside>`, right after the Stijl `FilterSection`:

```tsx
          <FilterSection title={tCollections('onderwerpFacetTitle')} testId="onderwerp">
            {(onderwerpen.items ?? []).map((onderwerp) => {
              const isChecked = onderwerpFilters.has(onderwerp.id);
              const count = byStijl.filter((kunstwerk) => (kunstwerk.onderwerpIds ?? []).includes(onderwerp.id)).length;
              return (
                <label
                  key={onderwerp.id}
                  data-testid={`facet-onderwerp-option-${onderwerp.id}`}
                  className="flex cursor-pointer items-center gap-2 text-xs text-white/70"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleOnderwerp(onderwerp.id)}
                    className="h-3.5 w-3.5 accent-gold"
                  />
                  <span className={isChecked ? 'text-white' : ''}>{onderwerp.omschrijving}</span>
                  <span className="ml-auto text-[11px] text-white/40">{count}</span>
                </label>
              );
            })}
          </FilterSection>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx`
Expected: PASS (all previous tests + the new onderwerp test)

- [ ] **Step 6: Commit**

```bash
git add src/components/ProductsGrid.tsx tests/components/ProductsGrid.test.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json
git commit -m "feat: add onderwerp filter facet to collectiepagina"
```

---

### Task 11: AI-gegenereerd facet (single boolean checkbox)

**Files:**
- Modify: `src/components/ProductsGrid.tsx`
- Modify: `tests/components/ProductsGrid.test.tsx`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json`

**Interfaces:**
- Consumes: nothing new
- Produces: `aiGegenereerdFilter: boolean` state and `setAiGegenereerdFilter`. Task 12 reads/resets this too.

- [ ] **Step 1: Add the new translation keys**

In `messages/nl.json`: `"aiGegenereerdFacetLabel": "Alleen AI-gegenereerd"`. In `messages/en.json`: `"aiGegenereerdFacetLabel": "AI-generated only"`. In `messages/fr.json`: `"aiGegenereerdFacetLabel": "Généré par IA uniquement"`. In `messages/de.json`: `"aiGegenereerdFacetLabel": "Nur KI-generiert"`. Add each right after `"onderwerpFacetTitle"` in the respective file.

- [ ] **Step 2: Extend the test fixtures and write the failing test**

In `tests/components/ProductsGrid.test.tsx`, add `aiGegenereerd: true` to `kw-2`'s `data` (kw-1 and kw-3 stay without the field, i.e. falsy).

Add inside `describe('ProductsGrid', ...)`:

```tsx
  it('filters to only AI-gegenereerd kunstwerken when that checkbox is checked', async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    expect(screen.getAllByTestId('product-card')).toHaveLength(3);

    fireEvent.click(screen.getByTestId('facet-ai-gegenereerd'));
    expect(screen.getAllByTestId('product-card')).toHaveLength(1); // only kw-2

    fireEvent.click(screen.getByTestId('facet-ai-gegenereerd'));
    expect(screen.getAllByTestId('product-card')).toHaveLength(3);
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx`
Expected: FAIL — no element with `data-testid="facet-ai-gegenereerd"`

- [ ] **Step 4: Implement the facet**

In `src/components/ProductsGrid.tsx`, add state (after `onderwerpFilters`):

```tsx
  const [aiGegenereerdFilter, setAiGegenereerdFilter] = useState(false);
```

Change the final funnel line (replacing the `visibleKunstwerken` line from Task 10):

```tsx
  const byAiGegenereerd = aiGegenereerdFilter ? byOnderwerp.filter((kunstwerk) => kunstwerk.aiGegenereerd === true) : byOnderwerp;
  const visibleKunstwerken =
    kunstenaarFilter === null ? byAiGegenereerd : byAiGegenereerd.filter((kunstwerk) => kunstwerk.kunstenaarId === kunstenaarFilter);
```

Add the checkbox in `<aside>`, right after the Onderwerp `FilterSection` (not wrapped in its own `FilterSection` — a single checkbox doesn't need a collapsible header):

```tsx
          <label className="flex cursor-pointer items-center gap-2 border-t border-white/10 pt-4 text-xs text-white/70">
            <input
              type="checkbox"
              checked={aiGegenereerdFilter}
              onChange={(event) => setAiGegenereerdFilter(event.target.checked)}
              data-testid="facet-ai-gegenereerd"
              className="h-3.5 w-3.5 accent-gold"
            />
            <span className={aiGegenereerdFilter ? 'text-white' : ''}>{tCollections('aiGegenereerdFacetLabel')}</span>
          </label>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx`
Expected: PASS (all previous tests + the new AI-gegenereerd test)

- [ ] **Step 6: Commit**

```bash
git add src/components/ProductsGrid.tsx tests/components/ProductsGrid.test.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json
git commit -m "feat: add AI-gegenereerd filter checkbox to collectiepagina"
```

---

### Task 12: Active-filter chips + "wis filters" (covers every facet)

**Files:**
- Modify: `src/components/ProductsGrid.tsx`
- Modify: `tests/components/ProductsGrid.test.tsx`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json`

**Interfaces:**
- Consumes: `activeFilter`/`setActiveFilter`, `kunstenaarFilter`/`setKunstenaarFilter`, `formaatFilters`/`toggleFormaat`/`setFormaatFilters`, `stijlFilters`/`toggleStijl`/`setStijlFilters`, `onderwerpFilters`/`toggleOnderwerp`/`setOnderwerpFilters`, `aiGegenereerdFilter`/`setAiGegenereerdFilter` (all in scope from Tasks 3, 8–11)
- Produces: a chip row above `products-grid` and a "wis filters" link; no new state.

- [ ] **Step 1: Add the new translation keys**

In `messages/nl.json`, inside `"collectionsPage"`: `"clearAllFilters": "Filters wissen"`, `"removeFilterAria": "Verwijder filter {label}"`. In `messages/en.json`: `"clearAllFilters": "Clear filters"`, `"removeFilterAria": "Remove filter {label}"`. In `messages/fr.json`: `"clearAllFilters": "Effacer les filtres"`, `"removeFilterAria": "Supprimer le filtre {label}"`. In `messages/de.json`: `"clearAllFilters": "Filter zurücksetzen"`, `"removeFilterAria": "Filter {label} entfernen"`.

- [ ] **Step 2: Write the failing test**

Add inside `describe('ProductsGrid', ...)`:

```tsx
  it('shows a removable chip per active filter across every facet, and clears everything via "wis filters"', async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    expect(screen.queryByTestId('active-filter-chips')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('filter-seg-hotel'));
    fireEvent.click(screen.getByTestId('facet-formaat-option-staand'));
    fireEvent.click(screen.getByTestId('facet-stijl-option-stijl-abstract'));
    fireEvent.click(screen.getByTestId('facet-onderwerp-option-onderwerp-bloemen'));
    fireEvent.click(screen.getByTestId('facet-ai-gegenereerd'));

    expect(screen.getByTestId('active-filter-chip-segment')).toHaveTextContent('Hotel');
    expect(screen.getByTestId('active-filter-chip-formaat-staand')).toHaveTextContent('Staand');
    expect(screen.getByTestId('active-filter-chip-stijl-stijl-abstract')).toHaveTextContent('Abstract');
    expect(screen.getByTestId('active-filter-chip-onderwerp-onderwerp-bloemen')).toHaveTextContent('Bloemen');
    expect(screen.getByTestId('active-filter-chip-ai-gegenereerd')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('active-filter-chip-formaat-staand-remove'));
    expect(screen.queryByTestId('active-filter-chip-formaat-staand')).not.toBeInTheDocument();
    expect(screen.getByTestId('active-filter-chip-segment')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('clear-all-filters'));
    expect(screen.queryByTestId('active-filter-chips')).not.toBeInTheDocument();
    expect(screen.getByTestId('filter-all')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('facet-ai-gegenereerd')).not.toBeChecked();
    expect(screen.getAllByTestId('product-card')).toHaveLength(3);
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx`
Expected: FAIL — no element with `data-testid="active-filter-chip-segment"`

- [ ] **Step 4: Implement the chip row**

In `src/components/ProductsGrid.tsx`, add a computed list right before the `return (` statement (after `breadcrumbItems`):

```tsx
  const stijlNaamById = new Map((stijlen.items ?? []).map((stijl) => [stijl.id, stijl.omschrijving]));
  const onderwerpNaamById = new Map((onderwerpen.items ?? []).map((onderwerp) => [onderwerp.id, onderwerp.omschrijving]));

  const activeChips: { key: string; label: string; onRemove: () => void }[] = [
    ...(geselecteerdSegment ? [{ key: 'segment', label: geselecteerdSegment.omschrijving, onRemove: () => setActiveFilter(ALL_FILTER) }] : []),
    ...(geselecteerdeKunstenaar
      ? [{ key: 'kunstenaar', label: geselecteerdeKunstenaar.naam, onRemove: () => setKunstenaarFilter(null) }]
      : []),
    ...Array.from(formaatFilters).map((formaat) => ({
      key: `formaat-${formaat}`,
      label: formaatLabels[formaat],
      onRemove: () => toggleFormaat(formaat),
    })),
    ...Array.from(stijlFilters).map((stijlId) => ({
      key: `stijl-${stijlId}`,
      label: stijlNaamById.get(stijlId) ?? stijlId,
      onRemove: () => toggleStijl(stijlId),
    })),
    ...Array.from(onderwerpFilters).map((onderwerpId) => ({
      key: `onderwerp-${onderwerpId}`,
      label: onderwerpNaamById.get(onderwerpId) ?? onderwerpId,
      onRemove: () => toggleOnderwerp(onderwerpId),
    })),
    ...(aiGegenereerdFilter
      ? [{ key: 'ai-gegenereerd', label: tCollections('aiGegenereerdFacetLabel'), onRemove: () => setAiGegenereerdFilter(false) }]
      : []),
  ];

  function clearAllFilters() {
    setActiveFilter(ALL_FILTER);
    setKunstenaarFilter(null);
    setFormaatFilters(new Set());
    setStijlFilters(new Set());
    setOnderwerpFilters(new Set());
    setAiGegenereerdFilter(false);
  }
```

Insert the chip row right after the opening `<div>` that wraps `kunstenaar-banner`/`products-grid` (the `<div>` right after `</aside>`), before the `{geselecteerdeKunstenaar && (`:

```tsx
        <div>
          {activeChips.length > 0 && (
            <div data-testid="active-filter-chips" className="mb-4 flex flex-wrap items-center gap-2">
              {activeChips.map((chip) => (
                <span
                  key={chip.key}
                  data-testid={`active-filter-chip-${chip.key}`}
                  className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-white"
                >
                  {chip.label}
                  <button
                    type="button"
                    onClick={chip.onRemove}
                    data-testid={`active-filter-chip-${chip.key}-remove`}
                    aria-label={tCollections('removeFilterAria', { label: chip.label })}
                    className="text-white/50 hover:text-gold"
                  >
                    &#10005;
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={clearAllFilters}
                data-testid="clear-all-filters"
                className="text-xs text-gold hover:text-gold-bright"
              >
                {tCollections('clearAllFilters')}
              </button>
            </div>
          )}

          {geselecteerdeKunstenaar && (
```

(The rest of that `<div>` — `kunstenaar-banner` through `products-grid` — stays exactly as earlier tasks left it.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx`
Expected: PASS (all previous tests + the new chips test)

- [ ] **Step 6: Commit**

```bash
git add src/components/ProductsGrid.tsx tests/components/ProductsGrid.test.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json
git commit -m "feat: add removable active-filter chips and clear-all across every facet"
```

---

### Task 13: `initialSegmentId` prop + `searchParams` wiring

**Files:**
- Modify: `src/components/ProductsGrid.tsx`
- Modify: `src/app/[locale]/collecties/page.tsx`
- Modify: `tests/components/ProductsGrid.test.tsx`

**Interfaces:**
- Consumes: nothing new
- Produces: `ProductsGrid` accepts an optional `initialSegmentId?: string` prop used only as the initial value of the `activeFilter` state. Task 14's `CollectiesDropdown` links to `/collecties?segment=<id>`, which this task makes the page honor.

- [ ] **Step 1: Write the failing test**

Add inside `describe('ProductsGrid', ...)`:

```tsx
  it('pre-selects the segment given via the initialSegmentId prop', async () => {
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <ProductsGrid initialSegmentId="seg-wellness" />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );
    await screen.findAllByTestId('product-card');
    expect(screen.getByTestId('filter-seg-wellness')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByTestId('product-card')).toHaveLength(2); // kw-2 and kw-3
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx`
Expected: FAIL — `filter-seg-wellness` has `aria-pressed="false"` (prop is ignored)

- [ ] **Step 3: Accept the prop**

In `src/components/ProductsGrid.tsx`, change the function signature and initial state:

```tsx
export function ProductsGrid({ initialSegmentId }: { initialSegmentId?: string }) {
  const locale = useLocale();
  const tCollections = useTranslations('collectionsPage');
  const [activeFilter, setActiveFilter] = useState(initialSegmentId ?? ALL_FILTER);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx`
Expected: PASS (all previous tests + the new prop test)

- [ ] **Step 5: Wire it up from the page**

In `src/app/[locale]/collecties/page.tsx`, replace the whole file with:

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { GlassPanel } from '@/components/GlassPanel';
import { ProductsGrid } from '@/components/ProductsGrid';
import { BecomeClientCta } from '@/components/BecomeClientCta';

export default async function CollectiesPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { segment?: string };
}) {
  const { locale } = params;
  setRequestLocale(locale);
  const t = await getTranslations('collectionsPage');
  const initialSegmentId = typeof searchParams.segment === 'string' ? searchParams.segment : undefined;

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-ink via-charcoal to-graphite px-4 pb-16 pt-24 sm:px-8">
      <GlassPanel className="mx-auto mb-10 !max-w-5xl text-center">
        <h1 className="text-2xl font-light text-white sm:text-3xl">{t('title')}</h1>
        <p className="mt-3 text-sm text-white/70">{t('intro')}</p>
      </GlassPanel>

      <ProductsGrid initialSegmentId={initialSegmentId} />

      <div className="mx-auto mt-10 max-w-3xl text-center">
        <BecomeClientCta />
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/ProductsGrid.tsx src/app/[locale]/collecties/page.tsx tests/components/ProductsGrid.test.tsx
git commit -m "feat: let /collecties preselect a segment via ?segment= query param"
```

---

### Task 14: Navbar "Collecties" hover-dropdown

**Files:**
- Create: `src/components/CollectiesDropdown.tsx`
- Modify: `src/components/NavBar.tsx`
- Test: `tests/components/CollectiesDropdown.test.tsx`
- Modify: `tests/components/NavBar.test.tsx`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json`

**Interfaces:**
- Consumes: `useFirestoreCollection<Segment>('segmenten')` (existing hook, `Segment` type from `./beheer/materiaalTypes`)
- Produces: `export function CollectiesDropdown()`, a drop-in replacement for the plain `<Link href="/collecties">` currently in `NavBar`. This is the last task and depends on nothing from Tasks 1–13 — it can be done independently/skipped without affecting the rest of the plan.

- [ ] **Step 1: Add the new translation key**

In `messages/nl.json`, inside `"nav"`: `"allCollectionsLink": "Alle collecties"`. In `messages/en.json`: `"allCollectionsLink": "All collections"`. In `messages/fr.json`: `"allCollectionsLink": "Toutes les collections"`. In `messages/de.json`: `"allCollectionsLink": "Alle Kollektionen"`. Add each right after `"myAccount"` in the respective file.

- [ ] **Step 2: Write the failing test**

Create `tests/components/CollectiesDropdown.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CollectiesDropdown } from '@/components/CollectiesDropdown';
import messages from '../../messages/nl.json';

const getDocsMock = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ name })),
  doc: vi.fn(),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  getDoc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));

function snapshot(items: Array<{ id: string; omschrijving: string }>) {
  return {
    empty: items.length === 0,
    docs: items.map(({ id, ...data }) => ({ id, data: () => data })),
  };
}

function renderDropdown() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CollectiesDropdown />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  getDocsMock.mockReset();
  getDocsMock.mockResolvedValue(
    snapshot([
      { id: 'seg-hotel', omschrijving: 'Hotel' },
      { id: 'seg-wellness', omschrijving: 'Wellness' },
    ])
  );
});

describe('CollectiesDropdown', () => {
  it('always renders a link to /collecties', async () => {
    renderDropdown();
    expect(screen.getByTestId('nav-collections')).toHaveAttribute('href', '/collecties');
  });

  it('shows a dropdown with a link per segment on hover, linking to /collecties?segment=<id>', async () => {
    renderDropdown();
    fireEvent.mouseEnter(screen.getByTestId('collections-dropdown-trigger'));
    await waitFor(() => expect(screen.getByTestId('collections-dropdown')).toBeInTheDocument());
    expect(screen.getByTestId('collections-dropdown-item-seg-hotel')).toHaveAttribute(
      'href',
      '/collecties?segment=seg-hotel'
    );
    expect(screen.getByTestId('collections-dropdown-item-seg-wellness')).toHaveAttribute(
      'href',
      '/collecties?segment=seg-wellness'
    );
  });

  it('hides the dropdown again on mouse leave', async () => {
    renderDropdown();
    fireEvent.mouseEnter(screen.getByTestId('collections-dropdown-trigger'));
    await waitFor(() => expect(screen.getByTestId('collections-dropdown')).toBeInTheDocument());
    fireEvent.mouseLeave(screen.getByTestId('collections-dropdown-trigger'));
    expect(screen.queryByTestId('collections-dropdown')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/components/CollectiesDropdown.test.tsx`
Expected: FAIL with "Cannot find module '@/components/CollectiesDropdown'"

- [ ] **Step 4: Implement the component**

Create `src/components/CollectiesDropdown.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useFirestoreCollection } from '@/lib/useFirestoreCollection';
import type { Segment } from './beheer/materiaalTypes';

export function CollectiesDropdown() {
  const t = useTranslations('nav');
  const [isOpen, setIsOpen] = useState(false);
  const segmenten = useFirestoreCollection<Segment>('segmenten');

  return (
    <div
      data-testid="collections-dropdown-trigger"
      className="relative"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <Link href="/collecties" data-testid="nav-collections" className="hover:text-gold">
        {t('collections')}
      </Link>
      {isOpen && segmenten.items && segmenten.items.length > 0 && (
        <div
          data-testid="collections-dropdown"
          className="absolute left-0 top-full z-30 min-w-[180px] rounded-sm border border-white/10 bg-charcoal py-2 shadow-lg"
        >
          {segmenten.items.map((segment) => (
            <Link
              key={segment.id}
              href={`/collecties?segment=${segment.id}`}
              data-testid={`collections-dropdown-item-${segment.id}`}
              className="block px-4 py-2 text-xs text-white/70 hover:bg-white/10 hover:text-gold"
            >
              {segment.omschrijving}
            </Link>
          ))}
          <Link
            href="/collecties"
            data-testid="collections-dropdown-item-all"
            className="block border-t border-white/10 px-4 py-2 text-xs text-gold hover:text-gold-bright"
          >
            {t('allCollectionsLink')}
          </Link>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/components/CollectiesDropdown.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 6: Wire it into NavBar**

In `src/components/NavBar.tsx`, add the import (after the `Logo` import):

```tsx
import { CollectiesDropdown } from './CollectiesDropdown';
```

Replace:

```tsx
          <Link href="/collecties" data-testid="nav-collections" className="hover:text-gold">
            {t('collections')}
          </Link>
```

with:

```tsx
          <CollectiesDropdown />
```

- [ ] **Step 7: Update the existing NavBar test**

In `tests/components/NavBar.test.tsx`:

Replace the `firebase/firestore` mock to include `collection` and `getDocs` (needed by `CollectiesDropdown`'s `useFirestoreCollection`):

```tsx
const getDocsMock = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ name })),
  doc: vi.fn((_db, collection, id) => ({ collection, id })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));
```

Add a reset + default resolved value in `beforeEach` (after `getDocMock.mockReset();`):

```tsx
  getDocsMock.mockReset();
  getDocsMock.mockResolvedValue({ empty: true, docs: [] });
```

Replace the test named `'renders Collecties as a single direct link, no dropdown'` with:

```tsx
  it('renders Collecties as a link, with a dropdown available on hover once segments load', async () => {
    signedOut();
    getDocsMock.mockResolvedValue({
      empty: false,
      docs: [{ id: 'seg-hotel', data: () => ({ omschrijving: 'Hotel' }) }],
    });
    renderNavBar();
    await waitFor(() => expect(screen.getByTestId('nav-become-client')).toBeInTheDocument());
    expect(screen.getByTestId('nav-collections')).toHaveAttribute('href', '/collecties');
    expect(screen.queryByTestId('collections-dropdown')).not.toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByTestId('collections-dropdown-trigger'));
    await waitFor(() => expect(screen.getByTestId('collections-dropdown-item-seg-hotel')).toBeInTheDocument());
  });
```

Add `fireEvent` to the existing `import { render, screen, waitFor } from '@testing-library/react';` line so it reads:

```tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
```

- [ ] **Step 8: Run the full NavBar test file**

Run: `npx vitest run tests/components/NavBar.test.tsx`
Expected: PASS (all tests, including the replaced one)

- [ ] **Step 9: Commit**

```bash
git add src/components/CollectiesDropdown.tsx src/components/NavBar.tsx tests/components/CollectiesDropdown.test.tsx tests/components/NavBar.test.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json
git commit -m "feat: add segment hover-dropdown under Collecties in the navbar"
```

---

## Final check

- [ ] Run the full suite once: `npx vitest run`
- [ ] Run `npx tsc --noEmit` once to catch anything the test suite's esbuild transpilation wouldn't
- [ ] Manually open `/beheer`, add a Stijl and an Onderwerp via their new sections, then open a kunstwerk and tag it with both, plus one brand-new inline-created stijl, plus AI-gegenereerd — confirm the new stijl appears in the Stijlen table afterwards
- [ ] Manually open `/collecties`, filter by segment, formaat, stijl, onderwerp and AI-gegenereerd, remove one via its chip, then "Filters wissen" — confirm the breadcrumb third crumb updates throughout
- [ ] Manually hover "Collecties" in the navbar and click a segment link; confirm `/collecties?segment=...` lands with that segment pre-selected and its filter button shown as active
