export interface Kunstenaar {
  id: string;
  // Uniek volgnummer (KU-00001), door de server uitgegeven en niet te wijzigen.
  // kunstwerken en klanten verwijzen hiermee naar de kunstenaar.
  kunstenaarnr: string;
  naam: string;
  foto: string | null;
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;
  // Let op: `prijsafspraken` staat bewust NIET in deze publiek leesbare tabel,
  // maar in de medewerker-only tabel `kunstenaarAfspraken` (zelfde id).
  // Max 2 entries: leeg = open voor iedereen; 2 entries vereist dat één ervan de
  // klant is wiens Klant.kunstenaarnr naar deze kunstenaar wijst (afgedwongen in
  // KunstenaarsSection, niet in de database).
  exclusieveKlantIds: string[];
}
