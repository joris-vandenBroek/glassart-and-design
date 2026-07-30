# Prijsmatrix & Prijsmodule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-kunstwerk manual price grid with a beheer-managed maat×materiaal price matrix plus a per-kunstenaar price surcharge, combined by a single server-side "Prijsmodule" that is the sole source of truth for every price shown to a customer and every price stored on an order.

**Architecture:** A new `prijsmatrix` table (one row per maat×materiaal combination actually priced, FK-cascade to `maten`/`materialen` so it can never go stale) plus a new `kunstenaarAfspraken.prijsopslag` column (staff-only, alongside the existing `prijsafspraken`). `src/lib/server/prijsmodule.ts` is the single module that looks up a matrix price and adds a kunstenaar's opslag; every consumer (a new storefront pricing endpoint, the beheer Prijsmatrix/Kunstwerken UI, and order placement) calls through it — none of them re-implement the combination logic. The existing `kunstwerken.prijzen` manual-price column is removed entirely.

**Tech Stack:** Next.js 14 App Router API routes, raw `mysql2`, Vitest (against the real shared staging MySQL database — no mocking of the DB layer), React Testing Library for components.

## Global Constraints

- Tests run against the real shared staging MySQL database (`tests/setup.ts` loads `.env.local`). Every test that inserts a row must track its own id(s) and delete only those rows in `afterEach` — never a blanket `DELETE FROM table` / `TRUNCATE`, even on a table that looks empty.
- Never resolve "the row I just created" via list ordering (`list()[0]`) — always use the id returned by the create call.
- Never reset the `counters` `bestelnummer` sequence for determinism — compute expected values relative to its current value (see `nextExpectedBestelnr()` pattern already in `tests/app/api/bestelheaders.test.ts`).
- `vitest.config.ts` has `fileParallelism: false` — do not change this.
- The beheer UI (`messages.beheer` namespace) is Dutch-only — `en.json`/`fr.json`/`de.json` have no `beheer` key at all. Only `messages/nl.json` needs new keys for this feature. The customer-facing `cart` namespace (used by `ProductModal.tsx`) already has the strings this plan needs (`priceOnRequest`); no new customer-facing keys are needed.
- Schema changes (`db/migrations/*.sql`) must be run against the staging database manually, **with explicit user confirmation before executing**, per the project's standing rule that destructive/hard-to-reverse database changes are not applied autonomously. Never run the migration against production.
- Money values: MySQL `DECIMAL` columns come back from `mysql2` as strings — always wrap in `Number(...)` before arithmetic, and round to 2 decimals with `Math.round(x * 100) / 100` (matches the existing `prijsPerM2Prijs` formula in `ProductModal.tsx`).

---

### Task 1: Schema migration — `prijsmatrix` table, `kunstenaarAfspraken.prijsopslag`, drop `kunstwerken.prijzen`

**Files:**
- Create: `db/migrations/2026-07-30-prijsmatrix-en-prijsmodule.sql`
- Modify: `db/schema.sql`

**Interfaces:**
- Produces: `prijsmatrix` table (`id`, `maatId`, `materiaalId`, `prijs`, unique key `(maatId, materiaalId)`, FK cascade to `maten(id)`/`materialen(id)`), `kunstenaarAfspraken.prijsopslag DECIMAL(10,2) NOT NULL DEFAULT 0`. Removes `kunstwerken.prijzen`.

- [ ] **Step 1: Write the migration file**

```sql
-- Migration for prijsmatrix-en-prijsmodule (2026-07-30)
-- Run once, in order, against a database still on the pre-migration schema.
CREATE TABLE prijsmatrix (
  id CHAR(36) PRIMARY KEY,
  maatId CHAR(36) NOT NULL,
  materiaalId CHAR(36) NOT NULL,
  prijs DECIMAL(10,2),
  UNIQUE KEY unique_maat_materiaal (maatId, materiaalId),
  FOREIGN KEY (maatId) REFERENCES maten(id) ON DELETE CASCADE,
  FOREIGN KEY (materiaalId) REFERENCES materialen(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE kunstenaarAfspraken ADD COLUMN prijsopslag DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE kunstwerken DROP COLUMN prijzen;
```

- [ ] **Step 2: Update `db/schema.sql` to match**

In `db/schema.sql`, after the `prijsgroepen` table definition (currently ending around line 93) and before `CREATE TABLE kunstenaars`, insert the new table. After the existing `kunstenaarAfspraken` table definition, add the new column. In the `kunstwerken` table definition, remove the `prijzen JSON,` line.

Exact edits:
1. Insert immediately before `CREATE TABLE kunstenaars (` (currently line 95):
```sql
CREATE TABLE prijsmatrix (
  id CHAR(36) PRIMARY KEY,
  maatId CHAR(36) NOT NULL,
  materiaalId CHAR(36) NOT NULL,
  prijs DECIMAL(10,2),
  UNIQUE KEY unique_maat_materiaal (maatId, materiaalId),
  FOREIGN KEY (maatId) REFERENCES maten(id) ON DELETE CASCADE,
  FOREIGN KEY (materiaalId) REFERENCES materialen(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

```
2. Change the `kunstenaarAfspraken` table (currently lines 108-112):
```sql
CREATE TABLE kunstenaarAfspraken (
  id CHAR(36) PRIMARY KEY,
  prijsafspraken TEXT,
  prijsopslag DECIMAL(10,2) NOT NULL DEFAULT 0,
  FOREIGN KEY (id) REFERENCES kunstenaars(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
3. In the `kunstwerken` table (currently lines 137-156), delete the line `  prijzen JSON,` (currently line 153).

- [ ] **Step 3: Pause for explicit confirmation, then apply to staging**

Stop and confirm with the user before running anything against the shared staging database — this includes an irreversible `DROP COLUMN`. Once confirmed, run the three statements from Step 1 against the staging database (e.g. via a MySQL client connected with the credentials in `.env.local`, or a one-off script using `getPool()`), in order, once.

- [ ] **Step 4: Verify**

Run (against staging): `DESCRIBE prijsmatrix;`, `DESCRIBE kunstenaarAfspraken;`, `DESCRIBE kunstwerken;` and confirm the new table exists, `kunstenaarAfspraken` has `prijsopslag`, and `kunstwerken` no longer has `prijzen`.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/2026-07-30-prijsmatrix-en-prijsmodule.sql db/schema.sql
git commit -m "feat(db): add prijsmatrix table and kunstenaarAfspraken.prijsopslag, drop kunstwerken.prijzen"
```

---

### Task 2: Remove `kunstwerken.prijzen` from application code

**Files:**
- Modify: `src/components/beheer/materiaalTypes.ts`
- Modify: `src/lib/server/lookupResources.ts`
- Modify: `src/data/kunstwerkenSeed.ts`
- Modify (fixture-only, delete the `prijzen`/`PrijsRegel` literal, no other change): `tests/components/account/AccountOrderModal.test.tsx:18`, `tests/components/beheer/BestellingenSection.test.tsx:34`, `tests/components/beheer/BestellingModal.test.tsx:35`, `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx:54`, `tests/lib/buildDrukkerMail.test.ts:41,55,70`, `tests/lib/kunstwerkMateriaal.test.ts:26`, `tests/lib/resolveKunstwerkOmschrijving.test.ts:13`
- Modify: `tests/lib/server/crud.test.ts`
- Modify: `tests/data/kunstwerkenSeed.test.ts`
- Test files touched by Tasks 7/8 (`BeheerShell.test.tsx`, `FeaturedWorks.test.tsx`, `ProductsGrid.test.tsx`, `ProductModal.test.tsx`, `KunstwerkenSection.test.tsx`) are handled there, not here — they need behavioral changes, not just a deleted fixture line.

**Interfaces:**
- Produces: `Kunstwerk` type with no `prijzen` field; `PrijsRegel` type removed entirely.

- [ ] **Step 1: Remove `PrijsRegel` and `prijzen` from the type**

In `src/components/beheer/materiaalTypes.ts`, delete the `PrijsRegel` interface (currently lines 44-48) and delete the `prijzen: PrijsRegel[];` line from `Kunstwerk` (currently line 62).

- [ ] **Step 2: Remove `prijzen` from the generic CRUD jsonColumns config**

In `src/lib/server/lookupResources.ts`, change:
```ts
  kunstwerken: {
    jsonColumns: ['segmentIds', 'materiaalIds', 'maatIds', 'stijlIds', 'onderwerpIds', 'prijzen'],
    writeAuthRequired: 'medewerker',
  },
```
to:
```ts
  kunstwerken: {
    jsonColumns: ['segmentIds', 'materiaalIds', 'maatIds', 'stijlIds', 'onderwerpIds'],
    writeAuthRequired: 'medewerker',
  },
```

- [ ] **Step 3: Remove `prijzen`/`berekenVoorbeeldprijs` from the seed builder**

In `src/data/kunstwerkenSeed.ts`, delete the `berekenVoorbeeldprijs` function (currently lines 29-31-ish, whatever its full body is) and, in `buildKunstwerkenSeed` (currently lines 86-125), delete the `prijzen` computation block:
```ts
  const prijzen = gekozenMaterialen.flatMap((materiaal) =>
    gekozenMaten.map((maat) => ({
      materiaalId: materiaal.id,
      maatId: maat.id,
      prijs: berekenVoorbeeldprijs(materiaal.materiaaldikte, maat.breedte, maat.hoogte),
    }))
  );
```
and remove the `prijzen,` line from the returned object literal inside the `fotos.map(...)` call.

- [ ] **Step 4: Update `tests/data/kunstwerkenSeed.test.ts`**

Delete the `import { berekenVoorbeeldprijs, ... }` reference to `berekenVoorbeeldprijs` and the entire `describe('berekenVoorbeeldprijs', ...)` block (the 3 tests at lines 41-54). In the `describe('buildKunstwerkenSeed', ...)` block, delete the test `'picks the 2 lowest-id materialen and 2 lowest-id maten deterministically...'`'s assertion `expect(kunstwerk.prijzen.length).toBe(4);` (line 88) — if that's the only assertion in that `it`, delete the whole `it` block instead of leaving an empty test. Delete the entire test `'computes each prijzen entry via berekenVoorbeeldprijs for its materiaal/maat combination'` (lines 92-96).

- [ ] **Step 5: Remove `prijzen` from `tests/lib/server/crud.test.ts`'s jsonColumns arrays**

Replace every occurrence of `['segmentIds', 'materiaalIds', 'maatIds', 'prijzen']` (lines 72, 79, 88, 95) and the multi-line array at lines 99-104 with the same list minus `'prijzen'`:
```ts
      ['segmentIds', 'materiaalIds', 'maatIds']
```
(and for the multi-line one, remove the `'prijzen',` line).

- [ ] **Step 6: Delete the `prijzen: []`/`prijzen: [...]` fixture line from the remaining mechanical test files**

Delete exactly the line noted for each file (a fixture object property, no other change needed since none of these tests assert on `prijzen`):
- `tests/components/account/AccountOrderModal.test.tsx:18` — delete `prijzen: [],`
- `tests/components/beheer/BestellingenSection.test.tsx:34` — delete `prijzen: [],`
- `tests/components/beheer/BestellingModal.test.tsx:35` — delete `prijzen: [],`
- `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx:54` — delete the `prijzen: [],` segment from the inline object literal
- `tests/lib/buildDrukkerMail.test.ts:41,55,70` — delete each `prijzen: [],` line
- `tests/lib/kunstwerkMateriaal.test.ts:26` — delete `prijzen: [],`
- `tests/lib/resolveKunstwerkOmschrijving.test.ts:13` — delete `prijzen: [],`

- [ ] **Step 7: Run the full test suite and confirm only the expected files still reference `prijzen`**

```bash
npx vitest run
```

Expected: failures only in `tests/components/beheer/BeheerShell.test.tsx`, `tests/components/FeaturedWorks.test.tsx`, `tests/components/ProductsGrid.test.tsx`, `tests/components/ProductModal.test.tsx`, `tests/components/beheer/KunstwerkenSection.test.tsx` (these are fixed in Tasks 7-8) and TypeScript build errors referencing `kunstwerken.prijzen`/`PrijsRegel` anywhere not yet touched — if `tsc` surfaces any other file, add it to this task's fixture-cleanup list before moving on.

- [ ] **Step 8: Commit**

```bash
git add src/components/beheer/materiaalTypes.ts src/lib/server/lookupResources.ts src/data/kunstwerkenSeed.ts tests/data/kunstwerkenSeed.test.ts tests/lib/server/crud.test.ts tests/components/account/AccountOrderModal.test.tsx tests/components/beheer/BestellingenSection.test.tsx tests/components/beheer/BestellingModal.test.tsx tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx tests/lib/buildDrukkerMail.test.ts tests/lib/kunstwerkMateriaal.test.ts tests/lib/resolveKunstwerkOmschrijving.test.ts
git commit -m "refactor: remove kunstwerken.prijzen and PrijsRegel from application code"
```

---

### Task 3: Prijsmodule core

**Files:**
- Create: `src/lib/server/prijsmodule.ts`
- Test: `tests/lib/server/prijsmodule.test.ts`

**Interfaces:**
- Consumes: `getPool()` from `@/lib/server/db`; the `prijsmatrix` and `kunstenaarAfspraken` tables from Task 1.
- Produces (used by Tasks 6 and 9):
  - `type Queryable = Pool | PoolConnection` (re-exported)
  - `combineerPrijs(basisPrijs: number, opslag: number): number`
  - `prijsopslagVoorKunstenaar(db: Queryable, kunstenaarId: string | null): Promise<number>`
  - `berekenPrijzenVoorCombinaties(db: Queryable, kunstenaarId: string | null, materiaalIds: string[], maatIds: string[]): Promise<PrijsCombinatie[]>` where `PrijsCombinatie = { maatId: string; materiaalId: string; prijs: number }`
  - `berekenPrijzenVoorAlleKunstwerken(db: Queryable): Promise<Record<string, PrijsCombinatie[]>>`
  - `type LijnPrijsResultaat = { status: 'vast'; prijs: number } | { status: 'op-aanvraag' } | { status: 'onbekend' }`
  - `berekenBestellijnPrijs(db: Queryable, kunstwerk: { kunstenaarId: string | null; maatIds: string[]; prijsPerM2: number | null }, line: { maatId: string; materiaalId: string; breedte?: number; hoogte?: number }): Promise<LijnPrijsResultaat>`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lib/server/prijsmodule.test.ts
import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import {
  combineerPrijs,
  prijsopslagVoorKunstenaar,
  berekenPrijzenVoorCombinaties,
  berekenPrijzenVoorAlleKunstwerken,
  berekenBestellijnPrijs,
} from '@/lib/server/prijsmodule';

const createdMaatIds: string[] = [];
const createdMateriaalsoortIds: string[] = [];
const createdMateriaalIds: string[] = [];
const createdKunstenaarIds: string[] = [];
const createdKunstwerkIds: string[] = [];

afterEach(async () => {
  const pool = getPool();
  if (createdKunstwerkIds.length > 0) {
    await pool.query('DELETE FROM kunstwerken WHERE id IN (?)', [createdKunstwerkIds]);
    createdKunstwerkIds.length = 0;
  }
  if (createdKunstenaarIds.length > 0) {
    await pool.query('DELETE FROM kunstenaars WHERE id IN (?)', [createdKunstenaarIds]);
    createdKunstenaarIds.length = 0;
  }
  if (createdMaatIds.length > 0) {
    await pool.query('DELETE FROM maten WHERE id IN (?)', [createdMaatIds]);
    createdMaatIds.length = 0;
  }
  if (createdMateriaalIds.length > 0) {
    await pool.query('DELETE FROM materialen WHERE id IN (?)', [createdMateriaalIds]);
    createdMateriaalIds.length = 0;
  }
  if (createdMateriaalsoortIds.length > 0) {
    await pool.query('DELETE FROM materiaalsoorten WHERE id IN (?)', [createdMateriaalsoortIds]);
    createdMateriaalsoortIds.length = 0;
  }
});

async function maakMaat(breedte: number, hoogte: number) {
  const maat = await insertRow<{ id: string }>('maten', { breedte, hoogte } as never);
  createdMaatIds.push(maat.id);
  return maat.id;
}

async function maakMateriaal(dikte: number) {
  const soort = await insertRow<{ id: string }>('materiaalsoorten', { omschrijving: 'Test soort' } as never);
  createdMateriaalsoortIds.push(soort.id);
  const materiaal = await insertRow<{ id: string }>('materialen', {
    materiaalsoortId: soort.id,
    materiaaldikte: dikte,
    omschrijving: 'Test materiaal',
  } as never);
  createdMateriaalIds.push(materiaal.id);
  return materiaal.id;
}

async function maakKunstenaarMetOpslag(prijsopslag: number) {
  const kunstenaar = await insertRow<{ id: string }>('kunstenaars', {
    naam: 'Test kunstenaar',
  } as never);
  createdKunstenaarIds.push(kunstenaar.id);
  await getPool().query(
    'INSERT INTO kunstenaarAfspraken (id, prijsopslag) VALUES (?, ?)',
    [kunstenaar.id, prijsopslag]
  );
  return kunstenaar.id;
}

describe('combineerPrijs', () => {
  it('adds the opslag to the basisprijs and rounds to 2 decimals', () => {
    expect(combineerPrijs(100, 12.345)).toBe(112.35);
  });
});

describe('prijsopslagVoorKunstenaar', () => {
  it('returns 0 for a null kunstenaarId', async () => {
    expect(await prijsopslagVoorKunstenaar(getPool(), null)).toBe(0);
  });

  it('returns 0 for a kunstenaar with no kunstenaarAfspraken row', async () => {
    const kunstenaar = await insertRow<{ id: string }>('kunstenaars', {
      naam: 'Geen afspraken',
    } as never);
    createdKunstenaarIds.push(kunstenaar.id);
    expect(await prijsopslagVoorKunstenaar(getPool(), kunstenaar.id)).toBe(0);
  });

  it('returns the stored prijsopslag for a kunstenaar that has one', async () => {
    const kunstenaarId = await maakKunstenaarMetOpslag(25);
    expect(await prijsopslagVoorKunstenaar(getPool(), kunstenaarId)).toBe(25);
  });
});

describe('berekenPrijzenVoorCombinaties', () => {
  it('returns the matrixprijs plus opslag for a combinatie with a set prijs', async () => {
    const maatId = await maakMaat(40, 60);
    const materiaalId = await maakMateriaal(4);
    await getPool().query(
      'INSERT INTO prijsmatrix (id, maatId, materiaalId, prijs) VALUES (UUID(), ?, ?, ?)',
      [maatId, materiaalId, 150]
    );
    const kunstenaarId = await maakKunstenaarMetOpslag(20);

    const result = await berekenPrijzenVoorCombinaties(getPool(), kunstenaarId, [materiaalId], [maatId]);
    expect(result).toEqual([{ maatId, materiaalId, prijs: 170 }]);
  });

  it('omits a combinatie that has no matrixprijs set', async () => {
    const maatId = await maakMaat(50, 50);
    const materiaalId = await maakMateriaal(3);
    const result = await berekenPrijzenVoorCombinaties(getPool(), null, [materiaalId], [maatId]);
    expect(result).toEqual([]);
  });
});

describe('berekenPrijzenVoorAlleKunstwerken', () => {
  it('computes prijzen only for a kunstwerk\'s own materiaalIds x maatIds, including its kunstenaar opslag', async () => {
    const maatId = await maakMaat(60, 80);
    const materiaalId = await maakMateriaal(5);
    await getPool().query(
      'INSERT INTO prijsmatrix (id, maatId, materiaalId, prijs) VALUES (UUID(), ?, ?, ?)',
      [maatId, materiaalId, 200]
    );
    const kunstenaarId = await maakKunstenaarMetOpslag(30);
    const kunstwerk = await insertRow<{ id: string }>(
      'kunstwerken',
      { naam: 'Test werk', kunstenaarId, materiaalIds: [materiaalId], maatIds: [maatId] } as never,
      ['materiaalIds', 'maatIds']
    );
    createdKunstwerkIds.push(kunstwerk.id);

    const result = await berekenPrijzenVoorAlleKunstwerken(getPool());
    expect(result[kunstwerk.id]).toEqual([{ maatId, materiaalId, prijs: 230 }]);
  });

  it('gives an empty array for a maatloos kunstwerk (no maatIds)', async () => {
    const kunstwerk = await insertRow<{ id: string }>(
      'kunstwerken',
      { naam: 'Maatloos werk', maatIds: [], materiaalIds: [] } as never,
      ['materiaalIds', 'maatIds']
    );
    createdKunstwerkIds.push(kunstwerk.id);
    const result = await berekenPrijzenVoorAlleKunstwerken(getPool());
    expect(result[kunstwerk.id]).toEqual([]);
  });
});

describe('berekenBestellijnPrijs', () => {
  it('resolves a vaste prijs for a normal maat+materiaal with a matrixprijs', async () => {
    const maatId = await maakMaat(80, 80);
    const materiaalId = await maakMateriaal(4);
    await getPool().query(
      'INSERT INTO prijsmatrix (id, maatId, materiaalId, prijs) VALUES (UUID(), ?, ?, ?)',
      [maatId, materiaalId, 300]
    );
    const result = await berekenBestellijnPrijs(
      getPool(),
      { kunstenaarId: null, maatIds: [maatId], prijsPerM2: null },
      { maatId, materiaalId }
    );
    expect(result).toEqual({ status: 'vast', prijs: 300 });
  });

  it('resolves onbekend for a normal maat with no matrixprijs set', async () => {
    const maatId = await maakMaat(90, 90);
    const materiaalId = await maakMateriaal(4);
    const result = await berekenBestellijnPrijs(
      getPool(),
      { kunstenaarId: null, maatIds: [maatId], prijsPerM2: null },
      { maatId, materiaalId }
    );
    expect(result).toEqual({ status: 'onbekend' });
  });

  it('resolves op-aanvraag for a custom maatId not in the kunstwerk\'s maatIds', async () => {
    const materiaalId = await maakMateriaal(4);
    const result = await berekenBestellijnPrijs(
      getPool(),
      { kunstenaarId: null, maatIds: ['echte-maat-id'], prijsPerM2: null },
      { maatId: '', materiaalId }
    );
    expect(result).toEqual({ status: 'op-aanvraag' });
  });

  it('resolves a vaste prijs from prijsPerM2 x afmetingen for a maatloos kunstwerk', async () => {
    const materiaalId = await maakMateriaal(3);
    const result = await berekenBestellijnPrijs(
      getPool(),
      { kunstenaarId: null, maatIds: [], prijsPerM2: 100 },
      { maatId: '', materiaalId, breedte: 120, hoogte: 60 }
    );
    expect(result).toEqual({ status: 'vast', prijs: 72 });
  });

  it('resolves onbekend for a maatloos kunstwerk with missing afmetingen', async () => {
    const materiaalId = await maakMateriaal(3);
    const result = await berekenBestellijnPrijs(
      getPool(),
      { kunstenaarId: null, maatIds: [], prijsPerM2: 100 },
      { maatId: '', materiaalId }
    );
    expect(result).toEqual({ status: 'onbekend' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/server/prijsmodule.test.ts`
Expected: FAIL — `Cannot find module '@/lib/server/prijsmodule'`.

- [ ] **Step 3: Implement `src/lib/server/prijsmodule.ts`**

```ts
import type { Pool, PoolConnection } from 'mysql2/promise';

export type Queryable = Pool | PoolConnection;

export interface PrijsCombinatie {
  maatId: string;
  materiaalId: string;
  prijs: number;
}

export type LijnPrijsResultaat =
  | { status: 'vast'; prijs: number }
  | { status: 'op-aanvraag' }
  | { status: 'onbekend' };

export function combineerPrijs(basisPrijs: number, opslag: number): number {
  return Math.round((basisPrijs + opslag) * 100) / 100;
}

export async function prijsopslagVoorKunstenaar(db: Queryable, kunstenaarId: string | null): Promise<number> {
  if (!kunstenaarId) return 0;
  const [rows] = await db.query('SELECT prijsopslag FROM kunstenaarAfspraken WHERE id = ?', [kunstenaarId]);
  const row = (rows as Array<{ prijsopslag: string | null }>)[0];
  return row?.prijsopslag != null ? Number(row.prijsopslag) : 0;
}

export async function berekenPrijzenVoorCombinaties(
  db: Queryable,
  kunstenaarId: string | null,
  materiaalIds: string[],
  maatIds: string[]
): Promise<PrijsCombinatie[]> {
  if (materiaalIds.length === 0 || maatIds.length === 0) {
    return [];
  }
  const [matrixRows] = await db.query(
    'SELECT maatId, materiaalId, prijs FROM prijsmatrix WHERE maatId IN (?) AND materiaalId IN (?) AND prijs IS NOT NULL',
    [maatIds, materiaalIds]
  );
  const opslag = await prijsopslagVoorKunstenaar(db, kunstenaarId);
  return (matrixRows as Array<{ maatId: string; materiaalId: string; prijs: string }>).map((row) => ({
    maatId: row.maatId,
    materiaalId: row.materiaalId,
    prijs: combineerPrijs(Number(row.prijs), opslag),
  }));
}

export async function berekenPrijzenVoorAlleKunstwerken(db: Queryable): Promise<Record<string, PrijsCombinatie[]>> {
  const [kunstwerkRows] = await db.query('SELECT id, kunstenaarId, materiaalIds, maatIds FROM kunstwerken');
  const [matrixRows] = await db.query('SELECT maatId, materiaalId, prijs FROM prijsmatrix WHERE prijs IS NOT NULL');
  const matrixByKey = new Map<string, number>();
  for (const row of matrixRows as Array<{ maatId: string; materiaalId: string; prijs: string }>) {
    matrixByKey.set(`${row.maatId}:${row.materiaalId}`, Number(row.prijs));
  }
  const [afsprakenRows] = await db.query('SELECT id, prijsopslag FROM kunstenaarAfspraken');
  const opslagByKunstenaarId = new Map<string, number>();
  for (const row of afsprakenRows as Array<{ id: string; prijsopslag: string | null }>) {
    opslagByKunstenaarId.set(row.id, row.prijsopslag != null ? Number(row.prijsopslag) : 0);
  }

  const result: Record<string, PrijsCombinatie[]> = {};
  for (const row of kunstwerkRows as Array<{
    id: string;
    kunstenaarId: string | null;
    materiaalIds: string | null;
    maatIds: string | null;
  }>) {
    const materiaalIds: string[] = row.materiaalIds ? JSON.parse(row.materiaalIds) : [];
    const maatIds: string[] = row.maatIds ? JSON.parse(row.maatIds) : [];
    const opslag = row.kunstenaarId ? opslagByKunstenaarId.get(row.kunstenaarId) ?? 0 : 0;
    const combinaties: PrijsCombinatie[] = [];
    for (const materiaalId of materiaalIds) {
      for (const maatId of maatIds) {
        const basisPrijs = matrixByKey.get(`${maatId}:${materiaalId}`);
        if (basisPrijs === undefined) continue;
        combinaties.push({ maatId, materiaalId, prijs: combineerPrijs(basisPrijs, opslag) });
      }
    }
    result[row.id] = combinaties;
  }
  return result;
}

export async function berekenBestellijnPrijs(
  db: Queryable,
  kunstwerk: { kunstenaarId: string | null; maatIds: string[]; prijsPerM2: number | null },
  line: { maatId: string; materiaalId: string; breedte?: number; hoogte?: number }
): Promise<LijnPrijsResultaat> {
  if (kunstwerk.maatIds.length === 0) {
    if (kunstwerk.prijsPerM2 == null || !line.breedte || !line.hoogte) {
      return { status: 'onbekend' };
    }
    return {
      status: 'vast',
      prijs: Math.round((line.breedte / 100) * (line.hoogte / 100) * kunstwerk.prijsPerM2 * 100) / 100,
    };
  }

  if (!kunstwerk.maatIds.includes(line.maatId)) {
    return { status: 'op-aanvraag' };
  }

  const [matrixRows] = await db.query('SELECT prijs FROM prijsmatrix WHERE maatId = ? AND materiaalId = ?', [
    line.maatId,
    line.materiaalId,
  ]);
  const matrixPrijs = (matrixRows as Array<{ prijs: string | null }>)[0]?.prijs;
  if (matrixPrijs == null) {
    return { status: 'onbekend' };
  }
  const opslag = await prijsopslagVoorKunstenaar(db, kunstwerk.kunstenaarId);
  return { status: 'vast', prijs: combineerPrijs(Number(matrixPrijs), opslag) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/server/prijsmodule.test.ts`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/prijsmodule.ts tests/lib/server/prijsmodule.test.ts
git commit -m "feat: add Prijsmodule — the single server-side price computation module"
```

---

### Task 4: `prijsmatrix` dedicated API route

**Files:**
- Create: `src/app/api/prijsmatrix/route.ts`
- Test: `tests/app/api/prijsmatrix.test.ts`

**Interfaces:**
- Consumes: `getPool`, `requireMedewerker`, `withApiErrorHandling`, `createSession`/`SESSION_COOKIE_NAME` (test only).
- Produces: `GET /api/prijsmatrix` → `{ prijzen: Array<{ maatId: string; materiaalId: string; prijs: number | null }> }` (medewerker-only). `PUT /api/prijsmatrix` body `{ maatId, materiaalId, prijs: number | null }` → `{ ok: true }` (medewerker-only), upsert on `(maatId, materiaalId)`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/app/api/prijsmatrix.test.ts
import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { GET as getMatrix, PUT as putMatrix } from '@/app/api/prijsmatrix/route';

const createdMaatIds: string[] = [];
const createdMateriaalsoortIds: string[] = [];
const createdMateriaalIds: string[] = [];

afterEach(async () => {
  const pool = getPool();
  if (createdMaatIds.length > 0) {
    await pool.query('DELETE FROM maten WHERE id IN (?)', [createdMaatIds]);
    createdMaatIds.length = 0;
  }
  if (createdMateriaalIds.length > 0) {
    await pool.query('DELETE FROM materialen WHERE id IN (?)', [createdMateriaalIds]);
    createdMateriaalIds.length = 0;
  }
  if (createdMateriaalsoortIds.length > 0) {
    await pool.query('DELETE FROM materiaalsoorten WHERE id IN (?)', [createdMateriaalsoortIds]);
    createdMateriaalsoortIds.length = 0;
  }
});

async function maakMaat(breedte: number, hoogte: number) {
  const maat = await insertRow<{ id: string }>('maten', { breedte, hoogte } as never);
  createdMaatIds.push(maat.id);
  return maat.id;
}

async function maakMateriaal() {
  const soort = await insertRow<{ id: string }>('materiaalsoorten', { omschrijving: 'Test soort' } as never);
  createdMateriaalsoortIds.push(soort.id);
  const materiaal = await insertRow<{ id: string }>('materialen', {
    materiaalsoortId: soort.id,
    materiaaldikte: 4,
    omschrijving: 'Test materiaal',
  } as never);
  createdMateriaalIds.push(materiaal.id);
  return materiaal.id;
}

async function medewerkerCookie(): Promise<string> {
  const sessionId = await createSession('medewerker', 'staff-1');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

function req(method: string, body?: unknown, cookie?: string) {
  return new Request('http://localhost/api/prijsmatrix', {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe('prijsmatrix route', () => {
  it('rejects reading the matrix without a medewerker session', async () => {
    const response = await getMatrix(req('GET'));
    expect(response.status).toBe(401);
  });

  it('rejects writing a prijs without a medewerker session', async () => {
    const response = await putMatrix(req('PUT', { maatId: 'x', materiaalId: 'y', prijs: 100 }));
    expect(response.status).toBe(401);
  });

  it('includes every maat x materiaal combinatie, with prijs null when unset', async () => {
    const maatId = await maakMaat(70, 70);
    const materiaalId = await maakMateriaal();
    const cookie = await medewerkerCookie();

    const response = await getMatrix(req('GET', undefined, cookie));
    const body = await response.json();
    const regel = body.prijzen.find((r: { maatId: string; materiaalId: string }) => r.maatId === maatId && r.materiaalId === materiaalId);
    expect(regel.prijs).toBeNull();
  });

  it('upserts a prijs, then reflects it on the next GET', async () => {
    const maatId = await maakMaat(75, 75);
    const materiaalId = await maakMateriaal();
    const cookie = await medewerkerCookie();

    const putResponse = await putMatrix(req('PUT', { maatId, materiaalId, prijs: 250 }, cookie));
    expect(putResponse.status).toBe(200);

    const response = await getMatrix(req('GET', undefined, cookie));
    const body = await response.json();
    const regel = body.prijzen.find((r: { maatId: string; materiaalId: string }) => r.maatId === maatId && r.materiaalId === materiaalId);
    expect(regel.prijs).toBe(250);

    const updateResponse = await putMatrix(req('PUT', { maatId, materiaalId, prijs: 275 }, cookie));
    expect(updateResponse.status).toBe(200);
    const secondResponse = await getMatrix(req('GET', undefined, cookie));
    const secondBody = await secondResponse.json();
    const secondRegel = secondBody.prijzen.find(
      (r: { maatId: string; materiaalId: string }) => r.maatId === maatId && r.materiaalId === materiaalId
    );
    expect(secondRegel.prijs).toBe(275);
  });

  it('automatically drops a prijsmatrix row when its maat is deleted (FK cascade)', async () => {
    const maatId = await maakMaat(76, 76);
    const materiaalId = await maakMateriaal();
    await getPool().query('INSERT INTO prijsmatrix (id, maatId, materiaalId, prijs) VALUES (UUID(), ?, ?, ?)', [
      maatId,
      materiaalId,
      100,
    ]);
    await getPool().query('DELETE FROM maten WHERE id = ?', [maatId]);
    // The maat is already gone -- afterEach's cleanup DELETE for this id is then simply a no-op.
    const [rows] = await getPool().query('SELECT 1 FROM prijsmatrix WHERE maatId = ?', [maatId]);
    expect((rows as unknown[]).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/app/api/prijsmatrix.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/prijsmatrix/route'`.

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/prijsmatrix/route.ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { requireMedewerker } from '@/lib/server/requireAuth';
import { withApiErrorHandling } from '@/lib/server/apiRoute';

export const GET = withApiErrorHandling('GET /api/prijsmatrix', async (request: Request) => {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const [rows] = await getPool().query(`
    SELECT m.id AS maatId, mat.id AS materiaalId, pm.prijs AS prijs
    FROM maten m
    CROSS JOIN materialen mat
    LEFT JOIN prijsmatrix pm ON pm.maatId = m.id AND pm.materiaalId = mat.id
  `);
  const prijzen = (rows as Array<{ maatId: string; materiaalId: string; prijs: string | null }>).map((row) => ({
    maatId: row.maatId,
    materiaalId: row.materiaalId,
    prijs: row.prijs != null ? Number(row.prijs) : null,
  }));
  return NextResponse.json({ prijzen });
});

export const PUT = withApiErrorHandling('PUT /api/prijsmatrix', async (request: Request) => {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { maatId, materiaalId, prijs } = (await request.json()) as {
    maatId: string;
    materiaalId: string;
    prijs: number | null;
  };
  await getPool().query(
    'INSERT INTO prijsmatrix (id, maatId, materiaalId, prijs) VALUES (UUID(), ?, ?, ?) ON DUPLICATE KEY UPDATE prijs = VALUES(prijs)',
    [maatId, materiaalId, prijs]
  );
  return NextResponse.json({ ok: true });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/app/api/prijsmatrix.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/prijsmatrix/route.ts tests/app/api/prijsmatrix.test.ts
git commit -m "feat: add staff-only /api/prijsmatrix route (computed grid + upsert)"
```

---

### Task 5: `kunstenaarAfspraken` — add `prijsopslag`

**Files:**
- Modify: `src/app/api/kunstenaarAfspraken/[id]/route.ts`
- Modify: `tests/app/api/kunstenaars.test.ts`

**Interfaces:**
- Produces: `GET /api/kunstenaarAfspraken/[id]` now returns `{ prijsafspraken: string | null; prijsopslag: number }`. `PUT` now accepts/persists `{ prijsafspraken: string; prijsopslag: number }`.

- [ ] **Step 1: Extend the existing test**

In `tests/app/api/kunstenaars.test.ts`, change the test `'stores and retrieves prijsafspraken only for staff, keyed by the kunstenaar id'` (currently lines 82-104):

```ts
  it('stores and retrieves prijsafspraken and prijsopslag only for staff, keyed by the kunstenaar id', async () => {
    const kunstenaar = await insertRow<{ id: string }>('kunstenaars', {
      naam: 'Dana',
    } as never);
    createdKunstenaarIds.push(kunstenaar.id);
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;

    const putResponse = await putAfspraken(
      req('PUT', { prijsafspraken: '50/50 split', prijsopslag: 35 }, cookie),
      { params: { id: kunstenaar.id } }
    );
    expect(putResponse.status).toBe(200);

    const getResponse = await getAfspraken(req('GET', undefined, cookie), {
      params: { id: kunstenaar.id },
    });
    const body = await getResponse.json();
    expect(body.prijsafspraken).toBe('50/50 split');
    expect(body.prijsopslag).toBe(35);

    const unauthenticated = await getAfspraken(req('GET'), { params: { id: kunstenaar.id } });
    expect(unauthenticated.status).toBe(401);
  });

  it('defaults prijsopslag to 0 for a kunstenaar with no kunstenaarAfspraken row yet', async () => {
    const kunstenaar = await insertRow<{ id: string }>('kunstenaars', {
      naam: 'Erik',
    } as never);
    createdKunstenaarIds.push(kunstenaar.id);
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;

    const response = await getAfspraken(req('GET', undefined, cookie), { params: { id: kunstenaar.id } });
    const body = await response.json();
    expect(body.prijsopslag).toBe(0);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/app/api/kunstenaars.test.ts`
Expected: FAIL — `body.prijsopslag` is `undefined`, not `35`/`0`.

- [ ] **Step 3: Extend the route**

```ts
// src/app/api/kunstenaarAfspraken/[id]/route.ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { requireMedewerker } from '@/lib/server/requireAuth';
import { withApiErrorHandling } from '@/lib/server/apiRoute';

export const GET = withApiErrorHandling(
  'GET /api/kunstenaarAfspraken/[id]',
  async (request: Request, { params }: { params: { id: string } }) => {
    if (!(await requireMedewerker(request))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const [rows] = await getPool().query(
      'SELECT prijsafspraken, prijsopslag FROM kunstenaarAfspraken WHERE id = ?',
      [params.id]
    );
    const row = (rows as Array<{ prijsafspraken: string | null; prijsopslag: string | null }>)[0];
    return NextResponse.json({
      prijsafspraken: row?.prijsafspraken ?? null,
      prijsopslag: row?.prijsopslag != null ? Number(row.prijsopslag) : 0,
    });
  }
);

export const PUT = withApiErrorHandling(
  'PUT /api/kunstenaarAfspraken/[id]',
  async (request: Request, { params }: { params: { id: string } }) => {
    if (!(await requireMedewerker(request))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const { prijsafspraken, prijsopslag } = (await request.json()) as {
      prijsafspraken: string;
      prijsopslag: number;
    };
    await getPool().query(
      'INSERT INTO kunstenaarAfspraken (id, prijsafspraken, prijsopslag) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE prijsafspraken = VALUES(prijsafspraken), prijsopslag = VALUES(prijsopslag)',
      [params.id, prijsafspraken, prijsopslag]
    );
    return NextResponse.json({ ok: true });
  }
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/app/api/kunstenaars.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/kunstenaarAfspraken/[id]/route.ts tests/app/api/kunstenaars.test.ts
git commit -m "feat: add prijsopslag to the staff-only kunstenaarAfspraken route"
```

---

### Task 6: `GET /api/kunstwerken/prijzen` — bulk + ad-hoc pricing endpoint

**Files:**
- Create: `src/app/api/kunstwerken/prijzen/route.ts`
- Test: `tests/app/api/kunstwerken-prijzen.test.ts`

**Interfaces:**
- Consumes: `berekenPrijzenVoorCombinaties`, `berekenPrijzenVoorAlleKunstwerken` from Task 3.
- Produces:
  - `GET /api/kunstwerken/prijzen` (no query params) → `Record<string, PrijsCombinatie[]>` keyed by kunstwerkId. Public (no auth), used by the storefront (Task 7).
  - `GET /api/kunstwerken/prijzen?materiaalIds=a,b&maatIds=c,d&kunstenaarId=x` → `{ prijzen: PrijsCombinatie[] }` for exactly that cross-product. Public, used by the beheer live preview (Task 8) for a kunstwerk that may not exist yet (add-mode).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/app/api/kunstwerken-prijzen.test.ts
import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { GET as getKunstwerkPrijzen } from '@/app/api/kunstwerken/prijzen/route';

const createdMaatIds: string[] = [];
const createdMateriaalsoortIds: string[] = [];
const createdMateriaalIds: string[] = [];
const createdKunstwerkIds: string[] = [];

afterEach(async () => {
  const pool = getPool();
  if (createdKunstwerkIds.length > 0) {
    await pool.query('DELETE FROM kunstwerken WHERE id IN (?)', [createdKunstwerkIds]);
    createdKunstwerkIds.length = 0;
  }
  if (createdMaatIds.length > 0) {
    await pool.query('DELETE FROM maten WHERE id IN (?)', [createdMaatIds]);
    createdMaatIds.length = 0;
  }
  if (createdMateriaalIds.length > 0) {
    await pool.query('DELETE FROM materialen WHERE id IN (?)', [createdMateriaalIds]);
    createdMateriaalIds.length = 0;
  }
  if (createdMateriaalsoortIds.length > 0) {
    await pool.query('DELETE FROM materiaalsoorten WHERE id IN (?)', [createdMateriaalsoortIds]);
    createdMateriaalsoortIds.length = 0;
  }
});

async function maakMaat(breedte: number, hoogte: number) {
  const maat = await insertRow<{ id: string }>('maten', { breedte, hoogte } as never);
  createdMaatIds.push(maat.id);
  return maat.id;
}

async function maakMateriaal() {
  const soort = await insertRow<{ id: string }>('materiaalsoorten', { omschrijving: 'Test soort' } as never);
  createdMateriaalsoortIds.push(soort.id);
  const materiaal = await insertRow<{ id: string }>('materialen', {
    materiaalsoortId: soort.id,
    materiaaldikte: 4,
    omschrijving: 'Test materiaal',
  } as never);
  createdMateriaalIds.push(materiaal.id);
  return materiaal.id;
}

describe('GET /api/kunstwerken/prijzen', () => {
  it('bulk mode: returns computed prijzen keyed by kunstwerkId, without needing auth', async () => {
    const maatId = await maakMaat(41, 61);
    const materiaalId = await maakMateriaal();
    await getPool().query('INSERT INTO prijsmatrix (id, maatId, materiaalId, prijs) VALUES (UUID(), ?, ?, ?)', [
      maatId,
      materiaalId,
      150,
    ]);
    const kunstwerk = await insertRow<{ id: string }>(
      'kunstwerken',
      { naam: 'Bulk test werk', materiaalIds: [materiaalId], maatIds: [maatId] } as never,
      ['materiaalIds', 'maatIds']
    );
    createdKunstwerkIds.push(kunstwerk.id);

    const response = await getKunstwerkPrijzen(new Request('http://localhost/api/kunstwerken/prijzen'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body[kunstwerk.id]).toEqual([{ maatId, materiaalId, prijs: 150 }]);
  });

  it('ad-hoc mode: returns prijzen for the given materiaalIds x maatIds without a saved kunstwerk', async () => {
    const maatId = await maakMaat(42, 62);
    const materiaalId = await maakMateriaal();
    await getPool().query('INSERT INTO prijsmatrix (id, maatId, materiaalId, prijs) VALUES (UUID(), ?, ?, ?)', [
      maatId,
      materiaalId,
      175,
    ]);

    const response = await getKunstwerkPrijzen(
      new Request(`http://localhost/api/kunstwerken/prijzen?materiaalIds=${materiaalId}&maatIds=${maatId}`)
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.prijzen).toEqual([{ maatId, materiaalId, prijs: 175 }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/app/api/kunstwerken-prijzen.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/kunstwerken/prijzen/route.ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { berekenPrijzenVoorAlleKunstwerken, berekenPrijzenVoorCombinaties } from '@/lib/server/prijsmodule';
import { withApiErrorHandling } from '@/lib/server/apiRoute';

export const GET = withApiErrorHandling('GET /api/kunstwerken/prijzen', async (request: Request) => {
  const url = new URL(request.url);
  const materiaalIdsParam = url.searchParams.get('materiaalIds');
  const maatIdsParam = url.searchParams.get('maatIds');

  if (materiaalIdsParam !== null && maatIdsParam !== null) {
    const kunstenaarId = url.searchParams.get('kunstenaarId') || null;
    const materiaalIds = materiaalIdsParam ? materiaalIdsParam.split(',') : [];
    const maatIds = maatIdsParam ? maatIdsParam.split(',') : [];
    const prijzen = await berekenPrijzenVoorCombinaties(getPool(), kunstenaarId, materiaalIds, maatIds);
    return NextResponse.json({ prijzen });
  }

  const prijzenPerKunstwerk = await berekenPrijzenVoorAlleKunstwerken(getPool());
  return NextResponse.json(prijzenPerKunstwerk);
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/app/api/kunstwerken-prijzen.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/kunstwerken/prijzen/route.ts tests/app/api/kunstwerken-prijzen.test.ts
git commit -m "feat: add public /api/kunstwerken/prijzen bulk + ad-hoc pricing endpoint"
```

---

### Task 7: `ProductModal` + `ProductsGrid` — consume computed prijzen

**Files:**
- Modify: `src/components/ProductModal.tsx`
- Modify: `src/components/ProductsGrid.tsx`
- Modify: `tests/components/ProductModal.test.tsx`
- Modify: `tests/components/ProductsGrid.test.tsx`
- Modify (fixture-only, move `prijzen: [...]` from inside the kunstwerk object to a sibling structure, see Step 4): `tests/components/beheer/BeheerShell.test.tsx:66`, `tests/components/FeaturedWorks.test.tsx:17`

**Interfaces:**
- Consumes: `GET /api/kunstwerken/prijzen` (Task 6).
- Produces: `ProductModal` gains a new required prop `prijzen: PrijsRegel[]` (same shape as the old `kunstwerk.prijzen`: `{ materiaalId: string; maatId: string; prijs: number }[]`) replacing its internal use of `kunstwerk.prijzen`.

- [ ] **Step 1: Update `ProductModal.tsx` to take `prijzen` as a prop**

In `src/components/ProductModal.tsx`:
1. Re-add a minimal local type (since `PrijsRegel` no longer exists on `Kunstwerk`) — add this near the top of the file, after the imports:
```ts
interface PrijsRegel {
  materiaalId: string;
  maatId: string;
  prijs: number;
}
```
2. Add `prijzen: PrijsRegel[];` to `ProductModalProps` (after `kunstwerk: Kunstwerk | null;`).
3. Add `prijzen,` to the destructured props in the `ProductModal` function signature.
4. Change:
```ts
  const prijsRegel = !isCustomSize
    ? kunstwerk.prijzen.find((regel) => regel.materiaalId === materiaalId && regel.maatId === maatId)
    : undefined;
```
to:
```ts
  const prijsRegel = !isCustomSize
    ? prijzen.find((regel) => regel.materiaalId === materiaalId && regel.maatId === maatId)
    : undefined;
```
5. Change the `prijsWeergave` computation so a normal (fixed maat/materiaal) kunstwerk with no matching `prijsRegel` shows "prijs op aanvraag" instead of nothing (this is the new, legitimate "matrix cell not yet priced" case):
```ts
  const prijsWeergave: string | null = isMaatloos
    ? prijsPerM2Prijs !== null
      ? formatCurrency(prijsPerM2Prijs)
      : null
    : isCustomSize
      ? t('priceOnRequest')
      : prijsRegel
        ? formatCurrency(prijsRegel.prijs)
        : t('priceOnRequest');
```
(only the final `: null` on the last branch becomes `: t('priceOnRequest')` — every other line is unchanged).

- [ ] **Step 2: Add a bulk-prijzen fetch hook and wire it into `ProductsGrid.tsx`**

Create `src/lib/usePrijzenPerKunstwerk.ts`:
```ts
'use client';

import { useEffect, useState } from 'react';

interface PrijsRegel {
  materiaalId: string;
  maatId: string;
  prijs: number;
}

export function usePrijzenPerKunstwerk(): Record<string, PrijsRegel[]> | null {
  const [prijzen, setPrijzen] = useState<Record<string, PrijsRegel[]> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/kunstwerken/prijzen')
      .then((response) => (response.ok ? response.json() : {}))
      .then((body) => {
        if (!cancelled) setPrijzen(body);
      })
      .catch(() => {
        if (!cancelled) setPrijzen({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return prijzen;
}
```

In `src/components/ProductsGrid.tsx`:
1. Add the import: `import { usePrijzenPerKunstwerk } from '@/lib/usePrijzenPerKunstwerk';`
2. After the `const onderwerpen = useApiCollection<Onderwerp>('onderwerpen');` line, add: `const prijzenPerKunstwerk = usePrijzenPerKunstwerk();`
3. In the closing `<ProductModal .../>` call, add the prop: `prijzen={(selectedKunstwerk && prijzenPerKunstwerk?.[selectedKunstwerk.id]) ?? []}`

- [ ] **Step 3: Update `tests/components/ProductModal.test.tsx`**

The fixtures currently embed `prijzen: [...]` inside each `KUNSTWERK`-like object (lines 37, 71, 86 and others created inline per-test). For every one of these, move the `prijzen` array out of the kunstwerk object and instead pass it via a new `prijzen` prop on every `render(<ProductModal .../>)` call in this file (there are ~40 call sites). Concretely:
1. At the top-level fixture objects (lines ~30-90), delete the `prijzen: [...]` key from the kunstwerk object, and instead define a sibling constant, e.g.:
```ts
const KUNSTWERK_PRIJZEN = [{ materiaalId: 'mat-1', maatId: 'maat-1', prijs: 150 }];
```
(one such constant per distinct `prijzen` fixture value already present in the file — reuse the existing array literal contents, just hoisted out of the kunstwerk object).
2. Find every `render(<ProductModal kunstwerk={...} .../>)` call in the file and add `prijzen={KUNSTWERK_PRIJZEN}` (or `prijzen={[]}` for kunstwerken whose fixture had `prijzen: []`, e.g. the materiaalloos/maatloos/custom-size fixtures) as a prop.
3. For the specific tests that change materiaal/maat mid-test and expect a different price (`'updates the shown price when a different materiaal or maat is chosen'`, testing €200 then €225), extend the corresponding `_PRIJZEN` constant to include all the combinations that test's fixture actually needs (check the test body for which materiaalId/maatId combinations get selected, and add matching entries with the price values the assertions expect).
4. For `'shows the resolved description, defaults to the first materiaal/maat, and the matching price'` and the two "labels" tests (`'labels the shown price with "Prijs"...'`) expecting €150, wire `prijzen={[{ materiaalId: 'mat-1', maatId: 'maat-1', prijs: 150 }]}`.

- [ ] **Step 4: Run `ProductModal.test.tsx`, fix any remaining prop-shape mismatches, then verify green**

Run: `npx vitest run tests/components/ProductModal.test.tsx`
Iterate on Step 3 until every test passes — the failures will point exactly at which render call is still missing a `prijzen` prop or has the wrong price value.

- [ ] **Step 5: Update `tests/components/ProductsGrid.test.tsx`**

1. Remove `prijzen: [...]` from the three `KUNSTWERKEN` fixture entries (lines 41, 58, 75) and from the two inline kunstwerk objects at lines 416 and 445.
2. Add a module-level constant mapping kunstwerkId to its prijzen array:
```ts
const KUNSTWERKEN_PRIJZEN: Record<string, Array<{ materiaalId: string; maatId: string; prijs: number }>> = {
  'kw-1': [{ materiaalId: 'mat-1', maatId: 'maat-1', prijs: 150 }],
  'kw-2': [{ materiaalId: 'mat-1', maatId: 'maat-1', prijs: 200 }],
  'kw-3': [{ materiaalId: 'mat-1', maatId: 'maat-1', prijs: 175 }],
};
```
(check the two inline-object tests at lines ~416 and ~445 for whichever kunstwerk id/prijzen they used and add/adjust an entry for those too, keyed by that test's kunstwerk id — e.g. `'kw-4': [{ materiaalId: 'mat-1', maatId: 'maat-1', prijs: 220 }]` and an empty-array entry for the one that had `prijzen: []`).
3. In the `fetchMock.mockImplementation` (currently lines 147-156), add a branch before the generic fallback:
```ts
    if (url === '/api/kunstwerken/prijzen') {
      return { ok: true, json: async () => KUNSTWERKEN_PRIJZEN };
    }
```

- [ ] **Step 6: Update the two remaining fixture-only test files**

- `tests/components/beheer/BeheerShell.test.tsx:66` — delete `prijzen: [{ materiaalId: 'mat-1', maatId: 'maat-1', prijs: 150 }],` from the fixture object (this file renders `BeheerShell`, not `ProductModal` directly, so no prop needs to replace it — confirm with `grep -n "ProductModal" tests/components/beheer/BeheerShell.test.tsx` that this file never renders `ProductModal` directly before deleting; if it does, mock `fetch('/api/kunstwerken/prijzen')` the same way as Step 5).
- `tests/components/FeaturedWorks.test.tsx:17` — delete `prijzen: [{ materiaalId: 'mat-1', maatId: 'maat-1', prijs: 150 }],` (confirm `FeaturedWorks.tsx` doesn't render `ProductModal`/read `.prijzen` before deleting; if it does, add the equivalent prop/mock).

- [ ] **Step 7: Run the full test suite**

```bash
npx vitest run
```
Expected: PASS for `ProductModal.test.tsx`, `ProductsGrid.test.tsx`, `BeheerShell.test.tsx`, `FeaturedWorks.test.tsx`.

- [ ] **Step 8: Commit**

```bash
git add src/components/ProductModal.tsx src/components/ProductsGrid.tsx src/lib/usePrijzenPerKunstwerk.ts tests/components/ProductModal.test.tsx tests/components/ProductsGrid.test.tsx tests/components/beheer/BeheerShell.test.tsx tests/components/FeaturedWorks.test.tsx
git commit -m "refactor: ProductModal/ProductsGrid consume computed prijzen from the Prijsmodule endpoint"
```

---

### Task 8: `KunstwerkenSection` — remove manual prijzen grid, add computed preview

**Files:**
- Modify: `src/components/beheer/KunstwerkenSection.tsx`
- Modify: `tests/components/beheer/KunstwerkenSection.test.tsx`

**Interfaces:**
- Consumes: `GET /api/kunstwerken/prijzen?materiaalIds=&maatIds=&kunstenaarId=` (Task 6, ad-hoc mode).
- Produces: no more `prijzen` in the object built by `buildKunstwerkData()`; a new local `previewPrijzen` state feeding both a read-only preview table and the embedded live `<ProductModal variant="preview">`.

- [ ] **Step 1: Remove the manual price grid and its validation**

In `src/components/beheer/KunstwerkenSection.tsx`:
1. Remove `PrijsRegel` from the type import (line 11) — it no longer exists.
2. Remove `prijzen` from `LEGE_FORM` (line 56) and the `useState<PrijzenState>` line (line 100).
3. In `buildKunstwerkData()` (lines 199-224), remove the `prijzen: isMaatloos ? [] : prijsCombinaties.map(...)` block entirely — the returned `basis` object no longer has a `prijzen` key.
4. Remove the `prijzenMap` construction block in `openEdit` (lines 343-347) and the `setPrijzen(prijzenMap);` call.
5. Remove `setPrijzen(LEGE_FORM.prijzen);` from `resetForm()` (line 316).
6. Remove `allePrijzenIngevuld` (lines 413-415) and change `opslaanDisabled` (lines 416-423) from:
```ts
  const opslaanDisabled =
    !foto ||
    formaat === null ||
    uploading ||
    !naam ||
    segmentIds.length === 0 ||
    (isMaatloos ? !prijsPerM2 || Number(prijsPerM2) <= 0 : !allePrijzenIngevuld) ||
    !omschrijvingNl;
```
to:
```ts
  const opslaanDisabled =
    !foto ||
    formaat === null ||
    uploading ||
    !naam ||
    segmentIds.length === 0 ||
    (isMaatloos && (!prijsPerM2 || Number(prijsPerM2) <= 0)) ||
    !omschrijvingNl;
```
7. Delete the `prijsKey`/`PrijzenState` helper and type (lines 34-39) — no longer used.

- [ ] **Step 2: Add the live preview-price fetch**

Add a new `useEffect` after the existing `prijsCombinaties` computation (after line 197), fetching the ad-hoc combined prijzen whenever the relevant form state changes:
```ts
  const [previewPrijzen, setPreviewPrijzen] = useState<{ materiaalId: string; maatId: string; prijs: number }[]>([]);

  useEffect(() => {
    if (isMaatloos || materiaalIds.length === 0 || maatIds.length === 0) {
      setPreviewPrijzen([]);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({
      materiaalIds: materiaalIds.join(','),
      maatIds: maatIds.join(','),
      ...(kunstenaarId ? { kunstenaarId } : {}),
    });
    fetch(`/api/kunstwerken/prijzen?${params.toString()}`)
      .then((response) => (response.ok ? response.json() : { prijzen: [] }))
      .then((body) => {
        if (!cancelled) setPreviewPrijzen(body.prijzen ?? []);
      })
      .catch(() => {
        if (!cancelled) setPreviewPrijzen([]);
      });
    return () => {
      cancelled = true;
    };
  }, [materiaalIds, maatIds, kunstenaarId, isMaatloos]);
```
(place this after the existing `useEffect` blocks, e.g. right after the `pendingNieuweOnderwerpNaam` effect around line 129).

- [ ] **Step 3: Replace the manual price-input table with a read-only preview**

Replace the block starting `{materiaalIds.length > 0 && maatIds.length > 0 && (` (currently lines 857-914) — keep the same outer condition and table/thead structure, but render plain text instead of `<input>`, and drop the "Vul een prijs in" validation hint:
```tsx
          {materiaalIds.length > 0 && maatIds.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-white/60">{t('kunstwerkenLabelPrijzen')}</span>
              <table data-testid="kunstwerk-modal-prijzen" className="border-collapse text-sm text-white/80">
                <thead>
                  <tr>
                    <th className="border border-white/10 px-2 py-1"></th>
                    {(maten ?? [])
                      .filter((maat) => maatIds.includes(maat.id))
                      .map((maat) => (
                        <th key={maat.id} className="border border-white/10 px-2 py-1 text-xs font-semibold">
                          {`${maat.breedte}×${maat.hoogte}`}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {(materialen ?? [])
                    .filter((materiaal) => materiaalIds.includes(materiaal.id))
                    .map((materiaal) => (
                      <tr key={materiaal.id}>
                        <td className="border border-white/10 px-2 py-1 text-xs whitespace-nowrap">
                          {materiaalLabel(materiaal)}
                        </td>
                        {(maten ?? [])
                          .filter((maat) => maatIds.includes(maat.id))
                          .map((maat) => {
                            const regel = previewPrijzen.find(
                              (p) => p.materiaalId === materiaal.id && p.maatId === maat.id
                            );
                            return (
                              <td
                                key={maat.id}
                                data-testid={`kunstwerk-modal-prijs-preview-${materiaal.id}-${maat.id}`}
                                className="border border-white/10 px-2 py-1 text-xs"
                              >
                                {regel ? `€ ${regel.prijs.toFixed(2).replace('.', ',')}` : '—'}
                              </td>
                            );
                          })}
                      </tr>
                    ))}
                </tbody>
              </table>
              <span className="text-xs normal-case tracking-normal text-white/50">
                {t('kunstwerkenPrijzenHint')}
              </span>
            </div>
          )}
```

- [ ] **Step 4: Pass `previewPrijzen` into the embedded live `ProductModal`**

In the `<ProductModal variant="preview" .../>` call (currently lines 993-1004), add: `prijzen={previewPrijzen}`.

- [ ] **Step 5: Add the new i18n key**

In `messages/nl.json`, add a new key right after `"kunstwerkenLabelPrijzen": "Prijzen per materiaal en maat",` (line 530):
```json
    "kunstwerkenPrijzenHint": "Prijzen komen uit de Prijsmatrix en de prijsopslag van de kunstenaar (beheer je in die secties).",
```
Also delete the now-unused key `"kunstwerkenPrijzenVerplicht": "Vul voor elke materiaal/maat-combinatie een prijs in.",` (line 518) — it was only referenced by the removed validation hint. Confirm with `grep -n "kunstwerkenPrijzenVerplicht" src/ -r` that no reference remains before deleting.

- [ ] **Step 6: Update `tests/components/beheer/KunstwerkenSection.test.tsx`**

This file's `fetchMock` will need a `/api/kunstwerken/prijzen` branch (same pattern as Task 7 Step 5) returning a canned `{ prijzen: [...] }` response, so the tests can `await waitFor(...)` for the preview to populate.
1. Add, in this file's `fetchMock.mockImplementation`, a branch:
```ts
    if (url.startsWith('/api/kunstwerken/prijzen')) {
      return { ok: true, json: async () => ({ prijzen: PREVIEW_PRIJZEN }) };
    }
```
where `PREVIEW_PRIJZEN` is a module-level constant the individual tests can point at (e.g. `[{ materiaalId: 'mat-1', maatId: 'maat-1', prijs: 150 }]`, matching what the removed manual-input tests used to type in).
2. Delete every test/assertion that fills in or asserts a `kunstwerk-modal-prijs-{materiaalId}-{maatId}` **input** (lines ~192, 212-220, 236, 252, 267, 272, 287, 335, 351, 390, 420-425, 848 and their surrounding `it()` blocks) — these tested the manual entry grid, which no longer exists. Do not delete the tests unrelated to pricing in the same `it()` blocks; where a price-fill step was just one step within a broader "fills in and saves a kunstwerk" test, replace that step with nothing (remove the `fireEvent.change(...kunstwerk-modal-prijs...)` lines) and remove `prijzen: [...]` from that test's expected saved-payload assertion (e.g. lines 252, 287, 420-425).
3. Add a new test asserting the read-only preview renders the fetched price:
```ts
  it('shows a read-only computed price preview per materiaal/maat combination instead of an input', async () => {
    openAddModalMetMateriaalEnMaat(); // use this file's existing helper for opening the modal with a materiaal+maat selected
    const cel = await screen.findByTestId('kunstwerk-modal-prijs-preview-mat-1-maat-1');
    expect(cel).toHaveTextContent('€ 150,00');
    expect(screen.queryByTestId('kunstwerk-modal-prijs-mat-1-maat-1')).not.toBeInTheDocument();
  });
```
(replace `openAddModalMetMateriaalEnMaat()` with whatever this file's actual existing setup helper/sequence is for opening the add modal with a materiaal and maat already selected — check the top of the file for the established helper name before writing this step).

- [ ] **Step 7: Run tests, iterate to green**

```bash
npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx
```

- [ ] **Step 8: Commit**

```bash
git add src/components/beheer/KunstwerkenSection.tsx tests/components/beheer/KunstwerkenSection.test.tsx messages/nl.json
git commit -m "refactor: KunstwerkenSection shows a computed read-only price preview instead of manual entry"
```

---

### Task 9: Server-side deletion guard — block deleting a maat/materiaal still used in an order

**Files:**
- Modify: `src/app/api/[resource]/[id]/route.ts`
- Modify: `tests/app/api/lookup-resources.test.ts`

**Interfaces:**
- Produces: `DELETE /api/maten/[id]` and `DELETE /api/materialen/[id]` now return `409` (instead of deleting) when a `bestellijn` references that id, regardless of whether any kunstwerk still references it.

- [ ] **Step 1: Write the failing tests**

Add to `tests/app/api/lookup-resources.test.ts` (needs `insertRow`, `hashPassword`, and a `bestellines` insert helper — add the imports and a small helper at the top of the file). `bestelheaders.klantId` has a foreign key to `klanten.id`, so the helper must create a real klant first:
```ts
import { insertRow } from '@/lib/server/crud';
import { hashPassword } from '@/lib/server/password';
```
```ts
async function maakBestellijnVoorMaat(maatId: string): Promise<{ headerId: string; klantEmail: string }> {
  const klantEmail = `bestellijn-guard-${maatId}@example.com`;
  const klant = await insertRow<{ id: string }>('klanten', {
    email: klantEmail,
    wachtwoordHash: await hashPassword('x'),
    status: 'Goedgekeurd',
  } as never);
  const header = await insertRow<{ id: string }>('bestelheaders', {
    klantId: klant.id,
    bestelnr: 'GD-TEST',
    status: 'Te beoordelen',
  } as never);
  await insertRow<{ id: string }>('bestellines', {
    bestelheaderId: header.id,
    maatId,
    quantity: 1,
  } as never);
  return { headerId: header.id, klantEmail };
}
```
Add these tests to the `describe('generic lookup-resource routes', ...)` block. Note `jsonRequest` (defined at the top of this file) always builds its `Request` against the literal URL `http://localhost/api/segmenten`, but the route implementation only ever reads `params.resource`/the body — never the request URL — so reusing `jsonRequest('POST'/'DELETE', ..., cookie)` unchanged for a `maten` resource is safe and consistent with every other test already in this file:
```ts
  it('rejects deleting a maat that is still referenced by a bestellijn, even if no kunstwerk uses it', async () => {
    const cookie = await medewerkerCookie();
    const createResponse = await createResource(jsonRequest('POST', { breedte: 12, hoogte: 34 }, cookie), {
      params: { resource: 'maten' },
    });
    const created = await createResponse.json();
    const { headerId, klantEmail } = await maakBestellijnVoorMaat(created.id);

    const deleteResponse = await deleteResource(jsonRequest('DELETE', undefined, cookie), {
      params: { resource: 'maten', id: created.id },
    });
    expect(deleteResponse.status).toBe(409);

    await getPool().query('DELETE FROM bestelheaders WHERE id = ?', [headerId]);
    await getPool().query('DELETE FROM klanten WHERE email = ?', [klantEmail]);
    await getPool().query('DELETE FROM maten WHERE id = ?', [created.id]);
  });

  it('allows deleting a maat that has never been used in a bestellijn', async () => {
    const cookie = await medewerkerCookie();
    const createResponse = await createResource(jsonRequest('POST', { breedte: 13, hoogte: 35 }, cookie), {
      params: { resource: 'maten' },
    });
    const created = await createResponse.json();

    const deleteResponse = await deleteResource(jsonRequest('DELETE', undefined, cookie), {
      params: { resource: 'maten', id: created.id },
    });
    expect(deleteResponse.status).toBe(200);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/app/api/lookup-resources.test.ts`
Expected: FAIL — the first new test gets `200` instead of `409`.

- [ ] **Step 3: Add the guard to the DELETE handler**

In `src/app/api/[resource]/[id]/route.ts`, add the `getPool` import and the check:
```ts
import { NextResponse } from 'next/server';
import { getRow, updateRow, deleteRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { LOOKUP_RESOURCES } from '@/lib/server/lookupResources';
import { requireMedewerker } from '@/lib/server/requireAuth';
import { withApiErrorHandling } from '@/lib/server/apiRoute';

// ... GET and PATCH unchanged ...

const BESTELLING_REFERENCE_COLUMN: Record<string, string> = {
  maten: 'maatId',
  materialen: 'materiaalId',
};

export const DELETE = withApiErrorHandling(
  'DELETE /api/[resource]/[id]',
  async (request: Request, { params }: { params: { resource: string; id: string } }) => {
    const config = LOOKUP_RESOURCES[params.resource];
    if (!config) {
      return NextResponse.json({ error: 'not-found' }, { status: 404 });
    }
    if (config.writeAuthRequired && !(await requireMedewerker(request))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const column = BESTELLING_REFERENCE_COLUMN[params.resource];
    if (column) {
      const [rows] = await getPool().query(`SELECT 1 FROM bestellines WHERE ${column} = ? LIMIT 1`, [params.id]);
      if ((rows as unknown[]).length > 0) {
        return NextResponse.json({ error: 'in-use-bestelling' }, { status: 409 });
      }
    }
    await deleteRow(params.resource, params.id);
    return NextResponse.json({ ok: true });
  }
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/app/api/lookup-resources.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite once to confirm no regression**

```bash
npx vitest run
```
`MatenSection.test.tsx`/`MaterialenSection.test.tsx` mock `onRemove` directly (not the real route), so they're unaffected by this server-side change — confirm they still pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/[resource]/[id]/route.ts tests/app/api/lookup-resources.test.ts
git commit -m "fix: block deleting a maat/materiaal still referenced by a bestellijn, server-side"
```

---

### Task 10: `bestelheaders` — server-side price recompute (security fix)

**Files:**
- Modify: `src/app/api/bestelheaders/route.ts`
- Modify: `tests/app/api/bestelheaders.test.ts`

**Interfaces:**
- Consumes: `berekenBestellijnPrijs` from Task 3.
- Produces: `POST /api/bestelheaders` ignores the client-submitted `line.prijs` entirely; the stored `bestellines.prijs` is always the server's own computed value. Returns `400 { error: 'prijs-onbekend' }` if a fixed-maat line's price can't be resolved (no matrix entry), or `400 { error: 'kunstwerk-not-found' }` if `kunstwerkId` doesn't resolve to a real row.

- [ ] **Step 1: Rewrite `tests/app/api/bestelheaders.test.ts` to use real, priced fixtures**

Replace the whole file. This mirrors the existing file's structure and cleanup discipline exactly, but every line that previously used placeholder ids (`'kw-1'`, `'maat-1'`, `'mat-1'`) now creates a real `materiaalsoort`/`materiaal`/`maat`/`kunstwerk`/`prijsmatrix` row, since the server now needs them to resolve a price.

```ts
import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { hashPassword } from '@/lib/server/password';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { POST as createHeader, GET as listHeaders } from '@/app/api/bestelheaders/route';
import { PATCH as patchHeader } from '@/app/api/bestelheaders/[id]/route';
import { PATCH as patchLine } from '@/app/api/bestelheaders/[id]/bestellines/[lineId]/route';

const BESTELNR_PADDING = 5;

const createdKlantEmails: string[] = [];
const createdKunstwerkIds: string[] = [];
const createdKunstenaarIds: string[] = [];
const createdMaatIds: string[] = [];
const createdMateriaalIds: string[] = [];
const createdMateriaalsoortIds: string[] = [];

afterEach(async () => {
  const pool = getPool();
  if (createdKlantEmails.length > 0) {
    await pool.query(
      'DELETE FROM sessions WHERE userType = \'klant\' AND userId IN (SELECT id FROM klanten WHERE email IN (?))',
      [createdKlantEmails]
    );
    await pool.query('DELETE FROM bestelheaders WHERE klantId IN (SELECT id FROM klanten WHERE email IN (?))', [
      createdKlantEmails,
    ]);
    await pool.query('DELETE FROM klanten WHERE email IN (?)', [createdKlantEmails]);
    createdKlantEmails.length = 0;
  }
  if (createdKunstwerkIds.length > 0) {
    await pool.query('DELETE FROM kunstwerken WHERE id IN (?)', [createdKunstwerkIds]);
    createdKunstwerkIds.length = 0;
  }
  if (createdKunstenaarIds.length > 0) {
    await pool.query('DELETE FROM kunstenaars WHERE id IN (?)', [createdKunstenaarIds]);
    createdKunstenaarIds.length = 0;
  }
  if (createdMaatIds.length > 0) {
    await pool.query('DELETE FROM maten WHERE id IN (?)', [createdMaatIds]);
    createdMaatIds.length = 0;
  }
  if (createdMateriaalIds.length > 0) {
    await pool.query('DELETE FROM materialen WHERE id IN (?)', [createdMateriaalIds]);
    createdMateriaalIds.length = 0;
  }
  if (createdMateriaalsoortIds.length > 0) {
    await pool.query('DELETE FROM materiaalsoorten WHERE id IN (?)', [createdMateriaalsoortIds]);
    createdMateriaalsoortIds.length = 0;
  }
});

async function nextExpectedBestelnr(): Promise<string> {
  const [rows] = await getPool().query("SELECT value FROM counters WHERE id = 'bestelnummer'", []);
  const current = ((rows as Array<{ value: number }>)[0]?.value ?? 0) + 1;
  return `GD-${String(current).padStart(BESTELNR_PADDING, '0')}`;
}

async function klant(email: string): Promise<{ id: string; cookie: string }> {
  const created = await insertRow<{ id: string }>('klanten', {
    email,
    wachtwoordHash: await hashPassword('x'),
    status: 'Goedgekeurd',
  } as never);
  createdKlantEmails.push(email);
  const sessionId = await createSession('klant', created.id);
  return { id: created.id, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

async function medewerkerCookie(): Promise<string> {
  const sessionId = await createSession('medewerker', 'staff-1');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

async function maakMaat(breedte: number, hoogte: number): Promise<string> {
  const maat = await insertRow<{ id: string }>('maten', { breedte, hoogte } as never);
  createdMaatIds.push(maat.id);
  return maat.id;
}

async function maakMateriaal(): Promise<string> {
  const soort = await insertRow<{ id: string }>('materiaalsoorten', { omschrijving: 'Test soort' } as never);
  createdMateriaalsoortIds.push(soort.id);
  const materiaal = await insertRow<{ id: string }>('materialen', {
    materiaalsoortId: soort.id,
    materiaaldikte: 4,
    omschrijving: 'Test materiaal',
  } as never);
  createdMateriaalIds.push(materiaal.id);
  return materiaal.id;
}

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
    { naam: 'Test werk', kunstenaarId, materiaalIds: [materiaalId], maatIds: [maatId] } as never,
    ['materiaalIds', 'maatIds']
  );
  createdKunstwerkIds.push(kunstwerk.id);
  return kunstwerk.id;
}

function postRequest(body: unknown, cookie?: string) {
  return new Request('http://localhost/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

describe('bestelheaders routes', () => {
  it('creates a header with lines and an incrementing bestelnr, using the session klant, pricing from the matrix', async () => {
    const { id: klantId, cookie } = await klant('k@example.com');
    const maatId = await maakMaat(41, 61);
    const materiaalId = await maakMateriaal();
    const kunstwerkId = await maakGeprijsdKunstwerk(maatId, materiaalId, 150);
    const expectedBestelnr = await nextExpectedBestelnr();

    const response = await createHeader(
      postRequest({ lines: [{ kunstwerkId, maatId, materiaalId, prijs: 999999, quantity: 2 }] }, cookie)
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.bestelnr).toBe(expectedBestelnr);

    const [headerRows] = await getPool().query('SELECT klantId FROM bestelheaders WHERE id = ?', [body.id]);
    expect((headerRows as Array<{ klantId: string }>)[0].klantId).toBe(klantId);

    const [lineRows] = await getPool().query('SELECT prijs FROM bestellines WHERE bestelheaderId = ?', [body.id]);
    // The client submitted 999999 -- the server ignores it and stores its own computed price.
    expect(Number((lineRows as Array<{ prijs: string }>)[0].prijs)).toBe(150);
  });

  it('adds a kunstenaar prijsopslag on top of the matrixprijs', async () => {
    const { cookie } = await klant('opslag@example.com');
    const maatId = await maakMaat(43, 63);
    const materiaalId = await maakMateriaal();
    const kunstenaar = await insertRow<{ id: string }>('kunstenaars', {
      naam: 'Opslag Artiest',
    } as never);
    createdKunstenaarIds.push(kunstenaar.id);
    await getPool().query('INSERT INTO kunstenaarAfspraken (id, prijsopslag) VALUES (?, ?)', [kunstenaar.id, 40]);
    const kunstwerkId = await maakGeprijsdKunstwerk(maatId, materiaalId, 100, kunstenaar.id);

    const response = await createHeader(
      postRequest({ lines: [{ kunstwerkId, maatId, materiaalId, prijs: 1, quantity: 1 }] }, cookie)
    );
    const body = await response.json();
    const [lineRows] = await getPool().query('SELECT prijs FROM bestellines WHERE bestelheaderId = ?', [body.id]);
    expect(Number((lineRows as Array<{ prijs: string }>)[0].prijs)).toBe(140);
  });

  it('rejects a line for a fixed maat/materiaal with no matrixprijs set', async () => {
    const { cookie } = await klant('nomatrix@example.com');
    const maatId = await maakMaat(44, 64);
    const materiaalId = await maakMateriaal();
    const kunstwerk = await insertRow<{ id: string }>(
      'kunstwerken',
      { naam: 'Ongeprijsd werk', materiaalIds: [materiaalId], maatIds: [maatId] } as never,
      ['materiaalIds', 'maatIds']
    );
    createdKunstwerkIds.push(kunstwerk.id);

    const response = await createHeader(
      postRequest({ lines: [{ kunstwerkId: kunstwerk.id, maatId, materiaalId, prijs: 1, quantity: 1 }] }, cookie)
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('prijs-onbekend');
  });

  it('rejects a line referencing a kunstwerkId that does not exist', async () => {
    const { cookie } = await klant('nokunstwerk@example.com');
    const response = await createHeader(
      postRequest(
        { lines: [{ kunstwerkId: 'does-not-exist', maatId: 'x', materiaalId: 'y', prijs: 1, quantity: 1 }] },
        cookie
      )
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('kunstwerk-not-found');
  });

  it('computes a maatloos kunstwerk\'s prijs from prijsPerM2 and the submitted afmetingen', async () => {
    const { cookie } = await klant('maatloos@example.com');
    const kunstwerk = await insertRow<{ id: string }>(
      'kunstwerken',
      { naam: 'Maatloos werk', materiaalIds: [], maatIds: [], prijsPerM2: 100 } as never,
      ['materiaalIds', 'maatIds']
    );
    createdKunstwerkIds.push(kunstwerk.id);

    const response = await createHeader(
      postRequest(
        {
          lines: [
            { kunstwerkId: kunstwerk.id, maatId: '', materiaalId: '', prijs: 1, quantity: 1, breedte: 120, hoogte: 60 },
          ],
        },
        cookie
      )
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    const [lineRows] = await getPool().query('SELECT prijs FROM bestellines WHERE bestelheaderId = ?', [body.id]);
    expect(Number((lineRows as Array<{ prijs: string }>)[0].prijs)).toBe(72);
  });

  it('stores a null prijs for an eigen-maat line on a kunstwerk that is not maatloos (priced later by staff)', async () => {
    const { cookie } = await klant('eigenmaat@example.com');
    const maatId = await maakMaat(45, 65);
    const materiaalId = await maakMateriaal();
    const kunstwerk = await insertRow<{ id: string }>(
      'kunstwerken',
      { naam: 'Eigen maat werk', materiaalIds: [materiaalId], maatIds: [maatId] } as never,
      ['materiaalIds', 'maatIds']
    );
    createdKunstwerkIds.push(kunstwerk.id);

    const response = await createHeader(
      postRequest(
        {
          lines: [
            {
              kunstwerkId: kunstwerk.id,
              maatId: '',
              materiaalId,
              prijs: 1,
              quantity: 1,
              breedte: 80,
              hoogte: 40,
            },
          ],
        },
        cookie
      )
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    const [lineRows] = await getPool().query('SELECT prijs FROM bestellines WHERE bestelheaderId = ?', [body.id]);
    expect((lineRows as Array<{ prijs: string | null }>)[0].prijs).toBeNull();
  });

  it('rejects placing an order without a klant session', async () => {
    const response = await createHeader(postRequest({ lines: [] }));
    expect(response.status).toBe(401);
  });

  it('ignores a klantId in the request body -- the order is always placed for the session klant', async () => {
    const { id: klantId, cookie } = await klant('spoof@example.com');
    const other = await klant('spoof-target@example.com');

    const response = await createHeader(postRequest({ klantId: other.id, lines: [] }, cookie));
    expect(response.status).toBe(201);
    const body = await response.json();
    const [rows] = await getPool().query('SELECT klantId FROM bestelheaders WHERE id = ?', [body.id]);
    expect((rows as Array<{ klantId: string }>)[0].klantId).toBe(klantId);
  });

  it('lists all headers for a medewerker, and only own headers for a customer', async () => {
    const klantA = await klant('a@example.com');
    const klantB = await klant('b@example.com');
    const headerA = await (await createHeader(postRequest({ lines: [] }, klantA.cookie))).json();
    const headerB = await (await createHeader(postRequest({ lines: [] }, klantB.cookie))).json();

    const all = await listHeaders(
      new Request('http://localhost/api/bestelheaders', { headers: { cookie: await medewerkerCookie() } })
    );
    const allIds = (await all.json()).map((row: { id: string }) => row.id);
    expect(allIds).toEqual(expect.arrayContaining([headerA.id, headerB.id]));

    const onlyA = await listHeaders(
      new Request(`http://localhost/api/bestelheaders?klantId=${klantA.id}`, {
        headers: { cookie: klantA.cookie },
      })
    );
    const onlyAIds = (await onlyA.json()).map((row: { id: string }) => row.id);
    expect(onlyAIds).toEqual([headerA.id]);
  });

  it('rejects listing all headers without a medewerker session', async () => {
    const response = await listHeaders(new Request('http://localhost/api/bestelheaders'));
    expect(response.status).toBe(401);
  });

  it('rejects a klant reading another klant\'s orders by klantId', async () => {
    const klantA = await klant('reader-a@example.com');
    const klantB = await klant('reader-b@example.com');
    const response = await listHeaders(
      new Request(`http://localhost/api/bestelheaders?klantId=${klantB.id}`, {
        headers: { cookie: klantA.cookie },
      })
    );
    expect(response.status).toBe(401);
  });

  it('updates header status and a line price as a medewerker', async () => {
    const { cookie } = await klant('c@example.com');
    const maatId = await maakMaat(46, 66);
    const materiaalId = await maakMateriaal();
    const kunstwerk = await insertRow<{ id: string }>(
      'kunstwerken',
      { naam: 'Eigen maat werk 2', materiaalIds: [materiaalId], maatIds: [maatId] } as never,
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
    const [lineRows] = await getPool().query('SELECT id FROM bestellines WHERE bestelheaderId = ?', [header.id]);
    const lineId = (lineRows as Array<{ id: string }>)[0].id;
    const staffCookie = await medewerkerCookie();

    await patchHeader(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: staffCookie },
        body: JSON.stringify({ status: 'Te versturen naar drukker' }),
      }),
      { params: { id: header.id } }
    );
    await patchLine(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: staffCookie },
        body: JSON.stringify({ prijs: 199 }),
      }),
      { params: { id: header.id, lineId } }
    );

    const [headerRows] = await getPool().query('SELECT status FROM bestelheaders WHERE id = ?', [header.id]);
    expect((headerRows as Array<{ status: string }>)[0].status).toBe('Te versturen naar drukker');
    const [updatedLineRows] = await getPool().query('SELECT prijs FROM bestellines WHERE id = ?', [lineId]);
    expect(Number((updatedLineRows as Array<{ prijs: string }>)[0].prijs)).toBe(199);
  });

  it('rejects patching a header status or line price without a medewerker session', async () => {
    const { cookie } = await klant('unauth-patch@example.com');
    const maatId = await maakMaat(47, 67);
    const materiaalId = await maakMateriaal();
    const kunstwerk = await insertRow<{ id: string }>(
      'kunstwerken',
      { naam: 'Eigen maat werk 3', materiaalIds: [materiaalId], maatIds: [maatId] } as never,
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
    const [lineRows] = await getPool().query('SELECT id FROM bestellines WHERE bestelheaderId = ?', [header.id]);
    const lineId = (lineRows as Array<{ id: string }>)[0].id;

    const headerResponse = await patchHeader(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Te versturen naar drukker' }),
      }),
      { params: { id: header.id } }
    );
    expect(headerResponse.status).toBe(401);

    const lineResponse = await patchLine(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prijs: 1 }),
      }),
      { params: { id: header.id, lineId } }
    );
    expect(lineResponse.status).toBe(401);
  });

  it('rejects a line with a non-positive quantity', async () => {
    const { cookie } = await klant('e@example.com');
    const maatId = await maakMaat(48, 68);
    const materiaalId = await maakMateriaal();
    const kunstwerkId = await maakGeprijsdKunstwerk(maatId, materiaalId, 100);
    const response = await createHeader(
      postRequest({ lines: [{ kunstwerkId, maatId, materiaalId, prijs: 100, quantity: 0 }] }, cookie)
    );
    expect(response.status).toBe(400);
  });

  it('rejects ordering an artwork exclusively reserved for a different klant', async () => {
    const klantA = await klant('g@example.com');
    const klantB = await klant('h@example.com');
    const maatId = await maakMaat(49, 69);
    const materiaalId = await maakMateriaal();
    const kunstenaar = await insertRow<{ id: string }>(
      'kunstenaars',
      { naam: 'Exclusieve Artiest', exclusieveKlantIds: [klantB.id] } as never,
      ['exclusieveKlantIds']
    );
    createdKunstenaarIds.push(kunstenaar.id);
    const kunstwerkId = await maakGeprijsdKunstwerk(maatId, materiaalId, 100, kunstenaar.id);

    const response = await createHeader(
      postRequest({ lines: [{ kunstwerkId, maatId, materiaalId, prijs: 100, quantity: 1 }] }, klantA.cookie)
    );
    expect(response.status).toBe(403);

    const allowedForB = await createHeader(
      postRequest({ lines: [{ kunstwerkId, maatId, materiaalId, prijs: 100, quantity: 1 }] }, klantB.cookie)
    );
    expect(allowedForB.status).toBe(201);
  });
});
```

Note on this rewrite: the plan as originally written (against `db/schema.sql` on `master`) assumed `kunstenaars` still had `verkooprecht`/`klantId`/`exclusiefVoorKlantId` and included a second test for an "artist-only" artwork (`verkooprecht: 'alleen-kunstenaar'`). That concept has been dropped entirely from the live schema/application in the (not yet merged into `master`) exclusiviteit-herontwerp work — `checkOrderRight` in `src/app/api/bestelheaders/route.ts` only ever checks `exclusieveKlantIds` now, with no equivalent "artist-only" case. The exclusivity test above was adapted to `exclusieveKlantIds`; the artist-only test was dropped because it no longer corresponds to any real code path. `insertRow` needs `['exclusieveKlantIds']` as its `jsonColumns` argument here since it's a JSON column (unlike the other `kunstenaars` inserts in this file, which only set `naam` and have no JSON columns to serialize).

- [ ] **Step 2: Run tests to verify the new/changed ones fail**

Run: `npx vitest run tests/app/api/bestelheaders.test.ts`
Expected: FAIL on the price-related tests (server still stores the client's `prijs` verbatim) and the `kunstwerk-not-found`/`prijs-onbekend` tests (route doesn't check either case yet).

- [ ] **Step 3: Implement the recompute in the route**

In `src/app/api/bestelheaders/route.ts`:
1. Add the import: `import { berekenBestellijnPrijs } from '@/lib/server/prijsmodule';`
2. Simplify `validateLine` — remove the `invalid-prijs` check (the client's `prijs` is no longer trusted, so there is nothing meaningful to validate about it):
```ts
function validateLine(line: LineInput): string | null {
  if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
    return 'invalid-quantity';
  }
  return null;
}
```
3. In `POST`, after the `checkOrderRight` loop and before the `bestelnr` counter logic, add a price-resolution pass that also validates each `kunstwerkId` exists:
```ts
    const resolvedLines: Array<LineInput & { resolvedPrijs: number | null }> = [];
    for (const line of lines) {
      const [kunstwerkRows] = await connection.query(
        'SELECT kunstenaarId, maatIds, prijsPerM2 FROM kunstwerken WHERE id = ?',
        [line.kunstwerkId]
      );
      const kunstwerkRow = (
        kunstwerkRows as Array<{ kunstenaarId: string | null; maatIds: string | null; prijsPerM2: string | null }>
      )[0];
      if (!kunstwerkRow) {
        await connection.rollback();
        return NextResponse.json({ error: 'kunstwerk-not-found' }, { status: 400 });
      }
      const resultaat = await berekenBestellijnPrijs(
        connection,
        {
          kunstenaarId: kunstwerkRow.kunstenaarId,
          maatIds: kunstwerkRow.maatIds ? JSON.parse(kunstwerkRow.maatIds) : [],
          prijsPerM2: kunstwerkRow.prijsPerM2 != null ? Number(kunstwerkRow.prijsPerM2) : null,
        },
        line
      );
      if (resultaat.status === 'onbekend') {
        await connection.rollback();
        return NextResponse.json({ error: 'prijs-onbekend' }, { status: 400 });
      }
      resolvedLines.push({ ...line, resolvedPrijs: resultaat.status === 'vast' ? resultaat.prijs : null });
    }
```
4. Change the `bestellines` insert loop to iterate `resolvedLines` instead of `lines`, and use `line.resolvedPrijs` instead of `line.prijs`:
```ts
    for (const line of resolvedLines) {
      await connection.query(
        'INSERT INTO bestellines (id, bestelheaderId, kunstwerkId, maatId, materiaalId, prijs, quantity, breedte, hoogte) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          randomUUID(),
          headerId,
          line.kunstwerkId,
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/app/api/bestelheaders.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

```bash
npx vitest run
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/bestelheaders/route.ts tests/app/api/bestelheaders.test.ts
git commit -m "fix: recompute bestelling prijzen server-side via the Prijsmodule instead of trusting the client"
```

---

### Task 11: Beheer nav + `PrijsmatrixSection` UI

**Files:**
- Modify: `src/components/beheer/BeheerNav.tsx`
- Modify: `src/components/beheer/BeheerShell.tsx`
- Create: `src/components/beheer/PrijsmatrixSection.tsx`
- Modify: `src/lib/logActiviteit.ts`
- Modify: `messages/nl.json`
- Create: `tests/components/beheer/PrijsmatrixSection.test.tsx`
- Modify: `tests/components/beheer/BeheerNav.test.tsx` (if it asserts the exact `ACTIVE_ITEMS` list/count props — check first)

**Interfaces:**
- Consumes: `GET`/`PUT /api/prijsmatrix` (Task 4).
- Produces: a new `'prijsmatrix'` `BeheerSection`, a nav entry with a badge showing the count of not-yet-priced combinations, and the `PrijsmatrixSection` grid component.

- [ ] **Step 1: Add the activiteitenlog type**

In `src/lib/logActiviteit.ts`, add `'prijsmatrix_gewijzigd',` to `ACTIVITEIT_TYPES` (anywhere in the array, e.g. right after `'prijsgroep_verwijderd',`).

- [ ] **Step 2: Add the `BeheerSection` and nav entry**

In `src/components/beheer/BeheerNav.tsx`:
1. Add `'prijsmatrix'` to the `BeheerSection` union (e.g. right after `'prijsgroepen'`).
2. Add `prijsmatrixCount: number;` to `BeheerNavProps` (after `prijsgroepenCount: number;`).
3. Add `{ id: 'prijsmatrix', labelKey: 'navPrijsmatrix' },` to `ACTIVE_ITEMS` (right after the `prijsgroepen` entry).
4. Add `prijsmatrixCount,` to the destructured function props, and `prijsmatrix: prijsmatrixCount,` to the `counts` map.

- [ ] **Step 3: Add the nl.json keys**

In `messages/nl.json`, add after `"navPrijsgroepen": "Prijsgroepen",` (line 291):
```json
    "navPrijsmatrix": "Prijsmatrix",
```
Add a new block of keys anywhere in the `beheer` namespace (e.g. right after the `kunstenaarsVerwijderBlocked` key, line 569):
```json
    "prijsmatrixLoadError": "Kon de prijsmatrix niet laden. Probeer de pagina te verversen.",
    "prijsmatrixActionError": "Er is iets misgegaan. Probeer het opnieuw.",
    "prijsmatrixTitle": "Prijs per maat en materiaal",
    "prijsmatrixHint": "Vul een prijs in voor elke combinatie. Een lege cel toont \"prijs op aanvraag\" in de webshop.",
```

- [ ] **Step 4: Wire the grid fetch + `PrijsmatrixSection` into `BeheerShell.tsx`**

In `src/components/beheer/BeheerShell.tsx`:
1. Add the type import: add `PrijsmatrixRegel` to the `materiaalTypes` import list, or define it locally — simplest is to define it inline in this file since it's only used here and in the new section:
```ts
interface PrijsmatrixRegel {
  maatId: string;
  materiaalId: string;
  prijs: number | null;
}
```
2. Add state and a fetch effect, mirroring the existing `activiteiten` pattern (place right after the `activiteitenLoadError` state declaration):
```ts
  const [prijsmatrix, setPrijsmatrix] = useState<PrijsmatrixRegel[] | null>(null);
  const [prijsmatrixLoadError, setPrijsmatrixLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadPrijsmatrix() {
      try {
        const response = await fetch('/api/prijsmatrix');
        if (!response.ok) throw new Error('load failed');
        const body = (await response.json()) as { prijzen: PrijsmatrixRegel[] };
        if (!cancelled) {
          setPrijsmatrix(body.prijzen);
          setPrijsmatrixLoadError(null);
        }
      } catch {
        if (!cancelled) {
          setPrijsmatrixLoadError(t('prijsmatrixLoadError'));
        }
      }
    }
    loadPrijsmatrix();
    return () => {
      cancelled = true;
    };
  }, [t]);

  function handlePrijsmatrixRegelUpdated(maatId: string, materiaalId: string, prijs: number | null) {
    setPrijsmatrix((current) =>
      (current ?? []).map((regel) =>
        regel.maatId === maatId && regel.materiaalId === materiaalId ? { ...regel, prijs } : regel
      )
    );
  }
```
3. Add `const prijsmatrixCount = (prijsmatrix ?? []).filter((regel) => regel.prijs == null).length;` next to the other count computations.
4. Pass `prijsmatrixCount={prijsmatrixCount}` into `<BeheerNav .../>`.
5. Add the import `import { PrijsmatrixSection } from './PrijsmatrixSection';` and a new branch in the section ternary, right after the `prijsgroepen` branch:
```tsx
        ) : activeSection === 'prijsmatrix' ? (
          <PrijsmatrixSection
            prijsmatrix={prijsmatrix}
            maten={maten.items}
            materialen={materialen.items}
            materiaalsoorten={materiaalsoorten.items}
            loadError={prijsmatrixLoadError}
            onRegelUpdated={handlePrijsmatrixRegelUpdated}
          />
```

- [ ] **Step 5: Write the failing component test**

```tsx
// tests/components/beheer/PrijsmatrixSection.test.tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { PrijsmatrixSection } from '@/components/beheer/PrijsmatrixSection';
import { AdminAuthProvider } from '@/lib/useAdminAuth';
import messages from '../../../messages/nl.json';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const MATEN = [{ id: 'maat-1', breedte: 40, hoogte: 60 }];
const MATERIAALSOORTEN = [{ id: 'soort-1', omschrijving: 'Acryl' }];
const MATERIALEN = [{ id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 3, omschrijving: 'Acryl 3mm' }];
const PRIJSMATRIX = [{ maatId: 'maat-1', materiaalId: 'mat-1', prijs: null }];

function renderSection(overrides = {}) {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <AdminAuthProvider>
        <PrijsmatrixSection
          prijsmatrix={PRIJSMATRIX}
          maten={MATEN}
          materialen={MATERIALEN}
          materiaalsoorten={MATERIAALSOORTEN}
          loadError={null}
          onRegelUpdated={vi.fn()}
          {...overrides}
        />
      </AdminAuthProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
});

describe('PrijsmatrixSection', () => {
  it('shows the load error instead of the grid when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.', prijsmatrix: null });
    expect(screen.getByTestId('prijsmatrix-error')).toHaveTextContent('Kon niet laden.');
  });

  it('renders one row per maat and one column per materiaal', () => {
    renderSection();
    expect(screen.getByTestId('prijsmatrix-cel-maat-1-mat-1')).toBeInTheDocument();
  });

  it('shows an existing prijs pre-filled in its cell', () => {
    renderSection({ prijsmatrix: [{ maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150 }] });
    expect(screen.getByTestId('prijsmatrix-cel-maat-1-mat-1')).toHaveValue(150);
  });

  it('saves a prijs on blur and calls onRegelUpdated', async () => {
    const onRegelUpdated = vi.fn();
    renderSection({ onRegelUpdated });
    fireEvent.change(screen.getByTestId('prijsmatrix-cel-maat-1-mat-1'), { target: { value: '175' } });
    fireEvent.blur(screen.getByTestId('prijsmatrix-cel-maat-1-mat-1'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/prijsmatrix', expect.objectContaining({ method: 'PUT' })));
    expect(onRegelUpdated).toHaveBeenCalledWith('maat-1', 'mat-1', 175);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run tests/components/beheer/PrijsmatrixSection.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `PrijsmatrixSection.tsx`**

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Maat, Materiaal, Materiaalsoort } from './materiaalTypes';

interface PrijsmatrixRegel {
  maatId: string;
  materiaalId: string;
  prijs: number | null;
}

interface PrijsmatrixSectionProps {
  prijsmatrix: PrijsmatrixRegel[] | null;
  maten: Maat[] | null;
  materialen: Materiaal[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  loadError: string | null;
  onRegelUpdated: (maatId: string, materiaalId: string, prijs: number | null) => void;
}

export function PrijsmatrixSection({
  prijsmatrix,
  maten,
  materialen,
  materiaalsoorten,
  loadError,
  onRegelUpdated,
}: PrijsmatrixSectionProps) {
  const t = useTranslations('beheer');
  const { user } = useAdminAuth();
  const [inputWaarden, setInputWaarden] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  const soortNaamById = useMemo(() => {
    const map = new Map<string, string>();
    (materiaalsoorten ?? []).forEach((soort) => map.set(soort.id, soort.omschrijving));
    return map;
  }, [materiaalsoorten]);

  if (loadError) {
    return (
      <p data-testid="prijsmatrix-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (prijsmatrix === null || maten === null || materialen === null) {
    return null;
  }

  function key(maatId: string, materiaalId: string) {
    return `${maatId}:${materiaalId}`;
  }

  function huidigeWaarde(maatId: string, materiaalId: string): string {
    const bewerkt = inputWaarden[key(maatId, materiaalId)];
    if (bewerkt !== undefined) return bewerkt;
    const regel = prijsmatrix!.find((r) => r.maatId === maatId && r.materiaalId === materiaalId);
    return regel?.prijs != null ? String(regel.prijs) : '';
  }

  async function handleBlur(maatId: string, materiaalId: string) {
    const raw = huidigeWaarde(maatId, materiaalId);
    const prijs = raw === '' ? null : Number(raw);
    try {
      const response = await fetch('/api/prijsmatrix', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ maatId, materiaalId, prijs }),
      });
      if (!response.ok) throw new Error('save failed');
      onRegelUpdated(maatId, materiaalId, prijs);
      const materiaalNaam = materialen!.find((m) => m.id === materiaalId)?.omschrijving ?? materiaalId;
      const maat = maten!.find((m) => m.id === maatId);
      void logActiviteit(
        'prijsmatrix_gewijzigd',
        actorFromMedewerker(user),
        maat ? `${maat.breedte}×${maat.hoogte} — ${materiaalNaam}` : materiaalNaam
      );
      setActionError(null);
    } catch {
      setActionError(t('prijsmatrixActionError'));
    }
  }

  return (
    <div data-testid="prijsmatrix-section">
      <p className="mb-3 text-xs uppercase tracking-wide text-white/60">{t('prijsmatrixTitle')}</p>
      <table className="border-collapse text-sm text-white/80">
        <thead>
          <tr>
            <th className="border border-white/10 px-2 py-1"></th>
            {materialen.map((materiaal) => (
              <th key={materiaal.id} className="border border-white/10 px-2 py-1 text-xs font-semibold">
                {`${materiaal.materiaaldikte}mm ${soortNaamById.get(materiaal.materiaalsoortId) ?? ''}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {maten.map((maat) => (
            <tr key={maat.id}>
              <td className="border border-white/10 px-2 py-1 text-xs whitespace-nowrap">
                {`${maat.breedte}×${maat.hoogte}`}
              </td>
              {materialen.map((materiaal) => (
                <td key={materiaal.id} className="border border-white/10 px-2 py-1">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-white/50">€</span>
                    <input
                      type="number"
                      value={huidigeWaarde(maat.id, materiaal.id)}
                      onChange={(event) =>
                        setInputWaarden((current) => ({
                          ...current,
                          [key(maat.id, materiaal.id)]: event.target.value,
                        }))
                      }
                      onBlur={() => handleBlur(maat.id, materiaal.id)}
                      data-testid={`prijsmatrix-cel-${maat.id}-${materiaal.id}`}
                      className="w-20 rounded-sm border border-transparent bg-black/40 px-2 py-1 text-sm text-white"
                    />
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs normal-case tracking-normal text-white/50">{t('prijsmatrixHint')}</p>
      {actionError && (
        <p data-testid="prijsmatrix-action-error" className="mt-2 text-xs text-red-400">
          {actionError}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run tests/components/beheer/PrijsmatrixSection.test.tsx`
Expected: PASS.

- [ ] **Step 9: Check and update `BeheerNav.test.tsx`/`BeheerShell.test.tsx` if they enumerate nav items or count props**

```bash
npx vitest run tests/components/beheer/BeheerNav.test.tsx tests/components/beheer/BeheerShell.test.tsx
```
If either fails because it asserts an exact list of `beheer-nav-*` testids or an exact set of `BeheerNavProps`, add the missing `prijsmatrix`/`prijsmatrixCount` entry to that assertion (mirroring how the existing `prijsgroepen` entry is asserted there).

- [ ] **Step 10: Commit**

```bash
git add src/components/beheer/BeheerNav.tsx src/components/beheer/BeheerShell.tsx src/components/beheer/PrijsmatrixSection.tsx src/lib/logActiviteit.ts messages/nl.json tests/components/beheer/PrijsmatrixSection.test.tsx tests/components/beheer/BeheerNav.test.tsx tests/components/beheer/BeheerShell.test.tsx
git commit -m "feat: add Prijsmatrix beheer section"
```

---

### Task 12: `KunstenaarsSection` — prijsopslag field

**Files:**
- Modify: `src/components/beheer/KunstenaarsSection.tsx`
- Modify: `messages/nl.json`
- Modify: `tests/components/beheer/KunstenaarsSection.test.tsx`

**Interfaces:**
- Consumes: `GET`/`PUT /api/kunstenaarAfspraken/[id]` (Task 5, now returning/accepting `prijsopslag`).

- [ ] **Step 1: Add the nl.json key**

In `messages/nl.json`, add after `"kunstenaarsLabelPrijsafspraken": "Prijsafspraken (intern)",` (line 558):
```json
    "kunstenaarsLabelPrijsopslag": "Prijsopslag (€, wordt bij de matrixprijs opgeteld)",
```

- [ ] **Step 2: Write the failing test**

Add to `tests/components/beheer/KunstenaarsSection.test.tsx` (check the existing "loads and shows prijsafspraken" / "saves prijsafspraken" tests for the exact fetch-mock setup this file already uses, and mirror it):
```ts
  it('loads and pre-fills the existing prijsopslag when opening a kunstenaar for editing', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/kunstenaarAfspraken/')) {
        return { ok: true, json: async () => ({ prijsafspraken: '', prijsopslag: 45 }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    renderSection(); // use this file's existing render helper
    fireEvent.click(screen.getByText('Anna')); // or whatever this file's existing "open a row" step is
    expect(await screen.findByTestId('kunstenaar-modal-prijsopslag')).toHaveValue(45);
  });

  it('saves prijsopslag together with prijsafspraken', async () => {
    renderSection();
    fireEvent.click(screen.getByText('Anna'));
    await screen.findByTestId('kunstenaar-modal-prijsopslag');
    fireEvent.change(screen.getByTestId('kunstenaar-modal-prijsopslag'), { target: { value: '60' } });
    fireEvent.click(screen.getByTestId('kunstenaar-modal-opslaan'));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/kunstenaarAfspraken/'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ prijsafspraken: '', prijsopslag: 60 }),
        })
      )
    );
  });
```
(adapt the exact fixture name/render-helper/click-target to whatever this test file already uses for "Anna" or its equivalent existing kunstenaar fixture and open-for-edit step — check the file's existing `'stores and retrieves prijsafspraken'`-style test just above for the precise pattern before writing this).

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/components/beheer/KunstenaarsSection.test.tsx`
Expected: FAIL — no `kunstenaar-modal-prijsopslag` testid exists yet.

- [ ] **Step 4: Implement the field**

In `src/components/beheer/KunstenaarsSection.tsx`:
1. Add `prijsopslag: 0 as number,` to `LEGE_FORM` (after `prijsafspraken: '',`).
2. Add `const [prijsopslag, setPrijsopslag] = useState(LEGE_FORM.prijsopslag);` (after the `prijsafspraken` state line).
3. In `resetForm()`, add `setPrijsopslag(LEGE_FORM.prijsopslag);`.
4. In `openEdit`, change the afspraken-fetch block from:
```ts
      const body = (await response.json()) as { prijsafspraken: string | null };
      if (geopendeKunstenaarIdRef.current !== kunstenaar.id) return;
      setPrijsafspraken(body.prijsafspraken ?? '');
      setPrijsafsprakenLaden(false);
```
to:
```ts
      const body = (await response.json()) as { prijsafspraken: string | null; prijsopslag: number };
      if (geopendeKunstenaarIdRef.current !== kunstenaar.id) return;
      setPrijsafspraken(body.prijsafspraken ?? '');
      setPrijsopslag(body.prijsopslag ?? 0);
      setPrijsafsprakenLaden(false);
```
Also change `setPrijsafspraken(LEGE_FORM.prijsafspraken);` (in `openEdit`, before the fetch) to also reset `setPrijsopslag(LEGE_FORM.prijsopslag);` on that same line.
5. In `handleSave`, both `fetch(...kunstenaarAfspraken/${kunstenaarId}..., { body: JSON.stringify({ prijsafspraken }) })` calls (the add-branch and the edit-branch) become `body: JSON.stringify({ prijsafspraken, prijsopslag })`.
6. Add a new field in the JSX, right after the `kunstenaarsLabelPrijsafspraken` `<textarea>` block (after line 447):
```tsx
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstenaarsLabelPrijsopslag')}
            <input
              type="number"
              value={prijsopslag}
              onChange={(event) => setPrijsopslag(Number(event.target.value))}
              data-testid="kunstenaar-modal-prijsopslag"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/components/beheer/KunstenaarsSection.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the full suite once more, then typecheck**

```bash
npx vitest run
npm run lint
```

- [ ] **Step 7: Commit**

```bash
git add src/components/beheer/KunstenaarsSection.tsx messages/nl.json tests/components/beheer/KunstenaarsSection.test.tsx
git commit -m "feat: add prijsopslag field to the Kunstenaars beheer section"
```

---

## After all tasks

Manually verify in a browser against staging (`npm run dev` pointed at `.env.local`'s staging DB, per project convention):
1. Beheer → Prijsmatrix: fill in a few cells, confirm they persist on reload.
2. Beheer → Kunstenaars: set a prijsopslag on a kunstenaar with kunstwerken.
3. Beheer → Kunstwerken: open a kunstwerk by that kunstenaar with a priced maat/materiaal — confirm the read-only preview shows matrix + opslag.
4. Storefront collectie page: open the same kunstwerk, confirm the shown price matches the preview, and that an unpriced combination shows "Prijs op aanvraag".
5. Place a real test order and confirm the stored `bestellines.prijs` matches, even if you tamper with the network request in devtools to submit a different `prijs`.
6. Try deleting a maat/materiaal that has an old test order referencing it — confirm it's blocked.

Per the project's standing rule, do not deploy to production before this has been deployed to and verified on staging.
