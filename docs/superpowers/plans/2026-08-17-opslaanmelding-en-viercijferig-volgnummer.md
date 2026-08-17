# Opslaanmelding en viercijferig volgnummer — implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Het kunstwerk-formulier in beheer vertelt voortaan precies waarom opslaan niet lukt, en het volgnummer in een kunstwerkcode is vier posities in plaats van vijf.

**Architecture:** Twee onafhankelijke sporen in hetzelfde scherm. Spoor A (taken 2 en 3) raakt alleen `KunstwerkenSection.tsx`, `useApiCollection.ts` en `messages/nl.json`. Spoor B (taken 1, 4, 5, 6) raakt de twee code-helpers in `src/lib/`, de handleiding en de data. De migratie is al geschreven en staat klaar in `db/migrations/`.

**Tech Stack:** Next.js 14 App Router, TypeScript, React, `next-intl`, Vitest + Testing Library, raw MySQL via `mysql2`.

## Global Constraints

- **Beheer-teksten alleen in `messages/nl.json`.** De secties `beheer` in `en.json`/`de.json`/`fr.json` bestaan niet; voeg ze niet toe.
- **Nieuwe sleutels horen alfabetisch tussen de bestaande `kunstwerken*`-sleutels** in het `beheer`-blok van `messages/nl.json`, zoals de rest van dat blok.
- **`npm test` draait tegen de echte staging-database.** Geen enkele test in dit plan mag data schrijven of verwijderen; het zijn allemaal unit- en componenttests.
- **Volgnummerbreedte is 4**, overal: patrooncontrole én voorstel.
- Testcommando's draaien vanuit de worktree `.claude/worktrees/kunstwerk-code-4-cijfers`.

---

### Task 1: Patroon en voorstel naar vier cijfers

**Files:**
- Modify: `src/lib/kunstwerkCodePatroon.ts:1`
- Modify: `src/lib/kunstwerkCodeVoorstel.ts:5-49`
- Test: `tests/lib/kunstwerkCodePatroon.test.ts`
- Test: `tests/lib/kunstwerkCodeVoorstel.test.ts`

**Interfaces:**
- Consumes: niets uit eerdere taken.
- Produces: `voldoetAanStandaardKunstwerkCode(code: string): boolean` (ongewijzigde signatuur, striktere regel), `stelVolgendeCodeVoor(kunstwerken: KunstwerkCode[], prefix: string): string` (ongewijzigde signatuur, vaste breedte 4 en prefix-schoonmaak), `vindBekendePrefixen(kunstwerken: KunstwerkCode[]): string[]` (ongewijzigd).

- [ ] **Step 1: Werk de bestaande patroontests bij naar vier cijfers**

In `tests/lib/kunstwerkCodePatroon.test.ts` verwisselen de goed- en afkeurgevallen van plaats. Vervang de vier `it`-blokken die codes met vijf cijfers noemen door:

```ts
  it('accepteert het standaardformaat: drie letters, streepje, drie letters, streepje, vier cijfers', () => {
    expect(voldoetAanStandaardKunstwerkCode('GLA-JAC-0001')).toBe(true);
    expect(voldoetAanStandaardKunstwerkCode('GLA-AFR-0007')).toBe(true);
  });

  it('accepteert na trimmen van omringende spaties', () => {
    expect(voldoetAanStandaardKunstwerkCode('  GLA-JAC-0001  ')).toBe(true);
  });

  it('weigert kleine letters, ook als de vorm verder klopt', () => {
    expect(voldoetAanStandaardKunstwerkCode('gla-jac-0001')).toBe(false);
  });

  it('weigert een verkeerd aantal cijfers, ook het oude vijfcijferige formaat', () => {
    expect(voldoetAanStandaardKunstwerkCode('GLA-JAC-001')).toBe(false);
    expect(voldoetAanStandaardKunstwerkCode('GLA-JAC-00001')).toBe(false);
  });

  it('weigert een verkeerd aantal letters of een ontbrekend streepje', () => {
    expect(voldoetAanStandaardKunstwerkCode('GLAA-JAC-0001')).toBe(false);
    expect(voldoetAanStandaardKunstwerkCode('GLAJAC0001')).toBe(false);
    expect(voldoetAanStandaardKunstwerkCode('GLA-JA-0001')).toBe(false);
  });
```

De twee overige blokken (`Akoestische stof` en de lege string) blijven ongewijzigd.

- [ ] **Step 2: Draai de test en controleer dat hij faalt**

Run: `npx vitest run tests/lib/kunstwerkCodePatroon.test.ts`
Expected: FAIL — `GLA-JAC-0001` levert `false` en `GLA-JAC-00001` levert `true`.

- [ ] **Step 3: Zet het patroon op vier cijfers**

Vervang de eerste regel van `src/lib/kunstwerkCodePatroon.ts`:

```ts
const STANDAARD_KUNSTWERK_CODE = /^[A-Z]{3}-[A-Z]{3}-\d{4}$/;
```

- [ ] **Step 4: Draai de test en controleer dat hij slaagt**

Run: `npx vitest run tests/lib/kunstwerkCodePatroon.test.ts`
Expected: PASS

- [ ] **Step 5: Schrijf de voorsteltests om naar vaste breedte 4**

Vervang in `tests/lib/kunstwerkCodeVoorstel.test.ts` de constante bovenaan en het hele `describe('stelVolgendeCodeVoor', …)`-blok. Het `describe('vindBekendePrefixen', …)`-blok blijft ongewijzigd, behalve de codes in `KUNSTWERKEN`:

```ts
const KUNSTWERKEN = [
  { code: 'GLA-AFR-0007' },
  { code: 'GLA-AFR-0003' },
  { code: 'GLA-JAC-0012' },
  { code: 'Dan-02424' },
  { code: 'Akoestische stof' }, // geen streepje
  { code: 'GLA-AFR-oud' }, // niet-numerieke staart
];
```

```ts
describe('stelVolgendeCodeVoor', () => {
  it('telt het hoogste bestaande nummer bij dat prefix op met 1', () => {
    expect(stelVolgendeCodeVoor(KUNSTWERKEN, 'GLA-AFR')).toBe('GLA-AFR-0008');
  });

  it('vergelijkt het prefix hoofdletterongevoelig maar gebruikt de getypte schrijfwijze in het resultaat', () => {
    expect(stelVolgendeCodeVoor(KUNSTWERKEN, 'gla-afr')).toBe('gla-afr-0008');
  });

  it('gebruikt altijd vier cijfers, ongeacht de breedte van bestaande codes', () => {
    const kunstwerken = [{ code: 'GLA-AFR-007' }, { code: 'GLA-AFR-00042' }];
    expect(stelVolgendeCodeVoor(kunstwerken, 'GLA-AFR')).toBe('GLA-AFR-0043');
  });

  it('laat de breedte vanzelf meegroeien bij een overloop voorbij 9999', () => {
    expect(stelVolgendeCodeVoor([{ code: 'GLA-AFR-9999' }], 'GLA-AFR')).toBe('GLA-AFR-10000');
  });

  it('negeert codes zonder streepje en met een niet-numerieke staart bij het tellen', () => {
    expect(stelVolgendeCodeVoor(KUNSTWERKEN, 'Dan')).toBe('Dan-2425');
  });

  it('start op 0001 voor een gloednieuw prefix', () => {
    expect(stelVolgendeCodeVoor(KUNSTWERKEN, 'GLA-NIEUW')).toBe('GLA-NIEUW-0001');
    expect(stelVolgendeCodeVoor([], 'Iets')).toBe('Iets-0001');
  });

  it('trimt het opgegeven prefix', () => {
    expect(stelVolgendeCodeVoor(KUNSTWERKEN, '  GLA-AFR  ')).toBe('GLA-AFR-0008');
  });

  it('haalt een meegetypt volgnummer van het prefix af', () => {
    // Zo ontstonden de codes GLA-ABS-0028-00001 en GLA-ANI-015-00001 in de echte data:
    // iemand zette een hele code in het prefix-veld.
    expect(stelVolgendeCodeVoor(KUNSTWERKEN, 'GLA-AFR-0007')).toBe('GLA-AFR-0008');
    expect(stelVolgendeCodeVoor(KUNSTWERKEN, 'GLA-NIEUW-0031')).toBe('GLA-NIEUW-0001');
  });
});
```

- [ ] **Step 6: Draai de test en controleer dat hij faalt**

Run: `npx vitest run tests/lib/kunstwerkCodeVoorstel.test.ts`
Expected: FAIL — vijfcijferige uitkomsten (`GLA-AFR-00008`) en `GLA-AFR-0007-0001` bij het laatste blok.

- [ ] **Step 7: Zet het voorstel op vaste breedte 4 met prefix-schoonmaak**

Vervang in `src/lib/kunstwerkCodeVoorstel.ts` alles vanaf `interface CodeOnderdelen` tot en met het einde van `stelVolgendeCodeVoor`. `vindBekendePrefixen` blijft staan zoals het is; alleen `ontleedCode` verliest zijn `breedte`-veld, dat na de vaste breedte nergens meer gelezen wordt.

```ts
interface CodeOnderdelen {
  prefix: string;
  getal: number;
}

function ontleedCode(code: string): CodeOnderdelen | null {
  const laatsteStreepje = code.lastIndexOf('-');
  if (laatsteStreepje === -1) return null;
  const prefix = code.slice(0, laatsteStreepje);
  const staart = code.slice(laatsteStreepje + 1);
  if (!/^\d+$/.test(staart)) return null;
  return { prefix, getal: parseInt(staart, 10) };
}
```

Daaronder, in plaats van `const NIEUW_PREFIX_BREEDTE = 5;` en de oude `stelVolgendeCodeVoor`:

```ts
const VOLGNUMMER_BREEDTE = 4;

/**
 * Haalt een afsluitend volgnummer van een prefix af. Het prefix-veld in beheer is vrije
 * tekst met een keuzelijst; wie daar een héle code in plakt kreeg voorheen een volgnummer
 * áchter die code geplakt. Zo zijn GLA-ABS-0028-00001 en GLA-ANI-015-00001 in de echte
 * data ontstaan, en omdat de prefixlijst uit de bestaande codes wordt afgeleid, kwam die
 * foute prefix daarna ook nog in de keuzelijst terecht.
 */
function schoonPrefix(prefix: string): string {
  return prefix.trim().replace(/-\d+$/, '');
}

export function stelVolgendeCodeVoor(kunstwerken: KunstwerkCode[], prefix: string): string {
  const getrimdePrefix = schoonPrefix(prefix);
  const sleutel = getrimdePrefix.toLowerCase();
  const treffers = kunstwerken
    .map(({ code }) => ontleedCode(code))
    .filter(
      (onderdelen): onderdelen is CodeOnderdelen =>
        onderdelen !== null && onderdelen.prefix.toLowerCase() === sleutel
    );

  // Vaste breedte, niet meer de breedte van de breedste bestaande code van dit prefix.
  // Die regel bestond om een lopende reeks niet halverwege van breedte te laten wisselen,
  // maar na de migratie van 17-08-2026 is elke reeks vier cijfers breed en zou hij een
  // oude breedte alleen nog maar kunnen laten terugkomen. Voorbij 9999 wint het getal van
  // de breedte -- dan wijkt de code af van het standaardpatroon en vraagt beheer bij het
  // opslaan om een bevestiging, wat precies het bedoelde signaal is.
  const hoogsteGetal = treffers.length === 0 ? 0 : Math.max(...treffers.map((t) => t.getal));
  return `${getrimdePrefix}-${String(hoogsteGetal + 1).padStart(VOLGNUMMER_BREEDTE, '0')}`;
}
```

- [ ] **Step 8: Draai beide libtests en de schermtest**

Run: `npx vitest run tests/lib/kunstwerkCodeVoorstel.test.ts tests/lib/kunstwerkCodePatroon.test.ts tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: de twee libtests PASS. `KunstwerkenSection.test.tsx` faalt hier: op regel 281/289 staat `GLA-VIB-00001` en op regel 457/458/465 `GLA-NKW-00001`, en die codes voldoen niet meer aan het patroon — het scherm vraagt nu om een bevestiging waar die tests er geen verwachten. Vervang in dat bestand `GLA-VIB-00001` door `GLA-VIB-0001` en `GLA-NKW-00001` door `GLA-NKW-0001` (op alle plekken, ook in de `expect`-blokken) en draai opnieuw tot alle drie slagen. Let op: `KU-00001` op regel 65/235/252/282/458 is een kunstenaarnummer, geen kunstwerkcode — dat blijft vijfcijferig en mag je niet aanpassen.

- [ ] **Step 9: Commit**

```bash
git add src/lib/kunstwerkCodePatroon.ts src/lib/kunstwerkCodeVoorstel.ts tests/lib/kunstwerkCodePatroon.test.ts tests/lib/kunstwerkCodeVoorstel.test.ts tests/components/beheer/KunstwerkenSection.test.tsx
git commit -m "feat: volgnummer in kunstwerkcode naar vier posities"
```

---

### Task 2: Opsomming van wat er ontbreekt bij de Opslaan-knop

**Files:**
- Modify: `src/components/beheer/KunstwerkenSection.tsx:515-527` (de fout-vlaggen en `opslaanDisabled`)
- Modify: `src/components/beheer/KunstwerkenSection.tsx:1268-1274` (het blok met `RequiredLegend` en de foutmelding)
- Modify: `messages/nl.json` (beheer-blok)
- Test: `tests/components/beheer/KunstwerkenSection.test.tsx`

**Interfaces:**
- Consumes: niets uit eerdere taken.
- Produces: `data-testid="kunstwerk-modal-ontbrekend"` — het blok met de opsomming, alleen aanwezig als opslaan geblokkeerd is.

- [ ] **Step 1: Voeg de nieuwe teksten toe aan `messages/nl.json`**

In het `beheer`-blok, alfabetisch tussen de bestaande `kunstwerken*`-sleutels:

```json
    "kunstwerkenOntbreektCode": "Code ontbreekt (tabblad Algemeen)",
    "kunstwerkenOntbreektFormaat": "Formaat niet gekozen (tabblad Algemeen)",
    "kunstwerkenOntbreektFoto": "Foto ontbreekt (tabblad Algemeen)",
    "kunstwerkenOntbreektKunstenaar": "Kunstenaar niet gekozen (tabblad Algemeen)",
    "kunstwerkenOntbreektOmschrijvingNl": "Nederlandse omschrijving ontbreekt (tabblad Omschrijvingen)",
    "kunstwerkenOntbreektPrijsPerM2": "Prijs per m² ontbreekt (tabblad Maten)",
    "kunstwerkenOntbreektUploadBezig": "De foto wordt nog geüpload",
    "kunstwerkenOpslaanKanNiet": "Opslaan kan nog niet:",
```

- [ ] **Step 2: Schrijf de falende tests**

Voeg onderaan `tests/components/beheer/KunstwerkenSection.test.tsx` toe, binnen het bestaande buitenste `describe`:

```tsx
  describe('opsomming waarom opslaan nog niet kan', () => {
    it('noemt elk ontbrekend veld bij een leeg nieuw kunstwerk', () => {
      renderSection();
      fireEvent.click(screen.getByTestId('kunstwerken-add'));

      const blok = screen.getByTestId('kunstwerk-modal-ontbrekend');
      expect(blok).toHaveTextContent('Foto ontbreekt');
      expect(blok).toHaveTextContent('Code ontbreekt');
      expect(blok).toHaveTextContent('Formaat niet gekozen');
      expect(blok).toHaveTextContent('Kunstenaar niet gekozen');
      expect(blok).toHaveTextContent('Nederlandse omschrijving ontbreekt');
    });

    it('laat een reden verdwijnen zodra het veld ingevuld is', () => {
      renderSection();
      fireEvent.click(screen.getByTestId('kunstwerken-add'));
      expect(screen.getByTestId('kunstwerk-modal-ontbrekend')).toHaveTextContent('Code ontbreekt');

      fireEvent.change(screen.getByTestId('kunstwerk-modal-code'), { target: { value: 'GLA-JAC-0001' } });

      expect(screen.getByTestId('kunstwerk-modal-ontbrekend')).not.toHaveTextContent('Code ontbreekt');
      expect(screen.getByTestId('kunstwerk-modal-ontbrekend')).toHaveTextContent('Foto ontbreekt');
    });

    it('toont geen opsomming bij een bestaand, compleet kunstwerk', () => {
      renderSection();
      fireEvent.click(screen.getByTestId('data-table-row-kw-1'));

      expect(screen.queryByTestId('kunstwerk-modal-ontbrekend')).toBeNull();
      expect(screen.getByTestId('kunstwerk-modal-opslaan')).not.toBeDisabled();
    });
  });
```

`data-table-row-kw-1` is de manier waarop de bestaande tests een kunstwerk openen (zie o.a. regel 308). Fixture `kw-1` heeft foto, code, formaat en een Nederlandse omschrijving, en is dus compleet; dat het geen kunstenaar heeft maakt niet uit, want die eis geldt alleen bij een nieuw kunstwerk.

- [ ] **Step 3: Draai de tests en controleer dat ze falen**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx -t "opsomming waarom opslaan"`
Expected: FAIL — `Unable to find an element by: [data-testid="kunstwerk-modal-ontbrekend"]`

- [ ] **Step 4: Bouw de opsomming**

Vervang in `src/components/beheer/KunstwerkenSection.tsx` het blok dat begint bij `const algemeenHeeftFout =` tot en met de afsluiting van `const opslaanDisabled = …;` door:

```tsx
  const algemeenHeeftFout = !foto || !code.trim() || formaat === null || kunstenaarHeeftFout;
  const prijsPerM2HeeftFout = isMateriaalloos && (!prijsPerM2 || Number(prijsPerM2) <= 0);
  const matenHeeftFout = prijsPerM2HeeftFout;
  const omschrijvingenHeeftFout = !omschrijvingNl;

  // Eén lijst die zowel de knop uitschakelt als vertelt waarom. Ze uit elkaar houden was
  // precies het probleem: de knop werd grijs zonder dat ergens stond wat eraan mankeerde,
  // en wie op een ander tabblad stond zag alleen een rood bolletje.
  const redenenGeenOpslaan: string[] = [];
  if (uploading) redenenGeenOpslaan.push(t('kunstwerkenOntbreektUploadBezig'));
  if (!foto) redenenGeenOpslaan.push(t('kunstwerkenOntbreektFoto'));
  if (!code.trim()) redenenGeenOpslaan.push(t('kunstwerkenOntbreektCode'));
  if (formaat === null) redenenGeenOpslaan.push(t('kunstwerkenOntbreektFormaat'));
  if (kunstenaarHeeftFout) redenenGeenOpslaan.push(t('kunstwerkenOntbreektKunstenaar'));
  if (prijsPerM2HeeftFout) redenenGeenOpslaan.push(t('kunstwerkenOntbreektPrijsPerM2'));
  if (!omschrijvingNl) redenenGeenOpslaan.push(t('kunstwerkenOntbreektOmschrijvingNl'));

  const opslaanDisabled = redenenGeenOpslaan.length > 0;
```

- [ ] **Step 5: Toon de opsomming boven de knop**

In dezelfde file, in het blok met `RequiredLegend`, direct vóór de bestaande `{(actionError || mutationFailed) && (`-regel:

```tsx
              {redenenGeenOpslaan.length > 0 && (
                <div data-testid="kunstwerk-modal-ontbrekend" className="text-xs text-amber-300/90">
                  <p className="font-semibold">{t('kunstwerkenOpslaanKanNiet')}</p>
                  <ul className="mt-1 list-disc pl-4">
                    {redenenGeenOpslaan.map((reden) => (
                      <li key={reden}>{reden}</li>
                    ))}
                  </ul>
                </div>
              )}
```

- [ ] **Step 6: Draai de tests en controleer dat ze slagen**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: PASS — het hele bestand, niet alleen de nieuwe blokken.

- [ ] **Step 7: Commit**

```bash
git add src/components/beheer/KunstwerkenSection.tsx messages/nl.json tests/components/beheer/KunstwerkenSection.test.tsx
git commit -m "feat: toon bij het kunstwerk-formulier waarom opslaan nog niet kan"
```

---

### Task 3: Elke serverfout krijgt een eigen tekst

**Files:**
- Modify: `src/lib/useApiCollection.ts:24-32` (`leesFoutcode`) en de drie `catch`-blokken in `add`/`update`/`remove`
- Modify: `src/components/beheer/KunstwerkenSection.tsx:612-622` (`mutatieFoutmelding`)
- Modify: `messages/nl.json` (beheer-blok)
- Test: `tests/components/beheer/KunstwerkenSection.test.tsx`
- Test: `tests/lib/useApiCollection.test.ts` (bestaat mogelijk nog niet — dan aanmaken)

**Interfaces:**
- Consumes: `data-testid="kunstwerk-modal-error"` uit de bestaande code.
- Produces: `lastMutationErrorCode` is voortaan `string | null` waarbij `null` alleen nog "er is geen mislukte mutatie geweest" betekent; een mislukte mutatie levert altijd een string — de servercode, `http-<status>` of `netwerkfout`.

- [ ] **Step 1: Voeg de nieuwe teksten toe aan `messages/nl.json`**

In het `beheer`-blok, alfabetisch tussen de bestaande `kunstwerken*`-sleutels:

```json
    "kunstwerkenCodeVerplicht": "De code is verplicht.",
    "kunstwerkenDubbeleRelatie": "Een kenmerk is dubbel gekoppeld. Haal de dubbele keuze weg en probeer het opnieuw.",
    "kunstwerkenNetwerkfout": "Geen verbinding met de server. Controleer je internetverbinding en probeer het opnieuw.",
    "kunstwerkenNietGevonden": "Dit kunstwerk bestaat niet meer — iemand anders heeft het verwijderd. Ververs het scherm.",
    "kunstwerkenOnbekendeFout": "Er ging iets mis (foutcode: {code}). Meld deze code als het blijft gebeuren.",
    "kunstwerkenServerfout": "De server kon dit niet verwerken. Probeer het opnieuw; blijft het misgaan, meld dit dan.",
    "kunstwerkenSessieVerlopen": "Je sessie is verlopen. Log opnieuw in en probeer het nogmaals.",
```

- [ ] **Step 2: Schrijf de falende schermtest**

Onderaan `tests/components/beheer/KunstwerkenSection.test.tsx`, binnen het bestaande buitenste `describe`:

```tsx
  describe('foutmelding na een mislukte mutatie', () => {
    async function faalOpslaan(actionErrorCode: string | null) {
      const onUpdate = vi.fn().mockResolvedValue(false);
      renderSection({ onUpdate, actionErrorCode });
      fireEvent.click(screen.getByTestId('data-table-row-kw-1'));
      fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));
      return await screen.findByTestId('kunstwerk-modal-error');
    }

    it('vertaalt een code die het scherm kent', async () => {
      expect(await faalOpslaan('not-found')).toHaveTextContent('bestaat niet meer');
    });

    it('vertelt dat de sessie verlopen is bij unauthorized', async () => {
      expect(await faalOpslaan('unauthorized')).toHaveTextContent('sessie is verlopen');
    });

    it('noemt de technische code letterlijk bij een onbekende code', async () => {
      expect(await faalOpslaan('iets-heel-nieuws')).toHaveTextContent('foutcode: iets-heel-nieuws');
    });

    it('valt terug op de algemene tekst zonder code', async () => {
      expect(await faalOpslaan(null)).toHaveTextContent('Er is iets misgegaan');
    });
  });
```

Let op: fixture `kw-1` moet compleet blijven, anders is de Opslaan-knop uitgeschakeld door Task 2 en gebeurt er niets bij de klik. De code van `kw-1` is `Hotel paneel 1` en wijkt bewust af van het standaardpatroon; omdat hij niet gewijzigd wordt, verschijnt er geen bevestigingspopup en gaat de klik rechtstreeks naar `onUpdate`.

- [ ] **Step 3: Draai de test en controleer dat hij faalt**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx -t "foutmelding na een mislukte mutatie"`
Expected: FAIL — alle drie de eerste gevallen tonen "Er is iets misgegaan. Probeer het opnieuw."

- [ ] **Step 4: Breid `mutatieFoutmelding` uit**

Vervang in `src/components/beheer/KunstwerkenSection.tsx` de hele functie `mutatieFoutmelding` (het commentaarblok erboven blijft staan):

```tsx
  function mutatieFoutmelding(): string {
    switch (actionErrorCode) {
      case 'code-bestaat-al':
        return t('kunstwerkenCodeBestaatAl');
      case 'code-in-bestelling':
      case 'in-use-bestelling':
        return t('kunstwerkenCodeVast');
      case 'code-verplicht':
        return t('kunstwerkenCodeVerplicht');
      case 'dubbele-relatie':
        return t('kunstwerkenDubbeleRelatie');
      case 'not-found':
        return t('kunstwerkenNietGevonden');
      case 'unauthorized':
        return t('kunstwerkenSessieVerlopen');
      case 'server-error':
        return t('kunstwerkenServerfout');
      case 'netwerkfout':
        return t('kunstwerkenNetwerkfout');
      case null:
        return t('kunstwerkenActionError');
      default:
        // Een code die dit scherm niet kent hoort niet stil te verdwijnen achter "er ging
        // iets mis" -- dan is een melding van een medewerker niet na te trekken. Hij komt
        // letterlijk in de tekst te staan.
        return t('kunstwerkenOnbekendeFout', { code: actionErrorCode });
    }
  }
```

- [ ] **Step 5: Draai de schermtest en controleer dat hij slaagt**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: PASS

- [ ] **Step 6: Schrijf de falende hooktest**

Maak `tests/lib/useApiCollection.test.ts` aan (of vul het bestaande bestand aan):

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useApiCollection } from '@/lib/useApiCollection';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('useApiCollection — foutcode van een mislukte mutatie', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonResponse([]));
  });

  it('gebruikt het error-veld uit de responsebody', async () => {
    const { result } = renderHook(() => useApiCollection<{ id: string }>('kunstwerken'));
    await waitFor(() => expect(result.current.items).not.toBeNull());

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'code-bestaat-al' }, 409));
    await act(async () => {
      await result.current.add({} as never);
    });

    expect(result.current.lastMutationErrorCode).toBe('code-bestaat-al');
  });

  it('valt terug op de HTTP-status als de body geen bruikbare foutcode heeft', async () => {
    const { result } = renderHook(() => useApiCollection<{ id: string }>('kunstwerken'));
    await waitFor(() => expect(result.current.items).not.toBeNull());

    fetchMock.mockResolvedValueOnce(new Response('<html>Bad Gateway</html>', { status: 502 }));
    await act(async () => {
      await result.current.add({} as never);
    });

    expect(result.current.lastMutationErrorCode).toBe('http-502');
  });

  it('meldt een netwerkfout als fetch zelf gooit', async () => {
    const { result } = renderHook(() => useApiCollection<{ id: string }>('kunstwerken'));
    await waitFor(() => expect(result.current.items).not.toBeNull());

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await act(async () => {
      await result.current.add({} as never);
    });

    expect(result.current.lastMutationErrorCode).toBe('netwerkfout');
  });
});
```

- [ ] **Step 7: Draai de hooktest en controleer dat hij faalt**

Run: `npx vitest run tests/lib/useApiCollection.test.ts`
Expected: FAIL — de laatste twee tests krijgen `null` in plaats van `http-502` en `netwerkfout`.

- [ ] **Step 8: Laat de hook altijd een code vastleggen**

Vervang in `src/lib/useApiCollection.ts` de functie `leesFoutcode` en haar commentaarblok:

```ts
/**
 * Levert altijd een code op. `error` uit de responsebody als die er is; anders de
 * HTTP-status, want een mislukte mutatie zonder herkenbare code was voorheen niet te
 * onderscheiden van "er is niets misgegaan" -- en het scherm kon er dus alleen "er ging
 * iets mis" van maken. Gooit niet als de body geen geldige JSON is; een generieke 502 van
 * een proxy heeft dat niet.
 */
async function leesFoutcode(response: Response): Promise<string> {
  try {
    const body = (await response.clone().json()) as { error?: unknown };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // geen JSON-body -- de status hieronder is dan het enige wat we hebben
  }
  return `http-${response.status}`;
}
```

Werk ook het commentaar bij `lastMutationErrorCode` in `UseApiCollectionResult` bij: de laatste zin ("of wanneer de server geen `error`-veld in de responsebody teruggaf") klopt niet meer en wordt "`null` zolang er geen mislukte mutatie is geweest."

Vervang daarna in `add`, `update` én `remove` het `catch`-blok:

```ts
      } catch {
        // Alleen invullen als er nog niets staat: bij een niet-ok response is de code
        // hierboven al gezet en gooien we zelf, en die eigen worp mag hem niet overschrijven.
        setLastMutationErrorCode((huidig) => huidig ?? 'netwerkfout');
        setError('action');
        return false;
      }
```

- [ ] **Step 9: Draai de hooktest en de schermtest**

Run: `npx vitest run tests/lib/useApiCollection.test.ts tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/lib/useApiCollection.ts src/components/beheer/KunstwerkenSection.tsx messages/nl.json tests/lib/useApiCollection.test.ts tests/components/beheer/KunstwerkenSection.test.tsx
git commit -m "feat: concrete foutmelding bij elke mislukte kunstwerk-mutatie"
```

---

### Task 4: Handleiding bijwerken

**Files:**
- Modify: `src/components/beheer/documentatie/chapters/KunstwerkenChapter.tsx`
- Test: `tests/components/beheer/documentatie/chapterScreenshots.test.tsx` (draaien, niet wijzigen)

**Interfaces:**
- Consumes: het gedrag uit taken 1, 2 en 3.
- Produces: niets voor latere taken.

- [ ] **Step 1: Zet de code-uitleg op vier cijfers**

In `src/components/beheer/documentatie/chapters/KunstwerkenChapter.tsx`, in de `SubSection` met `id="kunstwerken-code"`: vervang in de eerste `<P>` de voorbeelden `GLA-JAC-00001` door `GLA-JAC-0001` en `GLA-AFR-00007` door `GLA-AFR-0007`. Vervang in de `<P>` daarna "drie letters, streepje, drie letters, streepje, vijf cijfers" door "drie letters, streepje, drie letters, streepje, vier cijfers".

Werk ook de twee `Screenshot`-blokken in diezelfde subsectie bij: in `alt` en `caption` staat `GLA-JAC-00001`, dat wordt `GLA-JAC-0001`. En in het `Screenshot`-blok bovenaan het hoofdstuk staat `GLA-ANI-018` in `alt` en `caption`; dat wordt `GLA-ANI-0018`.

- [ ] **Step 2: Beschrijf de opsomming bij de Opslaan-knop**

Voeg aan het einde van het hoofdstuk, ná de bestaande subsecties, een nieuwe subsectie toe:

```tsx
      <SubSection id="kunstwerken-opslaan" title="Als opslaan niet lukt">
        <P>
          De knop Opslaan blijft grijs zolang er nog iets verplichts ontbreekt. Wat er precies
          ontbreekt staat er dan bij, boven de knop, met het tabblad erachter waar dat veld te
          vinden is — bijvoorbeeld &quot;Foto ontbreekt (tabblad Algemeen)&quot;. Zodra je het
          invult verdwijnt die regel; is de lijst leeg, dan kun je opslaan.
        </P>
        <P>
          Gaat het bij het opslaan zelf mis, dan verschijnt er een melding met de reden: de code
          bestaat al, de code ligt vast omdat er al besteld is, het kunstwerk is intussen door
          iemand anders verwijderd, of je sessie is verlopen. Staat er een melding met een
          foutcode tussen haakjes, geef die code dan door — daarmee is na te zoeken wat er
          gebeurd is.
        </P>
      </SubSection>
```

Controleer of `SubSection` al geïmporteerd is bovenaan het bestand (dat is zo) en of het anker `kunstwerken-opslaan` nog niet bestaat.

- [ ] **Step 3: Draai de documentatietests**

Run: `npx vitest run tests/components/beheer/documentatie/`
Expected: PASS — met name `anchorIntegrity.test.tsx`, die controleert of elk anker uniek is en klopt.

- [ ] **Step 4: Commit**

```bash
git add src/components/beheer/documentatie/chapters/KunstwerkenChapter.tsx
git commit -m "docs: handleiding bij viercijferig volgnummer en de opslaanmelding"
```

---

### Task 5: Migratie toepassen op staging

**Files:**
- Bestaat al: `db/migrations/2026-08-17-kunstwerkcode-viercijferig-volgnummer.sql`

**Interfaces:**
- Consumes: niets uit eerdere taken (de migratie staat los van de code).
- Produces: staging heeft 74 kunstwerken, allemaal `AAA-AAA-0000`, plus `Akoestische stof`.

**Deze taak wordt niet door een subagent gedraaid.** Hij verandert echte data op de gedeelde staging-database; dat hoort in de hoofdsessie, met de uitkomst zichtbaar voor Joris.

- [ ] **Step 1: Lees de migratie helemaal door voordat hij draait**

Run: `cat db/migrations/2026-08-17-kunstwerkcode-viercijferig-volgnummer.sql`
Controleer: vier `DELETE`-regels (zending ZD-00090, bestelling BE-01554, 17 kunstwerken, kunstenaar KU-00007), daarna 128 `UPDATE`-regels (64 paren × kunstwerken en bestellines).

- [ ] **Step 2: Leg de uitgangssituatie vast**

Run: `npm run db:status -- staging`
Expected: de migratie staat als openstaand in de lijst.

- [ ] **Step 3: Draai de migratie**

Run: `npm run db:migrate -- staging`
Expected: de migratie wordt toegepast zonder fout.

- [ ] **Step 4: Controleer de uitkomst**

Verwacht: 74 kunstwerken; 73 met een code die voldoet aan `AAA-AAA-0000`; één afwijkende code (`Akoestische stof`); geen kunstwerk meer van `KU-00007`; geen bestelregel meer met een vijfcijferige code. Schrijf hiervoor een wegwerpscript in de scratchpad-map, niet in de repo, en verwijder het na gebruik.

- [ ] **Step 5: Commit de migratie**

```bash
git add db/migrations/2026-08-17-kunstwerkcode-viercijferig-volgnummer.sql
git commit -m "chore: migratie kunstwerkcodes naar viercijferig volgnummer"
```

---

### Task 6: Screenshots opnieuw maken

**Files:**
- Modify: `public/documentatie/kunstwerken.png`
- Modify: `public/documentatie/kunstwerken-code-voor.png`
- Modify: `public/documentatie/kunstwerken-code-na.png`

**Interfaces:**
- Consumes: taken 1 t/m 5 — de schermen moeten de nieuwe codes en de nieuwe opsomming tonen, en de data moet al gemigreerd zijn.
- Produces: niets voor latere taken.

**Deze taak wordt niet door een subagent gedraaid.** Hij vraagt een draaiende dev-server, een ingelogde beheersessie en beeldbewerking.

- [ ] **Step 1: Maak de drie screenshots opnieuw**

Volg de vastgelegde werkwijze: headless Chrome via CDP met een zelf gemunte sessie-cookie, daarna bijsnijden. `kunstwerken.png` toont het formulier van een bestaand kunstwerk (nu met een viercijferige code); `kunstwerken-code-voor.png` toont een leeg prefix- en codeveld; `kunstwerken-code-na.png` toont een gekozen prefix met het viercijferige voorstel.

- [ ] **Step 2: Controleer dat de screenshots op hun plek staan**

Run: `npx vitest run tests/components/beheer/documentatie/chapterScreenshots.test.tsx`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add public/documentatie/kunstwerken.png public/documentatie/kunstwerken-code-voor.png public/documentatie/kunstwerken-code-na.png
git commit -m "docs: screenshots kunstwerken opnieuw gemaakt na de codewijziging"
```

---

## Afronding

- [ ] Draai de volledige suite: `npm test`
- [ ] Draai `npm run lint`
- [ ] Merge naar `master`, deploy naar staging, en controleer daar het kunstwerk-formulier en de handleiding.
- [ ] Vraag Joris om toestemming voordat de migratie op productie wordt toegepast (daar is hij een lege operatie, maar hij moet wel toegepast worden om `schema_migrations` gelijk te houden).
