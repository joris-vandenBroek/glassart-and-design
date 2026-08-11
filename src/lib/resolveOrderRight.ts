import type { Kunstenaar } from '@/components/beheer/kunstenaarTypes';

export type OrderBlockedReason = 'exclusive' | 'unavailable' | null;

export interface OrderRight {
  canOrder: boolean;
  blockedReason: OrderBlockedReason;
}

/**
 * Bepaalt of `userUid` een kunstwerk van deze kunstenaar mag bestellen.
 *
 * Spiegelt bewust `checkOrderRight` in `POST /api/bestelheaders` — dát is de enige echte
 * handhaving, deze client-side versie is puur een UX-hint. Waar de servercheck faalt
 * (een dangling `kunstenaarnr` is daar een afwijzing), faalt deze helper óók: een nog niet
 * geladen collectie of een dangling `kunstenaarnr` levert `blockedReason: 'unavailable'`
 * op in plaats van stilzwijgend "wel bestelbaar".
 *
 * `exclusieveKlantIds` is de enige bron van waarheid: een lege lijst is open voor
 * iedereen, een gevulde lijst is alleen voor de klanten daarin — ook als de kunstenaar
 * zelf een gekoppeld klantaccount heeft dat er niet in staat. Er is bewust géén
 * automatische "kunstenaar mag altijd eigen werk bestellen"-uitzondering meer.
 */
export function resolveOrderRight(
  kunstenaarnr: string | null,
  kunstenaars: Kunstenaar[] | null,
  userUid: string | undefined
): OrderRight {
  // Bewust losse `== null`: kunstwerk-rijen van vóór deze feature hebben helemaal geen
  // `kunstenaarnr`-kolom, en useApiCollection geeft de ruwe API-respons door, dus die
  // lezen als `undefined`. Een lege string blijft wél dichtklappen.
  const dataReady = kunstenaarnr == null || kunstenaars !== null;
  const kunstenaar =
    kunstenaarnr && kunstenaars ? kunstenaars.find((item) => item.kunstenaarnr === kunstenaarnr) ?? null : null;
  const missing = kunstenaarnr != null && kunstenaars !== null && kunstenaar === null;
  const exclusieveKlantIds = kunstenaar?.exclusieveKlantIds ?? [];
  const isRestricted = exclusieveKlantIds.length > 0;
  const isAllowed = userUid != null && exclusieveKlantIds.includes(userUid);
  const canOrder = dataReady && !missing && (!kunstenaar || !isRestricted || isAllowed);
  const blockedReason: OrderBlockedReason = canOrder ? null : !dataReady || missing ? 'unavailable' : 'exclusive';
  return { canOrder, blockedReason };
}
