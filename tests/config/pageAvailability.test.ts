import { describe, expect, it, vi, afterEach } from 'vitest';

describe('pageAvailability', () => {
  const originalEnv = process.env.MIJNHOST_BUILD;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.MIJNHOST_BUILD;
    } else {
      process.env.MIJNHOST_BUILD = originalEnv;
    }
  });

  it('keeps everything available (incl. beheer) when MIJNHOST_BUILD is not set', async () => {
    delete process.env.MIJNHOST_BUILD;
    vi.resetModules();
    const { pageAvailability } = await import('@/config/pageAvailability');
    expect(pageAvailability).toEqual({
      collecties: true,
      wordKlant: true,
      inloggen: true,
      beheer: true,
      account: true,
      contact: true,
    });
  });

  it('gates every launch-scoped route except beheer when MIJNHOST_BUILD=true', async () => {
    process.env.MIJNHOST_BUILD = 'true';
    vi.resetModules();
    const { pageAvailability } = await import('@/config/pageAvailability');
    expect(pageAvailability).toEqual({
      collecties: false,
      wordKlant: false,
      inloggen: false,
      beheer: true,
      account: false,
      contact: false,
    });
  });
});
