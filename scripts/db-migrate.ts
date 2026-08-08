import fs from 'node:fs';
import { berekenOpenstaand, isMigrationFilename, sorteerMigraties } from './lib/migrations';
import { verbind } from './lib/env';
import { MIGRATIONS_DIR, leesToegepast, noteerToegepast, zorgVoorLedger } from './lib/ledger';
import { pasMigratiesToe } from './lib/apply';

const args = process.argv.slice(2);
const [subcommand, target] = args;
const confirm = args.includes('--confirm');
const markIndex = args.indexOf('--mark-applied');
const markFilename = markIndex === -1 ? null : args[markIndex + 1];

function gebruik(): never {
  console.error('Gebruik: npm run db:status  -- <staging|productie>');
  console.error('         npm run db:migrate -- <staging|productie> [--confirm]');
  console.error('         npm run db:migrate -- <staging|productie> --mark-applied <bestandsnaam>');
  process.exit(2);
}

// Everything that can be rejected without touching the database is checked here, BEFORE a
// connection is opened. process.exit() skips pending finally blocks, so an exit from inside
// the try below would leak the connection -- this repo has exhausted its MySQL connection
// grant that way before. Inside the try, set process.exitCode and return instead.
function valideerArgumenten(): void {
  if (!subcommand || !target) gebruik();
  if (subcommand !== 'status' && subcommand !== 'apply') gebruik();

  // The standing rule in CLAUDE.md: every production database change needs explicit
  // permission. --confirm is the mechanical half of that; asking the user is the other.
  if (subcommand === 'apply' && target === 'productie' && !confirm && !markFilename) {
    console.error('Weigering: `apply` op productie vereist expliciet --confirm.');
    process.exit(2);
  }
}

async function main(): Promise<void> {
  valideerArgumenten();

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

    // Records a migration without running it, for migrations applied before the ledger
    // existed or before their branch merged. Restricted to filenames that actually exist
    // in db/migrations/, so it cannot invent history.
    if (markFilename) {
      if (!isMigrationFilename(markFilename) || !repo.includes(markFilename)) {
        console.error(`'${markFilename}' staat niet in ${MIGRATIONS_DIR}/ -- weigering.`);
        process.exitCode = 2;
        return;
      }
      await noteerToegepast(connection, markFilename);
      console.log(`Genoteerd als toegepast (niet uitgevoerd): ${markFilename}`);
      return;
    }

    if (openstaand.length === 0) {
      console.log(`Niets te doen -- ${database} is bij.`);
      return;
    }

    const resultaat = await pasMigratiesToe(connection, MIGRATIONS_DIR, openstaand, (regel) =>
      console.log(regel)
    );

    if (resultaat.mislukt) {
      const { filename, index, statement, message } = resultaat.mislukt;
      console.error(`  statement ${index + 1} MISLUKT: ${message}`);
      console.error(`  Statement: ${statement}`);
      console.error(
        `\n${filename} is GEDEELTELIJK toegepast en is NIET genoteerd in schema_migrations.`
      );
      console.error('Controleer de database met de hand voordat je opnieuw draait.');
      process.exitCode = 1;
      return;
    }

    console.log(`\n${resultaat.toegepast.length} migratie(s) toegepast op ${database}.`);
  } finally {
    await connection.end();
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
