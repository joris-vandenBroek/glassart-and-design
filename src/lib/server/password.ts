import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { MINIMALE_WACHTWOORDLENGTE } from '@/lib/wachtwoordBeleid';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

export { MINIMALE_WACHTWOORDLENGTE };

/**
 * De enige plek waar het wachtwoordbeleid staat. Registratie controleerde eerder
 * helemaal niets (een lege string werd gewoon gehasht), het resetformulier alleen
 * client-side, en /api/klanten/me als enige wél server-side -- drie verschillende
 * antwoorden op dezelfde vraag.
 */
export function valideerWachtwoord(wachtwoord: unknown): 'ok' | 'ontbreekt' | 'te-kort' {
  if (typeof wachtwoord !== 'string' || wachtwoord === '') return 'ontbreekt';
  if (wachtwoord.length < MINIMALE_WACHTWOORDLENGTE) return 'te-kort';
  return 'ok';
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(':');
  if (!salt || !hashHex) return false;
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  const storedKey = Buffer.from(hashHex, 'hex');
  if (derivedKey.length !== storedKey.length) return false;
  return timingSafeEqual(derivedKey, storedKey);
}
