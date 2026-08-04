import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { RegistrationForm } from '@/components/RegistrationForm';
import messages from '../../messages/nl.json';

const fetchMock = vi.fn();
const logActiviteitMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: (...args: unknown[]) => logActiviteitMock(...args),
  ONBEKENDE_ACTOR: { id: null, email: 'Onbekend', naam: 'Onbekend' },
}));

function renderForm() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <RegistrationForm />
    </NextIntlClientProvider>
  );
}

function fillRequiredFields() {
  fireEvent.change(screen.getByTestId('word-klant-company-name'), {
    target: { value: 'Testbedrijf BV' },
  });
  fireEvent.change(screen.getByTestId('word-klant-kvk'), { target: { value: '12345678' } });
  fireEvent.change(screen.getByTestId('word-klant-contact-person'), {
    target: { value: 'Jan Jansen' },
  });
  fireEvent.change(screen.getByTestId('word-klant-email'), {
    target: { value: 'jan@example.com' },
  });
  fireEvent.change(screen.getByTestId('word-klant-phone'), { target: { value: '0612345678' } });
  fireEvent.change(screen.getByTestId('word-klant-password'), { target: { value: 'geheim123' } });
  fireEvent.change(screen.getByTestId('word-klant-password-confirm'), {
    target: { value: 'geheim123' },
  });
  fireEvent.change(screen.getByTestId('word-klant-address'), {
    target: { value: 'Teststraat 1' },
  });
  fireEvent.change(screen.getByTestId('word-klant-postcode'), { target: { value: '1234 AB' } });
  fireEvent.change(screen.getByTestId('word-klant-city'), { target: { value: 'Teststad' } });
}

beforeEach(() => {
  fetchMock.mockReset();
  logActiviteitMock.mockReset();
});

describe('RegistrationForm', () => {
  it('shows the 3 business fields as required, with no Particulier/Zakelijk toggle', () => {
    renderForm();
    expect(screen.getByTestId('word-klant-company-name')).toBeRequired();
    expect(screen.getByTestId('word-klant-kvk')).toBeRequired();
    expect(screen.getByTestId('word-klant-contact-person')).toBeRequired();
    expect(screen.queryByTestId('word-klant-type-zakelijk')).not.toBeInTheDocument();
    expect(screen.queryByTestId('word-klant-type-particulier')).not.toBeInTheDocument();
  });

  it('has no separate Naam field', () => {
    renderForm();
    expect(screen.queryByTestId('word-klant-name')).not.toBeInTheDocument();
  });

  it('marks the shared fields as required', () => {
    renderForm();
    expect(screen.getByTestId('word-klant-email')).toBeRequired();
    expect(screen.getByTestId('word-klant-phone')).toBeRequired();
    expect(screen.getByTestId('word-klant-password')).toBeRequired();
    expect(screen.getByTestId('word-klant-password-confirm')).toBeRequired();
    expect(screen.getByTestId('word-klant-address')).toBeRequired();
    expect(screen.getByTestId('word-klant-postcode')).toBeRequired();
    expect(screen.getByTestId('word-klant-city')).toBeRequired();
  });

  it('shows the 3 delivery-address fields only when the "different delivery address" checkbox is checked', () => {
    renderForm();
    expect(screen.queryByTestId('word-klant-delivery-address')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('word-klant-different-delivery'));
    expect(screen.getByTestId('word-klant-delivery-address')).toBeInTheDocument();
    expect(screen.getByTestId('word-klant-delivery-postcode')).toBeInTheDocument();
    expect(screen.getByTestId('word-klant-delivery-city')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('word-klant-different-delivery'));
    expect(screen.queryByTestId('word-klant-delivery-address')).not.toBeInTheDocument();
  });

  it('shows the 3 invoice-address fields only when the "different invoice address" checkbox is checked', () => {
    renderForm();
    expect(screen.queryByTestId('word-klant-invoice-address')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('word-klant-different-invoice'));
    expect(screen.getByTestId('word-klant-invoice-address')).toBeInTheDocument();
    expect(screen.getByTestId('word-klant-invoice-postcode')).toBeInTheDocument();
    expect(screen.getByTestId('word-klant-invoice-city')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('word-klant-different-invoice'));
    expect(screen.queryByTestId('word-klant-invoice-address')).not.toBeInTheDocument();
  });

  it('renders the contact-preference select with exactly the 3 options', () => {
    renderForm();
    const select = screen.getByTestId('word-klant-contact-preference') as HTMLSelectElement;
    const optionTexts = Array.from(select.options)
      .map((option) => option.text)
      .filter((text) => text !== 'Hoe wilt u gecontacteerd worden?');
    expect(optionTexts).toEqual(['E-mail', 'Telefonisch', 'WhatsApp']);
  });

  it('shows an error and does not submit when the passwords do not match', () => {
    renderForm();
    fireEvent.change(screen.getByTestId('word-klant-password'), { target: { value: 'geheim123' } });
    fireEvent.change(screen.getByTestId('word-klant-password-confirm'), {
      target: { value: 'anderswoord' },
    });
    fireEvent.submit(screen.getByTestId('word-klant-submit').closest('form')!);
    expect(screen.getByTestId('word-klant-password-error')).toHaveTextContent(
      'Wachtwoorden komen niet overeen.'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs to /api/auth/register with the form data and shows the confirmation screen', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderForm();
    fillRequiredFields();

    fireEvent.submit(screen.getByTestId('word-klant-submit').closest('form')!);

    await waitFor(() => expect(screen.getByTestId('word-klant-confirmation')).toBeInTheDocument());

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/register',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: 'jan@example.com',
          password: 'geheim123',
          companyName: 'Testbedrijf BV',
          kvk: '12345678',
          contactPerson: 'Jan Jansen',
          phone: '0612345678',
          contactPreference: '',
          address: 'Teststraat 1',
          postcode: '1234 AB',
          city: 'Teststad',
          land: 'NL',
          deliveryAddress: '',
          deliveryPostcode: '',
          deliveryCity: '',
          invoiceAddress: '',
          invoicePostcode: '',
          invoiceCity: '',
          invoiceLand: '',
        }),
      })
    );
  });

  it('shows a specific error when the email address is already in use', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'email-in-use' }) });
    renderForm();
    fillRequiredFields();
    fireEvent.submit(screen.getByTestId('word-klant-submit').closest('form')!);
    expect(await screen.findByTestId('word-klant-submit-error')).toHaveTextContent(
      'Dit e-mailadres is al geregistreerd.'
    );
  });

  it('shows a generic error for any other failure', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'server-error' }) });
    renderForm();
    fillRequiredFields();
    fireEvent.submit(screen.getByTestId('word-klant-submit').closest('form')!);
    expect(await screen.findByTestId('word-klant-submit-error')).toHaveTextContent(
      'Er is iets misgegaan, probeer het opnieuw.'
    );
  });

  it('shows a generic error when the request itself fails (network error)', async () => {
    fetchMock.mockRejectedValue(new Error('network error'));
    renderForm();
    fillRequiredFields();
    fireEvent.submit(screen.getByTestId('word-klant-submit').closest('form')!);
    expect(await screen.findByTestId('word-klant-submit-error')).toHaveTextContent(
      'Er is iets misgegaan, probeer het opnieuw.'
    );
  });

  it('logs word_klant_bezocht as Onbekend exactly once on mount', () => {
    renderForm();
    expect(logActiviteitMock).toHaveBeenCalledTimes(1);
    expect(logActiviteitMock).toHaveBeenCalledWith('word_klant_bezocht', {
      id: null,
      email: 'Onbekend',
      naam: 'Onbekend',
    });
  });

  it('logs word_klant_aanvraag with the company name on successful submit', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderForm();
    fillRequiredFields();
    fireEvent.submit(screen.getByTestId('word-klant-submit').closest('form')!);
    await waitFor(() => expect(screen.getByTestId('word-klant-confirmation')).toBeInTheDocument());
    expect(logActiviteitMock).toHaveBeenCalledWith('word_klant_aanvraag', {
      id: null,
      email: 'jan@example.com',
      naam: 'Testbedrijf BV',
    });
  });

  it('does not log word_klant_aanvraag when registration fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'email-in-use' }) });
    renderForm();
    fillRequiredFields();
    fireEvent.submit(screen.getByTestId('word-klant-submit').closest('form')!);
    await screen.findByTestId('word-klant-submit-error');
    expect(logActiviteitMock).toHaveBeenCalledTimes(1); // only the page-visit log
    expect(logActiviteitMock).not.toHaveBeenCalledWith('word_klant_aanvraag', expect.anything());
  });

  it('shows the required-field legend', () => {
    renderForm();
    expect(screen.getByTestId('word-klant-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });

  it('marks the Bedrijfsnaam label as required with an asterisk', () => {
    renderForm();
    const label = screen.getByTestId('word-klant-company-name').closest('label');
    expect(label).toHaveTextContent('Bedrijfsnaam *');
  });

  it('shows a Land combobox defaulted to Nederland in the main address block', () => {
    renderForm();
    // Combobox renders the selected label as the input's `value`, not text content
    // (see tests/components/Combobox.test.tsx), so this uses toHaveValue rather than
    // the brief's toHaveTextContent, which can never pass on an <input>.
    expect(screen.getByTestId('word-klant-land')).toHaveValue('Nederland');
  });

  it('shows an invoiceLand combobox only when "different invoice address" is checked, with no default', () => {
    renderForm();
    expect(screen.queryByTestId('word-klant-invoice-land')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('word-klant-different-invoice'));
    expect(screen.getByTestId('word-klant-invoice-land')).toBeInTheDocument();
    expect(screen.getByTestId('word-klant-invoice-land')).not.toHaveValue('Nederland');
  });

  it('includes land and invoiceLand in the POST body', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderForm();
    fillRequiredFields();
    fireEvent.click(screen.getByTestId('word-klant-different-invoice'));
    fireEvent.focus(screen.getByTestId('word-klant-invoice-land'));
    fireEvent.change(screen.getByTestId('word-klant-invoice-land'), { target: { value: 'Duitsland' } });
    fireEvent.click(screen.getByTestId('word-klant-invoice-land-option-DE'));
    fireEvent.submit(screen.getByTestId('word-klant-submit').closest('form')!);

    await waitFor(() => expect(screen.getByTestId('word-klant-confirmation')).toBeInTheDocument());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.land).toBe('NL');
    expect(body.invoiceLand).toBe('DE');
  });
});
