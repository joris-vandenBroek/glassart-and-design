import { describe, expect, it } from 'vitest';
import { resolveOmschrijving } from '@/lib/resolveOmschrijving';

const BASE = {
  omschrijvingNl: 'Nederlandse tekst',
  omschrijvingFr: 'Texte français',
  omschrijvingDe: 'Deutscher Text',
  omschrijvingEn: 'English text',
};

describe('resolveOmschrijving', () => {
  it('returns the Dutch description for locale "nl"', () => {
    expect(resolveOmschrijving(BASE, 'nl')).toBe('Nederlandse tekst');
  });

  it('returns the French description for locale "fr" when filled in', () => {
    expect(resolveOmschrijving(BASE, 'fr')).toBe('Texte français');
  });

  it('returns the German description for locale "de" when filled in', () => {
    expect(resolveOmschrijving(BASE, 'de')).toBe('Deutscher Text');
  });

  it('returns the English description for locale "en" when filled in', () => {
    expect(resolveOmschrijving(BASE, 'en')).toBe('English text');
  });

  it('falls back to Dutch when the French description is empty', () => {
    expect(resolveOmschrijving({ ...BASE, omschrijvingFr: '' }, 'fr')).toBe('Nederlandse tekst');
  });

  it('falls back to Dutch for an unrecognized locale', () => {
    expect(resolveOmschrijving(BASE, 'es')).toBe('Nederlandse tekst');
  });
});
