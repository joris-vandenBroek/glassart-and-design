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

export type KunstwerkFormaat = 'vierkant' | 'liggend' | 'staand';

export function isVierkanteMaat(maat: Maat): boolean {
  return maat.breedte === maat.hoogte;
}

export interface Segment {
  id: string;
  omschrijving: string;
}

export interface Stijl {
  id: string;
  omschrijving: string;
}

export interface Onderwerp {
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
  formaat?: KunstwerkFormaat | null;
  segmentIds: string[];
  materiaalIds: string[];
  maatIds: string[];
  stijlIds?: string[];
  onderwerpIds?: string[];
  aiGegenereerd?: boolean;
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

export interface Drukker {
  id: string;
  naam: string;
  adres: string;
  postcode: string;
  plaats: string;
  email: string;
  prijsafspraken: string;
}
