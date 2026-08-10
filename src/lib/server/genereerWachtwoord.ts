import { randomInt } from 'crypto';

/**
 * a-z zonder `l` en `o`, plus 2-9. Geen `0`, `1`, hoofdletters of leestekens:
 * dit wachtwoord wordt telefonisch doorgegeven, dus elk teken moet eenduidig
 * uit te spreken en over te typen zijn.
 *
 * Precies 32 tekens, dus 5 bits per teken -- 60 bits over de twaalf tekens.
 */
const ALFABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const BLOKLENGTE = 4;
const AANTAL_BLOKKEN = 3;

export function genereerWachtwoord(): string {
  const blokken = Array.from({ length: AANTAL_BLOKKEN }, () =>
    Array.from({ length: BLOKLENGTE }, () => ALFABET[randomInt(ALFABET.length)]).join('')
  );
  return blokken.join('-');
}
