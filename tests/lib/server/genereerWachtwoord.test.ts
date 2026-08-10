import { describe, expect, it } from 'vitest';
import { genereerWachtwoord } from '@/lib/server/genereerWachtwoord';
import { MINIMALE_WACHTWOORDLENGTE } from '@/lib/wachtwoordBeleid';

describe('genereerWachtwoord', () => {
  // Het bereik knipt `l` en `o` er expliciet uit (a-k, m-n, p-z). Met een ruime
  // `[a-z2-9]` bleef deze test slagen zodra het alfabet die twee ooit terugkreeg,
  // en juist dáár gaat de generator over. `i` mag wél: verward wordt alleen de
  // hoofdletter `I`, en die zit sowieso niet in het alfabet.
  it('levert drie blokken van vier tekens', () => {
    expect(genereerWachtwoord()).toMatch(/^[a-km-np-z2-9]{4}-[a-km-np-z2-9]{4}-[a-km-np-z2-9]{4}$/);
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
