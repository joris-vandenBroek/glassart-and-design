import { describe, expect, it, beforeEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { POST, GET } from '@/app/api/activiteitenlog/route';

beforeEach(async () => {
  await getPool().query('DELETE FROM activiteitenlog');
});

describe('activiteitenlog route', () => {
  it('inserts an entry (with omschrijving) and lists it back, newest first', async () => {
    await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'bestelling_geplaatst',
          actorId: 'k1',
          actorEmail: 'k@x.com',
          actorNaam: 'Acme',
          omschrijving: 'Bestelling GD-00001',
        }),
      })
    );
    const response = await GET();
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].type).toBe('bestelling_geplaatst');
    expect(body[0].omschrijving).toBe('Bestelling GD-00001');
  });

  it('rejects an unknown activiteit type', async () => {
    const response = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'niet_bestaand_type', actorId: null, actorEmail: 'x', actorNaam: 'x' }),
      })
    );
    expect(response.status).toBe(400);
  });
});
