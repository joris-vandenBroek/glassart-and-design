# Factuurgegevens voor buitenlandse klanten

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 06-08-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

Datum: 2026-08-06

## Aanleiding

Buitenlandse klanten kunnen een factuur van Glassart & Design nu niet zonder navragen betalen, en een factuur aan een zakelijke EU-klant mist de gegevens die nodig zijn om de btw te verleggen.

Twee concrete gaten:

1. **Bankgegevens.** In beheer → Glassart & Design staat alleen `iban`. Buiten SEPA (VS, Canada, Azië, Midden-Oosten) is een IBAN alleen niet genoeg — daar is een BIC/SWIFT verplicht, en de begunstigde moet exact op naam kloppen. Ook binnen SEPA weigeren veel buitenlandse boekhoudpakketten een betaling zonder BIC.
2. **Btw-nummer van de klant.** De tabel `klanten` heeft `kvk` maar geen btw-nummer. Zonder dat nummer kun je bij een zakelijke EU-klant niet verleggen ("btw verlegd / intracommunautaire levering"), en draait Glassart & Design zelf voor de btw op.

## Scope

- Twee nieuwe velden in de bedrijfsgegevens: tenaamstelling en BIC.
- Eén nieuwe kolom op `klanten`: `btwNummer`, met formaatvalidatie per EU-land.
- Een `EU_LANDCODES`-set in `src/data/landen.ts`.

## Niet in scope

- **De btw-berekening op bestellingen verandert niet.** Verleggen/reverse charge stond bewust buiten scope in `2026-08-04-btw-per-land-design.md` en blijft dat. Deze spec legt alleen het nummer vast — dat is de voorwaarde die verleggen later mogelijk maakt, en levert nu al de gegevens op die met de hand op een buitenlandse factuur moeten.
- **Geen VIES-koppeling.** Geen live controle bij de EU-dienst of een nummer bestaat en actief is. Dat vraagt een nieuw server-side endpoint en VIES is regelmatig traag of offline; alleen formaatvalidatie.
- **Geen blokkade bij klantgoedkeuring.** Het bestaande openstaande idee "blokkeer goedkeuring als het land geen btw-tarief heeft" blijft ongemoeid.
- **Geen facturenmodule.** Facturen staan bewust on hold in de B2B-roadmap.

## A. Bedrijfsgegevens — tenaamstelling en BIC

`Bedrijfsgegevens` in `src/components/beheer/bedrijfsgegevensTypes.ts` krijgt twee velden:

```ts
tenaamstelling: string;
bic: string;
```

`src/data/bedrijfsgegevensSeed.ts` krijgt bijpassende seedwaarden in dezelfde placeholder-stijl als het bestaande `iban` (`'NL00 BANK 0123 4567 89'`): een `tenaamstelling` met de bedrijfsnaam en een herkenbaar nep-BIC.

In `src/components/beheer/GlassartDesignSection.tsx` komen twee gewone tekstinputs rond het bestaande IBAN-veld, in factuurvolgorde:

1. tenaamstelling
2. IBAN (bestaand)
3. BIC

Zelfde `INPUT_CLASS`/`LABEL_CLASS` en `updateField`-patroon als de omliggende velden, met `data-testid="glassart-design-tenaamstelling"` en `data-testid="glassart-design-bic"`.

**Geen validatie op de BIC.** Een BIC is 8 of 11 tekens, maar wordt in de praktijk met spaties ingevoerd; een strikte check levert hier meer irritatie op dan waarde. Het veld wordt één keer door een medewerker ingevuld en daarna niet meer.

**Deze velden zijn intern.** De publieke contactpagina (`ContactInfo.tsx`) toont ze niet — bankgegevens horen op een factuur, niet op een website. Alleen `GlassartDesignSection` leest en schrijft ze.

Opslaan verloopt via het bestaande `onSave` en valt daarmee automatisch onder de bestaande `bedrijfsgegevens_gewijzigd`-activiteitenlogregel. Geen nieuw logevent.

## B. Klant-btw-nummer — datamodel

`db/schema.sql`, tabel `klanten`, direct na `kvk`:

```sql
btwNummer VARCHAR(20),
```

Nullable: bestaande klanten hebben geen waarde, en niet-EU-klanten hebben geen btw-nummer. 20 tekens is ruim genoeg — het langste EU-formaat is 14 (`SE` + 12 cijfers).

Toegevoegd aan `SELF_EDITABLE_KLANT_FIELDS` in `src/lib/server/klantFields.ts`, zodat registratie (`POST /api/auth/register`) en profielbewerking (`PATCH /api/klanten/me`) het meenemen. Het is een gegeven over de klant zelf, geen staf-beslissing zoals `status` of `prijsgroepId`, dus het hoort in die lijst.

Deze wijziging raakt ook de productiedatabase. Die migratie (`ALTER TABLE klanten ADD COLUMN btwNummer VARCHAR(20) AFTER kvk;`) wordt pas uitgevoerd na expliciete toestemming, en moet vóór de deploy van deze code naar productie draaien, nooit erna. `insertRow` bouwt zijn kolomlijst uit de keys van het object, en `POST /api/auth/register` zet `fields.btwNummer` altijd (op `null` of een waarde) — draait de nieuwe code tegen een productiedatabase die de kolom nog niet heeft, dan faalt elke registratie én elke klant-profielwijziging met "Unknown column 'btwNummer'". Een nullable kolom toevoegen is voor de nu draaiende (oude) productiecode zelf onschadelijk, dus er is geen reden om de migratie uit te stellen tot na de deploy: staging eerst, dan de migratie op productie, dan pas de productie-deploy.

## C. Formaatvalidatie

Nieuwe module `src/lib/btwNummer.ts`, gebruikt door zowel client als server zodat de regels niet uit elkaar kunnen lopen.

```ts
export function normaliseerBtwNummer(waarde: string): string
export function isEuLand(landcode: string | null | undefined): boolean
export function isBtwNummerVerplicht(landcode: string | null | undefined): boolean
export function valideerBtwNummer(
  waarde: string | null | undefined,
  landcode: string | null | undefined
): 'ok' | 'leeg' | 'ongeldig'
```

`valideerBtwNummer` beslist zelf niet of een leeg nummer een fout is — dat hangt af van de plek (zie sectie D) en het land, dus die beslissing ligt bij de aanroeper. De functie meldt alleen `'leeg'`; `isBtwNummerVerplicht(landcode)` is de functie die vastlegt of leeg op die plek geoorloofd is of niet.

**Normalisatie.** Spaties, punten en streepjes eruit, alles naar hoofdletters, vóór het matchen. Dit gebeurt bij validatie én bij opslaan, zodat de opgeslagen waarde altijd genormaliseerd is.

**Twee valkuilen die expliciet worden afgehandeld:**

- Griekenland heeft ISO-landcode `GR`, maar de btw-prefix is `EL`. De lookup gaat op ISO-code, de regex verwacht `EL`.
- Een klant kan de landcode als prefix meetypen of weglaten. De regex eist de prefix; ontbreekt die, dan wordt hij vóór het matchen aangevuld met de (btw-)prefix van het gekozen land. `123456789B01` bij land NL is dus geldig.

**Regex per EU-land** (na normalisatie, prefix inbegrepen):

| Land | Patroon |
|---|---|
| AT | `ATU\d{8}` |
| BE | `BE[01]\d{9}` |
| BG | `BG\d{9,10}` |
| CY | `CY\d{8}[A-Z]` |
| CZ | `CZ\d{8,10}` |
| DE | `DE\d{9}` |
| DK | `DK\d{8}` |
| EE | `EE\d{9}` |
| ES | `ES[A-Z0-9]\d{7}[A-Z0-9]` |
| FI | `FI\d{8}` |
| FR | `FR[A-Z0-9]{2}\d{9}` |
| GR | `EL\d{9}` |
| HR | `HR\d{11}` |
| HU | `HU\d{8}` |
| IE | `IE(\d{7}[A-Z]{1,2}\|\d[A-Z0-9+*]\d{5}[A-Z])` |
| IT | `IT\d{11}` |
| LT | `LT(\d{9}\|\d{12})` |
| LU | `LU\d{8}` |
| LV | `LV\d{11}` |
| MT | `MT\d{8}` |
| NL | `NL\d{9}B\d{2}` |
| PL | `PL\d{10}` |
| PT | `PT\d{9}` |
| RO | `RO\d{2,10}` |
| SE | `SE\d{12}` |
| SI | `SI\d{8}` |
| SK | `SK\d{10}` |

`EU_LANDCODES` in `src/data/landen.ts` is precies de 27 ISO-codes uit die tabel. De set en de regex-map horen bij elkaar: elke code in `EU_LANDCODES` heeft een patroon en omgekeerd. Een test bewaakt dat.

**Niet-EU-landen:** leeg is toegestaan, ingevuld wordt altijd geaccepteerd (er is geen wereldwijd formaat om tegen te toetsen). Dat is bewust — een Zwitserse of Amerikaanse klant kan zijn lokale nummer kwijt zonder dat de app hem tegenhoudt.

## D. Waar geldt "verplicht"?

De verplichting geldt **alleen bij registratie**, niet bij bewerken. Dit is de belangrijkste ontwerpkeuze in deze spec en de reden is een migratieval: er staan al EU-klanten in de database zonder btw-nummer. Zou de regel ook bij bewerken gelden, dan kan een medewerker zo'n bestaande klant in `KlantModal` niet meer opslaan (ook niet om iets heel anders te wijzigen), en kan de klant zelf zijn accountpagina niet meer opslaan, tot iemand een nummer invult dat hij misschien niet paraat heeft.

| Plek | Verplicht bij EU-land ≠ NL | Formaatcheck |
|---|---|---|
| Registratie (`RegistrationForm` + `POST /api/auth/register`) | ja | ja |
| Beheer (`KlantModal` + `PATCH /api/klanten/[id]`) | nee | alleen als `btwNummer` of `land` onderdeel is van deze save |
| Accountpagina (`SettingsSection` + `PATCH /api/klanten/me`) | nee | ja, onvoorwaardelijk |

De regel kijkt naar `land` (het vestigingsland), niet naar `invoiceLand`. Het btw-nummer hoort bij waar de klant gevestigd is, niet bij waar de factuur heen gaat.

**Beheer: formaatcheck alleen als `btwNummer` of `land` daadwerkelijk wijzigt.** De prijsgroep-`<select>` en de kunstenaar-`<Combobox>` in `KlantModal` zitten niet achter bewerkmodus (`isEditing`) — een medewerker kan die altijd aanpassen. Zou de formaatcheck bij elke save opnieuw het opgeslagen `btwNummer`/`land`-paar toetsen, dan blokkeert een save die alleen de prijsgroep of de kunstenaar-koppeling wijzigt op een record met een bestaande niet-matchende combinatie — dezelfde val als "bestaande data maakt een record onopslaanbaar" die de leeg-is-altijd-toegestaan-regel al voorkomt. De check wordt daarom pas uitgevoerd wanneer `fields.btwNummer` of `fields.land` afwijkt van de waarde waarmee het record geladen is. Wijzigt `land` naar een land waarvan het opgeslagen nummer het formaat niet meer matcht, dan blokkeert de save nog steeds — dat is bewust: een medewerker die het land actief verandert, moet het bijpassende nummer ook meteen corrigeren.

**Accountpagina: onvoorwaardelijk, met opzet anders dan beheer.** Op de accountpagina is elk veld altijd bewerkbaar — er is geen "niet-bewerkmodus" waarin een klant per ongeluk tegen oude data aanloopt die hij niet zelf kan repareren. Een klant die de check tegenkomt, kan het btw-nummer altijd zelf meteen corrigeren, dus de val die de gating in beheer nodig maakt, bestaat hier niet. Dat is de reden dat deze plek bewust van beheer afwijkt.

Validatie gebeurt zowel client- als serverside — de serverside check is de echte, de clientside voorkomt een mislukte round-trip. Beide roepen `valideerBtwNummer` aan.

## E. UI-plekken

Overal direct ná het KVK-veld, zodat de twee bedrijfsnummers bij elkaar staan:

- **`src/components/RegistrationForm.tsx`** — tekstinput na het `kvk`-veld, met `<RequiredMark />` die verschijnt zodra het gekozen land in `EU_LANDCODES` zit en niet NL is. `data-testid="word-klant-btwnummer"`.
- **`src/components/beheer/KlantModal.tsx`** — `btwNummer` in `EditableFields` en `fieldsFromKlant`, en een `<Veld>` na het KVK-veld. `data-testid="klant-modal-btwNummer"`.
- **`src/components/beheer/KlantenSection.tsx`** — `btwNummer` op de `Klant`-interface en een kolom `{ key: 'btwNummer', label: t('klantenColBtwNummer') }` na de KVK-kolom. Zo is in één oogopslag zichtbaar welke EU-klanten het nummer nog missen.
- **`src/components/account/SettingsSection.tsx`** — veld in `KlantProfile`, `EMPTY_PROFILE`, de laad-mapping en het formulier.

**Bewuste afwijking van het KVK-patroon:** `kvk` staat wél in `SELF_EDITABLE_KLANT_FIELDS`, maar `SettingsSection` toont het niet — een klant kan zijn KVK-nummer dus nu niet zelf wijzigen. Voor `btwNummer` doen we dat wél, omdat een btw-nummer vaker verandert dan een KVK-nummer (een bedrijf krijgt er een, of raakt het kwijt bij een rechtsvormwijziging) en het gat anders alleen via een mailtje aan beheer te dichten is. Dat maakt de accountpagina op dit punt inconsistent met KVK; `kvk` daar alsnog toevoegen is een aparte afweging en valt buiten deze spec.

## i18n

Nieuwe sleutels in `messages/nl.json`, `en.json`, `de.json`, `fr.json`:

- `beheer.glassartDesignLabelTenaamstelling`
- `beheer.glassartDesignLabelBic`
- `beheer.klantenColBtwNummer` (hergebruikt als label in `KlantModal`)
- `wordKlant.labelBtwNummer` en twee foutmeldingen: verplicht-bij-EU-land en ongeldig-formaat
- `accountPage.settings.labelBtwNummer`

Alle vier de talen krijgen een echte vertaling, geen Nederlandse tekst als plaatsvervanger.

## Tests

- **`tests/lib/btwNummer.test.ts`** (nieuw) — het zwaartepunt. Per EU-land minstens één geldig en één ongeldig nummer; expliciete gevallen voor de GR/EL-prefix, voor invoer zónder prefix, voor invoer met spaties en punten, voor leeg-bij-NL, leeg-bij-EU-land en leeg-bij-niet-EU (`valideerBtwNummer` geeft in alle drie de gevallen `'leeg'` terug; of dat toegestaan is, wordt bepaald door `isBtwNummerVerplicht`, niet door deze functie), en de consistentiecheck tussen `EU_LANDCODES` en de regex-map.
- **`tests/components/beheer/GlassartDesignSection.test.tsx`** — tenaamstelling en BIC zijn zichtbaar, bewerkbaar en gaan mee in `onSave`.
- **`tests/components/RegistrationForm.test.tsx`** — btw-nummer verplicht bij een EU-land ≠ NL, niet verplicht bij NL, niet verplicht bij een niet-EU-land, en foutmelding bij een ongeldig formaat.
- **`tests/components/beheer/KlantModal.test.tsx`** en **`KlantenSection.test.tsx`** — veld respectievelijk kolom aanwezig, bewerken slaat op; een bestaande EU-klant zónder btw-nummer is opslaanbaar (bewaakt de keuze uit sectie D).
- **`tests/components/account/SettingsSection.test.tsx`** — veld laadt en slaat op.
- **`tests/app/api/klanten-me.test.ts`** en de registratietests — `btwNummer` wordt geaccepteerd en opgeslagen, en een ongeldig formaat wordt serverside geweigerd.

De databasetests draaien tegen de gedeelde staging-database. Cleanup blijft gescoped op exact de rijen die de test zelf aanmaakt (`@example.com`-adressen), zoals de bestaande regel in `CLAUDE.md` voorschrijft.
