# Bestelstatushistorie refactor Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 06-08-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 4 separate `bestelheaders` timestamp columns (`teVersturenNaarDrukkerOp`, `verstuurdNaarDrukkerOp`, `afgerondOp`, `afgewezenOp`) built in `docs/superpowers/plans/2026-08-05-bestelling-afronden-workflow.md` with a single generic `bestelstatusHistorie` table, before any of it reaches production or `master`.

**Architecture:** One new append-only table (`bestelstatusHistorie`: `bestelheaderId`, `status`, `tijdstip`) replaces the 4 columns. The PATCH route drops its symmetric-vs-monotonic column logic entirely and just inserts a history row whenever `status` actually changes (`getRow` current status, compare, `INSERT` if different) — this is strictly simpler than what it replaces. The POST route inserts the initial `'Te beoordelen'` row at creation time. A new nested `GET /api/bestelheaders/[id]/statushistorie` route exposes the history for one order, read on-demand by a new `useBestellingHistorie` hook (mirrors the existing `useDrukkerZendingen` hook exactly). `DrukkerModal`'s badge/bulk-afronden logic is **unaffected** — it already only ever read `.status`, never the timestamp columns.

**Tech Stack:** Next.js 14 App Router API routes, raw `mysql2`, Vitest + Testing Library, real MySQL staging database in tests (per `CLAUDE.md`).

## Global Constraints

- Schema changes touch two files together: `db/schema.sql` (end-state) and a new `db/migrations/YYYY-MM-DD-<slug>.sql` (forward-only), applied directly to staging (no migration runner exists).
- Verified 2026-08-06: none of the 4 real rows currently in staging's `bestelheaders` have any of the 4 columns populated — dropping them is a clean, lossless operation, not a data migration.
- Every Beheer write that succeeds fires a `logActiviteit(...)` call with `actorFromMedewerker(user)` — unaffected by this refactor, no `logActiviteit` call sites change.
- Run `npx tsc --noEmit` after each task — `npm test` does not type-check.
- Test cleanup must only ever delete rows a test itself created, scoped by captured id — never a blanket `DELETE`/`TRUNCATE`.
- This supersedes `docs/superpowers/plans/2026-08-05-bestelling-afronden-workflow.md` — do not re-read that plan as current truth, it documents the design being replaced here (kept for history).

---

## File Structure

New files:
- `db/migrations/2026-08-06-bestelstatushistorie.sql`
- `src/app/api/bestelheaders/[id]/statushistorie/route.ts`
- `src/lib/useBestellingHistorie.ts`

Modified files:
- `db/schema.sql` — new `bestelstatusHistorie` table; drop the 4 columns from `bestelheaders` (back to its pre-2026-08-05 shape).
- `src/app/api/bestelheaders/[id]/route.ts` — PATCH replaced with insert-on-change.
- `src/app/api/bestelheaders/route.ts` — POST inserts the initial history row.
- `tests/app/api/bestelheaders.test.ts` — remove the 4 old column-behavior tests, add new history-table tests.
- `src/components/beheer/BestellingenSection.tsx` — `Bestelling` interface loses the 4 fields.
- `src/components/beheer/BeheerShell.tsx` — `loadBestellingen`/`handleBestellingUpdated` stop reading/copying the 4 fields.
- `src/components/beheer/VersturenNaarDrukkerDialog.tsx` — `onVerstuurd` stops stamping `verstuurdNaarDrukkerOp`.
- `src/components/beheer/DrukkerModal.tsx` — `handleMarkeerZendingAlsAfgerond` stops stamping `afgerondOp`.
- `src/components/beheer/BestellingModal.tsx` — `statusHistoryEntries` (column-reading) replaced by the new hook; handlers stop stamping the 4 fields.
- `tests/components/beheer/BestellingenSection.test.tsx`, `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx`, `tests/components/beheer/DrukkerModal.test.tsx`, `tests/components/beheer/BestellingModal.test.tsx`, `tests/lib/buildDrukkerMail.test.ts` — remove the 4 dead fields from every `Bestelling` fixture; revert the `expect.objectContaining(..., expect.any(String))` workarounds back to plain equality where the field they guarded no longer exists.
- `tests/regression/staging-scenarios.test.ts` — the `afgerondOp`-reading assertion in the "Bestelling afronden" scenario now reads `bestelstatusHistorie`.

---

### Task 1: Schema — `bestelstatusHistorie` table, drop the 4 obsolete columns

**Files:**
- Modify: `db/schema.sql`
- Create: `db/migrations/2026-08-06-bestelstatushistorie.sql`

**Interfaces:**
- Produces: `bestelstatusHistorie(id CHAR(36), bestelheaderId CHAR(36), status VARCHAR(50), tijdstip TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`, `FOREIGN KEY (bestelheaderId) REFERENCES bestelheaders(id) ON DELETE CASCADE`. `bestelheaders` loses `teVersturenNaarDrukkerOp`/`verstuurdNaarDrukkerOp`/`afgerondOp`/`afgewezenOp`.

- [ ] **Step 1: Update the schema file**

In `db/schema.sql`, change the `bestelheaders` table (as Tasks 1/2 of the superseded plan left it) from:

```sql
CREATE TABLE bestelheaders (
  id CHAR(36) PRIMARY KEY,
  klantId CHAR(36) NOT NULL,
  bestelnr VARCHAR(20) NOT NULL,
  besteldatum TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) NOT NULL DEFAULT 'Te beoordelen',
  teVersturenNaarDrukkerOp DATETIME NULL,
  verstuurdNaarDrukkerOp DATETIME NULL,
  afgerondOp DATETIME NULL,
  afgewezenOp DATETIME NULL,
  FOREIGN KEY (klantId) REFERENCES klanten(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE bestellines (
  id CHAR(36) PRIMARY KEY,
  bestelheaderId CHAR(36) NOT NULL,
  kunstwerkId CHAR(36),
  maatId CHAR(36),
  materiaalId CHAR(36),
  prijs DECIMAL(10,2),
  quantity INT NOT NULL DEFAULT 1,
  breedte INT,
  hoogte INT,
  FOREIGN KEY (bestelheaderId) REFERENCES bestelheaders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

to:

```sql
CREATE TABLE bestelheaders (
  id CHAR(36) PRIMARY KEY,
  klantId CHAR(36) NOT NULL,
  bestelnr VARCHAR(20) NOT NULL,
  besteldatum TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) NOT NULL DEFAULT 'Te beoordelen',
  FOREIGN KEY (klantId) REFERENCES klanten(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE bestellines (
  id CHAR(36) PRIMARY KEY,
  bestelheaderId CHAR(36) NOT NULL,
  kunstwerkId CHAR(36),
  maatId CHAR(36),
  materiaalId CHAR(36),
  prijs DECIMAL(10,2),
  quantity INT NOT NULL DEFAULT 1,
  breedte INT,
  hoogte INT,
  FOREIGN KEY (bestelheaderId) REFERENCES bestelheaders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE bestelstatusHistorie (
  id CHAR(36) PRIMARY KEY,
  bestelheaderId CHAR(36) NOT NULL,
  status VARCHAR(50) NOT NULL,
  tijdstip TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bestelheaderId) REFERENCES bestelheaders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

(`bestelstatusHistorie` is declared right after `bestellines`, its sibling child-of-`bestelheaders` table, matching this file's existing convention of grouping a header table with its child tables.)

- [ ] **Step 2: Create the migration file**

Create `db/migrations/2026-08-06-bestelstatushistorie.sql`:

```sql
-- Migration for bestelstatushistorie (2026-08-06)
-- Run once, in order, against a database still on the pre-migration schema.
-- Verified 2026-08-06: no real bestelheaders row has any of the 4 dropped columns
-- populated, so this drop is lossless -- do not re-verify unless staging has since
-- accumulated real Verstuurd-naar-drukker/Afgerond/Afgewezen orders under the old design.
CREATE TABLE bestelstatusHistorie (
  id CHAR(36) PRIMARY KEY,
  bestelheaderId CHAR(36) NOT NULL,
  status VARCHAR(50) NOT NULL,
  tijdstip TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bestelheaderId) REFERENCES bestelheaders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE bestelheaders DROP COLUMN teVersturenNaarDrukkerOp;
ALTER TABLE bestelheaders DROP COLUMN verstuurdNaarDrukkerOp;
ALTER TABLE bestelheaders DROP COLUMN afgerondOp;
ALTER TABLE bestelheaders DROP COLUMN afgewezenOp;
```

- [ ] **Step 3: Re-verify no staging row has any of the 4 columns populated, then apply the migration**

Run (from the repo root, so `.env.local` is picked up) — this re-checks Step 2's assumption is still true right before executing the irreversible drop:

```bash
node -e '
require("dotenv").config({ path: ".env.local" });
const mysql = require("mysql2/promise");
(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const [rows] = await conn.query(
    "SELECT COUNT(*) AS total, SUM(teVersturenNaarDrukkerOp IS NOT NULL) AS teVersturen, SUM(verstuurdNaarDrukkerOp IS NOT NULL) AS verstuurd, SUM(afgerondOp IS NOT NULL) AS afgerond, SUM(afgewezenOp IS NOT NULL) AS afgewezen FROM bestelheaders"
  );
  console.log(JSON.stringify(rows[0]));
  await conn.end();
})();
'
```

Expected: `teVersturen`, `verstuurd`, `afgerond`, `afgewezen` are all `"0"`. **If any is non-zero, STOP and escalate — do not proceed with the drop; that data would be silently lost.** If all zero, proceed:

```bash
node -e '
require("dotenv").config({ path: ".env.local" });
const mysql = require("mysql2/promise");
(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  await conn.query(`CREATE TABLE bestelstatusHistorie (
    id CHAR(36) PRIMARY KEY,
    bestelheaderId CHAR(36) NOT NULL,
    status VARCHAR(50) NOT NULL,
    tijdstip TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bestelheaderId) REFERENCES bestelheaders(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await conn.query("ALTER TABLE bestelheaders DROP COLUMN teVersturenNaarDrukkerOp");
  await conn.query("ALTER TABLE bestelheaders DROP COLUMN verstuurdNaarDrukkerOp");
  await conn.query("ALTER TABLE bestelheaders DROP COLUMN afgerondOp");
  await conn.query("ALTER TABLE bestelheaders DROP COLUMN afgewezenOp");
  console.log("bestelstatusHistorie created, 4 columns dropped");
  await conn.end();
})();
'
```

- [ ] **Step 4: Verify the result**

```bash
node -e '
require("dotenv").config({ path: ".env.local" });
const mysql = require("mysql2/promise");
(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const [headerCols] = await conn.query("DESCRIBE bestelheaders");
  const [historieCols] = await conn.query("DESCRIBE bestelstatusHistorie");
  console.log("bestelheaders:", headerCols.map((c) => c.Field));
  console.log("bestelstatusHistorie:", historieCols.map((c) => c.Field));
  await conn.end();
})();
'
```

Expected: `bestelheaders` no longer lists the 4 dropped columns; `bestelstatusHistorie` lists `id`, `bestelheaderId`, `status`, `tijdstip`.

- [ ] **Step 5: Commit**

```bash
git add db/schema.sql db/migrations/2026-08-06-bestelstatushistorie.sql
git commit -m "feat: replace bestelheaders timestamp columns with a bestelstatusHistorie table"
```

---

### Task 2: Server — insert-on-change history, initial row on creation, new GET route

**Files:**
- Modify: `src/app/api/bestelheaders/[id]/route.ts`
- Modify: `src/app/api/bestelheaders/route.ts`
- Create: `src/app/api/bestelheaders/[id]/statushistorie/route.ts`
- Test: `tests/app/api/bestelheaders.test.ts`

**Interfaces:**
- Consumes: Task 1's `bestelstatusHistorie` table.
- Produces: `PATCH /api/bestelheaders/[id]` inserts a `bestelstatusHistorie` row (status = the new status) whenever the request changes `status` to something different from the row's current status — no row is inserted if `status` is absent from the request, or if it's present but equal to the current value. `POST /api/bestelheaders` inserts one `bestelstatusHistorie` row (`status: 'Te beoordelen'`) per created header, in the same transaction. `GET /api/bestelheaders/[id]/statushistorie` returns `Array<{ status: string; tijdstip: string }>` ordered oldest-first, staff-only.

- [ ] **Step 1: Delete the 4 old column-behavior tests**

In `tests/app/api/bestelheaders.test.ts`, delete these 4 `it(...)` blocks entirely (they test behavior this task removes):
- `'sets afgerondOp when a medewerker patches status to Afgerond, and clears it when patched away again'`
- `'sets teVersturenNaarDrukkerOp/verstuurdNaarDrukkerOp/afgewezenOp once, and never overwrites them again'`
- `'sets afgewezenOp once when a medewerker rejects a bestelling'`
- `'strips a client-supplied value for any of the 4 timestamp columns, with or without a status in the same PATCH'`

- [ ] **Step 2: Write the new failing tests**

Add these `it(...)` blocks to the same `describe('bestelheaders routes', ...)` block, in the same place the deleted ones were:

```ts
  it('records the initial Te beoordelen status in bestelstatusHistorie when a bestelling is created', async () => {
    const { cookie } = await klant('historie-creatie@example.com');
    const created = await createHeader(postRequest({ lines: [] }, cookie));
    const header = await created.json();

    const [rows] = await getPool().query(
      'SELECT status FROM bestelstatusHistorie WHERE bestelheaderId = ? ORDER BY tijdstip ASC',
      [header.id]
    );
    expect((rows as Array<{ status: string }>).map((r) => r.status)).toEqual(['Te beoordelen']);
  });

  it('records a new bestelstatusHistorie row each time a medewerker PATCHes a genuinely new status, in order', async () => {
    const { cookie } = await klant('historie-keten@example.com');
    const created = await createHeader(postRequest({ lines: [] }, cookie));
    const header = await created.json();
    const staffCookie = await medewerkerCookie();

    for (const status of ['Te versturen naar drukker', 'Verstuurd naar drukker', 'Afgerond']) {
      await patchHeader(
        new Request('http://localhost/api', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', cookie: staffCookie },
          body: JSON.stringify({ status }),
        }),
        { params: { id: header.id } }
      );
    }

    const [rows] = await getPool().query(
      'SELECT status FROM bestelstatusHistorie WHERE bestelheaderId = ? ORDER BY tijdstip ASC',
      [header.id]
    );
    expect((rows as Array<{ status: string }>).map((r) => r.status)).toEqual([
      'Te beoordelen',
      'Te versturen naar drukker',
      'Verstuurd naar drukker',
      'Afgerond',
    ]);
  });

  it('does not record a duplicate row when PATCHed with the same status it already has', async () => {
    const { cookie } = await klant('historie-geen-duplicaat@example.com');
    const created = await createHeader(postRequest({ lines: [] }, cookie));
    const header = await created.json();
    const staffCookie = await medewerkerCookie();

    async function patchStatus(status: string) {
      await patchHeader(
        new Request('http://localhost/api', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', cookie: staffCookie },
          body: JSON.stringify({ status }),
        }),
        { params: { id: header.id } }
      );
    }
    await patchStatus('Te versturen naar drukker');
    await patchStatus('Te versturen naar drukker'); // same status again -- must not add a row

    const [rows] = await getPool().query('SELECT status FROM bestelstatusHistorie WHERE bestelheaderId = ?', [
      header.id,
    ]);
    expect((rows as Array<{ status: string }>).map((r) => r.status)).toEqual([
      'Te beoordelen',
      'Te versturen naar drukker',
    ]);
  });

  it('records a full history across Afgerond -> Terugzetten -> Afgerond again -- both completions are kept', async () => {
    const { cookie } = await klant('historie-hergebruik@example.com');
    const created = await createHeader(postRequest({ lines: [] }, cookie));
    const header = await created.json();
    const staffCookie = await medewerkerCookie();

    async function patchStatus(status: string) {
      await patchHeader(
        new Request('http://localhost/api', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', cookie: staffCookie },
          body: JSON.stringify({ status }),
        }),
        { params: { id: header.id } }
      );
    }
    await patchStatus('Te versturen naar drukker');
    await patchStatus('Verstuurd naar drukker');
    await patchStatus('Afgerond');
    await patchStatus('Verstuurd naar drukker'); // Terugzetten
    await patchStatus('Afgerond'); // Afgerond again

    const [rows] = await getPool().query(
      'SELECT status FROM bestelstatusHistorie WHERE bestelheaderId = ? ORDER BY tijdstip ASC',
      [header.id]
    );
    expect((rows as Array<{ status: string }>).map((r) => r.status)).toEqual([
      'Te beoordelen',
      'Te versturen naar drukker',
      'Verstuurd naar drukker',
      'Afgerond',
      'Verstuurd naar drukker',
      'Afgerond',
    ]);
  });

  it('rejects reading statushistorie without a medewerker session', async () => {
    const { cookie } = await klant('historie-unauth@example.com');
    const created = await createHeader(postRequest({ lines: [] }, cookie));
    const header = await created.json();

    const response = await getStatusHistorie(new Request('http://localhost/api'), {
      params: { id: header.id },
    });
    expect(response.status).toBe(401);
  });

  it('returns the statushistorie for one bestelling via GET, oldest first', async () => {
    const { cookie } = await klant('historie-get@example.com');
    const created = await createHeader(postRequest({ lines: [] }, cookie));
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

    const response = await getStatusHistorie(
      new Request('http://localhost/api', { headers: { cookie: staffCookie } }),
      { params: { id: header.id } }
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Array<{ status: string; tijdstip: string }>;
    expect(body.map((row) => row.status)).toEqual(['Te beoordelen', 'Te versturen naar drukker']);
  });
```

Add the new import at the top of the file, alongside the existing route imports:

```ts
import { GET as getStatusHistorie } from '@/app/api/bestelheaders/[id]/statushistorie/route';
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/app/api/bestelheaders.test.ts -t "historie"`
Expected: FAIL — `bestelstatusHistorie` inserts don't happen yet, and `@/app/api/bestelheaders/[id]/statushistorie/route` doesn't exist yet (import error).

- [ ] **Step 4: Implement the PATCH route**

Replace the entire contents of `src/app/api/bestelheaders/[id]/route.ts` with:

```ts
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getRow, updateRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { requireMedewerker } from '@/lib/server/requireAuth';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await request.json();
    if ('status' in data) {
      const current = await getRow<{ status: string }>('bestelheaders', params.id);
      if (current && current.status !== data.status) {
        await getPool().query('INSERT INTO bestelstatusHistorie (id, bestelheaderId, status) VALUES (?, ?, ?)', [
          randomUUID(),
          params.id,
          data.status,
        ]);
      }
    }
    await updateRow('bestelheaders', params.id, data);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}
```

(This deletes the `Tijdstippen` interface, `MONOTONE_STATUS_COLUMN`, and all the client-value-stripping logic from the superseded design — none of it is needed. `bestelheaders` no longer has any timestamp columns for `updateRow` to write, so there's nothing left for a client to inject into.)

- [ ] **Step 5: Implement the POST route's initial history row**

In `src/app/api/bestelheaders/route.ts`, change:

```ts
    const headerId = randomUUID();
    await connection.query(
      'INSERT INTO bestelheaders (id, klantId, bestelnr, status) VALUES (?, ?, ?, ?)',
      [headerId, klantId, bestelnr, 'Te beoordelen']
    );

    for (const line of resolvedLines) {
```

to:

```ts
    const headerId = randomUUID();
    await connection.query(
      'INSERT INTO bestelheaders (id, klantId, bestelnr, status) VALUES (?, ?, ?, ?)',
      [headerId, klantId, bestelnr, 'Te beoordelen']
    );
    await connection.query('INSERT INTO bestelstatusHistorie (id, bestelheaderId, status) VALUES (?, ?, ?)', [
      randomUUID(),
      headerId,
      'Te beoordelen',
    ]);

    for (const line of resolvedLines) {
```

- [ ] **Step 6: Create the new GET route**

Create `src/app/api/bestelheaders/[id]/statushistorie/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { requireMedewerker } from '@/lib/server/requireAuth';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const [rows] = await getPool().query(
    'SELECT status, tijdstip FROM bestelstatusHistorie WHERE bestelheaderId = ? ORDER BY tijdstip ASC',
    [params.id]
  );
  return NextResponse.json(rows);
}
```

(Mirrors `src/app/api/drukkers/[id]/zendingen/route.ts`'s `GET` exactly — same auth check, same "select and return" shape.)

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/app/api/bestelheaders.test.ts`
Expected: PASS, full file.

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/app/api/bestelheaders/[id]/route.ts src/app/api/bestelheaders/route.ts src/app/api/bestelheaders/[id]/statushistorie/route.ts tests/app/api/bestelheaders.test.ts
git commit -m "feat: record bestelling status changes in bestelstatusHistorie instead of dedicated columns"
```

---

### Task 3: Client — drop the 4 dead fields everywhere, add the historie hook

**Files:**
- Modify: `src/components/beheer/BestellingenSection.tsx`
- Modify: `src/components/beheer/BeheerShell.tsx`
- Modify: `src/components/beheer/VersturenNaarDrukkerDialog.tsx`
- Modify: `src/components/beheer/DrukkerModal.tsx`
- Create: `src/lib/useBestellingHistorie.ts`
- Test: `tests/components/beheer/BestellingenSection.test.tsx`, `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx`, `tests/components/beheer/DrukkerModal.test.tsx`, `tests/lib/buildDrukkerMail.test.ts`

**Interfaces:**
- Consumes: Task 2's `GET /api/bestelheaders/[id]/statushistorie`.
- Produces: `Bestelling` (in `BestellingenSection.tsx`) drops `teVersturenNaarDrukkerOp`/`verstuurdNaarDrukkerOp`/`afgerondOp`/`afgewezenOp` — `status` itself is unchanged. `useBestellingHistorie(bestellingId: string | null): { historie: Array<{ status: string; tijdstip: Date }> | null; error: boolean }`, consumed by Task 4.

- [ ] **Step 1: Drop the 4 fields from the `Bestelling` interface**

In `src/components/beheer/BestellingenSection.tsx`, change:

```ts
export interface Bestelling {
  id: string;
  klantId: string;
  companyName: string;
  bestelnr: string;
  besteldatum: string;
  status: 'Te beoordelen' | 'Te versturen naar drukker' | 'Verstuurd naar drukker' | 'Afgerond' | 'Afgewezen';
  teVersturenNaarDrukkerOp: string | null;
  verstuurdNaarDrukkerOp: string | null;
  afgerondOp: string | null;
  afgewezenOp: string | null;
  lineCount: number;
  totalQuantity: number;
  lines: BestellingLine[];
}
```

to:

```ts
export interface Bestelling {
  id: string;
  klantId: string;
  companyName: string;
  bestelnr: string;
  besteldatum: string;
  status: 'Te beoordelen' | 'Te versturen naar drukker' | 'Verstuurd naar drukker' | 'Afgerond' | 'Afgewezen';
  lineCount: number;
  totalQuantity: number;
  lines: BestellingLine[];
}
```

- [ ] **Step 2: Revert BeheerShell's `loadBestellingen` and `handleBestellingUpdated`**

In `src/components/beheer/BeheerShell.tsx`, change:

```ts
        const headers = (await response.json()) as Array<{
          id: string;
          klantId: string;
          bestelnr: string;
          besteldatum: string;
          status: string;
          teVersturenNaarDrukkerOp: string | null;
          verstuurdNaarDrukkerOp: string | null;
          afgerondOp: string | null;
          afgewezenOp: string | null;
          lines: BestellingLine[];
        }>;
        if (!cancelled) {
          setRawBestellingen(
            headers.map((header) => ({
              id: header.id,
              klantId: header.klantId,
              bestelnr: header.bestelnr ?? header.id,
              besteldatum: new Date(header.besteldatum).toLocaleDateString('nl-NL'),
              status: header.status,
              teVersturenNaarDrukkerOp: header.teVersturenNaarDrukkerOp ?? null,
              verstuurdNaarDrukkerOp: header.verstuurdNaarDrukkerOp ?? null,
              afgerondOp: header.afgerondOp ?? null,
              afgewezenOp: header.afgewezenOp ?? null,
              lineCount: header.lines.length,
              totalQuantity: header.lines.reduce((sum, line) => sum + (line.quantity ?? 0), 0),
              lines: header.lines,
            })) as RawBestelling[]
          );
```

to:

```ts
        const headers = (await response.json()) as Array<{
          id: string;
          klantId: string;
          bestelnr: string;
          besteldatum: string;
          status: string;
          lines: BestellingLine[];
        }>;
        if (!cancelled) {
          setRawBestellingen(
            headers.map((header) => ({
              id: header.id,
              klantId: header.klantId,
              bestelnr: header.bestelnr ?? header.id,
              besteldatum: new Date(header.besteldatum).toLocaleDateString('nl-NL'),
              status: header.status,
              lineCount: header.lines.length,
              totalQuantity: header.lines.reduce((sum, line) => sum + (line.quantity ?? 0), 0),
              lines: header.lines,
            })) as RawBestelling[]
          );
```

And change:

```ts
  function handleBestellingUpdated(updated: Bestelling) {
    setRawBestellingen((current) =>
      (current ?? []).map((row) =>
        row.id === updated.id
          ? {
              ...row,
              status: updated.status,
              teVersturenNaarDrukkerOp: updated.teVersturenNaarDrukkerOp,
              verstuurdNaarDrukkerOp: updated.verstuurdNaarDrukkerOp,
              afgerondOp: updated.afgerondOp,
              afgewezenOp: updated.afgewezenOp,
            }
          : row
      )
    );
  }
```

to:

```ts
  function handleBestellingUpdated(updated: Bestelling) {
    setRawBestellingen((current) =>
      (current ?? []).map((row) => (row.id === updated.id ? { ...row, status: updated.status } : row))
    );
  }
```

- [ ] **Step 3: Revert `VersturenNaarDrukkerDialog.tsx`'s `onVerstuurd`**

In `src/components/beheer/VersturenNaarDrukkerDialog.tsx`, change:

```ts
      onVerstuurd(
        bestellingen.map((b) => ({
          ...b,
          status: 'Verstuurd naar drukker' as const,
          verstuurdNaarDrukkerOp: b.verstuurdNaarDrukkerOp ?? new Date().toISOString(),
        }))
      );
      onClose();
```

to:

```ts
      onVerstuurd(bestellingen.map((b) => ({ ...b, status: 'Verstuurd naar drukker' as const })));
      onClose();
```

- [ ] **Step 4: Revert `DrukkerModal.tsx`'s `handleMarkeerZendingAlsAfgerond`**

In `src/components/beheer/DrukkerModal.tsx`, change:

```ts
        void logActiviteit('bestelling_afgerond', actorFromMedewerker(user), bestelling.bestelnr);
        onBestellingUpdated({ ...bestelling, status: 'Afgerond', afgerondOp: new Date().toISOString() });
        afgerond += 1;
```

to:

```ts
        void logActiviteit('bestelling_afgerond', actorFromMedewerker(user), bestelling.bestelnr);
        onBestellingUpdated({ ...bestelling, status: 'Afgerond' });
        afgerond += 1;
```

- [ ] **Step 5: Create the `useBestellingHistorie` hook**

Create `src/lib/useBestellingHistorie.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';

export interface BestellingHistorieEntry {
  status: string;
  tijdstip: Date;
}

export function useBestellingHistorie(bestellingId: string | null): {
  historie: BestellingHistorieEntry[] | null;
  error: boolean;
} {
  const [historie, setHistorie] = useState<BestellingHistorieEntry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!bestellingId) {
      setHistorie(null);
      setError(false);
      return;
    }
    let cancelled = false;
    setHistorie(null);
    setError(false);
    async function load() {
      try {
        const response = await fetch(`/api/bestelheaders/${bestellingId}/statushistorie`);
        if (!response.ok) throw new Error('load failed');
        const rows = (await response.json()) as Array<{ status: string; tijdstip: string }>;
        if (cancelled) return;
        setHistorie(rows.map((row) => ({ status: row.status, tijdstip: new Date(row.tijdstip) })));
      } catch {
        if (!cancelled) {
          setError(true);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [bestellingId]);

  return { historie, error };
}
```

(Mirrors `src/lib/useDrukkerZendingen.ts` exactly — same load/cancel/error shape.)

- [ ] **Step 6: Remove the 4 dead fields from the affected test fixtures**

In each of the 4 files below, remove every line matching `teVersturenNaarDrukkerOp: ...,` / `verstuurdNaarDrukkerOp: ...,` / `afgerondOp: ...,` / `afgewezenOp: ...,` from every object literal typed as (or matching the shape of) `Bestelling` — these lines no longer type-check once Step 1 lands. Do not remove `status:` — only the 4 timestamp lines.

`tests/components/beheer/BestellingenSection.test.tsx` — 2 fixture objects (`BESTELLINGEN[0]`, `BESTELLINGEN[1]`, around lines 78-100) each have 4 such lines to delete.

`tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx` — 2 fixture objects (`BESTELLING`, `BESTELLING_2`, around lines 71-91) each have 4 such lines to delete.

`tests/components/beheer/DrukkerModal.test.tsx` — 1 fixture object (`BESTELLING_1`, around lines 208-211) has 4 such lines to delete (`teVersturenNaarDrukkerOp: '2026-06-30T08:00:00.000Z',` / `verstuurdNaarDrukkerOp: '2026-07-01T08:00:00.000Z',` / `afgerondOp: null,` / `afgewezenOp: null,`).

`tests/lib/buildDrukkerMail.test.ts` — 2 inline object literals (around lines 368-369) each contain `teVersturenNaarDrukkerOp: null, verstuurdNaarDrukkerOp: null, afgerondOp: null, afgewezenOp: null,` inline — delete just that substring from each of the 2 lines, leaving the rest of the object literal intact.

- [ ] **Step 7: Revert the 2 stale-workaround assertions this task makes obsolete**

The timestamp fields these assertions guarded against no longer exist on `Bestelling`, so the `expect.objectContaining(..., expect.any(String))` workaround is no longer needed — revert to plain equality.

In `tests/components/beheer/BestellingenSection.test.tsx`, change:

```tsx
    await waitFor(() =>
      expect(onBestellingUpdated).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'header-1',
          status: 'Te versturen naar drukker',
          teVersturenNaarDrukkerOp: expect.any(String),
        })
      )
    );
```

to:

```tsx
    await waitFor(() =>
      expect(onBestellingUpdated).toHaveBeenCalledWith({ ...BESTELLINGEN[0], status: 'Te versturen naar drukker' })
    );
```

In `tests/components/beheer/BestellingenSection.test.tsx`, also change (the bulk-send test, further down the file — search for `verstuurdNaarDrukkerOp: expect.any(String)`):

```tsx
      expect(onBestellingUpdated.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          id: bestellingen[0].id,
          status: 'Verstuurd naar drukker',
          verstuurdNaarDrukkerOp: expect.any(String),
        })
      );
```

to:

```tsx
      expect(onBestellingUpdated.mock.calls[0][0]).toEqual({ ...bestellingen[0], status: 'Verstuurd naar drukker' });
```

In `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx`, change:

```tsx
    expect(onVerstuurd).toHaveBeenCalledWith([
      expect.objectContaining({
        id: BESTELLING.id,
        status: 'Verstuurd naar drukker',
        verstuurdNaarDrukkerOp: expect.any(String),
      }),
    ]);
```

to:

```tsx
    expect(onVerstuurd).toHaveBeenCalledWith([{ ...BESTELLING, status: 'Verstuurd naar drukker' }]);
```

- [ ] **Step 8: Run the affected test files to verify they pass**

Run: `npx vitest run tests/components/beheer/BestellingenSection.test.tsx tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx tests/components/beheer/DrukkerModal.test.tsx tests/lib/buildDrukkerMail.test.ts`
Expected: PASS, all 4 files. (`DrukkerModal.test.tsx` will still have failures at this point from Task 4's not-yet-done historie work if you're executing tasks out of order — expected; only the fixture/type-related failures this task targets should be gone.)

- [ ] **Step 9: Type-check**

Run: `npx tsc --noEmit`
Expected: fails only on `src/components/beheer/BestellingModal.tsx` (Task 4's `statusHistoryEntries` still reads the now-deleted fields) — that's expected and resolved by Task 4. If executing in order, this is fine; if executing out of order, don't treat this as this task's failure.

- [ ] **Step 10: Commit**

```bash
git add src/components/beheer/BestellingenSection.tsx src/components/beheer/BeheerShell.tsx src/components/beheer/VersturenNaarDrukkerDialog.tsx src/components/beheer/DrukkerModal.tsx src/lib/useBestellingHistorie.ts tests/components/beheer/BestellingenSection.test.tsx tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx tests/components/beheer/DrukkerModal.test.tsx tests/lib/buildDrukkerMail.test.ts
git commit -m "refactor: drop the 4 bestelheaders timestamp fields from the client, add useBestellingHistorie"
```

---

### Task 4: BestellingModal — historie list backed by the new hook

**Files:**
- Modify: `src/components/beheer/BestellingModal.tsx`
- Test: `tests/components/beheer/BestellingModal.test.tsx`

**Interfaces:**
- Consumes: Task 3's `useBestellingHistorie` hook and pruned `Bestelling` type.
- Produces: `bestelling-modal-historie` still exists as a test id (the wrapping list), but its items are now keyed by index (`bestelling-modal-historie-item-${index}`), not by status name — because the same status can legitimately appear more than once (Afgerond → Terugzetten → Afgerond again).

- [ ] **Step 1: Remove the 4 dead fields from this file's own fixtures**

In `tests/components/beheer/BestellingModal.test.tsx`, remove every `teVersturenNaarDrukkerOp: ...,` / `verstuurdNaarDrukkerOp: ...,` / `afgerondOp: ...,` / `afgewezenOp: ...,` line from `BESTELLING`, `BESTELLING_MET_EIGEN_MAAT`, `BESTELLING_MET_TWEE_ONGEPRIJSDE_REGELS`, `BESTELLING_VERSTUURD`, and `BESTELLING_AFGEROND` (search the file for those 4 field names — every remaining occurrence is one of these fixtures; `BESTELLING_AFGEROND`'s `afgerondOp: '2026-08-05T09:00:00.000Z',` line goes too, it was overriding the spread from `BESTELLING_VERSTUURD`).

- [ ] **Step 2: Fix the 2 stale-workaround assertions in this file**

Change:

```tsx
    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'header-1',
          status: 'Te versturen naar drukker',
          teVersturenNaarDrukkerOp: expect.any(String),
        })
      )
    );
```

to:

```tsx
    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith({ ...BESTELLING, status: 'Te versturen naar drukker' })
    );
```

and change:

```tsx
    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'header-1', status: 'Afgewezen', afgewezenOp: expect.any(String) })
      )
    );
```

to:

```tsx
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ ...BESTELLING, status: 'Afgewezen' }));
```

- [ ] **Step 3: Fix the Afronden/Terugzetten handlers' `onUpdated` payloads**

In `src/components/beheer/BestellingModal.tsx`, change:

```ts
      void logActiviteit('bestelling_goedgekeurd', actorFromMedewerker(user), bestelling.bestelnr);
      onUpdated({
        ...bestelling,
        status: 'Te versturen naar drukker',
        teVersturenNaarDrukkerOp: bestelling.teVersturenNaarDrukkerOp ?? new Date().toISOString(),
      });
```

to:

```ts
      void logActiviteit('bestelling_goedgekeurd', actorFromMedewerker(user), bestelling.bestelnr);
      onUpdated({ ...bestelling, status: 'Te versturen naar drukker' });
```

Change:

```ts
      void logActiviteit('bestelling_afgewezen', actorFromMedewerker(user), bestelling.bestelnr);
      onUpdated({
        ...bestelling,
        status: 'Afgewezen',
        afgewezenOp: bestelling.afgewezenOp ?? new Date().toISOString(),
      });
```

to:

```ts
      void logActiviteit('bestelling_afgewezen', actorFromMedewerker(user), bestelling.bestelnr);
      onUpdated({ ...bestelling, status: 'Afgewezen' });
```

Change:

```ts
      void logActiviteit('bestelling_afgerond', actorFromMedewerker(user), bestelling.bestelnr);
      onUpdated({ ...bestelling, status: 'Afgerond', afgerondOp: new Date().toISOString() });
```

to:

```ts
      void logActiviteit('bestelling_afgerond', actorFromMedewerker(user), bestelling.bestelnr);
      onUpdated({ ...bestelling, status: 'Afgerond' });
```

Change:

```ts
      void logActiviteit('bestelling_afronding_teruggezet', actorFromMedewerker(user), bestelling.bestelnr);
      onUpdated({ ...bestelling, status: 'Verstuurd naar drukker', afgerondOp: null });
```

to:

```ts
      void logActiviteit('bestelling_afronding_teruggezet', actorFromMedewerker(user), bestelling.bestelnr);
      onUpdated({ ...bestelling, status: 'Verstuurd naar drukker' });
```

Also update `tests/components/beheer/BestellingModal.test.tsx`'s `'sets afgerondOp to null in onUpdated when terugzetten...'` test — change its assertion from:

```tsx
    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith({
        ...BESTELLING_AFGEROND,
        status: 'Verstuurd naar drukker',
        afgerondOp: null,
      })
    );
```

to:

```tsx
    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith({ ...BESTELLING_AFGEROND, status: 'Verstuurd naar drukker' })
    );
```

- [ ] **Step 4: Write the failing historie test**

In `tests/components/beheer/BestellingModal.test.tsx`, replace the existing historie test:

```tsx
  it('shows only the status transitions that actually happened, in order, with their dates', () => {
    renderModal(BESTELLING_AFGEROND);
    const historie = screen.getByTestId('bestelling-modal-historie');
    expect(historie).toHaveTextContent('Te beoordelen');
    expect(historie).toHaveTextContent('Goedgekeurd');
    expect(historie).toHaveTextContent('Verstuurd naar drukker');
    expect(historie).toHaveTextContent('Afgerond');
    expect(screen.queryByTestId('bestelling-modal-historie-afgewezen')).not.toBeInTheDocument();
  });
```

with:

```tsx
  it('fetches and shows the status history from the API, in the order the server returned it', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        { status: 'Te beoordelen', tijdstip: '2026-07-04T08:00:00.000Z' },
        { status: 'Te versturen naar drukker', tijdstip: '2026-07-04T09:00:00.000Z' },
        { status: 'Verstuurd naar drukker', tijdstip: '2026-07-05T08:00:00.000Z' },
        { status: 'Afgerond', tijdstip: '2026-08-05T09:00:00.000Z' },
      ],
    });
    renderModal(BESTELLING_AFGEROND);
    const historie = await screen.findByTestId('bestelling-modal-historie');
    expect(historie).toHaveTextContent('Te beoordelen');
    expect(historie).toHaveTextContent('Goedgekeurd');
    expect(historie).toHaveTextContent('Verstuurd naar drukker');
    expect(historie).toHaveTextContent('Afgerond');
    expect(fetchMock).toHaveBeenCalledWith('/api/bestelheaders/header-5/statushistorie');
  });

  it('shows the same status twice if it was reached twice (Afgerond -> Terugzetten -> Afgerond again)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        { status: 'Te beoordelen', tijdstip: '2026-07-04T08:00:00.000Z' },
        { status: 'Verstuurd naar drukker', tijdstip: '2026-07-05T08:00:00.000Z' },
        { status: 'Afgerond', tijdstip: '2026-07-06T08:00:00.000Z' },
        { status: 'Verstuurd naar drukker', tijdstip: '2026-07-07T08:00:00.000Z' },
        { status: 'Afgerond', tijdstip: '2026-08-05T09:00:00.000Z' },
      ],
    });
    renderModal(BESTELLING_AFGEROND);
    const historie = await screen.findByTestId('bestelling-modal-historie');
    expect(within(historie).getAllByText('Afgerond')).toHaveLength(2);
    expect(within(historie).getAllByText('Verstuurd naar drukker')).toHaveLength(2);
  });
```

In the same file, change the top import:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
```

to:

```tsx
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx -t "status history"`
Expected: FAIL — `BestellingModal` doesn't call `fetch('/api/bestelheaders/.../statushistorie')` yet, still reads the (now-deleted) column fields.

- [ ] **Step 6: Replace `statusHistoryEntries` with the hook**

In `src/components/beheer/BestellingModal.tsx`, change the imports:

```ts
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
```

to:

```ts
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import { useBestellingHistorie } from '@/lib/useBestellingHistorie';
```

Delete the entire `StatusHistoryEntry` interface and `statusHistoryEntries` function (they read the 4 now-deleted fields off `Bestelling`). Replace them with a small label map above the `BestellingModal` component:

```ts
const HISTORIE_LABEL_KEY: Record<string, string> = {
  'Te beoordelen': 'bestellingenHistorieTeBeoordelen',
  'Te versturen naar drukker': 'bestellingenHistorieTeVersturenNaarDrukker',
  'Verstuurd naar drukker': 'bestellingenHistorieVerstuurdNaarDrukker',
  Afgerond: 'bestellingenHistorieAfgerond',
  Afgewezen: 'bestellingenHistorieAfgewezen',
};
```

Inside the `BestellingModal` function, add the hook call alongside the other hooks:

```ts
  const { historie } = useBestellingHistorie(bestelling?.id ?? null);
```

Replace the historie JSX block:

```tsx
          <div className="flex flex-col gap-1 border-t border-white/10 pt-3 text-xs">
            <span className="text-[0.65rem] uppercase tracking-wide text-white/40">{t('bestellingenHistorieTitel')}</span>
            <ul data-testid="bestelling-modal-historie" className="flex flex-col gap-0.5">
              {statusHistoryEntries(bestelling, t).map((entry) => (
                <li key={entry.key} data-testid={`bestelling-modal-historie-${entry.key}`} className="flex justify-between gap-3 text-white/60">
                  <span>{entry.label}</span>
                  <span>{entry.datum}</span>
                </li>
              ))}
            </ul>
          </div>
```

with:

```tsx
          <div className="flex flex-col gap-1 border-t border-white/10 pt-3 text-xs">
            <span className="text-[0.65rem] uppercase tracking-wide text-white/40">{t('bestellingenHistorieTitel')}</span>
            <ul data-testid="bestelling-modal-historie" className="flex flex-col gap-0.5">
              {(historie ?? []).map((entry, index) => (
                <li
                  key={index}
                  data-testid={`bestelling-modal-historie-item-${index}`}
                  className="flex justify-between gap-3 text-white/60"
                >
                  <span>{t(HISTORIE_LABEL_KEY[entry.status] ?? entry.status)}</span>
                  <span>{entry.tijdstip.toLocaleString('nl-NL')}</span>
                </li>
              ))}
            </ul>
          </div>
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx`
Expected: PASS, full file.

- [ ] **Step 8: Run BestellingenSection's suite too (it renders BestellingModal)**

Run: `npx vitest run tests/components/beheer/BestellingenSection.test.tsx`
Expected: PASS. (Rows opened in this file's tests don't mock a `/statushistorie` fetch response — confirm the `fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })` default this file's `beforeEach` already sets doesn't break when `BestellingModal` calls `fetch` for historie; if any test fails here specifically because of the new historie fetch, that test's own mock needs the same default-response treatment, not a change to `BestellingModal` — this file's fetch mock already returns `ok: true` for everything by default, so the historie call should simply resolve to an empty list without failing.)

- [ ] **Step 9: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/components/beheer/BestellingModal.tsx tests/components/beheer/BestellingModal.test.tsx
git commit -m "refactor: back BestellingModal's status-history list with useBestellingHistorie"
```

---

### Task 5: Regression suite — read the new table instead of `afgerondOp`

**Files:**
- Modify: `tests/regression/staging-scenarios.test.ts`

**Interfaces:**
- Consumes: Task 2's `bestelstatusHistorie` table.

- [ ] **Step 1: Update the scenario's final assertion**

In `tests/regression/staging-scenarios.test.ts`, inside the `describe('Bestelling afronden -- van plaatsing tot "Afgerond" met afgerondOp gezet', ...)` block, change:

```ts
      const [rows] = await getPool().query('SELECT status, afgerondOp FROM bestelheaders WHERE id = ?', [
        header.id,
      ]);
      const row = (rows as Array<{ status: string; afgerondOp: Date | null }>)[0];
      expect(row.status).toBe('Afgerond');
      expect(row.afgerondOp).not.toBeNull();
```

to:

```ts
      const [headerRows] = await getPool().query('SELECT status FROM bestelheaders WHERE id = ?', [header.id]);
      expect((headerRows as Array<{ status: string }>)[0].status).toBe('Afgerond');

      const [historieRows] = await getPool().query(
        'SELECT status FROM bestelstatusHistorie WHERE bestelheaderId = ? ORDER BY tijdstip ASC',
        [header.id]
      );
      expect((historieRows as Array<{ status: string }>).map((r) => r.status)).toContain('Afgerond');
```

Also update the `describe` block's title (it names the old column):

```ts
describe('Bestelling afronden -- van plaatsing tot "Afgerond" met afgerondOp gezet', () => {
  it('een bestelling die de volledige weg tot bij de drukker aflegt kan daarna door staff als "Afgerond" gemarkeerd worden, met afgerondOp gezet', async () => {
```

to:

```ts
describe('Bestelling afronden -- van plaatsing tot "Afgerond" met bestelstatusHistorie bijgehouden', () => {
  it('een bestelling die de volledige weg tot bij de drukker aflegt kan daarna door staff als "Afgerond" gemarkeerd worden, met de statusovergang in bestelstatusHistorie', async () => {
```

(The `bestelstatusHistorie` rows this scenario creates are cleaned up automatically — the table has `ON DELETE CASCADE` on `bestelheaderId`, and this scenario's existing `finally` block already deletes the klant via `opruimenKlanten`, which deletes the bestelheader by `klantId`, which cascades. No new cleanup code needed.)

- [ ] **Step 2: Run the regression suite**

Run: `npm run test:regression`
Expected: PASS, including this updated scenario. (Permanently advances the real staging `counters.bestelnummer` — expected, not a bug, per `CLAUDE.md`.)

- [ ] **Step 3: Commit**

```bash
git add tests/regression/staging-scenarios.test.ts
git commit -m "test: read bestelstatusHistorie instead of afgerondOp in the regression scenario"
```

---

## Self-Review Notes

- Every file the superseded plan (`2026-08-05-bestelling-afronden-workflow.md`) touched to add the 4-column design is touched again here to remove it — cross-checked against that plan's own "File Structure" section and the `grep` sweep run 2026-08-06 across `tests/` for all 4 field names, which found exactly the 7 files this plan's tasks cover (`staging-scenarios.test.ts`, `DrukkerModal.test.tsx`, `BestellingenSection.test.tsx`, `VersturenNaarDrukkerDialog.test.tsx`, `BestellingModal.test.tsx`, `bestelheaders.test.ts`, `buildDrukkerMail.test.ts`).
- `src/lib/klantBestellingStatus.ts` and its test are correctly untouched — confirmed again: they only depend on the `Bestelling['status']` union, which this refactor does not change.
- `DrukkerModal.tsx`'s badge/bulk-afronden logic (`afgerondCounts`, the button-visibility gate, the sequential stop-on-first-failure loop) needs no change beyond the one-line `onBestellingUpdated` payload fix in Task 3 Step 4 — verified it only ever reads `.status`, never a timestamp field, both before and after this refactor.
- The new tests added in Task 2 Step 2 specifically cover the two behaviors a plain column-based design structurally cannot (no-duplicate-on-same-status-PATCH, and full-history-across-re-entry) — these are the concrete payoff of the pivot, not just a lossless refactor.
