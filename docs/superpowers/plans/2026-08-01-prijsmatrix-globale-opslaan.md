# Prijsmatrix Globale Opslaan-knop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Prijsmatrix page's per-cell autosave-on-blur with a single "Opslaan" button that writes all edited cells to the database in one atomic transaction.

**Architecture:** `PUT /api/prijsmatrix` changes contract from a single `{ maatId, materiaalId, prijs }` object to `{ regels: [...] }`, and the handler wraps every upsert in one DB transaction (commit-all-or-rollback-all). `PrijsmatrixSection.tsx` tracks two independent per-cell states — "gewijzigd" (edited, not yet saved) and "opgeslagen" (saved) — and a new Opslaan button collects every gewijzigde cell and sends them in one bulk call.

**Tech Stack:** Next.js 14 App Router API route, `mysql2/promise` pool connection + transaction, React `useState`, Vitest + Testing Library.

## Global Constraints

- Tests connect to the real shared staging MySQL database (`tests/setup.ts` loads `.env.local`) — any row a test creates must be cleaned up in `afterEach`, scoped to exactly that row's captured id. Never a blanket `DELETE`/`TRUNCATE`.
- `messages/nl.json` is the only locale file with a `beheer` namespace (en/de/fr don't have it) — new i18n keys go there only.
- Follow existing code style: no comments unless explaining a non-obvious "why", 2-space indent, `function` declarations for component-local handlers (matches the file being edited).
- TDD: write the failing test, confirm it fails, implement, confirm it passes, then commit — for every step below.

---

### Task 1: Bulk-upsert API endpoint

**Files:**
- Modify: `src/app/api/prijsmatrix/route.ts`
- Test: `tests/app/api/prijsmatrix.test.ts`

**Interfaces:**
- Produces: `PUT /api/prijsmatrix` now accepts `{ regels: Array<{ maatId: string; materiaalId: string; prijs: number | null }> }` and returns `{ ok: true }` (200) on success, or `{ error: 'server-error' }` (500) if any single regel fails — in which case none of the regels in that request are persisted.
- `GET /api/prijsmatrix` is unchanged (still returns `{ prijzen: [...] }`).

- [ ] **Step 1: Replace the PUT-related tests with bulk-contract tests**

Replace the full contents of `tests/app/api/prijsmatrix.test.ts` with:

```typescript
import { describe, expect, it, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { GET as getMatrix, PUT as putMatrix } from '@/app/api/prijsmatrix/route';

const createdMaatIds: string[] = [];
const createdMateriaalsoortIds: string[] = [];
const createdMateriaalIds: string[] = [];

afterEach(async () => {
  const pool = getPool();
  if (createdMaatIds.length > 0) {
    await pool.query('DELETE FROM maten WHERE id IN (?)', [createdMaatIds]);
    createdMaatIds.length = 0;
  }
  if (createdMateriaalIds.length > 0) {
    await pool.query('DELETE FROM materialen WHERE id IN (?)', [createdMateriaalIds]);
    createdMateriaalIds.length = 0;
  }
  if (createdMateriaalsoortIds.length > 0) {
    await pool.query('DELETE FROM materiaalsoorten WHERE id IN (?)', [createdMateriaalsoortIds]);
    createdMateriaalsoortIds.length = 0;
  }
});

async function maakMaat(breedte: number, hoogte: number) {
  const maat = await insertRow<{ id: string }>('maten', { breedte, hoogte } as never);
  createdMaatIds.push(maat.id);
  return maat.id;
}

async function maakMateriaal() {
  const soort = await insertRow<{ id: string }>('materiaalsoorten', { omschrijving: 'Test soort' } as never);
  createdMateriaalsoortIds.push(soort.id);
  const materiaal = await insertRow<{ id: string }>('materialen', {
    materiaalsoortId: soort.id,
    materiaaldikte: 4,
    omschrijving: 'Test materiaal',
  } as never);
  createdMateriaalIds.push(materiaal.id);
  return materiaal.id;
}

async function medewerkerCookie(): Promise<string> {
  const sessionId = await createSession('medewerker', 'staff-1');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

function req(method: string, body?: unknown, cookie?: string) {
  return new Request('http://localhost/api/prijsmatrix', {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function vindRegel(prijzen: Array<{ maatId: string; materiaalId: string; prijs: number | null }>, maatId: string, materiaalId: string) {
  return prijzen.find((r) => r.maatId === maatId && r.materiaalId === materiaalId);
}

describe('prijsmatrix route', () => {
  it('rejects reading the matrix without a medewerker session', async () => {
    const response = await getMatrix(req('GET'));
    expect(response.status).toBe(401);
  });

  it('rejects writing prijzen without a medewerker session', async () => {
    const response = await putMatrix(req('PUT', { regels: [{ maatId: 'x', materiaalId: 'y', prijs: 100 }] }));
    expect(response.status).toBe(401);
  });

  it('includes every maat x materiaal combinatie, with prijs null when unset', async () => {
    const maatId = await maakMaat(70, 70);
    const materiaalId = await maakMateriaal();
    const cookie = await medewerkerCookie();

    const response = await getMatrix(req('GET', undefined, cookie));
    const body = await response.json();
    expect(vindRegel(body.prijzen, maatId, materiaalId)?.prijs).toBeNull();
  });

  it('upserts multiple regels in a single bulk PUT call, then reflects them on the next GET', async () => {
    const maatId1 = await maakMaat(75, 75);
    const maatId2 = await maakMaat(80, 80);
    const materiaalId = await maakMateriaal();
    const cookie = await medewerkerCookie();

    const putResponse = await putMatrix(
      req(
        'PUT',
        {
          regels: [
            { maatId: maatId1, materiaalId, prijs: 250 },
            { maatId: maatId2, materiaalId, prijs: 300 },
          ],
        },
        cookie
      )
    );
    expect(putResponse.status).toBe(200);

    const response = await getMatrix(req('GET', undefined, cookie));
    const body = await response.json();
    expect(vindRegel(body.prijzen, maatId1, materiaalId)?.prijs).toBe(250);
    expect(vindRegel(body.prijzen, maatId2, materiaalId)?.prijs).toBe(300);
  });

  it('updates an existing prijs when the same combinatie is sent again in a later bulk call', async () => {
    const maatId = await maakMaat(85, 85);
    const materiaalId = await maakMateriaal();
    const cookie = await medewerkerCookie();

    await putMatrix(req('PUT', { regels: [{ maatId, materiaalId, prijs: 250 }] }, cookie));
    const updateResponse = await putMatrix(req('PUT', { regels: [{ maatId, materiaalId, prijs: 275 }] }, cookie));
    expect(updateResponse.status).toBe(200);

    const response = await getMatrix(req('GET', undefined, cookie));
    const body = await response.json();
    expect(vindRegel(body.prijzen, maatId, materiaalId)?.prijs).toBe(275);
  });

  it('rolls back the entire batch when one regel is invalid, leaving the valid regel untouched', async () => {
    const maatId = await maakMaat(90, 90);
    const materiaalId = await maakMateriaal();
    const cookie = await medewerkerCookie();
    const nietBestaandeMaatId = randomUUID();

    const putResponse = await putMatrix(
      req(
        'PUT',
        {
          regels: [
            { maatId, materiaalId, prijs: 999 },
            { maatId: nietBestaandeMaatId, materiaalId, prijs: 111 },
          ],
        },
        cookie
      )
    );
    expect(putResponse.status).toBe(500);

    const response = await getMatrix(req('GET', undefined, cookie));
    const body = await response.json();
    expect(vindRegel(body.prijzen, maatId, materiaalId)?.prijs).toBeNull();
  });

  it('automatically drops a prijsmatrix row when its maat is deleted (FK cascade)', async () => {
    const maatId = await maakMaat(76, 76);
    const materiaalId = await maakMateriaal();
    await getPool().query('INSERT INTO prijsmatrix (id, maatId, materiaalId, prijs) VALUES (UUID(), ?, ?, ?)', [
      maatId,
      materiaalId,
      100,
    ]);
    await getPool().query('DELETE FROM maten WHERE id = ?', [maatId]);
    const [rows] = await getPool().query('SELECT 1 FROM prijsmatrix WHERE maatId = ?', [maatId]);
    expect((rows as unknown[]).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify the new/changed ones fail**

Run: `npx vitest run tests/app/api/prijsmatrix.test.ts`
Expected: `rejects writing prijzen without a medewerker session` still passes (401 happens before the body is read), but `upserts multiple regels in a single bulk PUT call...`, `updates an existing prijs when the same combinatie is sent again...`, and `rolls back the entire batch when one regel is invalid...` FAIL — the current handler destructures `{ maatId, materiaalId, prijs }` from a body shaped `{ regels: [...] }`, so all three come back `undefined` and the `INSERT` throws (mysql2 rejects `undefined` bind params), producing a 500 where the tests expect 200 (and the rollback test expects 500 but for the wrong reason — the valid regel isn't even attempted).

- [ ] **Step 3: Implement the bulk PUT handler**

Replace the `PUT` export in `src/app/api/prijsmatrix/route.ts` (keep the existing `GET` export untouched):

```typescript
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { requireMedewerker } from '@/lib/server/requireAuth';
import { withApiErrorHandling } from '@/lib/server/apiRoute';

export const GET = withApiErrorHandling('GET /api/prijsmatrix', async (request: Request) => {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const [rows] = await getPool().query(`
    SELECT m.id AS maatId, mat.id AS materiaalId, pm.prijs AS prijs
    FROM maten m
    CROSS JOIN materialen mat
    LEFT JOIN prijsmatrix pm ON pm.maatId = m.id AND pm.materiaalId = mat.id
  `);
  const prijzen = (rows as Array<{ maatId: string; materiaalId: string; prijs: string | null }>).map((row) => ({
    maatId: row.maatId,
    materiaalId: row.materiaalId,
    prijs: row.prijs != null ? Number(row.prijs) : null,
  }));
  return NextResponse.json({ prijzen });
});

export const PUT = withApiErrorHandling('PUT /api/prijsmatrix', async (request: Request) => {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { regels } = (await request.json()) as {
    regels: Array<{ maatId: string; materiaalId: string; prijs: number | null }>;
  };

  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const regel of regels) {
      await connection.query(
        'INSERT INTO prijsmatrix (id, maatId, materiaalId, prijs) VALUES (UUID(), ?, ?, ?) ON DUPLICATE KEY UPDATE prijs = VALUES(prijs)',
        [regel.maatId, regel.materiaalId, regel.prijs]
      );
    }
    await connection.commit();
    return NextResponse.json({ ok: true });
  } catch {
    await connection.rollback();
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  } finally {
    connection.release();
  }
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/app/api/prijsmatrix.test.ts`
Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/prijsmatrix/route.ts tests/app/api/prijsmatrix.test.ts
git commit -m "feat: change PUT /api/prijsmatrix to a transactional bulk upsert"
```

---

### Task 2: PrijsmatrixSection — dirty-tracking and Opslaan button

**Files:**
- Modify: `src/components/beheer/PrijsmatrixSection.tsx`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/PrijsmatrixSection.test.tsx`

**Interfaces:**
- Consumes: `PUT /api/prijsmatrix` with body `{ regels: Array<{ maatId: string; materiaalId: string; prijs: number | null }> }` (from Task 1).
- Produces: no change to `PrijsmatrixSectionProps` — `onRegelUpdated(maatId, materiaalId, prijs)` is still called once per saved regel, so `BeheerShell.tsx` needs no changes.

- [ ] **Step 1: Add the new i18n keys**

In `messages/nl.json`, in the `beheer` namespace, find the line:

```json
    "prijsmatrixOpgeslagen": "Opgeslagen",
```

Replace it with:

```json
    "prijsmatrixOpgeslagen": "Opgeslagen",
    "prijsmatrixGewijzigd": "Nog niet opgeslagen",
    "prijsmatrixOpslaan": "Opslaan",
    "prijsmatrixOpslaanBezig": "Bezig met opslaan…",
```

- [ ] **Step 2: Replace the component test file with tests for the new behaviour**

Replace the full contents of `tests/components/beheer/PrijsmatrixSection.test.tsx` with:

```typescript
// tests/components/beheer/PrijsmatrixSection.test.tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { PrijsmatrixSection } from '@/components/beheer/PrijsmatrixSection';
import { AdminAuthProvider } from '@/lib/useAdminAuth';
import messages from '../../../messages/nl.json';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const MATEN = [{ id: 'maat-1', breedte: 40, hoogte: 60 }];
const MATERIAALSOORTEN = [{ id: 'soort-1', omschrijving: 'Acryl' }];
const MATERIALEN = [{ id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 3, omschrijving: 'Acryl 3mm' }];
const PRIJSMATRIX = [{ maatId: 'maat-1', materiaalId: 'mat-1', prijs: null }];

function renderSection(overrides = {}) {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <AdminAuthProvider>
        <PrijsmatrixSection
          prijsmatrix={PRIJSMATRIX}
          maten={MATEN}
          materialen={MATERIALEN}
          materiaalsoorten={MATERIAALSOORTEN}
          loadError={null}
          onRegelUpdated={vi.fn()}
          {...overrides}
        />
      </AdminAuthProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
});

describe('PrijsmatrixSection', () => {
  it('shows the load error instead of the grid when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.', prijsmatrix: null });
    expect(screen.getByTestId('prijsmatrix-error')).toHaveTextContent('Kon niet laden.');
  });

  it('renders one row per maat and one column per materiaal', () => {
    renderSection();
    expect(screen.getByTestId('prijsmatrix-cel-maat-1-mat-1')).toBeInTheDocument();
  });

  it('shows an existing prijs pre-filled in its cell', () => {
    renderSection({ prijsmatrix: [{ maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150 }] });
    expect(screen.getByTestId('prijsmatrix-cel-maat-1-mat-1')).toHaveValue(150);
  });

  it('marks a cell as gewijzigd when edited, without saving yet', () => {
    renderSection();
    fireEvent.change(screen.getByTestId('prijsmatrix-cel-maat-1-mat-1'), { target: { value: '175' } });
    expect(screen.getByTestId('prijsmatrix-gewijzigd-maat-1-mat-1')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('unmarks a cell as gewijzigd when its value is edited back to the saved prijs', () => {
    renderSection({ prijsmatrix: [{ maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150 }] });
    const input = screen.getByTestId('prijsmatrix-cel-maat-1-mat-1');
    fireEvent.change(input, { target: { value: '175' } });
    expect(screen.getByTestId('prijsmatrix-gewijzigd-maat-1-mat-1')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '150' } });
    expect(screen.queryByTestId('prijsmatrix-gewijzigd-maat-1-mat-1')).not.toBeInTheDocument();
  });

  it('disables the Opslaan button until a cell is edited', () => {
    renderSection();
    expect(screen.getByTestId('prijsmatrix-opslaan')).toBeDisabled();
    fireEvent.change(screen.getByTestId('prijsmatrix-cel-maat-1-mat-1'), { target: { value: '175' } });
    expect(screen.getByTestId('prijsmatrix-opslaan')).toBeEnabled();
  });

  it('saves all gewijzigde cellen in one bulk PUT call when Opslaan is clicked', async () => {
    const onRegelUpdated = vi.fn();
    const materialen = [
      { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 3, omschrijving: 'Acryl 3mm' },
      { id: 'mat-2', materiaalsoortId: 'soort-1', materiaaldikte: 5, omschrijving: 'Acryl 5mm' },
    ];
    const prijsmatrix = [
      { maatId: 'maat-1', materiaalId: 'mat-1', prijs: null },
      { maatId: 'maat-1', materiaalId: 'mat-2', prijs: null },
    ];
    renderSection({ onRegelUpdated, materialen, prijsmatrix });

    fireEvent.change(screen.getByTestId('prijsmatrix-cel-maat-1-mat-1'), { target: { value: '175' } });
    fireEvent.change(screen.getByTestId('prijsmatrix-cel-maat-1-mat-2'), { target: { value: '225' } });
    fireEvent.click(screen.getByTestId('prijsmatrix-opslaan'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/prijsmatrix',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            regels: [
              { maatId: 'maat-1', materiaalId: 'mat-1', prijs: 175 },
              { maatId: 'maat-1', materiaalId: 'mat-2', prijs: 225 },
            ],
          }),
        })
      )
    );
    await waitFor(() => expect(screen.getByTestId('prijsmatrix-saved-maat-1-mat-1')).toBeInTheDocument());
    expect(screen.getByTestId('prijsmatrix-saved-maat-1-mat-2')).toBeInTheDocument();
    expect(screen.queryByTestId('prijsmatrix-gewijzigd-maat-1-mat-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('prijsmatrix-gewijzigd-maat-1-mat-2')).not.toBeInTheDocument();
    expect(onRegelUpdated).toHaveBeenCalledWith('maat-1', 'mat-1', 175);
    expect(onRegelUpdated).toHaveBeenCalledWith('maat-1', 'mat-2', 225);
  });

  it('keeps cells marked as gewijzigd and shows an error when the bulk save fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ ok: false }) });
    renderSection();
    const input = screen.getByTestId('prijsmatrix-cel-maat-1-mat-1');
    fireEvent.change(input, { target: { value: '175' } });
    fireEvent.click(screen.getByTestId('prijsmatrix-opslaan'));

    await waitFor(() => expect(screen.getByTestId('prijsmatrix-action-error')).toBeInTheDocument());
    expect(screen.getByTestId('prijsmatrix-gewijzigd-maat-1-mat-1')).toBeInTheDocument();
    expect(screen.queryByTestId('prijsmatrix-saved-maat-1-mat-1')).not.toBeInTheDocument();
  });

  it('renders maten rows sorted by breedte then hoogte ascending', () => {
    const unsortedMaten = [
      { id: 'maat-large', breedte: 100, hoogte: 100 },
      { id: 'maat-small', breedte: 40, hoogte: 60 },
      { id: 'maat-medium', breedte: 60, hoogte: 60 },
    ];
    const prijsmatrix = unsortedMaten.map((maat) => ({
      maatId: maat.id,
      materiaalId: 'mat-1',
      prijs: null,
    }));
    renderSection({ maten: unsortedMaten, prijsmatrix });

    const rows = screen.getAllByRole('row');
    const rowLabels = rows.slice(1).map((row) => row.querySelector('td')?.textContent);

    expect(rowLabels).toEqual(['40×60', '60×60', '100×100']);
  });

  it('renders materialen columns grouped by materiaalsoort then sorted by dikte ascending', () => {
    const materiaalsoorten = [
      { id: 'soort-A', omschrijving: 'Acryl' },
      { id: 'soort-B', omschrijving: 'Glas' },
    ];
    const unsortedMaterialen = [
      { id: 'mat-glas-5', materiaalsoortId: 'soort-B', materiaaldikte: 5, omschrijving: 'Glas 5mm' },
      { id: 'mat-acryl-3', materiaalsoortId: 'soort-A', materiaaldikte: 3, omschrijving: 'Acryl 3mm' },
      { id: 'mat-glas-3', materiaalsoortId: 'soort-B', materiaaldikte: 3, omschrijving: 'Glas 3mm' },
      { id: 'mat-acryl-5', materiaalsoortId: 'soort-A', materiaaldikte: 5, omschrijving: 'Acryl 5mm' },
    ];
    const prijsmatrix = unsortedMaterialen.map((mat) => ({
      maatId: 'maat-1',
      materiaalId: mat.id,
      prijs: null,
    }));

    renderSection({
      maten: [{ id: 'maat-1', breedte: 40, hoogte: 60 }],
      materiaalsoorten,
      materialen: unsortedMaterialen,
      prijsmatrix,
    });

    const headerRow = screen.getAllByRole('row')[0];
    const headers = Array.from(headerRow.querySelectorAll('th')).slice(1);
    const headerTexts = headers.map((h) => h.textContent);

    expect(headerTexts).toEqual(['3mm Acryl', '5mm Acryl', '3mm Glas', '5mm Glas']);
  });
});
```

- [ ] **Step 3: Run the tests to verify the new ones fail**

Run: `npx vitest run tests/components/beheer/PrijsmatrixSection.test.tsx`
Expected: the pre-existing tests (load error, row/column rendering, sorting) PASS; the new tests FAIL because `prijsmatrix-gewijzigd-*` and `prijsmatrix-opslaan` don't exist yet, and the bulk-save test's `fetchMock` assertion never resolves.

- [ ] **Step 4: Rewrite `PrijsmatrixSection.tsx`**

Replace the full contents of `src/components/beheer/PrijsmatrixSection.tsx` with:

```typescript
'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Maat, Materiaal, Materiaalsoort } from './materiaalTypes';

interface PrijsmatrixRegel {
  maatId: string;
  materiaalId: string;
  prijs: number | null;
}

interface PrijsmatrixSectionProps {
  prijsmatrix: PrijsmatrixRegel[] | null;
  maten: Maat[] | null;
  materialen: Materiaal[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  loadError: string | null;
  onRegelUpdated: (maatId: string, materiaalId: string, prijs: number | null) => void;
}

export function PrijsmatrixSection({
  prijsmatrix,
  maten,
  materialen,
  materiaalsoorten,
  loadError,
  onRegelUpdated,
}: PrijsmatrixSectionProps) {
  const t = useTranslations('beheer');
  const { user } = useAdminAuth();
  const [inputWaarden, setInputWaarden] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [opgeslagenCellen, setOpgeslagenCellen] = useState<Record<string, boolean>>({});
  const [gewijzigdeCellen, setGewijzigdeCellen] = useState<Record<string, { maatId: string; materiaalId: string }>>(
    {}
  );
  const [isSaving, setIsSaving] = useState(false);

  const soortNaamById = useMemo(() => {
    const map = new Map<string, string>();
    (materiaalsoorten ?? []).forEach((soort) => map.set(soort.id, soort.omschrijving));
    return map;
  }, [materiaalsoorten]);

  const gesorteerdeMaten = useMemo(() => {
    return [...(maten ?? [])].sort((a, b) => a.breedte - b.breedte || a.hoogte - b.hoogte);
  }, [maten]);

  const gesorteerdeMaterialen = useMemo(() => {
    return [...(materialen ?? [])].sort((a, b) => {
      const soortA = soortNaamById.get(a.materiaalsoortId) ?? a.materiaalsoortId;
      const soortB = soortNaamById.get(b.materiaalsoortId) ?? b.materiaalsoortId;
      return soortA.localeCompare(soortB) || a.materiaaldikte - b.materiaaldikte;
    });
  }, [materialen, soortNaamById]);

  if (loadError) {
    return (
      <p data-testid="prijsmatrix-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (prijsmatrix === null || maten === null || materialen === null) {
    return null;
  }

  function key(maatId: string, materiaalId: string) {
    return `${maatId}:${materiaalId}`;
  }

  function opgeslagenWaarde(maatId: string, materiaalId: string): string {
    const regel = prijsmatrix!.find((r) => r.maatId === maatId && r.materiaalId === materiaalId);
    return regel?.prijs != null ? String(regel.prijs) : '';
  }

  function huidigeWaarde(maatId: string, materiaalId: string): string {
    const bewerkt = inputWaarden[key(maatId, materiaalId)];
    if (bewerkt !== undefined) return bewerkt;
    return opgeslagenWaarde(maatId, materiaalId);
  }

  function handleChange(maatId: string, materiaalId: string, value: string) {
    const cellKey = key(maatId, materiaalId);
    setInputWaarden((current) => ({ ...current, [cellKey]: value }));
    setOpgeslagenCellen((current) => {
      if (!current[cellKey]) return current;
      const { [cellKey]: _verwijderd, ...rest } = current;
      return rest;
    });
    setGewijzigdeCellen((current) => {
      const isGewijzigd = value !== opgeslagenWaarde(maatId, materiaalId);
      if (isGewijzigd) {
        return { ...current, [cellKey]: { maatId, materiaalId } };
      }
      if (!current[cellKey]) return current;
      const { [cellKey]: _verwijderd, ...rest } = current;
      return rest;
    });
  }

  async function handleOpslaan() {
    const gewijzigd = Object.entries(gewijzigdeCellen);
    if (gewijzigd.length === 0) return;

    setIsSaving(true);
    const regels = gewijzigd.map(([, { maatId, materiaalId }]) => {
      const raw = huidigeWaarde(maatId, materiaalId);
      return { maatId, materiaalId, prijs: raw === '' ? null : Number(raw) };
    });

    try {
      const response = await fetch('/api/prijsmatrix', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ regels }),
      });
      if (!response.ok) throw new Error('save failed');

      regels.forEach(({ maatId, materiaalId, prijs }) => {
        onRegelUpdated(maatId, materiaalId, prijs);
        const materiaalNaam = materialen!.find((m) => m.id === materiaalId)?.omschrijving ?? materiaalId;
        const maat = maten!.find((m) => m.id === maatId);
        void logActiviteit(
          'prijsmatrix_gewijzigd',
          actorFromMedewerker(user),
          maat ? `${maat.breedte}×${maat.hoogte} — ${materiaalNaam}` : materiaalNaam
        );
      });

      setOpgeslagenCellen((current) => {
        const next = { ...current };
        gewijzigd.forEach(([cellKey]) => {
          next[cellKey] = true;
        });
        return next;
      });
      setGewijzigdeCellen({});
      setActionError(null);
    } catch {
      setActionError(t('prijsmatrixActionError'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div data-testid="prijsmatrix-section">
      <p className="mb-3 text-xs uppercase tracking-wide text-white/60">{t('prijsmatrixTitle')}</p>
      <table className="border-collapse text-sm text-white/80">
        <thead>
          <tr>
            <th className="border border-white/10 px-2 py-1"></th>
            {gesorteerdeMaterialen.map((materiaal) => (
              <th key={materiaal.id} className="border border-white/10 px-2 py-1 text-xs font-semibold">
                {`${materiaal.materiaaldikte}mm ${soortNaamById.get(materiaal.materiaalsoortId) ?? ''}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {gesorteerdeMaten.map((maat) => (
            <tr key={maat.id}>
              <td className="border border-white/10 px-2 py-1 text-xs whitespace-nowrap">
                {`${maat.breedte}×${maat.hoogte}`}
              </td>
              {gesorteerdeMaterialen.map((materiaal) => (
                <td key={materiaal.id} className="border border-white/10 px-2 py-1">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-white/50">€</span>
                    <input
                      type="number"
                      value={huidigeWaarde(maat.id, materiaal.id)}
                      onChange={(event) => handleChange(maat.id, materiaal.id, event.target.value)}
                      data-testid={`prijsmatrix-cel-${maat.id}-${materiaal.id}`}
                      className="w-20 rounded-sm border border-transparent bg-black/40 px-2 py-1 text-sm text-white [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    {gewijzigdeCellen[key(maat.id, materiaal.id)] && (
                      <span
                        data-testid={`prijsmatrix-gewijzigd-${maat.id}-${materiaal.id}`}
                        className="text-xs text-amber-400"
                        title={t('prijsmatrixGewijzigd')}
                      >
                        ●
                      </span>
                    )}
                    {opgeslagenCellen[key(maat.id, materiaal.id)] && (
                      <span
                        data-testid={`prijsmatrix-saved-${maat.id}-${materiaal.id}`}
                        className="text-xs text-emerald-400"
                        title={t('prijsmatrixOpgeslagen')}
                      >
                        ✓
                      </span>
                    )}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs normal-case tracking-normal text-white/50">{t('prijsmatrixHint')}</p>
      <button
        type="button"
        onClick={handleOpslaan}
        disabled={Object.keys(gewijzigdeCellen).length === 0 || isSaving}
        data-testid="prijsmatrix-opslaan"
        className="btn-beheer-primary mt-3 rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
      >
        {isSaving ? t('prijsmatrixOpslaanBezig') : t('prijsmatrixOpslaan')}
      </button>
      {actionError && (
        <p data-testid="prijsmatrix-action-error" className="mt-2 text-xs text-red-400">
          {actionError}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/PrijsmatrixSection.test.tsx`
Expected: all 11 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/beheer/PrijsmatrixSection.tsx messages/nl.json tests/components/beheer/PrijsmatrixSection.test.tsx
git commit -m "feat: replace Prijsmatrix autosave-on-blur with a global Opslaan button"
```

---

### Task 3: Manual verification in the browser

**Files:** none (verification only).

- [ ] **Step 1: Run the full relevant test suite**

Run: `npx vitest run tests/app/api/prijsmatrix.test.ts tests/components/beheer/PrijsmatrixSection.test.tsx`
Expected: all tests PASS (7 + 11 = 18 tests).

- [ ] **Step 2: Start the dev server and open the Prijsmatrix beheer page**

Use the Browser pane (`preview_start` with the `dev` launch config), log in as a medewerker, and navigate to the Prijsmatrix section.

- [ ] **Step 3: Verify the dirty → saved flow**

Edit two cells (change their values). Confirm each shows the amber "gewijzigd" dot and the Opslaan button becomes enabled. Click Opslaan. Confirm both cells switch to the green ✓ and the button becomes disabled again. Check the Network tab / `read_network_requests` to confirm exactly one `PUT /api/prijsmatrix` request carrying both regels.

- [ ] **Step 4: Verify failure keeps cells dirty**

With devtools or `read_network_requests`, simulate a failed save (or temporarily stop the dev DB / block the request) and confirm the edited cell keeps its amber dot and the error message appears, without a stray green ✓.

- [ ] **Step 5: Revert any real data changed during manual testing**

If real staging price values were edited during Step 3/4, edit them back to their original values and click Opslaan again, so the shared staging database isn't left with test data.
