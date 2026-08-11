import { describe, expect, it, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { hashPassword } from '@/lib/server/password';

const createdBestelheaderIds: string[] = [];
const createdKlantEmails: string[] = [];

afterEach(async () => {
  const pool = getPool();
  if (createdBestelheaderIds.length > 0) {
    await pool.query('DELETE FROM bestelheaders WHERE id IN (?)', [createdBestelheaderIds]);
    createdBestelheaderIds.length = 0;
  }
  if (createdKlantEmails.length > 0) {
    await pool.query('DELETE FROM klanten WHERE email IN (?)', [createdKlantEmails]);
    createdKlantEmails.length = 0;
  }
});

describe('unieke bestelnr en klantnr', () => {
  it('weigert een tweede bestelheaders-rij met hetzelfde bestelnr', async () => {
    const email = `autotest-bestelnr-uniek-${randomUUID()}@example.com`;
    // bestelheaders.klantnr NOT NULL heeft sinds taak 2 een echte klantnr nodig -- de
    // 'Beoordelen'-status hierboven is voor deze test irrelevant (die test alleen de
    // unieke bestelnr, niet de goedkeuringspoort), maar de foreign key naar
    // klanten(klantnr) eist alsnog een bestaande waarde.
    await insertRow<{ id: string }>('klanten', {
      email,
      wachtwoordHash: await hashPassword('x'),
      status: 'Beoordelen',
      klantnr: 'AT-K-BNU-1',
    } as never);
    createdKlantEmails.push(email);

    const eersteId = randomUUID();
    await getPool().query('INSERT INTO bestelheaders (id, klantnr, bestelnr, status) VALUES (?, ?, ?, ?)', [
      eersteId,
      'AT-K-BNU-1',
      'AUTOTEST-UNIEK-1',
      'Te beoordelen',
    ]);
    createdBestelheaderIds.push(eersteId);

    const tweedeId = randomUUID();
    await expect(
      getPool().query('INSERT INTO bestelheaders (id, klantnr, bestelnr, status) VALUES (?, ?, ?, ?)', [
        tweedeId,
        'AT-K-BNU-1',
        'AUTOTEST-UNIEK-1',
        'Te beoordelen',
      ])
    ).rejects.toThrow(/Duplicate entry/);
  });

  it('weigert een tweede klanten-rij met hetzelfde klantnr', async () => {
    const emailA = `autotest-klantnr-uniek-a-${randomUUID()}@example.com`;
    const emailB = `autotest-klantnr-uniek-b-${randomUUID()}@example.com`;
    await insertRow<{ id: string }>('klanten', {
      email: emailA,
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
      klantnr: 'AT-K-UNIEK-1',
    } as never);
    createdKlantEmails.push(emailA);

    // Als de UNIQUE-afdwinging ooit wegvalt en deze insert wél lukt, moet de
    // opruiming hem alsnog vinden -- vandaar dat de tweede email hier al op de
    // lijst komt, vóór we weten of de insert faalt.
    createdKlantEmails.push(emailB);
    await expect(
      insertRow<{ id: string }>('klanten', {
        email: emailB,
        wachtwoordHash: await hashPassword('x'),
        status: 'Goedgekeurd',
        klantnr: 'AT-K-UNIEK-1',
      } as never)
    ).rejects.toThrow(/Duplicate entry/);
  });
});
