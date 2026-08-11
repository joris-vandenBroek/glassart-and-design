# Toevoegen-kunstenaar skill — ontwerp

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 10-08-2026 is
> vastgelegd, inclusief de afwegingen van dat moment. Het wordt bewust niet bijgewerkt
> wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

Datum: 2026-08-10
Status: ontwerp, goedgekeurd voor implementatie

## Aanleiding

Bij het bouwen van de `import-kunstwerken`-skill
(`docs/superpowers/specs/2026-08-10-import-kunstwerken-skill-design.md`) bleek er geen
snelle manier te zijn om tijdens een import een nieuwe kunstenaar aan te maken — die skill
kiest alleen uit de al bestaande lijst. Joris wil een losse, herbruikbare skill die een
kunstenaar aanmaakt op basis van diens website: naam en een 4-talige omschrijving afleiden,
en straks aanroepbaar vanuit `import-kunstwerken` zodra daar blijkt dat een kunstenaar nog
niet bestaat.

## Uitgangssituatie in de code

- `kunstenaars` (`db/schema.sql:113-122`) heeft `id`, `naam`, `foto` (optioneel),
  `omschrijvingNl/Fr/De/En`, `exclusieveKlantIds` (JSON, standaard leeg).
- `GET /api/kunstenaars` is publiek leesbaar; `POST /api/kunstenaars`
  (`src/app/api/kunstenaars/route.ts:29-36`) vereist `medewerker`-auth en voegt gewoon toe
  wat er in de body staat — vandaag dus zonder `kunstenaarnr` (die kolom bestaat nog niet,
  zie hieronder).
- `/api/upload` bedient **al** zowel kunstwerk- als kunstenaarfoto's (zie het commentaar in
  `src/app/api/upload/route.ts:15-16`: "Alleen medewerkers uploaden kunstwerkfoto's
  (KunstwerkenSection/KunstenaarsSection)") — er is dus geen apart upload-pad nodig.
- De `import-kunstwerken`-CLI (`scripts/import-kunstwerken-cli.ts`, plan van 2026-08-10)
  heeft al generieke, herbruikbare bouwstenen: `login` (medewerker-auth op een omgeving),
  `baseUrlVoorOmgeving`, `uploadFoto`/het `upload-foto`-subcommando, en `dump-referentie`
  (haalt onder meer alle kunstenaars op). Niets daarvan is kunstwerk-specifiek.

## Beslissingen

1. **Geen harde afhankelijkheid van `kunstenaarnr`.** Anders dan `import-kunstwerken` roept
   deze skill gewoon de bestaande `POST /api/kunstenaars` aan en geeft terug wat de server
   teruggeeft — vandaag een `id` (UUID), en zodra de kunstenaarnummer-migratie (aparte
   sessie) geland is, ook een `kunstenaarnr`. De skill hoeft dat verschil niet zelf op te
   lossen; hij toont gewoon het teruggegeven record.
2. **Zelfde CLI, nieuwe subcommando's.** `scripts/import-kunstwerken-cli.ts` krijgt
   `maak-kunstenaar` en `download-bestand` erbij, in plaats van een los CLI-script. De
   login/omgeving-logica was toch al generiek; twee keer dezelfde infrastructuur bouwen
   levert niets op. (Expliciete keuze van Joris.)
3. **Naam: automatisch bepalen met bevestiging, niet blind aannemen.** De skill probeert de
   naam van de website af te leiden; wordt die gevonden, dan bevestigt de gebruiker hem
   expliciet (typefouten/verkeerde herkenning zijn goedkoop te corrigeren, blind aannemen
   niet — een verkeerde naam belandt anders zo in de live catalogus).
4. **Zonder website: handmatige input, geen CTA-zin.** Is er geen website (of levert hij
   niets bruikbaars op), dan vraagt de skill naam én een korte omschrijving die de agent
   zelf uitwerkt tot 4 talen. De "meer weten"-zin vervalt dan, want die vereist een link om
   naar te verwijzen.
5. **CTA-zin per taal vertaald, niet overal Nederlands.** Consistent met de rest van een
   4-talige omschrijving: elke taalversie krijgt zijn eigen vertaling van "Meer weten over
   `<Voornaam>`? Bekijk `<website>`", met `<Voornaam>` het eerste woord van de bevestigde
   naam.
6. **Foto is best-effort, nooit blokkerend.** De skill probeert een portretfoto op de
   website te vinden, te downloaden en te uploaden. Lukt dat niet — geen kandidaat gevonden,
   download/upload mislukt, of geen herkenbare afbeeldingsextensie (`mimeTypeVoorBestand`
   uit `scripts/lib/importKunstwerken.ts`, al gebouwd voor `import-kunstwerken`) — dan gaat
   de kunstenaar gewoon aan zonder foto verder, met een melding in de samenvatting.
7. **Dubbele-naam-check vóór het aanmaken, met expliciete bevestiging bij een treffer.**
   Voorkomt de meest voorkomende fout (twee kunstenaarsrijen voor dezelfde persoon) zonder
   een harde blokkade te zijn — soms is een gelijkende naam toch een andere kunstenaar.
   Gebruikt de kunstenaarslijst die `dump-referentie` toch al ophaalt; geen nieuw
   subcommando nodig.
8. **Geen batch-manifest, in tegenstelling tot `import-kunstwerken`.** Dat manifest bestaat
   daar omdat tientallen beoordelingen niet herhaald moeten worden bij een productie-run.
   Hier gaat het om één record: binnen hetzelfde gesprek blijven naam/omschrijving/foto
   sowieso bekend; in een nieuw gesprek is alles opnieuw vragen/zoeken acceptabel. Expliciete
   keuze van Joris — minder machinerie voor een taak die dat niet nodig heeft.
9. **Staging/productie volgt hetzelfde patroon als `import-kunstwerken`**: een omgevingsvraag
   met staging als default, geen afgedwongen tussenstap — de gebruiker beslist zelf wanneer
   hij naar productie doorzet.

## A. CLI-uitbreiding (`scripts/import-kunstwerken-cli.ts`)

Twee nieuwe subcommando's, in dezelfde stijl als de bestaande (zie het plan van
`import-kunstwerken`):

- `download-bestand --url <url> --naar <pad>` — haalt de URL op en schrijft de body als
  binair bestand weg naar `--naar`. Gebruikt om een kandidaat-portretfoto lokaal te zetten
  vóórdat hij via `upload-foto` (bestaand subcommando) naar de gekozen omgeving gaat.
- `maak-kunstenaar --omgeving <omgeving> --sessie-cookie <cookie> --json <kunstenaar-json>`
  — `POST /api/kunstenaars` met het opgegeven object
  (`{ naam, foto, omschrijvingNl, omschrijvingEn, omschrijvingDe, omschrijvingFr,
  exclusieveKlantIds: [] }`), geeft het teruggegeven record ongewijzigd door.

Beide leunen op de al bestaande, generieke bouwstenen (`baseUrlVoorOmgeving`, `logIn`,
`mimeTypeVoorBestand`) — er is geen nieuwe HTTP- of omgevingslogica nodig.

## B. Skill-procedure (`.claude/skills/toevoegen-kunstenaar/SKILL.md`)

1. **Website vragen.** Optioneel.
   - Leeg → vraag de naam direct, vraag een korte omschrijving (een paar zinnen) die de
     agent zelf uitwerkt tot 4 talen, geen CTA-zin, geen fotopoging. Ga naar stap 5.
   - Ingevuld → ga naar stap 2.
2. **Naam bepalen.** WebFetch de website; probeer de naam van de kunstenaar/maker te
   herkennen.
   - Gevonden → toon hem, vraag expliciete bevestiging ("klopt dit?"); bij correctie, gebruik
     de gecorrigeerde naam.
   - Niet gevonden → vraag de naam direct.
3. **Omschrijving schrijven.** Gebaseerd op de daadwerkelijke inhoud van de site (geen
   verzinsels), 2-4 zinnen, NL/EN/DE/FR. Voeg aan elke taalversie de vertaalde CTA-zin toe
   (beslissing 5), met `<Voornaam>` = eerste woord van de bevestigde naam.
4. **Foto zoeken (best-effort).** Zoek in de opgehaalde site-inhoud naar een
   portretfoto-kandidaat (bijv. `og:image`, een afbeelding bij de bio-sectie). Gevonden en
   herkenbare extensie → `download-bestand` naar de scratchpad-map, dan `upload-foto` naar
   de zo dadelijk gekozen omgeving. Elke stap kan falen zonder de rest te blokkeren
   (beslissing 6) — bij falen: `foto: null`, meld dit in de samenvatting.
5. **Omgeving.** Vraag staging/productie, default staging. Log in
   (`login --omgeving <omgeving>`).
6. **Dubbele-naam-check.** `dump-referentie --omgeving <omgeving> --sessie-cookie <cookie>`,
   vergelijk (case-insensitief, getrimd) de bevestigde naam tegen `referentie.kunstenaars`.
   Bij een treffer: waarschuw en vraag expliciete bevestiging vóór je doorzet.
7. **Aanmaken.**
   `maak-kunstenaar --omgeving <omgeving> --sessie-cookie <cookie> --json '<object>'`.
8. **Samenvatting.** Naam, omgeving, of er een foto is meegenomen, of de CTA-zin is
   toegevoegd, en het teruggegeven record (`id`, en `kunstenaarnr` zodra dat bestaat).

## Wat dit ontwerp bewust niet doet

- **Geen batch-manifest** (beslissing 8) — dit is een single-record-skill.
- **Geen garantie dat de gevonden naam/foto/omschrijving correct is** — de website-inhoud
  is de enige bron; bij een onduidelijke of onbetrouwbare site valt alles terug op
  handmatige input (naam) of wordt overgeslagen (foto).
- **Geen wijziging aan bestaande kunstenaars** — uitsluitend aanmaken van nieuwe.
- **Nog geen aanroep vanuit `import-kunstwerken`.** Dat plan (goedgekeurd, nog niet
  uitgevoerd) kiest vandaag alleen uit bestaande kunstenaars. Zodra beide skills gebouwd
  zijn, krijgt `import-kunstwerken`'s stap A.4 een tweede optie ("nieuwe kunstenaar
  toevoegen") die deze skill aanroept — een kleine, losse aanpassing na afloop van beide
  plannen, geen onderdeel van dit ontwerp zelf.
