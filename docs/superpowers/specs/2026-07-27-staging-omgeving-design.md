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
- Staging verbindt altijd met de **test-database**; productie verbindt altijd met de
  **productiedatabase**. Vastgelegd per deployment via env-vars, geen runtime-schakelaar of
  identiteitscheck nodig.
- Alle pagina's (ook collecties/wordKlant/inloggen/account/contact) zijn op staging volledig
  bereikbaar, zonder de Under Construction-afscherming die productie nu heeft.
- Nieuwe code komt pas op staging na een **bewuste, handmatige actie** van Joris — niet
  automatisch bij elke push.
- Staging is afgeschermd met een wachtwoord, zodat toevallige bezoekers/zoekmachines geen
  onafgeronde features te zien krijgen.

## Architectuur

```
Lokaal (npm run dev, GitHub-checkout)
  └─ verbindt met test-database  ──────────────┐
                                                 │ (als het lokaal goed werkt)
Joris draait handmatig: gh workflow run deploy-staging.yml
  │
  ▼
GitHub Actions runner
  ├─ npm ci && npm run build   (geen MIJNHOST_BUILD)
  └─ upload build-output via SSH/rsync
        │
        ▼
staging.glassartanddesign.com (mijn.host, Passenger)
  ├─ npm ci --omit=dev (remote, alleen productie-deps)
  ├─ herstart Passenger + smoke-check
  └─ verbindt met test-database (MySQL), achter HTTP Basic Auth
```

Productie (`glassartanddesign.com`) blijft een aparte deployment: eigen `DB_*`-env-vars naar
de productiedatabase, `MIJNHOST_BUILD=true`, en promotie ernaartoe blijft het bestaande
handmatige proces — dat verandert dit ontwerp niet.

## Componenten

- **`.github/workflows/deploy-staging.yml`** — trigger uitsluitend `workflow_dispatch`
  (handmatig via `gh workflow run deploy-staging.yml` of de "Run workflow"-knop in GitHub).
  Geen `push`-trigger: elke tussentijdse commit naar `master` deployt dus niet vanzelf.
- **GitHub Secrets:** een losse **deploy-only SSH-sleutel** (niet Joris' persoonlijke sleutel)
  + host/gebruikersnaam voor mijn.host, plus de test-database-credentials — los van
  eventuele productie-secrets.
- **Build-stap:** `npm ci && npm run build` op de GitHub-runner zelf, zonder
  `MIJNHOST_BUILD` — dat is al de standaard als je die env-var weglaat, dus geen nieuwe vlag
  nodig.
- **Upload-stap:** rsync/scp van `.next/`, `public/`, `package.json`/`package-lock.json` en
  overige minimale servebestanden naar
  `domains/staging.glassartanddesign.com/public_html/`.
- **Remote herstart-stap:** via SSH `npm ci --omit=dev` (alleen productie-dependencies) +
  Passenger-herstart. **Open implementatiepunt:** of `touch tmp/restart.txt` volstaat op
  mijn.host, of dat een DirectAdmin-API-aanroep nodig is (de eerdere nodetest-herstart ging
  via de DirectAdmin-UI-knop) — te verifiëren tijdens implementatie, niet aan te nemen.
- **HTTP Basic Auth** — `.htaccess`/`.htpasswd` in de staging-map; wachtwoord gedeeld met
  medewerkers via een password manager, nooit in plaintext gecommit.
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
- **Smoke-check na herstart:** de workflow haalt na de herstart-stap een bekend
  health-/versie-endpoint op om te bevestigen dat de nieuwe build daadwerkelijk draait, in
  plaats van blind te vertrouwen dat de Passenger-herstart is gelukt.
- **Basic Auth-wachtwoord:** nooit in de repo/`.htaccess` in plaintext committen — alleen de
  gehashte `.htpasswd` op de server.
- **Gedeelde test-database:** lokale ontwikkeling én staging praten tegen dezelfde
  test-database — testdata van beide kan elkaar beïnvloeden. Voor dit kleine team is dat
  acceptabel; geen aparte derde database.
- **Mail-hygiëne:** `drukkers`-records in de test-database hebben een veilig (test-)
  e-mailadres, ongeacht of de aanvraag van lokale ontwikkeling of van staging komt — zelfde
  afspraak als in de vervangen schakelaar-spec (zie de "Testdata-afspraak (geen code)"-sectie
  daar).
- **Gedeelde PHP mail-/upload-server-endpoints zijn bewust en veilig gedeeld:** staging
  hergebruikt dezelfde productie-`mail-server`/`upload-server` PHP-endpoints op mijn.host
  (met de staging-origin toegevoegd aan hun CORS-allowlist, zie Task 4 Stap 5 van het
  implementatieplan) in plaats van eigen staging-only endpoints te krijgen. Dat lijkt op het
  eerste gezicht risicovol — zou een teststuring per ongeluk een echte klant- of
  drukker-e-mail kunnen bereiken? — maar is dat niet: het endpoint is een dom SMTP-relay
  zonder eigen toegang tot Firestore-data; het "aan"-adres van elke order-bevestigings- of
  drukker-notificatiemail komt uitsluitend uit het **klant**- of **drukker**-Firestore-record
  dat de bestelling plaatst/ontvangt, en staging gebruikt daarvoor zijn eigen, volledig
  gescheiden Firebase-project (`glassart-and-design-staging`) met lege
  `klanten`/`drukkers`-collecties. Het endpoint weet niet en het maakt niet uit welke
  omgeving de data leverde. Zolang wie test-klant-/drukker-records in staging's Firestore
  seedt de hierboven afgesproken veilige testadressen gebruikt, is er dus geen risico op
  lekken naar echte adressen — en is er geen reden om aparte staging-PHP-endpoints te bouwen.

## Testen

- **End-to-end pipelinevalidatie:** `gh workflow run deploy-staging.yml` handmatig draaien
  en bevestigen dat build, upload, `npm ci --omit=dev`, herstart en smoke-check allemaal
  slagen.
- **Toegangscontrole:** geen toegang zonder Basic Auth-wachtwoord; wel toegang met het juiste
  wachtwoord.
- **Paginabeschikbaarheid:** collecties/wordKlant/inloggen/account/contact zijn op staging
  bereikbaar, zonder Under Construction-gate.
- **Databronvalidatie:** een testkunstwerk aanmaken via staging en bevestigen dat het in de
  test-database landt, niet in productie.
- **Bannerzichtbaarheid:** de STAGING-banner is zichtbaar op elke pagina.
- **Faalscenario (eenmalig, optioneel):** een bewust kapotte build proberen te deployen en
  bevestigen dat staging op de vorige werkende versie blijft staan.

## Buiten scope

- Geen wijziging aan hoe productie momenteel gepromoot/gedeployd wordt (blijft handmatig).
- Geen automatische deploy-trigger bij een push — uitsluitend het handmatige commando.
- Geen runtime test/productie-databronschakelaar (zie de vervangen spec) — die behoefte is
  vervangen door deze staging-omgeving.
- Geen aparte derde database voor staging versus lokale ontwikkeling.
