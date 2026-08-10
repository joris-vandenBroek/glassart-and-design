import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { hashPassword } from '@/lib/server/password';
import {
  combineerPrijs,
  prijsopslagVoorKunstenaar,
  pasPrijsgroepToe,
  prijsgroepVoorKlant,
  berekenPrijzenVoorCombinaties,
  berekenPrijzenVoorAlleKunstwerken,
  berekenBestellijnPrijs,
} from '@/lib/server/prijsmodule';

const createdMaatIds: string[] = [];
const createdMateriaalsoortIds: string[] = [];
const createdMateriaalIds: string[] = [];
const createdKunstenaarIds: string[] = [];
const createdKunstwerkIds: string[] = [];
const createdPrijsgroepIds: string[] = [];
const createdKlantEmails: string[] = [];

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
  if (createdKlantEmails.length > 0) {
    await pool.query('DELETE FROM klanten WHERE email IN (?)', [createdKlantEmails]);
    createdKlantEmails.length = 0;
  }
  if (createdPrijsgroepIds.length > 0) {
    await pool.query('DELETE FROM prijsgroepen WHERE id IN (?)', [createdPrijsgroepIds]);
    createdPrijsgroepIds.length = 0;
  }
});

async function maakPrijsgroep(aanpassing: { kortingspercentage?: number; opslagpercentage?: number }): Promise<string> {
  const prijsgroep = await insertRow<{ id: string }>('prijsgroepen', {
    naam: 'Test prijsgroep',
    kortingspercentage: aanpassing.kortingspercentage ?? null,
    opslagpercentage: aanpassing.opslagpercentage ?? null,
  } as never);
  createdPrijsgroepIds.push(prijsgroep.id);
  return prijsgroep.id;
}

async function maakKlantMetPrijsgroep(email: string, prijsgroepId: string | null): Promise<string> {
  const klant = await insertRow<{ id: string }>('klanten', {
    email,
    wachtwoordHash: await hashPassword('x'),
    status: 'Goedgekeurd',
    prijsgroepId,
  } as never);
  createdKlantEmails.push(email);
  return klant.id;
}

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

describe('pasPrijsgroepToe', () => {
  it('returns the prijs unchanged when there is no prijsgroep', () => {
    expect(pasPrijsgroepToe(100, null)).toBe(100);
  });

  it('subtracts the kortingspercentage from the prijs', () => {
    expect(pasPrijsgroepToe(100, { kortingspercentage: 15, opslagpercentage: null })).toBe(85);
  });

  it('adds the opslagpercentage to the prijs', () => {
    expect(pasPrijsgroepToe(100, { kortingspercentage: null, opslagpercentage: 20 })).toBe(120);
  });

  it('rounds the result to 2 decimals', () => {
    expect(pasPrijsgroepToe(99.99, { kortingspercentage: 10, opslagpercentage: null })).toBe(89.99);
  });
});

describe('prijsgroepVoorKlant', () => {
  it('returns null for a null klantId', async () => {
    expect(await prijsgroepVoorKlant(getPool(), null)).toBeNull();
  });

  it('returns null for a klant without a prijsgroepId', async () => {
    const klantId = await maakKlantMetPrijsgroep('geen-prijsgroep@example.com', null);
    expect(await prijsgroepVoorKlant(getPool(), klantId)).toBeNull();
  });

  it('returns the kortingspercentage/opslagpercentage for a klant with a prijsgroep', async () => {
    const prijsgroepId = await maakPrijsgroep({ kortingspercentage: 12 });
    const klantId = await maakKlantMetPrijsgroep('met-prijsgroep@example.com', prijsgroepId);
    expect(await prijsgroepVoorKlant(getPool(), klantId)).toEqual({
      kortingspercentage: 12,
      opslagpercentage: null,
    });
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
      { code: 'test-prijsmodule-basis', kunstenaarId, materiaalIds: [materiaalId], maatIds: [maatId] } as never,
      ['materiaalIds', 'maatIds']
    );
    createdKunstwerkIds.push(kunstwerk.id);

    const result = await berekenPrijzenVoorAlleKunstwerken(getPool());
    expect(result[kunstwerk.id]).toEqual([{ maatId, materiaalId, prijs: 230 }]);
  });

  it('gives an empty array for a maatloos kunstwerk (no maatIds)', async () => {
    const kunstwerk = await insertRow<{ id: string }>(
      'kunstwerken',
      { code: 'test-prijsmodule-maatloos', maatIds: [], materiaalIds: [] } as never,
      ['materiaalIds', 'maatIds']
    );
    createdKunstwerkIds.push(kunstwerk.id);
    const result = await berekenPrijzenVoorAlleKunstwerken(getPool());
    expect(result[kunstwerk.id]).toEqual([]);
  });

  it('applies the ingelogde klant\'s prijsgroep korting on top of the kunstenaar opslag', async () => {
    const maatId = await maakMaat(61, 81);
    const materiaalId = await maakMateriaal(5);
    await getPool().query(
      'INSERT INTO prijsmatrix (id, maatId, materiaalId, prijs) VALUES (UUID(), ?, ?, ?)',
      [maatId, materiaalId, 200]
    );
    const kunstenaarId = await maakKunstenaarMetOpslag(30);
    const kunstwerk = await insertRow<{ id: string }>(
      'kunstwerken',
      { code: 'test-prijsmodule-korting', kunstenaarId, materiaalIds: [materiaalId], maatIds: [maatId] } as never,
      ['materiaalIds', 'maatIds']
    );
    createdKunstwerkIds.push(kunstwerk.id);
    const prijsgroepId = await maakPrijsgroep({ kortingspercentage: 10 });
    const klantId = await maakKlantMetPrijsgroep('bulk-korting@example.com', prijsgroepId);

    const result = await berekenPrijzenVoorAlleKunstwerken(getPool(), klantId);
    // basisprijs 200 + kunstenaar opslag 30 = 230, min 10% korting = 207
    expect(result[kunstwerk.id]).toEqual([{ maatId, materiaalId, prijs: 207 }]);
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

  it('subtracts the klant\'s prijsgroep korting from a matrix-based prijs', async () => {
    const maatId = await maakMaat(81, 81);
    const materiaalId = await maakMateriaal(4);
    await getPool().query(
      'INSERT INTO prijsmatrix (id, maatId, materiaalId, prijs) VALUES (UUID(), ?, ?, ?)',
      [maatId, materiaalId, 200]
    );
    const prijsgroepId = await maakPrijsgroep({ kortingspercentage: 25 });
    const klantId = await maakKlantMetPrijsgroep('lijn-korting@example.com', prijsgroepId);

    const result = await berekenBestellijnPrijs(
      getPool(),
      { kunstenaarId: null, maatIds: [maatId], prijsPerM2: null },
      { maatId, materiaalId },
      klantId
    );
    expect(result).toEqual({ status: 'vast', prijs: 150 });
  });

  it('adds the klant\'s prijsgroep opslag to a prijsPerM2-based prijs', async () => {
    const materiaalId = await maakMateriaal(3);
    const prijsgroepId = await maakPrijsgroep({ opslagpercentage: 10 });
    const klantId = await maakKlantMetPrijsgroep('lijn-opslag@example.com', prijsgroepId);

    const result = await berekenBestellijnPrijs(
      getPool(),
      { kunstenaarId: null, maatIds: [], prijsPerM2: 100 },
      { maatId: '', materiaalId, breedte: 120, hoogte: 60 },
      klantId
    );
    // 120cm x 60cm x 100/m2 = 72, plus 10% opslag = 79.20
    expect(result).toEqual({ status: 'vast', prijs: 79.2 });
  });
});
