# Design: Producten-pagina met filter (vervangt segmentpagina's)

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 18-07-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

## Context

Herstructurering van de collectiepagina's die eerder gebouwd zijn (deelproject "Navigatie + Collectiepagina's"). In plaats van 6 losse pagina's per segment (`/collecties/hotel`, `/collecties/restaurant`, enz.) plus een aparte overzichtspagina, komt er — geïnspireerd op de productencatalogus van het referentieproject `C:\Temp\Zeus` — **één pagina** die alle sfeerbeelden toont met filterknoppen per segment, naar het voorbeeld van Zeus' `#producten`-sectie (filterknoppen boven een grid, klant filtert direct in de browser zonder paginaverversing).

Dit is de eerste stap van een grotere reeks (hierna: winkelmandje, contactpagina, registratiepagina, logo — in die volgorde), en is bewust eerst aan de beurt omdat het mandje's "toevoegen aan mandje"-knoppen op deze nieuwe, samengevoegde pagina moeten landen in plaats van op de (te verwijderen) losse segmentpagina's.

## Doel

Eén overzichtelijke pagina waarop bezoekers alle sfeerbeelden zien en met één klik kunnen filteren op segment (Hotel, Restaurant, Wellness, Office, Abstract, Artist Collections), zonder te hoeven navigeren tussen aparte pagina's.

## Wat vervalt

- `/collecties/[segment]/page.tsx` (de 24 statische segmentpagina's: 6 segmenten × 4 talen) — wordt volledig verwijderd.
- De aparte, langere introtekst per segment (`segments.*.intro` in de vertaalbestanden) — deze content wordt niet elders hergebruikt in dit deelproject (expliciet akkoord van de klant: geen onderschrift bij het actieve filter, gewoon laten vervallen).
- Het uitklap-submenu onder "Collecties" in de navigatiebalk (met een link per segment) — inclusief de hover-gerelateerde code (en de recent gefixte gat-bug) die daarmee samenhangt, aangezien het hele submenu verdwijnt.

## Wat blijft / wordt aangepast

- `/collecties/page.tsx` blijft bestaan als URL, maar de inhoud verandert volledig: één pagina, alle 36 sfeerbeelden, met filterknoppen.
- `collectionsPage.title` / `collectionsPage.intro` (de bestaande vertaalsleutels voor titel/intro van de overzichtspagina) blijven en worden bovenaan de nieuwe pagina getoond.
- `segments.*.title` (alleen de titel, niet de intro) blijft nodig: voor de filterknop-labels en het segment-badge-label op elke afbeelding.
- De "Word klant"-knop (`SegmentCta`, met de bestaande verberg-bij-inloggen-logica) verschuift van "onderaan elke segmentpagina" naar "één keer onderaan de nieuwe, samengevoegde pagina".

## Filterknoppen

- Knoppen: **Alle** (standaard actief) + één knop per segment (Hotel, Restaurant, Wellness, Office, Abstract, Artist Collections), elk met het aantal afbeeldingen in die categorie (bijv. "Wellness (6)"), naar het voorbeeld van Zeus' `prod-filter__btn` met tellers.
- Filteren is een pure client-side statusverandering (geen paginanavigatie, geen herlaad) — alle 36 afbeeldingen staan al in de pagina, filtering toont/verbergt op basis van het gekozen segment.
- De actieve knop krijgt een duidelijke visuele actieve-status (consistent met de bestaande zwart/zilver "Glass Reflection"-stijl, niet Zeus' eigen kleurstelling).

## Grid met afbeeldingen

- Elke afbeelding krijgt een klein label/badge met de segmentnaam (vertaald), zodat ook in de "Alle"-weergave duidelijk is bij welk segment een beeld hoort — naar het voorbeeld van Zeus' categorie-badge op elke productkaart.
- Geen los detailvenster per afbeelding in dit deelproject (dat was bij Zeus nodig omdat producten een eigen naam/beschrijving/certificaten hebben; onze afbeeldingen zijn sfeerbeelden zonder individuele productinformatie). De "toevoegen aan mandje"-interactie (apart deelproject, hierna) komt rechtstreeks op de afbeeldingskaart zelf, niet in een modal.

## Navigatie

- "Collecties" in de navigatiebalk wordt een gewone, directe link naar `/collecties` — geen hover-submenu meer, consistent met hoe Zeus zijn hoofdnavigatie ook zonder uitklapmenu's opzet.

## Niet in scope (voor dit deelproject)

- De "toevoegen aan mandje"-knop op elke afbeelding (apart deelproject: winkelmandje, hierna).
- Een detailweergave/modal per afbeelding.
- Behoud van de segment-introteksten in welke vorm dan ook (expliciet vervallen, zie hierboven).

## Risico's / aandachtspunten

- Dit is een bewuste vervanging van al gebouwde en gedeployde functionaliteit (Task 8/9 van het vorige deelproject) — de 24 segment-URL's (`/collecties/hotel` etc.) verdwijnen; eventuele externe links daarnaartoe (die nog niet bestaan, aangezien de site net live is) geven daarna een 404. Geen probleem gezien de site nog maar net gelanceerd is.
- Met alle 36 afbeeldingen op één pagina moet gelet worden op laadtijd/paginagewicht; de bestaande aanpak (rechtstreekse `<img>`-tags naar Unsplash, geen Next.js Image-optimalisatie, consistent met de rest van de site) blijft ongewijzigd.
