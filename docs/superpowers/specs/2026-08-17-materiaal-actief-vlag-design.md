# Actief-vlag op materialen

Datum: 2026-08-17
Status: ontwerp, goedgekeurd voor implementatie

## Aanleiding

De klant begint met één materiaal: 4mm Veiligheidsglas. De vier andere materialen (3mm/5mm/10mm
Acryl, 3mm Dibond) moeten uit het klantbeeld verdwijnen, maar **niet** verwijderd worden — ze
komen later terug, en verwijderen zou bovendien vastlopen op de bestaande verwijderblokkade
zodra er ooit mee besteld is.

Daarom krijgt een materiaal een `actief`-vlag. Is er nog maar één actief materiaal beschikbaar
voor een kunstwerk, dan verdwijnt de materiaal-dropdown in de ProductModal en blijft het
materiaal als tekst zichtbaar.

## Waar de vlag hoort: op `materialen`, niet op `materiaalsoorten`

Besloten tijdens brainstorm, met drie argumenten:

1. Het is het niveau waarop gekozen wordt. De klant kiest een materiaal (label = `dikte + soortnaam`),
   niet een soort; een vlag op soort-niveau moet altijd nog vertaald worden naar "welke materialen
   mag ik tonen".
2. Materiaal-niveau kan alles wat soort-niveau kan, andersom niet. Een hele soort uitzetten is de
   materialen eronder uitvinken; "wel 4mm Veiligheidsglas, niet 8mm" kan alléén op materiaal-niveau.
3. Een soort waarvan geen enkel materiaal actief is, verdwijnt vanzelf uit het klantbeeld. Twee
   vlaggen zouden een tegenstrijdige staat toelaten (soort actief, alle materialen inactief) die
   dan afgevangen moet worden.

## Datamodel

Nieuwe migratie `db/migrations/2026-08-17-materiaal-actief.sql`:

```sql
ALTER TABLE materialen ADD COLUMN actief BOOLEAN NOT NULL DEFAULT TRUE;
```

Alleen een toevoeging met een default, dus geen risicovol venster tussen migratie en deploy: de
huidige code negeert de kolom en alle bestaande materialen komen actief binnen. Het daadwerkelijk
uitzetten van de vier materialen doet de beheerder daarna zelf via het beheerscherm — geen
datamigratie.

Meeliftende aanpassingen:

- `db/schema.sql`: `actief BOOLEAN NOT NULL DEFAULT TRUE` toegevoegd aan de `materialen`-definitie.
- `src/lib/server/tableColumns.ts`: `'actief'` toegevoegd aan de `materialen`-allow-list.
- `src/components/beheer/materiaalTypes.ts`: `actief?: boolean` op de `Materiaal`-interface, plus
  één helper in datzelfde bestand:

```ts
/**
 * `mysql2` geeft een BOOLEAN-kolom terug als 0/1, dus nooit `=== true` vergelijken.
 * Een ontbrekende waarde telt als actief: de kolom is NOT NULL DEFAULT TRUE, dus dat kan
 * alleen bij een testfixture van vóór deze vlag.
 */
export function isMateriaalActief(materiaal: Pick<Materiaal, 'actief'>): boolean {
  return materiaal.actief === undefined ? true : Boolean(materiaal.actief);
}
```

Optioneel in plaats van verplicht, in lijn met `Materiaalsoort.staatEigenMaatToe?` en
`Drukker.standaard?`, die om dezelfde reden optioneel staan. Dat scheelt bovendien het aanpassen van
ruim veertig materiaal-fixtures verspreid over 22 testbestanden, die allemaal een actief materiaal
voorstellen. Alle code die op de vlag filtert gebruikt `isMateriaalActief`, nooit een losse
waarheidstest op `materiaal.actief`.

## API: `materialen` krijgt een eigen route

`materialen` verhuist uit `LOOKUP_RESOURCES` (`src/lib/server/lookupResources.ts`) naar eigen
routebestanden, precies zoals `kunstwerken` dat eerder deed en zoals CLAUDE.md die conventie
beschrijft. Reden: de blokkeerregel hieronder vereist een join over `bestellines` × `bestelheaders`
die niet in een generieke lookup-route thuishoort, en de client zou anders alle bestellingen met
regels moeten ophalen om dezelfde afweging te maken.

Nieuw: `src/app/api/materialen/route.ts` (GET lijst publiek leesbaar, POST medewerker) en
`src/app/api/materialen/[id]/route.ts` (GET, PATCH, DELETE). Gedrag identiek aan de generieke route,
met twee toevoegingen:

- **De bestaande DELETE-blokkade moet mee.** In `src/app/api/[resource]/[id]/route.ts` staat
  `BESTELLING_REFERENCE_COLUMN` met `materialen: 'materiaalId'`: verwijderen is geblokkeerd zodra
  het materiaal in *enige* bestellijn voorkomt, ongeacht status. Die regel wordt overgenomen in de
  nieuwe route; de entry in `BESTELLING_REFERENCE_COLUMN` verdwijnt (`maten` blijft daar staan).
  Wordt dit vergeten, dan valt een bestaande beveiliging stilzwijgend weg.
- **De blokkeerregel op deactiveren** in PATCH (zie hieronder).

`LOOKUP_REFERENCE.materiaalsoorten` in de generieke route blijft ongewijzigd: die query draait tegen
de *tabel* `materialen`, niet tegen de route.

De clientkant verandert niet: `useApiCollection<Materiaal>('materialen')` blijft dezelfde URL's
aanroepen.

### Blokkeerregel bij deactiveren

Een PATCH die `actief` op `false` zet, wordt geweigerd zolang er bestellijnen met dit `materiaalId`
hangen aan een bestelheader met een niet-afgehandelde status:

```sql
SELECT COUNT(*) AS aantal
FROM bestellines bl
JOIN bestelheaders bh ON bh.bestelnr = bl.bestelnr
WHERE bl.materiaalId = ? AND bh.status NOT IN (?, ?)
```

Afgehandeld = `Betaald en afgerond` en `Afgewezen`. Die twee statussen komen uit één nieuwe gedeelde
constante `AFGEHANDELDE_BESTELSTATUSSEN` in `src/lib/bestelStatus.ts`, zodat de lijst niet als
losse string-literals in een routebestand verdwijnt (de statusnamen staan nu alleen als union-type in
`BestellingenSection.tsx` regel 37).

Bij een treffer: HTTP 409 met `{ error: 'in-use-open-bestelling' }`. De controle draait alleen
wanneer de PATCH-body `actief: false` bevat — een naam- of diktewijziging blijft ongehinderd, en
activeren wordt nooit geblokkeerd.

**Let op bij testen op staging:** 3mm Acryl heeft daar een bestellijn in status *Te versturen naar
drukker*. Dat materiaal kan dus pas op inactief zolang die bestelling niet afgerond of afgewezen is —
dat is het bedoelde gedrag, geen bug.

### Bulk-koppelen bij activeren

Nieuw: `POST /api/materialen/[id]/koppel-kunstwerken` (medewerker). Koppelt het materiaal aan elk
kunstwerk **dat al minstens één materiaal heeft**, en slaat kunstwerken over die er nul hebben.

Dat laatste is essentieel: een kunstwerk zonder materialen is bewust materiaalloos (Akoestische stof,
zie `MATERIAALLOOS_LABEL` in `src/lib/kunstwerkMateriaal.ts`) en heeft een eigen prijspad via
`kunstwerken.prijsPerM2`. Zou het hier een materiaal krijgen, dan verandert stilzwijgend zowel zijn
weergave als zijn prijsberekening. Op staging staat op dit moment precies één zo'n kunstwerk.

Implementatie in twee stappen binnen één transactie, in plaats van één `INSERT ... SELECT` op de
koppeltabel zelf:

1. `SELECT k.id, MAX(km.volgorde) AS maxVolgorde FROM kunstwerken k JOIN kunstwerkMaterialen km ON
   km.kunstwerkId = k.id GROUP BY k.id` — de join filtert materiaalloze kunstwerken er meteen uit.
2. Per kunstwerk dat het materiaal nog niet heeft: `INSERT INTO kunstwerkMaterialen (kunstwerkId,
   materiaalId, volgorde) VALUES ...` met `volgorde = maxVolgorde + 1`, als één multi-row insert.

Antwoord: `{ gekoppeld: <aantal nieuwe koppelingen> }`. Al bestaande koppelingen worden overgeslagen,
zodat de actie herhaalbaar is.

## Beheer: MaterialenSection

`src/components/beheer/MaterialenSection.tsx`:

- Extra kolom "Actief" in de `DataTable`, via de bestaande `render`-optie van `Column<T>`, met
  "Ja"/"Nee" als tekst. Geen checkbox in de rij: die zou de rij-klik-naar-bewerken in de weg zitten.
- Checkbox "Actief" in de modal; `openAdd` zet hem standaard aan, `openEdit` neemt de huidige waarde
  over, `handleSave` neemt `actief` mee in het `data`-object.
- Bij een 409 `in-use-open-bestelling` toont het scherm `materialenDeactiverenGeblokkeerd` in plaats
  van de generieke `materialenActionError`. Het mechanisme bestaat al: `useApiCollection` geeft
  `lastMutationErrorCode` terug en `BeheerShell.tsx` reikt dat als `actionErrorCode` door aan
  `KunstwerkenSection` (regel 415). `MaterialenSection` krijgt dezelfde prop en dezelfde behandeling.
  De melding noemt geen aantal — dat zou het foutcode-kanaal moeten verbreden voor een detail dat de
  beheerder ook in het bestellingenscherm kan opzoeken.
- Gaat `actief` bij opslaan van uit naar aan (inclusief een nieuw materiaal dat actief wordt
  aangemaakt), dan verschijnt ná een geslaagde opslag een bevestigingsdialoog, gemodelleerd naar
  `AfrondenBevestigingDialog.tsx`: titel "Materiaal activeren", vraag "Moet dit materiaal actief
  gemaakt worden voor alle kunstwerken?", knoppen "Ja, bij alle kunstwerken" / "Nee, alleen
  activeren" / annuleren. Ja roept het bulk-endpoint aan en ververst daarna de kunstwerken-collectie
  (anders werkt het kunstwerk-formulier verder met verouderde `materiaalIds`). Nee en annuleren doen
  niets extra's — de vlag staat dan al aan, wat het bedoelde resultaat is.
- Activiteitenlog: het bestaande `materiaal_gewijzigd` blijft, ook bij (de)activeren en bulk-koppelen.
  Geen nieuwe logtypes, om `logActiviteit.ts` niet te laten uitdijen voor iets wat al gedekt is.

## Beheer: KunstwerkenSection

`src/components/beheer/KunstwerkenSection.tsx` filtert **niet** op `actief`. Inactieve materialen
blijven in de checkboxlijst staan met "(inactief)" achter het label, en blijven aan- en uitvinkbaar.

Reden: `buildKunstwerkData()` schrijft de volledige `materiaalIds` uit de formulier-state terug. Zou
een inactief materiaal uit de lijst verdwijnen, dan verdwijnt het ook uit die state en wist één keer
opslaan stilzwijgend een bestaande koppeling. Bij de "Alles selecteren"-toggle uit het openstaande
plan van 2026-08-14 zou dat nog harder aankomen: "alles" zou dan "alleen de actieve" betekenen.

## Storefront: ProductModal

`src/components/ProductModal.tsx`:

- `beschikbareMaterialen` (regel 143) filtert er `Boolean(materiaal.actief)` bij.
- Het default-materiaal-effect (regel 98-103) kiest binnen de actieve materialen: eerst 4mm
  Veiligheidsglas als dat actief én gekoppeld is, anders het eerste actieve materiaal. De huidige
  fallback `kunstwerk.materiaalIds[0]` kan namelijk een inactief materiaal opleveren.
- **Eén actief materiaal** → geen `<select>`, maar het label als tekst (`4mm Veiligheidsglas`) met de
  omschrijving eronder, in dezelfde opmaak als de huidige regel onder de dropdown. Het bestaande
  `product-modal-materiaal-omschrijving`-testid blijft daarbij bestaan; de tekstweergave zelf krijgt
  `product-modal-materiaal-tekst`. Het `t('material')`-label blijft erboven staan, dus er zijn geen
  nieuwe vertaalsleutels nodig aan klantzijde.
- **Twee of meer actieve materialen** → ongewijzigd de bestaande dropdown.
- **Nul actieve materialen terwijl het kunstwerk wél materialen heeft** → dit kunstwerk is niet
  bestelbaar en wordt verborgen (zie ProductsGrid hieronder), dus de modal hoeft dit geval niet af
  te vangen.
- **Materiaalloos kunstwerk** (`materiaalIds` leeg) → volledig ongewijzigd: geen materiaalkeuze,
  label "Akoestische stof", gewoon bestelbaar. Deze vlag raakt dat pad niet.

## Storefront: ProductsGrid

`src/components/ProductsGrid.tsx` verbergt kunstwerken die minstens één gekoppeld materiaal hebben
maar waarvan er géén enkele actief is. Kunstwerken zonder materialen blijven zichtbaar — die zijn
materiaalloos, niet onverkoopbaar. Eén filter bij het opbouwen van de zichtbare lijst, waarvoor
`materialen` al beschikbaar is (regel 74). Geen melding aan de klant en dus geen nieuwe teksten in
vier talen; dit is een situatie die alleen ontstaat doordat een beheerder alle materialen van een
kunstwerk uitzet.

## Beheer: BestellingModal

`src/components/beheer/BestellingModal.tsx` regel 1134: de materiaalkeuze voor een **nieuwe** regel
filtert op actief, net als de klantzijde. Een **bestaande** regel met een inactief materiaal blijft
dat materiaal tonen en behouden — anders zou het openen van een oude bestelling de keuze stil op leeg
zetten en bij opslaan de historische regel veranderen. Praktisch: de lijst voor een bestaande regel is
"actieve materialen ∪ het al gekozen materiaal", met "(inactief)" achter dat laatste.

## Wat ongewijzigd blijft

- **Prijsmatrix** (`PrijsmatrixSection.tsx`): alle materialen blijven in de matrix. Prijzen moeten
  ingevuld kunnen worden vóórdat een materiaal geactiveerd wordt, en bestaande prijzen van inactieve
  materialen blijven gewoon bewaard.
- **Prijsberekening** (`prijsmodule.ts`, `bestellijnPrijsResolver.ts`): raakt de vlag niet aan. Een
  bestaande bestelling met een inactief materiaal blijft correct doorrekenen.
- **`resolveKunstwerkMateriaalLabel`** (`src/lib/kunstwerkMateriaal.ts`): niet aangepast — deze functie
  wordt op dit moment nergens in `src/` aangeroepen, alleen in tests.
- **`bestellines`**: geen labelsnapshot nodig. Omdat een materiaal nooit verwijderd wordt maar hooguit
  inactief, blijft het label van een historische regel gewoon resolvebaar.

## Vertalingen

Alleen `messages/nl.json`, beheer-blok (beheer is Nederlandstalig):

- `materialenColActief` — "Actief"
- `materialenLabelActief` — "Actief"
- `materialenDeactiverenGeblokkeerd` — "Dit materiaal kan niet op inactief gezet worden zolang er
  openstaande bestellingen met dit materiaal zijn."
- `materialenActiverenTitel` — "Materiaal activeren"
- `materialenActiverenVraag` — "Moet dit materiaal actief gemaakt worden voor alle kunstwerken?"
- `materialenActiverenAlleKunstwerken` — "Ja, bij alle kunstwerken"
- `materialenActiverenAlleenVlag` — "Nee, alleen activeren"
- `materiaalInactiefSuffix` — "(inactief)", hergebruikt in KunstwerkenSection en BestellingModal

Aan klantzijde geen nieuwe sleutels.

## Tests

- `tests/app/api/materialen.test.ts` (nieuw): CRUD via de eigen route; deactiveren geblokkeerd met
  een open bestelling (409); deactiveren toegestaan als de enige bestelling afgerond of
  afgewezen is; activeren nooit geblokkeerd; DELETE-blokkade bij een bestellijn blijft werken;
  bulk-koppelen koppelt alleen kunstwerken die al materialen hebben, slaat bestaande koppelingen over
  en is herhaalbaar. Scoped opruiming per aangemaakte id in een `finally`, conform CLAUDE.md.
- `tests/app/api/lookup-resources.test.ts`: `materialen`-gevallen eruit (die resource zit niet meer
  in de allow-list) — controleren of het bestand daar nu op leunt.
- `tests/components/ProductModal.test.tsx`: inactief materiaal verschijnt niet in de dropdown; bij één
  actief materiaal is er geen `product-modal-materiaal` maar wel `product-modal-materiaal-tekst` met
  omschrijving, en bestellen werkt met dat materiaal; default-keuze slaat een inactief materiaal over.
  De zestien bestaande assertions op `product-modal-materiaal` draaien op fixtures met meerdere
  materialen en moeten `actief: true` meekrijgen.
- `tests/components/ProductsGrid.test.tsx`: kunstwerk met alleen inactieve materialen is verborgen;
  materiaalloos kunstwerk blijft zichtbaar.
- `tests/components/beheer/MaterialenSection.test.tsx`: Actief-kolom en -checkbox; blokkademelding bij
  foutcode `in-use-open-bestelling`; bevestigingsdialoog verschijnt alleen bij uit→aan; "Ja" roept het bulk-endpoint
  aan, "Nee" niet.
- `tests/components/beheer/BestellingModal.test.tsx`: nieuwe regel toont geen inactief materiaal; een
  bestaande regel met inactief materiaal behoudt en toont het met "(inactief)".
- `tests/components/beheer/KunstwerkenSection.test.tsx`: inactief materiaal staat in de lijst met
  "(inactief)" en blijft na opslaan gekoppeld.
- `tests/components/beheer/materiaalTypes.test.ts` of een bestaande lib-test: `isMateriaalActief`
  geeft `true` bij `undefined` en bij `1`, en `false` bij `0` en `false`.

Bestaande materiaal-fixtures hoeven **niet** aangepast te worden: zonder `actief` gelden ze als
actief. Alleen tests die inactief gedrag aantonen zetten `actief: false` expliciet.

## Handleiding

`src/components/beheer/documentatie/chapters/StamgegevensChapter.tsx`, onderdeel "Materialen": het
Actief-veld beschrijven, wat inactief betekent voor de klantzijde (materiaal verdwijnt uit de keuze;
bij één overgebleven materiaal verdwijnt de keuze helemaal), dat deactiveren geblokkeerd is zolang er
openstaande bestellingen zijn, en wat de vraag "voor alle kunstwerken?" doet bij activeren. Screenshot
van het materialen-scherm opnieuw maken (het scherm krijgt een zichtbare kolom erbij) en de mapping in
`scripts/check-screenshot-freshness.ts` controleren.

## Uitrolvolgorde

1. Migratie op staging (`npm run db:migrate -- staging`), daarna implementeren en deployen naar
   staging; alle materialen staan dan nog actief, dus het klantbeeld verandert niet.
2. Op staging de vier niet-gebruikte materialen deactiveren en de ProductModal controleren (dropdown
   weg, tekst zichtbaar). De open Acryl-bestelling eerst afronden of afwijzen, anders blokkeert de
   regel terecht.
3. Na akkoord: toestemming vragen, migratie op productie, promoten, en daar dezelfde vier materialen
   deactiveren. Productie is nog leeg (geen kunstwerken, geen bestellingen), dus daar blokkeert niets.

## Samenhang met eerder werk (bijgewerkt 2026-08-17)

Twee dingen die tijdens het opstellen van dit ontwerp nog openstonden, zijn inmiddels gemerged en
zitten in de code waar dit plan op voortbouwt:

- `docs/superpowers/plans/2026-08-14-materialen-maten-select-all-en-prijs-verplaatsing.md`:
  `materialen.prijsPerM2` bestaat, `MaterialenSection` heeft een verplicht "Prijs per m²"-veld, en
  `KunstwerkenSection` heeft een "Alles selecteren"-toggle bij Materialen en Maten. Die toggle blijft
  bewust op *alle* materialen werken, ook de inactieve — anders zou hij bestaande koppelingen wissen.
- De rename van `onderwerpen` naar `categorieen` (`db/migrations/2026-08-17-onderwerpen-naar-categorieen.sql`).
  Raakt dit ontwerp niet inhoudelijk, maar wel de namen in `ProductsGrid` (`matchesCategorie`) en
  `ProductModal` (`categorieLabels`).

## Wat dit bewust niet doet

- Geen `actief`-vlag op materiaalsoorten, maten, segmenten, stijlen of onderwerpen — niet gevraagd, en
  elk daarvan heeft zijn eigen afwegingen (een maat uitzetten raakt bijvoorbeeld de prijsmatrix
  anders dan een materiaal).
- Geen filter op actief in de prijsmatrix.
- Geen automatische ontkoppeling van kunstwerken bij deactiveren — de koppelingen blijven staan, zodat
  heractiveren het oude beeld precies terugbrengt.
- Geen melding aan de klant bij een verborgen kunstwerk.
