import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { GET as listResource, POST as createResource } from '@/app/api/[resource]/route';
import {
  GET as getResource,
  PATCH as patchResource,
  DELETE as deleteResource,
} from '@/app/api/[resource]/[id]/route';
import { insertRow } from '@/lib/server/crud';
import { hashPassword } from '@/lib/server/password';

// Tracks the exact ids each test creates and removes only those afterward -- never
// a table-wide DELETE. Previously "gets, updates and deletes a single segment" blindly
// took listResponse.json()[0] as "the row just created", which is only safe on an
// empty table -- against a segmenten table with real data, that would have PATCHed/
// DELETEd an arbitrary real segment instead. Always resolve the id from the POST
// response instead of list ordering.
const createdSegmentIds: string[] = [];
// Tracked so the deletion-guard tests' cleanup lives in afterEach and survives an assertion
// throw -- previously this cleanup ran inline right after the assertion, which would
// permanently orphan the klant/bestelheader/bestellijn/maat rows in the shared staging
// database if the assertion ever failed.
const createdBestellijnGuardKlantEmails: string[] = [];
const createdBestellijnGuardHeaderIds: string[] = [];
const createdBestellijnGuardMaatIds: string[] = [];
// For the materiaalsoorten/prijsgroepen "still referenced by another lookup row" guard --
// same "track exact ids, clean up in afterEach" discipline as everything else in this file.
const createdLookupGuardMateriaalsoortIds: string[] = [];
const createdLookupGuardMateriaalIds: string[] = [];
const createdLookupGuardPrijsgroepIds: string[] = [];
const createdLookupGuardKlantEmails: string[] = [];

afterEach(async () => {
  // medewerkerCookie() uses a fixed fake userId (no real medewerker row exists for it), so
  // every call leaves an orphaned `sessions` row nothing else in this file would clean up.
  await getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'staff-1'");
  if (createdSegmentIds.length > 0) {
    await getPool().query('DELETE FROM segmenten WHERE id IN (?)', [createdSegmentIds]);
    createdSegmentIds.length = 0;
  }
  if (createdBestellijnGuardHeaderIds.length > 0) {
    // Cascades to bestellines (ON DELETE CASCADE), and must run before deleting the klant
    // since bestelheaders.klantnr has a plain (non-cascading) FK to klanten.
    await getPool().query('DELETE FROM bestelheaders WHERE id IN (?)', [createdBestellijnGuardHeaderIds]);
    createdBestellijnGuardHeaderIds.length = 0;
  }
  if (createdBestellijnGuardKlantEmails.length > 0) {
    await getPool().query('DELETE FROM klanten WHERE email IN (?)', [createdBestellijnGuardKlantEmails]);
    createdBestellijnGuardKlantEmails.length = 0;
  }
  if (createdBestellijnGuardMaatIds.length > 0) {
    await getPool().query('DELETE FROM maten WHERE id IN (?)', [createdBestellijnGuardMaatIds]);
    createdBestellijnGuardMaatIds.length = 0;
  }
  if (createdLookupGuardMateriaalIds.length > 0) {
    await getPool().query('DELETE FROM materialen WHERE id IN (?)', [createdLookupGuardMateriaalIds]);
    createdLookupGuardMateriaalIds.length = 0;
  }
  if (createdLookupGuardMateriaalsoortIds.length > 0) {
    await getPool().query('DELETE FROM materiaalsoorten WHERE id IN (?)', [createdLookupGuardMateriaalsoortIds]);
    createdLookupGuardMateriaalsoortIds.length = 0;
  }
  if (createdLookupGuardKlantEmails.length > 0) {
    await getPool().query('DELETE FROM klanten WHERE email IN (?)', [createdLookupGuardKlantEmails]);
    createdLookupGuardKlantEmails.length = 0;
  }
  if (createdLookupGuardPrijsgroepIds.length > 0) {
    await getPool().query('DELETE FROM prijsgroepen WHERE id IN (?)', [createdLookupGuardPrijsgroepIds]);
    createdLookupGuardPrijsgroepIds.length = 0;
  }
});

function jsonRequest(method: string, body?: unknown, cookie?: string) {
  return new Request('http://localhost/api/segmenten', {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function medewerkerCookie(): Promise<string> {
  const sessionId = await createSession('medewerker', 'staff-1');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

let bestellijnGuardKlantTeller = 0;

async function maakBestellijnVoorMaat(maatId: string): Promise<{ headerId: string; klantEmail: string }> {
  const klantEmail = `bestellijn-guard-${maatId}@example.com`;
  const klantnr = `AT-K-LR-${++bestellijnGuardKlantTeller}`;
  await insertRow<{ id: string }>('klanten', {
    email: klantEmail,
    wachtwoordHash: await hashPassword('x'),
    status: 'Goedgekeurd',
    klantnr,
  } as never);
  const header = await insertRow<{ id: string; bestelnr: string }>('bestelheaders', {
    klantnr,
    bestelnr: 'GD-TEST',
    status: 'Te beoordelen',
  } as never);
  await insertRow<{ id: string }>('bestellines', {
    bestelnr: header.bestelnr,
    code: 'test-lookup-resources-maat-guard',
    maatId,
    quantity: 1,
  } as never);
  return { headerId: header.id, klantEmail };
}

describe('generic lookup-resource routes', () => {
  it('creates then lists a segment', async () => {
    const createResponse = await createResource(
      jsonRequest('POST', { omschrijvingNl: 'Hotel', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' }, await medewerkerCookie()),
      { params: { resource: 'segmenten' } }
    );
    const created = await createResponse.json();
    createdSegmentIds.push(created.id);

    const response = await listResource(jsonRequest('GET'), { params: { resource: 'segmenten' } });
    const body = await response.json();
    const found = body.find((row: { id: string }) => row.id === created.id);
    expect(found.omschrijvingNl).toBe('Hotel');
  });

  it('rejects writing a segment without a medewerker session', async () => {
    const response = await createResource(jsonRequest('POST', { omschrijvingNl: 'Hack', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' }), {
      params: { resource: 'segmenten' },
    });
    expect(response.status).toBe(401);
  });

  it('rejects an unknown resource with 404', async () => {
    const response = await listResource(jsonRequest('GET'), { params: { resource: 'klanten' } });
    expect(response.status).toBe(404);
  });

  it('no longer serves kunstwerken through the generic resource route', async () => {
    const getResponse = await listResource(jsonRequest('GET'), { params: { resource: 'kunstwerken' } });
    expect(getResponse.status).toBe(404);
    expect((await getResponse.json()).error).toBe('not-found');

    const postResponse = await createResource(jsonRequest('POST', { code: 'x' }), {
      params: { resource: 'kunstwerken' },
    });
    expect(postResponse.status).toBe(404);
  });

  it('rejects reading a staff-only resource (prijsgroepen) without a medewerker session', async () => {
    const response = await listResource(
      new Request('http://localhost/api/prijsgroepen', { method: 'GET' }),
      { params: { resource: 'prijsgroepen' } }
    );
    expect(response.status).toBe(401);
  });

  it('allows reading prijsgroepen with a valid medewerker session', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    const response = await listResource(
      new Request('http://localhost/api/prijsgroepen', {
        method: 'GET',
        headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionId}` },
      }),
      { params: { resource: 'prijsgroepen' } }
    );
    expect(response.status).toBe(200);
  });

  it('gets, updates and deletes a single segment', async () => {
    const cookie = await medewerkerCookie();
    const createResponse = await createResource(
      jsonRequest('POST', { omschrijvingNl: 'Restaurant', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' }, cookie),
      { params: { resource: 'segmenten' } }
    );
    const created = await createResponse.json();

    const getResponse = await getResource(jsonRequest('GET'), {
      params: { resource: 'segmenten', id: created.id },
    });
    expect((await getResponse.json()).omschrijvingNl).toBe('Restaurant');

    await patchResource(jsonRequest('PATCH', { omschrijvingNl: 'Restaurantpand' }, cookie), {
      params: { resource: 'segmenten', id: created.id },
    });
    const updatedResponse = await getResource(jsonRequest('GET'), {
      params: { resource: 'segmenten', id: created.id },
    });
    expect((await updatedResponse.json()).omschrijvingNl).toBe('Restaurantpand');

    await deleteResource(jsonRequest('DELETE', undefined, cookie), {
      params: { resource: 'segmenten', id: created.id },
    });
    const afterDelete = await getResource(jsonRequest('GET'), {
      params: { resource: 'segmenten', id: created.id },
    });
    expect(afterDelete.status).toBe(404);
  });

  it('rejects updating or deleting a segment without a medewerker session', async () => {
    const cookie = await medewerkerCookie();
    const createResponse = await createResource(
      jsonRequest('POST', { omschrijvingNl: 'Kantoor', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' }, cookie),
      { params: { resource: 'segmenten' } }
    );
    const created = await createResponse.json();
    createdSegmentIds.push(created.id);

    const patchResponse = await patchResource(jsonRequest('PATCH', { omschrijvingNl: 'Hack' }), {
      params: { resource: 'segmenten', id: created.id },
    });
    expect(patchResponse.status).toBe(401);

    const deleteResponse = await deleteResource(jsonRequest('DELETE'), {
      params: { resource: 'segmenten', id: created.id },
    });
    expect(deleteResponse.status).toBe(401);
  });

  it('rejects writing a fully staff-only resource (prijsgroepen) without a medewerker session', async () => {
    const readResponse = await listResource(
      new Request('http://localhost/api/prijsgroepen', { method: 'GET' }),
      { params: { resource: 'prijsgroepen' } }
    );
    expect(readResponse.status).toBe(401);

    const writeResponse = await createResource(
      new Request('http://localhost/api/prijsgroepen', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ naam: 'Hack', kortingspercentage: 100 }),
      }),
      { params: { resource: 'prijsgroepen' } }
    );
    expect(writeResponse.status).toBe(401);
  });

  it('rejects deleting a maat that is still referenced by a bestellijn, even if no kunstwerk uses it', async () => {
    const cookie = await medewerkerCookie();
    const createResponse = await createResource(jsonRequest('POST', { breedte: 12, hoogte: 34 }, cookie), {
      params: { resource: 'maten' },
    });
    const created = await createResponse.json();
    createdBestellijnGuardMaatIds.push(created.id);
    const { headerId, klantEmail } = await maakBestellijnVoorMaat(created.id);
    createdBestellijnGuardHeaderIds.push(headerId);
    createdBestellijnGuardKlantEmails.push(klantEmail);

    const deleteResponse = await deleteResource(jsonRequest('DELETE', undefined, cookie), {
      params: { resource: 'maten', id: created.id },
    });
    expect(deleteResponse.status).toBe(409);
  });

  it('allows deleting a maat that has never been used in a bestellijn', async () => {
    const cookie = await medewerkerCookie();
    const createResponse = await createResource(jsonRequest('POST', { breedte: 13, hoogte: 35 }, cookie), {
      params: { resource: 'maten' },
    });
    const created = await createResponse.json();
    // If the assertion below fails and the maat is never actually deleted, this afterEach
    // cleanup still catches it; if the DELETE did succeed, this is a harmless no-op.
    createdBestellijnGuardMaatIds.push(created.id);

    const deleteResponse = await deleteResource(jsonRequest('DELETE', undefined, cookie), {
      params: { resource: 'maten', id: created.id },
    });
    expect(deleteResponse.status).toBe(200);
  });

  it('rejects deleting a materiaalsoort still referenced by a materiaal, allows it once unreferenced', async () => {
    const cookie = await medewerkerCookie();
    const soortResponse = await createResource(
      jsonRequest('POST', { omschrijvingNl: 'Guard soort', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' }, cookie),
      { params: { resource: 'materiaalsoorten' } }
    );
    const soort = await soortResponse.json();
    createdLookupGuardMateriaalsoortIds.push(soort.id);
    const materiaalResponse = await createResource(
      jsonRequest('POST', { materiaalsoortId: soort.id, materiaaldikte: 4, omschrijvingNl: 'Guard materiaal', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' }, cookie),
      { params: { resource: 'materialen' } }
    );
    const materiaal = await materiaalResponse.json();
    createdLookupGuardMateriaalIds.push(materiaal.id);

    const blocked = await deleteResource(jsonRequest('DELETE', undefined, cookie), {
      params: { resource: 'materiaalsoorten', id: soort.id },
    });
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).error).toBe('in-use');

    await getPool().query('DELETE FROM materialen WHERE id = ?', [materiaal.id]);
    createdLookupGuardMateriaalIds.length = 0;
    const allowed = await deleteResource(jsonRequest('DELETE', undefined, cookie), {
      params: { resource: 'materiaalsoorten', id: soort.id },
    });
    expect(allowed.status).toBe(200);
    createdLookupGuardMateriaalsoortIds.length = 0;
  });

  it('rejects deleting a prijsgroep still assigned to a klant, allows it once unassigned', async () => {
    const cookie = await medewerkerCookie();
    const prijsgroepResponse = await createResource(
      jsonRequest('POST', { naam: 'Guard prijsgroep', kortingspercentage: 10 }, cookie),
      { params: { resource: 'prijsgroepen' } }
    );
    const prijsgroep = await prijsgroepResponse.json();
    createdLookupGuardPrijsgroepIds.push(prijsgroep.id);
    const klantEmail = `lookup-guard-${prijsgroep.id}@example.com`;
    await insertRow('klanten', {
      email: klantEmail,
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
      prijsgroepId: prijsgroep.id,
    } as never);
    createdLookupGuardKlantEmails.push(klantEmail);

    const blocked = await deleteResource(jsonRequest('DELETE', undefined, cookie), {
      params: { resource: 'prijsgroepen', id: prijsgroep.id },
    });
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).error).toBe('in-use');

    await getPool().query('DELETE FROM klanten WHERE email = ?', [klantEmail]);
    createdLookupGuardKlantEmails.length = 0;
    const allowed = await deleteResource(jsonRequest('DELETE', undefined, cookie), {
      params: { resource: 'prijsgroepen', id: prijsgroep.id },
    });
    expect(allowed.status).toBe(200);
    createdLookupGuardPrijsgroepIds.length = 0;
  });
});
