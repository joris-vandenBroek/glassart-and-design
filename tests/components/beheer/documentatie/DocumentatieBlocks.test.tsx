import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Screenshot } from '@/components/beheer/documentatie/DocumentatieBlocks';

describe('Screenshot', () => {
  it('renders an image with the given src and alt text', () => {
    render(<Screenshot src="/documentatie/kunstwerken.png" alt="Het kunstwerk-formulier" />);
    const img = screen.getByRole('img', { name: 'Het kunstwerk-formulier' });
    expect(img).toHaveAttribute('src', '/documentatie/kunstwerken.png');
  });

  it('renders the caption when one is given', () => {
    render(<Screenshot src="/documentatie/kunstwerken.png" alt="Het kunstwerk-formulier" caption="Zo ziet het formulier eruit" />);
    expect(screen.getByText('Zo ziet het formulier eruit')).toBeInTheDocument();
  });

  it('renders no caption element when none is given', () => {
    const { container } = render(<Screenshot src="/documentatie/kunstwerken.png" alt="Het kunstwerk-formulier" />);
    expect(container.querySelector('figcaption')).not.toBeInTheDocument();
  });
});
