# Status "Te factureren" / "Betaald en afgerond" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insert a new order status `'Te factureren'` between `'Verstuurd naar drukker'` and a renamed final status `'Betaald en afgerond'` (replacing `'Afgerond'`), selectable as a quick-filter on the Bestellingen screen, with no invoicing functionality (that happens outside the system).

**Architecture:** Extend the `Bestelling['status']` union with `'Te factureren'` and rename `'Afgerond'` to `'Betaald en afgerond'`. Repurpose the existing "Afronden" mechanism (three-ref mutex + `afrondenBestellingen.ts` + `DrukkerModal.tsx`'s duplicated completion path) to target `'Te factureren'` instead of `'Afgerond'` — its zendinggenoten-warning behavior and the mutex itself do not change. Add a new, deliberately simple (no mutex, no zendinggenoten check) status-transition action for `'Te factureren'` → `'Betaald en afgerond'`, modeled on the existing `handleGoedkeuren`/`handleAfwijzen` pattern. Update all `Record<Bestelling['status'], ...>` exhaustive maps, the customer-facing status map, quick-filters, and Terugzetten logic accordingly.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind, next-intl, mysql2 (no schema change needed — `status` columns are free-text `VARCHAR(50)`).

## Global Constraints

- Full design reference: [docs/superpowers/specs/2026-08-07-te-factureren-status-design.md](../specs/2026-08-07-te-factureren-status-design.md) — read it before starting any task.
- New status flow: `Te beoordelen → Te versturen naar drukker → Verstuurd naar drukker → Te factureren → Betaald en afgerond`, with `Afgewezen` reachable from `Te beoordelen`.
- Exact status strings (case-sensitive, used verbatim everywhere): `'Te factureren'` and `'Betaald en afgerond'`.
- `zendingGenoten.ts`'s filter on `'Verstuurd naar drukker'` (line 95, `openstaandeZendingGenoten`) **must not change**.
- The three-ref mutex (`afrondBezigRef`/`afrondDialoogOpenRef`/`afrondUitSelectieRef`) and `startAfronden`/`voerAfrondingUit` control flow in `BestellingenSection.tsx` **must not change** — only the status string that flows through `afrondenBestellingen.ts` changes.
- The new `'Te factureren'` → `'Betaald en afgerond'` action must be a plain PATCH with no zendinggenoten dialog and no mutex — same shape as `handleGoedkeuren`/`handleAfwijzen` in `BestellingModal.tsx`.
- No `db/schema.sql` changes — both new strings fit the existing `VARCHAR(50)` columns.
- Do not add server-side status-transition validation — out of scope.
- Do not build any invoicing feature (invoice numbers, PDFs, accounting integration) — out of scope per the spec's "Wat dit ontwerp bewust niet doet".
- Only `messages/nl.json` has the `beheer` namespace — do not touch `en.json`/`de.json`/`fr.json` for `beheer` keys.
- Test cleanup for any test touching the real staging database must stay scoped to exactly what that test created — never a blanket `DELETE`/`TRUNCATE` (project-wide hard rule).

---

### Task 1: Status union + all compiler-enforced maps

**Files:**
- Modify: `src/components/beheer/BestellingenSection.tsx:36`
- Modify: `src/components/beheer/BestellingModal.tsx:17-23` (`STATUS_BADGE_CLASS`), `:57-63` (`HISTORIE_LABEL_KEY`)
- Modify: `src/lib/klantBestellingStatus.ts:5-11` (`KLANT_STATUS_MAP`)
- Test: `tests/lib/klantBestellingStatus.test.ts`

**Interfaces:**
- Produces: `Bestelling['status']` = `'Te beoordelen' | 'Te versturen naar drukker' | 'Verstuurd naar drukker' | 'Te factureren' | 'Betaald en afgerond' | 'Afgewezen'` — every later task relies on this exact union and exact string values.

- [ ] **Step 1: Update the status union**

In `src/components/beheer/BestellingenSection.tsx`, change line 36 from:

```ts
  status: 'Te beoordelen' | 'Te versturen naar drukker' | 'Verstuurd naar drukker' | 'Afgerond' | 'Afgewezen';
```

to:

```ts
  status: 'Te beoordelen' | 'Te versturen naar drukker' | 'Verstuurd naar drukker' | 'Te factureren' | 'Betaald en afgerond' | 'Afgewezen';
```

- [ ] **Step 2: Run the build to find every compile error from the union change**

Run: `npx tsc --noEmit`

Expected: multiple errors pointing at every `Record<Bestelling['status'], ...>` site and every literal `'Afgerond'` comparison/assignment across the codebase (not just the files listed below — this step is how you find them all; the files listed in this plan are the ones known at plan-writing time, but treat `tsc`'s output as the authoritative list). Do not fix them yet — this step is just reconnaissance.

- [ ] **Step 3: Update `STATUS_BADGE_CLASS` in `BestellingModal.tsx`**

Change:

```ts
const STATUS_BADGE_CLASS: Record<Bestelling['status'], string> = {
  'Te beoordelen': 'bg-amber-400/10 text-amber-300',
  'Te versturen naar drukker': 'bg-sky-400/10 text-sky-300',
  'Verstuurd naar drukker': 'bg-green-500/10 text-green-400',
  Afgerond: 'bg-teal-400/10 text-teal-300',
  Afgewezen: 'bg-red-400/10 text-red-400',
};
```

to:

```ts
const STATUS_BADGE_CLASS: Record<Bestelling['status'], string> = {
  'Te beoordelen': 'bg-amber-400/10 text-amber-300',
  'Te versturen naar drukker': 'bg-sky-400/10 text-sky-300',
  'Verstuurd naar drukker': 'bg-green-500/10 text-green-400',
  'Te factureren': 'bg-purple-400/10 text-purple-300',
  'Betaald en afgerond': 'bg-teal-400/10 text-teal-300',
  Afgewezen: 'bg-red-400/10 text-red-400',
};
```

- [ ] **Step 4: Update `HISTORIE_LABEL_KEY` in `BestellingModal.tsx`**

Change:

```ts
const HISTORIE_LABEL_KEY: Record<string, string> = {
  'Te beoordelen': 'bestellingenHistorieTeBeoordelen',
  'Te versturen naar drukker': 'bestellingenHistorieTeVersturenNaarDrukker',
  'Verstuurd naar drukker': 'bestellingenHistorieVerstuurdNaarDrukker',
  Afgerond: 'bestellingenHistorieAfgerond',
  Afgewezen: 'bestellingenHistorieAfgewezen',
};
```

to:

```ts
const HISTORIE_LABEL_KEY: Record<string, string> = {
  'Te beoordelen': 'bestellingenHistorieTeBeoordelen',
  'Te versturen naar drukker': 'bestellingenHistorieTeVersturenNaarDrukker',
  'Verstuurd naar drukker': 'bestellingenHistorieVerstuurdNaarDrukker',
  'Te factureren': 'bestellingenHistorieTeFactureren',
  'Betaald en afgerond': 'bestellingenHistorieAfgerond',
  Afgewezen: 'bestellingenHistorieAfgewezen',
};
```

(The i18n key `bestellingenHistorieAfgerond` keeps its name but its translated value changes in Task 6 — this avoids touching every historie-entry reference for a pure rename. `bestellingenHistorieTeFactureren` is a new key, also added in Task 6.)

- [ ] **Step 5: Update `KLANT_STATUS_MAP` in `src/lib/klantBestellingStatus.ts`**

Change:

```ts
const KLANT_STATUS_MAP: Record<Bestelling['status'], KlantBestellingStatus> = {
  'Te beoordelen': 'inBehandeling',
  'Te versturen naar drukker': 'inBehandeling',
  'Verstuurd naar drukker': 'inBehandeling',
  Afgerond: 'afgerond',
  Afgewezen: 'afgewezen',
};
```

to:

```ts
const KLANT_STATUS_MAP: Record<Bestelling['status'], KlantBestellingStatus> = {
  'Te beoordelen': 'inBehandeling',
  'Te versturen naar drukker': 'inBehandeling',
  'Verstuurd naar drukker': 'inBehandeling',
  'Te factureren': 'inBehandeling',
  'Betaald en afgerond': 'afgerond',
  Afgewezen: 'afgewezen',
};
```

- [ ] **Step 6: Update `tests/lib/klantBestellingStatus.test.ts`**

Read the existing test file first. It almost certainly has a case asserting
`toKlantBestellingStatus('Afgerond') === 'afgerond'` — rename that fixture status to
`'Betaald en afgerond'`. Add one new case:

```ts
it('maps Te factureren to inBehandeling', () => {
  expect(toKlantBestellingStatus('Te factureren')).toBe('inBehandeling');
});
```

Keep the existing test's structure/style (describe/it blocks, assertion style) — match
what's already in the file rather than introducing a new pattern.

- [ ] **Step 7: Run this task's tests**

Run: `npx vitest run tests/lib/klantBestellingStatus.test.ts`
Expected: PASS

- [ ] **Step 8: Run the full type-check again to confirm this task's changes compile**

Run: `npx tsc --noEmit`

Expected: remaining errors are only in files owned by later tasks (`afrondenBestellingen.ts`,
`DrukkerModal.tsx`, `BestellingModal.tsx`'s `handleTerugzetten`/footer ternary,
`BestellingenSection.tsx`'s quick-filter options). Do not fix those here.

- [ ] **Step 9: Commit**

```bash
git add src/components/beheer/BestellingenSection.tsx src/components/beheer/BestellingModal.tsx src/lib/klantBestellingStatus.ts tests/lib/klantBestellingStatus.test.ts
git commit -m "feat: voeg status Te factureren toe en hernoem Afgerond naar Betaald en afgerond in status-union"
```

---

### Task 2: Repurpose the "Afronden" mechanism's target status

**Files:**
- Modify: `src/lib/afrondenBestellingen.ts`
- Modify: `src/components/beheer/DrukkerModal.tsx:69-120`
- Test: `tests/lib/afrondenBestellingen.test.ts`
- Test: `tests/components/beheer/DrukkerModal.test.tsx`

**Interfaces:**
- Consumes: `Bestelling['status']` from Task 1 (now includes `'Te factureren'`/`'Betaald en afgerond'`).
- Produces: `afrondBestellingen()` (unchanged signature: `(bestellingen: Bestelling[], actor: ActiviteitActor) => Promise<AfrondResultaat>`) now writes `status: 'Te factureren'` instead of `'Afgerond'`. `DrukkerModal.tsx`'s `afgerondCounts()` and `handleMarkeerZendingAlsAfgerond()` (unchanged signatures) now count/target `'Te factureren'`.

- [ ] **Step 1: Update `afrondenBestellingen.ts`**

Change line 25 (PATCH body) and line 41 (result mapping) from `'Afgerond'` to
`'Te factureren'`:

```ts
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
          body: JSON.stringify({ status: 'Te factureren' }),
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
      .map((r) => ({ ...r.bestelling, status: 'Te factureren' as const })),
    mislukt: resultaten.filter((r) => !r.gelukt).map((r) => r.bestelling),
  };
}
```

Keep the `logActiviteit('bestelling_afgerond', ...)` call and code name as-is — it still
means "the printer stage is done", which remains true. Do not rename the activiteitenlog
event code (that would be an unrelated migration of historical log data).

Also update the function's doc comment (currently says `Zet elke meegegeven bestelling op
"Afgerond"`) to say `"Te factureren"` instead, so the comment matches the code.

- [ ] **Step 2: Update `DrukkerModal.tsx`**

In `afgerondCounts` (line ~74), change:

```ts
return { afgerond: orders.filter((b) => b.status === 'Afgerond').length, totaal: zending.bestellingIds.length };
```

to:

```ts
return { afgerond: orders.filter((b) => b.status === 'Te factureren').length, totaal: zending.bestellingIds.length };
```

In `handleMarkeerZendingAlsAfgerond` (line ~91), change:

```ts
const alleAfgerond = orders.length === zending.bestellingIds.length && orders.every((b) => b.status === 'Afgerond');
```

to:

```ts
const alleAfgerond = orders.length === zending.bestellingIds.length && orders.every((b) => b.status === 'Te factureren');
```

And the PATCH body + local state update (lines ~106, ~110), change both occurrences of
`'Afgerond'` to `'Te factureren'`:

```ts
        const response = await fetch(`/api/bestelheaders/${bestelling.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'Te factureren' }),
        });
        if (!response.ok) throw new Error('update failed');
        void logActiviteit('bestelling_afgerond', actorFromMedewerker(user), bestelling.bestelnr);
        onBestellingUpdated({ ...bestelling, status: 'Te factureren' });
```

Do **not** change the `teAfronden` filter (`orders.filter((b) => b.status === 'Verstuurd naar drukker')`,
line ~89) — that still correctly finds orders still eligible to complete the printer stage.
Do not change any i18n key names or `drukkersZendingAfgerondBadge`/`drukkersMarkeerZendingAlsAfgerond*`
translation values — per the spec, that copy still makes sense unchanged.

- [ ] **Step 3: Update `tests/lib/afrondenBestellingen.test.ts`**

Read the file first. Update every assertion/fixture expecting `status: 'Afgerond'` (or the
string `'Afgerond'` in a PATCH body assertion) after calling `afrondBestellingen` to expect
`'Te factureren'` instead. Keep mock/fetch assertion structure as-is otherwise.

- [ ] **Step 4: Update `tests/components/beheer/DrukkerModal.test.tsx`**

Read the file first. Update the one occurrence of `'Verstuurd naar drukker'` if it is used
to seed a fixture representing "not yet done with printer stage" (leave unchanged if so —
only rename fixtures that represent the *post-completion* status, i.e. any fixture currently
using `'Afgerond'` to represent a completed order in this file). Update any assertion on the
`afgerondCounts`/`drukker-zending-afgerond-badge`/`handleMarkeerZendingAlsAfgerond` PATCH body
or resulting order status from `'Afgerond'` to `'Te factureren'`.

- [ ] **Step 5: Run this task's tests**

Run: `npx vitest run tests/lib/afrondenBestellingen.test.ts tests/components/beheer/DrukkerModal.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/afrondenBestellingen.ts src/components/beheer/DrukkerModal.tsx tests/lib/afrondenBestellingen.test.ts tests/components/beheer/DrukkerModal.test.tsx
git commit -m "feat: laat het afronden-mechanisme naar Te factureren wijzen in plaats van Afgerond"
```

---

### Task 3: New "Te factureren" → "Betaald en afgerond" action + updated Terugzetten in BestellingModal

**Files:**
- Modify: `src/components/beheer/BestellingModal.tsx`
- Test: `tests/components/beheer/BestellingModal.test.tsx`
- Modify: `messages/nl.json` (new/changed keys — see Task 6 for the full translation task; this task only needs to add the exact keys it references so the app doesn't break with a missing-key error. Task 6 will do a final consistency pass across all files touched by this plan, so duplication here is fine.)

**Interfaces:**
- Consumes: `Bestelling['status']` from Task 1 (includes `'Te factureren'`/`'Betaald en afgerond'`).
- Produces: new `handleFactureren` function (no external callers — internal to `BestellingModal.tsx`). `handleTerugzetten`'s behavior changes from unconditional to status-dependent, but its exported signature (none — it's an internal handler, not a prop) is unaffected; `onAfronden` prop signature is unchanged.

- [ ] **Step 1: Add the new translation keys used by this task**

In `messages/nl.json`, inside the `beheer` namespace, near the existing `bestellingenTerugzetten`
key (currently on the line right after `"bestellingenAfronden": "Afronden",`), add:

```json
    "bestellingenFactureren": "Betaald en afgerond melden",
    "bestellingenFactureringTerugzetten": "Terugzetten naar te factureren",
```

Also update the existing `bestellingenHistorieAfgerond` value and add
`bestellingenHistorieTeFactureren` (referenced by Task 1's `HISTORIE_LABEL_KEY` change):

```json
    "bestellingenHistorieTeFactureren": "Te factureren",
    "bestellingenHistorieAfgerond": "Betaald en afgerond",
```

Keep valid JSON — check for a trailing comma on the preceding line and no trailing comma
on the last added key.

- [ ] **Step 2: Write the failing tests for `handleFactureren`**

Read `tests/components/beheer/BestellingModal.test.tsx` first to match its existing mocking
style (how `fetch` is mocked, how `bestelling` fixtures are built, how `logActiviteit` is
asserted). Then add tests following that same style, covering:

1. Rendering a bestelling with `status: 'Te factureren'` shows a button with
   `data-testid="bestelling-modal-factureren"` and text from `t('bestellingenFactureren')`.
2. Clicking it PATCHes `/api/bestelheaders/{id}` with `{ status: 'Betaald en afgerond' }`,
   calls `logActiviteit('bestelling_gefactureerd', ...)`, and calls `onUpdated` with the
   bestelling's status updated to `'Betaald en afgerond'`.
3. A bestelling with `status: 'Betaald en afgerond'` shows a
   `data-testid="bestelling-modal-terugzetten"` button that PATCHes
   `{ status: 'Te factureren' }` on click (not `'Verstuurd naar drukker'`).
4. A bestelling with `status: 'Te factureren'` also shows a SECOND terugzetten button,
   `data-testid="bestelling-modal-terugzetten-naar-verstuurd"`, that PATCHes
   `{ status: 'Verstuurd naar drukker' }` on click.

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx`
Expected: FAIL (missing testids / wrong PATCH target)

- [ ] **Step 4: Add `handleFactureren`**

Add this function right after `handleAfronden` (after line 155):

```ts
  async function handleFactureren() {
    if (!bestelling) return;
    try {
      const response = await fetch(`/api/bestelheaders/${bestelling.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Betaald en afgerond' }),
      });
      if (!response.ok) throw new Error('update failed');
      void logActiviteit('bestelling_gefactureerd', actorFromMedewerker(user), bestelling.bestelnr);
      onUpdated({ ...bestelling, status: 'Betaald en afgerond' });
    } catch {
      setError(t('bestellingenActionError'));
    }
  }
```

- [ ] **Step 5: Make `handleTerugzetten` status-dependent**

Replace the existing `handleTerugzetten`:

```ts
  async function handleTerugzetten() {
    if (!bestelling) return;
    try {
      const response = await fetch(`/api/bestelheaders/${bestelling.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Verstuurd naar drukker' }),
      });
      if (!response.ok) throw new Error('update failed');
      void logActiviteit('bestelling_afronding_teruggezet', actorFromMedewerker(user), bestelling.bestelnr);
      onUpdated({ ...bestelling, status: 'Verstuurd naar drukker' });
    } catch {
      setError(t('bestellingenActionError'));
    }
  }
```

with a version parameterized by target status, plus a second thin wrapper for the new step:

```ts
  async function terugzettenNaar(status: 'Verstuurd naar drukker' | 'Te factureren') {
    if (!bestelling) return;
    try {
      const response = await fetch(`/api/bestelheaders/${bestelling.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error('update failed');
      void logActiviteit('bestelling_afronding_teruggezet', actorFromMedewerker(user), bestelling.bestelnr);
      onUpdated({ ...bestelling, status });
    } catch {
      setError(t('bestellingenActionError'));
    }
  }
```

Delete the old `handleTerugzetten` function entirely — `terugzettenNaar` replaces it. Keep
the single `logActiviteit` event code `bestelling_afronding_teruggezet` for both directions
(it already means "an afronding-style step was undone"; no need to split it into two codes).

- [ ] **Step 6: Update the footer-actions ternary**

Replace:

```tsx
      footerActions={
        bestelling && bestelling.status === 'Te beoordelen' ? (
          <>
            <button
              type="button"
              onClick={handleGoedkeuren}
              disabled={heeftOngeprijsdeRegel}
              data-testid="bestelling-modal-goedkeuren"
              className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('bestellingenGoedkeuren')}
            </button>
            <button
              type="button"
              onClick={handleAfwijzen}
              data-testid="bestelling-modal-afwijzen"
              className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
            >
              {t('bestellingenAfwijzen')}
            </button>
          </>
        ) : bestelling && bestelling.status === 'Verstuurd naar drukker' ? (
          <button
            type="button"
            onClick={handleAfronden}
            disabled={isAfrondBezig}
            data-testid="bestelling-modal-afronden"
            className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
          >
            {t('bestellingenAfronden')}
          </button>
        ) : bestelling && bestelling.status === 'Afgerond' ? (
          <button
            type="button"
            onClick={handleTerugzetten}
            data-testid="bestelling-modal-terugzetten"
            className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
          >
            {t('bestellingenTerugzetten')}
          </button>
        ) : null
      }
```

with:

```tsx
      footerActions={
        bestelling && bestelling.status === 'Te beoordelen' ? (
          <>
            <button
              type="button"
              onClick={handleGoedkeuren}
              disabled={heeftOngeprijsdeRegel}
              data-testid="bestelling-modal-goedkeuren"
              className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('bestellingenGoedkeuren')}
            </button>
            <button
              type="button"
              onClick={handleAfwijzen}
              data-testid="bestelling-modal-afwijzen"
              className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
            >
              {t('bestellingenAfwijzen')}
            </button>
          </>
        ) : bestelling && bestelling.status === 'Verstuurd naar drukker' ? (
          <button
            type="button"
            onClick={handleAfronden}
            disabled={isAfrondBezig}
            data-testid="bestelling-modal-afronden"
            className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
          >
            {t('bestellingenAfronden')}
          </button>
        ) : bestelling && bestelling.status === 'Te factureren' ? (
          <>
            <button
              type="button"
              onClick={handleFactureren}
              data-testid="bestelling-modal-factureren"
              className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
            >
              {t('bestellingenFactureren')}
            </button>
            <button
              type="button"
              onClick={() => terugzettenNaar('Verstuurd naar drukker')}
              data-testid="bestelling-modal-terugzetten-naar-verstuurd"
              className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
            >
              {t('bestellingenTerugzetten')}
            </button>
          </>
        ) : bestelling && bestelling.status === 'Betaald en afgerond' ? (
          <button
            type="button"
            onClick={() => terugzettenNaar('Te factureren')}
            data-testid="bestelling-modal-terugzetten"
            className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
          >
            {t('bestellingenFactureringTerugzetten')}
          </button>
        ) : null
      }
```

Note `data-testid="bestelling-modal-terugzetten"` stays on the `'Betaald en afgerond'` branch
(matching the pre-existing testid used by any other test/consumer that looks for "the"
terugzetten button on the terminal status), while the new `'Te factureren'` branch's
terugzetten button gets the new testid `bestelling-modal-terugzetten-naar-verstuurd` so both
are independently targetable when both exist in the codebase (never simultaneously rendered,
but tests may check both branches in the same file).

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx`
Expected: PASS (including any pre-existing tests for goedkeuren/afwijzen/afronden — verify
you haven't broken them)

- [ ] **Step 8: Commit**

```bash
git add src/components/beheer/BestellingModal.tsx tests/components/beheer/BestellingModal.test.tsx messages/nl.json
git commit -m "feat: voeg Te factureren afronden-actie en aangepaste terugzet-stappen toe aan BestellingModal"
```

---

### Task 4: Quick-filters + bulk action for "Te factureren" in BestellingenSection

**Files:**
- Modify: `src/components/beheer/BestellingenSection.tsx`
- Test: `tests/components/beheer/BestellingenSection.test.tsx`
- Modify: `messages/nl.json` (new quick-filter keys)

**Interfaces:**
- Consumes: `Bestelling['status']` from Task 1. `afrondBestellingen` from Task 2 (already targets `'Te factureren'`, unchanged signature).
- Produces: nothing new consumed by later tasks — this is the last functional task.

- [ ] **Step 1: Add the new translation keys**

In `messages/nl.json`, next to `bestellingenQuickVerstuurdNaarDrukker`, add:

```json
    "bestellingenQuickTeFactureren": "Te factureren",
    "bestellingenQuickBetaaldEnAfgerond": "Betaald en afgerond",
```

Also add a label for the new bulk action button (used in Step 4 below), next to
`bestellingenVersturenNaarDrukker`:

```json
    "bestellingenFactureren": "Betaald en afgerond melden",
```

`bestellingenFactureren` was already added in Task 3, Step 1, for the single-order action
button in `BestellingModal.tsx` — Task 3's commit is already in this worktree's history by
the time Task 4 starts, so this key already exists. Reuse it for the bulk button (same Dutch
label fits both contexts); do **not** add it a second time. Check `messages/nl.json` first —
only add it here if it is actually missing.

- [ ] **Step 2: Write the failing tests**

Read `tests/components/beheer/BestellingenSection.test.tsx` first to match its existing
fixture/mocking conventions (how `bestellingen` prop arrays are built, how quick-filter
clicks are simulated, how bulk-select + bulk-action click is tested for the existing
`'Verstuurd naar drukker'` flow). Add tests covering:

1. The status quick-filter options list includes an option with
   `data-testid="te-factureren"` (label from `bestellingenQuickTeFactureren`) and one with
   `data-testid="betaald-en-afgerond"` (label from `bestellingenQuickBetaaldEnAfgerond`),
   alongside the existing `te-versturen`/`verstuurd`/`alle` options.
2. Selecting the `'Te factureren'` quick-filter and selecting one or more rows shows the
   selection bar with a bulk-action button (reuse or extend the existing
   `data-testid="bestellingen-afronden"` pattern — see Step 4 below for which testid to use)
   that, on click, PATCHes each selected bestelling to `'Betaald en afgerond'` (mirror how
   the existing test verifies the `'Verstuurd naar drukker'` → afronden bulk flow works, but
   assert the new target status and that it does NOT trigger the zendinggenoten dialog/fetch
   — the existing `startAfronden` codepath is not used here).
3. Selecting the `'Betaald en afgerond'` quick-filter does NOT show a selection bar / bulk
   action bar even when rows would otherwise be selectable (mirror how the test currently
   confirms no selection bar appears for `'Te beoordelen'` or `'Afgewezen'`, if such a test
   exists — otherwise write it fresh following the file's existing assertion style for
   "selectieActief is false").

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `npx vitest run tests/components/beheer/BestellingenSection.test.tsx`
Expected: FAIL

- [ ] **Step 4: Add the new quick-filter options**

Change the quick-filter `options` array from:

```tsx
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
```

to:

```tsx
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
                  {
                    value: 'Te factureren',
                    label: t('bestellingenQuickTeFactureren'),
                    testId: 'te-factureren',
                  },
                  {
                    value: 'Betaald en afgerond',
                    label: t('bestellingenQuickBetaaldEnAfgerond'),
                    testId: 'betaald-en-afgerond',
                  },
                  { value: '', label: t('bestellingenQuickAlle'), testId: 'alle' },
                ],
```

- [ ] **Step 5: Extend `selectieActief`**

Change (around line 276):

```ts
  const selectieActief =
    statusFilter === 'Te versturen naar drukker' || statusFilter === 'Verstuurd naar drukker';
```

to:

```ts
  const selectieActief =
    statusFilter === 'Te versturen naar drukker' ||
    statusFilter === 'Verstuurd naar drukker' ||
    statusFilter === 'Te factureren';
```

- [ ] **Step 6: Add the new bulk-action handler and extend the action-button ternary**

Add a new handler near `voerAfrondingUit`/`startAfronden` (place it after `startAfronden`,
before the `if (loadError)` block). This mirrors `handleGoedkeuren`'s simplicity from
`BestellingModal.tsx` — no mutex, no zendinggenoten lookup, since Task 3's design decision
(spec section C) says this step doesn't need either:

```ts
  const [facturerenBezig, setFacturerenBezig] = useState(false);

  async function voerFacturerenUit(teFactureren: Bestelling[]) {
    setFacturerenBezig(true);
    try {
      await Promise.all(
        teFactureren.map(async (bestelling) => {
          const response = await fetch(`/api/bestelheaders/${bestelling.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ status: 'Betaald en afgerond' }),
          });
          if (!response.ok) return;
          void logActiviteit('bestelling_gefactureerd', actorFromMedewerker(user), bestelling.bestelnr);
          onBestellingUpdated({ ...bestelling, status: 'Betaald en afgerond' });
        })
      );
      setSelectedIds(new Set());
    } finally {
      setFacturerenBezig(false);
    }
  }
```

Add the required import at the top of the file (next to the existing `actorFromMedewerker`
import): `import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';` — check
whether `logActiviteit` is already imported (currently the file imports only
`actorFromMedewerker` from that module per the existing import line
`import { actorFromMedewerker } from '@/lib/logActiviteit';`) and extend that import instead
of adding a duplicate one.

Then extend the action-button ternary in the selection bar (around line 317) from:

```tsx
          {statusFilter === 'Verstuurd naar drukker' ? (
            <button
              type="button"
              onClick={() =>
                void startAfronden(bestellingen.filter((b) => selectieVoorFilter.has(b.id)), true)
              }
              disabled={afrondBezig || afrondGenoten.length > 0}
              data-testid="bestellingen-afronden"
              className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
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

to:

```tsx
          {statusFilter === 'Verstuurd naar drukker' ? (
            <button
              type="button"
              onClick={() =>
                void startAfronden(bestellingen.filter((b) => selectieVoorFilter.has(b.id)), true)
              }
              disabled={afrondBezig || afrondGenoten.length > 0}
              data-testid="bestellingen-afronden"
              className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('bestellingenAfronden')}
            </button>
          ) : statusFilter === 'Te factureren' ? (
            <button
              type="button"
              onClick={() =>
                void voerFacturerenUit(bestellingen.filter((b) => selectieVoorFilter.has(b.id)))
              }
              disabled={facturerenBezig}
              data-testid="bestellingen-factureren"
              className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('bestellingenFactureren')}
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

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/BestellingenSection.test.tsx`
Expected: PASS (including pre-existing tests for the other two quick-filters/bulk actions)

- [ ] **Step 8: Commit**

```bash
git add src/components/beheer/BestellingenSection.tsx tests/components/beheer/BestellingenSection.test.tsx messages/nl.json
git commit -m "feat: voeg Te factureren/Betaald en afgerond quick-filters en bulkactie toe aan Bestellingen-scherm"
```

---

### Task 5: Sweep remaining literal status references and fix test fixtures across the branch

**Files:**
- Modify: any file `tsc`/`vitest` still flags (expected candidates per the design's research:
  `tests/lib/zendingGenoten.test.ts`, `tests/components/beheer/AfrondenBevestigingDialog.test.tsx`,
  `tests/components/beheer/BeheerShell.test.tsx`, `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx`,
  `tests/app/api/bestelheaders.test.ts`, `tests/regression/staging-scenarios.test.ts`)
- No new production code is expected in this task — it is a verification + fixture-cleanup pass over code already changed by Tasks 1-4.

**Interfaces:**
- Consumes: everything from Tasks 1-4. No new interfaces produced.

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: zero errors. If any remain, they are literal-status-string type mismatches in
files not touched by Tasks 1-4 — fix them by applying the same renames used in those tasks
(`'Afgerond'` → `'Betaald en afgerond'` where it represents the final state; check each site's
context before renaming, since `'Verstuurd naar drukker'` sites are almost always meant to
stay unchanged per the design).

- [ ] **Step 2: Full lint**

Run: `npm run lint`
Expected: zero errors/warnings introduced by this branch.

- [ ] **Step 3: Grep the test suite for remaining literal `'Afgerond'` fixtures**

Run: `grep -rn "'Afgerond'" tests/ src/` (or equivalent search) to catch any fixture or
assertion still using the bare old terminal-status string. For each hit:
- If it represents "the completed order" in a fixture (e.g., simulating an order that has
  already gone through the full flow) → rename to `'Betaald en afgerond'`.
- If it's a comment or unrelated string (e.g., part of an unrelated word) → leave alone.
- Do NOT touch any `'Verstuurd naar drukker'` occurrence in this step — those are correct
  as-is per the design (the zendinggenoten mechanism's filter condition is unchanged).

Pay particular attention to `tests/lib/zendingGenoten.test.ts` (heaviest concentration of
`'Verstuurd naar drukker'`, per prior research) — confirm its fixtures still pass with **no
changes to the status values it filters on**; only touch it if it also has fixtures
representing the post-completion state using the old `'Afgerond'` string.

- [ ] **Step 4: Update `tests/components/beheer/BeheerShell.test.tsx` if needed**

This file renders through the real data-loading layer (`BeheerShell.tsx`) rather than
supplying props directly — it's the regression test that historically caught a Critical bug
(zendingnummer dropped in the load-mapping) that no per-task test caught. Read it and confirm
any status fixtures it uses reflect the new/renamed statuses correctly, and that
`BeheerShell.tsx`'s load-mapping/`handleBestellingUpdated` (if it contains any status-specific
logic — check via grep for `'Afgerond'`/`Bestelling['status']` in `BeheerShell.tsx` itself)
doesn't need a corresponding production-code fix. If `BeheerShell.tsx` needs a fix, make it
here and note it clearly in the commit message.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS, zero failures. (Per project rules, this connects to the real shared staging
database — do not run this repeatedly in a tight loop; run it once after the sweep and once
more only if you made further fixes.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix: ruim resterende letterlijke Afgerond-verwijzingen op in tests en verifieer volledige branch"
```

(If Step 1-5 found nothing to change beyond what Tasks 1-4 already covered, skip this task's
commit entirely and report DONE with a note that the sweep found no additional changes
needed — do not create an empty commit.)

---

### Task 6: Translation consistency pass

**Files:**
- Modify: `messages/nl.json`

**Interfaces:**
- Consumes: every i18n key referenced by Tasks 1-4 (`bestellingenHistorieTeFactureren`,
  `bestellingenHistorieAfgerond`, `bestellingenQuickTeFactureren`,
  `bestellingenQuickBetaaldEnAfgerond`, `bestellingenFactureren`,
  `bestellingenFactureringTerugzetten`).

- [ ] **Step 1: Verify every key referenced by `t(...)` calls in the changed files exists**

Run this check (or equivalent): for each of `BestellingModal.tsx` and
`BestellingenSection.tsx`, grep for `t('bestellingen` and cross-reference every match against
`messages/nl.json`'s `beheer` namespace. Confirm none are missing (Tasks 3 and 4 should
already have added them all, since each added its own keys inline — this step is the final
double-check, not the first time these keys are added).

- [ ] **Step 2: Confirm `messages/nl.json` is still valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/nl.json', 'utf8')); console.log('valid')"`
Expected output: `valid`

- [ ] **Step 3: Confirm no `beheer` namespace keys were accidentally added to `en.json`/`de.json`/`fr.json`**

Run: `grep -l "bestellingenFactureren" messages/en.json messages/de.json messages/fr.json`
Expected: no output / command exits with no matches (these files don't have a `beheer`
namespace at all, per the Global Constraints — if any of Tasks 3/4 accidentally touched
them, revert that).

- [ ] **Step 4: Commit (only if this task made any changes)**

```bash
git add messages/nl.json
git commit -m "fix: vul ontbrekende vertaalsleutels aan voor Te factureren-status"
```

If no changes were needed, report DONE with a note that the consistency pass found nothing
to fix, and skip the commit.
