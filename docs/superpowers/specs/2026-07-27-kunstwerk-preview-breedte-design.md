# Kunstwerk-preview: breedte en echte 2-koloms opmaak

**Datum:** 2026-07-27
**Status:** Geïmplementeerd

## Aanleiding

`KunstwerkenSection` (het bewerkscherm in `/beheer`) toont sinds kort een live,
alleen-lezen `ProductModal`-voorbeeld in een vaste `320px` zijbalk-kolom naast het
bewerkformulier. Die kolom bleek de viewport-breedte-gebaseerde `sm:grid-cols-2` van
`ProductModal` te erven, waardoor de foto en de details alsnog in twee ~160px-kolommetjes
werden geperst zodra de browser breed genoeg was — ongeacht de werkelijke 320px die de
kolom had. Labels liepen vast (`overflow-hidden`) en de foto kromp tot een piepklein,
ingelijst plaatje. Die bug is al gefixt door de preview altijd 1 kolom te laten blijven
(foto boven, details eronder), ongeacht viewport-breedte.

Met die brandende bug uit de weg blijft er een tweede, minder dringende wens over: de
preview oogt daardoor structureel anders dan de echte klant-dialoog (die foto en details
wél naast elkaar toont). Dit ontwerp brengt die echte 2-koloms opmaak terug in de preview,
op een manier die niet opnieuw in dezelfde val trapt.

## Scope

**In scope:**
- Bredere preview-kolom in `KunstwerkenSection.tsx`, alleen op ruime schermen
- `Modal.tsx`'s `wide`-variant iets breder, zodat het formulier evenveel ruimte
  overhoudt als nu
- `ProductModal.tsx`: de `preview`-variant krijgt een échte 2-koloms opmaak terug, maar
  gestuurd door de werkelijke breedte van de kolom (CSS container query) in plaats van de
  browser-viewport
- Nieuwe component-classes in `globals.css` voor de container query
- Testupdates in `ProductModal.test.tsx` en `KunstwerkenSection.test.tsx`

**Buiten scope:**
- De `dialog`-variant (klant-dialoog) blijft ongewijzigd — die is al correct, want die
  staat gecentreerd in de volle viewport waar `sm:` wél klopt
- Geen wijzigingen aan het bewerkformulier zelf (veldindeling, validatie)
- Geen nieuwe `Modal`-prop/variant — `wide` heeft precies één aanroeper
  (`KunstwerkenSection`), dus de bestaande waarde wordt direct aangepast

## 1. Responsieve kolombreedte — `KunstwerkenSection.tsx`

De preview-kolom blijft `320px` op `lg:` (1024–1279px viewport) — exact het gedrag dat nu
al live staat en veilig is gebleken. Pas vanaf `min-[1432px]:` (viewport ≥1432px) groeit
hij naar `560px`:

```
grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] min-[1432px]:grid-cols-[minmax(0,1fr)_560px]
```

Reden voor de twee lagen in plaats van direct overal `560px`: bij een venster net boven de
`lg`-grens (bv. een half gesplitst browservenster op ~1050px) zou een vaste `560px`
zijbalk het formulier terugbrengen tot ~360px breed — merkbaar krapper dan vandaag
(~600px). Door pas bij `min-[1432px]:` te verbreden, blijft die tussenmaat ongemoeid en
profiteert alleen het gangbare "normaal browservenster op een gewoon scherm"-geval van de
bredere, realistischere preview.

`Modal.tsx`'s `wide`-variant gaat van `max-w-6xl` (1152px) naar `max-w-[1400px]`. Omdat de
modal ook `w-full` is en dus altijd begrensd blijft door de viewport, heeft dit geen effect
op smallere schermen (daar blijft-ie gewoon de viewport vullen zoals nu) — het opent alleen
extra ruimte op brede schermen, precies waar de bredere kolom die nodig heeft. De trigger
staat bewust op `min-[1432px]:` (1400px modal + 32px padding) in plaats van het eerder
overwogen `xl:` (1280px): pas vanaf 1432px heeft de modal zijn volle `1400px` bereikt, en
pas dan geldt de rekensom hieronder onvoorwaardelijk. Tussen 1280px en 1432px zou de modal
nog niet op zijn volle breedte zitten, waardoor een `560px`-kolom het formulier daar juist
smaller zou maken dan vandaag — precies het scenario dat deze breakpoint-keuze vermijdt.
Bij `560px` preview + 1400px modal houdt het formulier ~768px over, vrijwel gelijk aan de
~760px die het nu al heeft bij `320px` preview + 1152px modal.

## 2. Container-query-gestuurde 2-koloms opmaak — `ProductModal.tsx`

De `preview`-variant krijgt zijn 2-koloms omschakeling niet terug via
Tailwinds viewport-`sm:` (dat was precies de vorige bug), maar via een echte CSS
container query — die reageert op de werkelijke breedte van de kolom waarin het paneel
zit, ongeacht hoe breed de browser is.

- Alleen voor `variant === 'preview'` wordt het paneel gewrapt in een element met
  `container-type: inline-size` (nieuwe class `.pm-preview-frame` in `globals.css`).
- Binnen die container krijgt het paneel zelf de marker-class `pm-preview-panel` en de
  foto (`WatermarkedImage`) de marker-class `pm-preview-image`. Een `@container
  (min-width: 480px)` regel schakelt die twee dan om naar de naast-elkaar-opmaak.
- `480px` is bewust ruim onder de beoogde `560px` (comfortabele marge) en ruim boven de
  `320–460px`-zone die in de eerdere breedtevergelijking nog te krap oogde — zo blijft de
  preview op `lg:` (320px kolom) keurig 1-koloms, en springt hij pas op `min-[1432px]:`
  (560px kolom) om. Deze twee getallen zijn aan elkaar gekoppeld: de `480px`-drempel werkt
  alleen zolang hij onder de brede kolombreedte uit `KunstwerkenSection.tsx` blijft, dus een
  latere aanpassing van die kolombreedte moet deze drempel meenemen.
- Onder `lg:` (viewport <1024px) collapset het beheer-grid zelf naar `grid-cols-1`
  (ongewijzigd basisgedrag van `KunstwerkenSection.tsx`), waardoor het preview-frame daar
  ook bijna de volle modal-breedte kan innemen. De container query schakelt dan óók
  correct naar 2-koloms om zodra die breedte de `480px`-drempel haalt — dat is bewust
  gewenst gedrag (het spiegelt hoe de echte klant-dialoog zich op die breedte gedraagt),
  geen gat in de breakpoint-indeling hierboven.
- De `dialog`-variant verandert niet: die blijft de bestaande `sm:grid-cols-2` gebruiken,
  want die aanname (viewport-breedte ≈ paneelbreedte) klopt daar wél.

Effect: als de zijbalk-breedte ooit weer verandert (een volgende redesign, een ander
scherm-formaat), past de preview zich vanzelf correct aan — er is geen aanname meer over
"welke viewport-breedte hoort bij welke kolombreedte" die stiekem weer kan losraken.

## 3. Testen

- `ProductModal.test.tsx`: nieuwe test die bevestigt dat de `preview`-variant gewrapt is
  in het container-element (`pm-preview-frame`) en dat paneel/foto de
  `pm-preview-panel`/`pm-preview-image` marker-classes dragen; bestaande tests die
  bevestigen dat `sm:grid-cols-2` afwezig blijft op het paneel zelf (die valt niet meer
  weg, want de omschakeling gebeurt nu via de wrapper-classes, niet via een Tailwind
  breakpoint-utility op het paneel).
- `KunstwerkenSection.test.tsx`: nieuwe test die bevestigt dat de grid-wrapper de
  `min-[1432px]:grid-cols-[minmax(0,1fr)_560px]`-class draagt.
- Geen visuele regressietest mogelijk in dit project (geen Storybook/Chromatic) — de
  container query zelf is te simpel om in jsdom zinvol te testen (jsdom past geen echte
  CSS toe), dus de tests blijven beperkt tot "zijn de juiste classes aanwezig".
