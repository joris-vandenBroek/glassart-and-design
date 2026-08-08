# Schema Drift Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it impossible to deploy a commit whose database migrations have not been applied to the target database.

**Architecture:** A `schema_migrations` ledger table in each database records which migration files have run. A public read-only endpoint (`/api/health/schema`) reports that list. Both deploy workflows compare the repo's `db/migrations/` filenames against the endpoint before uploading anything and fail on a mismatch. Applying migrations stays a local, human-initiated action via `npm run db:migrate`, because the MySQL grants are IP-bound and GitHub runners can never reach the database.

**Tech Stack:** Node 20, TypeScript executed via `tsx` (already a devDependency), `mysql2/promise`, Next.js 14 App Router route handler, Vitest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-08-schema-drift-guard-design.md`

## Global Constraints

- **Scripts are TypeScript run with `tsx`**, not `.mjs`. This keeps them type-checked and importable from Vitest tests with ordinary imports, matching the rest of the repo. Scripts use relative imports only — the `@/` alias is a Next.js/tsconfig path that `tsx` does not resolve here.
- **Never a blanket `DELETE FROM` or `TRUNCATE` in a test.** Tests run against the real shared staging database. Every test cleans up exactly the rows it created, by exact key, in `afterEach`. A blanket delete on `schema_migrations` would destroy the real ledger. See the hard rule in `CLAUDE.md`.
- **Test fixture rows in `schema_migrations` carry `test` in their filename** and are always deleted by exact filename. Rows inserted directly by a test may use a free-form name (`test-2026-01-01-…`); rows that must survive `sorteerMigraties` have to match the migration pattern, so they take the form `2026-01-01-test-…​.sql`. Either way the cleanup targets the exact string, never a pattern and never the whole table.
- **The target environment is always an explicit positional argument** (`staging` or `productie`) with no default, in every script that connects to a database.
- **Any change to the production database requires asking the user first, every time.** Task 4 is the only task that touches production and it starts with that question.
- Migration filenames match `^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.sql$`. Alphabetical order equals chronological order; every caller depends on this.
- Dutch is used for user-facing script output and commit messages; code comments and this plan follow the repo's English convention for docs and comments.

## Deviation from the spec (deliberate)

The spec says the ledger table "gets its own bootstrap migration". **Do not create one.** A migration file containing `CREATE TABLE schema_migrations` is self-referential: the runner must already be able to read the ledger to know whether that migration is pending, and once the runner has created the table, running the file would fail on a duplicate table. Instead:

- `db/schema.sql` gains the table (so a database created from scratch has it).
- The runner issues `CREATE TABLE IF NOT EXISTS` before every operation (Task 2).

Everything else follows the spec as written.

## File Structure

| File | Responsibility |
| --- | --- |
| `scripts/lib/migrations.ts` | Pure functions: filename validation, sorting, pending calculation, SQL statement splitting. No I/O. |
| `scripts/lib/env.ts` | Resolve `staging`/`productie` to an env file and open a `mysql2` connection. |
| `scripts/lib/ledger.ts` | Create-if-missing and read the `schema_migrations` table. |
| `scripts/db-migrate.ts` | CLI: `status`, `apply`, `--confirm`, `--mark-applied`. |
| `scripts/check-migrations.ts` | CI gate: repo filenames vs the endpoint. No database access. |
| `scripts/db-diff.ts` | Local diagnostic: compare two environments' `information_schema`. |
| `src/app/api/health/schema/route.ts` | Public read-only endpoint returning the applied list. |
| `db/schema.sql` | Gains the `schema_migrations` table definition. |
| `.github/workflows/deploy-naar-*.yml` | Gain the gate step before upload. |
| `CLAUDE.md` | Documents the order of operations. |
| `tests/scripts/migrations.test.ts` | Unit tests for the pure functions. |
| `tests/scripts/ledger.test.ts` | Ledger helpers against the staging database. |
| `tests/app/api/health-schema.test.ts` | Endpoint test. |
| `tests/scripts/check-migrations.test.ts` | Gate logic against a stubbed `fetch`. |
| `scripts/lib/apply.ts` | The migration apply loop, as a testable function returning a result. |
| `tests/scripts/apply.test.ts` | Apply loop against the staging database via a fixture directory. |
| `tests/fixtures/migrations/` | Throwaway SQL used only by `apply.test.ts`, never by the CLI. |

---

### Task 1: Pure migration helpers

**Files:**
- Create: `scripts/lib/migrations.ts`
- Test: `tests/scripts/migrations.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `isMigrationFilename(name: string): boolean`
  - `sorteerMigraties(filenames: string[]): string[]`
  - `berekenOpenstaand(repoFilenames: string[], appliedFilenames: string[]): string[]`
  - `splitStatements(sql: string): string[]`

- [ ] **Step 1: Write the failing test**

Create `tests/scripts/migrations.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  berekenOpenstaand,
  isMigrationFilename,
  sorteerMigraties,
  splitStatements,
} from '../../scripts/lib/migrations';

describe('isMigrationFilename', () => {
  it('accepts a real migration filename', () => {
    expect(isMigrationFilename('2026-08-07-zendingnummer.sql')).toBe(true);
  });

  it('rejects anything without the date prefix or the .sql suffix', () => {
    expect(isMigrationFilename('zendingnummer.sql')).toBe(false);
    expect(isMigrationFilename('2026-08-07-zendingnummer.txt')).toBe(false);
    expect(isMigrationFilename('README.md')).toBe(false);
  });
});

describe('sorteerMigraties', () => {
  it('sorts chronologically and drops non-migration files', () => {
    expect(
      sorteerMigraties(['2026-08-07-b.sql', 'README.md', '2026-07-30-a.sql'])
    ).toEqual(['2026-07-30-a.sql', '2026-08-07-b.sql']);
  });
});

describe('berekenOpenstaand', () => {
  const repo = ['2026-07-30-a.sql', '2026-08-05-b.sql', '2026-08-07-c.sql'];

  it('returns nothing when everything is applied', () => {
    expect(berekenOpenstaand(repo, repo)).toEqual([]);
  });

  it('returns the missing ones, in chronological order', () => {
    expect(berekenOpenstaand(repo, ['2026-08-05-b.sql'])).toEqual([
      '2026-07-30-a.sql',
      '2026-08-07-c.sql',
    ]);
  });

  it('returns everything when the ledger is empty', () => {
    expect(berekenOpenstaand(repo, [])).toEqual(repo);
  });

  // A rollback to an older tag, or a feature branch whose migration already ran on
  // staging before it merged, both leave the database ahead of the repo. Neither is a
  // reason to block a deploy.
  it('ignores migrations applied in the database but absent from the repo', () => {
    expect(berekenOpenstaand(repo, [...repo, '2026-09-01-toekomst.sql'])).toEqual([]);
  });
});

describe('splitStatements', () => {
  it('strips comment lines and splits on semicolons', () => {
    const sql = [
      '-- Migration for something (2026-08-07)',
      '-- second comment line',
      'ALTER TABLE a ADD COLUMN x VARCHAR(20);',
      '',
      "INSERT INTO counters (id, value) VALUES ('x', 0);",
    ].join('\n');
    expect(splitStatements(sql)).toEqual([
      'ALTER TABLE a ADD COLUMN x VARCHAR(20)',
      "INSERT INTO counters (id, value) VALUES ('x', 0)",
    ]);
  });

  it('keeps a statement that spans several lines together', () => {
    const sql = 'CREATE TABLE t (\n  id CHAR(36) PRIMARY KEY,\n  naam VARCHAR(10)\n);';
    expect(splitStatements(sql)).toEqual([
      'CREATE TABLE t (\n  id CHAR(36) PRIMARY KEY,\n  naam VARCHAR(10)\n)',
    ]);
  });

  it('returns an empty list for a comment-only file', () => {
    expect(splitStatements('-- nothing to do\n')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/scripts/migrations.test.ts
```

Expected: FAIL — `Failed to resolve import "../../scripts/lib/migrations"`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/lib/migrations.ts`:

```ts
// Pure helpers for the schema-migration ledger: no I/O, no database, no process.exit,
// so every branch is unit-testable. See
// docs/superpowers/specs/2026-08-08-schema-drift-guard-design.md.

// `YYYY-MM-DD-<slug>.sql`. The date prefix is what makes alphabetical order equal
// chronological order -- every caller in this feature depends on that.
export const MIGRATION_FILENAME_PATTERN = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.sql$/;

export function isMigrationFilename(name: string): boolean {
  return MIGRATION_FILENAME_PATTERN.test(name);
}

export function sorteerMigraties(filenames: string[]): string[] {
  return filenames.filter(isMigrationFilename).sort();
}

// Migrations present in the repo but not recorded in the database ledger. Extra entries
// in `applied` are deliberately NOT reported: that happens legitimately when rolling back
// to an older vN tag, and while a feature branch's migration has run on staging but has
// not merged to master yet.
export function berekenOpenstaand(
  repoFilenames: string[],
  appliedFilenames: string[]
): string[] {
  const applied = new Set(appliedFilenames);
  return sorteerMigraties(repoFilenames).filter((filename) => !applied.has(filename));
}

// mysql2 runs one statement per query() call unless multipleStatements is enabled, which
// this project does not enable. Splitting here keeps that off (it widens SQL-injection
// blast radius elsewhere) and lets the runner name the exact statement that failed.
//
// Known limitation: this splits on every `;`, so a migration must not contain a semicolon
// inside a string literal. None of the existing migrations do. If one ever needs to, run
// that statement by hand and record the file with --mark-applied.
export function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/scripts/migrations.test.ts
```

Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/migrations.ts tests/scripts/migrations.test.ts
git commit -m "feat: voeg pure hulpfuncties toe voor het migratielogboek"
```

---

### Task 2: Environment loader, ledger helpers, and `db:status`

**Files:**
- Create: `scripts/lib/env.ts`, `scripts/lib/ledger.ts`, `scripts/db-migrate.ts`
- Modify: `package.json` (scripts block), `db/schema.sql`
- Test: `tests/scripts/ledger.test.ts`

**Interfaces:**
- Consumes: `sorteerMigraties`, `berekenOpenstaand` from Task 1.
- Produces:
  - `leesOmgeving(target: string): Record<string, string>`
  - `verbind(target: string): Promise<{ connection: Connection; database: string }>`
  - `zorgVoorLedger(connection: Connection): Promise<void>`
  - `leesToegepast(connection: Connection): Promise<string[]>`
  - `noteerToegepast(connection: Connection, filename: string): Promise<void>`
  - `MIGRATIONS_DIR = 'db/migrations'` exported from `scripts/lib/ledger.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/scripts/ledger.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import type { Connection } from 'mysql2/promise';
import { verbind } from '../../scripts/lib/env';
import { leesToegepast, noteerToegepast, zorgVoorLedger } from '../../scripts/lib/ledger';

// Every fixture filename starts with `test-` so cleanup can target it by exact name.
// Never delete the whole table: it holds the real ledger for the shared staging database.
const FIXTURE = 'test-2026-01-01-ledger-fixture.sql';

let open: Connection | null = null;

async function connect(): Promise<Connection> {
  const { connection } = await verbind('staging');
  open = connection;
  return connection;
}

afterEach(async () => {
  if (open) {
    await open.query('DELETE FROM schema_migrations WHERE filename = ?', [FIXTURE]);
    await open.end();
    open = null;
  }
});

describe('ledger helpers', () => {
  it('creates the table when it is missing and reads back an empty-or-existing list', async () => {
    const connection = await connect();
    await zorgVoorLedger(connection);
    const applied = await leesToegepast(connection);
    expect(Array.isArray(applied)).toBe(true);
  });

  it('records a migration and reads it back, sorted', async () => {
    const connection = await connect();
    await zorgVoorLedger(connection);
    await noteerToegepast(connection, FIXTURE);
    const applied = await leesToegepast(connection);
    expect(applied).toContain(FIXTURE);
    expect([...applied]).toEqual([...applied].sort());
  });

  it('is idempotent -- recording the same migration twice does not throw', async () => {
    const connection = await connect();
    await zorgVoorLedger(connection);
    await noteerToegepast(connection, FIXTURE);
    await expect(noteerToegepast(connection, FIXTURE)).resolves.toBeUndefined();
  });
});

describe('leesOmgeving', () => {
  it('refuses an unknown environment name', async () => {
    await expect(verbind('acceptatie')).rejects.toThrow(/Onbekende omgeving/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/scripts/ledger.test.ts
```

Expected: FAIL — `Failed to resolve import "../../scripts/lib/env"`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/lib/env.ts`:

```ts
import fs from 'node:fs';
import mysql, { type Connection } from 'mysql2/promise';

// There is no local database: `staging` is the shared development/test database and
// `productie` is live. Both env files are gitignored via the .env*.local pattern.
const ENV_FILES: Record<string, string> = {
  staging: '.env.local',
  productie: '.env.production.local',
};

export function beschikbareOmgevingen(): string[] {
  return Object.keys(ENV_FILES);
}

// Deliberately does NOT fall back to process.env: a typo in the target must fail loudly
// rather than silently connecting to whatever the shell happened to have exported.
export function leesOmgeving(target: string): Record<string, string> {
  const file = ENV_FILES[target];
  if (!file) {
    throw new Error(
      `Onbekende omgeving '${target}'. Kies uit: ${beschikbareOmgevingen().join(', ')}.`
    );
  }
  if (!fs.existsSync(file)) {
    throw new Error(`${file} ontbreekt -- nodig voor omgeving '${target}'.`);
  }
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

export async function verbind(
  target: string
): Promise<{ connection: Connection; database: string }> {
  const env = leesOmgeving(target);
  const connection = await mysql.createConnection({
    host: env.DB_HOST,
    port: Number(env.DB_PORT ?? 3306),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  });
  return { connection, database: env.DB_NAME };
}
```

Create `scripts/lib/ledger.ts`:

```ts
import type { Connection } from 'mysql2/promise';

export const MIGRATIONS_DIR = 'db/migrations';

// IF NOT EXISTS on purpose: the ledger cannot itself be a migration file (the runner would
// have to read the ledger to discover whether the ledger exists), so it is created on
// demand instead. db/schema.sql carries the same definition for a database built from
// scratch. See the "Deviation from the spec" note in the plan.
const LEDGER_DDL = `CREATE TABLE IF NOT EXISTS schema_migrations (
  filename VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

export async function zorgVoorLedger(connection: Connection): Promise<void> {
  await connection.query(LEDGER_DDL);
}

export async function leesToegepast(connection: Connection): Promise<string[]> {
  const [rows] = await connection.query('SELECT filename FROM schema_migrations ORDER BY filename');
  return (rows as Array<{ filename: string }>).map((row) => row.filename);
}

// INSERT IGNORE so re-recording an already-recorded migration is a no-op rather than a
// duplicate-key error -- the runner may retry after a partially failed run.
export async function noteerToegepast(connection: Connection, filename: string): Promise<void> {
  await connection.query('INSERT IGNORE INTO schema_migrations (filename) VALUES (?)', [filename]);
}
```

Create `scripts/db-migrate.ts` (the `status` subcommand only for now; `apply` follows in Task 3):

```ts
import fs from 'node:fs';
import { berekenOpenstaand, sorteerMigraties } from './lib/migrations';
import { verbind } from './lib/env';
import { MIGRATIONS_DIR, leesToegepast, zorgVoorLedger } from './lib/ledger';

const [subcommand, target] = process.argv.slice(2);

function gebruik(): never {
  console.error('Gebruik: npm run db:status  -- <staging|productie>');
  console.error('         npm run db:migrate -- <staging|productie> [--confirm]');
  process.exit(2);
}

async function main(): Promise<void> {
  if (!subcommand || !target) gebruik();

  const { connection, database } = await verbind(target);
  try {
    await zorgVoorLedger(connection);
    const repo = sorteerMigraties(fs.readdirSync(MIGRATIONS_DIR));
    const toegepast = await leesToegepast(connection);
    const openstaand = berekenOpenstaand(repo, toegepast);

    if (subcommand === 'status') {
      console.log(`Database: ${database} (${target})`);
      console.log(`Toegepast: ${toegepast.length}`);
      console.log(`Openstaand: ${openstaand.length}`);
      for (const filename of openstaand) console.log(`  - ${filename}`);
      process.exitCode = openstaand.length > 0 ? 1 : 0;
      return;
    }

    gebruik();
  } finally {
    await connection.end();
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
```

Add to `package.json` scripts:

```json
    "db:status": "tsx scripts/db-migrate.ts status",
```

Add to `db/schema.sql`, directly above the `CREATE TABLE counters` block:

```sql
-- Records which files in db/migrations/ have been applied to this database. Created on
-- demand by scripts/db-migrate.ts as well, so an existing database picks it up without a
-- migration of its own (a migration that creates the ledger would be self-referential).
CREATE TABLE schema_migrations (
  filename VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/scripts/ledger.test.ts
```

Expected: PASS — 4 tests. The first run also creates the real `schema_migrations` table on staging; that is intended and idempotent.

- [ ] **Step 5: Verify the CLI end to end**

```bash
npm run db:status -- staging
```

Expected output: `Database: dv137864_staging (staging)`, `Toegepast: 0`, `Openstaand: 10`, then the ten filenames. Exit code 1. This is correct at this point — the baseline has not been seeded yet (Task 4).

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/env.ts scripts/lib/ledger.ts scripts/db-migrate.ts tests/scripts/ledger.test.ts package.json db/schema.sql
git commit -m "feat: voeg migratielogboek en db:status toe"
```

---

### Task 3: `db:migrate` — apply, confirm, and mark-applied

**Files:**
- Create: `scripts/lib/apply.ts`, `tests/fixtures/migrations/2026-01-01-test-scratch-ok.sql`, `tests/fixtures/migrations/2026-01-02-test-scratch-kapot.sql`
- Modify: `scripts/db-migrate.ts`, `scripts/lib/ledger.ts`, `package.json`
- Test: `tests/scripts/apply.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1 and 2, plus `splitStatements`.
- Produces:
  - `pasMigratiesToe(connection, migrationsDir, openstaand, log): Promise<ToepasResultaat>` from `scripts/lib/apply.ts`, where
    `ToepasResultaat = { toegepast: string[]; mislukt: null | { filename: string; index: number; statement: string; message: string } }`
  - the `apply` subcommand, `--confirm`, `--mark-applied <filename>`.

**Why the loop is a function, not inline CLI code:** this is the only code in the feature that executes DDL against the production database, so it must be covered by tests rather than manual CLI runs. Returning a result object instead of calling `process.exit` lets the tests drive it directly, with no child process. The CLI maps the result to output and exit codes.

- [ ] **Step 1: Leave `MIGRATIONS_DIR` alone**

`MIGRATIONS_DIR` stays the plain constant `'db/migrations'` from Task 2. An earlier draft made it overridable via an environment variable for testability, but that turned out to be unnecessary: `pasMigratiesToe` takes the directory as a parameter, which is what the tests actually use. An ambient env var would only add a way to silently redirect the real apply path against production, and it would contradict `env.ts`'s own rule of never falling back to `process.env`.

- [ ] **Step 2: Write the failing test**

Create `tests/fixtures/migrations/2026-01-01-test-scratch-ok.sql`:

```sql
-- Fixture for tests/scripts/apply.test.ts. Never applied to a real database by the CLI:
-- it lives outside db/migrations/ and is only reachable via MIGRATIONS_DIR.
CREATE TABLE IF NOT EXISTS test_scratch_apply (
  id INT PRIMARY KEY
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO test_scratch_apply (id) VALUES (1);
```

Create `tests/fixtures/migrations/2026-01-02-test-scratch-kapot.sql`:

```sql
-- Fixture: the first statement succeeds, the second cannot. Proves the runner stops at the
-- failure and does not record the file.
INSERT IGNORE INTO test_scratch_apply (id) VALUES (2);
ALTER TABLE test_scratch_apply ADD COLUMN id INT;
```

Create `tests/scripts/apply.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import type { Connection } from 'mysql2/promise';
import { verbind } from '../../scripts/lib/env';
import { pasMigratiesToe } from '../../scripts/lib/apply';
import { leesToegepast, noteerToegepast, zorgVoorLedger } from '../../scripts/lib/ledger';

const FIXTURE_DIR = 'tests/fixtures/migrations';
const OK = '2026-01-01-test-scratch-ok.sql';
const KAPOT = '2026-01-02-test-scratch-kapot.sql';

let open: Connection | null = null;

async function connect(): Promise<Connection> {
  const { connection } = await verbind('staging');
  open = connection;
  await zorgVoorLedger(connection);
  return connection;
}

// Removes exactly what these tests create: the two fixture ledger rows (by exact filename)
// and the scratch table. Never touches any other row in schema_migrations.
afterEach(async () => {
  if (open) {
    await open.query('DELETE FROM schema_migrations WHERE filename IN (?, ?)', [OK, KAPOT]);
    await open.query('DROP TABLE IF EXISTS test_scratch_apply');
    await open.end();
    open = null;
  }
});

describe('pasMigratiesToe', () => {
  it('runs a migration, records it, and reports no failure', async () => {
    const connection = await connect();
    const resultaat = await pasMigratiesToe(connection, FIXTURE_DIR, [OK], () => {});

    expect(resultaat.mislukt).toBeNull();
    expect(resultaat.toegepast).toEqual([OK]);
    expect(await leesToegepast(connection)).toContain(OK);

    const [rows] = await connection.query('SELECT id FROM test_scratch_apply');
    expect((rows as Array<{ id: number }>).map((r) => r.id)).toEqual([1]);
  });

  it('stops at the failing statement and does not record the file', async () => {
    const connection = await connect();
    await pasMigratiesToe(connection, FIXTURE_DIR, [OK], () => {});

    const resultaat = await pasMigratiesToe(connection, FIXTURE_DIR, [KAPOT], () => {});

    expect(resultaat.toegepast).toEqual([]);
    expect(resultaat.mislukt).not.toBeNull();
    expect(resultaat.mislukt!.filename).toBe(KAPOT);
    // Statement 1 (the INSERT) succeeded; statement 2 (the duplicate column) failed.
    expect(resultaat.mislukt!.index).toBe(1);
    expect(resultaat.mislukt!.statement).toContain('ADD COLUMN id');

    // The half-applied file must NOT be in the ledger -- that is the whole point.
    expect(await leesToegepast(connection)).not.toContain(KAPOT);
    // ...and the statement that did succeed before the failure is still committed, because
    // MySQL has no transactional DDL. Asserting it makes that irreversibility explicit.
    const [rows] = await connection.query('SELECT id FROM test_scratch_apply ORDER BY id');
    expect((rows as Array<{ id: number }>).map((r) => r.id)).toEqual([1, 2]);
  });

  it('stops before later files once one has failed', async () => {
    const connection = await connect();
    const resultaat = await pasMigratiesToe(connection, FIXTURE_DIR, [KAPOT, OK], () => {});

    expect(resultaat.mislukt!.filename).toBe(KAPOT);
    expect(resultaat.toegepast).toEqual([]);
    expect(await leesToegepast(connection)).not.toContain(OK);
  });

  it('skips a migration already recorded in the ledger', async () => {
    const connection = await connect();
    await noteerToegepast(connection, OK);
    const resultaat = await pasMigratiesToe(connection, FIXTURE_DIR, [], () => {});
    expect(resultaat.toegepast).toEqual([]);
    expect(resultaat.mislukt).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/scripts/apply.test.ts
```

Expected: FAIL — cannot resolve `../../scripts/lib/apply`.

- [ ] **Step 4: Write the apply module**

Create `scripts/lib/apply.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import type { Connection } from 'mysql2/promise';
import { splitStatements } from './migrations';
import { noteerToegepast } from './ledger';

export interface Mislukking {
  filename: string;
  index: number;
  statement: string;
  message: string;
}

export interface ToepasResultaat {
  toegepast: string[];
  mislukt: Mislukking | null;
}

// Applies the given migrations in the order supplied. Returns a result instead of calling
// process.exit so the caller (CLI) owns presentation and exit codes, and so this loop --
// the only code in the feature that runs DDL against production -- is testable directly.
//
// MySQL has no transactional DDL: an ALTER implicitly commits, so a file that fails halfway
// cannot be rolled back. On failure the runner stops immediately and does NOT record the
// file, leaving the database in a state a human must inspect. That is deliberate: a loud
// stop mid-file beats a silent "done" or a bogus rollback claim.
export async function pasMigratiesToe(
  connection: Connection,
  migrationsDir: string,
  openstaand: string[],
  log: (regel: string) => void
): Promise<ToepasResultaat> {
  const toegepast: string[] = [];

  for (const filename of openstaand) {
    const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
    const statements = splitStatements(sql);
    log(`\n${filename} (${statements.length} statements)`);

    for (const [index, statement] of statements.entries()) {
      try {
        await connection.query(statement);
        log(`  ${index + 1}/${statements.length} ok`);
      } catch (error) {
        return {
          toegepast,
          mislukt: { filename, index, statement, message: (error as Error).message },
        };
      }
    }

    await noteerToegepast(connection, filename);
    toegepast.push(filename);
    log('  genoteerd in schema_migrations');
  }

  return { toegepast, mislukt: null };
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/scripts/apply.test.ts
```

Expected: PASS — 4 tests.

- [ ] **Step 6: Wire the CLI to the apply module**

Replace the body of `scripts/db-migrate.ts` with:

```ts
import fs from 'node:fs';
import { berekenOpenstaand, isMigrationFilename, sorteerMigraties } from './lib/migrations';
import { verbind } from './lib/env';
import { MIGRATIONS_DIR, leesToegepast, noteerToegepast, zorgVoorLedger } from './lib/ledger';
import { pasMigratiesToe } from './lib/apply';

const args = process.argv.slice(2);
const [subcommand, target] = args;
const confirm = args.includes('--confirm');
const markIndex = args.indexOf('--mark-applied');
const markFilename = markIndex === -1 ? null : args[markIndex + 1];

function gebruik(): never {
  console.error('Gebruik: npm run db:status  -- <staging|productie>');
  console.error('         npm run db:migrate -- <staging|productie> [--confirm]');
  console.error('         npm run db:migrate -- <staging|productie> --mark-applied <bestandsnaam>');
  process.exit(2);
}

// Everything that can be rejected without touching the database is checked here, BEFORE a
// connection is opened. process.exit() skips pending finally blocks, so an exit from inside
// the try below would leak the connection -- this repo has exhausted its MySQL connection
// grant that way before. Inside the try, set process.exitCode and return instead.
function valideerArgumenten(): void {
  if (!subcommand || !target) gebruik();
  if (subcommand !== 'status' && subcommand !== 'apply') gebruik();

  // `--mark-applied` with no value would leave markFilename undefined, fall straight past
  // the mark branch, and silently run every outstanding migration instead of recording one.
  // Refuse rather than guess.
  if (markIndex !== -1 && !markFilename) {
    console.error('Weigering: --mark-applied vereist een bestandsnaam.');
    process.exit(2);
  }

  // The standing rule in CLAUDE.md: every production database change needs explicit
  // permission. --confirm is the mechanical half of that; asking the user is the other.
  // This covers --mark-applied too, deliberately: recording a migration that never ran is
  // the most dangerous write of all, because it makes the deploy gate report production
  // healthy while the column is actually missing -- the exact failure this feature exists
  // to prevent.
  if (subcommand === 'apply' && target === 'productie' && !confirm) {
    console.error('Weigering: `apply` op productie vereist expliciet --confirm.');
    process.exit(2);
  }
}

async function main(): Promise<void> {
  valideerArgumenten();

  const { connection, database } = await verbind(target);
  try {
    await zorgVoorLedger(connection);
    const repo = sorteerMigraties(fs.readdirSync(MIGRATIONS_DIR));
    const toegepast = await leesToegepast(connection);
    const openstaand = berekenOpenstaand(repo, toegepast);

    if (subcommand === 'status') {
      console.log(`Database: ${database} (${target})`);
      console.log(`Toegepast: ${toegepast.length}`);
      console.log(`Openstaand: ${openstaand.length}`);
      for (const filename of openstaand) console.log(`  - ${filename}`);
      process.exitCode = openstaand.length > 0 ? 1 : 0;
      return;
    }

    // Records a migration without running it, for migrations applied before the ledger
    // existed or before their branch merged. Restricted to filenames that actually exist
    // in db/migrations/, so it cannot invent history.
    if (markFilename) {
      if (!isMigrationFilename(markFilename) || !repo.includes(markFilename)) {
        console.error(`'${markFilename}' staat niet in ${MIGRATIONS_DIR}/ -- weigering.`);
        process.exitCode = 2;
        return;
      }
      await noteerToegepast(connection, markFilename);
      console.log(`Genoteerd als toegepast (niet uitgevoerd): ${markFilename}`);
      return;
    }

    if (openstaand.length === 0) {
      console.log(`Niets te doen -- ${database} is bij.`);
      return;
    }

    const resultaat = await pasMigratiesToe(connection, MIGRATIONS_DIR, openstaand, (regel) =>
      console.log(regel)
    );

    if (resultaat.mislukt) {
      const { filename, index, statement, message } = resultaat.mislukt;
      console.error(`  statement ${index + 1} MISLUKT: ${message}`);
      console.error(`  Statement: ${statement}`);
      console.error(
        `\n${filename} is GEDEELTELIJK toegepast en is NIET genoteerd in schema_migrations.`
      );
      console.error('Controleer de database met de hand voordat je opnieuw draait.');
      process.exitCode = 1;
      return;
    }

    console.log(`\n${resultaat.toegepast.length} migratie(s) toegepast op ${database}.`);
  } finally {
    await connection.end();
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
```

Add to `package.json` scripts, next to `db:status`:

```json
    "db:migrate": "tsx scripts/db-migrate.ts apply",
```

- [ ] **Step 7: Verify the production guard refuses without `--confirm`**

```bash
npm run db:migrate -- productie
```

Expected: `Weigering: \`apply\` op productie vereist expliciet --confirm.` and exit code 2. **No connection is opened.**

- [ ] **Step 8: Verify `--mark-applied` rejects an unknown filename**

```bash
npm run db:migrate -- staging --mark-applied 2026-01-01-bestaat-niet.sql
```

Expected: `'2026-01-01-bestaat-niet.sql' staat niet in db/migrations/ -- weigering.` and exit code 2.

- [ ] **Step 9: Verify `--mark-applied` works and is visible in status**

```bash
npm run db:migrate -- staging --mark-applied 2026-07-30-kunstenaar-exclusiviteit.sql
npm run db:status -- staging
```

Expected: `Toegepast: 1`, `Openstaand: 9`.

- [ ] **Step 10: Re-run the existing suite for this area**

```bash
npx vitest run tests/scripts/
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add scripts/lib/apply.ts scripts/lib/ledger.ts scripts/db-migrate.ts tests/scripts/apply.test.ts tests/fixtures/migrations package.json
git commit -m "feat: voeg db:migrate toe met confirm-guard en mark-applied"
```

---

### Task 4: Seed the baseline on both databases

**This task changes the production database. Ask the user for explicit permission before Step 3, and do not proceed without a clear yes.**

**Files:** none — this is an operational task.

**Interfaces:**
- Consumes: `db:migrate --mark-applied` and `db:status` from Task 3.
- Produces: both databases have all ten `master` migrations recorded.

- [ ] **Step 1: Confirm both databases really are at the `master` schema**

```bash
npm run db:status -- staging
```

Expected before seeding: `Openstaand: 9` (one was marked in Task 3 Step 4).

- [ ] **Step 2: Seed staging**

```bash
for f in $(ls db/migrations); do npm run db:migrate -- staging --mark-applied "$f"; done
npm run db:status -- staging
```

Expected: `Toegepast: 10`, `Openstaand: 0`, exit code 0.

- [ ] **Step 3: Ask the user for permission, then seed production**

Ask: "Mag ik de baseline van het migratielogboek op de productiedatabase zetten? Het schrijft alleen tien bestandsnamen in `schema_migrations` en voert geen enkele migratie uit."

After an explicit yes:

```bash
for f in $(ls db/migrations); do npm run db:migrate -- productie --confirm --mark-applied "$f"; done
npm run db:status -- productie
```

Expected: `Toegepast: 10`, `Openstaand: 0`, exit code 0.

`--mark-applied` requires `--confirm` on production just as `apply` does. Recording a migration that never ran is the most dangerous write available: it makes the deploy gate report production healthy while the column is actually missing, silently disabling the safety net this whole feature exists to provide.

- [ ] **Step 4: No commit**

Nothing changed in the repo. Record the outcome in the task notes instead.

---

### Task 5: The health endpoint

**Files:**
- Create: `src/app/api/health/schema/route.ts`
- Test: `tests/app/api/health-schema.test.ts`

**Interfaces:**
- Consumes: the `schema_migrations` table from Task 2.
- Produces: `GET /api/health/schema` → `{ applied: string[] }` or `{ applied: [], bootstrap: true }`.

- [ ] **Step 1: Write the failing test**

Create `tests/app/api/health-schema.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { getPool } from '@/lib/server/db';
import { GET } from '@/app/api/health/schema/route';

// Prefixed `test-` and removed by exact filename. Never delete the whole table: it is the
// real ledger for the shared staging database.
const FIXTURE = 'test-2026-01-02-endpoint-fixture.sql';

afterEach(async () => {
  await getPool().query('DELETE FROM schema_migrations WHERE filename = ?', [FIXTURE]);
});

describe('GET /api/health/schema', () => {
  it('returns the applied migrations, sorted', async () => {
    await getPool().query('INSERT IGNORE INTO schema_migrations (filename) VALUES (?)', [FIXTURE]);

    const response = await GET();
    expect(response.status).toBe(200);

    const body = (await response.json()) as { applied: string[]; bootstrap?: boolean };
    expect(body.bootstrap).toBeUndefined();
    expect(body.applied).toContain(FIXTURE);
    expect([...body.applied]).toEqual([...body.applied].sort());
  });

  it('reports the real migrations that Task 4 seeded', async () => {
    const response = await GET();
    const body = (await response.json()) as { applied: string[] };
    expect(body.applied).toContain('2026-08-07-zendingnummer.sql');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/app/api/health-schema.test.ts
```

Expected: FAIL — cannot resolve `@/app/api/health/schema/route`.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/api/health/schema/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';

// Without this, Next.js 14 may evaluate a GET handler that takes no Request at build time
// and serve a frozen copy forever -- which would make this endpoint report the migration
// state as it was when the build ran, exactly the staleness the gate exists to catch.
export const dynamic = 'force-dynamic';

// Public and read-only on purpose. The response is a list of migration filenames and
// nothing else: no customer data, no schema contents, no write path. The deploy workflows
// call this before uploading a build, and CI has no session cookie -- requiring
// requireMedewerker would make the gate unusable. See
// docs/superpowers/specs/2026-08-08-schema-drift-guard-design.md.
export async function GET() {
  try {
    const [rows] = await getPool().query(
      'SELECT filename FROM schema_migrations ORDER BY filename'
    );
    return NextResponse.json({
      applied: (rows as Array<{ filename: string }>).map((row) => row.filename),
    });
  } catch (error) {
    // A missing ledger table is an actionable state for the gate ("seed the baseline
    // first"), not a server fault -- so it gets a 200 with a flag rather than a 500 the
    // gate cannot tell apart from an outage.
    if ((error as { code?: string }).code === 'ER_NO_SUCH_TABLE') {
      return NextResponse.json({ applied: [], bootstrap: true });
    }
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/app/api/health-schema.test.ts
```

Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/health/schema/route.ts tests/app/api/health-schema.test.ts
git commit -m "feat: voeg health-endpoint toe dat toegepaste migraties teruggeeft"
```

---

### Task 6: The CI gate script

**Files:**
- Create: `scripts/check-migrations.ts`
- Test: `tests/scripts/check-migrations.test.ts`

**Interfaces:**
- Consumes: `berekenOpenstaand`, `sorteerMigraties` from Task 1; the endpoint from Task 5.
- Produces: `beoordeelMigratieStatus(repoFilenames, response)` returning `{ ok: boolean; exitCode: number; regels: string[] }`, plus a CLI wrapper.

The decision logic is a pure function so it can be tested without a network or a database; the CLI wrapper only does `fetch`, printing and `process.exit`.

- [ ] **Step 1: Write the failing test**

Create `tests/scripts/check-migrations.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { beoordeelMigratieStatus } from '../../scripts/check-migrations';

const REPO = ['2026-07-30-a.sql', '2026-08-07-b.sql'];

describe('beoordeelMigratieStatus', () => {
  it('passes when everything is applied', () => {
    const result = beoordeelMigratieStatus(REPO, { status: 200, body: { applied: REPO } }, 'staging');
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  // Only possible before the first deploy that ships the endpoint; afterwards the route
  // is always present, so a 404 can only mean "app older than this feature".
  it('warns but passes on 404', () => {
    const result = beoordeelMigratieStatus(REPO, { status: 404, body: null }, 'staging');
    expect(result.ok).toBe(true);
    expect(result.regels.join('\n')).toContain('::warning::');
  });

  it('fails on any other non-200', () => {
    const result = beoordeelMigratieStatus(REPO, { status: 502, body: null }, 'staging');
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
  });

  it('fails when the ledger table does not exist yet', () => {
    const result = beoordeelMigratieStatus(
      REPO,
      { status: 200, body: { applied: [], bootstrap: true } },
      'productie'
    );
    expect(result.ok).toBe(false);
    expect(result.regels.join('\n')).toContain('schema_migrations');
  });

  it('fails and names each pending migration plus the fix command', () => {
    const result = beoordeelMigratieStatus(
      REPO,
      { status: 200, body: { applied: ['2026-07-30-a.sql'] } },
      'productie'
    );
    expect(result.ok).toBe(false);
    const output = result.regels.join('\n');
    expect(output).toContain('2026-08-07-b.sql');
    expect(output).toContain('npm run db:migrate -- productie --confirm');
  });

  it('passes when the database is ahead of the repo', () => {
    const result = beoordeelMigratieStatus(
      REPO,
      { status: 200, body: { applied: [...REPO, '2026-09-01-later.sql'] } },
      'staging'
    );
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/scripts/check-migrations.test.ts
```

Expected: FAIL — cannot resolve `../../scripts/check-migrations`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/check-migrations.ts`:

```ts
import fs from 'node:fs';
import { berekenOpenstaand, sorteerMigraties } from './lib/migrations';
import { MIGRATIONS_DIR } from './lib/ledger';

export interface EndpointAntwoord {
  status: number;
  body: { applied?: string[]; bootstrap?: boolean } | null;
}

export interface Oordeel {
  ok: boolean;
  exitCode: number;
  regels: string[];
}

// Pure: no fetch, no filesystem, no process.exit -- so every branch is unit-testable.
export function beoordeelMigratieStatus(
  repoFilenames: string[],
  antwoord: EndpointAntwoord,
  omgeving: string
): Oordeel {
  if (antwoord.status === 404) {
    return {
      ok: true,
      exitCode: 0,
      regels: [
        `::warning::/api/health/schema bestaat nog niet op ${omgeving} -- dit is de eerste deploy met de migratiecontrole. Vanaf de volgende deploy blokkeert deze stap wel.`,
      ],
    };
  }
  if (antwoord.status !== 200 || !antwoord.body) {
    return {
      ok: false,
      exitCode: 1,
      regels: [`::error::/api/health/schema op ${omgeving} gaf status ${antwoord.status}.`],
    };
  }
  if (antwoord.body.bootstrap) {
    return {
      ok: false,
      exitCode: 1,
      regels: [
        `::error::De tabel schema_migrations bestaat nog niet op ${omgeving}. Draai eerst de baseline: npm run db:migrate -- ${omgeving} --mark-applied <bestandsnaam> voor elk bestand in ${MIGRATIONS_DIR}/.`,
      ],
    };
  }

  const openstaand = berekenOpenstaand(repoFilenames, antwoord.body.applied ?? []);
  if (openstaand.length === 0) {
    return {
      ok: true,
      exitCode: 0,
      regels: [`Alle ${repoFilenames.length} migraties zijn toegepast op ${omgeving}.`],
    };
  }

  const commando =
    omgeving === 'productie'
      ? 'npm run db:migrate -- productie --confirm'
      : `npm run db:migrate -- ${omgeving}`;
  return {
    ok: false,
    exitCode: 1,
    regels: [
      `::error::${openstaand.length} migratie(s) nog niet toegepast op ${omgeving}:`,
      ...openstaand.map((filename) => `  - ${filename}`),
      `Draai eerst: ${commando}`,
    ],
  };
}

async function main(): Promise<void> {
  const [baseUrl, omgeving] = process.argv.slice(2);
  if (!baseUrl || !omgeving) {
    console.error('Gebruik: tsx scripts/check-migrations.ts <base-url> <staging|productie>');
    process.exit(2);
  }

  const url = `${baseUrl.replace(/\/$/, '')}/api/health/schema`;
  const repo = sorteerMigraties(fs.readdirSync(MIGRATIONS_DIR));

  let antwoord: EndpointAntwoord;
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    const body = response.status === 200 ? await response.json() : null;
    antwoord = { status: response.status, body };
  } catch (error) {
    console.error(`::error::Kan ${url} niet bereiken: ${(error as Error).message}`);
    process.exit(1);
  }

  const oordeel = beoordeelMigratieStatus(repo, antwoord, omgeving);
  for (const regel of oordeel.regels) {
    if (oordeel.ok) console.log(regel);
    else console.error(regel);
  }
  process.exit(oordeel.exitCode);
}

// Only run the CLI when executed directly, so the test can import the pure function.
if (process.argv[1]?.endsWith('check-migrations.ts')) {
  void main();
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/scripts/check-migrations.test.ts
```

Expected: PASS — 6 tests.

- [ ] **Step 5: Verify against the live staging app**

```bash
npx tsx scripts/check-migrations.ts https://staging.glassartanddesign.com staging
```

Expected at this point: the warning branch (`::warning::`) and exit code 0, because the endpoint from Task 5 has not been deployed to staging yet. That is the rollout edge case working as designed.

- [ ] **Step 6: Commit**

```bash
git add scripts/check-migrations.ts tests/scripts/check-migrations.test.ts
git commit -m "feat: voeg CI-controle toe op openstaande databasemigraties"
```

---

### Task 7: Wire the gate into both workflows and document it

**Files:**
- Modify: `.github/workflows/deploy-naar-staging.yml`, `.github/workflows/deploy-naar-production.yml`, `CLAUDE.md`

**Interfaces:**
- Consumes: `scripts/check-migrations.ts` from Task 6.
- Produces: a failing deploy when the target database is behind.

- [ ] **Step 1: Add the step to the staging workflow**

In `.github/workflows/deploy-naar-staging.yml`, directly after the `Install dependencies` step (`run: npm ci`) and before `Compute next version number`:

```yaml
      - name: Controleer databasemigraties
        run: npx tsx scripts/check-migrations.ts "https://staging.glassartanddesign.com" staging
        # Faalt vóór de build en vóór de upload als de staging-database een migratie mist
        # die in deze commit zit. De controle gaat via de draaiende app en niet
        # rechtstreeks naar MySQL, omdat de MySQL-grants IP-gebonden zijn en een
        # GitHub-runner er nooit bij kan -- zie het ontwerp in
        # docs/superpowers/specs/2026-08-08-schema-drift-guard-design.md.
```

- [ ] **Step 2: Add the step to the production workflow**

In `.github/workflows/deploy-naar-production.yml`, directly after the `Install dependencies` step (line 79, `run: npm ci`) and before `Build (server mode)` (line 82):

```yaml
      - name: Controleer databasemigraties
        run: npx tsx scripts/check-migrations.ts "https://glassartanddesign.com" productie
        # Staat ná "Checkout resolved version" (stap hierboven) met opzet: db/migrations/
        # moet de inhoud van de gepromote vN-tag zijn, niet die van master HEAD. En ná
        # "Install dependencies", want tsx komt uit node_modules.
```

This position satisfies both constraints at once: `Checkout resolved version` is step 3 (line 70) and `Install dependencies` step 5 (line 79), so by this point `db/migrations/` already holds the tag's content *and* `tsx` is installed. Verified against the workflow on 2026-08-08 — re-check the ordering if the workflow has since been reshuffled.

- [ ] **Step 3: Add the section to `CLAUDE.md`**

Under the "GitHub / CI" heading, after the bullet describing the two workflows:

```markdown
### Database migrations

`db/schema.sql` is documentation, not an executable migration — a deploy never touches the
database. Every schema change is a file in `db/migrations/` that must be applied to each
database separately:

1. Write the migration file and update `db/schema.sql`.
2. `npm run db:migrate -- staging`
3. Deploy to staging and verify.
4. Ask the user for permission, then `npm run db:migrate -- productie --confirm`.
5. Promote to production.

Both deploy workflows call `scripts/check-migrations.ts` before uploading and **fail** if the
target database is missing a migration present in the commit being deployed. The check reads
`/api/health/schema` on the running app rather than connecting to MySQL, because the MySQL
grants are IP-bound and GitHub runners can never reach the database.

`npm run db:status -- <omgeving>` lists applied and pending migrations.
`npm run db:migrate -- <omgeving> --mark-applied <bestand>` records a migration as applied
without running it — needed when a feature branch's migration already ran on staging before
the branch merged. `npm run db:diff` compares two environments' actual schemas, which is the
only way to spot a column added by hand that belongs to no migration file.
```

- [ ] **Step 4: Verify the workflow files parse**

```bash
npx tsx -e "import('node:fs').then(fs => { for (const f of ['deploy-naar-staging','deploy-naar-production']) { const t = fs.readFileSync('.github/workflows/'+f+'.yml','utf8'); if (!t.includes('check-migrations.ts')) throw new Error(f+' mist de stap'); } console.log('beide workflows bevatten de stap'); })"
```

Expected: `beide workflows bevatten de stap`.

- [ ] **Step 5: Run the whole suite**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/deploy-naar-staging.yml .github/workflows/deploy-naar-production.yml CLAUDE.md
git commit -m "feat: blokkeer een deploy bij openstaande databasemigraties"
```

---

### Task 8: `db:diff` diagnostic

**Files:**
- Create: `scripts/db-diff.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `verbind` from Task 2.
- Produces: `npm run db:diff -- <omgevingA> <omgevingB>`.

- [ ] **Step 1: Write the implementation**

Create `scripts/db-diff.ts`:

```ts
import { verbind } from './lib/env';

// Diagnostic, not a gate: a column present in staging but not in production is expected
// while a feature branch is in flight. The ledger comparison in check-migrations.ts is the
// only thing that fails a build. This catches the case the ledger cannot see -- a column
// added by hand that belongs to no migration file at all.
async function snapshot(target: string) {
  const { connection, database } = await verbind(target);
  const [columns] = await connection.query(
    'SELECT TABLE_NAME t, COLUMN_NAME col FROM information_schema.columns WHERE TABLE_SCHEMA = ?',
    [database]
  );
  const perTabel = new Map<string, Set<string>>();
  for (const row of columns as Array<{ t: string; col: string }>) {
    if (!perTabel.has(row.t)) perTabel.set(row.t, new Set());
    perTabel.get(row.t)!.add(row.col);
  }
  const [counters] = await connection.query('SELECT id FROM counters');
  await connection.end();
  return {
    database,
    perTabel,
    counters: (counters as Array<{ id: string }>).map((row) => row.id).sort(),
  };
}

async function main(): Promise<void> {
  const [a, b] = process.argv.slice(2);
  if (!a || !b) {
    console.error('Gebruik: npm run db:diff -- <omgevingA> <omgevingB>');
    process.exit(2);
  }

  const linker = await snapshot(a);
  const rechter = await snapshot(b);
  console.log(`${a} = ${linker.database}   ${b} = ${rechter.database}\n`);

  const tabellen = [...new Set([...linker.perTabel.keys(), ...rechter.perTabel.keys()])].sort();
  let verschillen = 0;
  for (const tabel of tabellen) {
    const links = linker.perTabel.get(tabel);
    const rechts = rechter.perTabel.get(tabel);
    if (!rechts) {
      console.log(`TABEL ontbreekt in ${b}: ${tabel}`);
      verschillen++;
      continue;
    }
    if (!links) {
      console.log(`TABEL ontbreekt in ${a}: ${tabel}`);
      verschillen++;
      continue;
    }
    const alleenLinks = [...links].filter((col) => !rechts.has(col));
    const alleenRechts = [...rechts].filter((col) => !links.has(col));
    if (alleenLinks.length || alleenRechts.length) {
      verschillen++;
      console.log(
        `${tabel}: alleen in ${a} [${alleenLinks.join(', ') || '-'}] | alleen in ${b} [${alleenRechts.join(', ') || '-'}]`
      );
    }
  }

  console.log(verschillen === 0 ? '\nGeen kolomverschillen.' : `\n${verschillen} tabel(len) met verschil.`);
  if (JSON.stringify(linker.counters) !== JSON.stringify(rechter.counters)) {
    console.log(`counters ${a}: ${linker.counters.join(', ')}`);
    console.log(`counters ${b}: ${rechter.counters.join(', ')}`);
  } else {
    console.log(`counters gelijk: ${linker.counters.join(', ')}`);
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
```

Add to `package.json` scripts:

```json
    "db:diff": "tsx scripts/db-diff.ts",
```

- [ ] **Step 2: Verify against the real databases**

```bash
npm run db:diff -- staging productie
```

Expected: reports `klanten: alleen in staging [klantnr]` and a counters difference (`klantnummer`) for as long as the `worktree-klantnummer` branch is unmerged — which is the correct, expected in-flight state, not a fault.

- [ ] **Step 3: Commit**

```bash
git add scripts/db-diff.ts package.json
git commit -m "feat: voeg db:diff toe om schemaverschillen tussen omgevingen te tonen"
```

---

## Rollout order

The gate can only pass once the endpoint is live. The sequence is:

1. Tasks 1–4 (ledger, runner, baseline on both databases).
2. Task 5 (endpoint) merged to `master`.
3. Deploy to staging. The gate is not in the workflow yet, so nothing blocks.
4. Tasks 6–8, then deploy to staging again — the gate now finds the endpoint and passes.
5. Promote to production only after staging is verified, per the standing rule in `CLAUDE.md`.

Deploying is the user's call; never dispatch a workflow unprompted.
