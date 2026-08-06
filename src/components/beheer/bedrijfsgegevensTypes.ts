export type Taal = 'nl' | 'en' | 'fr' | 'de';

export type MeertaligeTekst = Record<Taal, string>;

export interface Contactpersoon {
  id: string;
  naam: string;
  telefoon: string;
  rol: MeertaligeTekst;
}

export interface Bedrijfsgegevens {
  bezoekadres: string;
  email: string;
  whatsappNummer: string;
  tenaamstelling: string;
  bic: string;
  iban: string;
  kvkNummer: string;
  btwNummer: string;
  openingstijden: MeertaligeTekst;
  contactpersonen: Contactpersoon[];
}
