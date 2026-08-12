# Verzonden zending bekijken als popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw-mail-text accordion in `DrukkerModal`'s "Verzonden mails" list with a read-only popup, in the visual style of the existing Bestelgegevens modal, that shows every bestelling in a zending with its productregels and totalen — no edit or status controls.

**Architecture:** A new presentational component `ZendingBekijkenModal` renders one card per bestelling in a zending (looked up by bestelnr in the `bestellingen` list `DrukkerModal` already receives), reusing the existing `berekenBestellingTotalen`/`resolveBtwPercentage`/`formatCurrency` helpers and several already-existing `beheer` translation keys that `BestellingModal`/`AccountOrderModal` also use. `DrukkerModal` swaps its inline expand/collapse state for a "which zending is open in the popup" state, and gains six new reference-data props that are threaded down from `BeheerShell` through `DrukkersSection` (both already hold this data for `BestellingenSection`).

**Tech Stack:** Next.js 14 (App Router), TypeScript, React, next-intl, Tailwind, Vitest + Testing Library.

## Global Constraints

- Design doc: [`docs/superpowers/specs/2026-08-12-drukker-zending-bekijken-popup-design.md`](../specs/2026-08-12-drukker-zending-bekijken-popup-design.md) — read this first for the *why* behind every decision below.
- One popup per zending, with **one card per bestelling** inside it (not one combined regel-list). Each card shows its own totaal/korting/btw/totaal-incl.-btw.
- **No statusbadge, no statushistorie, no edit/verwijder/status-buttons anywhere in the new modal.** Only a close button (the `Modal` component's built-in one — do not pass `footerActions`).
- `zending.bestellingIds` actually contains **bestelnummers**, not database ids — match against `Bestelling.bestelnr`, exactly like the existing `afgerondCounts` helper in `DrukkerModal.tsx` already does.
- A bestelnummer from the zending with no matching entry in `bestellingen` is skipped, not shown as an error. If **no** bestelnummer matches, show the `drukkersZendingModalGeenBestellingen` fallback message instead of an empty body.
- All new translation keys go in `messages/nl.json` only — this feature lives entirely in beheer, which is Dutch-only. Do not touch `en.json`/`de.json`/`fr.json`.
- Reuse existing `beheer` translation keys for regel/totalen labels (`bestellingenModalLabelCode`, `bestellingenModalLabelMateriaal`, `bestellingenModalLabelMaat`, `bestellingenModalTotalLabel`, `bestellingenModalKortingLabel`, `bestellingenModalBtwLabel`, `bestellingenModalTotaalInclLabel`, `bestellingenModalTotalIncomplete`, `bestellingenModalPrijsOpAanvraag`, `bestellingenRegelOnbekend`) — do not duplicate them under new names.
- `zending.body`/`zending.onderwerp` stay in the `DrukkerZending` type and API response (still used to send the mail) — only their rendering as raw text in `DrukkerModal` is removed.
- Every gebruikershandleiding change (new `HelpLink`/anchor) must also update `tests/components/beheer/documentatie/anchorIntegrity.test.tsx`'s `EXTERNAL_ANCHORS` list and `DocumentatieSidebar.tsx`'s TOC — both are regression guards that do not auto-discover new anchors.
- No database or API changes. All data for the popup comes from the `bestellingen` prop `DrukkerModal` already receives.

---

### Task 1: `ZendingBekijkenModal` component

**Files:**
- Create: `src/components/beheer/ZendingBekijkenModal.tsx`
- Test: `tests/components/beheer/ZendingBekijkenModal.test.tsx`
- Modify: `messages/nl.json` (two new keys)
- Modify: `src/components/beheer/documentatie/chapters/DrukkersChapter.tsx` (new subsection)
- Modify: `src/components/beheer/documentatie/DocumentatieSidebar.tsx` (TOC entry for the new subsection)
- Modify: `tests/components/beheer/documentatie/anchorIntegrity.test.tsx` (register the new anchor)

**Interfaces:**
- Produces: `ZendingBekijkenModal(props: ZendingBekijkenModalProps)` where
  ```ts
  interface ZendingBekijkenModalProps {
    zending: DrukkerZending | null;
    bestellingen: Bestelling[] | null;
    kunstwerken: Kunstwerk[] | null;
    materialen: Materiaal[] | null;
    maten: Maat[] | null;
    materiaalsoorten: Materiaalsoort[] | null;
    klanten: Klant[] | null;
    btwTarieven: BtwTarieven | null;
    onClose: () => void;
  }
  ```
  (`DrukkerZending` from `@/lib/useDrukkerZendingen`, `Bestelling` from `./BestellingenSection`, `Kunstwerk`/`Materiaal`/`Maat`/`Materiaalsoort` from `./materiaalTypes`, `Klant` from `./KlantenSection`, `BtwTarieven` from `./btwTarievenTypes`.) This is consumed by Task 2.

- [ ] **Step 1: Write the failing test file**

Create `tests/components/beheer/ZendingBekijkenModal.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ZendingBekijkenModal } from '@/components/beheer/ZendingBekijkenModal';
import type { DrukkerZending } from '@/lib/useDrukkerZendingen';
import type { Bestelling } from '@/components/beheer/BestellingenSection';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort } from '@/components/beheer/materiaalTypes';
import type { Klant } from '@/components/beheer/KlantenSection';
import type { BtwTarieven } from '@/components/beheer/btwTarievenTypes';
import messages from '../../../messages/nl.json';

const KUNSTWERKEN: Kunstwerk[] = [
  {
    id: 'kw-1',
    foto: 'https://example.com/kw-1.jpg',
    code: 'Hotel paneel',
    kunstenaarnr: null,
    segmentIds: [],
    materiaalIds: ['mat-1'],
    maatIds: ['maat-1'],
    omschrijvingNl: 'Hotel paneel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
];
const MATERIALEN: Materiaal[] = [
  {
    id: 'mat-1',
    materiaalsoortId: 'soort-1',
    materiaaldikte: 4,
    omschrijvingNl: 'Extra diepte en stevigheid.',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
];
const MATEN: Maat[] = [{ id: 'maat-1', breedte: 40, hoogte: 60 }];
const MATERIAALSOORTEN: Materiaalsoort[] = [
  { id: 'soort-1', omschrijvingNl: 'Veiligheidsglas', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
];
const KLANTEN: Klant[] = [
  {
    id: 'uid-1',
    klantnr: 'KN-1',
    companyName: 'Testbedrijf BV',
    kvk: '12345678',
    contactPerson: 'Jan Jansen',
    email: 'jan@example.com',
    phone: '0612345678',
    contactPreference: 'email',
    address: 'Teststraat 1',
    postcode: '1234 AB',
    city: 'Teststad',
    land: 'NL',
    deliveryAddress: '',
    deliveryPostcode: '',
    deliveryCity: '',
    invoiceAddress: '',
    invoicePostcode: '',
    invoiceCity: '',
    invoiceLand: '',
    status: 'Goedgekeurd',
    prijsgroepId: null,
    kunstenaarnr: null,
  },
  {
    id: 'uid-2',
    klantnr: 'KN-2',
    companyName: 'Tweede Klant BV',
    kvk: '87654321',
    contactPerson: 'Anne Bakker',
    email: 'anne@example.com',
    phone: '0687654321',
    contactPreference: 'email',
    address: 'Teststraat 2',
    postcode: '4321 BA',
    city: 'Teststad',
    land: 'NL',
    deliveryAddress: '',
    deliveryPostcode: '',
    deliveryCity: '',
    invoiceAddress: '',
    invoicePostcode: '',
    invoiceCity: '',
    invoiceLand: '',
    status: 'Goedgekeurd',
    prijsgroepId: null,
    kunstenaarnr: null,
  },
];
const BTWTARIEVEN: BtwTarieven = { tarieven: [{ land: 'NL', percentage: 21 }] };

const ZENDING: DrukkerZending = {
  id: 'zending-1',
  verzondenOp: new Date('2026-07-24T10:00:00Z'),
  onderwerp: 'ZD-00007 — Nieuwe order(s) voor de drukker – 24-7-2026',
  body: '== Testbedrijf BV ==',
  bestellingIds: ['GD-00201'],
  aantalKlanten: 1,
  aantalRegels: 1,
  verzondDoor: 'paul@glassartanddesign.com',
  zendingnummer: 'ZD-00007',
};

const BESTELLING_1: Bestelling = {
  id: 'header-1',
  klantnr: 'KN-1',
  companyName: 'Testbedrijf BV',
  bestelnr: 'GD-00201',
  korting: 10,
  besteldatum: '1-7-2026',
  status: 'Verstuurd naar drukker',
  lineCount: 1,
  totalQuantity: 2,
  lines: [{ id: 'line-1', code: 'Hotel paneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 100, quantity: 2 }],
};

const BESTELLING_2: Bestelling = {
  id: 'header-2',
  klantnr: 'KN-2',
  companyName: 'Tweede Klant BV',
  bestelnr: 'GD-00202',
  korting: null,
  besteldatum: '1-7-2026',
  status: 'Verstuurd naar drukker',
  lineCount: 1,
  totalQuantity: 1,
  lines: [{ id: 'line-2', code: 'Hotel paneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 50, quantity: 1 }],
};

function renderModal(overrides: Partial<React.ComponentProps<typeof ZendingBekijkenModal>> = {}) {
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <ZendingBekijkenModal
        zending={ZENDING}
        bestellingen={[BESTELLING_1]}
        kunstwerken={KUNSTWERKEN}
        materialen={MATERIALEN}
        maten={MATEN}
        materiaalsoorten={MATERIAALSOORTEN}
        klanten={KLANTEN}
        btwTarieven={BTWTARIEVEN}
        onClose={() => {}}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
}

describe('ZendingBekijkenModal', () => {
  it('is not shown when zending is null', () => {
    renderModal({ zending: null });
    expect(screen.queryByTestId('zending-bekijken-modal')).not.toBeInTheDocument();
  });

  it('shows the modal title and the zendingnummer in the subtitle', () => {
    renderModal();
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Zendinggegevens');
    expect(screen.getByTestId('modal-header')).toHaveTextContent('ZD-00007');
  });

  it('shows the bestelling with its regel and totaal for a single-order zending', () => {
    renderModal();
    const kaart = screen.getByTestId('zending-bekijken-bestelling-header-1');
    expect(kaart).toHaveTextContent('Testbedrijf BV');
    expect(kaart).toHaveTextContent('GD-00201');
    expect(kaart).toHaveTextContent('Hotel paneel');
    expect(kaart).toHaveTextContent('2 × € 100,00');
    // regelsom 200 - korting 10 = 190 excl. btw; 190 + 21% = 229,90 incl. btw
    expect(screen.getByTestId('zending-bekijken-bestelling-header-1-total')).toHaveTextContent('€ 190,00');
    expect(screen.getByTestId('zending-bekijken-bestelling-header-1-totaal-incl')).toHaveTextContent('€ 229,90');
  });

  it('shows one card per bestelling for a multi-order zending, each with its own totaal', () => {
    renderModal({
      zending: { ...ZENDING, bestellingIds: ['GD-00201', 'GD-00202'], aantalKlanten: 2, aantalRegels: 2 },
      bestellingen: [BESTELLING_1, BESTELLING_2],
    });
    expect(screen.getByTestId('zending-bekijken-bestelling-header-1')).toHaveTextContent('Testbedrijf BV');
    expect(screen.getByTestId('zending-bekijken-bestelling-header-2')).toHaveTextContent('Tweede Klant BV');
    expect(screen.getByTestId('zending-bekijken-bestelling-header-1-total')).toHaveTextContent('€ 190,00');
    expect(screen.getByTestId('zending-bekijken-bestelling-header-2-total')).toHaveTextContent('€ 50,00');
  });

  it('skips a bestelnummer from the zending that has no matching bestelling', () => {
    renderModal({
      zending: { ...ZENDING, bestellingIds: ['GD-00201', 'GD-ONBEKEND'] },
      bestellingen: [BESTELLING_1],
    });
    expect(screen.getByTestId('zending-bekijken-bestelling-header-1')).toBeInTheDocument();
    expect(screen.queryByTestId('zending-bekijken-modal-leeg')).not.toBeInTheDocument();
  });

  it('shows a fallback message when none of the bestelnummers match a known bestelling', () => {
    renderModal({ bestellingen: [] });
    expect(screen.getByTestId('zending-bekijken-modal-leeg')).toHaveTextContent(
      'Geen bestelgegevens gevonden voor deze zending.'
    );
  });

  it('renders no edit or status controls — view only', () => {
    renderModal();
    // The only buttons are Modal's own built-in close controls (top-right × and footer "Sluiten").
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run:
```bash
npx vitest run tests/components/beheer/ZendingBekijkenModal.test.tsx
```
Expected: FAIL with a module-not-found error for `@/components/beheer/ZendingBekijkenModal`.

- [ ] **Step 3: Add the two new translation keys**

In `messages/nl.json`, in the `beheer` block, change:
```json
    "drukkersMarkeerZendingAlsAfgerondError": "Niet alle bestellingen konden worden afgerond ({afgerond} van {totaal}).",
    "glassartDesignLoadError": "Kon de bedrijfsgegevens niet laden. Probeer de pagina te verversen.",
```
to:
```json
    "drukkersMarkeerZendingAlsAfgerondError": "Niet alle bestellingen konden worden afgerond ({afgerond} van {totaal}).",
    "drukkersZendingModalTitel": "Zendinggegevens",
    "drukkersZendingModalGeenBestellingen": "Geen bestelgegevens gevonden voor deze zending.",
    "glassartDesignLoadError": "Kon de bedrijfsgegevens niet laden. Probeer de pagina te verversen.",
```

- [ ] **Step 4: Implement the component**

Create `src/components/beheer/ZendingBekijkenModal.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal';
import { HelpLink } from '@/components/HelpLink';
import { ProductImage } from '@/components/ProductImage';
import { formatCurrency } from '@/lib/formatCurrency';
import { resolveBtwPercentage } from '@/lib/resolveBtw';
import { berekenBestellingTotalen } from '@/lib/bestellingTotalen';
import type { DrukkerZending } from '@/lib/useDrukkerZendingen';
import type { Bestelling } from './BestellingenSection';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort } from './materiaalTypes';
import type { Klant } from './KlantenSection';
import type { BtwTarieven } from './btwTarievenTypes';

interface ZendingBekijkenModalProps {
  zending: DrukkerZending | null;
  bestellingen: Bestelling[] | null;
  kunstwerken: Kunstwerk[] | null;
  materialen: Materiaal[] | null;
  maten: Maat[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  klanten: Klant[] | null;
  btwTarieven: BtwTarieven | null;
  onClose: () => void;
}

export function ZendingBekijkenModal({
  zending,
  bestellingen,
  kunstwerken,
  materialen,
  maten,
  materiaalsoorten,
  klanten,
  btwTarieven,
  onClose,
}: ZendingBekijkenModalProps) {
  const t = useTranslations('beheer');

  const materiaalsoortNaamById = new Map(
    (materiaalsoorten ?? []).map((soort) => [soort.id, soort.omschrijvingNl])
  );

  const orders = zending
    ? zending.bestellingIds
        .map((bestelnr) => (bestellingen ?? []).find((b) => b.bestelnr === bestelnr))
        .filter((b): b is Bestelling => b != null)
    : [];

  return (
    <Modal
      isOpen={zending !== null}
      onClose={onClose}
      closeLabel={t('modalClose')}
      title={
        <span className="flex w-full items-center justify-between gap-2 pr-2">
          {t('drukkersZendingModalTitel')}
          <HelpLink
            anchor="drukkers-zending-bekijken"
            label="Open het hoofdstuk over een verzonden zending bekijken"
            testId="zending-bekijken-modal-help"
          />
        </span>
      }
      subtitle={
        zending ? (
          <span>
            {zending.zendingnummer && `${zending.zendingnummer} · `}
            {zending.verzondenOp ? zending.verzondenOp.toLocaleString('nl-NL') : ''}
          </span>
        ) : undefined
      }
    >
      {zending && (
        <div data-testid="zending-bekijken-modal" className="flex flex-col gap-4 text-sm text-white/80">
          {orders.length === 0 ? (
            <p data-testid="zending-bekijken-modal-leeg" className="text-xs text-white/50">
              {t('drukkersZendingModalGeenBestellingen')}
            </p>
          ) : (
            orders.map((bestelling) => {
              const klant = (klanten ?? []).find((k) => k.klantnr === bestelling.klantnr);
              const land = klant ? klant.invoiceLand || klant.land || null : null;
              const btwPercentage = btwTarieven ? resolveBtwPercentage(btwTarieven.tarieven, land) : null;
              const totalen =
                bestelling.lines.length > 0
                  ? berekenBestellingTotalen(bestelling.lines, bestelling.korting, btwPercentage)
                  : null;
              const totaalWeergave =
                totalen === null
                  ? null
                  : totalen.heeftOngeprijsdeRegel
                    ? t('bestellingenModalTotalIncomplete')
                    : formatCurrency(totalen.totaalExclBtw!);

              return (
                <div
                  key={bestelling.id}
                  data-testid={`zending-bekijken-bestelling-${bestelling.id}`}
                  className="flex flex-col gap-3 rounded-md border border-white/10 bg-white/[0.02] p-3"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
                    {bestelling.companyName} · {bestelling.bestelnr} · {bestelling.besteldatum}
                  </p>
                  <ul className="flex flex-col gap-2 text-xs">
                    {bestelling.lines.map((line) => {
                      const kunstwerk = (kunstwerken ?? []).find((k) => k.code === line.code) ?? null;
                      const materiaal = (materialen ?? []).find((m) => m.id === line.materiaalId);
                      const maat = (maten ?? []).find((m) => m.id === line.maatId);
                      const maatWeergave = maat
                        ? `${maat.breedte}×${maat.hoogte} cm`
                        : line.breedte != null && line.hoogte != null
                          ? `${line.breedte}×${line.hoogte} cm`
                          : t('bestellingenRegelOnbekend');

                      return (
                        <li
                          key={line.id}
                          data-testid={`zending-bekijken-line-${line.id}`}
                          className="flex gap-3 rounded-md border border-white/10 bg-white/[0.02] p-3"
                        >
                          {kunstwerk ? (
                            <ProductImage
                              src={kunstwerk.foto}
                              alt=""
                              className="h-[72px] w-[72px] shrink-0 rounded-md"
                            />
                          ) : (
                            <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-md bg-white/5 text-lg text-white/25">
                              ?
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 font-semibold text-white/90">
                              {kunstwerk ? kunstwerk.omschrijvingNl : t('bestellingenRegelOnbekend')}
                            </p>
                            {kunstwerk && (
                              <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-white/60">
                                <span className="text-white/35">{t('bestellingenModalLabelCode')}</span>
                                <span>{kunstwerk.code}</span>
                                <span className="text-white/35">{t('bestellingenModalLabelMateriaal')}</span>
                                <span>
                                  {materiaal
                                    ? `${materiaal.materiaaldikte}mm ${
                                        materiaalsoortNaamById.get(materiaal.materiaalsoortId) ??
                                        materiaal.materiaalsoortId
                                      } — ${materiaal.omschrijvingNl}`
                                    : t('bestellingenRegelOnbekend')}
                                </span>
                                <span className="text-white/35">{t('bestellingenModalLabelMaat')}</span>
                                <span>{maatWeergave}</span>
                              </div>
                            )}
                            <div className="mt-2 flex items-baseline justify-between border-t border-white/10 pt-1.5">
                              {line.prijs !== null ? (
                                <>
                                  <span className="text-white/45">
                                    {line.quantity} × {formatCurrency(line.prijs)}
                                  </span>
                                  <span className="font-semibold text-white/90">
                                    {formatCurrency(line.prijs * line.quantity)}
                                  </span>
                                </>
                              ) : (
                                <span className="text-white/45">{t('bestellingenModalPrijsOpAanvraag')}</span>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {totaalWeergave !== null && (
                    <div className="grid grid-cols-[auto_auto] items-baseline justify-end gap-x-2 gap-y-0.5 self-end">
                      <span className="text-[0.65rem] uppercase tracking-wide text-white/40">
                        {t('bestellingenModalTotalLabel')}
                      </span>
                      <span
                        data-testid={`zending-bekijken-bestelling-${bestelling.id}-total`}
                        className="text-right text-sm font-semibold text-white tabular-nums"
                      >
                        {totaalWeergave}
                      </span>
                      {totalen && totalen.korting > 0 && (
                        <div className="contents">
                          <span className="text-[0.65rem] uppercase tracking-wide text-white/40">
                            {t('bestellingenModalKortingLabel')}
                          </span>
                          <span className="text-right text-sm text-white/80 tabular-nums">
                            -{formatCurrency(totalen.korting)}
                          </span>
                        </div>
                      )}
                      {totalen && totalen.btwBedrag !== null && (
                        <div className="contents">
                          <span className="text-[0.65rem] uppercase tracking-wide text-white/40">
                            {t('bestellingenModalBtwLabel', { percentage: totalen.btwPercentage })}
                          </span>
                          <span className="text-right text-sm text-white/80 tabular-nums">
                            {formatCurrency(totalen.btwBedrag)}
                          </span>
                        </div>
                      )}
                      {totalen && totalen.totaalInclBtw !== null && (
                        <>
                          <span className="text-[0.65rem] uppercase tracking-wide text-white/40">
                            {t('bestellingenModalTotaalInclLabel')}
                          </span>
                          <span
                            data-testid={`zending-bekijken-bestelling-${bestelling.id}-totaal-incl`}
                            className="text-right text-sm font-semibold text-white tabular-nums"
                          >
                            {formatCurrency(totalen.totaalInclBtw)}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run:
```bash
npx vitest run tests/components/beheer/ZendingBekijkenModal.test.tsx
```
Expected: PASS, all 6 tests.

- [ ] **Step 6: Add the gebruikershandleiding subsection**

In `src/components/beheer/documentatie/chapters/DrukkersChapter.tsx`, change:
```tsx
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
to:
```tsx
      <SubSection id="drukkers-standaard" title="Standaard-drukker">
        <P>
          Vink &quot;Standaard&quot; aan bij de drukker die je het vaakst gebruikt. Zodra je een bestelling
          naar de drukker stuurt (zie <DocLink anchor="bestelproces-drukker">Naar de drukker sturen</DocLink>
          ), staat deze drukker daar automatisch al geselecteerd — je kunt altijd nog een andere kiezen.
        </P>
      </SubSection>
      <SubSection id="drukkers-zending-bekijken" title="Een verzonden zending bekijken">
        <P>
          Bij een drukker zie je onder &quot;Verzonden mails&quot; alle zendingen die naar deze drukker zijn
          gestuurd. Klik op &quot;Bekijken&quot; om te zien wat er precies verstuurd is: per bestelling in de
          zending de productregels (met foto, materiaal en maat) en de bijbehorende bedragen — dezelfde
          weergave als bij <DocLink anchor="bestelproces-bewerken">een bestelling bewerken</DocLink>, maar
          dan alleen ter inzage, zonder wijzigingsopties.
        </P>
      </SubSection>
    </Chapter>
  );
}
```

- [ ] **Step 7: Add the sidebar TOC entry**

In `src/components/beheer/documentatie/DocumentatieSidebar.tsx`, change:
```tsx
  { href: '#drukkers', label: '8. Drukkers', subs: [{ href: '#drukkers-standaard', label: 'Standaard-drukker' }] },
```
to:
```tsx
  {
    href: '#drukkers',
    label: '8. Drukkers',
    subs: [
      { href: '#drukkers-standaard', label: 'Standaard-drukker' },
      { href: '#drukkers-zending-bekijken', label: 'Een verzonden zending bekijken' },
    ],
  },
```

- [ ] **Step 8: Register the new anchor in the anchor-integrity regression test**

In `tests/components/beheer/documentatie/anchorIntegrity.test.tsx`, change:
```tsx
// - src/components/beheer/BestellingModal.tsx
// - src/components/beheer/DrukkerModal.tsx
const EXTERNAL_ANCHORS = [
```
to:
```tsx
// - src/components/beheer/BestellingModal.tsx
// - src/components/beheer/DrukkerModal.tsx
// - src/components/beheer/ZendingBekijkenModal.tsx
const EXTERNAL_ANCHORS = [
```

And change:
```tsx
  // DrukkerModal.tsx
  'drukkers-standaard',
];
```
to:
```tsx
  // DrukkerModal.tsx
  'drukkers-standaard',
  // ZendingBekijkenModal.tsx
  'drukkers-zending-bekijken',
];
```

- [ ] **Step 9: Run the documentation tests**

Run:
```bash
npx vitest run tests/components/beheer/documentatie/anchorIntegrity.test.tsx tests/components/beheer/documentatie/DocumentatieSidebar.test.tsx
```
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/components/beheer/ZendingBekijkenModal.tsx tests/components/beheer/ZendingBekijkenModal.test.tsx messages/nl.json src/components/beheer/documentatie/chapters/DrukkersChapter.tsx src/components/beheer/documentatie/DocumentatieSidebar.tsx tests/components/beheer/documentatie/anchorIntegrity.test.tsx
git commit -m "feat: voeg read-only ZendingBekijkenModal toe voor verzonden zendingen"
```

---

### Task 2: Wire the popup into `DrukkerModal`

**Files:**
- Modify: `src/components/beheer/DrukkerModal.tsx`
- Modify: `src/components/beheer/DrukkersSection.tsx`
- Modify: `src/components/beheer/BeheerShell.tsx`
- Modify: `messages/nl.json` (remove one now-unused key)
- Modify: `tests/components/beheer/DrukkerModal.test.tsx`
- Modify: `tests/components/beheer/DrukkersSection.test.tsx`

**Interfaces:**
- Consumes: `ZendingBekijkenModal` and its props (Task 1).
- Produces: `DrukkerModal` and `DrukkersSection` both gain six new required props: `kunstwerken: Kunstwerk[] | null`, `materialen: Materiaal[] | null`, `maten: Maat[] | null`, `materiaalsoorten: Materiaalsoort[] | null`, `klanten: Klant[] | null`, `btwTarieven: BtwTarieven | null` — every caller of either component must now pass them.

- [ ] **Step 1: Write the failing test**

In `tests/components/beheer/DrukkerModal.test.tsx`, add these three imports right after the existing `import type { Bestelling } from '@/components/beheer/BestellingenSection';`:
```ts
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort } from '@/components/beheer/materiaalTypes';
import type { Klant } from '@/components/beheer/KlantenSection';
import type { BtwTarieven } from '@/components/beheer/btwTarievenTypes';
```

Replace the `renderModal` helper:
```tsx
function renderModal(
  state: { mode: 'edit'; drukker: Drukker } | { mode: 'add' } | null,
  overrides: { bestellingen?: Bestelling[] | null; onBestellingUpdated?: (b: Bestelling) => void } = {}
) {
  const onClose = vi.fn();
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  const onBestellingUpdated = overrides.onBestellingUpdated ?? vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <DrukkerModal
        state={state}
        bestellingen={'bestellingen' in overrides ? overrides.bestellingen ?? null : []}
        onClose={onClose}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onRemove={onRemove}
        onBestellingUpdated={onBestellingUpdated}
      />
    </NextIntlClientProvider>
  );
  return { onClose, onAdd, onUpdate, onRemove, onBestellingUpdated };
}
```
with:
```tsx
function renderModal(
  state: { mode: 'edit'; drukker: Drukker } | { mode: 'add' } | null,
  overrides: {
    bestellingen?: Bestelling[] | null;
    onBestellingUpdated?: (b: Bestelling) => void;
    kunstwerken?: Kunstwerk[] | null;
    materialen?: Materiaal[] | null;
    maten?: Maat[] | null;
    materiaalsoorten?: Materiaalsoort[] | null;
    klanten?: Klant[] | null;
    btwTarieven?: BtwTarieven | null;
  } = {}
) {
  const onClose = vi.fn();
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  const onBestellingUpdated = overrides.onBestellingUpdated ?? vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <DrukkerModal
        state={state}
        bestellingen={'bestellingen' in overrides ? overrides.bestellingen ?? null : []}
        kunstwerken={overrides.kunstwerken ?? null}
        materialen={overrides.materialen ?? null}
        maten={overrides.maten ?? null}
        materiaalsoorten={overrides.materiaalsoorten ?? null}
        klanten={overrides.klanten ?? null}
        btwTarieven={overrides.btwTarieven ?? null}
        onClose={onClose}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onRemove={onRemove}
        onBestellingUpdated={onBestellingUpdated}
      />
    </NextIntlClientProvider>
  );
  return { onClose, onAdd, onUpdate, onRemove, onBestellingUpdated };
}
```

Replace the second, raw `render(...)` call (in the `'blocks deleting a drukker that has zendingen'` test):
```tsx
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <DrukkerModal
          state={{ mode: 'edit', drukker: DRUKKER }}
          bestellingen={[]}
          onClose={vi.fn()}
          onAdd={vi.fn()}
          onUpdate={vi.fn().mockResolvedValue(true)}
          onRemove={onRemove}
          onBestellingUpdated={vi.fn()}
        />
      </NextIntlClientProvider>
    );
```
with:
```tsx
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <DrukkerModal
          state={{ mode: 'edit', drukker: DRUKKER }}
          bestellingen={[]}
          kunstwerken={null}
          materialen={null}
          maten={null}
          materiaalsoorten={null}
          klanten={null}
          btwTarieven={null}
          onClose={vi.fn()}
          onAdd={vi.fn()}
          onUpdate={vi.fn().mockResolvedValue(true)}
          onRemove={onRemove}
          onBestellingUpdated={vi.fn()}
        />
      </NextIntlClientProvider>
    );
```

Replace the `'lists zendingen and expands one to show the full mail body'` test:
```tsx
  it('lists zendingen and expands one to show the full mail body', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'zending-1',
          verzondenOp: '2026-07-24T10:00:00Z',
          onderwerp: 'Nieuwe order(s) voor de drukker – 24-7-2026',
          body: '== Testbedrijf BV ==\nAfleveradres: Teststraat 1, 1234 AB Teststad\n- Hotel paneel',
          bestellingIds: ['header-1'],
          aantalKlanten: 1,
          aantalRegels: 1,
          verzondDoor: 'paul@glassartanddesign.com',
        },
      ],
    });
    renderModal({ mode: 'edit', drukker: DRUKKER });
    const zendingRow = await screen.findByTestId('drukker-zending-zending-1');
    expect(zendingRow).toHaveTextContent('1');
    expect(screen.queryByText(/Testbedrijf BV/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('drukker-zending-bekijken-zending-1'));
    expect(screen.getByText(/Testbedrijf BV/)).toBeInTheDocument();
  });
```
with:
```tsx
  it('opens a read-only popup for the bestelling in that zending when "Bekijken" is clicked', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'zending-1',
          verzondenOp: '2026-07-24T10:00:00Z',
          onderwerp: 'Nieuwe order(s) voor de drukker – 24-7-2026',
          body: '== Testbedrijf BV ==\nAfleveradres: Teststraat 1, 1234 AB Teststad\n- Hotel paneel',
          bestellingIds: ['GD-00201'],
          aantalKlanten: 1,
          aantalRegels: 1,
          verzondDoor: 'paul@glassartanddesign.com',
        },
      ],
    });
    const bestelling: Bestelling = {
      id: 'header-1',
      klantnr: 'KN-1',
      companyName: 'Testbedrijf BV',
      bestelnr: 'GD-00201',
      korting: null,
      besteldatum: '1-7-2026',
      status: 'Verstuurd naar drukker',
      lineCount: 0,
      totalQuantity: 0,
      lines: [],
    };
    renderModal({ mode: 'edit', drukker: DRUKKER }, { bestellingen: [bestelling] });
    const zendingRow = await screen.findByTestId('drukker-zending-zending-1');
    expect(zendingRow).toHaveTextContent('1');
    expect(screen.queryByTestId('zending-bekijken-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('drukker-zending-bekijken-zending-1'));
    expect(await screen.findByTestId('zending-bekijken-bestelling-header-1')).toHaveTextContent('Testbedrijf BV');
    expect(screen.queryByText(/Afleveradres/)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test, verify it fails**

Run:
```bash
npx vitest run tests/components/beheer/DrukkerModal.test.tsx
```
Expected: FAIL — either a TypeScript-shape mismatch surfaces at runtime as a missing-prop issue, or (more likely) the popup never opens because `DrukkerModal` doesn't yet render `ZendingBekijkenModal`, so `zending-bekijken-bestelling-header-1` is never found.

- [ ] **Step 3: Add the new imports and props to `DrukkerModal.tsx`**

Change:
```tsx
import { useDrukkerZendingen, type DrukkerZending } from '@/lib/useDrukkerZendingen';
import type { Drukker } from './materiaalTypes';
import type { Bestelling } from './BestellingenSection';
```
to:
```tsx
import { useDrukkerZendingen, type DrukkerZending } from '@/lib/useDrukkerZendingen';
import { ZendingBekijkenModal } from './ZendingBekijkenModal';
import type { Drukker, Kunstwerk, Materiaal, Maat, Materiaalsoort } from './materiaalTypes';
import type { Bestelling } from './BestellingenSection';
import type { Klant } from './KlantenSection';
import type { BtwTarieven } from './btwTarievenTypes';
```

Change:
```tsx
interface DrukkerModalProps {
  state: ModalState;
  bestellingen: Bestelling[] | null;
  onClose: () => void;
```
to:
```tsx
interface DrukkerModalProps {
  state: ModalState;
  bestellingen: Bestelling[] | null;
  kunstwerken: Kunstwerk[] | null;
  materialen: Materiaal[] | null;
  maten: Maat[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  klanten: Klant[] | null;
  btwTarieven: BtwTarieven | null;
  onClose: () => void;
```

Change:
```tsx
export function DrukkerModal({
  state,
  bestellingen,
  onClose,
  onAdd,
  onUpdate,
  onRemove,
  onBestellingUpdated,
}: DrukkerModalProps) {
```
to:
```tsx
export function DrukkerModal({
  state,
  bestellingen,
  kunstwerken,
  materialen,
  maten,
  materiaalsoorten,
  klanten,
  btwTarieven,
  onClose,
  onAdd,
  onUpdate,
  onRemove,
  onBestellingUpdated,
}: DrukkerModalProps) {
```

- [ ] **Step 4: Replace the expand/collapse state with a "which zending is open" state**

Change:
```tsx
  const [expandedZendingId, setExpandedZendingId] = useState<string | null>(null);
```
to:
```tsx
  const [viewingZending, setViewingZending] = useState<DrukkerZending | null>(null);
```

Change (in the reset `useEffect`):
```tsx
    setActionError(null);
    setExpandedZendingId(null);
    setZendingActionError(null);
  }, [state]);
```
to:
```tsx
    setActionError(null);
    setViewingZending(null);
    setZendingActionError(null);
  }, [state]);
```

- [ ] **Step 5: Replace the "Bekijken/Verbergen" toggle button with a popup trigger**

Change:
```tsx
                        <button
                          type="button"
                          data-testid={`drukker-zending-bekijken-${zending.id}`}
                          onClick={() =>
                            setExpandedZendingId((current) => (current === zending.id ? null : zending.id))
                          }
                          className="shrink-0 text-white/50 underline underline-offset-2 hover:text-white"
                        >
                          {expandedZendingId === zending.id
                            ? t('drukkersZendingenVerbergen')
                            : t('drukkersZendingenBekijken')}
                        </button>
```
to:
```tsx
                        <button
                          type="button"
                          data-testid={`drukker-zending-bekijken-${zending.id}`}
                          onClick={() => setViewingZending(zending)}
                          className="shrink-0 text-white/50 underline underline-offset-2 hover:text-white"
                        >
                          {t('drukkersZendingenBekijken')}
                        </button>
```

- [ ] **Step 6: Remove the raw-mail-text block**

Change:
```tsx
                      {expandedZendingId === zending.id && (
                        <pre className="mt-2 whitespace-pre-wrap text-white/70">{zending.body}</pre>
                      )}
                    </li>
```
to:
```tsx
                    </li>
```

- [ ] **Step 7: Render `ZendingBekijkenModal` alongside the existing `Modal`**

Change (the opening of the `return`):
```tsx
  return (
    <Modal
      isOpen={state !== null}
      onClose={onClose}
```
to:
```tsx
  return (
    <>
    <Modal
      isOpen={state !== null}
      onClose={onClose}
```

Change (the very end of the file):
```tsx
      </div>
    </Modal>
  );
}
```
to:
```tsx
      </div>
    </Modal>
    <ZendingBekijkenModal
      zending={viewingZending}
      bestellingen={bestellingen}
      kunstwerken={kunstwerken}
      materialen={materialen}
      maten={maten}
      materiaalsoorten={materiaalsoorten}
      klanten={klanten}
      btwTarieven={btwTarieven}
      onClose={() => setViewingZending(null)}
    />
    </>
  );
}
```

- [ ] **Step 8: Remove the now-unused `drukkersZendingenVerbergen` translation key**

In `messages/nl.json`, change:
```json
    "drukkersZendingenBekijken": "Bekijken",
    "drukkersZendingenVerbergen": "Verbergen",
    "drukkersZendingenSamenvatting": "{klanten} klanten, {regels} regels",
```
to:
```json
    "drukkersZendingenBekijken": "Bekijken",
    "drukkersZendingenSamenvatting": "{klanten} klanten, {regels} regels",
```

- [ ] **Step 9: Run the test, verify it passes**

Run:
```bash
npx vitest run tests/components/beheer/DrukkerModal.test.tsx
```
Expected: PASS, every test in the file (including the ones untouched by this task, e.g. the afronden-badge tests).

- [ ] **Step 10: Thread the new props through `DrukkersSection.tsx`**

Change:
```tsx
import { DataTable, type Column } from '@/components/DataTable';
import { DrukkerModal } from './DrukkerModal';
import type { Drukker } from './materiaalTypes';
import type { Bestelling } from './BestellingenSection';
```
to:
```tsx
import { DataTable, type Column } from '@/components/DataTable';
import { DrukkerModal } from './DrukkerModal';
import type { Drukker, Kunstwerk, Materiaal, Maat, Materiaalsoort } from './materiaalTypes';
import type { Bestelling } from './BestellingenSection';
import type { Klant } from './KlantenSection';
import type { BtwTarieven } from './btwTarievenTypes';
```

Change:
```tsx
interface DrukkersSectionProps {
  drukkers: Drukker[] | null;
  bestellingen: Bestelling[] | null;
  loadError: string | null;
```
to:
```tsx
interface DrukkersSectionProps {
  drukkers: Drukker[] | null;
  bestellingen: Bestelling[] | null;
  kunstwerken: Kunstwerk[] | null;
  materialen: Materiaal[] | null;
  maten: Maat[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  klanten: Klant[] | null;
  btwTarieven: BtwTarieven | null;
  loadError: string | null;
```

Change:
```tsx
export function DrukkersSection({
  drukkers,
  bestellingen,
  loadError,
  onAdd,
  onUpdate,
  onRemove,
  onBestellingUpdated,
}: DrukkersSectionProps) {
```
to:
```tsx
export function DrukkersSection({
  drukkers,
  bestellingen,
  kunstwerken,
  materialen,
  maten,
  materiaalsoorten,
  klanten,
  btwTarieven,
  loadError,
  onAdd,
  onUpdate,
  onRemove,
  onBestellingUpdated,
}: DrukkersSectionProps) {
```

Change:
```tsx
      <DrukkerModal
        state={modalState}
        bestellingen={bestellingen}
        onClose={() => setModalState(null)}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onRemove={onRemove}
        onBestellingUpdated={onBestellingUpdated}
      />
```
to:
```tsx
      <DrukkerModal
        state={modalState}
        bestellingen={bestellingen}
        kunstwerken={kunstwerken}
        materialen={materialen}
        maten={maten}
        materiaalsoorten={materiaalsoorten}
        klanten={klanten}
        btwTarieven={btwTarieven}
        onClose={() => setModalState(null)}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onRemove={onRemove}
        onBestellingUpdated={onBestellingUpdated}
      />
```

- [ ] **Step 11: Update `DrukkersSection.test.tsx`'s render helper defaults**

In `tests/components/beheer/DrukkersSection.test.tsx`, change:
```tsx
      <DrukkersSection
        drukkers={DRUKKERS}
        bestellingen={[]}
        loadError={null}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onRemove={onRemove}
        onBestellingUpdated={onBestellingUpdated}
        {...overrides}
      />
```
to:
```tsx
      <DrukkersSection
        drukkers={DRUKKERS}
        bestellingen={[]}
        kunstwerken={null}
        materialen={null}
        maten={null}
        materiaalsoorten={null}
        klanten={null}
        btwTarieven={null}
        loadError={null}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onRemove={onRemove}
        onBestellingUpdated={onBestellingUpdated}
        {...overrides}
      />
```

- [ ] **Step 12: Pass the reference data at the `BeheerShell.tsx` call site**

In `src/components/beheer/BeheerShell.tsx`, change:
```tsx
        ) : activeSection === 'drukkers' ? (
          <DrukkersSection
            drukkers={drukkers.items}
            bestellingen={bestellingen}
            loadError={drukkers.error === 'load' ? t('drukkersLoadError') : null}
```
to:
```tsx
        ) : activeSection === 'drukkers' ? (
          <DrukkersSection
            drukkers={drukkers.items}
            bestellingen={bestellingen}
            kunstwerken={kunstwerken.items}
            materialen={materialen.items}
            maten={maten.items}
            materiaalsoorten={materiaalsoorten.items}
            klanten={klanten}
            btwTarieven={btwtarieven.data}
            loadError={drukkers.error === 'load' ? t('drukkersLoadError') : null}
```

- [ ] **Step 13: Typecheck**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors. This is the step most likely to catch a missed call site — every place that renders `<DrukkerModal>` or `<DrukkersSection>` now has six new required props.

- [ ] **Step 14: Run the full set of affected test files**

Run:
```bash
npx vitest run tests/components/beheer/DrukkerModal.test.tsx tests/components/beheer/DrukkersSection.test.tsx tests/components/beheer/BeheerShell.test.tsx tests/components/beheer/ZendingBekijkenModal.test.tsx tests/components/beheer/documentatie/anchorIntegrity.test.tsx tests/components/beheer/documentatie/DocumentatieSidebar.test.tsx
```
Expected: PASS, all files.

- [ ] **Step 15: Commit**

```bash
git add src/components/beheer/DrukkerModal.tsx src/components/beheer/DrukkersSection.tsx src/components/beheer/BeheerShell.tsx messages/nl.json tests/components/beheer/DrukkerModal.test.tsx tests/components/beheer/DrukkersSection.test.tsx
git commit -m "feat: open verzonden zending als read-only popup in plaats van ruwe mailtekst"
```
