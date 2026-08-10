# Meertalige catalogustabellen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `segmenten`, `stijlen`, `onderwerpen`, `materiaalsoorten` and `materialen` the same four-column `omschrijvingNl/Fr/De/En` shape that `kunstenaars`/`kunstwerken` already have, so the public site shows the visitor's own language instead of always Dutch, and backfill the existing Dutch catalog content with French/German/English.

**Architecture:** One migration renames `omschrijving` to `omschrijvingNl` and adds three nullable columns per table, then backfills translations by matching on the Dutch text. A new shared `resolveOmschrijving(item, locale)` helper (generalized from the two existing near-duplicate resolvers) picks the right language client-side, falling back to Dutch. Beheer screens get the same 4-field input pattern already used for `kunstenaars`; internal/print-facing screens stay Dutch-only.

**Tech Stack:** Next.js 14 App Router, TypeScript, MySQL via `mysql2` (no ORM), `next-intl`, Vitest + Testing Library (tests run against the real shared staging MySQL database, not mocks).

## Global Constraints

- Design doc: `docs/superpowers/specs/2026-08-10-catalogus-lookup-tabellen-meertalig-design.md` — re-read it if a task here is ambiguous.
- Column type stays `VARCHAR(255)` for all 4 columns on all 5 tables (short catalog terms, not `TEXT` like `kunstenaars`/`kunstwerken`).
- `omschrijvingNl` is `NOT NULL` (required); `omschrijvingFr/De/En` are nullable in the DB but the app always writes `''` (empty string), never `NULL` — same convention `kunstenaars`/`kunstwerken` already use. Every `Omit<T, 'id'>` write must include all 4 keys.
- `resolveOmschrijving` never gets its own per-entity wrapper for the 5 new entities — call it directly. Only the two pre-existing wrappers (`resolveKunstenaarOmschrijving`, `resolveKunstwerkOmschrijving`) are kept, now delegating to it.
- Internal/staff/printer-facing screens (`KunstwerkenSection.tsx`, `MateriaalsoortenSection.tsx`, `MaterialenSection.tsx`, `LookupSection.tsx`, `BestellingModal.tsx`, `PrijsmatrixSection.tsx`, `buildDrukkerMail.ts`) always read `omschrijvingNl` directly — no locale resolution there, beheer is Dutch-only.
- Public/customer-facing surfaces (`ProductsGrid.tsx`, `FiltersPanelContent.tsx`, `ProductModal.tsx`, `AccountOrderModal.tsx`) resolve via `resolveOmschrijving(item, locale)`.
- New beheer label translation keys go **only** into `messages/nl.json` — the `beheer` namespace does not exist in `en/de/fr.json` (verified: `'beheer' in en.json === false`).
- Tests hit the real shared staging database (`tests/setup.ts` loads `.env.local`). `vitest.config.ts` has `fileParallelism: false` — don't change that. Every test that creates a row must delete only that row by captured id, never a blanket `DELETE`/`TRUNCATE`.
- Run `npm test` (not watch mode) to verify; run a single file with `npx vitest run tests/path/to/file.test.ts`.
- Do not dispatch any GitHub Actions deploy workflow and do not touch the production database — this plan stops at "ready to deploy to staging", per `CLAUDE.md`'s deploy-ordering and production-permission rules. The final task documents the remaining manual steps, it does not perform them.

---

## Files

**New:**
- `db/migrations/2026-08-10-catalogus-lookup-tabellen-meertalig.sql` — schema change + translation backfill for all 5 tables.
- `src/lib/resolveOmschrijving.ts` — shared generic locale-resolution helper.
- `tests/lib/resolveOmschrijving.test.ts` — its unit test.

**Modified (schema/backend):**
- `db/schema.sql` — document the new columns.
- `src/lib/server/tableColumns.ts` — allow-list the new column names for the 5 tables.
- `tests/app/api/lookup-resources.test.ts` — POST bodies/assertions for `segmenten`/`materiaalsoorten`/`materialen`.

**Modified (shared helper):**
- `src/lib/resolveKunstenaarOmschrijving.ts`, `src/lib/resolveKunstwerkOmschrijving.ts` — delegate to the new helper.

**Modified (types):**
- `src/components/beheer/materiaalTypes.ts` — `Segment`/`Stijl`/`Onderwerp`/`Materiaalsoort`/`Materiaal`.

**Modified (beheer UI):**
- `src/components/beheer/LookupSection.tsx` (shared by segmenten/stijlen/onderwerpen) + `messages/nl.json` + `tests/components/beheer/{Segmenten,Stijlen,Onderwerpen}Section.test.tsx`.
- `src/components/beheer/MateriaalsoortenSection.tsx` + `messages/nl.json` + its test.
- `src/components/beheer/MaterialenSection.tsx` + `messages/nl.json` + its test.
- `src/components/beheer/KunstwerkenSection.tsx` + its test.

**Modified (public site):**
- `src/components/FiltersPanelContent.tsx`, `src/components/ProductsGrid.tsx` + their tests.
- `src/components/ProductModal.tsx` + its test.
- `src/components/account/AccountOrderModal.tsx` + its test.
- `src/lib/kunstwerkMateriaal.ts` + its test (compile-fix only, see Task 11 — this function is currently unused in the UI).

**Modified (internal/staff screens):**
- `src/components/beheer/BestellingModal.tsx` + its test.
- `src/components/beheer/PrijsmatrixSection.tsx` + its test.
- `src/lib/buildDrukkerMail.ts` + its test.

---

### Task 1: Migration, schema.sql, and applying it to the shared staging database

**Files:**
- Create: `db/migrations/2026-08-10-catalogus-lookup-tabellen-meertalig.sql`
- Modify: `db/schema.sql:56-69` (segmenten/stijlen/onderwerpen), `db/schema.sql:71-86` (materiaalsoorten/materialen)

**Interfaces:**
- Produces: 5 tables each with `omschrijvingNl VARCHAR(255) NOT NULL`, `omschrijvingFr/De/En VARCHAR(255) NULL` — every later task depends on this schema existing in the database the tests run against.

Every later task's tests run against the real staging database, so this migration must be applied to staging before any other task's tests can pass. This is a normal dev-workflow step (staging is the shared dev/test database), not the production step CLAUDE.md gates on explicit permission.

- [ ] **Step 1: Write the migration file**

```sql
-- Migratie voor meertalige catalogustabellen (2026-08-10)
-- Ontwerp: docs/superpowers/specs/2026-08-10-catalogus-lookup-tabellen-meertalig-design.md
--
-- segmenten, stijlen, onderwerpen, materiaalsoorten en materialen hadden elk één
-- omschrijving-kolom (Nederlands), terwijl kunstenaars/kunstwerken al vier kolommen
-- (omschrijvingNl/Fr/De/En) hebben. Deze migratie brengt deze 5 tabellen naar hetzelfde
-- patroon. VARCHAR(255) blijft staan (korte catalogustermen, geen lopende tekst zoals bij
-- kunstenaars/kunstwerken, die TEXT gebruiken).
--
-- Uitrolvolgorde: draai deze migratie tegen een omgeving VOORDAT de code die hem
-- gebruikt daar gedeployd wordt -- zelfde eis als 2026-08-10-kunstwerk-code.sql. Tussen
-- migratie en deploy geeft de dan nog draaiende oude code (die `omschrijving`
-- selecteert/schrijft) ER_BAD_FIELD_ERROR op deze 5 tabellen; dat venster is bewust
-- geaccepteerd, zoals bij de kunstwerkcode-migratie.

ALTER TABLE segmenten CHANGE omschrijving omschrijvingNl VARCHAR(255) NOT NULL;
ALTER TABLE segmenten ADD COLUMN omschrijvingFr VARCHAR(255) AFTER omschrijvingNl;
ALTER TABLE segmenten ADD COLUMN omschrijvingDe VARCHAR(255) AFTER omschrijvingFr;
ALTER TABLE segmenten ADD COLUMN omschrijvingEn VARCHAR(255) AFTER omschrijvingDe;

ALTER TABLE stijlen CHANGE omschrijving omschrijvingNl VARCHAR(255) NOT NULL;
ALTER TABLE stijlen ADD COLUMN omschrijvingFr VARCHAR(255) AFTER omschrijvingNl;
ALTER TABLE stijlen ADD COLUMN omschrijvingDe VARCHAR(255) AFTER omschrijvingFr;
ALTER TABLE stijlen ADD COLUMN omschrijvingEn VARCHAR(255) AFTER omschrijvingDe;

ALTER TABLE onderwerpen CHANGE omschrijving omschrijvingNl VARCHAR(255) NOT NULL;
ALTER TABLE onderwerpen ADD COLUMN omschrijvingFr VARCHAR(255) AFTER omschrijvingNl;
ALTER TABLE onderwerpen ADD COLUMN omschrijvingDe VARCHAR(255) AFTER omschrijvingFr;
ALTER TABLE onderwerpen ADD COLUMN omschrijvingEn VARCHAR(255) AFTER omschrijvingDe;

ALTER TABLE materiaalsoorten CHANGE omschrijving omschrijvingNl VARCHAR(255) NOT NULL;
ALTER TABLE materiaalsoorten ADD COLUMN omschrijvingFr VARCHAR(255) AFTER omschrijvingNl;
ALTER TABLE materiaalsoorten ADD COLUMN omschrijvingDe VARCHAR(255) AFTER omschrijvingFr;
ALTER TABLE materiaalsoorten ADD COLUMN omschrijvingEn VARCHAR(255) AFTER omschrijvingDe;

ALTER TABLE materialen CHANGE omschrijving omschrijvingNl VARCHAR(255) NOT NULL;
ALTER TABLE materialen ADD COLUMN omschrijvingFr VARCHAR(255) AFTER omschrijvingNl;
ALTER TABLE materialen ADD COLUMN omschrijvingDe VARCHAR(255) AFTER omschrijvingFr;
ALTER TABLE materialen ADD COLUMN omschrijvingEn VARCHAR(255) AFTER omschrijvingDe;

-- Vertalingen voor de bestaande catalogusinhoud. Matcht op omschrijvingNl-tekst, niet op
-- id: catalogusrijen zijn per omgeving apart aangemaakt, dus staging/productie delen geen
-- id's. Rijen die niet matchen (andere spelling, of rijen die alleen in productie
-- bestaan) blijven leeg en vallen op de site terug op Nederlands, precies zoals nu.

-- segmenten
UPDATE segmenten SET omschrijvingFr = 'Abstrait', omschrijvingDe = 'Abstrakt', omschrijvingEn = 'Abstract' WHERE omschrijvingNl = 'Abstract';
UPDATE segmenten SET omschrijvingFr = 'Collections d''artistes', omschrijvingDe = 'Künstlerkollektionen', omschrijvingEn = 'Artist Collections' WHERE omschrijvingNl = 'Artist Collections';
UPDATE segmenten SET omschrijvingFr = 'Hôtel', omschrijvingDe = 'Hotel', omschrijvingEn = 'Hotel' WHERE omschrijvingNl = 'Hotel';
UPDATE segmenten SET omschrijvingFr = 'Bureau', omschrijvingDe = 'Büro', omschrijvingEn = 'Office' WHERE omschrijvingNl = 'Office';
UPDATE segmenten SET omschrijvingFr = 'Restaurant', omschrijvingDe = 'Restaurant', omschrijvingEn = 'Restaurant' WHERE omschrijvingNl = 'Restaurant';
UPDATE segmenten SET omschrijvingFr = 'Bien-être', omschrijvingDe = 'Wellness', omschrijvingEn = 'Wellness' WHERE omschrijvingNl = 'Wellness';

-- stijlen
UPDATE stijlen SET omschrijvingFr = 'Expressionnisme abstrait', omschrijvingDe = 'Abstrakter Expressionismus', omschrijvingEn = 'Abstract Expressionism' WHERE omschrijvingNl = 'Abstract Expressionisme';
UPDATE stijlen SET omschrijvingFr = 'Aquarelle', omschrijvingDe = 'Aquarell', omschrijvingEn = 'Watercolor' WHERE omschrijvingNl = 'Aquarel';
UPDATE stijlen SET omschrijvingFr = 'Art numérique', omschrijvingDe = 'Digitale Kunst', omschrijvingEn = 'Digital Art' WHERE omschrijvingNl = 'Digitale Kunst';
UPDATE stijlen SET omschrijvingFr = 'Photoréaliste', omschrijvingDe = 'Fotorealistisch', omschrijvingEn = 'Photorealistic' WHERE omschrijvingNl = 'Fotorealistisch';
UPDATE stijlen SET omschrijvingFr = 'Impressionniste', omschrijvingDe = 'Impressionistisch', omschrijvingEn = 'Impressionist' WHERE omschrijvingNl = 'Impressionistisch';
UPDATE stijlen SET omschrijvingFr = 'Line Art', omschrijvingDe = 'Line Art', omschrijvingEn = 'Line Art' WHERE omschrijvingNl = 'Line Art';
UPDATE stijlen SET omschrijvingFr = 'Minimaliste', omschrijvingDe = 'Minimalistisch', omschrijvingEn = 'Minimalist' WHERE omschrijvingNl = 'Minimalistisch';
UPDATE stijlen SET omschrijvingFr = 'Collage Mixed Media', omschrijvingDe = 'Mixed-Media-Collage', omschrijvingEn = 'Mixed Media Collage' WHERE omschrijvingNl = 'Mixed Media Collage';
UPDATE stijlen SET omschrijvingFr = 'Pop Art', omschrijvingDe = 'Pop Art', omschrijvingEn = 'Pop Art' WHERE omschrijvingNl = 'Pop Art';
UPDATE stijlen SET omschrijvingFr = 'Skyline', omschrijvingDe = 'Skyline', omschrijvingEn = 'Skyline' WHERE omschrijvingNl = 'Skyline';
UPDATE stijlen SET omschrijvingFr = 'Surréaliste', omschrijvingDe = 'Surrealistisch', omschrijvingEn = 'Surrealist' WHERE omschrijvingNl = 'Surrealistisch';
UPDATE stijlen SET omschrijvingFr = 'Noir et blanc', omschrijvingDe = 'Schwarz-Weiß', omschrijvingEn = 'Black & White' WHERE omschrijvingNl = 'Zwart-wit';

-- onderwerpen
UPDATE onderwerpen SET omschrijvingFr = 'Architecture', omschrijvingDe = 'Architektur', omschrijvingEn = 'Architecture' WHERE omschrijvingNl = 'Architectuur';
UPDATE onderwerpen SET omschrijvingFr = 'Montagnes', omschrijvingDe = 'Berge', omschrijvingEn = 'Mountains' WHERE omschrijvingNl = 'Bergen';
UPDATE onderwerpen SET omschrijvingFr = 'Fleurs & Plantes', omschrijvingDe = 'Blumen & Pflanzen', omschrijvingEn = 'Flowers & Plants' WHERE omschrijvingNl = 'Bloemen & Planten';
UPDATE onderwerpen SET omschrijvingFr = 'Forêt & Nature', omschrijvingDe = 'Wald & Natur', omschrijvingEn = 'Forest & Nature' WHERE omschrijvingNl = 'Bos & Natuur';
UPDATE onderwerpen SET omschrijvingFr = 'Animaux', omschrijvingDe = 'Tiere', omschrijvingEn = 'Animals' WHERE omschrijvingNl = 'Dieren';
UPDATE onderwerpen SET omschrijvingFr = 'Paysage onirique', omschrijvingDe = 'Traumhafte Landschaft', omschrijvingEn = 'Dreamy Landscape' WHERE omschrijvingNl = 'Dromerig Landschap';
UPDATE onderwerpen SET omschrijvingFr = 'Formes géométriques', omschrijvingDe = 'Geometrische Formen', omschrijvingEn = 'Geometric Shapes' WHERE omschrijvingNl = 'Geometrische Vormen';
UPDATE onderwerpen SET omschrijvingFr = 'Paysage', omschrijvingDe = 'Landschaft', omschrijvingEn = 'Landscape' WHERE omschrijvingNl = 'Landschap';
UPDATE onderwerpen SET omschrijvingFr = 'Portrait', omschrijvingDe = 'Porträt', omschrijvingEn = 'Portrait' WHERE omschrijvingNl = 'Portret';
UPDATE onderwerpen SET omschrijvingFr = 'Espace & Cosmos', omschrijvingDe = 'Raum & Kosmos', omschrijvingEn = 'Space & Cosmos' WHERE omschrijvingNl = 'Ruimte & Kosmos';
UPDATE onderwerpen SET omschrijvingFr = 'Spiritualité & Zen', omschrijvingDe = 'Spiritualität & Zen', omschrijvingEn = 'Spirituality & Zen' WHERE omschrijvingNl = 'Spiritualiteit & Zen';
UPDATE onderwerpen SET omschrijvingFr = 'Paysage urbain', omschrijvingDe = 'Stadtansicht', omschrijvingEn = 'Cityscape' WHERE omschrijvingNl = 'Stadsgezicht';
UPDATE onderwerpen SET omschrijvingFr = 'Formes & Couleurs', omschrijvingDe = 'Formen & Farben', omschrijvingEn = 'Shapes & Colors' WHERE omschrijvingNl = 'Vormen & Kleuren';
UPDATE onderwerpen SET omschrijvingFr = 'Mer & Plage', omschrijvingDe = 'Meer & Strand', omschrijvingEn = 'Sea & Beach' WHERE omschrijvingNl = 'Zee & Strand';

-- materiaalsoorten
UPDATE materiaalsoorten SET omschrijvingFr = 'Acrylique', omschrijvingDe = 'Acryl', omschrijvingEn = 'Acrylic' WHERE omschrijvingNl = 'Acryl';
UPDATE materiaalsoorten SET omschrijvingFr = 'Dibond', omschrijvingDe = 'Dibond', omschrijvingEn = 'Dibond' WHERE omschrijvingNl = 'Dibond';
UPDATE materiaalsoorten SET omschrijvingFr = 'Verre de sécurité', omschrijvingDe = 'Sicherheitsglas', omschrijvingEn = 'Safety Glass' WHERE omschrijvingNl = 'Veiligheidsglas';

-- materialen
UPDATE materialen SET omschrijvingFr = 'Léger et clair, avec un aspect brillant et luxueux.', omschrijvingDe = 'Leicht und klar mit einem edlen, glänzenden Look.', omschrijvingEn = 'Light and clear with a luxurious glossy look.' WHERE omschrijvingNl = 'Licht en helder met een luxe glanzende look.';
UPDATE materialen SET omschrijvingFr = 'Plus de profondeur et de robustesse pour un effet impressionnant.', omschrijvingDe = 'Mehr Tiefe und Stabilität für einen beeindruckenden Effekt.', omschrijvingEn = 'Extra depth and sturdiness for an impressive effect.' WHERE omschrijvingNl = 'Extra diepte en stevigheid voor een indrukwekkend effect.';
UPDATE materialen SET omschrijvingFr = 'Effet de profondeur maximal pour une présentation exclusive.', omschrijvingDe = 'Maximale Tiefenwirkung für eine exklusive Präsentation.', omschrijvingEn = 'Maximum depth effect for an exclusive presentation.' WHERE omschrijvingNl = 'Maximale diepwerking voor exclusieve presentatie.';
UPDATE materialen SET omschrijvingFr = 'Léger, rigide et indéformable, avec une finition mate.', omschrijvingDe = 'Leicht, steif und formstabil mit einer matten Optik.', omschrijvingEn = 'Lightweight, rigid and dimensionally stable with a matte finish.' WHERE omschrijvingNl = 'Lichtgewicht, stijf en vormvast met een matte uitstraling.';
UPDATE materialen SET omschrijvingFr = 'Notre spécialité. Cristallin, résistant et sécurisé.', omschrijvingDe = 'Unsere Spezialität. Kristallklar, stark und sicher.', omschrijvingEn = 'Our specialty. Crystal clear, strong and safe.' WHERE omschrijvingNl = 'Onze specialiteit. Kristalhelder, sterk en veilig.';
```

- [ ] **Step 2: Update `db/schema.sql`**

Replace `db/schema.sql:56-69`:

```sql
CREATE TABLE segmenten (
  id CHAR(36) PRIMARY KEY,
  omschrijving VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE stijlen (
  id CHAR(36) PRIMARY KEY,
  omschrijving VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE onderwerpen (
  id CHAR(36) PRIMARY KEY,
  omschrijving VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

with:

```sql
CREATE TABLE segmenten (
  id CHAR(36) PRIMARY KEY,
  omschrijvingNl VARCHAR(255) NOT NULL,
  omschrijvingFr VARCHAR(255),
  omschrijvingDe VARCHAR(255),
  omschrijvingEn VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE stijlen (
  id CHAR(36) PRIMARY KEY,
  omschrijvingNl VARCHAR(255) NOT NULL,
  omschrijvingFr VARCHAR(255),
  omschrijvingDe VARCHAR(255),
  omschrijvingEn VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE onderwerpen (
  id CHAR(36) PRIMARY KEY,
  omschrijvingNl VARCHAR(255) NOT NULL,
  omschrijvingFr VARCHAR(255),
  omschrijvingDe VARCHAR(255),
  omschrijvingEn VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Replace `db/schema.sql:71-86`:

```sql
CREATE TABLE materiaalsoorten (
  id CHAR(36) PRIMARY KEY,
  omschrijving VARCHAR(255) NOT NULL,
  staatEigenMaatToe BOOLEAN DEFAULT FALSE,
  maxBreedte INT,
  maxHoogte INT,
  levertijdMaandenEigenMaat INT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE materialen (
  id CHAR(36) PRIMARY KEY,
  materiaalsoortId CHAR(36) NOT NULL,
  materiaaldikte DECIMAL(5,1) NOT NULL,
  omschrijving VARCHAR(255) NOT NULL,
  FOREIGN KEY (materiaalsoortId) REFERENCES materiaalsoorten(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

with:

```sql
CREATE TABLE materiaalsoorten (
  id CHAR(36) PRIMARY KEY,
  omschrijvingNl VARCHAR(255) NOT NULL,
  omschrijvingFr VARCHAR(255),
  omschrijvingDe VARCHAR(255),
  omschrijvingEn VARCHAR(255),
  staatEigenMaatToe BOOLEAN DEFAULT FALSE,
  maxBreedte INT,
  maxHoogte INT,
  levertijdMaandenEigenMaat INT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE materialen (
  id CHAR(36) PRIMARY KEY,
  materiaalsoortId CHAR(36) NOT NULL,
  materiaaldikte DECIMAL(5,1) NOT NULL,
  omschrijvingNl VARCHAR(255) NOT NULL,
  omschrijvingFr VARCHAR(255),
  omschrijvingDe VARCHAR(255),
  omschrijvingEn VARCHAR(255),
  FOREIGN KEY (materiaalsoortId) REFERENCES materiaalsoorten(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 3: Check current migration status on staging**

Run: `npm run db:status -- staging`
Expected: lists the new migration file as pending, all earlier ones as applied.

- [ ] **Step 4: Apply the migration to staging**

Run: `npm run db:migrate -- staging`
Expected: reports the migration applied successfully, no errors.

- [ ] **Step 5: Spot-check the backfill**

Run (from repo root, using the project's own DB env):
```bash
node --env-file=.env.local -e "
const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT||3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const [rows] = await pool.query('SELECT omschrijvingNl, omschrijvingFr, omschrijvingDe, omschrijvingEn FROM segmenten ORDER BY omschrijvingNl');
  console.log(rows);
  await pool.end();
})();
"
```
Expected: every row has non-null `omschrijvingFr/De/En` matching the translation table above (all 6 staging segmenten were covered).

- [ ] **Step 6: Commit**

```bash
git add db/migrations/2026-08-10-catalogus-lookup-tabellen-meertalig.sql db/schema.sql
git commit -m "feat: maak segmenten/stijlen/onderwerpen/materiaalsoorten/materialen meertalig"
```

---

### Task 2: Backend allow-list + generic-resource API test

**Files:**
- Modify: `src/lib/server/tableColumns.ts:47-49` (segmenten/stijlen/onderwerpen), `:50-56` (materiaalsoorten), materialen entry
- Test: `tests/app/api/lookup-resources.test.ts`

**Interfaces:**
- Consumes: the migrated schema from Task 1.
- Produces: `TABLE_COLUMNS.segmenten/stijlen/onderwerpen/materiaalsoorten/materialen` now list `omschrijvingNl`, `omschrijvingFr`, `omschrijvingDe`, `omschrijvingEn` instead of `omschrijving` — every later task's API calls depend on this allow-list.

- [ ] **Step 1: Update the failing test expectations first**

In `tests/app/api/lookup-resources.test.ts`, apply these exact replacements (all other lines in the file are unaffected):

Line 111: `jsonRequest('POST', { omschrijving: 'Hotel' }, await medewerkerCookie())` → `jsonRequest('POST', { omschrijvingNl: 'Hotel', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' }, await medewerkerCookie())`

Line 120: `expect(found.omschrijving).toBe('Hotel');` → `expect(found.omschrijvingNl).toBe('Hotel');`

Line 124: `jsonRequest('POST', { omschrijving: 'Hack' })` → `jsonRequest('POST', { omschrijvingNl: 'Hack', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' })`

Line 169: `jsonRequest('POST', { omschrijving: 'Restaurant' }, cookie)` → `jsonRequest('POST', { omschrijvingNl: 'Restaurant', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' }, cookie)`

Line 177: `expect((await getResponse.json()).omschrijving).toBe('Restaurant');` → `expect((await getResponse.json()).omschrijvingNl).toBe('Restaurant');`

Line 179: `jsonRequest('PATCH', { omschrijving: 'Restaurantpand' }, cookie)` → `jsonRequest('PATCH', { omschrijvingNl: 'Restaurantpand' }, cookie)`

Line 185: `expect((await updatedResponse.json()).omschrijving).toBe('Restaurantpand');` → `expect((await updatedResponse.json()).omschrijvingNl).toBe('Restaurantpand');`

Line 199: `jsonRequest('POST', { omschrijving: 'Kantoor' }, cookie)` → `jsonRequest('POST', { omschrijvingNl: 'Kantoor', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' }, cookie)`

Line 205: `jsonRequest('PATCH', { omschrijving: 'Hack' })` → `jsonRequest('PATCH', { omschrijvingNl: 'Hack' })`

Line 270: `jsonRequest('POST', { omschrijving: 'Guard soort' }, cookie)` → `jsonRequest('POST', { omschrijvingNl: 'Guard soort', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' }, cookie)`

Line 276: `jsonRequest('POST', { materiaalsoortId: soort.id, materiaaldikte: 4, omschrijving: 'Guard materiaal' }, cookie)` → `jsonRequest('POST', { materiaalsoortId: soort.id, materiaaldikte: 4, omschrijvingNl: 'Guard materiaal', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' }, cookie)`

(PATCH bodies for updates only need to send the changed key — `TABLE_COLUMNS` gates the allow-list per-key, `updateRow` doesn't require every column, matching the existing PATCH-with-partial-body pattern already in this file.)

- [ ] **Step 2: Run the test to see it fail against the still-unmigrated allow-list**

Run: `npx vitest run tests/app/api/lookup-resources.test.ts`
Expected: FAIL — `insertRow`/`updateRow` throw because `omschrijvingNl` is not yet in `TABLE_COLUMNS.segmenten` (or the response body still carries the old `omschrijving` key from a stale row created before Task 1, depending on which assertion runs first). Either way, at least one assertion fails.

- [ ] **Step 3: Update `tableColumns.ts`**

Replace `src/lib/server/tableColumns.ts:47-49`:

```ts
  segmenten: ['id', 'omschrijving'],
  stijlen: ['id', 'omschrijving'],
  onderwerpen: ['id', 'omschrijving'],
```

with:

```ts
  segmenten: ['id', 'omschrijvingNl', 'omschrijvingFr', 'omschrijvingDe', 'omschrijvingEn'],
  stijlen: ['id', 'omschrijvingNl', 'omschrijvingFr', 'omschrijvingDe', 'omschrijvingEn'],
  onderwerpen: ['id', 'omschrijvingNl', 'omschrijvingFr', 'omschrijvingDe', 'omschrijvingEn'],
```

Find the `materiaalsoorten` entry (around line 50) and replace its `'omschrijving'` element with `'omschrijvingNl', 'omschrijvingFr', 'omschrijvingDe', 'omschrijvingEn'`, keeping `'staatEigenMaatToe', 'maxBreedte', 'maxHoogte', 'levertijdMaandenEigenMaat'` unchanged. Do the same for the `materialen` entry, keeping `'materiaalsoortId', 'materiaaldikte'` unchanged.

- [ ] **Step 4: Run the test again**

Run: `npx vitest run tests/app/api/lookup-resources.test.ts`
Expected: PASS (all tests in the file green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/tableColumns.ts tests/app/api/lookup-resources.test.ts
git commit -m "feat: sta omschrijvingNl/Fr/De/En toe voor de 5 catalogustabellen"
```

---

### Task 3: Shared `resolveOmschrijving` helper

**Files:**
- Create: `src/lib/resolveOmschrijving.ts`
- Create: `tests/lib/resolveOmschrijving.test.ts`
- Modify: `src/lib/resolveKunstenaarOmschrijving.ts`, `src/lib/resolveKunstwerkOmschrijving.ts`

**Interfaces:**
- Produces: `resolveOmschrijving(item: MeertaligeOmschrijving, locale: string): string` — every task from Task 9 onward calls this directly for segment/stijl/onderwerp/materiaalsoort/materiaal.
- Consumes: nothing from earlier tasks.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/resolveOmschrijving.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveOmschrijving } from '@/lib/resolveOmschrijving';

const BASE = {
  omschrijvingNl: 'Nederlandse tekst',
  omschrijvingFr: 'Texte français',
  omschrijvingDe: 'Deutscher Text',
  omschrijvingEn: 'English text',
};

describe('resolveOmschrijving', () => {
  it('returns the Dutch description for locale "nl"', () => {
    expect(resolveOmschrijving(BASE, 'nl')).toBe('Nederlandse tekst');
  });

  it('returns the French description for locale "fr" when filled in', () => {
    expect(resolveOmschrijving(BASE, 'fr')).toBe('Texte français');
  });

  it('returns the German description for locale "de" when filled in', () => {
    expect(resolveOmschrijving(BASE, 'de')).toBe('Deutscher Text');
  });

  it('returns the English description for locale "en" when filled in', () => {
    expect(resolveOmschrijving(BASE, 'en')).toBe('English text');
  });

  it('falls back to Dutch when the French description is empty', () => {
    expect(resolveOmschrijving({ ...BASE, omschrijvingFr: '' }, 'fr')).toBe('Nederlandse tekst');
  });

  it('falls back to Dutch for an unrecognized locale', () => {
    expect(resolveOmschrijving(BASE, 'es')).toBe('Nederlandse tekst');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/lib/resolveOmschrijving.test.ts`
Expected: FAIL with "Cannot find module '@/lib/resolveOmschrijving'" (or similar — the module doesn't exist yet).

- [ ] **Step 3: Implement the helper**

Create `src/lib/resolveOmschrijving.ts`:

```ts
export interface MeertaligeOmschrijving {
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;
}

export function resolveOmschrijving(item: MeertaligeOmschrijving, locale: string): string {
  const byLocale: Record<string, string> = {
    fr: item.omschrijvingFr,
    de: item.omschrijvingDe,
    en: item.omschrijvingEn,
  };
  return byLocale[locale] || item.omschrijvingNl;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run tests/lib/resolveOmschrijving.test.ts`
Expected: PASS (6/6).

- [ ] **Step 5: Refactor the two existing resolvers to delegate**

Read `src/lib/resolveKunstenaarOmschrijving.ts` (currently duplicates the same `byLocale` logic). Replace its full contents with:

```ts
import type { Kunstenaar } from '@/components/beheer/kunstenaarTypes';
import { resolveOmschrijving } from './resolveOmschrijving';

export function resolveKunstenaarOmschrijving(kunstenaar: Kunstenaar, locale: string): string {
  return resolveOmschrijving(kunstenaar, locale);
}
```

Read `src/lib/resolveKunstwerkOmschrijving.ts` and replace its full contents with:

```ts
import type { Kunstwerk } from '@/components/beheer/materiaalTypes';
import { resolveOmschrijving } from './resolveOmschrijving';

export function resolveKunstwerkOmschrijving(kunstwerk: Kunstwerk, locale: string): string {
  return resolveOmschrijving(kunstwerk, locale);
}
```

- [ ] **Step 6: Run the existing resolver tests to confirm the refactor didn't break them**

Run: `npx vitest run tests/lib/resolveKunstenaarOmschrijving.test.ts`
Expected: PASS (6/6, unchanged behavior).

(There is no `resolveKunstwerkOmschrijving.test.ts` file — its behavior is exercised indirectly through `ProductsGrid.test.tsx`/`ProductModal.test.tsx`, which Task 9/10 touch.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/resolveOmschrijving.ts tests/lib/resolveOmschrijving.test.ts src/lib/resolveKunstenaarOmschrijving.ts src/lib/resolveKunstwerkOmschrijving.ts
git commit -m "refactor: trek resolveOmschrijving als gedeelde helper uit de kunstenaar/kunstwerk-varianten"
```

---

### Task 4: Types

**Files:**
- Modify: `src/components/beheer/materiaalTypes.ts:1-42`

**Interfaces:**
- Consumes: nothing.
- Produces: `Segment`, `Stijl`, `Onderwerp`, `Materiaalsoort`, `Materiaal` each expose `omschrijvingNl: string; omschrijvingFr: string; omschrijvingDe: string; omschrijvingEn: string` instead of `omschrijving: string` — every remaining task's TypeScript depends on this.

- [ ] **Step 1: Update the type definitions**

In `src/components/beheer/materiaalTypes.ts`, replace:

```ts
export interface Materiaalsoort {
  id: string;
  omschrijving: string;
  staatEigenMaatToe?: boolean;
  maxBreedte?: number | null;
  maxHoogte?: number | null;
  levertijdMaandenEigenMaat?: number | null;
}

export interface Materiaal {
  id: string;
  materiaalsoortId: string;
  materiaaldikte: number;
  omschrijving: string;
}
```

with:

```ts
export interface Materiaalsoort {
  id: string;
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;
  staatEigenMaatToe?: boolean;
  maxBreedte?: number | null;
  maxHoogte?: number | null;
  levertijdMaandenEigenMaat?: number | null;
}

export interface Materiaal {
  id: string;
  materiaalsoortId: string;
  materiaaldikte: number;
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;
}
```

Replace:

```ts
export interface Segment {
  id: string;
  omschrijving: string;
}

export interface Stijl {
  id: string;
  omschrijving: string;
}

export interface Onderwerp {
  id: string;
  omschrijving: string;
}
```

with:

```ts
export interface Segment {
  id: string;
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;
}

export interface Stijl {
  id: string;
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;
}

export interface Onderwerp {
  id: string;
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;
}
```

- [ ] **Step 2: Run the TypeScript build to see the fallout**

Run: `npx tsc --noEmit`
Expected: many errors across `LookupSection.tsx`, `MateriaalsoortenSection.tsx`, `MaterialenSection.tsx`, `KunstwerkenSection.tsx`, `ProductsGrid.tsx`, `FiltersPanelContent.tsx`, `ProductModal.tsx`, `AccountOrderModal.tsx`, `kunstwerkMateriaal.ts`, `BestellingModal.tsx`, `PrijsmatrixSection.tsx`, `buildDrukkerMail.ts`, and their tests — this is the expected, temporary state; each remaining task fixes its own slice. Confirm the errors are all `Property 'omschrijving' does not exist` / missing-property style, not something unrelated.

- [ ] **Step 3: Commit**

```bash
git add src/components/beheer/materiaalTypes.ts
git commit -m "feat: Segment/Stijl/Onderwerp/Materiaalsoort/Materiaal krijgen omschrijvingNl/Fr/De/En"
```

---

### Task 5: `LookupSection.tsx` (segmenten/stijlen/onderwerpen) + labels + tests

**Files:**
- Modify: `src/components/beheer/LookupSection.tsx`
- Modify: `messages/nl.json:591` (segmentenLabelOmschrijving), `:603` (stijlenLabelOmschrijving), `:615` (onderwerpenLabelOmschrijving)
- Test: `tests/components/beheer/SegmentenSection.test.tsx`, `tests/components/beheer/StijlenSection.test.tsx`, `tests/components/beheer/OnderwerpenSection.test.tsx`

**Interfaces:**
- Consumes: `Segment`/`Stijl`/`Onderwerp` from Task 4.
- Produces: `LookupItem` now requires `omschrijvingNl/Fr/De/En`; the `omschrijving`-input testid stays `${enkelvoud}-modal-omschrijving` (now the **Nl** field) so `KunstwerkenSection.test.tsx`'s unrelated testids aren't affected; new testids `${enkelvoud}-modal-omschrijving-fr/de/en`.

- [ ] **Step 1: Update the 3 test files' fixtures and assertions first**

In `tests/components/beheer/SegmentenSection.test.tsx`, replace:

```ts
const SEGMENTEN: Segment[] = [
  { id: 'seg-1', omschrijving: 'Hotel' },
  { id: 'seg-2', omschrijving: 'Restaurant' },
];
```

with:

```ts
const SEGMENTEN: Segment[] = [
  { id: 'seg-1', omschrijvingNl: 'Hotel', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
  { id: 'seg-2', omschrijvingNl: 'Restaurant', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
];
```

Replace the two `onAdd`/`onUpdate` assertions:

```ts
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ omschrijving: 'Wellness' }));
```
→
```ts
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({
        omschrijvingNl: 'Wellness',
        omschrijvingFr: '',
        omschrijvingDe: '',
        omschrijvingEn: '',
      })
    );
```

```ts
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('seg-2', { omschrijving: 'Restaurants' }));
```
→
```ts
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('seg-2', {
        omschrijvingNl: 'Restaurants',
        omschrijvingFr: '',
        omschrijvingDe: '',
        omschrijvingEn: '',
      })
    );
```

This appears twice more in the file with the same shapes (the "logs segment_toegevoegd" and "logs segment_gewijzigd" tests reuse `{ target: { value: 'Wellness' } }` / `{ target: { value: 'Restaurants' } }` on the same `segment-modal-omschrijving` testid but only assert on `logActiviteitMock`, not on `onAdd`/`onUpdate` — those two do **not** need changing since they only check the logged Nl string, which is unaffected).

Apply the equivalent transformation to `tests/components/beheer/StijlenSection.test.tsx`: fixture uses `{ id: 'stijl-1', omschrijving: 'Modern' }, { id: 'stijl-2', omschrijving: 'Klassiek' }` → add the 3 empty fields to each; the two assertions at (originally) lines 85 and 103 (`onAdd`/`onUpdate` called with `{ omschrijving: 'Minimalistisch' }` / `{ omschrijving: 'Klassiek design' }`) get the same 4-field expansion as above.

Apply the same to `tests/components/beheer/OnderwerpenSection.test.tsx`: fixture `{ id: 'ond-1', omschrijving: 'Abstract' }, { id: 'ond-2', omschrijving: 'Landschap' }` → add the 3 empty fields; assertions (`{ omschrijving: 'Portret' }` / `{ omschrijving: 'Landschappen' }`) get the same 4-field expansion. This file also constructs `KUNSTWERKEN` fixtures with the kunstwerk-level `omschrijvingNl/Fr/De/En` fields already (unrelated, already correct, leave as-is).

- [ ] **Step 2: Run the 3 tests to confirm they fail**

Run: `npx vitest run tests/components/beheer/SegmentenSection.test.tsx tests/components/beheer/StijlenSection.test.tsx tests/components/beheer/OnderwerpenSection.test.tsx`
Expected: FAIL — TypeScript/runtime errors because `LookupSection`/`LookupItem` still only knows `omschrijving`.

- [ ] **Step 3: Rewrite `LookupSection.tsx`**

Read the current file first (`src/components/beheer/LookupSection.tsx`, 256 lines) to confirm line numbers still match, then apply these replacements:

Replace:
```ts
export interface LookupItem {
  id: string;
  omschrijving: string;
}
```
with:
```ts
export interface LookupItem {
  id: string;
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;
}
```

Replace:
```ts
  const [omschrijving, setOmschrijving] = useState('');
```
with:
```ts
  const [omschrijvingNl, setOmschrijvingNl] = useState('');
  const [omschrijvingFr, setOmschrijvingFr] = useState('');
  const [omschrijvingDe, setOmschrijvingDe] = useState('');
  const [omschrijvingEn, setOmschrijvingEn] = useState('');
```

Replace:
```ts
  function openAdd() {
    setOmschrijving('');
    setActionError(null);
    setPendingVerwijderCount(null);
    setModalState({ mode: 'add' });
  }

  function openEdit(item: T) {
    setOmschrijving(item.omschrijving);
    setActionError(null);
    setPendingVerwijderCount(null);
    setModalState({ mode: 'edit', item });
  }
```
with:
```ts
  function openAdd() {
    setOmschrijvingNl('');
    setOmschrijvingFr('');
    setOmschrijvingDe('');
    setOmschrijvingEn('');
    setActionError(null);
    setPendingVerwijderCount(null);
    setModalState({ mode: 'add' });
  }

  function openEdit(item: T) {
    setOmschrijvingNl(item.omschrijvingNl);
    setOmschrijvingFr(item.omschrijvingFr);
    setOmschrijvingDe(item.omschrijvingDe);
    setOmschrijvingEn(item.omschrijvingEn);
    setActionError(null);
    setPendingVerwijderCount(null);
    setModalState({ mode: 'edit', item });
  }
```

Replace:
```ts
  async function handleSave() {
    if (!modalState) return;
    const success =
      modalState.mode === 'add'
        ? await onAdd({ omschrijving } as Omit<T, 'id'>)
        : await onUpdate(modalState.item.id, { omschrijving } as Omit<T, 'id'>);
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? activiteitTypes.toegevoegd : activiteitTypes.gewijzigd,
        omschrijving
      );
      closeModal();
    } else {
      setActionError(t(`${meervoud}ActionError`));
    }
  }
```
with:
```ts
  async function handleSave() {
    if (!modalState) return;
    const data = { omschrijvingNl, omschrijvingFr, omschrijvingDe, omschrijvingEn } as Omit<T, 'id'>;
    const success =
      modalState.mode === 'add' ? await onAdd(data) : await onUpdate(modalState.item.id, data);
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? activiteitTypes.toegevoegd : activiteitTypes.gewijzigd,
        omschrijvingNl
      );
      closeModal();
    } else {
      setActionError(t(`${meervoud}ActionError`));
    }
  }
```

Replace (inside `handleRemove`):
```ts
      void logActiviteit(activiteitTypes.verwijderd, modalState.item.omschrijving);
```
with:
```ts
      void logActiviteit(activiteitTypes.verwijderd, modalState.item.omschrijvingNl);
```
(this line appears twice in the file — the early-return "not in use" branch and the "confirmed" branch — replace both occurrences)

Replace:
```ts
  const columns: Column<T>[] = [{ key: 'omschrijving', label: t(`${meervoud}ColOmschrijving`) }];
```
with:
```ts
  const columns: Column<T>[] = [{ key: 'omschrijvingNl', label: t(`${meervoud}ColOmschrijving`) }];
```

Replace the Opslaan button's `disabled` check:
```tsx
                onClick={handleSave}
                disabled={!omschrijving}
```
with:
```tsx
                onClick={handleSave}
                disabled={!omschrijvingNl}
```

Replace the single omschrijving `<label>` block:
```tsx
              <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
                <span>
                  {t(`${meervoud}LabelOmschrijving`)}
                  <RequiredMark />
                </span>
                <input
                  type="text"
                  value={omschrijving}
                  onChange={(event) => setOmschrijving(event.target.value)}
                  data-testid={`${enkelvoud}-modal-omschrijving`}
                  className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
                />
              </label>
```
with:
```tsx
              <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
                <span>
                  {t(`${meervoud}LabelOmschrijvingNl`)}
                  <RequiredMark />
                </span>
                <input
                  type="text"
                  value={omschrijvingNl}
                  onChange={(event) => setOmschrijvingNl(event.target.value)}
                  data-testid={`${enkelvoud}-modal-omschrijving`}
                  className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
                {t(`${meervoud}LabelOmschrijvingFr`)}
                <input
                  type="text"
                  value={omschrijvingFr}
                  onChange={(event) => setOmschrijvingFr(event.target.value)}
                  data-testid={`${enkelvoud}-modal-omschrijving-fr`}
                  className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
                {t(`${meervoud}LabelOmschrijvingDe`)}
                <input
                  type="text"
                  value={omschrijvingDe}
                  onChange={(event) => setOmschrijvingDe(event.target.value)}
                  data-testid={`${enkelvoud}-modal-omschrijving-de`}
                  className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
                {t(`${meervoud}LabelOmschrijvingEn`)}
                <input
                  type="text"
                  value={omschrijvingEn}
                  onChange={(event) => setOmschrijvingEn(event.target.value)}
                  data-testid={`${enkelvoud}-modal-omschrijving-en`}
                  className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
                />
              </label>
```

- [ ] **Step 4: Update `messages/nl.json` label keys**

Replace line 591 `"segmentenLabelOmschrijving": "Omschrijving",` with:
```json
    "segmentenLabelOmschrijvingNl": "Omschrijving (NL)",
    "segmentenLabelOmschrijvingFr": "Omschrijving (FR)",
    "segmentenLabelOmschrijvingDe": "Omschrijving (DE)",
    "segmentenLabelOmschrijvingEn": "Omschrijving (EN)",
```

Replace line 603 `"stijlenLabelOmschrijving": "Omschrijving",` with:
```json
    "stijlenLabelOmschrijvingNl": "Omschrijving (NL)",
    "stijlenLabelOmschrijvingFr": "Omschrijving (FR)",
    "stijlenLabelOmschrijvingDe": "Omschrijving (DE)",
    "stijlenLabelOmschrijvingEn": "Omschrijving (EN)",
```

Replace line 615 `"onderwerpenLabelOmschrijving": "Omschrijving",` with:
```json
    "onderwerpenLabelOmschrijvingNl": "Omschrijving (NL)",
    "onderwerpenLabelOmschrijvingFr": "Omschrijving (FR)",
    "onderwerpenLabelOmschrijvingDe": "Omschrijving (DE)",
    "onderwerpenLabelOmschrijvingEn": "Omschrijving (EN)",
```

(`segmentenColOmschrijving`/`stijlenColOmschrijving`/`onderwerpenColOmschrijving` stay unchanged — the table column still just says "Omschrijving" and now shows the Nl value.)

- [ ] **Step 5: Run the 3 tests again**

Run: `npx vitest run tests/components/beheer/SegmentenSection.test.tsx tests/components/beheer/StijlenSection.test.tsx tests/components/beheer/OnderwerpenSection.test.tsx`
Expected: PASS (all green).

- [ ] **Step 6: Commit**

```bash
git add src/components/beheer/LookupSection.tsx messages/nl.json tests/components/beheer/SegmentenSection.test.tsx tests/components/beheer/StijlenSection.test.tsx tests/components/beheer/OnderwerpenSection.test.tsx
git commit -m "feat: 4-talige omschrijvingsvelden in het segmenten/stijlen/onderwerpen-beheerscherm"
```

---

### Task 6: `MateriaalsoortenSection.tsx` + labels + test

**Files:**
- Modify: `src/components/beheer/MateriaalsoortenSection.tsx`
- Modify: `messages/nl.json:471` (materiaalsoortenLabelOmschrijving)
- Test: `tests/components/beheer/MateriaalsoortenSection.test.tsx`

**Interfaces:**
- Consumes: `Materiaalsoort` from Task 4.
- Produces: the `omschrijving-modal-omschrijving` testid stays for the Nl field; adds `-fr/-de/-en` testids. `onAdd`/`onUpdate` payload now includes all 4 language fields alongside the unchanged `staatEigenMaatToe`/`maxBreedte`/`maxHoogte`/`levertijdMaandenEigenMaat`.

- [ ] **Step 1: Update the test file first**

In `tests/components/beheer/MateriaalsoortenSection.test.tsx`, replace:
```ts
const SOORTEN: Materiaalsoort[] = [
  { id: 'soort-1', omschrijving: 'Veiligheidsglas' },
  { id: 'soort-2', omschrijving: 'Dibond' },
];
```
with:
```ts
const SOORTEN: Materiaalsoort[] = [
  { id: 'soort-1', omschrijvingNl: 'Veiligheidsglas', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
  { id: 'soort-2', omschrijvingNl: 'Dibond', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
];
```

Replace:
```ts
const MATERIALEN: Materiaal[] = [
  { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'Test' },
];
```
with:
```ts
const MATERIALEN: Materiaal[] = [
  {
    id: 'mat-1',
    materiaalsoortId: 'soort-1',
    materiaaldikte: 4,
    omschrijvingNl: 'Test',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
];
```

The 3 `onAdd`/`onUpdate` assertion objects (`{ omschrijving: 'Acryl', staatEigenMaatToe: false, maxBreedte: null, maxHoogte: null, levertijdMaandenEigenMaat: null }` and its 2 siblings with `'Dibond 3mm'` and `staatEigenMaatToe: true, maxBreedte: 200, maxHoogte: 300`) each get `omschrijving: '<value>'` replaced with `omschrijvingNl: '<value>', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: ''` (keep every other key as-is, same position).

The one inline fixture override (`materiaalsoorten: [{ id: 'soort-1', omschrijving: 'Veiligheidsglas', staatEigenMaatToe: true, levertijdMaandenEigenMaat: 3 }]`) gets the same `omschrijving` → `omschrijvingNl` + 3 empty-string fields treatment.

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run tests/components/beheer/MateriaalsoortenSection.test.tsx`
Expected: FAIL (component still only knows `omschrijving`).

- [ ] **Step 3: Update the component**

In `src/components/beheer/MateriaalsoortenSection.tsx`, replace:
```ts
  const [omschrijving, setOmschrijving] = useState('');
```
with:
```ts
  const [omschrijvingNl, setOmschrijvingNl] = useState('');
  const [omschrijvingFr, setOmschrijvingFr] = useState('');
  const [omschrijvingDe, setOmschrijvingDe] = useState('');
  const [omschrijvingEn, setOmschrijvingEn] = useState('');
```

Replace:
```ts
  function openAdd() {
    setOmschrijving('');
    setStaatEigenMaatToe(false);
```
with:
```ts
  function openAdd() {
    setOmschrijvingNl('');
    setOmschrijvingFr('');
    setOmschrijvingDe('');
    setOmschrijvingEn('');
    setStaatEigenMaatToe(false);
```

Replace:
```ts
  function openEdit(materiaalsoort: Materiaalsoort) {
    setOmschrijving(materiaalsoort.omschrijving);
    setStaatEigenMaatToe(materiaalsoort.staatEigenMaatToe ?? false);
```
with:
```ts
  function openEdit(materiaalsoort: Materiaalsoort) {
    setOmschrijvingNl(materiaalsoort.omschrijvingNl);
    setOmschrijvingFr(materiaalsoort.omschrijvingFr);
    setOmschrijvingDe(materiaalsoort.omschrijvingDe);
    setOmschrijvingEn(materiaalsoort.omschrijvingEn);
    setStaatEigenMaatToe(materiaalsoort.staatEigenMaatToe ?? false);
```

Replace:
```ts
    const data: Omit<Materiaalsoort, 'id'> = {
      omschrijving,
      staatEigenMaatToe,
```
with:
```ts
    const data: Omit<Materiaalsoort, 'id'> = {
      omschrijvingNl,
      omschrijvingFr,
      omschrijvingDe,
      omschrijvingEn,
      staatEigenMaatToe,
```

Replace:
```ts
      void logActiviteit(
        modalState.mode === 'add' ? 'materiaalsoort_toegevoegd' : 'materiaalsoort_gewijzigd',
        omschrijving
      );
```
with:
```ts
      void logActiviteit(
        modalState.mode === 'add' ? 'materiaalsoort_toegevoegd' : 'materiaalsoort_gewijzigd',
        omschrijvingNl
      );
```

Replace (inside `handleRemove`):
```ts
      void logActiviteit('materiaalsoort_verwijderd', modalState.materiaalsoort.omschrijving);
```
with:
```ts
      void logActiviteit('materiaalsoort_verwijderd', modalState.materiaalsoort.omschrijvingNl);
```

Replace:
```ts
  const columns: Column<Materiaalsoort>[] = [{ key: 'omschrijving', label: t('materiaalsoortenColOmschrijving') }];
```
with:
```ts
  const columns: Column<Materiaalsoort>[] = [{ key: 'omschrijvingNl', label: t('materiaalsoortenColOmschrijving') }];
```

Replace the Opslaan `disabled` check:
```tsx
              disabled={!omschrijving}
```
with:
```tsx
              disabled={!omschrijvingNl}
```
(this is the button around the `materiaalsoort-modal-opslaan` testid)

Replace the omschrijving `<label>` block:
```tsx
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            <span>
              {t('materiaalsoortenLabelOmschrijving')}
              <RequiredMark />
            </span>
            <input
              type="text"
              value={omschrijving}
              onChange={(event) => setOmschrijving(event.target.value)}
              data-testid="materiaalsoort-modal-omschrijving"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
```
with:
```tsx
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            <span>
              {t('materiaalsoortenLabelOmschrijvingNl')}
              <RequiredMark />
            </span>
            <input
              type="text"
              value={omschrijvingNl}
              onChange={(event) => setOmschrijvingNl(event.target.value)}
              data-testid="materiaalsoort-modal-omschrijving"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('materiaalsoortenLabelOmschrijvingFr')}
            <input
              type="text"
              value={omschrijvingFr}
              onChange={(event) => setOmschrijvingFr(event.target.value)}
              data-testid="materiaalsoort-modal-omschrijving-fr"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('materiaalsoortenLabelOmschrijvingDe')}
            <input
              type="text"
              value={omschrijvingDe}
              onChange={(event) => setOmschrijvingDe(event.target.value)}
              data-testid="materiaalsoort-modal-omschrijving-de"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('materiaalsoortenLabelOmschrijvingEn')}
            <input
              type="text"
              value={omschrijvingEn}
              onChange={(event) => setOmschrijvingEn(event.target.value)}
              data-testid="materiaalsoort-modal-omschrijving-en"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
```

- [ ] **Step 4: Update `messages/nl.json`**

Replace line 471 `"materiaalsoortenLabelOmschrijving": "Omschrijving",` with:
```json
    "materiaalsoortenLabelOmschrijvingNl": "Omschrijving (NL)",
    "materiaalsoortenLabelOmschrijvingFr": "Omschrijving (FR)",
    "materiaalsoortenLabelOmschrijvingDe": "Omschrijving (DE)",
    "materiaalsoortenLabelOmschrijvingEn": "Omschrijving (EN)",
```

- [ ] **Step 5: Run the test again**

Run: `npx vitest run tests/components/beheer/MateriaalsoortenSection.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/beheer/MateriaalsoortenSection.tsx messages/nl.json tests/components/beheer/MateriaalsoortenSection.test.tsx
git commit -m "feat: 4-talige omschrijvingsvelden in het materiaalsoorten-beheerscherm"
```

---

### Task 7: `MaterialenSection.tsx` + labels + test

**Files:**
- Modify: `src/components/beheer/MaterialenSection.tsx`
- Modify: `messages/nl.json:493` (materialenLabelOmschrijving)
- Test: `tests/components/beheer/MaterialenSection.test.tsx`

**Interfaces:**
- Consumes: `Materiaal`, `Materiaalsoort` from Task 4.
- Produces: same `materiaal-modal-omschrijving(+-fr/-de/-en)` testid pattern as Tasks 5/6.

- [ ] **Step 1: Update the test file first**

In `tests/components/beheer/MaterialenSection.test.tsx`, replace:
```ts
const SOORTEN: Materiaalsoort[] = [
  { id: 'soort-1', omschrijving: 'Veiligheidsglas' },
  { id: 'soort-2', omschrijving: 'Acryl' },
];

const MATERIALEN: Materiaal[] = [
  { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'Kristalhelder' },
  { id: 'mat-2', materiaalsoortId: 'soort-2', materiaaldikte: 3, omschrijving: 'Licht en helder' },
];
```
with:
```ts
const SOORTEN: Materiaalsoort[] = [
  { id: 'soort-1', omschrijvingNl: 'Veiligheidsglas', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
  { id: 'soort-2', omschrijvingNl: 'Acryl', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
];

const MATERIALEN: Materiaal[] = [
  {
    id: 'mat-1',
    materiaalsoortId: 'soort-1',
    materiaaldikte: 4,
    omschrijvingNl: 'Kristalhelder',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
  {
    id: 'mat-2',
    materiaalsoortId: 'soort-2',
    materiaaldikte: 3,
    omschrijvingNl: 'Licht en helder',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
];
```

Replace the 4 `onAdd`/`onUpdate` assertion objects — each currently `{ materiaalsoortId: ..., materiaaldikte: ..., omschrijving: '<value>' }` (at, originally, the "adds a new materiaal", "opens a row for editing", "accepts 0 as a valid dikte" tests) — with `omschrijving: '<value>'` replaced by `omschrijvingNl: '<value>', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: ''`.

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run tests/components/beheer/MaterialenSection.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Update the component**

In `src/components/beheer/MaterialenSection.tsx`, replace:
```ts
  const [omschrijving, setOmschrijving] = useState('');
```
with:
```ts
  const [omschrijvingNl, setOmschrijvingNl] = useState('');
  const [omschrijvingFr, setOmschrijvingFr] = useState('');
  const [omschrijvingDe, setOmschrijvingDe] = useState('');
  const [omschrijvingEn, setOmschrijvingEn] = useState('');
```

Replace:
```ts
  const soortNameById = useMemo(() => {
    const map = new Map<string, string>();
    (materiaalsoorten ?? []).forEach((soort) => map.set(soort.id, soort.omschrijving));
    return map;
  }, [materiaalsoorten]);
```
with:
```ts
  const soortNameById = useMemo(() => {
    const map = new Map<string, string>();
    (materiaalsoorten ?? []).forEach((soort) => map.set(soort.id, soort.omschrijvingNl));
    return map;
  }, [materiaalsoorten]);
```

Replace:
```ts
  function openAdd() {
    setMateriaalsoortId((materiaalsoorten ?? [])[0]?.id ?? '');
    setMateriaaldikte('');
    setOmschrijving('');
    setActionError(null);
    setModalState({ mode: 'add' });
  }

  function openEdit(materiaal: Materiaal) {
    setMateriaalsoortId(materiaal.materiaalsoortId);
    setMateriaaldikte(String(materiaal.materiaaldikte));
    setOmschrijving(materiaal.omschrijving);
    setActionError(null);
    setModalState({ mode: 'edit', materiaal });
  }
```
with:
```ts
  function openAdd() {
    setMateriaalsoortId((materiaalsoorten ?? [])[0]?.id ?? '');
    setMateriaaldikte('');
    setOmschrijvingNl('');
    setOmschrijvingFr('');
    setOmschrijvingDe('');
    setOmschrijvingEn('');
    setActionError(null);
    setModalState({ mode: 'add' });
  }

  function openEdit(materiaal: Materiaal) {
    setMateriaalsoortId(materiaal.materiaalsoortId);
    setMateriaaldikte(String(materiaal.materiaaldikte));
    setOmschrijvingNl(materiaal.omschrijvingNl);
    setOmschrijvingFr(materiaal.omschrijvingFr);
    setOmschrijvingDe(materiaal.omschrijvingDe);
    setOmschrijvingEn(materiaal.omschrijvingEn);
    setActionError(null);
    setModalState({ mode: 'edit', materiaal });
  }
```

Replace:
```ts
    const data = { materiaalsoortId, materiaaldikte: Number(materiaaldikte), omschrijving };
```
with:
```ts
    const data = {
      materiaalsoortId,
      materiaaldikte: Number(materiaaldikte),
      omschrijvingNl,
      omschrijvingFr,
      omschrijvingDe,
      omschrijvingEn,
    };
```

Replace:
```ts
      void logActiviteit(
        modalState.mode === 'add' ? 'materiaal_toegevoegd' : 'materiaal_gewijzigd',
        omschrijving
      );
```
with:
```ts
      void logActiviteit(
        modalState.mode === 'add' ? 'materiaal_toegevoegd' : 'materiaal_gewijzigd',
        omschrijvingNl
      );
```

Replace (inside `handleRemove`):
```ts
      void logActiviteit('materiaal_verwijderd', modalState.materiaal.omschrijving);
```
with:
```ts
      void logActiviteit('materiaal_verwijderd', modalState.materiaal.omschrijvingNl);
```

Replace:
```ts
  const columns: Column<MateriaalRow>[] = [
    { key: 'materiaalsoortNaam', label: t('materialenColMateriaalsoort') },
    { key: 'materiaaldikte', label: t('materialenColDikte') },
    { key: 'omschrijving', label: t('materialenColOmschrijving') },
  ];
```
with:
```ts
  const columns: Column<MateriaalRow>[] = [
    { key: 'materiaalsoortNaam', label: t('materialenColMateriaalsoort') },
    { key: 'materiaaldikte', label: t('materialenColDikte') },
    { key: 'omschrijvingNl', label: t('materialenColOmschrijving') },
  ];
```

Replace the `<select>` option label:
```tsx
              {(materiaalsoorten ?? []).map((soort) => (
                <option key={soort.id} value={soort.id}>
                  {soort.omschrijving}
                </option>
              ))}
```
with:
```tsx
              {(materiaalsoorten ?? []).map((soort) => (
                <option key={soort.id} value={soort.id}>
                  {soort.omschrijvingNl}
                </option>
              ))}
```

Replace the omschrijving `<label>` block:
```tsx
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            <span>
              {t('materialenLabelOmschrijving')}
              <RequiredMark />
            </span>
            <input
              type="text"
              value={omschrijving}
              onChange={(event) => setOmschrijving(event.target.value)}
              data-testid="materiaal-modal-omschrijving"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
```
with:
```tsx
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            <span>
              {t('materialenLabelOmschrijvingNl')}
              <RequiredMark />
            </span>
            <input
              type="text"
              value={omschrijvingNl}
              onChange={(event) => setOmschrijvingNl(event.target.value)}
              data-testid="materiaal-modal-omschrijving"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('materialenLabelOmschrijvingFr')}
            <input
              type="text"
              value={omschrijvingFr}
              onChange={(event) => setOmschrijvingFr(event.target.value)}
              data-testid="materiaal-modal-omschrijving-fr"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('materialenLabelOmschrijvingDe')}
            <input
              type="text"
              value={omschrijvingDe}
              onChange={(event) => setOmschrijvingDe(event.target.value)}
              data-testid="materiaal-modal-omschrijving-de"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('materialenLabelOmschrijvingEn')}
            <input
              type="text"
              value={omschrijvingEn}
              onChange={(event) => setOmschrijvingEn(event.target.value)}
              data-testid="materiaal-modal-omschrijving-en"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
```

Also update the `disabled` check on the Opslaan button, which currently reads `disabled={!materiaalsoortId || materiaaldikte === '' || !omschrijving}` — change the last clause to `!omschrijvingNl`.

- [ ] **Step 4: Update `messages/nl.json`**

Replace line 493 `"materialenLabelOmschrijving": "Omschrijving",` with:
```json
    "materialenLabelOmschrijvingNl": "Omschrijving (NL)",
    "materialenLabelOmschrijvingFr": "Omschrijving (FR)",
    "materialenLabelOmschrijvingDe": "Omschrijving (DE)",
    "materialenLabelOmschrijvingEn": "Omschrijving (EN)",
```

- [ ] **Step 5: Run the test again**

Run: `npx vitest run tests/components/beheer/MaterialenSection.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/beheer/MaterialenSection.tsx messages/nl.json tests/components/beheer/MaterialenSection.test.tsx
git commit -m "feat: 4-talige omschrijvingsvelden in het materialen-beheerscherm"
```

---

### Task 8: `KunstwerkenSection.tsx` (tag matching/creation/display) + test

**Files:**
- Modify: `src/components/beheer/KunstwerkenSection.tsx:136,146,156,169,177,190,197,211,219,230,236,333-335,889,942,1011,1052`
- Test: `tests/components/beheer/KunstwerkenSection.test.tsx`

**Interfaces:**
- Consumes: `onAddSegment: (data: Omit<Segment, 'id'>) => Promise<boolean>` etc. (unchanged signature — `Segment` itself now requires all 4 language fields, from Task 4).

This screen is Dutch-only beheer UI: every matching/creation/display of segment/stijl/onderwerp/materiaalsoort names switches to `omschrijvingNl`; when the admin inline-creates a new segment/stijl/onderwerp, the 3 other languages are written empty (fall back to Dutch on the public site until translated).

- [ ] **Step 1: Update the test file first**

In `tests/components/beheer/KunstwerkenSection.test.tsx`, replace:
```ts
  { id: 'seg-1', omschrijving: 'Hotel' },
  { id: 'seg-2', omschrijving: 'Restaurant' },
```
with:
```ts
  { id: 'seg-1', omschrijvingNl: 'Hotel', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
  { id: 'seg-2', omschrijvingNl: 'Restaurant', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
```

Replace:
```ts
  { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'Veiligheidsglas' },
  { id: 'mat-2', materiaalsoortId: 'soort-2', materiaaldikte: 3, omschrijving: 'Acryl' },
```
with:
```ts
  { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijvingNl: 'Veiligheidsglas', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
  { id: 'mat-2', materiaalsoortId: 'soort-2', materiaaldikte: 3, omschrijvingNl: 'Acryl', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
```

Replace:
```ts
  { id: 'stijl-1', omschrijving: 'Abstract' },
  { id: 'stijl-2', omschrijving: 'Minimalistisch' },
```
with:
```ts
  { id: 'stijl-1', omschrijvingNl: 'Abstract', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
  { id: 'stijl-2', omschrijvingNl: 'Minimalistisch', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
```

Replace:
```ts
  { id: 'onderwerp-1', omschrijving: 'Bloemen' },
  { id: 'onderwerp-2', omschrijving: 'Landschappen' },
```
with:
```ts
  { id: 'onderwerp-1', omschrijvingNl: 'Bloemen', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
  { id: 'onderwerp-2', omschrijvingNl: 'Landschappen', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
```

Replace:
```ts
    await waitFor(() => expect(onAddStijl).toHaveBeenCalledWith({ omschrijving: 'Jugendstil' }));
```
with:
```ts
    await waitFor(() =>
      expect(onAddStijl).toHaveBeenCalledWith({
        omschrijvingNl: 'Jugendstil',
        omschrijvingFr: '',
        omschrijvingDe: '',
        omschrijvingEn: '',
      })
    );
```

Replace:
```ts
              stijlen={[...STIJLEN, { id: 'stijl-3', omschrijving: 'Jugendstil' }]}
```
with:
```ts
              stijlen={[...STIJLEN, { id: 'stijl-3', omschrijvingNl: 'Jugendstil', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' }]}
```

Replace:
```ts
    await waitFor(() => expect(onAddSegment).toHaveBeenCalledWith({ omschrijving: 'Kantoor' }));
```
with:
```ts
    await waitFor(() =>
      expect(onAddSegment).toHaveBeenCalledWith({
        omschrijvingNl: 'Kantoor',
        omschrijvingFr: '',
        omschrijvingDe: '',
        omschrijvingEn: '',
      })
    );
```

Replace:
```ts
              segmenten={[...SEGMENTEN, { id: 'seg-3', omschrijving: 'Kantoor' }]}
```
with:
```ts
              segmenten={[...SEGMENTEN, { id: 'seg-3', omschrijvingNl: 'Kantoor', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' }]}
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Update the component**

In `src/components/beheer/KunstwerkenSection.tsx`, apply these 12 replacements (all `.omschrijving` → `.omschrijvingNl` on segment/stijl/onderwerp/soort variables; the 3 `onAddX({ omschrijving: naam })` calls get the 3 empty language fields added):

```ts
    const gevonden = (segmenten ?? []).find((segment) => segment.omschrijving === pendingNieuweSegmentNaam);
```
→
```ts
    const gevonden = (segmenten ?? []).find((segment) => segment.omschrijvingNl === pendingNieuweSegmentNaam);
```

```ts
    const gevonden = (stijlen ?? []).find((stijl) => stijl.omschrijving === pendingNieuweStijlNaam);
```
→
```ts
    const gevonden = (stijlen ?? []).find((stijl) => stijl.omschrijvingNl === pendingNieuweStijlNaam);
```

```ts
    const gevonden = (onderwerpen ?? []).find((onderwerp) => onderwerp.omschrijving === pendingNieuweOnderwerpNaam);
```
→
```ts
    const gevonden = (onderwerpen ?? []).find((onderwerp) => onderwerp.omschrijvingNl === pendingNieuweOnderwerpNaam);
```

```ts
    const bestaande = (segmenten ?? []).find(
      (segment) => segment.omschrijving.toLowerCase() === naam.toLowerCase()
    );
```
→
```ts
    const bestaande = (segmenten ?? []).find(
      (segment) => segment.omschrijvingNl.toLowerCase() === naam.toLowerCase()
    );
```

```ts
    const success = await onAddSegment({ omschrijving: naam });
```
→
```ts
    const success = await onAddSegment({ omschrijvingNl: naam, omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' });
```

```ts
    const bestaande = (stijlen ?? []).find((stijl) => stijl.omschrijving.toLowerCase() === naam.toLowerCase());
```
→
```ts
    const bestaande = (stijlen ?? []).find((stijl) => stijl.omschrijvingNl.toLowerCase() === naam.toLowerCase());
```

```ts
    const success = await onAddStijl({ omschrijving: naam });
```
→
```ts
    const success = await onAddStijl({ omschrijvingNl: naam, omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' });
```

```ts
    const bestaande = (onderwerpen ?? []).find(
      (onderwerp) => onderwerp.omschrijving.toLowerCase() === naam.toLowerCase()
    );
```
→
```ts
    const bestaande = (onderwerpen ?? []).find(
      (onderwerp) => onderwerp.omschrijvingNl.toLowerCase() === naam.toLowerCase()
    );
```

```ts
    const success = await onAddOnderwerp({ omschrijving: naam });
```
→
```ts
    const success = await onAddOnderwerp({ omschrijvingNl: naam, omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' });
```

```ts
    (segmenten ?? []).forEach((segment) => map.set(segment.id, segment.omschrijving));
```
→
```ts
    (segmenten ?? []).forEach((segment) => map.set(segment.id, segment.omschrijvingNl));
```

```ts
    (materiaalsoorten ?? []).forEach((soort) => map.set(soort.id, soort.omschrijving));
```
→
```ts
    (materiaalsoorten ?? []).forEach((soort) => map.set(soort.id, soort.omschrijvingNl));
```

Then the JSX display spots — replace each of these 4 occurrences (each renders one entity's label inside a `<label>{...}</label>` in a checkbox list):

```tsx
                {segment.omschrijving}
```
→
```tsx
                {segment.omschrijvingNl}
```

```tsx
                {stijl.omschrijving}
```
→
```tsx
                {stijl.omschrijvingNl}
```

```tsx
                {onderwerp.omschrijving}
```
→
```tsx
                {onderwerp.omschrijvingNl}
```

(`materiaalLabel(materiaal)` at line 333-336 already reads through `materiaalsoortNaamById`, which was just fixed above — no separate change needed there beyond the map fix.)

- [ ] **Step 4: Run the test again**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/KunstwerkenSection.tsx tests/components/beheer/KunstwerkenSection.test.tsx
git commit -m "feat: kunstwerken-beheerscherm matcht/toont segment/stijl/onderwerp/materiaalsoort via omschrijvingNl"
```

---

### Task 9: Public collection filters — `FiltersPanelContent.tsx` + `ProductsGrid.tsx`

**Files:**
- Modify: `src/components/FiltersPanelContent.tsx`
- Modify: `src/components/ProductsGrid.tsx`
- Test: `tests/components/ProductsGrid.test.tsx`, `tests/components/ProductsGrid.mobile.test.tsx`

**Interfaces:**
- Consumes: `resolveOmschrijving` from Task 3, `Segment`/`Stijl`/`Onderwerp` from Task 4.
- Produces: `FiltersPanelContentProps` gains a required `locale: string` field.

- [ ] **Step 1: Update the test fixtures first**

In `tests/components/ProductsGrid.test.tsx`, replace:
```ts
  { id: 'seg-hotel', omschrijving: 'Hotel' },
  { id: 'seg-wellness', omschrijving: 'Wellness' },
```
with:
```ts
  { id: 'seg-hotel', omschrijvingNl: 'Hotel', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
  { id: 'seg-wellness', omschrijvingNl: 'Wellness', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
```

Replace:
```ts
  { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'Veiligheidsglas' },
```
with:
```ts
  { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijvingNl: 'Veiligheidsglas', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
```

Replace:
```ts
const MATERIAALSOORTEN = [{ id: 'soort-1', omschrijving: 'Veiligheidsglas' }];
```
with:
```ts
const MATERIAALSOORTEN = [{ id: 'soort-1', omschrijvingNl: 'Veiligheidsglas', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' }];
```

Replace:
```ts
  { id: 'stijl-abstract', omschrijving: 'Abstract' },
  { id: 'stijl-minimalistisch', omschrijving: 'Minimalistisch' },
```
with:
```ts
  { id: 'stijl-abstract', omschrijvingNl: 'Abstract', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
  { id: 'stijl-minimalistisch', omschrijvingNl: 'Minimalistisch', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
```

Replace:
```ts
  { id: 'onderwerp-bloemen', omschrijving: 'Bloemen' },
  { id: 'onderwerp-dieren', omschrijving: 'Dieren' },
```
with:
```ts
  { id: 'onderwerp-bloemen', omschrijvingNl: 'Bloemen', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
  { id: 'onderwerp-dieren', omschrijvingNl: 'Dieren', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
```

In `tests/components/ProductsGrid.mobile.test.tsx`, apply the same transformation to its 2 segment fixtures (`seg-hotel`/`seg-wellness`, identical shape to above).

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx tests/components/ProductsGrid.mobile.test.tsx`
Expected: FAIL (TypeScript errors — `Segment`/`Stijl`/`Onderwerp`/`Materiaal`/`Materiaalsoort` now require the 4 fields).

- [ ] **Step 3: Update `FiltersPanelContent.tsx`**

Add the import and the `locale` prop. Replace:
```ts
import { useTranslations } from 'next-intl';
import { Combobox } from './Combobox';
import { FilterSection } from './FilterSection';
import type { Segment, Kunstwerk, KunstwerkFormaat, Stijl, Onderwerp } from './beheer/materiaalTypes';
import type { Kunstenaar } from './beheer/kunstenaarTypes';
```
with:
```ts
import { useTranslations } from 'next-intl';
import { Combobox } from './Combobox';
import { FilterSection } from './FilterSection';
import { resolveOmschrijving } from '@/lib/resolveOmschrijving';
import type { Segment, Kunstwerk, KunstwerkFormaat, Stijl, Onderwerp } from './beheer/materiaalTypes';
import type { Kunstenaar } from './beheer/kunstenaarTypes';
```

Add `locale: string;` to `FiltersPanelContentProps` (right after `segmenten: Segment[];`) and destructure it in the function signature (right after `segmenten,`).

Replace:
```tsx
              {segment.omschrijving} (
```
with:
```tsx
              {resolveOmschrijving(segment, locale)} (
```

Replace:
```tsx
              <span className={isChecked ? 'text-white' : ''}>{stijl.omschrijving}</span>
```
with:
```tsx
              <span className={isChecked ? 'text-white' : ''}>{resolveOmschrijving(stijl, locale)}</span>
```

Replace:
```tsx
              <span className={isChecked ? 'text-white' : ''}>{onderwerp.omschrijving}</span>
```
with:
```tsx
              <span className={isChecked ? 'text-white' : ''}>{resolveOmschrijving(onderwerp, locale)}</span>
```

- [ ] **Step 4: Update `ProductsGrid.tsx`**

Add the import. Replace:
```ts
import { resolveKunstenaarOmschrijving } from '@/lib/resolveKunstenaarOmschrijving';
```
with:
```ts
import { resolveKunstenaarOmschrijving } from '@/lib/resolveKunstenaarOmschrijving';
import { resolveOmschrijving } from '@/lib/resolveOmschrijving';
```

Replace:
```ts
    ...(geselecteerdSegment ? [{ label: geselecteerdSegment.omschrijving }] : []),
```
with:
```ts
    ...(geselecteerdSegment ? [{ label: resolveOmschrijving(geselecteerdSegment, locale) }] : []),
```

Replace:
```ts
  const stijlNaamById = new Map((stijlen.items ?? []).map((stijl) => [stijl.id, stijl.omschrijving]));
  const onderwerpNaamById = new Map((onderwerpen.items ?? []).map((onderwerp) => [onderwerp.id, onderwerp.omschrijving]));
```
with:
```ts
  const stijlNaamById = new Map((stijlen.items ?? []).map((stijl) => [stijl.id, resolveOmschrijving(stijl, locale)]));
  const onderwerpNaamById = new Map(
    (onderwerpen.items ?? []).map((onderwerp) => [onderwerp.id, resolveOmschrijving(onderwerp, locale)])
  );
```

Replace:
```ts
    ...(geselecteerdSegment ? [{ key: 'segment', label: geselecteerdSegment.omschrijving, onRemove: () => setActiveFilter(ALL_FILTER) }] : []),
```
with:
```ts
    ...(geselecteerdSegment
      ? [{ key: 'segment', label: resolveOmschrijving(geselecteerdSegment, locale), onRemove: () => setActiveFilter(ALL_FILTER) }]
      : []),
```

Add `locale,` to the `filtersPanelProps` object (any position, e.g. right after `segmenten: segmenten.items,`).

- [ ] **Step 5: Run the tests again**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx tests/components/ProductsGrid.mobile.test.tsx`
Expected: PASS. (No new locale-switching assertions are added here — `resolveOmschrijving`'s branch logic is already fully covered by its own unit test from Task 3; these component tests only need to keep passing at the default `locale="nl"` to prove the wiring didn't break.)

- [ ] **Step 6: Commit**

```bash
git add src/components/FiltersPanelContent.tsx src/components/ProductsGrid.tsx tests/components/ProductsGrid.test.tsx tests/components/ProductsGrid.mobile.test.tsx
git commit -m "feat: collectiefilters en -grid tonen segment/stijl/onderwerp in de bezoekerstaal"
```

---

### Task 10: `ProductModal.tsx` (product detail)

**Files:**
- Modify: `src/components/ProductModal.tsx`
- Test: `tests/components/ProductModal.test.tsx`

**Interfaces:**
- Consumes: `resolveOmschrijving` from Task 3.

- [ ] **Step 1: Update the test fixtures first**

In `tests/components/ProductModal.test.tsx`, apply the same fixture transformation as Task 9 (add `omschrijvingNl:`/`omschrijvingFr: ''`/`omschrijvingDe: ''`/`omschrijvingEn: ''` in place of `omschrijving:`) to every occurrence of:
- `{ id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'Veiligheidsglas' }`
- `MATERIAALSOORTEN = [{ id: 'soort-1', omschrijving: 'Veiligheidsglas' }]`
- `{ id: 'stijl-abstract', omschrijving: 'Abstract' }, { id: 'stijl-minimalistisch', omschrijving: 'Minimalistisch' }`
- `{ id: 'onderwerp-bloemen', omschrijving: 'Bloemen' }, { id: 'onderwerp-dieren', omschrijving: 'Dieren' }`

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run tests/components/ProductModal.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Update the component**

Add the import. Replace:
```ts
import { resolveKunstwerkOmschrijving } from '@/lib/resolveKunstwerkOmschrijving';
```
with:
```ts
import { resolveKunstwerkOmschrijving } from '@/lib/resolveKunstwerkOmschrijving';
import { resolveOmschrijving } from '@/lib/resolveOmschrijving';
```

Replace:
```ts
  const materiaalsoortNaamById = new Map(
    (materiaalsoorten ?? []).map((soort) => [soort.id, soort.omschrijving])
  );
```
with:
```ts
  const materiaalsoortNaamById = new Map(
    (materiaalsoorten ?? []).map((soort) => [soort.id, resolveOmschrijving(soort, locale)])
  );
```

Replace:
```ts
  const collectieLabels = kunstwerk.segmentIds.map(
    (segmentId) => (segmenten ?? []).find((segment) => segment.id === segmentId)?.omschrijving ?? segmentId
  );
  const stijlLabels = (kunstwerk.stijlIds ?? []).map(
    (stijlId) => (stijlen ?? []).find((stijl) => stijl.id === stijlId)?.omschrijving ?? stijlId
  );
  const onderwerpLabels = (kunstwerk.onderwerpIds ?? []).map(
    (onderwerpId) => (onderwerpen ?? []).find((onderwerp) => onderwerp.id === onderwerpId)?.omschrijving ?? onderwerpId
  );
```
with:
```ts
  const collectieLabels = kunstwerk.segmentIds.map((segmentId) => {
    const segment = (segmenten ?? []).find((s) => s.id === segmentId);
    return segment ? resolveOmschrijving(segment, locale) : segmentId;
  });
  const stijlLabels = (kunstwerk.stijlIds ?? []).map((stijlId) => {
    const stijl = (stijlen ?? []).find((s) => s.id === stijlId);
    return stijl ? resolveOmschrijving(stijl, locale) : stijlId;
  });
  const onderwerpLabels = (kunstwerk.onderwerpIds ?? []).map((onderwerpId) => {
    const onderwerp = (onderwerpen ?? []).find((o) => o.id === onderwerpId);
    return onderwerp ? resolveOmschrijving(onderwerp, locale) : onderwerpId;
  });
```

Replace:
```tsx
                {geselecteerdMateriaal.omschrijving}
```
with:
```tsx
                {resolveOmschrijving(geselecteerdMateriaal, locale)}
```

- [ ] **Step 4: Run the test again**

Run: `npx vitest run tests/components/ProductModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ProductModal.tsx tests/components/ProductModal.test.tsx
git commit -m "feat: productdetail toont materiaalsoort/materiaal/segment/stijl/onderwerp in de bezoekerstaal"
```

---

### Task 11: `AccountOrderModal.tsx` + `kunstwerkMateriaal.ts` (compile-fix)

**Files:**
- Modify: `src/components/account/AccountOrderModal.tsx`
- Modify: `src/lib/kunstwerkMateriaal.ts`
- Test: `tests/components/account/AccountOrderModal.test.tsx`, `tests/lib/kunstwerkMateriaal.test.ts`

**Interfaces:**
- Consumes: `resolveOmschrijving` from Task 3.

`resolveKunstwerkMateriaalLabel` (in `kunstwerkMateriaal.ts`) is not called anywhere in `src/components` today — only `findVeiligheidsglasMateriaalId` and `MATERIAALLOOS_LABEL` are imported elsewhere (by `ProductModal.tsx`). It still needs its `.omschrijving` reference fixed to compile against the new `Materiaalsoort`/`Materiaal` types and to keep its own test passing, but it does not need locale-awareness added — nothing renders its output today.

- [ ] **Step 1: Update the test fixtures first**

In `tests/lib/kunstwerkMateriaal.test.ts`, replace:
```ts
const MATERIAALSOORTEN: Materiaalsoort[] = [
  { id: 'soort-glas', omschrijving: 'Veiligheidsglas' },
  { id: 'soort-acryl', omschrijving: 'Acryl' },
];
const MATERIALEN: Materiaal[] = [
  { id: 'mat-glas-4', materiaalsoortId: 'soort-glas', materiaaldikte: 4, omschrijving: 'Glas' },
  { id: 'mat-acryl-3', materiaalsoortId: 'soort-acryl', materiaaldikte: 3, omschrijving: 'Acryl' },
  { id: 'mat-acryl-5', materiaalsoortId: 'soort-acryl', materiaaldikte: 5, omschrijving: 'Acryl' },
];
```
with:
```ts
const MATERIAALSOORTEN: Materiaalsoort[] = [
  { id: 'soort-glas', omschrijvingNl: 'Veiligheidsglas', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
  { id: 'soort-acryl', omschrijvingNl: 'Acryl', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
];
const MATERIALEN: Materiaal[] = [
  { id: 'mat-glas-4', materiaalsoortId: 'soort-glas', materiaaldikte: 4, omschrijvingNl: 'Glas', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
  { id: 'mat-acryl-3', materiaalsoortId: 'soort-acryl', materiaaldikte: 3, omschrijvingNl: 'Acryl', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
  { id: 'mat-acryl-5', materiaalsoortId: 'soort-acryl', materiaaldikte: 5, omschrijvingNl: 'Acryl', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
];
```

In `tests/components/account/AccountOrderModal.test.tsx`, replace:
```ts
  { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'Extra diepte en stevigheid.' },
```
with:
```ts
  { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijvingNl: 'Extra diepte en stevigheid.', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run tests/lib/kunstwerkMateriaal.test.ts tests/components/account/AccountOrderModal.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Fix `kunstwerkMateriaal.ts`**

Replace:
```ts
  const veiligheidsglasSoortIds = new Set(
    materiaalsoorten
      .filter((soort) => soort.omschrijving === VEILIGHEIDSGLAS_SOORT_NAAM)
      .map((soort) => soort.id)
  );
```
with:
```ts
  const veiligheidsglasSoortIds = new Set(
    materiaalsoorten
      .filter((soort) => soort.omschrijvingNl === VEILIGHEIDSGLAS_SOORT_NAAM)
      .map((soort) => soort.id)
  );
```

Replace:
```ts
    const materiaalsoortNaamById = new Map(materiaalsoorten.map((soort) => [soort.id, soort.omschrijving]));
```
with:
```ts
    const materiaalsoortNaamById = new Map(materiaalsoorten.map((soort) => [soort.id, soort.omschrijvingNl]));
```

- [ ] **Step 4: Fix `AccountOrderModal.tsx`**

Replace:
```ts
function materiaalLabel(materiaal: Materiaal): string {
  return `${materiaal.materiaaldikte}mm — ${materiaal.omschrijving}`;
}
```
with:
```ts
function materiaalLabel(materiaal: Materiaal, locale: string): string {
  return `${materiaal.materiaaldikte}mm — ${resolveOmschrijving(materiaal, locale)}`;
}
```

Add the import next to the existing `resolveKunstwerkOmschrijving` import:
```ts
import { resolveKunstwerkOmschrijving } from '@/lib/resolveKunstwerkOmschrijving';
```
→
```ts
import { resolveKunstwerkOmschrijving } from '@/lib/resolveKunstwerkOmschrijving';
import { resolveOmschrijving } from '@/lib/resolveOmschrijving';
```

Replace the call site:
```tsx
                            <span>{materiaal ? materiaalLabel(materiaal) : line.materiaalId}</span>
```
with:
```tsx
                            <span>{materiaal ? materiaalLabel(materiaal, locale) : line.materiaalId}</span>
```

- [ ] **Step 5: Run the tests again**

Run: `npx vitest run tests/lib/kunstwerkMateriaal.test.ts tests/components/account/AccountOrderModal.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/kunstwerkMateriaal.ts src/components/account/AccountOrderModal.tsx tests/lib/kunstwerkMateriaal.test.ts tests/components/account/AccountOrderModal.test.tsx
git commit -m "fix: kunstwerkMateriaal en accountbestelgeschiedenis compileren tegen omschrijvingNl/Fr/De/En"
```

---

### Task 12: Internal/staff screens — `BestellingModal.tsx`, `PrijsmatrixSection.tsx`, `buildDrukkerMail.ts`

**Files:**
- Modify: `src/components/beheer/BestellingModal.tsx:101,443`
- Modify: `src/components/beheer/PrijsmatrixSection.tsx:45,128`
- Modify: `src/lib/buildDrukkerMail.ts:199`
- Test: `tests/components/beheer/BestellingModal.test.tsx`, `tests/components/beheer/PrijsmatrixSection.test.tsx`, `tests/lib/buildDrukkerMail.test.ts`

**Interfaces:**
- Consumes: nothing new — these are Dutch-only reads of `omschrijvingNl`, no `resolveOmschrijving` involved.

- [ ] **Step 1: Update the 3 test files' fixtures first**

In `tests/components/beheer/BestellingModal.test.tsx`, apply the `omschrijving:` → `omschrijvingNl: '<value>', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: ''` transformation to:
```ts
  { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 6, omschrijving: 'Helder' },
```
and
```ts
const MATERIAALSOORTEN: Materiaalsoort[] = [{ id: 'soort-1', omschrijving: 'Glas' }];
```

In `tests/components/beheer/PrijsmatrixSection.test.tsx`, apply the same transformation to every `Materiaalsoort`/`Materiaal` fixture object found via `omschrijving: '` (lines 18-19, 87-88, 136-137, 192-193, 196-199 in the current file — 3 `Materiaalsoort` objects and 6 `Materiaal` objects, all following the same `{ id: ..., omschrijving: '<value>' }` → `{ id: ..., omschrijvingNl: '<value>', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' }` shape for soorten, and `{ id: ..., materiaalsoortId: ..., materiaaldikte: ..., omschrijving: '<value>' }` → same-plus-3-empty-fields shape for materialen).

In `tests/lib/buildDrukkerMail.test.ts`, apply the same transformation to:
```ts
const MATERIALEN: Materiaal[] = [{ id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 6, omschrijving: 'Helder' }];
```
and
```ts
const MATERIAALSOORTEN: Materiaalsoort[] = [{ id: 'soort-1', omschrijving: 'Glas' }];
```

- [ ] **Step 2: Run the 3 tests to confirm they fail**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx tests/components/beheer/PrijsmatrixSection.test.tsx tests/lib/buildDrukkerMail.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update the 3 production files**

In `src/components/beheer/BestellingModal.tsx`, replace:
```ts
  const materiaalsoortNaamById = new Map(
    (materiaalsoorten ?? []).map((soort) => [soort.id, soort.omschrijving])
  );
```
with:
```ts
  const materiaalsoortNaamById = new Map(
    (materiaalsoorten ?? []).map((soort) => [soort.id, soort.omschrijvingNl])
  );
```
and replace:
```ts
                                  } — ${materiaal.omschrijving}`
```
with:
```ts
                                  } — ${materiaal.omschrijvingNl}`
```

In `src/components/beheer/PrijsmatrixSection.tsx`, replace:
```ts
  const soortNaamById = useMemo(() => {
    const map = new Map<string, string>();
    (materiaalsoorten ?? []).forEach((soort) => map.set(soort.id, soort.omschrijving));
    return map;
  }, [materiaalsoorten]);
```
with:
```ts
  const soortNaamById = useMemo(() => {
    const map = new Map<string, string>();
    (materiaalsoorten ?? []).forEach((soort) => map.set(soort.id, soort.omschrijvingNl));
    return map;
  }, [materiaalsoorten]);
```
and replace:
```ts
        const materiaalNaam = materialen!.find((m) => m.id === materiaalId)?.omschrijving ?? materiaalId;
```
with:
```ts
        const materiaalNaam = materialen!.find((m) => m.id === materiaalId)?.omschrijvingNl ?? materiaalId;
```

In `src/lib/buildDrukkerMail.ts`, replace:
```ts
  const materiaalOmschrijving = materiaal
    ? `${materiaal.materiaaldikte}mm ${materiaalsoort?.omschrijving ?? materiaal.materiaalsoortId} — ${materiaal.omschrijving}`
    : 'Onbekend materiaal';
```
with:
```ts
  const materiaalOmschrijving = materiaal
    ? `${materiaal.materiaaldikte}mm ${materiaalsoort?.omschrijvingNl ?? materiaal.materiaalsoortId} — ${materiaal.omschrijvingNl}`
    : 'Onbekend materiaal';
```

- [ ] **Step 4: Run the 3 tests again**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx tests/components/beheer/PrijsmatrixSection.test.tsx tests/lib/buildDrukkerMail.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/BestellingModal.tsx src/components/beheer/PrijsmatrixSection.tsx src/lib/buildDrukkerMail.ts tests/components/beheer/BestellingModal.test.tsx tests/components/beheer/PrijsmatrixSection.test.tsx tests/lib/buildDrukkerMail.test.ts
git commit -m "fix: bestelling-beheer, prijsmatrix en drukkermail lezen materiaal(soort) via omschrijvingNl"
```

---

### Task 13: Full verification and rollout note

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: no errors anywhere in the repo (Task 4's Step 2 deliberately left this red; every task since then closed one slice of it).

- [ ] **Step 2: Full lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Full test suite**

Run: `npm test`
Expected: all tests pass (this also re-runs every test touched in Tasks 1-12, plus everything untouched, confirming nothing else in the suite implicitly depended on the old `omschrijving` shape).

- [ ] **Step 4: Manual smoke check in the browser**

Start the dev server (`npm run dev`) and, in the beheer screens (Segmenten, Stijlen, Onderwerpen, Materiaalsoorten, Materialen under `/nl/beheer`), open an existing row and confirm the 4 language fields show correctly, edit one, save, and confirm it persists. On the public site (`/nl`, `/en`, `/fr`, `/de` collectiepagina and a product detail), confirm segment/stijl/onderwerp/materiaal labels show the translated text for `en`/`fr`/`de` and the Dutch text where no translation exists (e.g. any row created by a test that got left with `omschrijvingFr: ''`, or a genuinely untranslated production-only row).

- [ ] **Step 5: Document the remaining rollout steps (do not execute)**

Per `CLAUDE.md`: this plan's work is ready for staging deploy. The remaining steps are manual, outside this plan's scope, and must not be automated:
1. Push this work and let `deploy-naar-staging.yml` build and deploy it (staging's database already has the migration applied from Task 1, so no separate staging DB step is needed at deploy time).
2. After the DirectAdmin manual "Run NPM Install" + "RESTART" step, verify the new version on staging in the browser.
3. Only after that verification, ask Joris for explicit permission before ever considering a production deploy — and note that production's database migration (`npm run db:migrate -- productie --confirm`) must run before the production code deploy, per the same ordering rule as Task 1.

No commit for this task (verification only).
