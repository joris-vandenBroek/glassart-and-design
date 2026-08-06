import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { CartProvider, useCart } from '@/lib/useCart';
import { CustomerAuthProvider, useCustomerAuth } from '@/lib/useCustomerAuth';

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

const ANON_KEY = 'glassart-cart:anon';

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
    const stored = JSON.parse(window.localStorage.getItem(ANON_KEY) ?? '[]');
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
    expect(window.localStorage.getItem(ANON_KEY)).toBeNull();
  });

  it('treats a null prijs as 0 in totalPrice, and counts it in unpricedLineCount', () => {
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    act(() => {
      result.current.addItem({ ...SAMPLE_ITEM, maatId: '', breedte: 90, hoogte: 140, prijs: null, quantity: 1 });
    });
    expect(result.current.totalPrice).toBe(0);
    expect(result.current.unpricedLineCount).toBe(1);
  });

  it('does not count a priced item in unpricedLineCount', () => {
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    act(() => {
      result.current.addItem(SAMPLE_ITEM);
    });
    expect(result.current.unpricedLineCount).toBe(0);
  });

  it('gives two different custom sizes of the same kunstwerk+materiaal separate cart lines', () => {
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    act(() => {
      result.current.addItem({ ...SAMPLE_ITEM, maatId: '', breedte: 90, hoogte: 140, prijs: null, quantity: 1 });
    });
    act(() => {
      result.current.addItem({ ...SAMPLE_ITEM, maatId: '', breedte: 70, hoogte: 110, prijs: null, quantity: 1 });
    });
    expect(result.current.items).toHaveLength(2);
  });

  it('drops a mandje left behind under the old, klant-loze storage key', () => {
    window.localStorage.setItem(
      'glassart-cart',
      JSON.stringify([{ id: 'kw-1__mat-1__maat-1', ...SAMPLE_ITEM }])
    );
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    expect(result.current.items).toEqual([]);
    expect(window.localStorage.getItem('glassart-cart')).toBeNull();
  });
});

// Het mandje leeft in localStorage van de browser, dus zonder scoping op klant ziet
// iedereen die achter dezelfde browser inlogt hetzelfde mandje -- inclusief de prijzen,
// die per klant verschillen (prijsgroep + kunstenaarsopslag) en bij het bestellen
// letterlijk zo naar /api/bestelheaders gaan.
describe('useCart per klant', () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);

  const KLANT_A = {
    id: 'uid-a',
    email: 'a@example.com',
    companyName: 'Klant A BV',
    contactPerson: null,
    status: 'Goedgekeurd',
  };
  const KLANT_B = {
    id: 'uid-b',
    email: 'b@example.com',
    companyName: 'Klant B BV',
    contactPerson: null,
    status: 'Goedgekeurd',
  };

  let authUser: Record<string, unknown> | null = null;

  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/auth/me?type=klant') {
      return { ok: true, json: async () => ({ user: authUser }) };
    }
    if (url === '/api/auth/login') {
      return { ok: true, json: async () => ({ status: 'Goedgekeurd' }) };
    }
    if (url === '/api/auth/logout') {
      return { ok: true, json: async () => ({}) };
    }
    throw new Error(`unexpected fetch: ${url}`);
  });

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <CustomerAuthProvider>
        <CartProvider>{children}</CartProvider>
      </CustomerAuthProvider>
    );
  }

  async function renderCart(user: Record<string, unknown> | null) {
    authUser = user;
    const rendered = renderHook(() => ({ cart: useCart(), auth: useCustomerAuth() }), { wrapper });
    await waitFor(() => expect(rendered.result.current.cart.isHydrated).toBe(true));
    return rendered;
  }

  beforeEach(() => {
    window.localStorage.clear();
    authUser = null;
    fetchMock.mockClear();
  });

  it('keeps each klant mandje under its own storage key', async () => {
    const first = await renderCart(KLANT_A);
    act(() => {
      first.result.current.cart.addItem(SAMPLE_ITEM);
    });
    expect(JSON.parse(window.localStorage.getItem('glassart-cart:uid-a') ?? '[]')).toHaveLength(1);
    first.unmount();

    const second = await renderCart(KLANT_B);
    expect(second.result.current.cart.items).toEqual([]);
    second.unmount();

    const back = await renderCart(KLANT_A);
    expect(back.result.current.cart.items).toHaveLength(1);
  });

  it('does not show a klant mandje to the anonymous visitor after logging out', async () => {
    const klant = await renderCart(KLANT_A);
    act(() => {
      klant.result.current.cart.addItem(SAMPLE_ITEM);
    });
    klant.unmount();

    const anoniem = await renderCart(null);
    expect(anoniem.result.current.cart.items).toEqual([]);
  });

  it('throws away the anonymous mandje as soon as a klant logs in, its prices are not theirs', async () => {
    const anoniem = await renderCart(null);
    act(() => {
      anoniem.result.current.cart.addItem(SAMPLE_ITEM);
    });
    expect(window.localStorage.getItem(ANON_KEY)).not.toBeNull();

    authUser = KLANT_A;
    await act(async () => {
      await anoniem.result.current.auth.login('a@example.com', 'geheim');
    });

    await waitFor(() => expect(anoniem.result.current.cart.items).toEqual([]));
    expect(window.localStorage.getItem(ANON_KEY)).toBeNull();
  });

  it('swaps to the other mandje when a second klant logs in on the same browser', async () => {
    const klant = await renderCart(KLANT_A);
    act(() => {
      klant.result.current.cart.addItem(SAMPLE_ITEM);
    });
    expect(klant.result.current.cart.items).toHaveLength(1);

    await act(async () => {
      await klant.result.current.auth.logout();
    });
    await waitFor(() => expect(klant.result.current.cart.items).toEqual([]));

    authUser = KLANT_B;
    await act(async () => {
      await klant.result.current.auth.login('b@example.com', 'geheim');
    });
    await waitFor(() => expect(klant.result.current.cart.isHydrated).toBe(true));
    expect(klant.result.current.cart.items).toEqual([]);
  });

  it('still opens an anonymous mandje when the klant cannot be looked up at all', async () => {
    fetchMock.mockImplementationOnce(async () => {
      throw new Error('network down');
    });
    const { result } = renderHook(() => ({ cart: useCart(), auth: useCustomerAuth() }), { wrapper });
    await waitFor(() => expect(result.current.cart.isHydrated).toBe(true));
    act(() => {
      result.current.cart.addItem(SAMPLE_ITEM);
    });
    expect(result.current.cart.items).toHaveLength(1);
  });

  it('does not report a hydrated mandje before the klant is known', async () => {
    authUser = KLANT_A;
    window.localStorage.setItem(
      ANON_KEY,
      JSON.stringify([{ id: 'kw-1__mat-1__maat-1', ...SAMPLE_ITEM }])
    );
    const { result } = renderHook(() => ({ cart: useCart(), auth: useCustomerAuth() }), { wrapper });
    // Zolang /api/auth/me nog loopt is niet bekend welk mandje bij deze bezoeker hoort;
    // het anonieme mandje mag dan niet even als het zijne getoond worden.
    expect(result.current.cart.isHydrated).toBe(false);
    expect(result.current.cart.items).toEqual([]);
    await waitFor(() => expect(result.current.cart.isHydrated).toBe(true));
    expect(result.current.cart.items).toEqual([]);
  });
});
