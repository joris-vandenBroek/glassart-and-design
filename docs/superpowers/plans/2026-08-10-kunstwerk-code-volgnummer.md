# Kunstwerkcode — automatisch volgnummer per prefix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In het "Kunstwerk toevoegen"-scherm een hulpveld toevoegen dat, op basis van een gekozen of getypte prefix, het eerstvolgende vrije volgnummer voorstelt voor het bestaande `code`-veld — zonder dat `code` zijn vrije-tekst-karakter verliest.

**Architecture:** Eén pure, dependency-vrije helper-module (`src/lib/kunstwerkCodeVoorstel.ts`) die codes ontleedt en een voorstel berekent, plus een klein stukje state/JSX in het bestaande `KunstwerkenSection.tsx`-formulier dat dat voorstel in het al bestaande `code`-veld zet. Geen schema-, API- of type-wijziging.

**Tech Stack:** Next.js 14 (App Router), TypeScript, React (client component), Vitest + Testing Library, `next-intl`.

## Global Constraints

- Spec: [`docs/superpowers/specs/2026-08-10-kunstwerk-code-volgnummer-design.md`](../specs/2026-08-10-kunstwerk-code-volgnummer-design.md) — deze plan implementeert dat document 1-op-1; bij twijfel is de spec leidend.
- Prefix-herkenning: alles vóór het láátste `-` in een code, alléén geldig als het deel erna volledig numeriek is (`^\d+$`). Geen streepje of niet-numerieke staart → code telt niet mee.
- Prefix-vergelijking is hoofdletterongevoelig; het resultaat gebruikt de door de gebruiker getypte schrijfwijze, niet de opgeslagen schrijfwijze.
- Volgnummer = hoogste bestaand nummer bij dat prefix + 1, opgevuld tot de breedte van het bréédste bestaande nummer bij dat prefix. Nieuw prefix (geen treffers) → 5 cijfers, start `00001`.
- Het hulpveld is uitsluitend zichtbaar bij `modalState?.mode === 'add'`, nooit bij bewerken.
- Het `code`-veld blijft na het voorstel gewoon vrij bewerkbaar — geen synchronisatie terug, geen vormeis, geen aparte "voorstel"-knop.
- Beheer-only UI-tekst: alleen `messages/nl.json` invullen, geen `en`/`de`/`fr`.
- Geen wijziging aan `LEGE_FORM.code`, de submit-payload, de dubbele-code-/vast-bij-bestelling-logica, schema, of API-routes.
- `npm test` (vitest run, single-run, niet watch-mode) is de manier om tests te draaien; `fileParallelism: false` staat al project-breed aan, hier niet relevant want deze tests raken de database niet.

---

### Task 1: Pure helper — prefix herkennen en volgnummer voorstellen

**Files:**
- Create: `src/lib/kunstwerkCodeVoorstel.ts`
- Test: `tests/lib/kunstwerkCodeVoorstel.test.ts`

**Interfaces:**
- Consumes: niets — pure functies zonder externe afhankelijkheden.
- Produces:
  - `export interface KunstwerkCode { code: string }`
  - `export function vindBekendePrefixen(kunstwerken: KunstwerkCode[]): string[]` — alfabetisch gesorteerde, unieke lijst van herkende prefixen (canonieke schrijfwijze: de eerst aangetroffen schrijfwijze per hoofdletterongevoelige sleutel).
  - `export function stelVolgendeCodeVoor(kunstwerken: KunstwerkCode[], prefix: string): string` — het voorgestelde volgende `code` voor het opgegeven (getrimde) prefix.

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/kunstwerkCodeVoorstel.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { vindBekendePrefixen, stelVolgendeCodeVoor } from '@/lib/kunstwerkCodeVoorstel';

const KUNSTWERKEN = [
  { code: 'GLA-AFR-00007' },
  { code: 'GLA-AFR-00003' },
  { code: 'GLA-JAC-00012' },
  { code: 'Dan-02424' },
  { code: 'Akoestische stof' }, // geen streepje
  { code: 'GLA-AFR-oud' }, // niet-numerieke staart
];

describe('vindBekendePrefixen', () => {
  it('herkent prefixen van codes met een numerieke staart', () => {
    expect(vindBekendePrefixen(KUNSTWERKEN)).toEqual(['Dan', 'GLA-AFR', 'GLA-JAC']);
  });

  it('negeert codes zonder streepje en met een niet-numerieke staart', () => {
    const prefixen = vindBekendePrefixen(KUNSTWERKEN);
    expect(prefixen).not.toContain('Akoestische stof');
    expect(prefixen).not.toContain('GLA-AFR-oud');
  });

  it('telt hoofdletterongevoelige duplicaten als één prefix, met de eerst aangetroffen schrijfwijze', () => {
    const prefixen = vindBekendePrefixen([{ code: 'gla-afr-00001' }, { code: 'GLA-AFR-00002' }]);
    expect(prefixen).toEqual(['gla-afr']);
  });

  it('geeft een lege lijst voor een lege of niet-herkende invoer', () => {
    expect(vindBekendePrefixen([])).toEqual([]);
    expect(vindBekendePrefixen([{ code: 'Akoestische stof' }])).toEqual([]);
  });
});

describe('stelVolgendeCodeVoor', () => {
  it('telt het hoogste bestaande nummer bij dat prefix op met 1', () => {
    expect(stelVolgendeCodeVoor(KUNSTWERKEN, 'GLA-AFR')).toBe('GLA-AFR-00008');
  });

  it('vergelijkt het prefix hoofdletterongevoelig maar gebruikt de getypte schrijfwijze in het resultaat', () => {
    expect(stelVolgendeCodeVoor(KUNSTWERKEN, 'gla-afr')).toBe('gla-afr-00008');
  });

  it('volgt de breedte van het breedste bestaande nummer bij dat prefix', () => {
    const kunstwerken = [{ code: 'GLA-AFR-007' }, { code: 'GLA-AFR-0042' }];
    // hoogste getal is 42, breedste bestaande breedte is 4 -> "43" opgevuld tot 4 cijfers
    expect(stelVolgendeCodeVoor(kunstwerken, 'GLA-AFR')).toBe('GLA-AFR-0043');
  });

  it('laat de breedte vanzelf meegroeien bij een overloop', () => {
    expect(stelVolgendeCodeVoor([{ code: 'GLA-AFR-999' }], 'GLA-AFR')).toBe('GLA-AFR-1000');
  });

  it('negeert codes zonder streepje en met een niet-numerieke staart bij het tellen', () => {
    expect(stelVolgendeCodeVoor(KUNSTWERKEN, 'Dan')).toBe('Dan-02425');
  });

  it('start op 00001 met 5 cijfers voor een gloednieuw prefix', () => {
    expect(stelVolgendeCodeVoor(KUNSTWERKEN, 'GLA-NIEUW')).toBe('GLA-NIEUW-00001');
    expect(stelVolgendeCodeVoor([], 'Iets')).toBe('Iets-00001');
  });

  it('trimt het opgegeven prefix', () => {
    expect(stelVolgendeCodeVoor(KUNSTWERKEN, '  GLA-AFR  ')).toBe('GLA-AFR-00008');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/kunstwerkCodeVoorstel.test.ts`
Expected: FAIL — `Cannot find module '@/lib/kunstwerkCodeVoorstel'` (of gelijkwaardig, het bestand bestaat nog niet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/kunstwerkCodeVoorstel.ts`:

```typescript
export interface KunstwerkCode {
  code: string;
}

interface CodeOnderdelen {
  prefix: string;
  getal: number;
  breedte: number;
}

function ontleedCode(code: string): CodeOnderdelen | null {
  const laatsteStreepje = code.lastIndexOf('-');
  if (laatsteStreepje === -1) return null;
  const prefix = code.slice(0, laatsteStreepje);
  const staart = code.slice(laatsteStreepje + 1);
  if (!/^\d+$/.test(staart)) return null;
  return { prefix, getal: parseInt(staart, 10), breedte: staart.length };
}

export function vindBekendePrefixen(kunstwerken: KunstwerkCode[]): string[] {
  const canoniekePerSleutel = new Map<string, string>();
  for (const { code } of kunstwerken) {
    const onderdelen = ontleedCode(code);
    if (!onderdelen) continue;
    const sleutel = onderdelen.prefix.toLowerCase();
    if (!canoniekePerSleutel.has(sleutel)) {
      canoniekePerSleutel.set(sleutel, onderdelen.prefix);
    }
  }
  return [...canoniekePerSleutel.values()].sort((a, b) => a.localeCompare(b));
}

const NIEUW_PREFIX_BREEDTE = 5;

export function stelVolgendeCodeVoor(kunstwerken: KunstwerkCode[], prefix: string): string {
  const getrimdePrefix = prefix.trim();
  const sleutel = getrimdePrefix.toLowerCase();
  const treffers = kunstwerken
    .map(({ code }) => ontleedCode(code))
    .filter((onderdelen): onderdelen is CodeOnderdelen => onderdelen !== null && onderdelen.prefix.toLowerCase() === sleutel);

  if (treffers.length === 0) {
    return `${getrimdePrefix}-${'1'.padStart(NIEUW_PREFIX_BREEDTE, '0')}`;
  }

  const hoogsteGetal = Math.max(...treffers.map((t) => t.getal));
  const breedte = Math.max(...treffers.map((t) => t.breedte));
  return `${getrimdePrefix}-${String(hoogsteGetal + 1).padStart(breedte, '0')}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/kunstwerkCodeVoorstel.test.ts`
Expected: PASS — alle 12 tests groen.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kunstwerkCodeVoorstel.ts tests/lib/kunstwerkCodeVoorstel.test.ts
git commit -m "$(cat <<'EOF'
feat: helper om volgende kunstwerkcode per prefix voor te stellen

Pure functies die bestaande codes ontleden (prefix + numeriek volgnummer)
en het eerstvolgende vrije nummer berekenen, als basis voor het
prefix-hulpveld in het kunstwerkformulier.
EOF
)"
```

---

### Task 2: Prefixveld in het "Kunstwerk toevoegen"-formulier

**Files:**
- Modify: `src/components/beheer/KunstwerkenSection.tsx`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/KunstwerkenSection.test.tsx`

**Interfaces:**
- Consumes: `vindBekendePrefixen`, `stelVolgendeCodeVoor` uit Task 1 (`@/lib/kunstwerkCodeVoorstel`).
- Produces: geen nieuwe exports — dit is de UI-integratie, het laatste stuk van de feature.

- [ ] **Step 1: Write the failing tests**

Append vóór de laatste `});` (regel 1150) van `tests/components/beheer/KunstwerkenSection.test.tsx` (na de bestaande test `'meldt een dubbele code en slaat niets op'`):

```typescript
  it('toont het prefixveld bij het aanmaken van een nieuw kunstwerk', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    expect(screen.getByTestId('kunstwerk-modal-prefix')).toBeInTheDocument();
  });

  it('toont geen prefixveld bij het bewerken van een bestaand kunstwerk', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-kw-1'));
    expect(screen.queryByTestId('kunstwerk-modal-prefix')).toBeNull();
  });

  it('vult het codeveld met een voorstel zodra een prefix wordt gekozen', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    fireEvent.change(screen.getByTestId('kunstwerk-modal-prefix'), { target: { value: 'GLA-AFR' } });
    expect(screen.getByTestId('kunstwerk-modal-code')).toHaveValue('GLA-AFR-00001');
  });

  it('laat het codeveld na het voorstel gewoon vrij overschrijfbaar', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    fireEvent.change(screen.getByTestId('kunstwerk-modal-prefix'), { target: { value: 'GLA-AFR' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-code'), { target: { value: 'GLA-AFR-eigen' } });
    expect(screen.getByTestId('kunstwerk-modal-code')).toHaveValue('GLA-AFR-eigen');
  });
```

(De fixture `KUNSTWERKEN` in dit testbestand bevat geen enkele code met prefix `GLA-AFR`, dus het voorstel voor een gloednieuw prefix is hier `GLA-AFR-00001` — consistent met Task 1's gedrag voor een prefix zonder treffers.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: FAIL op de 4 nieuwe tests — `Unable to find an element by: [data-testid="kunstwerk-modal-prefix"]`. De overige, bestaande tests in dit bestand blijven groen.

- [ ] **Step 3: Add the translation key**

In `messages/nl.json`, direct vóór de regel `"kunstwerkenLabelCode": "Code",` (huidige regel 656):

```json
    "kunstwerkenLabelPrefix": "Prefix (voorstel volgnummer)",
```

- [ ] **Step 4: Add the import**

In `src/components/beheer/KunstwerkenSection.tsx`, na de bestaande import op regel 17:

```typescript
import { detectFormaatFromFile, detectFormaatFromImageUrl } from '@/lib/detectKunstwerkFormaat';
```

voeg toe:

```typescript
import { stelVolgendeCodeVoor, vindBekendePrefixen } from '@/lib/kunstwerkCodeVoorstel';
```

- [ ] **Step 5: Add `prefix` to the form state**

In `LEGE_FORM` (rond regel 55), direct na `code: '',`:

```typescript
  prefix: '',
```

Bij de state-declaraties (rond regel 95), direct na `const [code, setCode] = useState(LEGE_FORM.code);`:

```typescript
  const [prefix, setPrefix] = useState(LEGE_FORM.prefix);
```

In `resetForm()` (rond regel 381), direct na `setCode(LEGE_FORM.code);`:

```typescript
    setPrefix(LEGE_FORM.prefix);
```

- [ ] **Step 6: Derive the known-prefixes list**

In `KunstwerkenSection.tsx`, direct ná het bestaande blok (rond regel 244):

```typescript
  const kunstenaarNaamByNr = useMemo(() => {
    const map = new Map<string, string>();
    (kunstenaars ?? []).forEach((kunstenaar) => map.set(kunstenaar.kunstenaarnr, kunstenaar.naam));
    return map;
  }, [kunstenaars]);
```

voeg toe:

```typescript

  const bekendePrefixen = useMemo(() => vindBekendePrefixen(kunstwerken ?? []), [kunstwerken]);
```

- [ ] **Step 7: Add the prefix field to the modal JSX**

In `KunstwerkenSection.tsx`, vervang (rond regel 786-792):

```typescript
          )}

          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            <span>
              {t('kunstwerkenLabelCode')}
              <RequiredMark />
            </span>
```

door:

```typescript
          )}

          {modalState?.mode === 'add' && (
            <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
              <span>{t('kunstwerkenLabelPrefix')}</span>
              <input
                type="text"
                list="kunstwerk-modal-prefixen"
                value={prefix}
                onChange={(event) => {
                  const waarde = event.target.value;
                  setPrefix(waarde);
                  if (waarde.trim()) {
                    setCode(stelVolgendeCodeVoor(kunstwerken ?? [], waarde));
                  }
                }}
                data-testid="kunstwerk-modal-prefix"
                className="rounded-sm border border-transparent bg-black/40 px-3 py-2 text-sm text-white"
              />
              <datalist id="kunstwerk-modal-prefixen">
                {bekendePrefixen.map((optie) => (
                  <option key={optie} value={optie} />
                ))}
              </datalist>
            </label>
          )}

          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            <span>
              {t('kunstwerkenLabelCode')}
              <RequiredMark />
            </span>
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: PASS — de 4 nieuwe tests en alle bestaande tests in dit bestand groen.

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: PASS — geen regressies elders (dit raakt geen schema, API of gedeelde types).

- [ ] **Step 10: Commit**

```bash
git add src/components/beheer/KunstwerkenSection.tsx messages/nl.json tests/components/beheer/KunstwerkenSection.test.tsx
git commit -m "$(cat <<'EOF'
feat: prefixveld met codevoorstel bij aanmaken van een kunstwerk

Bij "Kunstwerk toevoegen" kan de beheerder nu een prefix kiezen of typen;
het bestaande codeveld wordt dan gevuld met het eerstvolgende vrije
volgnummer voor dat prefix, en blijft daarna gewoon vrij te overschrijven.
Alleen zichtbaar bij aanmaken, niet bij bewerken.
EOF
)"
```

---

## Uitrol

Geen migratie, geen API-wijziging. Na Task 2: bouwen, `npm test` groen, deployen naar staging, en handmatig controleren zoals de spec beschrijft (gloednieuw prefix start op `00001`, bestaand prefix telt op, bewerken toont geen prefixveld) — dan pas promoten naar productie, zoals gebruikelijk (`CLAUDE.md`, GitHub/CI-sectie).
