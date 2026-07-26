# Minimale afname Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global "minimale afname" (minimum order quantity) setting, overridable per klant, enforced in the bestel-popup with a prefilled, editable, validated quantity field.

**Architecture:** A new `instellingen/bestelinstellingen` Firestore document (read/written via the existing `useFirestoreDocument` hook, same pattern as `bedrijfsgegevens`) holds the global value. `Klant` gains an optional `minimaleAfname` override field, edited in `KlantModal` via its own mini-form (same pattern as `prijsgroepId`). `ProductModal` computes `effectiveMinimum = klant override ?? global setting ?? 1`, prefills the quantity field with it, and blocks confirmation until the typed quantity meets it. All enforcement is client-side only (no Firestore rules changes).

**Tech Stack:** Next.js (App Router), React, TypeScript, Firebase Firestore, next-intl, Vitest + Testing Library.

## Global Constraints

- Minimale afname geldt **per bestelregel** (per kunstwerk in de popup), niet als optelsom over de hele bestelling.
- Alleen client-side enforcement — geen wijziging aan `firestore.rules`.
- `beheer`-namespace vertalingen bestaan alleen in `messages/nl.json` (beheer-UI is Nederlandstalig); de klant-facing `cart`-namespace sleutel moet in alle 4 locale-bestanden (`nl`, `en`, `fr`, `de`).
- Klant-override-veld in `KlantModal` is altijd zichtbaar, ongeacht klantstatus (in tegenstelling tot `prijsgroepId`).
- Volg bestaande patronen exact: `useFirestoreDocument` voor het instellingen-document, `updateDoc` + eigen opslaan-knop voor de klant-override (zoals `prijsgroepId`).

---

## Task 1: Datamodel & activiteitenlog

**Files:**
- Create: `src/components/beheer/bestelinstellingenTypes.ts`
- Create: `src/data/bestelinstellingenSeed.ts`
- Modify: `src/components/beheer/KlantenSection.tsx` (the `Klant` interface, lines 9-22)
- Modify: `src/lib/useCustomerAuth.tsx`
- Modify: `src/lib/logActiviteit.ts` (the `ActiviteitType` union, lines 4-38)
- Modify: `src/components/beheer/ActiviteitSection.tsx` (the `TYPE_LABEL_KEYS` map, lines 29-64)
- Modify: `messages/nl.json` (add 2 activiteit type labels to the `beheer` namespace)
- Test: `tests/lib/useCustomerAuth.test.tsx`
- Test: `tests/components/beheer/ActiviteitSection.test.tsx`

**Interfaces:**
- Produces: `Bestelinstellingen { minimaleAfname: number }` and `BESTELINSTELLINGEN_SEED: Bestelinstellingen` (used by Task 2's `InstellingenSection`/`BeheerShell`, and Task 4's `ProductModal`).
- Produces: `Klant.minimaleAfname?: number | null` (used by Task 3's `KlantModal`/`BeheerShell`).
- Produces: `CustomerUser.minimaleAfname: number | null` (used by Task 4's `ProductModal`).
- Produces: `ActiviteitType` members `'bestelinstellingen_gewijzigd'` and `'klant_minimale_afname_gewijzigd'` (used by Task 2 and Task 3's save handlers).

- [ ] **Step 1: Create the `Bestelinstellingen` type and seed**

`src/components/beheer/bestelinstellingenTypes.ts`:
```ts
export interface Bestelinstellingen {
  minimaleAfname: number;
}
```

`src/data/bestelinstellingenSeed.ts`:
```ts
import type { Bestelinstellingen } from '@/components/beheer/bestelinstellingenTypes';

export const BESTELINSTELLINGEN_SEED: Bestelinstellingen = {
  minimaleAfname: 1,
};
```

- [ ] **Step 2: Add `minimaleAfname` to the `Klant` interface**

In `src/components/beheer/KlantenSection.tsx`, extend the interface (around line 9-22):
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
  minimaleAfname?: number | null;
}
```

- [ ] **Step 3: Write the failing test for `useCustomerAuth` exposing `minimaleAfname`**

In `tests/lib/useCustomerAuth.test.tsx`, add a new `data-testid` to `TestConsumer` (around line 24-35):
```tsx
function TestConsumer() {
  const { user, isCustomer, isHydrated } = useCustomerAuth();
  if (!isHydrated) return <div data-testid="loading" />;
  return (
    <div>
      <div data-testid="user">{user ? user.email : 'none'}</div>
      <div data-testid="is-customer">{String(isCustomer)}</div>
      <div data-testid="company-name">{user?.companyName ?? 'none'}</div>
      <div data-testid="contact-person">{user?.contactPerson ?? 'none'}</div>
      <div data-testid="minimale-afname">{user?.minimaleAfname ?? 'none'}</div>
    </div>
  );
}
```

Add a new test at the end of the `describe('useCustomerAuth')` block:
```tsx
  it('exposes minimaleAfname from the klanten document', async () => {
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({ status: 'Goedgekeurd', minimaleAfname: 5 }),
    });
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-6', email: 'klant6@example.com' });
      return () => {};
    });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('minimale-afname')).toHaveTextContent('5'));
  });

  it('exposes null minimaleAfname when the klanten document has no override', async () => {
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({ status: 'Goedgekeurd' }),
    });
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-7', email: 'klant7@example.com' });
      return () => {};
    });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('klant7@example.com'));
    expect(screen.getByTestId('minimale-afname')).toHaveTextContent('none');
  });
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/useCustomerAuth.test.tsx`
Expected: FAIL — both new tests show `minimale-afname` as `'none'` even where `5` is expected, because `CustomerUser`/the klant-doc mapping doesn't read `minimaleAfname` yet.

- [ ] **Step 5: Implement `minimaleAfname` in `useCustomerAuth`**

In `src/lib/useCustomerAuth.tsx`, update the `CustomerUser` interface and the `klantDoc` handling (lines 15-20 and 44-53):
```ts
interface CustomerUser {
  uid: string;
  email: string | null;
  companyName: string | null;
  contactPerson: string | null;
  minimaleAfname: number | null;
}
```
```ts
      const klantDoc = await getDoc(doc(db, 'klanten', firebaseUser.uid));
      const klantData = klantDoc.exists()
        ? (klantDoc.data() as {
            status?: string;
            companyName?: string;
            contactPerson?: string;
            minimaleAfname?: number | null;
          })
        : null;
      setUser({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        companyName: klantData?.companyName ?? null,
        contactPerson: klantData?.contactPerson ?? null,
        minimaleAfname: klantData?.minimaleAfname ?? null,
      });
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/useCustomerAuth.test.tsx`
Expected: PASS (all tests in the file, including the 2 new ones)

- [ ] **Step 7: Add the two new `ActiviteitType` members**

In `src/lib/logActiviteit.ts`, extend the union (after `bestelling_regel_gewijzigd` on line 38):
```ts
  | 'bestelling_regel_gewijzigd'
  | 'bestelinstellingen_gewijzigd'
  | 'klant_minimale_afname_gewijzigd';
```

- [ ] **Step 8: Write the failing tests for the two new activiteit labels**

In `tests/components/beheer/ActiviteitSection.test.tsx`, add two new tests at the end of the `describe` block:
```tsx
  it('shows the translated label for bestelinstellingen_gewijzigd', () => {
    renderSection([
      {
        id: 'log-5',
        type: 'bestelinstellingen_gewijzigd',
        actorEmail: 'paul@glassartanddesign.com',
        actorNaam: 'paul@glassartanddesign.com',
        timestamp: new Date('2026-07-26T11:00:00'),
      },
    ]);
    expect(screen.getByTestId('data-table-row-log-5')).toHaveTextContent('Bestelinstellingen gewijzigd');
  });

  it('shows the translated label for klant_minimale_afname_gewijzigd', () => {
    renderSection([
      {
        id: 'log-6',
        type: 'klant_minimale_afname_gewijzigd',
        actorEmail: 'paul@glassartanddesign.com',
        actorNaam: 'paul@glassartanddesign.com',
        timestamp: new Date('2026-07-26T12:00:00'),
      },
    ]);
    expect(screen.getByTestId('data-table-row-log-6')).toHaveTextContent('Minimale afname gewijzigd voor klant');
  });
```

- [ ] **Step 9: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/ActiviteitSection.test.tsx`
Expected: FAIL — TypeScript error on the `TYPE_LABEL_KEYS` object (missing keys) surfaces as a build/type error, and/or the label falls back to the raw type string instead of the expected translation.

- [ ] **Step 10: Add the two new label-key mappings and translations**

In `src/components/beheer/ActiviteitSection.tsx`, extend `TYPE_LABEL_KEYS` (after line 63):
```ts
  bedrijfsgegevens_gewijzigd: 'activiteitTypeBedrijfsgegevensGewijzigd',
  bestelinstellingen_gewijzigd: 'activiteitTypeBestelinstellingenGewijzigd',
  klant_minimale_afname_gewijzigd: 'activiteitTypeKlantMinimaleAfnameGewijzigd',
};
```

In `messages/nl.json`, add two keys right after `"activiteitTypeBedrijfsgegevensGewijzigd": "Bedrijfsgegevens gewijzigd",` (line 304):
```json
    "activiteitTypeBedrijfsgegevensGewijzigd": "Bedrijfsgegevens gewijzigd",
    "activiteitTypeBestelinstellingenGewijzigd": "Bestelinstellingen gewijzigd",
    "activiteitTypeKlantMinimaleAfnameGewijzigd": "Minimale afname gewijzigd voor klant",
```

- [ ] **Step 11: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/ActiviteitSection.test.tsx tests/lib/useCustomerAuth.test.tsx`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
git add src/components/beheer/bestelinstellingenTypes.ts src/data/bestelinstellingenSeed.ts src/components/beheer/KlantenSection.tsx src/lib/useCustomerAuth.tsx src/lib/logActiviteit.ts src/components/beheer/ActiviteitSection.tsx messages/nl.json tests/lib/useCustomerAuth.test.tsx tests/components/beheer/ActiviteitSection.test.tsx
git commit -m "feat: add minimale afname datamodel and activiteitenlog types"
```

---

## Task 2: Beheer "Instellingen" sectie (globale instelling)

**Files:**
- Create: `src/components/beheer/InstellingenSection.tsx`
- Create: `tests/components/beheer/InstellingenSection.test.tsx`
- Modify: `src/components/beheer/BeheerNav.tsx`
- Modify: `src/components/beheer/BeheerShell.tsx`
- Modify: `messages/nl.json`
- Modify: `tests/components/beheer/BeheerNav.test.tsx`
- Modify: `tests/components/beheer/BeheerShell.test.tsx`

**Interfaces:**
- Consumes: `Bestelinstellingen`, `BESTELINSTELLINGEN_SEED` (Task 1).
- Produces: `InstellingenSection({ bestelinstellingen: Bestelinstellingen | null, loadError: string | null, onSave: (data: Bestelinstellingen) => Promise<boolean> })` — mirrors `GlassartDesignSection`'s prop shape exactly.
- Produces: `BeheerSection` union member `'instellingen'`.

- [ ] **Step 1: Write the failing test for `InstellingenSection`**

Create `tests/components/beheer/InstellingenSection.test.tsx`:
```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { InstellingenSection } from '@/components/beheer/InstellingenSection';
import type { Bestelinstellingen } from '@/components/beheer/bestelinstellingenTypes';
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

const BESTELINSTELLINGEN: Bestelinstellingen = { minimaleAfname: 3 };

function renderSection(overrides: Partial<React.ComponentProps<typeof InstellingenSection>> = {}) {
  const onSave = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <InstellingenSection
        bestelinstellingen={BESTELINSTELLINGEN}
        loadError={null}
        onSave={onSave}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  return { onSave };
}

describe('InstellingenSection', () => {
  it('shows the load error instead of the form when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('instellingen-error')).toHaveTextContent('Kon niet laden.');
    expect(screen.queryByTestId('instellingen-section')).not.toBeInTheDocument();
  });

  it('renders nothing while bestelinstellingen is null and there is no error', () => {
    renderSection({ bestelinstellingen: null });
    expect(screen.queryByTestId('instellingen-section')).not.toBeInTheDocument();
  });

  it('pre-fills the minimale afname field', () => {
    renderSection();
    expect(screen.getByTestId('instellingen-minimale-afname')).toHaveValue(3);
  });

  it('saves the new value and logs bestelinstellingen_gewijzigd', async () => {
    const { onSave } = renderSection();
    fireEvent.change(screen.getByTestId('instellingen-minimale-afname'), { target: { value: '8' } });
    fireEvent.click(screen.getByTestId('instellingen-opslaan'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ minimaleAfname: 8 }));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('bestelinstellingen_gewijzigd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('clamps a value below 1 up to 1 on save', async () => {
    const { onSave } = renderSection();
    fireEvent.change(screen.getByTestId('instellingen-minimale-afname'), { target: { value: '0' } });
    fireEvent.click(screen.getByTestId('instellingen-opslaan'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ minimaleAfname: 1 }));
  });

  it('shows an action error and does not log when onSave fails', async () => {
    renderSection({ onSave: vi.fn().mockResolvedValue(false) });
    fireEvent.click(screen.getByTestId('instellingen-opslaan'));
    expect(await screen.findByTestId('instellingen-error-message')).toHaveTextContent(
      'Er is iets misgegaan. Probeer het opnieuw.'
    );
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/beheer/InstellingenSection.test.tsx`
Expected: FAIL with a module-not-found error for `@/components/beheer/InstellingenSection`.

- [ ] **Step 3: Add the i18n keys**

In `messages/nl.json`, add these keys to the `beheer` namespace, right after `"navGlassartDesign": "Glassart and Design",` (line 305):
```json
    "navGlassartDesign": "Glassart and Design",
    "navInstellingen": "Instellingen",
    "instellingenLabelMinimaleAfname": "Minimale afname",
    "instellingenOpslaan": "Opslaan",
    "instellingenLoadError": "Kon de instellingen niet laden. Probeer de pagina te verversen.",
    "instellingenActionError": "Er is iets misgegaan. Probeer het opnieuw.",
```

- [ ] **Step 4: Implement `InstellingenSection`**

Create `src/components/beheer/InstellingenSection.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Bestelinstellingen } from './bestelinstellingenTypes';

interface InstellingenSectionProps {
  bestelinstellingen: Bestelinstellingen | null;
  loadError: string | null;
  onSave: (data: Bestelinstellingen) => Promise<boolean>;
}

export function InstellingenSection({ bestelinstellingen, loadError, onSave }: InstellingenSectionProps) {
  const t = useTranslations('beheer');
  const { user } = useAdminAuth();
  const [form, setForm] = useState<Bestelinstellingen | null>(bestelinstellingen);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setForm(bestelinstellingen);
  }, [bestelinstellingen]);

  if (loadError) {
    return (
      <p data-testid="instellingen-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (form === null) {
    return null;
  }

  async function handleSave() {
    if (!form) return;
    setActionError(null);
    const clamped = { minimaleAfname: Math.max(1, Math.round(form.minimaleAfname) || 1) };
    const success = await onSave(clamped);
    if (success) {
      setForm(clamped);
      void logActiviteit('bestelinstellingen_gewijzigd', actorFromMedewerker(user));
    } else {
      setActionError(t('instellingenActionError'));
    }
  }

  return (
    <div data-testid="instellingen-section" className="flex flex-col gap-6 text-sm text-white/80">
      <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
        {t('instellingenLabelMinimaleAfname')}
        <input
          type="number"
          min={1}
          value={form.minimaleAfname}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            setForm((current) =>
              current ? { ...current, minimaleAfname: Number.isFinite(parsed) ? parsed : 0 } : current
            );
          }}
          data-testid="instellingen-minimale-afname"
          className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
        />
      </label>

      {actionError && (
        <p data-testid="instellingen-error-message" className="text-xs text-red-400">
          {actionError}
        </p>
      )}

      <button
        type="button"
        onClick={handleSave}
        data-testid="instellingen-opslaan"
        className="self-start rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
      >
        {t('instellingenOpslaan')}
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/components/beheer/InstellingenSection.test.tsx`
Expected: PASS

- [ ] **Step 6: Wire the nav item**

In `src/components/beheer/BeheerNav.tsx`, add `'instellingen'` to the `BeheerSection` union (line 5-15):
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
  | 'glassartDesign'
  | 'instellingen';
```

Add it to `ACTIVE_ITEMS` (after the `glassartDesign` entry, line 42):
```ts
  { id: 'glassartDesign', labelKey: 'navGlassartDesign' },
  { id: 'instellingen', labelKey: 'navInstellingen' },
];
```

- [ ] **Step 7: Update `BeheerNav.test.tsx` for the 11th item**

In `tests/components/beheer/BeheerNav.test.tsx`, update the test title and add assertions (in the first `it` block, after the `glassartDesign` assertions on line 65):
```tsx
  it('renders the 11 active items with their counters, and no disabled placeholder items', () => {
    renderNav();
    expect(screen.getByTestId('beheer-nav-klanten')).toHaveTextContent('Klanten');
    expect(screen.getByTestId('beheer-nav-klanten')).toHaveTextContent('3');
    expect(screen.getByTestId('beheer-nav-bestellingen')).toHaveTextContent('Bestellingen');
    expect(screen.getByTestId('beheer-nav-bestellingen')).toHaveTextContent('5');
    expect(screen.getByTestId('beheer-nav-materiaalsoorten')).toHaveTextContent('Materiaalsoorten');
    expect(screen.getByTestId('beheer-nav-materialen')).toHaveTextContent('Materialen');
    expect(screen.getByTestId('beheer-nav-maten')).toHaveTextContent('Maten');
    expect(screen.getByTestId('beheer-nav-segmenten')).toHaveTextContent('Segmenten');
    expect(screen.getByTestId('beheer-nav-segmenten')).toHaveTextContent('6');
    expect(screen.getByTestId('beheer-nav-kunstwerken')).toHaveTextContent('Kunstwerken');
    expect(screen.getByTestId('beheer-nav-kunstwerken')).toHaveTextContent('36');
    expect(screen.getByTestId('beheer-nav-prijsgroepen')).toHaveTextContent('Prijsgroepen');
    expect(screen.getByTestId('beheer-nav-prijsgroepen')).toHaveTextContent('9');
    expect(screen.getByTestId('beheer-nav-activiteit')).toHaveTextContent('Activiteitenlog');
    expect(screen.getByTestId('beheer-nav-activiteit')).toHaveTextContent('12');
    expect(screen.getByTestId('beheer-nav-glassartDesign')).toHaveTextContent('Glassart and Design');
    expect(screen.getByTestId('beheer-nav-glassartDesign')).not.toBeDisabled();
    expect(screen.getByTestId('beheer-nav-instellingen')).toHaveTextContent('Instellingen');
    expect(screen.getByTestId('beheer-nav-instellingen')).not.toBeDisabled();
  });

  it('does not show a count badge on the Instellingen item', () => {
    renderNav();
    const item = screen.getByTestId('beheer-nav-instellingen');
    expect(item.querySelectorAll('span')).toHaveLength(1);
  });
```

- [ ] **Step 8: Wire `BeheerShell`**

In `src/components/beheer/BeheerShell.tsx`, add imports (near lines 18-26):
```ts
import { InstellingenSection } from './InstellingenSection';
import type { Bestelinstellingen } from './bestelinstellingenTypes';
import { BESTELINSTELLINGEN_SEED } from '@/data/bestelinstellingenSeed';
```

Add the hook call right after the `bedrijfsgegevens` one (line 230-232):
```ts
  const bedrijfsgegevens = useFirestoreDocument<Bedrijfsgegevens>('instellingen', 'bedrijfsgegevens', {
    seed: BEDRIJFSGEGEVENS_SEED,
  });
  const bestelinstellingen = useFirestoreDocument<Bestelinstellingen>('instellingen', 'bestelinstellingen', {
    seed: BESTELINSTELLINGEN_SEED,
  });
```

Insert a new branch in the render ternary, right before the final `glassartDesign` branch's closing and the `ActiviteitSection` fallback (replace lines 349-357):
```tsx
        ) : activeSection === 'glassartDesign' ? (
          <GlassartDesignSection
            bedrijfsgegevens={bedrijfsgegevens.data}
            loadError={bedrijfsgegevens.error === 'load' ? t('glassartDesignLoadError') : null}
            onSave={bedrijfsgegevens.save}
          />
        ) : activeSection === 'instellingen' ? (
          <InstellingenSection
            bestelinstellingen={bestelinstellingen.data}
            loadError={bestelinstellingen.error === 'load' ? t('instellingenLoadError') : null}
            onSave={bestelinstellingen.save}
          />
        ) : (
          <ActiviteitSection activiteiten={activiteiten} loadError={activiteitenLoadError} />
        )}
```

- [ ] **Step 9: Add a `BeheerShell` wiring test**

In `tests/components/beheer/BeheerShell.test.tsx`, add a test near the other section-switch tests:
```tsx
  it('shows the Instellingen section when selected', async () => {
    mockCollections();
    renderShell();
    fireEvent.click(screen.getByTestId('beheer-nav-instellingen'));
    expect(await screen.findByTestId('instellingen-section')).toBeInTheDocument();
  });
```

- [ ] **Step 10: Run all affected tests**

Run: `npx vitest run tests/components/beheer/InstellingenSection.test.tsx tests/components/beheer/BeheerNav.test.tsx tests/components/beheer/BeheerShell.test.tsx`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src/components/beheer/InstellingenSection.tsx src/components/beheer/BeheerNav.tsx src/components/beheer/BeheerShell.tsx messages/nl.json tests/components/beheer/InstellingenSection.test.tsx tests/components/beheer/BeheerNav.test.tsx tests/components/beheer/BeheerShell.test.tsx
git commit -m "feat: add beheer Instellingen section for minimale afname"
```

---

## Task 3: Klant-override in KlantModal

**Files:**
- Modify: `src/components/beheer/KlantModal.tsx`
- Modify: `src/components/beheer/BeheerShell.tsx` (the `loadKlanten` mapping)
- Modify: `messages/nl.json`
- Modify: `tests/components/beheer/KlantModal.test.tsx`

**Interfaces:**
- Consumes: `Klant.minimaleAfname` (Task 1).

- [ ] **Step 1: Write the failing tests for the klant-override mini-form**

In `tests/components/beheer/KlantModal.test.tsx`, add tests to the `describe('KlantModal')` block (after the existing prijsgroep tests):
```tsx
  it('pre-fills the minimale afname override input from klant.minimaleAfname', () => {
    renderModal({ ...KLANT, minimaleAfname: 7 });
    expect(screen.getByTestId('klant-modal-minimale-afname')).toHaveValue(7);
  });

  it('shows an empty minimale afname input when the klant has no override', () => {
    renderModal({ ...KLANT, minimaleAfname: null });
    expect(screen.getByTestId('klant-modal-minimale-afname')).toHaveValue(null);
  });

  it('shows the minimale afname override input even for a klant still "Beoordelen"', () => {
    renderModal({ ...KLANT, status: 'Beoordelen' });
    expect(screen.getByTestId('klant-modal-minimale-afname')).toBeInTheDocument();
  });

  it('saves the minimale afname override and logs klant_minimale_afname_gewijzigd', async () => {
    updateDocMock.mockResolvedValue(undefined);
    const { onUpdated } = renderModal({ ...KLANT, minimaleAfname: null });
    fireEvent.change(screen.getByTestId('klant-modal-minimale-afname'), { target: { value: '6' } });
    fireEvent.click(screen.getByTestId('klant-modal-minimale-afname-opslaan'));
    await waitFor(() =>
      expect(updateDocMock).toHaveBeenCalledWith(expect.anything(), { minimaleAfname: 6 })
    );
    expect(logActiviteitMock).toHaveBeenCalledWith('klant_minimale_afname_gewijzigd', {
      id: 'staff-1',
      email: 'paul@glassartanddesign.com',
      naam: 'paul@glassartanddesign.com',
    });
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ minimaleAfname: 6 }));
  });

  it('clears the override to null when saving an empty value', async () => {
    updateDocMock.mockResolvedValue(undefined);
    renderModal({ ...KLANT, minimaleAfname: 6 });
    fireEvent.change(screen.getByTestId('klant-modal-minimale-afname'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('klant-modal-minimale-afname-opslaan'));
    await waitFor(() =>
      expect(updateDocMock).toHaveBeenCalledWith(expect.anything(), { minimaleAfname: null })
    );
  });

  it('clamps a saved override below 1 up to 1', async () => {
    updateDocMock.mockResolvedValue(undefined);
    renderModal({ ...KLANT, minimaleAfname: null });
    fireEvent.change(screen.getByTestId('klant-modal-minimale-afname'), { target: { value: '0' } });
    fireEvent.click(screen.getByTestId('klant-modal-minimale-afname-opslaan'));
    await waitFor(() =>
      expect(updateDocMock).toHaveBeenCalledWith(expect.anything(), { minimaleAfname: 1 })
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/KlantModal.test.tsx`
Expected: FAIL — `klant-modal-minimale-afname` testid not found.

- [ ] **Step 3: Add the i18n key**

In `messages/nl.json`, add this key right after `"klantenLabelPrijsgroep": "Prijsgroep",` (line 323):
```json
    "klantenLabelPrijsgroep": "Prijsgroep",
    "klantenLabelMinimaleAfname": "Minimale afname (override)",
```

- [ ] **Step 4: Implement the mini-form in `KlantModal.tsx`**

Add state and the effect initializer (around lines 54-67):
```tsx
  const [prijsgroepId, setPrijsgroepId] = useState('');
  const [minimaleAfname, setMinimaleAfname] = useState('');
  const [fields, setFields] = useState<EditableFields | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAdminAuth();

  useEffect(() => {
    if (klant) {
      setPrijsgroepId(klant.prijsgroepId ?? '');
      setMinimaleAfname(klant.minimaleAfname != null ? String(klant.minimaleAfname) : '');
      setFields(fieldsFromKlant(klant));
      setIsEditing(false);
      setError(null);
    }
  }, [klant]);
```

Add the save handler, after `handleOpslaanPrijsgroep` (after line 105):
```tsx
  async function handleOpslaanMinimaleAfname() {
    if (!klant) return;
    const trimmed = minimaleAfname.trim();
    const parsed = trimmed === '' ? null : Math.max(1, Math.round(Number(trimmed)) || 1);
    try {
      await updateDoc(doc(db, 'klanten', klant.id), { minimaleAfname: parsed });
      void logActiviteit('klant_minimale_afname_gewijzigd', actorFromMedewerker(user));
      onUpdated({ ...klant, minimaleAfname: parsed });
      setMinimaleAfname(parsed != null ? String(parsed) : '');
    } catch {
      setError(t('klantenActionError'));
    }
  }
```

Add the JSX, right after the prijsgroep `<div>` block closes (after line 286, before the `{error && ...}` block):
```tsx
          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
              {t('klantenLabelMinimaleAfname')}
              <input
                type="number"
                min={1}
                value={minimaleAfname}
                onChange={(event) => setMinimaleAfname(event.target.value)}
                data-testid="klant-modal-minimale-afname"
                className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
              />
            </label>
            <button
              type="button"
              onClick={handleOpslaanMinimaleAfname}
              data-testid="klant-modal-minimale-afname-opslaan"
              className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
            >
              {t('klantenOpslaan')}
            </button>
          </div>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/KlantModal.test.tsx`
Expected: PASS

- [ ] **Step 6: Read `minimaleAfname` off the klanten Firestore documents in `BeheerShell`**

In `src/components/beheer/BeheerShell.tsx`, extend the `loadKlanten` mapping (around lines 51-69):
```tsx
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
              prijsgroepId: data.prijsgroepId,
              minimaleAfname: data.minimaleAfname ?? null,
            } as Klant;
```

- [ ] **Step 7: Run the full beheer test suite for this area**

Run: `npx vitest run tests/components/beheer/KlantModal.test.tsx tests/components/beheer/BeheerShell.test.tsx tests/components/beheer/KlantenSection.test.tsx`
Expected: PASS (no regressions — `minimaleAfname` is optional so existing `Klant` fixtures without it remain valid)

- [ ] **Step 8: Commit**

```bash
git add src/components/beheer/KlantModal.tsx src/components/beheer/BeheerShell.tsx messages/nl.json tests/components/beheer/KlantModal.test.tsx
git commit -m "feat: add per-klant minimale afname override in KlantModal"
```

---

## Task 4: Bestel-popup enforcement (ProductModal)

**Files:**
- Modify: `src/components/ProductModal.tsx`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/fr.json`, `messages/de.json`
- Modify: `tests/components/ProductModal.test.tsx`

**Interfaces:**
- Consumes: `Bestelinstellingen`, `BESTELINSTELLINGEN_SEED` (Task 1), `useCustomerAuth().user.minimaleAfname` (Task 1).

- [ ] **Step 1: Add the `minimumQuantityError` translation to all 4 locales**

In `messages/nl.json`, after `"customSizeNote": "..."` (line 87):
```json
    "customSizeNote": "{count, plural, one {+ # artikel, prijs volgt na offerte} other {+ # artikelen, prijs volgt na offerte}}",
    "minimumQuantityError": "Minimaal {minimum} stuks"
```

In `messages/en.json`, after the equivalent `customSizeNote` line:
```json
    "customSizeNote": "{count, plural, one {+ # item, price to follow after quote} other {+ # items, price to follow after quote}}",
    "minimumQuantityError": "Minimum {minimum} pieces"
```

In `messages/fr.json`, after the equivalent `customSizeNote` line:
```json
    "customSizeNote": "{count, plural, one {+ # article, prix à confirmer après devis} other {+ # articles, prix à confirmer après devis}}",
    "minimumQuantityError": "Minimum {minimum} pièces"
```

In `messages/de.json`, after the equivalent `customSizeNote` line:
```json
    "customSizeNote": "{count, plural, one {+ # Artikel, Preis folgt nach Angebot} other {+ # Artikel, Preis folgt nach Angebot}}",
    "minimumQuantityError": "Mindestens {minimum} Stück"
```

- [ ] **Step 2: Update the `firebase/firestore` mock in `ProductModal.test.tsx` to support `setDoc`**

In `tests/components/ProductModal.test.tsx`, extend the mock (lines 23-26):
```tsx
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection, id) => ({ collection, id })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  setDoc: vi.fn(),
}));
```

- [ ] **Step 3: Update the existing quantity assertions from `toHaveTextContent` to `toHaveValue`**

In `tests/components/ProductModal.test.tsx`:

Line 121 (inside `'shows the resolved description...'`):
```tsx
    expect(screen.getByTestId('product-modal-quantity-value')).toHaveValue(1);
```

Lines 156-163 (the whole `'increments and decrements quantity, never below 1'` test):
```tsx
  it('increments and decrements quantity, never below the effective minimum', () => {
    renderModal();
    fireEvent.click(screen.getByTestId('product-modal-quantity-minus'));
    expect(screen.getByTestId('product-modal-quantity-value')).toHaveValue(1);
    fireEvent.click(screen.getByTestId('product-modal-quantity-plus'));
    fireEvent.click(screen.getByTestId('product-modal-quantity-plus'));
    expect(screen.getByTestId('product-modal-quantity-value')).toHaveValue(3);
  });
```

- [ ] **Step 4: Write the new failing tests for minimum-quantity behavior**

In `tests/components/ProductModal.test.tsx`, add a helper and new tests at the end of the `describe('ProductModal')` block:
```tsx
  function mockDocsByCollection(byCollection: Record<string, { exists: boolean; data?: object }>) {
    getDocMock.mockImplementation((ref: { collection: string; id: string }) => {
      const entry = byCollection[ref.collection];
      if (!entry) {
        return Promise.resolve({ exists: () => false });
      }
      return Promise.resolve({ exists: () => entry.exists, data: () => entry.data });
    });
  }

  async function flushMicrotasks() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  it('prefills quantity with the global minimale afname when there is no logged-in klant', async () => {
    mockDocsByCollection({ instellingen: { exists: true, data: { minimaleAfname: 5 } } });
    renderModal();
    await flushMicrotasks();
    expect(screen.getByTestId('product-modal-quantity-value')).toHaveValue(5);
  });

  it('prefills quantity with the klant override when it differs from the global minimum', async () => {
    mockDocsByCollection({
      klanten: { exists: true, data: { status: 'Goedgekeurd', minimaleAfname: 8 } },
      instellingen: { exists: true, data: { minimaleAfname: 3 } },
    });
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-1', email: 'klant@example.com' });
      return () => {};
    });
    renderModal();
    await flushMicrotasks();
    expect(screen.getByTestId('product-modal-quantity-value')).toHaveValue(8);
  });

  it('falls back to the global minimum when the klant has no override', async () => {
    mockDocsByCollection({
      klanten: { exists: true, data: { status: 'Goedgekeurd', minimaleAfname: null } },
      instellingen: { exists: true, data: { minimaleAfname: 4 } },
    });
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-1', email: 'klant@example.com' });
      return () => {};
    });
    renderModal();
    await flushMicrotasks();
    expect(screen.getByTestId('product-modal-quantity-value')).toHaveValue(4);
  });

  it('shows an error and disables confirm when the typed quantity is below the minimum', async () => {
    mockDocsByCollection({ instellingen: { exists: true, data: { minimaleAfname: 5 } } });
    renderModal();
    await flushMicrotasks();
    fireEvent.change(screen.getByTestId('product-modal-quantity-value'), { target: { value: '2' } });
    expect(screen.getByTestId('product-modal-quantity-error')).toHaveTextContent('Minimaal 5 stuks');
    expect(screen.getByTestId('product-modal-confirm')).toBeDisabled();
  });

  it('re-enables confirm once the typed quantity meets the minimum', async () => {
    mockDocsByCollection({ instellingen: { exists: true, data: { minimaleAfname: 5 } } });
    renderModal();
    await flushMicrotasks();
    fireEvent.change(screen.getByTestId('product-modal-quantity-value'), { target: { value: '2' } });
    fireEvent.change(screen.getByTestId('product-modal-quantity-value'), { target: { value: '5' } });
    expect(screen.queryByTestId('product-modal-quantity-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('product-modal-confirm')).not.toBeDisabled();
  });

  it('shows an error when the quantity field is cleared', async () => {
    mockDocsByCollection({ instellingen: { exists: true, data: { minimaleAfname: 5 } } });
    renderModal();
    await flushMicrotasks();
    fireEvent.change(screen.getByTestId('product-modal-quantity-value'), { target: { value: '' } });
    expect(screen.getByTestId('product-modal-quantity-error')).toBeInTheDocument();
    expect(screen.getByTestId('product-modal-confirm')).toBeDisabled();
  });

  it('the minus button never goes below the effective minimum', async () => {
    mockDocsByCollection({ instellingen: { exists: true, data: { minimaleAfname: 3 } } });
    renderModal();
    await flushMicrotasks();
    fireEvent.click(screen.getByTestId('product-modal-quantity-minus'));
    fireEvent.click(screen.getByTestId('product-modal-quantity-minus'));
    fireEvent.click(screen.getByTestId('product-modal-quantity-minus'));
    expect(screen.getByTestId('product-modal-quantity-value')).toHaveValue(3);
  });
```

- [ ] **Step 5: Run the tests to verify the new ones fail and confirm which existing ones break**

Run: `npx vitest run tests/components/ProductModal.test.tsx`
Expected: FAIL — new tests fail (no `effectiveMinimum` logic yet); the two updated `toHaveValue` assertions fail because the element is still a `<span>`, not an `<input>`.

- [ ] **Step 6: Implement the minimum-quantity logic in `ProductModal.tsx`**

Add imports (near lines 5-12):
```ts
import { useFirestoreDocument } from '@/lib/useFirestoreDocument';
import type { Bestelinstellingen } from './beheer/bestelinstellingenTypes';
import { BESTELINSTELLINGEN_SEED } from '@/data/bestelinstellingenSeed';
```

Replace the `quantity` state and add the settings hook + derived values (lines 45-52):
```tsx
  const [materiaalId, setMateriaalId] = useState('');
  const [maatId, setMaatId] = useState('');
  const [customBreedte, setCustomBreedte] = useState('');
  const [customHoogte, setCustomHoogte] = useState('');
  const [quantityInput, setQuantityInput] = useState('1');
  const [isConfirmed, setIsConfirmed] = useState(false);
  const { addItem } = useCart();
  const { user } = useCustomerAuth();
  const { data: bestelinstellingen } = useFirestoreDocument<Bestelinstellingen>(
    'instellingen',
    'bestelinstellingen',
    { seed: BESTELINSTELLINGEN_SEED }
  );
  const effectiveMinimum = user?.minimaleAfname ?? bestelinstellingen?.minimaleAfname ?? 1;
```

Update the kunstwerk-reset effect (lines 57-67) — quantity now resets via `effectiveMinimum`, kept in the same effect since at mount time (`kunstwerk` starting `null`) `effectiveMinimum` is already computed from whatever `user`/`bestelinstellingen` currently hold:
```tsx
  useEffect(() => {
    if (!kunstwerk) {
      return;
    }
    setMateriaalId(kunstwerk.materiaalIds[0] ?? '');
    setMaatId(kunstwerk.maatIds[0] ?? '');
    setCustomBreedte('');
    setCustomHoogte('');
    // Deliberately depends only on [kunstwerk]: useFirestoreDocument/useCustomerAuth
    // resolve well before a customer opens the popup in practice, and re-running this
    // reset whenever effectiveMinimum changes would also clobber materiaal/maat
    // selections the customer already made.
    setQuantityInput(String(effectiveMinimum));
    setIsConfirmed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunstwerk]);
```

Add the derived quantity validity, right after `const canConfirm = ...` (line 118) — replace it:
```ts
  const quantityNum = Number(quantityInput);
  const quantityValid =
    quantityInput.trim() !== '' && Number.isInteger(quantityNum) && quantityNum >= effectiveMinimum;

  const canConfirm = (isCustomSize ? customSizeValid : Boolean(prijsRegel)) && quantityValid;
```

Update `handleConfirm` to use `quantityNum` instead of `quantity` (both `addItem` calls, lines 149 and 166):
```tsx
        prijs: null,
        quantity: quantityNum,
      });
      void logActiviteit('mandje_eigen_maat_toegevoegd', actorFromCustomer(user));
```
```tsx
        prijs: prijsRegel.prijs,
        quantity: quantityNum,
      });
      void logActiviteit('mandje_toegevoegd', actorFromCustomer(user));
```

Replace the quantity JSX block (lines 297-320):
```tsx
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2 text-sm text-white/80">
              <span className="text-[0.65rem] uppercase tracking-wide text-white/60">{t('quantity')}</span>
              <div className="flex h-10 items-center overflow-hidden rounded-full border border-white/20">
                <button
                  type="button"
                  data-testid="product-modal-quantity-minus"
                  onClick={() =>
                    setQuantityInput((current) =>
                      String(Math.max(effectiveMinimum, (Number(current) || effectiveMinimum) - 1))
                    )
                  }
                  className="flex h-full w-9 items-center justify-center text-white/80 transition hover:bg-gold hover:text-ink"
                >
                  −
                </button>
                <input
                  type="number"
                  data-testid="product-modal-quantity-value"
                  value={quantityInput}
                  onChange={(event) => setQuantityInput(event.target.value)}
                  className="h-full w-14 bg-transparent text-center text-sm text-white"
                />
                <button
                  type="button"
                  data-testid="product-modal-quantity-plus"
                  onClick={() =>
                    setQuantityInput((current) => String((Number(current) || effectiveMinimum) + 1))
                  }
                  className="flex h-full w-9 items-center justify-center text-white/80 transition hover:bg-gold hover:text-ink"
                >
                  +
                </button>
              </div>
            </div>
            {!quantityValid && (
              <p data-testid="product-modal-quantity-error" className="text-right text-xs text-red-400">
                {t('minimumQuantityError', { minimum: effectiveMinimum })}
              </p>
            )}
          </div>
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/components/ProductModal.test.tsx`
Expected: PASS (all tests in the file)

- [ ] **Step 8: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: PASS — no other test file references `product-modal-quantity-value` or relies on the old `quantity` numeric state.

- [ ] **Step 9: Commit**

```bash
git add src/components/ProductModal.tsx messages/nl.json messages/en.json messages/fr.json messages/de.json tests/components/ProductModal.test.tsx
git commit -m "feat: enforce minimale afname in the bestel-popup"
```
