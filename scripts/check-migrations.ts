import fs from 'node:fs';
import { berekenOpenstaand, sorteerMigraties } from './lib/migrations';
import { MIGRATIONS_DIR } from './lib/ledger';

export interface EndpointAntwoord {
  status: number;
  body: { applied?: string[]; bootstrap?: boolean } | null;
}

export interface Oordeel {
  ok: boolean;
  exitCode: number;
  regels: string[];
}

// Pure: no fetch, no filesystem, no process.exit -- so every branch is unit-testable.
export function beoordeelMigratieStatus(
  repoFilenames: string[],
  antwoord: EndpointAntwoord,
  omgeving: string
): Oordeel {
  if (antwoord.status === 404) {
    return {
      ok: true,
      exitCode: 0,
      regels: [
        `::warning::/api/health/schema bestaat nog niet op ${omgeving} -- dit is de eerste deploy met de migratiecontrole. Vanaf de volgende deploy blokkeert deze stap wel.`,
      ],
    };
  }
  if (antwoord.status !== 200 || !antwoord.body) {
    return {
      ok: false,
      exitCode: 1,
      regels: [`::error::/api/health/schema op ${omgeving} gaf status ${antwoord.status}.`],
    };
  }
  if (antwoord.body.bootstrap) {
    return {
      ok: false,
      exitCode: 1,
      regels: [
        `::error::De tabel schema_migrations bestaat nog niet op ${omgeving}. Draai eerst de baseline: npm run db:migrate -- ${omgeving} --mark-applied <bestandsnaam> voor elk bestand in ${MIGRATIONS_DIR}/.`,
      ],
    };
  }

  if (!Array.isArray(antwoord.body.applied)) {
    return {
      ok: false,
      exitCode: 1,
      regels: [
        `::error::/api/health/schema op ${omgeving} gaf een onverwacht antwoord: 'applied' ontbreekt of is geen lijst.`,
      ],
    };
  }

  const openstaand = berekenOpenstaand(repoFilenames, antwoord.body.applied);
  if (openstaand.length === 0) {
    return {
      ok: true,
      exitCode: 0,
      regels: [`Alle ${repoFilenames.length} migraties zijn toegepast op ${omgeving}.`],
    };
  }

  const commando =
    omgeving === 'productie'
      ? 'npm run db:migrate -- productie --confirm'
      : `npm run db:migrate -- ${omgeving}`;
  return {
    ok: false,
    exitCode: 1,
    regels: [
      `::error::${openstaand.length} migratie(s) nog niet toegepast op ${omgeving}:`,
      ...openstaand.map((filename) => `  - ${filename}`),
      `Draai eerst: ${commando}`,
    ],
  };
}

async function main(): Promise<void> {
  const [baseUrl, omgeving] = process.argv.slice(2);
  if (!baseUrl || !omgeving) {
    console.error('Gebruik: tsx scripts/check-migrations.ts <base-url> <staging|productie>');
    process.exit(2);
  }

  const url = `${baseUrl.replace(/\/$/, '')}/api/health/schema`;
  const repo = sorteerMigraties(fs.readdirSync(MIGRATIONS_DIR));

  let antwoord: EndpointAntwoord;
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    const body = response.status === 200 ? await response.json() : null;
    antwoord = { status: response.status, body };
  } catch (error) {
    console.error(`::error::Kan ${url} niet bereiken: ${(error as Error).message}`);
    process.exit(1);
  }

  const oordeel = beoordeelMigratieStatus(repo, antwoord, omgeving);
  for (const regel of oordeel.regels) {
    if (oordeel.ok) console.log(regel);
    else console.error(regel);
  }
  process.exit(oordeel.exitCode);
}

// Only run the CLI when executed directly, so the test can import the pure function.
if (process.argv[1]?.endsWith('check-migrations.ts')) {
  main().catch((error: Error) => {
    console.error(`::error::Onverwachte fout in de migratiecontrole: ${error.message}`);
    process.exit(1);
  });
}
