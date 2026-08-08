import fs from 'node:fs';
import path from 'node:path';
import type { Connection } from 'mysql2/promise';
import { splitStatements } from './migrations';
import { noteerToegepast } from './ledger';

export interface Mislukking {
  filename: string;
  index: number;
  statement: string;
  message: string;
}

export interface ToepasResultaat {
  toegepast: string[];
  mislukt: Mislukking | null;
}

// Applies the given migrations in the order supplied. Returns a result instead of calling
// process.exit so the caller (CLI) owns presentation and exit codes, and so this loop --
// the only code in the feature that runs DDL against production -- is testable directly.
//
// MySQL has no transactional DDL: an ALTER implicitly commits, so a file that fails halfway
// cannot be rolled back. On failure the runner stops immediately and does NOT record the
// file, leaving the database in a state a human must inspect. That is deliberate: a loud
// stop mid-file beats a silent "done" or a bogus rollback claim.
export async function pasMigratiesToe(
  connection: Connection,
  migrationsDir: string,
  openstaand: string[],
  log: (regel: string) => void
): Promise<ToepasResultaat> {
  const toegepast: string[] = [];

  for (const filename of openstaand) {
    const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
    const statements = splitStatements(sql);
    log(`\n${filename} (${statements.length} statements)`);

    for (const [index, statement] of statements.entries()) {
      try {
        await connection.query(statement);
        log(`  ${index + 1}/${statements.length} gelukt`);
      } catch (error) {
        return {
          toegepast,
          mislukt: { filename, index, statement, message: (error as Error).message },
        };
      }
    }

    await noteerToegepast(connection, filename);
    toegepast.push(filename);
    log('  genoteerd in schema_migrations');
  }

  return { toegepast, mislukt: null };
}
