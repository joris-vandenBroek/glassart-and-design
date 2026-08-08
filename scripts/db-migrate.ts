import fs from 'node:fs';
import {
  berekenOpenstaand,
  isMigrationFilename,
  sorteerMigraties,
  vindOngeldigeMigratienamen,
} from './lib/migrations';
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
  console.error('         (--mark-applied op productie vereist ook --confirm)');
  process.exit(2);
}

// Everything that can be rejected without touching the database is checked here, BEFORE a
// connection is opened. process.exit() skips pending finally blocks, so an exit from inside
// the try below would leak the connection -- this repo has exhausted its MySQL connection
// grant that way before. Inside the try, set process.exitCode and return instead.
function valideerArgumenten(): void {
  if (!subcommand || !target) gebruik();
  if (subcommand !== 'status' && subcommand !== 'apply') gebruik();

  // `--mark-applied` with no value would leave markFilename undefined, fall straight past
  // the mark branch, and silently run every outstanding migration instead of recording one.
  // Refuse rather than guess.
  if (markIndex !== -1 && !markFilename) {
    console.error('Weigering: --mark-applied vereist een bestandsnaam.');
    process.exit(2);
  }

  // The standing rule in CLAUDE.md: every production database change needs explicit
  // permission. --confirm is the mechanical half of that; asking the user is the other.
  // This covers --mark-applied too, deliberately: recording a migration that never ran is
  // the most dangerous write of all, because it makes the deploy gate report production
  // healthy while the column is actually missing -- the exact failure this feature exists
  // to prevent.
  if (subcommand === 'apply' && target === 'productie' && !confirm) {
    console.error('Weigering: `apply` op productie vereist expliciet --confirm.');
    process.exit(2);
  }
}

async function main(): Promise<void> {
  valideerArgumenten();

  const { connection, database } = await verbind(target);
  try {
    await zorgVoorLedger(connection);
    const bestanden = fs.readdirSync(MIGRATIONS_DIR);
    const ongeldig = vindOngeldigeMigratienamen(bestanden);
    if (ongeldig.length > 0) {
      console.warn(
        `Let op: ${ongeldig.length} bestand(en) in ${MIGRATIONS_DIR}/ voldoen niet aan het patroon jjjj-mm-dd-naam.sql en worden overgeslagen:`
      );
      for (const naam of ongeldig) console.warn(`  - ${naam}`);
    }
    const repo = sorteerMigraties(bestanden);
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
      console.error(
        'Let op: een nieuwe run begint dit bestand weer bij het eerste statement -- de al ' +
          'uitgevoerde statements zijn niet teruggedraaid en kunnen opnieuw falen.'
      );
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
