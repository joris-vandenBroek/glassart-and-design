import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CustomerLoginForm } from '@/components/CustomerLoginForm';
import { CustomerAuthProvider } from '@/lib/useCustomerAuth';
import messages from '../../messages/nl.json';

const fetchMock = vi.fn();
const replaceMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

// Provider mounts and calls /api/auth/me once before any test interacts with the form.
const NOT_LOGGED_IN_RESPONSE = { ok: true, json: async () => ({ user: null }) };

function renderForm() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerAuthProvider>
        <CustomerLoginForm />
      </CustomerAuthProvider>
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
  fetchMock.mockResolvedValueOnce(NOT_LOGGED_IN_RESPONSE);
});

describe('CustomerLoginForm', () => {
  it('shows a generic error when the credentials are wrong', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    renderForm();
    submitWith('klant@example.com', 'fout');
    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'E-mailadres of wachtwoord onjuist.'
    );
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('grants access, refreshes the auth context and redirects to /account when the klant is "Goedgekeurd"', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'Goedgekeurd' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: { id: 'k1', email: 'klant@example.com', status: 'Goedgekeurd' } }),
      });
    renderForm();
    submitWith('klant@example.com', 'geheim123');

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/account'));
    // login() must refetch /api/auth/me itself -- router.replace() is a client-side
    // navigation and does not remount CustomerAuthProvider to pick this up on its own.
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me?type=klant');
  });

  it('shows a pending message and does not grant access when status is "Beoordelen"', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'Beoordelen' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: { id: 'k1', email: 'klant@example.com', status: 'Beoordelen' } }),
      });
    renderForm();
    submitWith('klant@example.com', 'geheim123');

    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'Uw aanvraag wordt nog beoordeeld.'
    );
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('shows a rejected message when status is "Afgewezen"', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'Afgewezen' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: { id: 'k1', email: 'klant@example.com', status: 'Afgewezen' } }),
      });
    renderForm();
    submitWith('klant@example.com', 'geheim123');

    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'Uw aanvraag is helaas afgewezen.'
    );
  });

  it('shows the accountIncompleteMessage for any other status', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: undefined }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: { id: 'k1', email: 'klant@example.com', status: undefined } }),
      });
    renderForm();
    submitWith('klant@example.com', 'geheim123');

    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'Er ging iets mis bij uw eerdere aanvraag. Neem contact met ons op.'
    );
  });

  it('shows a generic error when the request itself fails (network error)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network error'));
    renderForm();
    submitWith('klant@example.com', 'geheim123');

    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'E-mailadres of wachtwoord onjuist.'
    );
  });

  it('completes a "testN" account with the company domain on staging', async () => {
    process.env.NEXT_PUBLIC_ENVIRONMENT_LABEL = 'staging';
    try {
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'Goedgekeurd' }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            user: { id: 'k1', email: 'test1@glassartanddesign.com', status: 'Goedgekeurd' },
          }),
        });
      renderForm();
      submitWith('test1', 'gaadTest1');

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/auth/login',
          expect.objectContaining({
            body: JSON.stringify({ email: 'test1@glassartanddesign.com', password: 'gaadTest1' }),
          })
        )
      );
    } finally {
      delete process.env.NEXT_PUBLIC_ENVIRONMENT_LABEL;
    }
  });

  it('leaves a real e-mail address untouched', async () => {
    process.env.NEXT_PUBLIC_ENVIRONMENT_LABEL = 'staging';
    try {
      fetchMock.mockResolvedValueOnce({ ok: false });
      renderForm();
      submitWith('klant@example.com', 'geheim123');

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/auth/login',
          expect.objectContaining({
            body: JSON.stringify({ email: 'klant@example.com', password: 'geheim123' }),
          })
        )
      );
    } finally {
      delete process.env.NEXT_PUBLIC_ENVIRONMENT_LABEL;
    }
  });

  it('shows the required-field legend', () => {
    renderForm();
    expect(screen.getByTestId('login-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
});
