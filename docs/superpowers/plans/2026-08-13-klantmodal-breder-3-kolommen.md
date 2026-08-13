# Klantgegevens-modal breder met 3 kolommen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De "Klantgegevens"-modal (`KlantModal.tsx`) breder maken en de velden herordenen in drie kolommen (Bedrijfsgegevens / Adressen / Koppelingen) naast elkaar, zodat de inhoud op een normaal beheerscherm past zonder de verticale scrollbalk die er nu bijna altijd is.

**Architecture:** `Modal.tsx` krijgt een `size`-prop (`'default' | 'medium' | 'wide'`) in plaats van de huidige boolean `wide`-prop, zodat er naast de bestaande smalle modal (512px) en brede modal (1400px, gebruikt door de kunstwerk/kunstenaar/zending-modals) ook een middelste maat (896px) beschikbaar is. `KlantModal.tsx` gebruikt die nieuwe `size="medium"` en herschikt zijn bestaande velden (zonder ze te hernoemen of hun gedrag te wijzigen) in een 3-koloms grid. Alle bestaande `data-testid`s blijven ongewijzigd, dus de bestaande testsuite is de regressie-check voor de herschikking zelf.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, `next-intl`, Vitest + React Testing Library.

## Global Constraints

- De `beheer`-namespace in i18n bestaat alleen in `messages/nl.json` (beheer is Nederlandstalig) — nieuwe sleutels voor dit plan gaan alleen daar in.
- Geen enkele bestaande `data-testid` in `KlantModal.tsx` verandert van naam. De herschikking verplaatst JSX-blokken, ze schrijft ze niet opnieuw.
- `npm test` (niet een subset) draait minstens één keer aan het eind (Task 4), omdat `Modal.tsx`'s prop-wijziging elke consument raakt.
- Volg de bestaande stijl: Tailwind-classes zoals in de rest van het bestand, geen nieuwe UI-bibliotheek.

---

### Task 1: `Modal.tsx` — `size`-prop in plaats van boolean `wide`

**Files:**
- Modify: `src/components/Modal.tsx`
- Test: `tests/components/Modal.test.tsx`

**Interfaces:**
- Produces: `Modal` component, prop `size?: 'default' | 'medium' | 'wide'` (default `'default'`), vervangt de bestaande `wide?: boolean` prop volledig. `'default'` → `max-w-lg` (ongewijzigd), `'medium'` → `max-w-4xl` (nieuw), `'wide'` → `max-w-[1400px]` (ongewijzigd gedrag, nieuwe manier om het aan te vragen).
- Consumed by: Task 2 (de drie bestaande `wide`-consumenten) en Task 3 (`KlantModal.tsx`, nieuwe `size="medium"` consument).

- [ ] **Step 1: Write the failing tests**

In `tests/components/Modal.test.tsx`, vervang het bestaande test-paar rond de `wide`-prop (de twee tests `'uses a wider max width when wide is set'` en `'uses the default (narrower) max width when wide is not set'`, regels 157–175) door:

```tsx
  it('uses the 1400px max width when size is "wide"', () => {
    renderWithIntl(
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten" title="Testmodal" size="wide">
        <p>Inhoud</p>
      </Modal>
    );
    const panel = screen.getByTestId('modal-backdrop').nextElementSibling as HTMLElement;
    expect(panel.className).toMatch(/max-w-\[1400px\]/);
  });

  it('uses the 896px max width when size is "medium"', () => {
    renderWithIntl(
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten" title="Testmodal" size="medium">
        <p>Inhoud</p>
      </Modal>
    );
    const panel = screen.getByTestId('modal-backdrop').nextElementSibling as HTMLElement;
    expect(panel.className).toMatch(/max-w-4xl/);
  });

  it('uses the default (narrowest) max width when size is not set', () => {
    renderWithIntl(
      <Modal isOpen onClose={vi.fn()} closeLabel="Sluiten" title="Testmodal">
        <p>Inhoud</p>
      </Modal>
    );
    const panel = screen.getByTestId('modal-backdrop').nextElementSibling as HTMLElement;
    expect(panel.className).toMatch(/max-w-lg/);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/Modal.test.tsx`
Expected: FAIL — `size="wide"` and `size="medium"` are not valid props yet on the current `Modal.tsx` (TypeScript wouldn't compile in a real build, but Vitest's esbuild transform doesn't type-check, so the observable failure here is that the panel still renders `max-w-lg` regardless of the `size` prop, since `Modal.tsx` doesn't read it).

- [ ] **Step 3: Implement the `size` prop**

In `src/components/Modal.tsx`, change:
```tsx
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  closeLabel: string;
  closeButtonAriaLabel?: string;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
  subtitle?: ReactNode;
  footerActions?: ReactNode;
}

export function Modal({
  isOpen,
  onClose,
  closeLabel,
  closeButtonAriaLabel,
  title,
  children,
  wide = false,
  subtitle,
  footerActions,
}: ModalProps) {
```
to:
```tsx
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  closeLabel: string;
  closeButtonAriaLabel?: string;
  title: ReactNode;
  children: ReactNode;
  size?: 'default' | 'medium' | 'wide';
  subtitle?: ReactNode;
  footerActions?: ReactNode;
}

export function Modal({
  isOpen,
  onClose,
  closeLabel,
  closeButtonAriaLabel,
  title,
  children,
  size = 'default',
  subtitle,
  footerActions,
}: ModalProps) {
```

Then, still in `src/components/Modal.tsx`, change:
```tsx
      <div
        className={`relative z-10 flex max-h-[90vh] w-full flex-col rounded-lg border border-white/10 bg-charcoal ${
          wide ? 'max-w-[1400px]' : 'max-w-lg'
        }`}
      >
```
to:
```tsx
      <div
        className={`relative z-10 flex max-h-[90vh] w-full flex-col rounded-lg border border-white/10 bg-charcoal ${
          size === 'wide' ? 'max-w-[1400px]' : size === 'medium' ? 'max-w-4xl' : 'max-w-lg'
        }`}
      >
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/Modal.test.tsx`
Expected: PASS (all tests, including the 3 rewritten ones). The rest of the codebase does not compile yet with `wide` removed — Task 2 fixes the three remaining call sites.

- [ ] **Step 5: Commit**

```bash
git add src/components/Modal.tsx tests/components/Modal.test.tsx
git commit -m "feat: replace Modal's boolean wide prop with a 3-way size prop"
```

---

### Task 2: Migrate the three existing `wide` consumers to `size="wide"`

**Files:**
- Modify: `src/components/beheer/KunstenaarsSection.tsx:387`, `src/components/beheer/KunstwerkenSection.tsx:678`, `src/components/beheer/ZendingBekijkenModal.tsx:57`
- Test: `tests/components/beheer/ZendingBekijkenModal.test.tsx` (existing test, no changes needed — see Step 2)

**Interfaces:**
- Consumes: `Modal`'s `size` prop from Task 1.
- Produces: nothing consumed by later tasks.

This is a pure rename with no behavior change — the existing tests are the check, no new test needed.

- [ ] **Step 1: Update the three call sites**

In `src/components/beheer/KunstenaarsSection.tsx`, change the bare `wide` prop (line 387, inside the `<Modal ...>` opening tag) to `size="wide"`.

In `src/components/beheer/KunstwerkenSection.tsx`, change the bare `wide` prop (line 678, inside the `<Modal ...>` opening tag) to `size="wide"`.

In `src/components/beheer/ZendingBekijkenModal.tsx`, change the bare `wide` prop (line 57, inside the `<Modal ...>` opening tag) to `size="wide"`.

- [ ] **Step 2: Run the affected tests to verify no regression**

Run: `npx vitest run tests/components/beheer/KunstenaarsSection.test.tsx tests/components/beheer/KunstwerkenSection.test.tsx tests/components/beheer/ZendingBekijkenModal.test.tsx`
Expected: PASS — in particular `ZendingBekijkenModal.test.tsx`'s `'shows the modal title and the zendingnummer in the subtitle, and is wide'` test, which asserts `toHaveClass('max-w-[1400px]')` on the panel, still passes because `size="wide"` produces the same class as the old `wide` boolean did.

- [ ] **Step 3: Commit**

```bash
git add src/components/beheer/KunstenaarsSection.tsx src/components/beheer/KunstwerkenSection.tsx src/components/beheer/ZendingBekijkenModal.tsx
git commit -m "refactor: migrate the three wide Modal consumers to size=\"wide\""
```

---

### Task 3: `KlantModal.tsx` — medium width + 3-column layout

**Files:**
- Modify: `src/components/beheer/KlantModal.tsx`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/KlantModal.test.tsx`

**Interfaces:**
- Consumes: `Modal`'s `size` prop from Task 1.
- Produces: nothing consumed by later tasks.

`KlantModal.tsx`'s existing 2-column field grid (`companyName`, `kvk`, `btwNummer`, `contactPerson`, `contactPreference`, `email`, `phone`, `address`, `postcode`, `city`, `land`) plus the separate afleveradres/factuuradres blocks, prijsgroep/kunstenaar/exclusieve-kunstenaars/minimale-afname blocks, and the wachtwoord section get regrouped into three side-by-side columns: **Bedrijfsgegevens** (company/contact fields), **Adressen** (hoofdadres + afleveradres + factuuradres), **Koppelingen** (prijsgroep, kunstenaar, exclusieve kunstenaars, minimale afname, wachtwoord). Every field keeps its exact existing `data-testid`, label, value, and `onChange`/`editing` wiring — only its position in the JSX tree moves. The status badge/Bewerken row, the afwijsreden block, and the btw-waarschuwing stay full-width above the three columns; the required-field legend stays full-width below them.

- [ ] **Step 1: Write the failing tests**

In `messages/nl.json`, find the line `"klantenLabelLand": "Land",` (around line 437, inside the `beheer` object) and add three new keys directly after it:
```json
    "klantenLabelLand": "Land",
    "klantenSectieBedrijfsgegevens": "Bedrijfsgegevens",
    "klantenSectieAdressen": "Adressen",
    "klantenSectieKoppelingen": "Koppelingen",
```

In `tests/components/beheer/KlantModal.test.tsx`, add these two tests at the end of the `describe('KlantModal', ...)` block, just before its closing `});` (after the last existing test, which is the `'terwijl er een uitgegeven wachtwoord in beeld staat'` nested `describe`):

```tsx
  it('uses the medium modal width, not the narrow default or the 1400px wide variant', () => {
    renderModal(KLANT);
    expect(screen.getByTestId('modal-header').parentElement).toHaveClass('max-w-4xl');
  });

  it('groups fields into Bedrijfsgegevens, Adressen and Koppelingen columns', () => {
    renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-bewerken'));
    expect(screen.getByTestId('klant-modal-kolom-bedrijfsgegevens')).toContainElement(
      screen.getByTestId('klant-modal-companyName')
    );
    expect(screen.getByTestId('klant-modal-kolom-adressen')).toContainElement(
      screen.getByTestId('klant-modal-deliveryAddress')
    );
    expect(screen.getByTestId('klant-modal-kolom-koppelingen')).toContainElement(
      screen.getByTestId('klant-modal-prijsgroep')
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/KlantModal.test.tsx`
Expected: FAIL — `KlantModal` doesn't pass `size="medium"` to `Modal` yet (panel still has `max-w-lg`), and the three `klant-modal-kolom-*` testids don't exist yet.

- [ ] **Step 3: Implement the medium width and the 3-column layout**

In `src/components/beheer/KlantModal.tsx`, on the `<Modal>` opening tag, change:
```tsx
    <Modal
      isOpen={klant !== null}
      onClose={onClose}
      closeLabel={t('modalClose')}
      title={
```
to:
```tsx
    <Modal
      isOpen={klant !== null}
      onClose={onClose}
      closeLabel={t('modalClose')}
      size="medium"
      title={
```

Then replace the whole block from the opening `<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">` (the start of the field grid) through the closing `</div>` right before `<KlantWachtwoordSectie` moves into `</div>` — i.e. everything from that opening grid `<div>` down to and including the minimale-afname `<div className="flex items-end gap-2">...</div>` block — with:

```tsx
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div data-testid="klant-modal-kolom-bedrijfsgegevens" className="flex flex-col gap-3">
                <span className="text-xs uppercase tracking-wide text-white/50">
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

              <div data-testid="klant-modal-kolom-adressen" className="flex flex-col gap-3">
                <span className="text-xs uppercase tracking-wide text-white/50">
                  {t('klantenSectieAdressen')}
                </span>
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

              <div data-testid="klant-modal-kolom-koppelingen" className="flex flex-col gap-3">
                <span className="text-xs uppercase tracking-wide text-white/50">
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
```

This new block absorbs (and removes, because their content is now inline above) the original separate afleveradres-block, factuuradres-block, prijsgroep-block, kunstenaar-block, exclusieve-kunstenaars-block, minimale-afname-block and the original `<KlantWachtwoordSectie .../>` call that used to sit between that block group and `<RequiredLegend ...>` — after this edit, the `<RequiredLegend testId="klant-modal-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>` line (currently right after `<KlantWachtwoordSectie />`) becomes the element immediately following this new 3-column `<div>`, with nothing in between.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/KlantModal.test.tsx`
Expected: PASS — every pre-existing test (none of them depend on DOM order or column grouping) plus the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add messages/nl.json src/components/beheer/KlantModal.tsx tests/components/beheer/KlantModal.test.tsx
git commit -m "feat: widen the klantgegevens-modal and group its fields into 3 columns"
```

---

### Task 4: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS, 0 failures — this is the regression check confirming no other `Modal` consumer (there are ~20 across the beheer/account UI) broke from the `wide` → `size` prop rename.

- [ ] **Step 2: Run a production type-check build**

Run: `npm run build`
Expected: succeeds with no TypeScript errors — this is what actually enforces that every `Modal` call site compiles against the new `size` prop (Vitest's esbuild transform does not type-check, so this is the first point in the plan that would catch a missed call site, e.g. some other file passing the old `wide` boolean that this plan didn't find via grep).

- [ ] **Step 3: Manually verify in the browser**

Start the dev server (`npm run dev`), log in to `/nl/beheer` with the medewerker test account, open Klanten, and open a klant row:
- The modal is noticeably wider than before and shows three columns side by side: Bedrijfsgegevens, Adressen, Koppelingen.
- With both afleveradres and factuuradres left empty, the whole modal fits without a scrollbar on a normal laptop/desktop screen.
- Click Bewerken and confirm every field is still editable and Opslaan still works (this exercises the same code paths the automated tests cover, just visually).
- Open a klant that has an afleveradres and/or factuuradres set, and confirm those still render inline (not collapsed) in the Adressen column.

No commit for this task (verification only).

---

### Task 5 (manual, after this branch reaches staging — not a fresh-subagent coding task)

The current `public/documentatie/klant-registratie.png` screenshot in the gebruikershandleiding (`src/components/beheer/documentatie/chapters/KlantRegistratieChapter.tsx`) is a screenshot of exactly this modal in its old single-column, scrolling form — per `CLAUDE.md`'s gebruikershandleiding rule, a visible change to that screen means the screenshot must be retaken. This requires the `claude-in-chrome` + `gif_creator` + PIL-crop technique (real Chrome tab, not the preview pane — the preview pane cannot save pixels to disk), and a staging login, so it should be done directly by the orchestrating session once this change is live on staging — not dispatched blind to a fresh subagent that may not have an authenticated Chrome tab available. No plan steps are written out here since the technique is already documented; it is the same procedure used for the four existing screenshots.
