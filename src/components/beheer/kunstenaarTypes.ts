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
