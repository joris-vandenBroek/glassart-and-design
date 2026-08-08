import { verbind } from './lib/env';

// Diagnostic, not a gate: a column present in staging but not in production is expected
// while a feature branch is in flight. The ledger comparison in check-migrations.ts is the
// only thing that fails a build. This catches the case the ledger cannot see -- a column
// added by hand that belongs to no migration file at all.
async function snapshot(target: string) {
  const { connection, database } = await verbind(target);
  try {
    const [columns] = await connection.query(
      'SELECT TABLE_NAME t, COLUMN_NAME col FROM information_schema.columns WHERE TABLE_SCHEMA = ?',
      [database]
    );
    const perTabel = new Map<string, Set<string>>();
    for (const row of columns as Array<{ t: string; col: string }>) {
      if (!perTabel.has(row.t)) perTabel.set(row.t, new Set());
      perTabel.get(row.t)!.add(row.col);
    }
    const [counters] = await connection.query('SELECT id FROM counters');
    return {
      database,
      perTabel,
      counters: (counters as Array<{ id: string }>).map((row) => row.id).sort(),
    };
  } finally {
    // Close on every path -- including a failed query -- so a thrown error never leaks
    // the connection. This repo has previously exhausted its MySQL connection grant.
    await connection.end();
  }
}

async function main(): Promise<void> {
  const [a, b] = process.argv.slice(2);
  if (!a || !b) {
    console.error('Gebruik: npm run db:diff -- <omgevingA> <omgevingB>');
    process.exit(2);
  }

  const linker = await snapshot(a);
  const rechter = await snapshot(b);
  console.log(`${a} = ${linker.database}   ${b} = ${rechter.database}\n`);

  const tabellen = [...new Set([...linker.perTabel.keys(), ...rechter.perTabel.keys()])].sort();
  let verschillen = 0;
  for (const tabel of tabellen) {
    const links = linker.perTabel.get(tabel);
    const rechts = rechter.perTabel.get(tabel);
    if (!rechts) {
      console.log(`TABEL ontbreekt in ${b}: ${tabel}`);
      verschillen++;
      continue;
    }
    if (!links) {
      console.log(`TABEL ontbreekt in ${a}: ${tabel}`);
      verschillen++;
      continue;
    }
    const alleenLinks = [...links].filter((col) => !rechts.has(col));
    const alleenRechts = [...rechts].filter((col) => !links.has(col));
    if (alleenLinks.length || alleenRechts.length) {
      verschillen++;
      console.log(
        `${tabel}: alleen in ${a} [${alleenLinks.join(', ') || '-'}] | alleen in ${b} [${alleenRechts.join(', ') || '-'}]`
      );
    }
  }

  console.log(verschillen === 0 ? '\nGeen kolomverschillen.' : `\n${verschillen} tabel(len) met verschil.`);
  if (JSON.stringify(linker.counters) !== JSON.stringify(rechter.counters)) {
    console.log(`counters ${a}: ${linker.counters.join(', ')}`);
    console.log(`counters ${b}: ${rechter.counters.join(', ')}`);
  } else {
    console.log(`counters gelijk: ${linker.counters.join(', ')}`);
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
