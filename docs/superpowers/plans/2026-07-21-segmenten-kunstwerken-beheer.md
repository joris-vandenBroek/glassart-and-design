# Segmenten & Kunstwerken Beheer (Deel 1) Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 21-07-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new Firestore-backed beheer sections — Segmenten (simple CRUD, mirrors Materiaalsoorten) and Kunstwerken (photo upload to Firebase Storage, segment/materiaal/maat multi-select, an auto-generated price grid, manually-entered multi-language descriptions) — seeded with the site's 6 existing segments, 3 existing standard sizes, and 36 example artworks derived from the current homepage photos.

**Architecture:** Segmenten follows the existing `MateriaalsoortenSection` pattern exactly (flat `{ id, omschrijving }`, no delete-block). Kunstwerken is new ground: it uses a new `useKunstwerkFotoUpload` hook wrapping Firebase Storage's `uploadBytes`/`getDownloadURL`, and a form that auto-derives a price-per-combination grid from two checkbox groups (materialen × maten). Both sections reuse the existing generic `useFirestoreCollection` hook and `DataTable`/`Modal` components — this is the first time that hook is used with array-valued and nested-object fields (`segmentIds: string[]`, `prijzen: {...}[]`), which Firestore supports natively without any hook changes.

**Tech Stack:** Next.js (client components), Firebase Firestore + Storage SDKs, `next-intl`, Vitest + Testing Library.

## Global Constraints

- All new user-facing strings go only into `messages/nl.json`, in the existing `beheer` namespace, `{section}{Field}` key convention. Do not touch `en.json`/`de.json`/`fr.json`.
- The visible "id" of every row is always the Firestore document id — never a user-entered field.
- No backend: this site is a static export (`output: 'export'`, no API routes, no server actions). Everything here runs client-side in the browser.
- Kunstwerk-beschrijvingen: `omschrijvingNl` is required; `omschrijvingFr`/`omschrijvingDe`/`omschrijvingEn` are optional, manually entered, editable at any time. No translation API of any kind.
- Watermarking is explicitly out of scope for this plan — the uploaded photo is stored and displayed clean, with no overlay logic anywhere in this plan's code.
- Firebase collection names: `segmenten`, `kunstwerken` (lower-case, matching `klanten`/`materiaalsoorten`/`materialen`/`maten`).
- Price values: plain JS `number` in euros (not cents), matching the existing `AdminInvoice.amount` convention in `src/data/mockAdminInvoices.ts`.
- `materiaalTypes.ts` stays a standalone file with zero other imports (existing rule, to avoid circular imports between sibling section components).

---

## File Structure

**New files:**
- `src/data/kunstwerkenSeed.ts` — `SEGMENTEN_SEED`, `MATEN_SEED`, `berekenVoorbeeldprijs()`, `buildKunstwerkenSeed()`.
- `src/lib/useKunstwerkFotoUpload.ts` — Firebase Storage upload hook.
- `src/components/beheer/SegmentenSection.tsx` — table + inline add/edit modal.
- `src/components/beheer/KunstwerkenSection.tsx` — table + inline add/edit modal with upload, multi-select, price grid.
- `storage.rules` — Firebase Storage security rules.
- `tests/data/kunstwerkenSeed.test.ts`
- `tests/lib/useKunstwerkFotoUpload.test.tsx`
- `tests/components/beheer/SegmentenSection.test.tsx`
- `tests/components/beheer/KunstwerkenSection.test.tsx`

**Modified files:**
- `src/components/beheer/materiaalTypes.ts` — add `Segment`, `Kunstwerk`, `PrijsRegel`.
- `src/lib/firebase.ts` — add `getStorage()` export.
- `firebase.json` — add `storage.rules` entry.
- `messages/nl.json` — new `beheer.*` keys.
- `src/components/beheer/BeheerNav.tsx` — new `segmenten` active item, `kunstwerken` activated (was a disabled placeholder).
- `src/components/beheer/BeheerShell.tsx` — wires the 2 new hooks + sections in, including maten seed (previously unseeded) and the multi-collection kunstwerken seed sequencing.
- `tests/components/beheer/BeheerNav.test.tsx`
- `tests/components/beheer/BeheerShell.test.tsx`

---

### Task 1: Shared types + price-formula helper + Segmenten/Maten seed data

**Files:**
- Modify: `src/components/beheer/materiaalTypes.ts`
- Create: `src/data/kunstwerkenSeed.ts`
- Test: `tests/data/kunstwerkenSeed.test.ts`

**Interfaces:**
- Produces: `Segment { id: string; omschrijving: string }`, `PrijsRegel { materiaalId: string; maatId: string; prijs: number }`, `Kunstwerk { id: string; foto: string; segmentIds: string[]; materiaalIds: string[]; maatIds: string[]; prijzen: PrijsRegel[]; omschrijvingNl: string; omschrijvingFr: string; omschrijvingDe: string; omschrijvingEn: string }` — consumed by every later task.
- Produces: `SEGMENTEN_SEED: Omit<Segment, 'id'>[]`, `MATEN_SEED: Omit<Maat, 'id'>[]`, `berekenVoorbeeldprijs(materiaaldikte: number, breedte: number, hoogte: number): number`, `buildKunstwerkenSeed(segmenten: Segment[], materialen: Materiaal[], maten: Maat[]): Omit<Kunstwerk, 'id'>[]` — consumed by Task 8 (`BeheerShell`).

- [ ] **Step 1: Add the new types**

Add to the end of `src/components/beheer/materiaalTypes.ts` (keep the existing `Materiaalsoort`/`Materiaal`/`Maat` interfaces unchanged above it):
```ts

export interface Segment {
  id: string;
  omschrijving: string;
}

export interface PrijsRegel {
  materiaalId: string;
  maatId: string;
  prijs: number;
}

export interface Kunstwerk {
  id: string;
  foto: string;
  segmentIds: string[];
  materiaalIds: string[];
  maatIds: string[];
  prijzen: PrijsRegel[];
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;
}
```

- [ ] **Step 2: Write the failing tests**

`tests/data/kunstwerkenSeed.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  SEGMENTEN_SEED,
  MATEN_SEED,
  berekenVoorbeeldprijs,
  buildKunstwerkenSeed,
} from '@/data/kunstwerkenSeed';
import type { Segment, Materiaal, Maat } from '@/components/beheer/materiaalTypes';

describe('SEGMENTEN_SEED', () => {
  it('contains the 6 segments from the homepage collections', () => {
    expect(SEGMENTEN_SEED).toEqual([
      { omschrijving: 'Hotel' },
      { omschrijving: 'Restaurant' },
      { omschrijving: 'Wellness' },
      { omschrijving: 'Office' },
      { omschrijving: 'Abstract' },
      { omschrijving: 'Artist Collections' },
    ]);
  });
});

describe('MATEN_SEED', () => {
  it('contains the 3 existing standard sizes', () => {
    expect(MATEN_SEED).toEqual([
      { breedte: 40, hoogte: 60 },
      { breedte: 60, hoogte: 90 },
      { breedte: 80, hoogte: 120 },
    ]);
  });
});

describe('berekenVoorbeeldprijs', () => {
  it('computes a price from surface area (cm² -> m²) plus a dikte surcharge', () => {
    // oppervlakte = (40*60)/10000 = 0.24 m²; 0.24 * 120 = 28.8; diktetoeslag = 4*5 = 20; totaal 48.8
    expect(berekenVoorbeeldprijs(4, 40, 60)).toBe(48.8);
  });

  it('is deterministic for the same inputs', () => {
    expect(berekenVoorbeeldprijs(3, 80, 120)).toBe(berekenVoorbeeldprijs(3, 80, 120));
  });

  it('produces a higher price for a larger maat', () => {
    expect(berekenVoorbeeldprijs(3, 80, 120)).toBeGreaterThan(berekenVoorbeeldprijs(3, 40, 60));
  });
});

describe('buildKunstwerkenSeed', () => {
  const SEGMENTEN: Segment[] = [
    { id: 'seg-hotel', omschrijving: 'Hotel' },
    { id: 'seg-restaurant', omschrijving: 'Restaurant' },
  ];
  const MATERIALEN: Materiaal[] = [
    { id: 'mat-b', materiaalsoortId: 'soort-1', materiaaldikte: 3, omschrijving: 'B' },
    { id: 'mat-a', materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'A' },
    { id: 'mat-c', materiaalsoortId: 'soort-1', materiaaldikte: 5, omschrijving: 'C' },
  ];
  const MATEN: Maat[] = [
    { id: 'maat-y', breedte: 60, hoogte: 90 },
    { id: 'maat-x', breedte: 40, hoogte: 60 },
    { id: 'maat-z', breedte: 80, hoogte: 120 },
  ];

  it('builds one kunstwerk per photo across only the recognized segments', () => {
    const result = buildKunstwerkenSeed(SEGMENTEN, MATERIALEN, MATEN);
    expect(result.length).toBe(12); // 2 segments * 6 photos each, unrecognized segments in the source data are skipped
  });

  it('assigns each kunstwerk to the correct segment via segmentIds', () => {
    const result = buildKunstwerkenSeed(SEGMENTEN, MATERIALEN, MATEN);
    const hotelCount = result.filter((k) => k.segmentIds.includes('seg-hotel')).length;
    expect(hotelCount).toBe(6);
  });

  it('picks the 2 lowest-id materialen and 2 lowest-id maten deterministically, regardless of input array order', () => {
    const result = buildKunstwerkenSeed(SEGMENTEN, MATERIALEN, MATEN);
    result.forEach((kunstwerk) => {
      expect(kunstwerk.materiaalIds).toEqual(['mat-a', 'mat-b']);
      expect(kunstwerk.maatIds).toEqual(['maat-x', 'maat-y']);
      expect(kunstwerk.prijzen.length).toBe(4);
    });
  });

  it('computes each prijzen entry via berekenVoorbeeldprijs for its materiaal/maat combination', () => {
    const result = buildKunstwerkenSeed(SEGMENTEN, MATERIALEN, MATEN);
    const eersteRegel = result[0].prijzen.find((p) => p.materiaalId === 'mat-a' && p.maatId === 'maat-x');
    expect(eersteRegel?.prijs).toBe(berekenVoorbeeldprijs(4, 40, 60));
  });

  it('gives each kunstwerk a Dutch placeholder description numbered within its segment, and empty fr/de/en', () => {
    const result = buildKunstwerkenSeed(SEGMENTEN, MATERIALEN, MATEN);
    const hotelDescriptions = result.filter((k) => k.segmentIds.includes('seg-hotel')).map((k) => k.omschrijvingNl);
    expect(hotelDescriptions).toEqual([
      'Hotel paneel 1',
      'Hotel paneel 2',
      'Hotel paneel 3',
      'Hotel paneel 4',
      'Hotel paneel 5',
      'Hotel paneel 6',
    ]);
    expect(result[0].omschrijvingFr).toBe('');
    expect(result[0].omschrijvingDe).toBe('');
    expect(result[0].omschrijvingEn).toBe('');
  });

  it('returns an empty array when there are fewer than 2 materialen or fewer than 2 maten', () => {
    expect(buildKunstwerkenSeed(SEGMENTEN, [MATERIALEN[0]], MATEN)).toEqual([]);
    expect(buildKunstwerkenSeed(SEGMENTEN, MATERIALEN, [MATEN[0]])).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/data/kunstwerkenSeed.test.ts`
Expected: FAIL with "Cannot find module '@/data/kunstwerkenSeed'"

- [ ] **Step 4: Implement the seed data and helpers**

`src/data/kunstwerkenSeed.ts`:
```ts
import type { Kunstwerk, Materiaal, Maat, Segment } from '@/components/beheer/materiaalTypes';

export const SEGMENTEN_SEED: Omit<Segment, 'id'>[] = [
  { omschrijving: 'Hotel' },
  { omschrijving: 'Restaurant' },
  { omschrijving: 'Wellness' },
  { omschrijving: 'Office' },
  { omschrijving: 'Abstract' },
  { omschrijving: 'Artist Collections' },
];

export const MATEN_SEED: Omit<Maat, 'id'>[] = [
  { breedte: 40, hoogte: 60 },
  { breedte: 60, hoogte: 90 },
  { breedte: 80, hoogte: 120 },
];

const BASISPRIJS_PER_M2 = 120;
const DIKTETOESLAG_PER_MM = 5;

export function berekenVoorbeeldprijs(materiaaldikte: number, breedte: number, hoogte: number): number {
  const oppervlakteM2 = (breedte * hoogte) / 10000;
  const prijs = oppervlakteM2 * BASISPRIJS_PER_M2 + materiaaldikte * DIKTETOESLAG_PER_MM;
  return Math.round(prijs * 100) / 100;
}

const KUNSTWERKEN_FOTOS_PER_SEGMENT: Record<string, string[]> = {
  Hotel: [
    'https://images.unsplash.com/photo-1625244724120-1fd1d34d00f6?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1677129667171-92abd8740fa3?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1742844552193-2fd3425cd26d?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1758193783649-13371d7fb8dd?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1768346564825-6f90c0b89e2e?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1744782996368-dc5b7e697f4c?q=80&w=1200&auto=format&fit=crop',
  ],
  Restaurant: [
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1643101570532-88c8ecc07c1f?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1653259038915-7cf0b7a4dd6c?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1551632436-cbf8dd35adfa?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1666032119084-82351976a922?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1703565426315-4209c2e88eea?q=80&w=1200&auto=format&fit=crop',
  ],
  Wellness: [
    'https://images.unsplash.com/photo-1757940556610-a114be4733bf?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1761470575018-135c213340eb?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1773924093206-9a433a14bb44?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1780788745510-6c8433984dfe?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1778331246390-2b91f56864e4?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1776763255459-99ddd8eebbfc?q=80&w=1200&auto=format&fit=crop',
  ],
  Office: [
    'https://images.unsplash.com/photo-1497366754035-f200968a6e72?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1706074793638-da28b90ea8ae?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1706074740295-d7a79c079562?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1531973576160-7125cd663d86?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1623177623442-979c1e42c255?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1556761175-4b46a572b786?q=80&w=1200&auto=format&fit=crop',
  ],
  Abstract: [
    'https://images.unsplash.com/photo-1605721911519-3dfeb3be25e7?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1618331833071-ce81bd50d300?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1533208087231-c3618eab623c?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1544733422-251e532ca221?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1532640331846-d2da5987c3ee?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1599753894977-bc6c162417e6?q=80&w=1200&auto=format&fit=crop',
  ],
  'Artist Collections': [
    'https://images.unsplash.com/photo-1740710543611-80b658171bc3?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1752649936574-84227cafab50?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1752649937266-1900d9e176c3?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1698498441161-f1e66acd1cff?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1676742663664-2da16ddcad7a?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1641766860997-53f4b4a68d23?q=80&w=1200&auto=format&fit=crop',
  ],
};

export function buildKunstwerkenSeed(
  segmenten: Segment[],
  materialen: Materiaal[],
  maten: Maat[]
): Omit<Kunstwerk, 'id'>[] {
  if (materialen.length < 2 || maten.length < 2) {
    return [];
  }
  const gekozenMaterialen = [...materialen].sort((a, b) => a.id.localeCompare(b.id)).slice(0, 2);
  const gekozenMaten = [...maten].sort((a, b) => a.id.localeCompare(b.id)).slice(0, 2);
  const materiaalIds = gekozenMaterialen.map((m) => m.id);
  const maatIds = gekozenMaten.map((m) => m.id);
  const prijzen = gekozenMaterialen.flatMap((materiaal) =>
    gekozenMaten.map((maat) => ({
      materiaalId: materiaal.id,
      maatId: maat.id,
      prijs: berekenVoorbeeldprijs(materiaal.materiaaldikte, maat.breedte, maat.hoogte),
    }))
  );

  return segmenten.flatMap((segment) => {
    const fotos = KUNSTWERKEN_FOTOS_PER_SEGMENT[segment.omschrijving];
    if (!fotos) {
      return [];
    }
    return fotos.map((foto, index) => ({
      foto,
      segmentIds: [segment.id],
      materiaalIds,
      maatIds,
      prijzen,
      omschrijvingNl: `${segment.omschrijving} paneel ${index + 1}`,
      omschrijvingFr: '',
      omschrijvingDe: '',
      omschrijvingEn: '',
    }));
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/data/kunstwerkenSeed.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/beheer/materiaalTypes.ts src/data/kunstwerkenSeed.ts tests/data/kunstwerkenSeed.test.ts
git commit -m "feat: add segment/kunstwerk types, price formula, and seed data"
```

---

### Task 2: Firebase Storage setup

**Files:**
- Modify: `src/lib/firebase.ts`
- Create: `storage.rules`
- Modify: `firebase.json`

**Interfaces:**
- Produces: `storage: FirebaseStorage` export from `@/lib/firebase` — consumed by Task 3 (`useKunstwerkFotoUpload`).

This task has no automated test — Firebase Storage rules and config cannot be exercised by the existing Vitest/mocked-SDK test setup (there is no local emulator wired into this project's test suite). Verification for this task is a code-review-level check (does it follow the existing `auth`/`db` pattern exactly) plus later end-to-end confirmation once Task 3's upload hook is used against a real Storage bucket.

- [ ] **Step 1: Add the Storage export**

Replace `src/lib/firebase.ts` with:
```ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Firebase is a client-only concern here (no backend, per design) — it must
// never initialize during Next.js's server-side static export prerendering,
// where these env vars may be absent or a Firebase project misconfiguration
// would otherwise fail the ENTIRE site build, not just the /beheer pages.
function getFirebaseApp() {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export const auth: Auth = typeof window !== 'undefined' ? getAuth(getFirebaseApp()) : ({} as Auth);
export const db: Firestore =
  typeof window !== 'undefined' ? getFirestore(getFirebaseApp()) : ({} as Firestore);
export const storage: FirebaseStorage =
  typeof window !== 'undefined' ? getStorage(getFirebaseApp()) : ({} as FirebaseStorage);
```

- [ ] **Step 2: Add Storage security rules**

Create `storage.rules`:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /kunstwerken/{fileName} {
      allow read: if true;
      allow write: if request.auth != null &&
        firestore.exists(/databases/(default)/documents/medewerkers/$(request.auth.uid));
    }
  }
}
```

- [ ] **Step 3: Register the rules file in firebase.json**

Modify `firebase.json` — it currently contains only the `firestore` key:
```json
{
  "firestore": {
    "rules": "firestore.rules"
  },
  "storage": {
    "rules": "storage.rules"
  }
}
```

- [ ] **Step 4: Verify the app still builds and the existing suite is unaffected**

Run: `npx tsc --noEmit`
Expected: no output (clean)

Run: `npm test`
Expected: all existing tests still pass (no new tests in this task, but confirms the `firebase.ts` change didn't break anything importing `auth`/`db`)

- [ ] **Step 5: Commit**

```bash
git add src/lib/firebase.ts storage.rules firebase.json
git commit -m "feat: add Firebase Storage setup and security rules"
```

---

### Task 3: `useKunstwerkFotoUpload` hook

**Files:**
- Create: `src/lib/useKunstwerkFotoUpload.ts`
- Test: `tests/lib/useKunstwerkFotoUpload.test.tsx`

**Interfaces:**
- Consumes: `storage` from `@/lib/firebase` (Task 2).
- Produces: `useKunstwerkFotoUpload(): { uploading: boolean; error: 'upload' | null; upload: (file: File) => Promise<string | null> }` — consumed by Task 7 (`KunstwerkenSection`). `upload()` resolves to the Storage download URL on success, or `null` on failure (with `error` set).

- [ ] **Step 1: Write the failing tests**

`tests/lib/useKunstwerkFotoUpload.test.tsx`:
```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { useKunstwerkFotoUpload } from '@/lib/useKunstwerkFotoUpload';

const uploadBytesMock = vi.fn();
const getDownloadURLMock = vi.fn();

vi.mock('@/lib/firebase', () => ({ storage: {} }));

vi.mock('firebase/storage', () => ({
  ref: vi.fn((_storage, path) => ({ path })),
  uploadBytes: (...args: unknown[]) => uploadBytesMock(...args),
  getDownloadURL: (...args: unknown[]) => getDownloadURLMock(...args),
}));

function TestConsumer() {
  const { uploading, error, upload } = useKunstwerkFotoUpload();
  const [url, setUrl] = useState<string | null>(null);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      const result = await upload(file);
      setUrl(result);
    }
  }

  return (
    <div>
      <input type="file" data-testid="file-input" onChange={handleChange} />
      <div data-testid="uploading">{String(uploading)}</div>
      <div data-testid="error">{error ?? 'none'}</div>
      <div data-testid="url">{url ?? 'none'}</div>
    </div>
  );
}

function makeFile(name = 'foto.jpg') {
  return new File(['inhoud'], name, { type: 'image/jpeg' });
}

beforeEach(() => {
  uploadBytesMock.mockReset();
  getDownloadURLMock.mockReset();
});

describe('useKunstwerkFotoUpload', () => {
  it('uploads the file and resolves with the download URL', async () => {
    uploadBytesMock.mockResolvedValue(undefined);
    getDownloadURLMock.mockResolvedValue('https://storage.example.com/foto.jpg');
    render(<TestConsumer />);
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [makeFile()] } });
    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('https://storage.example.com/foto.jpg'));
    expect(screen.getByTestId('error')).toHaveTextContent('none');
  });

  it('uploads to a path under kunstwerken/ that includes the original filename', async () => {
    uploadBytesMock.mockResolvedValue(undefined);
    getDownloadURLMock.mockResolvedValue('https://storage.example.com/foto.jpg');
    render(<TestConsumer />);
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [makeFile('mijn-kunstwerk.png')] } });
    await waitFor(() => expect(screen.getByTestId('url')).not.toHaveTextContent('none'));
    const [, pathArg] = uploadBytesMock.mock.calls[0][0].path ? [null, uploadBytesMock.mock.calls[0][0].path] : [];
    expect(pathArg).toMatch(/^kunstwerken\/.+mijn-kunstwerk\.png$/);
  });

  it('sets uploading to true while the upload is in flight, then false when done', async () => {
    let resolveUpload: (value: unknown) => void = () => {};
    uploadBytesMock.mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve;
      })
    );
    getDownloadURLMock.mockResolvedValue('https://storage.example.com/foto.jpg');
    render(<TestConsumer />);
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [makeFile()] } });
    await waitFor(() => expect(screen.getByTestId('uploading')).toHaveTextContent('true'));
    resolveUpload(undefined);
    await waitFor(() => expect(screen.getByTestId('uploading')).toHaveTextContent('false'));
  });

  it('sets an error and resolves null when uploadBytes fails', async () => {
    uploadBytesMock.mockRejectedValue(new Error('offline'));
    render(<TestConsumer />);
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [makeFile()] } });
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('upload'));
    expect(screen.getByTestId('url')).toHaveTextContent('none');
    expect(screen.getByTestId('uploading')).toHaveTextContent('false');
  });

  it('sets an error and resolves null when getDownloadURL fails', async () => {
    uploadBytesMock.mockResolvedValue(undefined);
    getDownloadURLMock.mockRejectedValue(new Error('offline'));
    render(<TestConsumer />);
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [makeFile()] } });
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('upload'));
    expect(screen.getByTestId('url')).toHaveTextContent('none');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/useKunstwerkFotoUpload.test.tsx`
Expected: FAIL with "Cannot find module '@/lib/useKunstwerkFotoUpload'"

- [ ] **Step 3: Implement the hook**

`src/lib/useKunstwerkFotoUpload.ts`:
```ts
'use client';

import { useCallback, useState } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';

export interface UseKunstwerkFotoUploadResult {
  uploading: boolean;
  error: 'upload' | null;
  upload: (file: File) => Promise<string | null>;
}

export function useKunstwerkFotoUpload(): UseKunstwerkFotoUploadResult {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<'upload' | null>(null);

  const upload = useCallback(async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const fileRef = ref(storage, `kunstwerken/${uniqueId}-${file.name}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      return url;
    } catch {
      setError('upload');
      return null;
    } finally {
      setUploading(false);
    }
  }, []);

  return { uploading, error, upload };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/useKunstwerkFotoUpload.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/useKunstwerkFotoUpload.ts tests/lib/useKunstwerkFotoUpload.test.tsx
git commit -m "feat: add useKunstwerkFotoUpload hook for Firebase Storage uploads"
```

---

### Task 4: Translations + `BeheerNav` — Segmenten (new) and Kunstwerken (activated)

**Files:**
- Modify: `messages/nl.json` (insert new keys inside `"beheer": { ... }`, after `"matenVerwijderen"`)
- Modify: `src/components/beheer/BeheerNav.tsx`
- Modify: `tests/components/beheer/BeheerNav.test.tsx`

**Interfaces:**
- Produces: `BeheerSection = 'klanten' | 'facturen' | 'materiaalsoorten' | 'materialen' | 'maten' | 'segmenten' | 'kunstwerken'` and `BeheerNavProps` gaining `segmentenCount: number`, `kunstwerkenCount: number` — consumed by Task 8 (`BeheerShell`).

- [ ] **Step 1: Add the new translation keys**

In `messages/nl.json`, inside `"beheer": { ... }`, replace the last line of the block (`"matenVerwijderen": "Verwijderen"`) with itself plus the new keys, so the block ends like this (note: `"navKunstwerken"` already exists earlier in the block as a disabled-placeholder label — do not duplicate it):
```json
    "matenVerwijderen": "Verwijderen",
    "navSegmenten": "Segmenten",
    "segmentenLoadError": "Kon de segmenten niet laden. Probeer de pagina te verversen.",
    "segmentenActionError": "Er is iets misgegaan. Probeer het opnieuw.",
    "segmentenEmpty": "Geen segmenten gevonden.",
    "segmentenColOmschrijving": "Omschrijving",
    "segmentenLabelOmschrijving": "Omschrijving",
    "segmentenToevoegen": "Segment toevoegen",
    "segmentenOpslaan": "Opslaan",
    "segmentenVerwijderen": "Verwijderen",
    "kunstwerkenLoadError": "Kon de kunstwerken niet laden. Probeer de pagina te verversen.",
    "kunstwerkenActionError": "Er is iets misgegaan. Probeer het opnieuw.",
    "kunstwerkenEmpty": "Geen kunstwerken gevonden.",
    "kunstwerkenColFoto": "Foto",
    "kunstwerkenColSegmenten": "Segmenten",
    "kunstwerkenColOmschrijving": "Omschrijving (NL)",
    "kunstwerkenLabelFoto": "Foto",
    "kunstwerkenFotoUploading": "Bezig met uploaden…",
    "kunstwerkenFotoUploadError": "De foto kon niet geüpload worden. Probeer het opnieuw.",
    "kunstwerkenLabelSegmenten": "Segmenten",
    "kunstwerkenLabelMaterialen": "Materialen",
    "kunstwerkenLabelMaten": "Maten",
    "kunstwerkenLabelPrijzen": "Prijzen per materiaal en maat",
    "kunstwerkenLabelOmschrijvingNl": "Omschrijving (NL)",
    "kunstwerkenLabelOmschrijvingFr": "Omschrijving (FR)",
    "kunstwerkenLabelOmschrijvingDe": "Omschrijving (DE)",
    "kunstwerkenLabelOmschrijvingEn": "Omschrijving (EN)",
    "kunstwerkenToevoegen": "Kunstwerk toevoegen",
    "kunstwerkenOpslaan": "Opslaan",
    "kunstwerkenVerwijderen": "Verwijderen"
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
        segmentenCount={6}
        kunstwerkenCount={36}
      />
    </NextIntlClientProvider>
  );
  return { onSelect, onLogout };
}

describe('BeheerNav', () => {
  it('renders the 7 active items with their counters, and the 4 disabled placeholder items', () => {
    renderNav();
    expect(screen.getByTestId('beheer-nav-klanten')).toHaveTextContent('Klanten');
    expect(screen.getByTestId('beheer-nav-klanten')).toHaveTextContent('3');
    expect(screen.getByTestId('beheer-nav-facturen')).toHaveTextContent('Facturen');
    expect(screen.getByTestId('beheer-nav-facturen')).toHaveTextContent('7');
    expect(screen.getByTestId('beheer-nav-materiaalsoorten')).toHaveTextContent('Materiaalsoorten');
    expect(screen.getByTestId('beheer-nav-materialen')).toHaveTextContent('Materialen');
    expect(screen.getByTestId('beheer-nav-maten')).toHaveTextContent('Maten');
    expect(screen.getByTestId('beheer-nav-segmenten')).toHaveTextContent('Segmenten');
    expect(screen.getByTestId('beheer-nav-segmenten')).toHaveTextContent('6');
    expect(screen.getByTestId('beheer-nav-kunstwerken')).toHaveTextContent('Kunstwerken');
    expect(screen.getByTestId('beheer-nav-kunstwerken')).toHaveTextContent('36');

    ['bestellingen', 'retouren', 'prijsgroepen', 'glassartDesign'].forEach((id) => {
      expect(screen.getByTestId(`beheer-nav-${id}`)).toBeDisabled();
    });
  });

  it('marks the active section with aria-current', () => {
    renderNav('kunstwerken');
    expect(screen.getByTestId('beheer-nav-kunstwerken')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('beheer-nav-klanten')).not.toHaveAttribute('aria-current');
  });

  it('calls onSelect with the clicked section id', () => {
    const { onSelect } = renderNav();
    fireEvent.click(screen.getByTestId('beheer-nav-segmenten'));
    expect(onSelect).toHaveBeenCalledWith('segmenten');
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
Expected: FAIL — `segmentenCount`/`kunstwerkenCount` props unknown, `beheer-nav-segmenten` not found, `beheer-nav-kunstwerken` is disabled instead of active.

- [ ] **Step 4: Update `BeheerNav.tsx`**

Replace the whole file with:
```tsx
'use client';

import { useTranslations } from 'next-intl';

export type BeheerSection =
  | 'klanten'
  | 'facturen'
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
  materiaalsoortenCount: number;
  materialenCount: number;
  matenCount: number;
  segmentenCount: number;
  kunstwerkenCount: number;
}

const ACTIVE_ITEMS: { id: BeheerSection; labelKey: string }[] = [
  { id: 'klanten', labelKey: 'navKlanten' },
  { id: 'facturen', labelKey: 'navFacturen' },
  { id: 'materiaalsoorten', labelKey: 'navMateriaalsoorten' },
  { id: 'materialen', labelKey: 'navMaterialen' },
  { id: 'maten', labelKey: 'navMaten' },
  { id: 'segmenten', labelKey: 'navSegmenten' },
  { id: 'kunstwerken', labelKey: 'navKunstwerken' },
];

const DISABLED_ITEMS: { id: string; labelKey: string }[] = [
  { id: 'bestellingen', labelKey: 'navBestellingen' },
  { id: 'retouren', labelKey: 'navRetouren' },
  { id: 'prijsgroepen', labelKey: 'navPrijsgroepen' },
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
  segmentenCount,
  kunstwerkenCount,
}: BeheerNavProps) {
  const t = useTranslations('beheer');
  const counts: Record<BeheerSection, number> = {
    klanten: klantenCount,
    facturen: facturenCount,
    materiaalsoorten: materiaalsoortenCount,
    materialen: materialenCount,
    maten: matenCount,
    segmenten: segmentenCount,
    kunstwerken: kunstwerkenCount,
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
git commit -m "feat: activate Kunstwerken nav item and add Segmenten"
```

---

### Task 5: `SegmentenSection`

**Files:**
- Create: `src/components/beheer/SegmentenSection.tsx`
- Test: `tests/components/beheer/SegmentenSection.test.tsx`

**Interfaces:**
- Consumes: `Segment` from `@/components/beheer/materiaalTypes` (Task 1).
- Produces: `SegmentenSectionProps = { segmenten: Segment[] | null; loadError: string | null; onAdd: (data: Omit<Segment, 'id'>) => Promise<boolean>; onUpdate: (id: string, data: Omit<Segment, 'id'>) => Promise<boolean>; onRemove: (id: string) => Promise<boolean> }` — consumed by Task 8 (`BeheerShell`).

This mirrors `MateriaalsoortenSection` exactly, minus the delete-block check (no other data references a segment in this plan).

- [ ] **Step 1: Write the failing tests**

`tests/components/beheer/SegmentenSection.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SegmentenSection } from '@/components/beheer/SegmentenSection';
import type { Segment } from '@/components/beheer/materiaalTypes';
import messages from '../../../messages/nl.json';

const SEGMENTEN: Segment[] = [
  { id: 'seg-1', omschrijving: 'Hotel' },
  { id: 'seg-2', omschrijving: 'Restaurant' },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof SegmentenSection>> = {}) {
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <SegmentenSection
        segmenten={SEGMENTEN}
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

describe('SegmentenSection', () => {
  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('segmenten-error')).toHaveTextContent('Kon niet laden.');
    expect(screen.queryByTestId('data-table')).not.toBeInTheDocument();
  });

  it('renders nothing while segmenten is null and there is no error', () => {
    renderSection({ segmenten: null });
    expect(screen.queryByTestId('segmenten-section')).not.toBeInTheDocument();
  });

  it('lists the segmenten in the table', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-seg-1')).toHaveTextContent('Hotel');
    expect(screen.getByTestId('data-table-row-seg-2')).toHaveTextContent('Restaurant');
  });

  it('adds a new segment and closes the modal', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('segmenten-add'));
    fireEvent.change(screen.getByTestId('segment-modal-omschrijving'), { target: { value: 'Wellness' } });
    fireEvent.click(screen.getByTestId('segment-modal-opslaan'));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ omschrijving: 'Wellness' }));
    await waitFor(() => expect(screen.queryByTestId('segment-modal')).not.toBeInTheDocument());
  });

  it('disables Opslaan until omschrijving is filled in', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('segmenten-add'));
    expect(screen.getByTestId('segment-modal-opslaan')).toBeDisabled();
    fireEvent.change(screen.getByTestId('segment-modal-omschrijving'), { target: { value: 'X' } });
    expect(screen.getByTestId('segment-modal-opslaan')).not.toBeDisabled();
  });

  it('opens a row for editing pre-filled, and updates it', async () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-seg-2'));
    expect(screen.getByTestId('segment-modal-omschrijving')).toHaveValue('Restaurant');
    fireEvent.change(screen.getByTestId('segment-modal-omschrijving'), { target: { value: 'Restaurants' } });
    fireEvent.click(screen.getByTestId('segment-modal-opslaan'));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('seg-2', { omschrijving: 'Restaurants' }));
  });

  it('deletes a segment', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-seg-1'));
    fireEvent.click(screen.getByTestId('segment-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('seg-1'));
    await waitFor(() => expect(screen.queryByTestId('segment-modal')).not.toBeInTheDocument());
  });

  it('shows an action error and keeps the modal open when onAdd fails', async () => {
    renderSection({ onAdd: vi.fn().mockResolvedValue(false) });
    fireEvent.click(screen.getByTestId('segmenten-add'));
    fireEvent.change(screen.getByTestId('segment-modal-omschrijving'), { target: { value: 'Wellness' } });
    fireEvent.click(screen.getByTestId('segment-modal-opslaan'));
    expect(await screen.findByTestId('segment-modal-error')).toHaveTextContent(
      'Er is iets misgegaan. Probeer het opnieuw.'
    );
    expect(screen.getByTestId('segment-modal')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/SegmentenSection.test.tsx`
Expected: FAIL with "Cannot find module '@/components/beheer/SegmentenSection'"

- [ ] **Step 3: Implement the component**

`src/components/beheer/SegmentenSection.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import type { Segment } from './materiaalTypes';

interface SegmentenSectionProps {
  segmenten: Segment[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Segment, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Segment, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

type ModalState = { mode: 'add' } | { mode: 'edit'; segment: Segment } | null;

export function SegmentenSection({ segmenten, loadError, onAdd, onUpdate, onRemove }: SegmentenSectionProps) {
  const t = useTranslations('beheer');
  const [modalState, setModalState] = useState<ModalState>(null);
  const [omschrijving, setOmschrijving] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  if (loadError) {
    return (
      <p data-testid="segmenten-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (segmenten === null) {
    return null;
  }

  function openAdd() {
    setOmschrijving('');
    setActionError(null);
    setModalState({ mode: 'add' });
  }

  function openEdit(segment: Segment) {
    setOmschrijving(segment.omschrijving);
    setActionError(null);
    setModalState({ mode: 'edit', segment });
  }

  function closeModal() {
    setModalState(null);
  }

  async function handleSave() {
    if (!modalState) return;
    const success =
      modalState.mode === 'add'
        ? await onAdd({ omschrijving })
        : await onUpdate(modalState.segment.id, { omschrijving });
    if (success) {
      closeModal();
    } else {
      setActionError(t('segmentenActionError'));
    }
  }

  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const success = await onRemove(modalState.segment.id);
    if (success) {
      closeModal();
    } else {
      setActionError(t('segmentenActionError'));
    }
  }

  const columns: Column<Segment>[] = [
    { key: 'omschrijving', label: t('segmentenColOmschrijving'), filterType: 'text' },
  ];

  return (
    <div data-testid="segmenten-section">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={openAdd}
          data-testid="segmenten-add"
          className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
        >
          {t('segmentenToevoegen')}
        </button>
      </div>
      <DataTable<Segment>
        columns={columns}
        rows={segmenten}
        getRowId={(row) => row.id}
        onRowClick={openEdit}
        emptyLabel={t('segmentenEmpty')}
      />
      <Modal isOpen={modalState !== null} onClose={closeModal} closeLabel={t('modalClose')}>
        <div data-testid="segment-modal" className="flex flex-col gap-2 text-sm text-white/80">
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('segmentenLabelOmschrijving')}
            <input
              type="text"
              value={omschrijving}
              onChange={(event) => setOmschrijving(event.target.value)}
              data-testid="segment-modal-omschrijving"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>

          {actionError && (
            <p data-testid="segment-modal-error" className="text-xs text-red-400">
              {actionError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!omschrijving}
              data-testid="segment-modal-opslaan"
              className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('segmentenOpslaan')}
            </button>
            {modalState?.mode === 'edit' && (
              <button
                type="button"
                onClick={handleRemove}
                data-testid="segment-modal-verwijderen"
                className="rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('segmentenVerwijderen')}
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

Run: `npx vitest run tests/components/beheer/SegmentenSection.test.tsx`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/SegmentenSection.tsx tests/components/beheer/SegmentenSection.test.tsx
git commit -m "feat: add SegmentenSection (CRUD table)"
```

---

### Task 6: `KunstwerkenSection`

**Files:**
- Create: `src/components/beheer/KunstwerkenSection.tsx`
- Test: `tests/components/beheer/KunstwerkenSection.test.tsx`

**Interfaces:**
- Consumes: `Kunstwerk`, `Segment`, `Materiaal`, `Maat`, `PrijsRegel` from `@/components/beheer/materiaalTypes` (Task 1); `useKunstwerkFotoUpload` from `@/lib/useKunstwerkFotoUpload` (Task 3).
- Produces: `KunstwerkenSectionProps = { kunstwerken: Kunstwerk[] | null; segmenten: Segment[] | null; materialen: Materiaal[] | null; maten: Maat[] | null; loadError: string | null; onAdd: (data: Omit<Kunstwerk, 'id'>) => Promise<boolean>; onUpdate: (id: string, data: Omit<Kunstwerk, 'id'>) => Promise<boolean>; onRemove: (id: string) => Promise<boolean> }` — consumed by Task 7 (`BeheerShell`).

**Design notes for the implementer:**
- Checkbox labels: segmenten use `segment.omschrijving` directly; materialen use `` `${materiaal.materiaaldikte}mm — ${materiaal.omschrijving}` ``; maten use `` `${maat.breedte}×${maat.hoogte} cm` ``. No extra lookups beyond the props already passed in — do not add a `materiaalsoorten` prop to resolve a materiaal's soort name here, that's out of scope.
- The price grid keys prices by a `` `${materiaalId}:${maatId}` `` string in local component state (a `Record<string, string>`), NOT by a fixed-size array — this way toggling a materiaal/maat checkbox naturally adds/removes grid cells without any extra synchronization code, and previously-entered prices for combinations that get deselected and reselected are preserved (the object entry is never deleted, just not read while unselected).
- `foto` starts as `''` and is only set once the upload resolves to a URL; Opslaan must stay disabled while `foto` is empty or while `uploading` is `true`.

- [ ] **Step 1: Write the failing tests**

`tests/components/beheer/KunstwerkenSection.test.tsx`:
```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { KunstwerkenSection } from '@/components/beheer/KunstwerkenSection';
import type { Kunstwerk, Segment, Materiaal, Maat } from '@/components/beheer/materiaalTypes';
import messages from '../../../messages/nl.json';

const uploadMock = vi.fn();
let mockUploading = false;
let mockUploadError: 'upload' | null = null;

vi.mock('@/lib/useKunstwerkFotoUpload', () => ({
  useKunstwerkFotoUpload: () => ({ uploading: mockUploading, error: mockUploadError, upload: uploadMock }),
}));

const SEGMENTEN: Segment[] = [
  { id: 'seg-1', omschrijving: 'Hotel' },
  { id: 'seg-2', omschrijving: 'Restaurant' },
];
const MATERIALEN: Materiaal[] = [
  { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'Veiligheidsglas' },
  { id: 'mat-2', materiaalsoortId: 'soort-2', materiaaldikte: 3, omschrijving: 'Acryl' },
];
const MATEN: Maat[] = [
  { id: 'maat-1', breedte: 40, hoogte: 60 },
  { id: 'maat-2', breedte: 60, hoogte: 90 },
];
const KUNSTWERKEN: Kunstwerk[] = [
  {
    id: 'kw-1',
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
];

function renderSection(overrides: Partial<React.ComponentProps<typeof KunstwerkenSection>> = {}) {
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <KunstwerkenSection
        kunstwerken={KUNSTWERKEN}
        segmenten={SEGMENTEN}
        materialen={MATERIALEN}
        maten={MATEN}
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
});

describe('KunstwerkenSection', () => {
  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('kunstwerken-error')).toHaveTextContent('Kon niet laden.');
  });

  it('renders nothing while kunstwerken is null and there is no error', () => {
    renderSection({ kunstwerken: null });
    expect(screen.queryByTestId('kunstwerken-section')).not.toBeInTheDocument();
  });

  it('lists kunstwerken with their segment names and NL description', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-kw-1')).toHaveTextContent('Hotel');
    expect(screen.getByTestId('data-table-row-kw-1')).toHaveTextContent('Hotel paneel 1');
  });

  it('keeps Opslaan disabled until a photo is uploaded, then enables once all required fields are filled', async () => {
    uploadMock.mockResolvedValue('https://storage.example.com/nieuw.jpg');
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    expect(screen.getByTestId('kunstwerk-modal-opslaan')).toBeDisabled();

    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-foto-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-foto-preview')).toBeInTheDocument());
    expect(screen.getByTestId('kunstwerk-modal-opslaan')).toBeDisabled();

    fireEvent.click(screen.getByTestId('kunstwerk-modal-segment-seg-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-maat-maat-1'));
    expect(screen.getByTestId('kunstwerk-modal-opslaan')).toBeDisabled(); // prijs and omschrijving still missing

    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '99' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Test' } });
    expect(screen.getByTestId('kunstwerk-modal-opslaan')).not.toBeDisabled();
  });

  it('rebuilds the price grid when the materiaal/maat selection changes', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-maat-maat-1'));
    expect(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-2'));
    expect(screen.getByTestId('kunstwerk-modal-prijs-mat-2-maat-1')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-1'));
    expect(screen.queryByTestId('kunstwerk-modal-prijs-mat-1-maat-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('kunstwerk-modal-prijs-mat-2-maat-1')).toBeInTheDocument();
  });

  it('adds a new kunstwerk with the uploaded photo, selections, prices and NL description', async () => {
    uploadMock.mockResolvedValue('https://storage.example.com/nieuw.jpg');
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-foto-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-foto-preview')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('kunstwerk-modal-segment-seg-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-maat-maat-1'));
    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '99' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Nieuw kunstwerk' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({
        foto: 'https://storage.example.com/nieuw.jpg',
        segmentIds: ['seg-1'],
        materiaalIds: ['mat-1'],
        maatIds: ['maat-1'],
        prijzen: [{ materiaalId: 'mat-1', maatId: 'maat-1', prijs: 99 }],
        omschrijvingNl: 'Nieuw kunstwerk',
        omschrijvingFr: '',
        omschrijvingDe: '',
        omschrijvingEn: '',
      })
    );
  });

  it('opens a row for editing pre-filled, including the price grid, and updates it', async () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-kw-1'));
    expect(screen.getByTestId('kunstwerk-modal-segment-seg-1')).toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-materiaal-mat-1')).toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-1')).toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1')).toHaveValue(150);
    expect(screen.getByTestId('kunstwerk-modal-omschrijving-nl')).toHaveValue('Hotel paneel 1');

    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '175' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('kw-1', {
        foto: 'https://storage.example.com/kw-1.jpg',
        segmentIds: ['seg-1'],
        materiaalIds: ['mat-1'],
        maatIds: ['maat-1'],
        prijzen: [{ materiaalId: 'mat-1', maatId: 'maat-1', prijs: 175 }],
        omschrijvingNl: 'Hotel paneel 1',
        omschrijvingFr: '',
        omschrijvingDe: '',
        omschrijvingEn: '',
      })
    );
  });

  it('deletes a kunstwerk', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-kw-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('kw-1'));
  });

  it('shows an action error and keeps the modal open when onUpdate fails', async () => {
    const { onUpdate } = renderSection({ onUpdate: vi.fn().mockResolvedValue(false) });
    fireEvent.click(screen.getByTestId('data-table-row-kw-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));
    expect(await screen.findByTestId('kunstwerk-modal-error')).toHaveTextContent(
      'Er is iets misgegaan. Probeer het opnieuw.'
    );
    expect(screen.getByTestId('kunstwerk-modal')).toBeInTheDocument();
    expect(onUpdate).toHaveBeenCalled();
  });

  it('shows an upload error message when the upload hook reports an error', () => {
    mockUploadError = 'upload';
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    expect(screen.getByTestId('kunstwerk-modal-foto-error')).toHaveTextContent(
      'De foto kon niet geüpload worden. Probeer het opnieuw.'
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: FAIL with "Cannot find module '@/components/beheer/KunstwerkenSection'"

- [ ] **Step 3: Implement the component**

`src/components/beheer/KunstwerkenSection.tsx`:
```tsx
'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useKunstwerkFotoUpload } from '@/lib/useKunstwerkFotoUpload';
import type { Kunstwerk, Segment, Materiaal, Maat, PrijsRegel } from './materiaalTypes';

interface KunstwerkenSectionProps {
  kunstwerken: Kunstwerk[] | null;
  segmenten: Segment[] | null;
  materialen: Materiaal[] | null;
  maten: Maat[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Kunstwerk, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Kunstwerk, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

type ModalState = { mode: 'add' } | { mode: 'edit'; kunstwerk: Kunstwerk } | null;
type PrijzenState = Record<string, string>;
type KunstwerkRow = Kunstwerk & { segmentNamen: string };

function prijsKey(materiaalId: string, maatId: string) {
  return `${materiaalId}:${maatId}`;
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

const LEGE_FORM = {
  foto: '',
  segmentIds: [] as string[],
  materiaalIds: [] as string[],
  maatIds: [] as string[],
  prijzen: {} as PrijzenState,
  omschrijvingNl: '',
  omschrijvingFr: '',
  omschrijvingDe: '',
  omschrijvingEn: '',
};

export function KunstwerkenSection({
  kunstwerken,
  segmenten,
  materialen,
  maten,
  loadError,
  onAdd,
  onUpdate,
  onRemove,
}: KunstwerkenSectionProps) {
  const t = useTranslations('beheer');
  const { uploading, error: fotoUploadError, upload } = useKunstwerkFotoUpload();
  const [modalState, setModalState] = useState<ModalState>(null);
  const [foto, setFoto] = useState(LEGE_FORM.foto);
  const [segmentIds, setSegmentIds] = useState<string[]>(LEGE_FORM.segmentIds);
  const [materiaalIds, setMateriaalIds] = useState<string[]>(LEGE_FORM.materiaalIds);
  const [maatIds, setMaatIds] = useState<string[]>(LEGE_FORM.maatIds);
  const [prijzen, setPrijzen] = useState<PrijzenState>(LEGE_FORM.prijzen);
  const [omschrijvingNl, setOmschrijvingNl] = useState(LEGE_FORM.omschrijvingNl);
  const [omschrijvingFr, setOmschrijvingFr] = useState(LEGE_FORM.omschrijvingFr);
  const [omschrijvingDe, setOmschrijvingDe] = useState(LEGE_FORM.omschrijvingDe);
  const [omschrijvingEn, setOmschrijvingEn] = useState(LEGE_FORM.omschrijvingEn);
  const [actionError, setActionError] = useState<string | null>(null);

  const segmentNaamById = useMemo(() => {
    const map = new Map<string, string>();
    (segmenten ?? []).forEach((segment) => map.set(segment.id, segment.omschrijving));
    return map;
  }, [segmenten]);

  if (loadError) {
    return (
      <p data-testid="kunstwerken-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (kunstwerken === null) {
    return null;
  }

  const rows: KunstwerkRow[] = kunstwerken.map((kunstwerk) => ({
    ...kunstwerk,
    segmentNamen: kunstwerk.segmentIds.map((id) => segmentNaamById.get(id) ?? id).join(', '),
  }));

  function resetForm() {
    setFoto(LEGE_FORM.foto);
    setSegmentIds(LEGE_FORM.segmentIds);
    setMateriaalIds(LEGE_FORM.materiaalIds);
    setMaatIds(LEGE_FORM.maatIds);
    setPrijzen(LEGE_FORM.prijzen);
    setOmschrijvingNl(LEGE_FORM.omschrijvingNl);
    setOmschrijvingFr(LEGE_FORM.omschrijvingFr);
    setOmschrijvingDe(LEGE_FORM.omschrijvingDe);
    setOmschrijvingEn(LEGE_FORM.omschrijvingEn);
    setActionError(null);
  }

  function openAdd() {
    resetForm();
    setModalState({ mode: 'add' });
  }

  function openEdit(kunstwerk: Kunstwerk) {
    setFoto(kunstwerk.foto);
    setSegmentIds(kunstwerk.segmentIds);
    setMateriaalIds(kunstwerk.materiaalIds);
    setMaatIds(kunstwerk.maatIds);
    const prijzenMap: PrijzenState = {};
    kunstwerk.prijzen.forEach((regel) => {
      prijzenMap[prijsKey(regel.materiaalId, regel.maatId)] = String(regel.prijs);
    });
    setPrijzen(prijzenMap);
    setOmschrijvingNl(kunstwerk.omschrijvingNl);
    setOmschrijvingFr(kunstwerk.omschrijvingFr);
    setOmschrijvingDe(kunstwerk.omschrijvingDe);
    setOmschrijvingEn(kunstwerk.omschrijvingEn);
    setActionError(null);
    setModalState({ mode: 'edit', kunstwerk });
  }

  function closeModal() {
    setModalState(null);
  }

  async function handleFotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const url = await upload(file);
    if (url) {
      setFoto(url);
    }
  }

  const prijsCombinaties = materiaalIds.flatMap((materiaalId) =>
    maatIds.map((maatId) => ({ materiaalId, maatId }))
  );
  const allePrijzenIngevuld = prijsCombinaties.every(
    ({ materiaalId, maatId }) => (prijzen[prijsKey(materiaalId, maatId)] ?? '') !== ''
  );
  const opslaanDisabled =
    !foto ||
    uploading ||
    segmentIds.length === 0 ||
    materiaalIds.length === 0 ||
    maatIds.length === 0 ||
    !allePrijzenIngevuld ||
    !omschrijvingNl;

  async function handleSave() {
    if (!modalState) return;
    const prijzenArray: PrijsRegel[] = prijsCombinaties.map(({ materiaalId, maatId }) => ({
      materiaalId,
      maatId,
      prijs: Number(prijzen[prijsKey(materiaalId, maatId)]),
    }));
    const data = {
      foto,
      segmentIds,
      materiaalIds,
      maatIds,
      prijzen: prijzenArray,
      omschrijvingNl,
      omschrijvingFr,
      omschrijvingDe,
      omschrijvingEn,
    };
    const success = modalState.mode === 'add' ? await onAdd(data) : await onUpdate(modalState.kunstwerk.id, data);
    if (success) {
      closeModal();
    } else {
      setActionError(t('kunstwerkenActionError'));
    }
  }

  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const success = await onRemove(modalState.kunstwerk.id);
    if (success) {
      closeModal();
    } else {
      setActionError(t('kunstwerkenActionError'));
    }
  }

  const columns: Column<KunstwerkRow>[] = [
    {
      key: 'foto',
      label: t('kunstwerkenColFoto'),
      filterType: 'text',
      sortable: false,
      render: (row) => <img src={row.foto} alt="" className="h-10 w-10 rounded object-cover" />,
    },
    { key: 'segmentNamen', label: t('kunstwerkenColSegmenten'), filterType: 'text' },
    { key: 'omschrijvingNl', label: t('kunstwerkenColOmschrijving'), filterType: 'text' },
  ];

  return (
    <div data-testid="kunstwerken-section">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={openAdd}
          data-testid="kunstwerken-add"
          className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
        >
          {t('kunstwerkenToevoegen')}
        </button>
      </div>
      <DataTable<KunstwerkRow>
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        onRowClick={openEdit}
        emptyLabel={t('kunstwerkenEmpty')}
      />
      <Modal isOpen={modalState !== null} onClose={closeModal} closeLabel={t('modalClose')}>
        <div data-testid="kunstwerk-modal" className="flex flex-col gap-3 text-sm text-white/80">
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstwerkenLabelFoto')}
            <input
              type="file"
              accept="image/*"
              onChange={handleFotoChange}
              data-testid="kunstwerk-modal-foto-input"
              className="text-sm text-white"
            />
          </label>
          {uploading && (
            <p data-testid="kunstwerk-modal-foto-uploading" className="text-xs text-white/60">
              {t('kunstwerkenFotoUploading')}
            </p>
          )}
          {fotoUploadError && (
            <p data-testid="kunstwerk-modal-foto-error" className="text-xs text-red-400">
              {t('kunstwerkenFotoUploadError')}
            </p>
          )}
          {foto && (
            <img
              src={foto}
              alt=""
              data-testid="kunstwerk-modal-foto-preview"
              className="h-24 w-24 rounded object-cover"
            />
          )}

          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs uppercase tracking-wide text-white/60">
              {t('kunstwerkenLabelSegmenten')}
            </legend>
            {(segmenten ?? []).map((segment) => (
              <label key={segment.id} className="flex items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={segmentIds.includes(segment.id)}
                  onChange={() => setSegmentIds((current) => toggle(current, segment.id))}
                  data-testid={`kunstwerk-modal-segment-${segment.id}`}
                />
                {segment.omschrijving}
              </label>
            ))}
          </fieldset>

          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs uppercase tracking-wide text-white/60">
              {t('kunstwerkenLabelMaterialen')}
            </legend>
            {(materialen ?? []).map((materiaal) => (
              <label key={materiaal.id} className="flex items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={materiaalIds.includes(materiaal.id)}
                  onChange={() => setMateriaalIds((current) => toggle(current, materiaal.id))}
                  data-testid={`kunstwerk-modal-materiaal-${materiaal.id}`}
                />
                {`${materiaal.materiaaldikte}mm — ${materiaal.omschrijving}`}
              </label>
            ))}
          </fieldset>

          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs uppercase tracking-wide text-white/60">{t('kunstwerkenLabelMaten')}</legend>
            {(maten ?? []).map((maat) => (
              <label key={maat.id} className="flex items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={maatIds.includes(maat.id)}
                  onChange={() => setMaatIds((current) => toggle(current, maat.id))}
                  data-testid={`kunstwerk-modal-maat-${maat.id}`}
                />
                {`${maat.breedte}×${maat.hoogte} cm`}
              </label>
            ))}
          </fieldset>

          {materiaalIds.length > 0 && maatIds.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-white/60">{t('kunstwerkenLabelPrijzen')}</span>
              <table data-testid="kunstwerk-modal-prijzen" className="text-sm text-white/80">
                <thead>
                  <tr>
                    <th></th>
                    {maatIds.map((maatId) => {
                      const maat = (maten ?? []).find((m) => m.id === maatId);
                      return (
                        <th key={maatId} className="px-2 py-1 text-xs">
                          {maat ? `${maat.breedte}×${maat.hoogte}` : maatId}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {materiaalIds.map((materiaalId) => {
                    const materiaal = (materialen ?? []).find((m) => m.id === materiaalId);
                    return (
                      <tr key={materiaalId}>
                        <td className="px-2 py-1 text-xs">
                          {materiaal ? `${materiaal.materiaaldikte}mm` : materiaalId}
                        </td>
                        {maatIds.map((maatId) => {
                          const key = prijsKey(materiaalId, maatId);
                          return (
                            <td key={maatId} className="px-2 py-1">
                              <input
                                type="number"
                                value={prijzen[key] ?? ''}
                                onChange={(event) =>
                                  setPrijzen((current) => ({ ...current, [key]: event.target.value }))
                                }
                                data-testid={`kunstwerk-modal-prijs-${materiaalId}-${maatId}`}
                                className="w-20 rounded-sm bg-black/40 px-2 py-1 text-sm text-white"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstwerkenLabelOmschrijvingNl')}
            <textarea
              value={omschrijvingNl}
              onChange={(event) => setOmschrijvingNl(event.target.value)}
              data-testid="kunstwerk-modal-omschrijving-nl"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstwerkenLabelOmschrijvingFr')}
            <textarea
              value={omschrijvingFr}
              onChange={(event) => setOmschrijvingFr(event.target.value)}
              data-testid="kunstwerk-modal-omschrijving-fr"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstwerkenLabelOmschrijvingDe')}
            <textarea
              value={omschrijvingDe}
              onChange={(event) => setOmschrijvingDe(event.target.value)}
              data-testid="kunstwerk-modal-omschrijving-de"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstwerkenLabelOmschrijvingEn')}
            <textarea
              value={omschrijvingEn}
              onChange={(event) => setOmschrijvingEn(event.target.value)}
              data-testid="kunstwerk-modal-omschrijving-en"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>

          {actionError && (
            <p data-testid="kunstwerk-modal-error" className="text-xs text-red-400">
              {actionError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={opslaanDisabled}
              data-testid="kunstwerk-modal-opslaan"
              className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('kunstwerkenOpslaan')}
            </button>
            {modalState?.mode === 'edit' && (
              <button
                type="button"
                onClick={handleRemove}
                data-testid="kunstwerk-modal-verwijderen"
                className="rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('kunstwerkenVerwijderen')}
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

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/KunstwerkenSection.tsx tests/components/beheer/KunstwerkenSection.test.tsx
git commit -m "feat: add KunstwerkenSection (upload, multi-select, price grid)"
```

---

### Task 7: Wire it all into `BeheerShell`

**Files:**
- Modify: `src/components/beheer/BeheerShell.tsx`
- Modify: `tests/components/beheer/BeheerShell.test.tsx`

**Interfaces:**
- Consumes: `useFirestoreCollection` (existing), `SEGMENTEN_SEED`/`MATEN_SEED`/`buildKunstwerkenSeed` (Task 1), `SegmentenSection` (Task 5), `KunstwerkenSection` (Task 6), updated `BeheerNav` (Task 4).
- Produces: nothing new — final integration point.

**Design note:** `kunstwerken`'s seed now depends on THREE other collections being ready (not just one, unlike the existing `materialen`-depends-on-`materiaalsoorten` case) — `segmenten.items`, `materialen.items`, AND `maten.items` must all be non-null before `buildKunstwerkenSeed` can run with real ids. `maten` also gets a seed for the first time in this task (`MATEN_SEED`) — it was deliberately left unseeded in the previous plan; this plan seeds it because `buildKunstwerkenSeed`'s example prices need real maat ids to reference.

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
  storage: {},
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
// wiring tests — seeding itself is covered by the collection-specific
// data tests and useFirestoreCollection.test.tsx.
const DEFAULT_COLLECTIONS: Record<string, Array<{ id: string; data: Record<string, unknown> }>> = {
  klanten: [],
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

function mockCollections(overrides: Partial<typeof DEFAULT_COLLECTIONS> = {}) {
  const data = { ...DEFAULT_COLLECTIONS, ...overrides };
  getDocsMock.mockImplementation((collectionRef: { name: string }) =>
    Promise.resolve(makeSnapshot(data[collectionRef.name] ?? []))
  );
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

  it('calls onLogout when the nav logout button is clicked', async () => {
    mockCollections();
    const { onLogout } = renderShell();
    await waitFor(() => expect(getDocsMock).toHaveBeenCalled());
    screen.getByTestId('beheer-nav-logout').click();
    expect(onLogout).toHaveBeenCalled();
  });

  it('shows the segmenten count and switches to the Segmenten section', async () => {
    mockCollections({
      segmenten: [
        { id: 'seg-1', data: { omschrijving: 'Hotel' } },
        { id: 'seg-2', data: { omschrijving: 'Restaurant' } },
      ],
    });
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-segmenten')).toHaveTextContent('2'));
    screen.getByTestId('beheer-nav-segmenten').click();
    expect(await screen.findByTestId('segmenten-section')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-seg-1')).toHaveTextContent('Hotel');
  });

  it('shows the kunstwerken count and switches to the Kunstwerken section with segment names resolved', async () => {
    mockCollections();
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-kunstwerken')).toHaveTextContent('1'));
    screen.getByTestId('beheer-nav-kunstwerken').click();
    expect(await screen.findByTestId('kunstwerken-section')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-kw-1')).toHaveTextContent('Hotel');
  });

  it('shows a load error on the Kunstwerken section when getDocs fails for kunstwerken', async () => {
    getDocsMock.mockImplementation((collectionRef: { name: string }) => {
      if (collectionRef.name === 'kunstwerken') {
        return Promise.reject(new Error('offline'));
      }
      return Promise.resolve(makeSnapshot(DEFAULT_COLLECTIONS[collectionRef.name] ?? []));
    });
    renderShell();
    screen.getByTestId('beheer-nav-kunstwerken').click();
    expect(await screen.findByTestId('kunstwerken-error')).toHaveTextContent(
      'Kon de kunstwerken niet laden. Probeer de pagina te verversen.'
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/BeheerShell.test.tsx`
Expected: FAIL — `BeheerNav` requires the 2 new count props, no nav items for segmenten/kunstwerken switch to any section yet.

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
import { SegmentenSection } from './SegmentenSection';
import { KunstwerkenSection } from './KunstwerkenSection';
import type { Materiaalsoort, Materiaal, Maat, Segment, Kunstwerk } from './materiaalTypes';
import { MOCK_ADMIN_INVOICES } from '@/data/mockAdminInvoices';
import { useFirestoreCollection } from '@/lib/useFirestoreCollection';
import { MATERIAALSOORTEN_SEED, buildMaterialenSeed } from '@/data/materiaalsoortenSeed';
import { SEGMENTEN_SEED, MATEN_SEED, buildKunstwerkenSeed } from '@/data/kunstwerkenSeed';

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
  const maten = useFirestoreCollection<Maat>('maten', { seed: MATEN_SEED });
  const segmenten = useFirestoreCollection<Segment>('segmenten', { seed: SEGMENTEN_SEED });

  const kunstwerkenReady = segmenten.items !== null && materialen.items !== null && maten.items !== null;
  const kunstwerkenSeed = kunstwerkenReady
    ? buildKunstwerkenSeed(segmenten.items!, materialen.items!, maten.items!)
    : undefined;
  const kunstwerken = useFirestoreCollection<Kunstwerk>('kunstwerken', {
    seed: kunstwerkenSeed,
    skip: !kunstwerkenReady,
  });

  const klantenCount = (klanten ?? []).filter((klant) => klant.status === 'Beoordelen').length;
  const facturenCount = MOCK_ADMIN_INVOICES.filter((invoice) => invoice.status === 'Te betalen').length;
  const materiaalsoortenCount = (materiaalsoorten.items ?? []).length;
  const materialenCount = (materialen.items ?? []).length;
  const matenCount = (maten.items ?? []).length;
  const segmentenCount = (segmenten.items ?? []).length;
  const kunstwerkenCount = (kunstwerken.items ?? []).length;

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
          segmentenCount={segmentenCount}
          kunstwerkenCount={kunstwerkenCount}
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
        ) : activeSection === 'maten' ? (
          <MatenSection
            maten={maten.items}
            loadError={maten.error === 'load' ? t('matenLoadError') : null}
            onAdd={maten.add}
            onUpdate={maten.update}
            onRemove={maten.remove}
          />
        ) : activeSection === 'segmenten' ? (
          <SegmentenSection
            segmenten={segmenten.items}
            loadError={segmenten.error === 'load' ? t('segmentenLoadError') : null}
            onAdd={segmenten.add}
            onUpdate={segmenten.update}
            onRemove={segmenten.remove}
          />
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
      </GlassPanel>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/BeheerShell.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — every test from this plan (Tasks 1–7) plus every pre-existing test, no regressions.

Run: `npx tsc --noEmit`
Expected: no output (clean)

- [ ] **Step 6: Commit**

```bash
git add src/components/beheer/BeheerShell.tsx tests/components/beheer/BeheerShell.test.tsx
git commit -m "feat: wire Segmenten/Kunstwerken into BeheerShell"
```

---

## Manual verification (after Task 7)

Automated tests mock Firestore and Storage, so they cannot catch real Firestore-rule/Storage-rule/config issues. After all tasks are done, manually verify in the browser:

1. Run `npm run dev`, log into `/beheer` as an admin.
2. Open **Segmenten** — should auto-seed with Hotel, Restaurant, Wellness, Office, Abstract, Artist Collections.
3. Open **Kunstwerken** — should auto-seed with 36 example artworks (check the Firebase console: `kunstwerken` collection should have 36 docs, each referencing real `segmentIds`/`materiaalIds`/`maatIds`).
4. Add a new kunstwerk: upload a real photo, confirm it appears in Firebase Storage under `kunstwerken/`, and the download URL is stored on the new Firestore document.
5. Confirm the price grid rebuilds correctly when toggling materiaal/maat checkboxes, and that Opslaan stays disabled until a photo, at least one segment/materiaal/maat, every price cell, and the NL description are filled in.
6. Edit an existing (seeded) kunstwerk, confirm the price grid and all checkboxes pre-fill correctly from its stored data.
7. Try uploading as a non-admin (or logged out) — confirm Storage rejects the write (per `storage.rules`).
8. Refresh the page and confirm no duplicate seed rows appear anywhere (segmenten, maten, kunstwerken).
