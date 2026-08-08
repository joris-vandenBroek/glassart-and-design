# Bulk afronden en zendinggenoten — implementatieplan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 06-08-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In `beheer > Bestellingen` een quick-filter op *Verstuurd naar drukker* toevoegen, selectie beperken tot de twee drukker-statussen, meerdere bestellingen tegelijk kunnen afronden, en bij het afronden melden welke bestellingen uit dezelfde drukkerzending nog open staan.

**Architecture:** `DataTable` krijgt een gecontroleerde lijst quick-filter-opties in plaats van één actieve waarde, zodat `BestellingenSection` de filterstand kent en de selectie daarop kan gaten. Een nieuwe leesroute doet de omgekeerde lookup van bestelling naar `drukkerZendingen` (geen schemawijziging). Losse en bulk-afronding lopen daarna door één gedeelde stroom die vóór het afronden de openstaande zendinggenoten opzoekt en zo nodig een bevestigingsdialoog toont.

**Tech Stack:** Next.js 14 App Router, TypeScript, React client components, `next-intl`, raw `mysql2`, Vitest + Testing Library.

## Global Constraints

- Alle beheer-teksten staan **uitsluitend** in `messages/nl.json` onder de `beheer`-namespace. `en.json`, `de.json` en `fr.json` hebben géén `beheer`-blok en krijgen die ook niet.
- Geen wijziging aan `db/schema.sql` en dus geen productiemigratie.
- SQL gebruikt `JSON_CONTAINS(...)` ge-OR'd per id, nooit `JSON_OVERLAPS` (vereist MySQL 8.0.17+).
- Tests draaien tegen de echte staging-database. Elke test ruimt exact de rijen op die hij zelf aanmaakte, op vastgelegd id. Nooit een `DELETE` zonder `WHERE`, nooit `TRUNCATE`.
- Testcommando: `npx vitest run <pad>`. De volledige suite is `npm test`.
- Statuswaarden zijn letterlijk: `'Te beoordelen'`, `'Te versturen naar drukker'`, `'Verstuurd naar drukker'`, `'Afgerond'`, `'Afgewezen'`.
- Commit na elke taak. Commitberichten in het Nederlands, met `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` als laatste regel.

---

### Task 1: DataTable quick-filter wordt een gecontroleerde optielijst

**Files:**
- Modify: `src/components/DataTable.tsx:12-18` (interface), `:51` (state), `:55-66` (filter), `:117-144` (rendering)
- Modify: `src/components/beheer/KlantenSection.tsx:88-94`
- Modify: `src/components/beheer/BestellingenSection.tsx:176-182`
- Modify: `messages/nl.json` (één nieuwe sleutel)
- Test: `tests/components/DataTable.test.tsx`, `tests/components/beheer/KlantenSection.test.tsx:129`, `tests/components/beheer/BestellingenSection.test.tsx:164,211`

**Interfaces:**
- Consumes: niets (eerste taak)
- Produces: `StatusQuickFilterOption { value: string; label: string; testId: string }` en `StatusQuickFilter<T> { key: keyof T & string; options: StatusQuickFilterOption[]; value: string; onChange: (value: string) => void }`, beide geëxporteerd uit `@/components/DataTable`. Test-id per link: `data-table-quick-${option.testId}`.

Deze taak verandert alleen de vórm van het filter, niet het gedrag: klanten starten op "alle", bestellingen ook. Selectie blijft voorlopig precies zoals hij was; dat is Taak 2.

- [ ] **Step 1: Vervang de quick-filter tests in `tests/components/DataTable.test.tsx`**

Vervang het volledige `describe('quick filter', ...)`-blok (rond regel 140-176) door:

```tsx
  describe('quick filter', () => {
    function quickFilter(value: string, onChange = vi.fn()): StatusQuickFilter<Row> {
      return {
        key: 'status',
        value,
        onChange,
        options: [
          { value: 'Open', label: 'Open rijen', testId: 'open' },
          { value: 'Gesloten', label: 'Gesloten rijen', testId: 'gesloten' },
          { value: '', label: 'Alle rijen', testId: 'alle' },
        ],
      };
    }

    it('renders one link per option', () => {
      renderTable({ quickFilter: quickFilter('') });
      expect(screen.getByTestId('data-table-quick-open')).toHaveTextContent('Open rijen');
      expect(screen.getByTestId('data-table-quick-gesloten')).toHaveTextContent('Gesloten rijen');
      expect(screen.getByTestId('data-table-quick-alle')).toHaveTextContent('Alle rijen');
    });

    it('shows every row when the active value is the empty string', () => {
      renderTable({ quickFilter: quickFilter('') });
      expect(screen.getByTestId('data-table-row-a')).toBeInTheDocument();
      expect(screen.getByTestId('data-table-row-b')).toBeInTheDocument();
      expect(screen.getByTestId('data-table-row-c')).toBeInTheDocument();
    });

    it('shows only rows matching the active value', () => {
      renderTable({ quickFilter: quickFilter('Open') });
      expect(screen.getByTestId('data-table-row-a')).toBeInTheDocument();
      expect(screen.getByTestId('data-table-row-c')).toBeInTheDocument();
      expect(screen.queryByTestId('data-table-row-b')).not.toBeInTheDocument();
    });

    it('reports the clicked option through onChange instead of filtering itself', () => {
      const onChange = vi.fn();
      renderTable({ quickFilter: quickFilter('', onChange) });
      fireEvent.click(screen.getByTestId('data-table-quick-gesloten'));
      expect(onChange).toHaveBeenCalledWith('Gesloten');
    });

    it('combines the quick filter with the global search', () => {
      renderTable({ quickFilter: quickFilter('Open') });
      fireEvent.change(screen.getByTestId('data-table-search'), { target: { value: 'Bravo' } });
      expect(screen.getByTestId('data-table-row-a')).toBeInTheDocument();
      expect(screen.queryByTestId('data-table-row-c')).not.toBeInTheDocument();
    });

    it('does not render quick filter links when no quickFilter is passed', () => {
      renderTable();
      expect(screen.queryByTestId('data-table-quick-alle')).not.toBeInTheDocument();
    });
  });
```

- [ ] **Step 2: Draai de test en controleer dat hij faalt**

Run: `npx vitest run tests/components/DataTable.test.tsx`
Expected: FAIL — TypeScript/runtime fouten omdat `options`, `value` en `onChange` niet bestaan op `StatusQuickFilter`.

- [ ] **Step 3: Pas `src/components/DataTable.tsx` aan**

Vervang de interface (regel 12-18) door:

```ts
export interface StatusQuickFilterOption {
  value: string; // '' betekent: geen filter, alle rijen
  label: string;
  testId: string; // los van `value`, want statuswaarden bevatten spaties
}

export interface StatusQuickFilter<T> {
  key: keyof T & string;
  options: StatusQuickFilterOption[];
  value: string;
  onChange: (value: string) => void;
}
```

Verwijder de state-regel `const [quickFilterActive, setQuickFilterActive] = useState(...)` volledig.

Vervang in `filteredRows` de eerste `if` door:

```ts
      if (quickFilter && quickFilter.value && String(row[quickFilter.key] ?? '') !== quickFilter.value) {
        return false;
      }
```

en pas de dependency-array van die `useMemo` aan naar `[rows, columns, search, quickFilter]`.

Vervang het volledige `{quickFilter && (...)}`-blok in de JSX door:

```tsx
        {quickFilter && (
          <div className="flex items-center gap-4 text-xs">
            {quickFilter.options.map((option) => (
              <button
                key={option.testId}
                type="button"
                onClick={() => quickFilter.onChange(option.value)}
                data-testid={`data-table-quick-${option.testId}`}
                className={
                  quickFilter.value === option.value
                    ? 'text-white underline underline-offset-4'
                    : 'text-white/50 hover:text-white'
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
```

- [ ] **Step 4: Draai de DataTable-tests**

Run: `npx vitest run tests/components/DataTable.test.tsx`
Expected: PASS, inclusief de bestaande sorteertests.

- [ ] **Step 5: Migreer `KlantenSection`**

In `src/components/beheer/KlantenSection.tsx`: controleer dat `useState` al geïmporteerd is uit `react` (dat is zo, voor `selectedKlant`). Voeg boven de `return` toe:

```tsx
  const [statusFilter, setStatusFilter] = useState('');
```

en vervang de `quickFilter`-prop door:

```tsx
        quickFilter={{
          key: 'status',
          value: statusFilter,
          onChange: setStatusFilter,
          options: [
            { value: 'Beoordelen', label: t('klantenQuickTeBeoordelen'), testId: 'te-beoordelen' },
            { value: '', label: t('klantenQuickAlle'), testId: 'alle' },
          ],
        }}
```

In `tests/components/beheer/KlantenSection.test.tsx` regel 129: vervang
`screen.getByTestId('data-table-quick-active')` door
`screen.getByTestId('data-table-quick-te-beoordelen')`.

- [ ] **Step 6: Voeg de nieuwe vertaalsleutel toe**

In `messages/nl.json`, direct ná `"bestellingenQuickTeVersturenNaarDrukker"`:

```json
    "bestellingenQuickVerstuurdNaarDrukker": "Verstuurd naar drukker",
```

- [ ] **Step 7: Migreer `BestellingenSection`**

In `src/components/beheer/BestellingenSection.tsx`, bij de overige `useState`-regels:

```tsx
  const [statusFilter, setStatusFilter] = useState('');
```

en vervang de `quickFilter`-prop door:

```tsx
        quickFilter={{
          key: 'status',
          value: statusFilter,
          onChange: setStatusFilter,
          options: [
            {
              value: 'Te versturen naar drukker',
              label: t('bestellingenQuickTeVersturenNaarDrukker'),
              testId: 'te-versturen',
            },
            {
              value: 'Verstuurd naar drukker',
              label: t('bestellingenQuickVerstuurdNaarDrukker'),
              testId: 'verstuurd',
            },
            { value: '', label: t('bestellingenQuickAlle'), testId: 'alle' },
          ],
        }}
```

In `tests/components/beheer/BestellingenSection.test.tsx`: regel 164
`data-table-quick-active` → `data-table-quick-te-versturen`; regel 211
`data-table-quick-all` → `data-table-quick-alle`.

- [ ] **Step 8: Draai alle geraakte tests**

Run: `npx vitest run tests/components/DataTable.test.tsx tests/components/beheer/KlantenSection.test.tsx tests/components/beheer/BestellingenSection.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/DataTable.tsx src/components/beheer/KlantenSection.tsx src/components/beheer/BestellingenSection.tsx messages/nl.json tests/components/DataTable.test.tsx tests/components/beheer/KlantenSection.test.tsx tests/components/beheer/BestellingenSection.test.tsx
git commit -m "feat: quick-filter met meerdere statuslinks in DataTable"
```

---

### Task 2: Selectie alleen binnen de twee drukker-statussen

**Files:**
- Modify: `src/components/beheer/BestellingenSection.tsx` (selectie-effect, `selection`-prop, selectiebalk)
- Test: `tests/components/beheer/BestellingenSection.test.tsx` (`describe('bulk selection')`)

**Interfaces:**
- Consumes: `statusFilter` / `setStatusFilter` uit Taak 1; test-ids `data-table-quick-te-versturen`, `data-table-quick-verstuurd`, `data-table-quick-alle`.
- Produces: knop-test-id `bestellingen-afronden` in de selectiebalk (naast de bestaande `bestellingen-versturen-naar-drukker`). De knop doet in deze taak nog niets; Taak 7 hangt hem aan de afrondstroom.

- [ ] **Step 1: Werk het `describe('bulk selection')`-blok in `tests/components/beheer/BestellingenSection.test.tsx` bij**

Vervang het volledige blok door:

```tsx
  describe('bulk selection', () => {
    const TE_VERSTUREN = { ...BESTELLINGEN[0], status: 'Te versturen naar drukker' as const };

    it('shows no selection column while the "alle bestellingen" filter is active', () => {
      renderSection({ bestellingen: [TE_VERSTUREN, BESTELLINGEN[1]] });
      expect(screen.queryByTestId('data-table-select-all')).not.toBeInTheDocument();
      expect(screen.queryByTestId('data-table-row-select-header-1')).not.toBeInTheDocument();
    });

    it('shows checkboxes for every row once the "te versturen" filter is active', () => {
      renderSection({ bestellingen: [TE_VERSTUREN, BESTELLINGEN[1]] });
      fireEvent.click(screen.getByTestId('data-table-quick-te-versturen'));
      expect(screen.getByTestId('data-table-row-select-header-1')).toBeInTheDocument();
      expect(screen.queryByTestId('data-table-row-select-header-2')).not.toBeInTheDocument();
    });

    it('shows checkboxes once the "verstuurd naar drukker" filter is active', () => {
      renderSection({ bestellingen: [TE_VERSTUREN, BESTELLINGEN[1]] });
      fireEvent.click(screen.getByTestId('data-table-quick-verstuurd'));
      expect(screen.getByTestId('data-table-row-select-header-2')).toBeInTheDocument();
      expect(screen.queryByTestId('data-table-row-select-header-1')).not.toBeInTheDocument();
    });

    it('shows the selection bar with a count once a bestelling is selected, and hides it when deselected', () => {
      renderSection({ bestellingen: [TE_VERSTUREN] });
      fireEvent.click(screen.getByTestId('data-table-quick-te-versturen'));
      expect(screen.queryByTestId('bestellingen-selectie-balk')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('data-table-row-select-header-1'));
      expect(screen.getByTestId('bestellingen-selectie-balk')).toHaveTextContent('1 bestellingen geselecteerd (1 klanten)');
      fireEvent.click(screen.getByTestId('data-table-row-select-header-1'));
      expect(screen.queryByTestId('bestellingen-selectie-balk')).not.toBeInTheDocument();
    });

    it('counts distinct klanten in the selection bar', () => {
      const bestellingen = [TE_VERSTUREN, { ...BESTELLINGEN[1], id: 'header-3', status: 'Te versturen naar drukker' as const }];
      renderSection({ bestellingen });
      fireEvent.click(screen.getByTestId('data-table-quick-te-versturen'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-1'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-3'));
      expect(screen.getByTestId('bestellingen-selectie-balk')).toHaveTextContent('2 bestellingen geselecteerd (2 klanten)');
    });

    it('clears the selection when the filter changes', () => {
      renderSection({ bestellingen: [TE_VERSTUREN] });
      fireEvent.click(screen.getByTestId('data-table-quick-te-versturen'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-1'));
      expect(screen.getByTestId('bestellingen-selectie-balk')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('data-table-quick-alle'));
      expect(screen.queryByTestId('bestellingen-selectie-balk')).not.toBeInTheDocument();
    });

    it('clears the selection when the underlying bestelling no longer has the filtered status', () => {
      const { rerender } = renderSection({ bestellingen: [TE_VERSTUREN] });
      fireEvent.click(screen.getByTestId('data-table-quick-te-versturen'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-1'));
      expect(screen.getByTestId('bestellingen-selectie-balk')).toBeInTheDocument();
      rerender([{ ...TE_VERSTUREN, status: 'Verstuurd naar drukker' as const }]);
      expect(screen.queryByTestId('bestellingen-selectie-balk')).not.toBeInTheDocument();
    });

    it('shows the "versturen naar drukker" button under the "te versturen" filter', () => {
      renderSection({ bestellingen: [TE_VERSTUREN] });
      fireEvent.click(screen.getByTestId('data-table-quick-te-versturen'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-1'));
      expect(screen.getByTestId('bestellingen-versturen-naar-drukker')).toBeInTheDocument();
      expect(screen.queryByTestId('bestellingen-afronden')).not.toBeInTheDocument();
    });

    it('shows the "afronden" button under the "verstuurd naar drukker" filter', () => {
      renderSection({ bestellingen: [BESTELLINGEN[1]] });
      fireEvent.click(screen.getByTestId('data-table-quick-verstuurd'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-2'));
      expect(screen.getByTestId('bestellingen-afronden')).toHaveTextContent('Afronden');
      expect(screen.queryByTestId('bestellingen-versturen-naar-drukker')).not.toBeInTheDocument();
    });

    it('opens the VersturenNaarDrukkerDialog with only the selected bestellingen when the button is clicked', () => {
      const bestellingen = [TE_VERSTUREN, { ...BESTELLINGEN[1], id: 'header-3', status: 'Te versturen naar drukker' as const }];
      renderSection({ bestellingen });
      fireEvent.click(screen.getByTestId('data-table-quick-te-versturen'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-1'));
      expect(screen.queryByTestId('drukker-versturen-drukker')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('bestellingen-versturen-naar-drukker'));

      expect(screen.getByTestId('drukker-versturen-drukker')).toHaveValue('drukker-1');
      expect(screen.getByTestId('drukker-versturen-preview')).toHaveTextContent('Testbedrijf BV');
      expect(screen.getByTestId('drukker-versturen-preview')).not.toHaveTextContent('Ander Bedrijf');
    });

    it('reports each verstuurde bestelling, clears the selection, and closes the dialog on a successful send', async () => {
      const { onBestellingUpdated } = renderSection({ bestellingen: [TE_VERSTUREN] });
      fireEvent.click(screen.getByTestId('data-table-quick-te-versturen'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-1'));
      fireEvent.click(screen.getByTestId('bestellingen-versturen-naar-drukker'));

      fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

      await waitFor(() => expect(onBestellingUpdated).toHaveBeenCalled());
      expect(onBestellingUpdated.mock.calls[0][0]).toEqual({ ...TE_VERSTUREN, status: 'Verstuurd naar drukker' });
      expect(screen.queryByTestId('drukker-versturen-drukker')).not.toBeInTheDocument();
      expect(screen.queryByTestId('bestellingen-selectie-balk')).not.toBeInTheDocument();
    });
  });
```

- [ ] **Step 2: Draai de test en controleer dat hij faalt**

Run: `npx vitest run tests/components/beheer/BestellingenSection.test.tsx`
Expected: FAIL — er is nog een selectiekolom bij het "alle"-filter en `bestellingen-afronden` bestaat niet.

- [ ] **Step 3: Pas het selectie-effect aan**

Vervang in `src/components/beheer/BestellingenSection.tsx` het bestaande `useEffect` door:

```tsx
  useEffect(() => {
    if (bestellingen === null) return;
    // Houdt alleen ids over die nog bestaan én nog de status van het actieve
    // filter hebben. Dit dekt in één keer drie gevallen af: een bestelling die
    // verdwijnt, een bestelling waarvan de status verandert (bijvoorbeeld nadat
    // hij is verstuurd of afgerond), en het wisselen van filter.
    const stillSelectable = new Set(
      bestellingen.filter((b) => b.status === statusFilter).map((b) => b.id)
    );
    setSelectedIds((current) => {
      const next = new Set(Array.from(current).filter((id) => stillSelectable.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [bestellingen, statusFilter]);
```

- [ ] **Step 4: Gate de `selection`-prop en wissel de knop**

Voeg boven de `return` toe:

```tsx
  const selectieActief =
    statusFilter === 'Te versturen naar drukker' || statusFilter === 'Verstuurd naar drukker';
```

Vervang de `selection`-prop van `DataTable` door:

```tsx
        selection={
          selectieActief
            ? {
                selectedIds,
                onToggle: handleToggle,
                onToggleAll: handleToggleAll,
                isSelectable: (row) => row.status === statusFilter,
              }
            : undefined
        }
```

Vervang binnen de selectiebalk de enkele knop door:

```tsx
          {statusFilter === 'Verstuurd naar drukker' ? (
            <button
              type="button"
              data-testid="bestellingen-afronden"
              className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
            >
              {t('bestellingenAfronden')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowVersturenDialog(true)}
              data-testid="bestellingen-versturen-naar-drukker"
              className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
            >
              {t('bestellingenVersturenNaarDrukker')}
            </button>
          )}
```

- [ ] **Step 5: Draai de tests**

Run: `npx vitest run tests/components/beheer/BestellingenSection.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/beheer/BestellingenSection.tsx tests/components/beheer/BestellingenSection.test.tsx
git commit -m "feat: selectie alleen binnen de twee drukker-statussen"
```

---

### Task 3: Leesroute voor de omgekeerde zending-lookup

**Files:**
- Create: `src/app/api/drukkerzendingen/route.ts`
- Test: `tests/app/api/drukkerzendingen-lookup.test.ts`

**Interfaces:**
- Consumes: `requireMedewerker` uit `@/lib/server/requireAuth`, `getPool` uit `@/lib/server/db`.
- Produces: `GET /api/drukkerzendingen?bestellingIds=a,b,c` → `200` met een array van
  `{ id: string; drukkerId: string; drukkerNaam: string; verzondenOp: string | null; bestellingIds: string[] }`,
  gesorteerd op `verzondenOp` aflopend. `401` zonder medewerkerssessie, `400` bij meer dan 200 ids, `[]` bij een lege of ontbrekende parameter.

Let op: de literale routemap `drukkerzendingen` wint in Next.js van de generieke `[resource]`-catch-all, dus er hoeft niets aan `LOOKUP_RESOURCES` te veranderen.

- [ ] **Step 1: Schrijf de falende test**

Maak `tests/app/api/drukkerzendingen-lookup.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { deleteRow, insertRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { GET as lookupZendingen } from '@/app/api/drukkerzendingen/route';
import { POST as createZending } from '@/app/api/drukkers/[id]/zendingen/route';

// Elke test maakt zijn eigen drukker met een verse UUID; de bestellingIds zijn
// `autotest-`-gemarkeerde literals die nergens anders voorkomen, zodat de lookup
// nooit echte zendingen uit staging raakt. De drukker wordt op vastgelegd id
// verwijderd (cascade ruimt de zendingen mee op) -- nooit een ongefilterde DELETE.
describe('drukkerzendingen lookup route', () => {
  const createdDrukkerIds: string[] = [];

  afterEach(async () => {
    while (createdDrukkerIds.length > 0) {
      await deleteRow('drukkers', createdDrukkerIds.pop()!);
    }
    await getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'staff-1'");
  });

  async function maakZending(bestellingIds: string[], cookie: string) {
    const drukker = await insertRow<{ id: string }>('drukkers', { naam: 'AUTOTEST PrintCo' } as never);
    createdDrukkerIds.push(drukker.id);
    await createZending(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          onderwerp: 'AUTOTEST zending',
          body: 'AUTOTEST',
          bestellingIds,
          aantalKlanten: 1,
          aantalRegels: bestellingIds.length,
          verzondDoor: 'AUTOTEST',
        }),
      }),
      { params: { id: drukker.id } }
    );
    return drukker;
  }

  it('rejects the lookup without a medewerker session', async () => {
    const response = await lookupZendingen(
      new Request('http://localhost/api/drukkerzendingen?bestellingIds=autotest-1')
    );
    expect(response.status).toBe(401);
  });

  it('finds the zending that contains the requested bestelling, including the drukker name', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;
    const drukker = await maakZending(['autotest-a1', 'autotest-a2'], cookie);

    const response = await lookupZendingen(
      new Request('http://localhost/api/drukkerzendingen?bestellingIds=autotest-a1', { headers: { cookie } })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].drukkerId).toBe(drukker.id);
    expect(body[0].drukkerNaam).toBe('AUTOTEST PrintCo');
    expect(body[0].bestellingIds).toEqual(['autotest-a1', 'autotest-a2']);
  });

  it('returns an empty array for an unknown bestelling id', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;
    await maakZending(['autotest-b1'], cookie);

    const response = await lookupZendingen(
      new Request('http://localhost/api/drukkerzendingen?bestellingIds=autotest-bestaat-niet', {
        headers: { cookie },
      })
    );
    expect(await response.json()).toEqual([]);
  });

  it('returns an empty array when the bestellingIds parameter is missing or empty', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;

    const zonder = await lookupZendingen(
      new Request('http://localhost/api/drukkerzendingen', { headers: { cookie } })
    );
    expect(await zonder.json()).toEqual([]);

    const leeg = await lookupZendingen(
      new Request('http://localhost/api/drukkerzendingen?bestellingIds=', { headers: { cookie } })
    );
    expect(await leeg.json()).toEqual([]);
  });

  it('rejects more than 200 ids', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;
    const ids = Array.from({ length: 201 }, (_, index) => `autotest-${index}`).join(',');

    const response = await lookupZendingen(
      new Request(`http://localhost/api/drukkerzendingen?bestellingIds=${ids}`, { headers: { cookie } })
    );
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Draai de test en controleer dat hij faalt**

Run: `npx vitest run tests/app/api/drukkerzendingen-lookup.test.ts`
Expected: FAIL — module `@/app/api/drukkerzendingen/route` bestaat niet.

- [ ] **Step 3: Maak de route**

Maak `src/app/api/drukkerzendingen/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { requireMedewerker } from '@/lib/server/requireAuth';

// Begrenst de OR-keten in de query; een grotere selectie dan dit komt in de
// beheeromgeving niet voor en zou alleen een onbedoeld enorme query opleveren.
const MAX_IDS = 200;

export async function GET(request: Request) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const raw = new URL(request.url).searchParams.get('bestellingIds') ?? '';
  const ids = raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    return NextResponse.json([]);
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: 'too-many-ids' }, { status: 400 });
  }

  // JSON_CONTAINS per id, ge-OR'd. Bewust geen JSON_OVERLAPS: dat vereist
  // MySQL 8.0.17+, terwijl JSON_CONTAINS vanaf 5.7 beschikbaar is.
  const where = ids.map(() => 'JSON_CONTAINS(z.bestellingIds, JSON_QUOTE(?))').join(' OR ');
  const [rows] = await getPool().query(
    `SELECT z.id, z.drukkerId, z.verzondenOp, z.bestellingIds, d.naam AS drukkerNaam
     FROM drukkerZendingen z
     JOIN drukkers d ON d.id = z.drukkerId
     WHERE ${where}
     ORDER BY z.verzondenOp DESC`,
    ids
  );

  return NextResponse.json(
    (rows as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      bestellingIds:
        typeof row.bestellingIds === 'string' ? JSON.parse(row.bestellingIds) : row.bestellingIds,
    }))
  );
}
```

- [ ] **Step 4: Draai de test**

Run: `npx vitest run tests/app/api/drukkerzendingen-lookup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/drukkerzendingen/route.ts tests/app/api/drukkerzendingen-lookup.test.ts
git commit -m "feat: leesroute voor zendingen per bestelling"
```

---

### Task 4: Zendinggenoten bepalen

**Files:**
- Create: `src/lib/zendingGenoten.ts`
- Test: `tests/lib/zendingGenoten.test.ts`

**Interfaces:**
- Consumes: route uit Taak 3; type `Bestelling` uit `@/components/beheer/BestellingenSection`.
- Produces:
  - `interface Zending { id: string; drukkerId: string; drukkerNaam: string; verzondenOp: Date | null; bestellingIds: string[] }`
  - `interface ZendingGenoten { zending: Zending; bestellingen: Bestelling[] }`
  - `fetchZendingen(bestellingIds: string[]): Promise<Zending[]>` — gooit bij een niet-ok respons.
  - `openstaandeZendingGenoten(zendingen: Zending[], afTeRonden: Bestelling[], alleBestellingen: Bestelling[]): ZendingGenoten[]`

- [ ] **Step 1: Schrijf de falende test**

Maak `tests/lib/zendingGenoten.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { openstaandeZendingGenoten, type Zending } from '@/lib/zendingGenoten';
import type { Bestelling } from '@/components/beheer/BestellingenSection';

function bestelling(id: string, status: Bestelling['status']): Bestelling {
  return {
    id,
    klantId: `klant-${id}`,
    companyName: `Bedrijf ${id}`,
    bestelnr: `GD-${id}`,
    besteldatum: '1-8-2026',
    status,
    lineCount: 1,
    totalQuantity: 1,
    lines: [],
  };
}

function zending(id: string, bestellingIds: string[]): Zending {
  return { id, drukkerId: `drukker-${id}`, drukkerNaam: `Drukker ${id}`, verzondenOp: null, bestellingIds };
}

describe('openstaandeZendingGenoten', () => {
  it('returns nothing when there are no zendingen', () => {
    const b1 = bestelling('1', 'Verstuurd naar drukker');
    expect(openstaandeZendingGenoten([], [b1], [b1])).toEqual([]);
  });

  it('leaves out the bestellingen that are being afgerond right now', () => {
    const b1 = bestelling('1', 'Verstuurd naar drukker');
    const b2 = bestelling('2', 'Verstuurd naar drukker');
    const result = openstaandeZendingGenoten([zending('z1', ['1', '2'])], [b1, b2], [b1, b2]);
    expect(result).toEqual([]);
  });

  it('reports a genoot that is still "Verstuurd naar drukker"', () => {
    const b1 = bestelling('1', 'Verstuurd naar drukker');
    const b2 = bestelling('2', 'Verstuurd naar drukker');
    const result = openstaandeZendingGenoten([zending('z1', ['1', '2'])], [b1], [b1, b2]);
    expect(result).toHaveLength(1);
    expect(result[0].zending.id).toBe('z1');
    expect(result[0].bestellingen.map((b) => b.id)).toEqual(['2']);
  });

  it('ignores genoten that are already afgerond', () => {
    const b1 = bestelling('1', 'Verstuurd naar drukker');
    const b2 = bestelling('2', 'Afgerond');
    expect(openstaandeZendingGenoten([zending('z1', ['1', '2'])], [b1], [b1, b2])).toEqual([]);
  });

  it('ignores ids that no longer exist in the bestellingen list', () => {
    const b1 = bestelling('1', 'Verstuurd naar drukker');
    expect(openstaandeZendingGenoten([zending('z1', ['1', 'weg'])], [b1], [b1])).toEqual([]);
  });

  it('groups genoten per zending and never lists the same bestelling twice', () => {
    const b1 = bestelling('1', 'Verstuurd naar drukker');
    const b2 = bestelling('2', 'Verstuurd naar drukker');
    const b3 = bestelling('3', 'Verstuurd naar drukker');
    const result = openstaandeZendingGenoten(
      [zending('z1', ['1', '2']), zending('z2', ['1', '2', '3'])],
      [b1],
      [b1, b2, b3]
    );
    expect(result.map((entry) => entry.zending.id)).toEqual(['z1', 'z2']);
    expect(result[0].bestellingen.map((b) => b.id)).toEqual(['2']);
    expect(result[1].bestellingen.map((b) => b.id)).toEqual(['3']);
  });
});
```

- [ ] **Step 2: Draai de test en controleer dat hij faalt**

Run: `npx vitest run tests/lib/zendingGenoten.test.ts`
Expected: FAIL — module `@/lib/zendingGenoten` bestaat niet.

- [ ] **Step 3: Maak `src/lib/zendingGenoten.ts`**

```ts
import type { Bestelling } from '@/components/beheer/BestellingenSection';

export interface Zending {
  id: string;
  drukkerId: string;
  drukkerNaam: string;
  verzondenOp: Date | null;
  bestellingIds: string[];
}

export interface ZendingGenoten {
  zending: Zending;
  bestellingen: Bestelling[];
}

export async function fetchZendingen(bestellingIds: string[]): Promise<Zending[]> {
  if (bestellingIds.length === 0) {
    return [];
  }
  const query = encodeURIComponent(bestellingIds.join(','));
  const response = await fetch(`/api/drukkerzendingen?bestellingIds=${query}`);
  if (!response.ok) {
    throw new Error('zending lookup failed');
  }
  const rows = (await response.json()) as Array<{
    id: string;
    drukkerId: string;
    drukkerNaam: string;
    verzondenOp: string | null;
    bestellingIds: string[] | null;
  }>;
  return rows.map((row) => ({
    id: row.id,
    drukkerId: row.drukkerId,
    drukkerNaam: row.drukkerNaam,
    verzondenOp: row.verzondenOp ? new Date(row.verzondenOp) : null,
    bestellingIds: row.bestellingIds ?? [],
  }));
}

/**
 * Bepaalt welke bestellingen uit dezelfde drukkerzending nog open staan.
 * Bestellingen die nu worden afgerond vallen af, net als alles wat de status
 * "Verstuurd naar drukker" niet (meer) heeft of niet meer in de lijst voorkomt.
 * Een bestelling verschijnt hoogstens onder één zending, ook als hij in
 * meerdere zendingen zit (bijvoorbeeld na opnieuw versturen).
 */
export function openstaandeZendingGenoten(
  zendingen: Zending[],
  afTeRonden: Bestelling[],
  alleBestellingen: Bestelling[]
): ZendingGenoten[] {
  const afTeRondenIds = new Set(afTeRonden.map((b) => b.id));
  const bestellingById = new Map(alleBestellingen.map((b) => [b.id, b]));
  const alGezien = new Set<string>();
  const resultaat: ZendingGenoten[] = [];

  for (const zending of zendingen) {
    const bestellingen = zending.bestellingIds
      .filter((id) => !afTeRondenIds.has(id) && !alGezien.has(id))
      .map((id) => bestellingById.get(id))
      .filter((b): b is Bestelling => b !== undefined && b.status === 'Verstuurd naar drukker');
    if (bestellingen.length === 0) {
      continue;
    }
    bestellingen.forEach((b) => alGezien.add(b.id));
    resultaat.push({ zending, bestellingen });
  }

  return resultaat;
}
```

- [ ] **Step 4: Draai de test**

Run: `npx vitest run tests/lib/zendingGenoten.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/zendingGenoten.ts tests/lib/zendingGenoten.test.ts
git commit -m "feat: bepaal openstaande zendinggenoten van een bestelling"
```

---

### Task 5: Gedeelde afrondhelper

**Files:**
- Create: `src/lib/afrondenBestellingen.ts`
- Test: `tests/lib/afrondenBestellingen.test.ts`

**Interfaces:**
- Consumes: `logActiviteit` en `ActiviteitActor` uit `@/lib/logActiviteit`; type `Bestelling`.
- Produces: `afrondBestellingen(bestellingen: Bestelling[], actor: ActiviteitActor): Promise<{ afgerond: Bestelling[]; mislukt: Bestelling[] }>`. De `afgerond`-lijst bevat kopieën met `status: 'Afgerond'`; beide lijsten houden de oorspronkelijke volgorde aan.

- [ ] **Step 1: Schrijf de falende test**

Maak `tests/lib/afrondenBestellingen.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { afrondBestellingen } from '@/lib/afrondenBestellingen';
import { logActiviteit } from '@/lib/logActiviteit';
import type { Bestelling } from '@/components/beheer/BestellingenSection';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

vi.mock('@/lib/logActiviteit', () => ({ logActiviteit: vi.fn() }));

const ACTOR = { id: 'staff-1', email: 'paul@example.com', naam: 'Paul' };

function bestelling(id: string): Bestelling {
  return {
    id,
    klantId: `klant-${id}`,
    companyName: `Bedrijf ${id}`,
    bestelnr: `GD-${id}`,
    besteldatum: '1-8-2026',
    status: 'Verstuurd naar drukker',
    lineCount: 1,
    totalQuantity: 1,
    lines: [],
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.mocked(logActiviteit).mockReset();
});

describe('afrondBestellingen', () => {
  it('patches every bestelling to Afgerond and reports them as afgerond', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const result = await afrondBestellingen([bestelling('1'), bestelling('2')], ACTOR);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/bestelheaders/1');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ status: 'Afgerond' });
    expect(result.afgerond.map((b) => b.id)).toEqual(['1', '2']);
    expect(result.afgerond.every((b) => b.status === 'Afgerond')).toBe(true);
    expect(result.mislukt).toEqual([]);
  });

  it('logs one activiteit per afgeronde bestelling with its bestelnummer', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    await afrondBestellingen([bestelling('1'), bestelling('2')], ACTOR);

    expect(logActiviteit).toHaveBeenCalledTimes(2);
    expect(logActiviteit).toHaveBeenCalledWith('bestelling_afgerond', ACTOR, 'GD-1');
    expect(logActiviteit).toHaveBeenCalledWith('bestelling_afgerond', ACTOR, 'GD-2');
  });

  it('reports a partial failure instead of pretending everything succeeded', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.endsWith('/2') ? Promise.resolve({ ok: false }) : Promise.resolve({ ok: true })
    );
    const result = await afrondBestellingen([bestelling('1'), bestelling('2')], ACTOR);

    expect(result.afgerond.map((b) => b.id)).toEqual(['1']);
    expect(result.mislukt.map((b) => b.id)).toEqual(['2']);
    expect(logActiviteit).toHaveBeenCalledTimes(1);
  });

  it('treats a rejected fetch as a failure rather than throwing', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const result = await afrondBestellingen([bestelling('1')], ACTOR);

    expect(result.afgerond).toEqual([]);
    expect(result.mislukt.map((b) => b.id)).toEqual(['1']);
  });
});
```

- [ ] **Step 2: Draai de test en controleer dat hij faalt**

Run: `npx vitest run tests/lib/afrondenBestellingen.test.ts`
Expected: FAIL — module `@/lib/afrondenBestellingen` bestaat niet.

- [ ] **Step 3: Maak `src/lib/afrondenBestellingen.ts`**

```ts
import { logActiviteit, type ActiviteitActor } from '@/lib/logActiviteit';
import type { Bestelling } from '@/components/beheer/BestellingenSection';

export interface AfrondResultaat {
  afgerond: Bestelling[];
  mislukt: Bestelling[];
}

/**
 * Zet elke meegegeven bestelling op "Afgerond" en logt per geslaagde bestelling
 * één activiteit. Een mislukte PATCH laat de bestelling ongemoeid en komt in
 * `mislukt` terecht -- de aanroeper hoort dat aan de medewerker te melden in
 * plaats van stilzwijgend alles als gelukt te tonen.
 */
export async function afrondBestellingen(
  bestellingen: Bestelling[],
  actor: ActiviteitActor
): Promise<AfrondResultaat> {
  const resultaten = await Promise.all(
    bestellingen.map(async (bestelling) => {
      try {
        const response = await fetch(`/api/bestelheaders/${bestelling.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'Afgerond' }),
        });
        if (!response.ok) {
          return { bestelling, gelukt: false };
        }
        void logActiviteit('bestelling_afgerond', actor, bestelling.bestelnr);
        return { bestelling, gelukt: true };
      } catch {
        return { bestelling, gelukt: false };
      }
    })
  );

  return {
    afgerond: resultaten
      .filter((r) => r.gelukt)
      .map((r) => ({ ...r.bestelling, status: 'Afgerond' as const })),
    mislukt: resultaten.filter((r) => !r.gelukt).map((r) => r.bestelling),
  };
}
```

- [ ] **Step 4: Draai de test**

Run: `npx vitest run tests/lib/afrondenBestellingen.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/afrondenBestellingen.ts tests/lib/afrondenBestellingen.test.ts
git commit -m "feat: gedeelde helper om bestellingen af te ronden"
```

---

### Task 6: Bevestigingsdialoog voor zendinggenoten

**Files:**
- Create: `src/components/beheer/AfrondenBevestigingDialog.tsx`
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/AfrondenBevestigingDialog.test.tsx`

**Interfaces:**
- Consumes: `ZendingGenoten` uit `@/lib/zendingGenoten` (Taak 4); `Modal` uit `@/components/Modal`.
- Produces: component `AfrondenBevestigingDialog` met props
  `{ isOpen: boolean; genoten: ZendingGenoten[]; onAlleenDeze: () => void; onOokDeze: () => void; onClose: () => void }`.
  Test-ids: `afronden-bevestiging`, `afronden-bevestiging-alleen-deze`, `afronden-bevestiging-ook-deze`, `afronden-bevestiging-annuleren`.

- [ ] **Step 1: Voeg de vertaalsleutels toe**

In `messages/nl.json`, direct ná `"bestellingenVersturenNaarDrukker"`:

```json
    "bestellingenAfrondenTitel": "Bestellingen afronden",
    "bestellingenAfrondenUitleg": "Deze zending bevatte ook bestellingen die nog niet zijn afgerond:",
    "bestellingenAfrondenZending": "{drukker} — verstuurd op {datum}",
    "bestellingenAfrondenZendingOnbekend": "{drukker} — verzenddatum onbekend",
    "bestellingenAfrondenAlleenDeze": "Alleen deze afronden",
    "bestellingenAfrondenOokDeze": "Ook deze afronden",
    "bestellingenAfrondenFout": "{n} bestelling(en) konden niet worden afgerond. Probeer het opnieuw.",
```

- [ ] **Step 2: Schrijf de falende test**

Maak `tests/components/beheer/AfrondenBevestigingDialog.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AfrondenBevestigingDialog } from '@/components/beheer/AfrondenBevestigingDialog';
import type { ZendingGenoten } from '@/lib/zendingGenoten';
import type { Bestelling } from '@/components/beheer/BestellingenSection';
import messages from '../../../messages/nl.json';

function bestelling(id: string, bestelnr: string): Bestelling {
  return {
    id,
    klantId: `klant-${id}`,
    companyName: `Bedrijf ${id}`,
    bestelnr,
    besteldatum: '1-8-2026',
    status: 'Verstuurd naar drukker',
    lineCount: 1,
    totalQuantity: 1,
    lines: [],
  };
}

const GENOTEN: ZendingGenoten[] = [
  {
    zending: {
      id: 'z1',
      drukkerId: 'drukker-1',
      drukkerNaam: 'Drukkerij Janssen',
      verzondenOp: new Date('2026-08-03T10:00:00Z'),
      bestellingIds: ['header-1', 'header-2'],
    },
    bestellingen: [bestelling('header-2', 'GD-00302')],
  },
];

function renderDialog(overrides: Partial<React.ComponentProps<typeof AfrondenBevestigingDialog>> = {}) {
  const onAlleenDeze = vi.fn();
  const onOokDeze = vi.fn();
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <AfrondenBevestigingDialog
        isOpen
        genoten={GENOTEN}
        onAlleenDeze={onAlleenDeze}
        onOokDeze={onOokDeze}
        onClose={onClose}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  return { onAlleenDeze, onOokDeze, onClose };
}

describe('AfrondenBevestigingDialog', () => {
  it('renders nothing when it is closed', () => {
    renderDialog({ isOpen: false });
    expect(screen.queryByTestId('afronden-bevestiging')).not.toBeInTheDocument();
  });

  it('names the drukker and lists the open bestelnummers', () => {
    renderDialog();
    const dialog = screen.getByTestId('afronden-bevestiging');
    expect(dialog).toHaveTextContent('Drukkerij Janssen');
    expect(dialog).toHaveTextContent('GD-00302');
  });

  it('falls back to a readable line when the verzenddatum is unknown', () => {
    renderDialog({
      genoten: [{ ...GENOTEN[0], zending: { ...GENOTEN[0].zending, verzondenOp: null } }],
    });
    expect(screen.getByTestId('afronden-bevestiging')).toHaveTextContent('verzenddatum onbekend');
  });

  it('calls onAlleenDeze when only the original selection should be afgerond', () => {
    const { onAlleenDeze, onOokDeze } = renderDialog();
    fireEvent.click(screen.getByTestId('afronden-bevestiging-alleen-deze'));
    expect(onAlleenDeze).toHaveBeenCalledTimes(1);
    expect(onOokDeze).not.toHaveBeenCalled();
  });

  it('calls onOokDeze when the genoten should be afgerond too', () => {
    const { onAlleenDeze, onOokDeze } = renderDialog();
    fireEvent.click(screen.getByTestId('afronden-bevestiging-ook-deze'));
    expect(onOokDeze).toHaveBeenCalledTimes(1);
    expect(onAlleenDeze).not.toHaveBeenCalled();
  });

  it('closes without afronden when cancelled', () => {
    const { onClose, onAlleenDeze, onOokDeze } = renderDialog();
    fireEvent.click(screen.getByTestId('afronden-bevestiging-annuleren'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAlleenDeze).not.toHaveBeenCalled();
    expect(onOokDeze).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Draai de test en controleer dat hij faalt**

Run: `npx vitest run tests/components/beheer/AfrondenBevestigingDialog.test.tsx`
Expected: FAIL — module `@/components/beheer/AfrondenBevestigingDialog` bestaat niet.

- [ ] **Step 4: Maak de component**

Maak `src/components/beheer/AfrondenBevestigingDialog.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal';
import type { ZendingGenoten } from '@/lib/zendingGenoten';

interface AfrondenBevestigingDialogProps {
  isOpen: boolean;
  genoten: ZendingGenoten[];
  onAlleenDeze: () => void;
  onOokDeze: () => void;
  onClose: () => void;
}

export function AfrondenBevestigingDialog({
  isOpen,
  genoten,
  onAlleenDeze,
  onOokDeze,
  onClose,
}: AfrondenBevestigingDialogProps) {
  const t = useTranslations('beheer');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeLabel={t('modalClose')}
      title={t('bestellingenAfrondenTitel')}
      footerActions={
        <>
          <button
            type="button"
            onClick={onOokDeze}
            data-testid="afronden-bevestiging-ook-deze"
            className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
          >
            {t('bestellingenAfrondenOokDeze')}
          </button>
          <button
            type="button"
            onClick={onAlleenDeze}
            data-testid="afronden-bevestiging-alleen-deze"
            className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
          >
            {t('bestellingenAfrondenAlleenDeze')}
          </button>
          <button
            type="button"
            onClick={onClose}
            data-testid="afronden-bevestiging-annuleren"
            className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
          >
            {t('annuleren')}
          </button>
        </>
      }
    >
      <div data-testid="afronden-bevestiging" className="flex flex-col gap-3 text-sm text-white/80">
        <p>{t('bestellingenAfrondenUitleg')}</p>
        {genoten.map(({ zending, bestellingen }) => (
          <div key={zending.id} className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-white/60">
              {zending.verzondenOp
                ? t('bestellingenAfrondenZending', {
                    drukker: zending.drukkerNaam,
                    datum: zending.verzondenOp.toLocaleDateString('nl-NL'),
                  })
                : t('bestellingenAfrondenZendingOnbekend', { drukker: zending.drukkerNaam })}
            </span>
            <ul className="list-disc pl-5 text-xs text-white/70">
              {bestellingen.map((bestelling) => (
                <li key={bestelling.id}>
                  {bestelling.bestelnr} — {bestelling.companyName}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 5: Draai de test**

Run: `npx vitest run tests/components/beheer/AfrondenBevestigingDialog.test.tsx`
Expected: PASS.

`beheer.modalClose` ("Sluiten") en `beheer.annuleren` ("Annuleren") bestaan al in `messages/nl.json` en worden hier hergebruikt; er hoeft dus niets aan toegevoegd te worden behalve de sleutels uit Step 1.

- [ ] **Step 6: Commit**

```bash
git add src/components/beheer/AfrondenBevestigingDialog.tsx messages/nl.json tests/components/beheer/AfrondenBevestigingDialog.test.tsx
git commit -m "feat: bevestigingsdialoog voor openstaande zendinggenoten"
```

---

### Task 7: Los en bulk afronden bedraden

**Files:**
- Modify: `src/components/beheer/BestellingModal.tsx` (props, `handleAfronden`)
- Modify: `src/components/beheer/BestellingenSection.tsx` (afrondstroom, dialoog, foutmelding)
- Test: `tests/components/beheer/BestellingenSection.test.tsx`, `tests/components/beheer/BestellingModal.test.tsx`

**Interfaces:**
- Consumes: `fetchZendingen` + `openstaandeZendingGenoten` + `ZendingGenoten` (Taak 4), `afrondBestellingen` (Taak 5), `AfrondenBevestigingDialog` (Taak 6), knop `bestellingen-afronden` (Taak 2).
- Produces: `BestellingModal` krijgt de verplichte prop `onAfronden: (bestelling: Bestelling) => void` en doet zelf geen afrond-PATCH meer. Foutmelding-test-id: `bestellingen-afronden-fout`.

- [ ] **Step 1: Schrijf de falende tests in `tests/components/beheer/BestellingenSection.test.tsx`**

Voeg onderaan, vóór de afsluitende `});` van het buitenste `describe`, toe:

```tsx
  describe('afronden', () => {
    const VERSTUURD = BESTELLINGEN[1];

    function mockLookup(zendingen: unknown[]) {
      fetchMock.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.startsWith('/api/drukkerzendingen')) {
          return Promise.resolve({ ok: true, json: async () => zendingen });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
    }

    it('rondt direct af zonder dialoog wanneer er geen openstaande zendinggenoten zijn', async () => {
      mockLookup([]);
      const { onBestellingUpdated } = renderSection({ bestellingen: [VERSTUURD] });
      fireEvent.click(screen.getByTestId('data-table-quick-verstuurd'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-2'));
      fireEvent.click(screen.getByTestId('bestellingen-afronden'));

      await waitFor(() =>
        expect(onBestellingUpdated).toHaveBeenCalledWith({ ...VERSTUURD, status: 'Afgerond' })
      );
      expect(screen.queryByTestId('afronden-bevestiging')).not.toBeInTheDocument();
    });

    it('toont de dialoog met de openstaande genoot en rondt bij "alleen deze" alleen de selectie af', async () => {
      const genoot = { ...BESTELLINGEN[1], id: 'header-9', bestelnr: 'GD-00309' };
      mockLookup([
        {
          id: 'z1',
          drukkerId: 'drukker-1',
          drukkerNaam: 'Drukkerij Janssen',
          verzondenOp: '2026-08-03T10:00:00Z',
          bestellingIds: ['header-2', 'header-9'],
        },
      ]);
      const { onBestellingUpdated } = renderSection({ bestellingen: [VERSTUURD, genoot] });
      fireEvent.click(screen.getByTestId('data-table-quick-verstuurd'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-2'));
      fireEvent.click(screen.getByTestId('bestellingen-afronden'));

      await waitFor(() => expect(screen.getByTestId('afronden-bevestiging')).toBeInTheDocument());
      expect(screen.getByTestId('afronden-bevestiging')).toHaveTextContent('GD-00309');

      fireEvent.click(screen.getByTestId('afronden-bevestiging-alleen-deze'));

      await waitFor(() => expect(onBestellingUpdated).toHaveBeenCalledTimes(1));
      expect(onBestellingUpdated).toHaveBeenCalledWith({ ...VERSTUURD, status: 'Afgerond' });
    });

    it('rondt bij "ook deze" de selectie én de genoten af', async () => {
      const genoot = { ...BESTELLINGEN[1], id: 'header-9', bestelnr: 'GD-00309' };
      mockLookup([
        {
          id: 'z1',
          drukkerId: 'drukker-1',
          drukkerNaam: 'Drukkerij Janssen',
          verzondenOp: '2026-08-03T10:00:00Z',
          bestellingIds: ['header-2', 'header-9'],
        },
      ]);
      const { onBestellingUpdated } = renderSection({ bestellingen: [VERSTUURD, genoot] });
      fireEvent.click(screen.getByTestId('data-table-quick-verstuurd'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-2'));
      fireEvent.click(screen.getByTestId('bestellingen-afronden'));

      await waitFor(() => expect(screen.getByTestId('afronden-bevestiging')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('afronden-bevestiging-ook-deze'));

      await waitFor(() => expect(onBestellingUpdated).toHaveBeenCalledTimes(2));
      const afgerondeIds = onBestellingUpdated.mock.calls.map((call) => call[0].id).sort();
      expect(afgerondeIds).toEqual(['header-2', 'header-9']);
    });

    it('rondt gewoon af wanneer de zending-lookup faalt', async () => {
      fetchMock.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.startsWith('/api/drukkerzendingen')) {
          return Promise.resolve({ ok: false, json: async () => ({}) });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
      const { onBestellingUpdated } = renderSection({ bestellingen: [VERSTUURD] });
      fireEvent.click(screen.getByTestId('data-table-quick-verstuurd'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-2'));
      fireEvent.click(screen.getByTestId('bestellingen-afronden'));

      await waitFor(() =>
        expect(onBestellingUpdated).toHaveBeenCalledWith({ ...VERSTUURD, status: 'Afgerond' })
      );
      expect(screen.queryByTestId('afronden-bevestiging')).not.toBeInTheDocument();
    });

    it('meldt hoeveel bestellingen niet konden worden afgerond', async () => {
      fetchMock.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.startsWith('/api/drukkerzendingen')) {
          return Promise.resolve({ ok: true, json: async () => [] });
        }
        if (typeof url === 'string' && url.startsWith('/api/bestelheaders/')) {
          return Promise.resolve({ ok: false });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
      const { onBestellingUpdated } = renderSection({ bestellingen: [VERSTUURD] });
      fireEvent.click(screen.getByTestId('data-table-quick-verstuurd'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-2'));
      fireEvent.click(screen.getByTestId('bestellingen-afronden'));

      await waitFor(() => expect(screen.getByTestId('bestellingen-afronden-fout')).toBeInTheDocument());
      expect(onBestellingUpdated).not.toHaveBeenCalled();
    });

    it('rondt een losse bestelling af via de modal en sluit die', async () => {
      mockLookup([]);
      const { onBestellingUpdated } = renderSection({ bestellingen: [VERSTUURD] });
      fireEvent.click(screen.getByTestId('data-table-row-header-2'));
      fireEvent.click(screen.getByTestId('bestelling-modal-afronden'));

      await waitFor(() =>
        expect(onBestellingUpdated).toHaveBeenCalledWith({ ...VERSTUURD, status: 'Afgerond' })
      );
      await waitFor(() => expect(screen.queryByTestId('bestelling-modal')).not.toBeInTheDocument());
    });
  });
```

- [ ] **Step 2: Draai de tests en controleer dat ze falen**

Run: `npx vitest run tests/components/beheer/BestellingenSection.test.tsx`
Expected: FAIL — de knop `bestellingen-afronden` heeft nog geen `onClick` en `afronden-bevestiging` bestaat niet in dit scherm.

- [ ] **Step 3: Laat `BestellingModal` het afronden delegeren**

In `src/components/beheer/BestellingModal.tsx`: voeg aan `BestellingModalProps` toe:

```ts
  onAfronden: (bestelling: Bestelling) => void;
```

Voeg `onAfronden` toe aan de gedestructureerde props, en vervang de volledige functie `handleAfronden` door:

```tsx
  function handleAfronden() {
    if (!bestelling) return;
    onAfronden(bestelling);
  }
```

De knop zelf en zijn `data-testid="bestelling-modal-afronden"` blijven ongewijzigd. `handleTerugzetten`, `handleGoedkeuren` en `handleAfwijzen` blijven zoals ze zijn.

- [ ] **Step 4: Bouw de afrondstroom in `BestellingenSection`**

Voeg de imports toe:

```tsx
import { useAdminAuth } from '@/lib/useAdminAuth';
import { actorFromMedewerker } from '@/lib/logActiviteit';
import { afrondBestellingen } from '@/lib/afrondenBestellingen';
import { fetchZendingen, openstaandeZendingGenoten, type ZendingGenoten } from '@/lib/zendingGenoten';
import { AfrondenBevestigingDialog } from './AfrondenBevestigingDialog';
```

Voeg bij de overige state toe:

```tsx
  const { user } = useAdminAuth();
  const [afrondKandidaten, setAfrondKandidaten] = useState<Bestelling[]>([]);
  const [afrondGenoten, setAfrondGenoten] = useState<ZendingGenoten[]>([]);
  const [afrondFout, setAfrondFout] = useState<string | null>(null);
```

Voeg de twee functies toe (boven de `if (loadError)`-controle):

```tsx
  async function voerAfrondingUit(teAfronden: Bestelling[]) {
    const { afgerond, mislukt } = await afrondBestellingen(teAfronden, actorFromMedewerker(user));
    afgerond.forEach(onBestellingUpdated);
    setAfrondKandidaten([]);
    setAfrondGenoten([]);
    setSelectedIds(new Set());
    setAfrondFout(mislukt.length > 0 ? t('bestellingenAfrondenFout', { n: mislukt.length }) : null);
  }

  async function startAfronden(teAfronden: Bestelling[]) {
    if (teAfronden.length === 0) return;
    setAfrondFout(null);

    let genoten: ZendingGenoten[] = [];
    try {
      const zendingen = await fetchZendingen(teAfronden.map((b) => b.id));
      genoten = openstaandeZendingGenoten(zendingen, teAfronden, bestellingen ?? []);
    } catch {
      // De zendinggenoot-melding is informatief. Faalt de lookup, dan is de
      // medewerker tegenhouden erger dan de hint missen -- gewoon afronden.
      genoten = [];
    }

    if (genoten.length === 0) {
      await voerAfrondingUit(teAfronden);
      return;
    }
    setAfrondKandidaten(teAfronden);
    setAfrondGenoten(genoten);
  }
```

Hang de bulk-knop uit Taak 2 aan de stroom door hem een `onClick` te geven:

```tsx
              onClick={() => void startAfronden(bestellingen.filter((b) => selectedIds.has(b.id)))}
```

Geef `BestellingModal` de nieuwe prop:

```tsx
        onAfronden={(bestelling) => {
          setSelectedBestelling(null);
          void startAfronden([bestelling]);
        }}
```

Voeg onder de bestaande `VersturenNaarDrukkerDialog` toe:

```tsx
      <AfrondenBevestigingDialog
        isOpen={afrondGenoten.length > 0}
        genoten={afrondGenoten}
        onAlleenDeze={() => void voerAfrondingUit(afrondKandidaten)}
        onOokDeze={() =>
          void voerAfrondingUit([
            ...afrondKandidaten,
            ...afrondGenoten.flatMap((entry) => entry.bestellingen),
          ])
        }
        onClose={() => {
          setAfrondKandidaten([]);
          setAfrondGenoten([]);
        }}
      />
```

En toon de foutmelding, direct boven de `DataTable`:

```tsx
      {afrondFout && (
        <p data-testid="bestellingen-afronden-fout" className="mb-3 text-xs text-red-400">
          {afrondFout}
        </p>
      )}
```

- [ ] **Step 5: Pas `tests/components/beheer/BestellingModal.test.tsx` aan**

Twee wijzigingen, beide nodig omdat de modal het afronden nu delegeert.

Eerst de render-helper (rond regel 90). Voeg de mock toe, geef hem door en
retourneer hem:

```tsx
function renderModal(bestelling: Bestelling | null) {
  const onClose = vi.fn();
  const onUpdated = vi.fn();
  const onAfronden = vi.fn();
  const onLinePrijsVastgesteld = vi.fn();
  const onLineUpdated = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <BestellingModal
        bestelling={bestelling}
        kunstwerken={KUNSTWERKEN}
        materialen={MATERIALEN}
        maten={MATEN}
        materiaalsoorten={MATERIAALSOORTEN}
        klanten={KLANTEN}
        btwTarieven={BTWTARIEVEN}
        onClose={onClose}
        onUpdated={onUpdated}
        onAfronden={onAfronden}
        onLinePrijsVastgesteld={onLinePrijsVastgesteld}
        onLineUpdated={onLineUpdated}
      />
    </NextIntlClientProvider>
  );
  return { onClose, onUpdated, onAfronden, onLinePrijsVastgesteld, onLineUpdated };
}
```

Er zijn nog drie losse `<BestellingModal ... />`-renders in dit bestand (rond
regel 328, 485 en 519) die de props handmatig opsommen; voeg daar telkens
`onAfronden={vi.fn()}` toe naast de bestaande `onUpdated={vi.fn()}`.

Vervang daarna de test `'marks the bestelling as Afgerond, logs bestelling_afgerond, and calls onUpdated'`
(in `describe('BestellingModal — afronden/terugzetten')`) volledig door:

```tsx
  it('delegates afronden to onAfronden instead of patching the bestelling itself', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const { onAfronden, onUpdated } = renderModal(BESTELLING_VERSTUURD);
    fireEvent.click(screen.getByTestId('bestelling-modal-afronden'));

    expect(onAfronden).toHaveBeenCalledWith(BESTELLING_VERSTUURD);
    expect(onUpdated).not.toHaveBeenCalled();
    expect(logActiviteitMock).not.toHaveBeenCalledWith(
      'bestelling_afgerond',
      expect.anything(),
      expect.anything()
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/bestelheaders/header-4',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'Afgerond' }) })
    );
  });
```

De tests voor `terugzetten` en voor welke knoppen per status zichtbaar zijn,
blijven ongewijzigd — die gedragingen verandert deze taak niet.

- [ ] **Step 5b: Draai de tests**

Run: `npx vitest run tests/components/beheer/BestellingenSection.test.tsx tests/components/beheer/BestellingModal.test.tsx`
Expected: PASS.

- [ ] **Step 6: Draai de volledige suite en de linter**

Run: `npm test`
Expected: PASS.

Run: `npm run lint`
Expected: geen fouten.

- [ ] **Step 7: Commit**

```bash
git add src/components/beheer/BestellingModal.tsx src/components/beheer/BestellingenSection.tsx tests/components/beheer/BestellingenSection.test.tsx tests/components/beheer/BestellingModal.test.tsx
git commit -m "feat: meerdere bestellingen tegelijk afronden met zendinggenoot-melding"
```

---

## Handmatige verificatie na Taak 7

Draai `npm run dev` (start hem zelf, niet via `preview_start({name})` — dat kan de hoofdcheckout serveren in plaats van deze worktree) en log in op `/nl/beheer` met een medewerkersaccount. Controleer:

1. Bestellingen opent op "Alle bestellingen", zonder selectievakjes.
2. Klikken op "Te versturen naar drukker" toont vakjes; "Verstuurd naar drukker" ook; terug naar "Alle bestellingen" laat de vakjes én de selectiebalk verdwijnen.
3. Onder "Verstuurd naar drukker" meerdere bestellingen aanvinken toont de knop "Afronden".
4. Afronden van een bestelling die samen met een andere naar dezelfde drukker ging, toont de dialoog met dat bestelnummer; "Ook deze afronden" zet beide op Afgerond.
5. Sluit de dev-server af als je klaar bent — een vergeten `npm run dev` houdt een connectiepool op de staging-database open.
