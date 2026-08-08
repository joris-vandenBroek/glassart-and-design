# Kunstwerken — Publieke Koppeling (Deel 2) Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 21-07-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded Unsplash/segment placeholder system on the public site with the real `kunstwerken`/`materialen`/`maten`/`segmenten` Firestore data (collectiepagina, homepage, winkelmandje, checkout), add a watermark overlay for customer-facing photo display, thread price through the cart into `bestellijnen`, loosen the currently null-only `firestore.rules` bestellines rule, and enrich the admin order-detail screen to show resolved kunstwerk info instead of a raw id.

**Architecture:** Two small new shared units (`WatermarkedImage` component, `resolveKunstwerkOmschrijving` locale-resolver) get built first and reused everywhere a kunstwerk is displayed. `useCart`'s `CartItem` shape changes from segment/image/size strings to real `kunstwerkId`/`materiaalId`/`maatId` + a denormalized display snapshot (foto, labels, price) — everything downstream (`ProductModal`, `CartPanel`) is rebuilt against that new shape. The public pages fetch `segmenten`/`kunstwerken`/`materialen`/`maten` client-side via the existing `useFirestoreCollection` hook (same hook Deel 1 already uses in beheer). The admin side reuses data `BeheerShell` already fetches for the Kunstwerken CRUD tab, threading it into `BestellingenSection`/`BestellingModal`.

**Tech Stack:** Next.js (client components), Firebase Firestore SDK, `next-intl`, Vitest + Testing Library.

## Global Constraints

- Geen backend van welke aard dan ook — alles blijft client-side Firestore, geen API-routes, geen Cloud Functions.
- Prijs is een **snapshot**: bepaald op het moment van toevoegen aan het mandje, nooit herberekend bij checkout of in het admin-overzicht.
- Watermerk-tekst: `© Glassart & Design`, diagonaal herhaald, semi-transparant, `pointer-events: none` — zichtbaar op elke klant-gerichte weergave (collectiegrid, bestelvenster, uitgelichte werken, winkelmandje, admin bestel-detailscherm getoond aan... nee, beheer blijft schoon). Dus: wél op alle 4 publieke/klant-gerichte plekken, **niet** in beheer (ook niet in het bestel-detailscherm, dat is beheer).
- Vertaalfallback: als `omschrijvingFr`/`De`/`En` leeg is, toon de `omschrijvingNl`-tekst in plaats van niets.
- Segment-filter op de collectiepagina komt uit de Firestore `segmenten`-collectie; `src/data/segments.ts` en `src/data/sizes.ts` vervallen zodra niets ze meer gebruikt.
- Firestore-rule voor `bestellines`: basis-typevalidatie (niet-lege strings, positieve getallen), **geen** cross-collectie-validatie via `get()`.
- Prijsformattering: hergebruik de bestaande `formatCurrency` uit `@/data/mockAdminInvoices` (`toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })`) — niet opnieuw implementeren.
- Materiaal-label: `` `${materiaal.materiaaldikte}mm — ${materiaal.omschrijving}` ``. Maat-label: `` `${maat.breedte}×${maat.hoogte} cm` `` — zelfde formattering als in beheer (Deel 1's `KunstwerkenSection`).

---

## File Structure

**New files:**
- `src/components/WatermarkedImage.tsx` — herbruikbare foto + watermerk-overlay.
- `src/lib/resolveKunstwerkOmschrijving.ts` — locale + NL-fallback resolver.
- `tests/components/WatermarkedImage.test.tsx`
- `tests/lib/resolveKunstwerkOmschrijving.test.ts`

**Modified files:**
- `src/lib/useCart.tsx` — nieuwe `CartItem`-vorm.
- `firestore.rules` — `bestellines`-create-rule versoepeld.
- `src/components/ProductsGrid.tsx` — Firestore-data i.p.v. hardcoded segments.
- `src/components/ProductModal.tsx` — materiaal+maat-keuze, prijs, watermerk.
- `src/components/FeaturedWorks.tsx` — echte data i.p.v. placeholders.
- `src/components/CartPanel.tsx` — nieuwe item-weergave, totaalbedrag, checkout-schrijfactie met echte id's + prijs.
- `src/components/beheer/BestellingenSection.tsx` — `BestellingLine` krijgt `prijs`-veld, props uitgebreid.
- `src/components/beheer/BestellingModal.tsx` — toont opgeloste kunstwerk-info i.p.v. ruw id.
- `src/components/beheer/BeheerShell.tsx` — geeft `kunstwerken`/`materialen`/`maten` door aan `BestellingenSection`.
- `tests/lib/useCart.test.ts`, `tests/components/CartPanel.test.tsx`, `tests/components/ProductsGrid.test.tsx`, `tests/components/ProductModal.test.tsx`, `tests/components/FeaturedWorks.test.tsx`, `tests/components/beheer/BestellingenSection.test.tsx`, `tests/components/beheer/BestellingModal.test.tsx`, `tests/components/beheer/BeheerShell.test.tsx`

**Deleted files** (dead code, once nothing imports them anymore — removed at the end of Task 5):
- `src/data/segments.ts`, `src/data/sizes.ts`, `tests/data/segments.test.ts`, `tests/data/sizes.test.ts`

---

### Task 1: `WatermarkedImage` component

**Files:**
- Create: `src/components/WatermarkedImage.tsx`
- Test: `tests/components/WatermarkedImage.test.tsx`

**Interfaces:**
- Produces: `WatermarkedImageProps = { src: string; alt: string; className?: string }` → renders `<div>` wrapping an `<img>` plus a watermark overlay `<div>` — consumed by Tasks 5, 6, 7, 8 (`ProductsGrid`, `ProductModal`, `FeaturedWorks`, `CartPanel`).

- [ ] **Step 1: Write the failing test**

`tests/components/WatermarkedImage.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WatermarkedImage } from '@/components/WatermarkedImage';

describe('WatermarkedImage', () => {
  it('renders the image with the given src and alt text', () => {
    render(<WatermarkedImage src="https://example.com/foto.jpg" alt="Een kunstwerk" />);
    const img = screen.getByRole('img', { name: 'Een kunstwerk' });
    expect(img).toHaveAttribute('src', 'https://example.com/foto.jpg');
  });

  it('renders a non-interactive watermark overlay with the copyright text', () => {
    render(<WatermarkedImage src="https://example.com/foto.jpg" alt="Een kunstwerk" />);
    const overlay = screen.getByTestId('watermark-overlay');
    expect(overlay).toHaveTextContent('© Glassart & Design');
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
  });

  it('applies an extra className to the wrapper when given', () => {
    render(<WatermarkedImage src="https://example.com/foto.jpg" alt="Een kunstwerk" className="h-12 w-12" />);
    expect(screen.getByTestId('watermarked-image')).toHaveClass('h-12', 'w-12');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/WatermarkedImage.test.tsx`
Expected: FAIL with "Cannot find module '@/components/WatermarkedImage'"

- [ ] **Step 3: Implement the component**

`src/components/WatermarkedImage.tsx`:
```tsx
export interface WatermarkedImageProps {
  src: string;
  alt: string;
  className?: string;
}

export function WatermarkedImage({ src, alt, className }: WatermarkedImageProps) {
  return (
    <div data-testid="watermarked-image" className={`relative overflow-hidden ${className ?? ''}`}>
      <img src={src} alt={alt} className="h-full w-full object-cover" />
      <div
        data-testid="watermark-overlay"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex select-none flex-wrap content-center justify-center gap-4 overflow-hidden text-[0.65rem] font-head uppercase tracking-widest text-white/40 [transform:rotate(-30deg)_scale(1.4)]"
      >
        {Array.from({ length: 12 }).map((_, index) => (
          <span key={index}>© Glassart & Design</span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/components/WatermarkedImage.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/WatermarkedImage.tsx tests/components/WatermarkedImage.test.tsx
git commit -m "feat: add WatermarkedImage component for customer-facing kunstwerk photos"
```

---

### Task 2: `resolveKunstwerkOmschrijving` helper

**Files:**
- Create: `src/lib/resolveKunstwerkOmschrijving.ts`
- Test: `tests/lib/resolveKunstwerkOmschrijving.test.ts`

**Interfaces:**
- Consumes: `Kunstwerk` from `@/components/beheer/materiaalTypes` (existing, from Deel 1: `{ omschrijvingNl, omschrijvingFr, omschrijvingDe, omschrijvingEn, ... }`).
- Produces: `resolveKunstwerkOmschrijving(kunstwerk: Kunstwerk, locale: string): string` — consumed by Tasks 5, 6, 7 (`ProductsGrid`, `ProductModal`, `FeaturedWorks`).

- [ ] **Step 1: Write the failing tests**

`tests/lib/resolveKunstwerkOmschrijving.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { resolveKunstwerkOmschrijving } from '@/lib/resolveKunstwerkOmschrijving';
import type { Kunstwerk } from '@/components/beheer/materiaalTypes';

const BASE_KUNSTWERK: Kunstwerk = {
  id: 'kw-1',
  foto: 'https://example.com/foto.jpg',
  segmentIds: [],
  materiaalIds: [],
  maatIds: [],
  prijzen: [],
  omschrijvingNl: 'Nederlandse tekst',
  omschrijvingFr: 'Texte français',
  omschrijvingDe: 'Deutscher Text',
  omschrijvingEn: 'English text',
};

describe('resolveKunstwerkOmschrijving', () => {
  it('returns the Dutch description for locale "nl"', () => {
    expect(resolveKunstwerkOmschrijving(BASE_KUNSTWERK, 'nl')).toBe('Nederlandse tekst');
  });

  it('returns the French description for locale "fr" when filled in', () => {
    expect(resolveKunstwerkOmschrijving(BASE_KUNSTWERK, 'fr')).toBe('Texte français');
  });

  it('returns the German description for locale "de" when filled in', () => {
    expect(resolveKunstwerkOmschrijving(BASE_KUNSTWERK, 'de')).toBe('Deutscher Text');
  });

  it('returns the English description for locale "en" when filled in', () => {
    expect(resolveKunstwerkOmschrijving(BASE_KUNSTWERK, 'en')).toBe('English text');
  });

  it('falls back to Dutch when the French description is empty', () => {
    expect(resolveKunstwerkOmschrijving({ ...BASE_KUNSTWERK, omschrijvingFr: '' }, 'fr')).toBe(
      'Nederlandse tekst'
    );
  });

  it('falls back to Dutch for an unrecognized locale', () => {
    expect(resolveKunstwerkOmschrijving(BASE_KUNSTWERK, 'es')).toBe('Nederlandse tekst');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/resolveKunstwerkOmschrijving.test.ts`
Expected: FAIL with "Cannot find module '@/lib/resolveKunstwerkOmschrijving'"

- [ ] **Step 3: Implement the helper**

`src/lib/resolveKunstwerkOmschrijving.ts`:
```ts
import type { Kunstwerk } from '@/components/beheer/materiaalTypes';

export function resolveKunstwerkOmschrijving(kunstwerk: Kunstwerk, locale: string): string {
  const byLocale: Record<string, string> = {
    fr: kunstwerk.omschrijvingFr,
    de: kunstwerk.omschrijvingDe,
    en: kunstwerk.omschrijvingEn,
  };
  return byLocale[locale] || kunstwerk.omschrijvingNl;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/resolveKunstwerkOmschrijving.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/resolveKunstwerkOmschrijving.ts tests/lib/resolveKunstwerkOmschrijving.test.ts
git commit -m "feat: add resolveKunstwerkOmschrijving locale resolver with NL fallback"
```

---

### Task 3: `useCart` — new `CartItem` shape

**Files:**
- Modify: `src/lib/useCart.tsx`
- Modify: `tests/lib/useCart.test.ts`

**Interfaces:**
- Produces: `CartItem = { id: string; kunstwerkId: string; foto: string; omschrijving: string; materiaalId: string; materiaalLabel: string; maatId: string; maatLabel: string; prijs: number; quantity: number }`, `useCart(): { items: CartItem[]; isHydrated: boolean; totalQuantity: number; totalPrice: number; addItem: (input: Omit<CartItem, 'id'>) => void; removeItem: (id: string) => void; clear: () => void }` — consumed by Tasks 6 (`ProductModal`) and 8 (`CartPanel`).

This is a breaking change to `CartItem` — the old `{ segmentSlug, segmentMessageKey, imageSrc, size }` shape is fully replaced, not extended. `ProductModal` and `CartPanel` (Tasks 6, 8) will fail to compile against the old shape until they're updated in their own tasks — that's expected and fine within this plan's task sequencing (later tasks fix them).

- [ ] **Step 1: Write the failing tests**

Replace `tests/lib/useCart.test.ts` entirely with:
```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { CartProvider, useCart } from '@/lib/useCart';

const SAMPLE_ITEM = {
  kunstwerkId: 'kw-1',
  foto: 'https://example.com/foto.jpg',
  omschrijving: 'Mooi kunstwerk',
  materiaalId: 'mat-1',
  materiaalLabel: '4mm — Veiligheidsglas',
  maatId: 'maat-1',
  maatLabel: '40×60 cm',
  prijs: 150,
  quantity: 2,
};

beforeEach(() => {
  window.localStorage.clear();
});

describe('useCart', () => {
  it('starts empty and hydrated after mount', () => {
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    expect(result.current.isHydrated).toBe(true);
    expect(result.current.items).toEqual([]);
    expect(result.current.totalQuantity).toBe(0);
    expect(result.current.totalPrice).toBe(0);
  });

  it('adds a new item, computes totalPrice, and persists it to localStorage', () => {
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    act(() => {
      result.current.addItem(SAMPLE_ITEM);
    });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.totalQuantity).toBe(2);
    expect(result.current.totalPrice).toBe(300);
    const stored = JSON.parse(window.localStorage.getItem('glassart-cart') ?? '[]');
    expect(stored).toHaveLength(1);
  });

  it('increases quantity instead of duplicating when the same kunstwerk+materiaal+maat is added again', () => {
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    act(() => {
      result.current.addItem({ ...SAMPLE_ITEM, quantity: 1 });
    });
    act(() => {
      result.current.addItem({ ...SAMPLE_ITEM, quantity: 1 });
    });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].quantity).toBe(2);
  });

  it('adds a separate line when the same kunstwerk is added with a different maat', () => {
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    act(() => {
      result.current.addItem(SAMPLE_ITEM);
    });
    act(() => {
      result.current.addItem({
        ...SAMPLE_ITEM,
        maatId: 'maat-2',
        maatLabel: '60×90 cm',
        prijs: 200,
        quantity: 1,
      });
    });
    expect(result.current.items).toHaveLength(2);
    expect(result.current.totalPrice).toBe(500);
  });

  it('removes an item by id', () => {
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    act(() => {
      result.current.addItem(SAMPLE_ITEM);
    });
    const id = result.current.items[0].id;
    act(() => {
      result.current.removeItem(id);
    });
    expect(result.current.items).toEqual([]);
  });

  it('clears the cart and localStorage', () => {
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    act(() => {
      result.current.addItem(SAMPLE_ITEM);
    });
    act(() => {
      result.current.clear();
    });
    expect(result.current.items).toEqual([]);
    expect(window.localStorage.getItem('glassart-cart')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/useCart.test.ts`
Expected: FAIL — `addItem` doesn't accept the new fields, `totalPrice` doesn't exist yet.

- [ ] **Step 3: Update `useCart.tsx`**

Replace the whole file with:
```tsx
'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const STORAGE_KEY = 'glassart-cart';

export interface CartItem {
  id: string;
  kunstwerkId: string;
  foto: string;
  omschrijving: string;
  materiaalId: string;
  materiaalLabel: string;
  maatId: string;
  maatLabel: string;
  prijs: number;
  quantity: number;
}

type AddItemInput = Omit<CartItem, 'id'>;

interface CartValue {
  items: CartItem[];
  isHydrated: boolean;
  totalQuantity: number;
  totalPrice: number;
  addItem: (input: AddItemInput) => void;
  removeItem: (id: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartValue | null>(null);

function makeItemId(kunstwerkId: string, materiaalId: string, maatId: string): string {
  return `${kunstwerkId}__${materiaalId}__${maatId}`;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setItems(JSON.parse(stored));
      } catch {
        setItems([]);
      }
    }
    setIsHydrated(true);
  }, []);

  const addItem = useCallback((input: AddItemInput) => {
    setItems((current) => {
      const id = makeItemId(input.kunstwerkId, input.materiaalId, input.maatId);
      const existing = current.find((item) => item.id === id);
      const next = existing
        ? current.map((item) =>
            item.id === id ? { ...item, quantity: item.quantity + input.quantity } : item
          )
        : [...current, { id, ...input }];
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((current) => {
      const next = current.filter((item) => item.id !== id);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  const totalQuantity = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items]
  );

  const totalPrice = useMemo(
    () => items.reduce((sum, item) => sum + item.prijs * item.quantity, 0),
    [items]
  );

  const value = useMemo(
    () => ({ items, isHydrated, totalQuantity, totalPrice, addItem, removeItem, clear }),
    [items, isHydrated, totalQuantity, totalPrice, addItem, removeItem, clear]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/useCart.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/useCart.tsx tests/lib/useCart.test.ts
git commit -m "feat: rework CartItem to reference real kunstwerk/materiaal/maat + price"
```

---

### Task 4: `firestore.rules` — allow real bestellijn values

**Files:**
- Modify: `firestore.rules`

**Interfaces:**
- Produces: an updated `bestellines` create-rule accepting real `kunstwerkId`/`maatId`/`materiaalId`/`prijs` values — consumed operationally by Task 8 (`CartPanel`'s checkout write). No code-level interface (this is a deployed security rule, not application code).

This task has NO automated test — Firestore security rules cannot be exercised by this project's mocked-SDK Vitest setup (no local emulator wired in), matching the precedent set by Deel 1's Storage-rules task. Verification here is: does the rule read correctly (manual review) and, after all tasks are done, an end-to-end manual check against a real Firebase project (see "Manual verification" at the end of this plan).

- [ ] **Step 1: Update the `bestellines` create-rule**

In `firestore.rules`, replace the `bestellines` `match` block's `allow create` clause:
```
      match /bestellines/{lineId} {
        allow create: if request.auth != null &&
          request.auth.uid == get(/databases/$(database)/documents/bestelheaders/$(id)).data.klantId &&
          request.resource.data.keys().hasOnly(['kunstwerkId', 'maatId', 'materiaalId', 'prijs', 'quantity']) &&
          request.resource.data.kunstwerkId is string && request.resource.data.kunstwerkId.size() > 0 &&
          request.resource.data.maatId is string && request.resource.data.maatId.size() > 0 &&
          request.resource.data.materiaalId is string && request.resource.data.materiaalId.size() > 0 &&
          request.resource.data.prijs is number && request.resource.data.prijs > 0 &&
          request.resource.data.quantity is int && request.resource.data.quantity > 0;
        allow read: if request.auth != null &&
          (request.auth.uid == get(/databases/$(database)/documents/bestelheaders/$(id)).data.klantId ||
           exists(/databases/$(database)/documents/medewerkers/$(request.auth.uid)));
        allow update, delete: if false;
      }
```
(Only the `allow create` block changes — `allow read`/`allow update, delete` stay exactly as they are.)

- [ ] **Step 2: Verify the rules file is still syntactically well-formed**

Run: `node -e "const fs=require('fs'); const src=fs.readFileSync('firestore.rules','utf8'); const open=(src.match(/\{/g)||[]).length; const close=(src.match(/\}/g)||[]).length; if (open!==close) throw new Error('brace mismatch: '+open+' vs '+close); console.log('braces balanced:', open)"`
Expected: prints `braces balanced: <N>` with no error (this is a lightweight sanity check, not a full rules-language parse — Firestore rules require the Firebase CLI/emulator to fully validate, which isn't available in this project's test setup).

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat: allow real kunstwerk/materiaal/maat/prijs values on bestellijnen"
```

---

### Task 5: `ProductsGrid` — real Firestore data

**Files:**
- Modify: `src/components/ProductsGrid.tsx`
- Modify: `tests/components/ProductsGrid.test.tsx`

**Interfaces:**
- Consumes: `Segment`, `Kunstwerk`, `Materiaal`, `Maat` from `@/components/beheer/materiaalTypes` (existing, Deel 1); `useFirestoreCollection` (existing, Deel 1); `WatermarkedImage` (Task 1); `resolveKunstwerkOmschrijving` (Task 2).
- Produces: renders `<ProductModal kunstwerk={...} materialen={...} maten={...} onClose={...} />` — Task 6 (`ProductModal`) must accept exactly these 4 props (this task passes them; Task 6 implements the component that receives them — until Task 6 lands, `ProductModal` will not yet accept this shape, which is expected sequencing within this plan).

**Design note:** `ProductsGrid` is the single fetch point for `materialen`/`maten` — it passes them down to `ProductModal` as props rather than `ProductModal` fetching its own copy, mirroring how `BeheerShell` fetches once and passes down to beheer sections (Deel 1).

- [ ] **Step 1: Write the failing tests**

Replace `tests/components/ProductsGrid.test.tsx` entirely with:
```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ProductsGrid } from '@/components/ProductsGrid';
import { CartProvider } from '@/lib/useCart';
import messages from '../../messages/nl.json';

const getDocsMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ name })),
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
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
      <CartProvider>
        <ProductsGrid />
      </CartProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  getDocsMock.mockReset();
  mockCollections();
});

describe('ProductsGrid', () => {
  it('shows all 3 kunstwerken and 3 filter buttons (all + 2 segments) by default', async () => {
    renderProductsGrid();
    expect(await screen.findAllByTestId('product-card')).toHaveLength(3);
    expect(screen.getByTestId('filter-all')).toBeInTheDocument();
    expect(screen.getByTestId('filter-seg-hotel')).toHaveTextContent('Hotel');
    expect(screen.getByTestId('filter-seg-wellness')).toHaveTextContent('Wellness');
  });

  it("shows only that segment's kunstwerken after clicking its filter button, including one shared across segments", async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    fireEvent.click(screen.getByTestId('filter-seg-wellness'));
    expect(screen.getAllByTestId('product-card')).toHaveLength(2); // kw-2 and kw-3
  });

  it('returns to all kunstwerken after clicking the "Alle" filter again', async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    fireEvent.click(screen.getByTestId('filter-seg-wellness'));
    fireEvent.click(screen.getByTestId('filter-all'));
    expect(screen.getAllByTestId('product-card')).toHaveLength(3);
  });

  it('marks the active filter button with aria-pressed', async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    expect(screen.getByTestId('filter-all')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('filter-seg-hotel'));
    expect(screen.getByTestId('filter-seg-hotel')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('filter-all')).toHaveAttribute('aria-pressed', 'false');
  });

  it('opens the product modal with the resolved description when a card is clicked', async () => {
    renderProductsGrid();
    const cards = await screen.findAllByTestId('product-card');
    expect(screen.queryByTestId('product-modal')).not.toBeInTheDocument();
    fireEvent.click(cards[0]);
    expect(screen.getByTestId('product-modal')).toBeInTheDocument();
  });

  it('closes the product modal when its backdrop is clicked', async () => {
    renderProductsGrid();
    const cards = await screen.findAllByTestId('product-card');
    fireEvent.click(cards[0]);
    expect(screen.getByTestId('product-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('product-modal-backdrop'));
    expect(screen.queryByTestId('product-modal')).not.toBeInTheDocument();
  });

  it('opens the product modal when Enter or Space is pressed on a focused card', async () => {
    renderProductsGrid();
    const cards = await screen.findAllByTestId('product-card');
    fireEvent.keyDown(cards[0], { key: 'Enter' });
    expect(screen.getByTestId('product-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('product-modal-backdrop'));

    fireEvent.keyDown(cards[1], { key: ' ' });
    expect(screen.getByTestId('product-modal')).toBeInTheDocument();
  });

  it('shows a watermark overlay on every product card photo', async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    expect(screen.getAllByTestId('watermark-overlay').length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx`
Expected: FAIL — component still uses `SEGMENTS`/`getAllImages` from `@/data/segments`, no `data-testid="filter-seg-hotel"` etc.

- [ ] **Step 3: Implement the component**

Replace `src/components/ProductsGrid.tsx` entirely with:
```tsx
'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useFirestoreCollection } from '@/lib/useFirestoreCollection';
import { resolveKunstwerkOmschrijving } from '@/lib/resolveKunstwerkOmschrijving';
import { WatermarkedImage } from './WatermarkedImage';
import { ProductModal } from './ProductModal';
import type { Segment, Kunstwerk, Materiaal, Maat } from './beheer/materiaalTypes';

const ALL_FILTER = 'all';

export function ProductsGrid() {
  const locale = useLocale();
  const tCollections = useTranslations('collectionsPage');
  const [activeFilter, setActiveFilter] = useState(ALL_FILTER);
  const [selectedKunstwerk, setSelectedKunstwerk] = useState<Kunstwerk | null>(null);

  const segmenten = useFirestoreCollection<Segment>('segmenten');
  const kunstwerken = useFirestoreCollection<Kunstwerk>('kunstwerken');
  const materialen = useFirestoreCollection<Materiaal>('materialen');
  const maten = useFirestoreCollection<Maat>('maten');

  if (segmenten.items === null || kunstwerken.items === null) {
    return null;
  }

  const allKunstwerken = kunstwerken.items;
  const visibleKunstwerken =
    activeFilter === ALL_FILTER
      ? allKunstwerken
      : allKunstwerken.filter((kunstwerk) => kunstwerk.segmentIds.includes(activeFilter));

  function filterButtonClass(isActive: boolean) {
    return isActive
      ? 'rounded-full bg-silver px-4 py-1.5 text-xs font-head tracking-wide text-ink'
      : 'rounded-full border border-white/20 px-4 py-1.5 text-xs font-head tracking-wide text-white/70 hover:border-gold/40 hover:text-gold';
  }

  return (
    <>
      <div className="mx-auto mb-8 flex max-w-5xl flex-wrap justify-center gap-2">
        <button
          type="button"
          data-testid="filter-all"
          aria-pressed={activeFilter === ALL_FILTER}
          onClick={() => setActiveFilter(ALL_FILTER)}
          className={filterButtonClass(activeFilter === ALL_FILTER)}
        >
          {tCollections('filterAll')} ({allKunstwerken.length})
        </button>
        {segmenten.items.map((segment) => (
          <button
            key={segment.id}
            type="button"
            data-testid={`filter-${segment.id}`}
            aria-pressed={activeFilter === segment.id}
            onClick={() => setActiveFilter(segment.id)}
            className={filterButtonClass(activeFilter === segment.id)}
          >
            {segment.omschrijving} (
            {allKunstwerken.filter((kunstwerk) => kunstwerk.segmentIds.includes(segment.id)).length})
          </button>
        ))}
      </div>

      <div
        data-testid="products-grid"
        className="mx-auto grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      >
        {visibleKunstwerken.map((kunstwerk) => {
          const omschrijving = resolveKunstwerkOmschrijving(kunstwerk, locale);
          return (
            <div
              key={kunstwerk.id}
              data-testid="product-card"
              role="button"
              tabIndex={0}
              aria-label={omschrijving}
              onClick={() => setSelectedKunstwerk(kunstwerk)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  if (event.key === ' ') {
                    event.preventDefault();
                  }
                  setSelectedKunstwerk(kunstwerk);
                }
              }}
              className="group relative cursor-pointer overflow-hidden rounded border border-white/10 transition hover:-translate-y-1"
            >
              <WatermarkedImage src={kunstwerk.foto} alt={omschrijving} className="aspect-square w-full" />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-br from-gold/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              />
              <span className="badge-gold absolute left-2 top-2">{omschrijving}</span>
            </div>
          );
        })}
      </div>

      <ProductModal
        kunstwerk={selectedKunstwerk}
        materialen={materialen.items}
        maten={maten.items}
        onClose={() => setSelectedKunstwerk(null)}
      />
    </>
  );
}
```

`ProductsGrid` now renders `<ProductModal kunstwerk={...} materialen={...} maten={...} onClose={...} />` — `ProductModal` doesn't accept this shape yet, so this test suite (and `tsc`) will not pass until `ProductModal` is rewritten too. Because these two components change together as one atomic unit (the parent dictates the child's props contract), continue directly into the `ProductModal` rewrite below as part of this SAME task — do not stop and commit yet.

**Files (continued):**
- Modify: `src/components/ProductModal.tsx`
- Modify: `tests/components/ProductModal.test.tsx`
- Modify: `messages/nl.json` (one new key: `cart.material`)

- [ ] **Step 4: Add the missing translation key**

In `messages/nl.json`, inside `"cart": { ... }`, add a `"material"` key right after `"size": "Maat",`:
```json
    "size": "Maat",
    "material": "Materiaal",
```

- [ ] **Step 5: Write the failing tests for `ProductModal`**

Replace `tests/components/ProductModal.test.tsx` entirely with:
```tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ProductModal } from '@/components/ProductModal';
import { CartProvider, useCart } from '@/lib/useCart';
import type { Kunstwerk, Materiaal, Maat } from '@/components/beheer/materiaalTypes';
import messages from '../../messages/nl.json';

const KUNSTWERK: Kunstwerk = {
  id: 'kw-1',
  foto: 'https://example.com/kw-1.jpg',
  segmentIds: ['seg-1'],
  materiaalIds: ['mat-1', 'mat-2'],
  maatIds: ['maat-1', 'maat-2'],
  prijzen: [
    { materiaalId: 'mat-1', maatId: 'maat-1', prijs: 150 },
    { materiaalId: 'mat-1', maatId: 'maat-2', prijs: 200 },
    { materiaalId: 'mat-2', maatId: 'maat-1', prijs: 175 },
    { materiaalId: 'mat-2', maatId: 'maat-2', prijs: 225 },
  ],
  omschrijvingNl: 'Wellness paneel',
  omschrijvingFr: '',
  omschrijvingDe: '',
  omschrijvingEn: '',
};
const MATERIALEN: Materiaal[] = [
  { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'Veiligheidsglas' },
  { id: 'mat-2', materiaalsoortId: 'soort-2', materiaaldikte: 3, omschrijving: 'Acryl' },
];
const MATEN: Maat[] = [
  { id: 'maat-1', breedte: 40, hoogte: 60 },
  { id: 'maat-2', breedte: 60, hoogte: 90 },
];

function renderModal(onClose: () => void = () => {}, kunstwerk: Kunstwerk | null = KUNSTWERK) {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CartProvider>
        <ProductModal kunstwerk={kunstwerk} materialen={MATERIALEN} maten={MATEN} onClose={onClose} />
      </CartProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ProductModal', () => {
  it('renders nothing when kunstwerk is null', () => {
    renderModal(() => {}, null);
    expect(screen.queryByTestId('product-modal')).not.toBeInTheDocument();
  });

  it('shows the resolved description, defaults to the first materiaal/maat, and the matching price', () => {
    renderModal();
    expect(screen.getByText('Wellness paneel')).toBeInTheDocument();
    expect(screen.getByTestId('product-modal-materiaal')).toHaveValue('mat-1');
    expect(screen.getByTestId('product-modal-maat')).toHaveValue('maat-1');
    expect(screen.getByTestId('product-modal-prijs')).toHaveTextContent('€ 150,00');
    expect(screen.getByTestId('product-modal-quantity-value')).toHaveTextContent('1');
  });

  it('updates the shown price when a different materiaal or maat is chosen', () => {
    renderModal();
    fireEvent.change(screen.getByTestId('product-modal-maat'), { target: { value: 'maat-2' } });
    expect(screen.getByTestId('product-modal-prijs')).toHaveTextContent('€ 200,00');
    fireEvent.change(screen.getByTestId('product-modal-materiaal'), { target: { value: 'mat-2' } });
    expect(screen.getByTestId('product-modal-prijs')).toHaveTextContent('€ 225,00');
  });

  it('only lists the materialen this kunstwerk actually offers', () => {
    renderModal();
    const options = screen.getByTestId('product-modal-materiaal').querySelectorAll('option');
    expect(options).toHaveLength(2);
  });

  it('increments and decrements quantity, never below 1', () => {
    renderModal();
    fireEvent.click(screen.getByTestId('product-modal-quantity-minus'));
    expect(screen.getByTestId('product-modal-quantity-value')).toHaveTextContent('1');
    fireEvent.click(screen.getByTestId('product-modal-quantity-plus'));
    fireEvent.click(screen.getByTestId('product-modal-quantity-plus'));
    expect(screen.getByTestId('product-modal-quantity-value')).toHaveTextContent('3');
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    renderModal(onClose);
    fireEvent.click(screen.getByTestId('product-modal-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    renderModal(onClose);
    fireEvent.click(screen.getByTestId('product-modal-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    renderModal(onClose);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('adds the chosen kunstwerk/materiaal/maat/price/quantity to the cart, shows confirmed state, then closes', () => {
    const onClose = vi.fn();

    function Probe() {
      const { items } = useCart();
      return <div data-testid="probe">{JSON.stringify(items)}</div>;
    }

    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CartProvider>
          <ProductModal kunstwerk={KUNSTWERK} materialen={MATERIALEN} maten={MATEN} onClose={onClose} />
          <Probe />
        </CartProvider>
      </NextIntlClientProvider>
    );

    fireEvent.change(screen.getByTestId('product-modal-maat'), { target: { value: 'maat-2' } });
    fireEvent.click(screen.getByTestId('product-modal-quantity-plus'));
    fireEvent.click(screen.getByTestId('product-modal-confirm'));

    const items = JSON.parse(screen.getByTestId('probe').textContent ?? '[]');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kunstwerkId: 'kw-1',
      materiaalId: 'mat-1',
      maatId: 'maat-2',
      maatLabel: '60×90 cm',
      prijs: 200,
      quantity: 2,
    });

    expect(screen.getByTestId('product-modal-confirm')).toHaveTextContent('Toegevoegd!');
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not let a stale close-timer from a previous kunstwerk affect the newly shown modal', () => {
    const onClose = vi.fn();

    const { rerender } = render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CartProvider>
          <ProductModal kunstwerk={KUNSTWERK} materialen={MATERIALEN} maten={MATEN} onClose={onClose} />
        </CartProvider>
      </NextIntlClientProvider>
    );

    fireEvent.click(screen.getByTestId('product-modal-confirm'));
    expect(screen.getByTestId('product-modal-confirm')).toHaveTextContent('Toegevoegd!');

    const NEXT_KUNSTWERK: Kunstwerk = { ...KUNSTWERK, id: 'kw-2', omschrijvingNl: 'Ander kunstwerk' };

    rerender(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CartProvider>
          <ProductModal kunstwerk={null} materialen={MATERIALEN} maten={MATEN} onClose={onClose} />
        </CartProvider>
      </NextIntlClientProvider>
    );
    rerender(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CartProvider>
          <ProductModal kunstwerk={NEXT_KUNSTWERK} materialen={MATERIALEN} maten={MATEN} onClose={onClose} />
        </CartProvider>
      </NextIntlClientProvider>
    );

    expect(screen.getByTestId('product-modal-confirm')).toHaveTextContent('Toevoegen');

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('product-modal')).toBeInTheDocument();
  });

  it('exposes dialog semantics for assistive tech', () => {
    renderModal();
    const modal = screen.getByTestId('product-modal');
    expect(modal).toHaveAttribute('role', 'dialog');
    expect(modal).toHaveAttribute('aria-modal', 'true');
  });

  it('moves focus into the modal (the close button) when it opens', () => {
    renderModal();
    expect(screen.getByTestId('product-modal-close')).toHaveFocus();
  });

  it('traps Tab focus within the modal, wrapping from the last to the first focusable element', () => {
    renderModal();
    const closeButton = screen.getByTestId('product-modal-close');
    const confirmButton = screen.getByTestId('product-modal-confirm');

    confirmButton.focus();
    expect(confirmButton).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(closeButton).toHaveFocus();
  });

  it('shows a watermark overlay on the photo', () => {
    renderModal();
    expect(screen.getByTestId('watermark-overlay')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run the `ProductModal` tests to verify they fail**

Run: `npx vitest run tests/components/ProductModal.test.tsx`
Expected: FAIL — component still uses `STANDARD_SIZES`/`SegmentImage`, no `materiaal`/`prijs` fields.

- [ ] **Step 7: Implement `ProductModal`**

Replace `src/components/ProductModal.tsx` entirely with:
```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useCart } from '@/lib/useCart';
import { useOverlayDismiss } from '@/lib/useOverlayDismiss';
import { resolveKunstwerkOmschrijving } from '@/lib/resolveKunstwerkOmschrijving';
import { formatCurrency } from '@/data/mockAdminInvoices';
import { WatermarkedImage } from './WatermarkedImage';
import type { Kunstwerk, Materiaal, Maat } from './beheer/materiaalTypes';

const CONFIRM_FEEDBACK_MS = 600;

function materiaalLabel(materiaal: Materiaal): string {
  return `${materiaal.materiaaldikte}mm — ${materiaal.omschrijving}`;
}

function maatLabel(maat: Maat): string {
  return `${maat.breedte}×${maat.hoogte} cm`;
}

interface ProductModalProps {
  kunstwerk: Kunstwerk | null;
  materialen: Materiaal[] | null;
  maten: Maat[] | null;
  onClose: () => void;
}

export function ProductModal({ kunstwerk, materialen, maten, onClose }: ProductModalProps) {
  const t = useTranslations('cart');
  const locale = useLocale();
  const [materiaalId, setMateriaalId] = useState('');
  const [maatId, setMaatId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const { addItem } = useCart();
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!kunstwerk) {
      return;
    }
    setMateriaalId(kunstwerk.materiaalIds[0] ?? '');
    setMaatId(kunstwerk.maatIds[0] ?? '');
    setQuantity(1);
    setIsConfirmed(false);
  }, [kunstwerk]);

  // Ensure a pending "close after confirm" timer never fires for a stale
  // kunstwerk: clear it whenever `kunstwerk` changes, and on unmount.
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };
  }, [kunstwerk]);

  useOverlayDismiss({
    isOpen: kunstwerk !== null,
    onClose,
    containerRef: modalRef,
    initialFocusRef: closeButtonRef,
  });

  if (!kunstwerk) {
    return null;
  }

  const beschikbareMaterialen = (materialen ?? []).filter((materiaal) =>
    kunstwerk.materiaalIds.includes(materiaal.id)
  );
  const beschikbareMaten = (maten ?? []).filter((maat) => kunstwerk.maatIds.includes(maat.id));
  const prijsRegel = kunstwerk.prijzen.find(
    (regel) => regel.materiaalId === materiaalId && regel.maatId === maatId
  );
  const omschrijving = resolveKunstwerkOmschrijving(kunstwerk, locale);

  function handleConfirm() {
    if (isConfirmed || !prijsRegel) {
      return;
    }
    const gekozenMateriaal = beschikbareMaterialen.find((materiaal) => materiaal.id === materiaalId);
    const gekozenMaat = beschikbareMaten.find((maat) => maat.id === maatId);
    if (!gekozenMateriaal || !gekozenMaat) {
      return;
    }
    addItem({
      kunstwerkId: kunstwerk.id,
      foto: kunstwerk.foto,
      omschrijving,
      materiaalId,
      materiaalLabel: materiaalLabel(gekozenMateriaal),
      maatId,
      maatLabel: maatLabel(gekozenMaat),
      prijs: prijsRegel.prijs,
      quantity,
    });
    setIsConfirmed(true);
    closeTimeoutRef.current = setTimeout(() => {
      closeTimeoutRef.current = null;
      onClose();
    }, CONFIRM_FEEDBACK_MS);
  }

  return (
    <div
      ref={modalRef}
      data-testid="product-modal"
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        data-testid="product-modal-backdrop"
        onClick={onClose}
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
      />
      <div className="relative z-10 grid w-full max-w-2xl grid-cols-1 overflow-hidden rounded-lg border border-white/10 bg-charcoal sm:grid-cols-2">
        <button
          ref={closeButtonRef}
          type="button"
          data-testid="product-modal-close"
          aria-label={t('close')}
          onClick={onClose}
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white/80 hover:text-white"
        >
          ×
        </button>
        <WatermarkedImage src={kunstwerk.foto} alt={omschrijving} className="h-56 w-full sm:h-full" />
        <div className="flex flex-col gap-4 p-6">
          <p className="font-head text-xs uppercase tracking-[0.2em] text-gold">{omschrijving}</p>
          <label className="flex flex-col gap-1 text-[0.65rem] uppercase tracking-wide text-white/60">
            {t('material')}
            <select
              data-testid="product-modal-materiaal"
              value={materiaalId}
              onChange={(event) => setMateriaalId(event.target.value)}
              className="rounded-sm bg-black/40 px-2 py-1.5 text-sm text-white"
            >
              {beschikbareMaterialen.map((materiaal) => (
                <option key={materiaal.id} value={materiaal.id}>
                  {materiaalLabel(materiaal)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[0.65rem] uppercase tracking-wide text-white/60">
            {t('size')}
            <select
              data-testid="product-modal-maat"
              value={maatId}
              onChange={(event) => setMaatId(event.target.value)}
              className="rounded-sm bg-black/40 px-2 py-1.5 text-sm text-white"
            >
              {beschikbareMaten.map((maat) => (
                <option key={maat.id} value={maat.id}>
                  {maatLabel(maat)}
                </option>
              ))}
            </select>
          </label>
          {prijsRegel && (
            <p data-testid="product-modal-prijs" className="text-sm text-white/80">
              {formatCurrency(prijsRegel.prijs)}
            </p>
          )}
          <div className="flex items-center justify-between gap-2 text-sm text-white/80">
            <span className="text-[0.65rem] uppercase tracking-wide text-white/60">{t('quantity')}</span>
            <div className="flex h-10 items-center overflow-hidden rounded-full border border-white/20">
              <button
                type="button"
                data-testid="product-modal-quantity-minus"
                onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                className="flex h-full w-9 items-center justify-center text-white/80 transition hover:bg-gold hover:text-ink"
              >
                −
              </button>
              <span data-testid="product-modal-quantity-value" className="w-9 text-center">
                {quantity}
              </span>
              <button
                type="button"
                data-testid="product-modal-quantity-plus"
                onClick={() => setQuantity((current) => current + 1)}
                className="flex h-full w-9 items-center justify-center text-white/80 transition hover:bg-gold hover:text-ink"
              >
                +
              </button>
            </div>
          </div>
          <button
            type="button"
            data-testid="product-modal-confirm"
            onClick={handleConfirm}
            disabled={isConfirmed || !prijsRegel}
            className={`rounded-sm px-4 py-2.5 text-xs tracking-[0.15em] transition disabled:opacity-40 ${
              isConfirmed ? 'cursor-default bg-green-500 text-white' : 'btn-gold'
            }`}
          >
            {isConfirmed ? t('added') : t('confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run both test files to verify everything passes**

Run: `npx vitest run tests/components/ProductModal.test.tsx tests/components/ProductsGrid.test.tsx`
Expected: PASS (14 tests in `ProductModal.test.tsx`, 8 tests in `ProductsGrid.test.tsx`)

Run: `npx tsc --noEmit`
Expected: no output (clean)

- [ ] **Step 9: Delete the now-unused hardcoded data files**

`src/data/segments.ts` and `src/data/sizes.ts` were only ever imported by `ProductsGrid.tsx` and `ProductModal.tsx` (verified via `grep -rn "data/segments\|data/sizes" src` before writing this plan — no other file references them). Both components no longer import them after Steps 3/7 above. Delete all four files:
```bash
git rm src/data/segments.ts src/data/sizes.ts tests/data/segments.test.ts tests/data/sizes.test.ts
```

- [ ] **Step 10: Run the full test suite to confirm nothing else depended on the deleted files**

Run: `npm test`
Expected: PASS — every remaining test file, with `tests/data/segments.test.ts` and `tests/data/sizes.test.ts` no longer present in the run at all (not failing — gone).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: wire ProductsGrid + ProductModal to real kunstwerken/materialen/maten data"
```

---

### Task 6: `FeaturedWorks` — real kunstwerken instead of placeholders

**Files:**
- Modify: `src/components/FeaturedWorks.tsx`
- Modify: `tests/components/FeaturedWorks.test.tsx`

**Interfaces:**
- Consumes: `Kunstwerk` from `@/components/beheer/materiaalTypes`; `useFirestoreCollection`; `resolveKunstwerkOmschrijving` (Task 2); `WatermarkedImage` (Task 1).
- Produces: nothing consumed by later tasks — this is a leaf component.

**Design note:** `FeaturedWorks` is non-interactive (no click-through to `ProductModal`) — it is purely a homepage teaser, matching the original placeholder's scope. It fetches its own `kunstwerken` collection independently (it's rendered on a different page than `ProductsGrid`, so there's no shared fetch point to reuse).

- [ ] **Step 1: Write the failing tests**

Replace `tests/components/FeaturedWorks.test.tsx` entirely with:
```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithIntl } from '../test-utils';
import { FeaturedWorks } from '@/components/FeaturedWorks';
import messages from '../../messages/nl.json';

const getDocsMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ name })),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  addDoc: vi.fn(),
}));

function makeSnapshot(docsData: Array<{ id: string; data: Record<string, unknown> }>) {
  return {
    empty: docsData.length === 0,
    docs: docsData.map(({ id, data }) => ({ id, data: () => data })),
  };
}

function makeKunstwerk(id: string) {
  return {
    id,
    data: {
      foto: `https://example.com/${id}.jpg`,
      segmentIds: ['seg-1'],
      materiaalIds: ['mat-1'],
      maatIds: ['maat-1'],
      prijzen: [{ materiaalId: 'mat-1', maatId: 'maat-1', prijs: 150 }],
      omschrijvingNl: `Kunstwerk ${id}`,
      omschrijvingFr: '',
      omschrijvingDe: '',
      omschrijvingEn: '',
    },
  };
}

beforeEach(() => {
  getDocsMock.mockReset();
});

describe('FeaturedWorks', () => {
  it('renders the section label and exactly 3 featured works when 5 kunstwerken exist', async () => {
    getDocsMock.mockResolvedValue(makeSnapshot(['a', 'b', 'c', 'd', 'e'].map(makeKunstwerk)));
    renderWithIntl(<FeaturedWorks />, 'nl', messages);
    expect(screen.getByText('Uitgelichte werken')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByTestId('featured-work')).toHaveLength(3));
  });

  it('shows all kunstwerken (not padded) when fewer than 3 exist', async () => {
    getDocsMock.mockResolvedValue(makeSnapshot(['a', 'b'].map(makeKunstwerk)));
    renderWithIntl(<FeaturedWorks />, 'nl', messages);
    await waitFor(() => expect(screen.getAllByTestId('featured-work')).toHaveLength(2));
  });

  it('shows a watermark overlay on each featured photo', async () => {
    getDocsMock.mockResolvedValue(makeSnapshot(['a', 'b', 'c'].map(makeKunstwerk)));
    renderWithIntl(<FeaturedWorks />, 'nl', messages);
    await waitFor(() => expect(screen.getAllByTestId('watermark-overlay')).toHaveLength(3));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/FeaturedWorks.test.tsx`
Expected: FAIL — component still renders `PLACEHOLDER_COUNT` empty `work-placeholder` divs, no Firestore fetch.

- [ ] **Step 3: Implement the component**

Replace `src/components/FeaturedWorks.tsx` entirely with:
```tsx
'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useFirestoreCollection } from '@/lib/useFirestoreCollection';
import { resolveKunstwerkOmschrijving } from '@/lib/resolveKunstwerkOmschrijving';
import { WatermarkedImage } from './WatermarkedImage';
import { GlassPanel } from './GlassPanel';
import type { Kunstwerk } from './beheer/materiaalTypes';

const FEATURED_COUNT = 3;

function pickRandom<T>(items: T[], count: number): T[] {
  const shuffled = [...items].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function FeaturedWorks() {
  const t = useTranslations('works');
  const locale = useLocale();
  const kunstwerken = useFirestoreCollection<Kunstwerk>('kunstwerken');

  const featured = useMemo(
    () => pickRandom(kunstwerken.items ?? [], FEATURED_COUNT),
    [kunstwerken.items]
  );

  if (kunstwerken.items === null) {
    return null;
  }

  return (
    <GlassPanel className="!max-w-5xl text-center">
      <p className="font-head text-[0.65rem] uppercase tracking-[0.25em] text-white/50">{t('label')}</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {featured.map((kunstwerk) => (
          <div
            key={kunstwerk.id}
            data-testid="featured-work"
            className="aspect-square overflow-hidden rounded border border-white/10"
          >
            <WatermarkedImage
              src={kunstwerk.foto}
              alt={resolveKunstwerkOmschrijving(kunstwerk, locale)}
              className="h-full w-full"
            />
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/FeaturedWorks.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/FeaturedWorks.tsx tests/components/FeaturedWorks.test.tsx
git commit -m "feat: show real random kunstwerken in FeaturedWorks"
```

---

### Task 7: `CartPanel` — new item display, total, real checkout write

**Files:**
- Modify: `src/components/CartPanel.tsx`
- Modify: `tests/components/CartPanel.test.tsx`
- Modify: `messages/nl.json` (one new key: `cart.total`)

**Interfaces:**
- Consumes: `useCart` (Task 3, new `CartItem` shape); `WatermarkedImage` (Task 1); `formatCurrency` from `@/data/mockAdminInvoices` (existing).
- Produces: nothing consumed by later tasks — this finishes the public-facing side of the plan.

- [ ] **Step 1: Add the missing translation key**

In `messages/nl.json`, inside `"cart": { ... }`, add a `"total"` key right after `"quantity": "Aantal",`:
```json
    "quantity": "Aantal",
    "total": "Totaal",
```

- [ ] **Step 2: Write the failing tests**

Replace `tests/components/CartPanel.test.tsx` entirely with:
```tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CartPanel } from '@/components/CartPanel';
import { CartProvider, useCart } from '@/lib/useCart';
import { CustomerAuthProvider } from '@/lib/useCustomerAuth';
import messages from '../../messages/nl.json';

const onAuthStateChangedMock = vi.fn();
const getDocMock = vi.fn();
const addDocMock = vi.fn();
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

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
  collection: vi.fn((_db, ...path) => ({ path })),
  addDoc: (...args: unknown[]) => addDocMock(...args),
  serverTimestamp: () => 'SERVER_TIMESTAMP',
}));

const SEED_ITEM = {
  kunstwerkId: 'kw-1',
  foto: 'https://example.com/kw-1.jpg',
  omschrijving: 'Wellness paneel',
  materiaalId: 'mat-1',
  materiaalLabel: '4mm — Veiligheidsglas',
  maatId: 'maat-1',
  maatLabel: '60×90 cm',
  prijs: 150,
  quantity: 2,
};

function Seed() {
  const { addItem } = useCart();
  return (
    <button type="button" data-testid="seed-cart" onClick={() => addItem(SEED_ITEM)}>
      Seed
    </button>
  );
}

function renderCartPanel() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerAuthProvider>
        <CartProvider>
          <Seed />
          <CartPanel />
        </CartProvider>
      </CustomerAuthProvider>
    </NextIntlClientProvider>
  );
}

function signedOut() {
  onAuthStateChangedMock.mockImplementation((_auth, callback) => {
    callback(null);
    return () => {};
  });
}

function signedInAsApprovedCustomer() {
  getDocMock.mockResolvedValue({ exists: () => true, data: () => ({ status: 'Goedgekeurd' }) });
  onAuthStateChangedMock.mockImplementation((_auth, callback) => {
    callback({ uid: 'uid-1', email: 'klant@example.com' });
    return () => {};
  });
}

beforeEach(() => {
  window.localStorage.clear();
  onAuthStateChangedMock.mockReset();
  getDocMock.mockReset();
  addDocMock.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true });
  signedInAsApprovedCustomer();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('CartPanel', () => {
  it('shows no badge when the cart is empty, and an empty message when opened', () => {
    renderCartPanel();
    expect(screen.queryByTestId('cart-badge')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('cart-icon'));
    expect(screen.getByTestId('cart-empty')).toBeInTheDocument();
  });

  it('shows a badge with the total quantity and lists cart items with materiaal/maat/price once seeded', () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    expect(screen.getByTestId('cart-badge')).toHaveTextContent('2');
    fireEvent.click(screen.getByTestId('cart-icon'));
    expect(screen.queryByTestId('cart-empty')).not.toBeInTheDocument();
    expect(screen.getByText('Wellness paneel')).toBeInTheDocument();
    expect(screen.getByText('4mm — Veiligheidsglas · 60×90 cm · ×2')).toBeInTheDocument();
  });

  it('shows the total price of all cart items', () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    expect(screen.getByTestId('cart-total')).toHaveTextContent('€ 300,00');
  });

  it('shows a watermark overlay on each cart item photo', () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    expect(screen.getByTestId('watermark-overlay')).toBeInTheDocument();
  });

  it('removes an item when its remove button is clicked', () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    const removeButtons = screen.getAllByLabelText('Verwijderen');
    fireEvent.click(removeButtons[0]);
    expect(screen.getByTestId('cart-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('cart-badge')).not.toBeInTheDocument();
  });

  it('shows a login link instead of the place-order button when not logged in', async () => {
    signedOut();
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-login-to-order')).toBeInTheDocument());
    expect(screen.getByTestId('cart-login-to-order')).toHaveAttribute('href', '/inloggen');
    expect(screen.queryByTestId('cart-place-order')).not.toBeInTheDocument();
  });

  it('writes a bestelheader + one bestelline with the real kunstwerk/materiaal/maat/prijs per cart item, clears the cart and shows a confirmation message', async () => {
    addDocMock.mockResolvedValueOnce({ id: 'header-1' }).mockResolvedValue({ id: 'line-1' });
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));

    expect(await screen.findByTestId('cart-order-confirmation')).toHaveTextContent(
      'Uw bestelling is door ons ontvangen en zal zo spoedig mogelijk worden verwerkt.'
    );
    expect(screen.getByTestId('cart-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('cart-badge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cart-place-order')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cart-clear')).not.toBeInTheDocument();

    expect(addDocMock).toHaveBeenNthCalledWith(
      1,
      { path: ['bestelheaders'] },
      { klantId: 'uid-1', besteldatum: 'SERVER_TIMESTAMP', status: 'Te beoordelen' }
    );
    expect(addDocMock).toHaveBeenNthCalledWith(
      2,
      { path: ['bestelheaders', 'header-1', 'bestellines'] },
      { kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }
    );
  });

  it('sends a confirmation email via fetch when the order succeeds and mail env vars are set', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAIL_ENDPOINT_URL', 'https://example.com/mail.php');
    vi.stubEnv('NEXT_PUBLIC_MAIL_SECRET', 'test-secret');
    addDocMock.mockResolvedValueOnce({ id: 'header-1' }).mockResolvedValue({ id: 'line-1' });
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));

    await screen.findByTestId('cart-order-confirmation');
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('https://example.com/mail.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: 'test-secret',
          to: 'klant@example.com',
          subject: 'Bevestiging van uw bestelling — Glassart & Design',
          body: 'Uw bestelling is door ons ontvangen en zal zo spoedig mogelijk worden verwerkt.',
        }),
      })
    );
  });

  it('does not call fetch when the mail endpoint/secret env vars are not set', async () => {
    addDocMock.mockResolvedValueOnce({ id: 'header-1' }).mockResolvedValue({ id: 'line-1' });
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));

    await screen.findByTestId('cart-order-confirmation');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still shows the order confirmation even if sending the email fails', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAIL_ENDPOINT_URL', 'https://example.com/mail.php');
    vi.stubEnv('NEXT_PUBLIC_MAIL_SECRET', 'test-secret');
    fetchMock.mockRejectedValue(new Error('network error'));
    addDocMock.mockResolvedValueOnce({ id: 'header-1' }).mockResolvedValue({ id: 'line-1' });
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));

    expect(await screen.findByTestId('cart-order-confirmation')).toBeInTheDocument();
  });

  it('clears the confirmation message once the panel is closed and reopened', async () => {
    addDocMock.mockResolvedValueOnce({ id: 'header-1' }).mockResolvedValue({ id: 'line-1' });
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));
    expect(await screen.findByTestId('cart-order-confirmation')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('cart-close'));
    fireEvent.click(screen.getByTestId('cart-icon'));

    expect(screen.queryByTestId('cart-order-confirmation')).not.toBeInTheDocument();
    expect(screen.getByTestId('cart-empty')).toBeInTheDocument();
  });

  it('shows an error and keeps the cart intact when the Firestore write fails', async () => {
    addDocMock.mockRejectedValue(new Error('permission-denied'));
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));

    expect(await screen.findByTestId('cart-place-order-error')).toHaveTextContent(
      'Er ging iets mis bij het plaatsen van de bestelling. Probeer het opnieuw.'
    );
    expect(screen.getByTestId('cart-panel')).toBeInTheDocument();
    expect(screen.getByTestId('cart-badge')).toHaveTextContent('2');
  });

  it('disables the place-order button when the cart is empty', async () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).toBeInTheDocument());
    expect(screen.getByTestId('cart-place-order')).toBeDisabled();
  });

  it('closes the panel when Escape is pressed', () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('cart-icon'));
    expect(screen.getByTestId('cart-panel')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('cart-panel')).not.toBeInTheDocument();
  });

  it('closes the panel when the backdrop is clicked', () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('cart-icon'));
    fireEvent.click(screen.getByTestId('cart-backdrop'));
    expect(screen.queryByTestId('cart-panel')).not.toBeInTheDocument();
  });

  it('empties the cart via "Bestelling leegmaken" without writing an order, and keeps the panel open', () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    fireEvent.click(screen.getByTestId('cart-clear'));

    expect(screen.getByTestId('cart-panel')).toBeInTheDocument();
    expect(screen.getByTestId('cart-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('cart-badge')).not.toBeInTheDocument();
    expect(addDocMock).not.toHaveBeenCalled();
  });

  it('disables "Bestelling leegmaken" when the cart is empty', () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('cart-icon'));
    expect(screen.getByTestId('cart-clear')).toBeDisabled();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/components/CartPanel.test.tsx`
Expected: FAIL — component still reads `item.imageSrc`/`item.segmentMessageKey`/`item.size`, writes `null` ids to `bestellines`, has no `cart-total`.

- [ ] **Step 4: Implement the component**

Replace `src/components/CartPanel.tsx` entirely with:
```tsx
'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCart } from '@/lib/useCart';
import { useCustomerAuth } from '@/lib/useCustomerAuth';
import { useOverlayDismiss } from '@/lib/useOverlayDismiss';
import { formatCurrency } from '@/data/mockAdminInvoices';
import { WatermarkedImage } from './WatermarkedImage';
import { Link } from '@/i18n/navigation';

export function CartPanel() {
  const t = useTranslations('cart');
  const [isOpen, setIsOpen] = useState(false);
  const [placeOrderError, setPlaceOrderError] = useState<string | null>(null);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const { items, isHydrated, totalQuantity, totalPrice, removeItem, clear } = useCart();
  const { user, isCustomer } = useCustomerAuth();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  function handleClose() {
    setIsOpen(false);
    setOrderPlaced(false);
  }

  useOverlayDismiss({
    isOpen,
    onClose: handleClose,
    containerRef: panelRef,
    initialFocusRef: closeButtonRef,
  });

  async function handlePlaceOrder() {
    if (!user) {
      return;
    }
    setPlaceOrderError(null);
    try {
      const headerDoc = await addDoc(collection(db, 'bestelheaders'), {
        klantId: user.uid,
        besteldatum: serverTimestamp(),
        status: 'Te beoordelen',
      });
      await Promise.all(
        items.map((item) =>
          addDoc(collection(db, 'bestelheaders', headerDoc.id, 'bestellines'), {
            kunstwerkId: item.kunstwerkId,
            maatId: item.maatId,
            materiaalId: item.materiaalId,
            prijs: item.prijs,
            quantity: item.quantity,
          })
        )
      );
      clear();
      setOrderPlaced(true);
      if (user.email) {
        void sendConfirmationEmail(user.email);
      }
    } catch {
      setPlaceOrderError(t('placeOrderError'));
    }
  }

  async function sendConfirmationEmail(email: string) {
    const endpoint = process.env.NEXT_PUBLIC_MAIL_ENDPOINT_URL;
    const secret = process.env.NEXT_PUBLIC_MAIL_SECRET;
    if (!endpoint || !secret) {
      return;
    }
    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret,
          to: email,
          subject: t('orderEmailSubject'),
          body: t('orderConfirmation'),
        }),
      });
    } catch {
      // Best-effort only -- the order itself already succeeded via Firestore.
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        data-testid="cart-icon"
        aria-label={t('title')}
        onClick={() => setIsOpen((open) => !open)}
        className="relative flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white/80 hover:text-white"
      >
        <span aria-hidden="true">🛒</span>
        {isHydrated && totalQuantity > 0 && (
          <span
            data-testid="cart-badge"
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-silver px-1 text-[0.6rem] font-semibold text-ink"
          >
            {totalQuantity}
          </span>
        )}
      </button>

      {isOpen &&
        createPortal(
          <>
            <div
              data-testid="cart-backdrop"
              onClick={handleClose}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            />
            <div
              ref={panelRef}
              data-testid="cart-panel"
              role="dialog"
              aria-modal="true"
              className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-[400px] flex-col border-l border-white/10 bg-charcoal"
            >
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <p className="font-head text-[0.65rem] uppercase tracking-[0.2em] text-white/50">
                  {t('title')}
                </p>
                <button
                  ref={closeButtonRef}
                  type="button"
                  data-testid="cart-close"
                  aria-label={t('close')}
                  onClick={handleClose}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 hover:text-white"
                >
                  ×
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                {orderPlaced ? (
                  <p data-testid="cart-order-confirmation" className="text-center text-xs text-white/80">
                    {t('orderConfirmation')}
                  </p>
                ) : items.length === 0 ? (
                  <p data-testid="cart-empty" className="text-center text-xs text-white/60">
                    {t('empty')}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {items.map((item) => (
                      <li
                        key={item.id}
                        data-testid={`cart-item-${item.id}`}
                        className="flex gap-3 rounded-md border border-white/10 bg-graphite/60 p-3 text-xs text-white/80"
                      >
                        <WatermarkedImage src={item.foto} alt="" className="h-12 w-12 rounded" />
                        <div className="flex-1">
                          <p>{item.omschrijving}</p>
                          <p className="text-white/50">
                            {item.materiaalLabel} · {item.maatLabel} · ×{item.quantity}
                          </p>
                          <p className="text-white/50">{formatCurrency(item.prijs * item.quantity)}</p>
                        </div>
                        <button
                          type="button"
                          data-testid={`cart-item-remove-${item.id}`}
                          onClick={() => removeItem(item.id)}
                          aria-label={t('remove')}
                          className="text-white/50 hover:text-white"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {!orderPlaced && (
                <div className="flex flex-col gap-2 border-t border-white/10 px-5 py-4">
                  {items.length > 0 && (
                    <p data-testid="cart-total" className="flex justify-between text-sm text-white/80">
                      <span>{t('total')}</span>
                      <span>{formatCurrency(totalPrice)}</span>
                    </p>
                  )}
                  {isCustomer ? (
                    <button
                      type="button"
                      data-testid="cart-place-order"
                      disabled={items.length === 0}
                      onClick={handlePlaceOrder}
                      className="btn-gold w-full rounded-sm px-3 py-2.5 text-center text-xs font-head tracking-wide disabled:opacity-40"
                    >
                      {t('placeOrder')}
                    </button>
                  ) : (
                    <Link
                      href="/inloggen"
                      data-testid="cart-login-to-order"
                      className="btn-gold block w-full rounded-sm px-3 py-2.5 text-center text-xs font-head tracking-wide"
                    >
                      {t('loginToOrder')}
                    </Link>
                  )}
                  {placeOrderError && (
                    <p data-testid="cart-place-order-error" className="text-center text-xs text-red-400">
                      {placeOrderError}
                    </p>
                  )}
                  <button
                    type="button"
                    data-testid="cart-clear"
                    disabled={items.length === 0}
                    onClick={clear}
                    className="text-xs text-white/50 transition hover:text-red-400 disabled:opacity-40"
                  >
                    {t('clearOrder')}
                  </button>
                </div>
              )}
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/components/CartPanel.test.tsx`
Expected: PASS (17 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/CartPanel.tsx tests/components/CartPanel.test.tsx messages/nl.json
git commit -m "feat: show materiaal/maat/price in cart and write real ids to bestellijnen"
```

---

### Task 8: Admin — resolve kunstwerk/materiaal/maat in the order-detail screen

**Files:**
- Modify: `src/components/beheer/BestellingenSection.tsx`
- Modify: `src/components/beheer/BestellingModal.tsx`
- Modify: `src/components/beheer/BeheerShell.tsx`
- Modify: `tests/components/beheer/BestellingenSection.test.tsx`
- Modify: `tests/components/beheer/BestellingModal.test.tsx`
- Modify: `tests/components/beheer/BeheerShell.test.tsx`

**Interfaces:**
- Consumes: `Kunstwerk`, `Materiaal`, `Maat` from `@/components/beheer/materiaalTypes` (existing, Deel 1); `formatCurrency` from `@/data/mockAdminInvoices` (existing).
- Produces: nothing consumed by later tasks — this is the final task in this plan.

**Design note:** `BeheerShell` already fetches `kunstwerken`/`materialen`/`maten` for the Kunstwerken CRUD tab (Deel 1) — this task only threads that already-fetched data down into `BestellingenSection` → `BestellingModal`, no new Firestore fetch. Admin stays watermark-free (per the plan's global constraints) — `BestellingModal` renders the kunstwerk photo directly with a plain `<img>`, not `WatermarkedImage`. If a bestelregel's `kunstwerkId` doesn't match any kunstwerk in the fetched list (deleted kunstwerk, or a legacy pre-Deel-2 order line with `kunstwerkId: null`), the line falls back to the existing `bestellingenRegelOnbekend` label — same behavior as today, just now also covering the "kunstwerk was deleted after ordering" case, not just the "always null" case.

- [ ] **Step 1: Write the failing tests**

Replace `tests/components/beheer/BestellingModal.test.tsx` entirely with:
```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BestellingModal } from '@/components/beheer/BestellingModal';
import type { Bestelling } from '@/components/beheer/BestellingenSection';
import type { Kunstwerk, Materiaal, Maat } from '@/components/beheer/materiaalTypes';
import messages from '../../../messages/nl.json';

const updateDocMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
}));

const KUNSTWERKEN: Kunstwerk[] = [
  {
    id: 'kw-1',
    foto: 'https://example.com/kw-1.jpg',
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
const MATERIALEN: Materiaal[] = [
  { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'Veiligheidsglas' },
];
const MATEN: Maat[] = [{ id: 'maat-1', breedte: 40, hoogte: 60 }];

const BESTELLING: Bestelling = {
  id: 'header-1',
  klantId: 'uid-1',
  companyName: 'Testbedrijf BV',
  besteldatum: '1-7-2026',
  status: 'Te beoordelen',
  lineCount: 2,
  totalQuantity: 5,
  lines: [
    { id: 'line-1', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 3 },
    { id: 'line-2', kunstwerkId: null, maatId: null, materiaalId: null, prijs: 0, quantity: 2 },
  ],
};

function renderModal(bestelling: Bestelling | null) {
  const onClose = vi.fn();
  const onUpdated = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <BestellingModal
        bestelling={bestelling}
        kunstwerken={KUNSTWERKEN}
        materialen={MATERIALEN}
        maten={MATEN}
        onClose={onClose}
        onUpdated={onUpdated}
      />
    </NextIntlClientProvider>
  );
  return { onClose, onUpdated };
}

beforeEach(() => {
  updateDocMock.mockReset();
});

describe('BestellingModal', () => {
  it('renders nothing when bestelling is null', () => {
    renderModal(null);
    expect(screen.queryByTestId('bestelling-modal')).not.toBeInTheDocument();
  });

  it('shows the resolved kunstwerk photo, description, materiaal/maat labels and price for a known line', () => {
    renderModal(BESTELLING);
    const line1 = screen.getByTestId('bestelling-modal-line-line-1');
    expect(line1).toHaveTextContent('Hotel paneel');
    expect(line1).toHaveTextContent('4mm — Veiligheidsglas');
    expect(line1).toHaveTextContent('40×60 cm');
    expect(line1).toHaveTextContent('€ 150,00');
    expect(line1).toHaveTextContent('×3');
    expect(line1.querySelector('img')).toHaveAttribute('src', 'https://example.com/kw-1.jpg');
  });

  it('falls back to the "onbekend" label for a line whose kunstwerkId does not match any known kunstwerk', () => {
    renderModal(BESTELLING);
    const line2 = screen.getByTestId('bestelling-modal-line-line-2');
    expect(line2).toHaveTextContent('Onbekend');
    expect(line2).toHaveTextContent('×2');
    expect(line2.querySelector('img')).not.toBeInTheDocument();
  });

  it('approves the bestelling and calls onUpdated with status Goedgekeurd', async () => {
    updateDocMock.mockResolvedValue(undefined);
    const { onUpdated } = renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-goedkeuren'));

    await waitFor(() =>
      expect(updateDocMock).toHaveBeenCalledWith(
        { collectionName: 'bestelheaders', id: 'header-1' },
        { status: 'Goedgekeurd' }
      )
    );
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ ...BESTELLING, status: 'Goedgekeurd' }));
  });

  it('rejects the bestelling and calls onUpdated with status Afgewezen', async () => {
    updateDocMock.mockResolvedValue(undefined);
    const { onUpdated } = renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen'));

    await waitFor(() =>
      expect(updateDocMock).toHaveBeenCalledWith(
        { collectionName: 'bestelheaders', id: 'header-1' },
        { status: 'Afgewezen' }
      )
    );
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ ...BESTELLING, status: 'Afgewezen' }));
  });

  it('shows an error and does not call onUpdated when updateDoc fails', async () => {
    updateDocMock.mockRejectedValue(new Error('offline'));
    const { onUpdated } = renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen'));

    expect(await screen.findByTestId('bestelling-modal-error')).toBeInTheDocument();
    expect(onUpdated).not.toHaveBeenCalled();
  });
});
```

Replace `tests/components/beheer/BestellingenSection.test.tsx` entirely with:
```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BestellingenSection, type Bestelling } from '@/components/beheer/BestellingenSection';
import type { Kunstwerk, Materiaal, Maat } from '@/components/beheer/materiaalTypes';
import messages from '../../../messages/nl.json';

const updateDocMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
}));

const KUNSTWERKEN: Kunstwerk[] = [
  {
    id: 'kw-1',
    foto: 'https://example.com/kw-1.jpg',
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
const MATERIALEN: Materiaal[] = [
  { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'Veiligheidsglas' },
];
const MATEN: Maat[] = [{ id: 'maat-1', breedte: 40, hoogte: 60 }];

const BESTELLINGEN: Bestelling[] = [
  {
    id: 'header-1',
    klantId: 'uid-1',
    companyName: 'Testbedrijf BV',
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
    besteldatum: '2-7-2026',
    status: 'Goedgekeurd',
    lineCount: 1,
    totalQuantity: 1,
    lines: [{ id: 'line-2', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
  },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof BestellingenSection>> = {}) {
  const onBestellingUpdated = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <BestellingenSection
        bestellingen={BESTELLINGEN}
        kunstwerken={KUNSTWERKEN}
        materialen={MATERIALEN}
        maten={MATEN}
        loadError={null}
        onBestellingUpdated={onBestellingUpdated}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  return { onBestellingUpdated };
}

beforeEach(() => {
  updateDocMock.mockReset();
});

describe('BestellingenSection', () => {
  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('bestellingen-error')).toHaveTextContent('Kon niet laden.');
    expect(screen.queryByTestId('data-table')).not.toBeInTheDocument();
  });

  it('renders nothing while bestellingen is null and there is no error', () => {
    renderSection({ bestellingen: null });
    expect(screen.queryByTestId('bestellingen-section')).not.toBeInTheDocument();
  });

  it('shows only the "Te beoordelen" bestelling by default (status filter defaults to Te beoordelen)', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-header-1')).toBeInTheDocument();
    expect(screen.queryByTestId('data-table-row-header-2')).not.toBeInTheDocument();
  });

  it('shows all bestellingen when the status filter is cleared', () => {
    renderSection();
    fireEvent.change(screen.getByTestId('data-table-filter-status'), { target: { value: '' } });
    expect(screen.getByTestId('data-table-row-header-1')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-header-2')).toBeInTheDocument();
  });

  it("opens the BestellingModal with the clicked bestelling's resolved kunstwerk data when a row is clicked", () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-header-1'));
    expect(screen.getByTestId('bestelling-modal')).toHaveTextContent('Testbedrijf BV');
    expect(screen.getByTestId('bestelling-modal')).toHaveTextContent('Hotel paneel');
  });

  it('closes the modal and reports the updated bestelling via onBestellingUpdated after approving', async () => {
    updateDocMock.mockResolvedValue(undefined);
    const { onBestellingUpdated } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-header-1'));
    fireEvent.click(screen.getByTestId('bestelling-modal-goedkeuren'));

    await waitFor(() =>
      expect(onBestellingUpdated).toHaveBeenCalledWith({ ...BESTELLINGEN[0], status: 'Goedgekeurd' })
    );
    await waitFor(() => expect(screen.queryByTestId('bestelling-modal')).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx tests/components/beheer/BestellingenSection.test.tsx`
Expected: FAIL — `BestellingLine` has no `prijs` field yet, `BestellingModal`/`BestellingenSection` don't accept `kunstwerken`/`materialen`/`maten` props.

- [ ] **Step 3: Update `BestellingenSection.tsx`**

Replace `src/components/beheer/BestellingenSection.tsx` entirely with:
```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { BestellingModal } from './BestellingModal';
import type { Kunstwerk, Materiaal, Maat } from './materiaalTypes';

export interface BestellingLine {
  id: string;
  kunstwerkId: string | null;
  maatId: string | null;
  materiaalId: string | null;
  prijs: number;
  quantity: number;
}

export interface Bestelling {
  id: string;
  klantId: string;
  companyName: string;
  besteldatum: string;
  status: 'Te beoordelen' | 'Goedgekeurd' | 'Afgewezen';
  lineCount: number;
  totalQuantity: number;
  lines: BestellingLine[];
}

interface BestellingenSectionProps {
  bestellingen: Bestelling[] | null;
  kunstwerken: Kunstwerk[] | null;
  materialen: Materiaal[] | null;
  maten: Maat[] | null;
  loadError: string | null;
  onBestellingUpdated: (bestelling: Bestelling) => void;
}

export function BestellingenSection({
  bestellingen,
  kunstwerken,
  materialen,
  maten,
  loadError,
  onBestellingUpdated,
}: BestellingenSectionProps) {
  const t = useTranslations('beheer');
  const [selectedBestelling, setSelectedBestelling] = useState<Bestelling | null>(null);

  if (loadError) {
    return (
      <p data-testid="bestellingen-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (bestellingen === null) {
    return null;
  }

  const columns: Column<Bestelling>[] = [
    { key: 'companyName', label: t('bestellingenColKlant'), filterType: 'text' },
    { key: 'besteldatum', label: t('bestellingenColDatum'), filterType: 'text' },
    {
      key: 'lineCount',
      label: t('bestellingenColAantal'),
      filterType: 'text',
      render: (row) => `${row.lineCount} / ${row.totalQuantity}`,
    },
    {
      key: 'status',
      label: t('bestellingenColStatus'),
      filterType: 'select',
      filterOptions: ['Te beoordelen', 'Goedgekeurd', 'Afgewezen'],
    },
  ];

  return (
    <div data-testid="bestellingen-section">
      <DataTable<Bestelling>
        columns={columns}
        rows={bestellingen}
        getRowId={(row) => row.id}
        onRowClick={setSelectedBestelling}
        defaultFilters={{ status: 'Te beoordelen' }}
        emptyLabel={t('bestellingenEmpty')}
      />
      <BestellingModal
        bestelling={selectedBestelling}
        kunstwerken={kunstwerken}
        materialen={materialen}
        maten={maten}
        onClose={() => setSelectedBestelling(null)}
        onUpdated={(updated) => {
          onBestellingUpdated(updated);
          setSelectedBestelling(null);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Update `BestellingModal.tsx`**

Replace `src/components/beheer/BestellingModal.tsx` entirely with:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Modal } from '@/components/Modal';
import { formatCurrency } from '@/data/mockAdminInvoices';
import type { Bestelling } from './BestellingenSection';
import type { Kunstwerk, Materiaal, Maat } from './materiaalTypes';

interface BestellingModalProps {
  bestelling: Bestelling | null;
  kunstwerken: Kunstwerk[] | null;
  materialen: Materiaal[] | null;
  maten: Maat[] | null;
  onClose: () => void;
  onUpdated: (bestelling: Bestelling) => void;
}

export function BestellingModal({
  bestelling,
  kunstwerken,
  materialen,
  maten,
  onClose,
  onUpdated,
}: BestellingModalProps) {
  const t = useTranslations('beheer');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (bestelling) {
      setError(null);
    }
  }, [bestelling]);

  async function handleGoedkeuren() {
    if (!bestelling) return;
    try {
      await updateDoc(doc(db, 'bestelheaders', bestelling.id), { status: 'Goedgekeurd' });
      onUpdated({ ...bestelling, status: 'Goedgekeurd' });
    } catch {
      setError(t('bestellingenActionError'));
    }
  }

  async function handleAfwijzen() {
    if (!bestelling) return;
    try {
      await updateDoc(doc(db, 'bestelheaders', bestelling.id), { status: 'Afgewezen' });
      onUpdated({ ...bestelling, status: 'Afgewezen' });
    } catch {
      setError(t('bestellingenActionError'));
    }
  }

  return (
    <Modal isOpen={bestelling !== null} onClose={onClose} closeLabel={t('modalClose')}>
      {bestelling && (
        <div data-testid="bestelling-modal" className="flex flex-col gap-3 text-sm text-white/80">
          <p>{bestelling.companyName}</p>
          <p className="text-white/60">{bestelling.besteldatum}</p>

          <ul className="flex flex-col gap-2 text-xs">
            {bestelling.lines.map((line) => {
              const kunstwerk = (kunstwerken ?? []).find((k) => k.id === line.kunstwerkId);
              const materiaal = (materialen ?? []).find((m) => m.id === line.materiaalId);
              const maat = (maten ?? []).find((m) => m.id === line.maatId);
              return (
                <li
                  key={line.id}
                  data-testid={`bestelling-modal-line-${line.id}`}
                  className="flex items-center justify-between gap-2"
                >
                  {kunstwerk ? (
                    <div className="flex items-center gap-2">
                      <img src={kunstwerk.foto} alt="" className="h-10 w-10 rounded object-cover" />
                      <div>
                        <p>{kunstwerk.omschrijvingNl}</p>
                        <p className="text-white/50">
                          {materiaal ? `${materiaal.materiaaldikte}mm — ${materiaal.omschrijving}` : line.materiaalId}
                          {' · '}
                          {maat ? `${maat.breedte}×${maat.hoogte} cm` : line.maatId}
                          {' · '}
                          {formatCurrency(line.prijs)}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <span>{t('bestellingenRegelOnbekend')}</span>
                  )}
                  <span>×{line.quantity}</span>
                </li>
              );
            })}
          </ul>

          {error && (
            <p data-testid="bestelling-modal-error" className="text-xs text-red-400">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleGoedkeuren}
              data-testid="bestelling-modal-goedkeuren"
              className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
            >
              {t('bestellingenGoedkeuren')}
            </button>
            <button
              type="button"
              onClick={handleAfwijzen}
              data-testid="bestelling-modal-afwijzen"
              className="rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
            >
              {t('bestellingenAfwijzen')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 5: Wire `BeheerShell.tsx` to pass the already-fetched data through**

In `src/components/beheer/BeheerShell.tsx`, find the `<BestellingenSection` usage (inside the `activeSection === 'bestellingen'` branch) and add the three new props, reusing the `kunstwerken`/`materialen`/`maten` hook results already present in the file for the Kunstwerken CRUD tab:
```tsx
          <BestellingenSection
            bestellingen={bestellingen}
            kunstwerken={kunstwerken.items}
            materialen={materialen.items}
            maten={maten.items}
            loadError={bestellingenLoadError}
            onBestellingUpdated={handleBestellingUpdated}
          />
```
No new hook calls, no new imports beyond what's already in the file — `kunstwerken`, `materialen`, `maten` are the existing `useFirestoreCollection` results already declared earlier in the component.

Also update `tests/components/beheer/BeheerShell.test.tsx`'s existing "shows the bestellingen count and switches to the Bestellingen section" test to assert the enriched line now shows resolved kunstwerk info. Find that test (added by the concurrent Bestellingen feature, seeds `bestelheaders`/`bestellines` with `kunstwerkId: null` in its `mockCollections` override) and change its `bestellines` fixture to reference a real kunstwerk from `DEFAULT_COLLECTIONS.kunstwerken` (`kw-1`, already defined earlier in that file for the Kunstwerken-tab test), then extend the assertion:
```tsx
  it('shows the bestellingen count and switches to the Bestellingen section', async () => {
    mockCollections({
      klanten: [{ id: 'uid-1', data: KLANT_DATA }],
      bestelheaders: [
        {
          id: 'header-1',
          data: {
            klantId: 'uid-1',
            besteldatum: { toDate: () => new Date('2026-07-01') },
            status: 'Te beoordelen',
          },
        },
      ],
      'bestelheaders/header-1/bestellines': [
        { id: 'line-1', data: { kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 3 } },
      ],
    });
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-bestellingen')).toHaveTextContent('1'));
    screen.getByTestId('beheer-nav-bestellingen').click();
    expect(await screen.findByTestId('bestellingen-section')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-header-1')).toHaveTextContent('Testbedrijf BV');
    fireEvent.click(screen.getByTestId('data-table-row-header-1'));
    expect(screen.getByTestId('bestelling-modal')).toHaveTextContent('Hotel paneel');
  });
```
(This reuses `DEFAULT_COLLECTIONS.kunstwerken`/`materialen`/`maten` fixtures already present in the file from Deel 1 — `kw-1` is linked to `materiaalId: 'mat-1'`/`maatId: 'maat-1'`, matching `DEFAULT_COLLECTIONS.materialen`/`maten`. Add `import { fireEvent } from '@testing-library/react'` to the test file's existing `@testing-library/react` import line if it isn't already imported there.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx tests/components/beheer/BestellingenSection.test.tsx tests/components/beheer/BeheerShell.test.tsx`
Expected: PASS (6 tests in `BestellingModal.test.tsx`, 6 tests in `BestellingenSection.test.tsx`, all `BeheerShell.test.tsx` tests including the updated one)

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: PASS — every test in the project, across both Deel 1 and Deel 2 changes, no regressions.

Run: `npx tsc --noEmit`
Expected: no output (clean)

- [ ] **Step 8: Commit**

```bash
git add src/components/beheer/BestellingenSection.tsx src/components/beheer/BestellingModal.tsx src/components/beheer/BeheerShell.tsx tests/components/beheer/BestellingenSection.test.tsx tests/components/beheer/BestellingModal.test.tsx tests/components/beheer/BeheerShell.test.tsx
git commit -m "feat: resolve kunstwerk/materiaal/maat/prijs in the admin order-detail screen"
```

---

## Manual verification (after Task 8)

Automated tests mock Firestore, so they cannot catch real Firestore-rule/config issues. After all tasks are done, manually verify in the browser:

1. Run `npm run dev`, open `/collecties`.
2. Confirm the filter buttons match the real `segmenten` collection (not the old hardcoded 6), and every photo shows the diagonal watermark.
3. Click a kunstwerk, pick a materiaal and maat, confirm the price updates, add to cart.
4. Open the homepage — confirm "Uitgelichte werken" shows 3 real, watermarked kunstwerken (refresh a few times to see the selection change).
5. Open the winkelmandje — confirm the item shows materiaal/maat/price and a running total, watermarked thumbnail.
6. Log in as an approved klant, place the order — confirm no Firestore permission error (this is the real end-to-end check of the loosened `firestore.rules` rule, which cannot be exercised by the mocked test suite).
7. Log in as beheerder, open Beheer → Bestellingen, open the just-placed order — confirm the photo/omschrijving/materiaal/maat/price show correctly, un-watermarked.
8. Confirm the same locale-fallback behavior visually: switch the site to French/German/English and check a kunstwerk with an empty `omschrijvingFr`/`De`/`En` falls back to the Dutch text.
