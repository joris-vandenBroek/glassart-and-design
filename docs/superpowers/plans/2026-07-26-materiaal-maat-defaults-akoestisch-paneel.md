# Materiaal/maat standaard "alles beschikbaar" + Akoestisch paneel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New kunstwerken default to "all materialen/maten available"; existing kunstwerken get a one-click backfill; the product card and bestel-popup lead with 4mm Veiligheidsglas; and "Akoestische stof" stops being a printable materiaal and becomes its own free-size, price-per-m² kunstwerk ("Akoestisch paneel").

**Architecture:** Small, targeted changes across the existing beheer (`KunstwerkenSection.tsx`), public catalog (`ProductsGrid.tsx`, `KunstwerkSpecCard.tsx`) and bestel-popup (`ProductModal.tsx`) components, plus one new shared pure-function module (`src/lib/kunstwerkMateriaal.ts`) that both the card and the popup use to decide "which materiaal to prefer / how to label it". No new collections; one new optional field (`prijsPerM2`) on the existing `Kunstwerk` type, used only when `materiaalIds` is empty.

**Tech Stack:** Next.js 14, React 18, TypeScript, next-intl, Firebase (client SDK, Firestore), Vitest + Testing Library.

## Global Constraints

- Beheer (admin) UI strings live only in `messages/nl.json` — the `beheer` namespace does not exist in `en.json`/`de.json`/`fr.json`. Do not add beheer keys to those 3 files.
- The public-facing `kunstwerkSpecCard` and `cart` namespaces exist in all 4 locale files (`messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json`) and must stay in sync when a key is added or removed there.
- Firestore writes go through `addDoc`/`updateDoc` from the `firebase` client SDK (`src/lib/useFirestoreCollection.ts`), which reject any field whose value is `undefined`. When a field is only sometimes relevant (like `prijsPerM2`), omit the key entirely for the other case — never set it to `undefined`.
- `src/data/materials.ts` (the `MATERIALS` array with ids like `safety-glass`, `acoustic-fabric`) is a **different, unrelated** static list used for marketing/USP icons elsewhere on the site. Do not touch it — none of the tasks below touch it, and it must stay untouched.
- Run tests with `npx vitest run <path>` (repo test script is `npm test` = `vitest run`, no watch mode).
- The existing "eigen maat" (custom size) flow in `ProductModal.tsx` always adds the cart line with `prijs: null` (price decided later, manually). The new materiaalloos flow built in Task 7 is the only custom-size path that computes and shows a real price live.

---

## File Map

- `src/data/materiaalsoortenSeed.ts` — remove "Akoestische stof" (Task 1)
- `src/lib/kunstwerkMateriaal.ts` — **new**: shared pure functions for "which materiaal to prefer" / "how to label it" (Task 2)
- `src/components/KunstwerkSpecCard.tsx` — drop Formaten row, `materiaalLabels: string[]` → `materiaalLabel: string` (Task 2)
- `src/components/ProductsGrid.tsx` — use the new helper, drop maat/materiaal label plumbing (Task 2)
- `src/components/beheer/KunstwerkenSection.tsx` — preview wiring (Task 2); "alles aangevinkt" default + backfill button (Task 4); collapsible Materialen/Maten (Task 5); materiaalloos `prijsPerM2` support (Task 6)
- `src/components/ProductModal.tsx` — default materiaal preference (Task 3); materiaalloos ordering path (Task 7)
- `src/components/beheer/materiaalTypes.ts` — add `prijsPerM2?: number` to `Kunstwerk` (Task 6)
- `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json` — remove `kunstwerkSpecCard.formaten`; add 3 new nl-only beheer keys (Tasks 2, 4, 5, 6)
- `tests/data/materiaalsoortenSeed.test.ts`, `tests/lib/kunstwerkMateriaal.test.ts` (new), `tests/components/KunstwerkSpecCard.test.tsx` (new), `tests/components/ProductsGrid.test.tsx`, `tests/components/beheer/KunstwerkenSection.test.tsx`, `tests/components/ProductModal.test.tsx` — test changes matching each task

---

### Task 1: Remove "Akoestische stof" from the materiaalsoorten seed

**Files:**
- Modify: `src/data/materiaalsoortenSeed.ts`
- Test: `tests/data/materiaalsoortenSeed.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `MATERIAALSOORTEN_SEED` and `buildMaterialenSeed()` no longer mention "Akoestische stof" — later tasks (2, 6, 7) treat "no materiaal available" as the materiaalloos signal, so this seed must not create one for it.

- [ ] **Step 1: Update the failing test expectations**

Edit `tests/data/materiaalsoortenSeed.test.ts` to match the desired (reduced) output:

```ts
import { describe, expect, it } from 'vitest';
import { MATERIAALSOORTEN_SEED, buildMaterialenSeed } from '@/data/materiaalsoortenSeed';
import type { Materiaalsoort } from '@/components/beheer/materiaalTypes';

describe('MATERIAALSOORTEN_SEED', () => {
  it('contains the 3 printable material types, with eigen-maat settings for glas/dibond/acryl', () => {
    expect(MATERIAALSOORTEN_SEED).toEqual([
      { omschrijving: 'Veiligheidsglas', staatEigenMaatToe: true, levertijdMaandenEigenMaat: 3 },
      { omschrijving: 'Dibond', staatEigenMaatToe: true, maxBreedte: 200, maxHoogte: 300 },
      { omschrijving: 'Acryl', staatEigenMaatToe: true, maxBreedte: 200, maxHoogte: 300 },
    ]);
  });
});

describe('buildMaterialenSeed', () => {
  const SOORTEN: Materiaalsoort[] = [
    { id: 'soort-veiligheidsglas', omschrijving: 'Veiligheidsglas' },
    { id: 'soort-dibond', omschrijving: 'Dibond' },
    { id: 'soort-acryl', omschrijving: 'Acryl' },
  ];

  it('builds one materiaal per homepage entry, referencing the given materiaalsoort ids', () => {
    const result = buildMaterialenSeed(SOORTEN);
    expect(result).toEqual([
      { materiaalsoortId: 'soort-veiligheidsglas', materiaaldikte: 4, omschrijving: 'Onze specialiteit. Kristalhelder, sterk en veilig.' },
      { materiaalsoortId: 'soort-dibond', materiaaldikte: 3, omschrijving: 'Lichtgewicht, stijf en vormvast met een matte uitstraling.' },
      { materiaalsoortId: 'soort-acryl', materiaaldikte: 3, omschrijving: 'Licht en helder met een luxe glanzende look.' },
      { materiaalsoortId: 'soort-acryl', materiaaldikte: 5, omschrijving: 'Extra diepte en stevigheid voor een indrukwekkend effect.' },
      { materiaalsoortId: 'soort-acryl', materiaaldikte: 10, omschrijving: 'Maximale diepwerking voor exclusieve presentatie.' },
    ]);
  });

  it('returns nothing for a materiaalsoort with no seed mapping', () => {
    const result = buildMaterialenSeed([{ id: 'soort-onbekend', omschrijving: 'Onbekend' }]);
    expect(result).toEqual([]);
  });

  it('returns an empty array for an empty materiaalsoorten list', () => {
    expect(buildMaterialenSeed([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/data/materiaalsoortenSeed.test.ts`
Expected: FAIL — actual `MATERIAALSOORTEN_SEED` still contains "Akoestische stof", actual `buildMaterialenSeed` result still contains the akoestisch entry.

- [ ] **Step 3: Remove Akoestische stof from the seed source**

Edit `src/data/materiaalsoortenSeed.ts`:

```ts
export const MATERIAALSOORTEN_SEED: Omit<Materiaalsoort, 'id'>[] = [
  { omschrijving: 'Veiligheidsglas', staatEigenMaatToe: true, levertijdMaandenEigenMaat: 3 },
  { omschrijving: 'Dibond', staatEigenMaatToe: true, maxBreedte: 200, maxHoogte: 300 },
  { omschrijving: 'Acryl', staatEigenMaatToe: true, maxBreedte: 200, maxHoogte: 300 },
];

const MATERIAAL_SEED_BY_SOORT: Record<string, { materiaaldikte: number; omschrijving: string }[]> = {
  Veiligheidsglas: [
    { materiaaldikte: 4, omschrijving: 'Onze specialiteit. Kristalhelder, sterk en veilig.' },
  ],
  Dibond: [
    { materiaaldikte: 3, omschrijving: 'Lichtgewicht, stijf en vormvast met een matte uitstraling.' },
  ],
  Acryl: [
    { materiaaldikte: 3, omschrijving: 'Licht en helder met een luxe glanzende look.' },
    { materiaaldikte: 5, omschrijving: 'Extra diepte en stevigheid voor een indrukwekkend effect.' },
    { materiaaldikte: 10, omschrijving: 'Maximale diepwerking voor exclusieve presentatie.' },
  ],
};
```

(The `buildMaterialenSeed` function itself is unchanged — it only ever iterates over `materiaalsoorten` passed in and looks them up in `MATERIAAL_SEED_BY_SOORT`, so removing the "Akoestische stof" key from both is sufficient.)

- [ ] **Step 4: Run the test again to confirm it passes**

Run: `npx vitest run tests/data/materiaalsoortenSeed.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/materiaalsoortenSeed.ts tests/data/materiaalsoortenSeed.test.ts
git commit -m "feat: remove Akoestische stof from the materiaalsoorten seed"
```

---

### Task 2: Shared materiaal-label helper; card drops Formaten, shows 4mm Veiligheidsglas

**Files:**
- Create: `src/lib/kunstwerkMateriaal.ts`
- Create: `tests/lib/kunstwerkMateriaal.test.ts`
- Modify: `src/components/KunstwerkSpecCard.tsx`
- Create: `tests/components/KunstwerkSpecCard.test.tsx`
- Modify: `src/components/ProductsGrid.tsx`
- Modify: `tests/components/ProductsGrid.test.tsx`
- Modify: `src/components/beheer/KunstwerkenSection.tsx` (preview section only, lines ~544-563)
- Modify: `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json` (remove `kunstwerkSpecCard.formaten`)

**Interfaces:**
- Consumes: `Kunstwerk`, `Materiaal`, `Materiaalsoort` from `src/components/beheer/materiaalTypes.ts`
- Produces:
  - `findVeiligheidsglasMateriaalId(materialen: Materiaal[], materiaalsoorten: Materiaalsoort[]): string | undefined`
  - `resolveKunstwerkMateriaalLabel(kunstwerk: Pick<Kunstwerk, 'materiaalIds'>, materialen: Materiaal[], materiaalsoorten: Materiaalsoort[]): string`
  - `MATERIAALLOOS_LABEL: string` (constant, value `'Akoestische stof'`)
  - `KunstwerkSpecCard` prop `materiaalLabel: string` (replaces `materiaalLabels: string[]`); prop `maatLabels` and the Formaten row are gone entirely.
  - Task 7 imports `MATERIAALLOOS_LABEL` from this same module.

- [ ] **Step 1: Write the failing helper test**

Create `tests/lib/kunstwerkMateriaal.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  findVeiligheidsglasMateriaalId,
  resolveKunstwerkMateriaalLabel,
  MATERIAALLOOS_LABEL,
} from '@/lib/kunstwerkMateriaal';
import type { Kunstwerk, Materiaal, Materiaalsoort } from '@/components/beheer/materiaalTypes';

const MATERIAALSOORTEN: Materiaalsoort[] = [
  { id: 'soort-glas', omschrijving: 'Veiligheidsglas' },
  { id: 'soort-acryl', omschrijving: 'Acryl' },
];
const MATERIALEN: Materiaal[] = [
  { id: 'mat-glas-4', materiaalsoortId: 'soort-glas', materiaaldikte: 4, omschrijving: 'Glas' },
  { id: 'mat-acryl-3', materiaalsoortId: 'soort-acryl', materiaaldikte: 3, omschrijving: 'Acryl' },
  { id: 'mat-acryl-5', materiaalsoortId: 'soort-acryl', materiaaldikte: 5, omschrijving: 'Acryl' },
];
const BASE_KUNSTWERK: Kunstwerk = {
  id: 'kw-1',
  foto: '',
  naam: '',
  artiest: '',
  segmentIds: [],
  materiaalIds: [],
  maatIds: [],
  prijzen: [],
  omschrijvingNl: '',
  omschrijvingFr: '',
  omschrijvingDe: '',
  omschrijvingEn: '',
};

describe('findVeiligheidsglasMateriaalId', () => {
  it('finds the 4mm Veiligheidsglas materiaal id', () => {
    expect(findVeiligheidsglasMateriaalId(MATERIALEN, MATERIAALSOORTEN)).toBe('mat-glas-4');
  });

  it('returns undefined when no 4mm Veiligheidsglas materiaal exists', () => {
    expect(findVeiligheidsglasMateriaalId(MATERIALEN.slice(1), MATERIAALSOORTEN)).toBeUndefined();
  });
});

describe('resolveKunstwerkMateriaalLabel', () => {
  it('shows "4mm Veiligheidsglas" when that materiaal is available, regardless of what else is checked', () => {
    const kunstwerk = { ...BASE_KUNSTWERK, materiaalIds: ['mat-glas-4', 'mat-acryl-3'] };
    expect(resolveKunstwerkMateriaalLabel(kunstwerk, MATERIALEN, MATERIAALSOORTEN)).toBe('4mm Veiligheidsglas');
  });

  it('joins all available materiaal labels when Veiligheidsglas is not among them', () => {
    const kunstwerk = { ...BASE_KUNSTWERK, materiaalIds: ['mat-acryl-3', 'mat-acryl-5'] };
    expect(resolveKunstwerkMateriaalLabel(kunstwerk, MATERIALEN, MATERIAALSOORTEN)).toBe('3mm Acryl | 5mm Acryl');
  });

  it('falls back to the materiaalloos label when no materiaal is available', () => {
    const kunstwerk = { ...BASE_KUNSTWERK, materiaalIds: [] };
    expect(resolveKunstwerkMateriaalLabel(kunstwerk, MATERIALEN, MATERIAALSOORTEN)).toBe(MATERIAALLOOS_LABEL);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/lib/kunstwerkMateriaal.test.ts`
Expected: FAIL with "Cannot find module '@/lib/kunstwerkMateriaal'"

- [ ] **Step 3: Create the helper module**

Create `src/lib/kunstwerkMateriaal.ts`:

```ts
import type { Kunstwerk, Materiaal, Materiaalsoort } from '@/components/beheer/materiaalTypes';

const VEILIGHEIDSGLAS_SOORT_NAAM = 'Veiligheidsglas';
const VEILIGHEIDSGLAS_DIKTE = 4;

export const MATERIAALLOOS_LABEL = 'Akoestische stof';

export function findVeiligheidsglasMateriaalId(
  materialen: Materiaal[],
  materiaalsoorten: Materiaalsoort[]
): string | undefined {
  const veiligheidsglasSoortIds = new Set(
    materiaalsoorten
      .filter((soort) => soort.omschrijving === VEILIGHEIDSGLAS_SOORT_NAAM)
      .map((soort) => soort.id)
  );
  return materialen.find(
    (materiaal) =>
      veiligheidsglasSoortIds.has(materiaal.materiaalsoortId) && materiaal.materiaaldikte === VEILIGHEIDSGLAS_DIKTE
  )?.id;
}

export function resolveKunstwerkMateriaalLabel(
  kunstwerk: Pick<Kunstwerk, 'materiaalIds'>,
  materialen: Materiaal[],
  materiaalsoorten: Materiaalsoort[]
): string {
  const veiligheidsglasId = findVeiligheidsglasMateriaalId(materialen, materiaalsoorten);
  if (veiligheidsglasId && kunstwerk.materiaalIds.includes(veiligheidsglasId)) {
    return `${VEILIGHEIDSGLAS_DIKTE}mm ${VEILIGHEIDSGLAS_SOORT_NAAM}`;
  }

  const beschikbareMaterialen = materialen.filter((materiaal) => kunstwerk.materiaalIds.includes(materiaal.id));
  if (beschikbareMaterialen.length > 0) {
    const materiaalsoortNaamById = new Map(materiaalsoorten.map((soort) => [soort.id, soort.omschrijving]));
    return beschikbareMaterialen
      .map(
        (materiaal) =>
          `${materiaal.materiaaldikte}mm ${materiaalsoortNaamById.get(materiaal.materiaalsoortId) ?? materiaal.materiaalsoortId}`
      )
      .join(' | ');
  }

  return MATERIAALLOOS_LABEL;
}
```

- [ ] **Step 4: Run the helper test again to confirm it passes**

Run: `npx vitest run tests/lib/kunstwerkMateriaal.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing KunstwerkSpecCard test**

Create `tests/components/KunstwerkSpecCard.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { KunstwerkSpecCard } from '@/components/KunstwerkSpecCard';
import messages from '../../messages/nl.json';
import type { ComponentProps } from 'react';

function renderCard(overrides: Partial<ComponentProps<typeof KunstwerkSpecCard>> = {}) {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <KunstwerkSpecCard
        code="GLS-SAB-009"
        titel="Vibrant Spirit"
        artiest="Sabrina"
        collectieLabels={['Hotel']}
        materiaalLabel="4mm Veiligheidsglas"
        {...overrides}
      />
    </NextIntlClientProvider>
  );
}

describe('KunstwerkSpecCard', () => {
  it('renders the code, title, artiest and collectie', () => {
    renderCard();
    expect(screen.getByTestId('kunstwerk-spec-card-code')).toHaveTextContent('GLS-SAB-009');
    expect(screen.getByTestId('kunstwerk-spec-card-titel')).toHaveTextContent('Vibrant Spirit');
    expect(screen.getByTestId('kunstwerk-spec-card-artiest')).toHaveTextContent('Sabrina');
    expect(screen.getByTestId('kunstwerk-spec-card-collectie')).toHaveTextContent('Hotel');
  });

  it('shows the given materiaal label', () => {
    renderCard({ materiaalLabel: '4mm Veiligheidsglas' });
    expect(screen.getByTestId('kunstwerk-spec-card-materiaal')).toHaveTextContent('4mm Veiligheidsglas');
  });

  it('hides the materiaal row when the label is empty', () => {
    renderCard({ materiaalLabel: '' });
    expect(screen.queryByTestId('kunstwerk-spec-card-materiaal')).not.toBeInTheDocument();
  });

  it('never renders a Formaten row', () => {
    renderCard();
    expect(screen.queryByTestId('kunstwerk-spec-card-formaten')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `npx vitest run tests/components/KunstwerkSpecCard.test.tsx`
Expected: FAIL — component still requires `materiaalLabels`/`maatLabels` props (TS) and still renders a Formaten row.

- [ ] **Step 7: Update KunstwerkSpecCard.tsx**

Edit `src/components/KunstwerkSpecCard.tsx`:

```tsx
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

interface KunstwerkSpecCardProps {
  fotoSlot?: ReactNode;
  code: string;
  titel: string;
  artiest?: string;
  collectieLabels: string[];
  materiaalLabel: string;
}

export function KunstwerkSpecCard({
  fotoSlot,
  code,
  titel,
  artiest,
  collectieLabels,
  materiaalLabel,
}: KunstwerkSpecCardProps) {
  const t = useTranslations('kunstwerkSpecCard');

  return (
    <div data-testid="kunstwerk-spec-card" className="overflow-hidden rounded-lg border border-white/10 bg-white text-ink">
      <div className="flex aspect-[2/3] w-full items-center justify-center bg-white p-4">{fotoSlot}</div>
      <div className="flex flex-col gap-2 px-5 py-6 text-center">
        <p data-testid="kunstwerk-spec-card-code" className="font-head text-lg font-semibold tracking-wide">
          {code || '—'}
        </p>
        {titel && (
          <h3 data-testid="kunstwerk-spec-card-titel" className="font-head italic text-ink/80">
            {titel}
          </h3>
        )}
        {artiest && (
          <p data-testid="kunstwerk-spec-card-artiest" className="text-xs text-ink/60">
            {artiest}
          </p>
        )}
        <hr className="my-2 border-gold/40" />
        <dl className="flex flex-col gap-1 text-xs text-ink/70">
          {collectieLabels.length > 0 && (
            <div data-testid="kunstwerk-spec-card-collectie" className="flex items-baseline justify-between gap-2">
              <dt className="font-semibold">{t('collectie')}</dt>
              <dd>{collectieLabels.join(', ')}</dd>
            </div>
          )}
          {materiaalLabel && (
            <div data-testid="kunstwerk-spec-card-materiaal" className="flex items-baseline justify-between gap-2">
              <dt className="font-semibold">{t('materiaal')}</dt>
              <dd>{materiaalLabel}</dd>
            </div>
          )}
        </dl>
        <hr className="my-2 border-gold/40" />
        <p className="text-sm font-bold uppercase tracking-[0.2em]">Glassart &amp; Design</p>
        <p className="text-[0.6rem] uppercase tracking-[0.2em] text-gold">{t('tagline')}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Remove the `formaten` translation key from all 4 locale files**

In `messages/nl.json`, `messages/en.json`, `messages/de.json` and `messages/fr.json`, each has (around line 34-39):

```json
  "kunstwerkSpecCard": {
    "collectie": "...",
    "materiaal": "...",
    "formaten": "...",
    "tagline": "Gallery quality printing"
  },
```

Delete the `"formaten": "..."` line from each of the 4 files, leaving:

```json
  "kunstwerkSpecCard": {
    "collectie": "...",
    "materiaal": "...",
    "tagline": "Gallery quality printing"
  },
```

- [ ] **Step 9: Run the KunstwerkSpecCard test again to confirm it passes**

Run: `npx vitest run tests/components/KunstwerkSpecCard.test.tsx`
Expected: PASS

- [ ] **Step 10: Write the failing ProductsGrid integration test**

Edit `tests/components/ProductsGrid.test.tsx`. First add a `materiaalsoorten` fixture and register it in `mockCollections`:

```ts
const MATERIAALSOORTEN = [{ id: 'soort-1', data: { omschrijving: 'Veiligheidsglas' } }];
```

```ts
function mockCollections() {
  const data: Record<string, Array<{ id: string; data: Record<string, unknown> }>> = {
    segmenten: SEGMENTEN,
    kunstwerken: KUNSTWERKEN,
    materialen: MATERIALEN,
    maten: MATEN,
    materiaalsoorten: MATERIAALSOORTEN,
  };
  getDocsMock.mockImplementation((collectionRef: { name: string }) =>
    Promise.resolve(makeSnapshot(data[collectionRef.name] ?? []))
  );
}
```

Then add a new test inside `describe('ProductsGrid', ...)`:

```ts
  it('shows the resolved materiaal label on each kunstwerk card', async () => {
    renderProductsGrid();
    const cards = await screen.findAllByTestId('product-card');
    expect(cards[0]).toHaveTextContent('4mm Veiligheidsglas');
  });
```

- [ ] **Step 11: Run it and confirm it fails**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx`
Expected: FAIL — `ProductsGrid.tsx` still passes the old `materiaalLabels`/`maatLabels` props, so the card won't render "4mm Veiligheidsglas" as a single resolved label yet (or the build fails to compile against the new `KunstwerkSpecCard` props).

- [ ] **Step 12: Update ProductsGrid.tsx**

Edit `src/components/ProductsGrid.tsx`. Change the import (drop `materiaalLabel, maatLabel`):

```tsx
import { ProductModal } from './ProductModal';
```

Remove the now-unused `materiaalsoortNaamById` map (former lines 39-41) and, inside the `visibleKunstwerken.map(...)` callback, replace the label computation and the `KunstwerkSpecCard` call:

```tsx
        {visibleKunstwerken.map((kunstwerk) => {
          const omschrijving = resolveKunstwerkOmschrijving(kunstwerk, locale);
          const collectieLabels = kunstwerk.segmentIds.map(
            (segmentId) => segmenten.items?.find((segment) => segment.id === segmentId)?.omschrijving ?? segmentId
          );
          return (
            <div
              key={kunstwerk.id}
              data-testid="product-card"
              role="button"
              tabIndex={0}
              aria-label={omschrijving}
              onClick={() => handleSelect(kunstwerk)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  if (event.key === ' ') {
                    event.preventDefault();
                  }
                  handleSelect(kunstwerk);
                }
              }}
              className="group relative cursor-pointer overflow-hidden rounded border border-white/10 transition hover:-translate-y-1"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-br from-gold/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              />
              <KunstwerkSpecCard
                fotoSlot={
                  <WatermarkedImage src={kunstwerk.foto} alt={omschrijving} className="h-full w-full" fit="contain" />
                }
                code={kunstwerk.naam}
                titel={omschrijving}
                artiest={kunstwerk.artiest}
                collectieLabels={collectieLabels}
                materiaalLabel={resolveKunstwerkMateriaalLabel(kunstwerk, materialen.items ?? [], materiaalsoorten.items ?? [])}
              />
            </div>
          );
        })}
```

Add the import at the top of the file:

```tsx
import { resolveKunstwerkMateriaalLabel } from '@/lib/kunstwerkMateriaal';
```

- [ ] **Step 13: Run the ProductsGrid tests again to confirm they pass**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx`
Expected: PASS (all tests, including the new one)

- [ ] **Step 14: Update the KunstwerkenSection preview wiring (no new test — trivial pass-through of already-tested logic)**

Edit `src/components/beheer/KunstwerkenSection.tsx`. Add the import:

```tsx
import { resolveKunstwerkMateriaalLabel } from '@/lib/kunstwerkMateriaal';
```

Replace the `<KunstwerkSpecCard>` call (former lines 546-562):

```tsx
              <KunstwerkSpecCard
                fotoSlot={
                  foto ? (
                    <img src={foto} alt={naam} data-testid="kunstwerk-spec-card-foto" className="h-full w-full object-contain" />
                  ) : undefined
                }
                code={naam}
                titel={omschrijvingNl}
                artiest={artiest}
                collectieLabels={segmentIds.map((segmentId) => segmentNaamById.get(segmentId) ?? segmentId)}
                materiaalLabel={resolveKunstwerkMateriaalLabel({ materiaalIds }, materialen ?? [], materiaalsoorten ?? [])}
              />
```

- [ ] **Step 15: Run the full KunstwerkenSection test suite to confirm no regression**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: PASS (unchanged — this file doesn't assert on the preview card's materiaal text)

- [ ] **Step 16: Commit**

```bash
git add src/lib/kunstwerkMateriaal.ts tests/lib/kunstwerkMateriaal.test.ts \
  src/components/KunstwerkSpecCard.tsx tests/components/KunstwerkSpecCard.test.tsx \
  src/components/ProductsGrid.tsx tests/components/ProductsGrid.test.tsx \
  src/components/beheer/KunstwerkenSection.tsx \
  messages/nl.json messages/en.json messages/de.json messages/fr.json
git commit -m "feat: card shows one resolved materiaal label, drops Formaten row"
```

---

### Task 3: ProductModal defaults to the 4mm Veiligheidsglas materiaal

**Files:**
- Modify: `src/components/ProductModal.tsx`
- Test: `tests/components/ProductModal.test.tsx`

**Interfaces:**
- Consumes: `findVeiligheidsglasMateriaalId` from `src/lib/kunstwerkMateriaal.ts` (Task 2)
- Produces: no new exports; default-selection behavior only.

- [ ] **Step 1: Write the failing test**

Add to `tests/components/ProductModal.test.tsx`, inside `describe('ProductModal', ...)`:

```tsx
  it('defaults to the 4mm Veiligheidsglas materiaal when available, instead of the first-listed materiaal', () => {
    const MATERIALEN_ACRYL_EERST: Materiaal[] = [
      { id: 'mat-2', materiaalsoortId: 'soort-2', materiaaldikte: 3, omschrijving: 'Lichtgewicht en flexibel voor grote oppervlaktes.' },
      { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'Extra diepte en stevigheid voor een indrukwekkend effect.' },
    ];
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <ProductModal
              kunstwerk={{ ...KUNSTWERK, materiaalIds: ['mat-2', 'mat-1'] }}
              materialen={MATERIALEN_ACRYL_EERST}
              maten={MATEN}
              materiaalsoorten={MATERIAALSOORTEN}
              onClose={() => {}}
            />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );
    expect(screen.getByTestId('product-modal-materiaal')).toHaveValue('mat-1');
  });
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/components/ProductModal.test.tsx`
Expected: FAIL — the new test expects `mat-1` selected, but current code defaults to `kunstwerk.materiaalIds[0]` which is `mat-2`.

- [ ] **Step 3: Update the default-selection effect**

Edit `src/components/ProductModal.tsx`. Add the import:

```ts
import { findVeiligheidsglasMateriaalId } from '@/lib/kunstwerkMateriaal';
```

Replace the init effect:

```ts
  useEffect(() => {
    if (!kunstwerk) {
      return;
    }
    const veiligheidsglasId = findVeiligheidsglasMateriaalId(materialen ?? [], materiaalsoorten ?? []);
    const defaultMateriaalId =
      veiligheidsglasId && kunstwerk.materiaalIds.includes(veiligheidsglasId)
        ? veiligheidsglasId
        : kunstwerk.materiaalIds[0] ?? '';
    setMateriaalId(defaultMateriaalId);
    setMaatId(kunstwerk.maatIds[0] ?? '');
    setCustomBreedte('');
    setCustomHoogte('');
    setQuantity(1);
    setIsConfirmed(false);
  }, [kunstwerk, materialen, materiaalsoorten]);
```

- [ ] **Step 4: Run the full ProductModal test suite to confirm it passes with no regression**

Run: `npx vitest run tests/components/ProductModal.test.tsx`
Expected: PASS (all tests, including the existing "defaults to the first materiaal/maat" test — `KUNSTWERK`'s first materiaal, `mat-1`, already is the Veiligheidsglas one, so that assertion still holds)

- [ ] **Step 5: Commit**

```bash
git add src/components/ProductModal.tsx tests/components/ProductModal.test.tsx
git commit -m "feat: bestel-popup defaults to 4mm Veiligheidsglas when available"
```

---

### Task 4: "Alles aangevinkt" default for new kunstwerken + backfill button for existing ones

**Files:**
- Modify: `src/components/beheer/KunstwerkenSection.tsx`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/KunstwerkenSection.test.tsx`

**Interfaces:**
- Consumes: nothing new
- Produces: `resetForm()` pre-fills `materiaalIds`/`maatIds` with every id from `materialen`/`maten`; new button `data-testid="kunstwerken-backfill-materialen-maten"`.

- [ ] **Step 1: Write the failing tests**

In `tests/components/beheer/KunstwerkenSection.test.tsx`, add a new test for the default, and **replace** 5 existing tests that assumed the add-modal starts with nothing checked (they now start fully checked, so the flows that select "just mat-1 + maat-1" instead uncheck `mat-2`/`maat-2`). Also add 2 new tests for the backfill button.

New test (add anywhere inside `describe('KunstwerkenSection', ...)`):

```tsx
  it('pre-checks every materiaal and maat checkbox when opening "Kunstwerk toevoegen"', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    expect(screen.getByTestId('kunstwerk-modal-materiaal-mat-1')).toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-materiaal-mat-2')).toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-1')).toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-2')).toBeChecked();
  });
```

Replace `'keeps Opslaan disabled until a photo is uploaded, then enables once all required fields are filled'`:

```tsx
  it('keeps Opslaan disabled until a photo is uploaded, then enables once all required fields are filled', async () => {
    uploadMock.mockResolvedValue('https://storage.example.com/nieuw.jpg');
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    expect(screen.getByTestId('kunstwerk-modal-opslaan')).toBeDisabled();

    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-foto-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-foto-preview')).toBeInTheDocument());
    expect(screen.getByTestId('kunstwerk-modal-opslaan')).toBeDisabled();

    fireEvent.click(screen.getByTestId('kunstwerk-modal-segment-seg-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-2'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-maat-maat-2'));
    expect(screen.getByTestId('kunstwerk-modal-opslaan')).toBeDisabled(); // naam, prijs and omschrijving still missing

    fireEvent.change(screen.getByTestId('kunstwerk-modal-naam'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '99' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Test' } });
    expect(screen.getByTestId('kunstwerk-modal-opslaan')).not.toBeDisabled();
  });
```

Replace `'rebuilds the price grid when the materiaal/maat selection changes'`:

```tsx
  it('rebuilds the price grid when the materiaal/maat selection changes', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    expect(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1')).toBeInTheDocument();
    expect(screen.getByTestId('kunstwerk-modal-prijs-mat-2-maat-1')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-2'));
    expect(screen.queryByTestId('kunstwerk-modal-prijs-mat-2-maat-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-1'));
    expect(screen.queryByTestId('kunstwerk-modal-prijs-mat-1-maat-1')).not.toBeInTheDocument();
  });
```

Replace `'adds a new kunstwerk with the uploaded photo, selections, prices and NL description'`:

```tsx
  it('adds a new kunstwerk with the uploaded photo, selections, prices and NL description', async () => {
    uploadMock.mockResolvedValue('https://storage.example.com/nieuw.jpg');
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-foto-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-foto-preview')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('kunstwerk-modal-segment-seg-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-2'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-maat-maat-2'));
    fireEvent.change(screen.getByTestId('kunstwerk-modal-naam'), { target: { value: 'Vibrant Spirit' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-artiest'), { target: { value: 'Sabrina' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '99' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Nieuw kunstwerk' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({
        foto: 'https://storage.example.com/nieuw.jpg',
        naam: 'Vibrant Spirit',
        artiest: 'Sabrina',
        segmentIds: ['seg-1'],
        materiaalIds: ['mat-1'],
        maatIds: ['maat-1'],
        prijzen: [{ materiaalId: 'mat-1', maatId: 'maat-1', prijs: 99 }],
        omschrijvingNl: 'Nieuw kunstwerk',
        omschrijvingFr: '',
        omschrijvingDe: '',
        omschrijvingEn: '',
      })
    );
  });
```

Replace `'logs kunstwerk_toegevoegd with the logged-in medewerker when adding'`:

```tsx
  it('logs kunstwerk_toegevoegd with the logged-in medewerker when adding', async () => {
    uploadMock.mockResolvedValue('https://storage.example.com/nieuw.jpg');
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-foto-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-foto-preview')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('kunstwerk-modal-segment-seg-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-2'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-maat-maat-2'));
    fireEvent.change(screen.getByTestId('kunstwerk-modal-naam'), { target: { value: 'Nieuw kunstwerk' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '99' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Nieuw kunstwerk' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('kunstwerk_toegevoegd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });
```

Replace `'does not log when adding fails'`:

```tsx
  it('does not log when adding fails', async () => {
    uploadMock.mockResolvedValue('https://storage.example.com/nieuw.jpg');
    const onAdd = vi.fn().mockResolvedValue(false);
    renderSection({ onAdd });
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-foto-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-foto-preview')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('kunstwerk-modal-segment-seg-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-2'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-maat-maat-2'));
    fireEvent.change(screen.getByTestId('kunstwerk-modal-naam'), { target: { value: 'Nieuw kunstwerk' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '99' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Nieuw kunstwerk' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    await screen.findByTestId('kunstwerk-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });
```

New tests for the backfill button (add near the existing `'shows a backfill button for kunstwerken without a naam...'` test):

```tsx
  it('shows a "Materialen/maten aanvullen" button when a kunstwerk is missing some materialen or maten, and fills them in on click', async () => {
    const onUpdate = vi.fn().mockResolvedValue(true);
    renderSection({ onUpdate }); // kw-1 only has mat-1/maat-1 out of 2 materialen/2 maten

    const button = screen.getByTestId('kunstwerken-backfill-materialen-maten');
    expect(button).toHaveTextContent('1');
    fireEvent.click(button);

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(
        'kw-1',
        expect.objectContaining({ materiaalIds: ['mat-1', 'mat-2'], maatIds: ['maat-1', 'maat-2'] })
      )
    );
  });

  it('does not show the "Materialen/maten aanvullen" button when every kunstwerk already has everything checked', () => {
    const volledig: Kunstwerk = {
      ...KUNSTWERKEN[0],
      materiaalIds: ['mat-1', 'mat-2'],
      maatIds: ['maat-1', 'maat-2'],
      prijzen: [
        { materiaalId: 'mat-1', maatId: 'maat-1', prijs: 150 },
        { materiaalId: 'mat-1', maatId: 'maat-2', prijs: 175 },
        { materiaalId: 'mat-2', maatId: 'maat-1', prijs: 160 },
        { materiaalId: 'mat-2', maatId: 'maat-2', prijs: 185 },
      ],
    };
    renderSection({ kunstwerken: [volledig] });
    expect(screen.queryByTestId('kunstwerken-backfill-materialen-maten')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the suite and confirm the new/changed tests fail**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: FAIL — add-modal still starts with empty `materiaalIds`/`maatIds`, and there is no `kunstwerken-backfill-materialen-maten` button yet.

- [ ] **Step 3: Add the "alles aangevinkt" default**

Edit `src/components/beheer/KunstwerkenSection.tsx`, `resetForm()`:

```tsx
  function resetForm() {
    setFoto(LEGE_FORM.foto);
    setNaam(LEGE_FORM.naam);
    setArtiest(LEGE_FORM.artiest);
    setSegmentIds(LEGE_FORM.segmentIds);
    setMateriaalIds((materialen ?? []).map((materiaal) => materiaal.id));
    setMaatIds((maten ?? []).map((maat) => maat.id));
    setPrijzen(LEGE_FORM.prijzen);
    setOmschrijvingNl(LEGE_FORM.omschrijvingNl);
    setOmschrijvingFr(LEGE_FORM.omschrijvingFr);
    setOmschrijvingDe(LEGE_FORM.omschrijvingDe);
    setOmschrijvingEn(LEGE_FORM.omschrijvingEn);
    setActionError(null);
  }
```

- [ ] **Step 4: Add the backfill-materialen-maten button**

Edit `src/components/beheer/KunstwerkenSection.tsx`. Add, right after the existing `kunstwerkenZonderNaam`/`handleBackfillNamen` block (former lines 249-261):

```tsx
  const alleMateriaalIds = (materialen ?? []).map((materiaal) => materiaal.id);
  const alleMaatIds = (maten ?? []).map((maat) => maat.id);
  const kunstwerkenZonderAlleMaterialenMaten = kunstwerken.filter(
    (kunstwerk) =>
      alleMateriaalIds.some((id) => !kunstwerk.materiaalIds.includes(id)) ||
      alleMaatIds.some((id) => !kunstwerk.maatIds.includes(id))
  );

  async function handleBackfillMaterialenMaten() {
    setBackfillBezig(true);
    for (const kunstwerk of kunstwerkenZonderAlleMaterialenMaten) {
      const { id, ...data } = kunstwerk;
      const success = await onUpdate(id, { ...data, materiaalIds: alleMateriaalIds, maatIds: alleMaatIds });
      if (success) {
        void logActiviteit('kunstwerk_gewijzigd', actorFromMedewerker(user));
      }
    }
    setBackfillBezig(false);
  }
```

Add the button next to the existing "Namen aanvullen" button (former lines 279-289):

```tsx
      <div className="mb-3 flex justify-end gap-2">
        {kunstwerkenZonderNaam.length > 0 && (
          <button
            type="button"
            onClick={handleBackfillNamen}
            disabled={backfillBezig}
            data-testid="kunstwerken-backfill-namen"
            className="rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white disabled:opacity-40"
          >
            {t('kunstwerkenBackfillNamen', { count: kunstwerkenZonderNaam.length })}
          </button>
        )}
        {kunstwerkenZonderAlleMaterialenMaten.length > 0 && (
          <button
            type="button"
            onClick={handleBackfillMaterialenMaten}
            disabled={backfillBezig}
            data-testid="kunstwerken-backfill-materialen-maten"
            className="rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white disabled:opacity-40"
          >
            {t('kunstwerkenBackfillMaterialenMaten', { count: kunstwerkenZonderAlleMaterialenMaten.length })}
          </button>
        )}
        <button
          type="button"
          onClick={openAdd}
          data-testid="kunstwerken-add"
          className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
        >
          {t('kunstwerkenToevoegen')}
        </button>
      </div>
```

- [ ] **Step 5: Add the new translation key**

In `messages/nl.json`, right after `"kunstwerkenBackfillNamen": "Namen aanvullen ({count})",` add:

```json
    "kunstwerkenBackfillMaterialenMaten": "Materialen/maten aanvullen ({count})",
```

- [ ] **Step 6: Run the suite again to confirm it passes**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/beheer/KunstwerkenSection.tsx messages/nl.json \
  tests/components/beheer/KunstwerkenSection.test.tsx
git commit -m "feat: new kunstwerken default to all materialen/maten, add backfill button"
```

---

### Task 5: Collapsible Materialen/Maten panel in the kunstwerk form

**Files:**
- Modify: `src/components/beheer/KunstwerkenSection.tsx`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/KunstwerkenSection.test.tsx`

**Interfaces:**
- Consumes: nothing new
- Produces: `data-testid="kunstwerk-modal-materialen-maten-toggle"` (the `<summary>`), wrapping a native `<details>` (closed by default).

- [ ] **Step 1: Write the failing test**

Add to `tests/components/beheer/KunstwerkenSection.test.tsx`:

```tsx
  it('keeps the materialen/maten panel collapsed by default and expands it when clicked', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    const toggle = screen.getByTestId('kunstwerk-modal-materialen-maten-toggle');
    expect(toggle.closest('details')).not.toHaveAttribute('open');
    fireEvent.click(toggle);
    expect(toggle.closest('details')).toHaveAttribute('open');
  });
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: FAIL with "Unable to find an element by: [data-testid="kunstwerk-modal-materialen-maten-toggle"]"

- [ ] **Step 3: Wrap the two fieldsets in a closed-by-default `<details>`**

Edit `src/components/beheer/KunstwerkenSection.tsx`. Replace the two separate `<fieldset>` blocks for Materialen and Maten (former lines 393-423) with:

```tsx
          <details className="flex flex-col gap-3 rounded-sm border border-white/10 px-3 py-2">
            <summary
              data-testid="kunstwerk-modal-materialen-maten-toggle"
              className="cursor-pointer text-xs uppercase tracking-wide text-white/60"
            >
              {t('kunstwerkenLabelMaterialenMaten')}
            </summary>
            <fieldset className="flex flex-col gap-1">
              <legend className="text-xs uppercase tracking-wide text-white/60">
                {t('kunstwerkenLabelMaterialen')}
              </legend>
              {(materialen ?? []).map((materiaal) => (
                <label key={materiaal.id} className="flex items-center gap-2 text-sm text-white/80">
                  <input
                    type="checkbox"
                    checked={materiaalIds.includes(materiaal.id)}
                    onChange={() => setMateriaalIds((current) => toggle(current, materiaal.id))}
                    data-testid={`kunstwerk-modal-materiaal-${materiaal.id}`}
                  />
                  {materiaalLabel(materiaal)}
                </label>
              ))}
            </fieldset>

            <fieldset className="flex flex-col gap-1">
              <legend className="text-xs uppercase tracking-wide text-white/60">{t('kunstwerkenLabelMaten')}</legend>
              {(maten ?? []).map((maat) => (
                <label key={maat.id} className="flex items-center gap-2 text-sm text-white/80">
                  <input
                    type="checkbox"
                    checked={maatIds.includes(maat.id)}
                    onChange={() => setMaatIds((current) => toggle(current, maat.id))}
                    data-testid={`kunstwerk-modal-maat-${maat.id}`}
                  />
                  {`${maat.breedte}×${maat.hoogte} cm`}
                </label>
              ))}
            </fieldset>
          </details>
```

(The Segmenten `<fieldset>` right above this, and the price matrix right below it, are untouched — only the Materialen/Maten fieldsets move inside `<details>`.)

- [ ] **Step 4: Add the new translation key**

In `messages/nl.json`, right after `"kunstwerkenLabelSegmenten": "Segmenten",` add:

```json
    "kunstwerkenLabelMaterialenMaten": "Materialen en maten",
```

- [ ] **Step 5: Run the full suite to confirm everything still passes**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: PASS — the collapse test passes, and every other test that clicks a materiaal/maat checkbox via `fireEvent.click` still passes too (`fireEvent` dispatches events directly on the target node regardless of the `<details>` open/closed visual state, so no other test needs to open the panel first).

- [ ] **Step 6: Commit**

```bash
git add src/components/beheer/KunstwerkenSection.tsx messages/nl.json \
  tests/components/beheer/KunstwerkenSection.test.tsx
git commit -m "feat: collapse Materialen/Maten into a closed-by-default panel"
```

---

### Task 6: Materiaalloos support in the beheer form (prijsPerM2)

**Files:**
- Modify: `src/components/beheer/materiaalTypes.ts`
- Modify: `src/components/beheer/KunstwerkenSection.tsx`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/KunstwerkenSection.test.tsx`

**Interfaces:**
- Consumes: nothing new
- Produces: `Kunstwerk.prijsPerM2?: number` (Task 7 reads this in the bestel-popup); `data-testid="kunstwerk-modal-prijs-per-m2"` input; save payload includes `prijsPerM2` only when `materiaalIds` is empty, and always sends `maatIds: []` / `prijzen: []` in that case.

- [ ] **Step 1: Write the failing test**

Add to `tests/components/beheer/KunstwerkenSection.test.tsx`:

```tsx
  it('shows a "Prijs per m²" field instead of the price matrix once every materiaal is unchecked, and saves it', async () => {
    uploadMock.mockResolvedValue('https://storage.example.com/nieuw.jpg');
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materialen-maten-toggle'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-2'));
    expect(screen.queryByTestId('kunstwerk-modal-prijzen')).not.toBeInTheDocument();
    expect(screen.getByTestId('kunstwerk-modal-prijs-per-m2')).toBeInTheDocument();

    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-foto-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-foto-preview')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('kunstwerk-modal-segment-seg-1'));
    fireEvent.change(screen.getByTestId('kunstwerk-modal-naam'), { target: { value: 'Akoestisch paneel' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Verbetert de akoestiek.' } });
    expect(screen.getByTestId('kunstwerk-modal-opslaan')).toBeDisabled();

    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-per-m2'), { target: { value: '180' } });
    expect(screen.getByTestId('kunstwerk-modal-opslaan')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({
        foto: 'https://storage.example.com/nieuw.jpg',
        naam: 'Akoestisch paneel',
        artiest: '',
        segmentIds: ['seg-1'],
        materiaalIds: [],
        maatIds: [],
        prijzen: [],
        prijsPerM2: 180,
        omschrijvingNl: 'Verbetert de akoestiek.',
        omschrijvingFr: '',
        omschrijvingDe: '',
        omschrijvingEn: '',
      })
    );
  });
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: FAIL — there is no `kunstwerk-modal-prijs-per-m2` field yet, and `handleSave` never includes `prijsPerM2`.

- [ ] **Step 3: Add `prijsPerM2` to the `Kunstwerk` type**

Edit `src/components/beheer/materiaalTypes.ts`:

```ts
export interface Kunstwerk {
  id: string;
  foto: string;
  naam: string;
  artiest: string;
  segmentIds: string[];
  materiaalIds: string[];
  maatIds: string[];
  prijzen: PrijsRegel[];
  prijsPerM2?: number;
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;
}
```

- [ ] **Step 4: Add `prijsPerM2` form state**

Edit `src/components/beheer/KunstwerkenSection.tsx`. Add to `LEGE_FORM`:

```tsx
const LEGE_FORM = {
  foto: '',
  naam: '',
  artiest: '',
  segmentIds: [] as string[],
  materiaalIds: [] as string[],
  maatIds: [] as string[],
  prijzen: {} as PrijzenState,
  prijsPerM2: '',
  omschrijvingNl: '',
  omschrijvingFr: '',
  omschrijvingDe: '',
  omschrijvingEn: '',
};
```

Add the state declaration, right after `prijzen`:

```tsx
  const [prijsPerM2, setPrijsPerM2] = useState(LEGE_FORM.prijsPerM2);
```

In `resetForm()`, add:

```tsx
    setPrijsPerM2(LEGE_FORM.prijsPerM2);
```

In `openEdit()`, add (right after `setPrijzen(prijzenMap);`):

```tsx
    setPrijsPerM2(kunstwerk.prijsPerM2 != null ? String(kunstwerk.prijsPerM2) : '');
```

- [ ] **Step 5: Compute `isMateriaalloos`, update `opslaanDisabled` and `handleSave`**

Edit `src/components/beheer/KunstwerkenSection.tsx`. Replace the block from `const prijsCombinaties = ...` through the end of `handleSave`:

```tsx
  const isMateriaalloos = materiaalIds.length === 0;
  const prijsCombinaties = materiaalIds.flatMap((materiaalId) =>
    maatIds.map((maatId) => ({ materiaalId, maatId }))
  );
  const allePrijzenIngevuld = prijsCombinaties.every(
    ({ materiaalId, maatId }) => (prijzen[prijsKey(materiaalId, maatId)] ?? '') !== ''
  );
  const opslaanDisabled =
    !foto ||
    uploading ||
    !naam ||
    segmentIds.length === 0 ||
    (isMateriaalloos
      ? !prijsPerM2 || Number(prijsPerM2) <= 0
      : maatIds.length === 0 || !allePrijzenIngevuld) ||
    !omschrijvingNl;

  async function handleSave() {
    if (!modalState) return;
    const basisData = {
      foto,
      naam,
      artiest,
      segmentIds,
      materiaalIds,
      maatIds: isMateriaalloos ? [] : maatIds,
      prijzen: isMateriaalloos
        ? []
        : prijsCombinaties.map(({ materiaalId, maatId }) => ({
            materiaalId,
            maatId,
            prijs: Number(prijzen[prijsKey(materiaalId, maatId)]),
          })),
      omschrijvingNl,
      omschrijvingFr,
      omschrijvingDe,
      omschrijvingEn,
    };
    const data = isMateriaalloos ? { ...basisData, prijsPerM2: Number(prijsPerM2) } : basisData;
    const success = modalState.mode === 'add' ? await onAdd(data) : await onUpdate(modalState.kunstwerk.id, data);
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'kunstwerk_toegevoegd' : 'kunstwerk_gewijzigd',
        actorFromMedewerker(user)
      );
      closeModal();
    } else {
      setActionError(t('kunstwerkenActionError'));
    }
  }
```

- [ ] **Step 6: Show the "Prijs per m²" field instead of the matrix when materiaalloos**

Edit `src/components/beheer/KunstwerkenSection.tsx`. Right after the price matrix block (the `{materiaalIds.length > 0 && maatIds.length > 0 && (...)}` block), add:

```tsx
          {isMateriaalloos && (
            <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
              {t('kunstwerkenLabelPrijsPerM2')}
              <div className="flex items-center gap-1">
                <span className="text-xs text-white/50">€</span>
                <input
                  type="number"
                  value={prijsPerM2}
                  onChange={(event) => setPrijsPerM2(event.target.value)}
                  data-testid="kunstwerk-modal-prijs-per-m2"
                  className="w-24 rounded-sm bg-black/40 px-2 py-1 text-sm text-white"
                />
              </div>
            </label>
          )}
```

- [ ] **Step 7: Add the new translation key**

In `messages/nl.json`, right after `"kunstwerkenLabelPrijzen": "Prijzen per materiaal en maat",` add:

```json
    "kunstwerkenLabelPrijsPerM2": "Prijs per m²",
```

- [ ] **Step 8: Run the full suite to confirm it passes**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/components/beheer/materiaalTypes.ts src/components/beheer/KunstwerkenSection.tsx \
  messages/nl.json tests/components/beheer/KunstwerkenSection.test.tsx
git commit -m "feat: prijs-per-m2 field for materiaalloze kunstwerken in beheer"
```

---

### Task 7: Materiaalloos ordering path in the bestel-popup

**Files:**
- Modify: `src/components/ProductModal.tsx`
- Test: `tests/components/ProductModal.test.tsx`

**Interfaces:**
- Consumes: `MATERIAALLOOS_LABEL` from `src/lib/kunstwerkMateriaal.ts` (Task 2); `Kunstwerk.prijsPerM2` (Task 6)
- Produces: for a kunstwerk with `materiaalIds.length === 0`, the popup shows only free-size inputs and a live-computed price, and adds a cart line with a real `prijs` (not `null`).

- [ ] **Step 1: Write the failing tests**

Add to `tests/components/ProductModal.test.tsx`, a new fixture near `KUNSTWERK`:

```ts
const MATERIAALLOOS_KUNSTWERK: Kunstwerk = {
  id: 'kw-akoestisch',
  foto: 'https://example.com/akoestisch.jpg',
  naam: 'Akoestisch paneel',
  artiest: '',
  segmentIds: [],
  materiaalIds: [],
  maatIds: [],
  prijzen: [],
  prijsPerM2: 180,
  omschrijvingNl: 'Verbetert de akoestiek en geeft een warme, moderne uitstraling.',
  omschrijvingFr: '',
  omschrijvingDe: '',
  omschrijvingEn: '',
};
```

And these tests inside `describe('ProductModal', ...)`:

```tsx
  it('hides the materiaal and maat selects for a materiaalloos kunstwerk, showing free-size inputs directly', () => {
    renderModal(() => {}, MATERIAALLOOS_KUNSTWERK);
    expect(screen.queryByTestId('product-modal-materiaal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('product-modal-maat')).not.toBeInTheDocument();
    expect(screen.getByTestId('product-modal-maat-custom-breedte')).toBeInTheDocument();
    expect(screen.getByTestId('product-modal-maat-custom-hoogte')).toBeInTheDocument();
  });

  it('computes and shows a live price for a materiaalloos kunstwerk based on the entered size and prijsPerM2', () => {
    renderModal(() => {}, MATERIAALLOOS_KUNSTWERK);
    expect(screen.queryByTestId('product-modal-prijs')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-breedte'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-hoogte'), { target: { value: '200' } });
    expect(screen.getByTestId('product-modal-prijs')).toHaveTextContent('€ 360,00');
  });

  it('adds a materiaalloos item to the cart with the computed price and no material/maat, logging mandje_toegevoegd', async () => {
    vi.useRealTimers();
    function Probe() {
      const { items } = useCart();
      return <div data-testid="probe">{JSON.stringify(items)}</div>;
    }
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <ProductModal
              kunstwerk={MATERIAALLOOS_KUNSTWERK}
              materialen={MATERIALEN}
              maten={MATEN}
              materiaalsoorten={MATERIAALSOORTEN}
              onClose={() => {}}
            />
            <Probe />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );
    expect(screen.getByTestId('product-modal-confirm')).toBeDisabled();
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-breedte'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-hoogte'), { target: { value: '200' } });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.click(screen.getByTestId('product-modal-confirm'));

    const items = JSON.parse(screen.getByTestId('probe').textContent ?? '[]');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kunstwerkId: 'kw-akoestisch',
      materiaalId: '',
      materiaalLabel: 'Akoestische stof',
      maatId: '',
      breedte: 100,
      hoogte: 200,
      maatLabel: '100×200 cm (eigen maat)',
      prijs: 360,
      quantity: 1,
    });
    expect(logActiviteitMock).toHaveBeenCalledWith('mandje_toegevoegd', {
      id: null,
      email: 'Onbekend',
      naam: 'Onbekend',
    });
  });
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/components/ProductModal.test.tsx`
Expected: FAIL — `beschikbareMaterialen` is empty for this kunstwerk today, so the `<select>`s render with zero `<option>`s but are still shown; no free-size inputs appear; no price is computed.

- [ ] **Step 3: Implement the materiaalloos branch**

Edit `src/components/ProductModal.tsx`. Add the import:

```ts
import { findVeiligheidsglasMateriaalId, MATERIAALLOOS_LABEL } from '@/lib/kunstwerkMateriaal';
```

Add, right after the existing `const isCustomSize = ...` line:

```ts
  const isMateriaalloos = kunstwerk.materiaalIds.length === 0;
```

Update `customSizeValid`'s neighbourhood — right after `const customSizeValid = ...`, add:

```ts
  const materiaalloosPrijs =
    isMateriaalloos && customSizeValid && kunstwerk.prijsPerM2
      ? Math.round((customBreedteNum / 100) * (customHoogteNum / 100) * kunstwerk.prijsPerM2 * 100) / 100
      : null;
```

Replace `canConfirm`:

```ts
  const canConfirm = isMateriaalloos
    ? customSizeValid && Boolean(kunstwerk.prijsPerM2) && (kunstwerk.prijsPerM2 ?? 0) > 0
    : isCustomSize
      ? customSizeValid
      : Boolean(prijsRegel);
```

Update `handleConfirm` — add a materiaalloos branch at the very top, before the existing `const gekozenMateriaal = ...` line:

```ts
  function handleConfirm() {
    if (isConfirmed || !canConfirm || !kunstwerk) {
      return;
    }
    if (isMateriaalloos) {
      addItem({
        kunstwerkId: kunstwerk.id,
        foto: kunstwerk.foto,
        omschrijving,
        materiaalId: '',
        materiaalLabel: MATERIAALLOOS_LABEL,
        maatId: '',
        maatLabel: `${customBreedteNum}×${customHoogteNum} cm${t('customSizeSuffix')}`,
        breedte: customBreedteNum,
        hoogte: customHoogteNum,
        prijs: materiaalloosPrijs,
        quantity,
      });
      void logActiviteit('mandje_toegevoegd', actorFromCustomer(user));
      setIsConfirmed(true);
      closeTimeoutRef.current = setTimeout(() => {
        closeTimeoutRef.current = null;
        onClose();
      }, CONFIRM_FEEDBACK_MS);
      return;
    }
    const gekozenMateriaal = beschikbareMaterialen.find((materiaal) => materiaal.id === materiaalId);
    // ...rest of the existing function is unchanged from here...
```

In the render, wrap the materiaal `<label>` (former lines 206-228) and the maat `<label>` (former lines 229-246) each in `{!isMateriaalloos && (...)}`:

```tsx
          {!isMateriaalloos && (
            <label className="flex flex-col gap-1 text-[0.65rem] uppercase tracking-wide text-white/60">
              {t('material')}
              <select
                data-testid="product-modal-materiaal"
                value={materiaalId}
                onChange={(event) => handleMateriaalChange(event.target.value)}
                className="rounded-sm bg-black/40 px-2 py-1.5 text-sm text-white"
              >
                {beschikbareMaterialen.map((materiaal) => (
                  <option key={materiaal.id} value={materiaal.id}>
                    {resolvedMateriaalLabel(materiaal)}
                  </option>
                ))}
              </select>
              {geselecteerdMateriaal && (
                <span
                  data-testid="product-modal-materiaal-omschrijving"
                  className="pt-1 text-[0.7rem] normal-case tracking-normal text-white/50"
                >
                  {geselecteerdMateriaal.omschrijving}
                </span>
              )}
            </label>
          )}
          {!isMateriaalloos && (
            <label className="flex flex-col gap-1 text-[0.65rem] uppercase tracking-wide text-white/60">
              {t('size')}
              <select
                data-testid="product-modal-maat"
                value={maatId}
                onChange={(event) => setMaatId(event.target.value)}
                className="rounded-sm bg-black/40 px-2 py-1.5 text-sm text-white"
              >
                {beschikbareMaten.map((maat) => (
                  <option key={maat.id} value={maat.id}>
                    {maatLabel(maat)}
                  </option>
                ))}
                {geselecteerdSoort?.staatEigenMaatToe && (
                  <option value={CUSTOM_MAAT_VALUE}>{t('customSizeOption')}</option>
                )}
              </select>
            </label>
          )}
```

Change the custom-size inputs block's gating condition from `{isCustomSize && (` to:

```tsx
          {(isCustomSize || isMateriaalloos) && (
```

(the inputs, max-error and lead-time-warning JSX inside are unchanged — `customSizeExceedsMax` and `geselecteerdSoort?.levertijdMaandenEigenMaat` both naturally evaluate falsy when `isMateriaalloos` is true, since `geselecteerdSoort` is `undefined` when `materiaalId` is `''`)

Replace the price display block:

```tsx
          {isMateriaalloos ? (
            materiaalloosPrijs !== null && (
              <p data-testid="product-modal-prijs" className="text-sm text-white/80">
                {formatCurrency(materiaalloosPrijs)}
              </p>
            )
          ) : isCustomSize ? (
            <p data-testid="product-modal-prijs" className="text-sm text-white/80">
              {t('priceOnRequest')}
            </p>
          ) : (
            prijsRegel && (
              <p data-testid="product-modal-prijs" className="text-sm text-white/80">
                {formatCurrency(prijsRegel.prijs)}
              </p>
            )
          )}
```

- [ ] **Step 4: Run the full ProductModal test suite to confirm it passes**

Run: `npx vitest run tests/components/ProductModal.test.tsx`
Expected: PASS (all tests — existing eigen-maat and standard-materiaal flows are untouched by the `isMateriaalloos` branches, since `kunstwerk.materiaalIds.length === 0` is `false` for every other fixture in this file)

- [ ] **Step 5: Commit**

```bash
git add src/components/ProductModal.tsx tests/components/ProductModal.test.tsx
git commit -m "feat: materiaalloos free-size ordering path with live price"
```

---

### Task 8 (manual, no automated test): Clean up Firestore data and create the Akoestisch paneel kunstwerk

This is an operational data step, not a code change — it must be done by someone logged into the deployed beheer UI as an admin (the beheer screens require `useAdminAuth`; there is no script-based path that doesn't involve either admin credentials or a live authenticated session). Do this **after** Tasks 1-7 are deployed, so the materiaalloos code path already exists.

- [ ] **Step 1:** Deploy the code from Tasks 1-7 to production.

- [ ] **Step 2:** Log into the beheer omgeving as admin. Go to **Materialen**, find the "Akoestische stof" row (materiaaldikte 0), open it, click **Verwijderen**.

- [ ] **Step 3:** Go to **Materiaalsoorten**, find "Akoestische stof", open it, click **Verwijderen**.

- [ ] **Step 4:** Go to **Kunstwerken**, click **Kunstwerk toevoegen**, and fill in:
  - **Foto**: upload a suitable stock/placeholder photo (e.g. a neutral acoustic-panel or fabric-texture image) — replace it with a real product photo later.
  - **Naam**: `Akoestisch paneel`
  - **Artiest**: leave empty
  - **Segmenten**: leave unchecked (or pick one if there's a fitting collectie — optional)
  - Open the "Materialen en maten" panel and **uncheck every materiaal and every maat** (this switches the form into the materiaalloos mode from Task 6 and reveals the "Prijs per m²" field)
  - **Prijs per m²**: `120` as a starting point (matches the `BASISPRIJS_PER_M2` used elsewhere in this codebase's example pricing) — revisit and set the real price before announcing this product
  - **Omschrijving (NL)**: `Verbetert de akoestiek en geeft een warme, moderne uitstraling.`
  - **Omschrijving (EN)**: `Improves acoustics and gives a warm, modern look.`
  - **Omschrijving (DE)**: `Verbessert die Akustik und sorgt für eine warme, moderne Ausstrahlung.`
  - **Omschrijving (FR)**: `Améliore l'acoustique et apporte une ambiance chaleureuse et moderne.`
  - Click **Opslaan**.

- [ ] **Step 5:** Open the public collectiepagina, confirm the "Akoestisch paneel" card shows up, click it, and confirm the bestel-popup shows only free-size (breedte/hoogte) inputs with a live-calculated price — no materiaal or maat dropdown.

---

## Self-Review Notes

- **Spec coverage:** §1 (alles beschikbaar + backfill) → Task 4. §2 (Materialen/Maten inklapbaar) → Task 5. §3 (kaartje: Formaten weg, Materiaal toont kernproduct) → Task 2. §4 (bestel-popup default) → Task 3. §5 (Akoestisch paneel materiaalloos) → Tasks 1, 2 (MATERIAALLOOS_LABEL), 6, 7, 8. All spec sections are covered.
- **Type consistency:** `resolveKunstwerkMateriaalLabel` (Task 2) and `findVeiligheidsglasMateriaalId` (Task 2) are defined once and reused verbatim by Task 3 (ProductModal default) and Task 7 (materiaalloos label) — no renamed duplicates. `Kunstwerk.prijsPerM2` (Task 6) is the exact name Task 7 reads.
- **No placeholders:** every step has complete, runnable code; Task 8 is explicitly called out as the one non-code, manual task and is sequenced last so it depends only on already-shipped code.
