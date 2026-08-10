export type Omgeving = 'staging' | 'productie';

const BASE_URLS: Record<Omgeving, string> = {
  staging: 'https://staging.glassartanddesign.com',
  productie: 'https://glassartanddesign.com',
};

export function baseUrlVoorOmgeving(target: Omgeving): string {
  return BASE_URLS[target];
}

export function leesImportCredentials(env: Record<string, string>): {
  email: string;
  wachtwoord: string;
} {
  const email = env.IMPORT_MEDEWERKER_EMAIL;
  if (!email) {
    throw new Error('IMPORT_MEDEWERKER_EMAIL ontbreekt in het env-bestand van deze omgeving.');
  }
  const wachtwoord = env.IMPORT_MEDEWERKER_PASSWORD;
  if (!wachtwoord) {
    throw new Error('IMPORT_MEDEWERKER_PASSWORD ontbreekt in het env-bestand van deze omgeving.');
  }
  return { email, wachtwoord };
}
