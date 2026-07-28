import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  logActiviteit,
  actorFromCustomer,
  actorFromMedewerker,
  ONBEKENDE_ACTOR,
} from '@/lib/logActiviteit';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('logActiviteit', () => {
  it('POSTs the activity to /api/activiteitenlog', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    await logActiviteit('bestelling_geplaatst', { id: 'k1', email: 'k@x.com', naam: 'Acme' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/activiteitenlog',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          type: 'bestelling_geplaatst',
          actorId: 'k1',
          actorEmail: 'k@x.com',
          actorNaam: 'Acme',
        }),
      })
    );
  });

  it('includes omschrijving in the body when provided', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    await logActiviteit(
      'bestelling_geplaatst',
      { id: 'k1', email: 'k@x.com', naam: 'Acme' },
      'Bestelling GD-00001'
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/activiteitenlog',
      expect.objectContaining({
        body: JSON.stringify({
          type: 'bestelling_geplaatst',
          actorId: 'k1',
          actorEmail: 'k@x.com',
          actorNaam: 'Acme',
          omschrijving: 'Bestelling GD-00001',
        }),
      })
    );
  });

  it('never throws when the request fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network error'));
    await expect(logActiviteit('mandje_toegevoegd', ONBEKENDE_ACTOR)).resolves.toBeUndefined();
  });
});

describe('actorFromCustomer', () => {
  it('returns ONBEKENDE_ACTOR for a null user', () => {
    expect(actorFromCustomer(null)).toEqual(ONBEKENDE_ACTOR);
  });

  it('uses companyName as naam when present', () => {
    expect(
      actorFromCustomer({
        uid: 'uid-1',
        email: 'klant@example.com',
        companyName: 'Testbedrijf BV',
        contactPerson: 'Jan Jansen',
      })
    ).toEqual({ id: 'uid-1', email: 'klant@example.com', naam: 'Testbedrijf BV' });
  });

  it('falls back to contactPerson when companyName is missing', () => {
    expect(
      actorFromCustomer({
        uid: 'uid-1',
        email: 'klant@example.com',
        companyName: null,
        contactPerson: 'Jan Jansen',
      })
    ).toEqual({ id: 'uid-1', email: 'klant@example.com', naam: 'Jan Jansen' });
  });

  it('falls back to "Onbekend" for naam/email when both are missing', () => {
    expect(
      actorFromCustomer({ uid: 'uid-1', email: null, companyName: null, contactPerson: null })
    ).toEqual({ id: 'uid-1', email: 'Onbekend', naam: 'Onbekend' });
  });
});

describe('actorFromMedewerker', () => {
  it('returns ONBEKENDE_ACTOR for a null user', () => {
    expect(actorFromMedewerker(null)).toEqual(ONBEKENDE_ACTOR);
  });

  it('uses the email as both email and naam', () => {
    expect(actorFromMedewerker({ uid: 'uid-2', email: 'paul@glassartanddesign.com' })).toEqual({
      id: 'uid-2',
      email: 'paul@glassartanddesign.com',
      naam: 'paul@glassartanddesign.com',
    });
  });
});
