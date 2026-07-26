# Design: Omschrijving-veld in de activiteitenlog

## Context

Vervolg op `docs/superpowers/specs/2026-07-22-activiteitenlog-design.md` en `docs/superpowers/specs/2026-07-22-activiteitenlog-uitbreiding-design.md`. Beide eerdere rondes kozen bewust voor "alleen type + wie + wanneer" zonder detailvelden. Gebruiker vroeg naar aanleiding van het Activiteitenlog-scherm expliciet: bij "Materiaal verwijderd" is niet te zien wélk materiaal, bij "Kunstwerk gewijzigd" niet wélk kunstwerk, en bij "Bestelling geplaatst" niet welk bestelnummer. Bij nader onderzoek bleek hetzelfde gat breder te spelen: bij alle klant- en bestelling-acties in Beheer (goedkeuren/afwijzen, prijs vaststellen, prijsgroep/exclusiviteit/minimale afname wijzigen) is de actor de medewerker die klikt, maar staat nergens op wélke klant of bestelling de actie werd toegepast.

Dit deelproject herroept de eerdere "geen detailvelden"-beslissing gericht: één nieuw, optioneel veld `omschrijving` wordt toegevoegd aan alle events die op een specifiek item inwerken.

## Datamodel

Eén nieuw optioneel veld op het Firestore-document in `activiteitenlog` en op de bijbehorende TypeScript-types:

- `src/lib/logActiviteit.ts`: `logActiviteit(type, actor, omschrijving?: string)` — nieuwe derde parameter, optioneel. Als meegegeven, wordt `omschrijving: string` in het document geschreven; als weggelaten (voor de events die er geen krijgen), blijft het veld afwezig — geen `omschrijving: undefined` de-facto write.
- `src/components/beheer/ActiviteitSection.tsx`: `Activiteit`-interface krijgt `omschrijving?: string`.

Optioneel/afwezig in plaats van verplicht, zodat de 64 bestaande Firestore-documenten (zonder dit veld) niet gemigreerd hoeven te worden — die tonen straks een leeg streepje in de nieuwe kolom.

**Alleen de naam, geen diff.** Bij `_gewijzigd`-events bevat de omschrijving alleen de naam van het item ná de wijziging (bv. "Helder glas"), niet wat er precies veranderd is (geen oude→nieuwe-waarde-vergelijking). Bewuste keuze: dat scheelt aanzienlijk bouwwerk op elke wijzig-plek, en de vraag "wélk item" is opgelost — "wat veranderde er precies" blijft een apart, niet nu gebouwd, vraagstuk.

## Welke events krijgen een omschrijving

| Groep | Events | Omschrijving = |
|---|---|---|
| CRUD-tabellen | `materiaalsoort_toegevoegd/gewijzigd/verwijderd`, `materiaal_toegevoegd/gewijzigd/verwijderd`, `segment_toegevoegd/gewijzigd/verwijderd`, `kunstwerk_toegevoegd/gewijzigd/verwijderd`, `prijsgroep_toegevoegd/gewijzigd/verwijderd`, `kunstenaar_toegevoegd/gewijzigd/verwijderd`, `drukker_toegevoegd/gewijzigd/verwijderd` | `omschrijving`-veld van het item (Materiaalsoort/Materiaal/Segment) of `naam`-veld (Kunstwerk/Prijsgroep/Kunstenaar/Drukker) |
| CRUD-tabel Maat | `maat_toegevoegd/gewijzigd/verwijderd` | `Maat` heeft geen naamveld — samengesteld label `${breedte}×${hoogte} cm`, zelfde formaat als de bestaande `maatLabel()`-helper in `ProductModal.tsx:25-27` |
| Klant-acties | `klant_goedgekeurd`, `klant_afgewezen`, `klant_gewijzigd`, `klant_prijsgroep_gewijzigd`, `klant_exclusiviteit_gewijzigd`, `klant_minimale_afname_gewijzigd` | `klant.companyName` |
| Bestelling-acties (enkelvoudig) | `bestelling_geplaatst`, `bestelling_goedgekeurd`, `bestelling_afgewezen`, `bestelling_prijs_vastgesteld`, `bestelling_regel_gewijzigd` | bestelnummer (`bestelnr`) |
| Bestelling-actie (batch) | `bestelling_verstuurd_naar_drukker` | bestelnummers van alle bestellingen in de batch, gejoined met `, ` (bv. `"12045, 12046, 12047"`) — één log-regel per klik, consistent met de bestaande één-aanroep-per-actie in dit dialoog |
| Klant-browsing | `kunstwerk_bekeken`, `mandje_toegevoegd`, `mandje_eigen_maat_toegevoegd` | `kunstwerk.naam` |

**Blijft zonder omschrijving** (geen specifiek doel-item, alleen een self/singleton-actie): `account_bezocht`, `word_klant_bezocht`, `word_klant_aanvraag`, `bedrijfsgegevens_gewijzigd`, `bestelinstellingen_gewijzigd`.

**Extra call site (niet in de oorspronkelijke voorbeelden, wel binnen scope):** `KunstwerkenSection.tsx`'s `handleBackfillNamen` logt ook `kunstwerk_gewijzigd`, maar op dat moment is `kunstwerk.naam` per definitie leeg (dat is nu juist wat er wordt hersteld). Omschrijving daar = de nieuw geschreven waarde (`kunstwerk.omschrijvingNl || kunstwerk.id`), niet het lege oude naamveld.

## Call site inventaris

Bevestigd via codebase-onderzoek — bestaande velden per bestand:

| Bestand | Events | Bron van de omschrijving | Al in scope? |
|---|---|---|---|
| `MateriaalsoortenSection.tsx` | materiaalsoort_* | `omschrijving` (form state / `modalState.materiaalsoort.omschrijving`) | Ja |
| `MaterialenSection.tsx` | materiaal_* | `omschrijving` (form state / `modalState.materiaal.omschrijving`) | Ja |
| `MatenSection.tsx` | maat_* | samengesteld `${breedte}×${hoogte} cm` uit form state / `modalState.maat` | Ja |
| `SegmentenSection.tsx` | segment_* | `omschrijving` (form state / `modalState.segment.omschrijving`) | Ja |
| `KunstwerkenSection.tsx` | kunstwerk_* (incl. backfill) | `naam` (form state / `modalState.kunstwerk.naam`); backfill: `kunstwerk.omschrijvingNl \|\| kunstwerk.id` | Ja |
| `PrijsgroepenSection.tsx` | prijsgroep_* | `naam` (form state / `modalState.prijsgroep.naam`) | Ja |
| `KunstenaarsSection.tsx` | kunstenaar_* | `naam` (form state / `modalState.kunstenaar.naam`) | Ja |
| `DrukkerModal.tsx` | drukker_* | `fields.naam` / `state.drukker.naam` | Ja |
| `KlantModal.tsx` | klant_* (6 events) | `klant.companyName` (prop) | Ja |
| `ProductModal.tsx` | mandje_toegevoegd, mandje_eigen_maat_toegevoegd | `kunstwerk.naam` (prop) | Ja |
| `ProductsGrid.tsx` | kunstwerk_bekeken | `kunstwerk.naam` (parameter van `handleSelect`) | Ja |
| `CartPanel.tsx` | bestelling_geplaatst | `bestelnr` (lokale const, al aanwezig vóór de bestaande `logActiviteit`-call) | Ja |
| `BestellingModal.tsx` | bestelling_goedgekeurd, _afgewezen, _prijs_vastgesteld, _regel_gewijzigd | `bestelling.bestelnr` | **Nee — zie onder** |
| `VersturenNaarDrukkerDialog.tsx` | bestelling_verstuurd_naar_drukker | `bestellingen.map(b => b.bestelnr).join(', ')` | **Nee — zie onder** |

**Bestelnummer moet eerst worden doorgegeven aan het beheer-scherm.** De beheer-side `Bestelling`-interface (`BestellingenSection.tsx`) heeft momenteel geen `bestelnr`-veld — alleen `id`, `klantId`, `companyName`, `besteldatum`, `status`, `lineCount`, `totalQuantity`, `lines`. Het Firestore-document zelf heeft wél een `bestelnr`-veld (geschreven door `CartPanel.tsx` bij plaatsen; ook al gelezen door de klant-facing `useAllOrders.tsx`). Nodig:
- `Bestelling`-interface in `BestellingenSection.tsx`: `bestelnr: string` toevoegen.
- `BeheerShell.tsx`'s `loadBestellingen()` (regel 99-130): `bestelnr: data.bestelnr` toevoegen aan de mapping.

Geen wijziging aan de Firestore-rules voor `bestelheaders` nodig — het veld bestaat al, wordt alleen nu ook gelézen aan de beheer-kant.

## Firestore rules

`firestore.rules:79-97`, de `activiteitenlog`-create-rule, valideert nu strikt `request.resource.data.keys().hasOnly(['type','actorId','actorEmail','actorNaam','timestamp'])`. Wordt:

```
request.resource.data.keys().hasOnly(['type','actorId','actorEmail','actorNaam','timestamp','omschrijving'])
```

`omschrijving` blijft optioneel toegestaan (niet verplicht) zodat events zonder omschrijving (zie "blijft zonder omschrijving" hierboven) geldig blijven. Geen typerestrictie nodig op het veld zelf (analoog aan hoe `actorEmail`/`actorNaam` al met `is string` gecontroleerd worden — `omschrijving` kan dezelfde `is string`-check krijgen wanneer aanwezig, maar dat is een implementatiedetail voor het plan). Regels moeten live opnieuw gedeployed worden vóór de code met het nieuwe veld live gaat (zelfde volgorde-eis als bij de vorige twee activiteitenlog-rondes).

## UI

Nieuwe kolom "Omschrijving" in `ActiviteitSection.tsx`'s `DataTable`, geplaatst tussen "Type" en "Klant". Rijen zonder het veld (alle 64 bestaande, plus de events die bewust geen omschrijving krijgen) tonen een leeg streepje (`–`), geen lege cel — consistent met hoe andere optionele kolommen in de Beheer-tabellen al lege waarden tonen.

## Vertalingen

Eén nieuwe sleutel in `messages/nl.json`'s `beheer`-namespace: `activiteitColOmschrijving` (kolomkop, naast de bestaande `activiteitColTijdstip`/`activiteitColType`/`activiteitColKlant`/`activiteitColEmail`).

## Niet in scope

- **Oude→nieuwe-waarde bij wijzigingen.** Zoals hierboven toegelicht: omschrijving toont alleen de huidige naam, geen velddiff.
- **Migratie van de 64 bestaande activiteitenlog-documenten.** Die blijven zonder `omschrijving`; geen backfill-script.
- **Klikbare koppeling vanuit de omschrijving naar het item zelf** (bv. rechtstreeks doorklikken naar de Klant- of Bestelling-modal). Puur tekstweergave, geen navigatie — kan een latere, aparte uitbreiding zijn.
- **Omschrijving voor de vijf self/singleton-events** (`account_bezocht`, `word_klant_bezocht`, `word_klant_aanvraag`, `bedrijfsgegevens_gewijzigd`, `bestelinstellingen_gewijzigd`) — deze hebben geen specifiek doel-item, actor+type is hier al volledig informatief.

## Risico's / aandachtspunten

- **`BestellingModal.tsx` en `VersturenNaarDrukkerDialog.tsx` zijn de enige twee bestanden die eerst een datamodel-uitbreiding nodig hebben** (bestelnr doorgeven vanaf `BeheerShell.tsx`) vóór de omschrijving daar gevuld kan worden — iets meer werk dan de overige, puur additieve call sites.
- **Twee losse naamconventies voor "hoe heet dit item"** blijven bestaan binnen de entiteiten (`omschrijving` bij Materiaalsoort/Materiaal/Segment, `naam` bij Kunstwerk/Prijsgroep/Kunstenaar/Drukker, samengesteld bij Maat) — geen unificatie hiervan in scope, de omschrijving-logica in elk bestand kiest gewoon het juiste bestaande veld.
- Zelfde bekende volgorde-risico als bij de vorige twee activiteitenlog-uitbreidingen: de Firestore-rules-deploy moet vóór de code-deploy gebeuren, anders worden de eerste calls met een `omschrijving`-veld geweigerd door de oude rule.
