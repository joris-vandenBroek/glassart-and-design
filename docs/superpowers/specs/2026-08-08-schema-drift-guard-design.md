# Schema drift guard: making a forgotten migration impossible to deploy past

**Date:** 2026-08-08
**Status:** Approved

## Problem

On 2026-08-08 the production database was found to be missing `bestelheaders.zendingnummer`,
`drukkerZendingen.zendingnummer` and the `counters` row `'zendingnummer'`, while the code that
reads and writes those columns had been live on production since `v26`. Reads survived
(`SELECT *` simply yields `undefined` for a missing column, so the beheer list rendered an
empty column), but every write path was broken: `POST /api/drukkers/[id]/zendingen/nummer`
throws on the absent counters row, and the follow-up `PATCH` would have failed with
`ER_BAD_FIELD_ERROR`. Nobody noticed because production has no orders yet.

The migration itself was **not** missing. `db/migrations/2026-08-07-zendingnummer.sql` existed,
was correct, and contained exactly the three statements that were eventually run by hand. It had
simply been applied to staging and never to production.

This is the second occurrence of the same failure. `drukkers.standaard` was a latent
`ER_BAD_FIELD_ERROR` on live `v14` until it was migrated on 2026-08-06.

The root cause is not a missing convention. `db/migrations/` has held well-documented `.sql`
files since 2026-07-30. The root cause is that **nothing records which migration ran against
which database, and nothing checks.** The deploy workflows never touch MySQL, so a forgotten
migration stays invisible until a write path is exercised in production — potentially months
later, by a customer.

## Goals

- A deploy fails, loudly and *before uploading anything*, when the target database is missing a
  migration that the commit being deployed requires.
- The applied state of each database is recorded explicitly, not inferred by comparing columns
  after the fact.
- Applying a migration stays a deliberate human action, never an automatic side effect of a
  deploy (see "Automation" below).
- No database credentials in GitHub, and no widening of the MySQL grants.
- A way to detect the other drift direction too: a column that exists in a database but in no
  migration file.

## Non-goals

- **No automatic migration during deploy.** Chosen deliberately: there is no database rollback
  tooling in this project, so an unattended `ALTER` against production is irreversible without
  supervision. The workflow blocks; a human applies.
- **No refusal-to-start behaviour.** Having the app return 503 when the schema is behind turns a
  schema mistake into a full production outage — heavier than the problem warrants.
- No ORM, no third-party migration framework (Prisma/Knex/Flyway). The existing plain-`.sql`
  convention works; only the bookkeeping around it is missing.
- No retroactive backfill of data. This design concerns schema bookkeeping only.

## Key constraint: CI cannot reach the database

Verified on 2026-08-08 via `SHOW GRANTS` against both databases:

```
staging:    dv137864_staging@87.212.%.%        (an ISP range)
production: dv137864_productie@87.212.44.196   (a single IP address)
```

The MySQL grants are IP-bound. GitHub Actions runners use Azure address space and will never
match. A CI step that connects to MySQL directly is therefore impossible unless the grant is
widened to `%`, which would expose the database to the whole internet — rejected.

Two consequences shape the entire design:

1. **Migrations can only be applied from an allowed IP**, i.e. the developer's machine. The
   runner is a local script, not a CI step.
2. **The deploy gate must ask the deployed application**, which connects to MySQL from the host
   itself, rather than querying MySQL directly.

A related fragility worth recording: the production grant is pinned to one address. If the ISP
reassigns it, local production database access breaks and the grant must be updated in
DirectAdmin. Not addressed here.

Also verified: the deploy payload is `.next public messages src app.js next.config.mjs
package.json package-lock.json`. `db/` is **not** uploaded, so the server has no copy of the
migration files. The repo-side file list must therefore come from the CI checkout, not from the
server.

## Design

### 1. The ledger

One table per database:

```sql
CREATE TABLE schema_migrations (
  filename VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

`filename` is the bare name as it appears in `db/migrations/` (e.g.
`2026-08-07-zendingnummer.sql`), which is also the sort key: the `YYYY-MM-DD-` prefix makes
alphabetical order equal chronological order.

The table is added to `db/schema.sql` and gets its own bootstrap migration so a fresh database
has it from the start.

**Baseline seeding.** On introduction the table is seeded with the migration filenames present
on `master` — ten as of 2026-08-08 — on both databases. This is safe because staging and
production were verified column-for-column identical on 2026-08-08 after the manual
`zendingnummer` fix, with one in-flight exception noted under "In-flight feature branches"
below. The data-only migration
`2026-08-07-te-factureren-status.sql` counts as applied on production vacuously — production has
zero `bestelheaders` rows, so there was nothing to rename.

### 2. The runner

`scripts/db-migrate.mjs`, exposed as two npm scripts:

```bash
npm run db:status  -- staging
npm run db:migrate -- productie --confirm
```

- **The target is a required positional argument with no default.** Forgetting a flag can
  therefore never silently hit production. `staging` reads `.env.local`, `productie` reads
  `.env.production.local`; the script loads exactly one of them per run.
- `productie` additionally requires `--confirm`. This mirrors the standing rule in `CLAUDE.md`
  that every production database change needs explicit per-change permission.
- `db:status` prints applied and pending migrations and exits non-zero when anything is pending,
  so it doubles as a scriptable check.
- `db:migrate` applies pending files in filename order. Within a file, statements run
  sequentially; after a file completes, its filename is inserted into `schema_migrations`.
- `--mark-applied <filename>` records a single migration as applied **without running it**, for
  migrations that were applied before the ledger existed or before their branch merged. It
  refuses any filename not present in `db/migrations/`, so it cannot invent history. See
  "In-flight feature branches" for why this is needed rather than optional.

**Failure handling.** MySQL has no transactional DDL — an `ALTER` implicitly commits, so a file
that fails halfway cannot be rolled back. The runner therefore stops at the first error, does
**not** record the filename, and reports which file and which statement failed, stating plainly
that the file is partially applied and needs manual inspection. A loud stop mid-file is
preferable to either a silent "done" or a bogus rollback claim.

### 3. The health endpoint

`src/app/api/health/schema/route.ts` — `GET`, public, read-only, no auth.

Returns `{ applied: string[] }`, sorted. If `schema_migrations` does not exist yet it returns
`{ applied: [], bootstrap: true }` with status 200, so the gate can print a useful message
instead of surfacing a 500.

Public access was chosen deliberately: the response contains migration filenames and nothing
else — no customer data, no schema contents, no write path. Requiring a shared secret would add
a server env var plus a GitHub secret for no meaningful protection, and requiring
`requireMedewerker` would need a session cookie in CI, which makes the gate unusable in practice.

The endpoint must not be gated by `src/config/pageAvailability.ts`; that switch covers
locale-prefixed pages, not `/api` routes, so no change is needed there — but it is worth
re-checking if the payload gating is ever extended to API routes.

### 4. The deploy gate

`scripts/check-migrations.mjs <base-url>` runs as a new step in both workflows, **before** the
SFTP upload step:

1. Read the filenames in `db/migrations/` from the CI checkout. For the production workflow this
   is the checkout of the resolved `vN` tag, so the gate checks exactly the commit being
   promoted — not `master` HEAD.
2. `GET <base-url>/api/health/schema`.
3. Diff. Any repo filename absent from `applied` fails the step, listing each missing migration
   and the exact command to fix it (`npm run db:migrate -- productie --confirm`).

This works before upload precisely because the ledger lives in the database, not in the build.

**Rollout edge case.** On the first run the endpoint does not exist on the live app yet, so the
gate would otherwise fail the very deploy that introduces it. A `404` is therefore treated as
bootstrap: emit a `::warning::` and pass. From the next deploy onward it is a hard gate. A `404`
can only mean "app older than this feature", since afterwards the route is always present.

**Deliberately not handled:** a migration file present on the server's database but absent from
the repo (i.e. `applied` is a superset). That is legitimate during a rollback to an older `vN`
tag, so it must not fail the deploy. `db:diff` covers the case where it matters.

### 5. Detecting hand-made drift

The ledger catches "migration forgotten". It cannot catch "someone added a column by hand",
because such a column belongs to no migration file and therefore never appears in a diff of
filenames.

`scripts/db-diff.mjs`, run as `npm run db:diff`, compares `information_schema.columns` plus the
`counters` ids of two environments and prints per-table differences. It runs locally, since it
needs credentials for both databases. This is the ad-hoc check that found the `zendingnummer`
gap; roughly 40 lines, worth keeping as a maintained script.

Its output needs interpretation rather than blind obedience: a column present in staging but not
production is expected while a feature branch is in flight (see below), so `db:diff` is a
diagnostic, not a gate. Only the ledger comparison in section 4 fails a build.

## Error handling

| Situation | Behaviour |
| --- | --- |
| Endpoint unreachable / non-200 (not 404) | Fail the deploy. An unreachable app is itself a reason not to deploy over it. |
| Endpoint returns 404 | Warn, pass. Bootstrap case only (see above). |
| `schema_migrations` missing (`bootstrap: true`) | Fail with a message naming the bootstrap migration to run first. |
| Pending migrations | Fail, listing filenames and the fix command. |
| `applied` is a superset of the repo | Pass. Normal during a rollback. |
| Migration file fails halfway | Runner stops, filename not recorded, failing statement reported as partially applied. |
| `db:migrate` targeting `productie` without `--confirm` | Refuse before connecting. |

## Testing

- **Pure function first.** The pending calculation (`repo filenames × applied list → pending`)
  lives in its own module with no I/O, unit-tested for: nothing pending, one pending, several
  pending, applied-superset, and empty-applied.
- **Endpoint test** against the real staging database, following the existing suite rules: it
  only reads. Where a row must exist to assert against, it is named with a `test-` prefix and
  deleted by exact filename afterwards — never a blanket `DELETE FROM schema_migrations`, which
  would destroy the real ledger (see the hard rule in `CLAUDE.md`).
- **No automated test drives the runner against production.** Its production path is exercised
  by review and by the `--confirm` guard, not by tests.

## Documentation

`CLAUDE.md` gains a short section fixing the order of operations: write the migration file →
`npm run db:migrate -- staging` → deploy to staging and verify → `npm run db:migrate --
productie --confirm` → promote to production. The existing "Production database access" rule
(ask permission per change) is referenced rather than restated.

## In-flight feature branches

`klanten.klantnr` (VARCHAR(20)) and the `counters` row `klantnummer` (value 6) exist in the
staging database but not in production, and not on `master`. They are **not** hand-made drift:
the branch `worktree-klantnummer` carries `db/migrations/2026-08-08-klantnummer.sql` (including a
backfill and a counter correction) and the matching `db/schema.sql` change. The staging database
is simply ahead of `master` because staging *is* the development database — `npm run dev` and the
test suite both connect to it, so a branch's migration has to be applied there long before it
merges.

This is the normal steady state of the project, not an incident, and the design accommodates it
in two places: the gate treats `applied` ⊇ repo as a pass (section 4), and `db:diff` output is
advisory (section 5).

Two consequences for rollout:

- The baseline seeding in section 1 uses `master`'s filenames. Once `worktree-klantnummer`
  merges, its migration is already applied to staging but *not* recorded in the ledger there.
  The runner must therefore support recording a migration as applied without executing it —
  `npm run db:migrate -- staging --mark-applied <filename>` — for exactly this hand-off. Without
  it the first post-merge deploy would demand a migration that has in fact already run, and
  re-running it would fail on a duplicate column.
- Production has never had `klantnummer` applied, so it will show up as genuinely pending there
  the first time that feature is promoted — which is precisely the gate working as intended.
