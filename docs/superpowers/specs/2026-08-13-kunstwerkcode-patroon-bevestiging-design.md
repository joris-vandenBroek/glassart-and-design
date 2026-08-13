# Kunstwerkcode — bevestiging bij afwijkend patroon

Datum: 2026-08-13
Status: ontwerp, goedgekeurd voor implementatie

## Aanleiding

`docs/superpowers/specs/2026-08-10-kunstwerk-code-design.md` legde bewust géén vorm-eis op
aan de kunstwerkcode: "een vast formaat (drie letters, streepje, vijf cijfers) zou
`Akoestische stof` meteen ongeldig maken." Die uitzondering blijft terecht — een code is
niet altijd AAA-BBB-00001 — maar de beheerder krijgt op dit moment geen signaal als hij
per ongeluk een code intypt die van het gebruikelijke formaat afwijkt (bijvoorbeeld een
tikfout, of een vergeten volgnummer). Doel van dit ontwerp: waarschuwen én laten bevestigen
bij afwijking, zonder afwijkende codes te verbieden.

## Patroon

Nieuw bestand `src/lib/kunstwerkCodePatroon.ts`:

```ts
const STANDAARD_KUNSTWERK_CODE = /^[A-Z]{3}-[A-Z]{3}-\d{5}$/;

export function voldoetAanStandaardKunstwerkCode(code: string): boolean {
  return STANDAARD_KUNSTWERK_CODE.test(code.trim());
}
```

Hoofdlettergevoelig, exact drie letters, streepje, drie letters, streepje, vijf cijfers
(bv. `GLA-JAC-00001`). `Akoestische stof`, `gla-jac-00001` en `GLA-JAC-1` voldoen bewust
niet. Losstaand bestand met één functie, naast het bestaande
`src/lib/kunstwerkCodeVoorstel.ts` dat een ander doel dient (volgende code voorstellen op
basis van een prefix) — geen van beide hergebruikt de ander se logica.

## Trigger in `KunstwerkenSection.tsx`

`pendingCodeWijziging` (regel 132, `useState<string | null>`) wordt hernoemd naar
`pendingCodeBevestiging` — puur een naamswijziging, de test-ids en het bestaande gedrag
voor een echte codewijziging blijven ongewijzigd.

In `handleSave` (rond regel 540), ná de bestaande dubbele-code-check en vóór het opslaan:

```ts
const codeIsGewijzigd = modalState.mode === 'edit' && schoneCode !== modalState.kunstwerk.code;
const codeWordtNieuwIngesteld = modalState.mode === 'add' || codeIsGewijzigd;
const wijktAfVanPatroon = codeWordtNieuwIngesteld && !voldoetAanStandaardKunstwerkCode(schoneCode);

if (codeIsGewijzigd || wijktAfVanPatroon) {
  setActionError(null);
  setPendingCodeBevestiging(schoneCode);
  return;
}
await bewaarKunstwerk();
```

Resulterende scenario's:

| Situatie | Popup? |
|---|---|
| Nieuw kunstwerk, code volgt patroon | Nee, direct opslaan |
| Nieuw kunstwerk, code wijkt af | Ja — alleen patroon-tekst |
| Bestaand kunstwerk, code ongewijzigd (ook als hij al afwijkt, zoals `Akoestische stof`) | Nee, direct opslaan |
| Bestaand kunstwerk, code gewijzigd, nieuwe waarde volgt patroon | Ja — bestaande wijziging-tekst (ongewijzigd gedrag) |
| Bestaand kunstwerk, code gewijzigd, nieuwe waarde wijkt af | Ja — gecombineerde tekst |

De laatste rij is de reden voor "één gecombineerde popup": geen twee losse
bevestigingsstappen na elkaar.

## Popup-inhoud (render, rond regel 727)

Titel, tekst en bevestigknop worden afgeleid van `codeIsGewijzigd` en `wijktAfVanPatroon`,
herberekend uit de huidige `code`/`modalState` op het moment dat de popup zichtbaar is (het
invoerveld is dan verborgen, dus deze waarden veranderen niet meer terwijl de popup open
staat — zelfde aanname als de bestaande implementatie al maakt).

- Titel: `kunstwerkenCodeWijzigenTitel` als `codeIsGewijzigd`, anders
  `kunstwerkenCodePatroonTitel`.
- Tekst: `kunstwerkenCodeWijzigenTekst` als `codeIsGewijzigd`, gevolgd door
  `kunstwerkenCodePatroonTekst` als `wijktAfVanPatroon` — beide tonen bij de gecombineerde
  situatie, in die volgorde.
- Bevestigknop: `kunstwerkenCodeWijzigenBevestig` ("Code wijzigen") als `codeIsGewijzigd`,
  anders `kunstwerkenCodePatroonBevestig` ("Toch opslaan").
- Annuleren blijft ongewijzigd: sluit de popup, slaat niets op, `code`-veld blijft zoals
  getypt.

## Vertalingen

`messages/nl.json`, beheer-blok, nieuw naast de bestaande `kunstwerkenCodeWijzigen*`-sleutels:

- `kunstwerkenCodePatroonTitel` — "Deze code wijkt af van het gebruikelijke formaat."
- `kunstwerkenCodePatroonTekst` — "Kunstwerkcodes volgen meestal het formaat AAA-BBB-00001
  (drie letters, drie letters, vijf cijfers). Weet je zeker dat je met deze code wilt
  doorgaan?"
- `kunstwerkenCodePatroonBevestig` — "Toch opslaan"

Alleen `nl.json`, zoals alle beheer-only UI-teksten in dit scherm.

## Gebruikershandleiding

`src/components/beheer/documentatie/chapters/KunstwerkenChapter.tsx`, sectie
`kunstwerken-code`: één zin toevoegen die het aanbevolen formaat en de bevestigingsstap bij
afwijking noemt, aansluitend op de bestaande alinea over prefix en volgnummer. Geen
schermwijziging (de popup is nieuwe tekst binnen een bestaand element), dus geen nieuwe
screenshot nodig.

## Tests

Nieuw, test-driven (eerst falend):

- `tests/lib/kunstwerkCodePatroon.test.ts`: standaardvorm accepteert (incl. randgevallen als
  precies 5 cijfers vs. 4 of 6), `Akoestische stof` weigert, kleine letters weigeren,
  ontbrekend streepje/verkeerd aantal letters weigert.
- `tests/components/beheer/KunstwerkenSection.test.tsx` uitbreiden:
  - nieuw kunstwerk, afwijkende code → popup met patroon-tekst, tegenhouden tot bevestigen;
    "Toch opslaan" slaat op, "Annuleren" niet.
  - nieuw kunstwerk, standaardcode → geen popup, direct opslaan (regressie op bestaand
    gedrag, nu met de nieuwe check ernaast).
  - bestaand kunstwerk, code ongewijzigd en afwijkend → geen popup bij opslaan van een
    ander veld.
  - bestaand kunstwerk, code gewijzigd naar afwijkende waarde → gecombineerde tekst, knop
    "Code wijzigen".

Geen wijziging aan API, database of andere schermen — dit is uitsluitend
cliëntvalidatie/bevestiging, net als de bestaande dubbele-code-check in hetzelfde bestand.

## Wat dit ontwerp bewust niet doet

- Geen verbod op afwijkende codes. `Akoestische stof` en vergelijkbare codes blijven
  mogelijk, na bevestiging.
- Geen serverzijdige validatie van het patroon. De 400/409-grenzen in
  `src/app/api/kunstwerken/route.ts` en `[id]/route.ts` blijven ongewijzigd — dit is een
  UI-waarschuwing, geen datamodel-eis.
- Geen popup bij een ongewijzigde, al bestaande afwijkende code. Dat zou bij elk opslaan
  van `Akoestische stof` (of enig ander bestaand afwijkend kunstwerk) een overbodige
  bevestiging tonen voor iets dat niet verandert.
