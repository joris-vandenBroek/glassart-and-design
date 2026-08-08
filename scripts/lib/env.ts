import fs from 'node:fs';
import mysql, { type Connection } from 'mysql2/promise';

// There is no local database: `staging` is the shared development/test database and
// `productie` is live. Both env files are gitignored via the .env*.local pattern.
const ENV_FILES: Record<string, string> = {
  staging: '.env.local',
  productie: '.env.production.local',
};

export function beschikbareOmgevingen(): string[] {
  return Object.keys(ENV_FILES);
}

// Deliberately does NOT fall back to process.env: a typo in the target must fail loudly
// rather than silently connecting to whatever the shell happened to have exported.
export function leesOmgeving(target: string): Record<string, string> {
  const file = ENV_FILES[target];
  if (!file) {
    throw new Error(
      `Onbekende omgeving '${target}'. Kies uit: ${beschikbareOmgevingen().join(', ')}.`
    );
  }
  if (!fs.existsSync(file)) {
    throw new Error(`${file} ontbreekt -- nodig voor omgeving '${target}'.`);
  }
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

export async function verbind(
  target: string
): Promise<{ connection: Connection; database: string }> {
  const env = leesOmgeving(target);
  const connection = await mysql.createConnection({
    host: env.DB_HOST,
    port: Number(env.DB_PORT ?? 3306),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  });
  return { connection, database: env.DB_NAME };
}
