import { describe, expect, it } from 'vitest';
import { baseUrlVoorOmgeving, leesImportCredentials } from '../../scripts/lib/importOmgeving';

describe('baseUrlVoorOmgeving', () => {
  it('geeft de staging-URL voor staging', () => {
    expect(baseUrlVoorOmgeving('staging')).toBe('https://staging.glassartanddesign.com');
  });

  it('geeft de productie-URL voor productie', () => {
    expect(baseUrlVoorOmgeving('productie')).toBe('https://glassartanddesign.com');
  });
});

describe('leesImportCredentials', () => {
  it('haalt e-mail en wachtwoord uit het env-object', () => {
    const credentials = leesImportCredentials({
      IMPORT_MEDEWERKER_EMAIL: 'import@example.com',
      IMPORT_MEDEWERKER_PASSWORD: 'geheim',
    });
    expect(credentials).toEqual({ email: 'import@example.com', wachtwoord: 'geheim' });
  });

  it('gooit een duidelijke fout als IMPORT_MEDEWERKER_EMAIL ontbreekt', () => {
    expect(() => leesImportCredentials({ IMPORT_MEDEWERKER_PASSWORD: 'geheim' })).toThrow(
      'IMPORT_MEDEWERKER_EMAIL'
    );
  });

  it('gooit een duidelijke fout als IMPORT_MEDEWERKER_PASSWORD ontbreekt', () => {
    expect(() => leesImportCredentials({ IMPORT_MEDEWERKER_EMAIL: 'import@example.com' })).toThrow(
      'IMPORT_MEDEWERKER_PASSWORD'
    );
  });
});
