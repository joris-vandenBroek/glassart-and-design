# Materiaalsoorten, Materialen & Maten Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 21-07-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three full-CRUD Firestore-backed beheer sections — Materiaalsoorten (new), Materialen and Maten (currently disabled placeholders) — sharing a new generic `useFirestoreCollection` hook, with Materiaalsoorten/Materialen auto-seeded from the homepage "Waarom Glassart & Design" content on first use.

**Architecture:** A new generic `useFirestoreCollection<T>(collectionName, options)` hook in `src/lib/` centralizes fetch/add/update/remove/auto-seed Firestore logic. `BeheerShell` calls this hook once per collection (materiaalsoorten, materialen, maten) and passes `items` + `add`/`update`/`remove` callbacks down as props into three new, self-contained section components (`MateriaalsoortenSection`, `MaterialenSection`, `MatenSection`), each building its own `DataTable` columns and an inline `Modal` add/edit form — mirroring how `KlantenSection`/`KlantModal` already work, but as the first true "add new row" flow in this codebase.

**Tech Stack:** Next.js (client components), Firebase Firestore SDK (`firebase/firestore`), `next-intl`, Vitest + Testing Library.

## Global Constraints

- All new user-facing strings go only into `messages/nl.json`, in the existing `beheer` namespace, following the `{section}{Field}` key convention already used there (e.g. `klantenColStatus`). Do not touch `en.json`/`de.json`/`fr.json` (established convention — see [2026-07-21-beheer-datatabellen-design.md](../specs/2026-07-21-beheer-datatabellen-design.md)).
- The visible "id" of every row is always the Firestore document id (`docSnapshot.id`) — never a user-entered code, never a separate form field.
- `materiaaldikte` is a required numeric field (mm); `0` is a valid, real value (used for "Akoestische stof" seed data) — never treat `0` as "empty" when validating.
- Firestore collection names: `materiaalsoorten`, `materialen`, `maten` (all lower-case, matching the existing `klanten` collection naming).
- Every new/modified component and hook keeps the existing `data-testid` naming convention: `{section}-section`, `{section}-error`, `{entity}-modal`, `{entity}-modal-{field}`, `{entity}-modal-error`, `data-table-row-{id}` (from the existing generic `DataTable`).

---

## File Structure

**New files:**
- `src/components/beheer/materiaalTypes.ts` — shared `Materiaalsoort`/`Materiaal`/`Maat` interfaces (kept in one file, with zero other imports, specifically to avoid a circular import between `MateriaalsoortenSection.tsx` and `MaterialenSection.tsx`, which each need the other's entity type for the delete-block check / dropdown).
- `src/data/materiaalsoortenSeed.ts` — static seed data for `materiaalsoorten`, plus `buildMaterialenSeed()` to compute the `materialen` seed once real `materiaalsoortId`s exist.
- `src/lib/useFirestoreCollection.ts` — generic Firestore CRUD + auto-seed hook.
- `src/components/beheer/MateriaalsoortenSection.tsx` — table + inline add/edit modal.
- `src/components/beheer/MaterialenSection.tsx` — table + inline add/edit modal, with a materiaalsoort dropdown.
- `src/components/beheer/MatenSection.tsx` — table + inline add/edit modal.
- `tests/data/materiaalsoortenSeed.test.ts`
- `tests/lib/useFirestoreCollection.test.tsx`
- `tests/components/beheer/MateriaalsoortenSection.test.tsx`
- `tests/components/beheer/MaterialenSection.test.tsx`
- `tests/components/beheer/MatenSection.test.tsx`

**Modified files:**
- `messages/nl.json` — new `beheer.*` keys.
- `src/components/beheer/BeheerNav.tsx` — new `materiaalsoorten` active item, `materialen`/`maten` moved from disabled to active, new count props.
- `src/components/beheer/BeheerShell.tsx` — wires the 3 new hooks + sections in, computes nav counts.
- `tests/components/beheer/BeheerNav.test.tsx`
- `tests/components/beheer/BeheerShell.test.tsx`

---

### Task 1: Shared entity types + seed data

**Files:**
- Create: `src/components/beheer/materiaalTypes.ts`
- Create: `src/data/materiaalsoortenSeed.ts`
- Test: `tests/data/materiaalsoortenSeed.test.ts`

**Interfaces:**
- Produces: `Materiaalsoort { id: string; omschrijving: string }`, `Materiaal { id: string; materiaalsoortId: string; materiaaldikte: number; omschrijving: string }`, `Maat { id: string; breedte: number; hoogte: number }` — all later tasks import these from `@/components/beheer/materiaalTypes`.
- Produces: `MATERIAALSOORTEN_SEED: Omit<Materiaalsoort, 'id'>[]` and `buildMaterialenSeed(materiaalsoorten: Materiaalsoort[]): Omit<Materiaal, 'id'>[]` — consumed by Task 7 (`BeheerShell`).

- [ ] **Step 1: Create the shared types file**

`src/components/beheer/materiaalTypes.ts`:
```ts
export interface Materiaalsoort {
  id: string;
  omschrijving: string;
}

export interface Materiaal {
  id: string;
  materiaalsoortId: string;
  materiaaldikte: number;
  omschrijving: string;
}

export interface Maat {
  id: string;
  breedte: number;
  hoogte: number;
}
```

- [ ] **Step 2: Write the failing test for the seed data**

`tests/data/materiaalsoortenSeed.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { MATERIAALSOORTEN_SEED, buildMaterialenSeed } from '@/data/materiaalsoortenSeed';
import type { Materiaalsoort } from '@/components/beheer/materiaalTypes';

describe('MATERIAALSOORTEN_SEED', () => {
  it('contains the 4 material types from the homepage', () => {
    expect(MATERIAALSOORTEN_SEED).toEqual([
      { omschrijving: 'Veiligheidsglas' },
      { omschrijving: 'Dibond' },
      { omschrijving: 'Acryl' },
      { omschrijving: 'Akoestische stof' },
    ]);
  });
});

describe('buildMaterialenSeed', () => {
  const SOORTEN: Materiaalsoort[] = [
    { id: 'soort-veiligheidsglas', omschrijving: 'Veiligheidsglas' },
    { id: 'soort-dibond', omschrijving: 'Dibond' },
    { id: 'soort-acryl', omschrijving: 'Acryl' },
    { id: 'soort-akoestisch', omschrijving: 'Akoestische stof' },
  ];

  it('builds one materiaal per homepage entry, referencing the given materiaalsoort ids', () => {
    const result = buildMaterialenSeed(SOORTEN);
    expect(result).toEqual([
      { materiaalsoortId: 'soort-veiligheidsglas', materiaaldikte: 4, omschrijving: 'Onze specialiteit. Kristalhelder, sterk en veilig.' },
      { materiaalsoortId: 'soort-dibond', materiaaldikte: 3, omschrijving: 'Lichtgewicht, stijf en vormvast met een matte uitstraling.' },
      { materiaalsoortId: 'soort-acryl', materiaaldikte: 3, omschrijving: 'Licht en helder met een luxe glanzende look.' },
      { materiaalsoortId: 'soort-acryl', materiaaldikte: 5, omschrijving: 'Extra diepte en stevigheid voor een indrukwekkend effect.' },
      { materiaalsoortId: 'soort-acryl', materiaaldikte: 10, omschrijving: 'Maximale diepwerking voor exclusieve presentatie.' },
      { materiaalsoortId: 'soort-akoestisch', materiaaldikte: 0, omschrijving: 'Verbetert de akoestiek en geeft een warme, moderne uitstraling.' },
    ]);
  });

  it('returns nothing for a materiaalsoort with no seed mapping', () => {
    const result = buildMaterialenSeed([{ id: 'soort-onbekend', omschrijving: 'Onbekend' }]);
    expect(result).toEqual([]);
  });

  it('returns an empty array for an empty materiaalsoorten list', () => {
    expect(buildMaterialenSeed([])).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/data/materiaalsoortenSeed.test.ts`
Expected: FAIL with "Cannot find module '@/data/materiaalsoortenSeed'" (or similar — the module doesn't exist yet).

- [ ] **Step 4: Implement the seed data**

`src/data/materiaalsoortenSeed.ts`:
```ts
import type { Materiaal, Materiaalsoort } from '@/components/beheer/materiaalTypes';

export const MATERIAALSOORTEN_SEED: Omit<Materiaalsoort, 'id'>[] = [
  { omschrijving: 'Veiligheidsglas' },
  { omschrijving: 'Dibond' },
  { omschrijving: 'Acryl' },
  { omschrijving: 'Akoestische stof' },
];

const MATERIAAL_SEED_BY_SOORT: Record<string, { materiaaldikte: number; omschrijving: string }[]> = {
  Veiligheidsglas: [
    { materiaaldikte: 4, omschrijving: 'Onze specialiteit. Kristalhelder, sterk en veilig.' },
  ],
  Dibond: [
    { materiaaldikte: 3, omschrijving: 'Lichtgewicht, stijf en vormvast met een matte uitstraling.' },
  ],
  Acryl: [
    { materiaaldikte: 3, omschrijving: 'Licht en helder met een luxe glanzende look.' },
    { materiaaldikte: 5, omschrijving: 'Extra diepte en stevigheid voor een indrukwekkend effect.' },
    { materiaaldikte: 10, omschrijving: 'Maximale diepwerking voor exclusieve presentatie.' },
  ],
  'Akoestische stof': [
    { materiaaldikte: 0, omschrijving: 'Verbetert de akoestiek en geeft een warme, moderne uitstraling.' },
  ],
};

export function buildMaterialenSeed(materiaalsoorten: Materiaalsoort[]): Omit<Materiaal, 'id'>[] {
  return materiaalsoorten.flatMap((soort) =>
    (MATERIAAL_SEED_BY_SOORT[soort.omschrijving] ?? []).map((entry) => ({
      materiaalsoortId: soort.id,
      materiaaldikte: entry.materiaaldikte,
      omschrijving: entry.omschrijving,
    }))
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/data/materiaalsoortenSeed.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/beheer/materiaalTypes.ts src/data/materiaalsoortenSeed.ts tests/data/materiaalsoortenSeed.test.ts
git commit -m "feat: add materiaal entity types and homepage-derived seed data"
```

---

### Task 2: `useFirestoreCollection` generic hook

**Files:**
- Create: `src/lib/useFirestoreCollection.ts`
- Test: `tests/lib/useFirestoreCollection.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (only `@/lib/firebase`'s `db` export, which already exists).
- Produces: `useFirestoreCollection<T extends { id: string }>(collectionName: string, options?: { seed?: Omit<T, 'id'>[]; skip?: boolean }): { items: T[] | null; error: 'load' | 'action' | null; add: (data: Omit<T, 'id'>) => Promise<boolean>; update: (id: string, data: Partial<Omit<T, 'id'>>) => Promise<boolean>; remove: (id: string) => Promise<boolean>; refetch: () => Promise<boolean> }` — consumed by Task 7 (`BeheerShell`) and exercised indirectly via the section components in Tasks 4–6 (which receive `items`/`add`/`update`/`remove` as props, not the hook itself).

- [ ] **Step 1: Write the failing tests**

`tests/lib/useFirestoreCollection.test.tsx`:
```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { useFirestoreCollection } from '@/lib/useFirestoreCollection';

const getDocsMock = vi.fn();
const addDocMock = vi.fn();
const updateDocMock = vi.fn();
const deleteDocMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ name })),
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  addDoc: (...args: unknown[]) => addDocMock(...args),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
}));

function makeSnapshot(docsData: Array<{ id: string; data: Record<string, unknown> }>) {
  return {
    empty: docsData.length === 0,
    docs: docsData.map(({ id, data }) => ({ id, data: () => data })),
  };
}

interface Item {
  id: string;
  naam: string;
}

function TestConsumer({ seed, skip }: { seed?: Omit<Item, 'id'>[]; skip?: boolean }) {
  const { items, error, add, update, remove } = useFirestoreCollection<Item>('dingen', { seed, skip });
  return (
    <div>
      <div data-testid="items">
        {items === null ? 'loading' : items.length === 0 ? 'empty' : items.map((item) => item.naam).join(',')}
      </div>
      <div data-testid="error">{error ?? 'none'}</div>
      <button type="button" data-testid="add" onClick={() => add({ naam: 'Nieuw' })} />
      <button
        type="button"
        data-testid="update"
        onClick={() => update(items?.[0]?.id ?? '', { naam: 'Aangepast' })}
      />
      <button type="button" data-testid="remove" onClick={() => remove(items?.[0]?.id ?? '')} />
    </div>
  );
}

beforeEach(() => {
  getDocsMock.mockReset();
  addDocMock.mockReset();
  updateDocMock.mockReset();
  deleteDocMock.mockReset();
});

describe('useFirestoreCollection', () => {
  it('fetches and exposes items with the Firestore doc id spread in', async () => {
    getDocsMock.mockResolvedValue(makeSnapshot([{ id: 'a', data: { naam: 'Een' } }]));
    render(<TestConsumer />);
    expect(screen.getByTestId('items')).toHaveTextContent('loading');
    await waitFor(() => expect(screen.getByTestId('items')).toHaveTextContent('Een'));
  });

  it('sets a load error when getDocs fails', async () => {
    getDocsMock.mockRejectedValue(new Error('offline'));
    render(<TestConsumer />);
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('load'));
  });

  it('seeds the collection when it is empty and a seed is given, then exposes the seeded items', async () => {
    getDocsMock
      .mockResolvedValueOnce(makeSnapshot([]))
      .mockResolvedValueOnce(makeSnapshot([{ id: 'seeded-1', data: { naam: 'Seed' } }]));
    addDocMock.mockResolvedValue({ id: 'seeded-1' });
    render(<TestConsumer seed={[{ naam: 'Seed' }]} />);
    await waitFor(() => expect(addDocMock).toHaveBeenCalledWith({ name: 'dingen' }, { naam: 'Seed' }));
    await waitFor(() => expect(screen.getByTestId('items')).toHaveTextContent('Seed'));
  });

  it('does not seed an empty collection when no seed is given', async () => {
    getDocsMock.mockResolvedValue(makeSnapshot([]));
    render(<TestConsumer />);
    await waitFor(() => expect(screen.getByTestId('items')).toHaveTextContent('empty'));
    expect(addDocMock).not.toHaveBeenCalled();
  });

  it('does not fetch while skip is true', () => {
    render(<TestConsumer seed={[{ naam: 'Seed' }]} skip />);
    expect(getDocsMock).not.toHaveBeenCalled();
    expect(addDocMock).not.toHaveBeenCalled();
  });

  it('adds an item and refetches', async () => {
    getDocsMock
      .mockResolvedValueOnce(makeSnapshot([]))
      .mockResolvedValueOnce(makeSnapshot([{ id: 'new-1', data: { naam: 'Nieuw' } }]));
    addDocMock.mockResolvedValue({ id: 'new-1' });
    render(<TestConsumer />);
    await waitFor(() => expect(screen.getByTestId('items')).toHaveTextContent('empty'));
    fireEvent.click(screen.getByTestId('add'));
    await waitFor(() => expect(screen.getByTestId('items')).toHaveTextContent('Nieuw'));
  });

  it('updates an item and refetches', async () => {
    getDocsMock
      .mockResolvedValueOnce(makeSnapshot([{ id: 'a', data: { naam: 'Een' } }]))
      .mockResolvedValueOnce(makeSnapshot([{ id: 'a', data: { naam: 'Aangepast' } }]));
    updateDocMock.mockResolvedValue(undefined);
    render(<TestConsumer />);
    await waitFor(() => expect(screen.getByTestId('items')).toHaveTextContent('Een'));
    fireEvent.click(screen.getByTestId('update'));
    await waitFor(() => expect(screen.getByTestId('items')).toHaveTextContent('Aangepast'));
    expect(updateDocMock).toHaveBeenCalledWith({ collectionName: 'dingen', id: 'a' }, { naam: 'Aangepast' });
  });

  it('removes an item and refetches', async () => {
    getDocsMock
      .mockResolvedValueOnce(makeSnapshot([{ id: 'a', data: { naam: 'Een' } }]))
      .mockResolvedValueOnce(makeSnapshot([]));
    deleteDocMock.mockResolvedValue(undefined);
    render(<TestConsumer />);
    await waitFor(() => expect(screen.getByTestId('items')).toHaveTextContent('Een'));
    fireEvent.click(screen.getByTestId('remove'));
    await waitFor(() => expect(screen.getByTestId('items')).toHaveTextContent('empty'));
  });

  it('sets an action error and keeps existing items when add fails', async () => {
    getDocsMock.mockResolvedValue(makeSnapshot([{ id: 'a', data: { naam: 'Een' } }]));
    addDocMock.mockRejectedValue(new Error('offline'));
    render(<TestConsumer />);
    await waitFor(() => expect(screen.getByTestId('items')).toHaveTextContent('Een'));
    fireEvent.click(screen.getByTestId('add'));
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('action'));
    expect(screen.getByTestId('items')).toHaveTextContent('Een');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/useFirestoreCollection.test.tsx`
Expected: FAIL with "Cannot find module '@/lib/useFirestoreCollection'"

- [ ] **Step 3: Implement the hook**

`src/lib/useFirestoreCollection.ts`:
```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface UseFirestoreCollectionOptions<T> {
  seed?: Omit<T, 'id'>[];
  skip?: boolean;
}

export interface UseFirestoreCollectionResult<T> {
  items: T[] | null;
  error: 'load' | 'action' | null;
  add: (data: Omit<T, 'id'>) => Promise<boolean>;
  update: (id: string, data: Partial<Omit<T, 'id'>>) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  refetch: () => Promise<boolean>;
}

export function useFirestoreCollection<T extends { id: string }>(
  collectionName: string,
  options?: UseFirestoreCollectionOptions<T>
): UseFirestoreCollectionResult<T> {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<'load' | 'action' | null>(null);
  const seedRef = useRef(options?.seed);
  seedRef.current = options?.seed;

  const fetchItems = useCallback(async () => {
    try {
      const snapshot = await getDocs(collection(db, collectionName));
      let docs = snapshot.docs;
      const seed = seedRef.current;
      if (snapshot.empty && seed && seed.length > 0) {
        for (const seedItem of seed) {
          await addDoc(collection(db, collectionName), seedItem);
        }
        const reseeded = await getDocs(collection(db, collectionName));
        docs = reseeded.docs;
      }
      setItems(docs.map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() }) as T));
      setError(null);
      return true;
    } catch {
      setError('load');
      return false;
    }
  }, [collectionName]);

  useEffect(() => {
    if (options?.skip) {
      return;
    }
    fetchItems();
  }, [fetchItems, options?.skip]);

  const add = useCallback(
    async (data: Omit<T, 'id'>) => {
      try {
        await addDoc(collection(db, collectionName), data);
        await fetchItems();
        return true;
      } catch {
        setError('action');
        return false;
      }
    },
    [collectionName, fetchItems]
  );

  const update = useCallback(
    async (id: string, data: Partial<Omit<T, 'id'>>) => {
      try {
        await updateDoc(doc(db, collectionName, id), data);
        await fetchItems();
        return true;
      } catch {
        setError('action');
        return false;
      }
    },
    [collectionName, fetchItems]
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await deleteDoc(doc(db, collectionName, id));
        await fetchItems();
        return true;
      } catch {
        setError('action');
        return false;
      }
    },
    [collectionName, fetchItems]
  );

  return { items, error, add, update, remove, refetch: fetchItems };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/useFirestoreCollection.test.tsx`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/useFirestoreCollection.ts tests/lib/useFirestoreCollection.test.tsx
git commit -m "feat: add generic useFirestoreCollection CRUD + auto-seed hook"
```

---

### Task 3: Translations + `BeheerNav` — new/activated nav items

**Files:**
- Modify: `messages/nl.json` (insert new keys inside the existing `"beheer": { ... }` block, after `"facturenEmpty"`)
- Modify: `src/components/beheer/BeheerNav.tsx`
- Modify: `tests/components/beheer/BeheerNav.test.tsx`

**Interfaces:**
- Produces: `BeheerSection = 'klanten' | 'facturen' | 'materiaalsoorten' | 'materialen' | 'maten'` and `BeheerNavProps` gaining `materiaalsoortenCount: number`, `materialenCount: number`, `matenCount: number` — consumed by Task 7 (`BeheerShell`).

- [ ] **Step 1: Add the new translation keys**

In `messages/nl.json`, inside `"beheer": { ... }`, replace the last line of the block (`"facturenEmpty": "Geen facturen gevonden."`) with itself plus the new keys, so the block ends like this (note: `"navMaten"` and `"navMaterialen"` already exist earlier in the block — do not duplicate them):
```json
    "facturenEmpty": "Geen facturen gevonden.",
    "navMateriaalsoorten": "Materiaalsoorten",
    "materiaalsoortenLoadError": "Kon de materiaalsoorten niet laden. Probeer de pagina te verversen.",
    "materiaalsoortenActionError": "Er is iets misgegaan. Probeer het opnieuw.",
    "materiaalsoortenEmpty": "Geen materiaalsoorten gevonden.",
    "materiaalsoortenColOmschrijving": "Omschrijving",
    "materiaalsoortenLabelOmschrijving": "Omschrijving",
    "materiaalsoortenToevoegen": "Materiaalsoort toevoegen",
    "materiaalsoortenOpslaan": "Opslaan",
    "materiaalsoortenVerwijderen": "Verwijderen",
    "materiaalsoortenVerwijderBlocked": "Deze materiaalsoort is nog gekoppeld aan materialen en kan niet verwijderd worden.",
    "materialenLoadError": "Kon de materialen niet laden. Probeer de pagina te verversen.",
    "materialenActionError": "Er is iets misgegaan. Probeer het opnieuw.",
    "materialenEmpty": "Geen materialen gevonden.",
    "materialenColMateriaalsoort": "Materiaalsoort",
    "materialenColDikte": "Dikte (mm)",
    "materialenColOmschrijving": "Omschrijving",
    "materialenLabelMateriaalsoort": "Materiaalsoort",
    "materialenLabelDikte": "Dikte (mm)",
    "materialenLabelOmschrijving": "Omschrijving",
    "materialenToevoegen": "Materiaal toevoegen",
    "materialenOpslaan": "Opslaan",
    "materialenVerwijderen": "Verwijderen",
    "matenLoadError": "Kon de maten niet laden. Probeer de pagina te verversen.",
    "matenActionError": "Er is iets misgegaan. Probeer het opnieuw.",
    "matenEmpty": "Geen maten gevonden.",
    "matenColBreedte": "Breedte (cm)",
    "matenColHoogte": "Hoogte (cm)",
    "matenLabelBreedte": "Breedte (cm)",
    "matenLabelHoogte": "Hoogte (cm)",
    "matenToevoegen": "Maat toevoegen",
    "matenOpslaan": "Opslaan",
    "matenVerwijderen": "Verwijderen"
```
(This must remain the last content before the closing `}` of the `beheer` object.)

- [ ] **Step 2: Write the failing test for the updated nav**

Replace `tests/components/beheer/BeheerNav.test.tsx` entirely with:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BeheerNav, type BeheerSection } from '@/components/beheer/BeheerNav';
import messages from '../../../messages/nl.json';

function renderNav(activeSection: BeheerSection = 'klanten') {
  const onSelect = vi.fn();
  const onLogout = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <BeheerNav
        activeSection={activeSection}
        onSelect={onSelect}
        onLogout={onLogout}
        klantenCount={3}
        facturenCount={7}
        materiaalsoortenCount={4}
        materialenCount={6}
        matenCount={2}
      />
    </NextIntlClientProvider>
  );
  return { onSelect, onLogout };
}

describe('BeheerNav', () => {
  it('renders the 5 active items with their counters, and the 5 disabled placeholder items', () => {
    renderNav();
    expect(screen.getByTestId('beheer-nav-klanten')).toHaveTextContent('Klanten');
    expect(screen.getByTestId('beheer-nav-klanten')).toHaveTextContent('3');
    expect(screen.getByTestId('beheer-nav-facturen')).toHaveTextContent('Facturen');
    expect(screen.getByTestId('beheer-nav-facturen')).toHaveTextContent('7');
    expect(screen.getByTestId('beheer-nav-materiaalsoorten')).toHaveTextContent('Materiaalsoorten');
    expect(screen.getByTestId('beheer-nav-materiaalsoorten')).toHaveTextContent('4');
    expect(screen.getByTestId('beheer-nav-materialen')).toHaveTextContent('Materialen');
    expect(screen.getByTestId('beheer-nav-materialen')).toHaveTextContent('6');
    expect(screen.getByTestId('beheer-nav-maten')).toHaveTextContent('Maten');
    expect(screen.getByTestId('beheer-nav-maten')).toHaveTextContent('2');

    ['bestellingen', 'retouren', 'prijsgroepen', 'kunstwerken', 'glassartDesign'].forEach((id) => {
      expect(screen.getByTestId(`beheer-nav-${id}`)).toBeDisabled();
    });
  });

  it('marks the active section with aria-current', () => {
    renderNav('materialen');
    expect(screen.getByTestId('beheer-nav-materialen')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('beheer-nav-klanten')).not.toHaveAttribute('aria-current');
  });

  it('calls onSelect with the clicked section id', () => {
    const { onSelect } = renderNav();
    fireEvent.click(screen.getByTestId('beheer-nav-materiaalsoorten'));
    expect(onSelect).toHaveBeenCalledWith('materiaalsoorten');
  });

  it('calls onLogout when the logout button is clicked', () => {
    const { onLogout } = renderNav();
    fireEvent.click(screen.getByTestId('beheer-nav-logout'));
    expect(onLogout).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/components/beheer/BeheerNav.test.tsx`
Expected: FAIL — `materiaalsoortenCount` prop unknown to component, `beheer-nav-materiaalsoorten` not found, `beheer-nav-materialen`/`beheer-nav-maten` are disabled instead of active.

- [ ] **Step 4: Update `BeheerNav.tsx`**

Replace the whole file with:
```tsx
'use client';

import { useTranslations } from 'next-intl';

export type BeheerSection = 'klanten' | 'facturen' | 'materiaalsoorten' | 'materialen' | 'maten';

interface BeheerNavProps {
  activeSection: BeheerSection;
  onSelect: (section: BeheerSection) => void;
  onLogout: () => void;
  klantenCount: number;
  facturenCount: number;
  materiaalsoortenCount: number;
  materialenCount: number;
  matenCount: number;
}

const ACTIVE_ITEMS: { id: BeheerSection; labelKey: string }[] = [
  { id: 'klanten', labelKey: 'navKlanten' },
  { id: 'facturen', labelKey: 'navFacturen' },
  { id: 'materiaalsoorten', labelKey: 'navMateriaalsoorten' },
  { id: 'materialen', labelKey: 'navMaterialen' },
  { id: 'maten', labelKey: 'navMaten' },
];

const DISABLED_ITEMS: { id: string; labelKey: string }[] = [
  { id: 'bestellingen', labelKey: 'navBestellingen' },
  { id: 'retouren', labelKey: 'navRetouren' },
  { id: 'prijsgroepen', labelKey: 'navPrijsgroepen' },
  { id: 'kunstwerken', labelKey: 'navKunstwerken' },
  { id: 'glassartDesign', labelKey: 'navGlassartDesign' },
];

export function BeheerNav({
  activeSection,
  onSelect,
  onLogout,
  klantenCount,
  facturenCount,
  materiaalsoortenCount,
  materialenCount,
  matenCount,
}: BeheerNavProps) {
  const t = useTranslations('beheer');
  const counts: Record<BeheerSection, number> = {
    klanten: klantenCount,
    facturen: facturenCount,
    materiaalsoorten: materiaalsoortenCount,
    materialen: materialenCount,
    maten: matenCount,
  };

  return (
    <nav data-testid="beheer-nav" className="flex flex-col gap-1 text-xs tracking-wide">
      {ACTIVE_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          data-testid={`beheer-nav-${item.id}`}
          aria-current={activeSection === item.id ? 'true' : undefined}
          onClick={() => onSelect(item.id)}
          className={`flex items-center justify-between rounded-sm px-3 py-2 text-left ${
            activeSection === item.id
              ? 'bg-white/15 text-white'
              : 'text-white/60 hover:bg-white/10 hover:text-white'
          }`}
        >
          <span>{t(item.labelKey)}</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.65rem]">{counts[item.id]}</span>
        </button>
      ))}
      {DISABLED_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          disabled
          data-testid={`beheer-nav-${item.id}`}
          className="cursor-not-allowed rounded-sm px-3 py-2 text-left text-white/30"
        >
          {t(item.labelKey)}
        </button>
      ))}
      <button
        type="button"
        data-testid="beheer-nav-logout"
        onClick={onLogout}
        className="mt-4 rounded-sm border border-white/20 px-3 py-2 text-left text-white/60 hover:bg-white/10 hover:text-white"
      >
        {t('logout')}
      </button>
    </nav>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/components/beheer/BeheerNav.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add messages/nl.json src/components/beheer/BeheerNav.tsx tests/components/beheer/BeheerNav.test.tsx
git commit -m "feat: activate Materialen/Maten nav items and add Materiaalsoorten"
```

---

### Task 4: `MateriaalsoortenSection`

**Files:**
- Create: `src/components/beheer/MateriaalsoortenSection.tsx`
- Test: `tests/components/beheer/MateriaalsoortenSection.test.tsx`

**Interfaces:**
- Consumes: `Materiaalsoort`, `Materiaal` from `@/components/beheer/materiaalTypes` (Task 1); `DataTable`/`Column` from `@/components/DataTable`; `Modal` from `@/components/Modal` (both pre-existing, unchanged).
- Produces: `MateriaalsoortenSectionProps = { materiaalsoorten: Materiaalsoort[] | null; materialen: Materiaal[] | null; loadError: string | null; onAdd: (data: Omit<Materiaalsoort, 'id'>) => Promise<boolean>; onUpdate: (id: string, data: Omit<Materiaalsoort, 'id'>) => Promise<boolean>; onRemove: (id: string) => Promise<boolean> }` — consumed by Task 7 (`BeheerShell`).

- [ ] **Step 1: Write the failing tests**

`tests/components/beheer/MateriaalsoortenSection.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MateriaalsoortenSection } from '@/components/beheer/MateriaalsoortenSection';
import type { Materiaalsoort, Materiaal } from '@/components/beheer/materiaalTypes';
import messages from '../../../messages/nl.json';

const SOORTEN: Materiaalsoort[] = [
  { id: 'soort-1', omschrijving: 'Veiligheidsglas' },
  { id: 'soort-2', omschrijving: 'Dibond' },
];

const MATERIALEN: Materiaal[] = [
  { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'Test' },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof MateriaalsoortenSection>> = {}) {
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <MateriaalsoortenSection
        materiaalsoorten={SOORTEN}
        materialen={MATERIALEN}
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

describe('MateriaalsoortenSection', () => {
  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('materiaalsoorten-error')).toHaveTextContent('Kon niet laden.');
    expect(screen.queryByTestId('data-table')).not.toBeInTheDocument();
  });

  it('renders nothing while materiaalsoorten is null and there is no error', () => {
    renderSection({ materiaalsoorten: null });
    expect(screen.queryByTestId('materiaalsoorten-section')).not.toBeInTheDocument();
  });

  it('lists the materiaalsoorten in the table', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-soort-1')).toHaveTextContent('Veiligheidsglas');
    expect(screen.getByTestId('data-table-row-soort-2')).toHaveTextContent('Dibond');
  });

  it('adds a new materiaalsoort and closes the modal', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('materiaalsoorten-add'));
    fireEvent.change(screen.getByTestId('materiaalsoort-modal-omschrijving'), {
      target: { value: 'Acryl' },
    });
    fireEvent.click(screen.getByTestId('materiaalsoort-modal-opslaan'));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ omschrijving: 'Acryl' }));
    await waitFor(() => expect(screen.queryByTestId('materiaalsoort-modal')).not.toBeInTheDocument());
  });

  it('disables Opslaan until omschrijving is filled in', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('materiaalsoorten-add'));
    expect(screen.getByTestId('materiaalsoort-modal-opslaan')).toBeDisabled();
    fireEvent.change(screen.getByTestId('materiaalsoort-modal-omschrijving'), { target: { value: 'X' } });
    expect(screen.getByTestId('materiaalsoort-modal-opslaan')).not.toBeDisabled();
  });

  it('opens a row for editing pre-filled, and updates it', async () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-soort-2'));
    expect(screen.getByTestId('materiaalsoort-modal-omschrijving')).toHaveValue('Dibond');
    fireEvent.change(screen.getByTestId('materiaalsoort-modal-omschrijving'), { target: { value: 'Dibond 3mm' } });
    fireEvent.click(screen.getByTestId('materiaalsoort-modal-opslaan'));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('soort-2', { omschrijving: 'Dibond 3mm' }));
  });

  it('blocks deleting a materiaalsoort that still has materialen referencing it', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-soort-1'));
    fireEvent.click(screen.getByTestId('materiaalsoort-modal-verwijderen'));
    expect(await screen.findByTestId('materiaalsoort-modal-error')).toHaveTextContent(
      'Deze materiaalsoort is nog gekoppeld aan materialen en kan niet verwijderd worden.'
    );
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('deletes a materiaalsoort with no linked materialen', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-soort-2'));
    fireEvent.click(screen.getByTestId('materiaalsoort-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('soort-2'));
    await waitFor(() => expect(screen.queryByTestId('materiaalsoort-modal')).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/MateriaalsoortenSection.test.tsx`
Expected: FAIL with "Cannot find module '@/components/beheer/MateriaalsoortenSection'"

- [ ] **Step 3: Implement the component**

`src/components/beheer/MateriaalsoortenSection.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import type { Materiaalsoort, Materiaal } from './materiaalTypes';

interface MateriaalsoortenSectionProps {
  materiaalsoorten: Materiaalsoort[] | null;
  materialen: Materiaal[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Materiaalsoort, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Materiaalsoort, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

type ModalState = { mode: 'add' } | { mode: 'edit'; materiaalsoort: Materiaalsoort } | null;

export function MateriaalsoortenSection({
  materiaalsoorten,
  materialen,
  loadError,
  onAdd,
  onUpdate,
  onRemove,
}: MateriaalsoortenSectionProps) {
  const t = useTranslations('beheer');
  const [modalState, setModalState] = useState<ModalState>(null);
  const [omschrijving, setOmschrijving] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  if (loadError) {
    return (
      <p data-testid="materiaalsoorten-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (materiaalsoorten === null) {
    return null;
  }

  function openAdd() {
    setOmschrijving('');
    setActionError(null);
    setModalState({ mode: 'add' });
  }

  function openEdit(materiaalsoort: Materiaalsoort) {
    setOmschrijving(materiaalsoort.omschrijving);
    setActionError(null);
    setModalState({ mode: 'edit', materiaalsoort });
  }

  function closeModal() {
    setModalState(null);
  }

  async function handleSave() {
    if (!modalState) return;
    const success =
      modalState.mode === 'add'
        ? await onAdd({ omschrijving })
        : await onUpdate(modalState.materiaalsoort.id, { omschrijving });
    if (success) {
      closeModal();
    } else {
      setActionError(t('materiaalsoortenActionError'));
    }
  }

  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const inUse = (materialen ?? []).some(
      (materiaal) => materiaal.materiaalsoortId === modalState.materiaalsoort.id
    );
    if (inUse) {
      setActionError(t('materiaalsoortenVerwijderBlocked'));
      return;
    }
    const success = await onRemove(modalState.materiaalsoort.id);
    if (success) {
      closeModal();
    } else {
      setActionError(t('materiaalsoortenActionError'));
    }
  }

  const columns: Column<Materiaalsoort>[] = [
    { key: 'omschrijving', label: t('materiaalsoortenColOmschrijving'), filterType: 'text' },
  ];

  return (
    <div data-testid="materiaalsoorten-section">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={openAdd}
          data-testid="materiaalsoorten-add"
          className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
        >
          {t('materiaalsoortenToevoegen')}
        </button>
      </div>
      <DataTable<Materiaalsoort>
        columns={columns}
        rows={materiaalsoorten}
        getRowId={(row) => row.id}
        onRowClick={openEdit}
        emptyLabel={t('materiaalsoortenEmpty')}
      />
      <Modal isOpen={modalState !== null} onClose={closeModal} closeLabel={t('modalClose')}>
        <div data-testid="materiaalsoort-modal" className="flex flex-col gap-2 text-sm text-white/80">
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('materiaalsoortenLabelOmschrijving')}
            <input
              type="text"
              value={omschrijving}
              onChange={(event) => setOmschrijving(event.target.value)}
              data-testid="materiaalsoort-modal-omschrijving"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>

          {actionError && (
            <p data-testid="materiaalsoort-modal-error" className="text-xs text-red-400">
              {actionError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!omschrijving}
              data-testid="materiaalsoort-modal-opslaan"
              className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('materiaalsoortenOpslaan')}
            </button>
            {modalState?.mode === 'edit' && (
              <button
                type="button"
                onClick={handleRemove}
                data-testid="materiaalsoort-modal-verwijderen"
                className="rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('materiaalsoortenVerwijderen')}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/MateriaalsoortenSection.test.tsx`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/MateriaalsoortenSection.tsx tests/components/beheer/MateriaalsoortenSection.test.tsx
git commit -m "feat: add MateriaalsoortenSection (CRUD table)"
```

---

### Task 5: `MaterialenSection`

**Files:**
- Create: `src/components/beheer/MaterialenSection.tsx`
- Test: `tests/components/beheer/MaterialenSection.test.tsx`

**Interfaces:**
- Consumes: `Materiaal`, `Materiaalsoort` from `@/components/beheer/materiaalTypes` (Task 1).
- Produces: `MaterialenSectionProps = { materialen: Materiaal[] | null; materiaalsoorten: Materiaalsoort[] | null; loadError: string | null; onAdd: (data: Omit<Materiaal, 'id'>) => Promise<boolean>; onUpdate: (id: string, data: Omit<Materiaal, 'id'>) => Promise<boolean>; onRemove: (id: string) => Promise<boolean> }` — consumed by Task 7 (`BeheerShell`).

- [ ] **Step 1: Write the failing tests**

`tests/components/beheer/MaterialenSection.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MaterialenSection } from '@/components/beheer/MaterialenSection';
import type { Materiaal, Materiaalsoort } from '@/components/beheer/materiaalTypes';
import messages from '../../../messages/nl.json';

const SOORTEN: Materiaalsoort[] = [
  { id: 'soort-1', omschrijving: 'Veiligheidsglas' },
  { id: 'soort-2', omschrijving: 'Acryl' },
];

const MATERIALEN: Materiaal[] = [
  { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'Kristalhelder' },
  { id: 'mat-2', materiaalsoortId: 'soort-2', materiaaldikte: 3, omschrijving: 'Licht en helder' },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof MaterialenSection>> = {}) {
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <MaterialenSection
        materialen={MATERIALEN}
        materiaalsoorten={SOORTEN}
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

describe('MaterialenSection', () => {
  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('materialen-error')).toHaveTextContent('Kon niet laden.');
  });

  it('renders nothing while materialen is null and there is no error', () => {
    renderSection({ materialen: null });
    expect(screen.queryByTestId('materialen-section')).not.toBeInTheDocument();
  });

  it('shows the materiaalsoort name (not the raw id) in the table', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-mat-1')).toHaveTextContent('Veiligheidsglas');
    expect(screen.getByTestId('data-table-row-mat-1')).toHaveTextContent('4');
    expect(screen.getByTestId('data-table-row-mat-2')).toHaveTextContent('Acryl');
  });

  it('filters by materiaalsoort name via the select filter', () => {
    renderSection();
    fireEvent.change(screen.getByTestId('data-table-filter-materiaalsoortNaam'), {
      target: { value: 'Acryl' },
    });
    expect(screen.queryByTestId('data-table-row-mat-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-mat-2')).toBeInTheDocument();
  });

  it('adds a new materiaal with the selected materiaalsoort, dikte and omschrijving', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('materialen-add'));
    fireEvent.change(screen.getByTestId('materiaal-modal-materiaalsoort'), { target: { value: 'soort-2' } });
    fireEvent.change(screen.getByTestId('materiaal-modal-dikte'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('materiaal-modal-omschrijving'), {
      target: { value: 'Extra diepte' },
    });
    fireEvent.click(screen.getByTestId('materiaal-modal-opslaan'));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({
        materiaalsoortId: 'soort-2',
        materiaaldikte: 5,
        omschrijving: 'Extra diepte',
      })
    );
  });

  it('opens a row for editing pre-filled, and updates it', async () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-mat-1'));
    expect(screen.getByTestId('materiaal-modal-materiaalsoort')).toHaveValue('soort-1');
    expect(screen.getByTestId('materiaal-modal-dikte')).toHaveValue(4);
    fireEvent.change(screen.getByTestId('materiaal-modal-dikte'), { target: { value: '6' } });
    fireEvent.click(screen.getByTestId('materiaal-modal-opslaan'));
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('mat-1', {
        materiaalsoortId: 'soort-1',
        materiaaldikte: 6,
        omschrijving: 'Kristalhelder',
      })
    );
  });

  it('accepts 0 as a valid dikte', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('materialen-add'));
    fireEvent.change(screen.getByTestId('materiaal-modal-dikte'), { target: { value: '0' } });
    fireEvent.change(screen.getByTestId('materiaal-modal-omschrijving'), { target: { value: 'Stof' } });
    expect(screen.getByTestId('materiaal-modal-opslaan')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('materiaal-modal-opslaan'));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ materiaaldikte: 0 })));
  });

  it('deletes a materiaal', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-mat-2'));
    fireEvent.click(screen.getByTestId('materiaal-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('mat-2'));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/MaterialenSection.test.tsx`
Expected: FAIL with "Cannot find module '@/components/beheer/MaterialenSection'"

- [ ] **Step 3: Implement the component**

`src/components/beheer/MaterialenSection.tsx`:
```tsx
'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import type { Materiaal, Materiaalsoort } from './materiaalTypes';

interface MaterialenSectionProps {
  materialen: Materiaal[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Materiaal, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Materiaal, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

type ModalState = { mode: 'add' } | { mode: 'edit'; materiaal: Materiaal } | null;
type MateriaalRow = Materiaal & { materiaalsoortNaam: string };

export function MaterialenSection({
  materialen,
  materiaalsoorten,
  loadError,
  onAdd,
  onUpdate,
  onRemove,
}: MaterialenSectionProps) {
  const t = useTranslations('beheer');
  const [modalState, setModalState] = useState<ModalState>(null);
  const [materiaalsoortId, setMateriaalsoortId] = useState('');
  const [materiaaldikte, setMateriaaldikte] = useState('');
  const [omschrijving, setOmschrijving] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const soortNameById = useMemo(() => {
    const map = new Map<string, string>();
    (materiaalsoorten ?? []).forEach((soort) => map.set(soort.id, soort.omschrijving));
    return map;
  }, [materiaalsoorten]);

  if (loadError) {
    return (
      <p data-testid="materialen-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (materialen === null) {
    return null;
  }

  const rows: MateriaalRow[] = materialen.map((materiaal) => ({
    ...materiaal,
    materiaalsoortNaam: soortNameById.get(materiaal.materiaalsoortId) ?? materiaal.materiaalsoortId,
  }));

  function openAdd() {
    setMateriaalsoortId((materiaalsoorten ?? [])[0]?.id ?? '');
    setMateriaaldikte('');
    setOmschrijving('');
    setActionError(null);
    setModalState({ mode: 'add' });
  }

  function openEdit(materiaal: Materiaal) {
    setMateriaalsoortId(materiaal.materiaalsoortId);
    setMateriaaldikte(String(materiaal.materiaaldikte));
    setOmschrijving(materiaal.omschrijving);
    setActionError(null);
    setModalState({ mode: 'edit', materiaal });
  }

  function closeModal() {
    setModalState(null);
  }

  async function handleSave() {
    if (!modalState) return;
    const data = { materiaalsoortId, materiaaldikte: Number(materiaaldikte), omschrijving };
    const success =
      modalState.mode === 'add' ? await onAdd(data) : await onUpdate(modalState.materiaal.id, data);
    if (success) {
      closeModal();
    } else {
      setActionError(t('materialenActionError'));
    }
  }

  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const success = await onRemove(modalState.materiaal.id);
    if (success) {
      closeModal();
    } else {
      setActionError(t('materialenActionError'));
    }
  }

  const columns: Column<MateriaalRow>[] = [
    {
      key: 'materiaalsoortNaam',
      label: t('materialenColMateriaalsoort'),
      filterType: 'select',
      filterOptions: Array.from(soortNameById.values()),
    },
    { key: 'materiaaldikte', label: t('materialenColDikte'), filterType: 'text' },
    { key: 'omschrijving', label: t('materialenColOmschrijving'), filterType: 'text' },
  ];

  return (
    <div data-testid="materialen-section">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={openAdd}
          data-testid="materialen-add"
          className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
        >
          {t('materialenToevoegen')}
        </button>
      </div>
      <DataTable<MateriaalRow>
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        onRowClick={openEdit}
        emptyLabel={t('materialenEmpty')}
      />
      <Modal isOpen={modalState !== null} onClose={closeModal} closeLabel={t('modalClose')}>
        <div data-testid="materiaal-modal" className="flex flex-col gap-2 text-sm text-white/80">
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('materialenLabelMateriaalsoort')}
            <select
              value={materiaalsoortId}
              onChange={(event) => setMateriaalsoortId(event.target.value)}
              data-testid="materiaal-modal-materiaalsoort"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            >
              {(materiaalsoorten ?? []).map((soort) => (
                <option key={soort.id} value={soort.id}>
                  {soort.omschrijving}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('materialenLabelDikte')}
            <input
              type="number"
              value={materiaaldikte}
              onChange={(event) => setMateriaaldikte(event.target.value)}
              data-testid="materiaal-modal-dikte"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('materialenLabelOmschrijving')}
            <input
              type="text"
              value={omschrijving}
              onChange={(event) => setOmschrijving(event.target.value)}
              data-testid="materiaal-modal-omschrijving"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>

          {actionError && (
            <p data-testid="materiaal-modal-error" className="text-xs text-red-400">
              {actionError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!materiaalsoortId || materiaaldikte === '' || !omschrijving}
              data-testid="materiaal-modal-opslaan"
              className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('materialenOpslaan')}
            </button>
            {modalState?.mode === 'edit' && (
              <button
                type="button"
                onClick={handleRemove}
                data-testid="materiaal-modal-verwijderen"
                className="rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('materialenVerwijderen')}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/MaterialenSection.test.tsx`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/MaterialenSection.tsx tests/components/beheer/MaterialenSection.test.tsx
git commit -m "feat: add MaterialenSection (CRUD table with materiaalsoort lookup)"
```

---

### Task 6: `MatenSection`

**Files:**
- Create: `src/components/beheer/MatenSection.tsx`
- Test: `tests/components/beheer/MatenSection.test.tsx`

**Interfaces:**
- Consumes: `Maat` from `@/components/beheer/materiaalTypes` (Task 1).
- Produces: `MatenSectionProps = { maten: Maat[] | null; loadError: string | null; onAdd: (data: Omit<Maat, 'id'>) => Promise<boolean>; onUpdate: (id: string, data: Omit<Maat, 'id'>) => Promise<boolean>; onRemove: (id: string) => Promise<boolean> }` — consumed by Task 7 (`BeheerShell`).

- [ ] **Step 1: Write the failing tests**

`tests/components/beheer/MatenSection.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MatenSection } from '@/components/beheer/MatenSection';
import type { Maat } from '@/components/beheer/materiaalTypes';
import messages from '../../../messages/nl.json';

const MATEN: Maat[] = [
  { id: 'maat-1', breedte: 40, hoogte: 60 },
  { id: 'maat-2', breedte: 60, hoogte: 90 },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof MatenSection>> = {}) {
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <MatenSection maten={MATEN} loadError={null} onAdd={onAdd} onUpdate={onUpdate} onRemove={onRemove} {...overrides} />
    </NextIntlClientProvider>
  );
  return { onAdd, onUpdate, onRemove };
}

describe('MatenSection', () => {
  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('maten-error')).toHaveTextContent('Kon niet laden.');
  });

  it('renders nothing while maten is null and there is no error', () => {
    renderSection({ maten: null });
    expect(screen.queryByTestId('maten-section')).not.toBeInTheDocument();
  });

  it('lists the maten in the table', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-maat-1')).toHaveTextContent('40');
    expect(screen.getByTestId('data-table-row-maat-1')).toHaveTextContent('60');
  });

  it('adds a new maat', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('maten-add'));
    fireEvent.change(screen.getByTestId('maat-modal-breedte'), { target: { value: '80' } });
    fireEvent.change(screen.getByTestId('maat-modal-hoogte'), { target: { value: '120' } });
    fireEvent.click(screen.getByTestId('maat-modal-opslaan'));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ breedte: 80, hoogte: 120 }));
  });

  it('disables Opslaan until both breedte and hoogte are filled in', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('maten-add'));
    expect(screen.getByTestId('maat-modal-opslaan')).toBeDisabled();
    fireEvent.change(screen.getByTestId('maat-modal-breedte'), { target: { value: '80' } });
    expect(screen.getByTestId('maat-modal-opslaan')).toBeDisabled();
    fireEvent.change(screen.getByTestId('maat-modal-hoogte'), { target: { value: '120' } });
    expect(screen.getByTestId('maat-modal-opslaan')).not.toBeDisabled();
  });

  it('opens a row for editing pre-filled, and updates it', async () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-maat-2'));
    expect(screen.getByTestId('maat-modal-breedte')).toHaveValue(60);
    expect(screen.getByTestId('maat-modal-hoogte')).toHaveValue(90);
    fireEvent.change(screen.getByTestId('maat-modal-hoogte'), { target: { value: '100' } });
    fireEvent.click(screen.getByTestId('maat-modal-opslaan'));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('maat-2', { breedte: 60, hoogte: 100 }));
  });

  it('deletes a maat', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-maat-1'));
    fireEvent.click(screen.getByTestId('maat-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('maat-1'));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/MatenSection.test.tsx`
Expected: FAIL with "Cannot find module '@/components/beheer/MatenSection'"

- [ ] **Step 3: Implement the component**

`src/components/beheer/MatenSection.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import type { Maat } from './materiaalTypes';

interface MatenSectionProps {
  maten: Maat[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Maat, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Maat, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

type ModalState = { mode: 'add' } | { mode: 'edit'; maat: Maat } | null;

export function MatenSection({ maten, loadError, onAdd, onUpdate, onRemove }: MatenSectionProps) {
  const t = useTranslations('beheer');
  const [modalState, setModalState] = useState<ModalState>(null);
  const [breedte, setBreedte] = useState('');
  const [hoogte, setHoogte] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  if (loadError) {
    return (
      <p data-testid="maten-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (maten === null) {
    return null;
  }

  function openAdd() {
    setBreedte('');
    setHoogte('');
    setActionError(null);
    setModalState({ mode: 'add' });
  }

  function openEdit(maat: Maat) {
    setBreedte(String(maat.breedte));
    setHoogte(String(maat.hoogte));
    setActionError(null);
    setModalState({ mode: 'edit', maat });
  }

  function closeModal() {
    setModalState(null);
  }

  async function handleSave() {
    if (!modalState) return;
    const data = { breedte: Number(breedte), hoogte: Number(hoogte) };
    const success = modalState.mode === 'add' ? await onAdd(data) : await onUpdate(modalState.maat.id, data);
    if (success) {
      closeModal();
    } else {
      setActionError(t('matenActionError'));
    }
  }

  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const success = await onRemove(modalState.maat.id);
    if (success) {
      closeModal();
    } else {
      setActionError(t('matenActionError'));
    }
  }

  const columns: Column<Maat>[] = [
    { key: 'breedte', label: t('matenColBreedte'), filterType: 'text' },
    { key: 'hoogte', label: t('matenColHoogte'), filterType: 'text' },
  ];

  return (
    <div data-testid="maten-section">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={openAdd}
          data-testid="maten-add"
          className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
        >
          {t('matenToevoegen')}
        </button>
      </div>
      <DataTable<Maat>
        columns={columns}
        rows={maten}
        getRowId={(row) => row.id}
        onRowClick={openEdit}
        emptyLabel={t('matenEmpty')}
      />
      <Modal isOpen={modalState !== null} onClose={closeModal} closeLabel={t('modalClose')}>
        <div data-testid="maat-modal" className="flex flex-col gap-2 text-sm text-white/80">
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('matenLabelBreedte')}
            <input
              type="number"
              value={breedte}
              onChange={(event) => setBreedte(event.target.value)}
              data-testid="maat-modal-breedte"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('matenLabelHoogte')}
            <input
              type="number"
              value={hoogte}
              onChange={(event) => setHoogte(event.target.value)}
              data-testid="maat-modal-hoogte"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>

          {actionError && (
            <p data-testid="maat-modal-error" className="text-xs text-red-400">
              {actionError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!breedte || !hoogte}
              data-testid="maat-modal-opslaan"
              className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('matenOpslaan')}
            </button>
            {modalState?.mode === 'edit' && (
              <button
                type="button"
                onClick={handleRemove}
                data-testid="maat-modal-verwijderen"
                className="rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('matenVerwijderen')}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/MatenSection.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/MatenSection.tsx tests/components/beheer/MatenSection.test.tsx
git commit -m "feat: add MatenSection (CRUD table)"
```

---

### Task 7: Wire it all into `BeheerShell`

**Files:**
- Modify: `src/components/beheer/BeheerShell.tsx`
- Modify: `tests/components/beheer/BeheerShell.test.tsx`

**Interfaces:**
- Consumes: `useFirestoreCollection` (Task 2), `MATERIAALSOORTEN_SEED`/`buildMaterialenSeed` (Task 1), `MateriaalsoortenSection`/`MaterialenSection`/`MatenSection` (Tasks 4–6), updated `BeheerNav` (Task 3).
- Produces: nothing new — this is the final integration point.

- [ ] **Step 1: Write the failing tests**

Replace `tests/components/beheer/BeheerShell.test.tsx` entirely with:
```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BeheerShell } from '@/components/beheer/BeheerShell';
import messages from '../../../messages/nl.json';

const getDocsMock = vi.fn();
const addDocMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ name })),
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  addDoc: (...args: unknown[]) => addDocMock(...args),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));

function makeSnapshot(docsData: Array<{ id: string; data: Record<string, unknown> }>) {
  return {
    empty: docsData.length === 0,
    docs: docsData.map(({ id, data }) => ({ id, data: () => data })),
  };
}

const KLANT_DATA = {
  companyName: 'Testbedrijf BV',
  kvk: '12345678',
  contactPerson: 'Jan Jansen',
  email: 'jan@example.com',
  phone: '0612345678',
  contactPreference: 'email',
  address: 'Teststraat 1',
  postcode: '1234 AB',
  city: 'Teststad',
  status: 'Beoordelen',
  prijsgroep: '',
};

// Non-empty by default so the auto-seed path never triggers in these
// wiring tests — seeding itself is covered by useFirestoreCollection.test.tsx.
const DEFAULT_COLLECTIONS: Record<string, Array<{ id: string; data: Record<string, unknown> }>> = {
  klanten: [],
  materiaalsoorten: [{ id: 'soort-1', data: { omschrijving: 'Veiligheidsglas' } }],
  materialen: [{ id: 'mat-1', data: { materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'Test' } }],
  maten: [{ id: 'maat-1', data: { breedte: 40, hoogte: 60 } }],
};

function mockCollections(overrides: Partial<typeof DEFAULT_COLLECTIONS> = {}) {
  const data = { ...DEFAULT_COLLECTIONS, ...overrides };
  getDocsMock.mockImplementation((collectionRef: { name: string }) => {
    if (collectionRef.name === 'klanten-error') {
      return Promise.reject(new Error('offline'));
    }
    return Promise.resolve(makeSnapshot(data[collectionRef.name] ?? []));
  });
}

function renderShell() {
  const onLogout = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <BeheerShell email="paul@glassartanddesign.com" onLogout={onLogout} />
    </NextIntlClientProvider>
  );
  return { onLogout };
}

beforeEach(() => {
  getDocsMock.mockReset();
  addDocMock.mockReset();
});

describe('BeheerShell', () => {
  it('shows the logged-in email and defaults to the Klanten section', async () => {
    mockCollections({ klanten: [{ id: 'uid-1', data: KLANT_DATA }] });
    renderShell();
    expect(screen.getByTestId('beheer-logged-in-as')).toHaveTextContent('paul@glassartanddesign.com');
    expect(await screen.findByTestId('klanten-section')).toBeInTheDocument();
  });

  it('shows the count of "Beoordelen" klanten on the Klanten nav item', async () => {
    mockCollections({
      klanten: [
        { id: 'uid-1', data: KLANT_DATA },
        { id: 'uid-2', data: { ...KLANT_DATA, status: 'Goedgekeurd' } },
      ],
    });
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-klanten')).toHaveTextContent('1'));
  });

  it('switches to the Facturen section when its nav item is clicked', async () => {
    mockCollections();
    renderShell();
    await waitFor(() => expect(getDocsMock).toHaveBeenCalled());
    screen.getByTestId('beheer-nav-facturen').click();
    expect(await screen.findByTestId('facturen-section')).toBeInTheDocument();
    expect(screen.queryByTestId('klanten-section')).not.toBeInTheDocument();
  });

  it('calls onLogout when the nav logout button is clicked', async () => {
    mockCollections();
    const { onLogout } = renderShell();
    await waitFor(() => expect(getDocsMock).toHaveBeenCalled());
    screen.getByTestId('beheer-nav-logout').click();
    expect(onLogout).toHaveBeenCalled();
  });

  it('shows a load error on the Klanten section when getDocs fails for klanten', async () => {
    getDocsMock.mockImplementation((collectionRef: { name: string }) => {
      if (collectionRef.name === 'klanten') {
        return Promise.reject(new Error('offline'));
      }
      return Promise.resolve(makeSnapshot(DEFAULT_COLLECTIONS[collectionRef.name] ?? []));
    });
    renderShell();
    expect(await screen.findByTestId('klanten-error')).toHaveTextContent(
      'Kon de klanten niet laden. Probeer de pagina te verversen.'
    );
  });

  it('shows the materiaalsoorten count and switches to the Materiaalsoorten section', async () => {
    mockCollections({
      materiaalsoorten: [
        { id: 'soort-1', data: { omschrijving: 'Veiligheidsglas' } },
        { id: 'soort-2', data: { omschrijving: 'Dibond' } },
      ],
    });
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-materiaalsoorten')).toHaveTextContent('2'));
    screen.getByTestId('beheer-nav-materiaalsoorten').click();
    expect(await screen.findByTestId('materiaalsoorten-section')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-soort-1')).toHaveTextContent('Veiligheidsglas');
  });

  it('shows the materiaalsoort name in Materialen and the materialen count in the nav', async () => {
    mockCollections();
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-materialen')).toHaveTextContent('1'));
    screen.getByTestId('beheer-nav-materialen').click();
    expect(await screen.findByTestId('materialen-section')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-mat-1')).toHaveTextContent('Veiligheidsglas');
  });

  it('shows the maten count and switches to the Maten section', async () => {
    mockCollections();
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-maten')).toHaveTextContent('1'));
    screen.getByTestId('beheer-nav-maten').click();
    expect(await screen.findByTestId('maten-section')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-maat-1')).toHaveTextContent('40');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/BeheerShell.test.tsx`
Expected: FAIL — `BeheerNav` requires the 3 new count props, nav items for materiaalsoorten/materialen/maten don't switch to any section yet.

- [ ] **Step 3: Update `BeheerShell.tsx`**

Replace the whole file with:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { GlassPanel } from '@/components/GlassPanel';
import { BeheerNav, type BeheerSection } from './BeheerNav';
import { KlantenSection, type Klant } from './KlantenSection';
import { FacturenSection } from './FacturenSection';
import { MateriaalsoortenSection } from './MateriaalsoortenSection';
import { MaterialenSection } from './MaterialenSection';
import { MatenSection } from './MatenSection';
import type { Materiaalsoort, Materiaal, Maat } from './materiaalTypes';
import { MOCK_ADMIN_INVOICES } from '@/data/mockAdminInvoices';
import { useFirestoreCollection } from '@/lib/useFirestoreCollection';
import { MATERIAALSOORTEN_SEED, buildMaterialenSeed } from '@/data/materiaalsoortenSeed';

interface BeheerShellProps {
  email: string;
  onLogout: () => void;
}

export function BeheerShell({ email, onLogout }: BeheerShellProps) {
  const t = useTranslations('beheer');
  const [activeSection, setActiveSection] = useState<BeheerSection>('klanten');
  const [klanten, setKlanten] = useState<Klant[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadKlanten() {
      try {
        const snapshot = await getDocs(collection(db, 'klanten'));
        if (cancelled) return;
        setKlanten(
          snapshot.docs.map((docSnapshot) => {
            const data = docSnapshot.data();
            return {
              id: docSnapshot.id,
              companyName: data.companyName,
              kvk: data.kvk,
              contactPerson: data.contactPerson,
              email: data.email,
              phone: data.phone,
              contactPreference: data.contactPreference,
              address: data.address,
              postcode: data.postcode,
              city: data.city,
              status: data.status,
              prijsgroep: data.prijsgroep,
            } as Klant;
          })
        );
        setLoadError(null);
      } catch {
        if (!cancelled) {
          setLoadError(t('klantenLoadError'));
        }
      }
    }
    loadKlanten();
    return () => {
      cancelled = true;
    };
  }, [t]);

  function handleKlantUpdated(updated: Klant) {
    setKlanten((current) => (current ?? []).map((klant) => (klant.id === updated.id ? updated : klant)));
  }

  const materiaalsoorten = useFirestoreCollection<Materiaalsoort>('materiaalsoorten', {
    seed: MATERIAALSOORTEN_SEED,
  });
  const materialenSeed = materiaalsoorten.items ? buildMaterialenSeed(materiaalsoorten.items) : undefined;
  const materialen = useFirestoreCollection<Materiaal>('materialen', {
    seed: materialenSeed,
    skip: materiaalsoorten.items === null,
  });
  const maten = useFirestoreCollection<Maat>('maten');

  const klantenCount = (klanten ?? []).filter((klant) => klant.status === 'Beoordelen').length;
  const facturenCount = MOCK_ADMIN_INVOICES.filter((invoice) => invoice.status === 'Te betalen').length;
  const materiaalsoortenCount = (materiaalsoorten.items ?? []).length;
  const materialenCount = (materialen.items ?? []).length;
  const matenCount = (maten.items ?? []).length;

  return (
    <div
      data-testid="beheer-dashboard"
      className="mx-auto grid max-w-5xl grid-cols-1 gap-8 lg:grid-cols-[220px_1fr]"
    >
      <GlassPanel className="w-full">
        <p data-testid="beheer-logged-in-as" className="mb-4 text-xs text-white/60">
          {t('loggedInAs', { email })}
        </p>
        <BeheerNav
          activeSection={activeSection}
          onSelect={setActiveSection}
          onLogout={onLogout}
          klantenCount={klantenCount}
          facturenCount={facturenCount}
          materiaalsoortenCount={materiaalsoortenCount}
          materialenCount={materialenCount}
          matenCount={matenCount}
        />
      </GlassPanel>
      <GlassPanel className="w-full">
        {activeSection === 'klanten' ? (
          <KlantenSection klanten={klanten} loadError={loadError} onKlantUpdated={handleKlantUpdated} />
        ) : activeSection === 'facturen' ? (
          <FacturenSection />
        ) : activeSection === 'materiaalsoorten' ? (
          <MateriaalsoortenSection
            materiaalsoorten={materiaalsoorten.items}
            materialen={materialen.items}
            loadError={materiaalsoorten.error === 'load' ? t('materiaalsoortenLoadError') : null}
            onAdd={materiaalsoorten.add}
            onUpdate={materiaalsoorten.update}
            onRemove={materiaalsoorten.remove}
          />
        ) : activeSection === 'materialen' ? (
          <MaterialenSection
            materialen={materialen.items}
            materiaalsoorten={materiaalsoorten.items}
            loadError={materialen.error === 'load' ? t('materialenLoadError') : null}
            onAdd={materialen.add}
            onUpdate={materialen.update}
            onRemove={materialen.remove}
          />
        ) : (
          <MatenSection
            maten={maten.items}
            loadError={maten.error === 'load' ? t('matenLoadError') : null}
            onAdd={maten.add}
            onUpdate={maten.update}
            onRemove={maten.remove}
          />
        )}
      </GlassPanel>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/BeheerShell.test.tsx`
Expected: PASS (8 tests)

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests, including the untouched pre-existing suites (`KlantenSection`, `KlantModal`, `FacturenSection`, `FactuurModal`, `AdminDashboard`, `AdminLoginForm`, `DataTable`, etc.), plus every test added in Tasks 1–7.

- [ ] **Step 6: Commit**

```bash
git add src/components/beheer/BeheerShell.tsx tests/components/beheer/BeheerShell.test.tsx
git commit -m "feat: wire Materiaalsoorten/Materialen/Maten into BeheerShell"
```

---

## Manual verification (after Task 7)

Automated tests mock Firestore, so they cannot catch real Firestore rule/config issues. After all tasks are done, manually verify in the browser:

1. Run `npm run dev`, log into `/beheer` as an admin.
2. Open **Materiaalsoorten** — collection should auto-seed with Veiligheidsglas, Dibond, Acryl, Akoestische stof on first load (check the Firebase console to confirm 4 new docs appeared in `materiaalsoorten`).
3. Open **Materialen** — should auto-seed with the 6 rows from the design doc, each showing the correct materiaalsoort name (not a raw id).
4. Add a new materiaalsoort, confirm it appears in the table and in the Materialen dropdown.
5. Try deleting a materiaalsoort that has a materiaal referencing it — confirm the blocked-deletion message appears and no Firestore write happens.
6. Delete an unused materiaalsoort, confirm it disappears from the table and the Firestore collection.
7. Open **Maten** — should start empty; add a maat, edit it, delete it.
8. Refresh the page and confirm no duplicate seed rows appear (auto-seed only fires once, when the collection was empty).
