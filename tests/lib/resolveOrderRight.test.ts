import { describe, expect, it } from 'vitest';
import { resolveOrderRight } from '@/lib/resolveOrderRight';
import type { Kunstenaar } from '@/components/beheer/kunstenaarTypes';

function kunstenaar(overrides: Partial<Kunstenaar> = {}): Kunstenaar {
  return {
    id: 'ka-1',
    kunstenaarnr: 'KU-00001',
    naam: 'Sabrina Glasser',
    foto: null,
    website: null,
    omschrijvingNl: '',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    exclusieveKlantIds: [],
    ...overrides,
  };
}

describe('resolveOrderRight', () => {
  it('always allows ordering when the kunstwerk has no kunstenaar, even before the collection loaded', () => {
    expect(resolveOrderRight(null, null, 'uid-1')).toEqual({ canOrder: true, blockedReason: null });
    expect(resolveOrderRight(null, [], 'uid-1')).toEqual({ canOrder: true, blockedReason: null });
  });

  it('treats a kunstwerk document without a kunstenaarnr field at all as having no kunstenaar', () => {
    expect(resolveOrderRight(undefined as unknown as null, [kunstenaar()], 'uid-1')).toEqual({
      canOrder: true,
      blockedReason: null,
    });
    expect(resolveOrderRight(undefined as unknown as null, null, 'uid-1')).toEqual({
      canOrder: true,
      blockedReason: null,
    });
  });

  it('still fails closed for an empty-string kunstenaarnr', () => {
    expect(resolveOrderRight('', [kunstenaar()], 'uid-1')).toEqual({
      canOrder: false,
      blockedReason: 'unavailable',
    });
  });

  it('treats a missing exclusieveKlantIds field defensively as open', () => {
    expect(
      resolveOrderRight('KU-00001', [kunstenaar({ exclusieveKlantIds: undefined as unknown as string[] })], 'uid-1')
    ).toEqual({ canOrder: true, blockedReason: null });
  });

  it('fails closed while the kunstenaars collection has not loaded yet', () => {
    expect(resolveOrderRight('KU-00001', null, 'uid-1')).toEqual({
      canOrder: false,
      blockedReason: 'unavailable',
    });
  });

  it('fails closed for a dangling kunstenaarnr that is not in the loaded collection', () => {
    expect(resolveOrderRight('KU-99999', [kunstenaar()], 'uid-1')).toEqual({
      canOrder: false,
      blockedReason: 'unavailable',
    });
  });

  it('allows ordering a kunstenaar with an empty exclusieveKlantIds list', () => {
    expect(resolveOrderRight('KU-00001', [kunstenaar()], 'uid-1')).toEqual({
      canOrder: true,
      blockedReason: null,
    });
  });

  it('blocks a kunstenaar exclusive to one other klant', () => {
    expect(
      resolveOrderRight('KU-00001', [kunstenaar({ exclusieveKlantIds: ['ander-uid'] })], 'uid-1')
    ).toEqual({ canOrder: false, blockedReason: 'exclusive' });
    // Also blocked for an anonymous visitor with no uid at all.
    expect(
      resolveOrderRight('KU-00001', [kunstenaar({ exclusieveKlantIds: ['ander-uid'] })], undefined)
    ).toEqual({ canOrder: false, blockedReason: 'exclusive' });
  });

  it('allows the single klant listed in exclusieveKlantIds', () => {
    expect(resolveOrderRight('KU-00001', [kunstenaar({ exclusieveKlantIds: ['uid-1'] })], 'uid-1')).toEqual({
      canOrder: true,
      blockedReason: null,
    });
  });

  it('allows both klanten when exclusieveKlantIds has 2 entries, blocks a third klant', () => {
    const withTwo = kunstenaar({ exclusieveKlantIds: ['uid-1', 'uid-2'] });
    expect(resolveOrderRight('KU-00001', [withTwo], 'uid-1')).toEqual({ canOrder: true, blockedReason: null });
    expect(resolveOrderRight('KU-00001', [withTwo], 'uid-2')).toEqual({ canOrder: true, blockedReason: null });
    expect(resolveOrderRight('KU-00001', [withTwo], 'uid-3')).toEqual({ canOrder: false, blockedReason: 'exclusive' });
  });

  it('blocks the kunstenaar\'s own klant from ordering when exclusieveKlantIds names only someone else', () => {
    // No automatic "artist can always order their own work" bypass: if the artist's
    // klant-id is not in the list, they are blocked just like any other klant.
    expect(
      resolveOrderRight('KU-00001', [kunstenaar({ exclusieveKlantIds: ['ander-uid'] })], 'kunstenaar-uid')
    ).toEqual({ canOrder: false, blockedReason: 'exclusive' });
  });
});
