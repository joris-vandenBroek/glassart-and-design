# Activiteitenlog-uitbreiding Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 22-07-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verwijder het nutteloze `beheer_bezocht`-event, voeg logging toe voor beheeracties (status-wijzigingen op Klant/Bestelling, CRUD op alle beheertabellen), hernoem "Activiteit" naar "Activiteitenlog" (incl. Firestore-collectie), dicht een verwijder-beschermingsgat bij Materialen/Maten, en bouw een nieuwe Prijsgroepen-tabel met een echte koppeling vanaf Klant.

**Architecture:** Uitbreiding van de bestaande `logActiviteit`-infrastructuur (`src/lib/logActiviteit.ts`) met 22 nieuwe `ActiviteitType`-waarden. Elk beheerbestand dat een write doet roept zelf `useAdminAuth()` aan (zelfde patroon als klant-zijde `useCustomerAuth()`) en logt na een geslaagde write via `actorFromMedewerker(user)`.

**Tech Stack:** Next.js (App Router), React, TypeScript, Firebase Firestore, next-intl, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-22-activiteitenlog-uitbreiding-design.md`

## Global Constraints

- Nieuwe `ActiviteitType`-waarden (22 in totaal): `klant_goedgekeurd`, `klant_afgewezen`, `bestelling_goedgekeurd`, `bestelling_afgewezen`, `materiaalsoort_toegevoegd`, `materiaalsoort_gewijzigd`, `materiaalsoort_verwijderd`, `materiaal_toegevoegd`, `materiaal_gewijzigd`, `materiaal_verwijderd`, `maat_toegevoegd`, `maat_gewijzigd`, `maat_verwijderd`, `segment_toegevoegd`, `segment_gewijzigd`, `segment_verwijderd`, `kunstwerk_toegevoegd`, `kunstwerk_gewijzigd`, `kunstwerk_verwijderd`, `prijsgroep_toegevoegd`, `prijsgroep_gewijzigd`, `prijsgroep_verwijderd`. `beheer_bezocht` wordt verwijderd.
- Elke nieuwe log-write gebruikt `actorFromMedewerker(user)` waarbij `user` komt van een losse `useAdminAuth()`-aanroep in hetzelfde bestand — nooit via props doorgegeven.
- Alleen loggen bij een daadwerkelijk geslaagde write (nooit in een catch-blok, nooit bij een geblokkeerde verwijderpoging).
- Firestore-collectie `activiteiten` → `activiteitenlog` (in `logActiviteit.ts`, `firestore.rules`, `BeheerShell.tsx`).
- Menu-label `messages/nl.json`'s `navActiviteit` → "Activiteitenlog" (tekst, sleutelnaam blijft ongewijzigd).
- Vertalingen alleen in `messages/nl.json` (Nederlands-only `beheer`-namespace).
- Geen extra detailvelden op een activiteit-document — nog steeds alleen `type`+`actorId`+`actorEmail`+`actorNaam`+`timestamp`.

---

## Task 1: Activiteitenlog-infrastructuur (hernoemen, beheer_bezocht weg, 22 nieuwe types)

**Files:**
- Modify: `src/lib/logActiviteit.ts`
- Modify: `src/components/beheer/AdminDashboard.tsx`
- Modify: `src/components/beheer/ActiviteitSection.tsx`
- Modify: `src/components/beheer/BeheerShell.tsx`
- Modify: `firestore.rules`
- Modify: `messages/nl.json`
- Test: `tests/lib/logActiviteit.test.ts`
- Test: `tests/components/beheer/AdminDashboard.test.tsx`
- Test: `tests/components/beheer/ActiviteitSection.test.tsx`
- Test: `tests/components/beheer/BeheerShell.test.tsx`
- Test: `tests/components/beheer/BeheerNav.test.tsx`

**Interfaces:**
- Produces: `ActiviteitType` (Task 1's updated union) is the single source of truth every later task's log calls use.

- [ ] **Step 1: Update `messages/nl.json`**

In the `beheer` namespace, change:
```json
  "navActiviteit": "Activiteit",
```
to:
```json
  "navActiviteit": "Activiteitenlog",
```

Remove this line entirely:
```json
  "activiteitTypeBeheerBezocht": "Beheerpagina bezocht",
```

Add these 22 lines right after `"activiteitTypeWordKlantAanvraag": "Aanvraag verstuurd",`:
```json
  "activiteitTypeKlantGoedgekeurd": "Klant goedgekeurd",
  "activiteitTypeKlantAfgewezen": "Klant afgewezen",
  "activiteitTypeBestellingGoedgekeurd": "Bestelling goedgekeurd",
  "activiteitTypeBestellingAfgewezen": "Bestelling afgewezen",
  "activiteitTypeMateriaalsoortToegevoegd": "Materiaalsoort toegevoegd",
  "activiteitTypeMateriaalsoortGewijzigd": "Materiaalsoort gewijzigd",
  "activiteitTypeMateriaalsoortVerwijderd": "Materiaalsoort verwijderd",
  "activiteitTypeMateriaalToegevoegd": "Materiaal toegevoegd",
  "activiteitTypeMateriaalGewijzigd": "Materiaal gewijzigd",
  "activiteitTypeMateriaalVerwijderd": "Materiaal verwijderd",
  "activiteitTypeMaatToegevoegd": "Maat toegevoegd",
  "activiteitTypeMaatGewijzigd": "Maat gewijzigd",
  "activiteitTypeMaatVerwijderd": "Maat verwijderd",
  "activiteitTypeSegmentToegevoegd": "Segment toegevoegd",
  "activiteitTypeSegmentGewijzigd": "Segment gewijzigd",
  "activiteitTypeSegmentVerwijderd": "Segment verwijderd",
  "activiteitTypeKunstwerkToegevoegd": "Kunstwerk toegevoegd",
  "activiteitTypeKunstwerkGewijzigd": "Kunstwerk gewijzigd",
  "activiteitTypeKunstwerkVerwijderd": "Kunstwerk verwijderd",
  "activiteitTypePrijsgroepToegevoegd": "Prijsgroep toegevoegd",
  "activiteitTypePrijsgroepGewijzigd": "Prijsgroep gewijzigd",
  "activiteitTypePrijsgroepVerwijderd": "Prijsgroep verwijderd",
```

- [ ] **Step 2: Write the failing tests**

In `tests/lib/logActiviteit.test.ts`, change the collection-name assertion — replace:
```ts
    expect(addDocMock).toHaveBeenCalledWith(
      { name: 'activiteiten' },
```
with:
```ts
    expect(addDocMock).toHaveBeenCalledWith(
      { name: 'activiteitenlog' },
```

In `tests/components/beheer/AdminDashboard.test.tsx`, remove the `logActiviteitMock` declaration, the `vi.mock('@/lib/logActiviteit', ...)` block, the `logActiviteitMock.mockReset();` line in `beforeEach`, and the three tests `'logs beheer_bezocht exactly once when authorized'`, `'does not log beheer_bezocht when showing the login form'`, `'does not log beheer_bezocht for an unauthorized account'` — the file becomes:
```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AdminDashboard } from '@/components/beheer/AdminDashboard';
import messages from '../../../messages/nl.json';

const logoutMock = vi.fn();
const getDocsMock = vi.fn();
let mockAuthState: {
  user: { uid: string; email: string | null } | null;
  isAdmin: boolean;
  isHydrated: boolean;
};

vi.mock('@/lib/useAdminAuth', () => ({
  useAdminAuth: () => ({
    ...mockAuthState,
    login: vi.fn(),
    resetPassword: vi.fn(),
    logout: logoutMock,
  }),
}));

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ name })),
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  updateDoc: vi.fn(),
}));

function renderDashboard() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <AdminDashboard />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  logoutMock.mockReset();
  getDocsMock.mockReset();
  getDocsMock.mockResolvedValue({ docs: [] });
});

describe('AdminDashboard', () => {
  it('renders nothing while not hydrated', () => {
    mockAuthState = { user: null, isAdmin: false, isHydrated: false };
    renderDashboard();
    expect(screen.queryByTestId('beheer-login-email')).not.toBeInTheDocument();
    expect(screen.queryByTestId('beheer-dashboard')).not.toBeInTheDocument();
  });

  it('shows the login form when hydrated with no user', () => {
    mockAuthState = { user: null, isAdmin: false, isHydrated: true };
    renderDashboard();
    expect(screen.getByTestId('beheer-login-email')).toBeInTheDocument();
  });

  it('shows the BeheerShell with the logged-in email when authorized', async () => {
    mockAuthState = {
      user: { uid: 'uid-1', email: 'paul@glassartanddesign.com' },
      isAdmin: true,
      isHydrated: true,
    };
    renderDashboard();
    expect(screen.getByTestId('beheer-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('beheer-logged-in-as')).toHaveTextContent(
      'paul@glassartanddesign.com'
    );
    await waitFor(() => expect(getDocsMock).toHaveBeenCalled());
  });

  it('shows an access-denied message and signs out when logged in without a medewerkers document', async () => {
    mockAuthState = {
      user: { uid: 'uid-2', email: 'onbekend@glassartanddesign.com' },
      isAdmin: false,
      isHydrated: true,
    };
    renderDashboard();
    expect(screen.getByTestId('beheer-unauthorized')).toBeInTheDocument();
    expect(screen.queryByTestId('beheer-login-email')).not.toBeInTheDocument();
    await waitFor(() => expect(logoutMock).toHaveBeenCalled());
  });
});
```

In `tests/components/beheer/ActiviteitSection.test.tsx`, add a new test at the end of the `describe('ActiviteitSection', ...)` block, just before its closing `});`:
```tsx
  it('falls back to the raw type string when no label mapping exists (e.g. a retired event type)', () => {
    renderSection([
      {
        id: 'log-3',
        // @ts-expect-error -- simulating a legacy document with a since-removed type value
        type: 'beheer_bezocht',
        actorEmail: 'paul@glassartanddesign.com',
        actorNaam: 'paul@glassartanddesign.com',
        timestamp: new Date('2026-07-20T08:00:00'),
      },
    ]);
    expect(screen.getByTestId('data-table-row-log-3')).toHaveTextContent('beheer_bezocht');
  });
```

In `tests/components/beheer/BeheerShell.test.tsx`, replace the `activiteiten` key in `DEFAULT_COLLECTIONS` with `activiteitenlog`:
```ts
  activiteitenlog: [],
```
and in the new test `'shows the Activiteit section with the loaded count on its nav item'`, change the `mockCollections({ activiteiten: [...] })` call's key from `activiteiten` to `activiteitenlog`.

In `tests/components/beheer/BeheerNav.test.tsx`, change the assertion:
```tsx
    expect(screen.getByTestId('beheer-nav-activiteit')).toHaveTextContent('Activiteit');
```
to:
```tsx
    expect(screen.getByTestId('beheer-nav-activiteit')).toHaveTextContent('Activiteitenlog');
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/logActiviteit.test.ts tests/components/beheer/AdminDashboard.test.tsx tests/components/beheer/ActiviteitSection.test.tsx tests/components/beheer/BeheerShell.test.tsx tests/components/beheer/BeheerNav.test.tsx`
Expected: FAIL — collection name mismatch, `activiteitTypeBeheerBezocht`-less `AdminDashboard` still logging it, `ActiviteitSection` has no fallback yet, etc.

- [ ] **Step 4: Implement — `src/lib/logActiviteit.ts`**

Replace the `ActiviteitType` union:
```ts
export type ActiviteitType =
  | 'kunstwerk_bekeken'
  | 'mandje_toegevoegd'
  | 'bestelling_geplaatst'
  | 'account_bezocht'
  | 'word_klant_bezocht'
  | 'word_klant_aanvraag'
  | 'klant_goedgekeurd'
  | 'klant_afgewezen'
  | 'bestelling_goedgekeurd'
  | 'bestelling_afgewezen'
  | 'materiaalsoort_toegevoegd'
  | 'materiaalsoort_gewijzigd'
  | 'materiaalsoort_verwijderd'
  | 'materiaal_toegevoegd'
  | 'materiaal_gewijzigd'
  | 'materiaal_verwijderd'
  | 'maat_toegevoegd'
  | 'maat_gewijzigd'
  | 'maat_verwijderd'
  | 'segment_toegevoegd'
  | 'segment_gewijzigd'
  | 'segment_verwijderd'
  | 'kunstwerk_toegevoegd'
  | 'kunstwerk_gewijzigd'
  | 'kunstwerk_verwijderd'
  | 'prijsgroep_toegevoegd'
  | 'prijsgroep_gewijzigd'
  | 'prijsgroep_verwijderd';
```

Replace `collection(db, 'activiteiten')` with `collection(db, 'activiteitenlog')` in `logActiviteit`.

- [ ] **Step 5: Implement — `src/components/beheer/AdminDashboard.tsx`**

Replace the whole file with:
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

  if (!isHydrated) {
    return null;
  }

  if (isUnauthorized) {
    return (
      <GlassPanel className="mx-auto !max-w-lg">
        <p data-testid="beheer-unauthorized" className="text-sm text-white/80">
          {t('unauthorized')}
        </p>
      </GlassPanel>
    );
  }

  if (!user) {
    return (
      <GlassPanel className="mx-auto !max-w-lg">
        <AdminLoginForm />
      </GlassPanel>
    );
  }

  return <BeheerShell email={user.email ?? ''} onLogout={() => logout()} />;
}
```

- [ ] **Step 6: Implement — `src/components/beheer/ActiviteitSection.tsx`**

Replace the `TYPE_LABEL_KEYS` map and the `rows` computation:
```tsx
const TYPE_LABEL_KEYS: Record<ActiviteitType, string> = {
  kunstwerk_bekeken: 'activiteitTypeKunstwerkBekeken',
  mandje_toegevoegd: 'activiteitTypeMandjeToegevoegd',
  bestelling_geplaatst: 'activiteitTypeBestellingGeplaatst',
  account_bezocht: 'activiteitTypeAccountBezocht',
  word_klant_bezocht: 'activiteitTypeWordKlantBezocht',
  word_klant_aanvraag: 'activiteitTypeWordKlantAanvraag',
  klant_goedgekeurd: 'activiteitTypeKlantGoedgekeurd',
  klant_afgewezen: 'activiteitTypeKlantAfgewezen',
  bestelling_goedgekeurd: 'activiteitTypeBestellingGoedgekeurd',
  bestelling_afgewezen: 'activiteitTypeBestellingAfgewezen',
  materiaalsoort_toegevoegd: 'activiteitTypeMateriaalsoortToegevoegd',
  materiaalsoort_gewijzigd: 'activiteitTypeMateriaalsoortGewijzigd',
  materiaalsoort_verwijderd: 'activiteitTypeMateriaalsoortVerwijderd',
  materiaal_toegevoegd: 'activiteitTypeMateriaalToegevoegd',
  materiaal_gewijzigd: 'activiteitTypeMateriaalGewijzigd',
  materiaal_verwijderd: 'activiteitTypeMateriaalVerwijderd',
  maat_toegevoegd: 'activiteitTypeMaatToegevoegd',
  maat_gewijzigd: 'activiteitTypeMaatGewijzigd',
  maat_verwijderd: 'activiteitTypeMaatVerwijderd',
  segment_toegevoegd: 'activiteitTypeSegmentToegevoegd',
  segment_gewijzigd: 'activiteitTypeSegmentGewijzigd',
  segment_verwijderd: 'activiteitTypeSegmentVerwijderd',
  kunstwerk_toegevoegd: 'activiteitTypeKunstwerkToegevoegd',
  kunstwerk_gewijzigd: 'activiteitTypeKunstwerkGewijzigd',
  kunstwerk_verwijderd: 'activiteitTypeKunstwerkVerwijderd',
  prijsgroep_toegevoegd: 'activiteitTypePrijsgroepToegevoegd',
  prijsgroep_gewijzigd: 'activiteitTypePrijsgroepGewijzigd',
  prijsgroep_verwijderd: 'activiteitTypePrijsgroepVerwijderd',
};

export function ActiviteitSection({ activiteiten, loadError }: ActiviteitSectionProps) {
  const t = useTranslations('beheer');

  const rows = useMemo<ActiviteitRow[]>(
    () =>
      (activiteiten ?? []).map((activiteit) => {
        const labelKey = TYPE_LABEL_KEYS[activiteit.type];
        return {
          id: activiteit.id,
          tijdstip: activiteit.timestamp ? activiteit.timestamp.toLocaleString('nl-NL') : '',
          typeLabel: labelKey ? t(labelKey) : activiteit.type,
          actorNaam: activiteit.actorNaam,
          actorEmail: activiteit.actorEmail,
        };
      }),
    [activiteiten, t]
  );
```

(The rest of the file — imports, `Activiteit`/`ActiviteitRow`/`ActiviteitSectionProps`, `columns`, the returned JSX — is unchanged.)

- [ ] **Step 7: Implement — `src/components/beheer/BeheerShell.tsx`**

Replace `collection(db, 'activiteiten')` with `collection(db, 'activiteitenlog')` in the `loadActiviteiten` effect (the only occurrence in this file).

- [ ] **Step 8: Implement — `firestore.rules`**

Replace the `activiteiten` match block:
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
```
with:
```
    match /activiteitenlog/{id} {
      allow create: if request.resource.data.type in
          ['kunstwerk_bekeken','mandje_toegevoegd','bestelling_geplaatst','account_bezocht',
           'word_klant_bezocht','word_klant_aanvraag','klant_goedgekeurd','klant_afgewezen',
           'bestelling_goedgekeurd','bestelling_afgewezen',
           'materiaalsoort_toegevoegd','materiaalsoort_gewijzigd','materiaalsoort_verwijderd',
           'materiaal_toegevoegd','materiaal_gewijzigd','materiaal_verwijderd',
           'maat_toegevoegd','maat_gewijzigd','maat_verwijderd',
           'segment_toegevoegd','segment_gewijzigd','segment_verwijderd',
           'kunstwerk_toegevoegd','kunstwerk_gewijzigd','kunstwerk_verwijderd',
           'prijsgroep_toegevoegd','prijsgroep_gewijzigd','prijsgroep_verwijderd']
        && request.resource.data.keys().hasOnly(['type','actorId','actorEmail','actorNaam','timestamp'])
        && request.resource.data.actorEmail is string
        && request.resource.data.actorNaam is string;
      allow read: if request.auth != null &&
        exists(/databases/$(database)/documents/medewerkers/$(request.auth.uid));
      allow update, delete: if false;
    }
```

Deploy: run `npx --yes firebase-tools deploy --only firestore:rules --project glassart-and-design`. Expected output includes `+  cloud.firestore: rules file firestore.rules compiled successfully` and `+  Deploy complete!`.

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/logActiviteit.test.ts tests/components/beheer/AdminDashboard.test.tsx tests/components/beheer/ActiviteitSection.test.tsx tests/components/beheer/BeheerShell.test.tsx tests/components/beheer/BeheerNav.test.tsx`
Expected: PASS

- [ ] **Step 10: Run the full suite to check for regressions**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src/lib/logActiviteit.ts src/components/beheer/AdminDashboard.tsx src/components/beheer/ActiviteitSection.tsx src/components/beheer/BeheerShell.tsx firestore.rules messages/nl.json tests/lib/logActiviteit.test.ts tests/components/beheer/AdminDashboard.test.tsx tests/components/beheer/ActiviteitSection.test.tsx tests/components/beheer/BeheerShell.test.tsx tests/components/beheer/BeheerNav.test.tsx
git commit -m "$(cat <<'EOF'
feat: rename activiteitenlog collection, remove beheer_bezocht, add 22 beheer-actie event types

Renames the activiteiten Firestore collection to activiteitenlog
(matching the Beheer menu label) and widens ActiviteitType with 22
new values for upcoming status-change and CRUD logging across Beheer.
beheer_bezocht is dropped entirely -- it was pure noise. Firestore
rules deployed live.
EOF
)"
```

---

## Task 2: Log `klant_goedgekeurd`/`klant_afgewezen` in `KlantModal`

**Files:**
- Modify: `src/components/beheer/KlantModal.tsx`
- Test: `tests/components/beheer/KlantModal.test.tsx`

**Interfaces:**
- Consumes: `logActiviteit`, `actorFromMedewerker` (`@/lib/logActiviteit`, Task 1); `useAdminAuth` (`@/lib/useAdminAuth`, existing).

- [ ] **Step 1: Write the failing tests**

In `tests/components/beheer/KlantModal.test.tsx`, add near the other top-level mock declarations (after the existing `firebase/firestore` mock block):
```tsx
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
```

In `beforeEach`, add `logActiviteitMock.mockReset();` alongside `updateDocMock.mockReset();`.

Add three new tests at the end of the `describe('KlantModal', ...)` block, just before its closing `});`:
```tsx
  it('logs klant_goedgekeurd with the logged-in medewerker on approval', async () => {
    updateDocMock.mockResolvedValue(undefined);
    renderModal(KLANT);
    fireEvent.change(screen.getByTestId('klant-modal-prijsgroep'), { target: { value: 'Premium' } });
    fireEvent.click(screen.getByTestId('klant-modal-goedkeuren'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('klant_goedgekeurd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('logs klant_afgewezen with the logged-in medewerker on rejection', async () => {
    updateDocMock.mockResolvedValue(undefined);
    renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('klant_afgewezen', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('does not log when updateDoc fails', async () => {
    updateDocMock.mockRejectedValue(new Error('offline'));
    renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen'));
    await screen.findByTestId('klant-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/KlantModal.test.tsx`
Expected: FAIL — `logActiviteitMock` never called.

- [ ] **Step 3: Implement**

In `src/components/beheer/KlantModal.tsx`, replace the top of the file:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Modal } from '@/components/Modal';
import type { Klant } from './KlantenSection';
```
with:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Modal } from '@/components/Modal';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Klant } from './KlantenSection';
```

Inside `KlantModal(...)`, after `const [error, setError] = useState<string | null>(null);`, add:
```tsx
  const { user } = useAdminAuth();
```

Replace `handleGoedkeuren`/`handleAfwijzen`:
```tsx
  async function handleGoedkeuren() {
    if (!klant) return;
    try {
      await updateDoc(doc(db, 'klanten', klant.id), { status: 'Goedgekeurd', prijsgroep });
      void logActiviteit('klant_goedgekeurd', actorFromMedewerker(user));
      onUpdated({ ...klant, status: 'Goedgekeurd', prijsgroep });
    } catch {
      setError(t('klantenActionError'));
    }
  }

  async function handleAfwijzen() {
    if (!klant) return;
    try {
      await updateDoc(doc(db, 'klanten', klant.id), { status: 'Afgewezen' });
      void logActiviteit('klant_afgewezen', actorFromMedewerker(user));
      onUpdated({ ...klant, status: 'Afgewezen' });
    } catch {
      setError(t('klantenActionError'));
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/KlantModal.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/KlantModal.tsx tests/components/beheer/KlantModal.test.tsx
git commit -m "$(cat <<'EOF'
feat: log klant_goedgekeurd/klant_afgewezen in KlantModal

Logs the medewerker who approved/rejected a klant, only after the
Firestore status update succeeds.
EOF
)"
```

---

## Task 3: Log `bestelling_goedgekeurd`/`bestelling_afgewezen` in `BestellingModal`

**Files:**
- Modify: `src/components/beheer/BestellingModal.tsx`
- Test: `tests/components/beheer/BestellingModal.test.tsx`

**Interfaces:**
- Consumes: `logActiviteit`, `actorFromMedewerker` (Task 1); `useAdminAuth` (existing).

- [ ] **Step 1: Write the failing tests**

In `tests/components/beheer/BestellingModal.test.tsx`, add near the other top-level mock declarations:
```tsx
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
```

In `beforeEach`, add `logActiviteitMock.mockReset();`.

Add three new tests at the end of the `describe('BestellingModal', ...)` block, just before its closing `});` (use the file's existing `BESTELLING`/`renderModal` fixtures):
```tsx
  it('logs bestelling_goedgekeurd with the logged-in medewerker on approval', async () => {
    updateDocMock.mockResolvedValue(undefined);
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-goedkeuren'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('bestelling_goedgekeurd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('logs bestelling_afgewezen with the logged-in medewerker on rejection', async () => {
    updateDocMock.mockResolvedValue(undefined);
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('bestelling_afgewezen', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('does not log when updateDoc fails', async () => {
    updateDocMock.mockRejectedValue(new Error('offline'));
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen'));
    await screen.findByTestId('bestelling-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });
```

If the file's existing `renderModal` helper does not already accept a bare `Bestelling` and wrap it with the module's default `KUNSTWERKEN`/`MATERIALEN`/`MATEN`/`MATERIAALSOORTEN` fixtures, adapt the three calls above to that helper's actual signature — read the file first and match its existing calling convention exactly (do not change the helper itself).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx`
Expected: FAIL — `logActiviteitMock` never called.

- [ ] **Step 3: Implement**

In `src/components/beheer/BestellingModal.tsx`, add imports after the existing `import { Modal } from '@/components/Modal';` line:
```tsx
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
```

Inside `BestellingModal(...)`, after `const [error, setError] = useState<string | null>(null);`, add:
```tsx
  const { user } = useAdminAuth();
```

Replace `handleGoedkeuren`/`handleAfwijzen`:
```tsx
  async function handleGoedkeuren() {
    if (!bestelling) return;
    try {
      await updateDoc(doc(db, 'bestelheaders', bestelling.id), { status: 'Goedgekeurd' });
      void logActiviteit('bestelling_goedgekeurd', actorFromMedewerker(user));
      onUpdated({ ...bestelling, status: 'Goedgekeurd' });
    } catch {
      setError(t('bestellingenActionError'));
    }
  }

  async function handleAfwijzen() {
    if (!bestelling) return;
    try {
      await updateDoc(doc(db, 'bestelheaders', bestelling.id), { status: 'Afgewezen' });
      void logActiviteit('bestelling_afgewezen', actorFromMedewerker(user));
      onUpdated({ ...bestelling, status: 'Afgewezen' });
    } catch {
      setError(t('bestellingenActionError'));
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/BestellingModal.tsx tests/components/beheer/BestellingModal.test.tsx
git commit -m "$(cat <<'EOF'
feat: log bestelling_goedgekeurd/bestelling_afgewezen in BestellingModal

Logs the medewerker who approved/rejected a bestelling, only after
the Firestore status update succeeds.
EOF
)"
```

---

## Task 4: Log `materiaalsoort_toegevoegd`/`_gewijzigd`/`_verwijderd` in `MateriaalsoortenSection`

**Files:**
- Modify: `src/components/beheer/MateriaalsoortenSection.tsx`
- Test: `tests/components/beheer/MateriaalsoortenSection.test.tsx`

**Interfaces:**
- Consumes: `logActiviteit`, `actorFromMedewerker` (Task 1); `useAdminAuth` (existing).

- [ ] **Step 1: Write the failing tests**

In `tests/components/beheer/MateriaalsoortenSection.test.tsx`, add near the top (after the existing imports):
```tsx
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
```

Add a `beforeEach` block right after that (this file currently has none):
```tsx
beforeEach(() => {
  logActiviteitMock.mockReset();
});
```
(add `beforeEach` to the existing `import { describe, expect, it, vi } from 'vitest';` line, making it `import { describe, expect, it, vi, beforeEach } from 'vitest';`)

Add three new tests at the end of the `describe('MateriaalsoortenSection', ...)` block, just before its closing `});`:
```tsx
  it('logs materiaalsoort_toegevoegd with the logged-in medewerker when adding', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('materiaalsoorten-add'));
    fireEvent.change(screen.getByTestId('materiaalsoort-modal-omschrijving'), { target: { value: 'Acryl' } });
    fireEvent.click(screen.getByTestId('materiaalsoort-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('materiaalsoort_toegevoegd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('logs materiaalsoort_gewijzigd with the logged-in medewerker when editing', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-soort-2'));
    fireEvent.change(screen.getByTestId('materiaalsoort-modal-omschrijving'), { target: { value: 'Dibond 3mm' } });
    fireEvent.click(screen.getByTestId('materiaalsoort-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('materiaalsoort_gewijzigd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('logs materiaalsoort_verwijderd with the logged-in medewerker when deleting', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-soort-2'));
    fireEvent.click(screen.getByTestId('materiaalsoort-modal-verwijderen'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('materiaalsoort_verwijderd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('does not log when a blocked delete is attempted', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-soort-1'));
    fireEvent.click(screen.getByTestId('materiaalsoort-modal-verwijderen'));
    await screen.findByTestId('materiaalsoort-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });

  it('does not log when adding fails', async () => {
    const onAdd = vi.fn().mockResolvedValue(false);
    renderSection({ onAdd });
    fireEvent.click(screen.getByTestId('materiaalsoorten-add'));
    fireEvent.change(screen.getByTestId('materiaalsoort-modal-omschrijving'), { target: { value: 'Acryl' } });
    fireEvent.click(screen.getByTestId('materiaalsoort-modal-opslaan'));
    await screen.findByTestId('materiaalsoort-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/MateriaalsoortenSection.test.tsx`
Expected: FAIL — `logActiviteitMock` never called.

- [ ] **Step 3: Implement**

In `src/components/beheer/MateriaalsoortenSection.tsx`, replace the top of the file:
```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import type { Materiaalsoort, Materiaal } from './materiaalTypes';
```
with:
```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Materiaalsoort, Materiaal } from './materiaalTypes';
```

Inside `MateriaalsoortenSection(...)`, after `const [actionError, setActionError] = useState<string | null>(null);`, add:
```tsx
  const { user } = useAdminAuth();
```

Replace `handleSave`/`handleRemove`:
```tsx
  async function handleSave() {
    if (!modalState) return;
    const success =
      modalState.mode === 'add'
        ? await onAdd({ omschrijving })
        : await onUpdate(modalState.materiaalsoort.id, { omschrijving });
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'materiaalsoort_toegevoegd' : 'materiaalsoort_gewijzigd',
        actorFromMedewerker(user)
      );
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
      void logActiviteit('materiaalsoort_verwijderd', actorFromMedewerker(user));
      closeModal();
    } else {
      setActionError(t('materiaalsoortenActionError'));
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/MateriaalsoortenSection.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/MateriaalsoortenSection.tsx tests/components/beheer/MateriaalsoortenSection.test.tsx
git commit -m "$(cat <<'EOF'
feat: log materiaalsoort toegevoegd/gewijzigd/verwijderd

Logs the medewerker who added/edited/removed a materiaalsoort, only
on a genuinely successful write -- never on a failed or blocked
(still-in-use) attempt.
EOF
)"
```

---

## Task 5: Log `materiaal_*` in `MaterialenSection` + Kunstwerk-koppeling verwijder-bescherming

**Files:**
- Modify: `src/components/beheer/MaterialenSection.tsx`
- Modify: `src/components/beheer/BeheerShell.tsx`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/MaterialenSection.test.tsx`

**Interfaces:**
- Consumes: `logActiviteit`, `actorFromMedewerker` (Task 1); `useAdminAuth` (existing); `Kunstwerk` type (`./materiaalTypes`, existing).
- Produces: `MaterialenSectionProps` gains `kunstwerken: Kunstwerk[] | null` — Task 6 does the analogous change for `MatenSection` independently (no shared interface between them).

- [ ] **Step 1: Add the translation key**

In `messages/nl.json`'s `beheer` namespace, add right after `"materiaalsoortenVerwijderBlocked": "Deze materiaalsoort is nog gekoppeld aan materialen en kan niet verwijderd worden.",`:
```json
  "materialenVerwijderBlocked": "Dit materiaal is nog gekoppeld aan een kunstwerk en kan niet verwijderd worden.",
```

- [ ] **Step 2: Write the failing tests**

In `tests/components/beheer/MaterialenSection.test.tsx`, add near the top (after the existing type imports):
```tsx
import type { Kunstwerk } from '@/components/beheer/materiaalTypes';

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

const KUNSTWERKEN: Kunstwerk[] = [
  {
    id: 'kw-1',
    foto: 'https://example.com/kw-1.jpg',
    segmentIds: [],
    materiaalIds: ['mat-1'],
    maatIds: [],
    prijzen: [],
    omschrijvingNl: 'Hotel paneel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
];
```

Update the `renderSection` helper's default props to include `kunstwerken={KUNSTWERKEN}` and add `beforeEach(() => { logActiviteitMock.mockReset(); });` right after the helper (add `beforeEach` to the existing vitest import line if not already present).

Add six new tests at the end of the `describe('MaterialenSection', ...)` block, just before its closing `});`:
```tsx
  it('blocks deleting a materiaal that is still referenced by a kunstwerk', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-mat-1'));
    fireEvent.click(screen.getByTestId('materiaal-modal-verwijderen'));
    expect(await screen.findByTestId('materiaal-modal-error')).toHaveTextContent(
      'Dit materiaal is nog gekoppeld aan een kunstwerk en kan niet verwijderd worden.'
    );
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('deletes a materiaal with no linked kunstwerk', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-mat-2'));
    fireEvent.click(screen.getByTestId('materiaal-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('mat-2'));
  });

  it('logs materiaal_toegevoegd when adding', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('materialen-add'));
    fireEvent.change(screen.getByTestId('materiaal-modal-dikte'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('materiaal-modal-omschrijving'), { target: { value: 'Nieuw' } });
    fireEvent.click(screen.getByTestId('materiaal-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('materiaal_toegevoegd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('logs materiaal_gewijzigd when editing', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-mat-2'));
    fireEvent.change(screen.getByTestId('materiaal-modal-omschrijving'), { target: { value: 'Bijgewerkt' } });
    fireEvent.click(screen.getByTestId('materiaal-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('materiaal_gewijzigd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('logs materiaal_verwijderd when deleting', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-mat-2'));
    fireEvent.click(screen.getByTestId('materiaal-modal-verwijderen'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('materiaal_verwijderd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('does not log when a blocked delete is attempted', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-mat-1'));
    fireEvent.click(screen.getByTestId('materiaal-modal-verwijderen'));
    await screen.findByTestId('materiaal-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });
```

(The fixture `MATERIALEN` in this file already has `mat-1` and `mat-2` — `KUNSTWERKEN` above only references `mat-1`, so `mat-2` is the "no linked kunstwerk" case.)

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/MaterialenSection.test.tsx`
Expected: FAIL — no `kunstwerken` prop yet, no guard, no logging.

- [ ] **Step 4: Implement — `src/components/beheer/MaterialenSection.tsx`**

Replace the top of the file:
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
```
with:
```tsx
'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Materiaal, Materiaalsoort, Kunstwerk } from './materiaalTypes';

interface MaterialenSectionProps {
  materialen: Materiaal[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  kunstwerken: Kunstwerk[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Materiaal, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Materiaal, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}
```

Replace the function signature:
```tsx
export function MaterialenSection({
  materialen,
  materiaalsoorten,
  loadError,
  onAdd,
  onUpdate,
  onRemove,
}: MaterialenSectionProps) {
  const t = useTranslations('beheer');
```
with:
```tsx
export function MaterialenSection({
  materialen,
  materiaalsoorten,
  kunstwerken,
  loadError,
  onAdd,
  onUpdate,
  onRemove,
}: MaterialenSectionProps) {
  const t = useTranslations('beheer');
  const { user } = useAdminAuth();
```

Replace `handleSave`/`handleRemove`:
```tsx
  async function handleSave() {
    if (!modalState) return;
    const data = { materiaalsoortId, materiaaldikte: Number(materiaaldikte), omschrijving };
    const success =
      modalState.mode === 'add' ? await onAdd(data) : await onUpdate(modalState.materiaal.id, data);
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'materiaal_toegevoegd' : 'materiaal_gewijzigd',
        actorFromMedewerker(user)
      );
      closeModal();
    } else {
      setActionError(t('materialenActionError'));
    }
  }

  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const inUse = (kunstwerken ?? []).some((kunstwerk) =>
      kunstwerk.materiaalIds.includes(modalState.materiaal.id)
    );
    if (inUse) {
      setActionError(t('materialenVerwijderBlocked'));
      return;
    }
    const success = await onRemove(modalState.materiaal.id);
    if (success) {
      void logActiviteit('materiaal_verwijderd', actorFromMedewerker(user));
      closeModal();
    } else {
      setActionError(t('materialenActionError'));
    }
  }
```

- [ ] **Step 5: Implement — `src/components/beheer/BeheerShell.tsx`**

In the `activeSection === 'materialen'` branch, add the new prop:
```tsx
        ) : activeSection === 'materialen' ? (
          <MaterialenSection
            materialen={materialen.items}
            materiaalsoorten={materiaalsoorten.items}
            kunstwerken={kunstwerken.items}
            loadError={materialen.error === 'load' ? t('materialenLoadError') : null}
            onAdd={materialen.add}
            onUpdate={materialen.update}
            onRemove={materialen.remove}
          />
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/MaterialenSection.test.tsx`
Expected: PASS

- [ ] **Step 7: Run the full suite to check for regressions**

Run: `npx vitest run`
Expected: PASS — `BeheerShell.test.tsx`'s existing `MaterialenSection` usage inside its render flow must still work with a `kunstwerken` value coming from its already-mocked `kunstwerken` collection fixture (no test-file change needed there since `kunstwerken.items` was already computed and available; only the JSX call site gained a new prop wired from existing state).

- [ ] **Step 8: Commit**

```bash
git add src/components/beheer/MaterialenSection.tsx src/components/beheer/BeheerShell.tsx messages/nl.json tests/components/beheer/MaterialenSection.test.tsx
git commit -m "$(cat <<'EOF'
feat: block deleting a materiaal still used by a kunstwerk, log materiaal_*

Materialen previously had no delete guard at all (unlike
Materiaalsoorten) -- a materiaal referenced by a kunstwerk's
materiaalIds could be deleted, leaving a dangling reference. Adds the
same guard pattern, plus toegevoegd/gewijzigd/verwijderd logging.
EOF
)"
```

---

## Task 6: Log `maat_*` in `MatenSection` + Kunstwerk-koppeling verwijder-bescherming

**Files:**
- Modify: `src/components/beheer/MatenSection.tsx`
- Modify: `src/components/beheer/BeheerShell.tsx`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/MatenSection.test.tsx`

**Interfaces:**
- Consumes: `logActiviteit`, `actorFromMedewerker` (Task 1); `useAdminAuth` (existing); `Kunstwerk` type (existing).
- Produces: `MatenSectionProps` gains `kunstwerken: Kunstwerk[] | null` (independent of Task 5's identical change to `MaterialenSectionProps`).

- [ ] **Step 1: Add the translation key**

In `messages/nl.json`'s `beheer` namespace, add right after `"materialenVerwijderBlocked": "Dit materiaal is nog gekoppeld aan een kunstwerk en kan niet verwijderd worden.",` (added by Task 5):
```json
  "matenVerwijderBlocked": "Deze maat is nog gekoppeld aan een kunstwerk en kan niet verwijderd worden.",
```

- [ ] **Step 2: Write the failing tests**

In `tests/components/beheer/MatenSection.test.tsx`, add near the top:
```tsx
import type { Kunstwerk } from '@/components/beheer/materiaalTypes';

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

const KUNSTWERKEN: Kunstwerk[] = [
  {
    id: 'kw-1',
    foto: 'https://example.com/kw-1.jpg',
    segmentIds: [],
    materiaalIds: [],
    maatIds: ['maat-1'],
    prijzen: [],
    omschrijvingNl: 'Hotel paneel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
];
```

Update `renderSection`'s default props to include `kunstwerken={KUNSTWERKEN}`, and add `beforeEach(() => { logActiviteitMock.mockReset(); });` (add `beforeEach` to the vitest import line).

Add six new tests at the end of the `describe('MatenSection', ...)` block, just before its closing `});` — same shape as Task 5's, using `maat-1` (linked, blocked) and `maat-2` (unlinked, deletable):
```tsx
  it('blocks deleting a maat that is still referenced by a kunstwerk', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-maat-1'));
    fireEvent.click(screen.getByTestId('maat-modal-verwijderen'));
    expect(await screen.findByTestId('maat-modal-error')).toHaveTextContent(
      'Deze maat is nog gekoppeld aan een kunstwerk en kan niet verwijderd worden.'
    );
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('deletes a maat with no linked kunstwerk', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-maat-2'));
    fireEvent.click(screen.getByTestId('maat-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('maat-2'));
  });

  it('logs maat_toegevoegd when adding', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('maten-add'));
    fireEvent.change(screen.getByTestId('maat-modal-breedte'), { target: { value: '50' } });
    fireEvent.change(screen.getByTestId('maat-modal-hoogte'), { target: { value: '70' } });
    fireEvent.click(screen.getByTestId('maat-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('maat_toegevoegd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('logs maat_gewijzigd when editing', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-maat-2'));
    fireEvent.change(screen.getByTestId('maat-modal-breedte'), { target: { value: '65' } });
    fireEvent.click(screen.getByTestId('maat-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('maat_gewijzigd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('logs maat_verwijderd when deleting', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-maat-2'));
    fireEvent.click(screen.getByTestId('maat-modal-verwijderen'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('maat_verwijderd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('does not log when a blocked delete is attempted', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-maat-1'));
    fireEvent.click(screen.getByTestId('maat-modal-verwijderen'));
    await screen.findByTestId('maat-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/MatenSection.test.tsx`
Expected: FAIL

- [ ] **Step 4: Implement — `src/components/beheer/MatenSection.tsx`**

Replace the top of the file:
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
```
with:
```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Maat, Kunstwerk } from './materiaalTypes';

interface MatenSectionProps {
  maten: Maat[] | null;
  kunstwerken: Kunstwerk[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Maat, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Maat, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

type ModalState = { mode: 'add' } | { mode: 'edit'; maat: Maat } | null;

export function MatenSection({ maten, kunstwerken, loadError, onAdd, onUpdate, onRemove }: MatenSectionProps) {
  const t = useTranslations('beheer');
  const { user } = useAdminAuth();
```

Replace `handleSave`/`handleRemove`:
```tsx
  async function handleSave() {
    if (!modalState) return;
    const data = { breedte: Number(breedte), hoogte: Number(hoogte) };
    const success = modalState.mode === 'add' ? await onAdd(data) : await onUpdate(modalState.maat.id, data);
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'maat_toegevoegd' : 'maat_gewijzigd',
        actorFromMedewerker(user)
      );
      closeModal();
    } else {
      setActionError(t('matenActionError'));
    }
  }

  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const inUse = (kunstwerken ?? []).some((kunstwerk) => kunstwerk.maatIds.includes(modalState.maat.id));
    if (inUse) {
      setActionError(t('matenVerwijderBlocked'));
      return;
    }
    const success = await onRemove(modalState.maat.id);
    if (success) {
      void logActiviteit('maat_verwijderd', actorFromMedewerker(user));
      closeModal();
    } else {
      setActionError(t('matenActionError'));
    }
  }
```

- [ ] **Step 5: Implement — `src/components/beheer/BeheerShell.tsx`**

In the `activeSection === 'maten'` branch, add the new prop:
```tsx
        ) : activeSection === 'maten' ? (
          <MatenSection
            maten={maten.items}
            kunstwerken={kunstwerken.items}
            loadError={maten.error === 'load' ? t('matenLoadError') : null}
            onAdd={maten.add}
            onUpdate={maten.update}
            onRemove={maten.remove}
          />
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/MatenSection.test.tsx`
Expected: PASS

- [ ] **Step 7: Run the full suite to check for regressions**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/beheer/MatenSection.tsx src/components/beheer/BeheerShell.tsx messages/nl.json tests/components/beheer/MatenSection.test.tsx
git commit -m "$(cat <<'EOF'
feat: block deleting a maat still used by a kunstwerk, log maat_*

Same gap and fix as MaterialenSection (Task 5): maten had no delete
guard against kunstwerk.maatIds references. Adds the guard plus
toegevoegd/gewijzigd/verwijderd logging.
EOF
)"
```

---

## Task 7: Log `segment_toegevoegd`/`_gewijzigd`/`_verwijderd` in `SegmentenSection`

**Files:**
- Modify: `src/components/beheer/SegmentenSection.tsx`
- Test: `tests/components/beheer/SegmentenSection.test.tsx`

**Interfaces:**
- Consumes: `logActiviteit`, `actorFromMedewerker` (Task 1); `useAdminAuth` (existing).

- [ ] **Step 1: Write the failing tests**

In `tests/components/beheer/SegmentenSection.test.tsx`, add near the top (matching Task 4's `MateriaalsoortenSection.test.tsx` pattern exactly, adjusted for Segmenten's own fixture row ids — read the file first to confirm its exact row-id fixtures, e.g. `seg-1`/`seg-2`, and use those in place of `soort-1`/`soort-2` below):
```tsx
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
```

Add `beforeEach(() => { logActiviteitMock.mockReset(); });` (add `beforeEach` to the vitest import line if missing).

Add four new tests at the end of the `describe('SegmentenSection', ...)` block, just before its closing `});`, following the exact same shape as Task 4's `materiaalsoort_toegevoegd`/`_gewijzigd`/`_verwijderd`/"does not log when adding fails" tests, with `segment_toegevoegd`/`segment_gewijzigd`/`segment_verwijderd` as the expected type values, using this file's own `data-testid`s (`segmenten-add`, `segment-modal-omschrijving`, `segment-modal-opslaan`, `segment-modal-verwijderen`) and its own row fixtures.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/SegmentenSection.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement**

In `src/components/beheer/SegmentenSection.tsx`, replace the top of the file:
```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import type { Segment } from './materiaalTypes';
```
with:
```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Segment } from './materiaalTypes';
```

Inside `SegmentenSection(...)`, after `const [actionError, setActionError] = useState<string | null>(null);`, add:
```tsx
  const { user } = useAdminAuth();
```

Replace `handleSave`/`handleRemove`:
```tsx
  async function handleSave() {
    if (!modalState) return;
    const success =
      modalState.mode === 'add'
        ? await onAdd({ omschrijving })
        : await onUpdate(modalState.segment.id, { omschrijving });
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'segment_toegevoegd' : 'segment_gewijzigd',
        actorFromMedewerker(user)
      );
      closeModal();
    } else {
      setActionError(t('segmentenActionError'));
    }
  }

  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const success = await onRemove(modalState.segment.id);
    if (success) {
      void logActiviteit('segment_verwijderd', actorFromMedewerker(user));
      closeModal();
    } else {
      setActionError(t('segmentenActionError'));
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/SegmentenSection.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/SegmentenSection.tsx tests/components/beheer/SegmentenSection.test.tsx
git commit -m "$(cat <<'EOF'
feat: log segment toegevoegd/gewijzigd/verwijderd
EOF
)"
```

---

## Task 8: Log `kunstwerk_toegevoegd`/`_gewijzigd`/`_verwijderd` in `KunstwerkenSection`

**Files:**
- Modify: `src/components/beheer/KunstwerkenSection.tsx`
- Test: `tests/components/beheer/KunstwerkenSection.test.tsx`

**Interfaces:**
- Consumes: `logActiviteit`, `actorFromMedewerker` (Task 1); `useAdminAuth` (existing).

- [ ] **Step 1: Write the failing tests**

In `tests/components/beheer/KunstwerkenSection.test.tsx`, add the same `logActiviteitMock`/`useAdminAuth`/`logActiviteit` mocks used in Tasks 4/7 (read the file first to place them consistently with its existing mock block — it already mocks `useKunstwerkFotoUpload`, add these alongside), plus `beforeEach(() => { logActiviteitMock.mockReset(); });`.

Add tests mirroring Task 4's shape, adapted to this file's own add/edit/remove flow (`kunstwerken-add`/`kunstwerk-modal-opslaan`/`kunstwerk-modal-verwijderen` test-ids and whatever minimal required-field fills its existing "adds a new kunstwerk" test already performs) asserting `kunstwerk_toegevoegd`, `kunstwerk_gewijzigd`, and `kunstwerk_verwijderd` respectively, plus a "does not log when adding fails" case.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement**

In `src/components/beheer/KunstwerkenSection.tsx`, add imports after the existing `import { useKunstwerkFotoUpload } from '@/lib/useKunstwerkFotoUpload';` line:
```tsx
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
```

Inside `KunstwerkenSection(...)`, after `const { uploading, error: fotoUploadError, upload } = useKunstwerkFotoUpload();`, add:
```tsx
  const { user } = useAdminAuth();
```

In `handleSave`, replace:
```tsx
    const success = modalState.mode === 'add' ? await onAdd(data) : await onUpdate(modalState.kunstwerk.id, data);
    if (success) {
      closeModal();
    } else {
      setActionError(t('kunstwerkenActionError'));
    }
  }
```
with:
```tsx
    const success = modalState.mode === 'add' ? await onAdd(data) : await onUpdate(modalState.kunstwerk.id, data);
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'kunstwerk_toegevoegd' : 'kunstwerk_gewijzigd',
        actorFromMedewerker(user)
      );
      closeModal();
    } else {
      setActionError(t('kunstwerkenActionError'));
    }
  }
```

In `handleRemove`, replace:
```tsx
  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const success = await onRemove(modalState.kunstwerk.id);
    if (success) {
      closeModal();
    } else {
      setActionError(t('kunstwerkenActionError'));
    }
  }
```
with:
```tsx
  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const success = await onRemove(modalState.kunstwerk.id);
    if (success) {
      void logActiviteit('kunstwerk_verwijderd', actorFromMedewerker(user));
      closeModal();
    } else {
      setActionError(t('kunstwerkenActionError'));
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/KunstwerkenSection.tsx tests/components/beheer/KunstwerkenSection.test.tsx
git commit -m "$(cat <<'EOF'
feat: log kunstwerk toegevoegd/gewijzigd/verwijderd
EOF
)"
```

---

## Task 9: Nieuwe tabel Prijsgroepen (zonder Klant-koppeling-bescherming — die volgt in Task 10)

**Files:**
- Modify: `src/components/beheer/materiaalTypes.ts`
- Create: `src/components/beheer/PrijsgroepenSection.tsx`
- Modify: `src/components/beheer/BeheerNav.tsx`
- Modify: `src/components/beheer/BeheerShell.tsx`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/PrijsgroepenSection.test.tsx`
- Test: `tests/components/beheer/BeheerNav.test.tsx`
- Test: `tests/components/beheer/BeheerShell.test.tsx`

**Interfaces:**
- Produces: `Prijsgroep` type (`{ id, naam, kortingspercentage }`), `PrijsgroepenSection` component. Task 10 adds a `klanten`-linked delete guard to this same component and adds a `prijsgroepen`-sourced dropdown to `KlantModal`.

- [ ] **Step 1: Add the `Prijsgroep` type**

In `src/components/beheer/materiaalTypes.ts`, add at the end of the file:
```ts

export interface Prijsgroep {
  id: string;
  naam: string;
  kortingspercentage: number;
}
```

- [ ] **Step 2: Add translation keys**

In `messages/nl.json`'s `beheer` namespace, add these new keys (placement doesn't matter, e.g. right after the `kunstwerken*` block):
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

- [ ] **Step 3: Write the failing test**

Create `tests/components/beheer/PrijsgroepenSection.test.tsx`, modeled directly on `tests/components/beheer/MateriaalsoortenSection.test.tsx` (same structure: `renderSection` helper with `onAdd`/`onUpdate`/`onRemove` mocks, load-error/null/list/add/disabled-until-filled/edit/action-error-on-fail tests), adapted for two fields instead of one:
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
  { id: 'pg-1', naam: 'Standaard', kortingspercentage: 0 },
  { id: 'pg-2', naam: 'Wholesale', kortingspercentage: 15 },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof PrijsgroepenSection>> = {}) {
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <PrijsgroepenSection
        prijsgroepen={PRIJSGROEPEN}
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

  it('lists the prijsgroepen in the table', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-pg-1')).toHaveTextContent('Standaard');
    expect(screen.getByTestId('data-table-row-pg-2')).toHaveTextContent('Wholesale');
    expect(screen.getByTestId('data-table-row-pg-2')).toHaveTextContent('15');
  });

  it('adds a new prijsgroep, closes the modal, and logs prijsgroep_toegevoegd', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('prijsgroepen-add'));
    fireEvent.change(screen.getByTestId('prijsgroep-modal-naam'), { target: { value: 'VIP' } });
    fireEvent.change(screen.getByTestId('prijsgroep-modal-kortingspercentage'), { target: { value: '25' } });
    fireEvent.click(screen.getByTestId('prijsgroep-modal-opslaan'));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ naam: 'VIP', kortingspercentage: 25 }));
    await waitFor(() => expect(screen.queryByTestId('prijsgroep-modal')).not.toBeInTheDocument());
    expect(logActiviteitMock).toHaveBeenCalledWith('prijsgroep_toegevoegd', {
      id: 'staff-1',
      email: 'paul@glassartanddesign.com',
      naam: 'paul@glassartanddesign.com',
    });
  });

  it('disables Opslaan until naam is filled in', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('prijsgroepen-add'));
    expect(screen.getByTestId('prijsgroep-modal-opslaan')).toBeDisabled();
    fireEvent.change(screen.getByTestId('prijsgroep-modal-naam'), { target: { value: 'X' } });
    expect(screen.getByTestId('prijsgroep-modal-opslaan')).not.toBeDisabled();
  });

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
    expect(logActiviteitMock).toHaveBeenCalledWith('prijsgroep_gewijzigd', {
      id: 'staff-1',
      email: 'paul@glassartanddesign.com',
      naam: 'paul@glassartanddesign.com',
    });
  });

  it('deletes a prijsgroep and logs prijsgroep_verwijderd', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-pg-1'));
    fireEvent.click(screen.getByTestId('prijsgroep-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('pg-1'));
    expect(logActiviteitMock).toHaveBeenCalledWith('prijsgroep_verwijderd', {
      id: 'staff-1',
      email: 'paul@glassartanddesign.com',
      naam: 'paul@glassartanddesign.com',
    });
  });

  it('shows an action error and does not log when adding fails', async () => {
    const onAdd = vi.fn().mockResolvedValue(false);
    renderSection({ onAdd });
    fireEvent.click(screen.getByTestId('prijsgroepen-add'));
    fireEvent.change(screen.getByTestId('prijsgroep-modal-naam'), { target: { value: 'VIP' } });
    fireEvent.click(screen.getByTestId('prijsgroep-modal-opslaan'));
    expect(await screen.findByTestId('prijsgroep-modal-error')).toHaveTextContent(
      'Er is iets misgegaan. Probeer het opnieuw.'
    );
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });
});
```

Add to `tests/components/beheer/BeheerNav.test.tsx`: update `renderNav`'s props to include `prijsgroepenCount={9}`, move the assertion block so `beheer-nav-prijsgroepen` is checked as an active item (`toHaveTextContent('Prijsgroepen')` and `toHaveTextContent('9')`), and remove `'prijsgroepen'` from the `['glassartDesign'].forEach(...)` disabled-items loop (only `glassartDesign` remains disabled).

Add to `tests/components/beheer/BeheerShell.test.tsx`: add `prijsgroepen: []` to `DEFAULT_COLLECTIONS`, and a new test asserting `beheer-nav-prijsgroepen` shows the right count and clicking it renders `prijsgroepen-section`, mirroring the existing `activiteitenlog` test added in Task 1.

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/PrijsgroepenSection.test.tsx tests/components/beheer/BeheerNav.test.tsx tests/components/beheer/BeheerShell.test.tsx`
Expected: FAIL — `PrijsgroepenSection` doesn't exist yet, `BeheerNav`/`BeheerShell` don't know about it.

- [ ] **Step 5: Implement — `src/components/beheer/PrijsgroepenSection.tsx`**

Create the file:
```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Prijsgroep } from './materiaalTypes';

interface PrijsgroepenSectionProps {
  prijsgroepen: Prijsgroep[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Prijsgroep, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Prijsgroep, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

type ModalState = { mode: 'add' } | { mode: 'edit'; prijsgroep: Prijsgroep } | null;

export function PrijsgroepenSection({
  prijsgroepen,
  loadError,
  onAdd,
  onUpdate,
  onRemove,
}: PrijsgroepenSectionProps) {
  const t = useTranslations('beheer');
  const { user } = useAdminAuth();
  const [modalState, setModalState] = useState<ModalState>(null);
  const [naam, setNaam] = useState('');
  const [kortingspercentage, setKortingspercentage] = useState('');
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
    setKortingspercentage('');
    setActionError(null);
    setModalState({ mode: 'add' });
  }

  function openEdit(prijsgroep: Prijsgroep) {
    setNaam(prijsgroep.naam);
    setKortingspercentage(String(prijsgroep.kortingspercentage));
    setActionError(null);
    setModalState({ mode: 'edit', prijsgroep });
  }

  function closeModal() {
    setModalState(null);
  }

  async function handleSave() {
    if (!modalState) return;
    const data = { naam, kortingspercentage: Number(kortingspercentage) };
    const success =
      modalState.mode === 'add' ? await onAdd(data) : await onUpdate(modalState.prijsgroep.id, data);
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'prijsgroep_toegevoegd' : 'prijsgroep_gewijzigd',
        actorFromMedewerker(user)
      );
      closeModal();
    } else {
      setActionError(t('prijsgroepenActionError'));
    }
  }

  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const success = await onRemove(modalState.prijsgroep.id);
    if (success) {
      void logActiviteit('prijsgroep_verwijderd', actorFromMedewerker(user));
      closeModal();
    } else {
      setActionError(t('prijsgroepenActionError'));
    }
  }

  const columns: Column<Prijsgroep>[] = [
    { key: 'naam', label: t('prijsgroepenColNaam') },
    { key: 'kortingspercentage', label: t('prijsgroepenColKortingspercentage') },
  ];

  return (
    <div data-testid="prijsgroepen-section">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={openAdd}
          data-testid="prijsgroepen-add"
          className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
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
      <Modal isOpen={modalState !== null} onClose={closeModal} closeLabel={t('modalClose')}>
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
            {t('prijsgroepenLabelKortingspercentage')}
            <input
              type="number"
              value={kortingspercentage}
              onChange={(event) => setKortingspercentage(event.target.value)}
              data-testid="prijsgroep-modal-kortingspercentage"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>

          {actionError && (
            <p data-testid="prijsgroep-modal-error" className="text-xs text-red-400">
              {actionError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!naam}
              data-testid="prijsgroep-modal-opslaan"
              className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('prijsgroepenOpslaan')}
            </button>
            {modalState?.mode === 'edit' && (
              <button
                type="button"
                onClick={handleRemove}
                data-testid="prijsgroep-modal-verwijderen"
                className="rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('prijsgroepenVerwijderen')}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 6: Implement — `src/components/beheer/BeheerNav.tsx`**

Replace:
```tsx
export type BeheerSection =
  | 'klanten'
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
  { id: 'bestellingen', labelKey: 'navBestellingen' },
  { id: 'materiaalsoorten', labelKey: 'navMateriaalsoorten' },
  { id: 'materialen', labelKey: 'navMaterialen' },
  { id: 'maten', labelKey: 'navMaten' },
  { id: 'segmenten', labelKey: 'navSegmenten' },
  { id: 'kunstwerken', labelKey: 'navKunstwerken' },
  { id: 'activiteit', labelKey: 'navActiviteit' },
];

const DISABLED_ITEMS: { id: string; labelKey: string }[] = [
  { id: 'prijsgroepen', labelKey: 'navPrijsgroepen' },
  { id: 'glassartDesign', labelKey: 'navGlassartDesign' },
];
```
with:
```tsx
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

interface BeheerNavProps {
  activeSection: BeheerSection;
  onSelect: (section: BeheerSection) => void;
  onLogout: () => void;
  klantenCount: number;
  bestellingenCount: number;
  materiaalsoortenCount: number;
  materialenCount: number;
  matenCount: number;
  segmentenCount: number;
  kunstwerkenCount: number;
  prijsgroepenCount: number;
  activiteitCount: number;
}

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

Replace the function signature and `counts` map:
```tsx
export function BeheerNav({
  activeSection,
  onSelect,
  onLogout,
  klantenCount,
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
    bestellingen: bestellingenCount,
    materiaalsoorten: materiaalsoortenCount,
    materialen: materialenCount,
    maten: matenCount,
    segmenten: segmentenCount,
    kunstwerken: kunstwerkenCount,
    activiteit: activiteitCount,
  };
```
with:
```tsx
export function BeheerNav({
  activeSection,
  onSelect,
  onLogout,
  klantenCount,
  bestellingenCount,
  materiaalsoortenCount,
  materialenCount,
  matenCount,
  segmentenCount,
  kunstwerkenCount,
  prijsgroepenCount,
  activiteitCount,
}: BeheerNavProps) {
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

- [ ] **Step 7: Implement — `src/components/beheer/BeheerShell.tsx`**

Add the import:
```tsx
import { PrijsgroepenSection } from './PrijsgroepenSection';
```
and add `Prijsgroep` to the existing `import type { Materiaalsoort, Materiaal, Maat, Segment, Kunstwerk } from './materiaalTypes';` line, making it:
```tsx
import type { Materiaalsoort, Materiaal, Maat, Segment, Kunstwerk, Prijsgroep } from './materiaalTypes';
```

Add a new `useFirestoreCollection` call right after the `kunstwerken` one:
```tsx
  const prijsgroepen = useFirestoreCollection<Prijsgroep>('prijsgroepen');
```

Add the count:
```tsx
  const prijsgroepenCount = (prijsgroepen.items ?? []).length;
```

Pass the new prop to `BeheerNav`:
```tsx
        <BeheerNav
          activeSection={activeSection}
          onSelect={setActiveSection}
          onLogout={onLogout}
          klantenCount={klantenCount}
          bestellingenCount={bestellingenCount}
          materiaalsoortenCount={materiaalsoortenCount}
          materialenCount={materialenCount}
          matenCount={matenCount}
          segmentenCount={segmentenCount}
          kunstwerkenCount={kunstwerkenCount}
          prijsgroepenCount={prijsgroepenCount}
          activiteitCount={activiteitCount}
        />
```

Change the section-switch's `kunstwerken` branch from the terminal `else` to an explicit check, adding a new terminal branch for `prijsgroepen`. Replace:
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
        ) : activeSection === 'prijsgroepen' ? (
          <PrijsgroepenSection
            prijsgroepen={prijsgroepen.items}
            loadError={prijsgroepen.error === 'load' ? t('prijsgroepenLoadError') : null}
            onAdd={prijsgroepen.add}
            onUpdate={prijsgroepen.update}
            onRemove={prijsgroepen.remove}
          />
        ) : (
          <ActiviteitSection activiteiten={activiteiten} loadError={activiteitenLoadError} />
        )}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/PrijsgroepenSection.test.tsx tests/components/beheer/BeheerNav.test.tsx tests/components/beheer/BeheerShell.test.tsx`
Expected: PASS

- [ ] **Step 9: Run the full suite and type-check**

Run: `npx vitest run`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: no output (clean)

- [ ] **Step 10: Commit**

```bash
git add src/components/beheer/materiaalTypes.ts src/components/beheer/PrijsgroepenSection.tsx src/components/beheer/BeheerNav.tsx src/components/beheer/BeheerShell.tsx messages/nl.json tests/components/beheer/PrijsgroepenSection.test.tsx tests/components/beheer/BeheerNav.test.tsx tests/components/beheer/BeheerShell.test.tsx
git commit -m "$(cat <<'EOF'
feat: add Prijsgroepen table (naam + kortingspercentage) with CRUD logging

New Beheer section, promoted from the disabled nav placeholder to a
real CRUD table (naam, kortingspercentage), same pattern as
Materiaalsoorten/Segmenten. No delete guard against Klant usage yet
-- that lands in the next task alongside the Klant.prijsgroepId
migration it depends on.
EOF
)"
```

---

## Task 10: Klant.prijsgroep → prijsgroepId (echte koppeling) + Prijsgroepen-verwijder-bescherming

**Files:**
- Modify: `src/components/beheer/KlantenSection.tsx`
- Modify: `src/components/RegistrationForm.tsx`
- Modify: `src/components/beheer/KlantModal.tsx`
- Modify: `src/components/beheer/PrijsgroepenSection.tsx`
- Modify: `src/components/beheer/BeheerShell.tsx`
- Modify: `firestore.rules`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/KlantenSection.test.tsx`
- Test: `tests/components/RegistrationForm.test.tsx`
- Test: `tests/components/beheer/KlantModal.test.tsx`
- Test: `tests/components/beheer/PrijsgroepenSection.test.tsx`
- Test: `tests/components/beheer/BeheerShell.test.tsx`

**Interfaces:**
- Produces: `Klant.prijsgroepId: string | null` replaces `Klant.prijsgroep: string` — the final shape every earlier task's `Klant` references now use.

- [ ] **Step 1: Add the translation key**

In `messages/nl.json`'s `beheer` namespace, add right after `"matenVerwijderBlocked": "..."`  (Task 6):
```json
  "prijsgroepenVerwijderBlocked": "Deze prijsgroep is nog aan een klant toegewezen en kan niet verwijderd worden.",
```

- [ ] **Step 2: Write the failing tests**

In `tests/components/beheer/KlantenSection.test.tsx`, replace every fixture's `prijsgroep: '...'` field with `prijsgroepId: '...' | null` matching the new shape (read the file first and update each `Klant` object literal consistently — there is no behavior change to assert beyond the renamed field, since `KlantenSection` itself doesn't render `prijsgroep`/`prijsgroepId` directly, only passes `Klant` objects through).

In `tests/components/RegistrationForm.test.tsx`, change the `setDoc` payload assertion:
```tsx
    expect(setDocMock).toHaveBeenCalledWith(
      { collection: 'klanten', id: 'uid-123' },
      expect.objectContaining({
        companyName: 'Testbedrijf BV',
        kvk: '12345678',
        contactPerson: 'Jan Jansen',
        email: 'jan@example.com',
        phone: '0612345678',
        address: 'Teststraat 1',
        postcode: '1234 AB',
        city: 'Teststad',
        status: 'Beoordelen',
        prijsgroep: '',
      })
    );
```
to:
```tsx
    expect(setDocMock).toHaveBeenCalledWith(
      { collection: 'klanten', id: 'uid-123' },
      expect.objectContaining({
        companyName: 'Testbedrijf BV',
        kvk: '12345678',
        contactPerson: 'Jan Jansen',
        email: 'jan@example.com',
        phone: '0612345678',
        address: 'Teststraat 1',
        postcode: '1234 AB',
        city: 'Teststad',
        status: 'Beoordelen',
        prijsgroepId: null,
      })
    );
```

In `tests/components/beheer/KlantModal.test.tsx`, replace the `KLANT` fixture's `prijsgroep: ''` with `prijsgroepId: null`. Add a `PRIJSGROEPEN` fixture and update `renderModal` to pass it:
```tsx
import type { Prijsgroep } from '@/components/beheer/materiaalTypes';

const PRIJSGROEPEN: Prijsgroep[] = [
  { id: 'pg-1', naam: 'Standaard', kortingspercentage: 0 },
  { id: 'pg-2', naam: 'Premium', kortingspercentage: 10 },
];

function renderModal(klant: Klant | null, prijsgroepen: Prijsgroep[] | null = PRIJSGROEPEN) {
  const onClose = vi.fn();
  const onUpdated = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <KlantModal klant={klant} prijsgroepen={prijsgroepen} onClose={onClose} onUpdated={onUpdated} />
    </NextIntlClientProvider>
  );
  return { onClose, onUpdated };
}
```

Replace these three existing tests:
```tsx
  it('shows the klant details and pre-fills the prijsgroep field', () => {
    renderModal({ ...KLANT, prijsgroep: 'Standaard' });
    expect(screen.getByTestId('klant-modal')).toHaveTextContent('Testbedrijf BV');
    expect(screen.getByTestId('klant-modal')).toHaveTextContent('12345678');
    expect(screen.getByTestId('klant-modal-prijsgroep')).toHaveValue('Standaard');
  });

  it('disables Goedkeuren until a prijsgroep is filled in', () => {
    renderModal(KLANT);
    expect(screen.getByTestId('klant-modal-goedkeuren')).toBeDisabled();
    fireEvent.change(screen.getByTestId('klant-modal-prijsgroep'), { target: { value: 'Standaard' } });
    expect(screen.getByTestId('klant-modal-goedkeuren')).not.toBeDisabled();
  });

  it('approves the klant and calls onUpdated with the updated klant', async () => {
    updateDocMock.mockResolvedValue(undefined);
    const { onUpdated } = renderModal(KLANT);
    fireEvent.change(screen.getByTestId('klant-modal-prijsgroep'), { target: { value: 'Premium' } });
    fireEvent.click(screen.getByTestId('klant-modal-goedkeuren'));

    await waitFor(() =>
      expect(updateDocMock).toHaveBeenCalledWith(
        { collectionName: 'klanten', id: 'uid-1' },
        { status: 'Goedgekeurd', prijsgroep: 'Premium' }
      )
    );
    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith({ ...KLANT, status: 'Goedgekeurd', prijsgroep: 'Premium' })
    );
  });
```
with:
```tsx
  it('shows the klant details and pre-selects the prijsgroep dropdown', () => {
    renderModal({ ...KLANT, prijsgroepId: 'pg-1' });
    expect(screen.getByTestId('klant-modal')).toHaveTextContent('Testbedrijf BV');
    expect(screen.getByTestId('klant-modal')).toHaveTextContent('12345678');
    expect(screen.getByTestId('klant-modal-prijsgroep')).toHaveValue('pg-1');
  });

  it('disables Goedkeuren until a prijsgroep is selected', () => {
    renderModal(KLANT);
    expect(screen.getByTestId('klant-modal-goedkeuren')).toBeDisabled();
    fireEvent.change(screen.getByTestId('klant-modal-prijsgroep'), { target: { value: 'pg-1' } });
    expect(screen.getByTestId('klant-modal-goedkeuren')).not.toBeDisabled();
  });

  it('lists every prijsgroep as a dropdown option', () => {
    renderModal(KLANT);
    const options = screen.getByTestId('klant-modal-prijsgroep').querySelectorAll('option');
    expect(Array.from(options).map((option) => option.textContent)).toEqual(
      expect.arrayContaining(['Standaard', 'Premium'])
    );
  });

  it('approves the klant and calls onUpdated with the updated klant', async () => {
    updateDocMock.mockResolvedValue(undefined);
    const { onUpdated } = renderModal(KLANT);
    fireEvent.change(screen.getByTestId('klant-modal-prijsgroep'), { target: { value: 'pg-2' } });
    fireEvent.click(screen.getByTestId('klant-modal-goedkeuren'));

    await waitFor(() =>
      expect(updateDocMock).toHaveBeenCalledWith(
        { collectionName: 'klanten', id: 'uid-1' },
        { status: 'Goedgekeurd', prijsgroepId: 'pg-2' }
      )
    );
    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith({ ...KLANT, status: 'Goedgekeurd', prijsgroepId: 'pg-2' })
    );
  });
```

(Leave the rejection/error tests as-is except updating the `KLANT` fixture's field name; they don't touch prijsgroep directly.)

In `tests/components/beheer/PrijsgroepenSection.test.tsx`, add a `klanten` prop to `renderSection`'s default props and add two new tests at the end of the `describe` block:
```tsx
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
```
(`as never` sidesteps importing the full `Klant` type just for two fields the guard actually reads — acceptable in a test fixture; do not use this cast in production code.)

Also update `renderSection`'s default `overrides` call so existing tests keep passing with `klanten={[]}` as the default when not overridden:
```tsx
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
```

In `tests/components/beheer/BeheerShell.test.tsx`, update the `KLANT_DATA` fixture's `prijsgroep: ''` to `prijsgroepId: null`, and add `klanten={klanten}` is already implicitly covered since `BeheerShell` already threads its loaded `klanten` state into `KlantenSection` — no new prop needed there for the test, only for `PrijsgroepenSection` (covered by the Step 7 production change below; add a fixture-level check only if the existing tests directly assert on it, otherwise no test change needed here beyond the fixture field rename).

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/KlantenSection.test.tsx tests/components/RegistrationForm.test.tsx tests/components/beheer/KlantModal.test.tsx tests/components/beheer/PrijsgroepenSection.test.tsx tests/components/beheer/BeheerShell.test.tsx`
Expected: FAIL

- [ ] **Step 4: Implement — `src/components/beheer/KlantenSection.tsx`**

Replace:
```tsx
  status: 'Beoordelen' | 'Goedgekeurd' | 'Afgewezen';
  prijsgroep: string;
}
```
with:
```tsx
  status: 'Beoordelen' | 'Goedgekeurd' | 'Afgewezen';
  prijsgroepId: string | null;
}
```

- [ ] **Step 5: Implement — `src/components/RegistrationForm.tsx`**

Replace:
```tsx
          status: 'Beoordelen',
          prijsgroep: '',
```
with:
```tsx
          status: 'Beoordelen',
          prijsgroepId: null,
```

- [ ] **Step 6: Implement — `src/components/beheer/KlantModal.tsx`**

Replace the top of the file:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Modal } from '@/components/Modal';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Klant } from './KlantenSection';

interface KlantModalProps {
  klant: Klant | null;
  onClose: () => void;
  onUpdated: (klant: Klant) => void;
}

export function KlantModal({ klant, onClose, onUpdated }: KlantModalProps) {
  const t = useTranslations('beheer');
  const { user } = useAdminAuth();
  const [prijsgroep, setPrijsgroep] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (klant) {
      setPrijsgroep(klant.prijsgroep);
      setError(null);
    }
  }, [klant]);

  async function handleGoedkeuren() {
    if (!klant) return;
    try {
      await updateDoc(doc(db, 'klanten', klant.id), { status: 'Goedgekeurd', prijsgroep });
      void logActiviteit('klant_goedgekeurd', actorFromMedewerker(user));
      onUpdated({ ...klant, status: 'Goedgekeurd', prijsgroep });
    } catch {
      setError(t('klantenActionError'));
    }
  }
```
with:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Modal } from '@/components/Modal';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Klant } from './KlantenSection';
import type { Prijsgroep } from './materiaalTypes';

interface KlantModalProps {
  klant: Klant | null;
  prijsgroepen: Prijsgroep[] | null;
  onClose: () => void;
  onUpdated: (klant: Klant) => void;
}

export function KlantModal({ klant, prijsgroepen, onClose, onUpdated }: KlantModalProps) {
  const t = useTranslations('beheer');
  const { user } = useAdminAuth();
  const [prijsgroepId, setPrijsgroepId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (klant) {
      setPrijsgroepId(klant.prijsgroepId ?? '');
      setError(null);
    }
  }, [klant]);

  async function handleGoedkeuren() {
    if (!klant) return;
    try {
      await updateDoc(doc(db, 'klanten', klant.id), { status: 'Goedgekeurd', prijsgroepId });
      void logActiviteit('klant_goedgekeurd', actorFromMedewerker(user));
      onUpdated({ ...klant, status: 'Goedgekeurd', prijsgroepId });
    } catch {
      setError(t('klantenActionError'));
    }
  }
```

Replace the prijsgroep `<input>` field:
```tsx
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('klantenLabelPrijsgroep')}
            <input
              type="text"
              value={prijsgroep}
              onChange={(event) => setPrijsgroep(event.target.value)}
              data-testid="klant-modal-prijsgroep"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
```
with:
```tsx
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('klantenLabelPrijsgroep')}
            <select
              value={prijsgroepId}
              onChange={(event) => setPrijsgroepId(event.target.value)}
              data-testid="klant-modal-prijsgroep"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            >
              <option value="" disabled>
                {t('klantenLabelPrijsgroep')}
              </option>
              {(prijsgroepen ?? []).map((prijsgroep) => (
                <option key={prijsgroep.id} value={prijsgroep.id}>
                  {prijsgroep.naam}
                </option>
              ))}
            </select>
          </label>
```

Replace the Goedkeuren button's `disabled` prop:
```tsx
              disabled={!prijsgroep}
```
with:
```tsx
              disabled={!prijsgroepId}
```

- [ ] **Step 7: Implement — `src/components/beheer/PrijsgroepenSection.tsx`**

Replace:
```tsx
import type { Prijsgroep } from './materiaalTypes';

interface PrijsgroepenSectionProps {
  prijsgroepen: Prijsgroep[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Prijsgroep, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Prijsgroep, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}
```
with:
```tsx
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
```

Replace the function signature:
```tsx
export function PrijsgroepenSection({
  prijsgroepen,
  loadError,
  onAdd,
  onUpdate,
  onRemove,
}: PrijsgroepenSectionProps) {
```
with:
```tsx
export function PrijsgroepenSection({
  prijsgroepen,
  klanten,
  loadError,
  onAdd,
  onUpdate,
  onRemove,
}: PrijsgroepenSectionProps) {
```

Replace `handleRemove`:
```tsx
  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const success = await onRemove(modalState.prijsgroep.id);
    if (success) {
      void logActiviteit('prijsgroep_verwijderd', actorFromMedewerker(user));
      closeModal();
    } else {
      setActionError(t('prijsgroepenActionError'));
    }
  }
```
with:
```tsx
  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const inUse = (klanten ?? []).some((klant) => klant.prijsgroepId === modalState.prijsgroep.id);
    if (inUse) {
      setActionError(t('prijsgroepenVerwijderBlocked'));
      return;
    }
    const success = await onRemove(modalState.prijsgroep.id);
    if (success) {
      void logActiviteit('prijsgroep_verwijderd', actorFromMedewerker(user));
      closeModal();
    } else {
      setActionError(t('prijsgroepenActionError'));
    }
  }
```

- [ ] **Step 8: Implement — `src/components/beheer/BeheerShell.tsx`**

Add the new prop to the existing `<KlantenSection .../>` call:
```tsx
        {activeSection === 'klanten' ? (
          <KlantenSection klanten={klanten} loadError={loadError} onKlantUpdated={handleKlantUpdated} />
```
Since `KlantenSection` itself renders `KlantModal` internally (not `BeheerShell` directly), the `prijsgroepen` data needs to flow through `KlantenSection` too. Add `prijsgroepen: Prijsgroep[] | null` to `KlantenSectionProps` in `src/components/beheer/KlantenSection.tsx` (from Step 4 above — extend that same edit) and thread it to `KlantModal`:

In `src/components/beheer/KlantenSection.tsx`, replace:
```tsx
interface KlantenSectionProps {
  klanten: Klant[] | null;
  loadError: string | null;
  onKlantUpdated: (klant: Klant) => void;
}

export function KlantenSection({ klanten, loadError, onKlantUpdated }: KlantenSectionProps) {
```
with:
```tsx
interface KlantenSectionProps {
  klanten: Klant[] | null;
  prijsgroepen: Prijsgroep[] | null;
  loadError: string | null;
  onKlantUpdated: (klant: Klant) => void;
}

export function KlantenSection({ klanten, prijsgroepen, loadError, onKlantUpdated }: KlantenSectionProps) {
```
and add `import type { Prijsgroep } from './materiaalTypes';` to its imports. Replace the `<KlantModal .../>` call:
```tsx
      <KlantModal
        klant={selectedKlant}
        onClose={() => setSelectedKlant(null)}
        onUpdated={(updated) => {
          onKlantUpdated(updated);
          setSelectedKlant(null);
        }}
      />
```
with:
```tsx
      <KlantModal
        klant={selectedKlant}
        prijsgroepen={prijsgroepen}
        onClose={() => setSelectedKlant(null)}
        onUpdated={(updated) => {
          onKlantUpdated(updated);
          setSelectedKlant(null);
        }}
      />
```

Back in `BeheerShell.tsx`: update the `klanten`-mapping effect's Firestore field name (`prijsgroep: data.prijsgroep` → `prijsgroepId: data.prijsgroepId`):
```tsx
              status: data.status,
              prijsgroep: data.prijsgroep,
            } as Klant;
```
becomes:
```tsx
              status: data.status,
              prijsgroepId: data.prijsgroepId,
            } as Klant;
```

Update the `<KlantenSection .../>` call:
```tsx
        {activeSection === 'klanten' ? (
          <KlantenSection klanten={klanten} loadError={loadError} onKlantUpdated={handleKlantUpdated} />
```
to:
```tsx
        {activeSection === 'klanten' ? (
          <KlantenSection
            klanten={klanten}
            prijsgroepen={prijsgroepen.items}
            loadError={loadError}
            onKlantUpdated={handleKlantUpdated}
          />
```

Update the `<PrijsgroepenSection .../>` call (added in Task 9) to also pass `klanten`:
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
```

- [ ] **Step 9: Implement — `firestore.rules`**

Replace:
```
    match /klanten/{uid} {
      allow create: if request.auth != null && request.auth.uid == uid &&
        request.resource.data.status == 'Beoordelen' &&
        request.resource.data.prijsgroep == '';
```
with:
```
    match /klanten/{uid} {
      allow create: if request.auth != null && request.auth.uid == uid &&
        request.resource.data.status == 'Beoordelen' &&
        request.resource.data.prijsgroepId == null;
```

Also add a rule for the new `prijsgroepen` collection (introduced by Task 9's component but not yet given a Firestore rule — without this, every read/write to it is denied by default). Insert a new match block right before `match /klanten/{uid} {`:
```
    match /prijsgroepen/{id} {
      allow read: if true;
      allow write: if request.auth != null && exists(/databases/$(database)/documents/medewerkers/$(request.auth.uid));
    }
```
(Same pattern as `materiaalsoorten`/`materialen`/`maten`/`segmenten`/`kunstwerken`.)

Deploy: run `npx --yes firebase-tools deploy --only firestore:rules --project glassart-and-design`. Expected output includes `+  cloud.firestore: rules file firestore.rules compiled successfully` and `+  Deploy complete!`.

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/KlantenSection.test.tsx tests/components/RegistrationForm.test.tsx tests/components/beheer/KlantModal.test.tsx tests/components/beheer/PrijsgroepenSection.test.tsx tests/components/beheer/BeheerShell.test.tsx`
Expected: PASS

- [ ] **Step 11: Run the full suite and type-check**

Run: `npx vitest run`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: no output (clean)

- [ ] **Step 12: Commit**

```bash
git add src/components/beheer/KlantenSection.tsx src/components/RegistrationForm.tsx src/components/beheer/KlantModal.tsx src/components/beheer/PrijsgroepenSection.tsx src/components/beheer/BeheerShell.tsx firestore.rules messages/nl.json tests/components/beheer/KlantenSection.test.tsx tests/components/RegistrationForm.test.tsx tests/components/beheer/KlantModal.test.tsx tests/components/beheer/PrijsgroepenSection.test.tsx tests/components/beheer/BeheerShell.test.tsx
git commit -m "$(cat <<'EOF'
feat: Klant.prijsgroep -> prijsgroepId real FK, block prijsgroep delete if assigned

KlantModal's free-text prijsgroep field becomes a dropdown sourced
from the Prijsgroepen table, storing a real reference (prijsgroepId)
instead of a copied string -- prevents typos/inconsistent naming.
Also adds the deferred delete guard on Prijsgroepen (blocked if a
klant still has it assigned), and a missing Firestore rule for the
prijsgroepen collection itself (Task 9 shipped the UI before this
rule existed). firestore.rules deployed live.
EOF
)"
```

---

## Task 11: Full-suite verification

**Files:** none — verification only, no code changes.

**Interfaces:** none.

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — all test files green.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: `✓ Compiled successfully` and all static pages generated.

- [ ] **Step 4: Report**

No commit for this task. If any step fails, return to the relevant earlier task, fix, and re-run this task from Step 1.
