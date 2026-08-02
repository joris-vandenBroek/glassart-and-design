import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CustomerAuthProvider } from '@/lib/useCustomerAuth';
import { useAllOrders } from '@/lib/useAllOrders';
import messages from '../../messages/nl.json';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

let authUser: Record<string, unknown> | null = null;
let ordersResponse: { ok: boolean; body?: unknown } = { ok: true, body: [] };

function signedOut() {
  authUser = null;
}

function signedIn() {
  authUser = { id: 'uid-1', email: 'klant@example.com', status: 'Goedgekeurd' };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerAuthProvider>{children}</CustomerAuthProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  authUser = null;
  ordersResponse = { ok: true, body: [] };
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/auth/me?type=klant') {
      return { ok: true, json: async () => ({ user: authUser }) };
    }
    return { ok: ordersResponse.ok, json: async () => ordersResponse.body };
  });
});

describe('useAllOrders', () => {
  it('returns no orders when signed out', () => {
    signedOut();
    const { result } = renderHook(() => useAllOrders(), { wrapper });
    expect(result.current.orders).toHaveLength(0);
    expect(result.current.loadError).toBe(false);
  });

  it("shows the customer's own real bestellingen", async () => {
    signedIn();
    ordersResponse = {
      ok: true,
      body: [
        {
          id: 'header-1',
          bestelnr: 'GD-00001',
          besteldatum: '2026-07-01T14:30:00',
          status: 'Te versturen naar drukker',
          lines: [{ id: 'line-1', quantity: 3 }],
        },
      ],
    };

    const { result } = renderHook(() => useAllOrders(), { wrapper });
    await waitFor(() => expect(result.current.orders).toHaveLength(1));
    expect(result.current.orders[0].id).toBe('GD-00001');
    expect(result.current.orders[0].description).toBe('1 bestelregel, totaal 3 stuks');
    expect(result.current.orders[0].status).toBe('Te versturen naar drukker');
    expect(result.current.loadError).toBe(false);
  });

  it('falls back to the header id when no bestelnr is stored', async () => {
    signedIn();
    ordersResponse = {
      ok: true,
      body: [
        {
          id: 'header-1',
          bestelnr: undefined,
          besteldatum: '2026-07-01T14:30:00',
          status: 'Te beoordelen',
          lines: [{ id: 'line-1', quantity: 3 }],
        },
      ],
    };

    const { result } = renderHook(() => useAllOrders(), { wrapper });
    await waitFor(() => expect(result.current.orders).toHaveLength(1));
    expect(result.current.orders[0].id).toBe('header-1');
  });

  it('reports a load error when fetching orders fails, without throwing', async () => {
    signedIn();
    ordersResponse = { ok: false };

    const { result } = renderHook(() => useAllOrders(), { wrapper });
    await waitFor(() => expect(result.current.loadError).toBe(true));
    expect(result.current.orders).toHaveLength(0);
  });

  it('maps a missing prijs to null and passes through breedte/hoogte for a custom-size line', async () => {
    signedIn();
    ordersResponse = {
      ok: true,
      body: [
        {
          id: 'header-1',
          bestelnr: 'GD-00001',
          besteldatum: '2026-07-01T14:30:00',
          status: 'Te beoordelen',
          lines: [{ id: 'line-1', maatId: '', breedte: 90, hoogte: 140, quantity: 1, prijs: null }],
        },
      ],
    };

    const { result } = renderHook(() => useAllOrders(), { wrapper });
    await waitFor(() => expect(result.current.orders).toHaveLength(1));
    const line = result.current.orders[0].lines?.[0];
    expect(line).toMatchObject({ prijs: null, breedte: 90, hoogte: 140 });
  });
});
