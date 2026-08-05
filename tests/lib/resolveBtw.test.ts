import { describe, expect, it } from 'vitest';
import { resolveBtwPercentage } from '@/lib/resolveBtw';
import type { BtwTarief } from '@/components/beheer/btwTarievenTypes';

const TARIEVEN: BtwTarief[] = [
  { land: 'NL', percentage: 21 },
  { land: 'BE', percentage: 6 },
];

describe('resolveBtwPercentage', () => {
  it('returns the matching percentage for a land in the list', () => {
    expect(resolveBtwPercentage(TARIEVEN, 'NL')).toBe(21);
    expect(resolveBtwPercentage(TARIEVEN, 'BE')).toBe(6);
  });

  it('returns null when the land has no matching tarief', () => {
    expect(resolveBtwPercentage(TARIEVEN, 'DE')).toBeNull();
  });

  it('returns null when land is null', () => {
    expect(resolveBtwPercentage(TARIEVEN, null)).toBeNull();
  });

  it('returns null for an empty tarieven list', () => {
    expect(resolveBtwPercentage([], 'NL')).toBeNull();
  });
});
