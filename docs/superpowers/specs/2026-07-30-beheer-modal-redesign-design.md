# Beheer-modals: header + geen verticale scrollbar op het modal-frame

Datum: 2026-07-30
Auteur: Joris van den Broek (met Claude)
Status: Approved — klaar voor implementatieplan

## Aanleiding

De huidige `Modal`-component (`src/components/Modal.tsx`) rendert titel, inhoud en footer-knoppen als één `overflow-y-auto`-blok. Zodra de inhoud niet past, scrollt de hele kaart: de titel en de Opslaan/Sluiten-knoppen verdwijnen dan mee uit beeld. Zie de "Klantgegevens"-modal (`KlantModal.tsx`) als referentiepunt — dat is het gewenste eindresultaat qua header-styling, maar ook daar scrollt vandaag de hele kaart.

Doel van dit herontwerp:
1. Elke modal krijgt een consistente header (titel + sluitkruisje), vergelijkbaar met de "Klantgegevens"-modal.
2. Het modal-*frame* (header + footer-knoppen) blijft altijd zichtbaar — nooit meescrollen.
3. Waar mogelijk past de volledige inhoud op één scherm zonder scroll. Waar dat structureel niet kan (onbegrensde lijsten), krijgt alléén dat lijstonderdeel een eigen, begrensde scrollcontainer — niet het hele modal.
4. Samenhorende velden (met name de 4 taalvelden NL/FR/DE/EN van een omschrijving) blijven altijd bij elkaar gegroepeerd, ook wanneer een modal wordt opgesplitst in tabs.

## Scope

Alle modals die via `src/components/Modal.tsx` worden gerenderd:

**Beheer** (`src/components/beheer/`): `KlantModal`, `BestellingModal`, `DrukkerModal`, `VersturenNaarDrukkerDialog`, `KunstenaarsSection` (kunstenaar-modal), `KunstwerkenSection` (kunstwerk-modal), en de 7 catalogus-modals: `SegmentenSection`, `StijlenSection`, `OnderwerpenSection`, `MaterialenSection`, `MateriaalsoortenSection`, `MatenSection`, `PrijsgroepenSection`.

**Klant-facing**: `AccountOrderModal` (`src/components/account/`).

Buiten scope: `ProductModal.tsx` — dit is geen wrapper om `Modal.tsx`, maar een eigen full-page/preview component voor het klant-facing productdetail en de kunstwerk-preview in de beheer-modal. Wordt niet aangepast.

## A. `Modal.tsx`: vast frame, scrollende content

Herstructureer de kaart naar drie vaste lagen in plaats van één scrollend blok:

- **Header** (nieuw verplicht): titel + sluitkruisje, met de rand-onder styling die `KlantModal` nu al gebruikt via de bestaande `title`-prop. `title` wordt een **verplichte** prop op `ModalProps` (was optioneel); `subtitle` blijft optioneel.
- **Content**: het gebied tussen header en footer. Dit gebied krijgt `overflow-y-auto` en `min-h-0` (binnen een flex-kolom) zodat *alleen dit deel* kan scrollen wanneer het echt niet anders kan — header en footer blijven buiten deze scrollcontainer.
- **Footer**: footer-acties + sluitknop, buiten de scrollcontainer, dus altijd zichtbaar.

De buitenste kaart behoudt een max-hoogte (bv. `max-h-[90vh]`, iets ruimer dan de huidige `85vh` omdat header/footer nu gegarandeerd meetellen in wat zichtbaar blijft) zodat de modal op kleine vensters nooit buiten het scherm valt — in dat geval scrollt dan alsnog alleen het content-gedeelte.

Dit is een niet-inhoudelijke wijziging aan de shell en werkt door voor élke consument van `Modal` zonder dat die consumenten hun eigen structuur hoeven aan te passen (behalve waar hieronder specifiek genoemd).

## B. Titel op elke modal

`title` wordt verplicht. De volgende bestanden geven momenteel géén `title` mee aan `Modal` en krijgen er één (nieuwe of hergebruikte i18n-sleutel, per bestand consistent met de bestaande `...ModalTitel`-naamgeving zoals `bestellingenModalTitel`, `drukkersModalTitel`):

- `SegmentenSection.tsx`, `StijlenSection.tsx`, `OnderwerpenSection.tsx`, `MaterialenSection.tsx`, `MateriaalsoortenSection.tsx`, `MatenSection.tsx`, `PrijsgroepenSection.tsx` — titel wisselt tussen "nieuw toevoegen" en "bewerken" naargelang `modalState.mode` (zoals `KunstwerkenSection`/`KunstenaarsSection` dat straks ook doen, zie C).
- `KunstenaarsSection.tsx` (kunstenaar-modal), `KunstwerkenSection.tsx` (kunstwerk-modal) — zelfde add/edit-titelwissel.
- `AccountOrderModal.tsx` — titel toont het ordernummer (`order.id`), zoals de subtitle-aanpak in `BestellingModal`.

Nieuwe/uitgebreide i18n-sleutels nodig in alle vier localebestanden (`messages/nl.json`, `en.json`, `de.json`, `fr.json`).

De statusbadge + "Bewerken"-knop-rij in `KlantModal` en `BestellingModal` blijft ongewijzigd onderdeel van de content (niet van de header) — dat is al goed zoals het is.

## C. Tabs voor de twee te-grote formulieren

Zowel de kunstwerk- als de kunstenaar-modal hebben te veel velden om zonder scroll op een schermhoogte van pakweg 800-900px te passen. Beide krijgen een simpele tab-strip direct onder de header, binnen de content-laag uit sectie A (de tab-strip zelf scrollt niet mee; alleen de actieve tab-inhoud kan dat nog, als laatste redmiddel).

**Kunstwerk-modal** (`KunstwerkenSection.tsx`), preview-kolom blijft zoals nu rechts gepind op `lg`+ breedtes:
1. **Algemeen** — foto, naam, kunstenaar, formaat
2. **Kenmerken** — segmenten, materialen & maten, stijlen, onderwerpen, AI-gegenereerd
3. **Prijzen** — prijzentabel (materiaal × maat) of prijs-per-m² voor materiaalloze werken
4. **Omschrijvingen** — omschrijving NL, FR, DE, EN samen (in die volgorde, NL eerst zoals nu)

**Kunstenaar-modal** (`KunstenaarsSection.tsx`):
1. **Algemeen** — foto, naam, prijsafspraken, exclusieve-klant-koppeling (checkbox-lijst)
2. **Omschrijvingen** — omschrijving NL, FR, DE, EN samen

Validatiefouten (verplichte-veld-hints, rode randen) blijven per veld zoals nu; als een tab een fout bevat die de gebruiker niet ziet omdat een andere tab actief is, moet dat op de tab zelf zichtbaar zijn (bv. een klein rood stipje/indicator op de tab-knop) zodat "Opslaan" niet onverklaarbaar disabled blijft. Exacte indicator-styling wordt in het implementatieplan uitgewerkt.

Nieuwe i18n-sleutels nodig voor de tab-labels (bv. `kunstwerkenTabAlgemeen`, `kunstwerkenTabKenmerken`, `kunstwerkenTabPrijzen`, `kunstwerkenTabOmschrijvingen`, en het kunstenaar-equivalent) in alle vier localebestanden.

## D. Begrensde scrollcontainer voor onbegrensde lijsten

Sommige content is inherent onbegrensd in lengte en kan nooit gegarandeerd op één scherm passen, ongeacht lay-out: een bestelling kan tientallen regels hebben, een drukker kan tientallen zendingen hebben, een klantenlijst kan lang zijn. `VersturenNaarDrukkerDialog` doet dit al goed voor zijn mail-preview (`max-h-64 overflow-y-auto` op alleen dat blok). Datzelfde patroon wordt toegepast op:

- `BestellingModal.tsx` — de lijst van bestelregels.
- `DrukkerModal.tsx` — de lijst van zendingen.
- `AccountOrderModal.tsx` — de lijst van orderregels.
- `KunstenaarsSection.tsx` — de klanten-checkbox-lijst (exclusieve koppeling), binnen de "Algemeen"-tab uit sectie C.

Concreet: elk van deze lijsten krijgt een eigen `max-h-*` (per lijst een passende waarde, ergens tussen 40 en 64 in Tailwind-rem-eenheden, zodat de rest van de tab/modal-inhoud er nog naast past) met `overflow-y-auto`, zodat scrollen — als het al nodig is — alleen dat ene lijstblok raakt en de rest van de modal (inclusief header en footer) op zijn plek blijft staan.

## Niet in scope

- Geen wijziging aan de statusbadge/Bewerken-patroon van `KlantModal`/`BestellingModal`.
- Geen wijziging aan `ProductModal.tsx` (zie Scope hierboven).
- Geen nieuwe view/bewerk-onderscheiding voor modals die dat nu niet hebben (Kunstwerk, Kunstenaar, Drukker, catalogus-modals blijven direct bewerkbaar zoals nu).
- Geen wijziging aan de brede-modal-drempel (`min-[1432px]:` / `lg:` breakpoints van de kunstwerk-preview) — die blijft zoals recent al gefixt.
