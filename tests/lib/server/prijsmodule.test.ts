import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import {
  combineerPrijs,
  prijsopslagVoorKunstenaar,
  berekenPrijzenVoorCombinaties,
  berekenPrijzenVoorAlleKunstwerken,
  berekenBestellijnPrijs,
} from '@/lib/server/prijsmodule';

const createdMaatIds: string[] = [];
const createdMateriaalsoortIds: string[] = [];
const createdMateriaalIds: string[] = [];
const createdKunstenaarIds: string[] = [];
const createdKunstwerkIds: string[] = [];

afterEach(async () => {
  const pool = getPool();
  if (createdKunstwerkIds.length > 0) {
    await pool.query('DELETE FROM kunstwerken WHERE id IN (?)', [createdKunstwerkIds]);
    createdKunstwerkIds.length = 0;
  }
  if (createdKunstenaarIds.length > 0) {
    await pool.query('DELETE FROM kunstenaars WHERE id IN (?)', [createdKunstenaarIds]);
    createdKunstenaarIds.length = 0;
  }
  if (createdMaatIds.length > 0) {
    await pool.query('DELETE FROM maten WHERE id IN (?)', [createdMaatIds]);
    createdMaatIds.length = 0;
  }
  if (createdMateriaalIds.length > 0) {
    await pool.query('DELETE FROM materialen WHERE id IN (?)', [createdMateriaalIds]);
    createdMateriaalIds.length = 0;
  }
  if (createdMateriaalsoortIds.length > 0) {
    await pool.query('DELETE FROM materiaalsoorten WHERE id IN (?)', [createdMateriaalsoortIds]);
    createdMateriaalsoortIds.length = 0;
  }
});

async function maakMaat(breedte: number, hoogte: number) {
  const maat = await insertRow<{ id: string }>('maten', { breedte, hoogte } as never);
  createdMaatIds.push(maat.id);
  return maat.id;
}

async function maakMateriaal(dikte: number) {
  const soort = await insertRow<{ id: string }>('materiaalsoorten', { omschrijving: 'Test soort' } as never);
  createdMateriaalsoortIds.push(soort.id);
  const materiaal = await insertRow<{ id: string }>('materialen', {
    materiaalsoortId: soort.id,
    materiaaldikte: dikte,
    omschrijving: 'Test materiaal',
  } as never);
  createdMateriaalIds.push(materiaal.id);
  return materiaal.id;
}

async function maakKunstenaarMetOpslag(prijsopslag: number) {
  const kunstenaar = await insertRow<{ id: string }>('kunstenaars', {
    naam: 'Test kunstenaar',
  } as never);
  createdKunstenaarIds.push(kunstenaar.id);
  await getPool().query(
    'INSERT INTO kunstenaarAfspraken (id, prijsopslag) VALUES (?, ?)',
    [kunstenaar.id, prijsopslag]
  );
  return kunstenaar.id;
}

describe('combineerPrijs', () => {
  it('adds the opslag to the basisprijs and rounds to 2 decimals', () => {
    expect(combineerPrijs(100, 12.345)).toBe(112.35);
  });
});

describe('prijsopslagVoorKunstenaar', () => {
  it('returns 0 for a null kunstenaarId', async () => {
    expect(await prijsopslagVoorKunstenaar(getPool(), null)).toBe(0);
  });

  it('returns 0 for a kunstenaar with no kunstenaarAfspraken row', async () => {
    const kunstenaar = await insertRow<{ id: string }>('kunstenaars', {
      naam: 'Geen afspraken',
    } as never);
    createdKunstenaarIds.push(kunstenaar.id);
    expect(await prijsopslagVoorKunstenaar(getPool(), kunstenaar.id)).toBe(0);
  });

  it('returns the stored prijsopslag for a kunstenaar that has one', async () => {
    const kunstenaarId = await maakKunstenaarMetOpslag(25);
    expect(await prijsopslagVoorKunstenaar(getPool(), kunstenaarId)).toBe(25);
  });
});

describe('berekenPrijzenVoorCombinaties', () => {
  it('returns the matrixprijs plus opslag for a combinatie with a set prijs', async () => {
    const maatId = await maakMaat(40, 60);
    const materiaalId = await maakMateriaal(4);
    await getPool().query(
      'INSERT INTO prijsmatrix (id, maatId, materiaalId, prijs) VALUES (UUID(), ?, ?, ?)',
      [maatId, materiaalId, 150]
    );
    const kunstenaarId = await maakKunstenaarMetOpslag(20);

    const result = await berekenPrijzenVoorCombinaties(getPool(), kunstenaarId, [materiaalId], [maatId]);
    expect(result).toEqual([{ maatId, materiaalId, prijs: 170 }]);
  });

  it('omits a combinatie that has no matrixprijs set', async () => {
    const maatId = await maakMaat(50, 50);
    const materiaalId = await maakMateriaal(3);
    const result = await berekenPrijzenVoorCombinaties(getPool(), null, [materiaalId], [maatId]);
    expect(result).toEqual([]);
  });
});

describe('berekenPrijzenVoorAlleKunstwerken', () => {
  it('computes prijzen only for a kunstwerk\'s own materiaalIds x maatIds, including its kunstenaar opslag', async () => {
    const maatId = await maakMaat(60, 80);
    const materiaalId = await maakMateriaal(5);
    await getPool().query(
      'INSERT INTO prijsmatrix (id, maatId, materiaalId, prijs) VALUES (UUID(), ?, ?, ?)',
      [maatId, materiaalId, 200]
    );
    const kunstenaarId = await maakKunstenaarMetOpslag(30);
    const kunstwerk = await insertRow<{ id: string }>(
      'kunstwerken',
      { naam: 'Test werk', kunstenaarId, materiaalIds: [materiaalId], maatIds: [maatId] } as never,
      ['materiaalIds', 'maatIds']
    );
    createdKunstwerkIds.push(kunstwerk.id);

    const result = await berekenPrijzenVoorAlleKunstwerken(getPool());
    expect(result[kunstwerk.id]).toEqual([{ maatId, materiaalId, prijs: 230 }]);
  });

  it('gives an empty array for a maatloos kunstwerk (no maatIds)', async () => {
    const kunstwerk = await insertRow<{ id: string }>(
      'kunstwerken',
      { naam: 'Maatloos werk', maatIds: [], materiaalIds: [] } as never,
      ['materiaalIds', 'maatIds']
    );
    createdKunstwerkIds.push(kunstwerk.id);
    const result = await berekenPrijzenVoorAlleKunstwerken(getPool());
    expect(result[kunstwerk.id]).toEqual([]);
  });
});

describe('berekenBestellijnPrijs', () => {
  it('resolves a vaste prijs for a normal maat+materiaal with a matrixprijs', async () => {
    const maatId = await maakMaat(80, 80);
    const materiaalId = await maakMateriaal(4);
    await getPool().query(
      'INSERT INTO prijsmatrix (id, maatId, materiaalId, prijs) VALUES (UUID(), ?, ?, ?)',
      [maatId, materiaalId, 300]
    );
    const result = await berekenBestellijnPrijs(
      getPool(),
      { kunstenaarId: null, maatIds: [maatId], prijsPerM2: null },
      { maatId, materiaalId }
    );
    expect(result).toEqual({ status: 'vast', prijs: 300 });
  });

  it('resolves onbekend for a normal maat with no matrixprijs set', async () => {
    const maatId = await maakMaat(90, 90);
    const materiaalId = await maakMateriaal(4);
    const result = await berekenBestellijnPrijs(
      getPool(),
      { kunstenaarId: null, maatIds: [maatId], prijsPerM2: null },
      { maatId, materiaalId }
    );
    expect(result).toEqual({ status: 'onbekend' });
  });

  it('resolves op-aanvraag for a custom maatId not in the kunstwerk\'s maatIds', async () => {
    const materiaalId = await maakMateriaal(4);
    const result = await berekenBestellijnPrijs(
      getPool(),
      { kunstenaarId: null, maatIds: ['echte-maat-id'], prijsPerM2: null },
      { maatId: '', materiaalId }
    );
    expect(result).toEqual({ status: 'op-aanvraag' });
  });

  it('resolves a vaste prijs from prijsPerM2 x afmetingen for a maatloos kunstwerk', async () => {
    const materiaalId = await maakMateriaal(3);
    const result = await berekenBestellijnPrijs(
      getPool(),
      { kunstenaarId: null, maatIds: [], prijsPerM2: 100 },
      { maatId: '', materiaalId, breedte: 120, hoogte: 60 }
    );
    expect(result).toEqual({ status: 'vast', prijs: 72 });
  });

  it('resolves onbekend for a maatloos kunstwerk with missing afmetingen', async () => {
    const materiaalId = await maakMateriaal(3);
    const result = await berekenBestellijnPrijs(
      getPool(),
      { kunstenaarId: null, maatIds: [], prijsPerM2: 100 },
      { maatId: '', materiaalId }
    );
    expect(result).toEqual({ status: 'onbekend' });
  });
});
