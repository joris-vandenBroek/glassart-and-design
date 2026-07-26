import type { Kunstenaar } from '@/components/beheer/kunstenaarTypes';

export type OrderBlockedReason = 'exclusive' | 'artistOnly' | 'unavailable' | null;

export interface OrderRight {
  canOrder: boolean;
  blockedReason: OrderBlockedReason;
}

/**
 * Bepaalt of `userUid` een kunstwerk van deze kunstenaar mag bestellen.
 *
 * Spiegelt bewust `magKunstwerkBestellen`/`magKunstenaarBestellen` uit firestore.rules —
 * dát is de enige echte handhaving (statische export, geen server). Waar de regels falen
 * (een `get()` op een verdwenen kunstenaar-document is daar een denial), faalt deze helper
 * óók: een nog niet geladen collectie of een dangling `kunstenaarId` levert
 * `blockedReason: 'unavailable'` op in plaats van stilzwijgend "wel bestelbaar".
 */
export function resolveOrderRight(
  kunstenaarId: string | null,
  kunstenaars: Kunstenaar[] | null,
  userUid: string | undefined
): OrderRight {
  const dataReady = kunstenaarId === null || kunstenaars !== null;
  const kunstenaar =
    kunstenaarId && kunstenaars ? kunstenaars.find((item) => item.id === kunstenaarId) ?? null : null;
  const missing = kunstenaarId !== null && kunstenaars !== null && kunstenaar === null;
  const isOwnArtwork = kunstenaar?.klantId != null && kunstenaar.klantId === userUid;
  const isExclusiveToOther = kunstenaar?.exclusiefVoorKlantId != null && kunstenaar.exclusiefVoorKlantId !== userUid;
  const isArtistOnlyForOthers = kunstenaar?.verkooprecht === 'alleen-kunstenaar' && !isOwnArtwork;
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
