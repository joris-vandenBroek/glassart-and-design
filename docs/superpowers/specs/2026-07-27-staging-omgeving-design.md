# Staging-omgeving — ontwerp

## Context

Deze sessie begon met een ontwerp voor een test/productie-database-schakelaar op de live
site ([`2026-07-27-test-productie-database-schakelaar-design.md`](2026-07-27-test-productie-database-schakelaar-design.md),
inmiddels vervangen). Tijdens die brainstorm bleek de eigenlijke behoefte breder: **nieuwe
code** kunnen testen vóórdat die live gaat voor echte klanten — niet alleen dezelfde
productiecode af en toe tegen testdata laten draaien. Een runtime-schakelaar op één gedeelde
productie-instantie lost dat niet op, want een bug in nieuwe code raakt daar per definitie
meteen ook echte klanten.

Eerder is dit al eens verkend: `nodetest-app/` (in de repo) en het subdomein
`nodetest.glassartanddesign.com` (op mijn.host) bewezen dat Node.js/Next.js in server-mode
via Passenger werkt op mijn.host (Node 24.17.0, geen cold-start na 40+ minuten
inactiviteit). Beide zijn sindsdien opgeruimd (sessie "Nodetest cleanup", 2026-07-26) — er
is dus momenteel geen staging-omgeving meer, maar wel alle kennis uit die eerdere test.

Dit ontwerp bouwt, net als de vervangen schakelaar-spec, voort op het nog niet uitgevoerde
migratieplan
([`2026-07-23-firebase-to-mysql-migration-design.md`](2026-07-23-firebase-to-mysql-migration-design.md) /
[`2026-07-23-firebase-to-mysql-migration.md`](../plans/2026-07-23-firebase-to-mysql-migration.md)),
dat al een aparte test- en productie-MySQL-database op mijn.host voorziet.

## Doel

- Een permanente, eigen deployment (`staging.glassartanddesign.com`) waarop Joris (en de
  medewerkers) nieuwe code volledig kunnen testen — inclusief de complete klantflow — vóórdat
  die naar productie gaat.
- Staging verbindt altijd met het **staging-Firebase-project**; productie verbindt altijd met
  het **productie-Firebase-project**. Vastgelegd per deployment via env-vars, geen
  runtime-schakelaar of identiteitscheck nodig.
- Alle pagina's (ook collecties/wordKlant/inloggen/account/contact) zijn op staging volledig
  bereikbaar, zonder de Under Construction-afscherming die productie nu heeft.
- Nieuwe code komt pas op staging na een **bewuste, handmatige actie** van Joris — niet
  automatisch bij elke push.
- Staging is afgeschermd met een wachtwoord, zodat toevallige bezoekers/zoekmachines geen
  onafgeronde features te zien krijgen.

## Architectuur

> **Herzien tijdens implementatie:** dit ontwerp beschreef oorspronkelijk een Node.js/Next.js
> server-mode deployment via Passenger (voortbouwend op de nodetest-ervaring) met een MySQL
> test-database, en een SSH-gebaseerde upload. In de praktijk is gekozen om staging nu al
> bruikbaar te maken tegen de **huidige, Firestore-gebaseerde statische-export-architectuur**
> (dezelfde als productie), met een **tweede Firebase-project** voor data-isolatie in plaats
> van MySQL, en **FTP/FTPS** in plaats van SSH (de SSH-sleutel-aanpak faalde op het
> DirectAdmin-paneel van mijn.host). Geen Node-server, geen Passenger, geen herstart-stap:
> staging bestaat uit platte, statische bestanden, precies zoals productie nu ook al werkt.
> Zie het implementatieplan
> ([`2026-07-27-staging-omgeving.md`](../plans/2026-07-27-staging-omgeving.md)) voor de
> volledige, actuele opzet.

```
Lokaal (npm run dev, GitHub-checkout)
  └─ verbindt met de staging-database (test-project)

Joris draait handmatig: gh workflow run "Deploy naar Staging"
  │
  ▼
GitHub Actions runner
  ├─ npm ci && npm run build   (geen MIJNHOST_BUILD, geen GITHUB_PAGES)
  ├─ genereert .htpasswd + .htaccess (Basic Auth)
  └─ upload build-output (out/) via FTPS
        │
        ▼
staging.glassartanddesign.com (mijn.host, statische bestanden, achter HTTP Basic Auth)
  └─ verbindt met het aparte Firebase-project `glassart-and-design-staging`
```

Productie (`glassartanddesign.com`) blijft een aparte deployment: eigen Firebase-project
(productie), `MIJNHOST_BUILD=true`, en promotie ernaartoe blijft het bestaande handmatige
proces — dat verandert dit ontwerp niet.

## Componenten

- **`.github/workflows/deploy-naar-staging.yml`** ("Deploy naar Staging") — trigger
  uitsluitend `workflow_dispatch` (handmatig via `gh workflow run "Deploy naar Staging"` of de
  "Run workflow"-knop in GitHub). Geen `push`-trigger: elke tussentijdse commit naar `master`
  deployt dus niet vanzelf.
- **GitHub Secrets/Variables:** een losse, map-beperkte **FTP-account** (niet SSH) voor
  mijn.host, plus de staging-Firebase-projectconfig — los van productie-secrets. Zie het
  implementatieplan's Taak 4 voor de exacte namen.
- **Build-stap:** `npm ci && npm run build` op de GitHub-runner zelf, zonder
  `MIJNHOST_BUILD` en zonder `GITHUB_PAGES` — dat is al de standaard als je die env-vars
  weglaat, dus geen nieuwe vlag nodig.
- **Upload-stap:** de statische `out/`-map (incl. gegenereerde `.htpasswd`/`.htaccess`) wordt
  via FTPS naar `domains/staging.glassartanddesign.com/public_html/` gestuurd — geen
  server-side install- of herstart-stap nodig, want er draait geen Node-proces.
- **HTTP Basic Auth** — `.htaccess`/`.htpasswd`, gegenereerd tijdens de build en meegestuurd
  in `out/`; wachtwoord gedeeld met medewerkers via een password manager, nooit in plaintext
  gecommit.
- **STAGING-banner** — puur env-var-gestuurd (bv. `NEXT_PUBLIC_ENVIRONMENT_LABEL=staging`),
  zichtbaar voor iedereen die op staging inlogt — geen identiteitscheck nodig, de hele
  omgeving is sowieso niet-productie.

## Foutafhandeling & beveiliging

- **Build faalt in GitHub Actions:** workflow stopt met een duidelijke fout, er wordt niets
  geüpload — staging blijft op de vorige werkende versie staan. **Let op:** deze garantie
  geldt alleen voor build-fouten (die optreden vóórdat er geüpload wordt, dus er wordt niets
  aangeraakt). Ze geldt **niet** voor fouten tijdens de upload-stap zelf — de shipped
  workflow gebruikt `dangerous-clean-slate: true` op de FTP-upload-actie, wat de remote map
  eerst leegmaakt om die exact te laten overeenkomen met de lokale `out/`-map (hetzelfde
  effect als het oude `rsync --delete`-gedrag) vóórdat de nieuwe bestanden gekopieerd worden.
  Een mislukte/afgebroken upload kan staging dus tijdelijk leeg of half-gedeployed
  achterlaten, niet op de vorige werkende versie.
- **Upload faalt:** workflow faalt expliciet; voor een staging-omgeving zonder klantverkeer
  is een mislukte upload geen ramp — het commando wordt gewoon opnieuw gedraaid.
- **Smoke-check na upload:** de workflow haalt na de FTPS-upload de homepage op (met
  Basic-Auth-credentials) om te bevestigen dat de nieuwe build daadwerkelijk live staat, in
  plaats van blind te vertrouwen dat de upload is gelukt. Geen herstart nodig — het zijn
  statische bestanden, geen draaiend proces.
- **Basic Auth-wachtwoord:** nooit in de repo/`.htaccess` in plaintext committen — alleen de
  gehashte `.htpasswd` op de server.
- **Gedeeld Firebase-project voor lokale ontwikkeling en staging:** lokale ontwikkeling
  (`npm run dev`) en staging praten allebei tegen hetzelfde `glassart-and-design-staging`
  Firebase-project — testdata van beide kan elkaar beïnvloeden. Voor dit kleine team is dat
  acceptabel; geen apart derde project.
- **Mail-hygiëne:** `drukkers`-documenten in het staging-Firebase-project hebben een veilig
  (test-)e-mailadres, ongeacht of de aanvraag van lokale ontwikkeling of van staging komt —
  zelfde afspraak als in de vervangen schakelaar-spec (zie de "Testdata-afspraak (geen
  code)"-sectie daar).
- **Gedeelde PHP mail-/upload-server-endpoints, met een uitzondering voor uploads:** staging
  hergebruikt dezelfde productie-`mail-server`/`upload-server` PHP-endpoints op mijn.host
  (met de staging-origin toegevoegd aan hun CORS-allowlist, zie Taak 4 van het
  implementatieplan) in plaats van volledig eigen staging-only endpoints te krijgen.
  - **Mail (`mail-server/send-mail.php`):** puur een dom SMTP-relay zonder eigen toegang tot
    Firestore-data; het "aan"-adres van elke order-bevestigings- of
    drukker-notificatiemail komt uitsluitend uit het **klant**- of **drukker**-Firestore-
    document dat de bestelling plaatst/ontvangt, en staging gebruikt daarvoor zijn eigen,
    volledig gescheiden Firebase-project (`glassart-and-design-staging`) met lege
    `klanten`/`drukkers`-collecties. Zolang wie test-klant-/drukker-records seedt de hierboven
    afgesproken veilige testadressen gebruikt, is er geen risico op lekken naar echte
    adressen — geen code-aanpassing nodig.
  - **Upload (`upload-server/upload-kunstwerk-foto.php`):** hier lag het anders, en dit
    **vereiste wel een aanpassing**: dit endpoint controleert bij elke upload het
    inlog-token tegen één vastgelegd Firebase-project-ID (`isAuthorizedMedewerker`/
    `findAuthorizedProjectId`). Een token van het staging-project faalde die check simpelweg
    (Firebase-ID-tokens zijn project-gebonden), dus foto-uploads vanaf staging gaven `403
    Forbidden` — geen lek, maar een kapotte functie. Opgelost door het endpoint **beide**
    project-ID's te laten accepteren, en uploads die via het staging-project geautoriseerd
    zijn naar een aparte map/URL te routeren (`uploads/kunstwerken-test/` i.p.v.
    `uploads/kunstwerken/`), zodat testfoto's nooit tussen de echte productiefoto's
    terechtkomen. Zie `upload-server/config.example.php`'s `staging_firebase_project_id`/
    `staging_upload_public_base_url`.

## Testen

- **End-to-end pipelinevalidatie:** `gh workflow run "Deploy naar Staging"` handmatig draaien
  en bevestigen dat build, `.htaccess`/`.htpasswd`-generatie, FTPS-upload en smoke-check
  allemaal slagen.
- **Toegangscontrole:** geen toegang zonder Basic Auth-wachtwoord; wel toegang met het juiste
  wachtwoord.
- **Paginabeschikbaarheid:** collecties/wordKlant/inloggen/account/contact zijn op staging
  bereikbaar, zonder Under Construction-gate.
- **Databronvalidatie:** een testkunstwerk aanmaken via staging en bevestigen dat het in het
  staging-Firebase-project landt, niet in productie.
- **Bannerzichtbaarheid:** de STAGING-banner is zichtbaar op elke pagina.
- **Faalscenario (eenmalig, optioneel):** een bewust kapotte build proberen te deployen en
  bevestigen dat staging op de vorige werkende versie blijft staan.

## Buiten scope

- Geen wijziging aan hoe productie momenteel gepromoot/gedeployd wordt (blijft handmatig).
- Geen automatische deploy-trigger bij een push — uitsluitend het handmatige commando.
- Geen runtime test/productie-databronschakelaar (zie de vervangen spec) — die behoefte is
  vervangen door deze staging-omgeving.
- Geen aparte derde database voor staging versus lokale ontwikkeling.
