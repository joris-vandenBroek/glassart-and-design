# Import-kunstwerken skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een `import-kunstwerken` Claude Code skill plus een ondersteunend CLI-script waarmee kunstwerken in bulk vanaf een lokale map met afbeeldingen naar staging of productie geïmporteerd worden — met automatische codebepaling, formaat/maten-afleiding, segment/stijl/onderwerp-koppeling (hergebruik-eerst) en 4-talige omschrijvingen, plus een batch-manifest zodat een staging-run zonder herhaling naar productie doorgezet kan worden.

**Architecture:** Twee lagen. `scripts/lib/*.ts` bevat alle testbare logica: zuivere beslisfuncties (code-volgnummer, maten-matching, mimetype, lookup-matching, manifest-validatie) en een dunne HTTP-laag (inloggen, referentiedata ophalen, foto uploaden, kunstwerk/lookup-waarde aanmaken) die tegen de REST API van de echte staging/productie-app praat. `scripts/import-kunstwerken-cli.ts` is een dun CLI-entrypoint (naar het patroon van `scripts/db-migrate.ts`) dat deze functies als losse subcommando's ontsluit. `.claude/skills/import-kunstwerken/SKILL.md` is de agent-procedure die deze subcommando's per afbeelding aanroept en zelf de visuele beoordeling (segment/stijl/onderwerp/omschrijving) doet.

**Tech Stack:** Node.js/TypeScript via `tsx` (geen Next.js-build nodig voor dit script), `image-size` voor beeldafmetingen, Vitest voor de testlaag (mocked `fetch` voor de HTTP-functies, echte bestanden voor de logica die met bestanden werkt), Claude Code skills (`.claude/skills/`).

Ontwerp: [`docs/superpowers/specs/2026-08-10-import-kunstwerken-skill-design.md`](../specs/2026-08-10-import-kunstwerken-skill-design.md).

## Global Constraints

- **Harde afhankelijkheid: `kunstenaars.kunstenaarnr` moet bestaan op de doelomgeving vóórdat een echte, levende run mogelijk is.** Die kolom bestaat op het moment van schrijven nog niet — het bijbehorende ontwerp/plan wordt in een aparte sessie uitgevoerd. Deze plan bouwt de code er wél al tegen (per ontwerpbeslissing), maar **geen enkele test in dit plan raakt een echte database of een echte deployed app** — alle HTTP-functies worden getest met gemockte `fetch` (`vi.stubGlobal('fetch', ...)`, zie `tests/app/api/upload.test.ts` voor het bestaande patroon), en de CLI-argumentvalidatie wordt getest via `spawnSync` op refusal-paden die nooit een netwerkaanroep bereiken (zie `tests/scripts/db-migrate-cli.test.ts`). Dat betekent: alle taken in dit plan zijn nu al volledig te bouwen en te testen, ook al kan een levende run pas na het andere werk.
- **Geen lokale database voor dit onderdeel** — deze feature praat uitsluitend HTTP met de REST API van de gedeployde apps (`https://staging.glassartanddesign.com`, `https://glassartanddesign.com`), nooit rechtstreeks met MySQL.
- **`scripts/`-bestanden gebruiken alleen relatieve imports**, nooit de `@/`-alias — dat is het bestaande patroon in `scripts/db-migrate.ts` e.a., en voorkomt dat we moeten uitzoeken of `tsx` de tsconfig-alias oppikt.
- **Credentials nooit hardcoded of gecommit.** `IMPORT_MEDEWERKER_EMAIL`/`IMPORT_MEDEWERKER_PASSWORD` horen in `.env.local` (staging) / `.env.production.local` (productie), beide al gitignored via het bestaande `.env*.local`-patroon. Dit plan voegt de sleutels toe aan `.env.local.example` ter documentatie, maar vult nergens een echte waarde in.
- **`npx tsc --noEmit` moet na elke taak exit 0 geven.**
- **Nieuwe dependency:** `image-size@^2.0.2` (`npm install image-size@^2.0.2`), toegevoegd in Taak 2. Geverifieerde API: `import { imageSizeFromFile } from 'image-size/fromFile'; const { width, height } = await imageSizeFromFile(pad);`.
- **`.gitignore` blokkeert momenteel de hele `.claude/`-map.** Taak 6 voegt een uitzondering toe zodat `.claude/skills/` wél getrackt wordt (de skill moet gedeeld/bewaard blijven), terwijl de rest van `.claude/` en de manifest-`runs/`-submap genegeerd blijven.
- Regelnummers in dit plan zijn van 2026-08-10; zoek bij twijfel op de genoemde symboolnaam.

---

### Task 1: Omgeving-configuratie voor de import-CLI

Basiswaarden die alle latere taken nodig hebben: welke base-URL bij welke omgeving hoort, en hoe de medewerker-credentials uit een al-ingelezen env-object gehaald worden. Puur, geen bestandstoegang — het inlezen van het echte env-bestand blijft bij het bestaande `leesOmgeving` uit `scripts/lib/env.ts` (ongewijzigd, hergebruikt in Taak 4).

**Files:**
- Create: `scripts/lib/importOmgeving.ts`
- Test: `tests/scripts/importOmgeving.test.ts`
- Modify: `.env.local.example`

**Interfaces:**
- Produces: `type Omgeving = 'staging' | 'productie'`
- Produces: `baseUrlVoorOmgeving(target: Omgeving): string`
- Produces: `leesImportCredentials(env: Record<string, string>): { email: string; wachtwoord: string }`

- [ ] **Step 1: Schrijf de falende test**

`tests/scripts/importOmgeving.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { baseUrlVoorOmgeving, leesImportCredentials } from '../../scripts/lib/importOmgeving';

describe('baseUrlVoorOmgeving', () => {
  it('geeft de staging-URL voor staging', () => {
    expect(baseUrlVoorOmgeving('staging')).toBe('https://staging.glassartanddesign.com');
  });

  it('geeft de productie-URL voor productie', () => {
    expect(baseUrlVoorOmgeving('productie')).toBe('https://glassartanddesign.com');
  });
});

describe('leesImportCredentials', () => {
  it('haalt e-mail en wachtwoord uit het env-object', () => {
    const credentials = leesImportCredentials({
      IMPORT_MEDEWERKER_EMAIL: 'import@example.com',
      IMPORT_MEDEWERKER_PASSWORD: 'geheim',
    });
    expect(credentials).toEqual({ email: 'import@example.com', wachtwoord: 'geheim' });
  });

  it('gooit een duidelijke fout als IMPORT_MEDEWERKER_EMAIL ontbreekt', () => {
    expect(() => leesImportCredentials({ IMPORT_MEDEWERKER_PASSWORD: 'geheim' })).toThrow(
      'IMPORT_MEDEWERKER_EMAIL'
    );
  });

  it('gooit een duidelijke fout als IMPORT_MEDEWERKER_PASSWORD ontbreekt', () => {
    expect(() => leesImportCredentials({ IMPORT_MEDEWERKER_EMAIL: 'import@example.com' })).toThrow(
      'IMPORT_MEDEWERKER_PASSWORD'
    );
  });
});
```

- [ ] **Step 2: Draai de test om te zien dat hij faalt**

```bash
npx vitest run tests/scripts/importOmgeving.test.ts
```

Verwacht: FAIL — `scripts/lib/importOmgeving.ts` bestaat nog niet (module not found).

- [ ] **Step 3: Schrijf de implementatie**

`scripts/lib/importOmgeving.ts`:

```ts
export type Omgeving = 'staging' | 'productie';

const BASE_URLS: Record<Omgeving, string> = {
  staging: 'https://staging.glassartanddesign.com',
  productie: 'https://glassartanddesign.com',
};

export function baseUrlVoorOmgeving(target: Omgeving): string {
  return BASE_URLS[target];
}

export function leesImportCredentials(env: Record<string, string>): {
  email: string;
  wachtwoord: string;
} {
  const email = env.IMPORT_MEDEWERKER_EMAIL;
  if (!email) {
    throw new Error('IMPORT_MEDEWERKER_EMAIL ontbreekt in het env-bestand van deze omgeving.');
  }
  const wachtwoord = env.IMPORT_MEDEWERKER_PASSWORD;
  if (!wachtwoord) {
    throw new Error('IMPORT_MEDEWERKER_PASSWORD ontbreekt in het env-bestand van deze omgeving.');
  }
  return { email, wachtwoord };
}
```

- [ ] **Step 4: Draai de test om te zien dat hij slaagt**

```bash
npx vitest run tests/scripts/importOmgeving.test.ts
```

Verwacht: alle vier PASS.

- [ ] **Step 5: Documenteer de nieuwe env-variabelen**

Voeg toe aan `.env.local.example`, na het bestaande `UPLOAD_SECRET`-blok:

```
# Medewerkersaccount waarmee scripts/import-kunstwerken-cli.ts inlogt op /api/auth/medewerker-login.
# Op staging in .env.local, op productie in .env.production.local -- zelfde gitignored patroon
# als de rest van dit bestand. Geen echte waarde hier.
IMPORT_MEDEWERKER_EMAIL=changeme
IMPORT_MEDEWERKER_PASSWORD=changeme
```

- [ ] **Step 6: Typecheck en commit**

```bash
npx tsc --noEmit
git add scripts/lib/importOmgeving.ts tests/scripts/importOmgeving.test.ts .env.local.example
git commit -m "feat: omgeving-configuratie voor de import-kunstwerken CLI"
```

---

### Task 2: Zuivere beslislogica — code, maten, mimetype, lookup-matching, formaatdetectie

Alle logica die zonder netwerk werkt: het volgende kunstwerkcode-nummer, welke bestaande maten bij een formaat passen, het mimetype van een bestand, of een lookup-omschrijving al bestaat, en het uitlezen van een foto's afmetingen/formaat. Voegt ook de test-fixtures toe die Taak 4 hergebruikt.

**Files:**
- Create: `scripts/lib/importKunstwerken.ts`
- Create: `scripts/dev/genereer-test-fixture-fotos.mjs`
- Create (gegenereerd door bovenstaand script, zie Step 1): `tests/fixtures/images/staand-60x90.png`, `tests/fixtures/images/liggend-90x60.png`, `tests/fixtures/images/vierkant-70x70.png`
- Test: `tests/scripts/importKunstwerken.test.ts`
- Modify: `package.json`, `package-lock.json` (nieuwe dependency)

**Interfaces:**
- Consumes: `detectFormaatFromDimensions(width: number, height: number): KunstwerkFormaat` uit `src/lib/detectKunstwerkFormaat.ts` (bestaand, al getest in `tests/lib/detectKunstwerkFormaat.test.ts` — de ratio-grenzen worden hier dus niet opnieuw getest).
- Produces: `bepaalVolgendeCode(bestaandeCodes: string[], prefix: string): string`
- Produces: `kiesMatendeMaten(maten: Array<{ id: string; breedte: number; hoogte: number }>, formaat: KunstwerkFormaat): string[]`
- Produces: `mimeTypeVoorBestand(bestandsnaam: string): string`
- Produces: `vindExacteMatch<T extends { omschrijving: string }>(bestaande: T[], omschrijving: string): T | null`
- Produces: `bepaalFormaatVanBestand(bestandspad: string): Promise<{ breedte: number; hoogte: number; formaat: KunstwerkFormaat }>`
- Produces: `parseArgs(args: string[]): { subcommand: string; opts: Record<string, string> }`

- [ ] **Step 1: Installeer `image-size` en genereer de test-fixtures**

```bash
npm install image-size@2.0.2
```

`scripts/dev/genereer-test-fixture-fotos.mjs` (eenmalig hulpscript — bouwt drie minimale, geldige PNG's met bekende afmetingen op zonder externe bestanden, zodat `bepaalFormaatVanBestand` tegen echte bestanden getest kan worden in plaats van tegen een gemockte module):

```js
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUTDIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../tests/fixtures/images');

function crc32(buf) {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function maakPng(width, height, bestandsnaam) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      row[1 + x * 3] = 200;
      row[1 + x * 3 + 1] = 100;
      row[1 + x * 3 + 2] = 50;
    }
    rows.push(row);
  }
  const idat = zlib.deflateSync(Buffer.concat(rows));
  const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
  fs.mkdirSync(OUTDIR, { recursive: true });
  fs.writeFileSync(path.join(OUTDIR, bestandsnaam), png);
}

maakPng(60, 90, 'staand-60x90.png');
maakPng(90, 60, 'liggend-90x60.png');
maakPng(70, 70, 'vierkant-70x70.png');
console.log(`Fixtures geschreven naar ${OUTDIR}`);
```

Draai het:

```bash
node scripts/dev/genereer-test-fixture-fotos.mjs
```

Verwacht: `Fixtures geschreven naar .../tests/fixtures/images`, en drie `.png`-bestanden staan op die plek.

- [ ] **Step 2: Schrijf de falende test**

`tests/scripts/importKunstwerken.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  bepaalVolgendeCode,
  kiesMatendeMaten,
  mimeTypeVoorBestand,
  vindExacteMatch,
  bepaalFormaatVanBestand,
  parseArgs,
} from '../../scripts/lib/importKunstwerken';

describe('bepaalVolgendeCode', () => {
  it('begint bij 001 als er nog geen codes voor het prefix bestaan', () => {
    expect(bepaalVolgendeCode([], 'GLA-PRO')).toBe('GLA-PRO-001');
  });

  it('telt op vanaf de hoogste bestaande code', () => {
    expect(bepaalVolgendeCode(['GLA-PRO-001', 'GLA-PRO-002'], 'GLA-PRO')).toBe('GLA-PRO-003');
  });

  it('negeert codes van een andere collectie', () => {
    expect(bepaalVolgendeCode(['GLA-AFR-005', 'GLA-PRO-001'], 'GLA-PRO')).toBe('GLA-PRO-002');
  });

  it('houdt de bestaande cijferbreedte aan', () => {
    expect(bepaalVolgendeCode(['GLA-SAB-0007'], 'GLA-SAB')).toBe('GLA-SAB-0008');
  });

  it('werkt met een prefix die regex-speciale tekens bevat', () => {
    expect(bepaalVolgendeCode(['GLA-F1-001'], 'GLA-F1')).toBe('GLA-F1-002');
  });
});

describe('kiesMatendeMaten', () => {
  const maten = [
    { id: 'a', breedte: 60, hoogte: 90 }, // staand
    { id: 'b', breedte: 90, hoogte: 60 }, // liggend
    { id: 'c', breedte: 70, hoogte: 70 }, // vierkant
  ];

  it('kiest alleen staande maten bij formaat staand', () => {
    expect(kiesMatendeMaten(maten, 'staand')).toEqual(['a']);
  });

  it('kiest alleen liggende maten bij formaat liggend', () => {
    expect(kiesMatendeMaten(maten, 'liggend')).toEqual(['b']);
  });

  it('kiest alleen vierkante maten bij formaat vierkant', () => {
    expect(kiesMatendeMaten(maten, 'vierkant')).toEqual(['c']);
  });

  it('kiest alle maten bij formaat alle', () => {
    expect(kiesMatendeMaten(maten, 'alle')).toEqual(['a', 'b', 'c']);
  });
});

describe('mimeTypeVoorBestand', () => {
  it.each([
    ['foto.jpg', 'image/jpeg'],
    ['foto.JPEG', 'image/jpeg'],
    ['foto.png', 'image/png'],
    ['foto.webp', 'image/webp'],
  ])('%s -> %s', (bestandsnaam, verwacht) => {
    expect(mimeTypeVoorBestand(bestandsnaam)).toBe(verwacht);
  });

  it('gooit een fout bij een niet-ondersteunde extensie', () => {
    expect(() => mimeTypeVoorBestand('foto.gif')).toThrow('Niet-ondersteunde bestandsextensie');
  });
});

describe('vindExacteMatch', () => {
  const bestaande = [{ id: '1', omschrijving: 'Afrika' }];

  it('vindt een match ongeacht hoofdletters en spaties', () => {
    expect(vindExacteMatch(bestaande, '  afrika ')).toEqual(bestaande[0]);
  });

  it('geeft null als er niets past', () => {
    expect(vindExacteMatch(bestaande, 'Azië')).toBeNull();
  });
});

describe('bepaalFormaatVanBestand', () => {
  it('leest een staand bestand correct', async () => {
    const resultaat = await bepaalFormaatVanBestand('tests/fixtures/images/staand-60x90.png');
    expect(resultaat).toEqual({ breedte: 60, hoogte: 90, formaat: 'staand' });
  });

  it('leest een liggend bestand correct', async () => {
    const resultaat = await bepaalFormaatVanBestand('tests/fixtures/images/liggend-90x60.png');
    expect(resultaat).toEqual({ breedte: 90, hoogte: 60, formaat: 'liggend' });
  });

  it('leest een vierkant bestand correct', async () => {
    const resultaat = await bepaalFormaatVanBestand('tests/fixtures/images/vierkant-70x70.png');
    expect(resultaat).toEqual({ breedte: 70, hoogte: 70, formaat: 'vierkant' });
  });
});

describe('parseArgs', () => {
  it('parseert subcommando en --vlag-waarde-paren', () => {
    expect(parseArgs(['login', '--omgeving', 'staging'])).toEqual({
      subcommand: 'login',
      opts: { omgeving: 'staging' },
    });
  });

  it('gooit een fout bij een vlag zonder waarde', () => {
    expect(() => parseArgs(['login', '--omgeving'])).toThrow("'--omgeving' heeft geen waarde");
  });

  it('gooit een fout bij een argument dat niet met -- begint', () => {
    expect(() => parseArgs(['login', 'staging'])).toThrow("onverwacht argument 'staging'");
  });
});
```

- [ ] **Step 3: Draai de test om te zien dat hij faalt**

```bash
npx vitest run tests/scripts/importKunstwerken.test.ts
```

Verwacht: FAIL — `scripts/lib/importKunstwerken.ts` bestaat nog niet.

- [ ] **Step 4: Schrijf de implementatie**

`scripts/lib/importKunstwerken.ts`:

```ts
import { imageSizeFromFile } from 'image-size/fromFile';
import { detectFormaatFromDimensions } from '../../src/lib/detectKunstwerkFormaat';
import type { KunstwerkFormaat } from '../../src/components/beheer/materiaalTypes';

function escapeRegex(tekst: string): string {
  return tekst.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function bepaalVolgendeCode(bestaandeCodes: string[], prefix: string): string {
  const patroon = new RegExp(`^${escapeRegex(prefix)}-(\\d+)$`);
  let hoogsteNummer = 0;
  let cijferbreedte = 3;
  for (const code of bestaandeCodes) {
    const match = code.match(patroon);
    if (!match) continue;
    const nummer = Number(match[1]);
    if (nummer > hoogsteNummer) {
      hoogsteNummer = nummer;
      cijferbreedte = match[1].length;
    }
  }
  const volgendeNummer = String(hoogsteNummer + 1).padStart(cijferbreedte, '0');
  return `${prefix}-${volgendeNummer}`;
}

export function kiesMatendeMaten(
  maten: Array<{ id: string; breedte: number; hoogte: number }>,
  formaat: KunstwerkFormaat
): string[] {
  if (formaat === 'alle') return maten.map((maat) => maat.id);
  return maten
    .filter((maat) => detectFormaatFromDimensions(maat.breedte, maat.hoogte) === formaat)
    .map((maat) => maat.id);
}

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export function mimeTypeVoorBestand(bestandsnaam: string): string {
  const extensie = bestandsnaam.slice(bestandsnaam.lastIndexOf('.')).toLowerCase();
  const mimeType = MIME_TYPES[extensie];
  if (!mimeType) {
    throw new Error(`Niet-ondersteunde bestandsextensie: '${extensie}'.`);
  }
  return mimeType;
}

export function vindExacteMatch<T extends { omschrijving: string }>(
  bestaande: T[],
  omschrijving: string
): T | null {
  const genormaliseerd = omschrijving.trim().toLowerCase();
  return bestaande.find((item) => item.omschrijving.trim().toLowerCase() === genormaliseerd) ?? null;
}

export async function bepaalFormaatVanBestand(
  bestandspad: string
): Promise<{ breedte: number; hoogte: number; formaat: KunstwerkFormaat }> {
  const { width, height } = await imageSizeFromFile(bestandspad);
  return {
    breedte: width,
    hoogte: height,
    formaat: detectFormaatFromDimensions(width, height),
  };
}

export function parseArgs(args: string[]): { subcommand: string; opts: Record<string, string> } {
  const [subcommand, ...rest] = args;
  const opts: Record<string, string> = {};
  for (let i = 0; i < rest.length; i += 2) {
    const vlag = rest[i];
    if (!vlag.startsWith('--')) {
      throw new Error(`Ongeldig argument: onverwacht argument '${vlag}', verwacht een vlag die met -- begint.`);
    }
    const waarde = rest[i + 1];
    if (waarde === undefined) {
      throw new Error(`Ongeldig argument: '${vlag}' heeft geen waarde.`);
    }
    opts[vlag.slice(2)] = waarde;
  }
  return { subcommand, opts };
}
```

- [ ] **Step 5: Draai de test om te zien dat hij slaagt**

```bash
npx vitest run tests/scripts/importKunstwerken.test.ts
```

Verwacht: alle tests PASS.

- [ ] **Step 6: Typecheck en commit**

```bash
npx tsc --noEmit
git add scripts/lib/importKunstwerken.ts scripts/dev/genereer-test-fixture-fotos.mjs tests/fixtures/images tests/scripts/importKunstwerken.test.ts package.json package-lock.json
git commit -m "feat: zuivere beslislogica voor de import-kunstwerken CLI"
```

---

### Task 3: HTTP-laag — inloggen, referentiedata, uploaden, kunstwerk/lookup-waarde aanmaken

De enige plek die met de REST API van staging/productie praat. Elke functie neemt de `baseUrl` en (waar nodig) de sessiecookie als parameter mee, en accepteert een optionele `fetchImpl` zodat de tests `fetch` kunnen vervangen zonder een echt netwerk te raken.

**Files:**
- Create: `scripts/lib/importHttp.ts`
- Test: `tests/scripts/importHttp.test.ts`

**Interfaces:**
- Consumes: `mimeTypeVoorBestand`, `vindExacteMatch` uit Taak 2.
- Produces: `logIn(baseUrl: string, email: string, wachtwoord: string, fetchImpl?: typeof fetch): Promise<string>`
- Produces: `interface ReferentieData { kunstenaars: Array<{ kunstenaarnr: string; naam: string }>; segmenten: Array<{ id: string; omschrijving: string }>; stijlen: Array<{ id: string; omschrijving: string }>; onderwerpen: Array<{ id: string; omschrijving: string }>; materialen: Array<{ id: string; omschrijving: string }>; maten: Array<{ id: string; breedte: number; hoogte: number }>; kunstwerkCodes: string[]; }`
- Produces: `haalReferentieOp(baseUrl: string, sessieCookie: string, fetchImpl?: typeof fetch): Promise<ReferentieData>`
- Produces: `uploadFoto(baseUrl: string, sessieCookie: string, bestandspad: string, fetchImpl?: typeof fetch): Promise<string>`
- Produces: `maakOfHergebruikLookupWaarde(baseUrl: string, sessieCookie: string, tabel: 'segmenten' | 'stijlen' | 'onderwerpen', omschrijving: string, fetchImpl?: typeof fetch): Promise<{ id: string; omschrijving: string; hergebruikt: boolean }>`
- Produces: `interface NieuwKunstwerk { code: string; foto: string; kunstenaarnr: string; formaat: 'staand' | 'liggend' | 'vierkant'; omschrijvingNl: string; omschrijvingEn: string; omschrijvingDe: string; omschrijvingFr: string; segmentIds: string[]; stijlIds: string[]; onderwerpIds: string[]; materiaalIds: string[]; maatIds: string[]; aiGegenereerd: boolean; }`
- Produces: `type MaakKunstwerkResultaat = { status: 'aangemaakt'; id: string; code: string } | { status: 'code-bestaat-al' }`
- Produces: `maakKunstwerk(baseUrl: string, sessieCookie: string, kunstwerk: NieuwKunstwerk, fetchImpl?: typeof fetch): Promise<MaakKunstwerkResultaat>`

- [ ] **Step 1: Schrijf de falende tests**

`tests/scripts/importHttp.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  logIn,
  haalReferentieOp,
  uploadFoto,
  maakOfHergebruikLookupWaarde,
  maakKunstwerk,
} from '../../scripts/lib/importHttp';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: (naam: string) => headers[naam.toLowerCase()] ?? null },
  };
}

describe('logIn', () => {
  it('geeft de sessiecookie terug bij een geslaagde login', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { ok: true }, { 'set-cookie': 'session_id=abc123; Path=/; HttpOnly' })
    );
    const cookie = await logIn('https://staging.glassartanddesign.com', 'x@example.com', 'geheim', fetchMock);
    expect(cookie).toBe('session_id=abc123');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://staging.glassartanddesign.com/api/auth/medewerker-login');
    expect(JSON.parse(options.body)).toEqual({ email: 'x@example.com', password: 'geheim' });
  });

  it('gooit een fout bij ongeldige inloggegevens', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: 'invalid-credentials' }));
    await expect(logIn('https://staging.glassartanddesign.com', 'x@example.com', 'fout', fetchMock)).rejects.toThrow(
      'Inloggen mislukt'
    );
  });

  it('gooit een fout als er geen sessiecookie terugkomt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    await expect(logIn('https://staging.glassartanddesign.com', 'x@example.com', 'geheim', fetchMock)).rejects.toThrow(
      'Geen sessiecookie'
    );
  });
});

describe('haalReferentieOp', () => {
  it('haalt alle referentielijsten op en geeft alleen kunstwerkcodes door', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/api/kunstenaars')) {
        return Promise.resolve(jsonResponse(200, [{ kunstenaarnr: 'KU-00001', naam: 'Sabrino', extra: 'x' }]));
      }
      if (url.endsWith('/api/segmenten')) return Promise.resolve(jsonResponse(200, [{ id: 's1', omschrijving: 'Afrika' }]));
      if (url.endsWith('/api/stijlen')) return Promise.resolve(jsonResponse(200, []));
      if (url.endsWith('/api/onderwerpen')) return Promise.resolve(jsonResponse(200, []));
      if (url.endsWith('/api/materialen')) return Promise.resolve(jsonResponse(200, []));
      if (url.endsWith('/api/maten')) return Promise.resolve(jsonResponse(200, []));
      if (url.endsWith('/api/kunstwerken')) {
        return Promise.resolve(jsonResponse(200, [{ code: 'GLA-PRO-001', id: 'k1' }]));
      }
      throw new Error(`Onverwachte URL in test: ${url}`);
    });

    const referentie = await haalReferentieOp('https://staging.glassartanddesign.com', 'session_id=abc', fetchMock);

    expect(referentie.kunstenaars).toEqual([{ kunstenaarnr: 'KU-00001', naam: 'Sabrino' }]);
    expect(referentie.segmenten).toEqual([{ id: 's1', omschrijving: 'Afrika' }]);
    expect(referentie.kunstwerkCodes).toEqual(['GLA-PRO-001']);
    for (const call of fetchMock.mock.calls) {
      expect(call[1].headers.cookie).toBe('session_id=abc');
    }
  });
});

describe('uploadFoto', () => {
  it('stuurt het bestand als multipart-veld foto en geeft de URL terug', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { url: 'https://cdn.example.com/foto.jpg' }));
    const url = await uploadFoto(
      'https://staging.glassartanddesign.com',
      'session_id=abc',
      'tests/fixtures/images/staand-60x90.png',
      fetchMock
    );
    expect(url).toBe('https://cdn.example.com/foto.jpg');
    const [endpoint, options] = fetchMock.mock.calls[0];
    expect(endpoint).toBe('https://staging.glassartanddesign.com/api/upload');
    expect(options.headers.cookie).toBe('session_id=abc');
    const verstuurd = options.body as FormData;
    expect((verstuurd.get('foto') as File).name).toBe('staand-60x90.png');
  });

  it('gooit een fout als de upload mislukt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(502, { error: 'upload-mislukt' }));
    await expect(
      uploadFoto('https://staging.glassartanddesign.com', 'session_id=abc', 'tests/fixtures/images/staand-60x90.png', fetchMock)
    ).rejects.toThrow('mislukt');
  });
});

describe('maakOfHergebruikLookupWaarde', () => {
  it('hergebruikt een bestaande waarde en maakt niets nieuws aan', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, [{ id: 's1', omschrijving: 'Afrika' }]));
    const resultaat = await maakOfHergebruikLookupWaarde(
      'https://staging.glassartanddesign.com',
      'session_id=abc',
      'segmenten',
      'afrika',
      fetchMock
    );
    expect(resultaat).toEqual({ id: 's1', omschrijving: 'Afrika', hergebruikt: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maakt een nieuwe waarde aan als er niets past', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 's1', omschrijving: 'Afrika' }]))
      .mockResolvedValueOnce(jsonResponse(201, { id: 's2', omschrijving: 'Safari' }));
    const resultaat = await maakOfHergebruikLookupWaarde(
      'https://staging.glassartanddesign.com',
      'session_id=abc',
      'segmenten',
      'Safari',
      fetchMock
    );
    expect(resultaat).toEqual({ id: 's2', omschrijving: 'Safari', hergebruikt: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, createOptions] = fetchMock.mock.calls[1];
    expect(JSON.parse(createOptions.body)).toEqual({ omschrijving: 'Safari' });
  });
});

describe('maakKunstwerk', () => {
  const kunstwerk = {
    code: 'GLA-PRO-001',
    foto: 'https://cdn.example.com/foto.jpg',
    kunstenaarnr: 'KU-00001',
    formaat: 'staand' as const,
    omschrijvingNl: 'Nl',
    omschrijvingEn: 'En',
    omschrijvingDe: 'De',
    omschrijvingFr: 'Fr',
    segmentIds: ['s1'],
    stijlIds: [],
    onderwerpIds: [],
    materiaalIds: [],
    maatIds: [],
    aiGegenereerd: false,
  };

  it('geeft het aangemaakte kunstwerk terug bij succes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'k1', code: 'GLA-PRO-001' }));
    const resultaat = await maakKunstwerk('https://staging.glassartanddesign.com', 'session_id=abc', kunstwerk, fetchMock);
    expect(resultaat).toEqual({ status: 'aangemaakt', id: 'k1', code: 'GLA-PRO-001' });
  });

  it('geeft code-bestaat-al terug bij een 409, zonder te gooien', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(409, { error: 'code-bestaat-al' }));
    const resultaat = await maakKunstwerk('https://staging.glassartanddesign.com', 'session_id=abc', kunstwerk, fetchMock);
    expect(resultaat).toEqual({ status: 'code-bestaat-al' });
  });

  it('gooit een fout bij een onverwachte serverfout', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { error: 'kapot' }));
    await expect(
      maakKunstwerk('https://staging.glassartanddesign.com', 'session_id=abc', kunstwerk, fetchMock)
    ).rejects.toThrow('mislukt');
  });
});
```

- [ ] **Step 2: Draai de tests om te zien dat ze falen**

```bash
npx vitest run tests/scripts/importHttp.test.ts
```

Verwacht: FAIL — `scripts/lib/importHttp.ts` bestaat nog niet.

- [ ] **Step 3: Schrijf de implementatie**

`scripts/lib/importHttp.ts`:

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { mimeTypeVoorBestand, vindExacteMatch } from './importKunstwerken';

const SESSION_COOKIE_NAME = 'session_id';

export interface ReferentieData {
  kunstenaars: Array<{ kunstenaarnr: string; naam: string }>;
  segmenten: Array<{ id: string; omschrijving: string }>;
  stijlen: Array<{ id: string; omschrijving: string }>;
  onderwerpen: Array<{ id: string; omschrijving: string }>;
  materialen: Array<{ id: string; omschrijving: string }>;
  maten: Array<{ id: string; breedte: number; hoogte: number }>;
  kunstwerkCodes: string[];
}

export async function logIn(
  baseUrl: string,
  email: string,
  wachtwoord: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const response = await fetchImpl(`${baseUrl}/api/auth/medewerker-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: wachtwoord }),
  });
  if (!response.ok) {
    throw new Error(`Inloggen mislukt op ${baseUrl} (status ${response.status}).`);
  }
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie || !setCookie.startsWith(`${SESSION_COOKIE_NAME}=`)) {
    throw new Error(`Geen sessiecookie ontvangen van ${baseUrl}.`);
  }
  return setCookie.split(';')[0];
}

export async function haalReferentieOp(
  baseUrl: string,
  sessieCookie: string,
  fetchImpl: typeof fetch = fetch
): Promise<ReferentieData> {
  async function haalOp<T>(pad: string): Promise<T> {
    const response = await fetchImpl(`${baseUrl}${pad}`, { headers: { cookie: sessieCookie } });
    if (!response.ok) {
      throw new Error(`Ophalen van ${pad} op ${baseUrl} mislukt (status ${response.status}).`);
    }
    return (await response.json()) as T;
  }

  const [kunstenaars, segmenten, stijlen, onderwerpen, materialen, maten, kunstwerken] = await Promise.all([
    haalOp<Array<{ kunstenaarnr: string; naam: string }>>('/api/kunstenaars'),
    haalOp<Array<{ id: string; omschrijving: string }>>('/api/segmenten'),
    haalOp<Array<{ id: string; omschrijving: string }>>('/api/stijlen'),
    haalOp<Array<{ id: string; omschrijving: string }>>('/api/onderwerpen'),
    haalOp<Array<{ id: string; omschrijving: string }>>('/api/materialen'),
    haalOp<Array<{ id: string; breedte: number; hoogte: number }>>('/api/maten'),
    haalOp<Array<{ code: string }>>('/api/kunstwerken'),
  ]);

  return {
    kunstenaars: kunstenaars.map(({ kunstenaarnr, naam }) => ({ kunstenaarnr, naam })),
    segmenten,
    stijlen,
    onderwerpen,
    materialen,
    maten,
    kunstwerkCodes: kunstwerken.map((kunstwerk) => kunstwerk.code),
  };
}

export async function uploadFoto(
  baseUrl: string,
  sessieCookie: string,
  bestandspad: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const buffer = await fs.readFile(bestandspad);
  const bestandsnaam = path.basename(bestandspad);
  const form = new FormData();
  form.append('foto', new File([buffer], bestandsnaam, { type: mimeTypeVoorBestand(bestandsnaam) }));

  const response = await fetchImpl(`${baseUrl}/api/upload`, {
    method: 'POST',
    headers: { cookie: sessieCookie },
    body: form,
  });
  const data = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!response.ok || typeof data?.url !== 'string') {
    throw new Error(`Foto-upload van ${bestandspad} mislukt: ${data?.error ?? response.status}`);
  }
  return data.url;
}

export async function maakOfHergebruikLookupWaarde(
  baseUrl: string,
  sessieCookie: string,
  tabel: 'segmenten' | 'stijlen' | 'onderwerpen',
  omschrijving: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ id: string; omschrijving: string; hergebruikt: boolean }> {
  const lijstResponse = await fetchImpl(`${baseUrl}/api/${tabel}`, { headers: { cookie: sessieCookie } });
  if (!lijstResponse.ok) {
    throw new Error(`Ophalen van ${tabel} op ${baseUrl} mislukt (status ${lijstResponse.status}).`);
  }
  const bestaande = (await lijstResponse.json()) as Array<{ id: string; omschrijving: string }>;
  const match = vindExacteMatch(bestaande, omschrijving);
  if (match) {
    return { ...match, hergebruikt: true };
  }

  const createResponse = await fetchImpl(`${baseUrl}/api/${tabel}`, {
    method: 'POST',
    headers: { cookie: sessieCookie, 'content-type': 'application/json' },
    body: JSON.stringify({ omschrijving }),
  });
  if (!createResponse.ok) {
    throw new Error(
      `Aanmaken van '${omschrijving}' in ${tabel} op ${baseUrl} mislukt (status ${createResponse.status}).`
    );
  }
  const created = (await createResponse.json()) as { id: string; omschrijving: string };
  return { ...created, hergebruikt: false };
}

export interface NieuwKunstwerk {
  code: string;
  foto: string;
  kunstenaarnr: string;
  formaat: 'staand' | 'liggend' | 'vierkant';
  omschrijvingNl: string;
  omschrijvingEn: string;
  omschrijvingDe: string;
  omschrijvingFr: string;
  segmentIds: string[];
  stijlIds: string[];
  onderwerpIds: string[];
  materiaalIds: string[];
  maatIds: string[];
  aiGegenereerd: boolean;
}

export type MaakKunstwerkResultaat =
  | { status: 'aangemaakt'; id: string; code: string }
  | { status: 'code-bestaat-al' };

export async function maakKunstwerk(
  baseUrl: string,
  sessieCookie: string,
  kunstwerk: NieuwKunstwerk,
  fetchImpl: typeof fetch = fetch
): Promise<MaakKunstwerkResultaat> {
  const response = await fetchImpl(`${baseUrl}/api/kunstwerken`, {
    method: 'POST',
    headers: { cookie: sessieCookie, 'content-type': 'application/json' },
    body: JSON.stringify(kunstwerk),
  });
  if (response.status === 409) {
    return { status: 'code-bestaat-al' };
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(`Aanmaken van kunstwerk ${kunstwerk.code} op ${baseUrl} mislukt: ${data?.error ?? response.status}`);
  }
  const created = (await response.json()) as { id: string; code: string };
  return { status: 'aangemaakt', id: created.id, code: created.code };
}
```

- [ ] **Step 4: Draai de tests om te zien dat ze slagen**

```bash
npx vitest run tests/scripts/importHttp.test.ts
```

Verwacht: alle tests PASS.

- [ ] **Step 5: Typecheck en commit**

```bash
npx tsc --noEmit
git add scripts/lib/importHttp.ts tests/scripts/importHttp.test.ts
git commit -m "feat: HTTP-laag voor de import-kunstwerken CLI"
```

---

### Task 4: CLI-entrypoint met alle subcommando's

Het dunne script dat de functies uit Taak 1-3 als losse subcommando's ontsluit. Wordt getest via `spawnSync`, uitsluitend op refusal-paden (geen netwerkaanroepen in de testsuite) plus de twee volledig netwerkloze subcommando's (`volgende-code`, `analyseer-foto`, `kies-maten`) die end-to-end via een echt kind-proces getest kunnen worden.

**Files:**
- Create: `scripts/import-kunstwerken-cli.ts`
- Test: `tests/scripts/import-kunstwerken-cli.test.ts`
- Modify: `package.json` (npm-scriptalias)

**Interfaces:**
- Consumes: alles uit Taak 1 (`baseUrlVoorOmgeving`, `leesImportCredentials`), Taak 2 (`bepaalVolgendeCode`, `kiesMatendeMaten`, `bepaalFormaatVanBestand`, `parseArgs`), Taak 3 (`logIn`, `haalReferentieOp`, `uploadFoto`, `maakOfHergebruikLookupWaarde`, `maakKunstwerk`, `NieuwKunstwerk`), en `leesOmgeving` uit het bestaande `scripts/lib/env.ts`.
- Produces: subcommando's `login`, `analyseer-foto`, `kies-maten`, `volgende-code`, `dump-referentie`, `upload-foto`, `maak-lookup-waarde`, `maak-kunstwerk` (elk gedocumenteerd in Stap 3 hieronder).

- [ ] **Step 1: Schrijf de falende tests**

`tests/scripts/import-kunstwerken-cli.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';

// SAFETY: elke case hier is een argumentvalidatie-weigering die moet stoppen VOORDAT
// scripts/import-kunstwerken-cli.ts ooit fetch() aanroept -- geen enkele case mag een
// echte staging/productie-aanroep doen. Zelfde bedoeling als tests/scripts/db-migrate-cli.test.ts.
const TIMEOUT_MS = 15_000;

function runCli(args: string[]) {
  return spawnSync('npx', ['tsx', 'scripts/import-kunstwerken-cli.ts', ...args], {
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
    shell: true,
  });
}

describe('import-kunstwerken-cli argumentvalidatie', () => {
  it('weigert een onbekend subcommando met gebruikstekst', () => {
    const result = runCli(['frobnicate']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Gebruik:');
  });

  it('weigert login zonder --omgeving', () => {
    const result = runCli(['login']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--omgeving is verplicht');
  });

  it('weigert login met een onbekende omgeving', () => {
    const result = runCli(['login', '--omgeving', 'test']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("moet 'staging' of 'productie' zijn");
  });

  it('weigert analyseer-foto zonder --pad', () => {
    const result = runCli(['analyseer-foto']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--pad is verplicht');
  });

  it('weigert maak-lookup-waarde met een onbekende --tabel', () => {
    const result = runCli([
      'maak-lookup-waarde',
      '--omgeving',
      'staging',
      '--sessie-cookie',
      'session_id=x',
      '--tabel',
      'foo',
      '--omschrijving',
      'Afrika',
    ]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('moet segmenten, stijlen of onderwerpen zijn');
  });
});

describe('import-kunstwerken-cli netwerkloze subcommando\'s', () => {
  it('volgende-code print de eerstvolgende code', () => {
    const result = runCli(['volgende-code', '--prefix', 'GLA-PRO', '--bestaande-codes-json', '["GLA-PRO-001"]']);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('GLA-PRO-002');
  });

  it('analyseer-foto print breedte, hoogte en formaat van een echt bestand', () => {
    const result = runCli(['analyseer-foto', '--pad', 'tests/fixtures/images/staand-60x90.png']);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ breedte: 60, hoogte: 90, formaat: 'staand' });
  });

  it('kies-maten print de bij het formaat passende maat-id\'s', () => {
    const matenJson = JSON.stringify([
      { id: 'a', breedte: 60, hoogte: 90 },
      { id: 'b', breedte: 90, hoogte: 60 },
    ]);
    const result = runCli(['kies-maten', '--formaat', 'staand', '--maten-json', matenJson]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Draai de tests om te zien dat ze falen**

```bash
npx vitest run tests/scripts/import-kunstwerken-cli.test.ts
```

Verwacht: FAIL — `scripts/import-kunstwerken-cli.ts` bestaat nog niet.

- [ ] **Step 3: Schrijf de implementatie**

`scripts/import-kunstwerken-cli.ts`:

```ts
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
  type NieuwKunstwerk,
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
```

Voeg toe aan `package.json`, in `"scripts"`, naast `"db:diff"`:

```json
    "import:kunstwerken": "tsx scripts/import-kunstwerken-cli.ts"
```

- [ ] **Step 4: Draai de tests om te zien dat ze slagen**

```bash
npx vitest run tests/scripts/import-kunstwerken-cli.test.ts
```

Verwacht: alle tests PASS. (Dit subcommando verwijst al naar `./lib/importBatchManifest`, dat pas in Taak 5 ontstaat — zie Step 5 hieronder.)

- [ ] **Step 5: Typecheck (verwacht nog een fout) en noteer de afhankelijkheid**

```bash
npx tsc --noEmit
```

Verwacht: fout over het ontbrekende bestand `./lib/importBatchManifest`. Dat is verwacht — Taak 5 maakt dat bestand aan. Ga door naar Taak 5 vóórdat je deze taak commit; commit Taak 4 en Taak 5 samen zodat `tsc` bij elke commit groen blijft (Global Constraints).

---

### Task 5: Batch-manifest — schema, validatie, lezen/schrijven

Legt het schema vast waarmee een staging-run naar productie doorgezet kan worden zonder de beoordeling te herhalen (ontwerpbeslissing 7). Rondt Taak 4 af (het `valideer-manifest`-subcommando kon nog niet compileren zonder dit bestand).

**Files:**
- Create: `scripts/lib/importBatchManifest.ts`
- Test: `tests/scripts/importBatchManifest.test.ts`

**Interfaces:**
- Produces: `interface ImportBatchManifestKunstwerk { bestandsnaam: string; formaat: 'staand' | 'liggend' | 'vierkant'; maten: Array<{ breedte: number; hoogte: number }>; segmenten: string[]; stijlen: string[]; onderwerpen: string[]; omschrijvingNl: string; omschrijvingEn: string; omschrijvingDe: string; omschrijvingFr: string; }`
- Produces: `interface ImportBatchManifest { versie: 1; collectiecode: string; kunstenaarNaam: string; aiGegenereerd: boolean; brondirectory: string; kunstwerken: ImportBatchManifestKunstwerk[]; }`
- Produces: `valideerManifest(data: unknown): ImportBatchManifest`
- Produces: `leesManifest(pad: string): ImportBatchManifest`
- Consumed by: Taak 4's `valideer-manifest`-subcommando (al geschreven, wacht op dit bestand).

- [ ] **Step 1: Schrijf de falende test**

`tests/scripts/importBatchManifest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { valideerManifest, leesManifest } from '../../scripts/lib/importBatchManifest';

function geldigManifest() {
  return {
    versie: 1,
    collectiecode: 'GLA-PRO',
    kunstenaarNaam: 'Sabrino',
    aiGegenereerd: false,
    brondirectory: 'C:/foto/gla-pro',
    kunstwerken: [
      {
        bestandsnaam: 'foto1.jpg',
        formaat: 'staand',
        maten: [{ breedte: 60, hoogte: 90 }],
        segmenten: ['Afrika'],
        stijlen: ['Modern'],
        onderwerpen: ['Safari'],
        omschrijvingNl: 'Een prachtig werk.',
        omschrijvingEn: 'A beautiful piece.',
        omschrijvingDe: 'Ein schönes Werk.',
        omschrijvingFr: 'Une belle œuvre.',
      },
    ],
  };
}

describe('valideerManifest', () => {
  it('accepteert een geldig manifest', () => {
    expect(valideerManifest(geldigManifest())).toEqual(geldigManifest());
  });

  it('weigert een onbekende versie', () => {
    expect(() => valideerManifest({ ...geldigManifest(), versie: 2 })).toThrow('manifestversie');
  });

  it('weigert een manifest zonder kunstwerken', () => {
    expect(() => valideerManifest({ ...geldigManifest(), kunstwerken: [] })).toThrow('kunstwerken');
  });

  it('weigert een ongeldig formaat in een kunstwerk-item', () => {
    const manifest = geldigManifest();
    manifest.kunstwerken[0].formaat = 'schuin' as never;
    expect(() => valideerManifest(manifest)).toThrow('formaat');
  });

  it('weigert een kunstwerk-item zonder omschrijvingEn', () => {
    const manifest = geldigManifest();
    // @ts-expect-error -- opzettelijk een verplicht veld weglaten voor deze test
    delete manifest.kunstwerken[0].omschrijvingEn;
    expect(() => valideerManifest(manifest)).toThrow('omschrijvingEn');
  });
});

describe('leesManifest', () => {
  it('leest en valideert een manifest-bestand van schijf', () => {
    const pad = path.join(os.tmpdir(), `import-manifest-test-${Date.now()}.json`);
    fs.writeFileSync(pad, JSON.stringify(geldigManifest()));
    try {
      expect(leesManifest(pad)).toEqual(geldigManifest());
    } finally {
      fs.unlinkSync(pad);
    }
  });

  it('gooit een duidelijke fout bij ongeldige JSON', () => {
    const pad = path.join(os.tmpdir(), `import-manifest-test-invalid-${Date.now()}.json`);
    fs.writeFileSync(pad, '{ dit is geen json');
    try {
      expect(() => leesManifest(pad)).toThrow('geen geldige JSON');
    } finally {
      fs.unlinkSync(pad);
    }
  });
});
```

- [ ] **Step 2: Draai de test om te zien dat hij faalt**

```bash
npx vitest run tests/scripts/importBatchManifest.test.ts
```

Verwacht: FAIL — `scripts/lib/importBatchManifest.ts` bestaat nog niet.

- [ ] **Step 3: Schrijf de implementatie**

`scripts/lib/importBatchManifest.ts`:

```ts
import fs from 'node:fs';

export interface ImportBatchManifestKunstwerk {
  bestandsnaam: string;
  formaat: 'staand' | 'liggend' | 'vierkant';
  maten: Array<{ breedte: number; hoogte: number }>;
  segmenten: string[];
  stijlen: string[];
  onderwerpen: string[];
  omschrijvingNl: string;
  omschrijvingEn: string;
  omschrijvingDe: string;
  omschrijvingFr: string;
}

export interface ImportBatchManifest {
  versie: 1;
  collectiecode: string;
  kunstenaarNaam: string;
  aiGegenereerd: boolean;
  brondirectory: string;
  kunstwerken: ImportBatchManifestKunstwerk[];
}

const FORMATEN = ['staand', 'liggend', 'vierkant'];
const VERPLICHTE_TEKSTVELDEN = ['omschrijvingNl', 'omschrijvingEn', 'omschrijvingDe', 'omschrijvingFr'];

function valideerKunstwerkItem(item: unknown, index: number): void {
  if (typeof item !== 'object' || item === null) {
    throw new Error(`kunstwerken[${index}] is geen JSON-object.`);
  }
  const kunstwerk = item as Record<string, unknown>;
  if (typeof kunstwerk.bestandsnaam !== 'string' || kunstwerk.bestandsnaam.trim() === '') {
    throw new Error(`kunstwerken[${index}].bestandsnaam ontbreekt.`);
  }
  if (typeof kunstwerk.formaat !== 'string' || !FORMATEN.includes(kunstwerk.formaat)) {
    throw new Error(`kunstwerken[${index}].formaat moet staand, liggend of vierkant zijn.`);
  }
  if (!Array.isArray(kunstwerk.maten)) {
    throw new Error(`kunstwerken[${index}].maten moet een array zijn.`);
  }
  for (const maat of kunstwerk.maten as unknown[]) {
    const m = maat as Record<string, unknown>;
    if (typeof m.breedte !== 'number' || typeof m.hoogte !== 'number') {
      throw new Error(`kunstwerken[${index}].maten bevat een waarde zonder numerieke breedte/hoogte.`);
    }
  }
  for (const veld of ['segmenten', 'stijlen', 'onderwerpen']) {
    if (!Array.isArray(kunstwerk[veld])) {
      throw new Error(`kunstwerken[${index}].${veld} moet een array zijn.`);
    }
  }
  for (const veld of VERPLICHTE_TEKSTVELDEN) {
    if (typeof kunstwerk[veld] !== 'string' || (kunstwerk[veld] as string).trim() === '') {
      throw new Error(`kunstwerken[${index}].${veld} ontbreekt.`);
    }
  }
}

export function valideerManifest(data: unknown): ImportBatchManifest {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Manifest is geen JSON-object.');
  }
  const manifest = data as Record<string, unknown>;
  if (manifest.versie !== 1) {
    throw new Error(`Onbekende manifestversie: ${JSON.stringify(manifest.versie)}.`);
  }
  for (const veld of ['collectiecode', 'kunstenaarNaam', 'brondirectory']) {
    if (typeof manifest[veld] !== 'string' || (manifest[veld] as string).trim() === '') {
      throw new Error(`Manifest mist een niet-lege tekstwaarde voor '${veld}'.`);
    }
  }
  if (typeof manifest.aiGegenereerd !== 'boolean') {
    throw new Error("Manifest mist een boolean 'aiGegenereerd'.");
  }
  if (!Array.isArray(manifest.kunstwerken) || manifest.kunstwerken.length === 0) {
    throw new Error("Manifest mist een niet-lege lijst 'kunstwerken'.");
  }
  manifest.kunstwerken.forEach((item, index) => valideerKunstwerkItem(item, index));
  return manifest as unknown as ImportBatchManifest;
}

export function leesManifest(pad: string): ImportBatchManifest {
  const inhoud = fs.readFileSync(pad, 'utf8');
  let data: unknown;
  try {
    data = JSON.parse(inhoud);
  } catch {
    throw new Error(`'${pad}' bevat geen geldige JSON.`);
  }
  return valideerManifest(data);
}
```

- [ ] **Step 4: Draai beide testbestanden en de typechecker**

```bash
npx vitest run tests/scripts/importBatchManifest.test.ts tests/scripts/import-kunstwerken-cli.test.ts
npx tsc --noEmit
npm test
```

Verwacht: alle PASS, `tsc` exit 0.

- [ ] **Step 5: Commit (Taak 4 en 5 samen)**

```bash
git add scripts/import-kunstwerken-cli.ts scripts/lib/importBatchManifest.ts tests/scripts/import-kunstwerken-cli.test.ts tests/scripts/importBatchManifest.test.ts package.json
git commit -m "feat: CLI-entrypoint en batch-manifest voor de import-kunstwerken skill"
```

---

### Task 6: De skill zelf — `.claude/skills/import-kunstwerken/SKILL.md`

De agent-procedure die alle voorgaande CLI-subcommando's gebruikt. Geen geautomatiseerde test mogelijk voor een instructiebestand — de verificatiestap hieronder is een handmatige inhoudscontrole plus (zodra de kunstenaarnr-afhankelijkheid elders geland is) een echte proefrun met een paar testfoto's tegen staging.

**Files:**
- Create: `.claude/skills/import-kunstwerken/SKILL.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: alle subcommando's uit Taak 4 (`login`, `analyseer-foto`, `kies-maten`, `volgende-code`, `dump-referentie`, `upload-foto`, `maak-lookup-waarde`, `maak-kunstwerk`, `valideer-manifest`).

- [ ] **Step 1: Maak `.claude/skills/` trackbaar in git**

In `.gitignore`, vervang regel 8 (`.claude/`) door:

```
.claude/*
!.claude/skills/
.claude/skills/*/runs/
```

- [ ] **Step 2: Schrijf de skill**

`.claude/skills/import-kunstwerken/SKILL.md`:

````markdown
---
name: import-kunstwerken
description: Importeer kunstwerken in bulk vanaf een lokale map afbeeldingen naar staging of productie — automatische code/formaat/maten-bepaling, segment/stijl/onderwerp-koppeling (hergebruik-eerst) en 4-talige omschrijvingen.
---

# Import-kunstwerken

Ontwerp: `docs/superpowers/specs/2026-08-10-import-kunstwerken-skill-design.md`.

**Harde afhankelijkheid.** Deze skill stuurt `kunstenaarnr` mee naar `POST /api/kunstwerken`.
Bestaat de kolom `kunstenaars.kunstenaarnr` nog niet op de doelomgeving, dan faalt
`maak-kunstwerk` met een serverfout. Controleer dit desnoods vooraf met een medewerker die
weet of dat werk al is uitgerold, vóór je met een echte run begint.

Alle CLI-aanroepen hieronder gebruiken `npx tsx scripts/import-kunstwerken-cli.ts <subcommando>
[opties]` (of `npm run import:kunstwerken -- <subcommando> [opties]`), uitgevoerd vanuit de
projectroot (`C:\projecten\Glassart and design`).

## Stap 0: nieuwe import, of een eerdere batch doorzetten?

Vraag dit als allereerste:

> "Wil je een nieuwe map met kunstwerken importeren, of een eerder gecontroleerde batch
> (via een manifest-bestand) naar een andere omgeving doorzetten?"

- **Nieuwe import** → ga naar Stap A.
- **Batch doorzetten** → vraag het pad naar het manifest-bestand
  (`.claude/skills/import-kunstwerken/runs/<datum>-<collectiecode>.json`), valideer het:

  ```
  npx tsx scripts/import-kunstwerken-cli.ts valideer-manifest --pad "<pad>"
  ```

  Bij een foutmelding: toon die aan de gebruiker en stop. Bij `OK -- N kunstwerk(en)`: lees
  het bestand zelf in (Read-tool) om `collectiecode`, `kunstenaarNaam`, `aiGegenereerd`,
  `brondirectory` en de lijst `kunstwerken` te kennen, vraag alléén de doelomgeving (Stap A.1),
  en ga direct naar **Stap B2** (per-kunstwerk, replay-variant) — sla A.2 t/m A.5 over. Er
  wordt in dit pad geen nieuw manifest geschreven; Stap C vervalt.

## Stap A: vragen vooraf (alleen bij een nieuwe import)

1. **Omgeving** — "staging" of "productie", default staging.
2. Log in vóórdat je verder vraagt (nodig om de kunstenaarslijst te tonen):

   ```
   npx tsx scripts/import-kunstwerken-cli.ts login --omgeving <omgeving>
   ```

   Vang de teruggegeven regel letterlijk op als `<cookie>` — die geef je ongewijzigd mee aan
   elk volgend subcommando met `--sessie-cookie`, voor de rest van deze hele run (ook na een
   eventuele omgevingswissel bij het doorzetten naar productie: dan log je opnieuw in tegen de
   nieuwe omgeving en gebruik je vanaf dat moment die nieuwe cookie).
3. Haal de referentiedata op en bewaar die voor de hele run:

   ```
   npx tsx scripts/import-kunstwerken-cli.ts dump-referentie --omgeving <omgeving> --sessie-cookie "<cookie>"
   ```

   Dit geeft `{ kunstenaars, segmenten, stijlen, onderwerpen, materialen, maten, kunstwerkCodes }`.
4. **Kunstenaar** — toon `referentie.kunstenaars` (kunstenaarnr + naam), laat de gebruiker
   kiezen. Onthoud het gekozen `kunstenaarnr` voor de hele batch.
5. **AI-gegenereerd?** — ja/nee, geldt voor de hele batch.
6. **Brondirectory** — pad naar de map met afbeeldingen.
7. **Collectiecode** — bijv. `GLA-AFR`, `GLA-PRO`, `GLA-SAB`. Vrije tekst, geen validatie
   tegen een vaste lijst.

Maak daarna een platte lijst van alle `.jpg`/`.jpeg`/`.png`/`.webp`-bestanden direct in de
brondirectory (geen submappen), gesorteerd op bestandsnaam. Houd een lokale lijst
`toegekendeCodes` bij, gestart als een kopie van `referentie.kunstwerkCodes` — elke code die
je in Stap B toekent, voeg je hieraan toe vóór je de volgende berekent.

## Stap B: per kunstwerk (nieuwe import)

Voor elk bestand in de brondirectory-lijst, in volgorde:

1. Bekijk de afbeelding met de Read-tool.
2. Bepaal breedte/hoogte/formaat:

   ```
   npx tsx scripts/import-kunstwerken-cli.ts analyseer-foto --pad "<volledig pad naar het bestand>"
   ```

   Geeft `{"breedte":...,"hoogte":...,"formaat":"staand"|"liggend"|"vierkant"}`.
3. Bepaal de bijpassende maten:

   ```
   npx tsx scripts/import-kunstwerken-cli.ts kies-maten --formaat <formaat> --maten-json '<referentie.maten als JSON>'
   ```

   Geeft een JSON-array van maat-id's — dit wordt `maatIds`.
4. Kies, op basis van de afbeelding en `referentie.segmenten`/`stijlen`/`onderwerpen`, het
   best passende **bestaande** segment (en eventueel stijl/onderwerp — dit mogen er meerdere
   zijn). Bestaat er echt niets passends, bedenk dan een nieuwe, korte omschrijving. Voor elke
   gekozen waarde (bestaand of nieuw):

   ```
   npx tsx scripts/import-kunstwerken-cli.ts maak-lookup-waarde --omgeving <omgeving> --sessie-cookie "<cookie>" --tabel <segmenten|stijlen|onderwerpen> --omschrijving "<tekst>"
   ```

   Geeft `{"id":...,"omschrijving":...,"hergebruikt":true|false}`. Gebruik de teruggegeven
   `id` in `segmentIds`/`stijlIds`/`onderwerpIds`. Onthoud elke `hergebruikt:false`-waarde voor
   de eindsamenvatting.
5. `materiaalIds` = alle `id`'s uit `referentie.materialen` (rechtstreeks, geen CLI-aanroep).
6. `prijsPerM2` blijft weg uit het object dat je straks meestuurt (de server laat het dan op
   `NULL` staan).
7. Bepaal de code:

   ```
   npx tsx scripts/import-kunstwerken-cli.ts volgende-code --prefix "<collectiecode>" --bestaande-codes-json '<toegekendeCodes als JSON-array>'
   ```

   Voeg de teruggegeven code meteen toe aan `toegekendeCodes` vóórdat je verdergaat.
8. Schrijf zelf een pakkende, verkoopgerichte omschrijving (2-3 zinnen) in het Nederlands,
   Engels, Duits en Frans — in lijn met de toon van de bestaande catalogus.
9. Upload de foto:

   ```
   npx tsx scripts/import-kunstwerken-cli.ts upload-foto --omgeving <omgeving> --sessie-cookie "<cookie>" --pad "<volledig pad naar het bestand>"
   ```

   Geeft `{"url":"..."}`.
10. Maak het kunstwerk aan:

    ```
    npx tsx scripts/import-kunstwerken-cli.ts maak-kunstwerk --omgeving <omgeving> --sessie-cookie "<cookie>" --json '<kunstwerk-object>'
    ```

    Het `<kunstwerk-object>` bevat: `code`, `foto` (de url uit stap 9), `kunstenaarnr`,
    `formaat`, `omschrijvingNl`/`omschrijvingEn`/`omschrijvingDe`/`omschrijvingFr`,
    `segmentIds`, `stijlIds`, `onderwerpIds`, `materiaalIds`, `maatIds`, `aiGegenereerd`.

    - Bij `{"status":"aangemaakt",...}`: ga verder met de statusregel hieronder.
    - Bij `{"status":"code-bestaat-al"}`: haal opnieuw `volgende-code` op (met de zojuist
      gefaalde code ook al in `toegekendeCodes`), en probeer stap 10 exact één keer opnieuw.
      Lukt het dan nog niet: sla dit kunstwerk over, meld het in de eindsamenvatting, en ga
      door met het volgende bestand.
11. Print een statusregel: bestandsnaam, code, formaat, gekozen segment/stijl/onderwerp
    (met `(nieuw)` achter elke `hergebruikt:false`-waarde), kunstenaar.
12. Voeg dit kunstwerk toe aan een in-memory manifest-lijst, met **waarden, geen id's**:
    `{ bestandsnaam, formaat, maten: [...breedte×hoogte-paren van de gekozen maatIds...],
    segmenten: [...gekozen omschrijvingsteksten...], stijlen: [...], onderwerpen: [...],
    omschrijvingNl, omschrijvingEn, omschrijvingDe, omschrijvingFr }`.

## Stap B2: per kunstwerk (batch doorzetten vanuit een manifest)

Voor elk item in `manifest.kunstwerken`, in volgorde. Er wordt hier **niet** opnieuw naar de
afbeelding gekeken en er wordt niets opnieuw beoordeeld — alleen omgevingsspecifieke
opzoek/aanmaak-stappen op de nieuwe omgeving:

1. Zoek `manifest.kunstenaarNaam` op in de (nieuw opgehaalde) `referentie.kunstenaars` op
   naam. Niet gevonden → meld dit, sla dit kunstwerk over en ga door (kunstenaars aanmaken
   valt buiten deze skill — dat gaat via het bestaande beheerscherm).
2. `maatIds`: `kies-maten --formaat <manifest-item.formaat> --maten-json '<referentie.maten>'`
   (stap B.3, met het formaat uit het manifest — geen nieuwe foto-analyse nodig).
3. Voor elke tekst in `manifest-item.segmenten`/`stijlen`/`onderwerpen`: `maak-lookup-waarde`
   op de nieuwe omgeving (stap B.4, ongewijzigd — hergebruikt-of-maakt-aan op de nieuwe
   omgeving).
4. `materiaalIds` = alle `id`'s uit de nieuwe `referentie.materialen`.
5. Code: `volgende-code` op de nieuwe omgeving se eigen `toegekendeCodes` (stap B.7,
   ongewijzigd).
6. Omschrijvingen: letterlijk uit het manifest-item, ongewijzigd overnemen.
7. Foto: het bronbestand moet nog bestaan op `manifest.brondirectory + '/' + bestandsnaam` —
   upload opnieuw (stap B.9) en maak het kunstwerk aan (stap B.10), inclusief dezelfde
   409-retry.
8. Print dezelfde statusregel als in stap B.11.

Er wordt in dit pad geen nieuw manifest geschreven.

## Stap C: manifest wegschrijven (alleen bij een nieuwe import)

Schrijf de in-memory manifest-lijst (Stap B.12) met de Write-tool naar
`.claude/skills/import-kunstwerken/runs/<datum>-<collectiecode>.json` (datum als
`YYYY-MM-DD`, `collectiecode` zoals opgegeven in Stap A.7), als:

```json
{
  "versie": 1,
  "collectiecode": "<collectiecode>",
  "kunstenaarNaam": "<naam van de gekozen kunstenaar>",
  "aiGegenereerd": <true|false>,
  "brondirectory": "<brondirectory>",
  "kunstwerken": [ /* Stap B.12-items */ ]
}
```

Valideer meteen erna:

```
npx tsx scripts/import-kunstwerken-cli.ts valideer-manifest --pad "<zojuist geschreven pad>"
```

Bij een foutmelding: corrigeer het bestand en valideer opnieuw vóórdat je verdergaat naar
Stap D.

## Stap D: eindsamenvatting (altijd)

Meld:
- Aantal aangemaakte kunstwerken en hun codes.
- Alle nieuw aangemaakte segment/stijl/onderwerp-waarden (`hergebruikt:false`).
- Overgeslagen/mislukte bestanden, met reden.
- Alleen bij een nieuwe import: het pad naar het manifest-bestand, met de aanbeveling: "
  Controleer dit resultaat in beheer op staging. Tevreden? Start deze skill opnieuw, kies
  'batch doorzetten', wijs dit manifest aan en kies productie als omgeving."

## Foutafhandeling

- Ontbrekende/ongeldige brondirectory → opnieuw vragen.
- Onleesbaar/corrupt afbeeldingsbestand (stap B.1/B.2 faalt) → dit bestand overslaan, melden,
  doorgaan met het volgende.
- Inloggen mislukt (Stap A.2) → meteen stoppen, er is dan nog niets geschreven.
- Foto-upload mislukt (stap B.9) → dit kunstwerk overslaan, melden, doorgaan.
- `409 code-bestaat-al` ondanks de lokale `toegekendeCodes`-boekhouding → exact één retry
  (zie stap B.10), daarna overslaan en melden.
- Bij Stap B2: kunstenaar/segment/stijl/onderwerp niet gevonden op naam/tekst op de nieuwe
  omgeving → voor segment/stijl/onderwerp automatisch aanmaken (stap B2.3 doet dit al); voor
  de kunstenaar zelf: overslaan en melden (zie B2.1).

## Wat deze skill bewust niet doet

- Geen hernummering van de bestaande GLA-HOT-serie.
- Geen materiaal- of prijslogica voorbij "alle materialen, prijs leeg".
- Geen beeldbewerking/compressie.
- Geen onbemande/automatische run — elke run, ook een doorzet-run vanuit een manifest, wordt
  door een mens gestart en bevestigd.
````

- [ ] **Step 3: Handmatige inhoudscontrole**

Lees `.claude/skills/import-kunstwerken/SKILL.md` in zijn geheel terug en controleer:
- Elke CLI-aanroep in de skill komt letterlijk overeen met een subcommando/optie uit Taak 4
  (`login`, `analyseer-foto`, `kies-maten`, `volgende-code`, `dump-referentie`, `upload-foto`,
  `maak-lookup-waarde`, `maak-kunstwerk`, `valideer-manifest`).
- Het JSON-schema in Stap C komt exact overeen met `ImportBatchManifest` uit Taak 5.
- Er is geen stap die veronderstelt dat `kunstenaarnr` al bestaat zonder dat de "Harde
  afhankelijkheid"-waarschuwing bovenaan het bestand die dekt.

Een levende proefrun (2-3 testfoto's tegen staging) is pas mogelijk zodra de
kunstenaarnr-migratie (aparte sessie) op staging is uitgerold. Noteer dat als open
vervolgstap in de commit-boodschap hieronder — geen taak in dit plan wacht erop, maar de
eerste keer dat een mens deze skill echt gebruikt, is die controle nodig.

- [ ] **Step 4: Commit**

```bash
git add .gitignore ".claude/skills/import-kunstwerken/SKILL.md"
git commit -m "feat: import-kunstwerken skill (agent-procedure over de CLI uit taak 1-5)

Levende proefrun tegen staging kan pas zodra kunstenaarnr daar bestaat (zie
docs/superpowers/specs/2026-08-10-kunstenaarnummer-en-drukkernummer-design.md,
uitgevoerd in een aparte sessie)."
```
