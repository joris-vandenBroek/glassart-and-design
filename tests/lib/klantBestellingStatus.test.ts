import { describe, expect, it } from 'vitest';
import {
  toKlantBestellingStatus,
  KLANT_STATUS_BADGE_CLASS,
  KLANT_STATUS_TRANSLATION_KEY,
} from '@/lib/klantBestellingStatus';

describe('toKlantBestellingStatus', () => {
  it('maps "Te beoordelen" to inBehandeling', () => {
    expect(toKlantBestellingStatus('Te beoordelen')).toBe('inBehandeling');
  });

  it('maps "Te versturen naar drukker" to inBehandeling', () => {
    expect(toKlantBestellingStatus('Te versturen naar drukker')).toBe('inBehandeling');
  });

  it('maps "Verstuurd naar drukker" to inBehandeling', () => {
    expect(toKlantBestellingStatus('Verstuurd naar drukker')).toBe('inBehandeling');
  });

  it('maps "Afgewezen" to afgewezen', () => {
    expect(toKlantBestellingStatus('Afgewezen')).toBe('afgewezen');
  });

  it('maps "Betaald en afgerond" to afgerond', () => {
    expect(toKlantBestellingStatus('Betaald en afgerond')).toBe('afgerond');
  });

  it('maps Te factureren to inBehandeling', () => {
    expect(toKlantBestellingStatus('Te factureren')).toBe('inBehandeling');
  });

  it('provides a badge class for all 3 klant statuses', () => {
    expect(KLANT_STATUS_BADGE_CLASS.inBehandeling).toBe('bg-sky-400/10 text-sky-300');
    expect(KLANT_STATUS_BADGE_CLASS.afgewezen).toBe('bg-red-400/10 text-red-400');
    expect(KLANT_STATUS_BADGE_CLASS.afgerond).toBe('bg-teal-400/10 text-teal-300');
  });

  it('provides a translation key for all 3 klant statuses', () => {
    expect(KLANT_STATUS_TRANSLATION_KEY.inBehandeling).toBe('statusInBehandeling');
    expect(KLANT_STATUS_TRANSLATION_KEY.afgewezen).toBe('statusAfgewezen');
    expect(KLANT_STATUS_TRANSLATION_KEY.afgerond).toBe('statusAfgerond');
  });
});
