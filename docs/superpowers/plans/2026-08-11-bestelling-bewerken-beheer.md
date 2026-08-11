# Bestelling bewerken in beheer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let beheer staff add/remove/edit bestelheader-lines, set a flat per-order discount (korting), batch those changes into one save, and optionally trigger a "wijzigingsmail" to the customer afterward.

**Architecture:** One new atomic API endpoint (`PATCH /api/bestelheaders/[id]/wijzigen`) replaces the old single-line PATCH endpoint and handles updates/additions/deletions/korting in one DB transaction. `BestellingModal.tsx` moves from "edit one line, save immediately" to "collect a draft of changes, one Wijzigingen-opslaan button". A new `soort: 'bestelwijziging'` on `POST /api/mail` sends a server-built, self-authoritative overview mail. A shared pure function computes totals so the modal and the mail agree.

**Tech Stack:** Next.js 14 App Router route handlers, mysql2/promise (raw SQL + `src/lib/server/crud.ts` helpers), Vitest + `@testing-library/react`, next-intl.

## Global Constraints

- Design doc: `docs/superpowers/specs/2026-08-11-bestelling-bewerken-beheer-design.md` — every task below implements a decision from that doc; consult it for the "why".
- Regelstructuur (regel toevoegen/verwijderen, aantal/materiaal/maat/afmeting wijzigen) is editable only when `bestelheaders.status` is `Te beoordelen` or `Te versturen naar drukker`. Locked from `Verstuurd naar drukker` onward (`Verstuurd naar drukker`, `Te factureren`, `Betaald en afgerond`), and always locked at `Afgewezen`.
- Prijs (per regel) en korting are editable in every status except `Afgewezen`.
- `Afgewezen` blocks every kind of edit.
- Nieuwe kolom `bestelheaders.korting DECIMAL(10,2) NULL` is a flat amount, never a percentage.
- Never trust a client-supplied price for a newly added regel — always recompute via `berekenBestellijnPrijs`.
- Alleen `messages/nl.json` krijgt nieuwe vertaalsleutels (beheer-only UI, geen en/de/fr).
- Every DB-touching test scopes its own cleanup by captured id, per `CLAUDE.md`'s hard rule — never a blanket `DELETE`/`TRUNCATE`.

---

## Task 1: Schema — `bestelheaders.korting`

**Files:**
- Create: `db/migrations/2026-08-11-01-bestelheader-korting.sql`
- Modify: `db/schema.sql` (the `bestelheaders` table definition, around line 231-241)
- Modify: `src/lib/server/tableColumns.ts:120` (`TABLE_COLUMNS.bestelheaders`)
- Test: `tests/lib/server/tableColumns.test.ts` if it exists (check first; otherwise skip — this task's own correctness is proven by Task 3's endpoint test writing `korting` through `updateRow`)

**Interfaces:**
- Produces: `bestelheaders.korting` column, and `'korting'` added to `TABLE_COLUMNS.bestelheaders`, which every later task's `updateRow('bestelheaders', id, { korting })` call depends on (an unlisted column throws in `controleerKolommen`).

- [ ] **Step 1: Check for an existing `tableColumns` test file**

Run: `ls tests/lib/server/ 2>/dev/null | grep -i tablecolumns`

If a file matches, open it and note its pattern for a follow-up assertion (e.g. `TABLE_COLUMNS.bestelheaders` contains a fixed list) — you'll add `'korting'` to that expected list in Step 2. If no file matches, skip straight to Step 3.

- [ ] **Step 2 (only if a test file was found): update the expected column list**

Add `'korting'` to whatever array/matcher asserts `TABLE_COLUMNS.bestelheaders`'s contents.

- [ ] **Step 3: Write the migration**

```sql
-- Migratie voor bestelheaders.korting (2026-08-11).
-- Vast kortingsbedrag per bestelling, voor speciale prijsafspraken (bv. een kunstenaar die
-- zijn eigen werk bestelt). Zie docs/superpowers/specs/2026-08-11-bestelling-bewerken-beheer-design.md.
ALTER TABLE bestelheaders ADD COLUMN korting DECIMAL(10,2) NULL AFTER status;
```

- [ ] **Step 4: Update `db/schema.sql`**

Find the `bestelheaders` table block (around line 231) and add the column after `status`:

```sql
CREATE TABLE bestelheaders (
  id CHAR(36) PRIMARY KEY,
  klantnr VARCHAR(20) NOT NULL,
  bestelnr VARCHAR(20) NOT NULL,
  zendingnummer VARCHAR(20),
  besteldatum TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) NOT NULL DEFAULT 'Te beoordelen',
  korting DECIMAL(10,2),
  afwijsreden TEXT,
  FOREIGN KEY (klantnr) REFERENCES klanten(klantnr),
  UNIQUE KEY uniek_bestelnr (bestelnr)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 5: Add `korting` to `TABLE_COLUMNS.bestelheaders`**

In `src/lib/server/tableColumns.ts`, change:

```ts
  bestelheaders: ['id', 'klantnr', 'bestelnr', 'besteldatum', 'status', 'zendingnummer', 'afwijsreden'],
```

to:

```ts
  bestelheaders: ['id', 'klantnr', 'bestelnr', 'besteldatum', 'status', 'korting', 'zendingnummer', 'afwijsreden'],
```

- [ ] **Step 6: Apply the migration to staging**

Run: `npm run db:migrate -- staging`

Expected: reports the new migration applied. This is a schema-only change (nullable column, no backfill), safe to run directly — the whole test suite depends on it existing before any later task's tests can pass.

- [ ] **Step 7: Verify with `db:status`**

Run: `npm run db:status -- staging`

Expected: `2026-08-11-01-bestelheader-korting.sql` listed as applied, nothing pending.

- [ ] **Step 8: Commit**

```bash
git add db/migrations/2026-08-11-01-bestelheader-korting.sql db/schema.sql src/lib/server/tableColumns.ts
git commit -m "feat: voeg bestelheaders.korting toe (vast kortingsbedrag per bestelling)"
```

---

## Task 2: `src/lib/bestellingTotalen.ts` — gedeelde totalen-functie

**Files:**
- Create: `src/lib/bestellingTotalen.ts`
- Test: `tests/lib/bestellingTotalen.test.ts`

**Interfaces:**
- Produces: `berekenBestellingTotalen(lines, korting, btwPercentage): BestellingTotalen`, `BestellingRegel`, `BestellingTotalen` — consumed by Task 7 (`BestellingModal.tsx`'s totals display) and Task 5 (the mail-HTML builder in `POST /api/mail`).

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/bestellingTotalen.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { berekenBestellingTotalen } from '@/lib/bestellingTotalen';

describe('berekenBestellingTotalen', () => {
  it('sums prijs × quantity across lines with no korting and no btw', () => {
    const result = berekenBestellingTotalen(
      [
        { prijs: 150, quantity: 3 },
        { prijs: 0, quantity: 2 },
      ],
      null,
      null
    );
    expect(result).toEqual({
      heeftOngeprijsdeRegel: false,
      regelsom: 450,
      korting: 0,
      totaalExclBtw: 450,
      btwPercentage: null,
      btwBedrag: null,
      totaalInclBtw: null,
    });
  });

  it('applies btw on top of the regelsom', () => {
    const result = berekenBestellingTotalen([{ prijs: 150, quantity: 3 }], null, 21);
    expect(result.totaalExclBtw).toBe(450);
    expect(result.btwPercentage).toBe(21);
    expect(result.btwBedrag).toBe(94.5);
    expect(result.totaalInclBtw).toBe(544.5);
  });

  it('subtracts a flat korting from the total before btw', () => {
    const result = berekenBestellingTotalen([{ prijs: 150, quantity: 3 }], 50, 21);
    expect(result.korting).toBe(50);
    expect(result.totaalExclBtw).toBe(400);
    expect(result.btwBedrag).toBe(84);
    expect(result.totaalInclBtw).toBe(484);
  });

  it('clamps a korting larger than the regelsom to a total of 0', () => {
    const result = berekenBestellingTotalen([{ prijs: 150, quantity: 1 }], 999, 21);
    expect(result.totaalExclBtw).toBe(0);
    expect(result.btwBedrag).toBe(0);
    expect(result.totaalInclBtw).toBe(0);
  });

  it('treats a null korting as 0', () => {
    const result = berekenBestellingTotalen([{ prijs: 100, quantity: 1 }], null, null);
    expect(result.korting).toBe(0);
    expect(result.totaalExclBtw).toBe(100);
  });

  it('reports heeftOngeprijsdeRegel and returns null totals when any line has no prijs yet', () => {
    const result = berekenBestellingTotalen(
      [
        { prijs: 150, quantity: 1 },
        { prijs: null, quantity: 1 },
      ],
      null,
      21
    );
    expect(result.heeftOngeprijsdeRegel).toBe(true);
    expect(result.regelsom).toBeNull();
    expect(result.totaalExclBtw).toBeNull();
    expect(result.btwPercentage).toBeNull();
    expect(result.btwBedrag).toBeNull();
    expect(result.totaalInclBtw).toBeNull();
  });

  it('returns null btw fields when no btwPercentage is known, even with a complete total', () => {
    const result = berekenBestellingTotalen([{ prijs: 100, quantity: 1 }], null, null);
    expect(result.totaalExclBtw).toBe(100);
    expect(result.btwPercentage).toBeNull();
    expect(result.btwBedrag).toBeNull();
    expect(result.totaalInclBtw).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/bestellingTotalen.test.ts`
Expected: FAIL — `Cannot find module '@/lib/bestellingTotalen'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/bestellingTotalen.ts`:

```ts
export interface BestellingRegel {
  prijs: number | null;
  quantity: number;
}

export interface BestellingTotalen {
  heeftOngeprijsdeRegel: boolean;
  regelsom: number | null;
  korting: number;
  totaalExclBtw: number | null;
  btwPercentage: number | null;
  btwBedrag: number | null;
  totaalInclBtw: number | null;
}

export function berekenBestellingTotalen(
  lines: BestellingRegel[],
  korting: number | null,
  btwPercentage: number | null
): BestellingTotalen {
  const heeftOngeprijsdeRegel = lines.some((line) => line.prijs === null);
  const regelsom = heeftOngeprijsdeRegel
    ? null
    : lines.reduce((sum, line) => sum + (line.prijs ?? 0) * line.quantity, 0);
  const kortingBedrag = korting ?? 0;
  const totaalExclBtw = regelsom === null ? null : Math.max(0, regelsom - kortingBedrag);
  const effectiefBtwPercentage = totaalExclBtw !== null ? btwPercentage : null;
  const btwBedrag =
    totaalExclBtw !== null && effectiefBtwPercentage != null ? totaalExclBtw * (effectiefBtwPercentage / 100) : null;
  const totaalInclBtw = totaalExclBtw !== null && btwBedrag !== null ? totaalExclBtw + btwBedrag : null;

  return {
    heeftOngeprijsdeRegel,
    regelsom,
    korting: kortingBedrag,
    totaalExclBtw,
    btwPercentage: effectiefBtwPercentage,
    btwBedrag,
    totaalInclBtw,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/bestellingTotalen.test.ts`
Expected: PASS, all 7 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/bestellingTotalen.ts tests/lib/bestellingTotalen.test.ts
git commit -m "feat: voeg gedeelde bestellingTotalen-functie toe (regelsom, korting, btw)"
```

---

## Task 3: `PATCH /api/bestelheaders/[id]/wijzigen`

**Files:**
- Create: `src/app/api/bestelheaders/[id]/wijzigen/route.ts`
- Test: `tests/app/api/bestelheaders-wijzigen.test.ts`

**Interfaces:**
- Consumes: `berekenBestellijnPrijs` (`src/lib/server/prijsmodule.ts`), `withMedewerker` (`src/lib/server/apiRoute.ts`), `insertRow`/`updateRow`/`deleteRow`/`parseJsonKolom` (`src/lib/server/crud.ts`).
- Produces: `PATCH /api/bestelheaders/[id]/wijzigen` — request body `{ korting?: number | null, updates?: UpdateInput[], additions?: AdditionInput[], deletions?: string[] }`; success response `{ lines: Array<{ id, code, maatId, materiaalId, prijs, quantity, breedte, hoogte }>, korting: number | null }`. This is what Task 9/10 (`BestellingModal.tsx`) call.

- [ ] **Step 1: Write the failing tests**

Create `tests/app/api/bestelheaders-wijzigen.test.ts`. This mirrors the setup style of `tests/app/api/bestelheaders.test.ts` and `tests/app/api/mail.test.ts` (direct handler import, `createSession`, scoped cleanup by captured id).

```ts
import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { insertRow } from '@/lib/server/crud';
import { PATCH as wijzigenBestelling } from '@/app/api/bestelheaders/[id]/wijzigen/route';

const createdKlantIds: string[] = [];
const createdKunstwerkIds: string[] = [];
const createdMaatIds: string[] = [];
const createdMateriaalIds: string[] = [];
const createdMateriaalsoortIds: string[] = [];
const createdHeaderIds: string[] = [];

afterEach(async () => {
  await getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'wijzigen-staff-1'");
  if (createdHeaderIds.length > 0) {
    await getPool().query('DELETE FROM bestelheaders WHERE id IN (?)', [createdHeaderIds]);
    createdHeaderIds.length = 0;
  }
  if (createdKunstwerkIds.length > 0) {
    await getPool().query('DELETE FROM kunstwerken WHERE id IN (?)', [createdKunstwerkIds]);
    createdKunstwerkIds.length = 0;
  }
  if (createdMateriaalIds.length > 0) {
    await getPool().query('DELETE FROM materialen WHERE id IN (?)', [createdMateriaalIds]);
    createdMateriaalIds.length = 0;
  }
  if (createdMateriaalsoortIds.length > 0) {
    await getPool().query('DELETE FROM materiaalsoorten WHERE id IN (?)', [createdMateriaalsoortIds]);
    createdMateriaalsoortIds.length = 0;
  }
  if (createdMaatIds.length > 0) {
    await getPool().query('DELETE FROM maten WHERE id IN (?)', [createdMaatIds]);
    createdMaatIds.length = 0;
  }
  if (createdKlantIds.length > 0) {
    await getPool().query("DELETE FROM sessions WHERE userType = 'klant' AND userId IN (?)", [createdKlantIds]);
    await getPool().query('DELETE FROM klanten WHERE id IN (?)', [createdKlantIds]);
    createdKlantIds.length = 0;
  }
});

async function medewerkerCookie() {
  const sessionId = await createSession('medewerker', 'wijzigen-staff-1');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

async function maakMaat(breedte: number, hoogte: number) {
  const maat = await insertRow<{ id: string }>('maten', { breedte, hoogte } as never);
  createdMaatIds.push(maat.id);
  return maat.id;
}

async function maakMateriaal() {
  const soort = await insertRow<{ id: string }>('materiaalsoorten', {
    omschrijvingNl: 'AUTOTEST soort',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  } as never);
  createdMateriaalsoortIds.push(soort.id);
  const materiaal = await insertRow<{ id: string }>('materialen', {
    materiaalsoortId: soort.id,
    materiaaldikte: 4,
    omschrijvingNl: 'AUTOTEST materiaal',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  } as never);
  createdMateriaalIds.push(materiaal.id);
  return materiaal.id;
}

async function maakKlant(email: string) {
  const klant = await insertRow<{ id: string; klantnr: string }>('klanten', {
    email,
    wachtwoordHash: 'x:y',
    status: 'Goedgekeurd',
    klantnr: `AUTOTEST-${email}`,
  } as never);
  createdKlantIds.push(klant.id);
  return klant;
}

async function maakBestelling(klantnr: string, status: string, lines: Array<{ code: string; maatId: string | null; materiaalId: string | null; prijs: number | null; quantity: number }>) {
  const header = await insertRow<{ id: string; bestelnr: string }>('bestelheaders', {
    klantnr,
    bestelnr: `AUTOTEST-BE-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    status,
  } as never);
  createdHeaderIds.push(header.id);
  const lineIds: string[] = [];
  for (const line of lines) {
    const row = await insertRow<{ id: string }>('bestellines', { bestelnr: header.bestelnr, ...line } as never);
    lineIds.push(row.id);
  }
  return { header, lineIds };
}

function req(body: unknown, cookie?: string) {
  return new Request('http://localhost/api', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/bestelheaders/[id]/wijzigen', () => {
  it('weigert zonder medewerkersessie', async () => {
    const klant = await maakKlant('wijzigen-noauth@example.com');
    const { header } = await maakBestelling(klant.klantnr, 'Te beoordelen', [
      { code: 'x', maatId: null, materiaalId: null, prijs: 10, quantity: 1 },
    ]);
    const response = await wijzigenBestelling(req({ korting: 5 }), { params: { id: header.id } });
    expect(response.status).toBe(401);
  });

  it('past de korting toe ongeacht status, behalve Afgewezen', async () => {
    const klant = await maakKlant('wijzigen-korting@example.com');
    const { header } = await maakBestelling(klant.klantnr, 'Betaald en afgerond', [
      { code: 'x', maatId: null, materiaalId: null, prijs: 100, quantity: 1 },
    ]);
    const cookie = await medewerkerCookie();
    const response = await wijzigenBestelling(req({ korting: 25 }, cookie), { params: { id: header.id } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.korting).toBe(25);
  });

  it('weigert elke wijziging wanneer de bestelling Afgewezen is', async () => {
    const klant = await maakKlant('wijzigen-afgewezen@example.com');
    const { header } = await maakBestelling(klant.klantnr, 'Afgewezen', [
      { code: 'x', maatId: null, materiaalId: null, prijs: 100, quantity: 1 },
    ]);
    const cookie = await medewerkerCookie();
    const response = await wijzigenBestelling(req({ korting: 10 }, cookie), { params: { id: header.id } });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'bestelling-op-slot' });
  });

  it('staat een prijs-only update toe bij Te factureren, maar weigert een aantal-wijziging', async () => {
    const klant = await maakKlant('wijzigen-tefac@example.com');
    const { header, lineIds } = await maakBestelling(klant.klantnr, 'Te factureren', [
      { code: 'x', maatId: null, materiaalId: null, prijs: 100, quantity: 1 },
    ]);
    const cookie = await medewerkerCookie();

    const prijsResponse = await wijzigenBestelling(
      req({ updates: [{ id: lineIds[0], prijs: 150 }] }, cookie),
      { params: { id: header.id } }
    );
    expect(prijsResponse.status).toBe(200);
    const prijsBody = await prijsResponse.json();
    expect(prijsBody.lines[0].prijs).toBe(150);

    const aantalResponse = await wijzigenBestelling(
      req({ updates: [{ id: lineIds[0], quantity: 2 }] }, cookie),
      { params: { id: header.id } }
    );
    expect(aantalResponse.status).toBe(400);
    expect(await aantalResponse.json()).toEqual({ error: 'regelstructuur-op-slot' });
  });

  it('weigert een regel toevoegen of verwijderen zodra de status Verstuurd naar drukker is', async () => {
    const klant = await maakKlant('wijzigen-verstuurd@example.com');
    const materiaalId = await maakMateriaal();
    const maatId = await maakMaat(40, 60);
    const kunstwerk = await insertRow<{ id: string }>(
      'kunstwerken',
      { code: 'AUTOTEST-kw-verstuurd', materiaalIds: [materiaalId], maatIds: [maatId] } as never,
      ['materiaalIds', 'maatIds']
    );
    createdKunstwerkIds.push(kunstwerk.id);
    const { header, lineIds } = await maakBestelling(klant.klantnr, 'Verstuurd naar drukker', [
      { code: 'AUTOTEST-kw-verstuurd', maatId, materiaalId, prijs: 100, quantity: 1 },
    ]);
    const cookie = await medewerkerCookie();

    const deleteResponse = await wijzigenBestelling(req({ deletions: [lineIds[0]] }, cookie), {
      params: { id: header.id },
    });
    expect(deleteResponse.status).toBe(400);
    expect(await deleteResponse.json()).toEqual({ error: 'regelstructuur-op-slot' });

    const addResponse = await wijzigenBestelling(
      req({ additions: [{ kunstwerkId: kunstwerk.id, materiaalId, maatId, quantity: 1 }] }, cookie),
      { params: { id: header.id } }
    );
    expect(addResponse.status).toBe(400);
    expect(await addResponse.json()).toEqual({ error: 'regelstructuur-op-slot' });
  });

  it('voegt een regel toe met een server-berekende prijs, ook als de client een afwijkende prijs meestuurt', async () => {
    const klant = await maakKlant('wijzigen-toevoegen@example.com');
    const materiaalId = await maakMateriaal();
    const maatId = await maakMaat(40, 60);
    const kunstwerk = await insertRow<{ id: string }>(
      'kunstwerken',
      { code: 'AUTOTEST-kw-toevoegen', materiaalIds: [materiaalId], maatIds: [maatId] } as never,
      ['materiaalIds', 'maatIds']
    );
    createdKunstwerkIds.push(kunstwerk.id);
    await getPool().query('INSERT INTO prijsmatrix (id, maatId, materiaalId, prijs) VALUES (UUID(), ?, ?, ?)', [
      maatId,
      materiaalId,
      88,
    ]);
    const { header } = await maakBestelling(klant.klantnr, 'Te beoordelen', [
      { code: 'x', maatId: null, materiaalId: null, prijs: 10, quantity: 1 },
    ]);
    const cookie = await medewerkerCookie();

    const response = await wijzigenBestelling(
      req(
        // @ts-expect-error -- prijs is not part of AdditionInput; this proves the server ignores it
        { additions: [{ kunstwerkId: kunstwerk.id, materiaalId, maatId, quantity: 2, prijs: 999999 }] },
        cookie
      ),
      { params: { id: header.id } }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    const nieuweRegel = body.lines.find((l: { code: string }) => l.code === 'AUTOTEST-kw-toevoegen');
    expect(nieuweRegel.prijs).toBe(88);
    expect(nieuweRegel.quantity).toBe(2);

    await getPool().query('DELETE FROM prijsmatrix WHERE maatId = ? AND materiaalId = ?', [maatId, materiaalId]);
  });

  it('verwijdert een regel binnen de toegestane status', async () => {
    const klant = await maakKlant('wijzigen-verwijderen@example.com');
    const { header, lineIds } = await maakBestelling(klant.klantnr, 'Te beoordelen', [
      { code: 'x', maatId: null, materiaalId: null, prijs: 10, quantity: 1 },
      { code: 'y', maatId: null, materiaalId: null, prijs: 20, quantity: 1 },
    ]);
    const cookie = await medewerkerCookie();

    const response = await wijzigenBestelling(req({ deletions: [lineIds[0]] }, cookie), {
      params: { id: header.id },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0].id).toBe(lineIds[1]);
  });

  it('weigert de laatste regel te verwijderen', async () => {
    const klant = await maakKlant('wijzigen-leeg@example.com');
    const { header, lineIds } = await maakBestelling(klant.klantnr, 'Te beoordelen', [
      { code: 'x', maatId: null, materiaalId: null, prijs: 10, quantity: 1 },
    ]);
    const cookie = await medewerkerCookie();

    const response = await wijzigenBestelling(req({ deletions: [lineIds[0]] }, cookie), {
      params: { id: header.id },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'bestelling-mag-niet-leeg' });
  });

  it('weigert een update/deletion-id die niet bij deze bestelling hoort', async () => {
    const klantA = await maakKlant('wijzigen-eigenaarA@example.com');
    const klantB = await maakKlant('wijzigen-eigenaarB@example.com');
    const { header: headerA } = await maakBestelling(klantA.klantnr, 'Te beoordelen', [
      { code: 'x', maatId: null, materiaalId: null, prijs: 10, quantity: 1 },
    ]);
    const { lineIds: lineIdsB } = await maakBestelling(klantB.klantnr, 'Te beoordelen', [
      { code: 'y', maatId: null, materiaalId: null, prijs: 20, quantity: 1 },
    ]);
    const cookie = await medewerkerCookie();

    const response = await wijzigenBestelling(req({ deletions: [lineIdsB[0]] }, cookie), {
      params: { id: headerA.id },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'regel-hoort-niet-bij-bestelling' });
  });

  it('laat alles-of-niets zien: een ongeldige addition rolt ook een geldige korting-wijziging terug', async () => {
    const klant = await maakKlant('wijzigen-rollback@example.com');
    const { header } = await maakBestelling(klant.klantnr, 'Te beoordelen', [
      { code: 'x', maatId: null, materiaalId: null, prijs: 10, quantity: 1 },
    ]);
    const cookie = await medewerkerCookie();

    const response = await wijzigenBestelling(
      req({ korting: 40, additions: [{ kunstwerkId: 'bestaat-niet', materiaalId: 'x', maatId: 'x', quantity: 1 }] }, cookie),
      { params: { id: header.id } }
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'kunstwerk-not-found' });

    const [rows] = await getPool().query('SELECT korting FROM bestelheaders WHERE id = ?', [header.id]);
    expect((rows as Array<{ korting: number | null }>)[0].korting).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/app/api/bestelheaders-wijzigen.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/bestelheaders/[id]/wijzigen/route'`

- [ ] **Step 3: Write the implementation**

Create `src/app/api/bestelheaders/[id]/wijzigen/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { withMedewerker } from '@/lib/server/apiRoute';
import { insertRow, updateRow, deleteRow, parseJsonKolom } from '@/lib/server/crud';
import { berekenBestellijnPrijs } from '@/lib/server/prijsmodule';

const REGELSTRUCTUUR_OP_SLOT_STATUSSEN = ['Verstuurd naar drukker', 'Te factureren', 'Betaald en afgerond'];
const UPDATE_VELDEN = ['quantity', 'prijs', 'materiaalId', 'maatId', 'breedte', 'hoogte'] as const;
type UpdateVeld = (typeof UPDATE_VELDEN)[number];

interface UpdateInput {
  id: string;
  quantity?: number;
  prijs?: number | null;
  materiaalId?: string;
  maatId?: string;
  breedte?: number;
  hoogte?: number;
}

interface AdditionInput {
  kunstwerkId: string;
  materiaalId: string;
  maatId: string;
  breedte?: number;
  hoogte?: number;
  quantity: number;
}

interface WijzigenBody {
  korting?: number | null;
  updates?: UpdateInput[];
  additions?: AdditionInput[];
  deletions?: string[];
}

// Een update-item dat alléén `prijs` bevat blijft toegestaan zodra de regelstructuur op
// slot zit -- "prijs vaststellen"/"handmatig corrigeren" mag altijd, zie de design-beslissing 2.
function heeftAlleenPrijs(update: UpdateInput): boolean {
  return UPDATE_VELDEN.filter((veld) => veld !== 'prijs').every((veld) => update[veld as UpdateVeld] === undefined);
}

export const PATCH = withMedewerker<{ params: { id: string } }>(
  'PATCH /api/bestelheaders/[id]/wijzigen',
  async (request, { params }) => {
    const body = (await request.json()) as WijzigenBody;
    const updates = body.updates ?? [];
    const additions = body.additions ?? [];
    const deletions = body.deletions ?? [];

    const pool = getPool();
    const [headerRows] = await pool.query('SELECT bestelnr, status, klantnr FROM bestelheaders WHERE id = ?', [
      params.id,
    ]);
    const header = (headerRows as Array<{ bestelnr: string; status: string; klantnr: string }>)[0];
    if (!header) {
      return NextResponse.json({ error: 'niet-gevonden' }, { status: 404 });
    }
    if (header.status === 'Afgewezen') {
      return NextResponse.json({ error: 'bestelling-op-slot' }, { status: 400 });
    }
    if (REGELSTRUCTUUR_OP_SLOT_STATUSSEN.includes(header.status)) {
      const heeftRegelstructuurWijziging =
        additions.length > 0 || deletions.length > 0 || updates.some((update) => !heeftAlleenPrijs(update));
      if (heeftRegelstructuurWijziging) {
        return NextResponse.json({ error: 'regelstructuur-op-slot' }, { status: 400 });
      }
    }

    // klantId (UUID) is nodig voor berekenBestellijnPrijs's prijsgroep-opzoeking -- bestelheaders
    // zelf staat op klantnr, dus die wordt hier één keer vertaald.
    const [klantRows] = await pool.query('SELECT id FROM klanten WHERE klantnr = ?', [header.klantnr]);
    const klantId = (klantRows as Array<{ id: string }>)[0]?.id ?? null;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const idsOmTeControleren = [...updates.map((u) => u.id), ...deletions];
      if (idsOmTeControleren.length > 0) {
        const [rows] = await connection.query('SELECT id FROM bestellines WHERE id IN (?) AND bestelnr = ?', [
          idsOmTeControleren,
          header.bestelnr,
        ]);
        const gevonden = new Set((rows as Array<{ id: string }>).map((r) => r.id));
        if (idsOmTeControleren.some((id) => !gevonden.has(id))) {
          await connection.rollback();
          return NextResponse.json({ error: 'regel-hoort-niet-bij-bestelling' }, { status: 400 });
        }
      }

      const [countRows] = await connection.query('SELECT COUNT(*) AS n FROM bestellines WHERE bestelnr = ?', [
        header.bestelnr,
      ]);
      const huidigAantal = (countRows as Array<{ n: number }>)[0].n;
      if (huidigAantal - deletions.length + additions.length < 1) {
        await connection.rollback();
        return NextResponse.json({ error: 'bestelling-mag-niet-leeg' }, { status: 400 });
      }

      for (const update of updates) {
        const patch: Record<string, unknown> = {};
        for (const veld of UPDATE_VELDEN) {
          if (update[veld] !== undefined) patch[veld] = update[veld];
        }
        if (Object.keys(patch).length > 0) {
          await updateRow('bestellines', update.id, patch, [], connection);
        }
      }

      // Elke addition dezelfde validatie/prijsberekening als POST /api/bestelheaders --
      // zie berekenBestellijnPrijs in src/lib/server/prijsmodule.ts.
      for (const addition of additions) {
        const [kunstwerkRows] = await connection.query(
          'SELECT code, kunstenaarnr, maatIds, materiaalIds, prijsPerM2 FROM kunstwerken WHERE id = ?',
          [addition.kunstwerkId]
        );
        const kunstwerk = (
          kunstwerkRows as Array<{
            code: string;
            kunstenaarnr: string | null;
            maatIds: string | string[] | null;
            materiaalIds: string | string[] | null;
            prijsPerM2: number | null;
          }>
        )[0];
        if (!kunstwerk) {
          await connection.rollback();
          return NextResponse.json({ error: 'kunstwerk-not-found' }, { status: 400 });
        }
        if (!Number.isInteger(addition.quantity) || addition.quantity <= 0) {
          await connection.rollback();
          return NextResponse.json({ error: 'invalid-quantity' }, { status: 400 });
        }
        const maatIds = parseJsonKolom<string[]>(kunstwerk.maatIds, []);
        const materiaalIds = parseJsonKolom<string[]>(kunstwerk.materiaalIds, []);
        if (materiaalIds.length > 0 && !materiaalIds.includes(addition.materiaalId)) {
          await connection.rollback();
          return NextResponse.json({ error: 'materiaal-niet-beschikbaar' }, { status: 400 });
        }
        if (addition.maatId === '') {
          if (
            !Number.isInteger(addition.breedte) ||
            (addition.breedte as number) <= 0 ||
            !Number.isInteger(addition.hoogte) ||
            (addition.hoogte as number) <= 0
          ) {
            await connection.rollback();
            return NextResponse.json({ error: 'afmeting-vereist' }, { status: 400 });
          }
        } else if (maatIds.length > 0 && !maatIds.includes(addition.maatId)) {
          await connection.rollback();
          return NextResponse.json({ error: 'maat-niet-beschikbaar' }, { status: 400 });
        }

        const resultaat = await berekenBestellijnPrijs(
          connection,
          { kunstenaarnr: kunstwerk.kunstenaarnr, maatIds, prijsPerM2: kunstwerk.prijsPerM2 },
          addition,
          klantId
        );

        await insertRow(
          'bestellines',
          {
            bestelnr: header.bestelnr,
            code: kunstwerk.code,
            maatId: addition.maatId,
            materiaalId: addition.materiaalId,
            prijs: resultaat.status === 'vast' ? resultaat.prijs : null,
            quantity: addition.quantity,
            breedte: addition.breedte ?? null,
            hoogte: addition.hoogte ?? null,
          },
          [],
          connection
        );
      }

      for (const lineId of deletions) {
        await deleteRow('bestellines', lineId, connection);
      }

      if (body.korting !== undefined) {
        await updateRow('bestelheaders', params.id, { korting: body.korting }, [], connection);
      }

      const [lineRows] = await connection.query(
        'SELECT id, code, maatId, materiaalId, prijs, quantity, breedte, hoogte FROM bestellines WHERE bestelnr = ?',
        [header.bestelnr]
      );
      const [kortingRows] = await connection.query('SELECT korting FROM bestelheaders WHERE id = ?', [params.id]);

      await connection.commit();

      return NextResponse.json({
        lines: lineRows,
        korting: (kortingRows as Array<{ korting: number | null }>)[0]?.korting ?? null,
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/app/api/bestelheaders-wijzigen.test.ts`
Expected: PASS, all 10 tests

- [ ] **Step 5: Commit**

```bash
git add src/app/api/bestelheaders/[id]/wijzigen/route.ts tests/app/api/bestelheaders-wijzigen.test.ts
git commit -m "feat: voeg PATCH /api/bestelheaders/[id]/wijzigen toe (regels + korting in één transactie)"
```

---

## Task 4: Retire the old single-line PATCH endpoint

**Files:**
- Delete: `src/app/api/bestelheaders/[id]/bestellines/[lineId]/route.ts`
- Modify: `tests/app/api/bestelheaders.test.ts` (remove the `patchLine` import and its two call sites)

**Interfaces:**
- Consumes: nothing new — this task only removes now-dead surface area now that Task 3's endpoint covers everything it did.

- [ ] **Step 1: Remove the `patchLine` import**

In `tests/app/api/bestelheaders.test.ts:9`, delete:

```ts
import { PATCH as patchLine } from '@/app/api/bestelheaders/[id]/bestellines/[lineId]/route';
```

- [ ] **Step 2: Simplify the "updates header status and a line price" test**

Find the test at `tests/app/api/bestelheaders.test.ts:433` (`'updates header status and a line price as a medewerker'`). Remove the `await patchLine(...)` call (lines 466-473) and its corresponding assertion (`updatedLineRows`/`prijs` check, lines 477-478). Rename the test to `'updates header status as a medewerker'` since it no longer covers line pricing — that's now covered by `tests/app/api/bestelheaders-wijzigen.test.ts` from Task 3. The test becomes:

```ts
  it('updates header status as a medewerker', async () => {
    const { cookie } = await klant('c@example.com');
    const maatId = await maakMaat(46, 66);
    const materiaalId = await maakMateriaal();
    const kunstwerk = await insertRow<{ id: string }>(
      'kunstwerken',
      { code: 'test-bestelheaders-eigenmaat-2', materiaalIds: [materiaalId], maatIds: [maatId] } as never,
      ['materiaalIds', 'maatIds']
    );
    createdKunstwerkIds.push(kunstwerk.id);
    const created = await createHeader(
      postRequest(
        {
          lines: [
            { kunstwerkId: kunstwerk.id, maatId: '', materiaalId, prijs: 1, quantity: 1, breedte: 50, hoogte: 50 },
          ],
        },
        cookie
      )
    );
    const header = await created.json();
    const staffCookie = await medewerkerCookie();

    await patchHeader(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: staffCookie },
        body: JSON.stringify({ status: 'Te versturen naar drukker' }),
      }),
      { params: { id: header.id } }
    );

    const [headerRows] = await getPool().query('SELECT status FROM bestelheaders WHERE id = ?', [header.id]);
    expect((headerRows as Array<{ status: string }>)[0].status).toBe('Te versturen naar drukker');
  });
```

- [ ] **Step 3: Simplify the "rejects patching ... without a medewerker session" test**

Find the test at `tests/app/api/bestelheaders.test.ts:621` (`'rejects patching a header status or line price without a medewerker session'`). Remove the line-fetch setup (the `kunstwerk`/`created`/`lineId` block) since it now exists only to feed the removed `patchLine` call, remove the `lineResponse`/`patchLine` block (lines 655-663), and rename:

```ts
  it('rejects patching a header status without a medewerker session', async () => {
    const { cookie } = await klant('unauth-patch@example.com');
    const created = await createHeader(postRequest({ lines: [] }, cookie));
    const header = await created.json();

    const headerResponse = await patchHeader(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Te versturen naar drukker' }),
      }),
      { params: { id: header.id } }
    );
    expect(headerResponse.status).toBe(401);
  });
```

(The unauthorized case for the new endpoint is already covered by Task 3's `'weigert zonder medewerkersessie'` test.)

- [ ] **Step 4: Delete the old route file**

Run: `rm "src/app/api/bestelheaders/[id]/bestellines/[lineId]/route.ts"`

- [ ] **Step 5: Run the full bestelheaders test file**

Run: `npx vitest run tests/app/api/bestelheaders.test.ts`
Expected: PASS, no reference to `patchLine` remains and nothing else regressed.

- [ ] **Step 6: Commit**

```bash
git add tests/app/api/bestelheaders.test.ts
git rm "src/app/api/bestelheaders/[id]/bestellines/[lineId]/route.ts"
git commit -m "refactor: verwijder het oude single-line PATCH endpoint, vervangen door .../wijzigen"
```

---

## Task 5: `POST /api/mail`, nieuw `soort: 'bestelwijziging'`

**Files:**
- Modify: `src/app/api/mail/route.ts`
- Test: `tests/app/api/mail.test.ts`

**Interfaces:**
- Consumes: `berekenBestellingTotalen` (Task 2), `resolveBtwPercentage` (`src/lib/resolveBtw.ts`), `formatCurrency` (`src/lib/formatCurrency.ts`), `verstuurMail` (`src/lib/server/mailRelay.ts`).
- Produces: `POST /api/mail` accepting `{ soort: 'bestelwijziging', bestelheaderId: string }` — consumed by Task 10 (`BestellingModal.tsx`'s mail-confirmation dialog).

The current handler validates `subject`/`body` from the request body *before* branching on `soort` (`src/app/api/mail/route.ts:32-34`). The new soort builds its own subject/body server-side and never receives them from the client, so that check must move inside the `'bestelbevestiging'`/`'drukker'` branches instead of gating every soort up front.

- [ ] **Step 1: Write the failing tests**

Add to `tests/app/api/mail.test.ts` (needs `insertRow` for `bestelheaders`/`bestellines`, already imported; add a cleanup array and BTW-tarief seeding):

```ts
const createdHeaderIds: string[] = [];
```

Add to the existing `afterEach` (alongside the existing cleanup blocks):

```ts
  if (createdHeaderIds.length > 0) {
    await getPool().query('DELETE FROM bestelheaders WHERE id IN (?)', [createdHeaderIds]);
    createdHeaderIds.length = 0;
  }
```

Add new test cases inside `describe('POST /api/mail', ...)`:

```ts
  it('weigert een wijzigingsmail zonder medewerkersessie', async () => {
    const response = await postMail(req({ soort: 'bestelwijziging', bestelheaderId: 'maakt-niet-uit' }));
    expect(response.status).toBe(401);
    expect(verstuurMailMock).not.toHaveBeenCalled();
  });

  it('stuurt een wijzigingsmail naar het e-mailadres van de klant, opgebouwd uit de actuele bestelling in de database', async () => {
    const cookie = await medewerkerCookie();
    const klant = await insertRow<{ id: string; klantnr: string }>('klanten', {
      email: 'mailtest-wijziging@example.com',
      wachtwoordHash: 'x:y',
      status: 'Goedgekeurd',
      klantnr: 'AUTOTEST-mailtest-wijziging',
    } as never);
    createdKlantIds.push(klant.id);
    const header = await insertRow<{ id: string; bestelnr: string }>('bestelheaders', {
      klantnr: klant.klantnr,
      bestelnr: 'AUTOTEST-BE-mailtest-wijziging',
      status: 'Te beoordelen',
      korting: 25,
    } as never);
    createdHeaderIds.push(header.id);
    await insertRow('bestellines', {
      bestelnr: header.bestelnr,
      code: 'AUTOTEST-mail-regel',
      maatId: null,
      materiaalId: null,
      prijs: 100,
      quantity: 2,
    } as never);

    const response = await postMail(
      req({ soort: 'bestelwijziging', bestelheaderId: header.id, to: 'aanvaller@example.com' }, cookie)
    );

    expect(response.status).toBe(200);
    expect(verstuurMailMock).toHaveBeenCalledTimes(1);
    const call = verstuurMailMock.mock.calls[0][0];
    expect(call.to).toBe('mailtest-wijziging@example.com');
    expect(call.html).toContain('AUTOTEST-BE-mailtest-wijziging');
    expect(call.html).toContain('25');
  });

  it('geeft 400 wanneer de bestelling van een wijzigingsmail geen bestaande klant-e-mail heeft', async () => {
    const cookie = await medewerkerCookie();
    const header = await insertRow<{ id: string; bestelnr: string }>('bestelheaders', {
      klantnr: 'AUTOTEST-onbestaande-klantnr',
      bestelnr: 'AUTOTEST-BE-mailtest-geenklant',
      status: 'Te beoordelen',
    } as never);
    createdHeaderIds.push(header.id);

    const response = await postMail(req({ soort: 'bestelwijziging', bestelheaderId: header.id }, cookie));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'geen-ontvanger' });
    expect(verstuurMailMock).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/app/api/mail.test.ts`
Expected: FAIL — the new tests get a 400 `invalid-body` (from the current up-front `subject`/`body` check) instead of the expected statuses.

- [ ] **Step 3: Write the implementation**

Modify `src/app/api/mail/route.ts`. Replace the whole file body from the type union onward:

```ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { requireKlant, requireMedewerker } from '@/lib/server/requireAuth';
import { withApiErrorHandling } from '@/lib/server/apiRoute';
import { verstuurMail } from '@/lib/server/mailRelay';
import { parseJsonKolom } from '@/lib/server/crud';
import { berekenBestellingTotalen } from '@/lib/bestellingTotalen';
import { resolveBtwPercentage } from '@/lib/resolveBtw';
import { formatCurrency } from '@/lib/formatCurrency';

/**
 * Server-side proxy voor de PHP-mailrelay.
 * ... (bestaande commentaarblok blijft ongewijzigd)
 */
type MailVerzoek =
  | { soort: 'bestelbevestiging'; subject: string; body: string }
  | { soort: 'drukker'; drukkerId: string; subject: string; body: string; html?: string }
  | { soort: 'bestelwijziging'; bestelheaderId: string };

function isNietLegeString(waarde: unknown): waarde is string {
  return typeof waarde === 'string' && waarde.trim() !== '';
}

interface BestellijnRij {
  code: string;
  prijs: number | null;
  quantity: number;
}

function bouwWijzigingsmailHtml(bestelnr: string, lines: BestellijnRij[], totalen: ReturnType<typeof berekenBestellingTotalen>): string {
  const regelsHtml = lines
    .map(
      (line) =>
        `<tr><td>${line.code}</td><td>${line.quantity}</td><td>${
          line.prijs != null ? formatCurrency(line.prijs) : 'op aanvraag'
        }</td><td>${line.prijs != null ? formatCurrency(line.prijs * line.quantity) : ''}</td></tr>`
    )
    .join('');
  const kortingRegel =
    totalen.korting > 0 ? `<p>Korting: ${formatCurrency(totalen.korting)}</p>` : '';
  const totaalRegel =
    totalen.totaalExclBtw != null
      ? `<p>Totaal excl. btw: ${formatCurrency(totalen.totaalExclBtw)}</p>`
      : '<p>Totaal: wordt nog vastgesteld</p>';
  const btwRegel =
    totalen.btwBedrag != null && totalen.totaalInclBtw != null
      ? `<p>Btw (${totalen.btwPercentage}%): ${formatCurrency(totalen.btwBedrag)}</p><p>Totaal incl. btw: ${formatCurrency(totalen.totaalInclBtw)}</p>`
      : '';
  return `<h1>Bestelling ${bestelnr} is gewijzigd</h1><table><thead><tr><th>Omschrijving</th><th>Aantal</th><th>Prijs</th><th>Regeltotaal</th></tr></thead><tbody>${regelsHtml}</tbody></table>${kortingRegel}${totaalRegel}${btwRegel}`;
}

export const POST = withApiErrorHandling('POST /api/mail', async (request: Request) => {
  const verzoek = (await request.json()) as Partial<MailVerzoek>;

  if (verzoek.soort === 'bestelbevestiging') {
    if (!isNietLegeString(verzoek.subject) || !isNietLegeString(verzoek.body)) {
      return NextResponse.json({ error: 'invalid-body' }, { status: 400 });
    }
    const klantId = await requireKlant(request);
    if (!klantId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const [rows] = await getPool().query('SELECT email FROM klanten WHERE id = ?', [klantId]);
    const email = (rows as Array<{ email: string | null }>)[0]?.email;
    if (!isNietLegeString(email)) {
      return NextResponse.json({ error: 'geen-ontvanger' }, { status: 400 });
    }
    const verzonden = await verstuurMail({ to: email, subject: verzoek.subject, body: verzoek.body });
    return verzonden
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: 'mail-mislukt' }, { status: 502 });
  }

  if (verzoek.soort === 'drukker') {
    if (!isNietLegeString(verzoek.subject) || !isNietLegeString(verzoek.body)) {
      return NextResponse.json({ error: 'invalid-body' }, { status: 400 });
    }
    if (!(await requireMedewerker(request))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (!isNietLegeString(verzoek.drukkerId)) {
      return NextResponse.json({ error: 'invalid-body' }, { status: 400 });
    }
    const [rows] = await getPool().query('SELECT email FROM drukkers WHERE id = ?', [verzoek.drukkerId]);
    const email = (rows as Array<{ email: string | null }>)[0]?.email;
    if (!isNietLegeString(email)) {
      return NextResponse.json({ error: 'geen-ontvanger' }, { status: 400 });
    }
    const verzonden = await verstuurMail({
      to: email,
      subject: verzoek.subject,
      body: verzoek.body,
      ...(isNietLegeString(verzoek.html) ? { html: verzoek.html } : {}),
    });
    return verzonden
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: 'mail-mislukt' }, { status: 502 });
  }

  if (verzoek.soort === 'bestelwijziging') {
    if (!(await requireMedewerker(request))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (!isNietLegeString(verzoek.bestelheaderId)) {
      return NextResponse.json({ error: 'invalid-body' }, { status: 400 });
    }
    const pool = getPool();
    const [headerRows] = await pool.query('SELECT bestelnr, klantnr, korting FROM bestelheaders WHERE id = ?', [
      verzoek.bestelheaderId,
    ]);
    const header = (headerRows as Array<{ bestelnr: string; klantnr: string; korting: number | null }>)[0];
    if (!header) {
      return NextResponse.json({ error: 'geen-ontvanger' }, { status: 400 });
    }
    const [klantRows] = await pool.query('SELECT email, land, invoiceLand FROM klanten WHERE klantnr = ?', [
      header.klantnr,
    ]);
    const klant = (klantRows as Array<{ email: string | null; land: string | null; invoiceLand: string | null }>)[0];
    if (!klant || !isNietLegeString(klant.email)) {
      return NextResponse.json({ error: 'geen-ontvanger' }, { status: 400 });
    }
    const [instellingenRows] = await pool.query("SELECT data FROM instellingen WHERE id = 'btwtarieven'");
    const instellingenRow = (instellingenRows as Array<{ data: string | object }>)[0];
    const btwData = instellingenRow ? parseJsonKolom<{ tarieven?: Array<{ land: string; percentage: number }> }>(instellingenRow.data, {}) : {};
    const btwPercentage = resolveBtwPercentage(btwData.tarieven ?? [], klant.invoiceLand || klant.land || null);

    const [lineRows] = await pool.query('SELECT code, prijs, quantity FROM bestellines WHERE bestelnr = ?', [
      header.bestelnr,
    ]);
    const lines = lineRows as BestellijnRij[];
    const totalen = berekenBestellingTotalen(lines, header.korting, btwPercentage);

    const subject = `Bestelling ${header.bestelnr} is gewijzigd`;
    const html = bouwWijzigingsmailHtml(header.bestelnr, lines, totalen);
    const verzonden = await verstuurMail({ to: klant.email, subject, body: subject, html });
    return verzonden
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: 'mail-mislukt' }, { status: 502 });
  }

  return NextResponse.json({ error: 'onbekende-soort' }, { status: 400 });
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/app/api/mail.test.ts`
Expected: PASS, all tests including the 3 new ones and every pre-existing one (confirms the validation-reordering didn't break `'bestelbevestiging'`/`'drukker'`/onbekende-soort/leeg-subject cases).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/mail/route.ts tests/app/api/mail.test.ts
git commit -m "feat: voeg soort 'bestelwijziging' toe aan POST /api/mail, server bouwt inhoud zelf"
```

---

## Task 6: Type & callback plumbing (`BestellingenSection.tsx`, `BeheerShell.tsx`)

**Files:**
- Modify: `src/components/beheer/BestellingenSection.tsx`
- Modify: `src/components/beheer/BeheerShell.tsx`
- Modify: `tests/components/beheer/BestellingenSection.test.tsx`

**Interfaces:**
- Produces: `Bestelling.korting: number | null` (new field), `BestellingModal`'s `onBestellingGewijzigd: (bestelling: Bestelling) => void` prop (replaces `onLinePrijsVastgesteld`/`onLineUpdated`) — consumed by Task 7-10's `BestellingModal.tsx` changes.
- Consumes: nothing new from earlier tasks; this is pure plumbing ahead of the modal rewrite so Task 7+ has a stable prop contract to build against.

- [ ] **Step 1: Add `korting` to the `Bestelling` type**

In `src/components/beheer/BestellingenSection.tsx`, in the `Bestelling` interface (around line 30-41), add the field after `zendingnummer`:

```ts
export interface Bestelling {
  id: string;
  klantnr: string;
  companyName: string;
  bestelnr: string;
  zendingnummer?: string | null;
  korting: number | null;
  besteldatum: string;
  status: 'Te beoordelen' | 'Te versturen naar drukker' | 'Verstuurd naar drukker' | 'Te factureren' | 'Betaald en afgerond' | 'Afgewezen';
  lineCount: number;
  totalQuantity: number;
  lines: BestellingLine[];
  afwijsreden?: string | null;
}
```

- [ ] **Step 2: Replace `onLinePrijsVastgesteld`/`onLineUpdated` with `onBestellingGewijzigd` in the props interface**

In the same file's props interface (around line 43-56), remove:

```ts
  onLinePrijsVastgesteld: (bestellingId: string, lineId: string, prijs: number) => void;
  onLineUpdated: (bestellingId: string, lineId: string, updates: Partial<BestellingLine>) => void;
```

`BestellingenSection`'s own external props stay unchanged otherwise — it still only exposes `onBestellingUpdated` upward; the internal modal wiring changes, not the section's own contract.

- [ ] **Step 3: Replace the two internal handlers with one**

Remove `handleLinePrijsVastgesteld`/`handleLineUpdated` (around lines 156-172). Add:

```ts
  // Anders dan handleBestellingUpdated (dat ook de modal sluit voor statuswijzigingen),
  // moet de modal na een "Wijzigingen opslaan" open blijven -- de medewerker ziet meteen
  // het resultaat en krijgt de mail-vraag terwijl de modal nog open staat.
  function handleBestellingGewijzigd(updated: Bestelling) {
    onBestellingUpdated(updated);
    setSelectedBestelling(updated);
  }
```

- [ ] **Step 4: Update the `BestellingModal` render call**

Around line 445-474, remove:

```ts
        onLinePrijsVastgesteld={handleLinePrijsVastgesteld}
        onLineUpdated={handleLineUpdated}
```

and add:

```ts
        onBestellingGewijzigd={handleBestellingGewijzigd}
```

- [ ] **Step 5: Update `BeheerShell.tsx`'s data loading to include `korting`**

In the `loadBestellingen` effect (around line 82-121), the response type and mapping both need `korting`. Change the inline response type:

```ts
        const headers = (await response.json()) as Array<{
          id: string;
          klantnr: string;
          bestelnr: string;
          zendingnummer?: string | null;
          korting: number | null;
          besteldatum: string;
          status: string;
          lines: BestellingLine[];
        }>;
```

and the mapping:

```ts
          setRawBestellingen(
            headers.map((header) => ({
              id: header.id,
              klantnr: header.klantnr,
              bestelnr: header.bestelnr ?? header.id,
              zendingnummer: header.zendingnummer ?? null,
              korting: header.korting ?? null,
              besteldatum: new Date(header.besteldatum).toLocaleDateString('nl-NL'),
              status: header.status,
              lineCount: header.lines.length,
              totalQuantity: header.lines.reduce((sum, line) => sum + (line.quantity ?? 0), 0),
              lines: header.lines,
            })) as RawBestelling[]
          );
```

- [ ] **Step 6: Extend `handleBestellingUpdated` and remove the two obsolete handlers**

Replace (around line 197-223):

```ts
  function handleBestellingUpdated(updated: Bestelling) {
    setRawBestellingen((current) =>
      (current ?? []).map((row) =>
        row.id === updated.id ? { ...row, status: updated.status, zendingnummer: updated.zendingnummer ?? row.zendingnummer } : row
      )
    );
  }

  function handleLinePrijsVastgesteld(bestellingId: string, lineId: string, prijs: number) {
    setRawBestellingen((current) =>
      (current ?? []).map((row) =>
        row.id === bestellingId
          ? { ...row, lines: row.lines.map((line) => (line.id === lineId ? { ...line, prijs } : line)) }
          : row
      )
    );
  }

  function handleLineUpdated(bestellingId: string, lineId: string, updates: Partial<BestellingLine>) {
    setRawBestellingen((current) =>
      (current ?? []).map((row) =>
        row.id === bestellingId
          ? { ...row, lines: row.lines.map((line) => (line.id === lineId ? { ...line, ...updates } : line)) }
          : row
      )
    );
  }
```

with:

```ts
  function handleBestellingUpdated(updated: Bestelling) {
    setRawBestellingen((current) =>
      (current ?? []).map((row) =>
        row.id === updated.id
          ? {
              ...row,
              status: updated.status,
              zendingnummer: updated.zendingnummer ?? row.zendingnummer,
              afwijsreden: updated.afwijsreden ?? row.afwijsreden,
              korting: updated.korting,
              lines: updated.lines,
              lineCount: updated.lines.length,
              totalQuantity: updated.lines.reduce((sum, line) => sum + line.quantity, 0),
            }
          : row
      )
    );
  }
```

- [ ] **Step 7: Remove the now-unused props passed to `BestellingenSection`**

Find the `<BestellingenSection ... />` render call and remove `onLinePrijsVastgesteld={handleLinePrijsVastgesteld}`/`onLineUpdated={handleLineUpdated}` props if present there.

- [ ] **Step 8: Update `BestellingenSection.test.tsx`'s `renderSection` helper**

Around lines 135-165, remove the `onLinePrijsVastgesteld`/`onLineUpdated` mocks and props, and their entry in the returned object:

```ts
  const onBestellingUpdated = vi.fn();
  // ... (remove onLinePrijsVastgesteld, onLineUpdated)
```

```ts
        <BestellingenSection
          ...
          onBestellingUpdated={onBestellingUpdated}
          // (remove onLinePrijsVastgesteld/onLineUpdated props)
          ...
        />
```

```ts
  return { onBestellingUpdated, rerender };
```

- [ ] **Step 9: Rewrite the one test that asserted `onLinePrijsVastgesteld`**

Find the test around line 248 (`const { onLinePrijsVastgesteld } = renderSection(...)`). This test exercises "prijs vaststellen" through the modal — since that flow moves to the draft/save model in Task 8, leave this specific test's *content* to be rewritten in Task 8 once the new UI exists (that task owns the interaction pattern). For now, delete this test entirely (it will be replaced by an equivalent in Task 8's `BestellingModal.test.tsx`, and `BestellingenSection` itself has no more special-cased prijs-vaststellen wiring after Step 3 — the section-level integration is exercised elsewhere in this file via the generic `onBestellingUpdated` assertions).

- [ ] **Step 10: Run affected tests**

Run: `npx vitest run tests/components/beheer/BestellingenSection.test.tsx`
Expected: FAIL at this point — `BestellingModal` itself still expects the old `onLinePrijsVastgesteld`/`onLineUpdated` props (TypeScript error / missing-prop). This is expected: Task 7 updates `BestellingModal.tsx`'s prop contract next. Confirm the failure is specifically about `BestellingModal`'s props, not something else in this file, then proceed.

- [ ] **Step 11: Commit**

```bash
git add src/components/beheer/BestellingenSection.tsx src/components/beheer/BeheerShell.tsx tests/components/beheer/BestellingenSection.test.tsx
git commit -m "refactor: voeg korting toe aan Bestelling en vervang line-callbacks door onBestellingGewijzigd"
```

(This commit intentionally leaves `BestellingModal.tsx` not yet updated — Task 7 fixes the resulting type error immediately next. If your workflow requires every commit to leave `npm test` green, squash Task 6 and Task 7 into one commit instead.)

---

## Task 7: `BestellingModal.tsx` — totals via `bestellingTotalen` + korting display + new prop contract

**Files:**
- Modify: `src/components/beheer/BestellingModal.tsx`
- Modify: `tests/components/beheer/BestellingModal.test.tsx`

**Interfaces:**
- Consumes: `berekenBestellingTotalen` (Task 2), `Bestelling.korting` and `onBestellingGewijzigd` prop (Task 6).
- Produces: `BestellingModal`'s props no longer include `onLinePrijsVastgesteld`/`onLineUpdated`; totals block now reads from `berekenBestellingTotalen`, and shows a korting line when korting is non-zero. This task does NOT yet implement editing korting/adding/removing lines — that's Tasks 8-9. It only wires the type/display layer so the file compiles again and the totals math is correct.

- [ ] **Step 1: Update the props interface**

In `src/components/beheer/BestellingModal.tsx` (around lines 36-53), replace:

```ts
  onLinePrijsVastgesteld: (bestellingId: string, lineId: string, prijs: number) => void;
  onLineUpdated: (bestellingId: string, lineId: string, updates: Partial<BestellingLine>) => void;
```

with:

```ts
  onBestellingGewijzigd: (bestelling: Bestelling) => void;
```

- [ ] **Step 2: Update the component's destructured props**

Change the function signature (around line 68-82) to drop `onLinePrijsVastgesteld`/`onLineUpdated` and add `onBestellingGewijzigd`.

- [ ] **Step 3: Replace the inline totals calculation with `berekenBestellingTotalen`**

Replace (around lines 107-123):

```ts
  const heeftOngeprijsdeRegel = (bestelling?.lines ?? []).some((line) => line.prijs === null);
  const totaalWeergave =
    bestelling && bestelling.lines.length > 0
      ? heeftOngeprijsdeRegel
        ? t('bestellingenModalTotalIncomplete')
        : formatCurrency(bestelling.lines.reduce((sum, line) => sum + (line.prijs ?? 0) * line.quantity, 0))
      : null;
  const totaalExclBtwGetal =
    bestelling && !heeftOngeprijsdeRegel
      ? bestelling.lines.reduce((sum, line) => sum + (line.prijs ?? 0) * line.quantity, 0)
      : null;
  const klant = bestelling ? (klanten ?? []).find((k) => k.klantnr === bestelling.klantnr) : undefined;
  const land = klant ? klant.invoiceLand || klant.land || null : null;
  const btwPercentage = btwTarieven ? resolveBtwPercentage(btwTarieven.tarieven, land) : null;
  const btwBedrag =
    totaalExclBtwGetal !== null && btwPercentage != null ? totaalExclBtwGetal * (btwPercentage / 100) : null;
  const totaalInclBtw = totaalExclBtwGetal !== null && btwBedrag !== null ? totaalExclBtwGetal + btwBedrag : null;
```

with:

```ts
  const klant = bestelling ? (klanten ?? []).find((k) => k.klantnr === bestelling.klantnr) : undefined;
  const land = klant ? klant.invoiceLand || klant.land || null : null;
  const klantBtwPercentage = btwTarieven ? resolveBtwPercentage(btwTarieven.tarieven, land) : null;
  const totalen = bestelling
    ? berekenBestellingTotalen(bestelling.lines, bestelling.korting, klantBtwPercentage)
    : null;
  const heeftOngeprijsdeRegel = totalen?.heeftOngeprijsdeRegel ?? false;
  const totaalWeergave =
    bestelling && bestelling.lines.length > 0
      ? heeftOngeprijsdeRegel
        ? t('bestellingenModalTotalIncomplete')
        : formatCurrency(totalen!.totaalExclBtw!)
      : null;
  const btwPercentage = totalen?.btwPercentage ?? null;
  const btwBedrag = totalen?.btwBedrag ?? null;
  const totaalInclBtw = totalen?.totaalInclBtw ?? null;
```

Add the import at the top of the file: `import { berekenBestellingTotalen } from '@/lib/bestellingTotalen';`

Note this preserves the existing display semantics: `bestelling-modal-total` shows the line-sum-minus-korting (not incl. btw) exactly as it did before korting existed (when korting is 0/null this is identical to the old value), and the existing `bestelling-modal-total` testid keeps meaning "totaal excl. btw" as today.

- [ ] **Step 4: Add a korting row to the totals display**

In the subtitle's totals grid (around lines 305-337), after the `bestellingenModalTotalLabel` row, add a conditional korting row:

```tsx
                {totalen && totalen.korting > 0 && (
                  <div data-testid="bestelling-modal-korting" className="contents">
                    <span className="text-[0.65rem] uppercase tracking-wide text-white/40">
                      {t('bestellingenModalKortingLabel')}
                    </span>
                    <span className="text-right text-sm text-white/80 tabular-nums">
                      -{formatCurrency(totalen.korting)}
                    </span>
                  </div>
                )}
```

Place it right after the closing of the `totaalWeergave`/`bestelling-modal-total` block and before the `btwBedrag !== null` block, so the order reads: totaal, korting, btw, totaal incl.

- [ ] **Step 5: Add the new translation key**

In `messages/nl.json`, `beheer` block, add near `bestellingenModalTotalLabel`:

```json
    "bestellingenModalKortingLabel": "Korting",
```

- [ ] **Step 6: Update `tests/components/beheer/BestellingModal.test.tsx`'s `renderModal` helper and every fixture**

In `renderModal` (around lines 96-125), replace:

```ts
  const onLinePrijsVastgesteld = vi.fn();
  const onLineUpdated = vi.fn();
```
```ts
        onLinePrijsVastgesteld={onLinePrijsVastgesteld}
        onLineUpdated={onLineUpdated}
```
```ts
  return { onClose, onUpdated, onAfronden, onLinePrijsVastgesteld, onLineUpdated };
```

with:

```ts
  const onBestellingGewijzigd = vi.fn();
```
```ts
        onBestellingGewijzigd={onBestellingGewijzigd}
```
```ts
  return { onClose, onUpdated, onAfronden, onBestellingGewijzigd };
```

Then, for every fixture object typed as `Bestelling` in this file (`BESTELLING`, `BESTELLING_MET_EIGEN_MAAT`, the inline `BESTELLING_MET_TWEE_ONGEPRIJSDE_REGELS`, `BESTELLING_VERSTUURD`), add `korting: null,` (place it next to `zendingnummer`/near the top of each object literal).

Also update every inline `<BestellingModal ... />` render call in this file that isn't going through `renderModal()` (there are several standalone ones in the btw `describe` block, e.g. around lines 580-599 and 610-632) — remove their `onLinePrijsVastgesteld`/`onLineUpdated` props and add `onBestellingGewijzigd={vi.fn()}`.

And the `Wrapper` component inside the `'keeps the draft price...'` test (around lines 421-446): this test exercises the *old* prijs-vaststellen flow end-to-end and will be superseded by Task 8's rewrite of the "eigen maat / offerte pricing" describe block. Delete this test now (`'keeps the draft price of a still-unpriced line after submitting another line\'s price in the same order'`) — Task 8 re-adds equivalent coverage under the new draft/save model.

- [ ] **Step 7: Add a korting-display test**

Add to the `'BestellingModal — bestelling-totaal'` describe block:

```ts
  it('shows a korting row and subtracts it from the total when korting is set', () => {
    renderModal({ ...BESTELLING, korting: 50 });
    // line-1: 150 × 3 = 450, line-2: 0 × 2 = 0, korting 50 → 400
    expect(screen.getByTestId('bestelling-modal-total')).toHaveTextContent('€ 400,00');
    expect(screen.getByTestId('bestelling-modal-korting')).toHaveTextContent('€ 50,00');
  });

  it('shows no korting row when korting is null', () => {
    renderModal(BESTELLING);
    expect(screen.queryByTestId('bestelling-modal-korting')).not.toBeInTheDocument();
  });
```

- [ ] **Step 8: Run the tests**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx`

Expected: some tests still reference `bestelling-modal-prijs-vaststellen-*`/`bestelling-modal-regel-opslaan-*` flows that still work exactly as before at this point (Task 7 hasn't touched those handlers yet) — those should still PASS. The two new korting tests and the total-shows-korting math should PASS. If any test still references `onLinePrijsVastgesteld`/`onLineUpdated` that Step 6 missed, fix it now.

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx tests/components/beheer/BestellingenSection.test.tsx`
Expected: PASS (this also confirms Task 6's Step 10 failure is now resolved).

- [ ] **Step 9: Commit**

```bash
git add src/components/beheer/BestellingModal.tsx tests/components/beheer/BestellingModal.test.tsx messages/nl.json
git commit -m "refactor: bereken BestellingModal-totalen via bestellingTotalen, toon korting-regel"
```

---

## Task 8: `BestellingModal.tsx` — conceptstaat, regel bewerken/prijs vaststellen als draft, "Wijzigingen opslaan"

**Files:**
- Modify: `src/components/beheer/BestellingModal.tsx`
- Modify: `tests/components/beheer/BestellingModal.test.tsx`
- Modify: `src/lib/logActiviteit.ts`

**Interfaces:**
- Consumes: `PATCH /api/bestelheaders/[id]/wijzigen` (Task 3), `onBestellingGewijzigd` prop (Task 7).
- Produces: local `concept` state (`updates`, `korting`) and a "Wijzigingen opslaan" button — consumed by Task 9 (which extends `concept` with `deletions`/`additions`) and Task 10 (which triggers after a successful save).

This task converts the *existing* per-line edit (`handleOpslaanRegel`) and prijs-vaststellen (`handlePrijsVaststellen`) flows from "PATCH immediately" to "write into a draft, PATCH only on Wijzigingen opslaan". It does not yet add regel-toevoegen/verwijderen (Task 9) or the mail dialog (Task 10).

- [ ] **Step 1: Add `logActiviteit`'s new type**

In `src/lib/logActiviteit.ts`, add `'bestelling_gewijzigd'` to `ACTIVITEIT_TYPES`, placed next to the other `bestelling_*` entries (after `'bestelling_gefactureerd'`, the last one in that group per the existing order).

- [ ] **Step 2: Write the failing tests**

Replace the `'BestellingModal — eigen maat / offerte pricing'` describe block's prijs-vaststellen test and the `'BestellingModal — regel bewerken'` describe block's save test with versions that expect draft-then-batch-save behavior. Full replacement content for both blocks:

```ts
describe('BestellingModal — eigen maat / offerte pricing', () => {
  it('shows the custom breedte×hoogte and "Prijs op aanvraag" for an unpriced line, and disables Goedkeuren', () => {
    renderModal(BESTELLING_MET_EIGEN_MAAT);
    const line = screen.getByTestId('bestelling-modal-line-line-3');
    expect(line).toHaveTextContent('90×140 cm');
    expect(line).toHaveTextContent('Prijs op aanvraag');
    expect(screen.getByTestId('bestelling-modal-goedkeuren')).toBeDisabled();
    expect(screen.getByTestId('bestelling-modal-goedkeuren-blocked')).toHaveTextContent(
      'Alle regels moeten eerst een prijs krijgen voordat u kunt goedkeuren.'
    );
  });

  it('keeps the "Prijs vaststellen" button disabled until a positive number is entered', () => {
    renderModal(BESTELLING_MET_EIGEN_MAAT);
    expect(screen.getByTestId('bestelling-modal-prijs-vaststellen-line-3')).toBeDisabled();
    fireEvent.change(screen.getByTestId('bestelling-modal-prijs-input-line-3'), { target: { value: '0' } });
    expect(screen.getByTestId('bestelling-modal-prijs-vaststellen-line-3')).toBeDisabled();
    fireEvent.change(screen.getByTestId('bestelling-modal-prijs-input-line-3'), { target: { value: '275' } });
    expect(screen.getByTestId('bestelling-modal-prijs-vaststellen-line-3')).not.toBeDisabled();
  });

  it('drafts a price via "Prijs vaststellen" without patching immediately, shows it as pending, and saves it on Wijzigingen opslaan', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const { onBestellingGewijzigd } = renderModal(BESTELLING_MET_EIGEN_MAAT);
    fireEvent.change(screen.getByTestId('bestelling-modal-prijs-input-line-3'), { target: { value: '275' } });
    fireEvent.click(screen.getByTestId('bestelling-modal-prijs-vaststellen-line-3'));

    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/wijzigen'),
      expect.anything()
    );
    expect(screen.getByTestId('bestelling-modal-wijzigingen-opslaan')).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ lines: [{ ...BESTELLING_MET_EIGEN_MAAT.lines[0], prijs: 275 }], korting: null }),
    });
    fireEvent.click(screen.getByTestId('bestelling-modal-wijzigingen-opslaan'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-2/wijzigen',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ korting: null, updates: [{ id: 'line-3', prijs: 275 }], additions: [], deletions: [] }),
        })
      )
    );
    await waitFor(() =>
      expect(onBestellingGewijzigd).toHaveBeenCalledWith({
        ...BESTELLING_MET_EIGEN_MAAT,
        lines: [{ ...BESTELLING_MET_EIGEN_MAAT.lines[0], prijs: 275 }],
        korting: null,
      })
    );
    expect(logActiviteitMock).toHaveBeenCalledWith('bestelling_gewijzigd', 'GD-00102');
  });

  it('does not disable Goedkeuren when every line already has a price', () => {
    renderModal(BESTELLING);
    expect(screen.getByTestId('bestelling-modal-goedkeuren')).not.toBeDisabled();
    expect(screen.queryByTestId('bestelling-modal-goedkeuren-blocked')).not.toBeInTheDocument();
  });
});

describe('BestellingModal — regel bewerken', () => {
  it('keeps line fields read-only until Bewerken is clicked, and hides Bewerken for an unresolved kunstwerk', () => {
    renderModal(BESTELLING);
    expect(screen.queryByTestId('bestelling-modal-regel-materiaal-line-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('bestelling-modal-regel-bewerken-line-1')).toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-regel-bewerken-line-2')).not.toBeInTheDocument();
  });

  it('drafts materiaal/maat/prijs/aantal edits without patching immediately, then saves them all on Wijzigingen opslaan', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const { onBestellingGewijzigd } = renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-bewerken-line-1'));
    fireEvent.change(screen.getByTestId('bestelling-modal-regel-prijs-line-1'), { target: { value: '180' } });
    fireEvent.change(screen.getByTestId('bestelling-modal-regel-aantal-line-1'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-opslaan-line-1'));

    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/wijzigen'), expect.anything());
    expect(screen.queryByTestId('bestelling-modal-regel-materiaal-line-1')).not.toBeInTheDocument();

    const bijgewerkteRegel = { ...BESTELLING.lines[0], materiaalId: 'mat-1', prijs: 180, quantity: 5, maatId: 'maat-1' };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ lines: [bijgewerkteRegel, BESTELLING.lines[1]], korting: null }),
    });
    fireEvent.click(screen.getByTestId('bestelling-modal-wijzigingen-opslaan'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-1/wijzigen',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            korting: null,
            updates: [{ id: 'line-1', materiaalId: 'mat-1', prijs: 180, quantity: 5, maatId: 'maat-1' }],
            additions: [],
            deletions: [],
          }),
        })
      )
    );
    await waitFor(() =>
      expect(onBestellingGewijzigd).toHaveBeenCalledWith({
        ...BESTELLING,
        lines: [bijgewerkteRegel, BESTELLING.lines[1]],
        korting: null,
      })
    );
    expect(logActiviteitMock).toHaveBeenCalledWith('bestelling_gewijzigd', 'GD-00101');
  });

  it('discards edits when Annuleren is clicked, and does not show a Wijzigingen opslaan button', () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-bewerken-line-1'));
    fireEvent.change(screen.getByTestId('bestelling-modal-regel-aantal-line-1'), { target: { value: '9' } });
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-annuleren-line-1'));
    expect(screen.queryByTestId('bestelling-modal-regel-materiaal-line-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('bestelling-modal-line-line-1')).toHaveTextContent('3 × € 150,00');
    expect(screen.queryByTestId('bestelling-modal-wijzigingen-opslaan')).not.toBeInTheDocument();
  });

  it('shows breedte/hoogte inputs instead of a maat select for a custom-size line, and drafts them', () => {
    renderModal(BESTELLING_MET_EIGEN_MAAT);
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-bewerken-line-3'));
    expect(screen.queryByTestId('bestelling-modal-regel-maat-line-3')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('bestelling-modal-regel-breedte-line-3'), { target: { value: '95' } });
    fireEvent.change(screen.getByTestId('bestelling-modal-regel-hoogte-line-3'), { target: { value: '145' } });
    fireEvent.change(screen.getByTestId('bestelling-modal-regel-prijs-line-3'), { target: { value: '300' } });
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-opslaan-line-3'));
    expect(screen.getByTestId('bestelling-modal-wijzigingen-opslaan')).toBeInTheDocument();
  });

  it('does not show Wijzigingen opslaan when nothing has been drafted', () => {
    renderModal(BESTELLING);
    expect(screen.queryByTestId('bestelling-modal-wijzigingen-opslaan')).not.toBeInTheDocument();
  });

  it('shows an error and keeps the draft when the save request fails', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('/wijzigen') ? Promise.reject(new Error('offline')) : { ok: true, json: async () => [] }
    );
    const { onBestellingGewijzigd } = renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-bewerken-line-1'));
    fireEvent.change(screen.getByTestId('bestelling-modal-regel-aantal-line-1'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-opslaan-line-1'));
    fireEvent.click(screen.getByTestId('bestelling-modal-wijzigingen-opslaan'));

    expect(await screen.findByTestId('bestelling-modal-error')).toBeInTheDocument();
    expect(onBestellingGewijzigd).not.toHaveBeenCalled();
    expect(screen.getByTestId('bestelling-modal-wijzigingen-opslaan')).toBeInTheDocument();
  });
});
```

Note the `fetchMock.mockResolvedValueOnce` calls above stack on top of the `beforeEach`'s default `fetchMock.mockResolvedValue({ ok: true, json: async () => [] })` — the `Once` variant intercepts just the next call (the `/wijzigen` PATCH), while the mount-time `/statushistorie` GET still gets the default empty-array response.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx`
Expected: FAIL — no `bestelling-modal-wijzigingen-opslaan` testid exists yet, and the immediate-PATCH assertions from the old tests are gone (replaced), so failures should be about the new draft-save behavior not existing yet.

- [ ] **Step 4: Implement the concept state and draft-based editing**

In `src/components/beheer/BestellingModal.tsx`:

Add new state near the existing `editingLineId`/`lineDraft` (around line 84-87):

```ts
  interface ConceptUpdate {
    materiaalId?: string;
    maatId?: string;
    breedte?: number;
    hoogte?: number;
    prijs?: number | null;
    quantity?: number;
  }
  const [conceptUpdates, setConceptUpdates] = useState<Record<string, ConceptUpdate>>({});
  const [saving, setSaving] = useState(false);
```

Reset it in the existing `useEffect` that clears state on `bestelling?.id` change (around lines 92-101), adding `setConceptUpdates({});`.

Replace `handlePrijsVaststellen` (lines 195-214) — it now writes into `conceptUpdates` instead of PATCHing:

```ts
  function handlePrijsVaststellen(line: BestellingLine) {
    const prijs = Number(prijsDrafts[line.id]);
    if (!prijs || prijs <= 0) return;
    setConceptUpdates((current) => ({ ...current, [line.id]: { ...current[line.id], prijs } }));
    setPrijsDrafts((current) => {
      const { [line.id]: _verwijderd, ...rest } = current;
      return rest;
    });
  }
```

Replace `handleOpslaanRegel` (lines 233-275) similarly — it writes into `conceptUpdates` and closes the inline editor, but does not fetch:

```ts
  function handleOpslaanRegel(line: BestellingLine) {
    if (!lineDraft) return;
    const quantity = Number(lineDraft.quantity);
    if (!lineDraft.materiaalId || !quantity || quantity <= 0) return;
    const prijs = lineDraft.prijs === '' ? null : Number(lineDraft.prijs);
    if (prijs !== null && prijs <= 0) return;

    const patch: ConceptUpdate = { materiaalId: lineDraft.materiaalId, prijs, quantity };
    if (isCustomLine(line)) {
      const breedte = Number(lineDraft.breedte);
      const hoogte = Number(lineDraft.hoogte);
      if (!breedte || breedte <= 0 || !hoogte || hoogte <= 0) return;
      patch.maatId = '';
      patch.breedte = breedte;
      patch.hoogte = hoogte;
    } else {
      if (!lineDraft.maatId) return;
      patch.maatId = lineDraft.maatId;
    }

    setConceptUpdates((current) => ({ ...current, [line.id]: { ...current[line.id], ...patch } }));
    cancelEditRegel();
  }
```

`prijs` is always included in the patch, including `null` when the field was cleared — this matches the original `handleOpslaanRegel`'s payload, which could explicitly send `prijs: null` to clear a price back to unset.

Add the save handler:

```ts
  const heeftConceptWijziging = Object.keys(conceptUpdates).length > 0;

  async function handleWijzigingenOpslaan() {
    if (!bestelling) return;
    setSaving(true);
    setError(null);
    try {
      const updates = Object.entries(conceptUpdates).map(([id, patch]) => ({ id, ...patch }));
      const response = await fetch(`/api/bestelheaders/${bestelling.id}/wijzigen`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ korting: bestelling.korting, updates, additions: [], deletions: [] }),
      });
      if (!response.ok) throw new Error('wijzigen failed');
      const body = (await response.json()) as { lines: BestellingLine[]; korting: number | null };
      void logActiviteit('bestelling_gewijzigd', bestelling.bestelnr);
      onBestellingGewijzigd({ ...bestelling, lines: body.lines, korting: body.korting });
      setConceptUpdates({});
    } catch {
      setError(t('bestellingenActionError'));
    } finally {
      setSaving(false);
    }
  }
```

Add the button in the modal body, right after the `heeftOngeprijsdeRegel` warning block (around line 662-666):

```tsx
            {heeftConceptWijziging && (
              <div className="flex justify-end border-t border-white/10 pt-3">
                <button
                  type="button"
                  onClick={handleWijzigingenOpslaan}
                  disabled={saving}
                  data-testid="bestelling-modal-wijzigingen-opslaan"
                  className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
                >
                  {t('bestellingenWijzigingenOpslaan')}
                </button>
              </div>
            )}
```

Add the translation key to `messages/nl.json`, `beheer` block: `"bestellingenWijzigingenOpslaan": "Wijzigingen opslaan",`

Finally, everywhere the JSX currently reads `line.prijs`/`line.quantity`/`line.materiaalId`/`line.maatId`/`line.breedte`/`line.hoogte` for *display* (not for the inline editor's own draft, which already has its own `lineDraft`), apply `conceptUpdates[line.id]` as an overlay so a pending, unsaved edit shows immediately. Since the read-only display block (lines ~461-525) is what needs this, wrap the relevant values, e.g.:

```ts
                const conceptPatch = conceptUpdates[line.id];
                const weergaveLine = conceptPatch ? { ...line, ...conceptPatch } : line;
```

placed right after `const isEditingLine = editingLineId === line.id;` (around line 435), and use `weergaveLine` instead of `line` in the read-only display JSX block (the `line.prijs`/`line.quantity` texts around lines 480-493, and the maatWeergave computation around lines 430-434 should read from `weergaveLine.maatId`/`weergaveLine.breedte`/`weergaveLine.hoogte`). Leave `startEditRegel(line)` seeding the editor from the *original* `line` object as-is if you want re-editing to start from the last-saved server value — but for a cleaner UX, seed it from `weergaveLine` instead so re-opening an already-drafted line shows the pending edit, not the stale server value.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx`
Expected: PASS, all tests in this file.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS. This is the first checkpoint where every file touched by Tasks 6-8 is exercised together.

- [ ] **Step 7: Commit**

```bash
git add src/components/beheer/BestellingModal.tsx tests/components/beheer/BestellingModal.test.tsx src/lib/logActiviteit.ts messages/nl.json
git commit -m "feat: maak regel bewerken/prijs vaststellen een concept, opslaan via PATCH .../wijzigen"
```

---

## Task 9: `BestellingModal.tsx` — regel verwijderen, regel toevoegen, status-gating

**Files:**
- Modify: `src/components/beheer/BestellingModal.tsx`
- Modify: `tests/components/beheer/BestellingModal.test.tsx`

**Interfaces:**
- Consumes: `concept` state and `handleWijzigingenOpslaan` from Task 8, `kunstwerken`/`materialen`/`maten` props (already passed into `BestellingModal`).
- Produces: `concept.deletions`/`concept.additions` folded into the save payload, plus visibility gating shared by Task 10 (the mail dialog only appears after any successful save, structural or not).

- [ ] **Step 1: Write the failing tests**

Add a new fixture and describe block. First, add near the other module-level fixtures (after `BESTELLING_BETAALD_EN_AFGEROND`):

```ts
const BESTELLING_TE_VERSTUREN: Bestelling = {
  ...BESTELLING_VERSTUURD,
  id: 'header-7',
  bestelnr: 'GD-00107',
  status: 'Te versturen naar drukker',
};
```

Add the describe block:

```ts
describe('BestellingModal — regel verwijderen en toevoegen', () => {
  it('shows regel-verwijderen and regel-toevoegen for a status where regelstructuur is still editable', () => {
    renderModal(BESTELLING);
    expect(screen.getByTestId('bestelling-modal-regel-verwijderen-line-1')).toBeInTheDocument();
    expect(screen.getByTestId('bestelling-modal-regel-toevoegen')).toBeInTheDocument();
  });

  it('hides regel-verwijderen and regel-toevoegen from Verstuurd naar drukker onward, and for Afgewezen', () => {
    renderModal(BESTELLING_VERSTUURD);
    expect(screen.queryByTestId('bestelling-modal-regel-verwijderen-line-6')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-regel-toevoegen')).not.toBeInTheDocument();

    renderModal(BESTELLING_TE_FACTUREREN);
    expect(screen.queryByTestId('bestelling-modal-regel-toevoegen')).not.toBeInTheDocument();

    renderModal({ ...BESTELLING, status: 'Afgewezen' });
    expect(screen.queryByTestId('bestelling-modal-regel-toevoegen')).not.toBeInTheDocument();
  });

  it('shows regel-toevoegen while Te versturen naar drukker (still before Verstuurd naar drukker)', () => {
    renderModal(BESTELLING_TE_VERSTUREN);
    expect(screen.getByTestId('bestelling-modal-regel-toevoegen')).toBeInTheDocument();
  });

  it('marks a line for deletion, shows it struck through with an undo, and saves the deletion on Wijzigingen opslaan', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const { onBestellingGewijzigd } = renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-verwijderen-line-1'));
    expect(screen.getByTestId('bestelling-modal-regel-verwijderen-ongedaan-line-1')).toBeInTheDocument();
    expect(screen.getByTestId('bestelling-modal-wijzigingen-opslaan')).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ lines: [BESTELLING.lines[1]], korting: null }) });
    fireEvent.click(screen.getByTestId('bestelling-modal-wijzigingen-opslaan'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-1/wijzigen',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ korting: null, updates: [], additions: [], deletions: ['line-1'] }),
        })
      )
    );
    await waitFor(() =>
      expect(onBestellingGewijzigd).toHaveBeenCalledWith({ ...BESTELLING, lines: [BESTELLING.lines[1]], korting: null })
    );
  });

  it('undoes a pending deletion', () => {
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-verwijderen-line-1'));
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-verwijderen-ongedaan-line-1'));
    expect(screen.queryByTestId('bestelling-modal-regel-verwijderen-ongedaan-line-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-wijzigingen-opslaan')).not.toBeInTheDocument();
  });

  it('adds a new line via the kunstwerk picker and saves it on Wijzigingen opslaan', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const { onBestellingGewijzigd } = renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-toevoegen'));
    fireEvent.change(screen.getByTestId('bestelling-modal-nieuwe-regel-kunstwerk'), { target: { value: 'kw-1' } });
    fireEvent.change(screen.getByTestId('bestelling-modal-nieuwe-regel-materiaal'), { target: { value: 'mat-1' } });
    fireEvent.change(screen.getByTestId('bestelling-modal-nieuwe-regel-maat'), { target: { value: 'maat-1' } });
    fireEvent.change(screen.getByTestId('bestelling-modal-nieuwe-regel-aantal'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('bestelling-modal-nieuwe-regel-toevoegen-bevestigen'));

    expect(screen.getByTestId('bestelling-modal-wijzigingen-opslaan')).toBeInTheDocument();

    const nieuweRegel = { id: 'line-nieuw', code: 'Hotel paneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 210, quantity: 2 };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ lines: [...BESTELLING.lines, nieuweRegel], korting: null }),
    });
    fireEvent.click(screen.getByTestId('bestelling-modal-wijzigingen-opslaan'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-1/wijzigen',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            korting: null,
            updates: [],
            additions: [{ kunstwerkId: 'kw-1', materiaalId: 'mat-1', maatId: 'maat-1', quantity: 2 }],
            deletions: [],
          }),
        })
      )
    );
    await waitFor(() =>
      expect(onBestellingGewijzigd).toHaveBeenCalledWith({
        ...BESTELLING,
        lines: [...BESTELLING.lines, nieuweRegel],
        korting: null,
      })
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx`
Expected: FAIL — none of the new testids exist yet.

- [ ] **Step 3: Implement deletions and the status-gating helper**

Add near the top of the component body (after `heeftOngeprijsdeRegel`):

```ts
  const REGELSTRUCTUUR_OP_SLOT_STATUSSEN = ['Verstuurd naar drukker', 'Te factureren', 'Betaald en afgerond'];
  const regelstructuurBewerkbaar =
    !!bestelling && bestelling.status !== 'Afgewezen' && !REGELSTRUCTUUR_OP_SLOT_STATUSSEN.includes(bestelling.status);
```

Add deletion state next to `conceptUpdates`:

```ts
  const [conceptDeletions, setConceptDeletions] = useState<Set<string>>(new Set());
```

Reset it alongside `conceptUpdates` in the mount-effect: `setConceptDeletions(new Set());`.

Add handlers:

```ts
  function markeerVoorVerwijdering(lineId: string) {
    setConceptDeletions((current) => new Set(current).add(lineId));
  }

  function maakVerwijderingOngedaan(lineId: string) {
    setConceptDeletions((current) => {
      const next = new Set(current);
      next.delete(lineId);
      return next;
    });
  }
```

Update `heeftConceptWijziging` to also consider deletions/additions (additions come in Step 4 below):

```ts
  const heeftConceptWijziging =
    Object.keys(conceptUpdates).length > 0 || conceptDeletions.size > 0 || conceptAdditions.length > 0;
```

In the line `<li>` JSX, wrap the whole item body's className to strike through a pending deletion, and add the verwijderen/ongedaan-maken button. Right after the "Bewerken" button block (around line 516-525), add:

```tsx
                          {regelstructuurBewerkbaar &&
                            (conceptDeletions.has(line.id) ? (
                              <button
                                type="button"
                                onClick={() => maakVerwijderingOngedaan(line.id)}
                                data-testid={`bestelling-modal-regel-verwijderen-ongedaan-${line.id}`}
                                className="mt-1.5 text-[0.65rem] uppercase tracking-wide text-white/40 underline underline-offset-2 hover:text-white/70"
                              >
                                {t('bestellingenRegelVerwijderenOngedaanMaken')}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => markeerVoorVerwijdering(line.id)}
                                data-testid={`bestelling-modal-regel-verwijderen-${line.id}`}
                                className="mt-1.5 text-[0.65rem] uppercase tracking-wide text-white/40 underline underline-offset-2 hover:text-white/70"
                              >
                                {t('bestellingenRegelVerwijderen')}
                              </button>
                            ))}
```

Apply a struck-through style to the `<li>` itself when marked: change the `<li>` className (around line 444-448) to include `conceptDeletions.has(line.id) ? 'opacity-40 line-through' : ''`.

- [ ] **Step 4: Implement regel toevoegen**

Add state:

```ts
  interface ConceptAddition {
    tempId: string;
    kunstwerkId: string;
    materiaalId: string;
    maatId: string;
    breedte?: number;
    hoogte?: number;
    quantity: number;
  }
  const [conceptAdditions, setConceptAdditions] = useState<ConceptAddition[]>([]);
  const [toonNieuweRegel, setToonNieuweRegel] = useState(false);
  const [nieuweRegelDraft, setNieuweRegelDraft] = useState({
    kunstwerkId: '',
    materiaalId: '',
    maatId: '',
    breedte: '',
    hoogte: '',
    quantity: '1',
  });
```

Reset in the mount-effect: `setConceptAdditions([]); setToonNieuweRegel(false);`.

Add the handler:

```ts
  function handleNieuweRegelToevoegen() {
    const kunstwerk = (kunstwerken ?? []).find((k) => k.id === nieuweRegelDraft.kunstwerkId);
    const quantity = Number(nieuweRegelDraft.quantity);
    if (!kunstwerk || !nieuweRegelDraft.materiaalId || !quantity || quantity <= 0) return;
    const isEigenMaat = kunstwerk.maatIds.length === 0;
    if (isEigenMaat) {
      const breedte = Number(nieuweRegelDraft.breedte);
      const hoogte = Number(nieuweRegelDraft.hoogte);
      if (!breedte || breedte <= 0 || !hoogte || hoogte <= 0) return;
      setConceptAdditions((current) => [
        ...current,
        {
          tempId: `nieuw-${current.length}-${Date.now()}`,
          kunstwerkId: kunstwerk.id,
          materiaalId: nieuweRegelDraft.materiaalId,
          maatId: '',
          breedte,
          hoogte,
          quantity,
        },
      ]);
    } else {
      if (!nieuweRegelDraft.maatId) return;
      setConceptAdditions((current) => [
        ...current,
        {
          tempId: `nieuw-${current.length}-${Date.now()}`,
          kunstwerkId: kunstwerk.id,
          materiaalId: nieuweRegelDraft.materiaalId,
          maatId: nieuweRegelDraft.maatId,
          quantity,
        },
      ]);
    }
    setNieuweRegelDraft({ kunstwerkId: '', materiaalId: '', maatId: '', breedte: '', hoogte: '', quantity: '1' });
    setToonNieuweRegel(false);
  }
```

Add the UI, placed after the `</ul>` closing the lines list (around line 642), gated by `regelstructuurBewerkbaar`:

```tsx
            {regelstructuurBewerkbaar && (
              <div className="flex flex-col gap-2">
                {conceptAdditions.map((addition) => {
                  const kunstwerk = (kunstwerken ?? []).find((k) => k.id === addition.kunstwerkId);
                  return (
                    <p key={addition.tempId} className="text-xs text-white/60">
                      {kunstwerk?.omschrijvingNl ?? addition.kunstwerkId} × {addition.quantity} —{' '}
                      {t('bestellingenRegelPrijsNaOpslaan')}
                    </p>
                  );
                })}
                {toonNieuweRegel ? (
                  <div className="flex flex-col gap-2 rounded-md border border-white/10 bg-white/[0.02] p-3">
                    <select
                      value={nieuweRegelDraft.kunstwerkId}
                      onChange={(event) =>
                        setNieuweRegelDraft((current) => ({
                          ...current,
                          kunstwerkId: event.target.value,
                          materiaalId: '',
                          maatId: '',
                        }))
                      }
                      data-testid="bestelling-modal-nieuwe-regel-kunstwerk"
                      className="rounded-sm bg-black/40 px-2 py-1.5 text-xs text-white"
                    >
                      <option value="">—</option>
                      {(kunstwerken ?? []).map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.omschrijvingNl}
                        </option>
                      ))}
                    </select>
                    {(() => {
                      const gekozenKunstwerk = (kunstwerken ?? []).find((k) => k.id === nieuweRegelDraft.kunstwerkId);
                      if (!gekozenKunstwerk) return null;
                      const beschikbareMaterialen = (materialen ?? []).filter((m) =>
                        gekozenKunstwerk.materiaalIds.includes(m.id)
                      );
                      const beschikbareMaten = (maten ?? []).filter((m) => gekozenKunstwerk.maatIds.includes(m.id));
                      return (
                        <>
                          <select
                            value={nieuweRegelDraft.materiaalId}
                            onChange={(event) =>
                              setNieuweRegelDraft((current) => ({ ...current, materiaalId: event.target.value }))
                            }
                            data-testid="bestelling-modal-nieuwe-regel-materiaal"
                            className="rounded-sm bg-black/40 px-2 py-1.5 text-xs text-white"
                          >
                            <option value="">—</option>
                            {beschikbareMaterialen.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.materiaaldikte}mm {materiaalsoortNaamById.get(m.materiaalsoortId) ?? m.materiaalsoortId}
                              </option>
                            ))}
                          </select>
                          {gekozenKunstwerk.maatIds.length === 0 ? (
                            <div className="flex gap-2">
                              <input
                                type="number"
                                placeholder={t('bestellingenModalLabelMaat')}
                                value={nieuweRegelDraft.breedte}
                                onChange={(event) =>
                                  setNieuweRegelDraft((current) => ({ ...current, breedte: event.target.value }))
                                }
                                data-testid="bestelling-modal-nieuwe-regel-breedte"
                                className="w-20 rounded-sm bg-black/40 px-2 py-1 text-xs text-white"
                              />
                              <input
                                type="number"
                                value={nieuweRegelDraft.hoogte}
                                onChange={(event) =>
                                  setNieuweRegelDraft((current) => ({ ...current, hoogte: event.target.value }))
                                }
                                data-testid="bestelling-modal-nieuwe-regel-hoogte"
                                className="w-20 rounded-sm bg-black/40 px-2 py-1 text-xs text-white"
                              />
                            </div>
                          ) : (
                            <select
                              value={nieuweRegelDraft.maatId}
                              onChange={(event) =>
                                setNieuweRegelDraft((current) => ({ ...current, maatId: event.target.value }))
                              }
                              data-testid="bestelling-modal-nieuwe-regel-maat"
                              className="rounded-sm bg-black/40 px-2 py-1.5 text-xs text-white"
                            >
                              <option value="">—</option>
                              {beschikbareMaten.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.breedte}×{m.hoogte} cm
                                </option>
                              ))}
                            </select>
                          )}
                        </>
                      );
                    })()}
                    <input
                      type="number"
                      min={1}
                      placeholder={t('bestellingenModalLabelAantal')}
                      value={nieuweRegelDraft.quantity}
                      onChange={(event) =>
                        setNieuweRegelDraft((current) => ({ ...current, quantity: event.target.value }))
                      }
                      data-testid="bestelling-modal-nieuwe-regel-aantal"
                      className="w-16 rounded-sm bg-black/40 px-2 py-1 text-xs text-white"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleNieuweRegelToevoegen}
                        data-testid="bestelling-modal-nieuwe-regel-toevoegen-bevestigen"
                        className="btn-beheer-primary rounded-sm bg-silver px-3 py-1.5 text-xs tracking-wide text-ink"
                      >
                        {t('bestellingenModalRegelOpslaan')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setToonNieuweRegel(false)}
                        data-testid="bestelling-modal-nieuwe-regel-annuleren"
                        className="btn-beheer-secondary rounded-sm border border-white/20 px-3 py-1.5 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
                      >
                        {t('annuleren')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setToonNieuweRegel(true)}
                    data-testid="bestelling-modal-regel-toevoegen"
                    className="self-start text-[0.65rem] uppercase tracking-wide text-white/40 underline underline-offset-2 hover:text-white/70"
                  >
                    {t('bestellingenRegelToevoegen')}
                  </button>
                )}
              </div>
            )}
```

- [ ] **Step 5: Include deletions/additions in the save payload, and skip rendering removed lines**

In `handleWijzigingenOpslaan` (Task 8), change the fetch body to:

```ts
        body: JSON.stringify({
          korting: bestelling.korting,
          updates: Object.entries(conceptUpdates).map(([id, patch]) => ({ id, ...patch })),
          additions: conceptAdditions.map(({ tempId: _tempId, ...addition }) => addition),
          deletions: Array.from(conceptDeletions),
        }),
```

And on success, also clear the new state: `setConceptDeletions(new Set()); setConceptAdditions([]);`.

Also filter the rendered `bestelling.lines.map(...)` list to skip lines flagged for deletion from any *price/goedkeuren-blocking* calculation if desired — this is optional polish; the design doesn't require it, so leave the struck-through line visible (it still counts toward `heeftOngeprijsdeRegel`/totals display until actually saved, which is consistent with "nothing is real until Wijzigingen opslaan").

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx`
Expected: PASS, all tests including the new describe block.

- [ ] **Step 7: Add the translation keys**

In `messages/nl.json`, `beheer` block:

```json
    "bestellingenRegelVerwijderen": "Verwijderen",
    "bestellingenRegelVerwijderenOngedaanMaken": "Ongedaan maken",
    "bestellingenRegelToevoegen": "Regel toevoegen",
    "bestellingenRegelPrijsNaOpslaan": "prijs bekend na opslaan",
```

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/beheer/BestellingModal.tsx tests/components/beheer/BestellingModal.test.tsx messages/nl.json
git commit -m "feat: regel toevoegen/verwijderen in BestellingModal, gated op status"
```

---

## Task 10: `BestellingModal.tsx` — wijzigingsmail-bevestiging

**Files:**
- Modify: `src/components/beheer/BestellingModal.tsx`
- Modify: `tests/components/beheer/BestellingModal.test.tsx`

**Interfaces:**
- Consumes: `handleWijzigingenOpslaan` (Task 8/9), `POST /api/mail` `soort: 'bestelwijziging'` (Task 5).
- Produces: nothing further consumed — this is the final task in the modal chain.

- [ ] **Step 1: Write the failing tests**

Add a new describe block:

```ts
describe('BestellingModal — wijzigingsmail', () => {
  it('shows the mail-confirmation dialog after a successful Wijzigingen opslaan, and not before', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-bewerken-line-1'));
    fireEvent.change(screen.getByTestId('bestelling-modal-regel-aantal-line-1'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-opslaan-line-1'));
    expect(screen.queryByTestId('bestelling-modal-mail-vraag')).not.toBeInTheDocument();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ lines: [{ ...BESTELLING.lines[0], quantity: 5 }, BESTELLING.lines[1]], korting: null }),
    });
    fireEvent.click(screen.getByTestId('bestelling-modal-wijzigingen-opslaan'));

    expect(await screen.findByTestId('bestelling-modal-mail-vraag')).toBeInTheDocument();
  });

  it('sends the wijzigingsmail and closes the dialog when Ja is clicked', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-bewerken-line-1'));
    fireEvent.change(screen.getByTestId('bestelling-modal-regel-aantal-line-1'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-opslaan-line-1'));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ lines: [{ ...BESTELLING.lines[0], quantity: 5 }, BESTELLING.lines[1]], korting: null }),
    });
    fireEvent.click(screen.getByTestId('bestelling-modal-wijzigingen-opslaan'));
    await screen.findByTestId('bestelling-modal-mail-vraag');

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    fireEvent.click(screen.getByTestId('bestelling-modal-mail-ja'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/mail',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ soort: 'bestelwijziging', bestelheaderId: 'header-1' }),
        })
      )
    );
    await waitFor(() => expect(screen.queryByTestId('bestelling-modal-mail-vraag')).not.toBeInTheDocument());
  });

  it('closes the dialog without sending mail when Nee is clicked', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-bewerken-line-1'));
    fireEvent.change(screen.getByTestId('bestelling-modal-regel-aantal-line-1'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-opslaan-line-1'));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ lines: [{ ...BESTELLING.lines[0], quantity: 5 }, BESTELLING.lines[1]], korting: null }),
    });
    fireEvent.click(screen.getByTestId('bestelling-modal-wijzigingen-opslaan'));
    await screen.findByTestId('bestelling-modal-mail-vraag');

    fireEvent.click(screen.getByTestId('bestelling-modal-mail-nee'));

    expect(screen.queryByTestId('bestelling-modal-mail-vraag')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/mail', expect.anything());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx`
Expected: FAIL — no `bestelling-modal-mail-vraag` testid exists.

- [ ] **Step 3: Implement the dialog**

Add state near the other modal-scoped state:

```ts
  const [toonMailVraag, setToonMailVraag] = useState(false);
```

Reset it in the mount-effect: `setToonMailVraag(false);`.

In `handleWijzigingenOpslaan` (Task 8/9), after the successful `onBestellingGewijzigd(...)` call and clearing concept state, add `setToonMailVraag(true);`.

Add the handlers:

```ts
  async function handleMailJa() {
    if (!bestelling) return;
    try {
      await fetch('/api/mail', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ soort: 'bestelwijziging', bestelheaderId: bestelling.id }),
      });
    } finally {
      setToonMailVraag(false);
    }
  }

  function handleMailNee() {
    setToonMailVraag(false);
  }
```

Add the dialog JSX, right after the `heeftConceptWijziging` save-button block from Task 8:

```tsx
            {toonMailVraag && (
              <div
                data-testid="bestelling-modal-mail-vraag"
                className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.02] p-3 text-xs"
              >
                <span>{t('bestellingenMailVraag')}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleMailJa}
                    data-testid="bestelling-modal-mail-ja"
                    className="btn-beheer-primary rounded-sm bg-silver px-3 py-1.5 text-xs tracking-wide text-ink"
                  >
                    {t('bestellingenMailJa')}
                  </button>
                  <button
                    type="button"
                    onClick={handleMailNee}
                    data-testid="bestelling-modal-mail-nee"
                    className="btn-beheer-secondary rounded-sm border border-white/20 px-3 py-1.5 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
                  >
                    {t('bestellingenMailNee')}
                  </button>
                </div>
              </div>
            )}
```

- [ ] **Step 4: Add the translation keys**

In `messages/nl.json`, `beheer` block:

```json
    "bestellingenMailVraag": "Wijzigingsmail sturen naar de klant?",
    "bestellingenMailJa": "Ja, versturen",
    "bestellingenMailNee": "Nee",
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 6: Run the full suite one more time**

Run: `npm test`
Expected: PASS across the entire suite — this is the final integration checkpoint for the whole feature.

- [ ] **Step 7: Commit**

```bash
git add src/components/beheer/BestellingModal.tsx tests/components/beheer/BestellingModal.test.tsx messages/nl.json
git commit -m "feat: vraag na Wijzigingen opslaan of er een wijzigingsmail naar de klant moet"
```

---

## Post-implementation: staging deploy

Per `CLAUDE.md`'s hard rule, do not dispatch `deploy-naar-production.yml` without first deploying this exact commit to staging and verifying it there:

1. Dispatch `deploy-naar-staging.yml` against `master` (after merging this branch) — this also runs `npm run db:migrate -- staging` verification implicitly via `scripts/check-migrations.ts`, but confirm the Task 1 migration was applied to staging *before* this deploy (Task 1 already did this during implementation — re-check with `npm run db:status -- staging` if time has passed).
2. On staging's `/nl/beheer`, open a `Te beoordelen` bestelling: add a line, delete a line, edit a price, set a korting, click Wijzigingen opslaan, confirm the totals update, and send the wijzigingsmail — check it actually arrives.
3. Repeat a quick check for a bestelling in `Verstuurd naar drukker` (regel toevoegen/verwijderen should be gone, prijs/korting still editable) and one in `Afgewezen` (everything locked).
4. Only after that, ask the user for permission and dispatch `deploy-naar-production.yml`.
