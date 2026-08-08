# Klantnummer Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 08-08-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elke goedgekeurde klant krijgt automatisch een mens-leesbaar klantnummer `KL-00001`, zichtbaar in de klantentabel, de klantgegevens-modal, de mail naar de drukker en het klantaccount.

**Architecture:** Eén nieuwe `NULL`-bare kolom `klanten.klantnr` plus een `counters`-rij `klantnummer`, exact het patroon dat `bestelnummer` en `zendingnummer` al gebruiken. Het nummer wordt server-side toegekend in `PATCH /api/klanten/[id]` op het moment dat `status` naar `'Goedgekeurd'` gaat, binnen één transactie met `SELECT ... FOR UPDATE` zodat een tweede goedkeuring geen tweede nummer uitdeelt. Lezen vereist geen routewijziging: `listRows`/`getRow` doen `SELECT *`.

**Tech Stack:** Next.js 14 App Router, TypeScript, raw `mysql2` tegen MariaDB 11.8, `next-intl`, Vitest + Testing Library.

## Global Constraints

- Ontwerp: `docs/superpowers/specs/2026-08-08-klantnummer-design.md` — lees dit eerst.
- Formaat is exact `KL-` + `String(n).padStart(5, '0')`, dus `KL-00001`.
- Alleen klanten met status `'Goedgekeurd'` krijgen een nummer. `Beoordelen` en `Afgewezen` blijven leeg.
- **De tests draaien tegen de echte gedeelde staging-database.** Cleanup moet gescoped zijn op exact de rijen die de test zelf aanmaakt (per opgeslagen id, of via een `@example.com`-adres). Nooit een `DELETE FROM <tabel>` zonder `WHERE`.
- **`counters.klantnummer` mag nooit worden gereset** voor determinisme — bereken verwachte nummers relatief aan de actuele stand.
- `klantnr` mag nooit verplicht worden voor het versturen naar de drukker: het komt **niet** in `KLANT_ALGEMENE_VELDEN` in `src/lib/buildDrukkerMail.ts`.
- `klantnr` mag nooit door de klant zelf gezet worden: niet toevoegen aan `SELF_EDITABLE_KLANT_FIELDS` in `src/lib/server/klantFields.ts`.
- Beheer-vertalingen alleen in `messages/nl.json` (de `beheer`-namespace bestaat niet in `en`/`de`/`fr`). Account-vertalingen in alle vier de talen.
- Geen productie-migratie in dit plan. Die gebeurt apart, met expliciete toestemming, ná verificatie op staging.

---

### Task 1: Schema, migratie en backfill

**Files:**
- Create: `db/migrations/2026-08-08-klantnummer.sql`
- Modify: `db/schema.sql:2-29` (kolom in `klanten`), `db/schema.sql:184-185` (extra `INSERT INTO counters`)

**Interfaces:**
- Consumes: niets.
- Produces: kolom `klanten.klantnr VARCHAR(20) NULL` en rij `counters('klantnummer', N)` in de staging-database. Alle volgende taken gaan ervan uit dat beide bestaan — zonder deze taak falen de API-tests met `ER_BAD_FIELD_ERROR`.

- [ ] **Step 1: Schrijf het migratiebestand**

Maak `db/migrations/2026-08-08-klantnummer.sql`:

```sql
-- Migration for klantnummer (2026-08-08)
-- Run once against a database still on the pre-migration schema.
-- klantnr is nullable on purpose: only klanten with status 'Goedgekeurd' get a
-- number, so klanten still under review (or rejected) keep it NULL. There is no
-- UNIQUE index -- the counters row inside a transaction is the uniqueness
-- guarantee, and an index would add a second, partly overlapping source of
-- truth for all the NULL rows.
ALTER TABLE klanten ADD COLUMN klantnr VARCHAR(20);
INSERT INTO counters (id, value) VALUES ('klantnummer', 0);

-- Backfill: klanten that were already approved before this migration get a
-- number in createdAt order. Uses a temporary table rather than a session
-- variable (@n := @n + 1 does not guarantee assignment order) or a correlated
-- subquery on klanten itself (that is the table being updated).
CREATE TEMPORARY TABLE klantnr_backfill AS
SELECT id, ROW_NUMBER() OVER (ORDER BY createdAt) AS rn
FROM klanten
WHERE status = 'Goedgekeurd' AND klantnr IS NULL;

UPDATE klanten k
JOIN klantnr_backfill b ON b.id = k.id
SET k.klantnr = CONCAT('KL-', LPAD(b.rn, 5, '0'));

DROP TEMPORARY TABLE klantnr_backfill;

-- Counts every numbered klant, not just the rows just updated, so the counter
-- stays correct if this ever runs on a database that already has numbers.
UPDATE counters
SET value = (SELECT COUNT(*) FROM klanten WHERE klantnr IS NOT NULL)
WHERE id = 'klantnummer';
```

- [ ] **Step 2: Werk `db/schema.sql` bij**

In het `CREATE TABLE klanten`-blok, direct na de regel `minimaleAfname INT,` (regel 26):

```sql
  klantnr VARCHAR(20),
```

En onder de bestaande counters-inserts (na regel 185):

```sql
INSERT INTO counters (id, value) VALUES ('klantnummer', 0);
```

- [ ] **Step 3: Draai de migratie tegen staging**

Er is geen migratie-runner in dit project; migraties worden eenmalig met een los script gedraaid. Schrijf dit script in de scratchpad-map (niet in de repo) als `run-migration.mjs`:

```js
import mysql from 'file:///C:/Temp/Glassart%20and%20design/node_modules/mysql2/promise.js';
import { readFileSync } from 'fs';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const sql = readFileSync(process.argv[2], 'utf8');
const conn = await mysql.createConnection({
  host: env.DB_HOST,
  port: Number(env.DB_PORT || 3306),
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  multipleStatements: true,
});
await conn.query(sql);
const [klanten] = await conn.query(
  "SELECT klantnr, companyName, status FROM klanten ORDER BY createdAt"
);
console.log(klanten);
const [counter] = await conn.query("SELECT * FROM counters WHERE id = 'klantnummer'");
console.log(counter);
await conn.end();
```

Run: `node <scratchpad>/run-migration.mjs db/migrations/2026-08-08-klantnummer.sql`

Expected: de 6 bestaande staging-klanten krijgen `KL-00001` t/m `KL-00006` op volgorde van aanmaakdatum (`Okmoy BV` eerst, die is van 2026-07-30), en `counters.klantnummer` staat daarna op `6`.

- [ ] **Step 4: Commit**

```bash
git add db/schema.sql db/migrations/2026-08-08-klantnummer.sql
git commit -m "feat: voeg klantnr-kolom en klantnummer-teller toe"
```

---

### Task 2: Klantnummer toekennen bij goedkeuring

**Files:**
- Modify: `src/app/api/klanten/[id]/route.ts:10-23`
- Test: `tests/app/api/klanten.test.ts`

**Interfaces:**
- Consumes: kolom `klanten.klantnr` en tellerrij `klantnummer` uit Task 1.
- Produces: `PATCH /api/klanten/[id]` antwoordt `{ ok: true, klantnr: string }` wanneer de body `status: 'Goedgekeurd'` bevat (zowel bij een nieuw toegekend als bij een al bestaand nummer), en `{ ok: true }` in alle andere gevallen. Task 4 leest `klantnr` uit die respons.

- [ ] **Step 1: Schrijf de falende tests**

Voeg bovenaan `tests/app/api/klanten.test.ts`, direct onder `medewerkerCookie()`, deze helper toe:

```ts
// De klantnummer-teller wordt bewust nooit gereset (projectregel), dus verwachte
// nummers worden berekend ten opzichte van de actuele stand.
async function klantnummerStand(): Promise<number> {
  const [rows] = await getPool().query("SELECT value FROM counters WHERE id = 'klantnummer'");
  return (rows as Array<{ value: number }>)[0].value;
}

function verwachtKlantnr(stand: number): string {
  return `KL-${String(stand).padStart(5, '0')}`;
}
```

Voeg daarna binnen `describe('klanten admin routes', ...)` deze vier tests toe:

```ts
it('assigns a klantnummer when a klant is approved', async () => {
  const klant = await insertRow<{ id: string }>('klanten', {
    email: 'klantnr-nieuw@example.com',
    wachtwoordHash: await hashPassword('x'),
    companyName: 'Nummerbedrijf BV',
    status: 'Beoordelen',
  } as never);
  createdKlantIds.push(klant.id);

  const standVoor = await klantnummerStand();
  const response = await patchKlant(
    req('PATCH', { status: 'Goedgekeurd', prijsgroepId: 'pg-1' }, await medewerkerCookie()),
    { params: { id: klant.id } }
  );

  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.klantnr).toBe(verwachtKlantnr(standVoor + 1));

  const [rows] = await getPool().query('SELECT klantnr, status FROM klanten WHERE id = ?', [klant.id]);
  const rij = (rows as Array<{ klantnr: string; status: string }>)[0];
  expect(rij.klantnr).toBe(verwachtKlantnr(standVoor + 1));
  expect(rij.status).toBe('Goedgekeurd');
});

it('keeps the same klantnummer when a klant is approved twice', async () => {
  const klant = await insertRow<{ id: string }>('klanten', {
    email: 'klantnr-dubbel@example.com',
    wachtwoordHash: await hashPassword('x'),
    status: 'Beoordelen',
  } as never);
  createdKlantIds.push(klant.id);

  const eerste = await patchKlant(
    req('PATCH', { status: 'Goedgekeurd', prijsgroepId: 'pg-1' }, await medewerkerCookie()),
    { params: { id: klant.id } }
  );
  const eersteNr = (await eerste.json()).klantnr;

  const standNaEerste = await klantnummerStand();
  const tweede = await patchKlant(
    req('PATCH', { status: 'Goedgekeurd', prijsgroepId: 'pg-2' }, await medewerkerCookie()),
    { params: { id: klant.id } }
  );

  expect((await tweede.json()).klantnr).toBe(eersteNr);
  expect(await klantnummerStand()).toBe(standNaEerste);
});

it('does not assign a klantnummer on a plain field update', async () => {
  const klant = await insertRow<{ id: string }>('klanten', {
    email: 'klantnr-veld@example.com',
    wachtwoordHash: await hashPassword('x'),
    status: 'Beoordelen',
  } as never);
  createdKlantIds.push(klant.id);

  const standVoor = await klantnummerStand();
  const response = await patchKlant(
    req('PATCH', { phone: '0612345678' }, await medewerkerCookie()),
    { params: { id: klant.id } }
  );

  expect(await response.json()).toEqual({ ok: true });
  expect(await klantnummerStand()).toBe(standVoor);
  const [rows] = await getPool().query('SELECT klantnr FROM klanten WHERE id = ?', [klant.id]);
  expect((rows as Array<{ klantnr: string | null }>)[0].klantnr).toBeNull();
});

it('does not assign a klantnummer when a klant is rejected', async () => {
  const klant = await insertRow<{ id: string }>('klanten', {
    email: 'klantnr-afgewezen@example.com',
    wachtwoordHash: await hashPassword('x'),
    status: 'Beoordelen',
  } as never);
  createdKlantIds.push(klant.id);

  const standVoor = await klantnummerStand();
  await patchKlant(req('PATCH', { status: 'Afgewezen' }, await medewerkerCookie()), {
    params: { id: klant.id },
  });

  expect(await klantnummerStand()).toBe(standVoor);
  const [rows] = await getPool().query('SELECT klantnr FROM klanten WHERE id = ?', [klant.id]);
  expect((rows as Array<{ klantnr: string | null }>)[0].klantnr).toBeNull();
});
```

- [ ] **Step 2: Draai de tests en controleer dat ze falen**

Run: `npx vitest run tests/app/api/klanten.test.ts`
Expected: de vier nieuwe tests FALEN — `body.klantnr` is `undefined` (de route antwoordt nog altijd alleen `{ ok: true }`). De bestaande tests in dit bestand blijven slagen.

- [ ] **Step 3: Implementeer de toekenning**

Vervang de inhoud van `src/app/api/klanten/[id]/route.ts` tot en met de `PATCH`-export door:

```ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { updateRow, deleteRow } from '@/lib/server/crud';
import { requireMedewerker, requireKlant } from '@/lib/server/requireAuth';
import { withApiErrorHandling } from '@/lib/server/apiRoute';
import { checkBtwNummerUpdate } from '@/lib/server/btwNummerCheck';

const KLANTNR_PADDING = 5;

/**
 * Voert de update uit én kent, indien nodig, een klantnummer toe -- alles binnen
 * één transactie. `SELECT ... FOR UPDATE` vergrendelt de klantrij, zodat twee
 * gelijktijdige goedkeuringen (dubbelklik, twee medewerkers) niet allebei een
 * nummer uitdelen: wie al een nummer heeft, houdt het.
 *
 * Bewust niet via `updateRow()`: die draait op de pool en zou dus buiten deze
 * transactie vallen. De SQL hieronder is een kopie van `updateRow` zonder de
 * JSON-serialisatie -- `klanten` heeft geen JSON-kolommen.
 */
async function updateEnKenKlantnummerToe(
  id: string,
  data: Record<string, unknown>
): Promise<string | null> {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT klantnr FROM klanten WHERE id = ? FOR UPDATE', [id]);
    const rij = (rows as Array<{ klantnr: string | null }>)[0];
    if (!rij) {
      // Onbekende klant: niets bijwerken en vooral geen nummer verbruiken.
      await connection.rollback();
      return null;
    }

    let klantnr = rij.klantnr;
    if (!klantnr) {
      await connection.query('UPDATE counters SET value = value + 1 WHERE id = ?', ['klantnummer']);
      const [valueRows] = await connection.query('SELECT value FROM counters WHERE id = ?', [
        'klantnummer',
      ]);
      const nextValue = (valueRows as Array<{ value: number }>)[0].value;
      klantnr = `KL-${String(nextValue).padStart(KLANTNR_PADDING, '0')}`;
    }

    const velden = { ...data, klantnr };
    const kolommen = Object.keys(velden);
    const assignments = kolommen.map((kolom) => `\`${kolom}\` = ?`).join(', ');
    await connection.query(`UPDATE klanten SET ${assignments} WHERE id = ?`, [
      ...kolommen.map((kolom) => velden[kolom]),
      id,
    ]);

    await connection.commit();
    return klantnr;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Full-field admin edit (status, prijsgroepId, kunstenaarId, ...) -- staff only.
// A klant's own self-service edit goes through the narrowly-scoped /api/klanten/me instead.
export const PATCH = withApiErrorHandling(
  'PATCH /api/klanten/[id]',
  async (request: Request, { params }: { params: { id: string } }) => {
    if (!(await requireMedewerker(request))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const data = await request.json();
    if ((await checkBtwNummerUpdate(data, params.id)) === 'ongeldig') {
      return NextResponse.json({ error: 'btwnummer-ongeldig' }, { status: 400 });
    }
    if (data.status === 'Goedgekeurd') {
      const klantnr = await updateEnKenKlantnummerToe(params.id, data);
      return NextResponse.json({ ok: true, klantnr });
    }
    await updateRow('klanten', params.id, data);
    return NextResponse.json({ ok: true });
  }
);
```

De `DELETE`-export daaronder blijft ongewijzigd.

- [ ] **Step 4: Draai de tests en controleer dat ze slagen**

Run: `npx vitest run tests/app/api/klanten.test.ts`
Expected: PASS, alle tests in het bestand.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/klanten/\[id\]/route.ts tests/app/api/klanten.test.ts
git commit -m "feat: ken een klantnummer toe bij het goedkeuren van een klant"
```

---

### Task 3: Klantnummer-kolom in de klantentabel

**Files:**
- Modify: `src/components/beheer/KlantenSection.tsx:31-35` (type), `:72-80` (kolommen)
- Modify: `messages/nl.json:409` (nieuwe sleutel vóór `klantenColCompanyName`)
- Test: `tests/components/beheer/KlantenSection.test.tsx`

**Interfaces:**
- Consumes: het `klantnr`-veld dat `GET /api/klanten` sinds Task 1 automatisch meelevert (`listRows` doet `SELECT *`).
- Produces: `Klant` krijgt het optionele veld `klantnr?: string | null`. Task 4 (KlantModal), Task 5 (drukkersmail) en hun tests gebruiken exact deze naam en dit type. Het veld is optioneel, zodat bestaande testfixtures die het niet zetten blijven compileren.

- [ ] **Step 1: Schrijf de falende tests**

Voeg in `tests/components/beheer/KlantenSection.test.tsx` `klantnr: 'KL-00001'` toe aan de eerste klant in `KLANTEN` (`uid-1`) en laat de tweede klant (`uid-2`) het veld bewust weg. Voeg daarna deze twee tests toe:

```ts
it('toont het klantnummer als eerste kolom', () => {
  renderSection();
  expect(screen.getByText('Klantnr.')).toBeInTheDocument();
  expect(screen.getByText('KL-00001')).toBeInTheDocument();
});

it('laat de klantnummer-cel leeg voor een klant zonder nummer', () => {
  renderSection();
  const rij = screen.getByText('Ander Bedrijf').closest('tr');
  expect(rij).not.toBeNull();
  expect(rij?.textContent).not.toContain('KL-');
});
```

- [ ] **Step 2: Draai de tests en controleer dat ze falen**

Run: `npx vitest run tests/components/beheer/KlantenSection.test.tsx`
Expected: de eerste nieuwe test FAALT met `Unable to find an element with the text: Klantnr.`

- [ ] **Step 3: Voeg de vertaalsleutel toe**

In `messages/nl.json`, in de `beheer`-namespace, direct vóór `"klantenColCompanyName"` (regel 409):

```json
    "klantenColKlantnr": "Klantnr.",
```

- [ ] **Step 4: Voeg het veld en de kolom toe**

In `src/components/beheer/KlantenSection.tsx`, in de `Klant`-interface direct vóór `status` (regel 31):

```ts
  klantnr?: string | null;
```

En in de `columns`-array (regel 72), als nieuwe eerste regel:

```ts
    { key: 'klantnr', label: t('klantenColKlantnr') },
```

`DataTable` rendert `String(row[column.key] ?? '')`, dus een ontbrekend nummer geeft vanzelf een lege cel, en het bestaande globale zoekveld doorzoekt de nieuwe kolom automatisch — geen extra werk.

- [ ] **Step 5: Draai de tests en controleer dat ze slagen**

Run: `npx vitest run tests/components/beheer/KlantenSection.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/beheer/KlantenSection.tsx messages/nl.json tests/components/beheer/KlantenSection.test.tsx
git commit -m "feat: toon het klantnummer als eerste kolom in de klantentabel"
```

---

### Task 4: Klantnummer in de KlantModal en het activiteitenlog

**Files:**
- Modify: `src/components/beheer/KlantModal.tsx:212-226` (`handleGoedkeuren`), `:244-254` (Modal-props)
- Test: `tests/components/beheer/KlantModal.test.tsx`

**Interfaces:**
- Consumes: `{ ok: true, klantnr }` uit Task 2; `Klant['klantnr']` uit Task 3.
- Produces: `onUpdated` wordt na goedkeuring aangeroepen met `klantnr` erin, zodat `KlantenSection` het nummer meteen in de tabel toont zonder verse ophaal.

- [ ] **Step 1: Werk de fetch-mock bij en schrijf de falende tests**

`handleGoedkeuren` gaat `response.json()` aanroepen, maar de gedeelde mock in `beforeEach` levert nu alleen `{ ok: true }`. Werk die regel bij (regel ~121):

```ts
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
```

Voeg daarna deze drie tests toe aan `describe('KlantModal', ...)`:

```ts
it('toont het klantnummer in de kop wanneer de klant er een heeft', () => {
  renderModal({ ...KLANT, status: 'Goedgekeurd', klantnr: 'KL-00007' });
  expect(screen.getByTestId('klant-modal-klantnr')).toHaveTextContent('KL-00007');
});

it('toont geen klantnummer in de kop wanneer de klant er geen heeft', () => {
  renderModal(KLANT);
  expect(screen.queryByTestId('klant-modal-klantnr')).not.toBeInTheDocument();
});

it('neemt het toegekende klantnummer over uit de respons bij goedkeuren', async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, klantnr: 'KL-00008' }) });
  const { onUpdated } = renderModal(KLANT);
  fireEvent.change(screen.getByTestId('klant-modal-prijsgroep'), { target: { value: 'pg-2' } });
  fireEvent.click(screen.getByTestId('klant-modal-goedkeuren'));

  await waitFor(() =>
    expect(onUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'Goedgekeurd', klantnr: 'KL-00008' })
    )
  );
  expect(logActiviteitMock).toHaveBeenCalledWith(
    'klant_goedgekeurd',
    { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
    'Testbedrijf BV (KL-00008)'
  );
});
```

Pas ook de bestaande test `logs klant_goedgekeurd with the logged-in medewerker on approval` aan: de gedeelde mock levert geen `klantnr`, dus de verwachte omschrijving blijft daar `'Testbedrijf BV'` — dat dekt meteen de terugval wanneer de respons geen nummer bevat. Laat die test dus ongewijzigd; hij moet blijven slagen.

- [ ] **Step 2: Draai de tests en controleer dat ze falen**

Run: `npx vitest run tests/components/beheer/KlantModal.test.tsx`
Expected: de drie nieuwe tests FALEN — `klant-modal-klantnr` bestaat niet en `onUpdated` krijgt geen `klantnr` mee.

- [ ] **Step 3: Lees het nummer uit de respons en log het mee**

Vervang `handleGoedkeuren` in `src/components/beheer/KlantModal.tsx` door:

```ts
  async function handleGoedkeuren() {
    if (!klant) return;
    try {
      const response = await fetch(`/api/klanten/${klant.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Goedgekeurd', prijsgroepId }),
      });
      if (!response.ok) throw new Error('update failed');
      // Het klantnummer is een weergave-extraatje: een respons zonder bruikbare
      // JSON mag een geslaagde goedkeuring nooit alsnog laten mislukken.
      const body = (await response.json().catch(() => ({}))) as { klantnr?: string | null };
      const klantnr = body.klantnr ?? klant.klantnr ?? null;
      void logActiviteit(
        'klant_goedgekeurd',
        actorFromMedewerker(user),
        klantnr ? `${klant.companyName} (${klantnr})` : klant.companyName
      );
      onUpdated({ ...klant, status: 'Goedgekeurd', prijsgroepId, klantnr });
    } catch {
      setError(t('klantenActionError'));
    }
  }
```

- [ ] **Step 4: Toon het nummer in de kop van de modal**

In dezelfde file, in de `<Modal ...>`-props direct ná de `title`-prop (regel ~254), volgens hetzelfde patroon als `BestellingModal`:

```tsx
      subtitle={
        klant?.klantnr ? <span data-testid="klant-modal-klantnr">{klant.klantnr}</span> : undefined
      }
```

- [ ] **Step 5: Draai de tests en controleer dat ze slagen**

Run: `npx vitest run tests/components/beheer/KlantModal.test.tsx`
Expected: PASS, alle tests in het bestand — ook de bestaande goedkeur- en afwijstests.

- [ ] **Step 6: Commit**

```bash
git add src/components/beheer/KlantModal.tsx tests/components/beheer/KlantModal.test.tsx
git commit -m "feat: toon het klantnummer in de klantmodal en log het bij goedkeuring"
```

---

### Task 5: Klantnummer in de mail naar de drukker

**Files:**
- Modify: `src/lib/buildDrukkerMail.ts:277` (bedrijfsnaam), `:302` (tekstkop), `:306` (HTML-kop)
- Test: `tests/lib/buildDrukkerMail.test.ts`

**Interfaces:**
- Consumes: `Klant['klantnr']` uit Task 3 (`buildDrukkerMail.ts` importeert `Klant` uit `KlantenSection`).
- Produces: geen nieuwe exports. `ontbrekendeKlantVelden` blijft ongewijzigd van gedrag.

- [ ] **Step 1: Schrijf de falende tests**

Voeg toe aan `describe('buildDrukkerMail', ...)` in `tests/lib/buildDrukkerMail.test.ts`:

```ts
it('zet het klantnummer achter de bedrijfsnaam in tekst en HTML', () => {
  const mail = callBuildDrukkerMail({
    bestellingen: [bestelling()],
    klanten: [klant({ klantnr: 'KL-00003' })],
  });
  expect(mail.text).toContain('== Testbedrijf BV (KL-00003) ==');
  expect(mail.html).toContain('Testbedrijf BV (KL-00003)');
});

it('laat de kop ongewijzigd wanneer de klant geen klantnummer heeft', () => {
  const mail = callBuildDrukkerMail({ bestellingen: [bestelling()], klanten: [klant()] });
  expect(mail.text).toContain('== Testbedrijf BV ==');
  // Bewust op de kop zelf, niet op '(' in het algemeen: het factuurvoetje bevat
  // al "E-mailadres (voor facturen)".
  expect(mail.text).not.toContain('Testbedrijf BV (');
});

it('blokkeert het versturen niet wanneer het klantnummer ontbreekt', () => {
  expect(ontbrekendeKlantVelden(klant({ klantnr: null }))).toEqual([]);
});
```

Controleer dat `ontbrekendeKlantVelden` bovenaan het testbestand geïmporteerd is; zo niet, voeg het toe aan de bestaande import uit `@/lib/buildDrukkerMail`.

- [ ] **Step 2: Draai de tests en controleer dat ze falen**

Run: `npx vitest run tests/lib/buildDrukkerMail.test.ts`
Expected: de eerste test FAALT — de tekstkop is `== Testbedrijf BV ==` zonder nummer.

- [ ] **Step 3: Voeg het nummer toe aan de sectiekop**

In `src/lib/buildDrukkerMail.ts`, direct ná de bestaande `const bedrijfsnaam = ...` (regel 277):

```ts
    // Het klantnummer staat bewust niet in KLANT_ALGEMENE_VELDEN: een klant
    // zonder nummer mag een verzending naar de drukker nooit blokkeren.
    const klantnummer = tekst(klant?.klantnr);
    const klantKop = klantnummer ? `${bedrijfsnaam} (${klantnummer})` : bedrijfsnaam;
```

Vervang in de `return`-waarde `bedrijfsnaam` door `klantKop` op de twee plekken waar hij in de kop staat — regel 302 (tekst):

```ts
      text: `== ${klantKop} ==\nAfleveradres: ${afleveradres}\n\n${bestellingBlokkenText}`,
```

en regel 306 (HTML):

```html
      <div style="font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#111111;">${escapeHtml(klantKop)}</div>
```

Laat `bedrijfsnaam` verder ongemoeid: hij wordt nergens anders gebruikt, maar `klantKop` is er expliciet van afgeleid, wat de terugval op de bestellingsnaam intact houdt.

- [ ] **Step 4: Draai de tests en controleer dat ze slagen**

Run: `npx vitest run tests/lib/buildDrukkerMail.test.ts`
Expected: PASS, alle tests in het bestand.

- [ ] **Step 5: Commit**

```bash
git add src/lib/buildDrukkerMail.ts tests/lib/buildDrukkerMail.test.ts
git commit -m "feat: zet het klantnummer in de kop van de drukkersmail"
```

---

### Task 6: Klantnummer op het klantaccount

**Files:**
- Modify: `src/components/account/SettingsSection.tsx:18-29` (type), `:31-42` (leegwaarde), `:70-81` (ophalen), `:190` (weergave)
- Modify: `messages/nl.json:271`, `messages/en.json:301`, `messages/de.json:271`, `messages/fr.json:271` (allemaal in `accountPage.settings`)
- Test: `tests/components/account/SettingsSection.test.tsx`, `tests/app/api/klanten-me.test.ts`

**Interfaces:**
- Consumes: `klantnr` uit `GET /api/klanten/me`, dat sinds Task 1 automatisch meekomt (`getRow` doet `SELECT *` en filtert alleen `wachtwoordHash` weg).
- Produces: geen nieuwe exports.

- [ ] **Step 1: Schrijf de falende tests**

In `tests/components/account/SettingsSection.test.tsx`: voeg `klantnr: 'KL-00002'` toe aan `KLANT_PROFILE` en daarna deze tests:

```ts
it('toont het klantnummer als leeswaarde, niet als invoerveld', async () => {
  renderSection();
  const klantnr = await screen.findByTestId('settings-klantnr');
  expect(klantnr).toHaveTextContent('KL-00002');
  expect(klantnr.tagName).not.toBe('INPUT');
});

it('toont geen klantnummer wanneer de klant er geen heeft', async () => {
  renderSection({ ...KLANT_PROFILE, klantnr: null });
  await screen.findByTestId('settings-company-name');
  expect(screen.queryByTestId('settings-klantnr')).not.toBeInTheDocument();
});
```

`renderSection()` neemt nu geen argument. Maak het overschrijfbaar met een expliciet breed parametertype, zodat `klantnr: null` geen typefout geeft tegen de uit `KLANT_PROFILE` afgeleide `string`:

```ts
function renderSection(profiel: Record<string, unknown> = KLANT_PROFILE) {
```

Gebruik `profiel` in plaats van de constante in de `/api/klanten/me`-tak van `fetchMock.mockImplementation`.

In `tests/app/api/klanten-me.test.ts`, binnen `describe('klanten self-service route', ...)` — de bestaande `createKlantWithCookie()`-helper accepteert overrides en registreert de klant al voor de gescoopte cleanup, dus er is geen nieuwe fixture of cleanup nodig:

```ts
it('geeft het klantnummer terug maar laat de klant het niet zelf zetten', async () => {
  // KL-09999 valt bewust buiten de echte reeks, zodat deze fixture nooit kan
  // botsen met een nummer dat de teller uitdeelt.
  const { klant, cookie } = await createKlantWithCookie({
    status: 'Goedgekeurd',
    klantnr: 'KL-09999',
  });

  const getResponse = await getMe(req('GET', undefined, cookie));
  expect((await getResponse.json()).klantnr).toBe('KL-09999');

  await patchMe(req('PATCH', { klantnr: 'KL-00001' }, cookie));
  const [rows] = await getPool().query('SELECT klantnr FROM klanten WHERE id = ?', [klant.id]);
  expect((rows as Array<{ klantnr: string }>)[0].klantnr).toBe('KL-09999');
});
```

- [ ] **Step 2: Draai de tests en controleer dat ze falen**

Run: `npx vitest run tests/components/account/SettingsSection.test.tsx tests/app/api/klanten-me.test.ts`
Expected: de SettingsSection-tests FALEN op een ontbrekende `settings-klantnr`. De `klanten-me`-test slaagt mogelijk al voor het GET-deel (de kolom komt automatisch mee) — dat is prima; hij legt het gedrag vast tegen toekomstige regressies.

- [ ] **Step 3: Voeg de vertaalsleutels toe**

In `accountPage.settings`, direct vóór `"labelCompanyName"`:

- `messages/nl.json`: `"labelKlantnr": "Klantnummer",`
- `messages/en.json`: `"labelKlantnr": "Customer number",`
- `messages/de.json`: `"labelKlantnr": "Kundennummer",`
- `messages/fr.json`: `"labelKlantnr": "Numéro client",`

- [ ] **Step 4: Toon het nummer in de accountinstellingen**

In `src/components/account/SettingsSection.tsx`, voeg toe aan `KlantProfile` (na `companyName`):

```ts
  klantnr: string;
```

Aan `EMPTY_PROFILE`:

```ts
  klantnr: '',
```

In de `setProfile(...)`-aanroep in de `useEffect` (na `companyName`):

```ts
        klantnr: klant.klantnr ?? '',
```

En in de JSX, direct vóór het `labelCompanyName`-blok (regel 190) — een leesregel, geen `<input>`, zodat het veld niet in `handleSubmit` meegaat:

```tsx
      {profile.klantnr && (
        <div className={labelClassName}>
          <span>{t('labelKlantnr')}</span>
          <p data-testid="settings-klantnr" className="text-sm normal-case tracking-normal text-white">
            {profile.klantnr}
          </p>
        </div>
      )}
```

Voeg `klantnr` **niet** toe aan `SELF_EDITABLE_KLANT_FIELDS`: `PATCH /api/klanten/me` schrijft alleen velden uit die allowlist, dus het veld blijft daarmee onwijzigbaar door de klant.

- [ ] **Step 5: Draai de tests en controleer dat ze slagen**

Run: `npx vitest run tests/components/account/SettingsSection.test.tsx tests/app/api/klanten-me.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/account/SettingsSection.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json tests/components/account/SettingsSection.test.tsx tests/app/api/klanten-me.test.ts
git commit -m "feat: toon het klantnummer in de accountinstellingen van de klant"
```

---

### Task 7: Volledige verificatie

**Files:**
- Geen wijzigingen; dit is de eindcontrole over de hele branch.

**Interfaces:**
- Consumes: alles uit Task 1 t/m 6.
- Produces: bewijs dat de branch klaar is voor review en staging-deploy.

- [ ] **Step 1: Draai de volledige testsuite**

Run: `npm test`
Expected: PASS, geen falende bestanden. Let specifiek op `bestelheaders.test.ts` en `drukkerZendingen.test.ts` — die raken dezelfde `counters`-tabel en mogen niet beïnvloed zijn.

- [ ] **Step 2: Controleer types en lint**

Run: `npx tsc --noEmit`
Expected: geen fouten.

Run: `npm run lint`
Expected: geen fouten.

- [ ] **Step 3: Controleer de staging-data**

Draai het controlescript uit Task 1 opnieuw (alleen het `SELECT`-deel) en bevestig dat de 6 bestaande klanten `KL-00001` t/m `KL-00006` hebben en dat `counters.klantnummer` gelijk is aan het aantal genummerde klanten plus de nummers die de testsuite intussen heeft verbruikt.

- [ ] **Step 4: Commit eventuele restwijzigingen**

Als de stappen hierboven niets veranderd hebben, is er niets te committen — noteer dat expliciet in plaats van een lege commit te maken.

---

## Wat dit plan bewust niet doet

- Geen productie-migratie. `db/migrations/2026-08-08-klantnummer.sql` wordt pas tegen productie gedraaid ná verificatie op staging en met expliciete toestemming van Joris, als aparte stap buiten dit plan.
- Geen `UNIQUE`-index op `klantnr`, geen handmatig bewerkbaar klantnummer, geen nummer voor klanten met status `Beoordelen` of `Afgewezen`, en geen klantnummer in de bestelbevestigingsmail — zie de sectie "Wat dit ontwerp bewust niet doet" in het ontwerp.
