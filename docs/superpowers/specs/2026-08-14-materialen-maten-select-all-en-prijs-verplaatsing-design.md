# Kunstwerk-formulier: select-all voor Materialen/Maten, en prijs per m² naar Materiaal

Datum: 2026-08-14
Status: ontwerp, goedgekeurd voor implementatie

## Aanleiding

Twee losstaande, kleine wijzigingen op hetzelfde scherm (kunstwerk aanmaken/bewerken,
`src/components/beheer/KunstwerkenSection.tsx`), in één sessie bedacht en daarom in één
spec:

1. Bij het aanvinken van Materialen en Maten moet je nu elk item los aanklikken. Een
   select-all/deselect-all-toggle bespaart klikwerk, vooral bij Materialen (vaak "alles
   behalve één").
2. "Prijs per m²" hoort bij het materiaal, niet bij het kunstwerk — glas van hetzelfde type
   en dezelfde dikte kost overal hetzelfde per m², ongeacht welk kunstwerk erop gedrukt
   wordt. Dat veld verhuist van Kunstwerk naar Materiaal voor elk kunstwerk dat materialen
   heeft; voor materiaalloze kunstwerken (producten zonder glas/materiaal, zie Deel B) blijft
   het op het kunstwerk staan, bij gebrek aan een materiaal om het aan te hangen.

Deze twee wijzigingen raken deels dezelfde tab (`materialen`) maar zijn onafhankelijk van
elkaar te implementeren en te reviewen.

## Deel A — Select-all toggle bij Materialen en Maten

### UI

Boven elke checkbox-lijst (Materialen-tab, regel ~1106 e.v.; Maten-tab, regel ~1125 e.v.)
komt één tekstlink die wisselt tussen twee teksten, afhankelijk van de huidige selectie:

- Niet alles geselecteerd → "Alles selecteren"; klikken selecteert alles.
- Alles geselecteerd → "Alles deselecteren"; klikken deselecteert alles.

Voor Maten telt alleen mee wat niet `incompatibel` is met het gekozen `formaat` (bestaande
berekening, regel ~1129) — de toggle laat incompatibele maten links liggen: "alles
geselecteerd" betekent "alle *compatibele* maten geselecteerd", en de toggle zet nooit een
incompatibele maat aan.

### Implementatie

Eén generieke helper naast de bestaande `toggle()` (regel 51-53):

```ts
function alleGeselecteerd(alleIds: string[], huidigeIds: string[]): boolean {
  return alleIds.length > 0 && alleIds.every((id) => huidigeIds.includes(id));
}
```

Materialen-tab: `alleIds = (materialen ?? []).map((m) => m.id)`, toggle-handler zet
`setMateriaalIds(alleGeselecteerd(alleIds, materiaalIds) ? [] : alleIds)`.

Maten-tab: `alleIds` = alleen de niet-`incompatibel` maten uit de bestaande `.map()`-loop
(dezelfde `incompatibel`-berekening die er al staat, verzameld in een array vóór de render
in plaats van per item herberekend). Toggle-handler zet
`setMaatIds(alleGeselecteerd(alleIds, maatIds) ? [] : alleIds)`.

### Vertalingen

`messages/nl.json`, beheer-blok, naast `kunstwerkenLabelMaterialen`/`kunstwerkenLabelMaten`:

- `kunstwerkenAllesSelecteren` — "Alles selecteren"
- `kunstwerkenAllesDeselecteren` — "Alles deselecteren"

Eén sleutelpaar, hergebruikt voor beide tabs (geen inhoudelijk verschil tussen "alles" bij
Materialen en bij Maten).

### Tests

`tests/components/beheer/KunstwerkenSection.test.tsx` uitbreiden:

- Materialen-tab: alles leeg → link toont "Alles selecteren", klik selecteert alle
  materialen, link toont nu "Alles deselecteren", klik deselecteert weer alles.
- Maten-tab: met een `formaat` dat een deel van de maten incompatibel maakt — "Alles
  selecteren" selecteert alleen de compatibele maten; met alle compatibele maten al
  aangevinkt toont de link "Alles deselecteren" (ook al staan de incompatibele maten
  vanzelfsprekend uit).

### Wat dit bewust niet doet

- Geen indeterminate/checkbox-master-toggle — bewust gekozen voor een simpele wisselende
  tekstlink (zie brainstorm).
- Geen wijziging aan Segmenten/Stijlen/Onderwerpen — die zijn niet gevraagd en hebben een
  ander doel (inline "nieuw toevoegen" naast de lijst); een aparte wens voor die tabs is een
  apart verzoek.

## Deel B — Prijs per m² van Kunstwerk naar Materiaal

### Huidige situatie (voor context)

Prijsberekening kent twee onafhankelijke paden (`berekenBestellijnPrijs`,
`src/lib/server/prijsmodule.ts` regel 126-159):

- **Kunstwerk met vaste maten**: prijs komt uit de `prijsmatrix`-tabel (expliciete prijs per
  maatId×materiaalId-combinatie, door de beheerder ingevuld — geen formule, staat toe dat
  prijs niet lineair met oppervlakte meeschaalt).
- **Maatloos kunstwerk** (`kunstwerk.maatIds.length === 0`, klant/medewerker voert zelf
  breedte/hoogte in): prijs = `(breedte/100) × (hoogte/100) × kunstwerk.prijsPerM2`.

Deze spec verandert **alleen** waar `prijsPerM2` in het tweede pad vandaan komt, en alleen
voor kunstwerken die minstens één materiaal hebben. De prijsmatrix en het eerste pad blijven
ongewijzigd (expliciet besproken en bevestigd tijdens brainstorm — de matrix blijft nodig
omdat prijs per vaste maat niet altijd zuiver lineair is).

**Correctie op het eerste ontwerp (tijdens uitwerking ontdekt):** er bestaat een derde,
onafhankelijke categorie — een "materiaalloos" kunstwerk (`materiaalIds.length === 0`, zie
`src/lib/kunstwerkMateriaal.ts`, `MATERIAALLOOS_LABEL = 'Akoestische stof'`) — een kunstwerk
zonder één gekoppeld materiaal, voor niet-glasproducten. Zo'n kunstwerk heeft geen materiaal
om een prijs per m² aan te hangen. Daarom blijft `kunstwerken.prijsPerM2` bestaan en wordt
alleen genegeerd zodra een kunstwerk wél materialen heeft:

- **Materiaalloos** (`materiaalIds.length === 0`) → prijs blijft komen van
  `kunstwerken.prijsPerM2`, exact zoals vandaag.
- **Heeft materialen, maar geen vaste maten** ("maatloos-met-materiaal", bv. "4mm
  veiligheidsglas per m²") → prijs komt voortaan van het bij de bestelling gekozen
  materiaal zijn prijs per m², niet meer van het kunstwerk.
- **Heeft materialen én vaste maten** → ongewijzigd, matrixprijs.

Bestaande kunstwerken die vandaag `prijsPerM2` gebruiken terwijl ze wél materialen hebben,
verliezen daarmee hun werkende prijsbron totdat jij de prijs op het/de betreffende
materia(a)l(en) invult — die kunstwerk-rijen zelf hoeven niet aangepast te worden, hun
bestaande `prijsPerM2`-waarde wordt gewoon niet meer gelezen.

### Datamodel

Nieuwe migratie `db/migrations/2026-08-14-prijs-per-m2-materiaal.sql` — alleen een toevoeging,
geen drop, dus geen risicovol venster tussen migratie en deploy nodig:

```sql
ALTER TABLE materialen ADD COLUMN prijsPerM2 DECIMAL(10,2);
```

`materialen.prijsPerM2` is nullable op databaseniveau — bestaande materialen krijgen geen
automatisch overgenomen waarde (per beslissing tijdens brainstorm: geen betrouwbare 1-op-1
mapping mogelijk omdat een kunstwerk aan meerdere materialen gekoppeld kan zijn en elk
kunstwerk nu een eigen prijs had). Jij vult de juiste prijs per materiaal handmatig in via
het beheerscherm ná deze migratie. De UI maakt het veld wel verplicht bij aanmaken/bewerken
van een materiaal (zie hieronder) — alleen de kolom zelf staat leeg toe, voor bestaande rijen
die nog niet bijgewerkt zijn. `kunstwerken.prijsPerM2` blijft ongewijzigd bestaan.

`db/schema.sql` wordt bijgewerkt: `prijsPerM2 DECIMAL(10,2)` toegevoegd aan de
`materialen`-tabeldefinitie; de kolom op `kunstwerken` blijft staan.

`src/lib/server/tableColumns.ts`: `prijsPerM2` toegevoegd aan de `materialen`-allow-list; blijft
ook op de `kunstwerken`-allow-list staan.

`src/components/beheer/materiaalTypes.ts`: `prijsPerM2?: number` toegevoegd aan de `Materiaal`-
interface; blijft ook op de `Kunstwerk`-interface staan.

### UI — Materiaal-formulier

`src/components/beheer/MaterialenSection.tsx`: nieuw veld "Prijs per m²", zelfde patroon als
het bestaande "Dikte"-veld (regel 219-231) — `useState`, meegenomen in `openAdd`/`openEdit`/
`handleSave`'s `data`-object, en toegevoegd aan de `disabled`-conditie van de opslaanknop
(regel 181): leeg of `<= 0` blokkeert opslaan, exact zoals `materiaaldikte` nu al doet. Geen
aparte foutmelding-tekst (zelfde minimale patroon als `materiaaldikte`, dat ook alleen via de
disabled-knop afdwingt — geen precedent in dit bestand voor inline foutteksten per veld).

### UI — Kunstwerk-formulier

`src/components/beheer/KunstwerkenSection.tsx`: het bestaande prijsveld blijft bestaan maar
wisselt van conditie: nu gekoppeld aan `isMaatloos` (regel 256: materiaalloos ÓF geen maten),
straks gekoppeld aan `isMateriaalloos` (regel 253: alleen "geen enkel materiaal gekoppeld").
Concreet, overal waar de bestaande code `isMaatloos` gebruikt voor dit veld, wordt dat
`isMateriaalloos`:

- Het invoerveld-blok, huidige conditie `{isMaatloos && (...)}` (regel 1151), wordt
  `{isMateriaalloos && (...)}`.
- `matenHeeftFout` (regel 513) en de prijs-clausule in `opslaanDisabled` (regel 521):
  `isMaatloos && (!prijsPerM2 || ...)` wordt `isMateriaalloos && (!prijsPerM2 || ...)`.
- `buildKunstwerkData()` (regel 311): `isMaatloos ? { ...basis, prijsPerM2: ... } : basis`
  wordt `isMateriaalloos ? { ...basis, prijsPerM2: ... } : basis`.

`LEGE_FORM.prijsPerM2`, de `useState` (regel 118), `resetForm`'s en `openEdit`'s
`setPrijsPerM2` (regel 407, 437) blijven ongewijzigd — alleen de zichtbaarheids-/
verplichtingsconditie verandert. Een kunstwerk met materialen maar zonder vaste maten
("maatloos-met-materiaal", bv. "4mm veiligheidsglas per m²") toont dit veld dus niet meer —
de prijs komt voortaan van het gekozen materiaal, zie hieronder.

Het `isMaatloos`-concept (regel 256) blijft ongewijzigd bestaan voor zijn andere rol: bepalen
welk prijspad geldt (matrix vs. formule) en de bestaande matrix-prijsvoorbeeld-fetch (regel
260-292) aansturen, die dit ontwerp niet aanraakt.

### Prijsberekening

`berekenBestellijnPrijs` (`src/lib/server/prijsmodule.ts` regel 126-159) blijft **ongewijzigd**
qua signatuur — hij neemt nog steeds één `prijsPerM2: number | null` mee in het
`kunstwerk`-object. Wat verandert is welke waarde de aanroeper daar invult: bij een
materiaalloos kunstwerk blijft dat `kunstwerken.prijsPerM2`; zodra het kunstwerk materialen
heeft, wordt het de `prijsPerM2` van het bij de bestelling gekozen materiaal (via
`materiaalId`, die overal al verplicht aanwezig is zodra `materiaalIds.length > 0`).

Drie aanroeppunten passen hun prijs-lookup aan met dezelfde precedentieregel:

- `src/lib/server/bestellijnPrijsResolver.ts` (regel 32-38, 72-77): na het ophalen van
  `materiaalIds` (regel 54), als die niet leeg is, een extra query
  `SELECT prijsPerM2 FROM materialen WHERE id = ?` met `input.materiaalId` en die waarde
  gebruiken in plaats van `kunstwerk.prijsPerM2`; blijft leeg (`materiaalIds.length === 0`),
  dan ongewijzigd de kunstwerk-kolom gebruiken.
- `src/app/api/bestelheaders/route.ts` (regel 87-96, 130-136): zelfde precedentieregel, binnen
  de bestaande transactie/loop over `lines`, ná de bestaande `haalRelatiesOpVoorEen`-call
  (regel 102) die `materiaalIds` al ophaalt.
- `src/components/ProductModal.tsx` (regel 192-198, 213-218): client-side prijsvoorbeeld
  gebruikt `isMateriaalloos ? kunstwerk.prijsPerM2 : geselecteerdMateriaal?.prijsPerM2` (de
  component heeft `geselecteerdMateriaal` — regel 153, `beschikbareMaterialen.find(...)` — en
  `isMateriaalloos` — regel 158 — al in scope).

### Gebruikershandleiding

`src/components/beheer/documentatie/chapters/`: het hoofdstuk over materialen krijgt een zin
over het nieuwe verplichte prijsveld; het hoofdstuk over kunstwerk aanmaken verliest de
vermelding van het prijsveld bij maatloze kunstwerken (of wordt herschreven om te verwijzen
naar het materiaal-scherm). Beide betrokken schermen wijzigen zichtbaar, dus hun screenshots
(zie `tests/components/beheer/documentatie/chapterScreenshots.test.tsx` voor de mapping)
moeten opnieuw gemaakt worden.

### Tests

- `tests/components/beheer/MaterialenSection.test.tsx`: nieuw veld toevoegen/bewerken,
  opslaanknop disabled bij leeg/`0`/negatief, waarde persisteert bij bewerken.
- `tests/components/beheer/KunstwerkenSection.test.tsx`: bestaande tests voor het
  kunstwerk-prijsveld (`data-testid="kunstwerk-modal-prijs-per-m2"`) blijven grotendeels
  bestaan maar testen voortaan de materiaalloze situatie (0 materialen); een test toevoegen
  die bevestigt dat het veld **niet** verschijnt zodra er wél een materiaal gekoppeld is (ook
  als er geen maten gekozen zijn).
- `tests/lib/server/prijsmodule.test.ts`: geen wijziging nodig — `berekenBestellijnPrijs`
  blijft ongewijzigd, dus deze tests blijven ongewijzigd.
- `tests/app/api/bestelheaders-prijsvoorbeeld.test.ts`, `tests/app/api/bestelheaders.test.ts`:
  bestaande materiaalloze prijs-tests (`prijsPerM2` op de kunstwerk-fixture, bv.
  `maakKunstwerk(..., prijsPerM2)` resp. `insertRow('kunstwerken', {..., prijsPerM2: 100})`)
  blijven ongewijzigd correct. Nieuwe tests toevoegen voor een kunstwerk mét materiaal en
  zonder maten waarbij de prijs van het materiaal komt (materiaal aangemaakt met een
  `prijsPerM2`, kunstwerk gekoppeld zonder maten) — en dat een `prijsPerM2` op het kunstwerk
  zelf in die situatie genegeerd wordt.
- `tests/components/ProductModal.test.tsx`: de fixture `MAATLOOS_MET_MATERIAAL_KUNSTWERK`
  (regel 70-83, `materiaalIds: ['mat-1']`, `prijsPerM2: 65` op het kunstwerk) verliest zijn
  kunstwerk-`prijsPerM2`; in plaats daarvan krijgt `MATERIALEN[0]` (`mat-1`, regel 42) een
  `prijsPerM2: 65`. De bestaande tests rond deze fixture (regel 895-919, prijsberekening en
  toevoegen-aan-winkelwagen) blijven verder ongewijzigd — ze verwachten dezelfde bedragen,
  nu via de andere databron. `MATERIAALLOOS_KUNSTWERK` (regel 56-69, `prijsPerM2: 180` op het
  kunstwerk zelf) blijft ongewijzigd, want dat is precies het pad dat kunstwerk-niveau
  behoudt.

Alle bovenstaande testbestanden zijn gebaseerd op de huidige structuur en moeten bij
implementatie geverifieerd worden op exacte paden/namen — dit is geen uitputtende grep,
alleen de bekende call sites uit de verkenning.

### Wat dit ontwerp bewust niet doet

- Geen wijziging aan de prijsmatrix, prijsgroepen, of het matrix-prijspad — expliciet
  bevestigd tijdens brainstorm.
- Geen automatische migratie van bestaande kunstwerk-prijzen naar materialen — bewuste keuze
  voor handmatige herinvoer omdat er geen eenduidige 1-op-1 mapping bestaat.
- Geen wijziging aan het bestelproces zelf — `materiaalId` is al onderdeel van elke
  bestellijn, dus de klant/medewerker koos het materiaal al vóór deze wijziging.
- Geen verwijdering van `kunstwerken.prijsPerM2` — die blijft nodig voor materiaalloze
  kunstwerken (zie hierboven), dus geen migratie-drop en geen wijziging aan
  `berekenBestellijnPrijs`'s signatuur.
