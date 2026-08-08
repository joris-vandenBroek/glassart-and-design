# Design: Bestellingen zichtbaar in Beheer en op de accountpagina

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 21-07-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

## Context

`bestelheaders`/`bestellines` bestaan sinds het vorige deelproject echt in Firestore (geschreven bij "Bestelling afronden"), maar zijn nergens zichtbaar: "Bestellingen" is nog een uitgeschakelde plaatshouder in `BeheerNav` (per `2026-07-21-beheer-datatabellen-design.md`), en "Mijn bestellingen" op `/account` toont nog steeds alleen mock-data (`useOrders`/`useAllOrders`), die sinds de vorige ronde niet meer aangevuld wordt omdat `CartPanel` niet langer naar de mock-lijst schrijft. Dit deelproject maakt beide kanten echt.

## Doel

Een medewerker kan in Beheer alle bestellingen zien, filteren/sorteren, en per bestelling goedkeuren of afwijzen. Een klant ziet zijn eigen echte bestellingen tussen zijn bestaande (mock) orderhistorie op `/account`.

## 1. Security rules (`firestore.rules`)

`bestelheaders` krijgt een `update`-rule voor medewerkers, exact naar het patroon van de bestaande `klanten`-rule (geen extra veldbeperking):

```
match /bestelheaders/{id} {
  allow create: if request.auth != null && request.auth.uid == request.resource.data.klantId
    && request.resource.data.status == 'Te beoordelen';
  allow read: if request.auth != null &&
    (request.auth.uid == resource.data.klantId ||
     exists(/databases/$(database)/documents/medewerkers/$(request.auth.uid)));
  allow update: if request.auth != null && exists(/databases/$(database)/documents/medewerkers/$(request.auth.uid));
  allow delete: if false;

  match /bestellines/{lineId} {
    ... (ongewijzigd)
  }
}
```

`bestellines` blijft ongewijzigd (`allow update, delete: if false`) — alleen de header-status wijzigt, niet de regels zelf.

## 2. Beheer — Bestellingen-sectie

**Nieuwe bestanden:** `src/components/beheer/BestellingenSection.tsx` (tabel) en `src/components/beheer/BestellingModal.tsx` (detail + acties), naar het exacte patroon van `KlantenSection.tsx`/`KlantModal.tsx`.

**`AdminBestelling`-type** (in `BestellingenSection.tsx`, zelfde stijl als `Klant` in `KlantenSection.tsx`):
```ts
export interface AdminBestelling {
  id: string;
  klantId: string;
  companyName: string;
  besteldatum: string;       // geformatteerd, bv. via toDate().toLocaleDateString('nl-NL')
  status: 'Te beoordelen' | 'Goedgekeurd' | 'Afgewezen';
  lineCount: number;
  totalQuantity: number;
}
```

**Ophalen in `BeheerShell.tsx`** (zelfde `useEffect`+`getDocs`-stijl als de bestaande klanten-fetch, niet via `useFirestoreCollection` omdat die geen geneste subcollecties ondersteunt): alle `bestelheaders` ophalen, per header ook zijn `bestellines`-subcollectie ophalen voor `lineCount`/`totalQuantity`, en `companyName` opzoeken in de al geladen `klanten`-state (op `klantId`; toon `klantId` zelf als er geen match is, bv. bij een verwijderd klantaccount).

**Kolommen:** Klant (`companyName`), Besteldatum, Aantal (render: `"{lineCount} regel(s), {totalQuantity} stuks"`), Status (`select`-filter met de 3 waarden, standaard "Te beoordelen").

**`BestellingModal`:** toont bedrijfsnaam, besteldatum, en de losse regels (elk met aantal; kunstwerk/maat/materiaal tonen als "Onbekend" — nieuwe vertaalsleutel — zolang die velden `null` zijn). Twee knoppen, zelfde stijl/gedrag als `KlantModal`'s Goedkeuren/Afwijzen: rechtstreekse `updateDoc(doc(db, 'bestelheaders', id), { status: '...' })`, geen verplicht invoerveld (in tegenstelling tot Klanten's prijsgroep-eis), foutmelding inline bij mislukken, bij succes bubbelt de update terug naar `BeheerShell` (optimistische lokale update, zelfde `onBestellingUpdated`-callback-vorm als `onKlantUpdated`).

**`BeheerNav`/`BeheerShell`:** `bestellingen` verhuist van `DISABLED_ITEMS` naar `ACTIVE_ITEMS`; teller = aantal met status "Te beoordelen", zelfde berekening als `klantenCount`.

**Nieuwe vertaalsleutels** (uitsluitend in `messages/nl.json`, bestaande `beheer`-namespace, net als de rest van Beheer): `navBestellingen` bestaat al (was al de disabled-label); nieuw: `bestellingenLoadError`, `bestellingenEmpty`, `bestellingenColKlant`, `bestellingenColDatum`, `bestellingenColAantal`, `bestellingenColStatus`, `bestellingenRegelOnbekend` ("Onbekend"), `bestellingenGoedkeuren`, `bestellingenAfwijzen`, `bestellingenActionError`.

## 3. Accountpagina — echte bestellingen in "Mijn bestellingen"

**`useAllOrders.tsx`** krijgt een derde bron naast `placed` (mock, blijft leeg) en `seeded` (mock): de eigen `bestelheaders` van de ingelogde klant.

- Nieuwe fetch (in `useAllOrders` zelf, via `useCustomerAuth().user?.uid` en een `useEffect`+`getDocs` met `where('klantId', '==', uid)`, plus per header de `bestellines`-subcollectie voor het regel-/stuksaantal — zelfde aanpak als in Beheer, maar nu gescopet op één klant).
- Omschrijving: nieuwe vertaalsleutel `accountPage.orders.lineSummary` (ICU, alle 4 talen), bv. NL: `"{lines, plural, one {# regel} other {# regels}}, {quantity} stuks"`.
- Status: header-status vertaald via 3 nieuwe sleutels (alle 4 talen): `accountPage.orders.statusTeBeoordelen`, `statusGoedgekeurd`, `statusAfgewezen`.
- `hasReturnRequest`: ongewijzigde berekening (`returnsByOrderId[order.id]`) — werkt toevallig ook voor echte Firestore-id's, geen aanpassing nodig.
- Volgorde: echte bestellingen eerst in de array (vóór `placed`/`seeded`), consistent met hoe `placed` nu al vóór `seeded` stond.

**`OrdersSection.tsx`** zelf verandert niet — hij rendert gewoon wat `useAllOrders` teruggeeft.

## Niet in scope

- Statussen na "Goedgekeurd" (in productie/verzonden/geleverd) — apart deelproject zodra dat proces is uitgedacht.
- Een echte koppeling tussen Retouren en echte bestellingen — Retouren blijft volledig mock/lokaal, ongeacht of het om een mock- of echte order-id gaat.
- Facturen — blijft mock-data, ongewijzigd.
- Prijsberekening/-weergave op bestellingen.
- Sortering van de gecombineerde orderlijst op datum — bestaande niet-gesorteerde volgorde (mock vóór seed) blijft het patroon; echte bestellingen worden er simpelweg vóór geplakt.

## Risico's / aandachtspunten

- N+1-fetches (elke header vraagt apart zijn regels op) — geaccepteerd op de huidige schaal, zelfde afweging als eerder bij Klanten/Materialen gemaakt.
- `useAllOrders` krijgt voor het eerst een eigen asynchrone Firestore-fetch (naast de synchrone mock-hooks die het al combineert) — `OrdersSection`/`ReturnsSection` moeten een korte laadperiode kunnen verdragen (lege lijst tot de fetch klaar is), geen aparte loading-UI vereist zolang dit niet zichtbaar hapert.
- Een bestelling van een klant die zijn account inmiddels heeft verwijderd (klantgoedkeuring staat dit toe) blijft gewoon bestaan in `bestelheaders`; in Beheer toont de rij dan `klantId` in plaats van een bedrijfsnaam.
