# Verplichte velden zichtbaar maken Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every already-required field in the beheer modals and the public/account forms visible as required, via a shared red-asterisk marker plus a one-line legend, without changing any existing required-ness logic (except `SettingsSection.tsx`, which currently has none).

**Architecture:** One new presentational component pair, `RequiredMark` (inline asterisk) and `RequiredLegend` (legend line), imported into every file that already has a `disabled={...}` save-button condition or a native `required` input. Each file's edit only touches its own JSX labels — no shared state, no prop drilling, no change to save/validation logic itself.

**Tech Stack:** Next.js 14 / React / TypeScript, `next-intl` for translated legend text, Vitest + `@testing-library/react` for tests (existing patterns: `renderModal`/`renderSection`/`renderForm` helpers wrapped in `NextIntlClientProvider`).

## Global Constraints

- Visual pattern is a red asterisk (`text-red-400`) right after the label text, plus a legend line "* verplicht veld" (and its `en`/`de`/`fr` translations) once per modal/form body — from `docs/superpowers/specs/2026-07-30-verplichte-velden-indicator-design.md`.
- Never change which fields are required, anywhere, **except** `SettingsSection.tsx`, where native `required` is newly added to match `RegistrationForm.tsx`.
- `KunstwerkenSection.tsx` keeps its existing red-border/hint-text pattern unchanged — the asterisk is additive only.
- `BestellingModal.tsx` and `AccountOrderModal.tsx` are out of scope (no labeled fields / no inputs).
- The `beheer` translation namespace exists only in `messages/nl.json`; `registrationPage`, `contactPage`, `loginPage`, `resetPasswordPage`, `accountPage.settings` exist in `nl`/`en`/`de`/`fr`.
- New translation key name: `verplichtVeldLegende`, value `"* verplicht veld"` (`en`: `"* required field"`, `de`: `"* Pflichtfeld"`, `fr`: `"* champ obligatoire"`).
- Existing tests assert on `data-testid` and use `toHaveTextContent` (substring match) — never exact-text — so an added asterisk never breaks an existing assertion; don't introduce exact-match assertions on label text either.
- **Correction found during Task 2 review, binding on every remaining task:** almost every label in this codebase is `<label className="flex flex-col ...">` (or `flex flex-1 flex-col`) with the caption text as a bare text node and the `<input>`/`<select>` as its sibling — that is a flex container, so each in-flow child (including the bare text node) becomes its own flex item and lands on its own row. Inserting `<RequiredMark />` as a **third** bare sibling (`{t('xLabel')}` then `<RequiredMark />` then `<input>`) puts the asterisk on its own row between the caption and the field, not inline after the caption. The fix: wrap the caption text and the mark together in a plain (non-flex) `<span>` so they form a single flex item — `<span>{t('xLabel')}<RequiredMark /></span>` — as the flex-col label's first child, in place of the bare `{t('xLabel')}` text node. This applies to every `<label className="flex ... flex-col ...">` insertion in this plan (Tasks 2-4, 6-14, and the Foto/Naam/Prijs-per-m²/Omschrijving-NL labels in Task 5). It does **not** apply to `<legend>` or plain `<span>` insertions that carry no `flex` class themselves (the Formaat/Segmenten/Prijzen insertions in Task 5) — those already flow inline correctly as originally written.

---

### Task 1: Shared `RequiredMark` / `RequiredLegend` component

**Files:**
- Create: `src/components/RequiredFieldHint.tsx`
- Test: `tests/components/RequiredFieldHint.test.tsx`

**Interfaces:**
- Produces: `RequiredMark(): JSX.Element` (no props) — renders `<span className="text-red-400" aria-hidden="true"> *</span>`.
- Produces: `RequiredLegend({ testId, children }: { testId: string; children: ReactNode }): JSX.Element` — renders `<p data-testid={testId} className="text-[11px] text-white/40">{children}</p>`.
- Both are consumed by every later task via `import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';`.

- [ ] **Step 1: Write the failing test**

Create `tests/components/RequiredFieldHint.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';

describe('RequiredFieldHint', () => {
  it('renders an asterisk next to arbitrary label text', () => {
    render(
      <label data-testid="test-label">
        Veldnaam
        <RequiredMark />
      </label>
    );
    expect(screen.getByTestId('test-label')).toHaveTextContent('Veldnaam *');
  });

  it('renders the legend text under the given testId', () => {
    render(<RequiredLegend testId="test-verplicht-legende">* verplicht veld</RequiredLegend>);
    expect(screen.getByTestId('test-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/RequiredFieldHint.test.tsx`
Expected: FAIL — `Cannot find module '@/components/RequiredFieldHint'`

- [ ] **Step 3: Write the implementation**

Create `src/components/RequiredFieldHint.tsx`:

```tsx
import type { ReactNode } from 'react';

export function RequiredMark() {
  return (
    <span className="text-red-400" aria-hidden="true">
      {' *'}
    </span>
  );
}

interface RequiredLegendProps {
  testId: string;
  children: ReactNode;
}

export function RequiredLegend({ testId, children }: RequiredLegendProps) {
  return (
    <p data-testid={testId} className="text-[11px] text-white/40">
      {children}
    </p>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/RequiredFieldHint.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/RequiredFieldHint.tsx tests/components/RequiredFieldHint.test.tsx
git commit -m "feat: add shared RequiredMark/RequiredLegend components"
```

---

### Task 2: `KlantModal.tsx` — Prijsgroep

**Files:**
- Modify: `src/components/beheer/KlantModal.tsx:1-10` (import), `:447` (label), `:495-501` (legend placement)
- Modify: `messages/nl.json:277` (new `beheer.verplichtVeldLegende` key)
- Test: `tests/components/beheer/KlantModal.test.tsx`

**Interfaces:**
- Consumes: `RequiredMark`, `RequiredLegend` from Task 1.
- Consumes: `t('verplichtVeldLegende')` from the `beheer` namespace (new key added in this task, first beheer file to use it).

- [ ] **Step 1: Write the failing test**

Add to `tests/components/beheer/KlantModal.test.tsx`, inside the `describe('KlantModal', ...)` block (after the existing `'shows the klant details and pre-selects the prijsgroep dropdown'` test):

```tsx
  it('shows the required-field legend', () => {
    renderModal(KLANT);
    expect(screen.getByTestId('klant-modal-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/beheer/KlantModal.test.tsx -t "required-field legend"`
Expected: FAIL — `Unable to find an element by: [data-testid="klant-modal-verplicht-legende"]`

- [ ] **Step 3: Add the translation key**

In `messages/nl.json`, line 277 currently reads:

```json
    "title": "Beheer",
```

Insert a new line directly after it:

```json
    "title": "Beheer",
    "verplichtVeldLegende": "* verplicht veld",
```

- [ ] **Step 4: Implement in `KlantModal.tsx`**

Add the import (top of file, after the existing `@/components/Modal` import at line 5):

```tsx
import { Modal } from '@/components/Modal';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
```

Change the Prijsgroep label (line 447) from:

```tsx
              {t('klantenLabelPrijsgroep')}
```

to (the label is `flex flex-1 flex-col` — wrap text + mark in a `<span>` so they share one flex item instead of the mark landing on its own row; see Global Constraints):

```tsx
              <span>
                {t('klantenLabelPrijsgroep')}
                <RequiredMark />
              </span>
```

Add the legend right before the existing error block (line 497), i.e. change:

```tsx
          </div>

          {error && (
```

to:

```tsx
          </div>

          <RequiredLegend testId="klant-modal-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

          {error && (
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/components/beheer/KlantModal.test.tsx`
Expected: PASS (all tests, including the new one)

- [ ] **Step 6: Commit**

```bash
git add src/components/beheer/KlantModal.tsx messages/nl.json tests/components/beheer/KlantModal.test.tsx
git commit -m "feat: mark Prijsgroep as required in KlantModal"
```

---

### Task 3: `DrukkerModal.tsx` — Naam, E-mailadres

**Files:**
- Modify: `src/components/beheer/DrukkerModal.tsx:1-9` (import), `:119` (label Naam), `:161` (label E-mailadres), `:180-186` (legend placement)
- Test: `tests/components/beheer/DrukkerModal.test.tsx`

**Interfaces:**
- Consumes: `RequiredMark`, `RequiredLegend` from Task 1; `t('verplichtVeldLegende')` (key already added in Task 2).

- [ ] **Step 1: Write the failing test**

Add to `tests/components/beheer/DrukkerModal.test.tsx` (new `describe` block, since the existing one is scoped to `'DrukkerModal zendingen'`):

```tsx
describe('DrukkerModal verplichte velden', () => {
  it('shows the required-field legend', () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal({ mode: 'add' });
    expect(screen.getByTestId('drukker-modal-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/beheer/DrukkerModal.test.tsx -t "verplichte velden"`
Expected: FAIL — element with testid `drukker-modal-verplicht-legende` not found

- [ ] **Step 3: Implement**

Add the import (after line 5, `import { Modal } ...`):

```tsx
import { Modal } from '@/components/Modal';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
```

Both labels below are `flex flex-col` — per Global Constraints, wrap the caption text and `<RequiredMark />` in a shared `<span>` instead of adding the mark as a bare third sibling, or the asterisk renders on its own row.

Change the Naam label (line 119):

```tsx
          {t('drukkersLabelNaam')}
```
to
```tsx
          <span>
            {t('drukkersLabelNaam')}
            <RequiredMark />
          </span>
```

Change the E-mailadres label (line 161):

```tsx
          {t('drukkersLabelEmail')}
```
to
```tsx
          <span>
            {t('drukkersLabelEmail')}
            <RequiredMark />
          </span>
```

Add the legend right after the Prijsafspraken field and before the error block. Change (lines 178-182):

```tsx
        </label>

        {actionError && (
```

to:

```tsx
        </label>

        <RequiredLegend testId="drukker-modal-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

        {actionError && (
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/beheer/DrukkerModal.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/DrukkerModal.tsx tests/components/beheer/DrukkerModal.test.tsx
git commit -m "feat: mark Naam and E-mailadres as required in DrukkerModal"
```

---

### Task 4: `KunstenaarsSection.tsx` — Naam, Omschrijving (NL)

**Files:**
- Modify: `src/components/beheer/KunstenaarsSection.tsx:1-10` (import), `:392` (label Naam), `:403` (label Omschrijving NL), `:473-475` (legend placement)
- Test: `tests/components/beheer/KunstenaarsSection.test.tsx`

**Interfaces:**
- Consumes: `RequiredMark`, `RequiredLegend`, `t('verplichtVeldLegende')`.

- [ ] **Step 1: Write the failing test**

Add inside the existing `describe('KunstenaarsSection', ...)` block:

```tsx
  it('shows the required-field legend when the modal is open', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstenaars-add'));
    expect(screen.getByTestId('kunstenaar-modal-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/beheer/KunstenaarsSection.test.tsx -t "required-field legend"`
Expected: FAIL — testid not found

- [ ] **Step 3: Implement**

Add the import (after line 6, `import { Modal } ...`):

```tsx
import { Modal } from '@/components/Modal';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
```

Both labels below are `flex flex-col` — per Global Constraints, wrap the caption text and `<RequiredMark />` in a shared `<span>` instead of adding the mark as a bare third sibling, or the asterisk renders on its own row.

Change the Naam label (line 392):

```tsx
            {t('kunstenaarsLabelNaam')}
```
to
```tsx
            <span>
              {t('kunstenaarsLabelNaam')}
              <RequiredMark />
            </span>
```

Change the Omschrijving-NL label (line 403):

```tsx
            {t('kunstenaarsLabelOmschrijvingNl')}
```
to
```tsx
            <span>
              {t('kunstenaarsLabelOmschrijvingNl')}
              <RequiredMark />
            </span>
```

Add the legend right before the error block. Change (lines 473-476):

```tsx
          </label>

          {actionError && (
```

(the `</label>` closing the Klant-combobox field, line 473) to:

```tsx
          </label>

          <RequiredLegend testId="kunstenaar-modal-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

          {actionError && (
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/beheer/KunstenaarsSection.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/KunstenaarsSection.tsx tests/components/beheer/KunstenaarsSection.test.tsx
git commit -m "feat: mark Naam and Omschrijving (NL) as required in KunstenaarsSection"
```

---

### Task 5: `KunstwerkenSection.tsx` — Foto, Naam, Formaat, Segmenten, Prijzen/Prijs per m², Omschrijving (NL)

**Files:**
- Modify: `src/components/beheer/KunstwerkenSection.tsx:1-14` (import), `:579`, `:618`, `:657`, `:695`, `:859`, `:918`, `:940` (labels), `:981-985` (legend placement)
- Test: `tests/components/beheer/KunstwerkenSection.test.tsx`

**Interfaces:**
- Consumes: `RequiredMark`, `RequiredLegend`, `t('verplichtVeldLegende')`.
- Does not touch the existing `...Verplicht` hint texts or their red-border classNames — purely additive.

- [ ] **Step 1: Write the failing test**

Add inside the existing `describe('KunstwerkenSection', ...)` block (after the `'pre-checks every materiaal and maat checkbox...'` test):

```tsx
  it('shows the required-field legend when the modal is open', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    expect(screen.getByTestId('kunstwerk-modal-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx -t "required-field legend"`
Expected: FAIL — testid not found

- [ ] **Step 3: Implement**

Add the import (after line 6, `import { Modal } ...`):

```tsx
import { Modal } from '@/components/Modal';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
```

Foto and Naam are both `flex flex-col` labels — per Global Constraints, wrap the caption text and `<RequiredMark />` in a shared `<span>` instead of adding the mark as a bare sibling, or the asterisk renders on its own row. (Formaat/Segmenten below are `<legend>`, not `flex`, so no wrap needed there — only for `<label>` insertions.)

Foto label (line 579):
```tsx
            {t('kunstwerkenLabelFoto')}
```
→
```tsx
            <span>
              {t('kunstwerkenLabelFoto')}
              <RequiredMark />
            </span>
```

Naam label (line 618):
```tsx
            {t('kunstwerkenLabelNaam')}
```
→
```tsx
            <span>
              {t('kunstwerkenLabelNaam')}
              <RequiredMark />
            </span>
```

Formaat legend (line 656-658):
```tsx
            <legend className="text-xs uppercase tracking-wide text-white/60">
              {t('kunstwerkenLabelFormaat')}
            </legend>
```
→
```tsx
            <legend className="text-xs uppercase tracking-wide text-white/60">
              {t('kunstwerkenLabelFormaat')}
              <RequiredMark />
            </legend>
```

Segmenten legend (line 694-696):
```tsx
            <legend className="text-xs uppercase tracking-wide text-white/60">
              {t('kunstwerkenLabelSegmenten')}
            </legend>
```
→
```tsx
            <legend className="text-xs uppercase tracking-wide text-white/60">
              {t('kunstwerkenLabelSegmenten')}
              <RequiredMark />
            </legend>
```

Prijzen header (line 859):
```tsx
              <span className="text-xs uppercase tracking-wide text-white/60">{t('kunstwerkenLabelPrijzen')}</span>
```
→
```tsx
              <span className="text-xs uppercase tracking-wide text-white/60">
                {t('kunstwerkenLabelPrijzen')}
                <RequiredMark />
              </span>
```

Prijs-per-m² and Omschrijving-NL are also both `flex flex-col` labels — same span-wrap treatment.

Prijs-per-m² label (line 918):
```tsx
              {t('kunstwerkenLabelPrijsPerM2')}
```
→
```tsx
              <span>
                {t('kunstwerkenLabelPrijsPerM2')}
                <RequiredMark />
              </span>
```

Omschrijving-NL label (line 940):
```tsx
            {t('kunstwerkenLabelOmschrijvingNl')}
```
→
```tsx
            <span>
              {t('kunstwerkenLabelOmschrijvingNl')}
              <RequiredMark />
            </span>
```

Legend placement — change (lines 981-984):
```tsx
          </label>

          {actionError && (
            <p data-testid="kunstwerk-modal-error" className="text-xs text-red-400">
```
to:
```tsx
          </label>

          <RequiredLegend testId="kunstwerk-modal-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

          {actionError && (
            <p data-testid="kunstwerk-modal-error" className="text-xs text-red-400">
```

(Verify against the current file that line 981 is indeed the `</label>` closing the last Omschrijving-taal field before `actionError` — the exact line number may have shifted slightly from the earlier field edits in this same task; search for `{actionError && (` inside `KunstwerkenSection.tsx` to find the precise spot if it doesn't match.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: PASS (full file — this is the largest test file touched, so also run the whole file, not just `-t`)

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/KunstwerkenSection.tsx tests/components/beheer/KunstwerkenSection.test.tsx
git commit -m "feat: mark required fields in KunstwerkenSection with RequiredMark"
```

---

### Task 6: Single-field lookup modals — Materiaalsoorten, Onderwerpen, Prijsgroepen, Segmenten, Stijlen

**Files:**
- Modify: `src/components/beheer/MateriaalsoortenSection.tsx:1-6` (import), `:171` (label), `:169-181` (legend placement)
- Modify: `src/components/beheer/OnderwerpenSection.tsx:1-6` (import), `:136` (label), `:134-146` (legend placement)
- Modify: `src/components/beheer/PrijsgroepenSection.tsx:1-6` (import), `:156` (label), `:154-176` (legend placement)
- Modify: `src/components/beheer/SegmentenSection.tsx:1-6` (import), `:137` (label), `:135-147` (legend placement)
- Modify: `src/components/beheer/StijlenSection.tsx:1-6` (import), `:131` (label), `:129-141` (legend placement)
- Test: `tests/components/beheer/MateriaalsoortenSection.test.tsx`, `OnderwerpenSection.test.tsx`, `PrijsgroepenSection.test.tsx`, `SegmentenSection.test.tsx`, `StijlenSection.test.tsx`

**Interfaces:**
- Consumes: `RequiredMark`, `RequiredLegend`, `t('verplichtVeldLegende')`. Identical pattern in all five files: one text field (`omschrijving` or `naam`) is the sole required field, and the field's own `<label>` wraps both the marker and, one line below the `<input>`, the legend.
- All five labels are `flex flex-col` — per Global Constraints, wrap the caption text and `<RequiredMark />` in a shared `<span>` (not a bare third sibling) or the asterisk renders on its own row instead of inline.

This task edits five near-identical files. Do the same five sub-steps for each one before moving to the next file's sub-steps — each file gets its own test run and commit so a reviewer can bisect if one breaks.

#### 6a. MateriaalsoortenSection

- [ ] **Step 1: Write the failing test** — add to `tests/components/beheer/MateriaalsoortenSection.test.tsx` inside the `describe` block:

```tsx
  it('shows the required-field legend', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('materiaalsoorten-add'));
    expect(screen.getByTestId('materiaalsoort-modal-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run tests/components/beheer/MateriaalsoortenSection.test.tsx -t "required-field legend"` — expect FAIL, testid not found.

- [ ] **Step 3: Implement** — add import after the existing `import { Modal } ...` line:

```tsx
import { Modal } from '@/components/Modal';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
```

Change the Omschrijving label (line 171):
```tsx
            {t('materiaalsoortenLabelOmschrijving')}
```
→
```tsx
            <span>
              {t('materiaalsoortenLabelOmschrijving')}
              <RequiredMark />
            </span>
```

Change (lines 179-182):
```tsx
          </label>

          <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/60">
```
to:
```tsx
          </label>

          <RequiredLegend testId="materiaalsoort-modal-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

          <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/60">
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run tests/components/beheer/MateriaalsoortenSection.test.tsx` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/MateriaalsoortenSection.tsx tests/components/beheer/MateriaalsoortenSection.test.tsx
git commit -m "feat: mark Omschrijving as required in MateriaalsoortenSection"
```

#### 6b. OnderwerpenSection

- [ ] **Step 1: Write the failing test** — add to `tests/components/beheer/OnderwerpenSection.test.tsx`:

```tsx
  it('shows the required-field legend', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('onderwerpen-add'));
    expect(screen.getByTestId('onderwerp-modal-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run tests/components/beheer/OnderwerpenSection.test.tsx -t "required-field legend"` — expect FAIL.

- [ ] **Step 3: Implement** — add import after `import { Modal } ...`:

```tsx
import { Modal } from '@/components/Modal';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
```

Change label (line 136):
```tsx
            {t('onderwerpenLabelOmschrijving')}
```
→
```tsx
            <span>
              {t('onderwerpenLabelOmschrijving')}
              <RequiredMark />
            </span>
```

Change (lines 144-147):
```tsx
          </label>

          {actionError && (
```
to:
```tsx
          </label>

          <RequiredLegend testId="onderwerp-modal-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

          {actionError && (
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run tests/components/beheer/OnderwerpenSection.test.tsx` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/OnderwerpenSection.tsx tests/components/beheer/OnderwerpenSection.test.tsx
git commit -m "feat: mark Omschrijving as required in OnderwerpenSection"
```

#### 6c. PrijsgroepenSection

- [ ] **Step 1: Write the failing test** — add to `tests/components/beheer/PrijsgroepenSection.test.tsx`:

```tsx
  it('shows the required-field legend', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('prijsgroepen-add'));
    expect(screen.getByTestId('prijsgroep-modal-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run tests/components/beheer/PrijsgroepenSection.test.tsx -t "required-field legend"` — expect FAIL.

- [ ] **Step 3: Implement** — add import after `import { Modal } ...`:

```tsx
import { Modal } from '@/components/Modal';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
```

Change the Naam label (line 156):
```tsx
            {t('prijsgroepenLabelNaam')}
```
→
```tsx
            <span>
              {t('prijsgroepenLabelNaam')}
              <RequiredMark />
            </span>
```

(`prijsgroepenLabelKortingspercentage`, line 166, stays unchanged — it is not part of the `disabled={!naam}` condition.)

Change (lines 174-177):
```tsx
          </label>

          {actionError && (
```
to:
```tsx
          </label>

          <RequiredLegend testId="prijsgroep-modal-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

          {actionError && (
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run tests/components/beheer/PrijsgroepenSection.test.tsx` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/PrijsgroepenSection.tsx tests/components/beheer/PrijsgroepenSection.test.tsx
git commit -m "feat: mark Naam as required in PrijsgroepenSection"
```

#### 6d. SegmentenSection

- [ ] **Step 1: Write the failing test** — add to `tests/components/beheer/SegmentenSection.test.tsx`:

```tsx
  it('shows the required-field legend', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('segmenten-add'));
    expect(screen.getByTestId('segment-modal-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run tests/components/beheer/SegmentenSection.test.tsx -t "required-field legend"` — expect FAIL.

- [ ] **Step 3: Implement** — add import after `import { Modal } ...`:

```tsx
import { Modal } from '@/components/Modal';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
```

Change label (line 137):
```tsx
            {t('segmentenLabelOmschrijving')}
```
→
```tsx
            <span>
              {t('segmentenLabelOmschrijving')}
              <RequiredMark />
            </span>
```

Change (lines 145-148):
```tsx
          </label>

          {actionError && (
```
to:
```tsx
          </label>

          <RequiredLegend testId="segment-modal-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

          {actionError && (
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run tests/components/beheer/SegmentenSection.test.tsx` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/SegmentenSection.tsx tests/components/beheer/SegmentenSection.test.tsx
git commit -m "feat: mark Omschrijving as required in SegmentenSection"
```

#### 6e. StijlenSection

- [ ] **Step 1: Write the failing test** — add to `tests/components/beheer/StijlenSection.test.tsx`:

```tsx
  it('shows the required-field legend', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('stijlen-add'));
    expect(screen.getByTestId('stijl-modal-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run tests/components/beheer/StijlenSection.test.tsx -t "required-field legend"` — expect FAIL.

- [ ] **Step 3: Implement** — add import after `import { Modal } ...`:

```tsx
import { Modal } from '@/components/Modal';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
```

Change label (line 131):
```tsx
            {t('stijlenLabelOmschrijving')}
```
→
```tsx
            <span>
              {t('stijlenLabelOmschrijving')}
              <RequiredMark />
            </span>
```

Change (lines 139-142):
```tsx
          </label>

          {actionError && (
```
to:
```tsx
          </label>

          <RequiredLegend testId="stijl-modal-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

          {actionError && (
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run tests/components/beheer/StijlenSection.test.tsx` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/StijlenSection.tsx tests/components/beheer/StijlenSection.test.tsx
git commit -m "feat: mark Omschrijving as required in StijlenSection"
```

---

### Task 7: `MaterialenSection.tsx` — Materiaalsoort, Dikte, Omschrijving

**Files:**
- Modify: `src/components/beheer/MaterialenSection.tsx:1-6` (import), `:175`, `:190`, `:200` (labels), `:198-210` (legend placement)
- Test: `tests/components/beheer/MaterialenSection.test.tsx`

**Interfaces:**
- Consumes: `RequiredMark`, `RequiredLegend`, `t('verplichtVeldLegende')`.

- [ ] **Step 1: Write the failing test**

```tsx
  it('shows the required-field legend', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('materialen-add'));
    expect(screen.getByTestId('materiaal-modal-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/beheer/MaterialenSection.test.tsx -t "required-field legend"`
Expected: FAIL

- [ ] **Step 3: Implement**

Add import after `import { Modal } ...`:

```tsx
import { Modal } from '@/components/Modal';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
```

All three labels below are `flex flex-col` — per Global Constraints, wrap the caption text and `<RequiredMark />` in a shared `<span>` instead of a bare sibling.

Materiaalsoort label (line 175):
```tsx
            {t('materialenLabelMateriaalsoort')}
```
→
```tsx
            <span>
              {t('materialenLabelMateriaalsoort')}
              <RequiredMark />
            </span>
```

Dikte label (line 190):
```tsx
            {t('materialenLabelDikte')}
```
→
```tsx
            <span>
              {t('materialenLabelDikte')}
              <RequiredMark />
            </span>
```

Omschrijving label (line 200):
```tsx
            {t('materialenLabelOmschrijving')}
```
→
```tsx
            <span>
              {t('materialenLabelOmschrijving')}
              <RequiredMark />
            </span>
```

Legend placement — change (lines 208-211):
```tsx
          </label>

          {actionError && (
```
to:
```tsx
          </label>

          <RequiredLegend testId="materiaal-modal-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

          {actionError && (
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/beheer/MaterialenSection.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/MaterialenSection.tsx tests/components/beheer/MaterialenSection.test.tsx
git commit -m "feat: mark required fields in MaterialenSection"
```

---

### Task 8: `MatenSection.tsx` — Breedte, Hoogte

**Files:**
- Modify: `src/components/beheer/MatenSection.tsx:1-6` (import), `:151`, `:161` (labels), `:169-173` (legend placement)
- Test: `tests/components/beheer/MatenSection.test.tsx`

**Interfaces:**
- Consumes: `RequiredMark`, `RequiredLegend`, `t('verplichtVeldLegende')`.

- [ ] **Step 1: Write the failing test**

```tsx
  it('shows the required-field legend', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('maten-add'));
    expect(screen.getByTestId('maat-modal-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/beheer/MatenSection.test.tsx -t "required-field legend"`
Expected: FAIL

- [ ] **Step 3: Implement**

Add import after `import { Modal } ...`:

```tsx
import { Modal } from '@/components/Modal';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
```

Both labels below are `flex flex-col` — wrap the caption text and `<RequiredMark />` in a shared `<span>` per Global Constraints.

Breedte label (line 151):
```tsx
            {t('matenLabelBreedte')}
```
→
```tsx
            <span>
              {t('matenLabelBreedte')}
              <RequiredMark />
            </span>
```

Hoogte label (line 161):
```tsx
            {t('matenLabelHoogte')}
```
→
```tsx
            <span>
              {t('matenLabelHoogte')}
              <RequiredMark />
            </span>
```

Legend placement — change (lines 169-172):
```tsx
          </label>

          {actionError && (
```
to:
```tsx
          </label>

          <RequiredLegend testId="maat-modal-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

          {actionError && (
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/beheer/MatenSection.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/MatenSection.tsx tests/components/beheer/MatenSection.test.tsx
git commit -m "feat: mark Breedte and Hoogte as required in MatenSection"
```

---

### Task 9: `VersturenNaarDrukkerDialog.tsx` — Drukker

**Files:**
- Modify: `src/components/beheer/VersturenNaarDrukkerDialog.tsx:1-8` (import), `:178` (label), `:191-193` (legend placement)
- Test: `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx`

**Interfaces:**
- Consumes: `RequiredMark`, `RequiredLegend`, `t('verplichtVeldLegende')`.

- [ ] **Step 1: Write the failing test**

Add inside the existing `describe` block, using the `renderDialog` helper (defaults to `isOpen: true` per the existing pattern):

```tsx
  it('shows the required-field legend', () => {
    renderDialog();
    expect(screen.getByTestId('drukker-versturen-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx -t "required-field legend"`
Expected: FAIL

- [ ] **Step 3: Implement**

Add import after `import { Modal } ...`:

```tsx
import { Modal } from '@/components/Modal';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
```

Change the label (line 178) — it's a `flex flex-col` label, so wrap the caption text and `<RequiredMark />` in a shared `<span>` per Global Constraints:
```tsx
          {t('drukkerVersturenLabelDrukker')}
```
→
```tsx
          <span>
            {t('drukkerVersturenLabelDrukker')}
            <RequiredMark />
          </span>
```

Add the legend right after the label closes (line 191), before the preview block. Change:
```tsx
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-white/60">{t('drukkerVersturenLabelPreview')}</span>
```
to:
```tsx
        </label>

        <RequiredLegend testId="drukker-versturen-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-white/60">{t('drukkerVersturenLabelPreview')}</span>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/VersturenNaarDrukkerDialog.tsx tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx
git commit -m "feat: mark Drukker as required in VersturenNaarDrukkerDialog"
```

---

### Task 10: `RegistrationForm.tsx` (Word-klant) — every `required` field

**Files:**
- Modify: `src/components/RegistrationForm.tsx:1-6` (import), `:88`, `:98`, `:103`, `:114`, `:119`, `:141`, `:151`, `:167`, `:172`, `:183` (labels), `:274-276` (legend placement)
- Modify: `messages/nl.json:174`, `messages/en.json:174`, `messages/de.json:174`, `messages/fr.json:174` (new `registrationPage.verplichtVeldLegende` key)
- Test: `tests/components/RegistrationForm.test.tsx`

**Interfaces:**
- Consumes: `RequiredMark`, `RequiredLegend` from Task 1.
- Consumes: `t('verplichtVeldLegende')` from the `registrationPage` namespace (new key, added in this task, all 4 locale files).
- Fields marked: `labelCompanyName`, `labelKvk`, `labelContactPerson`, `labelEmail`, `labelPhone`, `labelPassword`, `labelPasswordConfirm`, `labelAddress`, `labelPostcode`, `labelCity` — exactly the ones already carrying `required` on their `<input>`/`<PasswordInput>`. `labelContactPreference` and the conditional delivery/invoice fields are NOT marked (not `required`).

- [ ] **Step 1: Write the failing test**

Add to `tests/components/RegistrationForm.test.tsx` inside the `describe` block:

```tsx
  it('shows the required-field legend', () => {
    renderForm();
    expect(screen.getByTestId('word-klant-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/RegistrationForm.test.tsx -t "required-field legend"`
Expected: FAIL

- [ ] **Step 3: Add the translation key to all four locale files**

`messages/nl.json`, line 174, currently:
```json
    "submitError": "Er is iets misgegaan, probeer het opnieuw."
```
Change to:
```json
    "submitError": "Er is iets misgegaan, probeer het opnieuw.",
    "verplichtVeldLegende": "* verplicht veld"
```

`messages/en.json`, line 174, currently:
```json
    "submitError": "Something went wrong, please try again."
```
Change to:
```json
    "submitError": "Something went wrong, please try again.",
    "verplichtVeldLegende": "* required field"
```

`messages/de.json`, line 174, currently:
```json
    "submitError": "Etwas ist schiefgelaufen, bitte versuchen Sie es erneut."
```
Change to:
```json
    "submitError": "Etwas ist schiefgelaufen, bitte versuchen Sie es erneut.",
    "verplichtVeldLegende": "* Pflichtfeld"
```

`messages/fr.json`, line 174, currently:
```json
    "submitError": "Une erreur s'est produite, veuillez réessayer."
```
Change to:
```json
    "submitError": "Une erreur s'est produite, veuillez réessayer.",
    "verplichtVeldLegende": "* champ obligatoire"
```

- [ ] **Step 4: Implement in `RegistrationForm.tsx`**

Add import (after line 6, `import { PasswordInput } ...`):

```tsx
import { PasswordInput } from '@/components/PasswordInput';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
```

`labelClassName` is `'flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60'` — a flex-col container. Per Global Constraints, do NOT insert `<RequiredMark />` as a bare third sibling after the `{t(...)}` text node (it would render on its own row, between the caption and the field); instead wrap the caption text and the mark in a shared `<span>`, replacing the bare text node, for each of the following labels:

| Line | Field |
|---|---|
| 88 | `labelCompanyName` |
| 99 | `labelKvk` |
| 104 | `labelContactPerson` |
| 115 | `labelEmail` |
| 120 | `labelPhone` |
| 142 | `labelPassword` |
| 152 | `labelPasswordConfirm` |
| 168 | `labelAddress` |
| 173 | `labelPostcode` |
| 184 | `labelCity` |

Concretely, e.g. line 88 changes from:
```tsx
      <label className={labelClassName}>
        {t('labelCompanyName')}
        <input
```
to:
```tsx
      <label className={labelClassName}>
        <span>
          {t('labelCompanyName')}
          <RequiredMark />
        </span>
        <input
```
Apply the same shape (bare `{t(...)}` text node replaced by `<span>{t(...)}<RequiredMark /></span>`, immediately before the `<input>`/`<select>`/`<PasswordInput>` line) at each of the other nine locations listed above.

Add the legend right before the final `submitError` block. Change (lines 274-277):
```tsx
      )}

      {submitError && (
```
to:
```tsx
      )}

      <RequiredLegend testId="word-klant-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

      {submitError && (
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/components/RegistrationForm.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/RegistrationForm.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json tests/components/RegistrationForm.test.tsx
git commit -m "feat: mark required fields in RegistrationForm"
```

---

### Task 11: `ContactForm.tsx` — Naam, E-mailadres, Onderwerp, Bericht

**Files:**
- Modify: `src/components/ContactForm.tsx:1-4` (import), `:29`, `:50`, `:71`, `:89` (labels), `:97-99` (legend placement)
- Modify: `messages/nl.json:141`, `messages/en.json:141`, `messages/de.json:141`, `messages/fr.json:141` (new `contactPage.verplichtVeldLegende` key)
- Test: `tests/components/ContactForm.test.tsx`

**Interfaces:**
- Consumes: `RequiredMark`, `RequiredLegend`, `t('verplichtVeldLegende')` from `contactPage`.
- Fields marked: `formName`, `formEmail`, `formSubject`, `formMessage`. NOT marked: `formCompany`, `formPhone` (no `required`).

- [ ] **Step 1: Write the failing test**

```tsx
  it('shows the required-field legend', () => {
    renderForm();
    expect(screen.getByTestId('contact-form-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/ContactForm.test.tsx -t "required-field legend"`
Expected: FAIL

- [ ] **Step 3: Add the translation key to all four locale files**

`messages/nl.json`, line 141, currently:
```json
    "formSubmitted": "Verzonden!"
```
→
```json
    "formSubmitted": "Verzonden!",
    "verplichtVeldLegende": "* verplicht veld"
```

`messages/en.json`, line 141, currently:
```json
    "formSubmitted": "Sent!"
```
→
```json
    "formSubmitted": "Sent!",
    "verplichtVeldLegende": "* required field"
```

`messages/de.json`, line 141, currently:
```json
    "formSubmitted": "Gesendet!"
```
→
```json
    "formSubmitted": "Gesendet!",
    "verplichtVeldLegende": "* Pflichtfeld"
```

`messages/fr.json`, line 141, currently:
```json
    "formSubmitted": "Envoyé !"
```
→
```json
    "formSubmitted": "Envoyé !",
    "verplichtVeldLegende": "* champ obligatoire"
```

- [ ] **Step 4: Implement in `ContactForm.tsx`**

Add import (after line 4, `import { useTranslations } ...`):
```tsx
import { useTranslations } from 'next-intl';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
```

All four labels below are `flex flex-col` — per Global Constraints, wrap the caption text and `<RequiredMark />` in a shared `<span>` instead of a bare sibling.

Naam label (line 29):
```tsx
        {t('formName')}
```
→
```tsx
        <span>
          {t('formName')}
          <RequiredMark />
        </span>
```

E-mailadres label (line 50):
```tsx
        {t('formEmail')}
```
→
```tsx
        <span>
          {t('formEmail')}
          <RequiredMark />
        </span>
```

Onderwerp label (line 71):
```tsx
        {t('formSubject')}
```
→
```tsx
        <span>
          {t('formSubject')}
          <RequiredMark />
        </span>
```

Bericht label (line 89):
```tsx
        {t('formMessage')}
```
→
```tsx
        <span>
          {t('formMessage')}
          <RequiredMark />
        </span>
```

Legend placement — change (lines 97-99):
```tsx
      </label>

      <button
```
to:
```tsx
      </label>

      <RequiredLegend testId="contact-form-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

      <button
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/components/ContactForm.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/ContactForm.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json tests/components/ContactForm.test.tsx
git commit -m "feat: mark required fields in ContactForm"
```

---

### Task 12: `CustomerLoginForm.tsx` — E-mailadres, Wachtwoord

**Files:**
- Modify: `src/components/CustomerLoginForm.tsx:1-6` (import), `:49`, `:61` (labels), `:69-71` (legend placement)
- Modify: `messages/nl.json:184`, `messages/en.json:184`, `messages/de.json:184`, `messages/fr.json:184` (new `loginPage.verplichtVeldLegende` key)
- Test: `tests/components/CustomerLoginForm.test.tsx`

**Interfaces:**
- Consumes: `RequiredMark`, `RequiredLegend`, `t('verplichtVeldLegende')` from `loginPage`.

- [ ] **Step 1: Write the failing test**

```tsx
  it('shows the required-field legend', () => {
    renderForm();
    expect(screen.getByTestId('login-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/CustomerLoginForm.test.tsx -t "required-field legend"`
Expected: FAIL

- [ ] **Step 3: Add the translation key to all four locale files**

`messages/nl.json`, line 184, currently:
```json
    "accountIncompleteMessage": "Er ging iets mis bij uw eerdere aanvraag. Neem contact met ons op."
```
→
```json
    "accountIncompleteMessage": "Er ging iets mis bij uw eerdere aanvraag. Neem contact met ons op.",
    "verplichtVeldLegende": "* verplicht veld"
```

`messages/en.json`, line 184, currently:
```json
    "accountIncompleteMessage": "Something went wrong with your previous application. Please contact us."
```
→
```json
    "accountIncompleteMessage": "Something went wrong with your previous application. Please contact us.",
    "verplichtVeldLegende": "* required field"
```

`messages/de.json`, line 184, currently:
```json
    "accountIncompleteMessage": "Bei Ihrer vorherigen Anfrage ist etwas schiefgelaufen. Bitte kontaktieren Sie uns."
```
→
```json
    "accountIncompleteMessage": "Bei Ihrer vorherigen Anfrage ist etwas schiefgelaufen. Bitte kontaktieren Sie uns.",
    "verplichtVeldLegende": "* Pflichtfeld"
```

`messages/fr.json`, line 184, currently:
```json
    "accountIncompleteMessage": "Un problème est survenu avec votre demande précédente. Veuillez nous contacter."
```
→
```json
    "accountIncompleteMessage": "Un problème est survenu avec votre demande précédente. Veuillez nous contacter.",
    "verplichtVeldLegende": "* champ obligatoire"
```

- [ ] **Step 4: Implement in `CustomerLoginForm.tsx`**

Add import (after line 6, `import { PasswordInput } ...`):
```tsx
import { PasswordInput } from '@/components/PasswordInput';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
```

Both labels below are `flex flex-col` — wrap the caption text and `<RequiredMark />` in a shared `<span>` per Global Constraints.

E-mailadres label (line 49):
```tsx
        {t('labelEmail')}
```
→
```tsx
        <span>
          {t('labelEmail')}
          <RequiredMark />
        </span>
```

Wachtwoord label (line 61):
```tsx
        {t('labelPassword')}
```
→
```tsx
        <span>
          {t('labelPassword')}
          <RequiredMark />
        </span>
```

Legend placement — change (lines 69-71):
```tsx
      </label>

      {error && (
```
to:
```tsx
      </label>

      <RequiredLegend testId="login-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

      {error && (
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/components/CustomerLoginForm.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/CustomerLoginForm.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json tests/components/CustomerLoginForm.test.tsx
git commit -m "feat: mark required fields in CustomerLoginForm"
```

---

### Task 13: `ResetPasswordForm.tsx` — Nieuw wachtwoord, Bevestig wachtwoord

**Files:**
- Modify: `src/components/ResetPasswordForm.tsx:1-7` (import), `:70`, `:80` (labels), `:88-90` (legend placement)
- Modify: `messages/nl.json:197`, `messages/en.json:197`, `messages/de.json:197`, `messages/fr.json:197` (new `resetPasswordPage.verplichtVeldLegende` key)
- Test: `tests/components/ResetPasswordForm.test.tsx`

**Interfaces:**
- Consumes: `RequiredMark`, `RequiredLegend`, `t('verplichtVeldLegende')` from `resetPasswordPage`.

- [ ] **Step 1: Write the failing test**

```tsx
  it('shows the required-field legend', () => {
    renderForm();
    expect(screen.getByTestId('reset-password-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
```

(Place this inside the `describe` block, using the existing `renderForm()` helper — confirm it renders with a non-empty `token` search param, matching the other passing tests in this file, so the form itself renders instead of the missing-token state.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/ResetPasswordForm.test.tsx -t "required-field legend"`
Expected: FAIL

- [ ] **Step 3: Add the translation key to all four locale files**

`messages/nl.json`, line 197, currently:
```json
    "loginLink": "Naar inloggen"
```
→
```json
    "loginLink": "Naar inloggen",
    "verplichtVeldLegende": "* verplicht veld"
```

`messages/en.json`, line 197, currently:
```json
    "loginLink": "Go to login"
```
→
```json
    "loginLink": "Go to login",
    "verplichtVeldLegende": "* required field"
```

`messages/de.json`, line 197, currently:
```json
    "loginLink": "Zur Anmeldung"
```
→
```json
    "loginLink": "Zur Anmeldung",
    "verplichtVeldLegende": "* Pflichtfeld"
```

`messages/fr.json`, line 197, currently:
```json
    "loginLink": "Aller à la connexion"
```
→
```json
    "loginLink": "Aller à la connexion",
    "verplichtVeldLegende": "* champ obligatoire"
```

- [ ] **Step 4: Implement in `ResetPasswordForm.tsx`**

Add import (after line 7, `import { PasswordInput } ...`):
```tsx
import { PasswordInput } from '@/components/PasswordInput';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
```

Both labels below are `flex flex-col` — wrap the caption text and `<RequiredMark />` in a shared `<span>` per Global Constraints.

Nieuw-wachtwoord label (line 70):
```tsx
        {t('labelNewPassword')}
```
→
```tsx
        <span>
          {t('labelNewPassword')}
          <RequiredMark />
        </span>
```

Bevestig-wachtwoord label (line 80):
```tsx
        {t('labelConfirmPassword')}
```
→
```tsx
        <span>
          {t('labelConfirmPassword')}
          <RequiredMark />
        </span>
```

Legend placement — change (lines 88-90):
```tsx
      </label>

      {error && (
```
to:
```tsx
      </label>

      <RequiredLegend testId="reset-password-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

      {error && (
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/components/ResetPasswordForm.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/ResetPasswordForm.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json tests/components/ResetPasswordForm.test.tsx
git commit -m "feat: mark required fields in ResetPasswordForm"
```

---

### Task 14: `SettingsSection.tsx` — add native `required` + mark 7 profile fields

**Files:**
- Modify: `src/components/account/SettingsSection.tsx:1-10` (import), `:157`, `:167`, `:177`, `:187`, `:197`, `:207`, `:217` (labels + new `required` attribute on their inputs)
- Modify: `messages/nl.json:273`, `messages/de.json:273`, `messages/fr.json:273`, `messages/en.json:303` (new `accountPage.settings.verplichtVeldLegende` key — note `en.json` has a different line number because its `accountPage` has extra `invoices`/`returns` sections `nl`/`de`/`fr` don't)
- Test: `tests/components/account/SettingsSection.test.tsx`

**Interfaces:**
- Consumes: `RequiredMark`, `RequiredLegend`, `t('verplichtVeldLegende')` from `accountPage.settings`.
- This is the only task in the plan that changes *behavior*: adds native `required` to `companyName`, `contactPerson`, `email`, `phone`, `address`, `postcode`, `city`. Password fields, contact preference, language preference, and the separate "delete account" password field are untouched — no `required`, no marker.

- [ ] **Step 1: Write the failing test**

Add inside the existing `describe('SettingsSection', ...)` block:

```tsx
  it('marks the seven profile fields as required', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByTestId('settings-company-name')).toHaveValue('Hotel De Zilveren Zwaan'));
    expect(screen.getByTestId('settings-company-name')).toBeRequired();
    expect(screen.getByTestId('settings-contact-person')).toBeRequired();
    expect(screen.getByTestId('settings-email')).toBeRequired();
    expect(screen.getByTestId('settings-phone')).toBeRequired();
    expect(screen.getByTestId('settings-address')).toBeRequired();
    expect(screen.getByTestId('settings-postcode')).toBeRequired();
    expect(screen.getByTestId('settings-city')).toBeRequired();
    expect(screen.getByTestId('settings-password')).not.toBeRequired();
    expect(screen.getByTestId('settings-password-confirm')).not.toBeRequired();
  });

  it('shows the required-field legend', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByTestId('settings-company-name')).toHaveValue('Hotel De Zilveren Zwaan'));
    expect(screen.getByTestId('settings-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/account/SettingsSection.test.tsx -t "marks the seven profile fields"`
Expected: FAIL — `toBeRequired()` assertions fail (no `required` attribute exists yet)

- [ ] **Step 3: Add the translation key**

`messages/nl.json`, line 273, currently:
```json
      "deleteAccountPartialError": "Uw gegevens zijn verwijderd, maar er ging iets mis bij het volledig verwijderen van uw account. Neem contact met ons op."
```
→
```json
      "deleteAccountPartialError": "Uw gegevens zijn verwijderd, maar er ging iets mis bij het volledig verwijderen van uw account. Neem contact met ons op.",
      "verplichtVeldLegende": "* verplicht veld"
```

`messages/de.json`, line 273, currently:
```json
      "deleteAccountPartialError": "Ihre Daten wurden gelöscht, aber beim vollständigen Löschen Ihres Kontos ist etwas schiefgelaufen. Bitte kontaktieren Sie uns."
```
→
```json
      "deleteAccountPartialError": "Ihre Daten wurden gelöscht, aber beim vollständigen Löschen Ihres Kontos ist etwas schiefgelaufen. Bitte kontaktieren Sie uns.",
      "verplichtVeldLegende": "* Pflichtfeld"
```

`messages/fr.json`, line 273, currently:
```json
      "deleteAccountPartialError": "Vos données ont été supprimées, mais un problème est survenu lors de la suppression complète de votre compte. Veuillez nous contacter."
```
→
```json
      "deleteAccountPartialError": "Vos données ont été supprimées, mais un problème est survenu lors de la suppression complète de votre compte. Veuillez nous contacter.",
      "verplichtVeldLegende": "* champ obligatoire"
```

`messages/en.json`, line 303 (different line number — see Interfaces note above), currently:
```json
      "deleteAccountPartialError": "Your data has been deleted, but something went wrong completing account deletion. Please contact us."
```
→
```json
      "deleteAccountPartialError": "Your data has been deleted, but something went wrong completing account deletion. Please contact us.",
      "verplichtVeldLegende": "* required field"
```

- [ ] **Step 4: Implement in `SettingsSection.tsx`**

Add import (after line 9, `import { PasswordInput } ...`):
```tsx
import { PasswordInput } from '@/components/PasswordInput';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
```

`labelClassName` is `'flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60'` — a flex-col container. Per Global Constraints, do NOT add `<RequiredMark />` as a bare third sibling after the `{t(...)}` text node (it would render on its own row); instead wrap the caption text and the mark in a shared `<span>`, replacing the bare text node. Also add `required` on the `<input>`. Company name (lines 156-164) changes from:
```tsx
      <label className={labelClassName}>
        {t('labelCompanyName')}
        <input
          type="text"
          value={profile.companyName}
          onChange={(e) => setField('companyName', e.target.value)}
          data-testid="settings-company-name"
          className={fieldClassName}
        />
      </label>
```
to:
```tsx
      <label className={labelClassName}>
        <span>
          {t('labelCompanyName')}
          <RequiredMark />
        </span>
        <input
          type="text"
          required
          value={profile.companyName}
          onChange={(e) => setField('companyName', e.target.value)}
          data-testid="settings-company-name"
          className={fieldClassName}
        />
      </label>
```

Apply the identical shape (bare `{t(...)}` text node replaced by `<span>{t(...)}<RequiredMark /></span>`, and `required` added to the `<input>` right after its `type="..."` line) to the remaining six fields:

- Contact person (lines 166-175, `data-testid="settings-contact-person"`)
- Email (lines 176-185, `data-testid="settings-email"`, `type="email"`)
- Phone (lines 186-195, `data-testid="settings-phone"`, `type="tel"`)
- Address (lines 196-205, `data-testid="settings-address"`)
- Postcode (lines 206-215, `data-testid="settings-postcode"`)
- City (lines 216-225, `data-testid="settings-city"`)

Do **not** touch: `labelContactPreference`/`select` (227-239), `labelLanguagePreference`/`select` (241-255), `labelPassword`/`labelPasswordConfirm` (257-274), or the "delete account" section's `deleteAccountLabelPassword` field (307-315).

Add the legend after the last marked field (City, closing `</label>` around line 225) and before the contact-preference `<label>`. Change:
```tsx
      </label>

      <label className={labelClassName}>
        {t('labelContactPreference')}
```
to:
```tsx
      </label>

      <RequiredLegend testId="settings-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

      <label className={labelClassName}>
        {t('labelContactPreference')}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/components/account/SettingsSection.test.tsx`
Expected: PASS (all tests, including the two new ones — re-check the pre-existing `'pre-fills fields...'` and password-mismatch tests still pass unchanged, since `required` on an uncontrolled-fill React input doesn't block `fireEvent.change`/`fireEvent.click` in jsdom)

- [ ] **Step 6: Commit**

```bash
git add src/components/account/SettingsSection.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json tests/components/account/SettingsSection.test.tsx
git commit -m "feat: require and mark the seven profile fields in SettingsSection"
```

---

## Final check

- [ ] Run the full suite once after all 14 tasks: `npm test`
- [ ] Expected: all tests PASS, no unrelated regressions.
