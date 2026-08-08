# Design: Klant-accountpagina (dashboard)

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 19-07-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **VAN DE ZES SECTIES ZIJN ER TWEE OVER.** Dit ontwerp beschrijft een accountpagina op mock-data (`localStorage`); die is inmiddels vervangen door echte data uit MySQL, en drie secties zijn volledig verwijderd. Stand 2026-08-08:
>
> | Sectie uit dit ontwerp | Status nu |
> |---|---|
> | Bestellingen | **Bestaat** — `OrdersSection`, echte data via `useAllOrders` |
> | Instellingen | **Bestaat** — `SettingsSection`, schrijft naar het echte `klanten`-record via `/api/klanten/me` |
> | Te betalen facturen | **Verwijderd** (`InvoicesDueSection`, commit `20d8269`) |
> | Betaalde facturen | **Verwijderd** (`InvoicesPaidSection`, commit `20d8269`) |
> | Retourneren | **Verwijderd** (`ReturnsSection`, `useReturns`, commit `20d8269`) |
> | Gesprekgeschiedenis | **Verwijderd** (`ConversationsSection`, commit `e5d1247`) |
>
> Ook verdwenen: `useMockProfile`, `useMockAuth`, `MockProfileProvider`, `ReturnsProvider`, `OrdersProvider` en alle `mock*`-databestanden. De taalvoorkeur uit dit ontwerp is nooit als opgeslagen accountinstelling gebouwd — de `klanten`-tabel heeft geen taalkolom.

## Context

Tot nu toe opent het klikken op de "GD"-account-icoon (zichtbaar wanneer ingelogd via de mock-auth) een klein dropdown-paneeltje (`AccountMenu.tsx`) met alleen een bestellingenlijst en een uitlogknop. De klant wil een volwaardige account-pagina met 6 secties. Dit was eerder gedocumenteerd als toekomstige roadmap-wens (zie `2026-07-18-b2b-portaal-beheeromgeving-roadmap.md`) en wordt nu voor het eerst echt gebouwd, als mock/demo-functionaliteit (geen backend — dit project is en blijft een statische export).

## Doel

Een ingelogde klant kan via "GD" naar een volledige accountpagina navigeren met een linker menu en 6 secties: Bestellingen, Te betalen facturen, Betaalde facturen, Retourneren, Gesprekgeschiedenis en Instellingen. Alles werkt met mock-data (localStorage), consistent met de rest van de site.

## Navigatie: GD-knop en routing

- `AccountMenu.tsx` (het huidige dropdown-paneeltje) wordt verwijderd. In `NavBar.tsx` wordt de "GD"-knop een `Link` (uit `@/i18n/navigation`) naar `/account`, met dezelfde ronde styling (`bg-silver`, tekst "GD") als nu.
- Nieuwe route: `src/app/[locale]/account/page.tsx` — client component, één pagina (geen 6 losse sub-routes). Een linker navigatie zet lokale state (`activeSection`), rechts wordt de bijbehorende sectie-component gerenderd. Dit sluit aan bij de eigen omschrijving van de klant ("open dan rechts...") en voorkomt 6 bijna-identieke route-bestanden voor wat in essentie één weergave is.
- Auth-guard: als `isHydrated && !isLoggedIn`, redirect naar `/` (via `router.replace('/')` uit `@/i18n/navigation`). Zolang niet hydrated: niets renderen (voorkomt flits van de pagina voor uitgelogde bezoekers).
- Standaard geopende sectie: Bestellingen.
- Onderaan de linker navigatie: een uitlogknop (dezelfde `logout()` uit `useMockAuth`, verplaatst uit het oude dropdown-paneeltje — dat bestaat straks niet meer).

## Data-modellen (nieuw)

- `src/data/mockInvoices.ts`: `MockInvoice { id: string; date: string; amount: string; status: 'te-betalen' | 'betaald'; messageKey: string }`. Circa 3 facturen met status `te-betalen` en 3 met status `betaald`, zelfde stijl als `src/data/mockOrders.ts` (hardcoded seed-data, `messageKey` verwijst naar vertaalde omschrijving).
- `src/data/mockConversations.ts`: `MockConversation { id: string; date: string; time: string; messageKey: string }`. Circa 4 gevoerde WhatsApp-gesprekken, `messageKey` verwijst naar een vertaald kort onderwerp (bv. "Vraag over levertijd").
- `src/lib/useReturns.tsx`: nieuwe `ReturnsProvider`/`useReturns`, zelfde patroon als `useOrders`/`useCart` (localStorage-key `glassart-returns`, hydratie via `useEffect`, `isHydrated`-vlag). Slaat retouraanvragen op als `Record<string, { reason: string; note: string; date: string }>` (sleutel = order-id). Exposeert `returnsByOrderId` en `registerReturn(orderId, reason, note)`.
- `src/lib/useMockProfile.tsx`: nieuwe `MockProfileProvider`/`useMockProfile`, localStorage-key `glassart-mock-profile`. Er bestaat nog geen klantprofiel-datamodel (de huidige mock-auth is uitsluitend een boolean) — dit hook introduceert er één, geseed met een plausibel fictief profiel bij eerste gebruik (geen leeg formulier). Velden: `companyName, contactPerson, email, phone, address, postcode, city, contactPreference ('email'|'phone'|'whatsapp'), languagePreference ('nl'|'en'|'de'|'fr'), password`. Exposeert `profile`, `isHydrated`, `updateProfile(partial)`.
- `src/lib/useAllOrders.tsx`: nieuwe hook die de merge-logica (nu inline gedupliceerd in `AccountMenu.tsx`) centraliseert: combineert `placedOrders` (uit `useOrders`) met de vertaalde `MOCK_ORDERS`, en overschrijft per order de weergegeven status met "Retour aangemeld" (nieuwe vertaalsleutel) als er in `useReturns` een retour voor dat order-id geregistreerd staat. Retourneert een genormaliseerde lijst `{ id, date, description, status, hasReturnRequest }[]`, herbruikt door zowel de Bestellingen-sectie als de Retourneren-sectie (voor de select van nog-niet-geretourneerde bestellingen).

Beide nieuwe providers (`ReturnsProvider`, `MockProfileProvider`) worden toegevoegd aan de provider-boom in `src/app/[locale]/layout.tsx`, naast de bestaande `MockAuthProvider`/`CartProvider`/`OrdersProvider`.

## De 6 secties (components onder `src/components/account/`)

- `AccountNav.tsx` — de linker menu-lijst (6 knoppen + uitlogknop onderaan), beheert geen eigen state; ontvangt `activeSection`/`onSelect` als props vanuit `page.tsx`.
- `OrdersSection.tsx` — rendert `useAllOrders()`, dezelfde kaart-stijl als het huidige dropdown maar full-width, geen `reorder`-knop nodig te wijzigen (blijft zoals nu).
- `InvoicesDueSection.tsx` — `MOCK_INVOICES.filter(status === 'te-betalen')`, toont id/datum/bedrag.
- `InvoicesPaidSection.tsx` — `MOCK_INVOICES.filter(status === 'betaald')`, toont id/datum/bedrag + een "Download PDF"-knop die puur visueel is (geen echt bestand, consistent met de rest van de mock-data-aanpak).
- `ReturnsSection.tsx` — select-box met bestellingen zonder bestaande retouraanvraag (`useAllOrders().filter(!hasReturnRequest)`), reden-select (Beschadigd / Voldoet niet aan verwachting / Verkeerd besteld / Anders), toelichting-textarea, submit-knop "Meld aan voor retour" → roept `registerReturn` aan, toont daarna een bevestiging. Bestaande retouraanvragen worden ook getoond (als lijstje "Eerder aangemelde retouren") met hun reden/toelichting.
- `ConversationsSection.tsx` — `MOCK_CONVERSATIONS`, toont datum, tijd en vertaald onderwerp per regel.
- `SettingsSection.tsx` — formulier met alle profielvelden uit `useMockProfile` + wachtwoord + wachtwoord-opnieuw (met match-validatie, zelfde patroon als `RegistrationForm`) + contactvoorkeur-select (zelfde 3 opties als bij Word klant) + taalvoorkeur-select (4 talen). Bij opslaan: `updateProfile(...)` schrijft naar localStorage, én als `languagePreference` is gewijzigd wordt ook daadwerkelijk de sitetaal omgeschakeld via `router.replace(pathname, { locale: languagePreference })` (dezelfde routeringsmethode als de bestaande `LanguageSwitcher`).

## Vertalingen

Nieuwe vertaalsleutels (in alle 4 talen, NL/EN/DE/FR) onder een nieuwe namespace `accountPage`: sectietitels (6x), "Uitloggen" (bestaat al als `nav.logout`, hergebruikt), veldlabels voor Instellingen (grotendeels hergebruik van bestaande `registrationPage`-sleutels waar identiek, bv. labelEmail/labelPhone/labelPassword/labelPasswordConfirm/passwordMismatch/labelContactPreference + de 3 contactPreference-opties), reden-opties voor Retourneren (4x), "Retour aangemeld"-statuslabel, "Download PDF"-knoptekst, taalvoorkeur-labels (hergebruik van de bestaande locale-namen uit `LanguageSwitcher` waar zinvol, anders eigen korte labels NL/EN/DE/FR), plus de `messageKey`-teksten voor de mock-facturen en mock-gesprekken.

## Niet in scope

- Geen echte PDF-generatie (zoals besproken — puur mock-knop).
- Geen wijziging aan hoe bestellingen worden geplaatst (`CartPanel`/`useOrders.placeOrder` blijft ongewijzigd) — alleen de weergave/status-overlay via retouren is nieuw.
- Geen validatie/koppeling tussen het mock-profiel en de eerder gebouwde `RegistrationForm` (Word klant) — het zijn losstaande mock-datastromen, er is geen backend die ze aan elkaar knoopt.
- Geen wachtwoord-sterkte-eisen of echte authenticatie — het wachtwoordveld in Instellingen is net zo'n mock-veld als bij Word klant.

## Risico's / aandachtspunten

- `useMockProfile` introduceert het eerste "klantprofiel"-datamodel van de site; er is bewust voor gekozen dit te seeden met fictieve data in plaats van een leeg formulier, zodat Instellingen meteen bruikbaar oogt.
- Het omschakelen van de sitetaal vanuit Instellingen hergebruikt exact het routeringsmechanisme van de bestaande `LanguageSwitcher` (`router.replace(pathname, { locale })`) — geen nieuw patroon, wel de eerste keer dat twee plekken in de UI de taal kunnen wijzigen; dit is functioneel identiek, geen conflict te verwachten.
- `useAllOrders` vervangt de inline merge-logica die nu in `AccountMenu.tsx` zit; omdat `AccountMenu.tsx` zelf verdwijnt, is dit een verplaatsing zonder gedragswijziging voor de Bestellingen-weergave zelf (behalve de nieuwe retour-status-overlay).
