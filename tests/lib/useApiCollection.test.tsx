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

  it('seeds via POST when the collection comes back empty and a seed is provided', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // initial GET: empty
      .mockResolvedValueOnce({ ok: true }) // POST seed item
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: '1', omschrijving: 'Hotel' }],
      }); // refetch after seeding
    const { result } = renderHook(() =>
      useApiCollection<{ id: string; omschrijving: string }>('segmenten', {
        seed: [{ omschrijving: 'Hotel' }],
      })
    );
    await waitFor(() => expect(result.current.items).toEqual([{ id: '1', omschrijving: 'Hotel' }]));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/segmenten',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
