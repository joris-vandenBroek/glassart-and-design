import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { POST as createKunstwerk } from '@/app/api/kunstwerken/route';
import { PATCH as patchKunstwerk, DELETE as deleteKunstwerk } from '@/app/api/kunstwerken/[id]/route';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { hashPassword } from '@/lib/server/password';
import { veiligOpruimen } from '../../helpers/veiligOpruimen';

const createdKunstwerkIds: string[] = [];
const createdHeaderIds: string[] = [];
const createdKlantEmails: string[] = [];

afterEach(async () => {
  if (createdHeaderIds.length > 0) {
    await veiligOpruimen('bestelheaders', () =>
      getPool().query('DELETE FROM bestelheaders WHERE id IN (?)', [createdHeaderIds])
    );
    createdHeaderIds.length = 0;
  }
  if (createdKlantEmails.length > 0) {
    await veiligOpruimen('klanten', () =>
      getPool().query('DELETE FROM klanten WHERE email IN (?)', [createdKlantEmails])
    );
    createdKlantEmails.length = 0;
  }
  if (createdKunstwerkIds.length > 0) {
    await veiligOpruimen('kunstwerken', () =>
      getPool().query('DELETE FROM kunstwerken WHERE id IN (?)', [createdKunstwerkIds])
    );
    createdKunstwerkIds.length = 0;
  }
  await veiligOpruimen('sessions (medewerker staff-1)', () =>
    getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'staff-1'")
  );
});

async function medewerkerCookie(): Promise<string> {
  const sessionId = await createSession('medewerker', 'staff-1');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

function postRequest(body: unknown, cookie: string): Request {
  return new Request('http://localhost/api/kunstwerken', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

function patchRequest(body: unknown, cookie: string): Request {
  return new Request('http://localhost/api/kunstwerken/x', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

async function maakKunstwerk(code: string): Promise<string> {
  const kunstwerk = await insertRow<{ id: string }>('kunstwerken', { code } as never);
  createdKunstwerkIds.push(kunstwerk.id);
  return kunstwerk.id;
}

async function maakBestelregelMetCode(code: string, email: string): Promise<void> {
  const klant = await insertRow<{ id: string }>('klanten', {
    email,
    wachtwoordHash: await hashPassword('x'),
    status: 'Goedgekeurd',
  } as never);
  createdKlantEmails.push(email);
  const header = await insertRow<{ id: string }>('bestelheaders', {
    klantId: klant.id,
    // Een vast, herkenbaar testbestelnummer: de counters-rij `bestelnummer` mag nooit
    // gebruikt of gereset worden door een test. Vaste, korte letterlijke waarde zodat
    // hij altijd binnen bestelheaders.bestelnr (VARCHAR(20)) past, ongeacht de lengte
    // van de meegegeven code.
    bestelnr: 'TEST-KWCODE',
    status: 'Te beoordelen',
  } as never);
  createdHeaderIds.push(header.id);
  await insertRow('bestellines', {
    bestelheaderId: header.id,
    code,
    maatId: null,
    materiaalId: null,
    prijs: null,
    quantity: 1,
  } as never);
}

describe('kunstwerken.code', () => {
  it('slaat een kunstwerk op met een code in plaats van een naam', async () => {
    const id = await maakKunstwerk('test-code-basis');
    const [rows] = await getPool().query('SELECT code FROM kunstwerken WHERE id = ?', [id]);
    expect((rows as Array<{ code: string }>)[0].code).toBe('test-code-basis');
  });

  it('weigert een tweede kunstwerk met dezelfde code, ook met andere hoofdletters', async () => {
    await maakKunstwerk('test-code-dubbel');
    // insertRow gooit de ruwe mysql2-fout door; ER_DUP_ENTRY is wat de UNIQUE-index geeft.
    await expect(maakKunstwerk('TEST-CODE-DUBBEL')).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  });
});

describe('POST /api/kunstwerken', () => {
  it('weigert een lege code met 400', async () => {
    const cookie = await medewerkerCookie();
    const response = await createKunstwerk(postRequest({ code: '   ', omschrijvingNl: 'x' }, cookie));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'code-verplicht' });
  });

  it('weigert een code die al bestaat, ook met andere hoofdletters, met 409', async () => {
    await maakKunstwerk('test-post-dubbel');
    const cookie = await medewerkerCookie();
    const response = await createKunstwerk(postRequest({ code: 'TEST-POST-DUBBEL' }, cookie));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'code-bestaat-al' });
  });

  it('maakt een kunstwerk aan met een vrije code en trimt de code', async () => {
    const cookie = await medewerkerCookie();
    const response = await createKunstwerk(postRequest({ code: '  test-post-vrij  ' }, cookie));
    expect(response.status).toBe(201);
    const created = (await response.json()) as { id: string };
    createdKunstwerkIds.push(created.id);
    const [rows] = await getPool().query('SELECT code FROM kunstwerken WHERE id = ?', [created.id]);
    expect((rows as Array<{ code: string }>)[0].code).toBe('test-post-vrij');
  });

  it('weigert zonder medewerkersessie met 401', async () => {
    const response = await createKunstwerk(
      new Request('http://localhost/api/kunstwerken', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'test-post-geen-sessie' }),
      })
    );
    expect(response.status).toBe(401);
  });
});

describe('PATCH /api/kunstwerken/[id]', () => {
  it('weigert een code die al bij een ander kunstwerk hoort met 409', async () => {
    await maakKunstwerk('test-patch-bezet');
    const id = await maakKunstwerk('test-patch-eigen');
    const cookie = await medewerkerCookie();
    const response = await patchKunstwerk(patchRequest({ code: 'test-patch-bezet' }, cookie), {
      params: { id },
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'code-bestaat-al' });
  });

  it('weigert een lege code met 400', async () => {
    const id = await maakKunstwerk('test-patch-leeg');
    const cookie = await medewerkerCookie();
    const response = await patchKunstwerk(patchRequest({ code: '  ' }, cookie), { params: { id } });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'code-verplicht' });
  });

  it('wijzigt de code van een kunstwerk dat niet besteld is', async () => {
    const id = await maakKunstwerk('test-patch-oud');
    const cookie = await medewerkerCookie();
    const response = await patchKunstwerk(patchRequest({ code: 'test-patch-nieuw' }, cookie), {
      params: { id },
    });
    expect(response.status).toBe(200);
    const [rows] = await getPool().query('SELECT code FROM kunstwerken WHERE id = ?', [id]);
    expect((rows as Array<{ code: string }>)[0].code).toBe('test-patch-nieuw');
  });

  it('geeft 404 voor een kunstwerk dat niet bestaat', async () => {
    const cookie = await medewerkerCookie();
    const response = await patchKunstwerk(patchRequest({ code: 'test-patch-onbekend' }, cookie), {
      params: { id: 'bestaat-niet' },
    });
    expect(response.status).toBe(404);
  });
});

describe('slot op een besteld kunstwerk', () => {
  it('weigert een codewijziging als de code in een bestelregel voorkomt', async () => {
    const id = await maakKunstwerk('test-slot-besteld');
    await maakBestelregelMetCode('test-slot-besteld', 'slot-patch@example.com');
    const cookie = await medewerkerCookie();

    const response = await patchKunstwerk(patchRequest({ code: 'test-slot-nieuw' }, cookie), {
      params: { id },
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'code-in-bestelling' });

    const [rows] = await getPool().query('SELECT code FROM kunstwerken WHERE id = ?', [id]);
    expect((rows as Array<{ code: string }>)[0].code).toBe('test-slot-besteld');
  });

  it('staat opslaan zonder codewijziging toe bij een besteld kunstwerk', async () => {
    const id = await maakKunstwerk('test-slot-onderhoud');
    await maakBestelregelMetCode('test-slot-onderhoud', 'slot-onderhoud@example.com');
    const cookie = await medewerkerCookie();

    const response = await patchKunstwerk(
      patchRequest({ code: 'test-slot-onderhoud', omschrijvingNl: 'Bijgewerkte tekst' }, cookie),
      { params: { id } }
    );
    expect(response.status).toBe(200);
    const [rows] = await getPool().query('SELECT omschrijvingNl FROM kunstwerken WHERE id = ?', [id]);
    expect((rows as Array<{ omschrijvingNl: string }>)[0].omschrijvingNl).toBe('Bijgewerkte tekst');
  });

  it('weigert een niet-string code bij een besteld kunstwerk in plaats van hem klakkeloos te coerceren', async () => {
    const id = await maakKunstwerk('test-slot-numeriek');
    await maakBestelregelMetCode('test-slot-numeriek', 'slot-numeriek@example.com');
    const cookie = await medewerkerCookie();

    const response = await patchKunstwerk(patchRequest({ code: 2424 }, cookie), {
      params: { id },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'code-verplicht' });

    const [rows] = await getPool().query('SELECT code FROM kunstwerken WHERE id = ?', [id]);
    expect((rows as Array<{ code: string }>)[0].code).toBe('test-slot-numeriek');
  });

  it('weigert een wijziging die alleen de hoofdletters van de code aanpast bij een besteld kunstwerk', async () => {
    const id = await maakKunstwerk('test-slot-hoofdletters');
    await maakBestelregelMetCode('test-slot-hoofdletters', 'slot-hoofdletters@example.com');
    const cookie = await medewerkerCookie();

    const response = await patchKunstwerk(patchRequest({ code: 'TEST-SLOT-HOOFDLETTERS' }, cookie), {
      params: { id },
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'code-in-bestelling' });
  });

  it('weigert verwijderen als de code in een bestelregel voorkomt', async () => {
    const id = await maakKunstwerk('test-slot-verwijder');
    await maakBestelregelMetCode('test-slot-verwijder', 'slot-verwijder@example.com');
    const cookie = await medewerkerCookie();

    const response = await deleteKunstwerk(
      new Request('http://localhost/api/kunstwerken/x', { method: 'DELETE', headers: { cookie } }),
      { params: { id } }
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'in-use-bestelling' });

    const [rows] = await getPool().query('SELECT 1 FROM kunstwerken WHERE id = ?', [id]);
    expect((rows as unknown[]).length).toBe(1);
  });

  it('verwijdert een kunstwerk dat niet besteld is', async () => {
    const id = await maakKunstwerk('test-slot-vrij');
    const cookie = await medewerkerCookie();

    const response = await deleteKunstwerk(
      new Request('http://localhost/api/kunstwerken/x', { method: 'DELETE', headers: { cookie } }),
      { params: { id } }
    );
    expect(response.status).toBe(200);
    const [rows] = await getPool().query('SELECT 1 FROM kunstwerken WHERE id = ?', [id]);
    expect((rows as unknown[]).length).toBe(0);
  });

  it('geeft 404 bij verwijderen van een kunstwerk dat niet bestaat', async () => {
    const cookie = await medewerkerCookie();
    const response = await deleteKunstwerk(
      new Request('http://localhost/api/kunstwerken/x', { method: 'DELETE', headers: { cookie } }),
      { params: { id: 'bestaat-niet' } }
    );
    expect(response.status).toBe(404);
  });
});

describe('hergebruik van een vrijgekomen code', () => {
  // Deze code komt voor in bestellines, maar op geen enkel kunstwerk (zoals na een
  // verwijdering waarbij de bestelling pas ná de DELETE-transactie is gecommit --
  // zie het commentaar bij codeKomtVoorInBestellingForUpdate). Uitgeven van zo'n code
  // aan een nieuw of ander kunstwerk moet net zo geweigerd worden als een code die al
  // in gebruik is.
  it('weigert POST /api/kunstwerken met een code die alleen nog in bestellines voorkomt', async () => {
    await maakBestelregelMetCode('test-reuse-post-vrij', 'reuse-post@example.com');
    const cookie = await medewerkerCookie();

    const response = await createKunstwerk(postRequest({ code: 'test-reuse-post-vrij' }, cookie));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'code-bestaat-al' });

    const [rows] = await getPool().query('SELECT 1 FROM kunstwerken WHERE code = ?', ['test-reuse-post-vrij']);
    expect((rows as unknown[]).length).toBe(0);
  });

  it('weigert PATCH naar een code die alleen nog in bestellines voorkomt', async () => {
    const id = await maakKunstwerk('test-reuse-patch-eigen');
    await maakBestelregelMetCode('test-reuse-patch-vrij', 'reuse-patch@example.com');
    const cookie = await medewerkerCookie();

    const response = await patchKunstwerk(patchRequest({ code: 'test-reuse-patch-vrij' }, cookie), {
      params: { id },
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'code-bestaat-al' });

    const [rows] = await getPool().query('SELECT code FROM kunstwerken WHERE id = ?', [id]);
    expect((rows as Array<{ code: string }>)[0].code).toBe('test-reuse-patch-eigen');
  });
});
