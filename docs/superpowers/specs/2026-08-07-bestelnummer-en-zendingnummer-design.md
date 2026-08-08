# Bestelnummer tonen + zendingnummer voor de drukker — ontwerp

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 07-08-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

Datum: 2026-08-07
Status: ontwerp, goedgekeurd voor implementatie

## Aanleiding

`bestelnr` bestaat al als veld op elke bestelling, maar wordt nergens getoond:
niet in de bestellingentabel, niet in de Bestelgegevens-modal, en niet in de
e-mail naar de drukker. Voor die laatste is er een dieper probleem: de mail
groepeert regels per klant, maar pooled daarbinnen alle regels van meerdere
bestellingen van diezelfde klant in één platte lijst — er is nu geen enkele
manier om vanuit de mail te zien welke regel bij welk bestelnummer hoort.

Los daarvan: als een medewerker één of meer bestellingen naar de drukker
stuurt, is er geen mens-leesbaar referentienummer voor die verzending. Het
groeperen-en-samen-afronden werkt al (`drukkerZendingen.bestellingIds` +
`handleMarkeerZendingAlsAfgerond` in `DrukkerModal.tsx`, en de
zendinggenoten-melding in `BestellingenSection.tsx`, zie
[[project_bulk_afronden_zendinggenoten]]) — wat ontbreekt is alleen een
leesbaar nummer om naar te verwijzen, zoals `bestelnr` dat al doet voor een
losse bestelling.

## Uitgangssituatie in de code

- `Bestelling` (`src/components/beheer/BestellingenSection.tsx`) heeft
  `bestelnr: string`, gebruikt voor `logActiviteit(...)`-calls maar nergens
  gerenderd.
- DataTable-kolommen (`BestellingenSection.tsx`, regel ~288): `companyName`,
  `besteldatum`, `lineCount`/`totalQuantity`, `status`.
- `BestellingModal.tsx`'s subtitle toont alleen
  `{companyName} · {besteldatum}` plus statusbadge.
- `buildDrukkerMail.ts` groepeert per klant (`klantIds.map(...)`), en binnen
  elke klant-sectie: `const lines = klantBestellingen.flatMap((b) => b.lines);`
  — de regels van alle bestellingen van die klant in één platte array, zonder
  dat `resolveRegel`/`formatRegel(Html)` ooit de bijbehorende bestelling of
  `bestelnr` te zien krijgen.
- `drukkerZendingen` (schema) heeft geen mens-leesbaar nummer, alleen een UUID
  `id`. `bestelnr` zelf wordt gegenereerd via het bestaande `counters`-patroon
  (`src/app/api/bestelheaders/route.ts`, regel ~165-174): binnen één
  transactie `UPDATE counters SET value = value + 1 WHERE id = 'bestelnummer'`,
  dan `SELECT value`, dan `GD-${...padStart(5,'0')}`.
- `POST /api/drukkers/[id]/zendingen` (archiveren) gebruikt de generieke
  `insertRow('drukkerZendingen', { drukkerId, ...data }, ['bestellingIds'])`.
  `PATCH /api/bestelheaders/[id]` gebruikt `updateRow('bestelheaders', id,
  data)`. Beide bouwen hun SQL dynamisch op uit de sleutels van het
  meegegeven object — een nieuw veld in de request-body vereist dus **geen
  routewijziging**, alleen dat de kolom bestaat. `GET /api/bestelheaders` doet
  `SELECT * FROM bestelheaders`, dus een nieuwe kolom komt automatisch mee in
  de JSON-respons.
- `DrukkerModal.tsx` toont per zending alleen datum + "N klanten, M regels"
  (`drukkersZendingenSamenvatting`), geen nummer.

## A. Bestelnummer tonen: tabel en Bestelgegevens

- `BestellingenSection.tsx`: nieuwe eerste kolom `bestelnr`
  (`bestellingenColBestelnummer`), vóór klant.
- `BestellingModal.tsx`: subtitle wordt
  `{bestelling.bestelnr} · {bestelling.companyName} · {bestelling.besteldatum}`.

Geen backend-wijziging: `bestelnr` staat al op elke bestelling.

## B. Bestelnummer in de drukker-mail

`buildDrukkerMail.ts` blijft qua per-klant-groepering ongewijzigd, maar de
sectie-opbouw itereert straks over `klantBestellingen` (elke bestelling van
die klant apart) in plaats van over de platgeslagen `lines`-array. Per
bestelling komt een kopje `Bestelling {bestelnr}` vóór de regels van precies
die bestelling — ook wanneer een klant maar één bestelling heeft, zodat er
geen uitzonderingsgeval in de opmaaklogica nodig is.

Tekstvoorbeeld:

```
== Testbedrijf BV ==
Afleveradres: ...

Bestelling GD-00042:
- Kunstwerk X — ..., maat ..., aantal 2

Bestelling GD-00043:
- Kunstwerk Y — ..., maat ..., aantal 1
```

HTML: een kleine label-rij (vergelijkbaar met de bestaande vetgedrukte
stijl van het factuurvoetje) vóór de regelkaarten van elke bestelling,
binnen dezelfde klant-tabel.

`resolveRegel`, `formatRegel`, `formatRegelHtml` blijven ongewijzigd — die
kennen alleen de regel, niet de bestelling, en dat blijft zo.

## C. Zendingnummer — schema

Drie migratie-onderdelen, analoog aan het bestaande `bestelnummer`-patroon:

```sql
ALTER TABLE drukkerZendingen ADD COLUMN zendingnummer VARCHAR(20) NULL;
ALTER TABLE bestelheaders ADD COLUMN zendingnummer VARCHAR(20) NULL;
INSERT INTO counters (id, value) VALUES ('zendingnummer', 0);
```

Beide kolommen zijn `NULL`-baar: bestaande, al verzonden bestellingen/
zendingen krijgen geen nummer achteraf (zie "Wat dit ontwerp bewust niet
doet"). `zendingnummer` op `bestelheaders` is een bewust gedenormaliseerde
kopie, puur voor weergave op bestelling-niveau — zie hieronder.

## D. Zendingnummer — reserveren en gebruiken

Nieuwe route `POST /api/drukkers/[id]/zendingen/nummer`. Vereist
`requireMedewerker`. Reserveert atomisch het volgende nummer, exact het
`counters`-patroon van `bestelnr`, maar zonder een rij aan te maken:

```ts
// binnen één transactie:
// UPDATE counters SET value = value + 1 WHERE id = 'zendingnummer'
// SELECT value FROM counters WHERE id = 'zendingnummer'
// ZD-${String(value).padStart(5, '0')}
```

Response: `{ zendingnummer: string }`.

`VersturenNaarDrukkerDialog.tsx`, in `handleVersturen`: vóór het versturen van
de mail wordt dit nummer opgehaald. Het onderwerp dat daadwerkelijk verstuurd
wordt is `${zendingnummer} — ${mail.subject}` — `buildDrukkerMail.ts` zelf
verandert niet en weet niets van zendingnummers; de dialoog voegt het alleen
toe aan het al opgebouwde onderwerp vóór het versturen. Mislukt de reservering
(netwerkfout), dan wordt exact hetzelfde gedrag gevolgd als een mislukte
mail-send: `drukkerVersturenMailError`, niets verstuurd, geen half afgeronde
stap.

Na een succesvolle send:

- de archief-POST (`.../zendingen`) krijgt `zendingnummer` gewoon mee in de
  body (naast de bestaande velden) — geen routewijziging nodig;
- de status-PATCH-loop (`PATCH /api/bestelheaders/:id`) krijgt
  `{ status: 'Verstuurd naar drukker', zendingnummer }` in plaats van alleen
  `{ status: ... }` — ook hier geen routewijziging nodig.

Bewust geaccepteerd: als de mail-send zelf daarna mislukt, is het gereserveerde
nummer een gat in de reeks — dat is expliciet met Joris besproken en
akkoord. Mislukt alleen de archivering/status-update ná een geslaagde send,
dan bestaat de bestaande foutmelding (`drukkerVersturenStatusError`, "de
e-mail is verzonden maar het bijwerken is mislukt") al en verandert niet: die
meldt exact dit scenario, ook al betrof het altijd al meer dan het
zendingnummer alleen.

De preview (getoond vóórdat er verstuurd is) toont `mail.subject` zonder
nummer — het nummer bestaat pas op het moment van versturen — met een kort,
gedempt label ernaast dat aangeeft dat het zendingnummer bij verzenden wordt
toegekend.

## E. Weergave van het zendingnummer

- `DrukkerModal.tsx`: de zending-samenvatting wordt
  `{zendingnummer} — {datum} — {samenvatting}` in plaats van alleen
  `{datum} — {samenvatting}`. Voor oudere zendingen zonder nummer (vóór deze
  migratie) valt de eerste `—` simpelweg weg (leeg zendingnummer wordt niet
  getoond).
- `BestellingenSection.tsx`: tweede nieuwe kolom `zendingnummer`
  (`bestellingenColZendingnummer`), direct na de bestelnummer-kolom uit
  onderdeel A. Leeg (geen `—` of placeholder, gewoon geen tekst) voor
  bestellingen die nog niet verstuurd zijn.
- `BestellingModal.tsx`: zendingnummer komt op een eigen regel in de subtitle,
  alleen gerenderd wanneer aanwezig (`bestelling.zendingnummer &&
  <span>...</span>`) — geen lege regel voor bestellingen die nog niet
  verstuurd zijn.

## Vertalingen

Alleen `messages/nl.json` (`beheer`-namespace bestaat niet in de andere
talen, blijft zo):

| Sleutel                                       | Nederlands (richting)                                |
| ---------------------------------------------- | ----------------------------------------------------- |
| `bestellingenColBestelnummer`                  | Bestelnr.                                             |
| `bestellingenColZendingnummer`                 | Zendingnr.                                            |
| `drukkerVersturenZendingnummerToelichting`     | zendingnummer wordt toegekend bij verzenden           |

Bestaande sleutels (`drukkersZendingenSamenvatting`, `bestellingenModalTitel`,
etc.) blijven ongewijzigd van betekenis; alleen waar ze in de JSX staan
verandert.

## Tests

- `tests/lib/buildDrukkerMail.test.ts`: bestaande fixtures krijgen een
  `bestelnr` op elke `bestelling()`-fixture (of expliciet meegegeven); nieuwe
  assertions dat `Bestelling {bestelnr}:` vóór de juiste regels staat, ook bij
  twee bestellingen van dezelfde klant, en ook bij precies één bestelling.
- `tests/components/beheer/BestellingenSection.test.tsx`: nieuwe kolom
  aanwezig met de juiste waarde; zendingnummer-kolom leeg vóór verzenden.
- `tests/components/beheer/BestellingModal.test.tsx`: subtitle bevat
  bestelnr; zendingnummer wordt getoond na verzenden (of blijft leeg ervoor).
- `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx`: reservering
  wordt aangeroepen vóór de mail-POST; onderwerp van de verstuurde mail begint
  met het gereserveerde nummer; archief-POST en status-PATCH's bevatten het
  nummer; reservering-mislukt-scenario toont dezelfde foutmelding als een
  mislukte send zonder iets te versturen; preview toont het onderwerp zonder
  nummer plus de toelichting.
- `tests/app/api/drukkers/zendingen-nummer.test.ts` (nieuw): twee
  achtereenvolgende aanroepen geven oplopende nummers, `401` zonder sessie.
  Eigen fixture/cleanup volgens de project-regel (nooit de counter-rij
  resetten voor determinisme — bereken het verwachte nummer relatief aan de
  actuele stand).
- `tests/components/beheer/DrukkerModal.test.tsx`: zending-samenvatting toont
  het zendingnummer wanneer aanwezig, valt terug op de huidige weergave
  wanneer leeg (oudere zendingen).

## Wat dit ontwerp bewust niet doet

- **Geen nieuwe genormaliseerde koppeltabel** tussen `drukkerZendingen` en
  `bestelheaders` (overwogen tijdens het ontwerpen — een echte foreign-key-
  relatie zou de bestaande `JSON_CONTAINS`-opzoekroute vervangen). Bewust niet
  gedaan: dat zou de net gebouwde, kwetsbare bulk-afronden/zendinggenoten-
  stroom (`[[project_bulk_afronden_zendinggenoten]]`, vier reviewrondes nodig
  om goed te krijgen) moeten herontwerpen voor iets dat met een kolom ook
  werkt. `bestellingIds` als JSON-array blijft de bron van waarheid voor die
  stroom; `bestelheaders.zendingnummer` is een losse, additieve kopie puur
  voor weergave.
- **Geen historische backfill.** Bestaande zendingen en bestellingen die al
  `Verstuurd naar drukker` of verder waren vóór deze migratie krijgen geen
  zendingnummer alsnog toegekend — beide kolommen zijn `NULL`-baar en blijven
  leeg voor die rijen.
- **Geen wijziging aan de zendinggenoten-melding of de afrondstroom zelf** —
  die blijft volledig op `bestellingIds`/`JSON_CONTAINS` draaien, ongewijzigd.
- **Geen productie-migratie als onderdeel van de implementatie zelf** — die
  wordt, zoals altijd, apart met toestemming uitgevoerd, ná verificatie op
  staging.
