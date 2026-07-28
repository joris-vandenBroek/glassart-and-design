# Firebase → MySQL migratie op mijn.host — ontwerp

## Context

De site draait nu als statische Next.js-export (`output: 'export'`) op GitHub Pages, met
Firebase (Firestore + Auth) als databaselaag. Losse PHP-scripts (`mail-server`,
`upload-server`) draaien al op mijn.host.

Uit eerder onderzoek in deze conversatie is bevestigd dat Node.js/Next.js in server-mode
(SSR + API-routes) werkt via Passenger op mijn.host (test-app op
`nodetest.glassartanddesign.com`, Node 24.17.0, geen cold-start waargenomen na 40+ minuten
inactiviteit).

Doel van dit ontwerp: Firebase volledig vervangen (data én Auth) door MySQL + een eigen
Node.js/Next.js API-laag, alles gehost op mijn.host. GitHub blijft de
ontwikkelomgeving/versiebeheer; alleen GitHub Pages als *hosting* vervalt.

## Architectuur

```
Browser
  │
  ▼
Next.js app (server-mode, Passenger op mijn.host — glassartanddesign.com)
  ├─ Pagina's (client components) — fetch() naar eigen API-routes i.p.v. rechtstreekse Firestore-calls
  ├─ API-routes (/api/klanten, /api/bestelheaders, /api/kunstwerken, /api/auth/*, ...) — praten met MySQL via mysql2
  └─ Sessie-middleware — leest sessie-cookie, valideert tegen `sessions`-tabel
  │
  ▼
MySQL-database (mijn.host, DirectAdmin "Databases")
```

De bestaande PHP-scripts (`mail-server`, `upload-server`) blijven ongewijzigd naast de
Node-app draaien en vallen buiten de scope van deze migratie.

## Datamodel-mapping

| Firestore-collectie | MySQL-tabel | Opmerking |
|---|---|---|
| `klanten/{uid}` | `klanten` | eigen auto-increment/UUID i.p.v. Firebase-uid |
| `medewerkers/{uid}` | `medewerkers` | idem; wachtwoord apart behandeld, zie Datamigratie |
| `bestelheaders` + subcollectie `bestellines` | `bestelheaders`, `bestellines` | `bestellines.bestelheader_id` als foreign key |
| `activiteitenlog` | `activiteitenlog` | |
| `kunstwerken` | `kunstwerken` | |
| `materialen` | `materialen` | |
| `maten` | `maten` | |
| `materiaalsoorten` | `materiaalsoorten` | |
| `segmenten` | `segmenten` | |
| `prijsgroepen` | `prijsgroepen` | |
| `instellingen/bedrijfsgegevens` | `instellingen` | single-row tabel of key/value; bevat echte bedrijfsdata, zie Datamigratie |
| `counters/bestelnummer` | vervalt | wordt een `AUTO_INCREMENT`/eigen nummergenerator op `bestelheaders`, uit te werken in het implementatieplan |
| n.v.t. (nieuw) | `sessions` | `id`, `user_type` (klant/medewerker), `user_id`, `expires_at` |
| n.v.t. (nieuw) | `password_reset_tokens` | token, `user_type`, `user_id`, `expires_at` |

Geen enkele collectie gebruikt Firestore real-time listeners (`onSnapshot`) — alleen
one-time reads/writes. Er gaat dus geen real-time-functionaliteit verloren bij de
migratie. Firebase Storage wordt nergens gebruikt (bestandsuploads lopen al via de PHP
`upload-server`), dus daar is niets te migreren.

## Datamigratie (scope)

Alleen deze twee bronnen bevatten data die behouden moet blijven; de rest start leeg
(inclusief `klanten` — nog geen echte klantregistraties):

- **`instellingen/bedrijfsgegevens`** — echte bedrijfsgegevens (adres, contactpersonen,
  materialen/USP-content). Eén document, één keer over te zetten naar de nieuwe
  `instellingen`-tabel.
- **`medewerkers`** — bestaande staff-accounts (Paul, Hem, Julie e.d.). Alleen
  **profielgegevens** (naam, e-mail, rol) worden overgezet — Firebase's
  wachtwoord-hashes zijn niet compatibel met het nieuwe `scrypt`-schema en worden niet
  gemigreerd. Elke medewerker moet na de cutover eenmalig een nieuw wachtwoord instellen
  via de wachtwoord-vergeten-flow.

Alle overige collecties (`kunstwerken`, `materialen`, `maten`, `materiaalsoorten`,
`segmenten`, `prijsgroepen`, `bestelheaders`/`bestellines`, `activiteitenlog`) bevatten
alleen test-/voorbeelddata en starten leeg in MySQL (eventueel opnieuw geseed via de
bestaande seed-constanten, zoals nu ook al gebeurt in `useFirestoreCollection`).

## Auth-strategie

- Twee gebruikerstypen, zoals nu: `klanten` en `medewerkers`, elk met eigen
  login/registratie-formulier.
- **Sessie-gebaseerd (geen JWT):** login/registratie maakt een rij in `sessions`
  (`id`, `user_type`, `user_id`, `expires_at`) en zet een **httpOnly, secure,
  sameSite-cookie** met alleen het sessie-ID. Uitloggen = rij verwijderen + cookie
  wissen — direct herroepbaar, belangrijk voor de bestaande account-verwijder-functie.
  Sessie-verval bijv. 30 dagen, verlengd bij activiteit; opschonen van verlopen sessies
  mag lazy (bij validatie), een aparte cleanup-cron is een latere nice-to-have.
- **Wachtwoord-hashing** via Node's ingebouwde `crypto.scrypt` — geen extra dependency,
  dus geen native-binary-risico op de nog beperkt geteste mijn.host Node-omgeving.
- **Wachtwoord-vergeten-flow** voor **zowel klanten als medewerkers** (nu bestaat dit
  alleen voor medewerkers, via Firebase's `sendPasswordResetEmail`): een
  `password_reset_tokens`-tabel, een API-route die een token genereert en een e-mail
  verstuurt via de **bestaande PHP mail-server**, en een pagina om met een geldig token
  een nieuw wachtwoord in te stellen.

## API- en dataleaag

- **Aanpak:** ruwe SQL-queries via `mysql2` (geen ORM/query-builder). Reden: het schema
  is met ~14 tabellen overzichtelijk, en na het net pas geverifieerde (en nog beperkt
  geteste) Node-hosting op mijn.host is een dependency zonder native binaries (zoals
  Prisma die wél heeft) het laagste risico.
- **Routes:** REST-achtig per resource — `/api/klanten`, `/api/bestelheaders`,
  `/api/kunstwerken`, `/api/materialen`, `/api/maten`, `/api/materiaalsoorten`,
  `/api/segmenten`, `/api/prijsgroepen`, `/api/activiteitenlog`, `/api/instellingen`,
  plus `/api/auth/register|login|logout|reset-password`. Standaard HTTP-verbs (GET/POST/
  PATCH/DELETE).
- **Client-hooks met identieke interface als nu:** `useFirestoreCollection<T>` heeft de
  vorm `{ items, error: 'load'|'action'|null, add, update, remove, refetch }`. De nieuwe
  `useApiCollection<T>('kunstwerken', { seed })` krijgt **exact dezelfde signatuur en
  returnwaarde** — alleen intern fetch() i.p.v. Firestore-calls. Zelfde principe voor
  `useFirestoreDocument` → `useApiDocument`, en `useCustomerAuth`/`useAdminAuth` → nieuwe
  auth-hooks. Hierdoor hoeven consumerende componenten (`ProductsGrid`, `FeaturedWorks`,
  `OrdersSection`, `BeheerShell`, e.a.) grotendeels alleen de import om te zetten.

## Foutafhandeling

- API-routes: try/catch, generieke `{ error: string }`-response + juiste HTTP-status
  (400/401/404/500). Ruwe SQL-fouten alleen server-side loggen, nooit naar de client
  lekken.
- Client-hooks: zelfde `'load' | 'action'`-foutcodes als nu, zodat bestaande
  foutafhandeling in componenten ongewijzigd blijft werken.

## Bouwvolgorde (cutover)

Geen gefaseerde live-migratie nodig (geen productie-traffic op het echte domein) — dit is
puur de volgorde waarin gebouwd wordt:

1. MySQL-database + schema aanmaken via DirectAdmin ("Databases"), inclusief de nieuwe
   `sessions`- en `password_reset_tokens`-tabellen.
2. Eenmalig migratiescript: `instellingen/bedrijfsgegevens` en `medewerkers`-profielen
   exporteren uit Firestore en importeren in MySQL.
3. API-routes bouwen (CRUD per resource + auth-routes + sessie-middleware).
4. Vervang-hooks bouwen (`useApiCollection`, `useApiDocument`, auth-hooks) met dezelfde
   interfaces als de huidige Firestore-hooks.
5. `next.config.mjs`: van `output: 'export'` naar server-mode; lokaal testen.
6. Consumerende componenten ombouwen naar de nieuwe hooks (grotendeels mechanisch dankzij
   gelijke interface).
7. Firebase opruimen: `firebase.ts`, `firestore.rules`, `storage.rules`, dependency uit
   `package.json`.
8. Deployen als live Node-app op mijn.host (`glassartanddesign.com`); GitHub Pages
   uitfaseren. GitHub blijft de ontwikkelomgeving/versiebeheer zoals nu.

## Teststrategie

- **Client-hooks:** unit tests met gemockte `fetch`, in dezelfde stijl als bestaande
  componenttests (bijv. `tests/components/beheer/KunstwerkenSection.test.tsx`).
- **API-routes:** tests tegen een echte lokale test-MySQL-database (zelfde schema, aparte
  databasenaam) — geen gemockte queries, zodat foreign-key- en constraint-fouten ook
  echt worden getest.
- **Auth-logica** (wachtwoord-hashing, sessie-validatie, token-verval): losse unit tests,
  geen database nodig.
- Bestaande componenttests die nu Firebase mocken worden aangepast naar de nieuwe hooks.

## Addendum (2026-07-28): bijgewerkte scope na heraudit

Na het schrijven van dit ontwerp is de codebase door andere sessies flink uitgebreid. Een
volledige heraudit (zie de implementatieplan-taken) bracht het volgende aan het licht dat
in de originele scope ontbrak.

**Nieuwe tabellen:**
- `stijlen`, `onderwerpen` — simpele lookup-tabellen, zelfde vorm als `segmenten`.
- `kunstenaars` — publiek leesbaar, staff-only schrijfbaar, **behalve** het veld
  `prijsafspraken`.
- `kunstenaarAfspraken` — staff-only, bevat alleen `prijsafspraken` (bewust gesplitst van
  `kunstenaars` voor toegangscontrole — nu via Firestore-rules, straks server-side).
- `drukkers` — **volledig staff-only**, geen publieke lezing (in tegenstelling tot
  `kunstenaars`).
- `drukkerZendingen` (was Firestore-subcollectie `drukkers/{id}/zendingen`) — append-only
  verzendlog, `drukkerId` als foreign key.

**Gewijzigde velden:**
- `kunstwerken`: `artiest` bestaat niet meer, vervangen door `kunstenaarId` (foreign key
  naar `kunstenaars`). Nieuw: `formaat` (`'vierkant'|'liggend'|'staand'`, optioneel),
  `stijlIds`/`onderwerpIds` (JSON-arrays, optioneel), `aiGegenereerd` (boolean, optioneel),
  `prijsPerM2` (decimaal, optioneel, alternatief prijsmodel naast de bestaande
  `prijzen`-grid).
- `klanten`: `exclusieveKunstenaarIds` (JSON-array) en `minimaleAfname` (nullable getal,
  klant-specifieke override) ontbraken in het oorspronkelijke schema.
- `bestelheaders.status`: de workflow is uitgebreid met een drukker-stap — huidige waarden
  zijn `Te beoordelen` → `Te versturen naar drukker` → `Verstuurd naar drukker`, of
  `Afgewezen`. De oorspronkelijke waarde `Goedgekeurd` bestaat niet meer.
- `instellingen`: een tweede document `bestelinstellingen` (globale `minimaleAfname`,
  los van de klant-specifieke override hierboven).

**Beveiliging die van Firestore-rules naar server-side moet verhuizen** (er is straks geen
rules-laag meer, dus dit wordt de enige handhaving):
1. **Verkooprecht/exclusiviteit** (`resolveOrderRight`-equivalent) — nu alleen een
   client-side UI-hint die de Firestore-rules spiegelt; moet **echt afgedwongen** worden
   bij het aanmaken van een bestelling (server-side check tegen `kunstwerken.kunstenaarId`
   → `kunstenaars.verkooprecht`/`exclusiefVoorKlantId`).
2. **`bestellines`-validatie** (prijs > 0, quantity een positief geheel getal, toegestane
   velden) — dit werd **uitsluitend** door Firestore-rules afgedwongen, nergens
   client-side. Moet expliciet server-side in de bestelheaders-route.
3. **`activiteitenlog`-type-allowlist** — nu dubbel onderhouden (een lijst in
   `firestore.rules`, een aparte TS-union in `logActiviteit.ts`). In de nieuwe architectuur
   consolideren tot één bron: de API-route valideert simpelweg tegen dezelfde TS-union die
   de client al importeert, geen aparte lijst meer nodig.
4. **Staff-only resources** (`drukkers`, `kunstenaarAfspraken`, en de generieke
   lookup-resource-route in het algemeen) hebben momenteel geen enkele auth-check in het
   ontwerp. **Besluit (2026-07-28):** de generieke CRUD-routefactory (zie API-laag
   hierboven) krijgt een optioneel `authRequired: 'medewerker'`-parameter, herbruikbaar
   voor elke staff-only resource, in plaats van losse handgeschreven routes per resource.

**`kunstenaars`' veldsplitsing:** de publieke route serveert `kunstenaars` zonder de
`prijsafspraken`-kolom (een expliciete kolom-projectie, geen `SELECT *`); een aparte
staff-only route (met de nieuwe `authRequired: 'medewerker'`-gate) serveert/bewerkt
`kunstenaarAfspraken` — dit spiegelt de huidige Firestore-opzet vrijwel 1-op-1.

## Buiten scope

- Migratie van `mail-server`/`upload-server` (PHP) naar Node — blijft ongewijzigd.
- Automatische cleanup-cron voor verlopen sessies/tokens (lazy-expiry is voldoende voor v1).
- Keep-alive/cron tegen Passenger cold-starts — niet nodig gebleken (proces bleef 40+
  minuten actief tijdens de test in deze conversatie).
