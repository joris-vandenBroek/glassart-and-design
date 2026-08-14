export interface Materiaalsoort {
  id: string;
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;
  staatEigenMaatToe?: boolean;
  maxBreedte?: number | null;
  maxHoogte?: number | null;
  levertijdMaandenEigenMaat?: number | null;
}

export interface Materiaal {
  id: string;
  materiaalsoortId: string;
  materiaaldikte: number;
  prijsPerM2?: number;
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;
}

export interface Maat {
  id: string;
  breedte: number;
  hoogte: number;
}

export type KunstwerkFormaat = 'vierkant' | 'liggend' | 'staand' | 'alle';

export function isVierkanteMaat(maat: Maat): boolean {
  return maat.breedte === maat.hoogte;
}

export interface Segment {
  id: string;
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;
}

export interface Stijl {
  id: string;
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;
}

export interface Onderwerp {
  id: string;
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;
}

export interface Kunstwerk {
  id: string;
  foto: string;
  code: string;
  kunstenaarnr: string | null;
  formaat?: KunstwerkFormaat | null;
  segmentIds: string[];
  materiaalIds: string[];
  maatIds: string[];
  stijlIds?: string[];
  onderwerpIds?: string[];
  aiGegenereerd?: boolean;
  prijsPerM2?: number;
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;
}

export interface Prijsgroep {
  id: string;
  naam: string;
  kortingspercentage: number | null;
  opslagpercentage: number | null;
}

export interface Drukker {
  id: string;
  drukkernr: string;
  naam: string;
  adres: string;
  postcode: string;
  plaats: string;
  email: string;
  prijsafspraken: string;
  standaard?: boolean;
}
