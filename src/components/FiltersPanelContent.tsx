'use client';

import { useTranslations } from 'next-intl';
import { Combobox } from './Combobox';
import { FilterSection } from './FilterSection';
import { resolveOmschrijving } from '@/lib/resolveOmschrijving';
import type { Segment, Kunstwerk, KunstwerkFormaat, Stijl, Onderwerp } from './beheer/materiaalTypes';
import type { Kunstenaar } from './beheer/kunstenaarTypes';

export const ALL_FILTER = 'all';
const FORMAAT_OPTIES: Exclude<KunstwerkFormaat, 'alle'>[] = ['staand', 'liggend', 'vierkant'];

function filterButtonClass(isActive: boolean) {
  return isActive
    ? 'rounded-full bg-silver px-4 py-1.5 text-xs font-head tracking-wide text-ink'
    : 'rounded-full border border-white/20 px-4 py-1.5 text-xs font-head tracking-wide text-white/70 hover:border-gold/40 hover:text-gold';
}

interface FiltersPanelContentProps {
  segmenten: Segment[];
  locale: string;
  activeFilter: string;
  onSelectFilter: (segmentId: string) => void;
  segmentCountBase: Kunstwerk[];
  kunstenaars: Kunstenaar[] | null;
  kunstenaarFilter: string | null;
  onKunstenaarFilterChange: (kunstenaarnr: string | null) => void;
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
  locale,
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
              {resolveOmschrijving(segment, locale)} (
              {segmentCountBase.filter((kunstwerk) => kunstwerk.segmentIds.includes(segment.id)).length})
            </button>
          ))}
        </div>
      </FilterSection>

      <FilterSection title={t('kunstenaarFacetTitle')} testId="kunstenaar">
        <Combobox
          options={(kunstenaars ?? []).map((kunstenaar) => ({ value: kunstenaar.kunstenaarnr, label: kunstenaar.naam }))}
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

      <FilterSection title={t('stijlFacetTitle')} testId="stijl" defaultOpen={false}>
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
              <span className={isChecked ? 'text-white' : ''}>{resolveOmschrijving(stijl, locale)}</span>
              <span className="ml-auto text-[11px] text-white/40">{count}</span>
            </label>
          );
        })}
      </FilterSection>

      <FilterSection title={t('onderwerpFacetTitle')} testId="onderwerp" defaultOpen={false}>
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
              <span className={isChecked ? 'text-white' : ''}>{resolveOmschrijving(onderwerp, locale)}</span>
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
