# Melding aan de klant bij een uitgegeven wachtwoord — ontwerp

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 10-08-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

Datum: 2026-08-10
Status: ontwerp, goedgekeurd voor implementatie

## Aanleiding

`POST /api/klanten/[id]/wachtwoord` laat een medewerker telefonisch een nieuw
wachtwoord uitgeven aan een klant die niet meer bij zijn e-mail kan
([ontwerp](2026-08-10-wachtwoord-uitgeven-design.md)). De eindreview van dat werk
merkte op dat er daarmee een herstelroute bijkomt zonder enige controle op wie er
belt, en zonder enig signaal naar de rechtmatige eigenaar van het account.

Het uitgangspunt van die route is dat de klant niet bij zijn mailbox kan. Maar
"ik kan niet bij mijn mail" is een bewering van degene aan de telefoon, en het is
precies de bewering die iemand doet die zich voor een ander uitgeeft. Slaagt dat,
dan merkt de echte klant alleen dat zijn sessies eruit liggen — een symptoom dat
zich net zo goed laat verklaren als een storing.

Eén mail sluit dat gat grotendeels: hij bereikt de mailbox van de rechtmatige
eigenaar, ook wanneer de beller die mailbox niet kan lezen. Dat de echte klant
hem misschien pas later ziet is geen bezwaar — later is oneindig veel eerder dan
nooit.

## Wat er verstuurd wordt

Een platte-tekstmail in het Nederlands, met "je" als aanspreekvorm — dezelfde
vorm als `sendResetEmail.ts`. Er is geen taalkolom op `klanten` en de resetmail is
ook Nederlands, dus dit wijkt niet af van wat klanten al krijgen.

**Onderwerp:** `Nieuw wachtwoord ingesteld — Glassart & Design`

```
Een medewerker van Glassart & Design heeft zojuist een nieuw wachtwoord voor je
account ingesteld, op jouw verzoek per telefoon. Je hebt het wachtwoord
telefonisch doorgekregen.

Je bent hierbij overal uitgelogd, en eerder aangevraagde links om je wachtwoord
opnieuw in te stellen werken niet meer.

Heb je hier niet zelf om gevraagd? Neem dan direct contact met ons op -- dan
heeft iemand anders zich mogelijk voor je uitgegeven.
```

De laatste alinea is de reden dat deze mail bestaat. De twee daarboven staan er
zodat het bericht niet als phishing leest: een mail die alleen "er is iets met je
wachtwoord gebeurd" zegt, drijft mensen naar precies het gedrag dat we willen
voorkomen.

**Het wachtwoord staat er niet in.** Dat is telefonisch doorgegeven en gaat de
mail niet in — anders zou de mailbox die de klant naar eigen zeggen niet kan
bereiken alsnog het wachtwoord bevatten.

## Waar het in de route past

De helper komt in `src/lib/server/sendWachtwoordUitgegevenMail.ts`, naast
`sendResetEmail.ts` en in dezelfde vorm.

De route roept hem aan **na de commit en vóór de respons**. Twee regels die dat
vastleggen:

1. **Na de commit.** Een waarschuwing sturen over een wachtwoord dat uiteindelijk
   niet is opgeslagen, is erger dan geen waarschuwing: de klant gaat dan op zoek
   naar een inbraak die niet heeft plaatsgevonden.
2. **Nooit fataal.** Een mislukte verzending mag het uitgeven niet alsnog laten
   falen. Het wachtwoord staat op dat moment al vast, de beheerder heeft de klant
   aan de lijn en heeft het nodig. `verstuurMail()` past daar vanzelf op: die
   gooit niet, maar geeft `false` terug (`src/lib/server/mailRelay.ts`).

De ontvanger wordt in de route bepaald, uit de klantrij die er al is opgehaald —
nooit uit de request. Dat is dezelfde regel die `/api/mail` hanteert en de reden
dat de mailrelay geen open relay meer is.

De logregel in `activiteitenlog` blijft ongewijzigd: die wordt binnen de
transactie geschreven en de mail gaat er pas ná de commit uit, dus of de mail
aankwam kan er per definitie niet in staan. De activiteit die gelogd hoort te
worden is het uitgeven van het wachtwoord, niet het bezorgen van een bericht.

## Wat de beheerder ziet

De respons wordt `{ wachtwoord, mail }`, met `mail` als `'verstuurd' | 'mislukt'`.

Onder het wachtwoord komt één regel, in de stijl van de bestaande uitleg: het
adres waar het bericht heen ging, of dat het versturen mislukte. Twee nieuwe
teksten in de `beheer`-namespace, Nederlands-only zoals de rest daar.

Altijd melden, ook bij succes — niet alleen bij een fout. De beheerder heeft de
klant aan de lijn en kan het gewoon zeggen ("je krijgt er ook een mailtje over"),
en bij een mislukking kan hij het adres controleren terwijl hij die persoon toch
spreekt. Stilte bij succes zou betekenen dat stilte twee dingen kan betekenen.

## Verworpen alternatieven

**Een derde toestand `'geen-adres'`.** Stond in het eerste ontwerp, voor een klant
zonder e-mailadres. Vervallen: `klanten.email` is `NOT NULL UNIQUE` en alle
klanten op staging hebben een adres, dus alleen een lege string zou die tak
bereiken — en dan mislukt de verzending toch al en is `'mislukt'` het eerlijke
antwoord. Een tak die niet bereikt kan worden, kan ook niet getest worden.

**Niets tonen aan de beheerder, of alleen bij een fout.** Zie hierboven.

**`contactPreference` respecteren.** Dat veld legt vast of een klant liever
gebeld of gemaild wordt. Het gaat over bestellingen; een beveiligingsmelding
hoort altijd te gaan, ongeacht die voorkeur.

**De mail in de transactie meenemen.** Dan zou een haperende mailrelay het
uitgeven van het wachtwoord terugdraaien terwijl de beheerder het al voorgelezen
heeft. Precies verkeerd om.

**Verificatie van de beller vóór het uitgeven** (een controlevraag, een
terugbelprocedure). Dat is een werkafspraak, geen software, en het valt buiten
wat hier gebouwd wordt. Deze mail is de vangnetmaatregel eronder, niet de
vervanging ervan.

## Testen

De routetest **mockt de mailmodule.** De suite mag nooit echt mail versturen; zo
doet `tests/app/api/auth/reset-password.test.ts` het ook.

- De mail gaat naar het e-mailadres uit de klantrij, niet naar iets uit de request.
- Een mislukte verzending (`verstuurMail` geeft `false`) levert nog steeds een
  `200` met een bruikbaar wachtwoord op, en `mail: 'mislukt'`.
- Het uitgegeven wachtwoord komt in geen enkel veld van het bericht voor.

Plus een component-test voor de twee meldingen onder het wachtwoord.

De bestaande tests van deze route blijven ongewijzigd gelden: de vier mutaties in
één transactie, de opruiming van sessies en resettokens, en de logregel zonder
wachtwoord.

## Migraties

Geen. Dit raakt het databaseschema niet.
