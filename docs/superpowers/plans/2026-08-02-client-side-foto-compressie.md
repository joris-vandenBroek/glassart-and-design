# Client-side foto-compressie vóór upload Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 02-08-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kunstwerk- en kunstenaarfoto's client-side verkleinen/comprimeren (max 2000px lange zijde, JPEG kwaliteit 0.8) vóór ze naar `upload-kunstwerk-foto.php` gaan, met een client-side vangnet dat de upload weigert (met duidelijke foutmelding) als het resultaat toch nog boven de bestaande 8MB-servergrens uitkomt.

**Architecture:** Eén nieuwe, DOM-afhankelijke utility `src/lib/compressImage.ts` doet het echte werk (laadt de `File` in een `<img>`, tekent 'm verkleind op een `<canvas>`, exporteert als JPEG-`Blob`/`File`; valt bij elke fout terug op de ongewijzigde originele `File`). De bestaande hook `src/lib/useKunstwerkFotoUpload.ts` — de enige plek waar zowel kunstwerk- als kunstenaarfoto's doorheen lopen — roept die utility aan vóór de bestaande `fetch`-call en checkt het resultaat tegen de 8MB-grens. De UI-componenten (`KunstwerkenSection.tsx`, `KunstenaarsSection.tsx`) krijgen één extra conditionele vertaalsleutel voor de nieuwe foutstatus.

**Tech Stack:** Next.js 14 / React client component, browser Canvas API (geen nieuwe npm-dependency), Vitest + Testing Library, `next-intl`.

## Global Constraints

- `messages/nl.json` is de enige locale-file met een `beheer`-namespace — `en.json`/`de.json`/`fr.json` hebben die sectie niet. Nieuwe i18n-keys komen dus uitsluitend in `nl.json`.
- Geen nieuwe npm-dependency toevoegen — compressie gebeurt met de browser-native Canvas API, in dezelfde stijl als het bestaande `src/lib/detectKunstwerkFormaat.ts`.
- Compressie is een optimalisatie, geen harde vereiste: elke fout tijdens compressie (decode-fout, ontbrekende canvas-context, `toBlob` geeft `null`) valt terug op de ongewijzigde originele `File` — blokkeert de upload nooit.
- De 8MB-grens in `src/lib/useKunstwerkFotoUpload.ts` spiegelt `MAX_FOTO_BYTES` in `upload-server/upload-kunstwerk-foto.php:27` — bij wijziging van de servergrens moet dit getal op beide plekken aangepast worden.
- jsdom (testomgeving) heeft geen canvas-implementatie/polyfill; de canvas-tekenlogica in `compressImage` zelf wordt bewust niet unit-getest (zie Task 1) — alleen de zuivere `computeTargetDimensions`-functie en de vangnet-/orkestratielogica in de hook.
- TDD: schrijf eerst de falende test, bevestig dat hij faalt, implementeer, bevestig dat hij slaagt, commit — voor elke stap hieronder.
- Design-referentie: [docs/superpowers/specs/2026-08-02-client-side-foto-compressie-design.md](../specs/2026-08-02-client-side-foto-compressie-design.md).

---

### Task 1: `compressImage` utility

**Files:**
- Create: `src/lib/compressImage.ts`
- Test: `tests/lib/compressImage.test.ts`

**Interfaces:**
- Produces: `computeTargetDimensions(width: number, height: number, maxDimension?: number): { width: number; height: number }` — pure functie, default `maxDimension = 2000`, schaalt alleen naar beneden (nooit upscalen), behoudt aspect ratio (afgerond op hele pixels).
- Produces: `compressImage(file: File): Promise<File>` — geeft altijd een `File` terug (bij succes een nieuwe JPEG-`File`, bij elke fout de ongewijzigde `file`-parameter zelf). Wordt in Task 2 geconsumeerd door `useKunstwerkFotoUpload.ts`.

- [ ] **Step 1: Schrijf de falende tests voor `computeTargetDimensions`**

Maak `tests/lib/compressImage.test.ts` aan:

```typescript
import { describe, expect, it } from 'vitest';
import { computeTargetDimensions } from '@/lib/compressImage';

describe('computeTargetDimensions', () => {
  it('leaves dimensions unchanged when the longest side is already within the limit', () => {
    expect(computeTargetDimensions(1200, 800, 2000)).toEqual({ width: 1200, height: 800 });
  });

  it('leaves dimensions unchanged when the longest side exactly equals the limit', () => {
    expect(computeTargetDimensions(2000, 1000, 2000)).toEqual({ width: 2000, height: 1000 });
  });

  it('scales down a landscape image, preserving aspect ratio', () => {
    expect(computeTargetDimensions(4000, 2000, 2000)).toEqual({ width: 2000, height: 1000 });
  });

  it('scales down a portrait image, preserving aspect ratio', () => {
    expect(computeTargetDimensions(2000, 4000, 2000)).toEqual({ width: 1000, height: 2000 });
  });

  it('scales down a square image', () => {
    expect(computeTargetDimensions(3000, 3000, 2000)).toEqual({ width: 2000, height: 2000 });
  });

  it('never upscales a smaller image', () => {
    expect(computeTargetDimensions(400, 300, 2000)).toEqual({ width: 400, height: 300 });
  });

  it('defaults maxDimension to 2000 when not passed', () => {
    expect(computeTargetDimensions(4000, 1000)).toEqual({ width: 2000, height: 500 });
  });
});
```

- [ ] **Step 2: Run de tests en bevestig dat ze falen**

Run: `npx vitest run tests/lib/compressImage.test.ts`
Expected: FAIL — `Cannot find module '@/lib/compressImage'` (het bestand bestaat nog niet).

- [ ] **Step 3: Implementeer `src/lib/compressImage.ts`**

```typescript
const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.8;

export function computeTargetDimensions(
  width: number,
  height: number,
  maxDimension: number = MAX_DIMENSION
): { width: number; height: number } {
  const longestSide = Math.max(width, height);
  if (longestSide <= maxDimension) {
    return { width, height };
  }
  const scale = maxDimension / longestSide;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function withJpgExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  const base = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  return `${base}.jpg`;
}

export function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    function fallbackToOriginal() {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    }

    img.onerror = fallbackToOriginal;

    img.onload = () => {
      try {
        const { width, height } = computeTargetDimensions(img.naturalWidth, img.naturalHeight);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          fallbackToOriginal();
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);
            if (!blob) {
              resolve(file);
              return;
            }
            resolve(new File([blob], withJpgExtension(file.name), { type: 'image/jpeg' }));
          },
          'image/jpeg',
          JPEG_QUALITY
        );
      } catch {
        fallbackToOriginal();
      }
    };

    img.src = objectUrl;
  });
}
```

- [ ] **Step 4: Run de tests en bevestig dat ze slagen**

Run: `npx vitest run tests/lib/compressImage.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/compressImage.ts tests/lib/compressImage.test.ts
git commit -m "feat: add compressImage utility for client-side foto-compressie"
```

---

### Task 2: Compressie + 8MB-vangnet in `useKunstwerkFotoUpload`

**Files:**
- Modify: `src/lib/useKunstwerkFotoUpload.ts`
- Modify: `tests/lib/useKunstwerkFotoUpload.test.tsx`

**Interfaces:**
- Consumes: `compressImage(file: File): Promise<File>` uit Task 1.
- Produces: `useKunstwerkFotoUpload()` retourneert nu `{ uploading: boolean; error: 'upload' | 'too-large' | null; upload: (file: File) => Promise<string | null> }` — `error` had voorheen alleen `'upload' | null`. Consumers (`KunstwerkenSection.tsx`, `KunstenaarsSection.tsx`, aangepast in Task 3) lezen deze nieuwe waarde.

- [ ] **Step 1: Mock `compressImage` in de bestaande hook-tests en schrijf de twee nieuwe falende tests**

De bestaande test-suite (`tests/lib/useKunstwerkFotoUpload.test.tsx`) roept straks via `upload()` ook `compressImage` aan. Omdat jsdom geen canvas-implementatie heeft, mocken we die module zodat de bestaande 7 tests puur de fetch-/env-var-orkestratie blijven testen (ongewijzigd gedrag: mock geeft de file terug zoals hij binnenkwam), en voegen we 2 nieuwe tests toe voor het vangnet en voor het gebruik van het gecomprimeerde bestand.

Vervang de volledige inhoud van `tests/lib/useKunstwerkFotoUpload.test.tsx` door:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { useKunstwerkFotoUpload } from '@/lib/useKunstwerkFotoUpload';
import { compressImage } from '@/lib/compressImage';

vi.mock('@/lib/compressImage', () => ({
  compressImage: vi.fn(),
}));

const compressImageMock = vi.mocked(compressImage);

function TestConsumer() {
  const { uploading, error, upload } = useKunstwerkFotoUpload();
  const [url, setUrl] = useState<string | null>(null);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      const result = await upload(file);
      setUrl(result);
    }
  }

  return (
    <div>
      <input type="file" data-testid="file-input" onChange={handleChange} />
      <div data-testid="uploading">{String(uploading)}</div>
      <div data-testid="error">{error ?? 'none'}</div>
      <div data-testid="url">{url ?? 'none'}</div>
    </div>
  );
}

function makeFile(name = 'foto.jpg') {
  return new File(['inhoud'], name, { type: 'image/jpeg' });
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_UPLOAD_ENDPOINT_URL', 'https://mail-server.example.com/upload-kunstwerk-foto.php');
  vi.stubEnv('NEXT_PUBLIC_UPLOAD_SECRET', 'test-upload-secret');
  vi.stubGlobal('fetch', vi.fn());
  compressImageMock.mockReset();
  compressImageMock.mockImplementation(async (file: File) => file);
});

describe('useKunstwerkFotoUpload', () => {
  it('uploads the file and resolves with the download URL', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, url: 'https://storage.example.com/foto.jpg' }),
    });
    render(<TestConsumer />);
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [makeFile()] } });
    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('https://storage.example.com/foto.jpg'));
    expect(screen.getByTestId('error')).toHaveTextContent('none');
  });

  it('sends the shared secret and the file as form data to the configured endpoint', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, url: 'https://storage.example.com/foto.jpg' }),
    });
    render(<TestConsumer />);
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [makeFile('mijn-kunstwerk.png')] } });
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [endpoint, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(endpoint).toBe('https://mail-server.example.com/upload-kunstwerk-foto.php');
    expect(options.method).toBe('POST');
    const body = options.body as FormData;
    expect(body.get('secret')).toBe('test-upload-secret');
    expect((body.get('foto') as File).name).toBe('mijn-kunstwerk.png');
  });

  it('sets uploading to true while the upload is in flight, then false when done', async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );
    render(<TestConsumer />);
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [makeFile()] } });
    await waitFor(() => expect(screen.getByTestId('uploading')).toHaveTextContent('true'));
    resolveFetch({ ok: true, json: async () => ({ success: true, url: 'https://storage.example.com/foto.jpg' }) });
    await waitFor(() => expect(screen.getByTestId('uploading')).toHaveTextContent('false'));
  });

  it('sets an error and resolves null when the endpoint responds with an error', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, error: 'Forbidden' }),
    });
    render(<TestConsumer />);
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [makeFile()] } });
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('upload'));
    expect(screen.getByTestId('url')).toHaveTextContent('none');
    expect(screen.getByTestId('uploading')).toHaveTextContent('false');
  });

  it('sets an error and resolves null when fetch throws', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('offline'));
    render(<TestConsumer />);
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [makeFile()] } });
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('upload'));
    expect(screen.getByTestId('url')).toHaveTextContent('none');
  });

  it('sets an error and does not call fetch when the endpoint env var is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_UPLOAD_ENDPOINT_URL', '');
    render(<TestConsumer />);
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [makeFile()] } });
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('upload'));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sets an error and does not call fetch when the secret env var is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_UPLOAD_SECRET', '');
    render(<TestConsumer />);
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [makeFile()] } });
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('upload'));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sets error to too-large and does not call fetch when the compressed file still exceeds 8MB', async () => {
    const oversized = new File([new Uint8Array(9 * 1024 * 1024)], 'foto.jpg', { type: 'image/jpeg' });
    compressImageMock.mockResolvedValue(oversized);
    render(<TestConsumer />);
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [makeFile()] } });
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('too-large'));
    expect(screen.getByTestId('url')).toHaveTextContent('none');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uploads the compressed file returned by compressImage, not the original', async () => {
    const compressed = new File(['klein'], 'foto.jpg', { type: 'image/jpeg' });
    compressImageMock.mockResolvedValue(compressed);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, url: 'https://storage.example.com/foto.jpg' }),
    });
    render(<TestConsumer />);
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [makeFile('groot-origineel.jpg')] } });
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = options.body as FormData;
    expect((body.get('foto') as File).name).toBe('foto.jpg');
    expect(compressImageMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'groot-origineel.jpg' }));
  });
});
```

- [ ] **Step 2: Run de tests en bevestig dat de twee nieuwe falen (en de rest nog compileert tegen de oude hook)**

Run: `npx vitest run tests/lib/useKunstwerkFotoUpload.test.tsx`
Expected: FAIL op de twee nieuwe tests (`too-large` wordt nooit gezet; `compressImageMock` wordt nooit aangeroepen) — de overige 7 slagen nog steeds, want de hook negeert de gemockte `compressImage` simpelweg tot Step 3.

- [ ] **Step 3: Werk `src/lib/useKunstwerkFotoUpload.ts` bij**

Vervang de volledige inhoud door:

```typescript
'use client';

import { useCallback, useState } from 'react';
import { compressImage } from '@/lib/compressImage';

// Mirrors MAX_FOTO_BYTES in upload-server/upload-kunstwerk-foto.php -- keep both in sync.
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export interface UseKunstwerkFotoUploadResult {
  uploading: boolean;
  error: 'upload' | 'too-large' | null;
  upload: (file: File) => Promise<string | null>;
}

export function useKunstwerkFotoUpload(): UseKunstwerkFotoUploadResult {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<'upload' | 'too-large' | null>(null);

  const upload = useCallback(async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const finalFile = await compressImage(file);
      if (finalFile.size > MAX_UPLOAD_BYTES) {
        setError('too-large');
        return null;
      }
      const endpoint = process.env.NEXT_PUBLIC_UPLOAD_ENDPOINT_URL;
      const secret = process.env.NEXT_PUBLIC_UPLOAD_SECRET;
      if (!endpoint || !secret) {
        setError('upload');
        return null;
      }
      const formData = new FormData();
      formData.append('secret', secret);
      formData.append('foto', finalFile);
      const response = await fetch(endpoint, { method: 'POST', body: formData });
      const data = await response.json();
      if (!response.ok || !data.success) {
        setError('upload');
        return null;
      }
      return data.url as string;
    } catch {
      setError('upload');
      return null;
    } finally {
      setUploading(false);
    }
  }, []);

  return { uploading, error, upload };
}
```

- [ ] **Step 4: Run de tests en bevestig dat ze allemaal slagen**

Run: `npx vitest run tests/lib/useKunstwerkFotoUpload.test.tsx`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/useKunstwerkFotoUpload.ts tests/lib/useKunstwerkFotoUpload.test.tsx
git commit -m "feat: compress foto's client-side en weiger uploads die na compressie nog >8MB zijn"
```

---

### Task 3: Foutmelding + vertalingen in de UI

**Files:**
- Modify: `messages/nl.json:522-526` (kunstwerken-sectie), `messages/nl.json:582-586` (kunstenaars-sectie)
- Modify: `src/components/beheer/KunstwerkenSection.tsx:691-695`
- Modify: `src/components/beheer/KunstenaarsSection.tsx:418-422`

**Interfaces:**
- Consumes: `error: 'upload' | 'too-large' | null` van `useKunstwerkFotoUpload()` (Task 2).
- Produces: geen nieuwe interfaces — puur UI-tekst.

- [ ] **Step 1: Voeg de nieuwe i18n-keys toe aan `messages/nl.json`**

Zoek de regel `"kunstwerkenFotoUploadError": "De foto kon niet geüpload worden. Probeer het opnieuw.",` (rond regel 525) en voeg er direct na toe:

```json
    "kunstwerkenFotoTooLarge": "Het bestand is te groot, ook na compressie. Kies een kleinere foto.",
```

Zoek de regel `"kunstenaarsFotoUploadError": "De foto kon niet geüpload worden. Probeer het opnieuw.",` (rond regel 585) en voeg er direct na toe:

```json
    "kunstenaarsFotoTooLarge": "Het bestand is te groot, ook na compressie. Kies een kleinere foto.",
```

- [ ] **Step 2: Verifieer dat `nl.json` geldig JSON blijft**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/nl.json', 'utf8')); console.log('valid json')"`
Expected: `valid json`

- [ ] **Step 3: Werk de foutmelding in `KunstwerkenSection.tsx` bij**

In `src/components/beheer/KunstwerkenSection.tsx`, vervang (rond regel 691-695):

```typescript
          {fotoUploadError && (
            <p data-testid="kunstwerk-modal-foto-error" className="text-xs text-red-400">
              {t('kunstwerkenFotoUploadError')}
            </p>
          )}
```

door:

```typescript
          {fotoUploadError && (
            <p data-testid="kunstwerk-modal-foto-error" className="text-xs text-red-400">
              {t(fotoUploadError === 'too-large' ? 'kunstwerkenFotoTooLarge' : 'kunstwerkenFotoUploadError')}
            </p>
          )}
```

- [ ] **Step 4: Werk de foutmelding in `KunstenaarsSection.tsx` bij**

In `src/components/beheer/KunstenaarsSection.tsx`, vervang (rond regel 418-422):

```typescript
          {fotoUploadError && (
            <p data-testid="kunstenaar-modal-foto-error" className="text-xs text-red-400">
              {t('kunstenaarsFotoUploadError')}
            </p>
          )}
```

door:

```typescript
          {fotoUploadError && (
            <p data-testid="kunstenaar-modal-foto-error" className="text-xs text-red-400">
              {t(fotoUploadError === 'too-large' ? 'kunstenaarsFotoTooLarge' : 'kunstenaarsFotoUploadError')}
            </p>
          )}
```

- [ ] **Step 5: Run de bestaande component-tests en bevestig dat ze nog slagen**

Run: `npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: PASS — de bestaande test die `mockUploadError = 'upload'` zet en `kunstwerk-modal-foto-error` op de oude tekst controleert (rond regel 316-322 van dat testbestand) blijft slagen, want de `'upload'`-tak van de nieuwe ternary geeft dezelfde vertaalsleutel terug.

- [ ] **Step 6: Commit**

```bash
git add messages/nl.json src/components/beheer/KunstwerkenSection.tsx src/components/beheer/KunstenaarsSection.tsx
git commit -m "feat: aparte foutmelding tonen als een foto ook na compressie te groot is"
```

---

### Task 4: Handmatige verificatie in de browser

**Files:** geen (alleen verificatie).

- [ ] **Step 1: Run de volledige relevante testsuite**

Run: `npx vitest run tests/lib/compressImage.test.ts tests/lib/useKunstwerkFotoUpload.test.tsx tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: alle tests PASS (7 + 9 + bestaand aantal in `KunstwerkenSection.test.tsx`).

- [ ] **Step 2: Start de dev-server en log in als medewerker**

Gebruik de Browser pane (`preview_start` met de `dev` launch-config uit `.claude/launch.json`), log in op `/nl/beheer` als medewerker (zie `reference_medewerker_test_account` in memory voor een geldig testaccount).

- [ ] **Step 3: Verifieer compressie bij een normale foto-upload**

Open de Kunstwerken-sectie, klik "Toevoegen", upload een foto (bij voorkeur een echte telefoonfoto >2000px/>1MB als die beschikbaar is; anders een willekeurige JPEG/PNG). Bevestig dat de upload lukt (preview verschijnt, geen foutmelding) en gebruik `read_network_requests` om de `POST` naar de upload-endpoint te bekijken — de geüploade `foto`-form-data-entry moet een `.jpg`-bestand zijn, kleiner dan het origineel als dat >2000px was.

- [ ] **Step 4: Verifieer hetzelfde voor een kunstenaarfoto**

Herhaal Stap 3 in de Kunstenaars-sectie (portretfoto-upload), om te bevestigen dat de gedeelde hook ook daar werkt.

- [ ] **Step 5: Verifieer de "te groot"-foutmelding**

Dit randgeval is met een normale foto niet natuurlijk te reproduceren (compressie brengt vrijwel alles ruim onder 8MB). Gebruik `javascript_tool` om in de devtools-console tijdelijk een override te zetten die dit pad forceert, bijvoorbeeld door een oversized `File` direct op het bestandsinvoerveld te simuleren, of bevestig in plaats daarvan dat de foutmelding-tak in de gerenderde React-devtools/broncode klopt (Task 3, Step 5's test dekt dit al functioneel). Documenteer in je antwoord aan de gebruiker welke van de twee je hebt gedaan.

- [ ] **Step 6: Ruim eventuele testfoto's op**

Als er tijdens Stap 3/4 een testfoto is toegevoegd aan een echt kunstwerk/kunstenaar-record op staging, verwijder die weer (of verwijder het hele test-record als het puur voor deze verificatie is aangemaakt), zodat er geen rommeldata achterblijft in de gedeelde staging-database.
