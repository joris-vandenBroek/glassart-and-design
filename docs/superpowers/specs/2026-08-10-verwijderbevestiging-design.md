# Verwijderbevestiging in beheer — ontwerp

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 10-08-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

Datum: 2026-08-10
Status: ontwerp, goedgekeurd voor implementatie

## Aanleiding

Op één plek na verwijdert een "Verwijderen"-knop in beheer meteen en zonder vragen. Eén
misklik in een modal die je geopend had om iets te *bewerken*, en het record is weg — er is
geen ongedaan maken en geen prullenbak.

De uitzondering maakt het schever dan het al is: segmenten, stijlen en onderwerpen vragen
wél om bevestiging, maar alléén als het item nog bij kunstwerken in gebruik is. Wie een
onbenut segment weggooit krijgt niets te zien; wie een kunstwerk weggooit ook niet. Er is
dus geen regel die een beheerder kan onthouden.

## Uitgangssituatie in de code

Acht verwijderpaden, allemaal met dezelfde vorm: een `Modal` waarvan `footerActions` bestaat
uit Opslaan plus — alleen in bewerkmodus — Verwijderen, en een `handleRemove` die eventueel
eerst een blokkade meldt en anders `onRemove(id)` aanroept, logt en de modal sluit.

| Sectie | Bevestiging nu | Blokkade aan de clientkant | Label dat al berekend wordt |
| --- | --- | --- | --- |
| `KunstwerkenSection` | nee | geen (knop is verborgen als het werk besteld is) | `kunstwerk.code` |
| `KunstenaarsSection` | nee | `kunstenaarsVerwijderBlocked` | `kunstenaar.naam` |
| `DrukkerModal` | nee | `drukkersVerwijderBlocked` | `drukker.naam` |
| `MatenSection` | nee | `matenVerwijderBlocked` | `${breedte}×${hoogte} cm` |
| `MaterialenSection` | nee | `materialenVerwijderBlocked` | `materiaal.omschrijving` |
| `MateriaalsoortenSection` | nee | `materiaalsoortenVerwijderBlocked` | `materiaalsoort.omschrijving` |
| `PrijsgroepenSection` | nee | `prijsgroepenVerwijderBlocked` | `prijsgroep.naam` |
| `LookupSection` (segmenten/stijlen/onderwerpen) | **alleen bij gebruik** | geen | `item.omschrijving` |

Twee dingen die dit ontwerp gebruikt:

- **Elke `handleRemove` berekent al een leesbaar label**, voor `logActiviteit`. Dat label kan
  zonder extra werk ook in de bevestigingsvraag.
- **`LookupSection` heeft het interactiepatroon al**: één state-veld (`pendingVerwijderCount`)
  wisselt zowel de modalinhoud als de `footerActions` om (regels 176 en 221). `KunstwerkenSection`
  kreeg op 10-08-2026 hetzelfde patroon voor de bevestiging bij een codewijziging. Er staan dus
  al twee handgeschreven exemplaren van dezelfde constructie in de codebase.

Aan de serverkant bestaan de meeste sloten al: `409 in-use` voor drukkers en kunstenaars,
`409 in-use-bestelling` voor kunstwerken, maten en materialen, `409 in-use` voor
materiaalsoorten en prijsgroepen. Segmenten, stijlen en onderwerpen hebben géén serverslot —
daar is de clientcontrole het enige dat er is. Dit ontwerp verandert daar niets aan.

## Beslissingen

1. **Altijd bevestigen**, ook als het item nergens in gebruik is. Voorspelbaar, en het lost
   precies de klacht op. Verworpen: de huidige regel van `LookupSection` doortrekken
   ("alleen bij gebruik") — dan gaat een ongebruikt kunstwerk nog steeds zonder waarschuwing
   weg. Ook verworpen: altijd bevestigen *met* gebruiksinformatie voor elke sectie, want dat
   vraagt per sectie een eigen gebruikscontrole aan de clientkant, en voor een deel van de
   secties zijn die gegevens daar niet ingeladen.
2. **De vraag noemt het item bij naam**, met het label dat de sectie al voor het
   activiteitenlog berekent.
3. **De bestaande blokkades blijven vóór de bevestiging staan.** Is verwijderen niet
   toegestaan, dan krijgt de beheerder de blokkademelding en géén bevestiging — geen "weet je
   het zeker" voor iets dat toch niet mag.
4. **Eén gedeelde hook plus twee renderhelpers**, geen tweede `Modal`. `src/components/Modal.tsx`
   rendert via `createPortal` met `data-testid="modal"` en installeert `useOverlayDismiss`;
   twee open modals zouden beide dat testid dragen en beide op Escape reageren.
   Verworpen: een los dialoogcomponent bovenop de modal (zoals `AfrondenBevestigingDialog`) —
   leest netter, maar nestelt precies die modals. Ook verworpen: een gedeelde
   `BeheerRecordModal`-wrapper die opslaan én verwijderen omvat — dat is de nettere eindvorm,
   maar een verbouwing van acht bestanden inclusief het opslaanpad, en dus buiten deze vraag.
5. **Rijen in een formulier vallen erbuiten.** Een contactpersoon in `GlassartDesignSection`
   en een btw-tarief in `InstellingenSection` verdwijnen pas bij Opslaan; de modal sluiten
   zonder opslaan maakt het al ongedaan. Een bevestiging voor iets dat met één klik omkeerbaar
   is voegt alleen klikken toe.
6. **Klanten vallen erbuiten.** `DELETE /api/klanten/[id]` bestaat, maar er is geen
   verwijderknop in beheer — die route dient een klant die zijn eigen account opzegt.

## A. De gedeelde module

Nieuw bestand `src/components/beheer/verwijderBevestiging.tsx`, met één verantwoordelijkheid:
de staat en de weergave van een openstaande verwijderbevestiging.

```ts
export interface VerwijderBevestiging {
  /** Het label van het item waarvoor een bevestiging open staat, of null als er geen open staat. */
  item: string | null;
  vraag: (label: string) => void;
  annuleer: () => void;
}

export function useVerwijderBevestiging(): VerwijderBevestiging;
```

Twee presentatiehelpers in hetzelfde bestand:

```tsx
export function VerwijderBevestigingTekst(props: {
  item: string;
  /** Extra regel boven de vraag, bijvoorbeeld dat het item nog in gebruik is. */
  extraRegel?: string;
  testId: string;
}): JSX.Element;

export function VerwijderBevestigingActies(props: {
  onBevestig: () => void;
  onAnnuleer: () => void;
  /** Enkelvoudsvorm van de sectie, bijvoorbeeld `maat` — bepaalt de testids. */
  testIdPrefix: string;
}): JSX.Element;
```

Beide helpers halen hun teksten zelf uit `useTranslations('beheer')`, zodat een sectie geen
sleutels hoeft door te geven.

## B. Het verloop in een sectie

`handleRemove` splitst in een poort en een schrijfactie, hetzelfde patroon als
`KunstwerkenSection` sinds de codebevestiging gebruikt:

1. Staat er nog geen bevestiging open, dan doet de sectie eerst haar bestaande
   blokkadecontrole. Slaat die aan → blokkademelding, klaar.
2. Anders `bevestiging.vraag(label)` en verder niets.
3. De modalinhoud wisselt om naar `VerwijderBevestigingTekst`, de `footerActions` naar
   `VerwijderBevestigingActies`. Het formulier blijft in de DOM staan met `hidden`, zodat
   annuleren niets van de ingevulde staat weggooit. Dat is een verandering voor
   `LookupSection`, die zijn formulier nu met een ternary uit de DOM haalt; met één tekstveld
   valt dat niet op, maar de uniforme vorm is `hidden`, gelijk aan wat `KunstwerkenSection`
   voor de codebevestiging doet.
4. *Ja, verwijderen* voert de bestaande verwijderactie uit: `onRemove(id)`, `logActiviteit`,
   modal sluiten. Mislukt het, dan verschijnt de bestaande generieke actiefout en verdwijnt de
   bevestiging.
5. *Annuleren* zet `bevestiging.annuleer()` en je bent terug bij het formulier.
6. `closeModal` (en in `DrukkerModal` de `onClose`-prop) ruimt de bevestiging op, zodat een
   volgend record nooit met een openstaande vraag opent.

## C. Segmenten, stijlen en onderwerpen

`LookupSection` had de bevestiging al, maar alleen bij gebruik. Die logica verhuist naar de
gedeelde vorm: altijd vragen, en is het item nog bij kunstwerken in gebruik, dan geeft
`extraRegel` de bestaande zin mee. De gebruiksvraag zelf (`kunstwerken.filter(...)`) blijft
staan waar hij staat; alleen de betekenis verandert — hij bepaalt niet meer *of* er gevraagd
wordt, maar *wat er extra bij staat*.

`pendingVerwijderCount` verdwijnt daarmee als state. Het aantal wordt **op renderpunt**
berekend, niet bij het stellen van de vraag: de modal staat dan nog open, dus `modalState.item.id`
en `kunstwerken` zijn beide beschikbaar. Zo blijft de gedeelde hook op één veld
(`item: string | null`) en hoeft hij geen sectiespecifieke bijlage te bewaren.

## Vertalingen

`messages/nl.json`, `beheer`-blok. Hergebruikt, ongewijzigd:

- `annuleren` — "Annuleren"
- `verwijderenBevestigen` — "Ja, verwijderen"
- de zeven `*VerwijderBlocked`-sleutels

Nieuw:

- `verwijderBevestigingVraag` — "Weet je zeker dat je {item} wilt verwijderen?"
- `verwijderBevestigingOnomkeerbaar` — "Dit kan niet ongedaan gemaakt worden."

Geherformuleerd, omdat de vraag nu uit de gedeelde sleutel komt en deze drie alleen nog de
gebruiksinformatie leveren:

- `segmentenVerwijderBevestiging` — "Dit segment wordt nog gebruikt door {count} kunstwerk(en)."
- `stijlenVerwijderBevestiging` — "Deze stijl wordt nog gebruikt door {count} kunstwerk(en)."
- `onderwerpenVerwijderBevestiging` — "Dit onderwerp wordt nog gebruikt door {count} kunstwerk(en)."

Alleen `nl.json`: het `beheer`-blok bestaat niet in `en/de/fr`.

## Testids

De conventie die `LookupSection` al hanteert, doorgetrokken naar alle acht:

- `<enkelvoud>-modal-verwijder-bevestiging` — het tekstblok
- `<enkelvoud>-modal-verwijder-bevestigen` — *Ja, verwijderen*
- `<enkelvoud>-modal-verwijder-annuleren` — *Annuleren*

De bestaande `<enkelvoud>-modal-verwijderen` blijft de knop die de bevestiging opent.

## Tests

Per sectie drie gevallen:

1. Op Verwijderen klikken opent de bevestiging en roept `onRemove` **niet** aan.
2. *Ja, verwijderen* roept `onRemove` aan met het juiste id.
3. *Annuleren* roept `onRemove` niet aan en het formulier is weer in beeld.

Daarnaast:

- Voor de zes secties met een blokkade: een geblokkeerd item geeft de blokkademelding en
  géén bevestiging.
- Voor de drie lookup-secties: de gebruikszin staat in de bevestiging als het item nog bij
  kunstwerken in gebruik is, en staat er niet als dat niet zo is.
- Voor `KunstwerkenSection`: de verwijderbevestiging en de bestaande codewijzigings­bevestiging
  bijten elkaar niet — een van de twee open hebben laat de andere niet zien.
- Voor de gedeelde module een eigen test: `vraag` zet het label, `annuleer` wist het.

## Wat dit ontwerp bewust niet doet

- Geen wijzigingen aan de serverkant. De bestaande 409's blijven de harde grens; dit is de
  laag ervóór.
- Geen serverslot voor segmenten, stijlen en onderwerpen, hoe scheef het ook is dat die er
  geen hebben. Dat is een eigen wijziging met eigen risico's.
- Geen prullenbak, geen ongedaan maken, geen zachte verwijdering.
- Geen bevestiging bij het weghalen van een contactpersoon of een btw-tarief.
- Geen `BeheerRecordModal`-wrapper. Als de acht modals ooit één vorm krijgen, is dit ontwerp
  daar niet mee in strijd — de hook en de helpers passen er dan in.
