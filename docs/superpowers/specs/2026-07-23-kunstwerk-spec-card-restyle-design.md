# KunstwerkSpecCard restyle: whitespace, consistent size, gold accents, Collectie

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 23-07-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **COMPONENT BESTAAT NIET MEER.** `KunstwerkSpecCard.tsx` is verwijderd in commit `558be38` ("remove KunstwerkSpecCard now that nothing uses it"). De productweergave in de winkel loopt nu via `ProductsGrid.tsx` en `ProductModal.tsx`. Dit ontwerp beschrijft dus vormgeving van een component die niet meer bestaat — de gouden accenten en de spec-regels zijn deels opgegaan in `ProductModal`, maar niet één-op-één. Lees het als achtergrond bij de vormgevingskeuzes, niet als beschrijving van de huidige winkelkaart.

## Context

`KunstwerkSpecCard.tsx` renders the product card shown in the shop grid
(`ProductsGrid.tsx`) and in the beheer live preview (`KunstwerkenSection.tsx`).
The user supplied a reference photo (a real print product sheet, "GLS-SAB-009 /
Vibrant Spirit") and asked for the shop cards to match its look:

- White space around the photo, same physical size for every card regardless
  of the source photo's aspect ratio.
- Gold used for the divider lines and the footer tagline.
- A code line + italic title, and a "Collectie" (segment) row.

Clarified during brainstorming: the reference's "GLS-SAB-009" is the existing
`naam` field (already used by this client as a product code, not a display
title). The italic title ("Vibrant Spirit") should be the locale-resolved
`omschrijving`, which today is never shown on the card at all.

## Changes

### 1. `KunstwerkSpecCard.tsx` — content

- Props change from a single `naam` to `code` (→ `kunstwerk.naam`) and `titel`
  (→ resolved `omschrijving`). Render `code` as a small heading, `titel` in
  italic below it.
- Keep `artiest` as an optional line, unchanged.
- Add a `collectieLabels: string[]` prop, rendered as a new "Collectie" row
  above Materiaal/Formaten in the same `dl` pattern (joined with `, `).
- New translation key `kunstwerkSpecCard.collectie` in all 4 `messages/*.json`
  files.

### 2. Photo — whitespace + consistent size

- Replace `object-cover` with `object-contain` on a white background inside a
  fixed-aspect, padded frame (`aspect-[2/3]` container + `p-4`), so every
  photo letterboxes with visible white margin instead of being cropped, and
  every card has an identical footprint regardless of the source image's
  aspect ratio.
- Applied in both call sites that render `KunstwerkSpecCard`'s `fotoSlot`:
  `ProductsGrid.tsx` (via `WatermarkedImage`) and `KunstwerkenSection.tsx`
  (beheer preview `<img>`).
- `ProductModal.tsx` (the dark buy dialog) is explicitly out of scope — it's a
  different UI, not the spec-card layout from the reference.

### 3. Gold

- Both `<hr>` dividers: `border-ink/10` → `border-gold/40`.
- Footer tagline: `text-ink/50` → `text-gold`. "Glassart & Design" stays as-is
  (bold, dark).

### 4. Data flow

- `ProductsGrid.tsx`: pass `code={kunstwerk.naam}`, `titel={omschrijving}`,
  and `collectieLabels` resolved from `kunstwerk.segmentIds` against the
  already-loaded `segmenten` collection.
- `KunstwerkenSection.tsx` preview: same split, using its existing
  `segmentNaamById` map.

No changes to the `Kunstwerk` data model — both `naam` and `omschrijving*`
already exist.

## Out of scope

- `ProductModal.tsx` styling/photo treatment.
- Any new "product code" data field (not needed — `naam` already serves this
  purpose for this client's data).
