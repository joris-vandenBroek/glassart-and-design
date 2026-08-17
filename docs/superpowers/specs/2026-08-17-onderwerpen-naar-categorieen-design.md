# Onderwerpen hernoemen naar Categorieën

**Datum:** 2026-08-17
**Status:** ontwerp goedgekeurd

## Aanleiding

De klant wil dat het begrip dat nu "Onderwerp" heet, overal "Categorie" gaat heten —
in de beheeromgeving, op de klantwebsite en in de database.

## Naamgeving

Zichtbare teksten krijgen het trema, technische namen blijven ASCII (consistent met
bestaande namen als `omschrijvingNl` en `kunstwerkMaten`).

| Soort | Enkelvoud | Meervoud |
|---|---|---|
| NL-tekst | Categorie | Categorieën |
| EN-tekst | Category | Categories |
| DE-tekst | Kategorie | Kategorien |
| FR-tekst | Catégorie | Catégories |
| DB en code | `categorie`, `categorieId` | `categorieen`, `categorieIds` |

## Wat níet meegaat

Het woord "onderwerp" betekent op drie plekken het onderwerp van een e-mail. Dat is een
ander begrip en blijft ongewijzigd:

- `drukkerZendingen.onderwerp` (kolom, tabel en alle code eromheen)
- `src/app/api/mail/route.ts` en `VersturenNaarDrukkerDialog.tsx`
- de i18n-sleutel `formSubject` van het contactformulier

## Database

Één migratie: `db/migrations/2026-08-17-onderwerpen-naar-categorieen.sql`

1. `RENAME TABLE onderwerpen TO categorieen, kunstwerkOnderwerpen TO kunstwerkCategorieen`
2. De foreign key op `kunstwerkCategorieen.onderwerpId` droppen, de kolom hernoemen naar
   `categorieId`, en de foreign key opnieuw aanleggen naar `categorieen(id) ON DELETE CASCADE`.
   Expliciet droppen en herbouwen, zodat MariaDB niet aan de oude kolomnaam blijft hangen.
3. `UPDATE activiteitenlog SET type = REPLACE(type, 'onderwerp_', 'categorie_')
   WHERE type LIKE 'onderwerp\_%'` — de historie gaat mee, zodat het log geen twee
   namen naast elkaar toont.

`RENAME TABLE` behoudt alle rijen en alle ids; er wordt geen data gecopieerd. Op staging
gaat het om 16 categorieën, 78 kunstwerkkoppelingen en 2 logregels.

`db/schema.sql` en `src/lib/server/tableColumns.ts` worden in dezelfde wijziging
bijgewerkt — die twee moeten de echte schema-toestand spiegelen.

## Code

**Serverlaag**

- `src/lib/server/lookupResources.ts`: resource `onderwerpen` → `categorieen` (endpoint wordt `/api/categorieen`)
- `src/lib/server/kunstwerkRelaties.ts`: `onderwerpIds` → `categorieIds`, tabel- en kolomnaam
- `src/lib/logActiviteit.ts`: types `categorie_toegevoegd/gewijzigd/verwijderd`

**Beheer**

- `OnderwerpenSection.tsx` → `CategorieenSection.tsx`
- `BeheerNav.tsx` / `BeheerShell.tsx`: nav-id, count-prop, labelKey
- `KunstwerkenSection.tsx`: het veld op het kunstwerk plus inline-toevoegen
- `ActiviteitSection.tsx`: type-naar-tekst-mapping
- `materiaalTypes.ts`: type `Onderwerp` → `Categorie`, veld `onderwerpIds` → `categorieIds`

**Klantwebsite**

- `ProductsGrid.tsx`, `FiltersPanelContent.tsx`, `ProductModal.tsx`: state, props,
  filterlogica, chip-key en `data-testid`'s (`facet-onderwerp-option-*` →
  `facet-categorie-option-*`, `product-modal-onderwerp` → `product-modal-categorie`)

**i18n**

- `messages/nl.json`: de circa 24 beheer-sleutels hernoemd en van nieuwe teksten voorzien
- alle vier talen: `onderwerpFacetTitle` → `categorieFacetTitle` en
  `onderwerpLabel` → `categorieLabel`, met de vertalingen uit de tabel hierboven

**Import**

- `.claude/skills/import-kunstwerken/SKILL.md`
- `scripts/lib/importHttp.ts`, `scripts/lib/importBatchManifest.ts`,
  `scripts/import-kunstwerken-cli.ts` (`--tabel categorieen`)

## Gebruikershandleiding

- `StamgegevensChapter.tsx`: subsectietitel en anker `#stamgegevens-onderwerpen` →
  `#stamgegevens-categorieen`, plus de proza die segmenten/stijlen/onderwerpen opsomt
- `DocumentatieSidebar.tsx`: label en href
- `KlantWebsiteChapter.tsx`: de verwijzing in de proza

Oude bookmarks op het anker breken. Voor een interne handleiding is dat acceptabel.

Drie screenshots raken hierdoor achterhaald en worden opnieuw gemaakt:

- `public/documentatie/stamgegevens.png` (navigatie)
- `public/documentatie/kunstwerken.png` (veld in de kunstwerk-modal)
- `public/documentatie/klant-website.png` (filterpaneel)

## Tests

Hernoemd en bijgewerkt: `OnderwerpenSection.test.tsx` → `CategorieenSection.test.tsx`,
`KunstwerkenSection`, `ProductsGrid` (inclusief de mobiele variant), `ProductModal`,
`BeheerNav`, `BeheerShell`, `ActiviteitSection`, `documentatie/anchorIntegrity`,
`documentatie/chapterScreenshots`, de import-scripttests en
`tests/regression/staging-scenarios.test.ts`.

Klaar betekent: `npm test` groen en `npm run test:regression` groen.

## Uitrol

1. Migratie op staging: `npm run db:migrate -- staging`
2. Deploy naar staging en daar verifiëren
3. Expliciete toestemming van de gebruiker vragen
4. Migratie op productie: `npm run db:migrate -- productie --confirm`
5. Promotie naar productie

Stap 1 en 2 gaan direct op elkaar: tussen migratie en deploy zoekt de oude code nog naar
`onderwerpen` en is de app stuk. Hetzelfde geldt voor stap 4 en 5 op productie.

## Samenloop met andere werkzaamheden

De branch `materialen-prijs-per-m2` is nog niet gemergd en raakt dezelfde bestanden
(`KunstwerkenSection.tsx`, `ProductModal.tsx`, `materiaalTypes.ts`,
`StamgegevensChapter.tsx`, `nl.json`, `tableColumns.ts`, `schema.sql` en
`stamgegevens.png`). Die branch bevat zelf geen enkele `onderwerp`-verwijzing, dus het
gaat om samenvoegwerk, niet om een functioneel conflict. Na het samenvoegen moet
`stamgegevens.png` opnieuw gemaakt worden, omdat beide kanten dat bestand vervangen.
