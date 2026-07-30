# Prijsgroep: kortingspercentage of opslagpercentage — design

Datum: 2026-07-30

## Achtergrond

Een `Prijsgroep` (`prijsgroepen` tabel) heeft vandaag alleen een `kortingspercentage` (`db/schema.sql`, `src/components/beheer/materiaalTypes.ts:70-74`). Dit is een puur informatief/intern veld — het wordt nergens automatisch verrekend in bestelling/kunstwerk-prijzen, alleen getoond en beheerd in `PrijsgroepenSection.tsx` en gekoppeld aan een `Klant` via `prijsgroepId`. Sommige prijsgroepen moeten in plaats van een korting juist een **opslag** kunnen krijgen (bv. voor een duurdere afnamevorm). Per prijsgroep geldt: precies één van de twee (korting of opslag) moet ingevuld zijn — nooit beide, nooit geen van beide.

## Datamodel

### `prijsgroepen` tabel

```sql
kortingspercentage DECIMAL(5,2) NULL,   -- was: NOT NULL DEFAULT 0
opslagpercentage DECIMAL(5,2) NULL,      -- nieuw
CONSTRAINT chk_prijsgroep_korting_xor_opslag
  CHECK ((kortingspercentage IS NULL) <> (opslagpercentage IS NULL))
```

De constraint dwingt af dat exact één van de twee kolommen niet-NULL is, op databaseniveau — analoog aan hoe `klanten.kunstenaarId`-uniciteit recent ook als een DB-constraint is afgedwongen in plaats van alleen in app-code.

Migratie (`db/migrations/2026-07-30-prijsgroep-korting-opslag.sql`, volgens de net gestarte migraties-conventie):

```sql
ALTER TABLE prijsgroepen MODIFY kortingspercentage DECIMAL(5,2) NULL;
ALTER TABLE prijsgroepen ADD COLUMN opslagpercentage DECIMAL(5,2) NULL AFTER kortingspercentage;
ALTER TABLE prijsgroepen
  ADD CONSTRAINT chk_prijsgroep_korting_xor_opslag
  CHECK ((kortingspercentage IS NULL) <> (opslagpercentage IS NULL));
```

Bestaande rijen hebben nu allemaal een ingevulde `kortingspercentage` (ook al is dat `0`) en een lege `opslagpercentage` — dat voldoet al aan de nieuwe constraint zonder dat er data hoeft te worden aangepast.

### TypeScript-type

`src/components/beheer/materiaalTypes.ts`:

```ts
export interface Prijsgroep {
  id: string;
  naam: string;
  kortingspercentage: number | null;
  opslagpercentage: number | null;
}
```

## Beheer UI (`PrijsgroepenSection.tsx`)

- Het modal-formulier krijgt in plaats van het huidige "Kortingspercentage"-inputveld:
  - een **Type**-dropdown (`<select>`, zelfde stijl als de bestaande selects in `KlantModal.tsx`) met opties "Korting" en "Opslag";
  - één gedeeld **Percentage**-inputveld (`type="number"`), dat betekenis krijgt van de gekozen Type.
- Lokale formulierstate: `type: 'korting' | 'opslag'` (default `'korting'` bij "toevoegen") + `percentage: string`. Bij "bewerken" wordt het type/percentage afgeleid van welke van de twee kolommen niet-null is.
- Bij opslaan wordt er altijd exact één van de twee velden gezet, de andere expliciet op `null`:
  ```ts
  type === 'korting'
    ? { naam, kortingspercentage: Number(percentage), opslagpercentage: null }
    : { naam, kortingspercentage: null, opslagpercentage: Number(percentage) }
  ```
- Omdat er altijd precies één type gekozen is en dat ene gedeelde percentage-veld de bron van waarheid is, kan de gebruiker via deze UI structureel nooit "geen van beide" of "beide" invullen — er is dus geen aparte foutmelding/validatie-tak nodig. De Opslaan-knop blijft uitgeschakeld totdat zowel `naam` als `percentage` zijn ingevuld (zelfde patroon als de bestaande "uitgeschakeld tot naam is ingevuld"-check).
- **DataTable-kolommen:** de huidige enkele "Kortingspercentage"-kolom wordt vervangen door twee kolommen: "Type" (vertaalde label Korting/Opslag) en "Percentage" (bv. `15%`).

## API-laag

Geen wijziging: `prijsgroepen` blijft via de generieke `[resource]`-catch-all route lopen (`src/lib/server/lookupResources.ts`). De DB-CHECK-constraint is de server-side afdwinging; de beheer-UI kan sowieso geen ongeldige payload construeren. Mocht een toekomstig ander schrijfpad (niet via deze UI) toch een ongeldige combinatie proberen te schrijven, faalt de insert/update met een MySQL-constraint-fout, die via de bestaande generieke foutafhandeling (`withApiErrorHandling`) als een generieke fout teruggegeven wordt — voldoende voor een intern beheer-only resource.

## i18n

Alleen `messages/nl.json` (de `beheer`-namespace bestaat niet in `en.json`/`de.json`/`fr.json` — de beheeromgeving is Nederlandstalig-only). Nieuwe/aangepaste sleutels:

- `prijsgroepenColType`: "Type"
- `prijsgroepenColPercentage`: "Percentage"
- `prijsgroepenLabelType`: "Type"
- `prijsgroepenTypeKorting`: "Korting"
- `prijsgroepenTypeOpslag`: "Opslag"
- `prijsgroepenLabelPercentage`: "Percentage"

Verwijderd (niet meer gebruikt): `prijsgroepenColKortingspercentage`, `prijsgroepenLabelKortingspercentage`.

## Activiteitenlog

Geen nieuwe log-events nodig: dit is een nieuw veld binnen een bestaande, al gelogde actie (`prijsgroep_toegevoegd` / `prijsgroep_gewijzigd` in `PrijsgroepenSection.tsx`), geen nieuw actie-type.

## Tests

- `tests/components/beheer/PrijsgroepenSection.test.tsx`: fixtures krijgen `opslagpercentage: null`/waarde, testids voor het oude `prijsgroep-modal-kortingspercentage`-veld worden vervangen door een type-select + percentage-input, assertions op `onAdd`/`onUpdate`-payloads worden bijgewerkt naar het nieuwe `{ naam, kortingspercentage, opslagpercentage }`-schema.
- Overige plekken die `Prijsgroep`-fixtures gebruiken voor dropdown-doeleinden (`KlantModal.test.tsx`, `BeheerShell.test.tsx`) krijgen het verplichte `opslagpercentage`-veld toegevoegd aan hun fixtures zodat ze aan het type blijven voldoen (percentagewaarde zelf wordt daar niet getoond, dus dit is puur een type-fix).

## Scope-afbakening (niet in deze feature)

- Geen wijziging aan hoe prijzen van kunstwerken/bestellingen berekend worden — `kortingspercentage`/`opslagpercentage` blijven puur informatieve/interne velden op de prijsgroep, zoals `kortingspercentage` dat vandaag ook al is.
- Geen migratie-tooling/CLI om de SQL-migratie automatisch uit te voeren — het bestand wordt, net als de vorige migratie, handmatig één keer tegen de staging-database gedraaid.
