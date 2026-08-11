# Beheer-gebruikershandleiding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Dutch-language user manual page for beheer (`/nl/beheer/documentatie`), and wire every beheer section/detail-screen to it with a "?" icon that deep-links to the relevant chapter, replacing the existing `HelpHint` popovers.

**Architecture:** One long, auth-gated Next.js page under `src/app/[locale]/beheer/documentatie/`, styled as a light, readable document (not beheer's dark glass theme) with a sticky sidebar table of contents and one `<section id="...">`/`<div id="...">` per (sub)chapter for anchor deep-linking. A new `HelpLink` component (small "?" `<a>` that opens `/nl/beheer/documentatie#<anchor>` in a new tab) replaces `HelpHint` (popover-with-text) everywhere it's used, plus gets added to every beheer section and the 5 main detail modals.

**Tech Stack:** Next.js 14 App Router (`src/app/[locale]/...`), React client/server components, Tailwind, `next-intl` (page shell only — manual body text is hardcoded Dutch, no i18n keys), Vitest + Testing Library.

## Global Constraints

- Manual content is Dutch-only, hardcoded directly in JSX — no `next-intl` message keys for the prose (per `CLAUDE.md`: beheer-only text only needs `messages/nl.json`, and per the design spec, hundreds of one-off i18n keys for prose adds no value).
- Route: `src/app/[locale]/beheer/documentatie/page.tsx`. Gated the same way `beheer` itself is — a client-side auth check (`useAdminAuth`), not a server-side redirect.
- Every "?" icon opens `/nl/beheer/documentatie` (optionally `#anchor`) in a **new tab** (`target="_blank" rel="noopener noreferrer"`).
- Every "?" icon is built from the shared `HelpLink` component (`src/components/HelpLink.tsx`), never a one-off `<a>`.
- Screen-level "?" icons (section panels, modal headers) are positioned **top-right** of their container. Field-level "?" icons (next to a specific input/label) stay inline next to that field, unchanged in position.
- No screenshots. The two schema diagrams (klant-registratie, bestelproces) are plain HTML/CSS box-and-arrow layouts.
- Tailwind color tokens available: `ink`, `charcoal`, `graphite`, `silver`, `silver-dim`, `gold`, `gold-bright` (`tailwind.config.ts`), plus Tailwind's built-in `white`. Fonts: `font-head`, `font-body`.
- Design spec: `docs/superpowers/specs/2026-08-11-beheer-gebruikershandleiding-design.md`.

### Anchor map (chapter/sub-chapter id → what links to it)

| Anchor | Chapter | Linked from |
|---|---|---|
| `klant-website` | 1. De klant-website | (TOC only) |
| `klant-registratie` | 2. Klant registreren en goedkeuren | `klanten` section |
| `klant-registratie-goedkeuren` | 2a. Voordat je kunt goedkeuren | `KlantModal` |
| `klant-registratie-wachtwoord` | 2b. Wachtwoord uitgeven | (TOC only) |
| `bestelproces` | 3. Een bestelling verwerken | `bestellingen` section |
| `bestelproces-bewerken` | 3a. Een bestelling bewerken | `BestellingModal` |
| `bestelproces-drukker` | 3b. Naar de drukker sturen | (TOC only) |
| `bestelproces-zendingen-terugvinden` | 3c. Een verstuurde mail terugvinden | (TOC only) |
| `bestelproces-zoeken-op-zendingnummer` | 3d. Snel zoeken op zendingnummer | (TOC only) |
| `bestelproces-afronden-zending` | 3e. Afronden binnen een zending | (TOC only) |
| `bestelproces-facturatie` | 3f. Facturatie | (TOC only) |
| `kunstwerken` | 4. Een kunstwerk aanmaken | `kunstwerken` section |
| `kunstwerken-foto` | 4a. Foto | (TOC only) |
| `kunstwerken-code` | 4b. Code | `KunstwerkModal` |
| `kunstwerken-formaat` | 4c. Formaat en maten | (TOC only) |
| `kunstwerken-voorbeeld` | 4d. Live voorbeeld | (TOC only) |
| `kunstenaars` | 5. Een kunstenaar aanmaken | `kunstenaars` section |
| `kunstenaars-koppeling` | 5a. Klant koppelen | (TOC only) |
| `kunstenaars-opslag` | 5b. Prijsopslag | `KunstenaarModal` (field-level, inline) |
| `kunstenaars-exclusiviteit` | 5c. Exclusiviteit | `KunstenaarModal` (screen-level + field-level, inline) |
| `prijsmatrix` | 6. Prijzen: de prijsmatrix en het prijsmodel | `prijsmatrix` section |
| `stamgegevens` | 7. Overige stamgegevens | (TOC only) |
| `stamgegevens-materiaalsoorten` | 7a | `materiaalsoorten` section |
| `stamgegevens-materialen` | 7b | `materialen` section |
| `stamgegevens-maten` | 7c | `maten` section |
| `stamgegevens-segmenten` | 7d | `segmenten` section |
| `stamgegevens-stijlen` | 7e | `stijlen` section |
| `stamgegevens-onderwerpen` | 7f | `onderwerpen` section |
| `stamgegevens-prijsgroepen` | 7g | `prijsgroepen` section + `PrijsgroepModal` |
| `stamgegevens-activiteit` | 7h | `activiteit` section |
| `drukkers` | 8. Drukkers | `drukkers` section |
| `drukkers-standaard` | 8a. Standaard-drukker | `DrukkerModal` |
| `glassart-design` | 9. Glassart and design | `glassartDesign` section |
| `instellingen` | 10. Instellingen | `instellingen` section |

---

## Task 1: `HelpLink` component (replaces `HelpHint`)

**Files:**
- Create: `src/components/HelpLink.tsx`
- Create: `tests/components/HelpLink.test.tsx`

**Interfaces:**
- Produces: `HelpLink({ anchor?: string; label: string; size?: 'sm' | 'md'; testId?: string; className?: string })` — a `<a>` "?" icon linking to `/nl/beheer/documentatie` (or `#anchor` appended), opening in a new tab. Every later task that adds a "?" icon uses this component.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/HelpLink.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HelpLink } from '@/components/HelpLink';

describe('HelpLink', () => {
  it('links to the documentation root when no anchor is given', () => {
    render(<HelpLink label="Open de handleiding" testId="test-help-link" />);
    const link = screen.getByTestId('test-help-link');
    expect(link).toHaveAttribute('href', '/nl/beheer/documentatie');
  });

  it('links to a specific anchor when one is given', () => {
    render(<HelpLink anchor="kunstwerken-code" label="Open het hoofdstuk over de code" testId="test-help-link" />);
    expect(screen.getByTestId('test-help-link')).toHaveAttribute(
      'href',
      '/nl/beheer/documentatie#kunstwerken-code'
    );
  });

  it('opens in a new tab', () => {
    render(<HelpLink label="Open de handleiding" testId="test-help-link" />);
    const link = screen.getByTestId('test-help-link');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('uses the label as accessible name and title', () => {
    render(<HelpLink label="Open het hoofdstuk over kunstenaars" testId="test-help-link" />);
    const link = screen.getByTestId('test-help-link');
    expect(link).toHaveAttribute('aria-label', 'Open het hoofdstuk over kunstenaars');
    expect(link).toHaveAttribute('title', 'Open het hoofdstuk over kunstenaars');
  });

  it('falls back to a default test id when none is given', () => {
    render(<HelpLink label="Open de handleiding" />);
    expect(screen.getByTestId('help-link')).toBeInTheDocument();
  });

  it('renders the question mark', () => {
    render(<HelpLink label="Open de handleiding" testId="test-help-link" />);
    expect(screen.getByTestId('test-help-link')).toHaveTextContent('?');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/HelpLink.test.tsx`
Expected: FAIL — `Cannot find module '@/components/HelpLink'`

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/HelpLink.tsx
'use client';

const DOCUMENTATIE_PAD = '/nl/beheer/documentatie';

interface HelpLinkProps {
  anchor?: string;
  label: string;
  size?: 'sm' | 'md';
  testId?: string;
  className?: string;
}

export function HelpLink({ anchor, label, size = 'md', testId, className = '' }: HelpLinkProps) {
  const href = anchor ? `${DOCUMENTATIE_PAD}#${anchor}` : DOCUMENTATIE_PAD;
  const sizeClasses = size === 'sm' ? 'h-4 w-4 text-[10px]' : 'h-5 w-5 text-xs';

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      data-testid={testId ?? 'help-link'}
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-gold font-semibold leading-none text-gold transition hover:border-gold-bright hover:text-gold-bright ${sizeClasses} ${className}`}
    >
      ?
    </a>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/HelpLink.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/HelpLink.tsx tests/components/HelpLink.test.tsx
git commit -m "feat: add HelpLink component that opens the docs in a new tab"
```

---

## Task 2: Documentatie route, auth gate, shared blocks, sidebar, and Chapter 1 (De klant-website)

**Files:**
- Create: `src/app/[locale]/beheer/documentatie/page.tsx`
- Create: `src/components/beheer/documentatie/DocumentatieGate.tsx`
- Create: `src/components/beheer/documentatie/Documentatie.tsx`
- Create: `src/components/beheer/documentatie/DocumentatieSidebar.tsx`
- Create: `src/components/beheer/documentatie/DocumentatieBlocks.tsx`
- Create: `src/components/beheer/documentatie/chapters/KlantWebsiteChapter.tsx`
- Test: `tests/components/beheer/documentatie/DocumentatieGate.test.tsx`
- Test: `tests/components/beheer/documentatie/DocumentatieSidebar.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks besides Next.js/next-intl conventions already used by `src/app/[locale]/beheer/page.tsx`.
- Produces: `Chapter({ id, title, children })`, `SubSection({ id, title, children })`, `P({ children })`, `UL({ children })` in `DocumentatieBlocks.tsx` — every later chapter task imports these. `Documentatie` renders `<DocumentatieSidebar />` plus a chapters container; later chapter tasks add one `<XChapter />` import + JSX line each to `Documentatie.tsx`.

- [ ] **Step 1: Write the shared prose building blocks**

```tsx
// src/components/beheer/documentatie/DocumentatieBlocks.tsx
import type { ReactNode } from 'react';

export function Chapter({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-8 border-t border-silver-dim/60 pt-10 first:border-t-0 first:pt-0">
      <h2 className="font-head text-2xl text-ink">{title}</h2>
      <div className="mt-4 flex flex-col gap-5">{children}</div>
    </section>
  );
}

export function SubSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-8 flex flex-col gap-2">
      <h3 className="font-head text-lg text-ink">{title}</h3>
      {children}
    </div>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="font-body leading-relaxed text-charcoal/90">{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="flex list-disc flex-col gap-1 pl-5 font-body leading-relaxed text-charcoal/90">{children}</ul>;
}

export function DocLink({ anchor, children }: { anchor: string; children: ReactNode }) {
  return (
    <a href={`#${anchor}`} className="text-gold underline decoration-gold/40 underline-offset-2 hover:text-gold-bright">
      {children}
    </a>
  );
}
```

- [ ] **Step 2: Write the sidebar (full table of contents, all anchors from the table above)**

```tsx
// src/components/beheer/documentatie/DocumentatieSidebar.tsx
interface TocItem {
  href: string;
  label: string;
  subs?: { href: string; label: string }[];
}

const TOC: TocItem[] = [
  { href: '#klant-website', label: '1. De klant-website' },
  {
    href: '#klant-registratie',
    label: '2. Klant registreren en goedkeuren',
    subs: [
      { href: '#klant-registratie-goedkeuren', label: 'Voordat je kunt goedkeuren' },
      { href: '#klant-registratie-wachtwoord', label: 'Wachtwoord uitgeven' },
    ],
  },
  {
    href: '#bestelproces',
    label: '3. Een bestelling verwerken',
    subs: [
      { href: '#bestelproces-bewerken', label: 'Een bestelling bewerken' },
      { href: '#bestelproces-drukker', label: 'Naar de drukker sturen' },
      { href: '#bestelproces-zendingen-terugvinden', label: 'Een verstuurde mail terugvinden' },
      { href: '#bestelproces-zoeken-op-zendingnummer', label: 'Snel zoeken op zendingnummer' },
      { href: '#bestelproces-afronden-zending', label: 'Afronden binnen een zending' },
      { href: '#bestelproces-facturatie', label: 'Facturatie' },
    ],
  },
  {
    href: '#kunstwerken',
    label: '4. Een kunstwerk aanmaken',
    subs: [
      { href: '#kunstwerken-foto', label: 'Foto' },
      { href: '#kunstwerken-code', label: 'Code' },
      { href: '#kunstwerken-formaat', label: 'Formaat en maten' },
      { href: '#kunstwerken-voorbeeld', label: 'Live voorbeeld' },
    ],
  },
  {
    href: '#kunstenaars',
    label: '5. Een kunstenaar aanmaken',
    subs: [
      { href: '#kunstenaars-koppeling', label: 'Klant koppelen' },
      { href: '#kunstenaars-opslag', label: 'Prijsopslag' },
      { href: '#kunstenaars-exclusiviteit', label: 'Exclusiviteit' },
    ],
  },
  { href: '#prijsmatrix', label: '6. Prijzen: de prijsmatrix en het prijsmodel' },
  {
    href: '#stamgegevens',
    label: '7. Overige stamgegevens',
    subs: [
      { href: '#stamgegevens-materiaalsoorten', label: 'Materiaalsoorten' },
      { href: '#stamgegevens-materialen', label: 'Materialen' },
      { href: '#stamgegevens-maten', label: 'Maten' },
      { href: '#stamgegevens-segmenten', label: 'Segmenten' },
      { href: '#stamgegevens-stijlen', label: 'Stijlen' },
      { href: '#stamgegevens-onderwerpen', label: 'Onderwerpen' },
      { href: '#stamgegevens-prijsgroepen', label: 'Prijsgroepen' },
      { href: '#stamgegevens-activiteit', label: 'Activiteit' },
    ],
  },
  { href: '#drukkers', label: '8. Drukkers', subs: [{ href: '#drukkers-standaard', label: 'Standaard-drukker' }] },
  { href: '#glassart-design', label: '9. Glassart and design' },
  { href: '#instellingen', label: '10. Instellingen' },
];

export function DocumentatieSidebar() {
  return (
    <nav aria-label="Inhoudsopgave" data-testid="documentatie-sidebar" className="sticky top-8 self-start">
      <ul className="flex flex-col gap-3 font-body text-sm">
        {TOC.map((item) => (
          <li key={item.href}>
            <a href={item.href} className="font-semibold text-ink hover:text-gold">
              {item.label}
            </a>
            {item.subs && (
              <ul className="mt-1 flex flex-col gap-1 border-l border-silver-dim pl-3">
                {item.subs.map((sub) => (
                  <li key={sub.href}>
                    <a href={sub.href} className="text-charcoal/80 hover:text-gold">
                      {sub.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 3: Write Chapter 1 (De klant-website)**

```tsx
// src/components/beheer/documentatie/chapters/KlantWebsiteChapter.tsx
import { Chapter, DocLink, P } from '../DocumentatieBlocks';

export function KlantWebsiteChapter() {
  return (
    <Chapter id="klant-website" title="1. De klant-website">
      <P>
        Dit is een kort overzicht van wat een klant op de website ziet, en waar jij dat in beheer aanpast.
      </P>
      <P>
        <strong>Home</strong> — de openingspagina: een korte introductie, waarom-kies-je-ons, een paar
        uitgelichte kunstwerken en de contactgegevens onderaan. De tekst hierop staat vast in de website
        zelf en pas je niet aan via beheer. De uitgelichte kunstwerken komen uit{' '}
        <DocLink anchor="kunstwerken">de kunstwerken die jij aanmaakt</DocLink>, de contactgegevens uit{' '}
        <DocLink anchor="glassart-design">Glassart and design</DocLink>. Er is geen apart menu-item
        &quot;Over ons&quot; — die tekst staat als vast onderdeel op de Home-pagina.
      </P>
      <P>
        <strong>Collecties</strong> — het overzicht van alle kunstwerken die een klant kan bestellen, met
        filters op segment, stijl, onderwerp en materiaal. Alles hier komt rechtstreeks uit{' '}
        <DocLink anchor="kunstwerken">de kunstwerken die jij aanmaakt</DocLink>; de filters komen uit{' '}
        <DocLink anchor="stamgegevens">de overige stamgegevens</DocLink>.
      </P>
      <P>
        <strong>Contact</strong> — adres, e-mailadres, contactpersonen, WhatsApp-nummer en openingstijden,
        plus een contactformulier. Alle gegevens hierop komen uit{' '}
        <DocLink anchor="glassart-design">Glassart and design</DocLink>.
      </P>
      <P>
        <strong>Word klant</strong> — het aanmeldformulier voor nieuwe klanten. Zodra iemand dit invult,
        komt de aanvraag in beheer terecht bij Klanten, met status &quot;Beoordelen&quot; — zie{' '}
        <DocLink anchor="klant-registratie">Klant registreren en goedkeuren</DocLink>.
      </P>
      <P>
        <strong>Inloggen</strong> — hier loggen bestaande klanten in met hun e-mailadres en wachtwoord. Nog
        geen wachtwoord? Dat geef jij als beheerder uit — zie{' '}
        <DocLink anchor="klant-registratie-wachtwoord">Wachtwoord uitgeven</DocLink>.
      </P>
      <P>
        <strong>Mijn account</strong> — alleen zichtbaar als icoon rechtsboven wanneer een klant is
        ingelogd. Hierachter ziet de klant zijn eigen bestellingen en gegevens.
      </P>
    </Chapter>
  );
}
```

- [ ] **Step 4: Write the page layout wiring the sidebar + chapter 1 together**

```tsx
// src/components/beheer/documentatie/Documentatie.tsx
import { Link } from '@/i18n/navigation';
import { DocumentatieSidebar } from './DocumentatieSidebar';
import { KlantWebsiteChapter } from './chapters/KlantWebsiteChapter';

export function Documentatie() {
  return (
    <main data-testid="documentatie-page" className="min-h-screen bg-white text-ink">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 pb-4 pt-8 sm:px-8">
        <h1 className="font-head text-2xl text-ink sm:text-3xl">Gebruikershandleiding beheer</h1>
        <Link href="/beheer" className="text-sm text-gold hover:text-gold-bright">
          Terug naar beheer
        </Link>
      </div>
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-10 px-4 pb-24 sm:px-8 lg:grid-cols-[220px_1fr]">
        <DocumentatieSidebar />
        <div className="flex flex-col gap-10">
          <KlantWebsiteChapter />
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Write the auth gate**

```tsx
// src/components/beheer/documentatie/DocumentatieGate.tsx
'use client';

import { useEffect, useRef } from 'react';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { GlassPanel } from '@/components/GlassPanel';
import { Documentatie } from './Documentatie';

export function DocumentatieGate() {
  const { user, isAdmin, isHydrated, logout } = useAdminAuth();
  const hasSignedOutUnauthorized = useRef(false);

  const isUnauthorized = isHydrated && !!user && !isAdmin;

  useEffect(() => {
    if (isUnauthorized && !hasSignedOutUnauthorized.current) {
      hasSignedOutUnauthorized.current = true;
      logout();
    }
    if (!isUnauthorized) {
      hasSignedOutUnauthorized.current = false;
    }
  }, [isUnauthorized, logout]);

  if (!isHydrated) {
    return null;
  }

  if (!user || isUnauthorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink px-4">
        <GlassPanel className="mx-auto !max-w-lg">
          <p data-testid="documentatie-unauthorized" className="text-sm text-white/80">
            Je moet ingelogd zijn als medewerker om de gebruikershandleiding te bekijken.
          </p>
        </GlassPanel>
      </main>
    );
  }

  return <Documentatie />;
}
```

- [ ] **Step 6: Write the route**

```tsx
// src/app/[locale]/beheer/documentatie/page.tsx
import { setRequestLocale } from 'next-intl/server';
import { DocumentatieGate } from '@/components/beheer/documentatie/DocumentatieGate';

export function generateStaticParams() {
  return [{ locale: 'nl' }];
}

export default async function BeheerDocumentatiePage({ params }: { params: { locale: string } }) {
  const { locale } = params;
  setRequestLocale(locale);

  return <DocumentatieGate />;
}
```

- [ ] **Step 7: Write the failing gate test**

```tsx
// tests/components/beheer/documentatie/DocumentatieGate.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { DocumentatieGate } from '@/components/beheer/documentatie/DocumentatieGate';
import messages from '../../../../messages/nl.json';

const logoutMock = vi.fn();
let mockAuthState: {
  user: { uid: string; email: string | null } | null;
  isAdmin: boolean;
  isHydrated: boolean;
};

vi.mock('@/lib/useAdminAuth', () => ({
  useAdminAuth: () => ({ ...mockAuthState, logout: logoutMock }),
}));

function renderGate() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <DocumentatieGate />
    </NextIntlClientProvider>
  );
}

describe('DocumentatieGate', () => {
  it('renders nothing while not hydrated', () => {
    mockAuthState = { user: null, isAdmin: false, isHydrated: false };
    renderGate();
    expect(screen.queryByTestId('documentatie-page')).not.toBeInTheDocument();
    expect(screen.queryByTestId('documentatie-unauthorized')).not.toBeInTheDocument();
  });

  it('shows an unauthorized message when not logged in', () => {
    mockAuthState = { user: null, isAdmin: false, isHydrated: true };
    renderGate();
    expect(screen.getByTestId('documentatie-unauthorized')).toBeInTheDocument();
  });

  it('signs out and shows unauthorized when logged in without staff rights', async () => {
    mockAuthState = { user: { uid: 'uid-2', email: 'onbekend@glassartanddesign.com' }, isAdmin: false, isHydrated: true };
    renderGate();
    expect(screen.getByTestId('documentatie-unauthorized')).toBeInTheDocument();
    await waitFor(() => expect(logoutMock).toHaveBeenCalled());
  });

  it('shows the documentation with the sidebar and chapter 1 when authorized', () => {
    mockAuthState = { user: { uid: 'staff-1', email: 'paul@glassartanddesign.com' }, isAdmin: true, isHydrated: true };
    renderGate();
    expect(screen.getByTestId('documentatie-page')).toBeInTheDocument();
    expect(screen.getByTestId('documentatie-sidebar')).toBeInTheDocument();
    expect(document.getElementById('klant-website')).not.toBeNull();
  });
});
```

- [ ] **Step 8: Run test to verify it fails, then passes**

Run: `npx vitest run tests/components/beheer/documentatie/DocumentatieGate.test.tsx`
Expected: FAILs first (files don't exist yet if written out of order — since steps 1-6 already created the files, this should PASS immediately; if it fails, fix the gate/page/Documentatie code above until it does).

- [ ] **Step 9: Write and run the sidebar test**

```tsx
// tests/components/beheer/documentatie/DocumentatieSidebar.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DocumentatieSidebar } from '@/components/beheer/documentatie/DocumentatieSidebar';

describe('DocumentatieSidebar', () => {
  it('links to all 10 top-level chapters', () => {
    render(<DocumentatieSidebar />);
    const nav = screen.getByTestId('documentatie-sidebar');
    [
      '#klant-website',
      '#klant-registratie',
      '#bestelproces',
      '#kunstwerken',
      '#kunstenaars',
      '#prijsmatrix',
      '#stamgegevens',
      '#drukkers',
      '#glassart-design',
      '#instellingen',
    ].forEach((href) => {
      expect(nav.querySelector(`a[href="${href}"]`)).not.toBeNull();
    });
  });

  it('links to sub-chapters, e.g. the kunstwerken-code anchor', () => {
    render(<DocumentatieSidebar />);
    expect(screen.getByTestId('documentatie-sidebar').querySelector('a[href="#kunstwerken-code"]')).not.toBeNull();
  });
});
```

Run: `npx vitest run tests/components/beheer/documentatie/DocumentatieSidebar.test.tsx tests/components/beheer/documentatie/DocumentatieGate.test.tsx`
Expected: PASS (6 tests total)

- [ ] **Step 10: Commit**

```bash
git add src/app/\[locale\]/beheer/documentatie src/components/beheer/documentatie tests/components/beheer/documentatie
git commit -m "feat: add beheer documentatie route, auth gate, layout and chapter 1"
```

---

## Task 3: Chapter 2 — Klant registreren en goedkeuren

**Files:**
- Create: `src/components/beheer/documentatie/chapters/KlantRegistratieChapter.tsx`
- Modify: `src/components/beheer/documentatie/Documentatie.tsx`
- Test: extend `tests/components/beheer/documentatie/DocumentatieGate.test.tsx`

**Interfaces:**
- Consumes: `Chapter`, `SubSection`, `P`, `DocLink` from `../DocumentatieBlocks` (Task 2).
- Produces: `<KlantRegistratieChapter />`, anchors `klant-registratie`, `klant-registratie-goedkeuren`, `klant-registratie-wachtwoord`.

- [ ] **Step 1: Write the chapter**

```tsx
// src/components/beheer/documentatie/chapters/KlantRegistratieChapter.tsx
import { Chapter, SubSection, P, DocLink } from '../DocumentatieBlocks';

function RegistratieSchema() {
  const stappen = [
    'Klant registreert zichzelf',
    'Beheer beoordeelt de aanvraag',
    'Prijsgroep koppelen (verplicht)',
    'Kunstenaar koppelen (optioneel)',
    'Klant is goedgekeurd',
  ];
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-silver/50 p-4">
      <div className="flex flex-wrap items-center gap-3">
        {stappen.map((stap, index) => (
          <div key={stap} className="flex items-center gap-3">
            <div className="rounded-md border border-gold bg-white px-3 py-2 text-sm font-body text-ink">{stap}</div>
            {index < stappen.length - 1 && (
              <span aria-hidden="true" className="text-gold">
                &rarr;
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 text-sm text-charcoal/80">
        <span aria-hidden="true" className="text-gold">
          of:
        </span>
        <div className="rounded-md border border-charcoal/30 bg-white px-3 py-2 font-body text-ink">
          Beheer wijst de aanvraag af
        </div>
      </div>
    </div>
  );
}

export function KlantRegistratieChapter() {
  return (
    <Chapter id="klant-registratie" title="2. Klant registreren en goedkeuren">
      <P>
        Een nieuwe klant meldt zichzelf aan via &quot;Word klant&quot; op de website. Zijn aanvraag komt
        bij jou in beheer terecht, bij Klanten, met status &quot;Beoordelen&quot;. Jij beoordeelt de
        aanvraag en keurt hem goed of af.
      </P>
      <RegistratieSchema />
      <SubSection id="klant-registratie-goedkeuren" title="Voordat je kunt goedkeuren">
        <P>
          De knop &quot;Goedkeuren&quot; blijft grijs tot twee dingen kloppen: er is een prijsgroep gekozen
          voor deze klant, en er staat een btw-tarief ingesteld voor het land van deze klant.
        </P>
        <P>
          Wil je deze klant ook koppelen aan een kunstenaar — bijvoorbeeld omdat de klant zelf de
          kunstenaar is, of exclusief voor een kunstenaar mag verkopen? Kies die dan in hetzelfde scherm.
          Prijsafspraken en een eventuele opslag voor die kunstenaar stel je niet hier in, maar bij de
          kunstenaar zelf — zie <DocLink anchor="kunstenaars">Een kunstenaar aanmaken</DocLink>.
        </P>
        <P>
          Wijs je de aanvraag af, dan vraagt beheer om een reden; die reden zie je terug in de
          klantgeschiedenis.
        </P>
      </SubSection>
      <SubSection id="klant-registratie-wachtwoord" title="Wachtwoord uitgeven">
        <P>
          Een net goedgekeurde klant heeft nog geen wachtwoord. Klik in het klantscherm op &quot;Wachtwoord
          uitgeven&quot; om er automatisch een aan te maken en te tonen. Geef dit meteen door aan de klant:
          zodra je het venster sluit — met de sluitknop, met Esc of door ernaast te klikken — is het
          wachtwoord weg en kun je het niet opnieuw opvragen. Zolang het venster open staat, zijn de
          knoppen eronder geblokkeerd, want ook die sluiten het venster.
        </P>
      </SubSection>
    </Chapter>
  );
}
```

- [ ] **Step 2: Wire the chapter into the page**

In `src/components/beheer/documentatie/Documentatie.tsx`, add the import and render it after `<KlantWebsiteChapter />`:

```tsx
import { KlantRegistratieChapter } from './chapters/KlantRegistratieChapter';
```

```tsx
        <div className="flex flex-col gap-10">
          <KlantWebsiteChapter />
          <KlantRegistratieChapter />
        </div>
```

- [ ] **Step 3: Extend the gate test to cover the new anchor**

In `tests/components/beheer/documentatie/DocumentatieGate.test.tsx`, in the `'shows the documentation with the sidebar and chapter 1 when authorized'` test, add:

```tsx
    expect(document.getElementById('klant-registratie-goedkeuren')).not.toBeNull();
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/components/beheer/documentatie`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/documentatie tests/components/beheer/documentatie
git commit -m "feat: add klant-registratie chapter to de gebruikershandleiding"
```

---

## Task 4: Chapter 3 — Een bestelling verwerken

**Files:**
- Create: `src/components/beheer/documentatie/chapters/BestelprocesChapter.tsx`
- Modify: `src/components/beheer/documentatie/Documentatie.tsx`
- Test: extend `tests/components/beheer/documentatie/DocumentatieGate.test.tsx`

**Interfaces:**
- Consumes: `Chapter`, `SubSection`, `P`, `DocLink` from `../DocumentatieBlocks`.
- Produces: `<BestelprocesChapter />`, anchors `bestelproces`, `bestelproces-bewerken`, `bestelproces-drukker`, `bestelproces-zendingen-terugvinden`, `bestelproces-zoeken-op-zendingnummer`, `bestelproces-afronden-zending`, `bestelproces-facturatie`.

- [ ] **Step 1: Write the chapter**

```tsx
// src/components/beheer/documentatie/chapters/BestelprocesChapter.tsx
import { Chapter, SubSection, P, DocLink } from '../DocumentatieBlocks';

function BestelprocesSchema() {
  const stappen = [
    'Klant bestelt en rondt af',
    'Te beoordelen',
    'Te versturen naar drukker',
    'Verstuurd naar drukker',
    'Te factureren',
    'Betaald en afgerond',
  ];
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-silver/50 p-4">
      <div className="flex flex-wrap items-center gap-3">
        {stappen.map((stap, index) => (
          <div key={stap} className="flex items-center gap-3">
            <div className="rounded-md border border-gold bg-white px-3 py-2 text-sm font-body text-ink">{stap}</div>
            {index < stappen.length - 1 && (
              <span aria-hidden="true" className="text-gold">
                &rarr;
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 text-sm text-charcoal/80">
        <span aria-hidden="true" className="text-gold">
          vanuit &quot;Te beoordelen&quot; kan ook:
        </span>
        <div className="rounded-md border border-charcoal/30 bg-white px-3 py-2 font-body text-ink">Afgewezen</div>
      </div>
    </div>
  );
}

const VOORBEELDMAIL = `Onderwerp: Z-2026-014 — Nieuwe order(s) voor de drukker – 11-8-2026

== Interieurstudio De Vries (KL-00042) ==
Afleveradres: Molenstraat 12, 3811 EX Amersfoort

Bestelling B-2026-0301:
- GLA-JAC-00007 — 6mm Glas — Blank helder, maat 60x90 cm (Staand), aantal 2
- GLA-JAC-00012 — 6mm Glas — Blank helder, maat 40x40 cm, aantal 1

== Hotel Boschoord ==
Afleveradres: Bosweg 3, 7524 AB Enschede

Bestelling B-2026-0304:
- GLA-JAC-00007 — 6mm Glas — Blank helder, maat 90x60 cm (Liggend), aantal 4
- GLA-JAC-00019 — 8mm Acryl — Mat wit, maat 120x80 cm (Liggend), aantal 1

Bestelling B-2026-0305:
- GLA-JAC-00012 — 6mm Glas — Blank helder, maat 40x40 cm, aantal 3

== Kantoorpand Zuidas (KL-00108) ==
Afleveradres: Zuidplein 90, 1077 XV Amsterdam

Bestelling B-2026-0309:
- GLA-JAC-00019 — 8mm Acryl — Mat wit, maat 120x80 cm (Liggend), aantal 2
- GLA-JAC-00007 — 6mm Glas — Blank helder, maat 60x90 cm (Staand), aantal 1

--
Glassart & Design
Den Heuvel 21, 5688 EM Oirschot
KVK-nummer: 12345678
Btw-nummer: NL001234567B01
E-mailadres (voor facturen): info@glassartdesign.nl`;

export function BestelprocesChapter() {
  return (
    <Chapter id="bestelproces" title="3. Een bestelling verwerken">
      <P>
        Een klant zet producten in zijn winkelwagen en rondt de bestelling af. Vanaf dat moment beheer jij
        het verdere verloop, van controleren tot en met versturen naar de drukker.
      </P>
      <BestelprocesSchema />
      <SubSection id="bestelproces-bewerken" title="Een bestelling bewerken">
        <P>
          Zolang een bestelling nog &quot;Te beoordelen&quot; is, kun je alles aanpassen: regels
          toevoegen, verwijderen of wijzigen, en een prijs vaststellen als die nog ontbreekt (&quot;op
          aanvraag&quot;).
        </P>
        <P>
          Je kunt ook een korting instellen voor de hele bestelling — bijvoorbeeld vanwege een
          prijsafspraak met een kunstenaar. Die korting is een vast bedrag in euro&apos;s, dat pas
          helemaal aan het eind wordt afgetrokken van de totaalprijs: ná de prijs per regel, de eventuele
          kunstenaarsopslag en de prijsgroep-korting of -opslag van de klant. Zie{' '}
          <DocLink anchor="prijsmatrix">Prijzen: de prijsmatrix en het prijsmodel</DocLink> voor de
          volledige berekening.
        </P>
        <P>
          Zodra een bestelling naar de drukker is verstuurd (of verder), kun je de regels zelf niet meer
          aanpassen — dan kun je alleen nog een ontbrekende prijs vaststellen. Is de bestelling afgewezen,
          dan zit hij helemaal op slot.
        </P>
      </SubSection>
      <SubSection id="bestelproces-drukker" title="Naar de drukker sturen">
        <P>
          Vink een of meer bestellingen met status &quot;Te versturen naar drukker&quot; aan en klik op
          &quot;Versturen naar drukker&quot;. Kies de drukker — jouw standaard-drukker staat al
          geselecteerd, zie <DocLink anchor="drukkers-standaard">Standaard-drukker</DocLink> — en bekijk de
          mail voordat je &apos;m verstuurt. Alle aangevinkte bestellingen gaan in één mail, gegroepeerd
          per klant. Bijvoorbeeld (fictief voorbeeld, met kunstwerken van kunstenaar Jack):
        </P>
        <pre className="overflow-x-auto rounded-md bg-silver/60 p-4 font-mono text-xs leading-relaxed text-ink">
          {VOORBEELDMAIL}
        </pre>
        <P>
          Onderaan de mail staan altijd je bedrijfsgegevens als factuurvoetje (adres, KvK-nummer,
          btw-nummer, e-mailadres) — zie <DocLink anchor="glassart-design">Glassart and design</DocLink>.
          Ontbreekt daar iets, dan kun je niet versturen. Na het versturen krijgen alle bestellingen in de
          mail automatisch status &quot;Verstuurd naar drukker&quot; en een gedeeld zendingnummer.
        </P>
      </SubSection>
      <SubSection id="bestelproces-zendingen-terugvinden" title="Een verstuurde mail terugvinden">
        <P>
          Wil je een eerder verstuurde mail naar de drukker terugzien? Open die drukker in het scherm
          Drukkers (zie <DocLink anchor="drukkers">Drukkers</DocLink>) — daar staat een overzicht van alle
          verstuurde zendingen, met het zendingnummer en de verstuurdatum.
        </P>
      </SubSection>
      <SubSection id="bestelproces-zoeken-op-zendingnummer" title="Snel zoeken op zendingnummer">
        <P>
          Typ een zendingnummer in het zoekveld boven de bestellingenlijst. Zo zie je in één keer alle
          bestellingen die in die zending zaten. Zijn ze bij de drukker klaar? Vink ze allemaal aan en zet
          de status in één keer op &quot;Te factureren&quot;.
        </P>
      </SubSection>
      <SubSection id="bestelproces-afronden-zending" title="Afronden binnen een zending">
        <P>
          Rond je een bestelling af terwijl er in dezelfde drukker-zending nog andere, nog niet afgeronde
          bestellingen zitten? Dan vraagt beheer of je die meteen ook wilt afronden — zo vergeet je er
          geen.
        </P>
      </SubSection>
      <SubSection id="bestelproces-facturatie" title="Facturatie">
        <P>
          Het factureren zelf, en het verwerken van betaalde facturen, gebeurt buiten dit systeem —
          bijvoorbeeld in je boekhoudpakket. Zodra een factuur is verstuurd en betaald, zet je de
          bestelling zelf op &quot;Betaald en afgerond&quot;.
        </P>
      </SubSection>
    </Chapter>
  );
}
```

- [ ] **Step 2: Wire it into the page**

In `Documentatie.tsx`, add `import { BestelprocesChapter } from './chapters/BestelprocesChapter';` and render `<BestelprocesChapter />` after `<KlantRegistratieChapter />`.

- [ ] **Step 3: Extend the gate test**

Add to the authorized test in `DocumentatieGate.test.tsx`:

```tsx
    expect(document.getElementById('bestelproces-drukker')).not.toBeNull();
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/components/beheer/documentatie`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/documentatie tests/components/beheer/documentatie
git commit -m "feat: add bestelproces chapter to de gebruikershandleiding"
```

---

## Task 5: Chapter 4 — Een kunstwerk aanmaken

**Files:**
- Create: `src/components/beheer/documentatie/chapters/KunstwerkenChapter.tsx`
- Modify: `src/components/beheer/documentatie/Documentatie.tsx`
- Test: extend `tests/components/beheer/documentatie/DocumentatieGate.test.tsx`

**Interfaces:**
- Produces: `<KunstwerkenChapter />`, anchors `kunstwerken`, `kunstwerken-foto`, `kunstwerken-code`, `kunstwerken-formaat`, `kunstwerken-voorbeeld`.

- [ ] **Step 1: Write the chapter**

```tsx
// src/components/beheer/documentatie/chapters/KunstwerkenChapter.tsx
import { Chapter, SubSection, P } from '../DocumentatieBlocks';

export function KunstwerkenChapter() {
  return (
    <Chapter id="kunstwerken" title="4. Een kunstwerk aanmaken">
      <P>Elk product dat een klant kan bestellen, is een &quot;kunstwerk&quot; in beheer.</P>
      <SubSection id="kunstwerken-foto" title="Foto">
        <P>Upload een foto van het kunstwerk. Die mag maximaal 8 MB groot zijn.</P>
      </SubSection>
      <SubSection id="kunstwerken-code" title="Code">
        <P>
          Elk kunstwerk krijgt een unieke code — het artikelnummer waar ook de drukker mee werkt (die heeft
          het originele bestand onder diezelfde code). Een code bestaat uit een prefix en een volgnummer,
          bijvoorbeeld GLA-JAC-00001 voor een kunstwerk van kunstenaar Jack, of GLA-AFR-00007 voor een
          kunstwerk uit de collectie &quot;Afrika&quot;. Kies je een prefix die al bestaat, dan stelt
          beheer automatisch het eerstvolgende nummer voor.
        </P>
        <P>
          Zodra een kunstwerk in een bestelling zit, ligt de code vast — dan kun je &apos;m niet meer
          wijzigen, en kun je het kunstwerk ook niet meer verwijderen.
        </P>
      </SubSection>
      <SubSection id="kunstwerken-formaat" title="Formaat en maten">
        <P>
          Zodra je een foto uploadt, bepaalt beheer automatisch het formaat: Vierkant, Liggend of Staand —
          op basis van de verhouding tussen breedte en hoogte van de foto. Klopt dat niet, dan pas je het
          formaat zelf aan met de keuzerondjes.
        </P>
        <P>
          Het formaat bepaalt welke maten je kunt aanvinken: bij Vierkant zijn alleen vierkante maten te
          kiezen, bij Liggend en Staand alleen niet-vierkante maten, en bij Alle kun je alles kiezen.
        </P>
        <P>
          Vink je geen enkele maat of materiaal aan, dan verschijnt in plaats daarvan een veld &quot;prijs
          per m²&quot; — dat gebruiken we nu voor akoestische stof, maar het werkt voor elk product waarbij
          de klant zelf zijn eigen breedte en hoogte opgeeft.
        </P>
      </SubSection>
      <SubSection id="kunstwerken-voorbeeld" title="Live voorbeeld">
        <P>
          Rechts in het scherm zie je meteen een live voorbeeld van hoe het kunstwerk er op de website
          uitziet, met de prijs die een klant op dat moment zou zien — inclusief eventuele
          kunstenaarsopslag en prijsgroep. Zo controleer je meteen of alles klopt voordat je opslaat.
        </P>
      </SubSection>
    </Chapter>
  );
}
```

- [ ] **Step 2: Wire it into the page** — import and render `<KunstwerkenChapter />` after `<BestelprocesChapter />` in `Documentatie.tsx`.

- [ ] **Step 3: Extend the gate test** — add `expect(document.getElementById('kunstwerken-code')).not.toBeNull();`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/components/beheer/documentatie`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/documentatie tests/components/beheer/documentatie
git commit -m "feat: add kunstwerken chapter to de gebruikershandleiding"
```

---

## Task 6: Chapter 5 — Een kunstenaar aanmaken

**Files:**
- Create: `src/components/beheer/documentatie/chapters/KunstenaarsChapter.tsx`
- Modify: `src/components/beheer/documentatie/Documentatie.tsx`
- Test: extend `tests/components/beheer/documentatie/DocumentatieGate.test.tsx`

**Interfaces:**
- Produces: `<KunstenaarsChapter />`, anchors `kunstenaars`, `kunstenaars-koppeling`, `kunstenaars-opslag`, `kunstenaars-exclusiviteit`.

- [ ] **Step 1: Write the chapter**

```tsx
// src/components/beheer/documentatie/chapters/KunstenaarsChapter.tsx
import { Chapter, SubSection, P } from '../DocumentatieBlocks';

export function KunstenaarsChapter() {
  return (
    <Chapter id="kunstenaars" title="5. Een kunstenaar aanmaken">
      <P>
        Werkt een kunstenaar exclusief met jullie samen, of maak je afspraken over een vaste opslag op de
        prijs? Leg dat vast bij Kunstenaars.
      </P>
      <SubSection id="kunstenaars-koppeling" title="Klant koppelen">
        <P>
          Een kunstenaar koppel je aan klanten op twee manieren, en die staan los van elkaar:
        </P>
        <P>
          1) Is de kunstenaar zelf ook klant, bijvoorbeeld om zijn eigen werk te kunnen bestellen? Koppel
          dat bij die klant zelf, in het veld &quot;Kunstenaar&quot; op het klantscherm.
        </P>
        <P>
          2) Heeft een klant het exclusieve verkooprecht voor deze kunstenaar, bijvoorbeeld een galerie die
          als enige zijn werk mag verkopen? Dat regel je hier, bij de kunstenaar.
        </P>
      </SubSection>
      <SubSection id="kunstenaars-opslag" title="Prijsopslag">
        <P>
          Reserveer hier een vast bedrag dat boven op de basisprijs uit de prijsmatrix komt, voor elk
          kunstwerk van deze kunstenaar. Bijvoorbeeld: basisprijs €100 + opslag €15 = €115. Let op: dit is
          een vast bedrag, geen percentage.
        </P>
      </SubSection>
      <SubSection id="kunstenaars-exclusiviteit" title="Exclusiviteit">
        <P>
          Een kunstenaar kan exclusief werken voor precies twee klanten tegelijk — nooit voor precies één.
          Laat je beide velden leeg, dan mag iedereen kunstwerken van deze kunstenaar bestellen. Vul je ze
          in, dan moet minstens één van de twee de klant zijn die zelf al aan deze kunstenaar gekoppeld is
          (dus de kunstenaar zelf).
        </P>
        <P>
          Gevolg voor andere klanten: zodra een kunstenaar exclusief is, kan geen enkele andere klant nog
          een kunstwerk van die kunstenaar bestellen — dat wordt automatisch geblokkeerd, ook als iemand
          een bestaande bestelling probeert aan te passen.
        </P>
      </SubSection>
    </Chapter>
  );
}
```

- [ ] **Step 2: Wire it into the page** — import and render `<KunstenaarsChapter />` after `<KunstwerkenChapter />`.

- [ ] **Step 3: Extend the gate test** — add `expect(document.getElementById('kunstenaars-exclusiviteit')).not.toBeNull();`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/components/beheer/documentatie`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/documentatie tests/components/beheer/documentatie
git commit -m "feat: add kunstenaars chapter to de gebruikershandleiding"
```

---

## Task 7: Chapter 6 — Prijzen: de prijsmatrix en het prijsmodel

**Files:**
- Create: `src/components/beheer/documentatie/chapters/PrijsmatrixChapter.tsx`
- Modify: `src/components/beheer/documentatie/Documentatie.tsx`
- Test: extend `tests/components/beheer/documentatie/DocumentatieGate.test.tsx`

**Interfaces:**
- Produces: `<PrijsmatrixChapter />`, anchor `prijsmatrix`.

- [ ] **Step 1: Write the chapter**

```tsx
// src/components/beheer/documentatie/chapters/PrijsmatrixChapter.tsx
import { Chapter, P, UL, DocLink } from '../DocumentatieBlocks';

export function PrijsmatrixChapter() {
  return (
    <Chapter id="prijsmatrix" title="6. Prijzen: de prijsmatrix en het prijsmodel">
      <P>De uiteindelijke prijs van een bestelregel wordt in stappen opgebouwd:</P>
      <UL>
        <li>
          <strong>Basisprijs:</strong> beheer zoekt de prijs op die hoort bij de combinatie van maat en
          materiaal, in de prijsmatrix (bedragen zijn exclusief btw).
        </li>
        <li>
          <strong>Kunstenaarsopslag:</strong> werkt de kunstenaar van dit kunstwerk met een vaste opslag
          (zie <DocLink anchor="kunstenaars-opslag">Prijsopslag</DocLink>)? Dan komt dat bedrag er
          automatisch bij. Bijvoorbeeld: €100 + €15 opslag = €115.
        </li>
        <li>
          <strong>Prijsgroep van de klant:</strong> heeft de klant een prijsgroep met een korting of juist
          een opslag in procenten? Dan wordt dat percentage over het bedrag van de vorige stap berekend.
          Bijvoorbeeld: €115 met 10% korting wordt €103,50. Zie{' '}
          <DocLink anchor="stamgegevens-prijsgroepen">Prijsgroepen</DocLink> voor hoe je een prijsgroep
          aanmaakt.
        </li>
        <li>
          <strong>Korting op de hele bestelling:</strong> heb je bij het bewerken van de bestelling een
          extra korting ingevuld (zie <DocLink anchor="bestelproces-bewerken">Een bestelling bewerken</DocLink>
          )? Die trek je er als vast bedrag nog eens vanaf, als allerlaatste stap.
        </li>
      </UL>
      <P>
        Heeft een kunstwerk geen vaste maten, bijvoorbeeld akoestische stof? Dan komt de prijs niet uit de
        matrix, maar uit de prijs per m² die je bij dat kunstwerk instelt (breedte × hoogte × prijs per
        m²). De prijsgroep-stap geldt daar nog steeds op, de kunstenaarsopslag-stap niet.
      </P>
      <P>
        Staat er geen prijs in de matrix voor een gekozen combinatie, of past de gekozen maat niet bij het
        kunstwerk? Dan wordt de prijs &quot;op aanvraag&quot; en moet iemand &apos;m handmatig vaststellen
        bij het bewerken van de bestelling.
      </P>
    </Chapter>
  );
}
```

- [ ] **Step 2: Wire it into the page** — import and render `<PrijsmatrixChapter />` after `<KunstenaarsChapter />`.

- [ ] **Step 3: Extend the gate test** — add `expect(document.getElementById('prijsmatrix')).not.toBeNull();`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/components/beheer/documentatie`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/documentatie tests/components/beheer/documentatie
git commit -m "feat: add prijsmatrix chapter to de gebruikershandleiding"
```

---

## Task 8: Chapter 7 — Overige stamgegevens

**Files:**
- Create: `src/components/beheer/documentatie/chapters/StamgegevensChapter.tsx`
- Modify: `src/components/beheer/documentatie/Documentatie.tsx`
- Test: extend `tests/components/beheer/documentatie/DocumentatieGate.test.tsx`

**Interfaces:**
- Produces: `<StamgegevensChapter />`, anchors `stamgegevens`, `stamgegevens-materiaalsoorten`, `stamgegevens-materialen`, `stamgegevens-maten`, `stamgegevens-segmenten`, `stamgegevens-stijlen`, `stamgegevens-onderwerpen`, `stamgegevens-prijsgroepen`, `stamgegevens-activiteit`.

- [ ] **Step 1: Write the chapter**

```tsx
// src/components/beheer/documentatie/chapters/StamgegevensChapter.tsx
import { Chapter, SubSection, P, DocLink } from '../DocumentatieBlocks';

export function StamgegevensChapter() {
  return (
    <Chapter id="stamgegevens" title="7. Overige stamgegevens">
      <P>
        Deze schermen vul je één keer in en gebruik je daarna overal terug — bij het aanmaken van
        kunstwerken, het filteren op de website, en de prijsopbouw.
      </P>
      <SubSection id="stamgegevens-materiaalsoorten" title="Materiaalsoorten">
        <P>
          De hoofdcategorie van een materiaal, bijvoorbeeld Glas of Acryl. Voeg toe met de knop
          &quot;Toevoegen&quot;.
        </P>
      </SubSection>
      <SubSection id="stamgegevens-materialen" title="Materialen">
        <P>
          Een specifieke uitvoering binnen een materiaalsoort, met een dikte — bijvoorbeeld &quot;6mm Glas
          — Blank helder&quot;. Elk materiaal hoort bij één materiaalsoort.
        </P>
      </SubSection>
      <SubSection id="stamgegevens-maten" title="Maten">
        <P>De vaste breedte×hoogte-combinaties die je bij een kunstwerk kunt aanvinken.</P>
      </SubSection>
      <SubSection id="stamgegevens-segmenten" title="Segmenten">
        <P>
          De doelgroep of toepassing van een kunstwerk, bijvoorbeeld &quot;Hotel&quot; of
          &quot;Kantoor&quot;. Gebruikt als filter op de website.
        </P>
      </SubSection>
      <SubSection id="stamgegevens-stijlen" title="Stijlen">
        <P>De stijl van een kunstwerk, bijvoorbeeld &quot;Modern&quot; of &quot;Klassiek&quot;.</P>
      </SubSection>
      <SubSection id="stamgegevens-onderwerpen" title="Onderwerpen">
        <P>Waar het kunstwerk over gaat, bijvoorbeeld &quot;Natuur&quot; of &quot;Abstract&quot;.</P>
        <P>
          Segmenten, stijlen en onderwerpen kun je ook meteen aanmaken vanuit het kunstwerk-scherm zelf,
          terwijl je een kunstwerk invult. Let op: dat vult dan alleen de Nederlandse omschrijving. De
          vertalingen voor Engels, Duits en Frans moet je later zelf nog toevoegen, hier in dit scherm.
        </P>
      </SubSection>
      <SubSection id="stamgegevens-prijsgroepen" title="Prijsgroepen">
        <P>
          Een groep klanten die dezelfde korting of opslag krijgen. Kies of het een korting of een opslag
          is, en vul het percentage in; dat percentage wordt automatisch toegepast op elke bestelling van
          een klant in die groep — zie{' '}
          <DocLink anchor="prijsmatrix">Prijzen: de prijsmatrix en het prijsmodel</DocLink> voor de
          volledige berekening. Je koppelt een prijsgroep aan een klant in het klantscherm.
        </P>
      </SubSection>
      <SubSection id="stamgegevens-activiteit" title="Activiteit">
        <P>
          Een logboek van belangrijke acties in beheer: wie heeft wat wanneer gedaan (klant goedgekeurd,
          bestelling gewijzigd, wachtwoord uitgegeven, enzovoort). Puur ter inzage, je maakt hier zelf
          niets aan.
        </P>
      </SubSection>
    </Chapter>
  );
}
```

- [ ] **Step 2: Wire it into the page** — import and render `<StamgegevensChapter />` after `<PrijsmatrixChapter />`.

- [ ] **Step 3: Extend the gate test** — add `expect(document.getElementById('stamgegevens-prijsgroepen')).not.toBeNull();`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/components/beheer/documentatie`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/documentatie tests/components/beheer/documentatie
git commit -m "feat: add stamgegevens chapter to de gebruikershandleiding"
```

---

## Task 9: Chapter 8 — Drukkers

**Files:**
- Create: `src/components/beheer/documentatie/chapters/DrukkersChapter.tsx`
- Modify: `src/components/beheer/documentatie/Documentatie.tsx`
- Test: extend `tests/components/beheer/documentatie/DocumentatieGate.test.tsx`

**Interfaces:**
- Produces: `<DrukkersChapter />`, anchors `drukkers`, `drukkers-standaard`.

- [ ] **Step 1: Write the chapter**

```tsx
// src/components/beheer/documentatie/chapters/DrukkersChapter.tsx
import { Chapter, SubSection, P, DocLink } from '../DocumentatieBlocks';

export function DrukkersChapter() {
  return (
    <Chapter id="drukkers" title="8. Drukkers">
      <P>Hier beheer je de drukkers waar je bestellingen naartoe stuurt.</P>
      <SubSection id="drukkers-standaard" title="Standaard-drukker">
        <P>
          Vink &quot;Standaard&quot; aan bij de drukker die je het vaakst gebruikt. Zodra je een bestelling
          naar de drukker stuurt (zie <DocLink anchor="bestelproces-drukker">Naar de drukker sturen</DocLink>
          ), staat deze drukker daar automatisch al geselecteerd — je kunt altijd nog een andere kiezen.
        </P>
      </SubSection>
    </Chapter>
  );
}
```

- [ ] **Step 2: Wire it into the page** — import and render `<DrukkersChapter />` after `<StamgegevensChapter />`.

- [ ] **Step 3: Extend the gate test** — add `expect(document.getElementById('drukkers-standaard')).not.toBeNull();`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/components/beheer/documentatie`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/documentatie tests/components/beheer/documentatie
git commit -m "feat: add drukkers chapter to de gebruikershandleiding"
```

---

## Task 10: Chapter 9 — Glassart and design (bedrijfsgegevens)

**Files:**
- Create: `src/components/beheer/documentatie/chapters/GlassartDesignChapter.tsx`
- Modify: `src/components/beheer/documentatie/Documentatie.tsx`
- Test: extend `tests/components/beheer/documentatie/DocumentatieGate.test.tsx`

**Interfaces:**
- Produces: `<GlassartDesignChapter />`, anchor `glassart-design`.

- [ ] **Step 1: Write the chapter**

```tsx
// src/components/beheer/documentatie/chapters/GlassartDesignChapter.tsx
import { Chapter, P, UL, DocLink } from '../DocumentatieBlocks';

export function GlassartDesignChapter() {
  return (
    <Chapter id="glassart-design" title="9. Glassart and design">
      <P>Hier staan de gegevens van je eigen bedrijf. Ze worden op twee plekken automatisch gebruikt:</P>
      <UL>
        <li>
          Op de Contact-pagina van de website: bezoekadres, e-mailadres, WhatsApp-nummer, openingstijden,
          KvK-nummer en de contactpersonen die je hier invult.
        </li>
        <li>
          In de mail naar de drukker, als vast &quot;factuurvoetje&quot; onderaan: bezoekadres,
          KvK-nummer, btw-nummer en e-mailadres — zie{' '}
          <DocLink anchor="bestelproces-drukker">Naar de drukker sturen</DocLink> voor een voorbeeld.
          Ontbreekt een van die velden, dan kun je geen mail naar de drukker versturen.
        </li>
      </UL>
      <P>IBAN en BIC leg je hier ook vast, als gegevens voor later.</P>
    </Chapter>
  );
}
```

- [ ] **Step 2: Wire it into the page** — import and render `<GlassartDesignChapter />` after `<DrukkersChapter />`.

- [ ] **Step 3: Extend the gate test** — add `expect(document.getElementById('glassart-design')).not.toBeNull();`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/components/beheer/documentatie`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/documentatie tests/components/beheer/documentatie
git commit -m "feat: add glassart-design chapter to de gebruikershandleiding"
```

---

## Task 11: Chapter 10 — Instellingen

**Files:**
- Create: `src/components/beheer/documentatie/chapters/InstellingenChapter.tsx`
- Modify: `src/components/beheer/documentatie/Documentatie.tsx`
- Test: extend `tests/components/beheer/documentatie/DocumentatieGate.test.tsx`

**Interfaces:**
- Produces: `<InstellingenChapter />`, anchor `instellingen`.

- [ ] **Step 1: Write the chapter**

```tsx
// src/components/beheer/documentatie/chapters/InstellingenChapter.tsx
import { Chapter, P } from '../DocumentatieBlocks';

export function InstellingenChapter() {
  return (
    <Chapter id="instellingen" title="10. Instellingen">
      <P>Algemene instellingen die voor de hele webshop gelden.</P>
      <P>
        <strong>Minimale afname</strong> — het aantal stuks dat een klant minimaal van één kunstwerk moet
        bestellen. Dit geldt standaard voor alle klanten. Wil je voor één specifieke klant een andere
        minimale afname? Vul dat dan in bij die klant zelf, in het klantscherm — die waarde overschrijft
        dan deze algemene instelling, alleen voor die klant.
      </P>
    </Chapter>
  );
}
```

- [ ] **Step 2: Wire it into the page** — import and render `<InstellingenChapter />` after `<GlassartDesignChapter />`, as the last chapter.

- [ ] **Step 3: Extend the gate test** — add `expect(document.getElementById('instellingen')).not.toBeNull();`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/components/beheer/documentatie`
Expected: PASS — all 10 chapter anchors are now asserted in the gate test.

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/documentatie tests/components/beheer/documentatie
git commit -m "feat: add instellingen chapter, completing de gebruikershandleiding content"
```

---

## Task 12: BeheerShell — top-right "?" per section

**Files:**
- Modify: `src/components/beheer/BeheerShell.tsx`
- Modify: `src/components/beheer/BestellingenSection.tsx`
- Modify: `src/components/beheer/PrijsmatrixSection.tsx`
- Modify: `tests/components/beheer/BeheerShell.test.tsx`
- Modify: `tests/components/beheer/BestellingenSection.test.tsx`
- Modify: `tests/components/beheer/PrijsmatrixSection.test.tsx`

**Interfaces:**
- Consumes: `HelpLink` (Task 1), `BeheerSection` type (`./BeheerNav`, already imported in `BeheerShell.tsx`).

This task adds ONE `HelpLink`, top-right, in the shared `GlassPanel` that wraps whichever section is active — instead of one icon per section component, since no section component currently renders its own header. It also removes the two now-redundant section-local `HelpHint` icons (`BestellingenSection`, `PrijsmatrixSection`), since the new shared icon already covers those sections.

- [ ] **Step 1: Add the anchor map and the icon in `BeheerShell.tsx`**

Add near the top of the file, after the imports:

```tsx
import { HelpLink } from '@/components/HelpLink';
```

Add this constant above the `BeheerShell` function (after the existing `interface`/`type` declarations, e.g. after `PrijsmatrixRegel`):

```tsx
const SECTION_ANCHORS: Record<BeheerSection, string> = {
  klanten: 'klant-registratie',
  bestellingen: 'bestelproces',
  materiaalsoorten: 'stamgegevens-materiaalsoorten',
  materialen: 'stamgegevens-materialen',
  maten: 'stamgegevens-maten',
  segmenten: 'stamgegevens-segmenten',
  stijlen: 'stamgegevens-stijlen',
  onderwerpen: 'stamgegevens-onderwerpen',
  kunstwerken: 'kunstwerken',
  kunstenaars: 'kunstenaars',
  prijsgroepen: 'stamgegevens-prijsgroepen',
  prijsmatrix: 'prijsmatrix',
  drukkers: 'drukkers',
  activiteit: 'stamgegevens-activiteit',
  glassartDesign: 'glassart-design',
  instellingen: 'instellingen',
};
```

Change the wrapping panel (currently `src/components/beheer/BeheerShell.tsx:292`):

```tsx
      <GlassPanel className="w-full !max-w-none">
        {activeSection === 'klanten' ? (
```

to:

```tsx
      <GlassPanel className="relative w-full !max-w-none">
        <HelpLink
          anchor={SECTION_ANCHORS[activeSection]}
          label="Open het hoofdstuk over dit onderdeel in de gebruikershandleiding"
          testId="beheer-section-help"
          className="absolute right-4 top-4 sm:right-6 sm:top-6"
        />
        {activeSection === 'klanten' ? (
```

- [ ] **Step 2: Remove the now-redundant `HelpHint` in `BestellingenSection.tsx`**

Delete this block (`src/components/beheer/BestellingenSection.tsx:375-377`):

```tsx
      <div className="mb-3 flex items-center justify-end">
        <HelpHint text={t('bestellingenHelp')} testId="bestellingen-help" />
      </div>
```

Remove the now-unused import: `import { HelpHint } from '@/components/HelpHint';` at `src/components/beheer/BestellingenSection.tsx:6`.

- [ ] **Step 3: Remove the now-redundant `HelpHint` in `PrijsmatrixSection.tsx`**

Change (`src/components/beheer/PrijsmatrixSection.tsx:160-163`):

```tsx
      <p className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wide text-white/60">
        {t('prijsmatrixTitle')}
        <HelpHint text={t('prijsmatrixHelp')} testId="prijsmatrix-help" />
      </p>
```

to:

```tsx
      <p className="mb-3 text-xs uppercase tracking-wide text-white/60">{t('prijsmatrixTitle')}</p>
```

Remove the now-unused import: `import { HelpHint } from '@/components/HelpHint';` at `src/components/beheer/PrijsmatrixSection.tsx:5`.

- [ ] **Step 4: Update `BeheerShell.test.tsx`**

Add a new test (near the existing section-switching tests, e.g. after the `fireEvent.click(screen.getByTestId('beheer-nav-instellingen'))` test around line 445):

```tsx
  it('shows a section help link that points at the anchor for the active section', () => {
    renderShell();
    expect(screen.getByTestId('beheer-section-help')).toHaveAttribute(
      'href',
      '/nl/beheer/documentatie#klant-registratie'
    );

    fireEvent.click(screen.getByTestId('beheer-nav-instellingen'));
    expect(screen.getByTestId('beheer-section-help')).toHaveAttribute(
      'href',
      '/nl/beheer/documentatie#instellingen'
    );
  });
```

(`renderShell()` is already defined at `tests/components/beheer/BeheerShell.test.tsx:152` — reuse it as-is. `klanten` is the default `activeSection`, matching the existing tests' assumption in that file.)

- [ ] **Step 5: Remove the obsolete `HelpHint` tests**

In `tests/components/beheer/BestellingenSection.test.tsx`, delete this test (around line 455-461):

```tsx
  it('shows a help popover explaining the drukker flow', () => {
    renderSection();
    expect(screen.queryByTestId('bestellingen-help-popover')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('bestellingen-help'));
    expect(screen.getByTestId('bestellingen-help-popover')).toHaveTextContent('drukker');
  });
```

In `tests/components/beheer/PrijsmatrixSection.test.tsx`, delete this test (around line 225-231):

```tsx
  it('shows a help popover explaining how the price is calculated', () => {
    renderSection();
    expect(screen.queryByTestId('prijsmatrix-help-popover')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('prijsmatrix-help'));
    expect(screen.getByTestId('prijsmatrix-help-popover')).toHaveTextContent('basisprijs');
  });
```

- [ ] **Step 6: Run the affected tests**

Run: `npx vitest run tests/components/beheer/BeheerShell.test.tsx tests/components/beheer/BestellingenSection.test.tsx tests/components/beheer/PrijsmatrixSection.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/beheer/BeheerShell.tsx src/components/beheer/BestellingenSection.tsx src/components/beheer/PrijsmatrixSection.tsx tests/components/beheer/BeheerShell.test.tsx tests/components/beheer/BestellingenSection.test.tsx tests/components/beheer/PrijsmatrixSection.test.tsx
git commit -m "feat: add per-section help link to beheer, drop redundant section-local HelpHints"
```

---

## Task 13: General "?" in the beheer header

**Files:**
- Modify: `src/app/[locale]/beheer/page.tsx`

**Interfaces:**
- Consumes: `HelpLink` (Task 1).

- [ ] **Step 1: Add the icon next to the "naar website" link**

Change (`src/app/[locale]/beheer/page.tsx:32-39`):

```tsx
        <Link
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-white/60 hover:text-white sm:right-6"
        >
          {t('naarWebsiteLink')}
        </Link>
```

to:

```tsx
        <div className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-4 sm:right-6">
          <HelpLink label="Open de gebruikershandleiding" testId="beheer-help" />
          <Link href="/" target="_blank" rel="noopener noreferrer" className="text-sm text-white/60 hover:text-white">
            {t('naarWebsiteLink')}
          </Link>
        </div>
```

Add the import at the top of the file:

```tsx
import { HelpLink } from '@/components/HelpLink';
```

- [ ] **Step 2: Manually verify**

Run: `npm run dev`, open `http://localhost:3000/nl/beheer`, log in, and confirm a "?" now sits to the left of "naar website" top-right in the header, opening `/nl/beheer/documentatie` in a new tab.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/beheer/page.tsx"
git commit -m "feat: add general help link to the beheer header"
```

---

## Task 14: `KlantModal` — swap HelpHint for HelpLink, reposition top-right

**Files:**
- Modify: `src/components/beheer/KlantModal.tsx`
- Modify: `tests/components/beheer/KlantModal.test.tsx`

- [ ] **Step 1: Swap the import**

In `src/components/beheer/KlantModal.tsx:8`, change:

```tsx
import { HelpHint } from '@/components/HelpHint';
```

to:

```tsx
import { HelpLink } from '@/components/HelpLink';
```

- [ ] **Step 2: Update the modal title**

Change (`src/components/beheer/KlantModal.tsx:267-272`):

```tsx
        title={
          <span className="inline-flex items-center gap-2">
            {t('klantenModalTitel')}
            <HelpHint text={t('klantenHelp')} testId="klant-modal-help" />
          </span>
        }
```

to:

```tsx
        title={
          <span className="flex w-full items-center justify-between gap-2">
            {t('klantenModalTitel')}
            <HelpLink
              anchor="klant-registratie-goedkeuren"
              label="Open het hoofdstuk over een klant goedkeuren"
              testId="klant-modal-help"
            />
          </span>
        }
```

- [ ] **Step 3: Update the test**

In `tests/components/beheer/KlantModal.test.tsx:593-599`, change:

```tsx
  it('shows a help popover with an explanation of the screen', () => {
    renderModal(KLANT);
    expect(screen.queryByTestId('klant-modal-help-popover')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('klant-modal-help'));
    expect(screen.getByTestId('klant-modal-help-popover')).toHaveTextContent('prijsgroep');
  });
```

to:

```tsx
  it('links to the goedkeuren chapter of the gebruikershandleiding', () => {
    renderModal(KLANT);
    expect(screen.getByTestId('klant-modal-help')).toHaveAttribute(
      'href',
      '/nl/beheer/documentatie#klant-registratie-goedkeuren'
    );
    expect(screen.getByTestId('klant-modal-help')).toHaveAttribute('target', '_blank');
  });
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/components/beheer/KlantModal.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/KlantModal.tsx tests/components/beheer/KlantModal.test.tsx
git commit -m "feat: link KlantModal help icon to de gebruikershandleiding"
```

---

## Task 15: `KunstwerkenSection` modal — swap HelpHint for HelpLink

**Files:**
- Modify: `src/components/beheer/KunstwerkenSection.tsx`
- Modify: `tests/components/beheer/KunstwerkenSection.test.tsx`

- [ ] **Step 1: Swap the import**

In `src/components/beheer/KunstwerkenSection.tsx:7`, change `import { HelpHint } from '@/components/HelpHint';` to `import { HelpLink } from '@/components/HelpLink';`.

- [ ] **Step 2: Update the modal title**

Change (`src/components/beheer/KunstwerkenSection.tsx:666-671`):

```tsx
        title={
          <span className="inline-flex items-center gap-2">
            {t('kunstwerkenModalTitel')}
            <HelpHint text={t('kunstwerkenHelp')} testId="kunstwerk-modal-help" />
          </span>
        }
```

to:

```tsx
        title={
          <span className="flex w-full items-center justify-between gap-2">
            {t('kunstwerkenModalTitel')}
            <HelpLink anchor="kunstwerken-code" label="Open het hoofdstuk over kunstwerken" testId="kunstwerk-modal-help" />
          </span>
        }
```

- [ ] **Step 3: Update the test**

In `tests/components/beheer/KunstwerkenSection.test.tsx:1101-1107`, change:

```tsx
  it('shows a help popover explaining formaat and prijs-per-m²', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));

    fireEvent.click(screen.getByTestId('kunstwerk-modal-help'));
    expect(screen.getByTestId('kunstwerk-modal-help-popover')).toHaveTextContent('Formaat');
  });
```

to:

```tsx
  it('links to the kunstwerken-code chapter of the gebruikershandleiding', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));

    expect(screen.getByTestId('kunstwerk-modal-help')).toHaveAttribute(
      'href',
      '/nl/beheer/documentatie#kunstwerken-code'
    );
  });
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/KunstwerkenSection.tsx tests/components/beheer/KunstwerkenSection.test.tsx
git commit -m "feat: link KunstwerkenSection modal help icon to de gebruikershandleiding"
```

---

## Task 16: `KunstenaarsSection` — swap all 3 HelpHint usages for HelpLink

**Files:**
- Modify: `src/components/beheer/KunstenaarsSection.tsx`
- Modify: `tests/components/beheer/KunstenaarsSection.test.tsx`

- [ ] **Step 1: Swap the import**

In `src/components/beheer/KunstenaarsSection.tsx:8`, change `import { HelpHint } from '@/components/HelpHint';` to `import { HelpLink } from '@/components/HelpLink';`.

- [ ] **Step 2: Update the modal title (top-right)**

Change (`src/components/beheer/KunstenaarsSection.tsx:388-393`):

```tsx
        title={
          <span className="inline-flex items-center gap-2">
            {t('kunstenaarsModalTitel')}
            <HelpHint text={t('kunstenaarsHelp')} testId="kunstenaar-modal-help" />
          </span>
        }
```

to:

```tsx
        title={
          <span className="flex w-full items-center justify-between gap-2">
            {t('kunstenaarsModalTitel')}
            <HelpLink
              anchor="kunstenaars-exclusiviteit"
              label="Open het hoofdstuk over kunstenaars"
              testId="kunstenaar-modal-help"
            />
          </span>
        }
```

- [ ] **Step 3: Update the field-level Prijsopslag hint (stays inline)**

Change (`src/components/beheer/KunstenaarsSection.tsx:517-529`, the relevant line is the `<HelpHint>` call):

```tsx
            <HelpHint text={t('kunstenaarsHelpOpslag')} size="sm" testId="kunstenaar-modal-help-opslag" />
```

to:

```tsx
            <HelpLink
              anchor="kunstenaars-opslag"
              label="Open het hoofdstuk over de prijsopslag"
              size="sm"
              testId="kunstenaar-modal-help-opslag"
            />
```

- [ ] **Step 4: Update the field-level Exclusiviteit hint (stays inline)**

Change (`src/components/beheer/KunstenaarsSection.tsx:531-535`, the relevant line is the `<HelpHint>` call):

```tsx
      <HelpHint text={t('kunstenaarsHelpExclusiviteit')} size="sm" testId="kunstenaar-modal-help-exclusiviteit" />
```

to:

```tsx
      <HelpLink
        anchor="kunstenaars-exclusiviteit"
        label="Open het hoofdstuk over exclusiviteit"
        size="sm"
        testId="kunstenaar-modal-help-exclusiviteit"
      />
```

- [ ] **Step 5: Update the tests**

In `tests/components/beheer/KunstenaarsSection.test.tsx:741-763`, change:

```tsx
  it('shows a help popover with an explanation of the screen', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstenaars-add'));

    fireEvent.click(screen.getByTestId('kunstenaar-modal-help'));
    expect(screen.getByTestId('kunstenaar-modal-help-popover')).toHaveTextContent('prijsafspraken');
  });

  it('shows a help popover next to the Opslag field', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstenaars-add'));

    fireEvent.click(screen.getByTestId('kunstenaar-modal-help-opslag'));
    expect(screen.getByTestId('kunstenaar-modal-help-opslag-popover')).toHaveTextContent('prijsmatrix');
  });

  it('shows a help popover next to the exclusiviteit fields', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstenaars-add'));

    fireEvent.click(screen.getByTestId('kunstenaar-modal-help-exclusiviteit'));
    expect(screen.getByTestId('kunstenaar-modal-help-exclusiviteit-popover')).toHaveTextContent('twee klanten');
  });
});
```

to:

```tsx
  it('links the modal title help icon to the kunstenaars chapter', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstenaars-add'));

    expect(screen.getByTestId('kunstenaar-modal-help')).toHaveAttribute(
      'href',
      '/nl/beheer/documentatie#kunstenaars-exclusiviteit'
    );
  });

  it('links the Opslag field help icon to the prijsopslag sub-chapter', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstenaars-add'));

    expect(screen.getByTestId('kunstenaar-modal-help-opslag')).toHaveAttribute(
      'href',
      '/nl/beheer/documentatie#kunstenaars-opslag'
    );
  });

  it('links the exclusiviteit field help icon to the exclusiviteit sub-chapter', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstenaars-add'));

    expect(screen.getByTestId('kunstenaar-modal-help-exclusiviteit')).toHaveAttribute(
      'href',
      '/nl/beheer/documentatie#kunstenaars-exclusiviteit'
    );
  });
});
```

- [ ] **Step 6: Run the test**

Run: `npx vitest run tests/components/beheer/KunstenaarsSection.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/beheer/KunstenaarsSection.tsx tests/components/beheer/KunstenaarsSection.test.tsx
git commit -m "feat: link KunstenaarsSection help icons to de gebruikershandleiding"
```

---

## Task 17: `PrijsgroepenSection` modal — swap HelpHint for HelpLink

**Files:**
- Modify: `src/components/beheer/PrijsgroepenSection.tsx`
- Modify: `tests/components/beheer/PrijsgroepenSection.test.tsx`

- [ ] **Step 1: Swap the import**

In `src/components/beheer/PrijsgroepenSection.tsx:7`, change `import { HelpHint } from '@/components/HelpHint';` to `import { HelpLink } from '@/components/HelpLink';`.

- [ ] **Step 2: Update the modal title**

Change (`src/components/beheer/PrijsgroepenSection.tsx:154-159`):

```tsx
        title={
          <span className="inline-flex items-center gap-2">
            {t('prijsgroepenModalTitel')}
            <HelpHint text={t('prijsgroepenHelp')} testId="prijsgroep-modal-help" />
          </span>
        }
```

to:

```tsx
        title={
          <span className="flex w-full items-center justify-between gap-2">
            {t('prijsgroepenModalTitel')}
            <HelpLink
              anchor="stamgegevens-prijsgroepen"
              label="Open het hoofdstuk over prijsgroepen"
              testId="prijsgroep-modal-help"
            />
          </span>
        }
```

- [ ] **Step 3: Update the test**

In `tests/components/beheer/PrijsgroepenSection.test.tsx:191-197`, change:

```tsx
  it('shows a help popover explaining that the percentage is applied automatically', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('prijsgroepen-add'));

    fireEvent.click(screen.getByTestId('prijsgroep-modal-help'));
    expect(screen.getByTestId('prijsgroep-modal-help-popover')).toHaveTextContent('automatisch toegepast');
  });
});
```

to:

```tsx
  it('links to the prijsgroepen chapter of the gebruikershandleiding', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('prijsgroepen-add'));

    expect(screen.getByTestId('prijsgroep-modal-help')).toHaveAttribute(
      'href',
      '/nl/beheer/documentatie#stamgegevens-prijsgroepen'
    );
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/components/beheer/PrijsgroepenSection.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/PrijsgroepenSection.tsx tests/components/beheer/PrijsgroepenSection.test.tsx
git commit -m "feat: link PrijsgroepenSection modal help icon to de gebruikershandleiding"
```

---

## Task 18: `BestellingModal` — add a new HelpLink

**Files:**
- Modify: `src/components/beheer/BestellingModal.tsx`
- Modify: `tests/components/beheer/BestellingModal.test.tsx`

`BestellingModal` never had a `HelpHint`; this adds a new `HelpLink`.

- [ ] **Step 1: Add the import**

In `src/components/beheer/BestellingModal.tsx`, add near the other imports (after `import { Modal } from '@/components/Modal';` on line 5):

```tsx
import { HelpLink } from '@/components/HelpLink';
```

- [ ] **Step 2: Update the modal title**

Change (`src/components/beheer/BestellingModal.tsx:419-424`):

```tsx
    <Modal
      isOpen={bestelling !== null}
      onClose={onClose}
      closeLabel={t('modalClose')}
      title={t('bestellingenModalTitel')}
      subtitle={
```

to:

```tsx
    <Modal
      isOpen={bestelling !== null}
      onClose={onClose}
      closeLabel={t('modalClose')}
      title={
        <span className="flex w-full items-center justify-between gap-2">
          {t('bestellingenModalTitel')}
          <HelpLink
            anchor="bestelproces-bewerken"
            label="Open het hoofdstuk over een bestelling bewerken"
            testId="bestelling-modal-help"
          />
        </span>
      }
      subtitle={
```

- [ ] **Step 3: Add a test**

In `tests/components/beheer/BestellingModal.test.tsx`, add a new test near the other modal-rendering tests (find an existing test that opens the modal for a given `bestelling` fixture and copy its render setup):

```tsx
  it('links the modal title help icon to the bestelproces-bewerken chapter', () => {
    renderModal(BESTELLING);
    expect(screen.getByTestId('bestelling-modal-help')).toHaveAttribute(
      'href',
      '/nl/beheer/documentatie#bestelproces-bewerken'
    );
  });
```

(`renderModal` and the `BESTELLING` fixture are already defined at the top of `tests/components/beheer/BestellingModal.test.tsx:80,96` — reuse them as-is, place this test inside the top-level `describe('BestellingModal', ...)` block starting at line 134.)

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/BestellingModal.tsx tests/components/beheer/BestellingModal.test.tsx
git commit -m "feat: add help link to BestellingModal"
```

---

## Task 19: `DrukkerModal` — add a new HelpLink

**Files:**
- Modify: `src/components/beheer/DrukkerModal.tsx`
- Modify: `tests/components/beheer/DrukkerModal.test.tsx`

`DrukkerModal` never had a `HelpHint`; this adds a new `HelpLink`.

- [ ] **Step 1: Add the import**

In `src/components/beheer/DrukkerModal.tsx`, add near the other imports (after `import { Modal } from '@/components/Modal';` on line 5):

```tsx
import { HelpLink } from '@/components/HelpLink';
```

- [ ] **Step 2: Update the modal title**

Change (`src/components/beheer/DrukkerModal.tsx:163-168`):

```tsx
    <Modal
      isOpen={state !== null}
      onClose={onClose}
      closeLabel={t('modalClose')}
      title={t('drukkersModalTitel')}
      subtitle={
```

to:

```tsx
    <Modal
      isOpen={state !== null}
      onClose={onClose}
      closeLabel={t('modalClose')}
      title={
        <span className="flex w-full items-center justify-between gap-2">
          {t('drukkersModalTitel')}
          <HelpLink anchor="drukkers-standaard" label="Open het hoofdstuk over drukkers" testId="drukker-modal-help" />
        </span>
      }
      subtitle={
```

- [ ] **Step 3: Add a test**

In `tests/components/beheer/DrukkerModal.test.tsx`, add a new test near the other modal-rendering tests, matching that file's existing render helper (open the add or edit modal, then assert):

```tsx
  it('links the modal title help icon to the drukkers-standaard chapter', () => {
    renderModal({ mode: 'add' });
    expect(screen.getByTestId('drukker-modal-help')).toHaveAttribute(
      'href',
      '/nl/beheer/documentatie#drukkers-standaard'
    );
  });
```

(`renderModal` is already defined at `tests/components/beheer/DrukkerModal.test.tsx:33`, taking a `{ mode: 'add' }` / `{ mode: 'edit'; drukker }` / `null` state — reuse it as-is.)

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/components/beheer/DrukkerModal.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/DrukkerModal.tsx tests/components/beheer/DrukkerModal.test.tsx
git commit -m "feat: add help link to DrukkerModal"
```

---

## Task 20: Delete `HelpHint`, remove unused i18n keys, run the full suite

**Files:**
- Delete: `src/components/HelpHint.tsx`
- Delete: `tests/components/HelpHint.test.tsx`
- Modify: `messages/nl.json`

**Interfaces:**
- Consumes: nothing — this is cleanup after Tasks 12-19 have removed every `HelpHint` call site.

- [ ] **Step 1: Confirm no remaining usages**

Run: `grep -rn "HelpHint" src tests` (PowerShell: `Select-String -Path src\**\*.tsx,tests\**\*.tsx -Pattern HelpHint`)
Expected: no matches (Tasks 12-19 already converted every call site).

- [ ] **Step 2: Delete the component and its test**

```bash
git rm src/components/HelpHint.tsx tests/components/HelpHint.test.tsx
```

- [ ] **Step 3: Remove the unused i18n keys from `messages/nl.json`**

Remove these keys (their content is now in the manual chapters — see the design spec's content-source table for which chapter each maps to): `klantenHelp`, `bestellingenHelp`, `kunstwerkenHelp`, `kunstenaarsHelp`, `kunstenaarsHelpOpslag`, `kunstenaarsHelpExclusiviteit`, `prijsgroepenHelp`, `prijsmatrixHelp`.

Do **not** remove `klantenWachtwoordUitleg` or `bestellingenAfrondenUitleg` — those are plain always-visible UI copy in `KlantWachtwoordSectie.tsx`/`AfrondenBevestigingDialog.tsx`, not popover help, and are untouched by this plan (their content is additionally reflected in the manual, but the UI strings themselves stay).

Do not remove `prijsmatrixHint` — it's a different, still-used static hint (not one of the 8 `HelpHint` sites), see the design spec.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS, with no reference to `HelpHint` or the removed i18n keys causing failures.

- [ ] **Step 5: Run the linter**

Run: `npm run lint`
Expected: no errors (in particular, no unused-import warnings for `HelpHint`).

- [ ] **Step 6: Commit**

```bash
git add -u
git commit -m "chore: remove HelpHint and its superseded help texts, now replaced by de gebruikershandleiding"
```

---

## Final manual verification (after all tasks)

- [ ] Run `npm run dev`, log into `/nl/beheer`, and click through every section's top-right "?" and every detail-modal's "?" (kunstwerk, kunstenaar, bestelling, klant, drukker) to confirm each opens `/nl/beheer/documentatie` in a new tab at the right anchor.
- [ ] On `/nl/beheer/documentatie`, click every sidebar link (top-level and sub) and confirm it scrolls to the right chapter.
- [ ] Confirm `/nl/beheer/documentatie` shows the "unauthorized" panel when opened in a private/incognito window (no session cookie).
