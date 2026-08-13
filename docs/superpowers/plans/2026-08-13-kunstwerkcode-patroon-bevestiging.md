# Kunstwerkcode patroon-bevestiging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a beheer medewerker types a kunstwerkcode that doesn't match the standard
`AAA-BBB-00001` shape, show a confirmation popup before saving — without ever forbidding
the deviation (codes like "Akoestische stof" must stay possible).

**Architecture:** A pure regex-check utility (`voldoetAanStandaardKunstwerkCode`) feeds into
the existing `pendingCodeWijziging` confirmation flow in `KunstwerkenSection.tsx`, which is
generalized (and renamed `pendingCodeBevestiging`) to gate on either a real code change or a
pattern deviation, showing composable popup text for each case.

**Tech Stack:** Next.js 14 / React / TypeScript, `next-intl`, Vitest + Testing Library.

## Global Constraints

- Pattern check is case-sensitive: exactly `^[A-Z]{3}-[A-Z]{3}-\d{5}$` (from the approved
  spec, `docs/superpowers/specs/2026-08-13-kunstwerkcode-patroon-bevestiging-design.md`).
- Popup fires only when a code is newly entered or changed: add-mode always, edit-mode only
  when the code differs from the stored value. An unchanged, already-deviating code (e.g. an
  existing "Akoestische stof" kunstwerk) must save without any popup.
- One combined popup when both a real change and a pattern deviation apply — never two popups
  in sequence.
- Translations go only in `messages/nl.json` — this is beheer-only UI text (per `CLAUDE.md`).
- No server-side validation of the pattern — this is a client-side confirmation only, the API
  routes in `src/app/api/kunstwerken/` stay untouched.

---

### Task 1: Kunstwerkcode-patroon utility

**Files:**
- Create: `src/lib/kunstwerkCodePatroon.ts`
- Test: `tests/lib/kunstwerkCodePatroon.test.ts`

**Interfaces:**
- Produces: `voldoetAanStandaardKunstwerkCode(code: string): boolean` — consumed by Task 2.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/kunstwerkCodePatroon.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { voldoetAanStandaardKunstwerkCode } from '@/lib/kunstwerkCodePatroon';

describe('voldoetAanStandaardKunstwerkCode', () => {
  it('accepteert het standaardformaat: drie letters, streepje, drie letters, streepje, vijf cijfers', () => {
    expect(voldoetAanStandaardKunstwerkCode('GLA-JAC-00001')).toBe(true);
    expect(voldoetAanStandaardKunstwerkCode('GLA-AFR-00007')).toBe(true);
  });

  it('accepteert na trimmen van omringende spaties', () => {
    expect(voldoetAanStandaardKunstwerkCode('  GLA-JAC-00001  ')).toBe(true);
  });

  it('weigert een bekende afwijkende code zoals "Akoestische stof"', () => {
    expect(voldoetAanStandaardKunstwerkCode('Akoestische stof')).toBe(false);
  });

  it('weigert kleine letters, ook als de vorm verder klopt', () => {
    expect(voldoetAanStandaardKunstwerkCode('gla-jac-00001')).toBe(false);
  });

  it('weigert een verkeerd aantal cijfers', () => {
    expect(voldoetAanStandaardKunstwerkCode('GLA-JAC-0001')).toBe(false);
    expect(voldoetAanStandaardKunstwerkCode('GLA-JAC-000001')).toBe(false);
  });

  it('weigert een verkeerd aantal letters of een ontbrekend streepje', () => {
    expect(voldoetAanStandaardKunstwerkCode('GLAA-JAC-00001')).toBe(false);
    expect(voldoetAanStandaardKunstwerkCode('GLAJAC00001')).toBe(false);
    expect(voldoetAanStandaardKunstwerkCode('GLA-JA-00001')).toBe(false);
  });

  it('weigert een lege string', () => {
    expect(voldoetAanStandaardKunstwerkCode('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/kunstwerkCodePatroon.test.ts`
Expected: FAIL — `Cannot find module '@/lib/kunstwerkCodePatroon'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/kunstwerkCodePatroon.ts`:

```ts
const STANDAARD_KUNSTWERK_CODE = /^[A-Z]{3}-[A-Z]{3}-\d{5}$/;

export function voldoetAanStandaardKunstwerkCode(code: string): boolean {
  return STANDAARD_KUNSTWERK_CODE.test(code.trim());
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/kunstwerkCodePatroon.test.ts`
Expected: PASS, all 7 cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kunstwerkCodePatroon.ts tests/lib/kunstwerkCodePatroon.test.ts
git commit -m "feat: add kunstwerkcode standard-pattern check"
```

---

### Task 2: Bevestigingspopup in KunstwerkenSection

**Files:**
- Modify: `src/components/beheer/KunstwerkenSection.tsx`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/KunstwerkenSection.test.tsx`

**Interfaces:**
- Consumes: `voldoetAanStandaardKunstwerkCode(code: string): boolean` from Task 1.

- [ ] **Step 1: Add the new translation keys**

In `messages/nl.json`, inside the `beheer` block, right after the existing
`"kunstwerkenCodeWijzigenBevestig": "Code wijzigen",` line (currently line 678):

```json
    "kunstwerkenCodeWijzigenBevestig": "Code wijzigen",
    "kunstwerkenCodePatroonTitel": "Deze code wijkt af van het gebruikelijke formaat.",
    "kunstwerkenCodePatroonTekst": "Kunstwerkcodes volgen meestal het formaat AAA-BBB-00001 (drie letters, drie letters, vijf cijfers). Weet je zeker dat je met deze code wilt doorgaan?",
    "kunstwerkenCodePatroonBevestig": "Toch opslaan",
```

- [ ] **Step 2: Write the new failing component tests**

In `tests/components/beheer/KunstwerkenSection.test.tsx`, add these three tests directly
after the existing `it('meldt een dubbele code en slaat niets op', ...)` test (currently
ending at line 1189, right before the prefix-field tests):

```tsx
  it('toont een bevestigingspopup als de code van een nieuw kunstwerk niet aan het standaardformaat voldoet', async () => {
    uploadMock.mockResolvedValue('https://storage.example.com/nieuw.jpg');
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-foto-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-foto-preview')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-staand'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-2'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-maat-maat-2'));
    fireEvent.change(screen.getByTestId('kunstwerk-modal-code'), { target: { value: 'Akoestische stof' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-kunstenaar'), { target: { value: 'KU-00001' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Akoestisch paneel' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    expect(screen.getByTestId('kunstwerk-modal-code-bevestiging')).toHaveTextContent(
      'Kunstwerkcodes volgen meestal het formaat AAA-BBB-00001'
    );
    expect(screen.getByTestId('kunstwerk-modal-code-bevestigen')).toHaveTextContent('Toch opslaan');
    expect(onAdd).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('kunstwerk-modal-code-bevestigen'));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ code: 'Akoestische stof' }))
    );
  });

  it('slaat een nieuw kunstwerk met een standaardcode direct op, zonder bevestigingspopup', async () => {
    uploadMock.mockResolvedValue('https://storage.example.com/nieuw.jpg');
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-foto-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-foto-preview')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-staand'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-2'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-maat-maat-2'));
    fireEvent.change(screen.getByTestId('kunstwerk-modal-code'), { target: { value: 'GLA-TES-00001' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-kunstenaar'), { target: { value: 'KU-00001' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Testwerk' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    expect(screen.queryByTestId('kunstwerk-modal-code-bevestiging')).toBeNull();
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ code: 'GLA-TES-00001' }))
    );
  });

  it('toont een gecombineerde bevestigingstekst als een bestaande code gewijzigd wordt naar een afwijkende waarde', async () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-kw-1'));
    fireEvent.change(screen.getByTestId('kunstwerk-modal-code'), { target: { value: 'Akoestische stof' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    const popup = screen.getByTestId('kunstwerk-modal-code-bevestiging');
    expect(popup).toHaveTextContent('Als er al een masterbestand is, dan moet dit ook aangepast worden!');
    expect(popup).toHaveTextContent('Kunstwerkcodes volgen meestal het formaat AAA-BBB-00001');
    expect(screen.getByTestId('kunstwerk-modal-code-bevestigen')).toHaveTextContent('Code wijzigen');

    fireEvent.click(screen.getByTestId('kunstwerk-modal-code-bevestigen'));
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('kw-1', expect.objectContaining({ code: 'Akoestische stof' }))
    );
  });
```

- [ ] **Step 3: Run the test file to verify the three new tests fail**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: the three new tests FAIL (no popup appears / `onAdd` is called immediately since
the pattern check doesn't exist yet), all pre-existing tests still PASS.

- [ ] **Step 4: Add the import**

In `src/components/beheer/KunstwerkenSection.tsx`, line 18, add the new import right after
the existing `kunstwerkCodeVoorstel` import:

```tsx
import { stelVolgendeCodeVoor, vindBekendePrefixen } from '@/lib/kunstwerkCodeVoorstel';
import { voldoetAanStandaardKunstwerkCode } from '@/lib/kunstwerkCodePatroon';
```

- [ ] **Step 5: Rename the state variable**

Line 132, replace:

```tsx
  const [pendingCodeWijziging, setPendingCodeWijziging] = useState<string | null>(null);
```

with:

```tsx
  const [pendingCodeBevestiging, setPendingCodeBevestiging] = useState<string | null>(null);
```

- [ ] **Step 6: Update `closeModal`**

Around line 461-466, replace:

```tsx
  function closeModal() {
    formaatSessionRef.current += 1;
    setPendingCodeWijziging(null);
    setMutationFailed(false);
    setModalState(null);
  }
```

with:

```tsx
  function closeModal() {
    formaatSessionRef.current += 1;
    setPendingCodeBevestiging(null);
    setMutationFailed(false);
    setModalState(null);
  }
```

- [ ] **Step 7: Add the derived pattern/wijziging booleans**

Directly after the existing `opslaanDisabled` declaration (around line 513-520, the block
starting `const opslaanDisabled =` and ending with its closing `;`), add:

```tsx
  const pendingCodeIsGewijzigd =
    pendingCodeBevestiging !== null &&
    modalState !== null &&
    modalState.mode === 'edit' &&
    pendingCodeBevestiging !== modalState.kunstwerk.code;
  const pendingCodeWijktAfVanPatroon =
    pendingCodeBevestiging !== null && !voldoetAanStandaardKunstwerkCode(pendingCodeBevestiging);
```

- [ ] **Step 8: Update `bewaarKunstwerk`'s failure branch**

Around line 522-538, in the `else` branch, replace:

```tsx
    } else {
      setPendingCodeWijziging(null);
      setActionError(null);
      setMutationFailed(true);
    }
```

with:

```tsx
    } else {
      setPendingCodeBevestiging(null);
      setActionError(null);
      setMutationFailed(true);
    }
```

- [ ] **Step 9: Rewrite `handleSave` and the cancel handler**

Around line 540-573, replace the whole block:

```tsx
  async function handleSave() {
    if (!modalState) return;
    const schoneCode = code.trim();

    // Dezelfde hoofdletterongevoelige vergelijking als de UNIQUE-index op de kolom,
    // voor ASCII-codes -- bij accenten vouwt utf8mb4_general_ci meer samen dan deze
    // JS-vergelijking (bv. "Café" en "Cafe" zijn voor MySQL gelijk, hier niet). Dit is
    // de nette melding; bij dat verschil valt de 409 uit /api/kunstwerken terug als
    // harde grens, en toont het scherm de generieke kunstwerkenActionError.
    const dubbel = (kunstwerken ?? []).some(
      (bestaand) =>
        bestaand.id !== (modalState.mode === 'edit' ? modalState.kunstwerk.id : '') &&
        bestaand.code.trim().toLowerCase() === schoneCode.toLowerCase()
    );
    if (dubbel) {
      setActionError(t('kunstwerkenCodeBestaatAl'));
      return;
    }

    // Exacte vergelijking: ook een wijziging van alleen de schrijfwijze is een
    // codewijziging, want de code belandt zo in bestellines en mogelijk in een
    // masterbestand buiten dit systeem.
    if (modalState.mode === 'edit' && schoneCode !== modalState.kunstwerk.code) {
      setActionError(null);
      setPendingCodeWijziging(schoneCode);
      return;
    }

    await bewaarKunstwerk();
  }

  function handleAnnulerenCodeWijziging() {
    setPendingCodeWijziging(null);
  }
```

with:

```tsx
  async function handleSave() {
    if (!modalState) return;
    const schoneCode = code.trim();

    // Dezelfde hoofdletterongevoelige vergelijking als de UNIQUE-index op de kolom,
    // voor ASCII-codes -- bij accenten vouwt utf8mb4_general_ci meer samen dan deze
    // JS-vergelijking (bv. "Café" en "Cafe" zijn voor MySQL gelijk, hier niet). Dit is
    // de nette melding; bij dat verschil valt de 409 uit /api/kunstwerken terug als
    // harde grens, en toont het scherm de generieke kunstwerkenActionError.
    const dubbel = (kunstwerken ?? []).some(
      (bestaand) =>
        bestaand.id !== (modalState.mode === 'edit' ? modalState.kunstwerk.id : '') &&
        bestaand.code.trim().toLowerCase() === schoneCode.toLowerCase()
    );
    if (dubbel) {
      setActionError(t('kunstwerkenCodeBestaatAl'));
      return;
    }

    // Exacte vergelijking: ook een wijziging van alleen de schrijfwijze is een
    // codewijziging, want de code belandt zo in bestellines en mogelijk in een
    // masterbestand buiten dit systeem.
    const codeIsGewijzigd = modalState.mode === 'edit' && schoneCode !== modalState.kunstwerk.code;
    // Bij een nieuw kunstwerk is elke code "nieuw ingesteld"; bij een bestaand kunstwerk
    // geldt de patrooncontrole alleen als de code ook echt verandert -- een ongewijzigde,
    // al langer bestaande afwijkende code (zoals "Akoestische stof") mag zonder popup
    // opgeslagen blijven worden.
    const codeWordtNieuwIngesteld = modalState.mode === 'add' || codeIsGewijzigd;
    const wijktAfVanPatroon = codeWordtNieuwIngesteld && !voldoetAanStandaardKunstwerkCode(schoneCode);

    if (codeIsGewijzigd || wijktAfVanPatroon) {
      setActionError(null);
      setPendingCodeBevestiging(schoneCode);
      return;
    }

    await bewaarKunstwerk();
  }

  function handleAnnulerenCodeBevestiging() {
    setPendingCodeBevestiging(null);
  }
```

- [ ] **Step 10: Update the footer confirmation buttons**

Around line 679-699, replace:

```tsx
        footerActions={
          pendingCodeWijziging !== null ? (
            <>
              <button
                type="button"
                onClick={bewaarKunstwerk}
                data-testid="kunstwerk-modal-code-bevestigen"
                className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
              >
                {t('kunstwerkenCodeWijzigenBevestig')}
              </button>
              <button
                type="button"
                onClick={handleAnnulerenCodeWijziging}
                data-testid="kunstwerk-modal-code-annuleren"
                className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('annuleren')}
              </button>
            </>
          ) : (
```

with:

```tsx
        footerActions={
          pendingCodeBevestiging !== null ? (
            <>
              <button
                type="button"
                onClick={bewaarKunstwerk}
                data-testid="kunstwerk-modal-code-bevestigen"
                className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
              >
                {pendingCodeIsGewijzigd ? t('kunstwerkenCodeWijzigenBevestig') : t('kunstwerkenCodePatroonBevestig')}
              </button>
              <button
                type="button"
                onClick={handleAnnulerenCodeBevestiging}
                data-testid="kunstwerk-modal-code-annuleren"
                className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('annuleren')}
              </button>
            </>
          ) : (
```

- [ ] **Step 11: Update the popup body text**

Around line 726-735, replace:

```tsx
        <>
          {pendingCodeWijziging !== null && (
            <div
              data-testid="kunstwerk-modal-code-bevestiging"
              className="flex flex-col gap-3 text-sm text-white/80"
            >
              <p className="font-semibold text-white">{t('kunstwerkenCodeWijzigenTitel')}</p>
              <p>{t('kunstwerkenCodeWijzigenTekst')}</p>
            </div>
          )}
          <div
            data-testid="kunstwerk-modal"
            className={
              pendingCodeWijziging !== null
                ? 'hidden'
                : 'grid grid-cols-1 gap-6 text-sm text-white/80 lg:grid-cols-[minmax(0,1fr)_320px] min-[1432px]:grid-cols-[minmax(0,1fr)_560px]'
            }
        >
```

with:

```tsx
        <>
          {pendingCodeBevestiging !== null && (
            <div
              data-testid="kunstwerk-modal-code-bevestiging"
              className="flex flex-col gap-3 text-sm text-white/80"
            >
              <p className="font-semibold text-white">
                {pendingCodeIsGewijzigd ? t('kunstwerkenCodeWijzigenTitel') : t('kunstwerkenCodePatroonTitel')}
              </p>
              {pendingCodeIsGewijzigd && <p>{t('kunstwerkenCodeWijzigenTekst')}</p>}
              {pendingCodeWijktAfVanPatroon && <p>{t('kunstwerkenCodePatroonTekst')}</p>}
            </div>
          )}
          <div
            data-testid="kunstwerk-modal"
            className={
              pendingCodeBevestiging !== null
                ? 'hidden'
                : 'grid grid-cols-1 gap-6 text-sm text-white/80 lg:grid-cols-[minmax(0,1fr)_320px] min-[1432px]:grid-cols-[minmax(0,1fr)_560px]'
            }
        >
```

- [ ] **Step 12: Run the test file again**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: the three new tests now PASS. Six pre-existing tests now FAIL — this is expected,
they use descriptive (non-pattern) codes as add-mode fixtures and now hit the new popup.
Fixed in the next step.

- [ ] **Step 13: Fix the pre-existing tests broken by the new add-mode check**

In the same file, six tests use a non-standard code while adding a new kunstwerk and expect
`onAdd`/`logActiviteit` to fire immediately. Update each to use a standard-pattern code so
they keep testing what they were testing (formaat/materiaal/stijl logic, not the code field)
without tripping the new popup:

1. `it('adds a new kunstwerk with the uploaded photo, selections, prices and NL description', ...)`
   (currently ~line 267): change
   `fireEvent.change(screen.getByTestId('kunstwerk-modal-code'), { target: { value: 'Vibrant Spirit' } });`
   to
   `fireEvent.change(screen.getByTestId('kunstwerk-modal-code'), { target: { value: 'GLA-VIB-00001' } });`
   and in the `onAdd` assertion, change `code: 'Vibrant Spirit',` to `code: 'GLA-VIB-00001',`.

2. `it('logs kunstwerk_toegevoegd with the logged-in medewerker when adding', ...)` (currently
   ~line 443): change both
   `fireEvent.change(screen.getByTestId('kunstwerk-modal-code'), { target: { value: 'Nieuw kunstwerk' } });`
   and the omschrijving line stays `'Nieuw kunstwerk'` (that one is fine, it's not the code) —
   change only the code line's value to `'GLA-NKW-00001'`, and update the assertion
   `expect(logActiviteitMock).toHaveBeenCalledWith('kunstwerk_toegevoegd', 'Nieuw kunstwerk')`
   to `expect(logActiviteitMock).toHaveBeenCalledWith('kunstwerk_toegevoegd', 'GLA-NKW-00001')`.

3. `it('does not log when adding fails', ...)` (currently ~line 493): change
   `fireEvent.change(screen.getByTestId('kunstwerk-modal-code'), { target: { value: 'Nieuw kunstwerk' } });`
   to
   `fireEvent.change(screen.getByTestId('kunstwerk-modal-code'), { target: { value: 'GLA-NKF-00001' } });`
   (no assertion references the code value in this test, so nothing else changes).

4. `it('shows a "Prijs per m²" field instead of the price matrix once every materiaal is unchecked, and saves it', ...)`
   (currently ~line 561): change
   `fireEvent.change(screen.getByTestId('kunstwerk-modal-code'), { target: { value: 'Akoestisch paneel' } });`
   to
   `fireEvent.change(screen.getByTestId('kunstwerk-modal-code'), { target: { value: 'GLA-AKO-00001' } });`
   and in the `onAdd` assertion, change `code: 'Akoestisch paneel',` to `code: 'GLA-AKO-00001',`.

5. `it('shows a "Prijs per m²" field and allows opslaan when a materiaal is chosen but every maat is unchecked, regardless of formaat', ...)`
   (currently ~line 605): change
   `fireEvent.change(screen.getByTestId('kunstwerk-modal-code'), { target: { value: '4mm veiligheidsglas per m2' } });`
   to
   `fireEvent.change(screen.getByTestId('kunstwerk-modal-code'), { target: { value: 'GLA-VEI-00001' } });`
   (the `onAdd` assertion uses `expect.objectContaining` without a `code` field, so nothing
   else changes).

6. `it('toggles an existing stijl/onderwerp checkbox and an AI-gegenereerd checkbox into the saved payload', ...)`
   (currently ~line 897): change
   `fireEvent.change(screen.getByTestId('kunstwerk-modal-code'), { target: { value: 'Test' } });`
   to
   `fireEvent.change(screen.getByTestId('kunstwerk-modal-code'), { target: { value: 'GLA-TES-00001' } });`
   (the `onAdd` assertion uses `expect.objectContaining` without a `code` field, so nothing
   else changes).

- [ ] **Step 14: Run the full test file to verify everything is green**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: PASS, every test in the file.

- [ ] **Step 15: Run the full test suite**

Run: `npm test`
Expected: PASS. This also confirms no other file references `pendingCodeWijziging` or
`handleAnnulerenCodeWijziging` (both renamed in this task).

- [ ] **Step 16: Commit**

```bash
git add src/components/beheer/KunstwerkenSection.tsx messages/nl.json tests/components/beheer/KunstwerkenSection.test.tsx
git commit -m "feat: confirm before saving a kunstwerkcode that deviates from the standard pattern"
```

---

### Task 3: Gebruikershandleiding bijwerken

**Files:**
- Modify: `src/components/beheer/documentatie/chapters/KunstwerkenChapter.tsx`

Per `CLAUDE.md`, a changed beheer process needs the manual updated in the same change. This
is prose-only (no new anchor, no changed screenshot), so no test is needed — the existing
`tests/components/beheer/documentatie/anchorIntegrity.test.tsx` and
`chapterScreenshots.test.tsx` cover regressions on those fronts already and don't need edits.

- [ ] **Step 1: Add a paragraph about the pattern check**

In `src/components/beheer/documentatie/chapters/KunstwerkenChapter.tsx`, inside the
`kunstwerken-code` `SubSection` (currently lines 15-33), insert a new `<P>` right after the
first paragraph (which ends `...beheer automatisch het eerstvolgende nummer voor.`) and
before the `Zodra een kunstwerk in een bestelling zit...` paragraph:

```tsx
        <P>
          Wijkt de code die je intypt af van dit formaat (drie letters, streepje, drie
          letters, streepje, vijf cijfers) — bijvoorbeeld omdat het product geen los
          artikelnummer heeft, zoals &quot;Akoestische stof&quot; — dan vraagt beheer bij het
          opslaan om een bevestiging. Je kunt gewoon doorgaan; het is alleen een controle
          tegen typefouten, geen harde eis.
        </P>
```

- [ ] **Step 2: Run the documentation test suite**

Run: `npx vitest run tests/components/beheer/documentatie`
Expected: PASS, no regressions.

- [ ] **Step 3: Commit**

```bash
git add src/components/beheer/documentatie/chapters/KunstwerkenChapter.tsx
git commit -m "docs: uitleg patroon-bevestiging in kunstwerkcode-hoofdstuk"
```
