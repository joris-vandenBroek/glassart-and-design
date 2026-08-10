# Afwijsreden-bevestiging voor klanten en bestellingen — ontwerp

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 10-08-2026 is
> vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt
> bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

Datum: 2026-08-10
Status: ontwerp, goedgekeurd voor implementatie

## Aanleiding

`KlantModal` en `BestellingModal` hebben allebei een "Afwijzen"-knop die meteen en zonder
vragen `PATCH { status: 'Afgewezen' }` verstuurt (`handleAfwijzen` in beide bestanden). Er is
geen bevestiging en geen manier om vast te leggen *waarom* een klant of bestelling is
afgewezen — dat verdwijnt nu in een losse regel activiteitenlog zonder reden.

Gevraagd: een bevestigingspopup bij het afwijzen, met een verplicht redenveld, en die reden
opgeslagen bij de klant respectievelijk de bestelling.

## Uitgangssituatie in de code

Beide `handleAfwijzen`-functies hebben dezelfde vorm: `PATCH /api/{resource}/{id}` met
`{ status: 'Afgewezen' }`, dan `logActiviteit(...)`, dan `onUpdated(...)`. Geen bevestiging,
geen blokkade — de knop is in `KlantModal` altijd zichtbaar buiten bewerkmodus, in
`BestellingModal` alleen bij status `'Te beoordelen'`.

Geen van beide tabellen heeft een kolom voor een afwijsreden. `TABLE_COLUMNS`
(`src/lib/server/tableColumns.ts`) is de allow-list die bepaalt welke velden `insertRow`/
`updateRow` mag schrijven — een nieuwe kolom moet daar expliciet bij, anders gooit de laag
een fout in plaats van de kolom stilzwijgend te negeren.

Er bestaat al een bevestigingspatroon in deze codebase, vastgelegd in
[`2026-08-10-verwijderbevestiging-design.md`](2026-08-10-verwijderbevestiging-design.md): bij
het verwijderen van een record binnen een modal wisselt de modal zijn eigen inhoud en
`footerActions` om naar een bevestigingsweergave, in plaats van een tweede `Modal` erbovenop
te openen. Die keuze staat er niet toevallig: `KlantModal` en `BestellingModal` zíjn zelf al
een `<Modal>` (`src/components/Modal.tsx`, `createPortal` met vast `data-testid="modal"` en
een eigen `useOverlayDismiss`). Een los `AfwijzenBevestigingDialog`-component dat zelf ook een
`<Modal>` rendert, zou dus **genest** worden geopend — twee gelijktijdige modals met
hetzelfde testid, die allebei onafhankelijk op Escape reageren. Dat probleem is in het
verwijder-ontwerp al onderkend en bewust vermeden (`AfrondenBevestigingDialog` is daar expliciet
als verworpen alternatief genoemd, om precies deze reden). Dit ontwerp volgt daarom hetzelfde
in-place-wisselpatroon, niet het `AfrondenBevestigingDialog`-patroon.

## Beslissingen

1. **Eén kolom `afwijsreden` op zowel `klanten` als `bestelheaders`.** Overschreven bij een
   volgende afwijzing. Geen aparte historietabel voor klanten (die bestaat niet en dit ontwerp
   voegt er geen toe) en geen redenkolom op `bestelstatusHistorie` — dat zou impliceren dat een
   bestelling meerdere keren afgewezen kan worden met elk een eigen bewaarde reden, wat buiten
   de vraag valt.
2. **In-place bevestiging binnen dezelfde modal**, zoals hierboven toegelicht — geen nieuw
   dialoogcomponent bovenop `Modal`.
3. **De reden is verplicht.** De bevestigingsknop blijft uitgeschakeld zolang het (getrimde)
   redenveld leeg is; er is geen manier om af te wijzen zonder reden in te vullen.
4. **Alleen zichtbaar in beheer.** De opgeslagen reden wordt getoond in `KlantModal` en
   `BestellingModal` wanneer de status `Afgewezen` is, en nergens anders — niet op de
   klant-facing site, niet in een e-mail. Dit is staff-only informatie.
5. **Alleen `messages/nl.json`.** Beheer leeft alleen in het Nederlands; geen sleutels in
   `en/de/fr`.
6. **De reden komt ook in het activiteitenlog terecht**, als onderdeel van de bestaande
   `omschrijving`-tekst bij `klant_afgewezen`/`bestelling_afgewezen`. Geen nieuw
   activiteittype, geen structuurwijziging van `activiteitenlog` — de reden is gewoon
   onderdeel van de vrije tekst die daar al in staat.
7. **Bestaande statushistorie-schrijfpad blijft ongewijzigd.** `bestelstatusHistorie` krijgt
   nog steeds een regel bij de statuswissel naar `Afgewezen` (bestaand gedrag in
   `src/app/api/bestelheaders/[id]/route.ts`), alleen zonder reden — zie punt 1.

## A. Database

Nieuwe migratie `db/migrations/2026-08-10-afwijsreden.sql`, naar het patroon van
`2026-08-10-kunstenaar-website.sql`:

```sql
ALTER TABLE klanten ADD COLUMN afwijsreden TEXT NULL;
ALTER TABLE bestelheaders ADD COLUMN afwijsreden TEXT NULL;
```

`db/schema.sql` krijgt dezelfde kolom op beide tabellen. `TABLE_COLUMNS` in
`src/lib/server/tableColumns.ts` krijgt `'afwijsreden'` toegevoegd aan zowel de `klanten`- als
de `bestelheaders`-array.

## B. Gedeelde module voor de bevestiging

Nieuw bestand `src/components/beheer/afwijzenBevestiging.tsx`, met dezelfde
verantwoordelijkheidsverdeling als `verwijderBevestiging.tsx` uit het verwijder-ontwerp, maar
met een tekstveld in plaats van alleen een label:

```ts
export interface AfwijzenBevestiging {
  /** True zodra de bevestiging open staat. */
  open: boolean;
  /** De ingevoerde reden, leeg bij het openen. */
  reden: string;
  vraag: () => void;
  wijzigReden: (reden: string) => void;
  annuleer: () => void;
}

export function useAfwijzenBevestiging(): AfwijzenBevestiging;
```

Twee presentatiehelpers in hetzelfde bestand, die hun teksten zelf uit
`useTranslations('beheer')` halen:

```tsx
export function AfwijzenBevestigingTekst(props: {
  item: string;
  reden: string;
  onWijzigReden: (reden: string) => void;
  testId: string;
}): JSX.Element;

export function AfwijzenBevestigingActies(props: {
  reden: string;
  onBevestig: () => void;
  onAnnuleer: () => void;
  /** Enkelvoudsvorm van de sectie, bijvoorbeeld `klant` — bepaalt de testids. */
  testIdPrefix: string;
  isBezig?: boolean;
}): JSX.Element;
```

`AfwijzenBevestigingActies` schakelt de bevestigingsknop uit zolang `reden.trim()` leeg is, of
zolang `isBezig` waar is.

## C. Verloop in `KlantModal` en `BestellingModal`

Beide volgen hetzelfde patroon:

1. Klik op de bestaande "Afwijzen"-knop roept nu `bevestiging.vraag()` aan in plaats van
   direct `handleAfwijzen()`.
2. De modalinhoud wisselt om naar `AfwijzenBevestigingTekst` (item-label + redenveld), de
   `footerActions` naar `AfwijzenBevestigingActies`. De normale weergave blijft met `hidden` in
   de DOM staan, gelijk aan de conventie uit het verwijder-ontwerp — hier is dat vooral
   toekomstbestendig, aangezien Afwijzen alleen buiten bewerkmodus getoond wordt en er dus geen
   ingevulde formulierstaat te verliezen is.
3. *Ja, afwijzen* roept de bestaande `handleAfwijzen`, nu met de reden als parameter:
   `PATCH { status: 'Afgewezen', afwijsreden: reden }`, dan `logActiviteit(...)` met de reden
   verwerkt in de omschrijving, dan `onUpdated({ ...record, status: 'Afgewezen', afwijsreden: reden })`,
   dan sluit de bevestiging (`annuleer()`).
4. *Annuleren* roept `bevestiging.annuleer()` — geen PATCH, terug naar de normale weergave met
   de oorspronkelijke knoppen.
5. `onClose` van de modal ruimt de bevestiging ook op, zodat een volgend record nooit met een
   openstaande bevestiging of ingevulde reden opent.

## D. Reden tonen

Wanneer `klant.status === 'Afgewezen'` respectievelijk `bestelling.status === 'Afgewezen'` en
`afwijsreden` niet leeg is, toont de modal de reden als tekstblok direct onder de statusbadge
(`klant-modal-status` / `bestelling-modal-status`), met testid `klant-modal-afwijsreden` /
`bestelling-modal-afwijsreden`.

## Vertalingen

Alleen `messages/nl.json`, `beheer`-blok. Nieuw, gedeeld door beide secties:

- `afwijzenBevestigingVraag` — "Weet je zeker dat je {item} wilt afwijzen?"
- `afwijzenBevestigingRedenLabel` — "Reden van afwijzing"
- `afwijzenBevestigingRedenPlaceholder` — "Geef aan waarom je afwijst…"
- `afwijzenBevestigingRedenVerplicht` — "Een reden is verplicht."
- `afwijzenBevestigen` — "Ja, afwijzen"
- `afwijsredenLabel` — "Reden van afwijzing" (label boven de getoonde, opgeslagen reden)

Hergebruikt, ongewijzigd: `annuleren`.

## Testids

- `klant-modal-afwijzen` / `bestelling-modal-afwijzen` — bestaande knop, opent nu de
  bevestiging in plaats van direct te patchen.
- `klant-modal-afwijzen-bevestiging` / `bestelling-modal-afwijzen-bevestiging` —
  tekstblok + redenveld.
- `klant-modal-afwijzen-bevestigen` / `bestelling-modal-afwijzen-bevestigen` — "Ja, afwijzen".
- `klant-modal-afwijzen-annuleren` / `bestelling-modal-afwijzen-annuleren` — "Annuleren".
- `klant-modal-afwijsreden` / `bestelling-modal-afwijsreden` — getoonde, opgeslagen reden.

## Tests

Per modal (klant en bestelling):

1. Op "Afwijzen" klikken opent de bevestiging en roept de PATCH **niet** aan.
2. De bevestigingsknop is uitgeschakeld zolang het redenveld leeg of alleen witruimte is.
3. Reden invullen en op "Ja, afwijzen" klikken: PATCH met `{ status: 'Afgewezen', afwijsreden }`,
   `onUpdated` met de nieuwe reden, bevestiging sluit.
4. "Annuleren": geen PATCH, terug naar de normale weergave, geen reden bewaard.
5. De modal sluiten en een ander record openen toont geen restant van een vorige, niet-
   afgeronde bevestiging.
6. Is de status `Afgewezen` en is er een opgeslagen `afwijsreden`, dan is die zichtbaar; anders
   niet.

Daarnaast een test voor de gedeelde module: `vraag()` zet `open` op waar met een lege reden,
`wijzigReden` past die aan, `annuleer()` zet alles terug.

Migratie: `npm run db:migrate -- staging` toepassen en met `npm run db:status -- staging`
verifiëren vóórdat de app-code met de nieuwe kolom naar staging gaat, zodat de gedeployde code
nooit tegen een schema draait dat de kolom nog mist.

## Wat dit ontwerp bewust niet doet

- Geen historietabel voor klantstatuswijzigingen — die bestaat niet en dit ontwerp voegt er
  geen toe.
- Geen redenkolom op `bestelstatusHistorie` — de reden hoort bij de huidige staat van de
  bestelling, niet bij elke historische statuswissel.
- Geen zichtbaarheid van de reden buiten beheer — niet op de website, niet in een e-mail naar
  de klant.
- Geen vertalingen buiten `nl.json`.
- Geen los `AfwijzenBevestigingDialog`-component bovenop `Modal` — zie de toelichting hierboven
  over geneste modals.
