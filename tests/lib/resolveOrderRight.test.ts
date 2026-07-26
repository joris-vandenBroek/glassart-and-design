import { describe, expect, it } from 'vitest';
import { resolveOrderRight } from '@/lib/resolveOrderRight';
import type { Kunstenaar } from '@/components/beheer/kunstenaarTypes';

function kunstenaar(overrides: Partial<Kunstenaar> = {}): Kunstenaar {
  return {
    id: 'ka-1',
    naam: 'Sabrina Glasser',
    foto: null,
    omschrijvingNl: '',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    verkooprecht: 'open',
    klantId: null,
    exclusiefVoorKlantId: null,
    ...overrides,
  };
}

describe('resolveOrderRight', () => {
  it('always allows ordering when the kunstwerk has no kunstenaar, even before the collection loaded', () => {
    expect(resolveOrderRight(null, null, 'uid-1')).toEqual({ canOrder: true, blockedReason: null });
    expect(resolveOrderRight(null, [], 'uid-1')).toEqual({ canOrder: true, blockedReason: null });
  });

  it('fails closed while the kunstenaars collection has not loaded yet', () => {
    expect(resolveOrderRight('ka-1', null, 'uid-1')).toEqual({
      canOrder: false,
      blockedReason: 'unavailable',
    });
  });

  it('fails closed for a dangling kunstenaarId that is not in the loaded collection', () => {
    expect(resolveOrderRight('ka-weg', [kunstenaar()], 'uid-1')).toEqual({
      canOrder: false,
      blockedReason: 'unavailable',
    });
  });

  it('allows ordering an open kunstenaar without exclusivity', () => {
    expect(resolveOrderRight('ka-1', [kunstenaar()], 'uid-1')).toEqual({
      canOrder: true,
      blockedReason: null,
    });
  });

  it('blocks a kunstenaar that is exclusive to another klant', () => {
    expect(
      resolveOrderRight('ka-1', [kunstenaar({ exclusiefVoorKlantId: 'ander-uid' })], 'uid-1')
    ).toEqual({ canOrder: false, blockedReason: 'exclusive' });
  });

  it('allows the klant who holds the exclusivity', () => {
    expect(resolveOrderRight('ka-1', [kunstenaar({ exclusiefVoorKlantId: 'uid-1' })], 'uid-1')).toEqual({
      canOrder: true,
      blockedReason: null,
    });
  });

  it('blocks an alleen-kunstenaar work for anyone other than the linked klant', () => {
    expect(
      resolveOrderRight('ka-1', [kunstenaar({ verkooprecht: 'alleen-kunstenaar', klantId: 'kunstenaar-uid' })], 'uid-1')
    ).toEqual({ canOrder: false, blockedReason: 'artistOnly' });
    // Also blocked for an anonymous visitor with no uid at all.
    expect(
      resolveOrderRight('ka-1', [kunstenaar({ verkooprecht: 'alleen-kunstenaar', klantId: null })], undefined)
    ).toEqual({ canOrder: false, blockedReason: 'artistOnly' });
  });

  it('allows the kunstenaar to order their own work, even when it is exclusive to someone else', () => {
    expect(
      resolveOrderRight(
        'ka-1',
        [
          kunstenaar({
            verkooprecht: 'alleen-kunstenaar',
            klantId: 'uid-1',
            exclusiefVoorKlantId: 'ander-uid',
          }),
        ],
        'uid-1'
      )
    ).toEqual({ canOrder: true, blockedReason: null });
  });
});
