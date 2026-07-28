import { describe, expect, it, beforeEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { GET, PATCH } from '@/app/api/instellingen/[id]/route';

// A fixture-only id, never 'bedrijfsgegevens'/'bestelinstellingen' -- the real ids used
// by the deployed app. Scoping cleanup to this one row (instead of the previous blanket
// `DELETE FROM instellingen`) keeps this test from ever touching real staging data that
// a beheer-user or the migration script has put there.
const TEST_ID = 'test-instellingen-fixture';

beforeEach(async () => {
  await getPool().query('DELETE FROM instellingen WHERE id = ?', [TEST_ID]);
});

describe('instellingen route', () => {
  it('returns 404 when no row exists yet', async () => {
    const response = await GET(new Request('http://localhost/api'), {
      params: { id: TEST_ID },
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
      { params: { id: TEST_ID } }
    );
    expect(patchResponse.status).toBe(200);

    const getResponse = await GET(new Request('http://localhost/api'), {
      params: { id: TEST_ID },
    });
    const body = await getResponse.json();
    expect(body.bezoekadres).toBe('Den Heuvel 21, 5688 EM Oirschot');
  });
});
