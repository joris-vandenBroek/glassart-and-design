# Roadmap: Echte B2B-portaal & Beheeromgeving (toekomstig, niet voor directe bouw)

## Status

**Dit is GEEN spec voor een deelproject dat nu gebouwd wordt.** Dit document legt requirements vast die de klant heeft aangegeven, zodat ze niet verloren gaan. Losse onderdelen zijn intussen wél via de normale brainstorm→spec→plan-cyclus opgepakt en gebouwd (zie "Al gerealiseerd" hieronder) — wat overblijft, vereist grotendeels nog een fundamenteel andere architectuur (echte facturatie/boekhouding, rollen/rechten) dan waar de huidige site al mee werkt (MySQL + sessie-cookie-auth, Next.js in server mode).

**2026-07-23: dit document is kritisch tegen de daadwerkelijke code gecontroleerd** (niet tegen documentatie of memory — een eerdere status-memory bleek een ander gebouwd feature nog wekenlang als "niet gebouwd" te vermelden). Alle onderstaande statussen zijn geverifieerd door de broncode te lezen, niet aangenomen.

**2026-08-08: opnieuw tegen de code gecontroleerd en bijgewerkt.** Sinds de vorige controle is de volledige Firebase→MySQL-migratie doorgevoerd en zijn de drukker-workflow, de bestelstatus-keten en de AVG-verwijderblokkade gebouwd. Alle statussen hieronder zijn opnieuw in de broncode geverifieerd; de wijzigingen staan per punt genoteerd.

Zodra een resterend onderdeel wordt opgepakt, doorloopt het alsnog het volledige traject: brainstorm → (indien nodig) architectuurkeuze → spec → implementatieplan.

## Al gerealiseerd (geverifieerd in code, 2026-08-08)

- **Klantaanvragen beoordelen** (goedkeuren/afwijzen + koppelen aan prijsgroep, prijzen afgeschermd tot goedkeuring) — `KlantenSection`/`KlantModal`, echte MySQL-data via `/api/klanten`.
- **Orderaanvragen beoordelen** (goedkeuren/afwijzen) — `BestellingenSection`/`BestellingModal`, echte MySQL-data (`bestelheaders`/`bestellines`). **Let op afwijkende naamgeving:** dit document sprak van status "Aangevraagd"; de gebouwde code begint bij `Te beoordelen`. De statusketen is inmiddels uitgebreid tot `Te beoordelen → Te versturen naar drukker → Verstuurd naar drukker → Te factureren → Betaald en afgerond` (plus `Afgewezen`), zie `src/lib/klantBestellingStatus.ts`.
- **Beheer maten, kunstwerken, segmenten, materiaalsoorten en prijzen** — volledig, met stevige CRUD-secties (`MatenSection`, `KunstwerkenSection`, `SegmentenSection`, `MateriaalsoortenSection`, `MaterialenSection`, `PrijsgroepenSection`) en prijzen per kunstwerk/materiaal/maat-combinatie (inmiddels ook `PrijsmatrixSection`).
- **Bestellingen op de klant-accountpagina** — echte MySQL-data (`useAllOrders`), geen mockdata meer.
- **Datamodel:** Maten, Kunstwerken, Segmenten, Materiaalsoorten, Klanten, Prijsgroepen, Prijzen en Orders/Orderitems (als `bestelheaders`/`bestellines`) bestaan allemaal echt — nu als MySQL-tabellen in `db/schema.sql`. De N-op-N-relaties van een kunstwerk zijn geen koppeltabellen maar JSON-kolommen (`segmentIds`, `materiaalIds`, `maatIds`, `stijlIds`, `onderwerpIds`); de prijsgroep van een klant is een directe `klanten.prijsgroepId`-kolom, geen koppeltabel.

> **Bijgewerkt 2026-08-08.** Dit blok stond nog volledig in Firestore-termen. Oorzaak: de Firebase→MySQL-migratie (design `2026-07-23-firebase-to-mysql-migration-design.md`, uitgevoerd na commit `1bbeff2`), waarna Firebase volledig uit de codebase is verwijderd. Twee datamodel-details klopten daarnaast al niet met de gebouwde code: koppeltabellen bleken JSON-kolommen, en klant↔prijsgroep bleek een directe kolom.
>
> **Copyright-watermerk is hier weggehaald.** Het stond als gerealiseerd vermeld (`WatermarkedImage.tsx`), maar die component is verwijderd in commit `b069844` ("Remove image watermark"). Er is geen watermerk-functionaliteit meer in de code.

## Op pauze gezet — geen "nog te bouwen", maar bewust stopgezet

**Facturen én Retouren zijn niet simpelweg nog niet begonnen — ze zíjn gebouwd geweest en daarna weer volledig verwijderd** (commit `20d8269`, boodschap: *"on hold for now"*). Zowel de klantkant (Retourneren-tab, `ReturnsSection`) als de beheerkant (`FacturenSection`, `useReturns`) zijn weg, inclusief de mockdata. Dit vraagt om een bewuste heroverweging met de klant of dit weer wordt opgepakt, niet om gewoon verder te bouwen als losstaande to-do:

- Factuur maken voor een bestelling, met keuze van prijsgroep.
- Betaling van een factuur afhandelen (handmatig vs. koppeling met iDEAL/Mollie).
- Koppeling met een boekhoudpakket (bv. Exact, Moneybird) — hangt af van of facturatie sowieso wordt hervat.
- Retouren afhandelen, zowel klant- als beheerkant.

> **Bijgewerkt 2026-08-08 — nuance, geen statuswijziging.** De bestelworkflow kent inmiddels wél de statussen `Te factureren` en `Betaald en afgerond` (`src/lib/afrondenBestellingen.ts`), en de drukkersmail heeft een factuurvoetje (`src/lib/buildDrukkerMail.ts`). Dat zijn handmatige statusstappen en mailtekst — er is nog steeds **geen factuurdocument, geen prijsgroepkeuze bij factureren en geen betalingsafhandeling**. Facturatie als module staat dus nog steeds op pauze; alleen de status "Betaald" uit het oude lijstje is opgegaan in de bestelstatusketen.

## Nog niet gerealiseerd

- **Rollen/rechten voor medewerkers.** Nu een platte ja/nee-toegang (`medewerkers`-tabel, geen rolveld — geverifieerd in `db/schema.sql`) — geen onderscheid tussen bijvoorbeeld iemand die alleen orders mag verwerken en iemand die ook klanten mag goedkeuren.
- **Automatische notificaties bij statuswijzigingen richting de klant.** De klant krijgt nog steeds alleen een eenmalige orderbevestigingsmail bij het plaatsen van een bestelling (`CartPanel`, via het generieke `mail-server/send-mail.php`). Geen enkele statuswijziging in Beheer stuurt de klant een bericht.
- **Taalvoorkeur gekoppeld aan account.** Nog steeds alleen per browser/sessie (lokale route-taal-wissel) — de `klanten`-tabel heeft geen taalkolom, dus de voorkeur wordt niet toegepast bij opnieuw inloggen.
- **Apart hi-res productiebestand per kunstwerk.** `kunstwerken` heeft alleen een `foto`-kolom, geen apart veld voor een productiebestand voor de drukker.
- **Idee bij "Word klant" (onderzocht, nog niet gebouwd):** bedrijfsnaam/adres automatisch opvragen op basis van het ingevoerde KVK-nummer (NL), en adres op basis van postcode+huisnummer (NL/FR/DE/UK). Het `klanten`-record heeft wel al een `kvk`-kolom, maar er is geen enkele lookup-koppeling.

> **Bijgewerkt 2026-08-08.** Drie punten zijn van deze lijst gehaald omdat ze inmiddels gebouwd zijn:
>
> - **Order doorzetten naar de drukker** — gebouwd. Commit `77ca01b` ("versturen-naar-drukker dialoog") voegde `VersturenNaarDrukkerDialog`, `DrukkersSection` en de tabellen `drukkers`/`drukkerZendingen` toe. De statusketen loopt nu door tot `Verstuurd naar drukker`.
> - **Gesprekgeschiedenis (WhatsApp)** — de mockup is niet vervangen door een echte koppeling maar volledig verwijderd (`ConversationsSection`/`MOCK_CONVERSATIONS`, commit `e5d1247`). Als dit alsnog gewenst is, begint het bij nul.
> - **Automatische notificaties** — deels: het versturen naar de drukker triggert wél een mail bij een statuswijziging. Richting de klant is er nog niets, dus het punt blijft staan in aangescherpte vorm.
>
> De verwijzing naar `2026-07-23-kvk-postcode-lookup-research.md` is weggehaald: dat bestand bestaat niet en heeft blijkens de git-historie ook nooit bestaan.

## Punt dat prioriteit verdient, geen "ooit"

1. **Instellingen/profiel — architecturaal gat, inmiddels gedicht.** Zie de notitie hieronder; dit punt staat hier alleen nog om de geschiedenis vast te houden.

> **Bijgewerkt 2026-08-08 — beide prioriteitspunten zijn opgelost.**
>
> - **AVG-verwijderregel.** Het gat is gedicht: een klant met openstaande bestellingen kan zijn account niet meer zelf verwijderen. `SettingsSection.handleDeleteAccount` blokkeert dat en logt `account_verwijderen_geblokkeerd` (commit `b2fb002`, ontwerp in `plans/2026-08-06-klant-account-verwijderen-blokkeren.md`).
> - **Instellingen/profiel.** De twee gescheiden databronnen bestaan niet meer. Commit `e5d1247` ("wire customer Settings to the real database") verwijderde het `localStorage`-mockprofiel (`useMockProfile`) en koppelde de Instellingen-pagina rechtstreeks aan het echte `klanten`-record via `/api/klanten/me`.

## Niet in scope van dit document

- Concrete technische keuzes (database, auth-provider, hosting) voor wat nog gebouwd moet worden — dat gebeurt bij de daadwerkelijke brainstorm voor dat deelproject, niet hier.
- Een tijdlijn of prioriteit t.o.v. overige werk — met uitzondering van de twee punten hierboven die expliciet als prioriteit zijn gemarkeerd.
