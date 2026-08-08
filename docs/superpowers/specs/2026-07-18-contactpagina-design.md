# Design: Contactpagina

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 18-07-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

## Context

Losse contactpagina (`/contact`), geïnspireerd op de contactsectie van het referentieproject `C:\Temp\Zeus` (twee kolommen: bedrijfsgegevens + kaart links, contactformulier rechts). Vervangt op termijn de huidige contact-sectie op de homepage niet — die blijft als korte samenvatting staan; deze nieuwe pagina is de volledige, uitgebreide contactervaring. De navigatiebalk en de interim `#contact`-ankerlinks (nu wijzend naar de homepage-sectie) worden in dit deelproject omgezet naar deze nieuwe, losse pagina.

## Doel

Bezoekers kunnen op één centrale plek alle manieren vinden om contact op te nemen (telefoon, e-mail, WhatsApp, formulier) en zien de formele bedrijfsgegevens.

## Inhoud — linkerkolom

> **Bijgewerkt:** de klant heeft de echte bedrijfsgegevens aangeleverd (brochure, 2026-07-18). Adres, e-mailadres en de twee contactpersonen zijn nu echte gegevens, geen placeholders meer. WhatsApp-nummer, openingstijden en KvK/BTW/IBAN zijn niet aangeleverd en blijven placeholders.

- Bezoekadres: **Den Heuvel 21, 5688 EM Oirschot** + link "Plan route" (Google Maps) + ingesloten kaart (Google Maps embed op dit adres).
- Twee contactpersonen, net als in de brochure (niet één generiek telefoonnummer):
  - **Paul van den Hout** — 06 51404089 — voor projecten, hotels etc.
  - **Hem Brekoo** — 06 53736756 — voor zakelijke klanten (B2B)
  - Beide telefoonnummers als `tel:`-link.
- E-mailadres: **info@glassartdesign.nl** (gecorrigeerd — de site gebruikte per abuis `info@glassartanddesign.nl`, met "and"), `mailto:`-link.
- WhatsApp-knop/link (placeholder nummer, `https://wa.me/<nummer>`-link, opent WhatsApp-chat).
- Openingstijden (placeholder).
- Bedrijfsgegevens-blok: KvK-nummer, BTW-nummer, IBAN (alle placeholders).

## Inhoud — rechterkolom: contactformulier (mock)

- Velden: naam*, bedrijf, e-mailadres*, telefoon, onderwerp* (keuzelijst: bijv. "Algemene vraag", "Offerte aanvragen", "Overig"), bericht* (* = verplicht).
- Versturen: `preventDefault`, geen echte verzending/opslag (geen backend) — toont een korte "Verzonden!"-bevestiging op de knop (zelfde patroon als Zeus' mock-formulier), en reset het formulier na een paar seconden.

## Navigatie

- Nieuwe route `/[locale]/contact`.
- De navigatiebalk-link "Contact" en alle bestaande interim `/${locale}/#contact`-links (in `NavBar`, de segmentpagina-opvolger `ProductsGrid`/`BecomeClientCta`, en elders) worden vervangen door een echte link naar `/contact` — dit lost de "tijdelijke interim-link" op die in eerdere specs als bewuste, tijdelijke beperking is genoteerd.
- De bestaande contact-sectie op de homepage (`Contact`-component, met e-mail/telefoon) blijft ongewijzigd bestaan als korte samenvatting; deze pagina is een uitgebreidere, aparte bestemming.

## Talen

- Alle nieuwe tekst (labels, placeholders, bevestigingsbericht) in alle 4 talen (NL/EN/DE/FR), consistent met de rest van de site.

## Niet in scope

- Echte verzending van het contactformulier (geen backend/e-mailservice) — puur visuele bevestiging, net als bij Zeus.
- Echte bedrijfsgegevens (adres, KvK, BTW, IBAN, WhatsApp-nummer, openingstijden) — allemaal placeholders, door de klant zelf later te vervangen.
- Wijzigen van de bestaande homepage-contactsectie.

## Risico's / aandachtspunten

- Zodra deze pagina bestaat, moeten alle bestaande `#contact`-interim-links (genoemd als tijdelijke beperking in eerdere specs: navigatiebalk, "Word klant"-knoppen) worden bijgewerkt naar de echte `/contact`-route — dit is een bewuste opruimactie die bij dit deelproject hoort, niet een aparte losse taak.
- Google Maps-embed vereist een `iframe` met een placeholder-locatie; zodra het echte adres bekend is, is dit een eenvoudige URL-vervanging.
