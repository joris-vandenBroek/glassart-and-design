import { describe, expect, it } from 'vitest';
import {
  berekenOpenstaand,
  isMigrationFilename,
  sorteerMigraties,
  splitStatements,
  vindOngeldigeMigratienamen,
} from '../../scripts/lib/migrations';

describe('isMigrationFilename', () => {
  it('accepts a real migration filename', () => {
    expect(isMigrationFilename('2026-08-07-zendingnummer.sql')).toBe(true);
  });

  it('rejects anything without the date prefix or the .sql suffix', () => {
    expect(isMigrationFilename('zendingnummer.sql')).toBe(false);
    expect(isMigrationFilename('2026-08-07-zendingnummer.txt')).toBe(false);
    expect(isMigrationFilename('README.md')).toBe(false);
  });
});

describe('sorteerMigraties', () => {
  it('sorts chronologically and drops non-migration files', () => {
    expect(
      sorteerMigraties(['2026-08-07-b.sql', 'README.md', '2026-07-30-a.sql'])
    ).toEqual(['2026-07-30-a.sql', '2026-08-07-b.sql']);
  });
});

describe('berekenOpenstaand', () => {
  const repo = ['2026-07-30-a.sql', '2026-08-05-b.sql', '2026-08-07-c.sql'];

  it('returns nothing when everything is applied', () => {
    expect(berekenOpenstaand(repo, repo)).toEqual([]);
  });

  it('returns the missing ones, in chronological order', () => {
    expect(berekenOpenstaand(repo, ['2026-08-05-b.sql'])).toEqual([
      '2026-07-30-a.sql',
      '2026-08-07-c.sql',
    ]);
  });

  it('returns everything when the ledger is empty', () => {
    expect(berekenOpenstaand(repo, [])).toEqual(repo);
  });

  // A rollback to an older tag, or a feature branch whose migration already ran on
  // staging before it merged, both leave the database ahead of the repo. Neither is a
  // reason to block a deploy.
  it('ignores migrations applied in the database but absent from the repo', () => {
    expect(berekenOpenstaand(repo, [...repo, '2026-09-01-toekomst.sql'])).toEqual([]);
  });
});

describe('vindOngeldigeMigratienamen', () => {
  it('returns nothing for a list of only valid migration filenames', () => {
    expect(
      vindOngeldigeMigratienamen(['2026-07-30-a.sql', '2026-08-07-b.sql'])
    ).toEqual([]);
  });

  it('reports a filename with a single-digit month', () => {
    expect(vindOngeldigeMigratienamen(['2026-8-8-foo.sql'])).toEqual([
      '2026-8-8-foo.sql',
    ]);
  });

  it('reports a filename with an uppercase slug', () => {
    expect(vindOngeldigeMigratienamen(['2026-08-08-Foo.sql'])).toEqual([
      '2026-08-08-Foo.sql',
    ]);
  });

  it('does not report a non-.sql file', () => {
    expect(vindOngeldigeMigratienamen(['README.md'])).toEqual([]);
  });
});

describe('splitStatements', () => {
  it('strips comment lines and splits on semicolons', () => {
    const sql = [
      '-- Migration for something (2026-08-07)',
      '-- second comment line',
      'ALTER TABLE a ADD COLUMN x VARCHAR(20);',
      '',
      "INSERT INTO counters (id, value) VALUES ('x', 0);",
    ].join('\n');
    expect(splitStatements(sql)).toEqual([
      'ALTER TABLE a ADD COLUMN x VARCHAR(20)',
      "INSERT INTO counters (id, value) VALUES ('x', 0)",
    ]);
  });

  it('keeps a statement that spans several lines together', () => {
    const sql = 'CREATE TABLE t (\n  id CHAR(36) PRIMARY KEY,\n  naam VARCHAR(10)\n);';
    expect(splitStatements(sql)).toEqual([
      'CREATE TABLE t (\n  id CHAR(36) PRIMARY KEY,\n  naam VARCHAR(10)\n)',
    ]);
  });

  it('returns an empty list for a comment-only file', () => {
    expect(splitStatements('-- nothing to do\n')).toEqual([]);
  });
});
