# Kunstenaars Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 26-07-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a `Kunstenaar` (artist) entity linked to `Kunstwerk` (replacing the free-text `artiest` field) and optionally to a `Klant` account, with exclusive-ordering rights enforced at both the UI and Firestore-rules layers, plus a public artist filter on the Collecties page.

**Architecture:** New `kunstenaars` Firestore collection managed through the existing `useFirestoreCollection` hook and a beheer Section+Modal component (same pattern as `PrijsgroepenSection`/`KunstwerkenSection`). `Kunstwerk.artiest: string` becomes `Kunstwerk.kunstenaarId: string | null`. `Klant` gains `exclusieveKunstenaarIds: string[]`; `Kunstenaar` carries a denormalized `exclusiefVoorKlantId` back-pointer (max one exclusive klant per kunstenaar, enforced in the beheer UI) so Firestore rules can check exclusivity without a collection-wide query. Ordering rights are enforced twice: disabled UI state in `ProductModal`, and a `bestellines` create-rule extension in `firestore.rules` (the only real enforcement boundary, since the site is a static export with no server).

**Tech Stack:** Next.js 14 (App Router, static export), Firebase/Firestore client SDK, next-intl, TypeScript, Tailwind, Vitest + @testing-library/react.

## Global Constraints

- The site is `output: 'export'` — no server. Firestore security rules are the only real enforcement boundary; UI-only disabling is a UX nicety, never sufficient on its own.
- The `beheer` (admin) translation namespace exists **only** in `messages/nl.json` — admin UI is Dutch-only. Do not add `beheer` keys to `en.json`/`de.json`/`fr.json`.
- Customer-facing namespaces (`collectionsPage`, `cart`, `kunstwerkSpecCard`) exist in all four locale files (`nl`, `en`, `de`, `fr`) and any new customer-facing key must be added to all four.
- Test stack is Vitest + `@testing-library/react`, run via `npm test` (= `vitest run`). Every component test wraps render in `<NextIntlClientProvider locale="nl" messages={messages}>` importing `messages/nl.json`.
- There is no `@firebase/rules-unit-testing` dependency in this repo. `firestore.rules` changes are verified by deploying (`npx --yes firebase-tools deploy --only firestore:rules`, already authenticated on this machine) and a manual smoke-check — do not add new test infrastructure for this.
- Reuse `useKunstwerkFotoUpload` as-is for the Kunstenaar portrait upload — it is already generic despite its name (just posts a `foto` file to the existing upload endpoint).
- Follow existing `DataTable`/`Modal`/`useFirestoreCollection` patterns and `data-testid` naming conventions (`<entity>-section`, `<entity>-modal`, `<entity>-modal-<field>`).
- Naming: the new entity is `Kunstenaar` (singular)/`Kunstenaars` (plural) throughout — component `KunstenaarsSection`, hook variable `kunstenaars`, translation key prefix `kunstenaars...`, section id `'kunstenaars'`. `Kunstwerk.kunstenaarId` stays singular (one artist per artwork). `Klant.exclusieveKunstenaarIds` stays plural (a klant can hold exclusivity on several artists).

---

### Task 1: Kunstenaar type, `kunstenaars` Firestore rules, and new activity-log types

**Files:**
- Create: `src/components/beheer/kunstenaarTypes.ts`
- Modify: `src/lib/logActiviteit.ts`
- Modify: `src/components/beheer/ActiviteitSection.tsx`
- Modify: `firestore.rules`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/ActiviteitSection.test.tsx`

**Interfaces:**
- Produces: `Kunstenaar` interface (id, naam, foto, omschrijvingNl/Fr/De/En, prijsafspraken, verkooprecht, klantId, exclusiefVoorKlantId) from `src/components/beheer/kunstenaarTypes.ts`, imported by every later task as `import type { Kunstenaar } from './kunstenaarTypes'` (or `@/components/beheer/kunstenaarTypes` from outside `beheer/`).
- Produces: 4 new `ActiviteitType` union members: `'kunstenaar_toegevoegd' | 'kunstenaar_gewijzigd' | 'kunstenaar_verwijderd' | 'klant_exclusiviteit_gewijzigd'`.

- [ ] **Step 1: Write the failing test in `ActiviteitSection.test.tsx`**

Add this test inside the existing `describe('ActiviteitSection', ...)` block, after the `'shows the translated label for bedrijfsgegevens_gewijzigd'` test:

```tsx
  it('shows the translated labels for the new kunstenaar and klant-exclusiviteit activity types', () => {
    renderSection([
      {
        id: 'log-5',
        type: 'kunstenaar_toegevoegd',
        actorEmail: 'paul@glassartanddesign.com',
        actorNaam: 'paul@glassartanddesign.com',
        timestamp: new Date('2026-07-26T09:00:00'),
      },
      {
        id: 'log-6',
        type: 'kunstenaar_gewijzigd',
        actorEmail: 'paul@glassartanddesign.com',
        actorNaam: 'paul@glassartanddesign.com',
        timestamp: new Date('2026-07-26T09:05:00'),
      },
      {
        id: 'log-7',
        type: 'kunstenaar_verwijderd',
        actorEmail: 'paul@glassartanddesign.com',
        actorNaam: 'paul@glassartanddesign.com',
        timestamp: new Date('2026-07-26T09:10:00'),
      },
      {
        id: 'log-8',
        type: 'klant_exclusiviteit_gewijzigd',
        actorEmail: 'paul@glassartanddesign.com',
        actorNaam: 'paul@glassartanddesign.com',
        timestamp: new Date('2026-07-26T09:15:00'),
      },
    ]);
    expect(screen.getByTestId('data-table-row-log-5')).toHaveTextContent('Kunstenaar toegevoegd');
    expect(screen.getByTestId('data-table-row-log-6')).toHaveTextContent('Kunstenaar gewijzigd');
    expect(screen.getByTestId('data-table-row-log-7')).toHaveTextContent('Kunstenaar verwijderd');
    expect(screen.getByTestId('data-table-row-log-8')).toHaveTextContent('Exclusiviteit gewijzigd voor klant');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- ActiviteitSection`
Expected: FAIL — `type: 'kunstenaar_toegevoegd'` etc. are not assignable to `ActiviteitType`, and the rendered label falls back to the raw type string (no translation match).

- [ ] **Step 3: Create `src/components/beheer/kunstenaarTypes.ts`**

```ts
export interface Kunstenaar {
  id: string;
  naam: string;
  foto: string | null;
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;
  prijsafspraken: string;
  verkooprecht: 'open' | 'alleen-kunstenaar';
  klantId: string | null;
  exclusiefVoorKlantId: string | null;
}
```

- [ ] **Step 4: Extend `ActiviteitType` in `src/lib/logActiviteit.ts`**

Change:
```ts
  | 'mandje_eigen_maat_toegevoegd'
  | 'bestelling_prijs_vastgesteld'
  | 'bestelling_regel_gewijzigd';
```
to:
```ts
  | 'mandje_eigen_maat_toegevoegd'
  | 'bestelling_prijs_vastgesteld'
  | 'bestelling_regel_gewijzigd'
  | 'kunstenaar_toegevoegd'
  | 'kunstenaar_gewijzigd'
  | 'kunstenaar_verwijderd'
  | 'klant_exclusiviteit_gewijzigd';
```

- [ ] **Step 5: Add label-key mappings in `src/components/beheer/ActiviteitSection.tsx`**

Change:
```ts
  bedrijfsgegevens_gewijzigd: 'activiteitTypeBedrijfsgegevensGewijzigd',
};
```
to:
```ts
  bedrijfsgegevens_gewijzigd: 'activiteitTypeBedrijfsgegevensGewijzigd',
  kunstenaar_toegevoegd: 'activiteitTypeKunstenaarToegevoegd',
  kunstenaar_gewijzigd: 'activiteitTypeKunstenaarGewijzigd',
  kunstenaar_verwijderd: 'activiteitTypeKunstenaarVerwijderd',
  klant_exclusiviteit_gewijzigd: 'activiteitTypeKlantExclusiviteitGewijzigd',
};
```

- [ ] **Step 6: Add the translation keys to `messages/nl.json`**

Find line 304 (`"activiteitTypeBedrijfsgegevensGewijzigd": "Bedrijfsgegevens gewijzigd",`) and add immediately after it:
```json
    "activiteitTypeKunstenaarToegevoegd": "Kunstenaar toegevoegd",
    "activiteitTypeKunstenaarGewijzigd": "Kunstenaar gewijzigd",
    "activiteitTypeKunstenaarVerwijderd": "Kunstenaar verwijderd",
    "activiteitTypeKlantExclusiviteitGewijzigd": "Exclusiviteit gewijzigd voor klant",
```

- [ ] **Step 7: Add the `kunstenaars` collection rule and extend the activiteitenlog allow-list in `firestore.rules`**

After the `match /prijsgroepen/{id} { ... }` block (lines 28-31), add:
```
    match /kunstenaars/{id} {
      allow read: if true;
      allow write: if request.auth != null && exists(/databases/$(database)/documents/medewerkers/$(request.auth.uid));
    }
```

In the `activiteitenlog` `allow create` type list, change:
```
           'bedrijfsgegevens_gewijzigd','mandje_eigen_maat_toegevoegd','bestelling_prijs_vastgesteld']
```
to:
```
           'bedrijfsgegevens_gewijzigd','mandje_eigen_maat_toegevoegd','bestelling_prijs_vastgesteld',
           'kunstenaar_toegevoegd','kunstenaar_gewijzigd','kunstenaar_verwijderd','klant_exclusiviteit_gewijzigd']
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test -- ActiviteitSection`
Expected: PASS

- [ ] **Step 9: Deploy the updated rules**

Run: `npx --yes firebase-tools deploy --only firestore:rules`
Expected: deploy succeeds (this also validates the rules syntax — a compile error here means Step 7 has a typo).

- [ ] **Step 10: Commit**

```bash
git add src/components/beheer/kunstenaarTypes.ts src/lib/logActiviteit.ts src/components/beheer/ActiviteitSection.tsx firestore.rules messages/nl.json tests/components/beheer/ActiviteitSection.test.tsx
git commit -m "feat: add Kunstenaar type, kunstenaars Firestore rule, and new activity types"
```

---

### Task 2: Reusable `Combobox` searchable single-select component

**Files:**
- Create: `src/components/Combobox.tsx`
- Test: `tests/components/Combobox.test.tsx`

**Interfaces:**
- Produces: `Combobox` component and `ComboboxOption` type from `@/components/Combobox`, consumed by Task 3 (Kunstenaar→Klant link), Task 6 (Collecties artist filter).
  ```ts
  interface ComboboxOption { value: string; label: string; }
  interface ComboboxProps {
    options: ComboboxOption[];
    value: string | null;
    onChange: (value: string | null) => void;
    placeholder: string;
    noResultsLabel: string;
    clearLabel?: string;
    testId: string;
  }
  ```
  Rendered option buttons use `data-testid={`${testId}-option-${option.value}`}`; the clear option (when `clearLabel` is given) uses `data-testid={`${testId}-option-clear`}`; the empty-state uses `data-testid={`${testId}-empty`}`.

- [ ] **Step 1: Write the failing test file `tests/components/Combobox.test.tsx`**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Combobox } from '@/components/Combobox';

const OPTIONS = [
  { value: 'a', label: 'Anna' },
  { value: 'b', label: 'Bram' },
];

describe('Combobox', () => {
  it('shows the placeholder when nothing is selected', () => {
    render(
      <Combobox options={OPTIONS} value={null} onChange={vi.fn()} placeholder="Zoek…" noResultsLabel="Niets gevonden" testId="combo" />
    );
    expect(screen.getByTestId('combo')).toHaveAttribute('placeholder', 'Zoek…');
    expect(screen.getByTestId('combo')).toHaveValue('');
  });

  it('shows the selected option label when a value is set', () => {
    render(
      <Combobox options={OPTIONS} value="b" onChange={vi.fn()} placeholder="Zoek…" noResultsLabel="Niets gevonden" testId="combo" />
    );
    expect(screen.getByTestId('combo')).toHaveValue('Bram');
  });

  it('filters options as the user types and selects one on click', () => {
    const onChange = vi.fn();
    render(
      <Combobox options={OPTIONS} value={null} onChange={onChange} placeholder="Zoek…" noResultsLabel="Niets gevonden" testId="combo" />
    );
    fireEvent.focus(screen.getByTestId('combo'));
    fireEvent.change(screen.getByTestId('combo'), { target: { value: 'an' } });
    expect(screen.getByTestId('combo-option-a')).toBeInTheDocument();
    expect(screen.queryByTestId('combo-option-b')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('combo-option-a'));
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('shows noResultsLabel when nothing matches', () => {
    render(
      <Combobox options={OPTIONS} value={null} onChange={vi.fn()} placeholder="Zoek…" noResultsLabel="Niets gevonden" testId="combo" />
    );
    fireEvent.focus(screen.getByTestId('combo'));
    fireEvent.change(screen.getByTestId('combo'), { target: { value: 'zzz' } });
    expect(screen.getByTestId('combo-empty')).toHaveTextContent('Niets gevonden');
  });

  it('calls onChange(null) when the clear option is clicked', () => {
    const onChange = vi.fn();
    render(
      <Combobox
        options={OPTIONS}
        value="a"
        onChange={onChange}
        placeholder="Zoek…"
        noResultsLabel="Niets gevonden"
        clearLabel="Geen koppeling"
        testId="combo"
      />
    );
    fireEvent.focus(screen.getByTestId('combo'));
    expect(screen.getByTestId('combo-option-clear')).toHaveTextContent('Geen koppeling');
    fireEvent.click(screen.getByTestId('combo-option-clear'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('does not render a clear option when clearLabel is omitted', () => {
    render(
      <Combobox options={OPTIONS} value="a" onChange={vi.fn()} placeholder="Zoek…" noResultsLabel="Niets gevonden" testId="combo" />
    );
    fireEvent.focus(screen.getByTestId('combo'));
    expect(screen.queryByTestId('combo-option-clear')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- Combobox`
Expected: FAIL — `Cannot find module '@/components/Combobox'`

- [ ] **Step 3: Create `src/components/Combobox.tsx`**

```tsx
'use client';

import { useMemo, useState } from 'react';

export interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder: string;
  noResultsLabel: string;
  clearLabel?: string;
  testId: string;
}

export function Combobox({ options, value, onChange, placeholder, noResultsLabel, clearLabel, testId }: ComboboxProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const selectedLabel = options.find((option) => option.value === value)?.label ?? '';

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) => option.label.toLowerCase().includes(normalized));
  }, [options, query]);

  function handleSelect(nextValue: string | null) {
    onChange(nextValue);
    setQuery('');
    setIsOpen(false);
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={isOpen ? query : selectedLabel}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => {
          setQuery('');
          setIsOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => setIsOpen(false), 150);
        }}
        placeholder={placeholder}
        data-testid={testId}
        className="w-full rounded-sm bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40"
      />
      {isOpen && (
        <ul
          data-testid={`${testId}-list`}
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-sm border border-white/10 bg-charcoal shadow-lg"
        >
          {clearLabel && (
            <li>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(null)}
                data-testid={`${testId}-option-clear`}
                className="block w-full px-3 py-2 text-left text-sm text-white/70 hover:bg-white/10"
              >
                {clearLabel}
              </button>
            </li>
          )}
          {filteredOptions.length === 0 ? (
            <li data-testid={`${testId}-empty`} className="px-3 py-2 text-xs text-white/40">
              {noResultsLabel}
            </li>
          ) : (
            filteredOptions.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleSelect(option.value)}
                  data-testid={`${testId}-option-${option.value}`}
                  className="block w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10"
                >
                  {option.label}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- Combobox`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/Combobox.tsx tests/components/Combobox.test.tsx
git commit -m "feat: add reusable Combobox searchable select component"
```

---

### Task 3: `KunstenaarsSection` beheer UI (CRUD, photo upload, klant link) wired into the nav

**Files:**
- Create: `src/components/beheer/KunstenaarsSection.tsx`
- Test: `tests/components/beheer/KunstenaarsSection.test.tsx`
- Modify: `src/components/beheer/BeheerNav.tsx`
- Modify: `src/components/beheer/BeheerShell.tsx`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/BeheerNav.test.tsx`
- Test: `tests/components/beheer/BeheerShell.test.tsx`

**Interfaces:**
- Consumes: `Kunstenaar` from Task 1 (`./kunstenaarTypes`), `Klant` from `./KlantenSection`, `Combobox`/`ComboboxOption` from Task 2 (`@/components/Combobox`).
- Produces: `KunstenaarsSection` component with props `{ kunstenaars: Kunstenaar[] | null; klanten: Klant[] | null; loadError: string | null; onAdd: (data: Omit<Kunstenaar,'id'>) => Promise<boolean>; onUpdate: (id: string, data: Omit<Kunstenaar,'id'>) => Promise<boolean>; onRemove: (id: string) => Promise<boolean>; }`. `BeheerSection` union gains `'kunstenaars'`. `BeheerShell` exposes a `kunstenaars` `useFirestoreCollection<Kunstenaar>('kunstenaars')` result that Task 4 and Task 5 will reuse (`kunstenaars.items`, `kunstenaars.add/update/remove`).

- [ ] **Step 1: Write the failing test file `tests/components/beheer/KunstenaarsSection.test.tsx`**

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { KunstenaarsSection } from '@/components/beheer/KunstenaarsSection';
import type { Kunstenaar } from '@/components/beheer/kunstenaarTypes';
import type { Klant } from '@/components/beheer/KlantenSection';
import messages from '../../../messages/nl.json';

const uploadMock = vi.fn();
let mockUploading = false;
let mockUploadError: 'upload' | null = null;

vi.mock('@/lib/useKunstwerkFotoUpload', () => ({
  useKunstwerkFotoUpload: () => ({ uploading: mockUploading, error: mockUploadError, upload: uploadMock }),
}));

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

const KLANTEN: Klant[] = [
  {
    id: 'klant-1',
    companyName: 'Galerie De Boer',
    kvk: '12345678',
    contactPerson: 'Jan de Boer',
    email: 'jan@galeriedeboer.nl',
    phone: '0612345678',
    contactPreference: 'email',
    address: 'Teststraat 1',
    postcode: '1234 AB',
    city: 'Teststad',
    status: 'Goedgekeurd',
    prijsgroepId: null,
    exclusieveKunstenaarIds: [],
  },
];

const KUNSTENAARS: Kunstenaar[] = [
  {
    id: 'ka-1',
    naam: 'Sabrina Glasser',
    foto: null,
    omschrijvingNl: 'Werkt met gesmolten glas.',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    prijsafspraken: '20% commissie',
    verkooprecht: 'open',
    klantId: null,
    exclusiefVoorKlantId: null,
  },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof KunstenaarsSection>> = {}) {
  const onAdd = overrides.onAdd ?? vi.fn().mockResolvedValue(true);
  const onUpdate = overrides.onUpdate ?? vi.fn().mockResolvedValue(true);
  const onRemove = overrides.onRemove ?? vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <KunstenaarsSection
        kunstenaars={KUNSTENAARS}
        klanten={KLANTEN}
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
  uploadMock.mockReset();
  mockUploading = false;
  mockUploadError = null;
  logActiviteitMock.mockReset();
});

describe('KunstenaarsSection', () => {
  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('kunstenaars-error')).toHaveTextContent('Kon niet laden.');
  });

  it('renders nothing while kunstenaars is null and there is no error', () => {
    renderSection({ kunstenaars: null });
    expect(screen.queryByTestId('kunstenaars-section')).not.toBeInTheDocument();
  });

  it('lists kunstenaars with their verkooprecht label', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-ka-1')).toHaveTextContent('Sabrina Glasser');
    expect(screen.getByTestId('data-table-row-ka-1')).toHaveTextContent('Open voor alle klanten');
  });

  it('disables Opslaan until naam and the NL description are filled in', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstenaars-add'));
    expect(screen.getByTestId('kunstenaar-modal-opslaan')).toBeDisabled();
    fireEvent.change(screen.getByTestId('kunstenaar-modal-naam'), { target: { value: 'Nieuwe Kunstenaar' } });
    expect(screen.getByTestId('kunstenaar-modal-opslaan')).toBeDisabled();
    fireEvent.change(screen.getByTestId('kunstenaar-modal-omschrijving-nl'), { target: { value: 'Werkt met glas.' } });
    expect(screen.getByTestId('kunstenaar-modal-opslaan')).not.toBeDisabled();
  });

  it('adds a new kunstenaar with an uploaded photo, verkooprecht and gekoppelde klant', async () => {
    uploadMock.mockResolvedValue('https://storage.example.com/nieuw.jpg');
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('kunstenaars-add'));
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('kunstenaar-modal-foto-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('kunstenaar-modal-foto-preview')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('kunstenaar-modal-naam'), { target: { value: 'Nieuwe Kunstenaar' } });
    fireEvent.change(screen.getByTestId('kunstenaar-modal-omschrijving-nl'), { target: { value: 'Werkt met glas.' } });
    fireEvent.change(screen.getByTestId('kunstenaar-modal-verkooprecht'), { target: { value: 'alleen-kunstenaar' } });
    fireEvent.focus(screen.getByTestId('kunstenaar-modal-klant'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-option-klant-1'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-opslaan'));

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({
        foto: 'https://storage.example.com/nieuw.jpg',
        naam: 'Nieuwe Kunstenaar',
        omschrijvingNl: 'Werkt met glas.',
        omschrijvingFr: '',
        omschrijvingDe: '',
        omschrijvingEn: '',
        prijsafspraken: '',
        verkooprecht: 'alleen-kunstenaar',
        klantId: 'klant-1',
        exclusiefVoorKlantId: null,
      })
    );
    expect(logActiviteitMock).toHaveBeenCalledWith('kunstenaar_toegevoegd', {
      id: 'staff-1',
      email: 'paul@glassartanddesign.com',
      naam: 'paul@glassartanddesign.com',
    });
  });

  it('opens a row for editing pre-filled and updates it, preserving exclusiefVoorKlantId', async () => {
    const { onUpdate } = renderSection({
      kunstenaars: [{ ...KUNSTENAARS[0], exclusiefVoorKlantId: 'klant-1' }],
    });
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));
    expect(screen.getByTestId('kunstenaar-modal-naam')).toHaveValue('Sabrina Glasser');
    expect(screen.getByTestId('kunstenaar-modal-prijsafspraken')).toHaveValue('20% commissie');

    fireEvent.change(screen.getByTestId('kunstenaar-modal-naam'), { target: { value: 'Sabrina G.' } });
    fireEvent.click(screen.getByTestId('kunstenaar-modal-opslaan'));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('ka-1', {
        foto: null,
        naam: 'Sabrina G.',
        omschrijvingNl: 'Werkt met gesmolten glas.',
        omschrijvingFr: '',
        omschrijvingDe: '',
        omschrijvingEn: '',
        prijsafspraken: '20% commissie',
        verkooprecht: 'open',
        klantId: null,
        exclusiefVoorKlantId: 'klant-1',
      })
    );
    expect(logActiviteitMock).toHaveBeenCalledWith('kunstenaar_gewijzigd', expect.anything());
  });

  it('deletes a kunstenaar and logs kunstenaar_verwijderd', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('ka-1'));
    expect(logActiviteitMock).toHaveBeenCalledWith('kunstenaar_verwijderd', expect.anything());
  });

  it('shows an action error and does not log when adding fails', async () => {
    const onAdd = vi.fn().mockResolvedValue(false);
    renderSection({ onAdd });
    fireEvent.click(screen.getByTestId('kunstenaars-add'));
    fireEvent.change(screen.getByTestId('kunstenaar-modal-naam'), { target: { value: 'X' } });
    fireEvent.change(screen.getByTestId('kunstenaar-modal-omschrijving-nl'), { target: { value: 'Y' } });
    fireEvent.click(screen.getByTestId('kunstenaar-modal-opslaan'));
    expect(await screen.findByTestId('kunstenaar-modal-error')).toHaveTextContent(
      'Er is iets misgegaan. Probeer het opnieuw.'
    );
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- KunstenaarsSection`
Expected: FAIL — `Cannot find module '@/components/beheer/KunstenaarsSection'`

- [ ] **Step 3: Create `src/components/beheer/KunstenaarsSection.tsx`**

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { Combobox } from '@/components/Combobox';
import { useKunstwerkFotoUpload } from '@/lib/useKunstwerkFotoUpload';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Kunstenaar } from './kunstenaarTypes';
import type { Klant } from './KlantenSection';

interface KunstenaarsSectionProps {
  kunstenaars: Kunstenaar[] | null;
  klanten: Klant[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Kunstenaar, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Kunstenaar, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

type ModalState = { mode: 'add' } | { mode: 'edit'; kunstenaar: Kunstenaar } | null;
type KunstenaarRow = Kunstenaar & { verkooprechtLabel: string; klantNaam: string };

const LEGE_FORM = {
  foto: null as string | null,
  naam: '',
  omschrijvingNl: '',
  omschrijvingFr: '',
  omschrijvingDe: '',
  omschrijvingEn: '',
  prijsafspraken: '',
  verkooprecht: 'open' as Kunstenaar['verkooprecht'],
  klantId: null as string | null,
};

export function KunstenaarsSection({
  kunstenaars,
  klanten,
  loadError,
  onAdd,
  onUpdate,
  onRemove,
}: KunstenaarsSectionProps) {
  const t = useTranslations('beheer');
  const { uploading, error: fotoUploadError, upload } = useKunstwerkFotoUpload();
  const { user } = useAdminAuth();
  const [modalState, setModalState] = useState<ModalState>(null);
  const [foto, setFoto] = useState<string | null>(LEGE_FORM.foto);
  const [naam, setNaam] = useState(LEGE_FORM.naam);
  const [omschrijvingNl, setOmschrijvingNl] = useState(LEGE_FORM.omschrijvingNl);
  const [omschrijvingFr, setOmschrijvingFr] = useState(LEGE_FORM.omschrijvingFr);
  const [omschrijvingDe, setOmschrijvingDe] = useState(LEGE_FORM.omschrijvingDe);
  const [omschrijvingEn, setOmschrijvingEn] = useState(LEGE_FORM.omschrijvingEn);
  const [prijsafspraken, setPrijsafspraken] = useState(LEGE_FORM.prijsafspraken);
  const [verkooprecht, setVerkooprecht] = useState<Kunstenaar['verkooprecht']>(LEGE_FORM.verkooprecht);
  const [klantId, setKlantId] = useState<string | null>(LEGE_FORM.klantId);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isDraggingFoto, setIsDraggingFoto] = useState(false);

  const klantNaamById = useMemo(() => {
    const map = new Map<string, string>();
    (klanten ?? []).forEach((klant) => map.set(klant.id, klant.companyName));
    return map;
  }, [klanten]);

  if (loadError) {
    return (
      <p data-testid="kunstenaars-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (kunstenaars === null) {
    return null;
  }

  const rows: KunstenaarRow[] = kunstenaars.map((kunstenaar) => ({
    ...kunstenaar,
    verkooprechtLabel:
      kunstenaar.verkooprecht === 'open'
        ? t('kunstenaarsVerkooprechtOpen')
        : t('kunstenaarsVerkooprechtAlleenKunstenaar'),
    klantNaam: kunstenaar.klantId ? klantNaamById.get(kunstenaar.klantId) ?? kunstenaar.klantId : '',
  }));

  function resetForm() {
    setFoto(LEGE_FORM.foto);
    setNaam(LEGE_FORM.naam);
    setOmschrijvingNl(LEGE_FORM.omschrijvingNl);
    setOmschrijvingFr(LEGE_FORM.omschrijvingFr);
    setOmschrijvingDe(LEGE_FORM.omschrijvingDe);
    setOmschrijvingEn(LEGE_FORM.omschrijvingEn);
    setPrijsafspraken(LEGE_FORM.prijsafspraken);
    setVerkooprecht(LEGE_FORM.verkooprecht);
    setKlantId(LEGE_FORM.klantId);
    setActionError(null);
  }

  function openAdd() {
    resetForm();
    setModalState({ mode: 'add' });
  }

  function openEdit(kunstenaar: Kunstenaar) {
    setFoto(kunstenaar.foto);
    setNaam(kunstenaar.naam);
    setOmschrijvingNl(kunstenaar.omschrijvingNl);
    setOmschrijvingFr(kunstenaar.omschrijvingFr);
    setOmschrijvingDe(kunstenaar.omschrijvingDe);
    setOmschrijvingEn(kunstenaar.omschrijvingEn);
    setPrijsafspraken(kunstenaar.prijsafspraken);
    setVerkooprecht(kunstenaar.verkooprecht);
    setKlantId(kunstenaar.klantId);
    setActionError(null);
    setModalState({ mode: 'edit', kunstenaar });
  }

  function closeModal() {
    setModalState(null);
  }

  async function handleFotoFile(file: File) {
    const url = await upload(file);
    if (url) {
      setFoto(url);
    }
  }

  async function handleFotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await handleFotoFile(file);
  }

  function handleFotoDragOver(event: React.DragEvent<HTMLSpanElement>) {
    event.preventDefault();
    setIsDraggingFoto(true);
  }

  function handleFotoDragLeave(event: React.DragEvent<HTMLSpanElement>) {
    event.preventDefault();
    setIsDraggingFoto(false);
  }

  async function handleFotoDrop(event: React.DragEvent<HTMLSpanElement>) {
    event.preventDefault();
    setIsDraggingFoto(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await handleFotoFile(file);
  }

  const opslaanDisabled = !naam || !omschrijvingNl || uploading;

  async function handleSave() {
    if (!modalState) return;
    const data = {
      foto,
      naam,
      omschrijvingNl,
      omschrijvingFr,
      omschrijvingDe,
      omschrijvingEn,
      prijsafspraken,
      verkooprecht,
      klantId,
      exclusiefVoorKlantId: modalState.mode === 'edit' ? modalState.kunstenaar.exclusiefVoorKlantId : null,
    };
    const success =
      modalState.mode === 'add' ? await onAdd(data) : await onUpdate(modalState.kunstenaar.id, data);
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'kunstenaar_toegevoegd' : 'kunstenaar_gewijzigd',
        actorFromMedewerker(user)
      );
      closeModal();
    } else {
      setActionError(t('kunstenaarsActionError'));
    }
  }

  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const success = await onRemove(modalState.kunstenaar.id);
    if (success) {
      void logActiviteit('kunstenaar_verwijderd', actorFromMedewerker(user));
      closeModal();
    } else {
      setActionError(t('kunstenaarsActionError'));
    }
  }

  const columns: Column<KunstenaarRow>[] = [
    { key: 'naam', label: t('kunstenaarsColNaam') },
    { key: 'verkooprechtLabel', label: t('kunstenaarsColVerkooprecht') },
    { key: 'klantNaam', label: t('kunstenaarsColKlant') },
  ];

  return (
    <div data-testid="kunstenaars-section">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={openAdd}
          data-testid="kunstenaars-add"
          className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
        >
          {t('kunstenaarsToevoegen')}
        </button>
      </div>
      <DataTable<KunstenaarRow>
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        onRowClick={openEdit}
        emptyLabel={t('kunstenaarsEmpty')}
        searchPlaceholder={t('dataTableSearchPlaceholder')}
      />
      <Modal isOpen={modalState !== null} onClose={closeModal} closeLabel={t('modalClose')}>
        <div data-testid="kunstenaar-modal" className="flex flex-col gap-3 text-sm text-white/80">
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstenaarsLabelFoto')}
            <span
              onDragOver={handleFotoDragOver}
              onDragLeave={handleFotoDragLeave}
              onDrop={handleFotoDrop}
              data-testid="kunstenaar-modal-foto-dropzone"
              className={`flex flex-col items-center gap-2 rounded-sm border border-dashed px-3 py-4 text-center transition-colors ${
                isDraggingFoto ? 'border-silver bg-white/10' : 'border-white/20'
              }`}
            >
              <span className="text-xs normal-case tracking-normal text-white/60">
                {t('kunstenaarsFotoDropHint')}
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFotoChange}
                data-testid="kunstenaar-modal-foto-input"
                className="text-sm text-white"
              />
            </span>
          </label>
          {uploading && (
            <p data-testid="kunstenaar-modal-foto-uploading" className="text-xs text-white/60">
              {t('kunstenaarsFotoUploading')}
            </p>
          )}
          {fotoUploadError && (
            <p data-testid="kunstenaar-modal-foto-error" className="text-xs text-red-400">
              {t('kunstenaarsFotoUploadError')}
            </p>
          )}
          {foto && (
            <img
              src={foto}
              alt=""
              data-testid="kunstenaar-modal-foto-preview"
              className="h-24 w-24 rounded object-cover"
            />
          )}

          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstenaarsLabelNaam')}
            <input
              type="text"
              value={naam}
              onChange={(event) => setNaam(event.target.value)}
              data-testid="kunstenaar-modal-naam"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstenaarsLabelOmschrijvingNl')}
            <textarea
              value={omschrijvingNl}
              onChange={(event) => setOmschrijvingNl(event.target.value)}
              data-testid="kunstenaar-modal-omschrijving-nl"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstenaarsLabelOmschrijvingFr')}
            <textarea
              value={omschrijvingFr}
              onChange={(event) => setOmschrijvingFr(event.target.value)}
              data-testid="kunstenaar-modal-omschrijving-fr"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstenaarsLabelOmschrijvingDe')}
            <textarea
              value={omschrijvingDe}
              onChange={(event) => setOmschrijvingDe(event.target.value)}
              data-testid="kunstenaar-modal-omschrijving-de"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstenaarsLabelOmschrijvingEn')}
            <textarea
              value={omschrijvingEn}
              onChange={(event) => setOmschrijvingEn(event.target.value)}
              data-testid="kunstenaar-modal-omschrijving-en"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstenaarsLabelPrijsafspraken')}
            <textarea
              value={prijsafspraken}
              onChange={(event) => setPrijsafspraken(event.target.value)}
              data-testid="kunstenaar-modal-prijsafspraken"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstenaarsLabelVerkooprecht')}
            <select
              value={verkooprecht}
              onChange={(event) => setVerkooprecht(event.target.value as Kunstenaar['verkooprecht'])}
              data-testid="kunstenaar-modal-verkooprecht"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            >
              <option value="open">{t('kunstenaarsVerkooprechtOpen')}</option>
              <option value="alleen-kunstenaar">{t('kunstenaarsVerkooprechtAlleenKunstenaar')}</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstenaarsLabelKlant')}
            <Combobox
              options={(klanten ?? []).map((klant) => ({ value: klant.id, label: klant.companyName }))}
              value={klantId}
              onChange={setKlantId}
              placeholder={t('kunstenaarsKlantPlaceholder')}
              noResultsLabel={t('kunstenaarsKlantGeenResultaten')}
              clearLabel={t('kunstenaarsKlantGeen')}
              testId="kunstenaar-modal-klant"
            />
          </label>

          {actionError && (
            <p data-testid="kunstenaar-modal-error" className="text-xs text-red-400">
              {actionError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={opslaanDisabled}
              data-testid="kunstenaar-modal-opslaan"
              className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('kunstenaarsOpslaan')}
            </button>
            {modalState?.mode === 'edit' && (
              <button
                type="button"
                onClick={handleRemove}
                data-testid="kunstenaar-modal-verwijderen"
                className="rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('kunstenaarsVerwijderen')}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 4: Add the `kunstenaars` translation keys to `messages/nl.json`**

Find line 428 (`"kunstwerkenVerwijderen": "Verwijderen",`) and add immediately after it (before `"prijsgroepenLoadError"`):
```json
    "kunstenaarsLoadError": "Kon de kunstenaars niet laden. Probeer de pagina te verversen.",
    "kunstenaarsActionError": "Er is iets misgegaan. Probeer het opnieuw.",
    "kunstenaarsEmpty": "Geen kunstenaars gevonden.",
    "kunstenaarsColNaam": "Naam",
    "kunstenaarsColVerkooprecht": "Verkooprecht",
    "kunstenaarsColKlant": "Gekoppeld klantaccount",
    "kunstenaarsLabelFoto": "Portretfoto",
    "kunstenaarsFotoDropHint": "Sleep een foto hierheen of kies een bestand",
    "kunstenaarsFotoUploading": "Bezig met uploaden…",
    "kunstenaarsFotoUploadError": "De foto kon niet geüpload worden. Probeer het opnieuw.",
    "kunstenaarsLabelNaam": "Naam",
    "kunstenaarsLabelOmschrijvingNl": "Omschrijving (NL)",
    "kunstenaarsLabelOmschrijvingFr": "Omschrijving (FR)",
    "kunstenaarsLabelOmschrijvingDe": "Omschrijving (DE)",
    "kunstenaarsLabelOmschrijvingEn": "Omschrijving (EN)",
    "kunstenaarsLabelPrijsafspraken": "Prijsafspraken (intern)",
    "kunstenaarsLabelVerkooprecht": "Verkooprecht",
    "kunstenaarsVerkooprechtOpen": "Open voor alle klanten",
    "kunstenaarsVerkooprechtAlleenKunstenaar": "Alleen de kunstenaar zelf",
    "kunstenaarsLabelKlant": "Gekoppeld klantaccount",
    "kunstenaarsKlantPlaceholder": "Zoek een klant…",
    "kunstenaarsKlantGeenResultaten": "Geen klanten gevonden",
    "kunstenaarsKlantGeen": "Geen koppeling",
    "kunstenaarsToevoegen": "Kunstenaar toevoegen",
    "kunstenaarsOpslaan": "Opslaan",
    "kunstenaarsVerwijderen": "Verwijderen",
    "navKunstenaars": "Kunstenaars",
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- KunstenaarsSection`
Expected: PASS

- [ ] **Step 6: Write the failing test additions in `BeheerNav.test.tsx`**

In `defaultCounts`, add `kunstenaarsCount: 8,` after `kunstwerkenCount: 36,`. In the `<BeheerNav>` render call, add `kunstenaarsCount={counts.kunstenaarsCount}` after `kunstwerkenCount={counts.kunstwerkenCount}`. In the first test (`'renders the 10 active items...'`), rename it to `'renders the 11 active items with their counters, and no disabled placeholder items'` and add after the `kunstwerken` assertions:
```tsx
    expect(screen.getByTestId('beheer-nav-kunstenaars')).toHaveTextContent('Kunstenaars');
    expect(screen.getByTestId('beheer-nav-kunstenaars')).toHaveTextContent('8');
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npm test -- BeheerNav`
Expected: FAIL — `kunstenaarsCount` prop doesn't exist on `BeheerNavProps` (TS error) / `beheer-nav-kunstenaars` not found.

- [ ] **Step 8: Extend `BeheerNav.tsx`**

Change the `BeheerSection` union:
```ts
export type BeheerSection =
  | 'klanten'
  | 'bestellingen'
  | 'materiaalsoorten'
  | 'materialen'
  | 'maten'
  | 'segmenten'
  | 'kunstwerken'
  | 'prijsgroepen'
  | 'activiteit'
  | 'glassartDesign';
```
to (insert `'kunstenaars'` after `'kunstwerken'`):
```ts
export type BeheerSection =
  | 'klanten'
  | 'bestellingen'
  | 'materiaalsoorten'
  | 'materialen'
  | 'maten'
  | 'segmenten'
  | 'kunstwerken'
  | 'kunstenaars'
  | 'prijsgroepen'
  | 'activiteit'
  | 'glassartDesign';
```

In `BeheerNavProps`, add `kunstenaarsCount: number;` after `kunstwerkenCount: number;`. In the function's destructured params, add `kunstenaarsCount,` after `kunstwerkenCount,`.

In `ACTIVE_ITEMS`, change:
```ts
  { id: 'kunstwerken', labelKey: 'navKunstwerken' },
  { id: 'prijsgroepen', labelKey: 'navPrijsgroepen' },
```
to:
```ts
  { id: 'kunstwerken', labelKey: 'navKunstwerken' },
  { id: 'kunstenaars', labelKey: 'navKunstenaars' },
  { id: 'prijsgroepen', labelKey: 'navPrijsgroepen' },
```

In the `counts` map inside the component body, change:
```ts
    kunstwerken: kunstwerkenCount,
    prijsgroepen: prijsgroepenCount,
```
to:
```ts
    kunstwerken: kunstwerkenCount,
    kunstenaars: kunstenaarsCount,
    prijsgroepen: prijsgroepenCount,
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npm test -- BeheerNav`
Expected: PASS

- [ ] **Step 10: Write the failing test addition in `BeheerShell.test.tsx`**

Add `kunstenaars: [],` to `DEFAULT_COLLECTIONS` (after `kunstwerken: [...]`). Add this new test after the `'...switches to the Prijsgroepen section'` test:
```tsx
  it('shows the count and switches to the Kunstenaars section', async () => {
    mockCollections({
      kunstenaars: [
        { id: 'ka-1', data: { naam: 'Sabrina Glasser', foto: null, omschrijvingNl: 'Werkt met glas.', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '', prijsafspraken: '', verkooprecht: 'open', klantId: null, exclusiefVoorKlantId: null } },
      ],
    });
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-kunstenaars')).toHaveTextContent('1'));
    screen.getByTestId('beheer-nav-kunstenaars').click();
    expect(await screen.findByTestId('kunstenaars-section')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-ka-1')).toHaveTextContent('Sabrina Glasser');
  });
```

- [ ] **Step 11: Run the test to verify it fails**

Run: `npm test -- BeheerShell`
Expected: FAIL — `beheer-nav-kunstenaars` badge shows nothing / `kunstenaars-section` never renders.

- [ ] **Step 12: Wire `KunstenaarsSection` into `BeheerShell.tsx`**

Add imports:
```ts
import { KunstenaarsSection } from './KunstenaarsSection';
import type { Kunstenaar } from './kunstenaarTypes';
```

After the existing:
```ts
  const prijsgroepen = useFirestoreCollection<Prijsgroep>('prijsgroepen');
```
add:
```ts
  const kunstenaars = useFirestoreCollection<Kunstenaar>('kunstenaars');
```

After:
```ts
  const prijsgroepenCount = (prijsgroepen.items ?? []).length;
```
add:
```ts
  const kunstenaarsCount = (kunstenaars.items ?? []).length;
```

Pass `kunstenaarsCount={kunstenaarsCount}` into `<BeheerNav ... prijsgroepenCount={prijsgroepenCount} .../>` (add it next to `kunstwerkenCount={kunstwerkenCount}`).

In the section-switch ternary chain, change:
```tsx
        ) : activeSection === 'prijsgroepen' ? (
```
to:
```tsx
        ) : activeSection === 'kunstenaars' ? (
          <KunstenaarsSection
            kunstenaars={kunstenaars.items}
            klanten={klanten}
            loadError={kunstenaars.error === 'load' ? t('kunstenaarsLoadError') : null}
            onAdd={kunstenaars.add}
            onUpdate={kunstenaars.update}
            onRemove={kunstenaars.remove}
          />
        ) : activeSection === 'prijsgroepen' ? (
```

- [ ] **Step 13: Run the test to verify it passes**

Run: `npm test -- BeheerShell BeheerNav KunstenaarsSection`
Expected: PASS

- [ ] **Step 14: Commit**

```bash
git add src/components/beheer/KunstenaarsSection.tsx src/components/beheer/BeheerNav.tsx src/components/beheer/BeheerShell.tsx messages/nl.json tests/components/beheer/KunstenaarsSection.test.tsx tests/components/beheer/BeheerNav.test.tsx tests/components/beheer/BeheerShell.test.tsx
git commit -m "feat: add Kunstenaars beheer section (CRUD, photo upload, klant link)"
```

---

### Task 4: Replace `Kunstwerk.artiest` with `Kunstwerk.kunstenaarId`

This touches the `Kunstwerk` type, the admin Kunstwerk form, the public product grid, the seed data, the Kunstenaar delete-guard, and every test fixture that builds a `Kunstwerk` object literal (TypeScript's excess/missing-property checking means every one of these must be updated in the same commit or the suite fails to compile).

**Files:**
- Modify: `src/components/beheer/materiaalTypes.ts`
- Modify: `src/components/beheer/KunstwerkenSection.tsx`
- Modify: `src/components/beheer/KunstenaarsSection.tsx` (delete-guard)
- Modify: `src/components/beheer/BeheerShell.tsx`
- Modify: `src/components/ProductsGrid.tsx`
- Modify: `src/data/kunstwerkenSeed.ts`
- Modify: `messages/nl.json`
- Modify (fixtures): `tests/components/beheer/KunstwerkenSection.test.tsx`, `tests/components/ProductModal.test.tsx`, `tests/lib/resolveKunstwerkOmschrijving.test.ts`, `tests/components/account/AccountOrderModal.test.tsx`, `tests/components/beheer/BestellingenSection.test.tsx`, `tests/components/beheer/BestellingModal.test.tsx`, `tests/components/beheer/MatenSection.test.tsx`, `tests/components/beheer/MaterialenSection.test.tsx`
- Test: `tests/components/beheer/KunstenaarsSection.test.tsx` (add delete-guard test)

**Interfaces:**
- Consumes: `Kunstenaar` from Task 1.
- Produces: `Kunstwerk.kunstenaarId: string | null` (replaces `artiest: string`), consumed by Task 6 (Collecties filter) and Task 7 (order-right enforcement). `KunstwerkenSection` gains a `kunstenaars: Kunstenaar[] | null` prop. `KunstenaarsSection` gains a `kunstwerken: Kunstwerk[] | null` prop (delete-guard only, not persisted).

- [ ] **Step 1: Update the `Kunstwerk` interface in `src/components/beheer/materiaalTypes.ts`**

Change:
```ts
export interface Kunstwerk {
  id: string;
  foto: string;
  naam: string;
  artiest: string;
  segmentIds: string[];
```
to:
```ts
export interface Kunstwerk {
  id: string;
  foto: string;
  naam: string;
  kunstenaarId: string | null;
  segmentIds: string[];
```

- [ ] **Step 2: Update every test fixture that builds a `Kunstwerk` literal**

In each of the following files, change the line `artiest: '',` to `kunstenaarId: null,` (same indentation, same position in the object literal):
- `tests/lib/resolveKunstwerkOmschrijving.test.ts` (line 9)
- `tests/components/account/AccountOrderModal.test.tsx` (line 14)
- `tests/components/beheer/BestellingenSection.test.tsx` (line 36)
- `tests/components/ProductModal.test.tsx` (line 42)
- `tests/components/beheer/BestellingModal.test.tsx` (line 42)
- `tests/components/beheer/MatenSection.test.tsx` (line 27)
- `tests/components/beheer/MaterialenSection.test.tsx` (line 27)

In `tests/components/beheer/KunstwerkenSection.test.tsx`:
- Line 47 (the `KUNSTWERKEN` fixture): change `artiest: '',` to `kunstenaarId: null,`.
- This file's other two `artiest:` occurrences (lines 174, 204) are inside test bodies that exercise the artiest text input directly — these are rewritten in Step 6 below, not simply renamed.

- [ ] **Step 3: Run the fixture-only tests to verify the interface change compiles cleanly elsewhere**

Run: `npm test -- resolveKunstwerkOmschrijving AccountOrderModal BestellingenSection BestellingModal MatenSection MaterialenSection`
Expected: PASS (these files don't touch `artiest` UI, only the fixture shape)

- [ ] **Step 4: Update `src/data/kunstwerkenSeed.ts`**

Change (line 114):
```ts
      artiest: '',
```
to:
```ts
      kunstenaarId: null,
```

- [ ] **Step 5: Update `messages/nl.json`**

Remove the two lines:
```json
    "kunstwerkenColArtiest": "Artiest",
```
and
```json
    "kunstwerkenLabelArtiest": "Artiest",
```
Add, in their place (same positions, i.e. right after `kunstwerkenColNaam`/`kunstwerkenLabelNaam` respectively):
```json
    "kunstwerkenColKunstenaar": "Kunstenaar",
```
and
```json
    "kunstwerkenLabelKunstenaar": "Kunstenaar",
    "kunstwerkenKunstenaarGeen": "Geen kunstenaar gekoppeld",
```

- [ ] **Step 6: Rewrite the `KunstwerkenSection.test.tsx` tests that exercised the `artiest` text input**

In `renderSection`, add a `kunstenaars: []` default and thread a `kunstenaren` fixture. Add near the top-level fixtures (after `MATEN`):
```tsx
const KUNSTENAARS: Kunstenaar[] = [
  {
    id: 'ka-1',
    naam: 'Sabrina Glasser',
    foto: null,
    omschrijvingNl: 'Werkt met glas.',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    prijsafspraken: '',
    verkooprecht: 'open',
    klantId: null,
    exclusiefVoorKlantId: null,
  },
];
```
and import it: `import type { Kunstwerk, Segment, Materiaal, Maat } from '@/components/beheer/materiaalTypes';` becomes two imports:
```tsx
import type { Kunstwerk, Segment, Materiaal, Maat } from '@/components/beheer/materiaalTypes';
import type { Kunstenaar } from '@/components/beheer/kunstenaarTypes';
```
In `renderSection`, add `kunstenaars={KUNSTENAARS}` to the rendered `<KunstwerkenSection ... maten={MATEN} kunstenaars={KUNSTENAARS} loadError={null} .../>`.

Replace the test `'adds a new kunstwerk with the uploaded photo, selections, prices and NL description'` — change:
```tsx
    fireEvent.change(screen.getByTestId('kunstwerk-modal-artiest'), { target: { value: 'Sabrina' } });
```
to:
```tsx
    fireEvent.change(screen.getByTestId('kunstwerk-modal-kunstenaar'), { target: { value: 'ka-1' } });
```
and change the expected `onAdd` payload:
```tsx
        artiest: 'Sabrina',
```
to:
```tsx
        kunstenaarId: 'ka-1',
```

Replace the test `'opens a row for editing pre-filled...'` — change the expected `onUpdate` payload:
```tsx
        artiest: '',
```
to:
```tsx
        kunstenaarId: null,
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npm test -- KunstwerkenSection`
Expected: FAIL — `kunstwerk-modal-kunstenaar` testid doesn't exist yet, `KunstwerkenSectionProps` has no `kunstenaars` field.

- [ ] **Step 8: Update `KunstwerkenSection.tsx`**

Add the import and prop:
```ts
import type { Kunstwerk, Segment, Materiaal, Materiaalsoort, Maat, PrijsRegel } from './materiaalTypes';
import type { Kunstenaar } from './kunstenaarTypes';
```
```ts
interface KunstwerkenSectionProps {
  kunstwerken: Kunstwerk[] | null;
  segmenten: Segment[] | null;
  materialen: Materiaal[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  maten: Maat[] | null;
  kunstenaars: Kunstenaar[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Kunstwerk, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Kunstwerk, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}
```
and destructure `kunstenaars` in the component signature alongside `maten`.

Replace `artiest` state and form handling. Change:
```ts
const LEGE_FORM = {
  foto: '',
  naam: '',
  artiest: '',
  segmentIds: [] as string[],
```
to:
```ts
const LEGE_FORM = {
  foto: '',
  naam: '',
  kunstenaarId: '' as string,
  segmentIds: [] as string[],
```
Change:
```ts
  const [artiest, setArtiest] = useState(LEGE_FORM.artiest);
```
to:
```ts
  const [kunstenaarId, setKunstenaarId] = useState(LEGE_FORM.kunstenaarId);
```
Change (in `resetForm`):
```ts
    setArtiest(LEGE_FORM.artiest);
```
to:
```ts
    setKunstenaarId(LEGE_FORM.kunstenaarId);
```
Change (in `openEdit`):
```ts
    setArtiest(kunstwerk.artiest ?? '');
```
to:
```ts
    setKunstenaarId(kunstwerk.kunstenaarId ?? '');
```
Change (in `handleSave`'s `data` object):
```ts
      artiest,
```
to:
```ts
      kunstenaarId: kunstenaarId || null,
```

Add a `kunstenaarNaamById` map next to the existing `segmentNaamById`/`materiaalsoortNaamById` memos:
```ts
  const kunstenaarNaamById = useMemo(() => {
    const map = new Map<string, string>();
    (kunstenaars ?? []).forEach((kunstenaar) => map.set(kunstenaar.id, kunstenaar.naam));
    return map;
  }, [kunstenaars]);
```

Change the row type and `rows` computation:
```ts
type KunstwerkRow = Kunstwerk & { segmentNamen: string };
```
to:
```ts
type KunstwerkRow = Kunstwerk & { segmentNamen: string; kunstenaarNaam: string };
```
```ts
  const rows: KunstwerkRow[] = kunstwerken.map((kunstwerk) => ({
    ...kunstwerk,
    segmentNamen: kunstwerk.segmentIds.map((id) => segmentNaamById.get(id) ?? id).join(', '),
  }));
```
to:
```ts
  const rows: KunstwerkRow[] = kunstwerken.map((kunstwerk) => ({
    ...kunstwerk,
    segmentNamen: kunstwerk.segmentIds.map((id) => segmentNaamById.get(id) ?? id).join(', '),
    kunstenaarNaam: kunstwerk.kunstenaarId ? kunstenaarNaamById.get(kunstwerk.kunstenaarId) ?? '' : '',
  }));
```

Change the column definition:
```ts
    { key: 'artiest', label: t('kunstwerkenColArtiest') },
```
to:
```ts
    { key: 'kunstenaarNaam', label: t('kunstwerkenColKunstenaar') },
```

Replace the artiest `<input>` in the modal JSX. Change:
```tsx
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstwerkenLabelArtiest')}
            <input
              type="text"
              value={artiest}
              onChange={(event) => setArtiest(event.target.value)}
              data-testid="kunstwerk-modal-artiest"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
```
to:
```tsx
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstwerkenLabelKunstenaar')}
            <select
              value={kunstenaarId}
              onChange={(event) => setKunstenaarId(event.target.value)}
              data-testid="kunstwerk-modal-kunstenaar"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            >
              <option value="">{t('kunstwerkenKunstenaarGeen')}</option>
              {(kunstenaars ?? []).map((kunstenaar) => (
                <option key={kunstenaar.id} value={kunstenaar.id}>
                  {kunstenaar.naam}
                </option>
              ))}
            </select>
          </label>
```

Finally, update the preview card call — change:
```tsx
                artiest={artiest}
```
to:
```tsx
                artiest={kunstenaarNaamById.get(kunstenaarId) ?? ''}
```

- [ ] **Step 9: Add the delete-guard to `KunstenaarsSection.tsx`**

Add a `kunstwerken: Kunstwerk[] | null` prop:
```ts
import type { Kunstwerk } from './materiaalTypes';
```
```ts
interface KunstenaarsSectionProps {
  kunstenaars: Kunstenaar[] | null;
  klanten: Klant[] | null;
  kunstwerken: Kunstwerk[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Kunstenaar, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Kunstenaar, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}
```
and destructure `kunstwerken` in the component signature. Change `handleRemove`:
```ts
  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const success = await onRemove(modalState.kunstenaar.id);
```
to:
```ts
  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const inUse = (kunstwerken ?? []).some((kunstwerk) => kunstwerk.kunstenaarId === modalState.kunstenaar.id);
    if (inUse) {
      setActionError(t('kunstenaarsVerwijderBlocked'));
      return;
    }
    const success = await onRemove(modalState.kunstenaar.id);
```

Add the translation key to `messages/nl.json` (next to the other `kunstenaars...` keys added in Task 3):
```json
    "kunstenaarsVerwijderBlocked": "Deze kunstenaar is nog aan een kunstwerk gekoppeld en kan niet verwijderd worden.",
```

Add this test to `tests/components/beheer/KunstenaarsSection.test.tsx` (and add `kunstwerken: []` to the default props passed by `renderSection`, plus a `Kunstwerk` import):
```tsx
  it('blocks deleting a kunstenaar that is still linked to a kunstwerk', async () => {
    const { onRemove } = renderSection({
      kunstwerken: [{ id: 'kw-1', kunstenaarId: 'ka-1' } as never],
    });
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-verwijderen'));
    expect(await screen.findByTestId('kunstenaar-modal-error')).toHaveTextContent(
      'Deze kunstenaar is nog aan een kunstwerk gekoppeld en kan niet verwijderd worden.'
    );
    expect(onRemove).not.toHaveBeenCalled();
  });
```

- [ ] **Step 10: Wire the new props through `BeheerShell.tsx`**

Change the `<KunstwerkenSection>` call to add `kunstenaars={kunstenaars.items}` (next to `maten={maten.items}`), and the `<KunstenaarsSection>` call to add `kunstwerken={kunstwerken.items}` (next to `klanten={klanten}`).

- [ ] **Step 11: Update `ProductsGrid.tsx` to resolve the artist name from `kunstenaarId`**

Add the import and hook call:
```ts
import type { Segment, Kunstwerk, Materiaal, Maat, Materiaalsoort } from './beheer/materiaalTypes';
import type { Kunstenaar } from './beheer/kunstenaarTypes';
```
```ts
  const kunstenaars = useFirestoreCollection<Kunstenaar>('kunstenaars');
```
(placed next to the existing `materiaalsoorten` hook call).

Add a name-lookup map next to `materiaalsoortNaamById`:
```ts
  const kunstenaarNaamById = new Map((kunstenaars.items ?? []).map((kunstenaar) => [kunstenaar.id, kunstenaar.naam]));
```

Change:
```tsx
                artiest={kunstwerk.artiest}
```
to:
```tsx
                artiest={kunstwerk.kunstenaarId ? kunstenaarNaamById.get(kunstwerk.kunstenaarId) ?? '' : ''}
```

- [ ] **Step 12: Run the full suite to verify everything compiles and passes**

Run: `npm test`
Expected: PASS (all files)

- [ ] **Step 13: Commit**

```bash
git add src/components/beheer/materiaalTypes.ts src/components/beheer/KunstwerkenSection.tsx src/components/beheer/KunstenaarsSection.tsx src/components/beheer/BeheerShell.tsx src/components/ProductsGrid.tsx src/data/kunstwerkenSeed.ts messages/nl.json tests/
git commit -m "feat: replace Kunstwerk.artiest free text with a Kunstenaar link"
```

---

### Task 5: Klant exclusiviteit (`exclusieveKunstenaarIds`) with uniqueness guard and denormalized sync

**Files:**
- Modify: `src/components/beheer/KlantenSection.tsx`
- Modify: `src/components/beheer/KlantModal.tsx`
- Modify: `src/components/beheer/BeheerShell.tsx`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/KlantModal.test.tsx`
- Test: `tests/components/beheer/KlantenSection.test.tsx`

**Interfaces:**
- Consumes: `Kunstenaar` from Task 1, `kunstenaars.update` from `BeheerShell`'s `useFirestoreCollection<Kunstenaar>` (Task 3).
- Produces: `Klant.exclusieveKunstenaarIds: string[]`. `KlantModal` gains props `kunstenaars: Kunstenaar[] | null` and `onKunstenaarUpdated: (id: string, data: Partial<Omit<Kunstenaar, 'id'>>) => Promise<boolean>`, threaded through `KlantenSection`.

- [ ] **Step 1: Update the `Klant` interface in `KlantenSection.tsx`**

Change:
```ts
export interface Klant {
  id: string;
  companyName: string;
  kvk: string;
  contactPerson: string;
  email: string;
  phone: string;
  contactPreference: string;
  address: string;
  postcode: string;
  city: string;
  status: 'Beoordelen' | 'Goedgekeurd' | 'Afgewezen';
  prijsgroepId: string | null;
}
```
to:
```ts
export interface Klant {
  id: string;
  companyName: string;
  kvk: string;
  contactPerson: string;
  email: string;
  phone: string;
  contactPreference: string;
  address: string;
  postcode: string;
  city: string;
  status: 'Beoordelen' | 'Goedgekeurd' | 'Afgewezen';
  prijsgroepId: string | null;
  exclusieveKunstenaarIds: string[];
}
```

Thread new props through `KlantenSectionProps` and the `<KlantModal>` call:
```ts
import type { Kunstenaar } from './kunstenaarTypes';

interface KlantenSectionProps {
  klanten: Klant[] | null;
  prijsgroepen: Prijsgroep[] | null;
  kunstenaars: Kunstenaar[] | null;
  loadError: string | null;
  onKlantUpdated: (klant: Klant) => void;
  onKunstenaarUpdated: (id: string, data: Partial<Omit<Kunstenaar, 'id'>>) => Promise<boolean>;
}
```
destructure `kunstenaars` and `onKunstenaarUpdated` in the component signature, and pass them into `<KlantModal klant={selectedKlant} prijsgroepen={prijsgroepen} kunstenaars={kunstenaars} onKunstenaarUpdated={onKunstenaarUpdated} .../>`.

- [ ] **Step 2: Write the failing test additions in `KlantModal.test.tsx`**

Add `exclusieveKunstenaarIds: []` to the `KLANT` fixture. Add a `KUNSTENAARS` fixture and an `onKunstenaarUpdated` mock, and update `renderModal` to accept and pass them:
```tsx
import type { Kunstenaar } from '@/components/beheer/kunstenaarTypes';

const KUNSTENAARS: Kunstenaar[] = [
  {
    id: 'ka-1',
    naam: 'Sabrina Glasser',
    foto: null,
    omschrijvingNl: 'Werkt met glas.',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    prijsafspraken: '',
    verkooprecht: 'open',
    klantId: null,
    exclusiefVoorKlantId: null,
  },
  {
    id: 'ka-2',
    naam: 'Bram Steen',
    foto: null,
    omschrijvingNl: 'Werkt met steen.',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    prijsafspraken: '',
    verkooprecht: 'open',
    klantId: null,
    exclusiefVoorKlantId: 'uid-2',
  },
];

function renderModal(
  klant: Klant | null,
  prijsgroepen: Prijsgroep[] | null = PRIJSGROEPEN,
  kunstenaars: Kunstenaar[] | null = KUNSTENAARS
) {
  const onClose = vi.fn();
  const onUpdated = vi.fn();
  const onKunstenaarUpdated = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <KlantModal
        klant={klant}
        prijsgroepen={prijsgroepen}
        kunstenaars={kunstenaars}
        onKunstenaarUpdated={onKunstenaarUpdated}
        onClose={onClose}
        onUpdated={onUpdated}
      />
    </NextIntlClientProvider>
  );
  return { onClose, onUpdated, onKunstenaarUpdated };
}
```

Add `exclusieveKunstenaarIds: []` to the `KLANT` object literal (after `prijsgroepId: null,`).

Add these tests to the `describe('KlantModal', ...)` block:
```tsx
  it('toggles a kunstenaar checkbox on and saves exclusieveKunstenaarIds, updating the kunstenaar back-pointer', async () => {
    const { onUpdated, onKunstenaarUpdated } = renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-exclusief-ka-1'));
    fireEvent.click(screen.getByTestId('klant-modal-exclusiviteit-opslaan'));
    await waitFor(() => expect(updateDocMock).toHaveBeenCalledWith(expect.anything(), { exclusieveKunstenaarIds: ['ka-1'] }));
    await waitFor(() => expect(onKunstenaarUpdated).toHaveBeenCalledWith('ka-1', { exclusiefVoorKlantId: 'uid-1' }));
    expect(onUpdated).toHaveBeenCalledWith({ ...KLANT, exclusieveKunstenaarIds: ['ka-1'] });
    expect(logActiviteitMock).toHaveBeenCalledWith('klant_exclusiviteit_gewijzigd', {
      id: 'staff-1',
      email: 'paul@glassartanddesign.com',
      naam: 'paul@glassartanddesign.com',
    });
  });

  it('blocks checking a kunstenaar that another klant already holds exclusively', () => {
    renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-exclusief-ka-2'));
    expect(screen.getByTestId('klant-modal-error')).toHaveTextContent(
      'Deze kunstenaar is al exclusief toegewezen aan een andere klant.'
    );
    expect(screen.getByTestId('klant-modal-exclusief-ka-2')).not.toBeChecked();
  });

  it('allows unchecking a kunstenaar this klant already holds exclusively, clearing the back-pointer on save', async () => {
    const { onKunstenaarUpdated } = renderModal({ ...KLANT, exclusieveKunstenaarIds: ['ka-2'] }, PRIJSGROEPEN, [
      { ...KUNSTENAARS[1], exclusiefVoorKlantId: 'uid-1' },
    ]);
    fireEvent.click(screen.getByTestId('klant-modal-exclusief-ka-2'));
    fireEvent.click(screen.getByTestId('klant-modal-exclusiviteit-opslaan'));
    await waitFor(() => expect(onKunstenaarUpdated).toHaveBeenCalledWith('ka-2', { exclusiefVoorKlantId: null }));
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- KlantModal`
Expected: FAIL — `klant-modal-exclusief-ka-1` and `klant-modal-exclusiviteit-opslaan` testids don't exist, `KlantModal` doesn't accept `kunstenaars`/`onKunstenaarUpdated` props.

- [ ] **Step 4: Implement the exclusiviteit UI and logic in `KlantModal.tsx`**

Add imports:
```ts
import type { Kunstenaar } from './kunstenaarTypes';
```

Add to `KlantModalProps`:
```ts
interface KlantModalProps {
  klant: Klant | null;
  prijsgroepen: Prijsgroep[] | null;
  kunstenaars: Kunstenaar[] | null;
  onClose: () => void;
  onUpdated: (klant: Klant) => void;
  onKunstenaarUpdated: (id: string, data: Partial<Omit<Kunstenaar, 'id'>>) => Promise<boolean>;
}
```
and destructure `kunstenaars`, `onKunstenaarUpdated` in the function signature (`export function KlantModal({ klant, prijsgroepen, kunstenaars, onClose, onUpdated, onKunstenaarUpdated }: KlantModalProps) {`).

Add state and keep it in sync with the loaded klant. Change:
```ts
  const [prijsgroepId, setPrijsgroepId] = useState('');
  const [fields, setFields] = useState<EditableFields | null>(null);
```
to:
```ts
  const [prijsgroepId, setPrijsgroepId] = useState('');
  const [exclusieveKunstenaarIds, setExclusieveKunstenaarIds] = useState<string[]>([]);
  const [fields, setFields] = useState<EditableFields | null>(null);
```
and in the `useEffect`, add `setExclusieveKunstenaarIds(klant.exclusieveKunstenaarIds);` next to `setPrijsgroepId(klant.prijsgroepId ?? '');`.

Add a local toggle helper and the two handlers, placed after `handleOpslaanPrijsgroep`:
```ts
  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  function toggleExclusiviteit(kunstenaarId: string) {
    const kunstenaar = (kunstenaars ?? []).find((item) => item.id === kunstenaarId);
    const isChecked = exclusieveKunstenaarIds.includes(kunstenaarId);
    if (!isChecked && kunstenaar?.exclusiefVoorKlantId && kunstenaar.exclusiefVoorKlantId !== klant?.id) {
      setError(t('klantenExclusiviteitBlocked'));
      return;
    }
    setError(null);
    setExclusieveKunstenaarIds((current) => toggle(current, kunstenaarId));
  }

  async function handleOpslaanExclusiviteit() {
    if (!klant) return;
    try {
      await updateDoc(doc(db, 'klanten', klant.id), { exclusieveKunstenaarIds });
      const added = exclusieveKunstenaarIds.filter((id) => !klant.exclusieveKunstenaarIds.includes(id));
      const removed = klant.exclusieveKunstenaarIds.filter((id) => !exclusieveKunstenaarIds.includes(id));
      for (const id of added) {
        await onKunstenaarUpdated(id, { exclusiefVoorKlantId: klant.id });
      }
      for (const id of removed) {
        await onKunstenaarUpdated(id, { exclusiefVoorKlantId: null });
      }
      void logActiviteit('klant_exclusiviteit_gewijzigd', actorFromMedewerker(user));
      onUpdated({ ...klant, exclusieveKunstenaarIds });
    } catch {
      setError(t('klantenActionError'));
    }
  }
```

Add the fieldset and save button in the JSX, right after the existing prijsgroep `<div className="flex items-end gap-2">...</div>` block and before the `{error && (...)}` block:
```tsx
          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs uppercase tracking-wide text-white/60">
              {t('klantenLabelExclusieveKunstenaars')}
            </legend>
            {(kunstenaars ?? []).map((kunstenaar) => (
              <label key={kunstenaar.id} className="flex items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={exclusieveKunstenaarIds.includes(kunstenaar.id)}
                  onChange={() => toggleExclusiviteit(kunstenaar.id)}
                  data-testid={`klant-modal-exclusief-${kunstenaar.id}`}
                />
                {kunstenaar.naam}
              </label>
            ))}
          </fieldset>
          <button
            type="button"
            onClick={handleOpslaanExclusiviteit}
            data-testid="klant-modal-exclusiviteit-opslaan"
            className="w-fit rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
          >
            {t('klantenOpslaan')}
          </button>
```

- [ ] **Step 5: Add the translation keys to `messages/nl.json`**

Find line 323 (`"klantenLabelPrijsgroep": "Prijsgroep",`) and add immediately after it:
```json
    "klantenLabelExclusieveKunstenaars": "Exclusief recht op kunstenaars",
    "klantenExclusiviteitBlocked": "Deze kunstenaar is al exclusief toegewezen aan een andere klant.",
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- KlantModal`
Expected: PASS

- [ ] **Step 7: Update `KlantenSection.test.tsx` fixtures and wiring**

Add `exclusieveKunstenaarIds: []` to both `KLANTEN` fixture entries (after each `prijsgroepId` line). Change the `renderSection` helper:
```tsx
function renderSection(overrides: Partial<React.ComponentProps<typeof KlantenSection>> = {}) {
  const onKlantUpdated = vi.fn();
  const onKunstenaarUpdated = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <KlantenSection
        klanten={KLANTEN}
        prijsgroepen={PRIJSGROEPEN}
        kunstenaars={[]}
        loadError={null}
        onKlantUpdated={onKlantUpdated}
        onKunstenaarUpdated={onKunstenaarUpdated}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  return { onKlantUpdated, onKunstenaarUpdated };
}
```

- [ ] **Step 8: Wire the new data through `BeheerShell.tsx`**

In `loadKlanten`'s Firestore mapping, change:
```ts
              status: data.status,
              prijsgroepId: data.prijsgroepId,
            } as Klant;
```
to:
```ts
              status: data.status,
              prijsgroepId: data.prijsgroepId,
              exclusieveKunstenaarIds: data.exclusieveKunstenaarIds ?? [],
            } as Klant;
```

Change the `<KlantenSection>` call to add `kunstenaars={kunstenaars.items}` and `onKunstenaarUpdated={kunstenaars.update}` (next to `prijsgroepen={prijsgroepen.items}`).

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/components/beheer/KlantenSection.tsx src/components/beheer/KlantModal.tsx src/components/beheer/BeheerShell.tsx messages/nl.json tests/components/beheer/KlantModal.test.tsx tests/components/beheer/KlantenSection.test.tsx
git commit -m "feat: add klant exclusiviteit on kunstenaars with uniqueness guard"
```

---

### Task 6: Collecties kunstenaar filter (searchable dropdown + info banner)

**Files:**
- Create: `src/lib/resolveKunstenaarOmschrijving.ts`
- Test: `tests/lib/resolveKunstenaarOmschrijving.test.ts`
- Modify: `src/components/ProductsGrid.tsx`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json`
- Test: `tests/components/ProductsGrid.test.tsx`

**Interfaces:**
- Consumes: `Combobox` (Task 2), `kunstenaars` collection hook + `kunstenaarNaamById` already present in `ProductsGrid.tsx` from Task 4.
- Produces: `resolveKunstenaarOmschrijving(kunstenaar, locale): string` from `@/lib/resolveKunstenaarOmschrijving`.

- [ ] **Step 1: Write the failing test file `tests/lib/resolveKunstenaarOmschrijving.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { resolveKunstenaarOmschrijving } from '@/lib/resolveKunstenaarOmschrijving';
import type { Kunstenaar } from '@/components/beheer/kunstenaarTypes';

const BASE_KUNSTENAAR: Kunstenaar = {
  id: 'ka-1',
  naam: 'Sabrina Glasser',
  foto: null,
  omschrijvingNl: 'Nederlandse tekst',
  omschrijvingFr: 'Texte français',
  omschrijvingDe: 'Deutscher Text',
  omschrijvingEn: 'English text',
  prijsafspraken: '',
  verkooprecht: 'open',
  klantId: null,
  exclusiefVoorKlantId: null,
};

describe('resolveKunstenaarOmschrijving', () => {
  it('returns the Dutch description for locale "nl"', () => {
    expect(resolveKunstenaarOmschrijving(BASE_KUNSTENAAR, 'nl')).toBe('Nederlandse tekst');
  });

  it('returns the French description for locale "fr" when filled in', () => {
    expect(resolveKunstenaarOmschrijving(BASE_KUNSTENAAR, 'fr')).toBe('Texte français');
  });

  it('returns the German description for locale "de" when filled in', () => {
    expect(resolveKunstenaarOmschrijving(BASE_KUNSTENAAR, 'de')).toBe('Deutscher Text');
  });

  it('returns the English description for locale "en" when filled in', () => {
    expect(resolveKunstenaarOmschrijving(BASE_KUNSTENAAR, 'en')).toBe('English text');
  });

  it('falls back to Dutch when the French description is empty', () => {
    expect(resolveKunstenaarOmschrijving({ ...BASE_KUNSTENAAR, omschrijvingFr: '' }, 'fr')).toBe('Nederlandse tekst');
  });

  it('falls back to Dutch for an unrecognized locale', () => {
    expect(resolveKunstenaarOmschrijving(BASE_KUNSTENAAR, 'es')).toBe('Nederlandse tekst');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- resolveKunstenaarOmschrijving`
Expected: FAIL — `Cannot find module '@/lib/resolveKunstenaarOmschrijving'`

- [ ] **Step 3: Create `src/lib/resolveKunstenaarOmschrijving.ts`**

```ts
import type { Kunstenaar } from '@/components/beheer/kunstenaarTypes';

export function resolveKunstenaarOmschrijving(kunstenaar: Kunstenaar, locale: string): string {
  const byLocale: Record<string, string> = {
    fr: kunstenaar.omschrijvingFr,
    de: kunstenaar.omschrijvingDe,
    en: kunstenaar.omschrijvingEn,
  };
  return byLocale[locale] || kunstenaar.omschrijvingNl;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- resolveKunstenaarOmschrijving`
Expected: PASS

- [ ] **Step 5: Add the customer-facing translation keys to all four locale files**

In `messages/nl.json`, find line 32 (`"filterAll": "Alle"`) and change it to add a trailing comma plus the new keys:
```json
    "filterAll": "Alle",
    "kunstenaarFilterPlaceholder": "Zoek op kunstenaar…",
    "kunstenaarFilterClear": "Alle kunstenaars",
    "kunstenaarFilterNoResults": "Geen kunstenaars gevonden"
```

In `messages/en.json`, same line/position:
```json
    "filterAll": "All",
    "kunstenaarFilterPlaceholder": "Search by artist…",
    "kunstenaarFilterClear": "All artists",
    "kunstenaarFilterNoResults": "No artists found"
```

In `messages/de.json`, same line/position:
```json
    "filterAll": "Alle",
    "kunstenaarFilterPlaceholder": "Nach Künstler suchen…",
    "kunstenaarFilterClear": "Alle Künstler",
    "kunstenaarFilterNoResults": "Keine Künstler gefunden"
```

In `messages/fr.json`, same line/position:
```json
    "filterAll": "Tous",
    "kunstenaarFilterPlaceholder": "Rechercher par artiste…",
    "kunstenaarFilterClear": "Tous les artistes",
    "kunstenaarFilterNoResults": "Aucun artiste trouvé"
```

- [ ] **Step 6: Write the failing test additions in `ProductsGrid.test.tsx`**

Add a `KUNSTENAARS` fixture after the existing `MATEN` fixture (line 101):
```tsx
const KUNSTENAARS = [
  {
    id: 'ka-1',
    data: {
      naam: 'Sabrina Glasser',
      foto: null,
      omschrijvingNl: 'Werkt met gesmolten glas.',
      omschrijvingFr: '',
      omschrijvingDe: '',
      omschrijvingEn: '',
      prijsafspraken: '',
      verkooprecht: 'open',
      klantId: null,
      exclusiefVoorKlantId: null,
    },
  },
];
```
Register it in `mockCollections`. Change:
```tsx
function mockCollections() {
  const data: Record<string, Array<{ id: string; data: Record<string, unknown> }>> = {
    segmenten: SEGMENTEN,
    kunstwerken: KUNSTWERKEN,
    materialen: MATERIALEN,
    maten: MATEN,
  };
```
to:
```tsx
function mockCollections() {
  const data: Record<string, Array<{ id: string; data: Record<string, unknown> }>> = {
    segmenten: SEGMENTEN,
    kunstwerken: KUNSTWERKEN,
    materialen: MATERIALEN,
    maten: MATEN,
    kunstenaars: KUNSTENAARS,
  };
```
Add `kunstenaarId: 'ka-1'` to the `kw-1` entry's `data` object in `KUNSTWERKEN` (the other two entries keep no `kunstenaarId`, i.e. `undefined`, which `ProductsGrid`'s `kunstwerk.kunstenaarId ? ... : ''` already treats as "no artist").

Add this test to the `describe('ProductsGrid', ...)` block, reusing the existing `renderProductsGrid()` helper:
```tsx
  it('filters by kunstenaar and shows the artist info banner with their description', async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    fireEvent.focus(screen.getByTestId('kunstenaar-filter'));
    fireEvent.click(screen.getByTestId('kunstenaar-filter-option-ka-1'));
    expect(screen.getByTestId('kunstenaar-banner')).toHaveTextContent('Sabrina Glasser');
    expect(screen.getByTestId('kunstenaar-banner')).toHaveTextContent('Werkt met gesmolten glas.');
    expect(screen.getAllByTestId('product-card')).toHaveLength(1);
  });
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npm test -- ProductsGrid`
Expected: FAIL — `kunstenaar-filter` testid doesn't exist yet.

- [ ] **Step 8: Add the filter and banner to `ProductsGrid.tsx`**

Add imports:
```ts
import { Combobox } from './Combobox';
import { resolveKunstenaarOmschrijving } from '@/lib/resolveKunstenaarOmschrijving';
```

Add state next to `activeFilter`:
```ts
  const [kunstenaarFilter, setKunstenaarFilter] = useState<string | null>(null);
```

Change the `visibleKunstwerken` computation:
```ts
  const visibleKunstwerken =
    activeFilter === ALL_FILTER
      ? allKunstwerken
      : allKunstwerken.filter((kunstwerk) => kunstwerk.segmentIds.includes(activeFilter));
```
to:
```ts
  const bySegment =
    activeFilter === ALL_FILTER
      ? allKunstwerken
      : allKunstwerken.filter((kunstwerk) => kunstwerk.segmentIds.includes(activeFilter));
  const visibleKunstwerken =
    kunstenaarFilter === null ? bySegment : bySegment.filter((kunstwerk) => kunstwerk.kunstenaarId === kunstenaarFilter);
  const geselecteerdeKunstenaar = kunstenaarFilter
    ? (kunstenaars.items ?? []).find((kunstenaar) => kunstenaar.id === kunstenaarFilter) ?? null
    : null;
```

Add the Combobox and banner in the JSX, right after the segment-filter `<div>` block (the one containing `filter-all` and the segment buttons) and before the `<div data-testid="products-grid">`:
```tsx
      <div className="mx-auto mb-4 flex max-w-xs flex-col gap-2">
        <Combobox
          options={(kunstenaars.items ?? []).map((kunstenaar) => ({ value: kunstenaar.id, label: kunstenaar.naam }))}
          value={kunstenaarFilter}
          onChange={setKunstenaarFilter}
          placeholder={tCollections('kunstenaarFilterPlaceholder')}
          noResultsLabel={tCollections('kunstenaarFilterNoResults')}
          clearLabel={tCollections('kunstenaarFilterClear')}
          testId="kunstenaar-filter"
        />
      </div>
      {geselecteerdeKunstenaar && (
        <div
          data-testid="kunstenaar-banner"
          className="mx-auto mb-8 flex max-w-2xl items-center gap-4 rounded border border-white/10 p-4 text-left"
        >
          {geselecteerdeKunstenaar.foto && (
            <img
              src={geselecteerdeKunstenaar.foto}
              alt={geselecteerdeKunstenaar.naam}
              className="h-20 w-20 rounded-full object-cover"
            />
          )}
          <div>
            <p className="font-head text-sm font-semibold text-white">{geselecteerdeKunstenaar.naam}</p>
            <p className="text-xs text-white/70">{resolveKunstenaarOmschrijving(geselecteerdeKunstenaar, locale)}</p>
          </div>
        </div>
      )}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npm test -- ProductsGrid`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/lib/resolveKunstenaarOmschrijving.ts src/components/ProductsGrid.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json tests/lib/resolveKunstenaarOmschrijving.test.ts tests/components/ProductsGrid.test.tsx
git commit -m "feat: add kunstenaar filter and info banner to Collecties page"
```

---

### Task 7: Bestel-recht enforcement — UI layer (disable the confirm button + explain why)

**Files:**
- Modify: `src/lib/useCustomerAuth.tsx`
- Modify: `src/components/ProductModal.tsx`
- Modify: `src/components/ProductsGrid.tsx`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json`
- Test: `tests/components/ProductModal.test.tsx`

**Interfaces:**
- Consumes: `Kunstenaar` from Task 1, `resolveKunstenaarOmschrijving` unused here (not needed), `kunstenaars` data already loaded in `ProductsGrid.tsx` (Task 4/6).
- Produces: `CustomerUser.exclusieveKunstenaarIds: string[]`. `ProductModal` gains a `kunstenaars: Kunstenaar[] | null` prop.

- [ ] **Step 1: Extend `CustomerUser` in `useCustomerAuth.tsx`**

Change:
```ts
interface CustomerUser {
  uid: string;
  email: string | null;
  companyName: string | null;
  contactPerson: string | null;
}
```
to:
```ts
interface CustomerUser {
  uid: string;
  email: string | null;
  companyName: string | null;
  contactPerson: string | null;
  exclusieveKunstenaarIds: string[];
}
```

Change:
```ts
      const klantDoc = await getDoc(doc(db, 'klanten', firebaseUser.uid));
      const klantData = klantDoc.exists()
        ? (klantDoc.data() as { status?: string; companyName?: string; contactPerson?: string })
        : null;
      setUser({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        companyName: klantData?.companyName ?? null,
        contactPerson: klantData?.contactPerson ?? null,
      });
```
to:
```ts
      const klantDoc = await getDoc(doc(db, 'klanten', firebaseUser.uid));
      const klantData = klantDoc.exists()
        ? (klantDoc.data() as {
            status?: string;
            companyName?: string;
            contactPerson?: string;
            exclusieveKunstenaarIds?: string[];
          })
        : null;
      setUser({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        companyName: klantData?.companyName ?? null,
        contactPerson: klantData?.contactPerson ?? null,
        exclusieveKunstenaarIds: klantData?.exclusieveKunstenaarIds ?? [],
      });
```

- [ ] **Step 2: Write the failing test additions in `ProductModal.test.tsx`**

Change the `KUNSTWERK` fixture's `artiest: '',` to `kunstenaarId: null,` if not already done by Task 4 (it is — this file was covered in Task 4 Step 2). Add a `KUNSTENAARS` fixture and pass it to `renderModal`:
```tsx
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort } from '@/components/beheer/materiaalTypes';
import type { Kunstenaar } from '@/components/beheer/kunstenaarTypes';

const KUNSTENAARS: Kunstenaar[] = [
  {
    id: 'ka-open',
    naam: 'Open Artiest',
    foto: null,
    omschrijvingNl: '',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    prijsafspraken: '',
    verkooprecht: 'open',
    klantId: null,
    exclusiefVoorKlantId: null,
  },
  {
    id: 'ka-exclusief',
    naam: 'Exclusieve Artiest',
    foto: null,
    omschrijvingNl: '',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    prijsafspraken: '',
    verkooprecht: 'open',
    klantId: null,
    exclusiefVoorKlantId: 'ander-klant-uid',
  },
  {
    id: 'ka-alleen-zelf',
    naam: 'Solo Artiest',
    foto: null,
    omschrijvingNl: '',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    prijsafspraken: '',
    verkooprecht: 'alleen-kunstenaar',
    klantId: null,
    exclusiefVoorKlantId: null,
  },
];
```

Change `renderModal`'s signature and the `<ProductModal>` call to accept and pass `kunstenaars`:
```tsx
function renderModal(
  onClose: () => void = () => {},
  kunstwerk: Kunstwerk | null = KUNSTWERK,
  kunstenaars: Kunstenaar[] | null = KUNSTENAARS
) {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerAuthProvider>
        <CartProvider>
          <ProductModal
            kunstwerk={kunstwerk}
            materialen={MATERIALEN}
            maten={MATEN}
            materiaalsoorten={MATERIAALSOORTEN}
            kunstenaars={kunstenaars}
            onClose={onClose}
          />
        </CartProvider>
      </CustomerAuthProvider>
    </NextIntlClientProvider>
  );
}
```

Add these tests to the `describe('ProductModal', ...)` block. None of the three need a logged-in customer: `onAuthStateChangedMock` is never invoked, so `useCustomerAuth()`'s `user` stays `null` (`user?.uid` is `undefined`) throughout, which already exercises the "anonymous visitor" branch of the `canOrder` computation correctly for each case below.
```tsx
  it('disables the confirm button and explains why for a kunstwerk exclusive to another klant', () => {
    renderModal(() => {}, { ...KUNSTWERK, kunstenaarId: 'ka-exclusief' });
    expect(screen.getByTestId('product-modal-confirm')).toBeDisabled();
    expect(screen.getByTestId('product-modal-order-blocked')).toHaveTextContent(
      'Dit kunstwerk is exclusief voorbehouden aan een andere klant.'
    );
  });

  it('disables the confirm button and explains why for a kunstwerk that only the artist may order', () => {
    renderModal(() => {}, { ...KUNSTWERK, kunstenaarId: 'ka-alleen-zelf' });
    expect(screen.getByTestId('product-modal-confirm')).toBeDisabled();
    expect(screen.getByTestId('product-modal-order-blocked')).toHaveTextContent(
      'Dit kunstwerk kan alleen door de kunstenaar zelf besteld worden.'
    );
  });

  it('does not block ordering for a kunstwerk with no kunstenaar or an open one', () => {
    renderModal(() => {}, { ...KUNSTWERK, kunstenaarId: null });
    expect(screen.queryByTestId('product-modal-order-blocked')).not.toBeInTheDocument();
    renderModal(() => {}, { ...KUNSTWERK, kunstenaarId: 'ka-open' });
    expect(screen.queryByTestId('product-modal-order-blocked')).not.toBeInTheDocument();
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- ProductModal`
Expected: FAIL — `product-modal-order-blocked` testid doesn't exist; `ProductModal` doesn't accept a `kunstenaars` prop yet.

- [ ] **Step 4: Implement the enforcement in `ProductModal.tsx`**

Add the import and prop:
```ts
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort } from './beheer/materiaalTypes';
import type { Kunstenaar } from './beheer/kunstenaarTypes';
```
```ts
interface ProductModalProps {
  kunstwerk: Kunstwerk | null;
  materialen: Materiaal[] | null;
  maten: Maat[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  kunstenaars: Kunstenaar[] | null;
  onClose: () => void;
}

export function ProductModal({ kunstwerk, materialen, maten, materiaalsoorten, kunstenaars, onClose }: ProductModalProps) {
```

After the existing `if (!kunstwerk) { return null; }` guard, add the order-right computation:
```ts
  const kunstenaar = kunstwerk.kunstenaarId
    ? (kunstenaars ?? []).find((item) => item.id === kunstwerk.kunstenaarId) ?? null
    : null;
  const isOwnArtwork = kunstenaar?.klantId != null && kunstenaar.klantId === user?.uid;
  const isExclusiveToOther = kunstenaar?.exclusiefVoorKlantId != null && kunstenaar.exclusiefVoorKlantId !== user?.uid;
  const isArtistOnlyForOthers = kunstenaar?.verkooprecht === 'alleen-kunstenaar' && !isOwnArtwork;
  const canOrder = !kunstenaar || isOwnArtwork || (!isExclusiveToOther && !isArtistOnlyForOthers);
  const blockedReason: 'exclusive' | 'artistOnly' | null = canOrder ? null : isExclusiveToOther ? 'exclusive' : 'artistOnly';
```

Change the confirm button's `disabled` and add the message below it. Change:
```tsx
          <button
            type="button"
            data-testid="product-modal-confirm"
            onClick={handleConfirm}
            disabled={isConfirmed || !canConfirm}
```
to:
```tsx
          {blockedReason && (
            <p data-testid="product-modal-order-blocked" className="text-xs text-amber-400">
              {blockedReason === 'exclusive' ? t('orderBlockedExclusive') : t('orderBlockedArtistOnly')}
            </p>
          )}
          <button
            type="button"
            data-testid="product-modal-confirm"
            onClick={handleConfirm}
            disabled={isConfirmed || !canConfirm || !canOrder}
```

- [ ] **Step 5: Add the translation keys to all four locale files**

Find line 87 (`"customSizeNote": "..."`) in each of `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json` and add a trailing comma plus the two new keys.

`messages/nl.json`:
```json
    "customSizeNote": "{count, plural, one {+ # artikel, prijs volgt na offerte} other {+ # artikelen, prijs volgt na offerte}}",
    "orderBlockedExclusive": "Dit kunstwerk is exclusief voorbehouden aan een andere klant.",
    "orderBlockedArtistOnly": "Dit kunstwerk kan alleen door de kunstenaar zelf besteld worden."
```

`messages/en.json`:
```json
    "customSizeNote": "{count, plural, one {+ # item, price to follow after quote} other {+ # items, price to follow after quote}}",
    "orderBlockedExclusive": "This artwork is exclusively reserved for another customer.",
    "orderBlockedArtistOnly": "This artwork can only be ordered by the artist themselves."
```

`messages/de.json`:
```json
    "customSizeNote": "{count, plural, one {+ # Artikel, Preis folgt nach Angebot} other {+ # Artikel, Preis folgt nach Angebot}}",
    "orderBlockedExclusive": "Dieses Kunstwerk ist exklusiv für einen anderen Kunden reserviert.",
    "orderBlockedArtistOnly": "Dieses Kunstwerk kann nur vom Künstler selbst bestellt werden."
```

`messages/fr.json`:
```json
    "customSizeNote": "{count, plural, one {+ # article, prix à confirmer après devis} other {+ # articles, prix à confirmer après devis}}",
    "orderBlockedExclusive": "Cette œuvre est exclusivement réservée à un autre client.",
    "orderBlockedArtistOnly": "Cette œuvre ne peut être commandée que par l'artiste lui-même."
```

- [ ] **Step 6: Pass `kunstenaars` from `ProductsGrid.tsx` into `ProductModal`**

Change:
```tsx
      <ProductModal
        kunstwerk={selectedKunstwerk}
        materialen={materialen.items}
        maten={maten.items}
        materiaalsoorten={materiaalsoorten.items}
        onClose={() => setSelectedKunstwerk(null)}
      />
```
to:
```tsx
      <ProductModal
        kunstwerk={selectedKunstwerk}
        materialen={materialen.items}
        maten={maten.items}
        materiaalsoorten={materiaalsoorten.items}
        kunstenaars={kunstenaars.items}
        onClose={() => setSelectedKunstwerk(null)}
      />
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test -- ProductModal`
Expected: PASS

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/useCustomerAuth.tsx src/components/ProductModal.tsx src/components/ProductsGrid.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json tests/components/ProductModal.test.tsx
git commit -m "feat: disable ordering in the UI for exclusive or artist-only kunstwerken"
```

---

### Task 8: Bestel-recht enforcement — Firestore rules layer (the real boundary) + deploy

**Files:**
- Modify: `firestore.rules`

**Interfaces:**
- Consumes: `kunstwerken/{id}.kunstenaarId`, `kunstenaars/{id}.verkooprecht/.exclusiefVoorKlantId/.klantId` (all from Task 1/4/5), read via `get()` inside the rules.

- [ ] **Step 1: Add the two helper functions and extend the `bestellines` create rule**

Add, right after `match /databases/{database}/documents {` (before `match /medewerkers/{uid} { ... }`):
```
    function magKunstwerkBestellen(kunstwerkId, klantUid) {
      let kw = get(/databases/$(database)/documents/kunstwerken/$(kunstwerkId)).data;
      return !('kunstenaarId' in kw) || kw.kunstenaarId == null ||
        magKunstenaarBestellen(kw.kunstenaarId, klantUid);
    }
    function magKunstenaarBestellen(kunstenaarId, klantUid) {
      let ka = get(/databases/$(database)/documents/kunstenaars/$(kunstenaarId)).data;
      return (ka.verkooprecht == 'open' && ka.exclusiefVoorKlantId == null) ||
        ka.exclusiefVoorKlantId == klantUid ||
        ka.klantId == klantUid;
    }
```

In the `bestellines` `allow create` rule, change:
```
        allow create: if request.auth != null &&
          request.auth.uid == get(/databases/$(database)/documents/bestelheaders/$(id)).data.klantId &&
          request.resource.data.keys().hasOnly(['kunstwerkId', 'maatId', 'materiaalId', 'breedte', 'hoogte', 'prijs', 'quantity']) &&
          request.resource.data.kunstwerkId is string && request.resource.data.kunstwerkId.size() > 0 &&
          request.resource.data.maatId is string &&
          request.resource.data.materiaalId is string && request.resource.data.materiaalId.size() > 0 &&
          (request.resource.data.prijs == null || (request.resource.data.prijs is number && request.resource.data.prijs > 0)) &&
          request.resource.data.quantity is int && request.resource.data.quantity > 0;
```
to:
```
        allow create: if request.auth != null &&
          request.auth.uid == get(/databases/$(database)/documents/bestelheaders/$(id)).data.klantId &&
          request.resource.data.keys().hasOnly(['kunstwerkId', 'maatId', 'materiaalId', 'breedte', 'hoogte', 'prijs', 'quantity']) &&
          request.resource.data.kunstwerkId is string && request.resource.data.kunstwerkId.size() > 0 &&
          request.resource.data.maatId is string &&
          request.resource.data.materiaalId is string && request.resource.data.materiaalId.size() > 0 &&
          (request.resource.data.prijs == null || (request.resource.data.prijs is number && request.resource.data.prijs > 0)) &&
          request.resource.data.quantity is int && request.resource.data.quantity > 0 &&
          magKunstwerkBestellen(request.resource.data.kunstwerkId, request.auth.uid);
```

- [ ] **Step 2: Deploy the rules**

Run: `npx --yes firebase-tools deploy --only firestore:rules`
Expected: deploy succeeds — this also validates that the `let`/function syntax compiles. A syntax error here means Step 1 has a typo (check function bracing and the `get()` paths).

- [ ] **Step 3: Manual smoke-check in the running app**

There is no automated Firestore-rules test harness in this repo (`@firebase/rules-unit-testing` is not a dependency, and adding one is out of scope for this feature). Verify manually against the deployed rules:
1. In beheer, create a Kunstenaar with `verkooprecht: 'alleen-kunstenaar'` and no `klantId`, and link it to a Kunstwerk.
2. Log in on the public site as a different, approved klant and open that Kunstwerk's `ProductModal` — confirm the button is disabled (Task 7) with the "alleen kunstenaar" message.
3. Using the browser devtools console (or a temporary raw `addDoc` call), attempt to write a `bestellines` document for that `kunstwerkId` directly, bypassing the UI — confirm Firestore rejects it with a `permission-denied` error, proving the rules layer (not just the UI) blocks it.
4. Repeat for a Kunstenaar with `exclusiefVoorKlantId` set to a different klant's uid.
5. Confirm ordering still works normally for a Kunstwerk with `kunstenaarId: null` and for one linked to an `'open'`, non-exclusive Kunstenaar.

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "feat: enforce kunstenaar order rights in Firestore security rules"
```

---

## Final verification

- [ ] Run the full test suite once more end-to-end: `npm test` — expect all tests passing.
- [ ] Run `npm run build` to confirm the static export still compiles with the new `Kunstenaar` type and all touched components.
- [ ] Manually walk the beheer flow: add a Kunstenaar with a photo → link a Kunstwerk to it → set exclusiviteit on a Klant → confirm the Collecties page filter, banner, and order-blocking all reflect it.
