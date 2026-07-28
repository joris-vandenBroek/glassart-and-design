import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BecomeClientCta } from '@/components/BecomeClientCta';
import messages from '../../messages/nl.json';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

let isCustomer = false;
let isHydrated = true;

vi.mock('@/lib/useCustomerAuth', () => ({
  useCustomerAuth: () => ({ isCustomer, isHydrated, user: null, logout: vi.fn() }),
}));

function renderBecomeClientCta() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <BecomeClientCta />
    </NextIntlClientProvider>
  );
}

describe('BecomeClientCta', () => {
  it('shows the "Word klant" link pointing at /word-klant when logged out', () => {
    isCustomer = false;
    isHydrated = true;
    renderBecomeClientCta();
    expect(screen.getByTestId('segment-cta')).toHaveAttribute('href', '/word-klant');
  });

  it('hides the link when already logged in', () => {
    isCustomer = true;
    isHydrated = true;
    renderBecomeClientCta();
    expect(screen.queryByTestId('segment-cta')).not.toBeInTheDocument();
  });
});
