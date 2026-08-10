import { describe, expect, it } from 'vitest';
import { vindBekendePrefixen, stelVolgendeCodeVoor } from '@/lib/kunstwerkCodeVoorstel';

const KUNSTWERKEN = [
  { code: 'GLA-AFR-00007' },
  { code: 'GLA-AFR-00003' },
  { code: 'GLA-JAC-00012' },
  { code: 'Dan-02424' },
  { code: 'Akoestische stof' }, // geen streepje
  { code: 'GLA-AFR-oud' }, // niet-numerieke staart
];

describe('vindBekendePrefixen', () => {
  it('herkent prefixen van codes met een numerieke staart', () => {
    expect(vindBekendePrefixen(KUNSTWERKEN)).toEqual(['Dan', 'GLA-AFR', 'GLA-JAC']);
  });

  it('negeert codes zonder streepje en met een niet-numerieke staart', () => {
    const prefixen = vindBekendePrefixen(KUNSTWERKEN);
    expect(prefixen).not.toContain('Akoestische stof');
    expect(prefixen).not.toContain('GLA-AFR-oud');
  });

  it('telt hoofdletterongevoelige duplicaten als één prefix, met de eerst aangetroffen schrijfwijze', () => {
    const prefixen = vindBekendePrefixen([{ code: 'gla-afr-00001' }, { code: 'GLA-AFR-00002' }]);
    expect(prefixen).toEqual(['gla-afr']);
  });

  it('geeft een lege lijst voor een lege of niet-herkende invoer', () => {
    expect(vindBekendePrefixen([])).toEqual([]);
    expect(vindBekendePrefixen([{ code: 'Akoestische stof' }])).toEqual([]);
  });
});

describe('stelVolgendeCodeVoor', () => {
  it('telt het hoogste bestaande nummer bij dat prefix op met 1', () => {
    expect(stelVolgendeCodeVoor(KUNSTWERKEN, 'GLA-AFR')).toBe('GLA-AFR-00008');
  });

  it('vergelijkt het prefix hoofdletterongevoelig maar gebruikt de getypte schrijfwijze in het resultaat', () => {
    expect(stelVolgendeCodeVoor(KUNSTWERKEN, 'gla-afr')).toBe('gla-afr-00008');
  });

  it('volgt de breedte van het breedste bestaande nummer bij dat prefix', () => {
    const kunstwerken = [{ code: 'GLA-AFR-007' }, { code: 'GLA-AFR-0042' }];
    // hoogste getal is 42, breedste bestaande breedte is 4 -> "43" opgevuld tot 4 cijfers
    expect(stelVolgendeCodeVoor(kunstwerken, 'GLA-AFR')).toBe('GLA-AFR-0043');
  });

  it('laat de breedte vanzelf meegroeien bij een overloop', () => {
    expect(stelVolgendeCodeVoor([{ code: 'GLA-AFR-999' }], 'GLA-AFR')).toBe('GLA-AFR-1000');
  });

  it('negeert codes zonder streepje en met een niet-numerieke staart bij het tellen', () => {
    expect(stelVolgendeCodeVoor(KUNSTWERKEN, 'Dan')).toBe('Dan-02425');
  });

  it('start op 00001 met 5 cijfers voor een gloednieuw prefix', () => {
    expect(stelVolgendeCodeVoor(KUNSTWERKEN, 'GLA-NIEUW')).toBe('GLA-NIEUW-00001');
    expect(stelVolgendeCodeVoor([], 'Iets')).toBe('Iets-00001');
  });

  it('trimt het opgegeven prefix', () => {
    expect(stelVolgendeCodeVoor(KUNSTWERKEN, '  GLA-AFR  ')).toBe('GLA-AFR-00008');
  });
});
