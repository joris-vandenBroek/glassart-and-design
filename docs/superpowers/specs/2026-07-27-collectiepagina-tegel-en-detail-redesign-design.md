# Collectiepagina tegel- en detail-redesign

**Datum:** 2026-07-27
**Status:** Goedgekeurd, klaar voor implementatieplan

## Aanleiding

De collectiepagina (`/collecties`) toont kunstwerken op dit moment als "visitekaartjes"
(`KunstwerkSpecCard`): een witte kaart met code, titel, artiest, collectie en materiaal
altijd zichtbaar onder de foto, in een 2/3/4-koloms grid. Dat is drukker dan gewenst en
verbergt de foto's zelf achter tekst. Doel van dit ontwerp: de tegels terugbrengen naar
een simpele, foto-gerichte galerij-weergave — 3 kolommen, gouden lijn zoals elders op de
site, gelijke ruimte per foto ongeacht portret/liggend/vierkant, omschrijving pas
zichtbaar bij hover, en alle details (inclusief bestellen) in de bestaande detail-dialoog
(`ProductModal`) die al opent bij een klik op een tegel.

Tijdens het ontwerp bleek dat `KunstwerkSpecCard` ook wordt hergebruikt in het
beheerscherm (`KunstwerkenSection`) als live "label-voorbeeld" tijdens het bewerken van
een kunstwerk. Omdat de kaart-stijl nergens anders meer nodig is zodra de collectiepagina
verandert, wordt die component volledig opgeruimd. Het beheerscherm krijgt in plaats
daarvan een live, alleen-lezen voorbeeld van de klant-dialoog (`ProductModal`) — zodat een
beheerder direct ziet hoe een kunstwerk er voor de klant uitziet, zonder dat er vanuit
beheer echt besteld kan worden.

## Scope

**In scope:**
- Tegel-grid op `/collecties` (`ProductsGrid.tsx`)
- Detail-dialoog (`ProductModal.tsx`): fotobehandeling + nieuw info-blok
- Live preview-modus van `ProductModal` in het beheerscherm (`KunstwerkenSection.tsx`)
- Verwijderen van `KunstwerkSpecCard` (component, test, vertalingen) — niets gebruikt hem
  na deze wijziging nog
- Nieuwe/gewijzigde vertaalsleutels in alle 4 locale-bestanden (nl/en/fr/de)
- Testupdates in `ProductsGrid.test.tsx` en `ProductModal.test.tsx`, nieuwe tests voor de
  preview-modus in `KunstwerkenSection`

**Buiten scope:**
- Geen wijzigingen aan filters, breadcrumb of facet-logica op de collectiepagina
- Geen wijzigingen aan de daadwerkelijke bestel-flow (mandje, checkout)
- Geen wijzigingen aan `WatermarkedImage` zelf (bestaande `fit="contain"`/`"cover"` opties
  volstaan)

## 1. Tegel-grid — `ProductsGrid.tsx`

- Grid wordt `grid-cols-3` op alle breakpoints (was `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`).
- Elke tegel is een vast `aspect-square` vlak met witte achtergrond, gouden lijn op 50%
  dekking in rust die bij hover/focus verspringt naar volledig gouden plus een lichte
  lift + zachte gouden schaduw (zelfde interactie-taal als de bestaande hover-lift).
- De foto zelf gebruikt `WatermarkedImage` met `fit="contain"`, zodat liggende, staande en
  vierkante werken allemaal evenveel ruimte in de tegel innemen (witte letterbox waar
  nodig) — dit is dezelfde `contain`-modus die nu al gebruikt wordt, alleen niet meer
  binnen `KunstwerkSpecCard`.
- Een gradient-overlay (transparant naar zwart, van boven naar onder) verschijnt bij hover
  én bij toetsenbord-focus (de tegel is al `role="button" tabIndex={0}`) met de
  omschrijving van het kunstwerk als enige tekst. Geen code, artiest, collectie of
  materiaal meer zichtbaar op de tegel zelf — dat verplaatst allemaal naar de
  detail-dialoog.
- `KunstwerkSpecCard` verdwijnt volledig uit dit bestand; de losse hover-gradient-div die
  er nu al overheen ligt, gaat op in de nieuwe tegel-opzet.

## 2. Detail-dialoog — `ProductModal.tsx`

- Fotogebied: van `fit="cover"` (bijsnijden) naar `fit="contain"` op een donkere
  achtergrond met dezelfde gouden lijn als de tegels — het hele kunstwerk blijft zichtbaar,
  niets valt weg.
- Nieuw info-blok tussen de omschrijving en het materiaal/maat-formulier: Artiest,
  Collectie(s), Stijl, Onderwerp. Elke rij verschijnt alleen als er data voor is (zelfde
  patroon als de bestaande conditionele collectie/materiaal-weergave), omkaderd met een
  dunne gouden lijn boven en onder.
- Nieuwe props: `segmenten: Segment[] | null`, `stijlen: Stijl[] | null`,
  `onderwerpen: Onderwerp[] | null` (naast de al bestaande `kunstenaars`). De labels
  worden binnen `ProductModal` zelf opgezocht via `kunstwerk.segmentIds` /
  `kunstwerk.stijlIds` / `kunstwerk.onderwerpIds`, net zoals `ProductsGrid` dat nu al voor
  collectie-labels doet.
- Nieuwe prop `variant?: 'dialog' | 'preview'` (default `'dialog'`) voor de
  hergebruik-situatie in het beheerscherm, zie sectie 3.
  - `'dialog'` (huidig gedrag): vaste overlay met backdrop, sluitknop, focus-trap via
    `useOverlayDismiss`.
  - `'preview'`: geen vaste overlay/backdrop/sluitknop — de dialoog-inhoud wordt inline
    gerenderd op de plek waar hij staat; `useOverlayDismiss` wordt niet actief zodat Escape
    en focus-trap het omliggende beheerformulier niet verstoren. De bestel-knop is
    uitgeschakeld en toont een tekst die duidelijk maakt dat dit een voorbeeld is
    (nieuwe vertaalsleutel), en er wordt niets aan het mandje toegevoegd of gelogd.
    Materiaal/maat-dropdowns blijven wel interactief zodat een beheerder verschillende
    combinaties kan doorlopen om labels/prijzen te controleren.

## 3. Beheerscherm live preview — `KunstwerkenSection.tsx`

- De bestaande "Label voorbeeld"-sectie (huidige `KunstwerkSpecCard`-render rond regel
  894) wordt vervangen door `<ProductModal variant="preview" ... />`, nog steeds in het
  sticky rechterpaneel naast het bewerkformulier — altijd zichtbaar, geen extra klik nodig.
- Het kunstwerk-object voor de preview wordt samengesteld uit de actuele formuliervelden
  (`naam`, `omschrijvingNl`, `foto`, `kunstenaarId`, `segmentIds`, `materiaalIds`,
  `maatIds`, `stijlIds`, `onderwerpIds`, `prijzen`, `prijsPerM2`) — dezelfde mapping die
  `handleSave` al gebruikt om `Omit<Kunstwerk, 'id'>` te bouwen voor `onAdd`/`onUpdate`.
  Die mapping wordt uit `handleSave` gelicht naar een gedeelde, op elke render herberekende
  waarde, zodat zowel het opslaan als de preview dezelfde bron gebruiken (geen dubbele
  logica). `id` in de preview is het bestaande kunstwerk-id bij bewerken, of een
  placeholder bij toevoegen.
- Alle referentiedata die de preview nodig heeft (`segmenten`, `materialen`,
  `materiaalsoorten`, `maten`, `kunstenaars`, `stijlen`, `onderwerpen`) is al aanwezig als
  prop op `KunstwerkenSection` — geen nieuwe data-ophaal-logica nodig.
- De sectiekop hergebruikt de bestaande vertaalsleutel `kunstwerkenLabelPreview`
  ("Voorbeeld op de collectiepagina") — die tekst klopt nu zelfs letterlijker dan voorheen.

## 4. Opruimen — `KunstwerkSpecCard`

- `src/components/KunstwerkSpecCard.tsx` wordt verwijderd (geen enkele resterende
  gebruiker na stap 1–3).
- `tests/components/KunstwerkSpecCard.test.tsx` wordt verwijderd.
- De `kunstwerkSpecCard`-namespace (`collectie`, `materiaal`, `tagline`) wordt verwijderd
  uit `messages/nl.json`, `en.json`, `fr.json`, `de.json`.

## 5. Vertalingen

Nieuwe sleutels in de `cart`-namespace (alle 4 locale-bestanden):
- `artistLabel` ("Artiest")
- `collectionsLabel` ("Collectie")
- `stijlLabel` ("Stijl")
- `onderwerpLabel` ("Onderwerp")
- `previewOrderDisabled` (knoptekst/toelichting in preview-modus, bv. "Bestellen niet
  mogelijk in dit voorbeeld")

Verwijderde sleutels: de volledige `kunstwerkSpecCard`-namespace (zie sectie 4).

## 6. Tests

- `tests/components/ProductsGrid.test.tsx`: de test die controleert dat het materiaal-label
  zichtbaar is op de kaart ("shows the resolved materiaal label on each kunstwerk card")
  vervalt hier, want die tekst staat niet meer op de tegel. Een vergelijkbare assertie komt
  terug in `ProductModal.test.tsx` (materiaal-label zichtbaar ná het openen van de
  dialoog — dat bestaat daar al impliciet via de materiaal-select).
- `tests/components/ProductModal.test.tsx`: nieuwe tests voor het info-blok (artiest/
  collectie/stijl/onderwerp tonen wanneer aanwezig, wegvallen wanneer afwezig) en voor
  `variant="preview"` (geen backdrop/sluitknop, bestel-knop uitgeschakeld, geen
  `addItem`/`logActiviteit`-aanroepen).
- `tests/components/KunstwerkSpecCard.test.tsx`: verwijderd.
- `tests/components/beheer/KunstwerkenSection.test.tsx` bevat nog geen tests voor de
  label-preview-sectie, dus er is niets bestaands om aan te passen; deze krijgt nieuwe
  dekking voor de `ProductModal`-preview (zichtbaar in het sticky paneel, geen
  bestelmogelijkheid).

## Open vragen

Geen — alle keuzes zijn tijdens het brainstormen doorlopen en bevestigd (kolomaantal,
tegel-mat kleur, dialoog-fotobehandeling, gouden lijn, scope van de admin-preview).
