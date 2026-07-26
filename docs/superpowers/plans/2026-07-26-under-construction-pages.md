# Under Construction Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a branded "Under Construction" page on `/collecties`, `/word-klant`, `/inloggen`, `/beheer`, `/account` and `/contact` (all four locales) while keeping their existing implementations completely intact underneath, so any of them can be switched back on later with a one-line config change plus a rebuild. Only Home stays live.

**Architecture:** A single config object (`src/config/pageAvailability.ts`) holds one boolean per gated route. Each route's existing `page.tsx` gets one added guard clause — `if (!pageAvailability.x) return <UnderConstruction />;` — placed right after `setRequestLocale(locale)` and before its existing render logic, which is left untouched. `UnderConstruction` is a new shared server component styled like the rest of the site (ink/charcoal background, gold accents, `GlassPanel`), pulling its copy from a new `underConstruction` translations namespace added to all four `messages/*.json` files.

**Tech Stack:** Next.js 14 (App Router, `output: 'export'` static export), `next-intl` (routing/translations), Tailwind CSS, Vitest + Testing Library.

## Global Constraints

- The site is a static export (`next.config.mjs` → `output: 'export'`). `pageAvailability` values are read at build time only — there is no runtime/env-var toggle, and none should be added. Flipping a page back on always means: change the boolean, rebuild, redeploy.
- Do not modify the existing render logic, styling, or tests of the six gated pages (`collecties`, `word-klant`, `inloggen`, `beheer`, `account`, `contact`). Only add the guard clause and its import.
- Do not modify `src/components/NavBar.tsx`, `src/app/[locale]/layout.tsx`, or `src/app/[locale]/page.tsx` (home). Nav links stay visible and clickable; Home stays live and is the only page not gated.
- Every test file that renders a component using the `Link` component from `@/i18n/navigation` must mock that module the same way the existing test suite does:
  ```ts
  vi.mock('@/i18n/navigation', () => ({
    Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
      <a href={href} {...props}>
        {children}
      </a>
    ),
  }));
  ```
- Every test file that renders (or imports, transitively) a page/component that imports `@/lib/firebase` must mock it the same way the existing suite does, to avoid a real Firebase app initializing in jsdom:
  ```ts
  vi.mock('@/lib/firebase', () => ({
    auth: {},
    db: {},
  }));
  ```
- `getTranslations` from `next-intl/server` requires the `react-server` module resolution condition (`node_modules/next-intl/package.json` → `exports['./server']`), which Vitest's default (client) environment does not set — without a mock, it resolves to the client-stub build and throws `getTranslations is not supported in Client Components`. Every test that renders `UnderConstruction` (directly, or indirectly by rendering a gated page whose guard returns it) must mock the module to read from the imported locale messages. Gated `page.tsx` files also call `setRequestLocale(locale)` unconditionally (before the guard), also from `next-intl/server` — since the whole module is mocked, that export must exist too, as a no-op:
  ```ts
  vi.mock('next-intl/server', () => ({
    getTranslations: async (namespace: string) => {
      const namespaceMessages = (messages as unknown as Record<string, Record<string, string>>)[
        namespace
      ];
      return (key: string) => namespaceMessages[key];
    },
    setRequestLocale: () => {},
  }));
  ```
  Additionally, `UnderConstruction` and every gated `page.tsx` are async server components — `@testing-library/react`'s `render()` cannot accept a Promise as a child, so a test that renders `UnderConstruction` directly must await the component call before rendering its resolved element tree (`const ui = await UnderConstruction();`). A gated **page** test needs one more level: `await CollectiesPage(...)` only resolves the page's own promise — the guard's returned `<UnderConstruction />` element is still an unresolved reference to a second async component, and handing it to `render()` as-is throws the same "Promise as child" error (verified empirically — do not mock `UnderConstruction` away to sidestep this, that turns the test into a check that the page returns *some* component named `UnderConstruction`, not that it actually renders the real one). Resolve that second level manually before rendering:
  ```ts
  const page = (await CollectiesPage({ params: { locale: 'nl' } })) as any;
  // `page` is the unresolved `<UnderConstruction />` element the guard returned.
  // UnderConstruction is itself an async server component, so it must be awaited
  // a second time — render() cannot accept a Promise as a child either way.
  const ui = await page.type(page.props);
  render(<NextIntlClientProvider locale="nl" messages={messages}>{ui}</NextIntlClientProvider>);
  ```
  See `tests/components/UnderConstruction.test.tsx` for the single-await reference and the corrected `tests/app/collecties-page.test.tsx` for the double-await reference.
- Follow existing code conventions: Dutch UI copy/JSON keys where the rest of the site uses Dutch, English component/file names, 2-space indented JSON, Tailwind utility classes (no new CSS files).
- Run `npx vitest run <file>` after every test-writing step from the project root (`C:\Temp\Glassart and design`).

---

### Task 1: `pageAvailability` config

**Files:**
- Create: `src/config/pageAvailability.ts`
- Test: `tests/config/pageAvailability.test.ts`

**Interfaces:**
- Produces: `pageAvailability: { collecties: boolean; wordKlant: boolean; inloggen: boolean; beheer: boolean; account: boolean; contact: boolean }`, named export from `@/config/pageAvailability`. Tasks 3–8 import and read one boolean each from this object.

- [ ] **Step 1: Write the failing test**

Create `tests/config/pageAvailability.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { pageAvailability } from '@/config/pageAvailability';

describe('pageAvailability', () => {
  it('has every gated route turned off for the initial under-construction launch', () => {
    expect(pageAvailability).toEqual({
      collecties: false,
      wordKlant: false,
      inloggen: false,
      beheer: false,
      account: false,
      contact: false,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config/pageAvailability.test.ts`
Expected: FAIL — `Failed to resolve import "@/config/pageAvailability"` (or similar module-not-found error).

- [ ] **Step 3: Write minimal implementation**

Create `src/config/pageAvailability.ts`:

```ts
// Central on/off switch for routes that are hidden behind an Under
// Construction page. Read at build time only (the site is a static
// export) — flipping a value requires a rebuild + redeploy.
export const pageAvailability = {
  collecties: false,
  wordKlant: false,
  inloggen: false,
  beheer: false,
  account: false,
  contact: false,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/config/pageAvailability.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/config/pageAvailability.ts tests/config/pageAvailability.test.ts
git commit -m "feat: voeg centrale pageAvailability-config toe"
```

---

### Task 2: `UnderConstruction` component + translations

**Files:**
- Create: `src/components/UnderConstruction.tsx`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json`
- Test: `tests/components/UnderConstruction.test.tsx`

**Interfaces:**
- Consumes: `GlassPanel` from `@/components/GlassPanel` (existing, no changes); `Link` from `@/i18n/navigation` (existing); `getTranslations` from `next-intl/server`; `underConstruction` translation namespace (`eyebrow`, `heading`, `text`, `backHome`) added in this task.
- Produces: `UnderConstruction`, an async server component with no props, named export `UnderConstruction` from `@/components/UnderConstruction`, rendering a root element with `data-testid="under-construction"`. Tasks 3–8 render `<UnderConstruction />` in place of their normal page content.

- [ ] **Step 1: Add the `underConstruction` translations to all four locale files**

In `messages/nl.json`, find this exact block (end of the `nav` section, start of `collectionsPage`):

```json
    "myAccount": "Mijn account"
  },
  "collectionsPage": {
```

Replace it with:

```json
    "myAccount": "Mijn account"
  },
  "underConstruction": {
    "eyebrow": "Binnenkort",
    "heading": "We zijn met iets moois bezig",
    "text": "Deze pagina is in ontwikkeling. Kom binnenkort terug om het resultaat te zien.",
    "backHome": "Terug naar home"
  },
  "collectionsPage": {
```

In `messages/en.json`, find:

```json
    "myAccount": "My account"
  },
  "collectionsPage": {
```

Replace it with:

```json
    "myAccount": "My account"
  },
  "underConstruction": {
    "eyebrow": "Coming soon",
    "heading": "We're working on something beautiful",
    "text": "This page is under construction. Please check back soon.",
    "backHome": "Back to home"
  },
  "collectionsPage": {
```

In `messages/de.json`, find:

```json
    "myAccount": "Mein Konto"
  },
  "collectionsPage": {
```

Replace it with:

```json
    "myAccount": "Mein Konto"
  },
  "underConstruction": {
    "eyebrow": "In Kürze",
    "heading": "Wir arbeiten an etwas Schönem",
    "text": "Diese Seite befindet sich im Aufbau. Schauen Sie bald wieder vorbei.",
    "backHome": "Zurück zur Startseite"
  },
  "collectionsPage": {
```

In `messages/fr.json`, find:

```json
    "myAccount": "Mon compte"
  },
  "collectionsPage": {
```

Replace it with:

```json
    "myAccount": "Mon compte"
  },
  "underConstruction": {
    "eyebrow": "Bientôt",
    "heading": "Nous préparons quelque chose de beau",
    "text": "Cette page est en construction. Revenez bientôt.",
    "backHome": "Retour à l'accueil"
  },
  "collectionsPage": {
```

- [ ] **Step 2: Verify all four JSON files are still valid**

Run: `node -e "['nl','en','de','fr'].forEach(l => require('./messages/'+l+'.json'))"`
Expected: no output, exit code 0 (throws a `SyntaxError` if any file is malformed).

- [ ] **Step 3: Write the failing component test**

Create `tests/components/UnderConstruction.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { UnderConstruction } from '@/components/UnderConstruction';
import messages from '../../messages/nl.json';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const namespaceMessages = (messages as unknown as Record<string, Record<string, string>>)[
      namespace
    ];
    return (key: string) => namespaceMessages[key];
  },
}));

describe('UnderConstruction', () => {
  it('shows the under-construction message and a link back home', async () => {
    const ui = await UnderConstruction();
    render(<NextIntlClientProvider locale="nl" messages={messages}>{ui}</NextIntlClientProvider>);

    expect(await screen.findByTestId('under-construction')).toBeInTheDocument();
    expect(screen.getByText('We zijn met iets moois bezig')).toBeInTheDocument();
    expect(
      screen.getByText('Deze pagina is in ontwikkeling. Kom binnenkort terug om het resultaat te zien.')
    ).toBeInTheDocument();

    const backHomeLink = screen.getByText('Terug naar home');
    expect(backHomeLink).toBeInTheDocument();
    expect(backHomeLink.closest('a')).toHaveAttribute('href', '/');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/components/UnderConstruction.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/UnderConstruction"` (or similar module-not-found error).

- [ ] **Step 5: Write minimal implementation**

Create `src/components/UnderConstruction.tsx`:

```tsx
import { getTranslations } from 'next-intl/server';
import { GlassPanel } from '@/components/GlassPanel';
import { Link } from '@/i18n/navigation';

export async function UnderConstruction() {
  const t = await getTranslations('underConstruction');

  return (
    <main
      data-testid="under-construction"
      className="relative flex min-h-screen items-center justify-center bg-gradient-to-b from-ink via-charcoal to-graphite px-4 py-24 sm:px-8"
    >
      <GlassPanel className="!max-w-lg text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-gold/60">
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5 text-gold"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M12 3L21 12L12 21L3 12L12 3Z" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="font-head text-xs uppercase tracking-[0.3em] text-white/50">{t('eyebrow')}</p>
        <h1 className="mt-3 text-2xl font-light text-white sm:text-3xl">{t('heading')}</h1>
        <p className="mt-3 text-sm text-white/70">{t('text')}</p>
        <div className="mx-auto my-6 h-px w-8 bg-gold/60" />
        <Link
          href="/"
          className="text-xs font-head uppercase tracking-[0.15em] text-gold hover:text-gold-bright"
        >
          {t('backHome')}
        </Link>
      </GlassPanel>
    </main>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/components/UnderConstruction.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 7: Commit**

```bash
git add src/components/UnderConstruction.tsx tests/components/UnderConstruction.test.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json
git commit -m "feat: voeg UnderConstruction-component en vertalingen toe"
```

---

### Task 3: Gate `/collecties`

**Files:**
- Modify: `src/app/[locale]/collecties/page.tsx`
- Test: `tests/app/collecties-page.test.tsx`

**Interfaces:**
- Consumes: `pageAvailability` from Task 1, `UnderConstruction` from Task 2.

- [ ] **Step 1: Write the failing test**

Create `tests/app/collecties-page.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import CollectiesPage from '@/app/[locale]/collecties/page';
import messages from '../../messages/nl.json';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const namespaceMessages = (messages as unknown as Record<string, Record<string, string>>)[
      namespace
    ];
    return (key: string) => namespaceMessages[key];
  },
  setRequestLocale: () => {},
}));

describe('CollectiesPage', () => {
  it('shows the under-construction page while pageAvailability.collecties is false', async () => {
    const page = (await CollectiesPage({ params: { locale: 'nl' } })) as any;
    const ui = await page.type(page.props);
    render(<NextIntlClientProvider locale="nl" messages={messages}>{ui}</NextIntlClientProvider>);

    expect(await screen.findByTestId('under-construction')).toBeInTheDocument();
    expect(screen.queryByText('Ontdek onze kunstwerken op glas, gerangschikt per toepassing.')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/collecties-page.test.tsx`
Expected: FAIL — the real Collecties page renders (intro text found, `under-construction` test id missing).

- [ ] **Step 3: Add the guard clause**

In `src/app/[locale]/collecties/page.tsx`, add two imports at the top and one guard right after `setRequestLocale(locale);`:

```ts
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { GlassPanel } from '@/components/GlassPanel';
import { ProductsGrid } from '@/components/ProductsGrid';
import { BecomeClientCta } from '@/components/BecomeClientCta';
import { pageAvailability } from '@/config/pageAvailability';
import { UnderConstruction } from '@/components/UnderConstruction';

export default async function CollectiesPage({
  params,
}: {
  params: { locale: string };
}) {
  const { locale } = params;
  setRequestLocale(locale);

  if (!pageAvailability.collecties) {
    return <UnderConstruction />;
  }

  const t = await getTranslations('collectionsPage');
```

The rest of the file (from the existing `return (` down) stays exactly as it is.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/collecties-page.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/app/\[locale\]/collecties/page.tsx tests/app/collecties-page.test.tsx
git commit -m "feat: toon Under Construction op /collecties"
```

---

### Task 4: Gate `/word-klant`

**Files:**
- Modify: `src/app/[locale]/word-klant/page.tsx`
- Test: `tests/app/word-klant-page.test.tsx`

**Interfaces:**
- Consumes: `pageAvailability` from Task 1, `UnderConstruction` from Task 2.

- [ ] **Step 1: Write the failing test**

Create `tests/app/word-klant-page.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import WordKlantPage from '@/app/[locale]/word-klant/page';
import messages from '../../messages/nl.json';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const namespaceMessages = (messages as unknown as Record<string, Record<string, string>>)[
      namespace
    ];
    return (key: string) => namespaceMessages[key];
  },
  setRequestLocale: () => {},
}));

describe('WordKlantPage', () => {
  it('shows the under-construction page while pageAvailability.wordKlant is false', async () => {
    const page = (await WordKlantPage({ params: { locale: 'nl' } })) as any;
    const ui = await page.type(page.props);
    render(<NextIntlClientProvider locale="nl" messages={messages}>{ui}</NextIntlClientProvider>);

    expect(await screen.findByTestId('under-construction')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/word-klant-page.test.tsx`
Expected: FAIL — `under-construction` test id not found.

- [ ] **Step 3: Add the guard clause**

In `src/app/[locale]/word-klant/page.tsx`:

```ts
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { GlassPanel } from '@/components/GlassPanel';
import { RegistrationForm } from '@/components/RegistrationForm';
import { pageAvailability } from '@/config/pageAvailability';
import { UnderConstruction } from '@/components/UnderConstruction';

export default async function WordKlantPage({
  params,
}: {
  params: { locale: string };
}) {
  const { locale } = params;
  setRequestLocale(locale);

  if (!pageAvailability.wordKlant) {
    return <UnderConstruction />;
  }

  const t = await getTranslations('registrationPage');
```

The rest of the file stays exactly as it is.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/word-klant-page.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/app/\[locale\]/word-klant/page.tsx tests/app/word-klant-page.test.tsx
git commit -m "feat: toon Under Construction op /word-klant"
```

---

### Task 5: Gate `/inloggen`

**Files:**
- Modify: `src/app/[locale]/inloggen/page.tsx`
- Test: `tests/app/inloggen-page.test.tsx`

**Interfaces:**
- Consumes: `pageAvailability` from Task 1, `UnderConstruction` from Task 2.

- [ ] **Step 1: Write the failing test**

Create `tests/app/inloggen-page.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import InloggenPage from '@/app/[locale]/inloggen/page';
import messages from '../../messages/nl.json';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const namespaceMessages = (messages as unknown as Record<string, Record<string, string>>)[
      namespace
    ];
    return (key: string) => namespaceMessages[key];
  },
  setRequestLocale: () => {},
}));

describe('InloggenPage', () => {
  it('shows the under-construction page while pageAvailability.inloggen is false', async () => {
    const page = (await InloggenPage({ params: { locale: 'nl' } })) as any;
    const ui = await page.type(page.props);
    render(<NextIntlClientProvider locale="nl" messages={messages}>{ui}</NextIntlClientProvider>);

    expect(await screen.findByTestId('under-construction')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/inloggen-page.test.tsx`
Expected: FAIL — `under-construction` test id not found.

- [ ] **Step 3: Add the guard clause**

In `src/app/[locale]/inloggen/page.tsx`:

```ts
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { GlassPanel } from '@/components/GlassPanel';
import { CustomerLoginForm } from '@/components/CustomerLoginForm';
import { pageAvailability } from '@/config/pageAvailability';
import { UnderConstruction } from '@/components/UnderConstruction';

export default async function InloggenPage({
  params,
}: {
  params: { locale: string };
}) {
  const { locale } = params;
  setRequestLocale(locale);

  if (!pageAvailability.inloggen) {
    return <UnderConstruction />;
  }

  const t = await getTranslations('loginPage');
```

The rest of the file stays exactly as it is.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/inloggen-page.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/app/\[locale\]/inloggen/page.tsx tests/app/inloggen-page.test.tsx
git commit -m "feat: toon Under Construction op /inloggen"
```

---

### Task 6: Gate `/beheer`

**Files:**
- Modify: `src/app/[locale]/beheer/page.tsx`
- Test: `tests/app/beheer-page.test.tsx`

**Interfaces:**
- Consumes: `pageAvailability` from Task 1, `UnderConstruction` from Task 2.

- [ ] **Step 1: Write the failing test**

Create `tests/app/beheer-page.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import BeheerPage from '@/app/[locale]/beheer/page';
import messages from '../../messages/nl.json';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const namespaceMessages = (messages as unknown as Record<string, Record<string, string>>)[
      namespace
    ];
    return (key: string) => namespaceMessages[key];
  },
  setRequestLocale: () => {},
}));

describe('BeheerPage', () => {
  it('shows the under-construction page while pageAvailability.beheer is false', async () => {
    const page = (await BeheerPage({ params: { locale: 'nl' } })) as any;
    const ui = await page.type(page.props);
    render(<NextIntlClientProvider locale="nl" messages={messages}>{ui}</NextIntlClientProvider>);

    expect(await screen.findByTestId('under-construction')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/beheer-page.test.tsx`
Expected: FAIL — `under-construction` test id not found.

- [ ] **Step 3: Add the guard clause**

In `src/app/[locale]/beheer/page.tsx`:

```ts
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { GlassPanel } from '@/components/GlassPanel';
import { AdminDashboard } from '@/components/beheer/AdminDashboard';
import { pageAvailability } from '@/config/pageAvailability';
import { UnderConstruction } from '@/components/UnderConstruction';

export function generateStaticParams() {
  return [{ locale: 'nl' }];
}

export const dynamicParams = false;

export default async function BeheerPage({
  params,
}: {
  params: { locale: string };
}) {
  const { locale } = params;
  setRequestLocale(locale);

  if (!pageAvailability.beheer) {
    return <UnderConstruction />;
  }

  const t = await getTranslations('beheer');
```

The rest of the file (`generateStaticParams` and `dynamicParams` stay where they already are, unchanged) stays exactly as it is.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/beheer-page.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/app/\[locale\]/beheer/page.tsx tests/app/beheer-page.test.tsx
git commit -m "feat: toon Under Construction op /beheer"
```

---

### Task 7: Gate `/account`

**Files:**
- Modify: `src/app/[locale]/account/page.tsx`
- Test: `tests/app/account-page.test.tsx`

**Interfaces:**
- Consumes: `pageAvailability` from Task 1, `UnderConstruction` from Task 2.

- [ ] **Step 1: Write the failing test**

Create `tests/app/account-page.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import AccountPage from '@/app/[locale]/account/page';
import messages from '../../messages/nl.json';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const namespaceMessages = (messages as unknown as Record<string, Record<string, string>>)[
      namespace
    ];
    return (key: string) => namespaceMessages[key];
  },
  setRequestLocale: () => {},
}));

describe('AccountPage', () => {
  it('shows the under-construction page while pageAvailability.account is false', async () => {
    const page = (await AccountPage({ params: { locale: 'nl' } })) as any;
    const ui = await page.type(page.props);
    render(<NextIntlClientProvider locale="nl" messages={messages}>{ui}</NextIntlClientProvider>);

    expect(await screen.findByTestId('under-construction')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/account-page.test.tsx`
Expected: FAIL — `under-construction` test id not found.

- [ ] **Step 3: Add the guard clause**

In `src/app/[locale]/account/page.tsx`:

```ts
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { GlassPanel } from '@/components/GlassPanel';
import { AccountDashboard } from '@/components/account/AccountDashboard';
import { pageAvailability } from '@/config/pageAvailability';
import { UnderConstruction } from '@/components/UnderConstruction';

export default async function AccountPage({
  params,
}: {
  params: { locale: string };
}) {
  const { locale } = params;
  setRequestLocale(locale);

  if (!pageAvailability.account) {
    return <UnderConstruction />;
  }

  const t = await getTranslations('nav');
```

The rest of the file stays exactly as it is.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/account-page.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/app/\[locale\]/account/page.tsx tests/app/account-page.test.tsx
git commit -m "feat: toon Under Construction op /account"
```

---

### Task 8: Gate `/contact`

**Files:**
- Modify: `src/app/[locale]/contact/page.tsx`
- Test: `tests/app/contact-page.test.tsx`

**Interfaces:**
- Consumes: `pageAvailability` from Task 1, `UnderConstruction` from Task 2.

- [ ] **Step 1: Write the failing test**

Create `tests/app/contact-page.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import ContactPage from '@/app/[locale]/contact/page';
import messages from '../../messages/nl.json';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const namespaceMessages = (messages as unknown as Record<string, Record<string, string>>)[
      namespace
    ];
    return (key: string) => namespaceMessages[key];
  },
  setRequestLocale: () => {},
}));

describe('ContactPage', () => {
  it('shows the under-construction page while pageAvailability.contact is false', async () => {
    const page = (await ContactPage({ params: { locale: 'nl' } })) as any;
    const ui = await page.type(page.props);
    render(<NextIntlClientProvider locale="nl" messages={messages}>{ui}</NextIntlClientProvider>);

    expect(await screen.findByTestId('under-construction')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/contact-page.test.tsx`
Expected: FAIL — `under-construction` test id not found.

- [ ] **Step 3: Add the guard clause**

In `src/app/[locale]/contact/page.tsx`:

```ts
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { GlassPanel } from '@/components/GlassPanel';
import { ContactInfo } from '@/components/ContactInfo';
import { ContactForm } from '@/components/ContactForm';
import { pageAvailability } from '@/config/pageAvailability';
import { UnderConstruction } from '@/components/UnderConstruction';

export default async function ContactPage({
  params,
}: {
  params: { locale: string };
}) {
  const { locale } = params;
  setRequestLocale(locale);

  if (!pageAvailability.contact) {
    return <UnderConstruction />;
  }

  const t = await getTranslations('contactPage');
```

The rest of the file stays exactly as it is.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/contact-page.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/app/\[locale\]/contact/page.tsx tests/app/contact-page.test.tsx
git commit -m "feat: toon Under Construction op /contact"
```

---

### Task 9: Full verification

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all test files pass, including the 9 new ones from Tasks 1–8 and every pre-existing test (nothing else should have changed behavior).

- [ ] **Step 2: Run a production build to confirm the static export still succeeds**

Run: `npm run build`
Expected: build completes successfully and emits the `out/` directory, including `out/nl/collecties/index.html`, `out/nl/word-klant/index.html`, `out/nl/inloggen/index.html`, `out/nl/beheer/index.html`, `out/nl/account/index.html` and `out/nl/contact/index.html` (plus `en`/`de`/`fr` equivalents where applicable) — each should now contain the Under Construction markup instead of the original page content.

- [ ] **Step 3: Spot-check one generated file**

Run: `node -e "console.log(require('fs').readFileSync('out/nl/collecties/index.html','utf8').includes('We zijn met iets moois bezig'))"`
Expected: prints `true`.
