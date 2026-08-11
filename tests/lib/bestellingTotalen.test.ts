import { describe, expect, it } from 'vitest';
import { berekenBestellingTotalen } from '@/lib/bestellingTotalen';

describe('berekenBestellingTotalen', () => {
  it('sums prijs × quantity across lines with no korting and no btw', () => {
    const result = berekenBestellingTotalen(
      [
        { prijs: 150, quantity: 3 },
        { prijs: 0, quantity: 2 },
      ],
      null,
      null
    );
    expect(result).toEqual({
      heeftOngeprijsdeRegel: false,
      regelsom: 450,
      korting: 0,
      totaalExclBtw: 450,
      btwPercentage: null,
      btwBedrag: null,
      totaalInclBtw: null,
    });
  });

  it('applies btw on top of the regelsom', () => {
    const result = berekenBestellingTotalen([{ prijs: 150, quantity: 3 }], null, 21);
    expect(result.totaalExclBtw).toBe(450);
    expect(result.btwPercentage).toBe(21);
    expect(result.btwBedrag).toBe(94.5);
    expect(result.totaalInclBtw).toBe(544.5);
  });

  it('subtracts a flat korting from the total before btw', () => {
    const result = berekenBestellingTotalen([{ prijs: 150, quantity: 3 }], 50, 21);
    expect(result.korting).toBe(50);
    expect(result.totaalExclBtw).toBe(400);
    expect(result.btwBedrag).toBe(84);
    expect(result.totaalInclBtw).toBe(484);
  });

  it('clamps a korting larger than the regelsom to a total of 0', () => {
    const result = berekenBestellingTotalen([{ prijs: 150, quantity: 1 }], 999, 21);
    expect(result.totaalExclBtw).toBe(0);
    expect(result.btwBedrag).toBe(0);
    expect(result.totaalInclBtw).toBe(0);
  });

  it('treats a null korting as 0', () => {
    const result = berekenBestellingTotalen([{ prijs: 100, quantity: 1 }], null, null);
    expect(result.korting).toBe(0);
    expect(result.totaalExclBtw).toBe(100);
  });

  it('reports heeftOngeprijsdeRegel and returns null totals when any line has no prijs yet', () => {
    const result = berekenBestellingTotalen(
      [
        { prijs: 150, quantity: 1 },
        { prijs: null, quantity: 1 },
      ],
      null,
      21
    );
    expect(result.heeftOngeprijsdeRegel).toBe(true);
    expect(result.regelsom).toBeNull();
    expect(result.totaalExclBtw).toBeNull();
    expect(result.btwPercentage).toBeNull();
    expect(result.btwBedrag).toBeNull();
    expect(result.totaalInclBtw).toBeNull();
  });

  it('returns null btw fields when no btwPercentage is known, even with a complete total', () => {
    const result = berekenBestellingTotalen([{ prijs: 100, quantity: 1 }], null, null);
    expect(result.totaalExclBtw).toBe(100);
    expect(result.btwPercentage).toBeNull();
    expect(result.btwBedrag).toBeNull();
    expect(result.totaalInclBtw).toBeNull();
  });
});
