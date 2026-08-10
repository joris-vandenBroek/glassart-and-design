# Toevoegen-kunstenaar skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een `toevoegen-kunstenaar` Claude Code skill die, op basis van een opgegeven website, de naam en een 4-talige omschrijving van een kunstenaar aanmaakt (met een vertaalde "meer weten"-verwijzing en een best-effort portretfoto), en de kunstenaar aanmaakt op staging of productie.

**Architecture:** Twee nieuwe subcommando's (`download-bestand`, `maak-kunstenaar`) op de al bestaande `scripts/import-kunstwerken-cli.ts` uit het `import-kunstwerken`-plan, die de al bestaande generieke bouwstenen hergebruiken (`baseUrlVoorOmgeving`, `logIn`, `uploadFoto`, `mimeTypeVoorBestand`, `dump-referentie`). `.claude/skills/toevoegen-kunstenaar/SKILL.md` is de agent-procedure eromheen: website ophalen, naam bevestigen, omschrijving schrijven, foto best-effort vinden/uploaden, dubbele-naam-check, aanmaken.

**Tech Stack:** Zelfde als `import-kunstwerken`: Node.js/TypeScript via `tsx`, Vitest met gemockte `fetch` voor de HTTP-laag en `spawnSync` voor CLI-argumentvalidatie.

Ontwerp: [`docs/superpowers/specs/2026-08-10-toevoegen-kunstenaar-skill-design.md`](../specs/2026-08-10-toevoegen-kunstenaar-skill-design.md).

## Global Constraints

- **Harde volgorde-afhankelijkheid: dit plan bouwt bovenop `scripts/lib/importHttp.ts` en `scripts/import-kunstwerken-cli.ts` uit het `import-kunstwerken`-plan (`docs/superpowers/plans/2026-08-10-import-kunstwerken-skill.md`).** Die bestanden moeten al bestaan en gecommit zijn vóór Taak 1 begint. Controleer dat met `git log --oneline -- scripts/lib/importHttp.ts` (moet minstens één commit tonen) vóórdat je start; bestaat het bestand nog niet, voer eerst dat plan uit.
- **Geen afhankelijkheid van `kunstenaarnr`** (in tegenstelling tot `import-kunstwerken`) — deze skill roept de bestaande `POST /api/kunstenaars` aan en geeft het teruggegeven record ongewijzigd door, ongeacht of dat straks `id` of `id` + `kunstenaarnr` bevat.
- **Geen nieuwe dependencies nodig** — `fetch`, `Buffer`, `node:fs/promises` zijn al beschikbaar (Node 20+, zie het `import-kunstwerken`-plan).
- **Geen echte netwerkaanroepen in de testsuite.** Zelfde patroon als `import-kunstwerken`: HTTP-functies getest met `vi.stubGlobal('fetch', fetchMock)`, CLI-argumentvalidatie getest via `spawnSync` op refusal-paden.
- **`npx tsc --noEmit` moet na elke taak exit 0 geven.**
- Regelnummers in dit plan zijn van 2026-08-10; zoek bij twijfel op de genoemde symboolnaam.

---

### Task 1: CLI-uitbreiding — `download-bestand` en `maak-kunstenaar`

**Files:**
- Modify: `scripts/lib/importHttp.ts` (nieuwe functies, geen bestaande gewijzigd)
- Modify: `scripts/import-kunstwerken-cli.ts` (twee nieuwe subcommando's)
- Modify: `tests/scripts/importHttp.test.ts`
- Modify: `tests/scripts/import-kunstwerken-cli.test.ts`

**Interfaces:**
- Consumes: `mimeTypeVoorBestand` (Taak 2 van `import-kunstwerken`), `baseUrlVoorOmgeving`/`omgevingOptie`/`verplichteOptie` (bestaand in de CLI).
- Produces: `downloadBestand(url: string, naarPad: string, fetchImpl?: typeof fetch): Promise<void>`
- Produces: `interface NieuweKunstenaar { naam: string; foto: string | null; omschrijvingNl: string; omschrijvingEn: string; omschrijvingDe: string; omschrijvingFr: string; exclusieveKlantIds: string[]; }`
- Produces: `maakKunstenaar(baseUrl: string, sessieCookie: string, kunstenaar: NieuweKunstenaar, fetchImpl?: typeof fetch): Promise<Record<string, unknown>>`
- Produces: CLI-subcommando's `download-bestand --url <url> --naar <pad>` en `maak-kunstenaar --omgeving <omgeving> --sessie-cookie <cookie> --json <json>`.

- [ ] **Step 1: Controleer de volgorde-afhankelijkheid**

```bash
git log --oneline -- scripts/lib/importHttp.ts
```

Verwacht: minstens één commit. Geen output → stop en voer eerst
`docs/superpowers/plans/2026-08-10-import-kunstwerken-skill.md` uit.

- [ ] **Step 2: Schrijf de falende tests**

Voeg toe aan `tests/scripts/importHttp.test.ts` (na de bestaande `describe`-blokken, met
dezelfde `jsonResponse`-helper die daar al staat):

```ts
import { downloadBestand, maakKunstenaar } from '../../scripts/lib/importHttp';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('downloadBestand', () => {
  it('schrijft de opgehaalde inhoud naar het opgegeven pad', async () => {
    const inhoud = new TextEncoder().encode('foto-inhoud').buffer;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => inhoud,
    });
    const pad = path.join(os.tmpdir(), `download-bestand-test-${Date.now()}.bin`);
    try {
      await downloadBestand('https://example.com/foto.jpg', pad, fetchMock);
      expect(fs.readFileSync(pad, 'utf8')).toBe('foto-inhoud');
    } finally {
      fs.unlinkSync(pad);
    }
  });

  it('gooit een fout en schrijft niets bij een mislukte download', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const pad = path.join(os.tmpdir(), `download-bestand-test-mislukt-${Date.now()}.bin`);
    await expect(downloadBestand('https://example.com/weg.jpg', pad, fetchMock)).rejects.toThrow('mislukt');
    expect(fs.existsSync(pad)).toBe(false);
  });
});

describe('maakKunstenaar', () => {
  const kunstenaar = {
    naam: 'Jack',
    foto: 'https://cdn.example.com/jack.jpg',
    omschrijvingNl: 'Nl',
    omschrijvingEn: 'En',
    omschrijvingDe: 'De',
    omschrijvingFr: 'Fr',
    exclusieveKlantIds: [],
  };

  it('geeft het aangemaakte record terug bij succes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'k1', naam: 'Jack' }));
    const resultaat = await maakKunstenaar('https://staging.glassartanddesign.com', 'session_id=abc', kunstenaar, fetchMock);
    expect(resultaat).toEqual({ id: 'k1', naam: 'Jack' });
    const [endpoint, options] = fetchMock.mock.calls[0];
    expect(endpoint).toBe('https://staging.glassartanddesign.com/api/kunstenaars');
    expect(JSON.parse(options.body)).toEqual(kunstenaar);
  });

  it('gooit een fout bij een mislukte aanmaak', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: 'unauthorized' }));
    await expect(
      maakKunstenaar('https://staging.glassartanddesign.com', 'session_id=abc', kunstenaar, fetchMock)
    ).rejects.toThrow('mislukt');
  });
});
```

Voeg toe aan `tests/scripts/import-kunstwerken-cli.test.ts`, in het bestaande
`describe('import-kunstwerken-cli argumentvalidatie', ...)`-blok:

```ts
  it('weigert download-bestand zonder --url', () => {
    const result = runCli(['download-bestand', '--naar', 'foo.jpg']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--url is verplicht');
  });

  it('weigert download-bestand zonder --naar', () => {
    const result = runCli(['download-bestand', '--url', 'https://example.com/foto.jpg']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--naar is verplicht');
  });

  it('weigert maak-kunstenaar zonder --omgeving', () => {
    const result = runCli(['maak-kunstenaar']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--omgeving is verplicht');
  });
```

- [ ] **Step 3: Draai de tests om te zien dat ze falen**

```bash
npx vitest run tests/scripts/importHttp.test.ts tests/scripts/import-kunstwerken-cli.test.ts
```

Verwacht: de nieuwe `downloadBestand`/`maakKunstenaar`-tests FAIL (bestaan nog niet in
`importHttp.ts`); de nieuwe CLI-tests FAIL (onbekend subcommando, generieke foutmelding in
plaats van de specifieke `--url`/`--naar`/`--omgeving`-teksten).

- [ ] **Step 4: Breid `scripts/lib/importHttp.ts` uit**

Voeg toe aan het eind van `scripts/lib/importHttp.ts` (imports `fs` en `mimeTypeVoorBestand`
staan daar al bovenaan):

```ts
export async function downloadBestand(
  url: string,
  naarPad: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Downloaden van ${url} mislukt (status ${response.status}).`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(naarPad, buffer);
}

export interface NieuweKunstenaar {
  naam: string;
  foto: string | null;
  omschrijvingNl: string;
  omschrijvingEn: string;
  omschrijvingDe: string;
  omschrijvingFr: string;
  exclusieveKlantIds: string[];
}

export async function maakKunstenaar(
  baseUrl: string,
  sessieCookie: string,
  kunstenaar: NieuweKunstenaar,
  fetchImpl: typeof fetch = fetch
): Promise<Record<string, unknown>> {
  const response = await fetchImpl(`${baseUrl}/api/kunstenaars`, {
    method: 'POST',
    headers: { cookie: sessieCookie, 'content-type': 'application/json' },
    body: JSON.stringify(kunstenaar),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(
      `Aanmaken van kunstenaar '${kunstenaar.naam}' op ${baseUrl} mislukt: ${data?.error ?? response.status}`
    );
  }
  return (await response.json()) as Record<string, unknown>;
}
```

- [ ] **Step 5: Breid `scripts/import-kunstwerken-cli.ts` uit**

In de imports bovenaan, breid de bestaande `import { ... } from './lib/importHttp';` uit met
`downloadBestand`, `maakKunstenaar` en `type NieuweKunstenaar`.

In `SUBCOMMANDS`, voeg toe: `'download-bestand'` en `'maak-kunstenaar'`.

In de `switch (subcommand)`, voeg twee nieuwe `case`-blokken toe (vóór de sluitende `}` van
de switch):

```ts
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
```

- [ ] **Step 6: Draai de tests om te zien dat ze slagen**

```bash
npx vitest run tests/scripts/importHttp.test.ts tests/scripts/import-kunstwerken-cli.test.ts
```

Verwacht: alle tests PASS, inclusief de al bestaande van het `import-kunstwerken`-plan (niets
daarvan is gewijzigd, alleen aangevuld).

- [ ] **Step 7: Typecheck, volledige suite en commit**

```bash
npx tsc --noEmit
npm test
git add scripts/lib/importHttp.ts scripts/import-kunstwerken-cli.ts tests/scripts/importHttp.test.ts tests/scripts/import-kunstwerken-cli.test.ts
git commit -m "feat: download-bestand en maak-kunstenaar subcommando's voor de import-kunstwerken CLI"
```

---

### Task 2: De skill zelf — `.claude/skills/toevoegen-kunstenaar/SKILL.md`

**Files:**
- Create: `.claude/skills/toevoegen-kunstenaar/SKILL.md`

**Interfaces:**
- Consumes: `login`, `dump-referentie`, `upload-foto` (bestaand), `download-bestand`,
  `maak-kunstenaar` (Taak 1).

- [ ] **Step 1: Schrijf de skill**

`.claude/skills/toevoegen-kunstenaar/SKILL.md`:

````markdown
---
name: toevoegen-kunstenaar
description: Maak een nieuwe kunstenaar aan op basis van diens website — naam bepalen (met bevestiging), 4-talige omschrijving met "meer weten"-verwijzing, best-effort portretfoto, op staging of productie.
---

# Toevoegen-kunstenaar

Ontwerp: `docs/superpowers/specs/2026-08-10-toevoegen-kunstenaar-skill-design.md`.

Gebruikt dezelfde CLI als de `import-kunstwerken`-skill: `npx tsx
scripts/import-kunstwerken-cli.ts <subcommando> [opties]` (of `npm run import:kunstwerken --
<subcommando> [opties]`), uitgevoerd vanuit de projectroot
(`C:\projecten\Glassart and design`).

## Stap 1: website vragen

Vraag: "Wat is de website van de kunstenaar? (laat leeg als die er niet is)".

- **Leeg** → vraag de naam direct, vraag een korte omschrijving (een paar zinnen) waarmee
  je zelf een 4-talige omschrijving schrijft (geen "meer weten"-zin, geen fotopoging). Ga
  naar Stap 5.
- **Ingevuld** → onthoud de URL, ga naar Stap 2.

## Stap 2: naam bepalen

Haal de website op (WebFetch) met een prompt gericht op: de naam van de kunstenaar/maker
van de site, en een eventuele "over mij"/bio-tekst. Bewaar het resultaat — je gebruikt het
zowel hier als in Stap 3 en 4.

- **Naam herkend** → toon hem en vraag expliciet: "Klopt dit — heet de kunstenaar
  `<gevonden naam>`?" Bij een correctie, gebruik de door de gebruiker opgegeven naam.
- **Niet herkend** → vraag de naam direct.

Bepaal de **voornaam** als het eerste woord van de (bevestigde) naam — die gebruik je in
Stap 3.

## Stap 3: omschrijving schrijven

Schrijf een compacte, wervende omschrijving (2-4 zinnen) op basis van wat er daadwerkelijk
op de website staat — niets verzinnen. In het Nederlands, Engels, Duits en Frans.

Voeg aan elke taalversie, als laatste zin, de vertaalde verwijzing toe:

- NL: `Meer weten over <Voornaam>? Bekijk <website>`
- EN: `Want to know more about <Voornaam>? Visit <website>`
- DE: `Mehr über <Voornaam> erfahren? Besuchen Sie <website>`
- FR: `En savoir plus sur <Voornaam>? Visitez <website>`

## Stap 4: foto zoeken (best-effort)

Zoek in de opgehaalde website-inhoud naar een kandidaat-portretfoto (bijv. een `og:image`
meta-tag, of een afbeelding die duidelijk bij de "over mij"/bio-sectie hoort). Vind je een
URL met een herkenbare extensie (`.jpg`, `.jpeg`, `.png`, `.webp`):

```
npx tsx scripts/import-kunstwerken-cli.ts download-bestand --url "<foto-url>" --naar "<scratchpad-pad>/kunstenaar-foto.<extensie>"
```

Bij succes ga je in Stap 7 de foto uploaden (dat gebeurt ná Stap 5/6, zodra de omgeving en
sessiecookie bekend zijn — `upload-foto` heeft die nodig). Lukt downloaden niet, of is er
geen bruikbare kandidaat, of heeft de URL geen herkenbare extensie: ga verder zonder foto
(`foto: null` in Stap 6), en meld dit in de eindsamenvatting. Niets hiervan blokkeert het
aanmaken van de kunstenaar.

## Stap 5: omgeving

Vraag: "staging" of "productie", default staging. Log in:

```
npx tsx scripts/import-kunstwerken-cli.ts login --omgeving <omgeving>
```

Vang de teruggegeven regel op als `<cookie>`.

## Stap 6: dubbele-naam-check

```
npx tsx scripts/import-kunstwerken-cli.ts dump-referentie --omgeving <omgeving> --sessie-cookie "<cookie>"
```

Vergelijk de (bevestigde) naam, getrimd en hoofdletterongevoelig, tegen
`referentie.kunstenaars[].naam`. Bij een treffer: toon deze aan de gebruiker en vraag
expliciet of je toch moet doorzetten. Bij "nee": stop hier.

## Stap 7: foto uploaden (alleen als Stap 4 een lokaal bestand opleverde)

```
npx tsx scripts/import-kunstwerken-cli.ts upload-foto --omgeving <omgeving> --sessie-cookie "<cookie>" --pad "<scratchpad-pad>/kunstenaar-foto.<extensie>"
```

Geeft `{"url":"..."}` — dat wordt het `foto`-veld in Stap 8. Mislukt dit alsnog: `foto: null`,
meld het.

## Stap 8: aanmaken

```
npx tsx scripts/import-kunstwerken-cli.ts maak-kunstenaar --omgeving <omgeving> --sessie-cookie "<cookie>" --json '{"naam":"<naam>","foto":<foto-url of null>,"omschrijvingNl":"...","omschrijvingEn":"...","omschrijvingDe":"...","omschrijvingFr":"...","exclusieveKlantIds":[]}'
```

## Stap 9: samenvatting

Meld: naam, omgeving, of er een foto is meegenomen (en zo niet: waarom niet), of de "meer
weten"-zin is toegevoegd, en het teruggegeven record (bevat `id`, en zodra de
kunstenaarnummer-migratie geland is ook `kunstenaarnr`).

## Foutafhandeling

- Website niet bereikbaar (WebFetch mislukt) → behandel als "geen website": val terug op
  Stap 1's lege-website-pad (naam en omschrijving handmatig).
- Naam-dubbele-check-treffer + gebruiker bevestigt niet → stop, geen aanmaak.
- Inloggen mislukt (Stap 5) → stop, er is nog niets geschreven.
- `maak-kunstenaar` mislukt (bijv. serverfout) → toon de foutmelding, stop; geen automatische
  retry (in tegenstelling tot `import-kunstwerken`'s codeconflict-retry — hier is er geen
  vergelijkbare, onschadelijke oorzaak om blind opnieuw te proberen).

## Wat deze skill bewust niet doet

- Wijzigt geen bestaande kunstenaars — uitsluitend aanmaken.
- Garandeert niet dat de gevonden naam/omschrijving/foto correct is — de website is de enige
  bron; bij twijfel valt het terug op handmatige input of wordt de foto overgeslagen.
- Wordt nog niet automatisch aangeroepen vanuit `import-kunstwerken` — dat is een losse,
  latere aanpassing aan die skill.
````

- [ ] **Step 2: Handmatige inhoudscontrole**

Lees `.claude/skills/toevoegen-kunstenaar/SKILL.md` in zijn geheel terug en controleer:
- Elke CLI-aanroep komt letterlijk overeen met een subcommando/optie uit Taak 1 van dit plan
  of uit het `import-kunstwerken`-plan (`login`, `dump-referentie`, `upload-foto`,
  `download-bestand`, `maak-kunstenaar`).
- Het `--json`-object in Stap 8 komt exact overeen met `NieuweKunstenaar` uit Taak 1.
- Er wordt nergens verondersteld dat `import-kunstwerken` deze skill al aanroept (dat is
  bewust nog niet gebouwd, zie het ontwerp).

- [ ] **Step 3: Commit**

```bash
git add ".claude/skills/toevoegen-kunstenaar/SKILL.md"
git commit -m "feat: toevoegen-kunstenaar skill (agent-procedure over de CLI-subcommando's uit taak 1)"
```
