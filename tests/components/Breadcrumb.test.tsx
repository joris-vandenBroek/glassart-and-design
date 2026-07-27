import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Breadcrumb } from '@/components/Breadcrumb';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('Breadcrumb', () => {
  it('renders every item separated by a visual separator', () => {
    render(
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Collecties', href: '/collecties' },
          { label: 'Hotel' },
        ]}
      />
    );
    expect(screen.getByTestId('breadcrumb-item-0')).toHaveTextContent('Home');
    expect(screen.getByTestId('breadcrumb-item-1')).toHaveTextContent('Collecties');
    expect(screen.getByTestId('breadcrumb-item-2')).toHaveTextContent('Hotel');
  });

  it('renders every item except the last as a link', () => {
    render(
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Collecties', href: '/collecties' },
          { label: 'Hotel' },
        ]}
      />
    );
    expect(screen.getByTestId('breadcrumb-item-0').tagName).toBe('A');
    expect(screen.getByTestId('breadcrumb-item-0')).toHaveAttribute('href', '/');
    expect(screen.getByTestId('breadcrumb-item-1').tagName).toBe('A');
    expect(screen.getByTestId('breadcrumb-item-2').tagName).not.toBe('A');
  });

  it('marks the last item with aria-current="page", even when it has an href', () => {
    render(
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Hotel', href: '/collecties?segment=hotel' },
        ]}
      />
    );
    expect(screen.getByTestId('breadcrumb-item-1')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('breadcrumb-item-1').tagName).not.toBe('A');
    expect(screen.getByTestId('breadcrumb-item-0')).not.toHaveAttribute('aria-current');
  });
});
