# Website-veld bij kunstenaar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional `website` field to `Kunstenaar` and, when filled in, automatically append a translated sentence with a clickable link to the artist's description in the public kunstenaar-banner — replacing the hand-typed link Jack Liemburg's record currently has.

**Architecture:** One new nullable `website VARCHAR(500)` column on `kunstenaars`, threaded through the existing generic CRUD layer (`TABLE_COLUMNS`), the admin `KunstenaarsSection` form, and a new pure helper (`appendKunstenaarWebsiteZin`) that composes the translated sentence onto the locale-resolved description before it reaches the existing `LinkifiedText` component — reusing its auto-linkification rather than adding new link logic. A one-off data migration both adds the column and cleans up Jack Liemburg's existing hand-typed sentence.

**Tech Stack:** Next.js 14 (App Router), TypeScript, `next-intl`, raw `mysql2`, Vitest + `@testing-library/react`.

## Global Constraints

- `beheer` (admin) translation namespace exists **only** in `messages/nl.json` — admin UI is Dutch-only.
- Customer-facing namespaces (`collectionsPage` among them) exist in all four locale files (`nl`, `en`, `de`, `fr`) — any new customer-facing key must be added to all four.
- Every component test wraps render in `<NextIntlClientProvider locale="nl" messages={messages}>` importing `messages/nl.json`.
- `npm run build` type-checks the whole project including everything under `tests/` (`tsconfig.json`'s `include` covers `**/*.ts`/`**/*.tsx` with no test exclusion) — adding a required field to `Kunstenaar` breaks every file that constructs a full `Kunstenaar`-shaped literal until fixed.
- `TABLE_COLUMNS` in `src/lib/server/tableColumns.ts` is the allow-list `insertRow`/`updateRow` use to build column lists — an unlisted column throws rather than being silently dropped. A new column needs a migration, `db/schema.sql`, and this file kept in sync.
- Migration files live in `db/migrations/YYYY-MM-DD-<slug>.sql`, must not contain a semicolon inside a string literal (the runner splits statements on `;`), and comment lines must start with `--` at the start of the line (whole-line comments only).
- **Never run a migration against `productie`, and never dispatch a production deploy, without asking Joris first** — this plan only takes the feature through staging; promoting it is a separate, explicitly-approved step outside this plan (see "Wat dit plan bewust niet doet").

---

### Task 1: `website`-kolom — schema, migratie, type, allow-list

**Files:**
- Create: `db/migrations/2026-08-10-kunstenaar-website.sql`
- Modify: `db/schema.sql:113-122` (kolom in `kunstenaars`)
- Modify: `src/lib/server/tableColumns.ts:62-70` (kolom in `TABLE_COLUMNS.kunstenaars`)
- Modify: `src/components/beheer/kunstenaarTypes.ts` (`Kunstenaar`-interface)
- Modify: `tests/lib/resolveKunstenaarOmschrijving.test.ts:5-14` (`BASE_KUNSTENAAR`-fixture)
- Modify: `tests/lib/resolveOrderRight.test.ts:5-16` (`kunstenaar()`-factory)
- Modify: `tests/components/beheer/KunstenaarsSection.test.tsx:132-143` (`KUNSTENAARS`-fixture)
- Modify: `tests/components/beheer/KunstwerkenSection.test.tsx` (`KUNSTENAARS`-fixture)
- Modify: `tests/components/beheer/KlantModal.test.tsx` (`KUNSTENAARS`-fixture, 2 entries)
- Modify: `tests/components/ProductModal.test.tsx` (`KUNSTENAARS`-fixture, 3 entries)

**Interfaces:**
- Consumes: niets.
- Produces: kolom `kunstenaars.website VARCHAR(500) NULL` in de staging-database, en `Kunstenaar.website: string | null` — elke volgende taak gaat hiervan uit.

- [ ] **Step 1: Schrijf het migratiebestand**

Maak `db/migrations/2026-08-10-kunstenaar-website.sql`:

```sql
-- Migration for kunstenaar.website (2026-08-10)
-- Run once against a database still on the pre-migration schema.
-- Nullable: only kunstenaars with an own site fill it in; existing rows stay
-- NULL until someone fills it in via het beheer-formulier.
ALTER TABLE kunstenaars ADD COLUMN website VARCHAR(500);

-- One-off data cleanup: Jack Liemburg's omschrijving had the website hand-typed
-- as a trailing sentence in all 4 languages -- the exact pattern this feature
-- replaces. Move it into the new column and strip the sentence back out, so the
-- description shows the automatically-generated version like every other
-- kunstenaar going forward.
UPDATE kunstenaars
SET
  website = 'https://www.jacksart.nl/',
  omschrijvingNl = REPLACE(
    omschrijvingNl,
    CONCAT(CHAR(10), CHAR(10), 'Meer weten over Jack? Bekijk https://www.jacksart.nl/'),
    ''
  ),
  omschrijvingFr = REPLACE(
    omschrijvingFr,
    CONCAT(CHAR(10), CHAR(10), 'En savoir plus sur Jack ? Rendez-vous sur https://www.jacksart.nl/en/'),
    ''
  ),
  omschrijvingDe = REPLACE(
    omschrijvingDe,
    CONCAT(CHAR(10), CHAR(10), 'Mehr über Jack erfahren? Besuchen Sie https://www.jacksart.nl/de/'),
    ''
  ),
  omschrijvingEn = REPLACE(
    omschrijvingEn,
    CONCAT(CHAR(10), CHAR(10), 'Want to know more about Jack? Visit https://www.jacksart.nl/en/'),
    ''
  )
WHERE naam = 'Jack Liemburg';
```

- [ ] **Step 2: Werk `db/schema.sql` bij**

In het `CREATE TABLE kunstenaars`-blok, direct na `foto VARCHAR(500),`:

```sql
CREATE TABLE kunstenaars (
  id CHAR(36) PRIMARY KEY,
  naam VARCHAR(255) NOT NULL,
  foto VARCHAR(500),
  website VARCHAR(500),
  omschrijvingNl TEXT,
  omschrijvingFr TEXT,
  omschrijvingDe TEXT,
  omschrijvingEn TEXT,
  exclusieveKlantIds JSON
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 3: Voeg `website` toe aan `TABLE_COLUMNS.kunstenaars`**

In `src/lib/server/tableColumns.ts`, in de `kunstenaars`-array, direct na `'foto',`:

```ts
  kunstenaars: [
    'id',
    'naam',
    'foto',
    'website',
    'omschrijvingNl',
    'omschrijvingFr',
    'omschrijvingDe',
    'omschrijvingEn',
    'exclusieveKlantIds',
  ],
```

- [ ] **Step 4: Voeg `website` toe aan de `Kunstenaar`-interface**

In `src/components/beheer/kunstenaarTypes.ts`, direct na `foto: string | null;`:

```ts
export interface Kunstenaar {
  id: string;
  naam: string;
  foto: string | null;
  website: string | null;
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;
  // Let op: `prijsafspraken` staat bewust NIET in deze publiek leesbare tabel,
  // maar in de medewerker-only tabel `kunstenaarAfspraken` (zelfde id).
  // Max 2 entries: leeg = open voor iedereen; 2 entries vereist dat één ervan de
  // klant is wiens Klant.kunstenaarId naar deze kunstenaar wijst (afgedwongen in
  // KunstenaarsSection, niet in de database).
  exclusieveKlantIds: string[];
}
```

- [ ] **Step 5: Bevestig de verwachte compile-breuken**

Run: `npx tsc --noEmit`
Expected: FAIL, met `Property 'website' is missing` fouten in precies deze 6 bestanden (en nergens anders):
`tests/lib/resolveKunstenaarOmschrijving.test.ts`, `tests/lib/resolveOrderRight.test.ts`,
`tests/components/beheer/KunstenaarsSection.test.tsx`,
`tests/components/beheer/KunstwerkenSection.test.tsx`,
`tests/components/beheer/KlantModal.test.tsx`, `tests/components/ProductModal.test.tsx`.

- [ ] **Step 6: Fix `tests/lib/resolveKunstenaarOmschrijving.test.ts`**

```ts
const BASE_KUNSTENAAR: Kunstenaar = {
  id: 'ka-1',
  naam: 'Sabrina Glasser',
  foto: null,
  website: null,
  omschrijvingNl: 'Nederlandse tekst',
  omschrijvingFr: 'Texte français',
  omschrijvingDe: 'Deutscher Text',
  omschrijvingEn: 'English text',
  exclusieveKlantIds: [],
};
```

- [ ] **Step 7: Fix `tests/lib/resolveOrderRight.test.ts`**

```ts
function kunstenaar(overrides: Partial<Kunstenaar> = {}): Kunstenaar {
  return {
    id: 'ka-1',
    naam: 'Sabrina Glasser',
    foto: null,
    website: null,
    omschrijvingNl: '',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    exclusieveKlantIds: [],
    ...overrides,
  };
}
```

- [ ] **Step 8: Fix `tests/components/beheer/KunstenaarsSection.test.tsx`**

```ts
const KUNSTENAARS: Kunstenaar[] = [
  {
    id: 'ka-1',
    naam: 'Sabrina Glasser',
    foto: null,
    website: null,
    omschrijvingNl: 'Werkt met gesmolten glas.',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    exclusieveKlantIds: [],
  },
];
```

- [ ] **Step 9: Fix `tests/components/beheer/KunstwerkenSection.test.tsx`**

Zoek de `KUNSTENAARS: Kunstenaar[]`-array (rond regel 62) en voeg `website: null,` toe direct na `foto: null,` in het enige entry.

- [ ] **Step 10: Fix `tests/components/beheer/KlantModal.test.tsx`**

Zoek de `KUNSTENAARS: Kunstenaar[]`-array (rond regel 53) en voeg `website: null,` toe direct na `foto: null,` in beide entries (`ka-1` en `ka-2`).

- [ ] **Step 11: Fix `tests/components/ProductModal.test.tsx`**

Zoek de `KUNSTENAARS: Kunstenaar[]`-array (rond regel 94) en voeg `website: null,` toe direct na `foto: null,` in alle drie de entries (`ka-open`, `ka-exclusief`, `ka-eigen`).

- [ ] **Step 12: Bevestig dat de compile-fouten weg zijn**

Run: `npx tsc --noEmit`
Expected: geen fouten.

- [ ] **Step 13: Draai de bestaande testsuite**

Run: `npm test`
Expected: PASS — deze taak verandert geen gedrag, alleen types en fixtures.

- [ ] **Step 14: Draai de migratie tegen staging**

Run: `npm run db:migrate -- staging`
Expected: output toont `2026-08-10-kunstenaar-website.sql (2 statements)` met beide statements gelukt, en `genoteerd in schema_migrations`.

- [ ] **Step 15: Verifieer de opschoning van Jack Liemburg's record**

Run vanuit de projectroot:

```bash
node -e "
require('dotenv').config({path:'.env.local'});
const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({host:process.env.DB_HOST,port:process.env.DB_PORT,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
  const [rows] = await conn.query('SELECT website, omschrijvingNl, omschrijvingFr, omschrijvingDe, omschrijvingEn FROM kunstenaars WHERE naam = ?', ['Jack Liemburg']);
  console.log(JSON.stringify(rows, null, 2));
  await conn.end();
})();
"
```

Expected: `website` is `"https://www.jacksart.nl/"`, en geen van de 4 omschrijving-velden bevat nog de substring `Bekijk`/`Rendez-vous`/`Besuchen`/`Visit` — de tekst eindigt nu gewoon op de laatste normale zin (bv. `omschrijvingNl` eindigt op `"...particuliere verzamelaars."`).

- [ ] **Step 16: Commit**

```bash
git add db/schema.sql db/migrations/2026-08-10-kunstenaar-website.sql src/lib/server/tableColumns.ts src/components/beheer/kunstenaarTypes.ts tests/lib/resolveKunstenaarOmschrijving.test.ts tests/lib/resolveOrderRight.test.ts tests/components/beheer/KunstenaarsSection.test.tsx tests/components/beheer/KunstwerkenSection.test.tsx tests/components/beheer/KlantModal.test.tsx tests/components/ProductModal.test.tsx
git commit -m "feat: voeg website-kolom toe aan kunstenaar en schoon Jack Liemburg's record op"
```

---

### Task 2: Website-veld in het admin-formulier

**Files:**
- Modify: `src/components/beheer/KunstenaarsSection.tsx`
- Modify: `messages/nl.json` (nieuwe key `kunstenaarsLabelWebsite`, `beheer`-namespace)
- Modify: `tests/components/beheer/KunstenaarsSection.test.tsx`

**Interfaces:**
- Consumes: `Kunstenaar.website: string | null` (Task 1).
- Produces: niets nieuws voor latere taken — Task 3/4 gebruiken `Kunstenaar.website` rechtstreeks, niet iets uit dit formulier.

- [ ] **Step 1: Schrijf de falende test voor het tonen en opslaan van het veld**

Voeg toe in `tests/components/beheer/KunstenaarsSection.test.tsx`, na de test `'adds a new kunstenaar with an uploaded photo and one exclusieve klant'` (rond regel 258):

```tsx
  it('adds a new kunstenaar with a website filled in', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstenaars-add'));
    fireEvent.change(screen.getByTestId('kunstenaar-modal-naam'), { target: { value: 'Nieuwe Kunstenaar' } });
    fireEvent.change(screen.getByTestId('kunstenaar-modal-omschrijving-nl'), { target: { value: 'Werkt met glas.' } });
    fireEvent.change(screen.getByTestId('kunstenaar-modal-website'), {
      target: { value: 'https://www.voorbeeld.nl/' },
    });
    fireEvent.click(screen.getByTestId('kunstenaar-modal-opslaan'));

    await waitFor(() => expect(kunstenaarPostCall()).toBeDefined());
    expect(JSON.parse(kunstenaarPostCall()![1].body as string)).toEqual({
      foto: null,
      naam: 'Nieuwe Kunstenaar',
      website: 'https://www.voorbeeld.nl/',
      omschrijvingNl: 'Werkt met glas.',
      omschrijvingFr: '',
      omschrijvingDe: '',
      omschrijvingEn: '',
      exclusieveKlantIds: [],
    });
  });

  it('pre-fills the website field when opening an existing kunstenaar, leaving it blank when null', async () => {
    renderSection({
      kunstenaars: [{ ...KUNSTENAARS[0], website: 'https://www.jacksart.nl/' }],
    });
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));
    expect(screen.getByTestId('kunstenaar-modal-website')).toHaveValue('https://www.jacksart.nl/');
  });

  it('leaves the website field blank when the kunstenaar has none', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));
    expect(screen.getByTestId('kunstenaar-modal-website')).toHaveValue('');
  });
```

- [ ] **Step 2: Bevestig dat de nieuwe tests falen**

Run: `npx vitest run tests/components/beheer/KunstenaarsSection.test.tsx -t "website"`
Expected: FAIL — `kunstenaar-modal-website` bestaat nog niet.

- [ ] **Step 3: Voeg de i18n-key toe**

In `messages/nl.json`, direct na `"kunstenaarsLabelNaam": "Naam",` (regel 696):

```json
    "kunstenaarsLabelWebsite": "Website",
```

- [ ] **Step 4: Voeg het veld toe aan `KunstenaarsSection.tsx`**

`LEGE_FORM` (regel 30-39), direct na `naam: '',`:

```ts
const LEGE_FORM = {
  foto: null as string | null,
  naam: '',
  website: '' as string,
  omschrijvingNl: '',
  omschrijvingFr: '',
  omschrijvingDe: '',
  omschrijvingEn: '',
  prijsafspraken: '',
  prijsopslag: 0 as number,
};
```

Nieuwe `useState`, direct na `const [naam, setNaam] = useState(LEGE_FORM.naam);` (regel 55):

```ts
  const [website, setWebsite] = useState(LEGE_FORM.website);
```

`resetForm` (regel 110-123), direct na `setNaam(LEGE_FORM.naam);`:

```ts
    setWebsite(LEGE_FORM.website);
```

`openEdit` (regel 132-166), direct na `setNaam(kunstenaar.naam);` — `kunstenaar.website` kan `null` zijn (bestaande kunstenaars zonder site), dus normaliseer naar `''` net als bij een net-aangemaakt formulier:

```ts
    setWebsite(kunstenaar.website ?? '');
```

`handleSave`'s `data`-payload (regel 241-249), direct na `naam,`:

```ts
    const data = {
      foto,
      naam,
      website,
      omschrijvingNl,
      omschrijvingFr,
      omschrijvingDe,
      omschrijvingEn,
      exclusieveKlantIds,
    };
```

Het formulier zelf: nieuw veld direct ná het Naam-label (regel 437-449) en vóór het Omschrijving (NL)-label (regel 451):

```tsx
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstenaarsLabelWebsite')}
            <input
              type="text"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              data-testid="kunstenaar-modal-website"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
```

Geen `RequiredMark`: het veld is optioneel, dus `opslaanDisabled` (regel 223) blijft ongewijzigd.

- [ ] **Step 5: Bevestig dat de nieuwe tests slagen**

Run: `npx vitest run tests/components/beheer/KunstenaarsSection.test.tsx -t "website"`
Expected: PASS.

- [ ] **Step 6: Werk de twee bestaande payload-assertions bij**

In de test `'adds a new kunstenaar with an uploaded photo and one exclusieve klant'`, voeg `website: '',` toe aan de verwachte payload (direct na `naam: 'Nieuwe Kunstenaar',`):

```ts
    expect(JSON.parse(kunstenaarPostCall()![1].body as string)).toEqual({
      foto: 'https://storage.example.com/nieuw.jpg',
      naam: 'Nieuwe Kunstenaar',
      website: '',
      omschrijvingNl: 'Werkt met glas.',
      omschrijvingFr: '',
      omschrijvingDe: '',
      omschrijvingEn: '',
      exclusieveKlantIds: ['klant-1'],
    });
```

In de test `'opens a row for editing pre-filled and updates it, keeping its exclusieveKlantIds'`, voeg `website: '',` toe aan de verwachte `onUpdate`-call (direct na `naam: 'Sabrina G.',`):

```ts
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('ka-1', {
        foto: null,
        naam: 'Sabrina G.',
        website: '',
        omschrijvingNl: 'Werkt met gesmolten glas.',
        omschrijvingFr: '',
        omschrijvingDe: '',
        omschrijvingEn: '',
        exclusieveKlantIds: ['klant-1'],
      })
    );
```

(De `KUNSTENAARS[0]`-fixture heeft `website: null` uit Task 1, dus `openEdit` normaliseert dat naar `''` — vandaar `website: ''` in de verwachte payload, niet `null`.)

- [ ] **Step 7: Run de volledige testfile**

Run: `npx vitest run tests/components/beheer/KunstenaarsSection.test.tsx`
Expected: PASS, alle tests.

- [ ] **Step 8: Commit**

```bash
git add src/components/beheer/KunstenaarsSection.tsx messages/nl.json tests/components/beheer/KunstenaarsSection.test.tsx
git commit -m "feat: voeg website-veld toe aan het kunstenaar-formulier"
```

---

### Task 3: `appendKunstenaarWebsiteZin`-helper

**Files:**
- Modify: `src/lib/resolveKunstenaarOmschrijving.ts`
- Modify: `tests/lib/resolveKunstenaarOmschrijving.test.ts`

**Interfaces:**
- Consumes: niets nieuws.
- Produces: `appendKunstenaarWebsiteZin(omschrijving: string, zin: string | null): string`, gebruikt door Task 4.

- [ ] **Step 1: Schrijf de falende tests**

Voeg toe aan `tests/lib/resolveKunstenaarOmschrijving.test.ts`, na de bestaande `import`-regels:

```ts
import { appendKunstenaarWebsiteZin } from '@/lib/resolveKunstenaarOmschrijving';
```

En een nieuw `describe`-blok aan het eind van het bestand:

```ts
describe('appendKunstenaarWebsiteZin', () => {
  it('appends the sentence after a blank line when a sentence is given', () => {
    expect(appendKunstenaarWebsiteZin('Basistekst.', 'Meer weten? Bekijk https://example.com/')).toBe(
      'Basistekst.\n\nMeer weten? Bekijk https://example.com/'
    );
  });

  it('returns the description unchanged when there is no sentence', () => {
    expect(appendKunstenaarWebsiteZin('Basistekst.', null)).toBe('Basistekst.');
  });
});
```

- [ ] **Step 2: Bevestig dat de tests falen**

Run: `npx vitest run tests/lib/resolveKunstenaarOmschrijving.test.ts`
Expected: FAIL — `appendKunstenaarWebsiteZin` bestaat nog niet.

- [ ] **Step 3: Implementeer de functie**

In `src/lib/resolveKunstenaarOmschrijving.ts`, aan het eind van het bestand:

```ts
export function appendKunstenaarWebsiteZin(omschrijving: string, zin: string | null): string {
  return zin ? `${omschrijving}\n\n${zin}` : omschrijving;
}
```

- [ ] **Step 4: Bevestig dat de tests slagen**

Run: `npx vitest run tests/lib/resolveKunstenaarOmschrijving.test.ts`
Expected: PASS, alle tests (bestaande + nieuwe).

- [ ] **Step 5: Commit**

```bash
git add src/lib/resolveKunstenaarOmschrijving.ts tests/lib/resolveKunstenaarOmschrijving.test.ts
git commit -m "feat: voeg appendKunstenaarWebsiteZin-helper toe"
```

---

### Task 4: Publieke weergave in de kunstenaar-banner

**Files:**
- Modify: `messages/nl.json`, `messages/fr.json`, `messages/de.json`, `messages/en.json` (`collectionsPage`-namespace)
- Modify: `src/components/ProductsGrid.tsx`
- Modify: `tests/components/ProductsGrid.test.tsx`

**Interfaces:**
- Consumes: `appendKunstenaarWebsiteZin` (Task 3), `Kunstenaar.website` (Task 1).
- Produces: niets nieuws voor latere taken — dit is de laatste feature-taak.

- [ ] **Step 1: Schrijf de falende tests**

Voeg toe aan `tests/components/ProductsGrid.test.tsx`, na de test `'filters by kunstenaar and shows the artist info banner with their description'` (rond regel 305). Voeg ook `within` toe aan de bestaande `@testing-library/react`-import op regel 2:

```ts
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
```

```tsx
  it('adds a translated website sentence with a clickable link to the artist banner when website is filled in', async () => {
    mockCollections({
      kunstenaars: [{ ...KUNSTENAARS[0], website: 'https://www.jacksart.nl/' }],
    });
    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    fireEvent.focus(screen.getByTestId('kunstenaar-filter'));
    fireEvent.click(screen.getByTestId('kunstenaar-filter-option-ka-1'));
    const banner = screen.getByTestId('kunstenaar-banner');
    expect(banner).toHaveTextContent('Meer weten over Sabrina Glasser? Bekijk https://www.jacksart.nl/');
    expect(within(banner).getByRole('link')).toHaveAttribute('href', 'https://www.jacksart.nl/');
  });

  it('does not add a website sentence to the artist banner when website is empty', async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    fireEvent.focus(screen.getByTestId('kunstenaar-filter'));
    fireEvent.click(screen.getByTestId('kunstenaar-filter-option-ka-1'));
    expect(within(screen.getByTestId('kunstenaar-banner')).queryByRole('link')).not.toBeInTheDocument();
  });
```

(`KUNSTENAARS[0]` is de bestaande `ka-1`-fixture in dit testbestand — die heeft geen `website`-property, dus TypeScript vereist niets extra: de array is untyped en gaat in `mockCollections`'s `Record<string, unknown[]>`.)

- [ ] **Step 2: Bevestig dat de tests falen**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx -t "website"`
Expected: FAIL — er verschijnt nog geen zin/link in de banner.

- [ ] **Step 3: Voeg de i18n-key toe aan alle 4 talen**

In `messages/nl.json`, direct na `"kunstenaarFilterNoResults": "Geen kunstenaars gevonden",` (regel 39):

```json
    "kunstenaarWebsiteZin": "Meer weten over {naam}? Bekijk {website}",
```

In `messages/fr.json`, op dezelfde plek (na `kunstenaarFilterNoResults`):

```json
    "kunstenaarWebsiteZin": "En savoir plus sur {naam} ? Rendez-vous sur {website}",
```

In `messages/de.json`, op dezelfde plek:

```json
    "kunstenaarWebsiteZin": "Mehr über {naam} erfahren? Besuchen Sie {website}",
```

In `messages/en.json`, op dezelfde plek:

```json
    "kunstenaarWebsiteZin": "Want to know more about {naam}? Visit {website}",
```

- [ ] **Step 4: Composeer en render de zin in `ProductsGrid.tsx`**

Import (regel 17), voeg `appendKunstenaarWebsiteZin` toe:

```ts
import { resolveKunstenaarOmschrijving, appendKunstenaarWebsiteZin } from '@/lib/resolveKunstenaarOmschrijving';
```

De banner (regel 295-315):

```tsx
      {geselecteerdeKunstenaar && (
        <div
          data-testid="kunstenaar-banner"
          className="mb-8 flex items-center gap-4 rounded border border-white/10 p-4 text-left"
        >
          {geselecteerdeKunstenaar.foto && (
            <img
              src={geselecteerdeKunstenaar.foto}
              alt={geselecteerdeKunstenaar.naam}
              className="h-20 w-20 rounded-full object-cover"
            />
          )}
          <div>
            <p className="font-head text-sm font-semibold text-white">{geselecteerdeKunstenaar.naam}</p>
            <LinkifiedText
              text={appendKunstenaarWebsiteZin(
                resolveKunstenaarOmschrijving(geselecteerdeKunstenaar, locale),
                geselecteerdeKunstenaar.website
                  ? tCollections('kunstenaarWebsiteZin', {
                      naam: geselecteerdeKunstenaar.naam,
                      website: geselecteerdeKunstenaar.website,
                    })
                  : null
              )}
              className="text-xs text-white/70"
            />
          </div>
        </div>
      )}
```

- [ ] **Step 5: Bevestig dat de tests slagen**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx`
Expected: PASS, alle tests (bestaande + nieuwe).

- [ ] **Step 6: Commit**

```bash
git add messages/nl.json messages/fr.json messages/de.json messages/en.json src/components/ProductsGrid.tsx tests/components/ProductsGrid.test.tsx
git commit -m "feat: toon website-zin met klikbare link in de kunstenaar-banner"
```

---

### Task 5: Volledige verificatie

**Files:**
- Geen wijzigingen; dit is de eindcontrole over de hele branch.

**Interfaces:**
- Consumes: alles uit Task 1 t/m 4.
- Produces: bewijs dat de branch klaar is voor review en staging-deploy.

- [ ] **Step 1: Draai de volledige testsuite**

Run: `npm test`
Expected: PASS, geen falende bestanden.

- [ ] **Step 2: Controleer types en lint**

Run: `npx tsc --noEmit`
Expected: geen fouten.

Run: `npm run lint`
Expected: geen fouten.

- [ ] **Step 3: Controleer de staging-data nog eens**

Herhaal de `SELECT` uit Task 1, Step 15. Bevestig dat `website` en de 4 omschrijving-velden nog steeds correct staan (niets in latere taken schrijft naar de database).

- [ ] **Step 4: Commit eventuele restwijzigingen**

Als de stappen hierboven niets veranderd hebben, is er niets te committen — noteer dat expliciet in plaats van een lege commit te maken.

---

## Wat dit plan bewust niet doet

- Geen productie-migratie en geen productie-deploy. `db/migrations/2026-08-10-kunstenaar-website.sql` wordt pas tegen productie gedraaid ná verificatie op staging (inclusief de deploy-staging-workflow en een handmatige DirectAdmin-restart) en met expliciete toestemming van Joris, als aparte stap buiten dit plan — zie de deploy-regels in `CLAUDE.md`.
- Geen per-taal website-velden, geen URL-formaatvalidatie, geen wijziging aan `ProductModal.tsx` of aan `LinkifiedText` — zie "Niet in scope" in het ontwerp (`docs/superpowers/specs/2026-08-10-kunstenaar-website-design.md`).
