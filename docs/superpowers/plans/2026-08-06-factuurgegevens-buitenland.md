# Factuurgegevens voor buitenlandse klanten — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Buitenlandse klanten kunnen een factuur van Glassart & Design betalen zonder navragen, en van EU-zakelijke klanten wordt het btw-nummer vastgelegd zodat verleggen later mogelijk wordt.

**Architecture:** Twee losse uitbreidingen op bestaande structuren. (1) `Bedrijfsgegevens` — het JSON-blob in `instellingen` — krijgt twee tekstvelden erbij, zichtbaar in één beheerscherm. (2) De tabel `klanten` krijgt een `btwNummer`-kolom, met één gedeelde validatiemodule (`src/lib/btwNummer.ts`) die door zowel client als server wordt aangeroepen, zodat de regels niet uit elkaar kunnen lopen.

**Tech Stack:** Next.js 14 App Router, TypeScript, raw `mysql2`, `next-intl`, Vitest + Testing Library.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-06-factuurgegevens-buitenland-design.md`. Lees die eerst.
- **De btw-berekening op bestellingen verandert niet.** Geen reverse charge, geen VIES-koppeling, geen blokkade bij klantgoedkeuring. Alleen vastleggen.
- **Verplicht alleen bij registratie.** In beheer en op de accountpagina is een leeg btw-nummer altijd toegestaan — er staan bestaande EU-klanten zonder nummer in de database die anders onopslaanbaar worden. Formaatvalidatie geldt overal.
- De verplichting kijkt naar `land` (vestigingsland), nooit naar `invoiceLand`.
- **De `beheer`-namespace bestaat alleen in `messages/nl.json`** — `en/de/fr.json` hebben geen `beheer`-sectie. Beheer-sleutels dus alleen in `nl.json`; klantgerichte sleutels (`registrationPage`, `accountPage.settings`) in alle vier de bestanden, met echte vertalingen, nooit Nederlandse tekst als plaatsvervanger.
- Tests draaien tegen de gedeelde **staging**-database. Cleanup blijft gescoped op exact de rijen die de test zelf aanmaakt (`@example.com`-adressen). Nooit een blanket `DELETE FROM` / `TRUNCATE`.
- De productiemigratie wordt in dit plan **niet** uitgevoerd — daar is per keer expliciete toestemming van de gebruiker voor nodig (zie Task 3, laatste stap).

---

## File Structure

**Nieuw:**
- `src/lib/btwNummer.ts` — normalisatie, EU-check, verplicht-regel, formaatvalidatie. Geen React, geen server-imports, zodat client én server hem kunnen importeren.
- `tests/lib/btwNummer.test.ts`
- `db/migrations/2026-08-06-klant-btwnummer.sql`

**Gewijzigd:**
- `src/data/landen.ts` — `EU_LANDCODES` erbij
- `src/components/beheer/bedrijfsgegevensTypes.ts`, `src/data/bedrijfsgegevensSeed.ts`, `src/components/beheer/GlassartDesignSection.tsx`
- `db/schema.sql`, `src/lib/server/klantFields.ts`
- `src/app/api/auth/register/route.ts`, `src/app/api/klanten/me/route.ts`, `src/app/api/klanten/[id]/route.ts`
- `src/components/RegistrationForm.tsx`
- `src/components/beheer/KlantenSection.tsx`, `src/components/beheer/KlantModal.tsx`
- `src/components/account/SettingsSection.tsx`
- `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json`

**Volgorde:** Task 1 en Task 2 zijn onafhankelijk van elkaar. Task 3 hangt af van Task 1. Tasks 4, 5 en 6 hangen af van Task 1 en Task 3.

---

### Task 1: Btw-validatiemodule

**Files:**
- Create: `src/lib/btwNummer.ts`
- Create: `tests/lib/btwNummer.test.ts`
- Modify: `src/data/landen.ts` (toevoegen na de `LAND_OPTIONS`-export, onderaan)

**Interfaces:**
- Consumes: niets uit eerdere taken.
- Produces:
  - `EU_LANDCODES: ReadonlySet<string>` uit `@/data/landen`
  - `normaliseerBtwNummer(waarde: string): string`
  - `isEuLand(landcode: string | null | undefined): boolean`
  - `isBtwNummerVerplicht(landcode: string | null | undefined): boolean`
  - `valideerBtwNummer(waarde: string | null | undefined, landcode: string | null | undefined): BtwValidatie`
  - `type BtwValidatie = 'ok' | 'leeg' | 'ongeldig'`

  Let op de rolverdeling: `valideerBtwNummer` zegt nooit iets over verplichting — het geeft `'leeg'` terug en de aanroeper beslist of dat erg is, met `isBtwNummerVerplicht`. Zo staat de EU∖NL-regel op precies één plek.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/btwNummer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EU_LANDCODES } from '@/data/landen';
import {
  normaliseerBtwNummer,
  isEuLand,
  isBtwNummerVerplicht,
  valideerBtwNummer,
  BTW_PATRONEN,
} from '@/lib/btwNummer';

const GELDIG: Record<string, string> = {
  AT: 'ATU13585627',
  BE: 'BE0411905847',
  BG: 'BG175074752',
  CY: 'CY10259033P',
  CZ: 'CZ25123891',
  DE: 'DE811907980',
  DK: 'DK13585628',
  EE: 'EE100594102',
  ES: 'ESA58818501',
  FI: 'FI09853608',
  FR: 'FR40303265045',
  GR: 'EL094259216',
  HR: 'HR33392005961',
  HU: 'HU12892312',
  IE: 'IE6388047V',
  IT: 'IT00743110157',
  LT: 'LT100001919017',
  LU: 'LU26375245',
  LV: 'LV40003032949',
  MT: 'MT11679112',
  NL: 'NL123456789B01',
  PL: 'PL5260001246',
  PT: 'PT502011378',
  RO: 'RO14399840',
  SE: 'SE556188840401',
  SI: 'SI50223054',
  SK: 'SK2020317068',
};

describe('normaliseerBtwNummer', () => {
  it('strips spaces, dots and hyphens and uppercases', () => {
    expect(normaliseerBtwNummer(' nl 1234.567-89 b01 ')).toBe('NL123456789B01');
  });

  it('keeps the + and * characters an Irish VAT number may contain', () => {
    expect(normaliseerBtwNummer('ie 6a+8047 v')).toBe('IE6A+8047V');
  });
});

describe('isEuLand', () => {
  it('recognises EU member states', () => {
    expect(isEuLand('BE')).toBe(true);
    expect(isEuLand('NL')).toBe(true);
  });

  it('rejects non-EU countries and empty input', () => {
    expect(isEuLand('CH')).toBe(false);
    expect(isEuLand('US')).toBe(false);
    expect(isEuLand('GB')).toBe(false);
    expect(isEuLand('')).toBe(false);
    expect(isEuLand(null)).toBe(false);
  });
});

describe('isBtwNummerVerplicht', () => {
  it('is required for EU countries other than the Netherlands', () => {
    expect(isBtwNummerVerplicht('BE')).toBe(true);
    expect(isBtwNummerVerplicht('DE')).toBe(true);
  });

  it('is not required for the Netherlands or outside the EU', () => {
    expect(isBtwNummerVerplicht('NL')).toBe(false);
    expect(isBtwNummerVerplicht('CH')).toBe(false);
    expect(isBtwNummerVerplicht(null)).toBe(false);
  });
});

describe('valideerBtwNummer', () => {
  it('accepts a valid number for every EU country', () => {
    for (const [code, nummer] of Object.entries(GELDIG)) {
      expect(valideerBtwNummer(nummer, code), `${code} ${nummer}`).toBe('ok');
    }
  });

  // Four extra digits, not two: BG, CZ and RO have variable-length patterns where a
  // two-digit suffix can still land inside the allowed range and stay valid.
  it('rejects an over-long number for every EU country', () => {
    for (const [code, nummer] of Object.entries(GELDIG)) {
      expect(valideerBtwNummer(`${nummer}0000`, code), `${code} te lang`).toBe('ongeldig');
    }
  });

  it('uses the EL prefix for Greece even though the ISO code is GR', () => {
    expect(valideerBtwNummer('EL094259216', 'GR')).toBe('ok');
    expect(valideerBtwNummer('GR094259216', 'GR')).toBe('ongeldig');
  });

  it('accepts a number typed without its country prefix', () => {
    expect(valideerBtwNummer('123456789B01', 'NL')).toBe('ok');
    expect(valideerBtwNummer('094259216', 'GR')).toBe('ok');
  });

  it('accepts a number typed with spaces and dots', () => {
    expect(valideerBtwNummer('NL 1234.567.89 B01', 'NL')).toBe('ok');
  });

  it('rejects a number carrying another EU country prefix', () => {
    expect(valideerBtwNummer('NL123456789B01', 'BE')).toBe('ongeldig');
  });

  it('reports empty input as leeg, never as ongeldig', () => {
    expect(valideerBtwNummer('', 'BE')).toBe('leeg');
    expect(valideerBtwNummer('   ', 'NL')).toBe('leeg');
    expect(valideerBtwNummer(null, 'CH')).toBe('leeg');
    expect(valideerBtwNummer(undefined, 'BE')).toBe('leeg');
  });

  it('accepts any non-empty value outside the EU, since there is no format to check', () => {
    expect(valideerBtwNummer('CHE-116.281.710 MWST', 'CH')).toBe('ok');
    expect(valideerBtwNummer('12-3456789', 'US')).toBe('ok');
    expect(valideerBtwNummer('whatever', '')).toBe('ok');
  });
});

describe('EU_LANDCODES and BTW_PATRONEN stay in sync', () => {
  it('has exactly 27 member states', () => {
    expect(EU_LANDCODES.size).toBe(27);
  });

  it('has a pattern for every EU country and no orphan patterns', () => {
    expect(Object.keys(BTW_PATRONEN).sort()).toEqual([...EU_LANDCODES].sort());
  });

  it('only lists country codes that exist in LANDEN', async () => {
    const { LANDEN } = await import('@/data/landen');
    const bekend = new Set(LANDEN.map((land) => land.code));
    for (const code of EU_LANDCODES) {
      expect(bekend.has(code), `${code} ontbreekt in LANDEN`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/lib/btwNummer.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/btwNummer"` and `EU_LANDCODES` is not exported from `@/data/landen`.

- [ ] **Step 3: Add EU_LANDCODES to landen.ts**

Append to the end of `src/data/landen.ts`, after the existing `landNaam` function:

```ts
// The 27 EU member states, by ISO 3166-1 alpha-2 code. Used to decide whether a klant
// needs a VAT number and which format to validate it against. Note that the VAT prefix
// is not always the ISO code -- Greece is GR here but EL on a VAT number (see BTW_PREFIX
// in src/lib/btwNummer.ts). Keep in sync with BTW_PATRONEN: every code here needs a pattern.
export const EU_LANDCODES: ReadonlySet<string> = new Set([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU',
  'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
]);
```

- [ ] **Step 4: Write the validation module**

Create `src/lib/btwNummer.ts`:

```ts
import { EU_LANDCODES } from '@/data/landen';

export type BtwValidatie = 'ok' | 'leeg' | 'ongeldig';

// Greece is the one member state whose VAT prefix differs from its ISO country code.
const BTW_PREFIX: Record<string, string> = { GR: 'EL' };

// Format per member state, prefix included, matched against the normalised value.
export const BTW_PATRONEN: Record<string, RegExp> = {
  AT: /^ATU\d{8}$/,
  BE: /^BE[01]\d{9}$/,
  BG: /^BG\d{9,10}$/,
  CY: /^CY\d{8}[A-Z]$/,
  CZ: /^CZ\d{8,10}$/,
  DE: /^DE\d{9}$/,
  DK: /^DK\d{8}$/,
  EE: /^EE\d{9}$/,
  ES: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/,
  FI: /^FI\d{8}$/,
  FR: /^FR[A-Z0-9]{2}\d{9}$/,
  GR: /^EL\d{9}$/,
  HR: /^HR\d{11}$/,
  HU: /^HU\d{8}$/,
  IE: /^IE(\d{7}[A-Z]{1,2}|\d[A-Z0-9+*]\d{5}[A-Z])$/,
  IT: /^IT\d{11}$/,
  LT: /^LT(\d{9}|\d{12})$/,
  LU: /^LU\d{8}$/,
  LV: /^LV\d{11}$/,
  MT: /^MT\d{8}$/,
  NL: /^NL\d{9}B\d{2}$/,
  PL: /^PL\d{10}$/,
  PT: /^PT\d{9}$/,
  RO: /^RO\d{2,10}$/,
  SE: /^SE\d{12}$/,
  SI: /^SI\d{8}$/,
  SK: /^SK\d{10}$/,
};

// Uppercase and drop the separators people type (spaces, dots, hyphens, slashes).
// + and * survive on purpose: an Irish VAT number may legitimately contain them.
export function normaliseerBtwNummer(waarde: string): string {
  return waarde.toUpperCase().replace(/[^A-Z0-9+*]/g, '');
}

export function isEuLand(landcode: string | null | undefined): boolean {
  return EU_LANDCODES.has((landcode ?? '').toUpperCase());
}

// A Dutch klant is billed with Dutch VAT, so their number is nice to have but not needed.
// Outside the EU there is no VAT number to ask for. Everywhere else we need it to be able
// to shift the VAT ("btw verlegd") instead of paying it ourselves.
export function isBtwNummerVerplicht(landcode: string | null | undefined): boolean {
  const code = (landcode ?? '').toUpperCase();
  return isEuLand(code) && code !== 'NL';
}

export function valideerBtwNummer(
  waarde: string | null | undefined,
  landcode: string | null | undefined
): BtwValidatie {
  const genormaliseerd = normaliseerBtwNummer(waarde ?? '');
  if (genormaliseerd === '') return 'leeg';

  const code = (landcode ?? '').toUpperCase();
  // No worldwide format exists, so anything non-empty is accepted outside the EU --
  // better than blocking a Swiss or American klant on a format we cannot know.
  if (!isEuLand(code)) return 'ok';

  const prefix = BTW_PREFIX[code] ?? code;
  const metPrefix = genormaliseerd.startsWith(prefix) ? genormaliseerd : prefix + genormaliseerd;
  return BTW_PATRONEN[code].test(metPrefix) ? 'ok' : 'ongeldig';
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run tests/lib/btwNummer.test.ts
```

Expected: PASS, all tests green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/btwNummer.ts tests/lib/btwNummer.test.ts src/data/landen.ts
git commit -m "feat: add shared EU VAT number validation module"
```

---

### Task 2: Tenaamstelling en BIC in bedrijfsgegevens

Onafhankelijk van Task 1 — kan parallel.

**Files:**
- Modify: `src/components/beheer/bedrijfsgegevensTypes.ts:12-21`
- Modify: `src/data/bedrijfsgegevensSeed.ts:3-9`
- Modify: `src/components/beheer/GlassartDesignSection.tsx:209-218`
- Modify: `messages/nl.json` (rond regel 727, bij `glassartDesignLabelIban`)
- Test: `tests/components/beheer/GlassartDesignSection.test.tsx`

**Interfaces:**
- Consumes: niets.
- Produces: `Bedrijfsgegevens` heeft twee extra verplichte string-velden, `tenaamstelling` en `bic`. Elke andere plek die een `Bedrijfsgegevens`-object letterlijk construeert moet ze meegeven (dat zijn alleen de seed en de testfixtures).

- [ ] **Step 1: Write the failing test**

In `tests/components/beheer/GlassartDesignSection.test.tsx`, voeg de twee velden toe aan de fixture `BEDRIJFSGEGEVENS` (na `whatsappNummer`, vóór `iban`):

```ts
  tenaamstelling: 'Glassart & Design',
  bic: 'BANKNL2A',
```

En voeg twee assertions toe binnen de bestaande test `'pre-fills the form fields from bedrijfsgegevens'`, direct vóór de bestaande `iban`-assertion:

```ts
    expect(screen.getByTestId('glassart-design-tenaamstelling')).toHaveValue('Glassart & Design');
    expect(screen.getByTestId('glassart-design-bic')).toHaveValue('BANKNL2A');
```

En voeg deze nieuwe test toe aan het einde van het `describe`-blok, direct vóór de afsluitende `});`:

```ts
  it('saves an edited tenaamstelling and bic', async () => {
    const { onSave } = renderSection();
    fireEvent.change(screen.getByTestId('glassart-design-tenaamstelling'), {
      target: { value: 'Glassart & Design B.V.' },
    });
    fireEvent.change(screen.getByTestId('glassart-design-bic'), {
      target: { value: 'RABONL2U' },
    });
    fireEvent.click(screen.getByTestId('glassart-design-opslaan'));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ tenaamstelling: 'Glassart & Design B.V.', bic: 'RABONL2U' })
      )
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/components/beheer/GlassartDesignSection.test.tsx
```

Expected: FAIL — `Unable to find an element by: [data-testid="glassart-design-tenaamstelling"]`, plus een TypeScript-fout op de fixture (`tenaamstelling` bestaat niet op `Bedrijfsgegevens`).

- [ ] **Step 3: Extend the type and the seed**

In `src/components/beheer/bedrijfsgegevensTypes.ts`, binnen `interface Bedrijfsgegevens`, direct ná `whatsappNummer` en vóór `iban`:

```ts
  tenaamstelling: string;
  bic: string;
```

In `src/data/bedrijfsgegevensSeed.ts`, op dezelfde plek in het object (ná `whatsappNummer`, vóór `iban`):

```ts
  tenaamstelling: 'Glassart & Design',
  bic: 'BANKNL2A',
```

- [ ] **Step 4: Add the two inputs to the beheer screen**

In `src/components/beheer/GlassartDesignSection.tsx`, vervang het bestaande IBAN-label (regels 209-218) door drie labels in factuurvolgorde:

```tsx
      <label className={LABEL_CLASS}>
        {t('glassartDesignLabelTenaamstelling')}
        <input
          type="text"
          value={form.tenaamstelling}
          onChange={(event) => updateField('tenaamstelling', event.target.value)}
          data-testid="glassart-design-tenaamstelling"
          className={INPUT_CLASS}
        />
      </label>

      <label className={LABEL_CLASS}>
        {t('glassartDesignLabelIban')}
        <input
          type="text"
          value={form.iban}
          onChange={(event) => updateField('iban', event.target.value)}
          data-testid="glassart-design-iban"
          className={INPUT_CLASS}
        />
      </label>

      <label className={LABEL_CLASS}>
        {t('glassartDesignLabelBic')}
        <input
          type="text"
          value={form.bic}
          onChange={(event) => updateField('bic', event.target.value)}
          data-testid="glassart-design-bic"
          className={INPUT_CLASS}
        />
      </label>
```

Geen validatie op de BIC — zie de spec, sectie A.

- [ ] **Step 5: Add the two labels to nl.json**

In `messages/nl.json`, in de `beheer`-sectie, direct vóór `"glassartDesignLabelIban"`:

```json
    "glassartDesignLabelTenaamstelling": "Tenaamstelling",
```

En direct ná `"glassartDesignLabelIban"`:

```json
    "glassartDesignLabelBic": "BIC / SWIFT",
```

Alleen `nl.json` — `en/de/fr.json` hebben geen `beheer`-sectie.

- [ ] **Step 6: Run the test to verify it passes**

```bash
npx vitest run tests/components/beheer/GlassartDesignSection.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Check for other Bedrijfsgegevens literals**

```bash
grep -rn "whatsappNummer" src tests --include=*.ts --include=*.tsx
```

Expected: alleen `bedrijfsgegevensTypes.ts`, `bedrijfsgegevensSeed.ts`, `GlassartDesignSection.tsx`, `ContactInfo.tsx` en de al bijgewerkte testfixtures. Construeert een ander bestand een compleet `Bedrijfsgegevens`-object, vul daar ook `tenaamstelling` en `bic` in. `ContactInfo.tsx` leest alleen bestaande velden en toont de nieuwe bewust niet — daar hoeft niets te veranderen.

- [ ] **Step 8: Typecheck and commit**

```bash
npx tsc --noEmit
```

Expected: geen fouten.

```bash
git add src/components/beheer/bedrijfsgegevensTypes.ts src/data/bedrijfsgegevensSeed.ts src/components/beheer/GlassartDesignSection.tsx messages/nl.json tests/components/beheer/GlassartDesignSection.test.tsx
git commit -m "feat: add tenaamstelling and BIC to bedrijfsgegevens"
```

---

### Task 3: Btw-nummer in database en API

Hangt af van Task 1.

**Files:**
- Create: `db/migrations/2026-08-06-klant-btwnummer.sql`
- Modify: `db/schema.sql:7` (na de `kvk`-kolom)
- Modify: `src/lib/server/klantFields.ts:8` (na `'kvk'`)
- Modify: `src/app/api/auth/register/route.ts`
- Modify: `src/app/api/klanten/me/route.ts`
- Modify: `src/app/api/klanten/[id]/route.ts`
- Create: `src/lib/server/btwNummerCheck.ts`
- Test: `tests/app/api/klanten-me.test.ts`, `tests/app/api/auth/customer-auth.test.ts`

**Interfaces:**
- Consumes: `valideerBtwNummer`, `isBtwNummerVerplicht` uit `@/lib/btwNummer` (Task 1).
- Produces:
  - Kolom `klanten.btwNummer VARCHAR(20)`, nullable.
  - `'btwNummer'` in `SELF_EDITABLE_KLANT_FIELDS`.
  - `checkBtwNummerUpdate(updates: Record<string, unknown>, klantId: string): Promise<'ok' | 'ongeldig'>` uit `@/lib/server/btwNummerCheck` — bepaalt zelf het effectieve land en wordt door beide PATCH-routes gebruikt.
  - API-foutcodes: `{ error: 'btwnummer-verplicht' }` en `{ error: 'btwnummer-ongeldig' }`, beide status 400.

- [ ] **Step 1: Write the failing test**

Voeg toe aan `tests/app/api/klanten-me.test.ts`, binnen het bestaande `describe`-blok. Het bestand heeft al `req(method, body, cookie)`, `createKlantWithCookie(overrides)` en een `afterEach` die opruimt op de verzamelde ids in `createdKlantIds` — hergebruik die en verzin geen nieuwe cleanup-strategie. `createKlantWithCookie` zet zelf al een `@example.com`-adres, dus elke klant die deze tests maken wordt automatisch opgeruimd.

```ts
  it('accepts and stores a valid btwNummer in normalised form', async () => {
    const { klant, cookie } = await createKlantWithCookie({ land: 'BE' });
    const response = await patchMe(req('PATCH', { btwNummer: 'BE 0411.905.847' }, cookie));
    expect(response.status).toBe(200);
    const [rows] = await getPool().query('SELECT btwNummer FROM klanten WHERE id = ?', [klant.id]);
    expect((rows as Array<{ btwNummer: string }>)[0].btwNummer).toBe('BE0411905847');
  });

  it('rejects a btwNummer that does not match the country format', async () => {
    const { cookie } = await createKlantWithCookie({ land: 'BE' });
    const response = await patchMe(req('PATCH', { btwNummer: 'NL123456789B01' }, cookie));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'btwnummer-ongeldig' });
  });

  it('validates against the land in the same request when it is being changed too', async () => {
    const { cookie } = await createKlantWithCookie({ land: 'NL' });
    const response = await patchMe(
      req('PATCH', { land: 'BE', btwNummer: 'NL123456789B01' }, cookie)
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'btwnummer-ongeldig' });
  });

  it('stores an empty btwNummer as null, so an existing EU klant stays saveable', async () => {
    const { klant, cookie } = await createKlantWithCookie({
      land: 'BE',
      btwNummer: 'BE0411905847',
    });
    const response = await patchMe(req('PATCH', { btwNummer: '' }, cookie));
    expect(response.status).toBe(200);
    const [rows] = await getPool().query('SELECT btwNummer FROM klanten WHERE id = ?', [klant.id]);
    expect((rows as Array<{ btwNummer: string | null }>)[0].btwNummer).toBeNull();
  });
```

De derde test dekt de "land uit het verzoek zelf"-tak van `checkBtwNummerUpdate`; de eerste twee dekken de fallback naar het opgeslagen land, omdat hun body geen `land` bevat.

En voeg de registratiekant toe aan `tests/app/api/auth/customer-auth.test.ts`, met de bestaande `register`- en `jsonRequest`-helpers van dat bestand:

```ts
  it('refuses to register an EU klant outside NL without a btwNummer', async () => {
    const response = await register(
      jsonRequest({
        email: 'geen-btw@example.com',
        password: 'geheim123',
        companyName: 'Brussels Hotel',
        land: 'BE',
      })
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'btwnummer-verplicht' });
  });

  it('refuses to register a btwNummer in the wrong format', async () => {
    const response = await register(
      jsonRequest({
        email: 'fout-btw@example.com',
        password: 'geheim123',
        companyName: 'Brussels Hotel',
        land: 'BE',
        btwNummer: 'NL123456789B01',
      })
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'btwnummer-ongeldig' });
  });

  it('registers a klant outside the EU without a btwNummer', async () => {
    const response = await register(
      jsonRequest({
        email: 'zwitser@example.com',
        password: 'geheim123',
        companyName: 'Zürich Hotel',
        land: 'CH',
      })
    );
    expect(response.status).toBe(201);
  });

  it('stores the registered btwNummer in normalised form', async () => {
    const response = await register(
      jsonRequest({
        email: 'belg@example.com',
        password: 'geheim123',
        companyName: 'Brussels Hotel',
        land: 'BE',
        btwNummer: 'be 0411.905.847',
      })
    );
    expect(response.status).toBe(201);
    const [rows] = await getPool().query('SELECT btwNummer FROM klanten WHERE email = ?', [
      'belg@example.com',
    ]);
    expect((rows as Array<{ btwNummer: string }>)[0].btwNummer).toBe('BE0411905847');
  });
```

Alle vier gebruiken een `@example.com`-adres en vallen daarmee onder de bestaande `afterEach`-cleanup van dat bestand. De bestaande registratietests sturen geen `land` mee; met `land` afwezig is `isBtwNummerVerplicht(null)` onwaar, dus die blijven ongewijzigd slagen.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/app/api/klanten-me.test.ts tests/app/api/auth/customer-auth.test.ts
```

Expected: FAIL — `Unknown column 'btwNummer' in 'field list'`.

- [ ] **Step 3: Write the migration and update the schema**

Create `db/migrations/2026-08-06-klant-btwnummer.sql`:

```sql
-- Migration for klant btwNummer (2026-08-06)
-- Run once against a database still on the pre-migration schema.
-- Nullable on purpose: existing klanten have no VAT number yet, and klanten outside
-- the EU have none at all. VARCHAR(20) covers the longest EU format (SE + 12 digits).
ALTER TABLE klanten ADD COLUMN btwNummer VARCHAR(20) AFTER kvk;
```

In `db/schema.sql`, in `CREATE TABLE klanten`, direct ná de `kvk`-regel:

```sql
  btwNummer VARCHAR(20),
```

- [ ] **Step 4: Apply the migration to staging**

De testsuite praat met de gedeelde staging-database, dus de kolom moet daar bestaan voordat de tests kunnen slagen.

Schrijf het scriptje naar een bestand in plaats van `node -e` — het bevat aanhalingstekens die in een shell-oneliner sneuvelen.

```bash
cat > /tmp/migrate-btwnummer.js <<'EOF'
require('dotenv').config({ path: '.env.local' });
const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  await c.query('ALTER TABLE klanten ADD COLUMN btwNummer VARCHAR(20) AFTER kvk');
  const [rows] = await c.query("SHOW COLUMNS FROM klanten LIKE 'btwNummer'");
  console.log(rows);
  await c.end();
})();
EOF
node /tmp/migrate-btwnummer.js
```

Expected: één rij met `Field: 'btwNummer'`, `Type: 'varchar(20)'`, `Null: 'YES'`. Draai dit één keer — een tweede run faalt met `Duplicate column name 'btwNummer'`, wat betekent dat de migratie al gelukt is.

Dit is **staging**. De productiedatabase blijft in dit plan ongemoeid — zie de laatste stap van deze taak.

- [ ] **Step 5: Add the field to the allowlist**

In `src/lib/server/klantFields.ts`, in `SELF_EDITABLE_KLANT_FIELDS`, direct ná `'kvk'`:

```ts
  'btwNummer',
```

- [ ] **Step 6: Write the shared server-side check**

Create `src/lib/server/btwNummerCheck.ts`:

```ts
import { getRow } from '@/lib/server/crud';
import { normaliseerBtwNummer, valideerBtwNummer } from '@/lib/btwNummer';

// Shared by both PATCH routes (/api/klanten/me and /api/klanten/[id]). Validates
// btwNummer against the *effective* land: the one in this request if it is being changed,
// otherwise the one already stored. Without that fallback, a request changing only the
// VAT number would have no country to validate against.
//
// Mutates `updates` to store the normalised value, so the database never ends up with
// two spellings of the same number.
//
// An empty value is always allowed here -- the "required for EU klanten" rule applies at
// registration only, because existing EU klanten have no number yet and would otherwise
// become unsaveable. See the spec, section D.
export async function checkBtwNummerUpdate(
  updates: Record<string, unknown>,
  klantId: string
): Promise<'ok' | 'ongeldig'> {
  if (!('btwNummer' in updates)) return 'ok';

  const ruwe = typeof updates.btwNummer === 'string' ? updates.btwNummer : '';
  const genormaliseerd = normaliseerBtwNummer(ruwe);
  if (genormaliseerd === '') {
    updates.btwNummer = null;
    return 'ok';
  }

  let land = typeof updates.land === 'string' ? updates.land : null;
  if (land === null) {
    const klant = await getRow<Record<string, unknown>>('klanten', klantId);
    land = typeof klant?.land === 'string' ? klant.land : null;
  }

  if (valideerBtwNummer(genormaliseerd, land) === 'ongeldig') return 'ongeldig';
  updates.btwNummer = genormaliseerd;
  return 'ok';
}
```

- [ ] **Step 7: Wire the check into the two PATCH routes**

In `src/app/api/klanten/me/route.ts`, voeg de import toe:

```ts
import { checkBtwNummerUpdate } from '@/lib/server/btwNummerCheck';
```

En in `PATCH`, direct ná de `for`-lus die `updates` vult en vóór het `password`-blok:

```ts
  if ((await checkBtwNummerUpdate(updates, klantId)) === 'ongeldig') {
    return NextResponse.json({ error: 'btwnummer-ongeldig' }, { status: 400 });
  }
```

In `src/app/api/klanten/[id]/route.ts`, voeg de import toe:

```ts
import { checkBtwNummerUpdate } from '@/lib/server/btwNummerCheck';
```

En in `PATCH`, tussen `const data = await request.json();` en `await updateRow(...)`:

```ts
    if ((await checkBtwNummerUpdate(data, params.id)) === 'ongeldig') {
      return NextResponse.json({ error: 'btwnummer-ongeldig' }, { status: 400 });
    }
```

- [ ] **Step 8: Add validation to the register route**

Dit is de enige plek waar een leeg btw-nummer een fout is. In `src/app/api/auth/register/route.ts`, voeg de import toe:

```ts
import { isBtwNummerVerplicht, normaliseerBtwNummer, valideerBtwNummer } from '@/lib/btwNummer';
```

En direct ná de `for`-lus die `fields` vult, vóór het `try`-blok:

```ts
  // Registration is the one place where a missing VAT number is fatal: an EU business
  // customer outside NL cannot be invoiced correctly without one. Editing an existing
  // klant deliberately does not enforce this -- see the spec, section D.
  const land = typeof fields.land === 'string' ? fields.land : null;
  const btwNummer = normaliseerBtwNummer(typeof fields.btwNummer === 'string' ? fields.btwNummer : '');
  if (btwNummer === '') {
    if (isBtwNummerVerplicht(land)) {
      return NextResponse.json({ error: 'btwnummer-verplicht' }, { status: 400 });
    }
    fields.btwNummer = null;
  } else {
    if (valideerBtwNummer(btwNummer, land) === 'ongeldig') {
      return NextResponse.json({ error: 'btwnummer-ongeldig' }, { status: 400 });
    }
    fields.btwNummer = btwNummer;
  }
```

- [ ] **Step 9: Run the tests to verify they pass**

```bash
npx vitest run tests/app/api/klanten-me.test.ts tests/app/api/auth/customer-auth.test.ts tests/app/api/klanten.test.ts
```

Expected: PASS. `klanten.test.ts` draait mee omdat het de `PATCH /api/klanten/[id]`-route raakt die in stap 7 is gewijzigd.

- [ ] **Step 10: Commit**

```bash
git add db/schema.sql db/migrations/2026-08-06-klant-btwnummer.sql src/lib/server/klantFields.ts src/lib/server/btwNummerCheck.ts src/app/api/auth/register/route.ts src/app/api/klanten/me/route.ts "src/app/api/klanten/[id]/route.ts" tests/app/api/klanten-me.test.ts tests/app/api/auth/customer-auth.test.ts
git commit -m "feat: store and validate klant btwNummer server-side"
```

- [ ] **Step 11: Note the production migration — do not run it**

De productiedatabase krijgt deze kolom pas wanneer deze code naar productie gaat, en pas ná expliciete toestemming van de gebruiker. Vraag die toestemming niet nu, maar noem in het eindverslag van deze taak dat `db/migrations/2026-08-06-klant-btwnummer.sql` nog op productie moet draaien. Een nullable kolom toevoegen is onschadelijk voor de nu draaiende productiecode, maar de volgorde blijft: staging eerst, verifiëren, dan pas productie.

---

### Task 4: Btw-nummer op het registratieformulier

Hangt af van Task 1 en Task 3.

**Files:**
- Modify: `src/components/RegistrationForm.tsx`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json` (in `registrationPage`, bij `labelKvk`)
- Test: `tests/components/RegistrationForm.test.tsx`

**Interfaces:**
- Consumes: `isBtwNummerVerplicht`, `valideerBtwNummer` uit `@/lib/btwNummer`; API-foutcodes uit Task 3.
- Produces: veld `data-testid="word-klant-btwnummer"`, foutmelding `data-testid="word-klant-btwnummer-error"`.

- [ ] **Step 1: Write the failing test**

Voeg toe aan `tests/components/RegistrationForm.test.tsx`, binnen het bestaande `describe`-blok. Het bestand heeft al `renderForm()`, `fillRequiredFields()` en `fetchMock`; hergebruik die. De land-combobox wordt in dat bestand bediend met focus → change → klik op de optie (zie de bestaande test `'includes land and invoiceLand in the POST body'`), dus voeg bovenaan het bestand deze helper toe, naast `fillRequiredFields`:

```ts
function kiesLand(naam: string, code: string) {
  fireEvent.focus(screen.getByTestId('word-klant-land'));
  fireEvent.change(screen.getByTestId('word-klant-land'), { target: { value: naam } });
  fireEvent.click(screen.getByTestId(`word-klant-land-option-${code}`));
}
```

En de testgevallen:

```ts
  it('marks btwNummer as required for an EU country other than NL', () => {
    renderForm();
    kiesLand('België', 'BE');
    expect(screen.getByTestId('word-klant-btwnummer')).toBeRequired();
  });

  it('does not mark btwNummer as required for NL', () => {
    renderForm();
    expect(screen.getByTestId('word-klant-btwnummer')).not.toBeRequired();
  });

  it('does not mark btwNummer as required outside the EU', () => {
    renderForm();
    kiesLand('Zwitserland', 'CH');
    expect(screen.getByTestId('word-klant-btwnummer')).not.toBeRequired();
  });

  it('blocks submission with an empty btwNummer for an EU country other than NL', () => {
    renderForm();
    fillRequiredFields();
    kiesLand('België', 'BE');
    fireEvent.submit(screen.getByTestId('word-klant-submit').closest('form')!);
    expect(screen.getByTestId('word-klant-btwnummer-error')).toHaveTextContent(
      'Voor zakelijke klanten binnen de EU is een btw-nummer verplicht.'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('blocks submission with a wrongly formatted btwNummer', () => {
    renderForm();
    fillRequiredFields();
    kiesLand('België', 'BE');
    fireEvent.change(screen.getByTestId('word-klant-btwnummer'), {
      target: { value: 'NL123456789B01' },
    });
    fireEvent.submit(screen.getByTestId('word-klant-submit').closest('form')!);
    expect(screen.getByTestId('word-klant-btwnummer-error')).toHaveTextContent(
      'Dit btw-nummer heeft niet het juiste formaat voor het gekozen land.'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('submits the normalised btwNummer', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderForm();
    fillRequiredFields();
    kiesLand('België', 'BE');
    fireEvent.change(screen.getByTestId('word-klant-btwnummer'), {
      target: { value: 'be 0411.905.847' },
    });
    fireEvent.submit(screen.getByTestId('word-klant-submit').closest('form')!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.btwNummer).toBe('BE0411905847');
  });
```

De bestaande test `'POSTs to /api/auth/register with the form data and shows the confirmation screen'` vergelijkt de body met een letterlijke `JSON.stringify`. Die faalt zodra `btwNummer` in de body verschijnt — voeg `btwNummer: ''` toe op de plek waar het veld in de body-literal van `RegistrationForm.tsx` staat (direct ná `kvk`), anders klopt de sleutelvolgorde niet.

Deze tests gebruiken `fireEvent.submit` op het formulier, niet een klik op de knop. Dat slaat de HTML-constraint-validatie over, zodat de expliciete JS-check in `handleSubmit` daadwerkelijk wordt uitgevoerd en de vertaalde foutmelding zichtbaar wordt.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/components/RegistrationForm.test.tsx
```

Expected: FAIL — `Unable to find an element by: [data-testid="word-klant-btwnummer"]`.

- [ ] **Step 3: Add the field and the validation**

In `src/components/RegistrationForm.tsx`:

Voeg toe aan de imports:

```tsx
import { isBtwNummerVerplicht, normaliseerBtwNummer, valideerBtwNummer } from '@/lib/btwNummer';
```

Voeg een state-variabele toe, direct ná `const [submitError, setSubmitError] = useState<string | null>(null);`:

```tsx
  const [btwNummerError, setBtwNummerError] = useState<string | null>(null);
```

In `handleSubmit`, direct ná `setPasswordError(null); setSubmitError(null);`:

```tsx
    const btwNummerRuw = (formData.get('btwNummer') as string) ?? '';
    const btwNummer = normaliseerBtwNummer(btwNummerRuw);
    if (btwNummer === '' && isBtwNummerVerplicht(land)) {
      setBtwNummerError(t('btwNummerVerplicht'));
      return;
    }
    if (btwNummer !== '' && valideerBtwNummer(btwNummer, land) === 'ongeldig') {
      setBtwNummerError(t('btwNummerOngeldig'));
      return;
    }
    setBtwNummerError(null);
```

Voeg het veld toe aan de request-body, direct ná de `kvk`-regel:

```tsx
          btwNummer,
```

En voeg het invoerveld toe direct ná het bestaande KvK-`<label>` (dat eindigt op regel 114):

```tsx
      <label className={labelClassName}>
        <span>
          {t('labelBtwNummer')}
          {isBtwNummerVerplicht(land) && <RequiredMark />}
        </span>
        <input
          type="text"
          name="btwNummer"
          required={isBtwNummerVerplicht(land)}
          data-testid="word-klant-btwnummer"
          className={fieldClassName}
        />
      </label>

      {btwNummerError && (
        <p data-testid="word-klant-btwnummer-error" className="text-xs text-red-400">
          {btwNummerError}
        </p>
      )}
```

Het `required`-attribuut geeft de browser-native melding; de expliciete check in `handleSubmit` is de echte guard (jsdom voert constraint-validatie niet uit bij een programmatische submit) en levert een vertaalde melding op.

- [ ] **Step 4: Add the translations**

In `messages/nl.json`, in `registrationPage`, direct ná `"labelKvk"`:

```json
    "labelBtwNummer": "Btw-nummer",
    "btwNummerVerplicht": "Voor zakelijke klanten binnen de EU is een btw-nummer verplicht.",
    "btwNummerOngeldig": "Dit btw-nummer heeft niet het juiste formaat voor het gekozen land.",
```

In `messages/en.json`, op dezelfde plek:

```json
    "labelBtwNummer": "VAT number",
    "btwNummerVerplicht": "A VAT number is required for business customers within the EU.",
    "btwNummerOngeldig": "This VAT number does not match the format for the selected country.",
```

In `messages/de.json`:

```json
    "labelBtwNummer": "USt-IdNr.",
    "btwNummerVerplicht": "Für Geschäftskunden innerhalb der EU ist eine USt-IdNr. erforderlich.",
    "btwNummerOngeldig": "Diese USt-IdNr. entspricht nicht dem Format des gewählten Landes.",
```

In `messages/fr.json`:

```json
    "labelBtwNummer": "Numéro de TVA",
    "btwNummerVerplicht": "Un numéro de TVA est obligatoire pour les clients professionnels au sein de l'UE.",
    "btwNummerOngeldig": "Ce numéro de TVA ne correspond pas au format du pays sélectionné.",
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run tests/components/RegistrationForm.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/RegistrationForm.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json tests/components/RegistrationForm.test.tsx
git commit -m "feat: ask EU customers for a VAT number at registration"
```

---

### Task 5: Btw-nummer in beheer

Hangt af van Task 1 en Task 3.

**Files:**
- Modify: `src/components/beheer/KlantenSection.tsx:11-34` (interface) en `:70-77` (kolommen)
- Modify: `src/components/beheer/KlantModal.tsx:24-64` (velden), `:144-191` (opslaan), `:321-327` (UI)
- Modify: `messages/nl.json` (in `beheer`, bij `klantenColKvk`)
- Test: `tests/components/beheer/KlantModal.test.tsx`, `tests/components/beheer/KlantenSection.test.tsx`

**Interfaces:**
- Consumes: `valideerBtwNummer` uit `@/lib/btwNummer`; kolom `btwNummer` uit Task 3.
- Produces: `Klant.btwNummer?: string | null`; testid `klant-modal-btwNummer`.

- [ ] **Step 1: Write the failing test**

Voeg in `tests/components/beheer/KlantModal.test.tsx` `btwNummer: 'NL123456789B01'` toe aan de `KLANT`-fixture (direct ná `kvk`). Laat `land: 'NL'` staan — `BTWTARIEVEN` bevat alleen NL, en de fixture op BE zetten zou de bestaande btw-waarschuwingstests raken. Landen anders dan NL worden per test overschreven.

Het bestand heeft al `renderModal(klant, ...)` (eerste argument is de klant zelf), `patchCall()`, `patchBody()` en `fetchMock`; hergebruik die.

```ts
  it('shows the btwNummer', () => {
    renderModal(KLANT);
    expect(screen.getByTestId('klant-modal')).toHaveTextContent('NL123456789B01');
  });

  it('saves an edited btwNummer in normalised form', async () => {
    renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-bewerken'));
    fireEvent.change(screen.getByTestId('klant-modal-btwNummer'), {
      target: { value: 'nl 9876.543.21 b02' },
    });
    fireEvent.click(screen.getByTestId('klant-modal-opslaan'));
    await waitFor(() => expect(patchCall()).toBeDefined());
    expect(patchBody().btwNummer).toBe('NL987654321B02');
  });

  it('refuses to save a btwNummer that does not match the country format', async () => {
    renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-bewerken'));
    fireEvent.change(screen.getByTestId('klant-modal-btwNummer'), {
      target: { value: 'BE0411905847' },
    });
    fireEvent.click(screen.getByTestId('klant-modal-opslaan'));
    expect(await screen.findByTestId('klant-modal-error')).toHaveTextContent(
      'Dit btw-nummer heeft niet het juiste formaat voor het gekozen land.'
    );
    expect(patchCall()).toBeUndefined();
  });

  it('saves an existing EU klant whose btwNummer is still empty', async () => {
    renderModal({ ...KLANT, land: 'BE', btwNummer: '' });
    fireEvent.click(screen.getByTestId('klant-modal-bewerken'));
    fireEvent.change(screen.getByTestId('klant-modal-phone'), { target: { value: '+3211223344' } });
    fireEvent.click(screen.getByTestId('klant-modal-opslaan'));
    await waitFor(() => expect(patchCall()).toBeDefined());
  });
```

Voeg toe aan `tests/components/beheer/KlantenSection.test.tsx`:

```ts
  it('shows a btwNummer column', () => {
    renderSection();
    expect(screen.getByText('Btw-nummer')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/components/beheer/KlantModal.test.tsx tests/components/beheer/KlantenSection.test.tsx
```

Expected: FAIL — `Unable to find an element by: [data-testid="klant-modal-btwNummer"]` en `Unable to find an element with the text: Btw-nummer`.

- [ ] **Step 3: Extend the Klant type and the table**

In `src/components/beheer/KlantenSection.tsx`, in `interface Klant`, direct ná `kvk: string;`:

```ts
  btwNummer?: string | null;
```

En in `columns`, direct ná de `kvk`-kolom:

```ts
    { key: 'btwNummer', label: t('klantenColBtwNummer') },
```

- [ ] **Step 4: Add the field to KlantModal**

In `src/components/beheer/KlantModal.tsx`:

Voeg toe aan de imports:

```tsx
import { normaliseerBtwNummer, valideerBtwNummer } from '@/lib/btwNummer';
```

In `interface EditableFields`, direct ná `kvk: string;`:

```ts
  btwNummer: string;
```

In `fieldsFromKlant`, direct ná `kvk: klant.kvk,`:

```ts
    btwNummer: klant.btwNummer ?? '',
```

In `handleOpslaan`, direct ná `setError(null);` (regel 146):

```tsx
    // Format only -- an empty value stays allowed here, because existing EU klanten have
    // no VAT number yet and would otherwise be impossible to save at all. See the spec, section D.
    const genormaliseerdBtwNummer = normaliseerBtwNummer(fields.btwNummer);
    if (valideerBtwNummer(genormaliseerdBtwNummer, fields.land) === 'ongeldig') {
      setError(t('klantenBtwNummerOngeldig'));
      return;
    }
    const teBewarenFields = { ...fields, btwNummer: genormaliseerdBtwNummer };
```

En verderop in dezelfde functie, vervang:

```tsx
      if (veldenGewijzigd) Object.assign(updates, fields);
```

door:

```tsx
      if (veldenGewijzigd) Object.assign(updates, teBewarenFields);
```

`veldenGewijzigd` blijft bewust de ruwe `fields` met `origineleFields` vergelijken: typt een medewerker `NL 1234...` waar `NL1234...` stond, dan is dat een wijziging die wél opgeslagen moet worden — in genormaliseerde vorm. Verander die vergelijking dus niet.

Voeg het `<Veld>` toe direct ná het bestaande KvK-veld (regels 321-327):

```tsx
            <Veld
              label={t('klantenColBtwNummer')}
              value={fields.btwNummer}
              editing={isEditing}
              testId="klant-modal-btwNummer"
              onChange={(value) => setField('btwNummer', value)}
            />
```

- [ ] **Step 5: Add the labels to nl.json**

In `messages/nl.json`, in de `beheer`-sectie, direct ná `"klantenColKvk"`:

```json
    "klantenColBtwNummer": "Btw-nummer",
```

En bij de andere `klanten*`-foutmeldingen:

```json
    "klantenBtwNummerOngeldig": "Dit btw-nummer heeft niet het juiste formaat voor het gekozen land.",
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npx vitest run tests/components/beheer/KlantModal.test.tsx tests/components/beheer/KlantenSection.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/beheer/KlantenSection.tsx src/components/beheer/KlantModal.tsx messages/nl.json tests/components/beheer/KlantModal.test.tsx tests/components/beheer/KlantenSection.test.tsx
git commit -m "feat: show and edit klant btwNummer in beheer"
```

---

### Task 6: Btw-nummer op de accountpagina

Hangt af van Task 1 en Task 3.

**Files:**
- Modify: `src/components/account/SettingsSection.tsx:17-39` (type + leeg profiel), `:66-76` (laden), `:87-124` (opslaan), en het formulier
- Modify: `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json` (in `accountPage.settings`)
- Test: `tests/components/account/SettingsSection.test.tsx`

**Interfaces:**
- Consumes: `valideerBtwNummer` uit `@/lib/btwNummer`; `PATCH /api/klanten/me` uit Task 3.
- Produces: testid `settings-btwnummer`, foutmelding `settings-btwnummer-error`.

Dit gaat bewust één stap verder dan `kvk`, dat wél zelf-bewerkbaar is op de API maar niet op deze pagina staat. Reden: een btw-nummer verandert vaker dan een KvK-nummer. Zie de spec, sectie E.

- [ ] **Step 1: Write the failing test**

In `tests/components/account/SettingsSection.test.tsx`: voeg `btwNummer: 'NL123456789B01'` toe aan de `KLANT_PROFILE`-fixture, **direct ná `companyName`**. De positie is niet cosmetisch — de bestaande tests vergelijken de PATCH-body met een letterlijke `JSON.stringify({ ...KLANT_PROFILE, ... })`, dus de sleutelvolgorde van de fixture moet exact die van het `setProfile`-object in de component volgen. Staat `btwNummer` op een andere plek, dan falen de twee bestaande opslaan-tests op een verschil dat alleen volgorde is.

`land` blijft `'NL'` — dan hoeven de overige tests niet mee te veranderen. Het bestand heeft al `renderSection()` en `fetchMock`; hergebruik die, en volg de bestaande `expect(fetchMock).toHaveBeenCalledWith('/api/klanten/me', expect.objectContaining({ ... }))`-stijl.

```ts
  it('loads the btwNummer into the form', async () => {
    renderSection();
    await waitFor(() =>
      expect(screen.getByTestId('settings-btwnummer')).toHaveValue('NL123456789B01')
    );
  });

  it('saves the btwNummer in normalised form', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByTestId('settings-submit')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('settings-btwnummer'), {
      target: { value: 'nl 9876.543.21 b02' },
    });
    fireEvent.click(screen.getByTestId('settings-submit'));
    await waitFor(() => expect(screen.getByTestId('settings-saved')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/klanten/me',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ ...KLANT_PROFILE, btwNummer: 'NL987654321B02' }),
      })
    );
  });

  it('refuses to save a btwNummer that does not match the country format', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByTestId('settings-submit')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('settings-btwnummer'), {
      target: { value: 'BE0411905847' },
    });
    fireEvent.click(screen.getByTestId('settings-submit'));
    expect(await screen.findByTestId('settings-btwnummer-error')).toHaveTextContent(
      'Dit btw-nummer heeft niet het juiste formaat voor het gekozen land.'
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/klanten/me',
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('saves fine with an empty btwNummer', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByTestId('settings-submit')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('settings-btwnummer'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('settings-submit'));
    await waitFor(() => expect(screen.getByTestId('settings-saved')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/klanten/me',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ ...KLANT_PROFILE, btwNummer: '' }),
      })
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/components/account/SettingsSection.test.tsx
```

Expected: FAIL — `Unable to find an element by: [data-testid="settings-btwnummer"]`.

- [ ] **Step 3: Add the field**

In `src/components/account/SettingsSection.tsx`:

Voeg toe aan de imports:

```tsx
import { normaliseerBtwNummer, valideerBtwNummer } from '@/lib/btwNummer';
```

In `interface KlantProfile`, direct ná `companyName: string;`:

```ts
  btwNummer: string;
```

In `EMPTY_PROFILE`, direct ná `companyName: '',`:

```ts
  btwNummer: '',
```

In de laad-`useEffect`, in het `setProfile`-object, direct ná `companyName: klant.companyName ?? '',`:

```ts
        btwNummer: klant.btwNummer ?? '',
```

Voeg een state-variabele toe, direct ná `const [saveError, setSaveError] = useState<string | null>(null);`:

```tsx
  const [btwNummerError, setBtwNummerError] = useState<string | null>(null);
```

In `handleSubmit`, direct ná `setPasswordError(null);` (regel 100):

```tsx
    // Format only -- empty stays allowed, so an existing EU klant without a VAT number
    // can still save the rest of their profile. See the spec, section D.
    const genormaliseerdBtwNummer = normaliseerBtwNummer(profile.btwNummer);
    if (valideerBtwNummer(genormaliseerdBtwNummer, profile.land) === 'ongeldig') {
      setBtwNummerError(t('btwNummerOngeldig'));
      return;
    }
    setBtwNummerError(null);
```

En vervang in dezelfde functie de request-body zodat het genormaliseerde nummer wordt verstuurd:

```tsx
        body: JSON.stringify({
          ...profile,
          btwNummer: genormaliseerdBtwNummer,
          ...(password ? { password } : {}),
        }),
```

Voeg het invoerveld toe direct ná het `labelCompanyName`-`<label>` (dat eindigt op regel 185):

```tsx
      <label className={labelClassName}>
        <span>{t('labelBtwNummer')}</span>
        <input
          type="text"
          value={profile.btwNummer}
          onChange={(e) => setField('btwNummer', e.target.value)}
          data-testid="settings-btwnummer"
          className={fieldClassName}
        />
      </label>

      {btwNummerError && (
        <p data-testid="settings-btwnummer-error" className="text-xs text-red-400">
          {btwNummerError}
        </p>
      )}
```

Geen `RequiredMark` en geen `required` — hier is het veld nooit verplicht.

- [ ] **Step 4: Add the translations**

In `messages/nl.json`, in `accountPage.settings`, direct ná `"labelCompanyName"`:

```json
      "labelBtwNummer": "Btw-nummer",
```

En bij de andere foutmeldingen in diezelfde sectie:

```json
      "btwNummerOngeldig": "Dit btw-nummer heeft niet het juiste formaat voor het gekozen land.",
```

In `messages/en.json`:

```json
      "labelBtwNummer": "VAT number",
      "btwNummerOngeldig": "This VAT number does not match the format for the selected country.",
```

In `messages/de.json`:

```json
      "labelBtwNummer": "USt-IdNr.",
      "btwNummerOngeldig": "Diese USt-IdNr. entspricht nicht dem Format des gewählten Landes.",
```

In `messages/fr.json`:

```json
      "labelBtwNummer": "Numéro de TVA",
      "btwNummerOngeldig": "Ce numéro de TVA ne correspond pas au format du pays sélectionné.",
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run tests/components/account/SettingsSection.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Run the whole suite and typecheck**

```bash
npm test
```

Expected: alle tests groen. Deze wijziging raakt de gedeelde `Klant`-vorm en beide PATCH-routes, dus een volledige run is hier wél gerechtvaardigd — dit is de laatste taak.

```bash
npx tsc --noEmit
```

Expected: exact zes fouten, allemaal `TS2339: Property 'naam' does not exist on type '{ id: string; }'` in `tests/regression/staging-scenarios.test.ts` (regels 414, 450, 465, 471, 690). Die bestaan al op `master` en staan los van dit werk — laat ze staan, ze horen niet bij deze taak. Elke andere fout is wél van jou.

```bash
npm run lint
```

Expected: geen nieuwe waarschuwingen.

- [ ] **Step 7: Commit**

```bash
git add src/components/account/SettingsSection.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json tests/components/account/SettingsSection.test.tsx
git commit -m "feat: let klanten manage their own VAT number on the account page"
```

---

## Na afloop

- `db/migrations/2026-08-06-klant-btwnummer.sql` is op **staging** uitgevoerd (Task 3, stap 4) en moet nog op **productie** draaien. Vraag daar expliciet toestemming voor op het moment dat deze code naar productie gaat — niet eerder.
- Niet in dit plan, bewust: verleggen/reverse charge op bestellingen, VIES-controle, blokkade bij klantgoedkeuring, een facturenmodule.
- `kvk` blijft afwezig op de accountpagina terwijl `btwNummer` er wél staat. Dat is een bewuste keuze (spec, sectie E), geen omissie.
