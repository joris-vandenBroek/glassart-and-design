import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { insertRow } from '@/lib/server/crud';
import { veiligOpruimen } from '../../helpers/veiligOpruimen';

const verstuurMailMock = vi.fn();
vi.mock('@/lib/server/mailRelay', () => ({
  verstuurMail: (...args: unknown[]) => verstuurMailMock(...args),
}));

const { POST: postMail } = await import('@/app/api/mail/route');

const createdKlantIds: string[] = [];
const createdDrukkerIds: string[] = [];
const createdHeaderIds: string[] = [];

beforeEach(() => {
  verstuurMailMock.mockReset();
  verstuurMailMock.mockResolvedValue(true);
});

afterEach(async () => {
  await veiligOpruimen('sessions (medewerker mail-staff-1)', () =>
    getPool().query(
      "DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'mail-staff-1'"
    )
  );
  // bestelheaders.klantnr heeft een FK (zonder CASCADE) naar klanten.klantnr, dus de
  // header-cleanup moet vóór de klant-cleanup draaien.
  if (createdHeaderIds.length > 0) {
    await veiligOpruimen('bestelheaders', () =>
      getPool().query('DELETE FROM bestelheaders WHERE id IN (?)', [createdHeaderIds])
    );
    createdHeaderIds.length = 0;
  }
  if (createdKlantIds.length > 0) {
    await veiligOpruimen('sessions (klant)', () =>
      getPool().query('DELETE FROM sessions WHERE userType = ? AND userId IN (?)', [
        'klant',
        createdKlantIds,
      ])
    );
    await veiligOpruimen('klanten', () =>
      getPool().query('DELETE FROM klanten WHERE id IN (?)', [createdKlantIds])
    );
    createdKlantIds.length = 0;
  }
  if (createdDrukkerIds.length > 0) {
    await veiligOpruimen('drukkers', () =>
      getPool().query('DELETE FROM drukkers WHERE id IN (?)', [createdDrukkerIds])
    );
    createdDrukkerIds.length = 0;
  }
});

function req(body: unknown, cookie?: string) {
  return new Request('http://localhost/api/mail', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

async function maakKlantMetSessie(email: string) {
  const klant = await insertRow<{ id: string }>('klanten', {
    email,
    wachtwoordHash: 'x:y',
    status: 'Goedgekeurd',
  } as never);
  createdKlantIds.push(klant.id);
  const sessionId = await createSession('klant', klant.id);
  return { klantId: klant.id, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

async function medewerkerCookie() {
  const sessionId = await createSession('medewerker', 'mail-staff-1');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

describe('POST /api/mail', () => {
  it('weigert een bestelbevestiging zonder klantsessie', async () => {
    const response = await postMail(req({ soort: 'bestelbevestiging', subject: 'S', body: 'B' }));
    expect(response.status).toBe(401);
    expect(verstuurMailMock).not.toHaveBeenCalled();
  });

  it('weigert een drukkersmail zonder medewerkersessie', async () => {
    const response = await postMail(
      req({ soort: 'drukker', drukkerId: 'maakt-niet-uit', subject: 'S', body: 'B' })
    );
    expect(response.status).toBe(401);
    expect(verstuurMailMock).not.toHaveBeenCalled();
  });

  it('stuurt een bestelbevestiging naar het eigen adres van de klant, niet naar een adres uit de body', async () => {
    const { cookie } = await maakKlantMetSessie('mailtest-klant@example.com');

    const response = await postMail(
      req(
        {
          soort: 'bestelbevestiging',
          subject: 'Bedankt voor je bestelling',
          body: 'De bestelling is ontvangen.',
          to: 'aanvaller@example.com',
        },
        cookie
      )
    );

    expect(response.status).toBe(200);
    expect(verstuurMailMock).toHaveBeenCalledWith({
      to: 'mailtest-klant@example.com',
      subject: 'Bedankt voor je bestelling',
      body: 'De bestelling is ontvangen.',
    });
  });

  it('stuurt een drukkersmail naar het bij drukkerId bekende adres, niet naar een adres uit de body', async () => {
    const cookie = await medewerkerCookie();
    const drukker = await insertRow<{ id: string }>('drukkers', {
      drukkernr: 'AT-D-MAIL-1',
      naam: 'AUTOTEST Drukkerij',
      email: 'mailtest-drukker@example.com',
    } as never);
    createdDrukkerIds.push(drukker.id);

    const response = await postMail(
      req(
        {
          soort: 'drukker',
          drukkerId: drukker.id,
          subject: 'ZD-00001 — Nieuwe orders',
          body: 'platte tekst',
          html: '<p>opgemaakt</p>',
          to: 'aanvaller@example.com',
        },
        cookie
      )
    );

    expect(response.status).toBe(200);
    expect(verstuurMailMock).toHaveBeenCalledWith({
      to: 'mailtest-drukker@example.com',
      subject: 'ZD-00001 — Nieuwe orders',
      body: 'platte tekst',
      html: '<p>opgemaakt</p>',
    });
  });

  it('geeft 400 wanneer de drukker geen e-mailadres heeft', async () => {
    const cookie = await medewerkerCookie();
    const drukker = await insertRow<{ id: string }>('drukkers', {
      drukkernr: 'AT-D-MAIL-2',
      naam: 'AUTOTEST Drukkerij zonder mail',
      email: null,
    } as never);
    createdDrukkerIds.push(drukker.id);

    const response = await postMail(
      req({ soort: 'drukker', drukkerId: drukker.id, subject: 'S', body: 'B' }, cookie)
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'geen-ontvanger' });
    expect(verstuurMailMock).not.toHaveBeenCalled();
  });

  it('geeft 400 bij een onbekende soort', async () => {
    const { cookie } = await maakKlantMetSessie('mailtest-soort@example.com');
    const response = await postMail(req({ soort: 'nieuwsbrief', subject: 'S', body: 'B' }, cookie));
    expect(response.status).toBe(400);
    expect(verstuurMailMock).not.toHaveBeenCalled();
  });

  it('geeft 400 bij een leeg onderwerp of lege body', async () => {
    const { cookie } = await maakKlantMetSessie('mailtest-leeg@example.com');
    const response = await postMail(req({ soort: 'bestelbevestiging', subject: '  ', body: 'B' }, cookie));
    expect(response.status).toBe(400);
    expect(verstuurMailMock).not.toHaveBeenCalled();
  });

  it('geeft 502 wanneer de relay de mail niet kwijt kan', async () => {
    verstuurMailMock.mockResolvedValue(false);
    const { cookie } = await maakKlantMetSessie('mailtest-relay@example.com');
    const response = await postMail(req({ soort: 'bestelbevestiging', subject: 'S', body: 'B' }, cookie));
    expect(response.status).toBe(502);
  });

  it('weigert een wijzigingsmail zonder medewerkersessie', async () => {
    const response = await postMail(req({ soort: 'bestelwijziging', bestelheaderId: 'maakt-niet-uit' }));
    expect(response.status).toBe(401);
    expect(verstuurMailMock).not.toHaveBeenCalled();
  });

  it('stuurt een wijzigingsmail naar het e-mailadres van de klant, opgebouwd uit de actuele bestelling in de database', async () => {
    const cookie = await medewerkerCookie();
    // klanten.klantnr en bestelheaders.bestelnr zijn VARCHAR(20) -- lange, leesbare AUTOTEST-
    // literals worden hier stil afgekapt door MySQL en botsen dan onderling op de unieke index
    // (zoals bestelheaders-wijzigen.test.ts ook al documenteert). Kort genoeg houden dus.
    const klant = await insertRow<{ id: string; klantnr: string }>('klanten', {
      email: 'mailtest-wijziging@example.com',
      wachtwoordHash: 'x:y',
      status: 'Goedgekeurd',
      klantnr: 'AUTOTEST-mailwijz',
    } as never);
    createdKlantIds.push(klant.id);
    const header = await insertRow<{ id: string; bestelnr: string }>('bestelheaders', {
      klantnr: klant.klantnr,
      bestelnr: 'AUTOTEST-BE-wijzig1',
      status: 'Te beoordelen',
      korting: 25,
    } as never);
    createdHeaderIds.push(header.id);
    await insertRow('bestellines', {
      bestelnr: header.bestelnr,
      code: 'AUTOTEST-mail-regel',
      maatId: null,
      materiaalId: null,
      prijs: 100,
      quantity: 2,
    } as never);

    const response = await postMail(
      req({ soort: 'bestelwijziging', bestelheaderId: header.id, to: 'aanvaller@example.com' }, cookie)
    );

    expect(response.status).toBe(200);
    expect(verstuurMailMock).toHaveBeenCalledTimes(1);
    const call = verstuurMailMock.mock.calls[0][0];
    expect(call.to).toBe('mailtest-wijziging@example.com');
    expect(call.html).toContain(header.bestelnr);
    expect(call.html).toContain('25');
  });

  it('geeft 400 wanneer de bestelling van een wijzigingsmail geen bestaande klant-e-mail heeft', async () => {
    const cookie = await medewerkerCookie();
    // bestelheaders.klantnr heeft een FK naar klanten.klantnr (fk_bestelheaders_klantnr), dus een
    // header kan niet naar een niet-bestaand klantnr wijzen -- de klant moet echt bestaan, alleen
    // zonder (geldig) e-mailadres, om de 'geen-ontvanger'-tak te raken.
    const klant = await insertRow<{ id: string; klantnr: string }>('klanten', {
      email: '',
      wachtwoordHash: 'x:y',
      status: 'Goedgekeurd',
      klantnr: 'AUTOTEST-geenmail',
    } as never);
    createdKlantIds.push(klant.id);
    const header = await insertRow<{ id: string; bestelnr: string }>('bestelheaders', {
      klantnr: klant.klantnr,
      bestelnr: 'AUTOTEST-BE-geenml1',
      status: 'Te beoordelen',
    } as never);
    createdHeaderIds.push(header.id);

    const response = await postMail(req({ soort: 'bestelwijziging', bestelheaderId: header.id }, cookie));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'geen-ontvanger' });
    expect(verstuurMailMock).not.toHaveBeenCalled();
  });
});
