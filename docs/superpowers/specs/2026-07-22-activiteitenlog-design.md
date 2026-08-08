# Design: Activiteitenlog (Firestore-logging + Beheer-overzicht)

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 22-07-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

## Context

Er is nu geen enkele vorm van activiteitenlogging op de site. De klant wil per opgesomde actie weten *wie* het deed (klantnaam + e-mail, of "Onbekend" bij een niet-ingelogde bezoeker) en *wanneer*, terugvindbaar in een nieuw overzicht in Beheer — niet alleen ruwe data in de Firebase-console.

Dit deelproject bouwt: één nieuwe Firestore-collectie `activiteiten`, zeven schrijfpunten door de site heen, de bijbehorende security rules, en een nieuwe **Activiteit**-sectie in `/beheer` (zelfde `DataTable`-patroon als Klanten/Facturen, zie `docs/superpowers/specs/2026-07-21-beheer-datatabellen-design.md`).

Google Analytics (voor algeheel anoniem bezoekersaantal) is expliciet **buiten scope** — zie "Niet in scope".

## Datamodel

Eén document per activiteit in de collectie `activiteiten`:

```
type: string            // vast enum, zie tabel hieronder
actorId: string | null  // uid, of null bij een niet-ingelogde bezoeker
actorEmail: string      // e-mailadres, of "Onbekend"
actorNaam: string       // bedrijfsnaam/contactpersoon, of "Onbekend"
timestamp: serverTimestamp()
```

Bewuste keuze: **geen** extra actie-specifieke velden (bv. welk kunstwerk, welk bestelnummer) — alleen type + wie + wanneer, zoals gevraagd. Dit houdt het schema en de rules eenvoudig.

### Identiteitsresolutie (geen extra Firestore-reads per event)

- **Klant** (`kunstwerk_bekeken`, `mandje_toegevoegd`, `bestelling_geplaatst`, `account_bezocht`): `useCustomerAuth` haalt nu al eenmalig `klanten/{uid}` op voor de goedkeuringsstatus. Dat lees-moment breiden we uit met `companyName`/`contactPerson`, zodat naam/e-mail al in de hook-state klaarstaan zonder extra lees-actie per gelogde gebeurtenis.
- **Medewerker** (`beheer_bezocht`): geen naamveld in `medewerkers`; `actorNaam` wordt hetzelfde als `actorEmail` (uit Firebase Auth, via `useAdminAuth`).
- **Anoniem**: `actorId = null`, `actorEmail = "Onbekend"`, `actorNaam = "Onbekend"`.
- **`word_klant_aanvraag`**: uitzondering — hier gebruiken we niet "Onbekend" maar de bedrijfsnaam die net in het formulier is ingevuld (er bestaat op dat moment al een net aangemaakt Firebase Auth-account + `klanten/{uid}`-document, vóór de `signOut()`).

### Gedeelde schrijf-helper

Nieuw bestand `src/lib/logActiviteit.ts`: één functie `logActiviteit(type, actor)` die een document toevoegt aan `activiteiten`. Fire-and-forget, net als de bevestigingsmail (`CartPanel.sendConfirmationEmail`) — een mislukte log mag nooit de eigenlijke actie (kunstwerk bekijken, mandje vullen, bestellen) blokkeren of een zichtbare fout tonen. Dit centraliseert de schrijflogica zodat de 7 aanroeppunten simpel blijven.

## De 7 events

| `type` | Wanneer wordt gelogd | Wie wordt gelogd |
|---|---|---|
| `kunstwerk_bekeken` | Klant klikt op een kunstwerk (modal gaat open) — `ProductsGrid.tsx`, in de bestaande click-/toetsenbord-handler die `setSelectedKunstwerk` aanroept | **Alleen ingelogde klanten** — anonieme kliks worden bewust overgeslagen (zie "Niet in scope" voor de reden) |
| `mandje_toegevoegd` | Item toegevoegd aan mandje — `ProductModal.tsx`, in `handleConfirm()`, direct na de bestaande `addItem(...)`-aanroep | Iedereen, inclusief "Onbekend" |
| `bestelling_geplaatst` | Bestelling afgerond — `CartPanel.tsx`, in `handlePlaceOrder()`, ná een geslaagde `addDoc` van het bestelheader (dus alleen bij een echt geplaatste bestelling, niet bij een mislukte poging) | Altijd ingelogd (kan niet anoniem — bestaande `if (!user) return`-guard) |
| `account_bezocht` | Navigatie naar `/account` — `AccountDashboard.tsx`, in een `useEffect` zodra `isHydrated && isCustomer` beide waar zijn | Altijd ingelogd (niet bij de korte flits vóór de redirect naar home voor een niet-ingelogde bezoeker) |
| `beheer_bezocht` | Navigatie naar `/beheer` — `AdminDashboard.tsx`, in een `useEffect` zodra de medewerker succesvol is ingelogd (`user` gezet, niet `isUnauthorized`) | Altijd ingelogde medewerker (niet bij het inlogscherm zelf — daar is geen zinvolle "wie" om te loggen) |
| `word_klant_bezocht` | Navigatie naar `/word-klant` — `RegistrationForm.tsx`, in een `useEffect` met lege dependency-array (vuurt eenmalig bij het laden van de pagina) | Meestal "Onbekend" (de pagina is per definitie bedoeld voor niet-klanten) |
| `word_klant_aanvraag` | Klik op "Aanvraag versturen" — `RegistrationForm.tsx`, direct in `handleSubmit`, ná een geslaagde `setDoc` naar `klanten/{uid}` (dus niet bij een mislukte poging, en vóór de daaropvolgende `signOut()`) | Bedrijfsnaam net ingevuld in het formulier (zie "Identiteitsresolutie" hierboven) |

Elk aanroeppunt is een fire-and-forget-aanroep van `logActiviteit(...)`; geen van de 7 plekken wacht op het resultaat of toont een foutmelding bij het mislukken van de log-write zelf.

## Security rules (`firestore.rules`)

```
match /activiteiten/{id} {
  allow create: if request.resource.data.type in
      ['kunstwerk_bekeken','mandje_toegevoegd','bestelling_geplaatst',
       'account_bezocht','beheer_bezocht','word_klant_bezocht','word_klant_aanvraag']
    && request.resource.data.keys().hasOnly(['type','actorId','actorEmail','actorNaam','timestamp'])
    && request.resource.data.actorEmail is string
    && request.resource.data.actorNaam is string;
  allow read: if request.auth != null &&
    exists(/databases/$(database)/documents/medewerkers/$(request.auth.uid));
  allow update, delete: if false;
}
```

`create` staat bewust open voor niet-ingelogde bezoekers (net als de publieke `read`-rule op `kunstwerken`/`materialen`), want `mandje_toegevoegd` en `word_klant_bezocht` moeten ook anoniem kunnen schrijven. Lezen kan alleen door medewerkers (`exists(medewerkers/...)`), zelfde patroon als Klanten/Facturen. Geen update/delete — dit is een append-only log.

## Beheer — "Activiteit"-scherm

- Nieuw menu-item **Activiteit** in `BeheerNav.tsx`, naast de bestaande actieve items (Klanten, Facturen) — geen aparte rechten nodig, elke medewerker die al bij Beheer mag ziet dit ook.
- Nieuwe `src/components/beheer/ActiviteitSection.tsx`, gebouwd op de bestaande generieke `DataTable`. Kolommen: **Tijdstip**, **Type** (vertaald label, bv. "Kunstwerk bekeken"), **Klant** (naam), **E-mail**. Standaard gesorteerd op tijdstip, nieuwste eerst.
- Filter: globale zoekbalk (zoekt op naam/e-mail/type-label, bestaand `DataTable`-patroon). **Afwijking van het oorspronkelijke ontwerp:** de "quick-filter-links per type" uit de eerste versie van deze sectie zijn tijdens de implementatie niet gebouwd — zie "Niet in scope".
- **Query-limiet:** in tegenstelling tot Klanten/Facturen (die de hele collectie ophalen) kan `activiteiten` onbegrensd blijven groeien. De sectie haalt daarom alleen de **meest recente 500** documenten op (`orderBy('timestamp', 'desc'), limit(500)`), niet de volledige collectie. Oudere activiteiten blijven gewoon in Firestore staan, maar zijn zonder verdere uitbreiding (paginering/datumfilter) niet zichtbaar in dit scherm — expliciet uitgesteld, zie "Niet in scope".

## Vertalingen

Nieuwe sleutels alleen in `messages/nl.json`, in de bestaande (Nederlands-only) `beheer`-namespace: het menu-label "Activiteit", de kolomkoppen, en de 7 vertaalde type-labels voor gebruik in zowel de tabel als de quick-filter-links.

## Niet in scope

- **Google Analytics.** Expliciet besproken en bewust uitgesteld: GA is geschikt voor geaggregeerde, anonieme bezoekersstatistieken, maar niet voor een doorzoekbaar "wie deed wat"-overzicht gekoppeld aan de eigen klantgegevens (dat vereist user-ID-koppeling + de GA Reporting API, met vertraging, in plaats van een live Firestore-query). Kan op elk moment los toegevoegd worden zonder dit ontwerp te raken.
- **Anonieme `kunstwerk_bekeken`-tellingen.** Bewust beperkt tot ingelogde klanten, na afweging met de klant: zonder deze beperking zou elke bladerende bezoeker (ingelogd of niet) een schrijfactie genereren, wat kosten/volume oplevert zonder dat de "wie"-vraag daar iets aan toevoegt voor anonieme bezoekers.
- **Paginering/datumfilter voorbij de meest recente 500 activiteiten** — YAGNI voor de huidige schaal; kan later toegevoegd worden als 500 niet meer voldoet.
- **Actie-specifieke detailvelden** (welk kunstwerk, welk bestelnummer, etc.) — bewust weggelaten, alleen type + wie + wanneer.
- **Bulk-acties of export** vanuit het Activiteit-scherm.
- **Quick-filter-links per type.** De bestaande `DataTable`-component ondersteunt alleen een simpele aan/uit-toggle (`StatusQuickFilter`: één actieve waarde vs. "alle"), zoals gebruikt bij Klanten/Facturen — geen meervoudige per-waarde selector voor de 7 activiteit-types. Zo'n uitbreiding zou de gedeelde `DataTable` moeten aanpassen (en daarmee ook Klanten/Facturen/Bestellingen raken, die 'm al gebruiken). Bewust uitgesteld: het vertaalde type-label staat wél als gewone kolomwaarde in elke rij, dus de bestaande globale zoekbalk vindt een activiteit al door het Nederlandse type (bv. "Kunstwerk bekeken") te typen — functioneel gedekt, alleen niet als losse klikbare chips. Besproken en akkoord bevonden (2026-07-22) tijdens de eindreview van de implementatie.

## Risico's / aandachtspunten

- `mandje_toegevoegd` en `word_klant_bezocht` schrijven ook voor volledig anonieme bezoekers — de open `create`-rule betekent dat in theorie iedereen (ook buiten de site om, met het publieke Firebase-config) willekeurige documenten met een geldig `type` kan schrijven. Dit is dezelfde afweging als de bestaande publieke `kunstwerken`/`materialen`-rules: geen App Check of rate-limiting in deze scope, consistent met de rest van de site.
- De `useCustomerAuth`-uitbreiding (companyName/contactPerson meenemen in de bestaande klant-lookup) raakt een hook die op meerdere plekken gebruikt wordt (`CartPanel`, `AccountDashboard`, `ReturnsSection`, etc.) — moet een puur additieve wijziging zijn (nieuwe velden op de bestaande `user`-vorm), geen breaking change aan de bestaande interface.
