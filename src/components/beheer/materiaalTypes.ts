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
  actief?: boolean;
}

/**
 * `mysql2` geeft een BOOLEAN-kolom terug als 0/1, dus nooit `=== true` vergelijken.
 * Een ontbrekende waarde telt als actief: de kolom is NOT NULL DEFAULT TRUE, dus dat
 * kan alleen bij een testfixture van vóór deze vlag.
 */
export function isMateriaalActief(materiaal: Pick<Materiaal, 'actief'>): boolean {
  return materiaal.actief === undefined ? true : Boolean(materiaal.actief);
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

export interface Categorie {
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
  categorieIds?: string[];
  aiGegenereerd?: boolean;
  prijsPerM2?: number;
  toonInCollectie?: boolean;
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;
}

/**
 * Zelfde 0/1-valkuil als bij `isMateriaalActief`: `mysql2` geeft een BOOLEAN-kolom
 * als getal terug. Een ontbrekende waarde telt als tonen -- de kolom is NOT NULL
 * DEFAULT TRUE, dus dat kan alleen bij een testfixture van vóór deze vlag.
 */
export function toontKunstwerkInCollectie(kunstwerk: Pick<Kunstwerk, 'toonInCollectie'>): boolean {
  return kunstwerk.toonInCollectie === undefined ? true : Boolean(kunstwerk.toonInCollectie);
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
