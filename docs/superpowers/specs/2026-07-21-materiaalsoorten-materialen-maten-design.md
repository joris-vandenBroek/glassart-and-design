# Design: Beheer — materiaalsoorten, materialen en maten

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 21-07-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

## Context

`/beheer` heeft sinds [2026-07-21-beheer-datatabellen-design.md](2026-07-21-beheer-datatabellen-design.md) een navigatiemenu met generieke `DataTable`/`Modal`-bouwstenen, met **Materialen** en **Maten** als uitgeschakelde plaatshouders. Dit deelproject bouwt die twee secties, plus een nieuwe derde sectie **Materiaalsoorten**, als volledige Firestore-backed CRUD-tabellen (tonen, toevoegen, bewerken, verwijderen).

Dit is de eerste sectie in de beheeromgeving met een "nieuwe rij toevoegen"-flow — Klanten en Facturen hebben die nog niet. Er bestaat ook nog geen generieke Firestore-CRUD-hook; die introduceren we hier omdat drie structureel vergelijkbare secties anders hun fetch/add/update/delete-logica drie keer zouden dupliceren.

## Datamodel

**Collectie `materiaalsoorten`**
```ts
interface Materiaalsoort {
  id: string;           // Firestore doc-id
  omschrijving: string; // bv. "Veiligheidsglas"
}
```

**Collectie `materialen`**
```ts
interface Materiaal {
  id: string;               // Firestore doc-id
  materiaalsoortId: string; // verwijst naar Materiaalsoort.id
  materiaaldikte: number;   // in mm
  omschrijving: string;     // bv. "Onze specialiteit. Kristalhelder, sterk en veilig."
}
```

**Collectie `maten`**
```ts
interface Maat {
  id: string;      // Firestore doc-id
  breedte: number; // cm
  hoogte: number;  // cm
}
```

Het zichtbare "id"-veld in elke tabel is steeds `docSnapshot.id` (net als `Klant.id` nu al) — geen apart, zelf in te vullen id-veld in de formulieren.

## Architectuur — nieuwe bouwstenen

- **`src/lib/useFirestoreCollection.ts`** — generieke hook `useFirestoreCollection<T>(collectionName, options?)`:
  - `items: T[]`, `loading`, `error`
  - `add(data)` → `addDoc`, `update(id, data)` → `updateDoc`, `remove(id)` → `deleteDoc`
  - `refetch()`
  - `options.seed?: Omit<T, 'id'>[]` — als de eerste `getDocs` een lege collectie oplevert, worden deze items via `addDoc` weggeschreven en volgt een `refetch()`. Dit is de enige plek in de hook die om seed-data weet; de sectie levert de data.
  - Dit is de eerste generieke abstractielaag voor Firestore-CRUD in het project (tot nu toe deed elke component dit inline). Gerechtvaardigd omdat drie secties anders identieke fetch/add/update/delete-code zouden herhalen.

- **`src/components/beheer/MateriaalsoortenSection.tsx`** + gebruikt `Modal` inline voor het toevoeg/bewerk-formulier (geen apart `MateriaalsoortModal.tsx` nodig — één tekstveld).
- **`src/components/beheer/MaterialenSection.tsx`** + `Modal` inline voor het formulier (materiaalsoort-dropdown, dikte, omschrijving).
- **`src/components/beheer/MatenSection.tsx`** + `Modal` inline voor het formulier (breedte, hoogte).

Elke sectie gebruikt `useFirestoreCollection` voor zijn eigen collectie en bouwt zelf zijn `DataTable`-kolommen, net zoals `KlantenSection` dat nu voor klanten doet. `MaterialenSection` gebruikt de hook daarnaast (alleen-lezend) voor `materiaalsoorten`, om de dropdown te vullen en de materiaalsoort-naam in de tabelkolom te tonen in plaats van het ruwe id.

## Seed-data (materiaalsoorten + materialen)

Bij het eerste bezoek aan een lege collectie vult `useFirestoreCollection` deze automatisch, gebaseerd op de bestaande "Waarom Glassart & Design"-sectie op de homepage (`messages/nl.json`, `whyUs.materials.*`):

**Materiaalsoorten:** Veiligheidsglas, Dibond, Acryl, Akoestische stof

**Materialen** (geseed nadat materiaalsoorten hun echte Firestore-ids hebben gekregen — `MaterialenSection` wacht met zijn eigen seed-check tot de materiaalsoorten-hook klaar is):

| materiaalsoort | dikte (mm) | omschrijving |
|---|---|---|
| Veiligheidsglas | 4 | Onze specialiteit. Kristalhelder, sterk en veilig. |
| Dibond | 3 | Lichtgewicht, stijf en vormvast met een matte uitstraling. |
| Acryl | 3 | Licht en helder met een luxe glanzende look. |
| Acryl | 5 | Extra diepte en stevigheid voor een indrukwekkend effect. |
| Acryl | 10 | Maximale diepwerking voor exclusieve presentatie. |
| Akoestische stof | 0 | Verbetert de akoestiek en geeft een warme, moderne uitstraling. |

Akoestische stof heeft geen dikte in mm op de homepage; dikte wordt hier `0` als placeholder (later handmatig aan te passen).

`maten` krijgt geen seed-data en start leeg.

## UI per sectie

**Materiaalsoorten**
- Tabel: kolom "Omschrijving" (tekst, filter+sorteer).
- "Materiaalsoort toevoegen" → modal met 1 tekstveld.
- Rijklik → zelfde modal, prefilled, met "Opslaan" (update) en "Verwijderen".
- Verwijderregel: vóór het verwijderen checkt de sectie (via de materialen-hook) of er nog materialen met deze `materiaalsoortId` bestaan; zo ja, foutmelding tonen en niet verwijderen.

**Materialen**
- Tabel: kolommen "Materiaalsoort" (naam via lookup; filter als select met materiaalsoort-namen), "Dikte (mm)", "Omschrijving".
- Toevoeg/bewerk-modal: dropdown materiaalsoort, numeriek dikte-veld, tekstveld omschrijving.
- Geen verwijderblokkade nodig (niets verwijst naar een materiaal).

**Maten**
- Tabel: kolommen "Breedte (cm)", "Hoogte (cm)".
- Toevoeg/bewerk-modal: twee numerieke velden.
- Start leeg.

## Navigatie

- `BeheerNav.tsx`: `materialen` en `maten` verhuizen van `DISABLED_ITEMS` naar `ACTIVE_ITEMS`; nieuw item `materiaalsoorten` toegevoegd aan `ACTIVE_ITEMS`, vóór `materialen` (soorten eerst, materialen verwijzen ernaar).
- `BeheerSection`-type: `'klanten' | 'facturen' | 'materiaalsoorten' | 'materialen' | 'maten'`.
- Elk nieuw item krijgt een `xxxCount`-prop vanuit `BeheerShell` (aantal rijen in de collectie).
- `BeheerShell.tsx`: render-ternary wordt een if/else-chain voor 5 secties; materiaalsoorten worden al bij het laden van de shell opgehaald (zoals nu al met klanten gebeurt), zodat de teller klopt en de materialen-dropdown meteen beschikbaar is.

## Vertalingen

Alleen in `messages/nl.json`, in de bestaande `beheer`-namespace (zelfde conventie als het datatabellen-deelproject — geen wijzigingen aan `en.json`/`de.json`/`fr.json`):

```
navMateriaalsoorten                         (nieuw; navMaterialen/navMaten bestaan al)
materiaalsoortenCol{Omschrijving}
materiaalsoortenEmpty, materiaalsoortenLoadError, materiaalsoortenActionError
materiaalsoortenLabel{Omschrijving}
materiaalsoortenToevoegen, materiaalsoortenOpslaan, materiaalsoortenVerwijderen
materiaalsoortenVerwijderBlocked

materialenCol{Materiaalsoort,Dikte,Omschrijving}
materialenEmpty, materialenLoadError, materialenActionError
materialenLabel{Materiaalsoort,Dikte,Omschrijving}
materialenToevoegen, materialenOpslaan, materialenVerwijderen

matenCol{Breedte,Hoogte}
matenEmpty, matenLoadError, matenActionError
matenLabel{Breedte,Hoogte}
matenToevoegen, matenOpslaan, matenVerwijderen
```

## Tests

Zelfde patroon als bestaande beheer-tests (Vitest + Testing Library, echte `nl.json`, Firestore gemockt op moduleniveau via `vi.mock('firebase/firestore', ...)`):

- `useFirestoreCollection.test.ts` — fetch, add, update, remove, auto-seed bij lege collectie (elk apart getest).
- `MateriaalsoortenSection.test.tsx` — tabel toont data, toevoegen, bewerken, verwijderen, verwijderblokkade bij gekoppelde materialen.
- `MaterialenSection.test.tsx` — tabel toont materiaalsoort-naam (niet het ruwe id), toevoegen/bewerken/verwijderen, dropdown gevuld uit materiaalsoorten.
- `MatenSection.test.tsx` — tabel toont data, toevoegen/bewerken/verwijderen.
- `BeheerNav.test.tsx` — update: materialen/maten niet meer disabled, materiaalsoorten nieuw aanwezig.
- `BeheerShell.test.tsx` — update: fetch/count/switch voor de 3 nieuwe secties.

## Niet in scope

- Zelf in te vullen/leesbare id-codes (bv. "MAT-001") — het zichtbare id is altijd het Firestore doc-id.
- Seed-data voor `maten`.
- Een los, handmatig te draaien seed-script — seeding gebeurt automatisch bij eerste gebruik via de hook.
- Wijzigingen aan `en.json`/`de.json`/`fr.json`.
- Koppeling van `materialen`/`maten` aan andere onderdelen van de site (bv. de bestel- of productflow) — dit deelproject bouwt alleen de beheer-tabellen zelf.

## Risico's / aandachtspunten

- Auto-seed-bij-leeg-collectie is een nieuw patroon (geen bestaand precedent in dit project). Risico: als twee beheerders tegelijk de sectie voor het eerst openen, kunnen er dubbele seed-rijen ontstaan (race condition, geen transactie/lock). Voor de huidige schaal (één beheerder tegelijk, in de praktijk) is dit acceptabel; bij een groeiend team zou een Firestore-transactie of een eenmalig "seeded"-vlagdocument nodig zijn — niet nu gebouwd (YAGNI).
- De verwijderblokkade voor materiaalsoorten controleert live via de materialen-hook; dit vereist dat materialen al (of alsnog) opgehaald zijn op het moment van verwijderen. `MateriaalsoortenSection` moet dit expliciet afdwingen (bv. de materialen-hook ook laden, ook als de gebruiker nog niet op het Materialen-tabblad is geweest).
