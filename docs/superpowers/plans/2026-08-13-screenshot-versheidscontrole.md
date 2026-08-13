# Screenshot-versheidscontrole Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een niet-blokkerende waarschuwing tijdens de staging-deploy wanneer een van de 10 screenshot-bronbestanden in de gebruikershandleiding wijzigde zonder dat de bijbehorende screenshot in `public/documentatie/` meeging — zodat een vergeten screenshot-update zichtbaar wordt in plaats van stil blijft liggen.

**Architecture:** Eén nieuw script (`scripts/check-screenshot-freshness.ts`), met dezelfde stijl als het bestaande `scripts/check-migrations.ts`: een pure, unit-testbare functie die een lijst gewijzigde bestanden afzet tegen een hardcoded mapping "screenshot → bronbestand(en)", plus een dunne CLI-`main()` die `git diff --name-only <vorige-vN-tag>..HEAD` opvraagt en het resultaat als niet-blokkerende `::warning::`-regels afdrukt. Geen hash-tracking, geen apart manifestbestand: de vergelijkingsbasis is simpelweg "sinds de vorige staging-deploy" (de laatst geplaatste `vN`-tag, die `deploy-naar-staging.yml` al berekent voor het versienummer). Het script wordt aangeroepen als extra, niet-blokkerende stap in `deploy-naar-staging.yml`.

**Tech Stack:** Node.js/TypeScript (`tsx`), Vitest, GitHub Actions (bash steps), git.

## Global Constraints

- Het script mag de deploy nooit laten falen: altijd exitcode 0 op de eigenlijke controle, ongeacht hoeveel screenshots verouderd lijken. Alleen een ontbrekend CLI-argument (misconfiguratie) is een harde fout (exitcode 2), zoals `check-migrations.ts` dat ook doet.
- Volg de bestaande stijl van `scripts/check-migrations.ts`: Nederlandse variabele-/berichttekst, een pure functie gescheiden van een dunne `main()`, `node:`-geprefixte core-imports.
- Geen aparte hash- of manifestbestand-tracking — de mapping "screenshot → bron(nen)" staat as-code in het script zelf (`SCREENSHOT_BRONNEN`), niet in een los JSON-bestand.
- `npm test` (niet een subset) draait minstens één keer aan het eind (Task 3).

---

### Task 1: `scripts/check-screenshot-freshness.ts` — de mapping en de pure detectiefunctie

**Files:**
- Create: `scripts/check-screenshot-freshness.ts`
- Test: `tests/scripts/check-screenshot-freshness.test.ts`

**Interfaces:**
- Produces: `SCREENSHOT_BRONNEN: Record<string, string[]>` (screenshot-pad relatief aan de repo-root → array van bronbestand-paden relatief aan de repo-root); `vindMogelijkVerouderdeScreenshots(gewijzigdeBestanden: string[], mapping?: Record<string, string[]>): { screenshot: string; bronnen: string[] }[]` — pure functie, geen git/fs-toegang, dus volledig unit-testbaar; `mapping` is optioneel en valt terug op `SCREENSHOT_BRONNEN`.
- Consumed by: Task 2 (de CLI-`main()` in hetzelfde bestand, en de nieuwe workflow-stap).

De volledige, huidige mapping (10 hoofdstukken, 12 screenshots — zie `tests/components/beheer/documentatie/chapterScreenshots.test.tsx` voor de canonieke hoofdstuk→screenshot-lijst):

| Screenshot | Bronbestand(en) |
|---|---|
| `public/documentatie/klant-registratie.png` | `src/components/beheer/KlantModal.tsx` |
| `public/documentatie/bestelproces.png` | `src/components/beheer/BestellingModal.tsx` |
| `public/documentatie/kunstwerken.png` | `src/components/beheer/KunstwerkenSection.tsx` |
| `public/documentatie/kunstwerken-code-voor.png` | `src/components/beheer/KunstwerkenSection.tsx` |
| `public/documentatie/kunstwerken-code-na.png` | `src/components/beheer/KunstwerkenSection.tsx` |
| `public/documentatie/kunstenaars.png` | `src/components/beheer/KunstenaarsSection.tsx` |
| `public/documentatie/drukkers.png` | `src/components/beheer/DrukkerModal.tsx` |
| `public/documentatie/glassart-design.png` | `src/components/beheer/GlassartDesignSection.tsx` |
| `public/documentatie/instellingen.png` | `src/components/beheer/InstellingenSection.tsx` |
| `public/documentatie/prijsmatrix.png` | `src/components/beheer/PrijsmatrixSection.tsx` |
| `public/documentatie/stamgegevens.png` | `src/components/beheer/MaterialenSection.tsx` |
| `public/documentatie/klant-website.png` | `src/components/ProductsGrid.tsx` |

(Alle 12 paden hierboven zijn geverifieerd aanwezig in de repo op het moment van schrijven.)

- [ ] **Step 1: Write the failing tests**

Create `tests/scripts/check-screenshot-freshness.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { SCREENSHOT_BRONNEN, vindMogelijkVerouderdeScreenshots } from '../../scripts/check-screenshot-freshness';

const MAPPING = {
  'public/documentatie/a.png': ['src/components/A.tsx'],
  'public/documentatie/b.png': ['src/components/B.tsx', 'src/components/B2.tsx'],
};

describe('vindMogelijkVerouderdeScreenshots', () => {
  it('meldt niets als er geen bestanden gewijzigd zijn', () => {
    expect(vindMogelijkVerouderdeScreenshots([], MAPPING)).toEqual([]);
  });

  it('meldt niets als een ongerelateerd bestand wijzigde', () => {
    expect(vindMogelijkVerouderdeScreenshots(['src/components/Onbekend.tsx'], MAPPING)).toEqual([]);
  });

  it('meldt niets als de bron wijzigde maar de screenshot ook meeging', () => {
    const gewijzigd = ['src/components/A.tsx', 'public/documentatie/a.png'];
    expect(vindMogelijkVerouderdeScreenshots(gewijzigd, MAPPING)).toEqual([]);
  });

  it('meldt de screenshot als de bron wijzigde zonder de screenshot', () => {
    const gewijzigd = ['src/components/A.tsx'];
    expect(vindMogelijkVerouderdeScreenshots(gewijzigd, MAPPING)).toEqual([
      { screenshot: 'public/documentatie/a.png', bronnen: ['src/components/A.tsx'] },
    ]);
  });

  it('rapporteert alleen de daadwerkelijk gewijzigde bron wanneer een screenshot er meerdere heeft', () => {
    const gewijzigd = ['src/components/B2.tsx'];
    expect(vindMogelijkVerouderdeScreenshots(gewijzigd, MAPPING)).toEqual([
      { screenshot: 'public/documentatie/b.png', bronnen: ['src/components/B2.tsx'] },
    ]);
  });

  it('rapporteert meerdere verouderde screenshots tegelijk', () => {
    const gewijzigd = ['src/components/A.tsx', 'src/components/B.tsx'];
    expect(vindMogelijkVerouderdeScreenshots(gewijzigd, MAPPING)).toEqual([
      { screenshot: 'public/documentatie/a.png', bronnen: ['src/components/A.tsx'] },
      { screenshot: 'public/documentatie/b.png', bronnen: ['src/components/B.tsx'] },
    ]);
  });

  it('gebruikt SCREENSHOT_BRONNEN als er geen mapping wordt meegegeven', () => {
    const gewijzigd = ['src/components/beheer/KlantModal.tsx'];
    const resultaat = vindMogelijkVerouderdeScreenshots(gewijzigd);
    expect(resultaat).toEqual([
      { screenshot: 'public/documentatie/klant-registratie.png', bronnen: ['src/components/beheer/KlantModal.tsx'] },
    ]);
  });
});

describe('SCREENSHOT_BRONNEN', () => {
  const VERWACHTE_SCREENSHOTS = [
    'public/documentatie/klant-registratie.png',
    'public/documentatie/bestelproces.png',
    'public/documentatie/kunstwerken.png',
    'public/documentatie/kunstwerken-code-voor.png',
    'public/documentatie/kunstwerken-code-na.png',
    'public/documentatie/kunstenaars.png',
    'public/documentatie/drukkers.png',
    'public/documentatie/glassart-design.png',
    'public/documentatie/instellingen.png',
    'public/documentatie/prijsmatrix.png',
    'public/documentatie/stamgegevens.png',
    'public/documentatie/klant-website.png',
  ];

  it('bevat precies de 12 screenshots die op dit moment in de handleiding gebruikt worden', () => {
    expect(Object.keys(SCREENSHOT_BRONNEN).sort()).toEqual([...VERWACHTE_SCREENSHOTS].sort());
  });

  it('elk gemapt screenshot- en bronbestand bestaat ook echt in de repo', () => {
    for (const [screenshot, bronnen] of Object.entries(SCREENSHOT_BRONNEN)) {
      expect(existsSync(path.join(process.cwd(), screenshot))).toBe(true);
      for (const bron of bronnen) {
        expect(existsSync(path.join(process.cwd(), bron))).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/scripts/check-screenshot-freshness.test.ts`
Expected: FAIL with a module-not-found error — `scripts/check-screenshot-freshness.ts` doesn't exist yet.

- [ ] **Step 3: Implement the mapping and the pure function**

Create `scripts/check-screenshot-freshness.ts`:

```typescript
export const SCREENSHOT_BRONNEN: Record<string, string[]> = {
  'public/documentatie/klant-registratie.png': ['src/components/beheer/KlantModal.tsx'],
  'public/documentatie/bestelproces.png': ['src/components/beheer/BestellingModal.tsx'],
  'public/documentatie/kunstwerken.png': ['src/components/beheer/KunstwerkenSection.tsx'],
  'public/documentatie/kunstwerken-code-voor.png': ['src/components/beheer/KunstwerkenSection.tsx'],
  'public/documentatie/kunstwerken-code-na.png': ['src/components/beheer/KunstwerkenSection.tsx'],
  'public/documentatie/kunstenaars.png': ['src/components/beheer/KunstenaarsSection.tsx'],
  'public/documentatie/drukkers.png': ['src/components/beheer/DrukkerModal.tsx'],
  'public/documentatie/glassart-design.png': ['src/components/beheer/GlassartDesignSection.tsx'],
  'public/documentatie/instellingen.png': ['src/components/beheer/InstellingenSection.tsx'],
  'public/documentatie/prijsmatrix.png': ['src/components/beheer/PrijsmatrixSection.tsx'],
  'public/documentatie/stamgegevens.png': ['src/components/beheer/MaterialenSection.tsx'],
  'public/documentatie/klant-website.png': ['src/components/ProductsGrid.tsx'],
};

// Pure: geen git/fs-toegang, dus volledig unit-testbaar.
export function vindMogelijkVerouderdeScreenshots(
  gewijzigdeBestanden: string[],
  mapping: Record<string, string[]> = SCREENSHOT_BRONNEN
): { screenshot: string; bronnen: string[] }[] {
  const gewijzigd = new Set(gewijzigdeBestanden);
  const resultaat: { screenshot: string; bronnen: string[] }[] = [];
  for (const [screenshot, bronnen] of Object.entries(mapping)) {
    const gewijzigdeBronnen = bronnen.filter((bron) => gewijzigd.has(bron));
    if (gewijzigdeBronnen.length > 0 && !gewijzigd.has(screenshot)) {
      resultaat.push({ screenshot, bronnen: gewijzigdeBronnen });
    }
  }
  return resultaat;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/scripts/check-screenshot-freshness.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/check-screenshot-freshness.ts tests/scripts/check-screenshot-freshness.test.ts
git commit -m "feat: add screenshot-vs-bronbestand mapping and staleness detector"
```

---

### Task 2: CLI-entrypoint + wiring in `deploy-naar-staging.yml`

**Files:**
- Modify: `scripts/check-screenshot-freshness.ts`
- Modify: `.github/workflows/deploy-naar-staging.yml`

**Interfaces:**
- Consumes: `SCREENSHOT_BRONNEN`, `vindMogelijkVerouderdeScreenshots` from Task 1.
- Produces: nothing consumed by later tasks.

Geen geautomatiseerde test voor dit deel — net als bij `check-migrations.ts` is alleen de pure functie unit-getest; de CLI-`main()` en de workflow-integratie zelf worden handmatig geverifieerd (Step 3 hieronder), zoals ook bij de bestaande migratiecontrole gebruikelijk is in dit project.

- [ ] **Step 1: Add the CLI entrypoint**

Append to the end of `scripts/check-screenshot-freshness.ts`:

```typescript

import { execSync } from 'node:child_process';

function main(): void {
  const vorigeTag = process.argv[2];
  if (!vorigeTag) {
    console.error('Gebruik: tsx scripts/check-screenshot-freshness.ts <vorige-tag>');
    process.exit(2);
  }

  const output = execSync(`git diff --name-only ${vorigeTag}..HEAD`, { encoding: 'utf8' });
  const gewijzigdeBestanden = output.split('\n').filter((regel) => regel.trim() !== '');

  const verouderd = vindMogelijkVerouderdeScreenshots(gewijzigdeBestanden);
  if (verouderd.length === 0) {
    console.log('Geen screenshots lijken verouderd.');
    return;
  }

  for (const { screenshot, bronnen } of verouderd) {
    console.log(
      `::warning::${screenshot} is mogelijk verouderd -- ${bronnen.join(', ')} gewijzigd sinds ${vorigeTag}, maar de screenshot zelf niet. Zie CLAUDE.md's gebruikershandleiding-sectie.`
    );
  }
}

main();
```

- [ ] **Step 2: Wire it into `deploy-naar-staging.yml`**

In `.github/workflows/deploy-naar-staging.yml`, find the "Compute next version number" step:

```yaml
      - name: Compute next version number
        id: version
        run: |
          if [ "${{ github.ref }}" != "refs/heads/master" ]; then
            echo "tag=" >> "$GITHUB_OUTPUT"
            echo "Not master -- feature-branch staging deploys aren't versioned (no promotable vN, no beheer version label)."
            exit 0
          fi
          latest=$(git tag -l 'v[0-9]*' | sed 's/^v//' | sort -n | tail -1)
          if [ -z "$latest" ]; then
            next=1
          else
            next=$((latest + 1))
          fi
          echo "tag=v$next" >> "$GITHUB_OUTPUT"
          echo "Next version: v$next"
```

Replace it with (moves the `latest` lookup before the master-only branch, and adds a `previous` output so the new step below can use it regardless of which ref is being deployed):

```yaml
      - name: Compute next version number
        id: version
        run: |
          latest=$(git tag -l 'v[0-9]*' | sed 's/^v//' | sort -n | tail -1)
          if [ -z "$latest" ]; then
            echo "previous=" >> "$GITHUB_OUTPUT"
          else
            echo "previous=v$latest" >> "$GITHUB_OUTPUT"
          fi
          if [ "${{ github.ref }}" != "refs/heads/master" ]; then
            echo "tag=" >> "$GITHUB_OUTPUT"
            echo "Not master -- feature-branch staging deploys aren't versioned (no promotable vN, no beheer version label)."
            exit 0
          fi
          if [ -z "$latest" ]; then
            next=1
          else
            next=$((latest + 1))
          fi
          echo "tag=v$next" >> "$GITHUB_OUTPUT"
          echo "Next version: v$next"
```

Immediately after that step (still before "Build (server mode)"), add a new step:

```yaml
      - name: Controleer screenshot-versheid
        run: |
          if [ -z "${{ steps.version.outputs.previous }}" ]; then
            echo "::notice::Nog geen vN-tag gevonden -- screenshot-versheidscontrole overgeslagen (eerste deploy)."
            exit 0
          fi
          npx tsx scripts/check-screenshot-freshness.ts "${{ steps.version.outputs.previous }}"
        # Niet-blokkerend (het script zelf faalt nooit): dit is een geheugensteun voor de
        # gebruikershandleiding-screenshots, geen correctheidscontrole zoals de
        # migratiecheck hierboven. Vergelijkt met de vorige geplaatste vN-tag, dus dit
        # werkt ook op een feature-branch staging-deploy (waar steps.version.outputs.tag
        # zelf leeg is): "sinds wat er nu live staat" is ongeacht de brontak de juiste
        # vergelijkingsbasis.
```

- [ ] **Step 3: Manually verify**

Run: `npx tsx scripts/check-screenshot-freshness.ts HEAD~5` (or any older ref that exists in this repo's history) from the repo root.
Expected: prints either `Geen screenshots lijken verouderd.` or one or more `::warning::` lines, without throwing — confirms the CLI entrypoint runs against real `git diff` output. Also visually re-read the two edited/added YAML blocks in `.github/workflows/deploy-naar-staging.yml` to confirm valid indentation (2 spaces per level, consistent with the rest of the file).

- [ ] **Step 4: Commit**

```bash
git add scripts/check-screenshot-freshness.ts .github/workflows/deploy-naar-staging.yml
git commit -m "feat: warn on staging deploy when a screenshot's source changed without it"
```

---

### Task 3: Update the stale CLAUDE.md sentence + final verification

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Update the outdated sentence**

In `CLAUDE.md`, in the "Gebruikershandleiding (beheer)" section, find:

```
De hoofdstukken klant-registratie, bestelproces, kunstwerken en kunstenaars bevatten daarnaast elk een screenshot onder `public/documentatie/`; een zichtbare wijziging aan het bijbehorende scherm moet er ook toe leiden dat die screenshot opnieuw wordt gemaakt — dit wordt niet automatisch gedetecteerd.
```

Replace with:

```
Alle hoofdstukken bevatten inmiddels een screenshot onder `public/documentatie/` (zie `tests/components/beheer/documentatie/chapterScreenshots.test.tsx` voor de volledige hoofdstuk→screenshot-lijst); een zichtbare wijziging aan het bijbehorende scherm moet er ook toe leiden dat die screenshot opnieuw wordt gemaakt. `scripts/check-screenshot-freshness.ts` waarschuwt hier niet-blokkerend voor tijdens de staging-deploy (op basis van de mapping in dat bestand), maar vervangt niet de eigen beoordeling hierboven — het ziet alleen "bronbestand gewijzigd, screenshot niet", niet of een wijziging daadwerkelijk zichtbaar is.
```

This is a one-line prose edit — this task has no test to write or run for the edit itself; verification is Step 2 below.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS, 0 failures (aside from any test failure already known to be pre-existing and unrelated to this plan — confirm by checking whether the same failure exists on `master` before this branch, the same way earlier verification in this repo has done).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: correct the stale screenshot-chapter count in CLAUDE.md"
```

No separate final-verification-only task is needed beyond Step 2 above — this plan has no build-time or runtime code path (the new script only runs inside the staging-deploy workflow), so `npm run build` is not required to pass judgment on it, though running it is harmless and can be included in the subagent-driven-development final review if desired.
