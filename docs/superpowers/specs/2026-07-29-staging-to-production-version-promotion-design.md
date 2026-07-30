# Staging-to-production version promotion

**Date:** 2026-07-29
**Status:** Approved

## Problem

`deploy-naar-production.yml` currently rebuilds and deploys whatever is on `master` HEAD
at the moment it's dispatched. Combined with the newly-adopted rule "never deploy to
production without deploying to staging first and getting client approval"
(see `CLAUDE.md` GitHub/CI section), this creates a bind: once a build has been sent to
staging for approval, the developer can't keep pushing new commits to `master` for the
*next* piece of work, because a production dispatch would pick up those newer, unreviewed
commits instead of the one the client actually approved.

Production needs to deploy **the exact commit that was last sent to staging**, decoupled
from whatever lands on `master` afterward — plus a human-readable version number so the
developer and client can refer to a specific reviewed build ("versie 12 zag er goed uit").

## Goals

- Production always promotes a specific, previously-staged commit — never a moving
  `master` HEAD.
- A simple, monotonically increasing version number (`v1`, `v2`, `v3`, ...) identifies
  each build that was sent to staging.
- The version number is visible in the app itself (beheer) so it can be referenced in
  conversation with the client.
- Default production behavior: promote the latest staged version. Override available:
  redeploy an older tagged version to production directly (rollback), without needing a
  new staging round first.
- Rewrite `deploy-naar-production.yml` to use the same Node.js/Passenger + SFTP deploy
  pattern already proven for `deploy-naar-staging.yml`, retiring the old static-export +
  Firebase-env-var FTPS process (see `CLAUDE.md`'s "Known-stale" warning, now resolved by
  this change).

## Non-goals

- No semver, no changelog generation, no artifact-copy-between-servers approach — building
  the pinned commit fresh (like today) is sufficient and avoids cross-server credentials.
- No UI beyond a small version label in beheer — no release-notes page, no admin UI to
  browse version history.
- Not addressing the other still-open follow-ups tracked in the migration plan (Task 25)
  or the leftover unused `NEXT_PUBLIC_FIREBASE_*` repo variables — out of scope here.

## Design

### Versioning mechanism

Version numbers are plain incrementing integers, stored as lightweight git tags matching
`v\d+` (e.g. `v1`, `v2`, `v12`) on the exact commit that was deployed to staging.

**Staging workflow (`deploy-naar-staging.yml`) changes:**

1. Before the build step, compute the next version number: find the highest existing tag
   matching `v[0-9]+` (numeric sort), add 1; default to `v1` if none exist.
2. Pass it to the build as `NEXT_PUBLIC_APP_VERSION=vN` (alongside the existing
   `NEXT_PUBLIC_ENVIRONMENT_LABEL=staging` etc.), so it's baked into the build output.
3. Deploy and run the existing smoke check exactly as today.
4. **Only after the smoke check passes**, create a lightweight git tag `vN` on
   `github.sha` and push it. If the build, deploy, or smoke check fails, no tag is
   created — that number is simply skipped on the next run. Gaps in the sequence are
   expected and harmless.
5. Requires bumping workflow permissions from `contents: read` to `contents: write` so
   the default `GITHUB_TOKEN` can push the tag.

The existing `concurrency: group: staging, cancel-in-progress: false` already serializes
staging runs, so two concurrent dispatches can never compute/claim the same number.

### Version visibility in beheer

A small, unobtrusive version label next to the existing "Naar de website" link in
`src/app/[locale]/beheer/page.tsx`, reading `process.env.NEXT_PUBLIC_APP_VERSION` at
build time. When unset (local dev, where this env var is never passed to `npm run dev`),
nothing is rendered — no placeholder text like "v0" or "dev".

### Production workflow rewrite

`deploy-naar-production.yml` is rewritten to mirror `deploy-naar-staging.yml`'s proven
Node.js/Passenger + SFTP pattern (deploy_payload assembly excluding `node_modules`,
separate `.next` upload, manual NPM-install/RESTART reminder in the job summary, smoke
check with retries), replacing the current static-export + FTPS-to-`public_html` process
and its now-defunct `NEXT_PUBLIC_FIREBASE_*` build env vars.

Behavioral change from today:

1. Add an optional `workflow_dispatch` input, `version` (e.g. `v9`), left blank by
   default.
2. Resolution logic:
   - If `version` is blank: find the highest existing `v[0-9]+` tag (same logic as
     staging) — this is "the latest version that was sent to staging."
   - If `version` is provided: use that exact tag, enabling a direct rollback to any
     previously staged version without a new staging round.
   - If no matching tag can be resolved at all (nothing ever staged, or an explicitly
     provided tag doesn't exist), the workflow fails immediately with a clear error
     instead of silently falling back to `master` HEAD or to any other commit.
3. Checkout that tag's commit specifically (not `master`), build with production env
   vars (`MIJNHOST_BUILD=true`, `NEXT_PUBLIC_APP_VERSION=vN` — the *same* number that
   was shown on staging, not a newly computed one) and deploy via SFTP to the
   production Node.js app, same shape as staging's payload assembly and upload steps.
4. Keep the existing production smoke check (200 on `/nl/`, Under Construction gate
   check on `/nl/collecties/`).

**Known unknown:** the existing `PRODUCTION_FTP_USERNAME`/`PRODUCTION_FTP_PASSWORD`/
`PRODUCTION_FTP_HOST` secrets belong to the *old* static-export FTP account
(`public_html`). The production Node.js app (confirmed already provisioned per
`project_hosting_architecture_question` memory) likely needs its own dedicated SFTP
account, the way staging did — discovering the right host/path/protocol took several
iterations for staging (see commit history on `deploy-naar-staging.yml`: switching FTP
to SFTP, correcting the application root, excluding `node_modules`, retry logic). The
same trial-and-error should be expected here and will require DirectAdmin access from
the user during the first real dispatch. Decision: rather than reusing the old
`PRODUCTION_FTP_*` names (which risk silently succeeding against the wrong directory if
that old account also happens to have SFTP access), the workflow references new,
distinct `PRODUCTION_SFTP_*` secret/variable names from the start, so a misconfigured or
not-yet-created target fails loudly instead of silently succeeding against the wrong
directory.

## Error handling / edge cases

- Failed staging build/deploy/smoke-check → no tag created → nothing new to promote;
  production continues to point at the last good `vN`.
- Production dispatched with no `vN` tags in the repo at all → explicit failure, no
  fallback to `master`.
- Production dispatched with a `version` input that doesn't match any existing tag →
  explicit failure ("tag vX not found"), never silently deploys something else.
- Both workflows' existing `concurrency` groups are untouched (`staging` / `production`),
  so runs within each environment still serialize.

## Testing / verification

These are GitHub Actions workflows deploying to real DirectAdmin-hosted infrastructure —
there is no local simulation. Verification happens by actually dispatching:

1. Dispatch staging → confirm a new `vN` tag is pushed, the beheer header shows the
   matching version number on `staging.glassartanddesign.com`, and the smoke check is
   green.
2. Dispatch production (blank `version` input) → confirm it deploys the same commit/
   version staging just approved, the beheer header on `glassartanddesign.com` shows the
   identical `vN`, and the smoke check is green.
3. Separately verify the rollback path by dispatching production with an explicit older
   `version` value and confirming the deployed commit/version matches that tag, not the
   latest one.

Each dispatch requires the user's explicit go-ahead, per the standing "always confirm
before deploying" rule — including production, even for a same-version redeploy.
