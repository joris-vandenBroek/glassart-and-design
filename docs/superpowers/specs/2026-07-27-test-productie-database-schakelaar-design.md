# Test/productie-database-schakelaar — ontwerp

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 27-07-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **VERVANGEN (2026-07-27):** dit ontwerp is niet uitgevoerd. Tijdens dezelfde
> brainstormsessie bleek een losse staging-omgeving (vaste eigen deployment, permanent
> verbonden met de test-database — voortbouwend op het bestaande
> `nodetest.glassartanddesign.com`) hetzelfde doel simpeler en veiliger te bereiken: geen
> runtime-schakelaar, geen `app_instellingen`-tabel, geen per-sessie identiteitscheck. Zie
> het staging-omgevingsontwerp voor de vervolgaanpak. Dit document blijft staan als
> onderbouwing van waarom die aanpak is losgelaten.

## Context

Dit ontwerp bouwt voort op de nog niet uitgevoerde migratie in
[`2026-07-23-firebase-to-mysql-migration-design.md`](2026-07-23-firebase-to-mysql-migration-design.md)
en het bijbehorende plan
([`2026-07-23-firebase-to-mysql-migration.md`](../plans/2026-07-23-firebase-to-mysql-migration.md)).
Dat plan zet twee losse MySQL-databases op mijn.host neer (test en productie) en leest de
verbindingsgegevens (`DB_HOST`/`DB_NAME`/etc.) via `getPool()` één keer in bij het opstarten
van de server (`src/lib/server/db.ts`) — een vaste database per draaiende instantie.

Voor dit ontwerp is dat niet genoeg: Joris (`joris.vandenbroek@gmail.com`, web-designer) wil
op de **live productieomgeving** (`glassartanddesign.com`) kunnen schakelen tussen "echte"
productiedata en testdata, zonder de server te herstarten, en zonder dat andere medewerkers
zelf iets hoeven te schakelen. Dit raakt zowel het beheer-gedeelte als het volledige
klantgedeelte (bestelflow), zodat een compleet end-to-end-scenario getest kan worden op de
live site.

## Doel

- Eén globale aan/uit-schakelaar, **alleen bedienbaar door Joris**, die bepaalt of
  bedrijfsdata (kunstwerken, klanten, bestellingen, activiteitenlog, etc.) uit de test- of
  productiedatabase wordt gelezen/geschreven.
- Een echte, extern inloggende klant (elk e-mailadres buiten `@glassartanddesign.com`) komt
  **nooit** in de test-database terecht, ongeacht de stand van de schakelaar — dit is de
  belangrijkste garantie van dit ontwerp.
- Andere medewerkers hoeven de schakelaar niet te bedienen en zien 'm niet, maar volgen 'm
  wel automatisch (hun sessies routeren mee naar test zodra 'm aanstaat) en zien altijd een
  banner zolang dat zo is.
- Lokaal draaien vanaf de GitHub-checkout (`npm run dev`) wijst standaard naar de
  test-database — geen aparte afspraak nodig, dit is gewoon de env-var-default uit het
  bestaande migratieplan.

## Architectuur

```
Browser
  │
  ▼
Next.js app (server-mode, Passenger op mijn.host — glassartanddesign.com)
  ├─ Auth/sessie altijd tegen prodPool (medewerkers, klanten, sessions)
  ├─ resolveDataPool(session) → per aanvraag: prodPool of testPool
  │     testModusActief? (uit app_instellingen, in prodPool)
  │       nee            → altijd prodPool
  │       ja              → sessie-e-mail eindigt op '@glassartanddesign.com'
  │                          OF sessie-e-mail === 'joris.vandenbroek@gmail.com'
  │                            → testPool
  │                          anders (echte klant)
  │                            → altijd prodPool
  └─ API-routes voor bedrijfsdata gebruiken resolveDataPool(session) i.p.v. een vaste pool
  │
  ├──────────────┬──────────────┐
  ▼              ▼
prodPool      testPool
(MySQL,       (MySQL,
productie)    test)
```

Beide pools (`prodPool`, `testPool`) zijn permanent geïnitialiseerd zodra de server opstart
— er wordt niet dynamisch verbonden/losgekoppeld op basis van de schakelaarstand.

## Componenten & schema

- **`app_instellingen`** — nieuwe tabel in de **productiedatabase**, één rij:
  - `testModusActief BOOLEAN`
  - `gewijzigdOp DATETIME`

  Geen `gewijzigdDoor`-kolom: aangezien alleen Joris de schakelaar bedient (zie hieronder),
  zou die kolom altijd dezelfde waarde bevatten en voegt niets toe.

- **`resolveDataPool(session)`** — server-only helperfunctie, geïmplementeerd naast
  `getPool()` in `src/lib/server/db.ts`. Voert de beslisboom uit het architectuurdiagram uit.
  Elke API-route die bedrijfsdata aanraakt (kunstwerken, klanten, bestelheaders/-lines,
  activiteitenlog, materialen, maten, etc.) roept deze aan in plaats van een vaste pool te
  gebruiken. Auth-routes (`sessions`, login/registratie) blijven altijd `prodPool` gebruiken.

- **Geen API-endpoint om de vlag te zetten.** Joris zet `testModusActief` rechtstreeks om
  via phpMyAdmin of SSH op de productiedatabase — geen `POST`-route, geen app-side
  autorisatiecheck nodig, want databasetoegang zelf is al de toegangscontrole (alleen Joris
  heeft credentials voor de productiedatabase). Dit scheelt een heel component: geen
  endpoint, geen 403-logica, geen bijbehorende autorisatietest.

- **`GET /api/beheer/test-modus`** — geeft `{ testModusActief: boolean }` terug. Toegankelijk
  voor elke ingelogde medewerker (nodig om de banner te kunnen tonen). Dit leesgedeelte blijft
  ongeacht hoe de vlag gezet wordt.

- **Sessie-infocall** (bestaande "wie ben ik"-route, bv. `/api/auth/me`) krijgt één extra
  veld: `testModusActief` — of *deze sessie* naar test gerouteerd wordt (dus na toepassing
  van de identiteitsregel — een echte klant krijgt hier dus `false` te zien, ook als de
  globale vlag aanstaat). Geen `magSchakelen`-veld nodig — er is geen schakelknop in de UI
  (zie Optie A hieronder), dus niemand hoeft er frontend-zichtbaarheid op te baseren.

- **Bannercomponent** — getoond in zowel de beheer-shell als de klant-facing layout, zodra
  de sessie-infocall `testModusActief: true` teruggeeft voor de huidige sessie.

## Testdata-afspraak (geen code)

Orderbevestigingsmails aan klanten gaan gewoon naar het e-mailadres van de (test-)klant zelf
— geen aanpassing nodig, de bestaande mail-verzendcode blijft ongewijzigd.

Om te voorkomen dat een testbestelling een echte drukker bereikt, krijgen de
`drukkers`-records in de **test-database** bij het opzetten/seeden een veilig
(test-)e-mailadres (bv. `info@glassartanddesign.com` of een ander intern adres) in plaats
van het echte drukker-adres. Dit is puur een kwestie van hoe de test-database wordt
ingericht, niet van applicatielogica — de mailcode stuurt overal gewoon "naar wat er in het
record staat".

## Foutafhandeling & beveiliging

- **Autorisatie:** geen app-side autorisatiecheck nodig — de vlag wordt uitsluitend via
  directe databasetoegang (phpMyAdmin/SSH) gezet, en alleen Joris heeft die credentials.
  Databasetoegang zelf is hier de toegangscontrole.
- **Geen silent fallback:** als `resolveDataPool` besluit dat een aanvraag `testPool` moet
  gebruiken maar die verbinding faalt, wordt de aanvraag met een expliciete serverfout
  afgebroken (bv. `500`) — nooit stilzwijgend terugvallen op `prodPool`.
- **Geen caching van de vlag:** `testModusActief` wordt bij elke aanvraag vers uit
  `app_instellingen` gelezen. Een omschakeling door Joris werkt daardoor direct door voor
  alle lopende sessies, zonder herstart.
- **Banner is niet live-push:** de status wordt mee opgehaald bij elke pagina-navigatie/
  sessie-infocall, niet via een realtime-verbinding (geen websockets in deze applicatie).
  Een reeds open scherm bij een collega toont de nieuwe status pas bij de eerstvolgende
  navigatie/actie.
- **Activiteitenlog:** geen aparte "test"-markering nodig — testacties komen terecht in de
  `activiteitenlog`-tabel van de test-database, volledig gescheiden van de
  productie-activiteitenlog.

## Testen

- **`resolveDataPool`-unittests** tegen een echte lokale test-MySQL (geen mocks, zoals de
  rest van het migratieplan): vier combinaties — vlag uit (altijd prod), vlag aan +
  `@glassartanddesign.com`-e-mail (test), vlag aan + `joris.vandenbroek@gmail.com` (test),
  vlag aan + externe klant-e-mail (altijd prod).
- **Bannertest:** sessie-infocall geeft `testModusActief` correct terug voor de drie rollen
  (Joris, medewerker, klant).

## Buiten scope

- Geen `POST`-endpoint of app-side autorisatielogica om de vlag te zetten (Optie A: direct
  in de database via phpMyAdmin/SSH).
- Geen mail-redirect-logica in code (opgelost via testdata, zie hierboven).
- Geen `gewijzigdDoor`-kolom of ander auditveld voor "wie schakelde" (kan alleen Joris zijn).
- Geen realtime/websocket-push van de bannerstatus.
- Geen wijziging aan hoe lokale ontwikkeling (`npm run dev` vanaf de GitHub-checkout) de
  database kiest — dat blijft de bestaande env-var-default uit het migratieplan.
