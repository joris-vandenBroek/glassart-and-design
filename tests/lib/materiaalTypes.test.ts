import { describe, expect, it } from 'vitest';
import { isMateriaalActief } from '@/components/beheer/materiaalTypes';

describe('isMateriaalActief', () => {
  it('telt een ontbrekende waarde als actief', () => {
    expect(isMateriaalActief({ actief: undefined })).toBe(true);
  });

  it('telt de 1 die mysql2 teruggeeft als actief', () => {
    expect(isMateriaalActief({ actief: 1 as unknown as boolean })).toBe(true);
  });

  it('telt de 0 die mysql2 teruggeeft als inactief', () => {
    expect(isMateriaalActief({ actief: 0 as unknown as boolean })).toBe(false);
  });

  it('telt false als inactief', () => {
    expect(isMateriaalActief({ actief: false })).toBe(false);
  });
});
