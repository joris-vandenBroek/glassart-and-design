# Drukker-e-mail: factuurgegevens-voetje voor Glassart & Design

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 04-08-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

Datum: 2026-08-04
Auteur: Joris van den Broek (met Claude)
Status: Approved — klaar voor implementatieplan

## Aanleiding

De drukker die een order-e-mail van Glassart & Design ontvangt (zie `2026-08-04-drukker-mail-html-kaarten-design.md`) heeft geen adresgegevens van Glassart & Design om zijn eigen factuur naar te versturen. Onderaan de e-mail moet daarom een klein voetje met de minimaal benodigde gegevens komen.

Tijdens het brainstormen is bewust IBAN uitgesloten: dat is nodig wanneer Glassart & Design ZELF betaalt, niet wanneer de drukker aan Glassart & Design factureert. KVK-nummer en btw-nummer zijn strikt genomen niet vereist op een factuur aan een klant, maar worden door leveranciers vaak gevraagd voor hun eigen administratie — die zijn daarom wél opgenomen, samen met een e-mailadres voor het versturen van een digitale factuur.

## Scope

**Wel:**
- `src/lib/buildDrukkerMail.ts` — voegt eenmalig, aan het eind van de hele e-mail (na alle klant-secties), een factuurgegevens-voetje toe in zowel de tekst- als de HTML-versie.
- `src/components/beheer/VersturenNaarDrukkerDialog.tsx` — haalt de bestaande bedrijfsgegevens op en geeft ze door aan `buildDrukkerMail`.

**Niet:**
- Geen nieuwe/aangepaste bedrijfsgegevens-velden — hergebruikt exact de bestaande `Bedrijfsgegevens`-data (`instellingen`/`bedrijfsgegevens`, zie `bedrijfsgegevensTypes.ts` en `bedrijfsgegevensSeed.ts`) die al gebruikt wordt op de publieke contactpagina (`ContactInfo.tsx`).
- Geen IBAN in het voetje (bewuste keuze, zie Aanleiding).
- Geen wijziging aan de per-klant-secties, groepering, of de HTML-kaart-opmaak uit de vorige spec — dit voetje komt er alleen ná toe.
- Geen i18n: dit bestand bevat al uitsluitend hardcoded Nederlandse tekst (het is een interne e-mail aan een Nederlandse drukker), het voetje volgt dezelfde conventie.

## A. Databron: bestaande `Bedrijfsgegevens`

`VersturenNaarDrukkerDialog.tsx` haalt de instellingen op met `useApiRecord<Bedrijfsgegevens>('instellingen', 'bedrijfsgegevens')` en valt terug op `BEDRIJFSGEGEVENS_SEED` — exact hetzelfde patroon als `ContactInfo.tsx` (`src/components/ContactInfo.tsx:16-17`). Zo blijft het voetje automatisch in sync met wat in beheer is ingevuld, zonder een tweede plek waar deze gegevens los worden bijgehouden.

Gebruikte velden uit `Bedrijfsgegevens`: `bezoekadres`, `kvkNummer`, `btwNummer`, `email`. De bedrijfsnaam "Glassart & Design" is geen veld in `Bedrijfsgegevens` (net zoals in de rest van de codebase, bv. `src/lib/server/sendResetEmail.ts`) en wordt als letterlijke string in `buildDrukkerMail.ts` gebruikt.

## B. `buildDrukkerMail.ts`: voetje aan `DrukkerMailInput` en output

`DrukkerMailInput` krijgt een nieuw verplicht veld `bedrijfsgegevens: Bedrijfsgegevens`. Aan het eind van `buildDrukkerMail()`, ná het samenvoegen van alle klant-secties, wordt eenmalig een voetje toegevoegd — niet per klant-sectie.

**Tekstversie** (voorbeeld met echte seed-waarden):
```
--
Glassart & Design
Den Heuvel 21, 5688 EM Oirschot
KVK-nummer: 12345678
Btw-nummer: NL123456789B01
E-mailadres (voor facturen): info@glassartanddesign.com
```
Voorafgegaan door een lege regel en een `--`-scheidingsregel, aansluitend op de bestaande `\n\n`-scheiding tussen klant-secties.

**HTML-versie**: een los `<table>`-blok ná alle klant-secties, met een `border-top` (dunne grijze lijn, consistent met de bestaande `#e5e5e5`-scheidingskleur), kleine gedempte tekst (`#666666`, zelfde `font-family:Arial,sans-serif` als de rest van de e-mail) — bedrijfsnaam vet, de overige regels (adres/KVK/btw/e-mail) elk op een eigen regel. Alle waarden gaan door de bestaande `escapeHtml()`-helper, ook al zijn dit beheer-ingevoerde (geen klant-ingevoerde) gegevens — consistent met de rest van het bestand, waar alle geïnterpoleerde strings worden geëscaped.

## C. `VersturenNaarDrukkerDialog.tsx`: ophalen en doorgeven

Eén extra hook-aanroep (`useApiRecord<Bedrijfsgegevens>('instellingen', 'bedrijfsgegevens')` + `BEDRIJFSGEGEVENS_SEED`-fallback, zie A), en `bedrijfsgegevens` wordt toegevoegd aan de bestaande `buildDrukkerMail({ bestellingen, klanten, kunstwerken, materialen, maten, materiaalsoorten })`-aanroep. Geen andere wijziging aan dit bestand.

## Testing

- `tests/lib/buildDrukkerMail.test.ts`: alle bestaande testaanroepen van `buildDrukkerMail(...)` krijgen het nieuwe verplichte `bedrijfsgegevens`-veld in hun input (een vaste test-fixture met voorbeeldwaarden, analoog aan de bestaande `klant()`/`bestelling()`-fixture-functies). Nieuwe assertions: het voetje bevat bedrijfsnaam, adres, KVK-nummer, btw-nummer en e-mailadres in zowel `.text` als `.html`, komt maar één keer voor (ook bij meerdere klant-secties), en escaped een btw-/KVK-waarde met een HTML-speciaal teken correct.
- `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx`: mock voor `useApiRecord` (of de onderliggende `fetch`) zodat de test een vaste `Bedrijfsgegevens`-fixture teruggeeft; bestaande preview-assertions blijven werken, eventueel uitgebreid met een assertion dat de bedrijfsnaam/adres van Glassart & Design in de preview staat.

## Niet in scope (samenvatting)

- IBAN (bewust uitgesloten, zie Aanleiding).
- Nieuwe bedrijfsgegevens-velden of wijzigingen aan het beheer-formulier.
- Wijzigingen aan de per-klant-secties/groepering/kaart-opmaak uit de vorige spec.
- i18n (bestand blijft volledig Nederlandstalig, zoals nu).
