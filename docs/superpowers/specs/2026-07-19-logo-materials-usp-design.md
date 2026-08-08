# Design: Logo + Materialen/USP-sectie

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 19-07-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

## Context

De klant heeft een brochure aangeleverd (2026-07-18) met het echte merkidentiteit: een gouden logo-merkteken, 5 gouden USP-iconen (met een vaste betekenis per icoon) en een materialenlijst. Er is geen los logobestand (SVG/PNG/AI) beschikbaar — de klant heeft bevestigd dat het logo nagebouwd mag worden als SVG op basis van de referentie-afbeelding. Dit deelproject bouwt het logo na en voegt het toe aan de navigatiebalk, en voegt een nieuwe homepage-sectie toe met de 5 USP-iconen en de 6 materialen uit de brochure.

## Doel

Bezoekers zien direct herkenbare merkidentiteit (logo in de navbar) en een overtuigende sectie op de homepage die laat zien waarom Glassart & Design de juiste keuze is (kwaliteitsclaims + materiaalopties).

## Logo

- Nieuw component `Logo.tsx`: het gouden merkteken (SVG, vier losse hoek-haakjes rond een gestileerde "G" — geen gesloten kader, luchtiger en moderner dan een dichtgetimmerd vierkant) plus de wordmark-tekst "GLASSART & DESIGN" ernaast (goud voor "GLASSART", zilver/wit voor "& DESIGN", consistent met de bestaande site-kleuren).
- Geplaatst links in de navigatiebalk, vóór de "Home"-link.
- Alleen het icoon+wordmark, geen aparte tagline in de navbar (die blijft in de brochure, niet nodig in de compacte navbar-context).
- Logo is een link naar de homepage (`/`), net als een gebruikelijk site-logo.

## Materialen/USP-sectie

Eén doorlopende sectie (nieuw component `WhyUs.tsx`), geplaatst op de homepage tussen "Over ons" en "Uitgelichte werken":

- Titel: "Waarom Glassart & Design".
- Een rij met de 5 gouden USP-iconen, elk met een korte labeltekst eronder:
  - Diamant → "Gallery Quality"
  - Schild → "4mm Veiligheidsglas"
  - Zon → "UV-bestendig & kleurvast"
  - Raster/tabel → "Haarscherpe details"
  - Veer → "Duurzaam & milieuvriendelijk"
- Daaronder een grid met de 6 materialen als eenvoudige tekstkaarten (naam + korte omschrijving, geen foto's):
  - 4mm Veiligheidsglas — "Onze specialiteit. Kristalhelder, sterk en veilig."
  - Dibond 3mm — "Lichtgewicht, stijf en vormvast met een matte uitstraling."
  - Acryl 3mm — "Licht en helder met een luxe glanzende look."
  - Acryl 5mm — "Extra diepte en stevigheid voor een indrukwekkend effect."
  - Acryl 10mm — "Maximale diepwerking voor exclusieve presentatie."
  - Akoestische stof — "Verbetert de akoestiek en geeft een warme, moderne uitstraling."

## Architectuur

- `src/components/Logo.tsx` — het merkteken + wordmark, client component (gebruikt geen vertalingen, puur visueel; de wordmark-tekst "GLASSART & DESIGN" is de merknaam zelf, niet vertaald, consistent met hoe de hero-sectie deze nu ook al ongelokaliseerd toont).
- `src/components/WhyUs.tsx` — de volledige sectie (iconen-rij + materialen-grid), client component met `useTranslations`, iconen als inline SVG (5 kleine, eenmalig gebruikte iconen — geen aparte bestanden per icoon).
- `src/data/materials.ts` — de 6 materialen als data-array (`{ id, messageKey }`, zelfde patroon als `src/data/segments.ts`), met naam/omschrijving via vertaalsleutels.
- Nieuwe Tailwind-kleuren zijn niet nodig — de bestaande `gold`/`gold-bright`-tokens (uit de winkelmandje-redesign) worden hergebruikt voor de iconen en het logo-merkteken.
- Alle nieuwe tekst (sectietitel, 5 USP-labels, 6 materiaalnamen+omschrijvingen) in alle 4 talen (NL/EN/DE/FR).

## Niet in scope

- Geen wijziging van de bestaande navbar-links, cart, taalkeuze, login-knop, etc. — alleen het logo wordt toegevoegd, links van "Home".
- Geen foto's/afbeeldingen bij de materiaal-kaarten — puur tekst, consistent met de gekozen mockup-stijl.
- Geen aparte tagline ("GALLERY QUALITY PRINTING") in de navbar-logo — alleen icoon+wordmark.
- Het logo wordt alleen in de navbar gebruikt in dit deelproject — niet elders (bijv. favicon, footer) tenzij later expliciet gevraagd.

## Risico's / aandachtspunten

- Het logo is een nagebouwde interpretatie van de brochure-afbeelding (geen origineel bestand) — de klant heeft dit expliciet goedgekeurd als aanpak; kleine visuele afwijkingen t.o.v. het origineel zijn daarom acceptabel en makkelijk later bij te stellen (het is gewoon SVG-code, geen extern asset).
- De materiaal-omschrijvingen zijn overgenomen uit de brochuretekst; als deze afwijken van wat de klant precies bedoelde, is dat een tekstuele aanpassing achteraf, geen structuurwijziging.
