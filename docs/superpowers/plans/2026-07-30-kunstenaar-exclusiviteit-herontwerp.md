# Kunstenaar Exclusiviteit Herontwerp Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 30-07-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current `Kunstenaar.verkooprecht` + `Kunstenaar.klantId` + `Kunstenaar.exclusiefVoorKlantId` trio with a single `Kunstenaar.exclusieveKlantIds` list (max 2 klanten) as the sole runtime source of ordering rights, and move the "this klant account belongs to this kunstenaar" link to a new `Klant.kunstenaarId` field edited from the Klant side.

**Architecture:** `Kunstenaar.exclusieveKlantIds: string[]` (JSON column, max 2 entries, edited via checkboxes in `KunstenaarsSection`) is the only thing `resolveOrderRight`/`checkOrderRight` consult: empty = open to everyone, non-empty = only the listed klant-ids may order (no automatic "artist can always order their own work" bypass anymore — if the artist isn't in the list, they can't order their own art). `Klant.kunstenaarId: string | null` (new scalar column, edited via a `Combobox` in `KlantModal`) is purely administrative metadata: it lets staff identify which klant *is* the kunstenaar, which the `KunstenaarsSection` UI uses only to validate the 2-klant case ("if 2 are selected, one must be this kunstenaar's own klant"). `KlantModal`'s existing editable "Exclusief recht op kunstenaars" checkbox list becomes a read-only derived display (computed from `kunstenaars` data, since `Kunstenaar.exclusieveKlantIds` is now the single leading source — no more denormalized back-pointer writes in both directions).

**Tech Stack:** Next.js 14 (App Router, server mode), TypeScript, raw `mysql2` (no ORM), `next-intl`, Vitest + `@testing-library/react`. Tests run against the real shared staging MySQL database.

## Global Constraints

- The `beheer` translation namespace exists **only** in `messages/nl.json`. Customer-facing namespaces (`collectionsPage`, `cart`, `kunstwerkSpecCard`, etc.) exist in all four locale files (`nl`, `en`, `de`, `fr`) — any customer-facing key removed/added must be changed in all four.
- Test cleanup must never delete data the test didn't create itself — scope every `DELETE`/cleanup to exactly the id(s)/email(s) captured when the test created the row. Never a table-wide `DELETE`/`TRUNCATE`.
- There is no migration runner in this repo — schema changes are applied by hand against the shared staging MySQL database (same DB used by `npm run dev` and `npm test` via `.env.local`), then `db/schema.sql` is updated to match as the source of truth.
- **Confirmed with the client:** existing `verkooprecht`/`klantId`/`exclusiefVoorKlantId`/`exclusieveKunstenaarIds` values on staging are **not** migrated forward — the columns are dropped as-is and staff re-enter the new links manually through the beheer UI after this ships.
- Business rule for `Kunstenaar.exclusieveKlantIds` (enforced in the beheer UI only, not a DB constraint): 0 entries = open to everyone; 1 entry = only that klant may order; 2 entries = both may order, and **one of the two must be** the klant whose `kunstenaarId` points back to this kunstenaar (i.e., the kunstenaar's own linked klant account) — otherwise saving is blocked with an inline error.
- `resolveOrderRight` (client-side UX hint) and `checkOrderRight` in `POST /api/bestelheaders` (the real server-side enforcement) must stay in lock-step, same as today.
- Every component test wraps render in `<NextIntlClientProvider locale="nl" messages={messages}>` importing `messages/nl.json`. `data-testid` naming follows existing conventions (`<entity>-modal-<field>`, `<entity>-modal-<field>-option-<id>` for `Combobox`).

---

### Task 1: Schema migration — `klanten.kunstenaarId` / `kunstenaars.exclusieveKlantIds`

**Files:**
- Modify: `db/schema.sql`
- Create (temporary, delete after use): a one-off migration script run via `node`

**Interfaces:**
- Produces: `klanten.kunstenaarId CHAR(36) NULL` column; `kunstenaars.exclusieveKlantIds JSON NULL` column. `klanten.exclusieveKunstenaarIds`, `kunstenaars.verkooprecht`, `kunstenaars.klantId`, `kunstenaars.exclusiefVoorKlantId` columns are dropped. Every later task assumes these columns already exist/are gone on the shared staging DB.

- [ ] **Step 1: Write the migration script**

Create `scripts/migrate-2026-07-30-kunstenaar-exclusiviteit.mjs` (temporary — deleted in Step 4):

```js
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getPool } from '../src/lib/server/db.ts';

async function main() {
  const pool = getPool();
  await pool.query('ALTER TABLE klanten ADD COLUMN kunstenaarId CHAR(36) NULL AFTER prijsgroepId');
  await pool.query('ALTER TABLE klanten DROP COLUMN exclusieveKunstenaarIds');
  await pool.query('ALTER TABLE kunstenaars ADD COLUMN exclusieveKlantIds JSON NULL');
  await pool.query('ALTER TABLE kunstenaars DROP COLUMN verkooprecht');
  await pool.query('ALTER TABLE kunstenaars DROP COLUMN klantId');
  await pool.query('ALTER TABLE kunstenaars DROP COLUMN exclusiefVoorKlantId');
  console.log('migration done');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

This repo's `.mjs`/TS interop for a standalone script is inconsistent with how `db.ts` is normally imported (only ever from within Next.js API routes). Run it with `npx tsx scripts/migrate-2026-07-30-kunstenaar-exclusiviteit.mjs` (tsx is not currently a devDependency — if `npx tsx` fails to resolve, run `npm install --no-save tsx` first, since this script is deleted in Step 4 and never becomes a tracked dependency).

- [ ] **Step 2: Run the migration against the shared staging database**

Run: `npx tsx scripts/migrate-2026-07-30-kunstenaar-exclusiviteit.mjs`
Expected: prints `migration done` with no errors. This mutates the real shared staging MySQL database that `npm run dev` and `npm test` both connect to via `.env.local` — do not run this more than once.

- [ ] **Step 3: Verify the resulting columns**

Run (PowerShell, using the same DB credentials `.env.local` provides — substitute if your local mysql client needs explicit `-h`/`-u`/`-p`):

```bash
npx tsx -e "require('dotenv').config({path:'.env.local'}); import('./src/lib/server/db.ts').then(async ({getPool}) => { const [rows] = await getPool().query(\"SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('klanten','kunstenaars') ORDER BY TABLE_NAME, ORDINAL_POSITION\"); console.log(rows); process.exit(0); })"
```

Expected: `klanten` rows include `kunstenaarId` and do **not** include `exclusieveKunstenaarIds`; `kunstenaars` rows include `exclusieveKlantIds` and do **not** include `verkooprecht`, `klantId`, or `exclusiefVoorKlantId`.

- [ ] **Step 4: Delete the temporary migration script**

```bash
rm scripts/migrate-2026-07-30-kunstenaar-exclusiviteit.mjs
rmdir scripts 2>/dev/null || true
```

- [ ] **Step 5: Update `db/schema.sql` to match**

In the `klanten` table definition, change:
```sql
  status VARCHAR(50) NOT NULL DEFAULT 'Beoordelen',
  prijsgroepId CHAR(36),
  exclusieveKunstenaarIds JSON,
  minimaleAfname INT,
```
to:
```sql
  status VARCHAR(50) NOT NULL DEFAULT 'Beoordelen',
  prijsgroepId CHAR(36),
  kunstenaarId CHAR(36),
  minimaleAfname INT,
```

In the `kunstenaars` table definition, change:
```sql
CREATE TABLE kunstenaars (
  id CHAR(36) PRIMARY KEY,
  naam VARCHAR(255) NOT NULL,
  foto VARCHAR(500),
  omschrijvingNl TEXT,
  omschrijvingFr TEXT,
  omschrijvingDe TEXT,
  omschrijvingEn TEXT,
  verkooprecht VARCHAR(20) NOT NULL DEFAULT 'open',
  klantId CHAR(36),
  exclusiefVoorKlantId CHAR(36)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
to:
```sql
CREATE TABLE kunstenaars (
  id CHAR(36) PRIMARY KEY,
  naam VARCHAR(255) NOT NULL,
  foto VARCHAR(500),
  omschrijvingNl TEXT,
  omschrijvingFr TEXT,
  omschrijvingDe TEXT,
  omschrijvingEn TEXT,
  exclusieveKlantIds JSON
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 6: Commit**

```bash
git add db/schema.sql
git commit -m "chore: migrate klanten/kunstenaars schema for exclusiviteit herontwerp"
```

---

### Task 2: Core types, `resolveOrderRight`, and server-side order-right enforcement

**Files:**
- Modify: `src/components/beheer/kunstenaarTypes.ts`
- Modify: `src/components/beheer/KlantenSection.tsx:10-31` (the `Klant` interface)
- Modify: `src/lib/resolveOrderRight.ts`
- Test: `tests/lib/resolveOrderRight.test.ts`
- Modify: `src/app/api/bestelheaders/route.ts:31-59` (`checkOrderRight`)
- Test: `tests/app/api/bestelheaders.test.ts:253-305`

**Interfaces:**
- Produces: `Kunstenaar { id, naam, foto, omschrijvingNl, omschrijvingFr, omschrijvingDe, omschrijvingEn, exclusieveKlantIds: string[] }` (drops `verkooprecht`/`klantId`/`exclusiefVoorKlantId`). `Klant` gains `kunstenaarId: string | null`, drops `exclusieveKunstenaarIds: string[]`. `resolveOrderRight(kunstenaarId, kunstenaars, userUid): OrderRight` keeps its existing 3-argument signature (no new param needed — see rationale below) but `OrderBlockedReason` drops `'artistOnly'`, leaving `'exclusive' | 'unavailable' | null`.
- Consumes by later tasks: `resolveOrderRight` is called unchanged from `src/components/ProductModal.tsx:130` and `src/components/CartPanel.tsx:68` (Task 8 only touches the blocked-message branch, not the call site).

- [ ] **Step 1: Update `Kunstenaar` and `Klant` types**

Replace the entire contents of `src/components/beheer/kunstenaarTypes.ts`:

```ts
export interface Kunstenaar {
  id: string;
  naam: string;
  foto: string | null;
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;
  // Let op: `prijsafspraken` staat bewust NIET in deze publiek leesbare tabel,
  // maar in de medewerker-only tabel `kunstenaarAfspraken` (zelfde id).
  // Max 2 entries: leeg = open voor iedereen; 2 entries vereist dat één ervan de
  // klant is wiens Klant.kunstenaarId naar deze kunstenaar wijst (afgedwongen in
  // KunstenaarsSection, niet in de database).
  exclusieveKlantIds: string[];
}
```

In `src/components/beheer/KlantenSection.tsx`, change:
```ts
  status: 'Beoordelen' | 'Goedgekeurd' | 'Afgewezen';
  prijsgroepId: string | null;
  exclusieveKunstenaarIds: string[];
  minimaleAfname?: number | null;
```
to:
```ts
  status: 'Beoordelen' | 'Goedgekeurd' | 'Afgewezen';
  prijsgroepId: string | null;
  kunstenaarId: string | null;
  minimaleAfname?: number | null;
```

- [ ] **Step 2: Rewrite `resolveOrderRight.ts`**

Replace the entire contents of `src/lib/resolveOrderRight.ts`:

```ts
import type { Kunstenaar } from '@/components/beheer/kunstenaarTypes';

export type OrderBlockedReason = 'exclusive' | 'unavailable' | null;

export interface OrderRight {
  canOrder: boolean;
  blockedReason: OrderBlockedReason;
}

/**
 * Bepaalt of `userUid` een kunstwerk van deze kunstenaar mag bestellen.
 *
 * Spiegelt bewust `checkOrderRight` in `POST /api/bestelheaders` — dát is de enige echte
 * handhaving, deze client-side versie is puur een UX-hint. Waar de servercheck faalt
 * (een dangling `kunstenaarId` is daar een afwijzing), faalt deze helper óók: een nog niet
 * geladen collectie of een dangling `kunstenaarId` levert `blockedReason: 'unavailable'`
 * op in plaats van stilzwijgend "wel bestelbaar".
 *
 * `exclusieveKlantIds` is de enige bron van waarheid: een lege lijst is open voor
 * iedereen, een gevulde lijst is alleen voor de klanten daarin — ook als de kunstenaar
 * zelf een gekoppeld klantaccount heeft dat er niet in staat. Er is bewust géén
 * automatische "kunstenaar mag altijd eigen werk bestellen"-uitzondering meer.
 */
export function resolveOrderRight(
  kunstenaarId: string | null,
  kunstenaars: Kunstenaar[] | null,
  userUid: string | undefined
): OrderRight {
  // Bewust losse `== null`: kunstwerk-rijen van vóór deze feature hebben helemaal geen
  // `kunstenaarId`-kolom, en useApiCollection geeft de ruwe API-respons door, dus die
  // lezen als `undefined`. Een lege string blijft wél dichtklappen.
  const dataReady = kunstenaarId == null || kunstenaars !== null;
  const kunstenaar =
    kunstenaarId && kunstenaars ? kunstenaars.find((item) => item.id === kunstenaarId) ?? null : null;
  const missing = kunstenaarId != null && kunstenaars !== null && kunstenaar === null;
  const exclusieveKlantIds = kunstenaar?.exclusieveKlantIds ?? [];
  const isRestricted = exclusieveKlantIds.length > 0;
  const isAllowed = userUid != null && exclusieveKlantIds.includes(userUid);
  const canOrder = dataReady && !missing && (!kunstenaar || !isRestricted || isAllowed);
  const blockedReason: OrderBlockedReason = canOrder ? null : !dataReady || missing ? 'unavailable' : 'exclusive';
  return { canOrder, blockedReason };
}
```

- [ ] **Step 3: Rewrite `tests/lib/resolveOrderRight.test.ts`**

Replace the entire file:

```ts
import { describe, expect, it } from 'vitest';
import { resolveOrderRight } from '@/lib/resolveOrderRight';
import type { Kunstenaar } from '@/components/beheer/kunstenaarTypes';

function kunstenaar(overrides: Partial<Kunstenaar> = {}): Kunstenaar {
  return {
    id: 'ka-1',
    naam: 'Sabrina Glasser',
    foto: null,
    omschrijvingNl: '',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    exclusieveKlantIds: [],
    ...overrides,
  };
}

describe('resolveOrderRight', () => {
  it('always allows ordering when the kunstwerk has no kunstenaar, even before the collection loaded', () => {
    expect(resolveOrderRight(null, null, 'uid-1')).toEqual({ canOrder: true, blockedReason: null });
    expect(resolveOrderRight(null, [], 'uid-1')).toEqual({ canOrder: true, blockedReason: null });
  });

  it('treats a kunstwerk document without a kunstenaarId field at all as having no kunstenaar', () => {
    expect(resolveOrderRight(undefined as unknown as null, [kunstenaar()], 'uid-1')).toEqual({
      canOrder: true,
      blockedReason: null,
    });
    expect(resolveOrderRight(undefined as unknown as null, null, 'uid-1')).toEqual({
      canOrder: true,
      blockedReason: null,
    });
  });

  it('still fails closed for an empty-string kunstenaarId', () => {
    expect(resolveOrderRight('', [kunstenaar()], 'uid-1')).toEqual({
      canOrder: false,
      blockedReason: 'unavailable',
    });
  });

  it('treats a missing exclusieveKlantIds field defensively as open', () => {
    expect(
      resolveOrderRight('ka-1', [kunstenaar({ exclusieveKlantIds: undefined as unknown as string[] })], 'uid-1')
    ).toEqual({ canOrder: true, blockedReason: null });
  });

  it('fails closed while the kunstenaars collection has not loaded yet', () => {
    expect(resolveOrderRight('ka-1', null, 'uid-1')).toEqual({
      canOrder: false,
      blockedReason: 'unavailable',
    });
  });

  it('fails closed for a dangling kunstenaarId that is not in the loaded collection', () => {
    expect(resolveOrderRight('ka-weg', [kunstenaar()], 'uid-1')).toEqual({
      canOrder: false,
      blockedReason: 'unavailable',
    });
  });

  it('allows ordering a kunstenaar with an empty exclusieveKlantIds list', () => {
    expect(resolveOrderRight('ka-1', [kunstenaar()], 'uid-1')).toEqual({
      canOrder: true,
      blockedReason: null,
    });
  });

  it('blocks a kunstenaar exclusive to one other klant', () => {
    expect(
      resolveOrderRight('ka-1', [kunstenaar({ exclusieveKlantIds: ['ander-uid'] })], 'uid-1')
    ).toEqual({ canOrder: false, blockedReason: 'exclusive' });
    // Also blocked for an anonymous visitor with no uid at all.
    expect(
      resolveOrderRight('ka-1', [kunstenaar({ exclusieveKlantIds: ['ander-uid'] })], undefined)
    ).toEqual({ canOrder: false, blockedReason: 'exclusive' });
  });

  it('allows the single klant listed in exclusieveKlantIds', () => {
    expect(resolveOrderRight('ka-1', [kunstenaar({ exclusieveKlantIds: ['uid-1'] })], 'uid-1')).toEqual({
      canOrder: true,
      blockedReason: null,
    });
  });

  it('allows both klanten when exclusieveKlantIds has 2 entries, blocks a third klant', () => {
    const withTwo = kunstenaar({ exclusieveKlantIds: ['uid-1', 'uid-2'] });
    expect(resolveOrderRight('ka-1', [withTwo], 'uid-1')).toEqual({ canOrder: true, blockedReason: null });
    expect(resolveOrderRight('ka-1', [withTwo], 'uid-2')).toEqual({ canOrder: true, blockedReason: null });
    expect(resolveOrderRight('ka-1', [withTwo], 'uid-3')).toEqual({ canOrder: false, blockedReason: 'exclusive' });
  });

  it('blocks the kunstenaar\'s own klant from ordering when exclusieveKlantIds names only someone else', () => {
    // No automatic "artist can always order their own work" bypass: if the artist's
    // klant-id is not in the list, they are blocked just like any other klant.
    expect(
      resolveOrderRight('ka-1', [kunstenaar({ exclusieveKlantIds: ['ander-uid'] })], 'kunstenaar-uid')
    ).toEqual({ canOrder: false, blockedReason: 'exclusive' });
  });
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/resolveOrderRight.test.ts`
Expected: PASS (all 10 tests).

- [ ] **Step 5: Rewrite `checkOrderRight` in `src/app/api/bestelheaders/route.ts`**

Replace lines 29-59 (the comment and `checkOrderRight` function):

```ts
// Mirrors src/lib/resolveOrderRight.ts, which is now a client-side UI hint only —
// this is the real enforcement, since there is no rules-based enforcement layer anymore.
async function checkOrderRight(
  connection: PoolConnection,
  kunstwerkId: string,
  klantId: string
): Promise<boolean> {
  const [kunstwerkRows] = await connection.query(
    'SELECT kunstenaarId FROM kunstwerken WHERE id = ?',
    [kunstwerkId]
  );
  const kunstenaarId = (kunstwerkRows as Array<{ kunstenaarId: string | null }>)[0]?.kunstenaarId;
  if (!kunstenaarId) return true;

  const [kunstenaarRows] = await connection.query(
    'SELECT exclusieveKlantIds FROM kunstenaars WHERE id = ?',
    [kunstenaarId]
  );
  const kunstenaar = (kunstenaarRows as Array<{ exclusieveKlantIds: string | null }>)[0];
  if (!kunstenaar) return false;

  const exclusieveKlantIds: string[] =
    typeof kunstenaar.exclusieveKlantIds === 'string'
      ? JSON.parse(kunstenaar.exclusieveKlantIds)
      : kunstenaar.exclusieveKlantIds ?? [];
  if (exclusieveKlantIds.length === 0) return true;
  return exclusieveKlantIds.includes(klantId);
}
```

- [ ] **Step 6: Update the integration tests in `tests/app/api/bestelheaders.test.ts`**

Replace the two tests at lines 253-305 (`'rejects ordering an artwork exclusively reserved for a different klant'` and `'rejects ordering an artist-only artwork from a klant who is not that artist'`):

```ts
  it('rejects ordering an artwork exclusively reserved for a different klant, allows the listed klant', async () => {
    const klantA = await klant('g@example.com');
    const klantB = await klant('h@example.com');
    const kunstenaar = await insertRow<{ id: string }>(
      'kunstenaars',
      { naam: 'Exclusieve Artiest', exclusieveKlantIds: [klantB.id] } as never,
      ['exclusieveKlantIds']
    );
    createdKunstenaarIds.push(kunstenaar.id);
    const kunstwerk = await insertRow<{ id: string }>('kunstwerken', {
      naam: 'Werk',
      kunstenaarId: kunstenaar.id,
    } as never);
    createdKunstwerkIds.push(kunstwerk.id);

    const response = await createHeader(
      postRequest(
        { lines: [{ kunstwerkId: kunstwerk.id, maatId: 'maat-1', materiaalId: 'mat-1', prijs: 100, quantity: 1 }] },
        klantA.cookie
      )
    );
    expect(response.status).toBe(403);

    const allowedForB = await createHeader(
      postRequest(
        { lines: [{ kunstwerkId: kunstwerk.id, maatId: 'maat-1', materiaalId: 'mat-1', prijs: 100, quantity: 1 }] },
        klantB.cookie
      )
    );
    expect(allowedForB.status).toBe(201);
  });

  it('rejects ordering an artwork exclusive to 2 klanten from a third klant, allows both listed klanten', async () => {
    const klantA = await klant('exclusief-a@example.com');
    const klantB = await klant('exclusief-b@example.com');
    const klantC = await klant('exclusief-c@example.com');
    const kunstenaar = await insertRow<{ id: string }>(
      'kunstenaars',
      { naam: 'Twee-klanten Artiest', exclusieveKlantIds: [klantA.id, klantB.id] } as never,
      ['exclusieveKlantIds']
    );
    createdKunstenaarIds.push(kunstenaar.id);
    const kunstwerk = await insertRow<{ id: string }>('kunstwerken', {
      naam: 'Werk 2',
      kunstenaarId: kunstenaar.id,
    } as never);
    createdKunstwerkIds.push(kunstwerk.id);

    const line = { kunstwerkId: kunstwerk.id, maatId: 'maat-1', materiaalId: 'mat-1', prijs: 100, quantity: 1 };
    expect((await createHeader(postRequest({ lines: [line] }, klantA.cookie))).status).toBe(201);
    expect((await createHeader(postRequest({ lines: [line] }, klantB.cookie))).status).toBe(201);
    expect((await createHeader(postRequest({ lines: [line] }, klantC.cookie))).status).toBe(403);
  });
});
```

- [ ] **Step 7: Run the integration test**

Run: `npx vitest run tests/app/api/bestelheaders.test.ts`
Expected: PASS. (This hits the real staging database — confirm `.env.local` is configured before running.)

- [ ] **Step 8: Commit**

```bash
git add src/components/beheer/kunstenaarTypes.ts src/components/beheer/KlantenSection.tsx src/lib/resolveOrderRight.ts tests/lib/resolveOrderRight.test.ts src/app/api/bestelheaders/route.ts tests/app/api/bestelheaders.test.ts
git commit -m "feat: replace verkooprecht/klantId/exclusiefVoorKlantId with exclusieveKlantIds"
```

---

### Task 3: `kunstenaars` and `klanten` API routes — JSON-column wiring and field rename

**Files:**
- Modify: `src/app/api/kunstenaars/route.ts`
- Modify: `src/app/api/kunstenaars/[id]/route.ts`
- Modify: `src/app/api/klanten/route.ts`
- Modify: `src/app/api/klanten/[id]/route.ts`
- Modify: `src/app/api/klanten/me/route.ts`
- Modify: `src/lib/server/klantFields.ts`
- Modify: `src/lib/useCustomerAuth.tsx`
- Test: `tests/app/api/kunstenaars.test.ts`

**Interfaces:**
- Consumes: `Kunstenaar`/`Klant` types from Task 2.
- Produces: `listRows`/`getRow`/`insertRow`/`updateRow` calls for the `kunstenaars` table now pass `['exclusieveKlantIds']` as their `jsonColumns` argument (per `src/lib/server/crud.ts`, unchanged). `klanten` routes drop `KLANTEN_JSON_COLUMNS` entirely (no JSON columns left on that table).

- [ ] **Step 1: Write the failing test changes in `tests/app/api/kunstenaars.test.ts`**

Change every `insertRow<{ id: string }>('kunstenaars', { naam: 'X', verkooprecht: 'open' } as never)` call (lines 44-47, 83-86) to use the new field, and change lines 56-57, 65-67 (`createKunstenaar` calls):

```ts
  it('lists kunstenaars publicly, without ever exposing prijsafspraken', async () => {
    const kunstenaar = await insertRow<{ id: string }>(
      'kunstenaars',
      { naam: 'Anna', exclusieveKlantIds: [] } as never,
      ['exclusieveKlantIds']
    );
    createdKunstenaarIds.push(kunstenaar.id);
    const response = await listKunstenaars(req('GET'));
    const body = await response.json();
    const found = body.find((row: { id: string }) => row.id === kunstenaar.id);
    expect(found.naam).toBe('Anna');
    expect(found.prijsafspraken).toBeUndefined();
  });

  it('rejects creating a kunstenaar without a medewerker session', async () => {
    const response = await createKunstenaar(req('POST', { naam: 'Bram', exclusieveKlantIds: [] }));
    expect(response.status).toBe(401);
  });

  it('allows creating, updating and deleting a kunstenaar with a medewerker session', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;

    const createResponse = await createKunstenaar(
      req('POST', { naam: 'Chris', exclusieveKlantIds: [] }, cookie)
    );
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();

    await patchKunstenaar(req('PATCH', { naam: 'Christiaan' }, cookie), {
      params: { id: created.id },
    });
    const getResponse = await getKunstenaar(req('GET'), { params: { id: created.id } });
    expect((await getResponse.json()).naam).toBe('Christiaan');

    await deleteKunstenaar(req('DELETE', undefined, cookie), { params: { id: created.id } });
    const afterDelete = await getKunstenaar(req('GET'), { params: { id: created.id } });
    expect(afterDelete.status).toBe(404);
  });

  it('stores and retrieves prijsafspraken only for staff, keyed by the kunstenaar id', async () => {
    const kunstenaar = await insertRow<{ id: string }>(
      'kunstenaars',
      { naam: 'Dana', exclusieveKlantIds: [] } as never,
      ['exclusieveKlantIds']
    );
    createdKunstenaarIds.push(kunstenaar.id);
```
(leave the rest of that test unchanged)

Also add a new test proving the JSON round-trip works end-to-end, right after `'allows creating, updating and deleting a kunstenaar with a medewerker session'`:

```ts
  it('round-trips exclusieveKlantIds as a JSON array, not a string', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;
    const created = await createKunstenaar(
      req('POST', { naam: 'Eva', exclusieveKlantIds: ['klant-a', 'klant-b'] }, cookie)
    );
    const body = await created.json();
    createdKunstenaarIds.push(body.id);

    const getResponse = await getKunstenaar(req('GET'), { params: { id: body.id } });
    expect((await getResponse.json()).exclusieveKlantIds).toEqual(['klant-a', 'klant-b']);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/app/api/kunstenaars.test.ts`
Expected: FAIL — the new round-trip test gets back a JSON string instead of an array (routes don't pass `jsonColumns` yet), and the `verkooprecht`-free inserts hit the schema fine but the round-trip assertion is what actually fails.

- [ ] **Step 3: Add JSON-column handling to the `kunstenaars` routes**

In `src/app/api/kunstenaars/route.ts`, change:
```ts
import { NextResponse } from 'next/server';
import { listRows, insertRow } from '@/lib/server/crud';
import { requireMedewerker } from '@/lib/server/requireAuth';

export async function GET() {
  const rows = await listRows('kunstenaars');
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await request.json();
    const created = await insertRow('kunstenaars', data);
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}
```
to:
```ts
import { NextResponse } from 'next/server';
import { listRows, insertRow } from '@/lib/server/crud';
import { requireMedewerker } from '@/lib/server/requireAuth';

const KUNSTENAARS_JSON_COLUMNS = ['exclusieveKlantIds'];

export async function GET() {
  const rows = await listRows('kunstenaars', KUNSTENAARS_JSON_COLUMNS);
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await request.json();
    const created = await insertRow('kunstenaars', data, KUNSTENAARS_JSON_COLUMNS);
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}
```

In `src/app/api/kunstenaars/[id]/route.ts`, change:
```ts
import { NextResponse } from 'next/server';
import { getRow, updateRow, deleteRow } from '@/lib/server/crud';
import { requireMedewerker } from '@/lib/server/requireAuth';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const row = await getRow('kunstenaars', params.id);
  if (!row) return NextResponse.json({ error: 'not-found' }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await request.json();
    await updateRow('kunstenaars', params.id, data);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}
```
to:
```ts
import { NextResponse } from 'next/server';
import { getRow, updateRow, deleteRow } from '@/lib/server/crud';
import { requireMedewerker } from '@/lib/server/requireAuth';

const KUNSTENAARS_JSON_COLUMNS = ['exclusieveKlantIds'];

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const row = await getRow('kunstenaars', params.id, KUNSTENAARS_JSON_COLUMNS);
  if (!row) return NextResponse.json({ error: 'not-found' }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await request.json();
    await updateRow('kunstenaars', params.id, data, KUNSTENAARS_JSON_COLUMNS);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}
```
(leave `DELETE` unchanged — no JSON columns involved.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/app/api/kunstenaars.test.ts`
Expected: PASS.

- [ ] **Step 5: Remove `exclusieveKunstenaarIds` JSON handling from the `klanten` routes**

In `src/app/api/klanten/route.ts`, remove the constant and its two usages:
```ts
const KLANTEN_JSON_COLUMNS = ['exclusieveKunstenaarIds'];

export const GET = withApiErrorHandling('GET /api/klanten', async (request: Request) => {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const klanten = await listRows('klanten', KLANTEN_JSON_COLUMNS);
  return NextResponse.json(klanten);
});
```
becomes:
```ts
export const GET = withApiErrorHandling('GET /api/klanten', async (request: Request) => {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const klanten = await listRows('klanten');
  return NextResponse.json(klanten);
});
```

In `src/app/api/klanten/[id]/route.ts`, change:
```ts
const KLANTEN_JSON_COLUMNS = ['exclusieveKunstenaarIds'];

// Full-field admin edit (status, prijsgroepId, exclusieveKunstenaarIds, ...) -- staff only.
// A klant's own self-service edit goes through the narrowly-scoped /api/klanten/me instead.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await request.json();
    await updateRow('klanten', params.id, data, KLANTEN_JSON_COLUMNS);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}
```
to:
```ts
// Full-field admin edit (status, prijsgroepId, kunstenaarId, ...) -- staff only.
// A klant's own self-service edit goes through the narrowly-scoped /api/klanten/me instead.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await request.json();
    await updateRow('klanten', params.id, data);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}
```

In `src/app/api/klanten/me/route.ts`, change:
```ts
const KLANTEN_JSON_COLUMNS = ['exclusieveKunstenaarIds'];

// email isn't in the shared registration allowlist (register/route.ts handles it
// separately via a uniqueness check) but a klant editing their own profile may change it.
const SELF_EDITABLE_FIELDS = [...SELF_EDITABLE_KLANT_FIELDS, 'email'] as const;

export async function GET(request: Request) {
  const klantId = await requireKlant(request);
  if (!klantId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const klant = await getRow<Record<string, unknown>>('klanten', klantId, KLANTEN_JSON_COLUMNS);
```
to:
```ts
// email isn't in the shared registration allowlist (register/route.ts handles it
// separately via a uniqueness check) but a klant editing their own profile may change it.
const SELF_EDITABLE_FIELDS = [...SELF_EDITABLE_KLANT_FIELDS, 'email'] as const;

export async function GET(request: Request) {
  const klantId = await requireKlant(request);
  if (!klantId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const klant = await getRow<Record<string, unknown>>('klanten', klantId);
```
and further down, change:
```ts
  try {
    await updateRow('klanten', klantId, updates, KLANTEN_JSON_COLUMNS);
    return NextResponse.json({ ok: true });
```
to:
```ts
  try {
    await updateRow('klanten', klantId, updates);
    return NextResponse.json({ ok: true });
```

- [ ] **Step 6: Update the stale comment in `src/lib/server/klantFields.ts`**

Change:
```ts
// Fields a klant may set about themselves -- at registration (POST /api/auth/register)
// and when editing their own profile (PATCH /api/klanten/me). Deliberately excludes
// status/prijsgroepId/exclusieveKunstenaarIds/minimaleAfname/wachtwoordHash/id -- those
// are staff-only decisions (set via /api/klanten/[id], gated on requireMedewerker) or
// handled separately, and must never be settable directly from a klant-facing request body.
```
to:
```ts
// Fields a klant may set about themselves -- at registration (POST /api/auth/register)
// and when editing their own profile (PATCH /api/klanten/me). Deliberately excludes
// status/prijsgroepId/kunstenaarId/minimaleAfname/wachtwoordHash/id -- those
// are staff-only decisions (set via /api/klanten/[id], gated on requireMedewerker) or
// handled separately, and must never be settable directly from a klant-facing request body.
```

- [ ] **Step 7: Remove the now-dead `exclusieveKunstenaarIds` field from `useCustomerAuth.tsx`**

`Klant.kunstenaarId` is not read by any customer-facing logic (order-right resolution only needs `Kunstenaar.exclusieveKlantIds` and the customer's own `uid`, per Task 2) — so unlike the old `exclusieveKunstenaarIds`, it does not need to be exposed here at all. Change:
```ts
interface CustomerUser {
  uid: string;
  email: string | null;
  companyName: string | null;
  contactPerson: string | null;
  exclusieveKunstenaarIds: string[];
  minimaleAfname: number | null;
}
```
to:
```ts
interface CustomerUser {
  uid: string;
  email: string | null;
  companyName: string | null;
  contactPerson: string | null;
  minimaleAfname: number | null;
}
```

Change:
```ts
        const klant = body.user as
          | {
              id: string;
              email: string | null;
              companyName?: string;
              contactPerson?: string;
              status?: string;
              exclusieveKunstenaarIds?: string[];
              minimaleAfname?: number | null;
            }
          | null;
        if (!klant) {
          setUser(null);
          setIsCustomer(false);
        } else {
          setUser({
            uid: klant.id,
            email: klant.email,
            companyName: klant.companyName ?? null,
            contactPerson: klant.contactPerson ?? null,
            exclusieveKunstenaarIds: klant.exclusieveKunstenaarIds ?? [],
            minimaleAfname: klant.minimaleAfname ?? null,
          });
          setIsCustomer(klant.status === 'Goedgekeurd');
        }
```
to:
```ts
        const klant = body.user as
          | {
              id: string;
              email: string | null;
              companyName?: string;
              contactPerson?: string;
              status?: string;
              minimaleAfname?: number | null;
            }
          | null;
        if (!klant) {
          setUser(null);
          setIsCustomer(false);
        } else {
          setUser({
            uid: klant.id,
            email: klant.email,
            companyName: klant.companyName ?? null,
            contactPerson: klant.contactPerson ?? null,
            minimaleAfname: klant.minimaleAfname ?? null,
          });
          setIsCustomer(klant.status === 'Goedgekeurd');
        }
```

- [ ] **Step 8: Run the full test suite for touched areas**

Run: `npx vitest run tests/app/api/kunstenaars.test.ts tests/app/api/klanten.test.ts`
Expected: PASS. (If `tests/app/api/klanten.test.ts` doesn't exist, skip it — this repo's klanten route tests may live under a differently-named file; run `npx vitest run tests/app/api` to be safe and confirm nothing else regressed.)

- [ ] **Step 9: Commit**

```bash
git add src/app/api/kunstenaars/route.ts src/app/api/kunstenaars/[id]/route.ts src/app/api/klanten/route.ts src/app/api/klanten/[id]/route.ts src/app/api/klanten/me/route.ts src/lib/server/klantFields.ts src/lib/useCustomerAuth.tsx tests/app/api/kunstenaars.test.ts
git commit -m "feat: wire exclusieveKlantIds JSON column, drop exclusieveKunstenaarIds plumbing"
```

---

### Task 4: `KunstenaarsSection` — remove verkooprecht, add the max-2 exclusiviteit checklist

**Files:**
- Modify: `src/components/beheer/KunstenaarsSection.tsx`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/KunstenaarsSection.test.tsx`

**Interfaces:**
- Consumes: `Kunstenaar`/`Klant` from Task 2.
- Produces: the "own klant" lookup helper `(klanten ?? []).find((k) => k.kunstenaarId === kunstenaarId)` — Task 5 relies on the identical lookup shape for its read-only display, so keep the predicate consistent (`k.kunstenaarId === <kunstenaar id>`).

- [ ] **Step 1: Rewrite the fixtures and relevant tests in `tests/components/beheer/KunstenaarsSection.test.tsx`**

Change the `KLANTEN` and `KUNSTENAARS` fixtures (lines 71-108):

```ts
const KLANTEN: Klant[] = [
  {
    id: 'klant-1',
    companyName: 'Galerie De Boer',
    kvk: '12345678',
    contactPerson: 'Jan de Boer',
    email: 'jan@galeriedeboer.nl',
    phone: '0612345678',
    contactPreference: 'email',
    address: 'Teststraat 1',
    postcode: '1234 AB',
    city: 'Teststad',
    deliveryAddress: '',
    deliveryPostcode: '',
    deliveryCity: '',
    invoiceAddress: '',
    invoicePostcode: '',
    invoiceCity: '',
    status: 'Goedgekeurd',
    prijsgroepId: null,
    kunstenaarId: null,
  },
  {
    id: 'klant-2',
    companyName: 'Sabrina Glasser (eigen account)',
    kvk: '87654321',
    contactPerson: 'Sabrina Glasser',
    email: 'sabrina@example.com',
    phone: '0612340000',
    contactPreference: 'email',
    address: 'Glasstraat 2',
    postcode: '5678 CD',
    city: 'Glasstad',
    deliveryAddress: '',
    deliveryPostcode: '',
    deliveryCity: '',
    invoiceAddress: '',
    invoicePostcode: '',
    invoiceCity: '',
    status: 'Goedgekeurd',
    prijsgroepId: null,
    kunstenaarId: 'ka-1',
  },
];

const KUNSTENAARS: Kunstenaar[] = [
  {
    id: 'ka-1',
    naam: 'Sabrina Glasser',
    foto: null,
    omschrijvingNl: 'Werkt met gesmolten glas.',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    exclusieveKlantIds: [],
  },
];
```

Replace the test `'lists kunstenaars with their verkooprecht label'` (lines 165-169):
```ts
  it('lists kunstenaars with an "open" exclusiviteit summary when the list is empty', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-ka-1')).toHaveTextContent('Sabrina Glasser');
    expect(screen.getByTestId('data-table-row-ka-1')).toHaveTextContent('Open voor alle klanten');
  });

  it('lists kunstenaars with the names of their exclusieve klanten when the list is non-empty', () => {
    renderSection({ kunstenaars: [{ ...KUNSTENAARS[0], exclusieveKlantIds: ['klant-1', 'klant-2'] }] });
    expect(screen.getByTestId('data-table-row-ka-1')).toHaveTextContent('Galerie De Boer, Sabrina Glasser (eigen account)');
  });
```

Replace the test `'adds a new kunstenaar with an uploaded photo, verkooprecht and gekoppelde klant'` (lines 181-222):
```ts
  it('adds a new kunstenaar with an uploaded photo and one exclusieve klant', async () => {
    uploadMock.mockResolvedValue('https://storage.example.com/nieuw.jpg');
    const { onRefetch } = renderSection();
    fireEvent.click(screen.getByTestId('kunstenaars-add'));
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('kunstenaar-modal-foto-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('kunstenaar-modal-foto-preview')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('kunstenaar-modal-naam'), { target: { value: 'Nieuwe Kunstenaar' } });
    fireEvent.change(screen.getByTestId('kunstenaar-modal-omschrijving-nl'), { target: { value: 'Werkt met glas.' } });
    fireEvent.change(screen.getByTestId('kunstenaar-modal-prijsafspraken'), { target: { value: '30% commissie' } });
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-klant-1'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-opslaan'));

    // Public record: no prijsafspraken, it is not publicly readable.
    await waitFor(() => expect(kunstenaarPostCall()).toBeDefined());
    expect(JSON.parse(kunstenaarPostCall()![1].body as string)).toEqual({
      foto: 'https://storage.example.com/nieuw.jpg',
      naam: 'Nieuwe Kunstenaar',
      omschrijvingNl: 'Werkt met glas.',
      omschrijvingFr: '',
      omschrijvingDe: '',
      omschrijvingEn: '',
      exclusieveKlantIds: ['klant-1'],
    });
    // Companion record in the medewerker-only table.
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/kunstenaarAfspraken/nieuwe-ka-id-1',
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ prijsafspraken: '30% commissie' }) })
      )
    );
    expect(onRefetch).toHaveBeenCalled();
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'kunstenaar_toegevoegd',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'Nieuwe Kunstenaar'
    );
  });

  it('a new kunstenaar cannot select a second exclusieve klant -- there is no own account yet to satisfy the rule', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstenaars-add'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-klant-1'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-klant-2'));
    expect(screen.getByTestId('kunstenaar-modal-error')).toHaveTextContent(
      'Bij 2 klanten moet één daarvan het klantaccount van deze kunstenaar zelf zijn.'
    );
    expect(screen.getByTestId('kunstenaar-modal-klant-klant-2')).not.toBeChecked();
  });

  it('allows a second exclusieve klant on an existing kunstenaar when one of the two is its own linked klant', async () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-klant-1'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-klant-2'));
    expect(screen.queryByTestId('kunstenaar-modal-error')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('kunstenaar-modal-opslaan'));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(
        'ka-1',
        expect.objectContaining({ exclusieveKlantIds: ['klant-1', 'klant-2'] })
      )
    );
  });
```

Replace the test `'opens a row for editing pre-filled and updates it, preserving exclusiefVoorKlantId'` (lines 256-292):
```ts
  it('opens a row for editing pre-filled and updates it, keeping its exclusieveKlantIds', async () => {
    afsprakenGetImpl = async () => ({ ok: true, json: async () => ({ prijsafspraken: '20% commissie' }) });
    const { onUpdate } = renderSection({
      kunstenaars: [{ ...KUNSTENAARS[0], exclusieveKlantIds: ['klant-1'] }],
    });
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));
    expect(screen.getByTestId('kunstenaar-modal-naam')).toHaveValue('Sabrina Glasser');
    await waitFor(() =>
      expect(screen.getByTestId('kunstenaar-modal-prijsafspraken')).toHaveValue('20% commissie')
    );
    expect(screen.getByTestId('kunstenaar-modal-klant-klant-1')).toBeChecked();

    fireEvent.change(screen.getByTestId('kunstenaar-modal-naam'), { target: { value: 'Sabrina G.' } });
    fireEvent.click(screen.getByTestId('kunstenaar-modal-opslaan'));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('ka-1', {
        foto: null,
        naam: 'Sabrina G.',
        omschrijvingNl: 'Werkt met gesmolten glas.',
        omschrijvingFr: '',
        omschrijvingDe: '',
        omschrijvingEn: '',
        exclusieveKlantIds: ['klant-1'],
      })
    );
    expect(afsprakenPutCalls()).toContainEqual([
      '/api/kunstenaarAfspraken/ka-1',
      expect.objectContaining({ body: JSON.stringify({ prijsafspraken: '20% commissie' }) }),
    ]);
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'kunstenaar_gewijzigd',
      expect.anything(),
      'Sabrina G.'
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/KunstenaarsSection.test.tsx`
Expected: FAIL — `kunstenaar-modal-klant-klant-1` doesn't exist yet, `Klant`/`Kunstenaar` fixtures no longer match the current component's expectations.

- [ ] **Step 3: Rewrite `src/components/beheer/KunstenaarsSection.tsx`**

Change the `KunstenaarRow` type and `LEGE_FORM` (lines 25-38):
```ts
type ModalState = { mode: 'add' } | { mode: 'edit'; kunstenaar: Kunstenaar } | null;
type KunstenaarRow = Kunstenaar & { exclusiviteitLabel: string };

const LEGE_FORM = {
  foto: null as string | null,
  naam: '',
  omschrijvingNl: '',
  omschrijvingFr: '',
  omschrijvingDe: '',
  omschrijvingEn: '',
  prijsafspraken: '',
  exclusieveKlantIds: [] as string[],
};
```

Change the imports (drop `Combobox`, it's no longer used in this file):
```ts
import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useKunstwerkFotoUpload } from '@/lib/useKunstwerkFotoUpload';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Kunstenaar } from './kunstenaarTypes';
import type { Klant } from './KlantenSection';
import type { Kunstwerk } from './materiaalTypes';
```

Change the state declarations (replace `verkooprecht`/`klantId` state):
```ts
  const [prijsafspraken, setPrijsafspraken] = useState(LEGE_FORM.prijsafspraken);
  const [exclusieveKlantIds, setExclusieveKlantIds] = useState<string[]>(LEGE_FORM.exclusieveKlantIds);
  const [prijsafsprakenLaden, setPrijsafsprakenLaden] = useState(false);
```

Change `klantNaamById` and the `rows` computation:
```ts
  const klantNaamById = useMemo(() => {
    const map = new Map<string, string>();
    (klanten ?? []).forEach((klant) => map.set(klant.id, klant.companyName));
    return map;
  }, [klanten]);

  // De klant (indien aanwezig) wiens kunstenaarId naar déze kunstenaar wijst -- gebruikt
  // om de "bij 2 klanten moet 1 de kunstenaar zelf zijn"-regel te valideren.
  function eigenKlantId(kunstenaarId: string | null): string | null {
    if (kunstenaarId === null) return null;
    return (klanten ?? []).find((klant) => klant.kunstenaarId === kunstenaarId)?.id ?? null;
  }
```

Change:
```ts
  const rows: KunstenaarRow[] = kunstenaars.map((kunstenaar) => ({
    ...kunstenaar,
    verkooprechtLabel:
      kunstenaar.verkooprecht === 'open'
        ? t('kunstenaarsVerkooprechtOpen')
        : t('kunstenaarsVerkooprechtAlleenKunstenaar'),
    klantNaam: kunstenaar.klantId ? klantNaamById.get(kunstenaar.klantId) ?? kunstenaar.klantId : '',
  }));
```
to:
```ts
  const rows: KunstenaarRow[] = kunstenaars.map((kunstenaar) => ({
    ...kunstenaar,
    exclusiviteitLabel:
      kunstenaar.exclusieveKlantIds.length === 0
        ? t('kunstenaarsExclusiviteitOpen')
        : kunstenaar.exclusieveKlantIds.map((id) => klantNaamById.get(id) ?? id).join(', '),
  }));
```

Change `resetForm`:
```ts
  function resetForm() {
    setFoto(LEGE_FORM.foto);
    setNaam(LEGE_FORM.naam);
    setOmschrijvingNl(LEGE_FORM.omschrijvingNl);
    setOmschrijvingFr(LEGE_FORM.omschrijvingFr);
    setOmschrijvingDe(LEGE_FORM.omschrijvingDe);
    setOmschrijvingEn(LEGE_FORM.omschrijvingEn);
    setPrijsafspraken(LEGE_FORM.prijsafspraken);
    setExclusieveKlantIds(LEGE_FORM.exclusieveKlantIds);
    setPrijsafsprakenLaden(false);
    setActionError(null);
  }
```

Change `openEdit`'s pre-fill (replace the two lines setting `verkooprecht`/`klantId`):
```ts
    setPrijsafspraken(LEGE_FORM.prijsafspraken);
    setExclusieveKlantIds(kunstenaar.exclusieveKlantIds);
    setActionError(null);
```

Add the toggle handler, right after `handleFotoDrop` and before `const opslaanDisabled = ...`:
```ts
  function toggleExclusieveKlant(klantId: string, huidigeKunstenaarId: string | null) {
    const isChecked = exclusieveKlantIds.includes(klantId);
    if (isChecked) {
      setActionError(null);
      setExclusieveKlantIds((current) => current.filter((id) => id !== klantId));
      return;
    }
    if (exclusieveKlantIds.length >= 2) return;
    const next = [...exclusieveKlantIds, klantId];
    if (next.length === 2) {
      const eigenId = eigenKlantId(huidigeKunstenaarId);
      if (eigenId === null || !next.includes(eigenId)) {
        setActionError(t('kunstenaarsExclusiviteitOngeldig'));
        return;
      }
    }
    setActionError(null);
    setExclusieveKlantIds(next);
  }
```

Change `handleSave`'s `data` object:
```ts
    const data = {
      foto,
      naam,
      omschrijvingNl,
      omschrijvingFr,
      omschrijvingDe,
      omschrijvingEn,
      exclusieveKlantIds,
    };
```

Change the `columns` array:
```ts
  const columns: Column<KunstenaarRow>[] = [
    { key: 'naam', label: t('kunstenaarsColNaam') },
    { key: 'exclusiviteitLabel', label: t('kunstenaarsColKlant') },
  ];
```

Replace the `kunstenaarsLabelVerkooprecht` `<select>` block and the `kunstenaarsLabelKlant` `Combobox` block (the two `<label>` blocks right before `{actionError && ...}`) with a single fieldset:
```tsx
          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs uppercase tracking-wide text-white/60">
              {t('kunstenaarsLabelKlant')}
            </legend>
            {(klanten ?? []).map((klant) => {
              const huidigeKunstenaarId = modalState?.mode === 'edit' ? modalState.kunstenaar.id : null;
              const isChecked = exclusieveKlantIds.includes(klant.id);
              const isDisabled = !isChecked && exclusieveKlantIds.length >= 2;
              return (
                <label key={klant.id} className="flex items-center gap-2 text-sm text-white/80">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={isDisabled}
                    onChange={() => toggleExclusieveKlant(klant.id, huidigeKunstenaarId)}
                    data-testid={`kunstenaar-modal-klant-${klant.id}`}
                  />
                  {klant.companyName}
                </label>
              );
            })}
          </fieldset>
```

- [ ] **Step 4: Update `messages/nl.json`**

Change:
```json
    "kunstenaarsColVerkooprecht": "Verkooprecht",
    "kunstenaarsColKlant": "Exclusief verkooprecht voor klant",
```
to:
```json
    "kunstenaarsColKlant": "Exclusief verkooprecht voor klant",
```

Change:
```json
    "kunstenaarsLabelVerkooprecht": "Verkooprecht",
    "kunstenaarsVerkooprechtOpen": "Open voor alle klanten",
    "kunstenaarsVerkooprechtAlleenKunstenaar": "Alleen de kunstenaar zelf",
    "kunstenaarsLabelKlant": "Exclusief verkooprecht voor klant",
    "kunstenaarsKlantPlaceholder": "Zoek een klant…",
    "kunstenaarsKlantGeenResultaten": "Geen klanten gevonden",
    "kunstenaarsKlantGeen": "Geen koppeling",
```
to:
```json
    "kunstenaarsExclusiviteitOpen": "Open voor alle klanten",
    "kunstenaarsExclusiviteitOngeldig": "Bij 2 klanten moet één daarvan het klantaccount van deze kunstenaar zelf zijn.",
    "kunstenaarsLabelKlant": "Exclusief verkooprecht voor klant",
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/KunstenaarsSection.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/beheer/KunstenaarsSection.tsx messages/nl.json tests/components/beheer/KunstenaarsSection.test.tsx
git commit -m "feat: replace verkooprecht select with a capped exclusieve-klanten checklist"
```

---

### Task 5: `KlantModal` — "Dit klantaccount is van kunstenaar" link + read-only exclusiviteit display

**Files:**
- Modify: `src/components/beheer/KlantModal.tsx`
- Modify: `src/components/beheer/KlantenSection.tsx`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/KlantModal.test.tsx`

**Interfaces:**
- Consumes: `Kunstenaar`/`Klant` from Task 2. Uses the same `klant.kunstenaarId === kunstenaar.id` predicate as Task 4.
- Produces: `KlantModal` drops the `onKunstenaarUpdated` prop entirely and gains a new required `klanten: Klant[] | null` prop (needed to validate kunstenaar-uniqueness across klanten). `KlantenSection` forwards its own `klanten` prop into `KlantModal` and drops `onKunstenaarUpdated` from its own props.

- [ ] **Step 1: Rewrite `tests/components/beheer/KlantModal.test.tsx`**

Change the `KLANT` and `KUNSTENAARS` fixtures (lines 26-78):
```ts
const KLANT: Klant = {
  id: 'uid-1',
  companyName: 'Testbedrijf BV',
  kvk: '12345678',
  contactPerson: 'Jan Jansen',
  email: 'jan@example.com',
  phone: '0612345678',
  contactPreference: 'email',
  address: 'Teststraat 1',
  postcode: '1234 AB',
  city: 'Teststad',
  deliveryAddress: '',
  deliveryPostcode: '',
  deliveryCity: '',
  invoiceAddress: '',
  invoicePostcode: '',
  invoiceCity: '',
  status: 'Beoordelen',
  prijsgroepId: null,
  kunstenaarId: null,
};

const ANDERE_KLANT: Klant = { ...KLANT, id: 'uid-2', companyName: 'Ander Bedrijf BV', kunstenaarId: 'ka-2' };

const PRIJSGROEPEN: Prijsgroep[] = [
  { id: 'pg-1', naam: 'Standaard', kortingspercentage: 0 },
  { id: 'pg-2', naam: 'Premium', kortingspercentage: 10 },
];

const KUNSTENAARS: Kunstenaar[] = [
  {
    id: 'ka-1',
    naam: 'Sabrina Glasser',
    foto: null,
    omschrijvingNl: 'Werkt met glas.',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    exclusieveKlantIds: [],
  },
  {
    id: 'ka-2',
    naam: 'Bram Steen',
    foto: null,
    omschrijvingNl: 'Werkt met steen.',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    exclusieveKlantIds: ['uid-2'],
  },
];
```

Change `renderModal` (lines 80-102) to pass `klanten` instead of `onKunstenaarUpdated`:
```ts
function renderModal(
  klant: Klant | null,
  prijsgroepen: Prijsgroep[] | null = PRIJSGROEPEN,
  kunstenaars: Kunstenaar[] | null = KUNSTENAARS,
  klanten: Klant[] | null = [KLANT, ANDERE_KLANT]
) {
  const onClose = vi.fn();
  const onUpdated = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <KlantModal
        klant={klant}
        prijsgroepen={prijsgroepen}
        kunstenaars={kunstenaars}
        klanten={klanten}
        onClose={onClose}
        onUpdated={onUpdated}
      />
    </NextIntlClientProvider>
  );
  return { onClose, onUpdated };
}
```

Remove the `onKunstenaarUpdatedOverride` param everywhere it's referenced (there is no override anymore — search the file for `onKunstenaarUpdated` and delete every reference).

Replace the 5 tests at the end of the file (`'toggles a kunstenaar checkbox on and saves exclusieveKunstenaarIds...'` through `'writes the kunstenaar back-pointer before the klant document'`, lines 386-446) with:
```ts
  it('shows "Geen" for exclusief recht op kunstenaars when no kunstenaar lists this klant', () => {
    renderModal(KLANT);
    expect(screen.getByTestId('klant-modal-exclusieve-kunstenaars-leeg')).toHaveTextContent('Geen');
  });

  it('shows the kunstenaars that list this klant in hun exclusieveKlantIds, read-only', () => {
    renderModal(ANDERE_KLANT);
    expect(screen.getByTestId('klant-modal-exclusieve-kunstenaars')).toHaveTextContent('Bram Steen');
    expect(screen.queryByTestId('klant-modal-exclusief-ka-2')).not.toBeInTheDocument();
  });

  it('links this klant account to a kunstenaar via the combobox and saves kunstenaarId', async () => {
    const { onUpdated } = renderModal(KLANT);
    fireEvent.focus(screen.getByTestId('klant-modal-kunstenaar'));
    fireEvent.click(screen.getByTestId('klant-modal-kunstenaar-option-ka-1'));
    fireEvent.click(screen.getByTestId('klant-modal-opslaan'));

    await waitFor(() => expect(patchCall()).toBeDefined());
    expect(patchBody()).toEqual({ kunstenaarId: 'ka-1' });
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ ...KLANT, kunstenaarId: 'ka-1' }));
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'klant_kunstenaarkoppeling_gewijzigd',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'Testbedrijf BV'
    );
  });

  it('blocks linking a kunstenaar that another klant already claims', () => {
    renderModal(KLANT);
    fireEvent.focus(screen.getByTestId('klant-modal-kunstenaar'));
    fireEvent.click(screen.getByTestId('klant-modal-kunstenaar-option-ka-2'));
    expect(screen.getByTestId('klant-modal-error')).toHaveTextContent(
      'Deze kunstenaar is al gekoppeld aan een ander klantaccount.'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows clearing an existing kunstenaar-koppeling', async () => {
    const { onUpdated } = renderModal({ ...KLANT, kunstenaarId: 'ka-1' });
    fireEvent.focus(screen.getByTestId('klant-modal-kunstenaar'));
    fireEvent.click(screen.getByTestId('klant-modal-kunstenaar-option-clear'));
    fireEvent.click(screen.getByTestId('klant-modal-opslaan'));

    await waitFor(() => expect(patchCall()).toBeDefined());
    expect(patchBody()).toEqual({ kunstenaarId: null });
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ ...KLANT, kunstenaarId: null }));
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/KlantModal.test.tsx`
Expected: FAIL — `klant-modal-kunstenaar` doesn't exist, `KlantModal` doesn't accept a `klanten` prop yet.

- [ ] **Step 3: Rewrite `src/components/beheer/KlantModal.tsx`**

Change the imports and props interface:
```ts
'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal';
import { Combobox } from '@/components/Combobox';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Klant } from './KlantenSection';
import type { Prijsgroep } from './materiaalTypes';
import type { Kunstenaar } from './kunstenaarTypes';
```

Change `KlantModalProps`:
```ts
interface KlantModalProps {
  klant: Klant | null;
  prijsgroepen: Prijsgroep[] | null;
  kunstenaars: Kunstenaar[] | null;
  klanten: Klant[] | null;
  onClose: () => void;
  onUpdated: (klant: Klant) => void;
}
```

Change the function signature and drop the `onKunstenaarUpdated` param:
```ts
export function KlantModal({
  klant,
  prijsgroepen,
  kunstenaars,
  klanten,
  onClose,
  onUpdated,
}: KlantModalProps) {
```

Replace the `exclusieveKunstenaarIds` state and its `useEffect`/`toggle`/`toggleExclusiviteit` helpers:
```ts
  const t = useTranslations('beheer');
  const [prijsgroepId, setPrijsgroepId] = useState('');
  const [kunstenaarId, setKunstenaarId] = useState<string | null>(null);
  const [minimaleAfname, setMinimaleAfname] = useState('');
  const [fields, setFields] = useState<EditableFields | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAdminAuth();

  useEffect(() => {
    if (klant) {
      setPrijsgroepId(klant.prijsgroepId ?? '');
      setKunstenaarId(klant.kunstenaarId);
      setMinimaleAfname(klant.minimaleAfname != null ? String(klant.minimaleAfname) : '');
      setFields(fieldsFromKlant(klant));
      setIsEditing(false);
      setError(null);
    }
  }, [klant]);

  function setField<K extends keyof EditableFields>(key: K, value: EditableFields[K]) {
    setFields((current) => (current ? { ...current, [key]: value } : current));
  }

  function handleBewerken() {
    setIsEditing(true);
  }

  function handleAnnuleren() {
    if (klant) {
      setFields(fieldsFromKlant(klant));
    }
    setIsEditing(false);
  }

  function handleKunstenaarChange(nextKunstenaarId: string | null) {
    if (nextKunstenaarId) {
      const alreadyClaimedBy = (klanten ?? []).find(
        (other) => other.id !== klant?.id && other.kunstenaarId === nextKunstenaarId
      );
      if (alreadyClaimedBy) {
        setError(t('klantenKunstenaarBlocked'));
        return;
      }
    }
    setError(null);
    setKunstenaarId(nextKunstenaarId);
  }
```

Replace `handleOpslaan` (drop the `exclusiviteitGewijzigd` back-pointer loop, add `kunstenaarIdGewijzigd`):
```ts
  async function handleOpslaan() {
    if (!klant || !fields) return;
    setError(null);

    const origineleFields = fieldsFromKlant(klant);
    const veldenGewijzigd =
      isEditing && (Object.keys(origineleFields) as (keyof EditableFields)[]).some((key) => fields[key] !== origineleFields[key]);
    const prijsgroepGewijzigd =
      klant.status === 'Goedgekeurd' && prijsgroepId !== '' && prijsgroepId !== (klant.prijsgroepId ?? '');
    const kunstenaarIdGewijzigd = kunstenaarId !== (klant.kunstenaarId ?? null);
    const trimmedMinimaleAfname = minimaleAfname.trim();
    const parsedMinimaleAfname =
      trimmedMinimaleAfname === '' ? null : Math.max(1, Math.round(Number(trimmedMinimaleAfname)) || 1);
    const minimaleAfnameGewijzigd = parsedMinimaleAfname !== (klant.minimaleAfname ?? null);

    if (!veldenGewijzigd && !prijsgroepGewijzigd && !kunstenaarIdGewijzigd && !minimaleAfnameGewijzigd) {
      setIsEditing(false);
      return;
    }

    try {
      const updates: Partial<Klant> = {};
      if (veldenGewijzigd) Object.assign(updates, fields);
      if (prijsgroepGewijzigd) updates.prijsgroepId = prijsgroepId;
      if (kunstenaarIdGewijzigd) updates.kunstenaarId = kunstenaarId;
      if (minimaleAfnameGewijzigd) updates.minimaleAfname = parsedMinimaleAfname;

      const response = await fetch(`/api/klanten/${klant.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error('update failed');

      if (veldenGewijzigd) void logActiviteit('klant_gewijzigd', actorFromMedewerker(user), klant.companyName);
      if (prijsgroepGewijzigd) void logActiviteit('klant_prijsgroep_gewijzigd', actorFromMedewerker(user), klant.companyName);
      if (kunstenaarIdGewijzigd) void logActiviteit('klant_kunstenaarkoppeling_gewijzigd', actorFromMedewerker(user), klant.companyName);
      if (minimaleAfnameGewijzigd) void logActiviteit('klant_minimale_afname_gewijzigd', actorFromMedewerker(user), klant.companyName);

      onUpdated({ ...klant, ...updates });
      if (minimaleAfnameGewijzigd) {
        setMinimaleAfname(parsedMinimaleAfname != null ? String(parsedMinimaleAfname) : '');
      }
      setIsEditing(false);
    } catch {
      setError(t('klantenActionError'));
    }
  }
```

Replace the `<fieldset>` block (the editable "Exclusief recht op kunstenaars" checkboxes) with a Combobox for the new link plus a read-only display for the derived list:
```tsx
          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
              {t('klantenLabelKunstenaar')}
              <Combobox
                options={(kunstenaars ?? []).map((kunstenaar) => ({ value: kunstenaar.id, label: kunstenaar.naam }))}
                value={kunstenaarId}
                onChange={handleKunstenaarChange}
                placeholder={t('klantenKunstenaarPlaceholder')}
                noResultsLabel={t('klantenKunstenaarGeenResultaten')}
                clearLabel={t('klantenKunstenaarGeen')}
                testId="klant-modal-kunstenaar"
              />
            </label>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-white/60">
              {t('klantenLabelExclusieveKunstenaars')}
            </span>
            {(() => {
              const namen = (kunstenaars ?? [])
                .filter((kunstenaar) => kunstenaar.exclusieveKlantIds.includes(klant.id))
                .map((kunstenaar) => kunstenaar.naam);
              return namen.length === 0 ? (
                <p data-testid="klant-modal-exclusieve-kunstenaars-leeg" className="text-white/50">
                  {t('klantenExclusieveKunstenaarsLeeg')}
                </p>
              ) : (
                <p data-testid="klant-modal-exclusieve-kunstenaars">{namen.join(', ')}</p>
              );
            })()}
          </div>
```

- [ ] **Step 4: Wire `klanten` through `KlantenSection.tsx`**

Change:
```ts
interface KlantenSectionProps {
  klanten: Klant[] | null;
  prijsgroepen: Prijsgroep[] | null;
  kunstenaars: Kunstenaar[] | null;
  loadError: string | null;
  onKlantUpdated: (klant: Klant) => void;
  onKunstenaarUpdated: (id: string, data: Partial<Omit<Kunstenaar, 'id'>>) => Promise<boolean>;
}

export function KlantenSection({
  klanten,
  prijsgroepen,
  kunstenaars,
  loadError,
  onKlantUpdated,
  onKunstenaarUpdated,
}: KlantenSectionProps) {
```
to:
```ts
interface KlantenSectionProps {
  klanten: Klant[] | null;
  prijsgroepen: Prijsgroep[] | null;
  kunstenaars: Kunstenaar[] | null;
  loadError: string | null;
  onKlantUpdated: (klant: Klant) => void;
}

export function KlantenSection({
  klanten,
  prijsgroepen,
  kunstenaars,
  loadError,
  onKlantUpdated,
}: KlantenSectionProps) {
```

Change the `<KlantModal>` render:
```tsx
      <KlantModal
        klant={selectedKlant}
        prijsgroepen={prijsgroepen}
        kunstenaars={kunstenaars}
        klanten={klanten}
        onClose={() => setSelectedKlant(null)}
        onUpdated={(updated) => {
          onKlantUpdated(updated);
          setSelectedKlant(null);
        }}
      />
```

- [ ] **Step 5: Update `messages/nl.json`**

Change:
```json
    "klantenLabelExclusieveKunstenaars": "Exclusief recht op kunstenaars",
    "klantenExclusiviteitBlocked": "Deze kunstenaar is al exclusief toegewezen aan een andere klant.",
    "klantenLabelMinimaleAfname": "Minimale afname (override)",
```
to:
```json
    "klantenLabelExclusieveKunstenaars": "Exclusief recht op kunstenaars",
    "klantenExclusieveKunstenaarsLeeg": "Geen",
    "klantenLabelKunstenaar": "Dit klantaccount is van kunstenaar",
    "klantenKunstenaarPlaceholder": "Zoek een kunstenaar…",
    "klantenKunstenaarGeenResultaten": "Geen kunstenaars gevonden",
    "klantenKunstenaarGeen": "Geen koppeling",
    "klantenKunstenaarBlocked": "Deze kunstenaar is al gekoppeld aan een ander klantaccount.",
    "klantenLabelMinimaleAfname": "Minimale afname (override)",
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/KlantModal.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/beheer/KlantModal.tsx src/components/beheer/KlantenSection.tsx messages/nl.json tests/components/beheer/KlantModal.test.tsx
git commit -m "feat: link Klant to Kunstenaar from the Klant side, make exclusiviteit read-only there"
```

---

### Task 6: `BeheerShell` wiring cleanup + activiteitenlog type swap

**Files:**
- Modify: `src/components/beheer/BeheerShell.tsx`
- Modify: `src/lib/logActiviteit.ts`
- Modify: `src/components/beheer/ActiviteitSection.tsx`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/BeheerShell.test.tsx`
- Test: `tests/components/beheer/ActiviteitSection.test.tsx`

**Interfaces:**
- Consumes: `KlantenSection`/`KlantModal` prop changes from Task 5.
- Produces: `ActiviteitType` gains `'klant_kunstenaarkoppeling_gewijzigd'`, drops `'klant_exclusiviteit_gewijzigd'`.

- [ ] **Step 1: Update the failing test in `tests/components/beheer/ActiviteitSection.test.tsx`**

Change the test around line 105 (find the block asserting the `klant_exclusiviteit_gewijzigd` label):
```tsx
      {
        id: 'log-8',
        type: 'klant_exclusiviteit_gewijzigd',
        actorEmail: 'paul@glassartanddesign.com',
        actorNaam: 'paul@glassartanddesign.com',
        timestamp: new Date('2026-07-26T09:15:00'),
      },
```
to:
```tsx
      {
        id: 'log-8',
        type: 'klant_kunstenaarkoppeling_gewijzigd',
        actorEmail: 'paul@glassartanddesign.com',
        actorNaam: 'paul@glassartanddesign.com',
        timestamp: new Date('2026-07-26T09:15:00'),
      },
```
and change the matching assertion:
```tsx
    expect(screen.getByTestId('data-table-row-log-8')).toHaveTextContent('Exclusiviteit gewijzigd voor klant');
```
to:
```tsx
    expect(screen.getByTestId('data-table-row-log-8')).toHaveTextContent('Kunstenaar-koppeling gewijzigd voor klant');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/beheer/ActiviteitSection.test.tsx`
Expected: FAIL — `'klant_kunstenaarkoppeling_gewijzigd'` is not assignable to `ActiviteitType` yet, label falls back to the raw type string.

- [ ] **Step 3: Update `ActiviteitType` in `src/lib/logActiviteit.ts`**

Change line 39:
```ts
  'klant_exclusiviteit_gewijzigd',
```
to:
```ts
  'klant_kunstenaarkoppeling_gewijzigd',
```

- [ ] **Step 4: Update the label mapping in `src/components/beheer/ActiviteitSection.tsx`**

Change line 69:
```ts
  klant_exclusiviteit_gewijzigd: 'activiteitTypeKlantExclusiviteitGewijzigd',
```
to:
```ts
  klant_kunstenaarkoppeling_gewijzigd: 'activiteitTypeKlantKunstenaarkoppelingGewijzigd',
```

- [ ] **Step 5: Update `messages/nl.json`**

Change line 343:
```json
    "activiteitTypeKlantExclusiviteitGewijzigd": "Exclusiviteit gewijzigd voor klant",
```
to:
```json
    "activiteitTypeKlantKunstenaarkoppelingGewijzigd": "Kunstenaar-koppeling gewijzigd voor klant",
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/components/beheer/ActiviteitSection.test.tsx`
Expected: PASS.

- [ ] **Step 7: Update `BeheerShell.tsx` wiring**

Remove the now-dead `updateKunstenaarVeilig` helper and its two usages. Change:
```ts
  const kunstenaars = useApiCollection<Kunstenaar>('kunstenaars');

  async function updateKunstenaarVeilig(
    id: string,
    data: Partial<Omit<Kunstenaar, 'id'>>
  ): Promise<boolean> {
    return kunstenaars.update(id, data);
  }
  const drukkers = useApiCollection<Drukker>('drukkers');
```
to:
```ts
  const kunstenaars = useApiCollection<Kunstenaar>('kunstenaars');
  const drukkers = useApiCollection<Drukker>('drukkers');
```

Change the `<KlantenSection>` render:
```tsx
        {activeSection === 'klanten' ? (
          <KlantenSection
            klanten={klanten}
            prijsgroepen={prijsgroepen.items}
            kunstenaars={kunstenaars.items}
            loadError={loadError}
            onKlantUpdated={handleKlantUpdated}
            onKunstenaarUpdated={updateKunstenaarVeilig}
          />
```
to:
```tsx
        {activeSection === 'klanten' ? (
          <KlantenSection
            klanten={klanten}
            prijsgroepen={prijsgroepen.items}
            kunstenaars={kunstenaars.items}
            loadError={loadError}
            onKlantUpdated={handleKlantUpdated}
          />
```

Change the `<KunstenaarsSection>` render's `onUpdate` prop, which used `updateKunstenaarVeilig`:
```tsx
        ) : activeSection === 'kunstenaars' ? (
          <KunstenaarsSection
            kunstenaars={kunstenaars.items}
            klanten={klanten}
            kunstwerken={kunstwerken.items}
            loadError={kunstenaars.error === 'load' ? t('kunstenaarsLoadError') : null}
            onUpdate={updateKunstenaarVeilig}
            onRemove={kunstenaars.remove}
            onRefetch={kunstenaars.refetch}
          />
```
to:
```tsx
        ) : activeSection === 'kunstenaars' ? (
          <KunstenaarsSection
            kunstenaars={kunstenaars.items}
            klanten={klanten}
            kunstwerken={kunstwerken.items}
            loadError={kunstenaars.error === 'load' ? t('kunstenaarsLoadError') : null}
            onUpdate={kunstenaars.update}
            onRemove={kunstenaars.remove}
            onRefetch={kunstenaars.refetch}
          />
```

- [ ] **Step 8: Update the fixtures in `tests/components/beheer/BeheerShell.test.tsx`**

Search the file for every literal object shaped like `{ naam: ..., foto: null, omschrijvingNl: ..., omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '', verkooprecht: 'open', klantId: null, exclusiefVoorKlantId: null }` (used in `mockCollections`/`DEFAULT_COLLECTIONS` seed data for `kunstenaars`) and replace the trailing 3 fields with `exclusieveKlantIds: []`. Also search for any `klanten` fixture objects containing `exclusieveKunstenaarIds: []` and replace that field with `kunstenaarId: null`.

- [ ] **Step 9: Run the test to verify it passes**

Run: `npx vitest run tests/components/beheer/BeheerShell.test.tsx`
Expected: PASS. If it still fails, `Read` the specific failing assertion's surrounding fixture (the exact shape depends on what's still cached from Task 2-5's type changes) and fix the mismatched fixture field names — this step's fixture search is broad by design since `BeheerShell.test.tsx` seeds multiple collections.

- [ ] **Step 10: Commit**

```bash
git add src/lib/logActiviteit.ts src/components/beheer/ActiviteitSection.tsx messages/nl.json src/components/beheer/BeheerShell.tsx tests/components/beheer/ActiviteitSection.test.tsx tests/components/beheer/BeheerShell.test.tsx
git commit -m "feat: swap klant_exclusiviteit_gewijzigd for klant_kunstenaarkoppeling_gewijzigd, drop dead wiring"
```

---

### Task 7: Client-facing order-blocked message cleanup + remaining fixtures

**Files:**
- Modify: `src/components/ProductModal.tsx:477-485`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json`
- Test: `tests/components/ProductModal.test.tsx`
- Test: `tests/components/ProductsGrid.test.tsx`
- Test: `tests/components/CartPanel.test.tsx`
- Test: `tests/components/beheer/KunstwerkenSection.test.tsx`
- Test: `tests/lib/resolveKunstenaarOmschrijving.test.ts`

**Interfaces:**
- Consumes: `OrderBlockedReason` (`'exclusive' | 'unavailable' | null`) from Task 2.

- [ ] **Step 1: Update the failing assertion in `tests/components/ProductModal.test.tsx`**

Search the file for any fixture using the old `Kunstenaar` shape (`verkooprecht`, `klantId`, `exclusiefVoorKlantId`) and replace those 3 fields with `exclusieveKlantIds: []` (or the specific list a given test needs, e.g. `exclusieveKlantIds: ['ander-uid']` for a test that previously used `exclusiefVoorKlantId: 'ander-uid'`). Search for any assertion expecting the `orderBlockedArtistOnly` text/testid path (a test that sets up an "alleen-kunstenaar" scenario) — since there is no longer a distinct artist-only reason, rewrite it as an `exclusieveKlantIds: ['iemand-anders']` exclusivity case asserting `orderBlockedExclusive` instead, or delete it if it becomes a pure duplicate of an existing exclusivity test.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/ProductModal.test.tsx`
Expected: FAIL — `'artistOnly'` branch/testid no longer reachable through the old fixture shape, TS errors on the removed `Kunstenaar` fields.

- [ ] **Step 3: Update `src/components/ProductModal.tsx`**

Change:
```tsx
        {variant === 'dialog' && blockedReason && (
          <p data-testid="product-modal-order-blocked" className="text-xs text-amber-400">
            {blockedReason === 'exclusive'
              ? t('orderBlockedExclusive')
              : blockedReason === 'artistOnly'
              ? t('orderBlockedArtistOnly')
              : t('orderBlockedUnavailable')}
          </p>
        )}
```
to:
```tsx
        {variant === 'dialog' && blockedReason && (
          <p data-testid="product-modal-order-blocked" className="text-xs text-amber-400">
            {blockedReason === 'exclusive' ? t('orderBlockedExclusive') : t('orderBlockedUnavailable')}
          </p>
        )}
```

- [ ] **Step 4: Remove the now-unused `orderBlockedArtistOnly` key from all 4 locale files**

In `messages/nl.json`, remove:
```json
    "orderBlockedArtistOnly": "Dit kunstwerk kan alleen door de kunstenaar zelf besteld worden.",
```
In `messages/en.json`, remove:
```json
    "orderBlockedArtistOnly": "This artwork can only be ordered by the artist themselves.",
```
In `messages/de.json`, remove:
```json
    "orderBlockedArtistOnly": "Dieses Kunstwerk kann nur vom Künstler selbst bestellt werden.",
```
In `messages/fr.json`, remove:
```json
    "orderBlockedArtistOnly": "Cette œuvre ne peut être commandée que par l'artiste lui-même.",
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/components/ProductModal.test.tsx`
Expected: PASS.

- [ ] **Step 6: Fix the remaining fixtures across the other affected test files**

In each of `tests/components/ProductsGrid.test.tsx`, `tests/components/CartPanel.test.tsx`, `tests/components/beheer/KunstwerkenSection.test.tsx:74-76`, and `tests/lib/resolveKunstenaarOmschrijving.test.ts:13-15`, replace every occurrence of:
```ts
    verkooprecht: 'open',
    klantId: null,
    exclusiefVoorKlantId: null,
```
with:
```ts
    exclusieveKlantIds: [],
```
(adjusting the array contents for any test that specifically exercises exclusivity, mirroring the equivalent pattern already fixed in Task 4/5's test files.)

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: PASS across the whole suite (this also catches any fixture this plan didn't enumerate explicitly — `grep -rn "verkooprecht\|exclusiefVoorKlantId\|exclusieveKunstenaarIds" tests/ src/` should return zero matches once this step is green; fix any stragglers it surfaces the same way as Step 6).

- [ ] **Step 8: Commit**

```bash
git add src/components/ProductModal.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json tests/components/ProductModal.test.tsx tests/components/ProductsGrid.test.tsx tests/components/CartPanel.test.tsx tests/components/beheer/KunstwerkenSection.test.tsx tests/lib/resolveKunstenaarOmschrijving.test.ts
git commit -m "feat: drop the artist-only order-blocked message, finish fixture cleanup"
```

---

### Task 8: Manual verification in the browser

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server and log in as staff**

Run: `npm run dev`, log in to `/nl/beheer` with the medewerker test account.

- [ ] **Step 2: Verify the Kunstenaar screen**

Open a kunstenaar. Confirm: no "Verkooprecht" field remains; "Exclusief verkooprecht voor klant" shows a checkbox per klant; checking a 3rd is disabled once 2 are checked; checking a 2nd klant that isn't the kunstenaar's own linked account shows the inline error and does not check the box; the table's exclusiviteit column shows "Open voor alle klanten" for an empty list and klant names otherwise.

- [ ] **Step 3: Verify the Klant screen**

Open a klant. Confirm: "Dit klantaccount is van kunstenaar" is a searchable combobox; picking a kunstenaar already claimed by another klant shows the block error; "Exclusief recht op kunstenaars" is plain read-only text (no checkboxes), reflecting whatever was set on the Kunstenaar screen in Step 2.

- [ ] **Step 4: Verify customer-facing order blocking**

As a logged-in klant not in a kunstenaar's `exclusieveKlantIds`, open that kunstenaar's kunstwerk in Collecties and confirm the order button is disabled with the exclusivity message (not the removed "alleen de kunstenaar" message). As the klant who *is* listed, confirm ordering is allowed.
