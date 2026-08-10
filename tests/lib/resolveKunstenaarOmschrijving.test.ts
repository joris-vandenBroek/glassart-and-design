import { describe, expect, it } from 'vitest';
import { resolveKunstenaarOmschrijving } from '@/lib/resolveKunstenaarOmschrijving';
import type { Kunstenaar } from '@/components/beheer/kunstenaarTypes';

const BASE_KUNSTENAAR: Kunstenaar = {
  id: 'ka-1',
  kunstenaarnr: 'KU-00001',
  naam: 'Sabrina Glasser',
  foto: null,
  omschrijvingNl: 'Nederlandse tekst',
  omschrijvingFr: 'Texte français',
  omschrijvingDe: 'Deutscher Text',
  omschrijvingEn: 'English text',
  exclusieveKlantIds: [],
};

describe('resolveKunstenaarOmschrijving', () => {
  it('returns the Dutch description for locale "nl"', () => {
    expect(resolveKunstenaarOmschrijving(BASE_KUNSTENAAR, 'nl')).toBe('Nederlandse tekst');
  });

  it('returns the French description for locale "fr" when filled in', () => {
    expect(resolveKunstenaarOmschrijving(BASE_KUNSTENAAR, 'fr')).toBe('Texte français');
  });

  it('returns the German description for locale "de" when filled in', () => {
    expect(resolveKunstenaarOmschrijving(BASE_KUNSTENAAR, 'de')).toBe('Deutscher Text');
  });

  it('returns the English description for locale "en" when filled in', () => {
    expect(resolveKunstenaarOmschrijving(BASE_KUNSTENAAR, 'en')).toBe('English text');
  });

  it('falls back to Dutch when the French description is empty', () => {
    expect(resolveKunstenaarOmschrijving({ ...BASE_KUNSTENAAR, omschrijvingFr: '' }, 'fr')).toBe('Nederlandse tekst');
  });

  it('falls back to Dutch for an unrecognized locale', () => {
    expect(resolveKunstenaarOmschrijving(BASE_KUNSTENAAR, 'es')).toBe('Nederlandse tekst');
  });
});
