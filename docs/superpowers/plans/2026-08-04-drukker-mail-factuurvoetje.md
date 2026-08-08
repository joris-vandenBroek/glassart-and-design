# Drukker-e-mail Factuurvoetje Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 04-08-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-time footer to the bottom of the "Versturen naar drukker" e-mail (both `text` and `html`) with the minimal Glassart & Design details a printer needs to send an invoice: bedrijfsnaam, bezoekadres, KVK-nummer, btw-nummer, e-mailadres — no IBAN.

**Architecture:** `buildDrukkerMail()` gains a new required `bedrijfsgegevens` input and appends one footer block after all per-klant sections (not per klant). `VersturenNaarDrukkerDialog.tsx` fetches the existing `bedrijfsgegevens` settings record (the same `useApiRecord('instellingen', 'bedrijfsgegevens')` + seed-fallback pattern already used by the public `ContactInfo.tsx`) and passes it through.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Vitest + Testing Library.

## Global Constraints

- No IBAN in the footer — bewuste keuze (de drukker heeft dit niet nodig om ons te factureren).
- Footer fields, in this order: bedrijfsnaam ("Glassart & Design", a literal string — this is not a field on `Bedrijfsgegevens`, same as `src/lib/server/sendResetEmail.ts`), `bezoekadres`, `kvkNummer`, `btwNummer`, `email`.
- Data source: the existing `Bedrijfsgegevens` settings record (`src/components/beheer/bedrijfsgegevensTypes.ts`), fetched via `useApiRecord<Bedrijfsgegevens>('instellingen', 'bedrijfsgegevens')` with `BEDRIJFSGEGEVENS_SEED` (`src/data/bedrijfsgegevensSeed.ts`) as the fallback — exact same pattern as `src/components/ContactInfo.tsx:16-17`. No new settings fields, no new API resource.
- The footer appears exactly once per e-mail, after all klant sections — never once per klant.
- All interpolated `bedrijfsgegevens` values in the HTML footer go through the existing `escapeHtml()` helper in `buildDrukkerMail.ts`, same as every other interpolated value in that file.
- Full spec: `docs/superpowers/specs/2026-08-04-drukker-mail-factuurvoetje-design.md`.

---

### Task 1: `buildDrukkerMail.ts` — append the factuurvoetje

**Files:**
- Modify: `src/lib/buildDrukkerMail.ts`
- Test: `tests/lib/buildDrukkerMail.test.ts`

**Interfaces:**
- Consumes: `Bedrijfsgegevens` type from `src/components/beheer/bedrijfsgegevensTypes.ts` (existing fields used: `bezoekadres: string`, `kvkNummer: string`, `btwNummer: string`, `email: string`).
- Produces: `DrukkerMailInput` gains a new required field `bedrijfsgegevens: Bedrijfsgegevens`. `buildDrukkerMail(input: DrukkerMailInput): DrukkerMail` — same function name, same `DrukkerMail` return shape (`{ subject, text, html }`) as before; `text`/`html` now include the footer at the end. Task 2 passes `bedrijfsgegevens` into this call.

- [ ] **Step 1: Write the failing tests**

Overwrite `tests/lib/buildDrukkerMail.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { buildDrukkerMail } from '@/lib/buildDrukkerMail';
import type { Bestelling } from '@/components/beheer/BestellingenSection';
import type { Klant } from '@/components/beheer/KlantenSection';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort } from '@/components/beheer/materiaalTypes';
import type { Bedrijfsgegevens } from '@/components/beheer/bedrijfsgegevensTypes';
import { BEDRIJFSGEGEVENS_SEED } from '@/data/bedrijfsgegevensSeed';

function klant(overrides: Partial<Klant> = {}): Klant {
  return {
    id: 'uid-1',
    companyName: 'Testbedrijf BV',
    kvk: '12345678',
    contactPerson: 'Jan Jansen',
    email: 'jan@example.com',
    phone: '0612345678',
    contactPreference: 'email',
    address: 'Teststraat 1',
    postcode: '1234 AB',
    city: 'Teststad',
    deliveryAddress: '',
    deliveryPostcode: '',
    deliveryCity: '',
    invoiceAddress: '',
    invoicePostcode: '',
    invoiceCity: '',
    status: 'Goedgekeurd',
    prijsgroepId: 'pg-1',
    kunstenaarId: null,
    ...overrides,
  };
}

const KUNSTWERKEN: Kunstwerk[] = [
  {
    id: 'kw-1',
    foto: '',
    naam: 'Hotel paneel',
    kunstenaarId: null,
    segmentIds: [],
    materiaalIds: ['mat-1'],
    maatIds: ['maat-1'],
    omschrijvingNl: 'Hotel paneel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
  {
    id: 'kw-2',
    foto: '',
    naam: 'Raampaneel',
    kunstenaarId: null,
    segmentIds: [],
    materiaalIds: ['mat-1'],
    maatIds: ['maat-1'],
    omschrijvingNl: 'Raampaneel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    formaat: 'liggend',
  },
  {
    id: 'kw-3',
    foto: '',
    naam: 'Deurpaneel',
    kunstenaarId: null,
    segmentIds: [],
    materiaalIds: ['mat-1'],
    maatIds: ['maat-1'],
    omschrijvingNl: 'Deurpaneel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    formaat: 'staand',
  },
];
const MATERIALEN: Materiaal[] = [{ id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 6, omschrijving: 'Helder' }];
const MATEN: Maat[] = [{ id: 'maat-1', breedte: 40, hoogte: 60 }];
const MATERIAALSOORTEN: Materiaalsoort[] = [{ id: 'soort-1', omschrijving: 'Glas' }];

function bestelling(overrides: Partial<Bestelling> = {}): Bestelling {
  return {
    id: 'header-1',
    klantId: 'uid-1',
    companyName: 'Testbedrijf BV',
    bestelnr: 'GD-00401',
    besteldatum: '1-7-2026',
    status: 'Te versturen naar drukker',
    lineCount: 1,
    totalQuantity: 2,
    lines: [{ id: 'line-1', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
    ...overrides,
  };
}

function callBuildDrukkerMail(overrides: {
  bestellingen: Bestelling[];
  klanten: Klant[];
  kunstwerken?: Kunstwerk[];
  materialen?: Materiaal[];
  maten?: Maat[];
  materiaalsoorten?: Materiaalsoort[];
  bedrijfsgegevens?: Bedrijfsgegevens;
}) {
  return buildDrukkerMail({
    kunstwerken: KUNSTWERKEN,
    materialen: MATERIALEN,
    maten: MATEN,
    materiaalsoorten: MATERIAALSOORTEN,
    bedrijfsgegevens: BEDRIJFSGEGEVENS_SEED,
    ...overrides,
  });
}

describe('buildDrukkerMail', () => {
  it('includes the bedrijfsnaam, standaardadres, and regel details for a single klant', () => {
    const mail = callBuildDrukkerMail({ bestellingen: [bestelling()], klanten: [klant()] });
    expect(mail.text).toContain('== Testbedrijf BV ==');
    expect(mail.text).toContain('Afleveradres: Teststraat 1, 1234 AB Teststad');
    expect(mail.text).toContain('Hotel paneel — 6mm Glas — Helder, maat 40×60 cm, aantal 2');
  });

  it('uses the delivery address instead of the standaardadres when it is set', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [bestelling()],
      klanten: [klant({ deliveryAddress: 'Havenweg 5', deliveryPostcode: '5678 CD', deliveryCity: 'Havenstad' })],
    });
    expect(mail.text).toContain('Afleveradres: Havenweg 5, 5678 CD Havenstad');
    expect(mail.text).not.toContain('Teststraat 1');
  });

  it('falls back to the standaardadres when deliveryAddress is null (nullable DB column, not just empty string)', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [bestelling()],
      klanten: [
        klant({ deliveryAddress: null as unknown as string, deliveryPostcode: null as unknown as string, deliveryCity: null as unknown as string }),
      ],
    });
    expect(mail.text).toContain('Afleveradres: Teststraat 1, 1234 AB Teststad');
  });

  it('groups multiple bestellingen from the same klant into a single section', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [
        bestelling({ id: 'header-1' }),
        bestelling({
          id: 'header-2',
          lines: [{ id: 'line-2', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
        }),
      ],
      klanten: [klant()],
    });
    expect(mail.text.match(/== Testbedrijf BV ==/g)).toHaveLength(1);
    expect(mail.text).toContain('aantal 2');
    expect(mail.text).toContain('aantal 1');
  });

  it('creates a section per klant when bestellingen come from different klanten', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [bestelling({ id: 'header-1' }), bestelling({ id: 'header-2', klantId: 'uid-2', companyName: 'Ander Bedrijf' })],
      klanten: [klant(), klant({ id: 'uid-2', companyName: 'Ander Bedrijf' })],
    });
    expect(mail.text).toContain('== Testbedrijf BV ==');
    expect(mail.text).toContain('== Ander Bedrijf ==');
  });

  it('describes a custom-size line using its breedte/hoogte instead of a maat lookup', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [
        bestelling({
          lines: [
            { id: 'line-3', kunstwerkId: 'kw-1', maatId: '', materiaalId: 'mat-1', breedte: 90, hoogte: 140, prijs: 275, quantity: 1 },
          ],
        }),
      ],
      klanten: [klant()],
    });
    expect(mail.text).toContain('maat 90×140 cm');
  });

  it('appends the formaat suffix on a custom-size (breedte/hoogte) line too', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [
        bestelling({
          lines: [
            { id: 'line-6', kunstwerkId: 'kw-2', maatId: '', materiaalId: 'mat-1', breedte: 90, hoogte: 140, prijs: 275, quantity: 1 },
          ],
        }),
      ],
      klanten: [klant()],
    });
    expect(mail.text).toContain('maat 90×140 cm (Liggend), aantal 1');
  });

  it('sets a subject mentioning the drukker order', () => {
    const mail = callBuildDrukkerMail({ bestellingen: [bestelling()], klanten: [klant()] });
    expect(mail.subject).toContain('Nieuwe order(s) voor de drukker');
  });

  it('appends " (Liggend)" to the maat when the kunstwerk formaat is liggend', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [
        bestelling({
          lines: [{ id: 'line-4', kunstwerkId: 'kw-2', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
        }),
      ],
      klanten: [klant()],
    });
    expect(mail.text).toContain('maat 40×60 cm (Liggend), aantal 1');
  });

  it('appends " (Staand)" to the maat when the kunstwerk formaat is staand', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [
        bestelling({
          lines: [{ id: 'line-5', kunstwerkId: 'kw-3', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
        }),
      ],
      klanten: [klant()],
    });
    expect(mail.text).toContain('maat 40×60 cm (Staand), aantal 1');
  });

  it('adds no suffix when the kunstwerk formaat is vierkant or not set', () => {
    const mail = callBuildDrukkerMail({ bestellingen: [bestelling()], klanten: [klant()] });
    expect(mail.text).toContain('maat 40×60 cm, aantal 2');
    expect(mail.text).not.toContain('cm (');
  });

  it('falls back to the bestelling companyName and "Onbekend afleveradres" when the klant is not found', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [bestelling({ klantId: 'uid-missing', companyName: 'Verdwenen BV' })],
      klanten: [],
    });
    expect(mail.text).toContain('== Verdwenen BV ==');
    expect(mail.text).toContain('Afleveradres: Onbekend afleveradres');
  });

  it('falls back to "Onbekend materiaal", "Onbekend kunstwerk" and "Onbekende maat" for unmatched reference ids', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [
        bestelling({
          lines: [
            { id: 'line-unknown', kunstwerkId: 'kw-missing', maatId: 'maat-missing', materiaalId: 'mat-missing', prijs: 100, quantity: 1 },
          ],
        }),
      ],
      klanten: [klant()],
    });
    expect(mail.text).toContain('Onbekend kunstwerk');
    expect(mail.text).toContain('Onbekend materiaal');
    expect(mail.text).toContain('Onbekende maat');
  });

  it('includes an <img> for a line whose kunstwerk has a foto, in the html output', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [bestelling()],
      klanten: [klant()],
      kunstwerken: [{ ...KUNSTWERKEN[0], foto: 'https://example.com/foto.jpg' }, KUNSTWERKEN[1], KUNSTWERKEN[2]],
    });
    expect(mail.html).toContain('<img src="https://example.com/foto.jpg"');
  });

  it('shows a "?" placeholder in the html output when a line\'s kunstwerk has no foto', () => {
    const mail = callBuildDrukkerMail({ bestellingen: [bestelling()], klanten: [klant()] });
    expect(mail.html).not.toContain('<img src=""');
    expect(mail.html).toContain('>?<');
  });

  it('includes the maat and aantal but no price figures in the html output', () => {
    const mail = callBuildDrukkerMail({ bestellingen: [bestelling()], klanten: [klant()] });
    expect(mail.html).toContain('Maat: 40×60 cm');
    expect(mail.html).toContain('Aantal: 2');
    expect(mail.html).not.toContain('€150');
    expect(mail.html).not.toContain('150,00');
  });

  it('HTML-escapes a bedrijfsnaam containing special characters', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [bestelling()],
      klanten: [klant({ companyName: 'A & B <Glas>' })],
    });
    expect(mail.html).toContain('A &amp; B &lt;Glas&gt;');
    expect(mail.html).not.toContain('A & B <Glas>');
  });

  it('appends a one-time factuurvoetje with the Glassart & Design invoice details, after the klant sections', () => {
    const mail = callBuildDrukkerMail({ bestellingen: [bestelling()], klanten: [klant()] });

    expect(mail.text).toContain('Glassart & Design');
    expect(mail.text).toContain(BEDRIJFSGEGEVENS_SEED.bezoekadres);
    expect(mail.text).toContain(`KVK-nummer: ${BEDRIJFSGEGEVENS_SEED.kvkNummer}`);
    expect(mail.text).toContain(`Btw-nummer: ${BEDRIJFSGEGEVENS_SEED.btwNummer}`);
    expect(mail.text).toContain(`E-mailadres (voor facturen): ${BEDRIJFSGEGEVENS_SEED.email}`);
    expect(mail.text.indexOf('Testbedrijf BV')).toBeLessThan(mail.text.indexOf('Glassart & Design'));

    expect(mail.html).toContain('Glassart &amp; Design');
    expect(mail.html).toContain(BEDRIJFSGEGEVENS_SEED.bezoekadres);
    expect(mail.html).toContain(`KVK-nummer: ${BEDRIJFSGEGEVENS_SEED.kvkNummer}`);
    expect(mail.html).toContain(`Btw-nummer: ${BEDRIJFSGEGEVENS_SEED.btwNummer}`);
    expect(mail.html).toContain(`E-mailadres (voor facturen): ${BEDRIJFSGEGEVENS_SEED.email}`);
    expect(mail.html.indexOf('Testbedrijf BV')).toBeLessThan(mail.html.indexOf('Glassart &amp; Design'));
  });

  it('includes the factuurvoetje only once, even with multiple klant sections', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [bestelling({ id: 'header-1' }), bestelling({ id: 'header-2', klantId: 'uid-2', companyName: 'Ander Bedrijf' })],
      klanten: [klant(), klant({ id: 'uid-2', companyName: 'Ander Bedrijf' })],
    });
    expect(mail.text.match(/Glassart & Design/g)).toHaveLength(1);
    expect(mail.html.match(/Glassart &amp; Design/g)).toHaveLength(1);
  });

  it('HTML-escapes the bedrijfsgegevens values in the factuurvoetje', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [bestelling()],
      klanten: [klant()],
      bedrijfsgegevens: { ...BEDRIJFSGEGEVENS_SEED, bezoekadres: 'Kade & Haven 1, 1000 AB "Rotterdam"' },
    });
    expect(mail.html).toContain('Kade &amp; Haven 1, 1000 AB &quot;Rotterdam&quot;');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/buildDrukkerMail.test.ts`
Expected: FAIL — `buildDrukkerMail` doesn't accept a `bedrijfsgegevens` field yet (TS type error surfaced at test time via vitest's esbuild transform, or the three new footer-specific tests fail because no footer is ever appended — either way, RED).

- [ ] **Step 3: Write the implementation**

In `src/lib/buildDrukkerMail.ts`, add the import (after the existing imports at the top):

```ts
import type { Bedrijfsgegevens } from '@/components/beheer/bedrijfsgegevensTypes';
```

Change `DrukkerMailInput` (add one field):

```ts
export interface DrukkerMailInput {
  bestellingen: Bestelling[];
  klanten: Klant[];
  kunstwerken: Kunstwerk[];
  materialen: Materiaal[];
  maten: Maat[];
  materiaalsoorten: Materiaalsoort[];
  bedrijfsgegevens: Bedrijfsgegevens;
}
```

Add two new functions right after `escapeHtml` (before `formatAfleveradres`):

```ts
function buildFactuurvoetjeText(bedrijfsgegevens: Bedrijfsgegevens): string {
  return `--\nGlassart & Design\n${bedrijfsgegevens.bezoekadres}\nKVK-nummer: ${bedrijfsgegevens.kvkNummer}\nBtw-nummer: ${bedrijfsgegevens.btwNummer}\nE-mailadres (voor facturen): ${bedrijfsgegevens.email}`;
}

function buildFactuurvoetjeHtml(bedrijfsgegevens: Bedrijfsgegevens): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:24px;border-top:1px solid #e5e5e5;">
  <tr>
    <td style="padding-top:12px;font-family:Arial,sans-serif;font-size:12px;color:#666666;">
      <div style="font-weight:bold;color:#333333;margin-bottom:2px;">Glassart &amp; Design</div>
      <div>${escapeHtml(bedrijfsgegevens.bezoekadres)}</div>
      <div>KVK-nummer: ${escapeHtml(bedrijfsgegevens.kvkNummer)}</div>
      <div>Btw-nummer: ${escapeHtml(bedrijfsgegevens.btwNummer)}</div>
      <div>E-mailadres (voor facturen): ${escapeHtml(bedrijfsgegevens.email)}</div>
    </td>
  </tr>
</table>`;
}
```

Change the `buildDrukkerMail` function signature to destructure `bedrijfsgegevens`, and change its `return` statement to append the footer:

```ts
export function buildDrukkerMail({
  bestellingen,
  klanten,
  kunstwerken,
  materialen,
  maten,
  materiaalsoorten,
  bedrijfsgegevens,
}: DrukkerMailInput): DrukkerMail {
  const datum = new Date().toLocaleDateString('nl-NL');
  const klantIds = Array.from(new Set(bestellingen.map((b) => b.klantId)));

  const secties = klantIds.map((klantId) => {
    const klant = klanten.find((k) => k.id === klantId);
    const klantBestellingen = bestellingen.filter((b) => b.klantId === klantId);
    const bedrijfsnaam = klant?.companyName ?? klantBestellingen[0].companyName;
    const afleveradres = klant ? formatAfleveradres(klant) : 'Onbekend afleveradres';
    const lines = klantBestellingen.flatMap((b) => b.lines);

    const regelsText = lines
      .map((line) => `- ${formatRegel(line, kunstwerken, materialen, maten, materiaalsoorten)}`)
      .join('\n');
    const regelsHtml = lines
      .map((line) => formatRegelHtml(line, kunstwerken, materialen, maten, materiaalsoorten))
      .join('');

    return {
      text: `== ${bedrijfsnaam} ==\nAfleveradres: ${afleveradres}\n${regelsText}`,
      html: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
  <tr>
    <td style="background:#f2f2f2;padding:12px 16px;border-radius:4px 4px 0 0;">
      <div style="font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#111111;">${escapeHtml(bedrijfsnaam)}</div>
      <div style="font-family:Arial,sans-serif;font-size:13px;color:#555555;margin-top:2px;">Afleveradres: ${escapeHtml(afleveradres)}</div>
    </td>
  </tr>
  <tr>
    <td style="padding:0 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        ${regelsHtml}
      </table>
    </td>
  </tr>
</table>`,
    };
  });

  return {
    subject: `Nieuwe order(s) voor de drukker – ${datum}`,
    text: `${secties.map((sectie) => sectie.text).join('\n\n')}\n\n${buildFactuurvoetjeText(bedrijfsgegevens)}`,
    html: `<html><body style="margin:0;padding:16px;background:#ffffff;">${secties.map((sectie) => sectie.html).join('')}${buildFactuurvoetjeHtml(bedrijfsgegevens)}</body></html>`,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/buildDrukkerMail.test.ts`
Expected: PASS — all 20 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/buildDrukkerMail.ts tests/lib/buildDrukkerMail.test.ts
git commit -m "feat: append a Glassart & Design invoice-details footer to the drukker-mail"
```

---

### Task 2: `VersturenNaarDrukkerDialog.tsx` — fetch and pass through `bedrijfsgegevens`

**Files:**
- Modify: `src/components/beheer/VersturenNaarDrukkerDialog.tsx`
- Test: `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx`

**Interfaces:**
- Consumes: `DrukkerMailInput` from Task 1 (now requires `bedrijfsgegevens: Bedrijfsgegevens`); `useApiRecord<T>(resource: string, id: string): { data: T | null; error; save }` (`src/lib/useApiRecord.ts`, unchanged, already used elsewhere); `BEDRIJFSGEGEVENS_SEED: Bedrijfsgegevens` (`src/data/bedrijfsgegevensSeed.ts`, unchanged).
- Produces: no exported change — same component name/props. No new props are added; the settings record is fetched internally by the component, exactly like `ContactInfo.tsx` does today.

- [ ] **Step 1: Write the failing tests**

Overwrite `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx` with:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { VersturenNaarDrukkerDialog } from '@/components/beheer/VersturenNaarDrukkerDialog';
import { BEDRIJFSGEGEVENS_SEED } from '@/data/bedrijfsgegevensSeed';
import type { Bestelling } from '@/components/beheer/BestellingenSection';
import type { Klant } from '@/components/beheer/KlantenSection';
import type { Drukker, Kunstwerk, Materiaal, Maat, Materiaalsoort } from '@/components/beheer/materiaalTypes';
import messages from '../../../messages/nl.json';

const logActiviteitMock = vi.fn();
const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);

vi.mock('@/lib/useAdminAuth', () => ({
  useAdminAuth: () => ({ user: { uid: 'staff-1', email: 'paul@glassartanddesign.com' } }),
}));

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: (...args: unknown[]) => logActiviteitMock(...args),
  actorFromMedewerker: (user: { uid: string; email: string | null } | null) =>
    user
      ? { id: user.uid, email: user.email ?? 'Onbekend', naam: user.email ?? 'Onbekend' }
      : { id: null, email: 'Onbekend', naam: 'Onbekend' },
}));

const KLANT: Klant = {
  id: 'uid-1',
  companyName: 'Testbedrijf BV',
  kvk: '12345678',
  contactPerson: 'Jan Jansen',
  email: 'jan@example.com',
  phone: '0612345678',
  contactPreference: 'email',
  address: 'Teststraat 1',
  postcode: '1234 AB',
  city: 'Teststad',
  deliveryAddress: '',
  deliveryPostcode: '',
  deliveryCity: '',
  invoiceAddress: '',
  invoicePostcode: '',
  invoiceCity: '',
  status: 'Goedgekeurd',
  prijsgroepId: 'pg-1',
  kunstenaarId: null,
};

const DRUKKERS: Drukker[] = [
  { id: 'drukker-1', naam: 'Drukkerij Janssen', adres: 'Perslaan 1', postcode: '1000 AA', plaats: 'Utrecht', email: 'info@janssen.nl', prijsafspraken: '' },
];

const DRUKKERS_MET_STANDAARD: Drukker[] = [
  { id: 'drukker-1', naam: 'Drukkerij Janssen', adres: 'Perslaan 1', postcode: '1000 AA', plaats: 'Utrecht', email: 'info@janssen.nl', prijsafspraken: '' },
  { id: 'drukker-2', naam: 'Drukkerij Tweede', adres: 'Perslaan 2', postcode: '1000 AB', plaats: 'Utrecht', email: 'info@tweede.nl', prijsafspraken: '', standaard: true },
];

const KUNSTWERKEN: Kunstwerk[] = [
  { id: 'kw-1', foto: 'https://example.com/hotel-paneel.jpg', naam: 'Hotel paneel', kunstenaarId: null, segmentIds: [], materiaalIds: ['mat-1'], maatIds: ['maat-1'], omschrijvingNl: 'Hotel paneel', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
];
const MATERIALEN: Materiaal[] = [{ id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 6, omschrijving: 'Helder' }];
const MATEN: Maat[] = [{ id: 'maat-1', breedte: 40, hoogte: 60 }];
const MATERIAALSOORTEN: Materiaalsoort[] = [{ id: 'soort-1', omschrijving: 'Glas' }];

const BESTELLING: Bestelling = {
  id: 'header-1',
  klantId: 'uid-1',
  companyName: 'Testbedrijf BV',
  bestelnr: 'GD-00201',
  besteldatum: '1-7-2026',
  status: 'Te versturen naar drukker',
  lineCount: 1,
  totalQuantity: 2,
  lines: [{ id: 'line-1', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
};

const BESTELLING_2: Bestelling = {
  id: 'header-2',
  klantId: 'uid-1',
  companyName: 'Testbedrijf BV',
  bestelnr: 'GD-00202',
  besteldatum: '2-7-2026',
  status: 'Te versturen naar drukker',
  lineCount: 1,
  totalQuantity: 1,
  lines: [{ id: 'line-2', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
};

function renderDialog(overrides: Partial<React.ComponentProps<typeof VersturenNaarDrukkerDialog>> = {}) {
  const onClose = vi.fn();
  const onVerstuurd = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <VersturenNaarDrukkerDialog
        isOpen
        onClose={onClose}
        bestellingen={[BESTELLING]}
        klanten={[KLANT]}
        drukkers={DRUKKERS}
        kunstwerken={KUNSTWERKEN}
        materialen={MATERIALEN}
        maten={MATEN}
        materiaalsoorten={MATERIAALSOORTEN}
        onVerstuurd={onVerstuurd}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  return { onClose, onVerstuurd };
}

function zendingCall() {
  return fetchMock.mock.calls.find((call) => (call[0] as string) === '/api/drukkers/drukker-1/zendingen');
}

function statusCallFor(headerId: string) {
  return fetchMock.mock.calls.find((call) => (call[0] as string) === `/api/bestelheaders/${headerId}`);
}

function mailCallPayload() {
  const call = fetchMock.mock.calls.find((call) => (call[0] as string) === 'https://example.com/mail.php');
  return call ? JSON.parse((call[1] as { body: string }).body) : undefined;
}

function defaultFetchImplementation(url: string) {
  if (url === 'https://example.com/mail.php') return { ok: true };
  if (url === '/api/instellingen/bedrijfsgegevens') return { ok: true, json: async () => BEDRIJFSGEGEVENS_SEED };
  if (url === '/api/drukkers/drukker-1/zendingen') return { ok: true, json: async () => ({ ok: true }) };
  return { ok: true, json: async () => ({ ok: true }) };
}

beforeEach(() => {
  logActiviteitMock.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => defaultFetchImplementation(url));
  vi.stubEnv('NEXT_PUBLIC_MAIL_ENDPOINT_URL', 'https://example.com/mail.php');
  vi.stubEnv('NEXT_PUBLIC_MAIL_SECRET', 'test-secret');
});

describe('VersturenNaarDrukkerDialog', () => {
  it('pre-selects the only drukker and shows the full e-mail preview, including a line thumbnail', () => {
    renderDialog();
    expect(screen.getByTestId('drukker-versturen-drukker')).toHaveValue('drukker-1');
    expect(screen.getByTestId('drukker-versturen-preview')).toHaveTextContent('Testbedrijf BV');
    expect(screen.getByTestId('drukker-versturen-preview')).toHaveTextContent('Hotel paneel');
    expect(screen.getByTestId('drukker-versturen-preview').querySelector('img')).toHaveAttribute(
      'src',
      'https://example.com/hotel-paneel.jpg'
    );
  });

  it('pre-selects the standaard drukker when multiple drukkers exist', () => {
    renderDialog({ drukkers: DRUKKERS_MET_STANDAARD });
    expect(screen.getByTestId('drukker-versturen-drukker')).toHaveValue('drukker-2');
  });

  it('falls back to the first drukker when none is marked standaard', () => {
    renderDialog({
      drukkers: DRUKKERS_MET_STANDAARD.map((drukker) => ({ ...drukker, standaard: false })),
    });
    expect(screen.getByTestId('drukker-versturen-drukker')).toHaveValue('drukker-1');
  });

  it('sends the mail with both a plain-text and an html body, including the Glassart & Design invoice footer, updates statuses, saves a zending, logs the activiteit, and closes', async () => {
    const { onVerstuurd, onClose } = renderDialog();

    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('https://example.com/mail.php', expect.objectContaining({ method: 'POST' }))
    );
    expect(mailCallPayload()).toMatchObject({
      to: 'info@janssen.nl',
      subject: expect.stringContaining('Nieuwe order(s) voor de drukker'),
      body: expect.stringContaining('Testbedrijf BV'),
      html: expect.stringContaining('<img src="https://example.com/hotel-paneel.jpg"'),
    });
    expect(mailCallPayload().body).toContain(BEDRIJFSGEGEVENS_SEED.bezoekadres);
    expect(mailCallPayload().html).toContain(BEDRIJFSGEGEVENS_SEED.kvkNummer);
    await waitFor(() =>
      expect(statusCallFor('header-1')).toEqual([
        '/api/bestelheaders/header-1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'Verstuurd naar drukker' }) }),
      ])
    );
    await waitFor(() => expect(zendingCall()).toBeDefined());
    expect(JSON.parse((zendingCall()![1] as { body: string }).body)).toMatchObject({
      bestellingIds: ['header-1'],
      aantalKlanten: 1,
      aantalRegels: 1,
      verzondDoor: 'paul@glassartanddesign.com',
    });
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'bestelling_verstuurd_naar_drukker',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'GD-00201'
    );
    expect(onVerstuurd).toHaveBeenCalledWith([{ ...BESTELLING, status: 'Verstuurd naar drukker' }]);
    expect(onClose).toHaveBeenCalled();
  });

  it('joins bestelnummers with a comma when sending a batch of multiple bestellingen', async () => {
    renderDialog({ bestellingen: [BESTELLING, BESTELLING_2] });

    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'bestelling_verstuurd_naar_drukker',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'GD-00201, GD-00202'
      )
    );
  });

  it('shows an error and does not update anything when the mail request fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/mail.php') return { ok: false };
      return defaultFetchImplementation(url);
    });
    const { onVerstuurd } = renderDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));
    expect(await screen.findByTestId('drukker-versturen-error')).toHaveTextContent(
      'Het versturen van de e-mail is mislukt. Probeer het opnieuw.'
    );
    expect(statusCallFor('header-1')).toBeUndefined();
    expect(onVerstuurd).not.toHaveBeenCalled();
  });

  it('shows a distinct error when the mail sends but the status update fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/mail.php') return { ok: true };
      if (url === '/api/drukkers/drukker-1/zendingen') return { ok: true, json: async () => ({ ok: true }) };
      if (url === '/api/instellingen/bedrijfsgegevens') return { ok: true, json: async () => BEDRIJFSGEGEVENS_SEED };
      return { ok: false };
    });
    renderDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));
    expect(await screen.findByTestId('drukker-versturen-error')).toHaveTextContent(
      'De e-mail is verzonden, maar het bijwerken van de bestellingen is mislukt. Verstuur niet opnieuw — controleer de statussen handmatig.'
    );
  });

  it('saves the zending archive record before updating the bestelling statuses', async () => {
    const callOrder: string[] = [];
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/mail.php') return { ok: true };
      if (url === '/api/instellingen/bedrijfsgegevens') return { ok: true, json: async () => BEDRIJFSGEGEVENS_SEED };
      if (url === '/api/drukkers/drukker-1/zendingen') {
        callOrder.push('zending');
        return { ok: true, json: async () => ({ ok: true }) };
      }
      callOrder.push('status');
      return { ok: true, json: async () => ({ ok: true }) };
    });
    renderDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

    await waitFor(() => expect(callOrder).toContain('status'));
    expect(callOrder).toEqual(['zending', 'status']);
  });

  it('archives the zending even when the subsequent status update fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/mail.php') return { ok: true };
      if (url === '/api/instellingen/bedrijfsgegevens') return { ok: true, json: async () => BEDRIJFSGEGEVENS_SEED };
      if (url === '/api/drukkers/drukker-1/zendingen') return { ok: true, json: async () => ({ ok: true }) };
      return { ok: false };
    });
    renderDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

    await screen.findByTestId('drukker-versturen-error');
    expect(zendingCall()).toBeDefined();
  });

  it('disables Versturen once a mail has been sent, even if the dialog stays open, preventing a duplicate send', async () => {
    renderDialog();
    const versturenButton = screen.getByTestId('drukker-versturen-versturen');
    fireEvent.click(versturenButton);

    await waitFor(() => expect(statusCallFor('header-1')).toBeDefined());
    await waitFor(() => expect(versturenButton).toBeDisabled());

    fireEvent.click(versturenButton);
    expect(fetchMock.mock.calls.filter((call) => (call[0] as string) !== '/api/instellingen/bedrijfsgegevens')).toHaveLength(3);
  });

  it('disables Versturen as soon as the mail POST succeeds, before the zending/status writes settle', async () => {
    let resolveZending: () => void = () => {};
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/mail.php') return { ok: true };
      if (url === '/api/instellingen/bedrijfsgegevens') return { ok: true, json: async () => BEDRIJFSGEGEVENS_SEED };
      if (url === '/api/drukkers/drukker-1/zendingen') {
        return new Promise((resolve) => {
          resolveZending = () => resolve({ ok: true, json: async () => ({ ok: true }) });
        });
      }
      return { ok: true, json: async () => ({ ok: true }) };
    });
    renderDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

    await waitFor(() => expect(screen.getByTestId('drukker-versturen-versturen')).toBeDisabled());
    resolveZending();
  });

  it('disables Versturen and shows a message when a selected bestelling has no matching klant', () => {
    renderDialog({ klanten: [] });
    expect(screen.getByTestId('drukker-versturen-versturen')).toBeDisabled();
    expect(screen.getByTestId('drukker-versturen-klant-ontbreekt')).toHaveTextContent(
      'Klantgegevens ontbreken voor 1 bestelling(en) — kan niet verstuurd worden.'
    );
  });

  it('does not disable Versturen or show the klant-ontbreken message when all klanten are present', () => {
    renderDialog();
    expect(screen.queryByTestId('drukker-versturen-klant-ontbreekt')).not.toBeInTheDocument();
    expect(screen.getByTestId('drukker-versturen-versturen')).not.toBeDisabled();
  });

  it('cannot be dismissed via Annuleren while a send is in flight', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

    await waitFor(() => expect(screen.getByTestId('drukker-versturen-annuleren')).toBeDisabled());
    fireEvent.click(screen.getByTestId('drukker-versturen-annuleren'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the required-field legend', () => {
    renderDialog();
    expect(screen.getByTestId('drukker-versturen-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
});
```

Two changes from the previous version of this file, both required because the component now also fetches `/api/instellingen/bedrijfsgegevens` on every mount (via `useApiRecord`) — without handling that URL, `buildDrukkerMail` would receive a garbage `bedrijfsgegevens` value once that fetch resolves and crash on the next render:
- A shared `defaultFetchImplementation` helper (used by `beforeEach` and reused by the two tests whose overrides don't need the bedrijfsgegevens branch spelled out again) returns `BEDRIJFSGEGEVENS_SEED` for `/api/instellingen/bedrijfsgegevens`. Every test-level `fetchMock.mockImplementation` override that fully replaces the mock (there are 4: "shows a distinct error...", "saves the zending archive record...", "archives the zending even when...", "disables Versturen as soon as the mail POST succeeds...") has an explicit `if (url === '/api/instellingen/bedrijfsgegevens') return { ok: true, json: async () => BEDRIJFSGEGEVENS_SEED };` branch added.
- The "disables Versturen once a mail has been sent..." test's call-count assertion now excludes the bedrijfsgegevens GET (`fetchMock.mock.calls.filter(...)`), since that call happens once on mount regardless of how many times Versturen is clicked — the assertion is about the *mail-sending* calls specifically, unaffected by the new unrelated fetch this component happens to also make. The "disables Versturen and shows a message when a selected bestelling has no matching klant" test drops its `expect(fetchMock).not.toHaveBeenCalled()` assertion for the same reason — the component now always fetches bedrijfsgegevens on mount regardless of the klant-ontbreekt state, so "no fetch happened" is no longer true and was never really what that test was checking (it's about Versturen being disabled, which the remaining assertions still cover).
- The "cannot be dismissed via Annuleren..." test's `fetchMock.mockImplementation(() => new Promise(() => {}))` is unchanged — every fetch (including bedrijfsgegevens) stays pending forever, `bedrijfsgegevens` state simply stays at `null` for the test's duration, and the component correctly falls back to `BEDRIJFSGEGEVENS_SEED` in that case (see Task 2 Step 3) — no crash, no test change needed there.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx`
Expected: FAIL — the mail payload doesn't yet contain the invoice footer (`mailCallPayload().body` doesn't contain `BEDRIJFSGEGEVENS_SEED.bezoekadres`), and `buildDrukkerMail` doesn't accept a `bedrijfsgegevens` field, so the component fails to typecheck/build once Task 1 is in place.

- [ ] **Step 3: Write the implementation**

In `src/components/beheer/VersturenNaarDrukkerDialog.tsx`, add two imports after the existing `import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';` line:

```ts
import { useApiRecord } from '@/lib/useApiRecord';
import { BEDRIJFSGEGEVENS_SEED } from '@/data/bedrijfsgegevensSeed';
```

Add a type import alongside the existing `import type { Klant } from './KlantenSection';` line:

```ts
import type { Bedrijfsgegevens } from './bedrijfsgegevensTypes';
```

Add one line right after `const { user } = useAdminAuth();`:

```ts
  const { data: bedrijfsgegevensData } = useApiRecord<Bedrijfsgegevens>('instellingen', 'bedrijfsgegevens');
  const bedrijfsgegevens = bedrijfsgegevensData ?? BEDRIJFSGEGEVENS_SEED;
```

Change the `mail` `useMemo` to pass `bedrijfsgegevens` through and include it in the dependency array:

```ts
  const mail = useMemo(
    () => buildDrukkerMail({ bestellingen, klanten, kunstwerken, materialen, maten, materiaalsoorten, bedrijfsgegevens }),
    [bestellingen, klanten, kunstwerken, materialen, maten, materiaalsoorten, bedrijfsgegevens]
  );
```

No other part of the file changes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx`
Expected: PASS — all tests green.

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npm test`
Expected: PASS — confirmed via `Grep` during planning that only `tests/lib/buildDrukkerMail.test.ts` and `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx` call `buildDrukkerMail`/render `VersturenNaarDrukkerDialog`, both already updated in Task 1/Task 2.

- [ ] **Step 6: Commit**

```bash
git add src/components/beheer/VersturenNaarDrukkerDialog.tsx tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx
git commit -m "feat: fetch and pass Glassart & Design bedrijfsgegevens into the drukker-mail"
```

---

## After both tasks: manual browser verification

Open the "Versturen naar drukker" dialog on a bestelling that's "Te versturen naar drukker" (`npm run dev`, log in as medewerker) and confirm the preview shows the invoice footer below the last klant's line cards: "Glassart & Design", the real bezoekadres/KVK-nummer/btw-nummer/e-mailadres from beheer's bedrijfsgegevens (not the seed placeholders, unless that record hasn't been filled in yet) — and that it appears only once even with multiple bestellingen from different klanten selected.
