# Beheer nav "Stamgegevens" groep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Groepeer 7 weinig-gewijzigde catalogustabellen (Materiaalsoorten, Materialen, Maten, Segmenten, Stijlen, Onderwerpen, Prijsgroepen) onder één uitklapbaar "Stamgegevens"-item in het beheermenu, standaard dicht.

**Architecture:** `BeheerNav.tsx` krijgt lokale open/dicht-state voor de nieuwe groep. Gegroepeerde items blijven altijd in de DOM (voor testbaarheid en om alle bestaande `BeheerShell`-tests ongewijzigd te laten werken) maar krijgen het native HTML `hidden`-attribuut wanneer de groep dicht is. Een `useEffect` forceert de groep open zodra `activeSection` een gegroepeerd item is. Geen wijziging aan `BeheerShell.tsx` — het `activeSection`/`onSelect`-contract blijft gelijk.

**Tech Stack:** Next.js 14, React, TypeScript, Tailwind, `next-intl`, Vitest + Testing Library.

## Global Constraints

- Menu-item naam: exact "Stamgegevens" (i18n key `beheer.navStamgegevens`).
- Gegroepeerde items, in deze volgorde: Materiaalsoorten, Materialen, Maten, Segmenten, Stijlen, Onderwerpen, Prijsgroepen.
- Drukkers, Glassart and Design en Instellingen blijven top-level (niet groeperen).
- Groep staat standaard dicht bij elke mount, tenzij `activeSection` een gegroepeerd item is.
- Groep opent automatisch (nooit automatisch sluiten) zodra `activeSection` van buitenaf verandert naar een gegroepeerd item.
- Bestaande `data-testid`'s per item (`beheer-nav-materiaalsoorten`, etc.) blijven ongewijzigd.
- Geen wijziging aan `BeheerShell.tsx`.

---

### Task 1: Collapsible "Stamgegevens" groep in BeheerNav

**Files:**
- Modify: `messages/nl.json:296` (nieuwe i18n key)
- Modify: `src/components/beheer/BeheerNav.tsx` (volledige herstructurering van de item-rendering)
- Test: `tests/components/beheer/BeheerNav.test.tsx` (nieuwe tests toevoegen)

**Interfaces:**
- Consumes: bestaande `BeheerNavProps` (ongewijzigd — geen nieuwe props nodig, groep-state is puur lokaal in `BeheerNav`).
- Produces: geen nieuwe exports. Nieuwe `data-testid`'s: `beheer-nav-group-stamgegevens` (toggle-knop) en `beheer-nav-group-stamgegevens-items` (container met de 7 gegroepeerde knoppen).

- [ ] **Step 1: Voeg de i18n-key toe**

In `messages/nl.json`, direct na regel 296 (`"navBestellingen": "Bestellingen",`), voeg toe:

```json
    "navStamgegevens": "Stamgegevens",
```

- [ ] **Step 2: Schrijf de falende tests**

Voeg in `tests/components/beheer/BeheerNav.test.tsx` de volgende `it`-blokken toe binnen de bestaande `describe('BeheerNav', ...)`, na de laatste bestaande `it` (`'renders a badge with count of 0'`):

```tsx
  it('keeps the Stamgegevens group closed by default and toggles it open/closed on click', () => {
    renderNav();
    const toggle = screen.getByTestId('beheer-nav-group-stamgegevens');
    const items = screen.getByTestId('beheer-nav-group-stamgegevens-items');
    expect(toggle).toHaveTextContent('Stamgegevens');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(items).not.toBeVisible();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(items).toBeVisible();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(items).not.toBeVisible();
  });

  it('auto-opens the Stamgegevens group when the active section is inside it', () => {
    renderNav('segmenten');
    expect(screen.getByTestId('beheer-nav-group-stamgegevens')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('beheer-nav-group-stamgegevens-items')).toBeVisible();
  });

  it('does not auto-open the Stamgegevens group for a top-level active section', () => {
    renderNav('drukkers');
    expect(screen.getByTestId('beheer-nav-group-stamgegevens')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('beheer-nav-group-stamgegevens-items')).not.toBeVisible();
  });

  it('renders all 7 grouped items inside the Stamgegevens group with their counters', () => {
    renderNav();
    const items = screen.getByTestId('beheer-nav-group-stamgegevens-items');
    expect(items).toContainElement(screen.getByTestId('beheer-nav-materiaalsoorten'));
    expect(items).toContainElement(screen.getByTestId('beheer-nav-materialen'));
    expect(items).toContainElement(screen.getByTestId('beheer-nav-maten'));
    expect(items).toContainElement(screen.getByTestId('beheer-nav-segmenten'));
    expect(items).toContainElement(screen.getByTestId('beheer-nav-stijlen'));
    expect(items).toContainElement(screen.getByTestId('beheer-nav-onderwerpen'));
    expect(items).toContainElement(screen.getByTestId('beheer-nav-prijsgroepen'));
  });

  it('keeps Drukkers, Glassart and Design and Instellingen outside the Stamgegevens group', () => {
    renderNav();
    const items = screen.getByTestId('beheer-nav-group-stamgegevens-items');
    expect(items).not.toContainElement(screen.getByTestId('beheer-nav-drukkers'));
    expect(items).not.toContainElement(screen.getByTestId('beheer-nav-glassartDesign'));
    expect(items).not.toContainElement(screen.getByTestId('beheer-nav-instellingen'));
  });
```

- [ ] **Step 3: Bevestig dat de nieuwe tests falen**

Run: `npx vitest run tests/components/beheer/BeheerNav.test.tsx`
Expected: FAIL — `Unable to find an element by: [data-testid="beheer-nav-group-stamgegevens"]` voor de nieuwe tests. De bestaande tests (ervoor in het bestand) slagen nog steeds.

- [ ] **Step 4: Herstructureer BeheerNav.tsx**

Vervang de volledige inhoud van `src/components/beheer/BeheerNav.tsx` door:

```tsx
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

  const [stamgegevensOpen, setStamgegevensOpen] = useState(() =>
    GROUPED_ITEMS.some((item) => item.id === activeSection)
  );

  useEffect(() => {
    if (GROUPED_ITEMS.some((item) => item.id === activeSection)) {
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
        data-testid="beheer-nav-group-stamgegevens-items"
        hidden={!stamgegevensOpen}
        className="ml-2 flex flex-col gap-1 border-l border-white/10 pl-2"
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
```

- [ ] **Step 5: Bevestig dat alle tests slagen**

Run: `npx vitest run tests/components/beheer/BeheerNav.test.tsx`
Expected: PASS — alle bestaande en nieuwe tests groen.

- [ ] **Step 6: Commit**

```bash
git add messages/nl.json src/components/beheer/BeheerNav.tsx tests/components/beheer/BeheerNav.test.tsx
git commit -m "feat: collapsible Stamgegevens group in beheer nav"
```

---

### Task 2: BeheerShell integratietest voor auto-open gedrag

**Files:**
- Modify: `tests/components/beheer/BeheerShell.test.tsx`

**Interfaces:**
- Consumes: `beheer-nav-group-stamgegevens-items` en `beheer-nav-materiaalsoorten` `data-testid`'s uit Task 1.
- Produces: geen nieuwe interfaces — dit is een end-to-end regressiecheck bovenop bestaand gedrag.

- [ ] **Step 1: Schrijf de falende test**

Voeg in `tests/components/beheer/BeheerShell.test.tsx` toe, direct na de bestaande test `'shows the materiaalsoorten count and switches to the Materiaalsoorten section'` (rond regel 211-223):

```tsx
  it('opens the Stamgegevens nav group when switching to a grouped section like Materiaalsoorten', async () => {
    mockCollections({
      materiaalsoorten: [
        { id: 'soort-1', omschrijving: 'Veiligheidsglas' },
        { id: 'soort-2', omschrijving: 'Dibond' },
      ],
    });
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-materiaalsoorten')).toHaveTextContent('2'));
    expect(screen.getByTestId('beheer-nav-group-stamgegevens-items')).not.toBeVisible();

    screen.getByTestId('beheer-nav-materiaalsoorten').click();
    expect(await screen.findByTestId('materiaalsoorten-section')).toBeInTheDocument();
    expect(screen.getByTestId('beheer-nav-group-stamgegevens-items')).toBeVisible();
  });
```

- [ ] **Step 2: Bevestig dat de nieuwe test faalt vóór Task 1**

(Alleen relevant als Task 2 los wordt uitgevoerd vóór Task 1 is gemerged — normaliter draait dit na Task 1, dan is deze stap een sanity check.)

Run: `npx vitest run tests/components/beheer/BeheerShell.test.tsx -t "opens the Stamgegevens nav group"`
Expected (vóór Task 1): FAIL — `Unable to find an element by: [data-testid="beheer-nav-group-stamgegevens-items"]`.
Expected (ná Task 1): direct PASS zonder verdere wijzigingen nodig — dit is dan de bevestigingsstap voor Step 3.

- [ ] **Step 3: Bevestig dat de volledige testfile slaagt**

Run: `npx vitest run tests/components/beheer/BeheerShell.test.tsx`
Expected: PASS — alle bestaande tests (die rechtstreeks op geneste `beheer-nav-*` testid's klikken, zoals materiaalsoorten/materialen/maten/segmenten/prijsgroepen) blijven slagen omdat die items altijd in de DOM staan, alleen met het `hidden`-attribuut wanneer de groep dicht is.

- [ ] **Step 4: Commit**

```bash
git add tests/components/beheer/BeheerShell.test.tsx
git commit -m "test: verify Stamgegevens nav group auto-opens via BeheerShell"
```
