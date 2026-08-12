import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { Documentatie } from '@/components/beheer/documentatie/Documentatie';
import { DocumentatieSidebar } from '@/components/beheer/documentatie/DocumentatieSidebar';
import messages from '../../../../messages/nl.json';

/**
 * Regression guard: every anchor that links into the gebruikershandleiding — the sidebar's
 * own #hrefs, and every `anchor="..."` / SECTION_ANCHORS value scattered across the beheer
 * UI (BeheerShell, KlantModal, KunstwerkenSection, KunstenaarsSection, BestellingModal,
 * DrukkerModal, ZendingBekijkenModal) — must point at an id that actually exists in the
 * rendered manual. A future
 * chapter rename would otherwise silently break these deep links.
 */

// Anchors used outside the manual itself, hardcoded from grepping each file below for
// `anchor="..."` and `SECTION_ANCHORS`:
// - src/components/beheer/BeheerShell.tsx (SECTION_ANCHORS)
// - src/app/[locale]/beheer/page.tsx (general help link has no anchor — links to the manual root)
// - src/components/beheer/KlantModal.tsx
// - src/components/beheer/KunstwerkenSection.tsx
// - src/components/beheer/KunstenaarsSection.tsx
// - src/components/beheer/BestellingModal.tsx
// - src/components/beheer/DrukkerModal.tsx
// - src/components/beheer/ZendingBekijkenModal.tsx
const EXTERNAL_ANCHORS = [
  // BeheerShell.tsx SECTION_ANCHORS
  'klant-registratie',
  'bestelproces',
  'stamgegevens-materiaalsoorten',
  'stamgegevens-materialen',
  'stamgegevens-maten',
  'stamgegevens-segmenten',
  'stamgegevens-stijlen',
  'stamgegevens-onderwerpen',
  'kunstwerken',
  'kunstenaars',
  'stamgegevens-prijsgroepen',
  'prijsmatrix',
  'drukkers',
  'stamgegevens-activiteit',
  'glassart-design',
  'instellingen',
  // KlantModal.tsx
  'klant-registratie-goedkeuren',
  // KunstwerkenSection.tsx
  'kunstwerken-code',
  // KunstenaarsSection.tsx
  'kunstenaars-opslag',
  'kunstenaars-exclusiviteit',
  // BestellingModal.tsx
  'bestelproces-bewerken',
  // DrukkerModal.tsx
  'drukkers-standaard',
  // ZendingBekijkenModal.tsx
  'drukkers-zending-bekijken',
];

function renderedIds() {
  const { container } = render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <Documentatie />
    </NextIntlClientProvider>
  );
  const ids = new Set<string>();
  container.querySelectorAll('[id]').forEach((el) => {
    if (el.id) ids.add(el.id);
  });
  return ids;
}

describe('documentatie anchor integrity', () => {
  it('every sidebar href points at an id that exists in the rendered manual', () => {
    const ids = renderedIds();
    const { container } = render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <DocumentatieSidebar />
      </NextIntlClientProvider>
    );
    const hrefs = Array.from(container.querySelectorAll('a[href^="#"]')).map(
      (a) => a.getAttribute('href')!.slice(1)
    );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(ids.has(href), `sidebar href "#${href}" has no matching id in the manual`).toBe(true);
    }
  });

  it('every anchor referenced outside the manual points at an id that exists in the rendered manual', () => {
    const ids = renderedIds();
    expect(EXTERNAL_ANCHORS.length).toBeGreaterThan(0);
    for (const anchor of EXTERNAL_ANCHORS) {
      expect(ids.has(anchor), `anchor "${anchor}" has no matching id in the manual`).toBe(true);
    }
  });
});
