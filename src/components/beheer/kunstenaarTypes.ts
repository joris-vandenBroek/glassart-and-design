export interface Kunstenaar {
  id: string;
  naam: string;
  foto: string | null;
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;
  prijsafspraken: string;
  verkooprecht: 'open' | 'alleen-kunstenaar';
  klantId: string | null;
  exclusiefVoorKlantId: string | null;
}
