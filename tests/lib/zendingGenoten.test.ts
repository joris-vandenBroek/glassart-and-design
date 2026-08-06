import { describe, expect, it } from 'vitest';
import { openstaandeZendingGenoten, type Zending } from '@/lib/zendingGenoten';
import type { Bestelling } from '@/components/beheer/BestellingenSection';

function bestelling(id: string, status: Bestelling['status']): Bestelling {
  return {
    id,
    klantId: `klant-${id}`,
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
    const b2 = bestelling('2', 'Afgerond');
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
