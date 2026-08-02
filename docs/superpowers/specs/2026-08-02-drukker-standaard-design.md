# Standaard drukker bij doorzetten naar drukker

**Datum:** 2026-08-02
**Status:** Ontwerp goedgekeurd, klaar voor implementatieplan

## Aanleiding

Bij het doorzetten van bestellingen naar een drukker (`VersturenNaarDrukkerDialog.tsx`) kan de medewerker al een drukker kiezen uit een dropdown — dat bestond al. Het enige probleem: de dialoog selecteert bij openen standaard de eerste drukker in de array (`drukkers[0]`), wat neerkomt op een willekeurige/database-volgorde-afhankelijke keuze zodra er meerdere drukkers zijn. Nu er meerdere drukkers ondersteund gaan worden, moet er een bewuste, expliciete standaardkeuze zijn in plaats van "toevallig de eerste".

## Oplossing

Eén drukker kan gemarkeerd worden als "standaard drukker" via een vlag in het drukkerbeheer. De doorzet-dialoog gebruikt die vlag als default-selectie, met een fallback naar de eerste drukker in de lijst zolang nog niemand een standaard heeft ingesteld (bijv. direct na deze migratie).

Buiten scope: laatst-gebruikte-drukker-per-klant, activiteitenlog-koppeling voor het wijzigen van de standaard-vlag (expliciet niet gewenst).

## Datamodel

`drukkers` tabel (`db/schema.sql:127-135`) krijgt een nieuwe kolom:

```sql
ALTER TABLE drukkers ADD COLUMN standaard BOOLEAN DEFAULT FALSE;
```

Naamgeving/type volgt het bestaande patroon van `staatEigenMaatToe BOOLEAN DEFAULT FALSE` (materiaalsoorten) en `aiGegenereerd BOOLEAN DEFAULT FALSE` (kunstwerken).

Precies één drukker mag `standaard = TRUE` hebben. Dit wordt **niet** afgedwongen met een database-constraint, maar op applicatieniveau: bij het opslaan van een drukker met `standaard = true` wordt eerst de vlag bij alle andere drukkers uitgezet, en pas daarna de nieuwe waarde weggeschreven. Geen transactie nodig — dit is een laag-frequente beheerhandeling door één medewerker tegelijk (geen concurrency-risico van betekenis), en past bij de rest van de query-per-actie stijl in `src/lib/server/crud.ts`.

## API-laag

`drukkers` verhuist van de generieke `[resource]` catch-all naar een eigen dedicated route, conform de bestaande projectconventie (zie `klanten`, `kunstenaars`, `instellingen`, etc. in `CLAUDE.md`):

- **`src/app/api/drukkers/route.ts`**
  - `GET` — lijst, `requireMedewerker` (zelfde gate als nu via `readAuthRequired: 'medewerker'`).
  - `POST` — aanmaken. Als `data.standaard === true`: eerst `UPDATE drukkers SET standaard = FALSE WHERE standaard = TRUE`, dan de insert via `insertRow`.
- **`src/app/api/drukkers/[id]/route.ts`**
  - `GET` — ongewijzigd (`getRow`).
  - `PATCH` — als `data.standaard === true`: eerst `UPDATE drukkers SET standaard = FALSE WHERE standaard = TRUE AND id != ?`, dan `updateRow`.
  - `DELETE` — ongewijzigd (`deleteRow`).
  - Beide routes vereisen `requireMedewerker` voor schrijven, zelfde als nu.
- `src/lib/server/lookupResources.ts`: de `drukkers`-regel (`lookupResources.ts:25`) wordt verwijderd — anders is het dode config, want de specifieke route wint sowieso van de `[resource]` catch-all bij Next.js routing.
- `src/app/api/drukkers/[id]/zendingen/route.ts` blijft ongewijzigd.

Geen wijziging aan `activiteitenlog` voor het wijzigen van de standaard-vlag.

## UI

- **`src/components/beheer/materiaalTypes.ts`**: `Drukker`-interface (regel 70-78) krijgt `standaard: boolean`.
- **`src/components/beheer/DrukkerModal.tsx`**: checkbox "Standaard drukker" toegevoegd aan het bewerkformulier, gekoppeld aan `standaard`.
- **`src/components/beheer/DrukkersSection.tsx`**: label/badge "Standaard" naast de naam van de standaard-drukker in het overzicht.
- **`src/components/beheer/VersturenNaarDrukkerDialog.tsx`**: default-selectie (regel 46-54) verandert van

  ```ts
  setDrukkerId(drukkers[0]?.id ?? '');
  ```

  naar

  ```ts
  setDrukkerId(drukkers.find((d) => d.standaard)?.id ?? drukkers[0]?.id ?? '');
  ```

  De dropdown zelf (keuzemogelijkheid voor alle drukkers) blijft ongewijzigd — die bestond al en werkt naar behoren.

## Migratie & deployment

- `db/schema.sql`: `drukkers`-tabel krijgt de nieuwe kolom.
- `db/migrations/2026-08-02-drukker-standaard.sql`: bevat de `ALTER TABLE` hierboven, met het standaard-migratie-headercomment (`-- Migration for ... -- Run once, in order, against a database still on the pre-migration schema.`).
- Na de migratie heeft geen enkele drukker `standaard = TRUE` — gedrag blijft ongewijzigd (dialoog valt terug op `drukkers[0]`) totdat een medewerker er zelf één aanvinkt. Geen datamigratie nodig om een bestaande drukker als standaard te markeren.
- Conform de staande regel: eerst staging migreren en verifiëren, dan pas — na expliciete toestemming per keer — production.

## Tests

Nieuwe vitest-tests voor de dedicated `drukkers`-routes (`POST`/`PATCH` met exclusiviteits-logica: zetten van `standaard = true` bij drukker A zet drukker B's vlag uit). Testdata wordt gescoped opgeruimd op basis van het aangemaakte record-id (geen blanket DELETE), conform de staande regel in `CLAUDE.md`.
