import { describe, expect, it, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { hashPassword, verifyPassword } from '@/lib/server/password';
import { createSession, validateSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { POST as geefWachtwoordUit } from '@/app/api/klanten/[id]/wachtwoord/route';

// Alleen de rijen die deze tests zelf maken worden opgeruimd, op onthouden id --
// nooit een tabelbrede DELETE, want klanten, medewerkers en activiteitenlog
// bevatten op staging echte gegevens.
const createdKlantIds: string[] = [];
const createdMedewerkerIds: string[] = [];

afterEach(async () => {
  if (createdMedewerkerIds.length > 0) {
    await getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId IN (?)", [createdMedewerkerIds]);
    await getPool().query('DELETE FROM activiteitenlog WHERE actorId IN (?)', [createdMedewerkerIds]);
    await getPool().query('DELETE FROM medewerkers WHERE id IN (?)', [createdMedewerkerIds]);
    createdMedewerkerIds.length = 0;
  }
  if (createdKlantIds.length > 0) {
    await getPool().query("DELETE FROM sessions WHERE userType = 'klant' AND userId IN (?)", [createdKlantIds]);
    await getPool().query("DELETE FROM passwordResetTokens WHERE userType = 'klant' AND userId IN (?)", [createdKlantIds]);
    await getPool().query('DELETE FROM klanten WHERE id IN (?)', [createdKlantIds]);
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
  const klant = await insertRow<{ id: string }>('klanten', {
    email: `wachtwoord-${randomUUID()}@example.com`,
    wachtwoordHash: await hashPassword(oudWachtwoord),
    companyName: 'Testbedrijf BV',
    status: 'Goedgekeurd',
  } as never);
  createdKlantIds.push(klant.id);
  return klant;
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

  it('zet het teruggegeven wachtwoord echt en maakt het oude ongeldig', async () => {
    const klant = await maakKlant('oudwachtwoord');
    const { cookie } = await medewerkerCookie();
    const response = await geefWachtwoordUit(req(cookie), { params: { id: klant.id } });
    expect(response.status).toBe(200);
    const { wachtwoord } = (await response.json()) as { wachtwoord: string };

    const [rows] = await getPool().query('SELECT wachtwoordHash FROM klanten WHERE id = ?', [klant.id]);
    const hash = (rows as Array<{ wachtwoordHash: string }>)[0].wachtwoordHash;
    expect(await verifyPassword(wachtwoord, hash)).toBe(true);
    expect(await verifyPassword('oudwachtwoord', hash)).toBe(false);
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
});
