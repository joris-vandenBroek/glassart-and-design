import { describe, expect, it } from 'vitest';
import { genereerWachtwoord } from '@/lib/server/genereerWachtwoord';
import { MINIMALE_WACHTWOORDLENGTE } from '@/lib/wachtwoordBeleid';

describe('genereerWachtwoord', () => {
  it('levert drie blokken van vier tekens', () => {
    expect(genereerWachtwoord()).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  });

  // Dit wachtwoord wordt door de telefoon voorgelezen: geen teken mag te
  // verwarren zijn met een ander.
  it('bevat geen dubbelzinnige tekens', () => {
    const alles = Array.from({ length: 200 }, () => genereerWachtwoord()).join('');
    for (const teken of ['l', 'o', '0', '1']) {
      expect(alles).not.toContain(teken);
    }
  });

  it('zit ruim boven de minimale wachtwoordlengte', () => {
    expect(genereerWachtwoord().length).toBeGreaterThan(MINIMALE_WACHTWOORDLENGTE);
  });

  it('geeft niet tweemaal hetzelfde', () => {
    const uniek = new Set(Array.from({ length: 100 }, () => genereerWachtwoord()));
    expect(uniek.size).toBe(100);
  });
});
