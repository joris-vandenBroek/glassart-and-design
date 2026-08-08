# Help-functies in de beheeromgeving — design

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 02-08-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

Datum: 2026-08-02

## Achtergrond

De beheeromgeving wordt bediend door niet-technische medewerkers (zie ook de
notitie over het cache-probleem bij medewerker-login). Een aantal schermen
bevat gedrag dat niet vanzelf spreekt: wanneer een knop uitgegrijsd blijft,
hoe een prijs precies wordt opgebouwd, welke maten wel/niet te kiezen zijn,
of wat er met een verstuurde mail naar de drukker gebeurt. Er bestaat nog
geen hulp/tooltip-patroon in de codebase (geverifieerd: geen `Tooltip`-,
`InfoIcon`-, `HelpIcon`- of `Popover`-component, alleen incidentele native
`title=`-attributen). Dit ontwerp introduceert één herbruikbaar patroon en
past het toe op zes beheerschermen plus twee losse velden.

## Component: `HelpHint`

- Nieuw, herbruikbaar component (bv. `src/components/beheer/HelpHint.tsx`):
  een rond ⓘ-knopje. Klikken/tikken toont een tekstballon (popover) met
  uitleg; nogmaals klikken, elders klikken, of Esc sluit hem. Bewust
  click/tap-gestuurd (niet hover-only), zodat het ook op tablet/telefoon
  werkt.
- Props: minimaal `text: string` (de vertaalde uitleg) en optioneel
  `size: 'sm' | 'md'` voor het verschil tussen schermniveau- en
  veldniveau-icoon.
- Twee toepassingen van hetzelfde component:
  - **Schermniveau**: icoon naast de titel van elke modal/sectie, met
    uitleg over het hele scherm of de hele flow.
  - **Veldniveau**: kleiner icoon direct naast een specifiek label, met
    uitleg over precies dat ene veld.
- Plaatsing volgt de bestaande structuur:
  - Klant, Kunstenaar, Kunstwerk, Prijsgroepen lopen door het gedeelde
    `Modal.tsx` → icoon komt in de titel-regio van de modal.
  - Bestellingen en Prijsmatrix zijn geen edit-modal maar een
    paginasectie (`BestellingenSection.tsx`, `PrijsmatrixSection.tsx`) →
    icoon komt naast de paginatitel/toolbar van die sectie.
- Alle teksten gaan in `messages/nl.json` onder de bestaande
  `beheer`-namespace. Niet in `en.json`/`de.json`/`fr.json` — die hebben
  geen `beheer`-namespace, conform de bestaande conventie (beheer is
  Nederlandstalig-only, zoals eerder vastgelegd bij de
  "Kunstwerk Formaat Alle"-feature).
- Taalregister: korte, simpele zinnen zonder jargon ("Jip en Janneke
  taal"). Lengte varieert per onderwerp — één zin voor een simpel veld,
  een genummerd stappenlijstje voor een flow zoals bestellingen→drukker.

## Content — schermniveau

### Klant (`klantenHelp`, in `KlantModal.tsx` naast de titel)

> Hier bekijk en bewerk je de gegevens van een klant.
> - Geef de klant een **prijsgroep** — dat moet, anders blijft de knop
>   "Goedkeuren" uitgegrijsd.
> - Wil je deze klant koppelen aan een **kunstenaar**? Kies die hieronder.
>   Prijsafspraken en een eventuele opslag voor die kunstenaar stel je niet
>   hier in, maar bij de kunstenaar zelf (scherm "Kunstenaars").
> - De knoppen onderaan: **Opslaan** bewaart je wijzigingen. **Goedkeuren**
>   maakt van een aanvraag een actieve klant. **Afwijzen** wijst de
>   aanvraag af.

### Bestellingen (`bestellingenHelp`, in `BestellingenSection.tsx` naast de paginatitel)

> Zo werkt versturen naar de drukker:
> 1. Vink een of meer bestellingen aan die klaarstaan (status "Te versturen
>    naar drukker").
> 2. Klik op **Versturen naar drukker** — kies een drukker en bekijk de
>    mail voordat je 'm verstuurt.
> 3. Na versturen krijgen alle aangevinkte bestellingen de status
>    "Verstuurd naar drukker".
> 4. Een verstuurde mail terugvinden? Open de drukker zelf (scherm
>    "Drukkers") — daar staat een overzicht van alle verstuurde mails.

### Kunstenaar (`kunstenaarsHelp`, in `KunstenaarsSection.tsx` naast de modal-titel)

> Hier beheer je een kunstenaar en de prijsafspraken die je met hem of
> haar hebt.

### Prijsmatrix (`prijsmatrixHelp`, in `PrijsmatrixSection.tsx` naast de paginatitel)

> Hier stel je de basisprijs in per combinatie van maat en materiaal. Zo
> komt de uiteindelijke prijs tot stand:
> - Meestal: de basisprijs uit deze tabel + de vaste opslag van de
>   kunstenaar (indien van toepassing).
> - Heeft een kunstwerk geen materiaal of geen maat (bv. akoestische
>   stof)? Dan geldt geen matrixprijs, maar de prijs-per-m² die bij dat
>   kunstwerk zelf is ingesteld.
> - Staat er (nog) geen prijs in voor een combinatie? Dan blijft de prijs
>   onbekend totdat je 'm hier invult.

### Kunstwerk (`kunstwerkenHelp`, in `KunstwerkenSection.tsx` naast de modal-titel)

> **Formaat** bepaalt welke maten je kunt aanvinken:
> - **Vierkant**: alleen vierkante maten (breedte = hoogte) zijn te
>   kiezen, de rest is grijs.
> - **Liggend** en **Staand**: alleen niet-vierkante maten zijn te kiezen.
> - **Alle**: elke maat is te kiezen, niets is uitgeschakeld.
>
> Vink je geen enkele maat aan (of geen materiaal)? Dan verschijnt een
> **prijs-per-m²**-veld in plaats van de vaste maat/materiaal-prijzen. Dit
> wordt nu gebruikt voor akoestische stof, maar werkt op dezelfde manier
> voor elk product dat je per vierkante meter wilt verkopen — de klant
> vult dan zelf breedte en hoogte in.

### Prijsgroepen (`prijsgroepenHelp`, in `PrijsgroepenSection.tsx` naast de modal-titel)

> Kies of dit een korting of een opslag is, en vul het percentage in.
> **Let op:** dit is puur informatief — het percentage wordt nergens
> automatisch verrekend in de prijs van een bestelling. Het is alleen een
> label bij de klant.

## Content — veldniveau

### Kunstenaar → Opslag (`kunstenaarsHelpOpslag`, naast het "Opslag"-veld)

> Dit bedrag komt boven op de basisprijs uit de prijsmatrix, voor ieder
> kunstwerk van deze kunstenaar. Bijvoorbeeld: basisprijs €100 + opslag
> €15 = €115. Het is een vast bedrag, geen percentage.

### Kunstenaar → Exclusiviteit (`kunstenaarsHelpExclusiviteit`, naast de "Klant 1"/"Klant 2"-velden)

> Deze kunstenaar kan optioneel exclusief werken voor twee klanten tegelijk
> (nooit voor precies één). Beide leeg = open voor iedereen. Vul je ze in,
> dan moet minstens één van de twee de klant zijn die al bij deze
> kunstenaar hoort (ingesteld bij die klant zelf).

## i18n-sleutels (nieuw, alleen `messages/nl.json`, `beheer`-namespace)

```
klantenHelp
bestellingenHelp
kunstenaarsHelp
kunstenaarsHelpOpslag
kunstenaarsHelpExclusiviteit
prijsmatrixHelp
kunstwerkenHelp
prijsgroepenHelp
```

## Scope-afbakening (niet in deze feature)

- Geen help-icoon bij Drukkers, Instellingen, of andere schermen die niet
  door de gebruiker genoemd zijn — het patroon (`HelpHint`-component) is
  wel generiek genoeg om later moeiteloos uit te breiden.
- Geen wijziging aan de daadwerkelijke prijsberekening, validatie, of
  databasestructuur — dit is uitsluitend uitleg-tekst in de UI.
- Geen aparte help-pagina of documentatie buiten de app; alle uitleg is
  contextueel (in de schermen zelf).

## Tests

- Nieuw: `tests/components/beheer/HelpHint.test.tsx` — opent/sluit de
  popover op klik, sluit op Esc en op klik buiten de popover.
- Per sectie: een test die controleert dat het help-icoon aanwezig is en
  de juiste vertaalsleutel toont bij klikken (uitbreiding van bestaande
  `KlantModal.test.tsx`, `BestellingenSection.test.tsx`,
  `KunstenaarsSection.test.tsx`, `PrijsmatrixSection.test.tsx`,
  `KunstwerkenSection.test.tsx`, `PrijsgroepenSection.test.tsx`).
