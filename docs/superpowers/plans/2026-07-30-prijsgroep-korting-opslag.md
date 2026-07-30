# Prijsgroep korting/opslag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Prijsgroep have either a kortingspercentage or an opslagpercentage (exactly one, never both, never neither), enforced in the beheer UI and at the database level.

**Architecture:** `prijsgroepen.kortingspercentage` becomes nullable and a new nullable `opslagpercentage` column is added, with a MariaDB `CHECK` constraint enforcing exactly one is non-null. The beheer form collapses the two into one Type select (Korting/Opslag) + one shared Percentage input, so the UI can never construct an invalid combination. No API route or pricing-logic changes — `prijsgroepen` keeps going through the generic `[resource]` catch-all route.

**Tech Stack:** Next.js 14 App Router, TypeScript, MariaDB 11.8 (via `mysql2`), Vitest + React Testing Library, `next-intl`.

## Global Constraints

- Tests run against the real shared staging MariaDB database (`dv137864_staging` on `h64.mijn.host`) — never a blanket `DELETE`/`TRUNCATE`, only scoped cleanup of rows a test itself created (see `CLAUDE.md`).
- `db/schema.sql` is the source of truth for the schema; any change to it must be paired with a replayable file under `db/migrations/`.
- Beheer (`src/components/beheer/**`) has no i18n beyond `messages/nl.json` — do not touch `en.json`/`de.json`/`fr.json`.
- The spec is `docs/superpowers/specs/2026-07-30-prijsgroep-korting-opslag-design.md` — re-read it if a task here seems ambiguous.

---

### Task 1: Database schema + migration

**Files:**
- Modify: `db/schema.sql:90-94`
- Create: `db/migrations/2026-07-30-prijsgroep-korting-opslag.sql`

**Interfaces:**
- Produces: `prijsgroepen.kortingspercentage DECIMAL(5,2) NULL`, `prijsgroepen.opslagpercentage DECIMAL(5,2) NULL`, constraint `chk_prijsgroep_korting_xor_opslag` — later tasks (the TypeScript type in Task 2) rely on both columns existing and being nullable.

- [ ] **Step 1: Update `db/schema.sql`**

Current (`db/schema.sql:90-94`):

```sql
CREATE TABLE prijsgroepen (
  id CHAR(36) PRIMARY KEY,
  naam VARCHAR(255) NOT NULL,
  kortingspercentage DECIMAL(5,2) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Replace with:

```sql
CREATE TABLE prijsgroepen (
  id CHAR(36) PRIMARY KEY,
  naam VARCHAR(255) NOT NULL,
  kortingspercentage DECIMAL(5,2) NULL,
  opslagpercentage DECIMAL(5,2) NULL,
  CONSTRAINT chk_prijsgroep_korting_xor_opslag
    CHECK ((kortingspercentage IS NULL) <> (opslagpercentage IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 2: Write the migration file**

Create `db/migrations/2026-07-30-prijsgroep-korting-opslag.sql`:

```sql
-- Migration for prijsgroep-korting-opslag (2026-07-30)
-- Run once, in order, against a database still on the pre-migration schema.
ALTER TABLE prijsgroepen MODIFY kortingspercentage DECIMAL(5,2) NULL;
ALTER TABLE prijsgroepen ADD COLUMN opslagpercentage DECIMAL(5,2) NULL AFTER kortingspercentage;
ALTER TABLE prijsgroepen
  ADD CONSTRAINT chk_prijsgroep_korting_xor_opslag
  CHECK ((kortingspercentage IS NULL) <> (opslagpercentage IS NULL));
```

Existing rows all have a non-null `kortingspercentage` (even the ones that are `0`) and a `NULL` `opslagpercentage` after `ADD COLUMN` — this already satisfies the new constraint, so no data backfill is needed.

- [ ] **Step 3: Apply the migration to the shared staging database**

**Stop and ask the user to confirm before running this** — it's a schema change to the real shared staging database (`dv137864_staging` on `h64.mijn.host`), used by every concurrent session's tests, not a local/throwaway DB.

Once confirmed, run it with a one-off script (there is no migration runner in this repo — `package.json` has no `db:migrate` script):

```bash
node -e "
require('dotenv').config({ path: '.env.local' });
const mysql = require('mysql2/promise');
const fs = require('fs');
(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });
  const sql = fs.readFileSync('db/migrations/2026-07-30-prijsgroep-korting-opslag.sql', 'utf8');
  await conn.query(sql);
  console.log('migration applied');
  await conn.end();
})();
"
```

- [ ] **Step 4: Verify the migration applied correctly**

```bash
node -e "
require('dotenv').config({ path: '.env.local' });
const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const [rows] = await conn.query('DESCRIBE prijsgroepen');
  console.log(rows);
  await conn.end();
})();
"
```

Expected: a row for `kortingspercentage` with `Null: YES`, a new row for `opslagpercentage` with `Null: YES`. (MariaDB doesn't list `CHECK` constraints in `DESCRIBE`; trust step 3's success — it would have thrown if the constraint syntax were rejected.)

- [ ] **Step 5: Commit**

```bash
git add db/schema.sql db/migrations/2026-07-30-prijsgroep-korting-opslag.sql
git commit -m "feat: allow prijsgroep opslagpercentage as an alternative to kortingspercentage"
```

---

### Task 2: Add the new i18n keys

**Files:**
- Modify: `messages/nl.json:572-581`

**Interfaces:**
- Produces: translation keys `prijsgroepenColType`, `prijsgroepenColPercentage`, `prijsgroepenLabelType`, `prijsgroepenTypeKorting`, `prijsgroepenTypeOpslag`, `prijsgroepenLabelPercentage` — Task 3 references these via `t('...')`.

- [ ] **Step 1: Add the new keys**

Current (`messages/nl.json:572-581`):

```json
    "prijsgroepenLoadError": "Kon de prijsgroepen niet laden. Probeer de pagina te verversen.",
    "prijsgroepenActionError": "Er is iets misgegaan. Probeer het opnieuw.",
    "prijsgroepenEmpty": "Geen prijsgroepen gevonden.",
    "prijsgroepenColNaam": "Naam",
    "prijsgroepenColKortingspercentage": "Kortingspercentage",
    "prijsgroepenLabelNaam": "Naam",
    "prijsgroepenLabelKortingspercentage": "Kortingspercentage",
    "prijsgroepenToevoegen": "Prijsgroep toevoegen",
    "prijsgroepenOpslaan": "Opslaan",
    "prijsgroepenVerwijderen": "Verwijderen",
```

Replace with (keep the old `prijsgroepenColKortingspercentage`/`prijsgroepenLabelKortingspercentage` keys for now — Task 3 removes them in the same change that stops referencing them, so nothing is ever left dangling mid-task):

```json
    "prijsgroepenLoadError": "Kon de prijsgroepen niet laden. Probeer de pagina te verversen.",
    "prijsgroepenActionError": "Er is iets misgegaan. Probeer het opnieuw.",
    "prijsgroepenEmpty": "Geen prijsgroepen gevonden.",
    "prijsgroepenColNaam": "Naam",
    "prijsgroepenColKortingspercentage": "Kortingspercentage",
    "prijsgroepenColType": "Type",
    "prijsgroepenColPercentage": "Percentage",
    "prijsgroepenLabelNaam": "Naam",
    "prijsgroepenLabelKortingspercentage": "Kortingspercentage",
    "prijsgroepenLabelType": "Type",
    "prijsgroepenTypeKorting": "Korting",
    "prijsgroepenTypeOpslag": "Opslag",
    "prijsgroepenLabelPercentage": "Percentage",
    "prijsgroepenToevoegen": "Prijsgroep toevoegen",
    "prijsgroepenOpslaan": "Opslaan",
    "prijsgroepenVerwijderen": "Verwijderen",
```

- [ ] **Step 2: Verify the JSON is valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('messages/nl.json', 'utf8')); console.log('valid')"
```

Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add messages/nl.json
git commit -m "feat: add prijsgroep type/percentage translation keys"
```

---

### Task 3: Prijsgroep type + PrijsgroepenSection UI

**Files:**
- Modify: `src/components/beheer/materiaalTypes.ts:70-74`
- Modify: `src/components/beheer/PrijsgroepenSection.tsx`
- Modify: `tests/components/beheer/PrijsgroepenSection.test.tsx`

**Interfaces:**
- Consumes: i18n keys from Task 2; `chk_prijsgroep_korting_xor_opslag`-backed columns from Task 1.
- Produces: `interface Prijsgroep { id: string; naam: string; kortingspercentage: number | null; opslagpercentage: number | null }` — Task 4 fixtures must satisfy this shape.

- [ ] **Step 1: Update the `Prijsgroep` type**

Current (`src/components/beheer/materiaalTypes.ts:70-74`):

```ts
export interface Prijsgroep {
  id: string;
  naam: string;
  kortingspercentage: number;
}
```

Replace with:

```ts
export interface Prijsgroep {
  id: string;
  naam: string;
  kortingspercentage: number | null;
  opslagpercentage: number | null;
}
```

- [ ] **Step 2: Rewrite the failing test file**

Replace `tests/components/beheer/PrijsgroepenSection.test.tsx` entirely with:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { PrijsgroepenSection } from '@/components/beheer/PrijsgroepenSection';
import type { Prijsgroep } from '@/components/beheer/materiaalTypes';
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

const PRIJSGROEPEN: Prijsgroep[] = [
  { id: 'pg-1', naam: 'Standaard', kortingspercentage: 0, opslagpercentage: null },
  { id: 'pg-2', naam: 'Wholesale', kortingspercentage: 15, opslagpercentage: null },
  { id: 'pg-3', naam: 'Duur', kortingspercentage: null, opslagpercentage: 8 },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof PrijsgroepenSection>> = {}) {
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <PrijsgroepenSection
        prijsgroepen={PRIJSGROEPEN}
        klanten={[]}
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

beforeEach(() => {
  logActiviteitMock.mockReset();
});

describe('PrijsgroepenSection', () => {
  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('prijsgroepen-error')).toHaveTextContent('Kon niet laden.');
    expect(screen.queryByTestId('data-table')).not.toBeInTheDocument();
  });

  it('renders nothing while prijsgroepen is null and there is no error', () => {
    renderSection({ prijsgroepen: null });
    expect(screen.queryByTestId('prijsgroepen-section')).not.toBeInTheDocument();
  });

  it('lists the prijsgroepen with their type and percentage in the table', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-pg-1')).toHaveTextContent('Standaard');
    expect(screen.getByTestId('data-table-row-pg-2')).toHaveTextContent('Wholesale');
    expect(screen.getByTestId('data-table-row-pg-2')).toHaveTextContent('Korting');
    expect(screen.getByTestId('data-table-row-pg-2')).toHaveTextContent('15%');
    expect(screen.getByTestId('data-table-row-pg-3')).toHaveTextContent('Duur');
    expect(screen.getByTestId('data-table-row-pg-3')).toHaveTextContent('Opslag');
    expect(screen.getByTestId('data-table-row-pg-3')).toHaveTextContent('8%');
  });

  it('adds a new prijsgroep with kortingspercentage, closes the modal, and logs prijsgroep_toegevoegd', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('prijsgroepen-add'));
    fireEvent.change(screen.getByTestId('prijsgroep-modal-naam'), { target: { value: 'VIP' } });
    fireEvent.change(screen.getByTestId('prijsgroep-modal-percentage'), { target: { value: '25' } });
    fireEvent.click(screen.getByTestId('prijsgroep-modal-opslaan'));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({ naam: 'VIP', kortingspercentage: 25, opslagpercentage: null })
    );
    await waitFor(() => expect(screen.queryByTestId('prijsgroep-modal')).not.toBeInTheDocument());
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'prijsgroep_toegevoegd',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'VIP'
    );
  });

  it('adds a new prijsgroep with opslagpercentage when Opslag is selected as type', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('prijsgroepen-add'));
    fireEvent.change(screen.getByTestId('prijsgroep-modal-naam'), { target: { value: 'Groothandel' } });
    fireEvent.change(screen.getByTestId('prijsgroep-modal-type'), { target: { value: 'opslag' } });
    fireEvent.change(screen.getByTestId('prijsgroep-modal-percentage'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('prijsgroep-modal-opslaan'));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({ naam: 'Groothandel', kortingspercentage: null, opslagpercentage: 5 })
    );
  });

  it('disables Opslaan until naam and percentage are both filled in', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('prijsgroepen-add'));
    expect(screen.getByTestId('prijsgroep-modal-opslaan')).toBeDisabled();
    fireEvent.change(screen.getByTestId('prijsgroep-modal-naam'), { target: { value: 'X' } });
    expect(screen.getByTestId('prijsgroep-modal-opslaan')).toBeDisabled();
    fireEvent.change(screen.getByTestId('prijsgroep-modal-percentage'), { target: { value: '10' } });
    expect(screen.getByTestId('prijsgroep-modal-opslaan')).not.toBeDisabled();
  });

  it('opens a kortingspercentage row for editing pre-filled, updates it, and logs prijsgroep_gewijzigd', async () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-pg-2'));
    expect(screen.getByTestId('prijsgroep-modal-naam')).toHaveValue('Wholesale');
    expect(screen.getByTestId('prijsgroep-modal-type')).toHaveValue('korting');
    expect(screen.getByTestId('prijsgroep-modal-percentage')).toHaveValue(15);
    fireEvent.change(screen.getByTestId('prijsgroep-modal-percentage'), { target: { value: '20' } });
    fireEvent.click(screen.getByTestId('prijsgroep-modal-opslaan'));
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('pg-2', {
        naam: 'Wholesale',
        kortingspercentage: 20,
        opslagpercentage: null,
      })
    );
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'prijsgroep_gewijzigd',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'Wholesale'
    );
  });

  it('opens an opslagpercentage row for editing pre-filled with type opslag', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-pg-3'));
    expect(screen.getByTestId('prijsgroep-modal-naam')).toHaveValue('Duur');
    expect(screen.getByTestId('prijsgroep-modal-type')).toHaveValue('opslag');
    expect(screen.getByTestId('prijsgroep-modal-percentage')).toHaveValue(8);
  });

  it('shows an action error and does not log when adding fails', async () => {
    const onAdd = vi.fn().mockResolvedValue(false);
    renderSection({ onAdd });
    fireEvent.click(screen.getByTestId('prijsgroepen-add'));
    fireEvent.change(screen.getByTestId('prijsgroep-modal-naam'), { target: { value: 'VIP' } });
    fireEvent.change(screen.getByTestId('prijsgroep-modal-percentage'), { target: { value: '10' } });
    fireEvent.click(screen.getByTestId('prijsgroep-modal-opslaan'));
    expect(await screen.findByTestId('prijsgroep-modal-error')).toHaveTextContent(
      'Er is iets misgegaan. Probeer het opnieuw.'
    );
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });

  it('blocks deleting a prijsgroep that is still assigned to a klant', async () => {
    const { onRemove } = renderSection({
      klanten: [{ id: 'uid-1', prijsgroepId: 'pg-1' } as never],
    });
    fireEvent.click(screen.getByTestId('data-table-row-pg-1'));
    fireEvent.click(screen.getByTestId('prijsgroep-modal-verwijderen'));
    expect(await screen.findByTestId('prijsgroep-modal-error')).toHaveTextContent(
      'Deze prijsgroep is nog aan een klant toegewezen en kan niet verwijderd worden.'
    );
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('deletes a prijsgroep no klant has assigned', async () => {
    const { onRemove } = renderSection({
      klanten: [{ id: 'uid-1', prijsgroepId: 'pg-2' } as never],
    });
    fireEvent.click(screen.getByTestId('data-table-row-pg-1'));
    fireEvent.click(screen.getByTestId('prijsgroep-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('pg-1'));
  });
});
```

- [ ] **Step 3: Run the test file to confirm it fails**

```bash
npx vitest run tests/components/beheer/PrijsgroepenSection.test.tsx
```

Expected: FAIL — `prijsgroep-modal-type`/`prijsgroep-modal-percentage` test ids don't exist yet, `Prijsgroep` fixtures also don't type-check against the still-old component props in some cases.

- [ ] **Step 4: Rewrite `PrijsgroepenSection.tsx`**

Replace the whole file (`src/components/beheer/PrijsgroepenSection.tsx`) with:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Prijsgroep } from './materiaalTypes';
import type { Klant } from './KlantenSection';

interface PrijsgroepenSectionProps {
  prijsgroepen: Prijsgroep[] | null;
  klanten: Klant[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Prijsgroep, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Prijsgroep, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

type ModalState = { mode: 'add' } | { mode: 'edit'; prijsgroep: Prijsgroep } | null;
type PrijsgroepType = 'korting' | 'opslag';

export function PrijsgroepenSection({
  prijsgroepen,
  klanten,
  loadError,
  onAdd,
  onUpdate,
  onRemove,
}: PrijsgroepenSectionProps) {
  const t = useTranslations('beheer');
  const { user } = useAdminAuth();
  const [modalState, setModalState] = useState<ModalState>(null);
  const [naam, setNaam] = useState('');
  const [type, setType] = useState<PrijsgroepType>('korting');
  const [percentage, setPercentage] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  if (loadError) {
    return (
      <p data-testid="prijsgroepen-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (prijsgroepen === null) {
    return null;
  }

  function openAdd() {
    setNaam('');
    setType('korting');
    setPercentage('');
    setActionError(null);
    setModalState({ mode: 'add' });
  }

  function openEdit(prijsgroep: Prijsgroep) {
    setNaam(prijsgroep.naam);
    if (prijsgroep.kortingspercentage != null) {
      setType('korting');
      setPercentage(String(prijsgroep.kortingspercentage));
    } else {
      setType('opslag');
      setPercentage(String(prijsgroep.opslagpercentage));
    }
    setActionError(null);
    setModalState({ mode: 'edit', prijsgroep });
  }

  function closeModal() {
    setModalState(null);
  }

  async function handleSave() {
    if (!modalState) return;
    const data =
      type === 'korting'
        ? { naam, kortingspercentage: Number(percentage), opslagpercentage: null }
        : { naam, kortingspercentage: null, opslagpercentage: Number(percentage) };
    const success =
      modalState.mode === 'add' ? await onAdd(data) : await onUpdate(modalState.prijsgroep.id, data);
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'prijsgroep_toegevoegd' : 'prijsgroep_gewijzigd',
        actorFromMedewerker(user),
        naam
      );
      closeModal();
    } else {
      setActionError(t('prijsgroepenActionError'));
    }
  }

  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const inUse = (klanten ?? []).some((klant) => klant.prijsgroepId === modalState.prijsgroep.id);
    if (inUse) {
      setActionError(t('prijsgroepenVerwijderBlocked'));
      return;
    }
    const success = await onRemove(modalState.prijsgroep.id);
    if (success) {
      void logActiviteit('prijsgroep_verwijderd', actorFromMedewerker(user), modalState.prijsgroep.naam);
      closeModal();
    } else {
      setActionError(t('prijsgroepenActionError'));
    }
  }

  const columns: Column<Prijsgroep>[] = [
    { key: 'naam', label: t('prijsgroepenColNaam') },
    {
      key: 'kortingspercentage',
      label: t('prijsgroepenColType'),
      render: (row) => (row.kortingspercentage != null ? t('prijsgroepenTypeKorting') : t('prijsgroepenTypeOpslag')),
    },
    {
      key: 'opslagpercentage',
      label: t('prijsgroepenColPercentage'),
      render: (row) => `${row.kortingspercentage ?? row.opslagpercentage}%`,
    },
  ];

  return (
    <div data-testid="prijsgroepen-section">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={openAdd}
          data-testid="prijsgroepen-add"
          className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
        >
          {t('prijsgroepenToevoegen')}
        </button>
      </div>
      <DataTable<Prijsgroep>
        columns={columns}
        rows={prijsgroepen}
        getRowId={(row) => row.id}
        onRowClick={openEdit}
        emptyLabel={t('prijsgroepenEmpty')}
        searchPlaceholder={t('dataTableSearchPlaceholder')}
      />
      <Modal
        isOpen={modalState !== null}
        onClose={closeModal}
        closeLabel={t('modalClose')}
        footerActions={
          <>
            <button
              type="button"
              onClick={handleSave}
              disabled={!naam || !percentage}
              data-testid="prijsgroep-modal-opslaan"
              className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('prijsgroepenOpslaan')}
            </button>
            {modalState?.mode === 'edit' && (
              <button
                type="button"
                onClick={handleRemove}
                data-testid="prijsgroep-modal-verwijderen"
                className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('prijsgroepenVerwijderen')}
              </button>
            )}
          </>
        }
      >
        <div data-testid="prijsgroep-modal" className="flex flex-col gap-2 text-sm text-white/80">
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('prijsgroepenLabelNaam')}
            <input
              type="text"
              value={naam}
              onChange={(event) => setNaam(event.target.value)}
              data-testid="prijsgroep-modal-naam"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('prijsgroepenLabelType')}
            <select
              value={type}
              onChange={(event) => setType(event.target.value as PrijsgroepType)}
              data-testid="prijsgroep-modal-type"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            >
              <option value="korting">{t('prijsgroepenTypeKorting')}</option>
              <option value="opslag">{t('prijsgroepenTypeOpslag')}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('prijsgroepenLabelPercentage')}
            <input
              type="number"
              value={percentage}
              onChange={(event) => setPercentage(event.target.value)}
              data-testid="prijsgroep-modal-percentage"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>

          {actionError && (
            <p data-testid="prijsgroep-modal-error" className="text-xs text-red-400">
              {actionError}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 5: Run the test file to confirm it passes**

```bash
npx vitest run tests/components/beheer/PrijsgroepenSection.test.tsx
```

Expected: PASS (11 tests)

- [ ] **Step 6: Remove the now-unused i18n keys**

In `messages/nl.json`, remove the two lines added back in Task 2's "keep for now" note:

```json
    "prijsgroepenColKortingspercentage": "Kortingspercentage",
```
```json
    "prijsgroepenLabelKortingspercentage": "Kortingspercentage",
```

Confirm nothing else references them:

```bash
node -e "
const fs = require('fs');
const hits = ['ColKortingspercentage', 'LabelKortingspercentage'].flatMap((k) => {
  const { execSync } = require('child_process');
  try { return execSync('git grep -l \"' + k + '\" -- src tests').toString().trim().split('\n').filter(Boolean); }
  catch { return []; }
});
console.log(hits);
"
```

Expected: `[]`

- [ ] **Step 7: Commit**

```bash
git add src/components/beheer/materiaalTypes.ts src/components/beheer/PrijsgroepenSection.tsx tests/components/beheer/PrijsgroepenSection.test.tsx messages/nl.json
git commit -m "feat: replace prijsgroep kortingspercentage-only form with type + percentage"
```

---

### Task 4: Fix other Prijsgroep fixtures broken by the type change

**Files:**
- Modify: `tests/components/beheer/KlantModal.test.tsx:48-51`
- Modify: `tests/components/beheer/BeheerShell.test.tsx:290-294`

**Interfaces:**
- Consumes: `Prijsgroep` type from Task 3 (`opslagpercentage` is now a required property).

- [ ] **Step 1: Run the type checker to confirm these two files currently fail**

```bash
npx tsc --noEmit
```

Expected: errors in `tests/components/beheer/KlantModal.test.tsx` and `tests/components/beheer/BeheerShell.test.tsx` — object literals missing the `opslagpercentage` property.

- [ ] **Step 2: Fix the `KlantModal.test.tsx` fixture**

Current (`tests/components/beheer/KlantModal.test.tsx:48-51`):

```ts
const PRIJSGROEPEN: Prijsgroep[] = [
  { id: 'pg-1', naam: 'Standaard', kortingspercentage: 0 },
  { id: 'pg-2', naam: 'Premium', kortingspercentage: 10 },
];
```

Replace with:

```ts
const PRIJSGROEPEN: Prijsgroep[] = [
  { id: 'pg-1', naam: 'Standaard', kortingspercentage: 0, opslagpercentage: null },
  { id: 'pg-2', naam: 'Premium', kortingspercentage: 10, opslagpercentage: null },
];
```

- [ ] **Step 3: Fix the `BeheerShell.test.tsx` fixture**

Current (`tests/components/beheer/BeheerShell.test.tsx:290-294`):

```ts
    mockCollections({
      prijsgroepen: [
        { id: 'pg-1', naam: 'Standaard', kortingspercentage: 0 },
        { id: 'pg-2', naam: 'Wholesale', kortingspercentage: 15 },
      ],
    });
```

Replace with:

```ts
    mockCollections({
      prijsgroepen: [
        { id: 'pg-1', naam: 'Standaard', kortingspercentage: 0, opslagpercentage: null },
        { id: 'pg-2', naam: 'Wholesale', kortingspercentage: 15, opslagpercentage: null },
      ],
    });
```

- [ ] **Step 4: Run the type checker again**

```bash
npx tsc --noEmit
```

Expected: no errors referencing `KlantModal.test.tsx` or `BeheerShell.test.tsx`.

- [ ] **Step 5: Run both test files**

```bash
npx vitest run tests/components/beheer/KlantModal.test.tsx tests/components/beheer/BeheerShell.test.tsx
```

Expected: PASS (all tests in both files)

- [ ] **Step 6: Commit**

```bash
git add tests/components/beheer/KlantModal.test.tsx tests/components/beheer/BeheerShell.test.tsx
git commit -m "test: fix Prijsgroep fixtures for the new opslagpercentage field"
```

---

### Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full type check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Run the full test suite**

```bash
npm test
```

Expected: all tests pass, 0 failures.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Manually verify in the running app**

Start the dev server, log in as a medewerker (`joris.vandenbroek@gmail.com`), open Beheer → Prijsgroepen, and confirm:
- The table shows a Type and Percentage column instead of Kortingspercentage.
- "Toevoegen" defaults to Type = Korting; switching to Opslag and saving persists correctly (re-opening the row shows Opslag pre-filled).
- Opslaan stays disabled until both Naam and Percentage are filled.

- [ ] **Step 5: Report readiness**

No commit for this task — it's verification only. If everything passes, the branch is ready for `superpowers:finishing-a-development-branch`.
