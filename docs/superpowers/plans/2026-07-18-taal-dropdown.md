# Taalkeuze-dropdown Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 18-07-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current 4-separate-buttons `LanguageSwitcher` with a single collapsed toggle button (flag + code + chevron) that opens a click-triggered dropdown menu listing all 4 locales with flags, closing on outside click or on selection.

**Architecture:** Single-file change to the existing `src/components/LanguageSwitcher.tsx` — no new files, no changes to `NavBar.tsx` (it already just renders `<LanguageSwitcher />` as a flex child; the component now manages its own `position: relative` container and an absolutely-positioned dropdown menu, so it continues to drop into the existing layout unchanged). Locale switching logic (`router.replace(pathname, { locale })`) is unchanged from the current implementation — only the UI shell and the open/close interaction are new. Outside-click-to-close is implemented with a `useRef` on the component's root element plus a `document`-level `mousedown` listener registered only while the menu is open.

**Tech Stack:** Same as the existing project — Next.js 14 + TypeScript + Tailwind CSS, next-intl v3 navigation (`usePathname`/`useRouter` from `@/i18n/navigation`), Vitest + React Testing Library.

## Global Constraints

- Default/fallback locale stays `nl` (`routing.defaultLocale`) — unchanged.
- Flags are emoji, not image assets: 🇳🇱 nl, 🇬🇧 en, 🇩🇪 de, 🇫🇷 fr (British flag for English, per explicit choice).
- Menu opens on click (not hover) and closes on: selecting a locale, or clicking anywhere outside the component. This is a deliberate choice to avoid the mouse dead-zone class of bug already found and fixed once in this project's hover-based Collections dropdown.
- Saving the selected locale against a (future) logged-in customer account is explicitly out of scope — see `docs/superpowers/specs/2026-07-18-b2b-portaal-beheeromgeving-roadmap.md`. This plan only changes the front-end switcher UI; it does not add any persistence beyond what already exists (the URL-based locale routing itself).

---

## File Structure Overview

```
src/components/LanguageSwitcher.tsx        (MODIFY — full rewrite: toggle button + dropdown menu)
tests/components/LanguageSwitcher.test.tsx (MODIFY — full rewrite: new interaction contract)
```

No other files change. `src/components/NavBar.tsx` is unaffected (verified: it only imports and renders `<LanguageSwitcher />` with no assumptions about its internal markup).

---

### Task 1: Redesign LanguageSwitcher as a flag-based dropdown

**Files:**
- Modify: `src/components/LanguageSwitcher.tsx`
- Modify: `tests/components/LanguageSwitcher.test.tsx`

**Interfaces:**
- Produces: `LanguageSwitcher()` — same public interface as before (no props), used by `NavBar` (unchanged import, unchanged usage). New `data-testid`s: `language-switcher` (root container), `language-switcher-toggle` (the collapsed button), `language-switcher-menu` (the dropdown panel, only in the DOM while open). `data-testid="language-option-<locale>"` per locale is preserved from the old implementation (same name, now rendered inside the menu instead of always visible).

- [ ] **Step 1: Write the failing tests**

Replace `tests/components/LanguageSwitcher.test.tsx` in full:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
      <div>
        <LanguageSwitcher />
        <button data-testid="outside">Outside</button>
      </div>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  replaceMock.mockClear();
});

describe('LanguageSwitcher', () => {
  it('shows the active locale on the toggle button, menu closed by default', () => {
    renderSwitcher('de');
    expect(screen.getByTestId('language-switcher-toggle')).toHaveTextContent('DE');
    expect(screen.queryByTestId('language-switcher-menu')).not.toBeInTheDocument();
  });

  it('opens the menu with all 4 locale options when the toggle is clicked', () => {
    renderSwitcher('nl');
    fireEvent.click(screen.getByTestId('language-switcher-toggle'));
    expect(screen.getByTestId('language-option-nl')).toBeInTheDocument();
    expect(screen.getByTestId('language-option-en')).toBeInTheDocument();
    expect(screen.getByTestId('language-option-de')).toBeInTheDocument();
    expect(screen.getByTestId('language-option-fr')).toBeInTheDocument();
  });

  it('disables the option matching the active locale', () => {
    renderSwitcher('de');
    fireEvent.click(screen.getByTestId('language-switcher-toggle'));
    expect(screen.getByTestId('language-option-de')).toBeDisabled();
    expect(screen.getByTestId('language-option-nl')).not.toBeDisabled();
  });

  it('switches locale and closes the menu when a different option is clicked', () => {
    renderSwitcher('nl');
    fireEvent.click(screen.getByTestId('language-switcher-toggle'));
    fireEvent.click(screen.getByTestId('language-option-fr'));
    expect(replaceMock).toHaveBeenCalledWith('/', { locale: 'fr' });
    expect(screen.queryByTestId('language-switcher-menu')).not.toBeInTheDocument();
  });

  it('closes the menu when clicking outside', () => {
    renderSwitcher('nl');
    fireEvent.click(screen.getByTestId('language-switcher-toggle'));
    expect(screen.getByTestId('language-switcher-menu')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByTestId('language-switcher-menu')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- LanguageSwitcher`
Expected: FAIL — `language-switcher-toggle` / `language-switcher-menu` test ids don't exist yet in the current implementation (it renders 4 always-visible buttons instead).

- [ ] **Step 3: Rewrite `src/components/LanguageSwitcher.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { usePathname, useRouter } from '@/i18n/navigation';

const LOCALE_META: Record<string, { label: string; flag: string }> = {
  nl: { label: 'NL', flag: '🇳🇱' },
  en: { label: 'EN', flag: '🇬🇧' },
  de: { label: 'DE', flag: '🇩🇪' },
  fr: { label: 'FR', flag: '🇫🇷' },
};

export function LanguageSwitcher() {
  const activeLocale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  function handleSelect(locale: string) {
    router.replace(pathname, { locale });
    setIsOpen(false);
  }

  const active = LOCALE_META[activeLocale];

  return (
    <div ref={containerRef} data-testid="language-switcher" className="relative">
      <button
        type="button"
        data-testid="language-switcher-toggle"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs tracking-wide text-white/80 backdrop-blur-sm hover:text-white"
      >
        <span aria-hidden="true">{active.flag}</span>
        <span>{active.label}</span>
        <span aria-hidden="true" className="text-[0.6rem]">
          ▾
        </span>
      </button>

      {isOpen && (
        <div
          data-testid="language-switcher-menu"
          className="absolute right-0 top-full mt-2 flex flex-col gap-1 rounded-md border border-white/10 bg-black/90 p-2"
        >
          {routing.locales.map((locale) => (
            <button
              key={locale}
              type="button"
              data-testid={`language-option-${locale}`}
              aria-current={locale === activeLocale ? 'true' : undefined}
              disabled={locale === activeLocale}
              onClick={() => handleSelect(locale)}
              className={`flex items-center gap-2 whitespace-nowrap rounded px-3 py-1.5 text-xs tracking-wide ${
                locale === activeLocale
                  ? 'bg-white/20 text-white'
                  : 'text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span aria-hidden="true">{LOCALE_META[locale].flag}</span>
              <span>{LOCALE_META[locale].label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- LanguageSwitcher`
Expected: PASS — 5 tests passed.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests green (confirms `NavBar.test.tsx` and `NavBarAccountMenuIntegration.test.tsx`, which render the real `LanguageSwitcher` inside `NavBar`, are unaffected — neither references `language-option-*` or the old always-visible button layout).

- [ ] **Step 6: Commit**

```bash
git add src/components/LanguageSwitcher.tsx tests/components/LanguageSwitcher.test.tsx
git commit -m "feat: redesign LanguageSwitcher as a flag-based click-to-open dropdown"
```

---

### Task 2: Static export build verification

**Files:**
- No new files. This task verifies the redesigned component builds correctly and works in a real browser.

- [ ] **Step 1: Run the production build**

Run: `npm run build`
Expected: build completes successfully, no new errors or warnings related to `LanguageSwitcher`.

- [ ] **Step 2: Run the full test suite one final time**

Run: `npm test`
Expected: PASS — all tests green.

- [ ] **Step 3: Manually verify in the browser**

Run: `npx serve out -l 4173` (or reuse whatever static server command was used for previous plans) and open the site.

Check:
- The nav bar shows a single pill button with the current locale's flag + code + a small down-chevron, not 4 separate buttons.
- Clicking the button opens a dropdown below it listing all 4 locales, each with their flag, the active one visually marked and not clickable.
- Clicking a different locale switches the page language and closes the dropdown.
- Clicking anywhere outside the dropdown (e.g. on the page background) closes it without switching locale.
- This works correctly on at least two different pages (e.g. homepage and `/collecties`) to confirm it's not accidentally tied to one page's layout.
- Mobile width (375px): the button and dropdown remain usable, no horizontal overflow, dropdown doesn't get clipped off-screen (it's right-aligned via `right-0`, so it should stay within the viewport under the nav bar).

- [ ] **Step 4: Commit**

No code changes expected in this task. If Steps 1–3 surfaced a fix, commit it with a message describing what was broken, then re-run Steps 1–3.
