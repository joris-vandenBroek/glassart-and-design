# Bestelnr, klantnr en zendingnummer als sleutel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `bestelnr` en `klantnr` worden database-afgedwongen sleutels waar `bestellines`, `bestelstatusHistorie` en `bestelheaders` naar verwijzen in plaats van naar de UUID, en de many-to-many-relatie tussen een drukkerzending en de bestellingen die hij bundelt gaat van een JSON-array naar een echte koppeltabel.

**Architecture:** Zes migraties, elk in dezelfde commit als de codewijziging die hem nodig heeft: (1) `bestelnr`/`klantnr` krijgen een `UNIQUE`-index, (2) `bestelheaders.klantId` → `klantnr` mét een nieuwe server-side `'Goedgekeurd'`-controle, (3) `bestellines`/`bestelstatusHistorie.bestelheaderId` → `bestelnr`, (4) `drukkerZendingen.zendingnummer` op slot + `drukkerZendingen.bestellingIds` (JSON) wordt de koppeltabel `drukkerZendingBestellingen`, (5) kolomvolgorde-opruiming, (6) uitrol. De UUID `id` blijft overal primary key en elk beheer-URL-pad blijft ongewijzigd — alleen de kolommen die naar een bestelling, klant of zending *verwijzen* veranderen.

**Tech Stack:** Next.js 14 App Router, TypeScript, raw `mysql2` tegen MariaDB 11.8 (geen ORM), Vitest + React Testing Library, `next-intl`.

Ontwerp: [`docs/superpowers/specs/2026-08-10-bestelnr-klantnr-en-zendingnummer-als-sleutel-design.md`](../specs/2026-08-10-bestelnr-klantnr-en-zendingnummer-als-sleutel-design.md).

## Global Constraints

- **Dit plan begint pas nadat `docs/superpowers/plans/2026-08-10-kunstenaarnummer-en-drukkernummer.md` volledig is geïmplementeerd en gecommit.** Controleer vóór taak 1 dat `drukkers.drukkernr` bestaat (`SELECT drukkernr FROM drukkers LIMIT 1` op staging faalt niet) en dat `src/lib/server/tableColumns.ts` een `drukkernr`-kolom heeft in zowel `drukkers` als `drukkerZendingen` (en geen `drukkerId` meer). Zo niet: dat plan eerst afronden, dit plan niet beginnen.
- **Er is geen lokale database.** `npm test` en `npm run dev` praten allebei tegen de **staging**-MariaDB uit `.env.local`. Een migratie moet op staging zijn toegepast vóórdat de tests van die taak kunnen slagen.
- **Testopruiming mag nooit data verwijderen die via de applicatie is toegevoegd.** Elke test ruimt exact de rijen op die hij zelf aanmaakte, op gevangen id/email — nooit een `DELETE` zonder `WHERE`, nooit `TRUNCATE`.
- **Reset nooit een `counters`-rij** (`bestelnummer`, `klantnummer`, `zendingnummer`, en de twee uit het kunstenaarnummer/drukkernummer-plan). Een test die een nummer controleert rekent relatief aan de huidige tellerstand.
- **Elke klant-fixture die via `POST /api/bestelheaders` gaat bestellen heeft na taak 2 een expliciet `klantnr` nodig.** `insertRow('klanten', { status: 'Goedgekeurd', ... })` kent vandaag géén `klantnr` toe — dat gebeurt alleen binnen `updateEnKenKlantnummerToe` (`PATCH /api/klanten/[id]`). Een fixture die rechtstreeks `status: 'Goedgekeurd'` zet zonder ook een `klantnr` mee te geven, faalt zodra `bestelheaders.klantnr NOT NULL` wordt — niet omdat de klant "niet goedgekeurd" is, maar omdat de `INSERT` een `NULL` `klantnr` probeert vast te leggen dat de nieuwe foreign key weigert.
- **`src/lib/server/tableColumns.ts` is een allow-list die *gooit* bij een onbekende kolom.** Een kolomwijziging vraagt altijd om: migratiebestand + `db/schema.sql` + `tableColumns.ts`.
- **`src/lib/server/crud.ts`'s `getRow`/`insertRow`/`updateRow`/`deleteRow` bevragen altijd `WHERE id = ?`.** Dat blijft werken voor elke tabel in dit plan, want de primary key blijft overal `id` (UUID) — alleen de nieuwe koppeltabel `drukkerZendingBestellingen` (taak 4) heeft geen los `id`, dus die gaat buiten deze helpers om met rechtstreekse SQL.
- **`npx tsc --noEmit` moet na elke taak exit 0 geven.**
- **`npm run test:regression` is opt-in** (`tests/regression/staging-scenarios.test.ts`, buiten de standaard `npm test`). Taak 2 en 4 raken scenario's daarin direct; draai die suite aan het eind van beide taken, niet alleen aan het eind van dit plan.
- **Nooit `deploy-naar-production.yml` zonder eerst dezelfde commit op staging te hebben gezet en daar gecontroleerd.**
- **Vraag altijd expliciet toestemming vóór elke wijziging aan de productiedatabase**, ook als een eerdere wijziging al goedgekeurd was.
- Regelnummers in dit plan zijn van 2026-08-10 en kunnen een paar regels verschoven zijn; zoek altijd op de genoemde symboolnaam als een regel niet meer klopt.

---

### Task 1: `bestelnr` en `klantnr` krijgen een unieke index

Puur additief: geen enkele bestaande query verandert. Dit is de kleinste, laagste-risico stap in de reeks en zet de twee `UNIQUE`-indexen neer die taak 2 en 3 nodig hebben om er een foreign key naartoe te leggen.

**Files:**
- Create: `db/migrations/2026-08-10-01-bestelnr-uniek.sql`
- Create: `db/migrations/2026-08-10-02-klantnr-uniek.sql`
- Create: `tests/app/api/bestelnr-klantnr-uniek.test.ts`
- Modify: `db/schema.sql` (`CREATE TABLE bestelheaders`, `CREATE TABLE klanten`)

**Interfaces:**
- Produces: `UNIQUE KEY uniek_bestelnr` op `bestelheaders(bestelnr)`.
- Produces: `UNIQUE KEY uniek_klantnr` op `klanten(klantnr)`.

- [ ] **Step 1: Schrijf de falende test**

Nieuw bestand `tests/app/api/bestelnr-klantnr-uniek.test.ts`:

```ts
import { describe, expect, it, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { hashPassword } from '@/lib/server/password';

const createdBestelheaderIds: string[] = [];
const createdKlantEmails: string[] = [];

afterEach(async () => {
  const pool = getPool();
  if (createdBestelheaderIds.length > 0) {
    await pool.query('DELETE FROM bestelheaders WHERE id IN (?)', [createdBestelheaderIds]);
    createdBestelheaderIds.length = 0;
  }
  if (createdKlantEmails.length > 0) {
    await pool.query('DELETE FROM klanten WHERE email IN (?)', [createdKlantEmails]);
    createdKlantEmails.length = 0;
  }
});

describe('unieke bestelnr en klantnr', () => {
  it('weigert een tweede bestelheaders-rij met hetzelfde bestelnr', async () => {
    const email = `autotest-bestelnr-uniek-${randomUUID()}@example.com`;
    const klant = await insertRow<{ id: string }>('klanten', {
      email,
      wachtwoordHash: await hashPassword('x'),
      status: 'Beoordelen',
    } as never);
    createdKlantEmails.push(email);

    const eersteId = randomUUID();
    await getPool().query('INSERT INTO bestelheaders (id, klantId, bestelnr, status) VALUES (?, ?, ?, ?)', [
      eersteId,
      klant.id,
      'AUTOTEST-UNIEK-1',
      'Te beoordelen',
    ]);
    createdBestelheaderIds.push(eersteId);

    const tweedeId = randomUUID();
    await expect(
      getPool().query('INSERT INTO bestelheaders (id, klantId, bestelnr, status) VALUES (?, ?, ?, ?)', [
        tweedeId,
        klant.id,
        'AUTOTEST-UNIEK-1',
        'Te beoordelen',
      ])
    ).rejects.toThrow(/Duplicate entry/);
  });

  it('weigert een tweede klanten-rij met hetzelfde klantnr', async () => {
    const emailA = `autotest-klantnr-uniek-a-${randomUUID()}@example.com`;
    const emailB = `autotest-klantnr-uniek-b-${randomUUID()}@example.com`;
    await insertRow<{ id: string }>('klanten', {
      email: emailA,
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
      klantnr: 'AT-K-UNIEK-1',
    } as never);
    createdKlantEmails.push(emailA);

    // Als de UNIQUE-afdwinging ooit wegvalt en deze insert wél lukt, moet de
    // opruiming hem alsnog vinden -- vandaar dat de tweede email hier al op de
    // lijst komt, vóór we weten of de insert faalt.
    createdKlantEmails.push(emailB);
    await expect(
      insertRow<{ id: string }>('klanten', {
        email: emailB,
        wachtwoordHash: await hashPassword('x'),
        status: 'Goedgekeurd',
        klantnr: 'AT-K-UNIEK-1',
      } as never)
    ).rejects.toThrow(/Duplicate entry/);
  });
});
```

- [ ] **Step 2: Draai de test om te zien dat hij faalt**

```bash
npx vitest run tests/app/api/bestelnr-klantnr-uniek.test.ts
```

Verwacht: beide FAIL — de tweede insert slaagt vandaag in beide gevallen, dus `.rejects.toThrow(...)` faalt.

- [ ] **Step 3: Schrijf de migratiebestanden**

`db/migrations/2026-08-10-01-bestelnr-uniek.sql`:

```sql
-- Migratie voor de unieke bestelnr (2026-08-10), 1 van 8 in deze reeks.
-- Ontwerp: docs/superpowers/specs/2026-08-10-bestelnr-klantnr-en-zendingnummer-als-sleutel-design.md
--
-- Geen backfill nodig: bestelnr is al NOT NULL op elke rij (schema.sql, CREATE TABLE
-- bestelheaders) en door de tellergarantie in volgendNummer() binnen een transactie
-- al uniek. Faalt deze migratie alsnog op ER_DUP_ENTRY, dan wijst dat op een bug in
-- die tellergarantie die eerst opgelost moet worden -- geen reden om deze migratie
-- aan te passen.
ALTER TABLE bestelheaders ADD UNIQUE KEY uniek_bestelnr (bestelnr);
```

`db/migrations/2026-08-10-02-klantnr-uniek.sql`:

```sql
-- Migratie voor de unieke klantnr (2026-08-10), 2 van 8 in deze reeks.
-- Ontwerp: docs/superpowers/specs/2026-08-10-bestelnr-klantnr-en-zendingnummer-als-sleutel-design.md
--
-- klantnr blijft nullable: alleen 'Goedgekeurd'-klanten hebben er een. MariaDB staat
-- meerdere NULL's in een UNIQUE-index toe, dus dat gedrag verandert niet -- zelfde
-- redenering als klanten.kunstenaarnr in het kunstenaarnummer-ontwerp.
ALTER TABLE klanten ADD UNIQUE KEY uniek_klantnr (klantnr);
```

- [ ] **Step 4: Werk `db/schema.sql` bij**

In `CREATE TABLE bestelheaders`, vóór de sluitende `)`, na de `FOREIGN KEY`-regel (let op de komma die daarmee nodig wordt):

```sql
  FOREIGN KEY (klantId) REFERENCES klanten(id),
  UNIQUE KEY uniek_bestelnr (bestelnr)
```

In `CREATE TABLE klanten`, vóór de sluitende `)`, na de bestaande `UNIQUE KEY uniq_klanten_kunstenaarId`-regel (of het kunstenaarnr-equivalent als taak 1 van dat andere plan al is toegepast):

```sql
  UNIQUE KEY uniek_klantnr (klantnr)
```

- [ ] **Step 5: Pas de migraties toe op staging**

```bash
npm run db:migrate -- staging
```

Verwacht: beide bestanden toegepast, elk 1 statement, `gelukt`.

- [ ] **Step 6: Draai de tests**

```bash
npx vitest run tests/app/api/bestelnr-klantnr-uniek.test.ts
npx tsc --noEmit
```

Verwacht: beide tests PASS, `tsc` exit 0.

- [ ] **Step 7: Commit**

```bash
git add db/migrations/2026-08-10-01-bestelnr-uniek.sql db/migrations/2026-08-10-02-klantnr-uniek.sql db/schema.sql tests/app/api/bestelnr-klantnr-uniek.test.ts
git commit -m "feat: bestelnr en klantnr krijgen een unieke index"
```

---

### Task 2: `bestelheaders.klantId` → `klantnr`, met de 'Goedgekeurd'-poort

**Files:**
- Create: `db/migrations/2026-08-10-03-bestelheaders-klantnr.sql`
- Modify: `db/schema.sql` (`CREATE TABLE bestelheaders`)
- Modify: `src/lib/server/tableColumns.ts` (`bestelheaders`, regel 106)
- Modify: `src/app/api/bestelheaders/route.ts` (`POST`, `GET`)
- Modify: `src/components/beheer/BestellingenSection.tsx` (`Bestelling`-type, regel 31; groepering regel 347)
- Modify: `src/components/beheer/VersturenNaarDrukkerDialog.tsx` (klant-matching en `aantalKlanten`)
- Modify: `tests/app/api/bestelheaders.test.ts`
- Modify: `tests/app/api/klanten.test.ts` (twee rechtstreekse `INSERT INTO bestelheaders`)
- Modify: `tests/regression/staging-scenarios.test.ts` (`opruimenKlanten`, `maakKlant`)

**Interfaces:**
- Consumes: `uniek_klantnr` uit taak 1.
- Produces: kolom `bestelheaders.klantnr VARCHAR(20) NOT NULL` met FK naar `klanten(klantnr)`; `klantId` bestaat niet meer.
- Produces: `POST /api/bestelheaders` geeft `403 { error: 'klant-niet-goedgekeurd' }` als de klant geen `klantnr` heeft.
- Produces: `Bestelling.klantnr: string` (was `klantId`) — gebruikt door taak 4.

- [ ] **Step 1: Schrijf de falende test**

In `tests/app/api/bestelheaders.test.ts`, voeg toe (bijvoorbeeld direct na de bestaande `'ignores a klantId in the request body...'`-test) — dit test bestaat los van de fixture-wijzigingen in de stappen hierna en faalt nu al omdat de poort nog niet bestaat:

```ts
  it('weigert een bestelling van een klant die nog niet is goedgekeurd', async () => {
    const email = `autotest-niet-goedgekeurd-${randomUUID()}@example.com`;
    const created = await insertRow<{ id: string }>('klanten', {
      email,
      wachtwoordHash: await hashPassword('x'),
      status: 'Beoordelen',
    } as never);
    createdKlantEmails.push(email);
    const sessionId = await createSession('klant', created.id);
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;

    const response = await createHeader(postRequest({ lines: [] }, cookie));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'klant-niet-goedgekeurd' });
  });
```

Voeg `import { randomUUID } from 'crypto';` toe aan de imports bovenaan het bestand (nog niet aanwezig).

- [ ] **Step 2: Draai de test om te zien dat hij faalt**

```bash
npx vitest run tests/app/api/bestelheaders.test.ts -t "nog niet is goedgekeurd"
```

Verwacht: FAIL — de POST slaagt vandaag (201) voor elke ingelogde klant, ongeacht status.

- [ ] **Step 3: Schrijf het migratiebestand**

`db/migrations/2026-08-10-03-bestelheaders-klantnr.sql`:

```sql
-- Migratie voor bestelheaders.klantnr (2026-08-10), 3 van 8 in deze reeks.
-- Ontwerp: docs/superpowers/specs/2026-08-10-bestelnr-klantnr-en-zendingnummer-als-sleutel-design.md
--
-- Vervangt bestelheaders.klantId door klantnr. Bewust vervangen, niet aanvullen
-- (ontwerp, beslissing 2): twee kolommen naast elkaar zijn twee verwijzingen naar
-- dezelfde rij die uit elkaar kunnen lopen.
--
-- Volgorde van uitrol: eerst deze migratie, dan de code met de 'Goedgekeurd'-poort
-- (ontwerp, beslissing 3) deployen, dan herstarten. Tussen migratie en herstart leest
-- de nog draaiende oude code klantId en faalt elke nieuwe bestelling met
-- ER_BAD_FIELD_ERROR -- dat venster moet daarom kort zijn.
--
-- Als de UPDATE ... JOIN hieronder een bestaande bestelheader zonder klantnr
-- achterlaat (de klant bij die bestelling is nooit op 'Goedgekeurd' gezet, of is dat
-- nadien weer kwijtgeraakt), faalt de MODIFY ... NOT NULL hieronder luid. Controleer
-- dit VOORAF op de doelomgeving met:
--   SELECT bh.id, bh.bestelnr, k.email FROM bestelheaders bh
--   JOIN klanten k ON k.id = bh.klantId WHERE k.klantnr IS NULL;
-- Een niet-lege uitkomst vraagt om een handmatige blik (alsnog een klantnr toekennen
-- via PATCH /api/klanten/[id] met status 'Goedgekeurd') voordat deze migratie verder
-- kan.
ALTER TABLE bestelheaders ADD COLUMN klantnr VARCHAR(20) NULL AFTER id;

UPDATE bestelheaders bh
JOIN klanten k ON k.id = bh.klantId
SET bh.klantnr = k.klantnr;

ALTER TABLE bestelheaders DROP FOREIGN KEY bestelheaders_ibfk_1;
ALTER TABLE bestelheaders DROP COLUMN klantId;
ALTER TABLE bestelheaders MODIFY klantnr VARCHAR(20) NOT NULL;
ALTER TABLE bestelheaders ADD CONSTRAINT fk_bestelheaders_klantnr
  FOREIGN KEY (klantnr) REFERENCES klanten (klantnr);
```

- [ ] **Step 4: Werk `db/schema.sql` en `tableColumns.ts` bij**

In `db/schema.sql`, `CREATE TABLE bestelheaders`: vervang `klantId CHAR(36) NOT NULL,` door `klantnr VARCHAR(20) NOT NULL,`, en `FOREIGN KEY (klantId) REFERENCES klanten(id),` door `FOREIGN KEY (klantnr) REFERENCES klanten(klantnr),` (de `UNIQUE KEY uniek_bestelnr`-regel uit taak 1 blijft staan).

In `src/lib/server/tableColumns.ts`: `bestelheaders: ['id', 'klantId', 'bestelnr', 'besteldatum', 'status', 'zendingnummer'],` → `bestelheaders: ['id', 'klantnr', 'bestelnr', 'besteldatum', 'status', 'zendingnummer'],`.

- [ ] **Step 5: Controleer de constraintnaam en pas de migratie toe op staging**

```bash
npx tsx -e "import('./scripts/lib/env').then(async(m)=>{const {connection,database}=await m.verbind('staging');const[r]=await connection.query('SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND TABLE_NAME=\"bestelheaders\" AND REFERENCED_TABLE_NAME=\"klanten\"',[database]);console.log(r);await connection.end();})"
```

Wijkt de naam af van `bestelheaders_ibfk_1`, pas de `DROP FOREIGN KEY`-regel in de migratie daarop aan vóór de volgende stap.

```bash
npm run db:migrate -- staging
```

Verwacht: `2026-08-10-03-bestelheaders-klantnr.sql (5 statements)`, alle vijf `gelukt`.

- [ ] **Step 6: Zet `POST /api/bestelheaders` om**

In `src/app/api/bestelheaders/route.ts`, vervang het begin van `POST` (t/m de `INSERT INTO bestelheaders`):

```ts
export const POST = withApiErrorHandling('POST /api/bestelheaders', async (request: Request) => {
  // klantId comes from the session, never from the request body -- otherwise anyone
  // could place an order "as" any customer just by putting a different id in the body.
  const klantId = await requireKlant(request);
  if (!klantId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const pool = getPool();
  // Alleen 'Goedgekeurd'-klanten hebben een klantnr. useCustomerAuth's isCustomer-vlag
  // verbergt de bestelknop al voor iedereen daaronder, maar dat is uitsluitend een
  // UI-hint -- zonder deze controle kon een klant die nog in 'Beoordelen' zit via een
  // directe aanroep toch een bestelheaders-rij laten ontstaan, wat de NOT NULL foreign
  // key naar klanten(klantnr) breekt.
  const [klantRows] = await pool.query('SELECT klantnr, status FROM klanten WHERE id = ?', [klantId]);
  const klantRow = (klantRows as Array<{ klantnr: string | null; status: string }>)[0];
  if (!klantRow || klantRow.status !== 'Goedgekeurd' || !klantRow.klantnr) {
    return NextResponse.json({ error: 'klant-niet-goedgekeurd' }, { status: 403 });
  }
  const klantnr = klantRow.klantnr;

  const { lines } = (await request.json()) as { lines?: LineInput[] };

  if (!Array.isArray(lines)) {
    return NextResponse.json({ error: 'invalid-body' }, { status: 400 });
  }

  for (const line of lines) {
    const validationError = validateLine(line);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
  }

  const connection = await pool.getConnection();
```

(De regels `const pool = getPool(); const connection = await pool.getConnection();` die verderop al bestonden vervallen — `pool` wordt nu hierboven al aangemaakt.)

Verderop, vervang de `INSERT INTO bestelheaders`-regel:

```ts
    await connection.query(
      'INSERT INTO bestelheaders (id, klantnr, bestelnr, status) VALUES (?, ?, ?, ?)',
      [headerId, klantnr, bestelnr, 'Te beoordelen']
    );
```

De rest van `POST` (`checkOrderRight`, de regel-validatie, `berekenBestellijnPrijs`, de `bestelstatusHistorie`- en `bestellines`-inserts) blijft ongewijzigd — die blijven op `klantId` (voor exclusiviteit) en `headerId`/`bestelheaderId` (dat wordt pas in taak 3 aangepast).

- [ ] **Step 7: Zet `GET /api/bestelheaders` om**

In hetzelfde bestand, vervang in `GET` het stuk tussen de autorisatiecontrole en de `headerRijen`-variabele:

```ts
  const pool = getPool();

  let headerRijen: Array<Record<string, unknown>>;
  if (klantId) {
    // klantId blijft de query-parameter: dat drukt de sessie-identiteit van de klant
    // uit (een UUID), niet de databasekolom. bestelheaders zelf staat nu op klantnr,
    // dus die wordt hier één keer opgezocht in plaats van elke keer te joinen.
    const [klantRows] = await pool.query('SELECT klantnr FROM klanten WHERE id = ?', [klantId]);
    const klantnr = (klantRows as Array<{ klantnr: string | null }>)[0]?.klantnr;
    const [headers] = klantnr
      ? await pool.query('SELECT * FROM bestelheaders WHERE klantnr = ?', [klantnr])
      : [[]];
    headerRijen = headers as Array<Record<string, unknown>>;
  } else {
    const [headers] = await pool.query('SELECT * FROM bestelheaders');
    headerRijen = headers as Array<Record<string, unknown>>;
  }

  if (headerRijen.length === 0) {
    return NextResponse.json([]);
  }
```

De rest van `GET` (de `bestellines`-join en groepering op `bestelheaderId`) blijft in deze stap ongewijzigd — dat is taak 3.

- [ ] **Step 8: Draai de nieuwe test, dan de rest van het bestand**

```bash
npx vitest run tests/app/api/bestelheaders.test.ts -t "nog niet is goedgekeurd"
```

Verwacht: PASS.

```bash
npx vitest run tests/app/api/bestelheaders.test.ts
```

Verwacht: veel FAIL — elke test die `klant()`/`klantMetPrijsgroep()` gebruikt heeft nu een klant zonder `klantnr` (zie Global Constraints), en de assertie op regel 175-176 en 342-343 leest nog `klantId`. Dat lost de volgende stap op.

- [ ] **Step 9: Geef de klant-fixtures een `klantnr`**

In `tests/app/api/bestelheaders.test.ts`, voeg een teller toe direct boven `klant()` (rond regel 69):

```ts
let klantTeller = 0;
```

Vervang `klant()` en `klantMetPrijsgroep()`:

```ts
async function klant(email: string): Promise<{ id: string; klantnr: string; cookie: string }> {
  const klantnr = `AT-K-BH-${++klantTeller}`;
  const created = await insertRow<{ id: string }>('klanten', {
    email,
    wachtwoordHash: await hashPassword('x'),
    status: 'Goedgekeurd',
    klantnr,
  } as never);
  createdKlantEmails.push(email);
  const sessionId = await createSession('klant', created.id);
  return { id: created.id, klantnr, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}
```

```ts
async function klantMetPrijsgroep(
  email: string,
  prijsgroepId: string
): Promise<{ id: string; klantnr: string; cookie: string }> {
  const klantnr = `AT-K-BH-${++klantTeller}`;
  const created = await insertRow<{ id: string }>('klanten', {
    email,
    wachtwoordHash: await hashPassword('x'),
    status: 'Goedgekeurd',
    prijsgroepId,
    klantnr,
  } as never);
  createdKlantEmails.push(email);
  const sessionId = await createSession('klant', created.id);
  return { id: created.id, klantnr, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}
```

Werk de twee tests bij die de toegekende `klantnr` rechtstreeks controleren:

Regel 161-176 (eerste test in het bestand):
```ts
    const { klantnr, cookie } = await klant('k@example.com');
    ...
    const [headerRows] = await getPool().query('SELECT klantnr FROM bestelheaders WHERE id = ?', [body.id]);
    expect((headerRows as Array<{ klantnr: string }>)[0].klantnr).toBe(klantnr);
```

Regel 335-344 (de spoof-test):
```ts
  it('ignores a klantId in the request body -- the order is always placed for the session klant', async () => {
    const { klantnr, cookie } = await klant('spoof@example.com');
    const other = await klant('spoof-target@example.com');

    const response = await createHeader(postRequest({ klantId: other.id, lines: [] }, cookie));
    expect(response.status).toBe(201);
    const body = await response.json();
    const [rows] = await getPool().query('SELECT klantnr FROM bestelheaders WHERE id = ?', [body.id]);
    expect((rows as Array<{ klantnr: string }>)[0].klantnr).toBe(klantnr);
  });
```

Elke andere plek die `const { id: klantId, cookie } = await klant(...)` of `klant('...')` destructureert op `id`/`cookie` (bijvoorbeeld de `GET`-tests rond regel 346-380, die op `.id`/`.cookie` filteren) blijft ongewijzigd — die gebruiken de klant-UUID voor de query-parameter en session, niet voor een databasekolom.

- [ ] **Step 10: Draai de suite opnieuw**

```bash
npx vitest run tests/app/api/bestelheaders.test.ts
npx tsc --noEmit
```

Verwacht: alle PASS, `tsc` exit 0. Faalt er nog een test op een niet-herkende `klantId`-kolom in een query, zoek de regel op via de foutmelding en pas hem aan naar `klantnr`/`klant.klantnr` volgens hetzelfde patroon als Step 9.

- [ ] **Step 11: Werk `tests/app/api/klanten.test.ts` bij**

Twee tests (regel 146-173 en 191-222) maken rechtstreeks een `bestelheaders`-rij aan voor een klant die zelf niet via de goedkeuringsflow is aangemaakt (dus zonder `klantnr`). Geef elke klant-fixture een expliciet `klantnr` en gebruik dat in de `INSERT INTO bestelheaders`:

Regel 146-173:
```ts
  it('blocks a klant from deleting their own account while they have any bestelheaders row, open or closed', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'k@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
      klantnr: 'AT-K-KLN-1',
    } as never);
    createdKlantIds.push(klant.id);
    const headerId = randomUUID();
    await getPool().query('INSERT INTO bestelheaders (id, klantnr, bestelnr, status) VALUES (?, ?, ?, ?)', [
      headerId,
      'AT-K-KLN-1',
      'AUTOTEST-BLOCK-1',
      'Betaald en afgerond',
    ]);
    const sessionId = await createSession('klant', klant.id);
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;

    try {
      const response = await deleteKlant(req('DELETE', undefined, cookie), { params: { id: klant.id } });
      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error).toBe('heeft-bestellingen');
      const [rows] = await getPool().query('SELECT id FROM klanten WHERE id = ?', [klant.id]);
      expect((rows as unknown[]).length).toBe(1);
    } finally {
      await getPool().query('DELETE FROM bestelheaders WHERE id = ?', [headerId]);
    }
  });
```

Regel 191-222 — zelfde patroon, met `klantnr: 'AT-K-KLN-2'` en `'AUTOTEST-BLOCK-2'`. Het commentaar op regel 206-211 ("pre-existing, unrelated bug... `ER_ROW_IS_REFERENCED_2`") blijft inhoudelijk kloppen: de nieuwe foreign key (`klantnr` → `klanten(klantnr)`) heeft nog steeds geen `ON DELETE CASCADE`, dus de verwachte `500` verandert niet.

- [ ] **Step 12: Werk de klantId-verwijzingen in `BestellingenSection.tsx` en `VersturenNaarDrukkerDialog.tsx` bij**

In `src/components/beheer/BestellingenSection.tsx`:
- `interface Bestelling` (regel 31): `klantId: string;` → `klantnr: string;`.
- Regel 347: `bestellingen.filter((b) => selectieVoorFilter.has(b.id)).map((b) => b.klantId)` → `.map((b) => b.klantnr)`.

In `src/components/beheer/VersturenNaarDrukkerDialog.tsx`, vervang de twee `useMemo`-blokken:

```tsx
  const ontbrekendeKlantnrs = useMemo(
    () =>
      Array.from(new Set(bestellingen.map((b) => b.klantnr))).filter(
        (klantnr) => !klanten.some((k) => k.klantnr === klantnr)
      ),
    [bestellingen, klanten]
  );
  const heeftOntbrekendeKlantgegevens = ontbrekendeKlantnrs.length > 0;
  const aantalBestellingenMetOntbrekendeKlant = useMemo(
    () => bestellingen.filter((b) => ontbrekendeKlantnrs.includes(b.klantnr)).length,
    [bestellingen, ontbrekendeKlantnrs]
  );

  const onvolledigeKlanten = useMemo(
    () =>
      Array.from(new Set(bestellingen.map((b) => b.klantnr)))
        .map((klantnr) => klanten.find((k) => k.klantnr === klantnr))
        .filter((klant): klant is Klant => klant !== undefined)
        .map((klant) => ({ klant, velden: ontbrekendeKlantVelden(klant) }))
        .filter((entry) => entry.velden.length > 0),
    [bestellingen, klanten]
  );
```

En in `handleVersturen`, de `aantalKlanten`-regel binnen de `POST /api/drukkers/${drukkerId}/zendingen`-body:

```tsx
          aantalKlanten: new Set(bestellingen.map((b) => b.klantnr)).size,
```

(De `bestellingIds: bestellingen.map((b) => b.id)`-regel in datzelfde `fetch`-blok blijft in deze stap ongewijzigd — dat is taak 4.)

- [ ] **Step 13: Werk de regressiesuite bij**

In `tests/regression/staging-scenarios.test.ts`:

`opruimenKlanten` (regel 115-126) — de `bestelheaders`-delete filtert nu op `klantnr`:

```ts
async function opruimenKlanten(emails: string[]) {
  if (emails.length === 0) return;
  const pool = getPool();
  await pool.query(
    "DELETE FROM sessions WHERE userType = 'klant' AND userId IN (SELECT id FROM klanten WHERE email IN (?))",
    [emails]
  );
  await pool.query(
    'DELETE FROM bestelheaders WHERE klantnr IN (SELECT klantnr FROM klanten WHERE email IN (?))',
    [emails]
  );
  await pool.query('DELETE FROM klanten WHERE email IN (?)', [emails]);
}
```

`maakKlant` (regel 102-113) — elke aangemaakte klant krijgt een uniek, herkenbaar `klantnr` zodat wie via `maakKlant` besteld ook echt een `klantnr` heeft:

```ts
let klantTeller = 0;

async function maakKlant(emailPrefix: string, extra: Record<string, unknown> = {}) {
  const email = `autotest-${emailPrefix}-${randomUUID()}@example.com`;
  const created = await insertRow<{ id: string }>('klanten', {
    email,
    wachtwoordHash: await hashPassword('AutotestWachtwoord1!'),
    companyName: `AUTOTEST ${emailPrefix}`,
    status: 'Goedgekeurd',
    klantnr: `AT-K-REG-${++klantTeller}`,
    ...extra,
  } as never);
  const cookie = `${SESSION_COOKIE_NAME}=${await createSession('klant', created.id)}`;
  return { id: created.id, email, cookie };
}
```

Let op: als `extra` zelf een `klantnr` meegeeft (komt in dit bestand vandaag niet voor, maar zou de object-spread-volgorde stilzwijgend laten winnen), zet `...extra` vóór `klantnr: ...` in plaats van erna om dat uit te sluiten — met de huidige aanroepen maakt de volgorde niets uit, dit is alleen een waarschuwing voor toekomstige aanroepen.

De vier klanten die *niet* via `maakKlant` gaan (regel 578-584, 789-794, 1055-1060 — zie het onderzoek in het ontwerp) plaatsen geen bestelling en hebben dus geen `klantnr` nodig; die blijven ongewijzigd.

- [ ] **Step 14: Draai de volledige suite en de regressiesuite**

```bash
npx tsc --noEmit
npm test
npm run test:regression
```

Verwacht: `tsc` exit 0, alle tests PASS, regressiesuite PASS. Faalt de regressiesuite op een resterende `klantId`-verwijzing, zoek hem op met dezelfde `klantnr`-vertaling als hierboven.

- [ ] **Step 15: Commit**

```bash
git add db/migrations/2026-08-10-03-bestelheaders-klantnr.sql db/schema.sql src/lib/server/tableColumns.ts src/app/api/bestelheaders/route.ts src/components/beheer/BestellingenSection.tsx src/components/beheer/VersturenNaarDrukkerDialog.tsx tests/app/api/bestelheaders.test.ts tests/app/api/klanten.test.ts tests/regression/staging-scenarios.test.ts
git commit -m "feat: bestelheaders verwijst naar klanten via klantnr, met een goedkeuringspoort"
```

---

### Task 3: `bestellines` en `bestelstatusHistorie`: `bestelheaderId` → `bestelnr`

**Files:**
- Create: `db/migrations/2026-08-10-04-bestellines-bestelnr.sql`
- Create: `db/migrations/2026-08-10-05-bestelstatushistorie-bestelnr.sql`
- Modify: `db/schema.sql` (`CREATE TABLE bestellines`, `CREATE TABLE bestelstatusHistorie`)
- Modify: `src/lib/server/tableColumns.ts` (`bestellines` regel 107, `bestelstatusHistorie` regel 118)
- Modify: `src/app/api/bestelheaders/route.ts` (`POST`, `GET`)
- Modify: `src/app/api/bestelheaders/[id]/route.ts` (`PATCH`)
- Modify: `src/app/api/bestelheaders/[id]/statushistorie/route.ts` (`GET`)
- Modify: `src/app/api/bestelheaders/[id]/bestellines/[lineId]/route.ts` (`PATCH`)
- Modify: `tests/app/api/bestelheaders.test.ts`
- Modify: `tests/regression/staging-scenarios.test.ts`

**Interfaces:**
- Consumes: `uniek_bestelnr` uit taak 1.
- Produces: kolom `bestellines.bestelnr VARCHAR(20) NOT NULL` (was `bestelheaderId`), FK naar `bestelheaders(bestelnr)`, `ON DELETE CASCADE` behouden.
- Produces: kolom `bestelstatusHistorie.bestelnr VARCHAR(20) NOT NULL` (was `bestelheaderId`), zelfde vorm.

- [ ] **Step 1: Schrijf de falende test**

Voeg toe aan `tests/app/api/bestelheaders.test.ts` (bijvoorbeeld direct na de eerste test in het bestand):

```ts
  it('legt bestellines en bestelstatusHistorie vast op bestelnr, niet op de header-UUID', async () => {
    const { cookie } = await klant('bestelnr-fk@example.com');
    const maatId = await maakMaat(41, 61);
    const materiaalId = await maakMateriaal();
    const kunstwerkId = await maakGeprijsdKunstwerk(maatId, materiaalId, 150);

    const response = await createHeader(
      postRequest({ lines: [{ kunstwerkId, maatId, materiaalId, prijs: 1, quantity: 1 }] }, cookie)
    );
    const body = await response.json();

    const [lineRows] = await getPool().query('SELECT bestelnr FROM bestellines WHERE bestelnr = ?', [
      body.bestelnr,
    ]);
    expect((lineRows as unknown[]).length).toBe(1);

    const [historieRows] = await getPool().query('SELECT bestelnr FROM bestelstatusHistorie WHERE bestelnr = ?', [
      body.bestelnr,
    ]);
    expect((historieRows as unknown[]).length).toBe(1);
  });
```

- [ ] **Step 2: Draai de test om te zien dat hij faalt**

```bash
npx vitest run tests/app/api/bestelheaders.test.ts -t "bestelnr, niet op de header-UUID"
```

Verwacht: FAIL — `bestellines`/`bestelstatusHistorie` hebben nog geen `bestelnr`-kolom (`ER_BAD_FIELD_ERROR`).

- [ ] **Step 3: Schrijf de migratiebestanden**

`db/migrations/2026-08-10-04-bestellines-bestelnr.sql`:

```sql
-- Migratie voor bestellines.bestelnr (2026-08-10), 4 van 8 in deze reeks.
-- Ontwerp: docs/superpowers/specs/2026-08-10-bestelnr-klantnr-en-zendingnummer-als-sleutel-design.md
--
-- Geen weesrijen mogelijk: bestelheaderId is vandaag NOT NULL met een bestaande
-- foreign key, dus de UPDATE ... JOIN hieronder vult elke rij.
ALTER TABLE bestellines ADD COLUMN bestelnr VARCHAR(20) NULL AFTER bestelheaderId;

UPDATE bestellines bl
JOIN bestelheaders bh ON bh.id = bl.bestelheaderId
SET bl.bestelnr = bh.bestelnr;

ALTER TABLE bestellines DROP FOREIGN KEY bestellines_ibfk_1;
ALTER TABLE bestellines DROP COLUMN bestelheaderId;
ALTER TABLE bestellines MODIFY bestelnr VARCHAR(20) NOT NULL AFTER id;
ALTER TABLE bestellines ADD CONSTRAINT fk_bestellines_bestelnr
  FOREIGN KEY (bestelnr) REFERENCES bestelheaders (bestelnr) ON DELETE CASCADE;
```

`db/migrations/2026-08-10-05-bestelstatushistorie-bestelnr.sql`:

```sql
-- Migratie voor bestelstatusHistorie.bestelnr (2026-08-10), 5 van 8 in deze reeks.
-- Ontwerp: docs/superpowers/specs/2026-08-10-bestelnr-klantnr-en-zendingnummer-als-sleutel-design.md
--
-- Zelfde vorm als bestellines (vorige migratie in deze reeks).
ALTER TABLE bestelstatusHistorie ADD COLUMN bestelnr VARCHAR(20) NULL AFTER bestelheaderId;

UPDATE bestelstatusHistorie bsh
JOIN bestelheaders bh ON bh.id = bsh.bestelheaderId
SET bsh.bestelnr = bh.bestelnr;

ALTER TABLE bestelstatusHistorie DROP FOREIGN KEY bestelstatusHistorie_ibfk_1;
ALTER TABLE bestelstatusHistorie DROP COLUMN bestelheaderId;
ALTER TABLE bestelstatusHistorie MODIFY bestelnr VARCHAR(20) NOT NULL AFTER id;
ALTER TABLE bestelstatusHistorie ADD CONSTRAINT fk_bestelstatushistorie_bestelnr
  FOREIGN KEY (bestelnr) REFERENCES bestelheaders (bestelnr) ON DELETE CASCADE;
```

- [ ] **Step 4: Werk `db/schema.sql` en `tableColumns.ts` bij**

In `db/schema.sql`:
- `CREATE TABLE bestellines`: `bestelheaderId CHAR(36) NOT NULL,` → `bestelnr VARCHAR(20) NOT NULL,`; `FOREIGN KEY (bestelheaderId) REFERENCES bestelheaders(id) ON DELETE CASCADE,` → `FOREIGN KEY (bestelnr) REFERENCES bestelheaders(bestelnr) ON DELETE CASCADE,`.
- `CREATE TABLE bestelstatusHistorie`: zelfde vervanging.

In `src/lib/server/tableColumns.ts`:
- `bestellines: ['id', 'bestelheaderId', 'code', 'maatId', 'materiaalId', 'prijs', 'quantity', 'breedte', 'hoogte'],` → `'bestelheaderId'` wordt `'bestelnr'` (blijft 2e in de lijst).
- `bestelstatusHistorie: ['id', 'bestelheaderId', 'status', 'tijdstip'],` → zelfde vervanging.

- [ ] **Step 5: Controleer de constraintnamen en pas de migraties toe op staging**

```bash
npx tsx -e "import('./scripts/lib/env').then(async(m)=>{const {connection,database}=await m.verbind('staging');const[r]=await connection.query('SELECT TABLE_NAME, CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND REFERENCED_TABLE_NAME=\"bestelheaders\"',[database]);console.log(r);await connection.end();})"
```

Pas de `DROP FOREIGN KEY`-regels aan als de gerapporteerde namen afwijken van `bestellines_ibfk_1`/`bestelstatusHistorie_ibfk_1`.

```bash
npm run db:migrate -- staging
```

Verwacht: beide bestanden toegepast, elk 6 statements, `gelukt`.

- [ ] **Step 6: Zet de `POST`-inserts in `bestelheaders/route.ts` om**

Vervang de twee inserts ná de `bestelheaders`-insert:

```ts
    await connection.query('INSERT INTO bestelstatusHistorie (id, bestelnr, status) VALUES (?, ?, ?)', [
      randomUUID(),
      bestelnr,
      'Te beoordelen',
    ]);

    for (const line of resolvedLines) {
      await connection.query(
        'INSERT INTO bestellines (id, bestelnr, code, maatId, materiaalId, prijs, quantity, breedte, hoogte) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          randomUUID(),
          bestelnr,
          line.code,
          line.maatId,
          line.materiaalId,
          line.resolvedPrijs,
          line.quantity,
          line.breedte ?? null,
          line.hoogte ?? null,
        ]
      );
    }
```

(`bestelnr` is al een lokale variabele sinds `const bestelnr = await volgendNummer(...)` — dit is een kolomnaam- en waardewissel, geen nieuwe variabele.)

- [ ] **Step 7: Zet de `GET`-regelslookup om**

Vervang het stuk ná `if (headerRijen.length === 0) { return NextResponse.json([]); }`:

```ts
  const bestelnrs = headerRijen.map((header) => header.bestelnr);
  const [lines] = await pool.query('SELECT * FROM bestellines WHERE bestelnr IN (?)', [bestelnrs]);
  const regelsPerHeader = new Map<unknown, Array<Record<string, unknown>>>();
  for (const regel of lines as Array<Record<string, unknown>>) {
    const bestaand = regelsPerHeader.get(regel.bestelnr);
    if (bestaand) {
      bestaand.push(regel);
    } else {
      regelsPerHeader.set(regel.bestelnr, [regel]);
    }
  }

  return NextResponse.json(
    headerRijen.map((header) => ({ ...header, lines: regelsPerHeader.get(header.bestelnr) ?? [] }))
  );
```

- [ ] **Step 8: Zet `PATCH /api/bestelheaders/[id]` om**

In `src/app/api/bestelheaders/[id]/route.ts`:

```ts
export const PATCH = withMedewerker<{ params: { id: string } }>(
  'PATCH /api/bestelheaders/[id]',
  async (request, { params }) => {
    const data = await request.json();
    if ('status' in data) {
      const current = await getRow<{ status: string; bestelnr: string }>('bestelheaders', params.id);
      if (current && current.status !== data.status) {
        await getPool().query(
          'INSERT INTO bestelstatusHistorie (id, bestelnr, status) VALUES (?, ?, ?)',
          [randomUUID(), current.bestelnr, data.status]
        );
      }
    }
    await updateRow('bestelheaders', params.id, data);
    return NextResponse.json({ ok: true });
  }
);
```

- [ ] **Step 9: Zet `GET /api/bestelheaders/[id]/statushistorie` om**

```ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { getRow } from '@/lib/server/crud';
import { withMedewerker } from '@/lib/server/apiRoute';

export const GET = withMedewerker<{ params: { id: string } }>(
  'GET /api/bestelheaders/[id]/statushistorie',
  async (_request, { params }) => {
    const header = await getRow<{ bestelnr: string }>('bestelheaders', params.id);
    if (!header) {
      return NextResponse.json([]);
    }
    const [rows] = await getPool().query(
      'SELECT status, tijdstip FROM bestelstatusHistorie WHERE bestelnr = ? ORDER BY tijdstip ASC',
      [header.bestelnr]
    );
    return NextResponse.json(rows);
  }
);
```

- [ ] **Step 10: Zet `PATCH /api/bestelheaders/[id]/bestellines/[lineId]` om**

```ts
  const assignments = columns.map((column) => `bl.\`${column}\` = ?`).join(', ');
  const values = columns.map((column) => data[column]);
  // params.id blijft de bestelheader-UUID (het pad verandert niet); bestellines zelf
  // staat nu op bestelnr, dus de garantie "deze regel hoort bij déze header" komt via
  // een join in plaats van een rechtstreekse WHERE op bestelheaderId.
  await getPool().query(
    `UPDATE bestellines bl
     JOIN bestelheaders bh ON bh.bestelnr = bl.bestelnr
     SET ${assignments}
     WHERE bl.id = ? AND bh.id = ?`,
    [...values, params.lineId, params.id]
  );
```

- [ ] **Step 11: Werk de resterende `bestelheaderId`-verwijzingen in `tests/app/api/bestelheaders.test.ts` bij**

Elke resterende `WHERE bestelheaderId = ?` in dit bestand wordt `WHERE bestelnr = ?`, met het gebonden parameter omgezet van de header-UUID naar diezelfde headers `bestelnr` (elke `POST /api/bestelheaders`-respons bevat al beide velden):

| Regel | Was | Wordt |
|---|---|---|
| 178, 198, 213, 233, 291, 326 | `'SELECT prijs FROM bestellines WHERE bestelheaderId = ?', [body.id]` | `'SELECT prijs FROM bestellines WHERE bestelnr = ?', [body.bestelnr]` |
| 404, 592 | `'SELECT id FROM bestellines WHERE bestelheaderId = ?', [header.id]` | `'SELECT id FROM bestellines WHERE bestelnr = ?', [header.bestelnr]` |
| 437, 461, 492, 524 | `'SELECT status FROM bestelstatusHistorie WHERE bestelheaderId = ? ORDER BY tijdstip ASC', [header.id]` | `'SELECT status FROM bestelstatusHistorie WHERE bestelnr = ? ORDER BY tijdstip ASC', [header.bestelnr]` |
| 825 | `'SELECT code FROM bestellines WHERE bestelheaderId = ?', [headerId]` | Op regel 823 wordt `const { id: headerId } = await response.json();` — voeg `bestelnr` toe aan de destructurering: `const { id: headerId, bestelnr } = await response.json();`, en gebruik dan `'SELECT code FROM bestellines WHERE bestelnr = ?', [bestelnr]` |

- [ ] **Step 12: Draai de volledige suite**

```bash
npx vitest run tests/app/api/bestelheaders.test.ts
npx tsc --noEmit
npm test
```

Verwacht: alle PASS, `tsc` exit 0.

- [ ] **Step 13: Werk de regressiesuite bij en draai hem**

`grep -n bestelheaderId tests/regression/staging-scenarios.test.ts` geeft precies vier treffers (regelnummers kunnen door taak 2 al verschoven zijn — zoek dan op de query-tekst):

| Regel | Was | Wordt |
|---|---|---|
| 313-315 | `'SELECT maatId, prijs FROM bestellines WHERE bestelheaderId = ? ORDER BY maatId', [body.id]` | `'SELECT maatId, prijs FROM bestellines WHERE bestelnr = ? ORDER BY maatId', [body.bestelnr]` |
| 667-668 | `'SELECT id, prijs FROM bestellines WHERE bestelheaderId = ?', [header.id,` | `'SELECT id, prijs FROM bestellines WHERE bestelnr = ?', [header.bestelnr,` |
| 767 | `'SELECT prijs FROM bestellines WHERE bestelheaderId = ?', [body.id]` | `'SELECT prijs FROM bestellines WHERE bestelnr = ?', [body.bestelnr]` |
| 1231-1233 | `'SELECT status FROM bestelstatusHistorie WHERE bestelheaderId = ? ORDER BY tijdstip ASC', [header.id]` | `'SELECT status FROM bestelstatusHistorie WHERE bestelnr = ? ORDER BY tijdstip ASC', [header.bestelnr]` |

In elk geval is `body`/`header` het geparste JSON-antwoord van een `createHeader`-aanroep verderop in dezelfde test, dus `.bestelnr` staat er al naast `.id` op — geen nieuwe fetch nodig. (Regel 665, `'SELECT status FROM bestelheaders WHERE id = ?'`, bevat geen `bestelheaderId` en blijft ongewijzigd: dat is de header se eigen UUID-primary-key, geen verwijzing.)

```bash
npx tsc --noEmit
npm run test:regression
```

Verwacht: `tsc` exit 0, PASS. Los elke resterende `Unknown column 'bestelheaderId'`-fout op volgens hetzelfde patroon.

- [ ] **Step 14: Commit**

```bash
git add db/migrations/2026-08-10-04-bestellines-bestelnr.sql db/migrations/2026-08-10-05-bestelstatushistorie-bestelnr.sql db/schema.sql src/lib/server/tableColumns.ts src/app/api/bestelheaders tests/app/api/bestelheaders.test.ts tests/regression/staging-scenarios.test.ts
git commit -m "feat: bestellines en bestelstatusHistorie verwijzen naar bestelheaders via bestelnr"
```

---

### Task 4: `zendingnummer` op slot, en `drukkerZendingen.bestellingIds` wordt een koppeltabel

De grootste taak in deze reeks: `zendingnummer` moet eerst zelf een echte sleutel worden voordat de nieuwe koppeltabel er een foreign key naartoe kan leggen, en de JSON-lijst die vandaag een drukkerzending met meerdere bestellingen (van meerdere klanten) verbindt wordt vervangen door echte rijen.

**Files:**
- Create: `db/migrations/2026-08-10-06-zendingnummer-uniek.sql`
- Create: `db/migrations/2026-08-10-07-zendingnummer-koppeltabel.sql`
- Modify: `db/schema.sql` (`CREATE TABLE drukkerZendingen`, nieuwe `CREATE TABLE drukkerZendingBestellingen`)
- Modify: `src/lib/server/tableColumns.ts` (`drukkerZendingen`, nieuwe `drukkerZendingBestellingen`)
- Modify: `src/app/api/drukkers/[id]/zendingen/route.ts` (`POST`, `GET`)
- Modify: `src/app/api/drukkerzendingen/route.ts` (`GET`)
- Modify: `src/lib/zendingGenoten.ts` (`openstaandeZendingGenoten`)
- Modify: `src/components/beheer/VersturenNaarDrukkerDialog.tsx` (`bestellingIds`-payload)
- Modify: `tests/app/api/drukkerZendingen.test.ts`
- Modify: `tests/app/api/drukkerzendingen-lookup.test.ts`
- Modify: `tests/lib/zendingGenoten.test.ts`
- Modify: `tests/regression/staging-scenarios.test.ts` (3 `bestellingIds`-scenario's + opruimvolgorde)

**Interfaces:**
- Consumes: `drukkers.drukkernr`/`drukkerZendingen.drukkernr` uit het kunstenaarnummer/drukkernummer-plan.
- Produces: `drukkerZendingen.zendingnummer VARCHAR(20) NOT NULL` met `uniek_zendingnummer`.
- Produces: tabel `drukkerZendingBestellingen(zendingnummer, bestelnr)`, samengestelde primary key, beide een echte foreign key; `drukkerZendingen.bestellingIds` bestaat niet meer.
- Produces: elke route die een zending teruggeeft (`GET /api/drukkers/[id]/zendingen`, `GET /api/drukkerzendingen`, `POST /api/drukkers/[id]/zendingen`) blijft `bestellingIds: string[]` in zijn JSON-respons voeren — qua vorm ongewijzigd voor de client, maar de inhoud is voortaan `bestelnr` in plaats van de bestelheader-UUID.

- [ ] **Step 1: Schrijf de falende test**

Vervang het volledige bestand `tests/app/api/drukkerZendingen.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { deleteRow, insertRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { hashPassword } from '@/lib/server/password';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { GET as listZendingen, POST as createZending } from '@/app/api/drukkers/[id]/zendingen/route';

describe('drukkerZendingen route', () => {
  const createdDrukkerIds: string[] = [];
  const createdKlantEmails: string[] = [];
  let teller = 0;

  afterEach(async () => {
    const pool = getPool();
    // drukkerZendingen -> drukkers is sinds het drukkernummer-ontwerp RESTRICT, geen
    // cascade meer -- eerst de koppelrijen en de zending zelf weg, dan pas de drukker.
    if (createdDrukkerIds.length > 0) {
      await pool.query(
        `DELETE dzb FROM drukkerZendingBestellingen dzb
         JOIN drukkerZendingen z ON z.zendingnummer = dzb.zendingnummer
         JOIN drukkers d ON d.drukkernr = z.drukkernr
         WHERE d.id IN (?)`,
        [createdDrukkerIds]
      );
      await pool.query(
        'DELETE z FROM drukkerZendingen z JOIN drukkers d ON d.drukkernr = z.drukkernr WHERE d.id IN (?)',
        [createdDrukkerIds]
      );
      while (createdDrukkerIds.length > 0) {
        await deleteRow('drukkers', createdDrukkerIds.pop()!);
      }
    }
    if (createdKlantEmails.length > 0) {
      await pool.query(
        'DELETE FROM bestelheaders WHERE klantnr IN (SELECT klantnr FROM klanten WHERE email IN (?))',
        [createdKlantEmails]
      );
      await pool.query('DELETE FROM klanten WHERE email IN (?)', [createdKlantEmails]);
      createdKlantEmails.length = 0;
    }
    await pool.query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'staff-1'");
  });

  async function maakBestelnr(): Promise<string> {
    const nr = ++teller;
    const email = `autotest-dz-${nr}-${randomUUID()}@example.com`;
    const klantnr = `AT-K-DZ-${nr}`;
    await insertRow<{ id: string }>('klanten', {
      email,
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
      klantnr,
    } as never);
    createdKlantEmails.push(email);
    const bestelnr = `AT-BE-DZ-${nr}`;
    await getPool().query('INSERT INTO bestelheaders (id, klantnr, bestelnr, status) VALUES (?, ?, ?, ?)', [
      randomUUID(),
      klantnr,
      bestelnr,
      'Te beoordelen',
    ]);
    return bestelnr;
  }

  it('rejects listing without a medewerker session', async () => {
    const drukker = await insertRow<{ id: string; drukkernr: string }>('drukkers', {
      naam: 'PrintCo',
      drukkernr: `AT-D-DZ-${++teller}`,
    } as never);
    createdDrukkerIds.push(drukker.id);
    const response = await listZendingen(new Request('http://localhost/api'), {
      params: { id: drukker.id },
    });
    expect(response.status).toBe(401);
  });

  it('creates and lists a zending for a medewerker, newest first', async () => {
    const drukker = await insertRow<{ id: string; drukkernr: string }>('drukkers', {
      naam: 'PrintCo',
      drukkernr: `AT-D-DZ-${++teller}`,
    } as never);
    createdDrukkerIds.push(drukker.id);
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;
    const bestelnr1 = await maakBestelnr();
    const bestelnr2 = await maakBestelnr();

    await createZending(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          onderwerp: 'Bestellingen week 30',
          body: 'Zie bijlage',
          bestellingIds: [bestelnr1, bestelnr2],
          aantalKlanten: 2,
          aantalRegels: 3,
          verzondDoor: 'Paul',
          zendingnummer: `AT-ZD-DZ-${++teller}`,
        }),
      }),
      { params: { id: drukker.id } }
    );

    const response = await listZendingen(
      new Request('http://localhost/api', { headers: { cookie } }),
      { params: { id: drukker.id } }
    );
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].onderwerp).toBe('Bestellingen week 30');
    expect(body[0].bestellingIds.sort()).toEqual([bestelnr1, bestelnr2].sort());
  });
});
```

- [ ] **Step 2: Draai de test om te zien dat hij faalt**

```bash
npx vitest run tests/app/api/drukkerZendingen.test.ts
```

Verwacht: beide FAIL — `drukkerZendingBestellingen` bestaat nog niet (`ER_NO_SUCH_TABLE` in de `afterEach`), en `zendingnummer` is nog nullable zonder unieke index.

- [ ] **Step 3: Schrijf de migratiebestanden**

`db/migrations/2026-08-10-06-zendingnummer-uniek.sql`:

```sql
-- Migratie voor de unieke zendingnummer (2026-08-10), 6 van 8 in deze reeks.
-- Ontwerp: docs/superpowers/specs/2026-08-10-bestelnr-klantnr-en-zendingnummer-als-sleutel-design.md
--
-- zendingnummer is nullable sinds 2026-08-07-zendingnummer.sql: zendingen van
-- dáárvóór kregen er nooit één. Backfill vult exact die rijen, met nummers boven de
-- huidige tellerstand zodat er geen overlap ontstaat met nummers die runtime via
-- volgendNummer() al zijn uitgegeven.
SET @start = (SELECT value FROM counters WHERE id = 'zendingnummer');

CREATE TEMPORARY TABLE zendingnr_backfill AS
SELECT id, ROW_NUMBER() OVER (ORDER BY verzondenOp, id) AS rn
FROM drukkerZendingen
WHERE zendingnummer IS NULL;

UPDATE drukkerZendingen z
JOIN zendingnr_backfill b ON b.id = z.id
SET z.zendingnummer = CONCAT('ZD-', LPAD(@start + b.rn, 5, '0'));

UPDATE counters
SET value = @start + (SELECT COUNT(*) FROM zendingnr_backfill)
WHERE id = 'zendingnummer';

DROP TEMPORARY TABLE zendingnr_backfill;

ALTER TABLE drukkerZendingen MODIFY zendingnummer VARCHAR(20) NOT NULL AFTER id;
ALTER TABLE drukkerZendingen ADD UNIQUE KEY uniek_zendingnummer (zendingnummer);
```

`db/migrations/2026-08-10-07-zendingnummer-koppeltabel.sql`:

```sql
-- Migratie voor de zending<->bestelling-koppeltabel (2026-08-10), 7 van 8 in deze reeks.
-- Ontwerp: docs/superpowers/specs/2026-08-10-bestelnr-klantnr-en-zendingnummer-als-sleutel-design.md
--
-- Elk bestand in deze reeks van acht migraties heeft een 2-cijferige volgordeprefix
-- (01 t/m 08, direct na de datum): db:migrate past migraties toe in kale alfabetische
-- bestandsvolgorde (sorteerMigraties in scripts/lib/migrations.ts doet
-- filenames.sort(), geen datum- of afhankelijkheidsbewuste sortering), en bij acht
-- onderling afhankelijke bestanden op dezelfde datum is op de beschrijvende naam
-- laten leunen te broos -- deze migratie legt bijvoorbeeld een foreign key naar
-- drukkerZendingen(zendingnummer), die pas UNIQUE is ná bestand 06 hierboven. De
-- prefix maakt die volgorde expliciet in plaats van afhankelijk van hoe de rest van
-- de bestandsnaam toevallig alfabetiseert.
--
-- Vervangt drukkerZendingen.bestellingIds (JSON-array van bestelheaders.id) door
-- echte rijen: een JSON-array kan geen foreign-key-constraint per element dragen.
CREATE TABLE drukkerZendingBestellingen (
  zendingnummer VARCHAR(20) NOT NULL,
  bestelnr VARCHAR(20) NOT NULL,
  PRIMARY KEY (zendingnummer, bestelnr),
  FOREIGN KEY (zendingnummer) REFERENCES drukkerZendingen (zendingnummer) ON DELETE CASCADE,
  FOREIGN KEY (bestelnr) REFERENCES bestelheaders (bestelnr)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Pakt elke bestellingIds-JSON-array uit naar losse rijen. bestellingIds bevat
-- bestelheaders.id (UUID); de tweede JOIN vertaalt dat naar bestelnr.
INSERT INTO drukkerZendingBestellingen (zendingnummer, bestelnr)
SELECT z.zendingnummer, bh.bestelnr
FROM drukkerZendingen z
JOIN JSON_TABLE(
  z.bestellingIds, '$[*]' COLUMNS (bestelheaderId CHAR(36) PATH '$')
) AS jt
JOIN bestelheaders bh ON bh.id = jt.bestelheaderId;

ALTER TABLE drukkerZendingen DROP COLUMN bestellingIds;
```

- [ ] **Step 4: Werk `db/schema.sql` en `tableColumns.ts` bij**

In `db/schema.sql`, `CREATE TABLE drukkerZendingen`: `zendingnummer VARCHAR(20),` → `zendingnummer VARCHAR(20) NOT NULL,` (verplaatst naar direct na `id`), `UNIQUE KEY uniek_zendingnummer (zendingnummer)` toevoegen, en de `bestellingIds JSON,`-regel verwijderen. Voeg vóór de `CREATE TABLE kunstwerken`-blok (of een andere logische plek) de nieuwe tabel toe:

```sql
CREATE TABLE drukkerZendingBestellingen (
  zendingnummer VARCHAR(20) NOT NULL,
  bestelnr VARCHAR(20) NOT NULL,
  PRIMARY KEY (zendingnummer, bestelnr),
  FOREIGN KEY (zendingnummer) REFERENCES drukkerZendingen(zendingnummer) ON DELETE CASCADE,
  FOREIGN KEY (bestelnr) REFERENCES bestelheaders(bestelnr)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

In `src/lib/server/tableColumns.ts`:
- `drukkerZendingen`-lijst: verwijder `'bestellingIds'` (en uit de bijbehorende JSON-kolommenlijst waar `insertRow`/`updateRow` voor die tabel mee wordt aangeroepen).
- Voeg toe: `drukkerZendingBestellingen: ['zendingnummer', 'bestelnr'],` — deze tabel gaat nooit via `insertRow`/`updateRow` (geen los `id`), maar `controleerKolommen` wordt alleen aangeroepen als er via die helpers geschreven wordt; de route in Step 6 gebruikt rechtstreekse SQL, dus dit is puur voor de volledigheid van de allow-list en niet strikt vereist om te laten werken.

- [ ] **Step 5: Pas de migraties toe op staging**

Controleer eerst hoeveel `drukkerZendingen`-rijen een `NULL` `zendingnummer` hebben:

```bash
npx tsx -e "import('./scripts/lib/env').then(async(m)=>{const {connection}=await m.verbind('staging');const[r]=await connection.query('SELECT COUNT(*) AS n FROM drukkerZendingen WHERE zendingnummer IS NULL');console.log(r);await connection.end();})"
```

```bash
npm run db:migrate -- staging
```

Verwacht: `2026-08-10-06-zendingnummer-uniek.sql` en `2026-08-10-07-zendingnummer-koppeltabel.sql`, beide `gelukt`, in die volgorde.

- [ ] **Step 6: Zet `POST` en `GET /api/drukkers/[id]/zendingen` om**

```ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { getRow, insertRow } from '@/lib/server/crud';
import { withMedewerker } from '@/lib/server/apiRoute';

type Context = { params: { id: string } };

export const GET = withMedewerker<Context>(
  'GET /api/drukkers/[id]/zendingen',
  async (_request, { params }) => {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT z.* FROM drukkerZendingen z
       JOIN drukkers d ON d.drukkernr = z.drukkernr
       WHERE d.id = ?
       ORDER BY z.verzondenOp DESC`,
      [params.id]
    );
    const zendingen = rows as Array<Record<string, unknown> & { zendingnummer: string }>;
    if (zendingen.length === 0) {
      return NextResponse.json([]);
    }

    const zendingnummers = zendingen.map((z) => z.zendingnummer);
    const [koppelRows] = await pool.query(
      'SELECT zendingnummer, bestelnr FROM drukkerZendingBestellingen WHERE zendingnummer IN (?)',
      [zendingnummers]
    );
    const bestelnrsPerZending = new Map<string, string[]>();
    for (const row of koppelRows as Array<{ zendingnummer: string; bestelnr: string }>) {
      const bestaand = bestelnrsPerZending.get(row.zendingnummer);
      if (bestaand) {
        bestaand.push(row.bestelnr);
      } else {
        bestelnrsPerZending.set(row.zendingnummer, [row.bestelnr]);
      }
    }

    return NextResponse.json(
      zendingen.map((z) => ({ ...z, bestellingIds: bestelnrsPerZending.get(z.zendingnummer) ?? [] }))
    );
  }
);

export const POST = withMedewerker<Context>(
  'POST /api/drukkers/[id]/zendingen',
  async (request, { params }) => {
    const drukker = await getRow<{ drukkernr: string }>('drukkers', params.id);
    if (!drukker) return NextResponse.json({ error: 'drukker-not-found' }, { status: 404 });

    const { bestellingIds, ...data } = (await request.json()) as {
      bestellingIds?: string[];
      [key: string]: unknown;
    };
    const bestelnrs = bestellingIds ?? [];

    const pool = getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const created = await insertRow<{ zendingnummer: string }>(
        'drukkerZendingen',
        { drukkernr: drukker.drukkernr, ...data },
        [],
        connection
      );
      for (const bestelnr of bestelnrs) {
        await connection.query(
          'INSERT INTO drukkerZendingBestellingen (zendingnummer, bestelnr) VALUES (?, ?)',
          [created.zendingnummer, bestelnr]
        );
      }
      await connection.commit();
      return NextResponse.json({ ...created, bestellingIds: bestelnrs }, { status: 201 });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
);
```

- [ ] **Step 7: Draai de nieuwe test**

```bash
npx vitest run tests/app/api/drukkerZendingen.test.ts
```

Verwacht: beide PASS.

- [ ] **Step 8: Zet `GET /api/drukkerzendingen` om**

Vervang het volledige bestand `src/app/api/drukkerzendingen/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { withMedewerker } from '@/lib/server/apiRoute';

// Begrenst de IN(?)-lijst; een grotere selectie dan dit komt in de beheeromgeving
// niet voor en zou alleen een onbedoeld enorme query opleveren.
const MAX_IDS = 200;

export const GET = withMedewerker('GET /api/drukkerzendingen', async (request: Request) => {
  const raw = new URL(request.url).searchParams.get('bestellingIds') ?? '';
  const bestelnrs = raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (bestelnrs.length === 0) {
    return NextResponse.json([]);
  }
  if (bestelnrs.length > MAX_IDS) {
    return NextResponse.json({ error: 'too-many-ids' }, { status: 400 });
  }

  const pool = getPool();
  const [zendingnummerRows] = await pool.query(
    'SELECT DISTINCT zendingnummer FROM drukkerZendingBestellingen WHERE bestelnr IN (?)',
    [bestelnrs]
  );
  const zendingnummers = (zendingnummerRows as Array<{ zendingnummer: string }>).map((r) => r.zendingnummer);
  if (zendingnummers.length === 0) {
    return NextResponse.json([]);
  }

  const [rows] = await pool.query(
    `SELECT z.id, z.zendingnummer, z.drukkernr, z.verzondenOp, d.naam AS drukkerNaam
     FROM drukkerZendingen z
     JOIN drukkers d ON d.drukkernr = z.drukkernr
     WHERE z.zendingnummer IN (?)
     ORDER BY z.verzondenOp DESC`,
    [zendingnummers]
  );
  const zendingen = rows as Array<Record<string, unknown> & { zendingnummer: string }>;

  const [koppelRows] = await pool.query(
    'SELECT zendingnummer, bestelnr FROM drukkerZendingBestellingen WHERE zendingnummer IN (?)',
    [zendingnummers]
  );
  const bestelnrsPerZending = new Map<string, string[]>();
  for (const row of koppelRows as Array<{ zendingnummer: string; bestelnr: string }>) {
    const bestaand = bestelnrsPerZending.get(row.zendingnummer);
    if (bestaand) {
      bestaand.push(row.bestelnr);
    } else {
      bestelnrsPerZending.set(row.zendingnummer, [row.bestelnr]);
    }
  }

  return NextResponse.json(
    zendingen.map((z) => ({ ...z, bestellingIds: bestelnrsPerZending.get(z.zendingnummer) ?? [] }))
  );
});
```

- [ ] **Step 9: Werk `tests/app/api/drukkerzendingen-lookup.test.ts` bij**

Vervang het volledige bestand:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { deleteRow, insertRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { hashPassword } from '@/lib/server/password';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { GET as lookupZendingen } from '@/app/api/drukkerzendingen/route';
import { POST as createZending } from '@/app/api/drukkers/[id]/zendingen/route';

describe('drukkerzendingen lookup route', () => {
  const createdDrukkerIds: string[] = [];
  const createdKlantEmails: string[] = [];
  let teller = 0;

  afterEach(async () => {
    const pool = getPool();
    if (createdDrukkerIds.length > 0) {
      await pool.query(
        `DELETE dzb FROM drukkerZendingBestellingen dzb
         JOIN drukkerZendingen z ON z.zendingnummer = dzb.zendingnummer
         JOIN drukkers d ON d.drukkernr = z.drukkernr
         WHERE d.id IN (?)`,
        [createdDrukkerIds]
      );
      await pool.query(
        'DELETE z FROM drukkerZendingen z JOIN drukkers d ON d.drukkernr = z.drukkernr WHERE d.id IN (?)',
        [createdDrukkerIds]
      );
      while (createdDrukkerIds.length > 0) {
        await deleteRow('drukkers', createdDrukkerIds.pop()!);
      }
    }
    if (createdKlantEmails.length > 0) {
      await pool.query(
        'DELETE FROM bestelheaders WHERE klantnr IN (SELECT klantnr FROM klanten WHERE email IN (?))',
        [createdKlantEmails]
      );
      await pool.query('DELETE FROM klanten WHERE email IN (?)', [createdKlantEmails]);
      createdKlantEmails.length = 0;
    }
    await pool.query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'staff-1'");
  });

  async function maakBestelnr(): Promise<string> {
    const nr = ++teller;
    const email = `autotest-dzl-${nr}-${randomUUID()}@example.com`;
    const klantnr = `AT-K-DZL-${nr}`;
    await insertRow<{ id: string }>('klanten', {
      email,
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
      klantnr,
    } as never);
    createdKlantEmails.push(email);
    const bestelnr = `AT-BE-DZL-${nr}`;
    await getPool().query('INSERT INTO bestelheaders (id, klantnr, bestelnr, status) VALUES (?, ?, ?, ?)', [
      randomUUID(),
      klantnr,
      bestelnr,
      'Te beoordelen',
    ]);
    return bestelnr;
  }

  async function maakZending(bestellingIds: string[], cookie: string) {
    const drukker = await insertRow<{ id: string; drukkernr: string }>('drukkers', {
      naam: 'AUTOTEST PrintCo',
      drukkernr: `AT-D-DZL-${++teller}`,
    } as never);
    createdDrukkerIds.push(drukker.id);
    await createZending(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          onderwerp: 'AUTOTEST zending',
          body: 'AUTOTEST',
          bestellingIds,
          aantalKlanten: 1,
          aantalRegels: bestellingIds.length,
          verzondDoor: 'AUTOTEST',
          zendingnummer: `AT-ZD-DZL-${++teller}`,
        }),
      }),
      { params: { id: drukker.id } }
    );
    return drukker;
  }

  it('rejects the lookup without a medewerker session', async () => {
    const response = await lookupZendingen(
      new Request('http://localhost/api/drukkerzendingen?bestellingIds=AT-BE-ONBEKEND')
    );
    expect(response.status).toBe(401);
  });

  it('finds the zending that contains the requested bestelling, including the drukker name', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;
    const bestelnrA1 = await maakBestelnr();
    const bestelnrA2 = await maakBestelnr();
    const drukker = await maakZending([bestelnrA1, bestelnrA2], cookie);

    const response = await lookupZendingen(
      new Request(`http://localhost/api/drukkerzendingen?bestellingIds=${bestelnrA1}`, { headers: { cookie } })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].drukkernr).toBe(drukker.drukkernr);
    expect(body[0].drukkerNaam).toBe('AUTOTEST PrintCo');
    expect(body[0].bestellingIds.sort()).toEqual([bestelnrA1, bestelnrA2].sort());
  });

  it('returns an empty array for an unknown bestelling id', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;
    const bestelnrB1 = await maakBestelnr();
    await maakZending([bestelnrB1], cookie);

    const response = await lookupZendingen(
      new Request('http://localhost/api/drukkerzendingen?bestellingIds=AT-BE-BESTAAT-NIET', { headers: { cookie } })
    );
    expect(await response.json()).toEqual([]);
  });

  it('returns an empty array when the bestellingIds parameter is missing or empty', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;

    const zonder = await lookupZendingen(new Request('http://localhost/api/drukkerzendingen', { headers: { cookie } }));
    expect(await zonder.json()).toEqual([]);

    const leeg = await lookupZendingen(
      new Request('http://localhost/api/drukkerzendingen?bestellingIds=', { headers: { cookie } })
    );
    expect(await leeg.json()).toEqual([]);
  });

  it('rejects more than 200 ids', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;
    const ids = Array.from({ length: 201 }, (_, index) => `AT-BE-${index}`).join(',');

    const response = await lookupZendingen(
      new Request(`http://localhost/api/drukkerzendingen?bestellingIds=${ids}`, { headers: { cookie } })
    );
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 10: Zet `openstaandeZendingGenoten` om**

In `src/lib/zendingGenoten.ts`, vervang de functie:

```ts
export function openstaandeZendingGenoten(
  zendingen: Zending[],
  afTeRonden: Bestelling[],
  alleBestellingen: Bestelling[]
): ZendingGenoten[] {
  const afTeRondenBestelnrs = new Set(afTeRonden.map((b) => b.bestelnr));
  const bestellingByBestelnr = new Map(alleBestellingen.map((b) => [b.bestelnr, b]));
  const alGezien = new Set<string>();
  const resultaat: ZendingGenoten[] = [];

  for (const zending of zendingen) {
    const bestellingen = zending.bestellingIds
      .filter((bestelnr) => !afTeRondenBestelnrs.has(bestelnr) && !alGezien.has(bestelnr))
      .map((bestelnr) => bestellingByBestelnr.get(bestelnr))
      .filter((b): b is Bestelling => b !== undefined && b.status === 'Verstuurd naar drukker');
    if (bestellingen.length === 0) {
      continue;
    }
    bestellingen.forEach((b) => alGezien.add(b.bestelnr));
    resultaat.push({ zending, bestellingen });
  }

  return resultaat;
}
```

`Zending.bestellingIds: string[]` en `fetchZendingen`/`fetchZendingenBatch` blijven ongewijzigd — die zijn generiek over strings en weten niet of het een UUID of een `bestelnr` is.

- [ ] **Step 11: Werk `tests/lib/zendingGenoten.test.ts` bij**

Elke `zending(id, [...])`-aanroep in het `describe('openstaandeZendingGenoten', ...)`-blok gebruikte tot nu toe de `id` van de bijbehorende `bestelling(id, ...)`-fixture in zijn `bestellingIds`-array. Omdat `openstaandeZendingGenoten` nu op `bestelnr` matcht (en `bestelling(id, ...)` al een `bestelnr: `GD-${id}`` -veld heeft), vervangen die waarden:

```ts
  it('leaves out the bestellingen that are being afgerond right now', () => {
    const b1 = bestelling('1', 'Verstuurd naar drukker');
    const b2 = bestelling('2', 'Verstuurd naar drukker');
    const result = openstaandeZendingGenoten([zending('z1', ['GD-1', 'GD-2'])], [b1, b2], [b1, b2]);
    expect(result).toEqual([]);
  });

  it('reports a genoot that is still "Verstuurd naar drukker"', () => {
    const b1 = bestelling('1', 'Verstuurd naar drukker');
    const b2 = bestelling('2', 'Verstuurd naar drukker');
    const result = openstaandeZendingGenoten([zending('z1', ['GD-1', 'GD-2'])], [b1], [b1, b2]);
    expect(result).toHaveLength(1);
    expect(result[0].zending.id).toBe('z1');
    expect(result[0].bestellingen.map((b) => b.bestelnr)).toEqual(['GD-2']);
  });

  it('ignores genoten that are already afgerond', () => {
    const b1 = bestelling('1', 'Verstuurd naar drukker');
    const b2 = bestelling('2', 'Betaald en afgerond');
    expect(openstaandeZendingGenoten([zending('z1', ['GD-1', 'GD-2'])], [b1], [b1, b2])).toEqual([]);
  });

  it('ignores genoten that are already Te factureren', () => {
    const b1 = bestelling('1', 'Verstuurd naar drukker');
    const b2 = bestelling('2', 'Te factureren');
    expect(openstaandeZendingGenoten([zending('z1', ['GD-1', 'GD-2'])], [b1], [b1, b2])).toEqual([]);
  });

  it('ignores ids that no longer exist in the bestellingen list', () => {
    const b1 = bestelling('1', 'Verstuurd naar drukker');
    expect(openstaandeZendingGenoten([zending('z1', ['GD-1', 'GD-weg'])], [b1], [b1])).toEqual([]);
  });

  it('groups genoten per zending and never lists the same bestelling twice', () => {
    const b1 = bestelling('1', 'Verstuurd naar drukker');
    const b2 = bestelling('2', 'Verstuurd naar drukker');
    const b3 = bestelling('3', 'Verstuurd naar drukker');
    const result = openstaandeZendingGenoten(
      [zending('z1', ['GD-1', 'GD-2']), zending('z2', ['GD-1', 'GD-2', 'GD-3'])],
      [b1],
      [b1, b2, b3]
    );
    expect(result.map((entry) => entry.zending.id)).toEqual(['z1', 'z2']);
    expect(result[0].bestellingen.map((b) => b.bestelnr)).toEqual(['GD-2']);
    expect(result[1].bestellingen.map((b) => b.bestelnr)).toEqual(['GD-3']);
  });
```

De eerste test (`'returns nothing when there are no zendingen'`) en het volledige `describe('fetchZendingen', ...)`-blok (inclusief `rawZendingRow`) blijven ongewijzigd — die gebruiken de `id`/`bestellingIds`-waarden puur als opake strings voor de batching/dedup-logica.

`zending(id, bestellingIds)` zelf verwacht al `drukkernr` in plaats van `drukkerId` (aangenomen dat het kunstenaarnummer/drukkernummer-plan dat al heeft gezet) — als dat daar nog niet is doorgevoerd, doe dat hier ook.

- [ ] **Step 12: Zet de `bestellingIds`-payload in `VersturenNaarDrukkerDialog.tsx` om**

```tsx
          bestellingIds: bestellingen.map((b) => b.bestelnr),
```

(vervangt `bestellingen.map((b) => b.id)` in de `POST /api/drukkers/${drukkerId}/zendingen`-body binnen `handleVersturen`.)

- [ ] **Step 13: Draai de volledige suite**

```bash
npx tsc --noEmit
npm test
```

Verwacht: `tsc` exit 0, alle PASS.

- [ ] **Step 14: Werk de drie `bestellingIds`-scenario's in de regressiesuite bij, en de opruimvolgorde**

In `tests/regression/staging-scenarios.test.ts`:

1. **Deel C3 ("bestellingen van meerdere klanten combineren + niet-standaard drukker kiezen"), rond regel 399-499.** `headerIds` (gevuld met `headerX.id, headerY.id`) wordt `bestelnrs` (`headerX.bestelnr, headerY.bestelnr`); de `postZending`-body's `bestellingIds: headerIds` wordt `bestellingIds: bestelnrs`; de assertie op regel 480 (`alternatiefZendingen[0].bestellingIds.sort()).toEqual([...headerIds].sort())`) vergelijkt tegen `[...bestelnrs].sort()`. **Opruimvolgorde:** de `finally`-blok (regel 493-499) verwijdert vandaag eerst de klanten/bestelheaders (via `opruimenKlanten`, regel 494) en pas daarna de drukkers (regel 498) — dat loopt nu vast op de foreign key van `drukkerZendingBestellingen.bestelnr` naar `bestelheaders(bestelnr)`. Draai de volgorde om: eerst de koppelrijen en zendingen van de gebruikte drukkers verwijderen, dán `opruimenKlanten`:
   ```ts
   } finally {
     const pool = getPool();
     if (drukkerIds.length > 0) {
       await pool.query(
         `DELETE dzb FROM drukkerZendingBestellingen dzb
          JOIN drukkerZendingen z ON z.zendingnummer = dzb.zendingnummer
          JOIN drukkers d ON d.drukkernr = z.drukkernr
          WHERE d.id IN (?)`,
         [drukkerIds]
       );
       await pool.query(
         'DELETE z FROM drukkerZendingen z JOIN drukkers d ON d.drukkernr = z.drukkernr WHERE d.id IN (?)',
         [drukkerIds]
       );
       await pool.query('DELETE FROM drukkers WHERE id IN (?)', [drukkerIds]);
     }
     await opruimenKlanten(klantEmails);
     if (kunstwerkId) await pool.query('DELETE FROM kunstwerken WHERE id = ?', [kunstwerkId]);
     if (fixture) await fixture.opruimen();
   }
   ```
2. **Bestelling-levenscyclus, rond regel 697-725.** Zelfde patroon: `bestellingIds: [header.id]` → `bestellingIds: [header.bestelnr]`, en de `finally`-blok (regel 718-725) krijgt dezelfde omgekeerde volgorde (drukker/zending-opruiming vóór `opruimenKlanten`).
3. **Bestelling afronden, rond regel 1196-1241.** Zelfde patroon: `bestellingIds: [header.id]` → `bestellingIds: [header.bestelnr]`; de `finally`-blok (regel 1236-1241) — waarvan het commentaar nu expliciet fout is ("opruimenKlanten verwijdert ook de bestelheader ... geen apart headerId-cleanup nodig") — omgedraaid naar dezelfde volgorde, met het commentaar bijgewerkt: drukker/zending-koppelrijen verwijderen kan nu niet meer ná het verwijderen van de bestelheader, want de foreign key staat dat niet toe.

- [ ] **Step 15: Draai de regressiesuite**

```bash
npm run test:regression
```

Verwacht: PASS. Dit is de echte controle op de "meerdere klanten combineren"- en "niet-standaard drukker kiezen"-scenario's.

- [ ] **Step 16: Commit**

```bash
git add db/migrations/2026-08-10-06-zendingnummer-uniek.sql db/migrations/2026-08-10-07-zendingnummer-koppeltabel.sql db/schema.sql src/lib/server/tableColumns.ts src/app/api/drukkers src/app/api/drukkerzendingen src/lib/zendingGenoten.ts src/components/beheer/VersturenNaarDrukkerDialog.tsx tests/app/api/drukkerZendingen.test.ts tests/app/api/drukkerzendingen-lookup.test.ts tests/lib/zendingGenoten.test.ts tests/regression/staging-scenarios.test.ts
git commit -m "feat: zendingnummer wordt een echte sleutel en bestellingIds een koppeltabel"
```

---

### Task 5: Kolomvolgorde — de bestaande kolommen naar direct na `id`

Puur cosmetisch: geen enkele query of test-assertie hangt van kolomvolgorde af. Verplaatst alleen de twee kolommen die dit plan niet zelf al met `AFTER id`/`AFTER <vorige-kolom>` heeft neergezet omdat ze al vóór dit plan bestonden.

**Files:**
- Create: `db/migrations/2026-08-10-08-kolomvolgorde-generated-numbers.sql`
- Modify: `db/schema.sql` (`CREATE TABLE klanten`, `CREATE TABLE bestelheaders`)

**Interfaces:** geen — geen code buiten `db/schema.sql` verwijst naar kolomvolgorde.

- [ ] **Step 1: Schrijf de migratie**

`db/migrations/2026-08-10-08-kolomvolgorde-generated-numbers.sql`:

```sql
-- Migratie voor kolomvolgorde (2026-08-10), laatste van deze reeks.
-- Ontwerp: docs/superpowers/specs/2026-08-10-bestelnr-klantnr-en-zendingnummer-als-sleutel-design.md
--
-- Zuiver leesbaarheid: verplaatst de twee kolommen die dit plan niet zelf al met
-- ADD COLUMN ... AFTER neerzette omdat ze al vóór dit plan bestonden. klantnr op
-- bestelheaders (taak 2) en drukkerZendingen.zendingnummer (taak 4) staan al goed en
-- worden hier NIET nogmaals verplaatst.
ALTER TABLE klanten MODIFY klantnr VARCHAR(20) NULL AFTER id;
ALTER TABLE bestelheaders MODIFY zendingnummer VARCHAR(20) NULL AFTER bestelnr;
```

- [ ] **Step 2: Werk `db/schema.sql` bij**

Verplaats in `CREATE TABLE klanten` de regel `klantnr VARCHAR(20),` naar direct na `id CHAR(36) PRIMARY KEY,`. Verplaats in `CREATE TABLE bestelheaders` de regel `zendingnummer VARCHAR(20),` naar direct na `bestelnr VARCHAR(20) NOT NULL,` (die staat daar door taak 2 al bijna, dit is puur de laatste stap zodat de volgorde in het bestand exact de fysieke kolomvolgorde weerspiegelt).

- [ ] **Step 3: Pas de migratie toe op staging**

```bash
npm run db:migrate -- staging
```

Verwacht: `2026-08-10-08-kolomvolgorde-generated-numbers.sql (2 statements)`, `gelukt`.

- [ ] **Step 4: Controleer de kolomvolgorde handmatig**

```bash
npx tsx -e "import('./scripts/lib/env').then(async(m)=>{const {connection}=await m.verbind('staging');const[a]=await connection.query('DESCRIBE klanten');const[b]=await connection.query('DESCRIBE bestelheaders');console.log(a.map(r=>r.Field));console.log(b.map(r=>r.Field));await connection.end();})"
```

Verwacht: `klanten` toont `id, klantnr, email, ...`; `bestelheaders` toont `id, klantnr, bestelnr, zendingnummer, besteldatum, status`.

- [ ] **Step 5: Draai de volledige suite**

```bash
npx tsc --noEmit
npm test
```

Verwacht: `tsc` exit 0, alle PASS — kolomvolgorde is functioneel inert, dit bevestigt alleen dat er geen syntaxfout in de migratie zat.

- [ ] **Step 6: Commit**

```bash
git add db/migrations/2026-08-10-08-kolomvolgorde-generated-numbers.sql db/schema.sql
git commit -m "chore: verplaats klantnr en bestelheaders.zendingnummer naar hun definitieve kolomvolgorde"
```

---

### Task 6: Uitrol naar staging en productie

Geen code. Deze taak is de reden dat de migraties bestaan en hoort in het plan omdat hij fout kan gaan.

**Files:** geen.

**Interfaces:**
- Consumes: alles uit taak 1 t/m 5, gecommit op `master`.

- [ ] **Step 1: Controleer dat staging alle zes migraties heeft**

```bash
npm run db:status -- staging
```

Verwacht: geen openstaande migraties (elke migratie in dit plan is al per taak op staging toegepast; dit is de laatste controle vóór de deploy).

- [ ] **Step 2: Deploy naar staging**

Dispatch `deploy-naar-staging.yml` tegen `master`. Wacht tot de run groen is; hij zet een `vN`-tag.

- [ ] **Step 3: Herstart de staging-app**

Klik in DirectAdmin op **RESTART** voor de staging Node.js-app. **Run NPM Install** alleen als `package.json`/`package-lock.json` gewijzigd zijn — bij dit plan is dat niet het geval. Een groene workflow betekent niet dat de nieuwe build live is.

- [ ] **Step 4: Controleer op staging**

Loop deze lijst af in de beheer- en klantomgeving:

1. Als een `'Beoordelen'`-testklant proberen te bestellen → geweigerd (403, `klant-niet-goedgekeurd`); goedkeuren tot `'Goedgekeurd'` → bestellen lukt, `bestelnr`/`klantnr` correct vastgelegd.
2. Een bestaande bestelling openen in beheer → bestellijnen en statushistorie tonen nog steeds correct.
3. Een bestelling naar een niet-standaard drukker versturen (twee bestellingen van twee verschillende klanten in één zending, net als de regressiesuite) → de "nog openstaande bestellingen bij dezelfde zending"-melding werkt nog bij het afronden van één van beide.
4. De zendinghistorie in `DrukkerModal` voor een drukker met bestaande zendingen → toont nog steeds het juiste aantal bestellingen per zending.
5. De klantnummerreeks in `KlantModal` (subtitel) → ongewijzigd zichtbaar.

- [ ] **Step 5: Vraag toestemming voor de productiedatabase**

Vraag het expliciet, in deze woorden of vergelijkbaar: "Mag ik de acht migraties uit dit plan (`bestelnr-uniek`, `klantnr-uniek`, `bestelheaders-klantnr`, `bestellines-bestelnr`, `bestelstatushistorie-bestelnr`, `zendingnummer-uniek`, `zendingnummer-uniek-koppeltabel`, `kolomvolgorde-generated-numbers`) op de productiedatabase toepassen?" Wacht op een duidelijk ja. Een eerdere goedkeuring telt niet.

Vermeld daarbij expliciet: in tegenstelling tot het kunstenaarnummer/drukkernummer-plan (waar productie leeg was) **staat er op productie mogelijk al echte data** — met name migratie `bestelheaders-klantnr` kan vastlopen op een bestaande bestelling van een klant zonder `klantnr`. Controleer dat vóóraf op productie met dezelfde query als in die migratie's commentaar:

```sql
SELECT bh.id, bh.bestelnr, k.email FROM bestelheaders bh
JOIN klanten k ON k.id = bh.klantId WHERE k.klantnr IS NULL;
```

Een niet-lege uitkomst betekent: die klant eerst via `PATCH /api/klanten/[id]` (status `'Goedgekeurd'`) een `klantnr` geven, vóór de migratie draait.

- [ ] **Step 6: Migreer productie**

```bash
npm run db:migrate -- productie --confirm
```

Verwacht: alle nog niet toegepaste migraties uit dit plan, alle statements `gelukt`.

- [ ] **Step 7: Promoveer naar productie**

Dispatch `deploy-naar-production.yml` tegen `master`, zonder `version`-invoer (dan promoveert hij de hoogste `vN`-tag — de versie die op staging stond). Klik daarna **RESTART** in DirectAdmin voor de productie-app.

- [ ] **Step 8: Controleer op productie**

Log in als medewerker, open een bestaande bestelling en controleer dat bestellijnen en statushistorie nog kloppen. Als er een testklant/testbestelling beschikbaar is: plaats een kleine testbestelling en controleer dat `bestelnr`/`klantnr` correct verschijnen, verwijder de testrijen daarna weer.
