import { describe, expect, it, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { hashPassword } from '@/lib/server/password';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { POST as createHeader, GET as listHeaders } from '@/app/api/bestelheaders/route';
import { PATCH as patchHeader } from '@/app/api/bestelheaders/[id]/route';
import { GET as getStatusHistorie } from '@/app/api/bestelheaders/[id]/statushistorie/route';
import { vervangRelaties } from '@/lib/server/kunstwerkRelaties';
import { veiligOpruimen } from '../../helpers/veiligOpruimen';

const BESTELNR_PADDING = 5;

const createdKlantEmails: string[] = [];
const createdKunstwerkIds: string[] = [];
const createdKunstenaarIds: string[] = [];
const createdMaatIds: string[] = [];
const createdMateriaalIds: string[] = [];
const createdMateriaalsoortIds: string[] = [];
const createdPrijsgroepIds: string[] = [];

afterEach(async () => {
  const pool = getPool();
  // Elke stap staat los in veiligOpruimen: als er eentje faalt (bv. schema drift op de
  // gedeelde staging-DB door een nog niet gemergde worktree) mogen de latere stappen
  // hieronder gewoon doorlopen -- anders blijft fixture-data van tabellen die niets met de
  // fout te maken hebben alsnog achter. Zie feedback_aftereach_cleanup_must_not_abort_on_first_failure.
  // medewerkerCookie() uses a fixed fake userId (no real medewerker row exists for it), so
  // every call leaves an orphaned `sessions` row the klant-scoped cleanup below never catches.
  await veiligOpruimen('sessions (medewerker staff-1)', () =>
    pool.query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'staff-1'")
  );
  if (createdKlantEmails.length > 0) {
    await veiligOpruimen('sessions (klant)', () =>
      pool.query(
        'DELETE FROM sessions WHERE userType = \'klant\' AND userId IN (SELECT id FROM klanten WHERE email IN (?))',
        [createdKlantEmails]
      )
    );
    await veiligOpruimen('bestelheaders (klant)', () =>
      pool.query('DELETE FROM bestelheaders WHERE klantnr IN (SELECT klantnr FROM klanten WHERE email IN (?))', [
        createdKlantEmails,
      ])
    );
    await veiligOpruimen('klanten', () => pool.query('DELETE FROM klanten WHERE email IN (?)', [createdKlantEmails]));
    createdKlantEmails.length = 0;
  }
  if (createdKunstwerkIds.length > 0) {
    await veiligOpruimen('kunstwerken', () =>
      pool.query('DELETE FROM kunstwerken WHERE id IN (?)', [createdKunstwerkIds])
    );
    createdKunstwerkIds.length = 0;
  }
  if (createdKunstenaarIds.length > 0) {
    await veiligOpruimen('kunstenaars', () =>
      pool.query('DELETE FROM kunstenaars WHERE id IN (?)', [createdKunstenaarIds])
    );
    createdKunstenaarIds.length = 0;
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
  if (createdPrijsgroepIds.length > 0) {
    await veiligOpruimen('prijsgroepen', () =>
      pool.query('DELETE FROM prijsgroepen WHERE id IN (?)', [createdPrijsgroepIds])
    );
    createdPrijsgroepIds.length = 0;
  }
});

async function nextExpectedBestelnr(): Promise<string> {
  const [rows] = await getPool().query("SELECT value FROM counters WHERE id = 'bestelnummer'", []);
  const current = ((rows as Array<{ value: number }>)[0]?.value ?? 0) + 1;
  return `BE-${String(current).padStart(BESTELNR_PADDING, '0')}`;
}

let klantTeller = 0;

async function klant(email: string): Promise<{ id: string; klantnr: string; cookie: string }> {
  const klantnr = `AT-K-BH-${++klantTeller}`;
  const created = await insertRow<{ id: string }>('klanten', {
    email,
    wachtwoordHash: await hashPassword('x'),
    status: 'Goedgekeurd',
    klantnr,
  } as never);
  createdKlantEmails.push(email);
  const sessionId = await createSession('klant', created.id);
  return { id: created.id, klantnr, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

async function maakPrijsgroep(aanpassing: { kortingspercentage?: number; opslagpercentage?: number }): Promise<string> {
  const prijsgroep = await insertRow<{ id: string }>('prijsgroepen', {
    naam: 'Test prijsgroep',
    kortingspercentage: aanpassing.kortingspercentage ?? null,
    opslagpercentage: aanpassing.opslagpercentage ?? null,
  } as never);
  createdPrijsgroepIds.push(prijsgroep.id);
  return prijsgroep.id;
}

async function klantMetPrijsgroep(
  email: string,
  prijsgroepId: string
): Promise<{ id: string; klantnr: string; cookie: string }> {
  const klantnr = `AT-K-BH-${++klantTeller}`;
  const created = await insertRow<{ id: string }>('klanten', {
    email,
    wachtwoordHash: await hashPassword('x'),
    status: 'Goedgekeurd',
    prijsgroepId,
    klantnr,
  } as never);
  createdKlantEmails.push(email);
  const sessionId = await createSession('klant', created.id);
  return { id: created.id, klantnr, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

async function medewerkerCookie(): Promise<string> {
  const sessionId = await createSession('medewerker', 'staff-1');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

async function maakMaat(breedte: number, hoogte: number): Promise<string> {
  const maat = await insertRow<{ id: string }>('maten', { breedte, hoogte } as never);
  createdMaatIds.push(maat.id);
  return maat.id;
}

async function maakMateriaal(): Promise<string> {
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

let kunstwerkTeller = 0;

async function maakGeprijsdKunstwerk(
  maatId: string,
  materiaalId: string,
  matrixPrijs: number,
  kunstenaarnr: string | null = null
): Promise<string> {
  await getPool().query('INSERT INTO prijsmatrix (id, maatId, materiaalId, prijs) VALUES (UUID(), ?, ?, ?)', [
    maatId,
    materiaalId,
    matrixPrijs,
  ]);
  const kunstwerk = await insertRow<{ id: string }>('kunstwerken', {
    code: `test-bestelheaders-werk-${++kunstwerkTeller}`,
    kunstenaarnr,
  } as never);
  await vervangRelaties(getPool(), kunstwerk.id, { materiaalIds: [materiaalId], maatIds: [maatId] });
  createdKunstwerkIds.push(kunstwerk.id);
  return kunstwerk.id;
}

function postRequest(body: unknown, cookie?: string) {
  return new Request('http://localhost/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

describe('bestelheaders routes', () => {
  it('creates a header with lines and an incrementing bestelnr, using the session klant, pricing from the matrix', async () => {
    const { klantnr, cookie } = await klant('k@example.com');
    const maatId = await maakMaat(41, 61);
    const materiaalId = await maakMateriaal();
    const kunstwerkId = await maakGeprijsdKunstwerk(maatId, materiaalId, 150);
    const expectedBestelnr = await nextExpectedBestelnr();

    const response = await createHeader(
      postRequest({ lines: [{ kunstwerkId, maatId, materiaalId, prijs: 999999, quantity: 2 }] }, cookie)
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.bestelnr).toBe(expectedBestelnr);

    const [headerRows] = await getPool().query('SELECT klantnr FROM bestelheaders WHERE id = ?', [body.id]);
    expect((headerRows as Array<{ klantnr: string }>)[0].klantnr).toBe(klantnr);

    const [lineRows] = await getPool().query('SELECT prijs FROM bestellines WHERE bestelnr = ?', [body.bestelnr]);
    // The client submitted 999999 -- the server ignores it and stores its own computed price.
    expect(Number((lineRows as Array<{ prijs: string }>)[0].prijs)).toBe(150);
  });

  it('legt bestellines en bestelstatusHistorie vast op bestelnr, niet op de header-UUID', async () => {
    const { cookie } = await klant('bestelnr-fk@example.com');
    const maatId = await maakMaat(41, 61);
    const materiaalId = await maakMateriaal();
    const kunstwerkId = await maakGeprijsdKunstwerk(maatId, materiaalId, 150);

    const response = await createHeader(
      postRequest({ lines: [{ kunstwerkId, maatId, materiaalId, prijs: 1, quantity: 1 }] }, cookie)
    );
    const body = await response.json();

    const [lineRows] = await getPool().query('SELECT bestelnr FROM bestellines WHERE bestelnr = ?', [
      body.bestelnr,
    ]);
    expect((lineRows as unknown[]).length).toBe(1);

    const [historieRows] = await getPool().query('SELECT bestelnr FROM bestelstatusHistorie WHERE bestelnr = ?', [
      body.bestelnr,
    ]);
    expect((historieRows as unknown[]).length).toBe(1);
  });

  it('adds a kunstenaar prijsopslag on top of the matrixprijs', async () => {
    const { cookie } = await klant('opslag@example.com');
    const maatId = await maakMaat(43, 63);
    const materiaalId = await maakMateriaal();
    const kunstenaar = await insertRow<{ id: string }>('kunstenaars', {
      kunstenaarnr: 'AT-K-BH-1',
      naam: 'Opslag Artiest',
    } as never);
    createdKunstenaarIds.push(kunstenaar.id);
    await getPool().query('INSERT INTO kunstenaarAfspraken (id, prijsopslag) VALUES (?, ?)', [kunstenaar.id, 40]);
    const kunstwerkId = await maakGeprijsdKunstwerk(maatId, materiaalId, 100, 'AT-K-BH-1');

    const response = await createHeader(
      postRequest({ lines: [{ kunstwerkId, maatId, materiaalId, prijs: 1, quantity: 1 }] }, cookie)
    );
    const body = await response.json();
    const [lineRows] = await getPool().query('SELECT prijs FROM bestellines WHERE bestelnr = ?', [body.bestelnr]);
    expect(Number((lineRows as Array<{ prijs: string }>)[0].prijs)).toBe(140);
  });

  it('applies the ordering klant\'s prijsgroep korting on top of the matrixprijs', async () => {
    const prijsgroepId = await maakPrijsgroep({ kortingspercentage: 20 });
    const { cookie } = await klantMetPrijsgroep('prijsgroep-korting@example.com', prijsgroepId);
    const maatId = await maakMaat(55, 75);
    const materiaalId = await maakMateriaal();
    const kunstwerkId = await maakGeprijsdKunstwerk(maatId, materiaalId, 100);

    const response = await createHeader(
      postRequest({ lines: [{ kunstwerkId, maatId, materiaalId, prijs: 1, quantity: 1 }] }, cookie)
    );
    const body = await response.json();
    const [lineRows] = await getPool().query('SELECT prijs FROM bestellines WHERE bestelnr = ?', [body.bestelnr]);
    expect(Number((lineRows as Array<{ prijs: string }>)[0].prijs)).toBe(80);
  });

  it('applies the ordering klant\'s prijsgroep opslag on top of a kunstenaar prijsopslag', async () => {
    const prijsgroepId = await maakPrijsgroep({ opslagpercentage: 10 });
    const { cookie } = await klantMetPrijsgroep('prijsgroep-opslag@example.com', prijsgroepId);
    const maatId = await maakMaat(56, 76);
    const materiaalId = await maakMateriaal();
    const kunstenaar = await insertRow<{ id: string }>('kunstenaars', {
      kunstenaarnr: 'AT-K-BH-2',
      naam: 'Opslag Artiest 2',
    } as never);
    createdKunstenaarIds.push(kunstenaar.id);
    await getPool().query('INSERT INTO kunstenaarAfspraken (id, prijsopslag) VALUES (?, ?)', [kunstenaar.id, 40]);
    const kunstwerkId = await maakGeprijsdKunstwerk(maatId, materiaalId, 100, 'AT-K-BH-2');

    const response = await createHeader(
      postRequest({ lines: [{ kunstwerkId, maatId, materiaalId, prijs: 1, quantity: 1 }] }, cookie)
    );
    const body = await response.json();
    const [lineRows] = await getPool().query('SELECT prijs FROM bestellines WHERE bestelnr = ?', [body.bestelnr]);
    // matrix 100 + kunstenaar opslag 40 = 140, plus 10% prijsgroep opslag = 154
    expect(Number((lineRows as Array<{ prijs: string }>)[0].prijs)).toBe(154);
  });

  it('rejects a line for a fixed maat/materiaal with no matrixprijs set', async () => {
    const { cookie } = await klant('nomatrix@example.com');
    const maatId = await maakMaat(44, 64);
    const materiaalId = await maakMateriaal();
    const kunstwerk = await insertRow<{ id: string }>('kunstwerken', {
      code: 'test-bestelheaders-ongeprijsd',
    } as never);
    await vervangRelaties(getPool(), kunstwerk.id, { materiaalIds: [materiaalId], maatIds: [maatId] });
    createdKunstwerkIds.push(kunstwerk.id);

    const response = await createHeader(
      postRequest({ lines: [{ kunstwerkId: kunstwerk.id, maatId, materiaalId, prijs: 1, quantity: 1 }] }, cookie)
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('prijs-onbekend');
  });

  it('rejects a line referencing a kunstwerkId that does not exist', async () => {
    const { cookie } = await klant('nokunstwerk@example.com');
    const response = await createHeader(
      postRequest(
        { lines: [{ kunstwerkId: 'does-not-exist', maatId: 'x', materiaalId: 'y', prijs: 1, quantity: 1 }] },
        cookie
      )
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('kunstwerk-not-found');
  });

  it('computes a maatloos kunstwerk\'s prijs from prijsPerM2 and the submitted afmetingen', async () => {
    const { cookie } = await klant('maatloos@example.com');
    const kunstwerk = await insertRow<{ id: string }>('kunstwerken', {
      code: 'test-bestelheaders-maatloos',
      prijsPerM2: 100,
    } as never);
    createdKunstwerkIds.push(kunstwerk.id);

    const response = await createHeader(
      postRequest(
        {
          lines: [
            { kunstwerkId: kunstwerk.id, maatId: '', materiaalId: '', prijs: 1, quantity: 1, breedte: 120, hoogte: 60 },
          ],
        },
        cookie
      )
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    const [lineRows] = await getPool().query('SELECT prijs FROM bestellines WHERE bestelnr = ?', [body.bestelnr]);
    expect(Number((lineRows as Array<{ prijs: string }>)[0].prijs)).toBe(72);
  });

  it('uses the materiaal\'s prijsPerM2, not the kunstwerk\'s, once a materiaal is linked', async () => {
    const { cookie } = await klant('materiaal-prijs@example.com');
    const materiaalId = await maakMateriaal();
    await getPool().query('UPDATE materialen SET prijsPerM2 = ? WHERE id = ?', [150, materiaalId]);
    const kunstwerk = await insertRow<{ id: string }>('kunstwerken', {
      code: 'test-bestelheaders-materiaalprijs',
      prijsPerM2: 999,
    } as never);
    createdKunstwerkIds.push(kunstwerk.id);
    await vervangRelaties(getPool(), kunstwerk.id, { materiaalIds: [materiaalId], maatIds: [] });

    const response = await createHeader(
      postRequest(
        {
          lines: [
            {
              kunstwerkId: kunstwerk.id,
              maatId: '',
              materiaalId,
              prijs: 1,
              quantity: 1,
              breedte: 100,
              hoogte: 50,
            },
          ],
        },
        cookie
      )
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    const [lineRows] = await getPool().query('SELECT prijs FROM bestellines WHERE bestelnr = ?', [body.bestelnr]);
    // 1m x 0.5m x 150/m2 (materiaal) = 75 -- niet 999 (kunstwerk).
    expect(Number((lineRows as Array<{ prijs: string }>)[0].prijs)).toBe(75);
  });

  it('stores a null prijs for an eigen-maat line on a kunstwerk that is not maatloos (priced later by staff)', async () => {
    const { cookie } = await klant('eigenmaat@example.com');
    const maatId = await maakMaat(45, 65);
    const materiaalId = await maakMateriaal();
    const kunstwerk = await insertRow<{ id: string }>('kunstwerken', {
      code: 'test-bestelheaders-eigenmaat',
    } as never);
    await vervangRelaties(getPool(), kunstwerk.id, { materiaalIds: [materiaalId], maatIds: [maatId] });
    createdKunstwerkIds.push(kunstwerk.id);

    const response = await createHeader(
      postRequest(
        {
          lines: [
            {
              kunstwerkId: kunstwerk.id,
              maatId: '',
              materiaalId,
              prijs: 1,
              quantity: 1,
              breedte: 80,
              hoogte: 40,
            },
          ],
        },
        cookie
      )
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    const [lineRows] = await getPool().query('SELECT prijs FROM bestellines WHERE bestelnr = ?', [body.bestelnr]);
    expect((lineRows as Array<{ prijs: string | null }>)[0].prijs).toBeNull();
  });

  it('rejects placing an order without a klant session', async () => {
    const response = await createHeader(postRequest({ lines: [] }));
    expect(response.status).toBe(401);
  });

  it('ignores a klantId in the request body -- the order is always placed for the session klant', async () => {
    const { klantnr, cookie } = await klant('spoof@example.com');
    const other = await klant('spoof-target@example.com');

    const response = await createHeader(postRequest({ klantId: other.id, lines: [] }, cookie));
    expect(response.status).toBe(201);
    const body = await response.json();
    const [rows] = await getPool().query('SELECT klantnr FROM bestelheaders WHERE id = ?', [body.id]);
    expect((rows as Array<{ klantnr: string }>)[0].klantnr).toBe(klantnr);
  });

  it('weigert een bestelling van een klant die nog niet is goedgekeurd', async () => {
    const email = `autotest-niet-goedgekeurd-${randomUUID()}@example.com`;
    const created = await insertRow<{ id: string }>('klanten', {
      email,
      wachtwoordHash: await hashPassword('x'),
      status: 'Beoordelen',
    } as never);
    createdKlantEmails.push(email);
    const sessionId = await createSession('klant', created.id);
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;

    const response = await createHeader(postRequest({ lines: [] }, cookie));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'klant-niet-goedgekeurd' });
  });

  it('lists all headers for a medewerker, and only own headers for a customer', async () => {
    const klantA = await klant('a@example.com');
    const klantB = await klant('b@example.com');
    const headerA = await (await createHeader(postRequest({ lines: [] }, klantA.cookie))).json();
    const headerB = await (await createHeader(postRequest({ lines: [] }, klantB.cookie))).json();

    const all = await listHeaders(
      new Request('http://localhost/api/bestelheaders', { headers: { cookie: await medewerkerCookie() } })
    );
    const allIds = (await all.json()).map((row: { id: string }) => row.id);
    expect(allIds).toEqual(expect.arrayContaining([headerA.id, headerB.id]));

    const onlyA = await listHeaders(
      new Request(`http://localhost/api/bestelheaders?klantId=${klantA.id}`, {
        headers: { cookie: klantA.cookie },
      })
    );
    const onlyAIds = (await onlyA.json()).map((row: { id: string }) => row.id);
    expect(onlyAIds).toEqual([headerA.id]);
  });

  it('rejects listing all headers without a medewerker session', async () => {
    const response = await listHeaders(new Request('http://localhost/api/bestelheaders'));
    expect(response.status).toBe(401);
  });

  it('rejects a klant reading another klant\'s orders by klantId', async () => {
    const klantA = await klant('reader-a@example.com');
    const klantB = await klant('reader-b@example.com');
    const response = await listHeaders(
      new Request(`http://localhost/api/bestelheaders?klantId=${klantB.id}`, {
        headers: { cookie: klantA.cookie },
      })
    );
    expect(response.status).toBe(401);
  });

  it('updates header status as a medewerker', async () => {
    const { cookie } = await klant('c@example.com');
    const maatId = await maakMaat(46, 66);
    const materiaalId = await maakMateriaal();
    const kunstwerk = await insertRow<{ id: string }>('kunstwerken', {
      code: 'test-bestelheaders-eigenmaat-2',
    } as never);
    await vervangRelaties(getPool(), kunstwerk.id, { materiaalIds: [materiaalId], maatIds: [maatId] });
    createdKunstwerkIds.push(kunstwerk.id);
    const created = await createHeader(
      postRequest(
        {
          lines: [
            { kunstwerkId: kunstwerk.id, maatId: '', materiaalId, prijs: 1, quantity: 1, breedte: 50, hoogte: 50 },
          ],
        },
        cookie
      )
    );
    const header = await created.json();
    const staffCookie = await medewerkerCookie();

    await patchHeader(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: staffCookie },
        body: JSON.stringify({ status: 'Te versturen naar drukker' }),
      }),
      { params: { id: header.id } }
    );

    const [headerRows] = await getPool().query('SELECT status FROM bestelheaders WHERE id = ?', [header.id]);
    expect((headerRows as Array<{ status: string }>)[0].status).toBe('Te versturen naar drukker');
  });

  it('records the initial Te beoordelen status in bestelstatusHistorie when a bestelling is created', async () => {
    const { cookie } = await klant('historie-creatie@example.com');
    const created = await createHeader(postRequest({ lines: [] }, cookie));
    const header = await created.json();

    const [rows] = await getPool().query(
      'SELECT status FROM bestelstatusHistorie WHERE bestelnr = ? ORDER BY tijdstip ASC',
      [header.bestelnr]
    );
    expect((rows as Array<{ status: string }>).map((r) => r.status)).toEqual(['Te beoordelen']);
  });

  it('records a new bestelstatusHistorie row each time a medewerker PATCHes a genuinely new status, in order', async () => {
    const { cookie } = await klant('historie-keten@example.com');
    const created = await createHeader(postRequest({ lines: [] }, cookie));
    const header = await created.json();
    const staffCookie = await medewerkerCookie();

    for (const status of ['Te versturen naar drukker', 'Verstuurd naar drukker', 'Betaald en afgerond']) {
      await patchHeader(
        new Request('http://localhost/api', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', cookie: staffCookie },
          body: JSON.stringify({ status }),
        }),
        { params: { id: header.id } }
      );
    }

    const [rows] = await getPool().query(
      'SELECT status FROM bestelstatusHistorie WHERE bestelnr = ? ORDER BY tijdstip ASC',
      [header.bestelnr]
    );
    expect((rows as Array<{ status: string }>).map((r) => r.status)).toEqual([
      'Te beoordelen',
      'Te versturen naar drukker',
      'Verstuurd naar drukker',
      'Betaald en afgerond',
    ]);
  });

  it('does not record a duplicate row when PATCHed with the same status it already has', async () => {
    const { cookie } = await klant('historie-geen-duplicaat@example.com');
    const created = await createHeader(postRequest({ lines: [] }, cookie));
    const header = await created.json();
    const staffCookie = await medewerkerCookie();

    async function patchStatus(status: string) {
      await patchHeader(
        new Request('http://localhost/api', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', cookie: staffCookie },
          body: JSON.stringify({ status }),
        }),
        { params: { id: header.id } }
      );
    }
    await patchStatus('Te versturen naar drukker');
    await patchStatus('Te versturen naar drukker'); // same status again -- must not add a row

    const [rows] = await getPool().query(
      'SELECT status FROM bestelstatusHistorie WHERE bestelnr = ? ORDER BY tijdstip ASC',
      [header.bestelnr]
    );
    expect((rows as Array<{ status: string }>).map((r) => r.status)).toEqual([
      'Te beoordelen',
      'Te versturen naar drukker',
    ]);
  });

  it('records a full history across Afgerond -> Terugzetten -> Afgerond again -- both completions are kept', async () => {
    const { cookie } = await klant('historie-hergebruik@example.com');
    const created = await createHeader(postRequest({ lines: [] }, cookie));
    const header = await created.json();
    const staffCookie = await medewerkerCookie();

    async function patchStatus(status: string) {
      await patchHeader(
        new Request('http://localhost/api', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', cookie: staffCookie },
          body: JSON.stringify({ status }),
        }),
        { params: { id: header.id } }
      );
    }
    await patchStatus('Te versturen naar drukker');
    await patchStatus('Verstuurd naar drukker');
    await patchStatus('Betaald en afgerond');
    await patchStatus('Verstuurd naar drukker'); // Terugzetten
    await patchStatus('Betaald en afgerond'); // Afgerond again

    const [rows] = await getPool().query(
      'SELECT status FROM bestelstatusHistorie WHERE bestelnr = ? ORDER BY tijdstip ASC',
      [header.bestelnr]
    );
    expect((rows as Array<{ status: string }>).map((r) => r.status)).toEqual([
      'Te beoordelen',
      'Te versturen naar drukker',
      'Verstuurd naar drukker',
      'Betaald en afgerond',
      'Verstuurd naar drukker',
      'Betaald en afgerond',
    ]);
  });

  it('rejects reading statushistorie without a medewerker session', async () => {
    const { cookie } = await klant('historie-unauth@example.com');
    const created = await createHeader(postRequest({ lines: [] }, cookie));
    const header = await created.json();

    const response = await getStatusHistorie(new Request('http://localhost/api'), {
      params: { id: header.id },
    });
    expect(response.status).toBe(401);
  });

  it('returns the statushistorie for one bestelling via GET, oldest first', async () => {
    const { cookie } = await klant('historie-get@example.com');
    const created = await createHeader(postRequest({ lines: [] }, cookie));
    const header = await created.json();
    const staffCookie = await medewerkerCookie();
    await patchHeader(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: staffCookie },
        body: JSON.stringify({ status: 'Te versturen naar drukker' }),
      }),
      { params: { id: header.id } }
    );

    const response = await getStatusHistorie(
      new Request('http://localhost/api', { headers: { cookie: staffCookie } }),
      { params: { id: header.id } }
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Array<{ status: string; tijdstip: string }>;
    expect(body.map((row) => row.status)).toEqual(['Te beoordelen', 'Te versturen naar drukker']);
  });

  it('rejects patching a header status without a medewerker session', async () => {
    const { cookie } = await klant('unauth-patch@example.com');
    const created = await createHeader(postRequest({ lines: [] }, cookie));
    const header = await created.json();

    const headerResponse = await patchHeader(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Te versturen naar drukker' }),
      }),
      { params: { id: header.id } }
    );
    expect(headerResponse.status).toBe(401);
  });

  it('rejects a non-positive/non-integer breedte or hoogte on a maatloos kunstwerk', async () => {
    const { cookie } = await klant('badafmeting@example.com');
    const kunstwerk = await insertRow<{ id: string }>('kunstwerken', {
      code: 'test-bestelheaders-maatloos-2',
      prijsPerM2: 100,
    } as never);
    createdKunstwerkIds.push(kunstwerk.id);

    const response = await createHeader(
      postRequest(
        {
          lines: [
            { kunstwerkId: kunstwerk.id, maatId: '', materiaalId: '', prijs: 1, quantity: 1, breedte: -120, hoogte: 60 },
          ],
        },
        cookie
      )
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('invalid-afmeting');
  });

  it('rejects a maatloos kunstwerk with a zero prijsPerM2 rather than storing a zero prijs', async () => {
    const { cookie } = await klant('zeroprijsperm2@example.com');
    const kunstwerk = await insertRow<{ id: string }>('kunstwerken', {
      code: 'test-bestelheaders-maatloos-gratis',
      prijsPerM2: 0,
    } as never);
    createdKunstwerkIds.push(kunstwerk.id);

    const response = await createHeader(
      postRequest(
        {
          lines: [
            { kunstwerkId: kunstwerk.id, maatId: '', materiaalId: '', prijs: 1, quantity: 1, breedte: 120, hoogte: 60 },
          ],
        },
        cookie
      )
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('prijs-onbekend');
  });

  it('rejects a materiaalId that is not in the kunstwerk\'s own materiaalIds', async () => {
    const { cookie } = await klant('badmateriaal@example.com');
    const maatId = await maakMaat(50, 70);
    const materiaalIdA = await maakMateriaal();
    const materiaalIdB = await maakMateriaal();
    const kunstwerkId = await maakGeprijsdKunstwerk(maatId, materiaalIdA, 100);
    // Seed a matrix price for the other materiaal/maat combo too, so if the check were
    // missing the order would otherwise price and succeed.
    await getPool().query('INSERT INTO prijsmatrix (id, maatId, materiaalId, prijs) VALUES (UUID(), ?, ?, ?)', [
      maatId,
      materiaalIdB,
      100,
    ]);

    const response = await createHeader(
      postRequest(
        { lines: [{ kunstwerkId, maatId, materiaalId: materiaalIdB, prijs: 100, quantity: 1 }] },
        cookie
      )
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('materiaal-niet-beschikbaar');
  });

  it('rejects a maatId that is a real maat but not one of the kunstwerk\'s own maatIds', async () => {
    const { cookie } = await klant('badmaat@example.com');
    const maatIdA = await maakMaat(51, 71);
    const maatIdB = await maakMaat(52, 72);
    const materiaalId = await maakMateriaal();
    const kunstwerkId = await maakGeprijsdKunstwerk(maatIdA, materiaalId, 100);
    // Seed a matrix price for the other maat/materiaal combo too, so if the check were
    // missing the order would otherwise price and succeed (via the "op-aanvraag" fallback
    // that's meant only for the legitimate custom-size case).
    await getPool().query('INSERT INTO prijsmatrix (id, maatId, materiaalId, prijs) VALUES (UUID(), ?, ?, ?)', [
      maatIdB,
      materiaalId,
      100,
    ]);

    const response = await createHeader(
      postRequest(
        { lines: [{ kunstwerkId, maatId: maatIdB, materiaalId, prijs: 100, quantity: 1 }] },
        cookie
      )
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('maat-niet-beschikbaar');
  });

  it('rejects a custom-size line (maatId: \'\') with no breedte/hoogte sent', async () => {
    const { cookie } = await klant('geenafmeting@example.com');
    const maatId = await maakMaat(53, 73);
    const materiaalId = await maakMateriaal();
    const kunstwerk = await insertRow<{ id: string }>('kunstwerken', {
      code: 'test-bestelheaders-eigenmaat-zonder-afmeting',
    } as never);
    await vervangRelaties(getPool(), kunstwerk.id, { materiaalIds: [materiaalId], maatIds: [maatId] });
    createdKunstwerkIds.push(kunstwerk.id);

    const response = await createHeader(
      postRequest(
        { lines: [{ kunstwerkId: kunstwerk.id, maatId: '', materiaalId, prijs: 1, quantity: 1 }] },
        cookie
      )
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('afmeting-vereist');
  });

  it('rejects a line with a non-positive quantity', async () => {
    const { cookie } = await klant('e@example.com');
    const maatId = await maakMaat(48, 68);
    const materiaalId = await maakMateriaal();
    const kunstwerkId = await maakGeprijsdKunstwerk(maatId, materiaalId, 100);
    const response = await createHeader(
      postRequest({ lines: [{ kunstwerkId, maatId, materiaalId, prijs: 100, quantity: 0 }] }, cookie)
    );
    expect(response.status).toBe(400);
  });

  it('rejects ordering an artwork exclusively reserved for a different klant, allows the listed klant', async () => {
    const klantA = await klant('g@example.com');
    const klantB = await klant('h@example.com');
    const maatId = await maakMaat(49, 69);
    const materiaalId = await maakMateriaal();
    const kunstenaar = await insertRow<{ id: string }>(
      'kunstenaars',
      { kunstenaarnr: 'AT-K-BH-3', naam: 'Exclusieve Artiest', exclusieveKlantIds: [klantB.id] } as never,
      ['exclusieveKlantIds']
    );
    createdKunstenaarIds.push(kunstenaar.id);
    const kunstwerkId = await maakGeprijsdKunstwerk(maatId, materiaalId, 100, 'AT-K-BH-3');

    const response = await createHeader(
      postRequest({ lines: [{ kunstwerkId, maatId, materiaalId, prijs: 100, quantity: 1 }] }, klantA.cookie)
    );
    expect(response.status).toBe(403);

    const allowedForB = await createHeader(
      postRequest({ lines: [{ kunstwerkId, maatId, materiaalId, prijs: 100, quantity: 1 }] }, klantB.cookie)
    );
    expect(allowedForB.status).toBe(201);
  });

  it('rejects a maatloos-with-materialen kunstwerk ordered with a materiaalId not in its own materiaalIds', async () => {
    const { cookie } = await klant('maatloos-mat@example.com');
    const materiaalIdA = await maakMateriaal();
    const materiaalIdB = await maakMateriaal();
    const kunstwerk = await insertRow<{ id: string }>('kunstwerken', {
      code: 'test-bestelheaders-maatloos-met-materialen',
      prijsPerM2: 50,
    } as never);
    await vervangRelaties(getPool(), kunstwerk.id, { materiaalIds: [materiaalIdA] });
    createdKunstwerkIds.push(kunstwerk.id);

    const response = await createHeader(
      postRequest(
        {
          lines: [
            {
              kunstwerkId: kunstwerk.id,
              maatId: '',
              materiaalId: materiaalIdB,
              prijs: 1,
              quantity: 1,
              breedte: 100,
              hoogte: 100,
            },
          ],
        },
        cookie
      )
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('materiaal-niet-beschikbaar');
  });

  it('schrijft de code van het kunstwerk in de bestelregel, niet het kunstwerk-id', async () => {
    const maatId = await maakMaat(70, 100);
    const materiaalId = await maakMateriaal();
    const kunstwerkId = await maakGeprijsdKunstwerk(maatId, materiaalId, 100);
    const [kunstwerkRows] = await getPool().query('SELECT code FROM kunstwerken WHERE id = ?', [kunstwerkId]);
    const verwachteCode = (kunstwerkRows as Array<{ code: string }>)[0].code;
    const { cookie } = await klant('bestelline-code@example.com');

    const response = await createHeader(
      postRequest({ lines: [{ kunstwerkId, maatId, materiaalId, prijs: 100, quantity: 1 }] }, cookie)
    );
    expect(response.status).toBe(201);
    const { id: headerId, bestelnr } = await response.json();

    const [lineRows] = await getPool().query('SELECT code FROM bestellines WHERE bestelnr = ?', [bestelnr]);
    expect((lineRows as Array<{ code: string }>)[0].code).toBe(verwachteCode);
  });

  it('rejects ordering an artwork exclusive to 2 klanten from a third klant, allows both listed klanten', async () => {
    const klantA = await klant('exclusief-a@example.com');
    const klantB = await klant('exclusief-b@example.com');
    const klantC = await klant('exclusief-c@example.com');
    const maatId = await maakMaat(54, 74);
    const materiaalId = await maakMateriaal();
    const kunstenaar = await insertRow<{ id: string }>(
      'kunstenaars',
      { kunstenaarnr: 'AT-K-BH-4', naam: 'Twee-klanten Artiest', exclusieveKlantIds: [klantA.id, klantB.id] } as never,
      ['exclusieveKlantIds']
    );
    createdKunstenaarIds.push(kunstenaar.id);
    const kunstwerkId = await maakGeprijsdKunstwerk(maatId, materiaalId, 100, 'AT-K-BH-4');

    const line = { kunstwerkId, maatId, materiaalId, prijs: 100, quantity: 1 };
    expect((await createHeader(postRequest({ lines: [line] }, klantA.cookie))).status).toBe(201);
    expect((await createHeader(postRequest({ lines: [line] }, klantB.cookie))).status).toBe(201);
    expect((await createHeader(postRequest({ lines: [line] }, klantC.cookie))).status).toBe(403);
  });

  it('stores and returns an afwijsreden when a bestelling is rejected', async () => {
    const { cookie } = await klant('test-afwijsreden-bestelling@example.com');
    const created = await createHeader(postRequest({ lines: [] }, cookie));
    const header = await created.json();
    const staffCookie = await medewerkerCookie();

    await patchHeader(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: staffCookie },
        body: JSON.stringify({ status: 'Afgewezen', afwijsreden: 'Klant heeft nog een openstaande factuur.' }),
      }),
      { params: { id: header.id } }
    );

    const [rows] = await getPool().query('SELECT status, afwijsreden FROM bestelheaders WHERE id = ?', [header.id]);
    const rij = (rows as Array<{ status: string; afwijsreden: string | null }>)[0];
    expect(rij.status).toBe('Afgewezen');
    expect(rij.afwijsreden).toBe('Klant heeft nog een openstaande factuur.');
  });

  it('strips afwijsreden from a klant\'s own view of their orders, but includes it for a medewerker', async () => {
    const { id: klantId, cookie } = await klant('test-afwijsreden-lek@example.com');
    const created = await createHeader(postRequest({ lines: [] }, cookie));
    const header = await created.json();
    const staffCookie = await medewerkerCookie();

    await patchHeader(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: staffCookie },
        body: JSON.stringify({ status: 'Afgewezen', afwijsreden: 'Onvoldoende gegevens.' }),
      }),
      { params: { id: header.id } }
    );

    const asKlant = await listHeaders(
      new Request(`http://localhost/api/bestelheaders?klantId=${klantId}`, {
        headers: { cookie },
      })
    );
    const klantBody = await asKlant.json();
    expect(klantBody).toHaveLength(1);
    expect('afwijsreden' in klantBody[0]).toBe(false);

    const asStaffForKlant = await listHeaders(
      new Request(`http://localhost/api/bestelheaders?klantId=${klantId}`, {
        headers: { cookie: staffCookie },
      })
    );
    const staffBody = await asStaffForKlant.json();
    expect(staffBody[0].afwijsreden).toBe('Onvoldoende gegevens.');

    const bulkAsStaff = await listHeaders(
      new Request('http://localhost/api/bestelheaders', { headers: { cookie: staffCookie } })
    );
    const bulkBody = await bulkAsStaff.json();
    const bulkRow = bulkBody.find((row: { id: string }) => row.id === header.id);
    expect(bulkRow.afwijsreden).toBe('Onvoldoende gegevens.');
  });
});
