import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CustomerAuthProvider, useCustomerAuth } from '@/lib/useCustomerAuth';

const onAuthStateChangedMock = vi.fn();
const signOutMock = vi.fn();
const getDocMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => onAuthStateChangedMock(...args),
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection, id) => ({ collection, id })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
}));

function TestConsumer() {
  const { user, isCustomer, isHydrated } = useCustomerAuth();
  if (!isHydrated) return <div data-testid="loading" />;
  return (
    <div>
      <div data-testid="user">{user ? user.email : 'none'}</div>
      <div data-testid="is-customer">{String(isCustomer)}</div>
      <div data-testid="company-name">{user?.companyName ?? 'none'}</div>
      <div data-testid="contact-person">{user?.contactPerson ?? 'none'}</div>
      <div data-testid="minimale-afname">{user?.minimaleAfname ?? 'none'}</div>
    </div>
  );
}

function renderProvider() {
  return render(
    <CustomerAuthProvider>
      <TestConsumer />
    </CustomerAuthProvider>
  );
}

beforeEach(() => {
  onAuthStateChangedMock.mockReset();
  signOutMock.mockReset();
  getDocMock.mockReset();
});

describe('useCustomerAuth', () => {
  it('reports isHydrated with no user when signed out', async () => {
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback(null);
      return () => {};
    });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('user')).toBeInTheDocument());
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(screen.getByTestId('is-customer')).toHaveTextContent('false');
  });

  it('reports isCustomer true when the klanten document has status "Goedgekeurd"', async () => {
    getDocMock.mockResolvedValue({ exists: () => true, data: () => ({ status: 'Goedgekeurd' }) });
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-1', email: 'klant@example.com' });
      return () => {};
    });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('is-customer')).toHaveTextContent('true'));
    expect(screen.getByTestId('user')).toHaveTextContent('klant@example.com');
  });

  it('reports isCustomer false when the klanten document has a different status', async () => {
    getDocMock.mockResolvedValue({ exists: () => true, data: () => ({ status: 'Beoordelen' }) });
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-2', email: 'klant2@example.com' });
      return () => {};
    });
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent('klant2@example.com')
    );
    expect(screen.getByTestId('is-customer')).toHaveTextContent('false');
  });

  it('reports isCustomer false when no klanten document exists', async () => {
    getDocMock.mockResolvedValue({ exists: () => false });
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-3', email: 'klant3@example.com' });
      return () => {};
    });
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent('klant3@example.com')
    );
    expect(screen.getByTestId('is-customer')).toHaveTextContent('false');
  });

  it('calls the real signOut', async () => {
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback(null);
      return () => {};
    });
    signOutMock.mockResolvedValue(undefined);
    let hookValue: ReturnType<typeof useCustomerAuth> | null = null;
    function Capture() {
      hookValue = useCustomerAuth();
      return null;
    }
    render(
      <CustomerAuthProvider>
        <Capture />
      </CustomerAuthProvider>
    );
    await waitFor(() => expect(hookValue?.isHydrated).toBe(true));
    await hookValue!.logout();
    expect(signOutMock).toHaveBeenCalledWith({});
  });

  it('exposes companyName and contactPerson from the klanten document', async () => {
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({ status: 'Goedgekeurd', companyName: 'Testbedrijf BV', contactPerson: 'Jan Jansen' }),
    });
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-4', email: 'klant4@example.com' });
      return () => {};
    });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('company-name')).toHaveTextContent('Testbedrijf BV'));
    expect(screen.getByTestId('contact-person')).toHaveTextContent('Jan Jansen');
  });

  it('exposes null companyName/contactPerson when no klanten document exists', async () => {
    getDocMock.mockResolvedValue({ exists: () => false });
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-5', email: 'klant5@example.com' });
      return () => {};
    });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('klant5@example.com'));
    expect(screen.getByTestId('company-name')).toHaveTextContent('none');
    expect(screen.getByTestId('contact-person')).toHaveTextContent('none');
  });

  it('exposes minimaleAfname from the klanten document', async () => {
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({ status: 'Goedgekeurd', minimaleAfname: 5 }),
    });
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-6', email: 'klant6@example.com' });
      return () => {};
    });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('minimale-afname')).toHaveTextContent('5'));
  });

  it('exposes null minimaleAfname when the klanten document has no override', async () => {
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({ status: 'Goedgekeurd' }),
    });
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-7', email: 'klant7@example.com' });
      return () => {};
    });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('klant7@example.com'));
    expect(screen.getByTestId('minimale-afname')).toHaveTextContent('none');
  });
});
