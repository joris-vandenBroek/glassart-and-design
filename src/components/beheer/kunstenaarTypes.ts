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
 * `prijsafspraken` is hier VERPLICHT en mag alleen de `deleteField()`-sentinel zijn, zodat
 * dit type niet te construeren is zonder bewust de strip mee te sturen. Documenten van vóór
 * de splitsing hebben het veld nog staan, en bij een update is `request.resource.data` in
 * firestore.rules het SAMENGEVOEGDE eindresultaat — dus zonder die strip weigert de regel
 * `!('prijsafspraken' in request.resource.data)` de write, én blijft de interne afspraak
 * publiek leesbaar.
 *
 * Dit type wordt bewust NIET in component-props gebruikt: alleen `updateKunstenaarVeilig`
 * in BeheerShell.tsx construeert het. Dat is het enige schrijfpad naar `kunstenaars/{id}`,
 * en de enige plek die weet dat een legacy-waarde eerst gemigreerd moet worden voordat hij
 * gestript mag worden.
 */
export type KunstenaarUpdate = Partial<Omit<Kunstenaar, 'id'>> & { prijsafspraken: FieldValue };
