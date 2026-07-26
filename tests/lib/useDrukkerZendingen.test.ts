import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDrukkerZendingen } from '@/lib/useDrukkerZendingen';

const getDocsMock = vi.fn();

vi.mock('@/lib/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...segments: string[]) => ({ name: segments.join('/') })),
  query: vi.fn((collectionRef) => collectionRef),
  orderBy: vi.fn(),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
}));

beforeEach(() => {
  getDocsMock.mockReset();
});

describe('useDrukkerZendingen', () => {
  it('returns null zendingen and does not fetch while drukkerId is null', () => {
    const { result } = renderHook(() => useDrukkerZendingen(null));
    expect(result.current.zendingen).toBeNull();
    expect(getDocsMock).not.toHaveBeenCalled();
  });

  it('fetches and maps zendingen for the given drukkerId', async () => {
    const timestamp = { toDate: () => new Date('2026-07-24T10:00:00Z') };
    getDocsMock.mockResolvedValue({
      docs: [
        {
          id: 'zending-1',
          data: () => ({
            verzondenOp: timestamp,
            onderwerp: 'Nieuwe order(s) voor de drukker – 24-7-2026',
            body: '== Testbedrijf BV ==\n...',
            bestellingIds: ['header-1'],
            aantalKlanten: 1,
            aantalRegels: 2,
            verzondDoor: 'paul@glassartanddesign.com',
          }),
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
  });

  it('sets error true when getDocs fails', async () => {
    getDocsMock.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useDrukkerZendingen('drukker-1'));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.zendingen).toBeNull();
  });

  it('refetches when drukkerId changes', async () => {
    getDocsMock.mockResolvedValue({ docs: [] });
    const { rerender } = renderHook(({ id }) => useDrukkerZendingen(id), { initialProps: { id: 'drukker-1' } });
    await waitFor(() => expect(getDocsMock).toHaveBeenCalledTimes(1));
    rerender({ id: 'drukker-2' });
    await waitFor(() => expect(getDocsMock).toHaveBeenCalledTimes(2));
  });
});
