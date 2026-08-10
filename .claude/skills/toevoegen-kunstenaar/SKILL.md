---
name: toevoegen-kunstenaar
description: Maak een nieuwe kunstenaar aan op basis van diens website — naam bepalen (met bevestiging), 4-talige omschrijving, website-veld, best-effort portretfoto, op staging of productie.
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
  je zelf een 4-talige omschrijving schrijft (geen fotopoging). `website` wordt `null`. Ga
  naar Stap 5.
- **Ingevuld** → onthoud de URL (dit wordt het `website`-veld in Stap 8), ga naar Stap 2.

## Stap 2: naam bepalen

Haal de website op (WebFetch) met een prompt gericht op: de naam van de kunstenaar/maker
van de site, en een eventuele "over mij"/bio-tekst. Bewaar het resultaat — je gebruikt het
zowel hier als in Stap 3 en 4.

- **Naam herkend** → toon hem en vraag expliciet: "Klopt dit — heet de kunstenaar
  `<gevonden naam>`?" Bij een correctie, gebruik de door de gebruiker opgegeven naam.
- **Niet herkend** → vraag de naam direct.

## Stap 3: omschrijving schrijven

Schrijf een compacte, wervende omschrijving (2-4 zinnen) op basis van wat er daadwerkelijk
op de website staat — niets verzinnen. In het Nederlands, Engels, Duits en Frans. De
omschrijving is uitsluitend de bio — de website zelf wordt apart als `website`-veld
meegestuurd (Stap 8), niet als "meer weten"-zin in de omschrijvingstekst; de collectiepagina
rendert die verwijzing al zelf op basis van dat veld.

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

Schrijf het kunstenaar-object eerst met de Write-tool naar een scratchpad-bestand (bijv.
`<scratchpad>/kunstenaar.json`), en geef dat pad mee met `--json-bestand` — niet met inline
`--json '<...>'`. Omschrijvingen bevatten bijna altijd apostrofs, en dit omzeilt
shell-quoting volledig (ook op PowerShell, de primaire shell van deze repo, waar een inline
`--json '<object>'` met apostrofs sowieso al stuk zou gaan):

```json
{
  "naam": "<naam>",
  "foto": "<foto-url of null>",
  "website": "<website-url of null>",
  "omschrijvingNl": "...",
  "omschrijvingEn": "...",
  "omschrijvingDe": "...",
  "omschrijvingFr": "...",
  "exclusieveKlantIds": []
}
```

```
npx tsx scripts/import-kunstwerken-cli.ts maak-kunstenaar --omgeving <omgeving> --sessie-cookie "<cookie>" --json-bestand "<scratchpad>/kunstenaar.json"
```

## Stap 9: samenvatting

Meld: naam, omgeving, of er een foto is meegenomen (en zo niet: waarom niet), of er een
website is meegegeven, en het teruggegeven record (bevat `id` en `kunstenaarnr` —
`POST /api/kunstenaars` geeft dat laatste veld inmiddels altijd terug).

## Foutafhandeling

- Website niet bereikbaar (WebFetch mislukt) → behandel als "geen website": val terug op
  Stap 1's lege-website-pad (naam en omschrijving handmatig).
- Naam-dubbele-check-treffer + gebruiker bevestigt niet → stop, geen aanmaak.
- Inloggen mislukt (Stap 5) → stop, er is nog niets geschreven.
- Foto groter dan ongeveer 8 MB → de upload-endpoint weigert deze met fout `te-groot`;
  behandel dit zoals een mislukte foto-upload (Stap 7): `foto: null`, meld het, ga door met
  het aanmaken van de kunstenaar zonder die foto.
- `maak-kunstenaar` mislukt (bijv. serverfout) → toon de foutmelding, stop; geen automatische
  retry (in tegenstelling tot `import-kunstwerken`'s codeconflict-retry — hier is er geen
  vergelijkbare, onschadelijke oorzaak om blind opnieuw te proberen).

## Wat deze skill bewust niet doet

- Wijzigt geen bestaande kunstenaars — uitsluitend aanmaken.
- Garandeert niet dat de gevonden naam/omschrijving/foto correct is — de website is de enige
  bron; bij twijfel valt het terug op handmatige input of wordt de foto overgeslagen.
- Wordt nog niet automatisch aangeroepen vanuit `import-kunstwerken` — dat is een losse,
  latere aanpassing aan die skill.
