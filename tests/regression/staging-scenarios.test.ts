// Regression suite for the manually-scripted "Deel C" scenarios (klant-kunstenaar
// exclusiviteit, kunstenaarsopslag + prijsgroep, drukker versturen/combineren).
//
// SAFETY: this file connects to the database exactly the way every other test in this
// project does -- via getPool()/insertRow(), which read DB_HOST/DB_USER/etc. from
// process.env, populated by tests/setup.ts's `dotenv.config({ path: '.env.local' })`
// (the staging database). Nothing here reads .env.production.local or any production
// credential, so this suite can never reach the production database -- see the "Tests
// run against a real shared database" section in CLAUDE.md.
//
// It also never sends a real e-mail: "versturen naar drukker" in the real app is a
// *client-side* fetch() to an external PHP mail relay (VersturenNaarDrukkerDialog.tsx).
// This suite only exercises the server-side effects of that action -- recording a
// drukkerZending and flipping bestelheader statuses -- via the same two API routes the
// dialog calls, so repeated runs never spam a real inbox.
//
// CLEANUP: every klant/kunstenaar/kunstwerk/maat/materiaal/materiaalsoort/prijsgroep/
// drukker this suite touches is one it creates itself (clearly marked with an
// "AUTOTEST" prefix or an @example.com test address) and deletes again in a `finally`
// block, by exact captured id -- never a table-wide DELETE, per the hard rule in
// CLAUDE.md. The one deliberate exception is the `counters.bestelnummer` sequence: per
// that same CLAUDE.md rule it must never be reset for determinism, so each run of this
// suite permanently advances the real bestelnummer counter by a few numbers (identical
// to what already happens every time the existing tests/app/api/bestelheaders.test.ts
// suite runs).

import { describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { hashPassword } from '@/lib/server/password';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { POST as createHeader } from '@/app/api/bestelheaders/route';
import { PATCH as patchHeader } from '@/app/api/bestelheaders/[id]/route';
import { PATCH as patchKlant } from '@/app/api/klanten/[id]/route';
import { PATCH as patchKunstenaar } from '@/app/api/kunstenaars/[id]/route';
import { PUT as putKunstenaarAfspraken } from '@/app/api/kunstenaarAfspraken/[id]/route';
import { POST as postZending, GET as listZendingen } from '@/app/api/drukkers/[id]/zendingen/route';
import { buildDrukkerMail } from '@/lib/buildDrukkerMail';

function req(method: string, body?: unknown, cookie?: string) {
  return new Request('http://localhost/api', {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function medewerkerCookie(): Promise<string> {
  return `${SESSION_COOKIE_NAME}=${await createSession('medewerker', 'autotest-staff')}`;
}

async function maakKlant(emailPrefix: string, extra: Record<string, unknown> = {}) {
  const email = `autotest-${emailPrefix}-${randomUUID()}@example.com`;
  const created = await insertRow<{ id: string }>('klanten', {
    email,
    wachtwoordHash: await hashPassword('AutotestWachtwoord1!'),
    companyName: `AUTOTEST ${emailPrefix}`,
    status: 'Goedgekeurd',
    ...extra,
  } as never);
  const cookie = `${SESSION_COOKIE_NAME}=${await createSession('klant', created.id)}`;
  return { id: created.id, email, cookie };
}

async function opruimenKlanten(emails: string[]) {
  if (emails.length === 0) return;
  const pool = getPool();
  await pool.query(
    "DELETE FROM sessions WHERE userType = 'klant' AND userId IN (SELECT id FROM klanten WHERE email IN (?))",
    [emails]
  );
  await pool.query('DELETE FROM bestelheaders WHERE klantId IN (SELECT id FROM klanten WHERE email IN (?))', [
    emails,
  ]);
  await pool.query('DELETE FROM klanten WHERE email IN (?)', [emails]);
}

async function maakMaatMateriaal(label: string) {
  const soort = await insertRow<{ id: string }>('materiaalsoorten', {
    omschrijving: `AUTOTEST soort ${label}`,
  } as never);
  const materiaal = await insertRow<{ id: string }>('materialen', {
    materiaalsoortId: soort.id,
    materiaaldikte: 6,
    omschrijving: `AUTOTEST materiaal ${label}`,
  } as never);
  const maat = await insertRow<{ id: string }>('maten', { breedte: 40, hoogte: 60 } as never);
  return {
    maatId: maat.id,
    materiaalId: materiaal.id,
    async opruimen() {
      const pool = getPool();
      await pool.query('DELETE FROM maten WHERE id = ?', [maat.id]); // cascades prijsmatrix
      await pool.query('DELETE FROM materialen WHERE id = ?', [materiaal.id]); // cascades prijsmatrix
      await pool.query('DELETE FROM materiaalsoorten WHERE id = ?', [soort.id]);
    },
  };
}

async function zetMatrixPrijs(maatId: string, materiaalId: string, prijs: number) {
  await getPool().query('INSERT INTO prijsmatrix (id, maatId, materiaalId, prijs) VALUES (UUID(), ?, ?, ?)', [
    maatId,
    materiaalId,
    prijs,
  ]);
}

describe('Deel C1 -- klant-kunstenaar exclusiviteit (echte workflow)', () => {
  it('blokkeert klanten buiten de exclusiviteitslijst, staat de gekozen klant + het eigen kunstenaars-klantaccount toe, en blokkeert het eigen account weer zodra het uit de lijst is', async () => {
    const klantEmails: string[] = [];
    let kunstenaarId: string | null = null;
    let kunstwerkId: string | null = null;
    let fixture: Awaited<ReturnType<typeof maakMaatMateriaal>> | null = null;

    try {
      const kunstenaar = await insertRow<{ id: string }>('kunstenaars', {
        naam: 'AUTOTEST Kunstenaar Exclusief',
      } as never);
      kunstenaarId = kunstenaar.id;

      fixture = await maakMaatMateriaal('C1');
      await zetMatrixPrijs(fixture.maatId, fixture.materiaalId, 100);
      const kunstwerk = await insertRow<{ id: string }>(
        'kunstwerken',
        {
          naam: 'AUTOTEST Kunstwerk Exclusief',
          kunstenaarId,
          materiaalIds: [fixture.materiaalId],
          maatIds: [fixture.maatId],
        } as never,
        ['materiaalIds', 'maatIds']
      );
      kunstwerkId = kunstwerk.id;

      const eigenAccount = await maakKlant('c1-eigen-account');
      klantEmails.push(eigenAccount.email);
      const toegestaneKlant = await maakKlant('c1-toegestaan');
      klantEmails.push(toegestaneKlant.email);
      const geblokkeerdA = await maakKlant('c1-geblokkeerd-a');
      klantEmails.push(geblokkeerdA.email);
      const geblokkeerdB = await maakKlant('c1-geblokkeerd-b');
      klantEmails.push(geblokkeerdB.email);

      const staff = await medewerkerCookie();

      // "Dit klantaccount is van kunstenaar" -- koppel eigenAccount aan de kunstenaar.
      const linkKlant = await patchKlant(req('PATCH', { kunstenaarId }, staff), {
        params: { id: eigenAccount.id },
      });
      expect(linkKlant.status).toBe(200);

      // Exclusiviteit: toegestaneKlant + het eigen kunstenaars-klantaccount.
      const setExclusief = await patchKunstenaar(
        req('PATCH', { exclusieveKlantIds: [toegestaneKlant.id, eigenAccount.id] }, staff),
        { params: { id: kunstenaarId } }
      );
      expect(setExclusief.status).toBe(200);

      const lijn = { kunstwerkId, maatId: fixture.maatId, materiaalId: fixture.materiaalId, prijs: 1, quantity: 1 };

      for (const geblokkeerd of [geblokkeerdA, geblokkeerdB]) {
        const response = await createHeader(req('POST', { lines: [lijn] }, geblokkeerd.cookie));
        expect(response.status).toBe(403);
      }
      for (const toegestaan of [toegestaneKlant, eigenAccount]) {
        const response = await createHeader(req('POST', { lines: [lijn] }, toegestaan.cookie));
        expect(response.status).toBe(201);
      }

      // Edge case: haal het eigen klantaccount weer uit de lijst -- geen automatische
      // uitzondering voor "de kunstenaar zelf", dus nu ook geblokkeerd (zie resolveOrderRight.ts).
      const verwijderEigenAccount = await patchKunstenaar(
        req('PATCH', { exclusieveKlantIds: [toegestaneKlant.id] }, staff),
        { params: { id: kunstenaarId } }
      );
      expect(verwijderEigenAccount.status).toBe(200);
      const nogmaals = await createHeader(req('POST', { lines: [lijn] }, eigenAccount.cookie));
      expect(nogmaals.status).toBe(403);
    } finally {
      await opruimenKlanten(klantEmails);
      const pool = getPool();
      if (kunstwerkId) await pool.query('DELETE FROM kunstwerken WHERE id = ?', [kunstwerkId]);
      if (kunstenaarId) await pool.query('DELETE FROM kunstenaars WHERE id = ?', [kunstenaarId]);
      if (fixture) await fixture.opruimen();
    }
  });
});

describe('Deel C2 -- kunstenaarsopslag + prijsgroep (prijsopbouw van een bestelling)', () => {
  it('bouwt de prijs op uit matrixprijs -> + kunstenaarsopslag -> x prijsgroep-korting, over meerdere materiaal/maat-combinaties', async () => {
    const klantEmails: string[] = [];
    let kunstenaarId: string | null = null;
    let kunstwerkId: string | null = null;
    const fixtures: Array<Awaited<ReturnType<typeof maakMaatMateriaal>>> = [];
    const prijsgroepIds: string[] = [];

    try {
      const staff = await medewerkerCookie();

      const kunstenaar = await insertRow<{ id: string }>('kunstenaars', {
        naam: 'AUTOTEST Kunstenaar Opslag',
      } as never);
      kunstenaarId = kunstenaar.id;
      await getPool().query('INSERT INTO kunstenaarAfspraken (id, prijsopslag) VALUES (?, 0)', [kunstenaarId]);

      const fixtureA = await maakMaatMateriaal('C2-a');
      const fixtureB = await maakMaatMateriaal('C2-b');
      fixtures.push(fixtureA, fixtureB);
      await zetMatrixPrijs(fixtureA.maatId, fixtureA.materiaalId, 100);
      await zetMatrixPrijs(fixtureB.maatId, fixtureB.materiaalId, 250);

      const kunstwerk = await insertRow<{ id: string }>(
        'kunstwerken',
        {
          naam: 'AUTOTEST Kunstwerk Opslag',
          kunstenaarId,
          materiaalIds: [fixtureA.materiaalId, fixtureB.materiaalId],
          maatIds: [fixtureA.maatId, fixtureB.maatId],
        } as never,
        ['materiaalIds', 'maatIds']
      );
      kunstwerkId = kunstwerk.id;

      const prijsgroepNul = await insertRow<{ id: string }>('prijsgroepen', {
        naam: 'AUTOTEST Prijsgroep 0',
        kortingspercentage: 0,
        opslagpercentage: null,
      } as never);
      prijsgroepIds.push(prijsgroepNul.id);

      const klant = await maakKlant('c2-klant', { prijsgroepId: prijsgroepNul.id });
      klantEmails.push(klant.email);

      async function bestelBeideCombinaties() {
        const response = await createHeader(
          req(
            'POST',
            {
              lines: [
                { kunstwerkId, maatId: fixtureA.maatId, materiaalId: fixtureA.materiaalId, prijs: 1, quantity: 1 },
                { kunstwerkId, maatId: fixtureB.maatId, materiaalId: fixtureB.materiaalId, prijs: 1, quantity: 1 },
              ],
            },
            klant.cookie
          )
        );
        expect(response.status).toBe(201);
        const body = await response.json();
        const [rows] = await getPool().query(
          'SELECT maatId, prijs FROM bestellines WHERE bestelheaderId = ? ORDER BY maatId',
          [body.id]
        );
        const prijzen = new Map(
          (rows as Array<{ maatId: string; prijs: string }>).map((r) => [r.maatId, Number(r.prijs)])
        );
        return { a: prijzen.get(fixtureA.maatId)!, b: prijzen.get(fixtureB.maatId)! };
      }

      // Stap 1: kunstenaarsopslag 0, Prijsgroep 0 (0% korting) -> prijs == matrixprijs.
      const zonderOpslag = await bestelBeideCombinaties();
      expect(zonderOpslag.a).toBe(100);
      expect(zonderOpslag.b).toBe(250);

      // Stap 2: kunstenaarsopslag EUR 20 -> prijs == matrixprijs + 20.
      const opslagResponse = await putKunstenaarAfspraken(
        req('PUT', { prijsafspraken: '', prijsopslag: 20 }, staff),
        { params: { id: kunstenaarId } }
      );
      expect(opslagResponse.status).toBe(200);
      const metOpslag = await bestelBeideCombinaties();
      expect(metOpslag.a).toBe(120);
      expect(metOpslag.b).toBe(270);

      // Stap 3: klant naar Prijsgroep 25 (25% korting) -> prijs == (matrixprijs + 20) * 0,75.
      const prijsgroep25 = await insertRow<{ id: string }>('prijsgroepen', {
        naam: 'AUTOTEST Prijsgroep 25',
        kortingspercentage: 25,
        opslagpercentage: null,
      } as never);
      prijsgroepIds.push(prijsgroep25.id);
      const switchGroep = await patchKlant(req('PATCH', { prijsgroepId: prijsgroep25.id }, staff), {
        params: { id: klant.id },
      });
      expect(switchGroep.status).toBe(200);
      const metPrijsgroep = await bestelBeideCombinaties();
      expect(metPrijsgroep.a).toBe(90); // (100 + 20) * 0,75
      expect(metPrijsgroep.b).toBe(202.5); // (250 + 20) * 0,75
    } finally {
      await opruimenKlanten(klantEmails);
      const pool = getPool();
      if (kunstwerkId) await pool.query('DELETE FROM kunstwerken WHERE id = ?', [kunstwerkId]);
      if (kunstenaarId) await pool.query('DELETE FROM kunstenaars WHERE id = ?', [kunstenaarId]); // cascades kunstenaarAfspraken
      for (const fixture of fixtures) await fixture.opruimen();
      if (prijsgroepIds.length > 0) await pool.query('DELETE FROM prijsgroepen WHERE id IN (?)', [prijsgroepIds]);
    }
  });
});

describe('Deel C3 -- bestellingen van meerdere klanten combineren + niet-standaard drukker kiezen', () => {
  it('bouwt één mail met een sectie per klant, registreert de zending alleen bij de gekozen (niet-standaard) drukker, en zet beide bestellingen op "Verstuurd naar drukker"', async () => {
    const klantEmails: string[] = [];
    let kunstwerkId: string | null = null;
    let fixture: Awaited<ReturnType<typeof maakMaatMateriaal>> | null = null;
    const drukkerIds: string[] = [];
    const headerIds: string[] = [];

    try {
      const staff = await medewerkerCookie();

      fixture = await maakMaatMateriaal('C3');
      await zetMatrixPrijs(fixture.maatId, fixture.materiaalId, 80);
      const kunstwerk = await insertRow<{ id: string }>(
        'kunstwerken',
        {
          naam: 'AUTOTEST Kunstwerk Drukker',
          materiaalIds: [fixture.materiaalId],
          maatIds: [fixture.maatId],
        } as never,
        ['materiaalIds', 'maatIds']
      );
      kunstwerkId = kunstwerk.id;

      const klantX = await maakKlant('c3-klant-x');
      klantEmails.push(klantX.email);
      const klantY = await maakKlant('c3-klant-y');
      klantEmails.push(klantY.email);

      const lijn = { kunstwerkId, maatId: fixture.maatId, materiaalId: fixture.materiaalId, prijs: 1, quantity: 1 };
      const headerXResponse = await createHeader(req('POST', { lines: [lijn] }, klantX.cookie));
      const headerYResponse = await createHeader(req('POST', { lines: [lijn] }, klantY.cookie));
      expect(headerXResponse.status).toBe(201);
      expect(headerYResponse.status).toBe(201);
      const headerX = await headerXResponse.json();
      const headerY = await headerYResponse.json();
      headerIds.push(headerX.id, headerY.id);

      // Staff keurt beide goed ("Te versturen naar drukker").
      for (const id of headerIds) {
        const response = await patchHeader(req('PATCH', { status: 'Te versturen naar drukker' }, staff), {
          params: { id },
        });
        expect(response.status).toBe(200);
      }

      const drukkerStandaard = await insertRow<{ id: string }>('drukkers', {
        naam: 'AUTOTEST Drukker Standaard',
        email: 'autotest-standaard@example.com',
        standaard: true,
      } as never);
      const drukkerAlternatief = await insertRow<{ id: string }>('drukkers', {
        naam: 'AUTOTEST Drukker Alternatief',
        email: 'autotest-alternatief@example.com',
        standaard: false,
      } as never);
      drukkerIds.push(drukkerStandaard.id, drukkerAlternatief.id);

      // Combineer beide bestellingen (van 2 verschillende klanten) in één mail.
      const mail = buildDrukkerMail({
        bestellingen: [
          { id: headerX.id, klantId: klantX.id, companyName: klantX.email, bestelnr: headerX.bestelnr, besteldatum: '', status: 'Te versturen naar drukker', lineCount: 1, totalQuantity: 1, lines: [{ id: 'l1', kunstwerkId, maatId: fixture.maatId, materiaalId: fixture.materiaalId, prijs: 80, quantity: 1 }] },
          { id: headerY.id, klantId: klantY.id, companyName: klantY.email, bestelnr: headerY.bestelnr, besteldatum: '', status: 'Te versturen naar drukker', lineCount: 1, totalQuantity: 1, lines: [{ id: 'l2', kunstwerkId, maatId: fixture.maatId, materiaalId: fixture.materiaalId, prijs: 80, quantity: 1 }] },
        ],
        klanten: [],
        kunstwerken: [{ id: kunstwerkId, foto: '', naam: 'AUTOTEST Kunstwerk Drukker', kunstenaarId: null, segmentIds: [], materiaalIds: [fixture.materiaalId], maatIds: [fixture.maatId], omschrijvingNl: '', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' }],
        materialen: [{ id: fixture.materiaalId, materiaalsoortId: 'x', materiaaldikte: 6, omschrijving: 'AUTOTEST' }],
        maten: [{ id: fixture.maatId, breedte: 40, hoogte: 60 }],
        materiaalsoorten: [{ id: 'x', omschrijving: 'AUTOTEST soort' }],
      });
      // companyName fallback ("Onbekend klant" resolution) still yields one section per klant.
      expect(mail.text).toContain(klantX.email);
      expect(mail.text).toContain(klantY.email);

      // Verstuur naar de NIET-standaard drukker (server-side effect only, geen echte mail).
      const zendingResponse = await postZending(
        req(
          'POST',
          {
            onderwerp: mail.subject,
            body: mail.text,
            bestellingIds: headerIds,
            aantalKlanten: 2,
            aantalRegels: 2,
            verzondDoor: 'autotest',
          },
          staff
        ),
        { params: { id: drukkerAlternatief.id } }
      );
      expect(zendingResponse.status).toBe(201);

      for (const id of headerIds) {
        const response = await patchHeader(req('PATCH', { status: 'Verstuurd naar drukker' }, staff), {
          params: { id },
        });
        expect(response.status).toBe(200);
      }

      const alternatiefZendingen = await (
        await listZendingen(req('GET', undefined, staff), { params: { id: drukkerAlternatief.id } })
      ).json();
      expect(alternatiefZendingen).toHaveLength(1);
      expect(alternatiefZendingen[0].bestellingIds.sort()).toEqual([...headerIds].sort());

      const standaardZendingen = await (
        await listZendingen(req('GET', undefined, staff), { params: { id: drukkerStandaard.id } })
      ).json();
      expect(standaardZendingen).toHaveLength(0);

      for (const id of headerIds) {
        const [rows] = await getPool().query('SELECT status FROM bestelheaders WHERE id = ?', [id]);
        expect((rows as Array<{ status: string }>)[0].status).toBe('Verstuurd naar drukker');
      }
    } finally {
      await opruimenKlanten(klantEmails);
      const pool = getPool();
      if (kunstwerkId) await pool.query('DELETE FROM kunstwerken WHERE id = ?', [kunstwerkId]);
      if (fixture) await fixture.opruimen();
      if (drukkerIds.length > 0) await pool.query('DELETE FROM drukkers WHERE id IN (?)', [drukkerIds]); // cascades drukkerZendingen
    }
  });
});
