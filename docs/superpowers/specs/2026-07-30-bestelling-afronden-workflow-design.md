# Design: Bestelling afronden (drukker meldt gereed)

## Context

De bestelling-workflow kent op dit moment vier statussen (`Bestelling.status`,
`src/components/beheer/BestellingenSection.tsx:28`, nog steeds een vrije `VARCHAR(50)`
in `db/schema.sql` zonder DB-enum):

```
'Te beoordelen' | 'Te versturen naar drukker' | 'Verstuurd naar drukker' | 'Afgewezen'
```

De eerste drie stappen (beoordelen/goedkeuren, bulk-selecteren, mail bouwen en
versturen naar de drukker, `drukkerZendingen`-record aanmaken) zijn al volledig gebouwd
— zie `docs/superpowers/specs/2026-07-26-drukker-order-workflow-design.md` voor die
implementatie (destijds nog op Firestore beschreven; inmiddels live op MySQL, zelfde
opzet: `bestelheaders`/`bestellines`/`drukkerZendingen`-tabellen, generieke CRUD-routes
onder `src/app/api`).

Dit deelproject voegt de ontbrekende laatste stap toe: de beheerder moet een bestelling
kunnen afronden zodra de drukker (telefonisch/per mail, buiten het systeem om) meldt dat
die geprint en verstuurd is. Facturatie/ExactOnline-koppeling blijft bewust buiten
scope, zie [[project_b2b_beheeromgeving_roadmap]] — daar wordt alleen een statusnaam
voor gereserveerd.

## Sectie A: Statusflow

Nieuwe waarde `'Afgerond'` toegevoegd aan de `Bestelling.status`-union
(`BestellingenSection.tsx:28`). Geen schemawijziging nodig voor de kolom zelf. Volledige
flow:

```
Te beoordelen ──(afwijzen)──────────────► Afgewezen [einde]
     │ (goedkeuren, alle regels geprijsd)
     ▼
Te versturen naar drukker
     │ (bulk versturen, bestaand)
     ▼
Verstuurd naar drukker
     │ (drukker meldt gereed — dit deelproject)
     ▼
Afgerond
     ⋮ (later, apart traject — nu niet bouwen)
Gefactureerd
```

`'Gefactureerd'` wordt **niet** als bereikbare status gebouwd — de naam wordt hier
alleen vastgelegd zodat een toekomstige factuur/ExactOnline-uitbreiding logisch op deze
lijst aansluit.

## Sectie B: Datamodel

> **Superseded**: het hieronder beschreven datamodel (`afgerondOp` + 3 vergelijkbare
> timestamp-kolommen op `bestelheaders`) is vervangen door de `bestelstatusHistorie`-tabel.
> Zie `docs/superpowers/plans/2026-08-06-bestelstatushistorie-refactor.md` voor het huidige
> ontwerp.

Nieuwe kolom op `bestelheaders` (`db/schema.sql`):

```sql
afgerondOp DATETIME NULL
```

Nodig omdat afronden zowel per zending (bulk) als per individuele order kan gebeuren —
zonder een eigen timestamp per order is niet zichtbaar welke orders binnen een zending
al dan niet zijn afgerond, en wanneer.

## Sectie C: Afronden op zending-niveau (default)

Uitbreiding van de bestaande zendingen-lijst in `DrukkerModal.tsx` (nu al aanwezig als
platte lijst van `drukkerZendingen`, zie Sectie D van de vorige spec) met, per zending:

- Een statusbadge afgeleid van de onderliggende bestellingen: `"X / Y afgerond"`
  (`Y` = `bestellingIds.length`, `X` = aantal daarvan met `status === 'Afgerond'`).
  Vereist dat `DrukkerModal` de volledige `Bestelling[]`-lijst als prop krijgt (zelfde
  data die `VersturenNaarDrukkerDialog` al doorkrijgt) om `bestellingIds` naar
  bestelobjecten te kunnen resolven.
- Knop **"Markeer zending als afgerond"**, alleen zichtbaar zolang `X < Y`. Actie: voor
  elke bestelling in `bestellingIds` met status `'Verstuurd naar drukker'` (dus niet al
  `'Afgerond'` of iets anders) een `PATCH /api/bestelheaders/{id}` met
  `{ status: 'Afgerond', afgerondOp: <nu> }`, sequentieel afgehandeld.
- Geen bevestigingsdialoog — het is al een bewuste, expliciete actie (past bij de
  bestaande directe knoppen in Beheer, geen extra stap voor een reversibele wijziging).

## Sectie D: Afronden / terugzetten op order-niveau

In `BestellingModal.tsx`, naast de bestaande Goedkeuren/Afwijzen-knoppen:

- Status `'Verstuurd naar drukker'` → knop **"Afronden"**: `PATCH` naar
  `{ status: 'Afgerond', afgerondOp: <nu> }`. Voor losse correcties wanneer één order uit
  een zending later klaar is dan de rest.
- Status `'Afgerond'` → knop **"Terugzetten"**: `PATCH` naar
  `{ status: 'Verstuurd naar drukker', afgerondOp: null }`. Voor foutcorrectie (bv. per
  ongeluk de hele zending afgerond terwijl één order toch nog onderweg is).
- Geen reopen-pad vanuit `'Afgewezen'` — dat blijft zoals nu een eindstatus, ongewijzigd
  ten opzichte van de vorige spec.

## Sectie E: Activiteitenlog

Twee nieuwe `ActiviteitType`-waarden, zelfde patroon en granulariteit (per order, ook
wanneer de trigger een bulk-actie op zendingniveau is) als de bestaande
`bestelling_verstuurd_naar_drukker`:

- `bestelling_afgerond` — gelogd na elke geslaagde afrond-`PATCH`, of die nu vanuit de
  zending-bulkactie komt of vanuit de losse knop in `BestellingModal`.
- `bestelling_afronding_teruggezet` — gelogd na een geslaagde "Terugzetten"-actie.

Beide krijgen een entry in `ACTIVITEIT_TYPES` (`src/lib/logActiviteit.ts`),
`TYPE_LABEL_KEYS` (`ActiviteitSection.tsx`) en een vertaalsleutel in `messages/nl.json`,
zoals gevraagd per [[feedback_ask_about_activiteitenlog]].

## Sectie F: Overige UI

- `STATUS_BADGE_CLASS` (`BestellingenSection.tsx`) krijgt een entry voor `'Afgerond'`
  (teal/success-achtige kleur, in lijn met de mockup uit de brainstormsessie).
- De bestaande simpele quickFilter-schakelaar (één actieve-status-link + "Alle
  bestellingen", per [[feedback_beheer_datatable_search_pattern]]) **blijft ongewijzigd**
  gericht op `'Te versturen naar drukker'` als actionable default. `'Afgerond'` wordt,
  net als `'Te beoordelen'` nu al, alleen bereikbaar via "Alle bestellingen" +
  zoeken/sorteren op status — geen volwaardige status-dropdown, consistent met de
  "Niet in scope"-beslissing uit de vorige spec.

## Foutafhandeling

- Zending-bulkactie: sequentieel verwerkt; bij een falende `PATCH` stopt de actie en
  toont een foutmelding met welke orders al wel afgerond zijn en welke niet — geen
  automatische retry, geen silent-partial-succes.
- "Terugzetten" heeft geen destructieve neveneffecten (alleen een statuswijziging) en
  krijgt daarom geen aparte bevestigingsstap.

## Niet in scope

- Een drukker-facing link/portal om zelf een zending als verstuurd te bevestigen —
  bewust afgewezen tijdens het ontwerp, trigger blijft puur handmatig (telefoon/mail
  buiten het systeem).
- Facturatie / ExactOnline-koppeling. `'Gefactureerd'` is alleen als toekomstige naam
  gereserveerd, geen implementatie, geen UI, geen datamodel eromheen.
- Reopenen van `'Afgewezen'` terug naar `'Te beoordelen'`.
- Een FK-relatie tussen `bestelheaders` en `drukkerZendingen` (de bestaande
  one-directional JSON-koppeling via `bestellingIds` blijft ongewijzigd) — niet nodig
  voor dit deelproject en een grotere wijziging dan het doel rechtvaardigt.
