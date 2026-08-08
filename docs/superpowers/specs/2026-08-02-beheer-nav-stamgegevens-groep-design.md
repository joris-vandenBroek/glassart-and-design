# Uitklapbare "Stamgegevens"-groep in beheermenu — design

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 02-08-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

## Probleem

Het beheermenu (`BeheerNav.tsx`) toont 16 items als platte lijst en is daardoor te lang. Een
groot deel van die items wordt maar zelden gewijzigd — het zijn catalogus-/referentietabellen,
geen dagelijkse werkstroom.

## Aanpak

Acht van de zestien items groeperen onder één uitklapbaar menu-item "Stamgegevens", dat
standaard dicht staat.

**Onder "Stamgegevens" (dicht default):**
Materiaalsoorten, Materialen, Maten, Segmenten, Stijlen, Onderwerpen, Prijsgroepen (7 items)

**Blijft top-level, ongewijzigd:**
Klanten, Bestellingen, Kunstwerken, Kunstenaars, Prijsmatrix, Drukkers, Activiteitenlog,
Glassart and Design, Instellingen

Drukkers blijft bewust top-level (niet gegroepeerd) omdat daar de e-mails met orders zichtbaar
zijn — een actief gebruikte sectie, geen stamgegeven. Glassart and Design en Instellingen
blijven om dezelfde reden top-level (bedrijfsgegevens/instellingen, geen catalogusdata).

### Gedrag

- Standaard dicht bij elke mount.
- Automatisch open als `activeSection` een van de 7 gegroepeerde items is — zowel bij initiële
  mount als wanneer `activeSection` van buitenaf verandert (zodat het actieve item nooit
  onzichtbaar wordt achter een dichte groep).
- Klikken op de groep-header toggled open/dicht.
- Klikken op een item binnen de groep gedraagt zich identiek aan nu (roept `onSelect` aan,
  highlight bij actief).
- Geen persistentie van open/dicht-status tussen page reloads buiten de auto-open-regel hierboven
  — "default dicht" is letterlijk elke keer opnieuw dicht, tenzij het actieve item erin zit.

### Implementatie

`src/components/beheer/BeheerNav.tsx`:
- `ACTIVE_ITEMS` blijft de bron voor top-level items; een nieuwe `GROUPED_ITEMS`-array (dezelfde
  vorm: `{ id, labelKey }`) bevat de 7 gegroepeerde items, op dezelfde plek in de volgorde als nu
  (waar Materiaalsoorten nu begint).
- Lokale `open`-state via `useState`, geïnitialiseerd met
  `GROUPED_ITEMS.some(i => i.id === activeSection)`.
- `useEffect` op `activeSection` die `open` op `true` zet zodra `activeSection` in
  `GROUPED_ITEMS` zit (nooit automatisch dicht zetten vanuit dit effect — alleen open forceren).
- Toggle-knop qua stijl consistent met het bestaande chevron-patroon in
  `src/components/FilterSection.tsx` (rotatie van een `▾`-teken, `aria-expanded`).
- Bestaande `data-testid`'s per item (`beheer-nav-materialen`, etc.) blijven ongewijzigd. Nieuwe
  `data-testid="beheer-nav-group-stamgegevens"` op de toggle-knop van de groep.
- Nieuwe i18n-key `beheer.navStamgegevens` = "Stamgegevens" in `messages/nl.json` (en de overige
  locale-bestanden die beheer-strings bijhouden, zelfde patroon als de bestaande `nav*`-keys).
- `BeheerShell.tsx` heeft geen wijziging nodig — het contract (`activeSection`/`onSelect`) blijft
  gelijk.

## Testen

- `tests/components/beheer/BeheerNav.test.tsx`: groep dicht bij default render; opent bij klik op
  groep-header; opent automatisch wanneer `activeSection` een gegroepeerd item is (zowel bij
  initiële render als bij prop-wijziging); klikken op item binnen de groep roept nog steeds
  `onSelect` met het juiste id aan; top-level items ongewijzigd zichtbaar/klikbaar.
- `tests/components/beheer/BeheerShell.test.tsx`: steekproef dat er geen aanname is dat
  `BeheerNav` een platte lijst rendert.

## Scope

Alleen `BeheerNav.tsx` en de bijbehorende testfile(s) en i18n-keys. Geen wijziging aan
`BeheerShell.tsx`-logica, geen wijziging aan welke secties bestaan.
