# Design: Beheer — Segmenten en Kunstwerken (Deel 1: beheer)

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 21-07-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

## Context

Dit deelproject volgt op [2026-07-21-materiaalsoorten-materialen-maten-design.md](2026-07-21-materiaalsoorten-materialen-maten-design.md), dat de eerste generieke Firestore-CRUD-hook (`useFirestoreCollection`) en drie eenvoudige stamdata-tabellen (materiaalsoorten, materialen, maten) opleverde. Dit deelproject bouwt daarop voort met twee nieuwe beheer-secties: **Segmenten** (eenvoudig, identiek patroon aan materiaalsoorten) en **Kunstwerken** (aanzienlijk complexer: bestandsupload, meervoudige selecties, een automatisch prijsrooster, en meertalige beschrijvingen).

De publieke collectiepagina (`src/app/[locale]/collecties`, `ProductsGrid.tsx`, `ProductModal.tsx`, `FeaturedWorks.tsx`) gebruikt op dit moment volledig losstaande, hardcoded Unsplash-data (`src/data/segments.ts`) en een eigen hardcoded maten-lijst (`src/data/sizes.ts`'s `STANDARD_SIZES`), inclusief winkelmandje-integratie (`useCart`) die op die oude structuur is gebouwd. **Dit deelproject raakt de publieke site niet** — dat is bewust uitgesteld naar een apart, later deelproject ("Deel 2: publieke koppeling"), omdat het de bestaande cart/checkout-code beïnvloedt die eerst apart in kaart gebracht moet worden.

## Architecturale randvoorwaarden

- **Geen backend**: de site is een volledig statische export (`output: 'export'`, GitHub Pages, geen API-routes, geen server actions — "Firebase is a client-only concern here, no backend, per design"). Dit deelproject introduceert geen backend-infrastructuur.
- **Vertalen van kunstwerk-beschrijvingen is volledig handmatig** — geen externe vertaal-API, geen sleutelbeheer nodig. De beheerder typt zelf de Franse/Duitse/Engelse tekst in, op elk moment aanpasbaar.
- **Firebase Storage** wordt voor het eerst gebruikt in dit project (de config had er al ruimte voor, `getStorage`/`uploadBytes` werden nog nergens aangeroepen). Bevestigd: dit blijft ruim binnen het gratis Spark-plan voor de huidige schaal (5 GB opslag, 100 GB/maand downloads, 5.000 uploads/maand) — zie sectie "Firebase Storage" hieronder.
- **Watermerk hoort niet bij dit deelproject.** Het watermerk wordt pas relevant bij publieke weergave (Deel 2) en wordt daar als losse overlay-component gebouwd, niet als bewerking van de opgeslagen foto. De foto's in Storage blijven schoon.

## Datamodel

**Collectie `segmenten`**
```ts
interface Segment {
  id: string;           // Firestore doc-id
  omschrijving: string; // bv. "Hotel"
}
```

**Collectie `kunstwerken`**
```ts
interface Kunstwerk {
  id: string;                    // Firestore doc-id
  foto: string;                  // Firebase Storage download-URL
  segmentIds: string[];          // verwijst naar Segment.id, minimaal 1
  materiaalIds: string[];        // verwijst naar Materiaal.id, minimaal 1
  maatIds: string[];             // verwijst naar Maat.id, minimaal 1
  prijzen: { materiaalId: string; maatId: string; prijs: number }[]; // exact 1 rij per combinatie van materiaalIds × maatIds
  omschrijvingNl: string;        // verplicht
  omschrijvingFr: string;        // optioneel, handmatig, leeg toegestaan
  omschrijvingDe: string;        // optioneel, handmatig, leeg toegestaan
  omschrijvingEn: string;        // optioneel, handmatig, leeg toegestaan
}
```

`prijzen` is een afgeleide, door de UI beheerde lijst: zodra `materiaalIds`/`maatIds` wijzigen, wordt het prijsrooster automatisch bijgewerkt (rijen toegevoegd/verwijderd), niet iets dat de beheerder los structureert.

Dit is de eerste keer dat `useFirestoreCollection` array- en geneste-object-velden tegenkomt (in plaats van alleen platte scalars). Firestore ondersteunt dit zonder aanpassing aan de hook — de complexiteit zit in de formulier-UI, niet in de opslaglaag.

## UI — Segmenten

Identiek aan `MateriaalsoortenSection`: tabel met kolom "Omschrijving", toevoegen/bewerken/verwijderen via een enkel tekstveld-formulier. Geen verwijderblokkade nodig op basis van kunstwerk-koppeling in dit deelproject (kunstwerken worden hier nog niet publiek getoond, dus een "kapotte" segment-verwijzing heeft geen zichtbaar effect — heroverwegen in Deel 2 als dat wel relevant wordt).

## UI — Kunstwerken

**Tabel**: kolommen "Foto" (thumbnail), "Segmenten" (namen, kommagescheiden), "Beschrijving (NL)" (verkort/afgekapt).

**Toevoeg/bewerk-formulier**:
1. **Foto**: bestandskiezer (`<input type="file">`). Bij selectie direct upload naar Firebase Storage; formulier toont een voorbeeld zodra de upload klaar is en bewaart de download-URL in lokale formulierstate. Geen aparte "upload"-knop, geen uitgestelde upload bij opslaan.
2. **Segmenten**: aanvinkvakjes uit de segmenten-tabel, minimaal 1 verplicht.
3. **Materialen**: aanvinkvakjes uit de materialen-tabel (namen, niet ruwe id's), minimaal 1 verplicht.
4. **Maten**: aanvinkvakjes uit de maten-tabel (breedte×hoogte), minimaal 1 verplicht.
5. **Prijzen**: zodra materialen én maten zijn aangevinkt, verschijnt automatisch een rooster (materialen als rijen, maten als kolommen); elke cel is een verplicht numeriek prijsveld. Het rooster past zich live aan wanneer de materiaal-/maat-selectie wijzigt.
6. **Beschrijvingen**: tekstvak "Omschrijving (NL)", verplicht. Daaronder drie optionele tekstvakken "Omschrijving (FR)", "(DE)", "(EN)" — leeg totdat handmatig ingevuld, altijd achteraf aanpasbaar.

**Verwijderregel**: geen — geen andere data verwijst naar een kunstwerk in dit deelproject.

## Firebase Storage — opzet

- `src/lib/firebase.ts`: `getStorage()` toegevoegd naast de bestaande `auth`/`db`-exports, zelfde client-only guard-patroon (geen initialisatie tijdens prerendering).
- Storage security rules (los bestand, analoog aan de bestaande Firestore-rules die al via `firebase.json`/`.firebaserc` gedeployed worden): schrijven alleen toegestaan voor ingelogde beheerders (dezelfde `medewerkers`-collectie-check die de Firestore-rules al gebruiken voor adminrechten), lezen publiek toegankelijk (nodig zodra Deel 2 de foto's publiek toont; geen reden om dit nu al af te sluiten en later opnieuw open te zetten).
- Kostenschatting: 36 voorbeeldfoto's (enkele MB elk) blijft ruim onder de 5 GB gratis opslaglimiet; het CRUD-gebruik in beheer (enkele schrijfacties per dag) blijft ver onder de Firestore-limieten (50K reads/dag, 20K writes/dag). Bij substantieel publiek verkeer in Deel 2 kan de downloadlimiet (100 GB/maand) relevant worden — dat is een aandachtspunt voor dat deelproject, niet voor dit deelproject.

## Seed-data

**Segmenten**: 6 rijen — Hotel, Restaurant, Wellness, Office, Abstract, Artist Collections (bestaande namen, overgenomen van de huidige collectiepagina).

**Maten**: 3 rijen — 40×60, 60×90, 80×120 cm (bestaande standaardmaten, nu al hardcoded gebruikt in `ProductModal.tsx`'s `STANDARD_SIZES`). Dit vult de maten-tabel voor het eerst — bewust leeg gelaten in het vorige deelproject, nu gerechtvaardigd omdat de kunstwerken-seed er prijzen aan moet kunnen koppelen.

**Kunstwerken**: 36 rijen, één per bestaande Unsplash-foto uit `src/data/segments.ts`, gekoppeld aan het segment waar de foto nu bij hoort (dus 6 kunstwerken per segment). Om niet met de hand honderden prijzen te verzinnen: elk kunstwerk krijgt een klein voorbeeld-assortiment van 2 materialen × 2 maten (4 prijscombinaties), met prijzen berekend via een simpele, deterministische formule op basis van afmeting en materiaaldikte — genoeg om het prijsrooster met realistisch variërende voorbeelddata te tonen zonder 144 losse getallen handmatig te bedenken. `omschrijvingNl` krijgt een generieke placeholdertekst per segment (bv. "Hotel paneel 3"); `omschrijvingFr`/`De`/`En` blijven leeg, conform de "handmatig, optioneel"-beslissing.

## Navigatie & vertalingen

- `BeheerNav`: twee nieuwe actieve items — "Segmenten" (naast Materiaalsoorten) en "Kunstwerken" (nieuw; had nog geen uitgeschakelde placeholder). `BeheerSection`-type breidt uit van 5 naar 7 waarden.
- Vertalingen: zelfde `{section}{Field}`-conventie, alleen in `messages/nl.json` (geen wijzigingen aan en/de/fr — die blijven UI-chrome-only, niet gerelateerd aan de kunstwerk-inhoudsvelden).

## Niet in scope

- Publieke weergave van kunstwerken (collectiepagina, homepage "uitgelichte werken", winkelmandje/checkout) — apart deelproject ("Deel 2").
- Watermerk-overlay-component — hoort bij Deel 2, wanneer foto's publiek getoond worden.
- Automatische vertaling van beschrijvingen — bewust afgewezen; volledig handmatig.
- Verwijderblokkade voor segmenten op basis van gekoppelde kunstwerken — nog niet relevant zolang kunstwerken niet publiek zichtbaar zijn; heroverwegen in Deel 2.
- Server-side beeldbewerking of een backend van welke aard dan ook.

## Risico's / aandachtspunten

- Firebase Storage kostenlimieten zijn voor dit deelproject (beheer-only gebruik) geen probleem; bij substantiële publieke traffic in Deel 2 moet dit opnieuw beoordeeld worden (zie sectie hierboven).
- De prijsrooster-UI (materialen × maten) is de meest complexe formulier-interactie tot nu toe in dit project — vereist zorgvuldig state-management zodat het rooster correct meebeweegt met de selectie-checkboxes zonder al ingevulde prijzen onnodig te verliezen bij een kleine wijziging.
- Kunstwerken-seed-data bevat verzonnen (formule-gebaseerde) voorbeeldprijzen — niet bedoeld als echte prijslijst, moet in productie handmatig herzien worden.
