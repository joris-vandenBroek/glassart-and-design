import fs from 'node:fs';
import { berekenOpenstaand, sorteerMigraties } from './lib/migrations';
import { verbind } from './lib/env';
import { MIGRATIONS_DIR, leesToegepast, zorgVoorLedger } from './lib/ledger';

const [subcommand, target] = process.argv.slice(2);

function gebruik(): never {
  console.error('Gebruik: npm run db:status  -- <staging|productie>');
  console.error('         npm run db:migrate -- <staging|productie> [--confirm]');
  process.exit(2);
}

async function main(): Promise<void> {
  if (!subcommand || !target) gebruik();

  const { connection, database } = await verbind(target);
  try {
    await zorgVoorLedger(connection);
    const repo = sorteerMigraties(fs.readdirSync(MIGRATIONS_DIR));
    const toegepast = await leesToegepast(connection);
    const openstaand = berekenOpenstaand(repo, toegepast);

    if (subcommand === 'status') {
      console.log(`Database: ${database} (${target})`);
      console.log(`Toegepast: ${toegepast.length}`);
      console.log(`Openstaand: ${openstaand.length}`);
      for (const filename of openstaand) console.log(`  - ${filename}`);
      process.exitCode = openstaand.length > 0 ? 1 : 0;
      return;
    }

    gebruik();
  } finally {
    await connection.end();
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
