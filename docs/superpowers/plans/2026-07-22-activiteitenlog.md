# Activiteitenlog Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 22-07-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log 7 site events (kunstwerk-kliks, mandje-toevoegingen, bestellingen, en bezoeken aan account/beheer/word-klant) to a new Firestore `activiteiten`-collectie, met de identiteit van de actor, en toon ze in een nieuw "Activiteit"-scherm in Beheer.

**Architecture:** Eén gedeelde write-helper (`src/lib/logActiviteit.ts`) die fire-and-forget naar Firestore schrijft, aangeroepen vanaf 7 bestaande plekken in de UI. `useCustomerAuth` wordt uitgebreid met bedrijfsnaam/contactpersoon zodat geen extra Firestore-read per event nodig is. Een nieuwe `ActiviteitSection.tsx` (op de bestaande generieke `DataTable`) toont de meest recente 500 activiteiten in Beheer.

**Tech Stack:** Next.js (App Router), React, TypeScript, Firebase Firestore, next-intl, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-22-activiteitenlog-design.md`

## Global Constraints

- Firestore-collectienaam: `activiteiten`. Documentvelden exact: `type`, `actorId`, `actorEmail`, `actorNaam`, `timestamp` — geen andere velden.
- `type` is één van exact deze 7 waarden: `kunstwerk_bekeken`, `mandje_toegevoegd`, `bestelling_geplaatst`, `account_bezocht`, `beheer_bezocht`, `word_klant_bezocht`, `word_klant_aanvraag`.
- Bij een niet-ingelogde/onbekende actor: `actorId = null`, `actorEmail = "Onbekend"`, `actorNaam = "Onbekend"`.
- Elke log-write is fire-and-forget: een mislukte write mag nooit de onderliggende actie blokkeren of een zichtbare foutmelding tonen.
- `kunstwerk_bekeken` wordt alleen gelogd voor ingelogde klanten (anonieme kliks worden overgeslagen). Alle overige events loggen ook anonieme/"Onbekend"-actoren waar van toepassing.
- Vertalingen alleen in `messages/nl.json`, in de bestaande (Nederlands-only) `beheer`-namespace — geen wijzigingen aan `en.json`/`de.json`/`fr.json`.
- Beheer-overzicht haalt alleen de meest recente 500 activiteiten op (`orderBy('timestamp','desc'), limit(500)`), niet de volledige collectie.

---

## Task 1: `logActiviteit` library module

**Files:**
- Create: `src/lib/logActiviteit.ts`
- Test: `tests/lib/logActiviteit.test.ts`

**Interfaces:**
- Produces: `logActiviteit(type: ActiviteitType, actor: ActiviteitActor): Promise<void>`, `actorFromCustomer(user: { uid: string; email: string | null; companyName: string | null; contactPerson: string | null } | null): ActiviteitActor`, `actorFromMedewerker(user: { uid: string; email: string | null } | null): ActiviteitActor`, `ONBEKENDE_ACTOR: ActiviteitActor`, and the exported type `ActiviteitType`. All later tasks consume these.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/logActiviteit.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  logActiviteit,
  actorFromCustomer,
  actorFromMedewerker,
  ONBEKENDE_ACTOR,
} from '@/lib/logActiviteit';

const addDocMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ name })),
  addDoc: (...args: unknown[]) => addDocMock(...args),
  serverTimestamp: () => 'SERVER_TIMESTAMP',
}));

beforeEach(() => {
  addDocMock.mockReset();
});

describe('logActiviteit', () => {
  it('writes a document with type, actor fields and a server timestamp', async () => {
    addDocMock.mockResolvedValue({ id: 'log-1' });
    await logActiviteit('kunstwerk_bekeken', {
      id: 'uid-1',
      email: 'klant@example.com',
      naam: 'Testbedrijf BV',
    });
    expect(addDocMock).toHaveBeenCalledWith(
      { name: 'activiteiten' },
      {
        type: 'kunstwerk_bekeken',
        actorId: 'uid-1',
        actorEmail: 'klant@example.com',
        actorNaam: 'Testbedrijf BV',
        timestamp: 'SERVER_TIMESTAMP',
      }
    );
  });

  it('never throws when the write fails', async () => {
    addDocMock.mockRejectedValue(new Error('permission-denied'));
    await expect(logActiviteit('mandje_toegevoegd', ONBEKENDE_ACTOR)).resolves.toBeUndefined();
  });
});

describe('actorFromCustomer', () => {
  it('returns ONBEKENDE_ACTOR for a null user', () => {
    expect(actorFromCustomer(null)).toEqual(ONBEKENDE_ACTOR);
  });

  it('uses companyName as naam when present', () => {
    expect(
      actorFromCustomer({
        uid: 'uid-1',
        email: 'klant@example.com',
        companyName: 'Testbedrijf BV',
        contactPerson: 'Jan Jansen',
      })
    ).toEqual({ id: 'uid-1', email: 'klant@example.com', naam: 'Testbedrijf BV' });
  });

  it('falls back to contactPerson when companyName is missing', () => {
    expect(
      actorFromCustomer({
        uid: 'uid-1',
        email: 'klant@example.com',
        companyName: null,
        contactPerson: 'Jan Jansen',
      })
    ).toEqual({ id: 'uid-1', email: 'klant@example.com', naam: 'Jan Jansen' });
  });

  it('falls back to "Onbekend" for naam/email when both are missing', () => {
    expect(
      actorFromCustomer({ uid: 'uid-1', email: null, companyName: null, contactPerson: null })
    ).toEqual({ id: 'uid-1', email: 'Onbekend', naam: 'Onbekend' });
  });
});

describe('actorFromMedewerker', () => {
  it('returns ONBEKENDE_ACTOR for a null user', () => {
    expect(actorFromMedewerker(null)).toEqual(ONBEKENDE_ACTOR);
  });

  it('uses the email as both email and naam', () => {
    expect(actorFromMedewerker({ uid: 'uid-2', email: 'paul@glassartanddesign.com' })).toEqual({
      id: 'uid-2',
      email: 'paul@glassartanddesign.com',
      naam: 'paul@glassartanddesign.com',
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/logActiviteit.test.ts`
Expected: FAIL — `Cannot find module '@/lib/logActiviteit'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/logActiviteit.ts`:

```ts
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type ActiviteitType =
  | 'kunstwerk_bekeken'
  | 'mandje_toegevoegd'
  | 'bestelling_geplaatst'
  | 'account_bezocht'
  | 'beheer_bezocht'
  | 'word_klant_bezocht'
  | 'word_klant_aanvraag';

export interface ActiviteitActor {
  id: string | null;
  email: string;
  naam: string;
}

export const ONBEKENDE_ACTOR: ActiviteitActor = { id: null, email: 'Onbekend', naam: 'Onbekend' };

export async function logActiviteit(type: ActiviteitType, actor: ActiviteitActor): Promise<void> {
  try {
    await addDoc(collection(db, 'activiteiten'), {
      type,
      actorId: actor.id,
      actorEmail: actor.email,
      actorNaam: actor.naam,
      timestamp: serverTimestamp(),
    });
  } catch {
    // Fire-and-forget: a failed log write must never block or surface an
    // error for the underlying user action (page visit, cart add, etc.).
  }
}

export function actorFromCustomer(
  user: { uid: string; email: string | null; companyName: string | null; contactPerson: string | null } | null
): ActiviteitActor {
  if (!user) {
    return ONBEKENDE_ACTOR;
  }
  return {
    id: user.uid,
    email: user.email ?? 'Onbekend',
    naam: user.companyName ?? user.contactPerson ?? 'Onbekend',
  };
}

export function actorFromMedewerker(
  user: { uid: string; email: string | null } | null
): ActiviteitActor {
  if (!user) {
    return ONBEKENDE_ACTOR;
  }
  const email = user.email ?? 'Onbekend';
  return { id: user.uid, email, naam: email };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/logActiviteit.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/logActiviteit.ts tests/lib/logActiviteit.test.ts
git commit -m "$(cat <<'EOF'
feat: add logActiviteit Firestore event-logging helper

Fire-and-forget write to a new `activiteiten` collection, plus actor
helpers that resolve a klant/medewerker to a loggable identity (or
"Onbekend"). Foundation for the 7 activity-logging call sites.
EOF
)"
```

---

## Task 2: Firestore security rules for `activiteiten`

**Files:**
- Modify: `firestore.rules`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: a `create`-permission for the exact document shape `logActiviteit` (Task 1) writes.

- [ ] **Step 1: Add the rule**

In `firestore.rules`, insert a new `match` block directly before `match /bestelheaders/{id} {`:

```
    match /activiteiten/{id} {
      allow create: if request.resource.data.type in
          ['kunstwerk_bekeken','mandje_toegevoegd','bestelling_geplaatst',
           'account_bezocht','beheer_bezocht','word_klant_bezocht','word_klant_aanvraag']
        && request.resource.data.keys().hasOnly(['type','actorId','actorEmail','actorNaam','timestamp'])
        && request.resource.data.actorEmail is string
        && request.resource.data.actorNaam is string;
      allow read: if request.auth != null &&
        exists(/databases/$(database)/documents/medewerkers/$(request.auth.uid));
      allow update, delete: if false;
    }

    match /bestelheaders/{id} {
```

(Keep the existing `bestelheaders` block and everything after it unchanged — this only inserts the new block above it.)

- [ ] **Step 2: Deploy the rules**

Run: `npx --yes firebase-tools deploy --only firestore:rules --project glassart-and-design`
Expected output includes: `+  cloud.firestore: rules file firestore.rules compiled successfully` and `+  Deploy complete!`

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "$(cat <<'EOF'
feat: add Firestore security rules for the activiteiten collection

Allows anyone (including anonymous visitors) to create a well-formed
activiteit document, matching logActiviteit's exact shape. Reading is
restricted to medewerkers, same pattern as klanten/bestelheaders.
EOF
)"
```

---

## Task 3: Extend `useCustomerAuth` with `companyName`/`contactPerson`

**Files:**
- Modify: `src/lib/useCustomerAuth.tsx`
- Test: `tests/lib/useCustomerAuth.test.tsx`

**Interfaces:**
- Produces: `CustomerUser` now has `companyName: string | null` and `contactPerson: string | null` in addition to the existing `uid`/`email` — a purely additive change. Tasks 4, 5, 6, 7 read these fields via `actorFromCustomer` (Task 1).

- [ ] **Step 1: Write the failing tests**

In `tests/lib/useCustomerAuth.test.tsx`, replace the `TestConsumer` function:

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
    </div>
  );
}
```

Add two new tests at the end of the `describe('useCustomerAuth', ...)` block, before the closing `});`:

```tsx
  it('exposes companyName and contactPerson from the klanten document', async () => {
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({ status: 'Goedgekeurd', companyName: 'Testbedrijf BV', contactPerson: 'Jan Jansen' }),
    });
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-4', email: 'klant4@example.com' });
      return () => {};
    });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('company-name')).toHaveTextContent('Testbedrijf BV'));
    expect(screen.getByTestId('contact-person')).toHaveTextContent('Jan Jansen');
  });

  it('exposes null companyName/contactPerson when no klanten document exists', async () => {
    getDocMock.mockResolvedValue({ exists: () => false });
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-5', email: 'klant5@example.com' });
      return () => {};
    });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('klant5@example.com'));
    expect(screen.getByTestId('company-name')).toHaveTextContent('none');
    expect(screen.getByTestId('contact-person')).toHaveTextContent('none');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/useCustomerAuth.test.tsx`
Expected: FAIL — `company-name`/`contact-person` testids not found (fields don't exist on `user` yet).

- [ ] **Step 3: Implement**

In `src/lib/useCustomerAuth.tsx`, change the `CustomerUser` interface:

```tsx
interface CustomerUser {
  uid: string;
  email: string | null;
  companyName: string | null;
  contactPerson: string | null;
}
```

Replace the body of the `onAuthStateChanged` callback (keep the `if (!firebaseUser) { ... }` branch unchanged) — replace this block:

```tsx
      const klantDoc = await getDoc(doc(db, 'klanten', firebaseUser.uid));
      const status = klantDoc.exists() ? (klantDoc.data() as { status?: string }).status : null;
      setUser({ uid: firebaseUser.uid, email: firebaseUser.email });
      setIsCustomer(status === 'Goedgekeurd');
      setIsHydrated(true);
```

with:

```tsx
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
      setIsCustomer(klantData?.status === 'Goedgekeurd');
      setIsHydrated(true);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/useCustomerAuth.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `npx vitest run`
Expected: PASS — no other test references `CustomerUser`'s shape directly, so this additive change should not break anything.

- [ ] **Step 6: Commit**

```bash
git add src/lib/useCustomerAuth.tsx tests/lib/useCustomerAuth.test.tsx
git commit -m "$(cat <<'EOF'
feat: expose companyName/contactPerson on useCustomerAuth's user

Additive fields on the existing klanten/{uid} read useCustomerAuth
already does for the approval status — no extra Firestore read.
Needed so activity logging can show a readable klant name.
EOF
)"
```

---

## Task 4: Log `kunstwerk_bekeken` in `ProductsGrid`

**Files:**
- Modify: `src/components/ProductsGrid.tsx`
- Modify: `tests/components/ProductsGrid.test.tsx`

**Interfaces:**
- Consumes: `logActiviteit`, `actorFromCustomer` (Task 1); `useCustomerAuth` (Task 3).

- [ ] **Step 1: Write the failing tests**

In `tests/components/ProductsGrid.test.tsx`, replace the full top section (imports through `beforeEach`) with:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ProductsGrid } from '@/components/ProductsGrid';
import { CartProvider } from '@/lib/useCart';
import { CustomerAuthProvider } from '@/lib/useCustomerAuth';
import messages from '../../messages/nl.json';

const getDocsMock = vi.fn();
const getDocMock = vi.fn();
const onAuthStateChangedMock = vi.fn();
const logActiviteitMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  db: {},
  auth: {},
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => onAuthStateChangedMock(...args),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ name })),
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: (...args: unknown[]) => logActiviteitMock(...args),
  actorFromCustomer: (
    user: { uid: string; email: string | null; companyName: string | null; contactPerson: string | null } | null
  ) =>
    user
      ? { id: user.uid, email: user.email ?? 'Onbekend', naam: user.companyName ?? user.contactPerson ?? 'Onbekend' }
      : { id: null, email: 'Onbekend', naam: 'Onbekend' },
}));

function makeSnapshot(docsData: Array<{ id: string; data: Record<string, unknown> }>) {
  return {
    empty: docsData.length === 0,
    docs: docsData.map(({ id, data }) => ({ id, data: () => data })),
  };
}

const SEGMENTEN = [
  { id: 'seg-hotel', data: { omschrijving: 'Hotel' } },
  { id: 'seg-wellness', data: { omschrijving: 'Wellness' } },
];
const KUNSTWERKEN = [
  {
    id: 'kw-1',
    data: {
      foto: 'https://example.com/kw-1.jpg',
      segmentIds: ['seg-hotel'],
      materiaalIds: ['mat-1'],
      maatIds: ['maat-1'],
      prijzen: [{ materiaalId: 'mat-1', maatId: 'maat-1', prijs: 150 }],
      omschrijvingNl: 'Hotel paneel',
      omschrijvingFr: '',
      omschrijvingDe: '',
      omschrijvingEn: '',
    },
  },
  {
    id: 'kw-2',
    data: {
      foto: 'https://example.com/kw-2.jpg',
      segmentIds: ['seg-wellness'],
      materiaalIds: ['mat-1'],
      maatIds: ['maat-1'],
      prijzen: [{ materiaalId: 'mat-1', maatId: 'maat-1', prijs: 200 }],
      omschrijvingNl: 'Wellness paneel',
      omschrijvingFr: '',
      omschrijvingDe: '',
      omschrijvingEn: '',
    },
  },
  {
    id: 'kw-3',
    data: {
      foto: 'https://example.com/kw-3.jpg',
      segmentIds: ['seg-hotel', 'seg-wellness'],
      materiaalIds: ['mat-1'],
      maatIds: ['maat-1'],
      prijzen: [{ materiaalId: 'mat-1', maatId: 'maat-1', prijs: 175 }],
      omschrijvingNl: 'Kunstwerk in beide segmenten',
      omschrijvingFr: '',
      omschrijvingDe: '',
      omschrijvingEn: '',
    },
  },
];
const MATERIALEN = [
  { id: 'mat-1', data: { materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'Veiligheidsglas' } },
];
const MATEN = [{ id: 'maat-1', data: { breedte: 40, hoogte: 60 } }];

function mockCollections() {
  const data: Record<string, Array<{ id: string; data: Record<string, unknown> }>> = {
    segmenten: SEGMENTEN,
    kunstwerken: KUNSTWERKEN,
    materialen: MATERIALEN,
    maten: MATEN,
  };
  getDocsMock.mockImplementation((collectionRef: { name: string }) =>
    Promise.resolve(makeSnapshot(data[collectionRef.name] ?? []))
  );
}

function renderProductsGrid() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerAuthProvider>
        <CartProvider>
          <ProductsGrid />
        </CartProvider>
      </CustomerAuthProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  getDocsMock.mockReset();
  getDocMock.mockReset();
  onAuthStateChangedMock.mockReset();
  logActiviteitMock.mockReset();
  mockCollections();
  getDocMock.mockResolvedValue({ exists: () => false });
  onAuthStateChangedMock.mockImplementation((_auth, callback) => {
    callback(null);
    return () => {};
  });
});
```

Keep every existing `it(...)` test in the file unchanged below this point, and add two new tests at the end of the `describe('ProductsGrid', ...)` block, just before its closing `});`:

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
      expect(logActiviteitMock).toHaveBeenCalledWith('kunstwerk_bekeken', {
        id: 'uid-1',
        email: 'klant@example.com',
        naam: 'Testbedrijf BV',
      })
    );
  });

  it('does not log kunstwerk_bekeken for an anonymous visitor', async () => {
    renderProductsGrid();
    const cards = await screen.findAllByTestId('product-card');
    fireEvent.click(cards[0]);
    expect(screen.getByTestId('product-modal')).toBeInTheDocument();
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx`
Expected: FAIL — `logActiviteitMock` never called (component doesn't call it yet); also confirm the file compiles (imports are all valid) before proceeding.

- [ ] **Step 3: Implement**

In `src/components/ProductsGrid.tsx`, add imports:

```tsx
import { useCustomerAuth } from '@/lib/useCustomerAuth';
import { logActiviteit, actorFromCustomer } from '@/lib/logActiviteit';
```

Inside `ProductsGrid()`, after the existing hooks, add:

```tsx
  const { user } = useCustomerAuth();
```

Add a new function before the `return`:

```tsx
  function handleSelect(kunstwerk: Kunstwerk) {
    setSelectedKunstwerk(kunstwerk);
    if (user) {
      void logActiviteit('kunstwerk_bekeken', actorFromCustomer(user));
    }
  }
```

Replace the card's `onClick`/`onKeyDown`:

```tsx
              onClick={() => setSelectedKunstwerk(kunstwerk)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  if (event.key === ' ') {
                    event.preventDefault();
                  }
                  setSelectedKunstwerk(kunstwerk);
                }
              }}
```

with:

```tsx
              onClick={() => handleSelect(kunstwerk)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  if (event.key === ' ') {
                    event.preventDefault();
                  }
                  handleSelect(kunstwerk);
                }
              }}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/ProductsGrid.tsx tests/components/ProductsGrid.test.tsx
git commit -m "$(cat <<'EOF'
feat: log kunstwerk_bekeken when a logged-in klant opens a product

Anonymous clicks are intentionally not logged for this event, per the
design's cost/volume trade-off for high-frequency browsing events.
EOF
)"
```

---

## Task 5: Log `mandje_toegevoegd` in `ProductModal`

**Files:**
- Modify: `src/components/ProductModal.tsx`
- Modify: `tests/components/ProductModal.test.tsx`

**Interfaces:**
- Consumes: `logActiviteit`, `actorFromCustomer` (Task 1); `useCustomerAuth` (Task 3).

- [ ] **Step 1: Write the failing tests**

In `tests/components/ProductModal.test.tsx`, update the top imports — replace:

```tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ProductModal } from '@/components/ProductModal';
import { CartProvider, useCart } from '@/lib/useCart';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort } from '@/components/beheer/materiaalTypes';
import messages from '../../messages/nl.json';
```

with:

```tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ProductModal } from '@/components/ProductModal';
import { CartProvider, useCart } from '@/lib/useCart';
import { CustomerAuthProvider } from '@/lib/useCustomerAuth';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort } from '@/components/beheer/materiaalTypes';
import messages from '../../messages/nl.json';

const onAuthStateChangedMock = vi.fn();
const getDocMock = vi.fn();
const logActiviteitMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => onAuthStateChangedMock(...args),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection, id) => ({ collection, id })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
}));

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: (...args: unknown[]) => logActiviteitMock(...args),
  actorFromCustomer: (
    user: { uid: string; email: string | null; companyName: string | null; contactPerson: string | null } | null
  ) =>
    user
      ? { id: user.uid, email: user.email ?? 'Onbekend', naam: user.companyName ?? user.contactPerson ?? 'Onbekend' }
      : { id: null, email: 'Onbekend', naam: 'Onbekend' },
}));
```

Replace the `renderModal` function:

```tsx
function renderModal(onClose: () => void = () => {}, kunstwerk: Kunstwerk | null = KUNSTWERK) {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerAuthProvider>
        <CartProvider>
          <ProductModal
            kunstwerk={kunstwerk}
            materialen={MATERIALEN}
            maten={MATEN}
            materiaalsoorten={MATERIAALSOORTEN}
            onClose={onClose}
          />
        </CartProvider>
      </CustomerAuthProvider>
    </NextIntlClientProvider>
  );
}
```

Replace the `beforeEach`/`afterEach` block:

```tsx
beforeEach(() => {
  window.localStorage.clear();
  onAuthStateChangedMock.mockReset();
  getDocMock.mockReset();
  logActiviteitMock.mockReset();
  onAuthStateChangedMock.mockImplementation((_auth, callback) => {
    callback(null);
    return () => {};
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});
```

Add two new tests at the end of the `describe('ProductModal', ...)` block, just before its closing `});`:

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
    expect(logActiviteitMock).toHaveBeenCalledWith('mandje_toegevoegd', {
      id: 'uid-1',
      email: 'klant@example.com',
      naam: 'Testbedrijf BV',
    });
  });

  it('logs mandje_toegevoegd as Onbekend for an anonymous visitor', async () => {
    vi.useRealTimers();
    renderModal();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.click(screen.getByTestId('product-modal-confirm'));
    expect(logActiviteitMock).toHaveBeenCalledWith('mandje_toegevoegd', {
      id: null,
      email: 'Onbekend',
      naam: 'Onbekend',
    });
  });
```

(`waitFor` is imported but not otherwise used by these two tests — it's fine to leave it imported for consistency with other test files in this repo; TypeScript/ESLint will not flag an unused named import that's part of a destructured import from a library unless the whole import is unused, and `waitFor` may already be needed by other pre-existing tests in this file. If `npx tsc --noEmit` later flags it as unused, remove it from the import list.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/ProductModal.test.tsx`
Expected: FAIL — `logActiviteitMock` never called.

- [ ] **Step 3: Implement**

In `src/components/ProductModal.tsx`, add imports:

```tsx
import { useCustomerAuth } from '@/lib/useCustomerAuth';
import { logActiviteit, actorFromCustomer } from '@/lib/logActiviteit';
```

Inside `ProductModal(...)`, after the existing `const { addItem } = useCart();` line, add:

```tsx
  const { user } = useCustomerAuth();
```

In `handleConfirm()`, insert a call right after `addItem({...});` and before `setIsConfirmed(true);`:

```tsx
    addItem({
      kunstwerkId: kunstwerk.id,
      foto: kunstwerk.foto,
      omschrijving,
      materiaalId,
      materiaalLabel: resolvedMateriaalLabel(gekozenMateriaal),
      maatId,
      maatLabel: maatLabel(gekozenMaat),
      prijs: prijsRegel.prijs,
      quantity,
    });
    void logActiviteit('mandje_toegevoegd', actorFromCustomer(user));
    setIsConfirmed(true);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/ProductModal.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ProductModal.tsx tests/components/ProductModal.test.tsx
git commit -m "$(cat <<'EOF'
feat: log mandje_toegevoegd when an item is added to the cart

Logs for every visitor, including anonymous ones ("Onbekend") -- unlike
kunstwerk_bekeken, this event is not restricted to logged-in klanten.
EOF
)"
```

---

## Task 6: Log `bestelling_geplaatst` in `CartPanel`

**Files:**
- Modify: `src/components/CartPanel.tsx`
- Modify: `tests/components/CartPanel.test.tsx`

**Interfaces:**
- Consumes: `logActiviteit`, `actorFromCustomer` (Task 1); `useCustomerAuth` (already used in `CartPanel`, extended by Task 3).

- [ ] **Step 1: Write the failing tests**

In `tests/components/CartPanel.test.tsx`, add near the other mock declarations at the top of the file (after `const fetchMock = vi.fn();` / `vi.stubGlobal('fetch', fetchMock);`):

```tsx
const logActiviteitMock = vi.fn();

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: (...args: unknown[]) => logActiviteitMock(...args),
  actorFromCustomer: (
    user: { uid: string; email: string | null; companyName: string | null; contactPerson: string | null } | null
  ) =>
    user
      ? { id: user.uid, email: user.email ?? 'Onbekend', naam: user.companyName ?? user.contactPerson ?? 'Onbekend' }
      : { id: null, email: 'Onbekend', naam: 'Onbekend' },
}));
```

Update `signedInAsApprovedCustomer` to include a company name:

```tsx
function signedInAsApprovedCustomer() {
  getDocMock.mockResolvedValue({
    exists: () => true,
    data: () => ({ status: 'Goedgekeurd', companyName: 'Testbedrijf BV' }),
  });
  onAuthStateChangedMock.mockImplementation((_auth, callback) => {
    callback({ uid: 'uid-1', email: 'klant@example.com' });
    return () => {};
  });
}
```

In `beforeEach`, add `logActiviteitMock.mockReset();` alongside the other `.mockReset()` calls.

Add two new tests at the end of the `describe('CartPanel', ...)` block, just before its closing `});`:

```tsx
  it('logs bestelling_geplaatst with the logged-in klant when the order succeeds', async () => {
    addDocMock.mockResolvedValueOnce({ id: 'header-1' }).mockResolvedValue({ id: 'line-1' });
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));

    await screen.findByTestId('cart-order-confirmation');
    expect(logActiviteitMock).toHaveBeenCalledWith('bestelling_geplaatst', {
      id: 'uid-1',
      email: 'klant@example.com',
      naam: 'Testbedrijf BV',
    });
  });

  it('does not log bestelling_geplaatst when the Firestore write fails', async () => {
    addDocMock.mockRejectedValue(new Error('permission-denied'));
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));

    await screen.findByTestId('cart-place-order-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/CartPanel.test.tsx`
Expected: FAIL — the new "logs bestelling_geplaatst" test fails (`logActiviteitMock` never called).

- [ ] **Step 3: Implement**

In `src/components/CartPanel.tsx`, add an import:

```tsx
import { logActiviteit, actorFromCustomer } from '@/lib/logActiviteit';
```

In `handlePlaceOrder()`, replace:

```tsx
      clear();
      setOrderPlaced(true);
      if (user.email) {
        void sendConfirmationEmail(user.email);
      }
```

with:

```tsx
      clear();
      setOrderPlaced(true);
      void logActiviteit('bestelling_geplaatst', actorFromCustomer(user));
      if (user.email) {
        void sendConfirmationEmail(user.email);
      }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/CartPanel.test.tsx`
Expected: PASS (22 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/CartPanel.tsx tests/components/CartPanel.test.tsx
git commit -m "$(cat <<'EOF'
feat: log bestelling_geplaatst when an order is successfully placed

Logged only after the Firestore order write succeeds, never on a
failed attempt.
EOF
)"
```

---

## Task 7: Log `account_bezocht` in `AccountDashboard`

**Files:**
- Modify: `src/components/account/AccountDashboard.tsx`
- Modify: `tests/components/account/AccountDashboard.test.tsx`

**Interfaces:**
- Consumes: `logActiviteit`, `actorFromCustomer` (Task 1); `useCustomerAuth` (Task 3).

- [ ] **Step 1: Write the failing tests**

In `tests/components/account/AccountDashboard.test.tsx`, add near the other top-level mock declarations:

```tsx
const logActiviteitMock = vi.fn();

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: (...args: unknown[]) => logActiviteitMock(...args),
  actorFromCustomer: (
    user: { uid: string; email: string | null; companyName: string | null; contactPerson: string | null } | null
  ) =>
    user
      ? { id: user.uid, email: user.email ?? 'Onbekend', naam: user.companyName ?? user.contactPerson ?? 'Onbekend' }
      : { id: null, email: 'Onbekend', naam: 'Onbekend' },
}));
```

In `beforeEach`, add `logActiviteitMock.mockReset();`.

Add two new tests at the end of the `describe('AccountDashboard', ...)` block, just before its closing `});`:

```tsx
  it('logs account_bezocht exactly once with the logged-in klant', async () => {
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({ status: 'Goedgekeurd', companyName: 'Testbedrijf BV' }),
    });
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-1', email: 'klant@example.com' });
      return () => {};
    });
    renderDashboard();
    await waitFor(() => expect(screen.getByTestId('orders-section')).toBeInTheDocument());
    expect(logActiviteitMock).toHaveBeenCalledTimes(1);
    expect(logActiviteitMock).toHaveBeenCalledWith('account_bezocht', {
      id: 'uid-1',
      email: 'klant@example.com',
      naam: 'Testbedrijf BV',
    });
  });

  it('does not log account_bezocht when redirected for not being logged in', async () => {
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback(null);
      return () => {};
    });
    renderDashboard();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'));
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/account/AccountDashboard.test.tsx`
Expected: FAIL — `logActiviteitMock` never called.

- [ ] **Step 3: Implement**

In `src/components/account/AccountDashboard.tsx`, replace:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useCustomerAuth } from '@/lib/useCustomerAuth';
import { useRouter } from '@/i18n/navigation';
import { GlassPanel } from '@/components/GlassPanel';
import { AccountNav, type AccountSection } from './AccountNav';
```

with:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useCustomerAuth } from '@/lib/useCustomerAuth';
import { useRouter } from '@/i18n/navigation';
import { GlassPanel } from '@/components/GlassPanel';
import { logActiviteit, actorFromCustomer } from '@/lib/logActiviteit';
import { AccountNav, type AccountSection } from './AccountNav';
```

Replace:

```tsx
export function AccountDashboard() {
  const { isCustomer, isHydrated } = useCustomerAuth();
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<AccountSection>('orders');

  useEffect(() => {
    if (isHydrated && !isCustomer) {
      router.replace('/');
    }
  }, [isHydrated, isCustomer, router]);

  if (!isHydrated || !isCustomer) {
    return null;
  }
```

with:

```tsx
export function AccountDashboard() {
  const { isCustomer, isHydrated, user } = useCustomerAuth();
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<AccountSection>('orders');
  const hasLoggedVisit = useRef(false);

  useEffect(() => {
    if (isHydrated && !isCustomer) {
      router.replace('/');
    }
  }, [isHydrated, isCustomer, router]);

  useEffect(() => {
    if (isHydrated && isCustomer && !hasLoggedVisit.current) {
      hasLoggedVisit.current = true;
      void logActiviteit('account_bezocht', actorFromCustomer(user));
    }
  }, [isHydrated, isCustomer, user]);

  if (!isHydrated || !isCustomer) {
    return null;
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/account/AccountDashboard.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/account/AccountDashboard.tsx tests/components/account/AccountDashboard.test.tsx
git commit -m "$(cat <<'EOF'
feat: log account_bezocht once when a klant reaches the account page

Guarded with a ref so it fires exactly once per mount, and only for a
klant who actually reaches the dashboard (not during the redirect
flash for a logged-out visitor).
EOF
)"
```

---

## Task 8: Log `beheer_bezocht` in `AdminDashboard`

**Files:**
- Modify: `src/components/beheer/AdminDashboard.tsx`
- Modify: `tests/components/beheer/AdminDashboard.test.tsx`

**Interfaces:**
- Consumes: `logActiviteit`, `actorFromMedewerker` (Task 1).

- [ ] **Step 1: Write the failing tests**

In `tests/components/beheer/AdminDashboard.test.tsx`, add near the other top-level mock declarations:

```tsx
const logActiviteitMock = vi.fn();

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: (...args: unknown[]) => logActiviteitMock(...args),
  actorFromMedewerker: (user: { uid: string; email: string | null } | null) =>
    user
      ? { id: user.uid, email: user.email ?? 'Onbekend', naam: user.email ?? 'Onbekend' }
      : { id: null, email: 'Onbekend', naam: 'Onbekend' },
}));
```

In `beforeEach`, add `logActiviteitMock.mockReset();`.

Add three new tests at the end of the `describe('AdminDashboard', ...)` block, just before its closing `});`:

```tsx
  it('logs beheer_bezocht exactly once when authorized', async () => {
    mockAuthState = {
      user: { uid: 'uid-1', email: 'paul@glassartanddesign.com' },
      isAdmin: true,
      isHydrated: true,
    };
    renderDashboard();
    await waitFor(() => expect(getDocsMock).toHaveBeenCalled());
    expect(logActiviteitMock).toHaveBeenCalledTimes(1);
    expect(logActiviteitMock).toHaveBeenCalledWith('beheer_bezocht', {
      id: 'uid-1',
      email: 'paul@glassartanddesign.com',
      naam: 'paul@glassartanddesign.com',
    });
  });

  it('does not log beheer_bezocht when showing the login form', () => {
    mockAuthState = { user: null, isAdmin: false, isHydrated: true };
    renderDashboard();
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });

  it('does not log beheer_bezocht for an unauthorized account', () => {
    mockAuthState = {
      user: { uid: 'uid-2', email: 'onbekend@glassartanddesign.com' },
      isAdmin: false,
      isHydrated: true,
    };
    renderDashboard();
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/AdminDashboard.test.tsx`
Expected: FAIL — `logActiviteitMock` never called.

- [ ] **Step 3: Implement**

In `src/components/beheer/AdminDashboard.tsx`, replace:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { GlassPanel } from '@/components/GlassPanel';
import { AdminLoginForm } from './AdminLoginForm';
import { BeheerShell } from './BeheerShell';

export function AdminDashboard() {
  const t = useTranslations('beheer');
  const { user, isAdmin, isHydrated, logout } = useAdminAuth();
  const hasSignedOutUnauthorized = useRef(false);

  const isUnauthorized = isHydrated && !!user && !isAdmin;

  useEffect(() => {
    if (isUnauthorized && !hasSignedOutUnauthorized.current) {
      hasSignedOutUnauthorized.current = true;
      logout();
    }
    if (!isUnauthorized) {
      hasSignedOutUnauthorized.current = false;
    }
  }, [isUnauthorized, logout]);
```

with:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { GlassPanel } from '@/components/GlassPanel';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import { AdminLoginForm } from './AdminLoginForm';
import { BeheerShell } from './BeheerShell';

export function AdminDashboard() {
  const t = useTranslations('beheer');
  const { user, isAdmin, isHydrated, logout } = useAdminAuth();
  const hasSignedOutUnauthorized = useRef(false);
  const hasLoggedVisit = useRef(false);

  const isUnauthorized = isHydrated && !!user && !isAdmin;

  useEffect(() => {
    if (isUnauthorized && !hasSignedOutUnauthorized.current) {
      hasSignedOutUnauthorized.current = true;
      logout();
    }
    if (!isUnauthorized) {
      hasSignedOutUnauthorized.current = false;
    }
  }, [isUnauthorized, logout]);

  useEffect(() => {
    if (isHydrated && user && isAdmin && !hasLoggedVisit.current) {
      hasLoggedVisit.current = true;
      void logActiviteit('beheer_bezocht', actorFromMedewerker(user));
    }
  }, [isHydrated, user, isAdmin]);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/AdminDashboard.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/AdminDashboard.tsx tests/components/beheer/AdminDashboard.test.tsx
git commit -m "$(cat <<'EOF'
feat: log beheer_bezocht once when a medewerker reaches Beheer

Only logs for an authorized, authenticated medewerker -- not while
showing the login form, and not for an unauthorized account (which
gets signed out immediately anyway).
EOF
)"
```

---

## Task 9: Log `word_klant_bezocht` and `word_klant_aanvraag` in `RegistrationForm`

**Files:**
- Modify: `src/components/RegistrationForm.tsx`
- Modify: `tests/components/RegistrationForm.test.tsx`

**Interfaces:**
- Consumes: `logActiviteit`, `ONBEKENDE_ACTOR` (Task 1).

- [ ] **Step 1: Write the failing tests**

In `tests/components/RegistrationForm.test.tsx`, add near the other top-level mock declarations:

```tsx
const logActiviteitMock = vi.fn();

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: (...args: unknown[]) => logActiviteitMock(...args),
  ONBEKENDE_ACTOR: { id: null, email: 'Onbekend', naam: 'Onbekend' },
}));
```

In `beforeEach`, add `logActiviteitMock.mockReset();`.

Add three new tests at the end of the `describe('RegistrationForm', ...)` block, just before its closing `});`:

```tsx
  it('logs word_klant_bezocht as Onbekend exactly once on mount', () => {
    renderForm();
    expect(logActiviteitMock).toHaveBeenCalledTimes(1);
    expect(logActiviteitMock).toHaveBeenCalledWith('word_klant_bezocht', {
      id: null,
      email: 'Onbekend',
      naam: 'Onbekend',
    });
  });

  it('logs word_klant_aanvraag with the new account and company name on successful submit', async () => {
    createUserMock.mockResolvedValue({ user: { uid: 'uid-123' } });
    setDocMock.mockResolvedValue(undefined);
    signOutMock.mockResolvedValue(undefined);
    renderForm();
    fillRequiredFields();
    fireEvent.submit(screen.getByTestId('word-klant-submit').closest('form')!);
    await waitFor(() => expect(screen.getByTestId('word-klant-confirmation')).toBeInTheDocument());
    expect(logActiviteitMock).toHaveBeenCalledWith('word_klant_aanvraag', {
      id: 'uid-123',
      email: 'jan@example.com',
      naam: 'Testbedrijf BV',
    });
  });

  it('does not log word_klant_aanvraag when the account creation fails', async () => {
    createUserMock.mockRejectedValue({ code: 'auth/email-already-in-use' });
    renderForm();
    fillRequiredFields();
    fireEvent.submit(screen.getByTestId('word-klant-submit').closest('form')!);
    await screen.findByTestId('word-klant-submit-error');
    expect(logActiviteitMock).toHaveBeenCalledTimes(1); // only the page-visit log
    expect(logActiviteitMock).not.toHaveBeenCalledWith('word_klant_aanvraag', expect.anything());
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/RegistrationForm.test.tsx`
Expected: FAIL — `logActiviteitMock` never called.

- [ ] **Step 3: Implement**

In `src/components/RegistrationForm.tsx`, replace:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { createUserWithEmailAndPassword, deleteUser, signOut, type UserCredential } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

export function RegistrationForm() {
  const t = useTranslations('registrationPage');
  const [showDeliveryAddress, setShowDeliveryAddress] = useState(false);
  const [showInvoiceAddress, setShowInvoiceAddress] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
```

with:

```tsx
'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { createUserWithEmailAndPassword, deleteUser, signOut, type UserCredential } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { logActiviteit, ONBEKENDE_ACTOR } from '@/lib/logActiviteit';

export function RegistrationForm() {
  const t = useTranslations('registrationPage');
  const [showDeliveryAddress, setShowDeliveryAddress] = useState(false);
  const [showInvoiceAddress, setShowInvoiceAddress] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const hasLoggedVisit = useRef(false);

  useEffect(() => {
    if (!hasLoggedVisit.current) {
      hasLoggedVisit.current = true;
      void logActiviteit('word_klant_bezocht', ONBEKENDE_ACTOR);
    }
  }, []);
```

In `handleSubmit`, replace:

```tsx
      } catch (setDocError) {
        try {
          await deleteUser(credential.user);
        } catch {
          // Best-effort cleanup only; ignore failures here and fall through
          // to the original error below.
        }
        throw setDocError;
      }
      await signOut(auth);
      setIsSubmitted(true);
```

with:

```tsx
      } catch (setDocError) {
        try {
          await deleteUser(credential.user);
        } catch {
          // Best-effort cleanup only; ignore failures here and fall through
          // to the original error below.
        }
        throw setDocError;
      }
      void logActiviteit('word_klant_aanvraag', {
        id: credential.user.uid,
        email,
        naam: formData.get('companyName') as string,
      });
      await signOut(auth);
      setIsSubmitted(true);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/RegistrationForm.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/RegistrationForm.tsx tests/components/RegistrationForm.test.tsx
git commit -m "$(cat <<'EOF'
feat: log word_klant_bezocht and word_klant_aanvraag

Page-visit log fires once on mount as "Onbekend" (the page is for
non-klanten by definition). The submit log uses the just-created
account's uid/email plus the company name from the form, and only
fires after a successful setDoc -- not on a failed attempt.
EOF
)"
```

---

## Task 10: Add "Activiteit" nav item to `BeheerNav`

**Files:**
- Modify: `src/components/beheer/BeheerNav.tsx`
- Modify: `tests/components/beheer/BeheerNav.test.tsx`
- Modify: `messages/nl.json`

**Interfaces:**
- Produces: `BeheerSection` now includes `'activiteit'`; `BeheerNavProps` now requires `activiteitCount: number`. Task 12 (`BeheerShell`) is the consumer that passes this prop and renders the matching section.

- [ ] **Step 1: Add the translation key**

In `messages/nl.json`, inside the `beheer` namespace, add `navActiviteit` right after `"navKunstwerken": "Kunstwerken",`:

```json
  "navKunstwerken": "Kunstwerken",
  "navActiviteit": "Activiteit",
```

- [ ] **Step 2: Write the failing tests**

In `tests/components/beheer/BeheerNav.test.tsx`, replace the `renderNav` function:

```tsx
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
        bestellingenCount={5}
        materiaalsoortenCount={4}
        materialenCount={6}
        matenCount={2}
        segmentenCount={6}
        kunstwerkenCount={36}
        activiteitCount={12}
      />
    </NextIntlClientProvider>
  );
  return { onSelect, onLogout };
}
```

In the first test (`'renders the 8 active items with their counters, and the 3 disabled placeholder items'`), rename the title to reflect the new count and add two assertions at the end, right before the `['retouren', ...]` block:

```tsx
  it('renders the 9 active items with their counters, and the 3 disabled placeholder items', () => {
    renderNav();
    expect(screen.getByTestId('beheer-nav-klanten')).toHaveTextContent('Klanten');
    expect(screen.getByTestId('beheer-nav-klanten')).toHaveTextContent('3');
    expect(screen.getByTestId('beheer-nav-facturen')).toHaveTextContent('Facturen');
    expect(screen.getByTestId('beheer-nav-facturen')).toHaveTextContent('7');
    expect(screen.getByTestId('beheer-nav-bestellingen')).toHaveTextContent('Bestellingen');
    expect(screen.getByTestId('beheer-nav-bestellingen')).toHaveTextContent('5');
    expect(screen.getByTestId('beheer-nav-materiaalsoorten')).toHaveTextContent('Materiaalsoorten');
    expect(screen.getByTestId('beheer-nav-materialen')).toHaveTextContent('Materialen');
    expect(screen.getByTestId('beheer-nav-maten')).toHaveTextContent('Maten');
    expect(screen.getByTestId('beheer-nav-segmenten')).toHaveTextContent('Segmenten');
    expect(screen.getByTestId('beheer-nav-segmenten')).toHaveTextContent('6');
    expect(screen.getByTestId('beheer-nav-kunstwerken')).toHaveTextContent('Kunstwerken');
    expect(screen.getByTestId('beheer-nav-kunstwerken')).toHaveTextContent('36');
    expect(screen.getByTestId('beheer-nav-activiteit')).toHaveTextContent('Activiteit');
    expect(screen.getByTestId('beheer-nav-activiteit')).toHaveTextContent('12');

    ['retouren', 'prijsgroepen', 'glassartDesign'].forEach((id) => {
      expect(screen.getByTestId(`beheer-nav-${id}`)).toBeDisabled();
    });
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/BeheerNav.test.tsx`
Expected: FAIL — TypeScript error (missing required prop `activiteitCount`) and/or `beheer-nav-activiteit` testid not found.

- [ ] **Step 4: Implement**

In `src/components/beheer/BeheerNav.tsx`, replace:

```tsx
export type BeheerSection =
  | 'klanten'
  | 'facturen'
  | 'bestellingen'
  | 'materiaalsoorten'
  | 'materialen'
  | 'maten'
  | 'segmenten'
  | 'kunstwerken';

interface BeheerNavProps {
  activeSection: BeheerSection;
  onSelect: (section: BeheerSection) => void;
  onLogout: () => void;
  klantenCount: number;
  facturenCount: number;
  bestellingenCount: number;
  materiaalsoortenCount: number;
  materialenCount: number;
  matenCount: number;
  segmentenCount: number;
  kunstwerkenCount: number;
}

const ACTIVE_ITEMS: { id: BeheerSection; labelKey: string }[] = [
  { id: 'klanten', labelKey: 'navKlanten' },
  { id: 'facturen', labelKey: 'navFacturen' },
  { id: 'bestellingen', labelKey: 'navBestellingen' },
  { id: 'materiaalsoorten', labelKey: 'navMateriaalsoorten' },
  { id: 'materialen', labelKey: 'navMaterialen' },
  { id: 'maten', labelKey: 'navMaten' },
  { id: 'segmenten', labelKey: 'navSegmenten' },
  { id: 'kunstwerken', labelKey: 'navKunstwerken' },
];
```

with:

```tsx
export type BeheerSection =
  | 'klanten'
  | 'facturen'
  | 'bestellingen'
  | 'materiaalsoorten'
  | 'materialen'
  | 'maten'
  | 'segmenten'
  | 'kunstwerken'
  | 'activiteit';

interface BeheerNavProps {
  activeSection: BeheerSection;
  onSelect: (section: BeheerSection) => void;
  onLogout: () => void;
  klantenCount: number;
  facturenCount: number;
  bestellingenCount: number;
  materiaalsoortenCount: number;
  materialenCount: number;
  matenCount: number;
  segmentenCount: number;
  kunstwerkenCount: number;
  activiteitCount: number;
}

const ACTIVE_ITEMS: { id: BeheerSection; labelKey: string }[] = [
  { id: 'klanten', labelKey: 'navKlanten' },
  { id: 'facturen', labelKey: 'navFacturen' },
  { id: 'bestellingen', labelKey: 'navBestellingen' },
  { id: 'materiaalsoorten', labelKey: 'navMateriaalsoorten' },
  { id: 'materialen', labelKey: 'navMaterialen' },
  { id: 'maten', labelKey: 'navMaten' },
  { id: 'segmenten', labelKey: 'navSegmenten' },
  { id: 'kunstwerken', labelKey: 'navKunstwerken' },
  { id: 'activiteit', labelKey: 'navActiviteit' },
];
```

Replace the function signature and `counts` map:

```tsx
export function BeheerNav({
  activeSection,
  onSelect,
  onLogout,
  klantenCount,
  facturenCount,
  bestellingenCount,
  materiaalsoortenCount,
  materialenCount,
  matenCount,
  segmentenCount,
  kunstwerkenCount,
}: BeheerNavProps) {
  const t = useTranslations('beheer');
  const counts: Record<BeheerSection, number> = {
    klanten: klantenCount,
    facturen: facturenCount,
    bestellingen: bestellingenCount,
    materiaalsoorten: materiaalsoortenCount,
    materialen: materialenCount,
    maten: matenCount,
    segmenten: segmentenCount,
    kunstwerken: kunstwerkenCount,
  };
```

with:

```tsx
export function BeheerNav({
  activeSection,
  onSelect,
  onLogout,
  klantenCount,
  facturenCount,
  bestellingenCount,
  materiaalsoortenCount,
  materialenCount,
  matenCount,
  segmentenCount,
  kunstwerkenCount,
  activiteitCount,
}: BeheerNavProps) {
  const t = useTranslations('beheer');
  const counts: Record<BeheerSection, number> = {
    klanten: klantenCount,
    facturen: facturenCount,
    bestellingen: bestellingenCount,
    materiaalsoorten: materiaalsoortenCount,
    materialen: materialenCount,
    maten: matenCount,
    segmenten: segmentenCount,
    kunstwerken: kunstwerkenCount,
    activiteit: activiteitCount,
  };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/BeheerNav.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/beheer/BeheerNav.tsx tests/components/beheer/BeheerNav.test.tsx messages/nl.json
git commit -m "$(cat <<'EOF'
feat: add Activiteit nav item to BeheerNav

New active section alongside the existing 8, showing the count of
loaded activiteiten. BeheerShell (next task) wires the actual data.
EOF
)"
```

---

## Task 11: `ActiviteitSection` component

**Files:**
- Create: `src/components/beheer/ActiviteitSection.tsx`
- Test: `tests/components/beheer/ActiviteitSection.test.tsx`
- Modify: `messages/nl.json`

**Interfaces:**
- Consumes: `ActiviteitType` (Task 1); `DataTable`, `Column` (existing, `@/components/DataTable`).
- Produces: `ActiviteitSection` component and exported `Activiteit` interface (`{ id, type, actorEmail, actorNaam, timestamp }`). Task 12 (`BeheerShell`) builds and passes this data.

- [ ] **Step 1: Add the translation keys**

In `messages/nl.json`, inside the `beheer` namespace, add these keys right after the `navActiviteit` key added in Task 10:

```json
  "navActiviteit": "Activiteit",
  "activiteitLoadError": "Kon de activiteiten niet laden. Probeer de pagina te verversen.",
  "activiteitEmpty": "Geen activiteiten gevonden.",
  "activiteitColTijdstip": "Tijdstip",
  "activiteitColType": "Type",
  "activiteitColKlant": "Klant",
  "activiteitColEmail": "E-mailadres",
  "activiteitTypeKunstwerkBekeken": "Kunstwerk bekeken",
  "activiteitTypeMandjeToegevoegd": "Toegevoegd aan mandje",
  "activiteitTypeBestellingGeplaatst": "Bestelling geplaatst",
  "activiteitTypeAccountBezocht": "Accountpagina bezocht",
  "activiteitTypeBeheerBezocht": "Beheerpagina bezocht",
  "activiteitTypeWordKlantBezocht": "Word-klantpagina bezocht",
  "activiteitTypeWordKlantAanvraag": "Aanvraag verstuurd",
```

- [ ] **Step 2: Write the failing test**

Create `tests/components/beheer/ActiviteitSection.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ActiviteitSection, type Activiteit } from '@/components/beheer/ActiviteitSection';
import messages from '../../../messages/nl.json';

const ACTIVITEITEN: Activiteit[] = [
  {
    id: 'log-1',
    type: 'kunstwerk_bekeken',
    actorEmail: 'klant@example.com',
    actorNaam: 'Testbedrijf BV',
    timestamp: new Date('2026-07-22T10:00:00'),
  },
  {
    id: 'log-2',
    type: 'word_klant_bezocht',
    actorEmail: 'Onbekend',
    actorNaam: 'Onbekend',
    timestamp: new Date('2026-07-22T09:00:00'),
  },
];

function renderSection(
  activiteiten: Activiteit[] | null = ACTIVITEITEN,
  loadError: string | null = null
) {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <ActiviteitSection activiteiten={activiteiten} loadError={loadError} />
    </NextIntlClientProvider>
  );
}

describe('ActiviteitSection', () => {
  it('shows each activiteit with its translated type label and actor', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-log-1')).toHaveTextContent('Kunstwerk bekeken');
    expect(screen.getByTestId('data-table-row-log-1')).toHaveTextContent('Testbedrijf BV');
    expect(screen.getByTestId('data-table-row-log-1')).toHaveTextContent('klant@example.com');
    expect(screen.getByTestId('data-table-row-log-2')).toHaveTextContent('Word-klantpagina bezocht');
    expect(screen.getByTestId('data-table-row-log-2')).toHaveTextContent('Onbekend');
  });

  it('shows the load error banner when loadError is set', () => {
    renderSection([], 'Kon de activiteiten niet laden. Probeer de pagina te verversen.');
    expect(screen.getByTestId('activiteit-load-error')).toHaveTextContent(
      'Kon de activiteiten niet laden. Probeer de pagina te verversen.'
    );
  });

  it('shows the empty state when there are no activiteiten', () => {
    renderSection([]);
    expect(screen.getByTestId('data-table-empty')).toBeInTheDocument();
  });

  it('finds an activiteit by typing its type label in the search box', () => {
    renderSection();
    fireEvent.change(screen.getByTestId('data-table-search'), {
      target: { value: 'Kunstwerk bekeken' },
    });
    expect(screen.getByTestId('data-table-row-log-1')).toBeInTheDocument();
    expect(screen.queryByTestId('data-table-row-log-2')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/components/beheer/ActiviteitSection.test.tsx`
Expected: FAIL — `Cannot find module '@/components/beheer/ActiviteitSection'`.

- [ ] **Step 4: Implement**

Create `src/components/beheer/ActiviteitSection.tsx`:

```tsx
'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import type { ActiviteitType } from '@/lib/logActiviteit';

export interface Activiteit {
  id: string;
  type: ActiviteitType;
  actorEmail: string;
  actorNaam: string;
  timestamp: Date | null;
}

interface ActiviteitRow {
  id: string;
  tijdstip: string;
  typeLabel: string;
  actorNaam: string;
  actorEmail: string;
}

interface ActiviteitSectionProps {
  activiteiten: Activiteit[] | null;
  loadError: string | null;
}

const TYPE_LABEL_KEYS: Record<ActiviteitType, string> = {
  kunstwerk_bekeken: 'activiteitTypeKunstwerkBekeken',
  mandje_toegevoegd: 'activiteitTypeMandjeToegevoegd',
  bestelling_geplaatst: 'activiteitTypeBestellingGeplaatst',
  account_bezocht: 'activiteitTypeAccountBezocht',
  beheer_bezocht: 'activiteitTypeBeheerBezocht',
  word_klant_bezocht: 'activiteitTypeWordKlantBezocht',
  word_klant_aanvraag: 'activiteitTypeWordKlantAanvraag',
};

export function ActiviteitSection({ activiteiten, loadError }: ActiviteitSectionProps) {
  const t = useTranslations('beheer');

  const rows = useMemo<ActiviteitRow[]>(
    () =>
      (activiteiten ?? []).map((activiteit) => ({
        id: activiteit.id,
        tijdstip: activiteit.timestamp ? activiteit.timestamp.toLocaleString('nl-NL') : '',
        typeLabel: t(TYPE_LABEL_KEYS[activiteit.type]),
        actorNaam: activiteit.actorNaam,
        actorEmail: activiteit.actorEmail,
      })),
    [activiteiten, t]
  );

  const columns: Column<ActiviteitRow>[] = [
    { key: 'tijdstip', label: t('activiteitColTijdstip') },
    { key: 'typeLabel', label: t('activiteitColType') },
    { key: 'actorNaam', label: t('activiteitColKlant') },
    { key: 'actorEmail', label: t('activiteitColEmail') },
  ];

  return (
    <div data-testid="activiteit-section">
      {loadError && (
        <p data-testid="activiteit-load-error" className="mb-3 text-xs text-red-400">
          {loadError}
        </p>
      )}
      <DataTable<ActiviteitRow>
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        onRowClick={() => {}}
        emptyLabel={t('activiteitEmpty')}
        searchPlaceholder={t('dataTableSearchPlaceholder')}
      />
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/components/beheer/ActiviteitSection.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/beheer/ActiviteitSection.tsx tests/components/beheer/ActiviteitSection.test.tsx messages/nl.json
git commit -m "$(cat <<'EOF'
feat: add ActiviteitSection to show logged activity in Beheer

Read-only DataTable view: tijdstip, translated type, klantnaam,
e-mailadres. No modal (no extra per-event detail exists to show) --
row clicks are a no-op. The Dutch type label is stored on each row
(not just the raw enum) so the existing global search can match it.
EOF
)"
```

---

## Task 12: Wire `activiteiten` into `BeheerShell`

**Files:**
- Modify: `src/components/beheer/BeheerShell.tsx`
- Modify: `tests/components/beheer/BeheerShell.test.tsx`

**Interfaces:**
- Consumes: `ActiviteitSection`, `type Activiteit` (Task 11); `BeheerNav`'s new `activiteitCount` prop (Task 10).

- [ ] **Step 1: Write the failing test**

In `tests/components/beheer/BeheerShell.test.tsx`, update the `firebase/firestore` mock — replace:

```tsx
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...segments: string[]) => ({ name: segments.join('/') })),
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  addDoc: (...args: unknown[]) => addDocMock(...args),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));
```

with:

```tsx
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

Add `activiteiten: []` to `DEFAULT_COLLECTIONS`:

```tsx
const DEFAULT_COLLECTIONS: Record<string, Array<{ id: string; data: Record<string, unknown> }>> = {
  klanten: [],
  bestelheaders: [],
  activiteiten: [],
  materiaalsoorten: [{ id: 'soort-1', data: { omschrijving: 'Veiligheidsglas' } }],
  materialen: [{ id: 'mat-1', data: { materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'Test' } }],
  maten: [{ id: 'maat-1', data: { breedte: 40, hoogte: 60 } }],
  segmenten: [{ id: 'seg-1', data: { omschrijving: 'Hotel' } }],
  kunstwerken: [
    {
      id: 'kw-1',
      data: {
        foto: 'https://storage.example.com/kw-1.jpg',
        segmentIds: ['seg-1'],
        materiaalIds: ['mat-1'],
        maatIds: ['maat-1'],
        prijzen: [{ materiaalId: 'mat-1', maatId: 'maat-1', prijs: 150 }],
        omschrijvingNl: 'Hotel paneel 1',
        omschrijvingFr: '',
        omschrijvingDe: '',
        omschrijvingEn: '',
      },
    },
  ],
};
```

Add a new test at the end of the `describe('BeheerShell', ...)` block, just before its closing `});`:

```tsx
  it('shows the Activiteit section with the loaded count on its nav item', async () => {
    mockCollections({
      activiteiten: [
        {
          id: 'log-1',
          data: {
            type: 'kunstwerk_bekeken',
            actorEmail: 'klant@example.com',
            actorNaam: 'Testbedrijf BV',
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
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/beheer/BeheerShell.test.tsx`
Expected: FAIL — `beheer-nav-activiteit` never gets a count (BeheerShell doesn't fetch or pass it yet).

- [ ] **Step 3: Implement**

In `src/components/beheer/BeheerShell.tsx`, replace the import block:

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { GlassPanel } from '@/components/GlassPanel';
import { BeheerNav, type BeheerSection } from './BeheerNav';
import { KlantenSection, type Klant } from './KlantenSection';
import { FacturenSection } from './FacturenSection';
import { BestellingenSection, type Bestelling, type BestellingLine } from './BestellingenSection';
import { MateriaalsoortenSection } from './MateriaalsoortenSection';
import { MaterialenSection } from './MaterialenSection';
import { MatenSection } from './MatenSection';
import { SegmentenSection } from './SegmentenSection';
import { KunstwerkenSection } from './KunstwerkenSection';
import type { Materiaalsoort, Materiaal, Maat, Segment, Kunstwerk } from './materiaalTypes';
import { MOCK_ADMIN_INVOICES } from '@/data/mockAdminInvoices';
import { useFirestoreCollection } from '@/lib/useFirestoreCollection';
import { MATERIAALSOORTEN_SEED, buildMaterialenSeed } from '@/data/materiaalsoortenSeed';
import { SEGMENTEN_SEED, MATEN_SEED, buildKunstwerkenSeed } from '@/data/kunstwerkenSeed';
```

with:

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { GlassPanel } from '@/components/GlassPanel';
import { BeheerNav, type BeheerSection } from './BeheerNav';
import { KlantenSection, type Klant } from './KlantenSection';
import { FacturenSection } from './FacturenSection';
import { BestellingenSection, type Bestelling, type BestellingLine } from './BestellingenSection';
import { MateriaalsoortenSection } from './MateriaalsoortenSection';
import { MaterialenSection } from './MaterialenSection';
import { MatenSection } from './MatenSection';
import { SegmentenSection } from './SegmentenSection';
import { KunstwerkenSection } from './KunstwerkenSection';
import { ActiviteitSection, type Activiteit } from './ActiviteitSection';
import type { Materiaalsoort, Materiaal, Maat, Segment, Kunstwerk } from './materiaalTypes';
import type { ActiviteitType } from '@/lib/logActiviteit';
import { MOCK_ADMIN_INVOICES } from '@/data/mockAdminInvoices';
import { useFirestoreCollection } from '@/lib/useFirestoreCollection';
import { MATERIAALSOORTEN_SEED, buildMaterialenSeed } from '@/data/materiaalsoortenSeed';
import { SEGMENTEN_SEED, MATEN_SEED, buildKunstwerkenSeed } from '@/data/kunstwerkenSeed';
```

Add new state right after the existing `bestellingenLoadError` state:

```tsx
  const [rawBestellingen, setRawBestellingen] = useState<RawBestelling[] | null>(null);
  const [bestellingenLoadError, setBestellingenLoadError] = useState<string | null>(null);
  const [activiteiten, setActiviteiten] = useState<Activiteit[] | null>(null);
  const [activiteitenLoadError, setActiviteitenLoadError] = useState<string | null>(null);
```

Add a new effect right after the existing `loadBestellingen` effect (after its closing `}, [t]);`):

```tsx
  useEffect(() => {
    let cancelled = false;
    async function loadActiviteiten() {
      try {
        const snapshot = await getDocs(
          query(collection(db, 'activiteiten'), orderBy('timestamp', 'desc'), limit(500))
        );
        if (cancelled) return;
        setActiviteiten(
          snapshot.docs.map((docSnapshot) => {
            const data = docSnapshot.data();
            return {
              id: docSnapshot.id,
              type: data.type as ActiviteitType,
              actorEmail: data.actorEmail,
              actorNaam: data.actorNaam,
              timestamp: data.timestamp?.toDate() ?? null,
            } as Activiteit;
          })
        );
        setActiviteitenLoadError(null);
      } catch {
        if (!cancelled) {
          setActiviteitenLoadError(t('activiteitLoadError'));
        }
      }
    }
    loadActiviteiten();
    return () => {
      cancelled = true;
    };
  }, [t]);
```

Add the derived count next to the other `*Count` lines:

```tsx
  const kunstwerkenCount = (kunstwerken.items ?? []).length;
  const activiteitCount = (activiteiten ?? []).length;
```

Pass the new prop to `BeheerNav`:

```tsx
        <BeheerNav
          activeSection={activeSection}
          onSelect={setActiveSection}
          onLogout={onLogout}
          klantenCount={klantenCount}
          facturenCount={facturenCount}
          bestellingenCount={bestellingenCount}
          materiaalsoortenCount={materiaalsoortenCount}
          materialenCount={materialenCount}
          matenCount={matenCount}
          segmentenCount={segmentenCount}
          kunstwerkenCount={kunstwerkenCount}
          activiteitCount={activiteitCount}
        />
```

Finally, change the section switch's terminal branch. Replace:

```tsx
        ) : (
          <KunstwerkenSection
            kunstwerken={kunstwerken.items}
            segmenten={segmenten.items}
            materialen={materialen.items}
            maten={maten.items}
            loadError={kunstwerken.error === 'load' ? t('kunstwerkenLoadError') : null}
            onAdd={kunstwerken.add}
            onUpdate={kunstwerken.update}
            onRemove={kunstwerken.remove}
          />
        )}
```

with:

```tsx
        ) : activeSection === 'kunstwerken' ? (
          <KunstwerkenSection
            kunstwerken={kunstwerken.items}
            segmenten={segmenten.items}
            materialen={materialen.items}
            maten={maten.items}
            loadError={kunstwerken.error === 'load' ? t('kunstwerkenLoadError') : null}
            onAdd={kunstwerken.add}
            onUpdate={kunstwerken.update}
            onRemove={kunstwerken.remove}
          />
        ) : (
          <ActiviteitSection activiteiten={activiteiten} loadError={activiteitenLoadError} />
        )}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/components/beheer/BeheerShell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/BeheerShell.tsx tests/components/beheer/BeheerShell.test.tsx
git commit -m "$(cat <<'EOF'
feat: wire the Activiteit section into BeheerShell

Fetches the most recent 500 activiteiten (orderBy timestamp desc,
limit 500) rather than the full collection, since unlike the other
Beheer sections this one can grow unbounded over time.
EOF
)"
```

---

## Task 13: Full-suite verification

**Files:** none — verification only, no code changes.

**Interfaces:** none.

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — all test files green, including the 9 files touched/created across Tasks 1–12.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: `✓ Compiled successfully` and all 29 static pages generated, same as before this feature (this is a static-export site — `next build`'s `tsc` pass has caught issues in the past that `vitest` alone missed).

- [ ] **Step 4: Report**

No commit for this task (nothing changes). If any step fails, return to the relevant earlier task, fix, and re-run this task from Step 1.
