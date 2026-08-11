# Bestelling bewerken in beheer — ontwerp

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 11-08-2026 is vastgelegd, inclusief de afwegingen van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

Datum: 2026-08-11
Status: ontwerp, goedgekeurd voor implementatie

## Aanleiding

Beheer kan vandaag al één bestaande bestelregel bewerken (materiaal, maat/afmeting, prijs,
aantal) via `BestellingModal`, en direct opslaan — maar er is geen manier om een regel te
verwijderen, een regel toe te voegen, of een korting op de hele bestelling te zetten. Dat
laatste is nodig voor speciale prijsafspraken, bijvoorbeeld wanneer een kunstenaar zijn eigen
werk bestelt. Na een wijziging moet de klant desgewenst een mail met de aangepaste
bestelgegevens kunnen krijgen.

## Uitgangssituatie in de code

**Schema** (`db/schema.sql`): `bestelheaders` heeft geen kortingskolom. `bestellines` heeft
`prijs`, `quantity`, `materiaalId`, `maatId`, `breedte`, `hoogte` — allemaal al schrijfbaar.
Geen enkele bestaande route ondersteunt een regel toevoegen of verwijderen.

**API** (`src/app/api/bestelheaders/...`):
- `POST /api/bestelheaders` (klant plaatst bestelling) berekent de prijs per regel server-side
  via `berekenBestellijnPrijs` (`src/lib/server/prijsmodule.ts`) en vertrouwt nooit een door de
  client meegestuurde prijs — precies het patroon dat dit ontwerp voor "regel toevoegen"
  hergebruikt.
- `PATCH /api/bestelheaders/[id]/bestellines/[lineId]` (staff-only) update
  `materiaalId`/`maatId`/`prijs`/`quantity`/`breedte`/`hoogte` via een allowlist
  (`BESTELLINE_COLUMNS`), zonder enige statuscontrole — vandaag kan een medewerker dus zelfs op
  een `Betaald en afgerond`-bestelling nog een regel wijzigen. Dit endpoint verdwijnt in dit
  ontwerp (zie beslissing 5).
- `PATCH /api/bestelheaders/[id]` (staff-only) is de generieke kolom-update die de
  statusknoppen (goedkeuren/afwijzen/afronden/factureren/terugzetten) aandrijven.

**Prijsmodule** (`src/lib/server/prijsmodule.ts`): `berekenBestellijnPrijs` is de enige plek die
kunstenaarsopslag (`kunstenaarAfspraken.prijsopslag`) en de klant-prijsgroep
(`pasPrijsgroepToe`, percentage-korting/opslag) combineert tot een regelprijs. Dat blijft de
enige bron van waarheid voor een nieuwe regel.

**Beheer-UI** (`src/components/beheer/BestellingModal.tsx`, 680 regels): per regel een potlood
("Bewerken") die een inline-editor opent (`editingLineId`/`lineDraft`); "Regel opslaan" PATCht
meteen. Een los prijsveld+knop (`handlePrijsVaststellen`) zet de prijs van een nog ongeprijsde
("op aanvraag") regel, ook meteen opgeslagen, ook zonder statuscontrole. Geen "regel
toevoegen", geen "regel verwijderen", geen kortingsveld. Totalen (regelsom, btw, totaal incl.)
worden inline in de modal berekend uit `bestelling.lines`.

**Mail** (`POST /api/mail`, `src/lib/server/mailRelay.ts`): een discriminated union op `soort`.
`'bestelbevestiging'` stuurt een generieke, niet-itemized tekst naar de ingelogde klant zelf
(recipient wordt altijd server-side opgezocht, nooit uit de request). `'drukker'` stuurt naar
een drukker-e-mailadres, met optionele HTML. Er bestaat geen wijzigingsmail.

## Beslissingen

1. **Korting is een vast bedrag per bestelling**, niet een percentage en niet per regel.
   Nieuwe kolom `bestelheaders.korting DECIMAL(10,2) NULL`. De besteltotaal wordt
   `SUM(bestellines.prijs × quantity) − COALESCE(korting, 0)`, nooit onder €0.
   Verworpen: een percentage of "kies zelf percentage/bedrag" zoals bij `prijsgroepen` — dat
   mechanisme is bewust generiek omdat het per klant permanent geldt; een ad-hoc
   uitzondering op één bestelling is eenvoudiger als vast bedrag, en dat is ook wat de vraag
   ("kunstenaar bestelt eigen werk") nodig heeft.

2. **Wat bewerkbaar is hangt af van de status, in twee lagen:**
   - **Regelstructuur** (regel toevoegen, regel verwijderen, aantal/materiaal/maat/afmeting
     wijzigen) — toegestaan bij `Te beoordelen` en `Te versturen naar drukker`. Geblokkeerd
     zodra de status `Verstuurd naar drukker`, `Te factureren` of `Betaald en afgerond` is:
     wat er fysiek verzonden is naar de drukker mag niet meer stilletjes gaan afwijken van wat
     het systeem toont.
   - **Prijs (per regel) en korting** — toegestaan in elke status behalve `Afgewezen`, dus ook
     nog bij `Betaald en afgerond`. Dat is ongewijzigd gedrag: `handlePrijsVaststellen` kent
     vandaag al geen statuscontrole.
   - **`Afgewezen` is volledig op slot** — geen regelstructuur, geen prijs, geen korting. Een
     afgewezen bestelling heeft geen vervolg meer.

3. **Regel toevoegen kiest een kunstwerk uit de catalogus** (kunstwerk → materiaal/maat →
   aantal), dezelfde vorm als de klant-cart. De prijs komt nooit van de client: het nieuwe
   endpoint roept `berekenBestellijnPrijs` aan met de bestelling se eigen `klantnr` (dus met
   diens kunstenaarsopslag/prijsgroep), identiek aan hoe `POST /api/bestelheaders` dat al doet.
   Er is bewust géén live prijsvoorbeeld in de UI vóór het opslaan — dat zou een tweede
   prijsberekening in de client vereisen die met de servervariant kan gaan afwijken; de regel
   toont "prijs bekend na opslaan" tot de opslaan-respons terugkomt.

4. **Eén atomisch endpoint**, `PATCH /api/bestelheaders/[id]/wijzigen`, in plaats van losse
   add/delete-endpoints. Eén databasetransactie (zelfde patroon als de transactie in
   `POST /api/bestelheaders`), zodat een korting die wél lukt en een regeltoevoeging die faalt
   nooit een halve wijziging achterlaat. Ownership van elke regel wordt gecontroleerd zoals het
   bestaande line-endpoint dat al deed (JOIN op `bestelnr`/`bestelheaders.id`).

5. **De bestaande `PATCH /api/bestelheaders/[id]/bestellines/[lineId]` en de bijbehorende
   directe PATCH-aanroepen in `BestellingModal` verdwijnen.** Zowel `handleOpslaanRegel` als
   `handlePrijsVaststellen` gaan via het nieuwe endpoint; er blijft na deze wijziging geen
   aanroeper meer over voor het oude endpoint, dus het wordt verwijderd in plaats van
   ongebruikt te laten staan.

6. **UX wordt "verzamelen, dan één keer opslaan"**, niet meer "elke regel meteen opslaan".
   De modal krijgt lokale conceptstaat (welke regels gewijzigd/verwijderd/toegevoegd zijn, en
   het kortingsbedrag) die pas bij één centrale "Wijzigingen opslaan"-knop naar de server gaat.
   Dat is nodig om daarna één keer — niet per losse actie — te kunnen vragen of er een mail
   moet worden gestuurd.

7. **Na een geslaagde opslag: één in-app bevestigingsvraag** "Wijzigingsmail sturen naar
   klant?" (Ja/Nee), zelfde soort lokale bevestigingsstaat als `useAfwijzenBevestiging`.

8. **De mail is een volledig, actueel overzicht, geen diff.** Nieuw `soort: 'bestelwijziging'`
   in `POST /api/mail`, staff-only. De client stuurt alleen `{ soort, bestelheaderId }` — geen
   regels, geen bedragen, geen ontvanger. De server haalt de bestelling met regels, korting en
   klant-e-mailadres zelf opnieuw op uit de database en bouwt de HTML zelf, hetzelfde patroon
   als `'bestelbevestiging'`/`'drukker'` al gebruiken om de ontvanger (en hier ook de inhoud)
   nooit aan de client toe te vertrouwen.

9. **Eén gedeelde, pure totalen-functie** (nieuw bestand `src/lib/bestellingTotalen.ts`) voor
   regelsom, korting, btw en eindtotaal, gebruikt door zowel de modal-weergave als de
   mail-HTML-opbouw op de server. Zonder die ene bron zouden modal en mail-inhoud op termijn
   uit elkaar kunnen gaan lopen (bijvoorbeeld als de btw-afronding ooit verandert).

## A. Schema & kolommen

Migratie `db/migrations/2026-08-11-01-bestelheader-korting.sql`:

```sql
ALTER TABLE bestelheaders ADD COLUMN korting DECIMAL(10,2) NULL AFTER status;
```

`db/schema.sql`: dezelfde kolom toevoegen aan de `bestelheaders`-definitie.

`src/lib/server/tableColumns.ts`: `korting` toevoegen aan `TABLE_COLUMNS.bestelheaders`. Dit
veld wordt uitsluitend beschreven via het nieuwe `wijzigen`-endpoint (niet via de generieke
`PATCH /api/bestelheaders/[id]`) — er komt maar één schrijfpad voor deze kolom.

## B. `src/lib/bestellingTotalen.ts` (nieuw, gedeeld)

Pure functie, geen I/O, herbruikbaar client én server:

```ts
export interface BestellingRegel {
  prijs: number | null;
  quantity: number;
}

export interface BestellingTotalen {
  heeftOngeprijsdeRegel: boolean;
  regelsom: number | null;       // som van prijs × quantity, null als er een ongeprijsde regel is
  korting: number;                // 0 als er geen korting is
  totaalExclBtw: number | null;   // regelsom - korting, nooit onder 0
  btwPercentage: number | null;
  btwBedrag: number | null;
  totaalInclBtw: number | null;
}

export function berekenBestellingTotalen(
  lines: BestellingRegel[],
  korting: number | null,
  btwPercentage: number | null
): BestellingTotalen;
```

`BestellingModal.tsx` vervangt zijn huidige inline totaal-berekening (regels 107–123) door deze
functie. De nieuwe mail-opbouw (sectie D) gebruikt hem server-side met dezelfde `bestellines`-
en `korting`-waarden die net uit de database zijn gelezen.

## C. `PATCH /api/bestelheaders/[id]/wijzigen`

Staff-only (`requireMedewerker`). Request:

```ts
{
  korting: number | null,
  updates:   Array<{ id: string; quantity?: number; prijs?: number | null; materiaalId?: string; maatId?: string; breedte?: number; hoogte?: number }>,
  additions: Array<{ kunstwerkId: string; materiaalId: string; maatId: string; breedte?: number; hoogte?: number; quantity: number }>,
  deletions: string[], // bestellijn-ids
}
```

Server-gedrag, in één `connection.beginTransaction()` / `commit()` / `rollback()`-blok:

1. Bestelheader ophalen op `params.id`; 404 als hij niet bestaat.
2. **`Afgewezen`** → altijd 400 (`bestelling-op-slot`), ongeacht wat er in de body zit.
3. Zit de body iets in `additions`/`deletions`, of een `updates`-item met een ander veld dan
   `prijs`, terwijl de status `Verstuurd naar drukker`, `Te factureren` of `Betaald en afgerond`
   is → 400 (`regelstructuur-op-slot`). Een `updates`-item dat uitsluitend `prijs` bevat, en/of
   een gewijzigde `korting`, blijft in die drie statussen wél toegestaan.
4. Elke `updates.id`/`deletions`-entry moet bij deze `bestelnr` horen (zelfde
   JOIN-ownership-check als het oude line-endpoint) — anders 400.
5. Na toepassen van `deletions` en `additions` moet er minstens 1 regel overblijven — anders
   400 (`bestelling-mag-niet-leeg`).
6. **`additions`**: per regel dezelfde validatie als `POST /api/bestelheaders`
   (`validateLine`, materiaal/maat-lidmaatschap van het kunstwerk, eigen-maat vereist
   breedte/hoogte), en de prijs komt van `berekenBestellijnPrijs` met de klant van déze
   bestelling — nooit van de client. `status: 'op-aanvraag'`/`'onbekend'` wordt een `null`-
   prijs in de nieuwe regel (net als bij een normale bestelling kan een regel ongeprijsd
   binnenkomen; een medewerker prijst hem later via `updates`).
7. **`updates`**: schrijft de meegegeven velden, `prijs` blijft — zoals vandaag — een directe
   waarde van de medewerker (dekt zowel "prijs vaststellen" als een handmatige correctie).
8. **`deletions`**: `DELETE FROM bestellines WHERE id IN (...) AND bestelnr = ?`.
9. **`korting`**: schrijft `bestelheaders.korting`.
10. Bij elke wijziging (regels en/of korting) precies één `logActiviteit('bestelling_gewijzigd', bestelnr)`
    — geen aparte log per regel zoals nu.
11. Response: de volledige, actuele bestelling (header + regels), zodat de client zijn state
    vervangt met wat er echt in de database staat in plaats van optimistisch de eigen draft
    aan te nemen.

Geen `bestelstatusHistorie`-rij — die tabel is uitsluitend voor `status`-wijzigingen, en die
verandert dit endpoint niet.

## D. `POST /api/mail`, nieuw `soort: 'bestelwijziging'`

```ts
| { soort: 'bestelwijziging'; bestelheaderId: string }
```

Staff-only (`requireMedewerker`). Server:

1. Bestelheader + regels + `klanten.email` ophalen op `bestelheaderId` (404/`geen-ontvanger`
   als de klant geen e-mailadres heeft, zelfde patroon als de bestaande twee soorten).
2. Btw-percentage bepalen zoals de modal dat al doet (`resolveBtwPercentage` op het land van de
   klant) en `berekenBestellingTotalen` aanroepen (sectie B).
3. HTML server-side opbouwen: bestelnr, per regel kunstwerk-omschrijving/materiaal/maat/
   aantal/prijs/regeltotaal, korting, subtotaal, btw, eindtotaal — dezelfde gegevens die de
   modal toont, alleen als e-mail-HTML in plaats van React.
4. `verstuurMail({ to: klant.email, subject, body, html })`.

Onderwerp/tekst zijn — anders dan bij `'bestelbevestiging'`/`'drukker'` — niet client-geleverd:
omdat de inhoud hier bedragen bevat die kloppend moeten blijven met wat net is opgeslagen, bouwt
de server ze zelf, met dezelfde `messages/nl.json`-vertalingen die de rest van de mailflow al
gebruikt.

## E. Beheer-UI (`BestellingModal.tsx`)

Conceptstaat naast de bestaande `editingLineId`/`lineDraft`:

```ts
interface Concept {
  updates: Record<string, Partial<LineDraft>>;   // lineId -> gewijzigde velden
  deletions: Set<string>;                         // lineId
  additions: NieuweRegelDraft[];                   // met een tijdelijk client-side id
  korting: string;                                 // input-waarde, leeg = geen korting
}
```

- **Bestaande regel bewerken**: de potlood-editor werkt zoals nu, maar "Regel opslaan" schrijft
  het resultaat in `concept.updates[line.id]` in plaats van meteen te PATCHen, en sluit de
  inline-editor. De regel toont een "gewijzigd, nog niet opgeslagen"-indicator.
- **Regel verwijderen**: nieuwe knop per regel → zet het id in `concept.deletions`; de regel
  toont doorgestreept met een "ongedaan maken". Verborgen wanneer regelstructuur op slot zit
  (sectie C, punt 3, dus vanaf `Verstuurd naar drukker`) of status `Afgewezen` is.
- **Regel toevoegen**: nieuwe knop opent een kleine inline-vorm — kunstwerk kiezen (uit de al
  geladen `kunstwerken`-prop), dan materiaal/maat gefilterd op dat kunstwerk (of eigen
  breedte/hoogte), dan aantal — en voegt een item toe aan `concept.additions`. Zelfde
  zichtbaarheidsregel als "regel verwijderen".
- **Korting**: een €-invoerveld bij de totalenweergave, altijd zichtbaar/bewerkbaar behalve bij
  `Afgewezen`. Vult `concept.korting`.
- **Prijs vaststellen** (bestaande "op aanvraag"-flow) wordt gewoon een `updates`-item met
  alleen `prijs` — blijft dus ook bij `Te factureren`/`Betaald en afgerond` bewerkbaar, maar
  gaat nu ook via de conceptstaat in plaats van een eigen meteen-PATCH.
- **"Wijzigingen opslaan"**-knop verschijnt zodra `concept` iets bevat dat afwijkt van de
  opgeslagen bestelling. Bouwt de payload uit `concept` en roept
  `PATCH .../wijzigen` aan. Bij succes: `concept` legen, `bestelling` vervangen door de
  serverrespons, en de mail-bevestigingsvraag tonen.
- **Mail-bevestigingsvraag**: "Wijzigingsmail sturen naar klant?" met Ja/Nee, zelfde
  interactiepatroon als `useAfwijzenBevestiging`. Ja → `POST /api/mail` met
  `{ soort: 'bestelwijziging', bestelheaderId: bestelling.id }`; Nee en Ja sluiten de vraag
  na afhandeling.
- Totalenweergave in de subtitle (regels 305–337 vandaag) gaat via `berekenBestellingTotalen`
  en toont de korting als eigen regel wanneer die niet 0 is.

## Vertalingen

Alleen `messages/nl.json`, `beheer`-blok (beheer-only UI, zelfde conventie als de rest van deze
sectie). Nieuwe sleutels, ruwweg: `bestellingenRegelToevoegen`, `bestellingenRegelVerwijderen`,
`bestellingenRegelVerwijderenOngedaanMaken`, `bestellingenKortingLabel`,
`bestellingenWijzigingenOpslaan`, `bestellingenWijzigingenAnnuleren`,
`bestellingenMailVraag`, `bestellingenMailJa`, `bestellingenMailNee`,
`bestellingenRegelNieuwKunstwerk`, `bestellingenRegelNieuwMateriaal`,
`bestellingenRegelNieuwMaat`, `bestellingenRegelNieuwAantal`,
`bestellingenRegelPrijsNaOpslaan`. Exacte set en bewoording volgt bij implementatie.

## Testids

Nieuw, conventie van de bestaande `bestelling-modal-*`-ids volgend:
`bestelling-modal-regel-verwijderen-{id}`, `bestelling-modal-regel-verwijderen-ongedaan-{id}`,
`bestelling-modal-regel-toevoegen`, `bestelling-modal-korting-input`,
`bestelling-modal-wijzigingen-opslaan`, `bestelling-modal-mail-vraag`,
`bestelling-modal-mail-ja`, `bestelling-modal-mail-nee`.

## Tests

- `berekenBestellingTotalen`: regelsom met/zonder korting, korting groter dan regelsom (clamp
  op 0), ontbrekende prijs (op-aanvraag) geeft `heeftOngeprijsdeRegel`, btw `null` als er geen
  percentage bekend is.
- `PATCH .../wijzigen`: 401 zonder medewerker-sessie; 400 bij `Afgewezen` ongeacht body; 400 bij
  regelstructuur-wijziging terwijl status `Verstuurd naar drukker`/`Te factureren`/
  `Betaald en afgerond` is, maar 200 als diezelfde body alléén `prijs` en/of `korting` bevat;
  200 bij een regelstructuur-wijziging terwijl status `Te beoordelen`/`Te versturen naar
  drukker` is; 400 als een `updates`/`deletions`-id niet
  bij deze bestelling hoort; 400 als de bestelling na de wijziging 0 regels zou hebben; prijs
  van een `addition` komt uit `berekenBestellijnPrijs`, niet uit de request, ook als de client
  een afwijkende `prijs` meestuurt; alles-of-niets bij een fout halverwege (rollback zichtbaar
  doordat geen van de bijwerkingen in de database staat).
- `POST /api/mail` met `soort: 'bestelwijziging'`: 401 zonder medewerker-sessie; 400/`geen-
  ontvanger` zonder klant-e-mail; verzonden `to` is altijd het klant-e-mailadres, nooit iets uit
  de request; verzonden inhoud bevat de actuele regels/korting/totaal uit de database, niet iets
  dat de client heeft meegestuurd.
- `BestellingModal`: regel toevoegen/verwijderen/wijzigen blijft lokaal (geen netwerkaanroep)
  tot op "Wijzigingen opslaan" geklikt wordt; die knop verschijnt alleen als er een concept-
  wijziging is; na een geslaagde opslag verschijnt de mail-vraag precies één keer; Ja/Nee op de
  mail-vraag roept `POST /api/mail` wel/niet aan; regel-toevoegen/verwijderen-knoppen zijn
  onzichtbaar bij `Verstuurd naar drukker`/`Te factureren`/`Betaald en afgerond`/`Afgewezen`;
  het kortingsveld en de prijs-editor blijven zichtbaar bij `Verstuurd naar drukker`/
  `Te factureren`/`Betaald en afgerond` maar niet bij `Afgewezen`.

## Wat dit ontwerp bewust niet doet

- Geen percentage-korting of combinatie percentage/bedrag op bestelniveau — alleen een vast
  bedrag (beslissing 1).
- Geen live serverprijs-voorbeeld tijdens het samenstellen van een nieuwe regel — de prijs
  verschijnt pas in de opslaan-respons (beslissing 3).
- Geen wijziging aan de statusknoppen/-workflow zelf (goedkeuren/afwijzen/afronden/factureren)
  — dit ontwerp raakt alleen de inhoud (regels, korting) van een bestelling, niet de status.
- Geen diff-mail ("regel X gewijzigd van...naar...") — de mail toont altijd de volledige,
  actuele bestelling (beslissing 8).
- Geen wijzigingsmogelijkheid voor `klantnr`/welke klant een bestelling toebehoort.
