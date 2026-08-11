import { describe, expect, it, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { insertRow } from '@/lib/server/crud';
import { PATCH as wijzigenBestelling } from '@/app/api/bestelheaders/[id]/wijzigen/route';

const createdKlantIds: string[] = [];
const createdKunstwerkIds: string[] = [];
const createdKunstenaarIds: string[] = [];
const createdMaatIds: string[] = [];
const createdMateriaalIds: string[] = [];
const createdMateriaalsoortIds: string[] = [];
const createdHeaderIds: string[] = [];

afterEach(async () => {
  await getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'wijzigen-staff-1'");
  if (createdHeaderIds.length > 0) {
    await getPool().query('DELETE FROM bestelheaders WHERE id IN (?)', [createdHeaderIds]);
    createdHeaderIds.length = 0;
  }
  if (createdKunstwerkIds.length > 0) {
    // Scoped op createdKunstwerkIds, niet op een aanname van ON DELETE CASCADE vanaf de
    // kunstwerken-FK -- die cascade-instelling van de koppeltabel-migratie is niet iets wat
    // deze test mag aannemen (project-regel: expliciete, gescopeerde opruiming).
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
  const sessionId = await createSession('medewerker', 'wijzigen-staff-1');
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

// kunstwerken zelf draagt sinds de koppeltabel-migratie (2026-08-11, uitgevoerd door een
// andere, nog niet gemergde worktree) geen materiaalIds/maatIds JSON-kolommen meer -- die
// koppeling loopt nu via kunstwerkMaterialen/kunstwerkMaten.
async function maakKunstwerk(code: string, materiaalId: string, maatId: string, kunstenaarnr: string | null = null) {
  const kunstwerk = await insertRow<{ id: string }>('kunstwerken', { code, kunstenaarnr } as never);
  createdKunstwerkIds.push(kunstwerk.id);
  await getPool().query('INSERT INTO kunstwerkMaterialen (kunstwerkId, materiaalId, volgorde) VALUES (?, ?, 0)', [
    kunstwerk.id,
    materiaalId,
  ]);
  await getPool().query('INSERT INTO kunstwerkMaten (kunstwerkId, maatId, volgorde) VALUES (?, ?, 0)', [
    kunstwerk.id,
    maatId,
  ]);
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
  const klant = await insertRow<{ id: string; klantnr: string }>('klanten', {
    email,
    wachtwoordHash: 'x:y',
    status: 'Goedgekeurd',
    klantnr: `AUTOTEST-${email}`,
  } as never);
  createdKlantIds.push(klant.id);
  return klant;
}

async function maakBestelling(klantnr: string, status: string, lines: Array<{ code: string; maatId: string | null; materiaalId: string | null; prijs: number | null; quantity: number }>) {
  // bestelheaders.bestelnr is VARCHAR(20) -- "AUTOTEST-BE-" (12 tekens) + Date.now() + een
  // random suffix truncate't zodra twee bestellingen in dezelfde ~100s-window ontstaan (zoals
  // twee opeenvolgende maakBestelling-aanroepen in één test), en botst dan op de unieke index
  // in plaats van de eigenaarscheck te testen. "AUTOTEST-" (9 tekens) + 11 hex-tekens van een
  // UUID blijft binnen 20 tekens en is praktisch botsingsvrij.
  const header = await insertRow<{ id: string; bestelnr: string }>('bestelheaders', {
    klantnr,
    bestelnr: `AUTOTEST-${randomUUID().replace(/-/g, '').slice(0, 11)}`,
    status,
  } as never);
  createdHeaderIds.push(header.id);
  const lineIds: string[] = [];
  for (const line of lines) {
    const row = await insertRow<{ id: string }>('bestellines', { bestelnr: header.bestelnr, ...line } as never);
    lineIds.push(row.id);
  }
  return { header, lineIds };
}

function req(body: unknown, cookie?: string) {
  return new Request('http://localhost/api', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/bestelheaders/[id]/wijzigen', () => {
  it('weigert zonder medewerkersessie', async () => {
    const klant = await maakKlant('wijzigen-noauth@example.com');
    const { header } = await maakBestelling(klant.klantnr, 'Te beoordelen', [
      { code: 'x', maatId: null, materiaalId: null, prijs: 10, quantity: 1 },
    ]);
    const response = await wijzigenBestelling(req({ korting: 5 }), { params: { id: header.id } });
    expect(response.status).toBe(401);
  });

  it('past de korting toe ongeacht status, behalve Afgewezen', async () => {
    const klant = await maakKlant('wijzigen-korting@example.com');
    const { header } = await maakBestelling(klant.klantnr, 'Betaald en afgerond', [
      { code: 'x', maatId: null, materiaalId: null, prijs: 100, quantity: 1 },
    ]);
    const cookie = await medewerkerCookie();
    const response = await wijzigenBestelling(req({ korting: 25 }, cookie), { params: { id: header.id } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.korting).toBe(25);
  });

  it('weigert elke wijziging wanneer de bestelling Afgewezen is', async () => {
    const klant = await maakKlant('wijzigen-afgewezen@example.com');
    const { header } = await maakBestelling(klant.klantnr, 'Afgewezen', [
      { code: 'x', maatId: null, materiaalId: null, prijs: 100, quantity: 1 },
    ]);
    const cookie = await medewerkerCookie();
    const response = await wijzigenBestelling(req({ korting: 10 }, cookie), { params: { id: header.id } });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'bestelling-op-slot' });
  });

  it('staat een prijs-only update toe bij Te factureren, maar weigert een aantal-wijziging', async () => {
    const klant = await maakKlant('wijzigen-tefac@example.com');
    const { header, lineIds } = await maakBestelling(klant.klantnr, 'Te factureren', [
      { code: 'x', maatId: null, materiaalId: null, prijs: 100, quantity: 1 },
    ]);
    const cookie = await medewerkerCookie();

    const prijsResponse = await wijzigenBestelling(
      req({ updates: [{ id: lineIds[0], prijs: 150 }] }, cookie),
      { params: { id: header.id } }
    );
    expect(prijsResponse.status).toBe(200);
    const prijsBody = await prijsResponse.json();
    expect(prijsBody.lines[0].prijs).toBe(150);

    const aantalResponse = await wijzigenBestelling(
      req({ updates: [{ id: lineIds[0], quantity: 2 }] }, cookie),
      { params: { id: header.id } }
    );
    expect(aantalResponse.status).toBe(400);
    expect(await aantalResponse.json()).toEqual({ error: 'regelstructuur-op-slot' });
  });

  it('weigert een regel toevoegen of verwijderen zodra de status Verstuurd naar drukker is', async () => {
    const klant = await maakKlant('wijzigen-verstuurd@example.com');
    const materiaalId = await maakMateriaal();
    const maatId = await maakMaat(40, 60);
    const kunstwerk = await maakKunstwerk('AUTOTEST-kw-verstuurd', materiaalId, maatId);
    const { header, lineIds } = await maakBestelling(klant.klantnr, 'Verstuurd naar drukker', [
      { code: 'AUTOTEST-kw-verstuurd', maatId, materiaalId, prijs: 100, quantity: 1 },
    ]);
    const cookie = await medewerkerCookie();

    const deleteResponse = await wijzigenBestelling(req({ deletions: [lineIds[0]] }, cookie), {
      params: { id: header.id },
    });
    expect(deleteResponse.status).toBe(400);
    expect(await deleteResponse.json()).toEqual({ error: 'regelstructuur-op-slot' });

    const addResponse = await wijzigenBestelling(
      req({ additions: [{ kunstwerkId: kunstwerk.id, materiaalId, maatId, quantity: 1 }] }, cookie),
      { params: { id: header.id } }
    );
    expect(addResponse.status).toBe(400);
    expect(await addResponse.json()).toEqual({ error: 'regelstructuur-op-slot' });
  });

  it('voegt een regel toe met een server-berekende prijs, ook als de client een afwijkende prijs meestuurt', async () => {
    const klant = await maakKlant('wijzigen-toevoegen@example.com');
    const materiaalId = await maakMateriaal();
    const maatId = await maakMaat(40, 60);
    const kunstwerk = await maakKunstwerk('AUTOTEST-kw-toevoegen', materiaalId, maatId);
    await getPool().query('INSERT INTO prijsmatrix (id, maatId, materiaalId, prijs) VALUES (UUID(), ?, ?, ?)', [
      maatId,
      materiaalId,
      88,
    ]);
    const { header } = await maakBestelling(klant.klantnr, 'Te beoordelen', [
      { code: 'x', maatId: null, materiaalId: null, prijs: 10, quantity: 1 },
    ]);
    const cookie = await medewerkerCookie();

    try {
      const response = await wijzigenBestelling(
        req(
          // prijs is not part of AdditionInput; this proves the server ignores it. (req()'s body
          // param is `unknown`, so this extra field doesn't actually trip a type error -- no
          // `@ts-expect-error` needed/applicable here.)
          { additions: [{ kunstwerkId: kunstwerk.id, materiaalId, maatId, quantity: 2, prijs: 999999 }] },
          cookie
        ),
        { params: { id: header.id } }
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      const nieuweRegel = body.lines.find((l: { code: string }) => l.code === 'AUTOTEST-kw-toevoegen');
      expect(nieuweRegel.prijs).toBe(88);
      expect(nieuweRegel.quantity).toBe(2);
    } finally {
      await getPool().query('DELETE FROM prijsmatrix WHERE maatId = ? AND materiaalId = ?', [maatId, materiaalId]);
    }
  });

  it('verwijdert een regel binnen de toegestane status', async () => {
    const klant = await maakKlant('wijzigen-verwijderen@example.com');
    const { header, lineIds } = await maakBestelling(klant.klantnr, 'Te beoordelen', [
      { code: 'x', maatId: null, materiaalId: null, prijs: 10, quantity: 1 },
      { code: 'y', maatId: null, materiaalId: null, prijs: 20, quantity: 1 },
    ]);
    const cookie = await medewerkerCookie();

    const response = await wijzigenBestelling(req({ deletions: [lineIds[0]] }, cookie), {
      params: { id: header.id },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0].id).toBe(lineIds[1]);
  });

  it('weigert de laatste regel te verwijderen', async () => {
    const klant = await maakKlant('wijzigen-leeg@example.com');
    const { header, lineIds } = await maakBestelling(klant.klantnr, 'Te beoordelen', [
      { code: 'x', maatId: null, materiaalId: null, prijs: 10, quantity: 1 },
    ]);
    const cookie = await medewerkerCookie();

    const response = await wijzigenBestelling(req({ deletions: [lineIds[0]] }, cookie), {
      params: { id: header.id },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'bestelling-mag-niet-leeg' });
  });

  it('weigert een update/deletion-id die niet bij deze bestelling hoort', async () => {
    // Let op: klanten.klantnr is VARCHAR(20) en MySQL truncate't in plaats van te weigeren --
    // "AUTOTEST-" is al 9 tekens, dus deze twee e-mails moeten binnen de eerste 11 tekens al
    // verschillen, anders botsen ze op de unieke index in plaats van de eigenaarscheck te testen.
    const klantA = await maakKlant('wijzigen-A@example.com');
    const klantB = await maakKlant('wijzigen-B@example.com');
    const { header: headerA } = await maakBestelling(klantA.klantnr, 'Te beoordelen', [
      { code: 'x', maatId: null, materiaalId: null, prijs: 10, quantity: 1 },
    ]);
    const { lineIds: lineIdsB } = await maakBestelling(klantB.klantnr, 'Te beoordelen', [
      { code: 'y', maatId: null, materiaalId: null, prijs: 20, quantity: 1 },
    ]);
    const cookie = await medewerkerCookie();

    const response = await wijzigenBestelling(req({ deletions: [lineIdsB[0]] }, cookie), {
      params: { id: headerA.id },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'regel-hoort-niet-bij-bestelling' });
  });

  it('laat alles-of-niets zien: een ongeldige addition rolt ook een geldige korting-wijziging terug', async () => {
    const klant = await maakKlant('wijzigen-rollback@example.com');
    const { header } = await maakBestelling(klant.klantnr, 'Te beoordelen', [
      { code: 'x', maatId: null, materiaalId: null, prijs: 10, quantity: 1 },
    ]);
    const cookie = await medewerkerCookie();

    const response = await wijzigenBestelling(
      req({ korting: 40, additions: [{ kunstwerkId: 'bestaat-niet', materiaalId: 'x', maatId: 'x', quantity: 1 }] }, cookie),
      { params: { id: header.id } }
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'kunstwerk-not-found' });

    const [rows] = await getPool().query('SELECT korting FROM bestelheaders WHERE id = ?', [header.id]);
    expect((rows as Array<{ korting: number | null }>)[0].korting).toBeNull();
  });

  it('weigert een negatieve korting en laat de opgeslagen korting ongewijzigd', async () => {
    const klant = await maakKlant('wijzigen-negkorting@example.com');
    const { header } = await maakBestelling(klant.klantnr, 'Te beoordelen', [
      { code: 'x', maatId: null, materiaalId: null, prijs: 10, quantity: 1 },
    ]);
    const cookie = await medewerkerCookie();

    const geldigeResponse = await wijzigenBestelling(req({ korting: 15 }, cookie), { params: { id: header.id } });
    expect(geldigeResponse.status).toBe(200);
    expect((await geldigeResponse.json()).korting).toBe(15);

    const response = await wijzigenBestelling(req({ korting: -10 }, cookie), { params: { id: header.id } });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid-korting' });

    const [rows] = await getPool().query('SELECT korting FROM bestelheaders WHERE id = ?', [header.id]);
    expect((rows as Array<{ korting: number | null }>)[0].korting).toBe(15);
  });

  it('weigert een update met een niet-geheel aantal', async () => {
    const klant = await maakKlant('wijzigen-nonintqty@example.com');
    const { header, lineIds } = await maakBestelling(klant.klantnr, 'Te beoordelen', [
      { code: 'x', maatId: null, materiaalId: null, prijs: 10, quantity: 1 },
    ]);
    const cookie = await medewerkerCookie();

    const response = await wijzigenBestelling(req({ updates: [{ id: lineIds[0], quantity: 2.5 }] }, cookie), {
      params: { id: header.id },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid-quantity' });
  });

  it('weigert een update met een niet-positieve prijs', async () => {
    const klant = await maakKlant('wijzigen-nonposprijs@example.com');
    const { header, lineIds } = await maakBestelling(klant.klantnr, 'Te beoordelen', [
      { code: 'x', maatId: null, materiaalId: null, prijs: 10, quantity: 1 },
    ]);
    const cookie = await medewerkerCookie();

    const response = await wijzigenBestelling(req({ updates: [{ id: lineIds[0], prijs: -5 }] }, cookie), {
      params: { id: header.id },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid-prijs' });
  });

  it('weigert het toevoegen van een kunstwerk dat exclusief is voor een andere klant', async () => {
    // klanten.klantnr is VARCHAR(20): "AUTOTEST-" (9 tekens) + de eerste 11 tekens van het
    // e-mailadres. Deze twee e-mails moeten dus al binnen die eerste 11 tekens verschillen
    // (zie ook de soortgelijke waarschuwing bij de "hoort niet bij bestelling"-test hierboven),
    // anders botsen ze op de unieke index in plaats van de exclusiviteitscheck te testen.
    const klantA = await maakKlant('wijzigen-C@example.com');
    const klantB = await maakKlant('wijzigen-D@example.com');
    const materiaalId = await maakMateriaal();
    const maatId = await maakMaat(45, 65);
    await maakKunstenaar('AUTOTEST-KA-1', [klantB.id]);
    const kunstwerk = await maakKunstwerk('AUTOTEST-kw-exclusief', materiaalId, maatId, 'AUTOTEST-KA-1');
    const { header } = await maakBestelling(klantA.klantnr, 'Te beoordelen', [
      { code: 'x', maatId: null, materiaalId: null, prijs: 10, quantity: 1 },
    ]);
    const cookie = await medewerkerCookie();

    const response = await wijzigenBestelling(
      req({ additions: [{ kunstwerkId: kunstwerk.id, materiaalId, maatId, quantity: 1 }] }, cookie),
      { params: { id: header.id } }
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'order-not-allowed' });
  });
});
