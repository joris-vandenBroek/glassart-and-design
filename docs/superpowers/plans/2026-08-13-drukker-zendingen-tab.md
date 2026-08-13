# Zendingen als eigen tabblad bij drukkers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Splits de Drukkergegevens-modal in twee tabbladen — "Gegevens" (het bestaande formulier) en "Zendingen" (de lijst met verzonden zendingen, nu nog "Verzonden mails" genoemd) — en hernoem "Verzonden mails" naar "Zendingen" in de UI-teksten.

**Architecture:** Hergebruik van het bestaande `ModalTabs`-component (`src/components/ModalTabs.tsx`), op precies dezelfde manier als `KunstenaarsSection.tsx` en `KunstwerkenSection.tsx` het al gebruiken: een `activeTab`-state, twee content-`<div>`'s die via een `hidden`-class in/uit beeld gaan (blijven in de DOM), en de tabs alleen zichtbaar bij een bestaande drukker (`mode: 'edit'`).

**Tech Stack:** React/TSX, next-intl, Vitest + React Testing Library (bestaande conventies in `DrukkerModal.tsx` / `DrukkerModal.test.tsx`).

## Global Constraints

- Beheer-only UI-tekst hoeft alleen in `messages/nl.json` te staan — geen en/de/fr-vertaling nodig.
- `drukkersVerwijderBlocked` ("Deze drukker heeft al verzonden mails en kan niet verwijderd worden.") blijft **ongewijzigd** — dat is een verklarende zin, geen label.
- Geen wijziging aan `useDrukkerZendingen`, `DrukkerZending`, de API-routes onder `/api/drukkers/[id]/zendingen`, of `ZendingBekijkenModal.tsx`.
- Tabs verschijnen alleen bij `state?.mode === 'edit'`; bij `mode: 'add'` blijft het scherm zoals nu (alleen het formulier, geen tabs).

---

### Task 1: Tabbladen in `DrukkerModal`

**Files:**
- Modify: `messages/nl.json`
- Modify: `src/components/beheer/DrukkerModal.tsx`
- Test: `tests/components/beheer/DrukkerModal.test.tsx`

**Interfaces:**
- Consumes: `ModalTabs` uit `@/components/ModalTabs`, exacte signature `ModalTabs<Id extends string>({ tabs: {id, label, hasError?}[], activeTabId: Id, onTabChange: (id: Id) => void, testIdPrefix: string })` (bestaat al, ongewijzigd).
- Produces: tab-test-id's `drukker-modal-tab-gegevens` / `drukker-modal-tab-zendingen` (via `testIdPrefix="drukker-modal"`), gebruikt in de tests van deze taak.

- [ ] **Step 1: Schrijf de falende tests**

Open `tests/components/beheer/DrukkerModal.test.tsx`. Voeg vlak vóór `describe('DrukkerModal zendingen', ...)` (regel 137) een nieuw blok toe:

```tsx
describe('DrukkerModal tabs', () => {
  it('shows Gegevens and Zendingen tabs when editing, with Gegevens active by default', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal({ mode: 'edit', drukker: DRUKKER });
    expect(await screen.findByTestId('drukker-modal-tab-gegevens')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('drukker-modal-tab-zendingen')).toHaveAttribute('aria-selected', 'false');
  });

  it('switches to the Zendingen tab on click', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal({ mode: 'edit', drukker: DRUKKER });
    await screen.findByTestId('drukker-modal-tab-gegevens');
    fireEvent.click(screen.getByTestId('drukker-modal-tab-zendingen'));
    expect(screen.getByTestId('drukker-modal-tab-zendingen')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('drukker-modal-tab-gegevens')).toHaveAttribute('aria-selected', 'false');
  });

  it('shows no tabs when adding a new drukker', () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal({ mode: 'add' });
    expect(screen.queryByTestId('drukker-modal-tab-gegevens')).not.toBeInTheDocument();
    expect(screen.queryByTestId('drukker-modal-tab-zendingen')).not.toBeInTheDocument();
  });
});
```

Werk daarna binnen `describe('DrukkerModal zendingen', ...)` de eerste test bij — de tekst "Verzonden mails" wordt "Zendingen", dus de lege-staat-tekst verandert mee:

```tsx
  it('shows "nog geen zendingen" once loaded empty', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal({ mode: 'edit', drukker: DRUKKER });
    expect(await screen.findByTestId('drukker-modal-zendingen-leeg')).toHaveTextContent(
      'Nog geen zendingen.'
    );
  });
```

(Dit vervangt alleen de test-titel en de verwachte tekst `'Nog geen mails verzonden.'` → `'Nog geen zendingen.'`; de rest van de test blijft gelijk.)

- [ ] **Step 2: Bevestig dat de nieuwe/gewijzigde tests falen**

Run: `npx vitest run tests/components/beheer/DrukkerModal.test.tsx -t "tabs"`
Expected: FAIL — `drukker-modal-tab-gegevens`/`drukker-modal-tab-zendingen` bestaan nog niet.

Run: `npx vitest run tests/components/beheer/DrukkerModal.test.tsx -t "nog geen zendingen"`
Expected: FAIL — de huidige tekst is nog "Nog geen mails verzonden.".

- [ ] **Step 3: Hernoem en voeg vertaalsleutels toe in `messages/nl.json`**

Zoek de bestaande `drukkers*`-sleutels (rond regel 809–812):

```json
    "drukkersModalTitel": "Drukkergegevens",
    "drukkersVerwijderBlocked": "Deze drukker heeft al verzonden mails en kan niet verwijderd worden.",
    "drukkersZendingenTitel": "Verzonden mails",
    "drukkersZendingenLeeg": "Nog geen mails verzonden.",
```

Vervang door (nieuwe `drukkersTabGegevens`/`drukkersTabZendingen` toegevoegd na `drukkersModalTitel`, zelfde plek als `kunstenaarsTabAlgemeen`/`kunstenaarsTabOmschrijvingen` na `kunstenaarsModalTitel`; `drukkersZendingenTitel` en `drukkersZendingenLeeg` hernoemd; `drukkersVerwijderBlocked` ongewijzigd):

```json
    "drukkersModalTitel": "Drukkergegevens",
    "drukkersTabGegevens": "Gegevens",
    "drukkersTabZendingen": "Zendingen",
    "drukkersVerwijderBlocked": "Deze drukker heeft al verzonden mails en kan niet verwijderd worden.",
    "drukkersZendingenTitel": "Zendingen",
    "drukkersZendingenLeeg": "Nog geen zendingen.",
```

`drukkersZendingenTitel` wordt na Task 1 nergens meer gerenderd (de tab-titel neemt die rol over) maar blijft in de bestandsstructuur staan; dat is geen probleem — er is geen lint-regel die ongebruikte i18n-sleutels afkeurt in dit project (zie de bestaande sleutels rond `drukkersZendingenBekijken` e.d. die ook alleen impliciet via componenten gebruikt worden). Laat de overige `drukkers*`-sleutels ongewijzigd.

- [ ] **Step 4: Implementeer de tabs in `DrukkerModal.tsx`**

Voeg de import toe, direct na de `Modal`-import (regel 5):

```tsx
import { Modal } from '@/components/Modal';
import { ModalTabs } from '@/components/ModalTabs';
```

Voeg het `TabId`-type toe, direct na `type ModalState = ...` (regel 16):

```tsx
type ModalState = { mode: 'add' } | { mode: 'edit'; drukker: Drukker } | null;
type TabId = 'gegevens' | 'zendingen';
```

Voeg de tab-state toe, direct na `const [fields, setFields] = useState<FormFields>(EMPTY_FIELDS);` (regel 63):

```tsx
  const [fields, setFields] = useState<FormFields>(EMPTY_FIELDS);
  const [activeTab, setActiveTab] = useState<TabId>('gegevens');
```

Werk de bestaande `useEffect` bij (regels 72–82) zodat de actieve tab terugvalt op "Gegevens" telkens als de modal opnieuw opent:

```tsx
  useEffect(() => {
    if (state?.mode === 'edit') {
      const { naam, adres, postcode, plaats, email, prijsafspraken, standaard } = state.drukker;
      setFields({ naam, adres, postcode, plaats, email, prijsafspraken, standaard: standaard ?? false });
    } else if (state?.mode === 'add') {
      setFields(EMPTY_FIELDS);
    }
    setActionError(null);
    setViewingZending(null);
    setZendingActionError(null);
    setActiveTab('gegevens');
  }, [state]);
```

Vervang tot slot het hele modal-body-blok — van `<div data-testid="drukker-modal" ...>` (regel 223) tot en met de bijbehorende sluitende `</div>` (regel 379) — door:

```tsx
      <div data-testid="drukker-modal" className="flex flex-col gap-2 text-sm text-white/80">
        {state?.mode === 'edit' && (
          <div className="sticky top-0 z-10 bg-charcoal pb-2">
            <ModalTabs
              tabs={[
                { id: 'gegevens', label: t('drukkersTabGegevens') },
                { id: 'zendingen', label: t('drukkersTabZendingen') },
              ]}
              activeTabId={activeTab}
              onTabChange={setActiveTab}
              testIdPrefix="drukker-modal"
            />
          </div>
        )}

        <div className={activeTab === 'gegevens' ? 'flex flex-col gap-2' : 'hidden'}>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            <span>
              {t('drukkersLabelNaam')}
              <RequiredMark />
            </span>
            <input
              type="text"
              value={fields.naam}
              onChange={(event) => setField('naam', event.target.value)}
              data-testid="drukker-modal-naam"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('drukkersLabelAdres')}
            <input
              type="text"
              value={fields.adres}
              onChange={(event) => setField('adres', event.target.value)}
              data-testid="drukker-modal-adres"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
              {t('drukkersLabelPostcode')}
              <input
                type="text"
                value={fields.postcode}
                onChange={(event) => setField('postcode', event.target.value)}
                data-testid="drukker-modal-postcode"
                className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
              {t('drukkersLabelPlaats')}
              <input
                type="text"
                value={fields.plaats}
                onChange={(event) => setField('plaats', event.target.value)}
                data-testid="drukker-modal-plaats"
                className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            <span>
              {t('drukkersLabelEmail')}
              <RequiredMark />
            </span>
            <input
              type="email"
              value={fields.email}
              onChange={(event) => setField('email', event.target.value)}
              data-testid="drukker-modal-email"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('drukkersLabelPrijsafspraken')}
            <textarea
              value={fields.prijsafspraken}
              onChange={(event) => setField('prijsafspraken', event.target.value)}
              data-testid="drukker-modal-prijsafspraken"
              rows={4}
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/60">
            <input
              type="checkbox"
              checked={fields.standaard}
              onChange={(event) => setField('standaard', event.target.checked)}
              data-testid="drukker-modal-standaard"
            />
            {t('drukkersLabelStandaard')}
          </label>

          <RequiredLegend testId="drukker-modal-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>
        </div>

        {actionError && (
          <p data-testid="drukker-modal-error" className="text-xs text-red-400">
            {actionError}
          </p>
        )}

        {state?.mode === 'edit' && (
          <div className={activeTab === 'zendingen' ? 'flex flex-col gap-2' : 'hidden'}>
            {zendingenError ? (
              <p data-testid="drukker-modal-zendingen-error" className="text-xs text-red-400">
                {t('drukkersActionError')}
              </p>
            ) : zendingen === null ? null : zendingen.length === 0 ? (
              <p data-testid="drukker-modal-zendingen-leeg" className="text-white/50">
                {t('drukkersZendingenLeeg')}
              </p>
            ) : (
              <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                {zendingen.map((zending) => {
                  const counts = afgerondCounts(zending);
                  return (
                    <li key={zending.id} data-testid={`drukker-zending-${zending.id}`} className="rounded-sm bg-black/30 p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span>
                          {zending.zendingnummer && `${zending.zendingnummer} — `}
                          {zending.verzondenOp ? zending.verzondenOp.toLocaleString('nl-NL') : ''} —{' '}
                          {t('drukkersZendingenSamenvatting', {
                            klanten: zending.aantalKlanten,
                            regels: zending.aantalRegels,
                          })}
                        </span>
                        <button
                          type="button"
                          data-testid={`drukker-zending-bekijken-${zending.id}`}
                          onClick={() => setViewingZending(zending)}
                          className="shrink-0 text-white/50 underline underline-offset-2 hover:text-white"
                        >
                          {t('drukkersZendingenBekijken')}
                        </button>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        {counts && (
                          <>
                            <span
                              data-testid={`drukker-zending-afgerond-badge-${zending.id}`}
                              className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/70"
                            >
                              {t('drukkersZendingAfgerondBadge', { afgerond: counts.afgerond, totaal: counts.totaal })}
                            </span>
                            {counts.afgerond < counts.totaal && (
                              <button
                                type="button"
                                data-testid={`drukker-zending-afronden-${zending.id}`}
                                onClick={() => handleMarkeerZendingAlsAfgerond(zending)}
                                className="shrink-0 text-white/50 underline underline-offset-2 hover:text-white"
                              >
                                {t('drukkersMarkeerZendingAlsAfgerond')}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      {zendingActionError?.zendingId === zending.id && (
                        <p data-testid="drukker-zending-afronden-error" className="mt-1.5 text-red-400">
                          {zendingActionError.message}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
```

Let op: `actionError` staat nu **buiten** beide tab-`<div>`'s (onvoorwaardelijk zichtbaar), zodat een foutmelding van "Verwijderen" (bijv. de "heeft al verzonden mails"-blokkade) zichtbaar blijft ongeacht welk tabblad actief is.

- [ ] **Step 5: Bevestig dat alle tests in dit bestand slagen**

Run: `npx vitest run tests/components/beheer/DrukkerModal.test.tsx`
Expected: PASS — alle tests groen, inclusief de 3 nieuwe tab-tests en de bijgewerkte "nog geen zendingen"-test. De overige bestaande zendingen-tests (afronden-badge, afronden-knop, Escape/popup, zendingnummer, scroll-hoogte, verwijder-blokkade) blijven ongewijzigd slagen: ze zoeken elementen op via `getByTestId`/`findByTestId`, wat ook werkt terwijl die content via de `hidden`-class buiten beeld staat.

- [ ] **Step 6: Commit**

```bash
git add messages/nl.json src/components/beheer/DrukkerModal.tsx tests/components/beheer/DrukkerModal.test.tsx
git commit -m "feat: zet zendingen in een eigen tabblad bij drukkers"
```

---

### Task 2: Documentatie bijwerken

**Files:**
- Modify: `src/components/beheer/documentatie/chapters/DrukkersChapter.tsx`

**Interfaces:** geen — alleen tekstwijziging, geen nieuwe props of exports.

- [ ] **Step 1: Werk de screenshot-caption en de subsectietekst bij**

Open `src/components/beheer/documentatie/chapters/DrukkersChapter.tsx`. Vervang het `Screenshot`-blok:

```tsx
      <Screenshot
        src="/documentatie/drukkers.png"
        alt="Het drukkerscherm met naam, adres, prijsafspraken, de optie Standaard drukker en de verzonden mails"
        caption="Het drukkerscherm, met de optie Standaard drukker en de verzonden mails"
      />
```

door:

```tsx
      <Screenshot
        src="/documentatie/drukkers.png"
        alt="Het drukkerscherm met de tabbladen Gegevens en Zendingen, op het Gegevens-tabblad naam, adres, prijsafspraken en de optie Standaard drukker"
        caption="Het drukkerscherm, tabblad Gegevens"
      />
```

Vervang de tekst in de subsectie "Een verzonden zending bekijken":

```tsx
      <SubSection id="drukkers-zending-bekijken" title="Een verzonden zending bekijken">
        <P>
          Bij een drukker zie je onder &quot;Verzonden mails&quot; alle zendingen die naar deze drukker zijn
          gestuurd. Klik op &quot;Bekijken&quot; om te zien wat er precies naar de drukker is gestuurd — bij
          meerdere bestellingen in één zending staat elke bestelling in een eigen tabblad, met het afleveradres
          en de productregels (foto, code, materiaal, maat en aantal) exact zoals die in de verzonden mail
          stonden. Er staan bewust geen prijzen bij: de mail naar de drukker bevat die ook niet — voor de
          prijzen van een bestelling ga je naar <DocLink anchor="bestelproces-bewerken">een bestelling
          bewerken</DocLink>.
        </P>
      </SubSection>
```

door:

```tsx
      <SubSection id="drukkers-zending-bekijken" title="Een verzonden zending bekijken">
        <P>
          Bij een drukker staat naast het tabblad &quot;Gegevens&quot; het tabblad &quot;Zendingen&quot;, met
          alle zendingen die naar deze drukker zijn gestuurd. Klik op &quot;Bekijken&quot; om te zien wat er
          precies naar de drukker is gestuurd — bij meerdere bestellingen in één zending staat elke bestelling
          in een eigen tabblad, met het afleveradres en de productregels (foto, code, materiaal, maat en
          aantal) exact zoals die in de verzonden mail stonden. Er staan bewust geen prijzen bij: de mail
          naar de drukker bevat die ook niet — voor de prijzen van een bestelling ga je naar{' '}
          <DocLink anchor="bestelproces-bewerken">een bestelling bewerken</DocLink>.
        </P>
      </SubSection>
```

- [ ] **Step 2: Bevestig dat de documentatie-tests nog slagen**

Run: `npx vitest run tests/components/beheer/documentatie/`
Expected: PASS — met name `anchorIntegrity.test.tsx` (de anchor `drukkers-zending-bekijken` blijft ongewijzigd) en `chapterScreenshots.test.tsx` (het `src`-pad `/documentatie/drukkers.png` blijft ongewijzigd, alleen `alt`/`caption` veranderen — die tests controleren alleen dát er een niet-lege `alt` is, niet de exacte tekst).

- [ ] **Step 3: Commit**

```bash
git add src/components/beheer/documentatie/chapters/DrukkersChapter.tsx
git commit -m "docs: beschrijf het Zendingen-tabblad bij drukkers in de handleiding"
```

---

### Task 3: Volledige verificatie

**Files:** geen wijzigingen — alleen commando's.

- [ ] **Step 1: Type-check**

Run: `npx tsc --noEmit`
Expected: geen output (geen typefouten).

- [ ] **Step 2: Volledige testsuite**

Run: `npm test`
Expected: alle tests slagen.

- [ ] **Step 3: Handmatige visuele controle**

Start de dev server (`npm run dev`), open `/nl/beheer`, ga naar Drukkers, open een bestaande drukker. Controleer: de modal opent op het tabblad "Gegevens"; klik op "Zendingen" toont de zendingenlijst (of "Nog geen zendingen." als die leeg is); "Bekijken" op een zending werkt nog steeds; klik terug naar "Gegevens" laat de ingevulde velden zien. Open ook "Drukker toevoegen" en controleer dat daar geen tabbladen verschijnen.

**Niet in dit plan:** de screenshot `public/documentatie/drukkers.png` opnieuw vastleggen met het nieuwe tabblad-scherm — dat gebeurt na afloop van dit plan via de bestaande claude-in-chrome + gif_creator-techniek (zie het "Handleiding screenshot-techniek"-geheugen), niet als losse plan-stap, conform hoe eerdere screenshot-afhankelijke wijzigingen in dit project zijn aangepakt.
