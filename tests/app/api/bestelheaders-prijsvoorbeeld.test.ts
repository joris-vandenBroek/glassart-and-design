import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { insertRow } from '@/lib/server/crud';
import { randomUUID } from 'crypto';
import { GET as prijsvoorbeeld } from '@/app/api/bestelheaders/[id]/prijsvoorbeeld/route';

const createdKlantIds: string[] = [];
const createdKunstwerkIds: string[] = [];
const createdKunstenaarIds: string[] = [];
const createdMaatIds: string[] = [];
const createdMateriaalIds: string[] = [];
const createdMateriaalsoortIds: string[] = [];
const createdHeaderIds: string[] = [];

afterEach(async () => {
  await getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'prijsvoorbeeld-staff-1'");
  if (createdHeaderIds.length > 0) {
    await getPool().query('DELETE FROM bestelheaders WHERE id IN (?)', [createdHeaderIds]);
    createdHeaderIds.length = 0;
  }
  if (createdKunstwerkIds.length > 0) {
    await getPool().query('DELETE FROM kunstwerkMaterialen WHERE kunstwerkId IN (?)', [createdKunstwerkIds]);
    await getPool().query('DELETE FROM kunstwerkMaten WHERE kunstwerkId IN (?)', [createdKunstwerkIds]);
    await getPool().query('DELETE FROM kunstwerken WHERE id IN (?)', [createdKunstwerkIds]);
    createdKunstwerkIds.length = 0;
  }
  if (createdKunstenaarIds.length > 0) {
    await getPool().query('DELETE FROM kunstenaars WHERE id IN (?)', [createdKunstenaarIds]);
    createdKunstenaarIds.length = 0;
  }
  if (createdMateriaalIds.length > 0) {
    await getPool().query('DELETE FROM materialen WHERE id IN (?)', [createdMateriaalIds]);
    createdMateriaalIds.length = 0;
  }
  if (createdMateriaalsoortIds.length > 0) {
    await getPool().query('DELETE FROM materiaalsoorten WHERE id IN (?)', [createdMateriaalsoortIds]);
    createdMateriaalsoortIds.length = 0;
  }
  if (createdMaatIds.length > 0) {
    await getPool().query('DELETE FROM maten WHERE id IN (?)', [createdMaatIds]);
    createdMaatIds.length = 0;
  }
  if (createdKlantIds.length > 0) {
    await getPool().query("DELETE FROM sessions WHERE userType = 'klant' AND userId IN (?)", [createdKlantIds]);
    await getPool().query('DELETE FROM klanten WHERE id IN (?)', [createdKlantIds]);
    createdKlantIds.length = 0;
  }
});

async function medewerkerCookie() {
  const sessionId = await createSession('medewerker', 'prijsvoorbeeld-staff-1');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

async function maakMaat(breedte: number, hoogte: number) {
  const maat = await insertRow<{ id: string }>('maten', { breedte, hoogte } as never);
  createdMaatIds.push(maat.id);
  return maat.id;
}

async function maakMateriaal() {
  const soort = await insertRow<{ id: string }>('materiaalsoorten', {
    omschrijvingNl: 'AUTOTEST soort',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  } as never);
  createdMateriaalsoortIds.push(soort.id);
  const materiaal = await insertRow<{ id: string }>('materialen', {
    materiaalsoortId: soort.id,
    materiaaldikte: 4,
    omschrijvingNl: 'AUTOTEST materiaal',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  } as never);
  createdMateriaalIds.push(materiaal.id);
  return materiaal.id;
}

async function maakKunstwerk(
  code: string,
  materiaalId: string,
  maatId: string,
  kunstenaarnr: string | null = null,
  prijsPerM2: number | null = null
) {
  const kunstwerk = await insertRow<{ id: string }>('kunstwerken', { code, kunstenaarnr, prijsPerM2 } as never);
  createdKunstwerkIds.push(kunstwerk.id);
  if (materiaalId) {
    await getPool().query('INSERT INTO kunstwerkMaterialen (kunstwerkId, materiaalId, volgorde) VALUES (?, ?, 0)', [
      kunstwerk.id,
      materiaalId,
    ]);
  }
  if (maatId) {
    await getPool().query('INSERT INTO kunstwerkMaten (kunstwerkId, maatId, volgorde) VALUES (?, ?, 0)', [
      kunstwerk.id,
      maatId,
    ]);
  }
  return kunstwerk;
}

async function maakKunstenaar(kunstenaarnr: string, exclusieveKlantIds: string[]) {
  const kunstenaar = await insertRow<{ id: string }>(
    'kunstenaars',
    { kunstenaarnr, naam: 'AUTOTEST Exclusieve Artiest', exclusieveKlantIds } as never,
    ['exclusieveKlantIds']
  );
  createdKunstenaarIds.push(kunstenaar.id);
  return kunstenaar;
}

async function maakKlant(email: string) {
  // klantnr is VARCHAR(20) -- twee vergelijkbare e-mailadressen (zoals "...exclusief" en
  // "...exclusief-ander" in dezelfde test) zouden op dezelfde afgekapte 20 tekens botsen
  // als klantnr direct van het e-mailadres afgeleid werd. Een korte random suffix niet.
  const klant = await insertRow<{ id: string; klantnr: string }>('klanten', {
    email,
    wachtwoordHash: 'x:y',
    status: 'Goedgekeurd',
    klantnr: `AUTOTEST-${randomUUID().replace(/-/g, '').slice(0, 11)}`,
  } as never);
  createdKlantIds.push(klant.id);
  return klant;
}

async function maakBestelling(klantnr: string) {
  const header = await insertRow<{ id: string; bestelnr: string }>('bestelheaders', {
    klantnr,
    bestelnr: `AUTOTEST-${randomUUID().replace(/-/g, '').slice(0, 11)}`,
    status: 'Te beoordelen',
  } as never);
  createdHeaderIds.push(header.id);
  return header;
}

function req(cookie?: string) {
  return new Request('http://localhost/api', {
    headers: { ...(cookie ? { cookie } : {}) },
  });
}

describe('GET /api/bestelheaders/[id]/prijsvoorbeeld', () => {
  it('weigert zonder medewerkersessie', async () => {
    const klant = await maakKlant('prijsvoorbeeld-noauth@example.com');
    const header = await maakBestelling(klant.klantnr);
    const response = await prijsvoorbeeld(req(), { params: { id: header.id } });
    expect(response.status).toBe(401);
  });

  it('geeft de vaste matrixprijs voor een geldige kunstwerk/materiaal/maat-combinatie', async () => {
    const klant = await maakKlant('prijsvoorbeeld-vast@example.com');
    const header = await maakBestelling(klant.klantnr);
    const materiaalId = await maakMateriaal();
    const maatId = await maakMaat(40, 60);
    const kunstwerk = await maakKunstwerk('AUTOTEST-pv-vast', materiaalId, maatId);
    await getPool().query('INSERT INTO prijsmatrix (id, maatId, materiaalId, prijs) VALUES (UUID(), ?, ?, ?)', [
      maatId,
      materiaalId,
      88,
    ]);
    const cookie = await medewerkerCookie();

    const url = new URL(`http://localhost/api?kunstwerkId=${kunstwerk.id}&materiaalId=${materiaalId}&maatId=${maatId}`);
    const response = await prijsvoorbeeld(new Request(url, { headers: { cookie } }), { params: { id: header.id } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'vast', code: 'AUTOTEST-pv-vast', prijs: 88 });
    await getPool().query('DELETE FROM prijsmatrix WHERE maatId = ? AND materiaalId = ?', [maatId, materiaalId]);
  });

  it('geeft 400 invalid-body zonder querystring-parameters', async () => {
    const klant = await maakKlant('prijsvoorbeeld-geenquery@example.com');
    const header = await maakBestelling(klant.klantnr);
    const cookie = await medewerkerCookie();
    const response = await prijsvoorbeeld(req(cookie), { params: { id: header.id } });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid-body' });
  });

  it('geeft op-aanvraag voor eigen-maat zonder matrixprijs en berekent via prijsPerM2 met breedte/hoogte', async () => {
    const klant = await maakKlant('prijsvoorbeeld-eigenmaat@example.com');
    const header = await maakBestelling(klant.klantnr);
    const materiaalId = await maakMateriaal();
    await getPool().query('UPDATE materialen SET prijsPerM2 = ? WHERE id = ?', [200, materiaalId]);
    const kunstwerk = await maakKunstwerk('AUTOTEST-pv-eigenmaat', materiaalId, '', null, 200);

    const url = new URL(
      `http://localhost/api?kunstwerkId=${kunstwerk.id}&materiaalId=${materiaalId}&maatId=&breedte=100&hoogte=50`
    );
    const cookie = await medewerkerCookie();
    const response = await prijsvoorbeeld(new Request(url, { headers: { cookie } }), { params: { id: header.id } });
    expect(response.status).toBe(200);
    // 1m x 0.5m x 200/m2 = 100
    expect(await response.json()).toEqual({ status: 'vast', code: 'AUTOTEST-pv-eigenmaat', prijs: 100 });
  });

  it('gebruikt de prijsPerM2 van het materiaal, niet van het kunstwerk, zodra het kunstwerk materialen heeft', async () => {
    const klant = await maakKlant('prijsvoorbeeld-materiaal-prijs@example.com');
    const header = await maakBestelling(klant.klantnr);
    const materiaalId = await maakMateriaal();
    await getPool().query('UPDATE materialen SET prijsPerM2 = ? WHERE id = ?', [150, materiaalId]);
    // kunstwerk.prijsPerM2 zelf blijft ingevuld (bv. nog niet opgeruimde oude data) -- moet
    // genegeerd worden zodra er een materiaal gekoppeld is.
    const kunstwerk = await maakKunstwerk('AUTOTEST-pv-materiaalprijs', materiaalId, '', null, 999);

    const url = new URL(
      `http://localhost/api?kunstwerkId=${kunstwerk.id}&materiaalId=${materiaalId}&maatId=&breedte=100&hoogte=50`
    );
    const cookie = await medewerkerCookie();
    const response = await prijsvoorbeeld(new Request(url, { headers: { cookie } }), { params: { id: header.id } });
    expect(response.status).toBe(200);
    // 1m x 0.5m x 150/m2 = 75 -- van het materiaal, niet de 999 van het kunstwerk.
    expect(await response.json()).toEqual({ status: 'vast', code: 'AUTOTEST-pv-materiaalprijs', prijs: 75 });
  });

  it('geeft 400 afmeting-vereist voor eigen maat zonder breedte/hoogte', async () => {
    const klant = await maakKlant('prijsvoorbeeld-geenafmeting@example.com');
    const header = await maakBestelling(klant.klantnr);
    const materiaalId = await maakMateriaal();
    const kunstwerk = await maakKunstwerk('AUTOTEST-pv-geenafmeting', materiaalId, '', null, 200);

    const url = new URL(`http://localhost/api?kunstwerkId=${kunstwerk.id}&materiaalId=${materiaalId}&maatId=`);
    const cookie = await medewerkerCookie();
    const response = await prijsvoorbeeld(new Request(url, { headers: { cookie } }), { params: { id: header.id } });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'afmeting-vereist' });
  });

  it('geeft 400 materiaal-niet-beschikbaar wanneer het materiaal niet bij dit kunstwerk hoort', async () => {
    const klant = await maakKlant('prijsvoorbeeld-materiaal@example.com');
    const header = await maakBestelling(klant.klantnr);
    const materiaalId = await maakMateriaal();
    const anderMateriaalId = await maakMateriaal();
    const maatId = await maakMaat(41, 61);
    const kunstwerk = await maakKunstwerk('AUTOTEST-pv-materiaal', materiaalId, maatId);

    const url = new URL(
      `http://localhost/api?kunstwerkId=${kunstwerk.id}&materiaalId=${anderMateriaalId}&maatId=${maatId}`
    );
    const cookie = await medewerkerCookie();
    const response = await prijsvoorbeeld(new Request(url, { headers: { cookie } }), { params: { id: header.id } });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'materiaal-niet-beschikbaar' });
  });

  it('geeft 403 order-not-allowed wanneer het kunstwerk exclusief is voor een andere klant', async () => {
    const klant = await maakKlant('prijsvoorbeeld-exclusief@example.com');
    const anderKlant = await maakKlant('prijsvoorbeeld-exclusief-ander@example.com');
    const header = await maakBestelling(klant.klantnr);
    const materiaalId = await maakMateriaal();
    const maatId = await maakMaat(42, 62);
    await maakKunstenaar('AT-PV-EXCL', [anderKlant.id]);
    const kunstwerk = await maakKunstwerk('AUTOTEST-pv-exclusief', materiaalId, maatId, 'AT-PV-EXCL');

    const url = new URL(`http://localhost/api?kunstwerkId=${kunstwerk.id}&materiaalId=${materiaalId}&maatId=${maatId}`);
    const cookie = await medewerkerCookie();
    const response = await prijsvoorbeeld(new Request(url, { headers: { cookie } }), { params: { id: header.id } });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'order-not-allowed' });
  });

  it('geeft 404 wanneer de bestelling niet bestaat', async () => {
    const cookie = await medewerkerCookie();
    const url = new URL('http://localhost/api?kunstwerkId=x&materiaalId=x&maatId=x');
    const response = await prijsvoorbeeld(new Request(url, { headers: { cookie } }), {
      params: { id: 'bestaat-niet' },
    });
    expect(response.status).toBe(404);
  });
});
