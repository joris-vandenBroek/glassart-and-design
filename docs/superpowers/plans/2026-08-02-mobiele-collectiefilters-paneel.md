# Mobiele collectiefilters in een uitschuifpaneel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Op de collectiepagina (`/collecties`) tonen we op mobiel direct de kunstwerken-grid, met de bestaande filters achter een "Filters"-knop die een uitschuifpaneel opent, in plaats van de filters die nu bovenaan de pagina staan en de grid ver naar beneden duwen.

**Architecture:** De bestaande filterinhoud van `ProductsGrid.tsx` wordt geëxtraheerd naar een gedeeld, stateless component `FiltersPanelContent`. Een nieuwe `useIsDesktop()`-hook (media query op de bestaande `md`-breakpoint) bepaalt of `ProductsGrid` die inhoud in de bestaande desktop-`<aside>` rendert, of achter een knop + de bestaande `Modal.tsx` op mobiel. Filteren blijft altijd live via de gedeelde React-state in `ProductsGrid`, ook terwijl het paneel open staat.

**Tech Stack:** Next.js 14 App Router (client component), TypeScript, `next-intl` (ICU plural), React `useState`/`useEffect`/`useSyncExternalStore`, Vitest + Testing Library.

## Global Constraints

- `tests/setup.ts` bevat geen `window.matchMedia`-polyfill — alle nieuwe responsive/media-query-code moet daarom terugvallen op een desktop-veilige default, zodat de bestaande `tests/components/ProductsGrid.test.tsx`-suite ongewijzigd blijft slagen.
- Nieuwe vertaalsleutels gaan altijd in **alle 4** locale-bestanden (`messages/nl.json`, `en.json`, `de.json`, `fr.json`) — nooit in slechts één.
- next-intl ICU-plural-syntax wordt al gebruikt in dit project (bv. `cart.customSizeNote` in `messages/nl.json`) — nieuwe plural-teksten volgen exact hetzelfde patroon.
- Volg de bestaande codestijl: geen commentaar tenzij een niet-vanzelfsprekende "waarom" wordt uitgelegd, 2-spaties-indentatie, `function`-declaraties voor lokale handlers (zoals in `ProductsGrid.tsx`).
- TDD: schrijf eerst de falende test (of, bij een pure refactor-taak, leun op de bestaande regressiesuite), bevestig het verwachte resultaat, implementeer, bevestig dat het slaagt, en commit dan pas — voor elke stap hieronder.
- Deze feature raakt geen database: alle tests zijn component-/hook-tests tegen gemockte `fetch`-data, dus de regels over het opschonen van echte databaserijen zijn hier niet van toepassing.

---

### Task 1: `Modal.tsx` — `closeButtonAriaLabel`-prop

**Files:**
- Modify: `src/components/Modal.tsx`
- Test: `tests/components/Modal.test.tsx`

**Interfaces:**
- Produces: `ModalProps.closeButtonAriaLabel?: string` — indien meegegeven, wordt dit gebruikt als `aria-label` van de losse "×"-knop (`data-testid="modal-close"`) in plaats van `closeLabel`. `closeLabel` blijft ongewijzigd de zichtbare tekst van de footer-sluitknop (`data-testid="modal-footer-close"`) bepalen. Valt terug op `closeLabel` wanneer niet meegegeven — bestaande aanroepen van `Modal` blijven ongewijzigd werken.

- [ ] **Step 1: Schrijf de falende test**

Voeg toe aan `tests/components/Modal.test.tsx`, direct na de test `"uses closeLabel as the close button's aria-label"` (regel 86-93):

```tsx
  it("uses closeButtonAriaLabel instead of closeLabel for the close button's aria-label when provided", () => {
    renderWithIntl(
      <Modal
        isOpen
        onClose={vi.fn()}
        closeLabel="Toon 3 resultaten"
        closeButtonAriaLabel="Paneel sluiten"
        title="Testmodal"
      >
        <p>Inhoud</p>
      </Modal>
    );
    expect(screen.getByTestId('modal-close')).toHaveAttribute('aria-label', 'Paneel sluiten');
    expect(screen.getByTestId('modal-footer-close')).toHaveTextContent('Toon 3 resultaten');
  });
```

- [ ] **Step 2: Run de test en bevestig dat hij faalt**

Run: `npx vitest run tests/components/Modal.test.tsx`
Expected: FAIL — `modal-close` heeft `aria-label="Toon 3 resultaten"` (huidig gedrag), niet `"Paneel sluiten"`.

- [ ] **Step 3: Implementeer de prop**

In `src/components/Modal.tsx`, vervang:

```tsx
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  closeLabel: string;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
  subtitle?: ReactNode;
  footerActions?: ReactNode;
}

export function Modal({
  isOpen,
  onClose,
  closeLabel,
  title,
  children,
  wide = false,
  subtitle,
  footerActions,
}: ModalProps) {
```

door:

```tsx
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  closeLabel: string;
  closeButtonAriaLabel?: string;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
  subtitle?: ReactNode;
  footerActions?: ReactNode;
}

export function Modal({
  isOpen,
  onClose,
  closeLabel,
  closeButtonAriaLabel,
  title,
  children,
  wide = false,
  subtitle,
  footerActions,
}: ModalProps) {
```

En vervang:

```tsx
          aria-label={closeLabel}
```

door:

```tsx
          aria-label={closeButtonAriaLabel ?? closeLabel}
```

- [ ] **Step 4: Run de tests en bevestig dat ze slagen**

Run: `npx vitest run tests/components/Modal.test.tsx`
Expected: PASS (alle tests, inclusief de nieuwe)

- [ ] **Step 5: Commit**

```bash
git add src/components/Modal.tsx tests/components/Modal.test.tsx
git commit -m "feat: add closeButtonAriaLabel prop to Modal"
```

---

### Task 2: `useIsDesktop()`-hook

**Files:**
- Create: `src/lib/useIsDesktop.ts`
- Test: `tests/lib/useIsDesktop.test.tsx`

**Interfaces:**
- Produces: `useIsDesktop(): boolean` — `true` wanneer `window.matchMedia('(min-width: 768px)').matches`, of wanneer `window.matchMedia` niet bestaat (server-render, en de testomgeving die geen polyfill heeft). Update live op het `change`-event van de media query.

- [ ] **Step 1: Schrijf de falende tests**

Maak `tests/lib/useIsDesktop.test.tsx` aan:

```tsx
import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsDesktop } from '@/lib/useIsDesktop';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useIsDesktop', () => {
  it('falls back to true when window.matchMedia is unavailable', () => {
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(true);
  });

  it('returns false when the (min-width: 768px) query does not match', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })
    );

    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);
  });

  it('updates when the media query change event fires', () => {
    let changeHandler: (() => void) | undefined;
    const mediaQueryList = {
      matches: false,
      addEventListener: (_event: string, handler: () => void) => {
        changeHandler = handler;
      },
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mediaQueryList));

    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);

    mediaQueryList.matches = true;
    act(() => {
      changeHandler?.();
    });
    expect(result.current).toBe(true);
  });
});
```

- [ ] **Step 2: Run de tests en bevestig dat ze falen**

Run: `npx vitest run tests/lib/useIsDesktop.test.tsx`
Expected: FAIL — `Cannot find module '@/lib/useIsDesktop'`

- [ ] **Step 3: Implementeer de hook**

Maak `src/lib/useIsDesktop.ts` aan:

```ts
'use client';

import { useSyncExternalStore } from 'react';

const DESKTOP_QUERY = '(min-width: 768px)';

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const mediaQueryList = window.matchMedia(DESKTOP_QUERY);
  mediaQueryList.addEventListener('change', onChange);
  return () => mediaQueryList.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true;
  }
  return window.matchMedia(DESKTOP_QUERY).matches;
}

function getServerSnapshot(): boolean {
  return true;
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
```

- [ ] **Step 4: Run de tests en bevestig dat ze slagen**

Run: `npx vitest run tests/lib/useIsDesktop.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/useIsDesktop.ts tests/lib/useIsDesktop.test.tsx
git commit -m "feat: add useIsDesktop hook"
```

---

### Task 3: `FiltersPanelContent` — extractie uit `ProductsGrid.tsx`

**Files:**
- Create: `src/components/FiltersPanelContent.tsx`
- Modify: `src/components/ProductsGrid.tsx`
- Test: `tests/components/ProductsGrid.test.tsx` (geen wijzigingen — dient als regressienet)

**Interfaces:**
- Produces: `FiltersPanelContent(props: FiltersPanelContentProps)` (default export is geen — named export), plus named exports `ALL_FILTER: string` en `FORMAAT_OPTIES: Exclude<KunstwerkFormaat, 'alle'>[]`, beide voorheen lokaal gedefinieerd in `ProductsGrid.tsx`.
- Consumes (van `ProductsGrid.tsx`, ongewijzigde namen/types): `segmenten`, `activeFilter`, `setActiveFilter`, `segmentCountBase`, `kunstenaars`, `kunstenaarFilter`, `setKunstenaarFilter`, `formaatFilters`, `toggleFormaat`, `formaatCountBase`, `formaatLabels`, `stijlen`, `stijlFilters`, `toggleStijl`, `stijlCountBase`, `onderwerpen`, `onderwerpFilters`, `toggleOnderwerp`, `onderwerpCountBase`, `aiGegenereerdFilter`, `setAiGegenereerdFilter`.

Dit is een **pure extractie**: geen enkele test hoeft te veranderen. De bestaande `tests/components/ProductsGrid.test.tsx`-suite bevestigt dat er niets is gebroken.

- [ ] **Step 1: Maak `FiltersPanelContent.tsx` aan**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Combobox } from './Combobox';
import { FilterSection } from './FilterSection';
import type { Segment, Kunstwerk, KunstwerkFormaat, Stijl, Onderwerp } from './beheer/materiaalTypes';
import type { Kunstenaar } from './beheer/kunstenaarTypes';

export const ALL_FILTER = 'all';
export const FORMAAT_OPTIES: Exclude<KunstwerkFormaat, 'alle'>[] = ['staand', 'liggend', 'vierkant'];

function filterButtonClass(isActive: boolean) {
  return isActive
    ? 'rounded-full bg-silver px-4 py-1.5 text-xs font-head tracking-wide text-ink'
    : 'rounded-full border border-white/20 px-4 py-1.5 text-xs font-head tracking-wide text-white/70 hover:border-gold/40 hover:text-gold';
}

interface FiltersPanelContentProps {
  segmenten: Segment[];
  activeFilter: string;
  onSelectFilter: (segmentId: string) => void;
  segmentCountBase: Kunstwerk[];
  kunstenaars: Kunstenaar[] | null;
  kunstenaarFilter: string | null;
  onKunstenaarFilterChange: (kunstenaarId: string | null) => void;
  formaatFilters: Set<Exclude<KunstwerkFormaat, 'alle'>>;
  onToggleFormaat: (formaat: Exclude<KunstwerkFormaat, 'alle'>) => void;
  formaatCountBase: Kunstwerk[];
  formaatLabels: Record<Exclude<KunstwerkFormaat, 'alle'>, string>;
  stijlen: Stijl[] | null;
  stijlFilters: Set<string>;
  onToggleStijl: (stijlId: string) => void;
  stijlCountBase: Kunstwerk[];
  onderwerpen: Onderwerp[] | null;
  onderwerpFilters: Set<string>;
  onToggleOnderwerp: (onderwerpId: string) => void;
  onderwerpCountBase: Kunstwerk[];
  aiGegenereerdFilter: boolean;
  onAiGegenereerdFilterChange: (checked: boolean) => void;
}

export function FiltersPanelContent({
  segmenten,
  activeFilter,
  onSelectFilter,
  segmentCountBase,
  kunstenaars,
  kunstenaarFilter,
  onKunstenaarFilterChange,
  formaatFilters,
  onToggleFormaat,
  formaatCountBase,
  formaatLabels,
  stijlen,
  stijlFilters,
  onToggleStijl,
  stijlCountBase,
  onderwerpen,
  onderwerpFilters,
  onToggleOnderwerp,
  onderwerpCountBase,
  aiGegenereerdFilter,
  onAiGegenereerdFilterChange,
}: FiltersPanelContentProps) {
  const t = useTranslations('collectionsPage');

  return (
    <>
      <FilterSection title={t('collectieFacetTitle')} testId="collectie">
        <div className="flex flex-col gap-2">
          <button
            type="button"
            data-testid="filter-all"
            aria-pressed={activeFilter === ALL_FILTER}
            onClick={() => onSelectFilter(ALL_FILTER)}
            className={filterButtonClass(activeFilter === ALL_FILTER)}
          >
            {t('filterAll')} ({segmentCountBase.length})
          </button>
          {segmenten.map((segment) => (
            <button
              key={segment.id}
              type="button"
              data-testid={`filter-${segment.id}`}
              aria-pressed={activeFilter === segment.id}
              onClick={() => onSelectFilter(segment.id)}
              className={filterButtonClass(activeFilter === segment.id)}
            >
              {segment.omschrijving} (
              {segmentCountBase.filter((kunstwerk) => kunstwerk.segmentIds.includes(segment.id)).length})
            </button>
          ))}
        </div>
      </FilterSection>

      <FilterSection title={t('kunstenaarFacetTitle')} testId="kunstenaar">
        <Combobox
          options={(kunstenaars ?? []).map((kunstenaar) => ({ value: kunstenaar.id, label: kunstenaar.naam }))}
          value={kunstenaarFilter}
          onChange={onKunstenaarFilterChange}
          placeholder={t('kunstenaarFilterPlaceholder')}
          noResultsLabel={t('kunstenaarFilterNoResults')}
          clearLabel={t('kunstenaarFilterClear')}
          testId="kunstenaar-filter"
        />
      </FilterSection>

      <FilterSection title={t('formaatFacetTitle')} testId="formaat">
        {FORMAAT_OPTIES.map((formaat) => {
          const isChecked = formaatFilters.has(formaat);
          const count = formaatCountBase.filter(
            (kunstwerk) => kunstwerk.formaat === formaat || kunstwerk.formaat === 'alle'
          ).length;
          return (
            <label
              key={formaat}
              data-testid={`facet-formaat-option-${formaat}`}
              className="flex cursor-pointer items-center gap-2 text-xs text-white/70"
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => onToggleFormaat(formaat)}
                className="h-3.5 w-3.5 accent-gold"
              />
              <span className={isChecked ? 'text-white' : ''}>{formaatLabels[formaat]}</span>
              <span className="ml-auto text-[11px] text-white/40">{count}</span>
            </label>
          );
        })}
      </FilterSection>

      <FilterSection title={t('stijlFacetTitle')} testId="stijl">
        {(stijlen ?? []).map((stijl) => {
          const isChecked = stijlFilters.has(stijl.id);
          const count = stijlCountBase.filter((kunstwerk) => (kunstwerk.stijlIds ?? []).includes(stijl.id)).length;
          return (
            <label
              key={stijl.id}
              data-testid={`facet-stijl-option-${stijl.id}`}
              className="flex cursor-pointer items-center gap-2 text-xs text-white/70"
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => onToggleStijl(stijl.id)}
                className="h-3.5 w-3.5 accent-gold"
              />
              <span className={isChecked ? 'text-white' : ''}>{stijl.omschrijving}</span>
              <span className="ml-auto text-[11px] text-white/40">{count}</span>
            </label>
          );
        })}
      </FilterSection>

      <FilterSection title={t('onderwerpFacetTitle')} testId="onderwerp">
        {(onderwerpen ?? []).map((onderwerp) => {
          const isChecked = onderwerpFilters.has(onderwerp.id);
          const count = onderwerpCountBase.filter((kunstwerk) => (kunstwerk.onderwerpIds ?? []).includes(onderwerp.id)).length;
          return (
            <label
              key={onderwerp.id}
              data-testid={`facet-onderwerp-option-${onderwerp.id}`}
              className="flex cursor-pointer items-center gap-2 text-xs text-white/70"
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => onToggleOnderwerp(onderwerp.id)}
                className="h-3.5 w-3.5 accent-gold"
              />
              <span className={isChecked ? 'text-white' : ''}>{onderwerp.omschrijving}</span>
              <span className="ml-auto text-[11px] text-white/40">{count}</span>
            </label>
          );
        })}
      </FilterSection>

      <label className="flex cursor-pointer items-center gap-2 border-t border-white/10 pt-4 text-xs text-white/70">
        <input
          type="checkbox"
          checked={aiGegenereerdFilter}
          onChange={(event) => onAiGegenereerdFilterChange(event.target.checked)}
          data-testid="facet-ai-gegenereerd"
          className="h-3.5 w-3.5 accent-gold"
        />
        <span className={aiGegenereerdFilter ? 'text-white' : ''}>{t('aiGegenereerdFacetLabel')}</span>
      </label>
    </>
  );
}
```

- [ ] **Step 2: Werk de imports van `ProductsGrid.tsx` bij**

Vervang (regels 1-20):

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useApiCollection } from '@/lib/useApiCollection';
import { usePrijzenPerKunstwerk } from '@/lib/usePrijzenPerKunstwerk';
import { resolveKunstwerkOmschrijving } from '@/lib/resolveKunstwerkOmschrijving';
import { useCustomerAuth } from '@/lib/useCustomerAuth';
import { logActiviteit, actorFromCustomer } from '@/lib/logActiviteit';
import { ProductImage } from './ProductImage';
import { ProductModal } from './ProductModal';
import { Combobox } from './Combobox';
import { Breadcrumb } from './Breadcrumb';
import { FilterSection } from './FilterSection';
import { resolveKunstenaarOmschrijving } from '@/lib/resolveKunstenaarOmschrijving';
import type { Segment, Kunstwerk, Materiaal, Maat, Materiaalsoort, KunstwerkFormaat, Stijl, Onderwerp } from './beheer/materiaalTypes';
import type { Kunstenaar } from './beheer/kunstenaarTypes';

const ALL_FILTER = 'all';
```

door:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useApiCollection } from '@/lib/useApiCollection';
import { usePrijzenPerKunstwerk } from '@/lib/usePrijzenPerKunstwerk';
import { resolveKunstwerkOmschrijving } from '@/lib/resolveKunstwerkOmschrijving';
import { useCustomerAuth } from '@/lib/useCustomerAuth';
import { logActiviteit, actorFromCustomer } from '@/lib/logActiviteit';
import { ProductImage } from './ProductImage';
import { ProductModal } from './ProductModal';
import { Breadcrumb } from './Breadcrumb';
import { FiltersPanelContent, ALL_FILTER, FORMAAT_OPTIES } from './FiltersPanelContent';
import { resolveKunstenaarOmschrijving } from '@/lib/resolveKunstenaarOmschrijving';
import type { Segment, Kunstwerk, Materiaal, Maat, Materiaalsoort, KunstwerkFormaat, Stijl, Onderwerp } from './beheer/materiaalTypes';
import type { Kunstenaar } from './beheer/kunstenaarTypes';
```

- [ ] **Step 3: Verwijder `filterButtonClass` uit `ProductsGrid.tsx`**

Vervang:

```tsx
  function filterButtonClass(isActive: boolean) {
    return isActive
      ? 'rounded-full bg-silver px-4 py-1.5 text-xs font-head tracking-wide text-ink'
      : 'rounded-full border border-white/20 px-4 py-1.5 text-xs font-head tracking-wide text-white/70 hover:border-gold/40 hover:text-gold';
  }

  function handleSelect(kunstwerk: Kunstwerk) {
```

door:

```tsx
  function handleSelect(kunstwerk: Kunstwerk) {
```

- [ ] **Step 4: Verwijder de lokale `FORMAAT_OPTIES` in `ProductsGrid.tsx`**

Vervang:

```tsx
  const FORMAAT_OPTIES: Exclude<KunstwerkFormaat, 'alle'>[] = ['staand', 'liggend', 'vierkant'];
  const formaatLabels: Record<Exclude<KunstwerkFormaat, 'alle'>, string> = {
    staand: tCollections('formaatStaand'),
    liggend: tCollections('formaatLiggend'),
    vierkant: tCollections('formaatVierkant'),
  };
```

door:

```tsx
  const formaatLabels: Record<Exclude<KunstwerkFormaat, 'alle'>, string> = {
    staand: tCollections('formaatStaand'),
    liggend: tCollections('formaatLiggend'),
    vierkant: tCollections('formaatVierkant'),
  };
```

- [ ] **Step 5: Voeg `filtersPanelProps` toe en vervang de aside-inhoud**

Vervang:

```tsx
  return (
    <>
      <Breadcrumb items={breadcrumbItems} />
```

door:

```tsx
  const filtersPanelProps = {
    segmenten: segmenten.items,
    activeFilter,
    onSelectFilter: setActiveFilter,
    segmentCountBase,
    kunstenaars: kunstenaars.items,
    kunstenaarFilter,
    onKunstenaarFilterChange: setKunstenaarFilter,
    formaatFilters,
    onToggleFormaat: toggleFormaat,
    formaatCountBase,
    formaatLabels,
    stijlen: stijlen.items,
    stijlFilters,
    onToggleStijl: toggleStijl,
    stijlCountBase,
    onderwerpen: onderwerpen.items,
    onderwerpFilters,
    onToggleOnderwerp: toggleOnderwerp,
    onderwerpCountBase,
    aiGegenereerdFilter,
    onAiGegenereerdFilterChange: setAiGegenereerdFilter,
  };

  return (
    <>
      <Breadcrumb items={breadcrumbItems} />
```

En vervang de volledige inhoud van de `<aside>`:

```tsx
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
                {tCollections('filterAll')} ({segmentCountBase.length})
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
                  {segmentCountBase.filter((kunstwerk) => kunstwerk.segmentIds.includes(segment.id)).length})
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

          <FilterSection title={tCollections('formaatFacetTitle')} testId="formaat">
            {FORMAAT_OPTIES.map((formaat) => {
              const isChecked = formaatFilters.has(formaat);
              const count = formaatCountBase.filter(
                (kunstwerk) => kunstwerk.formaat === formaat || kunstwerk.formaat === 'alle'
              ).length;
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

          <FilterSection title={tCollections('stijlFacetTitle')} testId="stijl">
            {(stijlen.items ?? []).map((stijl) => {
              const isChecked = stijlFilters.has(stijl.id);
              const count = stijlCountBase.filter((kunstwerk) => (kunstwerk.stijlIds ?? []).includes(stijl.id)).length;
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

          <FilterSection title={tCollections('onderwerpFacetTitle')} testId="onderwerp">
            {(onderwerpen.items ?? []).map((onderwerp) => {
              const isChecked = onderwerpFilters.has(onderwerp.id);
              const count = onderwerpCountBase.filter((kunstwerk) => (kunstwerk.onderwerpIds ?? []).includes(onderwerp.id)).length;
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
        </aside>
```

door:

```tsx
        <aside className="flex flex-col">
          <FiltersPanelContent {...filtersPanelProps} />
        </aside>
```

- [ ] **Step 6: Run de regressiesuite en bevestig dat ze slaagt**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx`
Expected: PASS — alle bestaande tests slagen ongewijzigd (dit is een pure extractie, geen enkele test hoefde aangepast te worden).

- [ ] **Step 7: Commit**

```bash
git add src/components/FiltersPanelContent.tsx src/components/ProductsGrid.tsx
git commit -m "refactor: extract FiltersPanelContent from ProductsGrid"
```

---

### Task 4: Mobiel "Filters"-knop + uitschuifpaneel

**Files:**
- Modify: `src/components/ProductsGrid.tsx`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json`
- Test: `tests/components/ProductsGrid.test.tsx` (één nieuwe test toegevoegd)
- Test: Create `tests/components/ProductsGrid.mobile.test.tsx`

**Interfaces:**
- Consumes: `useIsDesktop()` (Task 2), `FiltersPanelContent`/`ALL_FILTER`/`FORMAAT_OPTIES` (Task 3), `Modal` met `closeButtonAriaLabel` (Task 1).
- Produces: op mobiel (`useIsDesktop()` is `false`) toont `ProductsGrid` een knop `data-testid="mobile-filters-toggle"` die een `Modal` opent met `FiltersPanelContent` erin; de footer-sluitknop van die modal toont `"Toon N resultaten"` en sluit het paneel; een `data-testid="mobile-clear-all-filters"`-knop in de footer wist alle filters zonder te sluiten.

- [ ] **Step 1: Voeg de vertaalsleutels toe aan alle 4 locale-bestanden**

In `messages/nl.json`, binnen `collectionsPage`, vervang:

```json
    "clearAllFilters": "Filters wissen",
    "removeFilterAria": "Verwijder filter {label}"
  },
```

door:

```json
    "clearAllFilters": "Filters wissen",
    "removeFilterAria": "Verwijder filter {label}",
    "mobileFiltersButtonLabel": "Filters",
    "mobileFiltersShowResults": "Toon {count, plural, one {# resultaat} other {# resultaten}}",
    "mobileFiltersCloseAria": "Paneel sluiten"
  },
```

In `messages/en.json`, vervang:

```json
    "clearAllFilters": "Clear filters",
    "removeFilterAria": "Remove filter {label}"
  },
```

door:

```json
    "clearAllFilters": "Clear filters",
    "removeFilterAria": "Remove filter {label}",
    "mobileFiltersButtonLabel": "Filters",
    "mobileFiltersShowResults": "Show {count, plural, one {# result} other {# results}}",
    "mobileFiltersCloseAria": "Close panel"
  },
```

In `messages/de.json`, vervang:

```json
    "clearAllFilters": "Filter zurücksetzen",
    "removeFilterAria": "Filter {label} entfernen"
  },
```

door:

```json
    "clearAllFilters": "Filter zurücksetzen",
    "removeFilterAria": "Filter {label} entfernen",
    "mobileFiltersButtonLabel": "Filter",
    "mobileFiltersShowResults": "{count, plural, one {# Ergebnis} other {# Ergebnisse}} anzeigen",
    "mobileFiltersCloseAria": "Panel schließen"
  },
```

In `messages/fr.json`, vervang:

```json
    "clearAllFilters": "Effacer les filtres",
    "removeFilterAria": "Supprimer le filtre {label}"
  },
```

door:

```json
    "clearAllFilters": "Effacer les filtres",
    "removeFilterAria": "Supprimer le filtre {label}",
    "mobileFiltersButtonLabel": "Filtres",
    "mobileFiltersShowResults": "Afficher {count, plural, one {# résultat} other {# résultats}}",
    "mobileFiltersCloseAria": "Fermer le panneau"
  },
```

- [ ] **Step 2: Schrijf de falende mobiele tests**

Maak `tests/components/ProductsGrid.mobile.test.tsx` aan:

```tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ProductsGrid } from '@/components/ProductsGrid';
import { CartProvider } from '@/lib/useCart';
import { CustomerAuthProvider } from '@/lib/useCustomerAuth';
import messages from '../../messages/nl.json';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: vi.fn(),
  actorFromCustomer: () => ({ id: null, email: 'Onbekend', naam: 'Onbekend' }),
}));

const SEGMENTEN = [
  { id: 'seg-hotel', omschrijving: 'Hotel' },
  { id: 'seg-wellness', omschrijving: 'Wellness' },
];
const KUNSTWERKEN = [
  {
    id: 'kw-1',
    foto: 'https://example.com/kw-1.jpg',
    naam: 'Kunstwerk 1',
    segmentIds: ['seg-hotel'],
    materiaalIds: ['mat-1'],
    maatIds: ['maat-1'],
    stijlIds: [],
    onderwerpIds: [],
    omschrijvingNl: 'Hotel paneel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
  {
    id: 'kw-2',
    foto: 'https://example.com/kw-2.jpg',
    naam: 'Kunstwerk 2',
    segmentIds: ['seg-wellness'],
    materiaalIds: ['mat-1'],
    maatIds: ['maat-1'],
    stijlIds: [],
    onderwerpIds: [],
    omschrijvingNl: 'Wellness paneel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
];

let collections: Record<string, unknown[]> = {};

function mockDesktopMediaQuery(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  );
}

function renderProductsGrid() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerAuthProvider>
        <CartProvider>
          <ProductsGrid />
        </CartProvider>
      </CustomerAuthProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  collections = {
    segmenten: SEGMENTEN,
    kunstwerken: KUNSTWERKEN,
    materialen: [],
    maten: [],
    materiaalsoorten: [],
    kunstenaars: [],
    stijlen: [],
    onderwerpen: [],
  };
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/auth/me?type=klant') {
      return { ok: true, json: async () => ({ user: null }) };
    }
    if (url === '/api/instellingen/bestelinstellingen') {
      return { ok: true, json: async () => null };
    }
    if (url === '/api/kunstwerken/prijzen') {
      return { ok: true, json: async () => ({}) };
    }
    const resource = url.replace(/^\/api\//, '');
    return { ok: true, json: async () => collections[resource] ?? [] };
  });
  mockDesktopMediaQuery(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProductsGrid on mobile', () => {
  it('shows the mobile filters toggle instead of the filter sidebar', async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    expect(screen.getByTestId('mobile-filters-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('filter-section-collectie')).not.toBeInTheDocument();
  });

  it('opens the filters panel with the same facet controls as desktop', async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    fireEvent.click(screen.getByTestId('mobile-filters-toggle'));
    expect(screen.getByTestId('modal')).toBeInTheDocument();
    expect(screen.getByTestId('filter-seg-hotel')).toBeInTheDocument();
  });

  it('filters live while the panel stays open, and shows the live count on the close button', async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    fireEvent.click(screen.getByTestId('mobile-filters-toggle'));

    fireEvent.click(screen.getByTestId('filter-seg-hotel'));
    expect(screen.getAllByTestId('product-card')).toHaveLength(1);
    expect(screen.getByTestId('modal-footer-close')).toHaveTextContent('Toon 1 resultaat');
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('closes the panel when the "Toon resultaten" button is clicked', async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    fireEvent.click(screen.getByTestId('mobile-filters-toggle'));
    fireEvent.click(screen.getByTestId('modal-footer-close'));
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('clears all filters from the panel without closing it', async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    fireEvent.click(screen.getByTestId('mobile-filters-toggle'));
    fireEvent.click(screen.getByTestId('filter-seg-hotel'));
    expect(screen.getAllByTestId('product-card')).toHaveLength(1);

    fireEvent.click(screen.getByTestId('mobile-clear-all-filters'));
    expect(screen.getAllByTestId('product-card')).toHaveLength(2);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('shows the active-filter count on the toggle button', async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    expect(screen.getByTestId('mobile-filters-toggle')).not.toHaveTextContent('(');

    fireEvent.click(screen.getByTestId('mobile-filters-toggle'));
    fireEvent.click(screen.getByTestId('filter-seg-hotel'));
    fireEvent.click(screen.getByTestId('modal-footer-close'));
    expect(screen.getByTestId('mobile-filters-toggle')).toHaveTextContent('(1)');
  });
});

describe('ProductsGrid switching between mobile and desktop', () => {
  it('resets the open filters panel so it does not silently reappear when returning to mobile', async () => {
    // Without the reset effect, mobileFiltersOpen would stay stale at `true` on desktop and reopen unprompted here.
    let changeHandler: (() => void) | undefined;
    const mediaQueryList = {
      matches: false,
      addEventListener: (_event: string, handler: () => void) => {
        changeHandler = handler;
      },
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mediaQueryList));

    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    fireEvent.click(screen.getByTestId('mobile-filters-toggle'));
    expect(screen.getByTestId('modal')).toBeInTheDocument();

    mediaQueryList.matches = true;
    act(() => {
      changeHandler?.();
    });
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
    expect(screen.getByTestId('filter-section-collectie')).toBeInTheDocument();

    mediaQueryList.matches = false;
    act(() => {
      changeHandler?.();
    });
    expect(screen.getByTestId('mobile-filters-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });
});
```

Voeg ook, aan het bestaande `tests/components/ProductsGrid.test.tsx`, een regressietest toe voor het desktop-pad. Vervang het einde van het bestand:

```tsx
    fireEvent.click(screen.getByTestId('facet-formaat-option-staand'));
    fireEvent.click(screen.getByTestId('facet-formaat-option-vierkant'));
    expect(screen.getAllByTestId('product-card')).toHaveLength(2); // kw-3 and kw-alle both match
  });
});
```

door:

```tsx
    fireEvent.click(screen.getByTestId('facet-formaat-option-staand'));
    fireEvent.click(screen.getByTestId('facet-formaat-option-vierkant'));
    expect(screen.getAllByTestId('product-card')).toHaveLength(2); // kw-3 and kw-alle both match
  });

  it('does not show the mobile filters toggle on desktop', async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    expect(screen.queryByTestId('mobile-filters-toggle')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run de nieuwe tests en bevestig dat ze falen**

Run: `npx vitest run tests/components/ProductsGrid.mobile.test.tsx tests/components/ProductsGrid.test.tsx`
Expected: FAIL — `mobile-filters-toggle` bestaat nog niet.

- [ ] **Step 4: Werk de imports en state van `ProductsGrid.tsx` bij**

Vervang:

```tsx
import { ProductImage } from './ProductImage';
import { ProductModal } from './ProductModal';
import { Breadcrumb } from './Breadcrumb';
import { FiltersPanelContent, ALL_FILTER, FORMAAT_OPTIES } from './FiltersPanelContent';
import { resolveKunstenaarOmschrijving } from '@/lib/resolveKunstenaarOmschrijving';
```

door:

```tsx
import { ProductImage } from './ProductImage';
import { ProductModal } from './ProductModal';
import { Modal } from './Modal';
import { Breadcrumb } from './Breadcrumb';
import { FiltersPanelContent, ALL_FILTER, FORMAAT_OPTIES } from './FiltersPanelContent';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { resolveKunstenaarOmschrijving } from '@/lib/resolveKunstenaarOmschrijving';
```

Vervang:

```tsx
  const [selectedKunstwerk, setSelectedKunstwerk] = useState<Kunstwerk | null>(null);
  const { user } = useCustomerAuth();

  useEffect(() => {
    setActiveFilter(segmentParam ?? ALL_FILTER);
  }, [segmentParam]);
```

door:

```tsx
  const [selectedKunstwerk, setSelectedKunstwerk] = useState<Kunstwerk | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const { user } = useCustomerAuth();
  const isDesktop = useIsDesktop();

  useEffect(() => {
    setActiveFilter(segmentParam ?? ALL_FILTER);
  }, [segmentParam]);

  useEffect(() => {
    if (isDesktop) {
      setMobileFiltersOpen(false);
    }
  }, [isDesktop]);
```

- [ ] **Step 5: Herstructureer de return-JSX van `ProductsGrid.tsx`**

Vervang het volledige blok vanaf `const filtersPanelProps` tot en met het einde van de functie:

```tsx
  const filtersPanelProps = {
    segmenten: segmenten.items,
    activeFilter,
    onSelectFilter: setActiveFilter,
    segmentCountBase,
    kunstenaars: kunstenaars.items,
    kunstenaarFilter,
    onKunstenaarFilterChange: setKunstenaarFilter,
    formaatFilters,
    onToggleFormaat: toggleFormaat,
    formaatCountBase,
    formaatLabels,
    stijlen: stijlen.items,
    stijlFilters,
    onToggleStijl: toggleStijl,
    stijlCountBase,
    onderwerpen: onderwerpen.items,
    onderwerpFilters,
    onToggleOnderwerp: toggleOnderwerp,
    onderwerpCountBase,
    aiGegenereerdFilter,
    onAiGegenereerdFilterChange: setAiGegenereerdFilter,
  };

  return (
    <>
      <Breadcrumb items={breadcrumbItems} />

      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="flex flex-col">
          <FiltersPanelContent {...filtersPanelProps} />
        </aside>

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
                  <ProductImage src={kunstwerk.foto} alt={omschrijving} className="h-full w-full" fit="contain" />
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
        </div>
      </div>

      <ProductModal
        kunstwerk={selectedKunstwerk}
        prijzen={(selectedKunstwerk && prijzenPerKunstwerk?.[selectedKunstwerk.id]) ?? []}
        materialen={materialen.items}
        maten={maten.items}
        materiaalsoorten={materiaalsoorten.items}
        kunstenaars={kunstenaars.items}
        segmenten={segmenten.items}
        stijlen={stijlen.items}
        onderwerpen={onderwerpen.items}
        onClose={() => setSelectedKunstwerk(null)}
      />
    </>
  );
}
```

door:

```tsx
  const filtersPanelProps = {
    segmenten: segmenten.items,
    activeFilter,
    onSelectFilter: setActiveFilter,
    segmentCountBase,
    kunstenaars: kunstenaars.items,
    kunstenaarFilter,
    onKunstenaarFilterChange: setKunstenaarFilter,
    formaatFilters,
    onToggleFormaat: toggleFormaat,
    formaatCountBase,
    formaatLabels,
    stijlen: stijlen.items,
    stijlFilters,
    onToggleStijl: toggleStijl,
    stijlCountBase,
    onderwerpen: onderwerpen.items,
    onderwerpFilters,
    onToggleOnderwerp: toggleOnderwerp,
    onderwerpCountBase,
    aiGegenereerdFilter,
    onAiGegenereerdFilterChange: setAiGegenereerdFilter,
  };

  const resultsSection = (
    <>
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
              <ProductImage src={kunstwerk.foto} alt={omschrijving} className="h-full w-full" fit="contain" />
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
    </>
  );

  return (
    <>
      <Breadcrumb items={breadcrumbItems} />

      {isDesktop ? (
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="flex flex-col">
            <FiltersPanelContent {...filtersPanelProps} />
          </aside>

          <div>{resultsSection}</div>
        </div>
      ) : (
        <div className="mx-auto max-w-5xl">
          <button
            type="button"
            data-testid="mobile-filters-toggle"
            onClick={() => setMobileFiltersOpen(true)}
            className="sticky top-20 z-10 mb-4 w-full rounded-full border border-white/20 bg-charcoal/95 px-4 py-2 text-xs font-head tracking-wide text-white/80 backdrop-blur-sm hover:border-gold/40 hover:text-gold"
          >
            {tCollections('mobileFiltersButtonLabel')}
            {activeChips.length > 0 ? ` (${activeChips.length})` : ''}
          </button>

          <div>{resultsSection}</div>

          <Modal
            isOpen={mobileFiltersOpen}
            onClose={() => setMobileFiltersOpen(false)}
            title={tCollections('mobileFiltersButtonLabel')}
            closeLabel={tCollections('mobileFiltersShowResults', { count: visibleKunstwerken.length })}
            closeButtonAriaLabel={tCollections('mobileFiltersCloseAria')}
            footerActions={
              activeChips.length > 0 ? (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  data-testid="mobile-clear-all-filters"
                  className="text-xs text-gold hover:text-gold-bright"
                >
                  {tCollections('clearAllFilters')}
                </button>
              ) : undefined
            }
          >
            <FiltersPanelContent {...filtersPanelProps} />
          </Modal>
        </div>
      )}

      <ProductModal
        kunstwerk={selectedKunstwerk}
        prijzen={(selectedKunstwerk && prijzenPerKunstwerk?.[selectedKunstwerk.id]) ?? []}
        materialen={materialen.items}
        maten={maten.items}
        materiaalsoorten={materiaalsoorten.items}
        kunstenaars={kunstenaars.items}
        segmenten={segmenten.items}
        stijlen={stijlen.items}
        onderwerpen={onderwerpen.items}
        onClose={() => setSelectedKunstwerk(null)}
      />
    </>
  );
}
```

- [ ] **Step 6: Run alle tests van deze taak en bevestig dat ze slagen**

Run: `npx vitest run tests/components/ProductsGrid.mobile.test.tsx tests/components/ProductsGrid.test.tsx tests/components/Modal.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/ProductsGrid.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json tests/components/ProductsGrid.test.tsx tests/components/ProductsGrid.mobile.test.tsx
git commit -m "feat: show mobile collection filters behind a toggle + slide-out panel"
```

---

### Task 5: Volledige regressiecheck

**Files:** geen wijzigingen — alleen verificatie.

**Interfaces:** n.v.t.

- [ ] **Step 1: Run de volledige testsuite**

Run: `npm test`
Expected: PASS — alle testbestanden in het project, inclusief de nieuwe en gewijzigde uit Tasks 1-4.

- [ ] **Step 2: Run de linter**

Run: `npm run lint`
Expected: geen nieuwe fouten of waarschuwingen in de gewijzigde/aangemaakte bestanden.

- [ ] **Step 3: Commit (alleen indien Step 1 of 2 nog wijzigingen opleverde)**

Als lint of tests aanpassingen vereisten, commit die apart:

```bash
git add -A
git commit -m "fix: address lint/test findings from mobile filters panel review"
```

Als er niets te committen valt, sla deze stap over.
