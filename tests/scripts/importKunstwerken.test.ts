import { describe, expect, it } from 'vitest';
import {
  bepaalVolgendeCode,
  kiesMatendeMaten,
  mimeTypeVoorBestand,
  vindExacteMatch,
  bepaalFormaatVanBestand,
  parseArgs,
} from '../../scripts/lib/importKunstwerken';

describe('bepaalVolgendeCode', () => {
  it('begint bij 0001 als er nog geen codes voor het prefix bestaan', () => {
    expect(bepaalVolgendeCode([], 'GLA-PRO')).toBe('GLA-PRO-0001');
  });

  it('telt op vanaf de hoogste bestaande code', () => {
    expect(bepaalVolgendeCode(['GLA-PRO-0001', 'GLA-PRO-0002'], 'GLA-PRO')).toBe('GLA-PRO-0003');
  });

  it('negeert codes van een andere collectie', () => {
    expect(bepaalVolgendeCode(['GLA-AFR-0005', 'GLA-PRO-0001'], 'GLA-PRO')).toBe('GLA-PRO-0002');
  });

  it('gebruikt altijd een vaste breedte van vier cijfers, ook als de bestaande code smaller is', () => {
    // Dit is precies het gedrag dat src/lib/kunstwerkCodeVoorstel.ts bewust heeft afgeschaft
    // (zie de toelichting daar): niet de breedte van de bestaande code overnemen.
    expect(bepaalVolgendeCode(['GLA-SAB-007'], 'GLA-SAB')).toBe('GLA-SAB-0008');
  });

  it('werkt met een prefix die regex-speciale tekens bevat', () => {
    expect(bepaalVolgendeCode(['GLA-F1-0001'], 'GLA-F1')).toBe('GLA-F1-0002');
  });
});

describe('kiesMatendeMaten', () => {
  const maten = [
    { id: 'a', breedte: 60, hoogte: 90 }, // staand
    { id: 'b', breedte: 90, hoogte: 60 }, // liggend
    { id: 'c', breedte: 70, hoogte: 70 }, // vierkant
  ];

  it('kiest alleen staande maten bij formaat staand', () => {
    expect(kiesMatendeMaten(maten, 'staand')).toEqual(['a']);
  });

  it('kiest alleen liggende maten bij formaat liggend', () => {
    expect(kiesMatendeMaten(maten, 'liggend')).toEqual(['b']);
  });

  it('kiest alleen vierkante maten bij formaat vierkant', () => {
    expect(kiesMatendeMaten(maten, 'vierkant')).toEqual(['c']);
  });

  it('kiest alle maten bij formaat alle', () => {
    expect(kiesMatendeMaten(maten, 'alle')).toEqual(['a', 'b', 'c']);
  });
});

describe('mimeTypeVoorBestand', () => {
  it.each([
    ['foto.jpg', 'image/jpeg'],
    ['foto.JPEG', 'image/jpeg'],
    ['foto.png', 'image/png'],
    ['foto.webp', 'image/webp'],
  ])('%s -> %s', (bestandsnaam, verwacht) => {
    expect(mimeTypeVoorBestand(bestandsnaam)).toBe(verwacht);
  });

  it('gooit een fout bij een niet-ondersteunde extensie', () => {
    expect(() => mimeTypeVoorBestand('foto.gif')).toThrow('Niet-ondersteunde bestandsextensie');
  });
});

describe('vindExacteMatch', () => {
  const bestaande = [{ id: '1', omschrijvingNl: 'Afrika' }];

  it('vindt een match ongeacht hoofdletters en spaties', () => {
    expect(vindExacteMatch(bestaande, '  afrika ')).toEqual(bestaande[0]);
  });

  it('geeft null als er niets past', () => {
    expect(vindExacteMatch(bestaande, 'Azië')).toBeNull();
  });
});

describe('bepaalFormaatVanBestand', () => {
  it('leest een staand bestand correct', async () => {
    const resultaat = await bepaalFormaatVanBestand('tests/fixtures/images/staand-60x90.png');
    expect(resultaat).toEqual({ breedte: 60, hoogte: 90, formaat: 'staand' });
  });

  it('leest een liggend bestand correct', async () => {
    const resultaat = await bepaalFormaatVanBestand('tests/fixtures/images/liggend-90x60.png');
    expect(resultaat).toEqual({ breedte: 90, hoogte: 60, formaat: 'liggend' });
  });

  it('leest een vierkant bestand correct', async () => {
    const resultaat = await bepaalFormaatVanBestand('tests/fixtures/images/vierkant-70x70.png');
    expect(resultaat).toEqual({ breedte: 70, hoogte: 70, formaat: 'vierkant' });
  });
});

describe('parseArgs', () => {
  it('parseert subcommando en --vlag-waarde-paren', () => {
    expect(parseArgs(['login', '--omgeving', 'staging'])).toEqual({
      subcommand: 'login',
      opts: { omgeving: 'staging' },
    });
  });

  it('gooit een fout bij een vlag zonder waarde', () => {
    expect(() => parseArgs(['login', '--omgeving'])).toThrow("'--omgeving' heeft geen waarde");
  });

  it('gooit een fout bij een argument dat niet met -- begint', () => {
    expect(() => parseArgs(['login', 'staging'])).toThrow("onverwacht argument 'staging'");
  });
});
