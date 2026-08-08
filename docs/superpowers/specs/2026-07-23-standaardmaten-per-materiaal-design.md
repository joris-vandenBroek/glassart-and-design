# Standaardmaten per materiaal + eigen maat opgeven — Design

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 23-07-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

## Achtergrond

De klant heeft de echte standaardmaten voor veiligheidsglas, plexi (Acryl) en Dibond aangeleverd:

> 30/30 50/50 50/70 50/100 60/80 80/80 80/120 100/100 120/120 120/180 100/150 (alles in cm)

Regels:
- Deze 11 maten gelden voor alle drie de materiaalsoorten.
- Voor **plexi (Acryl) en Dibond** kan de klant zelf een afwijkende maat opgeven, tot 200×300 cm — geen extra levertijd, want deze materialen worden op maat gezaagd.
- Voor **veiligheidsglas** zijn andere maten dan de standaardlijst ook mogelijk, zonder maximum, maar met een levertijd van minimaal 3 maanden.

Vandaag is er geen concept van "eigen maat" of levertijd in de code: `maten` is één platte, globale lijst (`{breedte, hoogte}`) die per kunstwerk wordt gekoppeld via `maatIds`, met een vaste prijs per (materiaal × maat)-combinatie in `kunstwerk.prijzen`. Er is geen prijsformule voor niet-standaardmaten.

**Prijs bij afwijkende maat**: op aanvraag/handmatig — de bestelling komt zonder vaste prijs binnen, de beheerder vult de prijs later zelf in bij het beoordelen van de bestelling.

## 1. Datamodel

### `Materiaalsoort` (src/components/beheer/materiaalTypes.ts)

Nieuwe optionele velden:

```ts
export interface Materiaalsoort {
  id: string;
  omschrijving: string;
  staatEigenMaatToe?: boolean;
  maxBreedte?: number;                // cm; undefined = geen bovengrens
  maxHoogte?: number;                 // cm
  levertijdMaandenEigenMaat?: number; // maanden; > 0 toont een levertijd-waarschuwing
}
```

Waarden voor de 3 bestaande materiaalsoort-documenten in productie:

| Materiaalsoort   | staatEigenMaatToe | maxBreedte | maxHoogte | levertijdMaandenEigenMaat |
|------------------|-------------------|------------|-----------|---------------------------|
| Veiligheidsglas  | true              | —          | —         | 3                         |
| Dibond           | true              | 200        | 300       | 0                         |
| Acryl            | true              | 200        | 300       | 0                         |
| Akoestische stof | (ongewijzigd)     | —          | —         | —                         |

Validatie van een opgegeven maat tegen `maxBreedte`/`maxHoogte`: de kleinste van de twee opgegeven afmetingen moet ≤ `maxBreedte` zijn en de grootste ≤ `maxHoogte` (zo werkt het ongeacht oriëntatie).

### `Maat` — geen structuurwijziging

De 11 echte standaardmaten worden als losse `Maat`-documenten geseed (breedte × hoogte, cm), naast wat er al staat. `MATEN_SEED` in `src/data/kunstwerkenSeed.ts` (nu 3 placeholder-maten) wordt bijgewerkt naar deze 11 maten, zodat nieuwe/lege omgevingen ook de echte lijst krijgen.

### `CartItem` (src/lib/useCart.tsx) en bestellines

```ts
export interface CartItem {
  // ...bestaande velden...
  maatId: string;        // '' wanneer een eigen maat is opgegeven
  maatLabel: string;     // bv. "90×140 cm (eigen maat)"
  breedte?: number;       // alleen gezet bij eigen maat
  hoogte?: number;
  prijs: number | null;   // null = "prijs op aanvraag"
}
```

`makeItemId` krijgt een variant voor eigen-maat-regels zodat identieke custom maten niet per ongeluk samengevoegd worden met een andere regel (bv. `${kunstwerkId}__${materiaalId}__custom__${breedte}x${hoogte}`).

Dezelfde velden (`breedte`, `hoogte`, `prijs: number | null`) komen op de `bestellines`-subcollectie documenten.

## 2. Bestel-popup (ProductModal.tsx)

- Wanneer het gekozen materiaal een `Materiaalsoort` heeft met `staatEigenMaatToe`, krijgt de maat-`<select>` een extra optie **"Eigen maat opgeven"**.
- Kiest de klant deze optie, dan verschijnen twee number-inputs (breedte, hoogte in cm) in plaats van de dropdown.
- Live validatie tegen `maxBreedte`/`maxHoogte` (zie regel hierboven) — bij overschrijding een foutmelding inline en de bevestigknop uitgeschakeld.
- Is `levertijdMaandenEigenMaat > 0`, dan verschijnt een gele melding: *"Let op: bij deze maat is de levertijd minimaal {n} maanden."*
- De prijsweergave wisselt naar **"Prijs op aanvraag"**. De bevestigknop blijft bruikbaar zodra breedte/hoogte geldige positieve getallen binnen de grenzen zijn — er is geen prijs-matrix-lookup nodig voor eigen-maat-regels.
- Terugschakelen naar een standaardmaat herstelt het normale dropdown- en vaste-prijsgedrag.

## 3. Winkelmand, bestellen & beheerder-beoordeling

- **CartPanel**: het totaalbedrag telt alleen geprijsde (niet-custom) regels op. Zitten er eigen-maat-regels in de mand, dan verschijnt eronder een extra regel: *"+ 1 artikel, prijs volgt na offerte"* (aantal dynamisch).
- **AccountOrderModal** (klant-orderhistorie): toont "Prijs op aanvraag" in plaats van een bedrag voor ongeprijsde regels.
- **BestellingModal** (beheerder-beoordeling): een regel met `prijs === null` toont "Prijs op aanvraag" plus een inline number-input en een knop "Prijs vaststellen" die de prijs direct op dat bestelline-document zet. De knop **"Goedkeuren"** is uitgeschakeld zolang er nog een regel zonder prijs in de bestelling zit, met een korte toelichting waarom.
- **Weergave van eigen maat**: overal waar vandaag `maat.breedte × maat.hoogte` getoond wordt (BestellingModal, AccountOrderModal, CartPanel), valt de code terug op `item.breedte × item.hoogte` wanneer `maatId` leeg is.

## 4. Productie-data

`maten` en `materiaalsoorten` zijn al gevulde collecties in productie (het seed-bij-leeg-mechanisme raakt ze niet meer aan). Een eenmalig script (via de al-geauthenticeerde firebase-tools/admin-toegang) zal:
1. De 11 echte `Maat`-documenten toevoegen, met een check op bestaande breedte×hoogte-combinaties om duplicaten te voorkomen.
2. De 3 bestaande `Materiaalsoort`-documenten (Veiligheidsglas, Dibond, Acryl) bijwerken met de nieuwe velden uit de tabel in sectie 1.

Daarna blijft het aan de beheerder om per kunstwerk in **Kunstwerken beheer** de gewenste nieuwe maten aan te vinken en de prijsmatrix in te vullen — dat is een prijsbeslissing, geen automatiseerbare stap.

**Admin-UI voor de nieuwe Materiaalsoort-velden**: `MateriaalsoortenSection.tsx` krijgt in het bewerk-formulier een checkbox ("staat eigen maat toe") en, wanneer aangevinkt, twee optionele max-afmeting-velden en een levertijd-in-maanden-veld, zodat deze instellingen ook via de beheeromgeving aanpasbaar zijn (niet alleen via het eenmalige script).

## 5. Activiteitenlog

Twee nieuwe events, consistent met bestaande naamgeving (`mandje_toegevoegd`, `bestelling_goedgekeurd`, ...):
- Klant kiest een eigen maat en voegt toe aan de mand → nieuw event (bv. `mandje_eigen_maat_toegevoegd`), gelogd op dezelfde plek als `mandje_toegevoegd` in ProductModal.tsx.
- Beheerder stelt een offerteprijs vast voor een eigen-maat-regel → nieuw event (bv. `bestelling_prijs_vastgesteld`), gelogd in BestellingModal.tsx.

## Buiten scope

- Geen automatische prijsformule (bv. per m²) voor eigen maten — expliciete keuze van de klant voor handmatige/offerte-prijzen.
- Geen bovengrens voor veiligheidsglas — alleen de levertijd-waarschuwing.
- `Akoestische stof` blijft ongewijzigd.
