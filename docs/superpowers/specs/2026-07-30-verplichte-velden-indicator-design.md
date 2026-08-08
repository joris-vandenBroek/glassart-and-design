# Verplichte velden zichtbaar maken — design

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 30-07-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

## Probleem

Verplichte velden zijn nu onzichtbaar totdat je vastloopt: de Opslaan/Goedkeuren-knop is
`disabled` zonder uitleg waarom (zie bijvoorbeeld `KlantModal.tsx:259`,
`disabled={!prijsgroepId}`, zonder enige hint bij het Prijsgroep-veld zelf). Alleen
`KunstwerkenSection.tsx` heeft al een expliciet patroon (rode rand + hint-tekst per leeg veld).
Overal elders — de overige beheer-modals, het Word-klant-registratieformulier, het
contactformulier, inloggen, wachtwoord-reset en de account-instellingen — ontbreekt elke
visuele indicatie.

## Aanpak

Eén uniform, licht patroon toevoegen bovenop wat er al is, zonder bestaande validatielogica te
wijzigen (behalve bij SettingsSection, zie onder):

- Rood sterretje (`RequiredMark`) direct na de labeltekst van elk veld dat al ergens verplicht
  is (via een bestaand `disabled={...}` op de opslaan-knop, of een bestaand `required`-attribuut).
- Eén legenderegel (`RequiredLegend`, tekst "* verplicht veld") onderaan elke modal-body /
  formulier, boven een eventuele actie-foutmelding.
- `KunstwerkenSection.tsx` behoudt zijn bestaande rode-rand/hint-patroon ongewijzigd; het
  sterretje wordt daar gewoon aan de labels toegevoegd als extra, geen vervanging.
- Geen wijziging aan wélke velden verplicht zijn, behalve bij `SettingsSection.tsx` (zie
  "SettingsSection" hieronder) — daar bestaat nu helemaal geen verplicht-logica en die wordt
  bewust toegevoegd, native `required`, naar het voorbeeld van `RegistrationForm.tsx`.

### Nieuwe gedeelde component

`src/components/RequiredFieldHint.tsx`:

```tsx
export function RequiredMark() {
  return <span className="text-red-400"> *</span>;
}

export function RequiredLegend({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] text-white/40">{children}</p>;
}
```

Gebruik: `{t('xxxLabel')}<RequiredMark />` direct na de bestaande `{t(...)}`-aanroep in het
label, en `<RequiredLegend>{t('verplichtVeldLegende')}</RequiredLegend>` eenmalig onderaan de
velden-lijst van elke modal/formulier die minstens één sterretje bevat.

### Beheer-modals (`messages/nl.json`, namespace `beheer` — bestaat alleen in NL)

Sterretje bij precies de labels die al in de bestaande disabled-conditie van dat bestand zitten:

| Bestand | Labels die een `RequiredMark` krijgen |
|---|---|
| `KlantModal.tsx` | `klantenLabelPrijsgroep` (enige veld dat de Goedkeuren-actie blokkeert — de Opslaan-knop zelf heeft geen validatie en blijft ongewijzigd) |
| `DrukkerModal.tsx` | `drukkersLabelNaam`, `drukkersLabelEmail` |
| `KunstenaarsSection.tsx` | `kunstenaarsLabelNaam`, `kunstenaarsLabelOmschrijvingNl` |
| `KunstwerkenSection.tsx` | Labels van elk veld dat al een `...Verplicht`-hint heeft: Foto, Naam, Formaat, Segmenten, Prijzen/Prijs per m², Omschrijving (NL) |
| `MateriaalsoortenSection.tsx` | `materiaalsoortenLabelOmschrijving` |
| `MaterialenSection.tsx` | `materialenLabelMateriaalsoort`, `materialenLabelDikte`, `materialenLabelOmschrijving` |
| `OnderwerpenSection.tsx` | `onderwerpenLabelOmschrijving` |
| `PrijsgroepenSection.tsx` | `prijsgroepenLabelNaam` |
| `MatenSection.tsx` | `matenLabelBreedte`, `matenLabelHoogte` |
| `SegmentenSection.tsx` | `segmentenLabelOmschrijving` |
| `StijlenSection.tsx` | `stijlenLabelOmschrijving` |
| `VersturenNaarDrukkerDialog.tsx` | `drukkerVersturenLabelDrukker` |

**Buiten scope:** `BestellingModal.tsx` (alle bewerkbare velden zijn losse `placeholder`-inputs
in een tabelregel, geen enkele heeft een `<label>` om een sterretje aan te hangen) en
`AccountOrderModal.tsx` (puur weergave, geen invoervelden).

### Publieke / account-formulieren (namespaces bestaan in `nl`/`en`/`de`/`fr`)

Regel: elk veld met een bestaand `required`-attribuut krijgt een `RequiredMark` naast het label;
geen wijziging aan welke velden dat zijn.

- `RegistrationForm.tsx` (namespace `registrationPage`)
- `ContactForm.tsx` (namespace `contactPage`)
- `CustomerLoginForm.tsx` (namespace `loginPage`)
- `ResetPasswordForm.tsx` (namespace `resetPasswordPage`)

### SettingsSection.tsx (namespace `accountPage.settings`)

Enige bestand waar dit ook een gedragswijziging is: er bestaat nu geen enkele verplicht-check.
Native `required` toevoegen aan dezelfde velden als `RegistrationForm.tsx`: `labelCompanyName`,
`labelContactPerson`, `labelEmail`, `labelPhone`, `labelAddress`, `labelPostcode`, `labelCity` —
elk krijgt ook een `RequiredMark`. Wachtwoord, wachtwoord-bevestiging, taalvoorkeur,
contactvoorkeur én het wachtwoordveld in de "account verwijderen"-sectie blijven ongewijzigd
(geen `required`, geen sterretje) — dat is expliciet zo afgesproken en géén stilzwijgende
uitbreiding.

## i18n

Nieuwe key `verplichtVeldLegende` (waarde: "* verplicht veld"):

- `messages/nl.json`: toevoegen aan `beheer`, `registrationPage`, `contactPage`, `loginPage`,
  `resetPasswordPage`, `accountPage.settings`.
- `messages/en.json`, `messages/de.json`, `messages/fr.json`: toevoegen aan `registrationPage`,
  `contactPage`, `loginPage`, `resetPasswordPage`, `accountPage.settings` (géén `beheer`-key,
  die namespace bestaat daar niet — zie ook `2026-07-30-segment-inline-toevoegen-design.md`).
  Vertalingen: en "* required field", de "* Pflichtfeld", fr "* champ obligatoire".

## Tests

Bestaande tests gebruiken `toHaveTextContent` (substring-match) voor labelteksten, niet exacte
match — een toegevoegd sterretje breekt die niet. Geen aanpassing aan bestaande tests nodig.
Nieuwe tests: voor `SettingsSection.tsx` een test toevoegen die controleert dat de zeven
profielvelden het `required`-attribuut hebben (enige bestand met een echte gedragswijziging).

## Scope

Alle bestanden hierboven genoemd. Uitsluitend visuele indicatie (sterretje + legende) plus, voor
`SettingsSection.tsx` alleen, het toevoegen van ontbrekende `required`-afdwinging naar het
bestaande `RegistrationForm.tsx`-patroon.

## Niet in scope

- Geen wijziging aan bestaande verplicht-logica behalve `SettingsSection.tsx`.
- Geen wijziging aan `KunstwerkenSection.tsx`'s bestaande rode-rand/hint-gedrag.
- `BestellingModal.tsx` en `AccountOrderModal.tsx` blijven ongewijzigd.
- Geen a11y-verbeteringen los van wat native `required` al biedt (geen extra
  `aria-required`/screenreader-tekst).
