import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { insertRow } from '@/lib/server/crud';

const verstuurMailMock = vi.fn();
vi.mock('@/lib/server/mailRelay', () => ({
  verstuurMail: (...args: unknown[]) => verstuurMailMock(...args),
}));

const { POST: postMail } = await import('@/app/api/mail/route');

const createdKlantIds: string[] = [];
const createdDrukkerIds: string[] = [];

beforeEach(() => {
  verstuurMailMock.mockReset();
  verstuurMailMock.mockResolvedValue(true);
});

afterEach(async () => {
  await getPool().query(
    "DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'mail-staff-1'"
  );
  if (createdKlantIds.length > 0) {
    await getPool().query('DELETE FROM sessions WHERE userType = ? AND userId IN (?)', [
      'klant',
      createdKlantIds,
    ]);
    await getPool().query('DELETE FROM klanten WHERE id IN (?)', [createdKlantIds]);
    createdKlantIds.length = 0;
  }
  if (createdDrukkerIds.length > 0) {
    await getPool().query('DELETE FROM drukkers WHERE id IN (?)', [createdDrukkerIds]);
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
});
