export interface Kunstenaar {
  id: string;
  naam: string;
  foto: string | null;
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;
  // Let op: `prijsafspraken` staat bewust NIET in deze publiek leesbare tabel,
  // maar in de medewerker-only tabel `kunstenaarAfspraken` (zelfde id).
  verkooprecht: 'open' | 'alleen-kunstenaar';
  klantId: string | null;
  exclusiefVoorKlantId: string | null;
}
