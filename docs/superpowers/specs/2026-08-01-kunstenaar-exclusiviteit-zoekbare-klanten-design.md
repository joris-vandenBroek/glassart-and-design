# Kunstenaar-exclusiviteit: zoekbare klantselectie — design

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 01-08-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

## Probleem

`KunstenaarsSection.tsx` toont "Exclusief verkooprecht voor klant" (`exclusieveKlantIds`, max 2
entries) nu als een `<fieldset>` met één checkbox per klant (`KunstenaarsSection.tsx:505-526`).
Dat schaalt niet: met veel klanten wordt de lijst lang en onhandig om in te scrollen/zoeken.

## Aanpak

Vervang de checkboxlijst door twee onafhankelijke zoekvelden — "Klant 1" en "Klant 2" — gebouwd
met de al bestaande `Combobox`-component (`src/components/Combobox.tsx`), op dezelfde manier
waarop `KlantModal.tsx:449-457` die al gebruikt voor `Klant.kunstenaarId`. Geen wijziging aan
`Combobox.tsx` zelf, aan de database/API-laag, of aan de bestaande zakelijke regel.

### State

Vervang de ene `exclusieveKlantIds: string[]` state door twee losse slots:

```ts
const [klant1Id, setKlant1Id] = useState<string | null>(null);
const [klant2Id, setKlant2Id] = useState<string | null>(null);
```

`exclusieveKlantIds` wordt een afgeleide waarde (geen state meer), gebruikt voor het
opslag-payload en de bestaande `exclusiviteitLabel`-weergave in de tabel:

```ts
const exclusieveKlantIds = [klant1Id, klant2Id].filter((id): id is string => id !== null);
```

- `resetForm` / `openAdd`: beide slots naar `null`.
- `openEdit`: `setKlant1Id(kunstenaar.exclusieveKlantIds[0] ?? null)`,
  `setKlant2Id(kunstenaar.exclusieveKlantIds[1] ?? null)`.

Bewuste keuze: de twee slots zijn vaste posities, geen automatisch "opschuiven". Als "Klant 1"
leeggemaakt wordt terwijl "Klant 2" gevuld is, blijft "Klant 2" ongewijzigd staan in zijn eigen
veld — de lijst comprimeert niet stilzwijgend naar `[klant2]`. Bevestigd met de klant: dat is het
gewenste gedrag.

### Validatie (ongewijzigde regel, nu toegepast op de tweede combobox)

De bestaande regel blijft exact: bij 2 gevulde slots moet één daarvan de klant zijn wiens
`Klant.kunstenaarId` naar deze kunstenaar wijst (`eigenKlantId`, ongewijzigd). Eén handler voor
beide slots:

```ts
function selectKlant(slot: 'klant1' | 'klant2', nextId: string | null) {
  const huidigeKunstenaarId = modalState?.mode === 'edit' ? modalState.kunstenaar.id : null;
  const nextKlant1 = slot === 'klant1' ? nextId : klant1Id;
  const nextKlant2 = slot === 'klant2' ? nextId : klant2Id;
  const nextIds = [nextKlant1, nextKlant2].filter((id): id is string => id !== null);
  if (nextIds.length === 2) {
    const eigenId = eigenKlantId(huidigeKunstenaarId);
    if (eigenId === null || !nextIds.includes(eigenId)) {
      setActionError(t('kunstenaarsExclusiviteitOngeldig'));
      return;
    }
  }
  setActionError(null);
  setKlant1Id(nextKlant1);
  setKlant2Id(nextKlant2);
}
```

- Een slot leegmaken (`nextId: null`) kan de regel nooit breken (gaat van 2→1 of 1→0), dus dat
  gaat altijd door.
- Een tweede slot vullen terwijl de regel het niet toelaat: de nieuwe waarde wordt **niet**
  toegepast (combobox valt terug op zijn huidige — lege — waarde) en `kunstenaar-modal-error`
  toont dezelfde tekst als vandaag.
- `handleSave` behoudt zijn eigen defensieve herhaling van deze check (klant kan tussentijds via
  het Klant-scherm ontkoppeld zijn) — ongewijzigd, werkt al op de afgeleide `exclusieveKlantIds`.

### Geen dubbele klant in beide slots

Elke combobox' `options`-lijst sluit de klant uit die in de *andere* slot al gekozen is, zodat
dezelfde klant niet in beide velden gekozen kan worden:

```ts
options={(klanten ?? [])
  .filter((klant) => klant.id !== klant2Id)
  .map((klant) => ({ value: klant.id, label: klant.companyName }))}
```
(spiegelbeeld voor de Klant 2-combobox, filtert op `klant1Id`)

### Rendering

De `<fieldset>` met checkboxes (`KunstenaarsSection.tsx:505-526`) wordt:

```tsx
<fieldset className="flex flex-col gap-3">
  <legend className="text-xs uppercase tracking-wide text-white/60">
    {t('kunstenaarsLabelKlant')}
  </legend>
  <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
    {t('kunstenaarsLabelKlant1')}
    <Combobox
      options={/* klanten zonder klant2Id, zie boven */}
      value={klant1Id}
      onChange={(value) => selectKlant('klant1', value)}
      placeholder={t('kunstenaarsKlantPlaceholder')}
      noResultsLabel={t('kunstenaarsKlantGeenResultaten')}
      clearLabel={t('kunstenaarsKlantGeen')}
      testId="kunstenaar-modal-klant-1"
    />
  </label>
  <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
    {t('kunstenaarsLabelKlant2')}
    <Combobox
      options={/* klanten zonder klant1Id */}
      value={klant2Id}
      onChange={(value) => selectKlant('klant2', value)}
      placeholder={t('kunstenaarsKlantPlaceholder')}
      noResultsLabel={t('kunstenaarsKlantGeenResultaten')}
      clearLabel={t('kunstenaarsKlantGeen')}
      testId="kunstenaar-modal-klant-2"
    />
  </label>
</fieldset>
```

`Combobox` moet weer geïmporteerd worden in dit bestand (was verwijderd toen de checkboxlijst
er kwam).

## i18n (`messages/nl.json`, namespace `beheer` — bestaat alleen in NL)

Nieuwe keys, naast het al bestaande `kunstenaarsLabelKlant` (blijft de fieldset-legend):

| Key | Waarde |
|---|---|
| `kunstenaarsLabelKlant1` | "Klant 1" |
| `kunstenaarsLabelKlant2` | "Klant 2" |
| `kunstenaarsKlantPlaceholder` | "Zoek een klant…" |
| `kunstenaarsKlantGeenResultaten` | "Geen klanten gevonden." |
| `kunstenaarsKlantGeen` | "Geen" |

`kunstenaarsExclusiviteitOpen` en `kunstenaarsExclusiviteitOngeldig` blijven ongewijzigd.

## Tests (`tests/components/beheer/KunstenaarsSection.test.tsx`)

Bestaande tests die de checkboxen bedienen (`kunstenaar-modal-klant-<klantId>`) worden herschreven
naar de combobox-interactie (typen/klikken op `kunstenaar-modal-klant-1`/`-2` en hun
`-option-<klantId>`/`-option-clear`), met dezelfde verwachte uitkomsten:

- toevoegen met precies 1 exclusieve klant (was: 1 checkbox aanvinken).
- een nieuwe kunstenaar kan geen 2e klant kiezen (geen eigen klantaccount om aan de regel te
  voldoen) → `kunstenaar-modal-error`, 2e slot blijft leeg.
- een bestaande kunstenaar kan wél een 2e klant kiezen wanneer die het eigen gekoppelde
  klantaccount is.
- bewerken met een al gevulde `exclusieveKlantIds` toont de juiste klant in het juiste slot.

Geen wijziging nodig aan `resolveOrderRight`, de API-routes, of de database — dit is uitsluitend
een UI-wijziging aan de invoer, het opslag-payload (`exclusieveKlantIds: string[]`) blijft
identiek.

## Scope

Alleen `src/components/beheer/KunstenaarsSection.tsx`, `messages/nl.json`, en
`tests/components/beheer/KunstenaarsSection.test.tsx`.

## Niet in scope

- Geen wijziging aan de max-2-regel of aan `eigenKlantId`/`resolveOrderRight`.
- Geen wijziging aan `Combobox.tsx` of aan hoe `KlantModal.tsx` zijn eigen combobox gebruikt.
- Geen automatisch "opschuiven" van Klant 2 naar Klant 1 wanneer Klant 1 leeggemaakt wordt.
