import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { hashPassword } from '@/lib/server/password';
import { POST as createHeader, GET as listHeaders } from '@/app/api/bestelheaders/route';
import { PATCH as patchHeader } from '@/app/api/bestelheaders/[id]/route';
import { PATCH as patchLine } from '@/app/api/bestelheaders/[id]/bestellines/[lineId]/route';

const BESTELNR_PADDING = 5;

// Tracks the exact ids/emails each test creates and removes only those afterward --
// never a table-wide DELETE, and never resets the real counters.bestelnummer sequence
// (a real customer's next order continues from wherever it was, uninterrupted by a
// test run -- resetting it to 0 would risk a real order colliding with a bestelnr
// already issued before the tests ran). "Incrementing bestelnr" tests instead read
// the counter's current value first and assert relative to that.
const createdKlantEmails: string[] = [];
const createdKunstwerkIds: string[] = [];
const createdKunstenaarIds: string[] = [];

afterEach(async () => {
  if (createdKlantEmails.length > 0) {
    await getPool().query('DELETE FROM bestelheaders WHERE klantId IN (SELECT id FROM klanten WHERE email IN (?))', [
      createdKlantEmails,
    ]);
    await getPool().query('DELETE FROM klanten WHERE email IN (?)', [createdKlantEmails]);
    createdKlantEmails.length = 0;
  }
  if (createdKunstwerkIds.length > 0) {
    await getPool().query('DELETE FROM kunstwerken WHERE id IN (?)', [createdKunstwerkIds]);
    createdKunstwerkIds.length = 0;
  }
  if (createdKunstenaarIds.length > 0) {
    await getPool().query('DELETE FROM kunstenaars WHERE id IN (?)', [createdKunstenaarIds]);
    createdKunstenaarIds.length = 0;
  }
});

async function nextExpectedBestelnr(): Promise<string> {
  const [rows] = await getPool().query("SELECT value FROM counters WHERE id = 'bestelnummer'", []);
  const current = ((rows as Array<{ value: number }>)[0]?.value ?? 0) + 1;
  return `GD-${String(current).padStart(BESTELNR_PADDING, '0')}`;
}

describe('bestelheaders routes', () => {
  it('creates a header with lines and an incrementing bestelnr', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'k@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    createdKlantEmails.push('k@example.com');
    const expectedBestelnr = await nextExpectedBestelnr();

    const response = await createHeader(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          klantId: klant.id,
          lines: [{ kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
        }),
      })
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.bestelnr).toBe(expectedBestelnr);

    const [lineRows] = await getPool().query(
      'SELECT * FROM bestellines WHERE bestelheaderId = ?',
      [body.id]
    );
    expect((lineRows as unknown[]).length).toBe(1);
  });

  it('lists all headers for admin, and filters by klantId for a customer', async () => {
    const klantA = await insertRow<{ id: string }>('klanten', {
      email: 'a@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    const klantB = await insertRow<{ id: string }>('klanten', {
      email: 'b@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    createdKlantEmails.push('a@example.com', 'b@example.com');
    const headerA = await (
      await createHeader(
        new Request('http://localhost/api', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ klantId: klantA.id, lines: [] }),
        })
      )
    ).json();
    const headerB = await (
      await createHeader(
        new Request('http://localhost/api', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ klantId: klantB.id, lines: [] }),
        })
      )
    ).json();

    const all = await listHeaders(new Request('http://localhost/api/bestelheaders'));
    const allIds = (await all.json()).map((row: { id: string }) => row.id);
    expect(allIds).toEqual(expect.arrayContaining([headerA.id, headerB.id]));

    const onlyA = await listHeaders(
      new Request(`http://localhost/api/bestelheaders?klantId=${klantA.id}`)
    );
    const onlyAIds = (await onlyA.json()).map((row: { id: string }) => row.id);
    expect(onlyAIds).toEqual([headerA.id]);
  });

  it('updates header status and a line price', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'c@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    createdKlantEmails.push('c@example.com');
    const created = await createHeader(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          klantId: klant.id,
          lines: [{ kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: null, quantity: 1 }],
        }),
      })
    );
    const header = await created.json();
    const [lineRows] = await getPool().query('SELECT id FROM bestellines WHERE bestelheaderId = ?', [
      header.id,
    ]);
    const lineId = (lineRows as Array<{ id: string }>)[0].id;

    await patchHeader(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Te versturen naar drukker' }),
      }),
      { params: { id: header.id } }
    );
    await patchLine(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prijs: 199 }),
      }),
      { params: { id: header.id, lineId } }
    );

    const [headerRows] = await getPool().query('SELECT status FROM bestelheaders WHERE id = ?', [
      header.id,
    ]);
    expect((headerRows as Array<{ status: string }>)[0].status).toBe('Te versturen naar drukker');
    const [updatedLineRows] = await getPool().query('SELECT prijs FROM bestellines WHERE id = ?', [
      lineId,
    ]);
    expect(Number((updatedLineRows as Array<{ prijs: string }>)[0].prijs)).toBe(199);
  });

  it('rejects a line with a non-positive quantity', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'e@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    createdKlantEmails.push('e@example.com');
    const response = await createHeader(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          klantId: klant.id,
          lines: [{ kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 100, quantity: 0 }],
        }),
      })
    );
    expect(response.status).toBe(400);
    const [rows] = await getPool().query('SELECT id FROM bestelheaders WHERE klantId = ?', [klant.id]);
    expect((rows as unknown[]).length).toBe(0);
  });

  it('rejects a line with a non-positive prijs', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'f@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    createdKlantEmails.push('f@example.com');
    const response = await createHeader(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          klantId: klant.id,
          lines: [{ kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: -5, quantity: 1 }],
        }),
      })
    );
    expect(response.status).toBe(400);
  });

  it('rejects ordering an artwork exclusively reserved for a different klant', async () => {
    const klantA = await insertRow<{ id: string }>('klanten', {
      email: 'g@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    const klantB = await insertRow<{ id: string }>('klanten', {
      email: 'h@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    createdKlantEmails.push('g@example.com', 'h@example.com');
    const kunstenaar = await insertRow<{ id: string }>('kunstenaars', {
      naam: 'Exclusieve Artiest',
      verkooprecht: 'open',
      exclusiefVoorKlantId: klantB.id,
    } as never);
    createdKunstenaarIds.push(kunstenaar.id);
    const kunstwerk = await insertRow<{ id: string }>('kunstwerken', {
      naam: 'Werk',
      kunstenaarId: kunstenaar.id,
    } as never);
    createdKunstwerkIds.push(kunstwerk.id);

    const response = await createHeader(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          klantId: klantA.id,
          lines: [{ kunstwerkId: kunstwerk.id, maatId: 'maat-1', materiaalId: 'mat-1', prijs: 100, quantity: 1 }],
        }),
      })
    );
    expect(response.status).toBe(403);

    const allowedForB = await createHeader(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          klantId: klantB.id,
          lines: [{ kunstwerkId: kunstwerk.id, maatId: 'maat-1', materiaalId: 'mat-1', prijs: 100, quantity: 1 }],
        }),
      })
    );
    expect(allowedForB.status).toBe(201);
  });

  it('rejects ordering an artist-only artwork from a klant who is not that artist', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'i@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    createdKlantEmails.push('i@example.com');
    const kunstenaar = await insertRow<{ id: string }>('kunstenaars', {
      naam: 'Alleen-zelf Artiest',
      verkooprecht: 'alleen-kunstenaar',
    } as never);
    createdKunstenaarIds.push(kunstenaar.id);
    const kunstwerk = await insertRow<{ id: string }>('kunstwerken', {
      naam: 'Werk 2',
      kunstenaarId: kunstenaar.id,
    } as never);
    createdKunstwerkIds.push(kunstwerk.id);

    const response = await createHeader(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          klantId: klant.id,
          lines: [{ kunstwerkId: kunstwerk.id, maatId: 'maat-1', materiaalId: 'mat-1', prijs: 100, quantity: 1 }],
        }),
      })
    );
    expect(response.status).toBe(403);
  });
});
