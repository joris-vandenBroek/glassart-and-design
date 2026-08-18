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
/**
 * Heeft déze klant het exclusieve recht op werk van deze kunstenaar?
 *
 * Bewust smaller dan `resolveOrderRight`: die zegt óók "ja" bij een kunstenaar zonder
 * exclusiviteit. Hier gaat het om het tegenovergestelde -- alleen de klanten die
 * expliciet in `exclusieveKlantIds` staan. Dat is wat een kunstwerk dat uit de collectie
 * is gehaald tóch zichtbaar mag maken. Een nog niet geladen kunstenaarslijst levert
 * `false`: dan blijft het kunstwerk verborgen in plaats van kort op te flitsen.
 *
 * `GET /api/kunstenaars` redigeert de lijst voor niet-medewerkers (zie
 * `redigeerExclusieveKlantIds`), maar juist het antwoord op "sta ik erin" blijft
 * daarna kloppen.
 */
export function heeftExclusiefRecht(
  kunstenaarnr: string | null,
  kunstenaars: Kunstenaar[] | null,
  userUid: string | undefined
): boolean {
  if (!kunstenaarnr || !kunstenaars || userUid == null) return false;
  const kunstenaar = kunstenaars.find((item) => item.kunstenaarnr === kunstenaarnr) ?? null;
  return (kunstenaar?.exclusieveKlantIds ?? []).includes(userUid);
}

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
