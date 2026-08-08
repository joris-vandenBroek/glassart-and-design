# Under Construction voor niet-klaar-om-live-te-gaan pagina's

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 26-07-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

## Doel

De site live brengen met alleen de homepage actief. Collecties, Word klant,
Inloggen, Beheer, Account en Contact tonen een Under Construction-pagina,
zonder de bestaande implementatie van die pagina's weg te gooien. Later kan
elke pagina apart weer live gezet worden.

## Aanpak

### Centrale config

`src/config/pageAvailability.ts` exporteert een object met per route een
boolean:

```ts
export const pageAvailability = {
  collecties: false,
  wordKlant: false,
  inloggen: false,
  beheer: false,
  account: false,
  contact: false,
};
```

`false` = toont Under Construction. Om een pagina later live te zetten: vlag
op `true`, opnieuw builden en deployen (de site is een Next.js static export,
dus dat is toch al de bestaande deploy-flow — er is geen runtime-toggle
nodig of gewenst).

### Guard-clause per pagina

In elke van de zes `page.tsx`-bestanden komt, na `setRequestLocale(locale)`
en vóór de rest van de bestaande render-logica, één guard:

```ts
if (!pageAvailability.collecties) {
  return <UnderConstruction />;
}
```

Alle bestaande imports en JSX van de pagina blijven ongewijzigd staan onder
deze guard. Er wordt niets verwijderd of herschreven — alleen een vroege
return toegevoegd.

Betrokken bestanden:
- `src/app/[locale]/collecties/page.tsx` → `pageAvailability.collecties`
- `src/app/[locale]/word-klant/page.tsx` → `pageAvailability.wordKlant`
- `src/app/[locale]/inloggen/page.tsx` → `pageAvailability.inloggen`
- `src/app/[locale]/beheer/page.tsx` → `pageAvailability.beheer`
- `src/app/[locale]/account/page.tsx` → `pageAvailability.account`
- `src/app/[locale]/contact/page.tsx` → `pageAvailability.contact`

Home (`src/app/[locale]/page.tsx`) blijft ongewijzigd en live — dat is de
enige pagina die nog echt actief is.

### NavBar

`src/components/NavBar.tsx` blijft ongewijzigd: de links naar Collecties,
Contact, Word klant, Inloggen en Beheer blijven zichtbaar en klikbaar. Een
klik komt gewoon op de Under Construction-pagina van die route uit.

### UnderConstruction-component

Nieuw bestand `src/components/UnderConstruction.tsx`, server component (geen
hooks nodig), in de bestaande huisstijl (ink/charcoal achtergrond, goud
accent — zelfde `bg-gradient-to-b from-ink via-charcoal to-graphite`
achtergrond als de andere pagina's, binnen een `GlassPanel`).

Inhoud, van boven naar beneden, gecentreerd:
1. Cirkel met dunne gouden rand, met daarin een inline SVG diamant-icoon
   (geen externe icon-library nodig — er is er nu geen in dependencies)
2. Eyebrow-label (kleine tracked-uppercase tekst, bv. "BINNENKORT")
3. Kop (bv. "We zijn met iets moois bezig")
4. Korte subtekst (bv. "Deze pagina is in ontwikkeling. Kom binnenkort terug
   om het resultaat te zien.")
5. Dun gouden lijntje (visuele divider, 1px, ~32px breed)
6. Link "Terug naar home" (`Link` uit `@/i18n/navigation`, naar `/`)

Teksten komen uit een nieuwe `underConstruction`-namespace in
`messages/{nl,en,de,fr}.json` (`eyebrow`, `heading`, `text`, `backHome`),
naar het patroon van bestaande namespaces zoals `collectionsPage`.

`data-testid="under-construction"` op de root voor tests.

### Tests

- `tests/components/UnderConstruction.test.tsx`: rendert het component met
  de nl-messages, controleert dat kop, subtekst en de terug-naar-home-link
  aanwezig zijn.
- Voor elk van de zes gated pagina's een test
  (`tests/app/<route>-page.test.tsx`, naar het patroon van het bestaande
  `tests/app/locale-page.test.tsx`) die rendert met de huidige (`false`)
  waarde uit `pageAvailability` en controleert dat
  `data-testid="under-construction"` aanwezig is — dus dat de guard
  daadwerkelijk werkt en de oorspronkelijke pagina-content niet rendert.
  Pagina's die Firestore-afhankelijke componenten importeren (bv. Collecties
  → `ProductsGrid`, Contact → `ContactInfo`) krijgen dezelfde
  `vi.mock('@/lib/firebase', ...)`-opzet als `locale-page.test.tsx`, zodat de
  test niet op een echte Firebase-call wacht — al zou dat door de vroege
  return sowieso niet moeten gebeuren.

## Buiten scope

- Geen wijziging aan bestaande pagina-logica, styling of tests van de zes
  gated pagina's zelf.
- Geen runtime env-var toggle: de vlaggen zijn build-time constants, passend
  bij de bestaande static-export deploy-flow.
- Geen wijziging aan Home of NavBar.
