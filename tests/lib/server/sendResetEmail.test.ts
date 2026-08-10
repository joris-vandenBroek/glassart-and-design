import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { sendResetEmail } from '@/lib/server/sendResetEmail';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true });
  // Server-side namen: het relay-secret hoort niet meer via NEXT_PUBLIC_* in de
  // client-bundle terecht te komen.
  vi.stubEnv('MAIL_ENDPOINT_URL', 'https://example.com/mail-server/send-mail.php');
  vi.stubEnv('MAIL_SECRET', 'test-secret');
  vi.stubEnv('NEXT_PUBLIC_MAIL_ENDPOINT_URL', '');
  vi.stubEnv('NEXT_PUBLIC_MAIL_SECRET', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('sendResetEmail', () => {
  it('posts the secret, email, subject, and a body containing the reset link to the generic mail endpoint', async () => {
    await sendResetEmail('klant@example.com', 'token-123', 'https://glassartanddesign.com', 'nl');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/mail-server/send-mail.php',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.secret).toBe('test-secret');
    expect(body.to).toBe('klant@example.com');
    expect(body.subject).toBe('Wachtwoord opnieuw instellen — Glassart & Design');
    expect(body.body).toContain('https://glassartanddesign.com/nl/wachtwoord-resetten?token=token-123');
  });

  it('URL-encodes the token in the reset link', async () => {
    await sendResetEmail('klant@example.com', 'a b/c', 'https://glassartanddesign.com', 'nl');

    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.body).toContain('https://glassartanddesign.com/nl/wachtwoord-resetten?token=a%20b%2Fc');
  });

  it('does not call fetch when the endpoint env var is not configured', async () => {
    vi.stubEnv('MAIL_ENDPOINT_URL', '');
    await sendResetEmail('klant@example.com', 'token-123', 'https://glassartanddesign.com', 'nl');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not call fetch when the shared secret env var is not configured', async () => {
    vi.stubEnv('MAIL_SECRET', '');
    await sendResetEmail('klant@example.com', 'token-123', 'https://glassartanddesign.com', 'nl');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Terugval zodat een deploy niet stilvalt voordat MAIL_* in DirectAdmin staat;
  // mag weg zodra die variabelen er zijn en het secret geroteerd is.
  it('falls back to the legacy NEXT_PUBLIC_* names when the server-side ones are unset', async () => {
    vi.stubEnv('MAIL_ENDPOINT_URL', '');
    vi.stubEnv('MAIL_SECRET', '');
    vi.stubEnv('NEXT_PUBLIC_MAIL_ENDPOINT_URL', 'https://oud.example.com/send-mail.php');
    vi.stubEnv('NEXT_PUBLIC_MAIL_SECRET', 'oud-secret');

    await sendResetEmail('klant@example.com', 'token-123', 'https://glassartanddesign.com', 'nl');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://oud.example.com/send-mail.php',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('uses the provided locale in the reset link', async () => {
    await sendResetEmail('klant@example.com', 'token-123', 'https://glassartanddesign.com', 'de');

    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.body).toContain('https://glassartanddesign.com/de/wachtwoord-resetten?token=token-123');
  });
});
