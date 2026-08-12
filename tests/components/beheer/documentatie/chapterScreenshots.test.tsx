import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { KlantRegistratieChapter } from '@/components/beheer/documentatie/chapters/KlantRegistratieChapter';
import { BestelprocesChapter } from '@/components/beheer/documentatie/chapters/BestelprocesChapter';
import { KunstwerkenChapter } from '@/components/beheer/documentatie/chapters/KunstwerkenChapter';
import { KunstenaarsChapter } from '@/components/beheer/documentatie/chapters/KunstenaarsChapter';

describe('hoofdstuk-screenshots', () => {
  it.each([
    ['KlantRegistratieChapter', KlantRegistratieChapter, '/documentatie/klant-registratie.png'],
    ['BestelprocesChapter', BestelprocesChapter, '/documentatie/bestelproces.png'],
    ['KunstwerkenChapter', KunstwerkenChapter, '/documentatie/kunstwerken.png'],
    ['KunstenaarsChapter', KunstenaarsChapter, '/documentatie/kunstenaars.png'],
  ])('%s toont een screenshot met src %s', (_name, Chapter, expectedSrc) => {
    const { container } = render(<Chapter />);
    const img = container.querySelector(`img[src="${expectedSrc}"]`);
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('alt');
    expect(img?.getAttribute('alt')).not.toBe('');
  });
});
