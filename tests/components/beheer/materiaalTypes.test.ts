import { describe, expect, it } from 'vitest';
import { isVierkanteMaat } from '@/components/beheer/materiaalTypes';
import type { Maat } from '@/components/beheer/materiaalTypes';

describe('isVierkanteMaat', () => {
  it('returns true when breedte equals hoogte', () => {
    const maat: Maat = { id: 'maat-1', breedte: 50, hoogte: 50 };
    expect(isVierkanteMaat(maat)).toBe(true);
  });

  it('returns false when breedte and hoogte differ', () => {
    expect(isVierkanteMaat({ id: 'maat-2', breedte: 50, hoogte: 70 })).toBe(false);
    expect(isVierkanteMaat({ id: 'maat-3', breedte: 70, hoogte: 50 })).toBe(false);
  });
});
