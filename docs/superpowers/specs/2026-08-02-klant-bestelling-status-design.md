# Bestellingsstatus tonen op de klant-accountpagina

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 02-08-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

**Datum:** 2026-08-02
**Status:** Goedgekeurd, klaar voor implementatieplan

## Aanleiding

Op de klant-accountpagina (`/account`, sectie "Bestellingen") ziet een klant momenteel
helemaal geen status van zijn bestellingen — dat veld is stilzwijgend verdwenen bij de
migratie van Firestore naar de `bestelheaders`-API (commit `9ce5a41`). Intern kent een
bestelling 4 statussen (`Te beoordelen`, `Te versturen naar drukker`, `Verstuurd naar
drukker`, `Afgewezen`, gedefinieerd in `src/components/beheer/BestellingenSection.tsx:28`),
maar de 3 "actieve" statussen zijn voor een klant onnodige interne keukendetails over het
drukker-proces. Doel: de klant een simpel, begrijpelijk statusbeeld geven, zonder de
interne drukker-workflow bloot te leggen.

## Scope

**In scope:**
- Statusveld terugbrengen in de datastroom (`useAllOrders.tsx` → `OrdersSection.tsx` /
  `AccountOrderModal.tsx`)
- Een gedeelde mapping-helper die de 4 interne statussen naar 2 klantstatussen herleidt
- Statusbadge in zowel de bestellingenlijst als het detail-popup
- Nieuwe vertaalsleutels in alle 4 locale-bestanden (nl/en/de/fr), en opruimen van de
  bestaande, ongebruikte sleutels die bij een ouder (3-status) model horen
- Tests bijwerken/uitbreiden voor het nieuwe gedrag

**Buiten scope:**
- Geen wijziging aan de interne statussen, de beheer-UI, of de drukker-workflow zelf
- Geen wijziging aan hoe/wanneer een status verandert (dat blijft staff-only, via beheer)
- Geen realtime updates (polling/websockets) — de status wordt net als nu opgehaald bij het
  laden van de pagina

## 1. Statusmapping

Nieuw bestand `src/lib/klantBestellingStatus.ts`. Herbruikt het bestaande `Bestelling['status']`
type uit `src/components/beheer/BestellingenSection.tsx` (hetzelfde patroon als
`OrdersSection.tsx` nu al toepast door `Kunstwerk`/`Materiaal`/`Maat`-types uit
`beheer/materiaalTypes` te importeren).

```ts
import type { Bestelling } from '@/components/beheer/BestellingenSection';

export type KlantBestellingStatus = 'inBehandeling' | 'afgewezen';

const KLANT_STATUS_MAP: Record<Bestelling['status'], KlantBestellingStatus> = {
  'Te beoordelen': 'inBehandeling',
  'Te versturen naar drukker': 'inBehandeling',
  'Verstuurd naar drukker': 'inBehandeling',
  Afgewezen: 'afgewezen',
};

export function toKlantBestellingStatus(status: Bestelling['status']): KlantBestellingStatus {
  return KLANT_STATUS_MAP[status];
}

export const KLANT_STATUS_BADGE_CLASS: Record<KlantBestellingStatus, string> = {
  inBehandeling: 'bg-sky-400/10 text-sky-300',
  afgewezen: 'bg-red-400/10 text-red-400',
};
```

Kleuren zijn hergebruikt uit de bestaande beheer-badges (`BestellingModal.tsx:12-17`): sky
voor de drukker-fase, rood voor afgewezen — consistente kleurtaal tussen beheer en klant.

## 2. Datastroom

`src/lib/useAllOrders.tsx`:
- `DisplayOrder` (`:19-25`) en `RealOrder` (`:27-33`) krijgen een `status:
  Bestelling['status']` veld.
- De response-type-annotatie in `loadRealOrders` (`:58-72`) krijgt `status:
  Bestelling['status']` erbij — de API retourneert dit al (`SELECT * FROM bestelheaders`,
  `src/app/api/bestelheaders/route.ts:230-232`), er is geen backend-wijziging nodig.
- `orders.map` (`:73-79`) en de `useMemo` die `DisplayOrder[]` bouwt (`:96-112`) geven
  `status` door.

## 3. Weergave

**`OrdersSection.tsx`** (lijst, regel 37-41): een badge toegevoegd tussen `order.description`
en de datum/tijd-kolom. De klantstatus wordt met een kleine ternary naar de bijbehorende
vertaalsleutel gemapt (`orders.statusInBehandeling` / `orders.statusAfgewezen`):
```tsx
const klantStatus = toKlantBestellingStatus(order.status);
// ...
<span
  data-testid={`account-order-${order.id}-status`}
  className={`shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] uppercase tracking-wide ${KLANT_STATUS_BADGE_CLASS[klantStatus]}`}
>
  {klantStatus === 'afgewezen' ? t('orders.statusAfgewezen') : t('orders.statusInBehandeling')}
</span>
```

**`AccountOrderModal.tsx`** (detail, onder de datum/tijd-regel rond `:46-48`): dezelfde
badge, iets groter (zelfde stijl als de beheer-pill in `BestellingModal.tsx:224-229`:
`rounded-full px-3 py-1 text-xs uppercase tracking-wide`), met `data-testid="account-order-modal-status"`.

Beide componenten importeren `toKlantBestellingStatus` en `KLANT_STATUS_BADGE_CLASS` uit
`@/lib/klantBestellingStatus` en gebruiken de bestaande `useTranslations('accountPage.orders')`
hook die er al is (`AccountOrderModal.tsx:34`) / toegevoegd wordt (`OrdersSection.tsx`
gebruikt al `useTranslations('accountPage')`, dus `t('orders.statusInBehandeling')`).

## 4. Vertalingen

In `messages/{nl,en,de,fr}.json`, namespace `accountPage.orders`:
- **Nieuw:** `statusInBehandeling` — nl "In behandeling", en "In progress", de "In
  Bearbeitung", fr "En cours de traitement"
- **Behouden, ongewijzigd:** `statusAfgewezen` (bestaat al met de juiste waarde in alle 4
  talen, regel 249 nl / 252 en / 249 de / 249 fr)
- **Verwijderd:** `statusTeBeoordelen` en `statusGoedgekeurd` — relicten van het oude
  3-statusmodel (`Te beoordelen`/`Goedgekeurd`/`Afgewezen`) dat niet meer bestaat sinds de
  drukker-workflow is toegevoegd; nergens meer gebruikt (bevestigd via
  `grep -rn "statusTeBeoordelen|statusGoedgekeurd" src` → geen treffers), en zouden na deze
  wijziging permanent dode sleutels blijven.

## 5. Tests

- `tests/lib/useAllOrders.test.tsx`: mock-response uitbreiden met een `status`-veld,
  assert dat `DisplayOrder.status` correct doorkomt.
- `tests/components/account/OrdersSection.test.tsx`: nieuwe test(s) dat elke van de 4
  interne statussen de juiste badge-tekst (`In behandeling` / `Afgewezen`) en
  `data-testid` toont.
- `tests/components/account/AccountOrderModal.test.tsx`: zelfde dekking voor de
  detail-badge.
- Nieuw testbestand `tests/lib/klantBestellingStatus.test.ts`: dekt `toKlantBestellingStatus`
  voor alle 4 input-statussen (3× `inBehandeling`, 1× `afgewezen`).

## Open vragen

Geen — statusmapping (3 → "In behandeling", 1 → "Afgewezen"), plaatsing (lijst + detail),
en taalscope (alle 4 locales) zijn tijdens het brainstormen bevestigd.
