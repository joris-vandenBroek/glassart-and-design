import { verbind } from './lib/env';

// Tests scope their own afterEach/finally cleanup to exactly the rows they created (see
// CLAUDE.md's hard rule on test cleanup), which works as long as the test process runs to
// completion. It provides no guarantee against the process itself being interrupted mid-run
// (a killed background task, a closed terminal, a session cut off) -- whatever that run had
// already inserted stays behind forever, since the in-memory cleanup tracking dies with the
// process. This script is the second layer: a marker-based sweep that finds and removes such
// orphans regardless of which test created them or why its own cleanup never ran. Safe by
// construction because it only ever matches the same explicit test markers the tests
// themselves use (an `@example.com` email, or an `AT-`-prefixed id) -- never a blanket
// table-wide delete. Run on demand after noticing stray "AT-"/example.com rows in beheer;
// there is no scheduled trigger for it.
const MARKER = "email LIKE '%@example.com' OR klantnr LIKE 'AT-%'";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const target = args.find((arg) => !arg.startsWith('--')) ?? 'staging';
  const confirm = args.includes('--confirm');
  const dryRun = args.includes('--dry-run');

  if (target === 'productie' && !confirm) {
    console.error('Weigering: opruimen op productie vereist expliciet --confirm.');
    process.exit(1);
  }

  const { connection, database } = await verbind(target);
  try {
    console.log(`Omgeving: ${target} (${database})${dryRun ? ' -- dry run, er wordt niets verwijderd' : ''}\n`);

    const [orphanKlanten] = await connection.query(
      `SELECT klantnr, companyName, email FROM klanten WHERE ${MARKER}`
    );
    const rows = orphanKlanten as Array<{ klantnr: string | null; companyName: string | null; email: string }>;

    if (rows.length === 0) {
      console.log('Geen achtergebleven testklanten gevonden.');
      return;
    }

    console.log(`${rows.length} achtergebleven testklant(en) gevonden:`);
    console.table(rows);

    if (dryRun) {
      console.log('\nDry run: niets verwijderd. Draai zonder --dry-run om op te ruimen.');
      return;
    }

    const [sessionsResult] = await connection.query(
      `DELETE FROM sessions WHERE userId IN (SELECT id FROM klanten WHERE ${MARKER})`
    );
    const [bestelheadersResult] = await connection.query(
      `DELETE FROM bestelheaders WHERE klantnr IN (SELECT klantnr FROM klanten WHERE ${MARKER})`
    );
    const [klantenResult] = await connection.query(`DELETE FROM klanten WHERE ${MARKER}`);

    console.log('\nVerwijderd:');
    console.log('  sessions:', (sessionsResult as { affectedRows: number }).affectedRows);
    console.log('  bestelheaders:', (bestelheadersResult as { affectedRows: number }).affectedRows);
    console.log('  klanten:', (klantenResult as { affectedRows: number }).affectedRows);
  } finally {
    await connection.end();
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
