import { describe, expect, it, beforeEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { GET, PATCH } from '@/app/api/instellingen/[id]/route';

beforeEach(async () => {
  await getPool().query('DELETE FROM instellingen');
});

describe('instellingen route', () => {
  it('returns 404 when no row exists yet', async () => {
    const response = await GET(new Request('http://localhost/api'), {
      params: { id: 'bedrijfsgegevens' },
    });
    expect(response.status).toBe(404);
  });

  it('saves and reads back the data blob via PATCH/GET', async () => {
    const patchResponse = await PATCH(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bezoekadres: 'Den Heuvel 21, 5688 EM Oirschot' }),
      }),
      { params: { id: 'bedrijfsgegevens' } }
    );
    expect(patchResponse.status).toBe(200);

    const getResponse = await GET(new Request('http://localhost/api'), {
      params: { id: 'bedrijfsgegevens' },
    });
    const body = await getResponse.json();
    expect(body.bezoekadres).toBe('Den Heuvel 21, 5688 EM Oirschot');
  });
});
