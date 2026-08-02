# Mobiele collectiefilters in een uitschuifpaneel

**Datum:** 2026-08-02
**Status:** Goedgekeurd, klaar voor implementatieplan

## Aanleiding

Op de collectiepagina (`/collecties`, gerenderd door `ProductsGrid.tsx`) staan de filters
(collectie, kunstenaar, formaat, stijl, onderwerp, AI-gegenereerd) in een `<aside>` die op
desktop naast de kunstwerken-grid staat (`md:grid-cols-[220px_minmax(0,1fr)]`), maar op
mobiel (single-column) er volledig bóven komt te staan. Met 5 filter-secties die standaard
allemaal openstaan, moet een mobiele bezoeker eerst een lang stuk scrollen voordat er ook
maar één kunstwerk zichtbaar is. Doel van dit ontwerp: op mobiel direct de kunstwerken
tonen, met de filters achter een knop die een uitschuifpaneel opent.

## Scope

**In scope:**
- Extractie van de bestaande filterinhoud naar een gedeeld component `FiltersPanelContent`
- Een `useIsDesktop()`-hook (media query op de bestaande `md`-breakpoint, 768px)
- Mobiel gedrag: sticky "Filters (n)"-knop boven de grid, opent `FiltersPanelContent` in de
  bestaande `Modal.tsx`
- Kleine, backwards-compatible uitbreiding van `Modal.tsx` met een optionele
  `closeButtonAriaLabel`-prop (zie sectie 3)
- Desktop gedrag: ongewijzigd (filters altijd zichtbaar in de aside)
- Nieuwe vertaalsleutels in alle 4 locale-bestanden (nl/en/fr/de)
- Nieuwe tests voor het mobiele pad; bestaande tests blijven ongewijzigd

**Buiten scope:**
- Geen wijziging aan de filter-logica zelf (matches*-functies, tellingen, AND/OR-gedrag)
- Geen wijziging aan de rij met actieve filter-chips boven de grid (blijft ongewijzigd
  zichtbaar op beide breakpoints)
- Geen "geen resultaten"-melding in de grid — die ontbreekt nu ook al en blijft een
  losstaande, niet in dit ontwerp meegenomen leemte
- Geen wijziging aan de single-select "Collectie"-facet zelf, geen apart zichtbare
  quick-filter-chips buiten het paneel (optie die tijdens het brainstormen is afgewezen)

## 1. `FiltersPanelContent` — extractie

- Nieuw bestand `src/components/FiltersPanelContent.tsx`: bevat exact de huidige inhoud van
  de `<aside>` in `ProductsGrid.tsx` (regels 219–339: de vijf `FilterSection`-blokken plus
  de AI-gegenereerd-checkbox), ongewijzigd qua JSX, klassen en `data-testid`'s.
- Props: alle state en setters die dit blok nu al gebruikt (`activeFilter`,
  `setActiveFilter`, `kunstenaarFilter`, `setKunstenaarFilter`, `formaatFilters`,
  `toggleFormaat`, `stijlFilters`, `toggleStijl`, `onderwerpFilters`, `toggleOnderwerp`,
  `aiGegenereerdFilter`, `setAiGegenereerdFilter`, plus de opgehaalde collecties
  `segmenten`/`kunstenaars`/`stijlen`/`onderwerpen` en de `*CountBase`-berekeningen) en de
  vertaalfunctie `tCollections`. Zuivere prop-doorgifte, geen eigen state.
- Dit is een pure extractie: geen gedragswijziging op desktop.

## 2. `useIsDesktop()` — responsive detectie

- Nieuw bestand `src/lib/useIsDesktop.ts`. Gebruikt `window.matchMedia('(min-width: 768px)')`
  en luistert op het `change`-event zodat rotatie/resize tijdens de sessie wordt gevolgd.
- Valt terug op `true` (desktop) wanneer `window.matchMedia` niet bestaat (server-render,
  en de jsdom-testomgeving waar dit project geen `matchMedia`-polyfill heeft) — dit is
  bewust: de eerste client-render matcht zo de server-render (geen hydration-mismatch), én
  alle bestaande tests in `ProductsGrid.test.tsx` blijven vanzelf werken zonder mock, omdat
  ze de desktop-DOM-structuur te zien krijgen die ze nu al verwachten.

## 3. `ProductsGrid.tsx` — responsive rendering

- Nieuwe state: `const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)`.
- `const isDesktop = useIsDesktop()`.
- Als `isDesktop`: de aside rendert zoals nu, met `FiltersPanelContent` erin. Geen
  "Filters"-knop, geen modal.
- Als niet `isDesktop`: de aside vervalt. In plaats daarvan, direct boven
  `data-testid="products-grid"`, een sticky knop:
  - `data-testid="mobile-filters-toggle"`, tekst `tCollections('mobileFiltersButtonLabel')`
    + `(${activeChips.length})` wanneer er actieve filters zijn (anders zonder telling).
  - `onClick={() => setMobileFiltersOpen(true)}`.
- Wanneer `mobileFiltersOpen`: `<Modal isOpen title="Filters" onClose={() =>
  setMobileFiltersOpen(false)}>` met `FiltersPanelContent` als children.
  - `closeLabel` = `tCollections('mobileFiltersShowResults', { count: visibleKunstwerken.length })`
    — dit is de bestaande footer-sluitknop van `Modal.tsx`, hertaald tot "Toon N
    resultaten"; hij sluit gewoon het paneel (`onClose`), geen aparte "toepassen"-state
    nodig omdat filteren al live via gedeelde state gaat.
  - `Modal.tsx` gebruikt `closeLabel` nu ook als `aria-label` van de losse "×"-sluitknop
    rechtsboven (regel 66) — met "Toon N resultaten" als `closeLabel` zou die icoon-knop
    dezelfde tekst als aria-label krijgen, wat voor een screenreader-gebruiker verwarrend
    is voor een knop die alleen sluit. `Modal.tsx` krijgt daarom een nieuwe, optionele prop
    `closeButtonAriaLabel?: string` (valt terug op `closeLabel` wanneer niet meegegeven, dus
    geen wijziging voor bestaande aanroepen); het filterpaneel geeft hier expliciet
    `tCollections('mobileFiltersCloseAria')` ("Paneel sluiten") aan mee.
  - `footerActions`: de bestaande "Filters wissen"-knop (`clearAllFilters`), zichtbaar
    zodra `activeChips.length > 0`, blijft na klikken het paneel open houden (state wordt
    geleegd, teller in de sluitknop update live mee).
- Effect dat `mobileFiltersOpen` op `false` zet zodra `isDesktop` van `false` naar `true`
  wisselt (viewport groeit tijdens open paneel) — voorkomt een modal die niet meer bij de
  desktop-layout past.
- De rij met actieve filter-chips (regel 343–372 nu) blijft ongewijzigd, op beide
  breakpoints, direct boven de grid.

## 4. Vertalingen

Nieuwe sleutels in de `collectionsPage`-namespace (alle 4 locale-bestanden):
- `mobileFiltersButtonLabel` ("Filters")
- `mobileFiltersShowResults`: `"Toon {count, plural, one {# resultaat} other {# resultaten}}"`
  (zelfde ICU-plural-patroon als elders in dit project, bv. `cart.customSizeNote`)
- `mobileFiltersCloseAria` ("Paneel sluiten") — aria-label van de "×"-sluitknop, zie
  sectie 3.

Geen sleutels worden verwijderd.

## 5. Tests

- `tests/components/ProductsGrid.test.tsx`: **geen wijzigingen** — `useIsDesktop()` valt in
  jsdom terug op desktop, dus de bestaande DOM-verwachtingen blijven kloppen.
- Nieuw testbestand `tests/components/ProductsGrid.mobile.test.tsx` (of een nieuw
  `describe`-blok in hetzelfde bestand met een eigen `matchMedia`-mock per test): mockt
  `window.matchMedia` zodat de `md`-query `matches: false` teruggeeft, en dekt:
  - de aside is afwezig, `mobile-filters-toggle` is zichtbaar met correcte telling;
  - klikken opent de `Modal` met dezelfde facet-`data-testid`'s als vandaag (bv.
    `facet-formaat-option-staand`, `kunstenaar-filter`);
  - een filter aanvinken in het paneel werkt live door (product-card-telling verandert
    terwijl het paneel nog open staat, en de sluitknop-tekst update mee);
  - klikken op de sluitknop ("Toon N resultaten") sluit het paneel;
  - "Filters wissen" in het paneel leegt alle filters zonder het paneel te sluiten;
  - een simulatie van de `matchMedia`-`change`-event naar desktop sluit een openstaand
    paneel.
- Nieuw testbestand voor `src/lib/useIsDesktop.ts` (hook-only): dekt de fallback naar
  `true` zonder `matchMedia`, de initiële waarde mét `matchMedia`, en het reageren op een
  `change`-event.

## Open vragen

Geen — alle keuzes (uitschuifpaneel via bestaande `Modal.tsx`, live filteren zonder
concept-state, fallback-strategie voor tests, scope-afbakening t.o.v. quick-filter-chips)
zijn tijdens het brainstormen doorlopen en bevestigd.
