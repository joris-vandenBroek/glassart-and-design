# Onderwerpen → Categorieën Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Het begrip dat nu "Onderwerp" heet, heet overal "Categorie" — database, API, beheer, klantwebsite, handleiding en scripts.

**Architecture:** Eén databasemigratie hernoemt de twee tabellen en zet de loghistorie om; daarna volgt de code in één mechanische identifier-sweep, zodat er geen halfvertaalde tussentoestand ontstaat. De zichtbare teksten in de vier talen en de handleiding komen daarna, en tot slot de drie screenshots.

**Tech Stack:** Next.js 14 (App Router), TypeScript, `next-intl`, MariaDB 11.8 via `mysql2` (geen ORM), Vitest tegen de echte staging-database.

## Global Constraints

- Technische namen zijn ASCII: `categorieen`, `categorie`, `categorieId`, `categorieIds`, `CategorieenSection`, `categorie_toegevoegd`.
- Zichtbare teksten hebben het trema: NL "Categorie" / "Categorieën", EN "Category" / "Categories", DE "Kategorie" / "Kategorien", FR "Catégorie" / "Catégories".
- Het woord "onderwerp" in de betekenis *e-mailonderwerp* blijft ongewijzigd. Dat is een ander begrip. De volledige uitzonderingslijst staat in Task 2 en moet letterlijk worden aangehouden.
- `db/schema.sql` en `src/lib/server/tableColumns.ts` moeten de echte schema-toestand spiegelen (harde regel in CLAUDE.md). `TABLE_COLUMNS` gooit een fout bij een onbekende kolom, dus een gemiste regel daar is een harde fout, geen stille.
- Bestaande migratiebestanden in `db/migrations/` worden **nooit** aangepast. Bestaande specs en plannen in `docs/superpowers/` ook niet: dat is historie.
- De tests draaien tegen de echte staging-database. Testopruiming moet altijd op de eigen aangemaakte rij scoped zijn, nooit een `DELETE` zonder `WHERE`.
- Werk in de worktree `C:\projecten\Glassart and design\.claude\worktrees\onderwerpen-naar-categorieen` op branch `worktree-onderwerpen-naar-categorieen`.

**Ontwerp:** `docs/superpowers/specs/2026-08-17-onderwerpen-naar-categorieen-design.md`

---

### Task 1: Databasemigratie en serverlaag

De migratie en de serverlaag moeten in één commit, omdat de staging-database gedeeld is: zodra de tabel hernoemd is, werkt de oude code niet meer.

**Files:**
- Create: `db/migrations/2026-08-17-onderwerpen-naar-categorieen.sql`
- Modify: `db/schema.sql` (regels 75, 239-246)
- Modify: `src/lib/server/tableColumns.ts:50` (niet regel 92 — dat is `drukkerZendingen.onderwerp`)
- Modify: `src/lib/server/lookupResources.ts:17`
- Modify: `src/lib/server/kunstwerkRelaties.ts` (regels 3, 10, 24, 59)
- Modify: `src/lib/logActiviteit.ts` (regels 54-56)
- Test: `tests/lib/server/kunstwerkRelaties.test.ts`, `tests/app/api/kunstwerk-relaties.test.ts`

**Interfaces:**
- Consumes: niets uit eerdere taken.
- Produces: `RelatieKolomNaam` bevat `'categorieIds'` in plaats van `'onderwerpIds'`; `KunstwerkRelaties` heeft het veld `categorieIds: string[]`; lookup-resource `categorieen` op `/api/categorieen`; activiteitentypes `categorie_toegevoegd` / `categorie_gewijzigd` / `categorie_verwijderd`. Task 2 bouwt hierop.

- [ ] **Step 1: Schrijf de migratie**

De koppeltabel wordt opnieuw opgebouwd in plaats van kolom-hernoemd. De foreign key op `onderwerpId` heeft een automatisch gegenereerde naam (`kunstwerkOnderwerpen_ibfk_2` of iets anders — dat verschilt per database), en `RENAME TABLE` hernoemt constraintnamen niet. Opnieuw aanleggen en 78 rijen overkopiëren is deterministisch en levert precies de constraints op die een verse installatie uit `db/schema.sql` ook krijgt.

Let op: de migratierunner (`scripts/lib/migrations.ts`, `splitStatements`) splitst naïef op `;` en gooit alleen regels weg die *beginnen* met `--`. Zet commentaar dus op eigen regels, nooit achter een statement.

`db/migrations/2026-08-17-onderwerpen-naar-categorieen.sql`:

```sql
-- Onderwerpen heten voortaan Categorieen (2026-08-17).
-- Ontwerp: docs/superpowers/specs/2026-08-17-onderwerpen-naar-categorieen-design.md
-- De koppeltabel wordt opnieuw opgebouwd in plaats van kolom-hernoemd: RENAME TABLE laat
-- de automatisch gegenereerde foreign-keynaam op onderwerpId staan, en die naam wil je niet
-- laten afwijken van wat een verse installatie uit db/schema.sql oplevert.
RENAME TABLE onderwerpen TO categorieen;

CREATE TABLE kunstwerkCategorieen (
  kunstwerkId CHAR(36) NOT NULL,
  categorieId CHAR(36) NOT NULL,
  volgorde INT NOT NULL,
  PRIMARY KEY (kunstwerkId, categorieId),
  FOREIGN KEY (kunstwerkId) REFERENCES kunstwerken(id) ON DELETE CASCADE,
  FOREIGN KEY (categorieId) REFERENCES categorieen(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO kunstwerkCategorieen (kunstwerkId, categorieId, volgorde)
SELECT kunstwerkId, onderwerpId, volgorde FROM kunstwerkOnderwerpen;

DROP TABLE kunstwerkOnderwerpen;

UPDATE activiteitenlog SET type = REPLACE(type, 'onderwerp_', 'categorie_') WHERE type LIKE 'onderwerp\_%';
```

- [ ] **Step 2: Werk `db/schema.sql` bij**

Twee blokken. `CREATE TABLE onderwerpen (` wordt `CREATE TABLE categorieen (`. Het hele blok `CREATE TABLE kunstwerkOnderwerpen (...)` wordt vervangen door precies de `CREATE TABLE kunstwerkCategorieen`-definitie uit Step 1.

**Laat `drukkerZendingen.onderwerp` (rond regel 170) staan.** Dat is het e-mailonderwerp van een zending.

Controleer daarna:

```bash
grep -n -i onderwerp db/schema.sql
```

Verwacht: precies één regel, `onderwerp VARCHAR(255),` binnen `drukkerZendingen`.

- [ ] **Step 3: Werk `tableColumns.ts` bij**

Regel 50 wordt:

```ts
  categorieen: ['id', 'omschrijvingNl', 'omschrijvingFr', 'omschrijvingDe', 'omschrijvingEn'],
```

De sleutel `'onderwerp'` in de `drukkerZendingen`-kolomlijst (rond regel 92) blijft ongewijzigd.

- [ ] **Step 4: Werk de serverlaag en de tests bij**

`src/lib/server/lookupResources.ts` regel 17:

```ts
  categorieen: { jsonColumns: [], writeAuthRequired: 'medewerker' },
```

`src/lib/server/kunstwerkRelaties.ts`:

```ts
export type RelatieKolomNaam = 'segmentIds' | 'materiaalIds' | 'maatIds' | 'stijlIds' | 'categorieIds';
```

en in `KunstwerkRelaties` het veld `categorieIds: string[]`, in de tabelmapping
`{ kolom: 'categorieIds', tabel: 'kunstwerkCategorieen', kolomId: 'categorieId' }`,
en in de leegwaarde `{ segmentIds: [], materiaalIds: [], maatIds: [], stijlIds: [], categorieIds: [] }`.

`src/lib/logActiviteit.ts` regels 54-56:

```ts
  'categorie_toegevoegd',
  'categorie_gewijzigd',
  'categorie_verwijderd',
```

Werk `tests/lib/server/kunstwerkRelaties.test.ts` en `tests/app/api/kunstwerk-relaties.test.ts` mee: overal `onderwerpIds` → `categorieIds`, `kunstwerkOnderwerpen` → `kunstwerkCategorieen`, `onderwerpId` → `categorieId`, `onderwerpen` → `categorieen`.

- [ ] **Step 5: Bekijk de migratiestand van staging**

```bash
npm run db:status -- staging
```

Verwacht: `2026-08-17-onderwerpen-naar-categorieen.sql` staat als openstaand. Er kan ook een migratie van de tak `materialen-prijs-per-m2` als *toegepast* in de database staan die niet in deze branch bestaat — dat wordt bewust niet als probleem gemeld en is hier geen blokkade.

- [ ] **Step 6: Pas de migratie toe op staging**

```bash
npm run db:migrate -- staging
```

Verwacht: 5 statements gelukt, `genoteerd in schema_migrations`. MySQL/MariaDB kent geen transactionele DDL: als dit halverwege faalt, stopt de runner en moet je de toestand met de hand bekijken (`SHOW TABLES LIKE '%ategorie%'`) voordat je verder gaat.

- [ ] **Step 7: Draai de tests van deze taak**

```bash
npx vitest run tests/lib/server/kunstwerkRelaties.test.ts tests/app/api/kunstwerk-relaties.test.ts tests/app/api/health-schema.test.ts
```

Verwacht: alles groen. Andere testbestanden zijn op dit moment nog rood — die noemen `onderwerpen` nog en gaan in Task 2 mee. Draai hier dus nog niet de volledige suite.

- [ ] **Step 8: Commit**

```bash
git add db/migrations/2026-08-17-onderwerpen-naar-categorieen.sql db/schema.sql src/lib/server/tableColumns.ts src/lib/server/lookupResources.ts src/lib/server/kunstwerkRelaties.ts src/lib/logActiviteit.ts tests/lib/server/kunstwerkRelaties.test.ts tests/app/api/kunstwerk-relaties.test.ts
git commit -m "refactor: hernoem onderwerpen naar categorieen in database en serverlaag"
```

---

### Task 2: Identifier-sweep door src, tests en scripts

Alle overgebleven code-identifiers en i18n-sleutelnamen in één keer, zodat TypeScript nergens half hernoemd is. De vervangingen zijn zo gekozen dat elke samengestelde naam goed valt: `onderwerpIds` → `categorieIds`, `kunstwerkOnderwerpen` → `kunstwerkCategorieen`, `OnderwerpenSection` → `CategorieenSection`, `activiteitTypeOnderwerpToegevoegd` → `activiteitTypeCategorieToegevoegd`, `matchesOnderwerp` → `matchesCategorie`.

**Files:**
- Rename: `src/components/beheer/OnderwerpenSection.tsx` → `src/components/beheer/CategorieenSection.tsx`
- Rename: `tests/components/beheer/OnderwerpenSection.test.tsx` → `tests/components/beheer/CategorieenSection.test.tsx`
- Modify: `src/components/beheer/materiaalTypes.ts`, `BeheerNav.tsx`, `BeheerShell.tsx`, `KunstwerkenSection.tsx`, `ActiviteitSection.tsx`, `LookupSection.tsx`
- Modify: `src/components/ProductsGrid.tsx`, `src/components/FiltersPanelContent.tsx`, `src/components/ProductModal.tsx`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json`
- Modify: `scripts/lib/importHttp.ts`, `scripts/lib/importBatchManifest.ts`, `scripts/import-kunstwerken-cli.ts`
- Test: `tests/components/beheer/CategorieenSection.test.tsx`, `KunstwerkenSection.test.tsx`, `BeheerNav.test.tsx`, `BeheerShell.test.tsx`, `ActiviteitSection.test.tsx`, `tests/components/ProductsGrid.test.tsx`, `ProductsGrid.mobile.test.tsx`, `ProductModal.test.tsx`, `tests/scripts/importHttp.test.ts`, `tests/scripts/importBatchManifest.test.ts`, `tests/scripts/import-kunstwerken-cli.test.ts`, `tests/regression/staging-scenarios.test.ts`

**Interfaces:**
- Consumes: `categorieIds` en de resource `categorieen` uit Task 1.
- Produces: type `Categorie` en veld `categorieIds` op `Kunstwerk` in `materiaalTypes.ts`; component `CategorieenSection`; nav-id `'categorieen'` met prop `categorieenCount`; i18n-sleutels `categorieFacetTitle`, `categorieLabel`, `navCategorieen`, `categorieen*`, `activiteitTypeCategorie*`, `kunstwerkenLabelCategorieen`, `kunstwerkenNieuweCategorie*`; testids `facet-categorie-option-<id>` en `product-modal-categorie`. Task 3 en 4 bouwen hierop.

- [ ] **Step 1: Hernoem de twee bestanden met git**

```bash
git mv src/components/beheer/OnderwerpenSection.tsx src/components/beheer/CategorieenSection.tsx
git mv tests/components/beheer/OnderwerpenSection.test.tsx tests/components/beheer/CategorieenSection.test.tsx
```

- [ ] **Step 2: Voer de sweep uit, met uitzonderingslijst**

Deze bestanden gebruiken "onderwerp" in de betekenis *e-mailonderwerp* en blijven **volledig** ongemoeid:

```
src/lib/useDrukkerZendingen.ts
src/components/beheer/VersturenNaarDrukkerDialog.tsx
src/app/api/mail/route.ts
tests/app/api/mail.test.ts
tests/app/api/drukkers.test.ts
tests/app/api/drukkernummer.test.ts
tests/app/api/drukkerZendingen.test.ts
tests/app/api/drukkerzendingen-lookup.test.ts
tests/lib/useDrukkerZendingen.test.ts
tests/components/beheer/DrukkerModal.test.tsx
tests/components/beheer/DrukkersSection.test.tsx
tests/components/beheer/ZendingBekijkenModal.test.tsx
tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx
tests/components/ContactForm.test.tsx
```

Ook uitgesloten: alles in `db/migrations/` (historie), alles in `docs/superpowers/` (historie), en de handleiding-bestanden (`src/components/beheer/documentatie/**`) die in Task 4 met de hand gaan.

De sweep zelf, over de wél mee te nemen bestanden:

```bash
FILES="src/components/beheer/materiaalTypes.ts src/components/beheer/CategorieenSection.tsx src/components/beheer/BeheerNav.tsx src/components/beheer/BeheerShell.tsx src/components/beheer/KunstwerkenSection.tsx src/components/beheer/ActiviteitSection.tsx src/components/beheer/LookupSection.tsx src/components/ProductsGrid.tsx src/components/FiltersPanelContent.tsx src/components/ProductModal.tsx scripts/lib/importHttp.ts scripts/lib/importBatchManifest.ts scripts/import-kunstwerken-cli.ts tests/components/beheer/CategorieenSection.test.tsx tests/components/beheer/KunstwerkenSection.test.tsx tests/components/beheer/BeheerNav.test.tsx tests/components/beheer/BeheerShell.test.tsx tests/components/beheer/ActiviteitSection.test.tsx tests/components/ProductsGrid.test.tsx tests/components/ProductsGrid.mobile.test.tsx tests/components/ProductModal.test.tsx tests/scripts/importHttp.test.ts tests/scripts/importBatchManifest.test.ts tests/scripts/import-kunstwerken-cli.test.ts"
sed -i 's/onderwerpen/categorieen/g; s/Onderwerpen/Categorieen/g; s/ONDERWERPEN/CATEGORIEEN/g; s/onderwerp/categorie/g; s/Onderwerp/Categorie/g' $FILES
```

- [ ] **Step 3: Werk de i18n-sleutels bij in de vier talen**

`messages/nl.json`, `en.json`, `de.json` en `fr.json` gaan **niet** door de sed: de sleutel `formSubject` heeft in het Nederlands de waarde `"Onderwerp"` en dat is het contactformulier-veld, dat blijft.

Hernoem in alle vier de talen de sleutel `onderwerpFacetTitle` → `categorieFacetTitle` en `onderwerpLabel` → `categorieLabel`, en zet de waarden:

| Bestand | `categorieFacetTitle` | `categorieLabel` |
|---|---|---|
| nl.json | `Categorie` | `Categorie` |
| en.json | `Category` | `Category` |
| de.json | `Kategorie` | `Kategorie` |
| fr.json | `Catégorie` | `Catégorie` |

Hernoem in `messages/nl.json` daarnaast deze sleutels en zet de waarden exact zo:

```json
"activiteitTypeCategorieToegevoegd": "Categorie toegevoegd",
"activiteitTypeCategorieGewijzigd": "Categorie gewijzigd",
"activiteitTypeCategorieVerwijderd": "Categorie verwijderd",
"navCategorieen": "Categorieën",
"categorieenLoadError": "Kon de categorieën niet laden. Probeer de pagina te verversen.",
"categorieenActionError": "Er is iets misgegaan. Probeer het opnieuw.",
"categorieenModalTitel": "Categoriegegevens",
"categorieenEmpty": "Geen categorieën gevonden.",
"categorieenColOmschrijving": "Omschrijving",
"categorieenLabelOmschrijvingNl": "Omschrijving (NL)",
"categorieenLabelOmschrijvingFr": "Omschrijving (FR)",
"categorieenLabelOmschrijvingDe": "Omschrijving (DE)",
"categorieenLabelOmschrijvingEn": "Omschrijving (EN)",
"categorieenToevoegen": "Categorie toevoegen",
"categorieenOpslaan": "Opslaan",
"categorieenVerwijderen": "Verwijderen",
"categorieenVerwijderBevestiging": "Deze categorie wordt nog gebruikt door {count} kunstwerk(en). Weet je zeker dat je hem wilt verwijderen?",
"kunstwerkenLabelCategorieen": "Categorieën",
"kunstwerkenNieuweCategoriePlaceholder": "Nieuwe categorie…",
"kunstwerkenNieuweCategorieToevoegen": "Toevoegen",
"kunstwerkenNieuweCategorieError": "Kon de categorie niet toevoegen. Probeer het opnieuw."
```

Houd de sleutels op hun huidige plek in het bestand staan, zodat de diff klein blijft.

- [ ] **Step 4: Werk de regressiesuite met de hand bij**

`tests/regression/staging-scenarios.test.ts` gebruikt het woord in beide betekenissen. Hernoem alles behalve de e-mailonderwerpen op de regels rond 482, 489, 770 en 1330 (`onderwerp: mail.subject`, `onderwerp: 'AUTOTEST'` en de `stap(...)`-tekst over de gebouwde mail). De rest — de `describe`-titel, `onderwerpId`, `onderwerpResponse`, `onderwerpenLijst`, `resource: 'onderwerpen'`, `onderwerpIds`, de fixture `'AUTOTEST Onderwerp Inline'` en de opruimregel `DELETE FROM onderwerpen WHERE id = ?` — gaat mee naar `categorie`.

De opruiming blijft op de eigen aangemaakte id scoped: `DELETE FROM categorieen WHERE id = ?`. Verander daar niets aan de structuur.

- [ ] **Step 5: Controleer dat er niets is blijven staan**

```bash
grep -rn -i onderwerp src tests scripts messages db/schema.sql
```

Verwacht: **alleen** treffers in de uitzonderingslijst uit Step 2, plus `db/schema.sql` met zijn ene `drukkerZendingen.onderwerp`-regel, plus `messages/*.json` met `formSubject`, plus de handleiding-bestanden onder `src/components/beheer/documentatie/` (die gaan in Task 4). Elke andere treffer is een gemiste plek.

Controleer daarna dat TypeScript nergens klaagt:

```bash
npx tsc --noEmit
```

Verwacht: geen fouten.

- [ ] **Step 6: Draai de volledige suite**

```bash
npm test
```

Verwacht: alles groen. Twee foutsoorten zijn hier te verwachten en horen zo opgelost te worden:

1. Een test verwacht `"Categorieen"` waar `nl.json` `"Categorieën"` zegt (de sed kent geen trema). Pas de verwachting in de test aan naar de trema-versie uit Step 3 — niet omgekeerd.
2. Een test verwijst naar een bestandsnaam of importpad `OnderwerpenSection`. Werk het importpad bij naar `CategorieenSection`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: hernoem onderwerp naar categorie in code, i18n en tests"
```

---

### Task 3: Gebruikershandleiding en projectdocumentatie

**Files:**
- Modify: `src/components/beheer/documentatie/chapters/StamgegevensChapter.tsx:39-42`
- Modify: `src/components/beheer/documentatie/chapters/KlantWebsiteChapter.tsx`
- Modify: `src/components/beheer/documentatie/DocumentatieSidebar.tsx:66`
- Modify: `CLAUDE.md` (de tabelopsomming in de Data layer-sectie)
- Modify: `docs/huidige-staat.md`
- Modify: `.claude/skills/import-kunstwerken/SKILL.md`
- Test: `tests/components/beheer/documentatie/anchorIntegrity.test.tsx`

**Interfaces:**
- Consumes: de nieuwe i18n-sleutels en componentnaam uit Task 2.
- Produces: anker `#stamgegevens-categorieen`. Task 4 maakt de screenshots die bij deze hoofdstukken horen.

- [ ] **Step 1: Werk het handleidinghoofdstuk bij**

In `StamgegevensChapter.tsx`: `<SubSection id="stamgegevens-onderwerpen" title="Onderwerpen">` wordt `<SubSection id="stamgegevens-categorieen" title="Categorieën">`, en de proza "Segmenten, stijlen en onderwerpen kun je ook meteen aanmaken…" wordt "Segmenten, stijlen en categorieën kun je ook meteen aanmaken…".

In `DocumentatieSidebar.tsx` regel 66: `{ href: '#stamgegevens-categorieen', label: 'Categorieën' }`.

In `KlantWebsiteChapter.tsx`: de verwijzing naar onderwerpen in de proza wordt categorieën. Zoek hem met `grep -n -i onderwerp src/components/beheer/documentatie/chapters/KlantWebsiteChapter.tsx`.

Elders in de code kan naar het oude anker gelinkt worden. Controleer:

```bash
grep -rn "stamgegevens-onderwerpen" src tests
```

Verwacht na de wijziging: geen treffers.

- [ ] **Step 2: Werk de projectdocumentatie bij**

In `CLAUDE.md` staat in de Data layer-sectie een opsomming van de 30 tabellen met daarin `onderwerpen` en `kunstwerkOnderwerpen`. Maak daar `categorieen` en `kunstwerkCategorieen` van. Laat de rest van de zin ongemoeid.

In `docs/huidige-staat.md` en `.claude/skills/import-kunstwerken/SKILL.md`: vervang de verwijzingen (`onderwerpen`-tabel, `--tabel onderwerpen`, `onderwerpIds`, de proza) door de categorie-varianten. Dit zijn levende documenten, geen historie.

- [ ] **Step 3: Draai de handleiding-tests**

```bash
npx vitest run tests/components/beheer/documentatie
```

Verwacht: groen. `anchorIntegrity.test.tsx` controleert dat elke sidebar-href een bestaand anker heeft — die test valt om als Step 1 maar half is gedaan.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: handleiding en projectdocumentatie volgen de rename naar categorieen"
```

---

### Task 4: Screenshots opnieuw maken

Drie screenshots tonen het oude woord. `scripts/check-screenshot-freshness.ts` waarschuwt hier tijdens de staging-deploy niet-blokkerend over; de beoordeling zelf hoort hier.

**Files:**
- Modify: `public/documentatie/stamgegevens.png` (navigatie met het nav-item)
- Modify: `public/documentatie/kunstwerken.png` (veld in de kunstwerk-modal)
- Modify: `public/documentatie/klant-website.png` (filterpaneel op de collectiepagina)

**Interfaces:**
- Consumes: de hernoemde UI uit Task 2 en 3, draaiend op de lokale dev-server.
- Produces: niets voor latere taken.

- [ ] **Step 1: Start de dev-server**

```bash
npm run dev
```

- [ ] **Step 2: Maak de drie screenshots**

Gebruik de werkende techniek: `claude-in-chrome` om te navigeren, `gif_creator` met `download: true` om het beeld op schijf te krijgen, en daarna een PIL-crop naar het juiste kader. Houd kadrering, breedte en zoomniveau gelijk aan de bestaande bestanden, zodat de handleiding niet ineens verspringt.

- `stamgegevens.png`: `/nl/beheer`, sectie Materialen open, navigatiekolom zichtbaar met "Categorieën" erin.
- `kunstwerken.png`: `/nl/beheer`, sectie Kunstwerken, kunstwerk-modal open met het veld "Categorieën".
- `klant-website.png`: `/nl/collecties`, filterpaneel met de facet "Categorie" zichtbaar.

Inloggen op beheer mag zonder tussenvraag.

- [ ] **Step 3: Controleer de mapping**

```bash
npx vitest run tests/components/beheer/documentatie/chapterScreenshots.test.tsx
```

Verwacht: groen — elk hoofdstuk heeft nog steeds zijn screenshot. De bestandsnamen veranderen niet, alleen de inhoud.

- [ ] **Step 4: Commit**

```bash
git add public/documentatie/stamgegevens.png public/documentatie/kunstwerken.png public/documentatie/klant-website.png
git commit -m "docs: screenshots bijgewerkt na rename naar categorieen"
```

---

### Task 5: Volledige verificatie

**Files:** geen wijzigingen; dit is de poort voor de uitrol.

**Interfaces:**
- Consumes: alle voorgaande taken.
- Produces: het bewijs dat de branch klaar is om te mergen.

- [ ] **Step 1: Volledige suite**

```bash
npm test
```

Verwacht: groen, geen overgeslagen bestanden.

- [ ] **Step 2: Regressiesuite tegen staging**

```bash
npm run test:regression
```

Verwacht: groen. Deze suite maakt echte `AUTOTEST`-rijen aan en ruimt ze in een `finally` op exacte id op; hij verstuurt geen echte e-mail. Elke run laat de bestelnummer-teller een paar nummers verder staan — dat is bekend en juist.

- [ ] **Step 3: Lint en typecheck**

```bash
npm run lint
```

```bash
npx tsc --noEmit
```

Verwacht: beide zonder fouten.

- [ ] **Step 4: Laatste sweep-controle**

```bash
grep -rn -i onderwerp src tests scripts messages db/schema.sql CLAUDE.md docs/huidige-staat.md
```

Verwacht: alleen de e-mailonderwerp-uitzonderingen uit Task 2 Step 2, plus `formSubject` in de vier taalbestanden, plus de ene `drukkerZendingen`-regel in `db/schema.sql`.

---

### Task 6: Uitrol

Volg hier de vaste route uit CLAUDE.md. Niets in deze taak mag worden overgeslagen omdat de wijziging "alleen een rename" is: de database is al om, dus productie-code die nog `onderwerpen` zoekt, is stuk.

- [ ] **Step 1: Samenvoegen met master**

Gebruik de skill `superpowers:finishing-a-development-branch`. De branch `materialen-prijs-per-m2` is nog niet gemergd en raakt dezelfde bestanden; als die tak eerst landt, verwacht dan conflicten in `KunstwerkenSection.tsx`, `ProductModal.tsx`, `materiaalTypes.ts`, `StamgegevensChapter.tsx`, `nl.json`, `tableColumns.ts`, `schema.sql` en `public/documentatie/stamgegevens.png`. Bij een conflict in dat laatste bestand: neem één kant en maak de screenshot daarna opnieuw.

- [ ] **Step 2: Deploy naar staging**

Dispatch `deploy-naar-staging.yml` op `master`. De migratie staat al op staging (Task 1), dus `scripts/check-migrations.ts` hoort te slagen. De workflow herstart Passenger zelf en tagt bij succes een nieuwe `vN`.

- [ ] **Step 3: Verifieer op staging**

Log in op beheer op staging en controleer met eigen ogen: het nav-item heet Categorieën, de sectie werkt (toevoegen, wijzigen, verwijderen), het kunstwerk-formulier koppelt categorieën inclusief inline toevoegen, het activiteitenlog toont "Categorie toegevoegd" ook voor de oude regels, en de collectiepagina filtert op Categorie in NL, EN, DE en FR.

- [ ] **Step 4: Vraag toestemming voor de productiedatabase**

Vraag de gebruiker expliciet om toestemming voordat je iets op productie draait, en vermeld daarbij dat de productiecode ná de migratie pas mee is — dus dat stap 5 en 6 direct op elkaar volgen.

- [ ] **Step 5: Migratie op productie**

```bash
npm run db:migrate -- productie --confirm
```

- [ ] **Step 6: Promoveer naar productie**

Dispatch `deploy-naar-production.yml` op `master`, met de `vN` uit stap 2 als `version`.

---

## Zelfreview

- **Dekking van het ontwerp:** database (Task 1), serverlaag (Task 1), activiteitenlog inclusief historie (Task 1 migratie + Task 2 tekst), beheer-UI (Task 2), klantwebsite in vier talen (Task 2 Step 3), import-skill en scripts (Task 2 en 3), handleiding met anker (Task 3), screenshots (Task 4), tests (Task 2 en 5), uitrol (Task 6), samenloop met `materialen-prijs-per-m2` (Task 6 Step 1). Geen sectie zonder taak.
- **Namen consistent:** `categorieen` (tabel en resource), `kunstwerkCategorieen`, `categorieId`, `categorieIds`, `Categorie` (type), `CategorieenSection`, `categorie_toegevoegd`. Deze namen zijn in Task 1 vastgelegd en in Task 2 t/m 4 letterlijk overgenomen.
- **Uitzonderingen:** de e-mailonderwerp-lijst staat één keer volledig in Task 2 Step 2 en wordt in Task 5 Step 4 nog een keer gecontroleerd.
