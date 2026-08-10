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

import { describe, expect, it, vi, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { hashPassword } from '@/lib/server/password';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';

// The drukker-mail send is client-side (see the file header), but a wachtwoord-reset
// e-mail is sent server-side from within the request-route itself (sendResetEmail.ts
// does a real fetch() to the external mail relay) -- so calling that route directly, the
// way this whole suite calls every other route, would otherwise send a real e-mail on
// every run. Stub it out, same as the existing tests/app/api/auth/reset-password.test.ts.
vi.mock('@/lib/server/sendResetEmail', () => ({ sendResetEmail: vi.fn().mockResolvedValue(undefined) }));

import { POST as createHeader } from '@/app/api/bestelheaders/route';
import { PATCH as patchHeader } from '@/app/api/bestelheaders/[id]/route';
import { PATCH as patchLine } from '@/app/api/bestelheaders/[id]/bestellines/[lineId]/route';
import { PATCH as patchKlant, DELETE as deleteKlant } from '@/app/api/klanten/[id]/route';
import { PATCH as patchKunstenaar } from '@/app/api/kunstenaars/[id]/route';
import { PUT as putKunstenaarAfspraken } from '@/app/api/kunstenaarAfspraken/[id]/route';
import { POST as postZending, GET as listZendingen } from '@/app/api/drukkers/[id]/zendingen/route';
import { POST as registerKlant } from '@/app/api/auth/register/route';
import { POST as loginKlant } from '@/app/api/auth/login/route';
import { POST as medewerkerLogin } from '@/app/api/auth/medewerker-login/route';
import { POST as requestReset } from '@/app/api/auth/reset-password/request/route';
import { POST as confirmReset } from '@/app/api/auth/reset-password/confirm/route';
import { GET as getInstelling } from '@/app/api/instellingen/[id]/route';
import { POST as postResource, GET as listResource } from '@/app/api/[resource]/route';
import { POST as createKunstwerk } from '@/app/api/kunstwerken/route';
import { buildDrukkerMail } from '@/lib/buildDrukkerMail';
import { resolveBtwPercentage } from '@/lib/resolveBtw';
import type { BtwTarieven } from '@/components/beheer/btwTarievenTypes';
import type { Bedrijfsgegevens } from '@/components/beheer/bedrijfsgegevensTypes';

const BEDRIJFSGEGEVENS_SEED: Bedrijfsgegevens = {
  bezoekadres: 'Den Heuvel 21, 5688 EM Oirschot',
  email: 'info@glassartanddesign.com',
  whatsappNummer: '31600000000',
  tenaamstelling: 'Glassart & Design',
  bic: 'BANKNL2A',
  iban: 'NL00 BANK 0123 4567 89',
  kvkNummer: '12345678',
  btwNummer: 'NL123456789B01',
  openingstijden: { nl: '', en: '', fr: '', de: '' },
  contactpersonen: [],
};

// Narrates each meaningful step to the terminal while the suite runs, so a human running
// `npm run test:regression` sees what's actually happening (which klant/kunstenaar/bedrag/
// etc.) rather than just a final pass/fail line. Needs `disableConsoleIntercept: true` in
// vitest.regression.config.ts, otherwise Vitest buffers this until the test finishes.
function stap(tekst: string) {
  // eslint-disable-next-line no-console
  console.log(`    • ${tekst}`);
}

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

// medewerkerCookie() uses a fixed fake userId (there's no real AUTOTEST medewerker row to
// attach it to), so every call leaves an orphaned `sessions` row that no klant/kunstwerk/
// etc. cleanup above would ever catch. Sweep those up after every test.
afterEach(async () => {
  await getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'autotest-staff'");
});

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
        kunstenaarnr: 'AT-K-REG-1',
        naam: 'AUTOTEST Kunstenaar Exclusief',
      } as never);
      kunstenaarId = kunstenaar.id;
      stap(`Kunstenaar "AUTOTEST Kunstenaar Exclusief" aangemaakt (${kunstenaarId})`);

      fixture = await maakMaatMateriaal('C1');
      await zetMatrixPrijs(fixture.maatId, fixture.materiaalId, 100);
      stap(`Maat/materiaal + prijsmatrix-regel aangemaakt (matrixprijs EUR 100)`);
      const kunstwerk = await insertRow<{ id: string }>(
        'kunstwerken',
        {
          code: 'AUTOTEST Kunstwerk Exclusief',
          kunstenaarId,
          materiaalIds: [fixture.materiaalId],
          maatIds: [fixture.maatId],
        } as never,
        ['materiaalIds', 'maatIds']
      );
      kunstwerkId = kunstwerk.id;
      stap(`Kunstwerk "AUTOTEST Kunstwerk Exclusief" aangemaakt (${kunstwerkId})`);

      const eigenAccount = await maakKlant('c1-eigen-account');
      klantEmails.push(eigenAccount.email);
      const toegestaneKlant = await maakKlant('c1-toegestaan');
      klantEmails.push(toegestaneKlant.email);
      const geblokkeerdA = await maakKlant('c1-geblokkeerd-a');
      klantEmails.push(geblokkeerdA.email);
      const geblokkeerdB = await maakKlant('c1-geblokkeerd-b');
      klantEmails.push(geblokkeerdB.email);
      stap(`4 testklanten aangemaakt: eigenAccount=${eigenAccount.email}, toegestaan=${toegestaneKlant.email}, 2x geblokkeerd`);

      const staff = await medewerkerCookie();

      // "Dit klantaccount is van kunstenaar" -- koppel eigenAccount aan de kunstenaar.
      const linkKlant = await patchKlant(req('PATCH', { kunstenaarId }, staff), {
        params: { id: eigenAccount.id },
      });
      expect(linkKlant.status).toBe(200);
      stap(`eigenAccount gekoppeld als kunstenaars eigen klantaccount (PATCH klanten -> ${linkKlant.status})`);

      // Exclusiviteit: toegestaneKlant + het eigen kunstenaars-klantaccount.
      const setExclusief = await patchKunstenaar(
        req('PATCH', { exclusieveKlantIds: [toegestaneKlant.id, eigenAccount.id] }, staff),
        { params: { id: kunstenaarId } }
      );
      expect(setExclusief.status).toBe(200);
      stap(`Exclusiviteit ingesteld op [toegestaneKlant, eigenAccount] (PATCH kunstenaars -> ${setExclusief.status})`);

      const lijn = { kunstwerkId, maatId: fixture.maatId, materiaalId: fixture.materiaalId, prijs: 1, quantity: 1 };

      for (const geblokkeerd of [geblokkeerdA, geblokkeerdB]) {
        const response = await createHeader(req('POST', { lines: [lijn] }, geblokkeerd.cookie));
        expect(response.status).toBe(403);
        stap(`${geblokkeerd.email} probeert te bestellen -> ${response.status} (verwacht: geblokkeerd)`);
      }
      for (const toegestaan of [toegestaneKlant, eigenAccount]) {
        const response = await createHeader(req('POST', { lines: [lijn] }, toegestaan.cookie));
        expect(response.status).toBe(201);
        stap(`${toegestaan.email} probeert te bestellen -> ${response.status} (verwacht: toegestaan)`);
      }

      // Edge case: haal het eigen klantaccount weer uit de lijst -- geen automatische
      // uitzondering voor "de kunstenaar zelf", dus nu ook geblokkeerd (zie resolveOrderRight.ts).
      const verwijderEigenAccount = await patchKunstenaar(
        req('PATCH', { exclusieveKlantIds: [toegestaneKlant.id] }, staff),
        { params: { id: kunstenaarId } }
      );
      expect(verwijderEigenAccount.status).toBe(200);
      stap(`eigenAccount uit de exclusiviteitslijst verwijderd, alleen toegestaneKlant blijft over`);
      const nogmaals = await createHeader(req('POST', { lines: [lijn] }, eigenAccount.cookie));
      expect(nogmaals.status).toBe(403);
      stap(`eigenAccount probeert opnieuw te bestellen -> ${nogmaals.status} (verwacht: nu ook geblokkeerd, geen automatische uitzondering)`);
    } finally {
      await opruimenKlanten(klantEmails);
      const pool = getPool();
      if (kunstwerkId) await pool.query('DELETE FROM kunstwerken WHERE id = ?', [kunstwerkId]);
      if (kunstenaarId) await pool.query('DELETE FROM kunstenaars WHERE id = ?', [kunstenaarId]);
      if (fixture) await fixture.opruimen();
      stap('Opgeruimd: klanten, kunstwerk, kunstenaar, maat/materiaal.');
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
        kunstenaarnr: 'AT-K-REG-2',
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
          code: 'AUTOTEST Kunstwerk Opslag',
          kunstenaarId,
          materiaalIds: [fixtureA.materiaalId, fixtureB.materiaalId],
          maatIds: [fixtureA.maatId, fixtureB.maatId],
        } as never,
        ['materiaalIds', 'maatIds']
      );
      kunstwerkId = kunstwerk.id;

      stap(`Kunstenaar zonder opslag + kunstwerk met 2 materiaal/maat-combinaties (matrixprijzen EUR 100 en EUR 250)`);

      const prijsgroepNul = await insertRow<{ id: string }>('prijsgroepen', {
        naam: 'AUTOTEST Prijsgroep 0',
        kortingspercentage: 0,
        opslagpercentage: null,
      } as never);
      prijsgroepIds.push(prijsgroepNul.id);

      const klant = await maakKlant('c2-klant', { prijsgroepId: prijsgroepNul.id });
      klantEmails.push(klant.email);
      stap(`Klant ${klant.email} aangemaakt met Prijsgroep 0 (0% korting)`);

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
      stap(`Stap 1 (geen opslag, Prijsgroep 0): besteld prijzen = EUR ${zonderOpslag.a} / EUR ${zonderOpslag.b} (verwacht: gelijk aan matrixprijs)`);

      // Stap 2: kunstenaarsopslag EUR 20 -> prijs == matrixprijs + 20.
      const opslagResponse = await putKunstenaarAfspraken(
        req('PUT', { prijsafspraken: '', prijsopslag: 20 }, staff),
        { params: { id: kunstenaarId } }
      );
      expect(opslagResponse.status).toBe(200);
      stap(`Kunstenaarsopslag ingesteld op EUR 20 (PUT kunstenaarAfspraken -> ${opslagResponse.status})`);
      const metOpslag = await bestelBeideCombinaties();
      expect(metOpslag.a).toBe(120);
      expect(metOpslag.b).toBe(270);
      stap(`Stap 2 (EUR 20 opslag, Prijsgroep 0): besteld prijzen = EUR ${metOpslag.a} / EUR ${metOpslag.b} (verwacht: matrixprijs + 20)`);

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
      stap(`Klant omgezet naar Prijsgroep 25 (25% korting) (PATCH klanten -> ${switchGroep.status})`);
      const metPrijsgroep = await bestelBeideCombinaties();
      expect(metPrijsgroep.a).toBe(90); // (100 + 20) * 0,75
      expect(metPrijsgroep.b).toBe(202.5); // (250 + 20) * 0,75
      stap(`Stap 3 (EUR 20 opslag + Prijsgroep 25): besteld prijzen = EUR ${metPrijsgroep.a} / EUR ${metPrijsgroep.b} (verwacht: (matrixprijs + 20) x 0,75)`);
    } finally {
      await opruimenKlanten(klantEmails);
      const pool = getPool();
      if (kunstwerkId) await pool.query('DELETE FROM kunstwerken WHERE id = ?', [kunstwerkId]);
      if (kunstenaarId) await pool.query('DELETE FROM kunstenaars WHERE id = ?', [kunstenaarId]); // cascades kunstenaarAfspraken
      for (const fixture of fixtures) await fixture.opruimen();
      if (prijsgroepIds.length > 0) await pool.query('DELETE FROM prijsgroepen WHERE id IN (?)', [prijsgroepIds]);
      stap('Opgeruimd: klant, kunstwerk, kunstenaar, 2x maat/materiaal, 2x prijsgroep.');
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
          code: 'AUTOTEST Kunstwerk Drukker',
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
      stap(`2 klanten aangemaakt: ${klantX.email}, ${klantY.email}`);

      const lijn = { kunstwerkId, maatId: fixture.maatId, materiaalId: fixture.materiaalId, prijs: 1, quantity: 1 };
      const headerXResponse = await createHeader(req('POST', { lines: [lijn] }, klantX.cookie));
      const headerYResponse = await createHeader(req('POST', { lines: [lijn] }, klantY.cookie));
      expect(headerXResponse.status).toBe(201);
      expect(headerYResponse.status).toBe(201);
      const headerX = await headerXResponse.json();
      const headerY = await headerYResponse.json();
      headerIds.push(headerX.id, headerY.id);
      stap(`Elke klant plaatst 1 bestelling: ${headerX.bestelnr} (${klantX.email}), ${headerY.bestelnr} (${klantY.email})`);

      // Staff keurt beide goed ("Te versturen naar drukker").
      for (const id of headerIds) {
        const response = await patchHeader(req('PATCH', { status: 'Te versturen naar drukker' }, staff), {
          params: { id },
        });
        expect(response.status).toBe(200);
      }
      stap('Beide bestellingen goedgekeurd -> "Te versturen naar drukker"');

      const drukkerStandaard = await insertRow<{ id: string; naam: string }>('drukkers', {
        naam: 'AUTOTEST Drukker Standaard',
        email: 'autotest-standaard@example.com',
        standaard: true,
      } as never);
      const drukkerAlternatief = await insertRow<{ id: string; naam: string }>('drukkers', {
        naam: 'AUTOTEST Drukker Alternatief',
        email: 'autotest-alternatief@example.com',
        standaard: false,
      } as never);
      drukkerIds.push(drukkerStandaard.id, drukkerAlternatief.id);
      stap(`2 drukkers aangemaakt: "${drukkerStandaard.naam}" (standaard) en "${drukkerAlternatief.naam}" (niet-standaard)`);

      // Combineer beide bestellingen (van 2 verschillende klanten) in één mail.
      const mail = buildDrukkerMail({
        bestellingen: [
          { id: headerX.id, klantId: klantX.id, companyName: klantX.email, bestelnr: headerX.bestelnr, besteldatum: '', status: 'Te versturen naar drukker', lineCount: 1, totalQuantity: 1, lines: [{ id: 'l1', code: 'AUTOTEST Kunstwerk Drukker', maatId: fixture.maatId, materiaalId: fixture.materiaalId, prijs: 80, quantity: 1 }] },
          { id: headerY.id, klantId: klantY.id, companyName: klantY.email, bestelnr: headerY.bestelnr, besteldatum: '', status: 'Te versturen naar drukker', lineCount: 1, totalQuantity: 1, lines: [{ id: 'l2', code: 'AUTOTEST Kunstwerk Drukker', maatId: fixture.maatId, materiaalId: fixture.materiaalId, prijs: 80, quantity: 1 }] },
        ],
        klanten: [],
        kunstwerken: [{ id: kunstwerkId, foto: '', code: 'AUTOTEST Kunstwerk Drukker', kunstenaarId: null, segmentIds: [], materiaalIds: [fixture.materiaalId], maatIds: [fixture.maatId], omschrijvingNl: '', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' }],
        materialen: [{ id: fixture.materiaalId, materiaalsoortId: 'x', materiaaldikte: 6, omschrijving: 'AUTOTEST' }],
        maten: [{ id: fixture.maatId, breedte: 40, hoogte: 60 }],
        materiaalsoorten: [{ id: 'x', omschrijving: 'AUTOTEST soort' }],
        bedrijfsgegevens: BEDRIJFSGEGEVENS_SEED,
      });
      // companyName fallback ("Onbekend klant" resolution) still yields one section per klant.
      expect(mail.text).toContain(klantX.email);
      expect(mail.text).toContain(klantY.email);
      stap(`Mail gebouwd: 1 sectie per klant, onderwerp "${mail.subject}"`);

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
      stap(`Zending geregistreerd bij "${drukkerAlternatief.naam}" (POST zendingen -> ${zendingResponse.status})`);

      for (const id of headerIds) {
        const response = await patchHeader(req('PATCH', { status: 'Verstuurd naar drukker' }, staff), {
          params: { id },
        });
        expect(response.status).toBe(200);
      }
      stap('Beide bestellingen op "Verstuurd naar drukker" gezet');

      const alternatiefZendingen = await (
        await listZendingen(req('GET', undefined, staff), { params: { id: drukkerAlternatief.id } })
      ).json();
      expect(alternatiefZendingen).toHaveLength(1);
      expect(alternatiefZendingen[0].bestellingIds.sort()).toEqual([...headerIds].sort());
      stap(`Controle: "${drukkerAlternatief.naam}" heeft ${alternatiefZendingen.length} zending met beide bestellingen`);

      const standaardZendingen = await (
        await listZendingen(req('GET', undefined, staff), { params: { id: drukkerStandaard.id } })
      ).json();
      expect(standaardZendingen).toHaveLength(0);
      stap(`Controle: "${drukkerStandaard.naam}" (standaard) heeft ${standaardZendingen.length} zendingen -- de mail is dus NIET naar de standaard drukker gegaan`);

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

describe('Klant-levenscyclus -- registreren tot inloggen na goedkeuring', () => {
  it('een nieuwe aanvraag start op "Beoordelen", kan pas na goedkeuring met een prijsgroep inloggen als "Goedgekeurd"', async () => {
    const email = `autotest-lifecycle-${randomUUID()}@example.com`;
    const wachtwoord = 'AutotestWachtwoord1!';
    const prijsgroepIds: string[] = [];

    try {
      const registratie = await registerKlant(
        req('POST', { email, password: wachtwoord, companyName: 'AUTOTEST Lifecycle BV', contactPerson: 'Jan Test' })
      );
      expect(registratie.status).toBe(201);
      stap(`Klant ${email} geregistreerd via /api/auth/register (-> ${registratie.status})`);

      const [rowsNaRegistratie] = await getPool().query(
        'SELECT id, status, prijsgroepId FROM klanten WHERE email = ?',
        [email]
      );
      const klant = (rowsNaRegistratie as Array<{ id: string; status: string; prijsgroepId: string | null }>)[0];
      expect(klant.status).toBe('Beoordelen');
      expect(klant.prijsgroepId).toBeNull();
      stap(`Status in DB: "${klant.status}", prijsgroepId: ${klant.prijsgroepId}`);

      const loginNogTeBeoordelen = await loginKlant(req('POST', { email, password: wachtwoord }));
      expect(loginNogTeBeoordelen.status).toBe(200);
      expect((await loginNogTeBeoordelen.json()).status).toBe('Beoordelen');
      stap('Inloggen vóór goedkeuring lukt (200), meldt status "Beoordelen"');

      const prijsgroep = await insertRow<{ id: string }>('prijsgroepen', {
        naam: 'AUTOTEST Lifecycle Prijsgroep',
        kortingspercentage: 10,
        opslagpercentage: null,
      } as never);
      prijsgroepIds.push(prijsgroep.id);

      const staff = await medewerkerCookie();
      const goedkeuring = await patchKlant(
        req('PATCH', { status: 'Goedgekeurd', prijsgroepId: prijsgroep.id }, staff),
        { params: { id: klant.id } }
      );
      expect(goedkeuring.status).toBe(200);
      stap(`Medewerker keurt goed met een prijsgroep (PATCH klanten -> ${goedkeuring.status})`);

      const loginNaGoedkeuring = await loginKlant(req('POST', { email, password: wachtwoord }));
      expect(loginNaGoedkeuring.status).toBe(200);
      expect((await loginNaGoedkeuring.json()).status).toBe('Goedgekeurd');
      stap('Inloggen na goedkeuring meldt status "Goedgekeurd"');

      // Goedkeuring wijzigt niets aan het wachtwoord -- een verkeerd wachtwoord blijft afgewezen.
      const foutWachtwoord = await loginKlant(req('POST', { email, password: 'onjuist' }));
      expect(foutWachtwoord.status).toBe(401);
      stap(`Inloggen met fout wachtwoord blijft ${foutWachtwoord.status} na goedkeuring`);
    } finally {
      await opruimenKlanten([email]);
      if (prijsgroepIds.length > 0) await getPool().query('DELETE FROM prijsgroepen WHERE id IN (?)', [prijsgroepIds]);
      stap('Opgeruimd: klant, prijsgroep.');
    }
  });

  it('een klant met een land zonder btw-tarief resolvet op een null btw-percentage (en de API blokkeert goedkeuren daar zelf niet op -- alleen de UI doet dat, zie KlantModal.tsx)', async () => {
    const email = `autotest-lifecycle-geen-btw-${randomUUID()}@example.com`;
    const wachtwoord = 'AutotestWachtwoord1!';
    // 'XX' is in ISO 3166-1 gereserveerd als "user-assigned" en aan geen enkel echt land
    // toegekend -- veilig genoeg om altijd afwezig te zijn in de echte btw-tarieven, maar we
    // controleren dat hieronder ook expliciet tegen de actuele data i.p.v. het aan te nemen.
    const landZonderTarief = 'XX';
    const prijsgroepIds: string[] = [];

    try {
      const tarievenResponse = await getInstelling(req('GET'), { params: { id: 'btwtarieven' } });
      expect(tarievenResponse.status).toBe(200);
      const tarieven = (await tarievenResponse.json()) as BtwTarieven;
      expect(tarieven.tarieven.some((t) => t.land === landZonderTarief)).toBe(false);
      expect(resolveBtwPercentage(tarieven.tarieven, landZonderTarief)).toBeNull();
      stap(`Echte btw-tarieven opgehaald (${tarieven.tarieven.length} land(en) geconfigureerd); land "${landZonderTarief}" komt daar niet in voor -> resolveBtwPercentage = null`);

      const klant = await insertRow<{ id: string }>('klanten', {
        email,
        wachtwoordHash: await hashPassword(wachtwoord),
        companyName: 'AUTOTEST Lifecycle Geen Btw-tarief BV',
        status: 'Beoordelen',
        land: landZonderTarief,
      } as never);
      stap(`Klant ${email} aangemaakt met land="${landZonderTarief}"`);

      const prijsgroep = await insertRow<{ id: string }>('prijsgroepen', {
        naam: 'AUTOTEST Lifecycle Geen Btw Prijsgroep',
        kortingspercentage: 10,
        opslagpercentage: null,
      } as never);
      prijsgroepIds.push(prijsgroep.id);

      // KlantModal.tsx zet `disabled={!prijsgroepId || !heeftGeldigBtwTarief}` op de
      // Goedkeuren-knop -- dat is puur een UI-gate. De PATCH-route zelf herhaalt die check
      // niet, dus dit document het huidige (server-side ongeblokkeerde) gedrag i.p.v. een
      // blokkade te veronderstellen die er niet is.
      const staff = await medewerkerCookie();
      const goedkeuring = await patchKlant(
        req('PATCH', { status: 'Goedgekeurd', prijsgroepId: prijsgroep.id }, staff),
        { params: { id: klant.id } }
      );
      expect(goedkeuring.status).toBe(200);
      stap(`Medewerker keurt via de API toch goed ondanks ontbrekend btw-tarief (-> ${goedkeuring.status}, want dit is UI-only gehandhaafd)`);
      const [rows] = await getPool().query('SELECT status, land FROM klanten WHERE id = ?', [klant.id]);
      const row = (rows as Array<{ status: string; land: string }>)[0];
      expect(row.status).toBe('Goedgekeurd');
      expect(row.land).toBe(landZonderTarief);
    } finally {
      await opruimenKlanten([email]);
      if (prijsgroepIds.length > 0) await getPool().query('DELETE FROM prijsgroepen WHERE id IN (?)', [prijsgroepIds]);
      stap('Opgeruimd: klant, prijsgroep.');
    }
  });
});

describe('Bestelling-levenscyclus -- plaatsen tot verstuurd naar drukker', () => {
  it('een bestelling met een ongeprijsde eigen-maat-regel doorloopt Te beoordelen -> geprijsd -> Te versturen naar drukker -> Verstuurd naar drukker', async () => {
    const klantEmails: string[] = [];
    let kunstwerkId: string | null = null;
    let fixture: Awaited<ReturnType<typeof maakMaatMateriaal>> | null = null;
    const drukkerIds: string[] = [];

    try {
      const staff = await medewerkerCookie();
      fixture = await maakMaatMateriaal('lifecycle-bestelling');
      // fixture.maatId blijft ongebruikt in de bestelde lijn zelf -- we bestellen straks
      // een "eigen maat" (maatId: '') op dit NIET-maatloze kunstwerk, wat altijd een NULL
      // prijs (op-aanvraag) oplevert, net als in de praktijk -- zie bestelheaders.test.ts's
      // "stores a null prijs for an eigen-maat line on a kunstwerk that is not maatloos".
      const kunstwerk = await insertRow<{ id: string }>(
        'kunstwerken',
        { code: 'AUTOTEST Kunstwerk Eigen Maat', materiaalIds: [fixture.materiaalId], maatIds: [fixture.maatId] } as never,
        ['materiaalIds', 'maatIds']
      );
      kunstwerkId = kunstwerk.id;

      const klant = await maakKlant('lifecycle-bestelling-klant');
      klantEmails.push(klant.email);
      stap(`Klant ${klant.email} + kunstwerk "AUTOTEST Kunstwerk Eigen Maat" klaargezet`);

      const plaatsing = await createHeader(
        req(
          'POST',
          {
            lines: [
              {
                kunstwerkId,
                maatId: '',
                materiaalId: fixture.materiaalId,
                prijs: 1,
                quantity: 3,
                breedte: 90,
                hoogte: 45,
              },
            ],
          },
          klant.cookie
        )
      );
      expect(plaatsing.status).toBe(201);
      const header = await plaatsing.json();
      stap(`Bestelling ${header.bestelnr} geplaatst met een eigen-maat-regel (3x 90x45cm)`);

      const [headerNaPlaatsing] = await getPool().query('SELECT status FROM bestelheaders WHERE id = ?', [header.id]);
      expect((headerNaPlaatsing as Array<{ status: string }>)[0].status).toBe('Te beoordelen');
      const [lineRows] = await getPool().query('SELECT id, prijs FROM bestellines WHERE bestelheaderId = ?', [
        header.id,
      ]);
      const line = (lineRows as Array<{ id: string; prijs: string | null }>)[0];
      expect(line.prijs).toBeNull();
      stap(`Status "${(headerNaPlaatsing as Array<{ status: string }>)[0].status}", regelprijs: ${line.prijs} (op-aanvraag, zoals verwacht)`);

      // NB: de UI blokkeert "Goedkeuren" clientside zolang een regel geen prijs heeft
      // (BestellingModal.tsx) -- de API zelf handhaaft dat niet, dus dat is hier bewust
      // geen server-side assertie. Zie de opmerking bij Deel C2/CLAUDE.md over vergelijkbare
      // client-only regels (minimaleAfname).
      const prijsVaststellen = await patchLine(req('PATCH', { prijs: 245 }, staff), {
        params: { id: header.id, lineId: line.id },
      });
      expect(prijsVaststellen.status).toBe(200);
      stap('Medewerker stelt de prijs vast op EUR 245');

      const goedkeuren = await patchHeader(req('PATCH', { status: 'Te versturen naar drukker' }, staff), {
        params: { id: header.id },
      });
      expect(goedkeuren.status).toBe(200);
      stap('Bestelling goedgekeurd -> "Te versturen naar drukker"');

      const drukker = await insertRow<{ id: string; naam: string }>('drukkers', {
        naam: 'AUTOTEST Drukker Levenscyclus',
        email: 'autotest-levenscyclus-drukker@example.com',
        standaard: false,
      } as never);
      drukkerIds.push(drukker.id);

      const zending = await postZending(
        req(
          'POST',
          { onderwerp: 'AUTOTEST', body: 'AUTOTEST', bestellingIds: [header.id], aantalKlanten: 1, aantalRegels: 1, verzondDoor: 'autotest' },
          staff
        ),
        { params: { id: drukker.id } }
      );
      expect(zending.status).toBe(201);
      stap(`Zending geregistreerd bij "${drukker.naam}"`);

      const versturen = await patchHeader(req('PATCH', { status: 'Verstuurd naar drukker' }, staff), {
        params: { id: header.id },
      });
      expect(versturen.status).toBe(200);

      const [eindstatus] = await getPool().query('SELECT status FROM bestelheaders WHERE id = ?', [header.id]);
      expect((eindstatus as Array<{ status: string }>)[0].status).toBe('Verstuurd naar drukker');
      const [eindprijs] = await getPool().query('SELECT prijs FROM bestellines WHERE id = ?', [line.id]);
      expect(Number((eindprijs as Array<{ prijs: string }>)[0].prijs)).toBe(245);
      stap(`Eindstatus "${(eindstatus as Array<{ status: string }>)[0].status}", regelprijs blijft EUR ${Number((eindprijs as Array<{ prijs: string }>)[0].prijs)}`);
    } finally {
      await opruimenKlanten(klantEmails);
      const pool = getPool();
      if (kunstwerkId) await pool.query('DELETE FROM kunstwerken WHERE id = ?', [kunstwerkId]);
      if (fixture) await fixture.opruimen();
      if (drukkerIds.length > 0) await pool.query('DELETE FROM drukkers WHERE id IN (?)', [drukkerIds]);
      stap('Opgeruimd: klant, kunstwerk, maat/materiaal, drukker.');
    }
  });
});

describe('Materiaalloos kunstwerk (prijs per m2) + prijsgroep', () => {
  it('berekent de prijs uit breedte x hoogte x prijsPerM2, en past daarna de prijsgroep-korting toe', async () => {
    const klantEmails: string[] = [];
    let kunstwerkId: string | null = null;
    const prijsgroepIds: string[] = [];

    try {
      const kunstwerk = await insertRow<{ id: string }>(
        'kunstwerken',
        { code: 'AUTOTEST Maatloos Kunstwerk', materiaalIds: [], maatIds: [], prijsPerM2: 100 } as never,
        ['materiaalIds', 'maatIds']
      );
      kunstwerkId = kunstwerk.id;

      const prijsgroep = await insertRow<{ id: string }>('prijsgroepen', {
        naam: 'AUTOTEST Maatloos Prijsgroep 25',
        kortingspercentage: 25,
        opslagpercentage: null,
      } as never);
      prijsgroepIds.push(prijsgroep.id);

      const klant = await maakKlant('maatloos-prijsgroep', { prijsgroepId: prijsgroep.id });
      klantEmails.push(klant.email);
      stap(`Maatloos kunstwerk (EUR 100/m2) + klant ${klant.email} met 25% korting klaargezet`);

      const response = await createHeader(
        req(
          'POST',
          {
            lines: [
              { kunstwerkId, maatId: '', materiaalId: '', prijs: 1, quantity: 1, breedte: 120, hoogte: 60 },
            ],
          },
          klant.cookie
        )
      );
      expect(response.status).toBe(201);
      const body = await response.json();
      const [lineRows] = await getPool().query('SELECT prijs FROM bestellines WHERE bestelheaderId = ?', [body.id]);
      // basisprijs = (120/100) * (60/100) * 100 = 72, x 0,75 (25% korting) = 54.
      const eindprijs = Number((lineRows as Array<{ prijs: string }>)[0].prijs);
      expect(eindprijs).toBe(54);
      stap(`Bestelling 120x60cm geplaatst -> EUR ${eindprijs} (verwacht: 1,2 x 0,6 x 100 x 0,75 = 54)`);
    } finally {
      await opruimenKlanten(klantEmails);
      const pool = getPool();
      if (kunstwerkId) await pool.query('DELETE FROM kunstwerken WHERE id = ?', [kunstwerkId]);
      if (prijsgroepIds.length > 0) await getPool().query('DELETE FROM prijsgroepen WHERE id IN (?)', [prijsgroepIds]);
      stap('Opgeruimd: klant, kunstwerk, prijsgroep.');
    }
  });
});

describe('Account verwijderen (klant, zelfbediening)', () => {
  it('blokkeert verwijderen bij een fout wachtwoord, verwijdert het account bij het juiste wachtwoord', async () => {
    const email = `autotest-delete-${randomUUID()}@example.com`;
    const wachtwoord = 'AutotestWachtwoord1!';
    let klantId: string | null = null;

    try {
      const created = await insertRow<{ id: string }>('klanten', {
        email,
        wachtwoordHash: await hashPassword(wachtwoord),
        companyName: 'AUTOTEST Delete BV',
        status: 'Goedgekeurd',
      } as never);
      klantId = created.id; // capture now -- `created` itself is out of scope in `finally`
      stap(`Klant ${email} aangemaakt`);

      // Zo werkt de echte "Account verwijderen"-flow ook (SettingsSection.tsx): het
      // wachtwoord wordt herbevestigd via een normale login-call, niet door de DELETE-route
      // zelf -- die vertrouwt puur op de sessie. Bij een fout wachtwoord roept de client de
      // DELETE-route dus nooit aan.
      const foutWachtwoord = await loginKlant(req('POST', { email, password: 'fout-wachtwoord' }));
      expect(foutWachtwoord.status).toBe(401);
      const [nogSteedsAanwezig] = await getPool().query('SELECT id FROM klanten WHERE id = ?', [created.id]);
      expect((nogSteedsAanwezig as unknown[]).length).toBe(1);
      stap(`Herbevestiging met fout wachtwoord -> ${foutWachtwoord.status}, account bestaat nog`);

      const juistWachtwoord = await loginKlant(req('POST', { email, password: wachtwoord }));
      expect(juistWachtwoord.status).toBe(200);
      const cookie = juistWachtwoord.headers.get('set-cookie')!;
      stap('Herbevestiging met juist wachtwoord lukt, wachtwoord-check gepasseerd');

      const verwijdering = await deleteKlant(req('DELETE', undefined, cookie), { params: { id: created.id } });
      expect(verwijdering.status).toBe(200);

      const [naVerwijdering] = await getPool().query('SELECT id FROM klanten WHERE id = ?', [created.id]);
      expect((naVerwijdering as unknown[]).length).toBe(0);
      stap(`Account verwijderd (DELETE klanten -> ${verwijdering.status}), klant-rij bestaat niet meer in de database`);
    } finally {
      const pool = getPool();
      // sessions has no FK to klanten, so the row from the successful login survives the
      // klant delete above -- clean it up by the id captured before the delete, not via a
      // klanten-lookup (which would find nothing once the klant row is already gone).
      if (klantId) await pool.query("DELETE FROM sessions WHERE userType = 'klant' AND userId = ?", [klantId]);
      // The klant is already gone if the test succeeded; this only catches the case where
      // an assertion failed before the DELETE step ran.
      await pool.query('DELETE FROM klanten WHERE email = ?', [email]);
      stap('Opgeruimd: sessie, klant (indien nog aanwezig).');
    }
  });
});

describe('Kunstwerk toevoegen met een nieuw segment/stijl/onderwerp', () => {
  it('een segment/stijl/onderwerp dat vanuit het kunstwerk-formulier "erbij" wordt gemaakt, landt echt in de eigen stamtabel en wordt op het kunstwerk gekoppeld', async () => {
    let kunstwerkId: string | null = null;
    let segmentId: string | null = null;
    let stijlId: string | null = null;
    let onderwerpId: string | null = null;

    try {
      const staff = await medewerkerCookie();

      // Zo werkt de inline "+ Toevoegen" in KunstwerkenSection ook: het nieuwe stamgegeven
      // wordt meteen als los record aangemaakt (niet pas bij het opslaan van het kunstwerk),
      // en pas daarna gekoppeld via de id in segmentIds/stijlIds/onderwerpIds.
      const segmentResponse = await postResource(
        req('POST', { omschrijving: 'AUTOTEST Segment Inline' }, staff),
        { params: { resource: 'segmenten' } }
      );
      expect(segmentResponse.status).toBe(201);
      segmentId = (await segmentResponse.json()).id;

      const stijlResponse = await postResource(req('POST', { omschrijving: 'AUTOTEST Stijl Inline' }, staff), {
        params: { resource: 'stijlen' },
      });
      expect(stijlResponse.status).toBe(201);
      stijlId = (await stijlResponse.json()).id;

      const onderwerpResponse = await postResource(
        req('POST', { omschrijving: 'AUTOTEST Onderwerp Inline' }, staff),
        { params: { resource: 'onderwerpen' } }
      );
      expect(onderwerpResponse.status).toBe(201);
      onderwerpId = (await onderwerpResponse.json()).id;
      stap(`Inline aangemaakt: segment=${segmentId}, stijl=${stijlId}, onderwerp=${onderwerpId}`);

      // Kunstwerken had een generieke CRUD-route via /api/[resource], maar heeft sinds de
      // kunstwerkcode-migratie een eigen route (unieke code, wijzig-/verwijderslot) -- zie
      // src/app/api/kunstwerken/route.ts.
      const kunstwerkResponse = await createKunstwerk(
        req(
          'POST',
          {
            code: 'AUTOTEST Kunstwerk Met Nieuwe Stamgegevens',
            segmentIds: [segmentId],
            stijlIds: [stijlId],
            onderwerpIds: [onderwerpId],
            materiaalIds: [],
            maatIds: [],
          },
          staff
        )
      );
      expect(kunstwerkResponse.status).toBe(201);
      kunstwerkId = (await kunstwerkResponse.json()).id;
      stap(`Kunstwerk aangemaakt met verwijzingen naar de 3 nieuwe stamgegevens (${kunstwerkId})`);

      // Staan de nieuwe stamgegevens echt in hun eigen tabel (niet alleen als losse id op
      // het kunstwerk)?
      const segmentenLijst = await (await listResource(req('GET'), { params: { resource: 'segmenten' } })).json();
      expect(segmentenLijst.some((s: { id: string; omschrijving: string }) => s.id === segmentId && s.omschrijving === 'AUTOTEST Segment Inline')).toBe(true);
      const stijlenLijst = await (await listResource(req('GET'), { params: { resource: 'stijlen' } })).json();
      expect(stijlenLijst.some((s: { id: string; omschrijving: string }) => s.id === stijlId && s.omschrijving === 'AUTOTEST Stijl Inline')).toBe(true);
      const onderwerpenLijst = await (
        await listResource(req('GET'), { params: { resource: 'onderwerpen' } })
      ).json();
      expect(onderwerpenLijst.some((o: { id: string; omschrijving: string }) => o.id === onderwerpId && o.omschrijving === 'AUTOTEST Onderwerp Inline')).toBe(true);
      stap(`Bevestigd: alle 3 staan echt als eigen rij in hun stamtabel (${segmentenLijst.length} segmenten, ${stijlenLijst.length} stijlen, ${onderwerpenLijst.length} onderwerpen totaal)`);

      // En staat de koppeling ook echt op het kunstwerk zelf?
      const [rows] = await getPool().query(
        'SELECT segmentIds, stijlIds, onderwerpIds FROM kunstwerken WHERE id = ?',
        [kunstwerkId]
      );
      const row = (rows as Array<{ segmentIds: string | string[]; stijlIds: string | string[]; onderwerpIds: string | string[] }>)[0];
      const parse = (v: string | string[]) => (typeof v === 'string' ? JSON.parse(v) : v);
      expect(parse(row.segmentIds)).toEqual([segmentId]);
      expect(parse(row.stijlIds)).toEqual([stijlId]);
      expect(parse(row.onderwerpIds)).toEqual([onderwerpId]);
      stap('Bevestigd: de koppeling staat ook correct op het kunstwerk zelf.');
    } finally {
      const pool = getPool();
      if (kunstwerkId) await pool.query('DELETE FROM kunstwerken WHERE id = ?', [kunstwerkId]);
      if (segmentId) await pool.query('DELETE FROM segmenten WHERE id = ?', [segmentId]);
      if (stijlId) await pool.query('DELETE FROM stijlen WHERE id = ?', [stijlId]);
      if (onderwerpId) await pool.query('DELETE FROM onderwerpen WHERE id = ?', [onderwerpId]);
      stap('Opgeruimd: kunstwerk, segment, stijl, onderwerp.');
    }
  });
});

describe('Klant van een kunstenaar kan diens werk gewoon bestellen zonder exclusiviteit', () => {
  it('koppelen van een klant aan een kunstenaar (kunstenaarId) beperkt op zichzelf niets -- die klant én andere klanten kunnen het werk gewoon bestellen', async () => {
    const klantEmails: string[] = [];
    let kunstenaarId: string | null = null;
    let kunstwerkId: string | null = null;
    let fixture: Awaited<ReturnType<typeof maakMaatMateriaal>> | null = null;

    try {
      const staff = await medewerkerCookie();

      const kunstenaar = await insertRow<{ id: string }>('kunstenaars', {
        kunstenaarnr: 'AT-K-REG-3',
        naam: 'AUTOTEST Kunstenaar Eigen Werk',
      } as never);
      kunstenaarId = kunstenaar.id;

      fixture = await maakMaatMateriaal('eigen-werk');
      await zetMatrixPrijs(fixture.maatId, fixture.materiaalId, 60);
      const kunstwerk = await insertRow<{ id: string }>(
        'kunstwerken',
        {
          code: 'AUTOTEST Kunstwerk Eigen Werk',
          kunstenaarId,
          materiaalIds: [fixture.materiaalId],
          maatIds: [fixture.maatId],
        } as never,
        ['materiaalIds', 'maatIds']
      );
      kunstwerkId = kunstwerk.id;

      const eigenKlant = await maakKlant('eigen-werk-klant');
      klantEmails.push(eigenKlant.email);
      const anderKlant = await maakKlant('eigen-werk-ander-klant');
      klantEmails.push(anderKlant.email);
      stap(`2 klanten aangemaakt: ${eigenKlant.email} (wordt gekoppeld), ${anderKlant.email} (blijft los)`);

      const koppeling = await patchKlant(req('PATCH', { kunstenaarId }, staff), { params: { id: eigenKlant.id } });
      expect(koppeling.status).toBe(200);
      stap(`eigenKlant gekoppeld aan de kunstenaar (kunstenaarId), geen exclusiviteit ingesteld`);

      const lijn = { kunstwerkId, maatId: fixture.maatId, materiaalId: fixture.materiaalId, prijs: 1, quantity: 1 };
      const bestellingEigenKlant = await createHeader(req('POST', { lines: [lijn] }, eigenKlant.cookie));
      expect(bestellingEigenKlant.status).toBe(201);
      stap(`eigenKlant bestelt het werk -> ${bestellingEigenKlant.status}`);

      // Zonder exclusieveKlantIds op de kunstenaar is dit werk gewoon open voor iedereen --
      // koppelen van een klantaccount aan een kunstenaar is puur informatief/voor
      // prijsgroep-toewijzing, het beperkt niets vanzelf.
      const bestellingAnderKlant = await createHeader(req('POST', { lines: [lijn] }, anderKlant.cookie));
      expect(bestellingAnderKlant.status).toBe(201);
      stap(`anderKlant (niet gekoppeld) bestelt hetzelfde werk -> ${bestellingAnderKlant.status} (verwacht: ook toegestaan, koppeling beperkt niets)`);
    } finally {
      await opruimenKlanten(klantEmails);
      const pool = getPool();
      if (kunstwerkId) await pool.query('DELETE FROM kunstwerken WHERE id = ?', [kunstwerkId]);
      if (kunstenaarId) await pool.query('DELETE FROM kunstenaars WHERE id = ?', [kunstenaarId]);
      if (fixture) await fixture.opruimen();
      stap('Opgeruimd: klanten, kunstwerk, kunstenaar, maat/materiaal.');
    }
  });
});

describe('Klant met alleenrecht voor één kunstenaar', () => {
  it('geeft precies die ene klant bestelrecht en blokkeert alle andere klanten voor het werk van die kunstenaar', async () => {
    const klantEmails: string[] = [];
    let kunstenaarId: string | null = null;
    let kunstwerkId: string | null = null;
    let fixture: Awaited<ReturnType<typeof maakMaatMateriaal>> | null = null;

    try {
      const staff = await medewerkerCookie();

      const kunstenaar = await insertRow<{ id: string }>('kunstenaars', {
        kunstenaarnr: 'AT-K-REG-4',
        naam: 'AUTOTEST Kunstenaar Alleenrecht',
      } as never);
      kunstenaarId = kunstenaar.id;

      fixture = await maakMaatMateriaal('alleenrecht');
      await zetMatrixPrijs(fixture.maatId, fixture.materiaalId, 70);
      const kunstwerk = await insertRow<{ id: string }>(
        'kunstwerken',
        {
          code: 'AUTOTEST Kunstwerk Alleenrecht',
          kunstenaarId,
          materiaalIds: [fixture.materiaalId],
          maatIds: [fixture.maatId],
        } as never,
        ['materiaalIds', 'maatIds']
      );
      kunstwerkId = kunstwerk.id;

      const bevoorrecht = await maakKlant('alleenrecht-bevoorrecht');
      klantEmails.push(bevoorrecht.email);
      const anderA = await maakKlant('alleenrecht-ander-a');
      klantEmails.push(anderA.email);
      const anderB = await maakKlant('alleenrecht-ander-b');
      klantEmails.push(anderB.email);
      stap(`3 klanten aangemaakt: ${bevoorrecht.email} (krijgt alleenrecht), 2x niet-bevoorrecht`);

      const alleenrecht = await patchKunstenaar(req('PATCH', { exclusieveKlantIds: [bevoorrecht.id] }, staff), {
        params: { id: kunstenaarId },
      });
      expect(alleenrecht.status).toBe(200);
      stap(`Alleenrecht ingesteld op precies 1 klant (PATCH kunstenaars -> ${alleenrecht.status})`);

      const lijn = { kunstwerkId, maatId: fixture.maatId, materiaalId: fixture.materiaalId, prijs: 1, quantity: 1 };
      const bestellingBevoorrecht = await createHeader(req('POST', { lines: [lijn] }, bevoorrecht.cookie));
      expect(bestellingBevoorrecht.status).toBe(201);
      stap(`Bevoorrechte klant bestelt -> ${bestellingBevoorrecht.status}`);

      for (const ander of [anderA, anderB]) {
        const bestelling = await createHeader(req('POST', { lines: [lijn] }, ander.cookie));
        expect(bestelling.status).toBe(403);
        stap(`${ander.email} probeert te bestellen -> ${bestelling.status} (verwacht: geblokkeerd)`);
      }
    } finally {
      await opruimenKlanten(klantEmails);
      const pool = getPool();
      if (kunstwerkId) await pool.query('DELETE FROM kunstwerken WHERE id = ?', [kunstwerkId]);
      if (kunstenaarId) await pool.query('DELETE FROM kunstenaars WHERE id = ?', [kunstenaarId]);
      if (fixture) await fixture.opruimen();
      stap('Opgeruimd: klanten, kunstwerk, kunstenaar, maat/materiaal.');
    }
  });
});


describe('Wachtwoord resetten (klant) -- aanvragen tot inloggen met het nieuwe wachtwoord', () => {
  it('een aangevraagde reset-token zet het wachtwoord om, werkt maar één keer, en een verlopen token wordt geweigerd', async () => {
    const email = `autotest-reset-${randomUUID()}@example.com`;
    const oudWachtwoord = 'OudWachtwoord1!';
    const nieuwWachtwoord = 'NieuwWachtwoord1!';

    try {
      const klant = await insertRow<{ id: string }>('klanten', {
        email,
        wachtwoordHash: await hashPassword(oudWachtwoord),
        companyName: 'AUTOTEST Reset BV',
        status: 'Goedgekeurd',
      } as never);

      const aanvraag = await requestReset(req('POST', { email, userType: 'klant' }));
      expect(aanvraag.status).toBe(200);
      stap(`Reset aangevraagd voor ${email} (sendResetEmail gemockt, dus geen echte mail)`);

      const [tokenRows] = await getPool().query(
        "SELECT token FROM passwordResetTokens WHERE userId = ? AND userType = 'klant'",
        [klant.id]
      );
      const token = (tokenRows as Array<{ token: string }>)[0].token;
      expect(token).toBeTruthy();

      const bevestiging = await confirmReset(req('POST', { token, newPassword: nieuwWachtwoord }));
      expect(bevestiging.status).toBe(200);
      stap(`Token bevestigd, wachtwoord gewijzigd (-> ${bevestiging.status})`);

      // Hetzelfde token nogmaals gebruiken moet falen -- eenmalig geldig.
      const hergebruik = await confirmReset(req('POST', { token, newPassword: 'NogEenKeer1!' }));
      expect(hergebruik.status).toBe(400);
      stap(`Hetzelfde token nogmaals gebruiken -> ${hergebruik.status} (eenmalig geldig)`);

      const loginOud = await loginKlant(req('POST', { email, password: oudWachtwoord }));
      expect(loginOud.status).toBe(401);
      const loginNieuw = await loginKlant(req('POST', { email, password: nieuwWachtwoord }));
      expect(loginNieuw.status).toBe(200);
      stap(`Oud wachtwoord -> ${loginOud.status}, nieuw wachtwoord -> ${loginNieuw.status}`);

      // Verlopen token (expiresAt in het verleden) wordt geweigerd, ook al bestaat het echt.
      const verlopenToken = randomUUID();
      await getPool().query(
        "INSERT INTO passwordResetTokens (token, userType, userId, expiresAt) VALUES (?, 'klant', ?, DATE_SUB(NOW(), INTERVAL 1 HOUR))",
        [verlopenToken, klant.id]
      );
      const verlopenPoging = await confirmReset(req('POST', { token: verlopenToken, newPassword: 'x' }));
      expect(verlopenPoging.status).toBe(400);
      stap(`Verlopen token (1 uur oud) gebruiken -> ${verlopenPoging.status}`);
      await getPool().query('DELETE FROM passwordResetTokens WHERE token = ?', [verlopenToken]);
    } finally {
      const pool = getPool();
      await pool.query(
        "DELETE FROM passwordResetTokens WHERE userId IN (SELECT id FROM klanten WHERE email = ?)",
        [email]
      );
      await opruimenKlanten([email]);
      stap('Opgeruimd: reset-tokens, klant.');
    }
  });
});

describe('Wachtwoord resetten (medewerker) -- zelfde flow via de staff-inlogroute', () => {
  it('een medewerker kan met een reset-token een nieuw wachtwoord zetten en daarmee inloggen bij beheer', async () => {
    const email = `autotest-medewerker-reset-${randomUUID()}@example.com`;
    const oudWachtwoord = 'OudStaffWachtwoord1!';
    const nieuwWachtwoord = 'NieuwStaffWachtwoord1!';
    let medewerkerId: string | null = null;

    try {
      const medewerker = await insertRow<{ id: string }>('medewerkers', {
        email,
        wachtwoordHash: await hashPassword(oudWachtwoord),
        naam: 'AUTOTEST Medewerker Reset',
      } as never);
      medewerkerId = medewerker.id;
      stap(`Medewerker ${email} aangemaakt`);

      const aanvraag = await requestReset(req('POST', { email, userType: 'medewerker' }));
      expect(aanvraag.status).toBe(200);
      stap(`Reset aangevraagd (userType: medewerker) -> ${aanvraag.status}`);

      const [tokenRows] = await getPool().query(
        "SELECT token FROM passwordResetTokens WHERE userId = ? AND userType = 'medewerker'",
        [medewerkerId]
      );
      const token = (tokenRows as Array<{ token: string }>)[0].token;
      expect(token).toBeTruthy();

      const bevestiging = await confirmReset(req('POST', { token, newPassword: nieuwWachtwoord }));
      expect(bevestiging.status).toBe(200);
      stap(`Token bevestigd, wachtwoord gewijzigd (-> ${bevestiging.status})`);

      const loginOud = await medewerkerLogin(req('POST', { email, password: oudWachtwoord }));
      expect(loginOud.status).toBe(401);
      const loginNieuw = await medewerkerLogin(req('POST', { email, password: nieuwWachtwoord }));
      expect(loginNieuw.status).toBe(200);
      stap(`Inloggen bij beheer: oud wachtwoord -> ${loginOud.status}, nieuw wachtwoord -> ${loginNieuw.status}`);
    } finally {
      const pool = getPool();
      if (medewerkerId) {
        await pool.query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = ?", [medewerkerId]);
        await pool.query('DELETE FROM passwordResetTokens WHERE userId = ?', [medewerkerId]);
        await pool.query('DELETE FROM medewerkers WHERE id = ?', [medewerkerId]);
      }
      stap('Opgeruimd: medewerker-sessie, reset-token, medewerker.');
    }
  });
});

describe('Bestelling afronden -- van plaatsing tot "Afgerond" met bestelstatusHistorie bijgehouden', () => {
  it('een bestelling die de volledige weg tot bij de drukker aflegt kan daarna door staff als "Afgerond" gemarkeerd worden, met de statusovergang in bestelstatusHistorie', async () => {
    const klantEmails: string[] = [];
    const drukkerIds: string[] = [];

    try {
      const staff = await medewerkerCookie();
      const klant = await maakKlant('afronden-klant');
      klantEmails.push(klant.email);

      // Geen kunstwerk/materiaal/maat-fixture nodig -- een lege regelset is voldoende om
      // de statusketen zelf te doorlopen (zie ook bestelheaders.test.ts's
      // bestelstatusHistorie-tests, die op dezelfde manier met `lines: []` werken).
      const plaatsing = await createHeader(req('POST', { lines: [] }, klant.cookie));
      expect(plaatsing.status).toBe(201);
      const header = await plaatsing.json();

      const [headerNaPlaatsing] = await getPool().query('SELECT status FROM bestelheaders WHERE id = ?', [
        header.id,
      ]);
      expect((headerNaPlaatsing as Array<{ status: string }>)[0].status).toBe('Te beoordelen');

      // Staff keurt goed ("Te versturen naar drukker"), net als Deel C3/de
      // Bestelling-levenscyclus hierboven.
      const goedkeuren = await patchHeader(req('PATCH', { status: 'Te versturen naar drukker' }, staff), {
        params: { id: header.id },
      });
      expect(goedkeuren.status).toBe(200);

      const drukker = await insertRow<{ id: string; naam: string }>('drukkers', {
        naam: 'AUTOTEST Drukker Afronden',
        email: 'autotest-afronden-drukker@example.com',
        standaard: false,
      } as never);
      drukkerIds.push(drukker.id);

      // "Versturen naar drukker" -- server-side effect only, geen echte mail (zie de
      // opmerking bovenin dit bestand).
      const zending = await postZending(
        req(
          'POST',
          {
            onderwerp: 'AUTOTEST',
            body: 'AUTOTEST',
            bestellingIds: [header.id],
            aantalKlanten: 1,
            aantalRegels: 0,
            verzondDoor: 'autotest',
          },
          staff
        ),
        { params: { id: drukker.id } }
      );
      expect(zending.status).toBe(201);

      const versturen = await patchHeader(req('PATCH', { status: 'Verstuurd naar drukker' }, staff), {
        params: { id: header.id },
      });
      expect(versturen.status).toBe(200);

      // De eigenlijke scenario onder test: "Markeer zending als afgerond" (DrukkerModal) /
      // "Afronden" (BestellingModal) patchen beide dezelfde route met status: 'Te factureren'
      // (de "Afronden"-mechanismes doel-status na dit ontwerp -- zie sectie B van het
      // design-doc; "Betaald en afgerond" wordt pas via de nieuwe, losstaande "Factureren"-
      // actie bereikt, wat buiten dit scenario valt).
      const afronden = await patchHeader(req('PATCH', { status: 'Te factureren' }, staff), {
        params: { id: header.id },
      });
      expect(afronden.status).toBe(200);

      const [headerRows] = await getPool().query('SELECT status FROM bestelheaders WHERE id = ?', [header.id]);
      expect((headerRows as Array<{ status: string }>)[0].status).toBe('Te factureren');

      const [historieRows] = await getPool().query(
        'SELECT status FROM bestelstatusHistorie WHERE bestelheaderId = ? ORDER BY tijdstip ASC',
        [header.id]
      );
      expect((historieRows as Array<{ status: string }>).map((r) => r.status)).toContain('Te factureren');
    } finally {
      // opruimenKlanten verwijdert ook de bestelheader (via klantId IN (...)) -- geen
      // apart headerId-cleanup nodig, zelfde patroon als de andere scenario's in dit bestand.
      await opruimenKlanten(klantEmails);
      if (drukkerIds.length > 0) await getPool().query('DELETE FROM drukkers WHERE id IN (?)', [drukkerIds]); // cascades drukkerZendingen
    }
  });
});
