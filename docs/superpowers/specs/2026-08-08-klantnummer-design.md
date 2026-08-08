# Klantnummer — ontwerp

Datum: 2026-08-08
Status: ontwerp, goedgekeurd voor implementatie

## Aanleiding

Klanten hebben nu alleen een UUID `id` en een bedrijfsnaam. Er is geen kort,
mens-leesbaar nummer om naar een klant te verwijzen — niet in beheer, niet in
de mail naar de drukker, en niet in contact met de klant zelf. Bestellingen
(`GD-00001`) en zendingen naar de drukker (`ZD-00001`) hebben zo'n nummer al;
klanten zijn de ontbrekende schakel in die reeks.

Het prefix `GD` staat voor Glassart & Design en is nooit als expliciete keuze
vastgelegd: het komt uit de verzonnen voorbeeld-bestelnummers in het eerste
plan (`docs/superpowers/plans/2026-07-18-collectiepaginas.md`, regel 603) en is
bij de bouw van de echte generator overgenomen. `KL-` sluit daarop aan.

## Uitgangssituatie in de code

- `klanten` (`db/schema.sql`, regel 2) heeft geen nummerkolom. Rijen worden
  uitsluitend aangemaakt via `insertRow('klanten', ...)` in
  `src/app/api/auth/register/route.ts` (regel 47), altijd met
  `status: 'Beoordelen'`.
- Statusovergang naar `'Goedgekeurd'` gebeurt op precies één plek:
  `handleGoedkeuren` in `src/components/beheer/KlantModal.tsx` (regel ~212),
  een `PATCH /api/klanten/[id]` met `{ status: 'Goedgekeurd', prijsgroepId }`.
  Daarna volgt een optimistische `onUpdated({ ...klant, status, prijsgroepId })`
  — de UI wacht niet op een verse ophaal.
- `PATCH /api/klanten/[id]` (`src/app/api/klanten/[id]/route.ts`, regel 20)
  doet `updateRow('klanten', params.id, data)` en antwoordt `{ ok: true }`.
  `updateRow` bouwt de SQL dynamisch op uit de sleutels van `data`.
- `listRows`/`getRow` (`src/lib/server/crud.ts`, regel 24 en 34) doen
  `SELECT * FROM klanten`. Een nieuwe kolom komt dus **automatisch** mee in
  `GET /api/klanten` (beheer) en `GET /api/klanten/me` (klantaccount, dat
  alleen `wachtwoordHash` eruit filtert). Geen leeswijzigingen nodig.
- `PATCH /api/klanten/me` schrijft uitsluitend velden uit de allowlist
  `SELF_EDITABLE_FIELDS` (`src/lib/server/klantFields.ts`), dus een klant kan
  een nieuwe kolom niet zelf zetten zolang die niet aan die lijst wordt
  toegevoegd — en dat gebeurt hier bewust niet.
- `counters` (`db/schema.sql`, regel 180) bevat al `bestelnummer` en
  `zendingnummer`. Het toekenpatroon staat in
  `src/app/api/bestelheaders/route.ts` (regel ~165-174) en
  `src/app/api/drukkers/[id]/zendingen/nummer/route.ts`: binnen één transactie
  `UPDATE counters SET value = value + 1`, dan `SELECT value`, dan formatteren
  met `padStart(5, '0')`.
- `buildDrukkerMail.ts` bouwt per klant een sectie op met
  `const bedrijfsnaam = tekst(klant?.companyName) || tekst(klantBestellingen[0].companyName);`
  (regel 277). Verplichte klantvelden voor die mail staan in
  `KLANT_ALGEMENE_VELDEN` / `KLANT_HOOFDADRES_VELDEN` /
  `KLANT_AFLEVERADRES_VELDEN` (regel 40-44); `ontbrekendeKlantVelden` blokkeert
  het versturen als daarvan iets leeg is.
- `logActiviteit('klant_goedgekeurd', actorFromMedewerker(user), klant.companyName)`
  bestaat al (`KlantModal.tsx`, regel 221) — de derde parameter is de vrije
  omschrijving.

## Beslissingen

Vastgelegd in overleg met Joris op 2026-08-08:

| Vraag                     | Keuze                                                     |
| ------------------------- | --------------------------------------------------------- |
| Moment van toekenning     | Bij goedkeuring (`Beoordelen` → `Goedgekeurd`)            |
| Formaat                   | `KL-00001` (2-letterig prefix + 5 cijfers, zoals `GD-`)   |
| Backfill                  | Ja, bestaande goedgekeurde klanten op volgorde `createdAt` |
| Zichtbaar in              | Klantentabel, KlantModal, drukkersmail, klantaccount       |
| Activiteitenlog           | Uitbreiding van de bestaande `klant_goedgekeurd`-regel     |

Klanten met status `Beoordelen` of `Afgewezen` hebben dus geen klantnummer.
Afgewezen en nooit-beoordeelde aanmeldingen verbruiken geen nummers — dit is
een bewuste reactie op de ~2900 verbruikte bestelnummers voor 4 overgebleven
bestellingen op staging.

## A. Schema en migratie

```sql
ALTER TABLE klanten ADD COLUMN klantnr VARCHAR(20) NULL;
INSERT INTO counters (id, value) VALUES ('klantnummer', 0);
```

`db/schema.sql` wordt bijgewerkt (kolom + `INSERT INTO counters`), en er komt
een migratiebestand `db/migrations/2026-08-08-klantnummer.sql` in dezelfde stijl
als `db/migrations/2026-08-07-zendingnummer.sql`.

De kolom is `NULL`-baar en krijgt **geen** `UNIQUE`-index. De teller binnen een
transactie is de uniciteitsgarantie; een index erbovenop zou een tweede, deels
overlappende bron van waarheid worden voor de `NULL`-rijen zonder iets toe te
voegen.

**Backfill** in hetzelfde migratiebestand: bestaande klanten met status
`'Goedgekeurd'` en `klantnr IS NULL` krijgen een nummer op volgorde van
`createdAt`, en de teller wordt daarna op het hoogst uitgedeelde getal gezet.
Op staging zijn dat 6 klanten (`KL-00001` t/m `KL-00006`); productie heeft nul
klanten, dus daar is de backfill een no-op — maar hij moet er wél in staan,
zodat één migratiebestand op beide omgevingen klopt.

De server draait MariaDB 11.8, dus `ROW_NUMBER()` is beschikbaar. De backfill
gaat via een tijdelijke tabel in plaats van een sessievariabele (`@n := @n + 1`
is in nieuwere versies afgeraden en garandeert de toekenningsvolgorde niet) of
een gecorreleerde subquery op `klanten` zelf (dat is de tabel die tegelijk
wordt bijgewerkt):

```sql
CREATE TEMPORARY TABLE klantnr_backfill AS
SELECT id, ROW_NUMBER() OVER (ORDER BY createdAt) AS rn
FROM klanten
WHERE status = 'Goedgekeurd' AND klantnr IS NULL;

UPDATE klanten k
JOIN klantnr_backfill b ON b.id = k.id
SET k.klantnr = CONCAT('KL-', LPAD(b.rn, 5, '0'));

DROP TEMPORARY TABLE klantnr_backfill;

UPDATE counters
SET value = (SELECT COUNT(*) FROM klanten WHERE klantnr IS NOT NULL)
WHERE id = 'klantnummer';
```

De laatste statement telt bewust álle genummerde klanten en niet alleen de
zojuist bijgewerkte rijen: draait de migratie ooit op een database waar al
nummers bestaan, dan blijft de teller kloppen in plaats van terug te springen.

## B. Toekenning

`PATCH /api/klanten/[id]` krijgt er één tak bij. Als `data.status ===
'Goedgekeurd'`, dan gebeurt de hele update binnen één transactie:

1. `SELECT klantnr FROM klanten WHERE id = ? FOR UPDATE` — de rij vergrendelen.
2. Alleen als `klantnr` leeg is: `UPDATE counters SET value = value + 1 WHERE
   id = 'klantnummer'`, dan `SELECT value`, dan `KL-${padStart(5,'0')}`, en dat
   nummer meenemen in de update van de klantrij.
3. De overige velden uit `data` gaan mee zoals nu.
4. Commit.

De `FOR UPDATE` plus de `klantnr IS NULL`-voorwaarde zorgt dat een tweede
goedkeuring van dezelfde klant (dubbelklik, twee medewerkers tegelijk, of een
latere heropening van een afgewezen klant) géén nieuw nummer uitdeelt: wie al
een nummer heeft, houdt het.

Bij elke andere PATCH (gewone veldwijziging, afwijzing) blijft het huidige
`updateRow`-pad ongewijzigd — geen transactie, geen tellerverkeer.

De respons wordt `{ ok: true, klantnr }` wanneer er een nummer is toegekend of
al bestond, en blijft `{ ok: true }` in alle andere gevallen. Voor de
volledigheid: dit is additief, bestaande aanroepers die alleen `response.ok`
controleren merken er niets van.

`handleGoedkeuren` in `KlantModal.tsx` leest `klantnr` uit die respons en neemt
het mee in de optimistische update:
`onUpdated({ ...klant, status: 'Goedgekeurd', prijsgroepId, klantnr })`. Zo
staat het nummer meteen in de tabel en in de modal, zonder verse ophaal.

Mislukt de PATCH, dan verandert er niets aan de bestaande foutafhandeling
(`klantenActionError`): de transactie rolt terug, dus ook de teller — geen gat
in de reeks.

## C. Weergave

**Klantentabel** (`KlantenSection.tsx`) — nieuwe eerste kolom `klantnr` met
label `klantenColKlantnr`, vóór `companyName`, analoog aan de
bestelnummer-kolom bij Bestellingen. `Klant` krijgt `klantnr?: string | null`.
Voor klanten zonder nummer blijft de cel leeg (geen `—` of placeholder). Het
bestaande globale zoekveld van `DataTable` doorzoekt kolommen automatisch, dus
zoeken op `KL-00003` werkt zonder extra werk.

**KlantModal** (`KlantModal.tsx`) — de kop van deze modal toont nu alleen de
titel "Klantgegevens"; de bedrijfsnaam staat pas in het formulier eronder. Het
klantnummer komt daarom in de `subtitle`-prop van `Modal`, precies zoals
`BestellingModal` daar `bestelnr · companyName · besteldatum` neerzet — alleen
gerenderd wanneer aanwezig. Het is een leeswaarde: het veld verschijnt niet in
`EditableFields` en is niet bewerkbaar.

**Drukkersmail** (`buildDrukkerMail.ts`) — de klant-sectiekop wordt
`Testbedrijf BV (KL-00003)` in zowel de tekst- als de HTML-variant. Het nummer
komt uit `klant?.klantnr`; ontbreekt het, dan valt alleen het haakjes-deel weg
en blijft de kop zoals hij nu is.

`klantnr` wordt **niet** toegevoegd aan `KLANT_ALGEMENE_VELDEN`. Die array
voedt `ontbrekendeKlantVelden`, dat het versturen naar de drukker blokkeert bij
lege verplichte velden — een ontbrekend klantnummer mag nooit een verzending
tegenhouden.

**Klantaccount** (`account/SettingsSection.tsx`) — het klantnummer verschijnt
als leesregel bij de bedrijfsgegevens, boven `labelCompanyName`, met label
`labelKlantnr`. Geen `<input>`: een `<p>` in dezelfde `labelClassName`-opmaak
als de omliggende velden, alleen gerenderd wanneer aanwezig. `klantnr` wordt
niet aan `SELF_EDITABLE_KLANT_FIELDS` toegevoegd, dus een klant kan het ook via
een handmatig verzoek aan `PATCH /api/klanten/me` niet zetten.

## D. Activiteitenlog

De bestaande aanroep in `handleGoedkeuren` wordt:

```ts
void logActiviteit(
  'klant_goedgekeurd',
  actorFromMedewerker(user),
  klantnr ? `${klant.companyName} (${klantnr})` : klant.companyName
);
```

Geen nieuw gebeurtenistype, geen wijziging aan de activiteitenlog-tabel of
-routes. De terugval op alleen de bedrijfsnaam dekt het geval dat de respons om
wat voor reden dan ook geen nummer bevatte.

## Vertalingen

Alleen `messages/nl.json` voor de beheer-sleutels (de `beheer`-namespace bestaat
niet in de andere talen — dat blijft zo). De accountpagina is wél viertalig, dus
`labelKlantnr` komt in `nl`, `en`, `de` en `fr`.

| Sleutel                    | Namespace | Nederlands  |
| -------------------------- | --------- | ----------- |
| `klantenColKlantnr`        | `beheer`  | Klantnr.    |
| `labelKlantnr`             | account   | Klantnummer |

Voor `en`/`de`/`fr`: "Customer number", "Kundennummer", "Numéro client".

## Tests

- `tests/app/api/klanten.test.ts` — goedkeuring kent een klantnummer toe in het
  `KL-XXXXX`-formaat en geeft het terug in de respons; een tweede goedkeuring
  van dezelfde klant houdt hetzelfde nummer; een PATCH zonder
  `status: 'Goedgekeurd'` kent geen nummer toe; een afwijzing kent geen nummer
  toe. Verwachte nummers worden berekend relatief aan de actuele stand van
  `counters.klantnummer` — die rij wordt **nooit** gereset, conform de
  projectregel. Cleanup blijft gescoped op de aangemaakte `@example.com`-rijen.
- `tests/app/api/klanten-me.test.ts` — `GET` geeft `klantnr` terug; een `PATCH`
  met `klantnr` in de body wordt genegeerd (allowlist).
- `tests/lib/buildDrukkerMail.test.ts` — klant-sectiekop bevat
  `Bedrijfsnaam (KL-XXXXX)` in tekst en HTML; zonder `klantnr` blijft de kop
  ongewijzigd; een ontbrekend `klantnr` verschijnt niet in
  `ontbrekendeKlantVelden` en blokkeert het versturen niet.
- `tests/components/beheer/KlantenSection.test.tsx` — de klantnr-kolom staat er
  en toont de waarde; leeg voor een klant zonder nummer.
- `tests/components/beheer/KlantModal.test.tsx` — nummer in de kop wanneer
  aanwezig, afwezig wanneer leeg; na goedkeuren komt het nummer uit de respons
  in beeld; de `klant_goedgekeurd`-logregel bevat `Bedrijfsnaam (KL-XXXXX)`.
- `tests/components/account/SettingsSection.test.tsx` — het klantnummer wordt
  als leesregel getoond en is geen invoerveld.

## Wat dit ontwerp bewust niet doet

- **Geen `UNIQUE`-index op `klantnr`** — zie A.
- **Geen handmatig bewerkbaar klantnummer.** Overwogen (aansluiten op een
  bestaand boekhoudpakket), maar er is nu geen extern systeem om op aan te
  sluiten, en een bewerkbaar veld zou de uniciteitsgarantie van de teller
  ondergraven. Komt dat er ooit, dan is dit alsnog additief toe te voegen.
- **Geen nummer voor klanten met status `Beoordelen` of `Afgewezen`**, en geen
  toekenning achteraf als een afgewezen klant nooit alsnog wordt goedgekeurd.
- **Geen klantnummer in de bestelbevestigingsmail of op de bestelling zelf.**
  Buiten scope; de bestelling verwijst al via `klantId` naar de klant.
- **Geen productie-migratie als onderdeel van de implementatie.** Die wordt,
  zoals altijd, apart met expliciete toestemming uitgevoerd, ná verificatie op
  staging.
