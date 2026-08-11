import { describe, expect, it, afterEach, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { hashPassword, verifyPassword } from '@/lib/server/password';
import { createSession, validateSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { POST as geefWachtwoordUit } from '@/app/api/klanten/[id]/wachtwoord/route';
import { POST as login } from '@/app/api/auth/login/route';
import { sendWachtwoordUitgegevenMail } from '@/lib/server/sendWachtwoordUitgegevenMail';
import { veiligOpruimen } from '../../../helpers/veiligOpruimen';

/**
 * Schakelaar om de logregel -- de laatste van de vier mutaties -- te laten
 * struikelen. Alleen zo is te testen dat een fout halverwege de handeling niet
 * een klant achterlaat met een nieuwe hash waarvan niemand het wachtwoord kent.
 */
const logregelFaalt = vi.hoisted(() => ({ actief: false }));

// De suite mag nooit echt mail versturen, net zoals reset-password.test.ts de
// resetmail afvangt. `verstuurd` schakelt de uitkomst zodat ook het pad met een
// haperende mailrelay te testen is.
const mailLukt = vi.hoisted(() => ({ waarde: true }));

vi.mock('@/lib/server/sendWachtwoordUitgegevenMail', () => ({
  sendWachtwoordUitgegevenMail: vi.fn(async () => mailLukt.waarde),
}));

vi.mock('@/lib/server/activiteitActor', async (importOriginal) => {
  const origineel = await importOriginal<typeof import('@/lib/server/activiteitActor')>();
  return {
    ...origineel,
    schrijfActiviteit: async (...args: Parameters<typeof origineel.schrijfActiviteit>) => {
      if (logregelFaalt.actief) throw new Error('logregel mislukt');
      return origineel.schrijfActiviteit(...args);
    },
  };
});

// Alleen de rijen die deze tests zelf maken worden opgeruimd, op onthouden id --
// nooit een tabelbrede DELETE, want klanten, medewerkers en activiteitenlog
// bevatten op staging echte gegevens.
const createdKlantIds: string[] = [];
const createdMedewerkerIds: string[] = [];

afterEach(async () => {
  logregelFaalt.actief = false;
  mailLukt.waarde = true;
  vi.mocked(sendWachtwoordUitgegevenMail).mockClear();
  if (createdMedewerkerIds.length > 0) {
    await veiligOpruimen('sessions (medewerkers)', () =>
      getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId IN (?)", [createdMedewerkerIds])
    );
    await veiligOpruimen('activiteitenlog (medewerkers)', () =>
      getPool().query('DELETE FROM activiteitenlog WHERE actorId IN (?)', [createdMedewerkerIds])
    );
    await veiligOpruimen('medewerkers', () =>
      getPool().query('DELETE FROM medewerkers WHERE id IN (?)', [createdMedewerkerIds])
    );
    createdMedewerkerIds.length = 0;
  }
  if (createdKlantIds.length > 0) {
    await veiligOpruimen('sessions (klanten)', () =>
      getPool().query("DELETE FROM sessions WHERE userType = 'klant' AND userId IN (?)", [createdKlantIds])
    );
    await veiligOpruimen('passwordResetTokens (klanten)', () =>
      getPool().query("DELETE FROM passwordResetTokens WHERE userType = 'klant' AND userId IN (?)", [createdKlantIds])
    );
    await veiligOpruimen('klanten', () =>
      getPool().query('DELETE FROM klanten WHERE id IN (?)', [createdKlantIds])
    );
    createdKlantIds.length = 0;
  }
});

/**
 * Maakt een échte medewerkersrij en logt die in. Een verzonnen userId zonder
 * bijbehorende rij zou hier niet werken: `actorUitSessie()` valt dan terug op
 * ONBEKENDE_ACTOR met `actorId: null`, en juist de logtest hieronder controleert
 * dat de handeling op naam van de medewerker staat.
 */
async function medewerkerCookie(): Promise<{ cookie: string; id: string }> {
  const medewerker = await insertRow<{ id: string }>('medewerkers', {
    email: `staff-${randomUUID()}@example.com`,
    wachtwoordHash: await hashPassword('geheim123'),
    naam: 'Testmedewerker',
  } as never);
  createdMedewerkerIds.push(medewerker.id);
  const sessionId = await createSession('medewerker', medewerker.id);
  return { cookie: `${SESSION_COOKIE_NAME}=${sessionId}`, id: medewerker.id };
}

function req(cookie?: string) {
  return new Request('http://localhost/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  });
}

async function maakKlant(oudWachtwoord: string) {
  const email = `wachtwoord-${randomUUID()}@example.com`;
  const klant = await insertRow<{ id: string }>('klanten', {
    email,
    wachtwoordHash: await hashPassword(oudWachtwoord),
    companyName: 'Testbedrijf BV',
    status: 'Goedgekeurd',
  } as never);
  createdKlantIds.push(klant.id);
  return { ...klant, email };
}

/** Probeert écht in te loggen; 200 betekent dat dit wachtwoord werkt. */
async function inlogStatus(email: string, wachtwoord: string): Promise<number> {
  const response = await login(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: wachtwoord }),
    })
  );
  return response.status;
}

describe('POST /api/klanten/[id]/wachtwoord', () => {
  it('weigert een verzoek zonder medewerkerssessie', async () => {
    const klant = await maakKlant('oudwachtwoord');
    const response = await geefWachtwoordUit(req(), { params: { id: klant.id } });
    expect(response.status).toBe(401);

    const [rows] = await getPool().query('SELECT wachtwoordHash FROM klanten WHERE id = ?', [klant.id]);
    expect(
      await verifyPassword('oudwachtwoord', (rows as Array<{ wachtwoordHash: string }>)[0].wachtwoordHash)
    ).toBe(true);
  });

  it('geeft 404 voor een onbekende klant', async () => {
    const { cookie } = await medewerkerCookie();
    const response = await geefWachtwoordUit(req(cookie), { params: { id: randomUUID() } });
    expect(response.status).toBe(404);
  });

  // Bewust via de échte inlogroute en niet alleen tegen de hash: dat is wat de klant
  // aan de telefoon zo meteen doet, en het dekt ook de weg ernaartoe mee.
  it('zet het teruggegeven wachtwoord echt en maakt het oude ongeldig', async () => {
    const klant = await maakKlant('oudwachtwoord');
    const { cookie } = await medewerkerCookie();
    expect(await inlogStatus(klant.email, 'oudwachtwoord')).toBe(200);

    const response = await geefWachtwoordUit(req(cookie), { params: { id: klant.id } });
    expect(response.status).toBe(200);
    const { wachtwoord } = (await response.json()) as { wachtwoord: string };

    expect(await inlogStatus(klant.email, 'oudwachtwoord')).toBe(401);
    expect(await inlogStatus(klant.email, wachtwoord)).toBe(200);

    // De hash blijft ook los de moeite waard: hij bewijst dat het wachtwoord niet
    // ergens in plaintext is beland, maar echt gehasht is opgeslagen.
    const [rows] = await getPool().query('SELECT wachtwoordHash FROM klanten WHERE id = ?', [klant.id]);
    const hash = (rows as Array<{ wachtwoordHash: string }>)[0].wachtwoordHash;
    expect(hash).not.toContain(wachtwoord);
    expect(await verifyPassword(wachtwoord, hash)).toBe(true);
  });

  /**
   * Zonder transactie stond de nieuwe hash er al zodra stap 1 klaar was. Een fout
   * in een latere stap gaf de beheerder dan een 500 -- terwijl het bijbehorende
   * wachtwoord alleen nog in die afgebroken request bestond. De klant kwam er met
   * geen van beide wachtwoorden meer in.
   */
  it('laat het oude wachtwoord staan als een latere stap misgaat', async () => {
    const klant = await maakKlant('oudwachtwoord');
    const sessieId = await createSession('klant', klant.id);
    const { cookie, id: medewerkerId } = await medewerkerCookie();
    logregelFaalt.actief = true;
    // withApiErrorHandling logt de fout die we hier expres veroorzaken; die hoort
    // niet als ruis in een geslaagde testrun te staan.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await geefWachtwoordUit(req(cookie), { params: { id: klant.id } });
    expect(response.status).toBe(500);
    consoleError.mockRestore();

    expect(await inlogStatus(klant.email, 'oudwachtwoord')).toBe(200);
    expect(await validateSession(sessieId)).not.toBeNull();
    const [rows] = await getPool().query(
      "SELECT id FROM activiteitenlog WHERE type = 'klant_wachtwoord_uitgegeven' AND actorId = ?",
      [medewerkerId]
    );
    expect((rows as unknown[]).length).toBe(0);
  });

  // Wie nog ergens ingelogd stond met het oude wachtwoord, hoort eruit te liggen.
  it('gooit bestaande sessies van de klant weg', async () => {
    const klant = await maakKlant('oudwachtwoord');
    const sessieId = await createSession('klant', klant.id);
    const { cookie } = await medewerkerCookie();

    await geefWachtwoordUit(req(cookie), { params: { id: klant.id } });

    expect(await validateSession(sessieId)).toBeNull();
  });

  // Een eerder gemailde resetlink zou anders 24 uur geldig blijven naast het
  // zojuist uitgegeven wachtwoord.
  it('verwijdert openstaande resettokens van de klant', async () => {
    const klant = await maakKlant('oudwachtwoord');
    await getPool().query(
      'INSERT INTO passwordResetTokens (token, userType, userId, expiresAt) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 DAY))',
      [randomUUID(), 'klant', klant.id]
    );
    const { cookie } = await medewerkerCookie();

    await geefWachtwoordUit(req(cookie), { params: { id: klant.id } });

    const [rows] = await getPool().query('SELECT token FROM passwordResetTokens WHERE userId = ?', [klant.id]);
    expect((rows as unknown[]).length).toBe(0);
  });

  it('logt de handeling op naam van de medewerker, zonder het wachtwoord', async () => {
    const klant = await maakKlant('oudwachtwoord');
    const { cookie, id: medewerkerId } = await medewerkerCookie();
    const response = await geefWachtwoordUit(req(cookie), { params: { id: klant.id } });
    const { wachtwoord } = (await response.json()) as { wachtwoord: string };

    const [rows] = await getPool().query(
      "SELECT type, actorNaam, omschrijving FROM activiteitenlog WHERE type = 'klant_wachtwoord_uitgegeven' AND actorId = ?",
      [medewerkerId]
    );
    const regels = rows as Array<{ type: string; actorNaam: string; omschrijving: string }>;
    expect(regels.length).toBe(1);
    expect(regels[0].actorNaam).toBe('Testmedewerker');
    expect(regels[0].omschrijving).toContain('Testbedrijf BV');
    expect(regels[0].omschrijving).not.toContain(wachtwoord);
  });

  // De melding bereikt de mailbox van de rechtmatige eigenaar, ook wanneer de
  // beller die niet kan lezen -- dat is precies het geval dat ertoe doet.
  describe('melding aan de klant', () => {
    it('mailt naar het adres uit de klantrij, niet naar iets uit de request', async () => {
      const klant = await maakKlant('oudwachtwoord');
      const { cookie } = await medewerkerCookie();

      const response = await geefWachtwoordUit(req(cookie), { params: { id: klant.id } });

      expect(await response.json()).toMatchObject({ mail: 'verstuurd' });
      expect(vi.mocked(sendWachtwoordUitgegevenMail)).toHaveBeenCalledWith(klant.email);
    });

    // De beheerder heeft de klant aan de lijn en heeft het wachtwoord nodig; een
    // haperende mailrelay mag dat niet alsnog omverhalen.
    it('geeft het wachtwoord gewoon uit wanneer de mail mislukt', async () => {
      mailLukt.waarde = false;
      const klant = await maakKlant('oudwachtwoord');
      const { cookie } = await medewerkerCookie();

      const response = await geefWachtwoordUit(req(cookie), { params: { id: klant.id } });
      expect(response.status).toBe(200);
      const { wachtwoord, mail } = (await response.json()) as { wachtwoord: string; mail: string };

      expect(mail).toBe('mislukt');
      expect(await inlogStatus(klant.email, wachtwoord)).toBe(200);
    });

    // Het wachtwoord is telefonisch doorgegeven; het hoort niet alsnog in de
    // mailbox te belanden die de klant naar eigen zeggen niet kan bereiken.
    it('stuurt het wachtwoord niet mee in de mail', async () => {
      const klant = await maakKlant('oudwachtwoord');
      const { cookie } = await medewerkerCookie();

      const response = await geefWachtwoordUit(req(cookie), { params: { id: klant.id } });
      const { wachtwoord } = (await response.json()) as { wachtwoord: string };

      const argumenten = JSON.stringify(vi.mocked(sendWachtwoordUitgegevenMail).mock.calls);
      expect(argumenten).not.toContain(wachtwoord);
    });
  });
});
