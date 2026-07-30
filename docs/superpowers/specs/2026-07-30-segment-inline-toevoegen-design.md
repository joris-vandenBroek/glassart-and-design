# Segment inline toevoegen bij kunstwerk — design

## Probleem

Op het kunstwerkformulier (`KunstwerkenSection.tsx`) kunnen Stijl en Onderwerp al inline een
gloednieuwe waarde krijgen: een tekstveld + "Toevoegen"-knop maakt een nieuwe rij in de
`stijlen`/`onderwerpen`-lookuptabel aan en vinkt die meteen aan op het kunstwerk. Segmenten mist
deze mogelijkheid — daar kan alleen uit bestaande segmenten gekozen worden (nieuwe segmenten
moeten via de aparte Segmenten-beheerpagina worden aangemaakt).

`segmentIds` bestaat al als verplicht JSON-array-veld op `kunstwerken` (checkbox-lijst, "Kies
minimaal één segment"-validatie) — dat deel werkt al en verandert niet. Deze wijziging voegt
alleen de inline "nieuwe waarde toevoegen"-interactie toe, gelijk aan Stijl/Onderwerp.

## Aanpak

Exacte 1:1-kopie van het Stijl-patroon, toegepast op Segment. Geen schema- of API-wijziging nodig:
`segmentIds` is al een `jsonColumn` op `kunstwerken` in `lookupResources.ts`, en `segmenten.add`
(via `useApiCollection<Segment>('segmenten')` in `BeheerShell.tsx`) is dezelfde generieke
lookup-add-call die `stijlen.add`/`onderwerpen.add` al gebruiken.

### `KunstwerkenSection.tsx`

- Nieuwe prop `onAddSegment: (data: Omit<Segment, 'id'>) => Promise<boolean>`.
- Nieuwe state: `nieuweSegmentNaam`, `pendingNieuweSegmentNaam`, `segmentToevoegenError` —
  kopie van de Stijl-equivalenten (regels 94, 96, 98).
- Nieuwe `useEffect` die `pendingNieuweSegmentNaam` bewaakt en, zodra het net aangemaakte segment
  in de `segmenten`-prop verschijnt, het automatisch aanvinkt — kopie van regels 111-119.
- Nieuwe `handleAddNieuweSegment()` — kopie van `handleAddNieuweStijl()` (regels 131-149):
  trimt de naam, checkt eerst op een bestaande (case-insensitive) match, vinkt die aan indien
  gevonden, roept anders `onAddSegment({ omschrijving: naam })` aan en logt
  `segment_toegevoegd` bij succes.
- Reset van de nieuwe state in de vormreset-functie (naast de bestaande `setStijlIds`-reset rond
  regel 307-314).
- Segmenten-`<fieldset>` (regels 689-713) krijgt hetzelfde tekstinvoerveld + "Toevoegen"-knopblok
  als Stijl (regels 780-798), na de bestaande checkbox-lijst en vóór/naast de bestaande
  "verplicht"-hint. De rode-rand-validatie op `segmentIds.length === 0` blijft ongewijzigd.

### `BeheerShell.tsx`

- `onAddSegment={segmenten.add}` toevoegen aan de `<KunstwerkenSection>`-props, naast de
  bestaande `onAddStijl={stijlen.add}` / `onAddOnderwerp={onderwerpen.add}`.

### i18n

De `beheer`-namespace bestaat alleen in `messages/nl.json` (het beheerscherm is Nederlandstalig;
`en`/`de`/`fr` hebben geen `beheer`-sectie) — dus nieuwe keys hoeven alleen in `nl.json` te worden
toegevoegd, gemodelleerd naar de bestaande Stijl-keys:

- `kunstwerkenNieuweSegmentPlaceholder`
- `kunstwerkenNieuweSegmentToevoegen`
- `kunstwerkenNieuweSegmentError`

(`kunstwerkenLabelSegmenten` en `kunstwerkenSegmentenVerplicht` bestaan al en blijven ongewijzigd.)

### Activiteitenlog

`segment_toegevoegd` bestaat al als actie-type in `logActiviteit.ts` (nu alleen gebruikt vanaf de
losse Segmenten-beheerpagina). Deze wijziging hergebruikt dezelfde actie wanneer een segment
inline vanuit het kunstwerkformulier wordt toegevoegd — geen nieuw actie-type nodig.

### Tests

`tests/components/beheer/KunstwerkenSection.test.tsx` uitbreiden met het segment-equivalent van
de bestaande "voegt een nieuwe stijl toe"-test (rond regel 868-877): tekst intypen, op
"Toevoegen" klikken, controleren dat `onAddSegment` met `{ omschrijving: ... }` wordt aangeroepen.

## Scope

Alleen het kunstwerk-beheerformulier. Geen wijzigingen aan de publieke site
(`ProductsGrid.tsx`/`CollectiesDropdown.tsx`), de database-schema, of de generieke
`[resource]`-API-route — die ondersteunen `segmentIds` al volledig.

## Niet in scope

- Geen wijziging aan hoe Segment op de publieke site wordt gefilterd (blijft single-select
  "collectie"-tabs, in tegenstelling tot de multi-select checkbox-facetten van Stijl/Onderwerp op
  `ProductsGrid.tsx`) — dat is een bewust ander UI-patroon en valt buiten deze wijziging.
- Geen wijziging aan de bestaande verplicht-veld-validatie voor Segmenten.
