import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AccountNav } from '@/components/account/AccountNav';
import messages from '../../../messages/nl.json';

const logoutMock = vi.fn();

vi.mock('@/lib/useCustomerAuth', () => ({
  useCustomerAuth: () => ({ logout: logoutMock }),
}));

function renderNav(activeSection: 'orders' | 'settings' = 'orders') {
  const onSelect = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <AccountNav activeSection={activeSection} onSelect={onSelect} />
    </NextIntlClientProvider>
  );
  return { onSelect };
}

beforeEach(() => {
  logoutMock.mockReset();
});

describe('AccountNav', () => {
  it('renders all 2 section buttons plus a logout button', () => {
    renderNav();
    expect(screen.getByTestId('account-nav-orders')).toBeInTheDocument();
    expect(screen.getByTestId('account-nav-settings')).toBeInTheDocument();
    expect(screen.getByTestId('account-nav-logout')).toBeInTheDocument();
  });

  it('marks the active section with aria-current', () => {
    renderNav('settings');
    expect(screen.getByTestId('account-nav-settings')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('account-nav-orders')).not.toHaveAttribute('aria-current');
  });

  it('calls onSelect with the clicked section id', () => {
    const { onSelect } = renderNav();
    fireEvent.click(screen.getByTestId('account-nav-settings'));
    expect(onSelect).toHaveBeenCalledWith('settings');
  });

  it('calls signOut when the logout button is clicked', () => {
    renderNav();
    fireEvent.click(screen.getByTestId('account-nav-logout'));
    expect(logoutMock).toHaveBeenCalled();
  });
});
