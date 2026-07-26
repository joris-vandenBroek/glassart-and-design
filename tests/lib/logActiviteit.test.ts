import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  logActiviteit,
  actorFromCustomer,
  actorFromMedewerker,
  ONBEKENDE_ACTOR,
} from '@/lib/logActiviteit';

const addDocMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ name })),
  addDoc: (...args: unknown[]) => addDocMock(...args),
  serverTimestamp: () => 'SERVER_TIMESTAMP',
}));

beforeEach(() => {
  addDocMock.mockReset();
});

describe('logActiviteit', () => {
  it('writes a document with type, actor fields and a server timestamp', async () => {
    addDocMock.mockResolvedValue({ id: 'log-1' });
    await logActiviteit('kunstwerk_bekeken', {
      id: 'uid-1',
      email: 'klant@example.com',
      naam: 'Testbedrijf BV',
    });
    expect(addDocMock).toHaveBeenCalledWith(
      { name: 'activiteitenlog' },
      {
        type: 'kunstwerk_bekeken',
        actorId: 'uid-1',
        actorEmail: 'klant@example.com',
        actorNaam: 'Testbedrijf BV',
        timestamp: 'SERVER_TIMESTAMP',
      }
    );
  });

  it('never throws when the write fails', async () => {
    addDocMock.mockRejectedValue(new Error('permission-denied'));
    await expect(logActiviteit('mandje_toegevoegd', ONBEKENDE_ACTOR)).resolves.toBeUndefined();
  });

  it('includes the omschrijving field when provided', async () => {
    addDocMock.mockResolvedValue({ id: 'log-2' });
    await logActiviteit(
      'materiaalsoort_verwijderd',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'Helder glas'
    );
    expect(addDocMock).toHaveBeenCalledWith(
      { name: 'activiteitenlog' },
      {
        type: 'materiaalsoort_verwijderd',
        actorId: 'staff-1',
        actorEmail: 'paul@glassartanddesign.com',
        actorNaam: 'paul@glassartanddesign.com',
        timestamp: 'SERVER_TIMESTAMP',
        omschrijving: 'Helder glas',
      }
    );
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
