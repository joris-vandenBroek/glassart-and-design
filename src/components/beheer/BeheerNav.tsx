'use client';

import { useTranslations } from 'next-intl';

export type BeheerSection =
  | 'klanten'
  | 'bestellingen'
  | 'materiaalsoorten'
  | 'materialen'
  | 'maten'
  | 'segmenten'
  | 'kunstwerken'
  | 'prijsgroepen'
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
  kunstwerkenCount: number;
  prijsgroepenCount: number;
  activiteitCount: number;
}

const ACTIVE_ITEMS: { id: BeheerSection; labelKey: string }[] = [
  { id: 'klanten', labelKey: 'navKlanten' },
  { id: 'bestellingen', labelKey: 'navBestellingen' },
  { id: 'materiaalsoorten', labelKey: 'navMateriaalsoorten' },
  { id: 'materialen', labelKey: 'navMaterialen' },
  { id: 'maten', labelKey: 'navMaten' },
  { id: 'segmenten', labelKey: 'navSegmenten' },
  { id: 'kunstwerken', labelKey: 'navKunstwerken' },
  { id: 'prijsgroepen', labelKey: 'navPrijsgroepen' },
  { id: 'activiteit', labelKey: 'navActiviteit' },
  { id: 'glassartDesign', labelKey: 'navGlassartDesign' },
  { id: 'instellingen', labelKey: 'navInstellingen' },
];

const DISABLED_ITEMS: { id: string; labelKey: string }[] = [];

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
  kunstwerkenCount,
  prijsgroepenCount,
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
    kunstwerken: kunstwerkenCount,
    prijsgroepen: prijsgroepenCount,
    activiteit: activiteitCount,
  };

  return (
    <nav data-testid="beheer-nav" className="flex flex-col gap-1 text-xs tracking-wide">
      {ACTIVE_ITEMS.map((item) => (
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
      ))}
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
