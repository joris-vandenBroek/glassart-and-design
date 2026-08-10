# Kunstwerkcode — ontwerp

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 10-08-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

Datum: 2026-08-10
Status: ontwerp, goedgekeurd voor implementatie

## Aanleiding

Het veld `kunstwerken.naam` heet "naam", maar is in de praktijk al een artikelcode:
de 112 kunstwerken op staging heten `Dan-02424`, `Duc-04038`, `Akoestische stof`.
Die code is de waarde waarmee de drukker werkt en waarmee een masterbestand op de
schijf terug te vinden is. Het veld heet alleen niet zo, is niet uniek, en een
bestelregel legt hem niet vast — die verwijst met `bestellines.kunstwerkId` naar een
UUID die buiten de applicatie niemand iets zegt.

Gevolg: op een bestelling die naar de drukker gaat staat een naam die morgen anders
kan zijn, zonder dat iets vastlegt wat er toen stond, en zonder dat iemand gewaarschuwd
wordt dat er buiten het systeem een masterbestand meeverandert.

## Uitgangssituatie in de code en de data

- `kunstwerken.naam` (`db/schema.sql`, regel 159) is `VARCHAR(255) NOT NULL DEFAULT ''`,
  zonder index. `bestellines.kunstwerkId` (regel 210) is `CHAR(36)`, nullable, zonder
  foreign key.
- Data op 10-08-2026: staging 112 kunstwerken, alle namen uniek (ook hoofdletter­ongevoelig
  vergeleken), geen lege, langste 25 tekens; 9 bestelregels, alle 9 met een bestaand
  kunstwerk. Productie is leeg: 0 kunstwerken, 0 bestelregels.
- Kunstwerken loopt via de generieke CRUD-route `src/app/api/[resource]` en staat in
  `LOOKUP_RESOURCES` (`src/lib/server/lookupResources.ts`, regel 21).
- Het beheer-labelblok bestaat alléén in `messages/nl.json`; `en`/`de`/`fr` hebben geen
  `beheer`-sectie. Klantzichtbaar is het veld wél in vier talen, via `nameLabel` in
  `src/components/ProductModal.tsx` (regel 357).
- Verwijderen van een kunstwerk is nergens geblokkeerd, ook niet als bestelregels ernaar
  verwijzen — een bestaand gat, dat dit ontwerp meeneemt omdat het na deze wijziging
  gevaarlijker wordt.
- `src/components/beheer/BeheerShell.tsx` (regel 84) haalt élke bestelling met alle
  regels op. De verzameling "codes die in een bestelling voorkomen" is in beheer dus al
  aanwezig; er is geen nieuw endpoint nodig.

## Beslissingen

1. **`naam` wordt `code` en is uniek**, hoofdletterongevoelig: `Dan-02424` en
   `dan-02424` gelden als dezelfde code. Dat sluit aan op de standaardcollatie
   `utf8mb4_general_ci` van de tabel, zodat de `UNIQUE`-index en de controle in het
   scherm nooit een ander antwoord geven. Geen vorm-eis aan de code — een vast formaat
   (drie letters, streepje, vijf cijfers) zou `Akoestische stof` meteen ongeldig maken.
2. **`bestellines` slaat `code` op en `kunstwerkId` verdwijnt.** Een bestelregel legt
   daarmee vast wat er naar de drukker ging, in de enige vorm die daarbuiten betekenis
   heeft.
3. **Een kunstwerk dat in een bestelling voorkomt kan niet verwijderd worden.** Zonder
   dit slot kan een code vrijkomen en later aan een nieuw kunstwerk gegeven worden,
   waarna historische bestelregels stil naar het verkeerde werk wijzen. Verworpen
   alternatief: `code` én `kunstwerkId` naast elkaar in `bestellines` — geen
   hergebruik­risico, maar twee verwijzingen naar hetzelfde werk die uit elkaar kunnen
   lopen.
4. **De code is klantzichtbaar**, met label "Code" in vier talen, zodat een klant in
   contact met Glassart naar een werk kan verwijzen. Verworpen: de regel weghalen uit
   de collectie-detailpagina.
5. **Kunstwerken krijgt eigen API-routes** en verlaat `LOOKUP_RESOURCES`. Er komen drie
   stukken echte logica bij; dat is precies waarvoor `CLAUDE.md` de eigen-route-conventie
   beschrijft (`klanten`, `kunstenaars`, `drukkers` hebben die al). Verworpen: een
   `kunstwerken`-uitzondering in de generieke route, die daarmee de vierde
   uitzonderingstabel in één bestand zou krijgen en voor het eerst ook resource-specifieke
   PATCH-kennis.
6. **Eén migratie, kort stukmoment.** Tussen migratie en herstart leest de dan nog
   draaiende versie kolommen die niet meer bestaan. Op staging is dat acceptabel; op
   productie staan 0 kunstwerken en 0 bestelregels. Verworpen: expand/contract in twee
   rondes — twee migraties, twee stagingrondes, twee productiedeploys en tijdelijk code
   die met twee vormen tegelijk werkt, voor een venster van minuten op een omgeving
   zonder data.

## A. Schema en migratie

`db/migrations/2026-08-10-kunstwerk-code.sql`:

```sql
ALTER TABLE kunstwerken CHANGE naam code VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE kunstwerken ADD UNIQUE KEY uniek_code (code);

ALTER TABLE bestellines ADD code VARCHAR(255) NULL AFTER bestelheaderId;
UPDATE bestellines bl JOIN kunstwerken k ON k.id = bl.kunstwerkId SET bl.code = k.code;
ALTER TABLE bestellines MODIFY code VARCHAR(255) NOT NULL;
ALTER TABLE bestellines DROP COLUMN kunstwerkId;
```

`CHANGE` behoudt de bestaande waarden, inclusief de `DEFAULT ''` die de kolom nu al heeft.
Die default blijft bewust staan — de `ALTER` blijft daarmee minimaal, en met de
`UNIQUE`-index kan hoogstens één rij een lege code hebben; de API weigert een lege code
sowieso. De `UNIQUE`-index kan zonder opschoning: er zijn geen dubbele en geen lege codes. De `NOT NULL` op `bestellines.code` kan pas ná de
backfill, en die is eenduidig omdat elke bestaande bestelregel een bestaand kunstwerk
heeft.

Verplicht mee, in dezelfde commit:

- `db/schema.sql` — beide tabellen bijwerken.
- `src/lib/server/tableColumns.ts` — bij `kunstwerken` `naam` → `code`, bij `bestellines`
  `kunstwerkId` → `code`. Een onbekende kolom **gooit** daar een fout, dus dit is geen
  optioneel bijwerken maar een voorwaarde om te kunnen schrijven.

Mocht de backfill op een omgeving tóch een bestelregel zonder bestaand kunstwerk
aantreffen, dan faalt de `MODIFY ... NOT NULL` met een duidelijke fout in plaats van
stil een lege code achter te laten. Dat is het gewenste gedrag: dan moet er eerst met de
hand naar die regel gekeken worden.

## B. API

Kunstwerken verlaat `LOOKUP_RESOURCES` en krijgt twee nieuwe bestanden, gemodelleerd
naar `src/app/api/kunstenaars/[id]/route.ts`.

`src/app/api/kunstwerken/route.ts`

- `GET` — publiek, `listRows('kunstwerken', ...)`, ongewijzigd gedrag.
- `POST` — medewerker. Lege code na trimmen → `400 code-verplicht`. Code bestaat al
  (hoofdletterongevoelig) → `409 code-bestaat-al`.

De "bestaat al"-controle is een expliciete `SELECT` binnen dezelfde transactie als de
insert of update, zodat de melding klopt. De `UNIQUE`-index is de laatste backstop voor
twee gelijktijdige schrijvers die elkaar net missen: `withApiErrorHandling` maakt van een
onbehandelde fout een 500, dus MySQL's `ER_DUP_ENTRY` op `uniek_code` moet in deze routes
opgevangen worden en óók `409 code-bestaat-al` opleveren.

`src/app/api/kunstwerken/[id]/route.ts`

- `GET` — publiek, ongewijzigd gedrag.
- `PATCH` — medewerker. Bevat het verzoek een `code` die afwijkt van de huidige:
  - de huidige code komt voor in `bestellines` → `409 code-in-bestelling`;
  - de nieuwe code hoort al bij een ánder kunstwerk → `409 code-bestaat-al`;
  - de nieuwe code is leeg → `400 code-verplicht`.
  De controles en de update lopen in één transactie, zodat twee gelijktijdige wijzigingen
  niet langs elkaar heen glippen.
- `DELETE` — medewerker. De code komt voor in `bestellines` → `409 in-use-bestelling`,
  dezelfde foutcode die de generieke route al gebruikt voor maten en materialen.

"Komt voor in een bestelling" betekent: er bestaat een `bestellines`-rij met die code,
**ongeacht de status van de bestelling**. Ook geannuleerde en afgeronde bestellingen
tellen mee, want ook die zijn mogelijk al bij de drukker geweest.

`POST /api/bestelheaders` **blijft `kunstwerkId` in de body verwachten**. De server zoekt
de code op en schrijft die in de bestelregel. Twee redenen: het mandje in
`src/lib/useCart.tsx` bewaart items in localStorage met `kunstwerkId` in de samengestelde
sleutel, en de server blijft zo de enige die bepaalt welke code bij een kunstwerk hoort —
een client kan geen code van een ander werk meesturen. De bestaande
`kunstwerk-not-found`-controle haalt de rij al op, dus de code komt er gratis bij.

## C. Beheer-UI

In `src/components/beheer/KunstwerkenSection.tsx`:

- Kolomkop en formulierlabel worden **Code**. Validatietekst: "Vul een code in."
  `data-testid="kunstwerk-modal-naam"` wordt `kunstwerk-modal-code`, en de bijbehorende
  hint-testid mee.
- `BeheerShell` geeft de codes uit `rawBestellingen` als prop mee. Staat de code van dit
  kunstwerk daarin, dan is het codeveld **niet bewerkbaar**, met eronder: "De code ligt
  vast omdat dit kunstwerk al in een bestelling voorkomt." De verwijderknop is dan
  uitgeschakeld met dezelfde reden.
- Is de code bewerkbaar en bij opslaan gewijzigd, dan komt eerst een bevestigingsdialoog:

  > **U gaat de code wijzigen.** Als er al een masterbestand is, dan moet dit ook
  > aangepast worden!
  >
  > *Annuleren* — *Code wijzigen*

  Annuleren slaat niets op en laat de modal open staan.
- Een dubbele code wordt vóór opslaan in de modal gemeld ("Deze code bestaat al."),
  gecontroleerd tegen de al ingeladen kunstwerkenlijst, hoofdletterongevoelig en op de
  getrimde waarde — dezelfde vergelijking als de database.
- De onderhoudsknop voor "kunstwerken zonder naam" (regel 512 e.v.: `kunstwerkenZonderNaam`
  en `handleBackfillNamen`) gaat eruit. Die vult het veld met `omschrijvingNl` of het id —
  waarden die geen code zijn en met een `UNIQUE`-index kunnen botsen. Hij geldt op staging
  voor 0 rijen en op productie voor 0 kunstwerken.

De meldingen in de modal zijn de eerste verdediging, de 409's uit sectie B de harde grens
voor een directe API-aanroep of verouderde schermstatus. Die verdeling is bewust en volgt
`src/app/api/kunstenaars/[id]/route.ts` (regel 48), waar dezelfde afweging al staat
opgeschreven. Slaat een 409 toch aan, dan verschijnt de bestaande generieke
`kunstwerkenActionError` — `useApiCollection` geeft alleen een boolean terug en wordt
voor dit ontwerp niet verbouwd.

**Waarom popup en foutmelding elkaar bijna uitsluiten.** Zodra een kunstwerk in een
bestelling zit, kan de code niet meer wijzigen. Het scenario "al doorgegeven aan de
drukker" kan binnen het systeem dus niet meer optreden bij een codewijziging. De
waarschuwing blijft staan voor wat buiten het systeem leeft: een masterbestand op de
schijf, of een bestand dat buiten een bestelling om naar de drukker ging. Om die reden is
de verwijzing naar de drukker uit de popuptekst geschrapt en blijft alleen het
masterbestand over.

## D. Klantkant, bestellingen en drukkersmail

- `src/components/ProductModal.tsx` (regel 357) toont `kunstwerk.code`.
- Alles wat een bestelregel aan een kunstwerk koppelt matcht op code in plaats van id:
  `src/components/beheer/BestellingModal.tsx` (regel 399),
  `src/components/account/AccountOrderModal.tsx` (regel 131),
  `src/components/account/OrdersSection.tsx` (regel 34), en de typen in
  `src/lib/useAllOrders.tsx` en `src/components/beheer/BestellingenSection.tsx`.
- `src/lib/buildDrukkerMail.ts` (regel 193): de aanduiding op de regel komt rechtstreeks
  uit `line.code`. De terugval `'Onbekend kunstwerk'` verdwijnt voor het label — de code
  staat immers op de regel zelf. Het kunstwerk wordt nog wél op code opgezocht, want de
  mail heeft `foto` en `formaat` nodig; die opzoeking houdt haar defensieve terugval.
- `src/lib/useCart.tsx` en het toevoegen-aan-mandje in `ProductModal` blijven ongewijzigd
  op `kunstwerkId`.
- `src/app/api/bestelheaders/[id]/bestellines/[lineId]/route.ts` blijft ongewijzigd: zijn
  `BESTELLINE_COLUMNS`-allowlist bevatte `kunstwerkId` niet en krijgt ook `code` niet. De
  code op een bestelregel is daarmee na het plaatsen van de bestelling nergens meer te
  wijzigen, wat precies de bedoeling is.

## Vertalingen

`messages/nl.json`, beheer-blok:

- `kunstwerkenColNaam` → `kunstwerkenColCode`, waarde "Code"
- `kunstwerkenLabelNaam` → `kunstwerkenLabelCode`, waarde "Code"
- `kunstwerkenNaamVerplicht` → `kunstwerkenCodeVerplicht`, waarde "Vul een code in."
- nieuw: `kunstwerkenCodeBestaatAl` — "Deze code bestaat al."
- nieuw: `kunstwerkenCodeVast` — "De code ligt vast omdat dit kunstwerk al in een
  bestelling voorkomt."
- nieuw: `kunstwerkenCodeWijzigenTitel` — "U gaat de code wijzigen."
- nieuw: `kunstwerkenCodeWijzigenTekst` — "Als er al een masterbestand is, dan moet dit
  ook aangepast worden!"
- nieuw: `kunstwerkenCodeWijzigenBevestig` — "Code wijzigen"

`nameLabel` in `messages/nl.json`, `en.json`, `de.json`, `fr.json` wordt "Code" — in alle
vier de talen dezelfde waarde.

## Tests

Nieuw, test-driven (eerst falend):

- `POST /api/kunstwerken` weigert een dubbele code, ook met andere hoofdletters, en een
  lege code.
- `PATCH /api/kunstwerken/[id]` weigert een codewijziging als de huidige code in een
  bestelregel voorkomt; staat de wijziging toe als dat niet zo is; weigert een code die
  bij een ander kunstwerk hoort; en staat opslaan zonder codewijziging toe bij een besteld
  kunstwerk — anders is zo'n werk niet meer te onderhouden.
- `DELETE /api/kunstwerken/[id]` geeft 409 bij gebruik in een bestelling.
- `POST /api/bestelheaders` schrijft de code van het kunstwerk in de bestelregel.
- `KunstwerkenSection`: codeveld op slot bij een besteld kunstwerk; bevestigingsdialoog bij
  een gewijzigde code; annuleren slaat niet op; dubbele code geeft de melding en slaat niet
  op.

Bijwerken: `tests/components/beheer/KunstwerkenSection.test.tsx`,
`tests/components/ProductModal.test.tsx`,
`tests/components/beheer/BestellingModal.test.tsx`,
`tests/components/CartPanel.test.tsx`,
`tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx`,
`tests/app/api/bestelheaders.test.ts`, `tests/app/api/lookup-resources.test.ts` (kunstwerken
is geen lookup-resource meer) en `tests/regression/staging-scenarios.test.ts`.

Alle nieuwe fixtures krijgen een code met `AUTOTEST`-prefix en worden op exact id
opgeruimd, volgens de vaste regels van deze suite in `CLAUDE.md`.

## Uitrol

1. Migratie schrijven, `db/schema.sql` en `tableColumns.ts` bijwerken, code + tests af.
2. `npm run db:migrate -- staging`.
3. Deployen naar staging, daarna in DirectAdmin **RESTART**.
4. Op staging controleren: code wijzigen bij een onbesteld werk (popup verschijnt), bij een
   besteld werk (veld op slot), dubbele code (melding), een bestelling plaatsen en die
   doorgeven aan de drukker.
5. Toestemming vragen, dan `npm run db:migrate -- productie --confirm`.
6. Versie promoveren naar productie.

Tussen stap 2 en 3 is de collectiepagina op staging stuk; dat is het bewust geaccepteerde
venster uit beslissing 6. Zelfde geldt tussen stap 5 en 6 op productie, waar geen
kunstwerken en geen bestellingen staan.

Terugrollen over deze versie heen betekent terugrollen over een schemawijziging: er is geen
migratie-rollbacktooling, dus dat vraagt handwerk op de database. `CLAUDE.md` waarschuwt
daar al voor bij de rollbackpad-beschrijving.

## Wat dit ontwerp bewust niet doet

- Geen foreign key van `bestellines.code` naar `kunstwerken.code`. De bestelregel legt een
  waarde vast, geen verwijzing; een kunstwerk dat ooit uit de catalogus verdwijnt (als het
  verwijderslot met de hand omzeild wordt) mag een historische bestelling niet ongeldig
  maken.
- Geen vorm-eis of automatische generatie van codes. De beheerder typt de code zelf, zoals
  nu.
- Geen wijziging aan `useApiCollection`. Het onderscheid tussen `code-bestaat-al` en
  `code-in-bestelling` wordt aan de clientkant al vóór opslaan gemaakt; de servercodes zijn
  de backstop en hoeven niet tot in het scherm doorgegeven te worden.
- Geen historie van codewijzigingen. Het activiteitenlog legt via
  `logActiviteit('kunstwerk_gewijzigd', code)` alleen de nieuwe waarde vast, zoals het nu
  de naam vastlegt.
