# Design: Bestelling afronden schrijft naar Firestore

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 21-07-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

## Context

Tot nu toe plaatst "Bestelling afronden" in `CartPanel.tsx` alleen een mock-bestelling (`useOrders`/localStorage), zichtbaar in "Mijn bestellingen" op `/account`. De klantgoedkeuring-spec (`2026-07-20-klantgoedkeuring-design.md`) had dit bewust buiten scope gehouden: "Echte koppeling van bestellingen ... aan het klantaccount ... blijven mock." Dit deelproject herroept dat expliciet: de klant wil dat een geplaatste bestelling nu een echt `bestelheaders`/`bestellines`-document in Firestore wordt.

Dat vereist een randvoorwaarde die er nog niet was: een betrouwbare, geverifieerde `klantId` bij het schrijven. Nergens in de site bestaat momenteel een blijvende, echte Firebase-sessie voor een klant — na registreren, inloggen en accountverwijdering wordt meteen `signOut(auth)` aangeroepen (`useMockAuth` hield alleen een lokale, niet-geverifieerde vlag bij). De Firestore security rules eisen overal `request.auth != null`. Dit deelproject introduceert daarom ook een echte, blijvende klantsessie (`useCustomerAuth`, naar het bestaande patroon van `useAdminAuth.tsx` voor medewerkers) en maakt "Bestelling afronden" afhankelijk van een ingelogde, goedgekeurde klant.

## Doel

Een ingelogde, goedgekeurde klant kan een bestelling afronden; dit schrijft een `bestelheaders`-document plus per mandje-regel een `bestellines`-subdocument naar Firestore. Een niet-ingelogde bezoeker kan het mandje nog gewoon vullen, maar moet inloggen om af te ronden.

## 1. `useCustomerAuth` — echte, blijvende klantsessie

Nieuw: `src/lib/useCustomerAuth.tsx`, naar het patroon van `src/lib/useAdminAuth.tsx`:

- `onAuthStateChanged(auth, ...)`: geen Firebase-user → `user: null`, `isCustomer: false`. Wel een Firebase-user → `klanten/{uid}` ophalen; `user: { uid, email }`, `isCustomer: status === 'Goedgekeurd'`.
- API: `{ user: { uid: string; email: string | null } | null, isCustomer: boolean, isHydrated: boolean, logout: () => Promise<void> }`. Geen `login`-methode op de hook zelf — het inlogproces (met zijn drie statusmeldingen) blijft in `CustomerLoginForm.tsx`, zie hieronder.
- `src/lib/useMockAuth.tsx` en `MockAuthProvider` vervallen. `src/app/[locale]/layout.tsx`: `CustomerAuthProvider` vervangt `MockAuthProvider`.

**Overstappende consumers:**
- `NavBar.tsx` — GD-icoon (link naar `/account`) tonen bij `isHydrated && isCustomer`, anders Inloggen/Word klant, zoals nu.
- `AccountDashboard.tsx` — toegangscontrole: `isHydrated && !isCustomer` → terug naar `/`.
- `AccountNav.tsx` — uitlog-knop roept `useCustomerAuth().logout()` aan.
- `SettingsSection.tsx` — accountverwijdering gebruikt `user?.email` (her-authenticatie) en `user?.uid` (welk `klanten`-document verwijderen); na succes `logout()`.
- `BecomeClientCta.tsx` — CTA verbergen bij `isHydrated && isCustomer`.
- `CustomerLoginForm.tsx` — bij status `'Goedgekeurd'`: geen `login(...)`-aanroep meer nodig (die bestond alleen voor de mock-vlag) en **geen** `signOut(auth)` meer — de sessie blijft nu juist bestaan; `useCustomerAuth`'s `onAuthStateChanged` pikt hem vanzelf op. Bij `'Beoordelen'`/`'Afgewezen'`/ontbrekend document: ongewijzigd, direct `signOut(auth)`.

## 2. Mandje-afronden vereist inloggen

In `CartPanel.tsx`: `useCustomerAuth()` toevoegen. Zolang `!isCustomer` (inclusief niet-ingelogd): de "Bestelling afronden"-knop wordt een link naar `/inloggen` in plaats van de plaats-bestelling-actie uit te voeren — het mandje zelf blijft ongewijzigd gevuld (localStorage), dus na inloggen kan de klant het mandje weer openen en gewoon afronden. Is er wel een geldige, goedgekeurde sessie: de knop werkt zoals nu, maar roept niet langer `useOrders().placeOrder(...)` aan — in plaats daarvan de Firestore-schrijfactie hieronder. "Bestelling leegmaken" blijft ongewijzigd (roept alleen `useCart().clear()` aan, ongeacht inlogstatus).

## 3. Firestore: `bestelheaders` + `bestellines` (subcollectie)

Bij bevestigen (in `CartPanel.tsx`, rechtstreekse client-side Firestore-call, zelfde patroon als de bestaande `klanten`-schrijfacties):

1. Nieuw document in `bestelheaders/{autoId}` (`addDoc`):
   - `klantId` — string, = `user.uid`
   - `besteldatum` — Firestore `serverTimestamp()`
   - `status` — `'Te beoordelen'`
2. Voor elke regel in het mandje een document in de subcollectie `bestelheaders/{id}/bestellines/{autoId}`:
   - `kunstwerkId`, `maatId`, `materiaalId` — `null` (de onderliggende tabellen bestaan nog niet; velden staan er al zodat een later deelproject ze alleen hoeft te vullen, geen schema-wijziging nodig)
   - `quantity` — getal, uit de mandje-regel
3. Na succesvol schrijven van header + alle regels: `useCart().clear()` en het paneel sluiten (zelfde eindgedrag als nu).
4. Bij een Firestore-fout (bv. netwerkfout): het mandje blijft ongewijzigd gevuld, het paneel blijft open, en er verschijnt een generieke foutmelding onder de knop (nieuwe vertaalsleutel `cart.placeOrderError`) — geen automatische retry.

## 4. Security rules (`firestore.rules`)

Analoog aan de bestaande `klanten`-rules — een klant mag alleen zijn eigen bestellingen aanmaken en lezen; medewerkers mogen alles lezen (voor de latere Bestellingen-sectie in Beheer); niemand kan nu iets wijzigen of verwijderen:

```
match /bestelheaders/{id} {
  allow create: if request.auth != null && request.auth.uid == request.resource.data.klantId
    && request.resource.data.status == 'Te beoordelen';
  allow read: if request.auth != null &&
    (request.auth.uid == resource.data.klantId ||
     exists(/databases/$(database)/documents/medewerkers/$(request.auth.uid)));
  allow update, delete: if false;

  match /bestellines/{lineId} {
    allow create: if request.auth != null &&
      request.auth.uid == get(/databases/$(database)/documents/bestelheaders/$(id)).data.klantId;
    allow read: if request.auth != null &&
      (request.auth.uid == get(/databases/$(database)/documents/bestelheaders/$(id)).data.klantId ||
       exists(/databases/$(database)/documents/medewerkers/$(request.auth.uid)));
    allow update, delete: if false;
  }
}
```

## Niet in scope

- De "Bestellingen"-sectie in Beheer (nog steeds een uitgeschakelde plaatshouder, per `2026-07-21-beheer-datatabellen-design.md`) — dit deelproject schrijft alleen data weg, toont ze nergens in de beheeromgeving.
- Kunstwerk-/maat-/materiaalbeheer — die tabellen bestaan nog niet; `kunstwerkId`/`maatId`/`materiaalId` blijven `null` tot een later deelproject ze vult.
- Wijzigen of verwijderen van een geplaatste bestelling (ook niet door een medewerker) — de security rules staan dit nu bewust nergens toe.
- Prijsberekening of koppeling aan prijsgroepen op de bestelling.
- De mock-bestelling (`useOrders`/"Mijn bestellingen" in `/account`) blijft bestaan als hook/pagina (ongewijzigd, nog steeds gevoed door de seed-data en `useAllOrders`), maar krijgt na deze wijziging geen nieuwe regels meer vanuit het mandje — bewuste keuze, geen migratie naar Firestore-data voor die pagina in dit deelproject.

## Risico's / aandachtspunten

- Dit herroept een expliciete "niet in scope"-beslissing uit de klantgoedkeuring-spec (mock bestellingen blijven mock) — bewust, op uitdrukkelijk verzoek van de klant deze ronde.
- Na deze wijziging plaatst een klant een bestelling zonder dat er ergens in Beheer iets te zien is (de Bestellingen-sectie is nog een plaatshouder) — de data staat er, maar is voorlopig alleen via de Firebase-console te controleren.
- `bestellines` als subcollectie betekent dat een medewerker die alle bestellingen wil zien met een *collection group query* over `bestellines` moet werken als hij ooit direct op regelniveau wil zoeken (niet nodig voor dit deelproject, wel relevant voor de latere Bestellingen-sectie).
- Bestaande tests die `useMockAuth`/`MockAuthProvider` gebruiken (o.a. `NavBar.test.tsx`, `AccountDashboard.test.tsx`, `SettingsSection.test.tsx`, `BecomeClientCta.test.tsx`) moeten omgezet worden naar `useCustomerAuth`/`CustomerAuthProvider`, met dezelfde Firebase-mockstrategie die al voor `useAdminAuth`-consumers is opgezet (zie de eerdere fix "mock @/lib/firebase in AccountDashboard tests").
