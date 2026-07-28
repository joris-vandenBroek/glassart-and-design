export async function sendResetEmail(email: string, token: string, origin: string): Promise<void> {
  const endpoint = process.env.MAIL_SERVER_RESET_ENDPOINT_URL;
  const secret = process.env.NEXT_PUBLIC_MAIL_SECRET;
  if (!endpoint || !secret) return;
  const resetLink = `${origin}/nl/wachtwoord-resetten?token=${encodeURIComponent(token)}`;
  await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret, to: email, resetLink }),
  });
}
