# Meertalige catalogustabellen: segmenten, stijlen, onderwerpen, materiaalsoorten, materialen

**Datum:** 2026-08-10
**Status:** Voorgesteld

## Probleem

`segmenten`, `stijlen`, `onderwerpen`, `materiaalsoorten` en `materialen` hebben elk één kolom
`omschrijving` (Nederlands). Deze waarden worden rechtstreeks getoond aan de webshopklant
(collectiefilters, productkaarten, productdetail, accountoverzicht) ongeacht de gekozen taal
(`nl`/`en`/`de`/`fr`) — een Duitse of Franse bezoeker ziet dus altijd de Nederlandse tekst.
`kunstenaars` en `kunstwerken` hebben dit probleem al niet: die tabellen hebben al vier kolommen
(`omschrijvingNl/Fr/De/En`) met een resolve-helper die op locale de juiste kiest en terugvalt op
Nederlands. Deze 5 tabellen volgen dat patroon niet.

## Doel

De 5 tabellen krijgen hetzelfde vier-kolommenpatroon, de publieke site kiest de juiste taal per
bezoeker, en de bestaande Nederlandse catalogusinhoud wordt in dezelfde migratie voorzien van
Frans/Duits/Engels.

## 1. Datamodel en migratie

Voor elke tabel: `omschrijving VARCHAR(255) NOT NULL` → `omschrijvingNl VARCHAR(255) NOT NULL`
(hernoemd via `CHANGE`, bestaande waarden blijven staan) plus drie nieuwe nullable kolommen
`omschrijvingFr/De/En VARCHAR(255)`. Geen `TEXT` zoals bij `kunstenaars`/`kunstwerken` — dit zijn
korte catalogustermen, geen lopende tekst, dus `VARCHAR(255)` blijft passend.

Eén migratiebestand `db/migrations/2026-08-10-catalogus-lookup-tabellen-meertalig.sql` doet dit
voor alle 5 tabellen en vult daarna Fr/De/En in via `UPDATE ... WHERE omschrijvingNl = '...'`
(zelfde aanpak als de klantnummer-backfill in `2026-08-08-klantnummer.sql`). Matchen op de
Nederlandse tekst in plaats van op `id`, omdat catalogusrijen per omgeving apart zijn aangemaakt
en staging/productie geen gedeelde `id`'s hoeven te hebben. Rijen die niet exact matchen (andere
spelling, of rijen die alleen in productie bestaan) blijven met lege Fr/De/En achter en vallen op
de site terug op Nederlands totdat iemand ze bijwerkt in het beheerscherm — geen regressie t.o.v.
de huidige situatie waarin alles toch al Nederlands toont.

**Uitrolvolgorde:** zoals bij `2026-08-10-kunstwerk-code.sql` moet deze migratie draaien vóórdat de
bijbehorende applicatiecode wordt gedeployd. Tussen migratie en deploy leest de dan nog draaiende
oude code `omschrijving`, wat na de `CHANGE` een `ER_BAD_FIELD_ERROR` geeft op deze 5 tabellen —
een kort, geaccepteerd venster, net als bij de kunstwerkcode-migratie.

### Vertalingen die de migratie invult

**segmenten**

| NL | FR | DE | EN |
|---|---|---|---|
| Abstract | Abstrait | Abstrakt | Abstract |
| Artist Collections | Collections d'artistes | Künstlerkollektionen | Artist Collections |
| Hotel | Hôtel | Hotel | Hotel |
| Office | Bureau | Büro | Office |
| Restaurant | Restaurant | Restaurant | Restaurant |
| Wellness | Bien-être | Wellness | Wellness |

**stijlen**

| NL | FR | DE | EN |
|---|---|---|---|
| Abstract Expressionisme | Expressionnisme abstrait | Abstrakter Expressionismus | Abstract Expressionism |
| Aquarel | Aquarelle | Aquarell | Watercolor |
| Digitale Kunst | Art numérique | Digitale Kunst | Digital Art |
| Fotorealistisch | Photoréaliste | Fotorealistisch | Photorealistic |
| Impressionistisch | Impressionniste | Impressionistisch | Impressionist |
| Line Art | Line Art | Line Art | Line Art |
| Minimalistisch | Minimaliste | Minimalistisch | Minimalist |
| Mixed Media Collage | Collage Mixed Media | Mixed-Media-Collage | Mixed Media Collage |
| Pop Art | Pop Art | Pop Art | Pop Art |
| Skyline | Skyline | Skyline | Skyline |
| Surrealistisch | Surréaliste | Surrealistisch | Surrealist |
| Zwart-wit | Noir et blanc | Schwarz-Weiß | Black & White |

**onderwerpen**

| NL | FR | DE | EN |
|---|---|---|---|
| Architectuur | Architecture | Architektur | Architecture |
| Bergen | Montagnes | Berge | Mountains |
| Bloemen & Planten | Fleurs & Plantes | Blumen & Pflanzen | Flowers & Plants |
| Bos & Natuur | Forêt & Nature | Wald & Natur | Forest & Nature |
| Dieren | Animaux | Tiere | Animals |
| Dromerig Landschap | Paysage onirique | Traumhafte Landschaft | Dreamy Landscape |
| Geometrische Vormen | Formes géométriques | Geometrische Formen | Geometric Shapes |
| Landschap | Paysage | Landschaft | Landscape |
| Portret | Portrait | Porträt | Portrait |
| Ruimte & Kosmos | Espace & Cosmos | Raum & Kosmos | Space & Cosmos |
| Spiritualiteit & Zen | Spiritualité & Zen | Spiritualität & Zen | Spirituality & Zen |
| Stadsgezicht | Paysage urbain | Stadtansicht | Cityscape |
| Vormen & Kleuren | Formes & Couleurs | Formen & Farben | Shapes & Colors |
| Zee & Strand | Mer & Plage | Meer & Strand | Sea & Beach |

**materiaalsoorten**

| NL | FR | DE | EN |
|---|---|---|---|
| Acryl | Acrylique | Acryl | Acrylic |
| Dibond | Dibond | Dibond | Dibond |
| Veiligheidsglas | Verre de sécurité | Sicherheitsglas | Safety Glass |

**materialen**

| NL | FR | DE | EN |
|---|---|---|---|
| Licht en helder met een luxe glanzende look. | Léger et clair, avec un aspect brillant et luxueux. | Leicht und klar mit einem edlen, glänzenden Look. | Light and clear with a luxurious glossy look. |
| Extra diepte en stevigheid voor een indrukwekkend effect. | Plus de profondeur et de robustesse pour un effet impressionnant. | Mehr Tiefe und Stabilität für einen beeindruckenden Effekt. | Extra depth and sturdiness for an impressive effect. |
| Maximale diepwerking voor exclusieve presentatie. | Effet de profondeur maximal pour une présentation exclusive. | Maximale Tiefenwirkung für eine exklusive Präsentation. | Maximum depth effect for an exclusive presentation. |
| Lichtgewicht, stijf en vormvast met een matte uitstraling. | Léger, rigide et indéformable, avec une finition mate. | Leicht, steif und formstabil mit einer matten Optik. | Lightweight, rigid and dimensionally stable with a matte finish. |
| Onze specialiteit. Kristalhelder, sterk en veilig. | Notre spécialité. Cristallin, résistant et sécurisé. | Unsere Spezialität. Kristallklar, stark und sicher. | Our specialty. Crystal clear, strong and safe. |

Deze tabel dekt exact de 40 rijen die vandaag op staging staan. Productie kan afwijkende of extra
rijen hebben; die vallen terug op Nederlands totdat ze handmatig aangevuld worden.

## 2. Backend

`src/lib/server/tableColumns.ts`: de 5 tabellen krijgen de 4 kolomnamen in plaats van 1.
`src/lib/server/lookupResources.ts` blijft ongewijzigd — de generieke `[resource]`-CRUD-route
werkt al kolomonafhankelijk via de `TABLE_COLUMNS`-allowlist.

## 3. Eén gedeelde resolve-helper

Nieuw: `src/lib/resolveOmschrijving.ts`

```ts
export interface MeertaligeOmschrijving {
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;
}

export function resolveOmschrijving(item: MeertaligeOmschrijving, locale: string): string {
  const byLocale: Record<string, string> = {
    fr: item.omschrijvingFr,
    de: item.omschrijvingDe,
    en: item.omschrijvingEn,
  };
  return byLocale[locale] || item.omschrijvingNl;
}
```

`resolveKunstenaarOmschrijving` en `resolveKunstwerkOmschrijving` worden dunne wrappers die hierop
delegeren (bestaande call sites blijven ongewijzigd). De 5 nieuwe entiteiten gebruiken
`resolveOmschrijving` rechtstreeks — geen nieuwe per-entiteit wrapper-bestanden.

## 4. Types

In `src/components/beheer/materiaalTypes.ts` wordt `omschrijving: string` op `Segment`, `Stijl`,
`Onderwerp`, `Materiaalsoort` en `Materiaal` vervangen door de 4 velden, zelfde vorm als op
`Kunstwerk`.

## 5. Beheerscherm

- `LookupSection.tsx` (gedeeld door segmenten/stijlen/onderwerpen): 4 tekstvelden i.p.v. 1 —
  Nl verplicht (`RequiredMark`), Fr/De/En optioneel — zelfde opmaak als de omschrijvingsvelden in
  `KunstenaarsSection.tsx`. De tabelkolom en de "in gebruik door N kunstwerken"-tekst tonen
  `omschrijvingNl`.
- `MateriaalsoortenSection.tsx` en `MaterialenSection.tsx` krijgen dezelfde 4 velden naast hun
  bestaande specifieke velden (eigen-maat-instellingen resp. materiaalsoort/dikte).
- `KunstwerkenSection.tsx`: alle matching/aanmaak/weergave van segment-, stijl-, onderwerp- en
  materiaalsoort-namen (zoeken op getypte naam, inline nieuw-aanmaken, labels in de multi-selects)
  schakelt over op `.omschrijvingNl` — dit scherm blijft Nederlands, net als de rest van beheer.
- Nieuwe label-sleutels (`segmentenLabelOmschrijvingNl/Fr/De/En` enz., naar het patroon van
  `kunstenaarsLabelOmschrijvingNl` in `messages/nl.json`) komen **alleen** in `messages/nl.json` —
  de `beheer`-namespace bestaat uitsluitend daar; `en/de/fr.json` hebben geen `beheer`-sectie,
  bevestigd door het ontbreken ervan in `en.json`.

## 6. Publieke website

Locale-afhankelijke weergave via `resolveOmschrijving(item, locale)`:

- `ProductsGrid.tsx`, `FiltersPanelContent.tsx`, `ProductModal.tsx`: segment-, stijl- en
  onderwerplabels in filters, actieve-filterchips en productdetail.
- `resolveKunstwerkMateriaalLabel` (`src/lib/kunstwerkMateriaal.ts`) en de `materiaalLabel`-functies
  in `ProductModal.tsx` en `AccountOrderModal.tsx`: materiaalsoort- en materiaalomschrijving in
  productdetail en accountbestelgeschiedenis.
- De "Veiligheidsglas"-herkenning in `kunstwerkMateriaal.ts` (`VEILIGHEIDSGLAS_SOORT_NAAM`) blijft
  matchen op `omschrijvingNl` — dat is interne identificatie van een specifiek materiaal, geen
  weergave, en de admin voert deze naam altijd in het Nederlands in.

## 7. Interne/drukker-schermen

`BestellingModal.tsx`, `PrijsmatrixSection.tsx`, `VersturenNaarDrukkerDialog.tsx` en
`buildDrukkerMail.ts` zijn personeels- resp. drukker-gerichte schermen/mails, altijd Nederlands.
Deze schakelen simpelweg over op `.omschrijvingNl`, zonder locale-resolutie.

## 8. Tests

- Bestaande tests die `.omschrijving` gebruiken voor deze 5 entiteiten worden bijgewerkt naar de
  4 velden: `SegmentenSection`, `StijlenSection`, `OnderwerpenSection`, `MateriaalsoortenSection`,
  `MaterialenSection`, `lookup-resources.test.ts`, `materiaalTypes.test.ts`.
- Nieuwe test voor `resolveOmschrijving` (locale-keuze, terugval op Nl bij lege/ontbrekende
  vertaling), naast de bestaande `resolveKunstenaarOmschrijving.test.ts` die na de refactor moet
  blijven slagen.

## 9. Uitrol

Standaardtraject uit `CLAUDE.md`: migratie + code eerst naar staging, daar verifiëren, en pas na
expliciete toestemming van Joris naar productie. `db/schema.sql` wordt in dezelfde wijziging
bijgewerkt zodat het de nieuwe kolommen documenteert.

## Buiten scope

- `activiteitenlog.omschrijving` (vrije-tekst logregel) en de `omschrijving` op een winkelmandregel
  in `CartPanel.tsx` zijn losstaande velden, geen catalogus-lookup — niet aangeraakt.
- Geen nieuwe catalogusrijen, geen wijziging van de bestaande Nederlandse teksten zelf.
