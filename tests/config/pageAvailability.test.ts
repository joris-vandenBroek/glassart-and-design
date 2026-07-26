import { describe, expect, it } from 'vitest';
import { pageAvailability } from '@/config/pageAvailability';

describe('pageAvailability', () => {
  it('has every gated route turned off for the initial under-construction launch', () => {
    expect(pageAvailability).toEqual({
      collecties: false,
      wordKlant: false,
      inloggen: false,
      beheer: false,
      account: false,
      contact: false,
    });
  });
});
