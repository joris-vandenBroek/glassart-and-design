# Glassart and Design — huidige staat van de applicatie

**Opgesteld 2026-08-08 door de code te lezen, niet de documentatie.** Peildatum: commit `87ef33e` op `master`.

## Waarvoor dit document dient

De map `docs/superpowers/` bevat 68 design-specs en 68 implementatieplannen. Die zijn **historisch**: ze beschrijven hoe een onderdeel op dát moment ontworpen en gebouwd is, inclusief de afwegingen en verworpen alternatieven. Ze worden bewust niet bijgewerkt wanneer de code later verandert — hun waarde zit in het *waarom*.

Dit document beschrijft het *wat*: hoe de applicatie er nu uitziet. Het is de plek om te beginnen als je wilt weten hoe iets werkt.

| Wil je weten… | Kijk in |
|---|---|
| Hoe werkt het nu? | Dit document |
| Waarom is het zo gebouwd? | De spec in `docs/superpowers/specs/` |
| Hoe bouw/test/deploy ik? | `CLAUDE.md` |
| Wat is het exacte datamodel? | `db/schema.sql` |

## Wat de applicatie is

Een besloten **B2B-bestelomgeving** voor Glassart and Design, dat kunst op gehard veiligheidsglas verkoopt. Drie gebruikersgroepen:

1. **Publiek** — bezoekers zien de collectie zonder prijzen en kunnen zich als klant aanmelden.
2. **Klanten** — zakelijke afnemers die na handmatige goedkeuring prijzen zien, bestellen en hun bestelhistorie inzien.
3. **Medewerkers** — beheren klanten, catalogus, prijzen en de volledige bestelafhandeling tot en met de drukker.

Er is **geen webshop voor particulieren**: registratie is uitsluitend zakelijk, en zonder goedkeuring door een medewerker zijn er geen prijzen en kan er niet besteld worden.

## Techniek

- **Next.js 14** (App Router) in **server mode** — geen statische export.
- **TypeScript**, **Tailwind**, **next-intl** (nl/en/de/fr, standaard `nl`).
- **MySQL** via ruwe `mysql2`-queries, geen ORM.
- **Sessie-cookie-authenticatie**, geen JWT, geen externe auth-provider.
- **`app.js`** is een eigen Passenger-compatibele Node-server; `npm start` draait die, niet `next start`.
- Twee losstaande **PHP-endpoints** naast de app: `mail-server/send-mail.php` (mail versturen) en `upload-server/` (foto-upload).

Firebase is volledig verwijderd — geen Firestore, geen Firebase Auth, geen Firebase Storage.

## Datamodel

30 tabellen in `db/schema.sql`. De samenhang op hoofdlijnen:

```
klanten ──prijsgroepId──> prijsgroepen
   │  └──kunstenaarId──> kunstenaars        (klantaccount van een kunstenaar)
   │
   └──< bestelheaders ──< bestellines ··code··> kunstwerken
              │                    ├──> maten
              │                    └──> materialen ──> materiaalsoorten
              └──< bestelstatusHistorie

kunstwerken ──kunstenaarId──> kunstenaars ──> kunstenaarAfspraken (prijsopslag)
kunstwerken ──koppeltabellen──> segmenten / stijlen / categorieen / materialen / maten

prijsmatrix (maatId × materiaalId) ──> prijs
drukkers ──< drukkerZendingen
```

Aandachtspunten die afwijken van wat je zou verwachten:

- De N-op-N-relaties van een kunstwerk zijn vijf echte **koppeltabellen** (`kunstwerkSegmenten`, `kunstwerkMaterialen`, `kunstwerkMaten`, `kunstwerkStijlen`, `kunstwerkCategorieen`), elk met een samengestelde primary key `(kunstwerkId, <ding>Id)`, een `volgorde`-kolom die de weergave-/selectievolgorde bewaart, en `ON DELETE CASCADE` op beide foreign keys.
- `kunstwerken.code` is de unieke, hoofdletterongevoelige identificatie van een kunstwerk (`UNIQUE KEY uniek_code`) — er is geen `naam`-kolom meer. Een bestelregel (`bestellines.code`) legt die code vast op het moment van bestellen; dat is een gekopieerde waarde, geen foreign key. Zodra een code ergens in `bestellines` voorkomt, ligt hij vast: het kunstwerk kan dan niet meer verwijderd worden en de code zelf kan niet meer wijzigen (zie API hieronder).
- `instellingen` is één tabel met een `data JSON`-kolom en drie rijen: `bedrijfsgegevens`, `bestelinstellingen` en `btwtarieven`.
- `counters` bevat drie losse nummerreeksen: `bestelnummer`, `zendingnummer`, `klantnummer`.
- `medewerkers` heeft **geen rolveld** — toegang is platte ja/nee.

## API

Alle routes onder `src/app/api/`.

**Generieke CRUD** — `src/app/api/[resource]/route.ts` bedient alleen de resources in de allowlist `LOOKUP_RESOURCES` (`src/lib/server/lookupResources.ts`); alles daarbuiten geeft 404:

`segmenten`, `stijlen`, `categorieen`, `materiaalsoorten`, `materialen`, `maten`, `prijsgroepen`

Schrijven vereist altijd een medewerker-sessie. Lezen is publiek, behalve `prijsgroepen` (alleen medewerkers).

**Eigen routes** met extra logica: `klanten` (incl. `/me` en `/[id]/wachtwoord`), `bestelheaders` (incl. `bestellines` en `statushistorie`), `kunstenaars`, `kunstenaarAfspraken`, `drukkers` (incl. `zendingen` en `zendingen/nummer`), `drukkerzendingen`, `activiteitenlog`, `instellingen`, `kunstwerken` (incl. `/prijzen`), `prijsmatrix`, `health/schema` en de `auth/*`-routes.

`kunstwerken` had oorspronkelijk een generieke CRUD-route, maar kreeg een eigen `POST`/`PATCH`/`DELETE` (`src/app/api/kunstwerken/[id]/route.ts` en `route.ts`) vanwege drie regels die de generieke route niet kan afdwingen: `code` is verplicht en moet uniek zijn (`ER_DUP_ENTRY` → `409 code-bestaat-al`), een `PATCH` die de `code` van een reeds besteld kunstwerk wijzigt geeft `409 code-in-bestelling`, en een `DELETE` van een besteld kunstwerk geeft `409 in-use-bestelling`. "Besteld" wordt bepaald door `codeKomtVoorInBestelling` (`src/lib/server/kunstwerkCode.ts`), die kijkt of de code al in `bestellines` voorkomt. Lezen (`GET`) bleef ongewijzigd publiek.

**Autorisatie** loopt uitsluitend via `requireMedewerker` in `src/lib/server/requireAuth.ts`. Er is geen laag daaronder — als die check ontbreekt in een route, is de route open.

## Prijsopbouw

De klantprijs is een keten van drie stappen (`src/lib/server/prijsmodule.ts`):

```
prijsmatrix[maat × materiaal].prijs      basisprijs
  + kunstenaarAfspraken.prijsopslag      opslag van de kunstenaar
  × prijsgroep korting- of opslag-%      afspraak met deze klant
  = klantprijs
```

Een prijsgroep heeft **óf** een kortingspercentage **óf** een opslagpercentage, nooit beide — afgedwongen door een CHECK-constraint in het schema.

**Eigen maat:** heeft een kunstwerk geen vaste maten, dan wordt de prijs berekend uit `kunstwerken.prijsPerM2 × (breedte/100 × hoogte/100)`. Ontbreekt de combinatie in de prijsmatrix, dan is het resultaat `op-aanvraag` of `onbekend`; bij `onbekend` weigert de bestelroute de regel.

**BTW** komt uit de `btwtarieven`-instelling, per land (`src/lib/resolveBtw.ts`). Zonder land is er geen percentage.

## Bestelworkflow

```
Te beoordelen
   ├─> Afgewezen
   └─> Te versturen naar drukker
          └─> Verstuurd naar drukker
                 └─> Te factureren
                        └─> Betaald en afgerond
```

Gedefinieerd in `src/lib/klantBestellingStatus.ts`. De klant ziet drie samengevatte statussen: *in behandeling*, *afgerond*, *afgewezen*.

Elke statuswijziging wordt vastgelegd in `bestelstatusHistorie`. Bij het versturen naar de drukker gaat één mail uit met alle geselecteerde bestellingen; dat legt een `drukkerZending` vast met een eigen zendingnummer. `src/lib/zendingGenoten.ts` bepaalt welke bestellingen uit dezelfde zending nog openstaan, zodat ze samen afgerond kunnen worden.

**Nummerreeksen** (uit `counters`, met vijf cijfers): bestellingen `BE-00001`, zendingen `ZD-00001`, klanten `KL-00001`. Een klantnummer wordt pas toegekend bij goedkeuring van de klant.

## Bestelrecht en exclusiviteit

Een kunstenaar kan exclusief aan bepaalde klanten gekoppeld zijn via `kunstenaars.exclusieveKlantIds`:

- Lege lijst → iedereen mag bestellen.
- Gevulde lijst → alleen de klanten in die lijst, **ook als de kunstenaar zelf een gekoppeld klantaccount heeft dat er niet in staat**. Er is bewust geen "eigen werk mag altijd"-uitzondering.

`src/lib/resolveOrderRight.ts` is een UX-hint aan de klantzijde; de enige echte handhaving is `checkOrderRight` in `POST /api/bestelheaders`. Beide falen dicht: onbekende of nog niet geladen data levert "niet bestelbaar" op, niet stilzwijgend "wel".

De bestelroute weigert verder: materialen of maten die niet bij het kunstwerk horen, ontbrekende afmetingen bij eigen maat, en een prijs van 0 of onbekend.

## Publieke site

`src/app/[locale]/` — homepage (Hero, Over ons, Waarom wij, Uitgelichte werken, Contact), `collecties`, `contact`, `word-klant`, `inloggen`, `wachtwoord-resetten`, `account`, `beheer`.

- **Collecties** — één pagina met een filterbaar grid (`ProductsGrid`), geen aparte pagina per segment.
- **Contactgegevens** komen uit de `bedrijfsgegevens`-instelling, niet uit vertaalbestanden of hardgecodeerde tekst.
- **Contactformulier** verstuurt niets: het doet `preventDefault` en toont een bevestiging. Dit is nog steeds een mock.
- **Winkelmandje** (`useCart`) leeft in `localStorage`, gescheiden per klant omdat de opgeslagen prijs met de prijsgroep van die klant berekend is.

`src/config/pageAvailability.ts` schakelt routes achter een Under Construction-pagina. Alleen een build met `MIJNHOST_BUILD=true` beperkt ze; `beheer` staat altijd open.

## Klantaccount

Twee secties (`AccountNav`): **bestellingen** en **instellingen**. De instellingenpagina leest en schrijft het echte `klanten`-record via `/api/klanten/me`.

Een klant met openstaande bestellingen kan zijn account **niet** zelf verwijderen; die poging wordt geblokkeerd en gelogd als `account_verwijderen_geblokkeerd`.

## Beheeromgeving

`BeheerNav` toont zestien secties, in drie blokken:

- **Boven:** Klanten, Bestellingen
- **Stamgegevens (groep):** Materiaalsoorten, Materialen, Maten, Segmenten, Stijlen, Categorieën, Prijsgroepen
- **Onder:** Kunstwerken, Kunstenaars, Prijsmatrix, Drukkers, Activiteit, Glassart & Design, Instellingen

Alle beheerhandelingen die ertoe doen worden gelogd in `activiteitenlog` via `src/lib/logActiviteit.ts` — fire-and-forget vanuit de browser, dus een mislukte logregel valt geruisloos weg. Eén uitzondering: het uitgeven van een klantwachtwoord wordt server-side gelogd, in `POST /api/klanten/[id]/wachtwoord` zelf en binnen dezelfde transactie als de wachtwoordwijziging, zodat die regel niet stil kan verdwijnen.

Diezelfde route mailt de klant ná de commit dat er telefonisch een wachtwoord is ingesteld (`src/lib/server/sendWachtwoordUitgegevenMail.ts`, zonder het wachtwoord erin). Dat is de enige controle op wie er belt: de melding bereikt de mailbox van de rechtmatige eigenaar ook wanneer de beller die niet kan lezen. Een mislukte verzending laat het uitgeven bewust doorgaan — het wachtwoord staat dan al vast en de beheerder heeft de klant aan de lijn — en komt terug als `mail: 'mislukt'` in de respons, zodat het beheerscherm het kan melden.

## Testen

128 testbestanden onder `tests/`. Belangrijk om te weten voordat je er iets aan verandert:

- De tests draaien tegen de **echte gedeelde staging-database**, niet tegen mocks.
- `fileParallelism` staat bewust uit.
- Opruimen moet altijd tot de eigen rijen beperkt blijven. Een `DELETE` zonder `WHERE` heeft in het verleden tweemaal echte data vernietigd.
- De regressiesuite (`tests/regression/`) draait alleen via `npm run test:regression`.

Zie `CLAUDE.md` voor de volledige regels — die zijn daar met opzet scherp geformuleerd.

## Deploy en migraties

Twee handmatig te starten GitHub Actions: staging en productie. Productie deployt alleen vanaf `master` en promoveert een `vN`-tag die eerder naar staging ging.

**Vaste regel: nooit naar productie zonder dezelfde commit eerst op staging te hebben geverifieerd.**

Schemawijzigingen zijn losse bestanden in `db/migrations/` en worden per database apart toegepast; `db/schema.sql` is documentatie, geen uitvoerbare migratie. Beide workflows blokkeren een deploy als de doeldatabase een migratie mist.

## Wat er (nog) niet is

Deze punten komen in oudere documenten voor als aanwezig of aanstaand, maar bestaan niet:

- **Facturatie** — geen factuurdocument, geen prijsgroepkeuze bij factureren, geen betalingsafhandeling. Alleen de statussen "Te factureren" en "Betaald en afgerond", en een factuurvoetje in de drukkersmail.
- **Retouren** — gebouwd geweest, daarna verwijderd (commit `20d8269`).
- **Rollen en rechten** voor medewerkers — toegang is platte ja/nee.
- **Statusnotificaties richting de klant** — de klant krijgt alleen een orderbevestiging bij het plaatsen van een bestelling.
- **Gespreksgeschiedenis (WhatsApp)** — de mockup is volledig verwijderd (commit `e5d1247`).
- **Taalvoorkeur op het account** — `klanten` heeft geen taalkolom.
- **Hi-res productiebestand per kunstwerk** — `kunstwerken` heeft alleen `foto`.
- **KVK- of postcode-lookup** bij registratie — er is wel een `kvk`-kolom, maar geen koppeling.
- **Watermerk op afbeeldingen** — verwijderd (commit `b069844`).
- **Automatisch seeden van lege collecties** — verwijderd (commits `f617cea`, `fe91c92`).
- **Particulier/zakelijk-keuze bij registratie** — registratie is uitsluitend zakelijk.
