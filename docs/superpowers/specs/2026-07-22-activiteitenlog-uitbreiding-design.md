# Design: Activiteitenlog-uitbreiding (Beheer-acties + Prijsgroepen)

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 22-07-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

## Context

Vervolg op `docs/superpowers/specs/2026-07-22-activiteitenlog-design.md` (het eerste deelproject: 7 klant-gerichte events + het Activiteit-scherm in Beheer, inmiddels gemerged naar `master`). Dit deelproject:

1. Verwijdert `beheer_bezocht` (pure ruis, levert geen nuttige informatie op).
2. Voegt logging toe voor beheeracties: wie een status wijzigt (Klant, Bestelling) en wie iets toevoegt/wijzigt/verwijdert (Materiaalsoorten, Materialen, Maten, Segmenten, Kunstwerken).
3. Hernoemt "Activiteit" naar **"Activiteitenlog"** (menu-label én de Firestore-collectienaam).
4. Voegt ontbrekende verwijder-bescherming toe aan Materialen en Maten (blokkeren als nog gekoppeld aan een Kunstwerk) — een bestaand gat, nu gedicht omdat we deze bestanden toch al aanraken.
5. Bouwt een volledig nieuwe tabel **Prijsgroepen** (naam + kortingspercentage, CRUD), met een echte koppeling (`prijsgroepId`) vanaf Klant.

## Sectie A: `beheer_bezocht` verwijderen

- Uit `ActiviteitType` (`src/lib/logActiviteit.ts`).
- De hele tweede `useEffect` + `hasLoggedVisit`-ref + de `actorFromMedewerker`/`logActiviteit`-import in `src/components/beheer/AdminDashboard.tsx` (de eerste `useEffect`/`hasSignedOutUnauthorized`-ref, voor het automatisch uitloggen van niet-geautoriseerde accounts, blijft ongewijzigd).
- Uit de `type in [...]`-lijst in `firestore.rules` (her-deploy nodig).
- Uit `TYPE_LABEL_KEYS` in `ActiviteitSection.tsx` en de vertaalsleutel `activiteitTypeBeheerBezocht` in `messages/nl.json`.
- Alle bijbehorende tests in `tests/components/beheer/AdminDashboard.test.tsx`.
- **Defensieve fallback in `ActiviteitSection.tsx`**: als `TYPE_LABEL_KEYS[activiteit.type]` geen match heeft (bv. een oud `beheer_bezocht`-document dat nog in Firestore staat), toon het ruwe `type`-veld in plaats van te crashen. Kleine, blijvend nuttige robuustheid — niet alleen voor deze migratie.

## Sectie B: 22 nieuwe event-types

Alle nieuwe types loggen met `actorFromMedewerker(user)` (via een nieuwe, losse `useAdminAuth()`-aanroep in elk bestand — zelfde patroon als hoe `ProductModal`/`CartPanel` elk zelf `useCustomerAuth()` aanroepen, geen props doorgeven via `BeheerShell`). Altijd alleen bij een daadwerkelijk geslaagde write (nooit in een catch-blok, nooit bij een geblokkeerde verwijderpoging).

| Trigger | Bestand | Types |
|---|---|---|
| Klant goedkeuren/afwijzen | `KlantModal.tsx`, in `handleGoedkeuren`/`handleAfwijzen`, ná succesvolle `updateDoc` | `klant_goedgekeurd`, `klant_afgewezen` |
| Bestelling goedkeuren/afwijzen | `BestellingModal.tsx`, zelfde patroon | `bestelling_goedgekeurd`, `bestelling_afgewezen` |
| Materiaalsoort toevoegen/wijzigen/verwijderen | `MateriaalsoortenSection.tsx`, in `handleSave` (na `onAdd`/`onUpdate` → `true`) en `handleRemove` (na `onRemove` → `true`) | `materiaalsoort_toegevoegd`, `materiaalsoort_gewijzigd`, `materiaalsoort_verwijderd` |
| Materiaal toevoegen/wijzigen/verwijderen | `MaterialenSection.tsx`, zelfde patroon | `materiaal_toegevoegd`, `materiaal_gewijzigd`, `materiaal_verwijderd` |
| Maat toevoegen/wijzigen/verwijderen | `MatenSection.tsx`, zelfde patroon | `maat_toegevoegd`, `maat_gewijzigd`, `maat_verwijderd` |
| Segment toevoegen/wijzigen/verwijderen | `SegmentenSection.tsx`, zelfde patroon | `segment_toegevoegd`, `segment_gewijzigd`, `segment_verwijderd` |
| Kunstwerk toevoegen/wijzigen/verwijderen | `KunstwerkenSection.tsx`, zelfde patroon | `kunstwerk_toegevoegd`, `kunstwerk_gewijzigd`, `kunstwerk_verwijderd` |
| Prijsgroep toevoegen/wijzigen/verwijderen | `PrijsgroepenSection.tsx` (nieuw, zie Sectie E), zelfde patroon | `prijsgroep_toegevoegd`, `prijsgroep_gewijzigd`, `prijsgroep_verwijderd` |

Bewuste keuze (bevestigd): status-wijzigingen loggen **per uitkomst apart** (`klant_goedgekeurd` vs. `klant_afgewezen`), niet één gecombineerd `klant_status_gewijzigd` — dat maakt de activiteitenlijst direct informatief zonder dat je in Firestore hoeft te kijken wat er precies gebeurde.

Elk nieuw type krijgt: een entry in `firestore.rules`' `type in [...]`-lijst, een entry in `TYPE_LABEL_KEYS` (`ActiviteitSection.tsx`), en een vertaalsleutel in `messages/nl.json`. Geen wijziging aan `logActiviteit.ts`'s schema zelf — nog steeds alleen `type`+`actorId`+`actorEmail`+`actorNaam`+`timestamp`.

## Sectie C: Activiteitenlog hernoemen

- Menu-label: `messages/nl.json`'s `navActiviteit` wordt **"Activiteitenlog"** (tekst alleen, sleutelnaam blijft `navActiviteit`).
- Firestore-collectie: **`activiteiten` → `activiteitenlog`** in `src/lib/logActiviteit.ts` (de `collection(db, 'activiteiten')`-aanroep), `firestore.rules` (`match /activiteiten/{id}` → `match /activiteitenlog/{id}`), en `BeheerShell.tsx`'s query. Geen migratie van bestaande data nodig (feature is dezelfde dag pas live gegaan, verwaarloosbare hoeveelheid data onder de oude naam).
- Interne identifiers (bestandsnaam `ActiviteitSection.tsx`, de `BeheerSection`-waarde `'activiteit'`, test-id's als `beheer-nav-activiteit`) blijven ongewijzigd — niet zichtbaar voor de gebruiker, hernoemen voegt alleen risico toe.

## Sectie D: Verwijder-bescherming Materialen/Maten

Zelfde patroon als de bestaande Materiaalsoorten-bescherming (blokkeer als nog gekoppeld aan een Materiaal), nu ook voor:

- **`MaterialenSection.tsx`**: nieuwe `kunstwerken: Kunstwerk[] | null`-prop. `handleRemove` blokkeert (nieuwe foutmelding `materialenVerwijderBlocked`, geen Firestore-write dus ook geen `materiaal_verwijderd`-log) als `kunstwerken.some(k => k.materiaalIds.includes(materiaal.id))`.
- **`MatenSection.tsx`**: nieuwe `kunstwerken: Kunstwerk[] | null`-prop. `handleRemove` blokkeert (nieuwe foutmelding `matenVerwijderBlocked`) als `kunstwerken.some(k => k.maatIds.includes(maat.id))`.
- **`BeheerShell.tsx`**: geeft de al-geladen `kunstwerken.items` door aan beide nieuwe props (dezelfde data die al naar `KunstwerkenSection` gaat).

## Sectie E: Nieuwe tabel Prijsgroepen

- **Nieuwe Firestore-collectie `prijsgroepen`**: `naam: string`, `kortingspercentage: number`.
- **`src/components/beheer/PrijsgroepenSection.tsx`** (nieuw bestand): zelfde opbouw als `MateriaalsoortenSection.tsx`/`SegmentenSection.tsx` — inline `Modal`, `useFirestoreCollection<Prijsgroep>('prijsgroepen')` in `BeheerShell.tsx`, `onAdd`/`onUpdate`/`onRemove`-props.
- **Verwijder-bescherming**: blokkeer (nieuwe foutmelding `prijsgroepenVerwijderBlocked`, geen write, geen log) als een geladen Klant deze prijsgroep nog heeft (`klanten.some(k => k.prijsgroepId === prijsgroep.id)`) — vereist dat `PrijsgroepenSection` de al-geladen `klanten`-lijst als prop krijgt.
- **`BeheerNav.tsx`**: `'prijsgroepen'` verhuist van `DISABLED_ITEMS` naar `ACTIVE_ITEMS`, met teller (totaal aantal prijsgroepen, zelfde stijl als Segmenten/Kunstwerken — geen "openstaand"-filtering nodig, dit is geen goedkeuringsproces).
- **Kolommen in de tabel**: Naam, Kortingspercentage.

## Sectie F: Klant.prijsgroep → prijsgroepId (echte koppeling)

Volledige inventarisatie bevestigd — precies deze plekken, nergens anders in de codebase:

- **`KlantenSection.tsx`**: `Klant`-interface `prijsgroep: string` → `prijsgroepId: string | null`.
- **`RegistrationForm.tsx`**: schrijft bij aanmelding `prijsgroepId: null` i.p.v. `prijsgroep: ''`.
- **`KlantModal.tsx`**: lokale state wordt `prijsgroepId: string | null`; het vrije-tekstveld (`data-testid="klant-modal-prijsgroep"`) wordt een `<select>` gevuld met een nieuwe `prijsgroepen: Prijsgroep[] | null`-prop; Goedkeuren-knop blijft disabled zonder keuze (`disabled={!prijsgroepId}` i.p.v. `disabled={!prijsgroep}`).
- **`BeheerShell.tsx`**: Firestore→Klant-mapping hernoemt het veld; geeft de geladen `prijsgroepen.items` door aan `KlantenSection`/`KlantModal`.
- **`firestore.rules`**: de `klanten`-create-rule (`request.resource.data.prijsgroep == ''`) wordt `request.resource.data.prijsgroepId == null`.

Bevestigd (2026-07-22): dit blijft een simpele string-achtige koppeling zonder resolve-logica elders nodig, omdat `klant.prijsgroep` nergens anders als los tekstveld wordt weergegeven (geen kolom in de Klanten-tabel) — alleen binnen `KlantModal` zelf, waar de dropdown-selectie zelf al de weergave is.

## Vertalingen

Nieuwe sleutels alleen in `messages/nl.json`, Nederlands-only `beheer`-namespace: 22 nieuwe `activiteitType*`-sleutels, `materialenVerwijderBlocked`, `matenVerwijderBlocked`, `prijsgroepenVerwijderBlocked`, `navPrijsgroepen`-hergebruik (bestaat al als disabled-label, blijft dezelfde tekst "Prijsgroepen"), plus de nieuwe Prijsgroepen-sectie se eigen labels (kolomkoppen, laad-/leeg-/actiefoutmeldingen, toevoegen/opslaan/verwijderen-knoppen — zelfde patroon als `segmentenCol*`/`segmentenLabel*`/etc.). `activiteitTypeBeheerBezocht` wordt verwijderd.

## Niet in scope

- **Kunstwerk-koppeling aan Prijsgroep.** Expliciet nagevraagd en afgewezen: Prijsgroep blijft alleen gekoppeld aan Klant. Een prijsgroep-afhankelijke Kunstwerk-prijs is een aparte, grotere ontwerpvraag (per kunstwerk? per materiaal+maat-regel? wat betekent dat voor de bestaande vaste `prijzen`-array?) — niet nu gebouwd.
- **Kortingspercentage daadwerkelijk toepassen op een prijs.** Het veld wordt opgeslagen en getoond, maar niets in de checkout/prijsberekening leest het nog — dat is een aparte toekomstige stap (zie de B2B-roadmap, "Prijzen").
- **Migratie van bestaande `prijsgroep`-strings** naar `prijsgroepId`-referenties voor al goedgekeurde klanten — er zijn op dit moment naar verwachting geen of nauwelijks echte productie-klanten met een ingevulde prijsgroep, dus geen migratiescript.
- **Detailvelden per activiteit** (welk specifiek veld gewijzigd is, oude/nieuwe waarde) — zelfde "alleen type + wie + wanneer"-principe als het eerste deelproject.

## Risico's / aandachtspunten

- 22 nieuwe `type`-waarden brengt het totaal op ~28 — de `firestore.rules`-enum en `TYPE_LABEL_KEYS`-map worden navenant langer. Blijft onderhoudbaar zolang nieuwe events consequent bij beide lijsten worden toegevoegd (en getest — een ontbrekende `TYPE_LABEL_KEYS`-entry voor een geldig type zou een lege/undefined label tonen in plaats van een rules-fout).
- De Prijsgroepen- en Materialen/Maten-verwijder-blokkades zijn client-side checks (zoals de bestaande Materiaalsoorten-blokkade) — geen Firestore-rule-afdwinging. Consistent met het bestaande patroon in dit bestand, dus geen nieuwe afwijking, maar wel dezelfde bekende zwakte (een rechtstreekse Firestore-call zou de blokkade kunnen omzeilen).
- `firestore.rules`'s collectienaam-wijziging (`activiteiten` → `activiteitenlog`) vereist een her-deploy vóór de code live gaat, anders schrijven de eerste 7 (bestaande) events naar een collectie zonder geldige rule.
