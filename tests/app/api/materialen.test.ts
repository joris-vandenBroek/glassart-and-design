import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { insertRow } from '@/lib/server/crud';
import { hashPassword } from '@/lib/server/password';
import { GET as listMaterialen, POST as createMateriaal } from '@/app/api/materialen/route';
import {
  GET as getMateriaal,
  PATCH as patchMateriaal,
  DELETE as deleteMateriaal,
} from '@/app/api/materialen/[id]/route';
import { GET as listResource } from '@/app/api/[resource]/route';
import { veiligOpruimen } from '../../helpers/veiligOpruimen';

const createdMateriaalIds: string[] = [];
const createdMateriaalsoortIds: string[] = [];
const createdHeaderIds: string[] = [];
const createdKlantEmails: string[] = [];
let klantTeller = 0;

afterEach(async () => {
  await veiligOpruimen('sessions (medewerker staff-mat)', () =>
    getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'staff-mat'")
  );
  if (createdHeaderIds.length > 0) {
    // Cascadeert naar bestellines; moet vóór de klanten, want bestelheaders.klantnr
    // heeft een niet-cascaderende FK naar klanten.
    await veiligOpruimen('bestelheaders (materialen)', () =>
      getPool().query('DELETE FROM bestelheaders WHERE id IN (?)', [createdHeaderIds])
    );
    createdHeaderIds.length = 0;
  }
  if (createdKlantEmails.length > 0) {
    await veiligOpruimen('klanten (materialen)', () =>
      getPool().query('DELETE FROM klanten WHERE email IN (?)', [createdKlantEmails])
    );
    createdKlantEmails.length = 0;
  }
  if (createdMateriaalIds.length > 0) {
    await veiligOpruimen('materialen', () =>
      getPool().query('DELETE FROM materialen WHERE id IN (?)', [createdMateriaalIds])
    );
    createdMateriaalIds.length = 0;
  }
  if (createdMateriaalsoortIds.length > 0) {
    await veiligOpruimen('materiaalsoorten (materialen)', () =>
      getPool().query('DELETE FROM materiaalsoorten WHERE id IN (?)', [createdMateriaalsoortIds])
    );
    createdMateriaalsoortIds.length = 0;
  }
});

function jsonRequest(method: string, body?: unknown, cookie?: string) {
  return new Request('http://localhost/api/materialen', {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function medewerkerCookie(): Promise<string> {
  const sessionId = await createSession('medewerker', 'staff-mat');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

async function maakMateriaalsoort(): Promise<string> {
  const soort = await insertRow<{ id: string }>('materiaalsoorten', {
    omschrijvingNl: 'AUTOTEST Materiaalsoort',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  } as never);
  createdMateriaalsoortIds.push(soort.id);
  return soort.id;
}

async function maakMateriaal(extra: Record<string, unknown> = {}): Promise<string> {
  const materiaal = await insertRow<{ id: string }>('materialen', {
    materiaalsoortId: await maakMateriaalsoort(),
    materiaaldikte: 4,
    omschrijvingNl: 'AUTOTEST Materiaal',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    ...extra,
  } as never);
  createdMateriaalIds.push(materiaal.id);
  return materiaal.id;
}

async function maakBestellijn(materiaalId: string, status: string): Promise<void> {
  const klantEmail = `autotest-materiaal-${++klantTeller}-${materiaalId}@example.com`;
  const klantnr = `AT-K-MAT-${klantTeller}`;
  await insertRow<{ id: string }>('klanten', {
    email: klantEmail,
    wachtwoordHash: await hashPassword('x'),
    status: 'Goedgekeurd',
    klantnr,
  } as never);
  createdKlantEmails.push(klantEmail);
  const header = await insertRow<{ id: string; bestelnr: string }>('bestelheaders', {
    klantnr,
    bestelnr: `AT-MAT-${klantTeller}`,
    status,
  } as never);
  createdHeaderIds.push(header.id);
  await insertRow<{ id: string }>('bestellines', {
    bestelnr: header.bestelnr,
    code: 'autotest-materiaal-route',
    materiaalId,
    quantity: 1,
  } as never);
}

describe('/api/materialen', () => {
  it('maakt, leest, wijzigt en verwijdert een materiaal', async () => {
    const cookie = await medewerkerCookie();
    const soortId = await maakMateriaalsoort();

    const createResponse = await createMateriaal(
      jsonRequest(
        'POST',
        {
          materiaalsoortId: soortId,
          materiaaldikte: 4,
          omschrijvingNl: 'AUTOTEST Glas',
          omschrijvingFr: '',
          omschrijvingDe: '',
          omschrijvingEn: '',
        },
        cookie
      )
    );
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    createdMateriaalIds.push(created.id);

    const getResponse = await getMateriaal(jsonRequest('GET'), { params: { id: created.id } });
    const gelezen = await getResponse.json();
    expect(gelezen.omschrijvingNl).toBe('AUTOTEST Glas');
    expect(Boolean(gelezen.actief)).toBe(true);

    const patchResponse = await patchMateriaal(jsonRequest('PATCH', { omschrijvingNl: 'AUTOTEST Glas 2' }, cookie), {
      params: { id: created.id },
    });
    expect(patchResponse.status).toBe(200);

    const listResponse = await listMaterialen(jsonRequest('GET'));
    const lijst = (await listResponse.json()) as Array<{ id: string; omschrijvingNl: string }>;
    expect(lijst.find((row) => row.id === created.id)?.omschrijvingNl).toBe('AUTOTEST Glas 2');

    const deleteResponse = await deleteMateriaal(jsonRequest('DELETE', undefined, cookie), {
      params: { id: created.id },
    });
    expect(deleteResponse.status).toBe(200);
  });

  it('weigert schrijven zonder medewerkersessie', async () => {
    const response = await createMateriaal(
      jsonRequest('POST', { materiaalsoortId: 'x', materiaaldikte: 4, omschrijvingNl: 'Hack' })
    );
    expect(response.status).toBe(401);
  });

  it('laat de lijst publiek lezen', async () => {
    const response = await listMaterialen(new Request('http://localhost/api/materialen', { method: 'GET' }));
    expect(response.status).toBe(200);
  });

  it('blokkeert verwijderen zodra het materiaal in een bestellijn voorkomt', async () => {
    const cookie = await medewerkerCookie();
    const materiaalId = await maakMateriaal();
    await maakBestellijn(materiaalId, 'Betaald en afgerond');

    const response = await deleteMateriaal(jsonRequest('DELETE', undefined, cookie), {
      params: { id: materiaalId },
    });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe('in-use-bestelling');
  });

  it('serveert materialen niet meer via de generieke resource-route', async () => {
    const response = await listResource(jsonRequest('GET'), { params: { resource: 'materialen' } });
    expect(response.status).toBe(404);
  });
});
