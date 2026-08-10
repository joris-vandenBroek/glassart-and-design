# Kunstenaarnummer en drukkernummer — ontwerp

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 10-08-2026 is
> vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt
> bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

Datum: 2026-08-10
Status: ontwerp, goedgekeurd voor implementatie

## Aanleiding

Kunstenaars en drukkers worden binnen het systeem aangewezen met een UUID. Buiten het
systeem zegt zo'n UUID niemand iets: in overleg over een kunstenaar of een drukkerszending
is er geen korte aanduiding om naar te verwijzen. Klanten hebben die al wel — `klantnr`
(`KL-00001`) sinds 08-08-2026 — en kunstwerken krijgen hem in hetzelfde tijdvak
(`kunstwerken.code`, zie het ontwerp van 10-08-2026).

Kunstenaars en drukkers krijgen daarom elk een eigen, uniek volgnummer, en dat nummer wordt
de kolom waarmee de rest van de database naar ze verwijst.

## Uitgangssituatie in de code en de data

- `kunstenaars` (`db/schema.sql`, regel 113) heeft geen nummer en geen `createdAt`. Er
  wijzen drie dingen naar: `kunstwerken.kunstenaarId` (FK `kunstwerken_ibfk_1`),
  `klanten.kunstenaarId` (alleen een unieke index `uniq_klanten_kunstenaarId`, géén FK) en
  `kunstenaarAfspraken.id` (1-op-1, FK `kunstenaarAfspraken_ibfk_1`, `ON DELETE CASCADE`).
- `drukkers` (regel 131) heeft geen nummer. Er wijst één ding naar:
  `drukkerZendingen.drukkerId` (FK `drukkerZendingen_ibfk_1`, `ON DELETE CASCADE`).
- Data op 10-08-2026: staging 8 kunstenaars, 111 kunstwerken mét en 1 zónder kunstenaar,
  6 klanten waarvan 1 aan een kunstenaar gekoppeld, 2 drukkers, 2 drukkerzendingen,
  2 rijen `kunstenaarAfspraken`, geen enkele wees-verwijzing. Productie is leeg: 0
  kunstenaars, 0 drukkers, 0 klanten, 0 kunstwerken, 0 zendingen.
- Beide databases draaien MariaDB 11.8. De `ROW_NUMBER()`-backfill uit
  `db/migrations/2026-08-08-klantnummer.sql` werkt daar ongewijzigd.
- Verwijderen is aan de serverkant al afgeschermd: `DELETE /api/kunstenaars/[id]` weigert
  bij bestaande kunstwerken, `DELETE /api/drukkers/[id]` bij bestaande zendingen. Beide
  hebben een clientkant-controle als voorportaal.
- `src/lib/server/counters.ts` biedt `volgendNummer(connection, counter, prefix)`, gedeeld
  door `bestelnummer`, `zendingnummer` en `klantnummer`, met vaste padding van 5 cijfers.

## Beslissingen

1. **De nummers worden automatisch uitgegeven uit de `counters`-tabel**, met prefix `KU-`
   en `DR-`, precies zoals `klantnr`. De beheerder typt niets en kan niets fout typen.
   Verworpen: een vrij tekstveld zoals bij `kunstwerken.code` — daar bestond de code al
   buiten het systeem, hier bestaat er niets om bij aan te sluiten.
2. **De UUID `id` blijft primary key** van `kunstenaars` en `drukkers`; het nummer krijgt
   een `UNIQUE`-index en wordt de kolom waarnaar verwezen wordt. Beheer-URL's, API-paden
   (`/api/kunstenaars/[id]`), React-keys en `kunstenaarAfspraken` blijven daarmee
   ongewijzigd. Verworpen: het nummer tot primary key maken — ideologisch schoner, maar dat
   raakt elk pad, elke sleutel en de zijtabel, zonder dat er iets tegenover staat.
3. **De verwijzende kolommen worden vervángen, niet aangevuld.** `kunstwerken.kunstenaarId`
   en `klanten.kunstenaarId` worden `kunstenaarnr`, `drukkerZendingen.drukkerId` wordt
   `drukkernr`, elk met een echte foreign key naar de nieuwe `UNIQUE`-kolom. Twee kolommen
   naast elkaar houden zou twee verwijzingen naar dezelfde rij opleveren die uit elkaar
   kunnen lopen.
4. **Het nummer is server-eigendom en onveranderlijk.** Een `kunstenaarnr`/`drukkernr` in
   een request-body wordt genegeerd, bij POST én bij PATCH. Dat is wat de foreign keys
   stabiel houdt: er is geen pad waarlangs een nummer kan verschuiven onder bestaande
   verwijzingen.
5. **`klanten` krijgt voor het eerst een echte foreign key naar kunstenaars.** Nu is er
   alleen een unieke index. Gevolg: het verwijderen van een kunstenaar met een gekoppelde
   klant moet een eigen controle krijgen, anders komt de FK-fout als 500 terug.
6. **`drukkerZendingen` gaat van `ON DELETE CASCADE` naar RESTRICT.** De cascade is nooit
   gewenst geweest — het commentaar in `src/app/api/drukkers/[id]/route.ts` (regel 34) zegt
   zelf dat alleen de API-controle voorkomt dat een verwijderde drukker de verzendhistorie
   meesleurt. Nu de FK toch herschreven wordt, is dat gratis recht te zetten.
7. **Eén levering, twee migratiebestanden.** Beide kanten raken elkaar nergens, dus ze
   kunnen in één versie mee; de winst van apart opleveren wordt gehaald door twee losse
   commits die elk apart nagekeken worden. Verworpen: expand/contract — vier migraties en
   tijdelijk twee waarheden per relatie, voor een productiedatabase zonder data.
8. **De nummers zijn alleen in beheer zichtbaar**, in de lijst en als subtitel van de modal.
   Niet in de drukkersmail en niet klantzichtbaar: er is geen gesprek met een klant waarin
   een kunstenaarnummer nodig is, en de drukkersmail benoemt de drukker al bij naam.

## Volgorde ten opzichte van ander werk

Dit ontwerp raakt `KunstwerkenSection.tsx`, `materiaalTypes.ts`, `tableColumns.ts`,
`db/schema.sql` en `ProductModal.tsx` — dezelfde bestanden als de kunstwerkcode-implementatie,
die op het moment van schrijven onafgemaakt in de working tree staat en waarvan de migratie
al op staging is toegepast (staging heeft `kunstwerken.code`, productie nog `naam`). **De
kunstwerkcode wordt eerst afgerond en gecommit**; pas daarna begint dit werk. Erbovenop
beginnen levert een diff op die niet meer te scheiden is.

## A. Schema en migratie

Twee migratiebestanden, in deze volgorde.

`db/migrations/2026-08-10-kunstenaarnummer.sql`:

```sql
ALTER TABLE kunstenaars ADD COLUMN kunstenaarnr VARCHAR(20) AFTER id;

CREATE TEMPORARY TABLE kunstenaarnr_backfill AS
SELECT id, ROW_NUMBER() OVER (ORDER BY naam, id) AS rn FROM kunstenaars;
UPDATE kunstenaars k JOIN kunstenaarnr_backfill b ON b.id = k.id
  SET k.kunstenaarnr = CONCAT('KU-', LPAD(b.rn, 5, '0'));
DROP TEMPORARY TABLE kunstenaarnr_backfill;

ALTER TABLE kunstenaars MODIFY kunstenaarnr VARCHAR(20) NOT NULL,
  ADD UNIQUE KEY uniek_kunstenaarnr (kunstenaarnr);
INSERT INTO counters (id, value) VALUES ('kunstenaarnummer', (SELECT COUNT(*) FROM kunstenaars));

-- kunstwerken: kunstenaarId -> kunstenaarnr
ALTER TABLE kunstwerken ADD COLUMN kunstenaarnr VARCHAR(20) NULL AFTER kunstenaarId;
UPDATE kunstwerken w JOIN kunstenaars k ON k.id = w.kunstenaarId SET w.kunstenaarnr = k.kunstenaarnr;
ALTER TABLE kunstwerken DROP FOREIGN KEY kunstwerken_ibfk_1;
ALTER TABLE kunstwerken DROP COLUMN kunstenaarId;
ALTER TABLE kunstwerken ADD CONSTRAINT fk_kunstwerken_kunstenaarnr
  FOREIGN KEY (kunstenaarnr) REFERENCES kunstenaars (kunstenaarnr);

-- klanten: kunstenaarId -> kunstenaarnr
ALTER TABLE klanten ADD COLUMN kunstenaarnr VARCHAR(20) NULL AFTER kunstenaarId;
UPDATE klanten kl JOIN kunstenaars k ON k.id = kl.kunstenaarId SET kl.kunstenaarnr = k.kunstenaarnr;
ALTER TABLE klanten DROP INDEX uniq_klanten_kunstenaarId;
ALTER TABLE klanten DROP COLUMN kunstenaarId;
ALTER TABLE klanten ADD UNIQUE KEY uniq_klanten_kunstenaarnr (kunstenaarnr),
  ADD CONSTRAINT fk_klanten_kunstenaarnr FOREIGN KEY (kunstenaarnr) REFERENCES kunstenaars (kunstenaarnr);
```

`db/migrations/2026-08-10-drukkernummer.sql` heeft dezelfde vorm: `drukkers.drukkernr` met
prefix `DR-`, backfill op `ORDER BY naam, id`, daarna `NOT NULL` + `uniek_drukkernr` en de
teller `drukkernummer`; vervolgens `drukkerZendingen.drukkerId` → `drukkernr`, met
`DROP FOREIGN KEY drukkerZendingen_ibfk_1`, `MODIFY drukkernr VARCHAR(20) NOT NULL` en
`fk_drukkerzendingen_drukkernr` zónder `ON DELETE CASCADE` (beslissing 6).

Vier punten die een besluit inhouden:

- **Nullability.** `kunstwerken.kunstenaarnr` en `klanten.kunstenaarnr` blijven nullable —
  op staging staat één kunstwerk zonder kunstenaar, en de meeste klanten zijn geen
  kunstenaar. Op `klanten` blijft dat samengaan met een `UNIQUE`-index, want MariaDB staat
  meerdere NULL's in een unieke index toe; dat is exact het gedrag van vandaag.
  `drukkerZendingen.drukkernr` wordt `NOT NULL`: een zending zonder drukker bestaat niet.
- **De backfill is eenduidig.** Er zijn geen wees-verwijzingen, dus de `UPDATE ... JOIN`
  vult elke rij die een verwijzing had. Zou een omgeving er tóch een hebben, dan faalt de
  `MODIFY ... NOT NULL` op `drukkerZendingen` luid, in plaats van stil een lege waarde
  achter te laten — en dat is het gewenste gedrag.
- **De tellerstand wordt geteld, niet geraden.** `SELECT COUNT(*)` over de zojuist genummerde
  tabel, zodat de teller ook klopt als de migratie ooit draait op een database die al
  nummers heeft. Zelfde constructie als in `2026-08-08-klantnummer.sql`.
- **Volgorde is dwingend.** De migratie moet op een omgeving vóór de bijbehorende code
  draaien, nooit erna: de nieuwe code selecteert `kunstenaarnr`/`drukkernr` en krijgt tegen
  een oude database een `ER_BAD_FIELD_ERROR`.

Verplicht mee, in dezelfde commit:

- `db/schema.sql` — `kunstenaars`, `drukkers`, `klanten`, `kunstwerken`, `drukkerZendingen`,
  plus twee `INSERT INTO counters`-regels.
- `src/lib/server/tableColumns.ts` — dezelfde vijf tabellen. Een onbekende kolom **gooit**
  daar een fout, dus dit is een voorwaarde om te kunnen schrijven, geen bijwerkklusje.

## B. Server en API

**Nummeruitgifte.** `CounterNaam` in `src/lib/server/counters.ts` krijgt `'kunstenaarnummer'`
en `'drukkernummer'` erbij; `volgendNummer` blijft ongewijzigd.

Het ophogen van de teller en het invoegen van de rij moeten in dezelfde transactie zitten,
anders kunnen twee gelijktijdige aanmaakverzoeken hetzelfde nummer zien. `updateRow` heeft
daar al een optionele `connection`-parameter voor, `insertRow` (`src/lib/server/crud.ts`,
regel 78) niet — die krijgt dezelfde vijfde parameter, symmetrisch met `updateRow`.

- `POST /api/kunstenaars` en `POST /api/drukkers` openen een transactie, halen
  `volgendNummer(...)` op en geven die mee aan `insertRow`. Bij drukkers valt de bestaande
  `standaard = FALSE`-reset binnen diezelfde transactie; nu staat die er los voor, waardoor
  een mislukte insert een leeggemaakte standaardvlag achterlaat.
- Een `kunstenaarnr`/`drukkernr` in de request-body wordt genegeerd, bij POST én PATCH
  (beslissing 4).

**Verwijderen.**

- `DELETE /api/kunstenaars/[id]` zoekt eerst het `kunstenaarnr` bij het id (geen rij →
  `{ ok: true }`, gedrag als nu) en controleert dan twee dingen in plaats van één: een
  `kunstwerken`-rij met dat nummer, of een `klanten`-rij. Beide → `409 in-use`. Die tweede
  controle is nieuw en volgt uit de nieuwe FK (beslissing 5).
- `DELETE /api/drukkers/[id]` krijgt dezelfde vorm: nummer opzoeken, `drukkerZendingen` op
  nummer controleren, `409 in-use`. De reden verandert wel — niet meer "de cascade zou de
  historie meenemen", maar "de FK weigert het".

**Zendingen.** De `[id]` in `/api/drukkers/[id]/zendingen` blijft de drukker-UUID, zodat
`DrukkerModal`, `VersturenNaarDrukkerDialog` en `useDrukkerZendingen` ongewijzigd blijven.
De route vertaalt zelf:

- `GET` — `SELECT z.* FROM drukkerZendingen z JOIN drukkers d ON d.drukkernr = z.drukkernr
  WHERE d.id = ? ORDER BY z.verzondenOp DESC`
- `POST` — eerst `drukkernr` bij het id opzoeken; onbekende drukker → `404 drukker-not-found`
  in plaats van een ruwe FK-fout, daarna invoegen met `drukkernr`.

`GET /api/drukkerzendingen` joint op `d.drukkernr = z.drukkernr` en geeft `z.drukkernr`
terug in plaats van `z.drukkerId`. Dat werkt door in `Zending` (`src/lib/zendingGenoten.ts`,
regel 5) en in de rij-typen van `useDrukkerZendingen` — beide een hernoeming, geen logica.

`/api/mail` blijft ongewijzigd: die neemt een `drukkerId` uit de body en zoekt daar het
e-mailadres bij. Dat is de drukker zelf, geen zending-verwijzing.

**Bestellen.** In `POST /api/bestelheaders` leest de bestelrechten-check `kunstenaarnr` uit
`kunstwerken` en zoekt de exclusiviteitslijst op met `WHERE kunstenaarnr = ?` (regel 41 en
47); de prijsberekening krijgt `kunstenaarnr` mee (regel 98 en 145).

**Prijsmodule.** `kunstenaarAfspraken` blijft op de UUID staan, dus de twee plekken die de
opslag bij een kunstwerk zoeken gaan over `kunstenaars` heen:

- `prijsopslagVoorKunstenaar` (regel 25) neemt een `kunstenaarnr`:
  `SELECT a.prijsopslag FROM kunstenaarAfspraken a JOIN kunstenaars k ON k.id = a.id
  WHERE k.kunstenaarnr = ?`
- `berekenPrijzenVoorAlleKunstwerken` (regel 79) bouwt zijn opslagmap op nummer:
  `SELECT k.kunstenaarnr, a.prijsopslag FROM kunstenaarAfspraken a JOIN kunstenaars k ON k.id = a.id`

Dat is de prijs van beslissing 2 — twee joins op één bestand, tegenover een migratie van een
tabel waarvan het id tegelijk primary key en foreign key is.

`GET /api/kunstwerken/prijzen` wisselt de queryparameter `kunstenaarId` om naar
`kunstenaarnr`; enige aanroeper is `KunstwerkenSection.tsx` (regel 243).
`SELF_EDITABLE_KLANT_FIELDS` bevat `kunstenaarId` niet en bevat `kunstenaarnr` dus ook niet;
alleen de toelichting erboven wordt bijgewerkt.

## C. Beheer-UI

Het klantnummer heeft al de vorm die hier past: `KlantModal` toont het niet als
formulierveld maar als **subtitel** van de modal, met `data-testid="klant-modal-klantnr"`
(regel 263). Kunstenaars en drukkers krijgen dezelfde behandeling — niets bewerkbaars, geen
extra formulierregel.

- `KunstenaarsSection.tsx` — kolom `kunstenaarsColKunstenaarnr` ("Kunstenaarnr.") vóór de
  naamkolom, en het nummer als subtitel in de modal (`kunstenaar-modal-kunstenaarnr`). Een
  nieuwe kunstenaar heeft nog geen nummer, dus dan geen subtitel; na opslaan komt het uit de
  POST-respons.
- `DrukkersSection.tsx` / `DrukkerModal.tsx` — hetzelfde, met `drukkersColDrukkernr` en
  `drukker-modal-drukkernr`.

Verder is het overal dezelfde omzetting: matchen op nummer in plaats van op UUID.

- `KunstenaarsSection.tsx` — `eigenKlantId()` (regel 83) vergelijkt `klant.kunstenaarnr` met
  het nummer van de kunstenaar; de verwijdercontrole (regel 314) vergelijkt kunstwerken op
  nummer en krijgt de klantcontrole erbij, spiegelend aan de servercontrole uit sectie B.
- `KlantModal.tsx` — state en kunstenaar-dropdown (regel 555) op `kunstenaarnr`, net als de
  dubbelkoppeling-controle (regel 136). De activiteitenlogregel blijft ongewijzigd.
- `KunstwerkenSection.tsx` — formulierstate, dropdownwaarden, `kunstenaarNaamById` (nu op
  nummer) en de prijzen-fetch (regel 243).
- `ProductsGrid.tsx`, `FiltersPanelContent.tsx`, `ProductModal.tsx`, `CartPanel.tsx`,
  `resolveOrderRight.ts` — filter- en bestelrechtvergelijkingen op nummer. **Klantzichtbaar
  verandert er niets**: die schermen tonen de kunstenaarsnaam, alleen de sleutel waarop ze
  die opzoeken verandert.
- Typen: `KlantenSection.tsx` (regel 34), `materiaalTypes.ts` (regel 48), `kunstenaarTypes.ts`,
  `zendingGenoten.ts` (regel 5), `useDrukkerZendingen.ts`.

Nieuwe sleutels in `messages/nl.json`, beheer-blok: `kunstenaarsColKunstenaarnr`,
`drukkersColDrukkernr`, en een blokkeertekst voor het verwijderen van een kunstenaar met een
gekoppelde klant (naar het voorbeeld van `drukkersVerwijderBlocked`). `en`/`de`/`fr` hebben
geen beheer-blok, dus daar hoeft niets bij.

## Tests

Nieuw, test-driven (eerst falend):

- `POST /api/kunstenaars` kent `KU-`-nummers op volgorde toe; `POST /api/drukkers` idem met
  `DR-`.
- Een `kunstenaarnr`/`drukkernr` in de request-body wordt genegeerd, bij POST én PATCH.
- `DELETE /api/kunstenaars/[id]` geeft 409 bij een gekoppeld kunstwerk én bij een gekoppelde
  klant.
- `DELETE /api/drukkers/[id]` geeft 409 bij een bestaande zending.
- `POST /api/drukkers/[id]/zendingen` geeft 404 bij een onbekende drukker.
- `POST /api/bestelheaders` handhaaft de exclusiviteit via `kunstenaarnr` en rekent de
  kunstenaarsopslag correct door — dat laatste dekt beide nieuwe joins in `prijsmodule.ts`.

Bij te werken: elk testbestand dat nu fixtures met `kunstenaarId`/`drukkerId` maakt. Dat zijn
er ruim twintig, waaronder `tests/app/api/{kunstenaars,klanten,bestelheaders,drukkers,drukkerZendingen,mail}.test.ts`,
de beheer-componenttests en `tests/regression/staging-scenarios.test.ts`.

Eén gevolg dat expliciet vastligt: **elke testrun hoogt de tellers `kunstenaarnummer` en
`drukkernummer` blijvend op**, precies zoals `bestelnummer` dat al doet. `CLAUDE.md` verbiedt
het resetten van een teller voor determinisme, dus een test die het nummer controleert
rekent relatief aan de huidige tellerstand — nooit tegen een vaste `KU-00001`. Alle nieuwe
fixtures krijgen een `AUTOTEST`-markering en worden op exact id opgeruimd, volgens de vaste
regels van deze suite.

## Uitrol

1. De kunstwerkcode afronden en committen (zie "Volgorde ten opzichte van ander werk").
2. Migraties schrijven, `db/schema.sql` en `tableColumns.ts` bijwerken, code en tests af.
3. `npm run db:migrate -- staging`.
4. Deployen naar staging, daarna handmatig **RESTART** in DirectAdmin.
5. Op staging controleren: kunstenaar aanmaken (nummer verschijnt), koppelen aan een klant,
   een kunstwerk aan een kunstenaar hangen, een bestelling plaatsen bij een exclusieve
   kunstenaar, de prijsopslag nakijken, een drukker aanmaken, versturen naar drukker, de
   zendinghistorie in `DrukkerModal`, en beide verwijderblokkades.
6. Toestemming vragen, dan `npm run db:migrate -- productie --confirm`.
7. Versie promoveren naar productie.

Tussen stap 3 en 4 leest de nog draaiende staging-versie kolommen die niet meer bestaan; dat
is hetzelfde bewust geaccepteerde venster als bij de kunstwerkcode. Op productie is het
risico nul: daar staan 0 kunstenaars, 0 drukkers, 0 klanten en 0 kunstwerken.

Terugrollen over deze versie heen betekent terugrollen over een schemawijziging. Er is geen
migratie-rollbacktooling, dus dat vraagt handwerk op de database — `CLAUDE.md` waarschuwt
daar al voor bij de beschrijving van het rollbackpad.

## Wat dit ontwerp bewust niet doet

- **`kunstenaars.exclusieveKlantIds` blijft klant-UUID's bevatten.** Dat is een JSON-lijst,
  geen foreign key, en klanten hebben al een `klantnr`. Omzetten is een eigen ontwerp waard.
- **`kunstenaarAfspraken` blijft op de UUID staan.** Zijn `id` is tegelijk primary key en
  foreign key naar `kunstenaars.id`; omzetten kost een migratie en levert alleen de twee
  joins uit sectie B op.
- **Beheer-URL's en `/api/.../[id]` blijven UUID's.** Alleen de kolommen die naar een
  kunstenaar of drukker wijzen veranderen.
- **Vrijgekomen nummers worden niet hergebruikt.** De teller telt door, zoals bij `klantnr`
  en `bestelnr`.
- **Geen nummer in de drukkersmail en niets klantzichtbaar** (beslissing 8).
- **Geen historie van nummertoekenningen.** Het nummer kan na uitgifte niet meer wijzigen,
  dus er valt niets te volgen.
