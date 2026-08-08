# Bestelnummer + Zendingnummer Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 07-08-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the existing `bestelnr` field in the Bestellingen-tabel, de Bestelgegevens-modal, en de e-mail naar de drukker (with a per-bestelling heading, since the mail currently pools regels with no way to tell them apart), and introduce a new human-readable `zendingnummer` (ZD-00001, …) that identifies a printer shipment — reserved before sending so it appears in the mail's onderwerp, stored on both the archived zending and the bestellingen it covered, and shown wherever a shipment is referenced.

**Architecture:** `bestelnr` display is pure frontend (the field already exists everywhere). `zendingnummer` follows the exact `counters`-table pattern already used for `bestelnr`: a new counter row, a tiny reservation route that atomically bumps it, and two nullable columns (`drukkerZendingen.zendingnummer`, `bestelheaders.zendingnummer` — the latter a deliberate denormalized copy for display, not a new relational model). `buildDrukkerMail.ts` and the existing `bestellingIds`-JSON zendinggenoten/afronden mechanism are otherwise untouched.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Vitest + Testing Library, raw `mysql2` (no ORM).

## Global Constraints

- No IBAN anywhere in this work (unrelated to this feature, already excluded from the earlier factuurvoetje work).
- `zendingnummer` format: `ZD-` + 5 digits, zero-padded — exact same shape as `bestelnr`'s `GD-00042`.
- `zendingnummer` on `bestelheaders` is a **denormalized copy for display only**. The existing zendinggenoten/bulk-afronden mechanism (`bestellingIds` JSON array + `JSON_CONTAINS` lookups) is NOT touched, NOT replaced, and NOT depended on by anything in this plan — do not "simplify" it as a side effect.
- Both new columns (`drukkerZendingen.zendingnummer`, `bestelheaders.zendingnummer`) are nullable. No historical backfill — existing rows stay `NULL` forever.
- `messages/nl.json` is the only locale file with a `beheer` namespace (`en.json`/`de.json`/`fr.json` don't have one) — new translation keys go there only.
- If reserving a zendingnummer succeeds but the mail send afterward fails, the number is a permanently accepted gap in the sequence — this was discussed and approved explicitly; do not add compensating logic to "return" or reuse it.
- Full spec: `docs/superpowers/specs/2026-08-07-bestelnummer-en-zendingnummer-design.md`.

---

### Task 1: Bestelnummer-kolom in de Bestellingen-tabel

**Files:**
- Modify: `src/components/beheer/BestellingenSection.tsx:288-297`
- Modify: `messages/nl.json` (new key `bestellingenColBestelnummer`)
- Test: `tests/components/beheer/BestellingenSection.test.tsx`

**Interfaces:**
- Consumes: `Bestelling.bestelnr: string` (already exists, unchanged).
- Produces: nothing new for later tasks — this is a pure display addition.

- [ ] **Step 1: Write the failing test**

Add this test inside the existing `describe('BestellingenSection', ...)` block in `tests/components/beheer/BestellingenSection.test.tsx`, right after the `'shows all bestellingen by default...'` test:

```ts
  it('shows the bestelnummer in the table', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-header-1')).toHaveTextContent('GD-00301');
    expect(screen.getByTestId('data-table-row-header-2')).toHaveTextContent('GD-00302');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/beheer/BestellingenSection.test.tsx -t "shows the bestelnummer in the table"`
Expected: FAIL — the row has no `bestelnr` text yet.

- [ ] **Step 3: Write the minimal implementation**

In `src/components/beheer/BestellingenSection.tsx`, change the `columns` array (currently lines 288-297):

```ts
  const columns: Column<Bestelling>[] = [
    { key: 'companyName', label: t('bestellingenColKlant') },
    { key: 'besteldatum', label: t('bestellingenColDatum') },
    {
      key: 'lineCount',
      label: t('bestellingenColAantal'),
      render: (row) => `${row.lineCount} / ${row.totalQuantity}`,
    },
    { key: 'status', label: t('bestellingenColStatus') },
  ];
```

to:

```ts
  const columns: Column<Bestelling>[] = [
    { key: 'bestelnr', label: t('bestellingenColBestelnummer') },
    { key: 'companyName', label: t('bestellingenColKlant') },
    { key: 'besteldatum', label: t('bestellingenColDatum') },
    {
      key: 'lineCount',
      label: t('bestellingenColAantal'),
      render: (row) => `${row.lineCount} / ${row.totalQuantity}`,
    },
    { key: 'status', label: t('bestellingenColStatus') },
  ];
```

In `messages/nl.json`, add a new key right before the existing `"bestellingenColKlant": "Klant",` line:

```json
    "bestellingenColBestelnummer": "Bestelnr.",
    "bestellingenColKlant": "Klant",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/beheer/BestellingenSection.test.tsx`
Expected: PASS — all tests in the file green, including the new one.

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/BestellingenSection.tsx messages/nl.json tests/components/beheer/BestellingenSection.test.tsx
git commit -m "feat: show het bestelnummer in de Bestellingen-tabel"
```

---

### Task 2: Bestelnummer in de Bestelgegevens-modal

**Files:**
- Modify: `src/components/beheer/BestellingModal.tsx:264-267`
- Test: `tests/components/beheer/BestellingModal.test.tsx`

**Interfaces:**
- Consumes: `Bestelling.bestelnr: string` (unchanged).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing test**

Add this test inside the top-level `describe('BestellingModal', ...)` block in `tests/components/beheer/BestellingModal.test.tsx` (anywhere near the top, e.g. right after the `describe(...)` opens):

```ts
  it('shows the bestelnummer in the subtitle', () => {
    renderModal(BESTELLING);
    expect(screen.getByTestId('modal-header')).toHaveTextContent('GD-00101');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx -t "shows the bestelnummer in the subtitle"`
Expected: FAIL — the subtitle doesn't render `bestelnr` yet.

- [ ] **Step 3: Write the minimal implementation**

In `src/components/beheer/BestellingModal.tsx`, change (currently lines 264-267):

```tsx
              <span>
                {bestelling.companyName} · {bestelling.besteldatum}
              </span>
```

to:

```tsx
              <span>
                {bestelling.bestelnr} · {bestelling.companyName} · {bestelling.besteldatum}
              </span>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx`
Expected: PASS — all tests in the file green.

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/BestellingModal.tsx tests/components/beheer/BestellingModal.test.tsx
git commit -m "feat: show het bestelnummer in de Bestelgegevens-modal"
```

---

### Task 3: Bestelnummer in de drukker-mail

**Files:**
- Modify: `src/lib/buildDrukkerMail.ts:203-247` (the `buildDrukkerMail` function body — everything else in the file is untouched)
- Test: `tests/lib/buildDrukkerMail.test.ts`

**Interfaces:**
- Consumes: `Bestelling.bestelnr: string` (unchanged); `resolveRegel`/`formatRegel`/`formatRegelHtml` (unchanged, still only ever see a single `BestellingLine`, never the parent bestelling).
- Produces: no change to `buildDrukkerMail`'s signature or `DrukkerMail` return shape — still `{ subject, text, html }`. Task 6 does not need to know anything new from this task.

- [ ] **Step 1: Write the failing tests**

Add these two tests inside the `describe('buildDrukkerMail', ...)` block in `tests/lib/buildDrukkerMail.test.ts`, right after the `'sets a subject mentioning the drukker order'` test:

```ts
  it('shows a "Bestelling {bestelnr}" heading before that bestelling\'s regels, even with a single bestelling per klant', () => {
    const mail = callBuildDrukkerMail({ bestellingen: [bestelling()], klanten: [klant()] });
    expect(mail.text).toContain('Bestelling GD-00401:');
    expect(mail.html).toContain('Bestelling GD-00401');
  });

  it('shows a separate heading per bestelling, in order, when a klant has multiple bestellingen', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [
        bestelling({ id: 'header-1', bestelnr: 'GD-00401' }),
        bestelling({
          id: 'header-2',
          bestelnr: 'GD-00402',
          lines: [{ id: 'line-2', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
        }),
      ],
      klanten: [klant()],
    });
    const eersteKopje = mail.text.indexOf('Bestelling GD-00401:');
    const tweedeKopje = mail.text.indexOf('Bestelling GD-00402:');
    expect(eersteKopje).toBeGreaterThanOrEqual(0);
    expect(tweedeKopje).toBeGreaterThan(eersteKopje);
    expect(mail.text.indexOf('aantal 2')).toBeLessThan(tweedeKopje);
    expect(mail.text.indexOf('aantal 1')).toBeGreaterThan(tweedeKopje);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/buildDrukkerMail.test.ts -t "Bestelling"`
Expected: FAIL — no such heading exists yet in either output.

- [ ] **Step 3: Write the minimal implementation**

In `src/lib/buildDrukkerMail.ts`, replace the `buildDrukkerMail` function body (currently lines 203-247, the `secties` construction) with:

```ts
export function buildDrukkerMail({
  bestellingen,
  klanten,
  kunstwerken,
  materialen,
  maten,
  materiaalsoorten,
  bedrijfsgegevens,
}: DrukkerMailInput): DrukkerMail {
  const datum = new Date().toLocaleDateString('nl-NL');
  const klantIds = Array.from(new Set(bestellingen.map((b) => b.klantId)));

  const secties = klantIds.map((klantId) => {
    const klant = klanten.find((k) => k.id === klantId);
    const klantBestellingen = bestellingen.filter((b) => b.klantId === klantId);
    const bedrijfsnaam = klant?.companyName ?? klantBestellingen[0].companyName;
    const afleveradres = klant ? formatAfleveradres(klant) : 'Onbekend afleveradres';

    const bestellingBlokkenText = klantBestellingen
      .map((bestelling) => {
        const regelsText = bestelling.lines
          .map((line) => `- ${formatRegel(line, kunstwerken, materialen, maten, materiaalsoorten)}`)
          .join('\n');
        return `Bestelling ${bestelling.bestelnr}:\n${regelsText}`;
      })
      .join('\n\n');

    const bestellingBlokkenHtml = klantBestellingen
      .map((bestelling) => {
        const regelsHtml = bestelling.lines
          .map((line) => formatRegelHtml(line, kunstwerken, materialen, maten, materiaalsoorten))
          .join('');
        return `<tr>
  <td style="padding:12px 0 4px;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;color:#333333;">Bestelling ${escapeHtml(bestelling.bestelnr)}</td>
</tr>
${regelsHtml}`;
      })
      .join('');

    return {
      text: `== ${bedrijfsnaam} ==\nAfleveradres: ${afleveradres}\n\n${bestellingBlokkenText}`,
      html: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
  <tr>
    <td style="background:#f2f2f2;padding:12px 16px;border-radius:4px 4px 0 0;">
      <div style="font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#111111;">${escapeHtml(bedrijfsnaam)}</div>
      <div style="font-family:Arial,sans-serif;font-size:13px;color:#555555;margin-top:2px;">Afleveradres: ${escapeHtml(afleveradres)}</div>
    </td>
  </tr>
  <tr>
    <td style="padding:0 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        ${bestellingBlokkenHtml}
      </table>
    </td>
  </tr>
</table>`,
    };
  });

  return {
    subject: `Nieuwe order(s) voor de drukker – ${datum}`,
    text: `${secties.map((sectie) => sectie.text).join('\n\n')}\n\n${buildFactuurvoetjeText(bedrijfsgegevens)}`,
    html: `<html><body style="margin:0;padding:16px;background:#ffffff;">${secties.map((sectie) => sectie.html).join('')}${buildFactuurvoetjeHtml(bedrijfsgegevens)}</body></html>`,
  };
}
```

Nothing else in the file changes — `escapeHtml`, `tekst`, `buildFactuurvoetjeText`, `buildFactuurvoetjeHtml`, `formatAfleveradres`, `formaatSuffix`, `resolveRegel`, `formatRegel`, `formatRegelHtml`, `ontbrekendeFactuurvoetjeVelden`, and the `FACTUURVOETJE_VELDEN`/`FactuurvoetjeVeld` exports all stay exactly as they are.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/buildDrukkerMail.test.ts`
Expected: PASS — all tests in the file green (the pre-existing tests still pass because every individual regel's text is unchanged, just now preceded by a heading).

- [ ] **Step 5: Commit**

```bash
git add src/lib/buildDrukkerMail.ts tests/lib/buildDrukkerMail.test.ts
git commit -m "feat: toon het bestelnummer per bestelling in de drukker-mail"
```

---

### Task 4: Schema-migratie voor zendingnummer

**Files:**
- Create: `db/migrations/2026-08-07-zendingnummer.sql`
- Modify: `db/schema.sql` (add both columns to their `CREATE TABLE` statements, add the counter seed row)
- Modify: `src/components/beheer/BestellingenSection.tsx` (the `Bestelling` interface, lines ~28-38)
- Modify: `src/lib/useDrukkerZendingen.ts` (the `DrukkerZending` interface and the raw-row type/mapping)
- Test: none new in this task — this is a foundational schema/type task with no new behavior yet. Verified via existing suites staying green plus a manual `SELECT`.

**Interfaces:**
- Consumes: nothing.
- Produces: `Bestelling.zendingnummer?: string | null` and `DrukkerZending.zendingnummer?: string | null` — both **optional**, not required, so no existing test fixture across the whole test suite needs updating just to satisfy the type. `bestelheaders.zendingnummer` and `drukkerZendingen.zendingnummer` columns exist in the real (staging) database from this task onward. Task 5 needs the `counters` row `'zendingnummer'` to exist; Task 6 needs both table columns to exist; Task 7 needs the two TypeScript interface fields.

- [ ] **Step 1: Write the migration file**

Create `db/migrations/2026-08-07-zendingnummer.sql`:

```sql
-- Migration for zendingnummer (2026-08-07)
-- Run once against a database still on the pre-migration schema.
-- Both columns are nullable: existing bestellingen/zendingen from before this
-- migration never get a zendingnummer assigned retroactively. zendingnummer on
-- bestelheaders is a deliberate denormalized copy for display only -- the
-- existing bestellingIds-JSON zendinggenoten/afronden mechanism is untouched.
ALTER TABLE drukkerZendingen ADD COLUMN zendingnummer VARCHAR(20);
ALTER TABLE bestelheaders ADD COLUMN zendingnummer VARCHAR(20);
INSERT INTO counters (id, value) VALUES ('zendingnummer', 0);
```

- [ ] **Step 2: Update `db/schema.sql` to match**

In the `CREATE TABLE drukkerZendingen (...)` statement, add `zendingnummer VARCHAR(20),` right after the `id CHAR(36) PRIMARY KEY,` line, so it reads:

```sql
CREATE TABLE drukkerZendingen (
  id CHAR(36) PRIMARY KEY,
  zendingnummer VARCHAR(20),
  drukkerId CHAR(36) NOT NULL,
  verzondenOp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  onderwerp VARCHAR(255),
  body TEXT,
  bestellingIds JSON,
  aantalKlanten INT NOT NULL DEFAULT 0,
  aantalRegels INT NOT NULL DEFAULT 0,
  verzondDoor VARCHAR(255),
  FOREIGN KEY (drukkerId) REFERENCES drukkers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

In the `CREATE TABLE bestelheaders (...)` statement, add `zendingnummer VARCHAR(20),` right after the `status VARCHAR(50) NOT NULL DEFAULT 'Te beoordelen',` line, so it reads:

```sql
CREATE TABLE bestelheaders (
  id CHAR(36) PRIMARY KEY,
  klantId CHAR(36) NOT NULL,
  bestelnr VARCHAR(20) NOT NULL,
  besteldatum TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) NOT NULL DEFAULT 'Te beoordelen',
  zendingnummer VARCHAR(20),
  FOREIGN KEY (klantId) REFERENCES klanten(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Right after the existing `INSERT INTO counters (id, value) VALUES ('bestelnummer', 0);` line, add:

```sql
INSERT INTO counters (id, value) VALUES ('zendingnummer', 0);
```

- [ ] **Step 3: Update the TypeScript types**

In `src/components/beheer/BestellingenSection.tsx`, the `Bestelling` interface currently reads (lines 28-38):

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

Add one optional field, right after `bestelnr`:

```ts
export interface Bestelling {
  id: string;
  klantId: string;
  companyName: string;
  bestelnr: string;
  zendingnummer?: string | null;
  besteldatum: string;
  status: 'Te beoordelen' | 'Te versturen naar drukker' | 'Verstuurd naar drukker' | 'Afgerond' | 'Afgewezen';
  lineCount: number;
  totalQuantity: number;
  lines: BestellingLine[];
}
```

In `src/lib/useDrukkerZendingen.ts`, the `DrukkerZending` interface currently reads:

```ts
export interface DrukkerZending {
  id: string;
  verzondenOp: Date | null;
  onderwerp: string;
  body: string;
  bestellingIds: string[];
  aantalKlanten: number;
  aantalRegels: number;
  verzondDoor: string;
}
```

Add one optional field:

```ts
export interface DrukkerZending {
  id: string;
  verzondenOp: Date | null;
  onderwerp: string;
  body: string;
  bestellingIds: string[];
  aantalKlanten: number;
  aantalRegels: number;
  verzondDoor: string;
  zendingnummer?: string | null;
}
```

The raw-row type inside `load()` (the `Array<{ id: string; verzondenOp: string | null; ... }>` annotation on `rows`) and the `rows.map((row) => ({ ... }))` mapping are both left exactly as they are in this task — Task 7 is where the actual mapping of this new field happens; this task only adds the field to the two interfaces above so the type exists ahead of time. (This keeps the two concerns — "the field exists on the type" vs. "the field is actually read from the API" — as two separate, individually reviewable steps.)

- [ ] **Step 4: Apply the migration to the local/staging database**

The test suite and local dev both connect to the real shared staging MySQL database (see `CLAUDE.md`) — the two new columns and the counter row must actually exist there before Task 5's tests can pass. Write a throwaway script (do NOT commit this file):

Create `scratch-migrate-zendingnummer.mjs` in the project root:

```js
import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const conn = await mysql.createConnection({
  host: env.DB_HOST,
  port: Number(env.DB_PORT),
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
});

await conn.query('ALTER TABLE drukkerZendingen ADD COLUMN zendingnummer VARCHAR(20)');
await conn.query('ALTER TABLE bestelheaders ADD COLUMN zendingnummer VARCHAR(20)');
await conn.query("INSERT INTO counters (id, value) VALUES ('zendingnummer', 0)");
console.log('Migration applied.');
await conn.end();
```

Run: `node scratch-migrate-zendingnummer.mjs`
Expected output: `Migration applied.`

**Only run this against staging** (what `.env.local` points to) — never against production. A production migration is a separate, explicit-permission step per `CLAUDE.md`, not part of this plan.

If this errors with something like "Duplicate column name" or "Duplicate entry ... for key 'PRIMARY'", the migration already ran (e.g. a retry) — that's the expected, safe failure mode, not a bug to work around; verify with Step 5 below and move on.

After it succeeds, delete the throwaway script: `rm scratch-migrate-zendingnummer.mjs` (it must not be committed).

- [ ] **Step 5: Verify the migration and that nothing broke**

Run: `npx vitest run tests/app/api/bestelheaders.test.ts tests/app/api/drukkerZendingen.test.ts`
Expected: PASS — both existing suites are unaffected by two new nullable columns (neither does a strict full-row equality check that a new column would break — confirmed during planning).

Run: `npx tsc --noEmit`
Expected: no new errors introduced by the two optional-field additions (there may be pre-existing, unrelated errors in `tests/regression/staging-scenarios.test.ts` — those are not part of this task).

- [ ] **Step 6: Commit**

```bash
git add db/migrations/2026-08-07-zendingnummer.sql db/schema.sql src/components/beheer/BestellingenSection.tsx src/lib/useDrukkerZendingen.ts
git commit -m "feat: schema en types voor het nieuwe zendingnummer"
```

---

### Task 5: Route om een zendingnummer te reserveren

**Files:**
- Create: `src/app/api/drukkers/[id]/zendingen/nummer/route.ts`
- Test: `tests/app/api/drukkers/zendingen-nummer.test.ts`

**Interfaces:**
- Consumes: the `counters` row `'zendingnummer'` from Task 4.
- Produces: `POST /api/drukkers/[id]/zendingen/nummer` → `201`-less `200` JSON response `{ zendingnummer: string }` on success (format `ZD-00001`), `401` without a medewerker session, `500` on a database error. Task 6 calls this exact endpoint and reads `zendingnummer` off the JSON body.

- [ ] **Step 1: Write the failing tests**

Create `tests/app/api/drukkers/zendingen-nummer.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { deleteRow, insertRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { POST as reserveerNummer } from '@/app/api/drukkers/[id]/zendingen/nummer/route';

const ZENDINGNUMMER_PADDING = 5;

async function nextExpectedZendingnummer(): Promise<string> {
  const [rows] = await getPool().query("SELECT value FROM counters WHERE id = 'zendingnummer'", []);
  const current = ((rows as Array<{ value: number }>)[0]?.value ?? 0) + 1;
  return `ZD-${String(current).padStart(ZENDINGNUMMER_PADDING, '0')}`;
}

describe('drukkerZendingen nummer route', () => {
  const createdDrukkerIds: string[] = [];

  afterEach(async () => {
    while (createdDrukkerIds.length > 0) {
      await deleteRow('drukkers', createdDrukkerIds.pop()!);
    }
    await getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'staff-1'");
  });

  it('rejects reserving a nummer without a medewerker session', async () => {
    const drukker = await insertRow<{ id: string }>('drukkers', { naam: 'PrintCo' } as never);
    createdDrukkerIds.push(drukker.id);
    const response = await reserveerNummer(new Request('http://localhost/api', { method: 'POST' }), {
      params: { id: drukker.id },
    });
    expect(response.status).toBe(401);
  });

  it('reserves increasing ZD-numbers on consecutive calls', async () => {
    const drukker = await insertRow<{ id: string }>('drukkers', { naam: 'PrintCo' } as never);
    createdDrukkerIds.push(drukker.id);
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;

    const eerste = await nextExpectedZendingnummer();
    const response1 = await reserveerNummer(
      new Request('http://localhost/api', { method: 'POST', headers: { cookie } }),
      { params: { id: drukker.id } }
    );
    expect(response1.status).toBe(200);
    expect(await response1.json()).toEqual({ zendingnummer: eerste });

    const tweede = await nextExpectedZendingnummer();
    const response2 = await reserveerNummer(
      new Request('http://localhost/api', { method: 'POST', headers: { cookie } }),
      { params: { id: drukker.id } }
    );
    expect(await response2.json()).toEqual({ zendingnummer: tweede });
    expect(tweede).not.toBe(eerste);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/app/api/drukkers/zendingen-nummer.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/drukkers/[id]/zendingen/nummer/route'` (the route doesn't exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `src/app/api/drukkers/[id]/zendingen/nummer/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { requireMedewerker } from '@/lib/server/requireAuth';

const ZENDINGNUMMER_PADDING = 5;

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  void params.id;

  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('UPDATE counters SET value = value + 1 WHERE id = ?', ['zendingnummer']);
    const [valueRows] = await connection.query('SELECT value FROM counters WHERE id = ?', ['zendingnummer']);
    const nextValue = (valueRows as Array<{ value: number }>)[0].value;
    const zendingnummer = `ZD-${String(nextValue).padStart(ZENDINGNUMMER_PADDING, '0')}`;
    await connection.commit();
    return NextResponse.json({ zendingnummer });
  } catch {
    await connection.rollback();
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  } finally {
    connection.release();
  }
}
```

`params.id` (the drukkerId) is unused — the number sequence is global across all drukkers, exactly like `bestelnr` is global across all klanten. The route is nested under `/drukkers/[id]/` purely for URL consistency with the sibling `.../zendingen` archive route, matching how the design describes it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/app/api/drukkers/zendingen-nummer.test.ts`
Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/drukkers/\[id\]/zendingen/nummer/route.ts tests/app/api/drukkers/zendingen-nummer.test.ts
git commit -m "feat: route om atomisch een zendingnummer te reserveren"
```

---

### Task 6: Zendingnummer gebruiken bij het versturen

**Files:**
- Modify: `src/components/beheer/VersturenNaarDrukkerDialog.tsx`
- Test: `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx` (full-file overwrite — see Step 1)

**Interfaces:**
- Consumes: `POST /api/drukkers/[id]/zendingen/nummer` from Task 5, returning `{ zendingnummer: string }`.
- Produces: the mail's onderwerp sent to the drukker becomes `${zendingnummer} — ${mail.subject}`; the archive POST body and every status-PATCH body include `zendingnummer`; `onVerstuurd` is called with bestellingen that also carry `zendingnummer`. `buildDrukkerMail.ts` itself is NOT touched by this task — it knows nothing about zendingnummers; this task only prefixes the already-built subject string before sending.

- [ ] **Step 1: Write the failing tests**

Overwrite `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx` with:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { VersturenNaarDrukkerDialog } from '@/components/beheer/VersturenNaarDrukkerDialog';
import type { Bestelling } from '@/components/beheer/BestellingenSection';
import type { Klant } from '@/components/beheer/KlantenSection';
import type { Bedrijfsgegevens } from '@/components/beheer/bedrijfsgegevensTypes';
import type { Drukker, Kunstwerk, Materiaal, Maat, Materiaalsoort } from '@/components/beheer/materiaalTypes';
import messages from '../../../messages/nl.json';

const BEDRIJFSGEGEVENS_SEED: Bedrijfsgegevens = {
  bezoekadres: 'Den Heuvel 21, 5688 EM Oirschot',
  email: 'info@glassartanddesign.com',
  whatsappNummer: '31600000000',
  tenaamstelling: 'Glassart & Design',
  bic: 'BANKNL2A',
  iban: 'NL00 BANK 0123 4567 89',
  kvkNummer: '12345678',
  btwNummer: 'NL123456789B01',
  openingstijden: { nl: '', en: '', fr: '', de: '' },
  contactpersonen: [],
};

const logActiviteitMock = vi.fn();
const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);

vi.mock('@/lib/useAdminAuth', () => ({
  useAdminAuth: () => ({ user: { uid: 'staff-1', email: 'paul@glassartanddesign.com' } }),
}));

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: (...args: unknown[]) => logActiviteitMock(...args),
  actorFromMedewerker: (user: { uid: string; email: string | null } | null) =>
    user
      ? { id: user.uid, email: user.email ?? 'Onbekend', naam: user.email ?? 'Onbekend' }
      : { id: null, email: 'Onbekend', naam: 'Onbekend' },
}));

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
  status: 'Goedgekeurd',
  prijsgroepId: 'pg-1',
  kunstenaarId: null,
};

const DRUKKERS: Drukker[] = [
  { id: 'drukker-1', naam: 'Drukkerij Janssen', adres: 'Perslaan 1', postcode: '1000 AA', plaats: 'Utrecht', email: 'info@janssen.nl', prijsafspraken: '' },
];

const DRUKKERS_MET_STANDAARD: Drukker[] = [
  { id: 'drukker-1', naam: 'Drukkerij Janssen', adres: 'Perslaan 1', postcode: '1000 AA', plaats: 'Utrecht', email: 'info@janssen.nl', prijsafspraken: '' },
  { id: 'drukker-2', naam: 'Drukkerij Tweede', adres: 'Perslaan 2', postcode: '1000 AB', plaats: 'Utrecht', email: 'info@tweede.nl', prijsafspraken: '', standaard: true },
];

const KUNSTWERKEN: Kunstwerk[] = [
  { id: 'kw-1', foto: 'https://example.com/hotel-paneel.jpg', naam: 'Hotel paneel', kunstenaarId: null, segmentIds: [], materiaalIds: ['mat-1'], maatIds: ['maat-1'], omschrijvingNl: 'Hotel paneel', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
];
const MATERIALEN: Materiaal[] = [{ id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 6, omschrijving: 'Helder' }];
const MATEN: Maat[] = [{ id: 'maat-1', breedte: 40, hoogte: 60 }];
const MATERIAALSOORTEN: Materiaalsoort[] = [{ id: 'soort-1', omschrijving: 'Glas' }];

const BESTELLING: Bestelling = {
  id: 'header-1',
  klantId: 'uid-1',
  companyName: 'Testbedrijf BV',
  bestelnr: 'GD-00201',
  besteldatum: '1-7-2026',
  status: 'Te versturen naar drukker',
  lineCount: 1,
  totalQuantity: 2,
  lines: [{ id: 'line-1', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
};

const BESTELLING_2: Bestelling = {
  id: 'header-2',
  klantId: 'uid-1',
  companyName: 'Testbedrijf BV',
  bestelnr: 'GD-00202',
  besteldatum: '2-7-2026',
  status: 'Te versturen naar drukker',
  lineCount: 1,
  totalQuantity: 1,
  lines: [{ id: 'line-2', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
};

function renderDialog(overrides: Partial<React.ComponentProps<typeof VersturenNaarDrukkerDialog>> = {}) {
  const onClose = vi.fn();
  const onVerstuurd = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <VersturenNaarDrukkerDialog
        isOpen
        onClose={onClose}
        bestellingen={[BESTELLING]}
        klanten={[KLANT]}
        drukkers={DRUKKERS}
        kunstwerken={KUNSTWERKEN}
        materialen={MATERIALEN}
        maten={MATEN}
        materiaalsoorten={MATERIAALSOORTEN}
        onVerstuurd={onVerstuurd}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  return { onClose, onVerstuurd };
}

// Renders and waits for the bedrijfsgegevens fetch to resolve, so `mail` is
// populated and Versturen is only disabled for reasons the test cares about
// (not the transient loading window every test would otherwise race against).
async function renderReadyDialog(overrides: Partial<React.ComponentProps<typeof VersturenNaarDrukkerDialog>> = {}) {
  const result = renderDialog(overrides);
  await waitFor(() => expect(screen.getByTestId('drukker-versturen-preview')).toHaveTextContent('Testbedrijf BV'));
  return result;
}

function zendingCall() {
  return fetchMock.mock.calls.find((call) => (call[0] as string) === '/api/drukkers/drukker-1/zendingen');
}

function statusCallFor(headerId: string) {
  return fetchMock.mock.calls.find((call) => (call[0] as string) === `/api/bestelheaders/${headerId}`);
}

function mailCallPayload() {
  const call = fetchMock.mock.calls.find((call) => (call[0] as string) === 'https://example.com/mail.php');
  return call ? JSON.parse((call[1] as { body: string }).body) : undefined;
}

function defaultFetchImplementation(url: string) {
  if (url === 'https://example.com/mail.php') return { ok: true };
  if (url === '/api/instellingen/bedrijfsgegevens') return { ok: true, json: async () => BEDRIJFSGEGEVENS_SEED };
  if (url === '/api/drukkers/drukker-1/zendingen/nummer') return { ok: true, json: async () => ({ zendingnummer: 'ZD-00001' }) };
  if (url === '/api/drukkers/drukker-1/zendingen') return { ok: true, json: async () => ({ ok: true }) };
  return { ok: true, json: async () => ({ ok: true }) };
}

beforeEach(() => {
  logActiviteitMock.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => defaultFetchImplementation(url));
  vi.stubEnv('NEXT_PUBLIC_MAIL_ENDPOINT_URL', 'https://example.com/mail.php');
  vi.stubEnv('NEXT_PUBLIC_MAIL_SECRET', 'test-secret');
});

describe('VersturenNaarDrukkerDialog', () => {
  it('pre-selects the only drukker and shows the full e-mail preview, including a line thumbnail', async () => {
    renderDialog();
    expect(screen.getByTestId('drukker-versturen-drukker')).toHaveValue('drukker-1');
    await waitFor(() => expect(screen.getByTestId('drukker-versturen-preview')).toHaveTextContent('Testbedrijf BV'));
    expect(screen.getByTestId('drukker-versturen-preview')).toHaveTextContent('Hotel paneel');
    expect(screen.getByTestId('drukker-versturen-preview').querySelector('img')).toHaveAttribute(
      'src',
      'https://example.com/hotel-paneel.jpg'
    );
  });

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

  it('shows the mail subject without a zendingnummer in the preview, with a note that one is assigned on send', async () => {
    await renderReadyDialog();
    const onderwerpRegel = screen.getByTestId('drukker-versturen-onderwerp');
    expect(onderwerpRegel).toHaveTextContent('Nieuwe order(s) voor de drukker');
    expect(onderwerpRegel).toHaveTextContent('zendingnummer wordt toegekend bij verzenden');
    expect(onderwerpRegel).not.toHaveTextContent('ZD-');
  });

  it('reserves a zendingnummer before sending, and prefixes the mail subject, archive onderwerp, and status-updates with it', async () => {
    const { onVerstuurd } = await renderReadyDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/drukkers/drukker-1/zendingen/nummer',
        expect.objectContaining({ method: 'POST' })
      )
    );
    await waitFor(() => expect(mailCallPayload()).toBeDefined());
    expect(mailCallPayload().subject).toMatch(/^ZD-00001 — Nieuwe order\(s\) voor de drukker/);

    await waitFor(() => expect(zendingCall()).toBeDefined());
    const zendingBody = JSON.parse((zendingCall()![1] as { body: string }).body);
    expect(zendingBody.zendingnummer).toBe('ZD-00001');
    expect(zendingBody.onderwerp).toMatch(/^ZD-00001 — /);

    await waitFor(() => expect(statusCallFor('header-1')).toBeDefined());
    expect(JSON.parse((statusCallFor('header-1')![1] as { body: string }).body)).toEqual({
      status: 'Verstuurd naar drukker',
      zendingnummer: 'ZD-00001',
    });

    await waitFor(() =>
      expect(onVerstuurd).toHaveBeenCalledWith([{ ...BESTELLING, status: 'Verstuurd naar drukker', zendingnummer: 'ZD-00001' }])
    );
  });

  it('shows the mail error and never sends when reserving a zendingnummer fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/drukkers/drukker-1/zendingen/nummer') return { ok: false };
      return defaultFetchImplementation(url);
    });
    await renderReadyDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

    expect(await screen.findByTestId('drukker-versturen-error')).toHaveTextContent(
      'Het versturen van de e-mail is mislukt. Probeer het opnieuw.'
    );
    expect(fetchMock).not.toHaveBeenCalledWith('https://example.com/mail.php', expect.anything());
  });

  it('sends the mail with both a plain-text and an html body, including the Glassart & Design invoice footer, updates statuses, saves a zending, logs the activiteit, and closes', async () => {
    const { onVerstuurd, onClose } = await renderReadyDialog();

    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('https://example.com/mail.php', expect.objectContaining({ method: 'POST' }))
    );
    expect(mailCallPayload()).toMatchObject({
      to: 'info@janssen.nl',
      subject: expect.stringContaining('Nieuwe order(s) voor de drukker'),
      body: expect.stringContaining('Testbedrijf BV'),
      html: expect.stringContaining('<img src="https://example.com/hotel-paneel.jpg"'),
    });
    expect(mailCallPayload().body).toContain(BEDRIJFSGEGEVENS_SEED.bezoekadres);
    expect(mailCallPayload().html).toContain(BEDRIJFSGEGEVENS_SEED.kvkNummer);
    await waitFor(() =>
      expect(statusCallFor('header-1')).toEqual([
        '/api/bestelheaders/header-1',
        expect.objectContaining({ method: 'PATCH' }),
      ])
    );
    await waitFor(() => expect(zendingCall()).toBeDefined());
    expect(JSON.parse((zendingCall()![1] as { body: string }).body)).toMatchObject({
      bestellingIds: ['header-1'],
      aantalKlanten: 1,
      aantalRegels: 1,
      verzondDoor: 'paul@glassartanddesign.com',
    });
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'bestelling_verstuurd_naar_drukker',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'GD-00201'
    );
    expect(onVerstuurd).toHaveBeenCalledWith([{ ...BESTELLING, status: 'Verstuurd naar drukker', zendingnummer: 'ZD-00001' }]);
    expect(onClose).toHaveBeenCalled();
  });

  it('joins bestelnummers with a comma when sending a batch of multiple bestellingen', async () => {
    await renderReadyDialog({ bestellingen: [BESTELLING, BESTELLING_2] });

    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'bestelling_verstuurd_naar_drukker',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'GD-00201, GD-00202'
      )
    );
  });

  it('shows an error and does not update anything when the mail request fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/mail.php') return { ok: false };
      return defaultFetchImplementation(url);
    });
    const { onVerstuurd } = await renderReadyDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));
    expect(await screen.findByTestId('drukker-versturen-error')).toHaveTextContent(
      'Het versturen van de e-mail is mislukt. Probeer het opnieuw.'
    );
    expect(statusCallFor('header-1')).toBeUndefined();
    expect(onVerstuurd).not.toHaveBeenCalled();
  });

  it('shows a distinct error when the mail sends but the status update fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/mail.php') return { ok: true };
      if (url === '/api/drukkers/drukker-1/zendingen/nummer') return { ok: true, json: async () => ({ zendingnummer: 'ZD-00001' }) };
      if (url === '/api/drukkers/drukker-1/zendingen') return { ok: true, json: async () => ({ ok: true }) };
      if (url === '/api/instellingen/bedrijfsgegevens') return { ok: true, json: async () => BEDRIJFSGEGEVENS_SEED };
      return { ok: false };
    });
    await renderReadyDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));
    expect(await screen.findByTestId('drukker-versturen-error')).toHaveTextContent(
      'De e-mail is verzonden, maar het bijwerken van de bestellingen is mislukt. Verstuur niet opnieuw — controleer de statussen handmatig.'
    );
  });

  it('saves the zending archive record before updating the bestelling statuses', async () => {
    const callOrder: string[] = [];
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/mail.php') return { ok: true };
      if (url === '/api/instellingen/bedrijfsgegevens') return { ok: true, json: async () => BEDRIJFSGEGEVENS_SEED };
      if (url === '/api/drukkers/drukker-1/zendingen/nummer') return { ok: true, json: async () => ({ zendingnummer: 'ZD-00001' }) };
      if (url === '/api/drukkers/drukker-1/zendingen') {
        callOrder.push('zending');
        return { ok: true, json: async () => ({ ok: true }) };
      }
      callOrder.push('status');
      return { ok: true, json: async () => ({ ok: true }) };
    });
    await renderReadyDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

    await waitFor(() => expect(callOrder).toContain('status'));
    expect(callOrder).toEqual(['zending', 'status']);
  });

  it('archives the zending even when the subsequent status update fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/mail.php') return { ok: true };
      if (url === '/api/instellingen/bedrijfsgegevens') return { ok: true, json: async () => BEDRIJFSGEGEVENS_SEED };
      if (url === '/api/drukkers/drukker-1/zendingen/nummer') return { ok: true, json: async () => ({ zendingnummer: 'ZD-00001' }) };
      if (url === '/api/drukkers/drukker-1/zendingen') return { ok: true, json: async () => ({ ok: true }) };
      return { ok: false };
    });
    await renderReadyDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

    await screen.findByTestId('drukker-versturen-error');
    expect(zendingCall()).toBeDefined();
  });

  it('disables Versturen once a mail has been sent, even if the dialog stays open, preventing a duplicate send', async () => {
    await renderReadyDialog();
    const versturenButton = screen.getByTestId('drukker-versturen-versturen');
    fireEvent.click(versturenButton);

    await waitFor(() => expect(statusCallFor('header-1')).toBeDefined());
    await waitFor(() => expect(versturenButton).toBeDisabled());

    fireEvent.click(versturenButton);
    expect(fetchMock.mock.calls.filter((call) => (call[0] as string) !== '/api/instellingen/bedrijfsgegevens')).toHaveLength(4);
  });

  it('disables Versturen as soon as the mail POST succeeds, before the zending/status writes settle', async () => {
    let resolveZending: () => void = () => {};
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/mail.php') return { ok: true };
      if (url === '/api/instellingen/bedrijfsgegevens') return { ok: true, json: async () => BEDRIJFSGEGEVENS_SEED };
      if (url === '/api/drukkers/drukker-1/zendingen/nummer') return { ok: true, json: async () => ({ zendingnummer: 'ZD-00001' }) };
      if (url === '/api/drukkers/drukker-1/zendingen') {
        return new Promise((resolve) => {
          resolveZending = () => resolve({ ok: true, json: async () => ({ ok: true }) });
        });
      }
      return { ok: true, json: async () => ({ ok: true }) };
    });
    await renderReadyDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

    await waitFor(() => expect(screen.getByTestId('drukker-versturen-versturen')).toBeDisabled());
    resolveZending();
  });

  it('disables Versturen and shows a message when a selected bestelling has no matching klant', () => {
    renderDialog({ klanten: [] });
    expect(screen.getByTestId('drukker-versturen-versturen')).toBeDisabled();
    expect(screen.getByTestId('drukker-versturen-klant-ontbreekt')).toHaveTextContent(
      'Klantgegevens ontbreken voor 1 bestelling(en) — kan niet verstuurd worden.'
    );
  });

  it('disables Versturen and shows an error when the bedrijfsgegevens fail to load', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/instellingen/bedrijfsgegevens') return { ok: false };
      return defaultFetchImplementation(url);
    });
    renderDialog();
    await waitFor(() => expect(screen.getByTestId('drukker-versturen-versturen')).toBeDisabled());
    expect(screen.getByTestId('drukker-versturen-bedrijfsgegevens-fout')).toHaveTextContent(
      'Bedrijfsgegevens van Glassart & Design konden niet worden geladen — kan niet verstuurd worden.'
    );
  });

  it('does not disable Versturen or show the klant-ontbreken message when all klanten are present', async () => {
    await renderReadyDialog();
    expect(screen.queryByTestId('drukker-versturen-klant-ontbreekt')).not.toBeInTheDocument();
    expect(screen.getByTestId('drukker-versturen-versturen')).not.toBeDisabled();
  });

  it('cannot be dismissed via Annuleren while a send is in flight', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/instellingen/bedrijfsgegevens') return { ok: true, json: async () => BEDRIJFSGEGEVENS_SEED };
      return new Promise(() => {});
    });
    const { onClose } = await renderReadyDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

    await waitFor(() => expect(screen.getByTestId('drukker-versturen-annuleren')).toBeDisabled());
    fireEvent.click(screen.getByTestId('drukker-versturen-annuleren'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the required-field legend', () => {
    renderDialog();
    expect(screen.getByTestId('drukker-versturen-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });

  describe('onvolledige bedrijfsgegevens', () => {
    // Het Bedrijfsgegevens-type belooft tien verplichte strings, maar de data
    // komt als losse JSON-blob uit `instellingen` en wordt nergens gevalideerd.
    // Een record dat bestaat maar velden mist is dus een reële situatie --
    // zeker sinds de seeds weg zijn en niets die gaten meer opvult.
    function mockOnvolledig(ontbrekend: Partial<Record<string, undefined>>) {
      fetchMock.mockImplementation(async (url: string) => {
        if (url === '/api/instellingen/bedrijfsgegevens') {
          return { ok: true, json: async () => ({ ...BEDRIJFSGEGEVENS_SEED, ...ontbrekend }) };
        }
        return { ok: true, json: async () => ({}) };
      });
    }

    it('blocks sending and names the missing field instead of mailing a blank factuurvoetje', async () => {
      mockOnvolledig({ kvkNummer: undefined });
      renderDialog();

      const melding = await screen.findByTestId('drukker-versturen-bedrijfsgegevens-onvolledig');
      expect(melding).toHaveTextContent('KVK-nummer');
      expect(screen.getByTestId('drukker-versturen-versturen')).toBeDisabled();
    });

    it('lists every missing field, not just the first', async () => {
      mockOnvolledig({ kvkNummer: undefined, btwNummer: undefined });
      renderDialog();

      const melding = await screen.findByTestId('drukker-versturen-bedrijfsgegevens-onvolledig');
      expect(melding).toHaveTextContent('KVK-nummer');
      expect(melding).toHaveTextContent('btw-nummer');
    });

    it('treats a blank value the same as an absent one', async () => {
      fetchMock.mockImplementation(async (url: string) => {
        if (url === '/api/instellingen/bedrijfsgegevens') {
          return { ok: true, json: async () => ({ ...BEDRIJFSGEGEVENS_SEED, bezoekadres: '   ' }) };
        }
        return { ok: true, json: async () => ({}) };
      });
      renderDialog();

      expect(await screen.findByTestId('drukker-versturen-bedrijfsgegevens-onvolledig')).toHaveTextContent('bezoekadres');
      expect(screen.getByTestId('drukker-versturen-versturen')).toBeDisabled();
    });

    it('explains that the record is missing entirely instead of leaving a dead grey button', async () => {
      // useApiRecord mapt een 404 op data: null, error: null -- zonder aparte
      // melding zag de medewerker alleen een uitgeschakelde knop.
      fetchMock.mockImplementation(async (url: string) => {
        if (url === '/api/instellingen/bedrijfsgegevens') return { ok: false, status: 404 };
        return { ok: true, json: async () => ({}) };
      });
      renderDialog();

      expect(await screen.findByTestId('drukker-versturen-bedrijfsgegevens-ontbreekt')).toBeInTheDocument();
      expect(screen.getByTestId('drukker-versturen-versturen')).toBeDisabled();
    });

    it('does not complain when the record is complete', async () => {
      await renderReadyDialog();
      expect(screen.queryByTestId('drukker-versturen-bedrijfsgegevens-onvolledig')).not.toBeInTheDocument();
      expect(screen.getByTestId('drukker-versturen-versturen')).not.toBeDisabled();
    });
  });
});
```

Notable, deliberate changes from the previous version of this file:
- `defaultFetchImplementation` gained a branch for `/api/drukkers/drukker-1/zendingen/nummer`, and every test-level override that fully replaces `fetchMock.mockImplementation` (rather than delegating to `defaultFetchImplementation`) got the same branch added explicitly.
- The "cannot be dismissed via Annuleren..." test needed NO change beyond confirming its catch-all `new Promise(() => {})` also covers the reservation call — that's exactly the desired behavior (reservation never resolves, so the send never proceeds past it, so `isSending` stays `true` for the whole test, which is what the test checks).
- The one-mail-request-count assertion in "disables Versturen once a mail has been sent..." changed from `toHaveLength(3)` to `toHaveLength(4)`: one successful send now makes 4 non-bedrijfsgegevens calls (reserve nummer, mail.php, zending archive, status PATCH) instead of 3.
- `tests/components/beheer/BestellingenSection.test.tsx` is deliberately NOT touched by this task: its one test asserting on the object `onBestellingUpdated` receives (`toEqual({ ...TE_VERSTUREN, status: 'Verstuurd naar drukker' })`) still passes unmodified, because that file's shared fetch mock returns a bare `{}` for the new reservation call, so `zendingnummer` resolves to `undefined` there — and `toEqual` (unlike `toStrictEqual`) treats an `undefined`-valued extra property as equal to that property being absent.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx`
Expected: FAIL — the component doesn't call the reservation endpoint yet, so `drukker-versturen-onderwerp` doesn't exist, the subject has no `ZD-` prefix, and the request-count assertion is off by one.

- [ ] **Step 3: Write the minimal implementation**

In `src/components/beheer/VersturenNaarDrukkerDialog.tsx`, replace the `handleVersturen` function (currently starting at `async function handleVersturen() {`) with:

```ts
  async function handleVersturen() {
    const drukker = drukkers.find((d) => d.id === drukkerId);
    const endpoint = process.env.NEXT_PUBLIC_MAIL_ENDPOINT_URL;
    const secret = process.env.NEXT_PUBLIC_MAIL_SECRET;
    if (!drukker || !endpoint || !secret || !mail || heeftOntbrekendeKlantgegevens) {
      setError(t('drukkerVersturenMailError'));
      return;
    }

    setIsSending(true);
    setError(null);

    let zendingnummer: string;
    try {
      const nummerResponse = await fetch(`/api/drukkers/${drukkerId}/zendingen/nummer`, { method: 'POST' });
      if (!nummerResponse.ok) throw new Error('nummer reservation failed');
      const nummerData = (await nummerResponse.json()) as { zendingnummer: string };
      zendingnummer = nummerData.zendingnummer;
    } catch {
      setError(t('drukkerVersturenMailError'));
      setIsSending(false);
      return;
    }

    const subjectMetZendingnummer = `${zendingnummer} — ${mail.subject}`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, to: drukker.email, subject: subjectMetZendingnummer, body: mail.text, html: mail.html }),
      });
      if (!response.ok) {
        setError(t('drukkerVersturenMailError'));
        setIsSending(false);
        return;
      }
    } catch {
      setError(t('drukkerVersturenMailError'));
      setIsSending(false);
      return;
    }

    setMailSent(true);

    try {
      const zendingResponse = await fetch(`/api/drukkers/${drukkerId}/zendingen`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          onderwerp: subjectMetZendingnummer,
          body: mail.text,
          bestellingIds: bestellingen.map((b) => b.id),
          aantalKlanten: new Set(bestellingen.map((b) => b.klantId)).size,
          aantalRegels: bestellingen.reduce((sum, b) => sum + b.lineCount, 0),
          verzondDoor: user?.email ?? 'Onbekend',
          zendingnummer,
        }),
      });
      if (!zendingResponse.ok) throw new Error('zending create failed');
      const results = await Promise.all(
        bestellingen.map((bestelling) =>
          fetch(`/api/bestelheaders/${bestelling.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ status: 'Verstuurd naar drukker', zendingnummer }),
          })
        )
      );
      if (results.some((response) => !response.ok)) throw new Error('status update failed');
      void logActiviteit(
        'bestelling_verstuurd_naar_drukker',
        actorFromMedewerker(user),
        bestellingen.map((b) => b.bestelnr).join(', ')
      );
      onVerstuurd(bestellingen.map((b) => ({ ...b, status: 'Verstuurd naar drukker' as const, zendingnummer })));
      onClose();
    } catch {
      setError(t('drukkerVersturenStatusError'));
    } finally {
      setIsSending(false);
    }
  }
```

Then change the preview's subject line (currently `<p className="text-xs text-white/70">{mail?.subject}</p>`) to:

```tsx
          <p data-testid="drukker-versturen-onderwerp" className="text-xs text-white/70">
            {mail?.subject}
            {mail && <span className="text-white/40"> · {t('drukkerVersturenZendingnummerToelichting')}</span>}
          </p>
```

Finally, add one new key to `messages/nl.json`, right after `"drukkerVersturenBedrijfsgegevensOntbreekt": "...",`:

```json
    "drukkerVersturenZendingnummerToelichting": "zendingnummer wordt toegekend bij verzenden",
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx`
Expected: PASS — all tests in the file green.

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npm test`
Expected: PASS. In particular, confirm `tests/components/beheer/BestellingenSection.test.tsx` stays green unmodified (see the reasoning in Step 1 above) and `tests/app/api/drukkerZendingen.test.ts` stays green (it never sends a `zendingnummer` field itself, and `insertRow` silently omits unset optional columns — a POST without `zendingnummer` in the body leaves that column `NULL`, matching a pre-migration row).

- [ ] **Step 6: Commit**

```bash
git add src/components/beheer/VersturenNaarDrukkerDialog.tsx messages/nl.json tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx
git commit -m "feat: reserveer en gebruik een zendingnummer bij het versturen naar de drukker"
```

---

### Task 7: Zendingnummer tonen

**Files:**
- Modify: `src/lib/useDrukkerZendingen.ts` (raw-row type + mapping — the interface field already exists from Task 4)
- Modify: `src/components/beheer/DrukkerModal.tsx` (zending-samenvatting)
- Modify: `src/components/beheer/BestellingenSection.tsx` (second new column, after Task 1's `bestelnr` column)
- Modify: `src/components/beheer/BestellingModal.tsx` (extra subtitle line)
- Modify: `messages/nl.json` (new key `bestellingenColZendingnummer`)
- Test: `tests/lib/useDrukkerZendingen.test.ts`, `tests/components/beheer/DrukkerModal.test.tsx`, `tests/components/beheer/BestellingenSection.test.tsx`, `tests/components/beheer/BestellingModal.test.tsx`

**Interfaces:**
- Consumes: `Bestelling.zendingnummer?: string | null` and `DrukkerZending.zendingnummer?: string | null` (both from Task 4); the actual `zendingnummer` values now genuinely populated by Task 6's `handleVersturen`.
- Produces: nothing further — this is the last task.

- [ ] **Step 1: Write the failing tests**

In `tests/lib/useDrukkerZendingen.test.ts`, update the existing `'fetches and maps zendingen for the given drukkerId'` test — add `zendingnummer: null` to the expected object (the mock response doesn't include it, so the hook must default to `null`):

```ts
  it('fetches and maps zendingen for the given drukkerId', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'zending-1',
          verzondenOp: '2026-07-24T10:00:00Z',
          onderwerp: 'Nieuwe order(s) voor de drukker – 24-7-2026',
          body: '== Testbedrijf BV ==\n...',
          bestellingIds: ['header-1'],
          aantalKlanten: 1,
          aantalRegels: 2,
          verzondDoor: 'paul@glassartanddesign.com',
        },
      ],
    });
    const { result } = renderHook(() => useDrukkerZendingen('drukker-1'));
    await waitFor(() => expect(result.current.zendingen).not.toBeNull());
    expect(result.current.zendingen).toEqual([
      {
        id: 'zending-1',
        verzondenOp: new Date('2026-07-24T10:00:00Z'),
        onderwerp: 'Nieuwe order(s) voor de drukker – 24-7-2026',
        body: '== Testbedrijf BV ==\n...',
        bestellingIds: ['header-1'],
        aantalKlanten: 1,
        aantalRegels: 2,
        verzondDoor: 'paul@glassartanddesign.com',
        zendingnummer: null,
      },
    ]);
    expect(result.current.error).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith('/api/drukkers/drukker-1/zendingen');
  });
```

Add one new test right after it:

```ts
  it('maps zendingnummer from the response when present', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'zending-2',
          verzondenOp: '2026-08-07T10:00:00Z',
          onderwerp: 'ZD-00007 — Nieuwe order(s) voor de drukker – 7-8-2026',
          body: '...',
          bestellingIds: ['header-2'],
          aantalKlanten: 1,
          aantalRegels: 1,
          verzondDoor: 'paul@glassartanddesign.com',
          zendingnummer: 'ZD-00007',
        },
      ],
    });
    const { result } = renderHook(() => useDrukkerZendingen('drukker-2'));
    await waitFor(() => expect(result.current.zendingen).not.toBeNull());
    expect(result.current.zendingen![0].zendingnummer).toBe('ZD-00007');
  });
```

In `tests/components/beheer/DrukkerModal.test.tsx`, add this test inside `describe('DrukkerModal zendingen', ...)`, right after the `'lists zendingen and expands one to show the full mail body'` test:

```ts
  it('shows the zendingnummer before the datum when present', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'zending-2',
          verzondenOp: '2026-08-07T10:00:00Z',
          onderwerp: 'ZD-00007 — Nieuwe order(s) voor de drukker – 7-8-2026',
          body: '...',
          bestellingIds: ['header-2'],
          aantalKlanten: 1,
          aantalRegels: 1,
          verzondDoor: 'paul@glassartanddesign.com',
          zendingnummer: 'ZD-00007',
        },
      ],
    });
    renderModal({ mode: 'edit', drukker: DRUKKER });
    const zendingRow = await screen.findByTestId('drukker-zending-zending-2');
    expect(zendingRow).toHaveTextContent('ZD-00007');
  });
```

In `tests/components/beheer/BestellingenSection.test.tsx`, add this test inside `describe('BestellingenSection', ...)`, right after Task 1's `'shows the bestelnummer in the table'` test:

```ts
  it('shows the zendingnummer once a bestelling has been sent, and nothing before that', () => {
    renderSection({
      bestellingen: [BESTELLINGEN[0], { ...BESTELLINGEN[1], zendingnummer: 'ZD-00007' }],
    });
    expect(screen.getByTestId('data-table-row-header-2')).toHaveTextContent('ZD-00007');
    expect(screen.getByTestId('data-table-row-header-1')).not.toHaveTextContent('ZD-');
  });
```

In `tests/components/beheer/BestellingModal.test.tsx`, add these two tests right after Task 2's `'shows the bestelnummer in the subtitle'` test:

```ts
  it('shows the zendingnummer in the subtitle when present', () => {
    renderModal({ ...BESTELLING, zendingnummer: 'ZD-00007' });
    expect(screen.getByTestId('modal-header')).toHaveTextContent('ZD-00007');
  });

  it('does not show a zendingnummer line when absent', () => {
    renderModal(BESTELLING);
    expect(screen.getByTestId('modal-header')).not.toHaveTextContent('ZD-');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run tests/lib/useDrukkerZendingen.test.ts tests/components/beheer/DrukkerModal.test.tsx tests/components/beheer/BestellingenSection.test.tsx tests/components/beheer/BestellingModal.test.tsx
```
Expected: FAIL — the updated `toEqual` in `useDrukkerZendingen.test.ts` fails because the mapping doesn't set `zendingnummer` yet, and every new test fails because nothing renders a zendingnummer anywhere yet.

- [ ] **Step 3: Write the minimal implementation**

In `src/lib/useDrukkerZendingen.ts`, update the raw-row type annotation and the mapping inside `load()`:

```ts
        const rows = (await response.json()) as Array<{
          id: string;
          verzondenOp: string | null;
          onderwerp: string;
          body: string;
          bestellingIds: string[];
          aantalKlanten: number;
          aantalRegels: number;
          verzondDoor: string;
          zendingnummer?: string | null;
        }>;
        if (cancelled) return;
        setZendingen(
          rows.map((row) => ({
            id: row.id,
            verzondenOp: row.verzondenOp ? new Date(row.verzondenOp) : null,
            onderwerp: row.onderwerp,
            body: row.body,
            bestellingIds: row.bestellingIds ?? [],
            aantalKlanten: row.aantalKlanten,
            aantalRegels: row.aantalRegels,
            verzondDoor: row.verzondDoor,
            zendingnummer: row.zendingnummer ?? null,
          }))
        );
```

In `src/components/beheer/DrukkerModal.tsx`, change the zending-samenvatting `<span>` (currently):

```tsx
                        <span>
                          {zending.verzondenOp ? zending.verzondenOp.toLocaleString('nl-NL') : ''} —{' '}
                          {t('drukkersZendingenSamenvatting', {
                            klanten: zending.aantalKlanten,
                            regels: zending.aantalRegels,
                          })}
                        </span>
```

to:

```tsx
                        <span>
                          {zending.zendingnummer && `${zending.zendingnummer} — `}
                          {zending.verzondenOp ? zending.verzondenOp.toLocaleString('nl-NL') : ''} —{' '}
                          {t('drukkersZendingenSamenvatting', {
                            klanten: zending.aantalKlanten,
                            regels: zending.aantalRegels,
                          })}
                        </span>
```

In `src/components/beheer/BestellingenSection.tsx`, add a second column right after Task 1's `bestelnr` column:

```ts
  const columns: Column<Bestelling>[] = [
    { key: 'bestelnr', label: t('bestellingenColBestelnummer') },
    { key: 'zendingnummer', label: t('bestellingenColZendingnummer'), render: (row) => row.zendingnummer ?? '' },
    { key: 'companyName', label: t('bestellingenColKlant') },
    { key: 'besteldatum', label: t('bestellingenColDatum') },
    {
      key: 'lineCount',
      label: t('bestellingenColAantal'),
      render: (row) => `${row.lineCount} / ${row.totalQuantity}`,
    },
    { key: 'status', label: t('bestellingenColStatus') },
  ];
```

In `src/components/beheer/BestellingModal.tsx`, add a conditional line right after the existing subtitle `<span>` (which now shows `bestelnr · companyName · besteldatum`):

```tsx
              <span>
                {bestelling.bestelnr} · {bestelling.companyName} · {bestelling.besteldatum}
              </span>
              {bestelling.zendingnummer && (
                <span className="text-xs text-white/50">{bestelling.zendingnummer}</span>
              )}
```

In `messages/nl.json`, add a new key right after `"bestellingenColBestelnummer": "Bestelnr.",`:

```json
    "bestellingenColBestelnummer": "Bestelnr.",
    "bestellingenColZendingnummer": "Zendingnr.",
    "bestellingenColKlant": "Klant",
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/lib/useDrukkerZendingen.test.ts tests/components/beheer/DrukkerModal.test.tsx tests/components/beheer/BestellingenSection.test.tsx tests/components/beheer/BestellingModal.test.tsx
```
Expected: PASS — all four files green.

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npm test`
Expected: PASS across all 100+ files.

- [ ] **Step 6: Commit**

```bash
git add src/lib/useDrukkerZendingen.ts src/components/beheer/DrukkerModal.tsx src/components/beheer/BestellingenSection.tsx src/components/beheer/BestellingModal.tsx messages/nl.json tests/lib/useDrukkerZendingen.test.ts tests/components/beheer/DrukkerModal.test.tsx tests/components/beheer/BestellingenSection.test.tsx tests/components/beheer/BestellingModal.test.tsx
git commit -m "feat: toon het zendingnummer in DrukkerModal, de Bestellingen-tabel en de Bestelgegevens-modal"
```

---

## After all tasks: manual browser verification

Open `npm run dev`, log in as medewerker, go to Bestellingen:
- Confirm the bestelnummer column and the Bestelgegevens-modal both show `GD-xxxxx`.
- Select one or more bestellingen with status "Te versturen naar drukker", open the dialog, confirm the preview shows the subject without a number plus the "zendingnummer wordt toegekend bij verzenden" note, and that the per-bestelling "Bestelling GD-xxxxx" headings appear correctly (test with a klant that has 2+ selected bestellingen, to see two headings in one klant-sectie).
- Actually send it (to a real or test drukker) and confirm: the mail's onderwerp starts with `ZD-00001` (or whatever the current counter value is), the bestellingen-tabel now shows that zendingnummer in its own column, the Bestelgegevens-modal shows it too, and `DrukkerModal`'s zending-lijst shows `ZD-00001 — {datum} — ...` for that shipment.
