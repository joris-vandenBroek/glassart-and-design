import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CustomerAuthProvider } from '@/lib/useCustomerAuth';
import { AccountDashboard } from '@/components/account/AccountDashboard';
import messages from '../../../messages/nl.json';

const replaceMock = vi.fn();
const logActiviteitMock = vi.fn();
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

let authUser: Record<string, unknown> | null = null;

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/account',
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: (...args: unknown[]) => logActiviteitMock(...args),
  actorFromCustomer: (
    user: { uid: string; email: string | null; companyName: string | null; contactPerson: string | null } | null
  ) =>
    user
      ? { id: user.uid, email: user.email ?? 'Onbekend', naam: user.companyName ?? user.contactPerson ?? 'Onbekend' }
      : { id: null, email: 'Onbekend', naam: 'Onbekend' },
}));

function renderDashboard() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerAuthProvider>
        <AccountDashboard />
      </CustomerAuthProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  replaceMock.mockClear();
  logActiviteitMock.mockReset();
  authUser = null;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/auth/me?type=klant') {
      return { ok: true, json: async () => ({ user: authUser }) };
    }
    if (url === '/api/klanten/me') {
      return { ok: true, json: async () => ({ land: 'NL', invoiceLand: '' }) };
    }
    if (url === '/api/instellingen/btwtarieven') {
      return { ok: true, json: async () => ({ tarieven: [{ land: 'NL', percentage: 21 }], standaardPercentage: 21 }) };
    }
    return { ok: true, json: async () => [] };
  });
});

describe('AccountDashboard', () => {
  it('redirects to "/" and renders nothing when not logged in', async () => {
    authUser = null;
    renderDashboard();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'));
    expect(screen.queryByTestId('account-dashboard')).not.toBeInTheDocument();
  });

  it('renders the Bestellingen section by default when logged in', async () => {
    authUser = { id: 'uid-1', email: 'klant@example.com', status: 'Goedgekeurd' };
    renderDashboard();
    await waitFor(() => expect(screen.getByTestId('orders-section')).toBeInTheDocument());
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('switches to the Instellingen section when its nav button is clicked', async () => {
    authUser = { id: 'uid-1', email: 'klant@example.com', status: 'Goedgekeurd' };
    renderDashboard();
    await waitFor(() => expect(screen.getByTestId('orders-section')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('account-nav-settings'));
    expect(screen.getByTestId('settings-section')).toBeInTheDocument();
    expect(screen.queryByTestId('orders-section')).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/klanten/me'));
  });

  it('logs account_bezocht exactly once with the logged-in klant', async () => {
    authUser = {
      id: 'uid-1',
      email: 'klant@example.com',
      status: 'Goedgekeurd',
      companyName: 'Testbedrijf BV',
    };
    renderDashboard();
    await waitFor(() => expect(screen.getByTestId('orders-section')).toBeInTheDocument());
    expect(logActiviteitMock).toHaveBeenCalledTimes(1);
    expect(logActiviteitMock).toHaveBeenCalledWith('account_bezocht', {
      id: 'uid-1',
      email: 'klant@example.com',
      naam: 'Testbedrijf BV',
    });
  });

  it('does not log account_bezocht when redirected for not being logged in', async () => {
    authUser = null;
    renderDashboard();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'));
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });
});
