import { leesOmgeving } from './lib/env';
import { baseUrlVoorOmgeving, leesImportCredentials, type Omgeving } from './lib/importOmgeving';
import {
  bepaalVolgendeCode,
  kiesMatendeMaten,
  bepaalFormaatVanBestand,
  parseArgs,
} from './lib/importKunstwerken';
import {
  logIn,
  haalReferentieOp,
  uploadFoto,
  maakOfHergebruikLookupWaarde,
  maakKunstwerk,
  downloadBestand,
  maakKunstenaar,
  type NieuwKunstwerk,
  type NieuweKunstenaar,
} from './lib/importHttp';
import { leesManifest } from './lib/importBatchManifest';
import type { KunstwerkFormaat } from '../src/components/beheer/materiaalTypes';

const SUBCOMMANDS = [
  'login',
  'analyseer-foto',
  'kies-maten',
  'volgende-code',
  'dump-referentie',
  'upload-foto',
  'maak-lookup-waarde',
  'maak-kunstwerk',
  'valideer-manifest',
  'download-bestand',
  'maak-kunstenaar',
] as const;

function gebruik(): never {
  console.error('Gebruik: tsx scripts/import-kunstwerken-cli.ts <subcommando> [opties]');
  console.error(`Subcommando's: ${SUBCOMMANDS.join(', ')}`);
  process.exit(2);
}

function verplichteOptie(opts: Record<string, string>, naam: string): string {
  const waarde = opts[naam];
  if (!waarde) {
    console.error(`Weigering: --${naam} is verplicht voor dit subcommando.`);
    process.exit(2);
  }
  return waarde;
}

function omgevingOptie(opts: Record<string, string>): Omgeving {
  const waarde = verplichteOptie(opts, 'omgeving');
  if (waarde !== 'staging' && waarde !== 'productie') {
    console.error(`Weigering: --omgeving moet 'staging' of 'productie' zijn, kreeg '${waarde}'.`);
    process.exit(2);
  }
  return waarde;
}

async function main(): Promise<void> {
  const { subcommand, opts } = parseArgs(process.argv.slice(2));
  if (!SUBCOMMANDS.includes(subcommand as (typeof SUBCOMMANDS)[number])) {
    gebruik();
  }

  switch (subcommand) {
    case 'login': {
      const omgeving = omgevingOptie(opts);
      const baseUrl = baseUrlVoorOmgeving(omgeving);
      const env = leesOmgeving(omgeving);
      const { email, wachtwoord } = leesImportCredentials(env);
      const cookie = await logIn(baseUrl, email, wachtwoord);
      console.log(cookie);
      return;
    }
    case 'analyseer-foto': {
      const pad = verplichteOptie(opts, 'pad');
      console.log(JSON.stringify(await bepaalFormaatVanBestand(pad)));
      return;
    }
    case 'kies-maten': {
      const formaat = verplichteOptie(opts, 'formaat');
      if (!['staand', 'liggend', 'vierkant', 'alle'].includes(formaat)) {
        console.error(`Weigering: --formaat moet staand, liggend, vierkant of alle zijn, kreeg '${formaat}'.`);
        process.exit(2);
      }
      const maten = JSON.parse(verplichteOptie(opts, 'maten-json')) as Array<{
        id: string;
        breedte: number;
        hoogte: number;
      }>;
      console.log(JSON.stringify(kiesMatendeMaten(maten, formaat as KunstwerkFormaat)));
      return;
    }
    case 'volgende-code': {
      const prefix = verplichteOptie(opts, 'prefix');
      const bestaandeCodes = JSON.parse(verplichteOptie(opts, 'bestaande-codes-json')) as string[];
      console.log(bepaalVolgendeCode(bestaandeCodes, prefix));
      return;
    }
    case 'dump-referentie': {
      const omgeving = omgevingOptie(opts);
      const sessieCookie = verplichteOptie(opts, 'sessie-cookie');
      console.log(JSON.stringify(await haalReferentieOp(baseUrlVoorOmgeving(omgeving), sessieCookie)));
      return;
    }
    case 'upload-foto': {
      const omgeving = omgevingOptie(opts);
      const sessieCookie = verplichteOptie(opts, 'sessie-cookie');
      const pad = verplichteOptie(opts, 'pad');
      const url = await uploadFoto(baseUrlVoorOmgeving(omgeving), sessieCookie, pad);
      console.log(JSON.stringify({ url }));
      return;
    }
    case 'maak-lookup-waarde': {
      const omgeving = omgevingOptie(opts);
      const sessieCookie = verplichteOptie(opts, 'sessie-cookie');
      const tabel = verplichteOptie(opts, 'tabel');
      if (tabel !== 'segmenten' && tabel !== 'stijlen' && tabel !== 'onderwerpen') {
        console.error(`Weigering: --tabel moet segmenten, stijlen of onderwerpen zijn, kreeg '${tabel}'.`);
        process.exit(2);
      }
      const omschrijving = verplichteOptie(opts, 'omschrijving');
      const resultaat = await maakOfHergebruikLookupWaarde(
        baseUrlVoorOmgeving(omgeving),
        sessieCookie,
        tabel,
        omschrijving
      );
      console.log(JSON.stringify(resultaat));
      return;
    }
    case 'maak-kunstwerk': {
      const omgeving = omgevingOptie(opts);
      const sessieCookie = verplichteOptie(opts, 'sessie-cookie');
      const kunstwerk = JSON.parse(verplichteOptie(opts, 'json')) as NieuwKunstwerk;
      const resultaat = await maakKunstwerk(baseUrlVoorOmgeving(omgeving), sessieCookie, kunstwerk);
      console.log(JSON.stringify(resultaat));
      return;
    }
    case 'download-bestand': {
      const url = verplichteOptie(opts, 'url');
      const naar = verplichteOptie(opts, 'naar');
      await downloadBestand(url, naar);
      console.log(`OK -- geschreven naar ${naar}`);
      return;
    }
    case 'maak-kunstenaar': {
      const omgeving = omgevingOptie(opts);
      const sessieCookie = verplichteOptie(opts, 'sessie-cookie');
      const kunstenaar = JSON.parse(verplichteOptie(opts, 'json')) as NieuweKunstenaar;
      const resultaat = await maakKunstenaar(baseUrlVoorOmgeving(omgeving), sessieCookie, kunstenaar);
      console.log(JSON.stringify(resultaat));
      return;
    }
    case 'valideer-manifest': {
      const pad = verplichteOptie(opts, 'pad');
      const manifest = leesManifest(pad);
      console.log(`OK -- ${manifest.kunstwerken.length} kunstwerk(en) in manifest.`);
      return;
    }
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
