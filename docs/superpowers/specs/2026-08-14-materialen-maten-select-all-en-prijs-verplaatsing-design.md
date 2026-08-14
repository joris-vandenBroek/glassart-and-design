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
   wordt. Dat veld verhuist van Kunstwerk naar Materiaal.

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

Deze spec verandert **alleen** waar `prijsPerM2` in het tweede pad vandaan komt. De
prijsmatrix en het eerste pad blijven ongewijzigd (expliciet besproken en bevestigd tijdens
brainstorm — de matrix blijft nodig omdat prijs per vaste maat niet altijd zuiver
lineair is).

### Datamodel

Nieuwe migratie `db/migrations/2026-08-14-prijs-per-m2-naar-materiaal.sql`, in één bestand
(zelfde geaccepteerde patroon als `2026-08-11-06-kunstwerk-oude-relatiekolommen-weg.sql` —
kort venster tussen migratie en deploy waarin nog draaiende oude code een kolom mist, wordt
bewust geaccepteerd):

```sql
ALTER TABLE materialen ADD COLUMN prijsPerM2 DECIMAL(10,2);
ALTER TABLE kunstwerken DROP COLUMN prijsPerM2;
```

`materialen.prijsPerM2` is nullable op databaseniveau — bestaande materialen krijgen geen
automatisch overgenomen waarde (per beslissing tijdens brainstorm: geen betrouwbare 1-op-1
mapping mogelijk omdat een kunstwerk aan meerdere materialen gekoppeld kan zijn en elk
kunstwerk nu een eigen prijs had). Jij vult de juiste prijs per materiaal handmatig in via
het beheerscherm ná deze migratie. De UI maakt het veld wel verplicht bij aanmaken/bewerken
van een materiaal (zie hieronder) — alleen de kolom zelf staat leeg toe, voor bestaande rijen
die nog niet bijgewerkt zijn.

`db/schema.sql` wordt bijgewerkt: `prijsPerM2 DECIMAL(10,2)` verhuist van de `kunstwerken`- naar
de `materialen`-tabeldefinitie.

`src/lib/server/tableColumns.ts`: `prijsPerM2` verhuist van de `kunstwerken`-allow-list naar
de `materialen`-allow-list.

`src/components/beheer/materiaalTypes.ts`: `prijsPerM2?: number` verhuist van de `Kunstwerk`-
naar de `Materiaal`-interface.

### UI — Materiaal-formulier

`src/components/beheer/MaterialenSection.tsx`: nieuw veld "Prijs per m²", zelfde patroon als
het bestaande "Dikte"-veld (regel 219-231) — `useState`, meegenomen in `openAdd`/`openEdit`/
`handleSave`'s `data`-object, en toegevoegd aan de `disabled`-conditie van de opslaanknop
(regel 181): leeg of `<= 0` blokkeert opslaan, exact zoals `materiaaldikte` nu al doet. Geen
aparte foutmelding-tekst (zelfde minimale patroon als `materiaaldikte`, dat ook alleen via de
disabled-knop afdwingt — geen precedent in dit bestand voor inline foutteksten per veld).

### UI — Kunstwerk-formulier

`src/components/beheer/KunstwerkenSection.tsx`: het prijsveld en alle bijbehorende code
verdwijnen volledig:

- `LEGE_FORM.prijsPerM2` (regel 67), de `useState` (regel 118).
- De conditionele toevoeging in `buildKunstwerkData()` (regel 311: `isMaatloos ? { ...basis,
  prijsPerM2: Number(prijsPerM2) } : basis` wordt gewoon `basis`).
- `resetForm`'s `setPrijsPerM2` (regel 407) en `openEdit`'s `setPrijsPerM2` (regel 437).
- De prijs-termen in `matenHeeftFout` (regel 513) en `opslaanDisabled` (regel 521) — beide
  verliezen hun `(!prijsPerM2 || Number(prijsPerM2) <= 0)`-clausule; `matenHeeftFout` wordt
  daarmee altijd `false` zolang er geen andere maten-gerelateerde fout bestaat. *(Als
  `matenHeeftFout` na deze wijziging nergens anders dan in `opslaanDisabled` gebruikt wordt,
  mag hij samen met het prijsveld helemaal weg — controleren bij implementatie.)*
- Het hele `{isMaatloos && (...)}`-blok met het invoerveld (regel 1151-1175).

Het `isMaatloos`-concept zelf (regel 253-256) blijft ongewijzigd bestaan — het bepaalt nog
steeds welk prijspad geldt (matrix vs. formule) en stuurt de bestaande matrix-prijsvoorbeeld-
fetch (regel 260-292) aan, die dit ontwerp niet aanraakt.

### Prijsberekening

`berekenBestellijnPrijs` (`src/lib/server/prijsmodule.ts` regel 126-159) krijgt de prijs per
m² als los argument in plaats van via het `kunstwerk`-object:

```ts
export async function berekenBestellijnPrijs(
  db: Queryable,
  kunstwerk: { kunstenaarnr: string | null; maatIds: string[] },
  materiaalPrijsPerM2: number | null,
  line: { maatId: string; materiaalId: string; breedte?: number; hoogte?: number },
  klantId: string | null = null
): Promise<LijnPrijsResultaat>
```

De maatloos-tak (regel 132-142) gebruikt `materiaalPrijsPerM2` in plaats van
`kunstwerk.prijsPerM2`; de rest van de functie (matrix-tak) is ongewijzigd.

Drie aanroeppunten passen hun query aan om de prijs bij het materiaal op te halen (via
`line.materiaalId`, die overal al verplicht aanwezig is) in plaats van bij het kunstwerk:

- `src/lib/server/bestellijnPrijsResolver.ts` (regel 32-38, 72-77): kunstwerk-query verliest
  `prijsPerM2`; nieuwe query `SELECT prijsPerM2 FROM materialen WHERE id = ?` met
  `input.materiaalId`.
- `src/app/api/bestelheaders/route.ts` (regel 87-96, 130-136): zelfde aanpassing, binnen de
  bestaande transactie/loop over `lines`.
- `src/components/ProductModal.tsx` (regel 192-198, 213-218): client-side prijsvoorbeeld
  gebruikt straks `beschikbareMaterialen.find((m) => m.id === materiaalId)?.prijsPerM2` in
  plaats van `kunstwerk.prijsPerM2` (de component heeft `beschikbareMaterialen` en de
  geselecteerde `materiaalId` al in scope).

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
  kunstwerk-prijsveld (`data-testid="kunstwerk-modal-prijs-per-m2"` en gerelateerde
  validatie-tests) verwijderen.
- `tests/lib/server/prijsmodule.test.ts` (of gelijkwaardig): `berekenBestellijnPrijs`-tests
  voor de maatloos-tak aanpassen aan de nieuwe signatuur.
- `tests/lib/server/bestellijnPrijsResolver.test.ts`,
  `tests/app/api/bestelheaders.test.ts`: prijsberekening-tests aanpassen zodat de testdata
  `prijsPerM2` op een materiaal zet in plaats van op een kunstwerk.
- `tests/components/ProductModal.test.tsx`: prijsvoorbeeld-test voor maatloze kunstwerken
  aanpassen aan de nieuwe databron.

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
