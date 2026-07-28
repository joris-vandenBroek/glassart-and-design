import type { Kunstenaar } from '@/components/beheer/kunstenaarTypes';

export type OrderBlockedReason = 'exclusive' | 'artistOnly' | 'unavailable' | null;

export interface OrderRight {
  canOrder: boolean;
  blockedReason: OrderBlockedReason;
}

/**
 * Bepaalt of `userUid` een kunstwerk van deze kunstenaar mag bestellen.
 *
 * Spiegelt bewust `checkOrderRight` in `POST /api/bestelheaders` — dát is de enige echte
 * handhaving, deze client-side versie is puur een UX-hint. Waar de servercheck faalt
 * (een dangling `kunstenaarId` is daar een afwijzing), faalt deze helper óók: een nog niet
 * geladen collectie of een dangling `kunstenaarId` levert `blockedReason: 'unavailable'`
 * op in plaats van stilzwijgend "wel bestelbaar".
 */
export function resolveOrderRight(
  kunstenaarId: string | null,
  kunstenaars: Kunstenaar[] | null,
  userUid: string | undefined
): OrderRight {
  // Bewust losse `== null`: kunstwerk-rijen van vóór deze feature hebben helemaal geen
  // `kunstenaarId`-kolom, en useApiCollection geeft de ruwe API-respons door, dus die
  // lezen als `undefined`. Een lege string blijft wél dichtklappen.
  const dataReady = kunstenaarId == null || kunstenaars !== null;
  const kunstenaar =
    kunstenaarId && kunstenaars ? kunstenaars.find((item) => item.id === kunstenaarId) ?? null : null;
  const missing = kunstenaarId != null && kunstenaars !== null && kunstenaar === null;
  const isOwnArtwork = kunstenaar?.klantId != null && kunstenaar.klantId === userUid;
  const isExclusiveToOther = kunstenaar?.exclusiefVoorKlantId != null && kunstenaar.exclusiefVoorKlantId !== userUid;
  // Spiegelt `ka.verkooprecht == 'open'` uit de regels: alles wat niet expliciet 'open' is,
  // valt dicht — ook een ontbrekende of onbekende waarde.
  const isArtistOnlyForOthers = kunstenaar?.verkooprecht !== 'open' && !isOwnArtwork;
  const canOrder =
    dataReady && !missing && (!kunstenaar || isOwnArtwork || (!isExclusiveToOther && !isArtistOnlyForOthers));
  const blockedReason: OrderBlockedReason = canOrder
    ? null
    : !dataReady || missing
    ? 'unavailable'
    : isExclusiveToOther
    ? 'exclusive'
    : 'artistOnly';
  return { canOrder, blockedReason };
}
