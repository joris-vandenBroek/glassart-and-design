import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { SCREENSHOT_BRONNEN, vindMogelijkVerouderdeScreenshots } from '../../scripts/check-screenshot-freshness';

const MAPPING = {
  'public/documentatie/a.png': ['src/components/A.tsx'],
  'public/documentatie/b.png': ['src/components/B.tsx', 'src/components/B2.tsx'],
};

describe('vindMogelijkVerouderdeScreenshots', () => {
  it('meldt niets als er geen bestanden gewijzigd zijn', () => {
    expect(vindMogelijkVerouderdeScreenshots([], MAPPING)).toEqual([]);
  });

  it('meldt niets als een ongerelateerd bestand wijzigde', () => {
    expect(vindMogelijkVerouderdeScreenshots(['src/components/Onbekend.tsx'], MAPPING)).toEqual([]);
  });

  it('meldt niets als de bron wijzigde maar de screenshot ook meeging', () => {
    const gewijzigd = ['src/components/A.tsx', 'public/documentatie/a.png'];
    expect(vindMogelijkVerouderdeScreenshots(gewijzigd, MAPPING)).toEqual([]);
  });

  it('meldt de screenshot als de bron wijzigde zonder de screenshot', () => {
    const gewijzigd = ['src/components/A.tsx'];
    expect(vindMogelijkVerouderdeScreenshots(gewijzigd, MAPPING)).toEqual([
      { screenshot: 'public/documentatie/a.png', bronnen: ['src/components/A.tsx'] },
    ]);
  });

  it('rapporteert alleen de daadwerkelijk gewijzigde bron wanneer een screenshot er meerdere heeft', () => {
    const gewijzigd = ['src/components/B2.tsx'];
    expect(vindMogelijkVerouderdeScreenshots(gewijzigd, MAPPING)).toEqual([
      { screenshot: 'public/documentatie/b.png', bronnen: ['src/components/B2.tsx'] },
    ]);
  });

  it('rapporteert meerdere verouderde screenshots tegelijk', () => {
    const gewijzigd = ['src/components/A.tsx', 'src/components/B.tsx'];
    expect(vindMogelijkVerouderdeScreenshots(gewijzigd, MAPPING)).toEqual([
      { screenshot: 'public/documentatie/a.png', bronnen: ['src/components/A.tsx'] },
      { screenshot: 'public/documentatie/b.png', bronnen: ['src/components/B.tsx'] },
    ]);
  });

  it('gebruikt SCREENSHOT_BRONNEN als er geen mapping wordt meegegeven', () => {
    const gewijzigd = ['src/components/beheer/KlantModal.tsx'];
    const resultaat = vindMogelijkVerouderdeScreenshots(gewijzigd);
    expect(resultaat).toEqual([
      { screenshot: 'public/documentatie/klant-registratie.png', bronnen: ['src/components/beheer/KlantModal.tsx'] },
    ]);
  });
});

describe('SCREENSHOT_BRONNEN', () => {
  const VERWACHTE_SCREENSHOTS = [
    'public/documentatie/klant-registratie.png',
    'public/documentatie/bestelproces.png',
    'public/documentatie/kunstwerken.png',
    'public/documentatie/kunstwerken-code-voor.png',
    'public/documentatie/kunstwerken-code-na.png',
    'public/documentatie/kunstenaars.png',
    'public/documentatie/drukkers.png',
    'public/documentatie/glassart-design.png',
    'public/documentatie/instellingen.png',
    'public/documentatie/prijsmatrix.png',
    'public/documentatie/stamgegevens.png',
    'public/documentatie/klant-website.png',
  ];

  it('bevat precies de 12 screenshots die op dit moment in de handleiding gebruikt worden', () => {
    expect(Object.keys(SCREENSHOT_BRONNEN).sort()).toEqual([...VERWACHTE_SCREENSHOTS].sort());
  });

  it('elk gemapt screenshot- en bronbestand bestaat ook echt in de repo', () => {
    for (const [screenshot, bronnen] of Object.entries(SCREENSHOT_BRONNEN)) {
      expect(existsSync(path.join(process.cwd(), screenshot))).toBe(true);
      for (const bron of bronnen) {
        expect(existsSync(path.join(process.cwd(), bron))).toBe(true);
      }
    }
  });
});
