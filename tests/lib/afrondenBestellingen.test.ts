import { beforeEach, describe, expect, it, vi } from 'vitest';
import { afrondBestellingen } from '@/lib/afrondenBestellingen';
import { logActiviteit } from '@/lib/logActiviteit';
import type { Bestelling } from '@/components/beheer/BestellingenSection';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

vi.mock('@/lib/logActiviteit', () => ({ logActiviteit: vi.fn() }));

const ACTOR = { id: 'staff-1', email: 'paul@example.com', naam: 'Paul' };

function bestelling(id: string): Bestelling {
  return {
    id,
    klantId: `klant-${id}`,
    companyName: `Bedrijf ${id}`,
    bestelnr: `GD-${id}`,
    besteldatum: '1-8-2026',
    status: 'Verstuurd naar drukker',
    lineCount: 1,
    totalQuantity: 1,
    lines: [],
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.mocked(logActiviteit).mockReset();
});

describe('afrondBestellingen', () => {
  it('patches every bestelling to Afgerond and reports them as afgerond', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const result = await afrondBestellingen([bestelling('1'), bestelling('2')], ACTOR);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/bestelheaders/1');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ status: 'Afgerond' });
    expect(result.afgerond.map((b) => b.id)).toEqual(['1', '2']);
    expect(result.afgerond.every((b) => b.status === 'Afgerond')).toBe(true);
    expect(result.mislukt).toEqual([]);
  });

  it('logs one activiteit per afgeronde bestelling with its bestelnummer', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    await afrondBestellingen([bestelling('1'), bestelling('2')], ACTOR);

    expect(logActiviteit).toHaveBeenCalledTimes(2);
    expect(logActiviteit).toHaveBeenCalledWith('bestelling_afgerond', ACTOR, 'GD-1');
    expect(logActiviteit).toHaveBeenCalledWith('bestelling_afgerond', ACTOR, 'GD-2');
  });

  it('reports a partial failure instead of pretending everything succeeded', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.endsWith('/2') ? Promise.resolve({ ok: false }) : Promise.resolve({ ok: true })
    );
    const result = await afrondBestellingen([bestelling('1'), bestelling('2')], ACTOR);

    expect(result.afgerond.map((b) => b.id)).toEqual(['1']);
    expect(result.mislukt.map((b) => b.id)).toEqual(['2']);
    expect(logActiviteit).toHaveBeenCalledTimes(1);
  });

  it('treats a rejected fetch as a failure rather than throwing', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const result = await afrondBestellingen([bestelling('1')], ACTOR);

    expect(result.afgerond).toEqual([]);
    expect(result.mislukt.map((b) => b.id)).toEqual(['1']);
  });
});
