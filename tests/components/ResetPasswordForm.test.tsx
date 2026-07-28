import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ResetPasswordForm } from '@/components/ResetPasswordForm';
import messages from '../../messages/nl.json';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

let currentSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => currentSearchParams,
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function renderForm() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <ResetPasswordForm />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  currentSearchParams = new URLSearchParams('token=token-123');
});

describe('ResetPasswordForm', () => {
  it('shows a message and a login link instead of the form when there is no token', () => {
    currentSearchParams = new URLSearchParams();
    renderForm();
    expect(screen.getByTestId('reset-password-missing-token')).toBeInTheDocument();
    expect(screen.queryByTestId('reset-password-submit')).not.toBeInTheDocument();
  });

  it('shows an error when the new password is too short', () => {
    renderForm();
    fireEvent.change(screen.getByTestId('reset-password-new'), { target: { value: 'short' } });
    fireEvent.change(screen.getByTestId('reset-password-confirm'), { target: { value: 'short' } });
    fireEvent.click(screen.getByTestId('reset-password-submit'));
    expect(screen.getByTestId('reset-password-error')).toHaveTextContent(
      'Het wachtwoord moet minimaal 8 tekens lang zijn.'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows an error when the passwords do not match', () => {
    renderForm();
    fireEvent.change(screen.getByTestId('reset-password-new'), { target: { value: 'geheim123' } });
    fireEvent.change(screen.getByTestId('reset-password-confirm'), { target: { value: 'geheim456' } });
    fireEvent.click(screen.getByTestId('reset-password-submit'));
    expect(screen.getByTestId('reset-password-error')).toHaveTextContent(
      'De wachtwoorden komen niet overeen.'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('submits the token and new password, then shows a success message with a login link', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderForm();
    fireEvent.change(screen.getByTestId('reset-password-new'), { target: { value: 'geheim123' } });
    fireEvent.change(screen.getByTestId('reset-password-confirm'), { target: { value: 'geheim123' } });
    fireEvent.click(screen.getByTestId('reset-password-submit'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/reset-password/confirm',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ token: 'token-123', newPassword: 'geheim123' }),
        })
      )
    );
    expect(await screen.findByTestId('reset-password-success')).toHaveTextContent(
      'Uw wachtwoord is bijgewerkt. U kunt nu inloggen.'
    );
  });

  it('shows an invalid-token error when the request fails', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    renderForm();
    fireEvent.change(screen.getByTestId('reset-password-new'), { target: { value: 'geheim123' } });
    fireEvent.change(screen.getByTestId('reset-password-confirm'), { target: { value: 'geheim123' } });
    fireEvent.click(screen.getByTestId('reset-password-submit'));

    expect(await screen.findByTestId('reset-password-error')).toHaveTextContent(
      'Deze link is ongeldig of verlopen. Vraag een nieuwe aan.'
    );
  });

  it('shows a generic error when the request throws', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    renderForm();
    fireEvent.change(screen.getByTestId('reset-password-new'), { target: { value: 'geheim123' } });
    fireEvent.change(screen.getByTestId('reset-password-confirm'), { target: { value: 'geheim123' } });
    fireEvent.click(screen.getByTestId('reset-password-submit'));

    expect(await screen.findByTestId('reset-password-error')).toHaveTextContent(
      'Er is iets misgegaan. Probeer het opnieuw.'
    );
  });
});
