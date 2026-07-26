# Bestelling → drukker workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Beheer approve a bestelling straight into a "Te versturen naar drukker" queue, bulk-select bestellingen in that status, and send one grouped e-mail per verzending to a configurable Drukker — with the sent mail archived and viewable per drukker.

**Architecture:** Same Firestore/Firebase + static Next.js export stack as the rest of Beheer (no server-side change, the Firebase→MySQL migration in `docs/superpowers/plans/2026-07-23-firebase-to-mysql-migration.md` has not happened yet). Mail delivery reuses the existing generic PHP relay (`mail-server/send-order-confirmation.php`, renamed to `send-mail.php`) — no new backend code. A new `DataTable` row-selection capability, a new `Drukker`/`DrukkerZending` Firestore data model, and a new `VersturenNaarDrukkerDialog` component tie it together.

**Tech Stack:** Next.js (App Router, static export), React, TypeScript, Firebase (Firestore + Auth), next-intl, Vitest + Testing Library, PHPMailer.

## Global Constraints

- Beheer-namespace translations are Dutch-only (`messages/nl.json`, `beheer` key) — do not add these keys to `en.json`/`de.json`/`fr.json`.
- Every Firestore write from a beheer action that succeeds must fire a `logActiviteit(...)` call with `actorFromMedewerker(user)`, and must **not** log on a blocked/failed write.
- `npm test` (Vitest) does not type-check — always also run `npx tsc --noEmit` (or `npm run build`) before considering a task's diff clean, per the generics-inference lesson from the 2026-07-21 beheer-datatabellen build.
- Never use `git add -A`/`-a`/`.` — stage explicit paths only (past incident: an untracked credentials file got swept into a commit).
- This repo's working directory is shared with other concurrent Claude Code sessions (confirmed multiple times). Check `git status`/`git log` immediately before each task's commit for unexpected interleaved commits; do not touch files unrelated to this plan.

---

## File Structure

New files:
- `src/lib/buildDrukkerMail.ts` — pure function building the drukker e-mail subject/body from selected bestellingen.
- `tests/lib/buildDrukkerMail.test.ts`
- `src/components/beheer/DrukkersSection.tsx` — Drukkers list (DataTable + add/edit modal), same shape as `PrijsgroepenSection.tsx`.
- `tests/components/beheer/DrukkersSection.test.tsx`
- `src/components/beheer/DrukkerModal.tsx` — Drukker add/edit form + embedded "Verzonden mails" (zendingen) list.
- `tests/components/beheer/DrukkerModal.test.tsx`
- `src/components/beheer/VersturenNaarDrukkerDialog.tsx` — drukker picker + e-mail preview + send action.
- `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx`

Modified files:
- `src/components/DataTable.tsx` (+ `tests/components/DataTable.test.tsx`) — optional generic row-selection.
- `src/components/beheer/BestellingenSection.tsx` (+ its test) — status quick-filter target, bulk-selection wiring, opens `VersturenNaarDrukkerDialog`.
- `src/components/beheer/BestellingModal.tsx` (+ its test) — Goedkeuren now sets `'Te versturen naar drukker'`.
- `src/components/beheer/KlantenSection.tsx` — `Klant` interface gains 6 address fields.
- `src/components/beheer/KlantModal.tsx` (+ its test) — Afleveradres/Factuuradres editable blocks.
- `src/components/beheer/BeheerNav.tsx` (+ its test) — new `drukkers` nav item.
- `src/components/beheer/BeheerShell.tsx` (+ its test) — klanten loader reads the 6 new fields, wires `drukkers` collection + `DrukkersSection` + passes `klanten`/`drukkers` into `BestellingenSection`.
- `src/lib/logActiviteit.ts` — 4 new `ActiviteitType` values.
- `src/components/beheer/ActiviteitSection.tsx` — 4 new `TYPE_LABEL_KEYS` entries.
- `firestore.rules` — `drukkers` + `drukkers/{id}/zendingen` rules, activiteitenlog `type in [...]` list extended.
- `messages/nl.json` — new keys (see each task).
- `mail-server/send-order-confirmation.php` → renamed to `mail-server/send-mail.php` (no logic change).
- `tests/components/beheer/KlantModal.test.tsx`, `KlantenSection.test.tsx`, `BeheerShell.test.tsx`, `BestellingenSection.test.tsx`, `BestellingModal.test.tsx` — fixture/assertion updates for the above.

---

### Task 1: DataTable — generic row-selection capability

**Files:**
- Modify: `src/components/DataTable.tsx`
- Test: `tests/components/DataTable.test.tsx`

**Interfaces:**
- Produces: `export interface RowSelection<T> { selectedIds: Set<string>; onToggle: (id: string) => void; onToggleAll: (ids: string[]) => void; isSelectable: (row: T) => boolean; }`, new optional `selection?: RowSelection<T>` prop on `DataTableProps<T>`.
- New test ids: `data-table-select-all` (header checkbox), `data-table-row-select-${id}` (per-row checkbox).

- [ ] **Step 1: Write the failing tests**

Append to `tests/components/DataTable.test.tsx` (new `describe` block after the existing `quickFilter` block, before the final closing of the outer `describe`):

```tsx
  describe('selection', () => {
    function renderSelectable(overrides: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) {
      const onToggle = vi.fn();
      const onToggleAll = vi.fn();
      const selection = {
        selectedIds: new Set<string>(),
        onToggle,
        onToggleAll,
        isSelectable: (row: Row) => row.status === 'Open',
      };
      renderTable({ selection, ...overrides });
      return { onToggle, onToggleAll };
    }

    it('does not render selection checkboxes when no selection prop is passed', () => {
      renderTable();
      expect(screen.queryByTestId('data-table-select-all')).not.toBeInTheDocument();
      expect(screen.queryByTestId('data-table-row-select-a')).not.toBeInTheDocument();
    });

    it('renders a checkbox only for rows where isSelectable returns true', () => {
      renderSelectable();
      expect(screen.getByTestId('data-table-row-select-a')).toBeInTheDocument();
      expect(screen.getByTestId('data-table-row-select-c')).toBeInTheDocument();
      expect(screen.queryByTestId('data-table-row-select-b')).not.toBeInTheDocument();
    });

    it('calls onToggle with the row id and does not trigger onRowClick when a checkbox is clicked', () => {
      const onToggle = vi.fn();
      const onRowClick = vi.fn();
      renderTable({
        onRowClick,
        selection: {
          selectedIds: new Set<string>(),
          onToggle,
          onToggleAll: vi.fn(),
          isSelectable: (row: Row) => row.status === 'Open',
        },
      });
      fireEvent.click(screen.getByTestId('data-table-row-select-a'));
      expect(onToggle).toHaveBeenCalledWith('a');
      expect(onRowClick).not.toHaveBeenCalled();
    });

    it('reflects selectedIds as checked state', () => {
      renderSelectable({
        selection: {
          selectedIds: new Set(['a']),
          onToggle: vi.fn(),
          onToggleAll: vi.fn(),
          isSelectable: (row: Row) => row.status === 'Open',
        },
      });
      expect(screen.getByTestId('data-table-row-select-a')).toBeChecked();
      expect(screen.getByTestId('data-table-row-select-c')).not.toBeChecked();
    });

    it('calls onToggleAll with every currently visible selectable row id when the header checkbox is clicked', () => {
      const { onToggleAll } = renderSelectable();
      fireEvent.click(screen.getByTestId('data-table-select-all'));
      expect(onToggleAll).toHaveBeenCalledWith(['a', 'c']);
    });

    it('checks the header checkbox only when every visible selectable row is selected', () => {
      renderSelectable({
        selection: {
          selectedIds: new Set(['a', 'c']),
          onToggle: vi.fn(),
          onToggleAll: vi.fn(),
          isSelectable: (row: Row) => row.status === 'Open',
        },
      });
      expect(screen.getByTestId('data-table-select-all')).toBeChecked();
    });

    it('restricts onToggleAll ids to rows visible after search', () => {
      const { onToggleAll } = renderSelectable();
      fireEvent.change(screen.getByTestId('data-table-search'), { target: { value: 'Bravo' } });
      fireEvent.click(screen.getByTestId('data-table-select-all'));
      expect(onToggleAll).toHaveBeenCalledWith(['a']);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/DataTable.test.tsx`
Expected: FAIL — `data-table-select-all`/`data-table-row-select-*` not found (selection prop does not exist yet).

- [ ] **Step 3: Implement the selection capability**

In `src/components/DataTable.tsx`, add the new exported type right after `StatusQuickFilter`:

```ts
export interface RowSelection<T> {
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
  isSelectable: (row: T) => boolean;
}
```

Add `selection?: RowSelection<T>;` to `DataTableProps<T>` (after `quickFilter?: StatusQuickFilter<T>;`), and add `selection` to the destructured props of `DataTable`.

Below the existing `sortedRows` `useMemo`, add:

```ts
  const selectableVisibleIds = useMemo(() => {
    if (!selection) return [];
    return sortedRows.filter((row) => selection.isSelectable(row)).map((row) => getRowId(row));
  }, [sortedRows, selection, getRowId]);

  const allVisibleSelected =
    selectableVisibleIds.length > 0 && selectableVisibleIds.every((id) => selection?.selectedIds.has(id));
```

Add a header cell (as the first `<th>`, before the `columns.map(...)` header loop) and a body cell (as the first `<td>` in each row, before the `columns.map(...)` body loop), both conditional on `selection`:

```tsx
              {selection && (
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    data-testid="data-table-select-all"
                    checked={allVisibleSelected}
                    onChange={() => selection.onToggleAll(selectableVisibleIds)}
                    className="h-3.5 w-3.5"
                  />
                </th>
              )}
```

```tsx
                {selection && (
                  <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                    {selection.isSelectable(row) && (
                      <input
                        type="checkbox"
                        data-testid={`data-table-row-select-${getRowId(row)}`}
                        checked={selection.selectedIds.has(getRowId(row))}
                        onChange={() => selection.onToggle(getRowId(row))}
                        className="h-3.5 w-3.5"
                      />
                    )}
                  </td>
                )}
```

(The `onClick={(event) => event.stopPropagation()}` on the `<td>` prevents the checkbox click from bubbling up to the row's `onClick={() => onRowClick(row)}`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/DataTable.test.tsx`
Expected: PASS, all tests including the new `selection` describe block.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/DataTable.tsx tests/components/DataTable.test.tsx
git commit -m "feat: add optional row-selection capability to DataTable"
```

---

### Task 2: Bestelling status — retire 'Goedgekeurd', add 'Te versturen naar drukker' / 'Verstuurd naar drukker'

**Files:**
- Modify: `src/components/beheer/BestellingenSection.tsx`
- Modify: `src/components/beheer/BestellingModal.tsx`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/BestellingenSection.test.tsx`
- Test: `tests/components/beheer/BestellingModal.test.tsx`

**Interfaces:**
- Produces: `Bestelling['status']` becomes `'Te beoordelen' | 'Te versturen naar drukker' | 'Verstuurd naar drukker' | 'Afgewezen'`.

- [ ] **Step 1: Update the status union and badge classes**

In `src/components/beheer/BestellingenSection.tsx`, change:

```ts
  status: 'Te beoordelen' | 'Goedgekeurd' | 'Afgewezen';
```

to:

```ts
  status: 'Te beoordelen' | 'Te versturen naar drukker' | 'Verstuurd naar drukker' | 'Afgewezen';
```

Change the `quickFilter` prop passed to `DataTable` from:

```tsx
        quickFilter={{
          key: 'status',
          activeValue: 'Te beoordelen',
          activeLabel: t('bestellingenQuickTeBeoordelen'),
          allLabel: t('bestellingenQuickAlle'),
        }}
```

to:

```tsx
        quickFilter={{
          key: 'status',
          activeValue: 'Te versturen naar drukker',
          activeLabel: t('bestellingenQuickTeVersturenNaarDrukker'),
          allLabel: t('bestellingenQuickAlle'),
          defaultActive: false,
        }}
```

In `src/components/beheer/BestellingModal.tsx`, change `STATUS_BADGE_CLASS`:

```ts
const STATUS_BADGE_CLASS: Record<Bestelling['status'], string> = {
  'Te beoordelen': 'bg-amber-400/10 text-amber-300',
  'Te versturen naar drukker': 'bg-sky-400/10 text-sky-300',
  'Verstuurd naar drukker': 'bg-green-500/10 text-green-400',
  Afgewezen: 'bg-red-400/10 text-red-400',
};
```

And change `handleGoedkeuren`'s body from setting `'Goedgekeurd'` to `'Te versturen naar drukker'` (two occurrences — the `updateDoc` call and the `onUpdated` call):

```ts
  async function handleGoedkeuren() {
    if (!bestelling) return;
    try {
      await updateDoc(doc(db, 'bestelheaders', bestelling.id), { status: 'Te versturen naar drukker' });
      void logActiviteit('bestelling_goedgekeurd', actorFromMedewerker(user));
      onUpdated({ ...bestelling, status: 'Te versturen naar drukker' });
    } catch {
      setError(t('bestellingenActionError'));
    }
  }
```

(`logActiviteit('bestelling_goedgekeurd', ...)` stays the same event name — it names the action, not the resulting status.)

- [ ] **Step 2: Update the translation key**

In `messages/nl.json`, replace the line (around line 391):

```json
    "bestellingenQuickTeBeoordelen": "Te beoordelen bestellingen",
```

with:

```json
    "bestellingenQuickTeVersturenNaarDrukker": "Te versturen naar drukker",
```

(Leave `"bestellingenQuickAlle": "Alle bestellingen",` untouched.)

- [ ] **Step 3: Update BestellingenSection.test.tsx**

In `tests/components/beheer/BestellingenSection.test.tsx`, change the second fixture's status (it's used to represent "not the actionable status" in the default-view test) from `'Goedgekeurd'` to `'Verstuurd naar drukker'`:

```ts
  {
    id: 'header-2',
    klantId: 'uid-2',
    companyName: 'Ander Bedrijf',
    besteldatum: '2-7-2026',
    status: 'Verstuurd naar drukker',
    lineCount: 1,
    totalQuantity: 1,
    lines: [{ id: 'line-2', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
  },
```

Replace the two quick-filter tests:

```tsx
  it('shows only the "Te beoordelen" bestelling by default (status filter defaults to Te beoordelen)', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-header-1')).toBeInTheDocument();
    expect(screen.queryByTestId('data-table-row-header-2')).not.toBeInTheDocument();
  });

  it('shows all bestellingen after clicking the "alle bestellingen" quick filter link', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-quick-all'));
    expect(screen.getByTestId('data-table-row-header-1')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-header-2')).toBeInTheDocument();
  });
```

with:

```tsx
  it('shows all bestellingen by default (status filter defaults to "alle bestellingen")', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-header-1')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-header-2')).toBeInTheDocument();
  });

  it('shows only the "Te versturen naar drukker" bestelling after clicking that quick filter link', () => {
    const bestellingen = [
      { ...BESTELLINGEN[0], status: 'Te versturen naar drukker' as const },
      BESTELLINGEN[1],
    ];
    renderSection({ bestellingen });
    fireEvent.click(screen.getByTestId('data-table-quick-active'));
    expect(screen.getByTestId('data-table-row-header-1')).toBeInTheDocument();
    expect(screen.queryByTestId('data-table-row-header-2')).not.toBeInTheDocument();
  });
```

And update the approval test's expected status:

```tsx
  it('closes the modal and reports the updated bestelling via onBestellingUpdated after approving', async () => {
    updateDocMock.mockResolvedValue(undefined);
    const { onBestellingUpdated } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-header-1'));
    fireEvent.click(screen.getByTestId('bestelling-modal-goedkeuren'));

    await waitFor(() =>
      expect(onBestellingUpdated).toHaveBeenCalledWith({ ...BESTELLINGEN[0], status: 'Te versturen naar drukker' })
    );
    await waitFor(() => expect(screen.queryByTestId('bestelling-modal')).not.toBeInTheDocument());
  });
```

- [ ] **Step 4: Update BestellingModal.test.tsx**

In `tests/components/beheer/BestellingModal.test.tsx`, find the approval test (search for `bestelling-modal-goedkeuren`) and change its expected status from `'Goedgekeurd'` to `'Te versturen naar drukker'` in both the `updateDoc` assertion and the `onUpdated` assertion, and update the badge-class test (search for `STATUS_BADGE_CLASS`/`bestelling-modal-status`) if one asserts on the literal `'Goedgekeurd'` text — change it to assert `'Te versturen naar drukker'` for a bestelling with that status instead.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/components/beheer/BestellingenSection.test.tsx tests/components/beheer/BestellingModal.test.tsx`
Expected: PASS.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/beheer/BestellingenSection.tsx src/components/beheer/BestellingModal.tsx messages/nl.json tests/components/beheer/BestellingenSection.test.tsx tests/components/beheer/BestellingModal.test.tsx
git commit -m "feat: goedkeuren zet bestelling-status direct op 'Te versturen naar drukker'"
```

---

### Task 3: Klant — surface afleveradres/factuuradres fields already written at registration

**Files:**
- Modify: `src/components/beheer/KlantenSection.tsx`
- Modify: `src/components/beheer/BeheerShell.tsx`
- Test: `tests/components/beheer/KlantenSection.test.tsx`
- Test: `tests/components/beheer/BeheerShell.test.tsx`
- Test: `tests/components/beheer/KlantModal.test.tsx`

**Interfaces:**
- Produces: `Klant` gains `deliveryAddress: string; deliveryPostcode: string; deliveryCity: string; invoiceAddress: string; invoicePostcode: string; invoiceCity: string;` (all required — `RegistrationForm.tsx` already always writes them, defaulting to `''`).

- [ ] **Step 1: Extend the Klant interface**

In `src/components/beheer/KlantenSection.tsx`, add to the `Klant` interface, right after `city: string;`:

```ts
  deliveryAddress: string;
  deliveryPostcode: string;
  deliveryCity: string;
  invoiceAddress: string;
  invoicePostcode: string;
  invoiceCity: string;
```

- [ ] **Step 2: Read the fields in BeheerShell's klanten loader**

In `src/components/beheer/BeheerShell.tsx`, inside `loadKlanten`'s `snapshot.docs.map(...)`, add after `city: data.city,`:

```ts
              deliveryAddress: data.deliveryAddress ?? '',
              deliveryPostcode: data.deliveryPostcode ?? '',
              deliveryCity: data.deliveryCity ?? '',
              invoiceAddress: data.invoiceAddress ?? '',
              invoicePostcode: data.invoicePostcode ?? '',
              invoiceCity: data.invoiceCity ?? '',
```

(`?? ''` because any `klanten` doc created before this feature existed won't have these fields yet.)

- [ ] **Step 3: Update existing test fixtures**

In `tests/components/beheer/KlantenSection.test.tsx`, add to **both** objects in the `KLANTEN` array (after `city: 'Teststad',` / `city: 'Anderstad',`):

```ts
    deliveryAddress: '',
    deliveryPostcode: '',
    deliveryCity: '',
    invoiceAddress: '',
    invoicePostcode: '',
    invoiceCity: '',
```

In `tests/components/beheer/BeheerShell.test.tsx`, add the same 6 fields (all `''`) to `KLANT_DATA` after `city: 'Teststad',`.

In `tests/components/beheer/KlantModal.test.tsx`, add the same 6 fields (all `''`) to the `KLANT` fixture after `city: 'Teststad',`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/components/beheer/KlantenSection.test.tsx tests/components/beheer/BeheerShell.test.tsx tests/components/beheer/KlantModal.test.tsx`
Expected: PASS (these tests don't yet assert on the new fields, they're just present in fixtures now).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/beheer/KlantenSection.tsx src/components/beheer/BeheerShell.tsx tests/components/beheer/KlantenSection.test.tsx tests/components/beheer/BeheerShell.test.tsx tests/components/beheer/KlantModal.test.tsx
git commit -m "feat: read klant afleveradres/factuuradres fields into Beheer's Klant type"
```

---

### Task 4: KlantModal — editable Afleveradres and Factuuradres blocks

**Files:**
- Modify: `src/components/beheer/KlantModal.tsx`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/KlantModal.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `tests/components/beheer/KlantModal.test.tsx`, inside the `describe('KlantModal', ...)` block:

```tsx
  it('shows "Gebruikt standaardadres" for afleveradres and factuuradres when both are empty', () => {
    renderModal(KLANT);
    expect(screen.getByTestId('klant-modal-afleveradres-leeg')).toHaveTextContent('Gebruikt standaardadres');
    expect(screen.getByTestId('klant-modal-factuuradres-leeg')).toHaveTextContent('Gebruikt standaardadres');
  });

  it('shows the afleveradres fields read-only when set, instead of the "gebruikt standaardadres" label', () => {
    renderModal({ ...KLANT, deliveryAddress: 'Havenweg 5', deliveryPostcode: '5678 CD', deliveryCity: 'Havenstad' });
    expect(screen.queryByTestId('klant-modal-afleveradres-leeg')).not.toBeInTheDocument();
    expect(screen.getByTestId('klant-modal')).toHaveTextContent('Havenweg 5');
    expect(screen.getByTestId('klant-modal')).toHaveTextContent('Havenstad');
  });

  it('edits and saves the afleveradres and factuuradres fields via Opslaan', async () => {
    updateDocMock.mockResolvedValue(undefined);
    const { onUpdated } = renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-bewerken'));
    fireEvent.change(screen.getByTestId('klant-modal-deliveryAddress'), { target: { value: 'Havenweg 5' } });
    fireEvent.change(screen.getByTestId('klant-modal-deliveryPostcode'), { target: { value: '5678 CD' } });
    fireEvent.change(screen.getByTestId('klant-modal-deliveryCity'), { target: { value: 'Havenstad' } });
    fireEvent.change(screen.getByTestId('klant-modal-invoiceAddress'), { target: { value: 'Factuurlaan 9' } });
    fireEvent.change(screen.getByTestId('klant-modal-invoicePostcode'), { target: { value: '9999 ZZ' } });
    fireEvent.change(screen.getByTestId('klant-modal-invoiceCity'), { target: { value: 'Factuurstad' } });
    fireEvent.click(screen.getByTestId('klant-modal-velden-opslaan'));

    await waitFor(() =>
      expect(updateDocMock).toHaveBeenCalledWith(
        { collectionName: 'klanten', id: 'uid-1' },
        {
          companyName: 'Testbedrijf BV',
          kvk: '12345678',
          contactPerson: 'Jan Jansen',
          contactPreference: 'email',
          email: 'jan@example.com',
          phone: '0612345678',
          address: 'Teststraat 1',
          postcode: '1234 AB',
          city: 'Teststad',
          deliveryAddress: 'Havenweg 5',
          deliveryPostcode: '5678 CD',
          deliveryCity: 'Havenstad',
          invoiceAddress: 'Factuurlaan 9',
          invoicePostcode: '9999 ZZ',
          invoiceCity: 'Factuurstad',
        }
      )
    );
    expect(onUpdated).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/beheer/KlantModal.test.tsx`
Expected: FAIL — the new test ids don't exist yet, and the exact-match `updateDoc` assertion in the pre-existing "saves all edited fields" test will also now fail once fields exist (see Step 4).

- [ ] **Step 3: Implement the two new blocks**

In `src/components/beheer/KlantModal.tsx`, extend `EditableFields`:

```ts
interface EditableFields {
  companyName: string;
  kvk: string;
  contactPerson: string;
  contactPreference: string;
  email: string;
  phone: string;
  address: string;
  postcode: string;
  city: string;
  deliveryAddress: string;
  deliveryPostcode: string;
  deliveryCity: string;
  invoiceAddress: string;
  invoicePostcode: string;
  invoiceCity: string;
}
```

Extend `fieldsFromKlant`:

```ts
function fieldsFromKlant(klant: Klant): EditableFields {
  return {
    companyName: klant.companyName,
    kvk: klant.kvk,
    contactPerson: klant.contactPerson,
    contactPreference: klant.contactPreference,
    email: klant.email,
    phone: klant.phone,
    address: klant.address,
    postcode: klant.postcode,
    city: klant.city,
    deliveryAddress: klant.deliveryAddress,
    deliveryPostcode: klant.deliveryPostcode,
    deliveryCity: klant.deliveryCity,
    invoiceAddress: klant.invoiceAddress,
    invoicePostcode: klant.invoicePostcode,
    invoiceCity: klant.invoiceCity,
  };
}
```

(`handleOpslaanVelden` already spreads `{ ...fields }` into `updateDoc`, so no change needed there — the new fields flow through automatically.)

Add two new blocks in the JSX, right after the closing `</div>` of the `grid grid-cols-1 gap-3 sm:grid-cols-2` block (i.e. after the existing `city` `Veld` and before the `{isEditing && (...)}` Opslaan/Annuleren buttons block):

```tsx
          <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
            <span className="text-xs uppercase tracking-wide text-white/60">{t('klantenLabelAfleveradres')}</span>
            {!isEditing && fields.deliveryAddress === '' && fields.deliveryPostcode === '' && fields.deliveryCity === '' ? (
              <p data-testid="klant-modal-afleveradres-leeg" className="text-white/50">
                {t('klantenLabelGebruiktStandaardadres')}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Veld
                  label={t('klantenLabelAdres')}
                  value={fields.deliveryAddress}
                  editing={isEditing}
                  testId="klant-modal-deliveryAddress"
                  onChange={(value) => setField('deliveryAddress', value)}
                />
                <Veld
                  label={t('klantenLabelPostcode')}
                  value={fields.deliveryPostcode}
                  editing={isEditing}
                  testId="klant-modal-deliveryPostcode"
                  onChange={(value) => setField('deliveryPostcode', value)}
                />
                <Veld
                  label={t('klantenLabelPlaats')}
                  value={fields.deliveryCity}
                  editing={isEditing}
                  testId="klant-modal-deliveryCity"
                  onChange={(value) => setField('deliveryCity', value)}
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
            <span className="text-xs uppercase tracking-wide text-white/60">{t('klantenLabelFactuuradres')}</span>
            {!isEditing && fields.invoiceAddress === '' && fields.invoicePostcode === '' && fields.invoiceCity === '' ? (
              <p data-testid="klant-modal-factuuradres-leeg" className="text-white/50">
                {t('klantenLabelGebruiktStandaardadres')}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Veld
                  label={t('klantenLabelAdres')}
                  value={fields.invoiceAddress}
                  editing={isEditing}
                  testId="klant-modal-invoiceAddress"
                  onChange={(value) => setField('invoiceAddress', value)}
                />
                <Veld
                  label={t('klantenLabelPostcode')}
                  value={fields.invoicePostcode}
                  editing={isEditing}
                  testId="klant-modal-invoicePostcode"
                  onChange={(value) => setField('invoicePostcode', value)}
                />
                <Veld
                  label={t('klantenLabelPlaats')}
                  value={fields.invoiceCity}
                  editing={isEditing}
                  testId="klant-modal-invoiceCity"
                  onChange={(value) => setField('invoiceCity', value)}
                />
              </div>
            )}
          </div>
```

Note: while `isEditing` is true, the "leeg" branch never renders (condition is `!isEditing && ...`), so the three `Veld`s are always shown as editable inputs when editing — matching the spec's "bij Bewerken gewoon lege inputs" requirement.

- [ ] **Step 4: Update the pre-existing exact-match test**

In `tests/components/beheer/KlantModal.test.tsx`, find `it('saves all edited fields via Opslaan and exits edit mode', ...)` and add the 6 new fields (all `''`, since `KLANT`'s fixture has them empty) to the expected `updateDoc` payload, after `city: 'Teststad',`:

```ts
          deliveryAddress: '',
          deliveryPostcode: '',
          deliveryCity: '',
          invoiceAddress: '',
          invoicePostcode: '',
          invoiceCity: '',
```

- [ ] **Step 5: Add translations**

In `messages/nl.json`, add after `"klantenLabelPlaats": "Plaats",` (around line 322):

```json
    "klantenLabelAfleveradres": "Afleveradres",
    "klantenLabelFactuuradres": "Factuuradres",
    "klantenLabelGebruiktStandaardadres": "Gebruikt standaardadres",
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/components/beheer/KlantModal.test.tsx`
Expected: PASS.

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/beheer/KlantModal.tsx messages/nl.json tests/components/beheer/KlantModal.test.tsx
git commit -m "feat: maak afleveradres en factuuradres zichtbaar/bewerkbaar in KlantModal"
```

---

### Task 5: Drukker data model + DrukkersSection + DrukkerModal (CRUD) + nav/shell wiring

**Files:**
- Modify: `src/components/beheer/materiaalTypes.ts`
- Create: `src/components/beheer/DrukkersSection.tsx`
- Create: `src/components/beheer/DrukkerModal.tsx`
- Modify: `src/components/beheer/BeheerNav.tsx`
- Modify: `src/components/beheer/BeheerShell.tsx`
- Modify: `src/lib/logActiviteit.ts`
- Modify: `src/components/beheer/ActiviteitSection.tsx`
- Modify: `firestore.rules`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/DrukkersSection.test.tsx`
- Test: `tests/components/beheer/BeheerNav.test.tsx`
- Test: `tests/components/beheer/BeheerShell.test.tsx`

**Interfaces:**
- Produces: `export interface Drukker { id: string; naam: string; adres: string; postcode: string; plaats: string; email: string; prijsafspraken: string; }` in `materiaalTypes.ts`. `DrukkerModal` in this task only handles naam/adres/postcode/plaats/email/prijsafspraken CRUD — the "Verzonden mails" list is added in Task 6.
- `ActiviteitType` gains `'drukker_toegevoegd' | 'drukker_gewijzigd' | 'drukker_verwijderd'`.

- [ ] **Step 1: Add the Drukker type**

In `src/components/beheer/materiaalTypes.ts`, append:

```ts
export interface Drukker {
  id: string;
  naam: string;
  adres: string;
  postcode: string;
  plaats: string;
  email: string;
  prijsafspraken: string;
}
```

- [ ] **Step 2: Add the 3 new ActiviteitType values**

In `src/lib/logActiviteit.ts`, add to the `ActiviteitType` union (after `'bestelling_regel_gewijzigd';` — change that line's trailing `;` to `|` and append):

```ts
  | 'bestelling_regel_gewijzigd'
  | 'drukker_toegevoegd'
  | 'drukker_gewijzigd'
  | 'drukker_verwijderd';
```

In `src/components/beheer/ActiviteitSection.tsx`, add to `TYPE_LABEL_KEYS` (the `Record<ActiviteitType, string>` — TypeScript will error if these are missing):

```ts
  drukker_toegevoegd: 'activiteitTypeDrukkerToegevoegd',
  drukker_gewijzigd: 'activiteitTypeDrukkerGewijzigd',
  drukker_verwijderd: 'activiteitTypeDrukkerVerwijderd',
```

- [ ] **Step 3: Write the failing DrukkersSection test**

Create `tests/components/beheer/DrukkersSection.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { DrukkersSection } from '@/components/beheer/DrukkersSection';
import type { Drukker } from '@/components/beheer/materiaalTypes';
import messages from '../../../messages/nl.json';

const logActiviteitMock = vi.fn();
const getDocsMock = vi.fn();

vi.mock('@/lib/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...segments: string[]) => ({ name: segments.join('/') })),
  query: vi.fn((collectionRef) => collectionRef),
  orderBy: vi.fn(),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
}));

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

const DRUKKERS: Drukker[] = [
  {
    id: 'drukker-1',
    naam: 'Drukkerij Janssen',
    adres: 'Perslaan 1',
    postcode: '1000 AA',
    plaats: 'Utrecht',
    email: 'info@janssen.nl',
    prijsafspraken: '10% korting boven 50 stuks.',
  },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof DrukkersSection>> = {}) {
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <DrukkersSection
        drukkers={DRUKKERS}
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
  getDocsMock.mockReset();
  getDocsMock.mockResolvedValue({ docs: [] });
});

describe('DrukkersSection', () => {
  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('drukkers-error')).toHaveTextContent('Kon niet laden.');
    expect(screen.queryByTestId('data-table')).not.toBeInTheDocument();
  });

  it('renders nothing while drukkers is null and there is no error', () => {
    renderSection({ drukkers: null });
    expect(screen.queryByTestId('drukkers-section')).not.toBeInTheDocument();
  });

  it('lists the drukkers in the table', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-drukker-1')).toHaveTextContent('Drukkerij Janssen');
    expect(screen.getByTestId('data-table-row-drukker-1')).toHaveTextContent('Utrecht');
  });

  it('adds a new drukker, closes the modal, and logs drukker_toegevoegd', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('drukkers-add'));
    fireEvent.change(screen.getByTestId('drukker-modal-naam'), { target: { value: 'Nieuwe Drukker' } });
    fireEvent.change(screen.getByTestId('drukker-modal-adres'), { target: { value: 'Straat 1' } });
    fireEvent.change(screen.getByTestId('drukker-modal-postcode'), { target: { value: '1111 AA' } });
    fireEvent.change(screen.getByTestId('drukker-modal-plaats'), { target: { value: 'Stad' } });
    fireEvent.change(screen.getByTestId('drukker-modal-email'), { target: { value: 'info@nieuw.nl' } });
    fireEvent.change(screen.getByTestId('drukker-modal-prijsafspraken'), { target: { value: 'Geen korting.' } });
    fireEvent.click(screen.getByTestId('drukker-modal-opslaan'));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({
        naam: 'Nieuwe Drukker',
        adres: 'Straat 1',
        postcode: '1111 AA',
        plaats: 'Stad',
        email: 'info@nieuw.nl',
        prijsafspraken: 'Geen korting.',
      })
    );
    await waitFor(() => expect(screen.queryByTestId('drukker-modal')).not.toBeInTheDocument());
    expect(logActiviteitMock).toHaveBeenCalledWith('drukker_toegevoegd', {
      id: 'staff-1',
      email: 'paul@glassartanddesign.com',
      naam: 'paul@glassartanddesign.com',
    });
  });

  it('disables Opslaan until naam and email are filled in', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('drukkers-add'));
    expect(screen.getByTestId('drukker-modal-opslaan')).toBeDisabled();
    fireEvent.change(screen.getByTestId('drukker-modal-naam'), { target: { value: 'X' } });
    expect(screen.getByTestId('drukker-modal-opslaan')).toBeDisabled();
    fireEvent.change(screen.getByTestId('drukker-modal-email'), { target: { value: 'x@y.nl' } });
    expect(screen.getByTestId('drukker-modal-opslaan')).not.toBeDisabled();
  });

  it('opens a row for editing pre-filled, updates it, and logs drukker_gewijzigd', async () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-drukker-1'));
    expect(screen.getByTestId('drukker-modal-naam')).toHaveValue('Drukkerij Janssen');
    fireEvent.change(screen.getByTestId('drukker-modal-plaats'), { target: { value: 'Amersfoort' } });
    fireEvent.click(screen.getByTestId('drukker-modal-opslaan'));
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('drukker-1', {
        naam: 'Drukkerij Janssen',
        adres: 'Perslaan 1',
        postcode: '1000 AA',
        plaats: 'Amersfoort',
        email: 'info@janssen.nl',
        prijsafspraken: '10% korting boven 50 stuks.',
      })
    );
    expect(logActiviteitMock).toHaveBeenCalledWith('drukker_gewijzigd', {
      id: 'staff-1',
      email: 'paul@glassartanddesign.com',
      naam: 'paul@glassartanddesign.com',
    });
  });

  it('deletes a drukker with no zendingen and logs drukker_verwijderd', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-drukker-1'));
    await screen.findByTestId('drukker-modal-verwijderen');
    fireEvent.click(screen.getByTestId('drukker-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('drukker-1'));
    expect(logActiviteitMock).toHaveBeenCalledWith('drukker_verwijderd', {
      id: 'staff-1',
      email: 'paul@glassartanddesign.com',
      naam: 'paul@glassartanddesign.com',
    });
  });

  it('shows an action error and does not log when adding fails', async () => {
    const onAdd = vi.fn().mockResolvedValue(false);
    renderSection({ onAdd });
    fireEvent.click(screen.getByTestId('drukkers-add'));
    fireEvent.change(screen.getByTestId('drukker-modal-naam'), { target: { value: 'X' } });
    fireEvent.change(screen.getByTestId('drukker-modal-email'), { target: { value: 'x@y.nl' } });
    fireEvent.click(screen.getByTestId('drukker-modal-opslaan'));
    expect(await screen.findByTestId('drukker-modal-error')).toHaveTextContent(
      'Er is iets misgegaan. Probeer het opnieuw.'
    );
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run tests/components/beheer/DrukkersSection.test.tsx`
Expected: FAIL — `DrukkersSection`/`DrukkerModal` don't exist yet.

- [ ] **Step 5: Implement DrukkersSection.tsx**

Create `src/components/beheer/DrukkersSection.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { DrukkerModal } from './DrukkerModal';
import type { Drukker } from './materiaalTypes';

interface DrukkersSectionProps {
  drukkers: Drukker[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Drukker, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Drukker, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

type ModalState = { mode: 'add' } | { mode: 'edit'; drukker: Drukker } | null;

export function DrukkersSection({ drukkers, loadError, onAdd, onUpdate, onRemove }: DrukkersSectionProps) {
  const t = useTranslations('beheer');
  const [modalState, setModalState] = useState<ModalState>(null);

  if (loadError) {
    return (
      <p data-testid="drukkers-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (drukkers === null) {
    return null;
  }

  const columns: Column<Drukker>[] = [
    { key: 'naam', label: t('drukkersColNaam') },
    { key: 'plaats', label: t('drukkersColPlaats') },
    { key: 'email', label: t('drukkersColEmail') },
  ];

  return (
    <div data-testid="drukkers-section">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => setModalState({ mode: 'add' })}
          data-testid="drukkers-add"
          className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
        >
          {t('drukkersToevoegen')}
        </button>
      </div>
      <DataTable<Drukker>
        columns={columns}
        rows={drukkers}
        getRowId={(row) => row.id}
        onRowClick={(drukker) => setModalState({ mode: 'edit', drukker })}
        emptyLabel={t('drukkersEmpty')}
        searchPlaceholder={t('dataTableSearchPlaceholder')}
      />
      <DrukkerModal
        state={modalState}
        onClose={() => setModalState(null)}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />
    </div>
  );
}
```

- [ ] **Step 6: Implement DrukkerModal.tsx (CRUD only, no zendingen yet)**

Create `src/components/beheer/DrukkerModal.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Drukker } from './materiaalTypes';

type ModalState = { mode: 'add' } | { mode: 'edit'; drukker: Drukker } | null;

interface DrukkerModalProps {
  state: ModalState;
  onClose: () => void;
  onAdd: (data: Omit<Drukker, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Drukker, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

interface FormFields {
  naam: string;
  adres: string;
  postcode: string;
  plaats: string;
  email: string;
  prijsafspraken: string;
}

const EMPTY_FIELDS: FormFields = { naam: '', adres: '', postcode: '', plaats: '', email: '', prijsafspraken: '' };

export function DrukkerModal({ state, onClose, onAdd, onUpdate, onRemove }: DrukkerModalProps) {
  const t = useTranslations('beheer');
  const { user } = useAdminAuth();
  const [fields, setFields] = useState<FormFields>(EMPTY_FIELDS);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (state?.mode === 'edit') {
      const { naam, adres, postcode, plaats, email, prijsafspraken } = state.drukker;
      setFields({ naam, adres, postcode, plaats, email, prijsafspraken });
    } else if (state?.mode === 'add') {
      setFields(EMPTY_FIELDS);
    }
    setActionError(null);
  }, [state]);

  function setField<K extends keyof FormFields>(key: K, value: FormFields[K]) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    if (!state) return;
    const success = state.mode === 'add' ? await onAdd(fields) : await onUpdate(state.drukker.id, fields);
    if (success) {
      void logActiviteit(state.mode === 'add' ? 'drukker_toegevoegd' : 'drukker_gewijzigd', actorFromMedewerker(user));
      onClose();
    } else {
      setActionError(t('drukkersActionError'));
    }
  }

  async function handleRemove() {
    if (state?.mode !== 'edit') return;
    const success = await onRemove(state.drukker.id);
    if (success) {
      void logActiviteit('drukker_verwijderd', actorFromMedewerker(user));
      onClose();
    } else {
      setActionError(t('drukkersActionError'));
    }
  }

  return (
    <Modal isOpen={state !== null} onClose={onClose} closeLabel={t('modalClose')} title={t('drukkersModalTitel')}>
      <div data-testid="drukker-modal" className="flex flex-col gap-2 text-sm text-white/80">
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
          {t('drukkersLabelNaam')}
          <input
            type="text"
            value={fields.naam}
            onChange={(event) => setField('naam', event.target.value)}
            data-testid="drukker-modal-naam"
            className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
          {t('drukkersLabelAdres')}
          <input
            type="text"
            value={fields.adres}
            onChange={(event) => setField('adres', event.target.value)}
            data-testid="drukker-modal-adres"
            className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('drukkersLabelPostcode')}
            <input
              type="text"
              value={fields.postcode}
              onChange={(event) => setField('postcode', event.target.value)}
              data-testid="drukker-modal-postcode"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('drukkersLabelPlaats')}
            <input
              type="text"
              value={fields.plaats}
              onChange={(event) => setField('plaats', event.target.value)}
              data-testid="drukker-modal-plaats"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
          {t('drukkersLabelEmail')}
          <input
            type="email"
            value={fields.email}
            onChange={(event) => setField('email', event.target.value)}
            data-testid="drukker-modal-email"
            className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
          {t('drukkersLabelPrijsafspraken')}
          <textarea
            value={fields.prijsafspraken}
            onChange={(event) => setField('prijsafspraken', event.target.value)}
            data-testid="drukker-modal-prijsafspraken"
            rows={4}
            className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
          />
        </label>

        {actionError && (
          <p data-testid="drukker-modal-error" className="text-xs text-red-400">
            {actionError}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={!fields.naam || !fields.email}
            data-testid="drukker-modal-opslaan"
            className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
          >
            {t('drukkersOpslaan')}
          </button>
          {state?.mode === 'edit' && (
            <button
              type="button"
              onClick={handleRemove}
              data-testid="drukker-modal-verwijderen"
              className="rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
            >
              {t('drukkersVerwijderen')}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 7: Wire BeheerNav**

In `src/components/beheer/BeheerNav.tsx`: add `'drukkers'` to the `BeheerSection` union (after `'prijsgroepen'`), add `drukkersCount: number;` to `BeheerNavProps`, add `{ id: 'drukkers', labelKey: 'navDrukkers' }` to `ACTIVE_ITEMS` (after the `prijsgroepen` entry), add `drukkersCount` to the destructured props, and add `drukkers: drukkersCount,` to the `counts` object.

Update `tests/components/beheer/BeheerNav.test.tsx`: add `drukkersCount={0}` (or an appropriate value per existing test's other counts) to every `render(<BeheerNav ... />)` call in that file, and add one assertion that `beheer-nav-drukkers` renders with label "Drukkers" and the passed count — mirror the existing test that checks `beheer-nav-prijsgroepen`.

- [ ] **Step 8: Wire BeheerShell**

In `src/components/beheer/BeheerShell.tsx`:
- Import `DrukkersSection` and `Drukker`.
- Add `const drukkers = useFirestoreCollection<Drukker>('drukkers');` next to the `prijsgroepen` line.
- Add `const drukkersCount = (drukkers.items ?? []).length;`.
- Pass `drukkersCount={drukkersCount}` to `<BeheerNav>`.
- Add a new branch in the section-switch JSX, after the `prijsgroepen` branch:

```tsx
        ) : activeSection === 'drukkers' ? (
          <DrukkersSection
            drukkers={drukkers.items}
            loadError={drukkers.error === 'load' ? t('drukkersLoadError') : null}
            onAdd={drukkers.add}
            onUpdate={drukkers.update}
            onRemove={drukkers.remove}
          />
```

- [ ] **Step 9: Firestore rules**

In `firestore.rules`, add after the `prijsgroepen` block:

```
    match /drukkers/{id} {
      allow read: if request.auth != null && exists(/databases/$(database)/documents/medewerkers/$(request.auth.uid));
      allow write: if request.auth != null && exists(/databases/$(database)/documents/medewerkers/$(request.auth.uid));
    }
```

(Read is medewerker-only, not public, unlike catalog collections — drukker contact/pricing data is internal.)

Add the 3 new types to the `activiteitenlog` rule's `type in [...]` list (after `'bestelling_regel_gewijzigd'`):

```
           'bestelling_regel_gewijzigd','drukker_toegevoegd','drukker_gewijzigd','drukker_verwijderd',
```

- [ ] **Step 10: Update BeheerShell.test.tsx**

Add `drukkers: []` to `DEFAULT_COLLECTIONS`.

- [ ] **Step 11: Add translations**

In `messages/nl.json`, add `"navDrukkers": "Drukkers",` next to `"navPrijsgroepen": "Prijsgroepen",`; add the 3 activiteit labels next to the other `activiteitType*` keys:

```json
    "activiteitTypeDrukkerToegevoegd": "Drukker toegevoegd",
    "activiteitTypeDrukkerGewijzigd": "Drukker gewijzigd",
    "activiteitTypeDrukkerVerwijderd": "Drukker verwijderd",
```

and add a new block near the end of the `beheer` namespace (after the `prijsgroepen*` keys):

```json
    "drukkersLoadError": "Kon de drukkers niet laden. Probeer de pagina te verversen.",
    "drukkersActionError": "Er is iets misgegaan. Probeer het opnieuw.",
    "drukkersEmpty": "Geen drukkers gevonden.",
    "drukkersColNaam": "Naam",
    "drukkersColPlaats": "Plaats",
    "drukkersColEmail": "E-mailadres",
    "drukkersLabelNaam": "Naam",
    "drukkersLabelAdres": "Adres",
    "drukkersLabelPostcode": "Postcode",
    "drukkersLabelPlaats": "Plaats",
    "drukkersLabelEmail": "E-mailadres",
    "drukkersLabelPrijsafspraken": "Prijsafspraken",
    "drukkersToevoegen": "Drukker toevoegen",
    "drukkersOpslaan": "Opslaan",
    "drukkersVerwijderen": "Verwijderen",
    "drukkersModalTitel": "Drukkergegevens",
```

- [ ] **Step 12: Run the tests**

Run: `npx vitest run tests/components/beheer/DrukkersSection.test.tsx tests/components/beheer/BeheerNav.test.tsx tests/components/beheer/BeheerShell.test.tsx`
Expected: PASS.

- [ ] **Step 13: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 14: Commit**

```bash
git add src/components/beheer/materiaalTypes.ts src/components/beheer/DrukkersSection.tsx src/components/beheer/DrukkerModal.tsx src/components/beheer/BeheerNav.tsx src/components/beheer/BeheerShell.tsx src/lib/logActiviteit.ts src/components/beheer/ActiviteitSection.tsx firestore.rules messages/nl.json tests/components/beheer/DrukkersSection.test.tsx tests/components/beheer/BeheerNav.test.tsx tests/components/beheer/BeheerShell.test.tsx
git commit -m "feat: nieuwe Drukkers beheer-sectie (CRUD)"
```

- [ ] **Step 15: Deploy Firestore rules**

Run: `npx --yes firebase-tools deploy --only firestore:rules` (per [[feedback_firebase_deploy_rules_directly]] — this machine is already authenticated, deploy directly rather than asking the user to paste into the console).

---

### Task 6: Drukker zendingen — e-mail archief per drukker

**Files:**
- Create: `src/lib/useDrukkerZendingen.ts`
- Modify: `src/components/beheer/DrukkerModal.tsx`
- Modify: `firestore.rules`
- Modify: `messages/nl.json`
- Test: `tests/lib/useDrukkerZendingen.test.ts`
- Test: `tests/components/beheer/DrukkerModal.test.tsx` (new file)
- Test: `tests/components/beheer/DrukkersSection.test.tsx` (one existing test updated for the new `disabled` behavior)

**Interfaces:**
- Produces: `export interface DrukkerZending { id: string; verzondenOp: Date | null; onderwerp: string; body: string; bestellingIds: string[]; aantalKlanten: number; aantalRegels: number; verzondDoor: string; }` and `export function useDrukkerZendingen(drukkerId: string | null): { zendingen: DrukkerZending[] | null; error: boolean }` in `src/lib/useDrukkerZendingen.ts`.

- [ ] **Step 1: Write the failing hook test**

Create `tests/lib/useDrukkerZendingen.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDrukkerZendingen } from '@/lib/useDrukkerZendingen';

const getDocsMock = vi.fn();

vi.mock('@/lib/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...segments: string[]) => ({ name: segments.join('/') })),
  query: vi.fn((collectionRef) => collectionRef),
  orderBy: vi.fn(),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
}));

beforeEach(() => {
  getDocsMock.mockReset();
});

describe('useDrukkerZendingen', () => {
  it('returns null zendingen and does not fetch while drukkerId is null', () => {
    const { result } = renderHook(() => useDrukkerZendingen(null));
    expect(result.current.zendingen).toBeNull();
    expect(getDocsMock).not.toHaveBeenCalled();
  });

  it('fetches and maps zendingen for the given drukkerId', async () => {
    const timestamp = { toDate: () => new Date('2026-07-24T10:00:00Z') };
    getDocsMock.mockResolvedValue({
      docs: [
        {
          id: 'zending-1',
          data: () => ({
            verzondenOp: timestamp,
            onderwerp: 'Nieuwe order(s) voor de drukker – 24-7-2026',
            body: '== Testbedrijf BV ==\n...',
            bestellingIds: ['header-1'],
            aantalKlanten: 1,
            aantalRegels: 2,
            verzondDoor: 'paul@glassartanddesign.com',
          }),
        },
      ],
    });
    const { result } = renderHook(() => useDrukkerZendingen('drukker-1'));
    await waitFor(() => expect(result.current.zendingen).not.toBeNull());
    expect(result.current.zendingen).toEqual([
      {
        id: 'zending-1',
        verzondenOp: new Date('2026-07-24T10:00:00Z'),
        onderwerp: 'Nieuwe order(s) voor de drukker – 24-7-2026',
        body: '== Testbedrijf BV ==\n...',
        bestellingIds: ['header-1'],
        aantalKlanten: 1,
        aantalRegels: 2,
        verzondDoor: 'paul@glassartanddesign.com',
      },
    ]);
    expect(result.current.error).toBe(false);
  });

  it('sets error true when getDocs fails', async () => {
    getDocsMock.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useDrukkerZendingen('drukker-1'));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.zendingen).toBeNull();
  });

  it('refetches when drukkerId changes', async () => {
    getDocsMock.mockResolvedValue({ docs: [] });
    const { rerender } = renderHook(({ id }) => useDrukkerZendingen(id), { initialProps: { id: 'drukker-1' } });
    await waitFor(() => expect(getDocsMock).toHaveBeenCalledTimes(1));
    rerender({ id: 'drukker-2' });
    await waitFor(() => expect(getDocsMock).toHaveBeenCalledTimes(2));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/useDrukkerZendingen.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the hook**

Create `src/lib/useDrukkerZendingen.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from './firebase';

export interface DrukkerZending {
  id: string;
  verzondenOp: Date | null;
  onderwerp: string;
  body: string;
  bestellingIds: string[];
  aantalKlanten: number;
  aantalRegels: number;
  verzondDoor: string;
}

export function useDrukkerZendingen(drukkerId: string | null): { zendingen: DrukkerZending[] | null; error: boolean } {
  const [zendingen, setZendingen] = useState<DrukkerZending[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!drukkerId) {
      setZendingen(null);
      setError(false);
      return;
    }
    let cancelled = false;
    setZendingen(null);
    setError(false);
    async function load() {
      try {
        const snapshot = await getDocs(
          query(collection(db, 'drukkers', drukkerId as string, 'zendingen'), orderBy('verzondenOp', 'desc'))
        );
        if (cancelled) return;
        setZendingen(
          snapshot.docs.map((docSnapshot) => {
            const data = docSnapshot.data();
            return {
              id: docSnapshot.id,
              verzondenOp: data.verzondenOp?.toDate() ?? null,
              onderwerp: data.onderwerp,
              body: data.body,
              bestellingIds: data.bestellingIds ?? [],
              aantalKlanten: data.aantalKlanten,
              aantalRegels: data.aantalRegels,
              verzondDoor: data.verzondDoor,
            };
          })
        );
      } catch {
        if (!cancelled) {
          setError(true);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [drukkerId]);

  return { zendingen, error };
}
```

- [ ] **Step 4: Write the failing DrukkerModal zendingen test**

Create `tests/components/beheer/DrukkerModal.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { DrukkerModal } from '@/components/beheer/DrukkerModal';
import type { Drukker } from '@/components/beheer/materiaalTypes';
import messages from '../../../messages/nl.json';

const getDocsMock = vi.fn();

vi.mock('@/lib/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...segments: string[]) => ({ name: segments.join('/') })),
  query: vi.fn((collectionRef) => collectionRef),
  orderBy: vi.fn(),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
}));

vi.mock('@/lib/useAdminAuth', () => ({
  useAdminAuth: () => ({ user: { uid: 'staff-1', email: 'paul@glassartanddesign.com' } }),
}));

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: vi.fn(),
  actorFromMedewerker: () => ({ id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' }),
}));

const DRUKKER: Drukker = {
  id: 'drukker-1',
  naam: 'Drukkerij Janssen',
  adres: 'Perslaan 1',
  postcode: '1000 AA',
  plaats: 'Utrecht',
  email: 'info@janssen.nl',
  prijsafspraken: '',
};

function renderModal(state: { mode: 'edit'; drukker: Drukker } | { mode: 'add' } | null) {
  const onClose = vi.fn();
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <DrukkerModal state={state} onClose={onClose} onAdd={onAdd} onUpdate={onUpdate} onRemove={onRemove} />
    </NextIntlClientProvider>
  );
  return { onClose, onAdd, onUpdate, onRemove };
}

beforeEach(() => {
  getDocsMock.mockReset();
});

describe('DrukkerModal zendingen', () => {
  it('shows "nog geen mails verzonden" once loaded empty', async () => {
    getDocsMock.mockResolvedValue({ docs: [] });
    renderModal({ mode: 'edit', drukker: DRUKKER });
    expect(await screen.findByTestId('drukker-modal-zendingen-leeg')).toHaveTextContent(
      'Nog geen mails verzonden.'
    );
  });

  it('lists zendingen and expands one to show the full mail body', async () => {
    getDocsMock.mockResolvedValue({
      docs: [
        {
          id: 'zending-1',
          data: () => ({
            verzondenOp: { toDate: () => new Date('2026-07-24T10:00:00Z') },
            onderwerp: 'Nieuwe order(s) voor de drukker – 24-7-2026',
            body: '== Testbedrijf BV ==\nAfleveradres: Teststraat 1, 1234 AB Teststad\n- Hotel paneel',
            bestellingIds: ['header-1'],
            aantalKlanten: 1,
            aantalRegels: 1,
            verzondDoor: 'paul@glassartanddesign.com',
          }),
        },
      ],
    });
    renderModal({ mode: 'edit', drukker: DRUKKER });
    const zendingRow = await screen.findByTestId('drukker-zending-zending-1');
    expect(zendingRow).toHaveTextContent('1');
    expect(screen.queryByText(/Testbedrijf BV/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('drukker-zending-bekijken-zending-1'));
    expect(screen.getByText(/Testbedrijf BV/)).toBeInTheDocument();
  });

  it('disables Verwijderen while zendingen are still loading', () => {
    getDocsMock.mockReturnValue(new Promise(() => {}));
    renderModal({ mode: 'edit', drukker: DRUKKER });
    expect(screen.getByTestId('drukker-modal-verwijderen')).toBeDisabled();
  });

  it('blocks deleting a drukker that has zendingen', async () => {
    const onRemove = vi.fn();
    getDocsMock.mockResolvedValue({
      docs: [
        {
          id: 'zending-1',
          data: () => ({
            verzondenOp: null,
            onderwerp: 'x',
            body: 'x',
            bestellingIds: [],
            aantalKlanten: 1,
            aantalRegels: 1,
            verzondDoor: 'x',
          }),
        },
      ],
    });
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <DrukkerModal
          state={{ mode: 'edit', drukker: DRUKKER }}
          onClose={vi.fn()}
          onAdd={vi.fn()}
          onUpdate={vi.fn().mockResolvedValue(true)}
          onRemove={onRemove}
        />
      </NextIntlClientProvider>
    );
    await waitFor(() => expect(screen.getByTestId('drukker-modal-verwijderen')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('drukker-modal-verwijderen'));
    expect(await screen.findByTestId('drukker-modal-error')).toHaveTextContent(
      'Deze drukker heeft al verzonden mails en kan niet verwijderd worden.'
    );
    expect(onRemove).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/DrukkerModal.test.tsx`
Expected: FAIL — no zendingen list/guard yet.

- [ ] **Step 6: Extend DrukkerModal with the zendingen list and delete-guard**

In `src/components/beheer/DrukkerModal.tsx`:
- Import `useState` (already imported) plus `useDrukkerZendingen` from `@/lib/useDrukkerZendingen`.
- Add `const [expandedZendingId, setExpandedZendingId] = useState<string | null>(null);`.
- Add `const drukkerId = state?.mode === 'edit' ? state.drukker.id : null; const { zendingen } = useDrukkerZendingen(drukkerId);`.
- Reset `expandedZendingId` to `null` in the existing `useEffect` that resets `fields`/`actionError` on `state` change.
- Change `handleRemove` to check the guard first:

```ts
  async function handleRemove() {
    if (state?.mode !== 'edit') return;
    if ((zendingen?.length ?? 0) > 0) {
      setActionError(t('drukkersVerwijderBlocked'));
      return;
    }
    const success = await onRemove(state.drukker.id);
    if (success) {
      void logActiviteit('drukker_verwijderd', actorFromMedewerker(user));
      onClose();
    } else {
      setActionError(t('drukkersActionError'));
    }
  }
```

- Change the Verwijderen button to `disabled={zendingen === null}`.
- Add a "Verzonden mails" block after the closing `</div>` of the form fields (before the final closing `</div>` of `drukker-modal`):

```tsx
        <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
          <span className="text-xs uppercase tracking-wide text-white/60">{t('drukkersZendingenTitel')}</span>
          {zendingen === null ? null : zendingen.length === 0 ? (
            <p data-testid="drukker-modal-zendingen-leeg" className="text-white/50">
              {t('drukkersZendingenLeeg')}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {zendingen.map((zending) => (
                <li key={zending.id} data-testid={`drukker-zending-${zending.id}`} className="rounded-sm bg-black/30 p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      {zending.verzondenOp ? zending.verzondenOp.toLocaleString('nl-NL') : ''} —{' '}
                      {t('drukkersZendingenSamenvatting', {
                        klanten: zending.aantalKlanten,
                        regels: zending.aantalRegels,
                      })}
                    </span>
                    <button
                      type="button"
                      data-testid={`drukker-zending-bekijken-${zending.id}`}
                      onClick={() =>
                        setExpandedZendingId((current) => (current === zending.id ? null : zending.id))
                      }
                      className="shrink-0 text-white/50 underline underline-offset-2 hover:text-white"
                    >
                      {expandedZendingId === zending.id
                        ? t('drukkersZendingenVerbergen')
                        : t('drukkersZendingenBekijken')}
                    </button>
                  </div>
                  {expandedZendingId === zending.id && (
                    <pre className="mt-2 whitespace-pre-wrap text-white/70">{zending.body}</pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
```

- [ ] **Step 7: Fix the now-affected DrukkersSection test**

`DrukkerModal`'s Verwijderen button is now `disabled` until `zendingen` finishes loading (Step 6), which affects the Task 5 test `it('deletes a drukker with no zendingen and logs drukker_verwijderd', ...)` in `tests/components/beheer/DrukkersSection.test.tsx` — a `fireEvent.click` on a disabled button never fires the handler. Update that test to wait for the button to become enabled first:

```tsx
  it('deletes a drukker with no zendingen and logs drukker_verwijderd', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-drukker-1'));
    await waitFor(() => expect(screen.getByTestId('drukker-modal-verwijderen')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('drukker-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('drukker-1'));
    expect(logActiviteitMock).toHaveBeenCalledWith('drukker_verwijderd', {
      id: 'staff-1',
      email: 'paul@glassartanddesign.com',
      naam: 'paul@glassartanddesign.com',
    });
  });
```

- [ ] **Step 8: Add translations**

In `messages/nl.json`, add to the drukkers block created in Task 5:

```json
    "drukkersVerwijderBlocked": "Deze drukker heeft al verzonden mails en kan niet verwijderd worden.",
    "drukkersZendingenTitel": "Verzonden mails",
    "drukkersZendingenLeeg": "Nog geen mails verzonden.",
    "drukkersZendingenBekijken": "Bekijken",
    "drukkersZendingenVerbergen": "Verbergen",
    "drukkersZendingenSamenvatting": "{klanten} klanten, {regels} regels",
```

- [ ] **Step 9: Firestore rule for the subcollection**

In `firestore.rules`, inside the `match /drukkers/{id} { ... }` block, add a nested match before its closing brace:

```
      match /zendingen/{zendingId} {
        allow read: if request.auth != null && exists(/databases/$(database)/documents/medewerkers/$(request.auth.uid));
        allow create: if request.auth != null && exists(/databases/$(database)/documents/medewerkers/$(request.auth.uid));
        allow update, delete: if false;
      }
```

- [ ] **Step 10: Run the tests**

Run: `npx vitest run tests/lib/useDrukkerZendingen.test.ts tests/components/beheer/DrukkerModal.test.tsx tests/components/beheer/DrukkersSection.test.tsx`
Expected: PASS.

- [ ] **Step 11: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 12: Commit**

```bash
git add src/lib/useDrukkerZendingen.ts src/components/beheer/DrukkerModal.tsx firestore.rules messages/nl.json tests/lib/useDrukkerZendingen.test.ts tests/components/beheer/DrukkerModal.test.tsx tests/components/beheer/DrukkersSection.test.tsx
git commit -m "feat: bewaar en toon verzonden drukker-mails per drukker"
```

- [ ] **Step 13: Deploy Firestore rules**

Run: `npx --yes firebase-tools deploy --only firestore:rules`

---

### Task 7: buildDrukkerMail — pure e-mail composition function

**Files:**
- Create: `src/lib/buildDrukkerMail.ts`
- Test: `tests/lib/buildDrukkerMail.test.ts`

**Interfaces:**
- Consumes: `Bestelling`/`BestellingLine` from `@/components/beheer/BestellingenSection`, `Klant` from `@/components/beheer/KlantenSection`, `Kunstwerk`/`Materiaal`/`Maat`/`Materiaalsoort` from `@/components/beheer/materiaalTypes`.
- Produces: `export interface DrukkerMailInput { bestellingen: Bestelling[]; klanten: Klant[]; kunstwerken: Kunstwerk[]; materialen: Materiaal[]; maten: Maat[]; materiaalsoorten: Materiaalsoort[]; }`, `export interface DrukkerMail { subject: string; body: string; }`, `export function buildDrukkerMail(input: DrukkerMailInput): DrukkerMail`.

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/buildDrukkerMail.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildDrukkerMail } from '@/lib/buildDrukkerMail';
import type { Bestelling } from '@/components/beheer/BestellingenSection';
import type { Klant } from '@/components/beheer/KlantenSection';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort } from '@/components/beheer/materiaalTypes';

function klant(overrides: Partial<Klant> = {}): Klant {
  return {
    id: 'uid-1',
    companyName: 'Testbedrijf BV',
    kvk: '12345678',
    contactPerson: 'Jan Jansen',
    email: 'jan@example.com',
    phone: '0612345678',
    contactPreference: 'email',
    address: 'Teststraat 1',
    postcode: '1234 AB',
    city: 'Teststad',
    deliveryAddress: '',
    deliveryPostcode: '',
    deliveryCity: '',
    invoiceAddress: '',
    invoicePostcode: '',
    invoiceCity: '',
    status: 'Goedgekeurd',
    prijsgroepId: 'pg-1',
    ...overrides,
  };
}

const KUNSTWERKEN: Kunstwerk[] = [
  {
    id: 'kw-1',
    foto: '',
    naam: 'Hotel paneel',
    artiest: '',
    segmentIds: [],
    materiaalIds: ['mat-1'],
    maatIds: ['maat-1'],
    prijzen: [],
    omschrijvingNl: 'Hotel paneel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
];
const MATERIALEN: Materiaal[] = [{ id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 6, omschrijving: 'Helder' }];
const MATEN: Maat[] = [{ id: 'maat-1', breedte: 40, hoogte: 60 }];
const MATERIAALSOORTEN: Materiaalsoort[] = [{ id: 'soort-1', omschrijving: 'Glas' }];

function bestelling(overrides: Partial<Bestelling> = {}): Bestelling {
  return {
    id: 'header-1',
    klantId: 'uid-1',
    companyName: 'Testbedrijf BV',
    besteldatum: '1-7-2026',
    status: 'Te versturen naar drukker',
    lineCount: 1,
    totalQuantity: 2,
    lines: [{ id: 'line-1', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
    ...overrides,
  };
}

describe('buildDrukkerMail', () => {
  it('includes the bedrijfsnaam, standaardadres, and regel details for a single klant', () => {
    const mail = buildDrukkerMail({
      bestellingen: [bestelling()],
      klanten: [klant()],
      kunstwerken: KUNSTWERKEN,
      materialen: MATERIALEN,
      maten: MATEN,
      materiaalsoorten: MATERIAALSOORTEN,
    });
    expect(mail.body).toContain('== Testbedrijf BV ==');
    expect(mail.body).toContain('Afleveradres: Teststraat 1, 1234 AB Teststad');
    expect(mail.body).toContain('Hotel paneel — 6mm Glas — Helder, maat 40×60 cm, aantal 2');
  });

  it('uses the delivery address instead of the standaardadres when it is set', () => {
    const mail = buildDrukkerMail({
      bestellingen: [bestelling()],
      klanten: [klant({ deliveryAddress: 'Havenweg 5', deliveryPostcode: '5678 CD', deliveryCity: 'Havenstad' })],
      kunstwerken: KUNSTWERKEN,
      materialen: MATERIALEN,
      maten: MATEN,
      materiaalsoorten: MATERIAALSOORTEN,
    });
    expect(mail.body).toContain('Afleveradres: Havenweg 5, 5678 CD Havenstad');
    expect(mail.body).not.toContain('Teststraat 1');
  });

  it('groups multiple bestellingen from the same klant into a single section', () => {
    const mail = buildDrukkerMail({
      bestellingen: [
        bestelling({ id: 'header-1' }),
        bestelling({
          id: 'header-2',
          lines: [{ id: 'line-2', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
        }),
      ],
      klanten: [klant()],
      kunstwerken: KUNSTWERKEN,
      materialen: MATERIALEN,
      maten: MATEN,
      materiaalsoorten: MATERIAALSOORTEN,
    });
    expect(mail.body.match(/== Testbedrijf BV ==/g)).toHaveLength(1);
    expect(mail.body).toContain('aantal 2');
    expect(mail.body).toContain('aantal 1');
  });

  it('creates a section per klant when bestellingen come from different klanten', () => {
    const mail = buildDrukkerMail({
      bestellingen: [bestelling({ id: 'header-1' }), bestelling({ id: 'header-2', klantId: 'uid-2', companyName: 'Ander Bedrijf' })],
      klanten: [klant(), klant({ id: 'uid-2', companyName: 'Ander Bedrijf' })],
      kunstwerken: KUNSTWERKEN,
      materialen: MATERIALEN,
      maten: MATEN,
      materiaalsoorten: MATERIAALSOORTEN,
    });
    expect(mail.body).toContain('== Testbedrijf BV ==');
    expect(mail.body).toContain('== Ander Bedrijf ==');
  });

  it('describes a custom-size line using its breedte/hoogte instead of a maat lookup', () => {
    const mail = buildDrukkerMail({
      bestellingen: [
        bestelling({
          lines: [
            { id: 'line-3', kunstwerkId: 'kw-1', maatId: '', materiaalId: 'mat-1', breedte: 90, hoogte: 140, prijs: 275, quantity: 1 },
          ],
        }),
      ],
      klanten: [klant()],
      kunstwerken: KUNSTWERKEN,
      materialen: MATERIALEN,
      maten: MATEN,
      materiaalsoorten: MATERIAALSOORTEN,
    });
    expect(mail.body).toContain('maat 90×140 cm');
  });

  it('sets a subject mentioning the drukker order', () => {
    const mail = buildDrukkerMail({
      bestellingen: [bestelling()],
      klanten: [klant()],
      kunstwerken: KUNSTWERKEN,
      materialen: MATERIALEN,
      maten: MATEN,
      materiaalsoorten: MATERIAALSOORTEN,
    });
    expect(mail.subject).toContain('Nieuwe order(s) voor de drukker');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/buildDrukkerMail.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement buildDrukkerMail.ts**

Create `src/lib/buildDrukkerMail.ts`:

```ts
import type { Bestelling, BestellingLine } from '@/components/beheer/BestellingenSection';
import type { Klant } from '@/components/beheer/KlantenSection';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort } from '@/components/beheer/materiaalTypes';

export interface DrukkerMailInput {
  bestellingen: Bestelling[];
  klanten: Klant[];
  kunstwerken: Kunstwerk[];
  materialen: Materiaal[];
  maten: Maat[];
  materiaalsoorten: Materiaalsoort[];
}

export interface DrukkerMail {
  subject: string;
  body: string;
}

function formatAfleveradres(klant: Klant): string {
  const heeftAfleveradres = klant.deliveryAddress.trim() !== '';
  const adres = heeftAfleveradres ? klant.deliveryAddress : klant.address;
  const postcode = heeftAfleveradres ? klant.deliveryPostcode : klant.postcode;
  const plaats = heeftAfleveradres ? klant.deliveryCity : klant.city;
  return `${adres}, ${postcode} ${plaats}`;
}

function formatRegel(
  line: BestellingLine,
  kunstwerken: Kunstwerk[],
  materialen: Materiaal[],
  maten: Maat[],
  materiaalsoorten: Materiaalsoort[]
): string {
  const kunstwerk = kunstwerken.find((k) => k.id === line.kunstwerkId);
  const materiaal = materialen.find((m) => m.id === line.materiaalId);
  const materiaalsoort = materiaal ? materiaalsoorten.find((s) => s.id === materiaal.materiaalsoortId) : undefined;
  const maat = maten.find((m) => m.id === line.maatId);

  const naam = kunstwerk?.omschrijvingNl ?? 'Onbekend kunstwerk';
  const materiaalOmschrijving = materiaal
    ? `${materiaal.materiaaldikte}mm ${materiaalsoort?.omschrijving ?? materiaal.materiaalsoortId} — ${materiaal.omschrijving}`
    : 'Onbekend materiaal';
  const maatOmschrijving = maat
    ? `${maat.breedte}×${maat.hoogte} cm`
    : line.breedte != null && line.hoogte != null
      ? `${line.breedte}×${line.hoogte} cm`
      : 'Onbekende maat';

  return `${naam} — ${materiaalOmschrijving}, maat ${maatOmschrijving}, aantal ${line.quantity}`;
}

export function buildDrukkerMail({
  bestellingen,
  klanten,
  kunstwerken,
  materialen,
  maten,
  materiaalsoorten,
}: DrukkerMailInput): DrukkerMail {
  const datum = new Date().toLocaleDateString('nl-NL');
  const klantIds = Array.from(new Set(bestellingen.map((b) => b.klantId)));

  const secties = klantIds.map((klantId) => {
    const klant = klanten.find((k) => k.id === klantId);
    const klantBestellingen = bestellingen.filter((b) => b.klantId === klantId);
    const bedrijfsnaam = klant?.companyName ?? klantBestellingen[0].companyName;
    const afleveradres = klant ? formatAfleveradres(klant) : 'Onbekend afleveradres';
    const regels = klantBestellingen
      .flatMap((b) => b.lines)
      .map((line) => `- ${formatRegel(line, kunstwerken, materialen, maten, materiaalsoorten)}`)
      .join('\n');
    return `== ${bedrijfsnaam} ==\nAfleveradres: ${afleveradres}\n${regels}`;
  });

  return {
    subject: `Nieuwe order(s) voor de drukker – ${datum}`,
    body: secties.join('\n\n'),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/buildDrukkerMail.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/buildDrukkerMail.ts tests/lib/buildDrukkerMail.test.ts
git commit -m "feat: pure functie om de drukker-e-mail op te bouwen"
```

---

### Task 8: BestellingenSection — bulk-selectie op status 'Te versturen naar drukker'

**Files:**
- Modify: `src/components/beheer/BestellingenSection.tsx`
- Modify: `src/components/beheer/BeheerShell.tsx`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/BestellingenSection.test.tsx`

**Interfaces:**
- Produces: `BestellingenSection` gains `klanten: Klant[] | null` and `drukkers: Drukker[] | null` props (threaded through to `VersturenNaarDrukkerDialog` in Task 9 — for this task they're accepted but the dialog itself is stubbed as "not yet implemented", see Step 3 note) and a selection bar. This task focuses purely on the selection mechanics; Task 9 wires the actual dialog in.

- [ ] **Step 1: Write the failing tests**

Add to `tests/components/beheer/BestellingenSection.test.tsx` (new fixture and describe block):

```tsx
  describe('bulk selection', () => {
    it('shows a checkbox only for bestellingen with status "Te versturen naar drukker"', () => {
      const bestellingen = [
        { ...BESTELLINGEN[0], status: 'Te versturen naar drukker' as const },
        BESTELLINGEN[1],
      ];
      renderSection({ bestellingen });
      fireEvent.click(screen.getByTestId('data-table-quick-all'));
      expect(screen.getByTestId('data-table-row-select-header-1')).toBeInTheDocument();
      expect(screen.queryByTestId('data-table-row-select-header-2')).not.toBeInTheDocument();
    });

    it('shows the selection bar with a count once a bestelling is selected, and hides it when deselected', () => {
      const bestellingen = [{ ...BESTELLINGEN[0], status: 'Te versturen naar drukker' as const }];
      renderSection({ bestellingen });
      expect(screen.queryByTestId('bestellingen-selectie-balk')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('data-table-row-select-header-1'));
      expect(screen.getByTestId('bestellingen-selectie-balk')).toHaveTextContent('1 bestellingen geselecteerd (1 klanten)');
      fireEvent.click(screen.getByTestId('data-table-row-select-header-1'));
      expect(screen.queryByTestId('bestellingen-selectie-balk')).not.toBeInTheDocument();
    });

    it('counts distinct klanten in the selection bar', () => {
      const bestellingen = [
        { ...BESTELLINGEN[0], status: 'Te versturen naar drukker' as const },
        { ...BESTELLINGEN[1], id: 'header-3', status: 'Te versturen naar drukker' as const },
      ];
      renderSection({ bestellingen });
      fireEvent.click(screen.getByTestId('data-table-row-select-header-1'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-3'));
      expect(screen.getByTestId('bestellingen-selectie-balk')).toHaveTextContent('2 bestellingen geselecteerd (2 klanten)');
    });

    it('clears the selection when the underlying bestellingen list changes to no longer include a selected id', () => {
      const bestellingen = [{ ...BESTELLINGEN[0], status: 'Te versturen naar drukker' as const }];
      const { rerender } = renderSection({ bestellingen });
      fireEvent.click(screen.getByTestId('data-table-row-select-header-1'));
      expect(screen.getByTestId('bestellingen-selectie-balk')).toBeInTheDocument();
      rerender(bestellingen.map((b) => ({ ...b, status: 'Verstuurd naar drukker' as const })));
      expect(screen.queryByTestId('bestellingen-selectie-balk')).not.toBeInTheDocument();
    });
  });
```

Since `renderSection` currently returns callbacks only, extend its helper (used by the new `rerender` case above) to also return a `rerender` function. Change `renderSection` to:

```tsx
function renderSection(overrides: Partial<React.ComponentProps<typeof BestellingenSection>> = {}) {
  const onBestellingUpdated = vi.fn();
  const onLinePrijsVastgesteld = vi.fn();
  const onLineUpdated = vi.fn();
  const { rerender: rtlRerender } = render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <BestellingenSection
        bestellingen={BESTELLINGEN}
        kunstwerken={KUNSTWERKEN}
        materialen={MATERIALEN}
        maten={MATEN}
        materiaalsoorten={MATERIAALSOORTEN}
        klanten={[]}
        drukkers={[]}
        loadError={null}
        onBestellingUpdated={onBestellingUpdated}
        onLinePrijsVastgesteld={onLinePrijsVastgesteld}
        onLineUpdated={onLineUpdated}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  function rerender(bestellingen: Bestelling[]) {
    rtlRerender(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <BestellingenSection
          bestellingen={bestellingen}
          kunstwerken={KUNSTWERKEN}
          materialen={MATERIALEN}
          maten={MATEN}
          materiaalsoorten={MATERIAALSOORTEN}
          klanten={[]}
          drukkers={[]}
          loadError={null}
          onBestellingUpdated={onBestellingUpdated}
          onLinePrijsVastgesteld={onLinePrijsVastgesteld}
          onLineUpdated={onLineUpdated}
        />
      </NextIntlClientProvider>
    );
  }
  return { onBestellingUpdated, onLinePrijsVastgesteld, onLineUpdated, rerender };
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/BestellingenSection.test.tsx`
Expected: FAIL — no `klanten`/`drukkers` props, no selection checkboxes/bar yet.

- [ ] **Step 3: Implement selection state in BestellingenSection**

In `src/components/beheer/BestellingenSection.tsx`:
- Import `Klant` from `./KlantenSection` and `Drukker` from `./materiaalTypes`.
- Add `klanten: Klant[] | null;` and `drukkers: Drukker[] | null;` to `BestellingenSectionProps`.
- Add `const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());`.
- Add an effect that drops selected ids no longer present with status `'Te versturen naar drukker'`:

```ts
  useEffect(() => {
    if (bestellingen === null) return;
    const stillSelectable = new Set(
      bestellingen.filter((b) => b.status === 'Te versturen naar drukker').map((b) => b.id)
    );
    setSelectedIds((current) => {
      const next = new Set(Array.from(current).filter((id) => stillSelectable.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [bestellingen]);
```

(Import `useEffect` alongside the existing `useState` import.)

- Add handlers:

```ts
  function handleToggle(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleToggleAll(ids: string[]) {
    setSelectedIds((current) => {
      const allSelected = ids.length > 0 && ids.every((id) => current.has(id));
      const next = new Set(current);
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  }
```

- Pass `selection` to `DataTable`:

```tsx
        selection={{
          selectedIds,
          onToggle: handleToggle,
          onToggleAll: handleToggleAll,
          isSelectable: (row) => row.status === 'Te versturen naar drukker',
        }}
```

- Add the selection bar, rendered right above the `<DataTable>` element:

```tsx
      {selectedIds.size > 0 && (
        <div
          data-testid="bestellingen-selectie-balk"
          className="mb-3 flex items-center justify-between gap-3 rounded-sm bg-white/5 px-3 py-2 text-xs"
        >
          <span>
            {t('bestellingenGeselecteerd', {
              count: selectedIds.size,
              klanten: new Set(
                bestellingen.filter((b) => selectedIds.has(b.id)).map((b) => b.klantId)
              ).size,
            })}
          </span>
          <button
            type="button"
            data-testid="bestellingen-versturen-naar-drukker"
            className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
          >
            {t('bestellingenVersturenNaarDrukker')}
          </button>
        </div>
      )}
```

(The button has no `onClick` yet — that's wired to open `VersturenNaarDrukkerDialog` in Task 9.)

- [ ] **Step 4: Update BeheerShell to pass the new props**

In `src/components/beheer/BeheerShell.tsx`, in the `bestellingen` branch, add `klanten={klanten}` and `drukkers={drukkers.items}`.

- [ ] **Step 5: Add translations**

In `messages/nl.json`, add near the other `bestellingen*` keys:

```json
    "bestellingenGeselecteerd": "{count} bestellingen geselecteerd ({klanten} klanten)",
    "bestellingenVersturenNaarDrukker": "Versturen naar drukker",
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/components/beheer/BestellingenSection.test.tsx tests/components/beheer/BeheerShell.test.tsx`
Expected: PASS.

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/beheer/BestellingenSection.tsx src/components/beheer/BeheerShell.tsx messages/nl.json tests/components/beheer/BestellingenSection.test.tsx
git commit -m "feat: bulk-selectie van bestellingen met status 'Te versturen naar drukker'"
```

---

### Task 9: VersturenNaarDrukkerDialog + wiring + mail-relay rename

**Files:**
- Create: `src/components/beheer/VersturenNaarDrukkerDialog.tsx`
- Modify: `src/components/beheer/BestellingenSection.tsx`
- Modify: `messages/nl.json`
- Rename: `mail-server/send-order-confirmation.php` → `mail-server/send-mail.php`
- Test: `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx`
- Test: `tests/components/beheer/BestellingenSection.test.tsx`

**Interfaces:**
- Produces: `VersturenNaarDrukkerDialog` component, `{ isOpen, onClose, bestellingen, klanten, drukkers, kunstwerken, materialen, maten, materiaalsoorten, onVerstuurd }` props, where `onVerstuurd: (updated: Bestelling[]) => void`.

- [ ] **Step 1: Write the failing dialog tests**

Create `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { VersturenNaarDrukkerDialog } from '@/components/beheer/VersturenNaarDrukkerDialog';
import type { Bestelling } from '@/components/beheer/BestellingenSection';
import type { Klant } from '@/components/beheer/KlantenSection';
import type { Drukker, Kunstwerk, Materiaal, Maat, Materiaalsoort } from '@/components/beheer/materiaalTypes';
import messages from '../../../messages/nl.json';

const updateDocMock = vi.fn();
const addDocMock = vi.fn();
const logActiviteitMock = vi.fn();
const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);

vi.mock('@/lib/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, ...segments: string[]) => ({ collectionName: segments.slice(0, -1).join('/'), id: segments[segments.length - 1] })),
  collection: vi.fn((_db, ...segments: string[]) => ({ name: segments.join('/') })),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  addDoc: (...args: unknown[]) => addDocMock(...args),
  serverTimestamp: () => 'server-timestamp',
}));

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

const KLANT: Klant = {
  id: 'uid-1',
  companyName: 'Testbedrijf BV',
  kvk: '12345678',
  contactPerson: 'Jan Jansen',
  email: 'jan@example.com',
  phone: '0612345678',
  contactPreference: 'email',
  address: 'Teststraat 1',
  postcode: '1234 AB',
  city: 'Teststad',
  deliveryAddress: '',
  deliveryPostcode: '',
  deliveryCity: '',
  invoiceAddress: '',
  invoicePostcode: '',
  invoiceCity: '',
  status: 'Goedgekeurd',
  prijsgroepId: 'pg-1',
};

const DRUKKERS: Drukker[] = [
  { id: 'drukker-1', naam: 'Drukkerij Janssen', adres: 'Perslaan 1', postcode: '1000 AA', plaats: 'Utrecht', email: 'info@janssen.nl', prijsafspraken: '' },
];

const KUNSTWERKEN: Kunstwerk[] = [
  { id: 'kw-1', foto: '', naam: 'Hotel paneel', artiest: '', segmentIds: [], materiaalIds: ['mat-1'], maatIds: ['maat-1'], prijzen: [], omschrijvingNl: 'Hotel paneel', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
];
const MATERIALEN: Materiaal[] = [{ id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 6, omschrijving: 'Helder' }];
const MATEN: Maat[] = [{ id: 'maat-1', breedte: 40, hoogte: 60 }];
const MATERIAALSOORTEN: Materiaalsoort[] = [{ id: 'soort-1', omschrijving: 'Glas' }];

const BESTELLING: Bestelling = {
  id: 'header-1',
  klantId: 'uid-1',
  companyName: 'Testbedrijf BV',
  besteldatum: '1-7-2026',
  status: 'Te versturen naar drukker',
  lineCount: 1,
  totalQuantity: 2,
  lines: [{ id: 'line-1', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
};

function renderDialog(overrides: Partial<React.ComponentProps<typeof VersturenNaarDrukkerDialog>> = {}) {
  const onClose = vi.fn();
  const onVerstuurd = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <VersturenNaarDrukkerDialog
        isOpen
        onClose={onClose}
        bestellingen={[BESTELLING]}
        klanten={[KLANT]}
        drukkers={DRUKKERS}
        kunstwerken={KUNSTWERKEN}
        materialen={MATERIALEN}
        maten={MATEN}
        materiaalsoorten={MATERIAALSOORTEN}
        onVerstuurd={onVerstuurd}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  return { onClose, onVerstuurd };
}

beforeEach(() => {
  updateDocMock.mockReset();
  addDocMock.mockReset();
  logActiviteitMock.mockReset();
  fetchMock.mockReset();
  vi.stubEnv('NEXT_PUBLIC_MAIL_ENDPOINT_URL', 'https://example.com/mail.php');
  vi.stubEnv('NEXT_PUBLIC_MAIL_SECRET', 'test-secret');
});

describe('VersturenNaarDrukkerDialog', () => {
  it('pre-selects the only drukker and shows the full e-mail preview', () => {
    renderDialog();
    expect(screen.getByTestId('drukker-versturen-drukker')).toHaveValue('drukker-1');
    expect(screen.getByTestId('drukker-versturen-preview')).toHaveTextContent('Testbedrijf BV');
    expect(screen.getByTestId('drukker-versturen-preview')).toHaveTextContent('Hotel paneel');
  });

  it('sends the mail, updates statuses, saves a zending, logs the activiteit, and closes', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    updateDocMock.mockResolvedValue(undefined);
    addDocMock.mockResolvedValue(undefined);
    const { onVerstuurd, onClose } = renderDialog();

    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/mail.php',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"to":"info@janssen.nl"'),
        })
      )
    );
    await waitFor(() =>
      expect(updateDocMock).toHaveBeenCalledWith(
        { collectionName: 'bestelheaders', id: 'header-1' },
        { status: 'Verstuurd naar drukker' }
      )
    );
    await waitFor(() =>
      expect(addDocMock).toHaveBeenCalledWith(
        { name: 'drukkers/drukker-1/zendingen' },
        expect.objectContaining({
          bestellingIds: ['header-1'],
          aantalKlanten: 1,
          aantalRegels: 1,
          verzondDoor: 'paul@glassartanddesign.com',
        })
      )
    );
    expect(logActiviteitMock).toHaveBeenCalledWith('bestelling_verstuurd_naar_drukker', {
      id: 'staff-1',
      email: 'paul@glassartanddesign.com',
      naam: 'paul@glassartanddesign.com',
    });
    expect(onVerstuurd).toHaveBeenCalledWith([{ ...BESTELLING, status: 'Verstuurd naar drukker' }]);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows an error and does not update anything when the mail request fails', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    const { onVerstuurd } = renderDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));
    expect(await screen.findByTestId('drukker-versturen-error')).toHaveTextContent(
      'Het versturen van de e-mail is mislukt. Probeer het opnieuw.'
    );
    expect(updateDocMock).not.toHaveBeenCalled();
    expect(onVerstuurd).not.toHaveBeenCalled();
  });

  it('shows a distinct error when the mail sends but the status update fails', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    updateDocMock.mockRejectedValue(new Error('offline'));
    renderDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));
    expect(await screen.findByTestId('drukker-versturen-error')).toHaveTextContent(
      'De e-mail is verzonden, maar het bijwerken van de bestellingen is mislukt. Verstuur niet opnieuw — controleer de statussen handmatig.'
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement VersturenNaarDrukkerDialog.tsx**

Create `src/components/beheer/VersturenNaarDrukkerDialog.tsx`:

```tsx
'use client';

import { useMemo, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Modal } from '@/components/Modal';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import { buildDrukkerMail } from '@/lib/buildDrukkerMail';
import type { Bestelling } from './BestellingenSection';
import type { Klant } from './KlantenSection';
import type { Drukker, Kunstwerk, Materiaal, Maat, Materiaalsoort } from './materiaalTypes';

interface VersturenNaarDrukkerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  bestellingen: Bestelling[];
  klanten: Klant[];
  drukkers: Drukker[];
  kunstwerken: Kunstwerk[];
  materialen: Materiaal[];
  maten: Maat[];
  materiaalsoorten: Materiaalsoort[];
  onVerstuurd: (updated: Bestelling[]) => void;
}

export function VersturenNaarDrukkerDialog({
  isOpen,
  onClose,
  bestellingen,
  klanten,
  drukkers,
  kunstwerken,
  materialen,
  maten,
  materiaalsoorten,
  onVerstuurd,
}: VersturenNaarDrukkerDialogProps) {
  const t = useTranslations('beheer');
  const { user } = useAdminAuth();
  const [drukkerId, setDrukkerId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDrukkerId(drukkers[0]?.id ?? '');
      setError(null);
      setIsSending(false);
    }
  }, [isOpen, drukkers]);

  const mail = useMemo(
    () => buildDrukkerMail({ bestellingen, klanten, kunstwerken, materialen, maten, materiaalsoorten }),
    [bestellingen, klanten, kunstwerken, materialen, maten, materiaalsoorten]
  );

  async function handleVersturen() {
    const drukker = drukkers.find((d) => d.id === drukkerId);
    const endpoint = process.env.NEXT_PUBLIC_MAIL_ENDPOINT_URL;
    const secret = process.env.NEXT_PUBLIC_MAIL_SECRET;
    if (!drukker || !endpoint || !secret) {
      setError(t('drukkerVersturenMailError'));
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, to: drukker.email, subject: mail.subject, body: mail.body }),
      });
      if (!response.ok) {
        setError(t('drukkerVersturenMailError'));
        setIsSending(false);
        return;
      }
    } catch {
      setError(t('drukkerVersturenMailError'));
      setIsSending(false);
      return;
    }

    try {
      await Promise.all(
        bestellingen.map((bestelling) =>
          updateDoc(doc(db, 'bestelheaders', bestelling.id), { status: 'Verstuurd naar drukker' })
        )
      );
      await addDoc(collection(db, 'drukkers', drukkerId, 'zendingen'), {
        verzondenOp: serverTimestamp(),
        onderwerp: mail.subject,
        body: mail.body,
        bestellingIds: bestellingen.map((b) => b.id),
        aantalKlanten: new Set(bestellingen.map((b) => b.klantId)).size,
        aantalRegels: bestellingen.reduce((sum, b) => sum + b.lineCount, 0),
        verzondDoor: user?.email ?? 'Onbekend',
      });
      void logActiviteit('bestelling_verstuurd_naar_drukker', actorFromMedewerker(user));
      onVerstuurd(bestellingen.map((b) => ({ ...b, status: 'Verstuurd naar drukker' as const })));
      onClose();
    } catch {
      setError(t('drukkerVersturenStatusError'));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} closeLabel={t('modalClose')} title={t('drukkerVersturenTitel')}>
      <div className="flex flex-col gap-3 text-sm text-white/80">
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
          {t('drukkerVersturenLabelDrukker')}
          <select
            value={drukkerId}
            onChange={(event) => setDrukkerId(event.target.value)}
            data-testid="drukker-versturen-drukker"
            className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
          >
            {drukkers.map((drukker) => (
              <option key={drukker.id} value={drukker.id}>
                {drukker.naam}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-white/60">{t('drukkerVersturenLabelPreview')}</span>
          <pre
            data-testid="drukker-versturen-preview"
            className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-sm bg-black/40 p-3 text-xs text-white/80"
          >
            {mail.subject}
            {'\n\n'}
            {mail.body}
          </pre>
        </div>

        {error && (
          <p data-testid="drukker-versturen-error" className="text-xs text-red-400">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleVersturen}
            disabled={isSending || !drukkerId}
            data-testid="drukker-versturen-versturen"
            className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
          >
            {t('drukkerVersturenVersturen')}
          </button>
          <button
            type="button"
            onClick={onClose}
            data-testid="drukker-versturen-annuleren"
            className="rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
          >
            {t('annuleren')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: Wire the dialog into BestellingenSection**

In `src/components/beheer/BestellingenSection.tsx`:
- Import `VersturenNaarDrukkerDialog`.
- Add `const [showVersturenDialog, setShowVersturenDialog] = useState(false);`.
- Give the "Versturen naar drukker" button (added in Task 8) an `onClick={() => setShowVersturenDialog(true)}`.
- After the existing `<BestellingModal ... />`, render:

```tsx
      <VersturenNaarDrukkerDialog
        isOpen={showVersturenDialog}
        onClose={() => setShowVersturenDialog(false)}
        bestellingen={bestellingen.filter((b) => selectedIds.has(b.id))}
        klanten={klanten ?? []}
        drukkers={drukkers ?? []}
        kunstwerken={kunstwerken ?? []}
        materialen={materialen ?? []}
        maten={maten ?? []}
        materiaalsoorten={materiaalsoorten ?? []}
        onVerstuurd={(updated) => {
          updated.forEach(onBestellingUpdated);
          setSelectedIds(new Set());
          setShowVersturenDialog(false);
        }}
      />
```

- [ ] **Step 5: Add translations**

In `messages/nl.json`, add:

```json
    "drukkerVersturenTitel": "Versturen naar drukker",
    "drukkerVersturenLabelDrukker": "Drukker",
    "drukkerVersturenLabelPreview": "E-mail preview",
    "drukkerVersturenVersturen": "Versturen",
    "drukkerVersturenMailError": "Het versturen van de e-mail is mislukt. Probeer het opnieuw.",
    "drukkerVersturenStatusError": "De e-mail is verzonden, maar het bijwerken van de bestellingen is mislukt. Verstuur niet opnieuw — controleer de statussen handmatig.",
    "activiteitTypeBestellingVerstuurdNaarDrukker": "Bestelling verstuurd naar drukker",
```

Add `'bestelling_verstuurd_naar_drukker'` to the `ActiviteitType` union in `src/lib/logActiviteit.ts` (after `'drukker_verwijderd';` — adjust the trailing punctuation) and to `TYPE_LABEL_KEYS` in `ActiviteitSection.tsx`:

```ts
  bestelling_verstuurd_naar_drukker: 'activiteitTypeBestellingVerstuurdNaarDrukker',
```

Add `'bestelling_verstuurd_naar_drukker'` to the `type in [...]` list in `firestore.rules`.

- [ ] **Step 6: Rename the PHP mail-relay script**

```bash
git mv mail-server/send-order-confirmation.php mail-server/send-mail.php
```

No content changes needed inside the file — it was already generic (`to`/`subject`/`body` under the shared secret). Note the manual deploy step (not part of this repo, cannot be automated by this task): on mijn.host, the live `mail-server/send-order-confirmation.php` file must be replaced with `send-mail.php`, and the GitHub repo variable `NEXT_PUBLIC_MAIL_ENDPOINT_URL` updated to the new URL, in the same deploy window as this feature so the existing order-confirmation mail doesn't break.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx tests/components/beheer/BestellingenSection.test.tsx`
Expected: PASS.

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 9: Commit**

```bash
git add src/components/beheer/VersturenNaarDrukkerDialog.tsx src/components/beheer/BestellingenSection.tsx src/lib/logActiviteit.ts src/components/beheer/ActiviteitSection.tsx firestore.rules messages/nl.json tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx tests/components/beheer/BestellingenSection.test.tsx mail-server/send-mail.php
git commit -m "feat: versturen-naar-drukker dialoog, hergebruikt generiek mail-relay endpoint"
```

- [ ] **Step 10: Deploy Firestore rules**

Run: `npx --yes firebase-tools deploy --only firestore:rules`

---

### Task 10: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, no unexpected failures outside this feature's files.

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds (this is the step that has historically caught generics/type issues `npm test` misses).

- [ ] **Step 4: Manual smoke check (once safe to run the dev server against real/emulated Firestore)**

Not automatable in this plan (needs a real Firebase project or emulator) — after implementation, manually verify in the browser: approve a bestelling (status becomes "Te versturen naar drukker"), select it via checkbox, open "Versturen naar drukker", confirm the preview text looks right, add a Drukker first if none exist, send, and confirm the bestelling's status becomes "Verstuurd naar drukker" and the mail shows up under that Drukker's "Verzonden mails".

- [ ] **Step 5: Final commit (only if Steps 1–3 required fixes)**

```bash
git add -u
git commit -m "fix: address issues found during final verification"
```

(Skip this step entirely if nothing needed fixing.)
