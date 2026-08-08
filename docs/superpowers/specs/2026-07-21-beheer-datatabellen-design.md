# Design: Beheer — navigatiemenu met datatabellen

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 21-07-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **HET FRAMEWORK STAAT ER; DE FACTUREN-SECTIE NIET.** Wat dit ontwerp introduceerde — `DataTable`, `Modal`, `BeheerNav`, `BeheerShell` — bestaat nog en draagt de hele beheeromgeving. Twee dingen kloppen niet meer (gecontroleerd 2026-08-08):
>
> - **De Facturen-sectie is verwijderd.** `FacturenSection`, `FactuurModal` en `mockAdminInvoices` zijn weg (commit `20d8269`, "on hold for now"). Er is geen facturatie in de beheeromgeving; alleen de bestelstatussen "Te factureren" en "Betaald en afgerond" bestaan.
> - **De zeven uitgeschakelde plaatshouders zijn allemaal gebouwd.** `DISABLED_ITEMS` in `BeheerNav.tsx` is nu leeg. Het menu telt zestien actieve secties, waaronder Bestellingen, Prijsgroepen, Maten, Materialen, Kunstwerken en Glassart & Design — plus later toegevoegde secties (Kunstenaars, Prijsmatrix, Drukkers, Stijlen, Onderwerpen, Activiteit). Retouren is als enige nooit gebouwd.
>
> Verder heet `KlantAanvragenSection` inderdaad `KlantenSection` geworden zoals hier ontworpen, maar de datatoegang loopt niet meer via `getDocs(collection(db, 'klanten'))` — dat is `/api/klanten` geworden.

## Context

`/beheer` bestaat nu uit een kale login-shell met daaronder rechtstreeks de klantaanvragen als kaarten (`KlantAanvragenSection.tsx`). Dit deelproject vervangt dat door een echte beheeromgeving: een linkermenu met tellers (naar het voorbeeld van de bestaande klant-accountpagina, `AccountNav.tsx`/`AccountDashboard.tsx`), waarachter elke sectie een sorteerbare, filterbare datatabel toont. Een rijklik opent een modal met details en (waar van toepassing) acties.

Scope van dit deelproject: het **framework** (menu, generieke tabel, generieke modal) plus twee werkende secties — **Klanten** (bestaande, echte Firestore-data, nu uitgebreid van alleen-openstaand naar alle klanten met filter) en **Facturen** (nieuwe, mockup-data — er is nog geen facturatie-backend). Zeven overige menu-items (Bestellingen, Retouren, Prijsgroepen, Maten, Materialen, Kunstwerken, Glassart and Design) worden alvast zichtbaar maar uitgeschakeld, als plaatshouder voor latere deelprojecten.

## Architectuur — nieuwe bouwstenen

- **`src/components/DataTable.tsx`** — generieke, herbruikbare tabel. Bewust buiten `beheer/` geplaatst zodat hij later ook op de klant-accountpagina hergebruikt kan worden (de klant wil dit zelf, "wellicht kun je delen hergebruiken" — dit kost nu niets extra, want het component kent geen Beheer-specifieke logica).
- **`src/components/Modal.tsx`** — generieke modal-shell (overlay, sluitknop, Escape-toets, focus-trap), gebouwd op de bestaande `useOverlayDismiss`-hook (dezelfde die `ProductModal`/`CartPanel` al gebruiken) — zelfde visuele taal, geen nieuw patroon.
- **`src/components/beheer/BeheerNav.tsx`** — linkermenu met tellers, naar het voorbeeld van `AccountNav.tsx`.
- **`src/components/beheer/BeheerShell.tsx`** — beheert welke sectie actief is, rendert `BeheerNav` + de actieve sectie, naar het voorbeeld van `AccountDashboard.tsx`. Haalt de klanten-lijst één keer op (gedeeld tussen teller en Klanten-tabel).
- **`src/components/beheer/AdminDashboard.tsx`** (bestaand) blijft de inlog-poort (ongewijzigde auth-gate-logica); rendert straks `BeheerShell` in plaats van de huidige "Ingelogd als …"-tekst + losse `KlantAanvragenSection`.

## BeheerNav — menu en tellers

- Actieve items: **Klanten** (teller = aantal klanten met status "Beoordelen") en **Facturen** (teller = aantal met status "Te betalen"). Beide tellers berekend uit dezelfde data die de sectie zelf toont — geen aparte tel-query.
- Uitgeschakelde plaatshouders (zichtbaar, niet klikbaar, geen teller): **Bestellingen**, **Retouren**, **Prijsgroepen**, **Maten**, **Materialen**, **Kunstwerken**, **Glassart and Design**. Elk wordt pas echt gebouwd in een eigen, later deelproject.
- Klikken op een actief item highlight 'm en toont de bijbehorende tabel rechts.
- **Uitloggen**-knop onderaan het menu (verplaatst uit de huidige plek), net als bij `AccountNav`. De "Ingelogd als …"-regel blijft daarboven staan.

## Generieke DataTable

- Kolomdefinitie per sectie: `key`, `label` (vertaalde headertekst), `filterType` (`'text'` = vrij zoekveld met deelstring-match, of `'select'` = dropdown met vaste waarden), `sortable` (standaard aan).
- Klik op een kolomkop sorteert cyclisch: **ongesorteerd → oplopend → aflopend → ongesorteerd**. Sorteren gebeurt op de onderliggende waarde (bedragen dus als getal, niet als opgemaakte string — zie Facturen hieronder).
- Per kolom een filterveld boven de tabel. Een `defaultFilters`-prop zet een kolom bij het openen op een startwaarde (bv. status op "Beoordelen"). Dit *is* het mechanisme voor "toon ook alles": filter wissen/wijzigen toont andere/alle rijen — er komt geen apart "toon alles"-knopje.
- Rijklik roept een `onRowClick(row)`-callback aan; de sectie beslist zelf wat er dan gebeurt (in beide gevallen: een modal openen).

## Klanten-sectie

- `KlantAanvragenSection.tsx` vervalt; wordt `KlantenSection.tsx` (tabel) + `KlantModal.tsx` (modalinhoud).
- Haalt nu **alle** klanten op via `getDocs(collection(db, 'klanten'))` (niet meer met een `where`-filter op status) — de data wordt zowel voor de teller als de tabel gebruikt.
- Kolommen: Bedrijfsnaam, KvK-nummer, Contactpersoon, E-mailadres, Telefoonnummer, Status. Status is een `'select'`-filter met de 3 bekende waarden (Beoordelen/Goedgekeurd/Afgewezen), standaard op "Beoordelen"; de overige kolommen zijn `'text'`-filters.
- Rijklik → `KlantModal` toont alle klantgegevens (incl. adres, contactvoorkeur) én — ongewijzigd qua gedrag t.o.v. nu — het Prijsgroep-tekstveld met Goedkeuren-knop (uitgeschakeld tot ingevuld) en de Afwijzen-knop. Bij een actie sluit de modal en wordt de rij in de tabel bijgewerkt (niet meer verwijderd uit de lijst, want de tabel toont nu ook afgehandelde klanten als de status-filter dat toelaat).

## Facturen-sectie (mockup-data)

- Nieuw bestand `src/data/mockAdminInvoices.ts`: een admin-brede lijst (facturen van meerdere klanten, dus mét bedrijfsnaam per regel — anders dan de bestaande klant-eigen `src/data/mockInvoices.ts`, die geen bedrijfsnaam nodig heeft omdat hij al gescopet is op één klant).
- Velden: `invoiceNumber` (string), `date` (ISO-string, sorteerbaar als tekst omdat ISO-datums lexicografisch al chronologisch sorteren), `companyName` (string), `amount` (**getal**, in euro's — bv. `645.00` — zodat de bedrag-kolom numeriek sorteert; weergave via `toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })`), `status` (`'Te betalen' | 'Betaald'`).
- Kolommen: Factuurnummer, Factuurdatum, Bedrijfsnaam, Factuurbedrag, Status. Status is `'select'`, standaard op "Te betalen"; overige `'text'`.
- Rijklik → modal met factuurdetails, **alleen-lezen** — geen acties (er is nog geen echte facturatie-backend).

## Vertalingen

Nieuwe sleutels alleen in `messages/nl.json`, in de bestaande (Nederlands-only) `beheer`-namespace: menu-labels (incl. de 7 uitgeschakelde items), kolomkoppen voor beide tabellen, filter-/sorteerlabels, modal-teksten. Geen wijzigingen aan `en.json`/`de.json`/`fr.json`.

## Niet in scope

- De daadwerkelijke inhoud van Bestellingen, Retouren, Prijsgroepen, Maten, Materialen, Kunstwerken en "Glassart and Design" — alleen uitgeschakelde menu-plaatshouders in dit deelproject.
- Een echte facturatie-backend (Firestore-collectie voor facturen) — Facturen blijft mockup-data.
- Hergebruik van `DataTable`/`Modal` op de klant-accountpagina zelf — het component wordt er wel geschikt voor gebouwd, maar de accountpagina zelf wordt in dit deelproject niet aangepast.
- Bulk-acties (rijen aanvinken) — de kolomfilters zijn het enige selectiemechanisme.

## Risico's / aandachtspunten

- Door alle klanten (i.p.v. alleen "Beoordelen") op te halen, groeit de hoeveelheid data die in één keer wordt opgehaald naarmate het klantenbestand groeit. Voor de huidige schaal van dit bedrijf is dat geen probleem; bij veel klanten zou paginering nodig worden — niet nu gebouwd (YAGNI).
- `DataTable` moet generiek genoeg zijn voor zowel Klanten (Firestore-data, acties in de modal) als Facturen (mockup-data, alleen-lezen modal) zonder dat het component zelf iets hoeft te weten over Firestore of specifieke acties — die blijven in de sectie-componenten.
