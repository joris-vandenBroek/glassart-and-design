import { describe, expect, it, vi, beforeEach } from 'vitest';
import { sendResetEmail } from '@/lib/server/sendResetEmail';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true });
  vi.stubEnv('NEXT_PUBLIC_MAIL_ENDPOINT_URL', 'https://example.com/mail-server/send-mail.php');
  vi.stubEnv('NEXT_PUBLIC_MAIL_SECRET', 'test-secret');
});

describe('sendResetEmail', () => {
  it('posts the secret, email, subject, and a body containing the reset link to the generic mail endpoint', async () => {
    await sendResetEmail('klant@example.com', 'token-123', 'https://glassartanddesign.com');

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
    await sendResetEmail('klant@example.com', 'a b/c', 'https://glassartanddesign.com');

    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.body).toContain('https://glassartanddesign.com/nl/wachtwoord-resetten?token=a%20b%2Fc');
  });

  it('does not call fetch when the endpoint env var is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAIL_ENDPOINT_URL', '');
    await sendResetEmail('klant@example.com', 'token-123', 'https://glassartanddesign.com');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not call fetch when the shared secret env var is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAIL_SECRET', '');
    await sendResetEmail('klant@example.com', 'token-123', 'https://glassartanddesign.com');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
