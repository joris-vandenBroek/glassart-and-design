# Kunstwerkcode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `kunstwerken.naam` wordt `kunstwerken.code` (uniek), `bestellines` legt die code vast in plaats van `kunstwerkId`, en het wijzigen of verwijderen van een kunstwerk dat al besteld is wordt geblokkeerd — met een bevestigingspopup in de gevallen waarin het wél mag.

**Architecture:** Twee migraties (eerst de kunstwerkkolom, dan de bestelregelkolom), elk met de bijbehorende codewijziging in dezelfde commit zodat de testsuite na elke taak groen is. Daarna verhuist kunstwerken van de generieke CRUD-route naar eigen routes die de unieke code en de twee sloten afdwingen, en volgt de beheer-UI: codeveld op slot bij een besteld werk, bevestiging bij een toegestane wijziging.

**Tech Stack:** Next.js 14 App Router, TypeScript, raw `mysql2` tegen MySQL (geen ORM), Vitest + React Testing Library, `next-intl`.

Ontwerp: [`docs/superpowers/specs/2026-08-10-kunstwerk-code-design.md`](../specs/2026-08-10-kunstwerk-code-design.md).

## Global Constraints

- **Er is geen lokale database.** `npm test` en `npm run dev` praten allebei tegen de **staging**-MySQL uit `.env.local`. Een migratie moet dus op staging zijn toegepast vóórdat de tests van die taak kunnen slagen.
- **Testopruiming mag nooit data verwijderen die via de applicatie is toegevoegd.** Elke test ruimt exact de rijen op die hij zelf aanmaakte, op gevangen id — nooit een `DELETE` zonder `WHERE`, nooit `TRUNCATE`, nooit "de rij die ik net maakte" via `list()[0]`.
- **Reset nooit de `counters`-rij `bestelnummer`.** Reken verwachte bestelnummers uit ten opzichte van de huidige stand.
- **Elke nieuwe kunstwerk-fixture in een test krijgt een unieke code.** Vanaf taak 1 staat er een `UNIQUE`-index op `kunstwerken.code`; twee fixtures met dezelfde code laten de tweede insert falen. Gebruik een per-bestand prefix (`test-bestelheaders-…`, `test-crud-…`, `AUTOTEST-…`) plus een teller waar een helper meermaals wordt aangeroepen.
- **`src/lib/server/tableColumns.ts` is een allow-list die *gooit* bij een onbekende kolom.** Een kolomwijziging vraagt altijd om: migratiebestand + `db/schema.sql` + `tableColumns.ts`.
- **`npx tsc --noEmit` is schoon op de huidige `master` (exit 0) en moet dat na elke taak weer zijn.** Tests staan in `tsconfig.json`'s `include`, dus dit commando is het betrouwbaarste middel om alle plekken te vinden die een omgenoemd veld gebruiken. Let op de blinde vlek: fixtures met `as never` (`insertRow('kunstwerken', { … } as never)`) worden **niet** door de typechecker gezien — die staan hieronder met bestand en regelnummer uitgeschreven.
- **Nooit `deploy-naar-production.yml` zonder eerst dezelfde commit op staging te hebben gezet en daar gecontroleerd.**
- **Vraag altijd expliciet toestemming vóór elke wijziging aan de productiedatabase**, ook als een eerdere wijziging al goedgekeurd was.
- De beheerteksten staan alléén in `messages/nl.json`; `en/de/fr` hebben geen `beheer`-blok. Alleen `nameLabel` (klantzichtbaar) bestaat in alle vier de talen.

---

### Task 1: `kunstwerken.naam` wordt `kunstwerken.code` (uniek)

Mechanische omnoeming plus de `UNIQUE`-index. Nog geen nieuw gedrag: aan het eind van deze taak heet het veld overal `code`, is hij uniek in de database, en heten de labels "Code".

**Files:**
- Create: `db/migrations/2026-08-10-kunstwerk-code.sql`
- Modify: `db/schema.sql:159`
- Modify: `src/lib/server/tableColumns.ts:89`
- Modify: `src/components/beheer/materiaalTypes.ts` (`Kunstwerk.naam`)
- Modify: `src/components/beheer/KunstwerkenSection.tsx`
- Modify: `src/components/ProductModal.tsx:357-362`
- Modify: `src/components/ProductsGrid.tsx:144`
- Modify: `src/lib/buildDrukkerMail.ts:193`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json`
- Test: `tests/lib/server/crud.test.ts:77,93`
- Test: `tests/app/api/bestelheaders.test.ts:138,237,267,294,382,570,613,637,714,772`
- Test: `tests/app/api/kunstenaars.test.ts:98`
- Test: `tests/app/api/kunstwerken-prijzen.test.ts:101,122`
- Test: `tests/lib/server/prijsmodule.test.ts:202,214,232`
- Test: `tests/components/beheer/KunstwerkenSection.test.tsx`
- Test: alle overige bestanden die `npx tsc --noEmit` in stap 4 aanwijst

**Interfaces:**
- Produces: `Kunstwerk.code: string` (was `naam`) — gebruikt door elke latere taak.
- Produces: kolom `kunstwerken.code` met index `uniek_code`, hoofdletterongevoelig uniek.
- Produces: vertaalsleutels `kunstwerkenColCode`, `kunstwerkenLabelCode`, `kunstwerkenCodeVerplicht`.

- [ ] **Step 1: Schrijf de falende test voor de nieuwe kolom**

Nieuw bestand `tests/app/api/kunstwerk-code.test.ts`. Dit bestand groeit in taak 3 en 4 verder; begin met de kolom en de index.

```ts
import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';

const createdKunstwerkIds: string[] = [];

afterEach(async () => {
  if (createdKunstwerkIds.length > 0) {
    await getPool().query('DELETE FROM kunstwerken WHERE id IN (?)', [createdKunstwerkIds]);
    createdKunstwerkIds.length = 0;
  }
});

async function maakKunstwerk(code: string): Promise<string> {
  const kunstwerk = await insertRow<{ id: string }>('kunstwerken', { code } as never);
  createdKunstwerkIds.push(kunstwerk.id);
  return kunstwerk.id;
}

describe('kunstwerken.code', () => {
  it('slaat een kunstwerk op met een code in plaats van een naam', async () => {
    const id = await maakKunstwerk('test-code-basis');
    const [rows] = await getPool().query('SELECT code FROM kunstwerken WHERE id = ?', [id]);
    expect((rows as Array<{ code: string }>)[0].code).toBe('test-code-basis');
  });

  it('weigert een tweede kunstwerk met dezelfde code, ook met andere hoofdletters', async () => {
    await maakKunstwerk('test-code-dubbel');
    // insertRow gooit de ruwe mysql2-fout door; ER_DUP_ENTRY is wat de UNIQUE-index geeft.
    await expect(maakKunstwerk('TEST-CODE-DUBBEL')).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  });
});
```

- [ ] **Step 2: Draai de test om te zien dat hij faalt**

```bash
npx vitest run tests/app/api/kunstwerk-code.test.ts
```

Verwacht: beide tests FAIL. De eerste faalt op de allow-list in `tableColumns.ts` (`Onbekende kolom` voor `code`), niet op MySQL — dat is de bedoelde eerste horde.

- [ ] **Step 3: Schrijf het migratiebestand**

`db/migrations/2026-08-10-kunstwerk-code.sql`:

```sql
-- Migratie voor de kunstwerkcode (2026-08-10), deel 1 van 2.
-- Ontwerp: docs/superpowers/specs/2026-08-10-kunstwerk-code-design.md
--
-- `naam` was op kunstwerken in de praktijk al een artikelcode (Dan-02424, Duc-04038).
-- Deze migratie geeft de kolom die naam en maakt hem uniek.
--
-- Volgorde van uitrol: draai deze migratie tegen een omgeving VOORDAT de code die
-- hem gebruikt daar gedeployd wordt. De dan nog draaiende versie selecteert `naam`
-- en krijgt daarna ER_BAD_FIELD_ERROR. Dat venster is bewust geaccepteerd (ontwerp,
-- beslissing 6): tussen migratie en herstart is de collectiepagina stuk.
--
-- CHANGE behoudt de bestaande waarden, inclusief de DEFAULT ''. Die default blijft
-- staan: met de UNIQUE-index kan hoogstens één rij een lege code hebben, en de API
-- weigert een lege code sowieso.
--
-- De UNIQUE-index gebruikt de standaardcollatie van de tabel (utf8mb4_general_ci) en
-- is daarmee hoofdletterongevoelig -- dezelfde vergelijking die het beheerscherm doet
-- vóór opslaan. Er is geen opschoonstap nodig: op 2026-08-10 had staging 112
-- kunstwerken met unieke, niet-lege namen en productie nul.
ALTER TABLE kunstwerken CHANGE naam code VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE kunstwerken ADD UNIQUE KEY uniek_code (code);
```

- [ ] **Step 4: Werk `db/schema.sql` en `tableColumns.ts` bij**

In `db/schema.sql`, in `CREATE TABLE kunstwerken`, vervang regel 159:

```sql
  code VARCHAR(255) NOT NULL DEFAULT '',
```

en voeg vóór de `FOREIGN KEY`-regel toe:

```sql
  UNIQUE KEY uniek_code (code),
```

In `src/lib/server/tableColumns.ts`, in de `kunstwerken`-lijst, vervang `'naam',` door `'code',`.

- [ ] **Step 5: Pas de migratie toe op staging**

```bash
npm run db:migrate -- staging
```

Verwacht: `2026-08-10-kunstwerk-code.sql (2 statements)`, beide `gelukt`, gevolgd door `genoteerd in schema_migrations`.

Controleer daarna:

```bash
npm run db:status -- staging
```

Verwacht: geen openstaande migraties meer.

- [ ] **Step 6: Draai de test opnieuw**

```bash
npx vitest run tests/app/api/kunstwerk-code.test.ts
```

Verwacht: beide tests PASS.

- [ ] **Step 7: Noem het veld om in de TypeScript-code**

In `src/components/beheer/materiaalTypes.ts`, in `interface Kunstwerk`, vervang `naam: string;` door `code: string;`.

Draai daarna de typechecker en werk elke gemelde plek af:

```bash
npx tsc --noEmit
```

De verwachte plekken, met wat er moet gebeuren:

- `src/components/ProductModal.tsx:357-362` — `kunstwerk.naam` → `kunstwerk.code`, en `data-testid="product-modal-kunstwerknaam"` → `product-modal-kunstwerkcode`.
- `src/components/ProductsGrid.tsx:144` — `logActiviteit('kunstwerk_bekeken', kunstwerk.naam)` → `kunstwerk.code`.
- `src/lib/buildDrukkerMail.ts:193` — `const naam = kunstwerk?.naam || 'Onbekend kunstwerk';` → `const naam = kunstwerk?.code || 'Onbekend kunstwerk';` (taak 2 haalt deze regel helemaal weg; hier alleen de omnoeming).
- `src/components/beheer/KunstwerkenSection.tsx` — zie stap 8, die is groot genoeg voor een eigen stap.

- [ ] **Step 8: Werk `KunstwerkenSection.tsx` om**

Zes plekken, allemaal een omnoeming:

1. `LEGE_FORM` (regel 45): `naam: '',` → `code: '',`
2. State (regel 85): `const [naam, setNaam] = useState(LEGE_FORM.naam);` → `const [code, setCode] = useState(LEGE_FORM.code);`
3. `buildKunstwerkData` (regel 271): `naam,` → `code: code.trim(),`
4. `previewKunstwerk`-deps (regel 297): `naam,` → `code,`
5. `resetForm` (regel 362): `setNaam(LEGE_FORM.naam);` → `setCode(LEGE_FORM.code);`
6. `openEdit` (regel 400): `setNaam(kunstwerk.naam ?? '');` → `setCode(kunstwerk.code ?? '');`

Validatie (regels 473-484): vervang elke `!naam` door `!code.trim()`.

`handleSave` (regel 493): `naam` → `code.trim()` als tweede argument van `logActiviteit`.
`handleRemove` (regel 505): `modalState.kunstwerk.naam` → `modalState.kunstwerk.code`.

Kolomdefinitie (regel 556):

```tsx
    { key: 'code', label: t('kunstwerkenColCode') },
```

Het invoerveld (regels 699-718):

```tsx
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            <span>
              {t('kunstwerkenLabelCode')}
              <RequiredMark />
            </span>
            <input
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              data-testid="kunstwerk-modal-code"
              className={`rounded-sm border bg-black/40 px-3 py-2 text-sm text-white ${
                code.trim() ? 'border-transparent' : 'border-red-500/70'
              }`}
            />
            {!code.trim() && (
              <span data-testid="kunstwerk-modal-code-hint" className="normal-case tracking-normal text-red-400">
                {t('kunstwerkenCodeVerplicht')}
              </span>
            )}
          </label>
```

Haal de backfill-knop voor lege namen weg: `kunstwerkenZonderNaam` (regel 512), `handleBackfillNamen` (regels 514-524) en het `<button data-testid="kunstwerken-backfill-namen">`-blok (regels 565-575). `backfillBezig` blijft staan — `handleBackfillMaterialenMaten` gebruikt die nog.

- [ ] **Step 9: Werk de vertalingen bij**

In `messages/nl.json`, in het `beheer`-blok:

- `"kunstwerkenColNaam": "Naam"` → `"kunstwerkenColCode": "Code"`
- `"kunstwerkenLabelNaam": "Naam"` → `"kunstwerkenLabelCode": "Code"`
- `"kunstwerkenNaamVerplicht": "Vul een naam in."` → `"kunstwerkenCodeVerplicht": "Vul een code in."`
- verwijder `"kunstwerkenBackfillNamen": "Namen aanvullen ({count})"` (regel 657)

In `messages/nl.json`, `en.json`, `de.json` en `fr.json`, sleutel `nameLabel` (regel 97 in alle vier):

```json
    "nameLabel": "Code",
```

- [ ] **Step 10: Werk de testfixtures bij**

Eerst de fixtures die `tsc` **niet** ziet, omdat ze `as never` gebruiken. Vervang in elk `insertRow('kunstwerken', …)`-object de sleutel `naam` door `code`, met een unieke waarde per bestand:

- `tests/lib/server/crud.test.ts:77` → `{ code: 'test-crud-json', segmentIds: ['a', 'b'] }`
- `tests/lib/server/crud.test.ts:93` → `{ code: 'test-crud-zonder-materialen' }`
- `tests/app/api/kunstenaars.test.ts:98` → `{ code: 'test-kunstenaars-referenced', … }`
- `tests/app/api/kunstwerken-prijzen.test.ts:101` → `{ code: 'test-prijzen-bulk', … }`
- `tests/app/api/kunstwerken-prijzen.test.ts:122` → `{ code: 'test-prijzen-bulk-korting', … }`
- `tests/lib/server/prijsmodule.test.ts:202,214,232` → `test-prijsmodule-basis`, `test-prijsmodule-maatloos`, `test-prijsmodule-korting`
- `tests/app/api/bestelheaders.test.ts:237,267,294,382,570,613,637,714,772` → `test-bestelheaders-ongeprijsd`, `-maatloos`, `-eigenmaat`, `-eigenmaat-2`, `-eigenmaat-3`, `-maatloos-2`, `-maatloos-gratis`, `-eigenmaat-zonder-afmeting`, `-maatloos-met-materialen`
- `tests/regression/staging-scenarios.test.ts:177,275,384,632,737,939,1000` → `naam:` → `code:`, waarden ongewijzigd (die zijn al onderling verschillend en `AUTOTEST`-geprefixt)

`maakGeprijsdKunstwerk` in `tests/app/api/bestelheaders.test.ts` (regel 138) wordt door meerdere tests aangeroepen. Geef hem een teller, zodat twee aanroepen binnen één test niet op de `UNIQUE`-index botsen:

```ts
let kunstwerkTeller = 0;

async function maakGeprijsdKunstwerk(
  maatId: string,
  materiaalId: string,
  matrixPrijs: number,
  kunstenaarId: string | null = null
): Promise<string> {
  await getPool().query('INSERT INTO prijsmatrix (id, maatId, materiaalId, prijs) VALUES (UUID(), ?, ?, ?)', [
    maatId,
    materiaalId,
    matrixPrijs,
  ]);
  const kunstwerk = await insertRow<{ id: string }>(
    'kunstwerken',
    {
      code: `test-bestelheaders-werk-${++kunstwerkTeller}`,
      kunstenaarId,
      materiaalIds: [materiaalId],
      maatIds: [maatId],
    } as never,
    ['materiaalIds', 'maatIds']
  );
  createdKunstwerkIds.push(kunstwerk.id);
  return kunstwerk.id;
}
```

Werk daarna de componenttests bij die `tsc` wél aanwijst — `naam:` → `code:` in elke `Kunstwerk`-fixture, en de testids `kunstwerk-modal-naam` → `kunstwerk-modal-code`, `kunstwerk-modal-naam-hint` → `kunstwerk-modal-code-hint`, `product-modal-kunstwerknaam` → `product-modal-kunstwerkcode`. Verwijder in `tests/components/beheer/KunstwerkenSection.test.tsx` de test(s) rond `kunstwerken-backfill-namen`.

```bash
npx tsc --noEmit
```

Verwacht: exit 0, geen uitvoer.

- [ ] **Step 11: Draai de volledige suite**

```bash
npm test
```

Verwacht: alle tests PASS. Blijft er een test hangen op `ER_DUP_ENTRY`, dan hebben twee fixtures dezelfde code — geef de tweede een andere.

- [ ] **Step 12: Commit**

```bash
git add db/migrations/2026-08-10-kunstwerk-code.sql db/schema.sql src/lib/server/tableColumns.ts src/components/beheer/materiaalTypes.ts src/components/beheer/KunstwerkenSection.tsx src/components/ProductModal.tsx src/components/ProductsGrid.tsx src/lib/buildDrukkerMail.ts messages tests
git commit -m "feat: kunstwerken.naam wordt een unieke code"
```

---

### Task 2: `bestellines.code` in plaats van `bestellines.kunstwerkId`

**Files:**
- Create: `db/migrations/2026-08-10-bestelline-code.sql`
- Modify: `db/schema.sql:210`
- Modify: `src/lib/server/tableColumns.ts:110`
- Modify: `src/app/api/bestelheaders/route.ts:11-19,88-112,176-190`
- Modify: `src/components/beheer/BestellingenSection.tsx` (`BestellingLine`)
- Modify: `src/lib/useAllOrders.tsx:11,68`
- Modify: `src/components/beheer/BestellingModal.tsx:399`
- Modify: `src/components/account/AccountOrderModal.tsx:131`
- Modify: `src/components/account/OrdersSection.tsx:34,42-43`
- Modify: `src/lib/buildDrukkerMail.ts:188-203`
- Test: `tests/app/api/bestelheaders.test.ts`
- Test: `tests/lib/buildDrukkerMail.test.ts`, `tests/components/beheer/BestellingModal.test.tsx`, `tests/components/account/*`, en alles wat `tsc` aanwijst

**Interfaces:**
- Consumes: `Kunstwerk.code` uit taak 1.
- Produces: `BestellingLine.code: string` (was `kunstwerkId: string | null`) — gebruikt door taak 5.
- Produces: kolom `bestellines.code VARCHAR(255) NOT NULL`; `bestellines.kunstwerkId` bestaat niet meer.
- Produces: `POST /api/bestelheaders` blijft `kunstwerkId` in de body verwachten en schrijft zelf de code weg.

- [ ] **Step 1: Schrijf de falende test**

Voeg toe aan `tests/app/api/bestelheaders.test.ts`, in het bestaande `describe` voor `POST`:

```ts
  it('schrijft de code van het kunstwerk in de bestelregel, niet het kunstwerk-id', async () => {
    const maatId = await maakMaat(70, 100);
    const materiaalId = await maakMateriaal();
    const kunstwerkId = await maakGeprijsdKunstwerk(maatId, materiaalId, 100);
    const [kunstwerkRows] = await getPool().query('SELECT code FROM kunstwerken WHERE id = ?', [kunstwerkId]);
    const verwachteCode = (kunstwerkRows as Array<{ code: string }>)[0].code;
    const { cookie } = await maakGoedgekeurdeKlant('bestelline-code@example.com');

    const response = await postBestelheaders(
      postRequest({ lines: [{ kunstwerkId, maatId, materiaalId, prijs: 100, quantity: 1 }] }, cookie)
    );
    expect(response.status).toBe(201);
    const { id: headerId } = await response.json();
    createdHeaderIds.push(headerId);

    const [lineRows] = await getPool().query('SELECT code FROM bestellines WHERE bestelheaderId = ?', [headerId]);
    expect((lineRows as Array<{ code: string }>)[0].code).toBe(verwachteCode);
  });
```

Gebruik de helpers die het bestand al heeft (`maakMaat`, `maakMateriaal`, `maakGeprijsdKunstwerk`, de klant-helper en de `createdHeaderIds`-lijst) — kijk de exacte namen na bovenaan het bestand en pas ze aan als ze afwijken. Voeg géén nieuwe opruimlijst toe zonder hem in `afterEach` leeg te maken.

- [ ] **Step 2: Draai de test om te zien dat hij faalt**

```bash
npx vitest run tests/app/api/bestelheaders.test.ts -t "schrijft de code van het kunstwerk"
```

Verwacht: FAIL — `Unknown column 'code' in 'field list'`.

- [ ] **Step 3: Schrijf het migratiebestand**

`db/migrations/2026-08-10-bestelline-code.sql`:

```sql
-- Migratie voor de kunstwerkcode (2026-08-10), deel 2 van 2.
-- Ontwerp: docs/superpowers/specs/2026-08-10-kunstwerk-code-design.md
--
-- Een bestelregel legt vanaf nu vast WAT er naar de drukker ging, in de enige vorm
-- die daarbuiten betekenis heeft: de code. Het UUID in kunstwerkId zei niemand iets.
--
-- Bewust geen foreign key naar kunstwerken(code): de bestelregel legt een waarde
-- vast, geen verwijzing. Een kunstwerk dat ooit uit de catalogus verdwijnt mag een
-- historische bestelling niet ongeldig maken. Het verwijderslot in de API is wat
-- voorkomt dat een code vrijkomt en later door een ander werk hergebruikt wordt.
--
-- Volgorde van uitrol: net als deel 1 eerst migreren, dan deployen en herstarten.
-- De MODIFY ... NOT NULL faalt hard als de backfill een bestelregel zonder bestaand
-- kunstwerk overlaat. Dat is gewenst: dan moet er met de hand naar die regel worden
-- gekeken, in plaats van er stil een lege code achter te laten. Op 2026-08-10 had
-- staging 9 bestelregels, alle 9 met een bestaand kunstwerk, en productie nul.
ALTER TABLE bestellines ADD code VARCHAR(255) NULL AFTER bestelheaderId;

UPDATE bestellines bl
JOIN kunstwerken k ON k.id = bl.kunstwerkId
SET bl.code = k.code;

ALTER TABLE bestellines MODIFY code VARCHAR(255) NOT NULL;

ALTER TABLE bestellines DROP COLUMN kunstwerkId;
```

- [ ] **Step 4: Werk `db/schema.sql` en `tableColumns.ts` bij**

In `db/schema.sql`, in `CREATE TABLE bestellines`, vervang regel 210 (`kunstwerkId CHAR(36),`) door:

```sql
  code VARCHAR(255) NOT NULL,
```

In `src/lib/server/tableColumns.ts`, in de `bestellines`-lijst, vervang `'kunstwerkId',` door `'code',`.

- [ ] **Step 5: Pas de migratie toe op staging**

```bash
npm run db:migrate -- staging
```

Verwacht: `2026-08-10-bestelline-code.sql (4 statements)`, alle vier `gelukt`, dan `genoteerd in schema_migrations`.

- [ ] **Step 6: Laat de bestel-POST de code wegschrijven**

In `src/app/api/bestelheaders/route.ts`:

`LineInput` blijft ongewijzigd — de client stuurt nog steeds `kunstwerkId`. Breid het `SELECT` in de prijslus (regel 98) uit met `code`:

```ts
      const [kunstwerkRows] = await connection.query(
        'SELECT code, kunstenaarId, maatIds, materiaalIds, prijsPerM2 FROM kunstwerken WHERE id = ?',
        [line.kunstwerkId]
      );
      const kunstwerkRow = (
        kunstwerkRows as Array<{
          code: string;
          kunstenaarId: string | null;
          maatIds: string | string[] | null;
          materiaalIds: string | string[] | null;
          prijsPerM2: string | null;
        }>
      )[0];
```

Neem de code mee in `resolvedLines`. Verander het type van de lijst (regel 95) en de `push` onderaan de lus:

```ts
    const resolvedLines: Array<LineInput & { resolvedPrijs: number | null; code: string }> = [];
```

```ts
      resolvedLines.push({
        ...line,
        code: kunstwerkRow.code,
        resolvedPrijs: resultaat.status === 'vast' ? resultaat.prijs : null,
      });
```

En de INSERT (regel 178):

```ts
      await connection.query(
        'INSERT INTO bestellines (id, bestelheaderId, code, maatId, materiaalId, prijs, quantity, breedte, hoogte) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          randomUUID(),
          headerId,
          line.code,
          line.maatId,
          line.materiaalId,
          line.resolvedPrijs,
          line.quantity,
          line.breedte ?? null,
          line.hoogte ?? null,
        ]
      );
```

De code komt hier uit de database, niet uit de request — dat is bewust: een client kan zo geen code van een ander werk meesturen. Zet die reden er als commentaar boven de `SELECT`.

- [ ] **Step 7: Draai de test opnieuw**

```bash
npx vitest run tests/app/api/bestelheaders.test.ts -t "schrijft de code van het kunstwerk"
```

Verwacht: PASS.

- [ ] **Step 8: Laat de leeskant op code matchen**

`src/components/beheer/BestellingenSection.tsx`, `interface BestellingLine`:

```ts
export interface BestellingLine {
  id: string;
  code: string;
  maatId: string | null;
  materiaalId: string | null;
  breedte?: number;
  hoogte?: number;
  prijs: number | null;
  quantity: number;
}
```

`src/lib/useAllOrders.tsx`: in `DisplayOrderLine` (regel 11) en in het inline responsetype (regel 68) `kunstwerkId: string | null;` → `code: string;`.

Draai de typechecker en werk elke gemelde plek af:

```bash
npx tsc --noEmit
```

De verwachte plekken:

- `src/components/beheer/BestellingModal.tsx:399` → `const kunstwerk = (kunstwerken ?? []).find((k) => k.code === line.code) ?? null;`
- `src/components/account/AccountOrderModal.tsx:131` → `const kunstwerk = (kunstwerken ?? []).find((k) => k.code === line.code);`
- `src/components/account/OrdersSection.tsx:34,42-43` → de `Set` wordt over `line.code` gebouwd en het opzoeken gaat via `k.code === codeWaarde`; de `filter((id): id is string => id !== null)` kan weg, want `code` is niet nullable.
- `src/lib/buildDrukkerMail.ts:188-193` → zie stap 9.

- [ ] **Step 9: Laat de drukkersmail de code van de regel gebruiken**

In `src/lib/buildDrukkerMail.ts`, `resolveRegel`:

```ts
  // De code staat op de bestelregel zelf, dus de aanduiding in de mail kan nooit meer
  // "Onbekend kunstwerk" worden -- die viel eerder terug zodra het kunstwerk uit de
  // catalogus verdwenen was. Het kunstwerk wordt nog wél opgezocht, want de mail heeft
  // de foto en het formaat nodig; die opzoeking houdt haar eigen terugval.
  const kunstwerk = kunstwerken.find((k) => k.code === line.code);
```

en

```ts
  const naam = line.code;
```

De rest van de functie blijft ongewijzigd.

- [ ] **Step 10: Draai de volledige suite**

```bash
npx tsc --noEmit
npm test
```

Verwacht: `tsc` exit 0, alle tests PASS.

- [ ] **Step 11: Commit**

```bash
git add db/migrations/2026-08-10-bestelline-code.sql db/schema.sql src/lib/server/tableColumns.ts src/app/api src/components src/lib messages tests
git commit -m "feat: bestelregel legt de kunstwerkcode vast in plaats van het kunstwerk-id"
```

---

### Task 3: Eigen kunstwerken-routes met unieke-codecontrole

**Files:**
- Create: `src/lib/server/kunstwerkCode.ts`
- Create: `src/app/api/kunstwerken/route.ts`
- Create: `src/app/api/kunstwerken/[id]/route.ts`
- Modify: `src/lib/server/lookupResources.ts:21-24` (kunstwerken eruit)
- Modify: `CLAUDE.md` (kunstwerken bij de resources met een eigen route)
- Test: `tests/app/api/kunstwerk-code.test.ts`

**Interfaces:**
- Produces: `KUNSTWERKEN_JSON_COLUMNS: string[]`
- Produces: `codeIsInGebruik(code: string, behalveKunstwerkId: string | null): Promise<boolean>`
- Produces: `codeKomtVoorInBestelling(code: string): Promise<boolean>` (gebruikt door taak 4)
- Produces: `isDuplicateCodeError(error: unknown): boolean`
- Produces: `GET`/`POST` op `/api/kunstwerken`, `GET`/`PATCH`/`DELETE` op `/api/kunstwerken/[id]`

- [ ] **Step 1: Schrijf de falende tests**

Voeg toe aan `tests/app/api/kunstwerk-code.test.ts`. Neem bovenaan het bestand deze imports en helper op naast wat er al staat:

```ts
import { POST as createKunstwerk } from '@/app/api/kunstwerken/route';
import { PATCH as patchKunstwerk, DELETE as deleteKunstwerk } from '@/app/api/kunstwerken/[id]/route';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';

async function medewerkerCookie(): Promise<string> {
  const sessionId = await createSession('medewerker', 'staff-1');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

function postRequest(body: unknown, cookie: string): Request {
  return new Request('http://localhost/api/kunstwerken', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

function patchRequest(body: unknown, cookie: string): Request {
  return new Request('http://localhost/api/kunstwerken/x', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}
```

Breid de bestaande `afterEach` uit met het opruimen van de sessierij, precies zoals de andere API-tests dat doen:

```ts
  await getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'staff-1'");
```

De tests:

```ts
describe('POST /api/kunstwerken', () => {
  it('weigert een lege code met 400', async () => {
    const cookie = await medewerkerCookie();
    const response = await createKunstwerk(postRequest({ code: '   ', omschrijvingNl: 'x' }, cookie));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'code-verplicht' });
  });

  it('weigert een code die al bestaat, ook met andere hoofdletters, met 409', async () => {
    await maakKunstwerk('test-post-dubbel');
    const cookie = await medewerkerCookie();
    const response = await createKunstwerk(postRequest({ code: 'TEST-POST-DUBBEL' }, cookie));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'code-bestaat-al' });
  });

  it('maakt een kunstwerk aan met een vrije code en trimt de code', async () => {
    const cookie = await medewerkerCookie();
    const response = await createKunstwerk(postRequest({ code: '  test-post-vrij  ' }, cookie));
    expect(response.status).toBe(201);
    const created = (await response.json()) as { id: string };
    createdKunstwerkIds.push(created.id);
    const [rows] = await getPool().query('SELECT code FROM kunstwerken WHERE id = ?', [created.id]);
    expect((rows as Array<{ code: string }>)[0].code).toBe('test-post-vrij');
  });

  it('weigert zonder medewerkersessie met 401', async () => {
    const response = await createKunstwerk(
      new Request('http://localhost/api/kunstwerken', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'test-post-geen-sessie' }),
      })
    );
    expect(response.status).toBe(401);
  });
});

describe('PATCH /api/kunstwerken/[id]', () => {
  it('weigert een code die al bij een ander kunstwerk hoort met 409', async () => {
    await maakKunstwerk('test-patch-bezet');
    const id = await maakKunstwerk('test-patch-eigen');
    const cookie = await medewerkerCookie();
    const response = await patchKunstwerk(patchRequest({ code: 'test-patch-bezet' }, cookie), {
      params: { id },
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'code-bestaat-al' });
  });

  it('weigert een lege code met 400', async () => {
    const id = await maakKunstwerk('test-patch-leeg');
    const cookie = await medewerkerCookie();
    const response = await patchKunstwerk(patchRequest({ code: '  ' }, cookie), { params: { id } });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'code-verplicht' });
  });

  it('wijzigt de code van een kunstwerk dat niet besteld is', async () => {
    const id = await maakKunstwerk('test-patch-oud');
    const cookie = await medewerkerCookie();
    const response = await patchKunstwerk(patchRequest({ code: 'test-patch-nieuw' }, cookie), {
      params: { id },
    });
    expect(response.status).toBe(200);
    const [rows] = await getPool().query('SELECT code FROM kunstwerken WHERE id = ?', [id]);
    expect((rows as Array<{ code: string }>)[0].code).toBe('test-patch-nieuw');
  });

  it('geeft 404 voor een kunstwerk dat niet bestaat', async () => {
    const cookie = await medewerkerCookie();
    const response = await patchKunstwerk(patchRequest({ code: 'test-patch-onbekend' }, cookie), {
      params: { id: 'bestaat-niet' },
    });
    expect(response.status).toBe(404);
  });
});
```

- [ ] **Step 2: Draai de tests om te zien dat ze falen**

```bash
npx vitest run tests/app/api/kunstwerk-code.test.ts
```

Verwacht: FAIL bij het importeren — `Cannot find module '@/app/api/kunstwerken/route'`.

- [ ] **Step 3: Schrijf de gedeelde servermodule**

`src/lib/server/kunstwerkCode.ts`:

```ts
import { getPool } from './db';

export const KUNSTWERKEN_JSON_COLUMNS = [
  'segmentIds',
  'materiaalIds',
  'maatIds',
  'stijlIds',
  'onderwerpIds',
];

/**
 * Vergelijkt hoofdletterongevoelig, want dat is precies wat de UNIQUE-index op
 * `kunstwerken.code` doet -- de tabel staat op utf8mb4_general_ci. Zou dit binair
 * vergelijken, dan meldde het scherm "code is vrij" en gooide MySQL er alsnog een
 * duplicate-key overheen.
 */
export async function codeIsInGebruik(
  code: string,
  behalveKunstwerkId: string | null
): Promise<boolean> {
  const [rows] = behalveKunstwerkId
    ? await getPool().query('SELECT 1 FROM kunstwerken WHERE code = ? AND id <> ? LIMIT 1', [
        code,
        behalveKunstwerkId,
      ])
    : await getPool().query('SELECT 1 FROM kunstwerken WHERE code = ? LIMIT 1', [code]);
  return (rows as unknown[]).length > 0;
}

/**
 * Ongeacht de status van de bestelling: ook een geannuleerde of afgeronde bestelling
 * is mogelijk al bij de drukker geweest.
 */
export async function codeKomtVoorInBestelling(code: string): Promise<boolean> {
  const [rows] = await getPool().query('SELECT 1 FROM bestellines WHERE code = ? LIMIT 1', [code]);
  return (rows as unknown[]).length > 0;
}

/**
 * De SELECT hierboven levert de nette foutmelding, maar hij is niet de garantie: een
 * gewone SELECT op een rij die nog niet bestaat neemt geen slot, dus twee medewerkers
 * die tegelijk dezelfde code opslaan komen er beide langs. De UNIQUE-index vangt dat,
 * en zonder deze vertaling maakt withApiErrorHandling van die botsing een 500 in plaats
 * van dezelfde 409 als de voorcontrole.
 */
export function isDuplicateCodeError(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'ER_DUP_ENTRY';
}
```

- [ ] **Step 4: Schrijf de collectieroute**

`src/app/api/kunstwerken/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { listRows, insertRow } from '@/lib/server/crud';
import { withApiErrorHandling, withMedewerker } from '@/lib/server/apiRoute';
import {
  KUNSTWERKEN_JSON_COLUMNS,
  codeIsInGebruik,
  isDuplicateCodeError,
} from '@/lib/server/kunstwerkCode';

// Kunstwerken had een generieke CRUD-route via /api/[resource], maar heeft er drie
// eigen regels bij: een unieke code, een code die vastligt zodra er besteld is, en
// een verwijderslot. Dat is precies waarvoor CLAUDE.md de eigen-route-conventie
// beschrijft (klanten, kunstenaars en drukkers hebben die al).

// Publiek leesbaar, net als voorheen: de collectiepagina van de winkel haalt dit op
// zonder sessie.
export const GET = withApiErrorHandling('GET /api/kunstwerken', async () => {
  const rows = await listRows('kunstwerken', KUNSTWERKEN_JSON_COLUMNS);
  return NextResponse.json(rows);
});

export const POST = withMedewerker('POST /api/kunstwerken', async (request: Request) => {
  const data = (await request.json()) as Record<string, unknown>;
  const code = typeof data.code === 'string' ? data.code.trim() : '';
  if (!code) {
    return NextResponse.json({ error: 'code-verplicht' }, { status: 400 });
  }
  if (await codeIsInGebruik(code, null)) {
    return NextResponse.json({ error: 'code-bestaat-al' }, { status: 409 });
  }
  try {
    const created = await insertRow('kunstwerken', { ...data, code }, KUNSTWERKEN_JSON_COLUMNS);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (isDuplicateCodeError(error)) {
      return NextResponse.json({ error: 'code-bestaat-al' }, { status: 409 });
    }
    throw error;
  }
});
```

- [ ] **Step 5: Schrijf de itemroute**

`src/app/api/kunstwerken/[id]/route.ts`. Alleen `GET` en `PATCH` in deze taak; `DELETE` volgt in taak 4 — een `[id]`-routebestand vervangt de catch-all voor dit pad volledig, dus tot dan blijft `DELETE` op dit pad onbereikbaar. Neem hem daarom hier al mee, nog zonder slot:

```ts
import { NextResponse } from 'next/server';
import { getRow, updateRow, deleteRow } from '@/lib/server/crud';
import { withApiErrorHandling, withMedewerker } from '@/lib/server/apiRoute';
import {
  KUNSTWERKEN_JSON_COLUMNS,
  codeIsInGebruik,
  isDuplicateCodeError,
} from '@/lib/server/kunstwerkCode';

export const GET = withApiErrorHandling(
  'GET /api/kunstwerken/[id]',
  async (_request: Request, { params }: { params: { id: string } }) => {
    const row = await getRow('kunstwerken', params.id, KUNSTWERKEN_JSON_COLUMNS);
    if (!row) return NextResponse.json({ error: 'not-found' }, { status: 404 });
    return NextResponse.json(row);
  }
);

export const PATCH = withMedewerker(
  'PATCH /api/kunstwerken/[id]',
  async (request: Request, { params }: { params: { id: string } }) => {
    const bestaand = await getRow<{ code: string }>('kunstwerken', params.id);
    if (!bestaand) return NextResponse.json({ error: 'not-found' }, { status: 404 });

    const data = (await request.json()) as Record<string, unknown>;
    if (typeof data.code === 'string') {
      const nieuweCode = data.code.trim();
      if (!nieuweCode) {
        return NextResponse.json({ error: 'code-verplicht' }, { status: 400 });
      }
      // Exacte vergelijking, niet hoofdletterongevoelig: ook een wijziging die alleen
      // de schrijfwijze aanpast is een codewijziging. Anders zouden de code in
      // kunstwerken en de code in bestellines in schrijfwijze uit elkaar lopen.
      if (nieuweCode !== bestaand.code && (await codeIsInGebruik(nieuweCode, params.id))) {
        return NextResponse.json({ error: 'code-bestaat-al' }, { status: 409 });
      }
      data.code = nieuweCode;
    }

    try {
      await updateRow('kunstwerken', params.id, data, KUNSTWERKEN_JSON_COLUMNS);
    } catch (error) {
      if (isDuplicateCodeError(error)) {
        return NextResponse.json({ error: 'code-bestaat-al' }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ ok: true });
  }
);

export const DELETE = withMedewerker(
  'DELETE /api/kunstwerken/[id]',
  async (_request: Request, { params }: { params: { id: string } }) => {
    const bestaand = await getRow<{ code: string }>('kunstwerken', params.id);
    if (!bestaand) return NextResponse.json({ error: 'not-found' }, { status: 404 });
    await deleteRow('kunstwerken', params.id);
    return NextResponse.json({ ok: true });
  }
);
```

- [ ] **Step 6: Haal kunstwerken uit de lookup-allowlist**

In `src/lib/server/lookupResources.ts`, verwijder het hele `kunstwerken`-blok (regels 21-24). `/api/kunstwerken/prijzen` blijft werken: een concreet pathsegment wint in Next.js van een dynamisch segment, dus die route gaat niet naar `[id]`.

- [ ] **Step 7: Draai de tests**

```bash
npx vitest run tests/app/api/kunstwerk-code.test.ts
```

Verwacht: alle tests in dit bestand PASS.

- [ ] **Step 8: Draai de volledige suite en de typechecker**

```bash
npx tsc --noEmit
npm test
```

Verwacht: `tsc` exit 0, alle tests PASS. `useApiCollection` is volledig generiek (`fetch(\`/api/${resource}\`)`), dus de beheer- en winkelschermen merken de verhuizing niet.

- [ ] **Step 9: Werk CLAUDE.md bij**

In de sectie "API routes (`src/app/api`)", in de opsomming van resources met een eigen routebestand, voeg `kunstwerken` toe en haal hem weg uit de opsomming van generieke lookup-resources. Noem de reden in één bijzin: unieke code, code vastgelegd zodra er besteld is, verwijderslot.

- [ ] **Step 10: Commit**

```bash
git add src/lib/server/kunstwerkCode.ts src/app/api/kunstwerken src/lib/server/lookupResources.ts CLAUDE.md tests/app/api/kunstwerk-code.test.ts
git commit -m "feat: eigen kunstwerken-routes met unieke code"
```

---

### Task 4: Wijzig- en verwijderslot voor een besteld kunstwerk

**Files:**
- Modify: `src/app/api/kunstwerken/[id]/route.ts`
- Test: `tests/app/api/kunstwerk-code.test.ts`

**Interfaces:**
- Consumes: `codeKomtVoorInBestelling` uit taak 3.
- Produces: `PATCH` geeft `409 code-in-bestelling`; `DELETE` geeft `409 in-use-bestelling`.

- [ ] **Step 1: Schrijf de falende tests**

Voeg aan `tests/app/api/kunstwerk-code.test.ts` een helper toe die een bestelregel met een code aanmaakt, plus opruiming. `bestelheaders.klantId` heeft een gewone (niet-cascaderende) foreign key naar `klanten`, en `bestellines` hangt met `ON DELETE CASCADE` onder `bestelheaders` — dus de header eerst weg, dan de klant:

```ts
import { hashPassword } from '@/lib/server/password';

const createdHeaderIds: string[] = [];
const createdKlantEmails: string[] = [];

// In afterEach, vóór het opruimen van de kunstwerken:
//   if (createdHeaderIds.length > 0) {
//     await getPool().query('DELETE FROM bestelheaders WHERE id IN (?)', [createdHeaderIds]);
//     createdHeaderIds.length = 0;
//   }
//   if (createdKlantEmails.length > 0) {
//     await getPool().query('DELETE FROM klanten WHERE email IN (?)', [createdKlantEmails]);
//     createdKlantEmails.length = 0;
//   }

async function maakBestelregelMetCode(code: string, email: string): Promise<void> {
  const klant = await insertRow<{ id: string }>('klanten', {
    email,
    wachtwoordHash: await hashPassword('x'),
    status: 'Goedgekeurd',
  } as never);
  createdKlantEmails.push(email);
  const header = await insertRow<{ id: string }>('bestelheaders', {
    klantId: klant.id,
    // Een vast, herkenbaar testbestelnummer: de counters-rij `bestelnummer` mag nooit
    // gebruikt of gereset worden door een test.
    bestelnr: `TEST-${code}`,
    status: 'Te beoordelen',
  } as never);
  createdHeaderIds.push(header.id);
  await insertRow('bestellines', {
    bestelheaderId: header.id,
    code,
    maatId: null,
    materiaalId: null,
    prijs: null,
    quantity: 1,
  } as never);
}
```

De tests:

```ts
describe('slot op een besteld kunstwerk', () => {
  it('weigert een codewijziging als de code in een bestelregel voorkomt', async () => {
    const id = await maakKunstwerk('test-slot-besteld');
    await maakBestelregelMetCode('test-slot-besteld', 'slot-patch@example.com');
    const cookie = await medewerkerCookie();

    const response = await patchKunstwerk(patchRequest({ code: 'test-slot-nieuw' }, cookie), {
      params: { id },
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'code-in-bestelling' });

    const [rows] = await getPool().query('SELECT code FROM kunstwerken WHERE id = ?', [id]);
    expect((rows as Array<{ code: string }>)[0].code).toBe('test-slot-besteld');
  });

  it('staat opslaan zonder codewijziging toe bij een besteld kunstwerk', async () => {
    const id = await maakKunstwerk('test-slot-onderhoud');
    await maakBestelregelMetCode('test-slot-onderhoud', 'slot-onderhoud@example.com');
    const cookie = await medewerkerCookie();

    const response = await patchKunstwerk(
      patchRequest({ code: 'test-slot-onderhoud', omschrijvingNl: 'Bijgewerkte tekst' }, cookie),
      { params: { id } }
    );
    expect(response.status).toBe(200);
    const [rows] = await getPool().query('SELECT omschrijvingNl FROM kunstwerken WHERE id = ?', [id]);
    expect((rows as Array<{ omschrijvingNl: string }>)[0].omschrijvingNl).toBe('Bijgewerkte tekst');
  });

  it('weigert een wijziging die alleen de hoofdletters van de code aanpast bij een besteld kunstwerk', async () => {
    const id = await maakKunstwerk('test-slot-hoofdletters');
    await maakBestelregelMetCode('test-slot-hoofdletters', 'slot-hoofdletters@example.com');
    const cookie = await medewerkerCookie();

    const response = await patchKunstwerk(patchRequest({ code: 'TEST-SLOT-HOOFDLETTERS' }, cookie), {
      params: { id },
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'code-in-bestelling' });
  });

  it('weigert verwijderen als de code in een bestelregel voorkomt', async () => {
    const id = await maakKunstwerk('test-slot-verwijder');
    await maakBestelregelMetCode('test-slot-verwijder', 'slot-verwijder@example.com');
    const cookie = await medewerkerCookie();

    const response = await deleteKunstwerk(
      new Request('http://localhost/api/kunstwerken/x', { method: 'DELETE', headers: { cookie } }),
      { params: { id } }
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'in-use-bestelling' });

    const [rows] = await getPool().query('SELECT 1 FROM kunstwerken WHERE id = ?', [id]);
    expect((rows as unknown[]).length).toBe(1);
  });

  it('verwijdert een kunstwerk dat niet besteld is', async () => {
    const id = await maakKunstwerk('test-slot-vrij');
    const cookie = await medewerkerCookie();

    const response = await deleteKunstwerk(
      new Request('http://localhost/api/kunstwerken/x', { method: 'DELETE', headers: { cookie } }),
      { params: { id } }
    );
    expect(response.status).toBe(200);
    const [rows] = await getPool().query('SELECT 1 FROM kunstwerken WHERE id = ?', [id]);
    expect((rows as unknown[]).length).toBe(0);
  });
});
```

- [ ] **Step 2: Draai de tests om te zien dat ze falen**

```bash
npx vitest run tests/app/api/kunstwerk-code.test.ts -t "slot op een besteld kunstwerk"
```

Verwacht: de drie weiger-tests FAIL (status 200 in plaats van 409); de twee toestaan-tests PASS al.

- [ ] **Step 3: Voeg het slot toe aan PATCH**

In `src/app/api/kunstwerken/[id]/route.ts`, importeer `codeKomtVoorInBestelling` erbij en vervang het `nieuweCode !== bestaand.code`-blok:

```ts
      if (nieuweCode !== bestaand.code) {
        // De code van een besteld werk ligt vast: hij staat in bestellines en is
        // mogelijk al bij de drukker en in een masterbestand terechtgekomen.
        if (await codeKomtVoorInBestelling(bestaand.code)) {
          return NextResponse.json({ error: 'code-in-bestelling' }, { status: 409 });
        }
        if (await codeIsInGebruik(nieuweCode, params.id)) {
          return NextResponse.json({ error: 'code-bestaat-al' }, { status: 409 });
        }
      }
```

- [ ] **Step 4: Voeg het slot toe aan DELETE**

```ts
export const DELETE = withMedewerker(
  'DELETE /api/kunstwerken/[id]',
  async (_request: Request, { params }: { params: { id: string } }) => {
    const bestaand = await getRow<{ code: string }>('kunstwerken', params.id);
    if (!bestaand) return NextResponse.json({ error: 'not-found' }, { status: 404 });
    // Zonder dit slot kan een code vrijkomen en later aan een nieuw kunstwerk gegeven
    // worden, waarna historische bestelregels stil naar het verkeerde werk wijzen --
    // de bestelregel verwijst immers naar de code, niet naar het id. Zelfde foutcode
    // als de generieke route al gebruikt voor maten en materialen.
    if (await codeKomtVoorInBestelling(bestaand.code)) {
      return NextResponse.json({ error: 'in-use-bestelling' }, { status: 409 });
    }
    await deleteRow('kunstwerken', params.id);
    return NextResponse.json({ ok: true });
  }
);
```

- [ ] **Step 5: Draai de tests opnieuw**

```bash
npx vitest run tests/app/api/kunstwerk-code.test.ts
npx tsc --noEmit
```

Verwacht: alle tests PASS, `tsc` exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/kunstwerken/[id]/route.ts tests/app/api/kunstwerk-code.test.ts
git commit -m "feat: code en verwijderen op slot zodra een kunstwerk besteld is"
```

---

### Task 5: Codeveld op slot in het beheerscherm

**Files:**
- Modify: `src/components/beheer/BeheerShell.tsx:225-231,378-393`
- Modify: `src/components/beheer/KunstwerkenSection.tsx`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/KunstwerkenSection.test.tsx`

**Interfaces:**
- Consumes: `BestellingLine.code` uit taak 2.
- Produces: nieuwe prop `bestelCodes: Set<string>` op `KunstwerkenSection`.
- Produces: vertaalsleutel `kunstwerkenCodeVast`.

- [ ] **Step 1: Schrijf de falende tests**

In `tests/components/beheer/KunstwerkenSection.test.tsx`. `renderSection` heeft nog geen `bestelCodes`; geef de helper een standaardwaarde `new Set<string>()` zodat de bestaande tests ongewijzigd blijven werken, en overschrijf hem per test.

```tsx
  it('zet het codeveld op slot als het kunstwerk in een bestelling voorkomt', () => {
    renderSection({ bestelCodes: new Set([KUNSTWERKEN[0].code]) });
    fireEvent.click(screen.getByText(KUNSTWERKEN[0].code));
    expect(screen.getByTestId('kunstwerk-modal-code')).toBeDisabled();
    expect(screen.getByTestId('kunstwerk-modal-code-vast')).toHaveTextContent(
      'De code ligt vast omdat dit kunstwerk al in een bestelling voorkomt.'
    );
  });

  it('laat het codeveld bewerkbaar als het kunstwerk niet in een bestelling voorkomt', () => {
    renderSection({ bestelCodes: new Set(['een-andere-code']) });
    fireEvent.click(screen.getByText(KUNSTWERKEN[0].code));
    expect(screen.getByTestId('kunstwerk-modal-code')).not.toBeDisabled();
    expect(screen.queryByTestId('kunstwerk-modal-code-vast')).toBeNull();
  });

  it('verbergt de verwijderknop als het kunstwerk in een bestelling voorkomt', () => {
    renderSection({ bestelCodes: new Set([KUNSTWERKEN[0].code]) });
    fireEvent.click(screen.getByText(KUNSTWERKEN[0].code));
    expect(screen.queryByTestId('kunstwerk-modal-verwijderen')).toBeNull();
  });
```

- [ ] **Step 2: Draai de tests om te zien dat ze falen**

```bash
npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx -t "op slot"
```

Verwacht: FAIL — `bestelCodes` bestaat niet als prop en het element `kunstwerk-modal-code-vast` wordt niet gevonden.

- [ ] **Step 3: Voeg de prop toe aan KunstwerkenSection**

In `KunstwerkenSectionProps`:

```ts
  // De codes die in een bestelregel voorkomen. Leeg zolang de bestellingen nog laden --
  // dat venster is sub-seconde en de 409 uit /api/kunstwerken/[id] is de harde grens,
  // dus dit veld is een UX-hulp, geen beveiliging.
  bestelCodes: Set<string>;
```

Voeg `bestelCodes` toe aan de destructurering van de props. Bereken naast `opslaanDisabled`:

```ts
  const codeOpSlot = modalState?.mode === 'edit' && bestelCodes.has(modalState.kunstwerk.code);
```

Pas het invoerveld uit taak 1 aan:

```tsx
            <input
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={codeOpSlot}
              data-testid="kunstwerk-modal-code"
              className={`rounded-sm border bg-black/40 px-3 py-2 text-sm text-white disabled:opacity-60 ${
                code.trim() ? 'border-transparent' : 'border-red-500/70'
              }`}
            />
            {codeOpSlot && (
              <span data-testid="kunstwerk-modal-code-vast" className="normal-case tracking-normal text-white/60">
                {t('kunstwerkenCodeVast')}
              </span>
            )}
            {!code.trim() && !codeOpSlot && (
              <span data-testid="kunstwerk-modal-code-hint" className="normal-case tracking-normal text-red-400">
                {t('kunstwerkenCodeVerplicht')}
              </span>
            )}
```

En de verwijderknop (regel 626):

```tsx
            {modalState?.mode === 'edit' && !codeOpSlot && (
```

- [ ] **Step 4: Voeg de vertaalsleutel toe**

In `messages/nl.json`, `beheer`-blok, naast `kunstwerkenCodeVerplicht`:

```json
    "kunstwerkenCodeVast": "De code ligt vast omdat dit kunstwerk al in een bestelling voorkomt.",
```

- [ ] **Step 5: Geef de codes door vanuit BeheerShell**

In `src/components/beheer/BeheerShell.tsx`, naast de bestaande `bestellingen`-memo:

```tsx
  // Elke bestelling met al haar regels is hier al ingeladen, dus de codes die in een
  // bestelling voorkomen zijn gratis -- daar is geen apart endpoint voor nodig.
  const bestelCodes = useMemo(
    () => new Set((rawBestellingen ?? []).flatMap((bestelling) => bestelling.lines.map((line) => line.code))),
    [rawBestellingen]
  );
```

En geef hem mee aan de sectie (regel 378 e.v.):

```tsx
            bestelCodes={bestelCodes}
```

- [ ] **Step 6: Draai de tests**

```bash
npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx tests/components/beheer/BeheerShell.test.tsx
npx tsc --noEmit
```

Verwacht: alle tests PASS, `tsc` exit 0. Wijst `tsc` `BeheerShell.test.tsx` of een andere render-helper aan omdat de nieuwe prop ontbreekt, vul daar `bestelCodes={new Set()}` in.

- [ ] **Step 7: Commit**

```bash
git add src/components/beheer/BeheerShell.tsx src/components/beheer/KunstwerkenSection.tsx messages/nl.json tests/components/beheer
git commit -m "feat: codeveld op slot in beheer zodra een kunstwerk besteld is"
```

---

### Task 6: Bevestiging bij een codewijziging en melding bij een dubbele code

**Files:**
- Modify: `src/components/beheer/KunstwerkenSection.tsx`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/KunstwerkenSection.test.tsx`

**Interfaces:**
- Consumes: `codeOpSlot` en `bestelCodes` uit taak 5.
- Produces: vertaalsleutels `kunstwerkenCodeBestaatAl`, `kunstwerkenCodeWijzigenTitel`, `kunstwerkenCodeWijzigenTekst`, `kunstwerkenCodeWijzigenBevestig`.

- [ ] **Step 1: Schrijf de falende tests**

In `tests/components/beheer/KunstwerkenSection.test.tsx`:

```tsx
  it('vraagt om bevestiging voordat een gewijzigde code wordt opgeslagen', async () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByText(KUNSTWERKEN[0].code));
    fireEvent.change(screen.getByTestId('kunstwerk-modal-code'), { target: { value: 'Nieuwe-Code-1' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    expect(screen.getByTestId('kunstwerk-modal-code-bevestiging')).toHaveTextContent(
      'Als er al een masterbestand is, dan moet dit ook aangepast worden!'
    );
    expect(onUpdate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('kunstwerk-modal-code-bevestigen'));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate.mock.calls[0][1]).toMatchObject({ code: 'Nieuwe-Code-1' });
  });

  it('slaat niets op als de bevestiging van de codewijziging geannuleerd wordt', () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByText(KUNSTWERKEN[0].code));
    fireEvent.change(screen.getByTestId('kunstwerk-modal-code'), { target: { value: 'Nieuwe-Code-2' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-code-annuleren'));

    expect(onUpdate).not.toHaveBeenCalled();
    // De modal blijft open op het formulier, met de ingetypte code nog in beeld.
    expect(screen.getByTestId('kunstwerk-modal-code')).toHaveValue('Nieuwe-Code-2');
  });

  it('slaat zonder bevestiging op als de code niet gewijzigd is', async () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByText(KUNSTWERKEN[0].code));
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), {
      target: { value: 'Andere omschrijving' },
    });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    expect(screen.queryByTestId('kunstwerk-modal-code-bevestiging')).toBeNull();
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
  });

  it('meldt een dubbele code en slaat niets op', () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByText(KUNSTWERKEN[0].code));
    fireEvent.change(screen.getByTestId('kunstwerk-modal-code'), {
      target: { value: KUNSTWERKEN[1].code.toUpperCase() },
    });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    expect(screen.getByTestId('kunstwerk-modal-error')).toHaveTextContent('Deze code bestaat al.');
    expect(onUpdate).not.toHaveBeenCalled();
  });
```

Twee dingen om na te kijken vóór je dit overneemt: de `KUNSTWERKEN`-fixture in dit bestand moet minstens twee kunstwerken hebben met verschillende codes (voeg er een toe als er maar één is), en het testid van het NL-omschrijvingsveld en van het foutmeldingselement moeten kloppen met wat `KunstwerkenSection.tsx` rendert — zoek ze op in het component in plaats van ze te gokken.

- [ ] **Step 2: Draai de tests om te zien dat ze falen**

```bash
npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx -t "code"
```

Verwacht: de vier nieuwe tests FAIL; `kunstwerk-modal-code-bevestiging` bestaat niet en `onUpdate` wordt direct aangeroepen.

- [ ] **Step 3: Splits handleSave in een poort en een schrijfactie**

In `src/components/beheer/KunstwerkenSection.tsx`, naast de andere state:

```ts
  const [pendingCodeWijziging, setPendingCodeWijziging] = useState<string | null>(null);
```

Vervang `handleSave` (regels 486-499):

```ts
  async function bewaarKunstwerk() {
    if (!modalState) return;
    const data = buildKunstwerkData();
    const success = modalState.mode === 'add' ? await onAdd(data) : await onUpdate(modalState.kunstwerk.id, data);
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'kunstwerk_toegevoegd' : 'kunstwerk_gewijzigd',
        code.trim()
      );
      closeModal();
    } else {
      setPendingCodeWijziging(null);
      setActionError(t('kunstwerkenActionError'));
    }
  }

  async function handleSave() {
    if (!modalState) return;
    const schoneCode = code.trim();

    // Dezelfde hoofdletterongevoelige vergelijking als de UNIQUE-index op de kolom,
    // zodat scherm en database niet van mening verschillen. Dit is de nette melding;
    // de 409 uit /api/kunstwerken is de harde grens.
    const dubbel = kunstwerken.some(
      (bestaand) =>
        bestaand.id !== (modalState.mode === 'edit' ? modalState.kunstwerk.id : '') &&
        bestaand.code.trim().toLowerCase() === schoneCode.toLowerCase()
    );
    if (dubbel) {
      setActionError(t('kunstwerkenCodeBestaatAl'));
      return;
    }

    // Exacte vergelijking: ook een wijziging van alleen de schrijfwijze is een
    // codewijziging, want de code belandt zo in bestellines en mogelijk in een
    // masterbestand buiten dit systeem.
    if (modalState.mode === 'edit' && schoneCode !== modalState.kunstwerk.code) {
      setActionError(null);
      setPendingCodeWijziging(schoneCode);
      return;
    }

    await bewaarKunstwerk();
  }

  function handleAnnulerenCodeWijziging() {
    setPendingCodeWijziging(null);
  }
```

Laat `closeModal` de bevestiging opruimen:

```ts
  function closeModal() {
    formaatSessionRef.current += 1;
    setPendingCodeWijziging(null);
    setModalState(null);
  }
```

- [ ] **Step 4: Wissel de modalinhoud en de knoppen om tijdens de bevestiging**

Dezelfde aanpak als `LookupSection.tsx` gebruikt voor zijn verwijderbevestiging: geen tweede `Modal` (die zou een tweede `data-testid="modal"` in de DOM zetten en de Escape-afhandeling van beide overlays aanspreken), maar de bestaande modal die van inhoud wisselt.

`footerActions` van de `Modal` (regels 615-637):

```tsx
        footerActions={
          pendingCodeWijziging !== null ? (
            <>
              <button
                type="button"
                onClick={bewaarKunstwerk}
                data-testid="kunstwerk-modal-code-bevestigen"
                className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
              >
                {t('kunstwerkenCodeWijzigenBevestig')}
              </button>
              <button
                type="button"
                onClick={handleAnnulerenCodeWijziging}
                data-testid="kunstwerk-modal-code-annuleren"
                className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('annuleren')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={opslaanDisabled}
                data-testid="kunstwerk-modal-opslaan"
                className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
              >
                {t('kunstwerkenOpslaan')}
              </button>
              {modalState?.mode === 'edit' && !codeOpSlot && (
                <button
                  type="button"
                  onClick={handleRemove}
                  data-testid="kunstwerk-modal-verwijderen"
                  className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
                >
                  {t('kunstwerkenVerwijderen')}
                </button>
              )}
            </>
          )
        }
```

En de inhoud: laat het bestaande `<div data-testid="kunstwerk-modal" …>`-blok staan zoals het is, maar zet er een broer naast en kies met een ternary. Het formulier blijft in de DOM staan met `hidden`, zodat de ingetypte code bewaard blijft en het annuleren geen state weggooit:

```tsx
        {pendingCodeWijziging !== null && (
          <div
            data-testid="kunstwerk-modal-code-bevestiging"
            className="flex flex-col gap-3 text-sm text-white/80"
          >
            <p className="font-semibold text-white">{t('kunstwerkenCodeWijzigenTitel')}</p>
            <p>{t('kunstwerkenCodeWijzigenTekst')}</p>
          </div>
        )}
        <div
          data-testid="kunstwerk-modal"
          className={
            pendingCodeWijziging !== null
              ? 'hidden'
              : 'grid grid-cols-1 gap-6 text-sm text-white/80 lg:grid-cols-[minmax(0,1fr)_320px] min-[1432px]:grid-cols-[minmax(0,1fr)_560px]'
          }
        >
```

De `Modal` verwacht één `children`-boom; wikkel deze twee blokken in een fragment als dat nodig is om te compileren.

- [ ] **Step 5: Voeg de vertaalsleutels toe**

In `messages/nl.json`, `beheer`-blok, naast `kunstwerkenCodeVast`:

```json
    "kunstwerkenCodeBestaatAl": "Deze code bestaat al.",
    "kunstwerkenCodeWijzigenTitel": "U gaat de code wijzigen.",
    "kunstwerkenCodeWijzigenTekst": "Als er al een masterbestand is, dan moet dit ook aangepast worden!",
    "kunstwerkenCodeWijzigenBevestig": "Code wijzigen",
```

Breid daarnaast `kunstwerkenHelp` (regel 663) uit met één zin aan het begin, zodat de helptekst de nieuwe regel uitlegt:

```
De code is het artikelnummer waarmee de drukker werkt en moet uniek zijn. Zodra een kunstwerk in een bestelling voorkomt, ligt de code vast en kan het kunstwerk ook niet meer verwijderd worden.
```

- [ ] **Step 6: Draai de tests**

```bash
npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx
npx tsc --noEmit
```

Verwacht: alle tests PASS, `tsc` exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/beheer/KunstwerkenSection.tsx messages/nl.json tests/components/beheer/KunstwerkenSection.test.tsx
git commit -m "feat: bevestiging bij codewijziging en melding bij dubbele code"
```

---

### Task 7: Regressiesuite, volledige verificatie en uitrol

**Files:**
- Modify: `tests/regression/staging-scenarios.test.ts`
- Modify: `docs/huidige-staat.md`

- [ ] **Step 1: Draai de regressiesuite**

```bash
npm run test:regression
```

Verwacht: alle scenario's PASS. Draaide taak 1 stap 10 goed, dan zijn de `naam:`-sleutels hier al `code:`. Faalt er iets op `ER_DUP_ENTRY`, dan is een eerdere run halverwege afgebroken en staat er nog een `AUTOTEST`-kunstwerk in staging — zoek het met `SELECT id, code FROM kunstwerken WHERE code LIKE 'AUTOTEST%'` en verwijder precies die rij.

- [ ] **Step 2: Controleer dat de suite staging netjes achterlaat**

```bash
npx tsx -e "import('./scripts/lib/env').then(async ({ verbind }) => { const { connection } = await verbind('staging'); const [r] = await connection.query(\"SELECT COUNT(*) n FROM kunstwerken WHERE code LIKE 'AUTOTEST%' OR code LIKE 'test-%'\"); console.log(r); await connection.end(); })"
```

Verwacht: `n: 0`. Staat er meer dan 0, dan laat een test fixtures achter — zoek uit welke en repareer de opruiming vóór je verder gaat.

- [ ] **Step 3: Draai de volledige verificatie**

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Verwacht: alle vier zonder fouten. Rapporteer de werkelijke uitkomst — beweer niets over "alles groen" zonder deze uitvoer gezien te hebben.

- [ ] **Step 4: Werk `docs/huidige-staat.md` bij**

Zoek de passages over kunstwerken en bestelregels en werk ze bij: het veld heet `code`, is uniek, een bestelregel legt die code vast, en de code ligt vast zodra er besteld is (het kunstwerk kan dan ook niet meer verwijderd worden).

- [ ] **Step 5: Commit**

```bash
git add tests/regression/staging-scenarios.test.ts docs/huidige-staat.md
git commit -m "docs: beschrijf de kunstwerkcode in de huidige staat"
```

- [ ] **Step 6: Deploy naar staging**

Dispatch `deploy-naar-staging.yml` tegen `master`. De workflow draait `scripts/check-migrations.ts` en die faalt als staging een migratie mist — beide migraties zijn in taak 1 en 2 al toegepast, dus dit hoort te slagen.

Na de run: klik in DirectAdmin op **RESTART** (en op **Run NPM Install** alleen als `package.json`/`package-lock.json` gewijzigd is). Een geslaagde workflow betekent nog niet dat de nieuwe build live is.

- [ ] **Step 7: Controleer op staging**

Vier dingen, met eigen ogen in de beheeromgeving:

1. Open een kunstwerk dat **niet** in een bestelling voorkomt, wijzig de code, klik opslaan → de bevestiging verschijnt; annuleren bewaart niets, bevestigen bewaart de nieuwe code.
2. Open een kunstwerk dat **wel** in een bestelling voorkomt → het codeveld is niet bewerkbaar, de uitleg staat eronder, en de verwijderknop is verdwenen.
3. Vul bij een kunstwerk de code van een ander kunstwerk in → "Deze code bestaat al." en er wordt niets bewaard.
4. Plaats een bestelling als klant en geef die door aan de drukker → de code staat op de regel in de mail.

- [ ] **Step 8: Migreer productie na expliciete toestemming**

Vraag de gebruiker eerst om toestemming — apart, en voor deze wijziging. Meld daarbij dat de productiedatabase 0 kunstwerken en 0 bestelregels heeft, dus dat de backfill niets te doen heeft, en dat de dan nog draaiende productieversie tussen migratie en herstart de collectiepagina niet kan tonen.

```bash
npm run db:migrate -- productie --confirm
```

- [ ] **Step 9: Promoveer naar productie**

Dispatch `deploy-naar-production.yml` tegen `master` zonder `version`-invoer, zodat de hoogste `vN`-tag — de versie die net op staging stond — gepromoveerd wordt. Klik daarna in DirectAdmin op **RESTART** voor de productie-app.

Let op voor een eventuele rollback: er is geen migratie-rollbacktooling. Terugrollen naar een versie van vóór deze twee migraties vraagt handwerk op de database.

---

## Self-Review

Uitgevoerd tegen [`docs/superpowers/specs/2026-08-10-kunstwerk-code-design.md`](../specs/2026-08-10-kunstwerk-code-design.md):

- **Sectie A (schema en migratie)** → taak 1 stap 3-5, taak 2 stap 3-5. Beide migraties, `db/schema.sql`, `tableColumns.ts` en het toepassen op staging zitten erin.
- **Sectie B (API)** → taak 3 (routes, unieke code, `ER_DUP_ENTRY` → 409, kunstwerken uit `LOOKUP_RESOURCES`), taak 4 (beide sloten), taak 2 stap 6 (`POST /api/bestelheaders` blijft `kunstwerkId` verwachten en schrijft de code weg).
- **Sectie C (beheer-UI)** → taak 1 stap 8-9 (labels, testids, backfill-knop weg), taak 5 (veld op slot, verwijderknop weg), taak 6 (bevestiging, dubbele-codemelding, helptekst).
- **Sectie D (klantkant, bestellingen, drukkersmail)** → taak 1 stap 7 (`ProductModal`, `ProductsGrid`), taak 2 stap 8-9 (alle bestelregel-consumenten en `buildDrukkerMail`). De ongewijzigde bestanden die het ontwerp noemt (`useCart`, de bestelregel-PATCH-route) worden niet aangeraakt, wat de bedoeling is.
- **Vertalingen** → taak 1 stap 9 (`kunstwerkenColCode`, `kunstwerkenLabelCode`, `kunstwerkenCodeVerplicht`, `nameLabel` in vier talen), taak 5 stap 4 (`kunstwerkenCodeVast`), taak 6 stap 5 (de vier bevestigingssleutels). Alle acht sleutels uit het ontwerp zijn gedekt.
- **Tests** → elke testregel uit het ontwerp heeft een stap: dubbele/lege code bij POST en PATCH, codewijziging bij een besteld werk geweigerd, toegestaan bij een niet-besteld werk, opslaan zonder codewijziging bij een besteld werk, DELETE 409, bestelregel krijgt de code, en de vier UI-tests. `tests/app/api/lookup-resources.test.ts` staat níet in de lijst: dat bestand verwijst nergens naar kunstwerken, dus de verhuizing uit `LOOKUP_RESOURCES` raakt het niet — dat is een correctie op de bestandenlijst in het ontwerp.
- **Uitrol** → taak 7, in de voorgeschreven volgorde, met de toestemmingsvraag als eigen stap vóór de productiemigratie.
- **Placeholders** → geen "TBD"/"later"/"vergelijkbaar met taak N". Drie stappen vragen expliciet om iets in de code op te zoeken in plaats van te gokken (de helpernamen in `bestelheaders.test.ts`, de testids van het omschrijvingsveld en de foutmelding, en de `KUNSTWERKEN`-fixture met twee codes); dat is bewust, want die namen staan in bestanden die deze taken toch al openen.
- **Typeconsistentie** → `Kunstwerk.code` (taak 1) wordt in taak 2, 5 en 6 zo gebruikt. `BestellingLine.code: string` (taak 2, niet-nullable) is waar taak 5's `bestelCodes: Set<string>` op rust. `codeKomtVoorInBestelling` wordt in taak 3 gedefinieerd en in taak 4 gebruikt; `codeIsInGebruik(code, behalveKunstwerkId)` heeft in beide taken dezelfde twee parameters.
