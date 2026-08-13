# Klantmodal: tabs Gegevens/Adressen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De net doorgevoerde 3-koloms layout van de "Klantgegevens"-modal (`KlantModal.tsx`) vervangen door twee tabbladen — **Gegevens** (bedrijfsgegevens + koppelingen, nog steeds 2 kolommen naast elkaar) en **Adressen** (hoofdadres, afleveradres, factuuradres) — omdat de 3-koloms versie in de praktijk scheve kolomhoogtes gaf (de Adressen-kolom is structureel langer dan de andere twee) en bij een afgewezen klant met een reden-tekst alsnog een scrollbalk toonde.

**Architecture:** Hergebruikt de bestaande `ModalTabs`-component (`src/components/ModalTabs.tsx`, al gebruikt door `KunstwerkenSection.tsx`) met hetzelfde CSS-`hidden`-toggle-patroon: tab-inhoud blijft gemount, wordt alleen visueel verborgen. Dit betekent dat elk veld zijn bestaande `data-testid` behoudt en bestaande, niet-tab-gerelateerde tests ongewijzigd blijven werken. De Adressen-tab-inhoud is een simpele 1-koloms stack (zoals het scherm er vóór de 3-koloms-redesign uitzag), niet verder onderverdeeld — dat hoeft niet, want een aparte tab lost de hoogte-onbalans al structureel op.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, `next-intl`, Vitest + React Testing Library.

## Global Constraints

- Geen enkele bestaande `data-testid` in `KlantModal.tsx` verandert van naam, behalve de twee die letterlijk niet meer kloppen omdat hun betekenis verandert: de kolom "Adressen" bestaat niet meer als kolom (die inhoud verhuist naar de nieuwe Adressen-tab, zonder een `klant-modal-kolom-adressen`-wrapper-testid — individuele veld-testids zoals `klant-modal-address`/`klant-modal-deliveryAddress`/etc. blijven ongewijzigd en zijn voldoende).
- "Gebruikt standaardadres" als tekst voor een leeg afleverings-/factuuradres blijft ongewijzigd gedrag — dat werkt al goed en hoeft niet aangepast te worden (bevestigd door Joris).
- `beheer`-namespace-i18n-sleutels blijven alleen in `messages/nl.json`.
- `npm test` (niet een subset) draait minstens één keer aan het eind (Task 2).

---

### Task 1: Tabs Gegevens/Adressen in `KlantModal.tsx`

**Files:**
- Modify: `src/components/beheer/KlantModal.tsx`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/KlantModal.test.tsx`

**Interfaces:**
- Consumes: `ModalTabs`/`ModalTab` from `@/components/ModalTabs` (bestaand, ongewijzigd — generieke `ModalTabs<Id extends string>` component).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing tests**

In `messages/nl.json`, find de regel `"klantenSectieBedrijfsgegevens": "Bedrijfsgegevens",` (rond regel 439, binnen het `beheer`-object) en vervang de drie regels eronder:
```json
    "klantenSectieBedrijfsgegevens": "Bedrijfsgegevens",
    "klantenSectieAdressen": "Adressen",
    "klantenSectieKoppelingen": "Koppelingen",
```
door:
```json
    "klantenSectieBedrijfsgegevens": "Bedrijfsgegevens",
    "klantenSectieKoppelingen": "Koppelingen",
    "klantenTabGegevens": "Gegevens",
    "klantenTabAdressen": "Adressen",
```
(`klantenSectieAdressen` wordt verwijderd — de in-content kop "ADRESSEN" was alleen nodig toen Adressen een kolom naast de andere twee was; als eigen tabblad heeft de tab-knop zelf al het label "Adressen", een kop erboven zou dat dubbelop maken.)

In `tests/components/beheer/KlantModal.test.tsx`, wijzig eerst de `renderModal`-helperfunctie (rond regel 83) om ook `rerender` terug te geven — verander:
```tsx
  const onClose = vi.fn();
  const onUpdated = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <KlantModal
        klant={klant}
        prijsgroepen={prijsgroepen}
        kunstenaars={kunstenaars}
        klanten={klanten}
        btwTarieven={btwTarieven}
        btwLoadError={btwLoadError}
        onClose={onClose}
        onUpdated={onUpdated}
      />
    </NextIntlClientProvider>
  );
  return { onClose, onUpdated };
```
naar:
```tsx
  const onClose = vi.fn();
  const onUpdated = vi.fn();
  const { rerender } = render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <KlantModal
        klant={klant}
        prijsgroepen={prijsgroepen}
        kunstenaars={kunstenaars}
        klanten={klanten}
        btwTarieven={btwTarieven}
        btwLoadError={btwLoadError}
        onClose={onClose}
        onUpdated={onUpdated}
      />
    </NextIntlClientProvider>
  );
  return { onClose, onUpdated, rerender };
```

Then replace the existing test `'groups fields into Bedrijfsgegevens, Adressen and Koppelingen columns'` (currently the last test in the file, right before the closing `});` of the `describe` block) with these five tests:

```tsx
  it('starts on the Gegevens tab and switches tab content when a tab is clicked', () => {
    renderModal(KLANT);
    expect(screen.getByTestId('klant-modal-tab-gegevens')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('klant-modal-tab-adressen')).toHaveAttribute('aria-selected', 'false');
    fireEvent.click(screen.getByTestId('klant-modal-tab-adressen'));
    expect(screen.getByTestId('klant-modal-tab-adressen')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('klant-modal-tab-gegevens')).toHaveAttribute('aria-selected', 'false');
  });

  it('resets to the Gegevens tab each time a different klant is opened', () => {
    const { rerender } = renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-tab-adressen'));
    expect(screen.getByTestId('klant-modal-tab-adressen')).toHaveAttribute('aria-selected', 'true');
    rerender(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <KlantModal
          klant={ANDERE_KLANT}
          prijsgroepen={PRIJSGROEPEN}
          kunstenaars={KUNSTENAARS}
          klanten={[KLANT, ANDERE_KLANT]}
          btwTarieven={BTWTARIEVEN}
          btwLoadError={false}
          onClose={vi.fn()}
          onUpdated={vi.fn()}
        />
      </NextIntlClientProvider>
    );
    expect(screen.getByTestId('klant-modal-tab-gegevens')).toHaveAttribute('aria-selected', 'true');
  });

  it('groups fields into Bedrijfsgegevens and Koppelingen columns within the Gegevens tab', () => {
    renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-bewerken'));
    expect(screen.getByTestId('klant-modal-kolom-bedrijfsgegevens')).toContainElement(
      screen.getByTestId('klant-modal-companyName')
    );
    expect(screen.getByTestId('klant-modal-kolom-koppelingen')).toContainElement(
      screen.getByTestId('klant-modal-prijsgroep')
    );
  });

  it('shows the address fields once the Adressen tab is active', () => {
    renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-bewerken'));
    fireEvent.click(screen.getByTestId('klant-modal-tab-adressen'));
    expect(screen.getByTestId('klant-modal-deliveryAddress')).toBeInTheDocument();
  });

  it('does not require switching tabs to reach the prijsgroep field (it lives in Gegevens, the default tab)', () => {
    renderModal(KLANT);
    expect(screen.getByTestId('klant-modal-prijsgroep')).toBeInTheDocument();
  });
});
```

(The last line `});` closes the outer `describe('KlantModal', ...)` block — make sure not to duplicate it.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/KlantModal.test.tsx`
Expected: FAIL — `klant-modal-tab-gegevens` / `klant-modal-tab-adressen` don't exist yet (no `ModalTabs` in the component yet), and the old `'groups fields into Bedrijfsgegevens, Adressen and Koppelingen columns'` test is gone so it no longer runs.

- [ ] **Step 3: Implement the tabs**

In `src/components/beheer/KlantModal.tsx`, add the import:
```tsx
import { ModalTabs } from '@/components/ModalTabs';
```

Add a tab-id type and state, right after the `wachtwoordZichtbaar` state declaration (after `const [wachtwoordZichtbaar, setWachtwoordZichtbaar] = useState(false);`):
```tsx
  type TabId = 'gegevens' | 'adressen';
  const [activeTab, setActiveTab] = useState<TabId>('gegevens');
```

In the existing `useEffect(() => { if (klant) { ... } }, [klant])`, add `setActiveTab('gegevens');` as the first line inside the `if (klant)` block:
```tsx
  useEffect(() => {
    if (klant) {
      setActiveTab('gegevens');
      setPrijsgroepId(klant.prijsgroepId ?? '');
      setKunstenaarnr(klant.kunstenaarnr);
      setMinimaleAfname(klant.minimaleAfname != null ? String(klant.minimaleAfname) : '');
      setFields(fieldsFromKlant(klant));
      setIsEditing(false);
      setError(null);
      bevestigingAfwijzen.annuleer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [klant]);
```

Then replace the whole 3-column grid block — from the opening `<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">` down to its matching closing `</div>` (the block currently containing the `klant-modal-kolom-bedrijfsgegevens`, `klant-modal-kolom-adressen`, and `klant-modal-kolom-koppelingen` divs — everything between the btw-waarschuwing block above it and the `<RequiredLegend ...>` line below it) — with:

```tsx
            <ModalTabs
              tabs={[
                { id: 'gegevens', label: t('klantenTabGegevens') },
                { id: 'adressen', label: t('klantenTabAdressen') },
              ]}
              activeTabId={activeTab}
              onTabChange={(id) => setActiveTab(id)}
              testIdPrefix="klant-modal"
            />

            <div className={activeTab === 'gegevens' ? 'grid grid-cols-1 gap-6 sm:grid-cols-2' : 'hidden'}>
              <div data-testid="klant-modal-kolom-bedrijfsgegevens" className="flex flex-col gap-3">
                <span className="text-xs uppercase tracking-wide text-white/70">
                  {t('klantenSectieBedrijfsgegevens')}
                </span>
                <Veld
                  label={t('klantenColCompanyName')}
                  value={fields.companyName}
                  editing={isEditing}
                  testId="klant-modal-companyName"
                  onChange={(value) => setField('companyName', value)}
                />
                <Veld
                  label={t('klantenColKvk')}
                  value={fields.kvk}
                  editing={isEditing}
                  testId="klant-modal-kvk"
                  onChange={(value) => setField('kvk', value)}
                />
                <Veld
                  label={t('klantenColBtwNummer')}
                  value={fields.btwNummer}
                  editing={isEditing}
                  testId="klant-modal-btwNummer"
                  onChange={(value) => setField('btwNummer', value)}
                />
                <Veld
                  label={t('klantenColContactPerson')}
                  value={fields.contactPerson}
                  editing={isEditing}
                  testId="klant-modal-contactPerson"
                  onChange={(value) => setField('contactPerson', value)}
                />
                {isEditing ? (
                  <label className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wide text-white/60">
                      {t('klantenContactPreference')}
                    </span>
                    <select
                      value={fields.contactPreference}
                      onChange={(event) => setField('contactPreference', event.target.value)}
                      data-testid="klant-modal-contactPreference"
                      className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
                    >
                      <option value="email">{t('klantenContactPreferenceEmail')}</option>
                      <option value="phone">{t('klantenContactPreferencePhone')}</option>
                      <option value="whatsapp">{t('klantenContactPreferenceWhatsapp')}</option>
                    </select>
                  </label>
                ) : (
                  <Veld label={t('klantenContactPreference')} value={fields.contactPreference} editing={false} />
                )}
                <Veld
                  label={t('klantenColEmail')}
                  value={fields.email}
                  editing={isEditing}
                  testId="klant-modal-email"
                  onChange={(value) => setField('email', value)}
                />
                <Veld
                  label={t('klantenColPhone')}
                  value={fields.phone}
                  editing={isEditing}
                  testId="klant-modal-phone"
                  onChange={(value) => setField('phone', value)}
                />
              </div>

              <div data-testid="klant-modal-kolom-koppelingen" className="flex flex-col gap-3">
                <span className="text-xs uppercase tracking-wide text-white/70">
                  {t('klantenSectieKoppelingen')}
                </span>
                <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
                  <span>
                    {t('klantenLabelPrijsgroep')}
                    <RequiredMark />
                  </span>
                  <select
                    value={prijsgroepId}
                    onChange={(event) => setPrijsgroepId(event.target.value)}
                    data-testid="klant-modal-prijsgroep"
                    className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
                  >
                    <option value="" disabled>
                      {t('klantenLabelPrijsgroep')}
                    </option>
                    {(prijsgroepen ?? []).map((prijsgroep) => (
                      <option key={prijsgroep.id} value={prijsgroep.id}>
                        {prijsgroep.naam}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
                  {t('klantenLabelKunstenaar')}
                  <Combobox
                    options={(kunstenaars ?? []).map((kunstenaar) => ({ value: kunstenaar.kunstenaarnr, label: kunstenaar.naam }))}
                    value={kunstenaarnr}
                    onChange={handleKunstenaarChange}
                    placeholder={t('klantenKunstenaarPlaceholder')}
                    noResultsLabel={t('klantenKunstenaarGeenResultaten')}
                    clearLabel={t('klantenKunstenaarGeen')}
                    testId="klant-modal-kunstenaar"
                  />
                </label>

                <div className="flex flex-col gap-1">
                  <span className="text-xs uppercase tracking-wide text-white/60">
                    {t('klantenLabelExclusieveKunstenaars')}
                  </span>
                  {(() => {
                    const namen = (kunstenaars ?? [])
                      .filter((kunstenaar) => kunstenaar.exclusieveKlantIds.includes(klant.id))
                      .map((kunstenaar) => kunstenaar.naam);
                    return namen.length === 0 ? (
                      <p data-testid="klant-modal-exclusieve-kunstenaars-leeg" className="text-white/50">
                        {t('klantenExclusieveKunstenaarsLeeg')}
                      </p>
                    ) : (
                      <p data-testid="klant-modal-exclusieve-kunstenaars">{namen.join(', ')}</p>
                    );
                  })()}
                </div>

                <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
                  {t('klantenLabelMinimaleAfname')}
                  <input
                    type="number"
                    min={1}
                    value={minimaleAfname}
                    onChange={(event) => setMinimaleAfname(event.target.value)}
                    data-testid="klant-modal-minimale-afname"
                    className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
                  />
                </label>

                <KlantWachtwoordSectie
                  key={klant.id}
                  klantId={klant.id}
                  // Bewust het opgeslagen adres en niet `fields.email`: de route mailt
                  // naar de klantrij, dus een nog niet bewaarde wijziging in het
                  // formulier zou hier een adres tonen waar niets heen is gegaan.
                  klantEmail={klant.email}
                  onWachtwoordZichtbaar={setWachtwoordZichtbaar}
                />
              </div>
            </div>

            <div className={activeTab === 'adressen' ? 'flex flex-col gap-3' : 'hidden'}>
              <Veld
                label={t('klantenLabelAdres')}
                value={fields.address}
                editing={isEditing}
                testId="klant-modal-address"
                onChange={(value) => setField('address', value)}
              />
              <Veld
                label={t('klantenLabelPostcode')}
                value={fields.postcode}
                editing={isEditing}
                testId="klant-modal-postcode"
                onChange={(value) => setField('postcode', value)}
              />
              <Veld
                label={t('klantenLabelPlaats')}
                value={fields.city}
                editing={isEditing}
                testId="klant-modal-city"
                onChange={(value) => setField('city', value)}
              />
              {isEditing ? (
                <label className="flex flex-col gap-1">
                  <span className="text-xs uppercase tracking-wide text-white/60">{t('klantenLabelLand')}</span>
                  <Combobox
                    options={LAND_OPTIONS}
                    value={fields.land || null}
                    onChange={(value) => setField('land', value ?? '')}
                    placeholder={t('klantenLabelLand')}
                    noResultsLabel={t('klantenLabelLand')}
                    testId="klant-modal-land"
                  />
                </label>
              ) : (
                <Veld label={t('klantenLabelLand')} value={landNaam(fields.land)} editing={false} />
              )}

              <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
                <span className="text-xs uppercase tracking-wide text-white/60">{t('klantenLabelAfleveradres')}</span>
                {!isEditing && fields.deliveryAddress === '' ? (
                  <p data-testid="klant-modal-afleveradres-leeg" className="text-white/50">
                    {t('klantenLabelGebruiktStandaardadres')}
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    <Veld
                      label={t('klantenLabelAdres')}
                      value={fields.deliveryAddress}
                      editing={isEditing}
                      testId="klant-modal-deliveryAddress"
                      onChange={(value) => setField('deliveryAddress', value)}
                    />
                    <Veld
                      label={t('klantenLabelPostcode')}
                      value={fields.deliveryPostcode}
                      editing={isEditing}
                      testId="klant-modal-deliveryPostcode"
                      onChange={(value) => setField('deliveryPostcode', value)}
                    />
                    <Veld
                      label={t('klantenLabelPlaats')}
                      value={fields.deliveryCity}
                      editing={isEditing}
                      testId="klant-modal-deliveryCity"
                      onChange={(value) => setField('deliveryCity', value)}
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
                <span className="text-xs uppercase tracking-wide text-white/60">{t('klantenLabelFactuuradres')}</span>
                {!isEditing && fields.invoiceAddress === '' ? (
                  <p data-testid="klant-modal-factuuradres-leeg" className="text-white/50">
                    {t('klantenLabelGebruiktStandaardadres')}
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    <Veld
                      label={t('klantenLabelAdres')}
                      value={fields.invoiceAddress}
                      editing={isEditing}
                      testId="klant-modal-invoiceAddress"
                      onChange={(value) => setField('invoiceAddress', value)}
                    />
                    <Veld
                      label={t('klantenLabelPostcode')}
                      value={fields.invoicePostcode}
                      editing={isEditing}
                      testId="klant-modal-invoicePostcode"
                      onChange={(value) => setField('invoicePostcode', value)}
                    />
                    <Veld
                      label={t('klantenLabelPlaats')}
                      value={fields.invoiceCity}
                      editing={isEditing}
                      testId="klant-modal-invoiceCity"
                      onChange={(value) => setField('invoiceCity', value)}
                    />
                    {isEditing ? (
                      <label className="flex flex-col gap-1">
                        <span className="text-xs uppercase tracking-wide text-white/60">
                          {t('klantenLabelLand')}
                        </span>
                        <Combobox
                          options={LAND_OPTIONS}
                          value={fields.invoiceLand || null}
                          onChange={(value) => setField('invoiceLand', value ?? '')}
                          placeholder={t('klantenLabelLand')}
                          noResultsLabel={t('klantenLabelLand')}
                          clearLabel={t('klantenLabelGebruiktStandaardadres')}
                          testId="klant-modal-invoiceLand"
                        />
                      </label>
                    ) : (
                      <Veld label={t('klantenLabelLand')} value={landNaam(fields.invoiceLand)} editing={false} />
                    )}
                  </div>
                )}
              </div>
            </div>
```

The status badge/Bewerken row, afwijsreden block, and btw-waarschuwing (all above this block, unchanged) stay full-width above the tabs — visible regardless of which tab is active. `<RequiredLegend ...>` (right after this block, unchanged) stays full-width below the tabs.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/KlantModal.test.tsx`
Expected: PASS — every pre-existing test (none of them depend on which tab is active, since `Veld`/`Combobox`/input elements stay mounted via the `hidden` class toggle rather than being unmounted) plus the 5 new/replaced tests.

- [ ] **Step 5: Commit**

```bash
git add messages/nl.json src/components/beheer/KlantModal.tsx tests/components/beheer/KlantModal.test.tsx
git commit -m "feat: split klantgegevens-modal into Gegevens/Adressen tabs"
```

---

### Task 2: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS aside from any already-known, unrelated pre-existing failure (check `tests/components/ProductsGrid.test.tsx` — if it fails, confirm the same failure exists on `master` before this branch; that one is known and unrelated). This repo's test suite hits a real shared staging database (see `CLAUDE.md`) and multiple concurrent Claude Code sessions may be running their own `npm test` against it at the same time — if you see unrelated failures in `tests/app/api/**`, do not chase them; note which files failed and whether they're plausibly related to this plan's diff (only `KlantModal.tsx`/`messages/nl.json`/`KlantModal.test.tsx` are touched, which do not hit any database).

- [ ] **Step 2: Manually verify in the browser**

Start the dev server (`npm run dev`), log in to `/nl/beheer` with the medewerker test account, open Klanten, and open a klant row:
- Two tabs appear: "Gegevens" (active by default) and "Adressen".
- Gegevens shows Bedrijfsgegevens and Koppelingen side by side, no scrollbar for a typical klant.
- Click Adressen: hoofdadres, afleveradres, factuuradres show, with "Gebruikt standaardadres" for the two when empty.
- Open a klant with status "Afgewezen" and an afwijsreden (the reden text should still show above the tabs, on both tabs).
- Click Bewerken, confirm fields in both tabs are editable and Opslaan still saves correctly.
- Open a different klant row while the modal is open on the Adressen tab — confirm it snaps back to the Gegevens tab for the new klant.

No commit for this task (verification only).
