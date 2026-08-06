import { EU_LANDCODES } from '@/data/landen';

export type BtwValidatie = 'ok' | 'leeg' | 'ongeldig';

// Greece is the one member state whose VAT prefix differs from its ISO country code.
const BTW_PREFIX: Record<string, string> = { GR: 'EL' };

// Format per member state, prefix included, matched against the normalised value.
export const BTW_PATRONEN: Record<string, RegExp> = {
  AT: /^ATU\d{8}$/,
  BE: /^BE[01]\d{9}$/,
  BG: /^BG\d{9,10}$/,
  CY: /^CY\d{8}[A-Z]$/,
  CZ: /^CZ\d{8,10}$/,
  DE: /^DE\d{9}$/,
  DK: /^DK\d{8}$/,
  EE: /^EE\d{9}$/,
  ES: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/,
  FI: /^FI\d{8}$/,
  FR: /^FR[A-Z0-9]{2}\d{9}$/,
  GR: /^EL\d{9}$/,
  HR: /^HR\d{11}$/,
  HU: /^HU\d{8}$/,
  IE: /^IE(\d{7}[A-Z]{1,2}|\d[A-Z0-9+*]\d{5}[A-Z])$/,
  IT: /^IT\d{11}$/,
  LT: /^LT(\d{9}|\d{12})$/,
  LU: /^LU\d{8}$/,
  LV: /^LV\d{11}$/,
  MT: /^MT\d{8}$/,
  NL: /^NL\d{9}B\d{2}$/,
  PL: /^PL\d{10}$/,
  PT: /^PT\d{9}$/,
  RO: /^RO\d{2,10}$/,
  SE: /^SE\d{12}$/,
  SI: /^SI\d{8}$/,
  SK: /^SK\d{10}$/,
};

// Uppercase and drop the separators people type (spaces, dots, hyphens, slashes).
// + and * survive on purpose: an Irish VAT number may legitimately contain them.
export function normaliseerBtwNummer(waarde: string): string {
  return waarde.toUpperCase().replace(/[^A-Z0-9+*]/g, '');
}

export function isEuLand(landcode: string | null | undefined): boolean {
  return EU_LANDCODES.has((landcode ?? '').toUpperCase());
}

// A Dutch klant is billed with Dutch VAT, so their number is nice to have but not needed.
// Outside the EU there is no VAT number to ask for. Everywhere else we need it to be able
// to shift the VAT ("btw verlegd") instead of paying it ourselves.
export function isBtwNummerVerplicht(landcode: string | null | undefined): boolean {
  const code = (landcode ?? '').toUpperCase();
  return isEuLand(code) && code !== 'NL';
}

export function valideerBtwNummer(
  waarde: string | null | undefined,
  landcode: string | null | undefined
): BtwValidatie {
  const genormaliseerd = normaliseerBtwNummer(waarde ?? '');
  if (genormaliseerd === '') return 'leeg';

  const code = (landcode ?? '').toUpperCase();
  // No worldwide format exists, so anything non-empty is accepted outside the EU --
  // better than blocking a Swiss or American klant on a format we cannot know.
  if (!isEuLand(code)) return 'ok';

  const prefix = BTW_PREFIX[code] ?? code;
  const metPrefix = genormaliseerd.startsWith(prefix) ? genormaliseerd : prefix + genormaliseerd;
  return BTW_PATRONEN[code].test(metPrefix) ? 'ok' : 'ongeldig';
}
