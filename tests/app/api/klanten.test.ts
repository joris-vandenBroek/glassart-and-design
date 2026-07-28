import { describe, expect, it, beforeEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { hashPassword } from '@/lib/server/password';
import { GET as listKlanten } from '@/app/api/klanten/route';
import { PATCH as patchKlant, DELETE as deleteKlant } from '@/app/api/klanten/[id]/route';

beforeEach(async () => {
  await getPool().query('DELETE FROM klanten');
});

describe('klanten admin routes', () => {
  it('lists klanten', async () => {
    await insertRow('klanten', {
      email: 'a@example.com',
      wachtwoordHash: await hashPassword('x'),
      companyName: 'Acme',
      status: 'Beoordelen',
    } as never);
    const response = await listKlanten();
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].companyName).toBe('Acme');
  });

  it('approves a klant with a prijsgroep', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'b@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Beoordelen',
    } as never);
    const response = await patchKlant(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Goedgekeurd', prijsgroepId: 'pg-1' }),
      }),
      { params: { id: klant.id } }
    );
    expect(response.status).toBe(200);
    const [rows] = await getPool().query('SELECT status, prijsgroepId FROM klanten WHERE id = ?', [
      klant.id,
    ]);
    expect((rows as Array<{ status: string }>)[0].status).toBe('Goedgekeurd');
  });

  it('deletes a klant', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'c@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    const response = await deleteKlant(new Request('http://localhost/api', { method: 'DELETE' }), {
      params: { id: klant.id },
    });
    expect(response.status).toBe(200);
    const [rows] = await getPool().query('SELECT id FROM klanten WHERE id = ?', [klant.id]);
    expect((rows as unknown[]).length).toBe(0);
  });

  it('round-trips exclusieveKunstenaarIds as a real JSON array (not "[object Object]")', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'd@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    await patchKlant(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ exclusieveKunstenaarIds: ['kunstenaar-1', 'kunstenaar-2'] }),
      }),
      { params: { id: klant.id } }
    );
    const response = await listKlanten();
    const body = await response.json();
    const updated = body.find((row: { id: string }) => row.id === klant.id);
    expect(updated.exclusieveKunstenaarIds).toEqual(['kunstenaar-1', 'kunstenaar-2']);
  });
});
