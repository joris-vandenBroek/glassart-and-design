'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useApiCollection } from '@/lib/useApiCollection';
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

export function ProductsGrid() {
  const locale = useLocale();
  const tCollections = useTranslations('collectionsPage');
  const searchParams = useSearchParams();
  const segmentParam = searchParams.get('segment');
  const [activeFilter, setActiveFilter] = useState(segmentParam ?? ALL_FILTER);
  const [kunstenaarFilter, setKunstenaarFilter] = useState<string | null>(null);
  const [formaatFilters, setFormaatFilters] = useState<Set<Exclude<KunstwerkFormaat, 'alle'>>>(new Set());
  const [stijlFilters, setStijlFilters] = useState<Set<string>>(new Set());
  const [onderwerpFilters, setOnderwerpFilters] = useState<Set<string>>(new Set());
  const [aiGegenereerdFilter, setAiGegenereerdFilter] = useState(false);
  const [selectedKunstwerk, setSelectedKunstwerk] = useState<Kunstwerk | null>(null);
  const { user } = useCustomerAuth();

  useEffect(() => {
    setActiveFilter(segmentParam ?? ALL_FILTER);
  }, [segmentParam]);

  const segmenten = useApiCollection<Segment>('segmenten');
  const kunstwerken = useApiCollection<Kunstwerk>('kunstwerken');
  const materialen = useApiCollection<Materiaal>('materialen');
  const maten = useApiCollection<Maat>('maten');
  const materiaalsoorten = useApiCollection<Materiaalsoort>('materiaalsoorten');
  const kunstenaars = useApiCollection<Kunstenaar>('kunstenaars');
  const stijlen = useApiCollection<Stijl>('stijlen');
  const onderwerpen = useApiCollection<Onderwerp>('onderwerpen');

  if (segmenten.items === null || kunstwerken.items === null) {
    return null;
  }

  const allKunstwerken = kunstwerken.items;

  function matchesSegment(kunstwerk: Kunstwerk) {
    return activeFilter === ALL_FILTER || kunstwerk.segmentIds.includes(activeFilter);
  }
  function matchesFormaat(kunstwerk: Kunstwerk) {
    return (
      formaatFilters.size === 0 ||
      kunstwerk.formaat === 'alle' ||
      (kunstwerk.formaat != null && formaatFilters.has(kunstwerk.formaat))
    );
  }
  function matchesStijl(kunstwerk: Kunstwerk) {
    return stijlFilters.size === 0 || (kunstwerk.stijlIds ?? []).some((id) => stijlFilters.has(id));
  }
  function matchesOnderwerp(kunstwerk: Kunstwerk) {
    return onderwerpFilters.size === 0 || (kunstwerk.onderwerpIds ?? []).some((id) => onderwerpFilters.has(id));
  }
  function matchesAiGegenereerd(kunstwerk: Kunstwerk) {
    return !aiGegenereerdFilter || kunstwerk.aiGegenereerd === true;
  }
  function matchesKunstenaar(kunstwerk: Kunstwerk) {
    return kunstenaarFilter === null || kunstwerk.kunstenaarId === kunstenaarFilter;
  }

  const visibleKunstwerken = allKunstwerken.filter(
    (kunstwerk) =>
      matchesSegment(kunstwerk) &&
      matchesFormaat(kunstwerk) &&
      matchesStijl(kunstwerk) &&
      matchesOnderwerp(kunstwerk) &&
      matchesAiGegenereerd(kunstwerk) &&
      matchesKunstenaar(kunstwerk)
  );

  const segmentCountBase = allKunstwerken.filter(
    (kunstwerk) =>
      matchesFormaat(kunstwerk) && matchesStijl(kunstwerk) && matchesOnderwerp(kunstwerk) && matchesAiGegenereerd(kunstwerk) && matchesKunstenaar(kunstwerk)
  );
  const formaatCountBase = allKunstwerken.filter(
    (kunstwerk) =>
      matchesSegment(kunstwerk) && matchesStijl(kunstwerk) && matchesOnderwerp(kunstwerk) && matchesAiGegenereerd(kunstwerk) && matchesKunstenaar(kunstwerk)
  );
  const stijlCountBase = allKunstwerken.filter(
    (kunstwerk) =>
      matchesSegment(kunstwerk) && matchesFormaat(kunstwerk) && matchesOnderwerp(kunstwerk) && matchesAiGegenereerd(kunstwerk) && matchesKunstenaar(kunstwerk)
  );
  const onderwerpCountBase = allKunstwerken.filter(
    (kunstwerk) =>
      matchesSegment(kunstwerk) && matchesFormaat(kunstwerk) && matchesStijl(kunstwerk) && matchesAiGegenereerd(kunstwerk) && matchesKunstenaar(kunstwerk)
  );

  const geselecteerdeKunstenaar = kunstenaarFilter
    ? (kunstenaars.items ?? []).find((kunstenaar) => kunstenaar.id === kunstenaarFilter) ?? null
    : null;

  function filterButtonClass(isActive: boolean) {
    return isActive
      ? 'rounded-full bg-silver px-4 py-1.5 text-xs font-head tracking-wide text-ink'
      : 'rounded-full border border-white/20 px-4 py-1.5 text-xs font-head tracking-wide text-white/70 hover:border-gold/40 hover:text-gold';
  }

  function handleSelect(kunstwerk: Kunstwerk) {
    setSelectedKunstwerk(kunstwerk);
    if (user) {
      void logActiviteit('kunstwerk_bekeken', actorFromCustomer(user), kunstwerk.naam);
    }
  }

  function toggleFormaat(formaat: Exclude<KunstwerkFormaat, 'alle'>) {
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

  const FORMAAT_OPTIES: Exclude<KunstwerkFormaat, 'alle'>[] = ['staand', 'liggend', 'vierkant'];
  const formaatLabels: Record<Exclude<KunstwerkFormaat, 'alle'>, string> = {
    staand: tCollections('formaatStaand'),
    liggend: tCollections('formaatLiggend'),
    vierkant: tCollections('formaatVierkant'),
  };

  const geselecteerdSegment =
    activeFilter === ALL_FILTER ? null : segmenten.items.find((segment) => segment.id === activeFilter) ?? null;

  const breadcrumbItems = [
    { label: tCollections('breadcrumbHome'), href: '/' },
    geselecteerdSegment
      ? { label: tCollections('title'), href: '/collecties' }
      : { label: tCollections('title') },
    ...(geselecteerdSegment ? [{ label: geselecteerdSegment.omschrijving }] : []),
  ];

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
