# Actief-vlag op materialen — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een materiaal kan op inactief gezet worden, waardoor het uit alle klantkeuzes verdwijnt zonder verwijderd te worden; blijft er één actief materiaal over, dan vervangt een tekstregel de materiaal-dropdown.

**Architecture:** Eén nieuwe kolom `materialen.actief`, één helper `isMateriaalActief()` waar alle filtering doorheen loopt, en een verhuizing van `materialen` van de generieke `[resource]`-route naar een eigen API-route waar twee serverregels leven: deactiveren blokkeren bij openstaande bestellingen, en bij activeren het materiaal in bulk koppelen aan alle kunstwerken die al materialen hebben. Filteren gebeurt uitsluitend op keuzemomenten in de UI, nooit bij het ophalen — historische bestelregels moeten hun materiaal blijven kunnen oplossen.

**Tech Stack:** Next.js 14 App Router, TypeScript, raw `mysql2`, Vitest + Testing Library, `next-intl`.

**Spec:** `docs/superpowers/specs/2026-08-17-materiaal-actief-vlag-design.md`

## Global Constraints

- Werk in een git worktree, niet direct op `master`.
- Tests draaien tegen de gedeelde **staging**-database. Elke test ruimt exact de rijen op die hij zelf aanmaakte, per gevangen id, via `veiligOpruimen()` uit `tests/helpers/veiligOpruimen.ts`. Nooit een `DELETE` zonder `WHERE`, nooit "de rij die ik net maakte" via lijstvolgorde oplossen.
- Fixture-namen en e-mails van tests krijgen een herkenbaar testvoorvoegsel (`AUTOTEST`/`autotest-`/`@example.com`).
- Beheer-UI-teksten alleen in `messages/nl.json`, niet in `en`/`de`/`fr`.
- Een nieuwe kolom vereist drie dingen: een migratiebestand, een aanpassing in `db/schema.sql`, én een entry in `src/lib/server/tableColumns.ts`. Ontbreekt de laatste, dan **gooit** `insertRow`/`updateRow`.
- `mysql2` levert `BOOLEAN` als `0`/`1`. Nooit `=== true` vergelijken; altijd via `isMateriaalActief()`.
- Migraties worden nooit door een deploy toegepast: `npm run db:migrate -- staging` is een aparte, handmatige stap.
- Commitberichten eindigen op `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

### Task 1: Kolom, type en helper

**Files:**
- Create: `db/migrations/2026-08-17-materiaal-actief.sql`
- Modify: `db/schema.sql` (tabel `materialen`, regel 95-104)
- Modify: `src/lib/server/tableColumns.ts:62-71`
- Modify: `src/components/beheer/materiaalTypes.ts:13-21`
- Test: `tests/lib/materiaalTypes.test.ts`

**Interfaces:**
- Consumes: niets.
- Produces: `isMateriaalActief(materiaal: Pick<Materiaal, 'actief'>): boolean` uit `@/components/beheer/materiaalTypes`, en `Materiaal.actief?: boolean`. Elke latere taak filtert hiermee.

- [ ] **Step 1: Schrijf de falende test**

Nieuw bestand `tests/lib/materiaalTypes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isMateriaalActief } from '@/components/beheer/materiaalTypes';

describe('isMateriaalActief', () => {
  it('telt een ontbrekende waarde als actief', () => {
    expect(isMateriaalActief({ actief: undefined })).toBe(true);
  });

  it('telt de 1 die mysql2 teruggeeft als actief', () => {
    expect(isMateriaalActief({ actief: 1 as unknown as boolean })).toBe(true);
  });

  it('telt de 0 die mysql2 teruggeeft als inactief', () => {
    expect(isMateriaalActief({ actief: 0 as unknown as boolean })).toBe(false);
  });

  it('telt false als inactief', () => {
    expect(isMateriaalActief({ actief: false })).toBe(false);
  });
});
```

- [ ] **Step 2: Draai de test en controleer dat hij faalt**

Run: `npx vitest run tests/lib/materiaalTypes.test.ts`
Expected: FAIL — `isMateriaalActief` bestaat nog niet (import-fout).

- [ ] **Step 3: Voeg het veld en de helper toe**

In `src/components/beheer/materiaalTypes.ts`, in de `Materiaal`-interface na `omschrijvingEn: string;`:

```ts
  actief?: boolean;
```

En onder de interface:

```ts
/**
 * `mysql2` geeft een BOOLEAN-kolom terug als 0/1, dus nooit `=== true` vergelijken.
 * Een ontbrekende waarde telt als actief: de kolom is NOT NULL DEFAULT TRUE, dus dat
 * kan alleen bij een testfixture van vóór deze vlag.
 */
export function isMateriaalActief(materiaal: Pick<Materiaal, 'actief'>): boolean {
  return materiaal.actief === undefined ? true : Boolean(materiaal.actief);
}
```

- [ ] **Step 4: Draai de test en controleer dat hij slaagt**

Run: `npx vitest run tests/lib/materiaalTypes.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Schrijf de migratie en werk het schema bij**

Nieuw bestand `db/migrations/2026-08-17-materiaal-actief.sql`:

```sql
-- Een materiaal kan uit het klantbeeld verdwijnen zonder verwijderd te worden.
-- DEFAULT TRUE, zodat bestaande materialen na de migratie exact hetzelfde gedrag houden
-- en de nog niet gedeployde code de kolom straks gewoon negeert.
ALTER TABLE materialen ADD COLUMN actief BOOLEAN NOT NULL DEFAULT TRUE;
```

In `db/schema.sql`, in `CREATE TABLE materialen`, direct na `omschrijvingEn VARCHAR(255),`:

```sql
  actief BOOLEAN NOT NULL DEFAULT TRUE,
```

In `src/lib/server/tableColumns.ts`, in de `materialen`-array na `'omschrijvingEn',`:

```ts
    'actief',
```

- [ ] **Step 6: Pas de migratie toe op staging en controleer**

Run: `npm run db:migrate -- staging`
Run: `npm run db:status -- staging`
Expected: `2026-08-17-materiaal-actief.sql` staat bij de toegepaste migraties, geen openstaande.

- [ ] **Step 7: Draai de volledige suite**

Run: `npm test`
Expected: PASS — niets gebruikt de kolom nog, dus er mag niets veranderen.

- [ ] **Step 8: Commit**

```bash
git add db/migrations/2026-08-17-materiaal-actief.sql db/schema.sql src/lib/server/tableColumns.ts src/components/beheer/materiaalTypes.ts tests/lib/materiaalTypes.test.ts
git commit -m "feat: actief-kolom op materialen met isMateriaalActief-helper"
```

---

### Task 2: Eigen API-route voor materialen

Verhuist `materialen` van de generieke `[resource]`-route naar eigen routebestanden, met identiek gedrag. De blokkeerregel komt pas in Task 3 — deze taak mag geen enkel bestaand gedrag veranderen.

**Files:**
- Create: `src/app/api/materialen/route.ts`
- Create: `src/app/api/materialen/[id]/route.ts`
- Modify: `src/lib/server/lookupResources.ts:14` (regel `materialen` weghalen)
- Modify: `src/app/api/[resource]/[id]/route.ts:8-11` (`materialen` uit `BESTELLING_REFERENCE_COLUMN`)
- Modify: `tests/app/api/lookup-resources.test.ts`
- Test: `tests/app/api/materialen.test.ts`

**Interfaces:**
- Consumes: `Materiaal.actief` uit Task 1.
- Produces: `GET`/`POST` uit `@/app/api/materialen/route` en `GET`/`PATCH`/`DELETE` uit `@/app/api/materialen/[id]/route`. `[id]`-handlers krijgen context `{ params: { id: string } }`. DELETE geeft 409 `{ error: 'in-use-bestelling' }` als het materiaal in een bestellijn voorkomt.

- [ ] **Step 1: Schrijf de falende test**

Nieuw bestand `tests/app/api/materialen.test.ts`:

```ts
import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { insertRow } from '@/lib/server/crud';
import { hashPassword } from '@/lib/server/password';
import { GET as listMaterialen, POST as createMateriaal } from '@/app/api/materialen/route';
import {
  GET as getMateriaal,
  PATCH as patchMateriaal,
  DELETE as deleteMateriaal,
} from '@/app/api/materialen/[id]/route';
import { GET as listResource } from '@/app/api/[resource]/route';
import { veiligOpruimen } from '../../helpers/veiligOpruimen';

const createdMateriaalIds: string[] = [];
const createdMateriaalsoortIds: string[] = [];
const createdHeaderIds: string[] = [];
const createdKlantEmails: string[] = [];
let klantTeller = 0;

afterEach(async () => {
  await veiligOpruimen('sessions (medewerker staff-mat)', () =>
    getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'staff-mat'")
  );
  if (createdHeaderIds.length > 0) {
    // Cascadeert naar bestellines; moet vóór de klanten, want bestelheaders.klantnr
    // heeft een niet-cascaderende FK naar klanten.
    await veiligOpruimen('bestelheaders (materialen)', () =>
      getPool().query('DELETE FROM bestelheaders WHERE id IN (?)', [createdHeaderIds])
    );
    createdHeaderIds.length = 0;
  }
  if (createdKlantEmails.length > 0) {
    await veiligOpruimen('klanten (materialen)', () =>
      getPool().query('DELETE FROM klanten WHERE email IN (?)', [createdKlantEmails])
    );
    createdKlantEmails.length = 0;
  }
  if (createdMateriaalIds.length > 0) {
    await veiligOpruimen('materialen', () =>
      getPool().query('DELETE FROM materialen WHERE id IN (?)', [createdMateriaalIds])
    );
    createdMateriaalIds.length = 0;
  }
  if (createdMateriaalsoortIds.length > 0) {
    await veiligOpruimen('materiaalsoorten (materialen)', () =>
      getPool().query('DELETE FROM materiaalsoorten WHERE id IN (?)', [createdMateriaalsoortIds])
    );
    createdMateriaalsoortIds.length = 0;
  }
});

function jsonRequest(method: string, body?: unknown, cookie?: string) {
  return new Request('http://localhost/api/materialen', {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function medewerkerCookie(): Promise<string> {
  const sessionId = await createSession('medewerker', 'staff-mat');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

async function maakMateriaalsoort(): Promise<string> {
  const soort = await insertRow<{ id: string }>('materiaalsoorten', {
    omschrijvingNl: 'AUTOTEST Materiaalsoort',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  } as never);
  createdMateriaalsoortIds.push(soort.id);
  return soort.id;
}

async function maakMateriaal(extra: Record<string, unknown> = {}): Promise<string> {
  const materiaal = await insertRow<{ id: string }>('materialen', {
    materiaalsoortId: await maakMateriaalsoort(),
    materiaaldikte: 4,
    omschrijvingNl: 'AUTOTEST Materiaal',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    ...extra,
  } as never);
  createdMateriaalIds.push(materiaal.id);
  return materiaal.id;
}

async function maakBestellijn(materiaalId: string, status: string): Promise<void> {
  const klantEmail = `autotest-materiaal-${++klantTeller}-${materiaalId}@example.com`;
  const klantnr = `AT-K-MAT-${klantTeller}`;
  await insertRow<{ id: string }>('klanten', {
    email: klantEmail,
    wachtwoordHash: await hashPassword('x'),
    status: 'Goedgekeurd',
    klantnr,
  } as never);
  createdKlantEmails.push(klantEmail);
  const header = await insertRow<{ id: string; bestelnr: string }>('bestelheaders', {
    klantnr,
    bestelnr: `AT-MAT-${klantTeller}`,
    status,
  } as never);
  createdHeaderIds.push(header.id);
  await insertRow<{ id: string }>('bestellines', {
    bestelnr: header.bestelnr,
    code: 'autotest-materiaal-route',
    materiaalId,
    quantity: 1,
  } as never);
}

describe('/api/materialen', () => {
  it('maakt, leest, wijzigt en verwijdert een materiaal', async () => {
    const cookie = await medewerkerCookie();
    const soortId = await maakMateriaalsoort();

    const createResponse = await createMateriaal(
      jsonRequest(
        'POST',
        {
          materiaalsoortId: soortId,
          materiaaldikte: 4,
          omschrijvingNl: 'AUTOTEST Glas',
          omschrijvingFr: '',
          omschrijvingDe: '',
          omschrijvingEn: '',
        },
        cookie
      )
    );
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    createdMateriaalIds.push(created.id);

    const getResponse = await getMateriaal(jsonRequest('GET'), { params: { id: created.id } });
    const gelezen = await getResponse.json();
    expect(gelezen.omschrijvingNl).toBe('AUTOTEST Glas');
    expect(Boolean(gelezen.actief)).toBe(true);

    const patchResponse = await patchMateriaal(jsonRequest('PATCH', { omschrijvingNl: 'AUTOTEST Glas 2' }, cookie), {
      params: { id: created.id },
    });
    expect(patchResponse.status).toBe(200);

    const listResponse = await listMaterialen(jsonRequest('GET'));
    const lijst = (await listResponse.json()) as Array<{ id: string; omschrijvingNl: string }>;
    expect(lijst.find((row) => row.id === created.id)?.omschrijvingNl).toBe('AUTOTEST Glas 2');

    const deleteResponse = await deleteMateriaal(jsonRequest('DELETE', undefined, cookie), {
      params: { id: created.id },
    });
    expect(deleteResponse.status).toBe(200);
  });

  it('weigert schrijven zonder medewerkersessie', async () => {
    const response = await createMateriaal(
      jsonRequest('POST', { materiaalsoortId: 'x', materiaaldikte: 4, omschrijvingNl: 'Hack' })
    );
    expect(response.status).toBe(401);
  });

  it('laat de lijst publiek lezen', async () => {
    const response = await listMaterialen(new Request('http://localhost/api/materialen', { method: 'GET' }));
    expect(response.status).toBe(200);
  });

  it('blokkeert verwijderen zodra het materiaal in een bestellijn voorkomt', async () => {
    const cookie = await medewerkerCookie();
    const materiaalId = await maakMateriaal();
    await maakBestellijn(materiaalId, 'Betaald en afgerond');

    const response = await deleteMateriaal(jsonRequest('DELETE', undefined, cookie), {
      params: { id: materiaalId },
    });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe('in-use-bestelling');
  });

  it('serveert materialen niet meer via de generieke resource-route', async () => {
    const response = await listResource(jsonRequest('GET'), { params: { resource: 'materialen' } });
    expect(response.status).toBe(404);
  });
});
```

- [ ] **Step 2: Draai de test en controleer dat hij faalt**

Run: `npx vitest run tests/app/api/materialen.test.ts`
Expected: FAIL — `@/app/api/materialen/route` bestaat niet.

- [ ] **Step 3: Schrijf de lijstroute**

Nieuw bestand `src/app/api/materialen/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { listRows, insertRow } from '@/lib/server/crud';
import { withApiErrorHandling, withMedewerker } from '@/lib/server/apiRoute';

// Materialen had een generieke CRUD-route via /api/[resource], maar heeft er twee eigen
// regels bij: deactiveren mag niet zolang er openstaande bestellingen zijn, en bij
// activeren kan het materiaal in bulk aan alle kunstwerken gekoppeld worden. Dat is
// precies waarvoor CLAUDE.md de eigen-route-conventie beschrijft (kunstwerken, klanten,
// kunstenaars en drukkers hebben die al).

// Publiek leesbaar, net als voorheen: de winkel haalt dit op zonder sessie. Het filteren
// op `actief` gebeurt bewust in de UI en niet hier -- een historische bestelregel moet
// zijn materiaal blijven kunnen oplossen.
export const GET = withApiErrorHandling('GET /api/materialen', async () => {
  const rows = await listRows('materialen');
  return NextResponse.json(rows);
});

export const POST = withMedewerker('POST /api/materialen', async (request: Request) => {
  const data = (await request.json()) as Record<string, unknown>;
  const created = await insertRow('materialen', data);
  return NextResponse.json(created, { status: 201 });
});
```

- [ ] **Step 4: Schrijf de detailroute**

Nieuw bestand `src/app/api/materialen/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getRow, updateRow, deleteRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { withApiErrorHandling, withMedewerker } from '@/lib/server/apiRoute';

type Context = { params: { id: string } };

export const GET = withApiErrorHandling<Context>(
  'GET /api/materialen/[id]',
  async (_request: Request, { params }: Context) => {
    const row = await getRow('materialen', params.id);
    if (!row) return NextResponse.json({ error: 'not-found' }, { status: 404 });
    return NextResponse.json(row);
  }
);

export const PATCH = withMedewerker<Context>(
  'PATCH /api/materialen/[id]',
  async (request: Request, { params }: Context) => {
    const data = (await request.json()) as Record<string, unknown>;
    await updateRow('materialen', params.id, data);
    return NextResponse.json({ ok: true });
  }
);

export const DELETE = withMedewerker<Context>(
  'DELETE /api/materialen/[id]',
  async (_request: Request, { params }: Context) => {
    // Stond eerder als BESTELLING_REFERENCE_COLUMN in de generieke [resource]-route:
    // een materiaal waarnaar een bestellijn verwijst mag nooit verdwijnen, want die
    // regel resolvet zijn label uit deze tabel.
    const [rows] = await getPool().query('SELECT 1 FROM bestellines WHERE materiaalId = ? LIMIT 1', [params.id]);
    if ((rows as unknown[]).length > 0) {
      return NextResponse.json({ error: 'in-use-bestelling' }, { status: 409 });
    }
    await deleteRow('materialen', params.id);
    return NextResponse.json({ ok: true });
  }
);
```

- [ ] **Step 5: Haal materialen uit de generieke route**

In `src/lib/server/lookupResources.ts`, verwijder de regel:

```ts
  materialen: { jsonColumns: [], writeAuthRequired: 'medewerker' },
```

In `src/app/api/[resource]/[id]/route.ts`, wordt `BESTELLING_REFERENCE_COLUMN`:

```ts
const BESTELLING_REFERENCE_COLUMN: Record<string, string> = {
  maten: 'maatId',
};
```

`LOOKUP_REFERENCE.materiaalsoorten` blijft ongewijzigd staan: die query draait tegen de tabel `materialen`, niet tegen de route.

- [ ] **Step 6: Haal de materialen-gevallen uit de lookup-resources-test**

In `tests/app/api/lookup-resources.test.ts` verwijzen de `LOOKUP_REFERENCE`-tests (`createdLookupGuardMateriaalIds`) naar materialen-rijen. Die blijven geldig — ze maken een materiaal aan via `insertRow` en testen de *materiaalsoorten*-guard, niet de materialen-route. Zoek daarnaast naar tests die `{ params: { resource: 'materialen' } }` aan de generieke handlers meegeven; die verwachten nu 404 en moeten verwijderd worden (het nieuwe testbestand dekt dat geval al).

Run: `grep -n "resource: 'materialen'" tests/app/api/lookup-resources.test.ts`

- [ ] **Step 7: Draai de tests**

Run: `npx vitest run tests/app/api/materialen.test.ts tests/app/api/lookup-resources.test.ts`
Expected: PASS.

- [ ] **Step 8: Draai de volledige suite en de typecheck**

Run: `npm test`
Run: `npx tsc --noEmit`
Expected: beide slagen. De client verandert niet — `useApiCollection('materialen')` roept dezelfde URL's aan.

- [ ] **Step 9: Commit**

```bash
git add src/app/api/materialen src/lib/server/lookupResources.ts "src/app/api/[resource]/[id]/route.ts" tests/app/api/materialen.test.ts tests/app/api/lookup-resources.test.ts
git commit -m "refactor: materialen naar een eigen API-route"
```

---

### Task 3: Deactiveren blokkeren bij openstaande bestellingen

**Files:**
- Create: `src/lib/bestelStatus.ts`
- Modify: `src/app/api/materialen/[id]/route.ts` (PATCH)
- Test: `tests/app/api/materialen.test.ts` (uitbreiden)

**Interfaces:**
- Consumes: de routes uit Task 2.
- Produces: `AFGEHANDELDE_BESTELSTATUSSEN: readonly string[]` uit `@/lib/bestelStatus`. PATCH met `actief: false` geeft 409 `{ error: 'in-use-open-bestelling' }` zolang er een niet-afgehandelde bestelling met dit materiaal is.

- [ ] **Step 1: Schrijf de falende tests**

Voeg toe aan `describe('/api/materialen', ...)` in `tests/app/api/materialen.test.ts`:

```ts
  it('blokkeert deactiveren zolang er een openstaande bestelling met dit materiaal is', async () => {
    const cookie = await medewerkerCookie();
    const materiaalId = await maakMateriaal();
    await maakBestellijn(materiaalId, 'Te versturen naar drukker');

    const response = await patchMateriaal(jsonRequest('PATCH', { actief: false }, cookie), {
      params: { id: materiaalId },
    });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe('in-use-open-bestelling');

    const gelezen = await (await getMateriaal(jsonRequest('GET'), { params: { id: materiaalId } })).json();
    expect(Boolean(gelezen.actief)).toBe(true);
  });

  it('staat deactiveren toe als de enige bestelling afgerond is', async () => {
    const cookie = await medewerkerCookie();
    const materiaalId = await maakMateriaal();
    await maakBestellijn(materiaalId, 'Betaald en afgerond');

    const response = await patchMateriaal(jsonRequest('PATCH', { actief: false }, cookie), {
      params: { id: materiaalId },
    });
    expect(response.status).toBe(200);

    const gelezen = await (await getMateriaal(jsonRequest('GET'), { params: { id: materiaalId } })).json();
    expect(Boolean(gelezen.actief)).toBe(false);
  });

  it('staat deactiveren toe als de enige bestelling afgewezen is', async () => {
    const cookie = await medewerkerCookie();
    const materiaalId = await maakMateriaal();
    await maakBestellijn(materiaalId, 'Afgewezen');

    const response = await patchMateriaal(jsonRequest('PATCH', { actief: false }, cookie), {
      params: { id: materiaalId },
    });
    expect(response.status).toBe(200);
  });

  it('blokkeert activeren nooit, ook niet met een openstaande bestelling', async () => {
    const cookie = await medewerkerCookie();
    const materiaalId = await maakMateriaal({ actief: false });
    await maakBestellijn(materiaalId, 'Te beoordelen');

    const response = await patchMateriaal(jsonRequest('PATCH', { actief: true }, cookie), {
      params: { id: materiaalId },
    });
    expect(response.status).toBe(200);
  });

  it('laat een naamwijziging ongemoeid bij een openstaande bestelling', async () => {
    const cookie = await medewerkerCookie();
    const materiaalId = await maakMateriaal();
    await maakBestellijn(materiaalId, 'Te beoordelen');

    const response = await patchMateriaal(jsonRequest('PATCH', { omschrijvingNl: 'AUTOTEST Hernoemd' }, cookie), {
      params: { id: materiaalId },
    });
    expect(response.status).toBe(200);
  });
```

- [ ] **Step 2: Draai de tests en controleer dat ze falen**

Run: `npx vitest run tests/app/api/materialen.test.ts`
Expected: FAIL — de blokkadetest krijgt 200 in plaats van 409.

- [ ] **Step 3: Schrijf de gedeelde statusconstante**

Nieuw bestand `src/lib/bestelStatus.ts`:

```ts
/**
 * De twee eindstatussen van een bestelling. Alles daarbuiten telt als "loopt nog" --
 * gebruikt door de blokkade op het deactiveren van een materiaal. De volledige
 * statuslijst staat als union-type in BestellingenSection.tsx.
 */
export const AFGEHANDELDE_BESTELSTATUSSEN = ['Betaald en afgerond', 'Afgewezen'] as const;
```

- [ ] **Step 4: Bouw de blokkade in PATCH**

In `src/app/api/materialen/[id]/route.ts`, importeer bovenaan:

```ts
import { AFGEHANDELDE_BESTELSTATUSSEN } from '@/lib/bestelStatus';
```

En vervang de PATCH-handler door:

```ts
export const PATCH = withMedewerker<Context>(
  'PATCH /api/materialen/[id]',
  async (request: Request, { params }: Context) => {
    const data = (await request.json()) as Record<string, unknown>;
    // Alleen bij het uitzetten van de vlag. Activeren en gewone veldwijzigingen
    // blijven ongehinderd -- de regel beschermt lopende bestellingen, niet de rij.
    if ('actief' in data && data.actief === false) {
      const [rows] = await getPool().query(
        `SELECT 1
         FROM bestellines bl
         JOIN bestelheaders bh ON bh.bestelnr = bl.bestelnr
         WHERE bl.materiaalId = ? AND bh.status NOT IN (?)
         LIMIT 1`,
        [params.id, AFGEHANDELDE_BESTELSTATUSSEN]
      );
      if ((rows as unknown[]).length > 0) {
        return NextResponse.json({ error: 'in-use-open-bestelling' }, { status: 409 });
      }
    }
    await updateRow('materialen', params.id, data);
    return NextResponse.json({ ok: true });
  }
);
```

Let op: `NOT IN (?)` met een array als parameter laat `mysql2` expanderen naar `NOT IN ('Betaald en afgerond', 'Afgewezen')` — dezelfde vorm als de bestaande `IN (?)`-queries in `kunstwerkRelaties.ts`.

- [ ] **Step 5: Draai de tests en controleer dat ze slagen**

Run: `npx vitest run tests/app/api/materialen.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/bestelStatus.ts "src/app/api/materialen/[id]/route.ts" tests/app/api/materialen.test.ts
git commit -m "feat: blokkeer deactiveren van een materiaal bij openstaande bestellingen"
```

---

### Task 4: Bulk-koppelen aan alle kunstwerken

**Files:**
- Create: `src/app/api/materialen/[id]/koppel-kunstwerken/route.ts`
- Test: `tests/app/api/materialen-koppel-kunstwerken.test.ts`

**Interfaces:**
- Consumes: de routes uit Task 2.
- Produces: `POST` uit `@/app/api/materialen/[id]/koppel-kunstwerken/route`, context `{ params: { id: string } }`, antwoord `{ gekoppeld: number }`.

- [ ] **Step 1: Schrijf de falende test**

Nieuw bestand `tests/app/api/materialen-koppel-kunstwerken.test.ts`:

```ts
import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { insertRow } from '@/lib/server/crud';
import { POST as koppelKunstwerken } from '@/app/api/materialen/[id]/koppel-kunstwerken/route';
import { veiligOpruimen } from '../../helpers/veiligOpruimen';

const createdMateriaalIds: string[] = [];
const createdMateriaalsoortIds: string[] = [];
const createdKunstwerkIds: string[] = [];
let teller = 0;

afterEach(async () => {
  await veiligOpruimen('sessions (medewerker staff-koppel)', () =>
    getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'staff-koppel'")
  );
  if (createdKunstwerkIds.length > 0) {
    // Cascadeert naar kunstwerkMaterialen (ON DELETE CASCADE).
    await veiligOpruimen('kunstwerken (koppel)', () =>
      getPool().query('DELETE FROM kunstwerken WHERE id IN (?)', [createdKunstwerkIds])
    );
    createdKunstwerkIds.length = 0;
  }
  if (createdMateriaalIds.length > 0) {
    await veiligOpruimen('materialen (koppel)', () =>
      getPool().query('DELETE FROM materialen WHERE id IN (?)', [createdMateriaalIds])
    );
    createdMateriaalIds.length = 0;
  }
  if (createdMateriaalsoortIds.length > 0) {
    await veiligOpruimen('materiaalsoorten (koppel)', () =>
      getPool().query('DELETE FROM materiaalsoorten WHERE id IN (?)', [createdMateriaalsoortIds])
    );
    createdMateriaalsoortIds.length = 0;
  }
});

async function medewerkerCookie(): Promise<string> {
  const sessionId = await createSession('medewerker', 'staff-koppel');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

function postRequest(cookie?: string) {
  return new Request('http://localhost/api/materialen/x/koppel-kunstwerken', {
    method: 'POST',
    headers: cookie ? { cookie } : {},
  });
}

async function maakMateriaal(): Promise<string> {
  const soort = await insertRow<{ id: string }>('materiaalsoorten', {
    omschrijvingNl: 'AUTOTEST Soort koppel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  } as never);
  createdMateriaalsoortIds.push(soort.id);
  const materiaal = await insertRow<{ id: string }>('materialen', {
    materiaalsoortId: soort.id,
    materiaaldikte: ++teller,
    omschrijvingNl: 'AUTOTEST Materiaal koppel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  } as never);
  createdMateriaalIds.push(materiaal.id);
  return materiaal.id;
}

async function maakKunstwerk(materiaalIds: string[]): Promise<string> {
  const kunstwerk = await insertRow<{ id: string }>('kunstwerken', {
    code: `AUTOTEST-KOPPEL-${++teller}`,
    foto: '',
    omschrijvingNl: 'AUTOTEST Kunstwerk',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  } as never);
  createdKunstwerkIds.push(kunstwerk.id);
  for (const [volgorde, materiaalId] of materiaalIds.entries()) {
    await getPool().query(
      'INSERT INTO kunstwerkMaterialen (kunstwerkId, materiaalId, volgorde) VALUES (?, ?, ?)',
      [kunstwerk.id, materiaalId, volgorde]
    );
  }
  return kunstwerk.id;
}

async function gekoppeldeMaterialen(kunstwerkId: string): Promise<string[]> {
  const [rows] = await getPool().query(
    'SELECT materiaalId FROM kunstwerkMaterialen WHERE kunstwerkId = ? ORDER BY volgorde',
    [kunstwerkId]
  );
  return (rows as Array<{ materiaalId: string }>).map((row) => row.materiaalId);
}

describe('POST /api/materialen/[id]/koppel-kunstwerken', () => {
  it('koppelt het materiaal aan kunstwerken die al materialen hebben', async () => {
    const cookie = await medewerkerCookie();
    const bestaand = await maakMateriaal();
    const nieuw = await maakMateriaal();
    const kunstwerkId = await maakKunstwerk([bestaand]);

    const response = await koppelKunstwerken(postRequest(cookie), { params: { id: nieuw } });
    expect(response.status).toBe(200);

    expect(await gekoppeldeMaterialen(kunstwerkId)).toEqual([bestaand, nieuw]);
  });

  it('slaat materiaalloze kunstwerken over', async () => {
    const cookie = await medewerkerCookie();
    const nieuw = await maakMateriaal();
    const materiaalloosId = await maakKunstwerk([]);

    await koppelKunstwerken(postRequest(cookie), { params: { id: nieuw } });

    expect(await gekoppeldeMaterialen(materiaalloosId)).toEqual([]);
  });

  it('is herhaalbaar en telt alleen nieuwe koppelingen', async () => {
    const cookie = await medewerkerCookie();
    const bestaand = await maakMateriaal();
    const nieuw = await maakMateriaal();
    const kunstwerkId = await maakKunstwerk([bestaand]);

    const eerste = await koppelKunstwerken(postRequest(cookie), { params: { id: nieuw } });
    expect((await eerste.json()).gekoppeld).toBeGreaterThanOrEqual(1);

    const tweede = await koppelKunstwerken(postRequest(cookie), { params: { id: nieuw } });
    expect((await tweede.json()).gekoppeld).toBe(0);

    expect(await gekoppeldeMaterialen(kunstwerkId)).toEqual([bestaand, nieuw]);
  });

  it('weigert zonder medewerkersessie', async () => {
    const response = await koppelKunstwerken(postRequest(), { params: { id: 'x' } });
    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 2: Draai de test en controleer dat hij faalt**

Run: `npx vitest run tests/app/api/materialen-koppel-kunstwerken.test.ts`
Expected: FAIL — de route bestaat niet.

- [ ] **Step 3: Schrijf de route**

Nieuw bestand `src/app/api/materialen/[id]/koppel-kunstwerken/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { withMedewerker } from '@/lib/server/apiRoute';

type Context = { params: { id: string } };

/**
 * Koppelt dit materiaal aan elk kunstwerk dat al minstens één materiaal heeft.
 *
 * Kunstwerken met nul materialen worden bewust overgeslagen: die zijn materiaalloos
 * (Akoestische stof, zie MATERIAALLOOS_LABEL) en rekenen hun prijs via
 * kunstwerken.prijsPerM2. Een materiaal erbij zou stilzwijgend zowel hun weergave
 * als hun prijspad veranderen.
 */
export const POST = withMedewerker<Context>(
  'POST /api/materialen/[id]/koppel-kunstwerken',
  async (_request: Request, { params }: Context) => {
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      // De JOIN filtert materiaalloze kunstwerken er meteen uit; heeftDitMateriaal
      // markeert wat al gekoppeld is, zodat de actie herhaalbaar blijft.
      const [rows] = await connection.query(
        `SELECT km.kunstwerkId AS kunstwerkId,
                MAX(km.volgorde) AS maxVolgorde,
                MAX(km.materiaalId = ?) AS heeftDitMateriaal
         FROM kunstwerkMaterialen km
         GROUP BY km.kunstwerkId`,
        [params.id]
      );
      const teKoppelen = (rows as Array<{ kunstwerkId: string; maxVolgorde: number; heeftDitMateriaal: number }>)
        .filter((row) => !row.heeftDitMateriaal)
        .map((row) => [row.kunstwerkId, params.id, Number(row.maxVolgorde) + 1]);

      if (teKoppelen.length > 0) {
        await connection.query(
          'INSERT INTO kunstwerkMaterialen (kunstwerkId, materiaalId, volgorde) VALUES ?',
          [teKoppelen]
        );
      }
      await connection.commit();
      return NextResponse.json({ gekoppeld: teKoppelen.length });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
);
```

- [ ] **Step 4: Draai de test en controleer dat hij slaagt**

Run: `npx vitest run tests/app/api/materialen-koppel-kunstwerken.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/materialen/[id]/koppel-kunstwerken" tests/app/api/materialen-koppel-kunstwerken.test.ts
git commit -m "feat: endpoint om een materiaal aan alle kunstwerken te koppelen"
```

---

### Task 5: MaterialenSection — kolom, checkbox, blokkademelding en bevestigingsdialoog

**Files:**
- Modify: `src/components/beheer/MaterialenSection.tsx`
- Modify: `src/components/beheer/BeheerShell.tsx:358-366`
- Modify: `messages/nl.json` (beheer-blok)
- Test: `tests/components/beheer/MaterialenSection.test.tsx`

**Interfaces:**
- Consumes: `isMateriaalActief` (Task 1), foutcode `in-use-open-bestelling` (Task 3), `POST /api/materialen/[id]/koppel-kunstwerken` (Task 4).
- Produces: `MaterialenSectionProps` krijgt er twee props bij: `actionErrorCode: string | null` en `onKunstwerkenChanged: () => void`. Testids: `materiaal-modal-actief`, `materialen-activeren-dialog`, `materialen-activeren-alle`, `materialen-activeren-alleen`.

- [ ] **Step 1: Voeg de vertaalsleutels toe**

In `messages/nl.json`, in het `beheer`-blok, naast de bestaande `materialen*`-sleutels:

```json
    "materialenColActief": "Actief",
    "materialenLabelActief": "Actief",
    "materialenDeactiverenGeblokkeerd": "Dit materiaal kan niet op inactief gezet worden zolang er openstaande bestellingen met dit materiaal zijn.",
    "materialenActiverenTitel": "Materiaal activeren",
    "materialenActiverenVraag": "Moet dit materiaal actief gemaakt worden voor alle kunstwerken?",
    "materialenActiverenAlleKunstwerken": "Ja, bij alle kunstwerken",
    "materialenActiverenAlleenVlag": "Nee, alleen activeren",
    "materiaalInactiefSuffix": "(inactief)",
```

- [ ] **Step 2: Schrijf de falende tests**

Voeg toe aan `tests/components/beheer/MaterialenSection.test.tsx`. Gebruik het rendering-patroon dat al bovenaan dat bestand staat (provider + props); vul de bestaande props aan met `actionErrorCode={null}` en `onKunstwerkenChanged={() => {}}` tenzij de test anders vereist.

```tsx
  it('toont de actief-kolom', () => {
    renderSection({
      materialen: [
        { ...MATERIAAL, id: 'mat-a', omschrijvingNl: 'Glas', actief: true },
        { ...MATERIAAL, id: 'mat-b', omschrijvingNl: 'Acryl', actief: false },
      ],
    });
    expect(screen.getByText('Glas').closest('tr')).toHaveTextContent('Ja');
    expect(screen.getByText('Acryl').closest('tr')).toHaveTextContent('Nee');
  });

  it('toont de blokkademelding bij foutcode in-use-open-bestelling', async () => {
    const onUpdate = vi.fn().mockResolvedValue(false);
    renderSection({
      materialen: [{ ...MATERIAAL, id: 'mat-a', omschrijvingNl: 'Glas', actief: true }],
      onUpdate,
      actionErrorCode: 'in-use-open-bestelling',
    });
    fireEvent.click(screen.getByText('Glas'));
    fireEvent.click(screen.getByTestId('materiaal-modal-actief'));
    fireEvent.click(screen.getByTestId('materiaal-modal-opslaan'));
    expect(
      await screen.findByText(
        'Dit materiaal kan niet op inactief gezet worden zolang er openstaande bestellingen met dit materiaal zijn.'
      )
    ).toBeInTheDocument();
  });

  it('vraagt bij activeren of alle kunstwerken gekoppeld moeten worden', async () => {
    const onUpdate = vi.fn().mockResolvedValue(true);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ gekoppeld: 3 }) });
    vi.stubGlobal('fetch', fetchMock);
    renderSection({
      materialen: [{ ...MATERIAAL, id: 'mat-a', omschrijvingNl: 'Glas', actief: false }],
      onUpdate,
    });
    fireEvent.click(screen.getByText('Glas'));
    fireEvent.click(screen.getByTestId('materiaal-modal-actief'));
    fireEvent.click(screen.getByTestId('materiaal-modal-opslaan'));

    expect(await screen.findByTestId('materialen-activeren-dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('materialen-activeren-alle'));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/materialen/mat-a/koppel-kunstwerken', { method: 'POST' })
    );
    vi.unstubAllGlobals();
  });

  it('koppelt niets als de beheerder "alleen activeren" kiest', async () => {
    const onUpdate = vi.fn().mockResolvedValue(true);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderSection({
      materialen: [{ ...MATERIAAL, id: 'mat-a', omschrijvingNl: 'Glas', actief: false }],
      onUpdate,
    });
    fireEvent.click(screen.getByText('Glas'));
    fireEvent.click(screen.getByTestId('materiaal-modal-actief'));
    fireEvent.click(screen.getByTestId('materiaal-modal-opslaan'));

    fireEvent.click(await screen.findByTestId('materialen-activeren-alleen'));
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('vraagt de koppeling ook bij een nieuw actief materiaal', async () => {
    // onAdd geeft geen id terug; de dialoog verschijnt pas als het materiaal in de
    // ververste lijst opduikt. Die verversing bootsen we na met een rerender.
    const onAdd = vi.fn().mockResolvedValue(true);
    const { rerender } = renderSection({ materialen: [], onAdd });
    fireEvent.click(screen.getByTestId('materialen-add'));
    fireEvent.change(screen.getByTestId('materiaal-modal-dikte'), { target: { value: '6' } });
    fireEvent.change(screen.getByTestId('materiaal-modal-omschrijving'), { target: { value: 'Nieuw glas' } });
    fireEvent.click(screen.getByTestId('materiaal-modal-opslaan'));
    await waitFor(() => expect(onAdd).toHaveBeenCalled());

    rerenderSection(rerender, {
      materialen: [{ ...MATERIAAL, id: 'mat-nieuw', omschrijvingNl: 'Nieuw glas', materiaaldikte: 6, actief: true }],
      onAdd,
    });
    expect(await screen.findByTestId('materialen-activeren-dialog')).toBeInTheDocument();
  });

  it('vraagt niets bij het deactiveren van een materiaal', async () => {
    const onUpdate = vi.fn().mockResolvedValue(true);
    renderSection({
      materialen: [{ ...MATERIAAL, id: 'mat-a', omschrijvingNl: 'Glas', actief: true }],
      onUpdate,
    });
    fireEvent.click(screen.getByText('Glas'));
    fireEvent.click(screen.getByTestId('materiaal-modal-actief'));
    fireEvent.click(screen.getByTestId('materiaal-modal-opslaan'));
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(screen.queryByTestId('materialen-activeren-dialog')).not.toBeInTheDocument();
  });
```

Voeg een kleine `rerenderSection(rerender, props)`-helper toe naast de bestaande `renderSection`
in dat bestand, die dezelfde providers opnieuw rendert met nieuwe props — die heeft de
nieuw-materiaal-test nodig om de verversing van de lijst na te bootsen.

- [ ] **Step 3: Draai de tests en controleer dat ze falen**

Run: `npx vitest run tests/components/beheer/MaterialenSection.test.tsx`
Expected: FAIL — `materiaal-modal-actief` bestaat niet.

- [ ] **Step 4: Bouw de kolom en de checkbox**

In `src/components/beheer/MaterialenSection.tsx`:

Props uitbreiden:

```tsx
interface MaterialenSectionProps {
  materialen: Materiaal[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  kunstwerken: Kunstwerk[] | null;
  loadError: string | null;
  // De foutcode uit useApiCollection's lastMutationErrorCode, zodat een geblokkeerde
  // deactivering een eigen melding krijgt in plaats van de generieke actiefout.
  actionErrorCode: string | null;
  onAdd: (data: Omit<Materiaal, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Materiaal, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
  // Na het bulk-koppelen kloppen de materiaalIds van elk kunstwerk niet meer.
  onKunstwerkenChanged: () => void;
}
```

State erbij, naast de bestaande velden:

```tsx
  const [actief, setActief] = useState(true);
  const [activerenVoorId, setActiverenVoorId] = useState<string | null>(null);
  // Een net toegevoegd materiaal heeft nog geen id in dit component: onAdd geeft alleen
  // slagen/falen terug. We onthouden waarop we het straks herkennen en pakken het id op
  // zodra useApiCollection de lijst heeft ververst.
  const [nieuwActiefMateriaal, setNieuwActiefMateriaal] = useState<{
    materiaalsoortId: string;
    materiaaldikte: number;
    omschrijvingNl: string;
  } | null>(null);
```

En, direct onder de bestaande `useMemo` (dus vóór alle vroege returns, anders draait de hook niet
op elke render):

```tsx
  useEffect(() => {
    if (!nieuwActiefMateriaal || !materialen) return;
    const gevonden = materialen.find(
      (materiaal) =>
        materiaal.omschrijvingNl === nieuwActiefMateriaal.omschrijvingNl &&
        materiaal.materiaalsoortId === nieuwActiefMateriaal.materiaalsoortId &&
        Number(materiaal.materiaaldikte) === nieuwActiefMateriaal.materiaaldikte
    );
    if (gevonden) {
      setActiverenVoorId(gevonden.id);
      setNieuwActiefMateriaal(null);
    }
  }, [materialen, nieuwActiefMateriaal]);
```

Voeg `useEffect` toe aan de bestaande React-import bovenaan het bestand.

`openAdd()` krijgt `setActief(true);`, `openEdit()` krijgt `setActief(isMateriaalActief(materiaal));` (importeer `isMateriaalActief` uit `./materiaalTypes`).

Kolom erbij:

```tsx
    { key: 'actief', label: t('materialenColActief'), render: (row) => (isMateriaalActief(row) ? 'Ja' : 'Nee') },
```

Checkbox in de modal, na het laatste omschrijvingsveld:

```tsx
          <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/60">
            <input
              type="checkbox"
              checked={actief}
              onChange={(event) => setActief(event.target.checked)}
              data-testid="materiaal-modal-actief"
            />
            {t('materialenLabelActief')}
          </label>
```

- [ ] **Step 5: Bouw de opslaglogica en de dialoog**

`handleSave()` wordt:

```tsx
  async function handleSave() {
    if (!modalState) return;
    // Een nieuw materiaal telt als "was uit": ook daar is de vraag zinnig, want het is
    // nog aan geen enkel kunstwerk gekoppeld.
    const wasActief = modalState.mode === 'edit' ? isMateriaalActief(modalState.materiaal) : false;
    const data = {
      materiaalsoortId,
      materiaaldikte: Number(materiaaldikte),
      omschrijvingNl,
      omschrijvingFr,
      omschrijvingDe,
      omschrijvingEn,
      actief,
    };
    const geslaagd =
      modalState.mode === 'add' ? await onAdd(data) : await onUpdate(modalState.materiaal.id, data);
    if (!geslaagd) {
      setActionError(
        actionErrorCode === 'in-use-open-bestelling'
          ? t('materialenDeactiverenGeblokkeerd')
          : t('materialenActionError')
      );
      return;
    }
    void logActiviteit(
      modalState.mode === 'add' ? 'materiaal_toegevoegd' : 'materiaal_gewijzigd',
      omschrijvingNl
    );
    const wordtGeactiveerd = actief && !wasActief;
    const bewerktId = modalState.mode === 'edit' ? modalState.materiaal.id : null;
    closeModal();
    if (!wordtGeactiveerd) return;
    if (bewerktId) {
      setActiverenVoorId(bewerktId);
    } else {
      // Het id volgt zodra de lijst ververst is; zie het useEffect hierboven.
      setNieuwActiefMateriaal({
        materiaalsoortId,
        materiaaldikte: Number(materiaaldikte),
        omschrijvingNl,
      });
    }
  }
```

De dialoog, direct na de bestaande `<Modal>` in de return:

```tsx
      <Modal
        isOpen={activerenVoorId !== null}
        onClose={() => setActiverenVoorId(null)}
        closeLabel={t('modalClose')}
        title={t('materialenActiverenTitel')}
        footerActions={
          <>
            <button
              type="button"
              onClick={koppelAlleKunstwerken}
              data-testid="materialen-activeren-alle"
              className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
            >
              {t('materialenActiverenAlleKunstwerken')}
            </button>
            <button
              type="button"
              onClick={() => setActiverenVoorId(null)}
              data-testid="materialen-activeren-alleen"
              className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
            >
              {t('materialenActiverenAlleenVlag')}
            </button>
          </>
        }
      >
        <p data-testid="materialen-activeren-dialog" className="text-sm text-white/80">
          {t('materialenActiverenVraag')}
        </p>
      </Modal>
```

En de actie:

```tsx
  async function koppelAlleKunstwerken() {
    if (!activerenVoorId) return;
    const response = await fetch(`/api/materialen/${activerenVoorId}/koppel-kunstwerken`, { method: 'POST' });
    setActiverenVoorId(null);
    if (response.ok) {
      onKunstwerkenChanged();
    } else {
      setActionError(t('materialenActionError'));
    }
  }
```

- [ ] **Step 6: Sluit de props aan in BeheerShell**

In `src/components/beheer/BeheerShell.tsx`, bij `<MaterialenSection ... />`:

```tsx
              actionErrorCode={materialen.lastMutationErrorCode}
              onKunstwerkenChanged={() => void kunstwerken.refetch()}
```

- [ ] **Step 7: Draai de tests**

Run: `npx vitest run tests/components/beheer/MaterialenSection.test.tsx tests/components/beheer/BeheerShell.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/beheer/MaterialenSection.tsx src/components/beheer/BeheerShell.tsx messages/nl.json tests/components/beheer/MaterialenSection.test.tsx
git commit -m "feat: actief-veld in het materialenscherm met koppelvraag bij activeren"
```

---

### Task 6: ProductModal — filteren en tekstweergave bij één materiaal

**Files:**
- Modify: `src/components/ProductModal.tsx:95-115` (default-keuze), `:143-145` (filter), `:395-418` (weergave)
- Test: `tests/components/ProductModal.test.tsx`

**Interfaces:**
- Consumes: `isMateriaalActief` (Task 1).
- Produces: testid `product-modal-materiaal-tekst` voor de tekstweergave. `product-modal-materiaal` (de `<select>`) bestaat alleen nog bij twee of meer actieve materialen; `product-modal-materiaal-omschrijving` blijft in beide gevallen bestaan.

- [ ] **Step 1: Schrijf de falende tests**

Voeg toe aan `tests/components/ProductModal.test.tsx`, met het rendering-patroon dat daar al staat:

```tsx
  it('toont een inactief materiaal niet in de keuzelijst', () => {
    renderModal({
      kunstwerk: { ...KUNSTWERK, materiaalIds: ['mat-1', 'mat-2'] },
      materialen: [
        { ...MATERIAAL_1, actief: true },
        { ...MATERIAAL_2, actief: false },
      ],
    });
    const options = screen.getByTestId('product-modal-materiaal').querySelectorAll('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveValue('mat-1');
  });

  it('vervangt de keuzelijst door tekst als er nog één actief materiaal is', () => {
    renderModal({
      kunstwerk: { ...KUNSTWERK, materiaalIds: ['mat-1', 'mat-2'] },
      materialen: [
        { ...MATERIAAL_1, actief: true },
        { ...MATERIAAL_2, actief: false },
      ],
    });
    expect(screen.queryByTestId('product-modal-materiaal')).not.toBeInTheDocument();
    expect(screen.getByTestId('product-modal-materiaal-tekst')).toHaveTextContent('4mm Veiligheidsglas');
    expect(screen.getByTestId('product-modal-materiaal-omschrijving')).toBeInTheDocument();
  });

  it('kiest geen inactief materiaal als standaard', () => {
    renderModal({
      kunstwerk: { ...KUNSTWERK, materiaalIds: ['mat-2', 'mat-1'] },
      materialen: [
        { ...MATERIAAL_1, actief: true },
        { ...MATERIAAL_2, actief: false },
      ],
    });
    expect(screen.getByTestId('product-modal-materiaal-tekst')).toHaveTextContent('4mm Veiligheidsglas');
  });
```

Pas de fixtures aan zodat `MATERIAAL_1` het 4mm-Veiligheidsglasmateriaal is (dat is het label dat de tekstweergave toont). Bestaande tests die de `<select>` gebruiken werken op fixtures met twee of meer materialen die allemaal actief zijn — die blijven ongewijzigd, omdat een ontbrekende `actief` als actief telt.

- [ ] **Step 2: Draai de tests en controleer dat ze falen**

Run: `npx vitest run tests/components/ProductModal.test.tsx`
Expected: FAIL — het inactieve materiaal staat nog in de lijst.

- [ ] **Step 3: Filter op actief**

In `src/components/ProductModal.tsx`, importeer `isMateriaalActief` uit `./beheer/materiaalTypes` en wijzig regel 143-145:

```tsx
  const beschikbareMaterialen = (materialen ?? []).filter(
    (materiaal) => kunstwerk.materiaalIds.includes(materiaal.id) && isMateriaalActief(materiaal)
  );
```

- [ ] **Step 4: Laat de standaardkeuze een actief materiaal kiezen**

In het `useEffect` (regel 95-103):

```tsx
    const actieveVoorKunstwerk = (materialen ?? []).filter(
      (materiaal) => kunstwerk.materiaalIds.includes(materiaal.id) && isMateriaalActief(materiaal)
    );
    const veiligheidsglasId = findVeiligheidsglasMateriaalId(materialen ?? [], materiaalsoorten ?? []);
    // De oude fallback pakte kunstwerk.materiaalIds[0], en dat kan sinds de actief-vlag
    // een materiaal zijn dat helemaal niet meer in de keuzelijst staat.
    const defaultMateriaalId =
      veiligheidsglasId && actieveVoorKunstwerk.some((materiaal) => materiaal.id === veiligheidsglasId)
        ? veiligheidsglasId
        : actieveVoorKunstwerk[0]?.id ?? '';
    setMateriaalId(defaultMateriaalId);
```

- [ ] **Step 5: Bouw de tekstweergave**

Vervang het blok `{!isMateriaalloos && ( ... )}` (regel 395-418) door:

```tsx
        {!isMateriaalloos && (
          <label className="flex flex-col gap-1 text-[0.65rem] uppercase tracking-wide text-white/60">
            {t('material')}
            {beschikbareMaterialen.length === 1 ? (
              <span data-testid="product-modal-materiaal-tekst" className="text-sm normal-case tracking-normal text-white">
                {resolvedMateriaalLabel(beschikbareMaterialen[0])}
              </span>
            ) : (
              <select
                data-testid="product-modal-materiaal"
                value={materiaalId}
                onChange={(event) => handleMateriaalChange(event.target.value)}
                className="rounded-sm bg-black/40 px-2 py-1.5 text-sm text-white"
              >
                {beschikbareMaterialen.map((materiaal) => (
                  <option key={materiaal.id} value={materiaal.id}>
                    {resolvedMateriaalLabel(materiaal)}
                  </option>
                ))}
              </select>
            )}
            {geselecteerdMateriaal && (
              <span
                data-testid="product-modal-materiaal-omschrijving"
                className="pt-1 text-[0.7rem] normal-case tracking-normal text-white/50"
              >
                {resolveOmschrijving(geselecteerdMateriaal, locale)}
              </span>
            )}
          </label>
        )}
```

- [ ] **Step 6: Draai de tests**

Run: `npx vitest run tests/components/ProductModal.test.tsx`
Expected: PASS, inclusief alle bestaande dropdown-tests.

- [ ] **Step 7: Commit**

```bash
git add src/components/ProductModal.tsx tests/components/ProductModal.test.tsx
git commit -m "feat: ProductModal toont alleen actieve materialen, als tekst bij er nog een"
```

---

### Task 7: ProductsGrid — onbestelbare kunstwerken verbergen

**Files:**
- Modify: `src/components/ProductsGrid.tsx:82-118`
- Test: `tests/components/ProductsGrid.test.tsx`

**Interfaces:**
- Consumes: `isMateriaalActief` (Task 1).
- Produces: niets voor latere taken.

- [ ] **Step 1: Schrijf de falende tests**

Voeg toe aan `tests/components/ProductsGrid.test.tsx`, met het rendering-patroon dat daar al staat:

```tsx
  it('verbergt een kunstwerk waarvan geen enkel materiaal actief is', async () => {
    renderGrid({
      kunstwerken: [
        { ...KUNSTWERK, id: 'kw-1', code: 'ZICHTBAAR', materiaalIds: ['mat-1'] },
        { ...KUNSTWERK, id: 'kw-2', code: 'VERBORGEN', materiaalIds: ['mat-2'] },
      ],
      materialen: [
        { ...MATERIAAL_1, id: 'mat-1', actief: true },
        { ...MATERIAAL_2, id: 'mat-2', actief: false },
      ],
    });
    expect(await screen.findByText('ZICHTBAAR')).toBeInTheDocument();
    expect(screen.queryByText('VERBORGEN')).not.toBeInTheDocument();
  });

  it('blijft een materiaalloos kunstwerk tonen', async () => {
    renderGrid({
      kunstwerken: [{ ...KUNSTWERK, id: 'kw-3', code: 'AKOESTISCH', materiaalIds: [] }],
      materialen: [{ ...MATERIAAL_2, id: 'mat-2', actief: false }],
    });
    expect(await screen.findByText('AKOESTISCH')).toBeInTheDocument();
  });
```

Pas de assertie op de zichtbare tekst aan aan wat de kaart daadwerkelijk toont (code of omschrijving) — kijk naar de bestaande tests in dat bestand.

- [ ] **Step 2: Draai de tests en controleer dat ze falen**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx`
Expected: FAIL — `VERBORGEN` staat nog in de grid.

- [ ] **Step 3: Voeg het filter toe**

In `src/components/ProductsGrid.tsx`, importeer `isMateriaalActief` uit `./beheer/materiaalTypes` en voeg naast de bestaande `matches*`-functies toe:

```tsx
  // Een kunstwerk dat wél materialen heeft maar waarvan er geen enkele actief is, is
  // niet bestelbaar: de materiaalkeuze zou leeg zijn en het bestelknopje dood. Een
  // kunstwerk zónder materialen is iets anders -- dat is materiaalloos (Akoestische
  // stof) en gewoon bestelbaar.
  function isBestelbaar(kunstwerk: Kunstwerk) {
    if (kunstwerk.materiaalIds.length === 0) return true;
    return (materialen.items ?? []).some(
      (materiaal) => kunstwerk.materiaalIds.includes(materiaal.id) && isMateriaalActief(materiaal)
    );
  }
```

En voeg `isBestelbaar(kunstwerk) &&` toe aan `visibleKunstwerken` én aan elk van de `*CountBase`-filters, zodat de filtertellers niet meetellen wat niemand kan zien.

Let op: `materialen.items` is `null` zolang de fetch loopt. Zolang dat zo is levert `isBestelbaar` `false` voor elk kunstwerk mét materialen. Voeg daarom bovenaan `isBestelbaar` toe:

```tsx
    if (materialen.items === null) return true;
```

zodat de grid tijdens het laden niet leeg flitst.

- [ ] **Step 4: Draai de tests**

Run: `npx vitest run tests/components/ProductsGrid.test.tsx tests/components/ProductsGrid.mobile.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ProductsGrid.tsx tests/components/ProductsGrid.test.tsx
git commit -m "feat: verberg kunstwerken zonder actief materiaal in de collectie"
```

---

### Task 8: BestellingModal en KunstwerkenSection

**Files:**
- Modify: `src/components/beheer/BestellingModal.tsx:772-774` (bestaande regel), `:1134-1136` (nieuwe regel)
- Modify: `src/components/beheer/KunstwerkenSection.tsx:1110-1121`
- Test: `tests/components/beheer/BestellingModal.test.tsx`, `tests/components/beheer/KunstwerkenSection.test.tsx`

**Interfaces:**
- Consumes: `isMateriaalActief` (Task 1), vertaalsleutel `materiaalInactiefSuffix` (Task 5).
- Produces: niets voor latere taken.

- [ ] **Step 1: Schrijf de falende tests**

In `tests/components/beheer/BestellingModal.test.tsx`:

```tsx
  it('biedt bij een nieuwe regel geen inactief materiaal aan', async () => {
    renderModal({
      materialen: [
        { ...MATERIAAL_1, id: 'mat-1', actief: true },
        { ...MATERIAAL_2, id: 'mat-2', actief: false },
      ],
    });
    // kies eerst het kunstwerk voor de nieuwe regel, zoals de bestaande tests doen
    const select = await screen.findByTestId('bestelling-modal-nieuwe-regel-materiaal');
    const values = Array.from(select.querySelectorAll('option')).map((option) => option.getAttribute('value'));
    expect(values).not.toContain('mat-2');
  });

  it('behoudt een inactief materiaal op een bestaande regel', async () => {
    renderModal({
      materialen: [
        { ...MATERIAAL_1, id: 'mat-1', actief: true },
        { ...MATERIAAL_2, id: 'mat-2', actief: false },
      ],
      bestelling: { ...BESTELLING, lines: [{ ...LINE, id: 'line-1', materiaalId: 'mat-2' }] },
    });
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-bewerken-line-1'));
    const select = await screen.findByTestId('bestelling-modal-regel-materiaal-line-1');
    expect(select).toHaveValue('mat-2');
    expect(select).toHaveTextContent('(inactief)');
  });
```

In `tests/components/beheer/KunstwerkenSection.test.tsx`:

```tsx
  it('toont een inactief materiaal met een markering en houdt het aanvinkbaar', async () => {
    renderSection({
      materialen: [
        { ...MATERIAAL_1, id: 'mat-1', actief: true },
        { ...MATERIAAL_2, id: 'mat-2', actief: false },
      ],
    });
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    fireEvent.click(await screen.findByTestId('kunstwerk-modal-tab-materialen'));
    const checkbox = screen.getByTestId('kunstwerk-modal-materiaal-mat-2');
    expect(checkbox.closest('label')).toHaveTextContent('(inactief)');
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });
```

Controleer de exacte testids van de tab- en toevoegknoppen in de bestaande tests van dat bestand en pas ze zo nodig aan.

- [ ] **Step 2: Draai de tests en controleer dat ze falen**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Pas BestellingModal aan**

Importeer `isMateriaalActief` uit `./materiaalTypes`.

Nieuwe regel (regel 1134-1136):

```tsx
                      const beschikbareMaterialen = (materialen ?? []).filter(
                        (m) => gekozenKunstwerk.materiaalIds.includes(m.id) && isMateriaalActief(m)
                      );
```

Bestaande regel (regel 772-774) — de al gekozen waarde moet in de lijst blijven staan, anders zet het openen van een oude bestelling de keuze stil op leeg:

```tsx
                const kunstwerkMaterialen = kunstwerk
                  ? (materialen ?? []).filter(
                      (m) =>
                        kunstwerk.materiaalIds.includes(m.id) &&
                        (isMateriaalActief(m) || m.id === weergaveLine.materiaalId)
                    )
                  : [];
```

En het optielabel in de bewerk-`<select>` (regel ~908):

```tsx
                                {kunstwerkMaterialen.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.materiaaldikte}mm{' '}
                                    {materiaalsoortNaamById.get(m.materiaalsoortId) ?? m.materiaalsoortId}
                                    {isMateriaalActief(m) ? '' : ` ${t('materiaalInactiefSuffix')}`}
                                  </option>
                                ))}
```

- [ ] **Step 4: Pas KunstwerkenSection aan**

Importeer `isMateriaalActief` uit `./materiaalTypes`. De lijst blijft ongefilterd — een verborgen materiaal zou uit de formulierstate vallen en bij opslaan stilzwijgend een bestaande koppeling wissen. Alleen het label verandert:

```tsx
            {(materialen ?? []).map((materiaal) => (
              <label key={materiaal.id} className="flex items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={materiaalIds.includes(materiaal.id)}
                  onChange={() => setMateriaalIds((current) => toggle(current, materiaal.id))}
                  data-testid={`kunstwerk-modal-materiaal-${materiaal.id}`}
                />
                {materiaalLabel(materiaal)}
                {!isMateriaalActief(materiaal) && (
                  <span className="text-white/40">{t('materiaalInactiefSuffix')}</span>
                )}
              </label>
            ))}
```

- [ ] **Step 5: Draai de tests**

Run: `npx vitest run tests/components/beheer/BestellingModal.test.tsx tests/components/beheer/KunstwerkenSection.test.tsx`
Expected: PASS.

- [ ] **Step 6: Draai de volledige suite en de typecheck**

Run: `npm test`
Run: `npx tsc --noEmit`
Run: `npm run lint`
Expected: alles slaagt.

- [ ] **Step 7: Commit**

```bash
git add src/components/beheer/BestellingModal.tsx src/components/beheer/KunstwerkenSection.tsx tests/components/beheer/BestellingModal.test.tsx tests/components/beheer/KunstwerkenSection.test.tsx
git commit -m "feat: inactieve materialen in bestelmodal en kunstwerkformulier"
```

---

### Task 9: Handleiding en screenshot

**Files:**
- Modify: `src/components/beheer/documentatie/chapters/StamgegevensChapter.tsx` (onderdeel "Materialen", regel ~22-26)
- Modify: `public/documentatie/` (screenshot van het materialenscherm vervangen)
- Modify: `scripts/check-screenshot-freshness.ts` (mapping controleren)

**Interfaces:**
- Consumes: het afgeronde gedrag uit Task 5.
- Produces: niets.

- [ ] **Step 1: Schrijf de handleidingtekst**

In `StamgegevensChapter.tsx`, in de `SubSection` met `id="stamgegevens-materialen"`, na de bestaande alinea:

```tsx
        <p>
          Met <strong>Actief</strong> bepaal je of klanten dit materiaal kunnen kiezen. Een inactief
          materiaal blijft gewoon bestaan — het verdwijnt alleen uit de materiaalkeuze in de winkel.
          Blijft er voor een kunstwerk nog één actief materiaal over, dan verdwijnt de keuzelijst
          helemaal en staat het materiaal er als tekst. Heeft een kunstwerk uitsluitend inactieve
          materialen, dan is het niet meer bestelbaar en wordt het niet meer getoond.
        </p>
        <p>
          Een materiaal op inactief zetten kan niet zolang er nog openstaande bestellingen met dat
          materiaal zijn. Rond die bestellingen eerst af of wijs ze af.
        </p>
        <p>
          Zet je een materiaal weer op actief, dan vraagt het scherm of het bij alle kunstwerken
          aangevinkt moet worden. Kies je ja, dan wordt het materiaal gekoppeld aan elk kunstwerk dat
          al materialen heeft; kunstwerken zonder materialen (zoals Akoestische stof) blijven
          ongemoeid.
        </p>
```

- [ ] **Step 2: Draai de documentatietests**

Run: `npx vitest run tests/components/beheer/documentatie`
Expected: PASS — ankers en de hoofdstuk→screenshot-mapping blijven kloppen.

- [ ] **Step 3: Maak de screenshot opnieuw**

Het materialenscherm heeft er een zichtbare kolom bij, dus de bestaande screenshot is achterhaald. Maak hem opnieuw volgens de vaste werkwijze (claude-in-chrome, `gif_creator` met `download: true`, daarna bijsnijden) en vervang het bestand onder `public/documentatie/`. Controleer daarna de mapping in `scripts/check-screenshot-freshness.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/components/beheer/documentatie/chapters/StamgegevensChapter.tsx public/documentatie
git commit -m "docs: handleiding en screenshot voor de actief-vlag op materialen"
```

---

## Na afloop: uitrol

Niet onderdeel van de taken hierboven, maar wel van het werk:

1. Merge de branch naar `master` en deploy één keer naar staging (`deploy-naar-staging.yml`). De migratie staat er al sinds Task 1.
2. Controleer op staging: zet 3mm/5mm/10mm Acryl en 3mm Dibond op inactief. Bij 3mm Acryl blokkeert dat zolang de openstaande bestelling in status *Te versturen naar drukker* niet is afgerond of afgewezen — dat is het bedoelde gedrag.
3. Open een kunstwerk in de collectie: de materiaalkeuze moet weg zijn en er moet "4mm Veiligheidsglas" met omschrijving staan.
4. Vraag de gebruiker om toestemming, draai `npm run db:migrate -- productie --confirm`, promoot naar productie en zet daar dezelfde vier materialen op inactief. Productie heeft nog geen kunstwerken of bestellingen, dus daar blokkeert niets.
