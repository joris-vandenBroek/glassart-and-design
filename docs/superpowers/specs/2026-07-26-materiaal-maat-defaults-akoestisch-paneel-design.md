# Materiaal/maat standaard "alles beschikbaar" + Akoestisch paneel als materiaalloos product

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 26-07-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

## Context

Elk kunstwerk kan in de praktijk in alle gedefinieerde materialen en maten
geleverd worden — het per-kunstwerk aanvinken van materialen/maten in het
beheer is dus meestal overbodige moeite, en het tonen van "Materiaal" en
"Formaten" op het productkaartje (`KunstwerkSpecCard.tsx`) heeft weinig
waarde zodra toch alles beschikbaar is. De kernactiviteit van GAAD is
printen op 4mm veiligheidsglas; dat moet zichtbaar zijn op het kaartje en
als standaardkeuze in de bestel-popup.

Daarnaast bleek tijdens het brainstormen dat "Akoestische stof" helemaal
geen materiaal is waarop een kunstwerk-ontwerp wordt geprint — het is een
eigen product (een akoestisch paneel), besteld in een vrije maat, zonder
materiaalkeuze. Dat verdwijnt dus uit `materiaalsoorten`/`materialen` en
wordt in plaats daarvan één los kunstwerk-record met een nieuw
"materiaalloos" bestelpad.

Relevante bestaande code:
- `src/components/beheer/materiaalTypes.ts` — datamodel (`Kunstwerk`,
  `Materiaal`, `Maat`, `Materiaalsoort`, `PrijsRegel`).
- `src/components/beheer/KunstwerkenSection.tsx` — kunstwerk-beheer
  (aanmaken/bewerken), incl. het bestaande "Namen aanvullen"-patroon
  (`handleBackfillNamen`, regel 251-261) waarop de nieuwe backfill-knop is
  gebaseerd.
- `src/components/KunstwerkSpecCard.tsx` — het productkaartje, gebruikt in
  `ProductsGrid.tsx` (publieke catalogus) en `KunstwerkenSection.tsx`
  (beheer live-preview).
- `src/components/ProductModal.tsx` — de bestel-popup, incl. de bestaande
  "eigen maat"-flow (`CUSTOM_MAAT_VALUE`, `withinMax`) die als voorbeeld
  dient voor het nieuwe materiaalloze bestelpad.
- `src/data/materiaalsoortenSeed.ts` — seed-data, bevat vandaag nog
  "Akoestische stof".

## Changes

### 1. Alle materialen/maten als standaard

**Nieuw kunstwerk** (`KunstwerkenSection.tsx`, `resetForm()`/`LEGE_FORM`):
bij het openen van "Kunstwerk toevoegen" worden `materiaalIds` en
`maatIds` vooraf gevuld met de id's van alle op dat moment geladen
`materialen` en `maten` (in plaats van lege arrays). De beheerder kan
individuele materialen/maten nog steeds uitvinken.

**Bestaand kunstwerk**: nieuwe knop **"Materialen/maten aanvullen
({count})"**, zichtbaar zodra er kunstwerken zijn waarvan `materiaalIds`
of `maatIds` niet alle beschikbare id's bevat. Analoog aan
`handleBackfillNamen`: itereert over die kunstwerken, roept `onUpdate` aan
met `materiaalIds`/`maatIds` op "alles", en logt per bijgewerkt kunstwerk
`logActiviteit('kunstwerk_gewijzigd', actorFromMedewerker(user))`. Nieuwe
vertaalsleutel `kunstwerkenBackfillMaterialenMaten` in alle 4
`messages/*.json`.

Geen wijziging aan de prijs-blokkade: een materiaal×maat-combinatie zonder
ingevulde prijs blijft in de bestel-popup gewoon niet bestelbaar
(`canConfirm` ongewijzigd).

### 2. Materialen/Maten inklapbaar in het kunstwerk-formulier

De twee `<fieldset>`-blokken "Materialen" en "Maten"
(`KunstwerkenSection.tsx:393-423`) gaan samen in één `<details>`-element,
standaard dicht (geen `open`-attribuut). Styling volgt de bestaande
fieldset/legend-look (native `<summary>` als "legend"-vervanger). De
prijzenblok (matrix, of het nieuwe prijs-per-m²-veld, zie §5) blijft er
los onder staan en is altijd zichtbaar zodra er materialen/maten zijn
gekozen — dat is waar de beheerder het vaakst iets moet aanpassen.

### 3. Productkaartje: Formaten weg, Materiaal toont kernproduct

`KunstwerkSpecCard.tsx`:
- De `maatLabels`-prop en de Formaten-`<dd>`/`<dt>`-rij vervallen volledig
  (component-interface + JSX). Beide call sites (`ProductsGrid.tsx`,
  `KunstwerkenSection.tsx` preview) stoppen met het berekenen van
  `maatLabels`/`beschikbareMaten` voor dit doel.
- Vertaalsleutel `kunstwerkSpecCard.formaten` wordt verwijderd uit alle 4
  `messages/*.json`.

Nieuwe gedeelde helper (bijv. `resolveMateriaalCardLabel(kunstwerk,
materialen, materiaalsoorten)`, gebruikt door beide call sites) bepaalt de
tekst voor de Materiaal-rij:
1. Is het 4mm Veiligheidsglas-materiaal (materiaalsoort "Veiligheidsglas",
   `materiaaldikte === 4`) onderdeel van `kunstwerk.materiaalIds`? Toon
   dan altijd **uitsluitend** `"4mm Veiligheidsglas"` (ongeacht welke
   andere materialen ook zijn aangevinkt).
2. Anders, als `kunstwerk.materiaalIds` niet leeg is: bestaande fallback
   — alle beschikbare materiaallabels joinen met `" | "`.
3. Anders (materiaalloos product, zie §5): vaste tekst uit nieuwe
   vertaalsleutel `kunstwerkSpecCard.materiaalloos` (NL: "Akoestische
   stof").

### 4. Bestel-popup: default materiaal = 4mm Veiligheidsglas

`ProductModal.tsx`, init-effect (regel 57-67): in plaats van altijd
`kunstwerk.materiaalIds[0]`, kies het 4mm Veiligheidsglas-materiaal als
dat in `kunstwerk.materiaalIds` zit; anders blijft de bestaande fallback
(`kunstwerk.materiaalIds[0] ?? ''`) staan. Dit dekt automatisch het
materiaalloze Akoestisch-paneel-kunstwerk (leeg `materiaalIds`, zie §5).

### 5. Akoestisch paneel: nieuw materiaalloos producttype

**Datamodel** (`materiaalTypes.ts`): nieuw optioneel veld op `Kunstwerk`:

```ts
prijsPerM2?: number;
```

Alleen relevant/gebruikt wanneer `materiaalIds` leeg is — dat is het
signaal dat dit kunstwerk geen materiaalkeuze heeft en via het
prijs-per-m²-pad besteld wordt. Geen aparte boolean nodig: een normaal
kunstwerk heeft na §1 per definitie altijd minstens één materiaal
aangevinkt, dus een lege `materiaalIds` is ondubbelzinnig.

**Seed** (`materiaalsoortenSeed.ts`): "Akoestische stof" en zijn
materiaal-entry (`materiaaldikte: 0`) worden volledig verwijderd uit
`MATERIAALSOORTEN_SEED` en `MATERIAAL_SEED_BY_SOORT`.

**Bestaande Firestore-data**: de al geseede "Akoestische stof"
materiaalsoort/materiaal-documenten (indien aanwezig in productie) worden
na deploy handmatig verwijderd via de bestaande beheer-CRUD
(`MateriaalsoortenSection.tsx` / `MaterialenSection.tsx`) — geen
kunstwerk mag op dit moment dit materiaal aangevinkt hebben (conceptueel
was het nooit een geldige keuze voor een kunstwerk-print), dus dit is een
kale verwijdering zonder impact op bestaande kunstwerken.

**Nieuw kunstwerk-record "Akoestisch paneel"** (aangemaakt als onderdeel
van deze wijziging, via de normale kunstwerk-CRUD):
- `naam`: "Akoestisch paneel"
- `artiest`, `segmentIds`: leeg
- `materiaalIds`, `maatIds`, `prijzen`: leeg (`[]`)
- `prijsPerM2`: door de beheerder in te vullen na livegang (geen zinvolle
  default te raden)
- `omschrijvingNl`: "Verbetert de akoestiek en geeft een warme, moderne
  uitstraling."
- `omschrijvingEn`/`De`/`Fr`: beste-poging vertaling, door de beheerder
  aan te passen indien gewenst.
- `foto`: placeholder-afbeelding; door de beheerder later te vervangen via
  het beheerscherm.

**Beheer-formulier** (`KunstwerkenSection.tsx`): wanneer `materiaalIds`
leeg is, wordt in plaats van de prijzenmatrix (die materialen × maten
nodig heeft) één invoerveld getoond: **"Prijs per m²"**, gekoppeld aan
`prijsPerM2`. Nieuwe vertaalsleutel `kunstwerkenLabelPrijsPerM2`.

**Bestel-popup** (`ProductModal.tsx`): wanneer `kunstwerk.materiaalIds`
leeg is:
- Geen materiaal-`<select>`, geen maat-`<select>`.
- Direct de bestaande breedte/hoogte-invoervelden tonen (hergebruik van de
  huidige "eigen maat"-inputs), zonder maximum (geen `withinMax`-check —
  er is geen `Materiaalsoort` om een grens aan te ontlenen).
- Live berekende prijs: `(breedte / 100) × (hoogte / 100) × prijsPerM2`,
  afgerond op centen, getoond naast de invoervelden via
  `formatCurrency`.
- `canConfirm`: geldige maat (`customSizeValid`, dezelfde validatie als nu)
  én `prijsPerM2` aanwezig en > 0.
- Bij bevestigen: `addItem({ ..., materiaalId: '', materiaalLabel:
  t('kunstwerkSpecCard.materiaalloos') /* "Akoestische stof" */, maatId:
  '', maatLabel: "<breedte>×<hoogte> cm" + eigen-maat-suffix, breedte,
  hoogte, prijs: berekendBedrag, quantity })` — in tegenstelling tot de
  bestaande eigen-maat-flow (die `prijs: null` gebruikt) heeft dit pad wél
  een prijs, want die is hier automatisch te berekenen.

## Out of scope

- Geen wijziging aan de bestaande "eigen maat"-flow voor
  Veiligheidsglas/Dibond/Acryl (blijft `prijs: null`, handmatige
  offerte).
- Geen generiek "materiaalloos product"-concept voor toekomstige andere
  producttypes — dit is specifiek voor Akoestisch paneel; als er later
  meer van dit type producten komen, kan de aanpak dan alsnog
  gegeneraliseerd worden.
- Geen maximale afmeting voor Akoestisch paneel (geen bound opgegeven).
- Geen wijziging aan hoe bestellingen met een reeds berekende prijs verder
  verwerkt worden (mandje, bestelbevestiging, beheer-orders) — die lezen
  gewoon het al aanwezige `prijs`-veld, ongeacht of dat automatisch of
  handmatig tot stand kwam.
