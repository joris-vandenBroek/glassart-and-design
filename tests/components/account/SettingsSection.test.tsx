import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MockProfileProvider } from '@/lib/useMockProfile';
import { CustomerAuthProvider } from '@/lib/useCustomerAuth';
import { SettingsSection } from '@/components/account/SettingsSection';
import messages from '../../../messages/nl.json';

const replaceMock = vi.fn();
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/account',
  useRouter: () => ({ replace: replaceMock }),
}));

function renderSection() {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/auth/me?type=klant') {
      return {
        ok: true,
        json: async () => ({
          user: { id: 'uid-1', email: 'klant@example.com', status: 'Goedgekeurd' },
        }),
      };
    }
    return { ok: true };
  });
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerAuthProvider>
        <MockProfileProvider>
          <SettingsSection />
        </MockProfileProvider>
      </CustomerAuthProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  replaceMock.mockClear();
  fetchMock.mockReset();
});

describe('SettingsSection', () => {
  it('pre-fills fields from the seeded mock profile', async () => {
    renderSection();
    await waitFor(() =>
      expect(screen.getByTestId('settings-company-name')).toHaveValue('Hotel De Zilveren Zwaan')
    );
    expect(screen.getByTestId('settings-email')).toHaveValue('anne@dezilverenzwaan.nl');
    expect(screen.getByTestId('settings-contact-preference')).toHaveValue('email');
    expect(screen.getByTestId('settings-language-preference')).toHaveValue('nl');
  });

  it('shows a password-mismatch error and does not save when passwords differ', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByTestId('settings-submit')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('settings-password'), { target: { value: 'nieuw123' } });
    fireEvent.change(screen.getByTestId('settings-password-confirm'), {
      target: { value: 'anders123' },
    });
    fireEvent.click(screen.getByTestId('settings-submit'));
    expect(screen.getByTestId('settings-password-error')).toHaveTextContent(
      'Wachtwoorden komen niet overeen.'
    );
    expect(screen.queryByTestId('settings-saved')).not.toBeInTheDocument();
  });

  it('saves profile changes and shows a saved confirmation', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByTestId('settings-submit')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('settings-email'), {
      target: { value: 'nieuw@example.com' },
    });
    fireEvent.click(screen.getByTestId('settings-submit'));
    expect(screen.getByTestId('settings-saved')).toBeInTheDocument();
    const stored = JSON.parse(window.localStorage.getItem('glassart-mock-profile') ?? '{}');
    expect(stored.email).toBe('nieuw@example.com');
  });

  it('switches the site locale via router.replace when languagePreference changes', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByTestId('settings-submit')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('settings-language-preference'), {
      target: { value: 'en' },
    });
    fireEvent.click(screen.getByTestId('settings-submit'));
    expect(replaceMock).toHaveBeenCalledWith('/account', { locale: 'en' });
  });

  it('does not call router.replace when languagePreference is left unchanged', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByTestId('settings-submit')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('settings-submit'));
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('shows an error and deletes nothing when the confirmation password is wrong', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByTestId('delete-account-submit')).toBeInTheDocument());
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/auth/login') return { ok: false };
      return { ok: true };
    });
    fireEvent.change(screen.getByTestId('delete-account-password'), {
      target: { value: 'fout' },
    });
    fireEvent.click(screen.getByTestId('delete-account-submit'));
    expect(await screen.findByTestId('delete-account-error')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/klanten/uid-1', expect.anything());
  });

  it('shows a distinct partial-error message and stays on the page when re-auth succeeds but the account delete fails', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByTestId('delete-account-submit')).toBeInTheDocument());
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/auth/login') return { ok: true };
      if (url === `/api/klanten/uid-1`) return { ok: false };
      return { ok: true };
    });
    fireEvent.change(screen.getByTestId('delete-account-password'), {
      target: { value: 'geheim123' },
    });
    fireEvent.click(screen.getByTestId('delete-account-submit'));

    expect(await screen.findByTestId('delete-account-error')).toHaveTextContent(
      'Uw gegevens zijn verwijderd, maar er ging iets mis bij het volledig verwijderen van uw account. Neem contact met ons op.'
    );
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('re-authenticates, deletes the klant record, logs out and redirects home', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByTestId('delete-account-submit')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('delete-account-password'), {
      target: { value: 'geheim123' },
    });
    fireEvent.click(screen.getByTestId('delete-account-submit'));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'klant@example.com', password: 'geheim123' }),
      })
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/klanten/uid-1', { method: 'DELETE' });
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }));
  });
});
