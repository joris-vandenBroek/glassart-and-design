# Bevestiging bij verwijderen van in-gebruik-zijnde Segment/Stijl/Onderwerp

**Datum:** 2026-08-02
**Status:** Ontwerp goedgekeurd, klaar voor implementatieplan

## Aanleiding

De gebruiker meldde dat de koppeling tussen een kunstwerk en zijn segment/stijl/onderwerp op naam lijkt te gaan in plaats van op ID (hernoemen van een segment zou de selectie bij een kunstwerk breken). Onderzoek in de code (`db/schema.sql`, `KunstwerkenSection.tsx`, `SegmentenSection.tsx`, `[resource]/[id]/route.ts`) bevestigt dat dit overal al op ID gebeurt: `kunstwerken.segmentIds`/`stijlIds`/`onderwerpIds` zijn JSON-arrays van ID's, checkboxen matchen op `segment.id`, en de PATCH-route voor hernoemen wijzigt alleen `omschrijving` — het ID blijft ongewijzigd. Er is geen reproduceerbare bug gevonden voor het hernoem-scenario; dit deel blijft daarom **buiten scope** van dit ontwerp.

Wél bevestigd als een reëel, apart gat: verwijderen van een segment/stijl/onderwerp checkt nergens of het nog in gebruik is door bestaande kunstwerken, en er is nergens een bevestigingsstap — in tegenstelling tot `maten`/`materialen`, die al een vergelijkbare in-gebruik-check hebben (als harde blokkade, zie `MatenSection.tsx:79`). Een per ongeluk verwijderd-en-opnieuw-aangemaakt segment/stijl/onderwerp laat een wees-ID achter in de kunstwerken die het gebruikten, zonder dat de beheerder dat ziet.

## Oplossing

Bij het verwijderen van een segment, stijl of onderwerp dat nog door één of meer kunstwerken gebruikt wordt, toont het bewerkvenster eerst een bevestiging met het aantal kunstwerken. Pas na expliciete bevestiging wordt daadwerkelijk verwijderd. Wordt het item niet gebruikt, dan verandert er niets — verwijderen gebeurt zoals nu direct.

In tegenstelling tot de bestaande `maten`/`materialen`-blokkade (hard, geen ontsnapping, want gekoppeld aan echte bestellingen) is dit een **zachte** bevestiging: segmenten/stijlen/onderwerpen zijn catalogus-labels, dus verwijderen na bevestiging blijft toegestaan.

### UX-keuze: zelfde modal, geen gestapelde popup

De bevestiging verschijnt **binnen hetzelfde bewerkvenster** (de modal wisselt tijdelijk van weergave), niet als los gestapeld popup-venster. Reden: `Modal.tsx` gebruikt `useOverlayDismiss`, dat een eigen `document`-brede Escape-listener registreert per open modal-instantie. Twee gestapelde `Modal`-instanties zouden bij Escape allebei sluiten tegelijk (elke listener roept zijn eigen `onClose` aan), wat een verrassende bijwerking zou zijn. Door binnen dezelfde modal-instantie te wisselen van weergave is er maar één Escape-listener actief en blijft het gedrag voorspelbaar. Er bestaat in de hele app nog geen precedent voor gestapelde modals, dus dit voorkomt ook dat we als eerste zo'n patroon moeten uitvinden.

## Data

`kunstwerken` wordt als nieuwe prop doorgegeven aan `SegmentenSection`, `StijlenSection` en `OnderwerpenSection` vanuit `BeheerShell.tsx` (regel ~365-388), op dezelfde manier als nu al gebeurt bij `MatenSection`/`MaterialenSection`. De lijst is al geladen zodra de beheeromgeving opent (`kunstwerken.items` in `BeheerShell.tsx:254`) — geen extra API-call nodig.

## Logica (per sectie, identiek patroon x3)

In `handleRemove()`:

1. Bereken `inUseCount = (kunstwerken ?? []).filter((k) => k.segmentIds.includes(modalState.segment.id)).length` (respectievelijk `stijlIds`/`onderwerpIds` voor de andere twee secties).
2. Als `inUseCount === 0`: verwijder direct zoals nu (`onRemove(id)` + `logActiviteit(...)` + `closeModal()`) — dit pad blijft ongewijzigd.
3. Als `inUseCount > 0` **en** er nog geen bevestiging loopt: zet lokale state `pendingVerwijderCount = inUseCount` en stop (nog niet verwijderen).
4. Bij bevestigen ("Ja, verwijderen"): voer de bestaande verwijderlogica alsnog uit, en reset `pendingVerwijderCount` naar `null`.
5. Bij annuleren: reset `pendingVerwijderCount` naar `null`, terug naar normale weergave.
6. `pendingVerwijderCount` reset ook naar `null` bij het openen (add/edit) of sluiten van de modal, zodat geen stale bevestigingsstatus blijft hangen tussen verschillende items.

## UI

Wanneer `pendingVerwijderCount !== null`:

- De modal-footer toont niet langer "Opslaan"/"Verwijderen", maar twee knoppen: **Ja, verwijderen** (danger-styling, roept de echte verwijdering aan) en **Annuleren** (generieke bestaande `t('annuleren')`-string, regel 374 in `nl.json`).
- In de modal-body verschijnt de melding met het aantal, bijvoorbeeld: "Dit segment wordt nog gebruikt door {count} kunstwerk(en). Weet je zeker dat je het wilt verwijderen?"

### Nieuwe vertalingen (`messages/nl.json`, beheer-namespace — nl-only, zoals eerder vastgesteld voor deze namespace)

- `segmentenVerwijderBevestiging`: "Dit segment wordt nog gebruikt door {count} kunstwerk(en). Weet je zeker dat je het wilt verwijderen?"
- `stijlenVerwijderBevestiging`: "Deze stijl wordt nog gebruikt door {count} kunstwerk(en). Weet je zeker dat je het wilt verwijderen?"
- `onderwerpenVerwijderBevestiging`: "Dit onderwerp wordt nog gebruikt door {count} kunstwerk(en). Weet je zeker dat je het wilt verwijderen?"
- `verwijderenBevestigen`: "Ja, verwijderen" — één generieke knoptekst, hergebruikt door alle drie de secties (net als het bestaande generieke `annuleren`), in plaats van drie identieke per-sectie keys.

Interpolatiestijl (`{count}`) volgt het bestaande patroon in dit bestand (bv. `kunstwerkenBackfillNamen`).

## Server

Geen wijziging. `DELETE /api/[resource]/[id]` blijft ongewijzigd — de in-gebruik-check gebeurt client-side, net als bij `maten`/`materialen`. Dit is een bewuste keuze: het gaat om een zachte waarschuwing voor een beheerder, niet om het afdwingen van data-integriteit tegen misbruik van de API.

## Tests

Uitbreiden van de bestaande testbestanden (`tests/components/beheer/SegmentenSection.test.tsx`, `StijlenSection.test.tsx`, `OnderwerpenSection.test.tsx`) met, per sectie:

- Verwijderen van een item dat door geen enkel kunstwerk gebruikt wordt: gedrag ongewijzigd (directe verwijdering, geen bevestiging zichtbaar).
- Verwijderen van een item dat door N kunstwerken gebruikt wordt: bevestigingsweergave verschijnt met het juiste aantal, "Opslaan"/"Verwijderen"-knoppen zijn niet meer zichtbaar.
- Annuleren vanuit de bevestigingsweergave: terug naar normale weergave, item niet verwijderd.
- Bevestigen vanuit de bevestigingsweergave: item wordt daadwerkelijk verwijderd (`onRemove` aangeroepen), modal sluit.

Geen wijzigingen nodig aan bestaande tests voor `KunstwerkenSection` — dat gedrag verandert niet.
