# Website-veld bij kunstenaar — design

## Aanleiding

Kunstenaar Jack Liemburg heeft in zijn omschrijving (in alle 4 talen) handmatig een
slotzin met link naar zijn eigen site staan, bijvoorbeeld (NL):

> Meer weten over Jack? Bekijk https://www.jacksart.nl/

Dat wordt zichtbaar gemaakt via de bestaande `LinkifiedText`-component, die URL's in
vrije tekst automatisch klikbaar maakt. Dit patroon is niet herbruikbaar: elke
kunstenaar met een eigen site moet dezelfde zin met de hand in elk van de 4
omschrijving-velden typen. Dit ontwerp voegt een los `website`-veld toe aan
`Kunstenaar` en genereert die zin automatisch wanneer het veld gevuld is.

## Data model

Eén nieuwe, nullable kolom op de bestaande `kunstenaars`-tabel:

```sql
ALTER TABLE kunstenaars ADD COLUMN website VARCHAR(500);
```

- Eén veld voor alle talen (geen `websiteNl`/`websiteFr`/`websiteDe`/`websiteEn`).
  Bewuste keuze: Jack's huidige tekst linkt per taal naar een net iets andere pagina
  (`/`, `/de/`, `/en/`), maar dat precisieniveau weegt niet op tegen 4 extra velden in
  formulier, tabel en berichten voor de rest van de kunstenaars, die maar één site
  hebben. Bij de opschoning van Jack's record wordt daarom voor alle 4 talen dezelfde
  URL gebruikt (de NL-hoofdpagina, `https://www.jacksart.nl/`).
- Geen formaatvalidatie (geen verplichte `https://`-prefix, geen regex-check) —
  consistent met hoe andere vrije-tekstvelden in dit formulier (bv.
  `prijsafspraken`) ook niet gevalideerd worden.
- Optioneel: geen `RequiredMark`, mag leeg blijven.

## Migratie (`db/migrations/2026-08-10-kunstenaar-website.sql`)

Doet twee dingen in één bestand, zoals eerdere migraties met een backfill
(`2026-08-08-klantnummer.sql`) ook data-cleanup combineren met de schemawijziging:

1. `ALTER TABLE kunstenaars ADD COLUMN website VARCHAR(500);`
2. Eenmalige opschoning van Jack Liemburg's record (op naam `'Jack Liemburg'`
   gezocht, niet op een hardcoded id):
   - `website` wordt `https://www.jacksart.nl/`.
   - De handmatige slotzin (inclusief de voorafgaande lege regel) wordt uit
     `omschrijvingNl`, `omschrijvingFr`, `omschrijvingDe` en `omschrijvingEn` geknipt,
     zodat de zin straks weer verschijnt — nu automatisch gegenereerd i.p.v.
     handmatig getypt.

Volgt de bestaande deploy-flow uit `CLAUDE.md`: eerst `npm run db:migrate --
staging`, dan deployen en verifiëren op staging, dan pas (na expliciete
toestemming) `npm run db:migrate -- productie --confirm` en promoten.

## Server-laag

- `src/lib/server/tableColumns.ts`: `website` toevoegen aan de `kunstenaars`-entry
  van `TABLE_COLUMNS`.
- `src/components/beheer/kunstenaarTypes.ts`: `Kunstenaar` krijgt
  `website: string | null`.
- `db/schema.sql`: kolom toevoegen aan de `kunstenaars`-tabeldefinitie, zodat dit
  bestand (documentatie, geen uitvoerbare migratie — zie CLAUDE.md) in sync blijft.

## Admin-formulier (`KunstenaarsSection.tsx`)

Nieuw tekstveld "Website", direct onder het Naam-veld en vóór de 4
omschrijving-velden (basale kunstenaar-info hoort bij naam/foto, niet tussen de
taalvarianten van de omschrijving). Geen `RequiredMark`.

- `LEGE_FORM.website: '' as string`.
- Nieuwe `useState` voor `website`, meegenomen in `resetForm`, `openEdit`,
  `handleSave` (in de `data`-payload naar zowel de create- als update-flow).
- `opslaanDisabled` blijft ongewijzigd — website is niet verplicht.
- Nieuwe `data-testid="kunstenaar-modal-website"` op het input-element, conform de
  bestaande naamconventie.

## Publieke weergave — kunstenaar-banner (`ProductsGrid.tsx`)

De banner toont nu al naam, foto en de locale-resolved omschrijving via
`resolveKunstenaarOmschrijving` + `LinkifiedText`. Wanneer `website` gevuld is, wordt
na de omschrijving (gescheiden door een lege regel, zelfde opmaak als Jack's huidige
tekst) een vertaalde zin toegevoegd:

- NL: `Meer weten over {naam}? Bekijk {website}`
- FR: `En savoir plus sur {naam} ? Rendez-vous sur {website}`
- DE: `Mehr über {naam} erfahren? Besuchen Sie {website}`
- EN: `Want to know more about {naam}? Visit {website}`

(Voor FR/DE/EN de bestaande formulering uit Jack's huidige — nu te verwijderen —
teksten hergebruikt, zodat de auto-gegenereerde zin er niet anders uitziet dan wat er
al stond.)

Implementatie: `src/lib/resolveKunstenaarOmschrijving.ts` krijgt een tweede, pure
functie naast de bestaande:

```ts
export function appendKunstenaarWebsiteZin(omschrijving: string, zin: string | null): string {
  return zin ? `${omschrijving}\n\n${zin}` : omschrijving;
}
```

`resolveKunstenaarOmschrijving` zelf blijft ongewijzigd (puur de locale-resolutie).
`ProductsGrid.tsx` stelt de zin samen met `tCollections` (de bestaande
`useTranslations('collectionsPage')`-instantie) en `{ naam, website }` als
interpolatie-parameters, en geeft die aan `appendKunstenaarWebsiteZin` door vóórdat
het resultaat naar `LinkifiedText` gaat — zo blijft de URL-linkificatie ongewijzigd
en hergebruikt.

Nieuwe sleutel `kunstenaarWebsiteZin` in de `collectionsPage`-namespace van alle 4
`messages/{nl,fr,de,en}.json` bestanden (klantgerichte namespace, moet dus in alle 4
talen staan — zie de bestaande constraint uit
`docs/superpowers/plans/2026-07-26-kunstenaars.md`).

Nieuwe sleutel `kunstenaarsLabelWebsite` alleen in `messages/nl.json` onder
`beheer` (admin-namespace is Nederlands-only).

## Niet in scope

- Geen wijziging aan `ProductModal.tsx` — die toont alleen de kunstenaarsnaam
  (`artiestNaam`) in de meta-lijst van een kunstwerk, geen bio, dus daar is niets aan
  te passen.
- Geen per-taal website-velden (expliciet afgewogen, zie Data model).
- Geen URL-formaatvalidatie.
- Geen wijziging aan hoe `LinkifiedText` werkt.

## Tests

- `resolveKunstenaarOmschrijving.ts`: nieuwe test(s) voor
  `appendKunstenaarWebsiteZin` (met en zonder zin).
- `KunstenaarsSection.test.tsx`: website-veld wordt getoond, ingevuld, meegestuurd
  bij opslaan (add + edit), en vooringevuld bij het openen van een bestaande
  kunstenaar met website.
- `ProductsGrid.test.tsx`: banner toont de samengestelde zin met klikbare link
  wanneer `website` gevuld is; toont geen extra zin wanneer `website` leeg/null is.
