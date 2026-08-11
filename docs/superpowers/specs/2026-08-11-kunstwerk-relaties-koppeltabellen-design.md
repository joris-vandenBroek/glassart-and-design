# Kunstwerk-relaties als koppeltabellen — ontwerp

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 11-08-2026 is
> vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt
> bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

Datum: 2026-08-11
Status: ontwerp, goedgekeurd voor implementatie

## Aanleiding

`kunstwerken.segmentIds`, `materiaalIds`, `maatIds`, `stijlIds` en `onderwerpIds` zijn elk een
JSON-array van id's — het patroon waarmee Firestore een many-to-many-relatie moet modelleren
omdat het geen joins kent. MySQL/MariaDB kan dat wel, met een echte koppeltabel en een
FOREIGN KEY. Vandaag is er geen enkele afdwinging: niets weerhoudt een array van het bevatten
van een id die niet (meer) bestaat.

Dat is geen theoretisch risico. Tijdens het opruimen van legacy Firestore-document-id's in de
catalogustabellen (zie de git-historie rond 2026-08-11) kwamen op staging twee kunstwerken naar
boven die precies dit gat lieten zien: één had `segmentIds: ["a", "b"]` — evidente
plaatshoudertekst, geen enkele koppeling met een echt segment — en een ander had 221
`materiaalIds` en 342 `maatIds`, ordes van grootte meer dan er materialen/maten ooit hebben
bestaan. Beide kunstwerken bleken achtergebleven testdata (foto's in een
`uploads/kunstwerken-test/`-map) en zijn losstaand verwijderd. Maar het onderliggende gat blijft
zolang deze relaties JSON-arrays zijn: niets in de database had dit tegengehouden, en niets
had het gemeld als de kunstwerken wél echte catalogusdata waren geweest.

Dit ontwerp trekt door wat het bestelnr/klantnr/zendingnummer-ontwerp
([`2026-08-10-bestelnr-klantnr-en-zendingnummer-als-sleutel-design.md`](2026-08-10-bestelnr-klantnr-en-zendingnummer-als-sleutel-design.md))
al deed voor `drukkerZendingen.bestellingIds`: een JSON-lijst van id's vervangen door een echte
koppeltabel met FOREIGN KEY's. `kunstenaars.exclusieveKlantIds` heeft exact hetzelfde probleem
en wordt in datzelfde ontwerp expliciet genoemd als "buiten scope, een eigen ontwerp waard" — dat
eigen ontwerp is bewust **niet** dit document. De vijf `kunstwerken`-kolommen en
`exclusieveKlantIds` hebben andere consumers (webshop-filtering/prijzen versus
bestel-exclusiviteit) en worden apart behandeld; dit ontwerp dekt alleen de vijf
`kunstwerken`-kolommen.

## Uitgangssituatie in de code

Een verkenning van alle consumers (zie sessie-transcript, niet apart gedocumenteerd) leverde
twee bepalende bevindingen op:

1. **Volgorde doet er soms toe.** `ProductModal.tsx` selecteert `materiaalIds[0]`/`maatIds[0]`
   als standaardkeuze op de productpagina; de labels voor segment/stijl/onderwerp worden in
   array-volgorde getoond (`ProductModal.tsx`, admin-tabel in `KunstwerkenSection.tsx:380`). Een
   koppeltabel heeft van zichzelf geen volgorde.
2. **`maatIds.length === 0` is een betekenisvolle status, geen "leeg".** Het is het signaal voor
   een materiaalloos kunstwerk dat per m² geprijsd wordt (`prijsmodule.ts`,
   `ProductModal.tsx`'s `isMaatloos`, `KunstwerkenSection.tsx`'s `buildKunstwerkData`). Dit
   vertaalt zich vanzelf naar "0 rijen in de koppeltabel" — geen aparte vlag nodig.

Verder relevant:

- **Geen dubbele koppeling wordt vandaag ergens voorkomen** — de checkbox-UI in
  `KunstwerkenSection.tsx` maakt duplicaten praktisch onmogelijk, maar de API accepteert
  letterlijk elke array. Een duplicaat is altijd een bug, nooit bedoeld.
- **Verwijderen van een segment/stijl/onderwerp/materiaal/maat wordt vandaag niet
  tegengehouden** ondanks de client-side "in gebruik door N kunstwerken"-waarschuwing
  (`LookupSection.tsx`, hergebruikt door `SegmentenSection`/`StijlenSection`/`OnderwerpenSection`;
  hetzelfde patroon los uitgeschreven in `MatenSection.tsx`/`MaterialenSection.tsx`). Die
  waarschuwing is puur client-side; de server staat de delete gewoon toe en het kunstwerk houdt
  een dode verwijzing over.
- **`prijsmatrix` kent dit patroon al wél met een echte FK**: `FOREIGN KEY (maatId) REFERENCES
  maten(id) ON DELETE CASCADE` en hetzelfde voor `materiaalId` (`db/schema.sql`). Een maat of
  materiaal verwijderen ruimt vandaag al stilzwijgend de bijbehorende `prijsmatrix`-rijen op —
  dit ontwerp past hetzelfde `CASCADE`-gedrag toe op de nieuwe koppeltabellen, in plaats van een
  harde blokkade zoals bij `materiaalsoorten`/`prijsgroepen`/`kunstenaars`/`drukkers`.
- De cart/order-runtime (`useCart.tsx`, `useAllOrders.tsx`, `usePrijzenPerKunstwerk.ts`,
  `CartPanel.tsx`) raakt geen van deze kolommen rechtstreeks — die werken met al-opgeloste data
  (een bestelregel draagt een enkelvoudige `materiaalId`/`maatId`). Alleen de kunstwerken-routes
  zelf en `prijsmodule.ts` lezen de arrays rechtstreeks van een kunstwerk-rij.

## Beslissingen

1. **Vijf eigen koppeltabellen, geen generieke.** `kunstwerkSegmenten`, `kunstwerkMaterialen`,
   `kunstwerkMaten`, `kunstwerkStijlen`, `kunstwerkOnderwerpen`. Overwogen en verworpen: één
   gedeelde `kunstwerkRelaties(kunstwerkId, relatieType, relatedId, volgorde)`-tabel — MariaDB kan
   geen FOREIGN KEY leggen die afhankelijk van een `relatieType`-kolom naar één van vijf
   verschillende tabellen wijst, wat precies de referentiële integriteit ondermijnt die dit
   ontwerp moet toevoegen. Vijf specifieke tabellen is ook het bestaande patroon in dit project
   (`drukkerZendingBestellingen` is specifiek, niet generiek).
2. **Elke tabel: samengestelde primary key `(kunstwerkId, <ding>Id)` + `volgorde INT NOT NULL` +
   twee FOREIGN KEY's, beide `ON DELETE CASCADE`.** De samengestelde PK maakt een dubbele
   koppeling structureel onmogelijk. `volgorde` behoudt het huidige gedrag exact: welk element
   `[0]` is (standaardselectie in `ProductModal.tsx`) en de weergavevolgorde van labels, zonder
   dat de webshop iets anders laat zien dan vandaag.
3. **`ON DELETE CASCADE` naar de brontabel, geen harde blokkade.** Verwijderen van een
   segment/stijl/onderwerp/materiaal/maat die nog in gebruik is, verwijdert alleen de
   koppelrij(en) — het kunstwerk blijft bestaan, alleen zonder die ene relatie. De bestaande
   client-side "in gebruik door N kunstwerken"-waarschuwing blijft ongewijzigd staan als zachte
   bevestiging vóór het verwijderen; er komt geen server-side blokkade zoals bij
   `materiaalsoorten`/`prijsgroepen`/`kunstenaars`/`drukkers`. Consistent met hoe `prijsmatrix`
   dit vandaag al doet voor dezelfde brontabellen (`maten`, `materialen`).
4. **De API-contract naar de client verandert niet.** `GET /api/kunstwerken` en
   `GET /api/kunstwerken/[id]` blijven `segmentIds`/`materiaalIds`/`maatIds`/`stijlIds`/
   `onderwerpIds` als arrays van id's teruggeven, in `volgorde`-sortering — alleen de opslag
   erachter verandert. Dit is de beslissing die de blast radius beperkt: elke consument die
   alleen leest (webshop-filtering, `ProductModal`, admin-weergave, de "in gebruik"-checks)
   blijft ongewijzigd, want die weet niet en hoeft niet te weten waar de array vandaan komt.
5. **Schrijven: vervang-de-volledige-set per kolom, binnen een transactie.** `POST`/`PATCH`
   ontvangen nog steeds `{ segmentIds: [...], materiaalIds: [...], ... }`. De route verwijdert
   voor de betreffende kunstwerk+kolom de bestaande koppelrijen en voegt de nieuwe in met hun
   `volgorde`. `PATCH`'s bestaande partial-update-gedrag blijft intact: een kolom die niet in de
   request-body zit, wordt niet aangeraakt (geen `DELETE`, geen `INSERT` voor die kolom).
6. **Eén gedeelde server-helper voor het samenstellen van een kunstwerk-met-relaties**, die de
   vijf joins doet en de arrays teruggeeft in dezelfde vorm als vandaag. Vervangt elke plek die nu
   `getRow`/`listRows('kunstwerken', jsonColumns)` gebruikt: de kunstwerken-routes zelf, en
   `prijsmodule.ts` waar die rechtstreeks kunstwerken bevraagt. Voorkomt dat de join-logica op
   meerdere plekken los wordt herschreven.
7. **Geen dedup-logica: een duplicaat wordt geweigerd, niet stilzwijgend opgeschoond.** De
   samengestelde primary key maakt een duplicaat bij het inserten onmogelijk. `POST`/`PATCH
   /api/kunstwerken` valideren dit vooraf (elke array moet unieke id's bevatten) en geven bij een
   duplicaat een `400`-fout met een duidelijke foutcode, in plaats van de database een generieke
   `ER_DUP_ENTRY`/`500` te laten teruggeven. Dit volgt hetzelfde principe als de bestaande
   kolom-allowlist in `tableColumns.ts`: een onverwachte invoer wordt luid geweigerd, niet
   stilzwijgend gecorrigeerd. Bevat een bestaande JSON-array bij de backfill toch een duplicaat
   (nooit waargenomen, maar niet uitgesloten), dan faalt die migratie-insert op dezelfde manier
   luid (`ER_DUP_ENTRY`) — zie "Uitrol".
8. **`volgorde` is enkel relatief bedoeld.** Alleen `ORDER BY volgorde ASC` wordt gebruikt om de
   array weer op te bouwen; de startwaarde (0- of 1-gebaseerd) maakt functioneel niet uit, zolang
   de backfill-migratie en het schrijfpad intern consistent zijn. De backfill gebruikt
   `JSON_TABLE`'s `FOR ORDINALITY` (1-gebaseerd); het schrijfpad mag de array-index (0-gebaseerd)
   gebruiken — beide leveren dezelfde relatieve volgorde op.

## A. Schema en migratie

Vijf identiek gevormde tabellen. Eén als voorbeeld, de andere vier zijn een naam- en
kolomnaamvariant:

```sql
CREATE TABLE kunstwerkSegmenten (
  kunstwerkId CHAR(36) NOT NULL,
  segmentId CHAR(36) NOT NULL,
  volgorde INT NOT NULL,
  PRIMARY KEY (kunstwerkId, segmentId),
  FOREIGN KEY (kunstwerkId) REFERENCES kunstwerken(id) ON DELETE CASCADE,
  FOREIGN KEY (segmentId) REFERENCES segmenten(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Analoog: `kunstwerkMaterialen(kunstwerkId, materiaalId, volgorde)` →
`materialen(id)`, `kunstwerkMaten(kunstwerkId, maatId, volgorde)` → `maten(id)`,
`kunstwerkStijlen(kunstwerkId, stijlId, volgorde)` → `stijlen(id)`,
`kunstwerkOnderwerpen(kunstwerkId, onderwerpId, volgorde)` → `onderwerpen(id)`.

**Backfill**, per tabel, zelfde techniek als de `drukkerZendingBestellingen`-migratie
(`JSON_TABLE` om de array uit te pakken, `volgorde` uit de array-index):

```sql
INSERT INTO kunstwerkSegmenten (kunstwerkId, segmentId, volgorde)
SELECT k.id, jt.segmentId, jt.volgorde
FROM kunstwerken k
JOIN JSON_TABLE(
  k.segmentIds, '$[*]' COLUMNS (
    volgorde FOR ORDINALITY,
    segmentId CHAR(36) PATH '$'
  )
) AS jt
WHERE k.segmentIds IS NOT NULL;

ALTER TABLE kunstwerken DROP COLUMN segmentIds;
```

`FOR ORDINALITY` geeft de 1-gebaseerde positie in de array — precies de `volgorde` die nodig is.
Analoog voor de overige vier kolommen; elke kolom is een eigen migratiebestand zodat een
mislukking op één kolom (bijvoorbeeld een niet-bestaand id, wat een `ER_NO_REFERENCED_ROW`
oplevert) de andere vier niet blokkeert en apart onderzocht kan worden.

**Verplicht mee, in de betreffende commits:**
- `db/schema.sql` — vijf nieuwe `CREATE TABLE`, vijf kolommen weg bij `kunstwerken`.
- `src/lib/server/tableColumns.ts` — de vijf kolommen weg uit `TABLE_COLUMNS.kunstwerken`. De
  nieuwe koppeltabellen komen niet in `TABLE_COLUMNS` te staan (dus ook niet in de generieke
  `[resource]`-catch-all-route) — ze worden uitsluitend via de eigen kunstwerken-routes benaderd,
  zelfde patroon als `drukkerZendingBestellingen`.
- `src/lib/server/kunstwerkCode.ts` — de vijf kolommen weg uit `KUNSTWERKEN_JSON_COLUMNS`.

## B. Server en API

**Nieuwe gedeelde helper** (bijvoorbeeld `src/lib/server/kunstwerkRelaties.ts`):
- `haalRelatiesOp(connection, kunstwerkId | kunstwerkIds[])`: joint de vijf koppeltabellen,
  gesorteerd op `volgorde`, en geeft per kunstwerk `{ segmentIds, materiaalIds, maatIds,
  stijlIds, onderwerpIds }` terug — voor één kunstwerk of in bulk (voor de lijst-`GET`, één query
  per koppeltabel met `WHERE kunstwerkId IN (?)` in plaats van N+1).
- `vervangRelaties(connection, kunstwerkId, kolom, ids[])`: `DELETE ... WHERE kunstwerkId = ?`
  gevolgd door een bulk-`INSERT` met `volgorde` = array-index, voor exact de kolommen die in een
  `PATCH`/`POST`-body zitten. Draait binnen dezelfde transactie als de rest van de aanroep.

**`GET /api/kunstwerken`** en **`GET /api/kunstwerken/[id]`**: halen de kunstwerk-rij(en) op
zonder de vijf kolommen (die bestaan niet meer), roepen `haalRelatiesOp` aan, en voegen de
resultaten samen tot hetzelfde object-vorm als vandaag. Geen verandering aan de response-vorm
voor de aanroeper.

**`POST /api/kunstwerken`**: na het inserten van de kunstwerk-rij, `vervangRelaties` per
meegegeven kolom (bij een `POST` zijn dat er typisch vijf, maar de helper behandelt ontbrekende
kolommen hetzelfde als "leeg" — geen koppelrijen).

**`PATCH /api/kunstwerken/[id]`**: alleen `vervangRelaties` aanroepen voor kolommen die
daadwerkelijk in de request-body voorkomen — dat is exact het bestaande partial-update-gedrag,
nu toegepast op vijf losse `DELETE`+`INSERT`-paren in plaats van vijf losse
`JSON.stringify`-toewijzingen.

**`DELETE /api/kunstwerken/[id]`**: geen wijziging nodig — `ON DELETE CASCADE` op
`kunstwerkId` in alle vijf koppeltabellen ruimt de koppelrijen vanzelf op.

**`prijsmodule.ts`**: waar dit bestand nu rechtstreeks `listRows('kunstwerken', jsonColumns)`
of vergelijkbaar aanroept, wordt dat de nieuwe gedeelde helper. De rest van de prijslogica
(`berekenPrijzenVoorCombinaties`, `berekenPrijzenVoorAlleKunstwerken`,
`berekenBestellijnPrijs`'s `maatIds.length === 0`-check) blijft ongewijzigd — die werkt al met
de opgeloste arrays, niet met de opslagvorm.

**Alles wat verder niets verandert** (ter bevestiging van de beperkte blast radius): `POST
/api/bestelheaders`'s materiaal/maat-validatie (leest de opgeloste `materiaalIds`/`maatIds` van
het kunstwerk, niet de opslagvorm), `ProductModal.tsx`, `ProductsGrid.tsx`,
`FiltersPanelContent.tsx`, `BestellingModal.tsx`, `KunstwerkenSection.tsx`'s
lees/weergavepad, `LookupSection.tsx` + `MatenSection.tsx`/`MaterialenSection.tsx`'s "in
gebruik"-check, `kunstwerken/prijzen/route.ts` (ontvangt `materiaalIds`/`maatIds` als
CSV-queryparameter die de client al vanuit het opgehaalde kunstwerk bouwt, raakt de opslag niet
rechtstreeks).

## Tests

Nieuw, test-driven (eerst falend):
- `POST`/`PATCH /api/kunstwerken`: een dubbele id in een van de vijf arrays wordt geweigerd met
  een `400` en een duidelijke foutcode (beslissing 7) — niet stilzwijgend gededupliceerd.
- `PATCH`: een kolom die niet in de body zit laat de bestaande koppelrijen voor die kolom intact
  (regressietest voor het partial-update-gedrag).
- Verwijderen van een segment/stijl/onderwerp/materiaal/maat die nog gekoppeld is aan een
  kunstwerk: de koppelrij verdwijnt (CASCADE), het kunstwerk blijft bestaan, en de overige
  koppelingen van dat kunstwerk blijven ongemoeid.
- `GET /api/kunstwerken`/`GET /api/kunstwerken/[id]`: de teruggegeven arrays staan in
  `volgorde`-volgorde, identiek aan de invoervolgorde bij het aanmaken.
- `prijsmodule.test.ts`: ongewijzigd qua verwachte uitkomst, alleen de fixture-opzet (kunstwerken
  aanmaken) verandert van directe JSON-kolom-inserts naar koppelrij-inserts of, waar mogelijk,
  via de echte API.

Bij te werken: elk testbestand dat een kunstwerk-fixture rechtstreeks met JSON-kolommen aanmaakt
(buiten de API om) — minstens de bestanden genoemd in de verkenning:
`tests/lib/server/prijsmodule.test.ts`, `tests/app/api/bestelheaders.test.ts`,
`tests/app/api/kunstwerken-prijzen.test.ts`, `tests/components/beheer/KunstwerkenSection.test.tsx`
en de `LookupSection`-varianten (`MatenSection`/`MaterialenSection`/`SegmentenSection`/
`StijlenSection`/`OnderwerpenSection`), `tests/regression/staging-scenarios.test.ts`,
`tests/scripts/importHttp.test.ts`. Testfixtures die via `POST`/`PATCH /api/kunstwerken` gaan
(de meeste) hoeven niet aangepast te worden — zelfde contract.

## Uitrol

1. Migraties in volgorde op staging: `npm run db:migrate -- staging`.
2. Op staging controleren: elk bestaand kunstwerk (109 op staging op het moment van schrijven)
   heeft na de migratie exact dezelfde `segmentIds`/`materiaalIds`/`maatIds`/`stijlIds`/
   `onderwerpIds` als vóór de migratie (zelfde elementen, zelfde volgorde) — een geautomatiseerde
   vergelijking vóór/na is onderdeel van het implementatieplan, niet alleen handmatige steekproef.
3. Code deployen naar staging, herstart, en handmatig: een kunstwerk aanmaken/bewerken in
   beheer, de collectiepagina en een productdetail (materiaal-/maatkeuze, standaardselectie),
   een segment/stijl/onderwerp/materiaal/maat verwijderen die nog in gebruik is (CASCADE-gedrag
   zichtbaar maken).
4. Promoveren naar productie. `kunstwerken` heeft op productie vandaag 0 rijen (zie eerdere
   opruiming van de legacy Firestore-id's), dus geen backfill-risico daar — wel dezelfde
   migratievolgorde aanhouden voor consistentie tussen omgevingen.

Tussen migratie en herstart leest de nog draaiende oude code kolommen die niet meer bestaan —
zelfde bewust geaccepteerde venster als bij eerdere migraties in dit project (kunstwerkcode,
kunstenaarnr/drukkernr, bestelnr/klantnr/zendingnummer).

Terugrollen over deze versie heen betekent terugrollen over een schemawijziging. Er is geen
migratie-rollbacktooling, dus dat vraagt handwerk op de database.

## Wat dit ontwerp bewust niet doet

- **`kunstenaars.exclusieveKlantIds` blijft een JSON-array.** Zelfde probleem, andere consumers
  (bestel-exclusiviteit, niet webshop-filtering/prijzen) — een eigen ontwerp, zoals ook het
  bestelnr/klantnr/zendingnummer-ontwerp al aangaf. Dat ontwerp heeft bovendien eigen te
  beslissen vragen (de "max 2, één moet de eigen klant zijn"-regel die vandaag alleen in
  `KunstenaarsSection.tsx` zit) die hier niet spelen.
- **Geen harde blokkade bij het verwijderen van een segment/stijl/onderwerp/materiaal/maat.**
  Bewuste keuze voor `CASCADE` (beslissing 3) — geen extra frictie ten opzichte van vandaag,
  consistent met hoe `prijsmatrix` dit al doet.
- **`import-kunstwerken`-tooling (`scripts/lib/importHttp.ts`, de skill zelf) hoeft niet te
  wijzigen**: die post nog steeds `{ segmentIds: [...], ... }` naar `POST /api/kunstwerken` —
  zelfde contract, geen kennis van de opslagvorm.
- **Geen wijziging aan `resolveOrderRight`/`checkOrderRight`** — die gaan over
  `exclusieveKlantIds`, niet over deze vijf kolommen.
