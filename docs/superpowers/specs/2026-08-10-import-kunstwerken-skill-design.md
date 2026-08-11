# Import-kunstwerken skill — ontwerp

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 10-08-2026 is
> vastgelegd, inclusief de afwegingen van dat moment. Het wordt bewust niet bijgewerkt
> wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

Datum: 2026-08-10
Status: ontwerp, goedgekeurd voor implementatie

## Aanleiding

Joris start de GLA-PRO-collectie en wil kunstwerken voortaan in bulk vanaf schijf
importeren, in plaats van elk kunstwerk los via het beheerscherm aan te maken. Per
kunstwerk moeten dezelfde stappen gebeuren die nu handmatig gedaan worden: een unieke
code bepalen, het formaat en de bijbehorende maten kiezen, segment/stijl/onderwerp
koppelen (of aanmaken als er niets passends bestaat), een pakkende omschrijving in vier
talen schrijven, en het kunstwerk aan een kunstenaar koppelen.

## Harde afhankelijkheid

Dit ontwerp gaat uit van `kunstenaars.kunstenaarnr` (`KU-00001`, …) als koppelsleutel voor
de kunstenaar-selectie. Die kolom bestaat op het moment van schrijven nog niet — het
ontwerp en implementatieplan ervoor
(`docs/superpowers/specs/2026-08-10-kunstenaarnummer-en-drukkernummer-design.md` en het
bijbehorende plan) zijn wel al goedgekeurd en worden in een aparte sessie uitgevoerd. **De
skill kan pas daadwerkelijk draaien zodra dat werk op de doelomgeving is uitgerold.** Vóór
die tijd bestaat er geen `kunstenaarnr`-kolom, en de kunstenaar-koppeling in stap B
hieronder faalt dan hard bij het schrijven — niet stil.

## Uitgangssituatie in de code

- `kunstwerken` (`db/schema.sql:156-175`) heeft `foto`, `code` (uniek), `kunstenaarId`
  (wordt `kunstenaarnr`), `formaat` (enum `'staand'|'liggend'|'vierkant'|'alle'`, zie
  `src/components/beheer/materiaalTypes.ts`), vier omschrijvingskolommen,
  `segmentIds`/`materiaalIds`/`maatIds`/`stijlIds`/`onderwerpIds` (JSON-arrays van UUID's),
  `aiGegenereerd` (boolean) en `prijsPerM2`.
- `formaat` wordt in de bestaande beheer-UI automatisch afgeleid uit de beeldverhouding
  (`src/lib/detectKunstwerkFormaat.ts:9-21`): ratio 0,95–1,05 → `vierkant`, anders
  `liggend`/`staand` op basis van breedte vs. hoogte.
- `segmenten`/`stijlen`/`onderwerpen`/`materialen`/`maten` zijn lookup-tabellen zonder
  seed-data — puur gevuld via de beheer-UI, alleen `{ id, omschrijving }` (materialen en
  maten hebben iets meer velden, zie schema). Schrijven vereist `medewerker`-auth
  (`src/lib/server/lookupResources.ts:11-21`).
- Foto-upload: client → `POST /api/upload` (medewerker-auth) → PHP-endpoint
  `upload-server/upload-kunstwerk-foto.php` → retourneert `{ url }`
  (`src/app/api/upload/route.ts`, zie `CLAUDE.md` voor de achtergrond van deze indirectie).
- `POST /api/kunstwerken` (`src/app/api/kunstwerken/route.ts`) controleert zelf op een
  unieke, nog niet eerder gebruikte code (ook tegen historische `bestellines`) en geeft
  `409 code-bestaat-al` terug bij een botsing.
- Medewerker-login: `POST /api/auth/medewerker-login` (e-mail + wachtwoord → sessioncookie).
- Staging draait op `https://staging.glassartanddesign.com`, productie op
  `https://glassartanddesign.com` — twee losse, onafhankelijke databases; er is geen
  gedeelde staat tussen de UUID's/nummers van de twee omgevingen.
- `scripts/db-migrate.ts` is het bestaande precedent voor een los CLI-script dat buiten de
  Next-app om met een omgeving praat (daar: rechtstreeks MySQL via `scripts/lib/env.ts`).

## Beslissingen

1. **Interactieve Claude Code skill, geen onbemand script met een externe AI-API.** Er is
   geen AI/LLM-integratie in de repo, en Joris wil dat de beoordeling (segment/stijl/
   onderwerp, omschrijving) door de agent zelf gebeurt, in het gesprek, met eigen
   beeldherkenning. Een los onbemand script zou een aparte AI-API-key en -integratie
   vereisen die nu nergens bestaat.
2. **Twee onderdelen: een skill (`SKILL.md`) voor de beoordeling, een CLI-script voor de
   mechaniek.** `.claude/skills/import-kunstwerken/SKILL.md` bevat de procedure die de
   agent volgt (vragen stellen, per afbeelding beoordelen). `scripts/import-kunstwerken-cli.ts`
   is een los TypeScript-CLI-script, naar het patroon van `scripts/db-migrate.ts`, dat de
   HTTP-mechaniek doet: inloggen, referentiedata ophalen, foto uploaden, kunstwerk/
   lookup-waarde aanmaken. Verworpen: alles als losse `curl`-aanroepen vanuit de skill zelf
   — multipart file-upload, cookie-sessies en foutafhandeling zijn foutgevoelig als ad-hoc
   shell-commando's per afbeelding.
3. **Schrijven gaat via de REST API van de echte, draaiende staging/productie-app**, niet
   via een rechtstreekse databaseverbinding en niet via de lokale dev-server. Reden:
   foto-upload moet toch via de PHP-uploadserver op elk domein, en de REST API hergebruikt
   alle bestaande validatie (unieke code, kolom-allowlist, 409-afhandeling).
4. **Authenticatie via een medewerkersaccount per omgeving, credentials lokaal in een
   gitignored env-bestand.** Nieuwe variabelen `IMPORT_MEDEWERKER_EMAIL` /
   `IMPORT_MEDEWERKER_PASSWORD`, in `.env.local` (staging) en `.env.production.local`
   (productie) — zelfde patroon als de bestaande `DB_*`-variabelen. De CLI logt in via
   `POST /api/auth/medewerker-login` en hergebruikt de sessioncookie voor de hele run.
5. **Codes/volgnummers worden per omgeving onafhankelijk berekend** (hoogste bestaande
   `{PREFIX}-NNN` binnen die omgeving, +1), in plaats van op productie te bepalen en te
   dupliceren naar staging. Expliciete keuze van Joris: eenvoudiger te bouwen, met als
   geaccepteerde bijwerking dat codes tussen staging en productie uit de pas kunnen lopen
   als de twee catalogi al niet synchroon zijn. Binnen één run voorkomt een lokale,
   in-memory check dat twee afbeeldingen in dezelfde batch dezelfde code krijgen.
6. **Staging is verplicht het controlemoment vóór productie.** De skill vraagt bij elke
   run naar de doelomgeving, met staging als default. De aanbevolen (niet afgedwongen)
   werkwijze: eerst een staging-run, resultaat controleren in beheer, dán pas dezelfde
   batch naar productie doorzetten.
7. **Een batch-manifest maakt de productie-run een "replay" in plaats van een herhaling.**
   Na afloop van een run schrijft de skill een JSON-bestand weg
   (`.claude/skills/import-kunstwerken/runs/<datum>-<collectiecode>.json`, gitignored) met
   alle vragen-vooraf-antwoorden én, per kunstwerk, alle beoordelingen: bestandsnaam,
   formaat, gekozen maten (als breedte×hoogte-*waarden*), segment/stijl/onderwerp (als
   *tekst*), de vier omschrijvingen, kunstenaar (als *naam*). Waarden, nadrukkelijk geen
   database-id's: staging en productie zijn aparte databases, dus een UUID van vandaag
   betekent op de andere omgeving niets. Bij een productie-run wijst Joris dit bestand aan
   in plaats van alle vragen opnieuw te beantwoorden en alle afbeeldingen opnieuw te laten
   beoordelen — alleen de omgevingsspecifieke opzoek/aanmaak-stappen (kunstenaar, segment/
   stijl/onderwerp/maten op waarde, code-volgnummer) worden opnieuw gedaan, op de nieuwe
   omgeving.
8. **materiaalIds krijgen standaard alle bestaande materialen; prijsPerM2 blijft leeg.**
   Beide expliciete keuzes van Joris — prijsbepaling blijft een handmatige
   beheer-taak, materiaalkeuze per kunstwerk is (nu) geen onderscheid dat de import hoeft
   te maken.
9. **Segment/stijl/onderwerp: hergebruik is de norm, nieuw aanmaken de uitzondering.** De
   skill vergelijkt tegen de volledige bestaande lijst (eenmalig opgehaald bij de start van
   de run) en kiest het best passende bestaande item. Alleen als niets passend bestaat,
   wordt een nieuwe waarde aangemaakt — en dat wordt expliciet gemeld in de
   per-kunstwerk-samenvatting, zodat Joris het kan controleren.
10. **Omschrijvingen: de skill bepaalt zelf toon en lengte**, kort en verkoopgericht (2-3
    zinnen), in lijn met de bestaande catalogustoon; Joris controleert en corrigeert
    achteraf in beheer waar nodig. Geen vooraf vastgelegde stijlregels.

## A. Vragen vooraf (per import-run)

1. **Nieuwe import, of een eerdere batch doorzetten naar een andere omgeving?** Bij het
   laatste: pad naar het manifest-bestand, en de rest van deze sectie (2 t/m 6) wordt
   overgeslagen — die waarden komen uit het manifest.
2. **Omgeving** — staging of productie, default staging.
3. **Kunstenaar** — lijst bestaande kunstenaars (`kunstenaarnr` + naam) via
   `GET /api/kunstenaars` op de gekozen omgeving; keuze geldt voor de hele batch.
4. **AI-gegenereerd?** — ja/nee, geldt voor de hele batch.
5. **Brondirectory** — pad naar de map met afbeeldingen (platte scan, geen submappen).
6. **Collectiecode** — vrije tekst (bijv. `GLA-AFR`, `GLA-PRO`), geen harde validatie tegen
   een vaste lijst.

## B. Per kunstwerk

Elk `.jpg`/`.jpeg`/`.png`/`.webp`-bestand in de brondirectory is één kunstwerk. Voor elk
bestand, in volgorde:

1. Agent bekijkt de afbeelding (Read-tool, beeldherkenning).
2. **Formaat**: zelfde aspect-ratio-logica als `detectKunstwerkFormaat.ts` (ratio
   0,95–1,05 → `vierkant`, anders `liggend`/`staand`).
3. **maatIds**: alle rijen uit de (eenmalig opgehaalde) `maten`-lijst waarvan de
   oriëntatie (breedte vs. hoogte) bij het gedetecteerde formaat past.
4. **segment/stijl/onderwerp**: best passende bestaande waarde(n); nieuw aanmaken alleen
   als niets past (beslissing 9).
5. **materiaalIds**: alle bestaande materialen (beslissing 8).
6. **prijsPerM2**: `null`.
7. **Code**: eerstvolgend vrije volgnummer binnen de collectiecode op déze omgeving,
   3 cijfers zero-padded (tenzij bestaande codes in die collectie al een andere breedte
   gebruiken — dan die breedte aanhouden), met een in-memory check binnen de lopende batch.
8. **Omschrijving**: NL/EN/DE/FR, 2-3 zinnen, verkoopgericht (beslissing 10).
9. CLI: foto uploaden → URL.
10. CLI: `POST /api/kunstwerken` met alle velden.

Na elk kunstwerk: één statusregel (code, segment/stijl/onderwerp incl. eventuele nieuwe
waarden, kunstenaar). Na de hele batch: samenvatting (alle aangemaakte codes, alle nieuwe
lookup-waarden, overgeslagen/mislukte bestanden met reden) + het pad naar het
weggeschreven manifest-bestand.

## C. CLI-script (`scripts/import-kunstwerken-cli.ts`)

Subcommando's, elk met `--omgeving staging|productie`:

- `login` — logt in, cachet de sessioncookie voor de rest van de run (bijv. in een
  tijdelijk bestand of proces-lokale state — geen credentials in de cache, alleen de
  cookie).
- `dump-referentie` — retourneert kunstenaars, segmenten, stijlen, onderwerpen,
  materialen, maten en bestaande kunstwerkcodes als JSON, zodat de skill dit één keer per
  run leest.
- `upload-foto <pad>` — multipart upload, retourneert `{ url }`.
- `maak-lookup-waarde <tabel> <omschrijving>` — maakt een nieuwe segment/stijl/onderwerp
  aan als die nog niet exact zo bestaat; retourneert het id.
- `maak-kunstwerk <json>` — `POST /api/kunstwerken` met de opgegeven velden; geeft bij
  `409` de aanroeper de kans het volgende volgnummer te proberen (retry, zie sectie D).

Volgt het patroon van `scripts/db-migrate.ts`/`scripts/lib/env.ts` qua bestandsstructuur,
maar praat HTTP (`fetch`) in plaats van MySQL.

## D. Foutafhandeling

- Ontbrekende/ongeldige brondirectory → opnieuw vragen.
- Onleesbaar/corrupt afbeeldingsbestand → overslaan, melden, doorgaan.
- Inloggen mislukt → meteen stoppen, niets geschreven.
- Foto-upload mislukt → dat kunstwerk overslaan, melden, doorgaan.
- `409 code-bestaat-al` ondanks de lokale voorcontrole → één keer opnieuw met het volgende
  nummer; lukt dat ook niet, overslaan en melden.
- Bij een productie-replay vanuit een manifest: kunstenaar/segment/stijl/onderwerp niet
  gevonden op naam/tekst op de nieuwe omgeving → aanmaken (zelfde hergebruik-eerst-regel),
  expliciet gemeld.

## Wat dit ontwerp bewust niet doet

- **Geen hernummering van de bestaande GLA-HOT-serie.** Aparte, latere actie.
- **Geen materiaal- of prijslogica** voorbij "alle materialen, prijs leeg" — dat blijft
  handwerk in beheer.
- **Geen beeldbewerking/compressie** — het bronbestand gaat ongewijzigd naar de
  upload-server (binnen diens bestaande MIME/grootte-validatie).
- **Geen onbemande/automatische run** — elke run, ook een productie-replay vanuit een
  manifest, wordt door Joris zelf gestart en met een omgevingskeuze bevestigd.
- **Kan niet draaien vóórdat `kunstenaarnr` bestaat** op de doelomgeving (zie "Harde
  afhankelijkheid" hierboven).
