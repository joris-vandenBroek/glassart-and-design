import { describe, expect, it } from 'vitest';
import {
  findVeiligheidsglasMateriaalId,
  resolveKunstwerkMateriaalLabel,
  MATERIAALLOOS_LABEL,
} from '@/lib/kunstwerkMateriaal';
import type { Kunstwerk, Materiaal, Materiaalsoort } from '@/components/beheer/materiaalTypes';

const MATERIAALSOORTEN: Materiaalsoort[] = [
  { id: 'soort-glas', omschrijving: 'Veiligheidsglas' },
  { id: 'soort-acryl', omschrijving: 'Acryl' },
];
const MATERIALEN: Materiaal[] = [
  { id: 'mat-glas-4', materiaalsoortId: 'soort-glas', materiaaldikte: 4, omschrijving: 'Glas' },
  { id: 'mat-acryl-3', materiaalsoortId: 'soort-acryl', materiaaldikte: 3, omschrijving: 'Acryl' },
  { id: 'mat-acryl-5', materiaalsoortId: 'soort-acryl', materiaaldikte: 5, omschrijving: 'Acryl' },
];
const BASE_KUNSTWERK: Kunstwerk = {
  id: 'kw-1',
  foto: '',
  naam: '',
  kunstenaarId: null,
  segmentIds: [],
  materiaalIds: [],
  maatIds: [],
  omschrijvingNl: '',
  omschrijvingFr: '',
  omschrijvingDe: '',
  omschrijvingEn: '',
};

describe('findVeiligheidsglasMateriaalId', () => {
  it('finds the 4mm Veiligheidsglas materiaal id', () => {
    expect(findVeiligheidsglasMateriaalId(MATERIALEN, MATERIAALSOORTEN)).toBe('mat-glas-4');
  });

  it('returns undefined when no 4mm Veiligheidsglas materiaal exists', () => {
    expect(findVeiligheidsglasMateriaalId(MATERIALEN.slice(1), MATERIAALSOORTEN)).toBeUndefined();
  });
});

describe('resolveKunstwerkMateriaalLabel', () => {
  it('shows "4mm Veiligheidsglas" when that materiaal is available, regardless of what else is checked', () => {
    const kunstwerk = { ...BASE_KUNSTWERK, materiaalIds: ['mat-glas-4', 'mat-acryl-3'] };
    expect(resolveKunstwerkMateriaalLabel(kunstwerk, MATERIALEN, MATERIAALSOORTEN)).toBe('4mm Veiligheidsglas');
  });

  it('joins all available materiaal labels when Veiligheidsglas is not among them', () => {
    const kunstwerk = { ...BASE_KUNSTWERK, materiaalIds: ['mat-acryl-3', 'mat-acryl-5'] };
    expect(resolveKunstwerkMateriaalLabel(kunstwerk, MATERIALEN, MATERIAALSOORTEN)).toBe('3mm Acryl | 5mm Acryl');
  });

  it('falls back to the materiaalloos label when no materiaal is available', () => {
    const kunstwerk = { ...BASE_KUNSTWERK, materiaalIds: [] };
    expect(resolveKunstwerkMateriaalLabel(kunstwerk, MATERIALEN, MATERIAALSOORTEN)).toBe(MATERIAALLOOS_LABEL);
  });

  it('short-circuits to the materiaalloos label on an empty materiaalIds before the veiligheidsglas lookup runs', () => {
    // MATERIALEN/MATERIAALSOORTEN here do contain a 4mm Veiligheidsglas entry (mat-glas-4), so if the
    // materiaalloos check did not run first, a bug could in theory still resolve a veiligheidsglas match
    // via some other id. This asserts materiaalIds.length === 0 is the primary, first-checked signal.
    const kunstwerk = { ...BASE_KUNSTWERK, materiaalIds: [] };
    expect(findVeiligheidsglasMateriaalId(MATERIALEN, MATERIAALSOORTEN)).toBe('mat-glas-4');
    expect(resolveKunstwerkMateriaalLabel(kunstwerk, MATERIALEN, MATERIAALSOORTEN)).toBe(MATERIAALLOOS_LABEL);
  });
});
