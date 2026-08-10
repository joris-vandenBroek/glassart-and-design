# Bestelnr, klantnr en zendingnummer als sleutel — ontwerp

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 10-08-2026 is
> vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt
> bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

Datum: 2026-08-10
Status: ontwerp, goedgekeurd voor implementatie

## Aanleiding

`bestelnr` (`BE-00001`) en `klantnr` (`KL-00001`) bestaan al, maar zijn nu alleen een
weergavewaarde: geen enkele andere tabel verwijst ernaar, en geen van beide heeft een
`UNIQUE`-index — de garantie dat ze uniek zijn zit uitsluitend in het feit dat
`volgendNummer()` de teller binnen een transactie ophoogt. Tegelijk verwijzen `bestellines`,
`bestelstatusHistorie`, `drukkerZendingen` en `bestelheaders` zelf allemaal met een UUID naar
elkaar en naar `klanten` — dezelfde situatie als `kunstenaars`/`drukkers` vóór het ontwerp van
[`2026-08-10-kunstenaarnummer-en-drukkernummer-design.md`](2026-08-10-kunstenaarnummer-en-drukkernummer-design.md).

Dit ontwerp trekt dat door: `bestelnr` en `klantnr` worden echte, database-afgedwongen
sleutels waar `bestellines`, `bestelstatusHistorie` en (voor klanten) `bestelheaders` naar
verwijzen, in plaats van naar de UUID. Onderweg blijkt dat de vergelijkbare relatie tussen een
drukkerzending en de bestellingen die hij bundelt (`drukkerZendingen.bestellingIds`, een
JSON-lijst) helemaal geen foreign key kán zijn zolang hij een lijst blijft — die relatie wordt
genormaliseerd naar een koppeltabel, en dat vraagt op zijn beurt dat `zendingnummer` ook een
echte sleutel wordt (nu is hij nullable en zonder index).

Dit is nadrukkelijk **vervolgwerk op** het kunstenaarnr/drukkernr-ontwerp, niet een vervanging
ervan: dat ontwerp moet eerst geïmplementeerd en gecommit zijn (zie "Volgorde ten opzichte van
ander werk").

## Uitgangssituatie in de code en de data

- `bestelheaders.bestelnr` (`db/schema.sql`, regel 201) is `NOT NULL` op elke rij — wordt in
  `POST /api/bestelheaders` (`src/app/api/bestelheaders/route.ts:170`) binnen de
  bestel-transactie uitgegeven vóór de `INSERT` op regel 174, dus er is nooit een rij zonder.
  Geen `UNIQUE`-index vandaag.
- `klanten.klantnr` (regel 27) is nullable en wordt pas gezet zodra een klant op
  `'Goedgekeurd'` gezet wordt, in `updateEnKenKlantnummerToe`
  (`src/app/api/klanten/[id]/route.ts:24-51`), met een `SELECT ... FOR UPDATE` die dubbele
  uitgifte bij een gelijktijdige goedkeuring voorkomt. Geen `UNIQUE`-index vandaag — het
  commentaar bij de oorspronkelijke migratie (`db/migrations/2026-08-08-klantnummer.sql`)
  redeneerde dat de tellerstand binnen de transactie al de garantie was en een index een
  tweede, deels overlappende bron van waarheid zou zijn voor alle `NULL`-rijen. Het
  kunstenaarnr-ontwerp (beslissing, nullability-paragraaf) heeft die redenering intussen al
  praktisch weerlegd voor `klanten.kunstenaarnr`: MariaDB staat meerdere `NULL`'s in een
  `UNIQUE`-index toe, dus een index náást de tellerstand-garantie levert geen tweede
  waarheidsbron op, alleen een extra afdwinging voor het geval de tellerstand-garantie ooit
  faalt (een bug, een handmatige `INSERT`, een toekomstige migratie-fout). Dit ontwerp past
  dezelfde redenering toe op `klantnr`.
- **`POST /api/bestelheaders` controleert vandaag geen klantstatus.** `requireKlant(request)`
  (regel 62) bevestigt alleen dat de sessie bij een klant hoort, niet dat die klant
  `'Goedgekeurd'` is — dat is uitsluitend een clientkant-gate
  (`useCustomerAuth.tsx:55`, `isCustomer: klant.status === 'Goedgekeurd'`, verbergt de
  bestelknoppen). Een klant die nog in `'Beoordelen'` zit heeft dus geen `klantnr`, maar kan
  in theorie via een directe API-aanroep toch een bestelling plaatsen. Dat is vandaag onschadelijk
  omdat `bestelheaders.klantId` een kale UUID accepteert; zodra die kolom `klantnr NOT NULL`
  wordt, is dat gat niet langer onschadelijk.
- `bestellines.bestelheaderId` (regel 210) en `bestelstatusHistorie.bestelheaderId` (regel 224)
  wijzen allebei met `ON DELETE CASCADE` naar `bestelheaders.id`. `bestelnr` is op het moment
  van invoegen al een lokale variabele in `POST /api/bestelheaders`
  (`src/app/api/bestelheaders/route.ts:170-198`), dus dat kost geen herstructurering.
- `drukkerZendingen.bestellingIds` (regel 148, `JSON`) is een lijst van `bestelheaders.id`
  UUID's. Eén zending bundelt bewust bestellingen van meerdere klanten —
  `VersturenNaarDrukkerDialog.tsx:194` berekent `aantalKlanten` expliciet als
  `new Set(bestellingen.map((b) => b.klantId)).size`. Dat maakt het een
  many-to-many-relatie in geest, geen simpele parent-FK: een enkele `bestelnr`-kolom op
  `drukkerZendingen` past daar niet op.
- `drukkerZendingen.zendingnummer` (regel 152) en de denormaliseerde kopie
  `bestelheaders.zendingnummer` (regel 204) zijn allebei nullable zonder index — het
  commentaar bij `db/migrations/2026-08-07-zendingnummer.sql` noemt de kopie op
  `bestelheaders` expliciet "denormalized copy for display only". Sinds die migratie kent
  `VersturenNaarDrukkerDialog.tsx:143-149` een `zendingnummer` toe vóórdat de zending wordt
  aangemaakt, dus elke ná 2026-08-07 aangemaakte zending heeft er één; zendingen van dáárvóór
  kunnen nog `NULL` hebben. Op 2026-08-10 (zie het kunstenaarnr/drukkernr-ontwerp) had staging
  2 drukkerzendingen; hun `zendingnummer`-status is niet apart gecontroleerd en moet vóór de
  migratie op staging worden nagekeken.
- Zowel `db/schema.sql` als MariaDB 11.8 (beide omgevingen) ondersteunen `JSON_TABLE`, nodig om
  `bestellingIds` bij de omzetting uit te pakken.
- `GET /api/bestelheaders` (regel 212-263) filtert met `WHERE klantId = ?` op de sessie-UUID
  van de klant zelf (de autorisatiecontrole op regel 223-229 vergelijkt ook UUID's), en joint
  bestellines met `WHERE bestelheaderId IN (?)` op basis van `header.id`. Beide gebruiken de
  UUID puur als *sleutel om te bevragen*, niet als iets dat een aanroeper ziet of instuurt.
- `PATCH /api/bestelheaders/[id]` (`[id]/route.ts:7-23`), `GET .../statushistorie`
  (`[id]/statushistorie/route.ts`) en `PATCH .../bestellines/[lineId]`
  (`[id]/bestellines/[lineId]/route.ts`) gebruiken alle drie de bestelheader-UUID uit het
  URL-pad om `bestelstatusHistorie`/`bestellines` te bevragen of te muteren.

## Beslissingen

1. **`bestelnr` en `klantnr` krijgen elk een `UNIQUE`-index.** Voor `bestelnr` is dat puur
   toevoegen (elke rij heeft er al één, geen backfill nodig). Voor `klantnr` geldt de
   MariaDB-meerdere-`NULL`'s-redenering uit de kunstenaarnr-precedent (zie boven).
2. **De verwijzende kolommen worden vervángen, niet aangevuld** — zelfde beslissing als het
   kunstenaarnr/drukkernr-ontwerp, met dezelfde reden: twee kolommen naast elkaar zijn twee
   verwijzingen naar dezelfde rij die uit elkaar kunnen lopen.
   - `bestellines.bestelheaderId` → `bestelnr`, FK naar `bestelheaders(bestelnr)`,
     `ON DELETE CASCADE` blijft behouden (MySQL/MariaDB staat een FK naar elke `UNIQUE`-sleutel
     toe, niet alleen de primary key).
   - `bestelstatusHistorie.bestelheaderId` → `bestelnr`, zelfde vorm. Dit is een intern
     audit-spoor waar verder niets doorheen joint, maar krijgt dezelfde behandeling voor
     consistentie: er is geen tabel in dit ontwerp die met opzet op de UUID blijft staan.
   - `bestelheaders.klantId` → `klantnr`, FK naar `klanten(klantnr)`, **`NOT NULL`**.
3. **`POST /api/bestelheaders` krijgt een server-side `'Goedgekeurd'`-controle.** Dit dicht het
   gat uit de uitgangssituatie en is de voorwaarde die `bestelheaders.klantnr NOT NULL`
   daadwerkelijk waar maakt: zonder deze controle zou een niet-goedgekeurde klant een
   bestelling kunnen plaatsen zonder `klantnr` om te leggen. Dit is een bugfix die dit ontwerp
   nodig heeft, geen scope-uitbreiding op eigen houtje.
4. **`drukkerZendingen.bestellingIds` (JSON) wordt een koppeltabel**
   `drukkerZendingBestellingen(zendingnummer, bestelnr)`, met een echte FK op beide kolommen.
   Verworpen: de JSON-lijst laten staan en alleen de inhoud omzetten naar `bestelnr`-strings —
   dat lost "afdwingen in de database" niet op, want MariaDB kan geen FK-constraint op
   individuele elementen van een JSON-array leggen.
5. **`zendingnummer` wordt daarvoor eerst zelf een echte sleutel**: back-fill van elke `NULL`-rij
   op `drukkerZendingen`, dan `NOT NULL` + `UNIQUE`. Dit gaat verder dan wat er letterlijk
   gevraagd is (alleen `bestelnr`/`klantnr`), maar is de enige manier om de koppeltabel een
   échte FK naar de zending te geven in plaats van naar zijn UUID.
   `bestelheaders.zendingnummer` blijft ongemoeid: die kolom is en blijft de bestaande
   denormaliseerde weergavekopie, wordt geen FK-doel. De koppeltabel is vanaf nu de echte
   many-to-many-relatie; de kopie op `bestelheaders` bestaat voor de bestellingenlijst in
   beheer, niet als relatie.
6. **Het nummer blijft, zoals nu al het geval is, alleen leesbaar — er komt geen pad waarlangs
   een bestaand `bestelnr`/`klantnr`/`zendingnummer` kan wijzigen.** Er is vandaag ook geen
   endpoint dat dat toestaat; dit ontwerp voegt er ook geen toe.
7. **Kolomvolgorde: elk gegenereerd nummer komt direct na `id` te staan**, zowel voor de nieuwe
   kolommen in dit ontwerp als retroactief voor de kolommen die er al waren
   (`klanten.klantnr`, `drukkerZendingen.zendingnummer`, `bestelheaders.zendingnummer`) en voor
   de kolommen die het kunstenaarnr/drukkernr-ontwerp toevoegt (die staan al `AFTER id` in dat
   ontwerps eigen migraties, dus die hoeven hier niet opnieuw verplaatst). Waar een tabel meer
   dan één gegenereerd nummer heeft — alleen `bestelheaders` (`klantnr`, `bestelnr`,
   `zendingnummer`) — vormen ze samen een aaneengesloten blok direct na `id`, in volgorde van
   belang: de verplichte FK-sleutel (`klantnr`) eerst, dan de eigen sleutel van de rij
   (`bestelnr`), dan de optionele denormaliseerde kopie (`zendingnummer`) als laatste van het
   blok. Dit is puur leesbaarheid in een database-client; het heeft geen functionele betekenis
   en MariaDB kent geen concept van "kolomvolgorde" dat ergens in de applicatiecode op leunt.
8. **URL's, route-parameters en primary keys blijven UUID.** `/api/bestelheaders/[id]`,
   `/api/bestelheaders/[id]/bestellines/[lineId]`, `/api/bestelheaders/[id]/statushistorie` —
   geen van alle verandert van pad. Elke route die intern nu `bestelheaderId`/`klantId` als
   filter- of join-sleutel gebruikt, vertaalt zelf van UUID naar nummer (zie sectie B) — zelfde
   patroon als `/api/drukkers/[id]/zendingen` in het kunstenaarnr/drukkernr-ontwerp.

## Volgorde ten opzichte van ander werk

**Dit ontwerp begint pas nadat het kunstenaarnr/drukkernr-ontwerp volledig geïmplementeerd en
gecommit is.** Twee redenen: `drukkerZendingen` wordt door beide ontwerpen aangeraakt
(`drukkerId` → `drukkernr` daar, `bestellingIds` → koppeltabel hier), en de kolomvolgorde-taak
in dit ontwerp (beslissing 7) moet weten dat `kunstenaarnr`/`drukkernr` al bestaan om ze niet
per ongeluk dubbel te verplaatsen. Op hetzelfde bestand tegelijk beginnen levert een diff op
die niet meer te scheiden is — zelfde overweging als bij de volgordekeuze in het
kunstenaarnr/drukkernr-ontwerp zelf.

## A. Schema en migratie

Acht migratiebestanden, in deze volgorde. Elke migratie staat in dezelfde commit als de
codewijziging die hem nodig heeft, zoals gebruikelijk in dit project.

**1. `db/migrations/2026-08-10-bestelnr-uniek.sql`**

```sql
ALTER TABLE bestelheaders ADD UNIQUE KEY uniek_bestelnr (bestelnr);
```

Geen backfill: `bestelnr` is al `NOT NULL` op elke rij en door de tellergarantie al uniek. Deze
migratie faalt luid (`ER_DUP_ENTRY`) als die aanname ooit niet klopt — gewenst, want dat zou op
een bug in `volgendNummer` wijzen die eerst opgelost moet worden.

**2. `db/migrations/2026-08-10-klantnr-uniek.sql`**

```sql
ALTER TABLE klanten ADD UNIQUE KEY uniek_klantnr (klantnr);
```

Zelfde redenering, met de MariaDB-meerdere-`NULL`'s-garantie voor de nog niet goedgekeurde
klanten (zie beslissing 1).

**3. `db/migrations/2026-08-10-bestelheaders-klantnr.sql`**

```sql
-- Vervangt bestelheaders.klantId door klantnr. Bewust vervangen, niet aanvullen (beslissing 2).
--
-- Volgorde van uitrol: eerst migreren, dan de code met de 'Goedgekeurd'-controle (beslissing 3)
-- deployen, dan herstarten. Tussen migratie en herstart leest de nog draaiende versie klantId
-- en faalt elke nieuwe bestelling met ER_BAD_FIELD_ERROR -- dat venster moet daarom kort zijn.
--
-- Als de UPDATE ... JOIN hieronder een bestaande bestelheader achterlaat zonder klantnr (de
-- klant bij die bestelling is nooit op 'Goedgekeurd' gezet, of is dat nadien weer kwijtgeraakt),
-- faalt de MODIFY ... NOT NULL hieronder luid. Dat is gewenst: zo'n rij vraagt om een
-- handmatige blik (alsnog een klantnr toekennen via de bestaande goedkeuringsflow) voordat deze
-- migratie verder kan, in plaats van dat er stil een lege verwijzing overblijft.
ALTER TABLE bestelheaders ADD COLUMN klantnr VARCHAR(20) NULL AFTER id;

UPDATE bestelheaders bh
JOIN klanten k ON k.id = bh.klantId
SET bh.klantnr = k.klantnr;

ALTER TABLE bestelheaders DROP FOREIGN KEY bestelheaders_ibfk_1;
ALTER TABLE bestelheaders DROP COLUMN klantId;
ALTER TABLE bestelheaders MODIFY klantnr VARCHAR(20) NOT NULL;
ALTER TABLE bestelheaders ADD CONSTRAINT fk_bestelheaders_klantnr
  FOREIGN KEY (klantnr) REFERENCES klanten (klantnr);
```

De constraintnaam `bestelheaders_ibfk_1` is MariaDB's automatisch gegenereerde naam voor de
naamloze `FOREIGN KEY (klantId)`-regel in `db/schema.sql` (regel 205) — net als bij het
kunstenaarnr-ontwerp moet dit vóór uitvoering op de doelomgeving nagekeken worden via
`information_schema.KEY_COLUMN_USAGE`, voor het geval de naam daar afwijkt.

**4. `db/migrations/2026-08-10-bestellines-bestelnr.sql`**

```sql
ALTER TABLE bestellines ADD COLUMN bestelnr VARCHAR(20) NULL AFTER bestelheaderId;

UPDATE bestellines bl
JOIN bestelheaders bh ON bh.id = bl.bestelheaderId
SET bl.bestelnr = bh.bestelnr;

ALTER TABLE bestellines DROP FOREIGN KEY bestellines_ibfk_1;
ALTER TABLE bestellines DROP COLUMN bestelheaderId;
ALTER TABLE bestellines MODIFY bestelnr VARCHAR(20) NOT NULL AFTER id;
ALTER TABLE bestellines ADD CONSTRAINT fk_bestellines_bestelnr
  FOREIGN KEY (bestelnr) REFERENCES bestelheaders (bestelnr) ON DELETE CASCADE;
```

Geen weesrijen mogelijk: `bestelheaderId` is vandaag al `NOT NULL` met een bestaande FK, dus de
`JOIN` vult elke rij.

**5. `db/migrations/2026-08-10-bestelstatushistorie-bestelnr.sql`**

Zelfde vorm als migratie 4, toegepast op `bestelstatusHistorie` (constraint
`bestelstatusHistorie_ibfk_1`).

**6. `db/migrations/2026-08-10-zendingnummer-uniek.sql`**

```sql
-- Backfill van elke drukkerZendingen-rij zonder zendingnummer (verzonden vóór
-- 2026-08-07-zendingnummer.sql), dan NOT NULL + UNIQUE. Nodig omdat migratie 7
-- hieronder zendingnummer als FK-doel gebruikt voor de koppeltabel.
SET @start = (SELECT value FROM counters WHERE id = 'zendingnummer');

CREATE TEMPORARY TABLE zendingnr_backfill AS
SELECT id, ROW_NUMBER() OVER (ORDER BY verzondenOp, id) AS rn
FROM drukkerZendingen
WHERE zendingnummer IS NULL;

UPDATE drukkerZendingen z
JOIN zendingnr_backfill b ON b.id = z.id
SET z.zendingnummer = CONCAT('ZD-', LPAD(@start + b.rn, 5, '0'));

-- Nieuw uitgegeven nummers beginnen boven @start, dus de teller schuift exact
-- zo veel op als er backfilled rijen waren -- geen overlap met nummers die
-- runtime via volgendNummer() al zijn uitgegeven.
UPDATE counters
SET value = @start + (SELECT COUNT(*) FROM zendingnr_backfill)
WHERE id = 'zendingnummer';

DROP TEMPORARY TABLE zendingnr_backfill;

ALTER TABLE drukkerZendingen MODIFY zendingnummer VARCHAR(20) NOT NULL AFTER id;
ALTER TABLE drukkerZendingen ADD UNIQUE KEY uniek_zendingnummer (zendingnummer);
```

**7. `db/migrations/2026-08-10-drukkerzending-bestelling-koppeltabel.sql`**

```sql
CREATE TABLE drukkerZendingBestellingen (
  zendingnummer VARCHAR(20) NOT NULL,
  bestelnr VARCHAR(20) NOT NULL,
  PRIMARY KEY (zendingnummer, bestelnr),
  FOREIGN KEY (zendingnummer) REFERENCES drukkerZendingen (zendingnummer) ON DELETE CASCADE,
  FOREIGN KEY (bestelnr) REFERENCES bestelheaders (bestelnr)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Pakt elke bestellingIds-JSON-array uit naar losse rijen. bestellingIds bevat
-- bestelheaders.id (UUID); de tweede JOIN vertaalt dat naar bestelnr.
INSERT INTO drukkerZendingBestellingen (zendingnummer, bestelnr)
SELECT z.zendingnummer, bh.bestelnr
FROM drukkerZendingen z
JOIN JSON_TABLE(
  z.bestellingIds, '$[*]' COLUMNS (bestelheaderId CHAR(36) PATH '$')
) AS jt
JOIN bestelheaders bh ON bh.id = jt.bestelheaderId;

ALTER TABLE drukkerZendingen DROP COLUMN bestellingIds;
```

`ON DELETE CASCADE` op `zendingnummer` (niet op `bestelnr`): een verwijderde zending mag zijn
eigen koppelrijen meenemen (dezelfde reden als het bestaande `drukkerZendingen`-verwijderslot
in `DELETE /api/drukkers/[id]` echter nooit uitgevoerd wordt zolang er zendingen zijn); een
bestelling wordt nooit verwijderd, dus die kant heeft geen cascade nodig.
`aantalKlanten`/`aantalRegels` op `drukkerZendingen` blijven ongewijzigd — dat zijn
snapshotwaarden, vastgelegd op het moment van verzenden, geen live afgeleide van de
koppeltabel.

**8. `db/migrations/2026-08-10-kolomvolgorde-generated-numbers.sql`**

```sql
-- Verplaatst de kolommen die al bestonden vóór dit ontwerp en die geen eerdere migratie in
-- deze reeks al AFTER id heeft gezet, naar direct na id, puur leesbaarheid.
-- klanten.klantnr: nog niet verplaatst door een eerdere migratie in deze reeks.
-- drukkerZendingen.zendingnummer: NIET hier -- migratie 6 heeft die al AFTER id gezet als
-- onderdeel van de NOT NULL + UNIQUE-omzetting, dus die nogmaals verplaatsen zou een no-op
-- zijn die alleen de migratiegeschiedenis onnodig verdubbelt.
ALTER TABLE klanten MODIFY klantnr VARCHAR(20) NULL AFTER id;
ALTER TABLE bestelheaders MODIFY zendingnummer VARCHAR(20) NULL AFTER bestelnr;
```

`bestelheaders.zendingnummer` komt na `bestelnr` te staan, niet direct na `id`: samen met
`klantnr` (dat door migratie 3 al direct na `id` staat) en `bestelnr` (dat al vanaf het begin
op de derde plek stond — regel 201 in `db/schema.sql` — en dus niet hoeft te verplaatsen)
vormt dat het blok uit beslissing 7 — `id, klantnr, bestelnr, zendingnummer, ...` — in volgorde
van belang: verplichte FK-sleutel, eigen sleutel van de rij, optionele kopie als laatste.

**Verplicht mee, in de betreffende commits:**

- `db/schema.sql` — alle vijf geraakte tabellen (`bestelheaders`, `klanten`, `bestellines`,
  `bestelstatusHistorie`, `drukkerZendingen`) plus de nieuwe `CREATE TABLE
  drukkerZendingBestellingen` — zes in totaal.
- `src/lib/server/tableColumns.ts` — dezelfde tabellen. `bestellingIds` verdwijnt uit de
  `drukkerZendingen`-lijst én uit de JSON-kolommenlijst die daarbij hoort.

## B. Server en API

**`POST /api/bestelheaders`** (`src/app/api/bestelheaders/route.ts`):

- Na `requireKlant` (regel 62), vóór de rest van de transactie: `SELECT klantnr, status FROM
  klanten WHERE id = ?` op de sessie-UUID. Geen rij of `status !== 'Goedgekeurd'` → `403
  order-not-allowed`-achtige respons (nieuwe, specifieke foutcode, bijvoorbeeld
  `klant-niet-goedgekeurd`, zodat deze niet met de bestaande kunstenaar-exclusiviteitsfout door
  elkaar loopt). Dit is de controle uit beslissing 3.
- De `INSERT INTO bestelheaders (id, klantId, bestelnr, status)` (regel 174) wordt
  `(id, klantnr, bestelnr, status)` met de zojuist opgehaalde `klantnr`.
- De rest van de functie (`checkOrderRight`, prijsberekening) blijft op de klant-UUID werken
  voor exclusiviteit — die logica gaat over `kunstenaars.exclusieveKlantIds`, dat dit ontwerp
  niet aanraakt (zie "Wat dit ontwerp bewust niet doet").
- De `INSERT INTO bestelstatusHistorie (id, bestelheaderId, status)` (regel 177) en elke
  `INSERT INTO bestellines (id, bestelheaderId, ...)` (regel 184) gebruiken voortaan `bestelnr`
  in plaats van `headerId` — die waarde is al lokaal beschikbaar (regel 170), dus dit is een
  kolomnaam- en waardewissel, geen herstructurering.

**`GET /api/bestelheaders`** (regel 212-263):

- De autorisatievergelijking (regel 223-229, `ownKlantId !== klantId`) blijft op UUID's — de
  query-parameter `klantId` verandert niet van naam of vorm voor de aanroeper, dat blijft de
  sessie-identiteit.
- Alleen de SQL zelf vertaalt: `SELECT bh.* FROM bestelheaders bh JOIN klanten k ON k.klantnr =
  bh.klantnr WHERE k.id = ?` in plaats van `WHERE klantId = ?` — of eenvoudiger, de UUID eerst
  naar `klantnr` opzoeken en daarmee filteren; functioneel gelijk, de tweede vorm heeft de
  voorkeur (één extra `SELECT` in plaats van een join op elke aanroep, en identiek aan hoe
  `POST` het al doet).
- De regels-lookup (regel 246-249, `WHERE bestelheaderId IN (?)` op `header.id`) wordt `WHERE
  bestelnr IN (?)` op `header.bestelnr`; de groepering op regel 250-258
  (`regel.bestelheaderId`) volgt daarin mee (`regel.bestelnr`).

**`PATCH /api/bestelheaders/[id]`** (`[id]/route.ts`): `params.id` blijft de bestelheader-UUID
(beslissing 8). De `getRow`-aanroep op regel 12 haalt voortaan ook `bestelnr` op (naast
`status`), en de `INSERT INTO bestelstatusHistorie` op regel 15 gebruikt die `bestelnr` in
plaats van `params.id`.

**`GET /api/bestelheaders/[id]/statushistorie`**: vertaalt `params.id` (UUID) eerst naar
`bestelnr` via een `SELECT bestelnr FROM bestelheaders WHERE id = ?`, en filtert
`bestelstatusHistorie` daarmee — zelfde patroon als `/api/drukkers/[id]/zendingen` in het
kunstenaarnr/drukkernr-ontwerp (UUID in het pad, vertaling in de route).

**`PATCH /api/bestelheaders/[id]/bestellines/[lineId]`**: de `UPDATE ... WHERE id = ? AND
bestelheaderId = ?` (regel 22-24) wordt een join die de bestaande garantie (deze regel hoort
bij déze header) behoudt zonder eerst een aparte lookup te doen:

```sql
UPDATE bestellines bl
JOIN bestelheaders bh ON bh.bestelnr = bl.bestelnr
SET <assignments>
WHERE bl.id = ? AND bh.id = ?
```

**Drukkerzendingen** (`src/app/api/drukkers/[id]/zendingen/route.ts`,
`src/app/api/drukkerzendingen/route.ts`, `src/lib/zendingGenoten.ts`,
`src/components/beheer/VersturenNaarDrukkerDialog.tsx`):

- `POST /api/drukkers/[id]/zendingen` voegt, ná het aanmaken van de `drukkerZendingen`-rij, de
  meegegeven bestellingen toe aan `drukkerZendingBestellingen` in plaats van ze als JSON-array
  op te slaan. De aanroeper (`VersturenNaarDrukkerDialog.tsx:193`) blijft een lijst
  bestelheader-identifiers meesturen, maar dat worden `bestelnr`-waarden in plaats van `id`'s
  — de dialoog kent `bestelnr` al (het staat al op elke `Bestelling` in
  `BestellingenSection.tsx`), dus dat is een veldwissel, geen nieuwe data-afhankelijkheid.
  `aantalKlanten` (regel 194, `new Set(bestellingen.map((b) => b.klantId)).size`) telt
  voortaan op `b.klantnr` in plaats van `b.klantId` — die laatste bestaat niet meer op een
  `Bestelling`-rij zodra `GET /api/bestelheaders` `klantnr` teruggeeft in plaats van `klantId`.
- `GET /api/drukkerzendingen?bestellingIds=...` (aangeroepen vanuit
  `zendingGenoten.ts:26`) accepteert voortaan een lijst `bestelnr`-waarden in die
  queryparameter (naam ongewijzigd, inhoud niet meer UUID) en joint via
  `drukkerZendingBestellingen` in plaats van `JSON_CONTAINS` op `bestellingIds`.
- `Zending.bestellingIds: string[]` (`zendingGenoten.ts:8`) blijft qua vorm een lijst — de API
  geeft hem nu op basis van de koppeltabel terug in plaats van uit de JSON-kolom — maar de
  inhoud is `bestelnr` in plaats van UUID. `openstaandeZendingGenoten` (regel 81-104) matcht
  bijgevolg voortaan op `bestelnr` in plaats van op `id`; `bestellingById` (regel 87) wordt
  opgebouwd op `b.bestelnr` in plaats van `b.id`.

**`src/lib/server/tableColumns.ts`**: `bestelheaders` verliest `klantId`, krijgt `klantnr`
(direct na `id`); `bestellines` en `bestelstatusHistorie` verliezen `bestelheaderId`, krijgen
`bestelnr`; `drukkerZendingen` verliest `bestellingIds` (ook uit de JSON-kolommenlijst).
`drukkerZendingBestellingen` komt niet in `LOOKUP_RESOURCES`/de generieke CRUD-route te staan —
hij wordt uitsluitend via de eigen `drukkers`/`drukkerzendingen`-routes benaderd, net zoals
`bestelstatusHistorie` dat vandaag al is.

**Klantzijde** (account-scherm, "mijn bestellingen"): alles wat vandaag via
`useCustomerAuth`'s klant-UUID naar `/api/bestelheaders?klantId=...` bevraagt, blijft dat doen
— dat is een query-parameter die de sessie-identiteit uitdrukt, geen databasekolomnaam, en
verandert dus niet (zie de `GET`-paragraaf hierboven).

## Tests

Nieuw, test-driven (eerst falend), in dezelfde stijl als de kunstenaarnr/drukkernr-tests:

- `POST /api/bestelheaders` weigert met een specifieke foutcode zolang de klant niet
  `'Goedgekeurd'` is (nieuw, dekt beslissing 3).
- `POST /api/bestelheaders` legt `klantnr` vast op `bestelheaders`, niet `klantId`.
- `bestellines`/`bestelstatusHistorie`-rijen zijn te vinden via `bestelnr`.
- `DELETE`/cascade: een bestelheader verwijderen (test-cleanup, niet een productiepad) neemt
  zijn `bestellines` en `bestelstatusHistorie` nog steeds mee via de nieuwe FK.
- `POST /api/drukkers/[id]/zendingen` legt de bestelnr-koppelingen vast in
  `drukkerZendingBestellingen`; `GET /api/drukkerzendingen?bestellingIds=...` vindt een zending
  terug op basis van een `bestelnr`.
- `openstaandeZendingGenoten` matcht op `bestelnr` (unit-test in `tests/lib/zendingGenoten.test.ts`,
  bestaande fixtures aangepast).

Bij te werken: elk testbestand met fixtures die rechtstreeks `bestelheaderId`, `klantId` (op
`bestelheaders`) of `bestellingIds` gebruiken — minstens
`tests/app/api/{bestelheaders,bestellines,klanten,drukkerZendingen,drukkerzendingen-lookup,mail}.test.ts`,
`tests/lib/zendingGenoten.test.ts`, `tests/lib/useDrukkerZendingen.test.ts`, de
beheer-componenttests rond bestellingen en drukkerzendingen, en
`tests/regression/staging-scenarios.test.ts` (de scenario's "bestellingen van meerdere klanten
combineren" en "niet-standaard drukker kiezen" raken hier direct de kern van). `npx tsc
--noEmit` is na elke migratie-taak het middel om de rest te vinden, met dezelfde blinde vlek
als bij het kunstenaarnr-ontwerp: fixtures die `insertRow(..., { ... } as never)` gebruiken
worden niet door de typechecker gezien.

Zoals bij `bestelnummer`/`klantnummer`/`kunstenaarnummer`/`drukkernummer` al het geval is: geen
enkele test reset een `counters`-rij, ook `zendingnummer` niet. Een test die een nummer
controleert rekent relatief aan de bestaande tellerstand.

## Uitrol

1. Eerst het kunstenaarnr/drukkernr-ontwerp volledig implementeren en committen (zie
   "Volgorde ten opzichte van ander werk").
2. Op staging vóór migratie 6 (`zendingnummer-uniek`) handmatig controleren hoeveel
   `drukkerZendingen`-rijen een `NULL` `zendingnummer` hebben, en of dat aantal overeenkomt met
   de verwachting (zendingen van vóór 2026-08-07).
3. Migraties 1 t/m 8 in volgorde op staging: `npm run db:migrate -- staging`.
4. Code deployen naar staging, daarna handmatig **RESTART** in DirectAdmin.
5. Op staging controleren: een bestelling plaatsen als goedgekeurde klant (bestelnr/klantnr
   correct vastgelegd), een bestelling proberen te plaatsen met een expres nog niet goedgekeurde
   testklant (geweigerd), een zending naar een drukker versturen met bestellingen van twee
   verschillende klanten (koppeltabel correct gevuld, "nog openstaande bestellingen bij dezelfde
   zending"-melding werkt nog), de bestelhistorie-tijdlijn in beheer, de klantnummerreeks in
   `KlantModal`.
6. Toestemming vragen, dan `npm run db:migrate -- productie --confirm`.
7. Versie promoveren naar productie.

Tussen elke migratiestap en de bijbehorende herstart leest de nog draaiende oude code een
kolom die niet meer bestaat (`klantId`, `bestelheaderId` of `bestellingIds`) — hetzelfde bewust
geaccepteerde venster als bij de kunstwerkcode- en kunstenaarnr-uitrol. Op productie is er
altijd data (in tegenstelling tot de kunstenaarnr/drukkernr-uitrol, waar productie leeg was) —
migratie 3 (`bestelheaders-klantnr`) kan er dus daadwerkelijk vastlopen op een klant zonder
`klantnr`; zie de toelichting in die migratie voor het handmatige herstelpad.

Terugrollen over deze versie heen betekent terugrollen over een schemawijziging. Er is geen
migratie-rollbacktooling, dus dat vraagt handwerk op de database.

## Wat dit ontwerp bewust niet doet

- **`kunstenaars.exclusieveKlantIds` blijft klant-UUID's bevatten.** Buiten scope van dit
  ontwerp, net als van het kunstenaarnr/drukkernr-ontwerp — een eigen ontwerp waard.
  `checkOrderRight` in `POST /api/bestelheaders` blijft daarom op de klant-UUID werken.
- **`bestelheaders.zendingnummer` wordt geen FK.** Blijft de bestaande denormaliseerde
  weergavekopie; de echte relatie is voortaan `drukkerZendingBestellingen` (beslissing 5).
- **`drukkerZendingen.aantalKlanten`/`aantalRegels` blijven snapshotwaarden**, niet live
  afgeleid van de koppeltabel.
- **Geen wijziging aan wannéér `klantnr` wordt uitgegeven** (nog steeds alleen bij
  `'Goedgekeurd'`) — alleen het bestelmoment krijgt een harde, server-side controle die er
  vandaag ten onrechte ontbreekt.
- **Beheer-URL's en `/api/.../[id]`-paden blijven UUID's** (beslissing 8). Alleen de kolommen
  die naar een bestelling, klant of zending wijzen veranderen.
- **Vrijgekomen nummers worden niet hergebruikt** — zelfde afspraak als overal elders.
- **Geen historie van nummertoekenningen.**
- **`GET /api/bestelheaders`'s `klantId`-queryparameter verandert niet van naam.** Die drukt de
  sessie-identiteit uit (een UUID), niet de databasekolom.
