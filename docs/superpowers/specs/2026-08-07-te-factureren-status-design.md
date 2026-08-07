# Ontwerp: status "Te factureren" tussen "Verstuurd naar drukker" en "Betaald en afgerond"

**Datum:** 2026-08-07
**Status:** Klaar voor implementatie

## Aanleiding

Na het versturen naar de drukker moet er een tussenstatus komen: "Te factureren".
Pas daarna wordt een bestelling "Betaald en afgerond" (hernoemd vanuit het huidige
"Afgerond"). Facturatie zelf gebeurt buiten dit systeem (extern boekhoudpakket) —
dit ontwerp voegt alleen statusregistratie toe, geen facturatie-functionaliteit.

Beide nieuwe/hernoemde statussen moeten ook als quick-filter selecteerbaar zijn op
het Bestellingen-scherm, net als de bestaande statussen.

## Uitgangssituatie in de code

`Bestelling['status']` in [BestellingenSection.tsx:36](../../../src/components/beheer/BestellingenSection.tsx#L36)
is de compile-time bron van waarheid:

```ts
status: 'Te beoordelen' | 'Te versturen naar drukker' | 'Verstuurd naar drukker' | 'Afgerond' | 'Afgewezen';
```

`db/schema.sql` slaat `bestelheaders.status` en `bestelstatusHistorie.status` op als vrije
`VARCHAR(50)` zonder ENUM/CHECK-constraint — er is dus **geen schema-migratie nodig**.
Zowel `'Te factureren'` (14 tekens) als `'Betaald en afgerond'` (20 tekens) passen ruim.
De PATCH-handler in `src/app/api/bestelheaders/[id]/route.ts` valideert de status-waarde
niet — alle afdwinging van toegestane overgangen gebeurt in de client-side TypeScript/UI.

Er bestaat al een "Afronden"-mechanisme (drie-ref mutex in `BestellingenSection.tsx`,
gebruikt door `afrondenBestellingen.ts` en `DrukkerModal.tsx`) dat bestellingen van
`'Verstuurd naar drukker'` naar `'Afgerond'` zet, met een waarschuwing als er nog
"zendinggenoten" (andere bestellingen in dezelfde drukkerzending) nog niet zijn
afgerond. Dit mechanisme is expliciet als fragiel gedocumenteerd (4 reviewrondes nodig
geweest) en moet met zorg worden aangepast, niet herbouwd.

## Kernontwerp

### A. Nieuwe statusflow

```
Te beoordelen → Te versturen naar drukker → Verstuurd naar drukker → Te factureren → Betaald en afgerond
                                                      ↘ Afgewezen (vanuit Te beoordelen)
```

### B. Het bestaande "Afronden"-mechanisme wordt hergebruikt, niet gedupliceerd

De betekenis van "Afronden" was altijd "de drukkerfase is voorbij" — dat blijft zo. Het
mechanisme verandert alleen zijn **doel-status**: van `'Afgerond'` naar `'Te factureren'`.
Concreet:

- `afrondenBestellingen.ts`: PATCH-body en resultaat-mapping gaan naar `status: 'Te factureren'`.
- `DrukkerModal.tsx` — `afgerondCounts`, `alleAfgerond`-check, en de PATCH/state-update in
  `handleMarkeerZendingAlsAfgerond`: allemaal naar `'Te factureren'`. Dit is een **losstaand**,
  gedupliceerd code-pad naast `afrondenBestellingen.ts` (bestond al zo) — beide moeten in
  lockstep worden aangepast, anders lopen de twee onafhankelijke "afronden"-routes uit elkaar.
- `zendingGenoten.ts` regel 95 (`openstaandeZendingGenoten` filtert op
  `b.status === 'Verstuurd naar drukker'`) **blijft ongewijzigd** — de zendinggenoten-check
  identificeert nog steeds bestellingen die nog bij de drukkerfase horen, onafhankelijk van
  waar de completerende actie ze naartoe zet.
- De drie-ref mutex (`afrondBezigRef`/`afrondDialoogOpenRef`/`afrondUitSelectieRef`) en de
  volledige `startAfronden`/`voerAfrondingUit`-logica in `BestellingenSection.tsx` blijven
  functioneel ongewijzigd — alleen de doel-status die via `afrondenBestellingen.ts` wordt
  geschreven verandert.

Dit voorkomt dat er een tweede, parallelle mutex-constructie nodig is voor een nieuwe
overgang — de bestaande, goed geteste machinerie wordt gewoon één stap eerder ingezet dan
voorheen.

### C. Nieuwe, simpele actie: "Te factureren" → "Betaald en afgerond"

Deze overgang krijgt **geen** zendinggenoten-waarschuwing en **geen** deel van de
bestaande mutex — het is een kale status-PATCH, net als `handleGoedkeuren`/`handleAfwijzen`
in `BestellingModal.tsx` nu al zijn. Reden: er is geen drukkerzending-concept meer relevant
op dit punt in de flow; het is puur "boekhoudkundig afgerond melden".

- Nieuwe handler in `BestellingModal.tsx`, bijvoorbeeld `handleFactureren`, analoog aan
  `handleGoedkeuren`: PATCH naar `status: 'Betaald en afgerond'`, nieuwe activiteitenlog-code
  `bestelling_gefactureerd`, nieuwe knop-label.
- Nieuwe footer-actie-branch in `BestellingModal.tsx` voor `status === 'Te factureren'`.
- Op het Bestellingen-scherm (`BestellingenSection.tsx`) komt voor bestellingen met
  status `'Te factureren'` een equivalente bulk-actie beschikbaar zodra dat filter actief is,
  net zoals nu al kan voor `'Verstuurd naar drukker'` (zie sectie E) — zonder zendinggenoten-
  dialoog, gewoon een directe PATCH per geselecteerde bestelling.

### D. Terugzetten (undo)

Er bestaat al één "Terugzetten"-knop, nu onvoorwaardelijk van `'Afgerond'` naar
`'Verstuurd naar drukker'`. Die wordt twee knoppen, elk één stap terug:

- Vanuit `'Betaald en afgerond'` → terug naar `'Te factureren'` (nieuwe log-code
  `bestelling_facturering_teruggezet`, of hergebruik van de bestaande code met een
  aangepaste betekenis — zie Task-niveau in het plan).
- Vanuit `'Te factureren'` → terug naar `'Verstuurd naar drukker'` (dit is functioneel de
  huidige `handleTerugzetten`, alleen nu bereikt vanuit een andere bron-status).

`handleTerugzetten` wordt dus conditioneel op `bestelling.status` in plaats van een vaste
doel-status te PATCHen.

### E. Quick-filters op het Bestellingen-scherm

De quick-filter-opties-array in `BestellingenSection.tsx` (huidig: alleen
`'Te versturen naar drukker'`, `'Verstuurd naar drukker'`, en `''` voor "Alle") krijgt twee
nieuwe entries: `'Te factureren'` en `'Betaald en afgerond'`. Elk met een eigen
`bestellingenQuickTeFactureren`/`bestellingenQuickBetaaldEnAfgerond` vertaalsleutel en
`data-testid`, in dezelfde stijl als de bestaande twee.

`selectieActief` (regel 276-277: momenteel waar voor `'Te versturen naar drukker'` en
`'Verstuurd naar drukker'`) wordt uitgebreid met `'Te factureren'`, zodat er ook bij dat
filter een selectiebalk met bulk-actie verschijnt (zie C). `'Betaald en afgerond'` hoort
hier **niet** bij — dat is de eindstatus, geen bulk-actie nodig (terugzetten gebeurt per
bestelling via de modal, niet bulk).

De actieknop-ternary in de selectiebalk (regel ~317, momenteel "Afronden" vs "Versturen
naar drukker" op basis van `statusFilter === 'Verstuurd naar drukker'`) wordt uitgebreid
met een derde tak voor `statusFilter === 'Te factureren'` → de nieuwe "factureren
afronden"-bulkactie uit sectie C.

### F. Klantzijde (customer-facing status)

`KLANT_STATUS_MAP` in `klantBestellingStatus.ts` mapt 5 interne statussen naar 3
klant-zichtbare statussen (`inBehandeling`/`afgerond`/`afgewezen`). Voor de klant verandert
er niets aan wat ze zien:

- `Afgerond: 'afgerond'` wordt `'Betaald en afgerond': 'afgerond'`.
- Nieuwe entry: `'Te factureren': 'inBehandeling'`.

Facturatie is een backoffice-detail — de klant ziet gewoon "in behandeling" totdat de
bestelling echt (voor de klant) afgerond is. De klant-vertalingen in
`accountPage.orders.statusAfgerond`/`statusHelp` blijven ongewijzigd, want die zijn al
gekoppeld aan de 3-waardige `KlantBestellingStatus`, niet direct aan `Bestelling['status']`.

### G. Geen schema-migratie

Bevestigd: geen wijziging aan `db/schema.sql` nodig (zie Uitgangssituatie).

## Compiler-afgedwongen wijzigingen (moeten mee, anders build error)

- `STATUS_BADGE_CLASS` in `BestellingModal.tsx` — nieuwe entry `'Te factureren'`, key
  `Afgerond` hernoemen naar `'Betaald en afgerond'`.
- `KLANT_STATUS_MAP` in `klantBestellingStatus.ts` — zie F.
- Elke andere plek waar TypeScript een `Record<Bestelling['status'], ...>` of exhaustieve
  switch/ternary op de status-union gebruikt (implementers moeten hierop controleren via
  `tsc`/`next build` — de compiler wijst dit vanzelf aan).

## Niet compiler-afgedwongen, maar wel bij te werken

- `HISTORIE_LABEL_KEY` in `BestellingModal.tsx` (plain string-keyed — valt anders terug op
  de ruwe status-string, wat niet fout is maar inconsistent oogt).
- Alle letterlijke string-vergelijkingen (`b.status === 'Afgerond'`) in
  `afrondenBestellingen.ts` en `DrukkerModal.tsx` — zie B.

## Vertalingen (`messages/nl.json`, namespace `beheer`)

Bestaande sleutels die wijzigen of erbij komen (alleen `nl.json` heeft de `beheer`-namespace):

| Sleutel | Huidige waarde | Nieuwe/aangepaste waarde |
|---|---|---|
| `bestellingenHistorieAfgerond` | "Afgerond" | "Betaald en afgerond" |
| *nieuw* `bestellingenHistorieTeFactureren` | — | "Te factureren" |
| *nieuw* `bestellingenQuickTeFactureren` | — | "Te factureren" |
| *nieuw* `bestellingenQuickBetaaldEnAfgerond` | — | "Betaald en afgerond" |
| *nieuw* `bestellingenFactureren` | — | "Betaald en afgerond melden" |
| *nieuw* `bestellingenFactureringTerugzetten` | — | "Terugzetten naar te factureren" |

De bestaande `bestellingenTerugzetten` ("Terugzetten") blijft de generieke terugzet-knop
tekst voor de `'Te factureren'` → `'Verstuurd naar drukker'` overgang; voor de nieuwe
`'Betaald en afgerond'` → `'Te factureren'` terugzet-knop is een eigen label nodig
(`bestellingenFactureringTerugzetten`) zodat een medewerker in de UI kan onderscheiden welke
stap wordt teruggedraaid als beide knoppen ooit naast elkaar zichtbaar zouden zijn in
screenshots/documentatie (ze zijn in de praktijk nooit gelijktijdig zichtbaar, want ze horen
bij verschillende statussen — maar losse labels zijn goedkoper dan een dubbelzinnige knop).

`drukkersZendingAfgerondBadge`/`drukkersMarkeerZendingAlsAfgerond(Error)` in `DrukkerModal.tsx`
blijven qua tekst ongewijzigd (ze praten over "afgerond" in de zin van "drukkerfase klaar",
wat semantisch nog steeds klopt ook al is de onderliggende status nu `'Te factureren'`).

`accountPage.orders.statusAfgerond`/`statusHelp` (klantzijde) blijven ongewijzigd — zie F.

## Tests

Betrokken testbestanden (aantal treffers op `'Afgerond'`/`'Verstuurd naar drukker'` als
richtlijn voor omvang, geen uitputtende lijst — implementers lezen het bestand zelf):

- `tests/lib/afrondenBestellingen.test.ts` — doel-status naar `'Te factureren'`.
- `tests/lib/klantBestellingStatus.test.ts` — nieuwe/hernoemde map-entries.
- `tests/lib/zendingGenoten.test.ts` — zwaarste concentratie (10 treffers op
  `'Verstuurd naar drukker'`); controleren dat de filtervoorwaarde zelf ongewijzigd test
  gedrag blijft (zie B) — alleen fixtures die de *volgende* status simuleren hernoemen.
- `tests/components/beheer/BestellingModal.test.tsx` — nieuwe footer-actie-branch,
  aangepaste `handleTerugzetten`, hernoemde badge-class.
- `tests/components/beheer/BestellingenSection.test.tsx` — nieuwe quick-filters,
  nieuwe bulk-actie voor `'Te factureren'`.
- `tests/components/beheer/DrukkerModal.test.tsx` — hernoemde doel-status in
  `afgerondCounts`/`handleMarkeerZendingAlsAfgerond`.
- `tests/components/beheer/AfrondenBevestigingDialog.test.tsx` — controleren of hier een
  letterlijke statusnaam in fixtures staat.
- `tests/components/beheer/BeheerShell.test.tsx` — regressietest die door de echte
  laad-mapping rendert (zie Errors and fixes in de sessie-historie: eerder is hier een
  Critical bug gemist die alleen deze test ving) — controleren of nieuwe/hernoemde statussen
  hier correct doorkomen.
- `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx` — controleren op
  aanwezigheid van statusnamen in fixtures (waarschijnlijk alleen `'Verstuurd naar drukker'`,
  ongewijzigd).
- `tests/app/api/bestelheaders.test.ts` en `tests/regression/staging-scenarios.test.ts` —
  controleren op letterlijke `'Afgerond'`-strings in fixtures/assertions; de API-route zelf
  valideert status niet, dus hier zijn waarschijnlijk alleen test-fixtures te hernoemen.

Voor élk van deze bestanden geldt de projectregel: shared staging-database, dus test-cleanup
blijft exact scoped op wat de test zelf aanmaakt — geen wijziging aan die regel nodig, alleen
de statuswaarden die tests gebruiken.

## Wat dit ontwerp bewust niet doet

- Geen facturatie-functionaliteit (geen factuurnummer, geen PDF, geen boekhoudkoppeling) —
  expliciet buiten scope per de aanleiding ("Facturatie zelf vindt buiten het systeem plaats").
- Geen schema-migratie (zie G).
- Geen wijziging aan de zendinggenoten-filtervoorwaarde (zie B) — alleen de doel-status van
  de actie die op die check volgt.
- Geen wijziging aan wat de klant ziet (zie F) — puur een backoffice-tussenstap.
- Geen nieuwe mutex/dialoog-machinerie voor de `'Te factureren'` → `'Betaald en afgerond'`
  overgang (zie C) — bewust simpel gehouden, net als goedkeuren/afwijzen.
- Geen server-side validatie van toegestane status-overgangen toevoegen — dat bestond al
  niet en valt buiten de scope van deze feature.
