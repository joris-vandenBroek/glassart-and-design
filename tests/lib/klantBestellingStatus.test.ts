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

  it('provides a badge class for both klant statuses', () => {
    expect(KLANT_STATUS_BADGE_CLASS.inBehandeling).toBe('bg-sky-400/10 text-sky-300');
    expect(KLANT_STATUS_BADGE_CLASS.afgewezen).toBe('bg-red-400/10 text-red-400');
  });

  it('provides a translation key for both klant statuses', () => {
    expect(KLANT_STATUS_TRANSLATION_KEY.inBehandeling).toBe('statusInBehandeling');
    expect(KLANT_STATUS_TRANSLATION_KEY.afgewezen).toBe('statusAfgewezen');
  });
});
