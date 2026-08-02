# Beheer help-functies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable ⓘ help-icon-with-popover component to the beheer environment, and use it to explain six beheer screens (Klant, Bestellingen, Kunstenaar, Prijsmatrix, Kunstwerk, Prijsgroepen) plus two specific fields on the Kunstenaar screen (Opslag, exclusiviteit).

**Architecture:** One new shared component, `HelpHint` (`src/components/HelpHint.tsx`), rendered next to a screen's modal title (or, for the two non-modal sections, next to the section's toolbar) and next to two specific field labels in `KunstenaarsSection.tsx`. Clicking the ⓘ toggles a text popover; clicking outside, pressing Escape, or clicking the icon again closes it. All help copy lives in `messages/nl.json` under the existing `beheer` namespace (no `en`/`de`/`fr` — that namespace is Dutch-only by existing convention).

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Tailwind, `next-intl`, Vitest + Testing Library.

## Global Constraints

- Help copy goes ONLY in `messages/nl.json` under the `beheer` namespace — do not touch `en.json`/`de.json`/`fr.json`.
- Copy is plain, simple Dutch ("Jip en Janneke taal") — short sentences, no jargon. Length varies: one or two sentences for a single field, a short numbered list for a multi-step flow (Bestellingen).
- The `HelpHint` popover opens/closes on click/tap (not hover-only), so it works on touchscreens.
- Every new `data-testid` follows the existing kebab-case convention already used in each file (e.g. `klant-modal-*`, `kunstenaar-modal-*`).
- Follow the exact copy signed off in `docs/superpowers/specs/2026-08-02-beheer-help-functies-design.md` — do not paraphrase it.

---

### Task 1: `HelpHint` component

**Files:**
- Create: `src/components/HelpHint.tsx`
- Test: `tests/components/HelpHint.test.tsx`

**Interfaces:**
- Produces: `HelpHint({ text: string; size?: 'sm' | 'md'; testId?: string })` — a React component, default export is a **named** export `HelpHint`. Renders a button with `data-testid={testId ?? 'help-hint-button'}`; when open, renders a popover with `data-testid={testId ? \`${testId}-popover\` : 'help-hint-popover'}` containing `text`.

- [ ] **Step 1: Write the failing test**

Create `tests/components/HelpHint.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HelpHint } from '@/components/HelpHint';

describe('HelpHint', () => {
  it('is closed by default', () => {
    render(<HelpHint text="Dit is de uitleg." testId="test-help" />);
    expect(screen.queryByTestId('test-help-popover')).not.toBeInTheDocument();
  });

  it('shows the help text after clicking the icon, and hides it again on a second click', () => {
    render(<HelpHint text="Dit is de uitleg." testId="test-help" />);

    fireEvent.click(screen.getByTestId('test-help'));
    expect(screen.getByTestId('test-help-popover')).toHaveTextContent('Dit is de uitleg.');

    fireEvent.click(screen.getByTestId('test-help'));
    expect(screen.queryByTestId('test-help-popover')).not.toBeInTheDocument();
  });

  it('closes when Escape is pressed', () => {
    render(<HelpHint text="Dit is de uitleg." testId="test-help" />);
    fireEvent.click(screen.getByTestId('test-help'));
    expect(screen.getByTestId('test-help-popover')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('test-help-popover')).not.toBeInTheDocument();
  });

  it('closes when clicking outside the component', () => {
    render(
      <div>
        <HelpHint text="Dit is de uitleg." testId="test-help" />
        <button type="button" data-testid="outside">
          Buiten
        </button>
      </div>
    );
    fireEvent.click(screen.getByTestId('test-help'));
    expect(screen.getByTestId('test-help-popover')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByTestId('test-help-popover')).not.toBeInTheDocument();
  });

  it('falls back to default test ids when none is given', () => {
    render(<HelpHint text="Uitleg." />);
    fireEvent.click(screen.getByTestId('help-hint-button'));
    expect(screen.getByTestId('help-hint-popover')).toHaveTextContent('Uitleg.');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/HelpHint.test.tsx`
Expected: FAIL — `Cannot find module '@/components/HelpHint'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/components/HelpHint.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';

interface HelpHintProps {
  text: string;
  size?: 'sm' | 'md';
  testId?: string;
}

export function HelpHint({ text, size = 'md', testId }: HelpHintProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const buttonTestId = testId ?? 'help-hint-button';
  const popoverTestId = testId ? `${testId}-popover` : 'help-hint-popover';

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const dimensionClass = size === 'sm' ? 'h-4 w-4 text-[10px]' : 'h-5 w-5 text-xs';

  return (
    <span ref={containerRef} className="relative inline-flex normal-case tracking-normal">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        data-testid={buttonTestId}
        className={`inline-flex ${dimensionClass} shrink-0 items-center justify-center rounded-full border border-white/30 font-semibold text-white/60 hover:border-white/60 hover:text-white`}
      >
        ?
      </button>
      {isOpen && (
        <span
          role="tooltip"
          data-testid={popoverTestId}
          className="absolute left-1/2 top-full z-30 mt-2 w-64 -translate-x-1/2 rounded-md border border-white/10 bg-charcoal p-3 text-xs font-normal leading-relaxed text-white/80 shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/components/HelpHint.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/HelpHint.tsx tests/components/HelpHint.test.tsx
git commit -m "feat: add reusable HelpHint icon+popover component"
```

---

### Task 2: Klant help

**Files:**
- Modify: `messages/nl.json:402`
- Modify: `src/components/beheer/KlantModal.tsx:1-20` (import), `:210` (title)
- Test: `tests/components/beheer/KlantModal.test.tsx`

**Interfaces:**
- Consumes: `HelpHint` from Task 1 (`src/components/HelpHint.tsx`), props `{ text, testId }`.

- [ ] **Step 1: Add the translation key**

In `messages/nl.json`, find line 402 (`"klantenModalTitel": "Klantgegevens",`) and add a new key directly after it:

```json
    "klantenModalTitel": "Klantgegevens",
    "klantenHelp": "Hier bekijk en bewerk je de gegevens van een klant. Geef de klant een prijsgroep — dat moet, anders blijft de knop \"Goedkeuren\" uitgegrijsd. Wil je deze klant koppelen aan een kunstenaar? Kies die hieronder. Prijsafspraken en een eventuele opslag voor die kunstenaar stel je niet hier in, maar bij de kunstenaar zelf (scherm \"Kunstenaars\"). De knoppen onderaan: Opslaan bewaart je wijzigingen, Goedkeuren maakt van een aanvraag een actieve klant, Afwijzen wijst de aanvraag af.",
```

- [ ] **Step 2: Write the failing test**

In `tests/components/beheer/KlantModal.test.tsx`, add inside the `describe('KlantModal', ...)` block:

```tsx
  it('shows a help popover with an explanation of the screen', () => {
    renderModal(KLANT);
    expect(screen.queryByTestId('klant-modal-help-popover')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('klant-modal-help'));
    expect(screen.getByTestId('klant-modal-help-popover')).toHaveTextContent('prijsgroep');
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/components/beheer/KlantModal.test.tsx -t "help popover"`
Expected: FAIL — `Unable to find an element by: [data-testid="klant-modal-help"]`

- [ ] **Step 4: Add the import and wire up the icon**

In `src/components/beheer/KlantModal.tsx`, add the import alongside the other `@/components/*` imports (after line 7, `import { Combobox } from '@/components/Combobox';`):

```tsx
import { HelpHint } from '@/components/HelpHint';
```

Then change the `title` prop of the `<Modal>` (currently `title={t('klantenModalTitel')}` at line 210) to:

```tsx
      title={
        <span className="inline-flex items-center gap-2">
          {t('klantenModalTitel')}
          <HelpHint text={t('klantenHelp')} testId="klant-modal-help" />
        </span>
      }
```

Note: the test id is `klant-modal-help` (singular, matching this file's existing `klant-modal-*` convention for every other field/button), not `klanten-help` — the i18n key stays `klantenHelp` (plural, matching this file's translation-key convention), only the `data-testid` is singular.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/components/beheer/KlantModal.test.tsx`
Expected: PASS (all tests in the file, including the new one)

- [ ] **Step 6: Commit**

```bash
git add messages/nl.json src/components/beheer/KlantModal.tsx tests/components/beheer/KlantModal.test.tsx
git commit -m "feat: add help popover to the Klant screen"
```

---

### Task 3: Bestellingen help

**Files:**
- Modify: `messages/nl.json:462`
- Modify: `src/components/beheer/BestellingenSection.tsx:1-9` (import), `:139-164` (render)
- Test: `tests/components/beheer/BestellingenSection.test.tsx`

**Interfaces:**
- Consumes: `HelpHint` from Task 1.

- [ ] **Step 1: Add the translation key**

In `messages/nl.json`, find line 462 (`"bestellingenModalTitel": "Bestelgegevens",`) and add a new key directly after it:

```json
    "bestellingenModalTitel": "Bestelgegevens",
    "bestellingenHelp": "Zo werkt versturen naar de drukker: 1. Vink een of meer bestellingen aan die klaarstaan (status \"Te versturen naar drukker\"). 2. Klik op Versturen naar drukker — kies een drukker en bekijk de mail voordat je 'm verstuurt. 3. Na versturen krijgen alle aangevinkte bestellingen de status \"Verstuurd naar drukker\". 4. Een verstuurde mail terugvinden? Open de drukker zelf (scherm \"Drukkers\") — daar staat een overzicht van alle verstuurde mails.",
```

- [ ] **Step 2: Write the failing test**

In `tests/components/beheer/BestellingenSection.test.tsx`, add inside the `describe('BestellingenSection', ...)` block (check the existing `describe` name in the file and match it):

```tsx
  it('shows a help popover explaining the drukker flow', () => {
    renderSection();
    expect(screen.queryByTestId('bestellingen-help-popover')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('bestellingen-help'));
    expect(screen.getByTestId('bestellingen-help-popover')).toHaveTextContent('drukker');
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/components/beheer/BestellingenSection.test.tsx -t "help popover"`
Expected: FAIL — `Unable to find an element by: [data-testid="bestellingen-help"]`

- [ ] **Step 4: Add the import and wire up the icon**

In `src/components/beheer/BestellingenSection.tsx`, add the import after line 5 (`import { DataTable, type Column } from '@/components/DataTable';`):

```tsx
import { HelpHint } from '@/components/HelpHint';
```

Then, immediately before `<DataTable<Bestelling>` (currently starting at line 164), insert a small toolbar row:

```tsx
      <div className="mb-3 flex items-center justify-end">
        <HelpHint text={t('bestellingenHelp')} testId="bestellingen-help" />
      </div>
      <DataTable<Bestelling>
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/components/beheer/BestellingenSection.test.tsx`
Expected: PASS (all tests in the file, including the new one)

- [ ] **Step 6: Commit**

```bash
git add messages/nl.json src/components/beheer/BestellingenSection.tsx tests/components/beheer/BestellingenSection.test.tsx
git commit -m "feat: add help popover to the Bestellingen screen"
```

---

### Task 4: Kunstenaar help (screen + Opslag field + exclusiviteit fields)

**Files:**
- Modify: `messages/nl.json:610` (screen help), `:598` (opslag help), `:603` (exclusiviteit help)
- Modify: `src/components/beheer/KunstenaarsSection.tsx:3-16` (import), `:364` (title), `:496-505` (opslag label), `:507-510` (exclusiviteit legend)
- Test: `tests/components/beheer/KunstenaarsSection.test.tsx`

**Interfaces:**
- Consumes: `HelpHint` from Task 1.

- [ ] **Step 1: Add the translation keys**

In `messages/nl.json`, find line 598 (`"kunstenaarsLabelPrijsopslag": "Prijsopslag (€, wordt bij de matrixprijs opgeteld)",`) and add a new key directly after it:

```json
    "kunstenaarsLabelPrijsopslag": "Prijsopslag (€, wordt bij de matrixprijs opgeteld)",
    "kunstenaarsHelpOpslag": "Dit bedrag komt boven op de basisprijs uit de prijsmatrix, voor ieder kunstwerk van deze kunstenaar. Bijvoorbeeld: basisprijs €100 + opslag €15 = €115. Het is een vast bedrag, geen percentage.",
```

Then find line 603 (in the file as it now stands, one line further down: `"kunstenaarsLabelKlant2": "Klant 2",`) and add a new key directly after it:

```json
    "kunstenaarsLabelKlant2": "Klant 2",
    "kunstenaarsHelpExclusiviteit": "Deze kunstenaar kan optioneel exclusief werken voor twee klanten tegelijk (nooit voor precies één). Beide leeg = open voor iedereen. Vul je ze in, dan moet minstens één van de twee de klant zijn die al bij deze kunstenaar hoort (ingesteld bij die klant zelf).",
```

Then find `"kunstenaarsModalTitelToevoegen": "Kunstenaar toevoegen",` (now a couple of lines further down, right after the two additions above) and add a new key directly after it:

```json
    "kunstenaarsModalTitelToevoegen": "Kunstenaar toevoegen",
    "kunstenaarsHelp": "Hier beheer je een kunstenaar en de prijsafspraken die je met hem of haar hebt.",
```

- [ ] **Step 2: Write the failing tests**

In `tests/components/beheer/KunstenaarsSection.test.tsx`, add inside the `describe('KunstenaarsSection', ...)` block:

```tsx
  it('shows a help popover with an explanation of the screen', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstenaars-add'));

    fireEvent.click(screen.getByTestId('kunstenaar-modal-help'));
    expect(screen.getByTestId('kunstenaar-modal-help-popover')).toHaveTextContent('prijsafspraken');
  });

  it('shows a help popover next to the Opslag field', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstenaars-add'));

    fireEvent.click(screen.getByTestId('kunstenaar-modal-help-opslag'));
    expect(screen.getByTestId('kunstenaar-modal-help-opslag-popover')).toHaveTextContent('matrixprijs');
  });

  it('shows a help popover next to the exclusiviteit fields', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstenaars-add'));

    fireEvent.click(screen.getByTestId('kunstenaar-modal-help-exclusiviteit'));
    expect(screen.getByTestId('kunstenaar-modal-help-exclusiviteit-popover')).toHaveTextContent('twee klanten');
  });
```

Note: the test ids use the singular `kunstenaar-modal-*` prefix (matching this file's existing modal-field convention — e.g. `kunstenaar-modal-prijsopslag`, `kunstenaar-modal-naam`), not the plural `kunstenaars-*` prefix. The `kunstenaars-add` id used to open the modal is pre-existing and stays as-is — only the new help testids follow the `kunstenaar-modal-*` convention.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/KunstenaarsSection.test.tsx -t "help popover"`
Expected: FAIL — `Unable to find an element by: [data-testid="kunstenaar-modal-help"]` (and similarly for the other two, once the first is fixed)

- [ ] **Step 4: Add the import and wire up the three icons**

In `src/components/beheer/KunstenaarsSection.tsx`, add the import after line 7 (`import { Combobox } from '@/components/Combobox';`):

```tsx
import { HelpHint } from '@/components/HelpHint';
```

Change the `title` prop of the `<Modal>` (currently at line 364):

```tsx
        title={
          <span className="inline-flex items-center gap-2">
            {modalState?.mode === 'edit' ? t('kunstenaarsModalTitelBewerken') : t('kunstenaarsModalTitelToevoegen')}
            <HelpHint text={t('kunstenaarsHelp')} testId="kunstenaar-modal-help" />
          </span>
        }
```

Change the Opslag `<label>` (currently lines 496-505):

```tsx
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            <span className="inline-flex items-center gap-2">
              {t('kunstenaarsLabelPrijsopslag')}
              <HelpHint text={t('kunstenaarsHelpOpslag')} size="sm" testId="kunstenaar-modal-help-opslag" />
            </span>
            <input
              type="number"
              value={prijsopslag}
              onChange={(event) => setPrijsopslag(Number(event.target.value))}
              data-testid="kunstenaar-modal-prijsopslag"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
```

Change the exclusiviteit `<fieldset>`'s `<legend>` (currently lines 507-510):

```tsx
          <fieldset className="flex flex-col gap-3">
            <legend className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-white/60">
              {t('kunstenaarsLabelKlant')}
              <HelpHint text={t('kunstenaarsHelpExclusiviteit')} size="sm" testId="kunstenaar-modal-help-exclusiviteit" />
            </legend>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/KunstenaarsSection.test.tsx`
Expected: PASS (all tests in the file, including the three new ones)

- [ ] **Step 6: Commit**

```bash
git add messages/nl.json src/components/beheer/KunstenaarsSection.tsx tests/components/beheer/KunstenaarsSection.test.tsx
git commit -m "feat: add help popovers to the Kunstenaar screen (opslag, exclusiviteit)"
```

---

### Task 5: Prijsmatrix help

**Files:**
- Modify: `messages/nl.json:615`
- Modify: `src/components/beheer/PrijsmatrixSection.tsx:1-7` (import), `:160` (title)
- Test: `tests/components/beheer/PrijsmatrixSection.test.tsx`

**Interfaces:**
- Consumes: `HelpHint` from Task 1.

- [ ] **Step 1: Add the translation key**

In `messages/nl.json`, find line 615 (`"prijsmatrixTitle": "Prijs per maat en materiaal",`) and add a new key directly after it:

```json
    "prijsmatrixTitle": "Prijs per maat en materiaal",
    "prijsmatrixHelp": "Hier stel je de basisprijs in per combinatie van maat en materiaal. Zo komt de uiteindelijke prijs tot stand: meestal is dat de basisprijs uit deze tabel plus de vaste opslag van de kunstenaar (indien van toepassing). Heeft een kunstwerk geen materiaal of geen maat (bv. akoestische stof)? Dan geldt geen matrixprijs, maar de prijs-per-m² die bij dat kunstwerk zelf is ingesteld. Staat er nog geen prijs in voor een combinatie? Dan blijft de prijs onbekend totdat je 'm hier invult.",
```

- [ ] **Step 2: Write the failing test**

In `tests/components/beheer/PrijsmatrixSection.test.tsx`, add inside the `describe('PrijsmatrixSection', ...)` block:

```tsx
  it('shows a help popover explaining how the price is calculated', () => {
    renderSection();
    expect(screen.queryByTestId('prijsmatrix-help-popover')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('prijsmatrix-help'));
    expect(screen.getByTestId('prijsmatrix-help-popover')).toHaveTextContent('basisprijs');
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/components/beheer/PrijsmatrixSection.test.tsx -t "help popover"`
Expected: FAIL — `Unable to find an element by: [data-testid="prijsmatrix-help"]`

- [ ] **Step 4: Add the import and wire up the icon**

In `src/components/beheer/PrijsmatrixSection.tsx`, add the import after line 4 (`import { useTranslations } from 'next-intl';`):

```tsx
import { HelpHint } from '@/components/HelpHint';
```

Change the title `<p>` (currently line 160):

```tsx
      <p className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wide text-white/60">
        {t('prijsmatrixTitle')}
        <HelpHint text={t('prijsmatrixHelp')} testId="prijsmatrix-help" />
      </p>
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/components/beheer/PrijsmatrixSection.test.tsx`
Expected: PASS (all tests in the file, including the new one)

- [ ] **Step 6: Commit**

```bash
git add messages/nl.json src/components/beheer/PrijsmatrixSection.tsx tests/components/beheer/PrijsmatrixSection.test.tsx
git commit -m "feat: add help popover to the Prijsmatrix screen"
```

---

### Task 6: Kunstwerk help

**Files:**
- Modify: `messages/nl.json:576`
- Modify: `src/components/beheer/KunstwerkenSection.tsx:3-16` (import), `:610` (title)
- Test: `tests/components/beheer/KunstwerkenSection.test.tsx`

**Interfaces:**
- Consumes: `HelpHint` from Task 1.

- [ ] **Step 1: Add the translation key**

In `messages/nl.json`, find line 576 (`"kunstwerkenModalTitelBewerken": "Kunstwerk bewerken",`) and add a new key directly after it:

```json
    "kunstwerkenModalTitelBewerken": "Kunstwerk bewerken",
    "kunstwerkenHelp": "Formaat bepaalt welke maten je kunt aanvinken: bij Vierkant zijn alleen vierkante maten (breedte = hoogte) te kiezen, de rest is grijs; bij Liggend en Staand zijn alleen niet-vierkante maten te kiezen; bij Alle is elke maat te kiezen, niets is uitgeschakeld. Vink je geen enkele maat aan (of geen materiaal)? Dan verschijnt een prijs-per-m²-veld in plaats van de vaste maat/materiaal-prijzen. Dit wordt nu gebruikt voor akoestische stof, maar werkt op dezelfde manier voor elk product dat je per vierkante meter wilt verkopen — de klant vult dan zelf breedte en hoogte in.",
```

- [ ] **Step 2: Write the failing test**

In `tests/components/beheer/KunstwerkenSection.test.tsx`, add inside the `describe('KunstwerkenSection', ...)` block:

```tsx
  it('shows a help popover explaining formaat and prijs-per-m²', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));

    fireEvent.click(screen.getByTestId('kunstwerk-modal-help'));
    expect(screen.getByTestId('kunstwerk-modal-help-popover')).toHaveTextContent('Formaat');
  });
```

Note: the test id uses the singular `kunstwerk-modal-*` prefix (matching this file's existing modal-field convention — e.g. `kunstwerk-modal-opslaan`, `kunstwerk-modal-foto-dropzone`), not the plural `kunstwerken-*` prefix. The `kunstwerken-add` id used to open the modal is pre-existing and stays as-is.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx -t "help popover"`
Expected: FAIL — `Unable to find an element by: [data-testid="kunstwerk-modal-help"]`

- [ ] **Step 4: Add the import and wire up the icon**

In `src/components/beheer/KunstwerkenSection.tsx`, add the import after line 6 (`import { Modal } from '@/components/Modal';`):

```tsx
import { HelpHint } from '@/components/HelpHint';
```

Change the `title` prop of the `<Modal>` (currently at line 610):

```tsx
        title={
          <span className="inline-flex items-center gap-2">
            {modalState?.mode === 'edit' ? t('kunstwerkenModalTitelBewerken') : t('kunstwerkenModalTitelToevoegen')}
            <HelpHint text={t('kunstwerkenHelp')} testId="kunstwerk-modal-help" />
          </span>
        }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: PASS (all tests in the file, including the new one)

- [ ] **Step 6: Commit**

```bash
git add messages/nl.json src/components/beheer/KunstwerkenSection.tsx tests/components/beheer/KunstwerkenSection.test.tsx
git commit -m "feat: add help popover to the Kunstwerk screen"
```

---

### Task 7: Prijsgroepen help

**Files:**
- Modify: `messages/nl.json:626`
- Modify: `src/components/beheer/PrijsgroepenSection.tsx:3-11` (import), `:154` (title)
- Test: `tests/components/beheer/PrijsgroepenSection.test.tsx`

**Interfaces:**
- Consumes: `HelpHint` from Task 1.

- [ ] **Step 1: Add the translation key**

In `messages/nl.json`, find line 626 (`"prijsgroepenModalTitelBewerken": "Prijsgroep bewerken",`) and add a new key directly after it:

```json
    "prijsgroepenModalTitelBewerken": "Prijsgroep bewerken",
    "prijsgroepenHelp": "Kies of dit een korting of een opslag is, en vul het percentage in. Let op: dit is puur informatief — het percentage wordt nergens automatisch verrekend in de prijs van een bestelling. Het is alleen een label bij de klant.",
```

- [ ] **Step 2: Write the failing test**

In `tests/components/beheer/PrijsgroepenSection.test.tsx`, add inside the `describe('PrijsgroepenSection', ...)` block:

```tsx
  it('shows a help popover explaining that the percentage is informational only', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('prijsgroepen-add'));

    fireEvent.click(screen.getByTestId('prijsgroep-modal-help'));
    expect(screen.getByTestId('prijsgroep-modal-help-popover')).toHaveTextContent('puur informatief');
  });
```

Note: the test id uses the singular `prijsgroep-modal-*` prefix (matching this file's existing modal-field convention — e.g. `prijsgroep-modal-opslaan`, `prijsgroep-modal-verwijderen`), not the plural `prijsgroepen-*` prefix. The `prijsgroepen-add` id used to open the modal is pre-existing and stays as-is.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/components/beheer/PrijsgroepenSection.test.tsx -t "help popover"`
Expected: FAIL — `Unable to find an element by: [data-testid="prijsgroep-modal-help"]`

- [ ] **Step 4: Add the import and wire up the icon**

In `src/components/beheer/PrijsgroepenSection.tsx`, add the import after line 6 (`import { Modal } from '@/components/Modal';`):

```tsx
import { HelpHint } from '@/components/HelpHint';
```

Change the `title` prop of the `<Modal>` (currently at line 154):

```tsx
        title={
          <span className="inline-flex items-center gap-2">
            {modalState?.mode === 'edit' ? t('prijsgroepenModalTitelBewerken') : t('prijsgroepenModalTitelToevoegen')}
            <HelpHint text={t('prijsgroepenHelp')} testId="prijsgroep-modal-help" />
          </span>
        }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/components/beheer/PrijsgroepenSection.test.tsx`
Expected: PASS (all tests in the file, including the new one)

- [ ] **Step 6: Commit**

```bash
git add messages/nl.json src/components/beheer/PrijsgroepenSection.tsx tests/components/beheer/PrijsgroepenSection.test.tsx
git commit -m "feat: add help popover to the Prijsgroepen screen"
```

---

### Task 8: Full suite + lint sanity check

**Files:** none (verification only)

**Interfaces:** none.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — no regressions in any of the files touched across Tasks 1-7, or anywhere else (the `HelpHint` component and its call sites are additive; nothing existing was removed).

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS — no new lint errors (in particular, check for unused-import or JSX-key warnings on the new `HelpHint` usages).

- [ ] **Step 3: Manually smoke-test in the dev server**

Run: `npm run dev`, open the beheer environment (Klant, Bestellingen, Kunstenaar, Prijsmatrix, Kunstwerk, Prijsgroepen), and for each: open the screen, click the ⓘ icon, confirm the popover text matches the spec, click elsewhere to confirm it closes. For Kunstenaar specifically, also check the two field-level icons next to Opslag and next to Klant 1/Klant 2.

No commit for this task — it's a verification-only step.
