---
name: import-kunstwerken
description: Importeer kunstwerken in bulk vanaf een lokale map afbeeldingen naar staging of productie — automatische code/formaat/maten-bepaling, segment/stijl/onderwerp-koppeling (hergebruik-eerst) en 4-talige omschrijvingen.
---

# Import-kunstwerken

Ontwerp: `docs/superpowers/specs/2026-08-10-import-kunstwerken-skill-design.md`.

**Harde afhankelijkheid.** Deze skill stuurt `kunstenaarnr` mee naar `POST /api/kunstwerken`.
Bestaat de kolom `kunstenaars.kunstenaarnr` nog niet op de doelomgeving, dan faalt
`maak-kunstwerk` met een serverfout. Controleer dit desnoods vooraf met een medewerker die
weet of dat werk al is uitgerold, vóór je met een echte run begint.

Alle CLI-aanroepen hieronder gebruiken `npx tsx scripts/import-kunstwerken-cli.ts <subcommando>
[opties]` (of `npm run import:kunstwerken -- <subcommando> [opties]`), uitgevoerd vanuit de
projectroot (`C:\projecten\Glassart and design`).

## Stap 0: nieuwe import, of een eerdere batch doorzetten?

Vraag dit als allereerste:

> "Wil je een nieuwe map met kunstwerken importeren, of een eerder gecontroleerde batch
> (via een manifest-bestand) naar een andere omgeving doorzetten?"

- **Nieuwe import** → ga naar Stap A.
- **Batch doorzetten** → vraag het pad naar het manifest-bestand
  (`.claude/skills/import-kunstwerken/runs/<datum>-<collectiecode>.json`), valideer het:

  ```
  npx tsx scripts/import-kunstwerken-cli.ts valideer-manifest --pad "<pad>"
  ```

  Bij een foutmelding: toon die aan de gebruiker en stop. Bij `OK -- N kunstwerk(en)`: lees
  het bestand zelf in (Read-tool) om `collectiecode`, `kunstenaarNaam`, `aiGegenereerd`,
  `brondirectory` en de lijst `kunstwerken` te kennen, vraag allleen de doelomgeving (Stap A.1),
  en ga direct naar **Stap B2** (per-kunstwerk, replay-variant) — sla A.2 t/m A.5 over. Er
  wordt in dit pad geen nieuw manifest geschreven; Stap C vervalt.

## Stap A: vragen vooraf (alleen bij een nieuwe import)

1. **Omgeving** — "staging" of "productie", default staging.
2. Log in vóórdat je verder vraagt (nodig om de kunstenaarslijst te tonen):

   ```
   npx tsx scripts/import-kunstwerken-cli.ts login --omgeving <omgeving>
   ```

   Vang de teruggegeven regel letterlijk op als `<cookie>` — die geef je ongewijzigd mee aan
   elk volgend subcommando met `--sessie-cookie`, voor de rest van deze hele run (ook na een
   eventuele omgevingswissel bij het doorzetten naar productie: dan log je opnieuw in tegen de
   nieuwe omgeving en gebruik je vanaf dat moment die nieuwe cookie).
3. Haal de referentiedata op en bewaar die voor de hele run:

   ```
   npx tsx scripts/import-kunstwerken-cli.ts dump-referentie --omgeving <omgeving> --sessie-cookie "<cookie>"
   ```

   Dit geeft `{ kunstenaars, segmenten, stijlen, onderwerpen, materialen, maten, kunstwerkCodes }`.
4. **Kunstenaar** — toon `referentie.kunstenaars` (kunstenaarnr + naam), laat de gebruiker
   kiezen. Onthoud het gekozen `kunstenaarnr` voor de hele batch.
5. **AI-gegenereerd?** — ja/nee, geldt voor de hele batch.
6. **Brondirectory** — pad naar de map met afbeeldingen.
7. **Collectiecode** — bijv. `GLA-AFR`, `GLA-PRO`, `GLA-SAB`. Vrije tekst, geen validatie
   tegen een vaste lijst.

Maak daarna een platte lijst van alle `.jpg`/`.jpeg`/`.png`/`.webp`-bestanden direct in de
brondirectory (geen submappen), gesorteerd op bestandsnaam. Houd een lokale lijst
`toegekendeCodes` bij, gestart als een kopie van `referentie.kunstwerkCodes` — elke code die
je in Stap B toekent, voeg je hieraan toe vóór je de volgende berekent.

## Stap B: per kunstwerk (nieuwe import)

Voor elk bestand in de brondirectory-lijst, in volgorde:

1. Bekijk de afbeelding met de Read-tool.
2. Bepaal breedte/hoogte/formaat:

   ```
   npx tsx scripts/import-kunstwerken-cli.ts analyseer-foto --pad "<volledig pad naar het bestand>"
   ```

   Geeft `{"breedte":...,"hoogte":...,"formaat":"staand"|"liggend"|"vierkant"}`.
3. Bepaal de bijpassende maten:

   ```
   npx tsx scripts/import-kunstwerken-cli.ts kies-maten --formaat <formaat> --maten-json '<referentie.maten als JSON>'
   ```

   Geeft een JSON-array van maat-id's — dit wordt `maatIds`.
4. Kies, op basis van de afbeelding en `referentie.segmenten`/`stijlen`/`onderwerpen`, het
   best passende **bestaande** segment (en eventueel stijl/onderwerp — dit mogen er meerdere
   zijn). Bestaat er echt niets passends, bedenk dan een nieuwe, korte omschrijving. Voor elke
   gekozen waarde (bestaand of nieuw):

   ```
   npx tsx scripts/import-kunstwerken-cli.ts maak-lookup-waarde --omgeving <omgeving> --sessie-cookie "<cookie>" --tabel <segmenten|stijlen|onderwerpen> --omschrijving "<tekst>"
   ```

   Geeft `{"id":...,"omschrijving":...,"hergebruikt":true|false}`. Gebruik de teruggegeven
   `id` in `segmentIds`/`stijlIds`/`onderwerpIds`. Onthoud elke `hergebruikt:false`-waarde voor
   de eindsamenvatting.
5. `materiaalIds` = alle `id`'s uit `referentie.materialen` (rechtstreeks, geen CLI-aanroep).
6. `prijsPerM2` blijft weg uit het object dat je straks meestuurt (de server laat het dan op
   `NULL` staan).
7. Bepaal de code:

   ```
   npx tsx scripts/import-kunstwerken-cli.ts volgende-code --prefix "<collectiecode>" --bestaande-codes-json '<toegekendeCodes als JSON-array>'
   ```

   Voeg de teruggegeven code meteen toe aan `toegekendeCodes` vóórdat je verdergaat.
8. Schrijf zelf een pakkende, verkoopgerichte omschrijving (2-3 zinnen) in het Nederlands,
   Engels, Duits en Frans — in lijn met de toon van de bestaande catalogus.
9. Upload de foto:

   ```
   npx tsx scripts/import-kunstwerken-cli.ts upload-foto --omgeving <omgeving> --sessie-cookie "<cookie>" --pad "<volledig pad naar het bestand>"
   ```

   Geeft `{"url":"..."}`.
10. Maak het kunstwerk aan:

    ```
    npx tsx scripts/import-kunstwerken-cli.ts maak-kunstwerk --omgeving <omgeving> --sessie-cookie "<cookie>" --json '<kunstwerk-object>'
    ```

    Het `<kunstwerk-object>` bevat: `code`, `foto` (de url uit stap 9), `kunstenaarnr`,
    `formaat`, `omschrijvingNl`/`omschrijvingEn`/`omschrijvingDe`/`omschrijvingFr`,
    `segmentIds`, `stijlIds`, `onderwerpIds`, `materiaalIds`, `maatIds`, `aiGegenereerd`.

    - Bij `{"status":"aangemaakt",...}`: ga verder met de statusregel hieronder.
    - Bij `{"status":"code-bestaat-al"}`: haal opnieuw `volgende-code` op (met de zojuist
      gefaalde code ook al in `toegekendeCodes`), en probeer stap 10 exact één keer opnieuw.
      Lukt het dan nog niet: sla dit kunstwerk over, meld het in de eindsamenvatting, en ga
      door met het volgende bestand.
11. Print een statusregel: bestandsnaam, code, formaat, gekozen segment/stijl/onderwerp
    (met `(nieuw)` achter elke `hergebruikt:false`-waarde), kunstenaar.
12. Voeg dit kunstwerk toe aan een in-memory manifest-lijst, met **waarden, geen id's**:
    `{ bestandsnaam, formaat, maten: [...breedte×hoogte-paren van de gekozen maatIds...],
    segmenten: [...gekozen omschrijvingsteksten...], stijlen: [...], onderwerpen: [...],
    omschrijvingNl, omschrijvingEn, omschrijvingDe, omschrijvingFr }`.

## Stap B2: per kunstwerk (batch doorzetten vanuit een manifest)

Voor elk item in `manifest.kunstwerken`, in volgorde. Er wordt hier **niet** opnieuw naar de
afbeelding gekeken en er wordt niets opnieuw beoordeeld — alleen omgevingsspecifieke
opzoek/aanmaak-stappen op de nieuwe omgeving:

1. Zoek `manifest.kunstenaarNaam` op in de (nieuw opgehaalde) `referentie.kunstenaars` op
   naam. Niet gevonden → meld dit, sla dit kunstwerk over en ga door (kunstenaars aanmaken
   valt buiten deze skill — dat gaat via het bestaande beheerscherm).
2. `maatIds`: `kies-maten --formaat <manifest-item.formaat> --maten-json '<referentie.maten>'`
   (stap B.3, met het formaat uit het manifest — geen nieuwe foto-analyse nodig).
3. Voor elke tekst in `manifest-item.segmenten`/`stijlen`/`onderwerpen`: `maak-lookup-waarde`
   op de nieuwe omgeving (stap B.4, ongewijzigd — hergebruikt-of-maakt-aan op de nieuwe
   omgeving).
4. `materiaalIds` = alle `id`'s uit de nieuwe `referentie.materialen`.
5. Code: `volgende-code` op de nieuwe omgeving se eigen `toegekendeCodes` (stap B.7,
   ongewijzigd).
6. Omschrijvingen: letterlijk uit het manifest-item, ongewijzigd overnemen.
7. Foto: het bronbestand moet nog bestaan op `manifest.brondirectory + '/' + bestandsnaam` —
   upload opnieuw (stap B.9) en maak het kunstwerk aan (stap B.10), inclusief dezelfde
   409-retry.
8. Print dezelfde statusregel als in stap B.11.

Er wordt in dit pad geen nieuw manifest geschreven.

## Stap C: manifest wegschrijven (alleen bij een nieuwe import)

Schrijf de in-memory manifest-lijst (Stap B.12) met de Write-tool naar
`.claude/skills/import-kunstwerken/runs/<datum>-<collectiecode>.json` (datum als
`YYYY-MM-DD`, `collectiecode` zoals opgegeven in Stap A.7), als:

```json
{
  "versie": 1,
  "collectiecode": "<collectiecode>",
  "kunstenaarNaam": "<naam van de gekozen kunstenaar>",
  "aiGegenereerd": <true|false>,
  "brondirectory": "<brondirectory>",
  "kunstwerken": [ /* Stap B.12-items */ ]
}
```

Valideer meteen erna:

```
npx tsx scripts/import-kunstwerken-cli.ts valideer-manifest --pad "<zojuist geschreven pad>"
```

Bij een foutmelding: corrigeer het bestand en valideer opnieuw vóórdat je verdergaat naar
Stap D.

## Stap D: eindsamenvatting (altijd)

Meld:
- Aantal aangemaakte kunstwerken en hun codes.
- Alle nieuw aangemaakte segment/stijl/onderwerp-waarden (`hergebruikt:false`).
- Overgeslagen/mislukte bestanden, met reden.
- Alleen bij een nieuwe import: het pad naar het manifest-bestand, met de aanbeveling: "
  Controleer dit resultaat in beheer op staging. Tevreden? Start deze skill opnieuw, kies
  'batch doorzetten', wijs dit manifest aan en kies productie als omgeving."

## Foutafhandeling

- Ontbrekende/ongeldige brondirectory → opnieuw vragen.
- Onleesbaar/corrupt afbeeldingsbestand (stap B.1/B.2 faalt) → dit bestand overslaan, melden,
  doorgaan met het volgende.
- Inloggen mislukt (Stap A.2) → meteen stoppen, er is dan nog niets geschreven.
- Foto-upload mislukt (stap B.9) → dit kunstwerk overslaan, melden, doorgaan.
- `409 code-bestaat-al` ondanks de lokale `toegekendeCodes`-boekhouding → exact één retry
  (zie stap B.10), daarna overslaan en melden.
- Bij Stap B2: kunstenaar/segment/stijl/onderwerp niet gevonden op naam/tekst op de nieuwe
  omgeving → voor segment/stijl/onderwerp automatisch aanmaken (stap B2.3 doet dit al); voor
  de kunstenaar zelf: overslaan en melden (zie B2.1).

## Wat deze skill bewust niet doet

- Geen hernummering van de bestaande GLA-HOT-serie.
- Geen materiaal- of prijslogica voorbij "alle materialen, prijs leeg".
- Geen beeldbewerking/compressie.
- Geen onbemande/automatische run — elke run, ook een doorzet-run vanuit een manifest, wordt
  door een mens gestart en bevestigd.
