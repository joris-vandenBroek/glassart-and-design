import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { NavBar } from '@/components/NavBar';
import { CustomerAuthProvider } from '@/lib/useCustomerAuth';
import messages from '../../messages/nl.json';

const onAuthStateChangedMock = vi.fn();
const getDocMock = vi.fn();
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

vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => onAuthStateChangedMock(...args),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ name })),
  doc: vi.fn((_db, collection, id) => ({ collection, id })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));

function renderNavBar() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerAuthProvider>
        <NavBar />
      </CustomerAuthProvider>
    </NextIntlClientProvider>
  );
}

function signedOut() {
  onAuthStateChangedMock.mockImplementation((_auth, callback) => {
    callback(null);
    return () => {};
  });
}

function signedInAsApprovedCustomer() {
  getDocMock.mockResolvedValue({ exists: () => true, data: () => ({ status: 'Goedgekeurd' }) });
  onAuthStateChangedMock.mockImplementation((_auth, callback) => {
    callback({ uid: 'uid-1', email: 'klant@example.com' });
    return () => {};
  });
}

beforeEach(() => {
  onAuthStateChangedMock.mockReset();
  getDocMock.mockReset();
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
