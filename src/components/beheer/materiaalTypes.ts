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
  artiest: string;
  segmentIds: string[];
  materiaalIds: string[];
  maatIds: string[];
  prijzen: PrijsRegel[];
  prijsPerM2?: number;
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
