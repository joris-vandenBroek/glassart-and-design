# Visitekaartje-pagina Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 18-07-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the statische visitekaartje-pagina for Glassart and Design: a single-page, 4-language (NL/EN/DE/FR) Next.js static-export site in the "Glass Reflection" visual style (black-to-charcoal gradient background with glassmorphism overlay panels).

**Architecture:** Next.js (App Router) statically exported (`output: 'export'`, no middleware). Locale routing is handled entirely through the `/[locale]/...` dynamic segment using `next-intl`'s `defineRouting`/`createNavigation` APIs and `generateStaticParams` — no middleware, since static export doesn't run one. The bare `/` route is a small client component that detects the visitor's browser language and redirects to the matching `/nl`, `/en`, `/de`, or `/fr` route. All page content lives in four small, independently-testable components (Hero, About, FeaturedWorks, Contact) composed on one locale page, each wrapped in a shared `GlassPanel` component that implements the glassmorphism overlay look.

**Tech Stack:** Next.js 14 (App Router) + TypeScript, Tailwind CSS, next-intl v3 (routing/navigation APIs, no middleware), Vitest + React Testing Library + jsdom for tests.

## Global Constraints

- Basiskleuren: zwart en zilver ("Glass Reflection" gradient `#060607` → `#1c1e22` → `#2a2d33`, zilver-accenten `#e2e4e8` → `#9aa0aa`).
- 4 talen: Nederlands (standaard/fallback), Engels, Duits, Frans, via `/[locale]/...` routes.
- Geen webshopfunctionaliteit, geen login, geen prijzen, geen contactformulier — alleen representatieve content.
- Beeldmateriaal: placeholders (geen logo/foto's beschikbaar bij aanvang), zo gebouwd dat vervanging geen structuurwijziging vereist.
- Statische export (`output: 'export'`), geen middleware, hosting nog niet bepaald.
- Taalkeuze: vaste knop rechtsboven, altijd zichtbaar.

---

## File Structure Overview

```
package.json
tsconfig.json
next.config.ts
tailwind.config.ts
postcss.config.mjs
vitest.config.ts
messages/{nl,en,de,fr}.json
src/styles/globals.css
src/lib/detectLocale.ts
src/i18n/routing.ts
src/i18n/navigation.ts
src/i18n/request.ts
src/app/layout.tsx
src/app/page.tsx
src/app/[locale]/layout.tsx
src/app/[locale]/page.tsx
src/components/GlassPanel.tsx
src/components/LanguageSwitcher.tsx
src/components/Hero.tsx
src/components/About.tsx
src/components/FeaturedWorks.tsx
src/components/Contact.tsx
tests/setup.ts
tests/test-utils.tsx
tests/lib/detectLocale.test.ts
tests/components/GlassPanel.test.tsx
tests/components/LanguageSwitcher.test.tsx
tests/components/Hero.test.tsx
tests/components/About.test.tsx
tests/components/FeaturedWorks.test.tsx
tests/components/Contact.test.tsx
tests/app/locale-page.test.tsx
```

---

### Task 1: Project scaffolding (Next.js + TypeScript + Tailwind + static export)

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `tailwind.config.ts`
- Create: `postcss.config.mjs`
- Create: `src/styles/globals.css`
- Create: `src/app/layout.tsx`
- Create: `.gitignore` (append `node_modules/`, `.next/`, `out/` if not already present)

**Interfaces:**
- Produces: root layout `RootLayout({ children }: { children: React.ReactNode })` rendering `<html lang="nl"><body>{children}</body></html>` — every later page/layout renders inside this.
- Produces: Tailwind theme colors `ink` (#060607), `charcoal` (#1c1e22), `graphite` (#2a2d33), `silver` (#e2e4e8), `silver-dim` (#9aa0aa) — used by every component task below.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "glassart-visitekaartje",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "^14.2.0",
    "next-intl": "^3.22.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^15.0.0",
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.19",
    "eslint": "^8.57.0",
    "eslint-config-next": "^14.2.0",
    "jsdom": "^24.1.0",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.5.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: install completes without errors, `node_modules/` and `package-lock.json` are created.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create `next.config.ts`**

```ts
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
};

export default withNextIntl(nextConfig);
```

Note: this file references `./src/i18n/request.ts`, created in Task 3. The build won't succeed until then — that's expected at this step.

- [ ] **Step 5: Create `tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#060607',
        charcoal: '#1c1e22',
        graphite: '#2a2d33',
        silver: '#e2e4e8',
        'silver-dim': '#9aa0aa',
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 6: Create `postcss.config.mjs`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 7: Create `src/styles/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html,
body {
  background-color: #060607;
  color: #f5f6f8;
}
```

- [ ] **Step 8: Create `src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'Glassart and Design',
  description: 'Kunst op 4mm veiligheidsglas, vakkundig gemonteerd.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
```

This is the only file in the project allowed to render `<html>`/`<body>` — Next.js errors if a nested layout does it too. The locale-specific `lang` attribute is intentionally out of scope for this static-export v1 (see spec's "Risico's" section); it would require server rendering or rewrites to vary per-request, which this static site doesn't have.

- [ ] **Step 9: Update `.gitignore`**

Ensure `.gitignore` contains (append if missing):

```
node_modules/
.next/
out/
```

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts tailwind.config.ts postcss.config.mjs src/styles/globals.css src/app/layout.tsx .gitignore
git commit -m "chore: scaffold Next.js project with Tailwind and static export config"
```

---

### Task 2: Testing infrastructure (Vitest + React Testing Library)

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `tests/test-utils.tsx`
- Create: `tests/lib/detectLocale.test.ts` (placeholder sanity test, real logic added in Task 4)

**Interfaces:**
- Produces: `renderWithIntl(ui: ReactElement, locale: string, messages: Record<string, unknown>)` from `tests/test-utils.tsx` — used by every component test task below.

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 2: Create `tests/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 3: Create `tests/test-utils.tsx`**

```tsx
import { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

export function renderWithIntl(
  ui: ReactElement,
  locale: string,
  messages: Record<string, unknown>
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}
```

- [ ] **Step 4: Write a sanity test to verify the harness works**

Create `tests/lib/detectLocale.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('test harness', () => {
  it('runs a basic assertion', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run the test suite**

Run: `npm test`
Expected: PASS — 1 test passed.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts tests/setup.ts tests/test-utils.tsx tests/lib/detectLocale.test.ts
git commit -m "test: add Vitest and React Testing Library harness"
```

---

### Task 3: i18n routing foundation and translation messages

**Files:**
- Create: `src/i18n/routing.ts`
- Create: `src/i18n/navigation.ts`
- Create: `src/i18n/request.ts`
- Create: `messages/nl.json`
- Create: `messages/en.json`
- Create: `messages/de.json`
- Create: `messages/fr.json`

**Interfaces:**
- Produces: `routing` (from `@/i18n/routing`) — `{ locales: ['nl','en','de','fr'], defaultLocale: 'nl' }` object with `.locales` and `.defaultLocale`, used by Tasks 4, 6, 11, 12.
- Produces: `usePathname`, `useRouter` (from `@/i18n/navigation`) — used by Task 6 (`LanguageSwitcher`).
- Produces: message keys `hero.{eyebrow,title,titleAccent,subtitle,cta}`, `about.{label,text}`, `works.{label}`, `contact.{label,email,phone}` in all 4 languages — used by Tasks 7–10.

- [ ] **Step 1: Create `src/i18n/routing.ts`**

```ts
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['nl', 'en', 'de', 'fr'],
  defaultLocale: 'nl',
});
```

- [ ] **Step 2: Create `src/i18n/navigation.ts`**

```ts
import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

export const { Link, usePathname, useRouter } = createNavigation(routing);
```

- [ ] **Step 3: Create `src/i18n/request.ts`**

```ts
import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from './routing';

export default getRequestConfig(async ({ locale }) => {
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }

  return {
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
```

- [ ] **Step 4: Create `messages/nl.json`**

```json
{
  "hero": {
    "eyebrow": "GLASSART & DESIGN",
    "title": "Kunst op glas,",
    "titleAccent": "vakkundig gemonteerd",
    "subtitle": "Gehard veiligheidsglas · 4mm · incl. montagehaken",
    "cta": "Neem contact op"
  },
  "about": {
    "label": "Over ons",
    "text": "Glassart and Design vervaardigt kunstwerken op 4mm veiligheidsglas voor hotels, restaurants, wellness, kantoren en particuliere collecties. Elk werk wordt compleet geleverd met montagehaken, klaar om op te hangen."
  },
  "works": {
    "label": "Uitgelichte werken"
  },
  "contact": {
    "label": "Contact",
    "email": "info@glassartanddesign.nl",
    "phone": "+31 (0)6 12345678"
  }
}
```

- [ ] **Step 5: Create `messages/en.json`**

```json
{
  "hero": {
    "eyebrow": "GLASSART & DESIGN",
    "title": "Art on glass,",
    "titleAccent": "expertly mounted",
    "subtitle": "Tempered safety glass · 4mm · mounting hooks included",
    "cta": "Get in touch"
  },
  "about": {
    "label": "About us",
    "text": "Glassart and Design creates artwork on 4mm tempered safety glass for hotels, restaurants, wellness centers, offices and private collections. Every piece is delivered complete with mounting hooks, ready to hang."
  },
  "works": {
    "label": "Featured works"
  },
  "contact": {
    "label": "Contact",
    "email": "info@glassartanddesign.nl",
    "phone": "+31 (0)6 12345678"
  }
}
```

- [ ] **Step 6: Create `messages/de.json`**

```json
{
  "hero": {
    "eyebrow": "GLASSART & DESIGN",
    "title": "Kunst auf Glas,",
    "titleAccent": "fachgerecht montiert",
    "subtitle": "Gehärtetes Sicherheitsglas · 4mm · inkl. Montagehaken",
    "cta": "Kontakt aufnehmen"
  },
  "about": {
    "label": "Über uns",
    "text": "Glassart and Design fertigt Kunstwerke auf 4mm gehärtetem Sicherheitsglas für Hotels, Restaurants, Wellnessbereiche, Büros und private Sammlungen. Jedes Werk wird komplett mit Montagehaken geliefert, bereit zum Aufhängen."
  },
  "works": {
    "label": "Ausgewählte Werke"
  },
  "contact": {
    "label": "Kontakt",
    "email": "info@glassartanddesign.nl",
    "phone": "+31 (0)6 12345678"
  }
}
```

- [ ] **Step 7: Create `messages/fr.json`**

```json
{
  "hero": {
    "eyebrow": "GLASSART & DESIGN",
    "title": "L'art sur verre,",
    "titleAccent": "monté avec expertise",
    "subtitle": "Verre de sécurité trempé · 4mm · crochets de fixation inclus",
    "cta": "Nous contacter"
  },
  "about": {
    "label": "À propos",
    "text": "Glassart and Design réalise des œuvres d'art sur verre de sécurité trempé de 4mm pour hôtels, restaurants, espaces bien-être, bureaux et collections privées. Chaque œuvre est livrée complète avec crochets de fixation, prête à être installée."
  },
  "works": {
    "label": "Œuvres en vedette"
  },
  "contact": {
    "label": "Contact",
    "email": "info@glassartanddesign.nl",
    "phone": "+31 (0)6 12345678"
  }
}
```

- [ ] **Step 8: Commit**

```bash
git add src/i18n messages
git commit -m "feat: add next-intl routing config and translation messages for 4 locales"
```

---

### Task 4: Root redirect page (browser-language detection)

**Files:**
- Create: `src/lib/detectLocale.ts`
- Modify: `tests/lib/detectLocale.test.ts` (replace sanity test with real tests)
- Create: `src/app/page.tsx`

**Interfaces:**
- Produces: `detectLocale(browserLanguages: readonly string[], supportedLocales: readonly string[], fallbackLocale: string): string` — pure function, used only by `src/app/page.tsx`.
- Consumes: `routing` from `@/i18n/routing` (Task 3).

- [ ] **Step 1: Write the failing test**

Replace the contents of `tests/lib/detectLocale.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { detectLocale } from '@/lib/detectLocale';

describe('detectLocale', () => {
  it('returns the matching supported locale from the browser languages', () => {
    expect(detectLocale(['de-DE', 'de'], ['nl', 'en', 'de', 'fr'], 'nl')).toBe(
      'de'
    );
  });

  it('falls back to the default locale when no browser language matches', () => {
    expect(detectLocale(['es-ES', 'it'], ['nl', 'en', 'de', 'fr'], 'nl')).toBe(
      'nl'
    );
  });

  it('matches the first supported language in browser preference order', () => {
    expect(
      detectLocale(['fr-BE', 'en-US'], ['nl', 'en', 'de', 'fr'], 'nl')
    ).toBe('fr');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- detectLocale`
Expected: FAIL — `Cannot find module '@/lib/detectLocale'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/detectLocale.ts`:

```ts
export function detectLocale(
  browserLanguages: readonly string[],
  supportedLocales: readonly string[],
  fallbackLocale: string
): string {
  for (const browserLanguage of browserLanguages) {
    const shortLanguage = browserLanguage.slice(0, 2).toLowerCase();
    const match = supportedLocales.find((locale) => locale === shortLanguage);
    if (match) {
      return match;
    }
  }
  return fallbackLocale;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- detectLocale`
Expected: PASS — 3 tests passed.

- [ ] **Step 5: Create the root redirect page**

Create `src/app/page.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { routing } from '@/i18n/routing';
import { detectLocale } from '@/lib/detectLocale';

export default function RootRedirectPage() {
  useEffect(() => {
    const locale = detectLocale(
      navigator.languages ?? [navigator.language],
      routing.locales,
      routing.defaultLocale
    );
    window.location.replace(`/${locale}/`);
  }, []);

  return null;
}
```

This page has no automated test (it's a one-line side effect on mount); it's exercised manually via `npm run dev` in Task 12's local verification step and by the static export build in Task 12.

- [ ] **Step 6: Commit**

```bash
git add src/lib/detectLocale.ts tests/lib/detectLocale.test.ts src/app/page.tsx
git commit -m "feat: add browser-language detection and root redirect page"
```

---

### Task 5: GlassPanel shared component

**Files:**
- Create: `src/components/GlassPanel.tsx`
- Create: `tests/components/GlassPanel.test.tsx`

**Interfaces:**
- Produces: `GlassPanel({ children, className, id }: { children: ReactNode; className?: string; id?: string })` — used by Tasks 7–10 (Hero, About, FeaturedWorks, Contact).

- [ ] **Step 1: Write the failing test**

Create `tests/components/GlassPanel.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GlassPanel } from '@/components/GlassPanel';

describe('GlassPanel', () => {
  it('renders its children inside a glass panel section', () => {
    render(
      <GlassPanel>
        <p>Panel content</p>
      </GlassPanel>
    );
    const panel = screen.getByTestId('glass-panel');
    expect(panel).toContainElement(screen.getByText('Panel content'));
  });

  it('merges a custom className with the base styles', () => {
    render(
      <GlassPanel className="custom-class">
        <p>Panel content</p>
      </GlassPanel>
    );
    expect(screen.getByTestId('glass-panel')).toHaveClass('custom-class');
  });

  it('applies the id prop to the section for anchor links', () => {
    render(
      <GlassPanel id="contact">
        <p>Panel content</p>
      </GlassPanel>
    );
    expect(screen.getByTestId('glass-panel')).toHaveAttribute('id', 'contact');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- GlassPanel`
Expected: FAIL — `Cannot find module '@/components/GlassPanel'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/GlassPanel.tsx`:

```tsx
import { ReactNode } from 'react';

export function GlassPanel({
  children,
  className = '',
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      data-testid="glass-panel"
      className={`relative mx-auto max-w-3xl rounded-lg border border-white/10 bg-white/5 px-6 py-10 backdrop-blur-sm sm:px-10 ${className}`}
    >
      {children}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- GlassPanel`
Expected: PASS — 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/GlassPanel.tsx tests/components/GlassPanel.test.tsx
git commit -m "feat: add GlassPanel glassmorphism overlay component"
```

---

### Task 6: LanguageSwitcher component

**Files:**
- Create: `src/components/LanguageSwitcher.tsx`
- Create: `tests/components/LanguageSwitcher.test.tsx`

**Interfaces:**
- Consumes: `routing` from `@/i18n/routing` (Task 3), `usePathname`/`useRouter` from `@/i18n/navigation` (Task 3).
- Produces: `LanguageSwitcher()` — no props, used by Task 11 (`LocalePage`). Renders `data-testid="language-switcher"` wrapper and one `data-testid="language-option-<locale>"` button per locale.

- [ ] **Step 1: Write the failing test**

Create `tests/components/LanguageSwitcher.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

const replaceMock = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ replace: replaceMock }),
}));

function renderSwitcher(locale: string) {
  return render(
    <NextIntlClientProvider locale={locale} messages={{}}>
      <LanguageSwitcher />
    </NextIntlClientProvider>
  );
}

describe('LanguageSwitcher', () => {
  it('renders one option per supported locale', () => {
    renderSwitcher('nl');
    expect(screen.getByTestId('language-option-nl')).toBeInTheDocument();
    expect(screen.getByTestId('language-option-en')).toBeInTheDocument();
    expect(screen.getByTestId('language-option-de')).toBeInTheDocument();
    expect(screen.getByTestId('language-option-fr')).toBeInTheDocument();
  });

  it('disables the option matching the active locale', () => {
    renderSwitcher('de');
    expect(screen.getByTestId('language-option-de')).toBeDisabled();
    expect(screen.getByTestId('language-option-nl')).not.toBeDisabled();
  });

  it('switches locale when a different option is clicked', () => {
    renderSwitcher('nl');
    screen.getByTestId('language-option-fr').click();
    expect(replaceMock).toHaveBeenCalledWith('/', { locale: 'fr' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- LanguageSwitcher`
Expected: FAIL — `Cannot find module '@/components/LanguageSwitcher'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/LanguageSwitcher.tsx`:

```tsx
'use client';

import { useLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { usePathname, useRouter } from '@/i18n/navigation';

const LOCALE_LABELS: Record<string, string> = {
  nl: 'NL',
  en: 'EN',
  de: 'DE',
  fr: 'FR',
};

export function LanguageSwitcher() {
  const activeLocale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div
      data-testid="language-switcher"
      className="fixed right-4 top-4 z-50 flex gap-1 rounded-full border border-white/10 bg-black/40 p-1 backdrop-blur-sm"
    >
      {routing.locales.map((locale) => (
        <button
          key={locale}
          type="button"
          data-testid={`language-option-${locale}`}
          aria-current={locale === activeLocale ? 'true' : undefined}
          disabled={locale === activeLocale}
          onClick={() => router.replace(pathname, { locale })}
          className={`rounded-full px-2 py-1 text-xs tracking-wide ${
            locale === activeLocale
              ? 'bg-white/20 text-white'
              : 'text-white/60 hover:text-white'
          }`}
        >
          {LOCALE_LABELS[locale]}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- LanguageSwitcher`
Expected: PASS — 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/LanguageSwitcher.tsx tests/components/LanguageSwitcher.test.tsx
git commit -m "feat: add fixed top-right LanguageSwitcher component"
```

---

### Task 7: Hero component

**Files:**
- Create: `src/components/Hero.tsx`
- Create: `tests/components/Hero.test.tsx`

**Interfaces:**
- Consumes: `GlassPanel` (Task 5), `renderWithIntl` (Task 2), message keys `hero.*` (Task 3).
- Produces: `Hero()` — no props, used by Task 11 (`LocalePage`). Renders an `<a href="#contact">` CTA matching `Contact`'s `id="contact"` (Task 10).

- [ ] **Step 1: Write the failing test**

Create `tests/components/Hero.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '../test-utils';
import { Hero } from '@/components/Hero';
import messages from '../../messages/nl.json';

describe('Hero', () => {
  it('renders the hero copy and CTA for the given locale', () => {
    renderWithIntl(<Hero />, 'nl', messages);
    expect(screen.getByText('Kunst op glas,')).toBeInTheDocument();
    expect(screen.getByText('vakkundig gemonteerd')).toBeInTheDocument();
    expect(
      screen.getByText('Gehard veiligheidsglas · 4mm · incl. montagehaken')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Neem contact op' })
    ).toHaveAttribute('href', '#contact');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- Hero`
Expected: FAIL — `Cannot find module '@/components/Hero'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/Hero.tsx`:

```tsx
import { useTranslations } from 'next-intl';
import { GlassPanel } from './GlassPanel';

export function Hero() {
  const t = useTranslations('hero');

  return (
    <GlassPanel className="text-center">
      <p className="text-xs tracking-[0.3em] text-white/50">{t('eyebrow')}</p>
      <h1 className="mt-4 text-3xl font-light text-white sm:text-4xl">
        {t('title')}
        <br />
        <span className="bg-gradient-to-r from-silver to-silver-dim bg-clip-text font-semibold text-transparent">
          {t('titleAccent')}
        </span>
      </h1>
      <p className="mt-4 text-xs tracking-[0.15em] text-white/60">
        {t('subtitle')}
      </p>
      <a
        href="#contact"
        className="mt-6 inline-block rounded-sm bg-silver px-6 py-3 text-xs tracking-[0.2em] text-ink"
      >
        {t('cta')}
      </a>
    </GlassPanel>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- Hero`
Expected: PASS — 1 test passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/Hero.tsx tests/components/Hero.test.tsx
git commit -m "feat: add Hero section component"
```

---

### Task 8: About component

**Files:**
- Create: `src/components/About.tsx`
- Create: `tests/components/About.test.tsx`

**Interfaces:**
- Consumes: `GlassPanel` (Task 5), `renderWithIntl` (Task 2), message keys `about.*` (Task 3).
- Produces: `About()` — no props, used by Task 11.

- [ ] **Step 1: Write the failing test**

Create `tests/components/About.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '../test-utils';
import { About } from '@/components/About';
import messages from '../../messages/nl.json';

describe('About', () => {
  it('renders the about label and text for the given locale', () => {
    renderWithIntl(<About />, 'nl', messages);
    expect(screen.getByText('Over ons')).toBeInTheDocument();
    expect(
      screen.getByText(/Glassart and Design vervaardigt kunstwerken/)
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- About`
Expected: FAIL — `Cannot find module '@/components/About'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/About.tsx`:

```tsx
import { useTranslations } from 'next-intl';
import { GlassPanel } from './GlassPanel';

export function About() {
  const t = useTranslations('about');

  return (
    <GlassPanel>
      <p className="text-[0.65rem] uppercase tracking-[0.25em] text-white/50">
        {t('label')}
      </p>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/80">
        {t('text')}
      </p>
    </GlassPanel>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- About`
Expected: PASS — 1 test passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/About.tsx tests/components/About.test.tsx
git commit -m "feat: add About section component"
```

---

### Task 9: FeaturedWorks component

**Files:**
- Create: `src/components/FeaturedWorks.tsx`
- Create: `tests/components/FeaturedWorks.test.tsx`

**Interfaces:**
- Consumes: `GlassPanel` (Task 5), `renderWithIntl` (Task 2), message keys `works.*` (Task 3).
- Produces: `FeaturedWorks()` — no props, used by Task 11. Renders 3 elements with `data-testid="work-placeholder"`.

- [ ] **Step 1: Write the failing test**

Create `tests/components/FeaturedWorks.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '../test-utils';
import { FeaturedWorks } from '@/components/FeaturedWorks';
import messages from '../../messages/nl.json';

describe('FeaturedWorks', () => {
  it('renders the section label and 3 placeholder tiles', () => {
    renderWithIntl(<FeaturedWorks />, 'nl', messages);
    expect(screen.getByText('Uitgelichte werken')).toBeInTheDocument();
    expect(screen.getAllByTestId('work-placeholder')).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- FeaturedWorks`
Expected: FAIL — `Cannot find module '@/components/FeaturedWorks'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/FeaturedWorks.tsx`:

```tsx
import { useTranslations } from 'next-intl';
import { GlassPanel } from './GlassPanel';

const PLACEHOLDER_COUNT = 3;

export function FeaturedWorks() {
  const t = useTranslations('works');

  return (
    <GlassPanel>
      <p className="text-[0.65rem] uppercase tracking-[0.25em] text-white/50">
        {t('label')}
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: PLACEHOLDER_COUNT }).map((_, index) => (
          <div
            key={index}
            data-testid="work-placeholder"
            className="aspect-square rounded border border-white/10 bg-gradient-to-br from-graphite to-ink"
          />
        ))}
      </div>
    </GlassPanel>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- FeaturedWorks`
Expected: PASS — 1 test passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/FeaturedWorks.tsx tests/components/FeaturedWorks.test.tsx
git commit -m "feat: add FeaturedWorks placeholder gallery component"
```

---

### Task 10: Contact component

**Files:**
- Create: `src/components/Contact.tsx`
- Create: `tests/components/Contact.test.tsx`

**Interfaces:**
- Consumes: `GlassPanel` (Task 5, using its `id` prop), `renderWithIntl` (Task 2), message keys `contact.*` (Task 3).
- Produces: `Contact()` — no props, used by Task 11. Renders `id="contact"` on its outer `GlassPanel`, matching `Hero`'s CTA `href="#contact"` (Task 7).

- [ ] **Step 1: Write the failing test**

Create `tests/components/Contact.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '../test-utils';
import { Contact } from '@/components/Contact';
import messages from '../../messages/nl.json';

describe('Contact', () => {
  it('renders contact details and exposes the #contact anchor', () => {
    renderWithIntl(<Contact />, 'nl', messages);
    expect(screen.getByText('Contact')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'info@glassartanddesign.nl' })
    ).toHaveAttribute('href', 'mailto:info@glassartanddesign.nl');
    expect(screen.getByText(/\+31 \(0\)6 12345678/)).toBeInTheDocument();
    expect(screen.getByTestId('glass-panel')).toHaveAttribute('id', 'contact');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- Contact`
Expected: FAIL — `Cannot find module '@/components/Contact'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/Contact.tsx`:

```tsx
import { useTranslations } from 'next-intl';
import { GlassPanel } from './GlassPanel';

export function Contact() {
  const t = useTranslations('contact');

  return (
    <GlassPanel id="contact" className="text-center">
      <p className="text-[0.65rem] uppercase tracking-[0.25em] text-white/50">
        {t('label')}
      </p>
      <p className="mt-4 text-sm text-white/80">
        <a
          href={`mailto:${t('email')}`}
          className="underline decoration-white/30"
        >
          {t('email')}
        </a>
        <span className="mx-2 text-white/30">·</span>
        {t('phone')}
      </p>
    </GlassPanel>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- Contact`
Expected: PASS — 1 test passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/Contact.tsx tests/components/Contact.test.tsx
git commit -m "feat: add Contact section component"
```

---

### Task 11: Locale layout and page composition

**Files:**
- Create: `src/app/[locale]/layout.tsx`
- Create: `src/app/[locale]/page.tsx`
- Create: `tests/app/locale-page.test.tsx`

**Interfaces:**
- Consumes: `routing` (Task 3), `LanguageSwitcher` (Task 6), `Hero` (Task 7), `About` (Task 8), `FeaturedWorks` (Task 9), `Contact` (Task 10).
- Produces: `LocalePage()` — no props, the full assembled page, tested directly.

- [ ] **Step 1: Create the locale layout**

Create `src/app/[locale]/layout.tsx`:

```tsx
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';

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
      {children}
    </NextIntlClientProvider>
  );
}
```

This layout is a Next.js routing convention file (relies on `notFound()`, `generateStaticParams`, and the Next.js server request context) and is verified end-to-end by the static export build in Task 12 rather than by a unit test.

- [ ] **Step 2: Write the failing test for the locale page**

Create `tests/app/locale-page.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import LocalePage from '@/app/[locale]/page';
import messages from '../../messages/nl.json';

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ replace: vi.fn() }),
}));

describe('LocalePage', () => {
  it('renders all four sections and the language switcher for the nl locale', () => {
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <LocalePage />
      </NextIntlClientProvider>
    );

    expect(screen.getByTestId('language-switcher')).toBeInTheDocument();
    expect(screen.getByText('Kunst op glas,')).toBeInTheDocument();
    expect(screen.getByText('Over ons')).toBeInTheDocument();
    expect(screen.getByText('Uitgelichte werken')).toBeInTheDocument();
    expect(screen.getAllByTestId('work-placeholder')).toHaveLength(3);
    expect(
      screen.getByRole('link', { name: 'info@glassartanddesign.nl' })
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- locale-page`
Expected: FAIL — `Cannot find module '@/app/[locale]/page'`.

- [ ] **Step 4: Write minimal implementation**

Create `src/app/[locale]/page.tsx`:

```tsx
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Hero } from '@/components/Hero';
import { About } from '@/components/About';
import { FeaturedWorks } from '@/components/FeaturedWorks';
import { Contact } from '@/components/Contact';

export default function LocalePage() {
  return (
    <main className="relative min-h-screen bg-gradient-to-b from-ink via-charcoal to-graphite">
      <LanguageSwitcher />
      <div className="flex flex-col gap-10 px-4 py-16 sm:px-8">
        <Hero />
        <About />
        <FeaturedWorks />
        <Contact />
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- locale-page`
Expected: PASS — 1 test passed.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests across every task pass (18 tests total: 1 harness sanity assertion superseded by detectLocale's 3, GlassPanel 3, LanguageSwitcher 3, Hero 1, About 1, FeaturedWorks 1, Contact 1, LocalePage 1 = 14 tests; exact count may vary slightly, all green either way).

- [ ] **Step 7: Commit**

```bash
git add src/app/[locale] tests/app/locale-page.test.tsx
git commit -m "feat: compose locale page from Hero, About, FeaturedWorks and Contact"
```

---

### Task 12: Static export build verification (all 4 locales)

**Files:**
- No new files. This task verifies the previous 11 tasks produce a working static export.

**Interfaces:**
- Consumes: the entire app built in Tasks 1–11.

- [ ] **Step 1: Run the production build**

Run: `npm run build`
Expected: build completes successfully, and the output log shows 5 static routes generated: `/`, `/nl`, `/en`, `/de`, `/fr` (exact wording may be "○ /" etc. — success is no errors and all 5 routes listed).

- [ ] **Step 2: Verify the exported files exist**

Run: `ls out/index.html out/nl/index.html out/en/index.html out/de/index.html out/fr/index.html`
Expected: all 5 files listed, no "No such file" errors.

- [ ] **Step 3: Manually verify in the browser**

Run: `npx serve out` (or any static file server) and open `http://localhost:3000/` in a browser.
Expected:
- The root `/` redirects automatically to `/nl/` (or another locale if your browser's language preference is set to en/de/fr).
- The page shows the black-to-charcoal gradient background with 4 glass-panel sections (Hero, Over ons, Uitgelichte werken, Contact) and a language switcher fixed in the top-right corner.
- Clicking each language option (NL/EN/DE/FR) in the switcher updates all section text to that language without a full page reload failure.
- Resize the browser to a mobile width (e.g. 375px) and confirm the layout stays readable (single-column featured-works grid, no horizontal overflow).

- [ ] **Step 4: Run the full test suite one final time**

Run: `npm test`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

No code changes in this task — nothing to commit. If Step 1–4 surfaced a fix, commit that fix with a message describing what was broken, then re-run Steps 1–4.
