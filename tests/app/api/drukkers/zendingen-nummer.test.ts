import { afterEach, describe, expect, it } from 'vitest';
import { deleteRow, insertRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { POST as reserveerNummer } from '@/app/api/drukkers/[id]/zendingen/nummer/route';

const ZENDINGNUMMER_PADDING = 5;

async function nextExpectedZendingnummer(): Promise<string> {
  const [rows] = await getPool().query("SELECT value FROM counters WHERE id = 'zendingnummer'", []);
  const current = ((rows as Array<{ value: number }>)[0]?.value ?? 0) + 1;
  return `ZD-${String(current).padStart(ZENDINGNUMMER_PADDING, '0')}`;
}

describe('drukkerZendingen nummer route', () => {
  const createdDrukkerIds: string[] = [];

  afterEach(async () => {
    while (createdDrukkerIds.length > 0) {
      await deleteRow('drukkers', createdDrukkerIds.pop()!);
    }
    await getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'staff-1'");
  });

  it('rejects reserving a nummer without a medewerker session', async () => {
    const drukker = await insertRow<{ id: string }>('drukkers', { drukkernr: 'AT-D-ZN-1', naam: 'PrintCo' } as never);
    createdDrukkerIds.push(drukker.id);
    const response = await reserveerNummer(new Request('http://localhost/api', { method: 'POST' }), {
      params: { id: drukker.id },
    });
    expect(response.status).toBe(401);
  });

  it('reserves increasing ZD-numbers on consecutive calls', async () => {
    const drukker = await insertRow<{ id: string }>('drukkers', { drukkernr: 'AT-D-ZN-2', naam: 'PrintCo' } as never);
    createdDrukkerIds.push(drukker.id);
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;

    const eerste = await nextExpectedZendingnummer();
    const response1 = await reserveerNummer(
      new Request('http://localhost/api', { method: 'POST', headers: { cookie } }),
      { params: { id: drukker.id } }
    );
    expect(response1.status).toBe(200);
    expect(await response1.json()).toEqual({ zendingnummer: eerste });

    const tweede = await nextExpectedZendingnummer();
    const response2 = await reserveerNummer(
      new Request('http://localhost/api', { method: 'POST', headers: { cookie } }),
      { params: { id: drukker.id } }
    );
    expect(await response2.json()).toEqual({ zendingnummer: tweede });
    expect(tweede).not.toBe(eerste);
  });
});
