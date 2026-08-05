# Btw verplicht bij klant goedkeuren

Datum: 2026-08-05
Auteur: Joris van den Broek (met Claude)
Status: Approved — klaar voor implementatieplan

## Aanleiding

Direct na het shippen van btw-per-land (zie `2026-08-04-btw-per-land-design.md`) viel op dat een klant die zich registreert met een land waarvoor nog geen btw-tarief is ingesteld, gewoon stilzwijgend het standaardtarief kreeg — zowel bij het beoordelen van de klant als op zijn bestellingen. De klant wil dat zichtbaar maken bij het beoordelen, en wil zo'n klant niet kunnen goedkeuren voordat er een geldig, land-specifiek btw-tarief bestaat. Het bestaande standaardtarief (`standaardPercentage`) vervalt hierdoor als concept.

## Scope

**Wel:**
- `BtwTarieven` verliest het veld `standaardPercentage` — elk land moet een eigen rij in `tarieven` hebben, anders is er simpelweg geen tarief.
- Een gedeelde `resolveBtwPercentage`-helper (`src/lib/resolveBtw.ts`) die de bestaande gedupliceerde land→percentage-lookup in `BestellingModal.tsx` en `AccountOrderModal.tsx` vervangt.
- Een waarschuwing bovenaan `KlantModal.tsx` (direct onder de statusbadge) wanneer het (factuur)land van de klant geen match heeft in de btw-tarieven-lijst.
- De bestaande "Goedkeuren"-knop in `KlantModal.tsx` blokkeert ook op een ontbrekend btw-tarief, naast de al bestaande blokkade op een ontbrekende prijsgroep.

**Niet:**
- Geen wijziging aan het klantenoverzicht (tabel) — geen nieuwe kolom, badge of icoon daar. De waarschuwing is alleen zichtbaar in de modal, op het moment dat een medewerker de klant daadwerkelijk opent om te beoordelen.
- Geen wijziging aan de landen-lijst, het `land`/`invoiceLand`-datamodel, of de manier waarop het beoordeel-land wordt bepaald (`invoiceLand || land`) — dat blijft exact zoals in btw-per-land opgeleverd.
- Geen activiteitenlog-entry voor deze blokkade — het is een validatiestatus, geen aparte actie, net zoals de bestaande `!prijsgroepId`-blokkade ook niet gelogd wordt.
- Geen wijziging aan bestaande bestellingen of hoe btw daar getoond wordt als het tarief ontbreekt — dat gedrag (btw-regels stilzwijgend verborgen) bestaat al en blijft ongewijzigd; alleen de bron van het percentage verandert (zie D).

## A. Datamodel: standaardPercentage verwijderen

`src/components/beheer/btwTarievenTypes.ts`:

```ts
export interface BtwTarieven {
  tarieven: BtwTarief[];
}
```

`src/data/btwTarievenSeed.ts` verliest `standaardPercentage`:

```ts
export const BTWTARIEVEN_SEED: BtwTarieven = {
  tarieven: [{ land: 'NL', percentage: 21 }],
};
```

`InstellingenSection.tsx` verliest het "Standaardtarief"-invoerveld (regels ~181-196) inclusief bijbehorende `messages/nl.json`-sleutel `instellingenBtwStandaardtarief` en testid `instellingen-btw-standaard`. De rest van het btw-tarieven-blok (rijen toevoegen/verwijderen, land+percentage per rij, één gezamenlijke "Opslaan"-knop) blijft ongewijzigd.

## B. Gedeelde resolve-helper

Nieuw bestand `src/lib/resolveBtw.ts`:

```ts
import type { BtwTarief } from '@/components/beheer/btwTarievenTypes';

export function resolveBtwPercentage(tarieven: BtwTarief[], land: string | null): number | null {
  if (!land) return null;
  return tarieven.find((t) => t.land === land)?.percentage ?? null;
}
```

Vervangt de identieke inline expressie die nu apart in `BestellingModal.tsx` (regel ~96-97) en `AccountOrderModal.tsx` (regel ~61-62) staat. Beide bestanden blijven verder ongewijzigd: `btwPercentage != null`-guards en het stilzwijgend verbergen van de btw-regels (`{btwBedrag !== null && (...)}`) bestaan al, dus een klant/order zonder matchend tarief toont gewoon geen btw-uitsplitsing — geen crash, geen `NaN`.

## C. Waarschuwing en blokkade in KlantModal

`KlantModal.tsx` krijgt een nieuwe verplichte prop `btwTarieven: BtwTarieven | null`, gevoed vanuit dezelfde plek in `BeheerShell.tsx`/`KlantenSection.tsx` waar `InstellingenSection` zijn btw-tarieven al vandaan haalt.

```ts
const land = fields.invoiceLand || fields.land || null;
const btwPercentage = btwTarieven ? resolveBtwPercentage(btwTarieven.tarieven, land) : null;
const heeftGeldigBtwTarief = btwPercentage !== null;
```

- Nieuwe waarschuwing, direct onder de statusbadge (dus altijd zichtbaar zodra de modal open is, ongeacht bewerkmodus of status — ook informatief zichtbaar bij een al goedgekeurde klant wiens landtarief later verwijderd is): *"Geen btw-tarief ingesteld voor \<landnaam\>. Voeg dit toe bij Instellingen voordat je deze klant kunt goedkeuren."* Alleen zichtbaar wanneer `!heeftGeldigBtwTarief`.
- Goedkeuren-knop: `disabled={!prijsgroepId || !heeftGeldigBtwTarief}` — zelfde patroon als de bestaande prijsgroep-blokkade, geen apart mechanisme.
- `handleGoedkeuren` blijft verder ongewijzigd (geen extra server-side check — de UI-blokkade is voldoende, zelfde niveau van bescherming als de bestaande prijsgroep-check).

## D. Gevolgen voor bestaande bestel-popups

Met `standaardPercentage` weg tonen `BestellingModal.tsx` en `AccountOrderModal.tsx` geen btw-uitsplitsing meer voor een klant/order wiens land geen tarief heeft — dit was voorheen niet mogelijk (er was altijd een standaardtarief) en is dus nieuw zichtbaar gedrag, maar volgt exact het al bestaande "geen bedrag → regel verbergen"-patroon. Voor nieuw goedgekeurde klanten kan dit niet meer voorkomen (goedkeuren is nu geblokkeerd zonder tarief); het blijft wel mogelijk voor een klant die vóór deze wijziging al was goedgekeurd, of van wie het land-tarief later uit de instellingen wordt verwijderd.

## Tests

- `tests/components/beheer/InstellingenSection.test.tsx`: standaardtarief-veld/testid weg.
- `tests/components/beheer/BestellingModal.test.tsx`, `tests/components/account/AccountOrderModal.test.tsx`, `tests/components/account/OrdersSection.test.tsx`, `tests/components/beheer/BeheerShell.test.tsx`, `tests/components/account/AccountDashboard.test.tsx`: seed-data zonder `standaardPercentage`, geen aanname meer dat btw altijd getoond wordt.
- Nieuw: `tests/lib/resolveBtw.test.ts` voor de helper (land met tarief, land zonder tarief, land `null`).
- Nieuw: `KlantModal.test.tsx`-gevallen voor de waarschuwing (zichtbaar/onzichtbaar) en de Goedkeuren-knop-blokkade (met prijsgroep maar zonder btw-tarief; met btw-tarief maar zonder prijsgroep; met beide).

## Niet in scope (samenvatting)

- Klantenoverzicht-tabel (geen indicator daar).
- Land-datamodel of land-resolutie-conventie (ongewijzigd t.o.v. btw-per-land).
- Activiteitenlog voor deze blokkade.
- Server-side afdwinging van de blokkade (blijft, net als de prijsgroep-check, uitsluitend client-side).
