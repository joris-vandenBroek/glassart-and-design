# Afwijsreden-bevestiging voor klanten en bestellingen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mandatory-reason confirmation popup to the existing "Afwijzen" buttons in `KlantModal` and `BestellingModal`, and persist the reason on the klant/bestelling record.

**Architecture:** A new shared presentational module (`afwijzenBevestiging.tsx`) provides a small hook plus two render helpers. Both modals swap their own content/footer in place to show the confirmation (no nested `Modal`), following the same pattern already designed for `verwijderbevestiging`. A new `afwijsreden` column is added to `klanten` and `bestelheaders`; both existing generic PATCH routes already forward the whole request body through `updateRow`, so no server route code changes are needed — only the `TABLE_COLUMNS` allow-list.

**Tech Stack:** Next.js 14 (App Router), TypeScript, React, next-intl, mysql2, Vitest + Testing Library.

## Global Constraints

- Design doc: [`docs/superpowers/specs/2026-08-10-afwijsreden-bevestiging-design.md`](../specs/2026-08-10-afwijsreden-bevestiging-design.md) — read this first for the *why* behind every decision below.
- One column `afwijsreden` (nullable) on both `klanten` and `bestelheaders`. No history table, no column on `bestelstatusHistorie`.
- No nested `Modal` — the confirmation swaps content in place within the existing `KlantModal`/`BestellingModal`, exactly like the (not yet implemented) `verwijderbevestiging` design.
- The reason is verplicht (mandatory) — the confirm button stays disabled until the trimmed value is non-empty.
- Staff-only visibility. Never expose `afwijsreden` outside `beheer`.
- All new translation keys go in `messages/nl.json` only — this feature lives entirely in beheer, which is Dutch-only. Do not touch `en.json`/`de.json`/`fr.json`.
- Every test file in this plan connects to the real shared staging MySQL database (no mocking) — follow the existing cleanup convention in each file exactly (delete only the exact rows created, by captured id, in `afterEach`/`finally`).
- Migration commands follow `CLAUDE.md`'s documented flow: apply to staging directly (`npm run db:migrate -- staging`), never to `productie` without asking the user first.

---

### Task 1: Database column `afwijsreden` on `klanten` and `bestelheaders`

**Files:**
- Create: `db/migrations/2026-08-10-afwijsreden.sql`
- Modify: `db/schema.sql:26-30` (klanten), `db/schema.sql:199-207` (bestelheaders)
- Modify: `src/lib/server/tableColumns.ts:18-45` (klanten array), `src/lib/server/tableColumns.ts:107` (bestelheaders array)
- Test: `tests/app/api/klanten.test.ts`, `tests/app/api/bestelheaders.test.ts`

**Interfaces:**
- Produces: a nullable `afwijsreden` (TEXT) column on `klanten` and `bestelheaders`, writable through the existing generic `PATCH /api/klanten/[id]` and `PATCH /api/bestelheaders/[id]` routes (no route code changes — they already forward the full request body to `updateRow`).

- [ ] **Step 1: Write the failing test for klanten**

In `tests/app/api/klanten.test.ts`, insert a new test right before the final `});` that closes the `describe('klanten admin routes', ...)` block (i.e. directly after the `'does not assign a klantnummer when a klant is rejected'` test):

```ts
  it('stores and returns an afwijsreden when a klant is rejected', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'afwijsreden@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Beoordelen',
    } as never);
    createdKlantIds.push(klant.id);

    await patchKlant(
      req(
        'PATCH',
        { status: 'Afgewezen', afwijsreden: 'Onvoldoende gegevens aangeleverd.' },
        await medewerkerCookie()
      ),
      { params: { id: klant.id } }
    );

    const [rows] = await getPool().query('SELECT status, afwijsreden FROM klanten WHERE id = ?', [klant.id]);
    const rij = (rows as Array<{ status: string; afwijsreden: string | null }>)[0];
    expect(rij.status).toBe('Afgewezen');
    expect(rij.afwijsreden).toBe('Onvoldoende gegevens aangeleverd.');
  });
```

- [ ] **Step 2: Write the failing test for bestelheaders**

In `tests/app/api/bestelheaders.test.ts`, insert a new test right before the final `});` that closes the `describe('bestelheaders routes', ...)` block (directly after the "rejects ordering an artwork exclusive to 2 klanten..." test):

```ts
  it('stores and returns an afwijsreden when a bestelling is rejected', async () => {
    const { cookie } = await klant('afwijsreden-bestelling@example.com');
    const created = await createHeader(postRequest({ lines: [] }, cookie));
    const header = await created.json();
    const staffCookie = await medewerkerCookie();

    await patchHeader(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: staffCookie },
        body: JSON.stringify({ status: 'Afgewezen', afwijsreden: 'Klant heeft nog een openstaande factuur.' }),
      }),
      { params: { id: header.id } }
    );

    const [rows] = await getPool().query('SELECT status, afwijsreden FROM bestelheaders WHERE id = ?', [header.id]);
    const rij = (rows as Array<{ status: string; afwijsreden: string | null }>)[0];
    expect(rij.status).toBe('Afgewezen');
    expect(rij.afwijsreden).toBe('Klant heeft nog een openstaande factuur.');
  });
```

- [ ] **Step 3: Run both tests, verify they fail**

Run:
```bash
npx vitest run tests/app/api/klanten.test.ts -t "stores and returns an afwijsreden"
npx vitest run tests/app/api/bestelheaders.test.ts -t "stores and returns an afwijsreden"
```
Expected: both FAIL. Either the PATCH throws inside `controleerKolommen` ("Onbekende kolom(men) voor tabel klanten: afwijsreden") before the column exists in `TABLE_COLUMNS`, or — once that's added but before the migration runs — the verification `SELECT ... afwijsreden ...` itself throws `ER_BAD_FIELD_ERROR: Unknown column 'afwijsreden'`. Either failure mode confirms the column doesn't exist yet.

- [ ] **Step 4: Create the migration file**

Create `db/migrations/2026-08-10-afwijsreden.sql`:

```sql
-- Migration for klanten.afwijsreden / bestelheaders.afwijsreden (2026-08-10)
-- Run once against a database still on the pre-migration schema.
-- Nullable: existing Afgewezen rows have no stored reason and stay NULL; only a
-- rejection made through the new confirmation popup fills this in going forward.
ALTER TABLE klanten ADD COLUMN afwijsreden TEXT NULL;
ALTER TABLE bestelheaders ADD COLUMN afwijsreden TEXT NULL;
```

- [ ] **Step 5: Apply the migration to staging**

Run:
```bash
npm run db:migrate -- staging
```
Expected: output confirms `2026-08-10-afwijsreden.sql` applied successfully.

- [ ] **Step 6: Verify the migration is recorded**

Run:
```bash
npm run db:status -- staging
```
Expected: `2026-08-10-afwijsreden.sql` appears under applied migrations, no longer under pending.

- [ ] **Step 7: Update `db/schema.sql`**

In the `klanten` table (`db/schema.sql:26-30`), change:
```sql
  minimaleAfname INT,
  klantnr VARCHAR(20),
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_klanten_kunstenaarId (kunstenaarId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
to:
```sql
  minimaleAfname INT,
  klantnr VARCHAR(20),
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  afwijsreden TEXT,
  UNIQUE KEY uniq_klanten_kunstenaarId (kunstenaarId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

In the `bestelheaders` table (`db/schema.sql:199-207`), change:
```sql
CREATE TABLE bestelheaders (
  id CHAR(36) PRIMARY KEY,
  klantId CHAR(36) NOT NULL,
  bestelnr VARCHAR(20) NOT NULL,
  besteldatum TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) NOT NULL DEFAULT 'Te beoordelen',
  zendingnummer VARCHAR(20),
  FOREIGN KEY (klantId) REFERENCES klanten(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
to:
```sql
CREATE TABLE bestelheaders (
  id CHAR(36) PRIMARY KEY,
  klantId CHAR(36) NOT NULL,
  bestelnr VARCHAR(20) NOT NULL,
  besteldatum TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) NOT NULL DEFAULT 'Te beoordelen',
  zendingnummer VARCHAR(20),
  afwijsreden TEXT,
  FOREIGN KEY (klantId) REFERENCES klanten(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 8: Update `TABLE_COLUMNS`**

In `src/lib/server/tableColumns.ts`, in the `klanten` array, change:
```ts
    'klantnr',
    'createdAt',
  ],
```
to:
```ts
    'klantnr',
    'createdAt',
    'afwijsreden',
  ],
```

In the same file, change the `bestelheaders` line:
```ts
  bestelheaders: ['id', 'klantId', 'bestelnr', 'besteldatum', 'status', 'zendingnummer'],
```
to:
```ts
  bestelheaders: ['id', 'klantId', 'bestelnr', 'besteldatum', 'status', 'zendingnummer', 'afwijsreden'],
```

- [ ] **Step 9: Run both tests again, verify they pass**

Run:
```bash
npx vitest run tests/app/api/klanten.test.ts tests/app/api/bestelheaders.test.ts
```
Expected: PASS (full files, not just the two new tests — confirms nothing else broke).

- [ ] **Step 10: Commit**

```bash
git add db/migrations/2026-08-10-afwijsreden.sql db/schema.sql src/lib/server/tableColumns.ts tests/app/api/klanten.test.ts tests/app/api/bestelheaders.test.ts
git commit -m "feat: voeg afwijsreden-kolom toe aan klanten en bestelheaders"
```

---

### Task 2: Shared `afwijzenBevestiging` confirmation module

**Files:**
- Create: `src/components/beheer/afwijzenBevestiging.tsx`
- Test: `tests/components/beheer/afwijzenBevestiging.test.tsx`
- Modify: `messages/nl.json` (new shared keys)

**Interfaces:**
- Produces:
  - `useAfwijzenBevestiging(): AfwijzenBevestiging` where `AfwijzenBevestiging = { open: boolean; reden: string; vraag: () => void; wijzigReden: (reden: string) => void; annuleer: () => void }`. `vraag`/`wijzigReden`/`annuleer` are referentially stable (`useCallback`, empty deps) so they're safe to use as `useEffect` dependencies in Tasks 3 and 4.
  - `AfwijzenBevestigingTekst(props: { item: string; reden: string; onWijzigReden: (reden: string) => void; testId: string })` — renders a `data-testid={testId}` container with the question text and a `data-testid={`${testId}-reden`}` textarea.
  - `AfwijzenBevestigingActies(props: { reden: string; onBevestig: () => void; onAnnuleer: () => void; testIdPrefix: string; isBezig?: boolean })` — renders two buttons: `data-testid={`${testIdPrefix}-modal-afwijzen-bevestigen`}` (disabled while `reden.trim() === '' || isBezig`) and `data-testid={`${testIdPrefix}-modal-afwijzen-annuleren`}` (disabled while `isBezig`).

- [ ] **Step 1: Write the failing hook tests**

Create `tests/components/beheer/afwijzenBevestiging.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import {
  useAfwijzenBevestiging,
  AfwijzenBevestigingTekst,
  AfwijzenBevestigingActies,
} from '@/components/beheer/afwijzenBevestiging';
import messages from '../../../messages/nl.json';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="nl" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

describe('useAfwijzenBevestiging', () => {
  it('starts closed with an empty reden', () => {
    const { result } = renderHook(() => useAfwijzenBevestiging());
    expect(result.current.open).toBe(false);
    expect(result.current.reden).toBe('');
  });

  it('vraag() opens the confirmation with an empty reden', () => {
    const { result } = renderHook(() => useAfwijzenBevestiging());
    act(() => result.current.vraag());
    expect(result.current.open).toBe(true);
    expect(result.current.reden).toBe('');
  });

  it('wijzigReden() updates the reden while open', () => {
    const { result } = renderHook(() => useAfwijzenBevestiging());
    act(() => result.current.vraag());
    act(() => result.current.wijzigReden('Te laat besteld'));
    expect(result.current.reden).toBe('Te laat besteld');
  });

  it('annuleer() closes the confirmation and clears the reden', () => {
    const { result } = renderHook(() => useAfwijzenBevestiging());
    act(() => result.current.vraag());
    act(() => result.current.wijzigReden('Te laat besteld'));
    act(() => result.current.annuleer());
    expect(result.current.open).toBe(false);
    expect(result.current.reden).toBe('');
  });

  it('vraag() after a previous annuleer() opens with an empty reden again, not the old one', () => {
    const { result } = renderHook(() => useAfwijzenBevestiging());
    act(() => result.current.vraag());
    act(() => result.current.wijzigReden('Eerste reden'));
    act(() => result.current.annuleer());
    act(() => result.current.vraag());
    expect(result.current.reden).toBe('');
  });

  it('returns referentially stable vraag/wijzigReden/annuleer across re-renders', () => {
    const { result, rerender } = renderHook(() => useAfwijzenBevestiging());
    const eerste = { vraag: result.current.vraag, wijzigReden: result.current.wijzigReden, annuleer: result.current.annuleer };
    rerender();
    expect(result.current.vraag).toBe(eerste.vraag);
    expect(result.current.wijzigReden).toBe(eerste.wijzigReden);
    expect(result.current.annuleer).toBe(eerste.annuleer);
  });
});

describe('AfwijzenBevestigingTekst', () => {
  it('shows the question with the item name and calls onWijzigReden while typing', () => {
    const onWijzigReden = vi.fn();
    render(
      <AfwijzenBevestigingTekst
        item="Testbedrijf BV"
        reden=""
        onWijzigReden={onWijzigReden}
        testId="klant-modal-afwijzen-bevestiging"
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getByTestId('klant-modal-afwijzen-bevestiging')).toHaveTextContent('Testbedrijf BV');
    fireEvent.change(screen.getByTestId('klant-modal-afwijzen-bevestiging-reden'), {
      target: { value: 'Onvolledige aanvraag' },
    });
    expect(onWijzigReden).toHaveBeenCalledWith('Onvolledige aanvraag');
  });
});

describe('AfwijzenBevestigingActies', () => {
  it('disables the confirm button while the reden is empty or only whitespace', () => {
    const { rerender } = render(
      <AfwijzenBevestigingActies reden="" onBevestig={vi.fn()} onAnnuleer={vi.fn()} testIdPrefix="klant" />,
      { wrapper: Wrapper }
    );
    expect(screen.getByTestId('klant-modal-afwijzen-bevestigen')).toBeDisabled();

    rerender(
      <Wrapper>
        <AfwijzenBevestigingActies reden="   " onBevestig={vi.fn()} onAnnuleer={vi.fn()} testIdPrefix="klant" />
      </Wrapper>
    );
    expect(screen.getByTestId('klant-modal-afwijzen-bevestigen')).toBeDisabled();
  });

  it('enables the confirm button once a non-empty reden is given, and calls onBevestig/onAnnuleer', () => {
    const onBevestig = vi.fn();
    const onAnnuleer = vi.fn();
    render(
      <AfwijzenBevestigingActies
        reden="Een geldige reden"
        onBevestig={onBevestig}
        onAnnuleer={onAnnuleer}
        testIdPrefix="klant"
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getByTestId('klant-modal-afwijzen-bevestigen')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen-bevestigen'));
    expect(onBevestig).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen-annuleren'));
    expect(onAnnuleer).toHaveBeenCalled();
  });

  it('disables both buttons while isBezig is true', () => {
    render(
      <AfwijzenBevestigingActies reden="Reden" onBevestig={vi.fn()} onAnnuleer={vi.fn()} testIdPrefix="klant" isBezig />,
      { wrapper: Wrapper }
    );
    expect(screen.getByTestId('klant-modal-afwijzen-bevestigen')).toBeDisabled();
    expect(screen.getByTestId('klant-modal-afwijzen-annuleren')).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run:
```bash
npx vitest run tests/components/beheer/afwijzenBevestiging.test.tsx
```
Expected: FAIL with a module-not-found error for `@/components/beheer/afwijzenBevestiging`.

- [ ] **Step 3: Add the shared translation keys**

In `messages/nl.json`, in the `beheer` block, change:
```json
    "annuleren": "Annuleren",
    "verwijderenBevestigen": "Ja, verwijderen",
    "dataTableSearchPlaceholder": "Zoeken...",
```
to:
```json
    "annuleren": "Annuleren",
    "verwijderenBevestigen": "Ja, verwijderen",
    "afwijzenBevestigingVraag": "Weet je zeker dat je {item} wilt afwijzen?",
    "afwijzenBevestigingRedenLabel": "Reden van afwijzing",
    "afwijzenBevestigingRedenPlaceholder": "Geef aan waarom je afwijst…",
    "afwijzenBevestigingRedenVerplicht": "Een reden is verplicht.",
    "afwijzenBevestigen": "Ja, afwijzen",
    "dataTableSearchPlaceholder": "Zoeken...",
```

- [ ] **Step 4: Implement the module**

Create `src/components/beheer/afwijzenBevestiging.tsx`:

```tsx
'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';

export interface AfwijzenBevestiging {
  /** True zodra de bevestiging open staat. */
  open: boolean;
  /** De ingevoerde reden, leeg bij het openen. */
  reden: string;
  vraag: () => void;
  wijzigReden: (reden: string) => void;
  annuleer: () => void;
}

export function useAfwijzenBevestiging(): AfwijzenBevestiging {
  const [open, setOpen] = useState(false);
  const [reden, setReden] = useState('');

  const vraag = useCallback(() => {
    setReden('');
    setOpen(true);
  }, []);

  const wijzigReden = useCallback((nextReden: string) => {
    setReden(nextReden);
  }, []);

  const annuleer = useCallback(() => {
    setOpen(false);
    setReden('');
  }, []);

  return { open, reden, vraag, wijzigReden, annuleer };
}

export function AfwijzenBevestigingTekst({
  item,
  reden,
  onWijzigReden,
  testId,
}: {
  item: string;
  reden: string;
  onWijzigReden: (reden: string) => void;
  testId: string;
}) {
  const t = useTranslations('beheer');
  return (
    <div data-testid={testId} className="flex flex-col gap-3 text-sm text-white/80">
      <p>{t('afwijzenBevestigingVraag', { item })}</p>
      <label className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-white/60">
          {t('afwijzenBevestigingRedenLabel')}
        </span>
        <textarea
          value={reden}
          onChange={(event) => onWijzigReden(event.target.value)}
          placeholder={t('afwijzenBevestigingRedenPlaceholder')}
          data-testid={`${testId}-reden`}
          rows={3}
          className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
        />
        <span className="text-xs text-white/50">{t('afwijzenBevestigingRedenVerplicht')}</span>
      </label>
    </div>
  );
}

export function AfwijzenBevestigingActies({
  reden,
  onBevestig,
  onAnnuleer,
  testIdPrefix,
  isBezig = false,
}: {
  reden: string;
  onBevestig: () => void;
  onAnnuleer: () => void;
  /** Enkelvoudsvorm van de sectie, bijvoorbeeld `klant` — bepaalt de testids. */
  testIdPrefix: string;
  isBezig?: boolean;
}) {
  const t = useTranslations('beheer');
  return (
    <>
      <button
        type="button"
        onClick={onBevestig}
        disabled={reden.trim() === '' || isBezig}
        data-testid={`${testIdPrefix}-modal-afwijzen-bevestigen`}
        className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
      >
        {t('afwijzenBevestigen')}
      </button>
      <button
        type="button"
        onClick={onAnnuleer}
        disabled={isBezig}
        data-testid={`${testIdPrefix}-modal-afwijzen-annuleren`}
        className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white disabled:opacity-40"
      >
        {t('annuleren')}
      </button>
    </>
  );
}
```

- [ ] **Step 5: Run the tests, verify they pass**

Run:
```bash
npx vitest run tests/components/beheer/afwijzenBevestiging.test.tsx
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/beheer/afwijzenBevestiging.tsx tests/components/beheer/afwijzenBevestiging.test.tsx messages/nl.json
git commit -m "feat: voeg gedeelde afwijzen-bevestigingsmodule toe"
```

---

### Task 3: Wire the confirmation into `KlantModal`

**Files:**
- Modify: `src/components/beheer/KlantenSection.tsx:11-36` (Klant type)
- Modify: `src/components/beheer/KlantModal.tsx`
- Modify: `tests/components/beheer/KlantModal.test.tsx`
- Modify: `messages/nl.json` (one more key)

**Interfaces:**
- Consumes: `useAfwijzenBevestiging`, `AfwijzenBevestigingTekst`, `AfwijzenBevestigingActies` from `./afwijzenBevestiging` (Task 2).
- Produces: `Klant.afwijsreden?: string | null`, consumed nowhere else yet (Task 4's `Bestelling` type is separate).

- [ ] **Step 1: Add `afwijsreden` to the `Klant` type**

In `src/components/beheer/KlantenSection.tsx`, change:
```ts
  klantnr?: string | null;
  status: 'Beoordelen' | 'Goedgekeurd' | 'Afgewezen';
  prijsgroepId: string | null;
  kunstenaarId: string | null;
  minimaleAfname?: number | null;
}
```
to:
```ts
  klantnr?: string | null;
  status: 'Beoordelen' | 'Goedgekeurd' | 'Afgewezen';
  prijsgroepId: string | null;
  kunstenaarId: string | null;
  minimaleAfname?: number | null;
  afwijsreden?: string | null;
}
```

- [ ] **Step 2: Add the display-label translation key**

In `messages/nl.json`, in the `beheer` block, change:
```json
    "klantenGoedkeuren": "Goedkeuren",
    "klantenAfwijzen": "Afwijzen",
```
to:
```json
    "klantenGoedkeuren": "Goedkeuren",
    "klantenAfwijzen": "Afwijzen",
    "afwijsredenLabel": "Reden van afwijzing",
```

- [ ] **Step 3: Write the failing component tests**

In `tests/components/beheer/KlantModal.test.tsx`, replace the existing test:
```ts
  it('rejects the klant and calls onUpdated with the updated klant', async () => {
    const { onUpdated } = renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen'));

    await waitFor(() => expect(patchCall()).toBeDefined());
    expect(patchBody()).toEqual({ status: 'Afgewezen' });
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ ...KLANT, status: 'Afgewezen' }));
  });

  it('shows an error and does not call onUpdated when the save request fails', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    const { onUpdated } = renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen'));

    expect(await screen.findByTestId('klant-modal-error')).toBeInTheDocument();
    expect(onUpdated).not.toHaveBeenCalled();
  });
```
with:
```ts
  it('opens the afwijzen confirmation without patching immediately', () => {
    renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen'));
    expect(screen.getByTestId('klant-modal-afwijzen-bevestiging')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('disables the afwijzen confirm button until a reason is entered', () => {
    renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen'));
    expect(screen.getByTestId('klant-modal-afwijzen-bevestigen')).toBeDisabled();
    fireEvent.change(screen.getByTestId('klant-modal-afwijzen-bevestiging-reden'), {
      target: { value: 'Onvolledige aanvraag' },
    });
    expect(screen.getByTestId('klant-modal-afwijzen-bevestigen')).not.toBeDisabled();
  });

  it('rejects the klant with the given reason and calls onUpdated with afwijsreden', async () => {
    const { onUpdated } = renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen'));
    fireEvent.change(screen.getByTestId('klant-modal-afwijzen-bevestiging-reden'), {
      target: { value: 'Onvolledige aanvraag' },
    });
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen-bevestigen'));

    await waitFor(() => expect(patchCall()).toBeDefined());
    expect(patchBody()).toEqual({ status: 'Afgewezen', afwijsreden: 'Onvolledige aanvraag' });
    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith({
        ...KLANT,
        status: 'Afgewezen',
        afwijsreden: 'Onvolledige aanvraag',
      })
    );
  });

  it('cancels the afwijzen confirmation without patching, and returns to the normal view', () => {
    renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen'));
    fireEvent.change(screen.getByTestId('klant-modal-afwijzen-bevestiging-reden'), {
      target: { value: 'Wordt niet verstuurd' },
    });
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen-annuleren'));
    expect(screen.queryByTestId('klant-modal-afwijzen-bevestiging')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the stored afwijsreden when the klant is Afgewezen', () => {
    renderModal({ ...KLANT, status: 'Afgewezen', afwijsreden: 'Onvolledige aanvraag' });
    expect(screen.getByTestId('klant-modal-afwijsreden')).toHaveTextContent('Onvolledige aanvraag');
  });

  it('does not show an afwijsreden block for a klant that is not Afgewezen', () => {
    renderModal(KLANT);
    expect(screen.queryByTestId('klant-modal-afwijsreden')).not.toBeInTheDocument();
  });

  it('shows an error and does not call onUpdated when the save request fails', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    const { onUpdated } = renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen'));
    fireEvent.change(screen.getByTestId('klant-modal-afwijzen-bevestiging-reden'), {
      target: { value: 'Reden' },
    });
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen-bevestigen'));

    expect(await screen.findByTestId('klant-modal-error')).toBeInTheDocument();
    expect(onUpdated).not.toHaveBeenCalled();
  });
```

Also replace the two logging tests:
```ts
  it('logs klant_afgewezen with the logged-in medewerker on rejection', async () => {
    renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'klant_afgewezen',
        'Testbedrijf BV'
      )
    );
  });

  it('does not log when the save request fails', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen'));
    await screen.findByTestId('klant-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });
```
with:
```ts
  it('logs klant_afgewezen with the reason included', async () => {
    renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen'));
    fireEvent.change(screen.getByTestId('klant-modal-afwijzen-bevestiging-reden'), {
      target: { value: 'Onvolledige aanvraag' },
    });
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen-bevestigen'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'klant_afgewezen',
        'Testbedrijf BV: Onvolledige aanvraag'
      )
    );
  });

  it('does not log when the save request fails', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen'));
    fireEvent.change(screen.getByTestId('klant-modal-afwijzen-bevestiging-reden'), {
      target: { value: 'Reden' },
    });
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen-bevestigen'));
    await screen.findByTestId('klant-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });
```

- [ ] **Step 4: Run the tests, verify the new/changed ones fail**

Run:
```bash
npx vitest run tests/components/beheer/KlantModal.test.tsx
```
Expected: FAIL — the new testids (`klant-modal-afwijzen-bevestiging`, `-reden`, `-bevestigen`, `-annuleren`, `klant-modal-afwijsreden`) don't exist yet; clicking `klant-modal-afwijzen` still PATCHes immediately.

- [ ] **Step 5: Wire the confirmation into `KlantModal.tsx`**

Add the import (`src/components/beheer/KlantModal.tsx:11`, right after the `logActiviteit` import):
```ts
import { logActiviteit } from '@/lib/logActiviteit';
import { useAfwijzenBevestiging, AfwijzenBevestigingTekst, AfwijzenBevestigingActies } from './afwijzenBevestiging';
```

Add the hook call right after `const { user } = useAdminAuth();` (`KlantModal.tsx:103`):
```ts
  const { user } = useAdminAuth();
  const bevestigingAfwijzen = useAfwijzenBevestiging();
```

Extend the reset effect (`KlantModal.tsx:113-122`) — change:
```ts
  useEffect(() => {
    if (klant) {
      setPrijsgroepId(klant.prijsgroepId ?? '');
      setKunstenaarId(klant.kunstenaarId);
      setMinimaleAfname(klant.minimaleAfname != null ? String(klant.minimaleAfname) : '');
      setFields(fieldsFromKlant(klant));
      setIsEditing(false);
      setError(null);
    }
  }, [klant]);
```
to:
```ts
  useEffect(() => {
    if (klant) {
      setPrijsgroepId(klant.prijsgroepId ?? '');
      setKunstenaarId(klant.kunstenaarId);
      setMinimaleAfname(klant.minimaleAfname != null ? String(klant.minimaleAfname) : '');
      setFields(fieldsFromKlant(klant));
      setIsEditing(false);
      setError(null);
      bevestigingAfwijzen.annuleer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [klant]);
```

Replace `handleAfwijzen` (`KlantModal.tsx:241-255`) — change:
```ts
  async function handleAfwijzen() {
    if (!klant) return;
    try {
      const response = await fetch(`/api/klanten/${klant.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Afgewezen' }),
      });
      if (!response.ok) throw new Error('update failed');
      void logActiviteit('klant_afgewezen', klant.companyName);
      onUpdated({ ...klant, status: 'Afgewezen' });
    } catch {
      setError(t('klantenActionError'));
    }
  }
```
to:
```ts
  async function handleAfwijzen(reden: string) {
    if (!klant) return;
    try {
      const response = await fetch(`/api/klanten/${klant.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Afgewezen', afwijsreden: reden }),
      });
      if (!response.ok) throw new Error('update failed');
      void logActiviteit('klant_afgewezen', `${klant.companyName}: ${reden}`);
      onUpdated({ ...klant, status: 'Afgewezen', afwijsreden: reden });
      bevestigingAfwijzen.annuleer();
    } catch {
      setError(t('klantenActionError'));
    }
  }
```

Replace the `footerActions` prop (`KlantModal.tsx:271-317`) — change:
```tsx
      footerActions={
        klant && fields ? (
          <>
            {isEditing && (
              <button
                type="button"
                onClick={handleAnnuleren}
                data-testid="klant-modal-annuleren"
                className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('annuleren')}
              </button>
            )}
            <button
              type="button"
              onClick={handleOpslaan}
              disabled={wachtwoordZichtbaar}
              data-testid="klant-modal-opslaan"
              className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('klantenOpslaan')}
            </button>
            {!isEditing && klant.status !== 'Goedgekeurd' && (
              <button
                type="button"
                onClick={handleGoedkeuren}
                disabled={!prijsgroepId || !heeftGeldigBtwTarief || wachtwoordZichtbaar}
                data-testid="klant-modal-goedkeuren"
                className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
              >
                {t('klantenGoedkeuren')}
              </button>
            )}
            {!isEditing && (
              <button
                type="button"
                onClick={handleAfwijzen}
                disabled={wachtwoordZichtbaar}
                data-testid="klant-modal-afwijzen"
                className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white disabled:opacity-40"
              >
                {t('klantenAfwijzen')}
              </button>
            )}
          </>
        ) : null
      }
```
to:
```tsx
      footerActions={
        klant && fields ? (
          bevestigingAfwijzen.open ? (
            <AfwijzenBevestigingActies
              reden={bevestigingAfwijzen.reden}
              onBevestig={() => handleAfwijzen(bevestigingAfwijzen.reden)}
              onAnnuleer={bevestigingAfwijzen.annuleer}
              testIdPrefix="klant"
            />
          ) : (
            <>
              {isEditing && (
                <button
                  type="button"
                  onClick={handleAnnuleren}
                  data-testid="klant-modal-annuleren"
                  className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
                >
                  {t('annuleren')}
                </button>
              )}
              <button
                type="button"
                onClick={handleOpslaan}
                disabled={wachtwoordZichtbaar}
                data-testid="klant-modal-opslaan"
                className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
              >
                {t('klantenOpslaan')}
              </button>
              {!isEditing && klant.status !== 'Goedgekeurd' && (
                <button
                  type="button"
                  onClick={handleGoedkeuren}
                  disabled={!prijsgroepId || !heeftGeldigBtwTarief || wachtwoordZichtbaar}
                  data-testid="klant-modal-goedkeuren"
                  className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
                >
                  {t('klantenGoedkeuren')}
                </button>
              )}
              {!isEditing && (
                <button
                  type="button"
                  onClick={bevestigingAfwijzen.vraag}
                  disabled={wachtwoordZichtbaar}
                  data-testid="klant-modal-afwijzen"
                  className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white disabled:opacity-40"
                >
                  {t('klantenAfwijzen')}
                </button>
              )}
            </>
          )
        ) : null
      }
```

Replace the body (`KlantModal.tsx:319-623`, from `{klant && fields && (` through the matching closing `)}` right before `</Modal>`) — change the opening:
```tsx
      {klant && fields && (
        <div data-testid="klant-modal" className="flex flex-col gap-3 text-sm text-white/80">
          <div className="flex items-center justify-between">
            <span
              data-testid="klant-modal-status"
              className={`w-fit rounded-full px-3 py-1 text-xs uppercase tracking-wide ${STATUS_BADGE_CLASS[klant.status]}`}
            >
              {klant.status}
            </span>
            {!isEditing && (
              <button
                type="button"
                onClick={handleBewerken}
                data-testid="klant-modal-bewerken"
                className="btn-beheer-secondary rounded-sm border border-white/20 px-3 py-1.5 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('bewerken')}
              </button>
            )}
          </div>

          {!heeftGeldigBtwTarief && (
```
to:
```tsx
      {klant && fields && (
        <>
          {error && (
            <p data-testid="klant-modal-error" className="text-xs text-red-400">
              {error}
            </p>
          )}
          <div
            data-testid="klant-modal"
            hidden={bevestigingAfwijzen.open}
            className="flex flex-col gap-3 text-sm text-white/80"
          >
            <div className="flex items-center justify-between">
              <span
                data-testid="klant-modal-status"
                className={`w-fit rounded-full px-3 py-1 text-xs uppercase tracking-wide ${STATUS_BADGE_CLASS[klant.status]}`}
              >
                {klant.status}
              </span>
              {!isEditing && (
                <button
                  type="button"
                  onClick={handleBewerken}
                  data-testid="klant-modal-bewerken"
                  className="btn-beheer-secondary rounded-sm border border-white/20 px-3 py-1.5 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
                >
                  {t('bewerken')}
                </button>
              )}
            </div>

            {klant.status === 'Afgewezen' && klant.afwijsreden && (
              <div data-testid="klant-modal-afwijsreden" className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-wide text-white/60">{t('afwijsredenLabel')}</span>
                <p className="text-white/80">{klant.afwijsreden}</p>
              </div>
            )}

            {!heeftGeldigBtwTarief && (
```

Every remaining line of the original body content stays exactly as-is (indented one level deeper to sit inside the same `<div data-testid="klant-modal" ...>`), down to and including the original `{error && (...)}` block at the very end (`KlantModal.tsx:617-621`) — **delete that block**, since the error paragraph moved to the top of the fragment above (it must stay visible while the confirmation view replaces the normal view, not be hidden along with it). So the tail of the original body:
```tsx
          <RequiredLegend testId="klant-modal-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

          {error && (
            <p data-testid="klant-modal-error" className="text-xs text-red-400">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
```
becomes:
```tsx
            <RequiredLegend testId="klant-modal-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>
          </div>
          {bevestigingAfwijzen.open && (
            <AfwijzenBevestigingTekst
              item={klant.companyName}
              reden={bevestigingAfwijzen.reden}
              onWijzigReden={bevestigingAfwijzen.wijzigReden}
              testId="klant-modal-afwijzen-bevestiging"
            />
          )}
        </>
      )}
    </Modal>
  );
}
```

- [ ] **Step 6: Run the tests, verify they pass**

Run:
```bash
npx vitest run tests/components/beheer/KlantModal.test.tsx
```
Expected: PASS, including every pre-existing test in the file (the `wachtwoordZichtbaar` describe block is unaffected — it only asserts the `klant-modal-afwijzen` trigger button is disabled, which is still gated by the same `disabled={wachtwoordZichtbaar}` prop).

- [ ] **Step 7: Commit**

```bash
git add src/components/beheer/KlantenSection.tsx src/components/beheer/KlantModal.tsx tests/components/beheer/KlantModal.test.tsx messages/nl.json
git commit -m "feat: vraag een verplichte reden bij het afwijzen van een klant"
```

---

### Task 4: Wire the confirmation into `BestellingModal`

**Files:**
- Modify: `src/components/beheer/BestellingenSection.tsx:29-40` (Bestelling type)
- Modify: `src/components/beheer/BestellingModal.tsx`
- Modify: `tests/components/beheer/BestellingModal.test.tsx`

**Interfaces:**
- Consumes: `useAfwijzenBevestiging`, `AfwijzenBevestigingTekst`, `AfwijzenBevestigingActies` from `./afwijzenBevestiging` (Task 2). Reuses the `afwijsredenLabel` translation key added in Task 3 — no new nl.json keys in this task.
- Produces: `Bestelling.afwijsreden?: string | null`.

- [ ] **Step 1: Add `afwijsreden` to the `Bestelling` type**

In `src/components/beheer/BestellingenSection.tsx`, change:
```ts
export interface Bestelling {
  id: string;
  klantId: string;
  companyName: string;
  bestelnr: string;
  zendingnummer?: string | null;
  besteldatum: string;
  status: 'Te beoordelen' | 'Te versturen naar drukker' | 'Verstuurd naar drukker' | 'Te factureren' | 'Betaald en afgerond' | 'Afgewezen';
  lineCount: number;
  totalQuantity: number;
  lines: BestellingLine[];
}
```
to:
```ts
export interface Bestelling {
  id: string;
  klantId: string;
  companyName: string;
  bestelnr: string;
  zendingnummer?: string | null;
  besteldatum: string;
  status: 'Te beoordelen' | 'Te versturen naar drukker' | 'Verstuurd naar drukker' | 'Te factureren' | 'Betaald en afgerond' | 'Afgewezen';
  lineCount: number;
  totalQuantity: number;
  lines: BestellingLine[];
  afwijsreden?: string | null;
}
```

- [ ] **Step 2: Write the failing component tests**

In `tests/components/beheer/BestellingModal.test.tsx`, replace:
```ts
  it('rejects the bestelling and calls onUpdated with status Afgewezen', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const { onUpdated } = renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'Afgewezen' }) })
      )
    );
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ ...BESTELLING, status: 'Afgewezen' }));
  });

  it('shows an error and does not call onUpdated when the update request fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const { onUpdated } = renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen'));

    expect(await screen.findByTestId('bestelling-modal-error')).toBeInTheDocument();
    expect(onUpdated).not.toHaveBeenCalled();
  });
```
with:
```ts
  it('opens the afwijzen confirmation without patching immediately', () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen'));
    expect(screen.getByTestId('bestelling-modal-afwijzen-bevestiging')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/bestelheaders/header-1',
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('disables the afwijzen confirm button until a reason is entered', () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen'));
    expect(screen.getByTestId('bestelling-modal-afwijzen-bevestigen')).toBeDisabled();
    fireEvent.change(screen.getByTestId('bestelling-modal-afwijzen-bevestiging-reden'), {
      target: { value: 'Klant heeft geannuleerd' },
    });
    expect(screen.getByTestId('bestelling-modal-afwijzen-bevestigen')).not.toBeDisabled();
  });

  it('rejects the bestelling with the given reason and calls onUpdated with afwijsreden', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const { onUpdated } = renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen'));
    fireEvent.change(screen.getByTestId('bestelling-modal-afwijzen-bevestiging-reden'), {
      target: { value: 'Klant heeft geannuleerd' },
    });
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen-bevestigen'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'Afgewezen', afwijsreden: 'Klant heeft geannuleerd' }),
        })
      )
    );
    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith({
        ...BESTELLING,
        status: 'Afgewezen',
        afwijsreden: 'Klant heeft geannuleerd',
      })
    );
  });

  it('cancels the afwijzen confirmation without patching, and returns to the normal view', () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen'));
    fireEvent.change(screen.getByTestId('bestelling-modal-afwijzen-bevestiging-reden'), {
      target: { value: 'Wordt niet verstuurd' },
    });
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen-annuleren'));
    expect(screen.queryByTestId('bestelling-modal-afwijzen-bevestiging')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/bestelheaders/header-1',
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('shows the stored afwijsreden when the bestelling is Afgewezen', () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal({ ...BESTELLING, status: 'Afgewezen', afwijsreden: 'Klant heeft geannuleerd' });
    expect(screen.getByTestId('bestelling-modal-afwijsreden')).toHaveTextContent('Klant heeft geannuleerd');
  });

  it('does not show an afwijsreden block for a bestelling that is not Afgewezen', () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal(BESTELLING);
    expect(screen.queryByTestId('bestelling-modal-afwijsreden')).not.toBeInTheDocument();
  });

  it('shows an error and does not call onUpdated when the update request fails', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith('/statushistorie') || !String(url).includes('/bestelheaders/header-1')
        ? { ok: true, json: async () => [] }
        : Promise.reject(new Error('offline'))
    );
    const { onUpdated } = renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen'));
    fireEvent.change(screen.getByTestId('bestelling-modal-afwijzen-bevestiging-reden'), {
      target: { value: 'Reden' },
    });
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen-bevestigen'));

    expect(await screen.findByTestId('bestelling-modal-error')).toBeInTheDocument();
    expect(onUpdated).not.toHaveBeenCalled();
  });
```

Also replace the two logging tests:
```ts
  it('logs bestelling_afgewezen with the logged-in medewerker on rejection', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'bestelling_afgewezen',
        'GD-00101'
      )
    );
  });

  it('does not log when the update request fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen'));
    await screen.findByTestId('bestelling-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });
```
with:
```ts
  it('logs bestelling_afgewezen with the reason included', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen'));
    fireEvent.change(screen.getByTestId('bestelling-modal-afwijzen-bevestiging-reden'), {
      target: { value: 'Klant heeft geannuleerd' },
    });
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen-bevestigen'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'bestelling_afgewezen',
        'GD-00101: Klant heeft geannuleerd'
      )
    );
  });

  it('does not log when the update request fails', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith('/statushistorie') || !String(url).includes('/bestelheaders/header-1')
        ? { ok: true, json: async () => [] }
        : Promise.reject(new Error('offline'))
    );
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen'));
    fireEvent.change(screen.getByTestId('bestelling-modal-afwijzen-bevestiging-reden'), {
      target: { value: 'Reden' },
    });
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen-bevestigen'));
    await screen.findByTestId('bestelling-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });
```

Note on the `fetchMock.mockImplementation` fallbacks above: `BestellingModal` fires a `GET .../statushistorie` on mount (mocked separately in `beforeEach`) in addition to the `PATCH` under test — a blanket `mockRejectedValue` would also break the mount-time fetch and make the confirmation never render. The implementation used here only rejects the specific `PATCH /api/bestelheaders/header-1` call.

- [ ] **Step 3: Run the tests, verify the new/changed ones fail**

Run:
```bash
npx vitest run tests/components/beheer/BestellingModal.test.tsx
```
Expected: FAIL — same reasons as Task 3's Step 4, for the `bestelling-modal-*` testids.

- [ ] **Step 4: Wire the confirmation into `BestellingModal.tsx`**

Add the import (`src/components/beheer/BestellingModal.tsx:7`, right after the `logActiviteit` import):
```ts
import { logActiviteit } from '@/lib/logActiviteit';
import { useAfwijzenBevestiging, AfwijzenBevestigingTekst, AfwijzenBevestigingActies } from './afwijzenBevestiging';
```

Add the hook call right after `const { historie } = useBestellingHistorie(bestelling?.id ?? null);` (`BestellingModal.tsx:88`):
```ts
  const { historie } = useBestellingHistorie(bestelling?.id ?? null);
  const bevestigingAfwijzen = useAfwijzenBevestiging();
```

Extend the reset effect (`BestellingModal.tsx:90-98`) — change:
```ts
  useEffect(() => {
    if (bestelling) {
      setError(null);
      setPrijsDrafts({});
      setEditingLineId(null);
      setLineDraft(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bestelling?.id]);
```
to:
```ts
  useEffect(() => {
    if (bestelling) {
      setError(null);
      setPrijsDrafts({});
      setEditingLineId(null);
      setLineDraft(null);
      bevestigingAfwijzen.annuleer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bestelling?.id]);
```

Replace `handleAfwijzen` (`BestellingModal.tsx:138-152`) — change:
```ts
  async function handleAfwijzen() {
    if (!bestelling) return;
    try {
      const response = await fetch(`/api/bestelheaders/${bestelling.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Afgewezen' }),
      });
      if (!response.ok) throw new Error('update failed');
      void logActiviteit('bestelling_afgewezen', bestelling.bestelnr);
      onUpdated({ ...bestelling, status: 'Afgewezen' });
    } catch {
      setError(t('bestellingenActionError'));
    }
  }
```
to:
```ts
  async function handleAfwijzen(reden: string) {
    if (!bestelling) return;
    try {
      const response = await fetch(`/api/bestelheaders/${bestelling.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Afgewezen', afwijsreden: reden }),
      });
      if (!response.ok) throw new Error('update failed');
      void logActiviteit('bestelling_afgewezen', `${bestelling.bestelnr}: ${reden}`);
      onUpdated({ ...bestelling, status: 'Afgewezen', afwijsreden: reden });
      bevestigingAfwijzen.annuleer();
    } catch {
      setError(t('bestellingenActionError'));
    }
  }
```

Replace the `'Te beoordelen'` branch of `footerActions` (`BestellingModal.tsx:334-353`) — change:
```tsx
        bestelling && bestelling.status === 'Te beoordelen' ? (
          <>
            <button
              type="button"
              onClick={handleGoedkeuren}
              disabled={heeftOngeprijsdeRegel}
              data-testid="bestelling-modal-goedkeuren"
              className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('bestellingenGoedkeuren')}
            </button>
            <button
              type="button"
              onClick={handleAfwijzen}
              data-testid="bestelling-modal-afwijzen"
              className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
            >
              {t('bestellingenAfwijzen')}
            </button>
          </>
        ) : bestelling && bestelling.status === 'Verstuurd naar drukker' ? (
```
to:
```tsx
        bestelling && bestelling.status === 'Te beoordelen' ? (
          bevestigingAfwijzen.open ? (
            <AfwijzenBevestigingActies
              reden={bevestigingAfwijzen.reden}
              onBevestig={() => handleAfwijzen(bevestigingAfwijzen.reden)}
              onAnnuleer={bevestigingAfwijzen.annuleer}
              testIdPrefix="bestelling"
            />
          ) : (
            <>
              <button
                type="button"
                onClick={handleGoedkeuren}
                disabled={heeftOngeprijsdeRegel}
                data-testid="bestelling-modal-goedkeuren"
                className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
              >
                {t('bestellingenGoedkeuren')}
              </button>
              <button
                type="button"
                onClick={bevestigingAfwijzen.vraag}
                data-testid="bestelling-modal-afwijzen"
                className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('bestellingenAfwijzen')}
              </button>
            </>
          )
        ) : bestelling && bestelling.status === 'Verstuurd naar drukker' ? (
```

Show the stored reason under the status badge in the subtitle (`BestellingModal.tsx:289-294`) — change:
```tsx
              <span
                data-testid="bestelling-modal-status"
                className={`w-fit rounded-full px-3 py-1 text-xs uppercase tracking-wide ${STATUS_BADGE_CLASS[bestelling.status]}`}
              >
                {bestelling.status}
              </span>
            </div>
```
to:
```tsx
              <span
                data-testid="bestelling-modal-status"
                className={`w-fit rounded-full px-3 py-1 text-xs uppercase tracking-wide ${STATUS_BADGE_CLASS[bestelling.status]}`}
              >
                {bestelling.status}
              </span>
              {bestelling.status === 'Afgewezen' && bestelling.afwijsreden && (
                <p data-testid="bestelling-modal-afwijsreden" className="text-xs text-white/60">
                  {t('afwijsredenLabel')}: {bestelling.afwijsreden}
                </p>
              )}
            </div>
```

Replace the body (`BestellingModal.tsx:395-644`, from `{bestelling && (` through the matching closing `)}` right before `</Modal>`) — change the opening:
```tsx
      {bestelling && (
        <div data-testid="bestelling-modal" className="flex flex-col gap-3 text-sm text-white/80">
          <ul className="flex max-h-80 flex-col gap-3 overflow-y-auto text-xs">
```
to:
```tsx
      {bestelling && (
        <>
          {error && (
            <p data-testid="bestelling-modal-error" className="text-xs text-red-400">
              {error}
            </p>
          )}
          <div
            data-testid="bestelling-modal"
            hidden={bevestigingAfwijzen.open}
            className="flex flex-col gap-3 text-sm text-white/80"
          >
            <ul className="flex max-h-80 flex-col gap-3 overflow-y-auto text-xs">
```

Every remaining line of the original body content stays as-is (indented one level deeper), down to the tail. The original tail:
```tsx
          {error && (
            <p data-testid="bestelling-modal-error" className="text-xs text-red-400">
              {error}
            </p>
          )}

          {heeftOngeprijsdeRegel && (
            <p data-testid="bestelling-modal-goedkeuren-blocked" className="text-xs text-amber-400">
              {t('bestellingenGoedkeurenBlocked')}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
```
becomes (the `{error && (...)}` block is **deleted** here — it moved to the top of the fragment above):
```tsx
            {heeftOngeprijsdeRegel && (
              <p data-testid="bestelling-modal-goedkeuren-blocked" className="text-xs text-amber-400">
                {t('bestellingenGoedkeurenBlocked')}
              </p>
            )}
          </div>
          {bevestigingAfwijzen.open && (
            <AfwijzenBevestigingTekst
              item={bestelling.bestelnr}
              reden={bevestigingAfwijzen.reden}
              onWijzigReden={bevestigingAfwijzen.wijzigReden}
              testId="bestelling-modal-afwijzen-bevestiging"
            />
          )}
        </>
      )}
    </Modal>
  );
}
```

- [ ] **Step 5: Run the tests, verify they pass**

Run:
```bash
npx vitest run tests/components/beheer/BestellingModal.test.tsx
```
Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 6: Commit**

```bash
git add src/components/beheer/BestellingenSection.tsx src/components/beheer/BestellingModal.tsx tests/components/beheer/BestellingModal.test.tsx
git commit -m "feat: vraag een verplichte reden bij het afwijzen van een bestelling"
```

---

### Task 5: Full-suite verification and manual browser check

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run:
```bash
npm test
```
Expected: all tests PASS, including the untouched files (regressions would show up here — e.g. an unrelated test asserting on `klant-modal`/`bestelling-modal` DOM structure).

- [ ] **Step 2: Run the linter**

Run:
```bash
npm run lint
```
Expected: no errors. In particular, watch for `react-hooks/exhaustive-deps` on the two extended `useEffect`s in Task 3/4 — they use the existing `// eslint-disable-next-line react-hooks/exhaustive-deps` comment already present on the `BestellingModal` effect, and a newly-added one on the `KlantModal` effect; confirm neither is flagged as unused.

- [ ] **Step 3: Manual check in the browser**

Start the dev server and open `beheer`, log in as a medewerker, then:
1. Open a klant that is still `Beoordelen`, click **Afwijzen**. Confirm the popup appears with a mandatory reason field, and the confirm button stays disabled until you type something.
2. Type a reason, confirm. Confirm the klant's status becomes `Afgewezen` and the modal (reopened) shows the reason under the status badge.
3. Repeat for a bestelling that is `Te beoordelen`.
4. Click Afwijzen and then Annuleren on both — confirm nothing was submitted and the normal view returns.

- [ ] **Step 4: Report**

No commit for this task (verification only). If Steps 1–3 all pass, the feature is complete — see `superpowers:finishing-a-development-branch` for how to integrate.
