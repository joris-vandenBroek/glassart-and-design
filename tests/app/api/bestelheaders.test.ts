import { describe, expect, it, beforeEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { hashPassword } from '@/lib/server/password';
import { POST as createHeader, GET as listHeaders } from '@/app/api/bestelheaders/route';
import { PATCH as patchHeader } from '@/app/api/bestelheaders/[id]/route';
import { PATCH as patchLine } from '@/app/api/bestelheaders/[id]/bestellines/[lineId]/route';

beforeEach(async () => {
  await getPool().query('DELETE FROM bestellines');
  await getPool().query('DELETE FROM bestelheaders');
  await getPool().query('DELETE FROM klanten');
  await getPool().query('DELETE FROM kunstwerken');
  await getPool().query('DELETE FROM kunstenaars');
  await getPool().query("UPDATE counters SET value = 0 WHERE id = 'bestelnummer'");
});

describe('bestelheaders routes', () => {
  it('creates a header with lines and an incrementing bestelnr', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'k@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);

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
    expect(body.bestelnr).toBe('GD-00001');

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
    await createHeader(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ klantId: klantA.id, lines: [] }),
      })
    );
    await createHeader(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ klantId: klantB.id, lines: [] }),
      })
    );

    const all = await listHeaders(new Request('http://localhost/api/bestelheaders'));
    expect((await all.json())).toHaveLength(2);

    const onlyA = await listHeaders(
      new Request(`http://localhost/api/bestelheaders?klantId=${klantA.id}`)
    );
    expect((await onlyA.json())).toHaveLength(1);
  });

  it('updates header status and a line price', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'c@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
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
    const kunstenaar = await insertRow<{ id: string }>('kunstenaars', {
      naam: 'Exclusieve Artiest',
      verkooprecht: 'open',
      exclusiefVoorKlantId: klantB.id,
    } as never);
    const kunstwerk = await insertRow<{ id: string }>('kunstwerken', {
      naam: 'Werk',
      kunstenaarId: kunstenaar.id,
    } as never);

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
    const kunstenaar = await insertRow<{ id: string }>('kunstenaars', {
      naam: 'Alleen-zelf Artiest',
      verkooprecht: 'alleen-kunstenaar',
    } as never);
    const kunstwerk = await insertRow<{ id: string }>('kunstwerken', {
      naam: 'Werk 2',
      kunstenaarId: kunstenaar.id,
    } as never);

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
