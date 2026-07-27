# Staging-omgeving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a permanent `staging.glassartanddesign.com` deployment of the current
Firestore-backed static-export site, isolated from production data via a second Firebase
project, deployable only via a manually-triggered GitHub Actions workflow named
"Push naar staging".

**Architecture:** Same Next.js static export (`output: 'export'`) as production and GitHub
Pages today — no server/Passenger/MySQL involved yet (that only applies once the separate,
not-yet-started Firebase→MySQL migration happens). A new GitHub Actions workflow, triggered
only by `workflow_dispatch`, builds the site with a second Firebase project's config and
`NEXT_PUBLIC_ENVIRONMENT_LABEL=staging`, then uploads the `out/` folder plus a
staging-only `.htaccess` (HTTP Basic Auth) to `staging.glassartanddesign.com` on mijn.host
via `rsync` over SSH.

**Tech Stack:** Next.js 14 (App Router, static export), GitHub Actions (`webfactory/ssh-agent`,
`rsync`), Firebase (second project for data isolation), Apache `.htaccess`/`.htpasswd` (Basic
Auth), Vitest + Testing Library (existing).

## Global Constraints

- Static export only (`output: 'export'` in `next.config.mjs`) — no Next.js server mode, no
  MySQL, no Passenger for this plan. That architecture is scoped to the separate, not-yet-
  started Firebase-to-MySQL migration plan.
- Staging build must **not** set `MIJNHOST_BUILD` (so `pageAvailability.ts` keeps every route
  live — no Under Construction gating) and must **not** set `GITHUB_PAGES` (so `basePath`
  stays empty, matching a subdomain root).
- Staging uses its **own Firebase project**, entirely separate from production's
  `glassart-and-design` project — no shared Firestore data.
- The deploy workflow triggers **only** via `workflow_dispatch` — no `push` trigger, per the
  approved spec.
- No secrets or real credentials ever committed to the repo — GitHub repo `vars` for
  non-secret config (matching the existing `deploy-pages.yml` pattern), GitHub `secrets` for
  anything sensitive (SSH key, Basic Auth password).

---

## Task 1: Second Firebase project for staging + rules deploy

**Files:**
- Modify: `.firebaserc`

**Interfaces:**
- Produces: a `staging` Firebase project alias usable by `firebase deploy --project staging`
  and five `STAGING_NEXT_PUBLIC_FIREBASE_*` GitHub repo variables consumed by Task 5's
  workflow.

- [ ] **Step 1 (manual, you): create the Firebase project**

  Go to https://console.firebase.google.com → "Add project" → name it
  `glassart-and-design-staging`. When asked, you can disable Google Analytics (not used by
  the production project either).

- [ ] **Step 2 (manual, you): enable Firestore and Auth**

  In the new project:
  - Firestore Database → Create database → **production mode** → pick the **same region**
    as the existing `glassart-and-design` project (check the existing project's Firestore
    page for its current location if you don't remember it).
  - Authentication → Sign-in method → enable **Email/Password**.

- [ ] **Step 3 (manual, you): register a web app and copy its config**

  Project settings (gear icon) → General → "Your apps" → Add app → Web (`</>`). Name it
  `staging`. After registering, copy the five config values shown
  (`apiKey`, `authDomain`, `projectId`, `messagingSenderId`, `appId`) — you'll paste these in
  Step 5.

- [ ] **Step 4: add the `staging` alias to `.firebaserc`**

  ```json
  {
    "projects": {
      "default": "glassart-and-design",
      "staging": "glassart-and-design-staging"
    }
  }
  ```

- [ ] **Step 5: deploy the existing Firestore rules to the staging project**

  Run (replace nothing — `firestore.rules` is reused as-is, same rules as production):
  ```bash
  firebase deploy --only firestore:rules --project staging
  ```
  Expected output ends with: `✔  Deploy complete!`

- [ ] **Step 6: set the five staging Firebase config values as GitHub repo variables**

  Using the values you copied in Step 3:
  ```bash
  gh variable set STAGING_NEXT_PUBLIC_FIREBASE_API_KEY --body "<apiKey>"
  gh variable set STAGING_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN --body "<authDomain>"
  gh variable set STAGING_NEXT_PUBLIC_FIREBASE_PROJECT_ID --body "<projectId>"
  gh variable set STAGING_NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID --body "<messagingSenderId>"
  gh variable set STAGING_NEXT_PUBLIC_FIREBASE_APP_ID --body "<appId>"
  ```
  Verify with: `gh variable list` — all five `STAGING_NEXT_PUBLIC_FIREBASE_*` names should
  appear.

- [ ] **Step 7: commit**

  ```bash
  git add .firebaserc
  git commit -m "chore: add staging Firebase project alias"
  ```

---

## Task 2: STAGING banner component

**Files:**
- Create: `src/components/StagingBanner.tsx`
- Modify: `src/app/[locale]/layout.tsx`
- Test: `tests/components/StagingBanner.test.tsx`

**Interfaces:**
- Produces: `StagingBanner` — a React component with no props, reads
  `process.env.NEXT_PUBLIC_ENVIRONMENT_LABEL` at render time.
- Consumes: nothing from earlier tasks.

- [ ] **Step 1: write the failing test**

  ```typescript
  // tests/components/StagingBanner.test.tsx
  import { afterEach, describe, expect, it, vi } from 'vitest';
  import { render, screen } from '@testing-library/react';
  import { StagingBanner } from '@/components/StagingBanner';

  describe('StagingBanner', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('shows a staging banner when NEXT_PUBLIC_ENVIRONMENT_LABEL is "staging"', () => {
      vi.stubEnv('NEXT_PUBLIC_ENVIRONMENT_LABEL', 'staging');
      render(<StagingBanner />);
      expect(screen.getByTestId('staging-banner')).toHaveTextContent('STAGING');
    });

    it('renders nothing when NEXT_PUBLIC_ENVIRONMENT_LABEL is unset', () => {
      vi.stubEnv('NEXT_PUBLIC_ENVIRONMENT_LABEL', '');
      render(<StagingBanner />);
      expect(screen.queryByTestId('staging-banner')).not.toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 2: run the test to verify it fails**

  Run: `npx vitest run tests/components/StagingBanner.test.tsx`
  Expected: FAIL — `Cannot find module '@/components/StagingBanner'`

- [ ] **Step 3: write the minimal implementation**

  ```typescript
  // src/components/StagingBanner.tsx
  'use client';

  export function StagingBanner() {
    if (process.env.NEXT_PUBLIC_ENVIRONMENT_LABEL !== 'staging') {
      return null;
    }

    return (
      <div
        data-testid="staging-banner"
        className="w-full bg-yellow-400 text-center text-sm font-semibold text-black py-1"
      >
        STAGING — dit is niet de live site
      </div>
    );
  }
  ```

- [ ] **Step 4: run the test to verify it passes**

  Run: `npx vitest run tests/components/StagingBanner.test.tsx`
  Expected: PASS (2 tests)

- [ ] **Step 5: render it in the root layout**

  In `src/app/[locale]/layout.tsx`, add the import and render it as the first child inside
  `NextIntlClientProvider`:

  ```typescript
  import { NextIntlClientProvider } from 'next-intl';
  import { getMessages, setRequestLocale } from 'next-intl/server';
  import { notFound } from 'next/navigation';
  import { routing } from '@/i18n/routing';
  import { NavBar } from '@/components/NavBar';
  import { StagingBanner } from '@/components/StagingBanner';
  import { CustomerAuthProvider } from '@/lib/useCustomerAuth';
  import { AdminAuthProvider } from '@/lib/useAdminAuth';
  import { CartProvider } from '@/lib/useCart';
  import { MockProfileProvider } from '@/lib/useMockProfile';

  export function generateStaticParams() {
    return routing.locales.map((locale) => ({ locale }));
  }

  export default async function LocaleLayout({
    children,
    params,
  }: {
    children: React.ReactNode;
    params: { locale: string };
  }) {
    const { locale } = params;
    if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
      notFound();
    }
    setRequestLocale(locale);
    const messages = await getMessages();

    return (
      <NextIntlClientProvider messages={messages}>
        <StagingBanner />
        <AdminAuthProvider>
          <CustomerAuthProvider>
            <CartProvider>
              <MockProfileProvider>
                <NavBar />
                {children}
              </MockProfileProvider>
            </CartProvider>
          </CustomerAuthProvider>
        </AdminAuthProvider>
      </NextIntlClientProvider>
    );
  }
  ```

- [ ] **Step 6: run the full test suite to check for regressions**

  Run: `npx vitest run`
  Expected: all tests PASS (no existing test asserts on the exact child list of
  `NextIntlClientProvider`, so this addition should not break anything — if one does, adjust
  that test's expectations, don't remove the banner)

- [ ] **Step 7: commit**

  ```bash
  git add src/components/StagingBanner.tsx src/app/[locale]/layout.tsx tests/components/StagingBanner.test.tsx
  git commit -m "feat: add STAGING banner, shown when NEXT_PUBLIC_ENVIRONMENT_LABEL=staging"
  ```

---

## Task 3: Basic Auth template for the staging deploy

**Files:**
- Create: `deploy/staging.htaccess`

**Interfaces:**
- Produces: a static `.htaccess` file, copied into `out/.htaccess` by Task 5's workflow
  (not part of `public/`, so it never leaks into the GitHub Pages or mijn.host production
  builds).

- [ ] **Step 1: write the template**

  ```apache
  # deploy/staging.htaccess
  AuthType Basic
  AuthName "Glassart & Design — staging"
  AuthUserFile /home/USERNAME/domains/staging.glassartanddesign.com/.htpasswd
  Require valid-user
  ```

  The `AuthUserFile` path's `USERNAME` placeholder is replaced by the workflow at deploy
  time (Task 5, Step 4) using the `STAGING_SSH_USER` secret — DirectAdmin accounts' home
  directories are `/home/<username>/`, and `AuthUserFile` must be an absolute filesystem
  path, not a URL.

- [ ] **Step 2: commit**

  ```bash
  git add deploy/staging.htaccess
  git commit -m "chore: add Basic Auth template for the staging deploy"
  ```

---

## Task 4: mijn.host subdomain + deploy SSH key + CORS allowlist

**Files:** none in the repo (server-side/account configuration + local key generation)

**Interfaces:**
- Produces: `STAGING_SSH_HOST`, `STAGING_SSH_USER`, `STAGING_SSH_PRIVATE_KEY`,
  `STAGING_BASIC_AUTH_PASSWORD` GitHub secrets, consumed by Task 5's workflow.

- [ ] **Step 1 (manual, you): create the subdomain**

  DirectAdmin → Domain Setup / Subdomain Management → Add Sub-Domain → name: `staging` →
  Create. This gives it its own `domains/staging.glassartanddesign.com/public_html/` — a
  separate directory tree from the main domain (confirmed during the earlier `nodetest`
  experiment, not a subfolder of the main domain's `public_html`).

- [ ] **Step 2: generate a dedicated deploy-only SSH keypair**

  ```bash
  ssh-keygen -t ed25519 -C "github-actions-deploy-staging" -f staging_deploy_key -N ""
  ```
  This creates `staging_deploy_key` (private) and `staging_deploy_key.pub` (public) in the
  current directory. Print the public key to paste into DirectAdmin:
  ```bash
  cat staging_deploy_key.pub
  ```

- [ ] **Step 3 (manual, you): install the public key on mijn.host**

  DirectAdmin → Advanced Features (Extra Kenmerken) → SSH Keys → paste the public key
  printed in Step 2 → Save.

- [ ] **Step 4: store the deploy secrets in GitHub**

  ```bash
  gh secret set STAGING_SSH_PRIVATE_KEY < staging_deploy_key
  gh secret set STAGING_SSH_HOST --body "<your mijn.host SSH hostname, e.g. h64.mijn.host>"
  gh secret set STAGING_SSH_USER --body "<your DirectAdmin username>"
  ```
  (`STAGING_SSH_HOST`/`STAGING_SSH_USER`: you'll find both on your mijn.host/DirectAdmin
  account overview page if you don't already know them.)

  Then delete the local key files — they're now only needed inside the GitHub secret:
  ```bash
  rm staging_deploy_key staging_deploy_key.pub
  ```

- [ ] **Step 5: pick and store the Basic Auth password**

  ```bash
  gh secret set STAGING_BASIC_AUTH_PASSWORD --body "<a password you choose>"
  ```
  Share this password with the medewerkers who need staging access (e.g. via your password
  manager) — it's the same password for everyone, per the approved design.

- [ ] **Step 6 (manual, you): add the staging origin to the live CORS allowlist**

  `mail-server/config.php` and `upload-server/config.php` on the **live mijn.host server**
  (git-ignored, not in this repo) each have an `allowed_origins` array. Add
  `'https://staging.glassartanddesign.com'` to both, alongside the existing
  `https://glassartanddesign.com` and `https://joris-vandenbroek.github.io` entries — without
  this, order-confirmation/upload requests from staging will be rejected by CORS.

- [ ] **Step 7: verify SSH connectivity**

  ```bash
  gh secret list
  ```
  Expected: `STAGING_SSH_PRIVATE_KEY`, `STAGING_SSH_HOST`, `STAGING_SSH_USER`,
  `STAGING_BASIC_AUTH_PASSWORD` all listed. (The private key itself can't be tested locally
  since it was deleted in Step 4 — Task 6's first real workflow run is the real connectivity
  test.)

---

## Task 5: "Push naar staging" GitHub Actions workflow

**Files:**
- Create: `.github/workflows/push-naar-staging.yml`

**Interfaces:**
- Consumes: `STAGING_NEXT_PUBLIC_FIREBASE_*` vars (Task 1), `deploy/staging.htaccess`
  (Task 3), `STAGING_SSH_*` + `STAGING_BASIC_AUTH_PASSWORD` secrets (Task 4).
- Produces: a manually-triggerable workflow named "Push naar staging" that builds and
  deploys the site to `staging.glassartanddesign.com`.

- [ ] **Step 1: write the workflow**

  ```yaml
  # .github/workflows/push-naar-staging.yml
  name: Push naar staging

  on:
    workflow_dispatch:

  jobs:
    deploy:
      runs-on: ubuntu-latest
      steps:
        - name: Checkout
          uses: actions/checkout@v4

        - name: Setup Node
          uses: actions/setup-node@v4
          with:
            node-version: '20'
            cache: 'npm'

        - name: Install dependencies
          run: npm ci

        - name: Build static export
          run: npm run build
          env:
            NEXT_PUBLIC_ENVIRONMENT_LABEL: 'staging'
            NEXT_PUBLIC_FIREBASE_API_KEY: ${{ vars.STAGING_NEXT_PUBLIC_FIREBASE_API_KEY }}
            NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: ${{ vars.STAGING_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN }}
            NEXT_PUBLIC_FIREBASE_PROJECT_ID: ${{ vars.STAGING_NEXT_PUBLIC_FIREBASE_PROJECT_ID }}
            NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: ${{ vars.STAGING_NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID }}
            NEXT_PUBLIC_FIREBASE_APP_ID: ${{ vars.STAGING_NEXT_PUBLIC_FIREBASE_APP_ID }}
            NEXT_PUBLIC_MAIL_ENDPOINT_URL: ${{ vars.NEXT_PUBLIC_MAIL_ENDPOINT_URL }}
            NEXT_PUBLIC_MAIL_SECRET: ${{ secrets.NEXT_PUBLIC_MAIL_SECRET }}
            NEXT_PUBLIC_UPLOAD_ENDPOINT_URL: ${{ vars.NEXT_PUBLIC_UPLOAD_ENDPOINT_URL }}

        - name: Install apache2-utils (for htpasswd)
          run: sudo apt-get update && sudo apt-get install -y apache2-utils

        - name: Generate .htpasswd
          run: htpasswd -bc out/.htpasswd glassart "${{ secrets.STAGING_BASIC_AUTH_PASSWORD }}"

        - name: Add Basic Auth .htaccess
          run: |
            sed "s#USERNAME#${{ secrets.STAGING_SSH_USER }}#" deploy/staging.htaccess > out/.htaccess

        - name: Load deploy SSH key
          uses: webfactory/ssh-agent@v0.9.0
          with:
            ssh-private-key: ${{ secrets.STAGING_SSH_PRIVATE_KEY }}

        - name: Upload to staging.glassartanddesign.com
          run: |
            mkdir -p ~/.ssh
            ssh-keyscan -H "${{ secrets.STAGING_SSH_HOST }}" >> ~/.ssh/known_hosts
            rsync -avz --delete out/ \
              "${{ secrets.STAGING_SSH_USER }}@${{ secrets.STAGING_SSH_HOST }}:domains/staging.glassartanddesign.com/public_html/"

        - name: Smoke check
          run: |
            sleep 5
            status=$(curl -s -o /dev/null -w "%{http_code}" -u "glassart:${{ secrets.STAGING_BASIC_AUTH_PASSWORD }}" "https://staging.glassartanddesign.com/nl/")
            if [ "$status" != "200" ]; then
              echo "Staging did not respond with 200 (got $status)"
              exit 1
            fi
  ```

- [ ] **Step 2: commit**

  ```bash
  git add .github/workflows/push-naar-staging.yml
  git commit -m "feat: add manually-triggered Push naar staging deploy workflow"
  ```

---

## Task 6: End-to-end validation

**Files:** none (manual verification of the deployed result)

**Interfaces:**
- Consumes: everything from Tasks 1–5.

- [ ] **Step 1: trigger the workflow**

  ```bash
  gh workflow run "Push naar staging"
  ```

- [ ] **Step 2: watch it run**

  ```bash
  gh run watch
  ```
  Expected: all steps succeed, including the smoke check (HTTP 200).

- [ ] **Step 3: verify Basic Auth**

  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" "https://staging.glassartanddesign.com/nl/"
  ```
  Expected: `401` (no credentials supplied).

  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" -u "glassart:<the password you set>" "https://staging.glassartanddesign.com/nl/"
  ```
  Expected: `200`.

- [ ] **Step 4: verify ungated pages and the banner (manual, browser)**

  Open `https://staging.glassartanddesign.com/nl/collecties/` in a browser (enter the Basic
  Auth credentials when prompted) — it should show the real collections page, not the
  "We zijn met iets moois bezig" Under Construction message, and the yellow
  "STAGING — dit is niet de live site" banner should be visible at the top.

- [ ] **Step 5: verify data isolation (manual, browser + Firebase console)**

  On staging, log into `/beheer` and create a test kunstwerk. Confirm it appears in the
  **`glassart-and-design-staging`** Firebase project's Firestore console
  (`kunstwerken` collection) — and does **not** appear in the production
  `glassart-and-design` project.

- [ ] **Step 6: update the hosting-architecture memory**

  Record in project memory that staging is live, which Firebase project backs it, and that
  it deploys only via `gh workflow run "Push naar staging"` — so future sessions don't
  need to rediscover this by reading the workflow file.
