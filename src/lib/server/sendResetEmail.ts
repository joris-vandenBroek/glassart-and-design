export async function sendResetEmail(email: string, token: string): Promise<void> {
  const endpoint = process.env.MAIL_SERVER_RESET_ENDPOINT_URL;
  if (!endpoint) return;
  await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ to: email, resetToken: token }),
  });
}
