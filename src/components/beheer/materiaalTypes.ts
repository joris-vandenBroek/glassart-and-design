export interface Materiaalsoort {
  id: string;
  omschrijving: string;
  staatEigenMaatToe?: boolean;
  maxBreedte?: number | null;
  maxHoogte?: number | null;
  levertijdMaandenEigenMaat?: number | null;
}

export interface Materiaal {
  id: string;
  materiaalsoortId: string;
  materiaaldikte: number;
  omschrijving: string;
}

export interface Maat {
  id: string;
  breedte: number;
  hoogte: number;
}

export interface Segment {
  id: string;
  omschrijving: string;
}

export interface PrijsRegel {
  materiaalId: string;
  maatId: string;
  prijs: number;
}

export interface Kunstwerk {
  id: string;
  foto: string;
  naam: string;
  kunstenaarId: string | null;
  segmentIds: string[];
  materiaalIds: string[];
  maatIds: string[];
  prijzen: PrijsRegel[];
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;
}

export interface Prijsgroep {
  id: string;
  naam: string;
  kortingspercentage: number;
}

export interface Drukker {
  id: string;
  naam: string;
  adres: string;
  postcode: string;
  plaats: string;
  email: string;
  prijsafspraken: string;
}
