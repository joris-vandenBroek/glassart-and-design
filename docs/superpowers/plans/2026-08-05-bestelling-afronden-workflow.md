# Bestelling afronden (drukker meldt gereed) Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 05-08-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Beheer mark a bestelling as `'Afgerond'` once the drukker confirms it printed and shipped — either per zending (bulk) or per individual order — closing the loop that today ends at `'Verstuurd naar drukker'`.

**Architecture:** Same Next.js 14 App Router + raw `mysql2` + session-cookie stack as the rest of the app. 4 new nullable `DATETIME` columns on `bestelheaders` — `teVersturenNaarDrukkerOp`, `verstuurdNaarDrukkerOp`, `afgerondOp`, `afgewezenOp` — one per status transition (besides the existing `besteldatum`, which already covers `'Te beoordelen'`), all managed server-side by the existing generic PATCH route rather than trusted from the client (`afgerondOp` is symmetric — set/cleared on every transition in/out of `'Afgerond'`; the other 3 are set-once/monotonic). Two UI surfaces: `BestellingModal.tsx` (single-order Afronden/Terugzetten, plus a small status-history list built from these 4 columns) and `DrukkerModal.tsx` (bulk "Markeer zending als afgerond", which needs the full `Bestelling[]` list threaded down from `BeheerShell`). This 4-column design was expanded mid-implementation, after Task 1 had already shipped just `afgerondOp` — confirmed with the user 2026-08-05 (see Task 2's Interfaces block for the exact set-once semantics and why Terugzetten must not re-stamp `verstuurdNaarDrukkerOp`).

**Tech Stack:** Next.js 14 App Router API routes, raw `mysql2` (`src/lib/server/crud.ts`), Vitest + Testing Library, real MySQL staging database in tests (per `CLAUDE.md`).

## Global Constraints

- `beheer` translation namespace lives only in `messages/nl.json`. `accountPage` (klant-facing) lives in all 4 locale files (`nl`, `en`, `de`, `fr`).
- Every Beheer write that succeeds fires a `logActiviteit(...)` call with `actorFromMedewerker(user)`, and must **not** log on a blocked/failed write — same pattern as every existing handler in `BestellingModal.tsx`/`DrukkerModal.tsx`.
- Schema changes touch two files together: `db/schema.sql` (end-state) and a new `db/migrations/YYYY-MM-DD-<slug>.sql` (forward-only `ALTER TABLE`), then are applied directly to the staging database (this repo has no migration runner) — see `db/migrations/2026-08-02-drukker-standaard.sql` for the exact pattern.
- Test cleanup must only ever delete rows a test itself created, scoped by captured id — never a blanket `DELETE`/`TRUNCATE` (hard rule, `CLAUDE.md`).
- Run `npx tsc --noEmit` after each task — `npm test` does not type-check.
- Never reopen `'Afgewezen'` back to any other status — out of scope per the design spec (`docs/superpowers/specs/2026-07-30-bestelling-afronden-workflow-design.md`).

---

## File Structure

New files:
- `db/migrations/2026-08-05-bestelling-afronden.sql` — Task 1, `afgerondOp` only.
- `db/migrations/2026-08-05-bestelling-status-tijdstippen.sql` — Task 2, the other 3 columns.
- `tests/regression/staging-scenarios.test.ts` — extended with one new scenario (existing file, not new).

Modified files:
- `db/schema.sql` — `teVersturenNaarDrukkerOp`, `verstuurdNaarDrukkerOp`, `afgerondOp`, `afgewezenOp`, all `DATETIME NULL`, on `bestelheaders`.
- `src/app/api/bestelheaders/[id]/route.ts` (+ `tests/app/api/bestelheaders.test.ts`) — PATCH auto-manages all 4 timestamp columns.
- `src/components/beheer/BestellingenSection.tsx` — `Bestelling.status` union gains `'Afgerond'`, `Bestelling` gains all 4 timestamp fields.
- `src/components/beheer/BestellingModal.tsx` (+ its test) — `STATUS_BADGE_CLASS`, Afronden/Terugzetten buttons, status-gated footer actions, status-history list.
- `src/components/beheer/VersturenNaarDrukkerDialog.tsx` (+ its test) — stamps `verstuurdNaarDrukkerOp` on bulk send.
- `src/lib/klantBestellingStatus.ts` (+ `tests/lib/klantBestellingStatus.test.ts`) — new `'afgerond'` klant-facing status.
- `src/components/beheer/DrukkersSection.tsx` (+ its test), `src/components/beheer/DrukkerModal.tsx` (+ its test) — `bestellingen`/`onBestellingUpdated` props, "X / Y afgerond" badge, bulk afronden action.
- `src/components/beheer/BeheerShell.tsx` (+ its test) — reads all 4 timestamp fields from the API, threads `bestellingen`/`handleBestellingUpdated` into `DrukkersSection`.
- `src/lib/logActiviteit.ts` — 2 new `ActiviteitType` values.
- `src/components/beheer/ActiviteitSection.tsx` — 2 new `TYPE_LABEL_KEYS` entries.
- `messages/nl.json` — new `beheer` keys (status buttons, status-history labels, zending badge/action).
- `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json` — new `accountPage.orders.statusAfgerond` key + updated `statusHelp`.
- `tests/components/beheer/BestellingenSection.test.tsx`, `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx` — add all 4 timestamp fields to existing `Bestelling` fixtures, fix 2 exact-match assertions Task 4 makes stale.

---

### Task 1: Database — `afgerondOp` column on `bestelheaders`

**Files:**
- Modify: `db/schema.sql:184-191` (`bestelheaders` table definition)
- Create: `db/migrations/2026-08-05-bestelling-afronden.sql`

**Interfaces:**
- Produces: `bestelheaders.afgerondOp DATETIME NULL` column, available to every later task's SQL and to `getRow`/`listRows`/`insertRow`/`updateRow` (which round-trip arbitrary columns generically).

- [ ] **Step 1: Update the schema file**

In `db/schema.sql`, change:

```sql
CREATE TABLE bestelheaders (
  id CHAR(36) PRIMARY KEY,
  klantId CHAR(36) NOT NULL,
  bestelnr VARCHAR(20) NOT NULL,
  besteldatum TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) NOT NULL DEFAULT 'Te beoordelen',
  FOREIGN KEY (klantId) REFERENCES klanten(id)
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
  afgerondOp DATETIME NULL,
  FOREIGN KEY (klantId) REFERENCES klanten(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 2: Create the migration file**

Create `db/migrations/2026-08-05-bestelling-afronden.sql`:

```sql
-- Migration for bestelling-afronden (2026-08-05)
-- Run once, in order, against a database still on the pre-migration schema.
ALTER TABLE bestelheaders ADD COLUMN afgerondOp DATETIME NULL;
```

- [ ] **Step 3: Apply the migration to the staging database**

Run (from the repo root, so `.env.local` — the staging DB credentials — is picked up):

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
  await conn.query("ALTER TABLE bestelheaders ADD COLUMN afgerondOp DATETIME NULL");
  console.log("afgerondOp column added");
  await conn.end();
})();
'
```

- [ ] **Step 4: Verify the column exists**

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
  const [rows] = await conn.query("DESCRIBE bestelheaders");
  console.log(rows.map((r) => r.Field));
  await conn.end();
})();
'
```

Expected: the printed column list includes `afgerondOp`.

- [ ] **Step 5: Commit**

```bash
git add db/schema.sql db/migrations/2026-08-05-bestelling-afronden.sql
git commit -m "feat: add afgerondOp column to bestelheaders"
```

---

### Task 2: Foundation — status union, status-transition timestamps, badge colour, server-side timestamp management, klant-facing status, activiteitenlog types

**Files:**
- Modify: `db/schema.sql`
- Create: `db/migrations/2026-08-05-bestelling-status-tijdstippen.sql`
- Modify: `src/components/beheer/BestellingenSection.tsx`
- Modify: `src/components/beheer/BestellingModal.tsx` (only `STATUS_BADGE_CLASS`, not the buttons/history list yet — that's Task 4)
- Modify: `src/app/api/bestelheaders/[id]/route.ts`
- Test: `tests/app/api/bestelheaders.test.ts`
- Modify: `src/lib/klantBestellingStatus.ts`
- Test: `tests/lib/klantBestellingStatus.test.ts`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json`
- Modify: `src/lib/logActiviteit.ts`
- Modify: `src/components/beheer/ActiviteitSection.tsx`
- Modify: `tests/components/beheer/BestellingenSection.test.tsx`, `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx` (fixture updates only)

**Interfaces:**
- Consumes: Task 1's `bestelheaders.afgerondOp` column.
- Produces: 3 new `bestelheaders` columns — `teVersturenNaarDrukkerOp DATETIME NULL`, `verstuurdNaarDrukkerOp DATETIME NULL`, `afgewezenOp DATETIME NULL`. `Bestelling['status']` becomes `'Te beoordelen' | 'Te versturen naar drukker' | 'Verstuurd naar drukker' | 'Afgerond' | 'Afgewezen'`. `Bestelling` gains `afgerondOp: string | null`, `teVersturenNaarDrukkerOp: string | null`, `verstuurdNaarDrukkerOp: string | null`, `afgewezenOp: string | null`. `PATCH /api/bestelheaders/[id]` manages all 4 columns whenever `status` is present in the request body:
  - `afgerondOp` is **symmetric**: set to the current time when `status === 'Afgerond'`, cleared to `null` for any other status (unchanged from the original design — a Terugzetten action must clear it).
  - `teVersturenNaarDrukkerOp`, `verstuurdNaarDrukkerOp`, `afgewezenOp` are **set-once / monotonic**: set to the current time the first time `status` becomes their associated value (`'Te versturen naar drukker'`, `'Verstuurd naar drukker'`, `'Afgewezen'` respectively) — i.e. only when the column is currently `NULL` — and never cleared or overwritten afterwards. This is deliberate: a Terugzetten action (`'Afgerond'` → `'Verstuurd naar drukker'`) must **not** reset `verstuurdNaarDrukkerOp` to "now", because the order was never actually un-sent — only its completion was corrected. Confirmed with the user 2026-08-05.
  - `KlantBestellingStatus` gains `'afgerond'`. `ActiviteitType` gains `'bestelling_afgerond' | 'bestelling_afronding_teruggezet'`.

- [ ] **Step 1: Update the schema file and create the migration**

In `db/schema.sql`, change the `bestelheaders` table definition (as left by Task 1) from:

```sql
CREATE TABLE bestelheaders (
  id CHAR(36) PRIMARY KEY,
  klantId CHAR(36) NOT NULL,
  bestelnr VARCHAR(20) NOT NULL,
  besteldatum TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) NOT NULL DEFAULT 'Te beoordelen',
  afgerondOp DATETIME NULL,
  FOREIGN KEY (klantId) REFERENCES klanten(id)
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
  teVersturenNaarDrukkerOp DATETIME NULL,
  verstuurdNaarDrukkerOp DATETIME NULL,
  afgerondOp DATETIME NULL,
  afgewezenOp DATETIME NULL,
  FOREIGN KEY (klantId) REFERENCES klanten(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Create `db/migrations/2026-08-05-bestelling-status-tijdstippen.sql`:

```sql
-- Migration for bestelling-status-tijdstippen (2026-08-05)
-- Run once, in order, against a database still on the pre-migration schema.
ALTER TABLE bestelheaders ADD COLUMN teVersturenNaarDrukkerOp DATETIME NULL;
ALTER TABLE bestelheaders ADD COLUMN verstuurdNaarDrukkerOp DATETIME NULL;
ALTER TABLE bestelheaders ADD COLUMN afgewezenOp DATETIME NULL;
```

- [ ] **Step 2: Apply the migration to staging and verify**

Run (from the repo root, so `.env.local` is picked up):

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
  await conn.query("ALTER TABLE bestelheaders ADD COLUMN teVersturenNaarDrukkerOp DATETIME NULL");
  await conn.query("ALTER TABLE bestelheaders ADD COLUMN verstuurdNaarDrukkerOp DATETIME NULL");
  await conn.query("ALTER TABLE bestelheaders ADD COLUMN afgewezenOp DATETIME NULL");
  console.log("columns added");
  await conn.end();
})();
'
```

Then verify with `DESCRIBE bestelheaders` (same pattern as Task 1 Step 4) — the printed column list must include `teVersturenNaarDrukkerOp`, `verstuurdNaarDrukkerOp`, and `afgewezenOp` alongside the `afgerondOp` Task 1 already added.

- [ ] **Step 3: Extend the `Bestelling` type**

In `src/components/beheer/BestellingenSection.tsx`, change:

```ts
export interface Bestelling {
  id: string;
  klantId: string;
  companyName: string;
  bestelnr: string;
  besteldatum: string;
  status: 'Te beoordelen' | 'Te versturen naar drukker' | 'Verstuurd naar drukker' | 'Afgewezen';
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
  teVersturenNaarDrukkerOp: string | null;
  verstuurdNaarDrukkerOp: string | null;
  afgerondOp: string | null;
  afgewezenOp: string | null;
  lineCount: number;
  totalQuantity: number;
  lines: BestellingLine[];
}
```

- [ ] **Step 4: Add the badge colour**

In `src/components/beheer/BestellingModal.tsx`, change `STATUS_BADGE_CLASS`:

```ts
const STATUS_BADGE_CLASS: Record<Bestelling['status'], string> = {
  'Te beoordelen': 'bg-amber-400/10 text-amber-300',
  'Te versturen naar drukker': 'bg-sky-400/10 text-sky-300',
  'Verstuurd naar drukker': 'bg-green-500/10 text-green-400',
  Afgewezen: 'bg-red-400/10 text-red-400',
};
```

to:

```ts
const STATUS_BADGE_CLASS: Record<Bestelling['status'], string> = {
  'Te beoordelen': 'bg-amber-400/10 text-amber-300',
  'Te versturen naar drukker': 'bg-sky-400/10 text-sky-300',
  'Verstuurd naar drukker': 'bg-green-500/10 text-green-400',
  Afgerond: 'bg-teal-400/10 text-teal-300',
  Afgewezen: 'bg-red-400/10 text-red-400',
};
```

- [ ] **Step 5: Fix existing `Bestelling` fixtures so the codebase still type-checks**

In `tests/components/beheer/BestellingenSection.test.tsx`, add `teVersturenNaarDrukkerOp: null, verstuurdNaarDrukkerOp: null, afgerondOp: null, afgewezenOp: null,` to both objects in the `BESTELLINGEN` array (anywhere in the object; put it after `status:`), and to the `bestellingenMetEigenMaat` fixture defined later in the same file (search for `Bestelling = {` / `Bestelling[] = [` — every literal typed as `Bestelling` needs all 4 fields).

In `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx`, add the same 4 fields (all `null`) to both `BESTELLING` and `BESTELLING_2`.

In `tests/components/beheer/BestellingModal.test.tsx`, add the same 4 fields (all `null`) to `BESTELLING`, `BESTELLING_MET_EIGEN_MAAT`, and `BESTELLING_MET_TWEE_ONGEPRIJSDE_REGELS`.

- [ ] **Step 6: Run the existing tests to confirm nothing else broke**

Run: `npx vitest run tests/components/beheer/BestellingenSection.test.tsx tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx tests/components/beheer/BestellingModal.test.tsx`
Expected: PASS (no behaviour changed yet, just the added fields).

- [ ] **Step 7: Write the failing PATCH-route tests**

Add to `tests/app/api/bestelheaders.test.ts`, inside the `describe('bestelheaders routes', ...)` block (after the existing `'updates header status and a line price as a medewerker'` test):

```ts
  it('sets afgerondOp when a medewerker patches status to Afgerond, and clears it when patched away again', async () => {
    const { cookie } = await klant('afronden@example.com');
    const created = await createHeader(postRequest({ lines: [] }, cookie));
    const header = await created.json();
    const staffCookie = await medewerkerCookie();

    await patchHeader(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: staffCookie },
        body: JSON.stringify({ status: 'Afgerond' }),
      }),
      { params: { id: header.id } }
    );
    const [afgerondRows] = await getPool().query('SELECT status, afgerondOp FROM bestelheaders WHERE id = ?', [
      header.id,
    ]);
    const afgerondRow = (afgerondRows as Array<{ status: string; afgerondOp: Date | null }>)[0];
    expect(afgerondRow.status).toBe('Afgerond');
    expect(afgerondRow.afgerondOp).not.toBeNull();

    await patchHeader(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: staffCookie },
        body: JSON.stringify({ status: 'Verstuurd naar drukker' }),
      }),
      { params: { id: header.id } }
    );
    const [terugRows] = await getPool().query('SELECT status, afgerondOp FROM bestelheaders WHERE id = ?', [
      header.id,
    ]);
    const terugRow = (terugRows as Array<{ status: string; afgerondOp: Date | null }>)[0];
    expect(terugRow.status).toBe('Verstuurd naar drukker');
    expect(terugRow.afgerondOp).toBeNull();
  });

  it('sets teVersturenNaarDrukkerOp/verstuurdNaarDrukkerOp/afgewezenOp once, and never overwrites them again', async () => {
    const { cookie } = await klant('tijdstippen@example.com');
    const created = await createHeader(postRequest({ lines: [] }, cookie));
    const header = await created.json();
    const staffCookie = await medewerkerCookie();

    async function patch(status: string) {
      await patchHeader(
        new Request('http://localhost/api', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', cookie: staffCookie },
          body: JSON.stringify({ status }),
        }),
        { params: { id: header.id } }
      );
    }
    async function readTijdstippen() {
      const [rows] = await getPool().query(
        'SELECT status, teVersturenNaarDrukkerOp, verstuurdNaarDrukkerOp, afgerondOp FROM bestelheaders WHERE id = ?',
        [header.id]
      );
      return (
        rows as Array<{
          status: string;
          teVersturenNaarDrukkerOp: Date | null;
          verstuurdNaarDrukkerOp: Date | null;
          afgerondOp: Date | null;
        }>
      )[0];
    }

    await patch('Te versturen naar drukker');
    const afterGoedkeuren = await readTijdstippen();
    expect(afterGoedkeuren.teVersturenNaarDrukkerOp).not.toBeNull();
    expect(afterGoedkeuren.verstuurdNaarDrukkerOp).toBeNull();

    await patch('Verstuurd naar drukker');
    const afterVerstuurd = await readTijdstippen();
    expect(afterVerstuurd.verstuurdNaarDrukkerOp).not.toBeNull();

    await patch('Afgerond');
    await patch('Verstuurd naar drukker'); // Terugzetten
    const afterTerugzetten = await readTijdstippen();
    // verstuurdNaarDrukkerOp must be untouched by Terugzetten -- same timestamp as before.
    expect(afterTerugzetten.verstuurdNaarDrukkerOp).toEqual(afterVerstuurd.verstuurdNaarDrukkerOp);
    expect(afterTerugzetten.afgerondOp).toBeNull();
  });

  it('sets afgewezenOp once when a medewerker rejects a bestelling', async () => {
    const { cookie } = await klant('afwijzen-tijdstip@example.com');
    const created = await createHeader(postRequest({ lines: [] }, cookie));
    const header = await created.json();
    const staffCookie = await medewerkerCookie();

    await patchHeader(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: staffCookie },
        body: JSON.stringify({ status: 'Afgewezen' }),
      }),
      { params: { id: header.id } }
    );
    const [rows] = await getPool().query('SELECT afgewezenOp FROM bestelheaders WHERE id = ?', [header.id]);
    expect((rows as Array<{ afgewezenOp: Date | null }>)[0].afgewezenOp).not.toBeNull();
  });
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `npx vitest run tests/app/api/bestelheaders.test.ts -t "Op"`
Expected: FAIL — none of the 4 timestamp columns are managed by the route yet.

- [ ] **Step 9: Implement the server-side timestamp management**

In `src/app/api/bestelheaders/[id]/route.ts`, change:

```ts
import { NextResponse } from 'next/server';
import { updateRow } from '@/lib/server/crud';
import { requireMedewerker } from '@/lib/server/requireAuth';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await request.json();
    await updateRow('bestelheaders', params.id, data);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}
```

to:

```ts
import { NextResponse } from 'next/server';
import { getRow, updateRow } from '@/lib/server/crud';
import { requireMedewerker } from '@/lib/server/requireAuth';

interface Tijdstippen {
  teVersturenNaarDrukkerOp: Date | null;
  verstuurdNaarDrukkerOp: Date | null;
  afgewezenOp: Date | null;
}

const MONOTONE_STATUS_COLUMN: Record<string, keyof Tijdstippen> = {
  'Te versturen naar drukker': 'teVersturenNaarDrukkerOp',
  'Verstuurd naar drukker': 'verstuurdNaarDrukkerOp',
  Afgewezen: 'afgewezenOp',
};

// None of these timestamps are ever trusted from the client -- they're derived from
// `status` here. afgerondOp is symmetric (set on entering Afgerond, cleared on leaving
// it, so Terugzetten works). The other 3 are set-once/monotonic: a status can only
// acquire its timestamp the first time it's reached, and Terugzetten (Afgerond ->
// Verstuurd naar drukker) must not re-stamp verstuurdNaarDrukkerOp -- the order was
// never actually un-sent, only its completion was corrected.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await request.json();
    if ('status' in data) {
      data.afgerondOp = data.status === 'Afgerond' ? new Date() : null;

      const column = MONOTONE_STATUS_COLUMN[data.status];
      if (column) {
        const current = await getRow<Tijdstippen>('bestelheaders', params.id);
        if (!current?.[column]) {
          data[column] = new Date();
        }
      }
    }
    await updateRow('bestelheaders', params.id, data);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `npx vitest run tests/app/api/bestelheaders.test.ts`
Expected: PASS, full file.

- [ ] **Step 11: Write the failing klant-facing status test**

Add to `tests/lib/klantBestellingStatus.test.ts`, inside the existing `describe('toKlantBestellingStatus', ...)` block:

```ts
  it('maps "Afgerond" to afgerond', () => {
    expect(toKlantBestellingStatus('Afgerond')).toBe('afgerond');
  });

  it('provides a badge class and translation key for afgerond', () => {
    expect(KLANT_STATUS_BADGE_CLASS.afgerond).toBe('bg-teal-400/10 text-teal-300');
    expect(KLANT_STATUS_TRANSLATION_KEY.afgerond).toBe('statusAfgerond');
  });
```

- [ ] **Step 12: Run the test to verify it fails**

Run: `npx vitest run tests/lib/klantBestellingStatus.test.ts`
Expected: FAIL — `'Afgerond'` is not a valid argument yet (TS) / `afgerond` is `undefined` on the exported records.

- [ ] **Step 13: Extend `klantBestellingStatus.ts`**

In `src/lib/klantBestellingStatus.ts`, change:

```ts
export type KlantBestellingStatus = 'inBehandeling' | 'afgewezen';

const KLANT_STATUS_MAP: Record<Bestelling['status'], KlantBestellingStatus> = {
  'Te beoordelen': 'inBehandeling',
  'Te versturen naar drukker': 'inBehandeling',
  'Verstuurd naar drukker': 'inBehandeling',
  Afgewezen: 'afgewezen',
};

export function toKlantBestellingStatus(status: Bestelling['status']): KlantBestellingStatus {
  return KLANT_STATUS_MAP[status];
}

export const KLANT_STATUS_BADGE_CLASS: Record<KlantBestellingStatus, string> = {
  inBehandeling: 'bg-sky-400/10 text-sky-300',
  afgewezen: 'bg-red-400/10 text-red-400',
};

// Key into the `accountPage.orders` i18n namespace — keeping this a Record (not an
// if/else in each consumer) means a future third KlantBestellingStatus fails to compile
// here until someone picks its label, instead of silently falling through to a wrong one.
export const KLANT_STATUS_TRANSLATION_KEY: Record<KlantBestellingStatus, string> = {
  inBehandeling: 'statusInBehandeling',
  afgewezen: 'statusAfgewezen',
};
```

to:

```ts
export type KlantBestellingStatus = 'inBehandeling' | 'afgerond' | 'afgewezen';

const KLANT_STATUS_MAP: Record<Bestelling['status'], KlantBestellingStatus> = {
  'Te beoordelen': 'inBehandeling',
  'Te versturen naar drukker': 'inBehandeling',
  'Verstuurd naar drukker': 'inBehandeling',
  Afgerond: 'afgerond',
  Afgewezen: 'afgewezen',
};

export function toKlantBestellingStatus(status: Bestelling['status']): KlantBestellingStatus {
  return KLANT_STATUS_MAP[status];
}

export const KLANT_STATUS_BADGE_CLASS: Record<KlantBestellingStatus, string> = {
  inBehandeling: 'bg-sky-400/10 text-sky-300',
  afgerond: 'bg-teal-400/10 text-teal-300',
  afgewezen: 'bg-red-400/10 text-red-400',
};

// Key into the `accountPage.orders` i18n namespace — keeping this a Record (not an
// if/else in each consumer) means a future fourth KlantBestellingStatus fails to compile
// here until someone picks its label, instead of silently falling through to a wrong one.
export const KLANT_STATUS_TRANSLATION_KEY: Record<KlantBestellingStatus, string> = {
  inBehandeling: 'statusInBehandeling',
  afgerond: 'statusAfgerond',
  afgewezen: 'statusAfgewezen',
};
```

- [ ] **Step 14: Add the klant-facing translations in all 4 locale files**

In `messages/nl.json`, change (around line 250-252):

```json
      "statusInBehandeling": "In behandeling",
      "statusAfgewezen": "Afgewezen",
      "statusHelp": "In behandeling betekent dat we je bestelling nog aan het verwerken zijn. Afgewezen betekent dat we de bestelling niet konden uitvoeren — neem gerust contact met ons op als je daar vragen over hebt.",
```

to:

```json
      "statusInBehandeling": "In behandeling",
      "statusAfgerond": "Afgerond",
      "statusAfgewezen": "Afgewezen",
      "statusHelp": "In behandeling betekent dat we je bestelling nog aan het verwerken zijn. Afgerond betekent dat de bestelling geleverd is. Afgewezen betekent dat we de bestelling niet konden uitvoeren — neem gerust contact met ons op als je daar vragen over hebt.",
```

In `messages/en.json`, change (around line 253-255):

```json
      "statusInBehandeling": "In progress",
      "statusAfgewezen": "Rejected",
      "statusHelp": "In progress means we're still processing your order. Rejected means we weren't able to fulfil the order — feel free to contact us if you have any questions.",
```

to:

```json
      "statusInBehandeling": "In progress",
      "statusAfgerond": "Completed",
      "statusAfgewezen": "Rejected",
      "statusHelp": "In progress means we're still processing your order. Completed means the order has been delivered. Rejected means we weren't able to fulfil the order — feel free to contact us if you have any questions.",
```

In `messages/de.json`, change (around line 250-252):

```json
      "statusInBehandeling": "In Bearbeitung",
      "statusAfgewezen": "Abgelehnt",
      "statusHelp": "In Bearbeitung bedeutet, dass wir Ihre Bestellung noch verarbeiten. Abgelehnt bedeutet, dass wir die Bestellung nicht ausführen konnten — kontaktieren Sie uns gerne bei Fragen.",
```

to:

```json
      "statusInBehandeling": "In Bearbeitung",
      "statusAfgerond": "Abgeschlossen",
      "statusAfgewezen": "Abgelehnt",
      "statusHelp": "In Bearbeitung bedeutet, dass wir Ihre Bestellung noch verarbeiten. Abgeschlossen bedeutet, dass die Bestellung geliefert wurde. Abgelehnt bedeutet, dass wir die Bestellung nicht ausführen konnten — kontaktieren Sie uns gerne bei Fragen.",
```

In `messages/fr.json`, change (around line 250-252):

```json
      "statusInBehandeling": "En cours de traitement",
      "statusAfgewezen": "Refusée",
      "statusHelp": "En cours de traitement signifie que nous traitons encore votre commande. Refusée signifie que nous n'avons pas pu exécuter la commande — n'hésitez pas à nous contacter si vous avez des questions.",
```

to:

```json
      "statusInBehandeling": "En cours de traitement",
      "statusAfgerond": "Terminée",
      "statusAfgewezen": "Refusée",
      "statusHelp": "En cours de traitement signifie que nous traitons encore votre commande. Terminée signifie que la commande a été livrée. Refusée signifie que nous n'avons pas pu exécuter la commande — n'hésitez pas à nous contacter si vous avez des questions.",
```

- [ ] **Step 15: Run the klant-status test to verify it passes**

Run: `npx vitest run tests/lib/klantBestellingStatus.test.ts`
Expected: PASS.

- [ ] **Step 16: Add the 2 new ActiviteitType values**

In `src/lib/logActiviteit.ts`, change the end of the `ACTIVITEIT_TYPES` array from:

```ts
  'onderwerp_toegevoegd',
  'onderwerp_gewijzigd',
  'onderwerp_verwijderd',
] as const;
```

to:

```ts
  'onderwerp_toegevoegd',
  'onderwerp_gewijzigd',
  'onderwerp_verwijderd',
  'bestelling_afgerond',
  'bestelling_afronding_teruggezet',
] as const;
```

In `src/components/beheer/ActiviteitSection.tsx`, add to `TYPE_LABEL_KEYS` (after `onderwerp_verwijderd: 'activiteitTypeOnderwerpVerwijderd',`):

```ts
  bestelling_afgerond: 'activiteitTypeBestellingAfgerond',
  bestelling_afronding_teruggezet: 'activiteitTypeBestellingAfrondingTeruggezet',
```

- [ ] **Step 17: Add the activiteitenlog translations**

In `messages/nl.json`, add after `"activiteitTypeBestellingVerstuurdNaarDrukker": "Bestelling verstuurd naar drukker",` (around line 368):

```json
    "activiteitTypeBestellingAfgerond": "Bestelling afgerond",
    "activiteitTypeBestellingAfrondingTeruggezet": "Afronding teruggezet",
```

- [ ] **Step 18: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (`TYPE_LABEL_KEYS` is a `Record<ActiviteitType, string>`, so a missing entry would fail to compile — this is the safety net the existing code comment describes.)

- [ ] **Step 19: Commit**

```bash
git add db/schema.sql db/migrations/2026-08-05-bestelling-status-tijdstippen.sql src/components/beheer/BestellingenSection.tsx src/components/beheer/BestellingModal.tsx src/app/api/bestelheaders/[id]/route.ts tests/app/api/bestelheaders.test.ts src/lib/klantBestellingStatus.ts tests/lib/klantBestellingStatus.test.ts messages/nl.json messages/en.json messages/de.json messages/fr.json src/lib/logActiviteit.ts src/components/beheer/ActiviteitSection.tsx tests/components/beheer/BestellingenSection.test.tsx tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx tests/components/beheer/BestellingModal.test.tsx
git commit -m "feat: add Afgerond status foundation (status-timestamp columns, server-side management, klant status, activiteitenlog types)"
```

---

### Task 3: BeheerShell — read and propagate the status-timestamp fields

**Files:**
- Modify: `src/components/beheer/BeheerShell.tsx`
- Test: `tests/components/beheer/BeheerShell.test.tsx`

**Interfaces:**
- Consumes: Task 2's `Bestelling.teVersturenNaarDrukkerOp`/`verstuurdNaarDrukkerOp`/`afgerondOp`/`afgewezenOp`.
- Produces: `BeheerShell`'s `bestellingen`/`handleBestellingUpdated` now correctly carry all 4 timestamp fields — Task 4 renders them as a history list in `BestellingModal`, Task 5 threads `bestellingen`/`handleBestellingUpdated` into `DrukkersSection`/`DrukkerModal` once those components are ready to consume them.

- [ ] **Step 1: Read the 4 timestamp fields from the API response**

In `src/components/beheer/BeheerShell.tsx`, inside the `loadBestellingen` effect, change the header type and mapping:

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

to:

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

- [ ] **Step 2: Copy the 4 timestamp fields through on update**

In `src/components/beheer/BeheerShell.tsx`, change `handleBestellingUpdated`:

```ts
  function handleBestellingUpdated(updated: Bestelling) {
    setRawBestellingen((current) =>
      (current ?? []).map((row) => (row.id === updated.id ? { ...row, status: updated.status } : row))
    );
  }
```

to:

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

- [ ] **Step 3: Run BeheerShell's existing tests**

Run: `npx vitest run tests/components/beheer/BeheerShell.test.tsx`
Expected: PASS (no new assertions yet — nothing consumes `afgerondOp` outside `BeheerShell` until Task 5; this task's contract is TypeScript compiling and existing behaviour staying green).

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/BeheerShell.tsx
git commit -m "feat: propagate afgerondOp through BeheerShell's bestellingen state"
```

---

### Task 4: BestellingModal — Afronden / Terugzetten, status-gated footer actions, status-history list

**Files:**
- Modify: `src/components/beheer/BestellingModal.tsx`
- Test: `tests/components/beheer/BestellingModal.test.tsx`
- Modify: `src/components/beheer/VersturenNaarDrukkerDialog.tsx`
- Test: `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx`
- Test: `tests/components/beheer/BestellingenSection.test.tsx` (one assertion fix only, per Step 10)

**Interfaces:**
- Consumes: Task 2's extended `Bestelling.status`/`teVersturenNaarDrukkerOp`/`verstuurdNaarDrukkerOp`/`afgerondOp`/`afgewezenOp`, `bestelling_afgerond`/`bestelling_afronding_teruggezet` activiteit types.
- Produces: `bestelling-modal-afronden` / `bestelling-modal-terugzetten` test ids. Footer actions now render exactly one status-appropriate group: Goedkeuren+Afwijzen (`'Te beoordelen'`), nothing (`'Te versturen naar drukker'`), Afronden (`'Verstuurd naar drukker'`), Terugzetten (`'Afgerond'`), nothing (`'Afgewezen'`). A `bestelling-modal-historie` list showing every status transition the order has actually gone through, with its date.

- [ ] **Step 1: Write the failing tests**

Add to `tests/components/beheer/BestellingModal.test.tsx`, as a new `describe` block at the end of the file:

```tsx
const BESTELLING_VERSTUURD: Bestelling = {
  id: 'header-4',
  klantId: 'uid-1',
  companyName: 'Testbedrijf BV',
  bestelnr: 'GD-00104',
  besteldatum: '4-7-2026',
  status: 'Verstuurd naar drukker',
  teVersturenNaarDrukkerOp: '2026-07-04T08:00:00.000Z',
  verstuurdNaarDrukkerOp: '2026-07-05T08:00:00.000Z',
  afgerondOp: null,
  afgewezenOp: null,
  lineCount: 1,
  totalQuantity: 1,
  lines: [{ id: 'line-6', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
};

const BESTELLING_AFGEROND: Bestelling = {
  ...BESTELLING_VERSTUURD,
  id: 'header-5',
  bestelnr: 'GD-00105',
  status: 'Afgerond',
  afgerondOp: '2026-08-05T09:00:00.000Z',
};

describe('BestellingModal — afronden/terugzetten', () => {
  it('shows only Afronden for a bestelling that is Verstuurd naar drukker', () => {
    renderModal(BESTELLING_VERSTUURD);
    expect(screen.getByTestId('bestelling-modal-afronden')).toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-goedkeuren')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-afwijzen')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-terugzetten')).not.toBeInTheDocument();
  });

  it('shows only Terugzetten for a bestelling that is Afgerond', () => {
    renderModal(BESTELLING_AFGEROND);
    expect(screen.getByTestId('bestelling-modal-terugzetten')).toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-afronden')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-goedkeuren')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-afwijzen')).not.toBeInTheDocument();
  });

  it('shows no action buttons for a bestelling that is Te versturen naar drukker or Afgewezen', () => {
    renderModal({ ...BESTELLING_VERSTUURD, status: 'Te versturen naar drukker' });
    expect(screen.queryByTestId('bestelling-modal-goedkeuren')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-afwijzen')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-afronden')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-terugzetten')).not.toBeInTheDocument();

    renderModal({ ...BESTELLING_VERSTUURD, status: 'Afgewezen' });
    expect(screen.queryAllByTestId('bestelling-modal-goedkeuren')).toHaveLength(0);
    expect(screen.queryAllByTestId('bestelling-modal-afronden')).toHaveLength(0);
    expect(screen.queryAllByTestId('bestelling-modal-terugzetten')).toHaveLength(0);
  });

  it('marks the bestelling as Afgerond, logs bestelling_afgerond, and calls onUpdated', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const { onUpdated } = renderModal(BESTELLING_VERSTUURD);
    fireEvent.click(screen.getByTestId('bestelling-modal-afronden'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-4',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'Afgerond' }) })
      )
    );
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ status: 'Afgerond' })));
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'bestelling_afgerond',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'GD-00104'
    );
  });

  it('sets afgerondOp to null in onUpdated when terugzetten, logs bestelling_afronding_teruggezet', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const { onUpdated } = renderModal(BESTELLING_AFGEROND);
    fireEvent.click(screen.getByTestId('bestelling-modal-terugzetten'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-5',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'Verstuurd naar drukker' }) })
      )
    );
    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith({
        ...BESTELLING_AFGEROND,
        status: 'Verstuurd naar drukker',
        afgerondOp: null,
      })
    );
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'bestelling_afronding_teruggezet',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'GD-00105'
    );
  });

  it('shows an error and does not call onUpdated when afronden fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const { onUpdated } = renderModal(BESTELLING_VERSTUURD);
    fireEvent.click(screen.getByTestId('bestelling-modal-afronden'));
    expect(await screen.findByTestId('bestelling-modal-error')).toBeInTheDocument();
    expect(onUpdated).not.toHaveBeenCalled();
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx -t "afronden/terugzetten"`
Expected: FAIL — `bestelling-modal-afronden`/`bestelling-modal-terugzetten` don't exist, and Goedkeuren/Afwijzen currently render regardless of status.

- [ ] **Step 3: Implement the handlers**

In `src/components/beheer/BestellingModal.tsx`, add after `handleAfwijzen`:

```ts
  async function handleAfronden() {
    if (!bestelling) return;
    try {
      const response = await fetch(`/api/bestelheaders/${bestelling.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Afgerond' }),
      });
      if (!response.ok) throw new Error('update failed');
      void logActiviteit('bestelling_afgerond', actorFromMedewerker(user), bestelling.bestelnr);
      onUpdated({ ...bestelling, status: 'Afgerond', afgerondOp: new Date().toISOString() });
    } catch {
      setError(t('bestellingenActionError'));
    }
  }

  async function handleTerugzetten() {
    if (!bestelling) return;
    try {
      const response = await fetch(`/api/bestelheaders/${bestelling.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Verstuurd naar drukker' }),
      });
      if (!response.ok) throw new Error('update failed');
      void logActiviteit('bestelling_afronding_teruggezet', actorFromMedewerker(user), bestelling.bestelnr);
      onUpdated({ ...bestelling, status: 'Verstuurd naar drukker', afgerondOp: null });
    } catch {
      setError(t('bestellingenActionError'));
    }
  }
```

- [ ] **Step 4: Gate the footer actions by status**

Change the `footerActions` prop from:

```tsx
      footerActions={
        bestelling ? (
          <>
            <button
              type="button"
              onClick={handleGoedkeuren}
              disabled={heeftOngeprijsdeRegel}
              data-testid="bestelling-modal-goedkeuren"
              className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('bestellingenGoedkeuren')}
            </button>
            <button
              type="button"
              onClick={handleAfwijzen}
              data-testid="bestelling-modal-afwijzen"
              className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
            >
              {t('bestellingenAfwijzen')}
            </button>
          </>
        ) : null
      }
```

to:

```tsx
      footerActions={
        bestelling && bestelling.status === 'Te beoordelen' ? (
          <>
            <button
              type="button"
              onClick={handleGoedkeuren}
              disabled={heeftOngeprijsdeRegel}
              data-testid="bestelling-modal-goedkeuren"
              className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('bestellingenGoedkeuren')}
            </button>
            <button
              type="button"
              onClick={handleAfwijzen}
              data-testid="bestelling-modal-afwijzen"
              className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
            >
              {t('bestellingenAfwijzen')}
            </button>
          </>
        ) : bestelling && bestelling.status === 'Verstuurd naar drukker' ? (
          <button
            type="button"
            onClick={handleAfronden}
            data-testid="bestelling-modal-afronden"
            className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
          >
            {t('bestellingenAfronden')}
          </button>
        ) : bestelling && bestelling.status === 'Afgerond' ? (
          <button
            type="button"
            onClick={handleTerugzetten}
            data-testid="bestelling-modal-terugzetten"
            className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
          >
            {t('bestellingenTerugzetten')}
          </button>
        ) : null
      }
```

- [ ] **Step 5: Add the two new translations**

In `messages/nl.json`, add after `"bestellingenAfwijzen": "Afwijzen",` (around line 501):

```json
    "bestellingenAfronden": "Afronden",
    "bestellingenTerugzetten": "Terugzetten",
```

- [ ] **Step 6: Fix Goedkeuren/Afwijzen to also stamp their own timestamp, and fix the 2 pre-existing exact-match tests this affects**

`handleGoedkeuren`/`handleAfwijzen` already exist in `BestellingModal.tsx` (unchanged by Steps 1-5 above) and only patch `status` server-side, which — per Task 2 — also makes the server stamp `teVersturenNaarDrukkerOp`/`afgewezenOp` the first time each is reached. The client's optimistic `onUpdated(...)` call must mirror that or the modal's in-memory `bestelling` will show a stale `null` for those fields until the next full reload.

In `src/components/beheer/BestellingModal.tsx`, change:

```ts
  async function handleGoedkeuren() {
    if (!bestelling) return;
    try {
      const response = await fetch(`/api/bestelheaders/${bestelling.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Te versturen naar drukker' }),
      });
      if (!response.ok) throw new Error('update failed');
      void logActiviteit('bestelling_goedgekeurd', actorFromMedewerker(user), bestelling.bestelnr);
      onUpdated({ ...bestelling, status: 'Te versturen naar drukker' });
    } catch {
      setError(t('bestellingenActionError'));
    }
  }
```

to:

```ts
  async function handleGoedkeuren() {
    if (!bestelling) return;
    try {
      const response = await fetch(`/api/bestelheaders/${bestelling.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Te versturen naar drukker' }),
      });
      if (!response.ok) throw new Error('update failed');
      void logActiviteit('bestelling_goedgekeurd', actorFromMedewerker(user), bestelling.bestelnr);
      onUpdated({
        ...bestelling,
        status: 'Te versturen naar drukker',
        teVersturenNaarDrukkerOp: bestelling.teVersturenNaarDrukkerOp ?? new Date().toISOString(),
      });
    } catch {
      setError(t('bestellingenActionError'));
    }
  }
```

And change:

```ts
  async function handleAfwijzen() {
    if (!bestelling) return;
    try {
      const response = await fetch(`/api/bestelheaders/${bestelling.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Afgewezen' }),
      });
      if (!response.ok) throw new Error('update failed');
      void logActiviteit('bestelling_afgewezen', actorFromMedewerker(user), bestelling.bestelnr);
      onUpdated({ ...bestelling, status: 'Afgewezen' });
    } catch {
      setError(t('bestellingenActionError'));
    }
  }
```

to:

```ts
  async function handleAfwijzen() {
    if (!bestelling) return;
    try {
      const response = await fetch(`/api/bestelheaders/${bestelling.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Afgewezen' }),
      });
      if (!response.ok) throw new Error('update failed');
      void logActiviteit('bestelling_afgewezen', actorFromMedewerker(user), bestelling.bestelnr);
      onUpdated({
        ...bestelling,
        status: 'Afgewezen',
        afgewezenOp: bestelling.afgewezenOp ?? new Date().toISOString(),
      });
    } catch {
      setError(t('bestellingenActionError'));
    }
  }
```

(The `bestelling.teVersturenNaarDrukkerOp ?? new Date().toISOString()` / `bestelling.afgewezenOp ?? ...` guard mirrors the server's set-once semantics — in practice these are always `null` before their first transition, since `'Te beoordelen'` and `'Afgewezen'` have no reopen path, but the guard costs nothing and keeps client and server logic symmetric.)

Both pre-existing tests that assert on `onUpdated`'s exact payload now break, because the payload contains a fresh non-deterministic timestamp. In `tests/components/beheer/BestellingModal.test.tsx`, change:

```tsx
    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith({ ...BESTELLING, status: 'Te versturen naar drukker' })
    );
```

to:

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

and change:

```tsx
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ ...BESTELLING, status: 'Afgewezen' }));
```

to:

```tsx
    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'header-1', status: 'Afgewezen', afgewezenOp: expect.any(String) })
      )
    );
```

- [ ] **Step 7: Add the status-history list**

In `src/components/beheer/BestellingModal.tsx`, add this helper function above the `BestellingModal` component (after `isCustomLine`):

```ts
interface StatusHistoryEntry {
  key: string;
  label: string;
  datum: string;
}

function statusHistoryEntries(bestelling: Bestelling, t: (key: string) => string): StatusHistoryEntry[] {
  const candidates: Array<{ key: string; label: string; iso: string | null }> = [
    { key: 'te-beoordelen', label: t('bestellingenHistorieTeBeoordelen'), iso: bestelling.besteldatum },
    {
      key: 'te-versturen',
      label: t('bestellingenHistorieTeVersturenNaarDrukker'),
      iso: bestelling.teVersturenNaarDrukkerOp,
    },
    { key: 'verstuurd', label: t('bestellingenHistorieVerstuurdNaarDrukker'), iso: bestelling.verstuurdNaarDrukkerOp },
    { key: 'afgerond', label: t('bestellingenHistorieAfgerond'), iso: bestelling.afgerondOp },
    { key: 'afgewezen', label: t('bestellingenHistorieAfgewezen'), iso: bestelling.afgewezenOp },
  ];
  return candidates
    .filter((entry) => entry.iso !== null)
    .map((entry) => ({
      key: entry.key,
      label: entry.label,
      // besteldatum already arrives pre-formatted (BeheerShell calls toLocaleDateString on
      // it before it ever reaches this component) -- the other 3 fields are raw ISO strings
      // straight from the API and need formatting here.
      datum: entry.key === 'te-beoordelen' ? (entry.iso as string) : new Date(entry.iso as string).toLocaleString('nl-NL'),
    }));
}
```

Then render it inside the `bestelling && (...)` block in the JSX, right after the closing `</ul>` of the bestelregels list and before the `{error && (...)}` block:

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

Add the translations to `messages/nl.json`, after `"bestellingenTerugzetten": "Terugzetten",`:

```json
    "bestellingenHistorieTitel": "Statushistorie",
    "bestellingenHistorieTeBeoordelen": "Te beoordelen",
    "bestellingenHistorieTeVersturenNaarDrukker": "Goedgekeurd",
    "bestellingenHistorieVerstuurdNaarDrukker": "Verstuurd naar drukker",
    "bestellingenHistorieAfgerond": "Afgerond",
    "bestellingenHistorieAfgewezen": "Afgewezen",
```

Add a test to `tests/components/beheer/BestellingModal.test.tsx`, inside the `describe('BestellingModal — afronden/terugzetten', ...)` block:

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

- [ ] **Step 8: Stamp `verstuurdNaarDrukkerOp` in VersturenNaarDrukkerDialog's bulk send, and fix its exact-match test**

In `src/components/beheer/VersturenNaarDrukkerDialog.tsx`, change:

```ts
      void logActiviteit(
        'bestelling_verstuurd_naar_drukker',
        actorFromMedewerker(user),
        bestellingen.map((b) => b.bestelnr).join(', ')
      );
      onVerstuurd(bestellingen.map((b) => ({ ...b, status: 'Verstuurd naar drukker' as const })));
      onClose();
```

to:

```ts
      void logActiviteit(
        'bestelling_verstuurd_naar_drukker',
        actorFromMedewerker(user),
        bestellingen.map((b) => b.bestelnr).join(', ')
      );
      onVerstuurd(
        bestellingen.map((b) => ({
          ...b,
          status: 'Verstuurd naar drukker' as const,
          verstuurdNaarDrukkerOp: b.verstuurdNaarDrukkerOp ?? new Date().toISOString(),
        }))
      );
      onClose();
```

In `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx`, change:

```tsx
    expect(onVerstuurd).toHaveBeenCalledWith([{ ...BESTELLING, status: 'Verstuurd naar drukker' }]);
```

to:

```tsx
    expect(onVerstuurd).toHaveBeenCalledWith([
      expect.objectContaining({
        id: BESTELLING.id,
        status: 'Verstuurd naar drukker',
        verstuurdNaarDrukkerOp: expect.any(String),
      }),
    ]);
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx`
Expected: PASS, both files.

- [ ] **Step 10: Fix and run BestellingenSection's test (it renders BestellingModal and asserts on the same Goedkeuren payload)**

In `tests/components/beheer/BestellingenSection.test.tsx`, change:

```tsx
    await waitFor(() =>
      expect(onBestellingUpdated).toHaveBeenCalledWith({ ...BESTELLINGEN[0], status: 'Te versturen naar drukker' })
    );
```

to:

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

Run: `npx vitest run tests/components/beheer/BestellingenSection.test.tsx`
Expected: PASS.

- [ ] **Step 11: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add src/components/beheer/BestellingModal.tsx src/components/beheer/VersturenNaarDrukkerDialog.tsx messages/nl.json tests/components/beheer/BestellingModal.test.tsx tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx tests/components/beheer/BestellingenSection.test.tsx
git commit -m "feat: add order-level Afronden/Terugzetten, status-gated footer actions, and a status-history list to BestellingModal"
```

---

### Task 5: DrukkerModal — "X / Y afgerond" badge and bulk "Markeer zending als afgerond"

**Files:**
- Modify: `src/components/beheer/BeheerShell.tsx`
- Modify: `src/components/beheer/DrukkersSection.tsx`
- Test: `tests/components/beheer/DrukkersSection.test.tsx`
- Modify: `src/components/beheer/DrukkerModal.tsx`
- Test: `tests/components/beheer/DrukkerModal.test.tsx`

**Interfaces:**
- Consumes: Task 3's `bestellingen`/`handleBestellingUpdated` in `BeheerShell`. Task 2's `bestelling_afgerond` activiteit type.
- Produces: `DrukkerModal` gains required props `bestellingen: Bestelling[]` and `onBestellingUpdated: (b: Bestelling) => void`. New test ids `drukker-zending-afgerond-badge-${zendingId}`, `drukker-zending-afronden-${zendingId}`, `drukker-zending-afronden-error`.

- [ ] **Step 1: Pass `bestellingen`/`onBestellingUpdated` from BeheerShell into DrukkersSection**

In `src/components/beheer/BeheerShell.tsx`, change:

```tsx
        ) : activeSection === 'drukkers' ? (
          <DrukkersSection
            drukkers={drukkers.items}
            loadError={drukkers.error === 'load' ? t('drukkersLoadError') : null}
            onAdd={drukkers.add}
            onUpdate={drukkers.update}
            onRemove={drukkers.remove}
          />
```

to:

```tsx
        ) : activeSection === 'drukkers' ? (
          <DrukkersSection
            drukkers={drukkers.items}
            bestellingen={bestellingen ?? []}
            loadError={drukkers.error === 'load' ? t('drukkersLoadError') : null}
            onAdd={drukkers.add}
            onUpdate={drukkers.update}
            onRemove={drukkers.remove}
            onBestellingUpdated={handleBestellingUpdated}
          />
```

This won't type-check until `DrukkersSection` accepts the new props — Step 2 below adds them, so run `npx tsc --noEmit` only after Step 2, not right after this step.

- [ ] **Step 2: Wire the new props through DrukkersSection**

In `src/components/beheer/DrukkersSection.tsx`, change:

```tsx
import { DrukkerModal } from './DrukkerModal';
import type { Drukker } from './materiaalTypes';

interface DrukkersSectionProps {
  drukkers: Drukker[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Drukker, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Drukker, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}
```

to:

```tsx
import { DrukkerModal } from './DrukkerModal';
import type { Drukker } from './materiaalTypes';
import type { Bestelling } from './BestellingenSection';

interface DrukkersSectionProps {
  drukkers: Drukker[] | null;
  bestellingen: Bestelling[];
  loadError: string | null;
  onAdd: (data: Omit<Drukker, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Drukker, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
  onBestellingUpdated: (bestelling: Bestelling) => void;
}
```

Change the function signature and the `<DrukkerModal>` render:

```tsx
export function DrukkersSection({ drukkers, loadError, onAdd, onUpdate, onRemove }: DrukkersSectionProps) {
```

to:

```tsx
export function DrukkersSection({
  drukkers,
  bestellingen,
  loadError,
  onAdd,
  onUpdate,
  onRemove,
  onBestellingUpdated,
}: DrukkersSectionProps) {
```

```tsx
      <DrukkerModal
        state={modalState}
        onClose={() => setModalState(null)}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />
```

to:

```tsx
      <DrukkerModal
        state={modalState}
        bestellingen={bestellingen}
        onClose={() => setModalState(null)}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onRemove={onRemove}
        onBestellingUpdated={onBestellingUpdated}
      />
```

- [ ] **Step 3: Update DrukkersSection's test render helper**

In `tests/components/beheer/DrukkersSection.test.tsx`, change `renderSection`'s default props to include `bestellingen: []` and `onBestellingUpdated: vi.fn()`:

```tsx
function renderSection(overrides: Partial<React.ComponentProps<typeof DrukkersSection>> = {}) {
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  const onBestellingUpdated = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <DrukkersSection
        drukkers={DRUKKERS}
        bestellingen={[]}
        loadError={null}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onRemove={onRemove}
        onBestellingUpdated={onBestellingUpdated}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  return { onAdd, onUpdate, onRemove, onBestellingUpdated };
}
```

- [ ] **Step 4: Run DrukkersSection's tests**

Run: `npx vitest run tests/components/beheer/DrukkersSection.test.tsx`
Expected: FAIL for now — `DrukkerModal` doesn't accept `bestellingen`/`onBestellingUpdated` yet (next steps fix this).

- [ ] **Step 5: Write the failing DrukkerModal tests**

Add to `tests/components/beheer/DrukkerModal.test.tsx`, a new `describe` block at the end of the file. First update the imports at the top of the file to also import `Bestelling`:

```ts
import type { Drukker } from '@/components/beheer/materiaalTypes';
```

to:

```ts
import type { Drukker } from '@/components/beheer/materiaalTypes';
import type { Bestelling } from '@/components/beheer/BestellingenSection';
```

Update `renderModal` to accept and pass through `bestellingen`/`onBestellingUpdated`:

```ts
function renderModal(state: { mode: 'edit'; drukker: Drukker } | { mode: 'add' } | null) {
  const onClose = vi.fn();
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <DrukkerModal state={state} onClose={onClose} onAdd={onAdd} onUpdate={onUpdate} onRemove={onRemove} />
    </NextIntlClientProvider>
  );
  return { onClose, onAdd, onUpdate, onRemove };
}
```

to:

```ts
function renderModal(
  state: { mode: 'edit'; drukker: Drukker } | { mode: 'add' } | null,
  overrides: { bestellingen?: Bestelling[]; onBestellingUpdated?: (b: Bestelling) => void } = {}
) {
  const onClose = vi.fn();
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  const onBestellingUpdated = overrides.onBestellingUpdated ?? vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <DrukkerModal
        state={state}
        bestellingen={overrides.bestellingen ?? []}
        onClose={onClose}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onRemove={onRemove}
        onBestellingUpdated={onBestellingUpdated}
      />
    </NextIntlClientProvider>
  );
  return { onClose, onAdd, onUpdate, onRemove, onBestellingUpdated };
}
```

Then add:

```tsx
describe('DrukkerModal — zending afronden', () => {
  const BESTELLING_1: Bestelling = {
    id: 'header-1',
    klantId: 'uid-1',
    companyName: 'Testbedrijf BV',
    bestelnr: 'GD-00201',
    besteldatum: '1-7-2026',
    status: 'Verstuurd naar drukker',
    teVersturenNaarDrukkerOp: '2026-06-30T08:00:00.000Z',
    verstuurdNaarDrukkerOp: '2026-07-01T08:00:00.000Z',
    afgerondOp: null,
    afgewezenOp: null,
    lineCount: 1,
    totalQuantity: 1,
    lines: [],
  };
  const BESTELLING_2: Bestelling = { ...BESTELLING_1, id: 'header-2', bestelnr: 'GD-00202' };

  function mockZending(bestellingIds: string[]) {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'zending-1',
          verzondenOp: '2026-07-24T10:00:00Z',
          onderwerp: 'x',
          body: 'x',
          bestellingIds,
          aantalKlanten: 1,
          aantalRegels: bestellingIds.length,
          verzondDoor: 'paul@glassartanddesign.com',
        },
      ],
    });
  }

  it('shows "0 / 2 afgerond" and the afronden button when none of the zending\'s bestellingen are done', async () => {
    mockZending(['header-1', 'header-2']);
    renderModal({ mode: 'edit', drukker: DRUKKER }, { bestellingen: [BESTELLING_1, BESTELLING_2] });
    const zendingRow = await screen.findByTestId('drukker-zending-zending-1');
    expect(zendingRow).toHaveTextContent('0 / 2 afgerond');
    expect(screen.getByTestId('drukker-zending-afronden-zending-1')).toBeInTheDocument();
  });

  it('hides the afronden button once every bestelling in the zending is Afgerond', async () => {
    mockZending(['header-1', 'header-2']);
    renderModal(
      { mode: 'edit', drukker: DRUKKER },
      {
        bestellingen: [
          { ...BESTELLING_1, status: 'Afgerond' },
          { ...BESTELLING_2, status: 'Afgerond' },
        ],
      }
    );
    const zendingRow = await screen.findByTestId('drukker-zending-zending-1');
    expect(zendingRow).toHaveTextContent('2 / 2 afgerond');
    expect(screen.queryByTestId('drukker-zending-afronden-zending-1')).not.toBeInTheDocument();
  });

  it('marks every Verstuurd-naar-drukker bestelling in the zending as Afgerond, sequentially, and logs each one', async () => {
    mockZending(['header-1', 'header-2']);
    const { onBestellingUpdated } = renderModal(
      { mode: 'edit', drukker: DRUKKER },
      { bestellingen: [BESTELLING_1, BESTELLING_2] }
    );
    await screen.findByTestId('drukker-zending-zending-1');
    fetchMock.mockResolvedValue({ ok: true });
    fireEvent.click(screen.getByTestId('drukker-zending-afronden-zending-1'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'Afgerond' }) })
      )
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-2',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'Afgerond' }) })
      )
    );
    await waitFor(() => expect(onBestellingUpdated).toHaveBeenCalledTimes(2));
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'bestelling_afgerond',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'GD-00201'
    );
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'bestelling_afgerond',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'GD-00202'
    );
  });

  it('stops on the first failing PATCH and reports how many succeeded', async () => {
    mockZending(['header-1', 'header-2']);
    renderModal({ mode: 'edit', drukker: DRUKKER }, { bestellingen: [BESTELLING_1, BESTELLING_2] });
    await screen.findByTestId('drukker-zending-zending-1');
    let call = 0;
    fetchMock.mockImplementation(() => {
      call += 1;
      return call === 1 ? Promise.resolve({ ok: true }) : Promise.reject(new Error('offline'));
    });
    fireEvent.click(screen.getByTestId('drukker-zending-afronden-zending-1'));

    expect(await screen.findByTestId('drukker-zending-afronden-error')).toHaveTextContent('1');
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/DrukkerModal.test.tsx tests/components/beheer/DrukkersSection.test.tsx`
Expected: FAIL — `bestellingen` prop doesn't exist on `DrukkerModal` yet, badge/button test ids don't exist.

- [ ] **Step 7: Add the translations**

In `messages/nl.json`, add after `"drukkersZendingenSamenvatting": "{klanten} klanten, {regels} regels",` (around line 696):

```json
    "drukkersZendingAfgerondBadge": "{afgerond} / {totaal} afgerond",
    "drukkersMarkeerZendingAlsAfgerond": "Markeer zending als afgerond",
    "drukkersMarkeerZendingAlsAfgerondError": "Niet alle bestellingen konden worden afgerond ({afgerond} van {totaal}).",
```

- [ ] **Step 8: Implement DrukkerModal.tsx**

In `src/components/beheer/DrukkerModal.tsx`, change the imports and props:

```tsx
import { useDrukkerZendingen } from '@/lib/useDrukkerZendingen';
import type { Drukker } from './materiaalTypes';

type ModalState = { mode: 'add' } | { mode: 'edit'; drukker: Drukker } | null;

interface DrukkerModalProps {
  state: ModalState;
  onClose: () => void;
  onAdd: (data: Omit<Drukker, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Drukker, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}
```

to:

```tsx
import { useDrukkerZendingen, type DrukkerZending } from '@/lib/useDrukkerZendingen';
import type { Drukker } from './materiaalTypes';
import type { Bestelling } from './BestellingenSection';

type ModalState = { mode: 'add' } | { mode: 'edit'; drukker: Drukker } | null;

interface DrukkerModalProps {
  state: ModalState;
  bestellingen: Bestelling[];
  onClose: () => void;
  onAdd: (data: Omit<Drukker, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Drukker, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
  onBestellingUpdated: (bestelling: Bestelling) => void;
}
```

Change the function signature (add `bestellingen`/`onBestellingUpdated`, add `zendingActionError` state):

```tsx
export function DrukkerModal({ state, onClose, onAdd, onUpdate, onRemove }: DrukkerModalProps) {
  const t = useTranslations('beheer');
  const { user } = useAdminAuth();
  const [fields, setFields] = useState<FormFields>(EMPTY_FIELDS);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedZendingId, setExpandedZendingId] = useState<string | null>(null);
  const drukkerId = state?.mode === 'edit' ? state.drukker.id : null;
  const { zendingen, error: zendingenError } = useDrukkerZendingen(drukkerId);

  useEffect(() => {
    if (state?.mode === 'edit') {
      const { naam, adres, postcode, plaats, email, prijsafspraken, standaard } = state.drukker;
      setFields({ naam, adres, postcode, plaats, email, prijsafspraken, standaard: standaard ?? false });
    } else if (state?.mode === 'add') {
      setFields(EMPTY_FIELDS);
    }
    setActionError(null);
    setExpandedZendingId(null);
  }, [state]);
```

to:

```tsx
export function DrukkerModal({
  state,
  bestellingen,
  onClose,
  onAdd,
  onUpdate,
  onRemove,
  onBestellingUpdated,
}: DrukkerModalProps) {
  const t = useTranslations('beheer');
  const { user } = useAdminAuth();
  const [fields, setFields] = useState<FormFields>(EMPTY_FIELDS);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedZendingId, setExpandedZendingId] = useState<string | null>(null);
  const [zendingActionError, setZendingActionError] = useState<{ zendingId: string; message: string } | null>(
    null
  );
  const drukkerId = state?.mode === 'edit' ? state.drukker.id : null;
  const { zendingen, error: zendingenError } = useDrukkerZendingen(drukkerId);

  useEffect(() => {
    if (state?.mode === 'edit') {
      const { naam, adres, postcode, plaats, email, prijsafspraken, standaard } = state.drukker;
      setFields({ naam, adres, postcode, plaats, email, prijsafspraken, standaard: standaard ?? false });
    } else if (state?.mode === 'add') {
      setFields(EMPTY_FIELDS);
    }
    setActionError(null);
    setExpandedZendingId(null);
    setZendingActionError(null);
  }, [state]);

  function afgerondCounts(zending: DrukkerZending): { afgerond: number; totaal: number } {
    const orders = zending.bestellingIds
      .map((id) => bestellingen.find((b) => b.id === id))
      .filter((b): b is Bestelling => b != null);
    return { afgerond: orders.filter((b) => b.status === 'Afgerond').length, totaal: zending.bestellingIds.length };
  }

  async function handleMarkeerZendingAlsAfgerond(zending: DrukkerZending) {
    setZendingActionError(null);
    const teAfronden = zending.bestellingIds
      .map((id) => bestellingen.find((b) => b.id === id))
      .filter((b): b is Bestelling => b != null && b.status === 'Verstuurd naar drukker');
    let afgerond = 0;
    for (const bestelling of teAfronden) {
      try {
        const response = await fetch(`/api/bestelheaders/${bestelling.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'Afgerond' }),
        });
        if (!response.ok) throw new Error('update failed');
        void logActiviteit('bestelling_afgerond', actorFromMedewerker(user), bestelling.bestelnr);
        onBestellingUpdated({ ...bestelling, status: 'Afgerond', afgerondOp: new Date().toISOString() });
        afgerond += 1;
      } catch {
        setZendingActionError({
          zendingId: zending.id,
          message: t('drukkersMarkeerZendingAlsAfgerondError', { afgerond, totaal: teAfronden.length }),
        });
        return;
      }
    }
  }
```

Now update the zendingen list JSX. Change:

```tsx
              <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                {zendingen.map((zending) => (
                  <li key={zending.id} data-testid={`drukker-zending-${zending.id}`} className="rounded-sm bg-black/30 p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        {zending.verzondenOp ? zending.verzondenOp.toLocaleString('nl-NL') : ''} —{' '}
                        {t('drukkersZendingenSamenvatting', {
                          klanten: zending.aantalKlanten,
                          regels: zending.aantalRegels,
                        })}
                      </span>
                      <button
                        type="button"
                        data-testid={`drukker-zending-bekijken-${zending.id}`}
                        onClick={() =>
                          setExpandedZendingId((current) => (current === zending.id ? null : zending.id))
                        }
                        className="shrink-0 text-white/50 underline underline-offset-2 hover:text-white"
                      >
                        {expandedZendingId === zending.id
                          ? t('drukkersZendingenVerbergen')
                          : t('drukkersZendingenBekijken')}
                      </button>
                    </div>
                    {expandedZendingId === zending.id && (
                      <pre className="mt-2 whitespace-pre-wrap text-white/70">{zending.body}</pre>
                    )}
                  </li>
                ))}
              </ul>
```

to:

```tsx
              <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                {zendingen.map((zending) => {
                  const { afgerond, totaal } = afgerondCounts(zending);
                  return (
                    <li key={zending.id} data-testid={`drukker-zending-${zending.id}`} className="rounded-sm bg-black/30 p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span>
                          {zending.verzondenOp ? zending.verzondenOp.toLocaleString('nl-NL') : ''} —{' '}
                          {t('drukkersZendingenSamenvatting', {
                            klanten: zending.aantalKlanten,
                            regels: zending.aantalRegels,
                          })}
                        </span>
                        <button
                          type="button"
                          data-testid={`drukker-zending-bekijken-${zending.id}`}
                          onClick={() =>
                            setExpandedZendingId((current) => (current === zending.id ? null : zending.id))
                          }
                          className="shrink-0 text-white/50 underline underline-offset-2 hover:text-white"
                        >
                          {expandedZendingId === zending.id
                            ? t('drukkersZendingenVerbergen')
                            : t('drukkersZendingenBekijken')}
                        </button>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <span
                          data-testid={`drukker-zending-afgerond-badge-${zending.id}`}
                          className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/70"
                        >
                          {t('drukkersZendingAfgerondBadge', { afgerond, totaal })}
                        </span>
                        {afgerond < totaal && (
                          <button
                            type="button"
                            data-testid={`drukker-zending-afronden-${zending.id}`}
                            onClick={() => handleMarkeerZendingAlsAfgerond(zending)}
                            className="shrink-0 text-white/50 underline underline-offset-2 hover:text-white"
                          >
                            {t('drukkersMarkeerZendingAlsAfgerond')}
                          </button>
                        )}
                      </div>
                      {zendingActionError?.zendingId === zending.id && (
                        <p data-testid="drukker-zending-afronden-error" className="mt-1.5 text-red-400">
                          {zendingActionError.message}
                        </p>
                      )}
                      {expandedZendingId === zending.id && (
                        <pre className="mt-2 whitespace-pre-wrap text-white/70">{zending.body}</pre>
                      )}
                    </li>
                  );
                })}
              </ul>
```

Note: `zendingActionError` carries the failing zending's id so the error renders under that specific row even when a drukker has multiple zendingen — matching the spec's "geen automatische retry, geen silent-partial-succes" requirement.

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/DrukkerModal.test.tsx tests/components/beheer/DrukkersSection.test.tsx`
Expected: PASS, both files.

- [ ] **Step 10: Run BeheerShell's tests too (it renders DrukkersSection)**

Run: `npx vitest run tests/components/beheer/BeheerShell.test.tsx`
Expected: PASS.

- [ ] **Step 11: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add src/components/beheer/BeheerShell.tsx src/components/beheer/DrukkersSection.tsx src/components/beheer/DrukkerModal.tsx messages/nl.json tests/components/beheer/DrukkersSection.test.tsx tests/components/beheer/DrukkerModal.test.tsx
git commit -m "feat: add per-zending afgerond badge and bulk markeer-als-afgerond action to DrukkerModal"
```

---

### Task 6: Regression suite scenario

**Files:**
- Modify: `tests/regression/staging-scenarios.test.ts`

**Interfaces:**
- Consumes: everything above, end-to-end against the real staging database.

- [ ] **Step 1: Read the existing file's fixture/cleanup conventions**

Open `tests/regression/staging-scenarios.test.ts` and locate its existing helper functions for creating an `AUTOTEST`-prefixed klant/kunstwerk/bestelling and its `finally`-block cleanup pattern (per `CLAUDE.md`'s description of this file — every fixture is prefixed `AUTOTEST`/`autotest-` and deleted by exact id in a `finally` block).

- [ ] **Step 2: Add the new scenario**

Add a new `it(...)` (in the same file, reusing its existing helpers) that: creates an `AUTOTEST` klant and a bestelling for them via the real `POST /api/bestelheaders` route, staff-patches it through `'Te versturen naar drukker'` → `'Verstuurd naar drukker'` (reusing whatever helper the file already has for advancing status, or calling `patchHeader` directly the way `tests/app/api/bestelheaders.test.ts` does), then calls the header PATCH route with `{ status: 'Afgerond' }` and asserts both `status === 'Afgerond'` and `afgerondOp` is non-null via a direct `getPool().query(...)` read — mirroring the assertion style of Task 2 Step 5's test. Clean up the created klant/bestelheader by exact id in the `finally` block, consistent with every other scenario in the file.

- [ ] **Step 3: Run the regression suite**

Run: `npm run test:regression`
Expected: PASS, including the new scenario. (This run permanently advances the real `counters.bestelnummer` by 1 — expected and accepted per `CLAUDE.md`.)

- [ ] **Step 4: Commit**

```bash
git add tests/regression/staging-scenarios.test.ts
git commit -m "test: add bestelling-afronden scenario to the regression suite"
```

---

## Self-Review Notes

- Spec Sectie A (status flow), B (datamodel), C (zending-niveau bulk), D (order-niveau), E (activiteitenlog), F (badge/quickFilter) are each covered by Task 1/2/5/4/2/2 respectively. QuickFilter (F) needed no code change — already targets `'Te versturen naar drukker'` and stays that way per the spec.
- The design spec's file references (`BestellingenSection.tsx` for `STATUS_BADGE_CLASS`) were written before the Firestore→MySQL migration moved that constant into `BestellingModal.tsx` — this plan uses the actual current location.
- Discovered while implementing, not in the original spec, but required for `tsc --noEmit` to pass: `src/lib/klantBestellingStatus.ts`'s `KLANT_STATUS_MAP` is an exhaustive `Record<Bestelling['status'], ...>` — adding `'Afgerond'` to the union forces a klant-facing status choice (Task 2, Steps 11-13). Its own code comment predicted exactly this ("a future third KlantBestellingStatus fails to compile here until someone picks its label").
- Also discovered, and confirmed with the user before proceeding: `BestellingModal.tsx`'s footer actions rendered Goedkeuren/Afwijzen unconditionally regardless of `bestelling.status` — a latent bug that would have let a shipped/completed order's status regress. Task 4 fixes this as part of the same footer-actions rewrite.
- Scope expanded mid-execution, after Task 1 had already shipped and been applied to staging: the user asked (while Task 1's PR-equivalent commit was landing) whether every status transition gets a visible date, not just the final "Afgerond" one. Confirmed 2026-08-05: yes, and as its own proper design rather than bolted on — 3 more `DATETIME NULL` columns (`teVersturenNaarDrukkerOp`, `verstuurdNaarDrukkerOp`, `afgewezenOp`), set-once/monotonic semantics (Terugzetten must not re-stamp `verstuurdNaarDrukkerOp`), and a small status-history list in `BestellingModal`. Folded into Task 2 (schema+types+route) and Task 4 (the history-list UI + the optimistic-update knock-on fixes in `handleGoedkeuren`/`handleAfwijzen`/`VersturenNaarDrukkerDialog`) rather than issuing a second migration task, since Task 2/4 hadn't been dispatched yet. Task 1's already-applied `afgerondOp` column and commit stand unchanged — only Task 2 onward reflects the 4-column design.
