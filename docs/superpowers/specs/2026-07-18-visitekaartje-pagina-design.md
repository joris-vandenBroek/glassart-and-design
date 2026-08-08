# Design: Visitekaartje-pagina (Glassart and Design)

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 18-07-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

## Context

Glassart and Design wil een supermoderne website (basiskleuren zwart en zilver) voor de verkoop van kunst op 4mm veiligheidsglas, inclusief montagehaken. De volledige toekomstige website bestaat uit meerdere onderdelen:

1. **Deze visitekaartje-pagina** (dit document) — eerste, snel op te leveren deelproject.
2. Publieke meertalige marketing-website (collectiepagina's per segment, materialen, over ons, contact, "word klant"-aanvraagformulier) — apart deelproject, later.
3. B2B-portaal (login, prijzen per klanttype, bestellen op factuur) — apart deelproject, later.
4. Beheeromgeving (orders, klantgoedkeuring, prijsbeheer, contentbeheer) — apart deelproject, later.

Dit document beschrijft alleen deelproject 1: een statische one-pager die dient als visitekaartje voor het bedrijf, gebaseerd op de beschreven merkidentiteit (er is geen brochure-bestand beschikbaar; het ontwerp is vanaf nul opgezet in overleg met de klant).

## Doel

Een snel op te leveren, supermoderne one-pager die de merkidentiteit van Glassart and Design neerzet, als opstap naar de latere volledige website. Geen webshopfunctionaliteit, geen formulieren — puur een representatieve landingspagina.

## Techniek

- **Framework:** Next.js (App Router), TypeScript.
- **Styling:** Tailwind CSS.
- **Meertaligheid:** next-intl, routes onder `/[locale]/...`. Talen: Nederlands (`nl`, standaard/fallback), Engels (`en`), Duits (`de`), Frans (`fr`). Vertaalteksten in JSON-bestanden per taal.
- **Rendering:** statische export (`output: export`) zodat de site op elke hosting-omgeving gedraaid kan worden. Hosting is nog niet gekozen; voorlopig lokale ontwikkeling.
- **Beeldmateriaal:** geen logo/foto's beschikbaar bij aanvang. Er worden duidelijk herkenbare placeholders gebruikt (bv. gradient-vlakken), zodat ze later eenvoudig te vervangen zijn door echte assets zonder structuurwijziging.

## Structuur en inhoud

Eén doorscrollende pagina, opgebouwd uit vier secties:

1. **Hero** — bedrijfsnaam/logo, korte slogan, verwijzing naar "gehard veiligheidsglas 4mm incl. montagehaken", een CTA-knop (bv. "Neem contact op", zonder formulierfunctionaliteit — linkt naar de contactsectie of een `mailto:`-link).
2. **Over ons** — korte introductietekst over het bedrijf.
3. **Uitgelichte werken** — kleine galerij (bv. 3 vlakken) met placeholder-afbeeldingen ter vervanging door echte kunstwerken.
4. **Contact** — contactgegevens (adres/telefoon/e-mail), geen contactformulier.

## Visueel ontwerp — "Glass Reflection"

Gekozen na visuele verkenning met de klant (3 richtingen getoond: Minimalist Gallery, Glass Reflection, Industrial Premium):

- Achtergrond: doorlopend verloop van zwart naar antraciet (`#060607` → `#1c1e22` → `#2a2d33`), over de volledige paginahoogte.
- Secties worden getoond als "zwevende" overlay-panelen boven deze doorlopende achtergrond (parallax-gevoel) — dit is bewust gekozen boven simpelere gestapelde full-width secties of een asymmetrische editorial-lay-out, als de meest "supermodern" ogende optie.
- Subtiele glasmorphism-elementen (transparante panelen, lichte rand, blur) die visueel verwijzen naar het materiaal glas.
- Typografie: ingetogen, met zilverkleurige tekst-gradients (`#e2e4e8` → `#9aa0aa`) als accent op koppen.
- Taalkeuze (NL/EN/DE/FR): vaste, kleine knop rechtsboven, altijd zichtbaar tijdens het scrollen.

## Niet in scope (bewust uitgesloten van dit deelproject)

- Webshopfunctionaliteit, prijzen, login/portaal.
- Collectiepagina's per segment (hotel, restaurant, wellness, office, abstract, artist collections) — onderdeel van de latere volledige website.
- Contactformulier of "word klant"-aanvraagformulier.
- Echt beeldmateriaal (logo, foto's) — volgt later van de klant.
- Definitieve hostingkeuze.

## Risico's / aandachtspunten

- De parallax/overlay-lay-out (variant 3) is visueel het meest ambitieus en vraagt iets meer aandacht voor performance en mobiele weergave dan een simpele gestapelde lay-out — dit wordt meegenomen in het implementatieplan.
- Omdat er nog geen echte beelden zijn, moet de structuur zo gebouwd worden dat het vervangen van placeholders door echte afbeeldingen geen layoutwijzigingen vereist.
