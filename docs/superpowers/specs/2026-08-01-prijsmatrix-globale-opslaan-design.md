# Prijsmatrix: globale Opslaan-knop

**Datum:** 2026-08-01
**Status:** Approved

## Aanleiding

De Prijsmatrix-pagina ([PrijsmatrixSection.tsx](../../../src/components/beheer/PrijsmatrixSection.tsx)) sloeg elke prijscel apart op zodra het invoerveld de focus verloor (`onBlur`), zonder aparte "Opslaan"-knop — een bewuste keuze uit het oorspronkelijke ontwerp ([2026-07-30-prijsmatrix-en-prijsmodule-design.md](2026-07-30-prijsmatrix-en-prijsmodule-design.md)). Op 2026-08-01 is daar een groene ✓-indicator per cel aan toegevoegd zodat een succesvolle save zichtbaar is.

Bij het bespreken daarvan bleek het blur-gebaseerde model risicovol: een wijziging wordt alleen opgeslagen als het veld daadwerkelijk de focus verliest (Tab, klikken, wisselen van sectie). Enter drukken of het tabblad sluiten zonder eerst te blurren verliest de wijziging stilzwijgend. De gebruiker gaf de voorkeur aan één globale Opslaan-knop die alle gewijzigde cellen in één atomaire actie wegschrijft, zodat er nooit een half bijgewerkte matrix ontstaat.

## Ontwerp

### API — bulk-upsert in één transactie

`PUT /api/prijsmatrix` ([route.ts](../../../src/app/api/prijsmatrix/route.ts)) verandert van contract: in plaats van één regel (`{ maatId, materiaalId, prijs }`) accepteert het een array:

```json
PUT /api/prijsmatrix
{ "regels": [{ "maatId": "...", "materiaalId": "...", "prijs": 123.45 }, ...] }
```

De handler opent een transactie via `pool.getConnection()` / `beginTransaction()` (zelfde patroon als [bestelheaders/route.ts](../../../src/app/api/bestelheaders/route.ts)), voert de upserts sequentieel uit, en doet `commit()` bij succes of `rollback()` zodra er ook maar één upsert faalt. Bij een rollback komt er één foutrespons (bv. 400/500) terug — geen partial-success semantiek.

Dit is de enige consument van deze dedicated route (niet onderdeel van `LOOKUP_RESOURCES`), dus het bestaande single-cell contract wordt volledig vervangen, niet ernaast gezet als aparte `/bulk`-route.

`GET /api/prijsmatrix` blijft ongewijzigd.

### Client — dirty-tracking + globale save

`PrijsmatrixSection.tsx` krijgt twee losse per-cel statussen (sleutel `${maatId}:${materiaalId}`, zoals nu al met `key()`):

- **`gewijzigdeCellen`**: gezet in `onChange` zodra de ingevoerde waarde afwijkt van de laatst bekende opgeslagen prijs; verwijderd zodra de waarde weer gelijk is aan de opgeslagen prijs, of na een succesvolle save.
- **`opgeslagenCellen`** (bestaand): blijft het groene ✓-vinkje aansturen, maar wordt nu gezet na een succesvolle *bulk*-save in plaats van na elke losse blur-save. Wordt gewist zodra de cel weer bewerkt wordt (bestaand gedrag, ongewijzigd).

`onBlur` verliest zijn huidige verantwoordelijkheid (de PUT-call) volledig — bewerken update alleen nog lokale state via `onChange`.

Onder de tabel (bij de bestaande hint-tekst) komt een `<button>` "Opslaan":
- Uitgeschakeld zolang `gewijzigdeCellen` leeg is, en tijdens het opslaan zelf (voorkomt dubbele submits — lokale `isSaving`-state).
- Op klik: verzamelt alle gewijzigde cellen, stuurt ze in één `PUT /api/prijsmatrix`-call met de nieuwe bulk-body.
  - **Succes:** alle betrokken cellen verhuizen van `gewijzigdeCellen` naar `opgeslagenCellen`; per cel wordt (zoals nu al gebeurt) een `activiteitenlog`-regel `prijsmatrix_gewijzigd` gelogd en `onRegelUpdated` aangeroepen.
  - **Falen:** niets wijzigt aan `gewijzigdeCellen` (alles blijft gemarkeerd als niet-opgeslagen) en de bestaande foutmelding (`prijsmatrixActionError`, onder de tabel) verschijnt — de gebruiker kan de invoer laten staan en gewoon opnieuw op Opslaan klikken.

### Visuele indicatoren

Twee onderscheidbare, elkaar uitsluitende markeringen per cel, naast het bestaande `€`-teken en invoerveld:

- **Gewijzigd, nog niet opgeslagen:** klein geel/oranje stipje, `data-testid="prijsmatrix-gewijzigd-{maatId}-{materiaalId}"`.
- **Opgeslagen:** bestaand groen ✓-vinkje, `data-testid="prijsmatrix-saved-{maatId}-{materiaalId}"` (ongewijzigde testid/styling).

### Foutafhandeling

Eén gecombineerde foutmelding bij een mislukte bulk-save (network error of non-2xx response), hergebruik van de bestaande `prijsmatrixActionError`-string en `data-testid="prijsmatrix-action-error"`. Geen per-cel foutmeldingen, want de save is atomisch: het is nooit "deze cel wel, die cel niet".

## Testen

- `tests/components/beheer/PrijsmatrixSection.test.tsx`: de bestaande "saves on blur" / "shows saved confirmation on blur" tests worden vervangen door tests voor het nieuwe gedrag: bewerken zet het gewijzigd-stipje, de Opslaan-knop is uitgeschakeld zonder wijzigingen en actief zodra er minstens één cel gewijzigd is, klikken bundelt alle gewijzigde cellen in één bulk-PUT-call, succes zet de vinkjes en wist de stipjes, falen laat alles gemarkeerd als gewijzigd en toont de foutmelding.
- `tests/app/api/prijsmatrix.test.ts`: de single-cell PUT-tests worden vervangen door bulk-PUT-tests — meerdere regels in één call correct upserten, en een transactie-rollback verifiëren wanneer één regel in de batch ongeldig is (bv. een niet-bestaande `maatId`, die door de FK-constraint op `prijsmatrix.maatId` een DB-fout veroorzaakt).

## Buiten scope

- Geen "niet-opgeslagen wijzigingen"-waarschuwing bij het verlaten van de pagina (`beforeunload`) — niet gevraagd, kan later als aparte follow-up.
- Geen wijziging aan hoe `GET /api/prijsmatrix` werkt.
