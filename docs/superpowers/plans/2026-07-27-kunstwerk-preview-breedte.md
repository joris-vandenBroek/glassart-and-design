# Kunstwerk-preview breedte & 2-koloms opmaak Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the `ProductModal` preview embedded in beheer's `KunstwerkenSection` more room on wide screens and bring back its real foto|details two-column layout, without reintroducing the viewport-vs-container bug that was just fixed.

**Architecture:** Three independent, additive changes: (1) `ProductModal.tsx`'s `preview` variant gets marker classes that a new CSS container query in `globals.css` targets, so the two-column switch is driven by the panel's actual rendered width instead of the browser viewport; (2) `Modal.tsx`'s existing `wide` variant grows its max-width so the beheer edit dialog can afford the wider preview; (3) `KunstwerkenSection.tsx`'s grid gets a responsive `xl:` column-width tier on top of the existing `lg:` one.

**Tech Stack:** Next.js 14 (App Router), React, Tailwind CSS 3.4 (native `@layer` output), native CSS Container Queries, Vitest + Testing Library.

## Global Constraints

- Design doc: `docs/superpowers/specs/2026-07-27-kunstwerk-preview-breedte-design.md` — every number below (320/560/480/1400) is copied from there; don't substitute other values.
- The `dialog` variant of `ProductModal` (customer-facing) must not change at all.
- `Modal`'s `wide` prop has exactly one caller (`KunstwerkenSection.tsx`) — adjust its existing `max-w-6xl` value directly, don't add a new prop/variant.
- No visual regression test is possible in this project (no Storybook/Chromatic/Percy) — tests are limited to asserting the right classes are present on the right elements, per the design doc.
- Follow existing test conventions in each file (helper functions, `data-testid` values, Dutch UI copy) — don't introduce new patterns.

---

### Task 1: Container-query-driven two-column preview — `ProductModal.tsx` + `globals.css`

**Files:**
- Modify: `src/styles/globals.css` (append after the existing `@layer components` block, end of file)
- Modify: `src/components/ProductModal.tsx:283-293` (WatermarkedImage className), `src/components/ProductModal.tsx:501-515` (panelClassName + preview return)
- Test: `tests/components/ProductModal.test.tsx`

**Interfaces:**
- Consumes: nothing new — reuses the existing `ProductModal` `variant` prop (`'dialog' | 'preview'`) already defined in `ProductModal.tsx:39-50`.
- Produces: three new CSS class names other tasks/tests can rely on: `.pm-preview-frame` (wrapper, sets `container-type: inline-size`), `.pm-preview-panel` (the preview panel, becomes 2-column at ≥480px container width), `.pm-preview-image` (the preview's `WatermarkedImage`, becomes full-height/right-bordered at the same breakpoint). None of these appear on the `dialog` variant.

- [ ] **Step 1: Write the failing tests**

Open `tests/components/ProductModal.test.tsx`. Find this existing block (it's inside the `describe('ProductModal', ...)` body, right after the "omits the whole info block..."/"only shows the fields..." tests):

```tsx
  it('preview variant: renders inline without a backdrop, close button or dialog role', () => {
    renderModal(() => {}, KUNSTWERK, KUNSTENAARS, SEGMENTEN, STIJLEN, ONDERWERPEN, 'preview');
    expect(screen.queryByTestId('product-modal-backdrop')).not.toBeInTheDocument();
    expect(screen.queryByTestId('product-modal-close')).not.toBeInTheDocument();
    expect(screen.getByTestId('product-modal')).not.toHaveAttribute('role', 'dialog');
  });

  it('preview variant: never switches to the two-column layout, since it is embedded in a fixed-width sidebar rather than the full viewport', () => {
    renderModal(() => {}, KUNSTWERK, KUNSTENAARS, SEGMENTEN, STIJLEN, ONDERWERPEN, 'preview');
    expect(screen.getByTestId('product-modal').className).not.toMatch(/(^|\s)sm:grid-cols-2(\s|$)/);
  });

  it('dialog variant: keeps the two-column layout at the sm breakpoint, since it is centered in the full viewport', () => {
    renderModal();
    const panel = screen.getByTestId('product-modal-backdrop').nextElementSibling;
    expect(panel?.className).toMatch(/(^|\s)sm:grid-cols-2(\s|$)/);
  });
```

Replace it with (renames the second test to reflect that preview *can* now go two-column, just never via the viewport breakpoint, and adds two new tests for the container-query markers):

```tsx
  it('preview variant: renders inline without a backdrop, close button or dialog role', () => {
    renderModal(() => {}, KUNSTWERK, KUNSTENAARS, SEGMENTEN, STIJLEN, ONDERWERPEN, 'preview');
    expect(screen.queryByTestId('product-modal-backdrop')).not.toBeInTheDocument();
    expect(screen.queryByTestId('product-modal-close')).not.toBeInTheDocument();
    expect(screen.getByTestId('product-modal')).not.toHaveAttribute('role', 'dialog');
  });

  it('preview variant: never uses the viewport-based sm: breakpoint for its two-column layout (that caused the sidebar squeeze bug)', () => {
    renderModal(() => {}, KUNSTWERK, KUNSTENAARS, SEGMENTEN, STIJLEN, ONDERWERPEN, 'preview');
    expect(screen.getByTestId('product-modal').className).not.toMatch(/(^|\s)sm:grid-cols-2(\s|$)/);
  });

  it('dialog variant: keeps the two-column layout at the sm breakpoint, since it is centered in the full viewport', () => {
    renderModal();
    const panel = screen.getByTestId('product-modal-backdrop').nextElementSibling;
    expect(panel?.className).toMatch(/(^|\s)sm:grid-cols-2(\s|$)/);
  });

  it('preview variant: wraps the panel in a container-query frame with width-driven column markers', () => {
    renderModal(() => {}, KUNSTWERK, KUNSTENAARS, SEGMENTEN, STIJLEN, ONDERWERPEN, 'preview');
    const panel = screen.getByTestId('product-modal');
    expect(panel.parentElement).toHaveClass('pm-preview-frame');
    expect(panel.className).toMatch(/(^|\s)pm-preview-panel(\s|$)/);
    expect(screen.getByTestId('watermarked-image').className).toMatch(/(^|\s)pm-preview-image(\s|$)/);
  });

  it('dialog variant: does not carry the preview container-query markers', () => {
    renderModal();
    const panel = screen.getByTestId('product-modal-backdrop').nextElementSibling as HTMLElement;
    expect(panel.className).not.toMatch(/pm-preview/);
    expect(screen.getByTestId('watermarked-image').className).not.toMatch(/pm-preview/);
  });
```

(`getByTestId('watermarked-image')` works because `WatermarkedImage` already renders `data-testid="watermarked-image"` on its root div — see `src/components/WatermarkedImage.tsx:107`.)

- [ ] **Step 2: Run tests to verify the two new ones fail**

Run: `npx vitest run tests/components/ProductModal.test.tsx -t "container-query"`
Expected: FAIL — `panel.parentElement` has no `pm-preview-frame` class, `panel.className`/image className don't contain `pm-preview-panel`/`pm-preview-image` (they don't exist in the DOM yet).

- [ ] **Step 3: Add the container-query CSS**

Open `src/styles/globals.css`. Find the end of the file:

```css
@layer components {
  .btn-gold {
    @apply bg-gold text-ink transition hover:-translate-y-0.5 hover:bg-gold-bright hover:shadow-[0_8px_32px_rgba(212,175,55,0.35)];
  }

  .badge-gold {
    @apply rounded-full border border-gold/30 bg-gold/10 px-2 py-1 font-head text-[0.6rem] uppercase tracking-wide text-gold;
  }
}
```

Append after it:

```css

/* Unlayered on purpose: Tailwind's own utility classes (grid-cols-1, h-56,
   border-b, ...) live in the native `utilities` cascade layer and would
   otherwise win over anything placed in `@layer components` at equal
   specificity. Rules outside any @layer always beat layered rules, so this
   is the only reliable way for .pm-preview-panel/.pm-preview-image to
   override the base utility classes ProductModal.tsx also applies. */
.pm-preview-frame {
  container-type: inline-size;
}

@container (min-width: 480px) {
  .pm-preview-panel {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .pm-preview-image {
    height: 100%;
    border-bottom-width: 0;
    border-right-width: 1px;
    border-right-color: rgba(212, 175, 55, 0.5);
  }
}
```

- [ ] **Step 4: Apply the marker classes in ProductModal.tsx**

Open `src/components/ProductModal.tsx`. Find:

```tsx
      <WatermarkedImage
        src={kunstwerk.foto}
        alt={omschrijving}
        fit="contain"
        fitBackground="ink"
        className={`h-56 w-full border-b border-gold/50 bg-ink ${
          variant === 'dialog' ? 'sm:h-full sm:border-b-0 sm:border-r' : ''
        }`}
      />
```

Replace with:

```tsx
      <WatermarkedImage
        src={kunstwerk.foto}
        alt={omschrijving}
        fit="contain"
        fitBackground="ink"
        className={`h-56 w-full border-b border-gold/50 bg-ink ${
          variant === 'dialog' ? 'sm:h-full sm:border-b-0 sm:border-r' : 'pm-preview-image'
        }`}
      />
```

Then find:

```tsx
  // The preview variant is embedded in a fixed-width beheer sidebar (see
  // KunstwerkenSection's 320px column) rather than centered in the full
  // viewport, so the sm: breakpoint below doesn't reflect its actual
  // available width — it must always stay single-column.
  const panelClassName = `relative z-10 grid w-full max-w-2xl grid-cols-1 overflow-hidden rounded-lg border border-white/10 bg-charcoal ${
    variant === 'dialog' ? 'sm:grid-cols-2' : ''
  }`;

  if (variant === 'preview') {
    return (
      <div data-testid="product-modal" className={panelClassName}>
        {body}
      </div>
    );
  }
```

Replace with:

```tsx
  // The preview variant is embedded in a beheer sidebar rather than centered
  // in the full viewport, so it can't rely on Tailwind's viewport-based sm:
  // breakpoint to know when there's room for a side-by-side layout. Instead
  // it gets a real CSS container query (.pm-preview-frame/.pm-preview-panel/
  // .pm-preview-image in globals.css) that reacts to the panel's actual
  // rendered width, so it can't drift out of sync with the sidebar again.
  const panelClassName = `relative z-10 grid w-full max-w-2xl grid-cols-1 overflow-hidden rounded-lg border border-white/10 bg-charcoal ${
    variant === 'dialog' ? 'sm:grid-cols-2' : 'pm-preview-panel'
  }`;

  if (variant === 'preview') {
    return (
      <div className="pm-preview-frame">
        <div data-testid="product-modal" className={panelClassName}>
          {body}
        </div>
      </div>
    );
  }
```

- [ ] **Step 5: Run the full ProductModal test file**

Run: `npx vitest run tests/components/ProductModal.test.tsx`
Expected: PASS — all tests including the 2 new ones and the renamed one.

- [ ] **Step 6: Commit**

```bash
git add src/styles/globals.css src/components/ProductModal.tsx tests/components/ProductModal.test.tsx
git commit -m "feat: bring back the ProductModal preview's two-column layout via a container query"
```

---

### Task 2: Widen the beheer edit dialog — `Modal.tsx`

**Files:**
- Modify: `src/components/Modal.tsx:46-48`
- Test: `tests/components/Modal.test.tsx`

**Interfaces:**
- Consumes: nothing new — `wide` prop already exists (`Modal.tsx:12`).
- Produces: the `wide` variant's rendered panel now carries `max-w-[1400px]` instead of `max-w-6xl`. `KunstwerkenSection.tsx` (Task 3) relies on this to give the `xl:` 560px preview column enough room.

- [ ] **Step 1: Write the failing tests**

Open `tests/components/Modal.test.tsx`. Find the last test in the file:

```tsx
  it('uses closeLabel as the close button\'s aria-label', () => {
    render(
      <Modal isOpen onClose={vi.fn()} closeLabel="Close it">
        <p>Inhoud</p>
      </Modal>
    );
    expect(screen.getByTestId('modal-close')).toHaveAttribute('aria-label', 'Close it');
  });
});
```

Replace with:

```tsx
  it('uses closeLabel as the close button\'s aria-label', () => {
    render(
      <Modal isOpen onClose={vi.fn()} closeLabel="Close it">
        <p>Inhoud</p>
      </Modal>
    );
    expect(screen.getByTestId('modal-close')).toHaveAttribute('aria-label', 'Close it');
  });

  it('uses a wider max width when wide is set', () => {
    render(
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten" wide>
        <p>Inhoud</p>
      </Modal>
    );
    const panel = screen.getByTestId('modal-backdrop').nextElementSibling as HTMLElement;
    expect(panel.className).toMatch(/max-w-\[1400px\]/);
  });

  it('uses the default (narrower) max width when wide is not set', () => {
    render(
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten">
        <p>Inhoud</p>
      </Modal>
    );
    const panel = screen.getByTestId('modal-backdrop').nextElementSibling as HTMLElement;
    expect(panel.className).toMatch(/max-w-lg/);
  });
});
```

- [ ] **Step 2: Run tests to verify the new "wide" test fails**

Run: `npx vitest run tests/components/Modal.test.tsx -t "wider max width"`
Expected: FAIL — panel className still contains `max-w-6xl`, not `max-w-[1400px]`.

- [ ] **Step 3: Update Modal.tsx**

Open `src/components/Modal.tsx`. Find:

```tsx
      <div
        className={`relative z-10 max-h-[85vh] w-full overflow-y-auto rounded-lg border border-white/10 bg-charcoal p-6 ${
          wide ? 'max-w-6xl' : 'max-w-lg'
        }`}
      >
```

Replace with:

```tsx
      <div
        className={`relative z-10 max-h-[85vh] w-full overflow-y-auto rounded-lg border border-white/10 bg-charcoal p-6 ${
          wide ? 'max-w-[1400px]' : 'max-w-lg'
        }`}
      >
```

- [ ] **Step 4: Run the full Modal test file**

Run: `npx vitest run tests/components/Modal.test.tsx`
Expected: PASS — all tests including the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/components/Modal.tsx tests/components/Modal.test.tsx
git commit -m "feat: widen the Modal wide variant to make room for the larger kunstwerk preview"
```

---

### Task 3: Responsive preview column width — `KunstwerkenSection.tsx`

**Files:**
- Modify: `src/components/beheer/KunstwerkenSection.tsx:530-534`
- Test: `tests/components/beheer/KunstwerkenSection.test.tsx`

**Interfaces:**
- Consumes: `Modal`'s `wide` prop (Task 2, already wired at `KunstwerkenSection.tsx:530`) and `ProductModal`'s container-query classes (Task 1) — this task only changes the grid column widths that feed into both.
- Produces: nothing consumed elsewhere — this is the last task.

- [ ] **Step 1: Write the failing test**

Open `tests/components/beheer/KunstwerkenSection.test.tsx`. Find the start of the `klant-dialoog preview` describe block:

```tsx
  describe('klant-dialoog preview', () => {
    it('shows a live ProductModal preview instead of the old print-label card when the add form is open', () => {
      renderSection();
      fireEvent.click(screen.getByTestId('kunstwerken-add'));
      expect(screen.getByTestId('product-modal')).toBeInTheDocument();
    });
```

Replace with:

```tsx
  describe('klant-dialoog preview', () => {
    it('shows a live ProductModal preview instead of the old print-label card when the add form is open', () => {
      renderSection();
      fireEvent.click(screen.getByTestId('kunstwerken-add'));
      expect(screen.getByTestId('product-modal')).toBeInTheDocument();
    });

    it('widens the preview column at the xl breakpoint, in addition to the existing lg column', () => {
      renderSection();
      fireEvent.click(screen.getByTestId('kunstwerken-add'));
      const grid = screen.getByTestId('kunstwerk-modal');
      expect(grid.className).toContain('lg:grid-cols-[minmax(0,1fr)_320px]');
      expect(grid.className).toContain('xl:grid-cols-[minmax(0,1fr)_560px]');
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx -t "widens the preview column"`
Expected: FAIL — `grid.className` doesn't contain `xl:grid-cols-[minmax(0,1fr)_560px]` yet.

- [ ] **Step 3: Update KunstwerkenSection.tsx**

Open `src/components/beheer/KunstwerkenSection.tsx`. Find:

```tsx
        <div
          data-testid="kunstwerk-modal"
          className="grid grid-cols-1 gap-6 text-sm text-white/80 lg:grid-cols-[minmax(0,1fr)_320px]"
        >
```

Replace with:

```tsx
        <div
          data-testid="kunstwerk-modal"
          className="grid grid-cols-1 gap-6 text-sm text-white/80 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_560px]"
        >
```

- [ ] **Step 4: Run the full KunstwerkenSection test file**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: PASS — all tests including the new one.

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/KunstwerkenSection.tsx tests/components/beheer/KunstwerkenSection.test.tsx
git commit -m "feat: widen the kunstwerk preview column to xl:560px"
```

---

### Task 4: Full-suite verification and spec sign-off

**Files:**
- Modify: `docs/superpowers/specs/2026-07-27-kunstwerk-preview-breedte-design.md:4` (status line only)

**Interfaces:**
- Consumes: the complete change set from Tasks 1–3.
- Produces: nothing — closing task.

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all test files pass (no regressions outside the three touched above).

- [ ] **Step 2: Update the design doc status**

Open `docs/superpowers/specs/2026-07-27-kunstwerk-preview-breedte-design.md`. Find:

```
**Status:** Goedgekeurd, klaar voor implementatieplan
```

Replace with:

```
**Status:** Geïmplementeerd
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-07-27-kunstwerk-preview-breedte-design.md
git commit -m "docs: mark the kunstwerk-preview-breedte design as implemented"
```

- [ ] **Step 4: Push**

```bash
git push origin master
```

Expected: push succeeds; the GitHub Pages deploy workflow (`deploy-pages.yml`) triggers automatically and finishes in roughly 1–1.5 minutes (`gh run list --workflow=deploy-pages.yml` to confirm before checking the live site).
