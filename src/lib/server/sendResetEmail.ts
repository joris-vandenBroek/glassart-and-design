export async function sendResetEmail(email: string, token: string, origin: string): Promise<void> {
  const endpoint = process.env.NEXT_PUBLIC_MAIL_ENDPOINT_URL;
  const secret = process.env.NEXT_PUBLIC_MAIL_SECRET;
  if (!endpoint || !secret) return;
  const resetLink = `${origin}/nl/wachtwoord-resetten?token=${encodeURIComponent(token)}`;
  const subject = 'Wachtwoord opnieuw instellen — Glassart & Design';
  const body =
    'Er is een verzoek binnengekomen om het wachtwoord van dit account opnieuw in te stellen.\n\n' +
    'Klik op onderstaande link om een nieuw wachtwoord in te stellen. Deze link is 24 uur geldig:\n\n' +
    resetLink +
    '\n\n' +
    'Heb je dit niet zelf aangevraagd? Dan kun je deze e-mail negeren -- er verandert niets aan je account.';
  await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret, to: email, subject, body }),
  });
}
