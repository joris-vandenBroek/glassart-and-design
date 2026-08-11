import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fetchZendingen, openstaandeZendingGenoten, type Zending } from '@/lib/zendingGenoten';
import type { Bestelling } from '@/components/beheer/BestellingenSection';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
});

function bestelling(id: string, status: Bestelling['status']): Bestelling {
  return {
    id,
    klantnr: `klant-${id}`,
    companyName: `Bedrijf ${id}`,
    bestelnr: `GD-${id}`,
    besteldatum: '1-8-2026',
    status,
    lineCount: 1,
    totalQuantity: 1,
    lines: [],
  };
}

function zending(id: string, bestellingIds: string[]): Zending {
  return { id, drukkerId: `drukker-${id}`, drukkerNaam: `Drukker ${id}`, verzondenOp: null, bestellingIds };
}

describe('openstaandeZendingGenoten', () => {
  it('returns nothing when there are no zendingen', () => {
    const b1 = bestelling('1', 'Verstuurd naar drukker');
    expect(openstaandeZendingGenoten([], [b1], [b1])).toEqual([]);
  });

  it('leaves out the bestellingen that are being afgerond right now', () => {
    const b1 = bestelling('1', 'Verstuurd naar drukker');
    const b2 = bestelling('2', 'Verstuurd naar drukker');
    const result = openstaandeZendingGenoten([zending('z1', ['1', '2'])], [b1, b2], [b1, b2]);
    expect(result).toEqual([]);
  });

  it('reports a genoot that is still "Verstuurd naar drukker"', () => {
    const b1 = bestelling('1', 'Verstuurd naar drukker');
    const b2 = bestelling('2', 'Verstuurd naar drukker');
    const result = openstaandeZendingGenoten([zending('z1', ['1', '2'])], [b1], [b1, b2]);
    expect(result).toHaveLength(1);
    expect(result[0].zending.id).toBe('z1');
    expect(result[0].bestellingen.map((b) => b.id)).toEqual(['2']);
  });

  it('ignores genoten that are already afgerond', () => {
    const b1 = bestelling('1', 'Verstuurd naar drukker');
    const b2 = bestelling('2', 'Betaald en afgerond');
    expect(openstaandeZendingGenoten([zending('z1', ['1', '2'])], [b1], [b1, b2])).toEqual([]);
  });

  it('ignores genoten that are already Te factureren', () => {
    const b1 = bestelling('1', 'Verstuurd naar drukker');
    const b2 = bestelling('2', 'Te factureren');
    expect(openstaandeZendingGenoten([zending('z1', ['1', '2'])], [b1], [b1, b2])).toEqual([]);
  });

  it('ignores ids that no longer exist in the bestellingen list', () => {
    const b1 = bestelling('1', 'Verstuurd naar drukker');
    expect(openstaandeZendingGenoten([zending('z1', ['1', 'weg'])], [b1], [b1])).toEqual([]);
  });

  it('groups genoten per zending and never lists the same bestelling twice', () => {
    const b1 = bestelling('1', 'Verstuurd naar drukker');
    const b2 = bestelling('2', 'Verstuurd naar drukker');
    const b3 = bestelling('3', 'Verstuurd naar drukker');
    const result = openstaandeZendingGenoten(
      [zending('z1', ['1', '2']), zending('z2', ['1', '2', '3'])],
      [b1],
      [b1, b2, b3]
    );
    expect(result.map((entry) => entry.zending.id)).toEqual(['z1', 'z2']);
    expect(result[0].bestellingen.map((b) => b.id)).toEqual(['2']);
    expect(result[1].bestellingen.map((b) => b.id)).toEqual(['3']);
  });
});

function rawZendingRow(id: string, bestellingIds: string[]) {
  return {
    id,
    drukkerId: 'drukker-1',
    drukkerNaam: 'Drukkerij Janssen',
    verzondenOp: null,
    bestellingIds,
  };
}

describe('fetchZendingen', () => {
  it('returns an empty list without calling fetch when there are no ids', async () => {
    const result = await fetchZendingen([]);
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does a single call for 200 or fewer ids', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const ids = Array.from({ length: 200 }, (_, i) => `id-${i}`);
    await fetchZendingen(ids);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // De /api/drukkerzendingen-route geeft 400 boven 200 ids in één aanroep
  // (zie MAX_IDS in src/app/api/drukkerzendingen/route.ts). Een selectie van
  // 250 bestellingen moet dus in twee blokken worden opgeknipt, anders faalt
  // de hele lookup stilzwijgend en verdwijnt de zendinggenoot-melding.
  it('splits 250 ids into two calls and dedupes a zending seen in both blocks', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    fetchMock.mockImplementation((url: string) => {
      const query = new URL(url, 'https://example.com').searchParams.get('bestellingIds') ?? '';
      const idsInCall = query.split(',');
      // "grens" komt in beide blokken voor -- eerste blok bevat id-199, tweede
      // blok bevat id-200. We laten de zending in de respons van BEIDE
      // aanroepen terugkomen om de dedup-logica te toetsen.
      if (idsInCall.includes('id-199') || idsInCall.includes('id-200')) {
        return Promise.resolve({
          ok: true,
          json: async () => [rawZendingRow('z-grens', ['id-199', 'id-200'])],
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    const result = await fetchZendingen(ids);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('z-grens');
  });

  it('throws when a batch request fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    await expect(fetchZendingen(['id-1'])).rejects.toThrow('zending lookup failed');
  });
});
