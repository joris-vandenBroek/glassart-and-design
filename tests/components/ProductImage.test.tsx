import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProductImage } from '@/components/ProductImage';

describe('ProductImage', () => {
  it('renders the image with the given src and alt text', () => {
    render(<ProductImage src="https://example.com/foto.jpg" alt="Een kunstwerk" />);
    const img = screen.getByRole('img', { name: 'Een kunstwerk' });
    expect(img).toHaveAttribute('src', 'https://example.com/foto.jpg');
  });

  it('applies an extra className to the wrapper when given', () => {
    render(<ProductImage src="https://example.com/foto.jpg" alt="Een kunstwerk" className="h-12 w-12" />);
    expect(screen.getByTestId('product-image')).toHaveClass('h-12', 'w-12');
  });

  it('uses object-cover by default and object-contain with a background color when fit="contain"', () => {
    const { rerender } = render(<ProductImage src="https://example.com/foto.jpg" alt="Een kunstwerk" />);
    expect(screen.getByRole('img', { name: 'Een kunstwerk' })).toHaveClass('object-cover');

    rerender(<ProductImage src="https://example.com/foto.jpg" alt="Een kunstwerk" fit="contain" fitBackground="ink" />);
    const img = screen.getByRole('img', { name: 'Een kunstwerk' });
    expect(img).toHaveClass('object-contain');
    expect(screen.getByTestId('product-image')).toHaveStyle({ backgroundColor: '#060607' });
  });
});
