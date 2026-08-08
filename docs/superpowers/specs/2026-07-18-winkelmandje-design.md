# Design: Winkelmandje (mock)

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 18-07-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

## Context

Vervolg op de eerdere deelprojecten (visitekaartje-pagina, navigatie + collectiepagina's + login-mockup). De site is nog steeds volledig statisch (`output: 'export'`, geen backend, geen middleware). Dit deelproject voegt een winkelmandje toe waarmee bezoekers kunstwerken (met gekozen maat en aantal) kunnen verzamelen en als bestelling kunnen "plaatsen" — net als de login/bestelgeschiedenis is dit uitdrukkelijk een **mock**: er is geen echte order­verwerking, betaling of voorraadcontrole. Geïnspireerd op het winkelmandje uit het referentieproject `C:\Temp\Zeus` (`localStorage`-gebaseerd mandje met maat/aantal-keuze en een "aanvraag"-knop), maar aangepast aan de eigen architectuur van deze site (React/Next.js i.p.v. losse HTML/JS, en gekoppeld aan de bestaande mock-bestelgeschiedenis in plaats van een los contactformulier).

## Doel

Een bezoeker kan op een segmentpagina een kunstwerk met een gekozen maat en aantal aan een winkelmandje toevoegen, het mandje bekijken/aanpassen, en de bestelling "plaatsen" — waarna deze verschijnt in de bestaande "Mijn bestellingen"-lijst met status "Aangevraagd". Geen inloggen vereist.

## Standaardmaten

Drie vaste maten, consistent met de bestaande voorbeeld-bestelgeschiedenis:

- `40x60cm`
- `60x90cm`
- `80x120cm`

## Mandje — gegevens en opslag

- Gedeelde staat via een React Context (`CartProvider`/`useCart`), naar het patroon van de bestaande `MockAuthProvider`/`useMockAuth` — één bron van waarheid, gedeeld door alle componenten die het mandje tonen of wijzigen.
- Opgeslagen in `localStorage` van de browser (puur client-side, geen backend), blijft bewaard tussen paginabezoeken en ongeacht inlogstatus.
- Elke mandje-regel: welk kunstwerk (segment-slug + afbeeldings-URL), gekozen maat, aantal. Hetzelfde kunstwerk in dezelfde maat nogmaals toevoegen verhoogt het aantal van de bestaande regel (zelfde gedrag als Zeus), in plaats van een dubbele regel te maken.

## Toevoegen aan mandje

> **Bijgewerkt:** de losse segmentpagina's uit dit document bestaan niet meer — die zijn vervangen door één gefilterde productenpagina (`/collecties`, zie `docs/superpowers/specs/2026-07-18-producten-pagina-design.md`). De onderstaande interactie verplaatst dus van "elke segmentpagina" naar "elke afbeeldingskaart op de productenpagina", inhoudelijk ongewijzigd.

- Op de productenpagina (`/collecties`) verschijnt bij hoveren/tikken op een afbeeldingskaart (`ProductsGrid`) een "Toevoegen aan mandje"-knop over de foto heen — ongeacht welk filter actief is.
- Klikken opent een klein paneel met:
  - Maatkeuze (dropdown met de 3 standaardmaten, standaard de eerste optie geselecteerd).
  - Aantal-stepper (+/- knoppen, standaard 1, minimaal 1).
  - Een bevestigknop die de regel aan het mandje toevoegt en het paneel sluit.
- De homepage-placeholders ("Uitgelichte werken") krijgen geen toevoegknop — dit blijft beperkt tot de echte sfeerbeelden op de productenpagina.

## Mandje bekijken

- Nieuw mandje-icoon met aantal-badge (totaal aantal stuks, niet aantal regels) in de navigatiebalk, naast de bestaande taalkeuze-knop.
- Klikken opent een paneel met per regel: miniatuur, segmentnaam, gekozen maat, aantal, en een verwijderknop.
- Leeg-mandje toont een korte, vriendelijke lege-staat-tekst (net als de bestaande "Mijn bestellingen"-leegstand niet nodig is, aangezien bestellingen altijd de 4 voorbeelden bevatten, maar het mandje wél leeg kan zijn).

## Bestelling plaatsen

- Knop **"Toevoegen aan bestelling"** onderaan het mandje-paneel. Geen inloggen vereist.
- Bij klikken:
  1. Er wordt één nieuwe bestelling aangemaakt op basis van de huidige mandje-inhoud (omschrijving samengesteld uit de regels, bijv. "Wellness paneel 60x90cm ×2, Abstract paneel 40x60cm ×1"), met vandaag als datum en status **"Aangevraagd"**.
  2. Deze nieuwe bestelling wordt toegevoegd aan de bestaande bestelgeschiedenis (zichtbaar via "Mijn bestellingen" in het account-paneel), vóór de 4 bestaande voorbeeldbestellingen (nieuwste eerst).
  3. Het mandje wordt geleegd.
- De nieuwe bestelling wordt, net als de rest van het mandje, opgeslagen in `localStorage` — de 4 bestaande voorbeeldbestellingen blijven de vaste basisset; nieuw geplaatste bestellingen komen daar in de browser van de bezoeker bovenop.
- Er is geen echte verwerking van deze bestelling (geen e-mail, geen orderbevestiging) — dat is bewust uitgesteld tot de latere, echte beheerfunctie (aparte, toekomstige architectuur, zoals ook de echte login/bestelgeschiedenis dat is).

## Niet in scope (voor dit deelproject)

- Echte orderverwerking, betaling, voorraadcontrole of e-mailbevestiging.
- Prijzen (blijven, zoals in de oorspronkelijke afspraken, achter login in het latere echte portaal).
- Toevoegknoppen op de homepage-placeholders ("Uitgelichte werken").
- Inloggen vereisen om te bestellen (expliciet niet gewenst, zie hierboven).
- Beheerfunctie om geplaatste bestellingen te verwerken (aparte, latere toekomstige deelproject, zoals door de klant zelf aangegeven).

## Risico's / aandachtspunten

- De bestaande 4 voorbeeldbestellingen gebruiken vertaalde berichttekst (via `orders.items.*` vertaalsleutels). Nieuw geplaatste bestellingen ontstaan dynamisch op basis van de actuele taalkeuze van de bezoeker op het moment van bestellen — hun omschrijving wordt als vaste tekst opgeslagen (niet opnieuw vertaald bij taalwissel), wat een bewuste, eenvoudige keuze is om overengineering van vertaling voor door-de-gebruiker-gegenereerde tekst te voorkomen.
- Zoals bij de mock-login geldt: dit mandje/deze bestellingen zijn puur lokaal aan één browser/apparaat en verdwijnen bij het wissen van browserdata.
