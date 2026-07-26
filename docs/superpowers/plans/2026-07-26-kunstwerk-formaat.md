# Kunstwerk Formaat (vierkant/liggend/staand) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Beheer set a formaat (Vierkant/Liggend/Staand) per kunstwerk — auto-detected from the
photo, overridable — which filters which maten are selectable for that kunstwerk, and (as a deferred
follow-up) appears on the drukker order line.

**Architecture:** Pure-function orientation detection (`detectKunstwerkFormaat.ts`) driven by
client-side image measurement, wired into the existing `KunstwerkenSection.tsx` admin form. No new
Firestore collection, no schema migration — `formaat` is an optional field on the existing `Kunstwerk`
document, read with the same `?? null`/`?? undefined` fallback pattern already used elsewhere in
Beheer for backward-compatible field additions.

**Tech Stack:** Next.js (App Router), React, TypeScript, Firebase Firestore, next-intl, Vitest +
Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-26-kunstwerk-formaat-design.md`

## Global Constraints

- Beheer-namespace translations are Dutch-only (`messages/nl.json`, `beheer` key) — do not add these
  keys to `en.json`/`de.json`/`fr.json`.
- `npm test` (Vitest) does not type-check — always also run `npx tsc --noEmit` before considering a
  task's diff clean.
- Never use `git add -A`/`-a`/`.` — stage explicit paths only.
- This repo's working directory is shared with other concurrent Claude Code sessions. Check
  `git status`/`git log` immediately before each task's commit for unexpected interleaved commits; do
  not touch files unrelated to this plan.
- No new Firestore rules and no new `ActiviteitType` are needed: `formaat` is written as part of the
  same `onAdd`/`onUpdate` payload already covered by the existing `kunstwerken` rules, and logged via
  the existing `kunstwerk_toegevoegd`/`kunstwerk_gewijzigd` activiteit events.

---

## File Structure

New files:
- `src/lib/detectKunstwerkFormaat.ts` — pure dimension→formaat classifier + image-measuring helpers.
- `tests/lib/detectKunstwerkFormaat.test.ts`
- `tests/components/beheer/materiaalTypes.test.ts` — test for the new `isVierkanteMaat` helper.

Modified files:
- `src/components/beheer/materiaalTypes.ts` — `KunstwerkFormaat` type, `Kunstwerk.formaat` field,
  `isVierkanteMaat` helper.
- `src/components/beheer/KunstwerkenSection.tsx` (+ its test) — formaat radiogroup, maten filtering,
  auto-detection wiring, Opslaan validation.
- `messages/nl.json` — new `kunstwerken*`/`Formaat*` keys.

Deferred (Task 4, not executable yet — see that task):
- `src/lib/buildDrukkerMail.ts` / `tests/lib/buildDrukkerMail.test.ts` — do not exist yet; created by
  Task 7 of `docs/superpowers/plans/2026-07-26-drukker-order-workflow.md`.

---

### Task 1: Data model — `KunstwerkFormaat`, `Kunstwerk.formaat`, `isVierkanteMaat`

**Files:**
- Modify: `src/components/beheer/materiaalTypes.ts`
- Test: `tests/components/beheer/materiaalTypes.test.ts`

**Interfaces:**
- Produces: `export type KunstwerkFormaat = 'vierkant' | 'liggend' | 'staand';`,
  `Kunstwerk.formaat?: KunstwerkFormaat | null`, `export function isVierkanteMaat(maat: Maat): boolean`.

- [ ] **Step 1: Write the failing test**

Create `tests/components/beheer/materiaalTypes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isVierkanteMaat } from '@/components/beheer/materiaalTypes';
import type { Maat } from '@/components/beheer/materiaalTypes';

describe('isVierkanteMaat', () => {
  it('returns true when breedte equals hoogte', () => {
    const maat: Maat = { id: 'maat-1', breedte: 50, hoogte: 50 };
    expect(isVierkanteMaat(maat)).toBe(true);
  });

  it('returns false when breedte and hoogte differ', () => {
    expect(isVierkanteMaat({ id: 'maat-2', breedte: 50, hoogte: 70 })).toBe(false);
    expect(isVierkanteMaat({ id: 'maat-3', breedte: 70, hoogte: 50 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/beheer/materiaalTypes.test.ts`
Expected: FAIL — `isVierkanteMaat` is not exported (module has no runtime exports today, only types).

- [ ] **Step 3: Implement the type and helper**

In `src/components/beheer/materiaalTypes.ts`, add after the `Maat` interface:

```ts
export type KunstwerkFormaat = 'vierkant' | 'liggend' | 'staand';

export function isVierkanteMaat(maat: Maat): boolean {
  return maat.breedte === maat.hoogte;
}
```

And add to the `Kunstwerk` interface, after `artiest: string;`:

```ts
  formaat?: KunstwerkFormaat | null;
```

(Optional — same pattern as `Materiaalsoort.staatEigenMaatToe?: boolean` earlier in this file.
Existing Firestore documents and test fixtures that don't set `formaat` remain valid; the field is
simply `undefined` for them, treated the same as `null` everywhere this plan reads it.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/components/beheer/materiaalTypes.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/beheer/materiaalTypes.ts tests/components/beheer/materiaalTypes.test.ts
git commit -m "feat: voeg KunstwerkFormaat-type en isVierkanteMaat-helper toe"
```

---

### Task 2: `detectKunstwerkFormaat` — pure classifier + image-measuring helpers

**Files:**
- Create: `src/lib/detectKunstwerkFormaat.ts`
- Test: `tests/lib/detectKunstwerkFormaat.test.ts`

**Interfaces:**
- Consumes: `KunstwerkFormaat` from `@/components/beheer/materiaalTypes` (Task 1).
- Produces: `export function detectFormaatFromDimensions(width: number, height: number): KunstwerkFormaat`,
  `export function detectFormaatFromImageUrl(url: string): Promise<KunstwerkFormaat | null>`,
  `export function detectFormaatFromFile(file: File): Promise<KunstwerkFormaat | null>`.

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/detectKunstwerkFormaat.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  detectFormaatFromDimensions,
  detectFormaatFromImageUrl,
  detectFormaatFromFile,
} from '@/lib/detectKunstwerkFormaat';

describe('detectFormaatFromDimensions', () => {
  it('returns vierkant when width and height are equal', () => {
    expect(detectFormaatFromDimensions(100, 100)).toBe('vierkant');
  });

  it('returns vierkant when the ratio is within 5% of 1:1', () => {
    expect(detectFormaatFromDimensions(104, 100)).toBe('vierkant');
    expect(detectFormaatFromDimensions(100, 104)).toBe('vierkant');
  });

  it('returns liggend when wider than the 5% margin', () => {
    expect(detectFormaatFromDimensions(160, 100)).toBe('liggend');
  });

  it('returns staand when taller than the 5% margin', () => {
    expect(detectFormaatFromDimensions(100, 160)).toBe('staand');
  });
});

class FakeImage {
  static nextDimensions: { width: number; height: number } = { width: 100, height: 100 };
  static shouldError = false;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  crossOrigin: string | null = null;
  set src(_value: string) {
    queueMicrotask(() => {
      if (FakeImage.shouldError) {
        this.onerror?.();
        return;
      }
      this.naturalWidth = FakeImage.nextDimensions.width;
      this.naturalHeight = FakeImage.nextDimensions.height;
      this.onload?.();
    });
  }
}

describe('detectFormaatFromImageUrl', () => {
  let originalImage: typeof Image;

  beforeEach(() => {
    originalImage = global.Image;
    FakeImage.shouldError = false;
    FakeImage.nextDimensions = { width: 100, height: 100 };
    // @ts-expect-error test double replaces the real Image constructor
    global.Image = FakeImage;
  });

  afterEach(() => {
    global.Image = originalImage;
  });

  it('resolves the detected formaat when the image loads', async () => {
    FakeImage.nextDimensions = { width: 200, height: 100 };
    await expect(detectFormaatFromImageUrl('https://example.com/foto.jpg')).resolves.toBe('liggend');
  });

  it('resolves null when the image fails to load', async () => {
    FakeImage.shouldError = true;
    await expect(detectFormaatFromImageUrl('https://example.com/broken.jpg')).resolves.toBeNull();
  });
});

describe('detectFormaatFromFile', () => {
  let originalImage: typeof Image;
  const createObjectURLMock = vi.fn(() => 'blob:mock-url');
  const revokeObjectURLMock = vi.fn();

  beforeEach(() => {
    originalImage = global.Image;
    FakeImage.shouldError = false;
    FakeImage.nextDimensions = { width: 100, height: 200 };
    // @ts-expect-error test double replaces the real Image constructor
    global.Image = FakeImage;
    createObjectURLMock.mockClear();
    revokeObjectURLMock.mockClear();
    vi.stubGlobal('URL', { ...URL, createObjectURL: createObjectURLMock, revokeObjectURL: revokeObjectURLMock });
  });

  afterEach(() => {
    global.Image = originalImage;
    vi.unstubAllGlobals();
  });

  it('creates and revokes an object URL around the detection call', async () => {
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    const result = await detectFormaatFromFile(file);
    expect(result).toBe('staand');
    expect(createObjectURLMock).toHaveBeenCalledWith(file);
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/detectKunstwerkFormaat.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `detectKunstwerkFormaat.ts`**

Create `src/lib/detectKunstwerkFormaat.ts`:

```ts
import type { KunstwerkFormaat } from '@/components/beheer/materiaalTypes';

export function detectFormaatFromDimensions(width: number, height: number): KunstwerkFormaat {
  const ratio = width / height;
  if (ratio >= 0.95 && ratio <= 1.05) return 'vierkant';
  return ratio > 1.05 ? 'liggend' : 'staand';
}

export function detectFormaatFromImageUrl(url: string): Promise<KunstwerkFormaat | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(detectFormaatFromDimensions(img.naturalWidth, img.naturalHeight));
    img.onerror = () => resolve(null);
    img.crossOrigin = 'anonymous';
    img.src = url;
  });
}

export function detectFormaatFromFile(file: File): Promise<KunstwerkFormaat | null> {
  const objectUrl = URL.createObjectURL(file);
  return detectFormaatFromImageUrl(objectUrl).finally(() => URL.revokeObjectURL(objectUrl));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/detectKunstwerkFormaat.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/detectKunstwerkFormaat.ts tests/lib/detectKunstwerkFormaat.test.ts
git commit -m "feat: detecteer kunstwerk-formaat op basis van afbeeldingsafmetingen"
```

---

### Task 3: `KunstwerkenSection` — formaatkeuze, maten-filtering, auto-detectie

**Files:**
- Modify: `src/components/beheer/KunstwerkenSection.tsx`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/KunstwerkenSection.test.tsx`

**Interfaces:**
- Consumes: `KunstwerkFormaat`, `isVierkanteMaat` from `@/components/beheer/materiaalTypes` (Task 1);
  `detectFormaatFromFile`, `detectFormaatFromImageUrl` from `@/lib/detectKunstwerkFormaat` (Task 2).

- [ ] **Step 1: Write the failing tests**

In `tests/components/beheer/KunstwerkenSection.test.tsx`:

Add a mock for the new detection module, right after the existing `vi.mock('@/lib/useKunstwerkFotoUpload', ...)` block:

```ts
const detectFormaatFromFileMock = vi.fn();
const detectFormaatFromImageUrlMock = vi.fn();

vi.mock('@/lib/detectKunstwerkFormaat', () => ({
  detectFormaatFromFile: (...args: unknown[]) => detectFormaatFromFileMock(...args),
  detectFormaatFromImageUrl: (...args: unknown[]) => detectFormaatFromImageUrlMock(...args),
}));
```

Add a third, square `Maat` to the fixture (needed to test the vierkant⇄niet-vierkant filtering in both
directions) — change:

```ts
const MATEN: Maat[] = [
  { id: 'maat-1', breedte: 40, hoogte: 60 },
  { id: 'maat-2', breedte: 60, hoogte: 90 },
];
```

to:

```ts
const MATEN: Maat[] = [
  { id: 'maat-1', breedte: 40, hoogte: 60 },
  { id: 'maat-2', breedte: 60, hoogte: 90 },
  { id: 'maat-3', breedte: 50, hoogte: 50 },
];
```

Give the existing `KUNSTWERKEN[0]` fixture a formaat consistent with its already-selected maat-1
(40×60, non-square → `staand`) — change:

```ts
const KUNSTWERKEN: Kunstwerk[] = [
  {
    id: 'kw-1',
    foto: 'https://storage.example.com/kw-1.jpg',
    naam: 'Hotel paneel 1',
    artiest: '',
    segmentIds: ['seg-1'],
```

to:

```ts
const KUNSTWERKEN: Kunstwerk[] = [
  {
    id: 'kw-1',
    foto: 'https://storage.example.com/kw-1.jpg',
    naam: 'Hotel paneel 1',
    artiest: '',
    formaat: 'staand',
    segmentIds: ['seg-1'],
```

Reset the new mocks in `beforeEach` — change:

```ts
beforeEach(() => {
  uploadMock.mockReset();
  mockUploading = false;
  mockUploadError = null;
  logActiviteitMock.mockReset();
});
```

to:

```ts
beforeEach(() => {
  uploadMock.mockReset();
  mockUploading = false;
  mockUploadError = null;
  logActiviteitMock.mockReset();
  detectFormaatFromFileMock.mockReset();
  detectFormaatFromFileMock.mockResolvedValue(null);
  detectFormaatFromImageUrlMock.mockReset();
  detectFormaatFromImageUrlMock.mockResolvedValue(null);
});
```

(Default to `null` — no auto-detection — so every existing test keeps its current behavior unless a
test explicitly overrides the mock.)

Update the "keeps Opslaan disabled..." test — change its final lines:

```tsx
    fireEvent.change(screen.getByTestId('kunstwerk-modal-naam'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '99' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Test' } });
    expect(screen.getByTestId('kunstwerk-modal-opslaan')).not.toBeDisabled();
  });
```

to:

```tsx
    fireEvent.change(screen.getByTestId('kunstwerk-modal-naam'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '99' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Test' } });
    expect(screen.getByTestId('kunstwerk-modal-opslaan')).toBeDisabled(); // formaat still missing

    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-staand'));
    expect(screen.getByTestId('kunstwerk-modal-opslaan')).not.toBeDisabled();
  });
```

Update "adds a new kunstwerk with the uploaded photo, selections, prices and NL description" — change:

```tsx
    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '99' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Nieuw kunstwerk' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({
        foto: 'https://storage.example.com/nieuw.jpg',
        naam: 'Vibrant Spirit',
        artiest: 'Sabrina',
        segmentIds: ['seg-1'],
```

to:

```tsx
    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '99' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Nieuw kunstwerk' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-staand'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({
        foto: 'https://storage.example.com/nieuw.jpg',
        naam: 'Vibrant Spirit',
        artiest: 'Sabrina',
        formaat: 'staand',
        segmentIds: ['seg-1'],
```

Update "opens a row for editing pre-filled, including the price grid, and updates it" — change:

```tsx
    expect(screen.getByTestId('kunstwerk-modal-naam')).toHaveValue('Hotel paneel 1');
    expect(screen.getByTestId('kunstwerk-modal-omschrijving-nl')).toHaveValue('Hotel paneel 1');

    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '175' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('kw-1', {
        foto: 'https://storage.example.com/kw-1.jpg',
        naam: 'Hotel paneel 1',
        artiest: '',
        segmentIds: ['seg-1'],
```

to:

```tsx
    expect(screen.getByTestId('kunstwerk-modal-naam')).toHaveValue('Hotel paneel 1');
    expect(screen.getByTestId('kunstwerk-modal-omschrijving-nl')).toHaveValue('Hotel paneel 1');
    expect(screen.getByTestId('kunstwerk-modal-formaat-staand')).toBeChecked();

    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '175' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('kw-1', {
        foto: 'https://storage.example.com/kw-1.jpg',
        naam: 'Hotel paneel 1',
        artiest: '',
        formaat: 'staand',
        segmentIds: ['seg-1'],
```

Update "logs kunstwerk_toegevoegd..." — change:

```tsx
    fireEvent.change(screen.getByTestId('kunstwerk-modal-naam'), { target: { value: 'Nieuw kunstwerk' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '99' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Nieuw kunstwerk' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('kunstwerk_toegevoegd', {
```

to:

```tsx
    fireEvent.change(screen.getByTestId('kunstwerk-modal-naam'), { target: { value: 'Nieuw kunstwerk' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '99' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Nieuw kunstwerk' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-staand'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('kunstwerk_toegevoegd', {
```

Update "does not log when adding fails" — change:

```tsx
    fireEvent.change(screen.getByTestId('kunstwerk-modal-naam'), { target: { value: 'Nieuw kunstwerk' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '99' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Nieuw kunstwerk' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    await screen.findByTestId('kunstwerk-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });
```

to:

```tsx
    fireEvent.change(screen.getByTestId('kunstwerk-modal-naam'), { target: { value: 'Nieuw kunstwerk' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '99' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Nieuw kunstwerk' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-staand'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    await screen.findByTestId('kunstwerk-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });
```

Finally, append these new tests right before the closing `});` of the `describe('KunstwerkenSection', ...)` block (after the existing `'does not show the backfill button...'` test):

```tsx
  it('shows a hint that a formaat must be chosen, and hides it once one is picked', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    expect(screen.getByTestId('kunstwerk-modal-formaat-hint')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-vierkant'));
    expect(screen.queryByTestId('kunstwerk-modal-formaat-hint')).not.toBeInTheDocument();
  });

  it('deselects and disables incompatible maten when the formaat is changed, in both directions', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-kw-1'));
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-1')).toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-1')).not.toBeDisabled();

    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-vierkant'));
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-1')).not.toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-1')).toBeDisabled();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-3')).not.toBeDisabled();

    fireEvent.click(screen.getByTestId('kunstwerk-modal-maat-maat-3'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-staand'));
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-3')).not.toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-3')).toBeDisabled();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-1')).not.toBeDisabled();
  });

  it('pre-selects the detected formaat when a new photo is uploaded, overridable by the admin', async () => {
    uploadMock.mockResolvedValue('https://storage.example.com/nieuw.jpg');
    detectFormaatFromFileMock.mockResolvedValue('liggend');
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-foto-input'), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-formaat-liggend')).toBeChecked());
    expect(detectFormaatFromFileMock).toHaveBeenCalledWith(file);

    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-staand'));
    expect(screen.getByTestId('kunstwerk-modal-formaat-staand')).toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-formaat-liggend')).not.toBeChecked();
  });

  it('leaves formaat unselected when detection fails on a new photo', async () => {
    uploadMock.mockResolvedValue('https://storage.example.com/nieuw.jpg');
    detectFormaatFromFileMock.mockResolvedValue(null);
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-foto-input'), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-foto-preview')).toBeInTheDocument());
    expect(screen.getByTestId('kunstwerk-modal-formaat-vierkant')).not.toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-formaat-liggend')).not.toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-formaat-staand')).not.toBeChecked();
  });

  it('detects formaat from the existing photo when opening a kunstwerk that has none set yet', async () => {
    detectFormaatFromImageUrlMock.mockResolvedValue('vierkant');
    const zonderFormaat: Kunstwerk = { ...KUNSTWERKEN[0], id: 'kw-3', formaat: undefined };
    renderSection({ kunstwerken: [...KUNSTWERKEN, zonderFormaat] });

    fireEvent.click(screen.getByTestId('data-table-row-kw-3'));

    expect(detectFormaatFromImageUrlMock).toHaveBeenCalledWith(zonderFormaat.foto);
    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-formaat-vierkant')).toBeChecked());
  });

  it('does not call the detector when opening a kunstwerk that already has a formaat', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-kw-1'));
    expect(detectFormaatFromImageUrlMock).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: FAIL — `kunstwerk-modal-formaat-*` testids don't exist yet, `formaat` missing from payloads.

- [ ] **Step 3: Add translations**

In `messages/nl.json`, add after `"kunstwerkenLabelArtiest": "Artiest",` (around line 415):

```json
    "kunstwerkenLabelFormaat": "Formaat",
    "kunstwerkenFormaat_vierkant": "Vierkant",
    "kunstwerkenFormaat_liggend": "Liggend",
    "kunstwerkenFormaat_staand": "Staand",
    "kunstwerkenFormaatVerplicht": "Kies een formaat.",
```

- [ ] **Step 4: Implement the component changes**

In `src/components/beheer/KunstwerkenSection.tsx`:

Change the type-only import and add a value import, plus the detection import:

```ts
import type { Kunstwerk, Segment, Materiaal, Materiaalsoort, Maat, PrijsRegel, KunstwerkFormaat } from './materiaalTypes';
import { isVierkanteMaat } from './materiaalTypes';
import { detectFormaatFromFile, detectFormaatFromImageUrl } from '@/lib/detectKunstwerkFormaat';
```

Add `formaat: null as KunstwerkFormaat | null,` to `LEGE_FORM`, right after `artiest: '',`.

Add a new state hook, right after `const [artiest, setArtiest] = useState(LEGE_FORM.artiest);`:

```ts
  const [formaat, setFormaatState] = useState<KunstwerkFormaat | null>(LEGE_FORM.formaat);
```

Add a `setFormaat` helper, right after `materiaalLabel`'s closing brace (before the `if (loadError)`
guard is fine too — it just needs to be in scope for `resetForm`/`openEdit`/the JSX further down):

```ts
  function setFormaat(optie: KunstwerkFormaat) {
    setFormaatState(optie);
    setMaatIds((current) =>
      current.filter((id) => {
        const maat = (maten ?? []).find((m) => m.id === id);
        if (!maat) return true;
        return optie === 'vierkant' ? isVierkanteMaat(maat) : !isVierkanteMaat(maat);
      })
    );
  }
```

In `resetForm`, add `setFormaatState(LEGE_FORM.formaat);` right after `setArtiest(LEGE_FORM.artiest);`.

In `openEdit`, add right before `setModalState({ mode: 'edit', kunstwerk });`:

```ts
    const bestaandFormaat = kunstwerk.formaat ?? null;
    setFormaatState(bestaandFormaat);
    if (!bestaandFormaat && kunstwerk.foto) {
      detectFormaatFromImageUrl(kunstwerk.foto).then((gedetecteerd) => {
        if (gedetecteerd) {
          setFormaat(gedetecteerd);
        }
      });
    }
```

Change `handleFotoFile` from:

```ts
  async function handleFotoFile(file: File) {
    const url = await upload(file);
    if (url) {
      setFoto(url);
    }
  }
```

to:

```ts
  async function handleFotoFile(file: File) {
    const url = await upload(file);
    if (url) {
      setFoto(url);
      const gedetecteerd = await detectFormaatFromFile(file);
      if (gedetecteerd) {
        setFormaat(gedetecteerd);
      }
    }
  }
```

Add `formaat === null ||` to the `opslaanDisabled` condition, right after `!foto ||`:

```ts
  const opslaanDisabled =
    !foto ||
    formaat === null ||
    uploading ||
```

Add `formaat,` to the `data` object built in `handleSave`, right after `artiest,`:

```ts
    const data = {
      foto,
      naam,
      artiest,
      formaat,
      segmentIds,
```

In the JSX, insert a new formaat `<fieldset>` right after the artiest `<label>` block and before the
`{foto && (...)}` preview block:

```tsx
          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs uppercase tracking-wide text-white/60">
              {t('kunstwerkenLabelFormaat')}
            </legend>
            <div className="flex gap-4">
              {(['vierkant', 'liggend', 'staand'] as const).map((optie) => (
                <label key={optie} className="flex items-center gap-2 text-sm text-white/80">
                  <input
                    type="radio"
                    name="kunstwerk-formaat"
                    checked={formaat === optie}
                    onChange={() => setFormaat(optie)}
                    data-testid={`kunstwerk-modal-formaat-${optie}`}
                  />
                  {t(`kunstwerkenFormaat_${optie}`)}
                </label>
              ))}
            </div>
            {formaat === null && (
              <span data-testid="kunstwerk-modal-formaat-hint" className="text-xs text-white/50">
                {t('kunstwerkenFormaatVerplicht')}
              </span>
            )}
          </fieldset>
```

Replace the existing maten `<fieldset>` body to disable/grey out incompatible maten:

```tsx
          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs uppercase tracking-wide text-white/60">{t('kunstwerkenLabelMaten')}</legend>
            {(maten ?? []).map((maat) => {
              const incompatibel =
                formaat !== null && (formaat === 'vierkant' ? !isVierkanteMaat(maat) : isVierkanteMaat(maat));
              return (
                <label
                  key={maat.id}
                  className={`flex items-center gap-2 text-sm text-white/80 ${incompatibel ? 'opacity-40' : ''}`}
                >
                  <input
                    type="checkbox"
                    disabled={incompatibel}
                    checked={maatIds.includes(maat.id)}
                    onChange={() => setMaatIds((current) => toggle(current, maat.id))}
                    data-testid={`kunstwerk-modal-maat-${maat.id}`}
                  />
                  {`${maat.breedte}×${maat.hoogte} cm`}
                </label>
              );
            })}
          </fieldset>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: PASS.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/beheer/KunstwerkenSection.tsx messages/nl.json tests/components/beheer/KunstwerkenSection.test.tsx
git commit -m "feat: formaatkeuze (vierkant/liggend/staand) met maten-filtering en auto-detectie in KunstwerkenSection"
```

---

### Task 4 (DEFERRED — do not run yet): `formaatSuffix` on the drukker order line

**This task cannot be executed today.** `src/lib/buildDrukkerMail.ts` and
`tests/lib/buildDrukkerMail.test.ts` do not exist in the codebase yet — they are created by **Task 7**
of `docs/superpowers/plans/2026-07-26-drukker-order-workflow.md`, which has not been executed. Do not
attempt to run this task's commands until that Task 7 has landed.

**When Task 7 of the sibling plan is executed** (now or later, by whoever picks it up), apply the
following on top of its own Step 1 (test file) and Step 3 (implementation), as additional content in
the same files, **before** running Task 7's "run tests"/"commit" steps — do not create a separate
commit for this; fold it into Task 7's commit so `buildDrukkerMail` never exists in git without the
formaat suffix.

**Files (both already targeted by Task 7):**
- Modify: `src/lib/buildDrukkerMail.ts`
- Modify: `tests/lib/buildDrukkerMail.test.ts`

**Interfaces:**
- Consumes: `Kunstwerk.formaat` (Task 1 of this plan, already merged by the time Task 7 runs).

- [ ] **Step A: Extend the `KUNSTWERKEN` fixture in `tests/lib/buildDrukkerMail.test.ts`**

Add two more entries to the `KUNSTWERKEN` array Task 7 defines (after its `kw-1` entry), without
changing `kw-1` itself — Task 7's own assertions on `kw-1` (which has no `formaat` set) must keep
producing a suffix-free line:

```ts
  {
    id: 'kw-2',
    foto: '',
    naam: 'Raampaneel',
    artiest: '',
    segmentIds: [],
    materiaalIds: ['mat-1'],
    maatIds: ['maat-1'],
    prijzen: [],
    omschrijvingNl: 'Raampaneel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    formaat: 'liggend',
  },
  {
    id: 'kw-3',
    foto: '',
    naam: 'Deurpaneel',
    artiest: '',
    segmentIds: [],
    materiaalIds: ['mat-1'],
    maatIds: ['maat-1'],
    prijzen: [],
    omschrijvingNl: 'Deurpaneel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    formaat: 'staand',
  },
```

- [ ] **Step B: Add formaat-suffix test cases**

Add inside Task 7's `describe('buildDrukkerMail', ...)` block:

```ts
  it('appends " (Liggend)" to the maat when the kunstwerk formaat is liggend', () => {
    const mail = buildDrukkerMail({
      bestellingen: [
        bestelling({
          lines: [{ id: 'line-4', kunstwerkId: 'kw-2', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
        }),
      ],
      klanten: [klant()],
      kunstwerken: KUNSTWERKEN,
      materialen: MATERIALEN,
      maten: MATEN,
      materiaalsoorten: MATERIAALSOORTEN,
    });
    expect(mail.body).toContain('maat 40×60 cm (Liggend), aantal 1');
  });

  it('appends " (Staand)" to the maat when the kunstwerk formaat is staand', () => {
    const mail = buildDrukkerMail({
      bestellingen: [
        bestelling({
          lines: [{ id: 'line-5', kunstwerkId: 'kw-3', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
        }),
      ],
      klanten: [klant()],
      kunstwerken: KUNSTWERKEN,
      materialen: MATERIALEN,
      maten: MATEN,
      materiaalsoorten: MATERIAALSOORTEN,
    });
    expect(mail.body).toContain('maat 40×60 cm (Staand), aantal 1');
  });

  it('adds no suffix when the kunstwerk formaat is vierkant or not set', () => {
    const mail = buildDrukkerMail({
      bestellingen: [bestelling()],
      klanten: [klant()],
      kunstwerken: KUNSTWERKEN,
      materialen: MATERIALEN,
      maten: MATEN,
      materiaalsoorten: MATERIAALSOORTEN,
    });
    expect(mail.body).toContain('maat 40×60 cm, aantal 2');
    expect(mail.body).not.toContain('cm (');
  });
```

- [ ] **Step C: Run the extended tests to verify the new ones fail**

Run: `npx vitest run tests/lib/buildDrukkerMail.test.ts`
Expected: Task 7's original tests PASS (unchanged behavior for `kw-1`), the 3 new tests FAIL —
`formaatSuffix` doesn't exist yet.

- [ ] **Step D: Extend `formatRegel` in `src/lib/buildDrukkerMail.ts`**

Add, right before Task 7's `formatRegel` function:

```ts
function formaatSuffix(kunstwerk: Kunstwerk | undefined): string {
  if (kunstwerk?.formaat === 'liggend') return ' (Liggend)';
  if (kunstwerk?.formaat === 'staand') return ' (Staand)';
  return '';
}
```

Change `formatRegel`'s `maatOmschrijving` line from:

```ts
  const maatOmschrijving = maat
    ? `${maat.breedte}×${maat.hoogte} cm`
    : line.breedte != null && line.hoogte != null
      ? `${line.breedte}×${line.hoogte} cm`
      : 'Onbekende maat';
```

to:

```ts
  const maatOmschrijving = maat
    ? `${maat.breedte}×${maat.hoogte} cm${formaatSuffix(kunstwerk)}`
    : line.breedte != null && line.hoogte != null
      ? `${line.breedte}×${line.hoogte} cm${formaatSuffix(kunstwerk)}`
      : 'Onbekende maat';
```

- [ ] **Step E: Run the tests to verify they all pass**

Run: `npx vitest run tests/lib/buildDrukkerMail.test.ts`
Expected: PASS — all of Task 7's original tests plus the 3 new formaat-suffix tests.

- [ ] **Step F: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step G: Fold into Task 7's commit**

Do not create a separate commit — `git add` these same files as part of Task 7's own commit step, so
`src/lib/buildDrukkerMail.ts` never lands in git history without the formaat suffix.

---

## Self-Review

**Spec coverage:** Sectie A (data model) → Task 1. Sectie B (auto-detectie) → Task 2. Sectie C
(beheer-UI/filtering/validatie) → Task 3. Sectie D (orderregel) → Task 4 (deferred, explicitly linked
to Task 7 of the sibling plan). Sectie E (vertalingen) → Task 3 Step 3. Foutafhandeling (detectie
mislukt → geen voorselectie) → covered by Task 2's `shouldError`/`resolves.toBeNull()` test and Task
3's "leaves formaat unselected when detection fails" test. Niet-in-scope items (geen `Maat`-wijziging,
geen klant-UI, geen retroactieve migratie, geen EXIF-verwerking) are respected — no task touches
`MatenSection.tsx`, `ProductModal.tsx`, or adds any migration script.

**Type consistency:** `KunstwerkFormaat` (Task 1) is consumed as-is by `detectKunstwerkFormaat.ts`
(Task 2) and `KunstwerkenSection.tsx` (Task 3) with no renaming. `isVierkanteMaat` (Task 1) is used
identically in Task 3's checkbox-disable logic and `setFormaat`. `detectFormaatFromFile`/
`detectFormaatFromImageUrl` (Task 2) are consumed with matching signatures in Task 3. `formaatSuffix`
(Task 4) matches the `Kunstwerk` type from Task 1.
