# Design: Bevestigingsmail bij bestelling via mijn.host SMTP

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 21-07-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

## Context

Sinds "Bestelling afronden" toont de klant al een in-app bevestiging, maar er gaat geen e-mail uit. Firebase Cloud Functions (de voor de hand liggende manier om dit vanuit Firebase te doen) vereisen het Blaze-abonnement, omdat het Spark-plan geen uitgaand netwerkverkeer naar niet-Google-servers toestaat — dat geldt ongeacht of de SMTP-gegevens correct zijn. In plaats daarvan gebruiken we de webhosting die de klant al heeft: mijn.host (Hostingpakket Basis, bevestigd: PHP + FTP/SFTP inbegrepen, geen Blaze nodig).

Belangrijk: een browser kan nooit rechtstreeks een SMTP-verbinding maken (dat is een raw TCP-protocol, browsers staan dit principieel niet toe aan JavaScript). Er moet dus altijd server-side code tussen zitten. Die server-side code komt hier op mijn.host's eigen webruimte te staan, niet bij Firebase — de site zelf blijft static-export op GitHub Pages; de browser doet gewoon een gewone HTTPS-aanroep naar het scriptje op een ander domein (mijn.host), wat prima werkt zolang het scriptje de juiste CORS-headers meestuurt. Dit is geen tijdelijke test-opzet maar een volwaardige productie-aanpak; de eventuele latere verhuizing van de hele site naar mijn.host staat hier volledig los van.

## Doel

Zodra een klant een bestelling afrondt, ontvangt die klant een bevestigingsmail in dezelfde taal als de site op dat moment, verstuurd via mijn.host's SMTP-server. Het mislukken van de mail mag de bestelling zelf nooit beïnvloeden — de klant heeft de bestelling al geplaatst zodra Firestore de schrijfactie bevestigt.

## 1. PHP-scriptje (te uploaden naar mijn.host)

Nieuw, zelfstandig bestand in de repo (getrackt in git, maar **niet** onderdeel van de Next.js-build — dit is een los stukje source dat de klant zelf via FTP/DirectAdmin naar zijn mijn.host-webruimte uploadt, vergelijkbaar met hoe `firestore.rules` wél in git staat maar apart gedeployed wordt): `mail-server/send-order-confirmation.php`, plus de meegeleverde PHPMailer-bronbestanden (`mail-server/PHPMailer/PHPMailer.php`, `SMTP.php`, `Exception.php` — de officiële, ongewijzigde bestanden, geen Composer nodig omdat mijn.host's Basis-pakket geen garantie geeft op Composer-CLI-toegang via alleen FTP).

**Waarom PHPMailer en niet een handgeschreven SMTP-client:** STARTTLS-onderhandeling, AUTH LOGIN/base64-uitwisseling en multiline server-responses correct afhandelen is foutgevoelig om vanaf nul te bouwen; PHPMailer is de gangbare, beproefde standaard hiervoor.

**Gedrag van het script:**
- Accepteert alleen `POST`-requests met JSON-body `{ secret, to, subject, body }`.
- Verwerpt de request (HTTP 403) als `secret` niet exact overeenkomt met een vaste waarde die in het script staat (zie beveiliging hieronder).
- Valideert dat `to` een geldig e-mailadres is, en dat `subject`/`body` niet leeg zijn; anders HTTP 400.
- Stuurt via PHPMailer een e-mail naar `to` met het opgegeven `subject`/`body` (platte tekst, geen HTML), verzonden vanaf `info@glassartanddesign.com` via `h64.mijn.host:587` (STARTTLS) met de credentials van Sven.
- Zet CORS-headers (`Access-Control-Allow-Origin`, `Access-Control-Allow-Methods: POST`, `Access-Control-Allow-Headers: Content-Type`) zodat de browser de cross-origin aanroep vanaf de GitHub Pages-URL toestaat; handelt de preflight `OPTIONS`-request af.
- Retourneert JSON `{ success: true }` bij succes, of een foutstatus + `{ success: false, error: "..." }` bij falen (verkeerde sleutel, ongeldige invoer, of een SMTP-fout).
- SMTP-host/poort/gebruikersnaam/wachtwoord en de geheime sleutel staan in een apart, **niet-getrackt** configuratiebestand (`mail-server/config.php`, met een `config.example.php` wél in git als sjabloon) — zodat de echte SMTP-wachtwoord en sleutel nooit in de git-geschiedenis belanden.

## 2. Beveiliging: vaste geheime sleutel

Zoals besproken: een lange, willekeurige gedeelde sleutel, bekend bij zowel het PHP-scriptje als de website. Omdat dit een statisch geëxporteerde site is, staat elke client-side waarde onvermijdelijk zichtbaar in de uitgeleverde JavaScript-bundle — dit is dus geen waterdichte beveiliging, maar weerhoudt casual misbruik van een verder laag-risico actie (een bevestigingsmail versturen, geen gevoelige operatie). Bewust geaccepteerd trade-off, zoals besproken.

## 3. Website-kant (`CartPanel.tsx`)

Na de bestaande, geslaagde Firestore-schrijfacties (header + regels), vóór `setOrderPlaced(true)`:

- Stel `subject` samen via een nieuwe vertaalsleutel `cart.orderEmailSubject` (alle 4 talen).
- Stel `body` samen via de **bestaande** `cart.orderConfirmation`-sleutel (geen nieuwe sleutel nodig — zelfde tekst als de in-app bevestiging).
- Doe een `fetch(...)` (POST, JSON-body met `secret`/`to: user.email`/`subject`/`body`) naar het scriptje's URL.
- **Niet-blokkerend en foutbestendig:** deze `fetch` wordt niet ge-`await`, of wel ge-`await`t maar binnen zijn eigen `try/catch` die alleen `console.error` logt — in geen geval mag een falende/tragere mail-aanroep de bestaande succesvolle flow (`clear()` + `setOrderPlaced(true)`) vertragen of blokkeren.
- Scriptje-URL en geheime sleutel komen uit twee nieuwe environment variables (zelfde patroon als de bestaande Firebase-config): `NEXT_PUBLIC_MAIL_ENDPOINT_URL`, `NEXT_PUBLIC_MAIL_SECRET`. Als deze niet zijn ingesteld (bv. lokale development zonder de secrets), wordt de mail-aanroep simpelweg overgeslagen (geen crash).

## 4. CI-configuratie

`.github/workflows/deploy-pages.yml` krijgt twee nieuwe env-variabelen bij de build-stap, naar het patroon van de bestaande `NEXT_PUBLIC_FIREBASE_*`-vars: `NEXT_PUBLIC_MAIL_ENDPOINT_URL` (uit `vars.*`, geen geheim) en `NEXT_PUBLIC_MAIL_SECRET` (uit `secrets.*` — dit voorkomt alleen dat de waarde zichtbaar is in de Actions-logs/UI; zodra de site gebouwd is, staat de waarde alsnog gewoon in de publieke JS-bundle, zie sectie 2).

## Niet in scope

- HTML-opmaak in de e-mail (platte tekst is voldoende voor nu).
- Itemized bestelregels in de mail-inhoud (kunstwerk/maat/materiaal zijn nog steeds `null`; de mail bevat dezelfde algemene tekst als de in-app bevestiging, geen orderdetails).
- Server-side verificatie van de klant-login in het PHP-scriptje (zwaardere, robuustere beveiligingsoptie — bewust niet gekozen deze ronde).
- Automatisch daadwerkelijk uploaden van het PHP-scriptje naar mijn.host — dat doet de klant zelf via FTP/DirectAdmin.
- Mails bij statuswijziging (Goedgekeurd/Afgewezen) — alleen de eerste bevestiging bij het plaatsen van de bestelling.

## Risico's / aandachtspunten

- De geheime sleutel is, zoals hierboven toegelicht, geen echte beveiliging tegen een technisch onderlegde bezoeker — puur een drempel tegen toevallig misbruik.
- Het scriptje's URL en sleutel moeten na het handmatig uploaden door de klant nog worden ingevuld als GitHub Actions variabele/secret, en de site moet daarna opnieuw gedeployed worden — dit is een handmatige vervolgstap buiten deze implementatie om.
- `mail-server/config.php` mag nooit gecommit worden (bevat het echte SMTP-wachtwoord) — moet in `.gitignore` staan; alleen `config.example.php` (met placeholder-waarden) wordt getrackt.
