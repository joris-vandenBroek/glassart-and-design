'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

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
  | 'prijsmatrix'
  | 'drukkers'
  | 'activiteit'
  | 'glassartDesign'
  | 'instellingen';

interface BeheerNavProps {
  activeSection: BeheerSection;
  onSelect: (section: BeheerSection) => void;
  onLogout: () => void;
  klantenCount: number;
  bestellingenCount: number;
  materiaalsoortenCount: number;
  materialenCount: number;
  matenCount: number;
  segmentenCount: number;
  stijlenCount: number;
  onderwerpenCount: number;
  kunstwerkenCount: number;
  kunstenaarsCount: number;
  prijsgroepenCount: number;
  drukkersCount: number;
  activiteitCount: number;
}

type NavItem = { id: BeheerSection; labelKey: string };

const TOP_ITEMS_BEFORE_GROUP: NavItem[] = [
  { id: 'klanten', labelKey: 'navKlanten' },
  { id: 'bestellingen', labelKey: 'navBestellingen' },
];

const GROUPED_ITEMS: NavItem[] = [
  { id: 'materiaalsoorten', labelKey: 'navMateriaalsoorten' },
  { id: 'materialen', labelKey: 'navMaterialen' },
  { id: 'maten', labelKey: 'navMaten' },
  { id: 'segmenten', labelKey: 'navSegmenten' },
  { id: 'stijlen', labelKey: 'navStijlen' },
  { id: 'onderwerpen', labelKey: 'navOnderwerpen' },
  { id: 'prijsgroepen', labelKey: 'navPrijsgroepen' },
];

const TOP_ITEMS_AFTER_GROUP: NavItem[] = [
  { id: 'kunstwerken', labelKey: 'navKunstwerken' },
  { id: 'kunstenaars', labelKey: 'navKunstenaars' },
  { id: 'prijsmatrix', labelKey: 'navPrijsmatrix' },
  { id: 'drukkers', labelKey: 'navDrukkers' },
  { id: 'activiteit', labelKey: 'navActiviteit' },
  { id: 'glassartDesign', labelKey: 'navGlassartDesign' },
  { id: 'instellingen', labelKey: 'navInstellingen' },
];

const DISABLED_ITEMS: { id: string; labelKey: string }[] = [];

function isGroupedSection(section: BeheerSection) {
  return GROUPED_ITEMS.some((item) => item.id === section);
}

export function BeheerNav({
  activeSection,
  onSelect,
  onLogout,
  klantenCount,
  bestellingenCount,
  materiaalsoortenCount,
  materialenCount,
  matenCount,
  segmentenCount,
  stijlenCount,
  onderwerpenCount,
  kunstwerkenCount,
  kunstenaarsCount,
  prijsgroepenCount,
  drukkersCount,
  activiteitCount,
}: BeheerNavProps) {
  const t = useTranslations('beheer');
  const counts: Partial<Record<BeheerSection, number>> = {
    klanten: klantenCount,
    bestellingen: bestellingenCount,
    materiaalsoorten: materiaalsoortenCount,
    materialen: materialenCount,
    maten: matenCount,
    segmenten: segmentenCount,
    stijlen: stijlenCount,
    onderwerpen: onderwerpenCount,
    kunstwerken: kunstwerkenCount,
    kunstenaars: kunstenaarsCount,
    prijsgroepen: prijsgroepenCount,
    drukkers: drukkersCount,
    activiteit: activiteitCount,
  };

  const [stamgegevensOpen, setStamgegevensOpen] = useState(() => isGroupedSection(activeSection));

  useEffect(() => {
    if (isGroupedSection(activeSection)) {
      setStamgegevensOpen(true);
    }
  }, [activeSection]);

  function renderItem(item: NavItem) {
    return (
      <button
        key={item.id}
        type="button"
        data-testid={`beheer-nav-${item.id}`}
        aria-current={activeSection === item.id ? 'true' : undefined}
        onClick={() => onSelect(item.id)}
        className={`flex items-center justify-between rounded-sm px-3 py-2 text-left ${
          activeSection === item.id
            ? 'bg-white/15 text-white'
            : 'text-white/60 hover:bg-white/10 hover:text-white'
        }`}
      >
        <span>{t(item.labelKey)}</span>
        {counts[item.id] !== undefined && (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.65rem]">{counts[item.id]}</span>
        )}
      </button>
    );
  }

  return (
    <nav data-testid="beheer-nav" className="flex flex-col gap-1 text-xs tracking-wide">
      {TOP_ITEMS_BEFORE_GROUP.map(renderItem)}
      <button
        type="button"
        data-testid="beheer-nav-group-stamgegevens"
        aria-expanded={stamgegevensOpen}
        aria-controls="beheer-nav-group-stamgegevens-items"
        onClick={() => setStamgegevensOpen((current) => !current)}
        className="flex items-center justify-between rounded-sm px-3 py-2 text-left text-white/60 hover:bg-white/10 hover:text-white"
      >
        <span>{t('navStamgegevens')}</span>
        <span
          aria-hidden="true"
          className={`text-[10px] text-white/40 transition-transform ${stamgegevensOpen ? '' : '-rotate-90'}`}
        >
          &#9662;
        </span>
      </button>
      <div
        id="beheer-nav-group-stamgegevens-items"
        data-testid="beheer-nav-group-stamgegevens-items"
        hidden={!stamgegevensOpen}
        className={`ml-2 flex-col gap-1 border-l border-white/10 pl-2 ${stamgegevensOpen ? 'flex' : 'hidden'}`}
      >
        {GROUPED_ITEMS.map(renderItem)}
      </div>
      {TOP_ITEMS_AFTER_GROUP.map(renderItem)}
      {DISABLED_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          disabled
          data-testid={`beheer-nav-${item.id}`}
          className="cursor-not-allowed rounded-sm px-3 py-2 text-left text-white/30"
        >
          {t(item.labelKey)}
        </button>
      ))}
      <button
        type="button"
        data-testid="beheer-nav-logout"
        onClick={onLogout}
        className="mt-4 rounded-sm border border-white/20 px-3 py-2 text-left text-white/60 hover:bg-white/10 hover:text-white"
      >
        {t('logout')}
      </button>
    </nav>
  );
}
