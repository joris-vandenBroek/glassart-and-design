# Design: "Word klant"-registratiepagina (mock)

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 18-07-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

## Context

Losse pagina (`/word-klant`) waar bezoekers zich kunnen aanmelden als nieuwe klant, met een keuze tussen particulier en zakelijk. Net als de contactpagina, het mandje en de login/bestelgeschiedenis is dit een **mock**: geen echte accountaanmaak, geen opslag, geen backend. Sluit aan bij de oorspronkelijke afspraak dat nieuwe klanten handmatig worden goedgekeurd door het bedrijf — deze pagina simuleert alleen het aanvraagformulier, niet de goedkeuringsstap zelf (die hoort bij de latere, echte beheeromgeving, zie de aparte roadmap).

## Doel

Bezoekers kunnen een klantaccount aanvragen via een formulier dat aanpast op basis van particulier/zakelijk, en krijgen na het versturen een duidelijke bevestiging dat de aanvraag is ontvangen.

## Formulier

**Eerste keuze:** particulier of zakelijk (bijv. als twee selecteerbare knoppen/tegels bovenaan het formulier).

**Velden voor beide types:**
- Naam*
- E-mailadres*
- Telefoonnummer*
- Wachtwoord*
- Adres, postcode, plaats*
- Afleveradres (indien afwijkend van bovenstaand adres) — optioneel aan/uit te vinken veld dat bij aanvinken extra adresvelden toont.

**Extra velden, alleen zichtbaar bij "zakelijk":**
- Bedrijfsnaam*
- KvK-nummer*
- Contactpersoon*

(* = verplicht veld)

## Gedrag

- Bij het wisselen tussen particulier/zakelijk verschijnen/verdwijnen de zakelijke velden direct (geen paginaverversing).
- Bij versturen: `preventDefault`, geen echte verzending of opslag (geen backend, geen `localStorage`) — toont een bevestigingsscherm op de pagina zelf: "Aanvraag ontvangen — we nemen binnen [x] contact met u op", net als het contactformulier-mock.
- Geen echte wachtwoord-validatie/sterkte-eisen nodig (dit is een mock-formulier); een simpel `required`-veld van het type `password` volstaat.

## Navigatie

- Nieuwe route `/[locale]/word-klant`.
- De navigatiebalk-link "Word klant" en de "Word klant"-CTA's (in `NavBar` en `BecomeClientCta` op de productenpagina) linken voortaan naar deze pagina in plaats van naar de (tijdelijke) `#contact`-interim-link.

## Talen

- Alle labels, placeholders en het bevestigingsbericht in alle 4 talen (NL/EN/DE/FR).

## Niet in scope

- Echte accountaanmaak, wachtwoordopslag, of verzending van de aanvraag (geen backend).
- De goedkeuringsstap door het bedrijf zelf (hoort bij de latere, echte beheeromgeving — zie `docs/superpowers/specs/2026-07-18-b2b-portaal-beheeromgeving-roadmap.md`).
- Koppeling met de bestaande mock-login (`useMockAuth`) — deze pagina is een apart, ongekoppeld aanvraagformulier, geen inlogmechanisme.

## Risico's / aandachtspunten

- `BecomeClientCta` (het component dat "Word klant" toont/verbergt op basis van mock-inlogstatus) blijft ongewijzigd in gedrag, alleen de link-bestemming verandert van `#contact` naar `/word-klant`.
- Formuliervalidatie is bewust minimaal (HTML5 `required`, geen custom regex/sterkte-eisen) — passend bij een mock-formulier zonder echte verwerking.
