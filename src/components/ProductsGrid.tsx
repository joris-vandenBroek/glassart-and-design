'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useApiCollection } from '@/lib/useApiCollection';
import { usePrijzenPerKunstwerk } from '@/lib/usePrijzenPerKunstwerk';
import { resolveKunstwerkOmschrijving } from '@/lib/resolveKunstwerkOmschrijving';
import { useCustomerAuth } from '@/lib/useCustomerAuth';
import { logActiviteit } from '@/lib/logActiviteit';
import { ProductImage } from './ProductImage';
import { ProductModal } from './ProductModal';
import { Modal } from './Modal';
import { Breadcrumb } from './Breadcrumb';
import { FiltersPanelContent, ALL_FILTER } from './FiltersPanelContent';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { resolveKunstenaarOmschrijving, appendKunstenaarWebsiteZin } from '@/lib/resolveKunstenaarOmschrijving';
import { resolveOmschrijving } from '@/lib/resolveOmschrijving';
import { LinkifiedText } from './LinkifiedText';
import type { Segment, Kunstwerk, Materiaal, Maat, Materiaalsoort, KunstwerkFormaat, Stijl, Onderwerp } from './beheer/materiaalTypes';
import type { Kunstenaar } from './beheer/kunstenaarTypes';

const CARD_ASPECT_CLASS: Record<Exclude<KunstwerkFormaat, 'alle'>, string> = {
  vierkant: 'aspect-square',
  staand: 'aspect-[3/4]',
  liggend: 'aspect-[4/3]',
};

function resolveCardAspectClass(formaat: KunstwerkFormaat | null | undefined): string {
  if (formaat && formaat in CARD_ASPECT_CLASS) {
    return CARD_ASPECT_CLASS[formaat as Exclude<KunstwerkFormaat, 'alle'>];
  }
  return CARD_ASPECT_CLASS.vierkant;
}

const CARDS_PER_ROW = 3;

function chunkIntoRows<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

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

  const segmenten = useApiCollection<Segment>('segmenten');
  const kunstwerken = useApiCollection<Kunstwerk>('kunstwerken');
  const materialen = useApiCollection<Materiaal>('materialen');
  const maten = useApiCollection<Maat>('maten');
  const materiaalsoorten = useApiCollection<Materiaalsoort>('materiaalsoorten');
  const kunstenaars = useApiCollection<Kunstenaar>('kunstenaars');
  const stijlen = useApiCollection<Stijl>('stijlen');
  const onderwerpen = useApiCollection<Onderwerp>('onderwerpen');
  const { prijzenPerKunstwerk } = usePrijzenPerKunstwerk();

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

  function handleSelect(kunstwerk: Kunstwerk) {
    setSelectedKunstwerk(kunstwerk);
    if (user) {
      void logActiviteit('kunstwerk_bekeken', kunstwerk.code);
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
    ...(geselecteerdSegment ? [{ label: resolveOmschrijving(geselecteerdSegment, locale) }] : []),
  ];

  const stijlNaamById = new Map((stijlen.items ?? []).map((stijl) => [stijl.id, resolveOmschrijving(stijl, locale)]));
  const onderwerpNaamById = new Map(
    (onderwerpen.items ?? []).map((onderwerp) => [onderwerp.id, resolveOmschrijving(onderwerp, locale)])
  );

  const activeChips: { key: string; label: string; onRemove: () => void }[] = [
    ...(geselecteerdSegment
      ? [{ key: 'segment', label: resolveOmschrijving(geselecteerdSegment, locale), onRemove: () => setActiveFilter(ALL_FILTER) }]
      : []),
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

  const filtersPanelProps = {
    segmenten: segmenten.items,
    locale,
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
            <LinkifiedText
              text={appendKunstenaarWebsiteZin(
                resolveKunstenaarOmschrijving(geselecteerdeKunstenaar, locale),
                geselecteerdeKunstenaar.website
                  ? tCollections('kunstenaarWebsiteZin', {
                      naam: geselecteerdeKunstenaar.naam,
                      website: geselecteerdeKunstenaar.website,
                    })
                  : null
              )}
              className="text-xs text-white/70"
            />
          </div>
        </div>
      )}

      <div data-testid="products-grid" className="flex flex-col gap-3">
        {chunkIntoRows(visibleKunstwerken, CARDS_PER_ROW).map((row, rowIndex) => (
          <div key={rowIndex} className="flex items-center gap-3">
            {row.map((kunstwerk) => {
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
                  className={`group relative flex-1 cursor-pointer overflow-hidden rounded border-2 border-gold/80 transition duration-300 hover:-translate-y-1 hover:border-gold hover:shadow-[0_8px_24px_rgba(212,175,55,0.25)] focus-visible:-translate-y-1 focus-visible:border-gold focus-visible:outline-none ${resolveCardAspectClass(kunstwerk.formaat)}`}
                >
                  <ProductImage src={kunstwerk.foto} alt={omschrijving} className="h-full w-full" fit="cover" />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-black/80 via-black/10 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
                  >
                    <p className="font-head text-xs italic leading-snug text-white line-clamp-3">{omschrijving}</p>
                  </div>
                </div>
              );
            })}
            {row.length < CARDS_PER_ROW &&
              Array.from({ length: CARDS_PER_ROW - row.length }).map((_, placeholderIndex) => (
                <div key={`placeholder-${placeholderIndex}`} aria-hidden="true" className="flex-1" />
              ))}
          </div>
        ))}
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
