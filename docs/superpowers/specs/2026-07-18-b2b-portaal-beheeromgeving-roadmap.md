# Roadmap: Echte B2B-portaal & Beheeromgeving (toekomstig, niet voor directe bouw)

## Status

**Dit is GEEN spec voor een deelproject dat nu gebouwd wordt.** Dit document legt requirements vast die de klant heeft aangegeven, zodat ze niet verloren gaan. Losse onderdelen zijn intussen wél via de normale brainstorm→spec→plan-cyclus opgepakt en gebouwd (zie "Al gerealiseerd" hieronder) — wat overblijft, vereist grotendeels nog een fundamenteel andere architectuur (echte facturatie/boekhouding, rollen/rechten) dan waar de huidige site al mee werkt (Firebase Auth/Firestore, static export).

**2026-07-23: dit document is kritisch tegen de daadwerkelijke code gecontroleerd** (niet tegen documentatie of memory — een eerdere status-memory bleek een ander gebouwd feature nog wekenlang als "niet gebouwd" te vermelden). Alle onderstaande statussen zijn geverifieerd door de broncode te lezen, niet aangenomen.

Zodra een resterend onderdeel wordt opgepakt, doorloopt het alsnog het volledige traject: brainstorm → (indien nodig) architectuurkeuze → spec → implementatieplan.

## Al gerealiseerd (geverifieerd in code, 2026-07-23)

- **Klantaanvragen beoordelen** (goedkeuren/afwijzen + koppelen aan prijsgroep, prijzen afgeschermd tot goedkeuring) — `KlantenSection`/`KlantModal`, echte Firestore-data.
- **Orderaanvragen beoordelen** (goedkeuren/afwijzen) — `BestellingenSection`/`BestellingModal`, echte Firestore-data (`bestelheaders`/`bestellines`). **Let op afwijkende naamgeving:** dit document sprak van status "Aangevraagd"; de gebouwde code gebruikt `Te beoordelen → Goedgekeurd/Afgewezen`. Functioneel hetzelfde beginpunt, maar een eventuele latere "In productie"-stap (zie onder "Nog niet gerealiseerd") sluit dus aan op `Goedgekeurd`, niet op een aparte "Aangevraagd"-status.
- **Beheer maten, kunstwerken, segmenten, materiaalsoorten en prijzen** — volledig, met stevige CRUD-secties (`MatenSection`, `KunstwerkenSection`, `SegmentenSection`, `MateriaalsoortenSection`, `MaterialenSection`, `PrijsgroepenSection`) en prijzen per kunstwerk/materiaal/maat-combinatie.
- **Copyright-watermerk** — echt geïmplementeerd (`WatermarkedImage.tsx`, bakt het watermerk in via canvas op elke klant-gerichte afbeelding, nooit in beheer).
- **Bestellingen op de klant-accountpagina** — echte Firestore-data (`useAllOrders`), geen mockdata meer.
- **Datamodel:** Maten, Kunstwerken, Segmenten, Materiaalsoorten (+ hun N-op-N-koppeltabellen), Klanten, Prijsgroepen (+ koppeltabel klant↔prijsgroep), Prijzen, en Orders/Orderitems (als `bestelheaders`/`bestellines`) bestaan allemaal echt in Firestore.

## Op pauze gezet — geen "nog te bouwen", maar bewust stopgezet

**Facturen én Retouren zijn niet simpelweg nog niet begonnen — ze zíjn gebouwd geweest en daarna weer volledig verwijderd** (commit `20d8269`, boodschap: *"on hold for now"*). Zowel de klantkant (Retourneren-tab, `ReturnsSection`) als de beheerkant (`FacturenSection`, `useReturns`) zijn weg, inclusief de mockdata. Dit vraagt om een bewuste heroverweging met de klant of dit weer wordt opgepakt, niet om gewoon verder te bouwen als losstaande to-do:

- Factuur maken voor een bestelling, met keuze van prijsgroep.
- Betaling van een factuur afhandelen (status → "Betaald"; handmatig vs. koppeling met iDEAL/Mollie).
- Koppeling met een boekhoudpakket (bv. Exact, Moneybird) — hangt af van of facturatie sowieso wordt hervat.
- Retouren afhandelen, zowel klant- als beheerkant.

## Nog niet gerealiseerd

- **Order doorzetten naar de drukker.** Geen concept van "In productie" in de code — alleen `Te beoordelen | Goedgekeurd | Afgewezen` bestaat als status. Er is geen actie om een goedgekeurde bestelling naar een volgende productiestatus te zetten.
- **Rollen/rechten voor medewerkers.** Nu een platte ja/nee-toegang (`medewerkers`-collectie, geen rolveld) — geen onderscheid tussen bijvoorbeeld iemand die alleen orders mag verwerken en iemand die ook klanten mag goedkeuren.
- **Automatische notificaties bij statuswijzigingen** (bv. "bestelling in productie", "retour verwerkt"). Er bestaat alleen een eenmalige orderbevestigingsmail bij het plaatsen van een bestelling (`mail-server/send-order-confirmation.php`, aangeroepen vanuit `CartPanel`) — geen enkele statuswijziging in Beheer triggert een mail of ander bericht.
- **Gesprekgeschiedenis (WhatsApp).** Nog volledig mockdata (`ConversationsSection` rendert `MOCK_CONVERSATIONS`), geen echte koppeling.
- **Taalvoorkeur gekoppeld aan account.** Nog steeds alleen per browser/sessie (`useMockProfile`, lokale route-taal-wissel) — niet opgeslagen op het echte Firestore-klantdocument, dus niet automatisch toegepast bij het opnieuw inloggen.
- **Apart hi-res productiebestand per kunstwerk.** Enige losse gat in de verder afgeronde kunstwerken-beheer: `Kunstwerk` heeft alleen een `foto`-veld (de watermerk-webfoto), geen apart veld voor een niet-verwaterd productiebestand voor de drukker.
- **Idee bij "Word klant" (onderzocht, nog niet gebouwd):** bedrijfsnaam/adres automatisch opvragen op basis van het ingevoerde KVK-nummer (NL), en adres op basis van postcode+huisnummer (NL/FR/DE/UK). Volledig onderzoek (API's, kosten, snelheid, architectuur) staat in [`2026-07-23-kvk-postcode-lookup-research.md`](2026-07-23-kvk-postcode-lookup-research.md).

## Twee punten die prioriteit verdienen, geen "ooit"

1. **AVG-verwijderregel is niet meer "wacht op echte orders" — de blokkade is al weg.** [[project_klantgoedkeuring_future_rules]] stelde deze regel destijds uit omdat orders toen nog mockdata waren. Dat klopt niet meer: Bestellingen zijn nu echt. Een klant kan op dit moment zijn account instant zelf verwijderen (`SettingsSection.handleDeleteAccount` doet direct `deleteDoc`/`deleteUser`, geen controle op openstaande bestellingen, geen review door Beheer) terwijl er een echte, gekoppelde bestelling bestaat — precies het scenario dat de regel moest voorkomen.
2. **Instellingen/profiel is een architecturaal gat, geen nice-to-have.** Het echte klantprofiel (Firestore, gekoppeld aan bestellingen via `klantId`) en het profiel dat de klant op zijn Instellingen-pagina ziet en bewerkt zijn twee volledig gescheiden databronnen: Instellingen leest/schrijft nog altijd een los `localStorage`-mockprofiel (`useMockProfile`), zonder enige koppeling aan het echte `klanten`-document. Zodra dit "echt" wordt, is dat geen simpele klus maar een samenvoeging van twee datamodellen.

## Niet in scope van dit document

- Concrete technische keuzes (database, auth-provider, hosting) voor wat nog gebouwd moet worden — dat gebeurt bij de daadwerkelijke brainstorm voor dat deelproject, niet hier.
- Een tijdlijn of prioriteit t.o.v. overige werk — met uitzondering van de twee punten hierboven die expliciet als prioriteit zijn gemarkeerd.
