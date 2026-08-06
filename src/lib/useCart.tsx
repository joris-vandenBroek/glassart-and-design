'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useOptionalCustomerAuth } from '@/lib/useCustomerAuth';

// Het mandje leeft in de localStorage van de browser en moet per klant gescheiden blijven:
// de prijs in een mandjeregel is berekend met de prijsgroep van de klant die hem toevoegde
// (zie ProductModal) en gaat bij het bestellen letterlijk mee naar /api/bestelheaders. Eén
// gedeelde sleutel betekent dus dat klant B tegen de prijzen van klant A bestelt.
const STORAGE_KEY_PREFIX = 'glassart-cart:';
const ANONYMOUS_SCOPE = `${STORAGE_KEY_PREFIX}anon`;
// De sleutel van vóór die scheiding. Wordt alleen nog opgeruimd, nooit meer gelezen --
// van niemand is bekend wiens mandje daarin staat.
const LEGACY_STORAGE_KEY = 'glassart-cart';

const NO_ITEMS: CartItem[] = [];

export interface CartItem {
  id: string;
  kunstwerkId: string;
  foto: string;
  omschrijving: string;
  materiaalId: string;
  materiaalLabel: string;
  maatId: string;
  maatLabel: string;
  breedte?: number;
  hoogte?: number;
  prijs: number | null;
  quantity: number;
}

type AddItemInput = Omit<CartItem, 'id'>;

interface CartValue {
  items: CartItem[];
  isHydrated: boolean;
  totalQuantity: number;
  totalPrice: number;
  unpricedLineCount: number;
  addItem: (input: AddItemInput) => void;
  removeItem: (id: string) => void;
  clear: () => void;
}

// Welk mandje geladen is, en uit welke localStorage-sleutel het kwam. De sleutel hoort bij
// de inhoud: zodra de ingelogde klant wisselt is die inhoud niet meer van deze bezoeker en
// mag er ook niet meer naar die sleutel geschreven worden.
interface LoadedCart {
  scope: string;
  items: CartItem[];
}

const CartContext = createContext<CartValue | null>(null);

function scopeFor(klantId: string | null): string {
  return klantId ? `${STORAGE_KEY_PREFIX}${klantId}` : ANONYMOUS_SCOPE;
}

function readCart(scope: string): CartItem[] {
  const stored = window.localStorage.getItem(scope);
  if (!stored) {
    return [];
  }
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function makeItemId(
  kunstwerkId: string,
  materiaalId: string,
  maatId: string,
  breedte?: number,
  hoogte?: number
): string {
  if (maatId) {
    return `${kunstwerkId}__${materiaalId}__${maatId}`;
  }
  return `${kunstwerkId}__${materiaalId}__custom__${breedte}x${hoogte}`;
}

export function CartProvider({ children }: { children: ReactNode }) {
  // Optioneel: in tests hangt CartProvider soms los, en dan is er simpelweg geen klant.
  const auth = useOptionalCustomerAuth();
  const klantId = auth?.user?.uid ?? null;
  const authIsHydrated = auth ? auth.isHydrated : true;
  const scope = scopeFor(klantId);

  const [loaded, setLoaded] = useState<LoadedCart | null>(null);
  // Schrijfacties mogen nooit in het mandje van de vorige klant belanden; ze kijken daarom
  // naar de scope van nú, niet naar die van de render waarin de callback gemaakt is.
  const scopeRef = useRef(scope);

  useEffect(() => {
    // Vóór /api/auth/me is niet bekend welk mandje bij deze bezoeker hoort. Alvast het
    // anonieme mandje tonen zou dat van een uitgelogde bezoeker even als dat van de
    // ingelogde klant laten zien.
    if (!authIsHydrated) {
      return;
    }
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    if (klantId) {
      // Wie inlogt begint niet met wat er anoniem verzameld is: dat zijn basisprijzen
      // zonder prijsgroep, en dus niet de prijzen van deze klant.
      window.localStorage.removeItem(ANONYMOUS_SCOPE);
    }
    scopeRef.current = scope;
    setLoaded({ scope, items: readCart(scope) });
  }, [authIsHydrated, klantId, scope]);

  // Tussen het wisselen van klant en het laden van diens mandje is het mandje leeg, in
  // plaats van "nog dat van de vorige".
  const isHydrated = loaded?.scope === scope;
  const items = isHydrated ? loaded.items : NO_ITEMS;

  const addItem = useCallback((input: AddItemInput) => {
    setLoaded((current) => {
      if (!current || current.scope !== scopeRef.current) return current;
      const id = makeItemId(input.kunstwerkId, input.materiaalId, input.maatId, input.breedte, input.hoogte);
      const existing = current.items.find((item) => item.id === id);
      const next = existing
        ? current.items.map((item) =>
            item.id === id ? { ...item, quantity: item.quantity + input.quantity } : item
          )
        : [...current.items, { id, ...input }];
      window.localStorage.setItem(current.scope, JSON.stringify(next));
      return { scope: current.scope, items: next };
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setLoaded((current) => {
      if (!current || current.scope !== scopeRef.current) return current;
      const next = current.items.filter((item) => item.id !== id);
      window.localStorage.setItem(current.scope, JSON.stringify(next));
      return { scope: current.scope, items: next };
    });
  }, []);

  const clear = useCallback(() => {
    const current = scopeRef.current;
    window.localStorage.removeItem(current);
    setLoaded({ scope: current, items: [] });
  }, []);

  const totalQuantity = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items]
  );

  const totalPrice = useMemo(
    () => items.reduce((sum, item) => sum + (item.prijs ?? 0) * item.quantity, 0),
    [items]
  );

  const unpricedLineCount = useMemo(
    () => items.filter((item) => item.prijs === null).length,
    [items]
  );

  const value = useMemo(
    () => ({ items, isHydrated, totalQuantity, totalPrice, unpricedLineCount, addItem, removeItem, clear }),
    [items, isHydrated, totalQuantity, totalPrice, unpricedLineCount, addItem, removeItem, clear]
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
