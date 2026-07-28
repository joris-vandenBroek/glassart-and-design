import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AdminDashboard } from '@/components/beheer/AdminDashboard';
import messages from '../../../messages/nl.json';

const logoutMock = vi.fn();
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
let mockAuthState: {
  user: { uid: string; email: string | null } | null;
  isAdmin: boolean;
  isHydrated: boolean;
};

vi.mock('@/lib/useAdminAuth', () => ({
  useAdminAuth: () => ({
    ...mockAuthState,
    login: vi.fn(),
    resetPassword: vi.fn(),
    logout: logoutMock,
  }),
}));

function renderDashboard() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <AdminDashboard />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  logoutMock.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
});

describe('AdminDashboard', () => {
  it('renders nothing while not hydrated', () => {
    mockAuthState = { user: null, isAdmin: false, isHydrated: false };
    renderDashboard();
    expect(screen.queryByTestId('beheer-login-email')).not.toBeInTheDocument();
    expect(screen.queryByTestId('beheer-dashboard')).not.toBeInTheDocument();
  });

  it('shows the login form when hydrated with no user', () => {
    mockAuthState = { user: null, isAdmin: false, isHydrated: true };
    renderDashboard();
    expect(screen.getByTestId('beheer-login-email')).toBeInTheDocument();
  });

  it('shows the BeheerShell with the logged-in email when authorized', async () => {
    mockAuthState = {
      user: { uid: 'uid-1', email: 'paul@glassartanddesign.com' },
      isAdmin: true,
      isHydrated: true,
    };
    renderDashboard();
    expect(screen.getByTestId('beheer-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('beheer-logged-in-as')).toHaveTextContent(
      'paul@glassartanddesign.com'
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it('shows an access-denied message and signs out when logged in without a medewerkers document', async () => {
    mockAuthState = {
      user: { uid: 'uid-2', email: 'onbekend@glassartanddesign.com' },
      isAdmin: false,
      isHydrated: true,
    };
    renderDashboard();
    expect(screen.getByTestId('beheer-unauthorized')).toBeInTheDocument();
    expect(screen.queryByTestId('beheer-login-email')).not.toBeInTheDocument();
    await waitFor(() => expect(logoutMock).toHaveBeenCalled());
  });
});
