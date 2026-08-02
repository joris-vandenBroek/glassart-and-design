# Segment/Stijl/Onderwerp verwijder-bevestiging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before a segment, stijl or onderwerp that is still referenced by one or more kunstwerken gets deleted, show an inline confirmation with the exact usage count inside the existing edit modal; only delete after the beheerder confirms. Items not in use keep deleting instantly, unchanged.

**Architecture:** Client-side only. `kunstwerken` (already loaded at the top of `BeheerShell.tsx`) is passed as a new prop into `SegmentenSection`/`StijlenSection`/`OnderwerpenSection`, mirroring the existing pattern used by `MatenSection`/`MaterialenSection`. Each section's `handleRemove()` counts matching kunstwerken client-side; if the count is > 0, the same `Modal` instance swaps its body/footer into a confirmation view instead of opening a second, stacked modal (avoids `useOverlayDismiss`'s per-modal Escape listener firing twice).

**Tech Stack:** Next.js 14 (App Router), React, TypeScript, `next-intl`, Vitest + Testing Library.

## Global Constraints

- New translation strings go **only** in `messages/nl.json` — the `beheer` namespace is nl-only (see `docs/superpowers/specs/2026-08-02-client-side-foto-compressie-design.md` precedent, confirmed in `CLAUDE.md`-adjacent project conventions).
- No server/API changes — `DELETE /api/[resource]/[id]` stays as-is; the in-use check is client-side, same as the existing `maten`/`materialen` pattern in `MatenSection.tsx`/`MaterialenSection.tsx`.
- Items with zero matching kunstwerken must keep deleting immediately with no visible change in behavior.
- No test may perform a blanket `DELETE FROM`/`TRUNCATE` against the shared database — not applicable here since these are pure component tests with mocked callbacks, no DB access.

---

### Task 1: Segmenten — delete confirmation

**Files:**
- Modify: `src/components/beheer/SegmentenSection.tsx`
- Modify: `src/components/beheer/BeheerShell.tsx:366-372` (pass the new `kunstwerken` prop)
- Modify: `messages/nl.json:374` (add shared `verwijderenBevestigen` key) and `messages/nl.json:495` (add `segmentenVerwijderBevestiging` key)
- Test: `tests/components/beheer/SegmentenSection.test.tsx`

**Interfaces:**
- Consumes: `Kunstwerk` type from `src/components/beheer/materiaalTypes.ts` (`segmentIds: string[]`, required field).
- Produces: `SegmentenSectionProps.kunstwerken: Kunstwerk[] | null` — the new required prop `BeheerShell.tsx` must supply. `data-testid`s `segment-modal-verwijder-bevestiging`, `segment-modal-verwijder-bevestigen`, `segment-modal-verwijder-annuleren` for later tasks/tests to reference as the established naming pattern (Stijlen/Onderwerpen mirror this with `stijl-modal-*`/`onderwerp-modal-*`).

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `tests/components/beheer/SegmentenSection.test.tsx` with:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SegmentenSection } from '@/components/beheer/SegmentenSection';
import type { Segment, Kunstwerk } from '@/components/beheer/materiaalTypes';
import messages from '../../../messages/nl.json';

const logActiviteitMock = vi.fn();

vi.mock('@/lib/useAdminAuth', () => ({
  useAdminAuth: () => ({ user: { uid: 'staff-1', email: 'paul@glassartanddesign.com' } }),
}));

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: (...args: unknown[]) => logActiviteitMock(...args),
  actorFromMedewerker: (user: { uid: string; email: string | null } | null) =>
    user
      ? { id: user.uid, email: user.email ?? 'Onbekend', naam: user.email ?? 'Onbekend' }
      : { id: null, email: 'Onbekend', naam: 'Onbekend' },
}));

beforeEach(() => {
  logActiviteitMock.mockReset();
});

const SEGMENTEN: Segment[] = [
  { id: 'seg-1', omschrijving: 'Hotel' },
  { id: 'seg-2', omschrijving: 'Restaurant' },
];

const KUNSTWERKEN: Kunstwerk[] = [
  {
    id: 'kw-1',
    foto: 'https://example.com/kw-1.jpg',
    naam: 'Restaurantwand',
    kunstenaarId: null,
    segmentIds: ['seg-2'],
    materiaalIds: [],
    maatIds: [],
    omschrijvingNl: 'Restaurantwand',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof SegmentenSection>> = {}) {
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <SegmentenSection
        segmenten={SEGMENTEN}
        kunstwerken={KUNSTWERKEN}
        loadError={null}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onRemove={onRemove}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  return { onAdd, onUpdate, onRemove };
}

describe('SegmentenSection', () => {
  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('segmenten-error')).toHaveTextContent('Kon niet laden.');
    expect(screen.queryByTestId('data-table')).not.toBeInTheDocument();
  });

  it('renders nothing while segmenten is null and there is no error', () => {
    renderSection({ segmenten: null });
    expect(screen.queryByTestId('segmenten-section')).not.toBeInTheDocument();
  });

  it('lists the segmenten in the table', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-seg-1')).toHaveTextContent('Hotel');
    expect(screen.getByTestId('data-table-row-seg-2')).toHaveTextContent('Restaurant');
  });

  it('adds a new segment and closes the modal', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('segmenten-add'));
    fireEvent.change(screen.getByTestId('segment-modal-omschrijving'), { target: { value: 'Wellness' } });
    fireEvent.click(screen.getByTestId('segment-modal-opslaan'));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ omschrijving: 'Wellness' }));
    await waitFor(() => expect(screen.queryByTestId('segment-modal')).not.toBeInTheDocument());
  });

  it('disables Opslaan until omschrijving is filled in', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('segmenten-add'));
    expect(screen.getByTestId('segment-modal-opslaan')).toBeDisabled();
    fireEvent.change(screen.getByTestId('segment-modal-omschrijving'), { target: { value: 'X' } });
    expect(screen.getByTestId('segment-modal-opslaan')).not.toBeDisabled();
  });

  it('opens a row for editing pre-filled, and updates it', async () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-seg-2'));
    expect(screen.getByTestId('segment-modal-omschrijving')).toHaveValue('Restaurant');
    fireEvent.change(screen.getByTestId('segment-modal-omschrijving'), { target: { value: 'Restaurants' } });
    fireEvent.click(screen.getByTestId('segment-modal-opslaan'));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('seg-2', { omschrijving: 'Restaurants' }));
  });

  it('deletes a segment that is not linked to any kunstwerk', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-seg-1'));
    fireEvent.click(screen.getByTestId('segment-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('seg-1'));
    await waitFor(() => expect(screen.queryByTestId('segment-modal')).not.toBeInTheDocument());
  });

  it('shows a delete confirmation with the usage count when the segment is still linked to a kunstwerk', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-seg-2'));
    fireEvent.click(screen.getByTestId('segment-modal-verwijderen'));
    expect(screen.getByTestId('segment-modal-verwijder-bevestiging')).toHaveTextContent(
      'Dit segment wordt nog gebruikt door 1 kunstwerk(en). Weet je zeker dat je het wilt verwijderen?'
    );
    expect(screen.queryByTestId('segment-modal-opslaan')).not.toBeInTheDocument();
    expect(screen.queryByTestId('segment-modal-verwijderen')).not.toBeInTheDocument();
    expect(screen.queryByTestId('segment-modal-omschrijving')).not.toBeInTheDocument();
  });

  it('cancels the delete confirmation and returns to the normal edit view', () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-seg-2'));
    fireEvent.click(screen.getByTestId('segment-modal-verwijderen'));
    fireEvent.click(screen.getByTestId('segment-modal-verwijder-annuleren'));
    expect(screen.getByTestId('segment-modal-omschrijving')).toHaveValue('Restaurant');
    expect(screen.queryByTestId('segment-modal-verwijder-bevestiging')).not.toBeInTheDocument();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('deletes the segment after confirming when it is still linked to a kunstwerk', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-seg-2'));
    fireEvent.click(screen.getByTestId('segment-modal-verwijderen'));
    fireEvent.click(screen.getByTestId('segment-modal-verwijder-bevestigen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('seg-2'));
    await waitFor(() => expect(screen.queryByTestId('segment-modal')).not.toBeInTheDocument());
  });

  it('shows an action error and keeps the modal open when onAdd fails', async () => {
    renderSection({ onAdd: vi.fn().mockResolvedValue(false) });
    fireEvent.click(screen.getByTestId('segmenten-add'));
    fireEvent.change(screen.getByTestId('segment-modal-omschrijving'), { target: { value: 'Wellness' } });
    fireEvent.click(screen.getByTestId('segment-modal-opslaan'));
    expect(await screen.findByTestId('segment-modal-error')).toHaveTextContent(
      'Er is iets misgegaan. Probeer het opnieuw.'
    );
    expect(screen.getByTestId('segment-modal')).toBeInTheDocument();
  });

  it('logs segment_toegevoegd with the logged-in medewerker when adding', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('segmenten-add'));
    fireEvent.change(screen.getByTestId('segment-modal-omschrijving'), { target: { value: 'Wellness' } });
    fireEvent.click(screen.getByTestId('segment-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'segment_toegevoegd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'Wellness'
      )
    );
  });

  it('logs segment_gewijzigd with the logged-in medewerker when editing', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-seg-2'));
    fireEvent.change(screen.getByTestId('segment-modal-omschrijving'), { target: { value: 'Restaurants' } });
    fireEvent.click(screen.getByTestId('segment-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'segment_gewijzigd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'Restaurants'
      )
    );
  });

  it('logs segment_verwijderd with the logged-in medewerker when deleting a segment not in use', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-seg-1'));
    fireEvent.click(screen.getByTestId('segment-modal-verwijderen'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'segment_verwijderd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'Hotel'
      )
    );
  });

  it('does not log when adding fails', async () => {
    const onAdd = vi.fn().mockResolvedValue(false);
    renderSection({ onAdd });
    fireEvent.click(screen.getByTestId('segmenten-add'));
    fireEvent.change(screen.getByTestId('segment-modal-omschrijving'), { target: { value: 'Wellness' } });
    fireEvent.click(screen.getByTestId('segment-modal-opslaan'));
    await screen.findByTestId('segment-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });

  it('shows the toevoegen title when adding and the bewerken title when editing', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('segmenten-add'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Segment toevoegen');
    fireEvent.click(screen.getByTestId('modal-close'));
    fireEvent.click(screen.getByTestId('data-table-row-seg-2'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Segment bewerken');
  });

  it('shows the required-field legend', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('segmenten-add'));
    expect(screen.getByTestId('segment-modal-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run tests/components/beheer/SegmentenSection.test.tsx`
Expected: FAIL — `segment-modal-verwijder-bevestiging` and friends don't exist yet, and the new `kunstwerken` prop isn't read by the component yet, so the confirmation never appears.

- [ ] **Step 3: Add the shared and segment-specific translation keys**

In `messages/nl.json`, change line 374 from:

```json
    "annuleren": "Annuleren",
```

to:

```json
    "annuleren": "Annuleren",
    "verwijderenBevestigen": "Ja, verwijderen",
```

Then change line 495 (`"segmentenVerwijderen": "Verwijderen",`) to:

```json
    "segmentenVerwijderen": "Verwijderen",
    "segmentenVerwijderBevestiging": "Dit segment wordt nog gebruikt door {count} kunstwerk(en). Weet je zeker dat je het wilt verwijderen?",
```

- [ ] **Step 4: Implement the confirmation flow in `SegmentenSection.tsx`**

Replace the full contents of `src/components/beheer/SegmentenSection.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Segment, Kunstwerk } from './materiaalTypes';

interface SegmentenSectionProps {
  segmenten: Segment[] | null;
  kunstwerken: Kunstwerk[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Segment, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Segment, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

type ModalState = { mode: 'add' } | { mode: 'edit'; segment: Segment } | null;

export function SegmentenSection({
  segmenten,
  kunstwerken,
  loadError,
  onAdd,
  onUpdate,
  onRemove,
}: SegmentenSectionProps) {
  const t = useTranslations('beheer');
  const [modalState, setModalState] = useState<ModalState>(null);
  const [omschrijving, setOmschrijving] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingVerwijderCount, setPendingVerwijderCount] = useState<number | null>(null);
  const { user } = useAdminAuth();

  if (loadError) {
    return (
      <p data-testid="segmenten-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (segmenten === null) {
    return null;
  }

  function openAdd() {
    setOmschrijving('');
    setActionError(null);
    setPendingVerwijderCount(null);
    setModalState({ mode: 'add' });
  }

  function openEdit(segment: Segment) {
    setOmschrijving(segment.omschrijving);
    setActionError(null);
    setPendingVerwijderCount(null);
    setModalState({ mode: 'edit', segment });
  }

  function closeModal() {
    setModalState(null);
    setPendingVerwijderCount(null);
  }

  async function handleSave() {
    if (!modalState) return;
    const success =
      modalState.mode === 'add'
        ? await onAdd({ omschrijving })
        : await onUpdate(modalState.segment.id, { omschrijving });
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'segment_toegevoegd' : 'segment_gewijzigd',
        actorFromMedewerker(user),
        omschrijving
      );
      closeModal();
    } else {
      setActionError(t('segmentenActionError'));
    }
  }

  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    if (pendingVerwijderCount === null) {
      const inUseCount = (kunstwerken ?? []).filter((kunstwerk) =>
        kunstwerk.segmentIds.includes(modalState.segment.id)
      ).length;
      if (inUseCount > 0) {
        setPendingVerwijderCount(inUseCount);
        return;
      }
    }
    const success = await onRemove(modalState.segment.id);
    if (success) {
      void logActiviteit('segment_verwijderd', actorFromMedewerker(user), modalState.segment.omschrijving);
      closeModal();
    } else {
      setActionError(t('segmentenActionError'));
    }
  }

  function handleAnnulerenVerwijderen() {
    setPendingVerwijderCount(null);
  }

  const columns: Column<Segment>[] = [{ key: 'omschrijving', label: t('segmentenColOmschrijving') }];

  return (
    <div data-testid="segmenten-section">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={openAdd}
          data-testid="segmenten-add"
          className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
        >
          {t('segmentenToevoegen')}
        </button>
      </div>
      <DataTable<Segment>
        columns={columns}
        rows={segmenten}
        getRowId={(row) => row.id}
        onRowClick={openEdit}
        emptyLabel={t('segmentenEmpty')}
        searchPlaceholder={t('dataTableSearchPlaceholder')}
      />
      <Modal
        isOpen={modalState !== null}
        onClose={closeModal}
        closeLabel={t('modalClose')}
        title={modalState?.mode === 'edit' ? t('segmentenModalTitelBewerken') : t('segmentenModalTitelToevoegen')}
        footerActions={
          modalState?.mode === 'edit' && pendingVerwijderCount !== null ? (
            <>
              <button
                type="button"
                onClick={handleRemove}
                data-testid="segment-modal-verwijder-bevestigen"
                className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('verwijderenBevestigen')}
              </button>
              <button
                type="button"
                onClick={handleAnnulerenVerwijderen}
                data-testid="segment-modal-verwijder-annuleren"
                className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('annuleren')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={!omschrijving}
                data-testid="segment-modal-opslaan"
                className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
              >
                {t('segmentenOpslaan')}
              </button>
              {modalState?.mode === 'edit' && (
                <button
                  type="button"
                  onClick={handleRemove}
                  data-testid="segment-modal-verwijderen"
                  className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
                >
                  {t('segmentenVerwijderen')}
                </button>
              )}
            </>
          )
        }
      >
        <div data-testid="segment-modal" className="flex flex-col gap-2 text-sm text-white/80">
          {pendingVerwijderCount !== null ? (
            <p data-testid="segment-modal-verwijder-bevestiging">
              {t('segmentenVerwijderBevestiging', { count: pendingVerwijderCount })}
            </p>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
                <span>
                  {t('segmentenLabelOmschrijving')}
                  <RequiredMark />
                </span>
                <input
                  type="text"
                  value={omschrijving}
                  onChange={(event) => setOmschrijving(event.target.value)}
                  data-testid="segment-modal-omschrijving"
                  className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
                />
              </label>

              <RequiredLegend testId="segment-modal-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>
            </>
          )}

          {actionError && (
            <p data-testid="segment-modal-error" className="text-xs text-red-400">
              {actionError}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 5: Wire the `kunstwerken` prop in `BeheerShell.tsx`**

In `src/components/beheer/BeheerShell.tsx`, change (around line 366-372):

```tsx
        ) : activeSection === 'segmenten' ? (
          <SegmentenSection
            segmenten={segmenten.items}
            loadError={segmenten.error === 'load' ? t('segmentenLoadError') : null}
            onAdd={segmenten.add}
            onUpdate={segmenten.update}
            onRemove={segmenten.remove}
          />
```

to:

```tsx
        ) : activeSection === 'segmenten' ? (
          <SegmentenSection
            segmenten={segmenten.items}
            kunstwerken={kunstwerken.items}
            loadError={segmenten.error === 'load' ? t('segmentenLoadError') : null}
            onAdd={segmenten.add}
            onUpdate={segmenten.update}
            onRemove={segmenten.remove}
          />
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/SegmentenSection.test.tsx`
Expected: PASS (all tests, including the 3 new ones)

- [ ] **Step 7: Commit**

```bash
git add src/components/beheer/SegmentenSection.tsx src/components/beheer/BeheerShell.tsx messages/nl.json tests/components/beheer/SegmentenSection.test.tsx
git commit -m "feat: confirm segment deletion when still linked to a kunstwerk"
```

---

### Task 2: Stijlen — delete confirmation

**Files:**
- Modify: `src/components/beheer/StijlenSection.tsx`
- Modify: `src/components/beheer/BeheerShell.tsx:374-380` (pass the new `kunstwerken` prop)
- Modify: `messages/nl.json:506` (add `stijlenVerwijderBevestiging` key)
- Test: `tests/components/beheer/StijlenSection.test.tsx`

**Interfaces:**
- Consumes: `Kunstwerk` type from `src/components/beheer/materiaalTypes.ts` — `stijlIds?: string[]` is **optional** on `Kunstwerk` (unlike `segmentIds`), so the in-use check must default it to `[]`. Reuses the shared `verwijderenBevestigen`/`annuleren` translation keys added in Task 1.
- Produces: `StijlenSectionProps.kunstwerken: Kunstwerk[] | null`, `data-testid`s `stijl-modal-verwijder-bevestiging`, `stijl-modal-verwijder-bevestigen`, `stijl-modal-verwijder-annuleren`.

- [ ] **Step 1: Write the failing tests**

Read the current `tests/components/beheer/StijlenSection.test.tsx` first to confirm it matches the structure below (it mirrors `SegmentenSection.test.tsx` 1:1 with `stijl`/`Stijl` substituted for `segment`/`Segment`). Replace its full contents with:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { StijlenSection } from '@/components/beheer/StijlenSection';
import type { Stijl, Kunstwerk } from '@/components/beheer/materiaalTypes';
import messages from '../../../messages/nl.json';

const logActiviteitMock = vi.fn();

vi.mock('@/lib/useAdminAuth', () => ({
  useAdminAuth: () => ({ user: { uid: 'staff-1', email: 'paul@glassartanddesign.com' } }),
}));

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: (...args: unknown[]) => logActiviteitMock(...args),
  actorFromMedewerker: (user: { uid: string; email: string | null } | null) =>
    user
      ? { id: user.uid, email: user.email ?? 'Onbekend', naam: user.email ?? 'Onbekend' }
      : { id: null, email: 'Onbekend', naam: 'Onbekend' },
}));

beforeEach(() => {
  logActiviteitMock.mockReset();
});

const STIJLEN: Stijl[] = [
  { id: 'stijl-1', omschrijving: 'Modern' },
  { id: 'stijl-2', omschrijving: 'Klassiek' },
];

const KUNSTWERKEN: Kunstwerk[] = [
  {
    id: 'kw-1',
    foto: 'https://example.com/kw-1.jpg',
    naam: 'Klassiek paneel',
    kunstenaarId: null,
    segmentIds: [],
    materiaalIds: [],
    maatIds: [],
    stijlIds: ['stijl-2'],
    omschrijvingNl: 'Klassiek paneel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof StijlenSection>> = {}) {
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <StijlenSection
        stijlen={STIJLEN}
        kunstwerken={KUNSTWERKEN}
        loadError={null}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onRemove={onRemove}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  return { onAdd, onUpdate, onRemove };
}

describe('StijlenSection', () => {
  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('stijlen-error')).toHaveTextContent('Kon niet laden.');
  });

  it('renders nothing while stijlen is null and there is no error', () => {
    renderSection({ stijlen: null });
    expect(screen.queryByTestId('stijlen-section')).not.toBeInTheDocument();
  });

  it('lists the stijlen in the table', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-stijl-1')).toHaveTextContent('Modern');
    expect(screen.getByTestId('data-table-row-stijl-2')).toHaveTextContent('Klassiek');
  });

  it('adds a new stijl and closes the modal', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('stijlen-add'));
    fireEvent.change(screen.getByTestId('stijl-modal-omschrijving'), { target: { value: 'Minimalistisch' } });
    fireEvent.click(screen.getByTestId('stijl-modal-opslaan'));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ omschrijving: 'Minimalistisch' }));
    await waitFor(() => expect(screen.queryByTestId('stijl-modal')).not.toBeInTheDocument());
  });

  it('disables Opslaan until omschrijving is filled in', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('stijlen-add'));
    expect(screen.getByTestId('stijl-modal-opslaan')).toBeDisabled();
    fireEvent.change(screen.getByTestId('stijl-modal-omschrijving'), { target: { value: 'X' } });
    expect(screen.getByTestId('stijl-modal-opslaan')).not.toBeDisabled();
  });

  it('opens a row for editing pre-filled, and updates it', async () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-stijl-2'));
    expect(screen.getByTestId('stijl-modal-omschrijving')).toHaveValue('Klassiek');
    fireEvent.change(screen.getByTestId('stijl-modal-omschrijving'), { target: { value: 'Klassiek design' } });
    fireEvent.click(screen.getByTestId('stijl-modal-opslaan'));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('stijl-2', { omschrijving: 'Klassiek design' }));
  });

  it('deletes a stijl that is not linked to any kunstwerk', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-stijl-1'));
    fireEvent.click(screen.getByTestId('stijl-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('stijl-1'));
    await waitFor(() => expect(screen.queryByTestId('stijl-modal')).not.toBeInTheDocument());
  });

  it('shows a delete confirmation with the usage count when the stijl is still linked to a kunstwerk', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-stijl-2'));
    fireEvent.click(screen.getByTestId('stijl-modal-verwijderen'));
    expect(screen.getByTestId('stijl-modal-verwijder-bevestiging')).toHaveTextContent(
      'Deze stijl wordt nog gebruikt door 1 kunstwerk(en). Weet je zeker dat je het wilt verwijderen?'
    );
    expect(screen.queryByTestId('stijl-modal-opslaan')).not.toBeInTheDocument();
    expect(screen.queryByTestId('stijl-modal-verwijderen')).not.toBeInTheDocument();
    expect(screen.queryByTestId('stijl-modal-omschrijving')).not.toBeInTheDocument();
  });

  it('cancels the delete confirmation and returns to the normal edit view', () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-stijl-2'));
    fireEvent.click(screen.getByTestId('stijl-modal-verwijderen'));
    fireEvent.click(screen.getByTestId('stijl-modal-verwijder-annuleren'));
    expect(screen.getByTestId('stijl-modal-omschrijving')).toHaveValue('Klassiek');
    expect(screen.queryByTestId('stijl-modal-verwijder-bevestiging')).not.toBeInTheDocument();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('deletes the stijl after confirming when it is still linked to a kunstwerk', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-stijl-2'));
    fireEvent.click(screen.getByTestId('stijl-modal-verwijderen'));
    fireEvent.click(screen.getByTestId('stijl-modal-verwijder-bevestigen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('stijl-2'));
    await waitFor(() => expect(screen.queryByTestId('stijl-modal')).not.toBeInTheDocument());
  });

  it('shows an action error and keeps the modal open when onAdd fails', async () => {
    renderSection({ onAdd: vi.fn().mockResolvedValue(false) });
    fireEvent.click(screen.getByTestId('stijlen-add'));
    fireEvent.change(screen.getByTestId('stijl-modal-omschrijving'), { target: { value: 'Minimalistisch' } });
    fireEvent.click(screen.getByTestId('stijl-modal-opslaan'));
    expect(await screen.findByTestId('stijl-modal-error')).toHaveTextContent(
      'Er is iets misgegaan. Probeer het opnieuw.'
    );
    expect(screen.getByTestId('stijl-modal')).toBeInTheDocument();
  });

  it('logs stijl_toegevoegd with the logged-in medewerker when adding', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('stijlen-add'));
    fireEvent.change(screen.getByTestId('stijl-modal-omschrijving'), { target: { value: 'Minimalistisch' } });
    fireEvent.click(screen.getByTestId('stijl-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('stijl_toegevoegd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('logs stijl_gewijzigd with the logged-in medewerker when editing', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-stijl-2'));
    fireEvent.change(screen.getByTestId('stijl-modal-omschrijving'), { target: { value: 'Klassiek design' } });
    fireEvent.click(screen.getByTestId('stijl-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('stijl_gewijzigd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('logs stijl_verwijderd with the logged-in medewerker when deleting a stijl not in use', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-stijl-1'));
    fireEvent.click(screen.getByTestId('stijl-modal-verwijderen'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('stijl_verwijderd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('does not log when adding fails', async () => {
    const onAdd = vi.fn().mockResolvedValue(false);
    renderSection({ onAdd });
    fireEvent.click(screen.getByTestId('stijlen-add'));
    fireEvent.change(screen.getByTestId('stijl-modal-omschrijving'), { target: { value: 'Minimalistisch' } });
    fireEvent.click(screen.getByTestId('stijl-modal-opslaan'));
    await screen.findByTestId('stijl-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });

  it('shows the toevoegen title when adding and the bewerken title when editing', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('stijlen-add'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Stijl toevoegen');
    fireEvent.click(screen.getByTestId('modal-close'));
    fireEvent.click(screen.getByTestId('data-table-row-stijl-2'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Stijl bewerken');
  });

  it('shows the required-field legend', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('stijlen-add'));
    expect(screen.getByTestId('stijl-modal-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run tests/components/beheer/StijlenSection.test.tsx`
Expected: FAIL — `stijl-modal-verwijder-bevestiging` and friends don't exist yet.

- [ ] **Step 3: Add the stijl-specific translation key**

In `messages/nl.json`, change line 506 (`"stijlenVerwijderen": "Verwijderen",`) to:

```json
    "stijlenVerwijderen": "Verwijderen",
    "stijlenVerwijderBevestiging": "Deze stijl wordt nog gebruikt door {count} kunstwerk(en). Weet je zeker dat je het wilt verwijderen?",
```

- [ ] **Step 4: Implement the confirmation flow in `StijlenSection.tsx`**

Replace the full contents of `src/components/beheer/StijlenSection.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Stijl, Kunstwerk } from './materiaalTypes';

interface StijlenSectionProps {
  stijlen: Stijl[] | null;
  kunstwerken: Kunstwerk[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Stijl, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Stijl, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

type ModalState = { mode: 'add' } | { mode: 'edit'; stijl: Stijl } | null;

export function StijlenSection({ stijlen, kunstwerken, loadError, onAdd, onUpdate, onRemove }: StijlenSectionProps) {
  const t = useTranslations('beheer');
  const [modalState, setModalState] = useState<ModalState>(null);
  const [omschrijving, setOmschrijving] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingVerwijderCount, setPendingVerwijderCount] = useState<number | null>(null);
  const { user } = useAdminAuth();

  if (loadError) {
    return (
      <p data-testid="stijlen-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (stijlen === null) {
    return null;
  }

  function openAdd() {
    setOmschrijving('');
    setActionError(null);
    setPendingVerwijderCount(null);
    setModalState({ mode: 'add' });
  }

  function openEdit(stijl: Stijl) {
    setOmschrijving(stijl.omschrijving);
    setActionError(null);
    setPendingVerwijderCount(null);
    setModalState({ mode: 'edit', stijl });
  }

  function closeModal() {
    setModalState(null);
    setPendingVerwijderCount(null);
  }

  async function handleSave() {
    if (!modalState) return;
    const success =
      modalState.mode === 'add' ? await onAdd({ omschrijving }) : await onUpdate(modalState.stijl.id, { omschrijving });
    if (success) {
      void logActiviteit(modalState.mode === 'add' ? 'stijl_toegevoegd' : 'stijl_gewijzigd', actorFromMedewerker(user));
      closeModal();
    } else {
      setActionError(t('stijlenActionError'));
    }
  }

  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    if (pendingVerwijderCount === null) {
      const inUseCount = (kunstwerken ?? []).filter((kunstwerk) =>
        (kunstwerk.stijlIds ?? []).includes(modalState.stijl.id)
      ).length;
      if (inUseCount > 0) {
        setPendingVerwijderCount(inUseCount);
        return;
      }
    }
    const success = await onRemove(modalState.stijl.id);
    if (success) {
      void logActiviteit('stijl_verwijderd', actorFromMedewerker(user));
      closeModal();
    } else {
      setActionError(t('stijlenActionError'));
    }
  }

  function handleAnnulerenVerwijderen() {
    setPendingVerwijderCount(null);
  }

  const columns: Column<Stijl>[] = [{ key: 'omschrijving', label: t('stijlenColOmschrijving') }];

  return (
    <div data-testid="stijlen-section">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={openAdd}
          data-testid="stijlen-add"
          className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
        >
          {t('stijlenToevoegen')}
        </button>
      </div>
      <DataTable<Stijl>
        columns={columns}
        rows={stijlen}
        getRowId={(row) => row.id}
        onRowClick={openEdit}
        emptyLabel={t('stijlenEmpty')}
        searchPlaceholder={t('dataTableSearchPlaceholder')}
      />
      <Modal
        isOpen={modalState !== null}
        onClose={closeModal}
        closeLabel={t('modalClose')}
        title={modalState?.mode === 'edit' ? t('stijlenModalTitelBewerken') : t('stijlenModalTitelToevoegen')}
        footerActions={
          modalState?.mode === 'edit' && pendingVerwijderCount !== null ? (
            <>
              <button
                type="button"
                onClick={handleRemove}
                data-testid="stijl-modal-verwijder-bevestigen"
                className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('verwijderenBevestigen')}
              </button>
              <button
                type="button"
                onClick={handleAnnulerenVerwijderen}
                data-testid="stijl-modal-verwijder-annuleren"
                className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('annuleren')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={!omschrijving}
                data-testid="stijl-modal-opslaan"
                className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
              >
                {t('stijlenOpslaan')}
              </button>
              {modalState?.mode === 'edit' && (
                <button
                  type="button"
                  onClick={handleRemove}
                  data-testid="stijl-modal-verwijderen"
                  className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
                >
                  {t('stijlenVerwijderen')}
                </button>
              )}
            </>
          )
        }
      >
        <div data-testid="stijl-modal" className="flex flex-col gap-2 text-sm text-white/80">
          {pendingVerwijderCount !== null ? (
            <p data-testid="stijl-modal-verwijder-bevestiging">
              {t('stijlenVerwijderBevestiging', { count: pendingVerwijderCount })}
            </p>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
                <span>
                  {t('stijlenLabelOmschrijving')}
                  <RequiredMark />
                </span>
                <input
                  type="text"
                  value={omschrijving}
                  onChange={(event) => setOmschrijving(event.target.value)}
                  data-testid="stijl-modal-omschrijving"
                  className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
                />
              </label>

              <RequiredLegend testId="stijl-modal-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>
            </>
          )}

          {actionError && (
            <p data-testid="stijl-modal-error" className="text-xs text-red-400">
              {actionError}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 5: Wire the `kunstwerken` prop in `BeheerShell.tsx`**

Change (around line 374-380):

```tsx
        ) : activeSection === 'stijlen' ? (
          <StijlenSection
            stijlen={stijlen.items}
            loadError={stijlen.error === 'load' ? t('stijlenLoadError') : null}
            onAdd={stijlen.add}
            onUpdate={stijlen.update}
            onRemove={stijlen.remove}
          />
```

to:

```tsx
        ) : activeSection === 'stijlen' ? (
          <StijlenSection
            stijlen={stijlen.items}
            kunstwerken={kunstwerken.items}
            loadError={stijlen.error === 'load' ? t('stijlenLoadError') : null}
            onAdd={stijlen.add}
            onUpdate={stijlen.update}
            onRemove={stijlen.remove}
          />
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/StijlenSection.test.tsx`
Expected: PASS (all tests, including the 3 new ones)

- [ ] **Step 7: Commit**

```bash
git add src/components/beheer/StijlenSection.tsx src/components/beheer/BeheerShell.tsx messages/nl.json tests/components/beheer/StijlenSection.test.tsx
git commit -m "feat: confirm stijl deletion when still linked to a kunstwerk"
```

---

### Task 3: Onderwerpen — delete confirmation

**Files:**
- Modify: `src/components/beheer/OnderwerpenSection.tsx`
- Modify: `src/components/beheer/BeheerShell.tsx:382-388` (pass the new `kunstwerken` prop)
- Modify: `messages/nl.json:517` (add `onderwerpenVerwijderBevestiging` key)
- Test: `tests/components/beheer/OnderwerpenSection.test.tsx`

**Interfaces:**
- Consumes: `Kunstwerk` type — `onderwerpIds?: string[]` is **optional**, same as `stijlIds` in Task 2. Reuses the shared `verwijderenBevestigen`/`annuleren` translation keys added in Task 1.
- Produces: `OnderwerpenSectionProps.kunstwerken: Kunstwerk[] | null`, `data-testid`s `onderwerp-modal-verwijder-bevestiging`, `onderwerp-modal-verwijder-bevestigen`, `onderwerp-modal-verwijder-annuleren`.

- [ ] **Step 1: Write the failing tests**

Read the current `tests/components/beheer/OnderwerpenSection.test.tsx` first to confirm it matches the structure below. Replace its full contents with:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { OnderwerpenSection } from '@/components/beheer/OnderwerpenSection';
import type { Onderwerp, Kunstwerk } from '@/components/beheer/materiaalTypes';
import messages from '../../../messages/nl.json';

const logActiviteitMock = vi.fn();

vi.mock('@/lib/useAdminAuth', () => ({
  useAdminAuth: () => ({ user: { uid: 'staff-1', email: 'paul@glassartanddesign.com' } }),
}));

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: (...args: unknown[]) => logActiviteitMock(...args),
  actorFromMedewerker: (user: { uid: string; email: string | null } | null) =>
    user
      ? { id: user.uid, email: user.email ?? 'Onbekend', naam: user.email ?? 'Onbekend' }
      : { id: null, email: 'Onbekend', naam: 'Onbekend' },
}));

beforeEach(() => {
  logActiviteitMock.mockReset();
});

const ONDERWERPEN: Onderwerp[] = [
  { id: 'ond-1', omschrijving: 'Abstract' },
  { id: 'ond-2', omschrijving: 'Landschap' },
];

const KUNSTWERKEN: Kunstwerk[] = [
  {
    id: 'kw-1',
    foto: 'https://example.com/kw-1.jpg',
    naam: 'Landschapspaneel',
    kunstenaarId: null,
    segmentIds: [],
    materiaalIds: [],
    maatIds: [],
    onderwerpIds: ['ond-2'],
    omschrijvingNl: 'Landschapspaneel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof OnderwerpenSection>> = {}) {
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <OnderwerpenSection
        onderwerpen={ONDERWERPEN}
        kunstwerken={KUNSTWERKEN}
        loadError={null}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onRemove={onRemove}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  return { onAdd, onUpdate, onRemove };
}

describe('OnderwerpenSection', () => {
  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('onderwerpen-error')).toHaveTextContent('Kon niet laden.');
  });

  it('renders nothing while onderwerpen is null and there is no error', () => {
    renderSection({ onderwerpen: null });
    expect(screen.queryByTestId('onderwerpen-section')).not.toBeInTheDocument();
  });

  it('lists the onderwerpen in the table', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-ond-1')).toHaveTextContent('Abstract');
    expect(screen.getByTestId('data-table-row-ond-2')).toHaveTextContent('Landschap');
  });

  it('adds a new onderwerp and closes the modal', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('onderwerpen-add'));
    fireEvent.change(screen.getByTestId('onderwerp-modal-omschrijving'), { target: { value: 'Portret' } });
    fireEvent.click(screen.getByTestId('onderwerp-modal-opslaan'));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ omschrijving: 'Portret' }));
    await waitFor(() => expect(screen.queryByTestId('onderwerp-modal')).not.toBeInTheDocument());
  });

  it('disables Opslaan until omschrijving is filled in', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('onderwerpen-add'));
    expect(screen.getByTestId('onderwerp-modal-opslaan')).toBeDisabled();
    fireEvent.change(screen.getByTestId('onderwerp-modal-omschrijving'), { target: { value: 'X' } });
    expect(screen.getByTestId('onderwerp-modal-opslaan')).not.toBeDisabled();
  });

  it('opens a row for editing pre-filled, and updates it', async () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ond-2'));
    expect(screen.getByTestId('onderwerp-modal-omschrijving')).toHaveValue('Landschap');
    fireEvent.change(screen.getByTestId('onderwerp-modal-omschrijving'), { target: { value: 'Landschappen' } });
    fireEvent.click(screen.getByTestId('onderwerp-modal-opslaan'));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('ond-2', { omschrijving: 'Landschappen' }));
  });

  it('deletes an onderwerp that is not linked to any kunstwerk', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ond-1'));
    fireEvent.click(screen.getByTestId('onderwerp-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('ond-1'));
    await waitFor(() => expect(screen.queryByTestId('onderwerp-modal')).not.toBeInTheDocument());
  });

  it('shows a delete confirmation with the usage count when the onderwerp is still linked to a kunstwerk', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ond-2'));
    fireEvent.click(screen.getByTestId('onderwerp-modal-verwijderen'));
    expect(screen.getByTestId('onderwerp-modal-verwijder-bevestiging')).toHaveTextContent(
      'Dit onderwerp wordt nog gebruikt door 1 kunstwerk(en). Weet je zeker dat je het wilt verwijderen?'
    );
    expect(screen.queryByTestId('onderwerp-modal-opslaan')).not.toBeInTheDocument();
    expect(screen.queryByTestId('onderwerp-modal-verwijderen')).not.toBeInTheDocument();
    expect(screen.queryByTestId('onderwerp-modal-omschrijving')).not.toBeInTheDocument();
  });

  it('cancels the delete confirmation and returns to the normal edit view', () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ond-2'));
    fireEvent.click(screen.getByTestId('onderwerp-modal-verwijderen'));
    fireEvent.click(screen.getByTestId('onderwerp-modal-verwijder-annuleren'));
    expect(screen.getByTestId('onderwerp-modal-omschrijving')).toHaveValue('Landschap');
    expect(screen.queryByTestId('onderwerp-modal-verwijder-bevestiging')).not.toBeInTheDocument();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('deletes the onderwerp after confirming when it is still linked to a kunstwerk', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ond-2'));
    fireEvent.click(screen.getByTestId('onderwerp-modal-verwijderen'));
    fireEvent.click(screen.getByTestId('onderwerp-modal-verwijder-bevestigen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('ond-2'));
    await waitFor(() => expect(screen.queryByTestId('onderwerp-modal')).not.toBeInTheDocument());
  });

  it('shows an action error and keeps the modal open when onAdd fails', async () => {
    renderSection({ onAdd: vi.fn().mockResolvedValue(false) });
    fireEvent.click(screen.getByTestId('onderwerpen-add'));
    fireEvent.change(screen.getByTestId('onderwerp-modal-omschrijving'), { target: { value: 'Portret' } });
    fireEvent.click(screen.getByTestId('onderwerp-modal-opslaan'));
    expect(await screen.findByTestId('onderwerp-modal-error')).toHaveTextContent(
      'Er is iets misgegaan. Probeer het opnieuw.'
    );
    expect(screen.getByTestId('onderwerp-modal')).toBeInTheDocument();
  });

  it('logs onderwerp_toegevoegd with the logged-in medewerker when adding', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('onderwerpen-add'));
    fireEvent.change(screen.getByTestId('onderwerp-modal-omschrijving'), { target: { value: 'Portret' } });
    fireEvent.click(screen.getByTestId('onderwerp-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('onderwerp_toegevoegd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('logs onderwerp_gewijzigd with the logged-in medewerker when editing', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ond-2'));
    fireEvent.change(screen.getByTestId('onderwerp-modal-omschrijving'), { target: { value: 'Landschappen' } });
    fireEvent.click(screen.getByTestId('onderwerp-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('onderwerp_gewijzigd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('logs onderwerp_verwijderd with the logged-in medewerker when deleting an onderwerp not in use', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ond-1'));
    fireEvent.click(screen.getByTestId('onderwerp-modal-verwijderen'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('onderwerp_verwijderd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('does not log when adding fails', async () => {
    const onAdd = vi.fn().mockResolvedValue(false);
    renderSection({ onAdd });
    fireEvent.click(screen.getByTestId('onderwerpen-add'));
    fireEvent.change(screen.getByTestId('onderwerp-modal-omschrijving'), { target: { value: 'Portret' } });
    fireEvent.click(screen.getByTestId('onderwerp-modal-opslaan'));
    await screen.findByTestId('onderwerp-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });

  it('shows the toevoegen title when adding and the bewerken title when editing', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('onderwerpen-add'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Onderwerp toevoegen');
    fireEvent.click(screen.getByTestId('modal-close'));
    fireEvent.click(screen.getByTestId('data-table-row-ond-2'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Onderwerp bewerken');
  });

  it('shows the required-field legend', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('onderwerpen-add'));
    expect(screen.getByTestId('onderwerp-modal-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run tests/components/beheer/OnderwerpenSection.test.tsx`
Expected: FAIL — `onderwerp-modal-verwijder-bevestiging` and friends don't exist yet.

- [ ] **Step 3: Add the onderwerp-specific translation key**

In `messages/nl.json`, change line 517 (`"onderwerpenVerwijderen": "Verwijderen",`) to:

```json
    "onderwerpenVerwijderen": "Verwijderen",
    "onderwerpenVerwijderBevestiging": "Dit onderwerp wordt nog gebruikt door {count} kunstwerk(en). Weet je zeker dat je het wilt verwijderen?",
```

- [ ] **Step 4: Implement the confirmation flow in `OnderwerpenSection.tsx`**

Replace the full contents of `src/components/beheer/OnderwerpenSection.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Onderwerp, Kunstwerk } from './materiaalTypes';

interface OnderwerpenSectionProps {
  onderwerpen: Onderwerp[] | null;
  kunstwerken: Kunstwerk[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Onderwerp, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Onderwerp, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

type ModalState = { mode: 'add' } | { mode: 'edit'; onderwerp: Onderwerp } | null;

export function OnderwerpenSection({
  onderwerpen,
  kunstwerken,
  loadError,
  onAdd,
  onUpdate,
  onRemove,
}: OnderwerpenSectionProps) {
  const t = useTranslations('beheer');
  const [modalState, setModalState] = useState<ModalState>(null);
  const [omschrijving, setOmschrijving] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingVerwijderCount, setPendingVerwijderCount] = useState<number | null>(null);
  const { user } = useAdminAuth();

  if (loadError) {
    return (
      <p data-testid="onderwerpen-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (onderwerpen === null) {
    return null;
  }

  function openAdd() {
    setOmschrijving('');
    setActionError(null);
    setPendingVerwijderCount(null);
    setModalState({ mode: 'add' });
  }

  function openEdit(onderwerp: Onderwerp) {
    setOmschrijving(onderwerp.omschrijving);
    setActionError(null);
    setPendingVerwijderCount(null);
    setModalState({ mode: 'edit', onderwerp });
  }

  function closeModal() {
    setModalState(null);
    setPendingVerwijderCount(null);
  }

  async function handleSave() {
    if (!modalState) return;
    const success =
      modalState.mode === 'add'
        ? await onAdd({ omschrijving })
        : await onUpdate(modalState.onderwerp.id, { omschrijving });
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'onderwerp_toegevoegd' : 'onderwerp_gewijzigd',
        actorFromMedewerker(user)
      );
      closeModal();
    } else {
      setActionError(t('onderwerpenActionError'));
    }
  }

  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    if (pendingVerwijderCount === null) {
      const inUseCount = (kunstwerken ?? []).filter((kunstwerk) =>
        (kunstwerk.onderwerpIds ?? []).includes(modalState.onderwerp.id)
      ).length;
      if (inUseCount > 0) {
        setPendingVerwijderCount(inUseCount);
        return;
      }
    }
    const success = await onRemove(modalState.onderwerp.id);
    if (success) {
      void logActiviteit('onderwerp_verwijderd', actorFromMedewerker(user));
      closeModal();
    } else {
      setActionError(t('onderwerpenActionError'));
    }
  }

  function handleAnnulerenVerwijderen() {
    setPendingVerwijderCount(null);
  }

  const columns: Column<Onderwerp>[] = [{ key: 'omschrijving', label: t('onderwerpenColOmschrijving') }];

  return (
    <div data-testid="onderwerpen-section">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={openAdd}
          data-testid="onderwerpen-add"
          className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
        >
          {t('onderwerpenToevoegen')}
        </button>
      </div>
      <DataTable<Onderwerp>
        columns={columns}
        rows={onderwerpen}
        getRowId={(row) => row.id}
        onRowClick={openEdit}
        emptyLabel={t('onderwerpenEmpty')}
        searchPlaceholder={t('dataTableSearchPlaceholder')}
      />
      <Modal
        isOpen={modalState !== null}
        onClose={closeModal}
        closeLabel={t('modalClose')}
        title={modalState?.mode === 'edit' ? t('onderwerpenModalTitelBewerken') : t('onderwerpenModalTitelToevoegen')}
        footerActions={
          modalState?.mode === 'edit' && pendingVerwijderCount !== null ? (
            <>
              <button
                type="button"
                onClick={handleRemove}
                data-testid="onderwerp-modal-verwijder-bevestigen"
                className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('verwijderenBevestigen')}
              </button>
              <button
                type="button"
                onClick={handleAnnulerenVerwijderen}
                data-testid="onderwerp-modal-verwijder-annuleren"
                className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('annuleren')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={!omschrijving}
                data-testid="onderwerp-modal-opslaan"
                className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
              >
                {t('onderwerpenOpslaan')}
              </button>
              {modalState?.mode === 'edit' && (
                <button
                  type="button"
                  onClick={handleRemove}
                  data-testid="onderwerp-modal-verwijderen"
                  className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
                >
                  {t('onderwerpenVerwijderen')}
                </button>
              )}
            </>
          )
        }
      >
        <div data-testid="onderwerp-modal" className="flex flex-col gap-2 text-sm text-white/80">
          {pendingVerwijderCount !== null ? (
            <p data-testid="onderwerp-modal-verwijder-bevestiging">
              {t('onderwerpenVerwijderBevestiging', { count: pendingVerwijderCount })}
            </p>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
                <span>
                  {t('onderwerpenLabelOmschrijving')}
                  <RequiredMark />
                </span>
                <input
                  type="text"
                  value={omschrijving}
                  onChange={(event) => setOmschrijving(event.target.value)}
                  data-testid="onderwerp-modal-omschrijving"
                  className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
                />
              </label>

              <RequiredLegend testId="onderwerp-modal-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>
            </>
          )}

          {actionError && (
            <p data-testid="onderwerp-modal-error" className="text-xs text-red-400">
              {actionError}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 5: Wire the `kunstwerken` prop in `BeheerShell.tsx`**

Change (around line 382-388):

```tsx
        ) : activeSection === 'onderwerpen' ? (
          <OnderwerpenSection
            onderwerpen={onderwerpen.items}
            loadError={onderwerpen.error === 'load' ? t('onderwerpenLoadError') : null}
            onAdd={onderwerpen.add}
            onUpdate={onderwerpen.update}
            onRemove={onderwerpen.remove}
          />
```

to:

```tsx
        ) : activeSection === 'onderwerpen' ? (
          <OnderwerpenSection
            onderwerpen={onderwerpen.items}
            kunstwerken={kunstwerken.items}
            loadError={onderwerpen.error === 'load' ? t('onderwerpenLoadError') : null}
            onAdd={onderwerpen.add}
            onUpdate={onderwerpen.update}
            onRemove={onderwerpen.remove}
          />
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/OnderwerpenSection.test.tsx`
Expected: PASS (all tests, including the 3 new ones)

- [ ] **Step 7: Full regression check**

Run: `npx vitest run tests/components/beheer/SegmentenSection.test.tsx tests/components/beheer/StijlenSection.test.tsx tests/components/beheer/OnderwerpenSection.test.tsx tests/components/beheer/BeheerShell.test.tsx`
Expected: PASS — confirms all three sections and the shell that wires them together still work as one whole.

- [ ] **Step 8: Commit**

```bash
git add src/components/beheer/OnderwerpenSection.tsx src/components/beheer/BeheerShell.tsx messages/nl.json tests/components/beheer/OnderwerpenSection.test.tsx
git commit -m "feat: confirm onderwerp deletion when still linked to a kunstwerk"
```
