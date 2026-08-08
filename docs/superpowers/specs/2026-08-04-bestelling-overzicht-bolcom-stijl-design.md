# Besteloverzicht + besteldetail: bol.com-geïnspireerde redesign

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 04-08-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

Datum: 2026-08-04
Auteur: Joris van den Broek (met Claude)
Status: Approved — klaar voor implementatieplan

## Aanleiding

De klant vond de huidige besteldetail-popup ("Bestelling GD-00709", geopend vanuit de bestellingenlijst in het account-gedeelte) niet mooi en gaf bol.com's "Mijn bestellingen"-scherm als visueel voorbeeld: per bestelling een herkenbare thumbnail, duidelijke status en datum, en een heldere prijsopbouw per regel.

Onderweg is bevestigd dat het al bestaande "meerdere kunstwerken per keer bestellen" (een klant kan via het winkelmandje meerdere verschillende kunstwerken combineren in één bestelling, zie `useCart.tsx`/`CartPanel.tsx`/`POST /api/bestelheaders`) prima werkt — dit is puur een **visuele** redesign, geen wijziging aan het bestel-datamodel of de checkout-flow.

## Scope

**Wel:**
- `src/components/account/OrdersSection.tsx` — de klant-facing bestellingenlijst (rij-opmaak).
- `src/components/account/AccountOrderModal.tsx` — de klant-facing besteldetail-popup (regel-opmaak + nieuw totaalbedrag).
- `src/components/beheer/BestellingModal.tsx` — de medewerker-facing besteldetail-popup: dezelfde regel-opmaak + totaalbedrag, met behoud van alle bestaande functionaliteit (Bewerken per regel, Prijs vaststellen, Goedkeuren/Afwijzen).

**Niet:**
- `src/components/beheer/BestellingenSection.tsx` — de medewerker-facing bestellingenlijst blijft de bestaande `DataTable` (kolommen, bulk-selectie, "versturen naar drukker"-actie, quick-filter). Dit is een dichte beheertabel, geen kaartenlijst; thumbnails passen daar niet in het bestaande `DataTable`-patroon (zie ook `feedback_beheer_datatable_search_pattern`).
- De winkelmandje/checkout-flow (`ProductModal.tsx`, `useCart.tsx`, `CartPanel.tsx`, `POST /api/bestelheaders`) — multi-kunstwerk-bestellingen werken al.
- `Modal.tsx`-frame/scroll-mechaniek (vaste header/footer, scrollende content) — al vastgelegd en geïmplementeerd in `2026-07-30-beheer-modal-redesign-design.md`; dit document bouwt daarop voort en herhaalt die afspraken niet.
- Geen nieuwe order-status (bv. "Afgerond") — dat is een apart, nog niet gebouwd traject (`2026-07-30-bestelling-afronden-workflow-design.md`).
- Geen gedeeld component tussen `AccountOrderModal` en `BestellingModal` — de twee bestaan vandaag al als aparte implementaties met net iets andere behoeften (edit-mode, prijs-vaststellen, Goedkeuren/Afwijzen zitten alléén in `BestellingModal`); dat blijft zo, alleen de visuele regel-opmaak wordt in beide apart doorgevoerd.

## A. Bestellingenlijst (`OrdersSection.tsx`): gestapelde thumbnails per rij

Elke rij toont een gestapelde ("fan-out", licht overlappend) reeks thumbnails van de **unieke** kunstwerken in die bestelling (dedupliceren op `kunstwerkId` over `order.lines`, niet één thumbnail per regel als dezelfde kunstwerk in meerdere materiaal/maat-varianten voorkomt). Maximaal 3 thumbnails zichtbaar; bij meer dan 3 unieke kunstwerken toont de derde plek een "+N"-badge in plaats van een thumbnail (N = aantal overige unieke kunstwerken). Onbekende/verwijderde kunstwerken (`kunstwerkId` zonder match) tonen het bestaande "?"-placeholder-blokje. Thumbnails gebruiken `ProductImage` (consistent met `AccountOrderModal`), niet een kale `<img>`.

De benodigde data (`kunstwerken`-collectie) is al beschikbaar in `OrdersSection` (wordt al opgehaald voor de modal); wordt nu ook gebruikt voor de rij zelf.

**Desktop (`sm:` breakpoint en breder):** één rij, bestaande volgorde behouden met de thumbnail-stack ervoor: `[thumbnail-stack] [bestelnummer] [omschrijving, flex-1 truncate] [statusbadge] [datum]`.

**Mobiel (onder `sm:`):** de huidige indeling is al krap (nummer + omschrijving + status + datum past nauwelijks); met thumbnails erbij wordt dat te vol op één regel. Layout wordt in plaats daarvan:
- Vaste linkerkolom: de thumbnail-stack.
- Rechts een tekstblok van twee regels:
  1. Bestelnummer + statusbadge naast elkaar (`justify-between`).
  2. Omschrijving (truncate) + datum eronder.

Dit is exact "variant 2" uit de mockup-sessie (thumbnail-kolom vast links, tekstblok rechts) — gekozen boven een letterlijke overname van de desktop-rij (die de omschrijving bijna volledig wegknipte op 375px) en boven een twee-regelige variant zonder vaste thumbnail-kolom.

## B. Besteldetail-popup: regelkaarten met subtotaal

Zowel `AccountOrderModal` als `BestellingModal` krijgen dezelfde regel-opmaak (bol.com-stijl kaart per regel), onafhankelijk van elkaar geïmplementeerd:

- Elke regel wordt een eigen kaartje: rand + lichte achtergrondtint (`border border-white/10 bg-white/[0.02] rounded-md`, geen kale `border-b`-scheiding meer tussen regels).
- Thumbnail 72×72px (was 56×56 / `h-14 w-14`).
- Titel (kunstwerk-omschrijving) vet, boven een klein label/waarde-grid met **Materiaal** en **Maat** (bestaande labels/waarden, alleen visueel als grid i.p.v. losse tekstregels).
- Onder een dunne scheidingslijn: een prijsregel — links `{aantal} × {stukprijs}`, rechts vet het **subtotaal** (`stukprijs × aantal`). Dit subtotaal bestaat nu nergens en is nieuw.
- Prijs-op-aanvraag (`line.prijs === null`) blijft zoals nu tekstueel aangeduid in plaats van een subtotaal; in `BestellingModal` blijft de bestaande inline prijs-invoer + "Prijs vaststellen"-knop functioneel ongewijzigd, alleen visueel verplaatst in de nieuwe kaart-layout.
- `BestellingModal`'s bestaande "Bewerken"-toggle per regel blijft: in edit-mode vervangt het bestaande formulier (materiaal-select, maat-select of breedte/hoogte-inputs, prijs, aantal, Opslaan/Annuleren) het label/waarde-grid + prijsregel binnen dezelfde kaart-buitenkant. Geen functionele wijziging aan die edit-flow, alleen de kaart eromheen.

## C. Bestelling-totaal in de header

Boven de regel-lijst (die kan scrollen bij lange bestellingen, zie bestaande `max-h-*`-afspraak) komt een totaalbedrag **in de header/subtitle van de popup**, niet onderaan bij de sluitknop — reden: bij meerdere regels scrollt de lijst, en een totaal onderaan het scrollgebied kan dan buiten beeld vallen terwijl header/footer van `Modal.tsx` altijd zichtbaar blijven. Concreet, in de `subtitle`-ReactNode die al aan `Modal` wordt meegegeven:

- Links: bestaande tekst (datum voor klant; `companyName · besteldatum` voor beheer) + de statusbadge (verplaatst van de content-body naar hier, ernaast of eronder).
- Rechts: label "Totaal" + bedrag, rechts uitgelijnd.

Als minstens één regel nog geen vastgestelde prijs heeft (`prijs === null`), toont het totaal-veld in plaats van een (onjuist) bedrag een korte placeholder-tekst ("Wordt nog vastgesteld" / equivalent), zodat er nooit een half-berekend totaal wordt gesuggereerd. `BestellingModal` behoudt daarnaast de bestaande waarschuwing onderaan ("Alle regels moeten eerst een prijs krijgen voordat u kunt goedkeuren") — die twee zijn losse, elkaar niet vervangende meldingen.

Het totaal is een simpele som van `prijs × quantity` over alle regels, client-side berekend uit de al beschikbare `order.lines` / `bestelling.lines` — geen API-wijziging nodig.

## i18n

Nieuwe sleutels nodig in alle vier localebestanden (`messages/nl.json`, `en.json`, `de.json`, `fr.json`):

- `accountPage.orders`: `modalTotalLabel` ("Totaal"), `modalTotalIncomplete` ("Wordt nog vastgesteld").
- `beheer`: `bestellingenModalTotalLabel` ("Totaal"), `bestellingenModalTotalIncomplete` ("Wordt nog vastgesteld").

Bestaande labels (`bestellingenModalLabelMateriaal`, `bestellingenModalLabelMaat`, `modalLineUnknown`, `modalLinePriceOnRequest`, `bestellingenModalPrijsOpAanvraag`, statusteksten) blijven ongewijzigd van betekenis, alleen anders gepositioneerd in de nieuwe kaart-layout.

## Testing

Bestaande `data-testid`-hooks blijven behouden waar ze vandaag al bestaan (`account-order-${id}`, `account-order-${id}-status`, `account-order-modal`, `account-order-modal-status`, `account-order-modal-line-${id}`, `bestelling-modal`, `bestelling-modal-status`, `bestelling-modal-line-${id}`, de bewerken/opslaan/annuleren-testids in `BestellingModal`). Nieuwe testids voor het totaal-element (bv. `account-order-modal-total`, `bestelling-modal-total`) zodat het nieuwe gedrag (correct bedrag, placeholder bij onvolledige prijzen) getest kan worden.

Relevante bestaande testbestanden die meebewegen: `tests/components/account/OrdersSection.test.tsx`, `tests/components/account/AccountOrderModal.test.tsx`, `tests/components/beheer/BestellingModal.test.tsx`. `tests/components/beheer/BestellingenSection.test.tsx` blijft ongewijzigd (buiten scope, zie boven).

## Niet in scope (samenvatting)

- `BestellingenSection.tsx` (beheer-lijst, blijft `DataTable`).
- Winkelmandje/checkout-flow (werkt al voor meerdere kunstwerken per bestelling).
- `Modal.tsx`-frame-mechaniek (al vastgelegd in eerdere spec).
- Nieuwe bestelstatussen (apart traject).
- Gedeeld component tussen de twee popups (bewuste keuze, zie boven).
