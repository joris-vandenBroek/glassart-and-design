import { describe, expect, it } from 'vitest';
import { EU_LANDCODES } from '@/data/landen';
import {
  normaliseerBtwNummer,
  isEuLand,
  isBtwNummerVerplicht,
  valideerBtwNummer,
  BTW_PATRONEN,
} from '@/lib/btwNummer';

const GELDIG: Record<string, string> = {
  AT: 'ATU13585627',
  BE: 'BE0411905847',
  BG: 'BG175074752',
  CY: 'CY10259033P',
  CZ: 'CZ25123891',
  DE: 'DE811907980',
  DK: 'DK13585628',
  EE: 'EE100594102',
  ES: 'ESA58818501',
  FI: 'FI09853608',
  FR: 'FR40303265045',
  GR: 'EL094259216',
  HR: 'HR33392005961',
  HU: 'HU12892312',
  IE: 'IE6388047V',
  IT: 'IT00743110157',
  LT: 'LT100001919017',
  LU: 'LU26375245',
  LV: 'LV40003032949',
  MT: 'MT11679112',
  NL: 'NL123456789B01',
  PL: 'PL5260001246',
  PT: 'PT502011378',
  RO: 'RO14399840',
  SE: 'SE556188840401',
  SI: 'SI50223054',
  SK: 'SK2020317068',
};

describe('normaliseerBtwNummer', () => {
  it('strips spaces, dots and hyphens and uppercases', () => {
    expect(normaliseerBtwNummer(' nl 1234.567-89 b01 ')).toBe('NL123456789B01');
  });

  it('keeps the + and * characters an Irish VAT number may contain', () => {
    expect(normaliseerBtwNummer('ie 6a+8047 v')).toBe('IE6A+8047V');
  });
});

describe('isEuLand', () => {
  it('recognises EU member states', () => {
    expect(isEuLand('BE')).toBe(true);
    expect(isEuLand('NL')).toBe(true);
  });

  it('rejects non-EU countries and empty input', () => {
    expect(isEuLand('CH')).toBe(false);
    expect(isEuLand('US')).toBe(false);
    expect(isEuLand('GB')).toBe(false);
    expect(isEuLand('')).toBe(false);
    expect(isEuLand(null)).toBe(false);
  });
});

describe('isBtwNummerVerplicht', () => {
  it('is required for EU countries other than the Netherlands', () => {
    expect(isBtwNummerVerplicht('BE')).toBe(true);
    expect(isBtwNummerVerplicht('DE')).toBe(true);
  });

  it('is not required for the Netherlands or outside the EU', () => {
    expect(isBtwNummerVerplicht('NL')).toBe(false);
    expect(isBtwNummerVerplicht('CH')).toBe(false);
    expect(isBtwNummerVerplicht(null)).toBe(false);
  });
});

describe('valideerBtwNummer', () => {
  it('accepts a valid number for every EU country', () => {
    for (const [code, nummer] of Object.entries(GELDIG)) {
      expect(valideerBtwNummer(nummer, code), `${code} ${nummer}`).toBe('ok');
    }
  });

  // Four extra digits, not two: BG, CZ and RO have variable-length patterns where a
  // two-digit suffix can still land inside the allowed range and stay valid.
  it('rejects an over-long number for every EU country', () => {
    for (const [code, nummer] of Object.entries(GELDIG)) {
      expect(valideerBtwNummer(`${nummer}0000`, code), `${code} te lang`).toBe('ongeldig');
    }
  });

  it('uses the EL prefix for Greece even though the ISO code is GR', () => {
    expect(valideerBtwNummer('EL094259216', 'GR')).toBe('ok');
    expect(valideerBtwNummer('GR094259216', 'GR')).toBe('ongeldig');
  });

  it('accepts a number typed without its country prefix', () => {
    expect(valideerBtwNummer('123456789B01', 'NL')).toBe('ok');
    expect(valideerBtwNummer('094259216', 'GR')).toBe('ok');
  });

  it('accepts a number typed with spaces and dots', () => {
    expect(valideerBtwNummer('NL 1234.567.89 B01', 'NL')).toBe('ok');
  });

  it('rejects a number carrying another EU country prefix', () => {
    expect(valideerBtwNummer('NL123456789B01', 'BE')).toBe('ongeldig');
  });

  it('reports empty input as leeg, never as ongeldig', () => {
    expect(valideerBtwNummer('', 'BE')).toBe('leeg');
    expect(valideerBtwNummer('   ', 'NL')).toBe('leeg');
    expect(valideerBtwNummer(null, 'CH')).toBe('leeg');
    expect(valideerBtwNummer(undefined, 'BE')).toBe('leeg');
  });

  it('accepts any non-empty value outside the EU, since there is no format to check', () => {
    expect(valideerBtwNummer('CHE-116.281.710 MWST', 'CH')).toBe('ok');
    expect(valideerBtwNummer('12-3456789', 'US')).toBe('ok');
    expect(valideerBtwNummer('whatever', '')).toBe('ok');
  });
});

describe('EU_LANDCODES and BTW_PATRONEN stay in sync', () => {
  it('has exactly 27 member states', () => {
    expect(EU_LANDCODES.size).toBe(27);
  });

  it('has a pattern for every EU country and no orphan patterns', () => {
    expect(Object.keys(BTW_PATRONEN).sort()).toEqual([...EU_LANDCODES].sort());
  });

  it('only lists country codes that exist in LANDEN', async () => {
    const { LANDEN } = await import('@/data/landen');
    const bekend = new Set(LANDEN.map((land) => land.code));
    for (const code of EU_LANDCODES) {
      expect(bekend.has(code), `${code} ontbreekt in LANDEN`).toBe(true);
    }
  });
});
