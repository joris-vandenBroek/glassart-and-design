# Design: Formaat (vierkant/liggend/staand) per kunstwerk

## Context

`Kunstwerk` is een door Beheer beheerd catalogusitem (`src/components/beheer/KunstwerkenSection.tsx`,
type `Kunstwerk` in `src/components/beheer/materiaalTypes.ts`). Een kunstwerk verwijst via
`maatIds` naar de beschikbare `Maat`-opties (`{ breedte, hoogte }`, `src/components/beheer/MatenSection.tsx`).
Vandaag heeft een `Maat` geen oriëntatie — of iets vierkant is volgt alleen uit `breedte === hoogte`,
en verder is er geen onderscheid tussen liggend/staand: dezelfde afmeting (bv. 50×70) kan bij het ene
kunstwerk liggend en bij het andere staand gedrukt worden.

Dit deelproject voegt een verplichte **formaat**-keuze toe aan elk kunstwerk (Vierkant / Liggend /
Staand), gekozen door Beheer (niet door de klant), met automatische voorselectie op basis van de
kunstwerk-foto. De keuze filtert welke maten voor dat kunstwerk selecteerbaar zijn, en moet — als
liggend of staand gekozen is — zichtbaar zijn op de orderregel die naar de drukker gaat (zie
`docs/superpowers/specs/2026-07-26-drukker-order-workflow-design.md`, waarvan Sectie C hiermee wordt
uitgebreid).

## Sectie A: Data model

`src/components/beheer/materiaalTypes.ts`:

```ts
export type KunstwerkFormaat = 'vierkant' | 'liggend' | 'staand';

export interface Kunstwerk {
  // ...bestaande velden...
  formaat: KunstwerkFormaat | null;
}
```

`null` bestaat uitsluitend om bestaande Firestore-documenten (aangemaakt vóór deze feature) zonder
crash te kunnen inlezen — zie Sectie D voor de verplichting bij opslaan. `Maat` blijft ongewijzigd:
geen nieuw veld. Of een `Maat` "vierkant" is, wordt overal afgeleid met een kleine helper:

```ts
export function isVierkanteMaat(maat: Maat): boolean {
  return maat.breedte === maat.hoogte;
}
```

(in `materiaalTypes.ts`, naast de overige types — gebruikt door zowel de formulierlogica in Sectie C
als eventueel elders.)

## Sectie B: Automatische detectie op basis van de foto

Nieuwe helper `src/lib/detectKunstwerkFormaat.ts`:

```ts
export function detectFormaatFromDimensions(width: number, height: number): KunstwerkFormaat {
  const ratio = width / height;
  if (ratio >= 0.95 && ratio <= 1.05) return 'vierkant';
  return ratio > 1.05 ? 'liggend' : 'staand';
}

export function detectFormaatFromImageUrl(url: string): Promise<KunstwerkFormaat | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(detectFormaatFromDimensions(img.naturalWidth, img.naturalHeight));
    img.onerror = () => resolve(null);
    img.crossOrigin = 'anonymous';
    img.src = url;
  });
}
```

`detectFormaatFromImageUrl` wordt in `KunstwerkenSection.tsx` op twee momenten aangeroepen:

1. **Nieuwe foto gekozen** (in de bestaande `handleFotoFile`, na het zetten van de preview): roep aan
   met een `URL.createObjectURL(file)`, en zet bij een niet-`null` resultaat `formaat` in de
   formulier-state naar de gedetecteerde waarde (overschrijft een eventueel eerder gekozen formaat —
   een nieuwe foto is een nieuwe voorselectie).
2. **Bewerkformulier geopend voor een bestaand kunstwerk waarvan `formaat === null`** (in een `useEffect`
   die op het openen van de modal reageert): roep aan met `kunstwerk.foto`. Bij een niet-`null`
   resultaat wordt dat de voorselectie; blijft de detectie `null` (laad-/CORS-fout), dan blijft er
   geen knop geselecteerd en moet de beheerder handmatig kiezen.

Detectie overschrijft nooit een formaat dat al écht op het kunstwerk staat (`formaat !== null` bij het
openen) — alleen het geval "nog geen keuze gemaakt" triggert automatische voorselectie bij het openen.
Een nieuwe foto-upload overschrijft wél altijd, ongeacht de vorige waarde, conform de eerder
afgesproken "overrulebaar, maar foto leidend bij upload".

## Sectie C: Beheer-UI — formaatkeuze en maten-filtering

In `KunstwerkenSection.tsx`'s formulier (waar nu al de `segmentIds`/`materiaalIds`/`maatIds`
checkbox-fieldsets staan, regels 376-423), komt vóór de maten-fieldset een nieuwe radiogroep:

```tsx
<fieldset className="flex gap-4">
  <legend>{t('kunstwerkenLabelFormaat')}</legend>
  {(['vierkant', 'liggend', 'staand'] as const).map((optie) => (
    <label key={optie}>
      <input
        type="radio"
        name="formaat"
        checked={form.formaat === optie}
        onChange={() => setFormaat(optie)}
        data-testid={`kunstwerk-modal-formaat-${optie}`}
      />
      {t(`kunstwerkenFormaat_${optie}`)}
    </label>
  ))}
</fieldset>
```

`setFormaat(optie)` zet niet alleen `form.formaat`, maar filtert in dezelfde stap `form.maatIds`:

```ts
function setFormaat(optie: KunstwerkFormaat) {
  setForm((current) => ({
    ...current,
    formaat: optie,
    maatIds: current.maatIds.filter((id) => {
      const maat = maten.find((m) => m.id === id);
      if (!maat) return true;
      return optie === 'vierkant' ? isVierkanteMaat(maat) : !isVierkanteMaat(maat);
    }),
  }));
}
```

De maten-checkbox-fieldset (bestaande code, regels 410-423) krijgt een `disabled`-voorwaarde per
checkbox:

```tsx
{maten.map((maat) => {
  const incompatibel =
    form.formaat !== null &&
    (form.formaat === 'vierkant' ? !isVierkanteMaat(maat) : isVierkanteMaat(maat));
  return (
    <label key={maat.id} className={incompatibel ? 'opacity-40' : undefined}>
      <input
        type="checkbox"
        disabled={incompatibel}
        checked={form.maatIds.includes(maat.id)}
        onChange={() => toggle('maatIds', maat.id)}
        data-testid={`kunstwerk-modal-maat-${maat.id}`}
      />
      {maatLabel(maat)}
    </label>
  );
})}
```

Zolang `form.formaat === null` (nog geen keuze, bv. een niet-gedetecteerd bestaand kunstwerk) is geen
enkele maat uitgegrijsd — precies het huidige gedrag.

**Opslaan-validatie**: de bestaande Opslaan-knop-conditie (`handleSave`/de disabled-state ervan) krijgt
een extra voorwaarde `form.formaat !== null` — zelfde patroon als de bestaande disabled-Opslaan-checks
elders in Beheer (bv. `DrukkerModal`'s `disabled={!fields.naam || !fields.email}`, geen aparte
foutmelding, de knop is simpelweg niet klikbaar). Naast de radiogroep staat een permanente, kleine
hint-tekst (`kunstwerkenFormaatVerplicht`, "Kies een formaat.") die alleen zichtbaar is zolang
`form.formaat === null`.

## Sectie D: Orderregel naar de drukker (amendement op de drukker-workflow-spec)

`docs/superpowers/specs/2026-07-26-drukker-order-workflow-design.md`, Sectie C, mail-opbouw per regel,
wordt:

```
- <kunstwerk.omschrijvingNl> — <materiaaldikte>mm <materiaalsoort> — <omschrijving materiaal>,
  maat <breedte>×<hoogte> cm<formaatSuffix>, aantal <quantity>
```

waarbij:

```ts
function formaatSuffix(kunstwerk: Kunstwerk): string {
  if (kunstwerk.formaat === 'liggend') return ' (Liggend)';
  if (kunstwerk.formaat === 'staand') return ' (Staand)';
  return '';
}
```

`formaatSuffix` wordt toegevoegd aan `buildDrukkerMail` (`src/lib/buildDrukkerMail.ts`, nog te bouwen
per het drukker-plan) — geen wijziging aan `BestellingLine` of Firestore-orderdata nodig: `formaat`
wordt via de al meegegeven `kunstwerken`-lijst opgezocht op `line.kunstwerkId`, precies zoals
`omschrijvingNl` en de overige kunstwerk-velden dat nu al doen.

Bij `formaat === 'vierkant'` of `null` (legacy kunstwerk zonder ingestelde formaat) blijft de regel
ongewijzigd zoals vandaag ontworpen — geen suffix.

## Sectie E: Vertalingen

Beheer-namespace is Nederlands-only (`messages/nl.json`, per
[[feedback_beheer_datatable_search_pattern]]-conventie: geen `en`/`de`/`fr`-varianten voor
beheer-only tekst). Nieuwe sleutels:

```json
"kunstwerkenLabelFormaat": "Formaat",
"kunstwerkenFormaat_vierkant": "Vierkant",
"kunstwerkenFormaat_liggend": "Liggend",
"kunstwerkenFormaat_staand": "Staand",
"kunstwerkenFormaatVerplicht": "Kies een formaat."
```

## Foutafhandeling

- Foto-afmetingen niet te meten (netwerkfout, CORS, corrupt bestand): `detectFormaatFromImageUrl`
  resolvet naar `null`, formulier blijft zonder voorselectie staan, beheerder kiest handmatig — geen
  zichtbare foutmelding nodig, dit is een normale, stille fallback.
- Formaat wisselen nadat er al incompatibele maten waren aangevinkt: geen bevestigingsdialoog — de
  bestaande "toggle"-achtige interactiepatronen in dit formulier deselecteren ook zonder confirm-stap,
  en dit is direct zichtbaar/omkeerbaar zolang niet op Opslaan is geklikt.

## Niet in scope

- Geen wijziging aan `Maat`/`MatenSection.tsx` — oriëntatie blijft volledig afgeleid, geen apart veld.
- Geen customer-facing wijziging: klanten kiezen nooit een formaat, dit is en blijft een
  beheer-only-instelling op het kunstwerk.
- Geen retroactieve migratie van bestaande kunstwerken — ze krijgen pas een formaat zodra een
  beheerder ze opent en opslaat (met automatische voorselectie op basis van de al aanwezige foto, zie
  Sectie B).
- EXIF-oriëntatie (bv. een telefoonfoto die gedraaid moet worden) wordt niet apart afgehandeld —
  `naturalWidth`/`naturalHeight` van het gedecodeerde beeld zoals de browser dat toont is leidend,
  consistent met hoe `WatermarkedImage.tsx` elders al met dezelfde afbeeldingen omgaat.
