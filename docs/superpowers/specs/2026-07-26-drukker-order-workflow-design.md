# Design: Bestelling → drukker workflow

## Context

Bestellingen worden nu beoordeeld door GAAD (`BestellingenSection`/`BestellingModal`,
statussen `'Te beoordelen' | 'Goedgekeurd' | 'Afgewezen'`). Dit deelproject voegt de
volgende stap toe: na goedkeuring moet een bestelling daadwerkelijk als order naar de
drukker verstuurd worden, per e-mail, met de klantgegevens en bestelde kunstwerken. Er
komt een nieuwe Drukker-tabel in Beheer, en verstuurde mails worden bewaard en zijn
terug te lezen per drukker.

Nog steeds Firestore/Firebase (de Firebase→MySQL-migratie uit
`docs/superpowers/specs/2026-07-23-firebase-to-mysql-migration-design.md` is nog niet
uitgevoerd) en nog steeds statische Next.js-export op GitHub Pages — mail-verzending
loopt daarom via een nieuw PHP-relay-endpoint op mijn.host, zelfde aanpak als
`mail-server/send-order-confirmation.php`.

## Sectie A: Status-workflow

`Bestelling.status` (`src/components/beheer/BestellingenSection.tsx`) wordt:

```
'Te beoordelen' | 'Te versturen naar drukker' | 'Verstuurd naar drukker' | 'Afgewezen'
```

`'Goedgekeurd'` vervalt. `BestellingModal.handleGoedkeuren` zet de status voortaan
direct op `'Te versturen naar drukker'` (zelfde knop, zelfde gating op ongeprijsde
regels — alleen de resulterende status verandert). `handleAfwijzen` blijft ongewijzigd.
`STATUS_BADGE_CLASS` en de vertaalsleutels (`messages/nl.json`, `beheer`-namespace)
worden bijgewerkt voor de twee nieuwe statuswaarden.

`BestellingenSection`'s `quickFilter` blijft de bestaande simpele schakelaar (één
actieve-status-link + "Alle bestellingen", per [[feedback_beheer_datatable_search_pattern]])
— de `activeValue` verandert van `'Te beoordelen'` naar `'Te versturen naar drukker'`,
met `defaultActive: false` zodat **"Alle bestellingen" de default-weergave blijft**.
`'Te beoordelen'` is dus niet meer als aparte quick-filter-link bereikbaar, wel via
"Alle bestellingen" + zoeken/sorteren op status.

Bestaande test-/voorbeelddata met status `'Goedgekeurd'` (indien aanwezig) wordt
handmatig aangepast in de Firebase-console — geen geautomatiseerde migratie, gezien de
verwaarloosbare hoeveelheid data.

## Sectie B: Bulk-selectie in DataTable

`src/components/DataTable.tsx` krijgt een generieke, optionele `selection`-capability
(zelfde soort losstaande, herbruikbare uitbreiding als `quickFilter`):

```ts
interface RowSelection<T> {
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
  isSelectable: (row: T) => boolean;
}
```

Als `selection` is meegegeven: een checkbox-kolom vooraan, alleen ingevuld/klikbaar op
rijen waar `isSelectable(row)` waar is (andere rijen: lege cel, geen checkbox). De
header-checkbox selecteert/deselecteert alle op dit moment zichtbare (na search/filter)
selecteerbare rijen.

`BestellingenSection` beheert de selectie-state zelf (`useState<Set<string>>`) en geeft
`isSelectable: (b) => b.status === 'Te versturen naar drukker'` mee — checkboxes
verschijnen dus altijd op rijen met die status, ongeacht welke quick-filter actief is.
Zodra `selectedIds.size > 0` verschijnt een balk boven de tabel: "N bestellingen
geselecteerd (M klanten) — **Versturen naar drukker**". Selectie wordt geleegd na een
geslaagde verzending, en (defensief) elke keer dat `bestellingen` van bovenaf wijzigt
met andere ids dan wat nog geselecteerd is.

## Sectie C: Versturen-naar-drukker dialoog

Nieuw component `src/components/beheer/VersturenNaarDrukkerDialog.tsx`, geopend vanuit
de selectie-balk. Ontvangt de geselecteerde `Bestelling[]`, de al-geladen `Klant[]`,
`Drukker[]`, en `kunstwerken`/`materialen`/`maten`/`materiaalsoorten` (dezelfde data die
`BestellingenSection` al doorkrijgt).

- Dropdown om de drukker te kiezen (voorgeselecteerd als er precies één is).
- **Volledige preview van de te versturen e-mailtekst** (onderwerp + body), opgebouwd
  door een pure functie `buildDrukkerMail(bestellingen, klanten, kunstwerken,
  materialen, maten, materiaalsoorten)` — dezelfde functie/waarde wordt gebruikt voor de
  preview én voor de daadwerkelijke verzending, zodat preview en verzonden mail nooit
  uit elkaar kunnen lopen.
- Samenvatting: aantal bestellingen / aantal klanten.
- **Versturen** / **Annuleren**.

Mail-opbouw per klant-sectie (gegroepeerd, één sectie per klant, in één mail):

```
Onderwerp: Nieuwe order(s) voor de drukker – <datum>

== <Bedrijfsnaam klant A> ==
Afleveradres: <deliveryAddress/deliveryPostcode/deliveryCity, of anders
               address/postcode/city als delivery-velden leeg zijn>
- <kunstwerk.omschrijvingNl> — <materiaaldikte>mm <materiaalsoort> — <omschrijving materiaal>,
  maat <breedte>×<hoogte> cm<formaatSuffix>, aantal <quantity>
- ...

== <Bedrijfsnaam klant B> ==
...
```

(Zelfde materiaal-notatie als nu al gebruikt in `BestellingModal`, bv. "6mm Glas —
helder". `<formaatSuffix>` is ` (Liggend)` / ` (Staand)` als het kunstwerk dat formaat heeft, en leeg
bij `vierkant` of een nog niet ingesteld formaat — zie
`docs/superpowers/specs/2026-07-26-kunstwerk-formaat-design.md` Sectie D voor de volledige
`formaatSuffix`-logica en herkomst van `kunstwerk.formaat`.)

**Versturen**-knop-flow:
1. POST naar `mail-server/send-drukker-order.php` met `{ secret, to: drukker.email,
   subject, body }` — **awaited**, niet fire-and-forget (in tegenstelling tot de
   order-bevestigingsmail: dit is een primaire bedrijfsactie, geen klant-nicety). Bij
   falen: foutmelding in de dialoog, niets anders gebeurt.
2. Bij succes: `updateDoc` per geselecteerde bestelling naar status `'Verstuurd naar
   drukker'`, `addDoc` in `drukkers/{drukkerId}/zendingen` (zie Sectie D), activiteit
   loggen (Sectie F), dialoog sluiten, selectie legen, lokale state bijwerken via een
   nieuwe `onBestellingenVerstuurd(updated: Bestelling[])`-prop (zelfde patroon als het
   bestaande enkelvoudige `onBestellingUpdated`, nu voor de hele batch).

## Sectie D: Nieuwe tabel Drukkers + e-mailarchief

Nieuwe Firestore-collectie `drukkers`:

```ts
interface Drukker {
  id: string;
  naam: string;
  adres: string;
  postcode: string;
  plaats: string;
  email: string;
  prijsafspraken: string; // vrije tekst
}
```

Nieuw bestand `src/components/beheer/DrukkersSection.tsx`: zelfde opbouw als
`PrijsgroepenSection.tsx`/`MateriaalsoortenSection.tsx` (`DataTable` met kolommen
naam/plaats/e-mail, geen quickFilter, add/edit/verwijderen via `useFirestoreCollection
<Drukker>('drukkers')` in `BeheerShell.tsx`). Nieuw `DrukkerModal.tsx` met hetzelfde
bewerk-gating-patroon (Bewerken-knop, velden read-only totdat je op Bewerken klikt) als
`KlantModal`/`KunstwerkModal`.

**Verzonden mails** (`drukkers/{drukkerId}/zendingen`, subcollectie — zelfde patroon als
`bestelheaders/{id}/bestellines`):

```ts
interface DrukkerZending {
  id: string;
  verzondenOp: Timestamp;
  onderwerp: string;
  body: string; // exacte verzonden tekst
  bestellingIds: string[];
  aantalKlanten: number;
  aantalRegels: number;
  verzondDoor: string; // naam/e-mail medewerker
}
```

`DrukkerModal` haalt de zendingen van de geopende drukker lazy op (`getDocs` op de
subcollectie, `orderBy('verzondenOp', 'desc')`) zodra de modal opent, en toont ze als
lijst (datum, aantal klanten/regels) met een inline uitklap-toggle om de volledige
verzonden tekst te lezen — geen aparte geneste modal.

**Verwijder-bescherming**: een drukker met ≥1 zending kan niet verwijderd worden (zelfde
patroon als de bestaande delete-guards op Materialen/Maten/Materiaalsoorten/
Prijsgroepen) — geen write, geen `drukker_verwijderd`-log, nieuwe foutmelding
`drukkersVerwijderBlocked`.

`BeheerNav.tsx`: nieuw item `'drukkers'` (labelKey `navDrukkers`) toegevoegd aan
`ACTIVE_ITEMS`, met teller (totaal aantal drukkers, zelfde stijl als
Segmenten/Kunstwerken/Prijsgroepen — geen "openstaand"-filtering).

## Sectie E: Klant — afleveradres én factuuradres zichtbaar/bewerkbaar in Beheer

`RegistrationForm.tsx` schrijft al sinds de registratiefunctionaliteit
`deliveryAddress`/`deliveryPostcode`/`deliveryCity` en
`invoiceAddress`/`invoicePostcode`/`invoiceCity` naar het `klanten`-document, maar
`KlantenSection.tsx`'s `Klant`-interface en `KlantModal.tsx` kennen deze velden nog
niet — nergens in Beheer zichtbaar of bewerkbaar.

- `Klant`-interface (`KlantenSection.tsx`) uitgebreid met de 6 velden (alle
  `string`, lege string toegestaan).
- `KlantModal.tsx`: twee nieuwe, optionele blokken naast het bestaande adres-blok —
  "Afleveradres" en "Factuuradres" — elk met dezelfde 3 velden (adres/postcode/plaats),
  bewerkbaar via hetzelfde Bewerken/Opslaan/Annuleren-patroon als de rest van de modal.
  Als een blok leeg is: label "Gebruikt standaardadres" in plaats van lege velden
  (alleen in read-only weergave; bij Bewerken gewoon lege inputs).
- Factuuradres wordt in dit deelproject **alleen zichtbaar/bewerkbaar gemaakt** — er is
  nog geen functionaliteit (facturen zijn immers on hold, zie
  [[project_b2b_beheeromgeving_roadmap]]) die het gebruikt. Afleveradres wordt wél
  gebruikt, in de drukkermail (Sectie C), met terugval op het standaardadres als leeg.

## Sectie F: Activiteitenlog

Nieuwe `ActiviteitType`-waarden (`src/lib/logActiviteit.ts`), zelfde patroon als
bestaande CRUD/status-events:

- `bestelling_verstuurd_naar_drukker` — gelogd in `VersturenNaarDrukkerDialog.tsx` ná
  succesvolle verzending + statuswijziging, met `actorFromMedewerker(user)`.
- `drukker_toegevoegd` / `drukker_gewijzigd` / `drukker_verwijderd` — gelogd in
  `DrukkersSection.tsx`, zelfde patroon als `prijsgroep_toegevoegd`/etc.

Elk nieuw type krijgt een entry in `firestore.rules`' `type in [...]`-lijst, in
`TYPE_LABEL_KEYS` (`ActiviteitSection.tsx`), en een vertaalsleutel in `messages/nl.json`.

## Sectie G: E-mail-relay endpoint (hergebruikt, niet gedupliceerd)

`mail-server/send-order-confirmation.php` is or al generiek: het endpoint neemt
`{ secret, to, subject, body }` aan en bevat niets order-specifieks, en de frontend
leest de URL nu al uit een generiek genoemde env var
(`NEXT_PUBLIC_MAIL_ENDPOINT_URL`). In plaats van een tweede, bijna-identiek PHP-bestand
te maken:

- Het bestand wordt **hernoemd** naar `mail-server/send-mail.php` (pure rename, geen
  logica-wijziging — zelfde shared-secret-check, zelfde PHPMailer-opzet inclusief
  `$mail->CharSet = PHPMailer::CHARSET_UTF8;`, zie
  [[feedback_phpmailer_utf8_charset]], plain text `isHTML(false)`).
- `CartPanel.tsx`'s bestaande order-bevestigingsmail-aanroep blijft ongewijzigd in code
  (leest nog steeds `NEXT_PUBLIC_MAIL_ENDPOINT_URL`), maar die env var (GitHub repo
  variable) wijst na de rename naar de nieuwe bestandsnaam.
- `VersturenNaarDrukkerDialog.tsx` gebruikt exact dezelfde env vars
  (`NEXT_PUBLIC_MAIL_ENDPOINT_URL` + `NEXT_PUBLIC_MAIL_SECRET`) — geen nieuwe
  configuratie nodig.
- Enige gedrags-verschil tussen de twee aanroepen zit puur aan de frontend-kant: de
  order-bevestiging blijft fire-and-forget, de drukker-mail wordt **awaited** met een
  zichtbare foutmelding bij falen (zie Sectie C) — het PHP-endpoint zelf maakt geen
  onderscheid tussen de twee aanroepers.

**Handmatige deploy-stap** (buiten deze codebase): op mijn.host moet het live bestand
`mail-server/send-order-confirmation.php` hernoemd/vervangen worden door
`send-mail.php`, en de GitHub repo variable `NEXT_PUBLIC_MAIL_ENDPOINT_URL`
bijgewerkt — zelfde soort handmatige stap als eerdere mijn.host-wijzigingen. Tot die
stap is uitgevoerd blijft de live order-bevestigingsmail werken op de oude URL; de
rename moet in dezelfde deploy landen als deze feature om geen downtime te
veroorzaken.

## Foutafhandeling

- Mail-endpoint onbereikbaar/fout → foutmelding in `VersturenNaarDrukkerDialog`, geen
  statuswijziging, geen zending-record, geselecteerde bestellingen blijven
  geselecteerd zodat de gebruiker het opnieuw kan proberen.
- Firestore-writes (statusupdates / zending-record) na een geslaagde mail die alsnog
  falen: zelfde generieke foutmelding-patroon als elders in Beheer
  (`bestellingenActionError`-stijl) — de mail is dan al verstuurd, dus de foutmelding
  waarschuwt expliciet dat de mail wél is verzonden maar de status niet is bijgewerkt,
  zodat een medewerker het niet per ongeluk dubbel verstuurt.
- Drukker-verwijdering met bestaande zendingen: geblokkeerd vóór er iets gebeurt (zie
  Sectie D), geen Firestore-call.

## Niet in scope

- Meerdere drukkers per bestelling / per kunstwerk (er is precies één drukker-keuze per
  verzendactie).
- Facturatie op basis van het factuuradres (het veld wordt alleen zichtbaar/bewerkbaar
  gemaakt, niet gebruikt — facturen staan on hold).
- Automatische her-verzending of retry-logica bij een mislukte mail.
- Wijzigen van de statusnaam/-lijst verder dan de 4 hier genoemde waarden (extra
  toekomstige statussen, zoals genoemd in het originele verzoek, zijn een latere
  uitbreiding — de simpele quickFilter-schakelaar blijft voor nu bewust behouden i.p.v.
  een volwaardige status-dropdown, per [[feedback_beheer_datatable_search_pattern]]).
