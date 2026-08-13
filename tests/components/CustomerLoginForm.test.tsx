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

  it('grants access, refreshes the auth context and redirects to /collecties when the klant is "Goedgekeurd"', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'Goedgekeurd' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: { id: 'k1', email: 'klant@example.com', status: 'Goedgekeurd' } }),
      });
    renderForm();
    submitWith('klant@example.com', 'geheim123');

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/collecties'));
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

  describe('wachtwoord vergeten', () => {
    function vraagResetAan(email: string) {
      fireEvent.change(screen.getByTestId('login-email'), { target: { value: email } });
      fireEvent.click(screen.getByTestId('login-forgot-password'));
    }

    it('vraagt om een e-mailadres wanneer het veld leeg is', async () => {
      renderForm();
      fireEvent.click(screen.getByTestId('login-forgot-password'));

      expect(await screen.findByTestId('login-reset-message')).toHaveTextContent(
        'Vul eerst uw e-mailadres in.'
      );
      // Alleen de /api/auth/me-aanroep van de provider, geen resetverzoek.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('stuurt het verzoek met userType klant en de huidige locale', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
      renderForm();
      vraagResetAan('klant@example.com');

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/auth/reset-password/request',
          expect.objectContaining({
            body: JSON.stringify({
              email: 'klant@example.com',
              userType: 'klant',
              locale: 'nl',
            }),
          })
        )
      );
    });

    // De API lekt niet of een adres bestaat; de melding mag dat ook niet doen.
    it('toont dezelfde bevestiging voor een bekend en een onbekend adres', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
      const verwacht =
        'Als dit e-mailadres bij ons bekend is, ontvangt u een e-mail om uw wachtwoord opnieuw in te stellen.';

      renderForm();
      vraagResetAan('bestaat@example.com');
      expect(await screen.findByTestId('login-reset-message')).toHaveTextContent(verwacht);

      vraagResetAan('bestaatniet@example.com');
      expect(await screen.findByTestId('login-reset-message')).toHaveTextContent(verwacht);
    });

    /**
     * Elke klik mint een resettoken en verstuurt een echte e-mail. Wie ongeduldig
     * doorklikt zou anders vijf links van 24 uur in zijn mailbox krijgen, allemaal
     * geldig -- vijf keer zoveel kans dat er eentje in verkeerde handen valt.
     */
    it('stuurt bij doorklikken maar één verzoek zolang het eerste nog loopt', async () => {
      let losResponse: (value: { ok: boolean; json: () => Promise<unknown> }) => void = () => {};
      const nogNietKlaar = new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
        losResponse = resolve;
      });
      fetchMock.mockReturnValueOnce(nogNietKlaar);

      renderForm();
      vraagResetAan('klant@example.com');

      const knop = screen.getByTestId('login-forgot-password');
      await waitFor(() => expect(knop).toBeDisabled());

      fireEvent.click(knop);
      fireEvent.click(knop);

      // Eén /api/auth/me van de provider plus precies één resetverzoek.
      expect(fetchMock).toHaveBeenCalledTimes(2);

      losResponse({ ok: true, json: async () => ({ ok: true }) });
      await screen.findByTestId('login-reset-message');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(knop).not.toBeDisabled();
    });

    // Een "we hebben je een mail gestuurd" mag niet onder een verse inlogfout
    // blijven staan: dan lijkt de mislukte inlogpoging bij die bevestiging te horen.
    it('wist de resetbevestiging zodra er opnieuw ingelogd wordt', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
      renderForm();
      vraagResetAan('klant@example.com');
      await screen.findByTestId('login-reset-message');

      fetchMock.mockResolvedValueOnce({ ok: false });
      submitWith('klant@example.com', 'fout');

      expect(await screen.findByTestId('login-error')).toBeInTheDocument();
      expect(screen.queryByTestId('login-reset-message')).toBeNull();
    });

    it('meldt een fout in plaats van een verzonnen bevestiging als het verzoek mislukt', async () => {
      fetchMock.mockRejectedValueOnce(new Error('network error'));
      renderForm();
      vraagResetAan('klant@example.com');

      expect(await screen.findByTestId('login-reset-message')).toHaveTextContent(
        'Er ging iets mis. Probeer het later opnieuw.'
      );
    });

    it('vult een "testN" account aan met het bedrijfsdomein op staging', async () => {
      process.env.NEXT_PUBLIC_ENVIRONMENT_LABEL = 'staging';
      try {
        fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
        renderForm();
        vraagResetAan('test1');

        await waitFor(() =>
          expect(fetchMock).toHaveBeenCalledWith(
            '/api/auth/reset-password/request',
            expect.objectContaining({
              body: JSON.stringify({
                email: 'test1@glassartanddesign.com',
                userType: 'klant',
                locale: 'nl',
              }),
            })
          )
        );
      } finally {
        delete process.env.NEXT_PUBLIC_ENVIRONMENT_LABEL;
      }
    });
  });
});
