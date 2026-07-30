import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CustomerLoginForm } from '@/components/CustomerLoginForm';
import messages from '../../messages/nl.json';

const fetchMock = vi.fn();
const replaceMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

function renderForm() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerLoginForm />
    </NextIntlClientProvider>
  );
}

function submitWith(email: string, password: string) {
  fireEvent.change(screen.getByTestId('login-email'), { target: { value: email } });
  fireEvent.change(screen.getByTestId('login-password'), { target: { value: password } });
  fireEvent.submit(screen.getByTestId('login-submit').closest('form')!);
}

beforeEach(() => {
  fetchMock.mockReset();
  replaceMock.mockReset();
});

describe('CustomerLoginForm', () => {
  it('shows a generic error when the credentials are wrong', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    renderForm();
    submitWith('klant@example.com', 'fout');
    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'E-mailadres of wachtwoord onjuist.'
    );
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('grants access and redirects to /account when the klant is "Goedgekeurd"', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: 'Goedgekeurd' }) });
    renderForm();
    submitWith('klant@example.com', 'geheim123');

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/account'));
  });

  it('shows a pending message and does not grant access when status is "Beoordelen"', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: 'Beoordelen' }) });
    renderForm();
    submitWith('klant@example.com', 'geheim123');

    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'Uw aanvraag wordt nog beoordeeld.'
    );
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('shows a rejected message when status is "Afgewezen"', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: 'Afgewezen' }) });
    renderForm();
    submitWith('klant@example.com', 'geheim123');

    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'Uw aanvraag is helaas afgewezen.'
    );
  });

  it('shows the accountIncompleteMessage for any other status', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: undefined }) });
    renderForm();
    submitWith('klant@example.com', 'geheim123');

    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'Er ging iets mis bij uw eerdere aanvraag. Neem contact met ons op.'
    );
  });

  it('shows a generic error when the request itself fails (network error)', async () => {
    fetchMock.mockRejectedValue(new Error('network error'));
    renderForm();
    submitWith('klant@example.com', 'geheim123');

    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'E-mailadres of wachtwoord onjuist.'
    );
  });

  it('shows the required-field legend', () => {
    renderForm();
    expect(screen.getByTestId('login-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
});
