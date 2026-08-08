# Design: Beheer — Glassart & Design (bedrijfsgegevens)

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 22-07-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

## Context

De publieke contactpagina (`src/app/[locale]/contact/page.tsx` → `src/components/ContactInfo.tsx`) toont op dit moment volledig **hardcoded** bedrijfsgegevens: bezoekadres, twee contactpersonen (naam, rol, telefoon — als losse JSX, geen data-array), een WhatsApp-nummer, e-mailadres, openingstijden (via i18n-tekst `hoursValue`) en KvK-/BTW-/IBAN-gegevens. Een deel hiervan zijn zichtbaar placeholder-waarden (KvK `12345678`, IBAN `NL00 BANK 0123 4567 89`, WhatsApp `31600000000`).

In `BeheerNav` staat al een uitgeschakeld menu-item klaar (`{ id: 'glassartDesign', labelKey: 'navGlassartDesign' }`), met de vertaling `navGlassartDesign` = "Glassart and Design" al aanwezig in `messages/nl.json`. Dit deelproject activeert dat menu-item: een nieuwe beheerpagina waarin al deze bedrijfsgegevens worden vastgelegd in Firestore, en de contactpagina leest deze dynamisch uit in plaats van hardcoded.

## Architecturale randvoorwaarden

- **Geen backend**: net als de rest van het project blijft dit een statische export; Firestore-toegang loopt via de client-SDK, geen API-routes.
- **Eén vast document, geen lijst**: in tegenstelling tot bestaande beheer-secties (materialen, segmenten, kunstwerken) is dit geen collectie van meerdere items maar precies één bedrijfsprofiel. Er is dus geen bestaand `DataTable`/`Modal`-patroon van toepassing op het geheel — wel op het detailniveau van contactpersonen (zie hieronder).
- **Contactpersonen zijn een sub-lijst, geen aparte tabel**: op uitdrukkelijke keuze van de gebruiker worden contactpersonen bewerkt als rijen binnen hetzelfde formulier (toevoegen via een "+"-knop, verwijderen via een prullenbak-icoon per rij), niet als eigen los beheeronderdeel met eigen opslaan-actie.
- **Meertaligheid is selectief**: de site ondersteunt nl/en/fr/de. Alleen **rol van een contactpersoon** en **openingstijden** worden per taal ingevoerd (net zoals kunstwerk-omschrijvingen in een eerder deelproject: volledig handmatig, geen vertaal-API). Adres, namen, telefoonnummers, e-mail, IBAN, KvK/BTW zijn taalneutraal en worden één keer ingevoerd.

## Datamodel

**Collectie `instellingen`, vast document `instellingen/bedrijfsgegevens`**

```ts
interface Bedrijfsgegevens {
  bezoekadres: string;
  email: string;
  whatsappNummer: string;
  iban: string;
  kvkNummer: string;
  btwNummer: string;
  openingstijden: { nl: string; en: string; fr: string; de: string };
  contactpersonen: Contactpersoon[];
}

interface Contactpersoon {
  id: string;      // client-side gegenereerd (crypto.randomUUID()), stabiel binnen het array-veld
  naam: string;
  telefoon: string;
  rol: { nl: string; en: string; fr: string; de: string };
}
```

Dit is de eerste keer dat een beheer-Firestore-document uit precies één vaste doc-id bestaat in plaats van een collectie met meerdere doc's. `contactpersonen` en `openingstijden`/`rol` zijn geneste array-/object-velden — Firestore ondersteunt dit al (zie eerdere ervaring met `Kunstwerk.prijzen`), geen wijziging nodig aan de opslaglaag.

## UI — Beheer

Nieuwe component `GlassartDesignSection.tsx`, gerenderd door `BeheerShell.tsx` wanneer `activeSection === 'glassartDesign'`. Het uitgeschakelde nav-item verhuist van `DISABLED_ITEMS` naar `ACTIVE_ITEMS` in `BeheerNav.tsx` (zonder telbadge — dit is het eerste actieve item zonder itemaantal; `BeheerNav` moet een badge-loos item kunnen tonen).

Eén formulier binnen een `GlassPanel`, met de volgende blokken:

1. **Bezoekadres** — tekstveld.
2. **Contactpersonen** — herhaalbare rijen: naam, telefoon, en rol per taal (via het taal-tabblad hieronder). Een "+ contactpersoon toevoegen"-knop voegt een lege rij toe; elke rij heeft een prullenbak-icoon om hem te verwijderen. Minimaal 0 rijen toegestaan (geen verplicht minimum, al is 1+ in de praktijk verwacht).
3. **Communicatie** — e-mailadres, WhatsApp-nummer.
4. **Bank & bedrijfsgegevens** — IBAN, KvK-nummer, BTW-nummer.
5. **Openingstijden** — vrije tekst per taal.

Voor de twee meertalige velden (rol per contactpersoon, openingstijden) verschijnt een taal-tabblad (NL/EN/FR/DE) bovenaan het formulier: het wisselt welke taalversie van die velden zichtbaar is, zodat het formulier niet 4× zo breed wordt. NL is de standaardtab.

Eén "Opslaan"-knop onderaan schrijft het hele document in één `setDoc`-call. Foutafhandeling volgt de bestaande conventie (`loadError` bij het ophalen, `actionError` bij het opslaan), net als in `SegmentenSection` e.a.

## UI — Contactpagina

`ContactInfo.tsx` haalt `instellingen/bedrijfsgegevens` op via `getDoc` (client-side, zoals de rest van de site Firestore benadert) in plaats van de hardcoded constanten te gebruiken. Rol en openingstijden tonen de tekst voor de actieve locale (`useLocale()`/route-locale), met NL als fallback wanneer een taalveld leeg is. De statische labels ("KvK-nummer", "Rol") blijven ongewijzigd via i18n — alleen de waarden worden dynamisch.

## Beveiliging (firestore.rules)

```
match /instellingen/{id} {
  allow read: if true;
  allow write: if request.auth != null && exists(/databases/$(database)/documents/medewerkers/$(request.auth.uid));
}
```

Publiek leesbaar (de contactpagina heeft geen login nodig), schrijven alleen voor bekende medewerkers — zelfde patroon als `materiaalsoorten`/`materialen`/`maten`/`segmenten`.

## Activiteitenlog

Nieuw event-type `bedrijfsgegevens_gewijzigd`, toegevoegd aan de `ActiviteitType`-union in `src/lib/logActiviteit.ts` en aan de `type in [...]`-allowlist in `firestore.rules`. Elke succesvolle opslag in de beheerpagina logt dit event (net als bij materiaalsoort/materiaal/maat-wijzigingen), zonder verdere velddetails in de log-entry (geen diff van oude/nieuwe waarden — alleen dát er gewijzigd is).

## Seed-data

Bij het eerste gebruik bestaat `instellingen/bedrijfsgegevens` nog niet. Zowel de beheerpagina als de contactpagina hanteren een seed-bij-afwezigheid: als het document niet bestaat, wordt het aangemaakt met de huidige hardcoded waarden uit `ContactInfo.tsx`:

- Bezoekadres: "Den Heuvel 21, 5688 EM Oirschot"
- Contactpersonen: Paul van den Hout (rol: huidige `projectsContact`-tekst, tel `+31651404089`), Hem Brekoo (rol: huidige `b2bContact`-tekst, tel `+31653736756`) — rol alleen in NL ingevuld bij de seed, overige talen leeg
- E-mail: `info@glassartdesign.nl`
- WhatsApp: `31600000000` (bekende placeholder, blijft ongewijzigd totdat een beheerder het echte nummer invult)
- IBAN/KvK/BTW: huidige placeholder-waarden
- Openingstijden: huidige `hoursValue`-tekst, alleen NL ingevuld

Zo blijft de contactpagina identiek aan de huidige productie-inhoud totdat een beheerder de gegevens bijwerkt.

## Niet in scope

- Verwijderen van de i18n-teksten `projectsContact`/`b2bContact`/`hoursValue`/`kvkLabel`/`btwLabel`/`ibanLabel`/`whatsappLabel` zelf — de *labels* blijven i18n, alleen de *waarden* worden dynamisch.
- Validatie van IBAN-/KvK-/BTW-formaten — gewone tekstvelden, geen forma­atcontrole.
- Wijzigingsgeschiedenis/diff-weergave in het activiteitenlog — alleen het feit dát er gewijzigd is wordt gelogd.
- Vertaling van bezoekadres, namen of telefoonnummers — deze zijn per ontwerp taalneutraal.

## Risico's / aandachtspunten

- Dit is de eerste beheer-sectie die één vast document bewerkt in plaats van een collectie met meerdere rijen — het bestaande `useFirestoreCollection`-hook-patroon past hier niet direct op; waarschijnlijk een directe `getDoc`/`setDoc` in `BeheerShell.tsx`, analoog aan hoe `klanten`/`bestellingen` nu al inline worden opgehaald.
- `BeheerNav` heeft nog geen precedent voor een actief item zonder telbadge — kleine aanpassing nodig aan het nav-component.
- De taal-tabblad-UI (rol per contactpersoon + openingstijden) is de eerste plek waar een taal-tabblad binnen één formulier verschijnt (eerdere meertalige velden bij kunstwerken gebruikten losse, altijd-zichtbare tekstvakken per taal) — bewuste keuze om het formulier compact te houden bij twee meertalige velden i.p.v. acht losse tekstvakken.
