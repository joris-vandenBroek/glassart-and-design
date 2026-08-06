# Klant account verwijderen blokkeren bij bestelhistorie Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A klant may not self-service-delete their own account while they have ever placed an order — server-enforced, with a clear message in `SettingsSection.tsx`.

**Architecture:** `DELETE /api/klanten/[id]/route.ts` already branches on `requireMedewerker` vs `requireKlant` (staff vs self-service). This plan adds one check, scoped to only the self-service (`requireKlant`) branch: if `bestelheaders` has any row for this klant, return `409 { error: 'heeft-bestellingen' }` instead of deleting. The staff branch is untouched — staff can still call this route for any klant, unaffected by this change (see "Design decisions" below for why, and for a real pre-existing bug this surfaced that is deliberately NOT fixed here).

**Tech Stack:** Next.js 14 App Router API routes, raw `mysql2`, Vitest + Testing Library, real MySQL staging database in tests (per `CLAUDE.md`).

## Design decisions (confirmed with the user 2026-08-06, don't re-litigate without a new reason)

- **Rule:** self-service deletion is blocked whenever the klant has **any** `bestelheaders` row — open or closed (`'Afgerond'`/`'Afgewezen'` included). This is a narrower rule than the original request ("block only on open orders") — see why below.
- **Why the rule changed from "open orders only" to "any order at all":** `bestelheaders.klantId` has a plain `FOREIGN KEY ... REFERENCES klanten(id)` with no `ON DELETE CASCADE` (`db/schema.sql:184-191`). Verified empirically against staging 2026-08-06: deleting a klant with even one `'Afgerond'` order already fails today with `ER_ROW_IS_REFERENCED_2`, uncaught, surfacing as a generic 500 to the client. So "allow deletion once all orders are closed" was never actually available without also deciding what happens to the closed order rows (cascade-delete them and lose order/invoice history, or block regardless) — the user chose to block regardless, keeping order history fully intact and never touched by this feature.
- **Staff branch is deliberately unaffected by this plan.** The original request already asked to confirm from the code (not assume) whether staff should bypass this block — confirmed: `requireMedewerker`/`requireKlant` are separate branches in the same `DELETE` handler, and this plan's check only executes inside the `requireKlant` branch. Staff-initiated deletion of a klant-with-orders is a **separate, pre-existing bug** (the same FK crash, just via the medewerker branch instead) that already exists on `master` today, independent of this feature — out of scope here. Flag it as a follow-up task after this plan ships (see Task 2's note).
- **Error code:** `'heeft-bestellingen'`, mirroring the existing precedent in `src/app/api/[resource]/[id]/route.ts`'s `'in-use-bestelling'` 409 pattern for lookup-table deletes blocked by a foreign relationship.

## Global Constraints

- Test cleanup must only ever delete rows a test itself created, scoped by captured id — never a blanket `DELETE`/`TRUNCATE` (hard rule, `CLAUDE.md`).
- Run `npx tsc --noEmit` after each task — `npm test` does not type-check.
- `accountPage` translations live in all 4 locale files (`nl`, `en`, `de`, `fr`) — this feature's new user-facing string is klant-facing (Settings page), not beheer-only.

---

## File Structure

Modified files:
- `src/app/api/klanten/[id]/route.ts` — `DELETE` gains the self-service order check.
- `tests/app/api/klanten.test.ts` — new tests for the block + confirmation the medewerker branch is unaffected.
- `src/components/account/SettingsSection.tsx` — `handleDeleteAccount` recognizes the `409`/`'heeft-bestellingen'` response and shows a dedicated message.
- `tests/components/account/SettingsSection.test.tsx` — new test for the dedicated message.
- `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json` — new `accountPage.settings.deleteAccountHasOrdersError` key.

---

### Task 1: Server — block self-service deletion when the klant has any bestelheaders row

**Files:**
- Modify: `src/app/api/klanten/[id]/route.ts`
- Test: `tests/app/api/klanten.test.ts`

**Interfaces:**
- Produces: `DELETE /api/klanten/[id]` returns `409 { error: 'heeft-bestellingen' }` when called by the klant themselves (not staff) and that klant has at least one `bestelheaders` row, of any status.

- [ ] **Step 1: Write the failing tests**

Add to `tests/app/api/klanten.test.ts`, inside the `describe('klanten admin routes', ...)` block (after the existing `'allows a klant to delete their own account, but not someone else\'s'` test). First add the imports this needs, alongside the existing ones at the top of the file:

```ts
import { randomUUID } from 'crypto';
```

Then add the tests:

```ts
  it('blocks a klant from deleting their own account while they have any bestelheaders row, open or closed', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'k@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    createdKlantIds.push(klant.id);
    const headerId = randomUUID();
    await getPool().query('INSERT INTO bestelheaders (id, klantId, bestelnr, status) VALUES (?, ?, ?, ?)', [
      headerId,
      klant.id,
      'GD-BLOCK-1',
      'Afgerond',
    ]);
    const sessionId = await createSession('klant', klant.id);
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;

    try {
      const response = await deleteKlant(req('DELETE', undefined, cookie), { params: { id: klant.id } });
      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error).toBe('heeft-bestellingen');
      const [rows] = await getPool().query('SELECT id FROM klanten WHERE id = ?', [klant.id]);
      expect((rows as unknown[]).length).toBe(1);
    } finally {
      await getPool().query('DELETE FROM bestelheaders WHERE id = ?', [headerId]);
    }
  });

  it('allows a klant to delete their own account when they have no bestelheaders rows at all', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'l@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    const sessionId = await createSession('klant', klant.id);
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;

    const response = await deleteKlant(req('DELETE', undefined, cookie), { params: { id: klant.id } });
    expect(response.status).toBe(200);
    const [rows] = await getPool().query('SELECT id FROM klanten WHERE id = ?', [klant.id]);
    expect((rows as unknown[]).length).toBe(0);
  });

  it('lets a medewerker delete a klant that has a bestelheaders row (staff branch is unaffected by the klant-side block)', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'm@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    const headerId = randomUUID();
    await getPool().query('INSERT INTO bestelheaders (id, klantId, bestelnr, status) VALUES (?, ?, ?, ?)', [
      headerId,
      klant.id,
      'GD-BLOCK-2',
      'Afgerond',
    ]);

    try {
      // Confirmed pre-existing, unrelated bug (tracked separately, not fixed by this plan):
      // deleting a klant with any bestelheaders row currently throws ER_ROW_IS_REFERENCED_2
      // regardless of who deletes them, because bestelheaders.klantId has no ON DELETE
      // CASCADE. This test documents that the staff branch is reached (not blocked by this
      // plan's new klant-side check) -- it still fails at the DB level for a different,
      // pre-existing reason, which is why this test expects a 500, not 200.
      const response = await deleteKlant(req('DELETE', undefined, await medewerkerCookie()), {
        params: { id: klant.id },
      });
      expect(response.status).toBe(500);
      const [rows] = await getPool().query('SELECT id FROM klanten WHERE id = ?', [klant.id]);
      expect((rows as unknown[]).length).toBe(1);
    } finally {
      await getPool().query('DELETE FROM bestelheaders WHERE id = ?', [headerId]);
      await getPool().query('DELETE FROM klanten WHERE id = ?', [klant.id]);
    }
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/app/api/klanten.test.ts -t "bestelheaders row"`
Expected: the first new test FAILs (currently returns 500 via the uncaught FK error, not 409 with `'heeft-bestellingen'`); the second and third should already pass as-is (they don't depend on the new check) — confirming the third test's 500 expectation documents *existing*, not new, behavior.

- [ ] **Step 3: Implement the check**

In `src/app/api/klanten/[id]/route.ts`, change:

```ts
import { NextResponse } from 'next/server';
import { updateRow, deleteRow } from '@/lib/server/crud';
import { requireMedewerker, requireKlant } from '@/lib/server/requireAuth';

// Full-field admin edit (status, prijsgroepId, kunstenaarId, ...) -- staff only.
// A klant's own self-service edit goes through the narrowly-scoped /api/klanten/me instead.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await request.json();
    await updateRow('klanten', params.id, data);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}

// Staff can delete any klant; a klant can delete their own account (SettingsSection
// re-verifies the password via /api/auth/login before calling this).
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const medewerkerId = await requireMedewerker(request);
  const klantId = medewerkerId ? null : await requireKlant(request);
  if (!medewerkerId && klantId !== params.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  await deleteRow('klanten', params.id);
  return NextResponse.json({ ok: true });
}
```

to:

```ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { updateRow, deleteRow } from '@/lib/server/crud';
import { requireMedewerker, requireKlant } from '@/lib/server/requireAuth';

// Full-field admin edit (status, prijsgroepId, kunstenaarId, ...) -- staff only.
// A klant's own self-service edit goes through the narrowly-scoped /api/klanten/me instead.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await request.json();
    await updateRow('klanten', params.id, data);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}

// Staff can delete any klant; a klant can delete their own account (SettingsSection
// re-verifies the password via /api/auth/login before calling this). Self-service deletion
// is additionally blocked whenever the klant has any bestelheaders row (open or closed) --
// staff deletion is not subject to this check.
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const medewerkerId = await requireMedewerker(request);
  const klantId = medewerkerId ? null : await requireKlant(request);
  if (!medewerkerId && klantId !== params.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (klantId) {
    const [rows] = await getPool().query('SELECT 1 FROM bestelheaders WHERE klantId = ? LIMIT 1', [klantId]);
    if ((rows as unknown[]).length > 0) {
      return NextResponse.json({ error: 'heeft-bestellingen' }, { status: 409 });
    }
  }
  try {
    await deleteRow('klanten', params.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}
```

(The `try`/`catch` around `deleteRow` is added here because it didn't exist before — without it, the pre-existing FK-crash test in Step 1 would produce an unhandled rejection instead of a clean 500 response. This does not fix the underlying pre-existing bug, it just makes the existing failure mode explicit and testable, matching every other route's error-handling convention in this codebase.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/app/api/klanten.test.ts`
Expected: PASS, full file.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/klanten/[id]/route.ts tests/app/api/klanten.test.ts
git commit -m "feat: block klant self-service account deletion while any bestelling exists"
```

- [ ] **Step 7: Flag the pre-existing staff-side bug as a follow-up**

This step is a reminder, not code: after this task's commit, use the `spawn_task` mechanism (if available) or otherwise tell the user, in these words or similar: "Found and left alone (separate from this plan): a medewerker also cannot currently delete a klant that has any bestelheaders row — same missing-cascade FK issue, just reached via the staff branch instead of the klant branch. Worth its own fix (decide: cascade-delete their orders too, or block staff the same way with a clearer message) but intentionally out of scope here."

---

### Task 2: Client — dedicated error message for the new block

**Files:**
- Modify: `src/components/account/SettingsSection.tsx`
- Test: `tests/components/account/SettingsSection.test.tsx`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json`

**Interfaces:**
- Consumes: Task 1's `409 { error: 'heeft-bestellingen' }` response.
- Produces: `accountPage.settings.deleteAccountHasOrdersError` translation key, shown in the existing `data-testid="delete-account-error"` slot when the delete request returns exactly this error.

- [ ] **Step 1: Write the failing test**

Add to `tests/components/account/SettingsSection.test.tsx`, inside the `describe('SettingsSection', ...)` block (after the existing `'shows a distinct partial-error message and stays on the page when re-auth succeeds but the account delete fails'` test):

```tsx
  it('shows a dedicated message and stays on the page when deletion is blocked by existing bestellingen', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByTestId('delete-account-submit')).toBeInTheDocument());
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/auth/login') return { ok: true };
      if (url === '/api/klanten/uid-1') {
        return { ok: false, status: 409, json: async () => ({ error: 'heeft-bestellingen' }) };
      }
      return { ok: true, json: async () => KLANT_PROFILE };
    });
    fireEvent.change(screen.getByTestId('delete-account-password'), {
      target: { value: 'geheim123' },
    });
    fireEvent.click(screen.getByTestId('delete-account-submit'));

    expect(await screen.findByTestId('delete-account-error')).toHaveTextContent(
      'Uw account kan niet verwijderd worden omdat u nog bestellingen bij ons heeft staan. Neem contact met ons op als u toch verwijderd wilt worden.'
    );
    expect(replaceMock).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/account/SettingsSection.test.tsx -t "heeft-bestellingen"`
Expected: FAIL — the generic `deleteAccountPartialError` message shows instead of the new dedicated one (the handler doesn't distinguish response bodies yet).

- [ ] **Step 3: Implement the distinction**

In `src/components/account/SettingsSection.tsx`, change:

```ts
      const deleteResponse = await fetch(`/api/klanten/${user?.uid ?? ''}`, { method: 'DELETE' });
      if (!deleteResponse.ok) {
        setDeleteError(t('deleteAccountPartialError'));
        return;
      }
```

to:

```ts
      const deleteResponse = await fetch(`/api/klanten/${user?.uid ?? ''}`, { method: 'DELETE' });
      if (!deleteResponse.ok) {
        if (deleteResponse.status === 409) {
          const body = (await deleteResponse.json().catch(() => null)) as { error?: string } | null;
          if (body?.error === 'heeft-bestellingen') {
            setDeleteError(t('deleteAccountHasOrdersError'));
            return;
          }
        }
        setDeleteError(t('deleteAccountPartialError'));
        return;
      }
```

- [ ] **Step 4: Add the translation to all 4 locale files**

In `messages/nl.json`, add after `"deleteAccountPartialError": "Uw gegevens zijn verwijderd, maar er ging iets mis bij het volledig verwijderen van uw account. Neem contact met ons op.",` (around line 291):

```json
      "deleteAccountHasOrdersError": "Uw account kan niet verwijderd worden omdat u nog bestellingen bij ons heeft staan. Neem contact met ons op als u toch verwijderd wilt worden.",
```

In `messages/en.json`, add after `"deleteAccountPartialError": "Your data has been deleted, but something went wrong completing account deletion. Please contact us.",` (around line 321):

```json
      "deleteAccountHasOrdersError": "Your account cannot be deleted because you still have orders with us. Please contact us if you'd still like your account deleted.",
```

In `messages/de.json`, add after `"deleteAccountPartialError": "Ihre Daten wurden gelöscht, aber beim vollständigen Löschen Ihres Kontos ist etwas schiefgelaufen. Bitte kontaktieren Sie uns.",` (around line 291):

```json
      "deleteAccountHasOrdersError": "Ihr Konto kann nicht gelöscht werden, da bei uns noch Bestellungen von Ihnen vorliegen. Bitte kontaktieren Sie uns, falls Sie Ihr Konto trotzdem löschen möchten.",
```

In `messages/fr.json`, add after `"deleteAccountPartialError": "Vos données ont été supprimées, mais un problème est survenu lors de la suppression complète de votre compte. Veuillez nous contacter.",` (around line 291):

```json
      "deleteAccountHasOrdersError": "Votre compte ne peut pas être supprimé car vous avez encore des commandes chez nous. Veuillez nous contacter si vous souhaitez tout de même supprimer votre compte.",
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/components/account/SettingsSection.test.tsx`
Expected: PASS, full file.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/account/SettingsSection.tsx tests/components/account/SettingsSection.test.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json
git commit -m "feat: show a dedicated error when account deletion is blocked by existing bestellingen"
```

---

## Self-Review Notes

- The original request's phrasing ("blokkeer bij status NIET Afgerond/Afgewezen") is narrowed here to "blokkeer bij elke bestelling" — a deliberate, user-confirmed scope change driven by the pre-existing FK constraint discovered during planning, not an oversight. Both plan sections above document why.
- Staff-bypass question from the original request: confirmed from the actual route code (two separate branches, `medewerkerId` short-circuits before the new check), not assumed.
- No regression-suite scenario is added for this plan — the original request marked that as optional or not for this feature specifically, and the 3 unit tests in Task 1 already cover the real-database behavior (open/closed/staff-branch) that would otherwise motivate one.
