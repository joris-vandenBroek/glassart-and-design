# Kunstenaars (artiesten) — design

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 26-07-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

Datum: 2026-07-26

## Achtergrond

Kunstwerken worden geleverd door kunstenaars. GAAD (Glassart & Design) koopt de digitale versie van een kunstwerk van de kunstenaar. Vandaag bestaat er geen echte "Kunstenaar"-entiteit: `Kunstwerk` heeft alleen een vrij tekstveld `artiest: string` (`src/components/beheer/materiaalTypes.ts:34-47`). Dit ontwerp introduceert een echte Kunstenaar-entiteit met een koppeling naar Kunstwerk, optionele koppeling naar een eigen Klant-account, en bestel-/zichtbaarheidsregels voor exclusiviteit.

## Datamodel

### Nieuwe entiteit: `Kunstenaar`

Nieuwe Firestore-collectie `kunstenaars`. Type in een nieuw bestand `src/components/beheer/kunstenaarTypes.ts`, naar analogie van `materiaalTypes.ts` / `KlantenSection.tsx`.

```ts
interface Kunstenaar {
  id: string;
  naam: string;
  foto: string | null;            // portretfoto, optioneel
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;         // zelfde flat-field-per-locale patroon als Kunstwerk
  prijsafspraken: string;         // vrije tekst, alleen intern zichtbaar (beheer), nooit klant-facing
  verkooprecht: 'alleen-kunstenaar' | 'open';
  klantId: string | null;         // optionele koppeling naar het eigen Klant-account van de kunstenaar
  exclusiefVoorKlantId: string | null;  // denormalized: welke klant (evt.) exclusief recht heeft, zie "Enforcement"
}
```

- `verkooprecht: 'alleen-kunstenaar'` betekent: alleen de kunstenaar zelf (via zijn gekoppelde Klant-account, `klantId`) mag zijn kunstwerken bestellen. Andere klanten zien de kunstwerken wel in Collecties, maar kunnen ze niet bestellen.
- `verkooprecht: 'open'` betekent: alle klanten mogen bestellen (tenzij een specifieke klant exclusief recht heeft, zie hieronder).

### `Kunstwerk` wijziging

Vervang het vrije tekstveld `artiest: string` door:

```ts
kunstenaarId: string | null;
```

De admin kiest een Kunstenaar uit een dropdown (bestaande Kunstenaars moeten dus eerst aangemaakt zijn — geen inline "nieuwe kunstenaar toevoegen" vanuit het Kunstwerk-formulier, consistent met hoe segmenten/materialen/maten nu ook al vooraf moeten bestaan).

### `Klant` wijziging

Voeg toe:

```ts
exclusieveKunstenaarIds: string[];   // default []
```

Een klant kan exclusief recht hebben op meerdere kunstenaars. Per kunstenaar geldt: maximaal één klant tegelijk mag exclusief recht hebben (afgedwongen in de beheer-UI, zie "Beheer UI").

## Beheer UI

- **Nieuwe sectie "Kunstenaars"** in de admin-navigatie (`BeheerNav.tsx` / `BeheerShell.tsx`), gebouwd als `PrijsgroepenSection.tsx` qua lijst/modal-structuur, maar mét foto-upload (zie hieronder): velden `naam`, portretfoto, de 4 omschrijving-velden (zelfde meertalige textarea-UX als Kunstwerk), `prijsafspraken` (textarea), `verkooprecht` (select/toggle), en een doorzoekbare dropdown om optioneel een bestaand `Klant`-account te koppelen (zelfde combobox-component als op de Collecties-pagina, zie verderop).
- **Portretfoto:** upload/drag-drop op dezelfde manier als bij Kunstwerk (`KunstwerkenSection.tsx`), met hergebruik van de bestaande `useKunstwerkFotoUpload`-hook (`src/lib/useKunstwerkFotoUpload.ts`) — deze is ondanks de naam al generiek (stuurt gewoon een `foto`-file naar het bestaande upload-endpoint), dus geen aanpassing nodig. Optioneel veld; een Kunstenaar zonder foto toont een placeholder/initialen, zoals gebruikelijk.
- **Verwijder-guard:** een Kunstenaar die in gebruik is bij een Kunstwerk (`kunstenaarId` match) kan niet verwijderd worden — zelfde patroon als `PrijsgroepenSection.tsx:84-90`.
- **`KunstwerkenSection.tsx`:** het vrije-tekst "artiest"-veld wordt een dropdown met bestaande Kunstenaars.
- **`KlantModal.tsx`:** nieuwe multi-select (checkbox-lijst, zelfde UX als Kunstwerk's `segmentIds`/`materiaalIds`) voor "Exclusief recht op kunstenaars". Bij het aanvinken van een kunstenaar voor klant A: als een andere klant die kunstenaar al exclusief heeft, blokkeert de UI dit met een duidelijke foutmelding. Bij opslaan wordt zowel `Klant.exclusieveKunstenaarIds` als het bijbehorende `Kunstenaar.exclusiefVoorKlantId` in dezelfde actie bijgewerkt (denormalisatie, zie hieronder).

## Zichtbaarheid & bestelrecht-afdwinging

De site is volledig statisch (geen server, alle Firestore-toegang client-side) — Firestore security rules zijn dus de enige echte handhavingslaag. Daarom wordt dit op **twee lagen** afgedwongen:

**UI-laag (UX):** de "bestellen"-knop in `ProductModal.tsx` is disabled (met tooltip/uitleg, bv. "Exclusief voor een andere klant" / "Alleen te bestellen door de kunstenaar zelf") tenzij een van deze geldt voor de ingelogde klant:
- `kunstwerk.kunstenaarId` is `null` (geen kunstenaar gekoppeld), of
- de kunstenaar heeft `verkooprecht === 'open'` én `exclusiefVoorKlantId === null`, of
- de kunstenaar heeft `exclusiefVoorKlantId === huidige klant.id`, of
- de huidige klant is de kunstenaar zelf (`kunstenaar.klantId === huidige klant.id`).

Kunstwerken die niet besteld mogen worden blijven wél zichtbaar in Collecties (zie ook hieronder) — alleen de bestel-actie wordt geblokkeerd.

**Rules-laag (echte handhaving):** de `bestellines`-create-rule (`firestore.rules:77-83`) wordt uitgebreid met dezelfde check, server-side herleid via `get()` op `kunstwerken/{kunstwerkId}` en `kunstenaars/{kunstenaarId}`:

```
allow create: if ... (bestaande checks) &&
  (
    get(/databases/$(database)/documents/kunstwerken/$(request.resource.data.kunstwerkId)).data.kunstenaarId == null ||
    (kunstenaar.verkooprecht == 'open' && kunstenaar.exclusiefVoorKlantId == null) ||
    kunstenaar.exclusiefVoorKlantId == request.auth.uid ||
    kunstenaar.klantId == request.auth.uid
  )
```

waarbij `kunstenaar` de `get()` is van `kunstenaars/{kunstwerk.kunstenaarId}`. Deze vier voorwaarden zijn een letterlijke vertaling van de vier UI-laag-voorwaarden hierboven (bewust geen geneste AND van "exclusiviteit" en "verkooprecht" samen, want dat zou een kunstenaar blokkeren die zijn eigen werk bestelt terwijl een andere klant toevallig exclusiviteit heeft — de eigen-kunstenaar-uitzondering moet onafhankelijk gelden).

(Exacte syntax wordt in de implementatiefase getoetst aan Firestore rules-taal-beperkingen, bv. of een `let`-binding voor de geneste `get()` zo toegestaan is binnen een `allow create`-expressie.)

**Waarom `exclusiefVoorKlantId` denormaliseren op `Kunstenaar`:** Firestore rules kunnen geen collectie-brede query doen ("is er een andere klant met deze kunstenaar in `exclusieveKunstenaarIds`?"). Omdat exclusiviteit al genormaliseerd is (max 1 klant per kunstenaar, afgedwongen in de beheer-UI), volstaat een denormalized pointer terug op de Kunstenaar, bijgewerkt in dezelfde beheer-actie die `Klant.exclusieveKunstenaarIds` wijzigt.

## Collecties (publieke pagina)

- Nieuwe doorzoekbare kunstenaar-dropdown (custom combobox-component — tekstinvoer + gefilterde lijst, sluit bij selectie/klik-buiten; er bestaat nog geen combobox in de codebase) naast de bestaande segment-filterknoppen in `ProductsGrid.tsx`.
- Kunstenaar-filter en segment-filter zijn combineerbaar (AND).
- Bij het selecteren van een kunstenaar verschijnt een infokaart/banner boven de grid met de portretfoto (indien aanwezig) en de omschrijving van die kunstenaar, locale-resolved via hetzelfde patroon als `resolveKunstwerkOmschrijving.ts`.
- Niet-bestelbare kunstwerken (zie hierboven) blijven zichtbaar in de gefilterde resultaten, met disabled bestel-state.
- Kunstenaar-selectie wissen ("×" / "alle kunstenaars") toont weer de normale (evt. segment-gefilterde) view.

## i18n & activiteitenlog

- Nieuwe vertaalsleutels onder de `beheer`-namespace (plus een paar klant-facing sleutels voor de Collecties-dropdown/tooltips) in `messages/nl.json`, `en.json`, `de.json`, `fr.json`.
- Nieuwe activity-types toegevoegd aan de allow-list in `firestore.rules` (`activiteitenlog/{id}` create-rule) en `src/lib/logActiviteit.ts`, gelogd op dezelfde manier als de andere entiteiten:
  - `kunstenaar_toegevoegd`
  - `kunstenaar_gewijzigd`
  - `kunstenaar_verwijderd`
  - `klant_exclusiviteit_gewijzigd`

## Scope-afbakening (niet in deze feature)

- Geen self-service registratie-flow voor kunstenaars om zelf een Kunstenaar-profiel aan te maken — koppeling Kunstenaar↔Klant gebeurt door de beheerder in de beheer-UI.
- Geen wijziging aan hoe kunstwerken-prijzen werken; dit blijft ongemoeid.
