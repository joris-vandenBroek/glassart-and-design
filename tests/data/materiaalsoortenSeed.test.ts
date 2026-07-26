import { describe, expect, it } from 'vitest';
import { MATERIAALSOORTEN_SEED, buildMaterialenSeed } from '@/data/materiaalsoortenSeed';
import type { Materiaalsoort } from '@/components/beheer/materiaalTypes';

describe('MATERIAALSOORTEN_SEED', () => {
  it('contains the 3 printable material types, with eigen-maat settings for glas/dibond/acryl', () => {
    expect(MATERIAALSOORTEN_SEED).toEqual([
      { omschrijving: 'Veiligheidsglas', staatEigenMaatToe: true, levertijdMaandenEigenMaat: 3 },
      { omschrijving: 'Dibond', staatEigenMaatToe: true, maxBreedte: 200, maxHoogte: 300 },
      { omschrijving: 'Acryl', staatEigenMaatToe: true, maxBreedte: 200, maxHoogte: 300 },
    ]);
  });
});

describe('buildMaterialenSeed', () => {
  const SOORTEN: Materiaalsoort[] = [
    { id: 'soort-veiligheidsglas', omschrijving: 'Veiligheidsglas' },
    { id: 'soort-dibond', omschrijving: 'Dibond' },
    { id: 'soort-acryl', omschrijving: 'Acryl' },
  ];

  it('builds one materiaal per homepage entry, referencing the given materiaalsoort ids', () => {
    const result = buildMaterialenSeed(SOORTEN);
    expect(result).toEqual([
      { materiaalsoortId: 'soort-veiligheidsglas', materiaaldikte: 4, omschrijving: 'Onze specialiteit. Kristalhelder, sterk en veilig.' },
      { materiaalsoortId: 'soort-dibond', materiaaldikte: 3, omschrijving: 'Lichtgewicht, stijf en vormvast met een matte uitstraling.' },
      { materiaalsoortId: 'soort-acryl', materiaaldikte: 3, omschrijving: 'Licht en helder met een luxe glanzende look.' },
      { materiaalsoortId: 'soort-acryl', materiaaldikte: 5, omschrijving: 'Extra diepte en stevigheid voor een indrukwekkend effect.' },
      { materiaalsoortId: 'soort-acryl', materiaaldikte: 10, omschrijving: 'Maximale diepwerking voor exclusieve presentatie.' },
    ]);
  });

  it('returns nothing for a materiaalsoort with no seed mapping', () => {
    const result = buildMaterialenSeed([{ id: 'soort-onbekend', omschrijving: 'Onbekend' }]);
    expect(result).toEqual([]);
  });

  it('returns an empty array for an empty materiaalsoorten list', () => {
    expect(buildMaterialenSeed([])).toEqual([]);
  });
});
