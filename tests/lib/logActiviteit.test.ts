import { describe, expect, it, vi, beforeEach } from 'vitest';
import { logActiviteit } from '@/lib/logActiviteit';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('logActiviteit', () => {
  // De actor zit bewust niet meer in de body: de server leidt hem af uit de
  // sessiecookie, want deze route staat open voor anonieme bezoekers en de
  // meegestuurde actor was dus vrij te verzinnen.
  it('POSTs the activity to /api/activiteitenlog, without an actor', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    await logActiviteit('bestelling_geplaatst');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/activiteitenlog',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ type: 'bestelling_geplaatst' }),
      })
    );
  });

  it('includes omschrijving in the body when provided', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    await logActiviteit('bestelling_geplaatst', 'Bestelling GD-00001');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/activiteitenlog',
      expect.objectContaining({
        body: JSON.stringify({
          type: 'bestelling_geplaatst',
          omschrijving: 'Bestelling GD-00001',
        }),
      })
    );
  });

  it('never throws when the request fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network error'));
    await expect(logActiviteit('mandje_toegevoegd')).resolves.toBeUndefined();
  });
});
