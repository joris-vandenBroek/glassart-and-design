import { verstuurMail } from './mailRelay';

/**
 * Meldt de klant dat een medewerker telefonisch een nieuw wachtwoord voor zijn
 * account heeft ingesteld.
 *
 * Het uitgangspunt van die handeling is dat de klant niet bij zijn mailbox kan --
 * maar dat is een bewering van degene aan de telefoon, en precies de bewering die
 * iemand doet die zich voor een ander uitgeeft. Deze mail bereikt de mailbox van
 * de rechtmatige eigenaar ook wanneer de beller die niet kan lezen. Dat de echte
 * klant hem misschien pas later ziet, is geen bezwaar: later is oneindig veel
 * eerder dan nooit.
 *
 * Het wachtwoord staat er bewust niet in. Dat is telefonisch doorgegeven en hoort
 * niet alsnog in de mailbox te belanden waar de klant niet bij zou kunnen.
 *
 * Geeft `false` terug wanneer de relay niet geconfigureerd is of de verzending
 * mislukt -- nooit een throw, want het wachtwoord staat op dat moment al vast.
 */
export async function sendWachtwoordUitgegevenMail(email: string): Promise<boolean> {
  const subject = 'Nieuw wachtwoord ingesteld — Glassart & Design';
  const body =
    'Een medewerker van Glassart & Design heeft zojuist een nieuw wachtwoord voor je account ' +
    'ingesteld, op jouw verzoek per telefoon. Je hebt het wachtwoord telefonisch doorgekregen.\n\n' +
    'Je bent hierbij overal uitgelogd, en eerder aangevraagde links om je wachtwoord opnieuw in ' +
    'te stellen werken niet meer.\n\n' +
    'Heb je hier niet zelf om gevraagd? Neem dan direct contact met ons op -- dan heeft iemand ' +
    'anders zich mogelijk voor je uitgegeven.';
  return verstuurMail({ to: email, subject, body });
}
