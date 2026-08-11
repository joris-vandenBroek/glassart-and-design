# Beheer-gebruikershandleiding — design

## Doel

Beheer heeft nu losse, korte helpteksten via `HelpHint`-popovers op een paar plekken. Dit ontwerp vervangt dat door één centrale, doorlopende gebruikershandleiding (in Jip-en-Janneke-taal) die vanuit elk sectiepaneel en detailscherm in beheer met een "?"-icoon te openen is, sprong-naar-hoofdstuk incluis. Alle informatie die nu in de bestaande `HelpHint`-teksten staat moet terugkomen in de handleiding.

## Architectuur

- **Route**: `src/app/[locale]/beheer/documentatie/page.tsx`. Alleen bereikbaar voor ingelogde medewerkers — zelfde toegangscontrole als `beheer` zelf (de client-side auth-gate die `AdminDashboard` gebruikt; geen aparte server-side gate nodig zolang die dezelfde sessie-cookie-check hergebruikt).
- **Eén doorlopende pagina**, geen aparte routes per hoofdstuk. Een vaste, sticky sidebar links met de inhoudsopgave; de hoofdstukken staan rechts als secties met een eigen `id`, zodat `/nl/beheer/documentatie#anker` direct naar het juiste stuk springt.
- **Leesvriendelijke stijl**, losstaand van het donkere "glas"-thema van beheer (lichte achtergrond, prettige regellengte/typografie), met dezelfde kleuraccenten/lettertype als de rest van de site.
- **Tekst hardcoded in het pagina-component**, geen `next-intl`-sleutels — consistent met de bestaande afspraak dat beheer-only teksten alleen NL nodig hebben, en past beter bij doorlopend proza dan honderden losse keys.
- **Twee schema's** (klant-registratieproces, bestelproces) als eenvoudige HTML/CSS blok-en-pijl-diagrammen. Geen screenshots van echte schermen — geen onderhoudslast bij UI-wijzigingen.
- **Geen wijziging aan `pageAvailability.ts`** nodig: de route is, net als `beheer` zelf, nooit publiek gelinkt en heeft geen Under-Construction-gate nodig.
- **Opent altijd in een nieuw tabblad** (`target="_blank"` / `window.open`) vanuit elk "?"-icoon, zodat de beheerder de openstaande beheer-sessie (bv. een geopend modal) niet kwijtraakt.

## UI-integratie: "?"-iconen

- Nieuw component vervangt `HelpHint.tsx` (naam bijv. `HelpLink.tsx`): een klein "?"-knopje met props `anchor: string` (en evt. `label` voor toegankelijkheid) dat `/nl/beheer/documentatie#<anchor>` in een nieuw tabblad opent. Geen popover-inhoud meer nodig — de content verhuist naar de handleiding zelf.
- **Positionering**: elk "?"-icoon staat consistent **rechts uitgelijnd bovenin** het paneel/scherm waar het bij hoort — niet inline naast de titel zoals de huidige `HelpHint`-plaatsing.
- **Scope — alle 16 sectiekoppen** in beheer krijgen dit icoon (klanten, bestellingen, kunstwerken, kunstenaars, prijsmatrix, prijsgroepen, materiaalsoorten, materialen, maten, segmenten, stijlen, onderwerpen, drukkers, activiteit, Glassart and design, instellingen), wijzend naar het bijpassende hoofdstuk.
- **Detailschermen** (modals) krijgen een eigen, specifieker "?": `KunstwerkModal` → kunstwerken-subhoofdstuk (code/formaat), `KunstenaarModal` → kunstenaars-subhoofdstuk (exclusiviteit), `BestellingModal` → bestelproces-subhoofdstuk (bewerken/korting), `KlantModal` → klant-registratie-subhoofdstuk (goedkeuren), `DrukkerModal` → drukkers-subhoofdstuk (standaard-drukker).
- **Algemene ingang**: in de vaste beheer-header (`src/app/[locale]/beheer/page.tsx`, de `GlassPanel` met titel/versielabel) komt rechtsboven een los "?"-icoon dat de handleiding zonder anker opent (bovenaan/inhoudsopgave), zichtbaar ongeacht welke sectie actief is.
- De 8 bestaande `HelpHint`-plekken (`KlantModal`, `BestellingenSection`, `KunstwerkenSection`, `KunstenaarsSection` ×3, `PrijsgroepenSection`, `PrijsmatrixSection`, `AfrondenBevestigingDialog`, `KlantWachtwoordSectie`) worden omgezet naar `HelpLink`. Hun huidige tekst is de basis voor (een deel van) de bijbehorende hoofdstukinhoud.
- Kleine, niet-volledige hints die geen "help-uitleg" zijn (bv. `prijsmatrixHint`, `RequiredFieldHint`) blijven ongewijzigd.
- Ongebruikt geworden i18n-sleutels (`*Help`, `*Uitleg` in `messages/nl.json`) worden verwijderd zodra hun inhoud is overgenomen.

## Inhoudsopgave / hoofdstukstructuur

1. **De klant-website** (`#klant-website`) — per menu-item op de publieke site (Home, Over ons, Collecties/Werken, Contact, Word klant, Inloggen, Account) kort wat het doet, én waar de getoonde data in beheer vandaan komt (bv. Contact-pagina ← "Glassart and design"-bedrijfsgegevens, Collecties/Werken ← kunstwerken die je aanmaakt), met een link naar het bijbehorende beheer-hoofdstuk.
2. **Klant registreren en goedkeuren** (`#klant-registratie`) — schema: klant registreert zelf → beheer beoordeelt aanvraag → koppelt prijsgroep → koppelt evt. kunstenaar. Sub: goedkeuren-vereisten (prijsgroep + btw-tarief).
3. **Een bestelling verwerken** (`#bestelproces`) — schema: klant bestelt en rondt af → beheer controleert/past aan (regels toevoegen/verwijderen/wijzigen, korting op hele bestelling) → snel filteren/zoeken, statussen wijzigen → zending naar drukker. Sub: `#bestelproces-bewerken` (korting, wanneer regels op slot gaan), `#bestelproces-drukker` (zending + voorbeeldmail met 3 klanten × 2+ regels van kunstenaar Jack), `#bestelproces-zendingen-terugvinden`, `#bestelproces-zoeken-op-zendingnummer` (status wijzigen naar Te factureren), en dat factureren + betaalverwerking zelf buiten het systeem gebeurt.
4. **Een kunstwerk aanmaken** (`#kunstwerken`) — sub: `#kunstwerken-foto` (max. bestandsgrootte 8 MB), `#kunstwerken-code` (prefix-systeem, voorbeelden GLA-JAC/GLA-AFR, code wordt vast zodra besteld), `#kunstwerken-formaat` (automatisch bepaald uit de foto, zelf aan te passen, bepaalt welke maten selecteerbaar zijn), `#kunstwerken-voorbeeld` (live preview zoals de klant het ziet).
5. **Een kunstenaar aanmaken** (`#kunstenaars`) — sub: `#kunstenaars-koppeling` (klant met exclusief verkooprecht + evt. de kunstenaar zelf als klant), `#kunstenaars-exclusiviteit` (gevolgen voor andere klanten die kunstwerken van deze kunstenaar willen bestellen).
6. **Prijzen: de prijsmatrix en het prijsmodel** (`#prijsmatrix`) — volledige opbouw in volgorde: matrix-basisprijs (maat × materiaal) → kunstenaarsopslag (vast bedrag, geen %) → prijsgroep-percentage van de klant → korting op bestelheader-niveau (vast bedrag, laatste stap, apart van de prijsgroep).
7. **Overige stamgegevens** (`#stamgegevens`) — korte functie + hoe aanmaken voor: materiaalsoorten, materialen, maten, segmenten, stijlen, onderwerpen, prijsgroepen (kort, verwijst naar hoofdstuk 6), activiteitenlog. Vermeldt dat segment/stijl/onderwerp ook via het kunstwerk-scherm aangemaakt kunnen worden, maar dan alleen de Nederlandse tekst — vertalingen moet je later zelf nog invullen.
8. **Drukkers** (`#drukkers`) — incl. `#drukkers-standaard` (wat de standaard-drukker betekent, waar hij gebruikt wordt).
9. **Glassart and design (bedrijfsgegevens)** (`#glassart-design`) — welke velden op de Contact-pagina komen vs. welke in de mail naar de drukker (factuurvoetje).
10. **Instellingen** (`#instellingen`) — minimale afname (globale standaard) en hoe je die per klant kunt overrulen.

## Content-bronnen (voor de implementatiefase)

De feitelijke inhoud moet kloppen met de code, niet aannames. Onderstaande is al geverifieerd tegen de codebase (zie research bij het brainstormen) en dient als bron bij het schrijven:

- Klant-registratie/goedkeuring: `src/app/api/auth/register/route.ts`, `PATCH /api/klanten/[id]`, `KlantModal.tsx` (`handleGoedkeuren`).
- Bestelproces: statusenum in `BestellingenSection.tsx`, `PATCH /api/bestelheaders/[id]/wijzigen`, `korting` in `src/lib/bestellingTotalen.ts`, `VersturenNaarDrukkerDialog.tsx` (zending, mail, `buildDrukkerMail()`).
- Kunstwerk: `src/lib/kunstwerkCodeVoorstel.ts`, `src/lib/detectKunstwerkFormaat.ts`, `MAX_UPLOAD_BYTES` in `src/app/api/upload/route.ts`/`src/lib/useKunstwerkFotoUpload.ts`, preview via `ProductModal` `variant="preview"`.
- Kunstenaar: `exclusieveKlantIds`-validatie in `KunstenaarsSection.tsx`, `src/lib/server/kunstenaarZichtbaarheid.ts`, `src/lib/server/orderRight.ts`, `kunstenaarAfspraken.prijsopslag` in `src/lib/server/prijsmodule.ts`.
- Prijsmodel: `berekenBestellijnPrijs`/`combineerPrijs`/`pasPrijsgroepToe` in `src/lib/server/prijsmodule.ts`.
- Drukkers: `drukker.standaard` in `DrukkerModal.tsx`, gebruikt in `VersturenNaarDrukkerDialog.tsx`.
- Glassart and design: `src/components/beheer/bedrijfsgegevensTypes.ts`, gebruikt in `Contact.tsx`/`ContactInfo.tsx` én `buildDrukkerMail()`.
- Instellingen: `bestelinstellingen.minimaleAfname` (`InstellingenSection.tsx`) vs. `klanten.minimaleAfname` (`KlantModal.tsx`), effectieve waarde in `ProductModal.tsx:89`.

## Onderhoud

`CLAUDE.md` krijgt (al toegevoegd, vooruitlopend op dit ontwerp) de regel: bij elke beheer-wijziging nagaan of de handleiding erdoor achterhaald raakt en zo nodig direct bijwerken.

## Buiten scope

- Geen i18n voor de handleiding (alleen Nederlands).
- Geen screenshots van echte schermen.
- Geen wijziging aan de klant-website zelf.
- Geen zoekfunctie binnen de handleiding (alleen de sidebar-inhoudsopgave + ankers).
