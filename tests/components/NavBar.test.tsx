import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { NavBar } from '@/components/NavBar';
import messages from '../../messages/nl.json';

const usePathnameMock = vi.fn(() => '/');
const getDocsMock = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => usePathnameMock(),
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@/components/CartPanel', () => ({
  CartPanel: () => <div data-testid="cart-panel-stub" />,
}));

// CollectiesDropdown (rendered inside NavBar) still reads Firestore directly —
// it hasn't been migrated to useApiCollection yet.
vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ name })),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
}));

let isCustomer = false;
let isHydrated = true;

vi.mock('@/lib/useCustomerAuth', () => ({
  useCustomerAuth: () => ({ isCustomer, isHydrated, user: null, logout: vi.fn() }),
}));

function renderNavBar() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <NavBar />
    </NextIntlClientProvider>
  );
}

function signedOut() {
  isCustomer = false;
  isHydrated = true;
}

function signedInAsApprovedCustomer() {
  isCustomer = true;
  isHydrated = true;
}

beforeEach(() => {
  usePathnameMock.mockReturnValue('/');
  getDocsMock.mockReset();
  getDocsMock.mockResolvedValue({ empty: true, docs: [] });
});

describe('NavBar', () => {
  it('shows "Word klant" and "Inloggen" when logged out, no account link', async () => {
    signedOut();
    renderNavBar();
    await waitFor(() => expect(screen.getByTestId('nav-become-client')).toBeInTheDocument());
    expect(screen.getByTestId('nav-login')).toBeInTheDocument();
    expect(screen.queryByTestId('account-icon')).not.toBeInTheDocument();
  });

  it('renders Collecties as a link, with a dropdown available on hover once segments load', async () => {
    signedOut();
    getDocsMock.mockResolvedValue({
      empty: false,
      docs: [{ id: 'seg-hotel', data: () => ({ omschrijving: 'Hotel' }) }],
    });
    renderNavBar();
    await waitFor(() => expect(screen.getByTestId('nav-become-client')).toBeInTheDocument());
    expect(screen.getByTestId('nav-collections')).toHaveAttribute('href', '/collecties');
    expect(screen.queryByTestId('collections-dropdown')).not.toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByTestId('collections-dropdown-trigger'));
    await waitFor(() => expect(screen.getByTestId('collections-dropdown-item-seg-hotel')).toBeInTheDocument());
  });

  it('shows the "Inloggen" link pointing to /inloggen when logged out', async () => {
    signedOut();
    renderNavBar();
    await waitFor(() => expect(screen.getByTestId('nav-login')).toBeInTheDocument());
    expect(screen.getByTestId('nav-login')).toHaveAttribute('href', '/inloggen');
  });

  it('shows a link to /account instead of "Word klant"/"Inloggen" when already logged in', async () => {
    signedInAsApprovedCustomer();
    renderNavBar();
    await waitFor(() => expect(screen.getByTestId('account-icon')).toBeInTheDocument());
    expect(screen.getByTestId('account-icon')).toHaveAttribute('href', '/account');
    expect(screen.queryByTestId('nav-become-client')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nav-login')).not.toBeInTheDocument();
  });

  it('points Contact at /contact and Word klant at /word-klant', async () => {
    signedOut();
    renderNavBar();
    await waitFor(() => expect(screen.getByTestId('nav-become-client')).toBeInTheDocument());
    expect(screen.getByTestId('nav-contact')).toHaveAttribute('href', '/contact');
    expect(screen.getByTestId('nav-become-client')).toHaveAttribute('href', '/word-klant');
  });

  it('renders the logo linking to the homepage', async () => {
    signedOut();
    renderNavBar();
    await waitFor(() => expect(screen.getByTestId('logo')).toBeInTheDocument());
    expect(screen.getByTestId('logo')).toHaveAttribute('href', '/');
  });

  it('renders nothing on /beheer', () => {
    usePathnameMock.mockReturnValue('/beheer');
    signedOut();
    const { container } = renderNavBar();
    expect(container).toBeEmptyDOMElement();
  });
});
