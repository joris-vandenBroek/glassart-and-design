# Kunstenaarnummer en drukkernummer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `kunstenaars` en `drukkers` krijgen een automatisch uitgegeven, uniek volgnummer (`KU-00001` / `DR-00001`), en dat nummer wordt de kolom waarmee `kunstwerken`, `klanten` en `drukkerZendingen` naar ze verwijzen in plaats van de UUID.

**Architecture:** Drie migraties. De eerste is additief (nummerkolom + teller) zodat de suite groen blijft; de tweede zet de twee kunstenaar-relaties om; de derde doet de drukkerkant in één keer. Elke migratie zit in dezelfde commit als de codewijziging die hem nodig heeft. De UUID blijft primary key, dus API-paden, beheer-URL's en `kunstenaarAfspraken` veranderen niet — dat kost twee joins in de prijsmodule.

**Tech Stack:** Next.js 14 App Router, TypeScript, raw `mysql2` tegen MariaDB 11.8 (geen ORM), Vitest + React Testing Library, `next-intl`.

Ontwerp: [`docs/superpowers/specs/2026-08-10-kunstenaarnummer-en-drukkernummer-design.md`](../specs/2026-08-10-kunstenaarnummer-en-drukkernummer-design.md).

## Global Constraints

- **Begin dit werk pas als de kunstwerkcode gecommit is.** Taak 2 en 4 raken `KunstwerkenSection.tsx`, `materiaalTypes.ts`, `tableColumns.ts`, `db/schema.sql` en `ProductModal.tsx` — dezelfde bestanden. Controleer met `git status` dat de working tree schoon is voordat je taak 1 begint.
- **Er is geen lokale database.** `npm test` en `npm run dev` praten allebei tegen de **staging**-MariaDB uit `.env.local`. Een migratie moet dus op staging zijn toegepast vóórdat de tests van die taak kunnen slagen.
- **Testopruiming mag nooit data verwijderen die via de applicatie is toegevoegd.** Elke test ruimt exact de rijen op die hij zelf aanmaakte, op gevangen id — nooit een `DELETE` zonder `WHERE`, nooit `TRUNCATE`, nooit "de rij die ik net maakte" via `list()[0]`.
- **Reset nooit een `counters`-rij**, ook niet de nieuwe `kunstenaarnummer` en `drukkernummer`. Een test die een nummer controleert rekent relatief aan de huidige stand (`expect(Number(tweede.slice(3))).toBe(Number(eerste.slice(3)) + 1)`), nooit tegen een vaste `KU-00001`. Elke testrun hoogt deze tellers blijvend op; dat is de bewust geaccepteerde uitzondering, net als bij `bestelnummer`.
- **Elke kunstenaar- en drukker-fixture in een test heeft een uniek nummer nodig.** Vanaf taak 1 is `kunstenaars.kunstenaarnr` `NOT NULL` + `UNIQUE`, vanaf taak 4 geldt hetzelfde voor `drukkers.drukkernr`. Fixtures die rechtstreeks `insertRow` gebruiken geven zelf een obviously-fake nummer mee (`AT-K-<bestand>-<n>` / `AT-D-<bestand>-<n>`, max 20 tekens) — dat houdt ze buiten de teller. Alleen rijen die via `POST` ontstaan krijgen een echt `KU-`/`DR-`-nummer.
- **`src/lib/server/tableColumns.ts` is een allow-list die *gooit* bij een onbekende kolom.** Een kolomwijziging vraagt altijd om: migratiebestand + `db/schema.sql` + `tableColumns.ts`.
- **`npx tsc --noEmit` moet na elke taak exit 0 geven.** Tests staan in `tsconfig.json`'s `include`, dus dit is het betrouwbaarste middel om alle plekken te vinden die een omgenoemd veld gebruiken. Blinde vlek: fixtures met `as never` (`insertRow('kunstenaars', { … } as never)`) worden **niet** door de typechecker gezien — die staan hieronder met bestand en regelnummer uitgeschreven.
- **Nooit `deploy-naar-production.yml` zonder eerst dezelfde commit op staging te hebben gezet en daar gecontroleerd.**
- **Vraag altijd expliciet toestemming vóór elke wijziging aan de productiedatabase**, ook als een eerdere wijziging al goedgekeurd was.
- De beheerteksten staan alléén in `messages/nl.json`; `en/de/fr` hebben geen `beheer`-blok. Dit werk voegt niets klantzichtbaars toe, dus die drie bestanden blijven ongemoeid.
- Regelnummers in dit plan zijn van 2026-08-10 en kunnen een paar regels verschoven zijn; zoek altijd op de genoemde symboolnaam.

---

### Task 1: `kunstenaars.kunstenaarnr` — kolom, teller en automatische uitgifte

Additief: na deze taak heeft elke kunstenaar een uniek `KU-`-nummer en deelt `POST /api/kunstenaars` er zelf een uit. Er verwijst nog niets naar het nummer.

**Files:**
- Create: `db/migrations/2026-08-10-kunstenaarnummer.sql`
- Create: `tests/app/api/kunstenaarnummer.test.ts`
- Modify: `db/schema.sql` (`CREATE TABLE kunstenaars`, `INSERT INTO counters`)
- Modify: `src/lib/server/tableColumns.ts` (`kunstenaars`, regel 62-71)
- Modify: `src/lib/server/counters.ts:14` (`CounterNaam`)
- Modify: `src/lib/server/crud.ts:78-95` (`insertRow`)
- Modify: `src/app/api/kunstenaars/route.ts:29-36` (`POST`)
- Modify: `src/app/api/kunstenaars/[id]/route.ts:30-40` (`PATCH`)
- Modify: `src/components/beheer/kunstenaarTypes.ts` (`Kunstenaar`)
- Test: `tests/app/api/bestelheaders.test.ts:187,222`
- Test: `tests/app/api/kunstenaars.test.ts:191`
- Test: `tests/lib/server/prijsmodule.test.ts:95,156`
- Test: `tests/regression/staging-scenarios.test.ts:165,260,929,990`

**Interfaces:**
- Produces: kolom `kunstenaars.kunstenaarnr VARCHAR(20) NOT NULL` met index `uniek_kunstenaarnr`.
- Produces: `counters`-rij `kunstenaarnummer`.
- Produces: `CounterNaam` bevat `'kunstenaarnummer'`.
- Produces: `insertRow(table, data, jsonColumns?, connection?)` — vierde parameter, gelijk aan `updateRow`'s vijfde.
- Produces: `Kunstenaar.kunstenaarnr: string` — gebruikt door taak 2 en 3.

- [ ] **Step 1: Schrijf de falende test**

Nieuw bestand `tests/app/api/kunstenaarnummer.test.ts`:

```ts
import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { POST as createKunstenaar } from '@/app/api/kunstenaars/route';
import { PATCH as patchKunstenaar } from '@/app/api/kunstenaars/[id]/route';

const createdKunstenaarIds: string[] = [];

afterEach(async () => {
  // createSession('medewerker', 'staff-1') gebruikt een vast nep-userId (er bestaat geen
  // medewerkerrij voor), dus elke aanroep laat een losse sessions-rij achter.
  await getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'staff-1'");
  if (createdKunstenaarIds.length > 0) {
    await getPool().query('DELETE FROM kunstenaars WHERE id IN (?)', [createdKunstenaarIds]);
    createdKunstenaarIds.length = 0;
  }
});

async function medewerkerCookie(): Promise<string> {
  const sessionId = await createSession('medewerker', 'staff-1');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

function postRequest(body: unknown, cookie: string): Request {
  return new Request('http://localhost/api/kunstenaars', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

function patchRequest(body: unknown, cookie: string): Request {
  return new Request('http://localhost/api/kunstenaars/x', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

async function maakViaApi(naam: string, cookie: string, extra: Record<string, unknown> = {}) {
  const response = await createKunstenaar(postRequest({ naam, exclusieveKlantIds: [], ...extra }, cookie));
  expect(response.status).toBe(201);
  const created = (await response.json()) as { id: string; kunstenaarnr: string };
  createdKunstenaarIds.push(created.id);
  return created;
}

describe('kunstenaarnr', () => {
  it('kent bij het aanmaken een oplopend KU-nummer toe', async () => {
    const cookie = await medewerkerCookie();
    const eerste = await maakViaApi('AUTOTEST Nummer Een', cookie);
    const tweede = await maakViaApi('AUTOTEST Nummer Twee', cookie);

    expect(eerste.kunstenaarnr).toMatch(/^KU-\d{5}$/);
    expect(tweede.kunstenaarnr).toMatch(/^KU-\d{5}$/);
    // Relatief aan de tellerstand: de counters-rij mag nooit gereset worden.
    expect(Number(tweede.kunstenaarnr.slice(3))).toBe(Number(eerste.kunstenaarnr.slice(3)) + 1);
  });

  it('slaat het nummer ook echt op in de database', async () => {
    const cookie = await medewerkerCookie();
    const created = await maakViaApi('AUTOTEST Nummer Opgeslagen', cookie);
    const [rows] = await getPool().query('SELECT kunstenaarnr FROM kunstenaars WHERE id = ?', [created.id]);
    expect((rows as Array<{ kunstenaarnr: string }>)[0].kunstenaarnr).toBe(created.kunstenaarnr);
  });

  it('negeert een kunstenaarnr uit de request-body bij het aanmaken', async () => {
    const cookie = await medewerkerCookie();
    const created = await maakViaApi('AUTOTEST Nummer Verzonnen', cookie, { kunstenaarnr: 'KU-99999' });
    expect(created.kunstenaarnr).not.toBe('KU-99999');
  });

  it('negeert een kunstenaarnr uit de request-body bij het wijzigen', async () => {
    const cookie = await medewerkerCookie();
    const created = await maakViaApi('AUTOTEST Nummer Vast', cookie);

    const response = await patchKunstenaar(patchRequest({ kunstenaarnr: 'KU-99998', naam: 'AUTOTEST Nummer Vast 2' }, cookie), {
      params: { id: created.id },
    });
    expect(response.status).toBe(200);

    const [rows] = await getPool().query('SELECT kunstenaarnr, naam FROM kunstenaars WHERE id = ?', [created.id]);
    const rij = (rows as Array<{ kunstenaarnr: string; naam: string }>)[0];
    expect(rij.kunstenaarnr).toBe(created.kunstenaarnr);
    expect(rij.naam).toBe('AUTOTEST Nummer Vast 2');
  });
});
```

- [ ] **Step 2: Draai de test om te zien dat hij faalt**

```bash
npx vitest run tests/app/api/kunstenaarnummer.test.ts
```

Verwacht: alle vier FAIL. De eerste drie op `expect(response.status).toBe(201)` met een 500 uit `insertRow` (`Onbekende kolom(men) voor tabel kunstenaars: kunstenaarnr`), de vierde op `Unknown column 'kunstenaarnr' in 'field list'`.

- [ ] **Step 3: Schrijf het migratiebestand**

`db/migrations/2026-08-10-kunstenaarnummer.sql`:

```sql
-- Migratie voor het kunstenaarnummer (2026-08-10), deel 1 van 2.
-- Ontwerp: docs/superpowers/specs/2026-08-10-kunstenaarnummer-en-drukkernummer-design.md
--
-- Deel 1 is additief: het voegt het nummer toe en vult het. Er verwijst nog niets
-- naar; dat doet deel 2 (2026-08-10-kunstenaarnr-relaties.sql). Deze splitsing is
-- er zodat de testsuite na elke taak groen kan zijn.
--
-- Volgorde van uitrol: draai deze migratie tegen een omgeving VOORDAT de code die
-- hem gebruikt daar gedeployd wordt. Andersom levert POST /api/kunstenaars een
-- ER_BAD_FIELD_ERROR op. Deze kant op is onschadelijk: de dan nog draaiende versie
-- kent de kolom niet en raakt hem niet aan.
--
-- kunstenaars heeft geen createdAt, dus de backfill nummert op (naam, id) -- stabiel
-- en herhaalbaar. ROW_NUMBER() in een tijdelijke tabel, niet @n := @n + 1 (dat
-- garandeert geen toewijzingsvolgorde) en geen gecorreleerde subquery op kunstenaars
-- zelf (dat is de tabel die bijgewerkt wordt). Zelfde recept als
-- 2026-08-08-klantnummer.sql.
ALTER TABLE kunstenaars ADD COLUMN kunstenaarnr VARCHAR(20) AFTER id;

CREATE TEMPORARY TABLE kunstenaarnr_backfill AS
SELECT id, ROW_NUMBER() OVER (ORDER BY naam, id) AS rn FROM kunstenaars;

UPDATE kunstenaars k
JOIN kunstenaarnr_backfill b ON b.id = k.id
SET k.kunstenaarnr = CONCAT('KU-', LPAD(b.rn, 5, '0'));

DROP TEMPORARY TABLE kunstenaarnr_backfill;

-- NOT NULL kan pas na de backfill. De UNIQUE-index maakt het nummer de sleutel waar
-- deel 2 foreign keys naartoe legt.
ALTER TABLE kunstenaars MODIFY kunstenaarnr VARCHAR(20) NOT NULL;
ALTER TABLE kunstenaars ADD UNIQUE KEY uniek_kunstenaarnr (kunstenaarnr);

-- Telt élke genummerde kunstenaar, niet alleen de zojuist bijgewerkte rijen, zodat de
-- teller ook klopt als dit ooit draait op een database die al nummers heeft.
INSERT INTO counters (id, value) VALUES ('kunstenaarnummer', (SELECT COUNT(*) FROM kunstenaars));
```

- [ ] **Step 4: Werk `db/schema.sql` en `tableColumns.ts` bij**

In `db/schema.sql`, in `CREATE TABLE kunstenaars`, direct onder `id CHAR(36) PRIMARY KEY,`:

```sql
  kunstenaarnr VARCHAR(20) NOT NULL,
```

en vóór de sluitende `)` van diezelfde tabel:

```sql
  UNIQUE KEY uniek_kunstenaarnr (kunstenaarnr)
```

(let op de komma achter `exclusieveKlantIds JSON` die daarmee nodig wordt.)

Voeg bij de `counters`-regels toe:

```sql
INSERT INTO counters (id, value) VALUES ('kunstenaarnummer', 0);
```

In `src/lib/server/tableColumns.ts`, in de `kunstenaars`-lijst, direct na `'id',`:

```ts
    'kunstenaarnr',
```

- [ ] **Step 5: Pas de migratie toe op staging**

```bash
npm run db:migrate -- staging
```

Verwacht: `2026-08-10-kunstenaarnummer.sql (7 statements)`, alle zeven `gelukt`, gevolgd door `genoteerd in schema_migrations`.

Controleer daarna:

```bash
npm run db:status -- staging
```

Verwacht: geen openstaande migraties meer.

- [ ] **Step 6: Breid `counters.ts` en `insertRow` uit**

In `src/lib/server/counters.ts`, regel 14:

```ts
export type CounterNaam = 'bestelnummer' | 'zendingnummer' | 'klantnummer' | 'kunstenaarnummer' | 'drukkernummer';
```

(`drukkernummer` komt pas in taak 4 in gebruik; hem hier meenemen scheelt een tweede aanraking van dit bestand.)

In `src/lib/server/crud.ts`, vervang `insertRow` (regel 78-95):

```ts
/**
 * `connection` is optioneel zodat een aanroeper die al in een transactie zit dezelfde
 * insert kan draaien -- nodig omdat het ophogen van een teller en het invoegen van de
 * rij die het nummer krijgt in dezelfde transactie moeten zitten. Gelijk aan de
 * `connection`-parameter van `updateRow` hieronder.
 */
export async function insertRow<T extends { id?: string }>(
  table: string,
  data: Omit<T, 'id'>,
  jsonColumns: string[] = [],
  connection?: Pick<Pool, 'query'>
): Promise<T> {
  const id = randomUUID();
  const full = { id, ...data } as Record<string, unknown>;
  const serialized = serializeRow(full, jsonColumns);
  const columns = Object.keys(serialized);
  controleerKolommen(table, columns);
  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map((column) => serialized[column]);
  await (connection ?? getPool()).query(
    `INSERT INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(', ')}) VALUES (${placeholders})`,
    values
  );
  return full as T;
}
```

- [ ] **Step 7: Laat `POST /api/kunstenaars` een nummer uitgeven**

In `src/app/api/kunstenaars/route.ts`, breid de imports uit en vervang `POST` (regel 29-36):

```ts
import { getPool } from '@/lib/server/db';
import { volgendNummer } from '@/lib/server/counters';
```

```ts
export const POST = withApiErrorHandling('POST /api/kunstenaars', async (request: Request) => {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // Het nummer is server-eigendom: een kunstenaarnr uit de body wordt weggegooid.
  // Dat is wat de foreign keys uit deel 2 stabiel houdt -- er is geen pad waarlangs
  // een nummer kan verschuiven onder bestaande verwijzingen.
  const { kunstenaarnr: _genegeerd, ...data } = (await request.json()) as Record<string, unknown>;
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    // Ophogen en invoegen in dezelfde transactie, anders zien twee gelijktijdige
    // aanmaakverzoeken hetzelfde nummer.
    const kunstenaarnr = await volgendNummer(connection, 'kunstenaarnummer', 'KU-');
    const created = await insertRow(
      'kunstenaars',
      { ...data, kunstenaarnr },
      KUNSTENAARS_JSON_COLUMNS,
      connection
    );
    await connection.commit();
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});
```

- [ ] **Step 8: Laat `PATCH /api/kunstenaars/[id]` het nummer negeren**

In `src/app/api/kunstenaars/[id]/route.ts`, in `PATCH` (regel 36):

```ts
    // Zie POST: het nummer is server-eigendom en ligt na uitgifte vast.
    const { kunstenaarnr: _genegeerd, ...data } = (await request.json()) as Record<string, unknown>;
```

- [ ] **Step 9: Voeg het veld toe aan het TypeScript-type**

In `src/components/beheer/kunstenaarTypes.ts`, in `interface Kunstenaar`, direct onder `id: string;`:

```ts
  // Uniek volgnummer (KU-00001), door de server uitgegeven en niet te wijzigen.
  // kunstwerken en klanten verwijzen hiermee naar de kunstenaar.
  kunstenaarnr: string;
```

- [ ] **Step 10: Werk de testfixtures bij**

Elke fixture die rechtstreeks een kunstenaar invoegt heeft nu een uniek nummer nodig. `tsc` ziet deze niet (`as never`), dus loop ze stuk voor stuk langs. Voeg in elk object een `kunstenaarnr` toe:

- `tests/app/api/bestelheaders.test.ts:187` → `kunstenaarnr: 'AT-K-BH-1',`
- `tests/app/api/bestelheaders.test.ts:222` → `kunstenaarnr: 'AT-K-BH-2',`
- `tests/app/api/kunstenaars.test.ts:191` → `kunstenaarnr: 'AT-K-KUN-1',`
- `tests/lib/server/prijsmodule.test.ts:95` → zie hieronder (helper, krijgt een teller)
- `tests/lib/server/prijsmodule.test.ts:156` → `kunstenaarnr: 'AT-K-PM-X',`
- `tests/regression/staging-scenarios.test.ts:165` → `kunstenaarnr: 'AT-K-REG-1',`
- `tests/regression/staging-scenarios.test.ts:260` → `kunstenaarnr: 'AT-K-REG-2',`
- `tests/regression/staging-scenarios.test.ts:929` → `kunstenaarnr: 'AT-K-REG-3',`
- `tests/regression/staging-scenarios.test.ts:990` → `kunstenaarnr: 'AT-K-REG-4',`

`maakKunstenaarMetOpslag` in `tests/lib/server/prijsmodule.test.ts:95` wordt door meerdere tests aangeroepen, dus die heeft een teller nodig — twee aanroepen met hetzelfde nummer botsen op `uniek_kunstenaarnr`:

```ts
let kunstenaarTeller = 0;
```

en in het `insertRow`-object van die helper:

```ts
      kunstenaarnr: `AT-K-PM-${++kunstenaarTeller}`,
```

- [ ] **Step 11: Draai de tests en de typechecker**

```bash
npx vitest run tests/app/api/kunstenaarnummer.test.ts
```

Verwacht: alle vier PASS.

```bash
npx tsc --noEmit
npm test
```

Verwacht: `tsc` exit 0, alle tests PASS. Faalt er een test op `ER_DUP_ENTRY` voor `uniek_kunstenaarnr`, dan gebruiken twee fixtures hetzelfde nummer — geef de tweede een andere.

- [ ] **Step 12: Commit**

```bash
git add db/migrations/2026-08-10-kunstenaarnummer.sql db/schema.sql src/lib/server/tableColumns.ts src/lib/server/counters.ts src/lib/server/crud.ts src/app/api/kunstenaars src/components/beheer/kunstenaarTypes.ts tests
git commit -m "feat: kunstenaars krijgen een uniek, automatisch uitgegeven kunstenaarnr"
```

---

### Task 2: `kunstwerken` en `klanten` verwijzen via `kunstenaarnr`

De omzetting zelf. Na deze taak bestaat `kunstenaarId` nergens meer.

**Files:**
- Create: `db/migrations/2026-08-10-kunstenaarnr-relaties.sql`
- Modify: `db/schema.sql` (`klanten`, `kunstwerken`)
- Modify: `src/lib/server/tableColumns.ts` (`klanten` regel 41, `kunstwerken` regel 90)
- Modify: `src/lib/server/prijsmodule.ts:25-30,73,79-95,110-115,140`
- Modify: `src/app/api/bestelheaders/route.ts:35-57,97-108,145`
- Modify: `src/app/api/kunstwerken/prijzen/route.ts:13-24`
- Modify: `src/app/api/kunstenaars/[id]/route.ts` (`DELETE`)
- Modify: `src/lib/server/klantFields.ts:3` (alleen het commentaar)
- Modify: `src/components/beheer/materiaalTypes.ts:48`
- Modify: `src/components/beheer/KlantenSection.tsx:34`
- Modify: `src/components/beheer/KlantModal.tsx:92,110,136,172,187,555`
- Modify: `src/components/beheer/KunstenaarsSection.tsx:81-86,314`
- Modify: `src/components/beheer/KunstwerkenSection.tsx:48,86,243,266,272,297,357,363,401,722`
- Modify: `src/components/ProductModal.tsx:140,167-168`
- Modify: `src/components/ProductsGrid.tsx:107`
- Modify: `src/components/FiltersPanelContent.tsx:25`
- Modify: `src/components/CartPanel.tsx:68`
- Modify: `src/lib/resolveOrderRight.ts:15-35`
- Test: `tests/app/api/klanten.test.ts:237-284`, `tests/app/api/klanten-me.test.ts:80`, en alles wat `tsc` aanwijst

**Interfaces:**
- Consumes: `Kunstenaar.kunstenaarnr` uit taak 1.
- Produces: kolommen `kunstwerken.kunstenaarnr VARCHAR(20) NULL` en `klanten.kunstenaarnr VARCHAR(20) NULL`, beide met FK naar `kunstenaars(kunstenaarnr)`; `kunstenaarId` bestaat op geen van beide nog.
- Produces: `prijsopslagVoorKunstenaar(db, kunstenaarnr: string | null): Promise<number>`.
- Produces: `berekenPrijzenVoorCombinaties(db, kunstenaarnr: string | null, materiaalIds, maatIds)`.
- Produces: `berekenBestellijnPrijs(db, kunstwerk: { kunstenaarnr: string | null; maatIds: string[]; prijsPerM2: number | null }, line, klantId)`.
- Produces: `resolveOrderRight(kunstenaarnr: string | null, kunstenaars, klantId)`.
- Produces: `DELETE /api/kunstenaars/[id]` geeft `409 in-use` ook bij een gekoppelde klant.

- [ ] **Step 1: Schrijf de falende test**

Voeg toe aan `tests/app/api/kunstenaarnummer.test.ts`. De klantfixture heeft een wachtwoordhash nodig; kijk in `tests/app/api/klanten.test.ts` na hoe die daar gemaakt wordt en gebruik dezelfde `hashPassword`-import.

```ts
import { insertRow } from '@/lib/server/crud';
import { hashPassword } from '@/lib/server/password';
import { DELETE as deleteKunstenaar } from '@/app/api/kunstenaars/[id]/route';

const createdKlantEmails: string[] = [];

// In de bestaande afterEach, VÓÓR het opruimen van de kunstenaars (de klant verwijst
// ernaar, dus die moet eerst weg):
//   if (createdKlantEmails.length > 0) {
//     await getPool().query('DELETE FROM klanten WHERE email IN (?)', [createdKlantEmails]);
//     createdKlantEmails.length = 0;
//   }

function deleteRequest(cookie: string): Request {
  return new Request('http://localhost/api/kunstenaars/x', { method: 'DELETE', headers: { cookie } });
}

describe('kunstenaar verwijderen met een gekoppelde klant', () => {
  it('weigert verwijderen zolang een klant aan de kunstenaar gekoppeld is', async () => {
    const cookie = await medewerkerCookie();
    const kunstenaar = await maakViaApi('AUTOTEST Kunstenaar Met Klant', cookie);
    const email = 'autotest-kunstenaarnr-klant@example.com';
    await insertRow('klanten', {
      email,
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
      kunstenaarnr: kunstenaar.kunstenaarnr,
    } as never);
    createdKlantEmails.push(email);

    const geweigerd = await deleteKunstenaar(deleteRequest(cookie), { params: { id: kunstenaar.id } });
    expect(geweigerd.status).toBe(409);
    expect(await geweigerd.json()).toEqual({ error: 'in-use' });

    const [rows] = await getPool().query('SELECT 1 FROM kunstenaars WHERE id = ?', [kunstenaar.id]);
    expect((rows as unknown[]).length).toBe(1);
  });

  it('staat verwijderen toe zodra de koppeling weg is', async () => {
    const cookie = await medewerkerCookie();
    const kunstenaar = await maakViaApi('AUTOTEST Kunstenaar Zonder Klant', cookie);

    const response = await deleteKunstenaar(deleteRequest(cookie), { params: { id: kunstenaar.id } });
    expect(response.status).toBe(200);
    const [rows] = await getPool().query('SELECT 1 FROM kunstenaars WHERE id = ?', [kunstenaar.id]);
    expect((rows as unknown[]).length).toBe(0);
    createdKunstenaarIds.length = 0;
  });
});
```

- [ ] **Step 2: Draai de test om te zien dat hij faalt**

```bash
npx vitest run tests/app/api/kunstenaarnummer.test.ts -t "gekoppelde klant"
```

Verwacht: de eerste test FAIL met een 500 uit `insertRow` (`Onbekende kolom(men) voor tabel klanten: kunstenaarnr`); de tweede PASS al.

- [ ] **Step 3: Schrijf het migratiebestand**

`db/migrations/2026-08-10-kunstenaarnr-relaties.sql`:

```sql
-- Migratie voor het kunstenaarnummer (2026-08-10), deel 2 van 2.
-- Ontwerp: docs/superpowers/specs/2026-08-10-kunstenaarnummer-en-drukkernummer-design.md
--
-- Vervangt de twee verwijzingen naar een kunstenaar door het nummer uit deel 1.
-- Bewust vervangen en niet aanvullen: twee kolommen naast elkaar zijn twee
-- verwijzingen naar dezelfde rij die uit elkaar kunnen lopen.
--
-- Volgorde van uitrol: eerst migreren, dan deployen, dan herstarten. Tussen migratie
-- en herstart leest de nog draaiende versie kunstenaarId en is de collectiepagina
-- stuk. Dat venster is bewust geaccepteerd (ontwerp, beslissing 7): op 2026-08-10 had
-- staging 8 kunstenaars, 111 gekoppelde kunstwerken en 1 gekoppelde klant, en
-- productie nul van alles.
--
-- De constraintnamen kunstwerken_ibfk_1 en drukkerZendingen_ibfk_1 zijn de door
-- MariaDB gegenereerde namen van de naamloze FOREIGN KEY-regels in db/schema.sql,
-- nagekeken op staging op 2026-08-10. MariaDB weigert een kolom te droppen zolang er
-- een foreign key op ligt, dus die moet er eerst af.

-- kunstwerken: kunstenaarId -> kunstenaarnr. Blijft nullable: een kunstwerk hoeft
-- geen kunstenaar te hebben (op staging is er precies één zo'n rij).
ALTER TABLE kunstwerken ADD COLUMN kunstenaarnr VARCHAR(20) NULL AFTER kunstenaarId;

UPDATE kunstwerken w
JOIN kunstenaars k ON k.id = w.kunstenaarId
SET w.kunstenaarnr = k.kunstenaarnr;

ALTER TABLE kunstwerken DROP FOREIGN KEY kunstwerken_ibfk_1;
ALTER TABLE kunstwerken DROP COLUMN kunstenaarId;
ALTER TABLE kunstwerken ADD CONSTRAINT fk_kunstwerken_kunstenaarnr
  FOREIGN KEY (kunstenaarnr) REFERENCES kunstenaars (kunstenaarnr);

-- klanten: kunstenaarId -> kunstenaarnr. Hier stond alleen een unieke index en géén
-- foreign key; die komt er nu wel bij. Meerdere NULL's blijven toegestaan in een
-- UNIQUE-index, dus het gedrag voor niet-kunstenaar-klanten verandert niet.
ALTER TABLE klanten ADD COLUMN kunstenaarnr VARCHAR(20) NULL AFTER kunstenaarId;

UPDATE klanten kl
JOIN kunstenaars k ON k.id = kl.kunstenaarId
SET kl.kunstenaarnr = k.kunstenaarnr;

ALTER TABLE klanten DROP INDEX uniq_klanten_kunstenaarId;
ALTER TABLE klanten DROP COLUMN kunstenaarId;
ALTER TABLE klanten ADD UNIQUE KEY uniq_klanten_kunstenaarnr (kunstenaarnr);
ALTER TABLE klanten ADD CONSTRAINT fk_klanten_kunstenaarnr
  FOREIGN KEY (kunstenaarnr) REFERENCES kunstenaars (kunstenaarnr);
```

- [ ] **Step 4: Werk `db/schema.sql` en `tableColumns.ts` bij**

In `db/schema.sql`:

- `CREATE TABLE klanten`: vervang `kunstenaarId CHAR(36),` door `kunstenaarnr VARCHAR(20),` en `UNIQUE KEY uniq_klanten_kunstenaarId (kunstenaarId)` door:

  ```sql
    UNIQUE KEY uniq_klanten_kunstenaarnr (kunstenaarnr),
    FOREIGN KEY (kunstenaarnr) REFERENCES kunstenaars(kunstenaarnr)
  ```

- `CREATE TABLE kunstwerken`: vervang `kunstenaarId CHAR(36),` door `kunstenaarnr VARCHAR(20),` en `FOREIGN KEY (kunstenaarId) REFERENCES kunstenaars(id)` door `FOREIGN KEY (kunstenaarnr) REFERENCES kunstenaars(kunstenaarnr)`.

In `src/lib/server/tableColumns.ts`: in de `klanten`-lijst `'kunstenaarId',` → `'kunstenaarnr',`, en hetzelfde in de `kunstwerken`-lijst.

- [ ] **Step 5: Pas de migratie toe op staging**

```bash
npm run db:migrate -- staging
```

Verwacht: `2026-08-10-kunstenaarnr-relaties.sql (11 statements)`, alle elf `gelukt`. Faalt een `DROP FOREIGN KEY` met "check that column/key exists", kijk dan de echte constraintnaam na:

```bash
npx tsx -e "import('./scripts/lib/env').then(async(m)=>{const {connection,database}=await m.verbind('staging');const[r]=await connection.query('SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND REFERENCED_TABLE_NAME=\"kunstenaars\"',[database]);console.log(r);await connection.end();})"
```

- [ ] **Step 6: Zet de prijsmodule om**

In `src/lib/server/prijsmodule.ts`, vervang `prijsopslagVoorKunstenaar` (regel 25-30):

```ts
/**
 * kunstenaarAfspraken hangt op de UUID van de kunstenaar (id is daar tegelijk primary
 * key en foreign key), terwijl een kunstwerk het kunstenaarnr draagt -- vandaar de
 * join. Zie het ontwerp, beslissing 2.
 */
export async function prijsopslagVoorKunstenaar(
  db: Queryable,
  kunstenaarnr: string | null
): Promise<number> {
  if (!kunstenaarnr) return 0;
  const [rows] = await db.query(
    `SELECT a.prijsopslag
     FROM kunstenaarAfspraken a
     JOIN kunstenaars k ON k.id = a.id
     WHERE k.kunstenaarnr = ?`,
    [kunstenaarnr]
  );
  const row = (rows as Array<{ prijsopslag: string | null }>)[0];
  return row?.prijsopslag != null ? Number(row.prijsopslag) : 0;
}
```

In `berekenPrijzenVoorCombinaties` (regel 48-53): hernoem de parameter `kunstenaarId` naar `kunstenaarnr` en geef die door aan `prijsopslagVoorKunstenaar`.

In `berekenPrijzenVoorAlleKunstwerken` (regel 73-95):

```ts
  const [kunstwerkRows] = await db.query('SELECT id, kunstenaarnr, materiaalIds, maatIds FROM kunstwerken');
```

```ts
  const [afsprakenRows] = await db.query(
    `SELECT k.kunstenaarnr, a.prijsopslag
     FROM kunstenaarAfspraken a
     JOIN kunstenaars k ON k.id = a.id`
  );
  const opslagByKunstenaarnr = new Map<string, number>();
  for (const row of afsprakenRows as Array<{ kunstenaarnr: string; prijsopslag: string | null }>) {
    opslagByKunstenaarnr.set(row.kunstenaarnr, row.prijsopslag != null ? Number(row.prijsopslag) : 0);
  }
```

```ts
  for (const row of kunstwerkRows as Array<{
    id: string;
    kunstenaarnr: string | null;
    materiaalIds: string | string[] | null;
    maatIds: string | string[] | null;
  }>) {
```

```ts
    const opslag = row.kunstenaarnr ? opslagByKunstenaarnr.get(row.kunstenaarnr) ?? 0 : 0;
```

In `berekenBestellijnPrijs` (regel 112 en 140): `kunstwerk: { kunstenaarnr: string | null; … }` en `prijsopslagVoorKunstenaar(db, kunstwerk.kunstenaarnr)`.

- [ ] **Step 7: Zet de bestel-POST om**

In `src/app/api/bestelheaders/route.ts`, `checkOrderRight` (regel 35-57):

```ts
  const [kunstwerkRows] = await connection.query(
    'SELECT kunstenaarnr FROM kunstwerken WHERE id = ?',
    [kunstwerkId]
  );
  const kunstenaarnr = (kunstwerkRows as Array<{ kunstenaarnr: string | null }>)[0]?.kunstenaarnr;
  if (!kunstenaarnr) return true;

  const [kunstenaarRows] = await connection.query(
    'SELECT exclusieveKlantIds FROM kunstenaars WHERE kunstenaarnr = ?',
    [kunstenaarnr]
  );
```

In de prijslus (regel 97-108 en 145): `kunstenaarnr` in plaats van `kunstenaarId` in de `SELECT`, in het rijtype en in het object dat aan `berekenBestellijnPrijs` meegaat. Let op dat de `SELECT` ook `code` bevat (uit de kunstwerkcode-taak); die blijft staan.

- [ ] **Step 8: Zet de prijzen-route om**

In `src/app/api/kunstwerken/prijzen/route.ts` (regel 13-24): de queryparameter heet `kunstenaarnr`, de variabele ook, en die gaat door naar `berekenPrijzenVoorCombinaties`. Werk het commentaar over de staff-only ad-hoc modus mee bij zodat het naar `kunstenaarnr` verwijst.

- [ ] **Step 9: Zet de verwijdercontrole van kunstenaars om**

In `src/app/api/kunstenaars/[id]/route.ts`, vervang `DELETE` (regel 42-61):

```ts
export const DELETE = withApiErrorHandling(
  'DELETE /api/kunstenaars/[id]',
  async (request: Request, { params }: { params: { id: string } }) => {
    if (!(await requireMedewerker(request))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const bestaand = await getRow<{ kunstenaarnr: string }>('kunstenaars', params.id);
    // Geen rij: niets te doen, en de aanroeper krijgt hetzelfde antwoord als voorheen.
    if (!bestaand) return NextResponse.json({ ok: true });

    // KunstenaarsSection.tsx blokkeert dit ook al aan de clientkant, maar dat is een
    // UX-nicety: zonder deze twee controles zou een directe API-aanroep (of verouderde
    // schermstatus) op de foreign keys van kunstwerken en klanten stuklopen als
    // onafgevangen fout in plaats van een nette 409.
    const [kunstwerkRows] = await getPool().query(
      'SELECT 1 FROM kunstwerken WHERE kunstenaarnr = ? LIMIT 1',
      [bestaand.kunstenaarnr]
    );
    if ((kunstwerkRows as unknown[]).length > 0) {
      return NextResponse.json({ error: 'in-use' }, { status: 409 });
    }
    const [klantRows] = await getPool().query('SELECT 1 FROM klanten WHERE kunstenaarnr = ? LIMIT 1', [
      bestaand.kunstenaarnr,
    ]);
    if ((klantRows as unknown[]).length > 0) {
      return NextResponse.json({ error: 'in-use' }, { status: 409 });
    }

    await deleteRow('kunstenaars', params.id);
    return NextResponse.json({ ok: true });
  }
);
```

Voeg `getRow` toe aan de import uit `@/lib/server/crud`.

- [ ] **Step 10: Draai de nieuwe tests**

```bash
npx vitest run tests/app/api/kunstenaarnummer.test.ts
```

Verwacht: alle tests in dit bestand PASS.

- [ ] **Step 11: Zet de clientkant om**

Begin met de twee typen, draai daarna de typechecker en werk elke gemelde plek af:

- `src/components/beheer/materiaalTypes.ts:48` — `kunstenaarId: string | null;` → `kunstenaarnr: string | null;`
- `src/components/beheer/KlantenSection.tsx:34` — idem in het `Klant`-type.

```bash
npx tsc --noEmit
```

De verwachte plekken:

- `src/components/beheer/KlantModal.tsx` — state `kunstenaarId`/`setKunstenaarId` (regel 92) wordt `kunstenaarnr`/`setKunstenaarnr`; `setKunstenaarnr(klant.kunstenaarnr)` (regel 110); de dubbelkoppelingscontrole (regel 136) vergelijkt `other.kunstenaarnr === nextKunstenaarnr`; het gewijzigd-vergelijk (regel 172) en de update (regel 187) gaan op `kunstenaarnr`; de `Combobox` (regel 553-561) krijgt `options={(kunstenaars ?? []).map((kunstenaar) => ({ value: kunstenaar.kunstenaarnr, label: kunstenaar.naam }))}` en `value={kunstenaarnr}`. De `logActiviteit('klant_kunstenaarkoppeling_gewijzigd', …)`-regel blijft ongewijzigd.
- `src/components/beheer/KunstenaarsSection.tsx:81-86` —

  ```ts
  // De klant (indien aanwezig) wiens kunstenaarnr naar déze kunstenaar wijst -- gebruikt
  // om de "bij 2 klanten moet 1 de kunstenaar zelf zijn"-regel te valideren.
  function eigenKlantId(kunstenaarnr: string | null): string | null {
    if (kunstenaarnr === null) return null;
    return (klanten ?? []).find((klant) => klant.kunstenaarnr === kunstenaarnr)?.id ?? null;
  }
  ```

  Pas elke aanroep aan: die geeft nu `modalState.kunstenaar.kunstenaarnr` mee in plaats van het id.
- `src/components/beheer/KunstenaarsSection.tsx:314` — `const inUse = kunstwerken.some((kunstwerk) => kunstwerk.kunstenaarnr === modalState.kunstenaar.kunstenaarnr);` en direct daaronder dezelfde controle voor klanten:

  ```ts
    // Spiegelt de servercontrole in DELETE /api/kunstenaars/[id]. Nog niet geladen
    // klanten mogen niet als "geen koppeling" gelezen worden.
    if (klanten === null) {
      setActionError(t('kunstenaarsVerwijderOnbekend'));
      return;
    }
    if (klanten.some((klant) => klant.kunstenaarnr === modalState.kunstenaar.kunstenaarnr)) {
      setActionError(t('kunstenaarsVerwijderBlockedKlant'));
      return;
    }
  ```

- `src/components/beheer/KunstwerkenSection.tsx` — `LEGE_FORM.kunstenaarId` (regel 48), de state (regel 86), het meesturen naar de prijzen-route (regel 243, queryparameter wordt `kunstenaarnr`), de dependency-array (regel 266), `buildKunstwerkData` (regel 272), de preview-deps (regel 297), `kunstenaarNaamById` (regel 357 — de map wordt op `kunstenaarnr` gebouwd), `resetForm` (regel 363), `openEdit` (regel 401) en de `<select>`-optiewaarden (regel 722, `value={kunstenaar.kunstenaarnr}`). Allemaal omnoemingen.
- `src/components/ProductModal.tsx:140,167-168` — `resolveOrderRight(kunstwerk.kunstenaarnr, …)` en het opzoeken van de artiestnaam via `kunstenaar.kunstenaarnr === kunstwerk.kunstenaarnr`.
- `src/components/ProductsGrid.tsx:107` — `kunstwerk.kunstenaarnr === kunstenaarFilter`.
- `src/components/FiltersPanelContent.tsx:25` — parameternaam `kunstenaarnr`; de filterwaarde is vanaf nu een nummer.
- `src/components/CartPanel.tsx:68` — `resolveOrderRight(kunstwerk.kunstenaarnr, …)`.
- `src/lib/resolveOrderRight.ts:25-35` — parameter `kunstenaarnr`, en het opzoeken wordt `kunstenaars.find((item) => item.kunstenaarnr === kunstenaarnr)`. Werk de twee commentaarblokken (regel 15-16 en 30-32) mee bij; de fail-closed-logica zelf blijft exact zoals hij is.
- `src/lib/server/klantFields.ts:3` — alleen het commentaar: `kunstenaarId` → `kunstenaarnr`. De lijst `SELF_EDITABLE_KLANT_FIELDS` bevatte het veld niet en krijgt het niet.

- [ ] **Step 12: Werk de resterende testfixtures bij**

Twee tests in `tests/app/api/klanten.test.ts` gebruiken een verzonnen id (`'kunstenaar-1'`, `'kunstenaar-dubbel'`) omdat er tot nu toe geen foreign key was. Met de nieuwe FK moet daar een echte kunstenaar staan. Maak in beide tests eerst een kunstenaar aan, ruim hem op in de bestaande `afterEach`-structuur van dat bestand, en gebruik zijn nummer:

```ts
    const kunstenaar = await insertRow<{ id: string }>('kunstenaars', {
      naam: 'AUTOTEST Klanten FK',
      kunstenaarnr: 'AT-K-KL-1',
      exclusieveKlantIds: [],
    } as never, ['exclusieveKlantIds']);
    // id opnemen in de opruimlijst van dit bestand, ná de klanten (die verwijzen ernaar).
```

Vervang daarna in dat bestand `kunstenaarId: 'kunstenaar-1'` door `kunstenaarnr: 'AT-K-KL-1'`, en in de dubbelkoppelingstest `'kunstenaar-dubbel'` door een tweede fixture met `AT-K-KL-2`. Werk het commentaar op regel 254-255 bij: er ís nu een foreign key, dus een kaal literal-id kan niet meer.

In `tests/app/api/klanten-me.test.ts:80` wordt `kunstenaarId: 'kunstenaar-1'` in een zelfbewerk-body meegestuurd om te bewijzen dat hij genegeerd wordt. Vervang dat door `kunstenaarnr: 'KU-99999'` — de assertie (het veld verandert niet) blijft dezelfde.

Werk daarna alle componenttests bij die `tsc` aanwijst: `kunstenaarId:` → `kunstenaarnr:` in elke `Kunstwerk`-, `Klant`- en `Kunstenaar`-fixture. Waar een fixture een kunstenaar-UUID als waarde gebruikte, zet er een nummer neer (`'KU-00001'`) zodat de fixture leesbaar blijft.

- [ ] **Step 13: Draai de volledige suite**

```bash
npx tsc --noEmit
npm test
```

Verwacht: `tsc` exit 0, alle tests PASS.

```bash
npm run test:regression
```

Verwacht: PASS. Deze suite raakt de kunstenaar-exclusiviteit en de prijsopbouw met kunstenaarsopslag, dus hij is hier de echte controle op stap 6 en 7.

- [ ] **Step 14: Commit**

```bash
git add db/migrations/2026-08-10-kunstenaarnr-relaties.sql db/schema.sql src/lib src/app/api src/components tests
git commit -m "feat: kunstwerken en klanten verwijzen naar een kunstenaar via kunstenaarnr"
```

---

### Task 3: Kunstenaarnr zichtbaar in beheer

**Files:**
- Modify: `src/components/beheer/KunstenaarsSection.tsx:335-338,360-369`
- Modify: `messages/nl.json` (beheer-blok)
- Test: `tests/components/beheer/KunstenaarsSection.test.tsx`

**Interfaces:**
- Consumes: `Kunstenaar.kunstenaarnr` uit taak 1.
- Produces: vertaalsleutels `kunstenaarsColKunstenaarnr` en `kunstenaarsVerwijderBlockedKlant`.
- Produces: `data-testid="kunstenaar-modal-kunstenaarnr"`.

- [ ] **Step 1: Schrijf de falende test**

Voeg toe aan `tests/components/beheer/KunstenaarsSection.test.tsx`. Dat bestand heeft al een `KUNSTENAARS`-fixture (regel 132, eerste kunstenaar heet `Sabrina Glasser`) en een `renderSection()`-helper (regel 145). Zet in `KUNSTENAARS[0]` `kunstenaarnr: 'KU-00007'` (taak 2 heeft dit veld daar al toegevoegd om `tsc` groen te krijgen; controleer de waarde en maak er `KU-00007` van).

```tsx
  it('toont het kunstenaarnr in de lijst', async () => {
    renderSection();
    expect(await screen.findByText('KU-00007')).toBeInTheDocument();
  });

  it('toont het kunstenaarnr als subtitel bij het bewerken', async () => {
    renderSection();
    fireEvent.click(await screen.findByText('Sabrina Glasser'));
    expect(await screen.findByTestId('kunstenaar-modal-kunstenaarnr')).toHaveTextContent('KU-00007');
  });
```

Dit bestand gebruikt `fireEvent`, niet `userEvent` — houd dat aan.

- [ ] **Step 2: Draai de tests om te zien dat ze falen**

```bash
npx vitest run tests/components/beheer/KunstenaarsSection.test.tsx -t "kunstenaarnr"
```

Verwacht: beide FAIL — de tekst en de testid bestaan niet.

- [ ] **Step 3: Voeg de kolom toe**

In `src/components/beheer/KunstenaarsSection.tsx` (regel 335-338):

```tsx
  const columns: Column<KunstenaarRow>[] = [
    { key: 'kunstenaarnr', label: t('kunstenaarsColKunstenaarnr') },
    { key: 'naam', label: t('kunstenaarsColNaam') },
    { key: 'exclusiviteitLabel', label: t('kunstenaarsColKlant') },
  ];
```

- [ ] **Step 4: Voeg de subtitel toe**

In hetzelfde bestand, in de `<Modal>` (regel 360-369), direct onder de `title`-prop:

```tsx
        subtitle={
          modalState?.mode === 'edit' ? (
            <span data-testid="kunstenaar-modal-kunstenaarnr">{modalState.kunstenaar.kunstenaarnr}</span>
          ) : undefined
        }
```

Een nieuwe kunstenaar heeft nog geen nummer — dat komt pas uit de POST-respons — dus in `add`-modus blijft de subtitel weg. Zelfde vorm als `KlantModal.tsx:263`.

- [ ] **Step 5: Werk de vertalingen bij**

In `messages/nl.json`, in het `beheer`-blok, naast `kunstenaarsColNaam`:

```json
    "kunstenaarsColKunstenaarnr": "Kunstenaarnr.",
    "kunstenaarsVerwijderBlockedKlant": "Deze kunstenaar is aan een klant gekoppeld en kan niet verwijderd worden.",
```

`kunstenaarsVerwijderBlockedKlant` is de tekst die taak 2 stap 11 al aanroept.

- [ ] **Step 6: Draai de tests**

```bash
npx vitest run tests/components/beheer/KunstenaarsSection.test.tsx
npx tsc --noEmit
npm test
```

Verwacht: alle PASS, `tsc` exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/beheer/KunstenaarsSection.tsx messages/nl.json tests/components/beheer/KunstenaarsSection.test.tsx
git commit -m "feat: toon het kunstenaarnr in de beheerlijst en de modal"
```

---

### Task 4: `drukkers.drukkernr` en `drukkerZendingen` via drukkernr

De hele drukkerkant in één taak: de kolom, de uitgifte, de omgezette relatie en de routes eromheen.

**Files:**
- Create: `db/migrations/2026-08-10-drukkernummer.sql`
- Create: `tests/app/api/drukkernummer.test.ts`
- Modify: `db/schema.sql` (`drukkers`, `drukkerZendingen`, `counters`)
- Modify: `src/lib/server/tableColumns.ts` (`drukkers`, `drukkerZendingen`)
- Modify: `src/app/api/drukkers/route.ts:11-18`
- Modify: `src/app/api/drukkers/[id]/route.ts:17-47`
- Modify: `src/app/api/drukkers/[id]/zendingen/route.ts`
- Modify: `src/app/api/drukkerzendingen/route.ts:27-34`
- Modify: `src/lib/zendingGenoten.ts:5,32,39`
- Modify: `src/components/beheer/materiaalTypes.ts` (`Drukker`)
- Test: `tests/app/api/drukkers.test.ts:75,96,102,119,125,138`
- Test: `tests/app/api/drukkerZendingen.test.ts:25,34`
- Test: `tests/app/api/drukkerzendingen-lookup.test.ts:23`
- Test: `tests/app/api/drukkers/zendingen-nummer.test.ts:26,35`
- Test: `tests/app/api/mail.test.ts:103,134`
- Test: `tests/regression/staging-scenarios.test.ts:417,422,689,1184`
- Test: `tests/lib/zendingGenoten.test.ts`, `tests/lib/useDrukkerZendingen.test.ts`
- Test: `tests/components/beheer/DrukkersSection.test.tsx:19`, `tests/components/beheer/DrukkerModal.test.tsx:22`, `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx` — `Drukker`-fixtures die `tsc` aanwijst zodra `drukkernr` verplicht wordt; geef ze `DR-00003` en oplopend

**Interfaces:**
- Consumes: `CounterNaam` bevat `'drukkernummer'` (taak 1) en `insertRow(…, connection?)` (taak 1).
- Produces: kolom `drukkers.drukkernr VARCHAR(20) NOT NULL` met `uniek_drukkernr`, en `counters`-rij `drukkernummer`.
- Produces: kolom `drukkerZendingen.drukkernr VARCHAR(20) NOT NULL` met FK naar `drukkers(drukkernr)`, zónder cascade; `drukkerId` bestaat niet meer.
- Produces: `Drukker.drukkernr: string` — gebruikt door taak 5.
- Produces: `Zending.drukkernr: string` (was `drukkerId`).
- Produces: `POST /api/drukkers/[id]/zendingen` geeft `404 drukker-not-found` bij een onbekende drukker.

- [ ] **Step 1: Schrijf de falende test**

Nieuw bestand `tests/app/api/drukkernummer.test.ts`:

```ts
import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { POST as createDrukker } from '@/app/api/drukkers/route';
import { PATCH as patchDrukker } from '@/app/api/drukkers/[id]/route';
import { POST as createZending } from '@/app/api/drukkers/[id]/zendingen/route';

const createdDrukkerIds: string[] = [];

afterEach(async () => {
  await getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'staff-1'");
  if (createdDrukkerIds.length > 0) {
    // Zendingen verwijzen naar de drukker en cascaderen niet meer; eerst die weg.
    await getPool().query(
      'DELETE z FROM drukkerZendingen z JOIN drukkers d ON d.drukkernr = z.drukkernr WHERE d.id IN (?)',
      [createdDrukkerIds]
    );
    await getPool().query('DELETE FROM drukkers WHERE id IN (?)', [createdDrukkerIds]);
    createdDrukkerIds.length = 0;
  }
});

async function medewerkerCookie(): Promise<string> {
  const sessionId = await createSession('medewerker', 'staff-1');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

function jsonRequest(method: string, body: unknown, cookie: string): Request {
  return new Request('http://localhost/api/drukkers', {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

async function maakViaApi(naam: string, cookie: string, extra: Record<string, unknown> = {}) {
  const response = await createDrukker(jsonRequest('POST', { naam, email: 'autotest@example.com', ...extra }, cookie));
  expect(response.status).toBe(201);
  const created = (await response.json()) as { id: string; drukkernr: string };
  createdDrukkerIds.push(created.id);
  return created;
}

describe('drukkernr', () => {
  it('kent bij het aanmaken een oplopend DR-nummer toe', async () => {
    const cookie = await medewerkerCookie();
    const eerste = await maakViaApi('AUTOTEST Drukker Een', cookie);
    const tweede = await maakViaApi('AUTOTEST Drukker Twee', cookie);

    expect(eerste.drukkernr).toMatch(/^DR-\d{5}$/);
    expect(Number(tweede.drukkernr.slice(3))).toBe(Number(eerste.drukkernr.slice(3)) + 1);
  });

  it('negeert een drukkernr uit de request-body', async () => {
    const cookie = await medewerkerCookie();
    const created = await maakViaApi('AUTOTEST Drukker Verzonnen', cookie, { drukkernr: 'DR-99999' });
    expect(created.drukkernr).not.toBe('DR-99999');

    const response = await patchDrukker(jsonRequest('PATCH', { drukkernr: 'DR-99998' }, cookie), {
      params: { id: created.id },
    });
    expect(response.status).toBe(200);
    const [rows] = await getPool().query('SELECT drukkernr FROM drukkers WHERE id = ?', [created.id]);
    expect((rows as Array<{ drukkernr: string }>)[0].drukkernr).toBe(created.drukkernr);
  });

  it('slaat een zending op met het drukkernr van de drukker', async () => {
    const cookie = await medewerkerCookie();
    const drukker = await maakViaApi('AUTOTEST Drukker Zending', cookie);

    const response = await createZending(
      jsonRequest('POST', { onderwerp: 'AUTOTEST', body: 'x', bestellingIds: [], aantalKlanten: 1, aantalRegels: 1 }, cookie),
      { params: { id: drukker.id } }
    );
    expect(response.status).toBe(201);
    const zending = (await response.json()) as { id: string; drukkernr: string };
    expect(zending.drukkernr).toBe(drukker.drukkernr);
  });

  it('geeft 404 als er een zending voor een onbekende drukker gepost wordt', async () => {
    const cookie = await medewerkerCookie();
    const response = await createZending(
      jsonRequest('POST', { onderwerp: 'AUTOTEST', body: 'x', bestellingIds: [] }, cookie),
      { params: { id: 'bestaat-niet' } }
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'drukker-not-found' });
  });
});
```

- [ ] **Step 2: Draai de test om te zien dat hij faalt**

```bash
npx vitest run tests/app/api/drukkernummer.test.ts
```

Verwacht: alle vier FAIL — `Onbekende kolom(men) voor tabel drukkers: drukkernr`, respectievelijk een 201 in plaats van 404 bij de laatste.

- [ ] **Step 3: Schrijf het migratiebestand**

`db/migrations/2026-08-10-drukkernummer.sql`:

```sql
-- Migratie voor het drukkernummer (2026-08-10).
-- Ontwerp: docs/superpowers/specs/2026-08-10-kunstenaarnummer-en-drukkernummer-design.md
--
-- Zelfde vorm als het kunstenaarnummer, maar in één bestand: de drukkerkant heeft
-- maar één verwijzende kolom en op 2026-08-10 twee drukkers en twee zendingen.
--
-- Volgorde van uitrol: eerst migreren, dan deployen, dan herstarten.
--
-- drukkerZendingen.drukkerId was ON DELETE CASCADE. De nieuwe foreign key is dat
-- bewust NIET (ontwerp, beslissing 6): het verwijderen van een drukker mag de
-- verzendhistorie niet meenemen. Tot nu toe was de API-controle in
-- DELETE /api/drukkers/[id] het enige dat dat tegenhield.
ALTER TABLE drukkers ADD COLUMN drukkernr VARCHAR(20) AFTER id;

CREATE TEMPORARY TABLE drukkernr_backfill AS
SELECT id, ROW_NUMBER() OVER (ORDER BY naam, id) AS rn FROM drukkers;

UPDATE drukkers d
JOIN drukkernr_backfill b ON b.id = d.id
SET d.drukkernr = CONCAT('DR-', LPAD(b.rn, 5, '0'));

DROP TEMPORARY TABLE drukkernr_backfill;

ALTER TABLE drukkers MODIFY drukkernr VARCHAR(20) NOT NULL;
ALTER TABLE drukkers ADD UNIQUE KEY uniek_drukkernr (drukkernr);

INSERT INTO counters (id, value) VALUES ('drukkernummer', (SELECT COUNT(*) FROM drukkers));

-- drukkerZendingen: drukkerId -> drukkernr. NOT NULL, want een zending zonder drukker
-- bestaat niet. De MODIFY faalt hard als de backfill een zending zonder bestaande
-- drukker overlaat -- gewenst: dan moet daar met de hand naar gekeken worden.
ALTER TABLE drukkerZendingen ADD COLUMN drukkernr VARCHAR(20) NULL AFTER drukkerId;

UPDATE drukkerZendingen z
JOIN drukkers d ON d.id = z.drukkerId
SET z.drukkernr = d.drukkernr;

ALTER TABLE drukkerZendingen DROP FOREIGN KEY drukkerZendingen_ibfk_1;
ALTER TABLE drukkerZendingen DROP COLUMN drukkerId;
ALTER TABLE drukkerZendingen MODIFY drukkernr VARCHAR(20) NOT NULL;
ALTER TABLE drukkerZendingen ADD CONSTRAINT fk_drukkerzendingen_drukkernr
  FOREIGN KEY (drukkernr) REFERENCES drukkers (drukkernr);
```

- [ ] **Step 4: Werk `db/schema.sql` en `tableColumns.ts` bij**

In `db/schema.sql`:

- `CREATE TABLE drukkers`: `drukkernr VARCHAR(20) NOT NULL,` direct onder `id`, en `UNIQUE KEY uniek_drukkernr (drukkernr)` vóór de sluitende `)`.
- `CREATE TABLE drukkerZendingen`: `drukkerId CHAR(36) NOT NULL,` → `drukkernr VARCHAR(20) NOT NULL,` en de `FOREIGN KEY`-regel → `FOREIGN KEY (drukkernr) REFERENCES drukkers(drukkernr)` (zonder `ON DELETE CASCADE`).
- Bij de `counters`-regels: `INSERT INTO counters (id, value) VALUES ('drukkernummer', 0);`

In `src/lib/server/tableColumns.ts`: `'drukkernr',` toevoegen aan `drukkers` (direct na `'id'`), en in `drukkerZendingen` `'drukkerId',` → `'drukkernr',`.

- [ ] **Step 5: Pas de migratie toe op staging**

```bash
npm run db:migrate -- staging
```

Verwacht: `2026-08-10-drukkernummer.sql (13 statements)`, alle dertien `gelukt`.

- [ ] **Step 6: Laat `POST /api/drukkers` een nummer uitgeven**

In `src/app/api/drukkers/route.ts`, vervang `POST` (regel 11-18):

```ts
import { volgendNummer } from '@/lib/server/counters';
```

```ts
export const POST = withMedewerker('POST /api/drukkers', async (request: Request) => {
  // Het nummer is server-eigendom: een drukkernr uit de body wordt weggegooid.
  const { drukkernr: _genegeerd, ...data } = (await request.json()) as Record<string, unknown>;
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    // De standaard-reset zat hiervoor búiten een transactie: een mislukte insert liet
    // dan een leeggemaakte standaardvlag achter. Nu rollen ze samen terug.
    if (data.standaard) {
      await connection.query('UPDATE drukkers SET standaard = FALSE WHERE standaard = TRUE');
    }
    const drukkernr = await volgendNummer(connection, 'drukkernummer', 'DR-');
    const created = await insertRow('drukkers', { ...data, drukkernr }, [], connection);
    await connection.commit();
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});
```

- [ ] **Step 7: Werk `PATCH` en `DELETE` op `/api/drukkers/[id]` bij**

In `src/app/api/drukkers/[id]/route.ts`:

```ts
export const PATCH = withMedewerker<Context>(
  'PATCH /api/drukkers/[id]',
  async (request, { params }) => {
    // Zie POST: het nummer is server-eigendom en ligt na uitgifte vast.
    const { drukkernr: _genegeerd, ...data } = (await request.json()) as Record<string, unknown>;
    if (data.standaard) {
      await getPool().query('UPDATE drukkers SET standaard = FALSE WHERE standaard = TRUE AND id != ?', [
        params.id,
      ]);
    }
    await updateRow('drukkers', params.id, data);
    return NextResponse.json({ ok: true });
  }
);

export const DELETE = withMedewerker<Context>(
  'DELETE /api/drukkers/[id]',
  async (_request, { params }) => {
    const bestaand = await getRow<{ drukkernr: string }>('drukkers', params.id);
    if (!bestaand) return NextResponse.json({ ok: true });
    // De foreign key van drukkerZendingen weigert dit sinds de drukkernummer-migratie
    // (geen cascade meer). Deze controle maakt er een nette 409 van in plaats van een
    // onafgevangen FK-fout. DrukkerModal.tsx blokkeert het ook al client-side.
    const [rows] = await getPool().query('SELECT 1 FROM drukkerZendingen WHERE drukkernr = ? LIMIT 1', [
      bestaand.drukkernr,
    ]);
    if ((rows as unknown[]).length > 0) {
      return NextResponse.json({ error: 'in-use' }, { status: 409 });
    }
    await deleteRow('drukkers', params.id);
    return NextResponse.json({ ok: true });
  }
);
```

- [ ] **Step 8: Zet de zendingenroutes om**

`src/app/api/drukkers/[id]/zendingen/route.ts` — de `[id]` in de URL blijft de drukker-UUID, zodat `DrukkerModal`, `VersturenNaarDrukkerDialog` en `useDrukkerZendingen` niets merken:

```ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { getRow, insertRow, parseJsonKolom } from '@/lib/server/crud';
import { withMedewerker } from '@/lib/server/apiRoute';

type Context = { params: { id: string } };

export const GET = withMedewerker<Context>(
  'GET /api/drukkers/[id]/zendingen',
  async (_request, { params }) => {
    const [rows] = await getPool().query(
      `SELECT z.* FROM drukkerZendingen z
       JOIN drukkers d ON d.drukkernr = z.drukkernr
       WHERE d.id = ?
       ORDER BY z.verzondenOp DESC`,
      [params.id]
    );
    const parsed = (rows as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      bestellingIds: parseJsonKolom<string[]>(row.bestellingIds, []),
    }));
    return NextResponse.json(parsed);
  }
);

export const POST = withMedewerker<Context>(
  'POST /api/drukkers/[id]/zendingen',
  async (request, { params }) => {
    // Het nummer wordt hier opgezocht in plaats van uit de body gehaald: een client kan
    // zo geen zending onder een andere drukker hangen. Een onbekende drukker levert een
    // nette 404 op in plaats van een onafgevangen foreign-key-fout.
    const drukker = await getRow<{ drukkernr: string }>('drukkers', params.id);
    if (!drukker) return NextResponse.json({ error: 'drukker-not-found' }, { status: 404 });
    const data = await request.json();
    const created = await insertRow('drukkerZendingen', { drukkernr: drukker.drukkernr, ...data }, [
      'bestellingIds',
    ]);
    return NextResponse.json(created, { status: 201 });
  }
);
```

`src/app/api/drukkerzendingen/route.ts` (regel 27-34):

```ts
  const [rows] = await getPool().query(
    `SELECT z.id, z.drukkernr, z.verzondenOp, z.bestellingIds, d.naam AS drukkerNaam
     FROM drukkerZendingen z
     JOIN drukkers d ON d.drukkernr = z.drukkernr
     WHERE ${where}
     ORDER BY z.verzondenOp DESC`,
    ids
  );
```

- [ ] **Step 9: Werk de clienttypen bij**

- `src/components/beheer/materiaalTypes.ts`, `interface Drukker`: `drukkernr: string;` toevoegen onder `id`.
- `src/lib/zendingGenoten.ts:5` — `drukkerId: string;` → `drukkernr: string;` in `interface Zending`; hetzelfde in het inline responsetype (regel 32) en in de mapping (regel 39: `drukkernr: row.drukkernr,`).
- `src/lib/useDrukkerZendingen.ts` — `DrukkerZending` bevat het veld niet en hoeft niet te veranderen; controleer met `tsc` of het inline responsetype (regel 34 e.v.) een `drukkerId` noemt en haal die dan weg.

```bash
npx tsc --noEmit
```

Werk elke gemelde plek af.

- [ ] **Step 10: Werk de testfixtures bij**

Voeg aan elke rechtstreekse drukkerfixture een uniek nummer toe (`tsc` ziet deze niet):

- `tests/app/api/drukkers.test.ts:75,96,102,119` → `drukkernr: 'AT-D-DRK-1'` t/m `'AT-D-DRK-4'`
- `tests/app/api/drukkerZendingen.test.ts:25,34` → `AT-D-DZ-1`, `AT-D-DZ-2`
- `tests/app/api/drukkerzendingen-lookup.test.ts:23` → `AT-D-DZL-1`
- `tests/app/api/drukkers/zendingen-nummer.test.ts:26,35` → `AT-D-ZN-1`, `AT-D-ZN-2`
- `tests/app/api/mail.test.ts:103,134` → `AT-D-MAIL-1`, `AT-D-MAIL-2`
- `tests/regression/staging-scenarios.test.ts:417,422,689,1184` → `AT-D-REG-1` t/m `AT-D-REG-4`

Elke test die rechtstreeks `INSERT INTO drukkerZendingen (… drukkerId …)` doet — onder andere `tests/app/api/drukkers.test.ts:125` — schrijft nu `drukkernr` en geeft het nummer van de fixture mee. De opruimregel op `tests/app/api/drukkers.test.ts:138` (`DELETE FROM drukkerZendingen WHERE drukkerId = ?`) wordt `WHERE drukkernr = ?`.

**Let op de opruimvolgorde.** `drukkerZendingen` cascadeert niet meer, dus elke `afterEach` die drukkers opruimt moet eerst de bijbehorende zendingen weghalen. In bestanden die zendingen aanmaken: voeg vóór de `DELETE FROM drukkers`-regel toe:

```ts
    await getPool().query(
      'DELETE z FROM drukkerZendingen z JOIN drukkers d ON d.drukkernr = z.drukkernr WHERE d.id IN (?)',
      [createdDrukkerIds]
    );
```

Werk in `tests/app/api/drukkers.test.ts:136-137` het commentaar bij: de cascade bestaat niet meer, het handmatig weghalen van de zending is nu wat de foreign key vereist.

- [ ] **Step 11: Draai de volledige suite**

```bash
npx vitest run tests/app/api/drukkernummer.test.ts
npx tsc --noEmit
npm test
npm run test:regression
```

Verwacht: alles PASS, `tsc` exit 0. De regressiesuite dekt het versturen naar een niet-standaard drukker en is hier de controle op stap 8.

- [ ] **Step 12: Commit**

```bash
git add db/migrations/2026-08-10-drukkernummer.sql db/schema.sql src/lib src/app/api src/components tests
git commit -m "feat: drukkers krijgen een uniek drukkernr en zendingen verwijzen daarmee"
```

---

### Task 5: Drukkernr zichtbaar in beheer

**Files:**
- Modify: `src/components/beheer/DrukkersSection.tsx:45-65`
- Modify: `src/components/beheer/DrukkerModal.tsx:161-165`
- Modify: `messages/nl.json` (beheer-blok)
- Test: `tests/components/beheer/DrukkersSection.test.tsx` (fixture `DRUKKERS`, regel 19; helper `renderSection`, regel 31)
- Test: `tests/components/beheer/DrukkerModal.test.tsx` (fixture `DRUKKER`, regel 22; helper `renderModal`, regel 32)

**Interfaces:**
- Consumes: `Drukker.drukkernr` uit taak 4.
- Produces: vertaalsleutel `drukkersColDrukkernr`.
- Produces: `data-testid="drukker-modal-drukkernr"`.

- [ ] **Step 1: Schrijf de falende test**

Zet in beide bestanden het nummer van de fixture op `DR-00003` (taak 4 heeft `drukkernr` daar al toegevoegd om `tsc` groen te krijgen).

In `tests/components/beheer/DrukkersSection.test.tsx`, binnen `describe('DrukkersSection')`:

```tsx
  it('toont het drukkernr in de lijst', async () => {
    renderSection();
    expect(await screen.findByText('DR-00003')).toBeInTheDocument();
  });
```

In `tests/components/beheer/DrukkerModal.test.tsx`:

```tsx
  it('toont het drukkernr als subtitel bij het bewerken', async () => {
    renderModal({ mode: 'edit', drukker: DRUKKER });
    expect(await screen.findByTestId('drukker-modal-drukkernr')).toHaveTextContent('DR-00003');
  });

  it('toont geen drukkernr-subtitel bij het toevoegen', () => {
    renderModal({ mode: 'add' });
    expect(screen.queryByTestId('drukker-modal-drukkernr')).toBeNull();
  });
```

Beide bestanden gebruiken `fireEvent`, niet `userEvent` — houd dat aan als je nog een klik nodig hebt.

- [ ] **Step 2: Draai de tests om te zien dat ze falen**

```bash
npx vitest run tests/components/beheer -t "drukkernr"
```

Verwacht: beide FAIL.

- [ ] **Step 3: Voeg de kolom toe**

In `src/components/beheer/DrukkersSection.tsx`, vóór de `naam`-kolom in `const columns`:

```tsx
    { key: 'drukkernr', label: t('drukkersColDrukkernr') },
```

- [ ] **Step 4: Voeg de subtitel toe**

In `src/components/beheer/DrukkerModal.tsx`, in de `<Modal>` (regel 161-165), direct onder `title={t('drukkersModalTitel')}`:

```tsx
      subtitle={
        state?.mode === 'edit' ? (
          <span data-testid="drukker-modal-drukkernr">{state.drukker.drukkernr}</span>
        ) : undefined
      }
```

- [ ] **Step 5: Werk de vertalingen bij**

In `messages/nl.json`, in het `beheer`-blok, naast `drukkersColNaam`:

```json
    "drukkersColDrukkernr": "Drukkernr.",
```

- [ ] **Step 6: Draai de tests**

```bash
npx vitest run tests/components/beheer
npx tsc --noEmit
npm test
```

Verwacht: alle PASS, `tsc` exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/beheer/DrukkersSection.tsx src/components/beheer/DrukkerModal.tsx messages/nl.json tests/components/beheer
git commit -m "feat: toon het drukkernr in de beheerlijst en de modal"
```

---

### Task 6: Uitrol naar staging en productie

Geen code. Deze taak is de reden dat de migraties bestaan en hoort in het plan omdat hij fout kan gaan.

**Files:** geen.

**Interfaces:**
- Consumes: alles uit taak 1 t/m 5, gecommit op `master`.

- [ ] **Step 1: Controleer dat staging alle drie de migraties heeft**

```bash
npm run db:status -- staging
```

Verwacht: geen openstaande migraties. Zo niet: `npm run db:migrate -- staging` en daarna opnieuw controleren.

- [ ] **Step 2: Deploy naar staging**

Dispatch `deploy-naar-staging.yml` tegen `master`. Wacht tot de run groen is; hij zet een `vN`-tag.

- [ ] **Step 3: Herstart de staging-app**

Klik in DirectAdmin op **RESTART** voor de staging Node.js-app. Alleen als `package.json`/`package-lock.json` gewijzigd zijn ook eerst **Run NPM Install** — bij dit plan is dat niet het geval. Een groene workflow betekent niet dat de nieuwe build live is.

- [ ] **Step 4: Controleer op staging**

Loop deze lijst af in de beheeromgeving:

1. Kunstenaar aanmaken → er verschijnt een `KU-`-nummer in de lijst en als subtitel in de modal.
2. Die kunstenaar aan een klant koppelen via de klantmodal.
3. Een kunstwerk aan die kunstenaar hangen.
4. Als die klant een bestelling plaatsen bij een kunstenaar met exclusiviteit → toegestaan; als een andere klant → geblokkeerd.
5. Prijsopslag van de kunstenaar nakijken in de prijsopbouw van een bestelregel.
6. Drukker aanmaken → `DR-`-nummer zichtbaar.
7. Een bestelling naar die drukker versturen en daarna de zendinghistorie in de drukkermodal openen.
8. Proberen de kunstenaar te verwijderen (moet geweigerd worden: kunstwerk én klant) en de drukker (geweigerd: zending).

- [ ] **Step 5: Vraag toestemming voor de productiedatabase**

Vraag het expliciet, in deze woorden of vergelijkbaar: "Mag ik de drie migraties (`kunstenaarnummer`, `kunstenaarnr-relaties`, `drukkernummer`) op de productiedatabase toepassen?" Wacht op een duidelijk ja. Een eerdere goedkeuring telt niet.

Vermeld bij het vragen dat de productie-app op dat moment nog de oude code draait en tussen migratie en herstart `kunstenaarId`/`drukkerId` zou lezen — op productie staan 0 kunstenaars, 0 drukkers, 0 klanten en 0 kunstwerken, dus daar valt niets stuk te gaan.

- [ ] **Step 6: Migreer productie**

```bash
npm run db:migrate -- productie --confirm
```

Verwacht: drie bestanden toegepast, alle statements `gelukt`.

- [ ] **Step 7: Promoveer naar productie**

Dispatch `deploy-naar-production.yml` tegen `master`, zonder `version`-invoer (dan promoveert hij de hoogste `vN`-tag — de versie die op staging stond). Klik daarna **RESTART** in DirectAdmin voor de productie-app.

- [ ] **Step 8: Controleer op productie**

Log in op de beheeromgeving, maak één kunstenaar en één drukker aan en controleer dat ze `KU-00001` en `DR-00001` krijgen. Verwijder ze daarna weer als het testrijen waren.
