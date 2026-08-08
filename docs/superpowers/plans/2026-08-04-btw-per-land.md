# Btw per land Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 04-08-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a country ("Land") field to klanten, a beheer-managed per-country btw-tarieven list, and a live btw%/btw-bedrag/totaal-incl.-btw breakdown under the existing "Totaal excl. btw" in both order-detail popups.

**Architecture:** Two new nullable `klanten` columns (`land`, `invoiceLand`) feed a client-side btw calculation (`totaalExclBtw × percentage`) that reads a single new `instellingen` row (id `"btwtarieven"`) holding a beheerbare land→percentage list plus a fallback rate. No historical rate snapshotting, no per-line btw, no reverse-charge handling — see the design doc for the full rationale.

**Tech Stack:** Next.js 14 (App Router) client components, TypeScript, Tailwind CSS, `next-intl`, MySQL (`mysql2`), Vitest + Testing Library (component tests mock `fetch`; `tests/app/api/**` tests hit the real shared staging database).

## Global Constraints

- Design source of truth: `docs/superpowers/specs/2026-08-04-btw-per-land-design.md` — approved 2026-08-04.
- `land`/`invoiceLand` are ISO 3166-1 alpha-2 codes (`VARCHAR(2)`, nullable). `invoiceLand` follows the exact existing "empty means inherit" convention already used by `invoiceAddress`/`invoicePostcode`/`invoiceCity`; `land` follows the exact existing required/self-editable convention already used by `address`/`postcode`/`city`.
- Land resolution for btw purposes is always `klant.invoiceLand || klant.land || null` — computed live from the klant's CURRENT record, never stored per bestelling.
- `beheer` is a Dutch-only staff namespace (no `en`/`de`/`fr` equivalents) — new `beheer.*` i18n keys go in `nl.json` only. `accountPage.*`/`registrationPage.*` keys are customer-facing and go in all four `messages/{nl,en,de,fr}.json` files.
- The generic CRUD layer (`src/lib/server/crud.ts`, `SELECT *` / dynamic `INSERT`/`UPDATE`) and the generic `instellingen`/`klanten` API routes need **no route-level code changes** for this feature — every new column/settings-id flows through automatically once the schema and allow-lists (`SELF_EDITABLE_KLANT_FIELDS`) are updated. Do not add bespoke handling to any `route.ts` file.
- Preserve every existing `data-testid` in the test files this plan touches (`RegistrationForm.test.tsx`, `SettingsSection.test.tsx`, `KlantModal.test.tsx`, `KlantenSection.test.tsx`, `InstellingenSection.test.tsx`, `AccountOrderModal.test.tsx`, `BestellingModal.test.tsx`, `klanten-me.test.ts`) unless a step explicitly says otherwise.
- Run `npx vitest run <file>` for the specific test file after each task. Real-DB tests under `tests/app/api/**` must never use a blanket `DELETE`/`TRUNCATE` — scope cleanup to exactly the rows a test created (by captured id), per the hard rule in `CLAUDE.md`.
- Run the full `npm test` suite once per task before committing (it's a ~3 minute run against the real shared staging database; a lone, non-reproducing failure in `tests/components/account/SettingsSection.test.tsx` is a known pre-existing flake unrelated to this work — confirmed transient across the prior branch's tasks. If you see it, re-run that one file alone to confirm it passes in isolation and note it; treat any other failure as real).
- **Never touch the production database as part of this plan.** The schema migration in Task 1 runs against the staging database only (the same one `npm test`/`npm run dev` already connect to via `.env.local`). Production requires separate, explicit per-change permission per `CLAUDE.md` — out of scope here.

---

## File Structure

- **Modify** `db/schema.sql` — two new `klanten` columns.
- **Create** `src/data/landen.ts` — ISO country list + `ComboboxOption[]` + lookup helper.
- **Create** `src/components/beheer/btwTarievenTypes.ts` — `BtwTarief`/`BtwTarieven` types.
- **Create** `src/data/btwTarievenSeed.ts` — seed value.
- **Modify** `src/lib/logActiviteit.ts` — add `'btwtarieven_gewijzigd'`.
- **Modify** `src/lib/server/klantFields.ts` — add `land`/`invoiceLand` to the self-editable allow-list.
- **Modify** `src/components/RegistrationForm.tsx` — Land + invoiceLand Combobox fields.
- **Modify** `src/components/account/SettingsSection.tsx` — self-service Land Combobox field.
- **Modify** `src/components/beheer/KlantenSection.tsx` — `Klant` interface gains `land`/`invoiceLand`.
- **Modify** `src/components/beheer/KlantModal.tsx` — admin Land + invoiceLand Combobox fields.
- **Modify** `src/components/beheer/InstellingenSection.tsx` — new btw-tarieven list block.
- **Modify** `src/components/beheer/BeheerShell.tsx` — new `useApiRecord` call + prop threading.
- **Modify** `src/components/beheer/BestellingenSection.tsx`, `src/components/beheer/BestellingModal.tsx` — btw breakdown, beheer side.
- **Modify** `src/components/account/OrdersSection.tsx`, `src/components/account/AccountOrderModal.tsx` — btw breakdown, klant side.
- **Modify** `messages/nl.json`, `en.json`, `de.json`, `fr.json` — new i18n keys (nl-only for `beheer`, all four for customer-facing namespaces).
- **Modify** matching test files for every component above, plus `tests/app/api/klanten-me.test.ts`.

---

### Task 1: Schema migration + shared data files

**Files:**
- Modify: `db/schema.sql`
- Create: `src/data/landen.ts`
- Create: `src/components/beheer/btwTarievenTypes.ts`
- Create: `src/data/btwTarievenSeed.ts`
- Modify: `src/lib/logActiviteit.ts:45`

**Interfaces:**
- Produces: `LANDEN: {code: string; naam: string}[]`, `LAND_OPTIONS: ComboboxOption[]`, `landNaam(code: string | null): string` from `src/data/landen.ts` — consumed by Tasks 2, 3, 4, 5. `BtwTarief`/`BtwTarieven` types and `BTWTARIEVEN_SEED` — consumed by Tasks 5, 6, 7. `ACTIVITEIT_TYPES` gains `'btwtarieven_gewijzigd'` — consumed by Task 5.

- [ ] **Step 1: Add the new columns to the schema source of truth**

In `db/schema.sql`, in `CREATE TABLE klanten`, add two lines right after the existing `invoiceCity` column (keep them adjacent to the other address fields):

```sql
  invoiceCity VARCHAR(255),
  land VARCHAR(2),
  invoiceLand VARCHAR(2),
```

(This replaces the existing `invoiceCity VARCHAR(255),` line — the two new lines go directly after it, before `status VARCHAR(50) NOT NULL DEFAULT 'Beoordelen',`.)

- [ ] **Step 2: Run the migration against the staging database**

Run (from the repo root, `.env.local` already configures the connection):

```bash
node -e "
require('dotenv').config({ path: '.env.local' });
const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  await conn.query('ALTER TABLE klanten ADD COLUMN land VARCHAR(2), ADD COLUMN invoiceLand VARCHAR(2)');
  const [result] = await conn.query(\"UPDATE klanten SET land = 'NL' WHERE land IS NULL\");
  console.log('backfilled rows:', result.affectedRows);
  await conn.end();
})();
"
```

Expected: prints `backfilled rows: 6` (or however many klanten currently exist on staging).

- [ ] **Step 3: Verify the migration**

```bash
node -e "
require('dotenv').config({ path: '.env.local' });
const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  const [rows] = await conn.query('SELECT id, companyName, land, invoiceLand FROM klanten');
  console.log(JSON.stringify(rows, null, 2));
  await conn.end();
})();
"
```

Expected: every row shows `"land": "NL"` and `"invoiceLand": null`.

- [ ] **Step 4: Create `src/data/landen.ts`**

```ts
import type { ComboboxOption } from '@/components/Combobox';

export interface Land {
  code: string;
  naam: string;
}

export const LANDEN: Land[] = [
  { code: 'NL', naam: 'Nederland' },
  { code: 'AF', naam: 'Afghanistan' },
  { code: 'AL', naam: 'Albanië' },
  { code: 'DZ', naam: 'Algerije' },
  { code: 'AD', naam: 'Andorra' },
  { code: 'AO', naam: 'Angola' },
  { code: 'AG', naam: 'Antigua en Barbuda' },
  { code: 'AR', naam: 'Argentinië' },
  { code: 'AM', naam: 'Armenië' },
  { code: 'AU', naam: 'Australië' },
  { code: 'AT', naam: 'Oostenrijk' },
  { code: 'AZ', naam: 'Azerbeidzjan' },
  { code: 'BS', naam: "Bahama's" },
  { code: 'BH', naam: 'Bahrein' },
  { code: 'BD', naam: 'Bangladesh' },
  { code: 'BB', naam: 'Barbados' },
  { code: 'BY', naam: 'Belarus' },
  { code: 'BE', naam: 'België' },
  { code: 'BZ', naam: 'Belize' },
  { code: 'BJ', naam: 'Benin' },
  { code: 'BT', naam: 'Bhutan' },
  { code: 'BO', naam: 'Bolivia' },
  { code: 'BA', naam: 'Bosnië en Herzegovina' },
  { code: 'BW', naam: 'Botswana' },
  { code: 'BR', naam: 'Brazilië' },
  { code: 'BN', naam: 'Brunei' },
  { code: 'BG', naam: 'Bulgarije' },
  { code: 'BF', naam: 'Burkina Faso' },
  { code: 'BI', naam: 'Burundi' },
  { code: 'KH', naam: 'Cambodja' },
  { code: 'CA', naam: 'Canada' },
  { code: 'CF', naam: 'Centraal-Afrikaanse Republiek' },
  { code: 'TD', naam: 'Tsjaad' },
  { code: 'CL', naam: 'Chili' },
  { code: 'CN', naam: 'China' },
  { code: 'CO', naam: 'Colombia' },
  { code: 'KM', naam: 'Comoren' },
  { code: 'CG', naam: 'Congo-Brazzaville' },
  { code: 'CD', naam: 'Congo-Kinshasa' },
  { code: 'CR', naam: 'Costa Rica' },
  { code: 'CU', naam: 'Cuba' },
  { code: 'CY', naam: 'Cyprus' },
  { code: 'DK', naam: 'Denemarken' },
  { code: 'DJ', naam: 'Djibouti' },
  { code: 'DM', naam: 'Dominica' },
  { code: 'DO', naam: 'Dominicaanse Republiek' },
  { code: 'DE', naam: 'Duitsland' },
  { code: 'EC', naam: 'Ecuador' },
  { code: 'EG', naam: 'Egypte' },
  { code: 'SV', naam: 'El Salvador' },
  { code: 'GQ', naam: 'Equatoriaal-Guinea' },
  { code: 'ER', naam: 'Eritrea' },
  { code: 'EE', naam: 'Estland' },
  { code: 'SZ', naam: 'Eswatini' },
  { code: 'ET', naam: 'Ethiopië' },
  { code: 'FJ', naam: 'Fiji' },
  { code: 'PH', naam: 'Filipijnen' },
  { code: 'FI', naam: 'Finland' },
  { code: 'FR', naam: 'Frankrijk' },
  { code: 'GA', naam: 'Gabon' },
  { code: 'GM', naam: 'Gambia' },
  { code: 'GE', naam: 'Georgië' },
  { code: 'GH', naam: 'Ghana' },
  { code: 'GR', naam: 'Griekenland' },
  { code: 'GD', naam: 'Grenada' },
  { code: 'GT', naam: 'Guatemala' },
  { code: 'GN', naam: 'Guinee' },
  { code: 'GW', naam: 'Guinee-Bissau' },
  { code: 'GY', naam: 'Guyana' },
  { code: 'HT', naam: 'Haïti' },
  { code: 'HN', naam: 'Honduras' },
  { code: 'HU', naam: 'Hongarije' },
  { code: 'IE', naam: 'Ierland' },
  { code: 'IS', naam: 'IJsland' },
  { code: 'IN', naam: 'India' },
  { code: 'ID', naam: 'Indonesië' },
  { code: 'IQ', naam: 'Irak' },
  { code: 'IR', naam: 'Iran' },
  { code: 'IL', naam: 'Israël' },
  { code: 'IT', naam: 'Italië' },
  { code: 'CI', naam: 'Ivoorkust' },
  { code: 'JM', naam: 'Jamaica' },
  { code: 'JP', naam: 'Japan' },
  { code: 'YE', naam: 'Jemen' },
  { code: 'JO', naam: 'Jordanië' },
  { code: 'CV', naam: 'Kaapverdië' },
  { code: 'CM', naam: 'Kameroen' },
  { code: 'KZ', naam: 'Kazachstan' },
  { code: 'KE', naam: 'Kenia' },
  { code: 'KG', naam: 'Kirgizië' },
  { code: 'KI', naam: 'Kiribati' },
  { code: 'KW', naam: 'Koeweit' },
  { code: 'HR', naam: 'Kroatië' },
  { code: 'LA', naam: 'Laos' },
  { code: 'LS', naam: 'Lesotho' },
  { code: 'LV', naam: 'Letland' },
  { code: 'LB', naam: 'Libanon' },
  { code: 'LR', naam: 'Liberia' },
  { code: 'LY', naam: 'Libië' },
  { code: 'LI', naam: 'Liechtenstein' },
  { code: 'LT', naam: 'Litouwen' },
  { code: 'LU', naam: 'Luxemburg' },
  { code: 'MG', naam: 'Madagaskar' },
  { code: 'MW', naam: 'Malawi' },
  { code: 'MY', naam: 'Maleisië' },
  { code: 'MV', naam: 'Maldiven' },
  { code: 'ML', naam: 'Mali' },
  { code: 'MT', naam: 'Malta' },
  { code: 'MA', naam: 'Marokko' },
  { code: 'MH', naam: 'Marshalleilanden' },
  { code: 'MR', naam: 'Mauritanië' },
  { code: 'MU', naam: 'Mauritius' },
  { code: 'MX', naam: 'Mexico' },
  { code: 'FM', naam: 'Micronesia' },
  { code: 'MD', naam: 'Moldavië' },
  { code: 'MC', naam: 'Monaco' },
  { code: 'MN', naam: 'Mongolië' },
  { code: 'ME', naam: 'Montenegro' },
  { code: 'MZ', naam: 'Mozambique' },
  { code: 'MM', naam: 'Myanmar' },
  { code: 'NA', naam: 'Namibië' },
  { code: 'NR', naam: 'Nauru' },
  { code: 'NP', naam: 'Nepal' },
  { code: 'NI', naam: 'Nicaragua' },
  { code: 'NE', naam: 'Niger' },
  { code: 'NG', naam: 'Nigeria' },
  { code: 'KP', naam: 'Noord-Korea' },
  { code: 'MK', naam: 'Noord-Macedonië' },
  { code: 'NO', naam: 'Noorwegen' },
  { code: 'NZ', naam: 'Nieuw-Zeeland' },
  { code: 'UG', naam: 'Oeganda' },
  { code: 'UA', naam: 'Oekraïne' },
  { code: 'OM', naam: 'Oman' },
  { code: 'TL', naam: 'Oost-Timor' },
  { code: 'PK', naam: 'Pakistan' },
  { code: 'PW', naam: 'Palau' },
  { code: 'PS', naam: 'Palestina' },
  { code: 'PA', naam: 'Panama' },
  { code: 'PG', naam: 'Papoea-Nieuw-Guinea' },
  { code: 'PY', naam: 'Paraguay' },
  { code: 'PE', naam: 'Peru' },
  { code: 'PL', naam: 'Polen' },
  { code: 'PT', naam: 'Portugal' },
  { code: 'QA', naam: 'Qatar' },
  { code: 'RO', naam: 'Roemenië' },
  { code: 'RU', naam: 'Rusland' },
  { code: 'RW', naam: 'Rwanda' },
  { code: 'KN', naam: 'Saint Kitts en Nevis' },
  { code: 'LC', naam: 'Saint Lucia' },
  { code: 'VC', naam: 'Saint Vincent en de Grenadines' },
  { code: 'SB', naam: 'Salomonseilanden' },
  { code: 'WS', naam: 'Samoa' },
  { code: 'SM', naam: 'San Marino' },
  { code: 'ST', naam: 'Sao Tomé en Principe' },
  { code: 'SA', naam: 'Saoedi-Arabië' },
  { code: 'SN', naam: 'Senegal' },
  { code: 'RS', naam: 'Servië' },
  { code: 'SC', naam: 'Seychellen' },
  { code: 'SL', naam: 'Sierra Leone' },
  { code: 'SG', naam: 'Singapore' },
  { code: 'SI', naam: 'Slovenië' },
  { code: 'SK', naam: 'Slowakije' },
  { code: 'SD', naam: 'Soedan' },
  { code: 'SO', naam: 'Somalië' },
  { code: 'ES', naam: 'Spanje' },
  { code: 'LK', naam: 'Sri Lanka' },
  { code: 'SR', naam: 'Suriname' },
  { code: 'SY', naam: 'Syrië' },
  { code: 'TJ', naam: 'Tadzjikistan' },
  { code: 'TW', naam: 'Taiwan' },
  { code: 'TZ', naam: 'Tanzania' },
  { code: 'TH', naam: 'Thailand' },
  { code: 'TG', naam: 'Togo' },
  { code: 'TO', naam: 'Tonga' },
  { code: 'TT', naam: 'Trinidad en Tobago' },
  { code: 'CZ', naam: 'Tsjechië' },
  { code: 'TN', naam: 'Tunesië' },
  { code: 'TR', naam: 'Turkije' },
  { code: 'TM', naam: 'Turkmenistan' },
  { code: 'TV', naam: 'Tuvalu' },
  { code: 'UY', naam: 'Uruguay' },
  { code: 'VU', naam: 'Vanuatu' },
  { code: 'VA', naam: 'Vaticaanstad' },
  { code: 'VE', naam: 'Venezuela' },
  { code: 'AE', naam: 'Verenigde Arabische Emiraten' },
  { code: 'US', naam: 'Verenigde Staten' },
  { code: 'GB', naam: 'Verenigd Koninkrijk' },
  { code: 'VN', naam: 'Vietnam' },
  { code: 'ZM', naam: 'Zambia' },
  { code: 'ZW', naam: 'Zimbabwe' },
  { code: 'ZA', naam: 'Zuid-Afrika' },
  { code: 'KR', naam: 'Zuid-Korea' },
  { code: 'SS', naam: 'Zuid-Soedan' },
  { code: 'SE', naam: 'Zweden' },
  { code: 'CH', naam: 'Zwitserland' },
];

export const LAND_OPTIONS: ComboboxOption[] = LANDEN.map((land) => ({ value: land.code, label: land.naam }));

export function landNaam(code: string | null | undefined): string {
  if (!code) return '';
  return LANDEN.find((land) => land.code === code)?.naam ?? code;
}
```

- [ ] **Step 5: Create `src/components/beheer/btwTarievenTypes.ts`**

```ts
export interface BtwTarief {
  land: string;
  percentage: number;
}

export interface BtwTarieven {
  tarieven: BtwTarief[];
  standaardPercentage: number;
}
```

- [ ] **Step 6: Create `src/data/btwTarievenSeed.ts`**

```ts
import type { BtwTarieven } from '@/components/beheer/btwTarievenTypes';

export const BTWTARIEVEN_SEED: BtwTarieven = {
  tarieven: [{ land: 'NL', percentage: 21 }],
  standaardPercentage: 21,
};
```

- [ ] **Step 7: Add the new activiteitenlog type**

In `src/lib/logActiviteit.ts`, add a line right after `'bestelinstellingen_gewijzigd',` (line 45):

```ts
  'bestelinstellingen_gewijzigd',
  'btwtarieven_gewijzigd',
```

- [ ] **Step 8: Verify everything compiles**

Run: `npx tsc --noEmit`
Expected: no output, no errors.

- [ ] **Step 9: Commit**

```bash
git add db/schema.sql src/data/landen.ts src/components/beheer/btwTarievenTypes.ts src/data/btwTarievenSeed.ts src/lib/logActiviteit.ts
git commit -m "feat: add klanten.land/invoiceLand columns and btw-tarieven data types"
```

---

### Task 2: Land field at registration + self-service allow-list

**Files:**
- Modify: `src/lib/server/klantFields.ts`
- Modify: `src/components/RegistrationForm.tsx`
- Modify: `messages/nl.json:158-168`, `messages/en.json:158-168`, `messages/de.json:158-168`, `messages/fr.json:158-168` (the `registrationPage` block in each — identical line numbers across all four files)
- Test: `tests/components/RegistrationForm.test.tsx`
- Test: `tests/app/api/klanten-me.test.ts`

**Interfaces:**
- Consumes: `LAND_OPTIONS` from `@/data/landen.ts` (Task 1), `Combobox` from `@/components/Combobox` (unchanged, existing component: `{options: ComboboxOption[], value: string|null, onChange: (v: string|null)=>void, placeholder: string, noResultsLabel: string, clearLabel?: string, testId: string}`).
- Produces: `SELF_EDITABLE_KLANT_FIELDS` includes `'land'`/`'invoiceLand'` — consumed by Task 3 (`SettingsSection.tsx`'s land self-edit relies on this same allow-list via `/api/klanten/me`).

- [ ] **Step 1: Add the new i18n keys**

In `messages/nl.json`, inside `registrationPage` (currently lines 146–179), add `labelLand` after `"labelCity": "Plaats",` (line 160) and `labelInvoiceLand` after `"labelInvoiceCity": "Factuurplaats",` (line 168):

```json
    "labelCity": "Plaats",
    "labelLand": "Land",
    "differentDeliveryLabel": "Afwijkend afleveradres",
```
```json
    "labelInvoiceCity": "Factuurplaats",
    "labelInvoiceLand": "Factuurland",
    "labelCompanyName": "Bedrijfsnaam",
```

In `messages/en.json`, same positions (identical line numbers):
```json
    "labelCity": "City",
    "labelLand": "Country",
    "differentDeliveryLabel": "Different delivery address",
```
```json
    "labelInvoiceCity": "Invoice city",
    "labelInvoiceLand": "Invoice country",
    "labelCompanyName": "Company name",
```

In `messages/de.json`, same positions:
```json
    "labelCity": "Ort",
    "labelLand": "Land",
    "differentDeliveryLabel": "Abweichende Lieferadresse",
```
```json
    "labelInvoiceCity": "Rechnungsort",
    "labelInvoiceLand": "Rechnungsland",
    "labelCompanyName": "Firmenname",
```

In `messages/fr.json`, same positions:
```json
    "labelCity": "Ville",
    "labelLand": "Pays",
    "differentDeliveryLabel": "Adresse de livraison différente",
```
```json
    "labelInvoiceCity": "Ville de facturation",
    "labelInvoiceLand": "Pays de facturation",
    "labelCompanyName": "Nom de l'entreprise",
```

- [ ] **Step 2: Add `land`/`invoiceLand` to the self-editable allow-list**

Read the current `src/lib/server/klantFields.ts` — add `'land'` and `'invoiceLand'` to the `SELF_EDITABLE_KLANT_FIELDS` array, next to the existing `invoiceAddress`/`invoicePostcode`/`invoiceCity` entries:

```ts
  'invoiceAddress',
  'invoicePostcode',
  'invoiceCity',
  'land',
  'invoiceLand',
```

- [ ] **Step 3: Write the failing tests**

Add to `tests/components/RegistrationForm.test.tsx`, inside `describe('RegistrationForm', ...)` (before its closing `});` on line 230):

```tsx
  it('shows a Land combobox defaulted to Nederland in the main address block', () => {
    renderForm();
    expect(screen.getByTestId('word-klant-land')).toHaveTextContent('Nederland');
  });

  it('shows an invoiceLand combobox only when "different invoice address" is checked, with no default', () => {
    renderForm();
    expect(screen.queryByTestId('word-klant-invoice-land')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('word-klant-different-invoice'));
    expect(screen.getByTestId('word-klant-invoice-land')).toBeInTheDocument();
    expect(screen.getByTestId('word-klant-invoice-land')).not.toHaveTextContent('Nederland');
  });

  it('includes land and invoiceLand in the POST body', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderForm();
    fillRequiredFields();
    fireEvent.click(screen.getByTestId('word-klant-different-invoice'));
    fireEvent.focus(screen.getByTestId('word-klant-invoice-land'));
    fireEvent.change(screen.getByTestId('word-klant-invoice-land'), { target: { value: 'Duitsland' } });
    fireEvent.click(screen.getByTestId('word-klant-invoice-land-option-DE'));
    fireEvent.submit(screen.getByTestId('word-klant-submit').closest('form')!);

    await waitFor(() => expect(screen.getByTestId('word-klant-confirmation')).toBeInTheDocument());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.land).toBe('NL');
    expect(body.invoiceLand).toBe('DE');
  });
```

Also update the existing `'POSTs to /api/auth/register with the form data and shows the confirmation screen'` test (lines 122–155): change the expected body to include `land: 'NL', invoiceLand: ''` (matching the default-NL, empty-invoice pattern), inserted right after `city: 'Teststad',` and right after `invoiceCity: '',` respectively:

```tsx
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
```

Add to `tests/app/api/klanten-me.test.ts`, inside `describe('klanten self-service route', ...)` (before its closing `});` on line 139):

```ts
  it('updates land and invoiceLand via self-service PATCH', async () => {
    const { klant, cookie } = await createKlantWithCookie();
    const response = await patchMe(req('PATCH', { land: 'BE', invoiceLand: 'DE' }, cookie));
    expect(response.status).toBe(200);
    const [rows] = await getPool().query('SELECT land, invoiceLand FROM klanten WHERE id = ?', [klant.id]);
    const row = (rows as Array<{ land: string; invoiceLand: string }>)[0];
    expect(row.land).toBe('BE');
    expect(row.invoiceLand).toBe('DE');
  });
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run tests/components/RegistrationForm.test.tsx tests/app/api/klanten-me.test.ts`
Expected: FAIL — `word-klant-land`/`word-klant-invoice-land` don't exist yet; the updated POST-body assertion doesn't match (missing `land`/`invoiceLand` keys); the new API test finds `land`/`invoiceLand` columns don't accept updates yet (actually they will accept the write since the schema/allow-list changes from Steps 1-2 of this task are already in place by the time this step runs — so this specific new API test should already pass once Step 2 is done; the RED here is really about the RegistrationForm component test only). Confirm the RegistrationForm assertions fail; the klanten-me test may already pass — that's fine, note it and move on.

- [ ] **Step 5: Implement the Land fields in `RegistrationForm.tsx`**

Add the import at the top:

```tsx
import { Combobox } from '@/components/Combobox';
import { LAND_OPTIONS } from '@/data/landen';
```

Add two new pieces of state, next to the existing `showInvoiceAddress` state:

```tsx
  const [land, setLand] = useState<string | null>('NL');
  const [invoiceLand, setInvoiceLand] = useState<string | null>(null);
```

In `handleSubmit`, add `land` and `invoiceLand` to the request body (right after `city` and right after `invoiceCity` respectively):

```tsx
          city: formData.get('city') as string,
          land: land ?? '',
```
```tsx
          invoiceCity: (formData.get('invoiceCity') as string) || '',
          invoiceLand: invoiceLand ?? '',
```

In the JSX, add the Land combobox right after the `city` field (after the `</label>` closing the city input, before the delivery-address checkbox):

```tsx
      <label className={labelClassName}>
        <span>
          {t('labelLand')}
          <RequiredMark />
        </span>
        <Combobox
          options={LAND_OPTIONS}
          value={land}
          onChange={setLand}
          placeholder={t('labelLand')}
          noResultsLabel={t('labelLand')}
          testId="word-klant-land"
        />
      </label>
```

Add the invoiceLand combobox inside the `{showInvoiceAddress && (...)}` block, right after the `invoiceCity` field:

```tsx
          <label className={labelClassName}>
            {t('labelInvoiceLand')}
            <Combobox
              options={LAND_OPTIONS}
              value={invoiceLand}
              onChange={setInvoiceLand}
              placeholder={t('labelInvoiceLand')}
              noResultsLabel={t('labelInvoiceLand')}
              testId="word-klant-invoice-land"
            />
          </label>
```

Note: `land` is not marked with the HTML `required` attribute — `Combobox` doesn't support passthrough of `required`, and it always defaults to a non-empty value (`'NL'`), so there is never a genuinely-empty submission to guard against. The `<RequiredMark />` next to its label is purely visual, matching how it's grouped with the other required main-address fields.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/components/RegistrationForm.test.tsx tests/app/api/klanten-me.test.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS (see Global Constraints re: the known `SettingsSection.test.tsx` flake).

- [ ] **Step 8: Commit**

```bash
git add src/lib/server/klantFields.ts src/components/RegistrationForm.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json tests/components/RegistrationForm.test.tsx tests/app/api/klanten-me.test.ts
git commit -m "feat: add Land/invoiceLand fields to klant registration and self-service allow-list"
```

---

### Task 3: Self-service Land field on the account settings page

**Files:**
- Modify: `src/components/account/SettingsSection.tsx`
- Modify: `messages/nl.json:264-266`, `messages/en.json:294-296`, `messages/de.json:264-266`, `messages/fr.json:264-266` (the `accountPage.settings` block)
- Test: `tests/components/account/SettingsSection.test.tsx`

**Interfaces:**
- Consumes: `LAND_OPTIONS` from `@/data/landen.ts` (Task 1), `Combobox` (unchanged).
- Produces: no prop-signature change (`SettingsSection` stays zero-prop).

- [ ] **Step 1: Add the new i18n key**

In `messages/nl.json`, inside `accountPage.settings`, add `labelLand` right after `"labelCity": "Plaats",` (line 266):

```json
      "labelCity": "Plaats",
      "labelLand": "Land",
      "labelContactPreference": "Hoe wilt u gecontacteerd worden?",
```

In `messages/en.json` (line 296): `"labelLand": "Country",` after `"labelCity": "City",`.
In `messages/de.json` (line 266): `"labelLand": "Land",` after `"labelCity": "Ort",`.
In `messages/fr.json` (line 266): `"labelLand": "Pays",` after `"labelCity": "Ville",`.

- [ ] **Step 2: Write the failing tests**

Update the `KLANT_PROFILE` fixture in `tests/components/account/SettingsSection.test.tsx` (lines 12–21) to include a land value, so the round-trip fetch→state→PATCH-body assertions stay consistent with the new field:

```tsx
const KLANT_PROFILE = {
  companyName: 'Hotel De Zilveren Zwaan',
  contactPerson: 'Anne de Vries',
  email: 'anne@dezilverenzwaan.nl',
  phone: '0612345678',
  address: 'Kerkstraat 12',
  postcode: '1234 AB',
  city: 'Amsterdam',
  land: 'NL',
  contactPreference: 'email',
};
```

Add a new test inside `describe('SettingsSection', ...)` (before its closing `});` on line 239):

```tsx
  it('pre-fills the Land combobox from the real klant profile and includes it when saving', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByTestId('settings-land')).toHaveTextContent('Nederland'));
    fireEvent.click(screen.getByTestId('settings-submit'));
    await waitFor(() => expect(screen.getByTestId('settings-saved')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/klanten/me',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify(KLANT_PROFILE) })
    );
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/components/account/SettingsSection.test.tsx`
Expected: FAIL — `settings-land` doesn't exist; other tests whose `KLANT_PROFILE`-based body assertions now expect a `land` key the unmodified component doesn't yet send will also fail.

- [ ] **Step 4: Implement the Land field in `SettingsSection.tsx`**

Add the import at the top:

```tsx
import { Combobox } from '@/components/Combobox';
import { LAND_OPTIONS } from '@/data/landen';
```

Update the `KlantProfile` interface and `EMPTY_PROFILE`:

```tsx
interface KlantProfile {
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  postcode: string;
  city: string;
  land: string;
  contactPreference: ContactPreference;
}

const EMPTY_PROFILE: KlantProfile = {
  companyName: '',
  contactPerson: '',
  email: '',
  phone: '',
  address: '',
  postcode: '',
  city: '',
  land: '',
  contactPreference: 'email',
};
```

In the `useEffect` that loads the profile, add `land` to the mapped object (right after `city`):

```tsx
        city: klant.city ?? '',
        land: klant.land ?? '',
```

In the JSX, add the Land combobox right after the `city` field (after its closing `</label>`, before the `RequiredLegend`):

```tsx
      <label className={labelClassName}>
        <span>
          {t('labelLand')}
          <RequiredMark />
        </span>
        <Combobox
          options={LAND_OPTIONS}
          value={profile.land || null}
          onChange={(value) => setField('land', value ?? '')}
          placeholder={t('labelLand')}
          noResultsLabel={t('labelLand')}
          testId="settings-land"
        />
      </label>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/components/account/SettingsSection.test.tsx`
Expected: PASS (all tests, old and new).

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/account/SettingsSection.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json tests/components/account/SettingsSection.test.tsx
git commit -m "feat: let a klant self-edit their Land on the account settings page"
```

---

### Task 4: Land + invoiceLand fields in the beheer klant modal

**Files:**
- Modify: `src/components/beheer/KlantenSection.tsx:10-31`
- Modify: `src/components/beheer/KlantModal.tsx`
- Modify: `messages/nl.json:390-395` (the `klanten*` block)
- Test: `tests/components/beheer/KlantModal.test.tsx`

**Interfaces:**
- Consumes: `LAND_OPTIONS`, `landNaam` from `@/data/landen.ts` (Task 1).
- Produces: `Klant` interface gains `land?: string | null` and `invoiceLand?: string | null` (optional, so existing `Klant` object literals across the codebase — e.g. in `BestellingModal.test.tsx` fixtures that only reference `companyName` — keep compiling without changes).

- [ ] **Step 1: Add the new i18n key**

In `messages/nl.json`, inside the `beheer` block, add `klantenLabelLand` right after `"klantenLabelPlaats": "Plaats",` (line 392):

```json
    "klantenLabelPlaats": "Plaats",
    "klantenLabelLand": "Land",
    "klantenLabelAfleveradres": "Afleveradres",
```

- [ ] **Step 2: Add `land`/`invoiceLand` to the `Klant` interface**

In `src/components/beheer/KlantenSection.tsx`, add two optional fields to the `Klant` interface, right after `invoiceCity: string;`:

```ts
  invoiceCity: string;
  land?: string | null;
  invoiceLand?: string | null;
```

- [ ] **Step 3: Write the failing tests**

Add to `tests/components/beheer/KlantModal.test.tsx`, inside `describe('KlantModal', ...)` (before its closing `});` on line 443):

```tsx
  it('shows the resolved land name read-only, and a Combobox in edit mode', () => {
    renderModal({ ...KLANT, land: 'BE' });
    expect(screen.getByTestId('klant-modal')).toHaveTextContent('België');
    fireEvent.click(screen.getByTestId('klant-modal-bewerken'));
    expect(screen.getByTestId('klant-modal-land')).toBeInTheDocument();
  });

  it('includes land and invoiceLand in the Opslaan diff when changed', async () => {
    const { onUpdated } = renderModal({ ...KLANT, land: 'NL' });
    fireEvent.click(screen.getByTestId('klant-modal-bewerken'));
    fireEvent.focus(screen.getByTestId('klant-modal-land'));
    fireEvent.click(screen.getByTestId('klant-modal-land-option-BE'));
    fireEvent.click(screen.getByTestId('klant-modal-opslaan'));

    await waitFor(() => expect(patchCall()).toBeDefined());
    expect(patchBody()).toEqual({ land: 'BE' });
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ ...KLANT, land: 'BE' }));
  });

  it('shows an invoiceLand Combobox inside the factuuradres block once it has a value', () => {
    renderModal({ ...KLANT, invoiceAddress: 'Factuurlaan 9', invoiceLand: 'DE' });
    expect(screen.getByTestId('klant-modal')).toHaveTextContent('Duitsland');
  });
```

Update the two existing exact-`patchBody()`-match tests to include the new fields. `KLANT` (lines 26–46) gains `land: 'NL', invoiceLand: '',` right after `kunstenaarId: null,` — actually add it as data fields, not trailing after status fields; insert right after `invoiceCity: '',` and before `status: 'Beoordelen',`:

```tsx
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
  land: 'NL',
  invoiceLand: '',
  status: 'Beoordelen',
  prijsgroepId: null,
  kunstenaarId: null,
};
```

Then in `'saves all edited fields via Opslaan and exits edit mode'` (lines 229–260), add `land: 'NL', invoiceLand: '',` to the expected `patchBody()` object, right after `invoiceCity: '',`:

```tsx
      invoiceAddress: '',
      invoicePostcode: '',
      invoiceCity: '',
      land: 'NL',
      invoiceLand: '',
    });
```

And in `'edits and saves the afleveradres and factuuradres fields via Opslaan'` (lines 275–305), same addition, right after `invoiceCity: 'Factuurstad',`:

```tsx
      invoiceAddress: 'Factuurlaan 9',
      invoicePostcode: '9999 ZZ',
      invoiceCity: 'Factuurstad',
      land: 'NL',
      invoiceLand: '',
    });
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run tests/components/beheer/KlantModal.test.tsx`
Expected: FAIL — `klant-modal-land` doesn't exist; the two updated `patchBody()` assertions don't match the still-unmodified component's output.

- [ ] **Step 5: Implement the Land fields in `KlantModal.tsx`**

Add the import at the top:

```tsx
import { LAND_OPTIONS, landNaam } from '@/data/landen';
```

Add `land: string;` and `invoiceLand: string;` to the `EditableFields` interface, and map them in `fieldsFromKlant` (empty-string convention, matching every other field in this interface):

```ts
interface EditableFields {
  companyName: string;
  kvk: string;
  contactPerson: string;
  contactPreference: string;
  email: string;
  phone: string;
  address: string;
  postcode: string;
  city: string;
  land: string;
  deliveryAddress: string;
  deliveryPostcode: string;
  deliveryCity: string;
  invoiceAddress: string;
  invoicePostcode: string;
  invoiceCity: string;
  invoiceLand: string;
}

function fieldsFromKlant(klant: Klant): EditableFields {
  return {
    companyName: klant.companyName,
    kvk: klant.kvk,
    contactPerson: klant.contactPerson,
    contactPreference: klant.contactPreference,
    email: klant.email,
    phone: klant.phone,
    address: klant.address,
    postcode: klant.postcode,
    city: klant.city,
    land: klant.land ?? '',
    deliveryAddress: klant.deliveryAddress,
    deliveryPostcode: klant.deliveryPostcode,
    deliveryCity: klant.deliveryCity,
    invoiceAddress: klant.invoiceAddress,
    invoicePostcode: klant.invoicePostcode,
    invoiceCity: klant.invoiceCity,
    invoiceLand: klant.invoiceLand ?? '',
  };
}
```

In the main-address grid (the `grid-cols-1 gap-3 sm:grid-cols-2` block containing the `city` `Veld`), replace plain-text land display with a Combobox-when-editing pattern — add right after the `city` `Veld` (after its closing `/>`):

```tsx
            {isEditing ? (
              <label className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-wide text-white/60">{t('klantenLabelLand')}</span>
                <Combobox
                  options={LAND_OPTIONS}
                  value={fields.land || null}
                  onChange={(value) => setField('land', value ?? '')}
                  placeholder={t('klantenLabelLand')}
                  noResultsLabel={t('klantenLabelLand')}
                  testId="klant-modal-land"
                />
              </label>
            ) : (
              <Veld label={t('klantenLabelLand')} value={landNaam(fields.land)} editing={false} />
            )}
```

In the factuuradres block (inside the `!isEditing && fields.invoiceAddress === '' ? ... : (<div className="grid ...">...)` branch), add the invoiceLand field right after the `invoiceCity` `Veld`:

```tsx
                {isEditing ? (
                  <label className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wide text-white/60">
                      {t('klantenLabelLand')}
                    </span>
                    <Combobox
                      options={LAND_OPTIONS}
                      value={fields.invoiceLand || null}
                      onChange={(value) => setField('invoiceLand', value ?? '')}
                      placeholder={t('klantenLabelLand')}
                      noResultsLabel={t('klantenLabelLand')}
                      clearLabel={t('klantenLabelGebruiktStandaardadres')}
                      testId="klant-modal-invoiceLand"
                    />
                  </label>
                ) : (
                  <Veld label={t('klantenLabelLand')} value={landNaam(fields.invoiceLand)} editing={false} />
                )}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/components/beheer/KlantModal.test.tsx`
Expected: PASS (all tests, old and new).

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/beheer/KlantenSection.tsx src/components/beheer/KlantModal.tsx messages/nl.json tests/components/beheer/KlantModal.test.tsx
git commit -m "feat: add Land/invoiceLand fields to the beheer klant modal"
```

---

### Task 5: Btw-tarieven settings block

**Files:**
- Modify: `src/components/beheer/InstellingenSection.tsx`
- Modify: `src/components/beheer/BeheerShell.tsx`
- Modify: `messages/nl.json:371-374` (the `instellingen*` block)
- Test: `tests/components/beheer/InstellingenSection.test.tsx`

**Interfaces:**
- Consumes: `BtwTarieven`/`BtwTarief` types, `BTWTARIEVEN_SEED` (Task 1), `LAND_OPTIONS`/`landNaam` (Task 1), `Combobox`, `useApiRecord<T>(resource, id, {seed}): {data: T|null, error: 'load'|'action'|null, save: (data: T) => Promise<boolean>}` (existing, unchanged).
- Produces: `InstellingenSectionProps` gains `btwTarieven: BtwTarieven | null`, `btwLoadError: string | null`, `onSaveBtw: (data: BtwTarieven) => Promise<boolean>` — consumed by `BeheerShell.tsx`. `BeheerShell` gains a new `btwtarieven = useApiRecord<BtwTarieven>('instellingen', 'btwtarieven', {seed: BTWTARIEVEN_SEED})` value, whose `.data` is threaded to Task 6 (`BestellingModal` via `BestellingenSection`).

- [ ] **Step 1: Add the new i18n keys**

In `messages/nl.json`, inside the `beheer` block, add after `"instellingenActionError": "Er is iets misgegaan. Probeer het opnieuw.",` (line 374):

```json
    "instellingenActionError": "Er is iets misgegaan. Probeer het opnieuw.",
    "instellingenBtwTarievenTitel": "Btw-tarieven",
    "instellingenBtwLand": "Land",
    "instellingenBtwPercentage": "Percentage",
    "instellingenBtwToevoegen": "Land toevoegen",
    "instellingenBtwVerwijderen": "Verwijderen",
    "instellingenBtwStandaardtarief": "Standaardtarief",
```

- [ ] **Step 2: Write the failing tests**

Replace the `renderSection` helper and add new fixtures/tests in `tests/components/beheer/InstellingenSection.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { InstellingenSection } from '@/components/beheer/InstellingenSection';
import type { Bestelinstellingen } from '@/components/beheer/bestelinstellingenTypes';
import type { BtwTarieven } from '@/components/beheer/btwTarievenTypes';
import messages from '../../../messages/nl.json';

const logActiviteitMock = vi.fn();

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

beforeEach(() => {
  logActiviteitMock.mockReset();
});

const BESTELINSTELLINGEN: Bestelinstellingen = { minimaleAfname: 3 };
const BTWTARIEVEN: BtwTarieven = { tarieven: [{ land: 'NL', percentage: 21 }], standaardPercentage: 21 };

function renderSection(overrides: Partial<React.ComponentProps<typeof InstellingenSection>> = {}) {
  const onSave = vi.fn().mockResolvedValue(true);
  const onSaveBtw = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <InstellingenSection
        bestelinstellingen={BESTELINSTELLINGEN}
        loadError={null}
        onSave={onSave}
        btwTarieven={BTWTARIEVEN}
        btwLoadError={null}
        onSaveBtw={onSaveBtw}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  return { onSave, onSaveBtw };
}

describe('InstellingenSection', () => {
  it('shows the load error instead of the form when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('instellingen-error')).toHaveTextContent('Kon niet laden.');
    expect(screen.queryByTestId('instellingen-section')).not.toBeInTheDocument();
  });

  it('renders nothing while bestelinstellingen is null and there is no error', () => {
    renderSection({ bestelinstellingen: null });
    expect(screen.queryByTestId('instellingen-section')).not.toBeInTheDocument();
  });

  it('pre-fills the minimale afname field', () => {
    renderSection();
    expect(screen.getByTestId('instellingen-minimale-afname')).toHaveValue(3);
  });

  it('saves the new value and logs bestelinstellingen_gewijzigd', async () => {
    const { onSave } = renderSection();
    fireEvent.change(screen.getByTestId('instellingen-minimale-afname'), { target: { value: '8' } });
    fireEvent.click(screen.getByTestId('instellingen-opslaan'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ minimaleAfname: 8 }));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('bestelinstellingen_gewijzigd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('clamps a value below 1 up to 1 on save', async () => {
    const { onSave } = renderSection();
    fireEvent.change(screen.getByTestId('instellingen-minimale-afname'), { target: { value: '0' } });
    fireEvent.click(screen.getByTestId('instellingen-opslaan'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ minimaleAfname: 1 }));
  });

  it('shows an action error and does not log when onSave fails', async () => {
    renderSection({ onSave: vi.fn().mockResolvedValue(false) });
    fireEvent.click(screen.getByTestId('instellingen-opslaan'));
    expect(await screen.findByTestId('instellingen-error-message')).toHaveTextContent(
      'Er is iets misgegaan. Probeer het opnieuw.'
    );
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });

  it('pre-fills the btw-tarieven rows and the standaardtarief', () => {
    renderSection();
    expect(screen.getByTestId('instellingen-btw-standaard')).toHaveValue(21);
    expect(screen.getByTestId('instellingen-btw-percentage-0')).toHaveValue(21);
    expect(screen.getByTestId('instellingen-btw-land-0')).toHaveTextContent('Nederland');
  });

  it('adds a new land+percentage row via "Land toevoegen"', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('instellingen-btw-toevoegen'));
    expect(screen.getByTestId('instellingen-btw-land-1')).toBeInTheDocument();
    fireEvent.focus(screen.getByTestId('instellingen-btw-land-1'));
    fireEvent.click(screen.getByTestId('instellingen-btw-land-1-option-BE'));
    fireEvent.change(screen.getByTestId('instellingen-btw-percentage-1'), { target: { value: '6' } });
    fireEvent.click(screen.getByTestId('instellingen-opslaan'));
    expect(screen.getByTestId('instellingen-btw-land-1')).toHaveTextContent('België');
  });

  it('removes a row via its verwijder-knop', () => {
    renderSection({
      btwTarieven: {
        tarieven: [
          { land: 'NL', percentage: 21 },
          { land: 'BE', percentage: 6 },
        ],
        standaardPercentage: 21,
      },
    });
    expect(screen.getByTestId('instellingen-btw-land-1')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('instellingen-btw-verwijderen-1'));
    expect(screen.queryByTestId('instellingen-btw-land-1')).not.toBeInTheDocument();
  });

  it('saves btw-tarieven changes via onSaveBtw and logs btwtarieven_gewijzigd', async () => {
    const { onSaveBtw } = renderSection();
    fireEvent.change(screen.getByTestId('instellingen-btw-percentage-0'), { target: { value: '20' } });
    fireEvent.click(screen.getByTestId('instellingen-opslaan'));
    await waitFor(() =>
      expect(onSaveBtw).toHaveBeenCalledWith({
        tarieven: [{ land: 'NL', percentage: 20 }],
        standaardPercentage: 21,
      })
    );
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('btwtarieven_gewijzigd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/components/beheer/InstellingenSection.test.tsx`
Expected: FAIL — the new props/testids don't exist yet on the unmodified component.

- [ ] **Step 4: Implement the btw-tarieven block in `InstellingenSection.tsx`**

Replace the full contents of `src/components/beheer/InstellingenSection.tsx` with:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import { Combobox } from '@/components/Combobox';
import { LAND_OPTIONS, landNaam } from '@/data/landen';
import type { Bestelinstellingen } from './bestelinstellingenTypes';
import type { BtwTarief, BtwTarieven } from './btwTarievenTypes';

interface InstellingenSectionProps {
  bestelinstellingen: Bestelinstellingen | null;
  loadError: string | null;
  onSave: (data: Bestelinstellingen) => Promise<boolean>;
  btwTarieven: BtwTarieven | null;
  btwLoadError: string | null;
  onSaveBtw: (data: BtwTarieven) => Promise<boolean>;
}

export function InstellingenSection({
  bestelinstellingen,
  loadError,
  onSave,
  btwTarieven,
  btwLoadError,
  onSaveBtw,
}: InstellingenSectionProps) {
  const t = useTranslations('beheer');
  const { user } = useAdminAuth();
  const [form, setForm] = useState<Bestelinstellingen | null>(bestelinstellingen);
  const [btwForm, setBtwForm] = useState<BtwTarieven | null>(btwTarieven);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setForm(bestelinstellingen);
  }, [bestelinstellingen]);

  useEffect(() => {
    setBtwForm(btwTarieven);
  }, [btwTarieven]);

  if (loadError) {
    return (
      <p data-testid="instellingen-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (form === null) {
    return null;
  }

  function updateTarief(index: number, updates: Partial<BtwTarief>) {
    setBtwForm((current) =>
      current
        ? { ...current, tarieven: current.tarieven.map((t, i) => (i === index ? { ...t, ...updates } : t)) }
        : current
    );
  }

  function addTarief() {
    setBtwForm((current) =>
      current ? { ...current, tarieven: [...current.tarieven, { land: '', percentage: 0 }] } : current
    );
  }

  function removeTarief(index: number) {
    setBtwForm((current) =>
      current ? { ...current, tarieven: current.tarieven.filter((_, i) => i !== index) } : current
    );
  }

  async function handleSave() {
    if (!form) return;
    setActionError(null);
    const clamped = { minimaleAfname: Math.max(1, Math.round(form.minimaleAfname) || 1) };
    const success = await onSave(clamped);
    if (!success) {
      setActionError(t('instellingenActionError'));
      return;
    }
    setForm(clamped);
    void logActiviteit('bestelinstellingen_gewijzigd', actorFromMedewerker(user));

    if (btwForm) {
      const btwSuccess = await onSaveBtw(btwForm);
      if (!btwSuccess) {
        setActionError(t('instellingenActionError'));
        return;
      }
      void logActiviteit('btwtarieven_gewijzigd', actorFromMedewerker(user));
    }
  }

  return (
    <div data-testid="instellingen-section" className="flex flex-col gap-6 text-sm text-white/80">
      <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
        {t('instellingenLabelMinimaleAfname')}
        <input
          type="number"
          min={1}
          value={form.minimaleAfname}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            setForm((current) =>
              current ? { ...current, minimaleAfname: Number.isFinite(parsed) ? parsed : 0 } : current
            );
          }}
          data-testid="instellingen-minimale-afname"
          className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
        />
      </label>

      {btwLoadError && (
        <p data-testid="instellingen-btw-error" className="text-xs text-red-400">
          {btwLoadError}
        </p>
      )}

      {btwForm && (
        <div className="flex flex-col gap-3 border-t border-white/10 pt-6">
          <span className="text-xs uppercase tracking-wide text-white/60">{t('instellingenBtwTarievenTitel')}</span>

          {btwForm.tarieven.map((tarief, index) => (
            <div key={index} className="flex items-end gap-2">
              <label className="flex flex-1 flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
                {t('instellingenBtwLand')}
                <Combobox
                  options={LAND_OPTIONS}
                  value={tarief.land || null}
                  onChange={(value) => updateTarief(index, { land: value ?? '' })}
                  placeholder={t('instellingenBtwLand')}
                  noResultsLabel={t('instellingenBtwLand')}
                  testId={`instellingen-btw-land-${index}`}
                />
              </label>
              <label className="flex w-28 flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
                {t('instellingenBtwPercentage')}
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={tarief.percentage}
                  onChange={(event) => updateTarief(index, { percentage: Number(event.target.value) })}
                  data-testid={`instellingen-btw-percentage-${index}`}
                  className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
                />
              </label>
              <button
                type="button"
                onClick={() => removeTarief(index)}
                data-testid={`instellingen-btw-verwijderen-${index}`}
                className="btn-beheer-secondary rounded-sm border border-white/20 px-3 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('instellingenBtwVerwijderen')}
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addTarief}
            data-testid="instellingen-btw-toevoegen"
            className="btn-beheer-secondary self-start rounded-sm border border-white/20 px-3 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
          >
            {t('instellingenBtwToevoegen')}
          </button>

          <label className="flex w-40 flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('instellingenBtwStandaardtarief')}
            <input
              type="number"
              min={0}
              step={0.1}
              value={btwForm.standaardPercentage}
              onChange={(event) =>
                setBtwForm((current) =>
                  current ? { ...current, standaardPercentage: Number(event.target.value) } : current
                )
              }
              data-testid="instellingen-btw-standaard"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
        </div>
      )}

      {actionError && (
        <p data-testid="instellingen-error-message" className="text-xs text-red-400">
          {actionError}
        </p>
      )}

      <button
        type="button"
        onClick={handleSave}
        data-testid="instellingen-opslaan"
        className="self-start btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
      >
        {t('instellingenOpslaan')}
      </button>
    </div>
  );
}
```

Note on the read-only-land-display helper (`landNaam`) imported here but not directly called in this file's JSX: it's used by the `toHaveTextContent('Nederland')` test assertions indirectly through `Combobox`'s own `selectedLabel` lookup (Combobox resolves `value` → `label` internally from `options`), so no separate call is needed here — remove the unused `landNaam` import if `tsc`/lint flags it as unused (it will be: only `LAND_OPTIONS` is actually referenced in this file's JSX). Import only `LAND_OPTIONS`:

```tsx
import { LAND_OPTIONS } from '@/data/landen';
```

- [ ] **Step 5: Wire the new settings record into `BeheerShell.tsx`**

Add the import at the top, next to the existing `bestelinstellingenTypes`/`bestelinstellingenSeed` imports:

```tsx
import type { BtwTarieven } from './btwTarievenTypes';
import { BTWTARIEVEN_SEED } from '@/data/btwTarievenSeed';
```

Add the new `useApiRecord` call right after the existing `bestelinstellingen` one:

```tsx
  const bestelinstellingen = useApiRecord<Bestelinstellingen>('instellingen', 'bestelinstellingen', {
    seed: BESTELINSTELLINGEN_SEED,
  });
  const btwtarieven = useApiRecord<BtwTarieven>('instellingen', 'btwtarieven', {
    seed: BTWTARIEVEN_SEED,
  });
```

Update the `InstellingenSection` render call to pass the new props:

```tsx
        ) : activeSection === 'instellingen' ? (
          <InstellingenSection
            bestelinstellingen={bestelinstellingen.data}
            loadError={bestelinstellingen.error === 'load' ? t('instellingenLoadError') : null}
            onSave={bestelinstellingen.save}
            btwTarieven={btwtarieven.data}
            btwLoadError={btwtarieven.error === 'load' ? t('instellingenLoadError') : null}
            onSaveBtw={btwtarieven.save}
```

(Keep whatever closing bracket/props follow on the next line unchanged.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/components/beheer/InstellingenSection.test.tsx`
Expected: PASS (all tests, old and new).

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/beheer/InstellingenSection.tsx src/components/beheer/BeheerShell.tsx messages/nl.json tests/components/beheer/InstellingenSection.test.tsx
git commit -m "feat: add a beheerbare btw-tarieven list to the beheer Instellingen screen"
```

---

### Task 6: Btw breakdown in the beheer bestelling popup

**Files:**
- Modify: `src/components/beheer/BestellingModal.tsx`
- Modify: `src/components/beheer/BestellingenSection.tsx`
- Modify: `src/components/beheer/BeheerShell.tsx`
- Modify: `messages/nl.json` (the `beheer` block, near the existing `bestellingenModalTotal*` keys)
- Test: `tests/components/beheer/BestellingModal.test.tsx`

**Interfaces:**
- Consumes: `BtwTarieven` (Task 1/5), `Klant` (now with `land`/`invoiceLand`, Task 4).
- Produces: `BestellingModalProps` gains `klanten: Klant[] | null` and `btwTarieven: BtwTarieven | null`. `BestellingenSectionProps` gains `btwTarieven: BtwTarieven | null` (it already receives `klanten`).

- [ ] **Step 1: Add the new i18n keys**

In `messages/nl.json`, inside the `beheer` block, add right after `"bestellingenModalTotalIncomplete": "Wordt nog vastgesteld",`:

```json
    "bestellingenModalTotalIncomplete": "Wordt nog vastgesteld",
    "bestellingenModalBtwLabel": "Btw ({percentage}%)",
    "bestellingenModalTotaalInclLabel": "Totaal incl. btw",
```

- [ ] **Step 2: Write the failing tests**

Add a `KLANTEN` fixture and thread it through `renderModal` in `tests/components/beheer/BestellingModal.test.tsx`. Update the top of the file:

```tsx
import type { Klant } from '@/components/beheer/KlantenSection';
import type { BtwTarieven } from '@/components/beheer/btwTarievenTypes';
```

Add fixtures right after `MATERIAALSOORTEN`:

```tsx
const KLANTEN: Klant[] = [
  {
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
    kunstenaarId: null,
  },
];
const BTWTARIEVEN: BtwTarieven = { tarieven: [{ land: 'NL', percentage: 21 }], standaardPercentage: 21 };
```

Update `renderModal` to accept and pass these (matching `BESTELLING.klantId === 'uid-1'`, already true per the existing `BESTELLING` fixture):

```tsx
function renderModal(bestelling: Bestelling | null) {
  const onClose = vi.fn();
  const onUpdated = vi.fn();
  const onLinePrijsVastgesteld = vi.fn();
  const onLineUpdated = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <BestellingModal
        bestelling={bestelling}
        kunstwerken={KUNSTWERKEN}
        materialen={MATERIALEN}
        maten={MATEN}
        materiaalsoorten={MATERIAALSOORTEN}
        klanten={KLANTEN}
        btwTarieven={BTWTARIEVEN}
        onClose={onClose}
        onUpdated={onUpdated}
        onLinePrijsVastgesteld={onLinePrijsVastgesteld}
        onLineUpdated={onLineUpdated}
      />
    </NextIntlClientProvider>
  );
  return { onClose, onUpdated, onLinePrijsVastgesteld, onLineUpdated };
}
```

Add new tests inside a new `describe` block, at the end of the file:

```tsx
describe('BestellingModal — btw', () => {
  it('shows the btw percentage, btw-bedrag and totaal incl. btw based on the klant land', () => {
    renderModal(BESTELLING);
    // total excl. btw = 450 (see the bestelling-totaal describe block above)
    expect(screen.getByTestId('bestelling-modal-btw')).toHaveTextContent('21');
    expect(screen.getByTestId('bestelling-modal-btw')).toHaveTextContent('€ 94,50');
    expect(screen.getByTestId('bestelling-modal-totaal-incl')).toHaveTextContent('€ 544,50');
  });

  it('falls back to standaardPercentage when the klant has no land set', () => {
    const klantZonderLand = { ...KLANTEN[0], land: undefined };
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <BestellingModal
          bestelling={BESTELLING}
          kunstwerken={KUNSTWERKEN}
          materialen={MATERIALEN}
          maten={MATEN}
          materiaalsoorten={MATERIAALSOORTEN}
          klanten={[klantZonderLand]}
          btwTarieven={{ tarieven: [{ land: 'DE', percentage: 19 }], standaardPercentage: 21 }}
          onClose={vi.fn()}
          onUpdated={vi.fn()}
          onLinePrijsVastgesteld={vi.fn()}
          onLineUpdated={vi.fn()}
        />
      </NextIntlClientProvider>
    );
    expect(screen.getByTestId('bestelling-modal-btw')).toHaveTextContent('21');
  });

  it('shows no btw block when the total itself is incomplete', () => {
    renderModal(BESTELLING_MET_EIGEN_MAAT);
    expect(screen.queryByTestId('bestelling-modal-btw')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-totaal-incl')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx`
Expected: FAIL — `bestelling-modal-btw`/`bestelling-modal-totaal-incl` don't exist yet; TypeScript will also flag the missing `klanten`/`btwTarieven` props until Step 4 is done (run `npx tsc --noEmit` if the test runner errors out before even reaching assertions).

- [ ] **Step 4: Implement the btw computation in `BestellingModal.tsx`**

Add the import at the top:

```tsx
import type { Klant } from './KlantenSection';
import type { BtwTarieven } from './btwTarievenTypes';
```

Add `klanten: Klant[] | null;` and `btwTarieven: BtwTarieven | null;` to `BestellingModalProps`, and destructure them in the function signature:

```tsx
interface BestellingModalProps {
  bestelling: Bestelling | null;
  kunstwerken: Kunstwerk[] | null;
  materialen: Materiaal[] | null;
  maten: Maat[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  klanten: Klant[] | null;
  btwTarieven: BtwTarieven | null;
  onClose: () => void;
  onUpdated: (bestelling: Bestelling) => void;
  onLinePrijsVastgesteld: (bestellingId: string, lineId: string, prijs: number) => void;
  onLineUpdated: (bestellingId: string, lineId: string, updates: Partial<BestellingLine>) => void;
}
```

```tsx
export function BestellingModal({
  bestelling,
  kunstwerken,
  materialen,
  maten,
  materiaalsoorten,
  klanten,
  btwTarieven,
  onClose,
  onUpdated,
  onLinePrijsVastgesteld,
  onLineUpdated,
}: BestellingModalProps) {
```

Right after the existing `totaalWeergave` computation, add the btw computation:

```tsx
  const totaalExclBtwGetal =
    bestelling && !heeftOngeprijsdeRegel
      ? bestelling.lines.reduce((sum, line) => sum + (line.prijs ?? 0) * line.quantity, 0)
      : null;
  const klant = bestelling ? (klanten ?? []).find((k) => k.id === bestelling.klantId) : undefined;
  const land = klant ? klant.invoiceLand || klant.land || null : null;
  const btwPercentage =
    btwTarieven && (btwTarieven.tarieven.find((t) => t.land === land)?.percentage ?? btwTarieven.standaardPercentage);
  const btwBedrag =
    totaalExclBtwGetal !== null && btwPercentage != null ? totaalExclBtwGetal * (btwPercentage / 100) : null;
  const totaalInclBtw = totaalExclBtwGetal !== null && btwBedrag !== null ? totaalExclBtwGetal + btwBedrag : null;
```

In the `subtitle` JSX (added in the prior redesign), inside the totaal block (right after the existing `bestelling-modal-total` paragraph), add the two new rows. `data-testid="bestelling-modal-btw"` deliberately wraps both the label and the amount in one element (not just the amount `<p>`), since the test asserts both the percentage text and the formatted amount against that same testid:

```tsx
                {totaalWeergave !== null && (
                  <div className="shrink-0 text-right">
                    <p className="text-[0.65rem] uppercase tracking-wide text-white/40">{t('bestellingenModalTotalLabel')}</p>
                    <p data-testid="bestelling-modal-total" className="text-sm font-semibold text-white tabular-nums">
                      {totaalWeergave}
                    </p>
                    {btwBedrag !== null && (
                      <div data-testid="bestelling-modal-btw" className="mt-1">
                        <p className="text-[0.65rem] uppercase tracking-wide text-white/40">
                          {t('bestellingenModalBtwLabel', { percentage: btwPercentage })}
                        </p>
                        <p className="text-sm text-white/80 tabular-nums">{formatCurrency(btwBedrag)}</p>
                      </div>
                    )}
                    {totaalInclBtw !== null && (
                      <div className="mt-1">
                        <p className="text-[0.65rem] uppercase tracking-wide text-white/40">
                          {t('bestellingenModalTotaalInclLabel')}
                        </p>
                        <p data-testid="bestelling-modal-totaal-incl" className="text-sm font-semibold text-white tabular-nums">
                          {formatCurrency(totaalInclBtw)}
                        </p>
                      </div>
                    )}
                  </div>
                )}
```

- [ ] **Step 5: Thread `klanten`/`btwTarieven` through `BestellingenSection.tsx`**

Add `btwTarieven: BtwTarieven | null;` to `BestellingenSectionProps` (it already has `klanten: Klant[] | null;`), destructure it in the function signature, import the type, and pass both `klanten` and `btwTarieven` to the `<BestellingModal>` call:

```tsx
import type { BtwTarieven } from './btwTarievenTypes';
```

```tsx
interface BestellingenSectionProps {
  bestellingen: Bestelling[] | null;
  kunstwerken: Kunstwerk[] | null;
  materialen: Materiaal[] | null;
  maten: Maat[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  klanten: Klant[] | null;
  btwTarieven: BtwTarieven | null;
  drukkers: Drukker[] | null;
  loadError: string | null;
  onBestellingUpdated: (bestelling: Bestelling) => void;
  onLinePrijsVastgesteld: (bestellingId: string, lineId: string, prijs: number) => void;
  onLineUpdated: (bestellingId: string, lineId: string, updates: Partial<BestellingLine>) => void;
}
```

```tsx
export function BestellingenSection({
  bestellingen,
  kunstwerken,
  materialen,
  maten,
  materiaalsoorten,
  klanten,
  btwTarieven,
  drukkers,
  loadError,
  onBestellingUpdated,
  onLinePrijsVastgesteld,
  onLineUpdated,
}: BestellingenSectionProps) {
```

```tsx
      <BestellingModal
        bestelling={selectedBestelling}
        kunstwerken={kunstwerken}
        materialen={materialen}
        maten={maten}
        materiaalsoorten={materiaalsoorten}
        klanten={klanten}
        btwTarieven={btwTarieven}
        onClose={() => setSelectedBestelling(null)}
```

- [ ] **Step 6: Pass `btwTarieven` from `BeheerShell.tsx`**

Update the existing `<BestellingenSection>` render call, adding `btwTarieven={btwtarieven.data}` (right after the existing `klanten={klanten}` line):

```tsx
          <BestellingenSection
            bestellingen={bestellingen}
            kunstwerken={kunstwerken.items}
            materialen={materialen.items}
            maten={maten.items}
            materiaalsoorten={materiaalsoorten.items}
            klanten={klanten}
            btwTarieven={btwtarieven.data}
            drukkers={drukkers.items}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx`
Expected: PASS (all tests, old and new).

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS. Also run `npx tsc --noEmit` since `BestellingenSection.test.tsx` and `BeheerShell` compile against the new prop shapes — confirm no type errors from the new required props anywhere they're constructed.

- [ ] **Step 9: Commit**

```bash
git add src/components/beheer/BestellingModal.tsx src/components/beheer/BestellingenSection.tsx src/components/beheer/BeheerShell.tsx messages/nl.json tests/components/beheer/BestellingModal.test.tsx
git commit -m "feat: show btw percentage/bedrag/totaal incl. in the beheer bestelling popup"
```

---

### Task 7: Btw breakdown in the customer order popup

**Files:**
- Modify: `src/components/account/AccountOrderModal.tsx`
- Modify: `src/components/account/OrdersSection.tsx`
- Modify: `messages/nl.json:245-258`, `messages/en.json:248-261`, `messages/de.json:245-258`, `messages/fr.json:245-258` (the `accountPage.orders` block)
- Test: `tests/components/account/AccountOrderModal.test.tsx`
- Test: `tests/components/account/OrdersSection.test.tsx`

**Interfaces:**
- Consumes: `BtwTarieven` (Task 1/5).
- Produces: `AccountOrderModalProps` gains `land: string | null` (the viewing klant's own resolved land — `OrdersSection` computes `invoiceLand || land` once and passes the resolved value down, since `AccountOrderModal` only ever shows the current klant's own orders) and `btwTarieven: BtwTarieven | null`.

- [ ] **Step 1: Add the new i18n keys**

In `messages/nl.json`, inside `accountPage.orders`, add right after `"modalTotalIncomplete": "Wordt nog vastgesteld",` (line 255):

```json
      "modalTotalIncomplete": "Wordt nog vastgesteld",
      "modalBtwLabel": "Btw ({percentage}%)",
      "modalTotaalInclLabel": "Totaal incl. btw",
      "modalTitel": "Bestelling {id}",
```

In `messages/en.json`, same position:
```json
      "modalTotalIncomplete": "To be determined",
      "modalBtwLabel": "VAT ({percentage}%)",
      "modalTotaalInclLabel": "Total incl. VAT",
      "modalTitel": "Order {id}",
```

In `messages/de.json`, same position:
```json
      "modalTotalIncomplete": "Wird noch festgelegt",
      "modalBtwLabel": "MwSt. ({percentage}%)",
      "modalTotaalInclLabel": "Gesamt inkl. MwSt.",
      "modalTitel": "Bestellung {id}",
```

In `messages/fr.json`, same position:
```json
      "modalTotalIncomplete": "À déterminer",
      "modalBtwLabel": "TVA ({percentage}%)",
      "modalTotaalInclLabel": "Total TTC",
      "modalTitel": "Commande {id}",
```

- [ ] **Step 2: Write the failing tests**

Add to `tests/components/account/AccountOrderModal.test.tsx`, a `BTWTARIEVEN` fixture and updated `renderModal` signature:

```tsx
import type { BtwTarieven } from '@/components/beheer/btwTarievenTypes';
```

```tsx
const BTWTARIEVEN: BtwTarieven = { tarieven: [{ land: 'NL', percentage: 21 }], standaardPercentage: 21 };

function renderModal(order: DisplayOrder | null, land: string | null = 'NL', btwTarieven: BtwTarieven | null = BTWTARIEVEN) {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <AccountOrderModal
        order={order}
        kunstwerken={KUNSTWERKEN}
        materialen={MATERIALEN}
        maten={MATEN}
        land={land}
        btwTarieven={btwTarieven}
        onClose={() => {}}
      />
    </NextIntlClientProvider>
  );
}
```

Add new tests inside `describe('AccountOrderModal', ...)` (before its closing `});`):

```tsx
  it('shows the btw percentage, btw-bedrag and totaal incl. btw', () => {
    renderModal({
      id: 'GD-00005',
      date: '1-7-2026',
      time: '14:30',
      status: 'Te beoordelen',
      description: '',
      lines: [
        { id: 'line-1', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 },
        { id: 'line-2', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 50, quantity: 1 },
      ],
    });
    // total excl. btw = 350
    expect(screen.getByTestId('account-order-modal-btw')).toHaveTextContent('21');
    expect(screen.getByTestId('account-order-modal-btw')).toHaveTextContent('€ 73,50');
    expect(screen.getByTestId('account-order-modal-totaal-incl')).toHaveTextContent('€ 423,50');
  });

  it('falls back to standaardPercentage when land is null', () => {
    renderModal(
      {
        id: 'GD-00001',
        date: '1-7-2026',
        time: '14:30',
        status: 'Te beoordelen',
        description: '',
        lines: [{ id: 'line-1', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
      },
      null,
      { tarieven: [{ land: 'DE', percentage: 19 }], standaardPercentage: 21 }
    );
    expect(screen.getByTestId('account-order-modal-btw')).toHaveTextContent('21');
  });

  it('shows no btw block when the total itself is incomplete', () => {
    renderModal({
      id: 'GD-00002',
      date: '2-7-2026',
      time: '09:00',
      status: 'Te beoordelen',
      description: '',
      lines: [
        { id: 'line-2', kunstwerkId: 'kw-1', maatId: '', materiaalId: 'mat-1', breedte: 90, hoogte: 140, prijs: null, quantity: 1 },
      ],
    });
    expect(screen.queryByTestId('account-order-modal-btw')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-order-modal-totaal-incl')).not.toBeInTheDocument();
  });
```

Add to `tests/components/account/OrdersSection.test.tsx`: extend the `beforeEach`'s `fetchMock.mockImplementation` to also serve `/api/klanten/me` and `/api/instellingen/btwtarieven`:

```tsx
let klantMeResponse: unknown = { land: 'NL', invoiceLand: '' };
let btwTarievenResponse: unknown = { tarieven: [{ land: 'NL', percentage: 21 }], standaardPercentage: 21 };

beforeEach(() => {
  window.localStorage.clear();
  authUser = null;
  ordersResponse = { ok: true, body: [] };
  kunstwerkenResponse = [];
  klantMeResponse = { land: 'NL', invoiceLand: '' };
  btwTarievenResponse = { tarieven: [{ land: 'NL', percentage: 21 }], standaardPercentage: 21 };
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/auth/me?type=klant') {
      return { ok: true, json: async () => ({ user: authUser }) };
    }
    if (url === '/api/klanten/me') {
      return { ok: true, json: async () => klantMeResponse };
    }
    if (url === '/api/instellingen/btwtarieven') {
      return { ok: true, json: async () => btwTarievenResponse };
    }
    if (url.startsWith('/api/bestelheaders')) {
      return { ok: ordersResponse.ok, json: async () => ordersResponse.body };
    }
    if (url === '/api/kunstwerken') {
      return { ok: true, json: async () => kunstwerkenResponse };
    }
    return { ok: true, json: async () => [] };
  });
});
```

Add one new test verifying the fetched land reaches the modal:

```tsx
  it('passes the klant\'s own land through to the order modal for btw calculation', async () => {
    klantMeResponse = { land: 'BE', invoiceLand: '' };
    signedInWithOneOrder();
    ordersResponse.body[0].lines[0].prijs = 100;
    renderSection();
    await waitFor(() => expect(screen.getByTestId('account-order-GD-00001')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('account-order-GD-00001'));
    expect(screen.getByTestId('account-order-modal-total')).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/components/account/AccountOrderModal.test.tsx tests/components/account/OrdersSection.test.tsx`
Expected: FAIL — new testids/props don't exist yet.

- [ ] **Step 4: Implement the btw computation in `AccountOrderModal.tsx`**

Add the import at the top:

```tsx
import type { BtwTarieven } from '@/components/beheer/btwTarievenTypes';
```

Add `land: string | null;` and `btwTarieven: BtwTarieven | null;` to `AccountOrderModalProps`, and destructure them:

```tsx
interface AccountOrderModalProps {
  order: DisplayOrder | null;
  kunstwerken: Kunstwerk[] | null;
  materialen: Materiaal[] | null;
  maten: Maat[] | null;
  land: string | null;
  btwTarieven: BtwTarieven | null;
  onClose: () => void;
}

export function AccountOrderModal({
  order,
  kunstwerken,
  materialen,
  maten,
  land,
  btwTarieven,
  onClose,
}: AccountOrderModalProps) {
```

Right after the existing `totaalWeergave` computation, add:

```tsx
  const totaalExclBtwGetal =
    heeftRegels && !heeftOngeprijsdeRegel
      ? order!.lines!.reduce((sum, line) => sum + (line.prijs ?? 0) * line.quantity, 0)
      : null;
  const btwPercentage =
    btwTarieven && (btwTarieven.tarieven.find((t) => t.land === land)?.percentage ?? btwTarieven.standaardPercentage);
  const btwBedrag =
    totaalExclBtwGetal !== null && btwPercentage != null ? totaalExclBtwGetal * (btwPercentage / 100) : null;
  const totaalInclBtw = totaalExclBtwGetal !== null && btwBedrag !== null ? totaalExclBtwGetal + btwBedrag : null;
```

In the total block inside `subtitle` (right after the existing `account-order-modal-total` paragraph), add:

```tsx
                {btwBedrag !== null && (
                  <div data-testid="account-order-modal-btw" className="mt-1">
                    <p className="text-[0.65rem] uppercase tracking-wide text-white/40">
                      {t('modalBtwLabel', { percentage: btwPercentage })}
                    </p>
                    <p className="text-sm text-white/80 tabular-nums">{formatCurrency(btwBedrag)}</p>
                  </div>
                )}
                {totaalInclBtw !== null && (
                  <div className="mt-1">
                    <p className="text-[0.65rem] uppercase tracking-wide text-white/40">{t('modalTotaalInclLabel')}</p>
                    <p data-testid="account-order-modal-totaal-incl" className="text-sm font-semibold text-white tabular-nums">
                      {formatCurrency(totaalInclBtw)}
                    </p>
                  </div>
                )}
```

- [ ] **Step 5: Thread `land`/`btwTarieven` from `OrdersSection.tsx`**

Add the import at the top:

```tsx
import type { BtwTarieven } from '@/components/beheer/btwTarievenTypes';
import { useApiRecord } from '@/lib/useApiRecord';
import { BTWTARIEVEN_SEED } from '@/data/btwTarievenSeed';
```

Inside `OrdersSection`, add state for the fetched land and the btw-tarieven record:

```tsx
  const btwtarieven = useApiRecord<BtwTarieven>('instellingen', 'btwtarieven', { seed: BTWTARIEVEN_SEED });
  const [ownLand, setOwnLand] = useState<{ land: string | null; invoiceLand: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch('/api/klanten/me');
      if (!response.ok || cancelled) return;
      const klant = (await response.json()) as { land?: string | null; invoiceLand?: string | null };
      if (!cancelled) setOwnLand({ land: klant.land ?? null, invoiceLand: klant.invoiceLand ?? null });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const resolvedLand = ownLand ? ownLand.invoiceLand || ownLand.land || null : null;
```

(Add `useEffect` to the existing `import { useState } from 'react';` line: `import { useEffect, useState } from 'react';`.)

Pass the new props to `<AccountOrderModal>`:

```tsx
      <AccountOrderModal
        order={selectedOrder}
        kunstwerken={kunstwerken.items}
        materialen={materialen.items}
        maten={maten.items}
        land={resolvedLand}
        btwTarieven={btwtarieven.data}
        onClose={() => setSelectedOrder(null)}
      />
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/components/account/AccountOrderModal.test.tsx tests/components/account/OrdersSection.test.tsx`
Expected: PASS (all tests, old and new).

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/account/AccountOrderModal.tsx src/components/account/OrdersSection.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json tests/components/account/AccountOrderModal.test.tsx tests/components/account/OrdersSection.test.tsx
git commit -m "feat: show btw percentage/bedrag/totaal incl. in the customer order popup"
```

---

### Task 8: Full regression + manual visual verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests across the repo pass, including every file touched by Tasks 1–7 and everything untouched.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no output, no errors.

- [ ] **Step 3: Manual visual check in the browser**

Start the dev server, sign in as a klant with a real priced order (e.g. `test1@glassartanddesign.com`, order `GD-00709`):
- Open Instellingen in beheer, confirm the btw-tarieven block shows the NL 21% row and a standaardtarief field; add a second row (e.g. BE 6%), save, reload, confirm it persisted.
- Open the account settings page, confirm the Land field shows "Nederland" and can be changed.
- Open the klant's order in the account popup, confirm "Btw (21%)" and "Totaal incl. btw" appear beneath "Totaal excl. btw", with all four amounts right-aligned/lined up.
- Repeat in beheer: open the same bestelling in `BestellingModal`, confirm the same btw breakdown appears in the header, and that Bewerken/Goedkeuren/Afwijzen still work.
- Change that klant's Land in `KlantModal` to `BE` (matching the new btw-tarieven row added above), reopen the bestelling, confirm the percentage/bedrag update to reflect the new rate — proving the "always live, from current klant land" design decision actually works end-to-end.
- Revert the klant's Land back to `NL` afterward, and remove the temporary BE btw-tarieven row, so the manual check doesn't leave stray state on staging.

- [ ] **Step 4: Report the outcome**

No commit for this task (verification only) — report the manual-check outcome back to the user before considering the feature done.

---

## Self-Review Notes

- **Spec coverage:** Section A (datamodel) → Task 1. Section B (landen-lijst + Land-veld UI) → Tasks 1–4. Section C (btw-tarieven-instelling) → Tasks 1, 5. Section D (btw in de bestelling-header) → Tasks 6–7. i18n section → every task that touches customer- or staff-facing copy. "Niet in scope" items (per-regel btw, historisch tarief, reverse-charge, nieuw nav-item) are not touched by any task.
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code, including the full `landen.ts` country list (no "...rest of countries" elision).
- **Type consistency:** `BtwTarief`/`BtwTarieven` (Task 1) used identically in Tasks 5, 6, 7. `Klant.land`/`Klant.invoiceLand` (Task 4, optional) consumed the same way in Tasks 6 (beheer) and read via a dedicated `/api/klanten/me` fetch in Task 7 (klant, who only ever sees their own record). `formatCurrency`, `Combobox`, `useApiRecord` signatures match their real current source, verified by reading each file before drafting its task.
- **Known test-fixture ripple, called out explicitly per task:** Task 2 updates one existing `RegistrationForm.test.tsx` body assertion; Task 3 updates the shared `KLANT_PROFILE` fixture (propagates to all `...KLANT_PROFILE`-spread assertions automatically); Task 4 updates two existing `KlantModal.test.tsx` exact-`patchBody()` assertions and the shared `KLANT` fixture — each is because `land`/`invoiceLand` join the same generic diff-and-send machinery as every other field, not because of an unrelated behavior change.
