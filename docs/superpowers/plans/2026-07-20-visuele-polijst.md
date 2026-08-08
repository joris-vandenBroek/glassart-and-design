# Visuele polijst Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 20-07-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the Zeus-inspired visual-polish pass (typography, broader gold accent, hover-motion, pill badges) across the existing site, and rebuild the winkelmandje (`CartPanel`) as a full-height sidebar with renamed "Bestelling afronden" / new "Bestelling leegmaken" controls.

**Architecture:** Additive, mostly-CSS-class changes across existing components (no new pages, no new content). Two small structural additions: a shared `useOverlayDismiss` hook (extracted from `ProductModal`'s existing dialog/focus-trap logic, reused by the new `CartPanel`), and two new Tailwind `@layer components` classes (`.btn-gold`, `.badge-gold`) so the gold hover/glow and badge treatment live in one place.

**Tech Stack:** Next.js 14 (App Router), React 18, Tailwind CSS 3.4, `next-intl`, Vitest + Testing Library.

## Global Constraints

- No new page sections, headings, or copy beyond what already exists — this pass restyles existing text/structure. The only new translation keys are `cart.clearOrder` (all 4 locales), because "Bestelling leegmaken" is new UI.
- Gold hex values and hover/glow shadow values live in `tailwind.config.ts` (existing `gold`/`gold-bright` tokens) and the two new `@layer components` classes in `src/styles/globals.css` — never as scattered inline literals.
- The cart icon's quantity-count badge (the small circle on the nav cart icon) stays silver — it is a neutral counter, not a status/label badge, and is not restyled gold.
- No change to `useCart`/`useOrders` business logic beyond calling the existing `clear()` function from the new "Bestelling leegmaken" button.
- Any change to `cart.*` message text must be applied to all four locale files: `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json`.
- Spec reference: `docs/superpowers/specs/2026-07-20-visuele-polijst-design.md`.

---

### Task 1: Land the pending ProductModal accessibility work

**Files:**
- Modify (commit only, no code changes): `src/components/ProductModal.tsx`
- Modify (commit only, no code changes): `tests/components/ProductModal.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ProductModal`'s existing `role="dialog"` / focus-trap / focus-restore behavior becomes the committed baseline that Task 7's `useOverlayDismiss` extraction builds on.

This repo already has an uncommitted, complete, and tested change sitting in the working tree — a separate background session added `role="dialog"`, a Tab focus-trap, and focus-restore-on-close to `ProductModal`, plus 4 passing tests for it. Per the client's explicit choice, land it as its own commit before building anything new on top of it. Do not rewrite or "improve" this code in this task — just verify and commit it as-is.

- [ ] **Step 1: Verify the pending tests pass as-is**

Run: `npx vitest run tests/components/ProductModal.test.tsx`
Expected: PASS — all tests green, including these four:
`exposes dialog semantics for assistive tech`, `moves focus into the modal (the close button) when it opens`, `restores focus to the triggering element when it closes`, `traps Tab focus within the modal, wrapping from the last to the first focusable element` (and the matching Shift+Tab test).

- [ ] **Step 2: Commit exactly these two files**

```bash
git add src/components/ProductModal.tsx tests/components/ProductModal.test.tsx
git commit -m "$(cat <<'EOF'
feat: add dialog/focus-trap semantics to ProductModal

role=dialog, Tab focus-trap, and focus-restore-on-close, so the product
modal behaves like an accessible dialog instead of just visually
overlaying the page.
EOF
)"
```

---

### Task 2: Load Montserrat + Open Sans, wire Tailwind font tokens

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `tailwind.config.ts`
- Modify: `src/styles/globals.css`

**Interfaces:**
- Consumes: nothing new.
- Produces: Tailwind utility classes `font-head` (Montserrat, weights 700/900) and `font-body` (Open Sans, weights 400/600, also the sitewide default via `body { font-family: var(--font-body) }`). Task 3 consumes `font-head`.

`next/font/google` is Next-build-only — it isn't exercised by any Vitest test (no test imports `src/app/layout.tsx`, only `src/app/[locale]/layout.tsx` and below are covered), so this task's acceptance is a real `next build` plus the full existing Vitest suite staying green, not a new unit test.

- [ ] **Step 1: Load the fonts in the root layout**

Replace the full contents of `src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { Montserrat, Open_Sans } from 'next/font/google';
import '../styles/globals.css';

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['700', '900'],
  variable: '--font-head',
});

const openSans = Open_Sans({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-body',
});

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
    <html lang="nl" className={`${montserrat.variable} ${openSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Add the Tailwind font-family tokens**

In `tailwind.config.ts`, add a `fontFamily` block next to the existing `colors` block:

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
        gold: '#D4AF37',
        'gold-bright': '#E8C468',
      },
      fontFamily: {
        head: ['var(--font-head)', 'sans-serif'],
        body: ['var(--font-body)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 3: Make Open Sans the sitewide default body font**

In `src/styles/globals.css`, add `font-family: var(--font-body);` to the existing `html, body` rule:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html,
body {
  background-color: #060607;
  color: #f5f6f8;
  font-family: var(--font-body);
}
```

- [ ] **Step 4: Verify the build and the full test suite**

Run: `npm run build`
Expected: build succeeds (fonts fetched and self-hosted at build time).

Run: `npm test`
Expected: all existing tests still pass — nothing in the suite renders `src/app/layout.tsx`, so this is purely a regression check.

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx tailwind.config.ts src/styles/globals.css
git commit -m "$(cat <<'EOF'
feat: load Montserrat/Open Sans and add font-head/font-body tokens

Self-hosted via next/font/google. Open Sans becomes the sitewide
default body font; font-head is available for headings/labels.
EOF
)"
```

---

### Task 3: Apply font-head + gold hover to existing headings, labels and nav/filter links

**Files:**
- Modify: `src/components/Hero.tsx`
- Modify: `src/components/WhyUs.tsx:91`
- Modify: `src/components/FeaturedWorks.tsx:13`
- Modify: `src/components/Logo.tsx:15`
- Modify: `src/components/NavBar.tsx`
- Modify: `src/components/ProductsGrid.tsx:22-26`
- Modify: `src/components/ProductModal.tsx:148`

**Interfaces:**
- Consumes: `font-head` Tailwind utility from Task 2.
- Produces: no new exports; purely visual class changes on existing markup.

This is a visual-only pass (no new testids, no behavior change). This codebase's existing tests never assert Tailwind class strings — they assert text content, testids, and attributes — so there is no new unit test to write here; the acceptance check is that the full suite still passes unchanged, plus a manual look in the browser (Task 9).

- [ ] **Step 1: Hero — bolder font-head title**

In `src/components/Hero.tsx`, replace the `GlassPanel` children:

```tsx
export function Hero() {
  const t = useTranslations('hero');

  return (
    <GlassPanel className="!max-w-5xl text-center">
      <p className="font-head text-xs tracking-[0.3em] text-white/50">{t('eyebrow')}</p>
      <h1 className="mt-4 font-head text-3xl font-bold text-white sm:text-4xl">{t('title')}</h1>
      <p className="mt-4 text-xs tracking-[0.15em] text-white/60">
        {t('subtitle')}
      </p>
    </GlassPanel>
  );
}
```

- [ ] **Step 2: WhyUs and FeaturedWorks eyebrow labels get font-head**

In `src/components/WhyUs.tsx`, line 91, change:

```tsx
      <p className="text-center text-[0.65rem] uppercase tracking-[0.25em] text-white/50">
```

to:

```tsx
      <p className="text-center font-head text-[0.65rem] uppercase tracking-[0.25em] text-white/50">
```

In `src/components/FeaturedWorks.tsx`, line 13, change:

```tsx
      <p className="text-[0.65rem] uppercase tracking-[0.25em] text-white/50">
```

to:

```tsx
      <p className="font-head text-[0.65rem] uppercase tracking-[0.25em] text-white/50">
```

- [ ] **Step 3: Logo wordmark and NavBar links get font-head + gold hover**

In `src/components/Logo.tsx`, line 15, change:

```tsx
      <span className="text-xs tracking-[0.15em]">
```

to:

```tsx
      <span className="font-head text-xs tracking-[0.15em]">
```

In `src/components/NavBar.tsx`, replace the nav-links block (lines 19-31):

```tsx
      <div className="flex items-center gap-8">
        <Logo />
        <div className="flex items-center gap-6 text-xs font-head tracking-[0.15em] text-white/70">
          <Link href="/" data-testid="nav-home" className="hover:text-gold">
            {t('home')}
          </Link>
          <Link href="/collecties" data-testid="nav-collections" className="hover:text-gold">
            {t('collections')}
          </Link>
          <Link href="/contact" data-testid="nav-contact" className="hover:text-gold">
            {t('contact')}
          </Link>
        </div>
      </div>
```

And the "Word klant" link (lines 46-52):

```tsx
            <Link
              href="/word-klant"
              data-testid="nav-become-client"
              className="hidden text-xs font-head tracking-[0.15em] text-white/70 hover:text-gold sm:inline"
            >
              {t('becomeClient')}
            </Link>
```

- [ ] **Step 4: ProductsGrid filter buttons get font-head + gold hover**

In `src/components/ProductsGrid.tsx`, lines 22-26, replace `filterButtonClass`:

```tsx
  function filterButtonClass(isActive: boolean) {
    return isActive
      ? 'rounded-full bg-silver px-4 py-1.5 text-xs font-head tracking-wide text-ink'
      : 'rounded-full border border-white/20 px-4 py-1.5 text-xs font-head tracking-wide text-white/70 hover:border-gold/40 hover:text-gold';
  }
```

- [ ] **Step 5: ProductModal segment title gets font-head**

In `src/components/ProductModal.tsx`, line 148, change:

```tsx
          <p className="text-xs uppercase tracking-[0.2em] text-gold">
```

to:

```tsx
          <p className="font-head text-xs uppercase tracking-[0.2em] text-gold">
```

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all tests still pass (no test asserts on these class strings).

- [ ] **Step 7: Commit**

```bash
git add src/components/Hero.tsx src/components/WhyUs.tsx src/components/FeaturedWorks.tsx src/components/Logo.tsx src/components/NavBar.tsx src/components/ProductsGrid.tsx src/components/ProductModal.tsx
git commit -m "$(cat <<'EOF'
style: apply font-head + gold hover to headings, labels, nav and filters

Montserrat for headings/eyebrow labels/nav-links/filter-buttons; nav
links and filter buttons switch their hover color from white to gold.
EOF
)"
```

---

### Task 4: Shared `.btn-gold` / `.badge-gold` classes, applied to login button, confirm button, and product badge

**Files:**
- Modify: `src/styles/globals.css`
- Modify: `src/components/NavBar.tsx:53-60`
- Modify: `src/components/ProductModal.tsx:192-204`
- Modify: `src/components/ProductsGrid.tsx:81-83`

**Interfaces:**
- Consumes: `gold`/`gold-bright` Tailwind color tokens (already in `tailwind.config.ts`).
- Produces: `.btn-gold` and `.badge-gold` CSS classes in `src/styles/globals.css`. Task 8 (`CartPanel` rebuild) consumes `.btn-gold`.

Visual-only pass again — no new tests, full suite must stay green.

- [ ] **Step 1: Add the shared classes**

In `src/styles/globals.css`, append below the `html, body` rule:

```css
@layer components {
  .btn-gold {
    @apply bg-gold text-ink transition hover:-translate-y-0.5 hover:bg-gold-bright hover:shadow-[0_8px_32px_rgba(212,175,55,0.35)];
  }

  .badge-gold {
    @apply rounded-full border border-gold/30 bg-gold/10 px-2 py-1 font-head text-[0.6rem] uppercase tracking-wide text-gold;
  }
}
```

- [ ] **Step 2: NavBar login button uses `.btn-gold`**

In `src/components/NavBar.tsx`, lines 53-60, change:

```tsx
            <button
              type="button"
              data-testid="nav-login"
              onClick={login}
              className="rounded-sm bg-silver px-4 py-2 text-xs tracking-[0.15em] text-ink"
            >
              {t('login')}
            </button>
```

to:

```tsx
            <button
              type="button"
              data-testid="nav-login"
              onClick={login}
              className="btn-gold rounded-sm px-4 py-2 text-xs font-head tracking-[0.15em]"
            >
              {t('login')}
            </button>
```

- [ ] **Step 3: ProductModal confirm button gains the glow via `.btn-gold`**

In `src/components/ProductModal.tsx`, lines 192-204, change the confirm `<button>`'s className expression:

```tsx
            className={`rounded-sm px-4 py-2.5 text-xs tracking-[0.15em] transition ${
              isConfirmed
                ? 'cursor-default bg-green-500 text-white'
                : 'bg-gold text-ink hover:-translate-y-0.5 hover:bg-gold-bright'
            }`}
```

to:

```tsx
            className={`rounded-sm px-4 py-2.5 text-xs tracking-[0.15em] transition ${
              isConfirmed ? 'cursor-default bg-green-500 text-white' : 'btn-gold'
            }`}
```

- [ ] **Step 4: ProductsGrid segment badge becomes a gold pill**

In `src/components/ProductsGrid.tsx`, lines 81-83, change:

```tsx
            <span className="absolute left-2 top-2 rounded-sm bg-black/70 px-2 py-1 text-[0.6rem] uppercase tracking-wide text-white">
              {tSegments(`${image.segmentMessageKey}.title`)}
            </span>
```

to:

```tsx
            <span className="badge-gold absolute left-2 top-2">
              {tSegments(`${image.segmentMessageKey}.title`)}
            </span>
```

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/styles/globals.css src/components/NavBar.tsx src/components/ProductModal.tsx src/components/ProductsGrid.tsx
git commit -m "$(cat <<'EOF'
style: add shared .btn-gold/.badge-gold classes, apply to login/confirm/badge

Login button and the ProductModal confirm button now share the same
gold hover-lift+glow treatment; the per-card segment label becomes a
gold pill badge instead of a plain black block.
EOF
)"
```

---

### Task 5: Product-card hover — lift + gold gradient overlay

**Files:**
- Modify: `src/components/ProductsGrid.tsx:58-85`

**Interfaces:**
- Consumes: nothing new.
- Produces: no new exports; adds a `group`-scoped hover overlay to each product card.

- [ ] **Step 1: Replace the card's hover treatment with lift + gradient overlay**

In `src/components/ProductsGrid.tsx`, lines 58-85, replace the per-card `<div>`:

```tsx
          <div
            key={image.id}
            data-testid="product-card"
            role="button"
            tabIndex={0}
            aria-label={tSegments(`${image.segmentMessageKey}.title`)}
            onClick={() => setSelectedImage(image)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                if (event.key === ' ') {
                  event.preventDefault();
                }
                setSelectedImage(image);
              }
            }}
            className="relative cursor-pointer overflow-hidden rounded border border-white/10 transition hover:brightness-110"
          >
            <img
              src={image.src}
              alt={tSegments(`${image.segmentMessageKey}.title`)}
              className="aspect-square w-full object-cover"
            />
            <span className="badge-gold absolute left-2 top-2">
              {tSegments(`${image.segmentMessageKey}.title`)}
            </span>
          </div>
```

with:

```tsx
          <div
            key={image.id}
            data-testid="product-card"
            role="button"
            tabIndex={0}
            aria-label={tSegments(`${image.segmentMessageKey}.title`)}
            onClick={() => setSelectedImage(image)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                if (event.key === ' ') {
                  event.preventDefault();
                }
                setSelectedImage(image);
              }
            }}
            className="group relative cursor-pointer overflow-hidden rounded border border-white/10 transition hover:-translate-y-1"
          >
            <img
              src={image.src}
              alt={tSegments(`${image.segmentMessageKey}.title`)}
              className="aspect-square w-full object-cover"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-gold/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            />
            <span className="badge-gold absolute left-2 top-2">
              {tSegments(`${image.segmentMessageKey}.title`)}
            </span>
          </div>
```

(Note: the badge span already reflects Task 4's `.badge-gold` change — this step's diff is shown against that post-Task-4 state.)

- [ ] **Step 2: Run the ProductsGrid test suite**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx`
Expected: all 7 tests still pass — none assert on hover classes, only on card count/filtering/modal-open behavior.

- [ ] **Step 3: Commit**

```bash
git add src/components/ProductsGrid.tsx
git commit -m "$(cat <<'EOF'
style: replace product-card brightness hover with lift + gold overlay
EOF
)"
```

---

### Task 6: WhyUs hover motion — USP icons and material cards

**Files:**
- Modify: `src/components/WhyUs.tsx:96-126`

**Interfaces:**
- Consumes: nothing new.
- Produces: no new exports.

- [ ] **Step 1: Add hover lift/scale to USP icons and material cards**

In `src/components/WhyUs.tsx`, lines 96-126, replace:

```tsx
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
```

with:

```tsx
        {USP_KEYS.map((key) => {
          const Icon = USP_ICONS[key];
          return (
            <div
              key={key}
              data-testid={`usp-${key}`}
              className="group flex w-24 flex-col items-center text-center"
            >
              <div className="transition duration-300 group-hover:scale-110">
                <Icon />
              </div>
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
            className="rounded-md border border-white/10 bg-graphite/60 p-4 text-center transition hover:-translate-y-1 hover:border-gold/40"
          >
```

- [ ] **Step 2: Run the WhyUs test suite**

Run: `npx vitest run tests/components/WhyUs.test.tsx`
Expected: all 3 tests still pass — they check text content/testids only.

- [ ] **Step 3: Commit**

```bash
git add src/components/WhyUs.tsx
git commit -m "$(cat <<'EOF'
style: add hover lift/scale motion to USP icons and material cards
EOF
)"
```

---

### Task 7: Extract `useOverlayDismiss` hook from ProductModal

**Files:**
- Create: `src/lib/useOverlayDismiss.ts`
- Test: `tests/lib/useOverlayDismiss.test.tsx`
- Modify: `src/components/ProductModal.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `useOverlayDismiss(options: { isOpen: boolean; onClose: () => void; containerRef: RefObject<HTMLElement>; initialFocusRef: RefObject<HTMLElement> }): void` — exported from `src/lib/useOverlayDismiss.ts`. Task 8 (`CartPanel`) consumes this.

This is a pure refactor of the logic Task 1 just committed: same Escape-to-close, Tab focus-trap, and focus-restore-on-close behavior, generalized so `CartPanel` can reuse it in Task 8. `ProductModal`'s existing behavior (and its tests from Task 1) must be unchanged after this refactor.

- [ ] **Step 1: Write the failing test for the new hook**

Create `tests/lib/useOverlayDismiss.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useOverlayDismiss } from '@/lib/useOverlayDismiss';

function Harness({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLButtonElement>(null);

  useOverlayDismiss({ isOpen, onClose, containerRef, initialFocusRef });

  if (!isOpen) {
    return null;
  }

  return (
    <div ref={containerRef} data-testid="harness">
      <button ref={initialFocusRef} data-testid="first">
        First
      </button>
      <button data-testid="last">Last</button>
    </div>
  );
}

describe('useOverlayDismiss', () => {
  it('focuses the initial-focus element when isOpen is true', () => {
    render(<Harness isOpen onClose={vi.fn()} />);
    expect(screen.getByTestId('first')).toHaveFocus();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<Harness isOpen onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('traps Tab focus, wrapping from the last to the first focusable element', () => {
    render(<Harness isOpen onClose={vi.fn()} />);
    screen.getByTestId('last').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByTestId('first')).toHaveFocus();
  });

  it('traps Shift+Tab focus, wrapping from the first to the last focusable element', () => {
    render(<Harness isOpen onClose={vi.fn()} />);
    screen.getByTestId('first').focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(screen.getByTestId('last')).toHaveFocus();
  });

  it('restores focus to the previously focused element once isOpen becomes false', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(trigger).toHaveFocus();

    const { rerender } = render(<Harness isOpen onClose={vi.fn()} />);
    expect(screen.getByTestId('first')).toHaveFocus();

    rerender(<Harness isOpen={false} onClose={vi.fn()} />);
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/lib/useOverlayDismiss.test.tsx`
Expected: FAIL — `Cannot find module '@/lib/useOverlayDismiss'` (the hook doesn't exist yet).

- [ ] **Step 3: Implement the hook**

Create `src/lib/useOverlayDismiss.ts`:

```ts
'use client';

import { useEffect, useRef, type RefObject } from 'react';

interface UseOverlayDismissOptions {
  isOpen: boolean;
  onClose: () => void;
  containerRef: RefObject<HTMLElement>;
  initialFocusRef: RefObject<HTMLElement>;
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function useOverlayDismiss({
  isOpen,
  onClose,
  containerRef,
  initialFocusRef,
}: UseOverlayDismissOptions): void {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key === 'Tab') {
        const focusable = containerRef.current?.querySelectorAll<HTMLElement>(
          FOCUSABLE_SELECTOR
        );
        if (!focusable || focusable.length === 0) {
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, containerRef]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    initialFocusRef.current?.focus();
    return () => {
      previousFocusRef.current?.focus();
    };
  }, [isOpen, initialFocusRef]);
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run tests/lib/useOverlayDismiss.test.tsx`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Refactor ProductModal to use the hook**

In `src/components/ProductModal.tsx`:

Remove the `previousFocusRef` declaration, and replace the two dismiss-related `useEffect`s (the keydown/Tab-trap effect and the focus-management effect — everything between the "reset size/qty" effect and the `closeTimeoutRef` cleanup effect, i.e. the two effects introduced by Task 1) with a single call to `useOverlayDismiss`. The component should now read like this from the refs onward:

```tsx
  const [size, setSize] = useState<string>(STANDARD_SIZES[0]);
  const [quantity, setQuantity] = useState(1);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const { addItem } = useCart();
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!image) {
      return;
    }
    setSize(STANDARD_SIZES[0]);
    setQuantity(1);
    setIsConfirmed(false);
  }, [image]);

  // Ensure a pending "close after confirm" timer never fires for a stale
  // product: clear it whenever `image` changes to a different value, and
  // on unmount.
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };
  }, [image]);

  useOverlayDismiss({
    isOpen: image !== null,
    onClose,
    containerRef: modalRef,
    initialFocusRef: closeButtonRef,
  });

  if (!image) {
    return null;
  }
```

And add the import at the top of the file:

```tsx
import { useOverlayDismiss } from '@/lib/useOverlayDismiss';
```

(`useEffect` stays imported — the two effects shown above still use it.)

- [ ] **Step 6: Run the full ProductModal test suite to confirm behavior is unchanged**

Run: `npx vitest run tests/components/ProductModal.test.tsx`
Expected: PASS — same tests as Task 1, unchanged, still all green (this is the regression check that the refactor preserved behavior).

- [ ] **Step 7: Commit**

```bash
git add src/lib/useOverlayDismiss.ts tests/lib/useOverlayDismiss.test.tsx src/components/ProductModal.tsx
git commit -m "$(cat <<'EOF'
refactor: extract useOverlayDismiss hook from ProductModal

Generalizes the existing Escape/focus-trap/focus-restore logic so
CartPanel's upcoming full-height sidebar can reuse it instead of
duplicating the same effects.
EOF
)"
```

---

### Task 8: Rebuild CartPanel as a full-height sidebar

**Files:**
- Modify: `src/components/CartPanel.tsx`
- Modify: `tests/components/CartPanel.test.tsx`
- Modify: `messages/nl.json:82`
- Modify: `messages/en.json:82`
- Modify: `messages/de.json:82`
- Modify: `messages/fr.json:82`

**Interfaces:**
- Consumes: `useOverlayDismiss` from Task 7, `.btn-gold` from Task 4.
- Produces: no new exports — `CartPanel`'s public usage (`<CartPanel />` in `NavBar`) is unchanged.

- [ ] **Step 1: Update the cart text in all four locale files**

In `messages/nl.json`, line 82, change:

```json
    "placeOrder": "Toevoegen aan bestelling",
```

to:

```json
    "placeOrder": "Bestelling afronden",
    "clearOrder": "Bestelling leegmaken",
```

In `messages/en.json`, line 82, change:

```json
    "placeOrder": "Add to order",
```

to:

```json
    "placeOrder": "Complete order",
    "clearOrder": "Clear order",
```

In `messages/de.json`, line 82, change:

```json
    "placeOrder": "Zur Bestellung hinzufügen",
```

to:

```json
    "placeOrder": "Bestellung abschließen",
    "clearOrder": "Bestellung leeren",
```

In `messages/fr.json`, line 82, change:

```json
    "placeOrder": "Ajouter à la commande",
```

to:

```json
    "placeOrder": "Finaliser la commande",
    "clearOrder": "Vider la commande",
```

- [ ] **Step 2: Write the failing tests for the new sidebar behavior**

Append to `tests/components/CartPanel.test.tsx`, inside the existing `describe('CartPanel', ...)` block (after the last `it`):

```tsx
  it('closes the panel when Escape is pressed', () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('cart-icon'));
    expect(screen.getByTestId('cart-panel')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('cart-panel')).not.toBeInTheDocument();
  });

  it('closes the panel when the backdrop is clicked', () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('cart-icon'));
    fireEvent.click(screen.getByTestId('cart-backdrop'));
    expect(screen.queryByTestId('cart-panel')).not.toBeInTheDocument();
  });

  it('empties the cart via "Bestelling leegmaken" without placing an order, and keeps the panel open', () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    fireEvent.click(screen.getByTestId('cart-clear'));

    expect(screen.getByTestId('cart-panel')).toBeInTheDocument();
    expect(screen.getByTestId('cart-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('cart-badge')).not.toBeInTheDocument();

    const placedOrders = JSON.parse(screen.getByTestId('orders-probe').textContent ?? '[]');
    expect(placedOrders).toHaveLength(0);
  });

  it('disables "Bestelling leegmaken" when the cart is empty', () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('cart-icon'));
    expect(screen.getByTestId('cart-clear')).toBeDisabled();
  });
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `npx vitest run tests/components/CartPanel.test.tsx`
Expected: FAIL — the 4 new tests fail (`cart-backdrop`/`cart-clear` testids don't exist yet); the 5 pre-existing tests still pass against the old dropdown.

- [ ] **Step 4: Rewrite CartPanel as a full-height sidebar**

Replace the full contents of `src/components/CartPanel.tsx`:

```tsx
'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useCart } from '@/lib/useCart';
import { useOrders } from '@/lib/useOrders';
import { useOverlayDismiss } from '@/lib/useOverlayDismiss';

export function CartPanel() {
  const t = useTranslations('cart');
  const tSegments = useTranslations('segments');
  const [isOpen, setIsOpen] = useState(false);
  const { items, isHydrated, totalQuantity, removeItem, clear } = useCart();
  const { placeOrder } = useOrders();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useOverlayDismiss({
    isOpen,
    onClose: () => setIsOpen(false),
    containerRef: panelRef,
    initialFocusRef: closeButtonRef,
  });

  function handlePlaceOrder() {
    const description = items
      .map(
        (item) => `${tSegments(`${item.segmentMessageKey}.title`)} ${item.size} ×${item.quantity}`
      )
      .join(', ');
    placeOrder(description, t('requestedStatus'));
    clear();
    setIsOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        data-testid="cart-icon"
        aria-label={t('title')}
        onClick={() => setIsOpen((open) => !open)}
        className="relative flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white/80 hover:text-white"
      >
        <span aria-hidden="true">🛒</span>
        {isHydrated && totalQuantity > 0 && (
          <span
            data-testid="cart-badge"
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-silver px-1 text-[0.6rem] font-semibold text-ink"
          >
            {totalQuantity}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div
            data-testid="cart-backdrop"
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          />
          <div
            ref={panelRef}
            data-testid="cart-panel"
            role="dialog"
            aria-modal="true"
            className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-[400px] flex-col border-l border-white/10 bg-charcoal"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <p className="font-head text-[0.65rem] uppercase tracking-[0.2em] text-white/50">
                {t('title')}
              </p>
              <button
                ref={closeButtonRef}
                type="button"
                data-testid="cart-close"
                aria-label={t('close')}
                onClick={() => setIsOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 hover:text-white"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {items.length === 0 ? (
                <p data-testid="cart-empty" className="text-center text-xs text-white/60">
                  {t('empty')}
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      data-testid={`cart-item-${item.id}`}
                      className="flex gap-3 rounded-md border border-white/10 bg-graphite/60 p-3 text-xs text-white/80"
                    >
                      <img src={item.imageSrc} alt="" className="h-12 w-12 rounded object-cover" />
                      <div className="flex-1">
                        <p>{tSegments(`${item.segmentMessageKey}.title`)}</p>
                        <p className="text-white/50">
                          {item.size} · ×{item.quantity}
                        </p>
                      </div>
                      <button
                        type="button"
                        data-testid={`cart-item-remove-${item.id}`}
                        onClick={() => removeItem(item.id)}
                        aria-label={t('remove')}
                        className="text-white/50 hover:text-white"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-white/10 px-5 py-4">
              <button
                type="button"
                data-testid="cart-place-order"
                disabled={items.length === 0}
                onClick={handlePlaceOrder}
                className="btn-gold w-full rounded-sm px-3 py-2.5 text-center text-xs font-head tracking-wide disabled:opacity-40"
              >
                {t('placeOrder')}
              </button>
              <button
                type="button"
                data-testid="cart-clear"
                disabled={items.length === 0}
                onClick={clear}
                className="text-xs text-white/50 transition hover:text-red-400 disabled:opacity-40"
              >
                {t('clearOrder')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `npx vitest run tests/components/CartPanel.test.tsx`
Expected: PASS — all 9 tests green (5 pre-existing + 4 new).

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all tests pass, including `tests/components/NavBar.test.tsx` (which mocks `CartPanel` entirely, so it's unaffected).

- [ ] **Step 7: Commit**

```bash
git add src/components/CartPanel.tsx tests/components/CartPanel.test.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json
git commit -m "$(cat <<'EOF'
feat: rebuild CartPanel as a full-height sidebar

Matches the Zeus cart-sidebar structure (backdrop, header, scrollable
items, footer) instead of the small nav dropdown. Renames the primary
action to "Bestelling afronden" and adds a "Bestelling leegmaken"
option beneath it that empties the cart without placing an order.
EOF
)"
```

---

### Task 9: Manual verification in the browser

**Files:** none (verification only).

Automated tests don't cover visual rendering, hover states, or font loading — this task is the required manual check before calling the work done.

- [ ] **Step 1: Start the dev server and open the homepage**

Run: `npm run dev`, open `http://localhost:3000`.
Check: Hero title renders in a bold Montserrat-style font (not the old thin default). Eyebrow labels and section labels are tracked-out and in the same heading font. USP icons scale up slightly on hover; material cards lift and gain a gold-tinted border on hover.

- [ ] **Step 2: Check `/collecties`**

Check: filter buttons use the heading font and turn gold on hover (inactive ones); each card's segment badge is now a gold-outlined pill instead of a black block; hovering a card lifts it and reveals a subtle gold gradient overlay. Clicking a card still opens the product modal; its confirm button now has a visible gold glow on hover in addition to the lift.

- [ ] **Step 3: Check the cart sidebar**

Add an item to the cart, click the cart icon. Check: the panel now slides in from the right, full viewport height, ~400px wide, with a backdrop behind it. The primary button reads "Bestelling afronden" (gold, hover-lift+glow); a smaller "Bestelling leegmaken" link sits beneath it and turns red on hover. Clicking "Bestelling leegmaken" empties the list without creating an order and keeps the panel open. Escape and clicking the backdrop both close it; when it reopens, focus lands on the close (×) button.

- [ ] **Step 4: Check the login button**

Log out (or open in a fresh session) and confirm the "Inloggen" button in the nav is now gold with the same hover-lift+glow as the other primary buttons.

- [ ] **Step 5: Report back**

Note any visual mismatch against the spec (`docs/superpowers/specs/2026-07-20-visuele-polijst-design.md`) so it can be adjusted before considering this plan complete.
