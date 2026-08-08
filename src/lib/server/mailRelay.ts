export interface MailBericht {
  to: string;
  subject: string;
  body: string;
  html?: string;
}

/**
 * Leest de configuratie van de PHP-mailrelay (`mail-server/send-mail.php`).
 *
 * Bewust zónder `NEXT_PUBLIC_`-prefix: Next.js bakt elke `NEXT_PUBLIC_*`-waarde
 * letterlijk in de client-bundle, waardoor het gedeelde secret voor iedere
 * bezoeker uit de JavaScript te plukken was -- en `send-mail.php` accepteert een
 * willekeurige `to`/`subject`/`html` zodra je dat secret hebt. Dat maakte de
 * relay een open mail relay op ons eigen SMTP-account en domein.
 *
 * De terugval op de oude `NEXT_PUBLIC_`-namen staat er alleen zodat een deploy
 * niet stilletjes stopt met mailen voordat de nieuwe env-variabelen in
 * DirectAdmin staan. Zodra `MAIL_ENDPOINT_URL`/`MAIL_SECRET` daar gezet zijn
 * (en het secret geroteerd is, want de oude waarde is publiek geweest) mag deze
 * terugval weg.
 */
function relayConfig(): { endpoint: string; secret: string } | null {
  // `||`, niet `??`: een env-variabele die wél gezet is maar leeg is, is net zo
  // goed "niet geconfigureerd" -- met `??` zou die lege waarde de terugval winnen.
  const endpoint = process.env.MAIL_ENDPOINT_URL || process.env.NEXT_PUBLIC_MAIL_ENDPOINT_URL;
  const secret = process.env.MAIL_SECRET || process.env.NEXT_PUBLIC_MAIL_SECRET;
  if (!endpoint || !secret) return null;
  return { endpoint, secret };
}

/**
 * Stuurt één bericht via de relay. Geeft `false` terug wanneer de relay niet
 * geconfigureerd is of de verzending mislukt -- aanroepers bepalen zelf of dat
 * fataal is (de drukkersmail wél, een bestelbevestiging niet).
 */
export async function verstuurMail(bericht: MailBericht): Promise<boolean> {
  const config = relayConfig();
  if (!config) return false;
  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        secret: config.secret,
        to: bericht.to,
        subject: bericht.subject,
        body: bericht.body,
        ...(bericht.html ? { html: bericht.html } : {}),
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
