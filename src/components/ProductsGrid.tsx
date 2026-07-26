'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useFirestoreCollection } from '@/lib/useFirestoreCollection';
import { resolveKunstwerkOmschrijving } from '@/lib/resolveKunstwerkOmschrijving';
import { useCustomerAuth } from '@/lib/useCustomerAuth';
import { logActiviteit, actorFromCustomer } from '@/lib/logActiviteit';
import { WatermarkedImage } from './WatermarkedImage';
import { ProductModal, materiaalLabel, maatLabel } from './ProductModal';
import { KunstwerkSpecCard } from './KunstwerkSpecCard';
import type { Segment, Kunstwerk, Materiaal, Maat, Materiaalsoort } from './beheer/materiaalTypes';
import type { Kunstenaar } from './beheer/kunstenaarTypes';

const ALL_FILTER = 'all';

export function ProductsGrid() {
  const locale = useLocale();
  const tCollections = useTranslations('collectionsPage');
  const [activeFilter, setActiveFilter] = useState(ALL_FILTER);
  const [selectedKunstwerk, setSelectedKunstwerk] = useState<Kunstwerk | null>(null);
  const { user } = useCustomerAuth();

  const segmenten = useFirestoreCollection<Segment>('segmenten');
  const kunstwerken = useFirestoreCollection<Kunstwerk>('kunstwerken');
  const materialen = useFirestoreCollection<Materiaal>('materialen');
  const maten = useFirestoreCollection<Maat>('maten');
  const materiaalsoorten = useFirestoreCollection<Materiaalsoort>('materiaalsoorten');
  const kunstenaars = useFirestoreCollection<Kunstenaar>('kunstenaars');

  if (segmenten.items === null || kunstwerken.items === null) {
    return null;
  }

  const allKunstwerken = kunstwerken.items;
  const visibleKunstwerken =
    activeFilter === ALL_FILTER
      ? allKunstwerken
      : allKunstwerken.filter((kunstwerk) => kunstwerk.segmentIds.includes(activeFilter));

  const materiaalsoortNaamById = new Map(
    (materiaalsoorten.items ?? []).map((soort) => [soort.id, soort.omschrijving])
  );
  const kunstenaarNaamById = new Map((kunstenaars.items ?? []).map((kunstenaar) => [kunstenaar.id, kunstenaar.naam]));

  function filterButtonClass(isActive: boolean) {
    return isActive
      ? 'rounded-full bg-silver px-4 py-1.5 text-xs font-head tracking-wide text-ink'
      : 'rounded-full border border-white/20 px-4 py-1.5 text-xs font-head tracking-wide text-white/70 hover:border-gold/40 hover:text-gold';
  }

  function handleSelect(kunstwerk: Kunstwerk) {
    setSelectedKunstwerk(kunstwerk);
    if (user) {
      void logActiviteit('kunstwerk_bekeken', actorFromCustomer(user));
    }
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

      <div
        data-testid="products-grid"
        className="mx-auto grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      >
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

      <ProductModal
        kunstwerk={selectedKunstwerk}
        materialen={materialen.items}
        maten={maten.items}
        materiaalsoorten={materiaalsoorten.items}
        onClose={() => setSelectedKunstwerk(null)}
      />
    </>
  );
}
