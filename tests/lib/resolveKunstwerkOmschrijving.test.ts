import { describe, expect, it } from 'vitest';
import { resolveKunstwerkOmschrijving } from '@/lib/resolveKunstwerkOmschrijving';
import type { Kunstwerk } from '@/components/beheer/materiaalTypes';

const BASE_KUNSTWERK: Kunstwerk = {
  id: 'kw-1',
  foto: 'https://example.com/foto.jpg',
  code: 'Kunstwerk',
  kunstenaarId: null,
  segmentIds: [],
  materiaalIds: [],
  maatIds: [],
  omschrijvingNl: 'Nederlandse tekst',
  omschrijvingFr: 'Texte français',
  omschrijvingDe: 'Deutscher Text',
  omschrijvingEn: 'English text',
};

describe('resolveKunstwerkOmschrijving', () => {
  it('returns the Dutch description for locale "nl"', () => {
    expect(resolveKunstwerkOmschrijving(BASE_KUNSTWERK, 'nl')).toBe('Nederlandse tekst');
  });

  it('returns the French description for locale "fr" when filled in', () => {
    expect(resolveKunstwerkOmschrijving(BASE_KUNSTWERK, 'fr')).toBe('Texte français');
  });

  it('returns the German description for locale "de" when filled in', () => {
    expect(resolveKunstwerkOmschrijving(BASE_KUNSTWERK, 'de')).toBe('Deutscher Text');
  });

  it('returns the English description for locale "en" when filled in', () => {
    expect(resolveKunstwerkOmschrijving(BASE_KUNSTWERK, 'en')).toBe('English text');
  });

  it('falls back to Dutch when the French description is empty', () => {
    expect(resolveKunstwerkOmschrijving({ ...BASE_KUNSTWERK, omschrijvingFr: '' }, 'fr')).toBe(
      'Nederlandse tekst'
    );
  });

  it('falls back to Dutch for an unrecognized locale', () => {
    expect(resolveKunstwerkOmschrijving(BASE_KUNSTWERK, 'es')).toBe('Nederlandse tekst');
  });
});
