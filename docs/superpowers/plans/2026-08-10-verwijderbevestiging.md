# Verwijderbevestiging in beheer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elke verwijderknop in beheer vraagt eerst om bevestiging, met het item bij naam, zodat één misklik in een bewerkmodal geen record meer wist.

**Architecture:** Eén nieuw bestand met een hook (`useVerwijderBevestiging`) en twee presentatiehelpers, die door alle acht beheersecties gebruikt worden. Elke sectie wisselt de inhoud en de `footerActions` van zijn bestaande `Modal` om — geen tweede `Modal`, want die zou een tweede `data-testid="modal"` in de DOM zetten en Escape zou beide overlays sluiten. `handleRemove` splitst overal in een poort (blokkade controleren, dan de vraag stellen) en een schrijfactie.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind, `next-intl`, Vitest + React Testing Library.

Ontwerp: [`docs/superpowers/specs/2026-08-10-verwijderbevestiging-design.md`](../specs/2026-08-10-verwijderbevestiging-design.md).

## Global Constraints

- **De beheerteksten staan alléén in `messages/nl.json`.** `en/de/fr` hebben geen `beheer`-blok; voeg nieuwe sleutels dus alleen in `nl.json` toe.
- **Exacte teksten van de twee nieuwe sleutels:**
  - `verwijderBevestigingVraag` — `Weet je zeker dat je {item} wilt verwijderen?`
  - `verwijderBevestigingOnomkeerbaar` — `Dit kan niet ongedaan gemaakt worden.`
- **Hergebruik deze bestaande sleutels ongewijzigd:** `annuleren` ("Annuleren"), `verwijderenBevestigen` ("Ja, verwijderen"), en alle zes `*VerwijderBlocked`-sleutels.
- **Geen tweede `Modal`.** `src/components/Modal.tsx` rendert via `createPortal` met `data-testid="modal"` en installeert `useOverlayDismiss`.
- **De bestaande blokkadecontroles blijven vóór de bevestiging staan.** Is verwijderen niet toegestaan, dan verschijnt de blokkademelding en géén bevestiging.
- **Het formulier blijft bij een openstaande bevestiging in de DOM met `hidden`**, niet ontkoppeld, zodat annuleren geen ingevulde staat weggooit.
- **Sluiten van de modal ruimt de bevestiging op**, zodat een volgend record nooit met een openstaande vraag opent.
- **Testids volgens de conventie die `LookupSection` al hanteert:** `<enkelvoud>-modal-verwijder-bevestiging` (tekstblok), `-verwijder-bevestigen`, `-verwijder-annuleren`. De bestaande `<enkelvoud>-modal-verwijderen` blijft de knop die de bevestiging opent.
- **Buiten scope:** een contactpersoon in `GlassartDesignSection` en een btw-tarief in `InstellingenSection` (die verdwijnen pas bij Opslaan), klanten (geen verwijderknop in beheer), en alle serverkant — de bestaande 409's blijven de harde grens.
- **`npx tsc --noEmit` moet na elke taak exit 0 geven.** Let op de blinde vlek: untyped fixture-arrays in componenttests worden niet door de typechecker gezien, dus draai ook de componenttests.
- **Er is geen lokale database.** `npm test` praat tegen de gedeelde **staging**-MySQL uit `.env.local`. Deze feature heeft geen migratie nodig.
- **Raak de productiedatabase niet aan.**

---

### Task 1: De gedeelde module

**Files:**
- Create: `src/components/beheer/verwijderBevestiging.tsx`
- Modify: `messages/nl.json` (twee nieuwe sleutels in het `beheer`-blok)
- Test: `tests/components/beheer/verwijderBevestiging.test.tsx`

**Interfaces:**
- Produces: `useVerwijderBevestiging(): VerwijderBevestiging` met `{ item: string | null; vraag: (label: string) => void; annuleer: () => void }`
- Produces: `VerwijderBevestigingTekst({ item, extraRegel, testId })`
- Produces: `VerwijderBevestigingActies({ onBevestig, onAnnuleer, testIdPrefix })`

Alle volgende taken gebruiken exact deze drie namen en signaturen.

- [ ] **Step 1: Write the failing test**

`tests/components/beheer/verwijderBevestiging.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import {
  useVerwijderBevestiging,
  VerwijderBevestigingTekst,
  VerwijderBevestigingActies,
} from '@/components/beheer/verwijderBevestiging';
import messages from '../../../messages/nl.json';

function Harnas({ extraRegel }: { extraRegel?: string }) {
  const bevestiging = useVerwijderBevestiging();
  return (
    <>
      <button type="button" onClick={() => bevestiging.vraag('Hotel paneel')} data-testid="vraag">
        vraag
      </button>
      <span data-testid="item">{bevestiging.item ?? '(geen)'}</span>
      {bevestiging.item !== null && (
        <VerwijderBevestigingTekst
          item={bevestiging.item}
          extraRegel={extraRegel}
          testId="proef-modal-verwijder-bevestiging"
        />
      )}
      {bevestiging.item !== null && (
        <VerwijderBevestigingActies
          onBevestig={() => undefined}
          onAnnuleer={bevestiging.annuleer}
          testIdPrefix="proef"
        />
      )}
    </>
  );
}

function renderHarnas(extraRegel?: string) {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <Harnas extraRegel={extraRegel} />
    </NextIntlClientProvider>
  );
}

describe('useVerwijderBevestiging', () => {
  it('begint zonder openstaande bevestiging', () => {
    renderHarnas();
    expect(screen.getByTestId('item')).toHaveTextContent('(geen)');
    expect(screen.queryByTestId('proef-modal-verwijder-bevestiging')).toBeNull();
  });

  it('onthoudt het label van het item waarvoor gevraagd wordt', () => {
    renderHarnas();
    fireEvent.click(screen.getByTestId('vraag'));
    expect(screen.getByTestId('item')).toHaveTextContent('Hotel paneel');
  });

  it('wist het item bij annuleren', () => {
    renderHarnas();
    fireEvent.click(screen.getByTestId('vraag'));
    fireEvent.click(screen.getByTestId('proef-modal-verwijder-annuleren'));
    expect(screen.getByTestId('item')).toHaveTextContent('(geen)');
  });
});

describe('VerwijderBevestigingTekst', () => {
  it('noemt het item bij naam en waarschuwt dat het onomkeerbaar is', () => {
    renderHarnas();
    fireEvent.click(screen.getByTestId('vraag'));
    const blok = screen.getByTestId('proef-modal-verwijder-bevestiging');
    expect(blok).toHaveTextContent('Weet je zeker dat je Hotel paneel wilt verwijderen?');
    expect(blok).toHaveTextContent('Dit kan niet ongedaan gemaakt worden.');
  });

  it('toont een extra regel als die meegegeven is', () => {
    renderHarnas('Dit segment wordt nog gebruikt door 3 kunstwerk(en).');
    fireEvent.click(screen.getByTestId('vraag'));
    expect(screen.getByTestId('proef-modal-verwijder-bevestiging')).toHaveTextContent(
      'Dit segment wordt nog gebruikt door 3 kunstwerk(en).'
    );
  });

  it('toont geen extra regel als die er niet is', () => {
    renderHarnas();
    fireEvent.click(screen.getByTestId('vraag'));
    expect(screen.getByTestId('proef-modal-verwijder-bevestiging').textContent).not.toContain(
      'wordt nog gebruikt'
    );
  });
});

describe('VerwijderBevestigingActies', () => {
  it('roept onBevestig aan bij Ja, verwijderen', () => {
    const onBevestig = vi.fn();
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <VerwijderBevestigingActies
          onBevestig={onBevestig}
          onAnnuleer={() => undefined}
          testIdPrefix="proef"
        />
      </NextIntlClientProvider>
    );
    expect(screen.getByTestId('proef-modal-verwijder-bevestigen')).toHaveTextContent('Ja, verwijderen');
    fireEvent.click(screen.getByTestId('proef-modal-verwijder-bevestigen'));
    expect(onBevestig).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/components/beheer/verwijderBevestiging.test.tsx
```

Verwacht: FAIL bij het importeren — `Cannot find module '@/components/beheer/verwijderBevestiging'`.

- [ ] **Step 3: Write the module**

`src/components/beheer/verwijderBevestiging.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

export interface VerwijderBevestiging {
  /** Het label van het item waarvoor een bevestiging open staat, of null als er geen open staat. */
  item: string | null;
  vraag: (label: string) => void;
  annuleer: () => void;
}

/**
 * De staat van een openstaande verwijderbevestiging in een beheermodal.
 *
 * Bewust géén tweede <Modal>: Modal rendert via createPortal met
 * data-testid="modal" en installeert useOverlayDismiss, dus twee open modals
 * zouden beide dat testid dragen en beide op Escape reageren. De secties
 * wisselen daarom de inhoud en de footerActions van hun bestaande modal om --
 * hetzelfde patroon dat LookupSection en KunstwerkenSection al gebruiken.
 */
export function useVerwijderBevestiging(): VerwijderBevestiging {
  const [item, setItem] = useState<string | null>(null);
  return {
    item,
    vraag: (label: string) => setItem(label),
    annuleer: () => setItem(null),
  };
}

/**
 * `extraRegel` is voor secties die iets extra's weten, zoals dat het item nog
 * bij kunstwerken in gebruik is. De vraag zelf is voor alle secties gelijk.
 */
export function VerwijderBevestigingTekst({
  item,
  extraRegel,
  testId,
}: {
  item: string;
  extraRegel?: string;
  testId: string;
}) {
  const t = useTranslations('beheer');
  return (
    <div data-testid={testId} className="flex flex-col gap-2 text-sm text-white/80">
      {extraRegel && <p>{extraRegel}</p>}
      <p className="font-semibold text-white">{t('verwijderBevestigingVraag', { item })}</p>
      <p>{t('verwijderBevestigingOnomkeerbaar')}</p>
    </div>
  );
}

/**
 * De twee knoppen voor de footer van de modal. De rode omlijning op bevestigen
 * volgt de stijl die LookupSection al voor deze knop gebruikte.
 */
export function VerwijderBevestigingActies({
  onBevestig,
  onAnnuleer,
  testIdPrefix,
}: {
  onBevestig: () => void;
  onAnnuleer: () => void;
  /** Enkelvoudsvorm van de sectie, bijvoorbeeld `maat` -- bepaalt de testids. */
  testIdPrefix: string;
}) {
  const t = useTranslations('beheer');
  return (
    <>
      <button
        type="button"
        onClick={onBevestig}
        data-testid={`${testIdPrefix}-modal-verwijder-bevestigen`}
        className="btn-beheer-secondary rounded-sm border border-red-500/40 px-4 py-2 text-xs tracking-wide text-red-400 hover:border-red-500 hover:text-red-300"
      >
        {t('verwijderenBevestigen')}
      </button>
      <button
        type="button"
        onClick={onAnnuleer}
        data-testid={`${testIdPrefix}-modal-verwijder-annuleren`}
        className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
      >
        {t('annuleren')}
      </button>
    </>
  );
}
```

- [ ] **Step 4: Add the two translation keys**

In `messages/nl.json`, in het `beheer`-blok, direct onder `"verwijderenBevestigen"`:

```json
    "verwijderBevestigingVraag": "Weet je zeker dat je {item} wilt verwijderen?",
    "verwijderBevestigingOnomkeerbaar": "Dit kan niet ongedaan gemaakt worden.",
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/components/beheer/verwijderBevestiging.test.tsx
npx tsc --noEmit
```

Verwacht: alle tests PASS, `tsc` exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/beheer/verwijderBevestiging.tsx messages/nl.json tests/components/beheer/verwijderBevestiging.test.tsx
git commit -m "feat: gedeelde verwijderbevestiging voor beheer"
```

---

### Task 2: LookupSection (segmenten, stijlen, onderwerpen)

Deze sectie had de bevestiging al, maar alleen als het item nog bij kunstwerken in gebruik was. Hij wordt de eerste gebruiker van de gedeelde module en bewijst die tegen bestaand gedrag.

**Files:**
- Modify: `src/components/beheer/LookupSection.tsx`
- Modify: `messages/nl.json` (drie sleutels herformuleren)
- Test: `tests/components/beheer/SegmentenSection.test.tsx`, `tests/components/beheer/StijlenSection.test.tsx`, `tests/components/beheer/OnderwerpenSection.test.tsx`

**Interfaces:**
- Consumes: `useVerwijderBevestiging`, `VerwijderBevestigingTekst`, `VerwijderBevestigingActies` uit taak 1.

- [ ] **Step 1: Write the failing tests**

Voeg toe aan `tests/components/beheer/SegmentenSection.test.tsx`. Zoek eerst op hoe de bestaande tests in dat bestand de modal openen (er staat al een verwijderbevestigingstest in) en volg dat patroon; de fixture-namen hieronder (`SEGMENTEN`, `KUNSTWERKEN`) zijn de bestaande.

```tsx
  it('vraagt om bevestiging bij verwijderen van een ongebruikt segment', async () => {
    const onRemove = vi.fn().mockResolvedValue(true);
    renderSection({ onRemove });
    // Open een segment dat door geen enkel kunstwerk gebruikt wordt.
    fireEvent.click(screen.getByTestId('data-table-row-seg-2'));
    fireEvent.click(screen.getByTestId('segment-modal-verwijderen'));

    const blok = screen.getByTestId('segment-modal-verwijder-bevestiging');
    expect(blok).toHaveTextContent('Weet je zeker dat je Restaurant wilt verwijderen?');
    expect(blok.textContent).not.toContain('wordt nog gebruikt');
    expect(onRemove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('segment-modal-verwijder-bevestigen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('seg-2'));
  });

  it('zet de gebruikszin in de bevestiging als het segment nog in gebruik is', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-seg-1'));
    fireEvent.click(screen.getByTestId('segment-modal-verwijderen'));
    expect(screen.getByTestId('segment-modal-verwijder-bevestiging')).toHaveTextContent(
      'Dit segment wordt nog gebruikt door 1 kunstwerk(en).'
    );
  });

  it('slaat niets op als de verwijderbevestiging geannuleerd wordt', () => {
    const onRemove = vi.fn().mockResolvedValue(true);
    renderSection({ onRemove });
    fireEvent.click(screen.getByTestId('data-table-row-seg-2'));
    fireEvent.click(screen.getByTestId('segment-modal-verwijderen'));
    fireEvent.click(screen.getByTestId('segment-modal-verwijder-annuleren'));

    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.queryByTestId('segment-modal-verwijder-bevestiging')).toBeNull();
    expect(screen.getByTestId('segment-modal-omschrijving')).toHaveValue('Restaurant');
  });
```

Pas de bestaande verwijderbevestigingstest in dat bestand aan: die verwacht nu de oude tekst met de vraag erin. De nieuwe verwachting is de gebruikszin zonder vraag, plus de gedeelde vraag.

De ids `seg-1`/`seg-2`, de omschrijvingen en het testid van het omschrijvingsveld moet je in het bestand opzoeken — gebruik wat er staat, verzin niets. Zorg dat één segment wél en één segment níet door een kunstwerk gebruikt wordt; voeg een fixture toe als dat er niet is.

Doe hetzelfde in `StijlenSection.test.tsx` en `OnderwerpenSection.test.tsx`, met hun eigen ids, omschrijvingen en testid-prefixen (`stijl-`, `onderwerp-`).

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/beheer/SegmentenSection.test.tsx
```

Verwacht: de nieuwe tests FAIL — bij een ongebruikt segment verschijnt nu geen bevestiging en wordt `onRemove` direct aangeroepen.

- [ ] **Step 3: Wire the shared module into LookupSection**

In `src/components/beheer/LookupSection.tsx`, voeg de import toe:

```tsx
import {
  useVerwijderBevestiging,
  VerwijderBevestigingTekst,
  VerwijderBevestigingActies,
} from './verwijderBevestiging';
```

Vervang de state `const [pendingVerwijderCount, setPendingVerwijderCount] = useState<number | null>(null);` door:

```tsx
  const bevestiging = useVerwijderBevestiging();
```

Vervang in `openAdd`, `openEdit` en `closeModal` elke `setPendingVerwijderCount(null);` door `bevestiging.annuleer();`.

Vervang `handleRemove` en `handleAnnulerenVerwijderen` door een poort en een schrijfactie:

```tsx
  function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    bevestiging.vraag(modalState.item.omschrijving);
  }

  async function verwijderDefinitief() {
    if (modalState?.mode !== 'edit') return;
    const success = await onRemove(modalState.item.id);
    if (success) {
      void logActiviteit(activiteitTypes.verwijderd, modalState.item.omschrijving);
      closeModal();
    } else {
      // Eerst de bevestiging weg, anders staat de foutmelding achter het
      // verborgen formulier en ziet de beheerder hem niet.
      bevestiging.annuleer();
      setActionError(t(`${meervoud}ActionError`));
    }
  }
```

Bereken het aantal op renderpunt, naast de `columns`-definitie:

```tsx
  // Op renderpunt, niet bij het stellen van de vraag: de modal staat dan nog open, dus
  // het item en de kunstwerkenlijst zijn beide beschikbaar. Zo hoeft de gedeelde hook
  // geen sectiespecifieke bijlage te bewaren.
  const verwijderInUseCount =
    modalState?.mode === 'edit'
      ? (kunstwerken ?? []).filter((kunstwerk) =>
          (kunstwerk[kunstwerkIdsKey] ?? []).includes(modalState.item.id)
        ).length
      : 0;
```

- [ ] **Step 4: Swap the modal footer and body**

Vervang de `footerActions`-prop van de `Modal`:

```tsx
        footerActions={
          bevestiging.item !== null ? (
            <VerwijderBevestigingActies
              onBevestig={verwijderDefinitief}
              onAnnuleer={bevestiging.annuleer}
              testIdPrefix={enkelvoud}
            />
          ) : (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={!omschrijving}
                data-testid={`${enkelvoud}-modal-opslaan`}
                className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
              >
                {t(`${meervoud}Opslaan`)}
              </button>
              {modalState?.mode === 'edit' && (
                <button
                  type="button"
                  onClick={handleRemove}
                  data-testid={`${enkelvoud}-modal-verwijderen`}
                  className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
                >
                  {t(`${meervoud}Verwijderen`)}
                </button>
              )}
            </>
          )
        }
```

En de inhoud. Het bestaande blok gebruikt een ternary die het formulier uit de DOM haalt; dat wordt een `hidden`-klasse plus een broer, gewikkeld in een fragment:

```tsx
        <>
          {bevestiging.item !== null && (
            <VerwijderBevestigingTekst
              item={bevestiging.item}
              extraRegel={
                verwijderInUseCount > 0
                  ? t(`${meervoud}VerwijderBevestiging`, { count: verwijderInUseCount })
                  : undefined
              }
              testId={`${enkelvoud}-modal-verwijder-bevestiging`}
            />
          )}
          <div
            data-testid={`${enkelvoud}-modal`}
            className={
              bevestiging.item !== null ? 'hidden' : 'flex flex-col gap-2 text-sm text-white/80'
            }
          >
            <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
              <span>
                {t(`${meervoud}LabelOmschrijving`)}
                <RequiredMark />
              </span>
              <input
                type="text"
                value={omschrijving}
                onChange={(event) => setOmschrijving(event.target.value)}
                data-testid={`${enkelvoud}-modal-omschrijving`}
                className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
              />
            </label>

            <RequiredLegend testId={`${enkelvoud}-modal-verplicht-legende`}>
              {t('verplichtVeldLegende')}
            </RequiredLegend>

            {actionError && (
              <p data-testid={`${enkelvoud}-modal-error`} className="text-xs text-red-400">
                {actionError}
              </p>
            )}
          </div>
        </>
```

- [ ] **Step 5: Reword the three usage sentences**

In `messages/nl.json` verliezen deze drie hun vraag, want die komt nu uit `verwijderBevestigingVraag`:

```json
    "segmentenVerwijderBevestiging": "Dit segment wordt nog gebruikt door {count} kunstwerk(en).",
    "stijlenVerwijderBevestiging": "Deze stijl wordt nog gebruikt door {count} kunstwerk(en).",
    "onderwerpenVerwijderBevestiging": "Dit onderwerp wordt nog gebruikt door {count} kunstwerk(en).",
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run tests/components/beheer/SegmentenSection.test.tsx tests/components/beheer/StijlenSection.test.tsx tests/components/beheer/OnderwerpenSection.test.tsx
npx tsc --noEmit
```

Verwacht: alle tests PASS, `tsc` exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/beheer/LookupSection.tsx messages/nl.json tests/components/beheer
git commit -m "feat: verwijderbevestiging altijd bij segmenten, stijlen en onderwerpen"
```

---

### Task 3: Maten, materialen, materiaalsoorten en prijsgroepen

Vier secties met exact dezelfde vorm: een blokkadecontrole, dan wissen. De blokkade blijft vóór de bevestiging.

**Files:**
- Modify: `src/components/beheer/MatenSection.tsx`
- Modify: `src/components/beheer/MaterialenSection.tsx`
- Modify: `src/components/beheer/MateriaalsoortenSection.tsx`
- Modify: `src/components/beheer/PrijsgroepenSection.tsx`
- Test: `tests/components/beheer/MatenSection.test.tsx`, `MaterialenSection.test.tsx`, `MateriaalsoortenSection.test.tsx`, `PrijsgroepenSection.test.tsx`

**Interfaces:**
- Consumes: `useVerwijderBevestiging`, `VerwijderBevestigingTekst`, `VerwijderBevestigingActies` uit taak 1.

- [ ] **Step 1: Write the failing tests**

Voeg per testbestand drie tests toe. Voor `MatenSection.test.tsx`, met de testid-prefix `maat`:

```tsx
  it('vraagt om bevestiging voordat een maat verwijderd wordt', async () => {
    const onRemove = vi.fn().mockResolvedValue(true);
    renderSection({ onRemove, kunstwerken: [] });
    fireEvent.click(screen.getByTestId('data-table-row-maat-1'));
    fireEvent.click(screen.getByTestId('maat-modal-verwijderen'));

    expect(screen.getByTestId('maat-modal-verwijder-bevestiging')).toHaveTextContent(
      'Weet je zeker dat je 40×60 cm wilt verwijderen?'
    );
    expect(onRemove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('maat-modal-verwijder-bevestigen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('maat-1'));
  });

  it('verwijdert niets als de bevestiging geannuleerd wordt', () => {
    const onRemove = vi.fn().mockResolvedValue(true);
    renderSection({ onRemove, kunstwerken: [] });
    fireEvent.click(screen.getByTestId('data-table-row-maat-1'));
    fireEvent.click(screen.getByTestId('maat-modal-verwijderen'));
    fireEvent.click(screen.getByTestId('maat-modal-verwijder-annuleren'));

    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.queryByTestId('maat-modal-verwijder-bevestiging')).toBeNull();
    expect(screen.getByTestId('maat-modal')).not.toHaveClass('hidden');
  });

  it('geeft de blokkademelding en géén bevestiging voor een maat die in gebruik is', () => {
    const onRemove = vi.fn().mockResolvedValue(true);
    renderSection({ onRemove });
    fireEvent.click(screen.getByTestId('data-table-row-maat-1'));
    fireEvent.click(screen.getByTestId('maat-modal-verwijderen'));

    expect(screen.queryByTestId('maat-modal-verwijder-bevestiging')).toBeNull();
    expect(screen.getByTestId('maat-modal-error')).toHaveTextContent(
      'Deze maat is nog gekoppeld aan een kunstwerk en kan niet verwijderd worden.'
    );
    expect(onRemove).not.toHaveBeenCalled();
  });
```

Zoek in elk bestand op hoe `renderSection` heet en welke props het aanneemt, wat de row-testids en de record-ids zijn, en hoe het foutmeldingselement heet — gebruik wat er staat. Voor de blokkadetest moet de standaardfixture het record wél in gebruik hebben; is dat niet zo, geef de prop dan expliciet mee zoals hierboven met `kunstwerken`.

Schrijf dezelfde drie tests voor de andere drie, met hun eigen prefix en label:

| Testbestand | prefix | label in de vraag | blokkademelding |
| --- | --- | --- | --- |
| `MaterialenSection.test.tsx` | `materiaal` | de `omschrijving` van het materiaal | "Dit materiaal is nog gekoppeld aan een kunstwerk en kan niet verwijderd worden." |
| `MateriaalsoortenSection.test.tsx` | `materiaalsoort` | de `omschrijving` van de soort | "Deze materiaalsoort is nog gekoppeld aan materialen en kan niet verwijderd worden." |
| `PrijsgroepenSection.test.tsx` | `prijsgroep` | de `naam` van de prijsgroep | "Deze prijsgroep is nog aan een klant toegewezen en kan niet verwijderd worden." |

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/beheer/MatenSection.test.tsx
```

Verwacht: FAIL — `maat-modal-verwijder-bevestiging` bestaat niet en `onRemove` wordt direct aangeroepen.

- [ ] **Step 3: Wire MatenSection**

Voeg in `src/components/beheer/MatenSection.tsx` de import toe:

```tsx
import {
  useVerwijderBevestiging,
  VerwijderBevestigingTekst,
  VerwijderBevestigingActies,
} from './verwijderBevestiging';
```

Naast de bestaande state:

```tsx
  const bevestiging = useVerwijderBevestiging();
```

Vervang `handleRemove` door:

```tsx
  function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const inUse = (kunstwerken ?? []).some((kunstwerk) => kunstwerk.maatIds.includes(modalState.maat.id));
    if (inUse) {
      setActionError(t('matenVerwijderBlocked'));
      return;
    }
    bevestiging.vraag(`${modalState.maat.breedte}×${modalState.maat.hoogte} cm`);
  }

  async function verwijderDefinitief() {
    if (modalState?.mode !== 'edit') return;
    const success = await onRemove(modalState.maat.id);
    if (success) {
      void logActiviteit('maat_verwijderd', `${modalState.maat.breedte}×${modalState.maat.hoogte} cm`);
      closeModal();
    } else {
      bevestiging.annuleer();
      setActionError(t('matenActionError'));
    }
  }
```

Zorg dat `closeModal` `bevestiging.annuleer()` aanroept.

Wissel de footer om:

```tsx
        footerActions={
          bevestiging.item !== null ? (
            <VerwijderBevestigingActies
              onBevestig={verwijderDefinitief}
              onAnnuleer={bevestiging.annuleer}
              testIdPrefix="maat"
            />
          ) : (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={!breedte || !hoogte || Number(breedte) <= 0 || Number(hoogte) <= 0}
                data-testid="maat-modal-opslaan"
                className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
              >
                {t('matenOpslaan')}
              </button>
              {modalState?.mode === 'edit' && (
                <button
                  type="button"
                  onClick={handleRemove}
                  data-testid="maat-modal-verwijderen"
                  className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
                >
                  {t('matenVerwijderen')}
                </button>
              )}
            </>
          )
        }
```

En de inhoud: wikkel het bestaande `<div data-testid="maat-modal">` in een fragment met de bevestigingstekst ernaast, en maak zijn `className` afhankelijk van de bevestiging:

```tsx
        <>
          {bevestiging.item !== null && (
            <VerwijderBevestigingTekst
              item={bevestiging.item}
              testId="maat-modal-verwijder-bevestiging"
            />
          )}
          <div
            data-testid="maat-modal"
            className={
              bevestiging.item !== null ? 'hidden' : 'flex flex-col gap-2 text-sm text-white/80'
            }
          >
            {/* de bestaande inhoud van dit blok blijft ongewijzigd */}
          </div>
        </>
```

- [ ] **Step 4: Wire MaterialenSection**

Zelfde import, zelfde `const bevestiging = useVerwijderBevestiging();`, `closeModal` roept `bevestiging.annuleer()` aan. Vervang `handleRemove`:

```tsx
  function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const inUse = (kunstwerken ?? []).some((kunstwerk) =>
      kunstwerk.materiaalIds.includes(modalState.materiaal.id)
    );
    if (inUse) {
      setActionError(t('materialenVerwijderBlocked'));
      return;
    }
    bevestiging.vraag(modalState.materiaal.omschrijving);
  }

  async function verwijderDefinitief() {
    if (modalState?.mode !== 'edit') return;
    const success = await onRemove(modalState.materiaal.id);
    if (success) {
      void logActiviteit('materiaal_verwijderd', modalState.materiaal.omschrijving);
      closeModal();
    } else {
      bevestiging.annuleer();
      setActionError(t('materialenActionError'));
    }
  }
```

Wissel footer en inhoud om precies zoals in stap 3, met `testIdPrefix="materiaal"`, `testId="materiaal-modal-verwijder-bevestiging"` en de bestaande `disabled`-conditie van de opslaanknop ongewijzigd.

- [ ] **Step 5: Wire MateriaalsoortenSection**

```tsx
  function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const inUse = (materialen ?? []).some(
      (materiaal) => materiaal.materiaalsoortId === modalState.materiaalsoort.id
    );
    if (inUse) {
      setActionError(t('materiaalsoortenVerwijderBlocked'));
      return;
    }
    bevestiging.vraag(modalState.materiaalsoort.omschrijving);
  }

  async function verwijderDefinitief() {
    if (modalState?.mode !== 'edit') return;
    const success = await onRemove(modalState.materiaalsoort.id);
    if (success) {
      void logActiviteit('materiaalsoort_verwijderd', modalState.materiaalsoort.omschrijving);
      closeModal();
    } else {
      bevestiging.annuleer();
      setActionError(t('materiaalsoortenActionError'));
    }
  }
```

Footer en inhoud met `testIdPrefix="materiaalsoort"` en `testId="materiaalsoort-modal-verwijder-bevestiging"`.

- [ ] **Step 6: Wire PrijsgroepenSection**

```tsx
  function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const inUse = (klanten ?? []).some((klant) => klant.prijsgroepId === modalState.prijsgroep.id);
    if (inUse) {
      setActionError(t('prijsgroepenVerwijderBlocked'));
      return;
    }
    bevestiging.vraag(modalState.prijsgroep.naam);
  }

  async function verwijderDefinitief() {
    if (modalState?.mode !== 'edit') return;
    const success = await onRemove(modalState.prijsgroep.id);
    if (success) {
      void logActiviteit('prijsgroep_verwijderd', modalState.prijsgroep.naam);
      closeModal();
    } else {
      bevestiging.annuleer();
      setActionError(t('prijsgroepenActionError'));
    }
  }
```

Footer en inhoud met `testIdPrefix="prijsgroep"` en `testId="prijsgroep-modal-verwijder-bevestiging"`.

- [ ] **Step 7: Run tests to verify they pass**

```bash
npx vitest run tests/components/beheer/MatenSection.test.tsx tests/components/beheer/MaterialenSection.test.tsx tests/components/beheer/MateriaalsoortenSection.test.tsx tests/components/beheer/PrijsgroepenSection.test.tsx
npx tsc --noEmit
```

Verwacht: alle tests PASS, `tsc` exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/components/beheer tests/components/beheer
git commit -m "feat: verwijderbevestiging bij maten, materialen, materiaalsoorten en prijsgroepen"
```

---

### Task 4: Kunstenaars en drukkers

Twee secties met een eigen bijzonderheid: `KunstenaarsSection` heeft naast de blokkade ook een "kunstwerken nog niet geladen"-weigering, en `DrukkerModal` sluit via een `onClose`-prop van de ouder in plaats van een eigen `closeModal`.

**Files:**
- Modify: `src/components/beheer/KunstenaarsSection.tsx`
- Modify: `src/components/beheer/DrukkerModal.tsx`
- Test: `tests/components/beheer/KunstenaarsSection.test.tsx`, `tests/components/beheer/DrukkerModal.test.tsx`

**Interfaces:**
- Consumes: `useVerwijderBevestiging`, `VerwijderBevestigingTekst`, `VerwijderBevestigingActies` uit taak 1.

- [ ] **Step 1: Write the failing tests**

In `tests/components/beheer/KunstenaarsSection.test.tsx`:

```tsx
  it('vraagt om bevestiging voordat een kunstenaar verwijderd wordt', async () => {
    const onRemove = vi.fn().mockResolvedValue(true);
    renderSection({ onRemove, kunstwerken: [] });
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-verwijderen'));

    expect(screen.getByTestId('kunstenaar-modal-verwijder-bevestiging')).toHaveTextContent(
      'Weet je zeker dat je Sabrina Glasser wilt verwijderen?'
    );
    expect(onRemove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('kunstenaar-modal-verwijder-bevestigen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('ka-1'));
  });

  it('verwijdert niets als de bevestiging geannuleerd wordt', () => {
    const onRemove = vi.fn().mockResolvedValue(true);
    renderSection({ onRemove, kunstwerken: [] });
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-verwijderen'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-verwijder-annuleren'));

    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.queryByTestId('kunstenaar-modal-verwijder-bevestiging')).toBeNull();
  });

  it('geeft geen bevestiging als de kunstenaar nog aan een kunstwerk hangt', () => {
    const onRemove = vi.fn().mockResolvedValue(true);
    renderSection({ onRemove });
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-verwijderen'));

    expect(screen.queryByTestId('kunstenaar-modal-verwijder-bevestiging')).toBeNull();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('geeft geen bevestiging als de kunstwerken nog niet geladen zijn', () => {
    const onRemove = vi.fn().mockResolvedValue(true);
    renderSection({ onRemove, kunstwerken: null });
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-verwijderen'));

    expect(screen.queryByTestId('kunstenaar-modal-verwijder-bevestiging')).toBeNull();
    expect(onRemove).not.toHaveBeenCalled();
  });
```

In `tests/components/beheer/DrukkerModal.test.tsx` de eerste twee gevallen, met prefix `drukker`, het label uit `drukker.naam`, en een `zendingen`-prop van `[]` zodat de blokkade niet aanslaat. Zoek in dat bestand op hoe de modal geopend wordt (`DrukkerModal` krijgt zijn `state` als prop, er is geen tabelrij om op te klikken) en hoe de bestaande tests dat doen.

De ids `ka-1`, de naam `Sabrina Glasser`, de row-testids en de `renderSection`-signatuur moet je in de bestanden opzoeken en overnemen zoals ze zijn.

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/beheer/KunstenaarsSection.test.tsx tests/components/beheer/DrukkerModal.test.tsx
```

Verwacht: de nieuwe bevestigingstests FAIL; de twee blokkadetests slagen mogelijk al, want die weigeren nu ook.

- [ ] **Step 3: Wire KunstenaarsSection**

Import en `const bevestiging = useVerwijderBevestiging();` toevoegen, `closeModal` laat `bevestiging.annuleer()` aanroepen. Vervang `handleRemove`:

```tsx
  function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    // Nog niet geladen kunstwerken mogen niet als "niet in gebruik" gelezen worden: dat
    // zou een kunstwerk met een dangling kunstenaarId achterlaten.
    if (kunstwerken === null) {
      setActionError(t('kunstenaarsVerwijderOnbekend'));
      return;
    }
    const inUse = kunstwerken.some((kunstwerk) => kunstwerk.kunstenaarId === modalState.kunstenaar.id);
    if (inUse) {
      setActionError(t('kunstenaarsVerwijderBlocked'));
      return;
    }
    bevestiging.vraag(modalState.kunstenaar.naam);
  }

  async function verwijderDefinitief() {
    if (modalState?.mode !== 'edit') return;
    let success: boolean;
    try {
      // De kunstenaarAfspraken-rij heeft een ON DELETE CASCADE foreign key naar
      // kunstenaars.id, dus die wordt door de database zelf opgeruimd.
      success = await onRemove(modalState.kunstenaar.id);
    } catch {
      success = false;
    }
    if (success) {
      void logActiviteit('kunstenaar_verwijderd', modalState.kunstenaar.naam);
      closeModal();
    } else {
      bevestiging.annuleer();
      setActionError(t('kunstenaarsActionError'));
    }
  }
```

Controleer de laatste regel: neem de foutsleutel over die de bestaande `handleRemove` in dit bestand gebruikt, niet de naam hierboven als die afwijkt.

Wissel footer en inhoud om zoals in taak 3, met `testIdPrefix="kunstenaar"` en `testId="kunstenaar-modal-verwijder-bevestiging"`. De opslaanknop en zijn `disabled`-conditie blijven ongewijzigd.

- [ ] **Step 4: Wire DrukkerModal**

Hier heet de sluitfunctie `onClose` en komt uit de props. Import en hook toevoegen, en `handleRemove` splitsen:

```tsx
  function handleRemove() {
    if (state?.mode !== 'edit') return;
    if ((zendingen?.length ?? 0) > 0) {
      setActionError(t('drukkersVerwijderBlocked'));
      return;
    }
    bevestiging.vraag(state.drukker.naam);
  }

  async function verwijderDefinitief() {
    if (state?.mode !== 'edit') return;
    const success = await onRemove(state.drukker.id);
    if (success) {
      void logActiviteit('drukker_verwijderd', state.drukker.naam);
      onClose();
    } else {
      bevestiging.annuleer();
      setActionError(t('drukkersActionError'));
    }
  }
```

`DrukkerModal` heeft geen eigen `closeModal`, dus de bevestiging moet opgeruimd worden waar de modal dichtgaat. Geef de `Modal` daarom een `onClose` die eerst de bevestiging wist:

```tsx
      onClose={() => {
        bevestiging.annuleer();
        onClose();
      }}
```

Wissel footer en inhoud om met `testIdPrefix="drukker"` en `testId="drukker-modal-verwijder-bevestiging"`. Let op dat de verwijderknop hier ook een `disabled={zendingen === null}` heeft — die blijft staan.

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/components/beheer/KunstenaarsSection.test.tsx tests/components/beheer/DrukkerModal.test.tsx tests/components/beheer/DrukkersSection.test.tsx
npx tsc --noEmit
```

Verwacht: alle tests PASS, `tsc` exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/beheer tests/components/beheer
git commit -m "feat: verwijderbevestiging bij kunstenaars en drukkers"
```

---

### Task 5: Kunstwerken

Deze modal heeft al een bevestiging: `pendingCodeWijziging`, voor het wijzigen van de code. De verwijderbevestiging komt ernaast, en de twee mogen elkaar niet in de weg zitten.

**Files:**
- Modify: `src/components/beheer/KunstwerkenSection.tsx`
- Test: `tests/components/beheer/KunstwerkenSection.test.tsx`

**Interfaces:**
- Consumes: `useVerwijderBevestiging`, `VerwijderBevestigingTekst`, `VerwijderBevestigingActies` uit taak 1.

- [ ] **Step 1: Write the failing tests**

In `tests/components/beheer/KunstwerkenSection.test.tsx`. Dit bestand heeft al een `renderSection`-helper en fixtures `KUNSTWERKEN[0]`/`[1]`; open de modal zoals de bestaande tests dat doen (via het `data-table-row-…`-testid).

```tsx
  it('vraagt om bevestiging voordat een kunstwerk verwijderd wordt', async () => {
    const onRemove = vi.fn().mockResolvedValue(true);
    renderSection({ onRemove });
    fireEvent.click(screen.getByTestId('data-table-row-kw-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-verwijderen'));

    expect(screen.getByTestId('kunstwerk-modal-verwijder-bevestiging')).toHaveTextContent(
      `Weet je zeker dat je ${KUNSTWERKEN[0].code} wilt verwijderen?`
    );
    expect(onRemove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('kunstwerk-modal-verwijder-bevestigen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('kw-1'));
  });

  it('verwijdert niets als de verwijderbevestiging geannuleerd wordt', () => {
    const onRemove = vi.fn().mockResolvedValue(true);
    renderSection({ onRemove });
    fireEvent.click(screen.getByTestId('data-table-row-kw-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-verwijderen'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-verwijder-annuleren'));

    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.queryByTestId('kunstwerk-modal-verwijder-bevestiging')).toBeNull();
    expect(screen.getByTestId('kunstwerk-modal-code')).toHaveValue(KUNSTWERKEN[0].code);
  });

  it('toont de codewijzigingsbevestiging niet tijdens een verwijderbevestiging', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-kw-1'));
    fireEvent.change(screen.getByTestId('kunstwerk-modal-code'), { target: { value: 'Andere-Code' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-verwijderen'));

    expect(screen.getByTestId('kunstwerk-modal-verwijder-bevestiging')).toBeInTheDocument();
    expect(screen.queryByTestId('kunstwerk-modal-code-bevestiging')).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx -t "verwijder"
```

Verwacht: de nieuwe tests FAIL — `kunstwerk-modal-verwijder-bevestiging` bestaat niet en `onRemove` wordt direct aangeroepen.

- [ ] **Step 3: Wire the hook and split handleRemove**

Import en `const bevestiging = useVerwijderBevestiging();` toevoegen. `closeModal` roept naast `setPendingCodeWijziging(null)` ook `bevestiging.annuleer()` aan; doe hetzelfde in `resetForm` en `openEdit`, waar `setPendingCodeWijziging(null)` nu al staat.

Vervang `handleRemove`:

```tsx
  function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    bevestiging.vraag(modalState.kunstwerk.code);
  }

  async function verwijderDefinitief() {
    if (modalState?.mode !== 'edit') return;
    const success = await onRemove(modalState.kunstwerk.id);
    if (success) {
      void logActiviteit('kunstwerk_verwijderd', modalState.kunstwerk.code);
      closeModal();
    } else {
      bevestiging.annuleer();
      setActionError(t('kunstwerkenActionError'));
    }
  }
```

Er is hier geen blokkadecontrole nodig: de verwijderknop wordt al niet gerenderd zolang `codeOpSlot` waar is.

- [ ] **Step 4: Extend the footer and body to three states**

De `footerActions` krijgt drie takken. De verwijderbevestiging gaat vóór de codebevestiging, zodat er nooit twee sets knoppen tegelijk zijn:

```tsx
        footerActions={
          bevestiging.item !== null ? (
            <VerwijderBevestigingActies
              onBevestig={verwijderDefinitief}
              onAnnuleer={bevestiging.annuleer}
              testIdPrefix="kunstwerk"
            />
          ) : pendingCodeWijziging !== null ? (
            <>
              <button
                type="button"
                onClick={bewaarKunstwerk}
                data-testid="kunstwerk-modal-code-bevestigen"
                className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
              >
                {t('kunstwerkenCodeWijzigenBevestig')}
              </button>
              <button
                type="button"
                onClick={handleAnnulerenCodeWijziging}
                data-testid="kunstwerk-modal-code-annuleren"
                className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('annuleren')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={opslaanDisabled}
                data-testid="kunstwerk-modal-opslaan"
                className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
              >
                {t('kunstwerkenOpslaan')}
              </button>
              {modalState?.mode === 'edit' && !codeOpSlot && (
                <button
                  type="button"
                  onClick={handleRemove}
                  data-testid="kunstwerk-modal-verwijderen"
                  className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
                >
                  {t('kunstwerkenVerwijderen')}
                </button>
              )}
            </>
          )
        }
```

In de inhoud komt het verwijderblok naast het bestaande codebevestigingsblok, en het formulier is verborgen zodra een van de twee open staat:

```tsx
        {bevestiging.item !== null && (
          <VerwijderBevestigingTekst
            item={bevestiging.item}
            testId="kunstwerk-modal-verwijder-bevestiging"
          />
        )}
        {bevestiging.item === null && pendingCodeWijziging !== null && (
          <div
            data-testid="kunstwerk-modal-code-bevestiging"
            className="flex flex-col gap-3 text-sm text-white/80"
          >
            <p className="font-semibold text-white">{t('kunstwerkenCodeWijzigenTitel')}</p>
            <p>{t('kunstwerkenCodeWijzigenTekst')}</p>
          </div>
        )}
        <div
          data-testid="kunstwerk-modal"
          className={
            bevestiging.item !== null || pendingCodeWijziging !== null
              ? 'hidden'
              : 'grid grid-cols-1 gap-6 text-sm text-white/80 lg:grid-cols-[minmax(0,1fr)_320px] min-[1432px]:grid-cols-[minmax(0,1fr)_560px]'
          }
        >
```

Neem de `className` van het formulier over zoals hij op dat moment in het bestand staat — bovenstaande waarde is die van 10-08-2026 en mag niet per ongeluk een responsieve tier verliezen.

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/components/beheer/KunstwerkenSection.test.tsx
npx tsc --noEmit
```

Verwacht: alle tests PASS (inclusief de bestaande codebevestigings- en codeveld-op-slot-tests), `tsc` exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/beheer/KunstwerkenSection.tsx tests/components/beheer/KunstwerkenSection.test.tsx
git commit -m "feat: verwijderbevestiging bij kunstwerken"
```

---

### Task 6: Volledige verificatie en documentatie

**Files:**
- Modify: `docs/huidige-staat.md`

- [ ] **Step 1: Run the full verification**

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Verwacht: alle vier zonder fouten. `npm run lint` geeft zes bestaande `<img>`-warnings en geen errors. Rapporteer de werkelijke uitkomst — beweer niets over "alles groen" zonder deze uitvoer gezien te hebben.

- [ ] **Step 2: Check for missed delete buttons**

```bash
grep -rn "modal-verwijderen" --include="*.tsx" src/components | grep -v "\.test\."
```

Verwacht: acht treffers, allemaal in een sectie die nu een bevestiging heeft — `kunstwerk`, `kunstenaar`, `drukker`, `maat`, `materiaal`, `materiaalsoort`, `prijsgroep` en het samengestelde `${enkelvoud}` in `LookupSection`. Staat er een negende, dan is die in dit plan gemist; meld dat in plaats van hem stil toe te voegen.

- [ ] **Step 3: Update `docs/huidige-staat.md`**

Zoek de passage over de beheersecties en leg vast dat elke verwijderknop in beheer eerst om bevestiging vraagt, met het item bij naam, dat de bestaande blokkades daarvóór komen, en dat het weghalen van een contactpersoon of btw-tarief geen bevestiging heeft omdat die pas bij Opslaan echt verdwijnen.

- [ ] **Step 4: Commit**

```bash
git add docs/huidige-staat.md
git commit -m "docs: beschrijf de verwijderbevestiging in de huidige staat"
```

---

## Self-Review

Uitgevoerd tegen [`docs/superpowers/specs/2026-08-10-verwijderbevestiging-design.md`](../specs/2026-08-10-verwijderbevestiging-design.md):

- **Sectie A (de gedeelde module)** → taak 1. De drie exports komen letterlijk overeen met de signaturen in de spec.
- **Sectie B (het verloop in een sectie)** → alle zes stappen zitten in taak 2 tot 5: poort met blokkadecontrole, `vraag`, inhoud en footer wisselen, formulier `hidden`, schrijfactie op bevestigen, `annuleer` bij annuleren en bij het sluiten van de modal.
- **Sectie C (segmenten/stijlen/onderwerpen)** → taak 2, inclusief het berekenen van het aantal op renderpunt en het verdwijnen van `pendingVerwijderCount`.
- **Vertalingen** → de twee nieuwe sleutels in taak 1 (want de helpers gebruiken ze), de drie geherformuleerde in taak 2. Hergebruikte sleutels staan in de Global Constraints.
- **Testids** → de drie nieuwe per sectie, in elke taak expliciet benoemd.
- **Tests** → de drie gevallen per sectie staan in taak 2 tot 5; de blokkadetest bij de zes secties die een blokkade hebben; de gebruikszin bij de drie lookup-secties; het niet-bijten van de twee bevestigingen in taak 5; de eigen test voor de module in taak 1.
- **Wat het ontwerp bewust niet doet** → geen taak raakt de serverkant, `GlassartDesignSection`, `InstellingenSection` of klanten. Taak 6 stap 2 controleert of er geen negende verwijderknop bestaat die het plan mist.
- **Placeholders** → geen "TBD" of "vergelijkbaar met taak N". Op vijf plekken vraagt het plan expliciet om iets in het bestand op te zoeken in plaats van te gokken (fixture-ids en row-testids, de `renderSection`-signaturen, de foutsleutel in `KunstenaarsSection`, de manier waarop `DrukkerModal` in zijn test geopend wordt, en de `className` van het kunstwerkformulier). Dat is bewust: die namen staan in bestanden die de taak toch al opent, en ze verkeerd gokken levert stille testfouten op.
- **Typeconsistentie** → `bevestiging.item` / `.vraag()` / `.annuleer()` heten in taak 2 tot 5 overal hetzelfde als in taak 1. De schrijfactie heet in alle secties `verwijderDefinitief`, de poort blijft `handleRemove`. `VerwijderBevestigingActies` krijgt overal `testIdPrefix` in enkelvoud, `VerwijderBevestigingTekst` overal een volledig `testId`.
