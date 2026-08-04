import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useApiRecord } from '@/lib/useApiRecord';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('useApiRecord', () => {
  it('loads a record from GET /api/<resource>/<id>', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ bezoekadres: 'Den Heuvel 21' }) });
    const { result } = renderHook(() =>
      useApiRecord<{ bezoekadres: string }>('instellingen', 'bedrijfsgegevens')
    );
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.data).toEqual({ bezoekadres: 'Den Heuvel 21' });
    expect(fetchMock).toHaveBeenCalledWith('/api/instellingen/bedrijfsgegevens');
  });

  it('saves via PATCH', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ bezoekadres: 'Oud adres' }) })
      .mockResolvedValueOnce({ ok: true });
    const { result } = renderHook(() =>
      useApiRecord<{ bezoekadres: string }>('instellingen', 'bedrijfsgegevens')
    );
    await waitFor(() => expect(result.current.data).not.toBeNull());

    let success = false;
    await act(async () => {
      success = await result.current.save({ bezoekadres: 'Nieuw adres' });
    });
    expect(success).toBe(true);
    expect(result.current.data).toEqual({ bezoekadres: 'Nieuw adres' });
  });

  it('sets a load error when the GET fails and no seed is provided', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    const { result } = renderHook(() =>
      useApiRecord<{ bezoekadres: string }>('instellingen', 'bedrijfsgegevens')
    );
    await waitFor(() => expect(result.current.error).toBe('load'));
    expect(result.current.data).toBeNull();
  });

  it('creates the record via PATCH with the seed when the GET fails and a seed is provided', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false }) // initial GET: 404, record doesn't exist yet
      .mockResolvedValueOnce({ ok: true }); // PATCH seed value
    const { result } = renderHook(() =>
      useApiRecord<{ tarieven: string[] }>('instellingen', 'btwtarieven', {
        seed: { tarieven: ['NL'] },
      })
    );
    await waitFor(() => expect(result.current.data).toEqual({ tarieven: ['NL'] }));
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/instellingen/btwtarieven',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ tarieven: ['NL'] }) })
    );
  });

  it('sets a load error when the GET fails, a seed is provided, but persisting the seed also fails', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false }) // initial GET: fails
      .mockResolvedValueOnce({ ok: false }); // PATCH seed value: also fails
    const { result } = renderHook(() =>
      useApiRecord<{ tarieven: string[] }>('instellingen', 'btwtarieven', {
        seed: { tarieven: ['NL'] },
      })
    );
    await waitFor(() => expect(result.current.error).toBe('load'));
    expect(result.current.data).toBeNull();
  });
});
