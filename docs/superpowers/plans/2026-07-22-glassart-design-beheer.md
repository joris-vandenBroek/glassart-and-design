# Glassart & Design (bedrijfsgegevens) Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 22-07-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vervang de hardcoded bedrijfsgegevens op de contactpagina (adres, contactpersonen, bank, KvK/BTW, e-mail, WhatsApp, openingstijden) door één Firestore-document dat beheerders bewerken via een nieuwe, al aangekondigde "Glassart and Design"-sectie in beheer.

**Architecture:** Eén nieuw generiek hook-patroon `useFirestoreDocument` (naast het bestaande `useFirestoreCollection`) voor een collectie met precies één vast document (`instellingen/bedrijfsgegevens`). De beheerpagina is één doorlopend formulier (geen DataTable/Modal, want geen lijst) met een taal-tabblad voor de twee meertalige velden (contactpersoon-rol, openingstijden). De publieke contactpagina gebruikt hetzelfde hook om het document te lezen (en, indien nog niet aanwezig, te seeden met de huidige productie-inhoud).

**Tech Stack:** Next.js (App Router), React, TypeScript, Firebase Firestore (client-SDK, geen backend), next-intl, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-22-glassart-design-beheer-design.md`

## Global Constraints

- Nieuwe Firestore-collectie `instellingen`, met precies één document, vaste id `bedrijfsgegevens`.
- Datamodel (zie Task 3): `bezoekadres`, `email`, `whatsappNummer`, `iban`, `kvkNummer`, `btwNummer`, `openingstijden: Record<'nl'|'en'|'fr'|'de', string>`, `contactpersonen: { id, naam, telefoon, rol: Record<'nl'|'en'|'fr'|'de', string> }[]`.
- Alleen `rol` (per contactpersoon) en `openingstijden` zijn per-taal; alle overige velden zijn taalneutraal en eenmalig ingevoerd.
- Nieuw `ActiviteitType`: `bedrijfsgegevens_gewijzigd`, gelogd via `actorFromMedewerker(user)` (eigen `useAdminAuth()`-aanroep in `GlassartDesignSection.tsx`), alleen bij een geslaagde `onSave`.
- Firestore-rule voor `instellingen`: `allow read: if true` (de contactpagina is publiek), `allow write` alleen voor bekende `medewerkers` — zelfde patroon als `materialen`/`segmenten`/etc.
- Vertalingen voor de beheer-UI alleen in `messages/nl.json` (`beheer`-namespace is Nederlands-only, zelfde conventie als eerdere beheer-secties).
- Seed-data (bij ontbrekend document) is de huidige hardcoded productie-inhoud uit `ContactInfo.tsx`, zodat de contactpagina niet leeg valt na deze wijziging.
- Firestore rules worden na Task 2 gedeployed met `npx --yes firebase-tools deploy --only firestore:rules` (al geauthenticeerd op deze machine — niet aan de gebruiker vragen).

---

## Task 1: `useFirestoreDocument`-hook

**Files:**
- Create: `src/lib/useFirestoreDocument.ts`
- Test: `tests/lib/useFirestoreDocument.test.tsx`

**Interfaces:**
- Produces: `useFirestoreDocument<T>(collectionName: string, docId: string, options?: { seed?: T }): { data: T | null; error: 'load' | 'action' | null; save: (data: T) => Promise<boolean> }` — gebruikt door Task 5 (`BeheerShell.tsx`) en Task 6 (`ContactInfo.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/useFirestoreDocument.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { useFirestoreDocument } from '@/lib/useFirestoreDocument';

const getDocMock = vi.fn();
const setDocMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  setDoc: (...args: unknown[]) => setDocMock(...args),
}));

interface Profiel {
  naam: string;
}

function makeSnapshot(data: Record<string, unknown> | null) {
  return {
    exists: () => data !== null,
    data: () => data,
  };
}

function TestConsumer({ seed }: { seed?: Profiel }) {
  const { data, error, save } = useFirestoreDocument<Profiel>('instellingen', 'profiel', { seed });
  return (
    <div>
      <div data-testid="data">{data === null ? 'loading' : data.naam}</div>
      <div data-testid="error">{error ?? 'none'}</div>
      <button type="button" data-testid="save" onClick={() => save({ naam: 'Aangepast' })} />
    </div>
  );
}

beforeEach(() => {
  getDocMock.mockReset();
  setDocMock.mockReset();
});

describe('useFirestoreDocument', () => {
  it('fetches and exposes the document data', async () => {
    getDocMock.mockResolvedValue(makeSnapshot({ naam: 'Een' }));
    render(<TestConsumer />);
    expect(screen.getByTestId('data')).toHaveTextContent('loading');
    await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('Een'));
    expect(getDocMock).toHaveBeenCalledWith({ collectionName: 'instellingen', id: 'profiel' });
  });

  it('sets a load error when getDoc fails', async () => {
    getDocMock.mockRejectedValue(new Error('offline'));
    render(<TestConsumer />);
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('load'));
  });

  it('seeds the document when it does not exist and a seed is given', async () => {
    getDocMock.mockResolvedValue(makeSnapshot(null));
    setDocMock.mockResolvedValue(undefined);
    render(<TestConsumer seed={{ naam: 'Seed' }} />);
    await waitFor(() =>
      expect(setDocMock).toHaveBeenCalledWith({ collectionName: 'instellingen', id: 'profiel' }, { naam: 'Seed' })
    );
    await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('Seed'));
  });

  it('does not seed when the document is missing and no seed is given', async () => {
    getDocMock.mockResolvedValue(makeSnapshot(null));
    render(<TestConsumer />);
    await waitFor(() => expect(getDocMock).toHaveBeenCalled());
    expect(setDocMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('data')).toHaveTextContent('loading');
  });

  it('saves data and exposes it immediately', async () => {
    getDocMock.mockResolvedValue(makeSnapshot({ naam: 'Een' }));
    setDocMock.mockResolvedValue(undefined);
    render(<TestConsumer />);
    await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('Een'));
    fireEvent.click(screen.getByTestId('save'));
    await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('Aangepast'));
    expect(setDocMock).toHaveBeenCalledWith({ collectionName: 'instellingen', id: 'profiel' }, { naam: 'Aangepast' });
  });

  it('sets an action error and keeps existing data when save fails', async () => {
    getDocMock.mockResolvedValue(makeSnapshot({ naam: 'Een' }));
    setDocMock.mockRejectedValue(new Error('offline'));
    render(<TestConsumer />);
    await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('Een'));
    fireEvent.click(screen.getByTestId('save'));
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('action'));
    expect(screen.getByTestId('data')).toHaveTextContent('Een');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/useFirestoreDocument.test.tsx`
Expected: FAIL with "Cannot find module '@/lib/useFirestoreDocument'"

- [ ] **Step 3: Implement `useFirestoreDocument`**

Create `src/lib/useFirestoreDocument.ts`:

```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface UseFirestoreDocumentOptions<T> {
  seed?: T;
}

export interface UseFirestoreDocumentResult<T> {
  data: T | null;
  error: 'load' | 'action' | null;
  save: (data: T) => Promise<boolean>;
}

export function useFirestoreDocument<T>(
  collectionName: string,
  docId: string,
  options?: UseFirestoreDocumentOptions<T>
): UseFirestoreDocumentResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<'load' | 'action' | null>(null);
  const seedRef = useRef(options?.seed);
  seedRef.current = options?.seed;

  const fetchDoc = useCallback(async () => {
    try {
      const ref = doc(db, collectionName, docId);
      const snapshot = await getDoc(ref);
      if (snapshot.exists()) {
        setData(snapshot.data() as T);
      } else {
        const seed = seedRef.current;
        if (seed) {
          await setDoc(ref, seed as object);
          setData(seed);
        }
      }
      setError(null);
      return true;
    } catch {
      setError('load');
      return false;
    }
  }, [collectionName, docId]);

  useEffect(() => {
    fetchDoc();
  }, [fetchDoc]);

  const save = useCallback(
    async (newData: T) => {
      try {
        await setDoc(doc(db, collectionName, docId), newData as object);
        setData(newData);
        setError(null);
        return true;
      } catch {
        setError('action');
        return false;
      }
    },
    [collectionName, docId]
  );

  return { data, error, save };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/useFirestoreDocument.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/useFirestoreDocument.ts tests/lib/useFirestoreDocument.test.tsx
git commit -m "feat: add useFirestoreDocument hook for single-document Firestore collections"
```

---

## Task 2: Activiteitenlog event-type + beveiligingsregels

**Files:**
- Modify: `src/lib/logActiviteit.ts:30-32`
- Modify: `src/components/beheer/ActiviteitSection.tsx:53-55`
- Modify: `messages/nl.json` (beheer namespace)
- Modify: `firestore.rules:24-27`, `firestore.rules:41-50`
- Test: `tests/components/beheer/ActiviteitSection.test.tsx`

**Interfaces:**
- Produces: `ActiviteitType` includes `'bedrijfsgegevens_gewijzigd'` — used by Task 3's `GlassartDesignSection.tsx`.

- [ ] **Step 1: Write the failing test**

In `tests/components/beheer/ActiviteitSection.test.tsx`, add this test right after the `'shows each activiteit with its translated type label and actor'` test:

```tsx
  it('shows the translated label for bedrijfsgegevens_gewijzigd', () => {
    renderSection([
      {
        id: 'log-4',
        type: 'bedrijfsgegevens_gewijzigd',
        actorEmail: 'paul@glassartanddesign.com',
        actorNaam: 'paul@glassartanddesign.com',
        timestamp: new Date('2026-07-22T11:00:00'),
      },
    ]);
    expect(screen.getByTestId('data-table-row-log-4')).toHaveTextContent('Bedrijfsgegevens gewijzigd');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/beheer/ActiviteitSection.test.tsx`
Expected: FAIL — TypeScript error ("bedrijfsgegevens_gewijzigd" is not assignable to `ActiviteitType`) and the rendered label falls back to the raw type string instead of "Bedrijfsgegevens gewijzigd".

- [ ] **Step 3: Add the new `ActiviteitType` value**

In `src/lib/logActiviteit.ts`, change:
```ts
  | 'prijsgroep_toegevoegd'
  | 'prijsgroep_gewijzigd'
  | 'prijsgroep_verwijderd';
```
to:
```ts
  | 'prijsgroep_toegevoegd'
  | 'prijsgroep_gewijzigd'
  | 'prijsgroep_verwijderd'
  | 'bedrijfsgegevens_gewijzigd';
```

- [ ] **Step 4: Add the label mapping**

In `src/components/beheer/ActiviteitSection.tsx`, change:
```ts
  prijsgroep_toegevoegd: 'activiteitTypePrijsgroepToegevoegd',
  prijsgroep_gewijzigd: 'activiteitTypePrijsgroepGewijzigd',
  prijsgroep_verwijderd: 'activiteitTypePrijsgroepVerwijderd',
};
```
to:
```ts
  prijsgroep_toegevoegd: 'activiteitTypePrijsgroepToegevoegd',
  prijsgroep_gewijzigd: 'activiteitTypePrijsgroepGewijzigd',
  prijsgroep_verwijderd: 'activiteitTypePrijsgroepVerwijderd',
  bedrijfsgegevens_gewijzigd: 'activiteitTypeBedrijfsgegevensGewijzigd',
};
```

- [ ] **Step 5: Add the translation key**

In `messages/nl.json`, in the `beheer` namespace, change:
```json
    "activiteitTypePrijsgroepVerwijderd": "Prijsgroep verwijderd",
    "navGlassartDesign": "Glassart and Design",
```
to:
```json
    "activiteitTypePrijsgroepVerwijderd": "Prijsgroep verwijderd",
    "activiteitTypeBedrijfsgegevensGewijzigd": "Bedrijfsgegevens gewijzigd",
    "navGlassartDesign": "Glassart and Design",
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/components/beheer/ActiviteitSection.test.tsx`
Expected: PASS (all tests, including the new one)

- [ ] **Step 7: Update `firestore.rules`**

Add the `instellingen` collection rule. Change:
```
    match /prijsgroepen/{id} {
      allow read: if true;
      allow write: if request.auth != null && exists(/databases/$(database)/documents/medewerkers/$(request.auth.uid));
    }
    match /klanten/{uid} {
```
to:
```
    match /prijsgroepen/{id} {
      allow read: if true;
      allow write: if request.auth != null && exists(/databases/$(database)/documents/medewerkers/$(request.auth.uid));
    }
    match /instellingen/{id} {
      allow read: if true;
      allow write: if request.auth != null && exists(/databases/$(database)/documents/medewerkers/$(request.auth.uid));
    }
    match /klanten/{uid} {
```

(Note: a `prijsgroepen/{id}` rule already exists on `main` as of a concurrent commit — this step adds `instellingen` right after it, not after `kunstwerken`.)

Add `bedrijfsgegevens_gewijzigd` to the activiteitenlog `type in [...]` allowlist. Change:
```
           'kunstwerk_toegevoegd','kunstwerk_gewijzigd','kunstwerk_verwijderd',
           'prijsgroep_toegevoegd','prijsgroep_gewijzigd','prijsgroep_verwijderd']
```
to:
```
           'kunstwerk_toegevoegd','kunstwerk_gewijzigd','kunstwerk_verwijderd',
           'prijsgroep_toegevoegd','prijsgroep_gewijzigd','prijsgroep_verwijderd',
           'bedrijfsgegevens_gewijzigd']
```

- [ ] **Step 8: Deploy the updated rules**

Run: `npx --yes firebase-tools deploy --only firestore:rules`
Expected: "Deploy complete!"

- [ ] **Step 9: Commit**

```bash
git add src/lib/logActiviteit.ts src/components/beheer/ActiviteitSection.tsx messages/nl.json firestore.rules tests/components/beheer/ActiviteitSection.test.tsx
git commit -m "feat: add bedrijfsgegevens_gewijzigd activity type and instellingen security rule"
```

---

## Task 3: Bedrijfsgegevens-types, seed-data en GlassartDesignSection-component

**Files:**
- Create: `src/components/beheer/bedrijfsgegevensTypes.ts`
- Create: `src/data/bedrijfsgegevensSeed.ts`
- Create: `src/components/beheer/GlassartDesignSection.tsx`
- Modify: `messages/nl.json` (beheer namespace)
- Test: `tests/components/beheer/GlassartDesignSection.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (uses only `useAdminAuth`, `logActiviteit`/`actorFromMedewerker` from Task 2's `ActiviteitType`).
- Produces: `Bedrijfsgegevens`, `Contactpersoon`, `Taal` types and `BEDRIJFSGEGEVENS_SEED` constant — used by Task 5 (`BeheerShell.tsx`) and Task 6 (`ContactInfo.tsx`). `GlassartDesignSection` component with props `{ bedrijfsgegevens: Bedrijfsgegevens | null; loadError: string | null; onSave: (data: Bedrijfsgegevens) => Promise<boolean> }` — used by Task 5.

- [ ] **Step 1: Create the types file**

Create `src/components/beheer/bedrijfsgegevensTypes.ts`:

```ts
export type Taal = 'nl' | 'en' | 'fr' | 'de';

export type MeertaligeTekst = Record<Taal, string>;

export interface Contactpersoon {
  id: string;
  naam: string;
  telefoon: string;
  rol: MeertaligeTekst;
}

export interface Bedrijfsgegevens {
  bezoekadres: string;
  email: string;
  whatsappNummer: string;
  iban: string;
  kvkNummer: string;
  btwNummer: string;
  openingstijden: MeertaligeTekst;
  contactpersonen: Contactpersoon[];
}
```

- [ ] **Step 2: Create the seed data file**

Create `src/data/bedrijfsgegevensSeed.ts`:

```ts
import type { Bedrijfsgegevens } from '@/components/beheer/bedrijfsgegevensTypes';

export const BEDRIJFSGEGEVENS_SEED: Bedrijfsgegevens = {
  bezoekadres: 'Den Heuvel 21, 5688 EM Oirschot',
  email: 'info@glassartdesign.nl',
  whatsappNummer: '31600000000',
  iban: 'NL00 BANK 0123 4567 89',
  kvkNummer: '12345678',
  btwNummer: 'NL123456789B01',
  openingstijden: { nl: 'Ma–vr: 09:00 – 17:00', en: '', fr: '', de: '' },
  contactpersonen: [
    {
      id: 'seed-paul',
      naam: 'Paul van den Hout',
      telefoon: '+31651404089',
      rol: { nl: 'Voor projecten, hotels etc.', en: '', fr: '', de: '' },
    },
    {
      id: 'seed-hem',
      naam: 'Hem Brekoo',
      telefoon: '+31653736756',
      rol: { nl: 'Voor zakelijke klanten (B2B)', en: '', fr: '', de: '' },
    },
  ],
};
```

- [ ] **Step 3: Add the beheer translation keys**

In `messages/nl.json`, in the `beheer` namespace, add these lines at the very end (right after `"prijsgroepenVerwijderen": "Verwijderen"`, which needs a trailing comma added):

```json
    "prijsgroepenVerwijderen": "Verwijderen",
    "glassartDesignLoadError": "Kon de bedrijfsgegevens niet laden. Probeer de pagina te verversen.",
    "glassartDesignActionError": "Er is iets misgegaan. Probeer het opnieuw.",
    "glassartDesignLabelBezoekadres": "Bezoekadres",
    "glassartDesignLabelContactpersonen": "Contactpersonen",
    "glassartDesignLabelNaam": "Naam",
    "glassartDesignLabelTelefoon": "Telefoonnummer",
    "glassartDesignLabelRol": "Rol",
    "glassartDesignContactpersoonToevoegen": "+ Contactpersoon toevoegen",
    "glassartDesignLabelEmail": "E-mailadres",
    "glassartDesignLabelWhatsapp": "WhatsApp-nummer",
    "glassartDesignLabelIban": "IBAN",
    "glassartDesignLabelKvk": "KvK-nummer",
    "glassartDesignLabelBtw": "BTW-nummer",
    "glassartDesignLabelOpeningstijden": "Openingstijden",
    "glassartDesignOpslaan": "Opslaan"
```

(The closing `}` lines that follow stay unchanged.)

- [ ] **Step 4: Write the failing tests**

Create `tests/components/beheer/GlassartDesignSection.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { GlassartDesignSection } from '@/components/beheer/GlassartDesignSection';
import type { Bedrijfsgegevens } from '@/components/beheer/bedrijfsgegevensTypes';
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

const BEDRIJFSGEGEVENS: Bedrijfsgegevens = {
  bezoekadres: 'Den Heuvel 21, 5688 EM Oirschot',
  email: 'info@glassartdesign.nl',
  whatsappNummer: '31600000000',
  iban: 'NL00 BANK 0123 4567 89',
  kvkNummer: '12345678',
  btwNummer: 'NL123456789B01',
  openingstijden: { nl: 'Ma–vr: 09:00 – 17:00', en: '', fr: '', de: '' },
  contactpersonen: [
    {
      id: 'p1',
      naam: 'Paul van den Hout',
      telefoon: '+31651404089',
      rol: { nl: 'Voor projecten, hotels etc.', en: '', fr: '', de: '' },
    },
  ],
};

function renderSection(overrides: Partial<React.ComponentProps<typeof GlassartDesignSection>> = {}) {
  const onSave = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <GlassartDesignSection
        bedrijfsgegevens={BEDRIJFSGEGEVENS}
        loadError={null}
        onSave={onSave}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  return { onSave };
}

describe('GlassartDesignSection', () => {
  it('shows the load error instead of the form when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('glassart-design-error')).toHaveTextContent('Kon niet laden.');
    expect(screen.queryByTestId('glassart-design-section')).not.toBeInTheDocument();
  });

  it('renders nothing while bedrijfsgegevens is null and there is no error', () => {
    renderSection({ bedrijfsgegevens: null });
    expect(screen.queryByTestId('glassart-design-section')).not.toBeInTheDocument();
  });

  it('pre-fills the form fields from bedrijfsgegevens', () => {
    renderSection();
    expect(screen.getByTestId('glassart-design-bezoekadres')).toHaveValue('Den Heuvel 21, 5688 EM Oirschot');
    expect(screen.getByTestId('glassart-design-email')).toHaveValue('info@glassartdesign.nl');
    expect(screen.getByTestId('glassart-design-whatsapp')).toHaveValue('31600000000');
    expect(screen.getByTestId('glassart-design-iban')).toHaveValue('NL00 BANK 0123 4567 89');
    expect(screen.getByTestId('glassart-design-kvk')).toHaveValue('12345678');
    expect(screen.getByTestId('glassart-design-btw')).toHaveValue('NL123456789B01');
    expect(screen.getByTestId('glassart-design-openingstijden')).toHaveValue('Ma–vr: 09:00 – 17:00');
    expect(screen.getByTestId('glassart-design-contactpersoon-p1-naam')).toHaveValue('Paul van den Hout');
    expect(screen.getByTestId('glassart-design-contactpersoon-p1-telefoon')).toHaveValue('+31651404089');
    expect(screen.getByTestId('glassart-design-contactpersoon-p1-rol')).toHaveValue('Voor projecten, hotels etc.');
  });

  it('switches the openingstijden and rol fields to the EN tab without losing the NL values', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('glassart-design-taal-en'));
    expect(screen.getByTestId('glassart-design-openingstijden')).toHaveValue('');
    expect(screen.getByTestId('glassart-design-contactpersoon-p1-rol')).toHaveValue('');
    fireEvent.change(screen.getByTestId('glassart-design-openingstijden'), {
      target: { value: 'Mon-Fri: 9-17' },
    });
    fireEvent.click(screen.getByTestId('glassart-design-taal-nl'));
    expect(screen.getByTestId('glassart-design-openingstijden')).toHaveValue('Ma–vr: 09:00 – 17:00');
  });

  it('adds a new empty contactpersoon row', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('glassart-design-contactpersoon-toevoegen'));
    const rows = screen.getAllByPlaceholderText('Naam');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveValue('');
  });

  it('removes a contactpersoon row', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('glassart-design-contactpersoon-p1-verwijderen'));
    expect(screen.queryByTestId('glassart-design-contactpersoon-p1-naam')).not.toBeInTheDocument();
  });

  it('saves the form and logs bedrijfsgegevens_gewijzigd', async () => {
    const { onSave } = renderSection();
    fireEvent.change(screen.getByTestId('glassart-design-email'), {
      target: { value: 'nieuw@glassartdesign.nl' },
    });
    fireEvent.click(screen.getByTestId('glassart-design-opslaan'));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ email: 'nieuw@glassartdesign.nl' }))
    );
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('bedrijfsgegevens_gewijzigd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('shows an action error and does not log when onSave fails', async () => {
    renderSection({ onSave: vi.fn().mockResolvedValue(false) });
    fireEvent.click(screen.getByTestId('glassart-design-opslaan'));
    expect(await screen.findByTestId('glassart-design-error-message')).toHaveTextContent(
      'Er is iets misgegaan. Probeer het opnieuw.'
    );
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/GlassartDesignSection.test.tsx`
Expected: FAIL with "Cannot find module '@/components/beheer/GlassartDesignSection'"

- [ ] **Step 6: Implement `GlassartDesignSection`**

Create `src/components/beheer/GlassartDesignSection.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Bedrijfsgegevens, Contactpersoon, Taal } from './bedrijfsgegevensTypes';

interface GlassartDesignSectionProps {
  bedrijfsgegevens: Bedrijfsgegevens | null;
  loadError: string | null;
  onSave: (data: Bedrijfsgegevens) => Promise<boolean>;
}

const TALEN: Taal[] = ['nl', 'en', 'fr', 'de'];

const INPUT_CLASS = 'rounded-sm bg-black/40 px-3 py-2 text-sm text-white';
const LABEL_CLASS = 'flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60';

function maakLegeContactpersoon(): Contactpersoon {
  return {
    id: crypto.randomUUID(),
    naam: '',
    telefoon: '',
    rol: { nl: '', en: '', fr: '', de: '' },
  };
}

export function GlassartDesignSection({ bedrijfsgegevens, loadError, onSave }: GlassartDesignSectionProps) {
  const t = useTranslations('beheer');
  const { user } = useAdminAuth();
  const [form, setForm] = useState<Bedrijfsgegevens | null>(bedrijfsgegevens);
  const [taal, setTaal] = useState<Taal>('nl');
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setForm(bedrijfsgegevens);
  }, [bedrijfsgegevens]);

  if (loadError) {
    return (
      <p data-testid="glassart-design-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (form === null) {
    return null;
  }

  function updateField<K extends keyof Bedrijfsgegevens>(key: K, value: Bedrijfsgegevens[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function updateOpeningstijden(waarde: string) {
    if (!form) return;
    updateField('openingstijden', { ...form.openingstijden, [taal]: waarde });
  }

  function addContactpersoon() {
    if (!form) return;
    updateField('contactpersonen', [...form.contactpersonen, maakLegeContactpersoon()]);
  }

  function removeContactpersoon(id: string) {
    if (!form) return;
    updateField(
      'contactpersonen',
      form.contactpersonen.filter((persoon) => persoon.id !== id)
    );
  }

  function updateContactpersoon(id: string, veld: 'naam' | 'telefoon', waarde: string) {
    if (!form) return;
    updateField(
      'contactpersonen',
      form.contactpersonen.map((persoon) => (persoon.id === id ? { ...persoon, [veld]: waarde } : persoon))
    );
  }

  function updateContactpersoonRol(id: string, waarde: string) {
    if (!form) return;
    updateField(
      'contactpersonen',
      form.contactpersonen.map((persoon) =>
        persoon.id === id ? { ...persoon, rol: { ...persoon.rol, [taal]: waarde } } : persoon
      )
    );
  }

  async function handleSave() {
    if (!form) return;
    setActionError(null);
    const success = await onSave(form);
    if (success) {
      void logActiviteit('bedrijfsgegevens_gewijzigd', actorFromMedewerker(user));
    } else {
      setActionError(t('glassartDesignActionError'));
    }
  }

  return (
    <div data-testid="glassart-design-section" className="flex flex-col gap-6 text-sm text-white/80">
      <div className="flex gap-1">
        {TALEN.map((item) => (
          <button
            key={item}
            type="button"
            data-testid={`glassart-design-taal-${item}`}
            onClick={() => setTaal(item)}
            className={`rounded-sm px-3 py-1 text-xs uppercase tracking-wide ${
              taal === item ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      <label className={LABEL_CLASS}>
        {t('glassartDesignLabelBezoekadres')}
        <input
          type="text"
          value={form.bezoekadres}
          onChange={(event) => updateField('bezoekadres', event.target.value)}
          data-testid="glassart-design-bezoekadres"
          className={INPUT_CLASS}
        />
      </label>

      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-white/60">
          {t('glassartDesignLabelContactpersonen')}
        </p>
        <div className="flex flex-col gap-3">
          {form.contactpersonen.map((persoon) => (
            <div
              key={persoon.id}
              data-testid={`glassart-design-contactpersoon-${persoon.id}`}
              className="flex flex-col gap-2 rounded-sm border border-white/10 p-3"
            >
              <input
                type="text"
                value={persoon.naam}
                onChange={(event) => updateContactpersoon(persoon.id, 'naam', event.target.value)}
                placeholder={t('glassartDesignLabelNaam')}
                data-testid={`glassart-design-contactpersoon-${persoon.id}-naam`}
                className={INPUT_CLASS}
              />
              <input
                type="text"
                value={persoon.telefoon}
                onChange={(event) => updateContactpersoon(persoon.id, 'telefoon', event.target.value)}
                placeholder={t('glassartDesignLabelTelefoon')}
                data-testid={`glassart-design-contactpersoon-${persoon.id}-telefoon`}
                className={INPUT_CLASS}
              />
              <input
                type="text"
                value={persoon.rol[taal]}
                onChange={(event) => updateContactpersoonRol(persoon.id, event.target.value)}
                placeholder={t('glassartDesignLabelRol')}
                data-testid={`glassart-design-contactpersoon-${persoon.id}-rol`}
                className={INPUT_CLASS}
              />
              <button
                type="button"
                onClick={() => removeContactpersoon(persoon.id)}
                data-testid={`glassart-design-contactpersoon-${persoon.id}-verwijderen`}
                className="self-end rounded-full bg-black/50 px-3 py-1 text-xs text-white/70 hover:text-white"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addContactpersoon}
          data-testid="glassart-design-contactpersoon-toevoegen"
          className="mt-3 rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
        >
          {t('glassartDesignContactpersoonToevoegen')}
        </button>
      </div>

      <label className={LABEL_CLASS}>
        {t('glassartDesignLabelEmail')}
        <input
          type="text"
          value={form.email}
          onChange={(event) => updateField('email', event.target.value)}
          data-testid="glassart-design-email"
          className={INPUT_CLASS}
        />
      </label>

      <label className={LABEL_CLASS}>
        {t('glassartDesignLabelWhatsapp')}
        <input
          type="text"
          value={form.whatsappNummer}
          onChange={(event) => updateField('whatsappNummer', event.target.value)}
          data-testid="glassart-design-whatsapp"
          className={INPUT_CLASS}
        />
      </label>

      <label className={LABEL_CLASS}>
        {t('glassartDesignLabelIban')}
        <input
          type="text"
          value={form.iban}
          onChange={(event) => updateField('iban', event.target.value)}
          data-testid="glassart-design-iban"
          className={INPUT_CLASS}
        />
      </label>

      <label className={LABEL_CLASS}>
        {t('glassartDesignLabelKvk')}
        <input
          type="text"
          value={form.kvkNummer}
          onChange={(event) => updateField('kvkNummer', event.target.value)}
          data-testid="glassart-design-kvk"
          className={INPUT_CLASS}
        />
      </label>

      <label className={LABEL_CLASS}>
        {t('glassartDesignLabelBtw')}
        <input
          type="text"
          value={form.btwNummer}
          onChange={(event) => updateField('btwNummer', event.target.value)}
          data-testid="glassart-design-btw"
          className={INPUT_CLASS}
        />
      </label>

      <label className={LABEL_CLASS}>
        {t('glassartDesignLabelOpeningstijden')}
        <input
          type="text"
          value={form.openingstijden[taal]}
          onChange={(event) => updateOpeningstijden(event.target.value)}
          data-testid="glassart-design-openingstijden"
          className={INPUT_CLASS}
        />
      </label>

      {actionError && (
        <p data-testid="glassart-design-error-message" className="text-xs text-red-400">
          {actionError}
        </p>
      )}

      <button
        type="button"
        onClick={handleSave}
        data-testid="glassart-design-opslaan"
        className="self-start rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
      >
        {t('glassartDesignOpslaan')}
      </button>
    </div>
  );
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/GlassartDesignSection.test.tsx`
Expected: PASS (8 tests)

- [ ] **Step 8: Commit**

```bash
git add src/components/beheer/bedrijfsgegevensTypes.ts src/data/bedrijfsgegevensSeed.ts src/components/beheer/GlassartDesignSection.tsx messages/nl.json tests/components/beheer/GlassartDesignSection.test.tsx
git commit -m "feat: add GlassartDesignSection beheer form for company info"
```

---

## Task 4: BeheerNav — Glassart & Design activeren

**Files:**
- Modify: `src/components/beheer/BeheerNav.tsx`
- Test: `tests/components/beheer/BeheerNav.test.tsx`

**Interfaces:**
- Produces: `BeheerSection` includes `'glassartDesign'` — used by Task 5 (`BeheerShell.tsx`).

- [ ] **Step 1: Write the failing tests**

In `tests/components/beheer/BeheerNav.test.tsx`, replace the first test in the `describe` block:

```tsx
  it('renders the 8 active items with their counters, and the 2 disabled placeholder items', () => {
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

    ['glassartDesign'].forEach((id) => {
      expect(screen.getByTestId(`beheer-nav-${id}`)).toBeDisabled();
    });
  });
```

with:

```tsx
  it('renders the 10 active items with their counters, and no disabled placeholder items', () => {
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
  });

  it('does not show a count badge on the Glassart & Design item', () => {
    renderNav();
    const item = screen.getByTestId('beheer-nav-glassartDesign');
    expect(item.querySelectorAll('span')).toHaveLength(1);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/BeheerNav.test.tsx`
Expected: FAIL — `beheer-nav-glassartDesign` is still `disabled`, and it currently renders as a plain `<button>` with no `<span>` at all (0, not 1).

- [ ] **Step 3: Activate the nav item**

In `src/components/beheer/BeheerNav.tsx`, change the `BeheerSection` type:
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
  | 'activiteit';
```
to:
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

Change the `ACTIVE_ITEMS`/`DISABLED_ITEMS` declarations:
```ts
const ACTIVE_ITEMS: { id: BeheerSection; labelKey: string }[] = [
  { id: 'klanten', labelKey: 'navKlanten' },
  { id: 'bestellingen', labelKey: 'navBestellingen' },
  { id: 'materiaalsoorten', labelKey: 'navMateriaalsoorten' },
  { id: 'materialen', labelKey: 'navMaterialen' },
  { id: 'maten', labelKey: 'navMaten' },
  { id: 'segmenten', labelKey: 'navSegmenten' },
  { id: 'kunstwerken', labelKey: 'navKunstwerken' },
  { id: 'prijsgroepen', labelKey: 'navPrijsgroepen' },
  { id: 'activiteit', labelKey: 'navActiviteit' },
];

const DISABLED_ITEMS: { id: string; labelKey: string }[] = [
  { id: 'glassartDesign', labelKey: 'navGlassartDesign' },
];
```
to:
```ts
const ACTIVE_ITEMS: { id: BeheerSection; labelKey: string }[] = [
  { id: 'klanten', labelKey: 'navKlanten' },
  { id: 'bestellingen', labelKey: 'navBestellingen' },
  { id: 'materiaalsoorten', labelKey: 'navMateriaalsoorten' },
  { id: 'materialen', labelKey: 'navMaterialen' },
  { id: 'maten', labelKey: 'navMaten' },
  { id: 'segmenten', labelKey: 'navSegmenten' },
  { id: 'kunstwerken', labelKey: 'navKunstwerken' },
  { id: 'prijsgroepen', labelKey: 'navPrijsgroepen' },
  { id: 'activiteit', labelKey: 'navActiviteit' },
  { id: 'glassartDesign', labelKey: 'navGlassartDesign' },
];

const DISABLED_ITEMS: { id: string; labelKey: string }[] = [];
```

Change the `counts` record type and construction:
```ts
  const t = useTranslations('beheer');
  const counts: Record<BeheerSection, number> = {
    klanten: klantenCount,
    bestellingen: bestellingenCount,
    materiaalsoorten: materiaalsoortenCount,
    materialen: materialenCount,
    maten: matenCount,
    segmenten: segmentenCount,
    kunstwerken: kunstwerkenCount,
    prijsgroepen: prijsgroepenCount,
    activiteit: activiteitCount,
  };
```
to:
```ts
  const t = useTranslations('beheer');
  const counts: Partial<Record<BeheerSection, number>> = {
    klanten: klantenCount,
    bestellingen: bestellingenCount,
    materiaalsoorten: materiaalsoortenCount,
    materialen: materialenCount,
    maten: matenCount,
    segmenten: segmentenCount,
    kunstwerken: kunstwerkenCount,
    prijsgroepen: prijsgroepenCount,
    activiteit: activiteitCount,
  };
```

Change the badge rendering so it's optional:
```tsx
          <span>{t(item.labelKey)}</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.65rem]">{counts[item.id]}</span>
        </button>
```
to:
```tsx
          <span>{t(item.labelKey)}</span>
          {counts[item.id] !== undefined && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.65rem]">{counts[item.id]}</span>
          )}
        </button>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/BeheerNav.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/BeheerNav.tsx tests/components/beheer/BeheerNav.test.tsx
git commit -m "feat: activate the Glassart and Design nav item in beheer"
```

---

## Task 5: BeheerShell — koppelen van bedrijfsgegevens en GlassartDesignSection

**Files:**
- Modify: `src/components/beheer/BeheerShell.tsx`
- Test: `tests/components/beheer/BeheerShell.test.tsx`

**Interfaces:**
- Consumes: `useFirestoreDocument` (Task 1), `Bedrijfsgegevens`/`BEDRIJFSGEGEVENS_SEED` (Task 3), `GlassartDesignSection` (Task 3), `BeheerSection` including `'glassartDesign'` (Task 4).

- [ ] **Step 1: Write the failing tests**

In `tests/components/beheer/BeheerShell.test.tsx`, add `getDoc`/`setDoc` mocks to the existing `vi.mock('firebase/firestore', ...)` factory. Change:
```ts
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...segments: string[]) => ({ name: segments.join('/') })),
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  addDoc: (...args: unknown[]) => addDocMock(...args),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn((collectionRef) => collectionRef),
  orderBy: vi.fn(),
  limit: vi.fn(),
}));
```
to:
```ts
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...segments: string[]) => ({ name: segments.join('/') })),
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  addDoc: (...args: unknown[]) => addDocMock(...args),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  query: vi.fn((collectionRef) => collectionRef),
  orderBy: vi.fn(),
  limit: vi.fn(),
}));
```

Add the two new mock declarations right after the existing ones. Change:
```ts
const getDocsMock = vi.fn();
const addDocMock = vi.fn();
```
to:
```ts
const getDocsMock = vi.fn();
const addDocMock = vi.fn();
const getDocMock = vi.fn();
const setDocMock = vi.fn();
```

Add a fixture and default mock. Change:
```ts
function mockCollections(overrides: Partial<typeof DEFAULT_COLLECTIONS> = {}) {
  const data = { ...DEFAULT_COLLECTIONS, ...overrides };
  getDocsMock.mockImplementation((collectionRef: { name: string }) =>
    Promise.resolve(makeSnapshot(data[collectionRef.name] ?? []))
  );
}
```
to:
```ts
const BEDRIJFSGEGEVENS_FIXTURE = {
  bezoekadres: 'Den Heuvel 21, 5688 EM Oirschot',
  email: 'info@glassartdesign.nl',
  whatsappNummer: '31600000000',
  iban: 'NL00 BANK 0123 4567 89',
  kvkNummer: '12345678',
  btwNummer: 'NL123456789B01',
  openingstijden: { nl: 'Ma–vr: 09:00 – 17:00', en: '', fr: '', de: '' },
  contactpersonen: [
    { id: 'p1', naam: 'Paul van den Hout', telefoon: '+31651404089', rol: { nl: 'Voor projecten, hotels etc.', en: '', fr: '', de: '' } },
  ],
};

function mockCollections(overrides: Partial<typeof DEFAULT_COLLECTIONS> = {}) {
  const data = { ...DEFAULT_COLLECTIONS, ...overrides };
  getDocsMock.mockImplementation((collectionRef: { name: string }) =>
    Promise.resolve(makeSnapshot(data[collectionRef.name] ?? []))
  );
  getDocMock.mockResolvedValue({ exists: () => true, data: () => BEDRIJFSGEGEVENS_FIXTURE });
}
```

Add the reset calls. Change:
```ts
beforeEach(() => {
  getDocsMock.mockReset();
  addDocMock.mockReset();
});
```
to:
```ts
beforeEach(() => {
  getDocsMock.mockReset();
  addDocMock.mockReset();
  getDocMock.mockReset();
  setDocMock.mockReset();
});
```

Add these two tests at the end of the `describe('BeheerShell', ...)` block, right before its closing `});`:
```tsx

  it('shows the Glassart & Design section with the loaded bedrijfsgegevens when the nav item is clicked', async () => {
    mockCollections();
    renderShell();
    screen.getByTestId('beheer-nav-glassartDesign').click();
    expect(await screen.findByTestId('glassart-design-section')).toBeInTheDocument();
    expect(screen.getByTestId('glassart-design-bezoekadres')).toHaveValue('Den Heuvel 21, 5688 EM Oirschot');
  });

  it('saves bedrijfsgegevens through setDoc and logs bedrijfsgegevens_gewijzigd', async () => {
    mockCollections();
    setDocMock.mockResolvedValue(undefined);
    renderShell();
    screen.getByTestId('beheer-nav-glassartDesign').click();
    await screen.findByTestId('glassart-design-section');
    fireEvent.change(screen.getByTestId('glassart-design-email'), {
      target: { value: 'nieuw@glassartdesign.nl' },
    });
    fireEvent.click(screen.getByTestId('glassart-design-opslaan'));
    await waitFor(() =>
      expect(setDocMock).toHaveBeenCalledWith(
        { collectionName: 'instellingen', id: 'bedrijfsgegevens' },
        expect.objectContaining({ email: 'nieuw@glassartdesign.nl' })
      )
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/BeheerShell.test.tsx`
Expected: FAIL — clicking `beheer-nav-glassartDesign` shows the `ActiviteitSection` (the current fallback branch), not a `glassart-design-section`.

- [ ] **Step 3: Wire up `BeheerShell.tsx`**

Add the new imports. Change:
```ts
import { SegmentenSection } from './SegmentenSection';
import { KunstwerkenSection } from './KunstwerkenSection';
import { PrijsgroepenSection } from './PrijsgroepenSection';
import { ActiviteitSection, type Activiteit } from './ActiviteitSection';
import type { Materiaalsoort, Materiaal, Maat, Segment, Kunstwerk, Prijsgroep } from './materiaalTypes';
import type { ActiviteitType } from '@/lib/logActiviteit';
import { useFirestoreCollection } from '@/lib/useFirestoreCollection';
import { MATERIAALSOORTEN_SEED, buildMaterialenSeed } from '@/data/materiaalsoortenSeed';
import { SEGMENTEN_SEED, MATEN_SEED, buildKunstwerkenSeed } from '@/data/kunstwerkenSeed';
```
to:
```ts
import { SegmentenSection } from './SegmentenSection';
import { KunstwerkenSection } from './KunstwerkenSection';
import { PrijsgroepenSection } from './PrijsgroepenSection';
import { ActiviteitSection, type Activiteit } from './ActiviteitSection';
import { GlassartDesignSection } from './GlassartDesignSection';
import type { Materiaalsoort, Materiaal, Maat, Segment, Kunstwerk, Prijsgroep } from './materiaalTypes';
import type { Bedrijfsgegevens } from './bedrijfsgegevensTypes';
import type { ActiviteitType } from '@/lib/logActiviteit';
import { useFirestoreCollection } from '@/lib/useFirestoreCollection';
import { useFirestoreDocument } from '@/lib/useFirestoreDocument';
import { MATERIAALSOORTEN_SEED, buildMaterialenSeed } from '@/data/materiaalsoortenSeed';
import { SEGMENTEN_SEED, MATEN_SEED, buildKunstwerkenSeed } from '@/data/kunstwerkenSeed';
import { BEDRIJFSGEGEVENS_SEED } from '@/data/bedrijfsgegevensSeed';
```

Add the hook call. Change:
```ts
  const prijsgroepen = useFirestoreCollection<Prijsgroep>('prijsgroepen');
```
to:
```ts
  const prijsgroepen = useFirestoreCollection<Prijsgroep>('prijsgroepen');
  const bedrijfsgegevens = useFirestoreDocument<Bedrijfsgegevens>('instellingen', 'bedrijfsgegevens', {
    seed: BEDRIJFSGEGEVENS_SEED,
  });
```

Add the render branch. Change:
```tsx
        ) : activeSection === 'prijsgroepen' ? (
          <PrijsgroepenSection
            prijsgroepen={prijsgroepen.items}
            klanten={klanten}
            loadError={prijsgroepen.error === 'load' ? t('prijsgroepenLoadError') : null}
            onAdd={prijsgroepen.add}
            onUpdate={prijsgroepen.update}
            onRemove={prijsgroepen.remove}
          />
        ) : (
          <ActiviteitSection activiteiten={activiteiten} loadError={activiteitenLoadError} />
        )}
```
to:
```tsx
        ) : activeSection === 'prijsgroepen' ? (
          <PrijsgroepenSection
            prijsgroepen={prijsgroepen.items}
            klanten={klanten}
            loadError={prijsgroepen.error === 'load' ? t('prijsgroepenLoadError') : null}
            onAdd={prijsgroepen.add}
            onUpdate={prijsgroepen.update}
            onRemove={prijsgroepen.remove}
          />
        ) : activeSection === 'glassartDesign' ? (
          <GlassartDesignSection
            bedrijfsgegevens={bedrijfsgegevens.data}
            loadError={bedrijfsgegevens.error === 'load' ? t('glassartDesignLoadError') : null}
            onSave={bedrijfsgegevens.save}
          />
        ) : (
          <ActiviteitSection activiteiten={activiteiten} loadError={activiteitenLoadError} />
        )}
```

(Note: `klanten={klanten}` on `PrijsgroepenSection` already exists on `main` as of a concurrent commit — keep it, just add the new branch after it.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/BeheerShell.test.tsx`
Expected: PASS (all tests, including the 2 new ones)

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (no regressions in other suites)

- [ ] **Step 6: Commit**

```bash
git add src/components/beheer/BeheerShell.tsx tests/components/beheer/BeheerShell.test.tsx
git commit -m "feat: wire up bedrijfsgegevens and GlassartDesignSection in BeheerShell"
```

---

## Task 6: ContactInfo — dynamisch renderen vanuit Firestore

**Files:**
- Modify: `src/components/ContactInfo.tsx`
- Test: `tests/components/ContactInfo.test.tsx`

**Interfaces:**
- Consumes: `useFirestoreDocument` (Task 1), `Bedrijfsgegevens`/`Taal` (Task 3), `BEDRIJFSGEGEVENS_SEED` (Task 3).

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `tests/components/ContactInfo.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithIntl } from '../test-utils';
import { ContactInfo } from '@/components/ContactInfo';
import messages from '../../messages/nl.json';

const getDocMock = vi.fn();
const setDocMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  setDoc: (...args: unknown[]) => setDocMock(...args),
}));

const BEDRIJFSGEGEVENS = {
  bezoekadres: 'Den Heuvel 21, 5688 EM Oirschot',
  email: 'info@glassartdesign.nl',
  whatsappNummer: '31600000000',
  iban: 'NL00 BANK 0123 4567 89',
  kvkNummer: '12345678',
  btwNummer: 'NL123456789B01',
  openingstijden: { nl: 'Ma–vr: 09:00 – 17:00', en: 'Mon-Fri: 9-17', fr: '', de: '' },
  contactpersonen: [
    {
      id: 'seed-paul',
      naam: 'Paul van den Hout',
      telefoon: '+31651404089',
      rol: { nl: 'Voor projecten, hotels etc.', en: '', fr: '', de: '' },
    },
    {
      id: 'seed-hem',
      naam: 'Hem Brekoo',
      telefoon: '+31653736756',
      rol: { nl: 'Voor zakelijke klanten (B2B)', en: '', fr: '', de: '' },
    },
  ],
};

function mockDoc(data: typeof BEDRIJFSGEGEVENS | null) {
  getDocMock.mockResolvedValue({
    exists: () => data !== null,
    data: () => data,
  });
}

beforeEach(() => {
  getDocMock.mockReset();
  setDocMock.mockReset();
});

describe('ContactInfo', () => {
  it('renders the visiting address and a directions link from Firestore', async () => {
    mockDoc(BEDRIJFSGEGEVENS);
    renderWithIntl(<ContactInfo />, 'nl', messages);
    expect(await screen.findByTestId('contact-address')).toHaveTextContent(
      'Den Heuvel 21, 5688 EM Oirschot'
    );
    expect(screen.getByTestId('contact-directions')).toHaveAttribute(
      'href',
      expect.stringContaining('google.com/maps')
    );
  });

  it('embeds a Google Maps iframe for the address', async () => {
    mockDoc(BEDRIJFSGEGEVENS);
    renderWithIntl(<ContactInfo />, 'nl', messages);
    const iframe = await screen.findByTestId('contact-map');
    expect(iframe.tagName).toBe('IFRAME');
    expect(iframe).toHaveAttribute('src', expect.stringContaining('output=embed'));
  });

  it('renders all contact persons with correct tel links and the NL role text', async () => {
    mockDoc(BEDRIJFSGEGEVENS);
    renderWithIntl(<ContactInfo />, 'nl', messages);
    expect(await screen.findByTestId('contact-person-0')).toHaveTextContent('Paul van den Hout');
    expect(screen.getByTestId('contact-person-0')).toHaveTextContent('Voor projecten, hotels etc.');
    expect(screen.getByTestId('contact-phone-0')).toHaveAttribute('href', 'tel:+31651404089');
    expect(screen.getByTestId('contact-person-1')).toHaveTextContent('Hem Brekoo');
    expect(screen.getByTestId('contact-phone-1')).toHaveAttribute('href', 'tel:+31653736756');
  });

  it('falls back to the NL role text when the active locale has no translation', async () => {
    mockDoc(BEDRIJFSGEGEVENS);
    renderWithIntl(<ContactInfo />, 'en', messages);
    expect(await screen.findByTestId('contact-person-0')).toHaveTextContent(
      'Voor projecten, hotels etc.'
    );
  });

  it('renders a mailto link with the Firestore email address', async () => {
    mockDoc(BEDRIJFSGEGEVENS);
    renderWithIntl(<ContactInfo />, 'nl', messages);
    expect(await screen.findByTestId('contact-email')).toHaveAttribute(
      'href',
      'mailto:info@glassartdesign.nl'
    );
  });

  it('renders a WhatsApp link with the Firestore number', async () => {
    mockDoc(BEDRIJFSGEGEVENS);
    renderWithIntl(<ContactInfo />, 'nl', messages);
    expect(await screen.findByTestId('contact-whatsapp')).toHaveAttribute(
      'href',
      'https://wa.me/31600000000'
    );
  });

  it('renders opening hours for the active locale and the company registration block', async () => {
    mockDoc(BEDRIJFSGEGEVENS);
    renderWithIntl(<ContactInfo />, 'en', messages);
    expect(await screen.findByText('Mon-Fri: 9-17')).toBeInTheDocument();
    expect(screen.getByText(/KvK-nummer/)).toBeInTheDocument();
    expect(screen.getByText(/BTW-nummer/)).toBeInTheDocument();
    expect(screen.getByText(/IBAN/)).toBeInTheDocument();
  });

  it('renders nothing while the document has not loaded yet', () => {
    getDocMock.mockReturnValue(new Promise(() => {}));
    renderWithIntl(<ContactInfo />, 'nl', messages);
    expect(screen.queryByTestId('contact-address')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/ContactInfo.test.tsx`
Expected: FAIL — `ContactInfo` still renders the hardcoded constants and never calls `getDoc`, so `contact-person-0`/`contact-person-1` don't exist and the WhatsApp/openingstijden assertions don't match.

- [ ] **Step 3: Implement the dynamic `ContactInfo`**

Replace the full contents of `src/components/ContactInfo.tsx`:

```tsx
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useFirestoreDocument } from '@/lib/useFirestoreDocument';
import { BEDRIJFSGEGEVENS_SEED } from '@/data/bedrijfsgegevensSeed';
import type { Bedrijfsgegevens, Taal } from './beheer/bedrijfsgegevensTypes';

function vertaling(tekst: Record<Taal, string>, locale: string): string {
  const taal = (Object.prototype.hasOwnProperty.call(tekst, locale) ? locale : 'nl') as Taal;
  return tekst[taal] || tekst.nl;
}

export function ContactInfo() {
  const t = useTranslations('contactPage');
  const locale = useLocale();
  const { data } = useFirestoreDocument<Bedrijfsgegevens>('instellingen', 'bedrijfsgegevens', {
    seed: BEDRIJFSGEGEVENS_SEED,
  });

  if (!data) {
    return null;
  }

  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    data.bezoekadres
  )}`;
  const mapEmbedUrl = `https://www.google.com/maps?q=${encodeURIComponent(data.bezoekadres)}&output=embed`;

  return (
    <div className="flex flex-col gap-6 text-sm text-white/80">
      <div>
        <p className="text-[0.65rem] uppercase tracking-[0.2em] text-white/50">{t('visitLabel')}</p>
        <p data-testid="contact-address" className="mt-2">
          {data.bezoekadres}
        </p>
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="contact-directions"
          className="mt-1 inline-block text-xs underline decoration-white/30"
        >
          {t('planRoute')}
        </a>
        <iframe
          data-testid="contact-map"
          src={mapEmbedUrl}
          title={t('visitLabel')}
          loading="lazy"
          className="mt-4 h-48 w-full rounded border border-white/10"
        />
      </div>

      <div>
        <p className="text-[0.65rem] uppercase tracking-[0.2em] text-white/50">{t('contactsLabel')}</p>
        {data.contactpersonen.map((persoon, index) => (
          <p key={persoon.id} className={index === 0 ? 'mt-2' : 'mt-3'} data-testid={`contact-person-${index}`}>
            <strong className="text-white">{persoon.naam}</strong> — {vertaling(persoon.rol, locale)}
            <br />
            <a
              href={`tel:${persoon.telefoon}`}
              data-testid={`contact-phone-${index}`}
              className="underline decoration-white/30"
            >
              {persoon.telefoon}
            </a>
          </p>
        ))}
      </div>

      <div>
        <p className="text-[0.65rem] uppercase tracking-[0.2em] text-white/50">{t('emailLabel')}</p>
        <a
          href={`mailto:${data.email}`}
          data-testid="contact-email"
          className="mt-2 inline-block underline decoration-white/30"
        >
          {data.email}
        </a>
      </div>

      <div>
        <a
          href={`https://wa.me/${data.whatsappNummer}`}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="contact-whatsapp"
          className="inline-block rounded-sm bg-silver px-4 py-2 text-xs tracking-[0.15em] text-ink"
        >
          {t('whatsappLabel')}
        </a>
      </div>

      <div>
        <p className="text-[0.65rem] uppercase tracking-[0.2em] text-white/50">{t('hoursLabel')}</p>
        <p className="mt-2">{vertaling(data.openingstijden, locale)}</p>
      </div>

      <div>
        <p className="text-[0.65rem] uppercase tracking-[0.2em] text-white/50">{t('companyLabel')}</p>
        <p className="mt-2">
          {t('kvkLabel')}: {data.kvkNummer}
          <br />
          {t('btwLabel')}: {data.btwNummer}
          <br />
          {t('ibanLabel')}: {data.iban}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/ContactInfo.test.tsx`
Expected: PASS (8 tests)

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (no regressions)

- [ ] **Step 6: Commit**

```bash
git add src/components/ContactInfo.tsx tests/components/ContactInfo.test.tsx
git commit -m "feat: render ContactInfo dynamically from Firestore bedrijfsgegevens"
```

---

## Handmatige verificatie (na Task 6)

- [ ] Start de dev-server, log in op `/beheer`, open "Glassart and Design", wijzig een veld (bv. e-mailadres) en klik Opslaan. Ververs de pagina en controleer dat de wijziging bewaard is gebleven.
- [ ] Voeg een contactpersoon toe, sla op, ververs, en controleer dat deze nog steeds getoond wordt met naam/telefoon/rol.
- [ ] Open de publieke contactpagina (`/nl/contact`) en controleer dat de zojuist gewijzigde gegevens daar verschijnen.
- [ ] Open `/en/contact` en controleer dat rol/openingstijden terugvallen op de NL-tekst zolang het EN-tabblad in beheer niet is ingevuld.
- [ ] Controleer in het Activiteitenlog (`/beheer` → Activiteitenlog) dat de wijziging als "Bedrijfsgegevens gewijzigd" verschijnt.
