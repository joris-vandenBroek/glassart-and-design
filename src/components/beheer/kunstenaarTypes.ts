import type { FieldValue } from 'firebase/firestore';

export interface Kunstenaar {
  id: string;
  naam: string;
  foto: string | null;
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;
  // Let op: `prijsafspraken` staat bewust NIET in dit publiek leesbare document,
  // maar in de medewerker-only collectie `kunstenaarAfspraken/{id}` (zelfde doc-id).
  verkooprecht: 'open' | 'alleen-kunstenaar';
  klantId: string | null;
  exclusiefVoorKlantId: string | null;
}

/**
 * Payload voor élke update van een publiek leesbaar `kunstenaars/{id}`-document.
 *
 * `prijsafspraken` mag hierin alleen voorkomen als `deleteField()`-sentinel. Documenten
 * van vóór de splitsing hebben het veld nog staan, en bij een update is
 * `request.resource.data` in firestore.rules het SAMENGEVOEGDE eindresultaat — dus zonder
 * die strip weigert de regel `!('prijsafspraken' in request.resource.data)` de write, én
 * blijft de interne afspraak publiek leesbaar. Alle schrijfpaden naar `kunstenaars/{id}`
 * moeten de strip meesturen: KunstenaarsSection (opslaan) én KlantModal (exclusiviteit).
 */
export type KunstenaarUpdate = Partial<Omit<Kunstenaar, 'id'>> & { prijsafspraken?: FieldValue };
