# Kunstwerkcode — automatisch volgnummer per prefix

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 10-08-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).
>
> Dit is een aanvulling op [`2026-08-10-kunstwerk-code-design.md`](2026-08-10-kunstwerk-code-design.md), waarin diezelfde dag is vastgelegd dat de code een vrij tekstveld blijft zonder vormeis en zonder automatische generatie. Dit document verandert die beslissing niet — het voegt er een hulpmiddel aan toe.

Datum: 2026-08-10
Status: ontwerp, goedgekeurd voor implementatie

## Aanleiding

Kunstwerkcodes volgen in de praktijk vaak een patroon van prefix + oplopend nummer
(`Dan-02424`, `Duc-04038`; nieuwere voorbeelden `GLA-AFR-00007`, `GLA-JAC-00003`).
De beheerder typt dat volgnummer nu zelf uit, wat foutgevoelig is (verkeerd nummer
overtypen, per ongeluk een bestaand nummer hergebruiken zodra de dubbele-code-check
daarop slaat).

## Uitgangssituatie

- `code` is een gewoon vrij tekstveld in `src/components/beheer/KunstwerkenSection.tsx`
  (regel 793 e.v.), met client-side dubbele-code-check en de server-side `409
  code-bestaat-al` / `code-in-bestelling` als achterliggende waarborg — zie
  `2026-08-10-kunstwerk-code-design.md` voor het volledige ontwerp daarvan.
- De volledige `kunstwerken`-lijst is al client-side aanwezig in dit component (prop
  `kunstwerken`, gebruikt voor de bestaande dubbele-code-check); er is dus geen nieuwe
  API-call nodig om bestaande codes te doorzoeken.
- Niet elke bestaande code volgt het prefix-patroon (`Akoestische stof` heeft geen
  streepje). Dat blijft zo — dit ontwerp raakt die codes niet.

## Beslissingen

1. **Puur cliëntzijdig hulpmiddel, geen schema- of API-wijziging.** Geen nieuwe tabel
   voor prefixen (verworpen: een lookup-tabel zoals `segmenten` — de lijst met bekende
   prefixen is altijd een live afleiding uit bestaande kunstwerkcodes en hoeft dus nooit
   apart onderhouden te worden). Geen twee gekoppelde velden die pas bij opslaan worden
   samengevoegd (verworpen: prefix en volgnummer als aparte inputs — voegt een
   synchronisatieprobleem toe zonder dat het `code`-veld ergens minder vrij van wordt).
2. **Prefix-herkenning:** een bestaande code levert een (prefix, nummer)-paar op als
   alles ná het láátste streepje volledig numeriek is (`^\d+$`). `GLA-AFR-00007` →
   prefix `GLA-AFR`, nummer `7`. `Dan-02424` → prefix `Dan`, nummer `2424`.
   `Akoestische stof` (geen streepje) en een code met een niet-numerieke staart tellen
   niet mee — die blijven onopgemerkt vrije tekst, exact zoals nu.
3. **Volgnummer-voorstel:** het hoogste bestaande nummer bij dat prefix + 1, opgevuld
   met evenveel cijfers als het breedste bestaande nummer bij dat prefix (zodat de
   opmaak van een prefix niet verspringt zolang het aantal cijfers past; bij overloop
   groeit de breedte gewoon mee, bv. `999` → `1000`). Voor een prefix zonder enige
   bestaande numerieke treffer (nieuw prefix): vaste opvulling van 5 cijfers, startend
   op `00001` — gelijk aan de bestaande conventie.
4. **Alleen bij aanmaken van een nieuw kunstwerk** (`modalState?.mode === 'add'`). Bij
   bewerken van een bestaand, niet-besteld kunstwerk blijft het codeveld exact zoals nu:
   vrije tekst, geen hulpmiddel. Zo blijft bewerken van een niet-patroonvolgende code
   (`Akoestische stof`) ongemoeid, en is er geen vraag te beantwoorden over wat er met
   een reeds gekozen code gebeurt als iemand achteraf een prefix aanpast.
5. **Interactie:** een invoerveld met `<datalist>` boven het codeveld, alleen zichtbaar
   in add-mode — vrij te typen (nieuw prefix) of te kiezen uit de afgeleide lijst met
   bekende prefixen. Bij wijzigen van dat veld wordt het codeveld direct gevuld met het
   voorstel. Geen aparte "voorstel"-knop: één interactie is genoeg, en het codeveld
   blijft daarna gewoon vrij overschrijfbaar — een expliciete knop zou alleen een extra
   klik toevoegen zonder iets aan controle te winnen.
6. **Alle bestaande waarborgen blijven ongewijzigd:** de client-side dubbele-code-check,
   de `UNIQUE`-index, de `409 code-bestaat-al`-afhandeling bij een race tussen twee
   gelijktijdige aanmaken. Het voorstel is een suggestie, geen garantie — dezelfde
   afweging die `2026-08-10-kunstwerk-code-design.md` al maakt voor de code in het
   algemeen.

## B. Implementatie (`KunstwerkenSection.tsx`)

- Nieuwe pure functie (apart te testen, geen React-afhankelijkheid), bijvoorbeeld
  `stelVolgendeCodeVoor(kunstwerken: Kunstwerk[], prefix: string): string`:
  - Filtert `kunstwerken` op codes die op het laatste streepje splitsen in
    `(gevondenPrefix, staart)` met `gevondenPrefix` gelijk aan `prefix`
    (hoofdletterongevoelig, zoals de bestaande dubbele-code-vergelijking) en `staart`
    matchend op `^\d+$`.
  - Geen treffers → `` `${prefix}-00001` ``.
  - Wel treffers → hoogste numerieke waarde + 1, opgevuld tot de breedte van de
    breedste bestaande staart (`String(volgende).padStart(breedte, '0')`).
- Nieuwe afgeleide waarde (`useMemo` op `kunstwerken`) met de lijst unieke, herkende
  prefixen voor de `<datalist>`-opties.
- Nieuwe lokale state `prefix`, alleen relevant/getoond wanneer `modalState?.mode ===
  'add'`; leeg bij het openen van de add-modal, samen met de rest van `LEGE_FORM`.
- JSX: prefixveld met `<datalist>` boven het bestaande codeveld (regel 793), alleen in
  add-mode gerenderd. `onChange` roept `stelVolgendeCodeVoor` aan en doet `setCode(...)`.
- Geen wijziging aan `LEGE_FORM.code`, de submit-payload, de bestaande validatie, of de
  vast-bij-bestelling-/dubbele-code-logica — dat gedrag verandert niet.

## C. Vertalingen

Beheer-only scherm, dus alleen `messages/nl.json` (zelfde afspraak als de rest van het
beheerscherm — geen `en`/`de`/`fr` voor beheer-only strings):

- nieuw: label voor het prefixveld, bijvoorbeeld `kunstwerkenLabelPrefix` — "Prefix
  (voorstel volgnummer)".

## D. Tests

- `stelVolgendeCodeVoor` (of gelijkwaardige pure functie): bestaand prefix met één
  numerieke treffer, meerdere treffers (hoogste + 1), wisselende breedte (padding volgt
  de breedste), niet-numerieke staart (genegeerd), code zonder streepje (genegeerd),
  hoofdletterongevoelige prefix-match, gloednieuw prefix (`00001`).
- `KunstwerkenSection.test.tsx`: prefixveld verschijnt alleen in add-mode en niet in
  edit-mode; kiezen/typen van een prefix vult het codeveld met het voorstel; codeveld
  blijft daarna vrij te overschrijven; opslaan gebruikt de uiteindelijke inhoud van het
  codeveld, niet het prefixveld.

## Uitrol

Geen migratie, geen API-wijziging — puur een front-end wijziging. Bouwen, testen,
deployen naar staging, en op staging handmatig controleren: een gloednieuw prefix
(start op `00001`), een bestaand prefix (volgnummer klopt en telt op), bewerken van een
bestaand kunstwerk toont geen prefixveld. Daarna promoten naar productie zoals
gebruikelijk.

## Wat dit ontwerp bewust niet doet

- Geen eigen opslag/lookup-tabel voor prefixen — de lijst is een live afleiding uit
  bestaande kunstwerkcodes.
- Geen vormeis op de uiteindelijke code — het voorstel blijft overschrijfbare vrije
  tekst, dezelfde beslissing als in `2026-08-10-kunstwerk-code-design.md`.
- Geen hulpmiddel bij bewerken van bestaande kunstwerken.
- Geen atomische per-prefix teller — het bestaande `code-bestaat-al`-vangnet via de
  `UNIQUE`-index volstaat voor de zeldzame race tussen twee gelijktijdige aanmaken.
