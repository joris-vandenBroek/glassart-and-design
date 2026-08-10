# Wachtwoord vergeten en wachtwoord uitgeven — ontwerp

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 10-08-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

Datum: 2026-08-10
Status: ontwerp, goedgekeurd voor implementatie

## Aanleiding

Een klant belt de beheerder omdat hij zijn wachtwoord kwijt is. De beheerder kan op dit
moment niets doen: er is geen enkele knop in beheer die iets met het wachtwoord van een
klant kan.

Bij het uitzoeken bleek de onderliggende oorzaak groter dan het telefoontje. De
resetmachinerie is compleet en werkt — `POST /api/auth/reset-password/request` accepteert
al `userType: 'klant' | 'medewerker'`, mailt een link die 24 uur geldig is, en
`/wachtwoord-resetten` plus `POST /api/auth/reset-password/confirm` zetten het nieuwe
wachtwoord, ruimen alle openstaande tokens op en verwijderen alle sessies. Alleen: de
klant heeft nooit een ingang naar die flow gekregen.

## Uitgangssituatie in de code

| Plek | Wachtwoord vergeten | Wachtwoord wijzigen |
|---|---|---|
| Klant-inlog `/inloggen` (`CustomerLoginForm.tsx`) | ontbreekt | n.v.t. |
| Beheer-inlog (`AdminLoginForm.tsx`, regel 99) | aanwezig, stuurt resetmail | n.v.t. |
| Klant ingelogd (`account/SettingsSection.tsx`, regel 371) | n.v.t. | aanwezig |
| Beheer ingelogd | n.v.t. | ontbreekt, geen medewerker-profielscherm |
| Beheer → klant bewerken (`KlantModal.tsx`) | ontbreekt | ontbreekt |

Verder van belang voor dit ontwerp:

- `sendResetEmail.ts` regel 4 zet altijd `/nl/wachtwoord-resetten` in de link, ongeacht de
  taal van de gebruiker.
- `POST /api/auth/reset-password/request` antwoordt bewust altijd `ok: true`, ook bij een
  onbekend e-mailadres, zodat niemand kan uitvissen welke adressen een account hebben.
- `KlantModal.tsx` is 643 regels.
- `logActiviteit()` is een fire-and-forget `fetch()` vanuit de browser; een mislukte
  schrijfactie verdwijnt geruisloos (`logActiviteit.ts` regel 91).
- `TABLE_COLUMNS.klanten` bevat `wachtwoordHash`, en `PATCH /api/klanten/[id]` geeft de
  request-body ongefilterd door aan `updateRow`.

## Rolverdeling

Twee routes naar een nieuw wachtwoord, met een scherpe grens ertussen:

- **De klant kan bij zijn mail** → hij klikt zelf "wachtwoord vergeten" op het inlogscherm
  en krijgt de bestaande resetlink. Beheer komt er niet aan te pas. Dit is de hoofdroute.
- **De klant kan niet bij zijn mail** (verkeerd adres, dood adres, mailbox onbereikbaar) →
  de beheerder geeft telefonisch een gegenereerd wachtwoord uit vanuit het klantdossier.
  Dit is de noodroute.

## Deel 1 — "Wachtwoord vergeten" op het klant-inlogscherm

In `CustomerLoginForm.tsx` komt onder de inlogknop een "Wachtwoord vergeten?"-knop, naar
het model van de beheer-variant: hij gebruikt het e-mailadres dat al in het veld staat,
vraagt erom als dat leeg is, en meldt daarna dat er een mail onderweg is.

Die bevestiging is **identiek voor een bestaand en een onbekend adres**. De API houdt die
anti-enumeratie al aan; het zou zinloos zijn om het aan de voorkant alsnog weg te geven.

Het formulier roept `/api/auth/reset-password/request` rechtstreeks aan, zoals login en
registratie dat ook doen. `useCustomerAuth` wordt niet uitgebreid.

Het e-mailadres gaat door dezelfde `completeerTestKlantEmail()` als bij het inloggen
(`CustomerLoginForm.tsx` regel 23). Zonder dat zou een testaccount als `test1` op staging
wél kunnen inloggen maar geen resetmail kunnen aanvragen — twee verschillende antwoorden
op de vraag wat het adres van deze klant is.

Drie nieuwe teksten in de `loginPage`-namespace, in **alle vier** de talen (`nl`, `en`,
`de`, `fr`) — anders dan de beheer-teksten, die alleen in `nl.json` bestaan.

### Locale in de resetlink

Meegenomen omdat het direct raakt aan wat hier gebouwd wordt: `sendResetEmail()` krijgt de
locale mee van de aanroeper, zodat een Duitse of Franse klant niet op een Nederlandse
resetpagina uitkomt. Zolang alleen medewerkers die knop hadden was de harde `/nl/` prima.

De client stuurt de locale mee in de request-body. De route **valideert** die tegen de
lijst uit `src/i18n/routing.ts` en valt terug op `nl` bij alles wat daar niet in staat.
Dat is geen formaliteit: die waarde belandt in een URL in een uitgaande e-mail, dus een
ongecontroleerde string uit de body is een injectiepunt in een bericht dat wij namens
onszelf versturen. Beheer stuurt niets mee en krijgt daarmee `nl`, wat klopt — de
beheeromgeving bestaat alleen in het Nederlands.

## Deel 2 — Nieuw wachtwoord uitgeven vanuit beheer

### Route

`POST /api/klanten/[id]/wachtwoord`, afgeschermd met `requireMedewerker` (anders 401; 404
bij een onbekende klant). De route doet vier dingen:

1. Genereert het wachtwoord **server-side** met `crypto.randomBytes`. Niet in de browser,
   en er gaat nooit een wachtwoord in plaintext naar de server toe — alleen ervandaan.
2. Hasht het met de bestaande `hashPassword()` en schrijft `wachtwoordHash` weg.
3. `destroySessionsForUser('klant', id)` — wie nog ergens ingelogd stond, ligt eruit.
4. Verwijdert openstaande `passwordResetTokens` van die klant. Anders blijft een eerder
   gemailde link nog 24 uur geldig náást het nieuwe wachtwoord.

De response bevat het wachtwoord **één keer**. Daarna is het nergens meer op te halen; er
staat alleen nog een hash.

Bewust een eigen route en niet `PATCH /api/klanten/[id]`: dat is de generieke
volledige-veldbewerking, en dit is een aparte handeling met eigen neveneffecten (stap 3
en 4) die je bij een gewone veldwijziging niet wilt.

### Vorm van het wachtwoord

Het wordt door de telefoon voorgelezen, dus de vorm is functioneel: 12 tekens uit een
alfabet **zonder** `0`, `O`, `1`, `l` en `I`, in blokjes van vier (`k7fp-r2mq-x4tz`). Dat
haalt "is dat een nul of een o?" uit het gesprek. Ruim boven de minimumlengte van 8 uit
`wachtwoordBeleid.ts`.

### UI

Een eigen component, `src/components/beheer/KlantWachtwoordSectie.tsx`, onderaan in
KlantModal gehangen — dat bestand is met 643 regels al te groot om er nog een blok bij te
krijgen. Drie stappen:

1. Knop "Nieuw wachtwoord uitgeven".
2. Bevestiging: *"Het huidige wachtwoord van deze klant vervalt en hij wordt overal
   uitgelogd."* Deze stap is er omdat de actie onomkeerbaar is en de klant buitensluit als
   je hem per ongeluk op het verkeerde dossier uitvoert.
3. Het wachtwoord verschijnt groot en in een monospace-lettertype, met een kopieerknop en
   de regel dat het na sluiten niet meer op te vragen is. Modal dicht = weg uit beeld.

### Logging

Nieuw type `klant_wachtwoord_uitgegeven` in `ACTIVITEIT_TYPES`, met bedrijfsnaam en
e-mailadres in de omschrijving — **nooit** het wachtwoord zelf.

Hier wijkt het ontwerp bewust af van de conventie in beheer. Overal elders wordt
`logActiviteit()` vanuit de browser aangeroepen, fire-and-forget, en een mislukte log
verdwijnt geruisloos. Voor precies deze handeling wil je die zekerheid wel, dus de
logregel wordt server-side in de route geschreven. Dat vraagt om het lostrekken van de
actor-bepaling uit `activiteitenlog/route.ts` regel 17 naar een gedeelde servermodule,
zodat beide routes dezelfde actor uit de sessiecookie afleiden.

## Verworpen alternatieven

**Een "stuur resetlink"-knop in beheer.** Stond aanvankelijk in het ontwerp als
hoofdroute. Vervallen zodra de klant het zelf kan: dan doet die knop niets wat de klant
niet zelf kan doen. Het enige geval dat hij uniek oploste — de klant typt een verkeerd
e-mailadres en ziet door de anti-enumeratie tóch "we hebben je een mail gestuurd" — lost
de beheerder net zo goed op door het echte adres voor te lezen, dat hij in het klantdossier
gewoon ziet staan.

**Verplicht wachtwoord wijzigen bij eerste login.** Zou een kolom op `klanten` kosten
(migratie + `db/schema.sql` + `tableColumns.ts`), een vlag in de login-response en een
blokkade op `/account`. Aanbevolen tijdens het ontwerp, omdat een telefonisch wachtwoord
per definitie een gedeeld geheim is: de beheerder kent het, en misschien de collega die
meeluisterde. Bewust niet gekozen — het wordt aan de klant zelf overgelaten. Gevolg dat
geaccepteerd is: een uitgegeven wachtwoord kan onbeperkt geldig blijven. Dít is de reden
dat het wachtwoord door het systeem gegenereerd wordt en niet door de beheerder getypt:
een gegenereerd wachtwoord dat blijft staan is prima, "Welkom123" dat blijft staan niet.

**Een eenmalige code in plaats van een wachtwoord.** De beheerder leest een korte code
voor, de klant vult die in op `/wachtwoord-resetten` en kiest zelf een wachtwoord.
Hergebruikt `passwordResetTokens`, dus geen kolom op `klanten`, en de klant kiest per
definitie zelf. Afgevallen omdat een code die je door de telefoon kunt voorlezen kort is,
en kort betekent raadbaar — dan wil je een korte geldigheidsduur en een pogingenlimiet
erbij, en bouw je een tweede halfslachtige resetflow naast de flow die er al is.

**De actie als knop in de klantenlijst.** Sneller, maar je ziet de klantgegevens er niet
bij. Tijdens dat telefoontje wil je juist controleren of je de juiste persoon aan de lijn
hebt, dus hoort de actie in het klantdossier.

## Buiten scope

- **Wachtwoord wijzigen voor medewerkers zelf.** Er is geen medewerker-profielscherm; een
  medewerker die zijn wachtwoord wil wijzigen moet nu de vergeten-knop op het inlogscherm
  gebruiken. Werkt, maar is een omweg. Eigen ronde waard.
- **`PATCH /api/klanten/[id]` filtert de body niet.** `wachtwoordHash` staat in
  `TABLE_COLUMNS.klanten`, dus een medewerker kan die kolom nu al rechtstreeks schrijven.
  Staff-only, dus geen lek, maar het staat naast de route die dit ontwerp toevoegt als
  de gesanctioneerde weg. Genoteerd, niet opgelost.

## Testen

De suite draait tegen de echte staging-database. Elke test maakt zijn eigen klant aan met
een `@example.com`-adres en ruimt in `afterEach` precies die rij op via het onthouden id —
geen kale `DELETE FROM`.

**`tests/app/api/klanten/wachtwoord.test.ts`** (nieuw):

- 401 zonder medewerkerssessie, 404 op een onbekende klant
- het teruggegeven wachtwoord werkt echt: inloggen via `/api/auth/login` met het oude
  wachtwoord faalt, met het nieuwe lukt het
- een vooraf aangemaakte sessie van die klant is daarna weg
- een vooraf aangemaakt `passwordResetTokens`-record van die klant is daarna weg
- er staat een `klant_wachtwoord_uitgegeven`-regel in het log, met de medewerker als
  actor en zonder het wachtwoord in de omschrijving

De laatste twee zijn de assertions die er het meest toe doen: het zijn de neveneffecten
die je stil kunt vergeten en die je pas mist als het misgaat.

**`tests/components/CustomerLoginForm.test.tsx`** (bestaat al, wordt uitgebreid): de
vergeten-knop post naar de juiste route met `userType: 'klant'`, een leeg e-mailveld
levert de "vul eerst je e-mailadres in"-melding, en de bevestiging is identiek voor een
bestaand en een onbekend adres.

**`tests/app/api/auth/reset-password.test.ts`** (bestaat al, wordt uitgebreid) dekt de
locale: een geldige locale uit de body komt terug in de aanroep van `sendResetEmail()`,
een onzinnige waarde en een ontbrekende waarde vallen allebei terug op `nl`. Dat kan daar
zonder echte mail te versturen, want dat bestand mockt `sendResetEmail` al (regel 7). De
rest van die route is er al gedekt en blijft ongemoeid.

**`tests/components/beheer/KlantWachtwoordSectie.test.tsx`** (nieuw): de bevestigingsstap
komt eerst en er gebeurt niets zolang je niet bevestigt, na bevestiging staat het
wachtwoord in beeld, en na sluiten is het weg.

**Unittest op de generator**: 12 tekens, geen `0`, `O`, `1`, `l` of `I`, en tweemaal
aanroepen geeft niet hetzelfde.

## Migraties

Geen. Dit ontwerp raakt het databaseschema niet — de enige tabellen die het gebruikt
(`klanten`, `sessions`, `passwordResetTokens`, `activiteitenlog`) bestaan al in hun
huidige vorm.
