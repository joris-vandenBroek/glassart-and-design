# Btw per land op bestellingen

Datum: 2026-08-04
Auteur: Joris van den Broek (met Claude)
Status: Approved — klaar voor implementatieplan

## Aanleiding

Direct na de bol.com-stijl redesign van het besteloverzicht (zie `2026-08-04-bestelling-overzicht-bolcom-stijl-design.md`, geeft nu een "Totaal excl. btw" in de popup-header) vroeg de klant om dat totaal uit te breiden met een echte btw-berekening: percentage, btw-bedrag en totaal incl. btw, met het tarief bepaald per land van de klant, beheerd via een nieuwe instelling.

## Scope

**Wel:**
- Twee nieuwe kolommen op `klanten`: `land` (hoofdadres) en `invoiceLand` (factuuradres, alleen relevant bij een afwijkend factuuradres).
- Een nieuwe landen-lijst (`src/data/landen.ts`) en het hergebruiken van de bestaande `Combobox`-component voor land-selectie.
- Land-veld op: registratieformulier, klant-zelfbediening (Instellingen op de accountpagina), en de beheer-`KlantModal` (zowel hoofdadres als factuuradres-blok).
- Een nieuw "Btw-tarieven"-blok op het bestaande beheer-Instellingen-scherm (`InstellingenSection.tsx`, naast het bestaande "Minimale afname"-veld): een beheerbare lijst van land+tarief, plus één standaardtarief.
- Btw-uitsplitsing (percentage, btw-bedrag, totaal incl. btw) in de header van zowel `AccountOrderModal.tsx` als `BestellingModal.tsx`, onder het bestaande "Totaal excl. btw".
- Migratie: bestaande klanten krijgen `land = 'NL'` (alle 6 huidige klanten zijn Nederlandse bedrijven).

**Niet:**
- Geen btw-uitsplitsing per regel — alleen op het bestelling-totaal (in de header), zoals nu al voor "Totaal excl. btw" geldt.
- Geen historische vastlegging van het gebruikte tarief per bestelling — het tarief wordt altijd live berekend op basis van het HUIDIGE land van de klant. Wijzigt het land van een klant later, dan verandert daarmee ook de getoonde btw op oudere bestellingen. Bewust gekozen voor eenvoud; geen wijziging aan `bestelheaders`/`bestellines`.
- Geen reverse-charge/intra-EU-B2B-uitzondering — elk land krijgt gewoon het ingestelde tarief, ongeacht btw-nummer van de klant.
- Geen wijziging aan de bestaande adres-optioneel-conventie: `land` volgt exact hoe `address`/`postcode`/`city` vandaag werken (verplicht bij registratie, zelf te wijzigen via de accountpagina, ook aanpasbaar door staff); `invoiceLand` volgt exact hoe `invoiceAddress`/`invoicePostcode`/`invoiceCity` vandaag werken (optioneel, alleen bij een afwijkend factuuradres, alleen door staff te wijzigen via `KlantModal`, leeg betekent "gebruik het hoofdadres-land").

## A. Datamodel

`db/schema.sql`, `CREATE TABLE klanten`, twee nieuwe nullable kolommen naast de bestaande adresvelden:

```sql
land VARCHAR(2),
invoiceLand VARCHAR(2),
```

Migratie op de staging-database (en, na expliciete toestemming per de bestaande hard rule in `CLAUDE.md`, later ook op productie):

```sql
ALTER TABLE klanten ADD COLUMN land VARCHAR(2), ADD COLUMN invoiceLand VARCHAR(2);
UPDATE klanten SET land = 'NL' WHERE land IS NULL;
```

Waarden zijn ISO 3166-1 alpha-2 codes (`"NL"`, `"DE"`, ...), zodat klant-land en btw-tarieven-land altijd exact matchen (zie C).

## B. Landen-lijst en Land-veld in de UI

`src/data/landen.ts` (nieuw): een vaste lijst van alle ISO 3166-1 landen als `{ code: string; naam: string }[]`, Nederland vooraan. Wordt omgezet naar `ComboboxOption[]` (`{ value: code, label: naam }`) waar nodig — zowel voor het klant-Land-veld als voor de rijen in het beheer-btw-tarieven-blok, zodat beide dezelfde bron gebruiken en nooit uit de pas kunnen lopen.

Land-veld (hergebruikt de bestaande `Combobox`-component, typen-om-te-filteren) komt op:
- **`RegistrationForm.tsx`**: in het hoofdadres-blok, verplicht, standaard op `NL` geselecteerd — naast de bestaande verplichte `address`/`postcode`/`city`. In het factuuradres-blok (alleen zichtbaar als "afwijkend factuuradres" is aangevinkt): een `invoiceLand`-Combobox, niet verplicht — zelfde optionele status als `invoiceAddress`/`invoicePostcode`/`invoiceCity`.
- **`SettingsSection.tsx`** (klant-zelfbediening op de accountpagina): `land` toegevoegd aan `KlantProfile` en aan de formuliervelden, naast het al bestaande `address`/`postcode`/`city`-blok — een klant kan zijn eigen hoofdadres-land dus later nog aanpassen, precies zoals nu al met adres/postcode/plaats kan. **Geen** `invoiceLand` hier — factuuradres blijft, zoals nu al, uitsluitend door staff te wijzigen.
- **`KlantModal.tsx`** (beheer): `land`-Combobox bij het hoofdadres-blok, `invoiceLand`-Combobox bij het bestaande factuuradres-blok (dezelfde `fields.invoiceAddress === ''`-conditie/"gebruikt standaardadres"-melding blijft gelden voor het hele factuuradres-blok inclusief het nieuwe land-veld).
- **`src/lib/server/klantFields.ts`**: `land` en `invoiceLand` toegevoegd aan `SELF_EDITABLE_KLANT_FIELDS` (nodig voor zowel `POST /api/auth/register` als `PATCH /api/klanten/me`, dezelfde route die `SettingsSection.tsx` al gebruikt voor adres/postcode/plaats).

## C. Btw-tarieven-instelling

Nieuwe rij in de bestaande generieke `instellingen`-tabel, id `"btwtarieven"`:

```ts
export interface BtwTarief {
  land: string; // ISO alpha-2 code, matcht klanten.land / klanten.invoiceLand
  percentage: number; // bv. 21 voor 21%
}
export interface BtwTarieven {
  tarieven: BtwTarief[];
  standaardPercentage: number; // fallback wanneer het land van de klant ontbreekt of niet in `tarieven` voorkomt
}
```

Seed (`src/data/btwTarievenSeed.ts`): `{ tarieven: [{ land: 'NL', percentage: 21 }], standaardPercentage: 21 }`.

UI: geen nieuw nav-item. Het bestaande beheer-"Instellingen"-scherm (`InstellingenSection.tsx`, huidige inhoud: alleen het "Minimale afname"-veld) krijgt een tweede blok eronder: een beheerbare lijst — per rij een Land-Combobox + percentage-`<input type="number">` + verwijder-knop, een "Land toevoegen"-knop eronder, en een los "Standaardtarief"-invoerveld. Blijft, net als het bestaande "Minimale afname"-veld, onder één "Opslaan"-knop voor het hele scherm (geen los opslaan per rij) — dit blok wordt een tweede `useApiRecord('instellingen', 'btwtarieven', ...)`-call naast de al bestaande `bestelinstellingen`-call, beide in `BeheerShell.tsx` en beide doorgegeven aan (een uitgebreide) `InstellingenSection`.

## D. Btw in de bestelling-header

Beide popups (`AccountOrderModal.tsx`, `BestellingModal.tsx`) berekenen, alleen wanneer het bestaande "Totaal excl. btw" een echt bedrag is (dus niet de "Wordt nog vastgesteld"-placeholder — bij een onvolledige bestelling wordt er geen btw-bedrag gegokt):

```ts
const land = klant.invoiceLand || klant.land || null;
const tarief = land && btwTarieven.tarieven.find(t => t.land === land);
const percentage = tarief ? tarief.percentage : btwTarieven.standaardPercentage;
const btwBedrag = totaalExclBtw * (percentage / 100);
const totaalInclBtw = totaalExclBtw + btwBedrag;
```

Weergave: drie losse regels onder het bestaande "Totaal excl. btw"-bedrag, elk een eigen klein label + bedrag (zelfde stijl als het bestaande totaal-blokje): "Btw (`{percentage}`%)" met `btwBedrag`, en "Totaal incl. btw" met `totaalInclBtw` (vetgedrukt, als sluitstuk). Alle vier bedragen (excl., btw, incl., en de al bestaande subtotaal-per-regel elders in de popup) worden rechts uitgelijnd binnen het totaal-blokje met `tabular-nums` (of een vaste breedte), zodat de decimalen/centen van de vier regels netjes onder elkaar staan in plaats van los te zweven — dit is nieuw ten opzichte van het huidige enkele-regel totaal-blokje.

Databehoefte per popup:
- **`BestellingModal.tsx`** (beheer): krijgt een nieuwe `klanten: Klant[] | null`-prop (net als `BestellingenSection.tsx` die al doorgeeft aan `VersturenNaarDrukkerDialog`), zoekt de bijbehorende klant op via `bestelling.klantId`. Krijgt ook een nieuwe `btwTarieven`-prop, gevoed vanuit `BeheerShell.tsx`'s nieuwe `useApiRecord('instellingen', 'btwtarieven', ...)`-call (via `BestellingenSection.tsx`).
- **`AccountOrderModal.tsx`** (klant): de klant bekijkt alleen zijn eigen bestellingen, dus geen klant-lijst nodig — een kleine, nieuwe read-only fetch van de eigen `land`/`invoiceLand` (uitbreiding van het bestaande `/api/klanten/me`-patroon dat `SettingsSection.tsx` al gebruikt, want die endpoint filtert vandaag expliciet alles behalve de 7 al-gebruikte velden eruit). `btwTarieven` wordt met een read-only `useApiRecord('instellingen', 'btwtarieven', ...)`-call in `OrdersSection.tsx` opgehaald en doorgegeven aan `AccountOrderModal.tsx` (dezelfde route staat lezen zonder staff-rechten toe, alleen `PATCH` is `requireMedewerker`-gated).

## i18n

Nieuwe sleutels nodig in `accountPage` (alle 4 locales) voor: het Land-veld label (registratie + accountpagina-instellingen), en de btw-percentage/btw-bedrag/totaal-incl.-labels in de popup-header.
Nieuwe sleutels nodig in `beheer` (`nl.json` alleen): het Land/factuurland-veld-label in `KlantModal`, en alle labels voor het nieuwe btw-tarieven-blok (kolomkoppen, "Land toevoegen", "Standaardtarief", verwijder-knop) in `InstellingenSection.tsx`, plus de btw-labels in `BestellingModal.tsx`'s header.

## Niet in scope (samenvatting)

- Btw per regel (alleen op het bestelling-totaal).
- Historisch vastgelegd tarief per bestelling (altijd live berekend uit het huidige klant-land).
- Reverse-charge / intra-EU-B2B-vrijstelling.
- Nieuw nav-item (btw-tarieven leeft op het bestaande Instellingen-scherm).
