import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDrukkerZendingen } from '@/lib/useDrukkerZendingen';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useDrukkerZendingen', () => {
  it('returns null zendingen and does not fetch while drukkerId is null', () => {
    const { result } = renderHook(() => useDrukkerZendingen(null));
    expect(result.current.zendingen).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches and maps zendingen for the given drukkerId', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'zending-1',
          verzondenOp: '2026-07-24T10:00:00Z',
          onderwerp: 'Nieuwe order(s) voor de drukker – 24-7-2026',
          body: '== Testbedrijf BV ==\n...',
          bestellingIds: ['header-1'],
          aantalKlanten: 1,
          aantalRegels: 2,
          verzondDoor: 'paul@glassartanddesign.com',
        },
      ],
    });
    const { result } = renderHook(() => useDrukkerZendingen('drukker-1'));
    await waitFor(() => expect(result.current.zendingen).not.toBeNull());
    expect(result.current.zendingen).toEqual([
      {
        id: 'zending-1',
        verzondenOp: new Date('2026-07-24T10:00:00Z'),
        onderwerp: 'Nieuwe order(s) voor de drukker – 24-7-2026',
        body: '== Testbedrijf BV ==\n...',
        bestellingIds: ['header-1'],
        aantalKlanten: 1,
        aantalRegels: 2,
        verzondDoor: 'paul@glassartanddesign.com',
      },
    ]);
    expect(result.current.error).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith('/api/drukkers/drukker-1/zendingen');
  });

  it('sets error true when the fetch fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useDrukkerZendingen('drukker-1'));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.zendingen).toBeNull();
  });

  it('sets error true when the response is not ok', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    const { result } = renderHook(() => useDrukkerZendingen('drukker-1'));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.zendingen).toBeNull();
  });

  it('refetches when drukkerId changes', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const { rerender } = renderHook(({ id }) => useDrukkerZendingen(id), { initialProps: { id: 'drukker-1' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    rerender({ id: 'drukker-2' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
