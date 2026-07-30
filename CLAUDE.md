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
```

**Production builds for mijn.host must set `MIJNHOST_BUILD=true`** (PowerShell: `$env:MIJNHOST_BUILD='true'; npm run build`). `src/config/pageAvailability.ts` reads this flag to gate `collecties`/`word-klant`/`inloggen`/`account`/`contact` behind the Under Construction page; `beheer` is always live. A plain `npm run build` leaves those routes fully public.

### Tests run against a real shared database

Vitest is **not** mocking the database — `tests/setup.ts` loads `.env.local` and API-route tests connect to the real MySQL staging database (`getPool()` in `src/lib/server/db.ts`) configured there. `vitest.config.ts` sets `fileParallelism: false` deliberately: several API test files still do scoped `DELETE FROM <table> WHERE ...` cleanup in `beforeEach`/`afterEach`, and running files in parallel can cause one file's cleanup to race another's in-flight rows. Don't re-enable parallelism without addressing that.

**Hard rule: test cleanup must never delete data added through the application, even a table that happens to be empty right now.** Staging holds real migrated/admin-entered data (catalog lookup tables, medewerker accounts, instellingen) — a blanket `DELETE FROM <table>` / `TRUNCATE` with no `WHERE` will silently destroy it on the next full-suite run, and did exactly that at least twice before this rule was written down. Every test that touches the real database must scope its own cleanup to exactly the row(s) it created (by captured id in `afterEach`, or by an obviously-fake marker like an `@example.com` email or a `test-`-prefixed literal id when the id can't be captured directly) — never assume the table is or should be empty, never resolve "the row I just made" via list-ordering (`list()[0]`), and never reset a real generated-sequence counter (e.g. an order-number counter) for determinism — compute the expected value relative to the counter's current state instead.

## Architecture

**Stack**: Next.js 14 (App Router, server mode — not static export), TypeScript, Tailwind, `next-intl` for i18n, raw `mysql2` against MySQL (no ORM), session-cookie auth (no JWT, no Firebase — Firebase was fully removed).

**Server entry**: `app.js` is a custom Node/Passenger-compatible server (required for mijn.host/DirectAdmin hosting) that wraps Next's request handler — `npm start` runs this, not `next start`.

### Data layer

- `db/schema.sql` is the source of truth for the MySQL schema (22 tables: `klanten`, `medewerkers`, `sessions`, `passwordResetTokens`, catalog lookup tables `segmenten`/`stijlen`/`onderwerpen`/`materiaalsoorten`/`materialen`/`maten`/`prijsgroepen`/`prijsmatrix`, `kunstenaars`/`kunstenaarAfspraken`, `drukkers`/`drukkerZendingen`, `kunstwerken`, `instellingen`, `counters`, `bestelheaders`/`bestellines`, `activiteitenlog`).
- `src/lib/server/db.ts` exposes a single lazily-created `getPool()` connection pool, driven by `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` env vars (see `.env.local.example`).
- `src/lib/server/crud.ts` provides generic `listRows`/`getRow`/`insertRow`/`updateRow`/`deleteRow` helpers (with JSON-column encode/decode support) used by most API routes.
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

## GitHub / CI

**Hard rule: never dispatch `deploy-naar-production.yml` without first deploying the same commit to staging and verifying it there.** This is a standing client/team rule, not a per-request judgment call — always deploy to staging first, confirm it looks right, then deploy to production. Don't offer or trigger a production deploy as a shortcut just because a fix is small or was already verified locally/in the dev preview.

- `master` is the only branch production deploys from (enforced in the workflow itself, not just by convention).
- There is no local database: local dev (`npm run dev`) and the test suite both connect to the same shared MySQL **staging** database on mijn.host via `.env.local` (`DB_HOST`/`DB_USER`/etc., see `.env.local.example`) — there's no throwaway/local MySQL instance to set up.
- Two `workflow_dispatch` GitHub Actions live in `.github/workflows/`:
  - `deploy-naar-staging.yml` — builds in server mode and SFTP-deploys the Node.js app (`.next`, `public`, `messages`, `src`, `app.js`, `package.json`) to `staging.glassartanddesign.com`'s DirectAdmin Node.js app root. Working end-to-end as of 2026-07-29. `node_modules` is a DirectAdmin-managed symlink and is deliberately not uploaded — after any `package.json` change, manually click "Run NPM Install" then "RESTART" in DirectAdmin's Node.js Selector (no API exists for this).
  - `deploy-naar-production.yml` — only runs when dispatched against `refs/heads/master`.
- GitHub Pages hosting has been retired (repo Pages setting disabled 2026-07-29) and the old `deploy-pages.yml` workflow removed — it served a static export built against Firebase/Firestore, which predates the MySQL migration and no longer works now that the Firebase project has been deleted entirely. GitHub itself is still used for version control / CI, just not for hosting.

**⚠️ Known-stale: `deploy-naar-production.yml` has not been updated for the Next.js server-mode + MySQL migration.** It still runs `npm run build` expecting a static `out/` export and FTP-uploads `./out/` — but the app builds in server mode now (no `output: 'export'` in `next.config.mjs`), so this workflow currently deploys nothing usable. It needs the same rewrite `deploy-naar-staging.yml` already got (SFTP upload of `.next`/`app.js`/etc. to the production Node.js app) before it's trustworthy — see the migration plan's Task 25 (`docs/superpowers/plans/2026-07-23-firebase-to-mysql-migration.md`) for the remaining unchecked steps.

### Production database access

Claude has working, verified credentials for the production MySQL database (`dv137864_productie` on `h64.mijn.host`, same host as staging), stored in `.env.production.local` (gitignored via the existing `.env*.local` pattern, same convention as `.env.local` for staging) — schema/data changes can be run directly instead of asking the user to run SQL by hand.

**Hard rule: always ask the user for explicit permission before making any change to the production database, every time — a past approval never carries forward to a later change.** Before asking, check whether the currently-deployed production app code is actually compatible with the planned change (e.g. would it still query a column about to be dropped?) and say so explicitly if not — don't silently create a code/schema mismatch the way staging's DB was migrated ahead of staging's deployed code on 2026-07-30.
