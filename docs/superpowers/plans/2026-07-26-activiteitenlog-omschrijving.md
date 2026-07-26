# Activiteitenlog Omschrijving-veld Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional `omschrijving` field to activity-log events so the Beheer Activiteitenlog screen shows which specific item (materiaal, kunstwerk, klant, bestelnummer, ...) each event acted on.

**Architecture:** `logActiviteit()` gains an optional third parameter that, when provided, is written into the Firestore `activiteitenlog` document; every call site that acts on a specific entity passes that entity's display name (or bestelnummer). `ActiviteitSection.tsx` renders a new "Omschrijving" column. Two call sites (`BestellingModal.tsx`, `VersturenNaarDrukkerDialog.tsx`) first need `bestelnr` threaded onto the beheer-side `Bestelling` type, which doesn't currently carry it.

**Tech Stack:** Next.js 14, React 18, TypeScript 5.5, Firebase (Firestore), next-intl, Vitest + Testing Library.

## Global Constraints

- `omschrijving` is optional on `logActiviteit()` and on the Firestore document — never write `omschrijving: undefined` (the Firestore SDK rejects `undefined` field values), omit the key entirely instead.
- No old→new value diffing — omschrijving is always just the item's current display name.
- No migration of the 64 existing `activiteitenlog` documents — rows without the field show a `–` in the UI.
- `firestore.rules` must allow (not require) the new field, and must be deployed live via `npx --yes firebase-tools deploy --only firestore:rules` before this branch's code reaches production (existing repo convention — already authenticated).
- No new UI navigation from the omschrijving cell to the underlying item.
- `bestelling_verstuurd_naar_drukker` (batch action) uses all bestelnummers in the batch, comma-joined (`", "`).
- Verification command for every task: `npm test -- <RelevantTestFile>` and, for tasks touching shared types, `npx tsc --noEmit`.

---

### Task 1: Extend `logActiviteit()` with an optional `omschrijving` parameter

**Files:**
- Modify: `src/lib/logActiviteit.ts`
- Test: `tests/lib/logActiviteit.test.ts`

**Interfaces:**
- Produces: `logActiviteit(type: ActiviteitType, actor: ActiviteitActor, omschrijving?: string): Promise<void>` — every later task in this plan calls this new signature.

- [ ] **Step 1: Write the failing test**

Add a new test right after the existing `'writes a document with type, actor fields and a server timestamp'` test in `tests/lib/logActiviteit.test.ts` (inside the `describe('logActiviteit', ...)` block, after line 43):

```ts
  it('includes the omschrijving field when provided', async () => {
    addDocMock.mockResolvedValue({ id: 'log-2' });
    await logActiviteit(
      'materiaalsoort_verwijderd',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'Helder glas'
    );
    expect(addDocMock).toHaveBeenCalledWith(
      { name: 'activiteitenlog' },
      {
        type: 'materiaalsoort_verwijderd',
        actorId: 'staff-1',
        actorEmail: 'paul@glassartanddesign.com',
        actorNaam: 'paul@glassartanddesign.com',
        timestamp: 'SERVER_TIMESTAMP',
        omschrijving: 'Helder glas',
      }
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/lib/logActiviteit.test.ts`
Expected: FAIL on the new test — `addDocMock` was called without an `omschrijving` key (the current implementation ignores the third argument entirely).

- [ ] **Step 3: Implement the minimal change**

In `src/lib/logActiviteit.ts`, replace the `logActiviteit` function (lines 58-71):

```ts
export async function logActiviteit(
  type: ActiviteitType,
  actor: ActiviteitActor,
  omschrijving?: string
): Promise<void> {
  try {
    await addDoc(collection(db, 'activiteitenlog'), {
      type,
      actorId: actor.id,
      actorEmail: actor.email,
      actorNaam: actor.naam,
      timestamp: serverTimestamp(),
      ...(omschrijving ? { omschrijving } : {}),
    });
  } catch {
    // Fire-and-forget: a failed log write must never block or surface an
    // error for the underlying user action (page visit, cart add, etc.).
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/lib/logActiviteit.test.ts`
Expected: PASS, all tests in the file — including the original `'writes a document...'` test, which still asserts no `omschrijving` key is present when the third argument is omitted (the conditional spread contributes nothing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/logActiviteit.ts tests/lib/logActiviteit.test.ts
git commit -m "feat: add optional omschrijving parameter to logActiviteit"
```

---

### Task 2: Allow `omschrijving` in the Firestore rules, and deploy

**Files:**
- Modify: `firestore.rules:95`

No automated test suite exists for `firestore.rules` in this repo (verified: no `*.rules.test.*` files) — verification here is a manual live deploy, consistent with how the two prior activiteitenlog rounds handled rule changes.

- [ ] **Step 1: Edit the field allow-list**

In `firestore.rules`, change line 95 from:

```
        && request.resource.data.keys().hasOnly(['type','actorId','actorEmail','actorNaam','timestamp'])
```

to:

```
        && request.resource.data.keys().hasOnly(['type','actorId','actorEmail','actorNaam','timestamp','omschrijving'])
```

- [ ] **Step 2: Deploy the rules live**

Run: `npx --yes firebase-tools deploy --only firestore:rules`
Expected: deploy completes successfully (or reports "already up to date" if run again later in this branch).

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "chore: allow omschrijving field in activiteitenlog Firestore rules"
```

---

### Task 3: "Omschrijving" column in the Activiteitenlog screen

**Files:**
- Modify: `src/components/beheer/ActiviteitSection.tsx`
- Modify: `src/components/beheer/BeheerShell.tsx` (the `loadActiviteiten` mapping)
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/ActiviteitSection.test.tsx`
- Test: `tests/components/beheer/BeheerShell.test.tsx`

**Interfaces:**
- Consumes: `logActiviteit(type, actor, omschrijving?)` from Task 1 (not called here — this task only reads the field back).
- Produces: `Activiteit.omschrijving?: string` — read by `BeheerShell.tsx`'s `loadActiviteiten` mapping and rendered by `ActiviteitSection.tsx`.

- [ ] **Step 1: Write the failing test**

In `tests/components/beheer/ActiviteitSection.test.tsx`, add a new test after the `'shows each activiteit...'` test (after line 43):

```tsx
  it('shows the omschrijving when present, and no stray "undefined" text when absent', () => {
    renderSection([
      {
        id: 'log-9',
        type: 'materiaalsoort_verwijderd',
        actorEmail: 'paul@glassartanddesign.com',
        actorNaam: 'paul@glassartanddesign.com',
        timestamp: new Date('2026-07-26T13:00:00'),
        omschrijving: 'Helder glas',
      },
      {
        id: 'log-10',
        type: 'account_bezocht',
        actorEmail: 'klant@example.com',
        actorNaam: 'Testbedrijf BV',
        timestamp: new Date('2026-07-26T13:05:00'),
      },
    ]);
    expect(screen.getByTestId('data-table-row-log-9')).toHaveTextContent('Helder glas');
    expect(screen.getByTestId('data-table-row-log-10')).not.toHaveTextContent('undefined');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/components/beheer/ActiviteitSection.test.tsx`
Expected: FAIL — `data-table-row-log-9` does not contain "Helder glas" (the `Activiteit`/`ActiviteitRow` types and the rendered columns don't carry `omschrijving` yet).

- [ ] **Step 3: Implement**

In `src/components/beheer/ActiviteitSection.tsx`:

Replace the `Activiteit` interface (lines 8-14):

```tsx
export interface Activiteit {
  id: string;
  type: ActiviteitType;
  actorEmail: string;
  actorNaam: string;
  omschrijving?: string;
  timestamp: Date | null;
}
```

Replace the `ActiviteitRow` interface (lines 16-22):

```tsx
interface ActiviteitRow {
  id: string;
  tijdstip: string;
  typeLabel: string;
  omschrijving: string;
  actorNaam: string;
  actorEmail: string;
}
```

Replace the `rows` mapping (lines 79-92):

```tsx
  const rows = useMemo<ActiviteitRow[]>(
    () =>
      (activiteiten ?? []).map((activiteit) => {
        const labelKey = TYPE_LABEL_KEYS[activiteit.type];
        return {
          id: activiteit.id,
          tijdstip: activiteit.timestamp ? activiteit.timestamp.toLocaleString('nl-NL') : '',
          typeLabel: labelKey ? t(labelKey) : activiteit.type,
          omschrijving: activiteit.omschrijving ?? '–',
          actorNaam: activiteit.actorNaam,
          actorEmail: activiteit.actorEmail,
        };
      }),
    [activiteiten, t]
  );
```

Replace the `columns` array (lines 94-99):

```tsx
  const columns: Column<ActiviteitRow>[] = [
    { key: 'tijdstip', label: t('activiteitColTijdstip') },
    { key: 'typeLabel', label: t('activiteitColType') },
    { key: 'omschrijving', label: t('activiteitColOmschrijving') },
    { key: 'actorNaam', label: t('activiteitColKlant') },
    { key: 'actorEmail', label: t('activiteitColEmail') },
  ];
```

In `messages/nl.json`, insert a new key right after `"activiteitColEmail": "E-mailadres",` (line 279):

```json
    "activiteitColOmschrijving": "Omschrijving",
```

In `src/components/beheer/BeheerShell.tsx`, in the `loadActiviteiten` mapping (around line 159-166), add the `omschrijving` field:

```tsx
            return {
              id: docSnapshot.id,
              type: data.type as ActiviteitType,
              actorEmail: data.actorEmail,
              actorNaam: data.actorNaam,
              omschrijving: data.omschrijving,
              timestamp: data.timestamp?.toDate() ?? null,
            } as Activiteit;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/components/beheer/ActiviteitSection.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 5: Extend the BeheerShell integration test**

In `tests/components/beheer/BeheerShell.test.tsx`, in the `'shows the Activiteit section with the loaded count on its nav item'` test (around line 280-299), add `omschrijving` to the fixture doc's `data` and extend the assertion:

```tsx
  it('shows the Activiteit section with the loaded count on its nav item', async () => {
    mockCollections({
      activiteitenlog: [
        {
          id: 'log-1',
          data: {
            type: 'kunstwerk_bekeken',
            actorEmail: 'klant@example.com',
            actorNaam: 'Testbedrijf BV',
            omschrijving: 'Hotel paneel',
            timestamp: { toDate: () => new Date('2026-07-22T10:00:00') },
          },
        },
      ],
    });
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-activiteit')).toHaveTextContent('1'));
    fireEvent.click(screen.getByTestId('beheer-nav-activiteit'));
    expect(await screen.findByTestId('activiteit-section')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-log-1')).toHaveTextContent('Kunstwerk bekeken');
    expect(screen.getByTestId('data-table-row-log-1')).toHaveTextContent('Hotel paneel');
  });
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- tests/components/beheer/BeheerShell.test.tsx tests/components/beheer/ActiviteitSection.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 7: Commit**

```bash
git add src/components/beheer/ActiviteitSection.tsx src/components/beheer/BeheerShell.tsx messages/nl.json tests/components/beheer/ActiviteitSection.test.tsx tests/components/beheer/BeheerShell.test.tsx
git commit -m "feat: show the omschrijving field as a new column in the Activiteitenlog screen"
```

---

### Task 4: Thread `bestelnr` onto the beheer-side `Bestelling` type

**Files:**
- Modify: `src/components/beheer/BestellingenSection.tsx:22-31`
- Modify: `src/components/beheer/BeheerShell.tsx` (`loadBestellingen` mapping)
- Test: `tests/components/beheer/BestellingenSection.test.tsx`
- Test: `tests/components/beheer/BestellingModal.test.tsx`
- Test: `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx`

**Interfaces:**
- Produces: `Bestelling.bestelnr: string` — consumed by Task 14 (`BestellingModal.tsx`) and Task 15 (`VersturenNaarDrukkerDialog.tsx`).

No new independently-observable UI behavior is introduced by this task (the Firestore `bestelheaders` doc already has `bestelnr`, written by `CartPanel.tsx` — this task only starts reading it on the beheer side). The verification gate is the TypeScript compiler: making the field non-optional immediately surfaces every place across the test suite that constructs a `Bestelling` without it.

- [ ] **Step 1: Add the field to the type (red)**

In `src/components/beheer/BestellingenSection.tsx`, replace the `Bestelling` interface (lines 22-31):

```ts
export interface Bestelling {
  id: string;
  klantId: string;
  companyName: string;
  bestelnr: string;
  besteldatum: string;
  status: 'Te beoordelen' | 'Te versturen naar drukker' | 'Verstuurd naar drukker' | 'Afgewezen';
  lineCount: number;
  totalQuantity: number;
  lines: BestellingLine[];
}
```

- [ ] **Step 2: Run the type check to verify it fails**

Run: `npx tsc --noEmit`
Expected: FAIL, with "Conversion of type ... may be a mistake" / "Property 'bestelnr' is missing" errors in `src/components/beheer/BeheerShell.tsx` (the `loadBestellingen` mapping's `as RawBestelling` cast) and in the three test files listed below.

- [ ] **Step 3: Fix the BeheerShell mapping**

In `src/components/beheer/BeheerShell.tsx`, in the `loadBestellingen` mapping (around line 121-129), add `bestelnr`:

```tsx
            const data = headerDoc.data();
            return {
              id: headerDoc.id,
              klantId: data.klantId,
              bestelnr: data.bestelnr,
              besteldatum: data.besteldatum?.toDate().toLocaleDateString('nl-NL') ?? '',
              status: data.status,
              lineCount: lines.length,
              totalQuantity: lines.reduce((sum, line) => sum + (line.quantity ?? 0), 0),
              lines,
            } as RawBestelling;
```

- [ ] **Step 4: Fix the test fixtures**

In `tests/components/beheer/BestellingenSection.test.tsx`, add `bestelnr` to both entries of the `BESTELLINGEN` fixture (lines 89-110):

```ts
const BESTELLINGEN: Bestelling[] = [
  {
    id: 'header-1',
    klantId: 'uid-1',
    companyName: 'Testbedrijf BV',
    bestelnr: 'GD-00301',
    besteldatum: '1-7-2026',
    status: 'Te beoordelen',
    lineCount: 1,
    totalQuantity: 3,
    lines: [{ id: 'line-1', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 3 }],
  },
  {
    id: 'header-2',
    klantId: 'uid-2',
    companyName: 'Ander Bedrijf',
    bestelnr: 'GD-00302',
    besteldatum: '2-7-2026',
    status: 'Verstuurd naar drukker',
    lineCount: 1,
    totalQuantity: 1,
    lines: [{ id: 'line-2', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
  },
];
```

In `tests/components/beheer/BestellingModal.test.tsx`, add `bestelnr` to all three `Bestelling` fixtures:

```ts
const BESTELLING: Bestelling = {
  id: 'header-1',
  klantId: 'uid-1',
  companyName: 'Testbedrijf BV',
  bestelnr: 'GD-00101',
  besteldatum: '1-7-2026',
  status: 'Te beoordelen',
  lineCount: 2,
  totalQuantity: 5,
  lines: [
    { id: 'line-1', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 3 },
    { id: 'line-2', kunstwerkId: null, maatId: null, materiaalId: null, prijs: 0, quantity: 2 },
  ],
};
```

```ts
const BESTELLING_MET_EIGEN_MAAT: Bestelling = {
  id: 'header-2',
  klantId: 'uid-2',
  companyName: 'Ander Bedrijf',
  bestelnr: 'GD-00102',
  besteldatum: '3-7-2026',
  status: 'Te beoordelen',
  lineCount: 1,
  totalQuantity: 1,
  lines: [
    { id: 'line-3', kunstwerkId: 'kw-1', maatId: '', materiaalId: 'mat-1', breedte: 90, hoogte: 140, prijs: null, quantity: 1 },
  ],
};
```

```ts
    const BESTELLING_MET_TWEE_ONGEPRIJSDE_REGELS: Bestelling = {
      id: 'header-3',
      klantId: 'uid-3',
      companyName: 'Weer Een Bedrijf',
      bestelnr: 'GD-00103',
      besteldatum: '5-7-2026',
      status: 'Te beoordelen',
      lineCount: 2,
      totalQuantity: 2,
      lines: [
        { id: 'line-4', kunstwerkId: 'kw-1', maatId: '', materiaalId: 'mat-1', breedte: 50, hoogte: 80, prijs: null, quantity: 1 },
        { id: 'line-5', kunstwerkId: 'kw-1', maatId: '', materiaalId: 'mat-1', breedte: 60, hoogte: 90, prijs: null, quantity: 1 },
      ],
    };
```

In `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx`, add `bestelnr` to the `BESTELLING` fixture (lines 72-81):

```ts
const BESTELLING: Bestelling = {
  id: 'header-1',
  klantId: 'uid-1',
  companyName: 'Testbedrijf BV',
  bestelnr: 'GD-00201',
  besteldatum: '1-7-2026',
  status: 'Te versturen naar drukker',
  lineCount: 1,
  totalQuantity: 2,
  lines: [{ id: 'line-1', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
};
```

- [ ] **Step 5: Run the type check to verify it passes**

Run: `npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 6: Run the full test suite to verify behavior is unchanged**

Run: `npm test -- tests/components/beheer/BestellingenSection.test.tsx tests/components/beheer/BestellingModal.test.tsx tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx tests/components/beheer/BeheerShell.test.tsx`
Expected: PASS, all tests (no assertions reference `bestelnr` yet — this task is pure plumbing).

- [ ] **Step 7: Commit**

```bash
git add src/components/beheer/BestellingenSection.tsx src/components/beheer/BeheerShell.tsx tests/components/beheer/BestellingenSection.test.tsx tests/components/beheer/BestellingModal.test.tsx tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx
git commit -m "feat: thread bestelnr onto the beheer-side Bestelling type"
```

---

### Task 5: MateriaalsoortenSection — omschrijving wiring

**Files:**
- Modify: `src/components/beheer/MateriaalsoortenSection.tsx:90-93,111`
- Test: `tests/components/beheer/MateriaalsoortenSection.test.tsx:149-188`

**Interfaces:**
- Consumes: `logActiviteit(type, actor, omschrijving?)` from Task 1.

- [ ] **Step 1: Update the failing tests**

In `tests/components/beheer/MateriaalsoortenSection.test.tsx`, update the three logging tests (lines 149-188):

```tsx
  it('logs materiaalsoort_toegevoegd with the logged-in medewerker when adding', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('materiaalsoorten-add'));
    fireEvent.change(screen.getByTestId('materiaalsoort-modal-omschrijving'), { target: { value: 'Acryl' } });
    fireEvent.click(screen.getByTestId('materiaalsoort-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'materiaalsoort_toegevoegd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'Acryl'
      )
    );
  });

  it('logs materiaalsoort_gewijzigd with the logged-in medewerker when editing', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-soort-2'));
    fireEvent.change(screen.getByTestId('materiaalsoort-modal-omschrijving'), { target: { value: 'Dibond 3mm' } });
    fireEvent.click(screen.getByTestId('materiaalsoort-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'materiaalsoort_gewijzigd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'Dibond 3mm'
      )
    );
  });

  it('logs materiaalsoort_verwijderd with the logged-in medewerker when deleting', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-soort-2'));
    fireEvent.click(screen.getByTestId('materiaalsoort-modal-verwijderen'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'materiaalsoort_verwijderd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'Dibond'
      )
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/components/beheer/MateriaalsoortenSection.test.tsx`
Expected: FAIL on the three updated tests — the actual calls still only pass 2 arguments.

- [ ] **Step 3: Implement**

In `src/components/beheer/MateriaalsoortenSection.tsx`, replace lines 89-94:

```tsx
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'materiaalsoort_toegevoegd' : 'materiaalsoort_gewijzigd',
        actorFromMedewerker(user),
        omschrijving
      );
      closeModal();
```

Replace line 111:

```tsx
      void logActiviteit('materiaalsoort_verwijderd', actorFromMedewerker(user), modalState.materiaalsoort.omschrijving);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/components/beheer/MateriaalsoortenSection.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/MateriaalsoortenSection.tsx tests/components/beheer/MateriaalsoortenSection.test.tsx
git commit -m "feat: log the omschrijving for materiaalsoort activiteiten"
```

---

### Task 6: MaterialenSection — omschrijving wiring

**Files:**
- Modify: `src/components/beheer/MaterialenSection.tsx:90-93,111`
- Test: `tests/components/beheer/MaterialenSection.test.tsx:178-218`

**Interfaces:**
- Consumes: `logActiviteit(type, actor, omschrijving?)` from Task 1.

- [ ] **Step 1: Update the failing tests**

In `tests/components/beheer/MaterialenSection.test.tsx`, update the three logging tests (lines 178-218):

```tsx
  it('logs materiaal_toegevoegd when adding', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('materialen-add'));
    fireEvent.change(screen.getByTestId('materiaal-modal-dikte'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('materiaal-modal-omschrijving'), { target: { value: 'Nieuw' } });
    fireEvent.click(screen.getByTestId('materiaal-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'materiaal_toegevoegd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'Nieuw'
      )
    );
  });

  it('logs materiaal_gewijzigd when editing', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-mat-2'));
    fireEvent.change(screen.getByTestId('materiaal-modal-omschrijving'), { target: { value: 'Bijgewerkt' } });
    fireEvent.click(screen.getByTestId('materiaal-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'materiaal_gewijzigd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'Bijgewerkt'
      )
    );
  });

  it('logs materiaal_verwijderd when deleting', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-mat-2'));
    fireEvent.click(screen.getByTestId('materiaal-modal-verwijderen'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'materiaal_verwijderd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'Licht en helder'
      )
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/components/beheer/MaterialenSection.test.tsx`
Expected: FAIL on the three updated tests.

- [ ] **Step 3: Implement**

In `src/components/beheer/MaterialenSection.tsx`, replace lines 89-94:

```tsx
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'materiaal_toegevoegd' : 'materiaal_gewijzigd',
        actorFromMedewerker(user),
        omschrijving
      );
      closeModal();
```

Replace line 111:

```tsx
      void logActiviteit('materiaal_verwijderd', actorFromMedewerker(user), modalState.materiaal.omschrijving);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/components/beheer/MaterialenSection.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/MaterialenSection.tsx tests/components/beheer/MaterialenSection.test.tsx
git commit -m "feat: log the omschrijving for materiaal activiteiten"
```

---

### Task 7: MatenSection — omschrijving wiring (composed label)

**Files:**
- Modify: `src/components/beheer/MatenSection.tsx:60-89`
- Test: `tests/components/beheer/MatenSection.test.tsx:159-199`

**Interfaces:**
- Consumes: `logActiviteit(type, actor, omschrijving?)` from Task 1.

`Maat` has no name field (only `breedte`/`hoogte`), so the omschrijving is a composed string `${breedte}×${hoogte} cm`, matching the existing `maatLabel()` helper's format (`src/components/ProductModal.tsx:25-27`).

- [ ] **Step 1: Update the failing tests**

In `tests/components/beheer/MatenSection.test.tsx`, update the three logging tests (lines 159-199):

```tsx
  it('logs maat_toegevoegd when adding', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('maten-add'));
    fireEvent.change(screen.getByTestId('maat-modal-breedte'), { target: { value: '50' } });
    fireEvent.change(screen.getByTestId('maat-modal-hoogte'), { target: { value: '70' } });
    fireEvent.click(screen.getByTestId('maat-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'maat_toegevoegd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        '50×70 cm'
      )
    );
  });

  it('logs maat_gewijzigd when editing', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-maat-2'));
    fireEvent.change(screen.getByTestId('maat-modal-hoogte'), { target: { value: '100' } });
    fireEvent.click(screen.getByTestId('maat-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'maat_gewijzigd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        '60×100 cm'
      )
    );
  });

  it('logs maat_verwijderd when deleting', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-maat-2'));
    fireEvent.click(screen.getByTestId('maat-modal-verwijderen'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'maat_verwijderd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        '60×90 cm'
      )
    );
  });
```

(`maat-2` fixture is `{ breedte: 60, hoogte: 90 }` — the edit test types a new hoogte of `100` before saving, so its expected omschrijving reflects the *new* value `60×100 cm`; the delete test doesn't edit first, so it reflects the *original* `60×90 cm`.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/components/beheer/MatenSection.test.tsx`
Expected: FAIL on the three updated tests.

- [ ] **Step 3: Implement**

In `src/components/beheer/MatenSection.tsx`, replace lines 64-70:

```tsx
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'maat_toegevoegd' : 'maat_gewijzigd',
        actorFromMedewerker(user),
        `${breedte}×${hoogte} cm`
      );
      closeModal();
```

Replace line 84:

```tsx
      void logActiviteit(
        'maat_verwijderd',
        actorFromMedewerker(user),
        `${modalState.maat.breedte}×${modalState.maat.hoogte} cm`
      );
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/components/beheer/MatenSection.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/MatenSection.tsx tests/components/beheer/MatenSection.test.tsx
git commit -m "feat: log the composed breedte×hoogte omschrijving for maat activiteiten"
```

---

### Task 8: SegmentenSection — omschrijving wiring

**Files:**
- Modify: `src/components/beheer/SegmentenSection.tsx:56-82`
- Test: `tests/components/beheer/SegmentenSection.test.tsx:113-152`

**Interfaces:**
- Consumes: `logActiviteit(type, actor, omschrijving?)` from Task 1.

- [ ] **Step 1: Update the failing tests**

In `tests/components/beheer/SegmentenSection.test.tsx`, update the three logging tests (lines 113-152):

```tsx
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

  it('logs segment_verwijderd with the logged-in medewerker when deleting', async () => {
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/components/beheer/SegmentenSection.test.tsx`
Expected: FAIL on the three updated tests.

- [ ] **Step 3: Implement**

In `src/components/beheer/SegmentenSection.tsx`, replace lines 62-67:

```tsx
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'segment_toegevoegd' : 'segment_gewijzigd',
        actorFromMedewerker(user),
        omschrijving
      );
      closeModal();
```

Replace line 77:

```tsx
      void logActiviteit('segment_verwijderd', actorFromMedewerker(user), modalState.segment.omschrijving);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/components/beheer/SegmentenSection.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/SegmentenSection.tsx tests/components/beheer/SegmentenSection.test.tsx
git commit -m "feat: log the omschrijving for segment activiteiten"
```

---

### Task 9: KunstwerkenSection — omschrijving wiring (incl. backfill)

**Files:**
- Modify: `src/components/beheer/KunstwerkenSection.tsx:258-314`
- Test: `tests/components/beheer/KunstwerkenSection.test.tsx:281-333,356-376`

**Interfaces:**
- Consumes: `logActiviteit(type, actor, omschrijving?)` from Task 1.

- [ ] **Step 1: Update the failing tests**

In `tests/components/beheer/KunstwerkenSection.test.tsx`, update the three logging tests (lines 281-333):

```tsx
  it('logs kunstwerk_toegevoegd with the logged-in medewerker when adding', async () => {
    uploadMock.mockResolvedValue('https://storage.example.com/nieuw.jpg');
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-foto-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-foto-preview')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('kunstwerk-modal-segment-seg-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-maat-maat-1'));
    fireEvent.change(screen.getByTestId('kunstwerk-modal-naam'), { target: { value: 'Nieuw kunstwerk' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '99' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Nieuw kunstwerk' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-staand'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'kunstwerk_toegevoegd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'Nieuw kunstwerk'
      )
    );
  });

  it('logs kunstwerk_gewijzigd with the logged-in medewerker when editing', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-kw-1'));
    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '175' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'kunstwerk_gewijzigd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'Hotel paneel 1'
      )
    );
  });

  it('logs kunstwerk_verwijderd with the logged-in medewerker when deleting', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-kw-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-verwijderen'));

    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'kunstwerk_verwijderd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'Hotel paneel 1'
      )
    );
  });
```

Then extend the backfill test (lines 356-376) with a new assertion:

```tsx
  it('shows a backfill button for kunstwerken without a naam and fills naam from the NL description on click', async () => {
    const zonderNaam: Kunstwerk = {
      ...KUNSTWERKEN[0],
      id: 'kw-2',
      naam: '',
      omschrijvingNl: 'Restaurant paneel 3',
    };
    const onUpdate = vi.fn().mockResolvedValue(true);
    renderSection({ kunstwerken: [...KUNSTWERKEN, zonderNaam], onUpdate });

    const backfillButton = screen.getByTestId('kunstwerken-backfill-namen');
    expect(backfillButton).toHaveTextContent('1');
    fireEvent.click(backfillButton);

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(
        'kw-2',
        expect.objectContaining({ naam: 'Restaurant paneel 3' })
      )
    );
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'kunstwerk_gewijzigd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'Restaurant paneel 3'
      )
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: FAIL on the four updated/new assertions.

- [ ] **Step 3: Implement**

In `src/components/beheer/KunstwerkenSection.tsx`, replace lines 280-285:

```tsx
    const success = modalState.mode === 'add' ? await onAdd(data) : await onUpdate(modalState.kunstwerk.id, data);
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'kunstwerk_toegevoegd' : 'kunstwerk_gewijzigd',
        actorFromMedewerker(user),
        naam
      );
      closeModal();
```

Replace line 295:

```tsx
      void logActiviteit('kunstwerk_verwijderd', actorFromMedewerker(user), modalState.kunstwerk.naam);
```

Replace lines 306-311 (the backfill loop):

```tsx
    for (const kunstwerk of kunstwerkenZonderNaam) {
      const { id, ...data } = kunstwerk;
      const nieuweNaam = kunstwerk.omschrijvingNl || kunstwerk.id;
      const success = await onUpdate(id, { ...data, naam: nieuweNaam });
      if (success) {
        void logActiviteit('kunstwerk_gewijzigd', actorFromMedewerker(user), nieuweNaam);
      }
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/KunstwerkenSection.tsx tests/components/beheer/KunstwerkenSection.test.tsx
git commit -m "feat: log the omschrijving for kunstwerk activiteiten, including naam-backfill"
```

---

### Task 10: PrijsgroepenSection — omschrijving wiring

**Files:**
- Modify: `src/components/beheer/PrijsgroepenSection.tsx:68-98`
- Test: `tests/components/beheer/PrijsgroepenSection.test.tsx:70-120`

**Interfaces:**
- Consumes: `logActiviteit(type, actor, omschrijving?)` from Task 1.

- [ ] **Step 1: Update the failing tests**

In `tests/components/beheer/PrijsgroepenSection.test.tsx`, update the add and delete tests (lines 70-120):

```tsx
  it('adds a new prijsgroep, closes the modal, and logs prijsgroep_toegevoegd', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('prijsgroepen-add'));
    fireEvent.change(screen.getByTestId('prijsgroep-modal-naam'), { target: { value: 'VIP' } });
    fireEvent.change(screen.getByTestId('prijsgroep-modal-kortingspercentage'), { target: { value: '25' } });
    fireEvent.click(screen.getByTestId('prijsgroep-modal-opslaan'));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ naam: 'VIP', kortingspercentage: 25 }));
    await waitFor(() => expect(screen.queryByTestId('prijsgroep-modal')).not.toBeInTheDocument());
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'prijsgroep_toegevoegd',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'VIP'
    );
  });
```

```tsx
  it('deletes a prijsgroep and logs prijsgroep_verwijderd', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-pg-1'));
    fireEvent.click(screen.getByTestId('prijsgroep-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('pg-1'));
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'prijsgroep_verwijderd',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'Standaard'
    );
  });
```

Also update the existing edit test (lines 93-108; row `pg-2` is `{ naam: 'Wholesale', kortingspercentage: 15 }` — only `kortingspercentage` is changed, so the omschrijving reflects the unchanged `naam`):

```tsx
  it('opens a row for editing pre-filled, updates it, and logs prijsgroep_gewijzigd', async () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-pg-2'));
    expect(screen.getByTestId('prijsgroep-modal-naam')).toHaveValue('Wholesale');
    expect(screen.getByTestId('prijsgroep-modal-kortingspercentage')).toHaveValue(15);
    fireEvent.change(screen.getByTestId('prijsgroep-modal-kortingspercentage'), { target: { value: '20' } });
    fireEvent.click(screen.getByTestId('prijsgroep-modal-opslaan'));
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('pg-2', { naam: 'Wholesale', kortingspercentage: 20 })
    );
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'prijsgroep_gewijzigd',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'Wholesale'
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/components/beheer/PrijsgroepenSection.test.tsx`
Expected: FAIL on all three updated tests (add/edit/delete) — the actual calls still only pass 2 arguments.

- [ ] **Step 3: Implement**

In `src/components/beheer/PrijsgroepenSection.tsx`, replace lines 73-78:

```tsx
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'prijsgroep_toegevoegd' : 'prijsgroep_gewijzigd',
        actorFromMedewerker(user),
        naam
      );
      closeModal();
```

Replace line 93:

```tsx
      void logActiviteit('prijsgroep_verwijderd', actorFromMedewerker(user), modalState.prijsgroep.naam);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/components/beheer/PrijsgroepenSection.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/PrijsgroepenSection.tsx tests/components/beheer/PrijsgroepenSection.test.tsx
git commit -m "feat: log the omschrijving for prijsgroep activiteiten"
```

---

### Task 11: KunstenaarsSection — omschrijving wiring

**Files:**
- Modify: `src/components/beheer/KunstenaarsSection.tsx:238-274`
- Test: `tests/components/beheer/KunstenaarsSection.test.tsx:163-299,412-423`

**Interfaces:**
- Consumes: `logActiviteit(type, actor, omschrijving?)` from Task 1.

- [ ] **Step 1: Update the failing tests**

In `tests/components/beheer/KunstenaarsSection.test.tsx`, update the four existing assertions:

Line 201 (inside the `'adds a new kunstenaar...'` test):

```tsx
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'kunstenaar_toegevoegd',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'Nieuwe Kunstenaar'
    );
```

Line 289 (inside the `'opens a row for editing pre-filled and updates it...'` test):

```tsx
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'kunstenaar_gewijzigd',
      expect.anything(),
      'Sabrina G.'
    );
```

Line 297 (inside the `'deletes a kunstenaar and logs kunstenaar_verwijderd'` test):

```tsx
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'kunstenaar_verwijderd',
      expect.anything(),
      'Sabrina Glasser'
    );
```

Line 422 (inside the `'still saves successfully when only the refetch afterwards fails'` test):

```tsx
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'kunstenaar_toegevoegd',
      expect.anything(),
      'Nieuw'
    );
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/components/beheer/KunstenaarsSection.test.tsx`
Expected: FAIL on all four updated tests (call now has 2 args, assertion expects 3).

- [ ] **Step 3: Implement**

In `src/components/beheer/KunstenaarsSection.tsx`, replace lines 238-243:

```tsx
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'kunstenaar_toegevoegd' : 'kunstenaar_gewijzigd',
        actorFromMedewerker(user),
        naam
      );
      closeModal();
```

Replace line 270:

```tsx
      void logActiviteit('kunstenaar_verwijderd', actorFromMedewerker(user), modalState.kunstenaar.naam);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/components/beheer/KunstenaarsSection.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/KunstenaarsSection.tsx tests/components/beheer/KunstenaarsSection.test.tsx
git commit -m "feat: log the omschrijving for kunstenaar activiteiten"
```

---

### Task 12: DrukkerModal — omschrijving wiring

**Files:**
- Modify: `src/components/beheer/DrukkerModal.tsx:56-80`
- Test: `tests/components/beheer/DrukkersSection.test.tsx:87-159`

**Interfaces:**
- Consumes: `logActiviteit(type, actor, omschrijving?)` from Task 1.

Note: the `logActiviteit` calls live in `DrukkerModal.tsx`, but the assertions that exercise them live in `tests/components/beheer/DrukkersSection.test.tsx` (an integration-style test that mounts `DrukkersSection`, which renders `DrukkerModal` internally) — `tests/components/beheer/DrukkerModal.test.tsx` mocks `logActiviteit` as a bare `vi.fn()` with no call-shape assertions and needs no changes.

- [ ] **Step 1: Update the failing tests**

In `tests/components/beheer/DrukkersSection.test.tsx`, update the three logging assertions:

Lines 108-112 (inside `'adds a new drukker, closes the modal, and logs drukker_toegevoegd'`):

```tsx
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'drukker_toegevoegd',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'Nieuwe Drukker'
    );
```

Lines 141-145 (inside `'opens a row for editing pre-filled, updates it, and logs drukker_gewijzigd'`):

```tsx
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'drukker_gewijzigd',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'Drukkerij Janssen'
    );
```

Lines 154-158 (inside `'deletes a drukker with no zendingen and logs drukker_verwijderd'`):

```tsx
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'drukker_verwijderd',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'Drukkerij Janssen'
    );
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/components/beheer/DrukkersSection.test.tsx`
Expected: FAIL on the three updated tests.

- [ ] **Step 3: Implement**

In `src/components/beheer/DrukkerModal.tsx`, replace line 59-60:

```tsx
    if (success) {
      void logActiviteit(
        state.mode === 'add' ? 'drukker_toegevoegd' : 'drukker_gewijzigd',
        actorFromMedewerker(user),
        fields.naam
      );
      onClose();
```

Replace line 75:

```tsx
      void logActiviteit('drukker_verwijderd', actorFromMedewerker(user), state.drukker.naam);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/components/beheer/DrukkersSection.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/DrukkerModal.tsx tests/components/beheer/DrukkersSection.test.tsx
git commit -m "feat: log the omschrijving for drukker activiteiten"
```

---

### Task 13: KlantModal — omschrijving wiring (6 events)

**Files:**
- Modify: `src/components/beheer/KlantModal.tsx:110-211`
- Test: `tests/components/beheer/KlantModal.test.tsx:163-427`

**Interfaces:**
- Consumes: `logActiviteit(type, actor, omschrijving?)` from Task 1.

All 6 handlers already have `klant` (the `Klant` prop) in scope, non-null-checked at the top of each function — `klant.companyName` is the omschrijving for every one of them.

- [ ] **Step 1: Update the failing tests**

In `tests/components/beheer/KlantModal.test.tsx`, update all 6 assertions (the `KLANT` fixture's `companyName` is `'Testbedrijf BV'`):

Line 163 (`klant_prijsgroep_gewijzigd`):

```tsx
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'klant_prijsgroep_gewijzigd',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'Testbedrijf BV'
    );
```

Line 198 (`klant_minimale_afname_gewijzigd`):

```tsx
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'klant_minimale_afname_gewijzigd',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'Testbedrijf BV'
    );
```

Line 264 (`klant_gewijzigd`):

```tsx
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'klant_gewijzigd',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'Testbedrijf BV'
    );
```

Lines 386-391 (`klant_goedgekeurd`):

```tsx
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'klant_goedgekeurd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'Testbedrijf BV'
      )
    );
```

Lines 399-404 (`klant_afgewezen`):

```tsx
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'klant_afgewezen',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'Testbedrijf BV'
      )
    );
```

Line 424 (`klant_exclusiviteit_gewijzigd`):

```tsx
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'klant_exclusiviteit_gewijzigd',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'Testbedrijf BV'
    );
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/components/beheer/KlantModal.test.tsx`
Expected: FAIL on all 6 updated tests.

- [ ] **Step 3: Implement**

In `src/components/beheer/KlantModal.tsx`, update each of the 6 calls:

Line 114:

```tsx
      void logActiviteit('klant_gewijzigd', actorFromMedewerker(user), klant.companyName);
```

Line 126:

```tsx
      void logActiviteit('klant_prijsgroep_gewijzigd', actorFromMedewerker(user), klant.companyName);
```

Line 171:

```tsx
      void logActiviteit('klant_exclusiviteit_gewijzigd', actorFromMedewerker(user), klant.companyName);
```

Line 184:

```tsx
      void logActiviteit('klant_minimale_afname_gewijzigd', actorFromMedewerker(user), klant.companyName);
```

Line 196:

```tsx
      void logActiviteit('klant_goedgekeurd', actorFromMedewerker(user), klant.companyName);
```

Line 207:

```tsx
      void logActiviteit('klant_afgewezen', actorFromMedewerker(user), klant.companyName);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/components/beheer/KlantModal.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/KlantModal.tsx tests/components/beheer/KlantModal.test.tsx
git commit -m "feat: log the klant companyName as omschrijving for klant activiteiten"
```

---

### Task 14: BestellingModal — omschrijving wiring (4 events)

**Files:**
- Modify: `src/components/beheer/BestellingModal.tsx:79-165`
- Test: `tests/components/beheer/BestellingModal.test.tsx:165-358`

**Interfaces:**
- Consumes: `logActiviteit(type, actor, omschrijving?)` from Task 1, `Bestelling.bestelnr: string` from Task 4.

- [ ] **Step 1: Update the failing tests**

In `tests/components/beheer/BestellingModal.test.tsx`, update all 4 assertions (`BESTELLING.bestelnr` is `'GD-00101'`, `BESTELLING_MET_EIGEN_MAAT.bestelnr` is `'GD-00102'`, both added in Task 4):

Lines 165-176 (`bestelling_goedgekeurd`):

```tsx
  it('logs bestelling_goedgekeurd with the logged-in medewerker on approval', async () => {
    updateDocMock.mockResolvedValue(undefined);
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-goedkeuren'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'bestelling_goedgekeurd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'GD-00101'
      )
    );
  });
```

Lines 178-189 (`bestelling_afgewezen`):

```tsx
  it('logs bestelling_afgewezen with the logged-in medewerker on rejection', async () => {
    updateDocMock.mockResolvedValue(undefined);
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'bestelling_afgewezen',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'GD-00101'
      )
    );
  });
```

Lines 238-242 (`bestelling_prijs_vastgesteld`, uses `BESTELLING_MET_EIGEN_MAAT`):

```tsx
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'bestelling_prijs_vastgesteld',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'GD-00102'
    );
```

Lines 354-358 (`bestelling_regel_gewijzigd`, uses `BESTELLING`):

```tsx
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'bestelling_regel_gewijzigd',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'GD-00101'
    );
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/components/beheer/BestellingModal.test.tsx`
Expected: FAIL on the four updated tests.

- [ ] **Step 3: Implement**

In `src/components/beheer/BestellingModal.tsx`, replace line 83:

```tsx
      void logActiviteit('bestelling_goedgekeurd', actorFromMedewerker(user), bestelling.bestelnr);
```

Replace line 94:

```tsx
      void logActiviteit('bestelling_afgewezen', actorFromMedewerker(user), bestelling.bestelnr);
```

Replace line 107:

```tsx
      void logActiviteit('bestelling_prijs_vastgesteld', actorFromMedewerker(user), bestelling.bestelnr);
```

Replace line 159:

```tsx
      void logActiviteit('bestelling_regel_gewijzigd', actorFromMedewerker(user), bestelling.bestelnr);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/components/beheer/BestellingModal.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/BestellingModal.tsx tests/components/beheer/BestellingModal.test.tsx
git commit -m "feat: log the bestelnummer as omschrijving for bestelling activiteiten"
```

---

### Task 15: VersturenNaarDrukkerDialog — omschrijving wiring (batch join)

**Files:**
- Modify: `src/components/beheer/VersturenNaarDrukkerDialog.tsx:126`
- Test: `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx:72-164`

**Interfaces:**
- Consumes: `logActiviteit(type, actor, omschrijving?)` from Task 1, `Bestelling.bestelnr: string` from Task 4.

- [ ] **Step 1: Update the failing test and add a batch test**

In `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx`, update the existing assertion (lines 157-161):

```tsx
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'bestelling_verstuurd_naar_drukker',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'GD-00201'
    );
```

Then add a second `Bestelling` fixture and a new test right after the `BESTELLING` fixture (after line 81) and inside the `describe('VersturenNaarDrukkerDialog', ...)` block (after the existing `'sends the mail...'` test, i.e. after line 164):

```ts
const BESTELLING_2: Bestelling = {
  id: 'header-2',
  klantId: 'uid-1',
  companyName: 'Testbedrijf BV',
  bestelnr: 'GD-00202',
  besteldatum: '2-7-2026',
  status: 'Te versturen naar drukker',
  lineCount: 1,
  totalQuantity: 1,
  lines: [{ id: 'line-2', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
};
```

```tsx
  it('joins bestelnummers with a comma when sending a batch of multiple bestellingen', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    updateDocMock.mockResolvedValue(undefined);
    addDocMock.mockResolvedValue(undefined);
    renderDialog({ bestellingen: [BESTELLING, BESTELLING_2] });

    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'bestelling_verstuurd_naar_drukker',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'GD-00201, GD-00202'
      )
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx`
Expected: FAIL on both the updated and the new test.

- [ ] **Step 3: Implement**

In `src/components/beheer/VersturenNaarDrukkerDialog.tsx`, replace line 126:

```tsx
      void logActiviteit(
        'bestelling_verstuurd_naar_drukker',
        actorFromMedewerker(user),
        bestellingen.map((b) => b.bestelnr).join(', ')
      );
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/VersturenNaarDrukkerDialog.tsx tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx
git commit -m "feat: log comma-joined bestelnummers as omschrijving when sending a batch to the drukker"
```

---

### Task 16: CartPanel — omschrijving wiring

**Files:**
- Modify: `src/components/CartPanel.tsx:100`
- Test: `tests/components/CartPanel.test.tsx:473-487`

**Interfaces:**
- Consumes: `logActiviteit(type, actor, omschrijving?)` from Task 1.

`bestelnr` is already a local `const` in scope (generated at line 78, before the `logActiviteit` call at line 100) — no plumbing needed here.

- [ ] **Step 1: Update the failing test**

In `tests/components/CartPanel.test.tsx`, update the `'logs bestelling_geplaatst...'` test (lines 473-487):

```tsx
  it('logs bestelling_geplaatst with the logged-in klant when the order succeeds', async () => {
    addDocMock.mockResolvedValueOnce({ id: 'header-1' }).mockResolvedValue({ id: 'line-1' });
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));

    await screen.findByTestId('cart-order-confirmation');
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'bestelling_geplaatst',
      { id: 'uid-1', email: 'klant@example.com', naam: 'Testbedrijf BV' },
      'GD-00001'
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/components/CartPanel.test.tsx`
Expected: FAIL on this test — call still has 2 args.

- [ ] **Step 3: Implement**

In `src/components/CartPanel.tsx`, replace line 100:

```tsx
      void logActiviteit('bestelling_geplaatst', actorFromCustomer(user), bestelnr);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/components/CartPanel.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/CartPanel.tsx tests/components/CartPanel.test.tsx
git commit -m "feat: log the bestelnummer as omschrijving when a bestelling is placed"
```

---

### Task 17: ProductModal — omschrijving wiring (2 events)

**Files:**
- Modify: `src/components/ProductModal.tsx:174,191`
- Test: `tests/components/ProductModal.test.tsx:455-475,578-626`

**Interfaces:**
- Consumes: `logActiviteit(type, actor, omschrijving?)` from Task 1.

- [ ] **Step 1: Update the failing tests**

In `tests/components/ProductModal.test.tsx`, update the `mandje_toegevoegd` test (lines 455-475; the fixture `KUNSTWERK.naam` is `'Hotel paneel'`, line 43):

```tsx
  it('logs mandje_toegevoegd with the logged-in klant when confirmed', async () => {
    vi.useRealTimers();
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({ status: 'Goedgekeurd', companyName: 'Testbedrijf BV' }),
    });
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-1', email: 'klant@example.com' });
      return () => {};
    });
    renderModal();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.click(screen.getByTestId('product-modal-confirm'));
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'mandje_toegevoegd',
      { id: 'uid-1', email: 'klant@example.com', naam: 'Testbedrijf BV' },
      'Hotel paneel'
    );
  });
```

Update the `mandje_eigen_maat_toegevoegd` test (lines 578-626 — only the final assertion at lines 621-625 changes):

```tsx
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'mandje_eigen_maat_toegevoegd',
      { id: null, email: 'Onbekend', naam: 'Onbekend' },
      'Hotel paneel'
    );
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/components/ProductModal.test.tsx`
Expected: FAIL on both updated tests.

- [ ] **Step 3: Implement**

In `src/components/ProductModal.tsx`, replace line 174:

```tsx
      void logActiviteit('mandje_eigen_maat_toegevoegd', actorFromCustomer(user), kunstwerk.naam);
```

Replace line 191:

```tsx
      void logActiviteit('mandje_toegevoegd', actorFromCustomer(user), kunstwerk.naam);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/components/ProductModal.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/ProductModal.tsx tests/components/ProductModal.test.tsx
git commit -m "feat: log the kunstwerknaam as omschrijving when added to the mandje"
```

---

### Task 18: ProductsGrid — omschrijving wiring

**Files:**
- Modify: `src/components/ProductsGrid.tsx:60-65`
- Test: `tests/components/ProductsGrid.test.tsx:225-245`

**Interfaces:**
- Consumes: `logActiviteit(type, actor, omschrijving?)` from Task 1.

- [ ] **Step 1: Update the failing test**

In `tests/components/ProductsGrid.test.tsx`, update the `'logs kunstwerk_bekeken...'` test (lines 225-245; `cards[0]` corresponds to `KUNSTWERKEN[0]`, whose `naam` is used as the third argument):

```tsx
  it('logs kunstwerk_bekeken with the logged-in klant when a card is clicked', async () => {
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({ status: 'Goedgekeurd', companyName: 'Testbedrijf BV' }),
    });
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-1', email: 'klant@example.com' });
      return () => {};
    });
    renderProductsGrid();
    const cards = await screen.findAllByTestId('product-card');
    await waitFor(() => expect(getDocMock).toHaveBeenCalled());
    fireEvent.click(cards[0]);
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'kunstwerk_bekeken',
        { id: 'uid-1', email: 'klant@example.com', naam: 'Testbedrijf BV' },
        KUNSTWERKEN[0].naam
      )
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/components/ProductsGrid.test.tsx`
Expected: FAIL on this test.

- [ ] **Step 3: Implement**

In `src/components/ProductsGrid.tsx`, replace lines 60-65:

```tsx
  function handleSelect(kunstwerk: Kunstwerk) {
    setSelectedKunstwerk(kunstwerk);
    if (user) {
      void logActiviteit('kunstwerk_bekeken', actorFromCustomer(user), kunstwerk.naam);
    }
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/components/ProductsGrid.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/ProductsGrid.tsx tests/components/ProductsGrid.test.tsx
git commit -m "feat: log the kunstwerknaam as omschrijving when a kunstwerk is bekeken"
```

---

## Final verification (after all 18 tasks)

- [ ] Run the full test suite: `npm test`
  Expected: PASS, all tests (regression check across the whole codebase — the events left deliberately without an omschrijving, `account_bezocht`/`word_klant_bezocht`/`word_klant_aanvraag`/`bedrijfsgegevens_gewijzigd`/`bestelinstellingen_gewijzigd`, keep their unchanged 2-arg calls and assertions, and their tests should be untouched by this plan).
- [ ] Run the type check: `npx tsc --noEmit`
  Expected: PASS, no errors.
- [ ] Run the build: `npm run build`
  Expected: PASS, no errors.
- [ ] Confirm the Firestore rules deploy from Task 2 succeeded (re-run `npx --yes firebase-tools deploy --only firestore:rules` if this branch's rules edit predates a later `master` rules change — it should report "already up to date" or redeploy cleanly).
