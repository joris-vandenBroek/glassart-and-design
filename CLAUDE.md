# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # start Next.js dev server
npm run build            # production build (see MIJNHOST_BUILD note below)
npm start                # start production server via app.js (Passenger-compatible)
npm run lint             # next lint
npm test                 # vitest run (all tests, single run — not watch mode)
npx vitest run tests/app/api/klanten.test.ts   # run a single test file
npx vitest run -t "some test name"             # run tests matching a name
npm run test:regression  # opt-in staging regression suite (tests/regression/**) — excluded from `npm test`, see below
```

**Production builds for mijn.host must set `MIJNHOST_BUILD=true`** (PowerShell: `$env:MIJNHOST_BUILD='true'; npm run build`). `src/config/pageAvailability.ts` reads this flag to gate `collecties`/`word-klant`/`inloggen`/`account`/`contact` behind the Under Construction page; `beheer` is always live. A plain `npm run build` leaves those routes fully public.

### Tests run against a real shared database

Vitest is **not** mocking the database — `tests/setup.ts` loads `.env.local` and API-route tests connect to the real MySQL staging database (`getPool()` in `src/lib/server/db.ts`) configured there. `vitest.config.ts` sets `fileParallelism: false` deliberately: several API test files still do scoped `DELETE FROM <table> WHERE ...` cleanup in `beforeEach`/`afterEach`, and running files in parallel can cause one file's cleanup to race another's in-flight rows. Don't re-enable parallelism without addressing that.

**Hard rule: test cleanup must never delete data added through the application, even a table that happens to be empty right now.** Staging holds real migrated/admin-entered data (catalog lookup tables, medewerker accounts, instellingen) — a blanket `DELETE FROM <table>` / `TRUNCATE` with no `WHERE` will silently destroy it on the next full-suite run, and did exactly that at least twice before this rule was written down. Every test that touches the real database must scope its own cleanup to exactly the row(s) it created (by captured id in `afterEach`, or by an obviously-fake marker like an `@example.com` email or a `test-`-prefixed literal id when the id can't be captured directly) — never assume the table is or should be empty, never resolve "the row I just made" via list-ordering (`list()[0]`), and never reset a real generated-sequence counter (e.g. an order-number counter) for determinism — compute the expected value relative to the counter's current state instead.

### Opt-in staging regression suite (`tests/regression/`)

`tests/regression/staging-scenarios.test.ts` automates the cross-cutting scenarios from the manual "Deel C" section of `Testscript-Staging-GlassartDesign.docx` (klant-kunstenaar exclusiviteit, kunstenaarsopslag + prijsgroep prijsopbouw, bestellingen van meerdere klanten combineren + niet-standaard drukker kiezen). It's excluded from the default `npm test` run (see `vitest.config.ts`'s `exclude`) and only runs via `npm run test:regression` (its own `vitest.regression.config.ts`), since it's heavier than the rest of the suite and worth running deliberately rather than on every save.

It follows the same real-staging-database, no-production-possible, scoped-cleanup rules as the rest of the suite (see above), with two extra guarantees worth preserving if you extend it: every fixture it creates is prefixed `AUTOTEST`/`autotest-` and deleted by exact id in a `finally` block (not `afterEach`, so cleanup still runs even if an assertion throws mid-test), and it never triggers a real e-mail — "versturen naar drukker" in the real app is a client-side `fetch()` to an external mail relay (`VersturenNaarDrukkerDialog.tsx`), and this suite only exercises the server-side effects of that action (recording a `drukkerZending`, flipping bestelheader statuses) via the same API routes, never the mail relay itself. The one deliberate exception to "leaves staging exactly as it found it" is `counters.bestelnummer`, which — per the hard rule above — must never be reset, so each run permanently advances the real bestelnummer counter by a few numbers.

## Architecture

**Stack**: Next.js 14 (App Router, server mode — not static export), TypeScript, Tailwind, `next-intl` for i18n, raw `mysql2` against MySQL (no ORM), session-cookie auth (no JWT, no Firebase — Firebase was fully removed).

**Server entry**: `app.js` is a custom Node/Passenger-compatible server (required for mijn.host/DirectAdmin hosting) that wraps Next's request handler — `npm start` runs this, not `next start`.

### Data layer

- `db/schema.sql` is the source of truth for the MySQL schema (24 tables: `klanten`, `medewerkers`, `sessions`, `passwordResetTokens`, catalog lookup tables `segmenten`/`stijlen`/`onderwerpen`/`materiaalsoorten`/`materialen`/`maten`/`prijsgroepen`/`prijsmatrix`, `kunstenaars`/`kunstenaarAfspraken`, `drukkers`/`drukkerZendingen`, `kunstwerken`, `instellingen`, `schema_migrations`, `counters`, `bestelheaders`/`bestellines`/`bestelstatusHistorie`, `activiteitenlog`).
- `src/lib/server/db.ts` exposes a single lazily-created `getPool()` connection pool, driven by `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` env vars (see `.env.local.example`).
- `src/lib/server/crud.ts` provides generic `listRows`/`getRow`/`insertRow`/`updateRow`/`deleteRow` helpers (with JSON-column encode/decode support) used by most API routes.
- **`src/lib/server/tableColumns.ts` mirrors `db/schema.sql` and must be kept in sync with it.** `insertRow`/`updateRow` build their column list from the keys of a request body, and column names cannot be parameterised — they go into the SQL as backtick-quoted identifiers. `TABLE_COLUMNS` is the allow-list that bounds that, and an unknown column **throws** rather than being silently dropped (same failure a MySQL `ER_BAD_FIELD_ERROR` used to give). So: a new column needs a migration, an update to `db/schema.sql`, *and* an entry here. `VERBORGEN_KOLOMMEN` in the same file is the inverse — columns `SELECT` must never return, currently `wachtwoordHash` on `klanten`/`medewerkers`.
- `src/lib/server/session.ts` / `password.ts` implement cookie-based sessions and `crypto.scrypt` password hashing — no external auth library.

### API routes (`src/app/api`)

- `src/app/api/[resource]/route.ts` is a **generic catch-all CRUD route** for simple lookup tables. `src/lib/server/lookupResources.ts` is the allow-list (`LOOKUP_RESOURCES`) of which resource names it serves, which JSON columns each has, and whether writes require `authRequired: 'medewerker'`. Any resource not in that map 404s.
- Resources with extra logic (`klanten`, `bestelheaders`/`bestellines`, `activiteitenlog`, `instellingen`, `kunstenaars`/`kunstenaarAfspraken`, `drukkers`-related shipments, `auth`) have their own dedicated route files instead of going through `[resource]` — check `src/lib/server/lookupResources.ts` before assuming a resource is generic.
- `src/lib/server/requireAuth.ts` (`requireMedewerker`) reads the session cookie and gates staff-only reads/writes — there is no Firestore-rules-style layer anymore, so this check is the only thing enforcing it.

### Client data hooks (`src/lib`)

- `useApiCollection` / `useApiRecord` (`src/lib/useApiCollection.ts`, `useApiRecord.ts`) are the generic client-side hooks for consuming the lookup-resource API, including empty-collection auto-seeding (mirrors the old Firestore auto-reseed behavior).
- `useCustomerAuth` / `useAdminAuth` (`src/lib/useCustomerAuth.tsx`, `useAdminAuth.tsx`) wrap the session-based `/api/auth/*` endpoints; customer login/registration call `/api/auth/login` and `/api/auth/register` directly rather than going through the auth hook.

### i18n / routing

- Locale-prefixed routes live under `src/app/[locale]/...` (`nl`/`en`/`de`/`fr`, default `nl`, defined in `src/i18n/routing.ts`). There is no `middleware.ts` — the bare `src/app/page.tsx` is a client component that detects the browser locale (`src/lib/detectLocale.ts`) and redirects to `/{locale}/`.
- `src/config/pageAvailability.ts` is the single on/off switch for which locale-prefixed routes are publicly reachable in a given build (see `MIJNHOST_BUILD` above).

### Non-Next.js server components

- `mail-server/` and `upload-server/` are standalone PHP endpoints (PHPMailer-based mail sending, artwork photo upload) deployed alongside the Next app, not part of it. Each has a git-ignored `config.php` (see the `.example.php` templates) holding an `allowed_origins` CORS allowlist — keep both the dev and production origins in that list when editing.
- **The browser never talks to those PHP endpoints directly, and their shared secret must never get a `NEXT_PUBLIC_` prefix.** Next.js inlines every `NEXT_PUBLIC_*` value into the client bundle, which for a while made `send-mail.php` an open mail relay on our own SMTP account and domain — the secret was readable in the JS, and the endpoint accepts an arbitrary `to`/`subject`/`html`. Client code posts to `/api/mail` and `/api/upload` instead; those server routes hold `MAIL_SECRET`/`UPLOAD_SECRET` and, crucially, resolve the **recipient** themselves (the session's own klant, or the e-mail belonging to a `drukkerId`) rather than taking it from the request. Both deploy workflows supply `MAIL_SECRET`/`UPLOAD_SECRET` (plus the two endpoint URLs) as **runtime** env: a "Runtime-env uploaden" step writes them to `.env.production` in the app root, which Next reads at startup. They are deliberately *not* in the build step's env any more. `src/lib/server/mailRelay.ts` still falls back to the old `NEXT_PUBLIC_*` names, which is what keeps local dev working from an existing `.env.local` — it is inert in production, where the build no longer receives them. Verified concretely: building with all four set puts them in `.next/server/app/api/{mail,upload}/route.js` and **nothing** in `.next/static`, while `MAIL_SECRET` stays a runtime `process.env` lookup. The one thing still outstanding is rotating both shared secrets in `mail-server/config.php` / `upload-server/config.php` and in the GitHub secrets, since the old values were public.

## GitHub / CI

**Hard rule: never dispatch `deploy-naar-production.yml` without first deploying the same commit to staging and verifying it there.** This is a standing client/team rule, not a per-request judgment call — always deploy to staging first, confirm it looks right, then deploy to production. Don't offer or trigger a production deploy as a shortcut just because a fix is small or was already verified locally/in the dev preview.

- `master` is the only branch production deploys from (enforced in the workflow itself, not just by convention).
- There is no local database: local dev (`npm run dev`) and the test suite both connect to the same shared MySQL **staging** database on mijn.host via `.env.local` (`DB_HOST`/`DB_USER`/etc., see `.env.local.example`) — there's no throwaway/local MySQL instance to set up.
- Two `workflow_dispatch` GitHub Actions live in `.github/workflows/` (GitHub Pages deployment was retired once the app moved to server mode — Next.js server mode can't run as a static Pages site):
  - `deploy-naar-staging.yml` — builds in server mode and SFTP-deploys to the `staging.glassartanddesign.com` Node.js app on mijn.host. On every successful run (build + deploy + smoke check all pass) dispatched against `master`, it also computes the next `vN` version number, bakes it into the build as `NEXT_PUBLIC_APP_VERSION` (shown in the beheer header via `AppVersionLabel`), and pushes a git tag `vN` on the deployed commit. A `vN` tag means the build was uploaded successfully and staging was reachable afterward — not that a human has reviewed it; actually checking the new version on staging (after the manual restart, see below) is still the developer's job before ever promoting it to production.
  - `deploy-naar-production.yml` — only runs when dispatched against `refs/heads/master`. Resolves which commit to deploy from an optional `version` input (e.g. `v9`); left blank, it promotes the highest existing `vN` tag — i.e. the latest version that was sent to staging. Builds that exact commit in server mode with `MIJNHOST_BUILD=true` and the same `NEXT_PUBLIC_APP_VERSION` staging showed, then SFTP-deploys to the production Node.js app. Passing an explicit `version` redeploys that tag directly — the rollback path, no new staging round required. Fails loudly (no silent fallback to `master` HEAD) if no tag can be resolved — in particular, no `vN` tags exist until at least one staging run has completed successfully, so a production dispatch before that correctly fails with "no vN tags found," which is expected on a fresh setup, not a bug. The rollback path only rolls back application code — there's no database migration rollback tooling, so check whether `db/schema.sql` changed between the current and target version before rolling back across a schema change.
- Both workflows target dedicated DirectAdmin Node.js Selector apps (Passenger-style, `app.js` as the startup file, not `next start`) — see `docs/superpowers/plans/2026-07-23-firebase-to-mysql-migration.md` (Task 25) and `docs/superpowers/specs/2026-07-29-staging-to-production-version-promotion-design.md` for the full history and design behind this setup.
- DirectAdmin's Node.js Selector has no API for restart/npm-install, only UI buttons — every deploy run ends with a `::warning::` and a job-summary reminder to manually click **Run NPM Install** (only if `package.json`/`package-lock.json` changed) and **RESTART** in DirectAdmin. A successful workflow run does NOT mean the new build is live yet.

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
the branch merged. On `productie` this also requires `--confirm`, same as a real apply.
`npm run db:diff -- <omgevingA> <omgevingB>` compares two environments' actual schemas, which is
the only way to spot a column added by hand that belongs to no migration file.

### Production database access

Claude has working, verified credentials for the production MySQL database (`dv137864_productie` on `h64.mijn.host`, same host as staging), stored in `.env.production.local` (gitignored via the existing `.env*.local` pattern, same convention as `.env.local` for staging) — schema/data changes can be run directly instead of asking the user to run SQL by hand.

**Hard rule: always ask the user for explicit permission before making any change to the production database, every time — a past approval never carries forward to a later change.** Before asking, check whether the currently-deployed production app code is actually compatible with the planned change (e.g. would it still query a column about to be dropped?) and say so explicitly if not — don't silently create a code/schema mismatch the way staging's DB was migrated ahead of staging's deployed code on 2026-07-30.
