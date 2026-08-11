import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DocumentatieSidebar } from '@/components/beheer/documentatie/DocumentatieSidebar';

describe('DocumentatieSidebar', () => {
  it('links to all 10 top-level chapters', () => {
    render(<DocumentatieSidebar />);
    const nav = screen.getByTestId('documentatie-sidebar');
    [
      '#klant-website',
      '#klant-registratie',
      '#bestelproces',
      '#kunstwerken',
      '#kunstenaars',
      '#prijsmatrix',
      '#stamgegevens',
      '#drukkers',
      '#glassart-design',
      '#instellingen',
    ].forEach((href) => {
      expect(nav.querySelector(`a[href="${href}"]`)).not.toBeNull();
    });
  });

  it('links to sub-chapters, e.g. the kunstwerken-code anchor', () => {
    render(<DocumentatieSidebar />);
    expect(screen.getByTestId('documentatie-sidebar').querySelector('a[href="#kunstwerken-code"]')).not.toBeNull();
  });
});
