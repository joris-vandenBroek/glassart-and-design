# Design: Taalkeuze-dropdown met vlaggen

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 18-07-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

## Context

Vervangt de huidige `LanguageSwitcher`: vier losse knoppen (NL/EN/DE/FR) naast elkaar in de navigatiebalk. Wordt één samengeklapte knop met de vlag en code van de actieve taal, die bij klikken een lijst met alle 4 talen toont.

## Doel

Compactere, herkenbaardere taalkeuze in de navigatiebalk, met vlaggen voor snelle visuele herkenning.

## Weergave

- Geslotenstaat: één pil-knop met de vlag-emoji van de actieve taal + de taalcode (bijv. "🇳🇱 NL") + een pijltje-omlaag (▾).
- Vlaggen (emoji, geen losse afbeeldingsbestanden): 🇳🇱 NL, 🇬🇧 EN, 🇩🇪 DE, 🇫🇷 FR.
- Standaardtaal blijft Nederlands (`nl`), ongewijzigd t.o.v. de bestaande architectuur (`routing.defaultLocale`).

## Interactie

- Klikken op de knop opent een lijst eronder met alle 4 talen (vlag + code per regel); de actieve taal is visueel gemarkeerd (en niet aanklikbaar, zoals nu ook al het geval is).
- Klikken op een andere taal in de lijst wisselt direct naar die taal (zelfde onderliggende wissel-logica als nu: `router.replace(pathname, { locale })`) en sluit de lijst.
- Klikken buiten de lijst (of op de knop zelf nogmaals) sluit de lijst zonder te wisselen.
- Bewuste keuze voor klik-in-plaats-van-hover: voorkomt de klasse fouten die bij het (inmiddels verwijderde) hover-gebaseerde Collecties-submenu speelde (muis die per ongeluk de lijst sluit voordat een keuze gemaakt kan worden).

## Niet in scope

- Opslaan van de taalvoorkeur bij een (toekomstig) klantaccount — dat hoort bij de echte, latere B2B-portaal-architectuur (zie `docs/superpowers/specs/2026-07-18-b2b-portaal-beheeromgeving-roadmap.md`). Tot die tijd blijft de taalkeuze puur een front-end wisseling zonder opslag anders dan de huidige paginanavigatie.
- Vervanging van emoji-vlaggen door SVG-icoontjes (bewust niet gekozen, zie gesprek).

## Risico's / aandachtspunten

- Klik-buiten-de-lijst-sluiten is een nieuw interactiepatroon in deze codebase (nog niet eerder gebouwd) — vereist een click-outside-detectie (bijv. een `document`-click-listener met een `ref` naar de knop/lijst).
- Emoji-vlaggen renderen verschillend per besturingssysteem/browser-versie; op recente Windows-browsers (Edge/Chrome) is dit inmiddels betrouwbaar, maar dit is een bewuste afweging (zie gesprek) en geen garantie voor elke omgeving.
