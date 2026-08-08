# Design: Kunstwerken — publieke koppeling (Deel 2)

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 21-07-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

## Context

[Deel 1](2026-07-21-segmenten-kunstwerken-beheer-design.md) leverde een volledig CRUD-beheer op voor Segmenten en Kunstwerken (foto-upload, segment/materiaal/maat-selectie, prijsrooster, meertalige beschrijvingen), maar raakte de publieke site bewust niet aan. Ondertussen is, in een parallel deelproject, een echte checkout-flow gemerged: `CartPanel` schrijft nu al naar Firestore-collecties `bestelheaders`/`bestellines`, maar de bestelregel-velden `kunstwerkId`/`maatId`/`materiaalId` staan hardcoded op `null` — puur scaffolding, met een Firestore-rule die op dit moment zelfs expliciet *alleen* `null` toestaat voor die velden bij het aanmaken.

Dit deelproject rondt die koppeling af: de publieke collectiepagina, de "uitgelichte werken" op de homepage, het winkelmandje en de checkout-schrijfactie gaan de échte `kunstwerken`/`materialen`/`maten`/`segmenten`-data uit Firestore gebruiken (inclusief een watermerk op elke publiek getoonde foto), en het admin bestel-detailscherm toont voortaan de opgeloste kunstwerk-informatie in plaats van een ruw id.

## Architecturale randvoorwaarden

- **Geen backend**: nog steeds een volledig statische export, geen API-routes, geen Cloud Functions. De nieuwe Firestore-rule voor bestellijnen doet basis-typecontrole (strings niet leeg, `prijs`/`quantity` positieve getallen) maar **geen** cross-collectie-validatie (geen `get()`-aanroepen om te checken of kunstwerk/materiaal/maat/prijs daadwerkelijk bij elkaar horen) — bewust gekozen, consistent met hoe dit project al werkt (vertrouwen op de client, geen server-side validatielaag).
- **Prijs is een snapshot**: de prijs wordt één keer bepaald (uit het kunstwerk se prijzentabel) op het moment dat iets aan het mandje wordt toegevoegd, en die snapshot-waarde reist ongewijzigd mee naar de bestelregel. Een latere prijswijziging in beheer heeft geen invloed op al geplaatste bestellingen.
- **Watermerk is een losse overlay-component**, geen bewerking van de opgeslagen foto (zoals al vastgelegd in Deel 1) — `© Glassart & Design`, diagonaal herhaald, semi-transparant, non-interactief. Zichtbaar op elke klant-gerichte weergave (collectiegrid, bestelvenster, uitgelichte werken, winkelmandje); **niet** in beheer, waar de admin de schone brondata beheert.
- **`src/data/segments.ts`** (de hardcoded Unsplash-segmentenlijst) komt te vervallen voor de collectiepagina — de `segmenten`-Firestore-collectie is de enige bron. `src/data/sizes.ts`'s `STANDARD_SIZES` komt eveneens te vervallen — maten komen uit de `maten`-collectie.

## Datamodel

**`CartItem`** (`src/lib/useCart.tsx`), vervangt de huidige segment/foto/maat-string-vorm:
```ts
interface CartItem {
  id: string;              // `${kunstwerkId}__${materiaalId}__${maatId}` — dedupe-sleutel, zelfde patroon als nu
  kunstwerkId: string;
  foto: string;
  omschrijving: string;    // opgeloste NL/FR/DE/EN-tekst (met NL-fallback) op moment van toevoegen
  materiaalId: string;
  materiaalLabel: string;  // bv. "4mm — Onze specialiteit. Kristalhelder, sterk en veilig."
  maatId: string;
  maatLabel: string;       // bv. "40×60 cm"
  prijs: number;           // snapshot, niet herberekend
  quantity: number;
}
```
Blijft, zoals nu, in `localStorage` — geen Firestore-koppeling voor het mandje zelf. Alle weergavevelden (foto, labels, omschrijving) worden gedenormaliseerd opgeslagen zodat `CartPanel` niet opnieuw hoeft te fetchen om het mandje te tonen, zelfde aanpak als de huidige `imageSrc`/`segmentMessageKey`-velden.

**`bestellijn`** (Firestore, `bestelheaders/{id}/bestellines/{id}`), uitgebreid vanaf de huidige altijd-`null`-velden:
```ts
{
  kunstwerkId: string;  // was altijd null
  maatId: string;       // was altijd null
  materiaalId: string;  // was altijd null
  prijs: number;        // nieuw veld — snapshot uit het mandje, niet herberekend
  quantity: number;
}
```

**`firestore.rules`** — de `bestellines`-create-rule (regel ~30-38) verliest de `== null`-checks en krijgt in plaats daarvan:
```
request.resource.data.keys().hasOnly(['kunstwerkId', 'maatId', 'materiaalId', 'prijs', 'quantity']) &&
request.resource.data.kunstwerkId is string && request.resource.data.kunstwerkId.size() > 0 &&
request.resource.data.maatId is string && request.resource.data.maatId.size() > 0 &&
request.resource.data.materiaalId is string && request.resource.data.materiaalId.size() > 0 &&
request.resource.data.prijs is number && request.resource.data.prijs > 0 &&
request.resource.data.quantity is int && request.resource.data.quantity > 0
```

## Publieke weergave

- **Data ophalen**: de collectiepagina en homepage halen client-side 4 collecties op via de bestaande `useFirestoreCollection`-hook: `segmenten`, `kunstwerken`, `materialen`, `maten` (alleen lezen, geen seed-opties nodig — die staan al goed via beheer).
- **`WatermarkedImage`** (nieuwe, herbruikbare component): `<img>` met een CSS-overlay (`© Glassart & Design`, diagonaal, semi-transparant, `pointer-events: none`). Gebruikt in `ProductsGrid`, `ProductModal`, `FeaturedWorks` en `CartPanel`.
- **`ProductsGrid`**: filterknoppen komen uit de `segmenten`-collectie (niet meer next-intl `segments.*`-vertalingen); een kunstwerk met meerdere `segmentIds` verschijnt onder elk gekoppeld filter. Kaarten tonen de gewatermerkte foto + de opgeloste omschrijving (huidige locale, NL-fallback bij leeg veld).
- **`ProductModal`**: twee keuzelijsten — materiaal (uit `materiaalIds`, labels zoals in beheer) en maat (uit `maatIds`, `breedte×hoogte cm`). Zodra beide gekozen zijn, wordt de bijbehorende prijs uit de `prijzen`-tabel van het kunstwerk opgezocht en getoond. "Toevoegen aan mandje" blijft uitgeschakeld totdat materiaal + maat (en dus een prijs) gekozen zijn.
- **`FeaturedWorks`** (homepage): kiest bij elke render 3 willekeurige kunstwerken uit de opgehaalde lijst; toont gewatermerkte foto + opgeloste omschrijving. Vervangt de huidige lege placeholder-blokken volledig.

## Checkout & winkelmandje

- **`CartPanel`**: toont per regel de gewatermerkte foto, omschrijving, materiaal- en maatlabel, `prijs × quantity`, en een nieuw totaalbedrag onderaan het mandje (bestond nog niet). Bij "Bestelling afronden" wordt het `prijs`-veld direct uit het mandje-item overgenomen naar de bestelregel — geen herberekening.
- **`useCart`**: `addItem` accepteert voortaan de volledige nieuwe `CartItem`-vorm; dedupe/samenvoegen (quantity optellen) blijft op basis van dezelfde samengestelde `id`.

## Admin: bestel-detailscherm

- **`BestellingModal`**: `BeheerShell` geeft de al-opgehaalde `kunstwerken`/`materialen`/`maten`-data door (wordt al opgehaald voor het `KunstwerkenSection`-CRUD-tabblad — geen nieuwe fetch nodig). Per bestelregel wordt, in plaats van het ruwe `kunstwerkId`, de gewatermerkte foto + omschrijving + materiaal- en maatlabel + prijs getoond, zelfde weergave-stijl als in het mandje.
- **Edge case — ontbrekend kunstwerk**: als een `kunstwerkId` niet (meer) in de opgehaalde `kunstwerken`-lijst voorkomt (bv. verwijderd na bestelling), valt de regel terug op het ruwe id + de bestaande `bestellingenRegelOnbekend`-labeltekst, zoals nu.

## Niet in scope

- "Bestel opnieuw" op basis van de bestaande (mock) bestelhistorie — ongewijzigd, raakt dit deelproject niet.
- Wijzigen van materiaal/maat/prijs/aantal op een reeds geplaatste bestelling.
- Server-side prijsvalidatie (Cloud Function) of enige andere backend-toevoeging — bewust afgewezen.
- Een "uitgelicht"-markering voor kunstwerken (homepage kiest willekeurig, geen datamodel-uitbreiding).

## Risico's / aandachtspunten

- **Geen cross-collectie-validatie in de Firestore-rule** betekent dat een technisch onderlegde bezoeker een bestelregel met een niet-bestaand `kunstwerkId` of een verzonnen `prijs` zou kunnen indienen. Geaccepteerd risico, consistent met de bestaande, backend-loze aanpak van dit project; bij misbruik zichtbaar in het admin-overzicht (onbekend kunstwerk-fallback) en op dat moment handmatig af te wijzen.
- **Testdekking wijzigt fundamenteel, niet incrementeel**: alle bestaande tests voor `ProductsGrid`, `ProductModal`, `FeaturedWorks`, `CartPanel`, `useCart` gaan uit van de huidige hardcoded Unsplash/segment-structuur en het altijd-`null` bestellijn-schrijfpatroon — deze moeten herschreven worden, niet uitgebreid.
- **4 collecties client-side opgehaald op de collectiepagina** (segmenten, kunstwerken, materialen, maten) — voor de huidige schaal (tientallen kunstwerken) geen probleem; bij sterke groei van de collectie zou paginering relevant worden (niet nu gebouwd, YAGNI).
