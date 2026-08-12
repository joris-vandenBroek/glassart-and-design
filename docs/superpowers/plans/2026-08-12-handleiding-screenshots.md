# Screenshots in de gebruikershandleiding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Voeg een `Screenshot`-component toe aan de gebruikershandleiding en wire hem in bij vier hoofdstukken (klant-registratie, bestelproces, kunstwerken, kunstenaars), elk met een al vastgelegde afbeelding onder `public/documentatie/`.

**Architecture:** Eén nieuwe presentational component (`Screenshot`) in het bestaande `DocumentatieBlocks.tsx`, gebruikt door vier bestaande chapter-componenten. Geen state, geen API's, geen build-afhankelijkheden — puur een `<figure><img/></figure>`-wrapper.

**Tech Stack:** React/TSX, Vitest + React Testing Library (bestaande conventies in dit deel van de codebase).

## Global Constraints

- Beheer-only UI-tekst (alt-teksten, captions) hoeft alleen in het Nederlands — geen next-intl-sleutels, hardcoded proza, conform de rest van `chapters/*.tsx`.
- Afbeeldingen zijn statische bestanden onder `public/documentatie/` (al aanwezig: `klant-registratie.png`, `bestelproces.png`, `kunstwerken.png`, `kunstenaars.png`), gerefereerd met een gewone `<img>` — geen `next/image`, conform de rest van de codebase.
- Geen wijzigingen aan `DocumentatieSidebar.tsx` of de algemene pagina-lay-out.

---

### Task 1: `Screenshot`-component in DocumentatieBlocks

**Files:**
- Modify: `src/components/beheer/documentatie/DocumentatieBlocks.tsx`
- Test: `tests/components/beheer/documentatie/DocumentatieBlocks.test.tsx` (nieuw bestand — dit is de eerste test voor dit bestand)

**Interfaces:**
- Produces: `Screenshot({ src: string; alt: string; caption?: string })` — een React-componentfunctie, benoemd export uit `@/components/beheer/documentatie/DocumentatieBlocks`, naast de bestaande `Chapter`/`SubSection`/`P`/`UL`/`DocLink`.

- [ ] **Step 1: Schrijf de falende tests**

Maak `tests/components/beheer/documentatie/DocumentatieBlocks.test.tsx` aan:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Screenshot } from '@/components/beheer/documentatie/DocumentatieBlocks';

describe('Screenshot', () => {
  it('renders an image with the given src and alt text', () => {
    render(<Screenshot src="/documentatie/kunstwerken.png" alt="Het kunstwerk-formulier" />);
    const img = screen.getByRole('img', { name: 'Het kunstwerk-formulier' });
    expect(img).toHaveAttribute('src', '/documentatie/kunstwerken.png');
  });

  it('renders the caption when one is given', () => {
    render(<Screenshot src="/documentatie/kunstwerken.png" alt="Het kunstwerk-formulier" caption="Zo ziet het formulier eruit" />);
    expect(screen.getByText('Zo ziet het formulier eruit')).toBeInTheDocument();
  });

  it('renders no caption element when none is given', () => {
    const { container } = render(<Screenshot src="/documentatie/kunstwerken.png" alt="Het kunstwerk-formulier" />);
    expect(container.querySelector('figcaption')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Bevestig dat de tests falen**

Run: `npx vitest run tests/components/beheer/documentatie/DocumentatieBlocks.test.tsx`
Expected: FAIL — `Screenshot` bestaat nog niet (`SyntaxError` of `undefined component` afhankelijk van de exacte importfout).

- [ ] **Step 3: Implementeer `Screenshot`**

Open `src/components/beheer/documentatie/DocumentatieBlocks.tsx`. Voeg onderaan het bestand toe (na de bestaande `DocLink`-export):

```tsx
export function Screenshot({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
  return (
    <figure className="overflow-hidden rounded-lg border border-gold/40 shadow-sm">
      <img src={src} alt={alt} className="w-full" />
      {caption && (
        <figcaption className="border-t border-gold/40 bg-silver/40 px-3 py-2 text-sm text-charcoal/70">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
```

- [ ] **Step 4: Bevestig dat de tests slagen**

Run: `npx vitest run tests/components/beheer/documentatie/DocumentatieBlocks.test.tsx`
Expected: PASS — 3 tests groen.

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/documentatie/DocumentatieBlocks.tsx tests/components/beheer/documentatie/DocumentatieBlocks.test.tsx
git commit -m "feat: voeg Screenshot-component toe aan de gebruikershandleiding"
```

---

### Task 2: Screenshot wiren in de vier hoofdstukken

**Files:**
- Modify: `src/components/beheer/documentatie/chapters/KlantRegistratieChapter.tsx`
- Modify: `src/components/beheer/documentatie/chapters/BestelprocesChapter.tsx`
- Modify: `src/components/beheer/documentatie/chapters/KunstwerkenChapter.tsx`
- Modify: `src/components/beheer/documentatie/chapters/KunstenaarsChapter.tsx`
- Test: `tests/components/beheer/documentatie/chapterScreenshots.test.tsx` (nieuw bestand)

**Interfaces:**
- Consumes: `Screenshot` uit Task 1, exact signature `Screenshot({ src, alt, caption? })`.

De vier bestanden bevatten momenteel elk een inleidend blok (één of meer `<P>`, in twee gevallen gevolgd door een handgemaakt schema-component), direct gevolgd door de eerste `<SubSection>`. De screenshot komt telkens ná dat inleidende blok en vóór de eerste `SubSection`.

- [ ] **Step 1: Schrijf de falende tests**

Maak `tests/components/beheer/documentatie/chapterScreenshots.test.tsx` aan:

```tsx
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { KlantRegistratieChapter } from '@/components/beheer/documentatie/chapters/KlantRegistratieChapter';
import { BestelprocesChapter } from '@/components/beheer/documentatie/chapters/BestelprocesChapter';
import { KunstwerkenChapter } from '@/components/beheer/documentatie/chapters/KunstwerkenChapter';
import { KunstenaarsChapter } from '@/components/beheer/documentatie/chapters/KunstenaarsChapter';

describe('hoofdstuk-screenshots', () => {
  it.each([
    ['KlantRegistratieChapter', KlantRegistratieChapter, '/documentatie/klant-registratie.png'],
    ['BestelprocesChapter', BestelprocesChapter, '/documentatie/bestelproces.png'],
    ['KunstwerkenChapter', KunstwerkenChapter, '/documentatie/kunstwerken.png'],
    ['KunstenaarsChapter', KunstenaarsChapter, '/documentatie/kunstenaars.png'],
  ])('%s toont een screenshot met src %s', (_name, Chapter, expectedSrc) => {
    const { container } = render(<Chapter />);
    const img = container.querySelector(`img[src="${expectedSrc}"]`);
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('alt');
    expect(img?.getAttribute('alt')).not.toBe('');
  });
});
```

- [ ] **Step 2: Bevestig dat de tests falen**

Run: `npx vitest run tests/components/beheer/documentatie/chapterScreenshots.test.tsx`
Expected: FAIL — 4 tests falen (`img[src="..."]` bestaat nog niet).

- [ ] **Step 3: Wire de screenshot in `KlantRegistratieChapter.tsx`**

Werk de import bovenaan bij:

```tsx
import { Chapter, SubSection, P, DocLink, Screenshot } from '../DocumentatieBlocks';
```

Voeg direct ná `<RegistratieSchema />` (en vóór de eerste `<SubSection id="klant-registratie-goedkeuren" ...>`) toe:

```tsx
      <Screenshot
        src="/documentatie/klant-registratie.png"
        alt="De klantmodal tijdens het beoordelen van een aanvraag, met de knoppen Goedkeuren en Afwijzen"
        caption="Het klantscherm tijdens het beoordelen van een aanvraag"
      />
```

- [ ] **Step 4: Wire de screenshot in `BestelprocesChapter.tsx`**

Werk de import bovenaan bij — de bestaande regel is `import { Chapter, SubSection, P, UL, DocLink } from '../DocumentatieBlocks';`, voeg `Screenshot` toe:

```tsx
import { Chapter, SubSection, P, UL, DocLink, Screenshot } from '../DocumentatieBlocks';
```

Voeg direct ná `<BestelprocesSchema />` (en vóór de eerste `<SubSection id="bestelproces-bewerken" ...>`) toe:

```tsx
      <Screenshot
        src="/documentatie/bestelproces.png"
        alt="De bestelmodal met regels, totalen en de knoppen Goedkeuren en Afwijzen"
        caption="Een bestelling in bewerking"
      />
```

- [ ] **Step 5: Wire de screenshot in `KunstwerkenChapter.tsx`**

Werk de import bovenaan bij:

```tsx
import { Chapter, SubSection, P, Screenshot } from '../DocumentatieBlocks';
```

Voeg direct ná de inleidende `<P>Elk product dat een klant kan bestellen, is een &quot;kunstwerk&quot; in beheer.</P>` (en vóór de eerste `<SubSection id="kunstwerken-foto" ...>`) toe:

```tsx
      <Screenshot
        src="/documentatie/kunstwerken.png"
        alt="Het kunstwerk-formulier met foto, code, kunstenaar en formaat, met live voorbeeld van de collectiepagina ernaast"
        caption="Het kunstwerk-formulier, tabblad Algemeen"
      />
```

- [ ] **Step 6: Wire de screenshot in `KunstenaarsChapter.tsx`**

Werk de import bovenaan bij:

```tsx
import { Chapter, SubSection, P, Screenshot } from '../DocumentatieBlocks';
```

Voeg direct ná de inleidende `<P>Werkt een kunstenaar exclusief met jullie samen, of maak je afspraken over een vaste opslag op de prijs? Leg dat vast bij Kunstenaars.</P>` (en vóór de eerste `<SubSection id="kunstenaars-koppeling" ...>`) toe:

```tsx
      <Screenshot
        src="/documentatie/kunstenaars.png"
        alt="Het kunstenaar-formulier met naam, portretfoto, prijsopslag en exclusief verkooprecht"
        caption="Het kunstenaar-formulier"
      />
```

- [ ] **Step 7: Bevestig dat de tests slagen**

Run: `npx vitest run tests/components/beheer/documentatie/chapterScreenshots.test.tsx`
Expected: PASS — 4 tests groen.

- [ ] **Step 8: Draai de volledige documentatie-testsuite**

Run: `npx vitest run tests/components/beheer/documentatie/`
Expected: PASS — inclusief `anchorIntegrity.test.tsx`, `Documentatie.test.tsx`, `DocumentatieGate.test.tsx`, `DocumentatieSidebar.test.tsx` en de twee nieuwe bestanden uit Task 1 en Task 2. Deze stap borgt dat de nieuwe `<img>`-tags de bestaande anchor/ID-checks niet breken (screenshots voegen geen nieuwe `id`-attributen toe, dus dat zou sowieso niet moeten gebeuren, maar dit is de directe verificatie).

- [ ] **Step 9: Commit**

```bash
git add src/components/beheer/documentatie/chapters/KlantRegistratieChapter.tsx \
        src/components/beheer/documentatie/chapters/BestelprocesChapter.tsx \
        src/components/beheer/documentatie/chapters/KunstwerkenChapter.tsx \
        src/components/beheer/documentatie/chapters/KunstenaarsChapter.tsx \
        tests/components/beheer/documentatie/chapterScreenshots.test.tsx
git commit -m "feat: toon screenshots bij klant-registratie, bestelproces, kunstwerken en kunstenaars"
```

---

### Task 3: Volledige verificatie

**Files:** geen wijzigingen — alleen commando's.

- [ ] **Step 1: Type-check**

Run: `npx tsc --noEmit`
Expected: geen output (geen typefouten).

- [ ] **Step 2: Volledige testsuite**

Run: `npm test`
Expected: alle tests slagen (zie ook de opmerking in `CLAUDE.md` over de twee bekende, aan dit werk ongerelateerde flaky/data-drift-issues elders in de suite — die vallen buiten scope van dit plan; als die specifieke twee falen, is dat geen reden om dit werk te blokkeren, maar noteer het expliciet in plaats van het te negeren).

- [ ] **Step 3: Handmatige visuele controle**

Start de dev server (`npm run dev`), open `/nl/beheer/documentatie` in de browser, en scroll naar elk van de vier hoofdstukken (Klant registreren en goedkeuren, Een bestelling verwerken, Een kunstwerk aanmaken, Een kunstenaar aanmaken). Controleer dat elke afbeelding laadt, leesbaar is, en de bijschriften kloppen.
