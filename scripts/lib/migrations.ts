// Pure helpers for the schema-migration ledger: no I/O, no database, no process.exit,
// so every branch is unit-testable. See
// docs/superpowers/specs/2026-08-08-schema-drift-guard-design.md.

// `YYYY-MM-DD-<slug>.sql`. The date prefix is what makes alphabetical order equal
// chronological order -- every caller in this feature depends on that.
export const MIGRATION_FILENAME_PATTERN = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.sql$/;

export function isMigrationFilename(name: string): boolean {
  return MIGRATION_FILENAME_PATTERN.test(name);
}

export function sorteerMigraties(filenames: string[]): string[] {
  return filenames.filter(isMigrationFilename).sort();
}

// sorteerMigraties silently drops anything not matching the pattern, which would make a
// misnamed migration invisible to the runner and to the CI gate alike -- a green deploy
// with an unapplied migration. Callers use this to refuse rather than skip. Non-.sql files
// (a README, say) are legitimately ignored; a .sql file that does not match is not.
export function vindOngeldigeMigratienamen(filenames: string[]): string[] {
  return filenames.filter((name) => name.endsWith('.sql') && !isMigrationFilename(name)).sort();
}

// Migrations present in the repo but not recorded in the database ledger. Extra entries
// in `applied` are deliberately NOT reported: that happens legitimately when rolling back
// to an older vN tag, and while a feature branch's migration has run on staging but has
// not merged to master yet.
export function berekenOpenstaand(
  repoFilenames: string[],
  appliedFilenames: string[]
): string[] {
  const applied = new Set(appliedFilenames);
  return sorteerMigraties(repoFilenames).filter((filename) => !applied.has(filename));
}

// mysql2 runs one statement per query() call unless multipleStatements is enabled, which
// this project does not enable. Splitting here keeps that off (it widens SQL-injection
// blast radius elsewhere) and lets the runner name the exact statement that failed.
//
// Known limitation: this splits on every `;`, so a migration must not contain a semicolon
// inside a string literal. None of the existing migrations do. If one ever needs to, run
// that statement by hand and record the file with --mark-applied.
export function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}
