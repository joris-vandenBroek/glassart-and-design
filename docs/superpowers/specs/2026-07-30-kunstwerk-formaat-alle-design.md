# Kunstwerk: Formaat "Alle", generieke maatloos-prijs-per-m² en prijslabel

**Datum:** 2026-07-30
**Status:** Ontwerp

## Aanleiding

Een kunstwerk heeft vandaag een verplicht Formaat (`vierkant` / `liggend` / `staand`),
dat in het beheerformulier bepaalt welke maten "compatibel" zijn (vierkante maten horen
bij `vierkant`, alle andere bij `liggend`/`staand` — beide laatste worden identiek
behandeld). Er bestaat al een apart concept "materiaalloos" (geen materiaal aangevinkt):
in dat geval verdwijnen materiaal- én maatkeuze uit de klant-dialoog, en komt er een
eigen breedte/hoogte-invoer met een `Prijs per m²` voor in de plaats.

Er is nu behoefte aan een vierde Formaat-optie "Alle", die aangeeft dat een kunstwerk in
elke vorm/maat past, met als default dat alle maten geselecteerd worden. Daarnaast moet
het al bestaande "materiaalloos → prijs per m²"-mechanisme generieker: hetzelfde moet ook
gelden zodra er (ongeacht formaat) gewoon 0 maten zijn aangevinkt, ook als er wél een
materiaal gekozen is. Tot slot: de weergegeven prijs in de klant-dialoog mist een label,
en de Breedte/Hoogte-invoervelden moeten gegarandeerd even breed zijn.

## Scope

**In scope:**
- Nieuwe waarde `'alle'` in `KunstwerkFormaat`
- Beheerformulier (`KunstwerkenSection.tsx`): Formaat-optie "Alle", aangepaste
  maat-compatibiliteit, en een generieke "maatloos"-staat (0 maten, ongeacht formaat)
  die net als "materiaalloos" een `Prijs per m²`-invoer toont en opslaan toelaat
- Klant-/preview-dialoog (`ProductModal.tsx`): dezelfde generieke "maatloos"-staat
  toont Breedte/Hoogte-invoer + berekende prijs, óók wanneer er wél een materiaal
  gekozen is (vandaag alleen bij volledig materiaalloos)
- Eén gezamenlijk `Prijs`-label boven de weergegeven prijs, voor alle drie de
  prijs-varianten (per-m², op-aanvraag, vaste prijsregel)
- Shop-grid-filter (`ProductsGrid.tsx`): een kunstwerk met Formaat "Alle" telt mee
  onder elk van de bestaande Vierkant/Liggend/Staand-filters
- Breedte/Hoogte-invoervelden gegarandeerd even breed (`min-w-0` op beide wrappers)
- Nieuwe vertaalsleutel `kunstwerkenFormaat_alle` (alleen `nl.json`, beheer is
  Nederlandstalig) en `priceLabel` (alle vier de locales, klant-kant)

**Buiten scope:**
- Geen aparte "Alle"-filterknop in `ProductsGrid` (bevestigd met de klant: matcht
  gewoon elk bestaand filter)
- Geen wijziging aan hoe `vierkant` versus `liggend`/`staand` vandaag al identiek
  behandeld worden voor maat-compatibiliteit — dat blijft zoals het is
- Geen wijziging aan `detectKunstwerkFormaat.ts` (foto-gebaseerde auto-detectie
  levert nooit `'alle'` op — dat is altijd een bewuste keuze van de beheerder)
- Geen wijziging aan de "eigen maat" (`staatEigenMaatToe`) flow — dat blijft een
  aparte, ongewijzigde derde weg naast materiaalloos/maatloos

## 1. Datamodel — `materiaalTypes.ts`

```ts
export type KunstwerkFormaat = 'vierkant' | 'liggend' | 'staand' | 'alle';
```

Geen andere velden op `Kunstwerk`/`Maat` veranderen. Er komt geen formaat↔maten
koppeltabel bij — compatibiliteit blijft on-the-fly afgeleid, nu met een extra regel:
bij `'alle'` is elke maat compatibel.

## 2. Beheerformulier — `KunstwerkenSection.tsx`

- Formaat-`fieldset` (rond regel 631) krijgt een vierde radiobutton "Alle" naast
  Vierkant/Liggend/Staand, met `data-testid="kunstwerk-modal-formaat-alle"`.
- `setFormaat(optie)`: bij `optie === 'alle'` worden **alle** maten geselecteerd
  (geen `isVierkanteMaat`-filter). Voor de bestaande drie opties verandert er niets.
- Maat-checkboxes (rond regel 704-706): `incompatibel` wordt bij `formaat === 'alle'`
  altijd `false` — geen enkele maat wordt gegreyed/uitgeschakeld.
- Nieuwe afgeleide waarde `isMaatloos = maatIds.length === 0` (naast de bestaande
  `isMateriaalloos`).
- `Prijs per m²`-invoer (rond regel 870) wordt getoond bij `isMateriaalloos ||
  isMaatloos` (was: alleen `isMateriaalloos`).
- `opslaanDisabled` (rond regel 403-412): de tak die vandaag bij "wel materiaal, geen
  maten" altijd blokkeert (`maatIds.length === 0 || !allePrijzenIngevuld`) wordt
  vervangen door dezelfde validatie als materiaalloos (`!prijsPerM2 || Number(prijsPerM2)
  <= 0`) zodra `isMaatloos`, ongeacht `isMateriaalloos`. Concreet:
  ```ts
  (isMaatloos
    ? !prijsPerM2 || Number(prijsPerM2) <= 0
    : maatIds.length === 0 || !allePrijzenIngevuld)
  ```
  (`isMaatloos` is hier een superset van `isMateriaalloos`, dus deze ene tak vervangt
  de bestaande `isMateriaalloos`-tak volledig.)
- `buildKunstwerkData`: `prijsPerM2` wordt meegestuurd zodra `isMaatloos` (was:
  alleen `isMateriaalloos`). De prijzenmatrix blijft leeg zodra er 0 maten zijn — dat
  volgt al vanzelf uit `prijsCombinaties` (flatMap over een lege `maatIds`).
- De prijzen-tabel (regel 818, `materiaalIds.length > 0 && maatIds.length > 0`) hoeft
  niet aangepast: die verdwijnt vanzelf zodra `maatIds` leeg is.
- Dit maakt het mogelijk om, ongeacht welk Formaat gekozen is, alle maten-checkboxes
  handmatig uit te vinken en zo bewust naar de maatloze/prijs-per-m²-staat te gaan —
  precies zoals nu al kan met materialen.

## 3. Klant-/preview-dialoog — `ProductModal.tsx`

- Nieuwe afgeleide waarde `isMaatloos = kunstwerk.maatIds.length === 0` naast de
  bestaande `isMateriaalloos = kunstwerk.materiaalIds.length === 0`. Een materiaalloos
  kunstwerk heeft via `buildKunstwerkData` altijd `maatIds: []`, dus `isMaatloos` is in
  de praktijk een superset: elke materiaalloze kunstwerk is ook maatloos, maar niet
  omgekeerd.
- Materiaal-`<select>` (regel 337): ongewijzigd, blijft verborgen alleen bij volledig
  `isMateriaalloos`.
- Maat-`<select>` (regel 362): verborgen bij `isMateriaalloos || isMaatloos` (was:
  alleen `isMateriaalloos`).
- Breedte/Hoogte custom-invoer (regel 382): getoond bij `isCustomSize || isMaatloos`
  (was: `isCustomSize || isMateriaalloos` — `isMaatloos` dekt materiaalloos al mee).
- Prijsberekening (regel 174-177): generaliseren van `materiaalloosPrijs` naar een
  berekening die geldt zodra `isMaatloos` (in plaats van alleen `isMateriaalloos`),
  verder ongewijzigde formule (`(breedte/100) × (hoogte/100) × prijsPerM2`).
- `canConfirm` (regel 183-188): de buitenste voorwaarde wisselt van `isMateriaalloos`
  naar `isMaatloos`; de binnenste validatie (custom size geldig + `prijsPerM2` > 0)
  blijft ongewijzigd.
- `handleConfirm` (regel 199-224): de `if (isMateriaalloos)`-tak wordt `if
  (isMaatloos)` en stuurt voortaan het gekozen materiaal mee wanneer er één gekozen
  is (niet langer altijd `MATERIAALLOOS_LABEL`/leeg `materiaalId`):
  - Bij `isMateriaalloos`: ongewijzigd (`materiaalId: ''`,
    `materiaalLabel: MATERIAALLOOS_LABEL`).
  - Bij `isMaatloos` zonder `isMateriaalloos`: `materiaalId` en
    `materiaalLabel: resolvedMateriaalLabel(gekozenMateriaal)` van het door de klant
    gekozen materiaal; ontbreekt dat materiaal onverwacht, dan wordt net als in de
    bestaande normale tak niets toegevoegd (`return`).
- Eén `Prijs`-label voor alle drie de prijs-varianten (regel 421-437): de drie
  vertakkingen worden samengevoegd tot één `prijsWeergave: string | null`
  (`isMaatloos` → berekende prijs of `null`; `isCustomSize` → `t('priceOnRequest')`;
  anders → `prijsRegel`-bedrag of `null`), gerenderd als:
  ```tsx
  {prijsWeergave !== null && (
    <div className="flex flex-col gap-1">
      <span className="text-[0.65rem] uppercase tracking-wide text-white/60">
        {t('priceLabel')}
      </span>
      <p data-testid="product-modal-prijs" className="text-sm text-white/80">
        {prijsWeergave}
      </p>
    </div>
  )}
  ```
  `data-testid="product-modal-prijs"` blijft op dezelfde plek zodat bestaande tests
  die op tekstinhoud van dat element controleren, blijven werken.
- Breedte/Hoogte-labels (regel 385, 395): beide krijgen `min-w-0` naast de bestaande
  `flex flex-1 flex-col gap-1 ...`, zodat ze gegarandeerd exact even breed zijn
  ongeacht het intrinsieke minimum van een `<input type="number">`.

## 4. Shop-grid-filter — `ProductsGrid.tsx`

- `matchesFormaat` (regel 57-58): een kunstwerk met `formaat === 'alle'` matcht altijd,
  ongeacht welke Vierkant/Liggend/Staand-filters actief zijn:
  ```ts
  function matchesFormaat(kunstwerk: Kunstwerk) {
    return (
      formaatFilters.size === 0 ||
      kunstwerk.formaat === 'alle' ||
      (kunstwerk.formaat != null && formaatFilters.has(kunstwerk.formaat))
    );
  }
  ```
- Facet-telling per optie (regel 256): telt een `'alle'`-kunstwerk mee bij elke optie:
  ```ts
  const count = formaatCountBase.filter(
    (kunstwerk) => kunstwerk.formaat === formaat || kunstwerk.formaat === 'alle'
  ).length;
  ```
- `FORMAAT_OPTIES` blijft `['staand', 'liggend', 'vierkant']` — geen vierde chip.

## 5. Vertalingen

- `messages/nl.json`: `"kunstwerkenFormaat_alle": "Alle"` naast de bestaande
  `kunstwerkenFormaat_*`-sleutels (alleen `nl.json`, beheer is Nederlandstalig).
- `messages/{nl,en,de,fr}.json`, `cart`-namespace: nieuwe sleutel `priceLabel` naast
  `material`/`size`/`quantity`:
  - nl: `"Prijs"`
  - en: `"Price"`
  - de: `"Preis"`
  - fr: `"Prix"`

## 6. Testen

- `KunstwerkenSection.test.tsx`: nieuwe tests voor de "Alle"-radiobutton (selecteert
  alle maten, geen enkele maat-checkbox disabled), voor de generieke maatloos-staat
  (materiaal gekozen + alle maten handmatig uitgevinkt → `Prijs per m²`-invoer
  verschijnt, opslaan niet langer geblokkeerd) en dat dit ongeacht formaat werkt.
- `ProductModal.test.tsx`: nieuwe tests voor de maatloos-met-materiaal-staat (maat-
  select verborgen, materiaal-select zichtbaar, breedte/hoogte-invoer zichtbaar, prijs
  correct berekend, item met juist materiaal aan winkelmandje toegevoegd), plus een
  test dat het `Prijs`-label bij alle drie de prijsvarianten getoond wordt.
- `ProductsGrid.test.tsx` (indien aanwezig): test dat een kunstwerk met Formaat
  "Alle" verschijnt onder elk van de drie bestaande formaat-filters.
- Handmatige verificatie in de browser-preview: Breedte/Hoogte-velden meten om de
  `min-w-0`-fix te bevestigen (of vaststellen dat ze al gelijk waren en de fix puur
  preventief is).
