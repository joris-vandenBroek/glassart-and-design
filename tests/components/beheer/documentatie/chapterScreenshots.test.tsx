import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { existsSync } from 'fs';
import path from 'path';
import { KlantWebsiteChapter } from '@/components/beheer/documentatie/chapters/KlantWebsiteChapter';
import { KlantRegistratieChapter } from '@/components/beheer/documentatie/chapters/KlantRegistratieChapter';
import { BestelprocesChapter } from '@/components/beheer/documentatie/chapters/BestelprocesChapter';
import { KunstwerkenChapter } from '@/components/beheer/documentatie/chapters/KunstwerkenChapter';
import { KunstenaarsChapter } from '@/components/beheer/documentatie/chapters/KunstenaarsChapter';
import { PrijsmatrixChapter } from '@/components/beheer/documentatie/chapters/PrijsmatrixChapter';
import { StamgegevensChapter } from '@/components/beheer/documentatie/chapters/StamgegevensChapter';
import { DrukkersChapter } from '@/components/beheer/documentatie/chapters/DrukkersChapter';
import { GlassartDesignChapter } from '@/components/beheer/documentatie/chapters/GlassartDesignChapter';
import { InstellingenChapter } from '@/components/beheer/documentatie/chapters/InstellingenChapter';

function expectImageOnDisk(container: HTMLElement, expectedSrc: string) {
  const img = container.querySelector(`img[src="${expectedSrc}"]`);
  expect(img).not.toBeNull();
  expect(img).toHaveAttribute('alt');
  expect(img?.getAttribute('alt')).not.toBe('');
  expect(existsSync(path.join(process.cwd(), 'public', expectedSrc.replace(/^\//, '')))).toBe(true);
}

describe('hoofdstuk-screenshots', () => {
  it.each([
    ['KlantWebsiteChapter', KlantWebsiteChapter, '/documentatie/klant-website.png'],
    ['KlantRegistratieChapter', KlantRegistratieChapter, '/documentatie/klant-registratie.png'],
    ['BestelprocesChapter', BestelprocesChapter, '/documentatie/bestelproces.png'],
    ['KunstwerkenChapter', KunstwerkenChapter, '/documentatie/kunstwerken.png'],
    ['KunstenaarsChapter', KunstenaarsChapter, '/documentatie/kunstenaars.png'],
    ['PrijsmatrixChapter', PrijsmatrixChapter, '/documentatie/prijsmatrix.png'],
    ['StamgegevensChapter', StamgegevensChapter, '/documentatie/stamgegevens.png'],
    ['DrukkersChapter', DrukkersChapter, '/documentatie/drukkers.png'],
    ['GlassartDesignChapter', GlassartDesignChapter, '/documentatie/glassart-design.png'],
    ['InstellingenChapter', InstellingenChapter, '/documentatie/instellingen.png'],
  ] as const)('%s toont een screenshot met src %s', (_name, Chapter, expectedSrc) => {
    const { container } = render(<Chapter />);
    expectImageOnDisk(container, expectedSrc);
  });

  it('KunstwerkenChapter toont de voor/na-screenshots van het code-veld naast elkaar', () => {
    const { container } = render(<KunstwerkenChapter />);
    expectImageOnDisk(container, '/documentatie/kunstwerken-code-voor.png');
    expectImageOnDisk(container, '/documentatie/kunstwerken-code-na.png');
  });
});
