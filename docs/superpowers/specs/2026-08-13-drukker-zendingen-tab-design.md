# Zendingen als eigen tabblad in de Drukkergegevens-modal — ontwerp

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 13-08-2026 is vastgelegd,
> inclusief de afwegingen van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later
> verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

Datum: 2026-08-13
Status: ontwerp, goedgekeurd voor implementatie

## Aanleiding

In de Drukkergegevens-modal (`DrukkerModal.tsx`) staan de drukker-velden (naam, adres, e-mail,
prijsafspraken, standaard) en de lijst met eerder verzonden zendingen (kopje "Verzonden mails")
nu onder elkaar in één lange, scrollende modal. Verzoek: zet de zendingenlijst in een eigen
tabblad, gescheiden van het formulier. Bij die gelegenheid ook de naam "Verzonden mails"
vervangen door "Zendingen" — dat sluit aan bij hoe het overal elders in de code al heet
(`useDrukkerZendingen`, type `DrukkerZending`, tabel `drukkerZendingen`,
`/api/drukkers/[id]/zendingen`) en dekt beter dat een zending meerdere bestellingen/klanten kan
bundelen.

## Uitgangssituatie in de code

**Bestaand tab-patroon**: `ModalTabs` (`src/components/ModalTabs.tsx`) wordt al gebruikt in
`KunstenaarsSection.tsx` (tabs "Algemeen"/"Omschrijvingen") en `KunstwerkenSection.tsx`. Het
patroon: een `TabId`-union-type, `activeTab`-state die bij het openen van de modal terugvalt op
de eerste tab, `ModalTabs` bovenaan de modalbody (in een `sticky top-0` wrapper), en per tab een
`<div className={activeTab === 'x' ? '...' : 'hidden'}>` — de content blijft in de DOM maar wordt
verborgen, in plaats van conditioneel gemount/unmount.

**Huidige structuur van `DrukkerModal.tsx`**: het formulier (regels 223–302) en de
zendingen-sectie (regels 310–378, alleen gerenderd bij `state?.mode === 'edit'`) staan al als
twee duidelijk gescheiden blokken in dezelfde `<div data-testid="drukker-modal">`. Er is geen
databron- of propswijziging nodig — alleen de indeling verandert.

**Vertaalsleutels** (`messages/nl.json`, beheer-only dus geen en/de/fr — zie
[[feedback_beheer_teksten_alleen_nl]]): `drukkersZendingenTitel` ("Verzonden mails"),
`drukkersZendingenLeeg` ("Nog geen mails verzonden.").

**Gebruikershandleiding**: `DrukkersChapter.tsx` noemt in de subsectie "Een verzonden zending
bekijken" letterlijk het kopje "Verzonden mails", en de screenshot `public/documentatie/drukkers.png`
toont het huidige scherm zonder tabs.

## Beslissingen

1. **Twee tabs, alleen in `mode: 'edit'`**: "Gegevens" (het bestaande formulier) en "Zendingen"
   (de bestaande lijst). Bij `mode: 'add'` blijven de tabs weg en verschijnt alleen het
   formulier — er is dan sowieso nog niets te tonen bij Zendingen, precies zoals de
   zendingen-sectie nu ook al alleen bij `edit` rendert.
2. **`activeTab` reset naar `'gegevens'`** in dezelfde `useEffect` die bij het wisselen van
   `state` ook `fields`/`viewingZending`/`zendingActionError` reset, zodat de modal altijd op het
   formulier opent, ook als je 'm net op het Zendingen-tabblad had dichtgeklikt.
3. **Geen foutindicator (`hasError`) op de tabs.** `ModalTabs` ondersteunt een rode stip via
   `hasError`, gebruikt bij Kunstenaars voor velden met een validatiefout. Hier is dat niet van
   toepassing: het formulier heeft geen tab-specifieke validatiefouten die op het andere tabblad
   verborgen zouden blijven (de enige fout, `actionError`, hoort bij opslaan/verwijderen en blijft
   zichtbaar in het formulier-tab).
4. **Rename in `messages/nl.json`**:
   - `drukkersZendingenTitel`: "Verzonden mails" → "Zendingen" (wordt de tab-label i.p.v. een
     sectiekopje boven de lijst — het sectiekopje zelf vervalt, de tab-titel neemt die rol over).
   - `drukkersZendingenLeeg`: "Nog geen mails verzonden." → "Nog geen zendingen."
   - `drukkersVerwijderBlocked` ("Deze drukker heeft al verzonden mails en kan niet verwijderd
     worden.") blijft ongewijzigd — dat is een verklarende zin, geen label, en blijft prima
     leesbaar naast de nieuwe naamgeving.
   - Nieuwe sleutels voor de tab-labels zelf: `drukkersTabGegevens` ("Gegevens"),
     `drukkersTabZendingen` ("Zendingen") — zelfde naampatroon als
     `kunstenaarsTabAlgemeen`/`kunstenaarsTabOmschrijvingen`.
5. **Test-id-prefix** voor `ModalTabs` wordt `drukker-modal` (analoog aan `kunstenaar-modal`),
   dus tabs krijgen `data-testid="drukker-modal-tab-gegevens"` / `"drukker-modal-tab-zendingen"`.

## Niet in scope

- Geen wijziging aan de databron, hooks, API-routes of het `DrukkerZending`-type — alleen de
  indeling en labels in `DrukkerModal.tsx` en de bijbehorende vertaalsleutels.
- Geen wijziging aan `ZendingBekijkenModal.tsx` of het versturen van zendingen
  (`VersturenNaarDrukkerDialog.tsx`).
- Geen tabs voor `mode: 'add'` — bewust ongewijzigd t.o.v. nu.

## Documentatie

`DrukkersChapter.tsx` (subsectie "Een verzonden zending bekijken") noemt nu letterlijk het kopje
"Verzonden mails" — die tekst wordt bijgewerkt naar "Zendingen" met een korte vermelding dat dit
een eigen tabblad is naast "Gegevens". De screenshot `public/documentatie/drukkers.png` toont het
scherm vóór de tabs-wijziging en moet opnieuw gemaakt worden zodra het nieuwe scherm klaar is
(zie [[feedback_handleiding_screenshot_techniek]] voor de werkwijze,
[[project_handleiding_screenshots_status]] bijwerken na afloop).

## Testen

- `tests/components/beheer/DrukkerModal.test.tsx`: bestaande zendingen-tests (`describe('DrukkerModal
  zendingen', ...)`) moeten eerst naar het Zendingen-tabblad klikken voordat de lijst zichtbaar is
  — `fireEvent.click(screen.getByTestId('drukker-modal-tab-zendingen'))`. De tekstassertie "Nog
  geen mails verzonden." wordt "Nog geen zendingen.". De verwijder-blokkade-test
  (`'Deze drukker heeft al verzonden mails...'`) blijft ongewijzigd, want die tekst verandert niet.
- Nieuwe test: bij het openen van de modal is standaard het Gegevens-tabblad actief (formulier
  zichtbaar, zendingenlijst niet) en pas na een klik op het Zendingen-tabblad verschijnt de lijst.
- Nieuwe test: bij `mode: 'add'` zijn er geen tabs (`queryByTestId('drukker-modal-tab-gegevens')`
  is null) en staat het formulier direct zichtbaar.
