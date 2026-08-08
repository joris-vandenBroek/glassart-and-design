# Standaard drukker Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 02-08-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff mark one drukker as the "standaard drukker" so the doorzet-naar-drukker dialog pre-selects a deliberately chosen printer instead of whichever row happens to come back first from the database.

**Architecture:** Add a `standaard BOOLEAN DEFAULT FALSE` column to the `drukkers` table. Move `drukkers` off the generic `[resource]` catch-all CRUD route onto a dedicated route pair that enforces "at most one `standaard = TRUE` row" at the application level (clear-then-set, no DB constraint). Add a checkbox in the drukker edit modal and a badge in the list, and change `VersturenNaarDrukkerDialog`'s default-selection logic to prefer the standaard drukker, falling back to the first row when none is set.

**Tech Stack:** Next.js 14 App Router API routes, raw `mysql2` (`src/lib/server/crud.ts`), Vitest + Testing Library, real MySQL staging database in tests.

## Global Constraints

- Boolean columns use `BOOLEAN DEFAULT FALSE`, camelCase name — see `db/schema.sql` (`staatEigenMaatToe`, `aiGegenereerd`).
- Schema changes touch two files together: `db/schema.sql` (end-state) and a new `db/migrations/YYYY-MM-DD-<slug>.sql` (forward-only `ALTER TABLE`), then are applied directly to the staging database (this repo has no migration runner).
- Test cleanup must only ever delete rows a test itself created, scoped by captured id — never a blanket `DELETE`/`TRUNCATE`.
- No `activiteitenlog` entry for changing the standaard-vlag (explicitly decided against).
- `beheer` translation namespace lives only in `messages/nl.json` — no other locale file needs the new keys.
- Never push this to production without deploying + verifying on staging first (standing rule, not part of this plan's scope — this plan only touches staging).

---

### Task 1: Add `standaard` column to `drukkers` (schema + migration + apply to staging)

**Files:**
- Modify: `db/schema.sql:127-135` (`drukkers` table definition)
- Create: `db/migrations/2026-08-02-drukker-standaard.sql`

**Interfaces:**
- Produces: `drukkers.standaard BOOLEAN DEFAULT FALSE` column, available to every later task's SQL and to `getRow`/`listRows`/`insertRow`/`updateRow` in `src/lib/server/crud.ts` (which already round-trip arbitrary columns generically).

- [ ] **Step 1: Edit `db/schema.sql`**

Change the `drukkers` table definition at `db/schema.sql:127-135` from:

```sql
CREATE TABLE drukkers (
  id CHAR(36) PRIMARY KEY,
  naam VARCHAR(255) NOT NULL,
  adres VARCHAR(255),
  postcode VARCHAR(20),
  plaats VARCHAR(255),
  email VARCHAR(255),
  prijsafspraken TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

to:

```sql
CREATE TABLE drukkers (
  id CHAR(36) PRIMARY KEY,
  naam VARCHAR(255) NOT NULL,
  adres VARCHAR(255),
  postcode VARCHAR(20),
  plaats VARCHAR(255),
  email VARCHAR(255),
  prijsafspraken TEXT,
  standaard BOOLEAN DEFAULT FALSE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 2: Create the migration file**

Create `db/migrations/2026-08-02-drukker-standaard.sql`:

```sql
-- Migration for drukker-standaard (2026-08-02)
-- Run once, in order, against a database still on the pre-migration schema.
ALTER TABLE drukkers ADD COLUMN standaard BOOLEAN DEFAULT FALSE;
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
  await conn.query("ALTER TABLE drukkers ADD COLUMN standaard BOOLEAN DEFAULT FALSE");
  console.log("standaard column added");
  await conn.end();
})();
'
```

Expected output: `standaard column added`

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
  const [rows] = await conn.query("SHOW COLUMNS FROM drukkers LIKE \"standaard\"");
  console.log(JSON.stringify(rows));
  await conn.end();
})();
'
```

Expected output: a JSON array with one row where `Field` is `"standaard"`, `Type` is `"tinyint(1)"`, `Default` is `"0"`.

- [ ] **Step 5: Commit**

```bash
git add db/schema.sql db/migrations/2026-08-02-drukker-standaard.sql
git commit -m "feat: add standaard column to drukkers table"
```

---

### Task 2: Dedicated `drukkers` API routes with standaard-exclusivity logic

**Files:**
- Create: `src/app/api/drukkers/route.ts`
- Create: `src/app/api/drukkers/[id]/route.ts`
- Modify: `src/lib/server/lookupResources.ts:25` (remove the `drukkers` entry)
- Test: `tests/app/api/drukkers.test.ts`

**Interfaces:**
- Consumes: `listRows`, `getRow`, `insertRow`, `updateRow`, `deleteRow` from `src/lib/server/crud.ts` (all already exist, generic over table name — see signatures already used by `src/app/api/kunstenaars/route.ts` and `src/app/api/kunstenaars/[id]/route.ts`); `requireMedewerker` from `src/lib/server/requireAuth.ts`; `getPool` from `src/lib/server/db.ts`.
- Produces: `GET /api/drukkers`, `POST /api/drukkers`, `GET /api/drukkers/:id`, `PATCH /api/drukkers/:id`, `DELETE /api/drukkers/:id` — same request/response shape as the generic catch-all did (list/object JSON, `{ ok: true }` on PATCH/DELETE, `{ error: 'unauthorized' }` 401, `{ error: 'not-found' }` 404), so `src/lib/useApiCollection.ts` (used by `BeheerShell.tsx:260`) needs no changes. `POST`/`PATCH` bodies with `standaard: true` clear the flag on every other row first.

- [ ] **Step 1: Write the failing test**

Create `tests/app/api/drukkers.test.ts`:

```ts
import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { insertRow } from '@/lib/server/crud';
import { GET as listDrukkers, POST as createDrukker } from '@/app/api/drukkers/route';
import {
  GET as getDrukker,
  PATCH as patchDrukker,
  DELETE as deleteDrukker,
} from '@/app/api/drukkers/[id]/route';

// Tracks the exact ids each test creates and removes only those afterward -- never
// a table-wide DELETE -- so this suite is safe to run against a table that already
// holds real drukkers.
const createdDrukkerIds: string[] = [];

afterEach(async () => {
  if (createdDrukkerIds.length > 0) {
    await getPool().query('DELETE FROM drukkers WHERE id IN (?)', [createdDrukkerIds]);
    createdDrukkerIds.length = 0;
  }
});

function req(method: string, body?: unknown, cookie?: string) {
  return new Request('http://localhost/api', {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function medewerkerCookie() {
  const sessionId = await createSession('medewerker', 'staff-1');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

describe('drukkers routes', () => {
  it('rejects listing without a medewerker session', async () => {
    const response = await listDrukkers(req('GET'));
    expect(response.status).toBe(401);
  });

  it('rejects creating a drukker without a medewerker session', async () => {
    const response = await createDrukker(req('POST', { naam: 'Onbevoegd', email: 'x@y.nl' }));
    expect(response.status).toBe(401);
  });

  it('allows creating, updating and deleting a drukker with a medewerker session', async () => {
    const cookie = await medewerkerCookie();

    const createResponse = await createDrukker(
      req('POST', { naam: 'Drukkerij Bosch', email: 'info@bosch.nl' }, cookie)
    );
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    createdDrukkerIds.push(created.id);

    await patchDrukker(req('PATCH', { naam: 'Drukkerij Bosch BV' }, cookie), {
      params: { id: created.id },
    });
    const getResponse = await getDrukker(req('GET', undefined, cookie), { params: { id: created.id } });
    expect((await getResponse.json()).naam).toBe('Drukkerij Bosch BV');

    await deleteDrukker(req('DELETE', undefined, cookie), { params: { id: created.id } });
    const afterDelete = await getDrukker(req('GET', undefined, cookie), { params: { id: created.id } });
    expect(afterDelete.status).toBe(404);
    createdDrukkerIds.length = 0;
  });

  it('clears standaard on every other drukker when a new drukker is created as standaard', async () => {
    const cookie = await medewerkerCookie();
    const existing = await insertRow<{ id: string }>('drukkers', {
      naam: 'Drukkerij Eerste',
      email: 'eerste@example.com',
      standaard: true,
    } as never);
    createdDrukkerIds.push(existing.id);

    const createResponse = await createDrukker(
      req('POST', { naam: 'Drukkerij Tweede', email: 'tweede@example.com', standaard: true }, cookie)
    );
    const created = await createResponse.json();
    createdDrukkerIds.push(created.id);

    const existingAfter = await getDrukker(req('GET', undefined, cookie), { params: { id: existing.id } });
    expect((await existingAfter.json()).standaard).toBe(0);
    const createdAfter = await getDrukker(req('GET', undefined, cookie), { params: { id: created.id } });
    expect((await createdAfter.json()).standaard).toBe(1);
  });

  it('clears standaard on every other drukker when an existing drukker is patched to standaard', async () => {
    const cookie = await medewerkerCookie();
    const drukkerA = await insertRow<{ id: string }>('drukkers', {
      naam: 'Drukkerij A',
      email: 'a@example.com',
      standaard: true,
    } as never);
    createdDrukkerIds.push(drukkerA.id);
    const drukkerB = await insertRow<{ id: string }>('drukkers', {
      naam: 'Drukkerij B',
      email: 'b@example.com',
      standaard: false,
    } as never);
    createdDrukkerIds.push(drukkerB.id);

    await patchDrukker(req('PATCH', { standaard: true }, cookie), { params: { id: drukkerB.id } });

    const aAfter = await getDrukker(req('GET', undefined, cookie), { params: { id: drukkerA.id } });
    expect((await aAfter.json()).standaard).toBe(0);
    const bAfter = await getDrukker(req('GET', undefined, cookie), { params: { id: drukkerB.id } });
    expect((await bAfter.json()).standaard).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/app/api/drukkers.test.ts
```

Expected: FAIL — `Cannot find module '@/app/api/drukkers/route'` (the routes don't exist yet).

- [ ] **Step 3: Remove `drukkers` from `LOOKUP_RESOURCES`**

In `src/lib/server/lookupResources.ts`, delete line 25:

```ts
  drukkers: { jsonColumns: [], readAuthRequired: 'medewerker', writeAuthRequired: 'medewerker' },
```

(The generic `[resource]` catch-all would 404 for `drukkers` after this — that's expected, the new dedicated routes below take over that path since Next.js prefers the more specific static route.)

- [ ] **Step 4: Create `src/app/api/drukkers/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { listRows, insertRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { requireMedewerker } from '@/lib/server/requireAuth';

export async function GET(request: Request) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const rows = await listRows('drukkers');
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await request.json();
    if (data.standaard === true) {
      await getPool().query('UPDATE drukkers SET standaard = FALSE WHERE standaard = TRUE');
    }
    const created = await insertRow('drukkers', data);
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}
```

- [ ] **Step 5: Create `src/app/api/drukkers/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { getRow, updateRow, deleteRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { requireMedewerker } from '@/lib/server/requireAuth';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const row = await getRow('drukkers', params.id);
  if (!row) return NextResponse.json({ error: 'not-found' }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await request.json();
    if (data.standaard === true) {
      await getPool().query('UPDATE drukkers SET standaard = FALSE WHERE standaard = TRUE AND id != ?', [
        params.id,
      ]);
    }
    await updateRow('drukkers', params.id, data);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  await deleteRow('drukkers', params.id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
npx vitest run tests/app/api/drukkers.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 7: Run the existing drukkerZendingen test to confirm no regression**

```bash
npx vitest run tests/app/api/drukkerZendingen.test.ts
```

Expected: PASS (this route (`src/app/api/drukkers/[id]/zendingen/route.ts`) is untouched, but confirm it still resolves correctly now that `src/app/api/drukkers/[id]/route.ts` exists alongside it)

- [ ] **Step 8: Commit**

```bash
git add src/app/api/drukkers/route.ts src/app/api/drukkers/[id]/route.ts src/lib/server/lookupResources.ts tests/app/api/drukkers.test.ts
git commit -m "feat: dedicated drukkers API routes with standaard-exclusivity"
```

---

### Task 3: `standaard` field on the `Drukker` type + checkbox in `DrukkerModal`

**Files:**
- Modify: `src/components/beheer/materiaalTypes.ts:70-78` (`Drukker` interface)
- Modify: `src/components/beheer/DrukkerModal.tsx`
- Modify: `messages/nl.json` (add `drukkersLabelStandaard` near `drukkersLabelPrijsafspraken`, `messages/nl.json:650`)
- Test: `tests/components/beheer/DrukkerModal.test.tsx`
- Test: `tests/components/beheer/DrukkersSection.test.tsx` (update two existing assertions)

**Interfaces:**
- Produces: `Drukker.standaard?: boolean` (optional, same convention as `Materiaalsoort.staatEigenMaatToe?: boolean` in `materiaalTypes.ts:4`) — consumed by Task 4 (badge) and Task 5 (dialog default-selection).
- `DrukkerModal`'s `FormFields.standaard: boolean` is always present in the object passed to `onAdd`/`onUpdate` (mirrors how `MateriaalsoortenSection.tsx` always includes `staatEigenMaatToe` in its save payload).

- [ ] **Step 1: Add the field to the `Drukker` interface**

In `src/components/beheer/materiaalTypes.ts:70-78`, change:

```ts
export interface Drukker {
  id: string;
  naam: string;
  adres: string;
  postcode: string;
  plaats: string;
  email: string;
  prijsafspraken: string;
}
```

to:

```ts
export interface Drukker {
  id: string;
  naam: string;
  adres: string;
  postcode: string;
  plaats: string;
  email: string;
  prijsafspraken: string;
  standaard?: boolean;
}
```

- [ ] **Step 2: Add the translation key**

In `messages/nl.json`, right after line 650 (`"drukkersLabelPrijsafspraken": "Prijsafspraken",`), add:

```json
    "drukkersLabelStandaard": "Standaard drukker",
```

- [ ] **Step 3: Write the failing test**

In `tests/components/beheer/DrukkerModal.test.tsx`, add a new `describe` block after the existing `describe('DrukkerModal verplichte velden', ...)` block (after line 53):

```ts
describe('DrukkerModal standaard', () => {
  it('defaults the standaard checkbox to unchecked when adding a new drukker', () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal({ mode: 'add' });
    expect(screen.getByTestId('drukker-modal-standaard')).not.toBeChecked();
  });

  it('pre-fills the standaard checkbox from the drukker when editing', () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal({ mode: 'edit', drukker: { ...DRUKKER, standaard: true } });
    expect(screen.getByTestId('drukker-modal-standaard')).toBeChecked();
  });

  it('includes standaard in the payload passed to onAdd when toggled on', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const { onAdd } = renderModal({ mode: 'add' });
    fireEvent.change(screen.getByTestId('drukker-modal-naam'), { target: { value: 'Nieuwe' } });
    fireEvent.change(screen.getByTestId('drukker-modal-email'), { target: { value: 'x@y.nl' } });
    fireEvent.click(screen.getByTestId('drukker-modal-standaard'));
    fireEvent.click(screen.getByTestId('drukker-modal-opslaan'));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({ naam: 'Nieuwe', email: 'x@y.nl', standaard: true })
      )
    );
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
npx vitest run tests/components/beheer/DrukkerModal.test.tsx
```

Expected: FAIL — `Unable to find an element by: [data-testid="drukker-modal-standaard"]`

- [ ] **Step 5: Update `DrukkerModal.tsx`**

In `src/components/beheer/DrukkerModal.tsx`:

Change the `FormFields` interface (lines 22-29):

```ts
interface FormFields {
  naam: string;
  adres: string;
  postcode: string;
  plaats: string;
  email: string;
  prijsafspraken: string;
  standaard: boolean;
}
```

Change `EMPTY_FIELDS` (line 31):

```ts
const EMPTY_FIELDS: FormFields = {
  naam: '',
  adres: '',
  postcode: '',
  plaats: '',
  email: '',
  prijsafspraken: '',
  standaard: false,
};
```

Change the `useEffect` that populates fields on edit (lines 42-51):

```ts
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

Add the checkbox after the `prijsafspraken` field (after the closing `</label>` at line 186, before `<RequiredLegend ...>` at line 188):

```tsx
        <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/60">
          <input
            type="checkbox"
            checked={fields.standaard}
            onChange={(event) => setField('standaard', event.target.checked)}
            data-testid="drukker-modal-standaard"
          />
          {t('drukkersLabelStandaard')}
        </label>
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
npx vitest run tests/components/beheer/DrukkerModal.test.tsx
```

Expected: PASS (all tests, including the 3 new ones)

- [ ] **Step 7: Fix the two now-broken `DrukkersSection` assertions**

`DrukkerModal`'s save payload now always includes `standaard`, so the two exact-match assertions in `tests/components/beheer/DrukkersSection.test.tsx` need it too. In the `'adds a new drukker...'` test (around line 90), change:

```ts
      expect(onAdd).toHaveBeenCalledWith({
        naam: 'Nieuwe Drukker',
        adres: 'Straat 1',
        postcode: '1111 AA',
        plaats: 'Stad',
        email: 'info@nieuw.nl',
        prijsafspraken: 'Geen korting.',
      })
```

to:

```ts
      expect(onAdd).toHaveBeenCalledWith({
        naam: 'Nieuwe Drukker',
        adres: 'Straat 1',
        postcode: '1111 AA',
        plaats: 'Stad',
        email: 'info@nieuw.nl',
        prijsafspraken: 'Geen korting.',
        standaard: false,
      })
```

In the `'opens a row for editing pre-filled, updates it...'` test (around line 124), change:

```ts
      expect(onUpdate).toHaveBeenCalledWith('drukker-1', {
        naam: 'Drukkerij Janssen',
        adres: 'Perslaan 1',
        postcode: '1000 AA',
        plaats: 'Amersfoort',
        email: 'info@janssen.nl',
        prijsafspraken: '10% korting boven 50 stuks.',
      })
```

to:

```ts
      expect(onUpdate).toHaveBeenCalledWith('drukker-1', {
        naam: 'Drukkerij Janssen',
        adres: 'Perslaan 1',
        postcode: '1000 AA',
        plaats: 'Amersfoort',
        email: 'info@janssen.nl',
        prijsafspraken: '10% korting boven 50 stuks.',
        standaard: false,
      })
```

- [ ] **Step 8: Run the full beheer component test file for drukkers to confirm no regressions**

```bash
npx vitest run tests/components/beheer/DrukkerModal.test.tsx tests/components/beheer/DrukkersSection.test.tsx
```

Expected: PASS (all tests)

- [ ] **Step 9: Commit**

```bash
git add src/components/beheer/materiaalTypes.ts src/components/beheer/DrukkerModal.tsx messages/nl.json tests/components/beheer/DrukkerModal.test.tsx tests/components/beheer/DrukkersSection.test.tsx
git commit -m "feat: add standaard drukker checkbox to DrukkerModal"
```

---

### Task 4: "Standaard" badge in `DrukkersSection`

**Files:**
- Modify: `src/components/beheer/DrukkersSection.tsx`
- Modify: `messages/nl.json` (add `drukkersStandaardBadge` next to `drukkersLabelStandaard`)
- Test: `tests/components/beheer/DrukkersSection.test.tsx`

**Interfaces:**
- Consumes: `Drukker.standaard?: boolean` from Task 3.

- [ ] **Step 1: Add the translation key**

In `messages/nl.json`, next to the `drukkersLabelStandaard` key added in Task 3, add:

```json
    "drukkersStandaardBadge": "Standaard",
```

- [ ] **Step 2: Write the failing test**

In `tests/components/beheer/DrukkersSection.test.tsx`, add a new test inside the existing `describe('DrukkersSection', ...)` block, after the `'lists the drukkers in the table'` test (after line 77):

```ts
  it('shows a Standaard badge next to the standaard drukker and not next to others', () => {
    renderSection({
      drukkers: [
        DRUKKERS[0],
        { ...DRUKKERS[0], id: 'drukker-2', naam: 'Drukkerij Tweede', standaard: true },
      ],
    });
    expect(screen.getByTestId('data-table-row-drukker-1')).not.toHaveTextContent('Standaard');
    expect(screen.getByTestId('data-table-row-drukker-2')).toHaveTextContent('Standaard');
  });
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx vitest run tests/components/beheer/DrukkersSection.test.tsx
```

Expected: FAIL — the new test's assertion `expect(screen.getByTestId('data-table-row-drukker-2')).toHaveTextContent('Standaard')` fails (no badge rendered yet).

- [ ] **Step 4: Update `DrukkersSection.tsx`**

In `src/components/beheer/DrukkersSection.tsx`, change the `naam` column definition (line 36) from:

```ts
    { key: 'naam', label: t('drukkersColNaam') },
```

to:

```ts
    {
      key: 'naam',
      label: t('drukkersColNaam'),
      render: (drukker) => (
        <span className="flex items-center gap-2">
          {drukker.naam}
          {drukker.standaard && (
            <span
              data-testid={`drukker-standaard-badge-${drukker.id}`}
              className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/70"
            >
              {t('drukkersStandaardBadge')}
            </span>
          )}
        </span>
      ),
    },
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run tests/components/beheer/DrukkersSection.test.tsx
```

Expected: PASS (all tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/beheer/DrukkersSection.tsx messages/nl.json tests/components/beheer/DrukkersSection.test.tsx
git commit -m "feat: show Standaard badge in drukkers list"
```

---

### Task 5: Default-selection in `VersturenNaarDrukkerDialog`

**Files:**
- Modify: `src/components/beheer/VersturenNaarDrukkerDialog.tsx:46-54`
- Test: `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx`

**Interfaces:**
- Consumes: `Drukker.standaard?: boolean` from Task 3.

- [ ] **Step 1: Write the failing test**

In `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx`, add a `DRUKKERS_MET_STANDAARD` const after the existing `DRUKKERS` const (after line 51):

```ts
const DRUKKERS_MET_STANDAARD: Drukker[] = [
  { id: 'drukker-1', naam: 'Drukkerij Janssen', adres: 'Perslaan 1', postcode: '1000 AA', plaats: 'Utrecht', email: 'info@janssen.nl', prijsafspraken: '' },
  { id: 'drukker-2', naam: 'Drukkerij Tweede', adres: 'Perslaan 2', postcode: '1000 AB', plaats: 'Utrecht', email: 'info@tweede.nl', prijsafspraken: '', standaard: true },
];
```

Then add two tests inside the existing `describe('VersturenNaarDrukkerDialog', ...)` block, right after the `'pre-selects the only drukker...'` test (after line 133):

```ts
  it('pre-selects the standaard drukker when multiple drukkers exist', () => {
    renderDialog({ drukkers: DRUKKERS_MET_STANDAARD });
    expect(screen.getByTestId('drukker-versturen-drukker')).toHaveValue('drukker-2');
  });

  it('falls back to the first drukker when none is marked standaard', () => {
    renderDialog({
      drukkers: DRUKKERS_MET_STANDAARD.map((drukker) => ({ ...drukker, standaard: false })),
    });
    expect(screen.getByTestId('drukker-versturen-drukker')).toHaveValue('drukker-1');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx
```

Expected: FAIL — `'pre-selects the standaard drukker when multiple drukkers exist'` fails because the dropdown still shows `'drukker-1'`.

- [ ] **Step 3: Update the default-selection logic**

In `src/components/beheer/VersturenNaarDrukkerDialog.tsx:46-54`, change:

```ts
  useEffect(() => {
    if (isOpen) {
      setDrukkerId(drukkers[0]?.id ?? '');
      setError(null);
      setIsSending(false);
      setMailSent(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
```

to:

```ts
  useEffect(() => {
    if (isOpen) {
      setDrukkerId(drukkers.find((d) => d.standaard)?.id ?? drukkers[0]?.id ?? '');
      setError(null);
      setIsSending(false);
      setMailSent(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx
```

Expected: PASS (all tests, including the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/VersturenNaarDrukkerDialog.tsx tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx
git commit -m "feat: default doorzet-dialoog to the standaard drukker"
```

---

### Task 6: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: PASS, no failures, no leftover test data (each suite cleans up its own rows per the scoped-cleanup rule).

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Manually verify in the dev server**

Start `npm run dev`, log in as medewerker (see `reference_medewerker_test_account` — `joris.vandenbroek@gmail.com`), go to Beheer → Drukkers, mark one drukker as "Standaard drukker" and save, confirm the badge shows next to it in the list and not the others, then open a bestelling with status "Te versturen naar drukker" and confirm the doorzet-dialoog pre-selects that drukker.

- [ ] **Step 4: Commit if any fixups were needed**

```bash
git add -A
git commit -m "fix: address issues found in verification pass"
```

(Skip this step if verification found nothing to fix.)

---

## Self-Review Notes

- **Spec coverage:** datamodel (Task 1) ✓, API layer + exclusivity (Task 2) ✓, `Drukker` type + modal checkbox (Task 3) ✓, list badge (Task 4) ✓, dialog default-selection fallback behavior (Task 5) ✓, migration + staging apply (Task 1) ✓, tests for the exclusivity logic (Task 2) ✓. No activiteitenlog task, matching the explicit decision not to log this. No spec section left uncovered.
- **Placeholder scan:** no TBD/TODO markers; every step has complete code.
- **Type consistency:** `Drukker.standaard?: boolean` (Task 3) is the single definition used everywhere downstream (Task 4's `render`, Task 5's `.find((d) => d.standaard)`) — no renamed variants introduced.
