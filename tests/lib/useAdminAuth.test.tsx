import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { AdminAuthProvider, useAdminAuth } from '@/lib/useAdminAuth';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('useAdminAuth', () => {
  it('loads the current medewerker from /api/auth/me on mount', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: { id: 'm1', email: 'paul@glassartanddesign.com' } }),
    });
    const { result } = renderHook(() => useAdminAuth(), { wrapper: AdminAuthProvider });
    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    expect(result.current.user).toEqual({ uid: 'm1', email: 'paul@glassartanddesign.com' });
    expect(result.current.isAdmin).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me?type=medewerker');
  });

  it('logs in via POST /api/auth/medewerker-login', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ user: null }) })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ user: { id: 'm1', email: 'p@x.com' } }) });
    const { result } = renderHook(() => useAdminAuth(), { wrapper: AdminAuthProvider });
    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    await act(async () => {
      await result.current.login('p@x.com', 'pw');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/medewerker-login',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('requests a password reset via POST /api/auth/reset-password/request', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ user: null }) })
      .mockResolvedValueOnce({ ok: true });
    const { result } = renderHook(() => useAdminAuth(), { wrapper: AdminAuthProvider });
    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    await act(async () => {
      await result.current.resetPassword('p@x.com');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/reset-password/request',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
