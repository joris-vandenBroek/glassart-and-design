# Staging-to-production version promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Production deploys promote a specific, previously-staged commit (tagged `vN`) instead of rebuilding a moving `master` HEAD, with the version number visible in beheer and a rollback path to redeploy any earlier tagged version directly.

**Architecture:** `deploy-naar-staging.yml` computes the next `vN` number, bakes it into the build as `NEXT_PUBLIC_APP_VERSION`, and — only after its smoke check passes — pushes a lightweight git tag `vN` on the deployed commit. `deploy-naar-production.yml` is rewritten onto the same Node.js/Passenger + SFTP deploy pattern staging already uses, but resolves which commit to build from an optional `version` workflow input (falls back to the highest existing `vN` tag) instead of always using `master` HEAD. A small client component reads `NEXT_PUBLIC_APP_VERSION` and renders it in the beheer header.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Vitest + Testing Library, GitHub Actions (`workflow_dispatch`), `wlixcc/SFTP-Deploy-Action`, plain git tags (no semver tooling).

## Global Constraints

- Version numbers are plain incrementing integers formatted `v1`, `v2`, `v3`, ... — exact spec requirement, no semver.
- A staging tag is only created after that run's smoke check passes — never tag a broken build.
- Production must fail loudly (non-zero exit, clear `::error::` message) if it can't resolve a tag to deploy — never silently fall back to `master` HEAD.
- `NEXT_PUBLIC_APP_VERSION` shown on production must be the exact same value that was shown on staging for that commit — computed once by staging, reused (not recomputed) by production.
- The beheer version label renders nothing (no placeholder text) when `NEXT_PUBLIC_APP_VERSION` is unset, e.g. local `npm run dev`.

---

## File Structure

- Create: `src/components/AppVersionLabel.tsx` — client component, mirrors the existing `src/components/StagingBanner.tsx` env-var-gated pattern.
- Create: `tests/components/AppVersionLabel.test.tsx` — mirrors `tests/components/StagingBanner.test.tsx`.
- Modify: `src/app/[locale]/beheer/page.tsx` — render `<AppVersionLabel />` in the header.
- Modify: `.github/workflows/deploy-naar-staging.yml` — compute+bake version number, tag after smoke check.
- Modify (full rewrite): `.github/workflows/deploy-naar-production.yml` — resolve version to deploy, switch to the SFTP/Node.js deploy pattern.
- Modify: `CLAUDE.md` — bring the GitHub/CI section up to date (it currently still describes a deleted `deploy-pages.yml` and calls staging's already-rewritten SFTP deploy "FTP", predating this change).

---

### Task 1: `AppVersionLabel` component

**Files:**
- Create: `src/components/AppVersionLabel.tsx`
- Test: `tests/components/AppVersionLabel.test.tsx`

**Interfaces:**
- Produces: `AppVersionLabel` — a React component, no props, default export not used (named export, matching `StagingBanner`). Reads `process.env.NEXT_PUBLIC_APP_VERSION` (`string | undefined`). Renders `<span data-testid="app-version-label">{version}</span>` when set, `null` otherwise.

- [ ] **Step 1: Write the failing test**

Create `tests/components/AppVersionLabel.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppVersionLabel } from '@/components/AppVersionLabel';

describe('AppVersionLabel', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('shows the version number when NEXT_PUBLIC_APP_VERSION is set', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', 'v12');
    render(<AppVersionLabel />);
    expect(screen.getByTestId('app-version-label')).toHaveTextContent('v12');
  });

  it('renders nothing when NEXT_PUBLIC_APP_VERSION is unset', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '');
    render(<AppVersionLabel />);
    expect(screen.queryByTestId('app-version-label')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/AppVersionLabel.test.tsx`
Expected: FAIL — `Cannot find module '@/components/AppVersionLabel'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/components/AppVersionLabel.tsx`:

```tsx
'use client';

export function AppVersionLabel() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION;

  if (!version) {
    return null;
  }

  return (
    <span
      data-testid="app-version-label"
      className="absolute left-4 top-1/2 -translate-y-1/2 text-xs text-white/40 sm:left-6"
    >
      {version}
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/AppVersionLabel.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/AppVersionLabel.tsx tests/components/AppVersionLabel.test.tsx
git commit -m "feat: add AppVersionLabel, shown when NEXT_PUBLIC_APP_VERSION is set"
```

---

### Task 2: Wire `AppVersionLabel` into the beheer header

**Files:**
- Modify: `src/app/[locale]/beheer/page.tsx`

**Interfaces:**
- Consumes: `AppVersionLabel` from Task 1 (no props).

- [ ] **Step 1: Add the import and render it in the header**

In `src/app/[locale]/beheer/page.tsx`, add the import alongside the existing ones:

```tsx
import { AppVersionLabel } from '@/components/AppVersionLabel';
```

Then render it inside the `GlassPanel`, alongside the existing "Naar de website" link:

```tsx
      <GlassPanel className="relative mx-auto mb-6 !max-w-none !py-5 text-center">
        <h1 className="text-2xl font-light text-white sm:text-3xl">{t('title')}</h1>
        <AppVersionLabel />
        <Link
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-white/60 hover:text-white sm:right-6"
        >
          {t('naarWebsiteLink')}
        </Link>
      </GlassPanel>
```

(`AppVersionLabel` is absolutely positioned on the left via its own className, mirroring the `Link`'s absolute positioning on the right — placement in the JSX doesn't affect layout, but keeping it next to the title reads clearly.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/beheer/page.tsx"
git commit -m "feat: show app version in beheer header"
```

---

### Task 3: Tag staged versions in `deploy-naar-staging.yml`

**Files:**
- Modify: `.github/workflows/deploy-naar-staging.yml`

**Interfaces:**
- Produces: a lightweight git tag `vN` (highest existing `v[0-9]+` tag + 1, or `v1` if none exist) on `github.sha`, pushed to `origin`, but only once every prior step in the job (build, deploy, smoke check) has succeeded. Also produces the `NEXT_PUBLIC_APP_VERSION` build-time env var consumed by `AppVersionLabel` (Task 1).

- [ ] **Step 1: Replace the file**

Replace the full contents of `.github/workflows/deploy-naar-staging.yml` with:

```yaml
name: Deploy naar Staging

on:
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: "staging"
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          # Full history + tags needed so "Compute next version number" below can see
          # every existing vN tag, not just what a shallow clone would include.

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Compute next version number
        id: version
        run: |
          if [ "${{ github.ref }}" != "refs/heads/master" ]; then
            echo "tag=" >> "$GITHUB_OUTPUT"
            echo "Not master -- feature-branch staging deploys aren't versioned (no promotable vN, no beheer version label)."
            exit 0
          fi
          latest=$(git tag -l 'v[0-9]*' | sed 's/^v//' | sort -n | tail -1)
          if [ -z "$latest" ]; then
            next=1
          else
            next=$((latest + 1))
          fi
          echo "tag=v$next" >> "$GITHUB_OUTPUT"
          echo "Next version: v$next"
        # Only computes the candidate number -- the actual git tag is created and pushed
        # in "Tag staged version" below, and ONLY after the smoke check passes. A failed
        # build/deploy/smoke-check simply skips that number; gaps are expected/harmless.
        # Non-master runs deliberately get an empty tag: NEXT_PUBLIC_APP_VERSION ends up
        # unset, so AppVersionLabel shows nothing (same as local dev) instead of a version
        # number that could collide with -- or be confused for -- a real promotable build.

      - name: Build (server mode)
        run: npm run build
        env:
          NEXT_PUBLIC_ENVIRONMENT_LABEL: 'staging'
          NEXT_PUBLIC_APP_VERSION: ${{ steps.version.outputs.tag }}
          NEXT_PUBLIC_MAIL_ENDPOINT_URL: ${{ vars.NEXT_PUBLIC_MAIL_ENDPOINT_URL }}
          NEXT_PUBLIC_MAIL_SECRET: ${{ secrets.NEXT_PUBLIC_MAIL_SECRET }}
          NEXT_PUBLIC_UPLOAD_ENDPOINT_URL: ${{ vars.NEXT_PUBLIC_UPLOAD_ENDPOINT_URL }}
          NEXT_PUBLIC_UPLOAD_SECRET: ${{ secrets.NEXT_PUBLIC_UPLOAD_SECRET }}
        # No MIJNHOST_BUILD here: staging stays fully open (no Under Construction gate),
        # unlike production. DB_HOST/PORT/USER/PASSWORD/NAME and
        # MAIL_SERVER_RESET_ENDPOINT_URL are runtime-only (read by getPool() and
        # sendResetEmail() at request time, not baked in at build time) and are already
        # set directly in the Node.js app's DirectAdmin environment-variables panel --
        # this workflow doesn't need to touch them.

      - name: Assemble deploy payload
        run: |
          rm -rf deploy_payload
          mkdir deploy_payload
          cp -r .next public messages src deploy_payload/
          rm -rf deploy_payload/.next/cache
          cp app.js next.config.mjs package.json package-lock.json deploy_payload/
        # node_modules deliberately excluded -- on this host it's a symlink into a
        # DirectAdmin-managed nodeenv location (visible as `Lrwxrwxrwx` in File Manager),
        # not a plain directory. Trying to upload a real node_modules folder over it fails
        # ("path canonicalization failed"). Managing it is DirectAdmin's "Run NPM Install"
        # button's job, not this workflow's -- see the manual-steps reminder below.

      - name: Upload build to staging Node.js app via SFTP
        uses: wlixcc/SFTP-Deploy-Action@v1.2.6
        with:
          server: ${{ vars.STAGING_FTP_HOST }}
          port: 22
          username: ${{ secrets.STAGING_FTP_USERNAME }}
          password: ${{ secrets.STAGING_FTP_PASSWORD }}
          sftp_only: true
          # Plain FTP/FTPS to this host fails after tens of minutes with "425 Unable to
          # build data connection" -- reproduced identically from a local session and
          # from GitHub Actions, so it's a server-side passive-mode/data-channel problem,
          # not fixable client-side. SFTP tunnels everything over the one already-open
          # connection (confirmed listening: `h64.mijn.host:22` answers with
          # "SSH-2.0-mod_sftp") and has no separate data-channel step to fail.
          #
          # The Node.js app's real "Application root" (confirmed directly in DirectAdmin's
          # Node.js app screen) is a standalone top-level folder, staging.glassartanddesign.
          # com/, a SIBLING of domains/ itself -- not nested inside domains/ at all. Earlier
          # attempts pointed at domains/staging.glassartanddesign.com/glassartanddesign.com/,
          # a real but unrelated, never-executed folder that kept accumulating extra
          # nesting from path experiments. The staging-deploy FTP account's custom
          # directory is now set directly to the true top-level folder, so remote_path
          # here is just "/".
          #
          # local_path uses "*" (not ".*") deliberately: this only matches non-hidden
          # entries (messages/public/src), which is fine here because .next is uploaded
          # separately below -- shell globbing here doesn't expand dotfiles/dotdirs, so a
          # bare "*" would otherwise silently skip .next with no error.
          local_path: './deploy_payload/*'
          remote_path: '/'
          # Retries the underlying sftp client's own connection attempt a few times
          # before giving up, so a one-off "Network unreachable" blip (seen once already)
          # doesn't fail the whole run and require a manual re-dispatch.
          sftpArgs: '-o ConnectionAttempts=5 -o ConnectTimeout=15'
        # sftp_only skips remote directory auto-creation for remote_path itself (must
        # already exist, which it does), but nested folders inside an uploaded directory
        # are still created via SFTP's own MKDIR, no shell needed -- as long as the
        # top-level target folder already exists (confirmed for messages/public/src from
        # the original manual deploy). No delete_remote_files: this only PUTs files that
        # exist locally, it never removes anything not in deploy_payload/ -- tmp/ and
        # stderr.log (Node.js Selector-managed) are left alone by construction.

      - name: Upload .next build via SFTP
        uses: wlixcc/SFTP-Deploy-Action@v1.2.6
        with:
          server: ${{ vars.STAGING_FTP_HOST }}
          port: 22
          username: ${{ secrets.STAGING_FTP_USERNAME }}
          password: ${{ secrets.STAGING_FTP_PASSWORD }}
          sftp_only: true
          local_path: './deploy_payload/.next/*'
          remote_path: '/.next'
          sftpArgs: '-o ConnectionAttempts=5 -o ConnectTimeout=15'
        # Separate step because .next is a dotdir the main step's "*" glob can't see (see
        # comment above). remote_path /.next already exists (from the original manual
        # deploy), so this only needs to write/overwrite files inside it, not create it.

      - name: Manual restart reminder
        run: |
          echo '::warning::Staging is uploaded but NOT restarted -- DirectAdmin Node.js app has no API for this, only UI buttons. If package.json/package-lock.json changed, click Run NPM Install first, then always click RESTART -- otherwise the site keeps serving the previous build.'
          {
            echo '## :warning: Manual steps required'
            echo ''
            echo 'Files are uploaded to staging, but the Node.js app was **not** restarted automatically, and dependencies were **not** installed automatically -- DirectAdmin Node.js Selector has no API for start/restart/npm-install, only web UI buttons (none of the 269 endpoints in its own Swagger spec relate to Node.js/unit/passenger), and the restart.txt Passenger convention does not get picked up on this host either.'
            echo ''
            echo '1. If `package.json` or `package-lock.json` changed in this deploy, go to DirectAdmin, open the staging Node.js app, and click **Run NPM Install** (node_modules is a symlink into a DirectAdmin-managed location, so this workflow cannot upload it directly).'
            echo '2. Always click **RESTART** afterwards -- this is what makes the new deploy actually take effect.'
          } >> "$GITHUB_STEP_SUMMARY"
        # Tried tmp/restart.txt (standard Passenger convention) as a separate, narrowly
        # scoped upload first -- landed fine but the app kept serving the old build, so
        # this host's Node.js Selector doesn't watch that file. Removed rather than left
        # in as a no-op.

      - name: Smoke check
        env:
          BASIC_AUTH_PASSWORD: ${{ secrets.STAGING_BASIC_AUTH_PASSWORD }}
        run: |
          sleep 5
          attempt=1
          max_attempts=3
          status=""
          while [ "$attempt" -le "$max_attempts" ]; do
            status=$(curl -s -o /dev/null -w "%{http_code}" -u "glassart:$BASIC_AUTH_PASSWORD" "https://staging.glassartanddesign.com/nl/")
            if [ "$status" = "200" ]; then
              break
            fi
            echo "Attempt $attempt/$max_attempts: staging did not respond with 200 (got $status)"
            attempt=$((attempt + 1))
            if [ "$attempt" -le "$max_attempts" ]; then
              sleep 5
            fi
          done
          if [ "$status" != "200" ]; then
            echo "Staging did not respond with 200 after $max_attempts attempts (last status: $status)"
            exit 1
          fi

      - name: Tag staged version
        if: github.ref == 'refs/heads/master'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git tag "${{ steps.version.outputs.tag }}" "${{ github.sha }}"
          git push origin "${{ steps.version.outputs.tag }}"
          echo "Tagged and pushed ${{ steps.version.outputs.tag }} -- production can now promote this exact commit."
        # Master-only: staging itself can be dispatched from any branch for review, but
        # only a master commit is allowed to become a promotable vN version -- this is
        # what makes production's own master-ref guard meaningful instead of trivially
        # true. Also placed after the smoke check, so this only runs once build, deploy,
        # and smoke check have all succeeded -- but that means the tag says "built and
        # uploaded successfully", not "a human reviewed this version on staging". Actually
        # verifying the new version (after the manual RESTART above) is still the
        # developer's job before ever promoting it to production.
```

- [ ] **Step 2: Validate YAML syntax**

Run: `npx js-yaml .github/workflows/deploy-naar-staging.yml`
Expected: no error output (prints the parsed document).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-naar-staging.yml
git commit -m "feat: tag staged builds with an incrementing vN version after smoke check"
```

---

### Task 4: Rewrite `deploy-naar-production.yml` to promote a tagged staging version

**Files:**
- Modify: `.github/workflows/deploy-naar-production.yml`

**Interfaces:**
- Consumes: `vN` git tags produced by Task 3.
- Produces: `${{ steps.version.outputs.tag }}` — the resolved version tag (e.g. `v12`), used both for `git checkout` and as the `NEXT_PUBLIC_APP_VERSION` build env var.

- [ ] **Step 1: Replace the file**

Replace the full contents of `.github/workflows/deploy-naar-production.yml` with:

```yaml
name: Deploy naar Production

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Version tag to deploy (e.g. v9). Leave blank to deploy the latest version that was sent to staging.'
        required: false
        default: ''

permissions:
  contents: read

concurrency:
  group: "production"
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    # Only checks which ref this workflow itself was dispatched against -- the real
    # guarantee that a vN tag always points at a master commit comes from staging's
    # "Tag staged version" step being master-gated too (see deploy-naar-staging.yml).
    if: github.ref == 'refs/heads/master'
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          # Full history + tags needed to resolve the vN tag to deploy below.

      - name: Resolve version to deploy
        id: version
        env:
          INPUT_VERSION: ${{ inputs.version }}
        run: |
          input_version="$INPUT_VERSION"
          if [ -n "$input_version" ]; then
            tag="$input_version"
            if ! git rev-parse "refs/tags/$tag" >/dev/null 2>&1; then
              echo "::error::Tag $tag not found -- refusing to deploy an unresolvable version."
              exit 1
            fi
          else
            latest=$(git tag -l 'v[0-9]*' | sed 's/^v//' | sort -n | tail -1)
            if [ -z "$latest" ]; then
              echo "::error::No vN tags found in this repo -- nothing has been sent to staging yet, refusing to deploy master HEAD directly."
              exit 1
            fi
            tag="v$latest"
          fi
          if ! echo "$tag" | grep -Eq '^v[0-9]+$'; then
            echo "::error::Resolved tag '$tag' does not match the required ^v[0-9]+\$ format -- refusing to use it."
            exit 1
          fi
          echo "tag=$tag" >> "$GITHUB_OUTPUT"
          echo "Deploying version: $tag"
        # Default behavior (blank input) promotes the latest version that was staged and
        # tagged by deploy-naar-staging.yml. An explicit input value redeploys that exact
        # tagged commit instead -- this is the rollback path, no new staging round needed.
        # INPUT_VERSION is read via env: rather than interpolated straight into the script
        # body, and the resolved tag (either branch) is validated against ^v[0-9]+$ before
        # use -- workflow_dispatch inputs are attacker-controlled text substituted before
        # bash ever parses the script, so a raw ${{ inputs.version }} here would let a
        # crafted dispatch value inject arbitrary shell into a runner holding production
        # secrets. Once this output is guaranteed to be v-plus-digits, every later
        # steps.version.outputs.tag reference in this file is inherently safe to
        # interpolate.

      - name: Checkout resolved version
        run: git checkout "${{ steps.version.outputs.tag }}"

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build (server mode)
        run: npm run build
        env:
          MIJNHOST_BUILD: 'true'
          NEXT_PUBLIC_APP_VERSION: ${{ steps.version.outputs.tag }}
          NEXT_PUBLIC_MAIL_ENDPOINT_URL: ${{ vars.NEXT_PUBLIC_MAIL_ENDPOINT_URL }}
          NEXT_PUBLIC_MAIL_SECRET: ${{ secrets.NEXT_PUBLIC_MAIL_SECRET }}
          NEXT_PUBLIC_UPLOAD_ENDPOINT_URL: ${{ vars.NEXT_PUBLIC_UPLOAD_ENDPOINT_URL }}
          NEXT_PUBLIC_UPLOAD_SECRET: ${{ secrets.NEXT_PUBLIC_UPLOAD_SECRET }}
        # MIJNHOST_BUILD=true gates collecties/word-klant/inloggen/account/contact behind
        # the Under Construction page in production, per src/config/pageAvailability.ts --
        # beheer is always live regardless. NEXT_PUBLIC_APP_VERSION is set to the SAME
        # tag resolved above, not recomputed, so the beheer version label on production
        # always matches the version that was actually approved on staging (or the
        # rollback target). NEXT_PUBLIC_FIREBASE_* vars are gone -- Firebase was fully
        # removed from the app, those env vars no longer do anything.
        # NEXT_PUBLIC_UPLOAD_SECRET was missing from this build step before this rewrite
        # (staging's build step already had it) -- added here to match, since
        # useKunstwerkFotoUpload.ts needs it baked in the same way on both environments.

      - name: Assemble deploy payload
        run: |
          rm -rf deploy_payload
          mkdir deploy_payload
          cp -r .next public messages src deploy_payload/
          rm -rf deploy_payload/.next/cache
          cp app.js next.config.mjs package.json package-lock.json deploy_payload/
        # Same shape as the equivalent step in deploy-naar-staging.yml -- node_modules
        # deliberately excluded (managed via DirectAdmin's "Run NPM Install" button, see
        # the manual restart reminder below).

      - name: Upload build to production Node.js app via SFTP
        uses: wlixcc/SFTP-Deploy-Action@v1.2.6
        with:
          server: ${{ vars.PRODUCTION_SFTP_HOST }}
          port: 22
          username: ${{ secrets.PRODUCTION_SFTP_USERNAME }}
          password: ${{ secrets.PRODUCTION_SFTP_PASSWORD }}
          sftp_only: true
          local_path: './deploy_payload/*'
          remote_path: '/'
          sftpArgs: '-o ConnectionAttempts=5 -o ConnectTimeout=15'
        # KNOWN UNKNOWN: PRODUCTION_SFTP_HOST/USERNAME/PASSWORD are intentionally NEW
        # secret/variable names, not yet created -- deliberately distinct from the OLD
        # PRODUCTION_FTP_HOST/USERNAME/PASSWORD ones, which belong to the old
        # static-export FTP account (uploads straight into public_html/, alongside
        # mail-server/ and upload-server/) and are left untouched/unused here in case
        # anything else still needs them. The production Node.js app has its own
        # separate, isolated "Application root" folder -- same shape as staging's, see
        # above -- with no overlap with public_html or the PHP endpoints, so reusing the
        # old FTP account's credentials here (if it happens to also have SFTP access)
        # would risk silently uploading to the wrong directory while still reporting a
        # green run. Using brand-new names means the SFTP steps fail loudly with a
        # missing/empty credential error on the first dispatch instead -- create
        # PRODUCTION_SFTP_HOST/USERNAME/PASSWORD (`gh variable set` / `gh secret set`)
        # pointing at a dedicated SFTP-capable DirectAdmin account for the production
        # Node.js app's actual Application root -- mirroring how staging needed its own
        # distinct SFTP account -- BEFORE the first dispatch of this workflow. Unlike the
        # old workflow, no `exclude` for mail-server/upload-server is needed here: the
        # Node.js app root is entirely separate from public_html by construction, there's
        # nothing to accidentally wipe.

      - name: Upload .next build via SFTP
        uses: wlixcc/SFTP-Deploy-Action@v1.2.6
        with:
          server: ${{ vars.PRODUCTION_SFTP_HOST }}
          port: 22
          username: ${{ secrets.PRODUCTION_SFTP_USERNAME }}
          password: ${{ secrets.PRODUCTION_SFTP_PASSWORD }}
          sftp_only: true
          local_path: './deploy_payload/.next/*'
          remote_path: '/.next'
          sftpArgs: '-o ConnectionAttempts=5 -o ConnectTimeout=15'
        # Separate step because .next is a dotdir the main step's "*" glob can't see.

      - name: Manual restart reminder
        run: |
          echo '::warning::Production is uploaded but NOT restarted -- DirectAdmin Node.js app has no API for this, only UI buttons. If package.json/package-lock.json changed, click Run NPM Install first, then always click RESTART -- otherwise the site keeps serving the previous build.'
          {
            echo '## :warning: Manual steps required'
            echo ''
            echo 'Files are uploaded to production, but the Node.js app was **not** restarted automatically, and dependencies were **not** installed automatically -- DirectAdmin Node.js Selector has no API for start/restart/npm-install, only web UI buttons.'
            echo ''
            echo '1. If `package.json` or `package-lock.json` changed in this deploy, go to DirectAdmin, open the production Node.js app, and click **Run NPM Install**.'
            echo '2. Always click **RESTART** afterwards -- this is what makes the new deploy actually take effect.'
          } >> "$GITHUB_STEP_SUMMARY"

      - name: Smoke check
        run: |
          sleep 5
          attempt=1
          max_attempts=3
          status=""
          while [ "$attempt" -le "$max_attempts" ]; do
            status=$(curl -s -o /dev/null -w "%{http_code}" "https://glassartanddesign.com/nl/")
            if [ "$status" = "200" ]; then
              break
            fi
            echo "Attempt $attempt/$max_attempts: production did not respond with 200 (got $status)"
            attempt=$((attempt + 1))
            if [ "$attempt" -le "$max_attempts" ]; then
              sleep 5
            fi
          done
          if [ "$status" != "200" ]; then
            echo "Production did not respond with 200 after $max_attempts attempts (last status: $status)"
            exit 1
          fi

          gate_body=$(curl -s "https://glassartanddesign.com/nl/collecties/")
          if ! echo "$gate_body" | grep -q "We zijn met iets moois bezig"; then
            echo "::error::Under Construction-gate lijkt niet actief op /nl/collecties/ -- controleer of MIJNHOST_BUILD=true echt is meegegeven aan de build."
            exit 1
          fi
```

- [ ] **Step 2: Validate YAML syntax**

Run: `npx js-yaml .github/workflows/deploy-naar-production.yml`
Expected: no error output (prints the parsed document).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-naar-production.yml
git commit -m "feat: rewrite production deploy to promote a tagged staging version"
```

---

### Task 5: Bring `CLAUDE.md`'s GitHub/CI section up to date

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Replace the GitHub/CI section**

In `CLAUDE.md`, replace the entire `## GitHub / CI` section (from the `## GitHub / CI` heading through the end of the file) with:

```markdown
## GitHub / CI

**Hard rule: never dispatch `deploy-naar-production.yml` without first deploying the same commit to staging and verifying it there.** This is a standing client/team rule, not a per-request judgment call — always deploy to staging first, confirm it looks right, then deploy to production. Don't offer or trigger a production deploy as a shortcut just because a fix is small or was already verified locally/in the dev preview.

- `master` is the only branch production deploys from (enforced in the workflow itself, not just by convention).
- There is no local database: local dev (`npm run dev`) and the test suite both connect to the same shared MySQL **staging** database on mijn.host via `.env.local` (`DB_HOST`/`DB_USER`/etc., see `.env.local.example`) — there's no throwaway/local MySQL instance to set up.
- Two `workflow_dispatch` GitHub Actions live in `.github/workflows/` (GitHub Pages deployment was retired once the app moved to server mode — Next.js server mode can't run as a static Pages site):
  - `deploy-naar-staging.yml` — builds in server mode and SFTP-deploys to the `staging.glassartanddesign.com` Node.js app on mijn.host (Basic Auth via `.htaccess`). On every successful run (build + deploy + smoke check all pass), it also computes the next `vN` version number, bakes it into the build as `NEXT_PUBLIC_APP_VERSION` (shown in the beheer header via `AppVersionLabel`), and pushes a git tag `vN` on the deployed commit.
  - `deploy-naar-production.yml` — only runs when dispatched against `refs/heads/master`. Resolves which commit to deploy from an optional `version` input (e.g. `v9`); left blank, it promotes the highest existing `vN` tag — i.e. the latest version that was sent to staging. Builds that exact commit in server mode with `MIJNHOST_BUILD=true` and the same `NEXT_PUBLIC_APP_VERSION` staging showed, then SFTP-deploys to the production Node.js app. Passing an explicit `version` redeploys that tag directly — the rollback path, no new staging round required. Fails loudly (no silent fallback to `master` HEAD) if no tag can be resolved.
- Both workflows target dedicated DirectAdmin Node.js Selector apps (Passenger-style, `app.js` as the startup file, not `next start`) — see `docs/superpowers/plans/2026-07-23-firebase-to-mysql-migration.md` (Task 25) and `docs/superpowers/specs/2026-07-29-staging-to-production-version-promotion-design.md` for the full history and design behind this setup.
- DirectAdmin's Node.js Selector has no API for restart/npm-install, only UI buttons — every deploy run ends with a `::warning::` and a job-summary reminder to manually click **Run NPM Install** (only if `package.json`/`package-lock.json` changed) and **RESTART** in DirectAdmin. A successful workflow run does NOT mean the new build is live yet.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update GitHub/CI section for the version-promotion deploy flow"
```

---

### Task 6: Manual end-to-end verification (requires live dispatches)

This can't be automated or verified without actually running the workflows against the real mijn.host infrastructure. Each dispatch needs your explicit go-ahead first, per the standing deploy-confirmation rule — including production, even for a same-version redeploy.

- [ ] **Step 1: Dispatch staging** (`gh workflow run deploy-naar-staging.yml`) and confirm:
  - The run succeeds through the smoke check.
  - A new `vN` tag was pushed: `git fetch --tags && git tag -l 'v*' | sort -V | tail -1`
  - After manually clicking Run NPM Install (if needed) + RESTART in DirectAdmin, `https://staging.glassartanddesign.com/nl/beheer` shows that same `vN` in the header.

- [ ] **Step 2: Dispatch production with a blank `version` input** (`gh workflow run deploy-naar-production.yml`) and confirm:
  - It resolves and deploys the same `vN` tag staging just produced (check the run log for "Deploying version: vN").
  - **`PRODUCTION_SFTP_HOST`/`PRODUCTION_SFTP_USERNAME`/`PRODUCTION_SFTP_PASSWORD` must be created before this first dispatch**, not just adjusted if wrong (see the "KNOWN UNKNOWN" comment in Task 4) — check DirectAdmin's Node.js app screen for the production app's real Application root, create a dedicated SFTP-capable account for it, and set the three new secrets/variables (`gh secret set` / `gh variable set`) accordingly, the same way staging needed its own distinct SFTP account.
  - After manually clicking Run NPM Install (if needed) + RESTART, `https://glassartanddesign.com/nl/beheer` shows the identical `vN`.

- [ ] **Step 3: Verify the rollback path** — dispatch production again with an explicit older `version` input (e.g. the tag from before Step 1, if one exists) and confirm the deployed commit and the beheer header's version both match that older tag, not the latest one.

---

## Self-Review Notes

- **Spec coverage:** versioning mechanism (Task 3), beheer visibility (Tasks 1–2), production promotion + rollback input (Task 4), error handling for missing/unresolvable tags (Task 4's `Resolve version to deploy` step), CLAUDE.md staleness noted in the spec's non-goals region but directly entangled with Task 4 (Task 5), manual verification plan (Task 6) — all covered.
- **Type consistency:** `AppVersionLabel` (Task 1) is consumed by name in Task 2 with no props, matching its defined signature. `steps.version.outputs.tag` is produced identically (same step id `version`, same output key `tag`) in both Task 3 and Task 4, and both compute "highest existing `v[0-9]+` tag" with the same `sed`/`sort -n` logic — kept duplicated deliberately (YAGNI: not worth a composite action for two nearly-identical five-line snippets in two files).
- **No placeholders:** all steps contain complete, runnable code — no TBDs.
