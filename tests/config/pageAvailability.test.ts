import { describe, expect, it } from 'vitest';
import { pageAvailability } from '@/config/pageAvailability';

describe('pageAvailability', () => {
  it('keeps beheer live while the other launch-scoped routes stay under construction', () => {
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
