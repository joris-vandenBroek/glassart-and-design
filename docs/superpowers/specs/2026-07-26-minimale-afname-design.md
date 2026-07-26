# Minimale afname (globaal + per klant override)

## Context

Klanten kunnen nu in de bestel-popup (`ProductModal.tsx`) elk aantal vanaf
1 bestellen. GAAD wil een minimum-bestelaantal kunnen instellen dat
standaard voor iedereen geldt, met de mogelijkheid om dat per klant te
overrulen (bijv. een grotere klant die altijd kleinere aantallen mag
bestellen dan de standaard).

Relevante bestaande code/patronen:
- `src/lib/useFirestoreDocument.ts` + `src/components/beheer/GlassartDesignSection.tsx`
  — het patroon voor een los, geseed Firestore-instellingendocument
  (`instellingen/bedrijfsgegevens`) met één opslaan-knop.
- `src/components/ContactInfo.tsx` — hetzelfde instellingendocument
  publiek uitgelezen op de contactpagina; bewijst dat de `instellingen`
  collectie al publiek leesbaar is (`firestore.rules:32-35`,
  `allow read: if true`).
- `src/components/beheer/KlantModal.tsx` (regel 19-43, 96-105) —
  `prijsgroepId` is het bestaande precedent voor "globaal concept met
  per-klant override": los mini-formulier met eigen opslaan-knop, naast de
  generieke `EditableFields`-flow.
- `src/lib/useCustomerAuth.tsx` — `CustomerAuthProvider` (app-breed
  gemount in `src/app/[locale]/layout.tsx`) haalt bij inloggen het
  `klanten/{uid}`-document op en stelt het beschikbaar via
  `useCustomerAuth()`. `ProductModal.tsx` gebruikt dit al (`user`,
  regel 52).
- `src/components/ProductModal.tsx` (regel 49, 65, 297-320, 118, 129-175)
  — de bestel-popup: `quantity`-state, reset-effect bij openen, de
  +/- stepper-UI, `canConfirm`, en `handleConfirm`.
- `src/components/CartPanel.tsx` — geen aantal-editor in het winkelmandje
  zelf (alleen verwijderen), dus een regel kan na toevoegen niet meer
  onder het minimum gebracht worden.
- `src/lib/logActiviteit.ts` — `ActiviteitType`-union en
  `logActiviteit`/`actorFromCustomer`/`actorFromMedewerker` helpers.

## Changes

### 1. Datamodel

**Nieuw type** `src/components/beheer/bestelinstellingenTypes.ts`:

```ts
export interface Bestelinstellingen {
  minimaleAfname: number;
}

export const BESTELINSTELLINGEN_SEED: Bestelinstellingen = {
  minimaleAfname: 1,
};
```

**Nieuw Firestore-document**: `instellingen/bestelinstellingen`, zelfde
collectie als `bedrijfsgegevens` — geen wijziging nodig aan
`firestore.rules` (collectie-brede regel dekt elk document-id al).

**`Klant`** (`src/components/beheer/KlantenSection.tsx`, regel 9-22):
nieuw optioneel veld `minimaleAfname?: number | null`. `null`/`undefined`
betekent: geen override, gebruik de globale instelling.

**`CustomerUser`** (`src/lib/useCustomerAuth.tsx`, regel 15-20): nieuw
veld `minimaleAfname: number | null`, gevuld vanuit de al bestaande
`klanten/{uid}`-fetch (regel 44-53) — daar wordt nu ook `minimaleAfname`
van het klantdocument gelezen, naast de al gelezen velden.

**`ActiviteitType`** (`src/lib/logActiviteit.ts`, regel 4-38): twee nieuwe
leden:
- `'bestelinstellingen_gewijzigd'`
- `'klant_minimale_afname_gewijzigd'`

### 2. Beheer: nieuwe "Instellingen" sectie

- `BeheerSection`-type + nav-item `'instellingen'` toegevoegd in
  `src/components/beheer/BeheerNav.tsx`.
- Nieuwe component `src/components/beheer/InstellingenSection.tsx`,
  gestructureerd zoals `GlassartDesignSection.tsx`:
  - `useFirestoreDocument<Bestelinstellingen>('instellingen', 'bestelinstellingen', { seed: BESTELINSTELLINGEN_SEED })`.
  - Eén numeriek invoerveld "Minimale afname" (geheel getal, minimum 1).
  - Eén "opslaan"-knop; bij opslaan `onSave(form)` +
    `logActiviteit('bestelinstellingen_gewijzigd', actorFromMedewerker(user))`.
- Gewired in `src/components/beheer/BeheerShell.tsx` naast de bestaande
  `useFirestoreDocument`-call voor `bedrijfsgegevens`.

### 3. Beheer: klant-override in `KlantModal.tsx`

Los mini-formulier, naar het patroon van de `prijsgroepId`-sectie
(regel 96-105), maar **altijd zichtbaar** (niet gekoppeld aan
klantstatus, in tegenstelling tot prijsgroep):
- Eén numeriek invoerveld "Minimale afname (override)"; leeg =
  `null` (geen override, globale instelling geldt).
- Eigen "opslaan"-knop (`handleOpslaanMinimaleAfname`): `updateDoc(doc(db,
  'klanten', klant.id), { minimaleAfname: waarde of null })` +
  `logActiviteit('klant_minimale_afname_gewijzigd', actorFromMedewerker(user))`.

### 4. Bestel-popup (`ProductModal.tsx`)

**Instellingen ophalen**: nieuwe
`useFirestoreDocument<Bestelinstellingen>('instellingen', 'bestelinstellingen')`-call
in `ProductModal`, zelfde patroon als `ContactInfo.tsx`. Effectief
minimum:

```ts
const effectiveMinimum = user?.minimaleAfname ?? bestelinstellingen?.minimaleAfname ?? 1;
```

(`user` komt uit de al aanwezige `useCustomerAuth()`-call op regel 52;
niet-ingelogde bezoekers vallen automatisch terug op de globale waarde.)

**Prefill**: de bestaande `useEffect` die bij het openen/wisselen van
kunstwerk `setQuantity(1)` doet (regel 65), wordt
`setQuantity(effectiveMinimum)`.

**Aantal-veld wordt hybride stepper + intypbaar veld** (regel 297-320):
de huidige `<span data-testid="product-modal-quantity-value">` wordt een
`<input type="number" data-testid="product-modal-quantity-value">`,
gecontroleerd door de bestaande `quantity`-state:
- Minus-knop: `Math.max(effectiveMinimum, current - 1)` (was
  `Math.max(1, current - 1)`) — clamped voortaan op het effectieve
  minimum, geen foutmelding nodig omdat de knop simpelweg niet verder
  omlaag gaat.
- Plus-knop: ongewijzigd (`current + 1`).
- Intypen: vrij te typen (ook tijdelijk leeg tijdens het typen); de
  ruwe stringwaarde wordt apart bijgehouden zodat "leeg terwijl je
  typt" niet meteen naar 0/NaN springt. Zodra de geparste waarde
  `< effectiveMinimum` is (inclusief leeg/ongeldig), verschijnt een
  foutmelding onder het aantal-veld
  (`data-testid="product-modal-quantity-error"`, tekst via nieuwe
  vertaalsleutel `minimumQuantityError`, geïnterpoleerd met
  `effectiveMinimum`).

**`canConfirm`** (regel 118) krijgt een extra voorwaarde: `quantity >=
effectiveMinimum` (naast de bestaande materiaal/maat-check). Bij een te
laag aantal is de bevestig-knop dus uitgeschakeld, consistent met hoe
`canConfirm` nu al materiaal/maat blokkeert.

**Geen wijziging aan `handleConfirm`/`addItem`** verder dan dat
`quantity` nu altijd `>= effectiveMinimum` is op het moment dat bevestigen
mogelijk is.

### 5. Geen wijziging aan `CartPanel`/`useCart`

Het winkelmandje heeft geen aantal-editor (alleen `removeItem`), dus een
eenmaal toegevoegde regel kan niet meer onder het minimum gebracht
worden. Client-side validatie in `ProductModal` bij het toevoegen is dus
voldoende — er is bewust gekozen om dit niet ook server-side in
`firestore.rules` af te dwingen (geen `get()`-lookups naar `klanten`/
`instellingen` in de `bestellines`-create-regel), consistent met hoe
`quantity > 0` nu ook alleen echt in de UI gecontroleerd wordt.

### 6. Vertalingen

Nieuwe sleutels in alle 4 `messages/*.json`:
- `minimumQuantityError` (bijv. NL: "Minimaal {minimum} stuks")
- Labels voor de nieuwe beheer-velden: "Minimale afname" (Instellingen)
  en "Minimale afname (override)" (KlantModal)
- Nav-label voor de nieuwe "Instellingen"-sectie

## Out of scope

- Geen server-side (Firestore rules) afdwinging van het minimum — alleen
  client-side in de bestel-popup (zie §5).
- Geen per-product minimum (naast het globale/per-klant minimum) — er
  bestaat vandaag geen enkel per-product hoeveelheidsconcept in
  `Kunstwerk`/`Materiaalsoort`, en dat blijft zo.
- Minimale afname geldt per bestelregel (per kunstwerk in de
  popup), niet als optelsom over de hele bestelling/winkelmandje.
- Geen wijziging aan het admin-order-scherm
  (`BestellingModal.tsx`) — een beheerder kan een bestelregel nog
  steeds op elk aantal `> 0` zetten bij het beoordelen van een
  bestelling.
