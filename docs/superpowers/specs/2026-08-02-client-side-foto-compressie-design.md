# Client-side compressie voor kunstwerk-/kunstenaarfoto's

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 02-08-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

**Datum:** 2026-08-02
**Status:** Approved

## Aanleiding

Foto's voor kunstwerken en kunstenaars worden geüpload via `upload-server/upload-kunstwerk-foto.php`, met een server-side harde grens van 8MB (`MAX_FOTO_BYTES`). Beide foto-uploads lopen door dezelfde client-side hook, [useKunstwerkFotoUpload.ts](../../../src/lib/useKunstwerkFotoUpload.ts), gebruikt vanuit [KunstwerkenSection.tsx](../../../src/components/beheer/KunstwerkenSection.tsx) en [KunstenaarsSection.tsx](../../../src/components/beheer/KunstenaarsSection.tsx).

Rechtstreekse telefoonfoto's (3-8MB, vaak met een resolutie die ruim boven wat nodig is voor webweergave) worden nu ongewijzigd geüpload. Dat is onnodig zwaar voor paginasnelheid en loopt af en toe tegen de 8MB-grens aan. Doel: foto's client-side verkleinen/comprimeren vóór upload, zodat de geüploade bestanden klein en consistent zijn, met de bestaande 8MB-grens als vangnet in plaats van als iets waar gebruikers tegenaan lopen.

## Ontwerp

### `src/lib/compressImage.ts` — nieuwe utility

Twee geëxporteerde functies:

- **`computeTargetDimensions(width: number, height: number, maxDimension = 2000): { width: number; height: number }`** — pure functie zonder DOM-afhankelijkheden. Schaalt `width`/`height` naar beneden zodat de langste zijde maximaal `maxDimension` is, met behoud van aspect ratio. Is de langste zijde al `<= maxDimension`, dan blijven de afmetingen ongewijzigd (nooit upscalen).

- **`compressImage(file: File): Promise<File>`** — laadt `file` via `URL.createObjectURL` in een `<img>` (zelfde patroon als [detectKunstwerkFormaat.ts](../../../src/lib/detectKunstwerkFormaat.ts)), berekent de doelafmetingen met `computeTargetDimensions(img.naturalWidth, img.naturalHeight, 2000)`, tekent het beeld op een `<canvas>` op die afmetingen, en exporteert via `canvas.toBlob(..., 'image/jpeg', 0.8)`. De resulterende `Blob` wordt teruggegeven als een nieuwe `File`: naam = originele bestandsnaam met extensie vervangen door `.jpg`, `type: 'image/jpeg'`.

  Altijd JPEG, ongeacht het originele formaat (PNG/WebP) — transparantie is niet relevant voor deze foto's.

  Bij elke fout tijdens dit proces (decode-fout op de `<img>`, `canvas.toBlob` geeft `null`, of een andere exception) wordt de fout opgevangen en geeft de functie de **originele, ongewijzigde `file`** terug. Compressie is een optimalisatie, geen harde vereiste — een falende compressie mag de upload niet blokkeren.

  De object-URL wordt in een `finally` weer vrijgegeven (`URL.revokeObjectURL`), ook bij een fout.

### `src/lib/useKunstwerkFotoUpload.ts` — aangepast

- Het `error`-type wordt `'upload' | 'too-large' | null` (was `'upload' | null`).
- Een module-level constante `MAX_UPLOAD_BYTES = 8 * 1024 * 1024` spiegelt (met een commentaarregel die daarnaar verwijst) de `MAX_FOTO_BYTES`-constante in `upload-server/upload-kunstwerk-foto.php:27`. Geen gedeelde import mogelijk over de TS/PHP-grens heen; het is één losstaand getal dat bij een toekomstige wijziging van de servergrens op beide plekken aangepast moet worden.
- In `upload(file)`:
  1. Roep `compressImage(file)` aan → `finalFile`.
  2. Is `finalFile.size > MAX_UPLOAD_BYTES`, dan: `setError('too-large')`, `return null` — **geen** netwerkcall. Dit is het vangnet voor het randgeval dat compressie faalt (fallback naar een origineel bestand >8MB) of, in theorie, geen genoeg compressiewinst oplevert.
  3. Anders: ga verder met de bestaande `fetch`-logica, met `finalFile` in plaats van `file` in de `FormData`.
- Verder ongewijzigd (bestaande `'upload'`-foutafhandeling voor netwerk-/serverfouten blijft zoals nu).

### UI — `KunstwerkenSection.tsx` / `KunstenaarsSection.tsx`

De bestaande foutregel (`{fotoUploadError && ...}`) wordt uitgebreid met een conditie op de waarde van `fotoUploadError`:
- `'upload'` → bestaande tekst (`kunstwerkenFotoUploadError` / `kunstenaarsFotoUploadError`).
- `'too-large'` → nieuwe tekst (`kunstwerkenFotoTooLarge` / `kunstenaarsFotoTooLarge`).

Geen andere UI-wijzigingen; de bestaande `data-testid`-attributen en dropzone-structuur blijven ongewijzigd.

### Vertalingen

De `beheer`-namespace bestaat alleen in `messages/nl.json` — `en.json`/`de.json`/`fr.json` hebben geen `beheer`-sectie, dit deel van de app (staff-only) is Nederlands-only. Nieuwe keys komen dus uitsluitend in `messages/nl.json`, naast de bestaande `...FotoUploadError`-keys:

- `kunstwerkenFotoTooLarge`: "Het bestand is te groot, ook na compressie. Kies een kleinere foto."
- `kunstenaarsFotoTooLarge`: "Het bestand is te groot, ook na compressie. Kies een kleinere foto."

### Tests

jsdom (de testomgeving, zie `tests/setup.ts`) heeft geen canvas/image-decoding-implementatie en dit project heeft geen canvas-polyfill. Een polyfill toevoegen (het `canvas`-npm-package heeft native bindings) puur voor deze ene feature past niet bij de bestaande minimale-dependency-aanpak van het project. Daarom:

- **Wel unit-getest**: `computeTargetDimensions` — puur, geen DOM-afhankelijkheid. Cases: te grote landscape-foto verkleinen met behoud van ratio, te grote portrait-foto, vierkante foto, foto die al binnen de grens valt (geen upscale), afmetingen exact op de grens.
- **Wel unit-getest**: de vangnet-logica in `useKunstwerkFotoUpload` — `compressImage` wordt gemockt (`vi.mock('@/lib/compressImage')`) om een file `> MAX_UPLOAD_BYTES` terug te geven; verwacht `error === 'too-large'` en dat `fetch` niet is aangeroepen. Los daarvan een test voor het gelukkige pad (gemockte `compressImage` geeft een kleine file terug → normale upload-flow, ongewijzigd).
- **Niet getest**: de daadwerkelijke canvas-tekenlogica en JPEG-encodering binnen `compressImage` zelf (geen canvas-implementatie beschikbaar in jsdom). Dit is een bewuste, benoemde beperking — niet stilzwijgend overgeslagen.

## Buiten scope

- Geen wijziging aan de server-side `MAX_FOTO_BYTES`-grens (blijft 8MB) of aan `upload-kunstwerk-foto.php` in het algemeen.
- Geen configureerbare compressie-instellingen (max-afmeting/kwaliteit) via UI of env-var — vaste waarden (2000px, kwaliteit 0.8) in code.
- Geen wijziging aan `detectKunstwerkFormaat.ts` — die blijft onafhankelijk op het originele bestand werken (aspect ratio verandert niet door verkleinen, dus geen coördinatie nodig).
