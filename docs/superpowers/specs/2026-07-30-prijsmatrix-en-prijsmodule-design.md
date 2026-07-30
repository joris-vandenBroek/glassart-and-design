# Prijsmatrix & Prijsmodule — design

Datum: 2026-07-30

## Aanleiding

Vandaag vult een medewerker per kunstwerk handmatig een prijs in voor elke combinatie van gekozen materiaal × maat (`kunstwerken.prijzen`, een array van `{materiaalId, maatId, prijs}`). Dat is foutgevoelig en niet herbruikbaar tussen kunstwerken. Dit ontwerp introduceert een centrale prijsmatrix (prijs per maat × materiaal, los van een specifiek kunstwerk) plus een kunstenaar-specifieke prijsopslag, en bundelt alle prijsberekening in één server-side module ("Prijsmodule") zodat er nog maar één plek is die weet hoe een verkoopprijs tot stand komt — nu, en straks als daar prijsgroep-kortingen bij komen.

## Scope

**In scope:**
- Nieuwe `prijsmatrix`-tabel (prijs per maat × materiaal), beheerd via een nieuwe "Prijsmatrix"-sectie in beheer.
- Nieuw `prijsopslag`-veld per kunstenaar (staff-only), beheerd in de bestaande Kunstenaars-sectie.
- Server-side Prijsmodule die matrixprijs + kunstenaar-opslag combineert tot een eindprijs, voor kunstwerken die maten hebben.
- `ProductModal.tsx` (storefront) gebruikt deze module via een API-endpoint in plaats van zelf te rekenen.
- `POST /api/bestelheaders` herberekent de prijs server-side via dezelfde module in plaats van de door de klant meegestuurde prijs te vertrouwen.
- Verwijderen van een maat/materiaal wordt server-side geblokkeerd als die nog in een bestellijn voorkomt (naast de bestaande kunstwerk-check).
- Verwijderen van `kunstwerken.prijzen` (kolom + type) — vervangen door read-only berekende preview in de beheer-UI.
- Activiteitenlog-events voor prijsmatrix-wijzigingen en kunstenaar-opslagwijzigingen.

**Buiten scope (expliciet, voor een volgende ronde):**
- Prijsgroep-kortingen (`prijsgroepen.kortingspercentage`) meenemen in de Prijsmodule — de gebruiker heeft aangegeven dat hier binnenkort een vervolg op komt; de module wordt zo opgezet dat dat er later in past, maar wordt nu niet gebouwd.
- Prijsberekening voor maatloze kunstwerken (`prijsPerM2` × custom breedte/hoogte) blijft ongewijzigd — die combinatie heeft geen maat om in de matrix op te zoeken.
- Migratie van bestaande `kunstwerken.prijzen`-waarden naar de matrix (de matrix start leeg; zie Rollout).

## 1. Datamodel

### Nieuwe tabel `prijsmatrix`

```sql
CREATE TABLE prijsmatrix (
  id CHAR(36) PRIMARY KEY,
  maatId CHAR(36) NOT NULL,
  materiaalId CHAR(36) NOT NULL,
  prijs DECIMAL(10,2),
  UNIQUE KEY unique_maat_materiaal (maatId, materiaalId),
  FOREIGN KEY (maatId) REFERENCES maten(id) ON DELETE CASCADE,
  FOREIGN KEY (materiaalId) REFERENCES materialen(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Gekozen aanpak: **FK-cascade + berekende grid**, geen eager sync-code.
- Een rij bestaat alleen als er ooit een prijs is opgeslagen voor die combinatie. Ontbrekende combinaties tonen als lege cel bij het ophalen (zie API hieronder) — de grid is dus per definitie altijd volledig en actueel, ook direct na het toevoegen van een nieuwe maat of materiaal.
- Verwijderen van een maat of materiaal ruimt via `ON DELETE CASCADE` automatisch de bijbehorende `prijsmatrix`-rijen op. Geen aparte opschoon-code nodig.
- Opslaan van een prijs is een upsert op de unieke sleutel `(maatId, materiaalId)`.

Deze tabel wordt **niet** toegevoegd aan `LOOKUP_RESOURCES` (het generieke `[resource]`-CRUD-mechanisme) omdat GET een join-gebaseerde berekende grid teruggeeft (geen kale `SELECT *`) en de write-kant een upsert op een samengestelde sleutel is (geen `id`-gebaseerde update). Dedicated route, zoals ook bij `kunstenaars`.

### `kunstenaarAfspraken.prijsopslag`

```sql
ALTER TABLE kunstenaarAfspraken ADD COLUMN prijsopslag DECIMAL(10,2) NOT NULL DEFAULT 0;
```

Toegevoegd aan de bestaande staff-only tabel (naast `prijsafspraken`), **niet** aan de publiek leesbare `kunstenaars`-tabel — de opslag mag nooit richting de klant-browser lekken (zelfde afscherming als `prijsafspraken` vandaag al heeft).

### `kunstwerken.prijzen` — verwijderen

```sql
ALTER TABLE kunstwerken DROP COLUMN prijzen;
```

De kolom, de `jsonColumns`-registratie in `src/lib/server/lookupResources.ts`, en het `PrijsRegel`-type in `src/components/beheer/materiaalTypes.ts` vervallen. `prijsPerM2` blijft ongewijzigd (maatloze kunstwerken).

Alle drie de schema-wijzigingen worden ook doorgevoerd in `db/schema.sql` (de source-of-truth) en handmatig uitgevoerd tegen de staging-database, met akkoord vooraf — zie Rollout.

## 2. Prijsmodule (server-side)

Nieuw bestand: `src/lib/server/prijsmodule.ts`.

Eén functie die de eindprijs berekent voor een kunstwerk + maat + materiaal:

```ts
interface BerekenPrijsInput {
  kunstwerk: { kunstenaarId: string | null; maatIds: string[]; materiaalIds: string[]; prijsPerM2: number | null };
  maatId: string | null;       // null bij maatloos/custom-size
  materiaalId: string;
  customBreedteCm?: number;    // alleen relevant bij maatloos
  customHoogteCm?: number;
}

interface BerekenPrijsResult {
  prijs: number | null;        // null = prijs op aanvraag
  isMaatloos: boolean;
}

async function berekenPrijs(input: BerekenPrijsInput): Promise<BerekenPrijsResult>
```

Logica:
- **Maatloos** (`kunstwerk.maatIds.length === 0`): zelfde formule als vandaag — `round((breedteCm/100) × (hoogteCm/100) × prijsPerM2, 2)`, of `null` als afmetingen ontbreken/`prijsPerM2` niet gezet is. De matrix speelt hier geen rol.
- **Met maat**: `prijsmatrix`-rij opzoeken voor `(maatId, materiaalId)`. Geen rij of `prijs IS NULL` → `null` (prijs op aanvraag). Anders: matrixprijs + `kunstenaarAfspraken.prijsopslag` van `kunstwerk.kunstenaarId` (0 als geen kunstenaar gekoppeld of geen `kunstenaarAfspraken`-rij bestaat).
- Custom-size-met-materiaal-maar-niet-maatloos (bestaand geval: materiaal staat eigen maat toe, kunstwerk heeft wél reguliere maten) blijft ongewijzigd "prijs op aanvraag" tonen — geen matrix-lookup mogelijk zonder vaste maat.

Deze functie is de **enige plek** die matrixprijs en kunstenaar-opslag combineert. Alle drie de aanroeppunten (storefront-endpoint, beheer-preview, bestelheaders) gebruiken 'm.

### Nieuw endpoint: prijs opvragen

`GET /api/kunstwerken/[id]/prijs?maatId=&materiaalId=&breedte=&hoogte=`

Retourneert uitsluitend `{ prijs: number | null }` — nooit de matrixprijs en opslag los, zodat de opslag niet af te leiden is uit de API-response. Geen auth-gate nodig (publiek zoals de huidige prijsweergave).

### Nieuw endpoint: matrix beheren

`src/app/api/prijsmatrix/route.ts` (dedicated, staff-only voor zowel lezen als schrijven, net als `prijsgroepen`/`drukkers`):
- `GET`: retourneert de volledige berekende grid — alle combinaties van `maten × materialen`, met `prijs: number | null` (LEFT JOIN op `prijsmatrix`). `requireMedewerker`.
- `PUT`: body `{ maatId, materiaalId, prijs: number | null }`, upsert op de unieke sleutel. `requireMedewerker`.

## 3. Storefront — `ProductModal.tsx`

Vervangt de huidige client-side lookup (`kunstwerk.prijzen.find(...)`) en de `prijsPerM2`-formule-inline door één aanroep naar `GET /api/kunstwerken/[id]/prijs`. De maatloos/custom-size-formule an sich verhuist (ongewijzigd van gedrag) naar de Prijsmodule; `ProductModal` roept alleen nog het endpoint aan en toont `prijs op aanvraag` als het resultaat `null` is (zelfde UI-tekst/gedrag als vandaag).

## 4. Bestelling plaatsen — `POST /api/bestelheaders`

Vandaag valideert de route alleen dat de meegestuurde `line.prijs` een positief getal (of `null`) is — de waarde zelf komt ongecontroleerd van de klant-browser. Dit wordt aangepast: voor elke regel roept de route `berekenPrijs(...)` aan met de server-bekende kunstwerk-, maat- en materiaalgegevens, en slaat dát resultaat op als `prijs` in `bestellines`. De door de klant meegestuurde `line.prijs` wordt genegeerd (niet gevalideerd, niet opgeslagen) — de server is de enige bron van waarheid voor de besteldprijs. Retourneert de Prijsmodule `null` (prijs op aanvraag) voor een regel, dan wordt die bestelling geweigerd met een duidelijke foutmelding — een regel zonder vaste prijs mag niet besteld kunnen worden.

## 5. Verwijderen van een maat/materiaal — extra guard

Naast de bestaande client-side check in `MatenSection.tsx`/`MaterialenSection.tsx` (blokkeert als een kunstwerk de maat/materiaal nog gebruikt) komt er een **server-side** check in de generieke DELETE-handler (`src/app/api/[resource]/[id]/route.ts`), specifiek voor de resources `maten` en `materialen`:

```sql
SELECT 1 FROM bestellines WHERE maatId = ? LIMIT 1   -- resp. materiaalId = ?
```

Bestaat er een match, dan wordt de delete geweigerd (4xx), ongeacht of het request via de beheer-UI of rechtstreeks via de API komt. Dit dekt ook bestellingen waarvan het kunstwerk inmiddels is aangepast of verwijderd.

## 6. Beheer-UI

### Nieuwe sectie "Prijsmatrix"
- `BeheerNav.tsx`: `BeheerSection`-union krijgt `'prijsmatrix'`, nieuw item in `ACTIVE_ITEMS` met `labelKey: 'navPrijsmatrix'`. Nieuwe i18n-sleutel `navPrijsmatrix` in alle vier `messages/*.json`.
- `BeheerShell.tsx`: haalt de grid op (nieuw hook/fetch naar `GET /api/prijsmatrix`, geen `useApiCollection` want geen `id`-based lijst), telt cellen zonder prijs voor de badge-count, rendert nieuwe `PrijsmatrixSection`.
- Nieuw component `src/components/beheer/PrijsmatrixSection.tsx`: grid met maten als rijen (gesorteerd op breedte/hoogte), materialen als kolommen (gegroepeerd op materiaalsoort, gesorteerd op dikte). Elke cel is een numeriek invoerveld dat **direct bij wijzigen** (on blur) een `PUT /api/prijsmatrix`-upsert doet — geen aparte "Opslaan"-knop. Logt `prijsmatrix_gewijzigd` per celwijziging.

### Kunstenaar-prijsopslag
- `KunstenaarsSection.tsx`: nieuw numeriek veld "Prijsopslag" naast het bestaande `prijsafspraken`-tekstveld, opgeslagen via dezelfde `PUT /api/kunstenaarAfspraken/{id}`-call (staff-only route, ongewijzigd qua auth). Omschrijving in de activiteitenlog-regel vermeldt de wijziging (zelfde patroon als bij `prijsafspraken`).

### `KunstwerkenSection.tsx` — prijzen-invoer wordt preview
De huidige bewerkbare materiaal×maat-prijstabel (regels 857-914 e.o.) verdwijnt voor kunstwerken met maten. In de plaats komt een **read-only** grid die per combinatie de berekende prijs toont (matrix + kunstenaar-opslag, via dezelfde Prijsmodule/endpoint als de storefront), met een korte hint dat prijzen via de Prijsmatrix-sectie en kunstenaar-opslag lopen. De `allePrijzenIngevuld`-validatie en de bijbehorende disabled-state op de opslaan-knop vervallen (er is niets meer handmatig in te vullen). Het maatloze pad (`prijsPerM2`-invoerveld) blijft ongewijzigd.

## 7. Activiteitenlog

Nieuw event-type in `ACTIVITEIT_TYPES` (`src/lib/logActiviteit.ts`): `prijsmatrix_gewijzigd`. Kunstenaar-opslagwijziging hergebruikt het bestaande `kunstenaar_gewijzigd`-type met een omschrijving die de opslagwijziging vermeldt (zelfde aanpak als bij `prijsafspraken`).

## 8. Rollout

- Alle drie de schema-wijzigingen (nieuwe tabel, nieuwe kolom, dropped kolom) worden eerst tegen de **staging**-database uitgevoerd, met expliciet akkoord vooraf per wijziging (destructieve `DROP COLUMN` in het bijzonder).
- De matrix start leeg. Elk bestaand kunstwerk met maten toont dus tijdelijk "prijs op aanvraag" totdat de matrix (grotendeels) is ingevuld — dit is een bewuste, geaccepteerde tijdelijke toestand, geen bug.
- Volgens de staande regel (zie CLAUDE.md) wordt dit eerst op staging geverifieerd — inclusief het vullen van (een deel van) de matrix — voordat een productie-deploy overwogen wordt.

## Open follow-up (niet nu bouwen)

- Prijsgroep-korting (`prijsgroepen.kortingspercentage`) meenemen in `berekenPrijs(...)` — de functiesignatuur/module is zo opgezet dat dit een extra stap in dezelfde functie kan worden, zonder de aanroeppunten (storefront-endpoint, beheer-preview, bestelheaders) te hoeven aanpassen.
