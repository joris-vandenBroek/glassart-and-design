import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { CustomerAuthProvider, useCustomerAuth } from '@/lib/useCustomerAuth';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('useCustomerAuth', () => {
  it('loads the current user from /api/auth/me on mount', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        user: {
          id: 'k1',
          email: 'k@example.com',
          companyName: 'Acme',
          contactPerson: 'Jan',
          status: 'Goedgekeurd',
          minimaleAfname: 5,
        },
      }),
    });
    const { result } = renderHook(() => useCustomerAuth(), { wrapper: CustomerAuthProvider });
    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    expect(result.current.user).toEqual({
      uid: 'k1',
      email: 'k@example.com',
      companyName: 'Acme',
      contactPerson: 'Jan',
      minimaleAfname: 5,
    });
    expect(result.current.isCustomer).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me?type=klant');
  });

  it('is not a customer when status is not Goedgekeurd', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: { id: 'k2', email: 'p@example.com', status: 'Beoordelen' } }),
    });
    const { result } = renderHook(() => useCustomerAuth(), { wrapper: CustomerAuthProvider });
    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    expect(result.current.isCustomer).toBe(false);
  });

  it('login() refreshes user/isCustomer in place, without a remount', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ user: null }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'Goedgekeurd' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: { id: 'k1', email: 'k@example.com', status: 'Goedgekeurd' },
        }),
      });
    const { result } = renderHook(() => useCustomerAuth(), { wrapper: CustomerAuthProvider });
    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    expect(result.current.isCustomer).toBe(false);

    let status = '';
    await act(async () => {
      status = await result.current.login('k@example.com', 'geheim123');
    });

    expect(status).toBe('Goedgekeurd');
    expect(result.current.isCustomer).toBe(true);
    expect(result.current.user).toMatchObject({ uid: 'k1', email: 'k@example.com' });
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST' }));
  });

  it('login() throws when the credentials are rejected', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ user: null }) })
      .mockResolvedValueOnce({ ok: false });
    const { result } = renderHook(() => useCustomerAuth(), { wrapper: CustomerAuthProvider });
    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    await expect(
      act(async () => {
        await result.current.login('k@example.com', 'fout');
      })
    ).rejects.toThrow();
  });

  it('logs out via POST /api/auth/logout', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ user: null }) })
      .mockResolvedValueOnce({ ok: true });
    const { result } = renderHook(() => useCustomerAuth(), { wrapper: CustomerAuthProvider });
    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    await act(async () => {
      await result.current.logout();
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }));
  });
});
