import { verstuurMail } from './mailRelay';

/**
 * De locale komt van de aanroeper en zit al gevalideerd in `locale` -- deze
 * functie bouwt er een pad mee en controleert niets meer. De tekst van de mail
 * blijft bewust Nederlands; alleen de link volgt de taal van de gebruiker.
 */
export async function sendResetEmail(
  email: string,
  token: string,
  origin: string,
  locale: string
): Promise<void> {
  const resetLink = `${origin}/${locale}/wachtwoord-resetten?token=${encodeURIComponent(token)}`;
  const subject = 'Wachtwoord opnieuw instellen — Glassart & Design';
  const body =
    'Er is een verzoek binnengekomen om het wachtwoord van dit account opnieuw in te stellen.\n\n' +
    'Klik op onderstaande link om een nieuw wachtwoord in te stellen. Deze link is 24 uur geldig:\n\n' +
    resetLink +
    '\n\n' +
    'Heb je dit niet zelf aangevraagd? Dan kun je deze e-mail negeren -- er verandert niets aan je account.';
  await verstuurMail({ to: email, subject, body });
}
