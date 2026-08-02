import { describe, expect, it } from 'vitest';
import { getKlantInitials } from '@/lib/getKlantInitials';

describe('getKlantInitials', () => {
  it('prefers the company name, taking the first letter of its first two words', () => {
    expect(getKlantInitials('Hotel De Zon', 'Jan Jansen', 'jan@example.com')).toBe('HD');
  });

  it('falls back to contact person when company name is missing', () => {
    expect(getKlantInitials(null, 'Jan Jansen', 'jan@example.com')).toBe('JJ');
  });

  it('falls back to email when company name and contact person are both missing', () => {
    expect(getKlantInitials(null, null, 'jan@example.com')).toBe('JA');
  });

  it('uses the first two letters of a single-word source', () => {
    expect(getKlantInitials('Acme', null, null)).toBe('AC');
  });

  it('returns an empty string when nothing is available', () => {
    expect(getKlantInitials(null, null, null)).toBe('');
  });
});
