# Beheer Modal Herontwerp Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 30-07-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every beheer/account modal a consistent header, keep the modal's header and footer buttons permanently visible (never scroll them out of view), and make each modal's content fit on one screen wherever the field count allows it.

**Architecture:** Restructure the shared `Modal` shell into three fixed flex layers (header / scrollable body / footer) instead of one scrolling block. Add a small reusable `ModalTabs` component so the two oversized forms (Kunstwerk) can be split into topic tabs without any single tab needing to scroll. For content that is genuinely unbounded in length (order lines, drukker-zendingen), cap just that list in its own `max-h` + `overflow-y-auto` block, matching the pattern `VersturenNaarDrukkerDialog.tsx` already uses for its mail preview.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, `next-intl`, Vitest + React Testing Library.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-30-beheer-modal-redesign-design.md` — every task below implements one lettered section of that spec.
- The `beheer` i18n namespace exists **only** in `messages/nl.json` (the admin backend is Dutch-only — `en.json`/`de.json`/`fr.json` have no `beheer` key at all). New i18n keys for beheer-only modals (catalog modals, Kunstwerk) go in `messages/nl.json` only.
- `accountPage` exists in all four locale files (`nl`, `en`, `de`, `fr`) — the one new key for `AccountOrderModal` (customer-facing) must be added to all four.
- **`KunstenaarsSection.tsx` (kunstenaar-modal) is explicitly OUT OF SCOPE for this plan.** Its `Kunstenaar` shape is mid-refactor on a separate, not-yet-merged branch (`worktree-kunstenaar-exclusiviteit-herontwerp`) that replaces `verkooprecht`/`klantId`/`exclusiefVoorKlantId` with an `exclusieveKlantIds` array + checkbox list. Building tabs against the current shape would be rework once that branch merges. A follow-up plan will cover it after the merge.
- `KlantModal.tsx` and `VersturenNaarDrukkerDialog.tsx` need **no code changes** in this plan — both already pass `title` to `Modal`, neither has an unbounded list that needs its own scroll box, and their existing test suites are the regression check (run in Task 8).
- `ProductModal.tsx` is out of scope — it does not wrap `Modal.tsx`.
- Run `npm test` (not a subset) at least once at the end (Task 8) since `Modal.tsx`'s `title` prop becomes required and every consumer must still compile/pass.

---

### Task 1: `Modal.tsx` — fixed header/footer shell, scrollable body only

**Files:**
- Modify: `src/components/Modal.tsx`
- Test: `tests/components/Modal.test.tsx`

**Interfaces:**
- Produces: `Modal` component, props `{ isOpen: boolean; onClose: () => void; closeLabel: string; title: ReactNode; children: ReactNode; wide?: boolean; subtitle?: ReactNode; footerActions?: ReactNode }` — `title` is now **required** (was optional). Renders `data-testid="modal-header"` (always present, never scrolls), `data-testid="modal-body"` (wraps `children`, `overflow-y-auto`), `data-testid="modal-footer"` (always present, never scrolls). All other existing testids (`modal`, `modal-backdrop`, `modal-close`, `modal-footer-close`) are unchanged.
- Consumed by: every file listed in the spec's Scope section. Tasks 3–7 update call sites that don't yet pass `title`.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `tests/components/Modal.test.tsx` with:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { Modal } from '@/components/Modal';
import messages from '../../messages/nl.json';

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe('Modal', () => {
  it('renders nothing when isOpen is false', () => {
    renderWithIntl(
      <Modal isOpen={false} onClose={vi.fn()} closeLabel="Sluiten" title="Testmodal">
        <p>Inhoud</p>
      </Modal>
    );
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('renders its children when isOpen is true', () => {
    renderWithIntl(
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten" title="Testmodal">
        <p data-testid="modal-content">Inhoud</p>
      </Modal>
    );
    expect(screen.getByTestId('modal')).toBeInTheDocument();
    expect(screen.getByTestId('modal-content')).toHaveTextContent('Inhoud');
  });

  it('renders the given title in the header', () => {
    renderWithIntl(
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten" title="Testmodal">
        <p>Inhoud</p>
      </Modal>
    );
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Testmodal');
  });

  it('renders the subtitle in the header when provided', () => {
    renderWithIntl(
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten" title="Testmodal" subtitle="Extra context">
        <p>Inhoud</p>
      </Modal>
    );
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Extra context');
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    renderWithIntl(
      <Modal isOpen onClose={onClose} closeLabel="Sluiten" title="Testmodal">
        <p>Inhoud</p>
      </Modal>
    );
    fireEvent.click(screen.getByTestId('modal-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    renderWithIntl(
      <Modal isOpen onClose={onClose} closeLabel="Sluiten" title="Testmodal">
        <p>Inhoud</p>
      </Modal>
    );
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    renderWithIntl(
      <Modal isOpen onClose={onClose} closeLabel="Sluiten" title="Testmodal">
        <p>Inhoud</p>
      </Modal>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it("uses closeLabel as the close button's aria-label", () => {
    renderWithIntl(
      <Modal isOpen onClose={vi.fn()} closeLabel="Close it" title="Testmodal">
        <p>Inhoud</p>
      </Modal>
    );
    expect(screen.getByTestId('modal-close')).toHaveAttribute('aria-label', 'Close it');
  });

  it('calls onClose when the footer close button is clicked', () => {
    const onClose = vi.fn();
    renderWithIntl(
      <Modal isOpen onClose={onClose} closeLabel="Sluiten" title="Testmodal">
        <p>Inhoud</p>
      </Modal>
    );
    fireEvent.click(screen.getByTestId('modal-footer-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the close tooltip on the footer close button', () => {
    renderWithIntl(
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten" title="Testmodal">
        <p>Inhoud</p>
      </Modal>
    );
    expect(screen.getByTestId('modal-footer-close')).toHaveAttribute(
      'title',
      'Sluit dit scherm, eventuele wijzigingen worden niet opgeslagen!'
    );
  });

  it('uses a wider max width when wide is set', () => {
    renderWithIntl(
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten" title="Testmodal" wide>
        <p>Inhoud</p>
      </Modal>
    );
    const panel = screen.getByTestId('modal-backdrop').nextElementSibling as HTMLElement;
    expect(panel.className).toMatch(/max-w-\[1400px\]/);
  });

  it('uses the default (narrower) max width when wide is not set', () => {
    renderWithIntl(
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten" title="Testmodal">
        <p>Inhoud</p>
      </Modal>
    );
    const panel = screen.getByTestId('modal-backdrop').nextElementSibling as HTMLElement;
    expect(panel.className).toMatch(/max-w-lg/);
  });

  it('keeps the header outside the scrollable body', () => {
    renderWithIntl(
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten" title="Testmodal">
        <p>Inhoud</p>
      </Modal>
    );
    expect(screen.getByTestId('modal-header').className).not.toMatch(/overflow-y-auto/);
    expect(screen.getByTestId('modal-body').className).toMatch(/overflow-y-auto/);
  });

  it('keeps the footer outside the scrollable body', () => {
    renderWithIntl(
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten" title="Testmodal">
        <p>Inhoud</p>
      </Modal>
    );
    expect(screen.getByTestId('modal-footer')).toBeInTheDocument();
    expect(screen.getByTestId('modal-footer').className).not.toMatch(/overflow-y-auto/);
  });

  it('places the header before the body and the footer after it in the DOM', () => {
    renderWithIntl(
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten" title="Testmodal">
        <p>Inhoud</p>
      </Modal>
    );
    const header = screen.getByTestId('modal-header');
    const body = screen.getByTestId('modal-body');
    const footer = screen.getByTestId('modal-footer');
    expect(header.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(body.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/Modal.test.tsx`
Expected: FAIL — `keeps the header outside the scrollable body`, `keeps the footer outside the scrollable body`, and `places the header before the body and the footer after it in the DOM` fail because `data-testid="modal-body"` and `data-testid="modal-footer"` don't exist yet on the current `Modal.tsx`.

- [ ] **Step 3: Implement the fixed-shell `Modal.tsx`**

Replace the full contents of `src/components/Modal.tsx` with:

```tsx
'use client';

import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { useOverlayDismiss } from '@/lib/useOverlayDismiss';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  closeLabel: string;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
  subtitle?: ReactNode;
  footerActions?: ReactNode;
}

export function Modal({
  isOpen,
  onClose,
  closeLabel,
  title,
  children,
  wide = false,
  subtitle,
  footerActions,
}: ModalProps) {
  const t = useTranslations('modal');
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useOverlayDismiss({
    isOpen,
    onClose,
    containerRef: modalRef,
    initialFocusRef: closeButtonRef,
  });

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div
      ref={modalRef}
      data-testid="modal"
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        data-testid="modal-backdrop"
        onClick={onClose}
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
      />
      <div
        className={`relative z-10 flex max-h-[90vh] w-full flex-col rounded-lg border border-white/10 bg-charcoal ${
          wide ? 'max-w-[1400px]' : 'max-w-lg'
        }`}
      >
        <button
          ref={closeButtonRef}
          type="button"
          data-testid="modal-close"
          aria-label={closeLabel}
          onClick={onClose}
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white/80 hover:text-white"
        >
          ×
        </button>
        <div data-testid="modal-header" className="shrink-0 border-b border-white/10 px-6 pb-3 pt-6 pr-10">
          <h2 className="text-base font-semibold tracking-wide text-white">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-white/50">{subtitle}</p>}
        </div>
        <div data-testid="modal-body" className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {children}
        </div>
        <div
          data-testid="modal-footer"
          className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/10 px-6 pb-6 pt-4"
        >
          <div className="flex flex-wrap gap-2">{footerActions}</div>
          <button
            type="button"
            data-testid="modal-footer-close"
            onClick={onClose}
            title={t('closeTooltip')}
            className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/components/Modal.test.tsx`
Expected: PASS (16 tests). This test file is self-contained and passes even though the rest of the codebase does not compile with the now-required `title` prop yet — Tasks 3, 4 and 7 fix every other call site.

- [ ] **Step 5: Commit**

```bash
git add src/components/Modal.tsx tests/components/Modal.test.tsx
git commit -m "feat: fix Modal header/footer in place, scroll only the body"
```

---

### Task 2: `ModalTabs` — reusable tab strip for oversized modals

**Files:**
- Create: `src/components/ModalTabs.tsx`
- Test: `tests/components/ModalTabs.test.tsx`

**Interfaces:**
- Produces: `ModalTab = { id: string; label: string; hasError?: boolean }`; `ModalTabs` component, props `{ tabs: ModalTab[]; activeTabId: string; onTabChange: (id: string) => void; testIdPrefix: string }`. Renders `data-testid="${testIdPrefix}-tab-${tab.id}"` per tab button, `data-testid="${testIdPrefix}-tab-${tab.id}-error-dot"` only when `tab.hasError` is true.
- Consumed by: Task 7 (`KunstwerkenSection.tsx`).

- [ ] **Step 1: Write the failing test**

Create `tests/components/ModalTabs.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModalTabs } from '@/components/ModalTabs';

const TABS = [
  { id: 'algemeen', label: 'Algemeen' },
  { id: 'omschrijvingen', label: 'Omschrijvingen', hasError: true },
];

describe('ModalTabs', () => {
  it('renders a tab button for each tab with its label', () => {
    render(<ModalTabs tabs={TABS} activeTabId="algemeen" onTabChange={vi.fn()} testIdPrefix="test" />);
    expect(screen.getByTestId('test-tab-algemeen')).toHaveTextContent('Algemeen');
    expect(screen.getByTestId('test-tab-omschrijvingen')).toHaveTextContent('Omschrijvingen');
  });

  it('marks the active tab with aria-selected=true and others false', () => {
    render(<ModalTabs tabs={TABS} activeTabId="algemeen" onTabChange={vi.fn()} testIdPrefix="test" />);
    expect(screen.getByTestId('test-tab-algemeen')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('test-tab-omschrijvingen')).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onTabChange with the clicked tab id', () => {
    const onTabChange = vi.fn();
    render(<ModalTabs tabs={TABS} activeTabId="algemeen" onTabChange={onTabChange} testIdPrefix="test" />);
    fireEvent.click(screen.getByTestId('test-tab-omschrijvingen'));
    expect(onTabChange).toHaveBeenCalledWith('omschrijvingen');
  });

  it('shows an error dot only for tabs with hasError set', () => {
    render(<ModalTabs tabs={TABS} activeTabId="algemeen" onTabChange={vi.fn()} testIdPrefix="test" />);
    expect(screen.queryByTestId('test-tab-algemeen-error-dot')).not.toBeInTheDocument();
    expect(screen.getByTestId('test-tab-omschrijvingen-error-dot')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/ModalTabs.test.tsx`
Expected: FAIL with a module-not-found error — `@/components/ModalTabs` doesn't exist yet.

- [ ] **Step 3: Implement `ModalTabs.tsx`**

Create `src/components/ModalTabs.tsx`:

```tsx
'use client';

export interface ModalTab {
  id: string;
  label: string;
  hasError?: boolean;
}

interface ModalTabsProps {
  tabs: ModalTab[];
  activeTabId: string;
  onTabChange: (id: string) => void;
  testIdPrefix: string;
}

export function ModalTabs({ tabs, activeTabId, onTabChange, testIdPrefix }: ModalTabsProps) {
  return (
    <div role="tablist" className="flex shrink-0 gap-1 border-b border-white/10">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.id)}
            data-testid={`${testIdPrefix}-tab-${tab.id}`}
            className={`relative px-3 py-2 text-xs uppercase tracking-wide transition-colors ${
              isActive
                ? 'border-b-2 border-silver text-white'
                : 'border-b-2 border-transparent text-white/50 hover:text-white/80'
            }`}
          >
            {tab.label}
            {tab.hasError && (
              <span
                data-testid={`${testIdPrefix}-tab-${tab.id}-error-dot`}
                className="absolute right-1 top-1.5 h-1.5 w-1.5 rounded-full bg-red-400"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/components/ModalTabs.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ModalTabs.tsx tests/components/ModalTabs.test.tsx
git commit -m "feat: add reusable ModalTabs component"
```

---

### Task 3: Titles for the 7 catalog modals

**Files:**
- Modify: `src/components/beheer/SegmentenSection.tsx:108`, `src/components/beheer/StijlenSection.tsx:102`, `src/components/beheer/OnderwerpenSection.tsx:107`, `src/components/beheer/MaterialenSection.tsx:146`, `src/components/beheer/MateriaalsoortenSection.tsx:142`, `src/components/beheer/MatenSection.tsx:122`, `src/components/beheer/PrijsgroepenSection.tsx:127` (line numbers point at each file's `isOpen={modalState !== null}` line, immediately followed by `onClose={closeModal}` then `closeLabel={t('modalClose')}` in every file)
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/SegmentenSection.test.tsx`, `tests/components/beheer/StijlenSection.test.tsx`, `tests/components/beheer/OnderwerpenSection.test.tsx`, `tests/components/beheer/MaterialenSection.test.tsx`, `tests/components/beheer/MateriaalsoortenSection.test.tsx`, `tests/components/beheer/MatenSection.test.tsx`, `tests/components/beheer/PrijsgroepenSection.test.tsx`

**Interfaces:**
- Consumes: `Modal` from Task 1 (`title` now required).
- Produces: nothing consumed by later tasks — each of these 7 modals is a leaf.

All 7 files follow the exact same pattern: a `ModalState = { mode: 'add' } | { mode: 'edit'; <resource>: <Type> } | null` and a `<Modal isOpen={modalState !== null} onClose={closeModal} closeLabel={t('modalClose')} footerActions={...}>`. Apply the same two edits (i18n keys, then `title` prop) to each of the 7.

- [ ] **Step 1: Write the failing tests**

In `messages/nl.json`, add these 14 keys (7 pairs) into the `beheer` object, each pair next to its resource's existing keys:

After the line `"segmentenActionError": "Er is iets misgegaan. Probeer het opnieuw.",`:
```json
    "segmentenModalTitelToevoegen": "Segment toevoegen",
    "segmentenModalTitelBewerken": "Segment bewerken",
```

After the line `"stijlenActionError": "Er is iets misgegaan. Probeer het opnieuw.",`:
```json
    "stijlenModalTitelToevoegen": "Stijl toevoegen",
    "stijlenModalTitelBewerken": "Stijl bewerken",
```

After the line `"onderwerpenActionError": "Er is iets misgegaan. Probeer het opnieuw.",`:
```json
    "onderwerpenModalTitelToevoegen": "Onderwerp toevoegen",
    "onderwerpenModalTitelBewerken": "Onderwerp bewerken",
```

After the line `"materialenActionError": "Er is iets misgegaan. Probeer het opnieuw.",`:
```json
    "materialenModalTitelToevoegen": "Materiaal toevoegen",
    "materialenModalTitelBewerken": "Materiaal bewerken",
```

After the line `"materiaalsoortenActionError": "Er is iets misgegaan. Probeer het opnieuw.",`:
```json
    "materiaalsoortenModalTitelToevoegen": "Materiaalsoort toevoegen",
    "materiaalsoortenModalTitelBewerken": "Materiaalsoort bewerken",
```

After the line `"matenActionError": "Er is iets misgegaan. Probeer het opnieuw.",`:
```json
    "matenModalTitelToevoegen": "Maat toevoegen",
    "matenModalTitelBewerken": "Maat bewerken",
```

After the line `"prijsgroepenActionError": "Er is iets misgegaan. Probeer het opnieuw.",`:
```json
    "prijsgroepenModalTitelToevoegen": "Prijsgroep toevoegen",
    "prijsgroepenModalTitelBewerken": "Prijsgroep bewerken",
```

Add one new test to the end of the `describe` block in each of the 7 test files (`beforeEach`/`afterEach` in these files already reset mocks between tests, so appending is safe):

`tests/components/beheer/SegmentenSection.test.tsx`:
```tsx
  it('shows the toevoegen title when adding and the bewerken title when editing', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('segmenten-add'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Segment toevoegen');
    fireEvent.click(screen.getByTestId('modal-close'));
    fireEvent.click(screen.getByTestId('data-table-row-seg-2'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Segment bewerken');
  });
```

`tests/components/beheer/StijlenSection.test.tsx`:
```tsx
  it('shows the toevoegen title when adding and the bewerken title when editing', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('stijlen-add'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Stijl toevoegen');
    fireEvent.click(screen.getByTestId('modal-close'));
    fireEvent.click(screen.getByTestId('data-table-row-stijl-2'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Stijl bewerken');
  });
```

`tests/components/beheer/OnderwerpenSection.test.tsx`:
```tsx
  it('shows the toevoegen title when adding and the bewerken title when editing', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('onderwerpen-add'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Onderwerp toevoegen');
    fireEvent.click(screen.getByTestId('modal-close'));
    fireEvent.click(screen.getByTestId('data-table-row-onderwerp-2'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Onderwerp bewerken');
  });
```

`tests/components/beheer/MaterialenSection.test.tsx`:
```tsx
  it('shows the toevoegen title when adding and the bewerken title when editing', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('materialen-add'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Materiaal toevoegen');
    fireEvent.click(screen.getByTestId('modal-close'));
    fireEvent.click(screen.getByTestId('data-table-row-mat-2'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Materiaal bewerken');
  });
```

`tests/components/beheer/MateriaalsoortenSection.test.tsx`:
```tsx
  it('shows the toevoegen title when adding and the bewerken title when editing', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('materiaalsoorten-add'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Materiaalsoort toevoegen');
    fireEvent.click(screen.getByTestId('modal-close'));
    fireEvent.click(screen.getByTestId('data-table-row-soort-2'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Materiaalsoort bewerken');
  });
```

`tests/components/beheer/MatenSection.test.tsx`:
```tsx
  it('shows the toevoegen title when adding and the bewerken title when editing', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('maten-add'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Maat toevoegen');
    fireEvent.click(screen.getByTestId('modal-close'));
    fireEvent.click(screen.getByTestId('data-table-row-maat-2'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Maat bewerken');
  });
```

`tests/components/beheer/PrijsgroepenSection.test.tsx`:
```tsx
  it('shows the toevoegen title when adding and the bewerken title when editing', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('prijsgroepen-add'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Prijsgroep toevoegen');
    fireEvent.click(screen.getByTestId('modal-close'));
    fireEvent.click(screen.getByTestId('data-table-row-pg-2'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Prijsgroep bewerken');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/SegmentenSection.test.tsx tests/components/beheer/StijlenSection.test.tsx tests/components/beheer/OnderwerpenSection.test.tsx tests/components/beheer/MaterialenSection.test.tsx tests/components/beheer/MateriaalsoortenSection.test.tsx tests/components/beheer/MatenSection.test.tsx tests/components/beheer/PrijsgroepenSection.test.tsx`
Expected: FAIL — every new test fails because `Modal` doesn't yet receive a `title` prop from these 7 files, so `modal-header` renders empty (or the whole render throws once `title` is a required TS prop and these files stop compiling under `tsc`, but Vitest's esbuild transform doesn't type-check, so the observable failure here is the empty/missing header text).

- [ ] **Step 3: Add the `title` prop to each of the 7 modals**

In `src/components/beheer/SegmentenSection.tsx`, change:
```tsx
        isOpen={modalState !== null}
        onClose={closeModal}
        closeLabel={t('modalClose')}
```
to:
```tsx
        isOpen={modalState !== null}
        onClose={closeModal}
        closeLabel={t('modalClose')}
        title={modalState?.mode === 'edit' ? t('segmentenModalTitelBewerken') : t('segmentenModalTitelToevoegen')}
```

In `src/components/beheer/StijlenSection.tsx`, same edit with `stijlenModalTitelBewerken` / `stijlenModalTitelToevoegen`.

In `src/components/beheer/OnderwerpenSection.tsx`, same edit with `onderwerpenModalTitelBewerken` / `onderwerpenModalTitelToevoegen`.

In `src/components/beheer/MaterialenSection.tsx`, same edit with `materialenModalTitelBewerken` / `materialenModalTitelToevoegen`.

In `src/components/beheer/MateriaalsoortenSection.tsx`, same edit with `materiaalsoortenModalTitelBewerken` / `materiaalsoortenModalTitelToevoegen`.

In `src/components/beheer/MatenSection.tsx`, same edit with `matenModalTitelBewerken` / `matenModalTitelToevoegen`.

In `src/components/beheer/PrijsgroepenSection.tsx`, same edit with `prijsgroepenModalTitelBewerken` / `prijsgroepenModalTitelToevoegen`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/SegmentenSection.test.tsx tests/components/beheer/StijlenSection.test.tsx tests/components/beheer/OnderwerpenSection.test.tsx tests/components/beheer/MaterialenSection.test.tsx tests/components/beheer/MateriaalsoortenSection.test.tsx tests/components/beheer/MatenSection.test.tsx tests/components/beheer/PrijsgroepenSection.test.tsx`
Expected: PASS — all tests in all 7 files, including the new ones.

- [ ] **Step 5: Commit**

```bash
git add messages/nl.json src/components/beheer/SegmentenSection.tsx src/components/beheer/StijlenSection.tsx src/components/beheer/OnderwerpenSection.tsx src/components/beheer/MaterialenSection.tsx src/components/beheer/MateriaalsoortenSection.tsx src/components/beheer/MatenSection.tsx src/components/beheer/PrijsgroepenSection.tsx tests/components/beheer/SegmentenSection.test.tsx tests/components/beheer/StijlenSection.test.tsx tests/components/beheer/OnderwerpenSection.test.tsx tests/components/beheer/MaterialenSection.test.tsx tests/components/beheer/MateriaalsoortenSection.test.tsx tests/components/beheer/MatenSection.test.tsx tests/components/beheer/PrijsgroepenSection.test.tsx
git commit -m "feat: add toevoegen/bewerken titles to the 7 catalog modals"
```

---

### Task 4: `AccountOrderModal` — title + bounded-height order-lines list

**Files:**
- Modify: `src/components/account/AccountOrderModal.tsx`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json`
- Test: `tests/components/account/AccountOrderModal.test.tsx`

**Interfaces:**
- Consumes: `Modal` from Task 1.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing tests**

In `messages/nl.json`, after the line `"modalLinePriceOnRequest": "Prijs op aanvraag",` (inside `accountPage.orders`), add:
```json
      "modalTitel": "Bestelling {id}",
```

In `messages/en.json`, after the line `"modalLinePriceOnRequest": "Price on request",` (inside `accountPage.orders`), add:
```json
      "modalTitel": "Order {id}",
```

In `messages/de.json`, after the line `"modalLinePriceOnRequest": "Preis auf Anfrage",` (inside `accountPage.orders`), add:
```json
      "modalTitel": "Bestellung {id}",
```

In `messages/fr.json`, after the line `"modalLinePriceOnRequest": "Prix sur demande",` (inside `accountPage.orders`), add:
```json
      "modalTitel": "Commande {id}",
```

In `tests/components/account/AccountOrderModal.test.tsx`, add two new tests inside the `describe('AccountOrderModal', ...)` block:

```tsx
  it('shows the order id in the modal header', () => {
    renderModal({
      id: 'GD-00001',
      date: '1-7-2026',
      time: '14:30',
      description: '',
      lines: [{ id: 'line-1', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
    });
    expect(screen.getByTestId('modal-header')).toHaveTextContent('GD-00001');
  });

  it('caps the order-lines list height so it scrolls independently of the modal frame', () => {
    renderModal({
      id: 'GD-00001',
      date: '1-7-2026',
      time: '14:30',
      description: '',
      lines: [{ id: 'line-1', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
    });
    const list = screen.getByTestId('account-order-modal-line-line-1').closest('ul');
    expect(list?.className).toMatch(/max-h-72/);
    expect(list?.className).toMatch(/overflow-y-auto/);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/account/AccountOrderModal.test.tsx`
Expected: FAIL — `modal-header` has no text (no `title` passed yet) and the `<ul>` has no `max-h-72`/`overflow-y-auto` class yet.

- [ ] **Step 3: Implement the changes**

In `src/components/account/AccountOrderModal.tsx`, change:
```tsx
    <Modal isOpen={order !== null} onClose={onClose} closeLabel={t('modalClose')}>
```
to:
```tsx
    <Modal
      isOpen={order !== null}
      onClose={onClose}
      closeLabel={t('modalClose')}
      title={order ? t('modalTitel', { id: order.id }) : ''}
    >
```

And change:
```tsx
            <ul className="flex flex-col gap-2 text-xs">
```
to:
```tsx
            <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto text-xs">
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/account/AccountOrderModal.test.tsx`
Expected: PASS (all tests, including the 2 new ones).

- [ ] **Step 5: Commit**

```bash
git add messages/nl.json messages/en.json messages/de.json messages/fr.json src/components/account/AccountOrderModal.tsx tests/components/account/AccountOrderModal.test.tsx
git commit -m "feat: add header title and bounded-scroll order lines to AccountOrderModal"
```

---

### Task 5: `BestellingModal` — bounded-height bestelregels list

**Files:**
- Modify: `src/components/beheer/BestellingModal.tsx`
- Test: `tests/components/beheer/BestellingModal.test.tsx`

**Interfaces:**
- Consumes: `Modal` from Task 1 (already passes `title`/`subtitle` — no change needed there).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Add this test inside the `describe('BestellingModal', ...)` block in `tests/components/beheer/BestellingModal.test.tsx`:

```tsx
  it('caps the bestelregels list height so it scrolls independently of the modal frame', () => {
    renderModal(BESTELLING);
    const list = screen.getByTestId('bestelling-modal-line-line-1').closest('ul');
    expect(list?.className).toMatch(/max-h-80/);
    expect(list?.className).toMatch(/overflow-y-auto/);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx`
Expected: FAIL — the `<ul>` has no `max-h-80`/`overflow-y-auto` class yet.

- [ ] **Step 3: Implement the change**

In `src/components/beheer/BestellingModal.tsx`, change:
```tsx
          <ul className="flex flex-col gap-3 text-xs">
```
to:
```tsx
          <ul className="flex max-h-80 flex-col gap-3 overflow-y-auto text-xs">
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx`
Expected: PASS (all tests, including the new one).

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/BestellingModal.tsx tests/components/beheer/BestellingModal.test.tsx
git commit -m "feat: cap the BestellingModal regel list to its own scroll box"
```

---

### Task 6: `DrukkerModal` — bounded-height zendingen list

**Files:**
- Modify: `src/components/beheer/DrukkerModal.tsx`
- Test: `tests/components/beheer/DrukkerModal.test.tsx`

**Interfaces:**
- Consumes: `Modal` from Task 1 (already passes `title` — no change needed there).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Add this test inside the `describe('DrukkerModal zendingen', ...)` block in `tests/components/beheer/DrukkerModal.test.tsx`:

```tsx
  it('caps the zendingen list height so it scrolls independently of the modal frame', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'zending-1',
          verzondenOp: '2026-07-24T10:00:00Z',
          onderwerp: 'Nieuwe order(s) voor de drukker – 24-7-2026',
          body: '== Testbedrijf BV ==',
          bestellingIds: ['header-1'],
          aantalKlanten: 1,
          aantalRegels: 1,
          verzondDoor: 'paul@glassartanddesign.com',
        },
      ],
    });
    renderModal({ mode: 'edit', drukker: DRUKKER });
    const zendingRow = await screen.findByTestId('drukker-zending-zending-1');
    const list = zendingRow.closest('ul');
    expect(list?.className).toMatch(/max-h-64/);
    expect(list?.className).toMatch(/overflow-y-auto/);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/beheer/DrukkerModal.test.tsx`
Expected: FAIL — the `<ul>` has no `max-h-64`/`overflow-y-auto` class yet.

- [ ] **Step 3: Implement the change**

In `src/components/beheer/DrukkerModal.tsx`, change:
```tsx
              <ul className="flex flex-col gap-2">
```
to:
```tsx
              <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/components/beheer/DrukkerModal.test.tsx`
Expected: PASS (all tests, including the new one).

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/DrukkerModal.tsx tests/components/beheer/DrukkerModal.test.tsx
git commit -m "feat: cap the DrukkerModal zendingen list to its own scroll box"
```

---

### Task 7: `KunstwerkenSection` — title + 4-tab kunstwerk-modal

**Files:**
- Modify: `src/components/beheer/KunstwerkenSection.tsx`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/KunstwerkenSection.test.tsx`

**Interfaces:**
- Consumes: `Modal` from Task 1, `ModalTabs`/`ModalTab` from Task 2 (`import { ModalTabs } from '@/components/ModalTabs'`).
- Produces: nothing consumed by later tasks.

The existing 949-line test file drives every field via `getByTestId`/`fireEvent.change`, never via `getByRole` or visibility assertions, so switching tab content to a CSS `hidden` toggle (element stays mounted, just `display:none` when its tab isn't active) means none of those existing tests need to change — they keep working whether or not the field's tab is currently active. Only new tests are added below.

- [ ] **Step 1: Write the failing tests**

In `messages/nl.json`, after the line `"kunstwerkenVerwijderen": "Verwijderen",`, add:
```json
    "kunstwerkenModalTitelToevoegen": "Kunstwerk toevoegen",
    "kunstwerkenModalTitelBewerken": "Kunstwerk bewerken",
    "kunstwerkenTabAlgemeen": "Algemeen",
    "kunstwerkenTabKenmerken": "Kenmerken",
    "kunstwerkenTabPrijzen": "Prijzen",
    "kunstwerkenTabOmschrijvingen": "Omschrijvingen",
```

Add these tests to the end of the `describe` block in `tests/components/beheer/KunstwerkenSection.test.tsx`. The file already defines `renderSection(overrides = {})` (no-arg call renders with its default fixtures, which include a `kunstwerken` row with `id: 'kw-1'`), the add button's testid is `kunstwerken-add`, and existing rows use the `DataTable` convention `data-table-row-<id>` (so `data-table-row-kw-1` for that fixture):

```tsx
  it('shows the toevoegen title when adding and the bewerken title when editing', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Kunstwerk toevoegen');
    fireEvent.click(screen.getByTestId('modal-close'));
    fireEvent.click(screen.getByTestId('data-table-row-kw-1'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Kunstwerk bewerken');
  });

  it('starts on the Algemeen tab and switches tab content when a tab is clicked', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    expect(screen.getByTestId('kunstwerk-modal-tab-algemeen')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('kunstwerk-modal-tab-omschrijvingen')).toHaveAttribute('aria-selected', 'false');
    fireEvent.click(screen.getByTestId('kunstwerk-modal-tab-omschrijvingen'));
    expect(screen.getByTestId('kunstwerk-modal-tab-omschrijvingen')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('kunstwerk-modal-tab-algemeen')).toHaveAttribute('aria-selected', 'false');
  });

  it('shows an error dot on the Algemeen tab when naam is empty, and on the Omschrijvingen tab when omschrijvingNl is empty', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    expect(screen.getByTestId('kunstwerk-modal-tab-algemeen-error-dot')).toBeInTheDocument();
    expect(screen.getByTestId('kunstwerk-modal-tab-omschrijvingen-error-dot')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('kunstwerk-modal-naam'), { target: { value: 'Nieuw kunstwerk' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Omschrijving' } });
    expect(screen.queryByTestId('kunstwerk-modal-tab-omschrijvingen-error-dot')).not.toBeInTheDocument();
  });

  it('resets to the Algemeen tab each time the modal is reopened', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-tab-omschrijvingen'));
    fireEvent.click(screen.getByTestId('modal-close'));
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    expect(screen.getByTestId('kunstwerk-modal-tab-algemeen')).toHaveAttribute('aria-selected', 'true');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: FAIL — `kunstwerk-modal-tab-*` testids don't exist yet, and `modal-header` has no text since `KunstwerkenSection.tsx`'s `Modal` doesn't pass `title` yet.

- [ ] **Step 3: Implement the tabs**

In `src/components/beheer/KunstwerkenSection.tsx`, add the import:
```tsx
import { ModalTabs } from '@/components/ModalTabs';
```

Add a tab-id type and state, right after the `formaatSessionRef` declaration (after `const formaatSessionRef = useRef(0);`):
```tsx
  type TabId = 'algemeen' | 'kenmerken' | 'prijzen' | 'omschrijvingen';
  const [activeTab, setActiveTab] = useState<TabId>('algemeen');
```

In `openAdd()`, add `setActiveTab('algemeen');` right after `formaatSessionRef.current += 1;`:
```tsx
  function openAdd() {
    formaatSessionRef.current += 1;
    setActiveTab('algemeen');
    resetForm();
    setModalState({ mode: 'add' });
  }
```

In `openEdit()`, add `setActiveTab('algemeen');` right after `formaatSessionRef.current += 1;`:
```tsx
  function openEdit(kunstwerk: Kunstwerk) {
    formaatSessionRef.current += 1;
    setActiveTab('algemeen');
    const session = formaatSessionRef.current;
```

Right before `const opslaanDisabled = ...`, add the per-tab error flags:
```tsx
  const algemeenHeeftFout = !foto || !naam || formaat === null;
  const kenmerkenHeeftFout = segmentIds.length === 0;
  const prijzenHeeftFout = isMaatloos ? !prijsPerM2 || Number(prijsPerM2) <= 0 : !allePrijzenIngevuld;
  const omschrijvingenHeeftFout = !omschrijvingNl;
```

On the `<Modal>` opening tag, change:
```tsx
      <Modal
        isOpen={modalState !== null}
        onClose={closeModal}
        closeLabel={t('modalClose')}
        wide
```
to:
```tsx
      <Modal
        isOpen={modalState !== null}
        onClose={closeModal}
        closeLabel={t('modalClose')}
        title={modalState?.mode === 'edit' ? t('kunstwerkenModalTitelBewerken') : t('kunstwerkenModalTitelToevoegen')}
        wide
```

Change the `kunstwerk-modal` root `<div>` and its immediate children to add the tab strip and wrap the existing four field groups in `hidden`-toggling containers. The full new structure (everything from the `kunstwerk-modal` div down to, but not including, the `<div className="lg:sticky ...">` preview column, which is unchanged):

```tsx
        <div
          data-testid="kunstwerk-modal"
          className="flex flex-col gap-4 text-sm text-white/80"
        >
          <ModalTabs
            tabs={[
              { id: 'algemeen', label: t('kunstwerkenTabAlgemeen'), hasError: algemeenHeeftFout },
              { id: 'kenmerken', label: t('kunstwerkenTabKenmerken'), hasError: kenmerkenHeeftFout },
              { id: 'prijzen', label: t('kunstwerkenTabPrijzen'), hasError: prijzenHeeftFout },
              { id: 'omschrijvingen', label: t('kunstwerkenTabOmschrijvingen'), hasError: omschrijvingenHeeftFout },
            ]}
            activeTabId={activeTab}
            onTabChange={(id) => setActiveTab(id as TabId)}
            testIdPrefix="kunstwerk-modal"
          />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] min-[1432px]:grid-cols-[minmax(0,1fr)_560px]">
            <div className="flex flex-col gap-3">
              <div className={activeTab === 'algemeen' ? 'flex flex-col gap-3' : 'hidden'}>
```

That opening `<div className={activeTab === 'algemeen' ? ... : 'hidden'}>` replaces the original `<div className="flex flex-col gap-3">` that used to open the whole field column (originally the line right after the `kunstwerk-modal` root div's opening tag). Before this task, the field column runs from the foto-dropzone `<label>` (originally starting `{t('kunstwerkenLabelFoto')}`) down to the closing `</div>` of the whole column, with this content in order — use `grep -n "kunstwerkenLabelFoto\|kunstwerk-modal-foto-preview\|kunstwerkenLabelSegmenten\|kunstwerkenLabelAiGegenereerd\|materiaalIds.length > 0 && maatIds.length > 0\|isMateriaalloos &&\|kunstwerkenLabelOmschrijvingNl\|kunstwerkenLabelOmschrijvingEn\|kunstwerk-modal-error" src/components/beheer/KunstwerkenSection.tsx` on the file as it stands before this task to find the current line numbers, since Tasks 1–6 don't touch this file and its line numbers are otherwise stable:

1. Foto dropzone label → foto-verplicht hint → uploading indicator → foto-upload-error → Naam label → Kunstenaar select → Formaat fieldset → foto-preview `<img>` block: this whole run stays **inside the Algemeen tab**, unchanged.
2. Immediately after the foto-preview `<img>` block's closing `)}`, the segmenten `<fieldset>` begins — close the Algemeen tab div and open the Kenmerken tab div there.
3. Segmenten fieldset → materialen/maten `<details>` → stijlen fieldset (with the "nieuwe stijl" add row) → onderwerpen fieldset (with the "nieuw onderwerp" add row) → ai-gegenereerd `<label>` checkbox: this whole run stays **inside the Kenmerken tab**, unchanged.
4. Immediately after the ai-gegenereerd `<label>` closes, the `{materiaalIds.length > 0 && maatIds.length > 0 && (...)}` prijzen-table block begins — close the Kenmerken tab div and open the Prijzen tab div there.
5. The `{materiaalIds.length > 0 && maatIds.length > 0 && (...)}` prijzen-table block and the `{isMateriaalloos && (...)}` prijs-per-m² block: this pair stays **inside the Prijzen tab**, unchanged.
6. Immediately after the prijs-per-m² block's closing `)}`, the omschrijving-NL `<label>` begins — close the Prijzen tab div and open the Omschrijvingen tab div there.
7. The four omschrijving `<label>` blocks (NL, FR, DE, EN, in that order): this whole run stays **inside the Omschrijvingen tab**, unchanged.

Each tab-open point looks like:
```tsx
              </div>

              <div className={activeTab === 'kenmerken' ? 'flex flex-col gap-3' : 'hidden'}>
```
(swap `'kenmerken'` for `'prijzen'` and `'omschrijvingen'` at the other two boundaries).

Immediately after the omschrijving-EN `<label>` closes, close Omschrijvingen, then keep the `actionError` block outside all four tab groups (still inside the left-column `<div className="flex flex-col gap-3">`, so it stays visible regardless of which tab is active), then close the left column:
```tsx
              </div>

              {actionError && (
                <p data-testid="kunstwerk-modal-error" className="text-xs text-red-400">
                  {actionError}
                </p>
              )}
            </div>
```

The right-column preview `<div className="lg:sticky lg:top-0 lg:pt-10">...</div>` and the closing `</div></Modal>` tags stay exactly as they are today — untouched.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: PASS — all pre-existing tests (they never depended on tab visibility) plus the 4 new ones.

- [ ] **Step 5: Commit**

```bash
git add messages/nl.json src/components/beheer/KunstwerkenSection.tsx tests/components/beheer/KunstwerkenSection.test.tsx
git commit -m "feat: split the kunstwerk-modal into Algemeen/Kenmerken/Prijzen/Omschrijvingen tabs"
```

---

### Task 8: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS, 0 failures — this is the regression check for `KlantModal.tsx`, `VersturenNaarDrukkerDialog.tsx`, and every other `Modal` consumer not touched by Tasks 1–7, confirming the now-required `title` prop and the restructured shell didn't break anything outside this plan's explicit scope.

- [ ] **Step 2: Run a production type-check build**

Run: `npm run build`
Expected: succeeds with no TypeScript errors — this is what actually enforces `title` being a required prop on every `Modal` call site across the whole codebase (Vitest's esbuild transform does not type-check, so this is the first point in the plan that would catch a missed call site).

- [ ] **Step 3: Manually verify in the browser**

Start the dev server (`npm run dev`), log in to `/nl/beheer` with the medewerker test account, and check:
- Klanten: open a klant row — header shows "Klantgegevens", header/footer stay put while scrolling the middle content.
- Bestellingen: open a bestelling with several regels — the regel list scrolls on its own, footer buttons stay visible.
- Drukkers: open a drukker with several zendingen — same check for the zendingen list.
- Segmenten/Stijlen/Onderwerpen/Materialen/Materiaalsoorten/Maten/Prijsgroepen: open add and edit — header now shows a real title instead of nothing.
- Kunstwerken: open add and edit — 4 tabs appear, switching tabs doesn't lose entered data, an error dot appears on a tab with a missing required field, preview column stays visible next to the tabs on a wide window.
- Account: log in as a customer, open an order in bestelgeschiedenis — header shows "Bestelling <id>", lines list scrolls independently if long.

No commit for this task (verification only).
