# Design: Klantgoedkeuring

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 20-07-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

## Context

Het roadmap-document (`2026-07-18-b2b-portaal-beheeromgeving-roadmap.md`) beschrijft klantgoedkeuring als: nieuwe klantaanvragen beoordelen (goedkeuren/afwijzen, koppelen aan een prijsgroep), zodat een klant pas na goedkeuring toegang krijgt. Dit deelproject bouwt dat voor het eerst echt (niet mock), voortbouwend op het Firebase-fundament uit `2026-07-20-beheer-authenticatie-design.md`.

Bewuste scope-afbakening: dit deelproject omvat het **hele klantgoedkeuringstraject** (aanvraag → beoordelen → inloggen → account verwijderen), maar **niet** de rest van "klantaccount van mock naar echt" — bestellingen, facturen, retouren en gesprekgeschiedenis in `/account` blijven ongewijzigd mock/localStorage-gebaseerd. Alleen de inlog-poort en het onderliggende klantaccount (Firebase Auth + Firestore) worden echt.

## Registratieformulier (Word klant)

- De Particulier/Zakelijk-toggle en het kopje "Zakelijk" vervallen. Bedrijfsnaam, KvK-nummer en Contactpersoon worden vaste, altijd-zichtbare velden (niet meer voorwaardelijk).
- Bij "Aanvraag versturen":
  1. `createUserWithEmailAndPassword(auth, email, password)` — maakt een echt Firebase Auth-account. Firebase slaat het wachtwoord veilig op; de applicatie ziet of bewaart het nooit zelf.
  2. Bij succes: een Firestore-document aanmaken in collectie `klanten`, document-ID = de nieuwe UID (zie datamodel hieronder), met `status: "Beoordelen"`.
  3. Direct daarna: `signOut(auth)` — er is nog geen echte, doorlopende klant-sessie in de rest van de site (die blijft mock tot de klant expliciet via `/inloggen` binnenkomt), dus een blijvende live Firebase-sessie na registratie zou een verweesde, nergens-op-aangesloten toestand zijn.
  4. Bij succes: bestaand bevestigingsscherm ("Aanvraag ontvangen") tonen, ongewijzigd.
  5. Foutafhandeling: `auth/email-already-in-use` → "Dit e-mailadres is al geregistreerd."; `auth/weak-password` → "Wachtwoord moet minimaal 6 tekens bevatten."; overige fouten → generieke melding. Formulier blijft ingevuld staan.
- Vertaalsleutels `typeParticulier`/`typeZakelijk` vervallen (in alle 4 talen); nieuwe foutmeldingssleutels toegevoegd.

## Firestore: collectie `klanten` + Security Rules

Eén document per klant, ID = Firebase Auth UID:

- `companyName`, `kvk`, `contactPerson` — string
- `email`, `phone` — string
- `contactPreference` — `'email' | 'phone' | 'whatsapp'`
- `address`, `postcode`, `city` — string
- `deliveryAddress`, `deliveryPostcode`, `deliveryCity` — string, optioneel (alleen bij afwijkend afleveradres)
- `invoiceAddress`, `invoicePostcode`, `invoiceCity` — string, optioneel (alleen bij afwijkend factuuradres)
- `status` — `'Beoordelen' | 'Goedgekeurd' | 'Afgewezen'`, start op `'Beoordelen'`
- `prijsgroep` — string, leeg tot goedkeuring; vrij tekstveld (er bestaat nog geen prijsgroepenbeheer — dat volgt in het latere catalogus-/prijzen-deelproject)
- `createdAt` — Firestore `serverTimestamp()`

Security Rules (uitbreiding van `firestore.rules`):

```
match /klanten/{uid} {
  allow create: if request.auth != null && request.auth.uid == uid &&
    request.resource.data.status == 'Beoordelen' &&
    request.resource.data.prijsgroep == '';
  allow read: if request.auth != null &&
    (request.auth.uid == uid || exists(/databases/$(database)/documents/medewerkers/$(request.auth.uid)));
  allow update: if request.auth != null && exists(/databases/$(database)/documents/medewerkers/$(request.auth.uid));
  allow delete: if request.auth != null && request.auth.uid == uid;
}
```

Een klant mag alleen zijn eigen document aanmaken, lezen (voor de statuscheck bij inloggen) en verwijderen (zie "Account verwijderen"). Alleen medewerkers mogen documenten lezen (voor het overzicht in Beheer) en bijwerken (goedkeuren/afwijzen). Niemand kan een ander klantdocument verwijderen.

## Klant-login (nieuwe route `/inloggen`)

- Nieuwe route `src/app/[locale]/inloggen/page.tsx`, in alle 4 talen (net als `/word-klant` — dit is klantgericht, in tegenstelling tot het Nederlands-only interne `/beheer`).
- De "Inloggen"-knop in `NavBar.tsx` wordt een `Link` naar `/inloggen` (de huidige instant-mock-login vervalt volledig).
- Loginformulier (e-mail + wachtwoord), zelfde opzet als `AdminLoginForm`.
- Bij versturen:
  1. `signInWithEmailAndPassword` — bij fout: generieke melding "E-mailadres of wachtwoord onjuist."
  2. Bij succes: eigen `klanten/{uid}`-document ophalen.
     - `status === 'Beoordelen'` → "Uw aanvraag wordt nog beoordeeld.", geen toegang.
     - `status === 'Afgewezen'` → "Uw aanvraag is helaas afgewezen.", geen toegang.
     - `status === 'Goedgekeurd'` → toegang: `useMockAuth().login(email, uid)` aanroepen (zie hieronder), doorsturen naar `/account`.
  3. In alle gevallen na de statuscheck (toegang of niet): `signOut(auth)` — de echte Firebase-sessie is alleen de poort, geen blijvende sessie.
- `useMockAuth` wordt uitgebreid: naast de bestaande boolean (`isLoggedIn`, lokaal opgeslagen) ook `email` en `uid` van de echte, goedgekeurde klant onthouden (nog steeds puur lokaal/localStorage, geen nieuwe architectuur) — alleen zodat "Account verwijderen" in Instellingen weet wie opnieuw moet inloggen. `logout()` wist ook deze twee velden.

## Account verwijderen (in Instellingen, `/account`)

- Nieuwe subsectie onderaan `SettingsSection.tsx`: wachtwoordveld + knop "Definitief verwijderen".
- Bij bevestigen:
  1. `signInWithEmailAndPassword(auth, email, ingevoerd wachtwoord)` met de `email` uit `useMockAuth` — dit is zowel de her-authenticatie (klopt het wachtwoord?) als het herstellen van een korte, geldige sessie (nodig om het eigen account te mogen verwijderen).
  2. Bij succes: `deleteDoc(doc(db, 'klanten', uid))`, dan `deleteUser(auth.currentUser)`.
  3. Daarna: `useMockAuth().logout()`, doorsturen naar de homepage.
  4. Bij verkeerd wachtwoord: generieke foutmelding, niets verwijderd.

## Beheer: klantaanvragen beoordelen

- Nieuwe sectie in `AdminDashboard.tsx`, direct onder "Ingelogd als ...": een lijst van klanten met `status === 'Beoordelen'`, eenmalig opgehaald bij het tonen van het dashboard (`getDocs` met een `where('status', '==', 'Beoordelen')`-query — geen live listener nodig voor een eerste versie).
- Per klant: alle ingevulde gegevens (bedrijfsnaam, KvK, contactpersoon, e-mail, telefoon, adres, contactvoorkeur), een tekstveld voor **Prijsgroep** (verplicht vóór goedkeuren) en twee knoppen: **Goedkeuren** en **Afwijzen**.
  - Goedkeuren: `updateDoc(..., { status: 'Goedgekeurd', prijsgroep })`.
  - Afwijzen: `updateDoc(..., { status: 'Afgewezen' })`.
  - Na een actie: die klant verdwijnt direct (optimistisch) uit de lijst — geen aparte geschiedenisweergave van al afgehandelde aanvragen in deze eerste versie.
- Geen linkermenu/sectienavigatie geïntroduceerd — dit is de eerste beheerfunctie na de kale login-shell; een navigatiestructuur (zoals bij de klant-accountpagina) volgt zodra er een tweede beheerfunctie bijkomt.
- Nieuwe vertaalsleutels in de bestaande (Nederlands-only) `beheer`-namespace.

## Niet in scope

- Echte koppeling van bestellingen/facturen/retouren/gesprekgeschiedenis aan het klantaccount — die blijven mock in `/account`, zoals nu.
- Een daadwerkelijk prijsgroepenbeheer (aanmaken/wijzigen van prijsgroepen) — `prijsgroep` is nu een vrij tekstveld, geen gekoppelde tabel.
- Geschiedenis van afgehandelde (goedgekeurde/afgewezen) aanvragen in Beheer.
- Wachtwoord-vergeten voor klanten — kan later op dezelfde manier als bij Beheer worden toegevoegd, niet gevraagd voor dit deelproject.
- Notificaties naar de klant bij statuswijziging (bv. e-mail bij goedkeuring) — apart, later deelproject volgens het roadmap-document.

## Risico's / aandachtspunten

- De `klanten`-collectie deelt dezelfde Firebase Auth-instantie als de medewerkers-login; een klant heeft nooit een `medewerkers`-document, dus krijgt automatisch geen toegang tot `/beheer` (bestaande "unauthorized"-afhandeling in `AdminDashboard` vangt dit al af).
- Zowel registreren, inloggen als account verwijderen loggen de echte Firebase-sessie meteen weer uit — de enige blijvende sessie-status voor de klant blijft de bestaande lokale `useMockAuth`-vlag (nu uitgebreid met e-mail/UID). Dit is bewust: er is geen doorlopende real-time synchronisatie tussen Firebase Auth-status en de rest van de (mock) klantomgeving.
- `deleteUser()` vereist een recente aanmelding; door vlak ervoor opnieuw in te loggen met het ingevoerde wachtwoord is aan die eis voldaan.
