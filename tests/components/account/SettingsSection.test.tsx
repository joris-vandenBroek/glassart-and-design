import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CustomerAuthProvider } from '@/lib/useCustomerAuth';
import { SettingsSection } from '@/components/account/SettingsSection';
import messages from '../../../messages/nl.json';

const replaceMock = vi.fn();
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const KLANT_PROFILE = {
  companyName: 'Hotel De Zilveren Zwaan',
  contactPerson: 'Anne de Vries',
  email: 'anne@dezilverenzwaan.nl',
  phone: '0612345678',
  address: 'Kerkstraat 12',
  postcode: '1234 AB',
  city: 'Amsterdam',
  land: 'NL',
  contactPreference: 'email',
};

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/account',
  useRouter: () => ({ replace: replaceMock }),
}));

function renderSection() {
  fetchMock.mockImplementation(async (url: string, options?: { method?: string }) => {
    if (url === '/api/auth/me?type=klant') {
      return {
        ok: true,
        json: async () => ({
          user: { id: 'uid-1', email: 'klant@example.com', status: 'Goedgekeurd' },
        }),
      };
    }
    if (url === '/api/klanten/me' && (!options || options.method === undefined)) {
      return { ok: true, json: async () => KLANT_PROFILE };
    }
    return { ok: true };
  });
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerAuthProvider>
        <SettingsSection />
      </CustomerAuthProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  replaceMock.mockClear();
  fetchMock.mockReset();
});

describe('SettingsSection', () => {
  it('pre-fills fields from the real klant profile', async () => {
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
    fireEvent.change(screen.getByTestId('settings-password'), { target: { value: 'nieuw1234' } });
    fireEvent.change(screen.getByTestId('settings-password-confirm'), {
      target: { value: 'anders1234' },
    });
    fireEvent.click(screen.getByTestId('settings-submit'));
    expect(screen.getByTestId('settings-password-error')).toHaveTextContent(
      'Wachtwoorden komen niet overeen.'
    );
    expect(screen.queryByTestId('settings-saved')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/klanten/me', expect.objectContaining({ method: 'PATCH' }));
  });

  it('shows a password-too-short error and does not save', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByTestId('settings-submit')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('settings-password'), { target: { value: 'kort' } });
    fireEvent.change(screen.getByTestId('settings-password-confirm'), { target: { value: 'kort' } });
    fireEvent.click(screen.getByTestId('settings-submit'));
    expect(screen.getByTestId('settings-password-error')).toHaveTextContent(
      'Het wachtwoord moet minimaal 8 tekens lang zijn.'
    );
    expect(fetchMock).not.toHaveBeenCalledWith('/api/klanten/me', expect.objectContaining({ method: 'PATCH' }));
  });

  it('saves profile changes via PATCH /api/klanten/me and shows a saved confirmation', async () => {
    renderSection();
    await waitFor(() =>
      expect(screen.getByTestId('settings-company-name')).toHaveValue('Hotel De Zilveren Zwaan')
    );
    fireEvent.change(screen.getByTestId('settings-email'), {
      target: { value: 'nieuw@example.com' },
    });
    fireEvent.click(screen.getByTestId('settings-submit'));
    await waitFor(() => expect(screen.getByTestId('settings-saved')).toBeInTheDocument());

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/klanten/me',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ ...KLANT_PROFILE, email: 'nieuw@example.com' }),
      })
    );
  });

  it('includes the new password in the PATCH body when both password fields match', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByTestId('settings-submit')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('settings-password'), { target: { value: 'nieuw1234' } });
    fireEvent.change(screen.getByTestId('settings-password-confirm'), {
      target: { value: 'nieuw1234' },
    });
    fireEvent.click(screen.getByTestId('settings-submit'));
    await waitFor(() => expect(screen.getByTestId('settings-saved')).toBeInTheDocument());

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/klanten/me',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ ...KLANT_PROFILE, password: 'nieuw1234' }),
      })
    );
  });

  it('shows a save error and no confirmation when the PATCH request fails', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByTestId('settings-submit')).toBeInTheDocument());
    fetchMock.mockImplementation(async (url: string, options?: { method?: string }) => {
      if (url === '/api/klanten/me' && options?.method === 'PATCH') return { ok: false };
      if (url === '/api/klanten/me') return { ok: true, json: async () => KLANT_PROFILE };
      return { ok: true, json: async () => ({ user: { id: 'uid-1', status: 'Goedgekeurd' } }) };
    });
    fireEvent.click(screen.getByTestId('settings-submit'));
    expect(await screen.findByTestId('settings-save-error')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-saved')).not.toBeInTheDocument();
  });

  it('switches the site locale via router.replace when languagePreference changes', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByTestId('settings-submit')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('settings-language-preference'), {
      target: { value: 'en' },
    });
    fireEvent.click(screen.getByTestId('settings-submit'));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/account', { locale: 'en' }));
  });

  it('does not call router.replace when languagePreference is left unchanged', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByTestId('settings-submit')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('settings-submit'));
    await waitFor(() => expect(screen.getByTestId('settings-saved')).toBeInTheDocument());
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('shows an error and deletes nothing when the confirmation password is wrong', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByTestId('delete-account-submit')).toBeInTheDocument());
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/auth/login') return { ok: false };
      return { ok: true, json: async () => KLANT_PROFILE };
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
      return { ok: true, json: async () => KLANT_PROFILE };
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

  it('marks the seven profile fields as required', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByTestId('settings-company-name')).toHaveValue('Hotel De Zilveren Zwaan'));
    expect(screen.getByTestId('settings-company-name')).toBeRequired();
    expect(screen.getByTestId('settings-contact-person')).toBeRequired();
    expect(screen.getByTestId('settings-email')).toBeRequired();
    expect(screen.getByTestId('settings-phone')).toBeRequired();
    expect(screen.getByTestId('settings-address')).toBeRequired();
    expect(screen.getByTestId('settings-postcode')).toBeRequired();
    expect(screen.getByTestId('settings-city')).toBeRequired();
    expect(screen.getByTestId('settings-password')).not.toBeRequired();
    expect(screen.getByTestId('settings-password-confirm')).not.toBeRequired();
  });

  it('shows the required-field legend', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByTestId('settings-company-name')).toHaveValue('Hotel De Zilveren Zwaan'));
    expect(screen.getByTestId('settings-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });

  it('pre-fills the Land combobox from the real klant profile and includes it when saving', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByTestId('settings-land')).toHaveValue('Nederland'));
    fireEvent.click(screen.getByTestId('settings-submit'));
    await waitFor(() => expect(screen.getByTestId('settings-saved')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/klanten/me',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify(KLANT_PROFILE) })
    );
  });
});
