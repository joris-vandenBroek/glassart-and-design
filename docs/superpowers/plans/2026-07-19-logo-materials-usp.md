# Logo + Materialen/USP-sectie Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 19-07-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a recreated gold logo mark + wordmark to the NavBar, and a new "Waarom Glassart & Design" homepage section showing the 5 gold USP icons and the 6 materials from the client's brochure.

**Architecture:** `Logo.tsx` is a small client component (inline SVG mark + wordmark text) added as a new sibling to the existing nav-links group in `NavBar.tsx` — a minimal, additive change that doesn't touch any existing nav behavior. `WhyUs.tsx` is a new client component composing 5 inline SVG icon components (one per USP) and a data-driven materials grid sourced from a new `src/data/materials.ts` (same pattern as the existing `src/data/segments.ts`), wrapped in the existing `GlassPanel`. It's added to the homepage (`src/app/[locale]/page.tsx`) between `About` and `FeaturedWorks`. Both new components reuse the existing `gold`/`gold-bright` Tailwind tokens (already added for the cart/product-modal redesign) — no new color tokens needed.

**Tech Stack:** Same as the existing project — Next.js 14 (App Router) + TypeScript, Tailwind CSS, next-intl v3, Vitest + React Testing Library.

## Global Constraints

- The logo is a recreated interpretation of the brochure image (no original vector file exists) — client explicitly approved recreating it as SVG code.
- Logo placement: left of "Home" in the NavBar, icon + wordmark only (no separate tagline in the navbar). Links to `/`.
- No new Tailwind color tokens — reuse the existing `gold`/`gold-bright` tokens.
- `WhyUs` section placement: between `About` and `FeaturedWorks` on the homepage — one continuous section (icons row, then materials grid below), not two separate sections.
- Materials are text-only cards (name + short description) — no photos/images.
- All new text (section title, 5 USP labels, 6 material names + descriptions) in all 4 locales (NL/EN/DE/FR).
- Existing homepage sections (`Hero`, `About`, `FeaturedWorks`, `Contact`) and NavBar's existing links/cart/login/language-switcher behavior are otherwise unchanged.

---

## File Structure Overview

```
messages/{nl,en,de,fr}.json          (MODIFY — add `whyUs` translation namespace)
src/data/materials.ts                (CREATE — the 6 materials data array)
src/components/Logo.tsx              (CREATE — SVG mark + wordmark, links to /)
src/components/WhyUs.tsx             (CREATE — USP icons row + materials grid)
src/components/NavBar.tsx            (MODIFY — add Logo before the nav-links group)
src/app/[locale]/page.tsx            (MODIFY — add WhyUs between About and FeaturedWorks)
tests/data/materials.test.ts         (CREATE)
tests/components/Logo.test.tsx       (CREATE)
tests/components/WhyUs.test.tsx      (CREATE)
tests/components/NavBar.test.tsx     (MODIFY — assert the logo renders)
tests/app/locale-page.test.tsx       (MODIFY — assert WhyUs renders on the homepage)
```

---

### Task 1: Materials data and `whyUs` translation keys

**Files:**
- Create: `src/data/materials.ts`
- Create: `tests/data/materials.test.ts`
- Modify: `messages/nl.json`
- Modify: `messages/en.json`
- Modify: `messages/de.json`
- Modify: `messages/fr.json`

**Interfaces:**
- Produces: `Material = { id: string; messageKey: string }`, `MATERIALS: Material[]` from `@/data/materials` — used by Task 3 (`WhyUs`).
- Produces: message keys `whyUs.title`, `whyUs.usp.{quality,safetyGlass,uvResistant,sharpDetails,durable}`, `whyUs.materials.{safetyGlass,dibond,acrylic3,acrylic5,acrylic10,acousticFabric}.{name,description}` — used by Tasks 2 (icon labels reference the `usp.*` keys via `WhyUs`), 3.

- [ ] **Step 1: Write the failing test**

Create `tests/data/materials.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '@/data/materials';

describe('MATERIALS', () => {
  it('contains exactly the 6 materials from the brochure, in order', () => {
    expect(MATERIALS.map((material) => material.id)).toEqual([
      'safety-glass',
      'dibond',
      'acrylic-3',
      'acrylic-5',
      'acrylic-10',
      'acoustic-fabric',
    ]);
  });

  it('gives each material a matching messageKey', () => {
    expect(MATERIALS.map((material) => material.messageKey)).toEqual([
      'safetyGlass',
      'dibond',
      'acrylic3',
      'acrylic5',
      'acrylic10',
      'acousticFabric',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- materials`
Expected: FAIL — `Cannot find module '@/data/materials'`.

- [ ] **Step 3: Create `src/data/materials.ts`**

```ts
export interface Material {
  id: string;
  messageKey: string;
}

export const MATERIALS: Material[] = [
  { id: 'safety-glass', messageKey: 'safetyGlass' },
  { id: 'dibond', messageKey: 'dibond' },
  { id: 'acrylic-3', messageKey: 'acrylic3' },
  { id: 'acrylic-5', messageKey: 'acrylic5' },
  { id: 'acrylic-10', messageKey: 'acrylic10' },
  { id: 'acoustic-fabric', messageKey: 'acousticFabric' },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- materials`
Expected: PASS — 2 tests passed.

- [ ] **Step 5: Add the `whyUs` namespace to `messages/nl.json`**

Add this new top-level key (after `"registrationPage"`, before the closing `}`):

```json
  "whyUs": {
    "title": "Waarom Glassart & Design",
    "usp": {
      "quality": "Gallery Quality",
      "safetyGlass": "4mm Veiligheidsglas",
      "uvResistant": "UV-bestendig & kleurvast",
      "sharpDetails": "Haarscherpe details",
      "durable": "Duurzaam & milieuvriendelijk"
    },
    "materials": {
      "safetyGlass": {
        "name": "4mm Veiligheidsglas",
        "description": "Onze specialiteit. Kristalhelder, sterk en veilig."
      },
      "dibond": {
        "name": "Dibond 3mm",
        "description": "Lichtgewicht, stijf en vormvast met een matte uitstraling."
      },
      "acrylic3": {
        "name": "Acryl 3mm",
        "description": "Licht en helder met een luxe glanzende look."
      },
      "acrylic5": {
        "name": "Acryl 5mm",
        "description": "Extra diepte en stevigheid voor een indrukwekkend effect."
      },
      "acrylic10": {
        "name": "Acryl 10mm",
        "description": "Maximale diepwerking voor exclusieve presentatie."
      },
      "acousticFabric": {
        "name": "Akoestische stof",
        "description": "Verbetert de akoestiek en geeft een warme, moderne uitstraling."
      }
    }
  }
```

- [ ] **Step 6: Add the `whyUs` namespace to `messages/en.json`**

```json
  "whyUs": {
    "title": "Why Glassart & Design",
    "usp": {
      "quality": "Gallery Quality",
      "safetyGlass": "4mm Safety Glass",
      "uvResistant": "UV-resistant & colorfast",
      "sharpDetails": "Razor-sharp details",
      "durable": "Durable & eco-friendly"
    },
    "materials": {
      "safetyGlass": {
        "name": "4mm Safety Glass",
        "description": "Our specialty. Crystal clear, strong and safe."
      },
      "dibond": {
        "name": "Dibond 3mm",
        "description": "Lightweight, rigid and dimensionally stable with a matte finish."
      },
      "acrylic3": {
        "name": "Acrylic 3mm",
        "description": "Light and clear with a luxurious glossy look."
      },
      "acrylic5": {
        "name": "Acrylic 5mm",
        "description": "Extra depth and strength for an impressive effect."
      },
      "acrylic10": {
        "name": "Acrylic 10mm",
        "description": "Maximum depth effect for an exclusive presentation."
      },
      "acousticFabric": {
        "name": "Acoustic fabric",
        "description": "Improves acoustics and adds a warm, modern look."
      }
    }
  }
```

- [ ] **Step 7: Add the `whyUs` namespace to `messages/de.json`**

```json
  "whyUs": {
    "title": "Warum Glassart & Design",
    "usp": {
      "quality": "Gallery Quality",
      "safetyGlass": "4mm Sicherheitsglas",
      "uvResistant": "UV-beständig & farbecht",
      "sharpDetails": "Gestochen scharfe Details",
      "durable": "Langlebig & umweltfreundlich"
    },
    "materials": {
      "safetyGlass": {
        "name": "4mm Sicherheitsglas",
        "description": "Unsere Spezialität. Kristallklar, stark und sicher."
      },
      "dibond": {
        "name": "Dibond 3mm",
        "description": "Leicht, steif und formstabil mit mattem Finish."
      },
      "acrylic3": {
        "name": "Acryl 3mm",
        "description": "Leicht und klar mit einem luxuriösen Glanz."
      },
      "acrylic5": {
        "name": "Acryl 5mm",
        "description": "Zusätzliche Tiefe und Stabilität für einen beeindruckenden Effekt."
      },
      "acrylic10": {
        "name": "Acryl 10mm",
        "description": "Maximale Tiefenwirkung für eine exklusive Präsentation."
      },
      "acousticFabric": {
        "name": "Akustikstoff",
        "description": "Verbessert die Akustik und sorgt für ein warmes, modernes Erscheinungsbild."
      }
    }
  }
```

- [ ] **Step 8: Add the `whyUs` namespace to `messages/fr.json`**

```json
  "whyUs": {
    "title": "Pourquoi Glassart & Design",
    "usp": {
      "quality": "Gallery Quality",
      "safetyGlass": "Verre de sécurité 4mm",
      "uvResistant": "Résistant aux UV et inaltérable",
      "sharpDetails": "Détails d'une netteté parfaite",
      "durable": "Durable et écologique"
    },
    "materials": {
      "safetyGlass": {
        "name": "Verre de sécurité 4mm",
        "description": "Notre spécialité. Cristallin, solide et sûr."
      },
      "dibond": {
        "name": "Dibond 3mm",
        "description": "Léger, rigide et stable avec une finition mate."
      },
      "acrylic3": {
        "name": "Acrylique 3mm",
        "description": "Léger et clair avec un aspect brillant luxueux."
      },
      "acrylic5": {
        "name": "Acrylique 5mm",
        "description": "Profondeur et solidité supplémentaires pour un effet impressionnant."
      },
      "acrylic10": {
        "name": "Acrylique 10mm",
        "description": "Effet de profondeur maximal pour une présentation exclusive."
      },
      "acousticFabric": {
        "name": "Tissu acoustique",
        "description": "Améliore l'acoustique et apporte une touche chaleureuse et moderne."
      }
    }
  }
```

- [ ] **Step 9: Verify all 4 locale files are valid JSON with identical key structure**

Run: `node -e "const fs=require('fs'); const locales=['nl','en','de','fr']; const keys = locales.map(l => JSON.stringify(Object.keys(JSON.parse(fs.readFileSync('messages/'+l+'.json')).whyUs).sort())); console.log(keys.every(k => k === keys[0]) ? 'MATCH' : 'MISMATCH: ' + keys.join(' | '))"`
Expected: `MATCH`

- [ ] **Step 10: Run the full test suite to confirm nothing broke**

Run: `npm test`
Expected: PASS — all existing tests still green.

- [ ] **Step 11: Commit**

```bash
git add src/data/materials.ts tests/data/materials.test.ts messages/nl.json messages/en.json messages/de.json messages/fr.json
git commit -m "feat: add materials data and whyUs translation keys"
```

---

### Task 2: Logo component

**Files:**
- Create: `src/components/Logo.tsx`
- Create: `tests/components/Logo.test.tsx`

**Interfaces:**
- Consumes: `Link` from `@/i18n/navigation`, Tailwind `gold`/`silver` color tokens (existing).
- Produces: `Logo()` — no props, used by Task 4 (`NavBar`). Renders `data-testid="logo"` as a link to `/` containing the SVG mark and the "GLASSART & DESIGN" wordmark text.

- [ ] **Step 1: Write the failing test**

Create `tests/components/Logo.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Logo } from '@/components/Logo';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('Logo', () => {
  it('links to the homepage and shows the wordmark', () => {
    render(<Logo />);
    const logo = screen.getByTestId('logo');
    expect(logo).toHaveAttribute('href', '/');
    expect(logo).toHaveTextContent('GLASSART');
    expect(logo).toHaveTextContent('& DESIGN');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- Logo`
Expected: FAIL — `Cannot find module '@/components/Logo'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/Logo.tsx`:

```tsx
'use client';

import { Link } from '@/i18n/navigation';

export function Logo() {
  return (
    <Link href="/" data-testid="logo" className="flex items-center gap-2">
      <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
        <g fill="none" className="stroke-gold" strokeWidth={4} strokeLinecap="square">
          <path d="M 4 16 L 4 4 L 16 4" />
          <path d="M 48 4 L 60 4 L 60 16" />
          <path d="M 60 48 L 60 60 L 48 60" />
          <path d="M 16 60 L 4 60 L 4 48" />
          <path d="M 40 20 L 24 20 L 24 44 L 40 44 M 40 34 L 30 34" />
        </g>
      </svg>
      <span className="text-xs tracking-[0.15em]">
        <span className="text-gold">GLASSART</span> <span className="text-silver">&amp; DESIGN</span>
      </span>
    </Link>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- Logo`
Expected: PASS — 1 test passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/Logo.tsx tests/components/Logo.test.tsx
git commit -m "feat: add recreated logo mark and wordmark"
```

---

### Task 3: WhyUs component

**Files:**
- Create: `src/components/WhyUs.tsx`
- Create: `tests/components/WhyUs.test.tsx`

**Interfaces:**
- Consumes: `MATERIALS` (Task 1, `@/data/materials`), `GlassPanel` (existing, `@/components/GlassPanel`), message keys `whyUs.*` (Task 1).
- Produces: `WhyUs()` — no props, used by Task 5 (homepage `page.tsx`). Renders `data-testid="usp-row"` containing `data-testid="usp-{quality,safetyGlass,uvResistant,sharpDetails,durable}"`, and `data-testid="materials-grid"` containing `data-testid="material-{safety-glass,dibond,acrylic-3,acrylic-5,acrylic-10,acoustic-fabric}"`.

- [ ] **Step 1: Write the failing test**

Create `tests/components/WhyUs.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '../test-utils';
import { WhyUs } from '@/components/WhyUs';
import messages from '../../messages/nl.json';

describe('WhyUs', () => {
  it('renders the section title', () => {
    renderWithIntl(<WhyUs />, 'nl', messages);
    expect(screen.getByText('Waarom Glassart & Design')).toBeInTheDocument();
  });

  it('renders all 5 USP icons with their labels', () => {
    renderWithIntl(<WhyUs />, 'nl', messages);
    expect(screen.getByTestId('usp-quality')).toHaveTextContent('Gallery Quality');
    expect(screen.getByTestId('usp-safetyGlass')).toHaveTextContent('4mm Veiligheidsglas');
    expect(screen.getByTestId('usp-uvResistant')).toHaveTextContent('UV-bestendig & kleurvast');
    expect(screen.getByTestId('usp-sharpDetails')).toHaveTextContent('Haarscherpe details');
    expect(screen.getByTestId('usp-durable')).toHaveTextContent('Duurzaam & milieuvriendelijk');
  });

  it('renders all 6 materials with name and description', () => {
    renderWithIntl(<WhyUs />, 'nl', messages);
    expect(screen.getAllByTestId(/^material-/)).toHaveLength(6);
    expect(screen.getByTestId('material-safety-glass')).toHaveTextContent('4mm Veiligheidsglas');
    expect(screen.getByTestId('material-safety-glass')).toHaveTextContent('Onze specialiteit');
    expect(screen.getByTestId('material-dibond')).toHaveTextContent('Dibond 3mm');
    expect(screen.getByTestId('material-acoustic-fabric')).toHaveTextContent('Akoestische stof');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- WhyUs`
Expected: FAIL — `Cannot find module '@/components/WhyUs'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/WhyUs.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { GlassPanel } from './GlassPanel';
import { MATERIALS } from '@/data/materials';

const USP_KEYS = ['quality', 'safetyGlass', 'uvResistant', 'sharpDetails', 'durable'] as const;

function DiamondIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 40 40" aria-hidden="true">
      <path d="M20 4 L34 16 L20 36 L6 16 Z" fill="none" className="stroke-gold" strokeWidth={2.5} />
      <path d="M6 16 L34 16" className="stroke-gold" strokeWidth={1.5} />
      <path d="M15 16 L20 4 M25 16 L20 4" className="stroke-gold" strokeWidth={1.5} />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 40 40" aria-hidden="true">
      <path
        d="M20 4 L34 10 V20 C34 28 28 34 20 37 C12 34 6 28 6 20 V10 Z"
        fill="none"
        className="stroke-gold"
        strokeWidth={2.5}
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="8" fill="none" className="stroke-gold" strokeWidth={2.5} />
      <g className="stroke-gold" strokeWidth={2} strokeLinecap="round">
        <line x1="20" y1="2" x2="20" y2="8" />
        <line x1="20" y1="32" x2="20" y2="38" />
        <line x1="2" y1="20" x2="8" y2="20" />
        <line x1="32" y1="20" x2="38" y2="20" />
        <line x1="7" y1="7" x2="11" y2="11" />
        <line x1="29" y1="29" x2="33" y2="33" />
        <line x1="33" y1="7" x2="29" y2="11" />
        <line x1="11" y1="29" x2="7" y2="33" />
      </g>
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 40 40" aria-hidden="true">
      <rect x="5" y="5" width="30" height="30" fill="none" className="stroke-gold" strokeWidth={2.5} />
      <g className="stroke-gold" strokeWidth={1.5}>
        <line x1="5" y1="15" x2="35" y2="15" />
        <line x1="5" y1="25" x2="35" y2="25" />
        <line x1="15" y1="5" x2="15" y2="35" />
        <line x1="25" y1="5" x2="25" y2="35" />
      </g>
    </svg>
  );
}

function FeatherIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 40 40" aria-hidden="true">
      <path
        d="M20 36 C20 36 8 28 8 16 C8 8 14 4 20 10 C26 4 32 8 32 16 C32 28 20 36 20 36 Z"
        fill="none"
        className="stroke-gold"
        strokeWidth={2.5}
      />
      <path d="M20 10 L20 30" className="stroke-gold" strokeWidth={1.5} />
    </svg>
  );
}

const USP_ICONS: Record<(typeof USP_KEYS)[number], () => JSX.Element> = {
  quality: DiamondIcon,
  safetyGlass: ShieldIcon,
  uvResistant: SunIcon,
  sharpDetails: GridIcon,
  durable: FeatherIcon,
};

export function WhyUs() {
  const t = useTranslations('whyUs');

  return (
    <GlassPanel>
      <p className="text-center text-[0.65rem] uppercase tracking-[0.25em] text-white/50">
        {t('title')}
      </p>

      <div data-testid="usp-row" className="mt-6 flex flex-wrap justify-center gap-8">
        {USP_KEYS.map((key) => {
          const Icon = USP_ICONS[key];
          return (
            <div
              key={key}
              data-testid={`usp-${key}`}
              className="flex w-24 flex-col items-center text-center"
            >
              <Icon />
              <p className="mt-2 text-[0.65rem] leading-tight text-white/70">{t(`usp.${key}`)}</p>
            </div>
          );
        })}
      </div>

      <div data-testid="materials-grid" className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {MATERIALS.map((material) => (
          <div
            key={material.id}
            data-testid={`material-${material.id}`}
            className="rounded-md border border-white/10 bg-graphite/60 p-4 text-center"
          >
            <p className="text-xs font-semibold text-white">
              {t(`materials.${material.messageKey}.name`)}
            </p>
            <p className="mt-1 text-[0.65rem] text-white/60">
              {t(`materials.${material.messageKey}.description`)}
            </p>
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- WhyUs`
Expected: PASS — 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/WhyUs.tsx tests/components/WhyUs.test.tsx
git commit -m "feat: add WhyUs section with USP icons and materials grid"
```

---

### Task 4: Wire Logo into NavBar

**Files:**
- Modify: `src/components/NavBar.tsx`
- Modify: `tests/components/NavBar.test.tsx`

**Interfaces:**
- Consumes: `Logo` (Task 2, `@/components/Logo`).
- Produces: `NavBar` renders `<Logo />` before the existing nav-links group. No other change to `NavBar`'s behavior.

- [ ] **Step 1: Update `tests/components/NavBar.test.tsx`**

Add one new test at the end of the `describe` block (after the existing tests, don't remove or modify any existing test):

```tsx
  it('renders the logo linking to the homepage', () => {
    renderNavBar();
    expect(screen.getByTestId('logo')).toHaveAttribute('href', '/');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- NavBar`
Expected: FAIL — `Unable to find an element by: [data-testid="logo"]` (Logo isn't rendered by NavBar yet).

- [ ] **Step 3: Update `src/components/NavBar.tsx`**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useMockAuth } from '@/lib/useMockAuth';
import { Logo } from './Logo';
import { LanguageSwitcher } from './LanguageSwitcher';
import { AccountMenu } from './AccountMenu';
import { CartPanel } from './CartPanel';

export function NavBar() {
  const t = useTranslations('nav');
  const { isLoggedIn, isHydrated, login } = useMockAuth();

  return (
    <nav
      data-testid="navbar"
      className="fixed left-0 top-0 z-40 flex w-full flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-black/60 px-4 py-3 backdrop-blur-sm sm:px-8"
    >
      <div className="flex items-center gap-8">
        <Logo />
        <div className="flex items-center gap-6 text-xs tracking-[0.15em] text-white/70">
          <Link href="/" data-testid="nav-home" className="hover:text-white">
            {t('home')}
          </Link>
          <Link href="/collecties" data-testid="nav-collections" className="hover:text-white">
            {t('collections')}
          </Link>
          <Link href="/contact" data-testid="nav-contact" className="hover:text-white">
            {t('contact')}
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {isHydrated && isLoggedIn ? (
          <AccountMenu />
        ) : (
          <>
            <Link
              href="/word-klant"
              data-testid="nav-become-client"
              className="hidden text-xs tracking-[0.15em] text-white/70 hover:text-white sm:inline"
            >
              {t('becomeClient')}
            </Link>
            <button
              type="button"
              data-testid="nav-login"
              onClick={login}
              className="rounded-sm bg-silver px-4 py-2 text-xs tracking-[0.15em] text-ink"
            >
              {t('login')}
            </button>
          </>
        )}
        <CartPanel />
        <LanguageSwitcher />
      </div>
    </nav>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- NavBar`
Expected: PASS — 6 tests passed.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests green (confirms `NavBarAccountMenuIntegration.test.tsx`, which also renders the real `NavBar`, is unaffected — it doesn't assert on the logo's absence, and `Logo` uses the same already-mocked `@/i18n/navigation` `Link`).

- [ ] **Step 6: Commit**

```bash
git add src/components/NavBar.tsx tests/components/NavBar.test.tsx
git commit -m "feat: add the logo to the NavBar"
```

---

### Task 5: Wire WhyUs into the homepage

**Files:**
- Modify: `src/app/[locale]/page.tsx`
- Modify: `tests/app/locale-page.test.tsx`

**Interfaces:**
- Consumes: `WhyUs` (Task 3, `@/components/WhyUs`).
- Produces: the homepage renders `Hero`, `About`, `WhyUs`, `FeaturedWorks`, `Contact` in that order.

- [ ] **Step 1: Update `tests/app/locale-page.test.tsx`**

Replace the file in full:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import LocalePage from '@/app/[locale]/page';
import messages from '../../messages/nl.json';

describe('LocalePage', () => {
  it('renders all five sections for the nl locale', () => {
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <LocalePage />
      </NextIntlClientProvider>
    );

    expect(screen.getByText('Kunst op glas,')).toBeInTheDocument();
    expect(screen.getByText('Over ons')).toBeInTheDocument();
    expect(screen.getByText('Waarom Glassart & Design')).toBeInTheDocument();
    expect(screen.getByText('Uitgelichte werken')).toBeInTheDocument();
    expect(screen.getAllByTestId('work-placeholder')).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- locale-page`
Expected: FAIL — `Unable to find an element with the text: Waarom Glassart & Design` (`WhyUs` isn't rendered on the homepage yet).

- [ ] **Step 3: Update `src/app/[locale]/page.tsx`**

```tsx
import { Hero } from '@/components/Hero';
import { About } from '@/components/About';
import { WhyUs } from '@/components/WhyUs';
import { FeaturedWorks } from '@/components/FeaturedWorks';
import { Contact } from '@/components/Contact';

export default function LocalePage() {
  return (
    <main className="relative min-h-screen bg-gradient-to-b from-ink via-charcoal to-graphite">
      <div className="flex flex-col gap-10 px-4 pb-16 pt-24 sm:px-8">
        <Hero />
        <About />
        <WhyUs />
        <FeaturedWorks />
        <Contact />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- locale-page`
Expected: PASS — 1 test passed.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests green.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/page.tsx" tests/app/locale-page.test.tsx
git commit -m "feat: add the WhyUs section to the homepage"
```

---

### Task 6: Static export build verification

**Files:**
- No new files. This task verifies the previous 5 tasks produce a working static export with the logo and the WhyUs section rendering correctly end to end.

- [ ] **Step 1: Run the production build**

Run: `npm run build`
Expected: build completes successfully, no new errors.

- [ ] **Step 2: Run the full test suite one final time**

Run: `npm test`
Expected: PASS — all tests green.

- [ ] **Step 3: Verify the new content is present in the static export**

Run: `grep -o "GLASSART\|Waarom Glassart\|Akoestische stof" out/nl/index.html | sort -u`
Expected: all 3 strings found — confirms the logo wordmark and the WhyUs section's title/materials render in the pre-rendered static HTML.

- [ ] **Step 4: Manually verify in the browser**

Run: `npx serve out -l 4183` (or reuse whatever static server command was used for previous plans) and open the site.

Check:
- The navbar shows the gold logo mark + "GLASSART & DESIGN" wordmark, left of "Home", on every page (not just the homepage).
- Clicking the logo goes to the homepage.
- On the homepage, between "Over ons" and "Uitgelichte werken", a new section shows the 5 gold USP icons with labels, and below that a grid of the 6 materials with name + description.
- All existing NavBar links (Collecties, Contact, Word klant, Inloggen, cart icon, language switcher) still work exactly as before.
- Switching languages updates the logo wordmark (stays "GLASSART & DESIGN", unlocalized, matching the brand name) and correctly translates the WhyUs section title, USP labels, and material names/descriptions.
- Mobile width (375px): the logo doesn't crowd the nav bar awkwardly (wraps or stays compact), and the USP icons row + materials grid remain usable with no horizontal overflow.

- [ ] **Step 5: Commit**

No code changes expected in this task. If Steps 1–4 surfaced a fix, commit it with a message describing what was broken, then re-run Steps 1–4.
