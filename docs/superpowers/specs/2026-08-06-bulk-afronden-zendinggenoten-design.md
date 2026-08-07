# Bulk afronden en zendinggenoten — ontwerp

Datum: 2026-08-06
Status: ontwerp, goedgekeurd voor implementatie

## Aanleiding

In `beheer > Bestellingen` kan een medewerker meerdere bestellingen tegelijk naar
de drukker sturen, maar afronden kan alleen één voor één, via de modal van een
losse bestelling. Dat is omslachtig, en belangrijker: op het moment dat je een
bestelling afrondt zie je nergens dat er in dezelfde zending nog andere
bestellingen naar diezelfde drukker zijn gegaan. Die blijven dan onbedoeld open
staan.

Dit ontwerp lost drie dingen op:

1. een quick-filter op status *Verstuurd naar drukker*;
2. meerdere bestellingen tegelijk afronden, waarbij het aanvinken van
   bestellingen alleen mogelijk is binnen de twee drukker-statussen;
3. bij het afronden melden welke andere bestellingen uit dezelfde zending nog
   open staan.

Buiten scope: de alfabetische standaardsortering van tabellen. Die is in een
parallelle sessie gebouwd en zit al in `f493cc5`.

## Uitgangssituatie in de code

- `src/components/DataTable.tsx` kent één quick-filter: `activeValue` plus een
  vaste "Alle"-link. De filterstand is interne state van de tabel.
- `src/components/beheer/BestellingenSection.tsx` geeft de `selection`-prop
  altijd door, met `isSelectable: row.status === 'Te versturen naar drukker'`.
  De selectiebalk heeft één knop: *Versturen naar drukker*.
- `src/components/beheer/BestellingModal.tsx` bevat `handleAfronden`, dat zelf
  `PATCH /api/bestelheaders/:id` doet en `bestelling_afgerond` logt.
- `drukkerZendingen` legt per verzending `bestellingIds` (JSON-array),
  `drukkerId`, `verzondenOp` en tellers vast. Opvragen kan alleen per drukker,
  via `GET /api/drukkers/:id/zendingen`.

De gegevens voor de zendinggenoot-melding bestaan dus al; wat ontbreekt is de
omgekeerde lookup van bestelling naar zending.

## A. DataTable: meerdere quick-filter links

`StatusQuickFilter` wordt een gecontroleerde optielijst:

```ts
export interface StatusQuickFilterOption {
  value: string; // '' betekent: geen filter, alle rijen
  label: string;
  testId: string; // los van `value`, want statuswaarden bevatten spaties
}

export interface StatusQuickFilter<T> {
  key: keyof T & string;
  options: StatusQuickFilterOption[];
  value: string;
  onChange: (value: string) => void;
}
```

De parent bezit de filterstand. Dat is nodig omdat `BestellingenSection` moet
weten welk filter actief is om de selectie aan of uit te zetten; twee kopieën
van dezelfde waarheid (tabel én sectie) leveren gegarandeerd een keer een bug
op waarbij de vinkjes niet matchen met wat je ziet.

Rendering: één knop per optie, in de aangeleverde volgorde, met dezelfde
onderstreepte-actieve stijl als nu. Het test-id wordt
`data-table-quick-${option.testId}`. Filteren gebeurt op
`String(row[key] ?? '') === value`, en wordt overgeslagen als `value === ''`.

Consumenten:

- `KlantenSection` — twee opties: `'Beoordelen'` (`testId: 'te-beoordelen'`) en
  `''` (`testId: 'alle'`), startwaarde `''`. Gedrag blijft identiek aan nu
  (`defaultActive: false`). De bestaande test-ids `data-table-quick-active` en
  `data-table-quick-all` verdwijnen daarmee; de klantentests worden meegenomen.
- `BestellingenSection` — drie opties: `'Te versturen naar drukker'`
  (`te-versturen`), `'Verstuurd naar drukker'` (`verstuurd`) en `''` (`alle`).
  Startwaarde `''` (Alle bestellingen), zoals nu.

## B. Selectie alleen binnen de twee drukker-statussen

`BestellingenSection` houdt `statusFilter` in state en geeft de `selection`-prop
alléén door wanneer die gelijk is aan `'Te versturen naar drukker'` of
`'Verstuurd naar drukker'`. Bij elk ander filter is er geen selectiekolom en
geen selectiebalk.

`isSelectable` wordt `row.status === statusFilter`. Omdat het filter dan al
alleen rijen met die status toont, is elke zichtbare rij selecteerbaar; de
controle blijft staan als vangnet voor het geval de statuslijst en het filter
ooit uit de pas lopen.

Wisselen van filter leegt de selectie. Het bestaande `useEffect` dat de
selectie opschoont wanneer `bestellingen` verandert, wordt meegenomen in
dezelfde opschoning: behoud alleen ids die nog bestaan én nog de status van het
actieve filter hebben.

De knop in de selectiebalk hangt af van het filter:

| Actief filter              | Knop                    | Actie                          |
| -------------------------- | ----------------------- | ------------------------------ |
| Te versturen naar drukker  | Versturen naar drukker  | bestaande dialoog              |
| Verstuurd naar drukker     | Afronden                | nieuwe afrondstroom (D)        |

De regel "aantal geselecteerd (aantal klanten)" blijft in beide gevallen staan.

## C. Zendinggenoten opzoeken

Nieuwe route `src/app/api/drukkerzendingen/route.ts`:

```
GET /api/drukkerzendingen?bestellingIds=<id>,<id>,...
```

Vereist `requireMedewerker`. Zoekt alle zendingen die minstens één van de
opgegeven bestellingen bevatten:

```sql
SELECT z.id, z.drukkerId, z.verzondenOp, z.bestellingIds, d.naam AS drukkerNaam
FROM drukkerZendingen z
JOIN drukkers d ON d.id = z.drukkerId
WHERE JSON_CONTAINS(z.bestellingIds, JSON_QUOTE(?)) OR JSON_CONTAINS(...)
ORDER BY z.verzondenOp DESC
```

Eén `JSON_CONTAINS`-term per id, ge-OR'd. Bewust niet `JSON_OVERLAPS`: dat
vereist MySQL 8.0.17 of nieuwer, terwijl `JSON_CONTAINS` vanaf 5.7 werkt en we
de exacte serverversie van mijn.host niet als aanname willen vastleggen.

Randgevallen: een lege of ontbrekende `bestellingIds`-parameter geeft `[]`
terug zonder query (geen `WHERE`-loze query die de hele tabel ophaalt). Het
aantal ids wordt begrensd op 200 om te voorkomen dat een enorme querystring een
even enorme `OR`-keten oplevert; daarboven volgt een `400`.

Geen schemawijziging, dus **geen productiemigratie nodig**.

Client-helper `src/lib/zendingGenoten.ts`:

```ts
export interface Zending {
  id: string;
  drukkerId: string;
  drukkerNaam: string;
  verzondenOp: Date | null;
  bestellingIds: string[];
}

export async function fetchZendingen(bestellingIds: string[]): Promise<Zending[]>
```

Plus een pure functie die de melding samenstelt, zodat die zonder netwerk
testbaar is:

```ts
export function openstaandeZendingGenoten(
  zendingen: Zending[],
  afTeRonden: Bestelling[],
  alleBestellingen: Bestelling[]
): { zending: Zending; bestellingen: Bestelling[] }[]
```

Deze neemt per zending de `bestellingIds`, laat de bestellingen weg die je nú
afrondt, zoekt de rest op in `alleBestellingen` en houdt alleen over wat nog
status `'Verstuurd naar drukker'` heeft. Zendingen die daarna leeg zijn vallen
af. Bestellingen die niet in `alleBestellingen` voorkomen (bijvoorbeeld
verwijderd) worden overgeslagen.

## D. Afronden: één pad voor los en bulk

De afrondknop in `BestellingModal` doet de PATCH niet langer zelf. Hij krijgt
een prop `onAfronden: (bestelling: Bestelling) => void`; `BestellingenSection`
sluit de modal en start dezelfde stroom als bij bulk. De overige acties in de
modal (goedkeuren, afwijzen, terugzetten) blijven ongewijzigd.

Stroom in `BestellingenSection`, voor zowel één als meerdere bestellingen:

1. `fetchZendingen` voor de ids die worden afgerond;
2. `openstaandeZendingGenoten` bepalen;
3. leeg → meteen afronden, zonder extra klik;
4. niet leeg → `AfrondenBevestigingDialog` tonen.

De dialoog toont per zending de drukkersnaam, de verzenddatum en de
bestelnummers die nog open staan, en heeft drie knoppen:

- **Alleen deze afronden** — alleen de oorspronkelijke selectie;
- **Ook deze afronden** — de selectie plus alle getoonde genoten;
- **Annuleren** — niets afronden.

Faalt stap 1 (netwerkfout), dan wordt er niet geblokkeerd: de bestellingen
worden gewoon afgerond en de melding blijft achterwege. Het alternatief — de
medewerker tegenhouden omdat een informatieve lookup faalt — is slechter dan
het missen van een hint.

Gedeelde helper `src/lib/afrondenBestellingen.ts`:

```ts
export async function afrondBestellingen(
  bestellingen: Bestelling[],
  actor: ActiviteitActor
): Promise<{ afgerond: Bestelling[]; mislukt: Bestelling[] }>
```

PATCH per bestelling naar `/api/bestelheaders/:id` met
`{ status: 'Afgerond' }`, en per geslaagde bestelling één
`logActiviteit('bestelling_afgerond', actor, bestelnr)` — dus één logregel per
bestelling, consistent met hoe losse afronding het nu al doet. Het
activiteitentype bestaat al, `ACTIVITEIT_TYPES` hoeft niet uitgebreid te
worden.

Deelresultaat is expliciet: geslaagde bestellingen worden in de lijst
bijgewerkt, mislukte blijven op hun oude status staan en er verschijnt een
foutmelding die vermeldt hoeveel er niet gelukt zijn. Stilzwijgend alles als
gelukt tonen terwijl de helft faalde is precies de bug die dit scherm niet moet
hebben.

## Vertalingen

Alleen `messages/nl.json`. De `beheer`-namespace bestaat niet in `en.json`,
`de.json` of `fr.json` — de beheeromgeving is enkel Nederlands, en dat blijft
zo. Nieuwe sleutels onder `beheer`:

| Sleutel                                | Nederlands (richting)                                |
| -------------------------------------- | ---------------------------------------------------- |
| `bestellingenQuickVerstuurdNaarDrukker` | Verstuurd naar drukker                               |
| `bestellingenAfrondenTitel`             | Bestellingen afronden                                |
| `bestellingenAfrondenUitleg`            | Deze zending bevatte ook bestellingen die nog open staan. |
| `bestellingenAfrondenZending`           | {drukker} — verstuurd op {datum}                     |
| `bestellingenAfrondenAlleenDeze`        | Alleen deze afronden                                 |
| `bestellingenAfrondenOokDeze`           | Ook deze afronden                                    |
| `bestellingenAfrondenFout`              | {n} bestellingen konden niet worden afgerond.        |

`bestellingenAfronden` ("Afronden") bestaat al en wordt hergebruikt als
knoplabel in de selectiebalk.

## Tests

- `tests/components/DataTable.test.tsx` — meerdere quick-filter opties,
  wisselen roept `onChange` aan, lege waarde toont alles. De bestaande
  sorteertests moeten blijven slagen.
- `tests/components/beheer/KlantenSection.test.tsx` — bestaand filtergedrag
  ongewijzigd na de migratie.
- `tests/components/beheer/BestellingenSection.test.tsx` — geen selectiekolom
  bij filter Alle; wel bij beide drukker-filters; knoplabel wisselt mee;
  filterwissel leegt de selectie.
- `tests/lib/zendingGenoten.test.ts` — `openstaandeZendingGenoten` met: geen
  zendingen, alleen al-afgeronde genoten, genoten in twee verschillende
  zendingen, onbekende id in `bestellingIds`.
- `tests/components/beheer/AfrondenBevestigingDialog.test.tsx` — beide
  knoppen leveren de juiste set bestellingen op.
- `tests/app/api/drukkerzendingen.test.ts` — lookup vindt de zending bij een id
  dat erin zit, geeft `[]` bij een onbekend id en bij een lege parameter, en
  `401` zonder sessie. Volgens de projectregel maakt deze test zijn eigen
  drukker en zending aan en verwijdert die in `afterEach` op exact het
  vastgelegde id — nooit een ongefilterde `DELETE`.

## Wat dit ontwerp bewust niet doet

- Geen permanent info-blok over zendinggenoten in `BestellingModal`; de melding
  verschijnt alleen op het moment dat het ertoe doet.
- Geen zending-kolom of groepering in de bestellingentabel.
- Geen automatisch mee-afronden zonder bevestiging.
- Geen wijziging aan de mailstroom naar de drukker.
