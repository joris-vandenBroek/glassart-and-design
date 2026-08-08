# Design: Beheer-authenticatie (fundament)

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 20-07-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

## Context

Het roadmap-document (`2026-07-18-b2b-portaal-beheeromgeving-roadmap.md`) beschrijft een volledige beheeromgeving (klantgoedkeuring, orders, facturen, retouren, catalogusbeheer, rollen, boekhoudkoppeling, notificaties). Dat is te groot voor één deelproject. Dit ontwerp dekt alleen het **fundament**: een "Beheer"-knop met inlog, en de architectuurkeuze eronder. Alle overige beheerfunctionaliteit bouwt in latere, aparte deelprojecten op dit fundament voort.

De site is en blijft een volledig statische Next.js-export (`output: 'export'`) op GitHub Pages — er is geen eigen server en die komt er ook niet bij dit deelproject. Firebase (Auth + Firestore) is gekozen omdat het rechtstreeks vanuit de browser werkt, geen eigen backend-code vereist, en de klant er al een (gratis, ook voor commercieel gebruik toegestaan) account voor heeft. Een MySQL-database bij de hostingprovider is overwogen maar afgewezen: die vereist een zelfgebouwde en te onderhouden PHP-API voor elke functie (login, kunstwerken, orders, facturen, ...), wat voor een klein bedrijf zonder eigen backend-team aanzienlijk meer bouw- en onderhoudswerk betekent.

## Doel

Een "Beheer"-knop in de navigatiebalk waarmee de 4 medewerkers kunnen inloggen met e-mail/wachtwoord (Firebase Auth), landend op een beveiligde, verder lege beheerpagina. Dit levert de werkende login/logout-basis en de Firestore-autorisatiestructuur waar latere deelprojecten (klantgoedkeuring, orders, catalogusbeheer, ...) hun schermen aan toevoegen.

## Architectuur

- Firebase Auth + Firestore, rechtstreeks aangeroepen vanuit de browser via de Firebase JS SDK — geen eigen backend, geen wijziging aan hosting (blijft GitHub Pages).
- De beheeromgeving is een nieuwe route binnen de bestaande Next.js-app: `src/app/[locale]/beheer/page.tsx`, client component (net als `/account`), geen server-side rendering nodig of mogelijk gezien `output: 'export'`.
- Firebase-configuratie (project-ID, API-key) via env-vars (`NEXT_PUBLIC_FIREBASE_*`, ingebakken in de static build zoals gebruikelijk bij Next.js `NEXT_PUBLIC_`-vars). Deze waarden zijn niet geheim — dat is inherent aan hoe Firebase-webapps werken; de beveiliging zit in Firestore Security Rules, niet in het verbergen van deze config. `.env.local` (voor lokale dev) wordt toegevoegd aan `.gitignore`; de daadwerkelijke waarden voor de GitHub Pages-build worden als GitHub Actions secrets aangeleverd (zelfde patroon als eventuele bestaande workflow-secrets).
- Nieuwe dependency: `firebase` (npm-package, alleen de client SDK, geen `firebase-admin`).

## Login-flow (UX)

- Nieuwe "Beheer"-knop in `NavBar.tsx`, los van het bestaande klant-account-icoon ("GD"). Simpele tekstlink/knop, stijl consistent met de rest van de navbar.
- Route: `src/app/[locale]/beheer/page.tsx`.
  - Niet ingelogd: loginformulier met e-mail + wachtwoord, plus een link "Wachtwoord vergeten?" die Firebase's ingebouwde `sendPasswordResetEmail` aanroept (toont een bevestigingsmelding, geen verdere UI nodig — Firebase verzorgt de e-mail zelf).
  - Wel ingelogd: beveiligde shell-pagina met "Ingelogd als [naam/e-mail]" en een uitlogknop. Verder bewust leeg — dit is de plek waar latere deelprojecten hun schermen toevoegen.
- Auth-status wordt bijgehouden via Firebase's `onAuthStateChanged`-listener in een nieuwe `AdminAuthProvider`/`useAdminAuth` (analoog aan het bestaande `useMockAuth`-patroon), toegevoegd aan de provider-boom in `src/app/[locale]/layout.tsx`.
- Foutafhandeling in het loginformulier: generieke melding bij verkeerde combinatie e-mail/wachtwoord (geen onderscheid tonen tussen "account bestaat niet" en "wachtwoord onjuist", conform gangbare praktijk).

## Accounts & autorisatie

- 4 vaste accounts, handmatig aangemaakt door Joris via de Firebase-console (geen publieke registratiepagina, geen selfservice-signup):
  - `Julie@glassartanddesign.com`
  - `Paul@glassartanddesign.com`
  - `Hem@glassartanddesign.com`
  - `joris.vandenbroek@gmail.com`
- Firestore-collectie `medewerkers`, één document per Firebase Auth UID (bv. `{ naam: string, email: string }`). Het bestaan van dit document bepaalt of iemand als beheerder geldt — dit is de plek waar latere deelprojecten rollen/rechten aan kunnen toevoegen (nu nog geen rollen-veld, expliciet uit scope).
- **Twee lagen bescherming, niet één:**
  - Client-side (UX): de `/beheer`-route toont het loginformulier als er geen geldige sessie is, en redirect niet-geautoriseerde ingelogde gebruikers (wel Firebase-account, geen `medewerkers`-document) terug naar de homepage met een foutmelding.
  - Firestore Security Rules (echte beveiliging): lees/schrijftoegang tot elke collectie die dit en latere beheer-deelprojecten gebruiken, vereist `request.auth != null` **en** een bestaand `medewerkers/{request.auth.uid}`-document. Dit dwingt de daadwerkelijke toegang af, los van wat de UI toont — omzeilen van de client-side check levert dus geen toegang tot data op.

## Niet in scope

- Klantaanvragen goedkeuren, orderbeheer, facturatie, retouren afhandelen, catalogusbeheer (kunstwerken/segmenten/materialen/prijzen), rollen/rechten-onderscheid tussen medewerkers, boekhoudkoppeling, automatische notificaties — dit zijn allemaal latere, aparte deelprojecten die op dit fundament voortbouwen.
- Geen migratie van de MySQL-database bij de hostingprovider — die wordt voor dit project niet gebruikt.
- Geen wijziging aan de bestaande klant-facing mock-auth (`useMockAuth`, `/account`) — dit is een volledig gescheiden authenticatiesysteem voor medewerkers, niet voor klanten.
- Geen zelfregistratie voor beheerders — nieuwe accounts blijven voorlopig een handmatige actie door Joris in de Firebase-console.

## Risico's / aandachtspunten

- Firestore Security Rules zijn de enige echte beveiligingslaag; deze moeten vanaf het begin correct staan (deny-by-default, expliciete allow alleen voor bestaande `medewerkers`-documenten) — dit is geen detail dat later "even" toegevoegd kan worden zonder de boel tijdelijk open te zetten.
- `NEXT_PUBLIC_FIREBASE_*`-env-vars worden ingebakken in de static export en zijn dus zichtbaar in de browser-bundle; dit is verwacht/veilig gedrag voor Firebase-webapps, maar moet niet verward worden met een geheime sleutel die per ongeluk gelekt is.
- Er is nog geen `firebase`-dependency of Firebase-project-configuratie in deze repo — dit deelproject introduceert beide voor het eerst.
