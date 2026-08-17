import { describe, expect, it } from 'vitest';
import { vindBekendePrefixen, stelVolgendeCodeVoor } from '@/lib/kunstwerkCodeVoorstel';

const KUNSTWERKEN = [
  { code: 'GLA-AFR-0007' },
  { code: 'GLA-AFR-0003' },
  { code: 'GLA-JAC-0012' },
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
    expect(stelVolgendeCodeVoor(KUNSTWERKEN, 'GLA-AFR')).toBe('GLA-AFR-0008');
  });

  it('vergelijkt het prefix hoofdletterongevoelig maar gebruikt de getypte schrijfwijze in het resultaat', () => {
    expect(stelVolgendeCodeVoor(KUNSTWERKEN, 'gla-afr')).toBe('gla-afr-0008');
  });

  it('gebruikt altijd vier cijfers, ongeacht de breedte van bestaande codes', () => {
    const kunstwerken = [{ code: 'GLA-AFR-007' }, { code: 'GLA-AFR-00042' }];
    expect(stelVolgendeCodeVoor(kunstwerken, 'GLA-AFR')).toBe('GLA-AFR-0043');
  });

  it('laat de breedte vanzelf meegroeien bij een overloop voorbij 9999', () => {
    expect(stelVolgendeCodeVoor([{ code: 'GLA-AFR-9999' }], 'GLA-AFR')).toBe('GLA-AFR-10000');
  });

  it('negeert codes zonder streepje en met een niet-numerieke staart bij het tellen', () => {
    expect(stelVolgendeCodeVoor(KUNSTWERKEN, 'Dan')).toBe('Dan-2425');
  });

  it('start op 0001 voor een gloednieuw prefix', () => {
    expect(stelVolgendeCodeVoor(KUNSTWERKEN, 'GLA-NIEUW')).toBe('GLA-NIEUW-0001');
    expect(stelVolgendeCodeVoor([], 'Iets')).toBe('Iets-0001');
  });

  it('trimt het opgegeven prefix', () => {
    expect(stelVolgendeCodeVoor(KUNSTWERKEN, '  GLA-AFR  ')).toBe('GLA-AFR-0008');
  });

  it('haalt een meegetypt volgnummer van het prefix af', () => {
    // Zo ontstonden de codes GLA-ABS-0028-00001 en GLA-ANI-015-00001 in de echte data:
    // iemand zette een hele code in het prefix-veld.
    expect(stelVolgendeCodeVoor(KUNSTWERKEN, 'GLA-AFR-0007')).toBe('GLA-AFR-0008');
    expect(stelVolgendeCodeVoor(KUNSTWERKEN, 'GLA-NIEUW-0031')).toBe('GLA-NIEUW-0001');
  });
});
