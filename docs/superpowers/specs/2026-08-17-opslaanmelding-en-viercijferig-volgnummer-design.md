# Opslaanmelding bij kunstwerken en een viercijferig volgnummer — ontwerp

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 17-08-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

Datum: 2026-08-17
Status: ontwerp, goedgekeurd voor implementatie

## Aanleiding

Twee losse klachten over hetzelfde scherm, het kunstwerk-formulier in beheer.

De eerste: als een kunstwerk niet opgeslagen kan worden, staat er niet waarom. De
Opslaan-knop wordt alleen grijs gemaakt, zonder tekst, en een serverfout die het scherm
niet herkent komt terug als "Er is iets misgegaan. Probeer het opnieuw." — een melding
waar niemand iets mee kan, ook ik niet als het gemeld wordt.

De tweede: het volgnummer in een kunstwerkcode is vijf posities (`GLA-JAC-00001`) en dat
mogen er vier worden.

## Uitgangssituatie in de code en de data

**Opslaan.** `src/components/beheer/KunstwerkenSection.tsx` berekent `opslaanDisabled`
(regel 519) uit zes voorwaarden: foto, code, formaat, kunstenaar (alleen bij een nieuw
kunstwerk), prijs per m² (alleen bij een materiaalloos kunstwerk) en de Nederlandse
omschrijving — plus `uploading`. Het enige signaal naar de gebruiker is een rood bolletje
op het tabblad (`algemeenHeeftFout`, `matenHeeftFout`, `omschrijvingenHeeftFout`) en een
rode rand om het veld zelf. Wie op het tabblad Omschrijvingen staat, ziet niet dat op
Algemeen de foto ontbreekt.

`mutatieFoutmelding()` (regel 616) vertaalt precies twee servercodes: `code-bestaat-al` en
`code-in-bestelling`/`in-use-bestelling`. Al het andere — `code-verplicht`,
`dubbele-relatie`, `not-found`, `unauthorized`, `server-error`, een netwerkfout — valt
terug op de generieke tekst.

`useApiCollection` (`src/lib/useApiCollection.ts`) leest bij een mislukte mutatie het veld
`error` uit de responsebody en zet dat in `lastMutationErrorCode`. Blijft de body leeg of
gooit `fetch` zelf, dan blijft die code `null`. `lastMutationErrorCode` wordt alleen door
dit ene scherm gebruikt (`BeheerShell.tsx`, regel 415).

**Codes.** Het formaat wordt op twee plekken vastgelegd:
`src/lib/kunstwerkCodePatroon.ts` controleert `/^[A-Z]{3}-[A-Z]{3}-\d{5}$/`, en
`src/lib/kunstwerkCodeVoorstel.ts` stelt het volgende nummer voor — met breedte 5 voor een
onbekende prefix, en anders de breedste bestaande code van die prefix. Codes staan in twee
kolommen: `kunstwerken.code` en `bestellines.code`. Foto's hebben een hash als
bestandsnaam en hangen niet aan de code.

Data op 17-08-2026 — **productie is leeg**, staging heeft 91 kunstwerken:

| cijfers | aantal | voorbeeld |
|---|---|---|
| 3 | 17 | `GLA-ANI-005` |
| 4 | 9 | `GLA-ABS-0022` |
| 5 | 63 | `GLA-DAA-00001` |
| geen | 2 | `Akoestische stof`, `GLA_ANI_004` |

Alle 63 vijfcijferige codes beginnen met een nul, dus versmallen kan zonder verlies.

Twee dingen kwamen bij het doorrekenen boven water. Ten eerste: `GLA-ABS-0028-00001`,
`GLA-ABS-0029-00001` en `GLA-ANI-015-00001` zijn ontstaan doordat iemand een héle code in
het prefix-veld heeft gezet. `vindBekendePrefixen` splitst op de láátste streep, dus die
foute code kwam daarna ook nog als prefix in de keuzelijst terecht — de fout plant zichzelf
voort.

Ten tweede, en veel vervelender: de prefix `GLA-MAR` wordt door twee dingen tegelijk
gebruikt. `GLA-MAR-001` t/m `011` (drie cijfers, negen werken) zijn zeewerken van
Glassart&Design; `GLA-MAR-00001` t/m `00016` (vijf cijfers, zestien werken) zijn van
kunstenaar Marieke Hoffmann. Zolang de reeksen verschillend breed waren botsten ze niet.
Worden ze allebei vier cijfers, dan willen negen zeewerken hetzelfde nummer als een werk
van Marieke.

## Beslissingen

### 1. De reden waarom niet opgeslagen kan worden staat bij de knop

Boven de Opslaan-knop komt een blok dat opsomt wat er ontbreekt, met tussen haakjes het
tabblad waar dat veld staat: foto (Algemeen), code (Algemeen), formaat (Algemeen),
kunstenaar (Algemeen), prijs per m² (Maten), Nederlandse omschrijving (Omschrijvingen).
Alleen de punten die werkelijk ontbreken worden getoond; is alles compleet, dan is het blok
weg. Loopt er een upload, dan staat er dat de foto nog geüpload wordt.

De knop blijft uitgeschakeld. Overwogen en verworpen: de knop altijd inschakelen en pas bij
het klikken melden wat er mis is. Dat verplaatst de ontdekking naar ná de klik, terwijl de
rode tabbladbolletjes al op "zichtbaar vooraf" zijn ontworpen; de opsomming sluit daarop
aan in plaats van er tegenin te werken.

De bestaande rode randen en tabbladbolletjes blijven. Dit komt erbij — het vertelt welk
veld, op welk tabblad; die andere twee vertellen wáár je moet zijn zodra je het weet.

### 2. Elke servercode krijgt een eigen tekst, en het onbekende geval noemt de code

`mutatieFoutmelding()` dekt voortaan alle codes die de kunstwerk-routes kunnen teruggeven:
`code-bestaat-al`, `code-in-bestelling`/`in-use-bestelling`, `code-verplicht`,
`dubbele-relatie`, `not-found` (het kunstwerk is intussen door iemand anders verwijderd —
ververs het scherm), `unauthorized` (sessie verlopen — log opnieuw in) en `server-error`.

Voor wat er ondanks die lijst nog doorheen glipt, komt de technische code ín de tekst:
"Opslaan mislukt (foutcode: xyz)". Dat is het verschil tussen een melding die ik kan
naspeuren en een melding die alleen zegt dat er iets was. Daarvoor moet
`useApiCollection` bij een mislukte mutatie ook iets vastleggen als de body géén `error`
bevat: `http-<status>` bij een respons zonder herkenbare body, `netwerkfout` als `fetch`
zelf gooit. Dat is additief — het veld was al `string | null` en wordt alleen vaker
gevuld — en dit scherm is de enige gebruiker.

### 3. Het volgnummer is vier posities, vast

De patrooncontrole wordt `/^[A-Z]{3}-[A-Z]{3}-\d{4}$/`. Het voorstel gebruikt voortaan
altijd breedte 4, in plaats van de breedste bestaande code van die prefix. Die "neem over
wat er al staat"-regel was er om een lopende reeks niet halverwege van breedte te laten
wisselen; na de migratie hieronder is elke reeks vier cijfers breed, dus hij beschermt niets
meer en zou een oude breedte alleen maar kunnen laten terugkomen.

Verworpen: 3, 4 én 5 cijfers blijven accepteren. Dat houdt precies de situatie in stand die
de `GLA-MAR`-botsing veroorzaakte — twee reeksen die alleen door hun breedte uit elkaar
gehouden worden.

### 4. Het prefix-veld haalt een meegetypt volgnummer eraf

Typt of plakt iemand een hele code in het prefix-veld, dan wordt een afsluitend
`-<cijfers>` weggehaald voordat het voorstel gemaakt wordt. Dit is de directe oorzaak van
de drie `-00001`-codes, en de migratie hieronder ruimt weliswaar de gevolgen op, maar niet
de oorzaak.

### 5. De bestaande codes worden meegenomen, en de botsing wordt opgelost door op te ruimen

De alternatieven voor de negen botsende zeewerken — een eigen prefix, of doornummeren
achter Marieke aan — zijn beide besproken en afgevallen: Marieke Hoffmann is testdata en
mag met haar zestien kunstwerken verdwijnen. Daarmee lost de botsing zichzelf op en worden
de zeewerken gewoon `GLA-MAR-0001` t/m `GLA-MAR-0011`. Hetzelfde geldt voor
`GLA-ABS-0028-00001` ("Color Explosion"), dat zou botsen met het bestaande
`GLA-ABS-0028` ("Abstract"): dat werk wordt verwijderd in plaats van hernummerd.

Eén blokkade daarbij: `GLA-MAR-00016` staat in bestelling BE-01554 (klant KL-00003, status
*Te factureren*). Een kunstwerk verwijderen dat in een bestelling voorkomt is precies wat
de applicatie zelf weigert, omdat de bestelregel daarna een grijs vraagteken met "Onbekend"
toont. Daarom gaat die bestelling mee: BE-01554 wordt met haar bestelregels en
statushistorie verwijderd. Dat is testdata en productie is leeg, dus er gaat geen echte
klantbestelling verloren.

De migratie doet, in één transactie en in deze volgorde:

1. Bestelling BE-01554 verwijderen (statushistorie, bestelregels, header).
2. Kunstenaar Marieke Hoffmann (`KU-00007`) en haar 16 kunstwerken verwijderen.
3. `GLA-ABS-0028-00001` verwijderen.
4. De overgebleven 64 afwijkende codes hernoemen naar vier cijfers, in `kunstwerken.code`
   én `bestellines.code`.

Meegenomen in stap 4, naast het simpele versmallen: `GLA_ANI_004` → `GLA-ANI-0004`
(underscores), `Gla-MAR-001` → `GLA-MAR-0001` (hoofdletters), en de twee overgebleven
prefix-ongelukken `GLA-ANI-015-00001` → `GLA-ANI-0015` en `GLA-ABS-0029-00001` →
`GLA-ABS-0029`. `Akoestische stof` blijft ongemoeid — dat product heeft geen artikelnummer
en is precies waarom de patrooncontrole een bevestiging is en geen harde eis.

Eindstand op staging: 74 kunstwerken, alle codes `AAA-AAA-0000`, plus `Akoestische stof`.
Doorgerekend: geen botsingen. Op productie is de migratie een lege operatie.

De hernoeming staat als expliciete `UPDATE`-regels in het migratiebestand, niet als een
slimme `REGEXP_REPLACE`. Een expliciete lijst is te lezen, te reviewen en te controleren
vóór hij draait; een reguliere expressie over echte data is dat niet.

## Gevolgen voor de handleiding

Het hoofdstuk Kunstwerken (`src/components/beheer/documentatie/chapters/KunstwerkenChapter.tsx`)
noemt "vijf cijfers" en gebruikt `GLA-JAC-00001` en `GLA-AFR-00007` als voorbeeld; die tekst
gaat mee naar vier cijfers. De drie screenshots van dat hoofdstuk (`kunstwerken.png`,
`kunstwerken-code-voor.png`, `kunstwerken-code-na.png`) tonen vijfcijferige codes en moeten
opnieuw gemaakt worden.

De opsomming bij de Opslaan-knop is nieuw gedrag in datzelfde formulier en hoort in het
hoofdstuk vermeld te worden.

## Testen

- `kunstwerkCodePatroon`: vier cijfers goedgekeurd, drie en vijf afgekeurd.
- `kunstwerkCodeVoorstel`: onbekende prefix geeft `-0001`; een bekende prefix telt door in
  vier cijfers; een prefix waar per ongeluk een volgnummer aan vast zit, wordt gestript.
- `KunstwerkenSection`: per ontbrekend veld verschijnt de bijbehorende regel bij de knop; is
  alles ingevuld, dan is het blok weg; elke servercode geeft zijn eigen tekst en een
  onbekende code komt letterlijk in de melding terug.
- `useApiCollection`: een mislukte mutatie zonder `error` in de body levert `http-<status>`,
  een gooiende `fetch` levert `netwerkfout`.

De migratie wordt niet door de testsuite gedraaid — die draait tegen dezelfde staging-database
en zou de data van een echte migratie niet mogen aanraken.

## Uitrolvolgorde

Migratie op staging draaien, deployen naar staging, daar controleren, en pas daarna
toestemming vragen voor productie. Op productie verandert de migratie niets (lege database),
maar hij wordt wel toegepast zodat `schema_migrations` in beide omgevingen gelijk blijft.
