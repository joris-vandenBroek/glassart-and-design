import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useApiCollection } from '@/lib/useApiCollection';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('useApiCollection', () => {
  it('loads items from GET /api/<resource>', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: '1', omschrijving: 'Hotel' }],
    });
    const { result } = renderHook(() => useApiCollection<{ id: string; omschrijving: string }>('segmenten'));
    await waitFor(() => expect(result.current.items).not.toBeNull());
    expect(result.current.items).toEqual([{ id: '1', omschrijving: 'Hotel' }]);
    expect(fetchMock).toHaveBeenCalledWith('/api/segmenten');
  });

  it('sets a load error when the GET fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    const { result } = renderHook(() => useApiCollection('segmenten'));
    await waitFor(() => expect(result.current.error).toBe('load'));
  });

  it('adds an item via POST and refetches', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: '2', omschrijving: 'Kantoor' }] });
    const { result } = renderHook(() => useApiCollection<{ id: string; omschrijving: string }>('segmenten'));
    await waitFor(() => expect(result.current.items).toEqual([]));

    let success = false;
    await act(async () => {
      success = await result.current.add({ omschrijving: 'Kantoor' });
    });
    expect(success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/segmenten',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.current.items).toEqual([{ id: '2', omschrijving: 'Kantoor' }]);
  });

  it('does not fetch when skip is true', () => {
    renderHook(() => useApiCollection('segmenten', { skip: true }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('leaves an empty collection empty instead of writing placeholder rows', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    const { result } = renderHook(() => useApiCollection<{ id: string }>('segmenten'));
    await waitFor(() => expect(result.current.items).toEqual([]));
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/segmenten',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('exposes the server error code from a failed add, without changing the boolean it returns', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({
        ok: false,
        clone() {
          return this;
        },
        json: async () => ({ error: 'code-bestaat-al' }),
      });
    const { result } = renderHook(() => useApiCollection<{ id: string }>('kunstwerken'));
    await waitFor(() => expect(result.current.items).toEqual([]));

    let success = true;
    await act(async () => {
      success = await result.current.add({} as never);
    });
    expect(success).toBe(false);
    expect(result.current.error).toBe('action');
    expect(result.current.lastMutationErrorCode).toBe('code-bestaat-al');
  });

  it('exposes the server error code from a failed update', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({
        ok: false,
        clone() {
          return this;
        },
        json: async () => ({ error: 'code-in-bestelling' }),
      });
    const { result } = renderHook(() => useApiCollection<{ id: string }>('kunstwerken'));
    await waitFor(() => expect(result.current.items).toEqual([]));

    await act(async () => {
      await result.current.update('kw-1', {} as never);
    });
    expect(result.current.lastMutationErrorCode).toBe('code-in-bestelling');
  });

  it('exposes the server error code from a failed remove', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({
        ok: false,
        clone() {
          return this;
        },
        json: async () => ({ error: 'in-use-bestelling' }),
      });
    const { result } = renderHook(() => useApiCollection<{ id: string }>('kunstwerken'));
    await waitFor(() => expect(result.current.items).toEqual([]));

    await act(async () => {
      await result.current.remove('kw-1');
    });
    expect(result.current.lastMutationErrorCode).toBe('in-use-bestelling');
  });

  it('falls back to the HTTP status when the failed response has no JSON body (e.g. a plain 500)', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        clone() {
          return this;
        },
        json: async () => {
          throw new Error('not json');
        },
      });
    const { result } = renderHook(() => useApiCollection<{ id: string }>('kunstwerken'));
    await waitFor(() => expect(result.current.items).toEqual([]));

    await act(async () => {
      await result.current.update('kw-1', {} as never);
    });
    expect(result.current.lastMutationErrorCode).toBe('http-500');
  });

  it('clears lastMutationErrorCode once a later mutation succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({
        ok: false,
        clone() {
          return this;
        },
        json: async () => ({ error: 'code-bestaat-al' }),
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });
    const { result } = renderHook(() => useApiCollection<{ id: string }>('kunstwerken'));
    await waitFor(() => expect(result.current.items).toEqual([]));

    await act(async () => {
      await result.current.add({} as never);
    });
    expect(result.current.lastMutationErrorCode).toBe('code-bestaat-al');

    await act(async () => {
      await result.current.add({} as never);
    });
    expect(result.current.lastMutationErrorCode).toBeNull();
  });

  it('sets lastMutationErrorCode to netwerkfout when a later mutation fails before a response exists (offline, DNS, aborted), overwriting the previous mutation\'s code', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({
        ok: false,
        clone() {
          return this;
        },
        json: async () => ({ error: 'code-bestaat-al' }),
      })
      .mockRejectedValueOnce(new Error('network error'));
    const { result } = renderHook(() => useApiCollection<{ id: string }>('kunstwerken'));
    await waitFor(() => expect(result.current.items).toEqual([]));

    await act(async () => {
      await result.current.add({} as never);
    });
    expect(result.current.lastMutationErrorCode).toBe('code-bestaat-al');

    let success = true;
    await act(async () => {
      success = await result.current.remove('kw-1');
    });
    expect(success).toBe(false);
    expect(result.current.error).toBe('action');
    expect(result.current.lastMutationErrorCode).toBe('netwerkfout');
  });
});
