import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useApiCollection } from '@/lib/useApiCollection';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('useApiCollection — foutcode van een mislukte mutatie', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonResponse([]));
  });

  it('gebruikt het error-veld uit de responsebody', async () => {
    const { result } = renderHook(() => useApiCollection<{ id: string }>('kunstwerken'));
    await waitFor(() => expect(result.current.items).not.toBeNull());

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'code-bestaat-al' }, 409));
    await act(async () => {
      await result.current.add({} as never);
    });

    expect(result.current.lastMutationErrorCode).toBe('code-bestaat-al');
  });

  it('valt terug op de HTTP-status als de body geen bruikbare foutcode heeft', async () => {
    const { result } = renderHook(() => useApiCollection<{ id: string }>('kunstwerken'));
    await waitFor(() => expect(result.current.items).not.toBeNull());

    fetchMock.mockResolvedValueOnce(new Response('<html>Bad Gateway</html>', { status: 502 }));
    await act(async () => {
      await result.current.add({} as never);
    });

    expect(result.current.lastMutationErrorCode).toBe('http-502');
  });

  it('meldt een netwerkfout als fetch zelf gooit', async () => {
    const { result } = renderHook(() => useApiCollection<{ id: string }>('kunstwerken'));
    await waitFor(() => expect(result.current.items).not.toBeNull());

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await act(async () => {
      await result.current.add({} as never);
    });

    expect(result.current.lastMutationErrorCode).toBe('netwerkfout');
  });
});
