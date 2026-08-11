import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { hashPassword } from '@/lib/server/password';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { GET as getKunstwerkPrijzen } from '@/app/api/kunstwerken/prijzen/route';
import { vervangRelaties } from '@/lib/server/kunstwerkRelaties';
import { veiligOpruimen } from '../../helpers/veiligOpruimen';

const createdMaatIds: string[] = [];
const createdMateriaalsoortIds: string[] = [];
const createdMateriaalIds: string[] = [];
const createdKunstwerkIds: string[] = [];
const createdPrijsgroepIds: string[] = [];
const createdKlantEmails: string[] = [];

afterEach(async () => {
  const pool = getPool();
  // medewerkerCookie() uses a fixed fake userId (no real medewerker row exists for it), so
  // every call leaves an orphaned `sessions` row nothing else in this file would clean up.
  await veiligOpruimen('sessions (medewerker staff-1)', () =>
    pool.query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'staff-1'")
  );
  if (createdKunstwerkIds.length > 0) {
    await veiligOpruimen('kunstwerken', () =>
      pool.query('DELETE FROM kunstwerken WHERE id IN (?)', [createdKunstwerkIds])
    );
    createdKunstwerkIds.length = 0;
  }
  if (createdMaatIds.length > 0) {
    await veiligOpruimen('maten', () => pool.query('DELETE FROM maten WHERE id IN (?)', [createdMaatIds]));
    createdMaatIds.length = 0;
  }
  if (createdMateriaalIds.length > 0) {
    await veiligOpruimen('materialen', () =>
      pool.query('DELETE FROM materialen WHERE id IN (?)', [createdMateriaalIds])
    );
    createdMateriaalIds.length = 0;
  }
  if (createdMateriaalsoortIds.length > 0) {
    await veiligOpruimen('materiaalsoorten', () =>
      pool.query('DELETE FROM materiaalsoorten WHERE id IN (?)', [createdMateriaalsoortIds])
    );
    createdMateriaalsoortIds.length = 0;
  }
  if (createdKlantEmails.length > 0) {
    await veiligOpruimen('klanten', () =>
      pool.query('DELETE FROM klanten WHERE email IN (?)', [createdKlantEmails])
    );
    createdKlantEmails.length = 0;
  }
  if (createdPrijsgroepIds.length > 0) {
    await veiligOpruimen('prijsgroepen', () =>
      pool.query('DELETE FROM prijsgroepen WHERE id IN (?)', [createdPrijsgroepIds])
    );
    createdPrijsgroepIds.length = 0;
  }
});

async function maakMaat(breedte: number, hoogte: number) {
  const maat = await insertRow<{ id: string }>('maten', { breedte, hoogte } as never);
  createdMaatIds.push(maat.id);
  return maat.id;
}

async function maakMateriaal() {
  const soort = await insertRow<{ id: string }>('materiaalsoorten', { omschrijvingNl: 'Test soort' } as never);
  createdMateriaalsoortIds.push(soort.id);
  const materiaal = await insertRow<{ id: string }>('materialen', {
    materiaalsoortId: soort.id,
    materiaaldikte: 4,
    omschrijvingNl: 'Test materiaal',
  } as never);
  createdMateriaalIds.push(materiaal.id);
  return materiaal.id;
}

async function medewerkerCookie(): Promise<string> {
  const sessionId = await createSession('medewerker', 'staff-1');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

async function klantCookieMetPrijsgroep(
  email: string,
  aanpassing: { kortingspercentage?: number; opslagpercentage?: number }
): Promise<string> {
  const prijsgroep = await insertRow<{ id: string }>('prijsgroepen', {
    naam: 'Test prijsgroep',
    kortingspercentage: aanpassing.kortingspercentage ?? null,
    opslagpercentage: aanpassing.opslagpercentage ?? null,
  } as never);
  createdPrijsgroepIds.push(prijsgroep.id);
  const klant = await insertRow<{ id: string }>('klanten', {
    email,
    wachtwoordHash: await hashPassword('x'),
    status: 'Goedgekeurd',
    prijsgroepId: prijsgroep.id,
  } as never);
  createdKlantEmails.push(email);
  const sessionId = await createSession('klant', klant.id);
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

describe('GET /api/kunstwerken/prijzen', () => {
  it('bulk mode: returns computed prijzen keyed by kunstwerkId, without needing auth', async () => {
    const maatId = await maakMaat(41, 61);
    const materiaalId = await maakMateriaal();
    await getPool().query('INSERT INTO prijsmatrix (id, maatId, materiaalId, prijs) VALUES (UUID(), ?, ?, ?)', [
      maatId,
      materiaalId,
      150,
    ]);
    const kunstwerk = await insertRow<{ id: string }>('kunstwerken', { code: 'test-prijzen-bulk' } as never);
    await vervangRelaties(getPool(), kunstwerk.id, { materiaalIds: [materiaalId], maatIds: [maatId] });
    createdKunstwerkIds.push(kunstwerk.id);

    const response = await getKunstwerkPrijzen(new Request('http://localhost/api/kunstwerken/prijzen'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body[kunstwerk.id]).toEqual([{ maatId, materiaalId, prijs: 150 }]);
  });

  it('bulk mode: applies an ingelogde klant\'s prijsgroep korting to the shown prijs', async () => {
    const maatId = await maakMaat(45, 65);
    const materiaalId = await maakMateriaal();
    await getPool().query('INSERT INTO prijsmatrix (id, maatId, materiaalId, prijs) VALUES (UUID(), ?, ?, ?)', [
      maatId,
      materiaalId,
      100,
    ]);
    const kunstwerk = await insertRow<{ id: string }>('kunstwerken', { code: 'test-prijzen-bulk-korting' } as never);
    await vervangRelaties(getPool(), kunstwerk.id, { materiaalIds: [materiaalId], maatIds: [maatId] });
    createdKunstwerkIds.push(kunstwerk.id);
    const cookie = await klantCookieMetPrijsgroep('bulk-prijzen-korting@example.com', { kortingspercentage: 15 });

    const response = await getKunstwerkPrijzen(
      new Request('http://localhost/api/kunstwerken/prijzen', { headers: { cookie } })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body[kunstwerk.id]).toEqual([{ maatId, materiaalId, prijs: 85 }]);
  });

  it('ad-hoc mode: returns prijzen for the given materiaalIds x maatIds without a saved kunstwerk', async () => {
    const maatId = await maakMaat(42, 62);
    const materiaalId = await maakMateriaal();
    await getPool().query('INSERT INTO prijsmatrix (id, maatId, materiaalId, prijs) VALUES (UUID(), ?, ?, ?)', [
      maatId,
      materiaalId,
      175,
    ]);
    const cookie = await medewerkerCookie();

    const response = await getKunstwerkPrijzen(
      new Request(`http://localhost/api/kunstwerken/prijzen?materiaalIds=${materiaalId}&maatIds=${maatId}`, {
        headers: { cookie },
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.prijzen).toEqual([{ maatId, materiaalId, prijs: 175 }]);
  });

  it('ad-hoc mode: rejects a request without a medewerker session', async () => {
    const maatId = await maakMaat(44, 64);
    const materiaalId = await maakMateriaal();

    const response = await getKunstwerkPrijzen(
      new Request(`http://localhost/api/kunstwerken/prijzen?materiaalIds=${materiaalId}&maatIds=${maatId}`)
    );
    expect(response.status).toBe(401);
  });

  it('ad-hoc mode: triggers with only materiaalIds param, maatIds absent, returns empty prijzen array', async () => {
    const materiaalId = await maakMateriaal();
    const cookie = await medewerkerCookie();

    const response = await getKunstwerkPrijzen(
      new Request(`http://localhost/api/kunstwerken/prijzen?materiaalIds=${materiaalId}`, { headers: { cookie } })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.prijzen).toEqual([]);
  });

  it('ad-hoc mode: triggers with only maatIds param, materiaalIds absent, returns empty prijzen array', async () => {
    const maatId = await maakMaat(43, 63);
    const cookie = await medewerkerCookie();

    const response = await getKunstwerkPrijzen(
      new Request(`http://localhost/api/kunstwerken/prijzen?maatIds=${maatId}`, { headers: { cookie } })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.prijzen).toEqual([]);
  });
});
