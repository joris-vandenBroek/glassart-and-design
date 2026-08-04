# Klantzijde help-teksten: bestelstatus & prijs op aanvraag — design

Datum: 2026-08-02

## Achtergrond

De beheer-help-functies (zelfde dag geshipt) introduceerden een herbruikbaar
`HelpHint`-icoon (goud, `?`-symbool in een cirkel, klik-popover). Klanten op
de website lopen tegen twee begrippen aan die niet vanzelf spreken: de
bestelstatus-badge ("In behandeling"/"Afgewezen") en "Prijs op aanvraag".
Dit ontwerp hergebruikt `HelpHint` ongewijzigd (zelfde `?`-icoon, geen apart
info-symbool) op deze twee plekken.

## Plaatsing

Vier `HelpHint`-plekken in drie bestanden, om herhaling in lijst-weergaven te
vermijden:

- **Bestelstatus**: 1× bij de titel "Mijn bestellingen"
  (`src/components/account/OrdersSection.tsx`, niet per rij in de lijst) +
  1× bij de statusbadge in het besteldetail-scherm
  (`src/components/account/AccountOrderModal.tsx`).
- **Prijs op aanvraag**: bij de prijs in het productscherm
  (`src/components/ProductModal.tsx`, alleen zichtbaar wanneer die prijs ook
  daadwerkelijk "Prijs op aanvraag" toont) + bij een onbeprijsde bestelregel
  in het besteldetail-scherm (`AccountOrderModal.tsx`).

## i18n

Dit is klantzijde (i.t.t. de nl-only beheeromgeving) — de tekst moet in alle
vier de site-talen: `nl`, `en`, `de`, `fr`. De twee schermen gebruiken elk
hun eigen i18n-namespace (`cart` voor `ProductModal.tsx`,
`accountPage.orders` voor de account-schermen), dus de
prijs-op-aanvraag-tekst komt in beide namespaces te staan — hetzelfde
patroon dat het bestaande `"Prijs op aanvraag"`-label nu al gebruikt
(`cart.priceOnRequest` en `accountPage.orders.modalLinePriceOnRequest` zijn
al twee aparte sleutels met identieke waarde).

En/de/fr-vertalingen worden door de assistent geschreven (geen native
review) — geaccepteerd door de klant voor deze korte teksten.

## Copy (NL, bron van waarheid — en/de/fr zijn vertalingen hiervan)

**Bestelstatus** (nieuwe sleutel `accountPage.orders.statusHelp`):

> In behandeling betekent dat we je bestelling nog aan het bekijken zijn, of
> dat 'm al onderweg is naar de drukker. Afgewezen betekent dat we de
> bestelling niet konden uitvoeren — neem gerust contact met ons op als je
> daar vragen over hebt.

**Prijs op aanvraag** (nieuwe sleutels `cart.priceOnRequestHelp` en
`accountPage.orders.priceOnRequestHelp`, identieke tekst):

> Je ziet dit wanneer je een eigen (afwijkende) maat kiest, of als er voor
> deze combinatie van maat en materiaal nog geen prijs is ingevuld. We
> stellen de prijs dan met de hand voor je vast en je hoort van ons wat het
> kost.

## Waarom dit klopt (geverifieerd in de code)

- "Prijs op aanvraag" ontstaat via `ProductModal.tsx` op twee manieren: (1)
  `isCustomSize` — de klant koos "eigen maat" (`CUSTOM_MAAT_VALUE`), een
  maat die niet in de prijsmatrix voorkomt; (2) `!prijsRegel` — er is nog
  geen matrixprijs ingevuld voor de gekozen combinatie van maat en
  materiaal. Op de account-orderregels (`AccountOrderModal.tsx`,
  `line.prijs === null`) is de enige manier waarop een geplaatste bestelling
  een lege prijs heeft de eerste variant: server-side blokkeert
  `berekenBestellijnPrijs`'s `'onbekend'`-status het plaatsen van de
  bestelling volledig (`api/bestelheaders/route.ts`), dus alleen de
  `'op-aanvraag'`-status (eigen maat) komt ooit als `null`-prijs bij een
  klant terecht.
- De twee klant-zichtbare statussen (`KlantBestellingStatus` in
  `src/lib/klantBestellingStatus.ts`) zijn `inBehandeling` (mapt van "Te
  beoordelen", "Te versturen naar drukker", "Verstuurd naar drukker") en
  `afgewezen` (mapt van "Afgewezen") — de copy dekt beide correct.

## Testids (nieuw)

- `orders-status-help` (+ `-popover`) — bij de titel in `OrdersSection.tsx`
- `account-order-modal-status-help` (+ `-popover`) — in `AccountOrderModal.tsx`
- `product-modal-prijs-help` (+ `-popover`) — in `ProductModal.tsx`, alleen
  gerenderd wanneer `prijsWeergave === t('priceOnRequest')`
- `account-order-modal-line-price-help` (+ `-popover`) — in
  `AccountOrderModal.tsx`, alleen gerenderd wanneer `line.prijs === null`

## Scope-afbakening

- Geen wijziging aan de daadwerkelijke prijsberekening of statuslogica —
  uitsluitend uitleg-tekst in de UI, zelfde als de beheer-help-functies.
- Geen ander icoon-symbool (blijft `?`, geen apart info-icoon) — expliciet
  bevestigd door de gebruiker.
