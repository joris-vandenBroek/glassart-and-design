# Verzonden zending bekijken als popup — ontwerp

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 12-08-2026 is vastgelegd,
> inclusief de afwegingen van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later
> verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

Datum: 2026-08-12
Status: ontwerp, goedgekeurd voor implementatie

## Aanleiding

In de Drukkergegevens-modal (`DrukkerModal.tsx`) staat per drukker een lijst "Verzonden mails".
Een medewerker kan een zending uitklappen via "Bekijken", maar wat dan verschijnt is de ruwe
tekst van de verzonden mail (`<pre>{zending.body}</pre>`) — een platte tekstdump zonder opmaak,
productfoto's of gestructureerde bedragen. Dat is onprettig om te lezen, vooral bij zendingen met
meerdere klanten/bestellingen. Het verzoek: vervang dit door een popup die eruitziet als de
bestaande Bestelgegevens-modal (`BestellingModal.tsx`), maar dan puur ter inzage — zonder
bewerkopties.

## Uitgangssituatie in de code

**Databron van een zending** (`useDrukkerZendingen.ts`, backend
`src/app/api/drukkers/[id]/zendingen/route.ts`): een `DrukkerZending` heeft o.a. `bestellingIds:
string[]`. Ondanks de naam bevat dit veld **bestelnummers**, niet database-id's — bevestigd in
`DrukkerModal.tsx`'s bestaande `afgerondCounts`, die deze waarden matcht tegen
`bestellingen.find(b => b.bestelnr === ...)`. De nieuwe popup zoekt op dezelfde manier de bij een
zending horende bestellingen op in de al aan `DrukkerModal` doorgegeven `bestellingen`-lijst; er
is geen nieuwe API nodig.

**Bestaand read-only patroon**: `AccountOrderModal.tsx` (klantweergave van één bestelling) is al
exact wat hier per bestelling nodig is — regels met foto/code/materiaal/maat/aantal×prijs en een
totalenblok via de gedeelde `berekenBestellingTotalen` (`src/lib/bestellingTotalen.ts`), zonder
enige bewerk- of statuswijzigingsknop. `BestellingModal.tsx` (de bewerkbare
Bestelgegevens-modal die beheer al kent) levert de visuele stijl/lay-out waar de gebruiker naar
vroeg (titel, subtitel met bestelnr/klant/datum, totalenraster rechtsboven in de subtitel).

**Vertaalsleutels**: de regel- en totalenlabels bestaan al in de `beheer`-namespace
(`bestellingenModalLabelCode`, `bestellingenModalLabelMateriaal`, `bestellingenModalLabelMaat`,
`bestellingenModalTotalLabel`, `bestellingenModalKortingLabel`, `bestellingenModalBtwLabel`,
`bestellingenModalTotaalInclLabel`, `bestellingenModalTotalIncomplete`,
`bestellingenModalPrijsOpAanvraag`, `bestellingenRegelOnbekend`) en zijn taalonafhankelijk van
"Bestelling" — herbruikbaar voor deze nieuwe modal zonder duplicatie.

**Gebruikershandleiding**: hoofdstuk "8. Drukkers" (`DrukkersChapter.tsx`) beschrijft vandaag
alleen de standaard-drukker-instelling; het bekijken van verzonden zendingen wordt nergens
genoemd, dus er is niets dat achterhaald raakt — maar dit is wel een goed moment om het toe te
voegen.

## Beslissingen

1. **Eén popup per zending, met een kaart per bestelling erin** (niet één platte regel-lijst voor
   de hele zending). Elke kaart toont: klantnaam · bestelnr · besteldatum, daaronder de regels
   van díe bestelling (foto, omschrijving, code, materiaal, maat, aantal × prijs), en daaronder
   het totaal/korting/btw/totaal-incl.-btw van díe bestelling — berekend met dezelfde
   `berekenBestellingTotalen` en (indien nodig) `resolveBtwPercentage` op basis van het land van
   de klant, exact zoals `BestellingModal`/`AccountOrderModal` dat al doen. Verworpen: één
   gecombineerde regel-lijst met totaal voor de hele zending — dat vermengt bedragen/kortingen
   van verschillende klanten door elkaar, wat verwarrend is en geen weergave is die ergens anders
   in de app al bestaat.
2. **Geen statusbadge en geen statushistorie per bestelling.** Alleen regels en bedragen. Dit is
   een compactere weergave dan `BestellingModal`; een medewerker die de actuele status wil zien
   opent de bestelling zelf via het Bestellingen-overzicht.
3. **Geen enkele bewerk- of statuswijzigingsknop.** De modal heeft alleen een "Sluiten"-knop
   (`footerActions` blijft leeg, `Modal` levert de sluitknop al standaard). Dit is puur een
   inzage-scherm van een al verzonden zending.
4. **De ruwe-mailtekst-weergave (`<pre>{zending.body}</pre>`) en de bijbehorende
   uitklap/inklap-state (`expandedZendingId`) verdwijnen volledig** uit `DrukkerModal.tsx`. De
   knop heet daardoor altijd "Bekijken" (nooit meer "Verbergen") en opent de nieuwe modal in
   plaats van inline te wisselen. `zending.body`/`zending.onderwerp` blijven in het type en de
   API bestaan (ze worden nog gebruikt om de mail te versturen — zie
   `VersturenNaarDrukkerDialog.tsx`), maar worden nergens meer gerenderd.
5. **Nieuwe component `src/components/beheer/ZendingBekijkenModal.tsx`**, in plaats van
   `BestellingModal` een "read-only mode" te geven. `BestellingModal` is al 680+ regels met veel
   bewerklogica (concept-updates, regel toevoegen/verwijderen, mail-vraag) die per definitie niet
   van toepassing is hier; een aparte, kleine component is duidelijker te begrijpen en te testen
   dan een grote component met een `readOnly`-prop die de helft van de logica uitschakelt.
6. **Props van `ZendingBekijkenModal`**: `zending: DrukkerZending | null`,
   `bestellingen: Bestelling[] | null`, `kunstwerken`, `materialen`, `maten`, `materiaalsoorten`,
   `klanten`, `btwTarieven` (dezelfde referentiedata-typen als `BestellingModal` gebruikt).
   `DrukkerModal` krijgt deze zes props erbij en geeft ze door; `DrukkersSection.tsx` en
   `BeheerShell.tsx` geven ze op hun beurt door — `BeheerShell` heeft ze al in scope (ze gaan nu
   ook al naar `BestellingenSection`).
7. **Ontbrekende bestelling in de lijst**: als een bestelnummer uit `zending.bestellingIds` niet
   voorkomt in `bestellingen` (zou in de praktijk niet moeten gebeuren, maar `bestellingen` kan
   ook nog `null` zijn terwijl geladen wordt) wordt die entry overgeslagen. Als na filtering geen
   enkele bestelling overblijft, toont de modal een korte melding
   (`drukkersZendingModalGeenBestellingen`) in plaats van een lege body.
8. **Nieuwe vertaalsleutels** (alleen `messages/nl.json`, conform de bestaande afspraak dat
   beheer-only teksten geen en/de/fr-vertaling nodig hebben): `drukkersZendingModalTitel`
   ("Zendinggegevens") en `drukkersZendingModalGeenBestellingen`. **Vervallen sleutel**:
   `drukkersZendingenVerbergen` (wordt na deze wijziging nergens meer gebruikt).
9. **Documentatie-update**: `DrukkersChapter.tsx` krijgt een korte nieuwe subsectie die het
   bekijken van een verzonden zending beschrijft, met een anker waar de nieuwe modal via
   `HelpLink` naartoe linkt (zelfde patroon als `DrukkerModal`/`BestellingModal` al gebruiken).

## Niet in scope

- Geen wijziging aan hoe een zending wordt aangemaakt of verstuurd
  (`VersturenNaarDrukkerDialog.tsx`), aan de "Markeer zending als afgerond"-knop, of aan de
  mailinhoud zelf.
- Geen nieuwe API-route: alle data komt uit `bestellingen`, dat `DrukkerModal` al als prop
  ontvangt.
- Geen wijziging aan `zending.body`/`onderwerp` in het datamodel — die blijven bestaan voor het
  versturen van de mail, alleen het renderen ervan in deze modal verdwijnt.

## Testen

- `tests/components/beheer/DrukkerModal.test.tsx`: de test "lists zendingen and expands one to
  show the full mail body" wordt herschreven naar het nieuwe gedrag (klik op "Bekijken" opent de
  popup; de popup toont klantnaam/bestelnr uit een bijpassende `Bestelling`-fixture in plaats van
  tekst uit `zending.body`). De overige zending-tests (afronden-badge, afronden-knop,
  verwijder-blokkade) blijven ongewijzigd van toepassing, want die raken niet aan de
  bekijk-popup.
- Nieuw testbestand `tests/components/beheer/ZendingBekijkenModal.test.tsx`: dekt (a) een zending
  met één bestelling toont regels + totalen, (b) een zending met meerdere bestellingen toont
  meerdere kaarten met elk hun eigen totaal, (c) een bestelnummer dat niet in `bestellingen`
  voorkomt wordt overgeslagen, (d) leeg resultaat toont de "geen bestelgegevens"-melding, (e)
  geen enkel bewerk/status-element (knoppen, inputs) is aanwezig.
