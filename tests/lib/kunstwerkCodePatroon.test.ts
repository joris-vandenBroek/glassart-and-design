import { describe, expect, it } from 'vitest';
import { voldoetAanStandaardKunstwerkCode } from '@/lib/kunstwerkCodePatroon';

describe('voldoetAanStandaardKunstwerkCode', () => {
  it('accepteert het standaardformaat: drie letters, streepje, drie letters, streepje, vier cijfers', () => {
    expect(voldoetAanStandaardKunstwerkCode('GLA-JAC-0001')).toBe(true);
    expect(voldoetAanStandaardKunstwerkCode('GLA-AFR-0007')).toBe(true);
  });

  it('accepteert na trimmen van omringende spaties', () => {
    expect(voldoetAanStandaardKunstwerkCode('  GLA-JAC-0001  ')).toBe(true);
  });

  it('weigert een bekende afwijkende code zoals "Akoestische stof"', () => {
    expect(voldoetAanStandaardKunstwerkCode('Akoestische stof')).toBe(false);
  });

  it('weigert kleine letters, ook als de vorm verder klopt', () => {
    expect(voldoetAanStandaardKunstwerkCode('gla-jac-0001')).toBe(false);
  });

  it('weigert een verkeerd aantal cijfers, ook het oude vijfcijferige formaat', () => {
    expect(voldoetAanStandaardKunstwerkCode('GLA-JAC-001')).toBe(false);
    expect(voldoetAanStandaardKunstwerkCode('GLA-JAC-00001')).toBe(false);
  });

  it('weigert een verkeerd aantal letters of een ontbrekend streepje', () => {
    expect(voldoetAanStandaardKunstwerkCode('GLAA-JAC-0001')).toBe(false);
    expect(voldoetAanStandaardKunstwerkCode('GLAJAC0001')).toBe(false);
    expect(voldoetAanStandaardKunstwerkCode('GLA-JA-0001')).toBe(false);
  });

  it('weigert een lege string', () => {
    expect(voldoetAanStandaardKunstwerkCode('')).toBe(false);
  });
});
