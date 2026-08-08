# Winkelmandje Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 18-07-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mock shopping cart — add-to-cart with size/quantity on every product card, a cart icon+panel in the nav, and a "place order" action that creates a new mock order (status "Aangevraagd") which shows up in the existing "Mijn bestellingen" list alongside the 4 seed examples.

**Architecture:** Two new React Contexts follow the exact pattern already established by `MockAuthProvider`/`useMockAuth`: `CartProvider`/`useCart` (cart line items, `localStorage`-backed) and `OrdersProvider`/`useOrders` (newly placed orders, `localStorage`-backed, separate from the 4 static `MOCK_ORDERS` seed examples which stay as plain constants). Both providers wrap the app in `src/app/[locale]/layout.tsx`, alongside the existing `MockAuthProvider`. `AddToCartButton` is a small client component rendered inside each `ProductsGrid` product-card (which is already `position: relative`), showing a hover-revealed "add to cart" button that expands into a size + quantity mini-form. `CartPanel` (icon + badge + dropdown) sits in `NavBar` next to `AccountMenu`/`LanguageSwitcher`. Placing an order composes a description from the current cart (using the segment title translations already available via `next-intl`), stores it via `useOrders().placeOrder(...)`, and clears the cart. `AccountMenu` is updated to render the combined list: newly placed orders (newest first) followed by the 4 seed `MOCK_ORDERS`.

**Tech Stack:** Same as the existing project — Next.js 14 (App Router) + TypeScript, Tailwind CSS, next-intl v3, Vitest + React Testing Library.

## Global Constraints

- No backend, no real order processing — everything is `localStorage`-backed mock data, consistent with `useMockAuth`/`MOCK_ORDERS`.
- Standard sizes, fixed list: `40x60cm`, `60x90cm`, `80x120cm`.
- Adding the same artwork (same segment + same image + same size) again increases that line's quantity instead of creating a duplicate line.
- Add-to-cart is only available on `ProductsGrid`'s product cards (the real segment sfeerbeelden) — NOT on the homepage's "Uitgelichte werken" placeholders.
- Placing an order does NOT require being logged in (`useMockAuth`) — the two features (mock login and cart) are independent.
- A placed order's description/status text is fixed at the moment of placing (in whatever locale was active then) — it is NOT re-translated if the visitor later switches language. This mirrors how `MOCK_ORDERS`' hardcoded example data already works structurally, just via plain stored strings instead of translation keys for the dynamic ones.
- New order IDs must not collide with the 4 seed IDs (`GD-10234`, `GD-10221`, `GD-10198`, `GD-10177`) or with each other — use a random 5-digit suffix in the same `GD-XXXXX` shape.

---

## File Structure Overview

```
messages/{nl,en,de,fr}.json        (MODIFY — add `cart` translation keys)
src/data/sizes.ts                   (CREATE)
src/lib/useCart.tsx                 (CREATE — CartProvider/useCart, mirrors useMockAuth.tsx)
src/lib/useOrders.tsx               (CREATE — OrdersProvider/useOrders)
src/components/AddToCartButton.tsx  (CREATE)
src/components/CartPanel.tsx        (CREATE)
src/components/ProductsGrid.tsx     (MODIFY — render AddToCartButton per card)
src/components/NavBar.tsx           (MODIFY — render CartPanel)
src/components/AccountMenu.tsx      (MODIFY — merge placed orders + seed orders)
src/app/[locale]/layout.tsx         (MODIFY — wrap in CartProvider + OrdersProvider)
tests/data/sizes.test.ts            (CREATE)
tests/lib/useCart.test.ts           (CREATE)
tests/lib/useOrders.test.ts         (CREATE)
tests/components/AddToCartButton.test.tsx  (CREATE)
tests/components/CartPanel.test.tsx        (CREATE)
tests/components/ProductsGrid.test.tsx     (MODIFY — wrap in CartProvider, assert add-to-cart buttons present)
tests/components/NavBar.test.tsx           (MODIFY — mock CartPanel like AccountMenu is mocked)
tests/components/NavBarAccountMenuIntegration.test.tsx (MODIFY — mock CartPanel, wrap AccountMenu render in OrdersProvider)
tests/components/AccountMenu.test.tsx      (MODIFY — wrap in OrdersProvider, assert merged list)
```

---

### Task 1: Sizes data and cart translation keys

**Files:**
- Create: `src/data/sizes.ts`
- Create: `tests/data/sizes.test.ts`
- Modify: `messages/nl.json`
- Modify: `messages/en.json`
- Modify: `messages/de.json`
- Modify: `messages/fr.json`

**Interfaces:**
- Produces: `STANDARD_SIZES: readonly string[]` from `@/data/sizes` — used by Tasks 4 (`AddToCartButton`).
- Produces: message keys `cart.{title,addToCart,size,quantity,confirm,empty,placeOrder,remove,requestedStatus}` — used by Tasks 4, 5, 8.

- [ ] **Step 1: Write the failing test**

Create `tests/data/sizes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { STANDARD_SIZES } from '@/data/sizes';

describe('STANDARD_SIZES', () => {
  it('contains exactly the 3 standard sizes in order', () => {
    expect(STANDARD_SIZES).toEqual(['40x60cm', '60x90cm', '80x120cm']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- sizes`
Expected: FAIL — `Cannot find module '@/data/sizes'`.

- [ ] **Step 3: Create `src/data/sizes.ts`**

```ts
export const STANDARD_SIZES = ['40x60cm', '60x90cm', '80x120cm'] as const;

export type StandardSize = (typeof STANDARD_SIZES)[number];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- sizes`
Expected: PASS — 1 test passed.

- [ ] **Step 5: Add `cart` keys to `messages/nl.json`**

Add this new top-level key (after `orders`, before the closing `}`):

```json
  "cart": {
    "title": "Mandje",
    "addToCart": "Toevoegen aan mandje",
    "size": "Maat",
    "quantity": "Aantal",
    "confirm": "Toevoegen",
    "empty": "Je mandje is leeg.",
    "placeOrder": "Toevoegen aan bestelling",
    "remove": "Verwijderen",
    "requestedStatus": "Aangevraagd"
  }
```

- [ ] **Step 6: Add `cart` keys to `messages/en.json`**

```json
  "cart": {
    "title": "Cart",
    "addToCart": "Add to cart",
    "size": "Size",
    "quantity": "Quantity",
    "confirm": "Add",
    "empty": "Your cart is empty.",
    "placeOrder": "Add to order",
    "remove": "Remove",
    "requestedStatus": "Requested"
  }
```

- [ ] **Step 7: Add `cart` keys to `messages/de.json`**

```json
  "cart": {
    "title": "Warenkorb",
    "addToCart": "In den Warenkorb",
    "size": "Größe",
    "quantity": "Anzahl",
    "confirm": "Hinzufügen",
    "empty": "Ihr Warenkorb ist leer.",
    "placeOrder": "Zur Bestellung hinzufügen",
    "remove": "Entfernen",
    "requestedStatus": "Angefragt"
  }
```

- [ ] **Step 8: Add `cart` keys to `messages/fr.json`**

```json
  "cart": {
    "title": "Panier",
    "addToCart": "Ajouter au panier",
    "size": "Taille",
    "quantity": "Quantité",
    "confirm": "Ajouter",
    "empty": "Votre panier est vide.",
    "placeOrder": "Ajouter à la commande",
    "remove": "Supprimer",
    "requestedStatus": "Demandée"
  }
```

- [ ] **Step 9: Verify all 4 files are valid JSON with identical key structure**

Run: `node -e "const fs=require('fs'); const locales=['nl','en','de','fr']; const keys = locales.map(l => JSON.stringify(Object.keys(JSON.parse(fs.readFileSync('messages/'+l+'.json'))).sort())); console.log(keys.every(k => k === keys[0]) ? 'MATCH' : 'MISMATCH: ' + keys.join(' | '))"`
Expected: `MATCH`

- [ ] **Step 10: Commit**

```bash
git add src/data/sizes.ts tests/data/sizes.test.ts messages/nl.json messages/en.json messages/de.json messages/fr.json
git commit -m "feat: add standard sizes data and cart translation keys"
```

---

### Task 2: CartProvider / useCart

**Files:**
- Create: `src/lib/useCart.tsx`
- Create: `tests/lib/useCart.test.ts`

**Interfaces:**
- Produces: `CartItem = { id: string; segmentSlug: string; segmentMessageKey: string; imageSrc: string; size: string; quantity: number }`, `CartProvider`, `useCart(): { items: CartItem[]; isHydrated: boolean; totalQuantity: number; addItem: (input: Omit<CartItem, 'id'>) => void; removeItem: (id: string) => void; clear: () => void }` from `@/lib/useCart` — used by Tasks 4, 5, 6.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/useCart.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { CartProvider, useCart } from '@/lib/useCart';

beforeEach(() => {
  window.localStorage.clear();
});

describe('useCart', () => {
  it('starts empty and hydrated after mount', () => {
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    expect(result.current.isHydrated).toBe(true);
    expect(result.current.items).toEqual([]);
    expect(result.current.totalQuantity).toBe(0);
  });

  it('adds a new item and persists it to localStorage', () => {
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    act(() => {
      result.current.addItem({
        segmentSlug: 'wellness',
        segmentMessageKey: 'wellness',
        imageSrc: 'https://images.unsplash.com/example.jpg',
        size: '60x90cm',
        quantity: 2,
      });
    });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.totalQuantity).toBe(2);
    const stored = JSON.parse(window.localStorage.getItem('glassart-cart') ?? '[]');
    expect(stored).toHaveLength(1);
  });

  it('increases quantity instead of duplicating when the same segment+image+size is added again', () => {
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    const input = {
      segmentSlug: 'wellness',
      segmentMessageKey: 'wellness',
      imageSrc: 'https://images.unsplash.com/example.jpg',
      size: '60x90cm',
      quantity: 1,
    };
    act(() => {
      result.current.addItem(input);
    });
    act(() => {
      result.current.addItem(input);
    });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].quantity).toBe(2);
  });

  it('removes an item by id', () => {
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    act(() => {
      result.current.addItem({
        segmentSlug: 'hotel',
        segmentMessageKey: 'hotel',
        imageSrc: 'https://images.unsplash.com/example2.jpg',
        size: '40x60cm',
        quantity: 1,
      });
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
      result.current.addItem({
        segmentSlug: 'hotel',
        segmentMessageKey: 'hotel',
        imageSrc: 'https://images.unsplash.com/example2.jpg',
        size: '40x60cm',
        quantity: 1,
      });
    });
    act(() => {
      result.current.clear();
    });
    expect(result.current.items).toEqual([]);
    expect(window.localStorage.getItem('glassart-cart')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- useCart`
Expected: FAIL — `Cannot find module '@/lib/useCart'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/useCart.tsx`:

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
  segmentSlug: string;
  segmentMessageKey: string;
  imageSrc: string;
  size: string;
  quantity: number;
}

type AddItemInput = Omit<CartItem, 'id'>;

interface CartValue {
  items: CartItem[];
  isHydrated: boolean;
  totalQuantity: number;
  addItem: (input: AddItemInput) => void;
  removeItem: (id: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartValue | null>(null);

function makeItemId(segmentSlug: string, imageSrc: string, size: string): string {
  return `${segmentSlug}__${imageSrc}__${size}`;
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
      const id = makeItemId(input.segmentSlug, input.imageSrc, input.size);
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

  const value = useMemo(
    () => ({ items, isHydrated, totalQuantity, addItem, removeItem, clear }),
    [items, isHydrated, totalQuantity, addItem, removeItem, clear]
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- useCart`
Expected: PASS — 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/useCart.tsx tests/lib/useCart.test.ts
git commit -m "feat: add CartProvider/useCart localStorage-backed cart state"
```

---

### Task 3: OrdersProvider / useOrders

**Files:**
- Create: `src/lib/useOrders.tsx`
- Create: `tests/lib/useOrders.test.ts`

**Interfaces:**
- Produces: `PlacedOrder = { id: string; date: string; description: string; status: string }`, `OrdersProvider`, `useOrders(): { placedOrders: PlacedOrder[]; isHydrated: boolean; placeOrder: (description: string, status: string) => void }` from `@/lib/useOrders` — used by Tasks 5, 6, 8.
- Consumes: nothing from `@/data/mockOrders` — the 4 seed orders stay a separate, unmanaged constant; this hook only manages newly-placed orders.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/useOrders.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { OrdersProvider, useOrders } from '@/lib/useOrders';

beforeEach(() => {
  window.localStorage.clear();
});

describe('useOrders', () => {
  it('starts with no placed orders, hydrated after mount', () => {
    const { result } = renderHook(() => useOrders(), { wrapper: OrdersProvider });
    expect(result.current.isHydrated).toBe(true);
    expect(result.current.placedOrders).toEqual([]);
  });

  it('places a new order with a generated GD-XXXXX id and persists it', () => {
    const { result } = renderHook(() => useOrders(), { wrapper: OrdersProvider });
    act(() => {
      result.current.placeOrder('Wellness paneel 60x90cm ×2', 'Aangevraagd');
    });
    expect(result.current.placedOrders).toHaveLength(1);
    const [order] = result.current.placedOrders;
    expect(order.id).toMatch(/^GD-\d{5}$/);
    expect(order.description).toBe('Wellness paneel 60x90cm ×2');
    expect(order.status).toBe('Aangevraagd');
    expect(order.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const stored = JSON.parse(window.localStorage.getItem('glassart-placed-orders') ?? '[]');
    expect(stored).toHaveLength(1);
  });

  it('adds new orders to the front (newest first)', () => {
    const { result } = renderHook(() => useOrders(), { wrapper: OrdersProvider });
    act(() => {
      result.current.placeOrder('First order', 'Aangevraagd');
    });
    act(() => {
      result.current.placeOrder('Second order', 'Aangevraagd');
    });
    expect(result.current.placedOrders[0].description).toBe('Second order');
    expect(result.current.placedOrders[1].description).toBe('First order');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- useOrders`
Expected: FAIL — `Cannot find module '@/lib/useOrders'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/useOrders.tsx`:

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

const STORAGE_KEY = 'glassart-placed-orders';

export interface PlacedOrder {
  id: string;
  date: string;
  description: string;
  status: string;
}

interface OrdersValue {
  placedOrders: PlacedOrder[];
  isHydrated: boolean;
  placeOrder: (description: string, status: string) => void;
}

const OrdersContext = createContext<OrdersValue | null>(null);

function generateOrderId(): string {
  const suffix = Math.floor(10000 + Math.random() * 89999);
  return `GD-${suffix}`;
}

export function OrdersProvider({ children }: { children: ReactNode }) {
  const [placedOrders, setPlacedOrders] = useState<PlacedOrder[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setPlacedOrders(JSON.parse(stored));
      } catch {
        setPlacedOrders([]);
      }
    }
    setIsHydrated(true);
  }, []);

  const placeOrder = useCallback((description: string, status: string) => {
    setPlacedOrders((current) => {
      const next = [
        {
          id: generateOrderId(),
          date: new Date().toISOString().slice(0, 10),
          description,
          status,
        },
        ...current,
      ];
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ placedOrders, isHydrated, placeOrder }),
    [placedOrders, isHydrated, placeOrder]
  );

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
}

export function useOrders(): OrdersValue {
  const context = useContext(OrdersContext);
  if (!context) {
    throw new Error('useOrders must be used within an OrdersProvider');
  }
  return context;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- useOrders`
Expected: PASS — 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/useOrders.tsx tests/lib/useOrders.test.ts
git commit -m "feat: add OrdersProvider/useOrders for newly-placed mock orders"
```

---

### Task 4: AddToCartButton component

**Files:**
- Create: `src/components/AddToCartButton.tsx`
- Create: `tests/components/AddToCartButton.test.tsx`

**Interfaces:**
- Consumes: `STANDARD_SIZES` (Task 1, `@/data/sizes`), `useCart` (Task 2, `@/lib/useCart`), message keys `cart.{addToCart,size,quantity,confirm}` (Task 1).
- Produces: `AddToCartButton({ segmentSlug, segmentMessageKey, imageSrc }: { segmentSlug: string; segmentMessageKey: string; imageSrc: string })` — used by Task 7 (`ProductsGrid`). Renders `data-testid="add-to-cart-button"` (collapsed) or, once clicked, `data-testid="add-to-cart-panel"` containing `data-testid="add-to-cart-size"` (a `<select>`), `data-testid="add-to-cart-quantity-minus"`, `data-testid="add-to-cart-quantity-value"`, `data-testid="add-to-cart-quantity-plus"`, and `data-testid="add-to-cart-confirm"`.

- [ ] **Step 1: Write the failing test**

Create `tests/components/AddToCartButton.test.tsx`:

```tsx
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AddToCartButton } from '@/components/AddToCartButton';
import { CartProvider, useCart } from '@/lib/useCart';
import messages from '../../messages/nl.json';

function renderButton() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CartProvider>
        <AddToCartButton
          segmentSlug="wellness"
          segmentMessageKey="wellness"
          imageSrc="https://images.unsplash.com/example.jpg"
        />
      </CartProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('AddToCartButton', () => {
  it('shows the collapsed add-to-cart button by default, no panel', () => {
    renderButton();
    expect(screen.getByTestId('add-to-cart-button')).toBeInTheDocument();
    expect(screen.queryByTestId('add-to-cart-panel')).not.toBeInTheDocument();
  });

  it('opens the size/quantity panel when clicked', () => {
    renderButton();
    fireEvent.click(screen.getByTestId('add-to-cart-button'));
    expect(screen.getByTestId('add-to-cart-panel')).toBeInTheDocument();
    expect(screen.getByTestId('add-to-cart-size')).toHaveValue('40x60cm');
    expect(screen.getByTestId('add-to-cart-quantity-value')).toHaveTextContent('1');
  });

  it('increments and decrements quantity, never below 1', () => {
    renderButton();
    fireEvent.click(screen.getByTestId('add-to-cart-button'));
    fireEvent.click(screen.getByTestId('add-to-cart-quantity-minus'));
    expect(screen.getByTestId('add-to-cart-quantity-value')).toHaveTextContent('1');
    fireEvent.click(screen.getByTestId('add-to-cart-quantity-plus'));
    fireEvent.click(screen.getByTestId('add-to-cart-quantity-plus'));
    expect(screen.getByTestId('add-to-cart-quantity-value')).toHaveTextContent('3');
  });

  it('adds the chosen size/quantity to the cart and closes the panel on confirm', () => {
    function Probe() {
      const { items } = useCart();
      return <div data-testid="probe">{JSON.stringify(items)}</div>;
    }

    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CartProvider>
          <AddToCartButton
            segmentSlug="wellness"
            segmentMessageKey="wellness"
            imageSrc="https://images.unsplash.com/example.jpg"
          />
          <Probe />
        </CartProvider>
      </NextIntlClientProvider>
    );

    fireEvent.click(screen.getByTestId('add-to-cart-button'));
    fireEvent.change(screen.getByTestId('add-to-cart-size'), { target: { value: '60x90cm' } });
    fireEvent.click(screen.getByTestId('add-to-cart-quantity-plus'));
    fireEvent.click(screen.getByTestId('add-to-cart-confirm'));

    expect(screen.queryByTestId('add-to-cart-panel')).not.toBeInTheDocument();
    const items = JSON.parse(screen.getByTestId('probe').textContent ?? '[]');
    expect(items).toHaveLength(1);
    expect(items[0].size).toBe('60x90cm');
    expect(items[0].quantity).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- AddToCartButton`
Expected: FAIL — `Cannot find module '@/components/AddToCartButton'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/AddToCartButton.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { STANDARD_SIZES } from '@/data/sizes';
import { useCart } from '@/lib/useCart';

interface AddToCartButtonProps {
  segmentSlug: string;
  segmentMessageKey: string;
  imageSrc: string;
}

export function AddToCartButton({
  segmentSlug,
  segmentMessageKey,
  imageSrc,
}: AddToCartButtonProps) {
  const t = useTranslations('cart');
  const [isOpen, setIsOpen] = useState(false);
  const [size, setSize] = useState<string>(STANDARD_SIZES[0]);
  const [quantity, setQuantity] = useState(1);
  const { addItem } = useCart();

  function handleConfirm() {
    addItem({ segmentSlug, segmentMessageKey, imageSrc, size, quantity });
    setIsOpen(false);
    setQuantity(1);
    setSize(STANDARD_SIZES[0]);
  }

  return (
    <div className="absolute inset-0 flex items-end justify-center opacity-0 transition hover:bg-black/40 hover:opacity-100 focus-within:bg-black/40 focus-within:opacity-100">
      {!isOpen ? (
        <button
          type="button"
          data-testid="add-to-cart-button"
          onClick={() => setIsOpen(true)}
          className="m-2 rounded-sm bg-silver px-3 py-1.5 text-[0.65rem] tracking-wide text-ink"
        >
          {t('addToCart')}
        </button>
      ) : (
        <div
          data-testid="add-to-cart-panel"
          className="m-2 flex w-full max-w-[12rem] flex-col gap-2 rounded-md border border-white/10 bg-black/90 p-3"
        >
          <label className="flex flex-col gap-1 text-[0.6rem] uppercase tracking-wide text-white/60">
            {t('size')}
            <select
              data-testid="add-to-cart-size"
              value={size}
              onChange={(event) => setSize(event.target.value)}
              className="rounded-sm bg-black/60 px-2 py-1 text-xs text-white"
            >
              {STANDARD_SIZES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center justify-between gap-2 text-xs text-white/80">
            <span className="text-[0.6rem] uppercase tracking-wide text-white/60">
              {t('quantity')}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="add-to-cart-quantity-minus"
                onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                className="h-6 w-6 rounded-full border border-white/20"
              >
                −
              </button>
              <span data-testid="add-to-cart-quantity-value">{quantity}</span>
              <button
                type="button"
                data-testid="add-to-cart-quantity-plus"
                onClick={() => setQuantity((current) => current + 1)}
                className="h-6 w-6 rounded-full border border-white/20"
              >
                +
              </button>
            </div>
          </div>
          <button
            type="button"
            data-testid="add-to-cart-confirm"
            onClick={handleConfirm}
            className="rounded-sm bg-silver px-3 py-1.5 text-xs tracking-wide text-ink"
          >
            {t('confirm')}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- AddToCartButton`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/AddToCartButton.tsx tests/components/AddToCartButton.test.tsx
git commit -m "feat: add AddToCartButton with size/quantity selection"
```

---

### Task 5: CartPanel component

**Files:**
- Create: `src/components/CartPanel.tsx`
- Create: `tests/components/CartPanel.test.tsx`

**Interfaces:**
- Consumes: `useCart` (Task 2, `@/lib/useCart`), `useOrders` (Task 3, `@/lib/useOrders`), message keys `cart.*` (Task 1), `segments.*.title` (existing).
- Produces: `CartPanel()` — no props, used by Task 6 (`NavBar`). Renders `data-testid="cart-icon"`, `data-testid="cart-badge"` (only when `totalQuantity > 0`), and on click `data-testid="cart-panel"` containing either `data-testid="cart-empty"` or `data-testid="cart-item-<id>"` per line plus `data-testid="cart-item-remove-<id>"`, and `data-testid="cart-place-order"`.

- [ ] **Step 1: Write the failing test**

Create `tests/components/CartPanel.test.tsx`:

```tsx
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CartPanel } from '@/components/CartPanel';
import { CartProvider, useCart } from '@/lib/useCart';
import { OrdersProvider, useOrders } from '@/lib/useOrders';
import messages from '../../messages/nl.json';

function Seed() {
  const { addItem } = useCart();
  return (
    <button
      type="button"
      data-testid="seed-cart"
      onClick={() =>
        addItem({
          segmentSlug: 'wellness',
          segmentMessageKey: 'wellness',
          imageSrc: 'https://images.unsplash.com/example.jpg',
          size: '60x90cm',
          quantity: 2,
        })
      }
    >
      Seed
    </button>
  );
}

function OrdersProbe() {
  const { placedOrders } = useOrders();
  return <div data-testid="orders-probe">{JSON.stringify(placedOrders)}</div>;
}

function renderCartPanel() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CartProvider>
        <OrdersProvider>
          <Seed />
          <CartPanel />
          <OrdersProbe />
        </OrdersProvider>
      </CartProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('CartPanel', () => {
  it('shows no badge when the cart is empty, and an empty message when opened', () => {
    renderCartPanel();
    expect(screen.queryByTestId('cart-badge')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('cart-icon'));
    expect(screen.getByTestId('cart-empty')).toBeInTheDocument();
  });

  it('shows a badge with the total quantity and lists cart items once seeded', () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    expect(screen.getByTestId('cart-badge')).toHaveTextContent('2');
    fireEvent.click(screen.getByTestId('cart-icon'));
    expect(screen.queryByTestId('cart-empty')).not.toBeInTheDocument();
    expect(screen.getByText('Wellness')).toBeInTheDocument();
    expect(screen.getByText('60x90cm · ×2')).toBeInTheDocument();
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

  it('places an order from the cart contents, then clears the cart and closes the panel', () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    fireEvent.click(screen.getByTestId('cart-place-order'));

    expect(screen.queryByTestId('cart-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cart-badge')).not.toBeInTheDocument();

    const placedOrders = JSON.parse(screen.getByTestId('orders-probe').textContent ?? '[]');
    expect(placedOrders).toHaveLength(1);
    expect(placedOrders[0].description).toBe('Wellness 60x90cm ×2');
    expect(placedOrders[0].status).toBe('Aangevraagd');
  });

  it('disables the place-order button when the cart is empty', () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('cart-icon'));
    expect(screen.getByTestId('cart-place-order')).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- CartPanel`
Expected: FAIL — `Cannot find module '@/components/CartPanel'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/CartPanel.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useCart } from '@/lib/useCart';
import { useOrders } from '@/lib/useOrders';

export function CartPanel() {
  const t = useTranslations('cart');
  const tSegments = useTranslations('segments');
  const [isOpen, setIsOpen] = useState(false);
  const { items, isHydrated, totalQuantity, removeItem, clear } = useCart();
  const { placeOrder } = useOrders();

  function handlePlaceOrder() {
    const description = items
      .map(
        (item) => `${tSegments(`${item.segmentMessageKey}.title`)} ${item.size} ×${item.quantity}`
      )
      .join(', ');
    placeOrder(description, t('requestedStatus'));
    clear();
    setIsOpen(false);
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

      {isOpen && (
        <div
          data-testid="cart-panel"
          className="absolute right-0 top-full mt-2 w-80 rounded-md border border-white/10 bg-black/90 p-3"
        >
          <p className="mb-2 text-[0.65rem] uppercase tracking-[0.2em] text-white/50">
            {t('title')}
          </p>
          {items.length === 0 ? (
            <p data-testid="cart-empty" className="text-xs text-white/60">
              {t('empty')}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {items.map((item) => (
                <li
                  key={item.id}
                  data-testid={`cart-item-${item.id}`}
                  className="flex gap-2 text-xs text-white/80"
                >
                  <img src={item.imageSrc} alt="" className="h-12 w-12 rounded object-cover" />
                  <div className="flex-1">
                    <p>{tSegments(`${item.segmentMessageKey}.title`)}</p>
                    <p className="text-white/50">
                      {item.size} · ×{item.quantity}
                    </p>
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
          <button
            type="button"
            data-testid="cart-place-order"
            disabled={items.length === 0}
            onClick={handlePlaceOrder}
            className="mt-3 w-full rounded-sm bg-silver px-3 py-1.5 text-xs tracking-wide text-ink disabled:opacity-40"
          >
            {t('placeOrder')}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- CartPanel`
Expected: PASS — 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/CartPanel.tsx tests/components/CartPanel.test.tsx
git commit -m "feat: add CartPanel with badge, item list, and place-order flow"
```

---

### Task 6: Wire CartProvider/OrdersProvider into the layout, add CartPanel to NavBar

**Files:**
- Modify: `src/app/[locale]/layout.tsx`
- Modify: `src/components/NavBar.tsx`
- Modify: `tests/components/NavBar.test.tsx`
- Modify: `tests/components/NavBarAccountMenuIntegration.test.tsx`

**Interfaces:**
- Consumes: `CartProvider` (Task 2), `OrdersProvider` (Task 3), `CartPanel` (Task 5).
- Produces: every page now has `CartProvider`/`OrdersProvider` available via the layout; `NavBar` renders `<CartPanel />` between the login/account area and `LanguageSwitcher`.

- [ ] **Step 1: Update `src/app/[locale]/layout.tsx`**

```tsx
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { NavBar } from '@/components/NavBar';
import { MockAuthProvider } from '@/lib/useMockAuth';
import { CartProvider } from '@/lib/useCart';
import { OrdersProvider } from '@/lib/useOrders';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const { locale } = params;
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <MockAuthProvider>
        <CartProvider>
          <OrdersProvider>
            <NavBar />
            {children}
          </OrdersProvider>
        </CartProvider>
      </MockAuthProvider>
    </NextIntlClientProvider>
  );
}
```

- [ ] **Step 2: Update `src/components/NavBar.tsx`**

Add the `CartPanel` import and render it between the login/account block and `LanguageSwitcher`:

```tsx
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useMockAuth } from '@/lib/useMockAuth';
import { BASE_PATH } from '@/lib/basePath';
import { LanguageSwitcher } from './LanguageSwitcher';
import { AccountMenu } from './AccountMenu';
import { CartPanel } from './CartPanel';

export function NavBar() {
  const locale = useLocale();
  const t = useTranslations('nav');
  const { isLoggedIn, isHydrated, login } = useMockAuth();
  const contactHref = `${BASE_PATH}/${locale}/#contact`;

  return (
    <nav
      data-testid="navbar"
      className="fixed left-0 top-0 z-40 flex w-full flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-black/60 px-4 py-3 backdrop-blur-sm sm:px-8"
    >
      <div className="flex items-center gap-6 text-xs tracking-[0.15em] text-white/70">
        <Link href="/" data-testid="nav-home" className="hover:text-white">
          {t('home')}
        </Link>
        <Link href="/collecties" data-testid="nav-collections" className="hover:text-white">
          {t('collections')}
        </Link>
        <a href={contactHref} data-testid="nav-contact" className="hover:text-white">
          {t('contact')}
        </a>
      </div>

      <div className="flex items-center gap-3">
        {isHydrated && isLoggedIn ? (
          <AccountMenu />
        ) : (
          <>
            <a
              href={contactHref}
              data-testid="nav-become-client"
              className="hidden text-xs tracking-[0.15em] text-white/70 hover:text-white sm:inline"
            >
              {t('becomeClient')}
            </a>
            <button
              type="button"
              data-testid="nav-login"
              onClick={login}
              className="rounded-sm bg-silver px-4 py-2 text-xs tracking-[0.15em] text-ink"
            >
              {t('login')}
            </button>
          </>
        )}
        <CartPanel />
        <LanguageSwitcher />
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: Update `tests/components/NavBar.test.tsx`**

Add a mock for `CartPanel` (same pattern as the existing `AccountMenu` mock, since `NavBar`'s own tests don't need real cart behavior):

```tsx
vi.mock('@/components/CartPanel', () => ({
  CartPanel: () => <div data-testid="cart-panel-stub" />,
}));
```

Add this `vi.mock` call alongside the existing two `vi.mock` calls at the top of the file (do not remove or modify the existing `@/i18n/navigation` or `@/components/AccountMenu` mocks). No other changes to this file — the 4 existing test cases stay exactly as they are.

- [ ] **Step 4: Update `tests/components/NavBarAccountMenuIntegration.test.tsx`**

This test deliberately does NOT mock `AccountMenu` (that's the whole point of the test), but `CartPanel` is unrelated to what this test verifies, so mock it the same way to avoid needing `CartProvider`/`OrdersProvider` wrapping just to satisfy an unrelated component:

```tsx
vi.mock('@/components/CartPanel', () => ({
  CartPanel: () => <div data-testid="cart-panel-stub" />,
}));
```

Add this alongside the existing `@/i18n/navigation` mock at the top of the file. No other changes — the existing test case and its `MockAuthProvider`-only wrapper stay exactly as they are (this test still doesn't need `CartProvider`/`OrdersProvider` since `CartPanel` is now stubbed).

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests green.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/layout.tsx" src/components/NavBar.tsx tests/components/NavBar.test.tsx tests/components/NavBarAccountMenuIntegration.test.tsx
git commit -m "feat: wire CartProvider/OrdersProvider into the layout, add CartPanel to NavBar"
```

---

### Task 7: Wire AddToCartButton into ProductsGrid

**Files:**
- Modify: `src/components/ProductsGrid.tsx`
- Modify: `tests/components/ProductsGrid.test.tsx`

**Interfaces:**
- Consumes: `AddToCartButton` (Task 4, `@/components/AddToCartButton`).
- Produces: each `data-testid="product-card"` now also contains an `AddToCartButton` for that image.

- [ ] **Step 1: Update `tests/components/ProductsGrid.test.tsx`**

Wrap the existing render helper in `CartProvider` (real, since `AddToCartButton` needs it) and add one new test. Update the imports and `renderProductsGrid` helper at the top of the file:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ProductsGrid } from '@/components/ProductsGrid';
import { CartProvider } from '@/lib/useCart';
import messages from '../../messages/nl.json';

function renderProductsGrid() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CartProvider>
        <ProductsGrid />
      </CartProvider>
    </NextIntlClientProvider>
  );
}
```

Keep all 4 existing test cases exactly as they are (they still pass unmodified — wrapping in `CartProvider` doesn't change `ProductsGrid`'s own rendered output beyond adding the new button per card). Add one new test at the end of the `describe` block:

```tsx
  it('renders an add-to-cart button on every visible product card', () => {
    renderProductsGrid();
    expect(screen.getAllByTestId('add-to-cart-button')).toHaveLength(36);
    fireEvent.click(screen.getByTestId('filter-wellness'));
    expect(screen.getAllByTestId('add-to-cart-button')).toHaveLength(6);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ProductsGrid`
Expected: FAIL — the new test fails (`add-to-cart-button` doesn't exist yet); the other 4 tests should still pass since `ProductsGrid.tsx` hasn't changed yet.

- [ ] **Step 3: Update `src/components/ProductsGrid.tsx`**

Add the `AddToCartButton` import and render it inside each product card, after the badge `<span>`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { SEGMENTS, getAllImages } from '@/data/segments';
import { AddToCartButton } from './AddToCartButton';

const ALL_FILTER = 'all';

export function ProductsGrid() {
  const tSegments = useTranslations('segments');
  const tCollections = useTranslations('collectionsPage');
  const [activeFilter, setActiveFilter] = useState(ALL_FILTER);
  const allImages = useMemo(() => getAllImages(), []);

  const visibleImages =
    activeFilter === ALL_FILTER
      ? allImages
      : allImages.filter((image) => image.segmentSlug === activeFilter);

  function filterButtonClass(isActive: boolean) {
    return isActive
      ? 'rounded-full bg-silver px-4 py-1.5 text-xs tracking-wide text-ink'
      : 'rounded-full border border-white/20 px-4 py-1.5 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white';
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
          {tCollections('filterAll')} ({allImages.length})
        </button>
        {SEGMENTS.map((segment) => (
          <button
            key={segment.slug}
            type="button"
            data-testid={`filter-${segment.slug}`}
            aria-pressed={activeFilter === segment.slug}
            onClick={() => setActiveFilter(segment.slug)}
            className={filterButtonClass(activeFilter === segment.slug)}
          >
            {tSegments(`${segment.messageKey}.title`)} ({segment.images.length})
          </button>
        ))}
      </div>

      <div
        data-testid="products-grid"
        className="mx-auto grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      >
        {visibleImages.map((image) => (
          <div
            key={image.id}
            data-testid="product-card"
            className="relative overflow-hidden rounded border border-white/10"
          >
            <img
              src={image.src}
              alt={tSegments(`${image.segmentMessageKey}.title`)}
              className="aspect-square w-full object-cover"
            />
            <span className="absolute left-2 top-2 rounded-sm bg-black/70 px-2 py-1 text-[0.6rem] uppercase tracking-wide text-white">
              {tSegments(`${image.segmentMessageKey}.title`)}
            </span>
            <AddToCartButton
              segmentSlug={image.segmentSlug}
              segmentMessageKey={image.segmentMessageKey}
              imageSrc={image.src}
            />
          </div>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ProductsGrid`
Expected: PASS — 5 tests passed.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests green.

- [ ] **Step 6: Commit**

```bash
git add src/components/ProductsGrid.tsx tests/components/ProductsGrid.test.tsx
git commit -m "feat: render AddToCartButton on every product card"
```

---

### Task 8: Merge placed orders into AccountMenu's order history

**Files:**
- Modify: `src/components/AccountMenu.tsx`
- Modify: `tests/components/AccountMenu.test.tsx`
- Modify: `tests/components/NavBarAccountMenuIntegration.test.tsx`

**Interfaces:**
- Consumes: `useOrders` (Task 3, `@/lib/useOrders`), `MOCK_ORDERS` (existing, `@/data/mockOrders`).
- Produces: `AccountMenu()` — same public interface (no props), now renders newly-placed orders (from `useOrders`) before the 4 seed `MOCK_ORDERS`, in one combined list.

- [ ] **Step 1: Update `tests/components/AccountMenu.test.tsx`**

Wrap the render helper in `OrdersProvider` (real) and add one new test for the merged list. Replace the file in full:

```tsx
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AccountMenu } from '@/components/AccountMenu';
import { MockAuthProvider } from '@/lib/useMockAuth';
import { OrdersProvider, useOrders } from '@/lib/useOrders';
import messages from '../../messages/nl.json';

function Seed() {
  const { placeOrder } = useOrders();
  return (
    <button
      type="button"
      data-testid="seed-order"
      onClick={() => placeOrder('Wellness paneel 60x90cm ×2', 'Aangevraagd')}
    >
      Seed
    </button>
  );
}

function renderAccountMenu() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <MockAuthProvider>
        <OrdersProvider>
          <Seed />
          <AccountMenu />
        </OrdersProvider>
      </MockAuthProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('AccountMenu', () => {
  it('opens the order history panel with all 4 seed orders and a reorder button each', () => {
    renderAccountMenu();
    fireEvent.click(screen.getByTestId('account-icon'));

    expect(screen.getByTestId('order-history-panel')).toBeInTheDocument();
    expect(screen.getByTestId('order-GD-10234')).toBeInTheDocument();
    expect(screen.getByTestId('order-GD-10221')).toBeInTheDocument();
    expect(screen.getByTestId('order-GD-10198')).toBeInTheDocument();
    expect(screen.getByTestId('order-GD-10177')).toBeInTheDocument();
    expect(screen.getByTestId('reorder-GD-10234')).toBeInTheDocument();
    expect(screen.getByText('Abstract paneel 60x90cm')).toBeInTheDocument();
    expect(screen.getByText('In behandeling')).toBeInTheDocument();
  });

  it('shows a newly placed order before the 4 seed orders', () => {
    renderAccountMenu();
    fireEvent.click(screen.getByTestId('seed-order'));
    fireEvent.click(screen.getByTestId('account-icon'));

    const panel = screen.getByTestId('order-history-panel');
    const items = panel.querySelectorAll('li');
    expect(items).toHaveLength(5);
    expect(screen.getByText('Wellness paneel 60x90cm ×2')).toBeInTheDocument();
  });

  it('calls logout (clearing localStorage) when "Uitloggen" is clicked', () => {
    window.localStorage.setItem('glassart-mock-logged-in', 'true');
    renderAccountMenu();
    fireEvent.click(screen.getByTestId('account-icon'));
    fireEvent.click(screen.getByTestId('nav-logout'));
    expect(window.localStorage.getItem('glassart-mock-logged-in')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- AccountMenu`
Expected: FAIL — `useOrders must be used within an OrdersProvider` (current `AccountMenu.tsx` doesn't call `useOrders` yet, so the new "shows a newly placed order" test fails since there's nowhere for the placed order to appear) — or a render error if the current component doesn't yet import `useOrders`. Either way, confirms the merged-list behavior doesn't exist yet.

- [ ] **Step 3: Update `src/components/AccountMenu.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { MOCK_ORDERS } from '@/data/mockOrders';
import { useMockAuth } from '@/lib/useMockAuth';
import { useOrders } from '@/lib/useOrders';

export function AccountMenu() {
  const t = useTranslations('nav');
  const tOrders = useTranslations('orders');
  const [isOpen, setIsOpen] = useState(false);
  const { logout } = useMockAuth();
  const { placedOrders } = useOrders();

  return (
    <div className="relative">
      <button
        type="button"
        data-testid="account-icon"
        aria-label={t('myOrders')}
        onClick={() => setIsOpen((open) => !open)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-silver text-xs font-semibold text-ink"
      >
        GD
      </button>
      {isOpen && (
        <div
          data-testid="order-history-panel"
          className="absolute right-0 top-full mt-2 w-72 rounded-md border border-white/10 bg-black/90 p-3"
        >
          <p className="mb-2 text-[0.65rem] uppercase tracking-[0.2em] text-white/50">
            {t('myOrders')}
          </p>
          <ul className="flex flex-col gap-3">
            {placedOrders.map((order) => (
              <li
                key={order.id}
                data-testid={`order-${order.id}`}
                className="text-xs text-white/80"
              >
                <div className="flex items-center justify-between">
                  <span>{order.id}</span>
                  <span className="text-white/50">{order.date}</span>
                </div>
                <p>{order.description}</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-white/50">{order.status}</span>
                </div>
              </li>
            ))}
            {MOCK_ORDERS.map((order) => (
              <li
                key={order.id}
                data-testid={`order-${order.id}`}
                className="text-xs text-white/80"
              >
                <div className="flex items-center justify-between">
                  <span>{order.id}</span>
                  <span className="text-white/50">{order.date}</span>
                </div>
                <p>{tOrders(`items.${order.messageKey}.description`)}</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-white/50">
                    {tOrders(`items.${order.messageKey}.status`)}
                  </span>
                  <button
                    type="button"
                    data-testid={`reorder-${order.id}`}
                    className="rounded-sm border border-white/20 px-2 py-1 text-[0.65rem] tracking-wide hover:bg-white/10"
                  >
                    {tOrders('reorder')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            data-testid="nav-logout"
            onClick={logout}
            className="mt-3 w-full rounded-sm border border-white/20 py-1.5 text-xs tracking-wide hover:bg-white/10"
          >
            {t('logout')}
          </button>
        </div>
      )}
    </div>
  );
}
```

Note: newly-placed orders intentionally do NOT get a "Bestel opnieuw" (reorder) button in this deelproject — only the 4 seed orders keep that button, matching the existing behavior exactly. Adding reorder for placed orders too was not requested and is not needed for this scope (YAGNI).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- AccountMenu`
Expected: PASS — 3 tests passed.

- [ ] **Step 5: Update `tests/components/NavBarAccountMenuIntegration.test.tsx` to wrap in `OrdersProvider`**

`AccountMenu` now calls `useOrders()` unconditionally, so this test's render helper (which renders the real, unmocked `AccountMenu`) needs `OrdersProvider` added alongside its existing `MockAuthProvider` wrapper. Find the render helper near the top of the file — it currently wraps its tree in `MockAuthProvider` only — and add the `OrdersProvider` import and wrapper:

```tsx
import { OrdersProvider } from '@/lib/useOrders';
```

Wrap the existing `<MockAuthProvider>...</MockAuthProvider>` tree with `<OrdersProvider>` on the outside (or inside — order between `MockAuthProvider` and `OrdersProvider` doesn't matter, they're independent contexts), e.g.:

```tsx
render(
  <NextIntlClientProvider locale="nl" messages={messages}>
    <OrdersProvider>
      <MockAuthProvider>
        <NavBar />
      </MockAuthProvider>
    </OrdersProvider>
  </NextIntlClientProvider>
);
```

Apply this same wrapping to every render call in the file that mounts `NavBar` (the file may have more than one test, each with its own render call — wrap all of them). Do not change anything else in the file — the existing test assertions and the `CartPanel` mock added in Task 6 stay exactly as they are.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests green, including `NavBarAccountMenuIntegration.test.tsx`.

- [ ] **Step 7: Commit**

```bash
git add src/components/AccountMenu.tsx tests/components/AccountMenu.test.tsx tests/components/NavBarAccountMenuIntegration.test.tsx
git commit -m "feat: merge newly-placed orders into AccountMenu's order history"
```

---

### Task 9: Static export build verification

**Files:**
- No new files. This task verifies the previous 8 tasks produce a working static export with the cart fully functional end to end.

- [ ] **Step 1: Run the production build**

Run: `npm run build`
Expected: build completes successfully, no new errors.

- [ ] **Step 2: Run the full test suite one final time**

Run: `npm test`
Expected: PASS — all tests green.

- [ ] **Step 3: Verify content in the static export**

Run: `grep -o "add-to-cart-button\|Toevoegen aan mandje" out/nl/collecties/index.html | sort -u | head -5`
Expected: at least "Toevoegen aan mandje" found (the add-to-cart button's translated label is present in the static HTML — confirms it's not silently missing from the export).

- [ ] **Step 4: Manually verify in the browser**

Run: `npx serve out -l 4173` (or reuse whatever static server command was used for previous plans) and open the site.

Check:
- On `/collecties`, hovering a product card reveals an "add to cart" button.
- Clicking it opens a size dropdown + quantity stepper + confirm button.
- Confirming adds the item to the cart; the cart icon in the nav shows a badge with the correct total quantity.
- Opening the cart panel shows the added item(s) with thumbnail, segment name, size, and quantity; removing an item updates the badge/list correctly.
- Clicking "Toevoegen aan bestelling" clears the cart and closes the panel.
- Logging in (mock) and opening "Mijn bestellingen" shows the newly placed order at the top (status "Aangevraagd"), followed by the 4 seed example orders.
- Adding the same artwork + same size twice increases quantity instead of creating two lines.
- Switching languages updates all cart/order UI labels correctly.
- Mobile width (375px): the cart panel and add-to-cart panel remain usable, no horizontal overflow.

- [ ] **Step 5: Commit**

No code changes expected in this task. If Steps 1–4 surfaced a fix, commit it with a message describing what was broken, then re-run Steps 1–4.
