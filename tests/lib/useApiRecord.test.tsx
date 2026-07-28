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
});
