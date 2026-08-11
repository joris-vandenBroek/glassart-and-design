# Kunstwerk-relaties als koppeltabellen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `kunstwerken.segmentIds`/`materiaalIds`/`maatIds`/`stijlIds`/`onderwerpIds` (vijf JSON-arrays zonder referentiële integriteit) worden vijf koppeltabellen met echte foreign keys, `ON DELETE CASCADE`, en een `volgorde`-kolom die het huidige array-volgorde-gedrag exact behoudt.

**Architecture:** Vier taken: (1) de vijf koppeltabellen aanmaken en backfillen vanuit de bestaande JSON-arrays — puur additief, niets bestaands verandert; (2) een gedeelde server-helper (`kunstwerkRelaties.ts`) die de join-en-samenstel-logica op één plek houdt — ook puur additief, nog ongebruikt; (3) de daadwerkelijke overstap: kunstwerken-routes, `prijsmodule.ts` en `bestelheaders`'s bestelregel-validatie gaan de helper gebruiken, en de vijf oude kolommen verdwijnen; (4) de resterende testfixtures die de oude kolommen rechtstreeks aanmaakten, plus de volledige suite en de regressiesuite. De API-contract naar de client (`segmentIds`/`materiaalIds`/enz. als arrays in `GET`/`POST`/`PATCH`-bodies) verandert in geen enkele taak — alleen de opslag erachter.

**Tech Stack:** Next.js 14 App Router, TypeScript, raw `mysql2` tegen MariaDB 11.8 (geen ORM), Vitest + React Testing Library.

Ontwerp: [`docs/superpowers/specs/2026-08-11-kunstwerk-relaties-koppeltabellen-design.md`](../specs/2026-08-11-kunstwerk-relaties-koppeltabellen-design.md).

## Global Constraints

- **Er is geen lokale database.** `npm test` en `npm run dev` praten allebei tegen de **staging**-MariaDB uit `.env.local`. Een migratie moet op staging zijn toegepast vóórdat de tests van die taak kunnen slagen.
- **Testopruiming mag nooit data verwijderen die via de applicatie is toegevoegd.** Elke test ruimt exact de rijen op die hij zelf aanmaakte, op gevangen id — nooit een `DELETE` zonder `WHERE`, nooit `TRUNCATE`.
- **`src/lib/server/tableColumns.ts` is een allow-list die *gooit* bij een onbekende kolom.** Een kolomwijziging vraagt altijd om: migratiebestand + `db/schema.sql` + `tableColumns.ts`.
- **`ON DELETE CASCADE` op alle vijf koppeltabellen, geen harde blokkade** (ontwerp, beslissing 3). Verwijderen van een segment/stijl/onderwerp/materiaal/maat die nog in gebruik is, ruimt alleen de koppelrij(en) op; het kunstwerk blijft bestaan.
- **Een duplicaat-id binnen één array wordt geweigerd met een `400`, nooit stilzwijgend gededupliceerd** (ontwerp, beslissing 7).
- **`volgorde` is enkel relatief bedoeld** — de startwaarde (0- of 1-gebaseerd) maakt functioneel niet uit, zolang backfill en schrijfpad intern consistent zijn (ontwerp, beslissing 8).
- **`npx tsc --noEmit` moet na elke taak exit 0 geven.**
- **`npm run test:regression` is opt-in** (`tests/regression/staging-scenarios.test.ts`, buiten de standaard `npm test`). Draai die suite aan het eind van taak 4.
- **Nooit `deploy-naar-production.yml` zonder eerst dezelfde commit op staging te hebben gezet en daar gecontroleerd.**
- **Vraag altijd expliciet toestemming vóór elke wijziging aan de productiedatabase**, ook als een eerdere wijziging al goedgekeurd was. `kunstwerken` heeft op productie vandaag 0 rijen, dus geen backfill-risico daar, maar de migraties moeten er alsnog doorheen (zelfde volgorde als staging).

---

### Task 1: Vijf koppeltabellen aanmaken en backfillen

Puur additief: geen bestaande query, route of component verandert. De oude JSON-kolommen blijven nog bestaan (die verdwijnen pas in taak 3) — dit is de "expand"-helft van een expand-contract-migratie.

**Files:**
- Create: `db/migrations/2026-08-11-01-kunstwerk-segmenten-koppeltabel.sql`
- Create: `db/migrations/2026-08-11-02-kunstwerk-materialen-koppeltabel.sql`
- Create: `db/migrations/2026-08-11-03-kunstwerk-maten-koppeltabel.sql`
- Create: `db/migrations/2026-08-11-04-kunstwerk-stijlen-koppeltabel.sql`
- Create: `db/migrations/2026-08-11-05-kunstwerk-onderwerpen-koppeltabel.sql`
- Create: `tests/lib/server/kunstwerkRelatiesBackfill.test.ts`
- Modify: `db/schema.sql` (vijf nieuwe `CREATE TABLE`, kunstwerken zelf blijft in deze taak ongewijzigd)

**Interfaces:**
- Produces: `kunstwerkSegmenten(kunstwerkId, segmentId, volgorde)`, `kunstwerkMaterialen(kunstwerkId, materiaalId, volgorde)`, `kunstwerkMaten(kunstwerkId, maatId, volgorde)`, `kunstwerkStijlen(kunstwerkId, stijlId, volgorde)`, `kunstwerkOnderwerpen(kunstwerkId, onderwerpId, volgorde)`, elk gevuld met dezelfde data als de bijbehorende JSON-kolom op `kunstwerken`, in dezelfde volgorde.

- [ ] **Step 1: Schrijf de falende test**

Nieuw bestand `tests/lib/server/kunstwerkRelatiesBackfill.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getPool } from '@/lib/server/db';
import { parseJsonKolom } from '@/lib/server/crud';

// Tijdelijke verificatietest: bewijst dat de backfill in taak 1 exact overeenkomt met de
// bestaande JSON-kolommen. Wordt in taak 3 verwijderd zodra die kolommen weg zijn -- de
// vergelijkingsbasis bestaat dan niet meer.
const RELATIES = [
  { jsonKolom: 'segmentIds', tabel: 'kunstwerkSegmenten', kolomId: 'segmentId' },
  { jsonKolom: 'materiaalIds', tabel: 'kunstwerkMaterialen', kolomId: 'materiaalId' },
  { jsonKolom: 'maatIds', tabel: 'kunstwerkMaten', kolomId: 'maatId' },
  { jsonKolom: 'stijlIds', tabel: 'kunstwerkStijlen', kolomId: 'stijlId' },
  { jsonKolom: 'onderwerpIds', tabel: 'kunstwerkOnderwerpen', kolomId: 'onderwerpId' },
] as const;

describe('backfill van kunstwerk-relaties naar koppeltabellen', () => {
  it.each(RELATIES)(
    '$tabel bevat exact dezelfde id\'s, in dezelfde volgorde, als kunstwerken.$jsonKolom',
    async ({ jsonKolom, tabel, kolomId }) => {
      const pool = getPool();
      const [kunstwerkRows] = await pool.query(`SELECT id, \`${jsonKolom}\` AS waarde FROM kunstwerken`);
      for (const row of kunstwerkRows as Array<{ id: string; waarde: unknown }>) {
        const verwacht = parseJsonKolom<string[]>(row.waarde, []);
        const [koppelRows] = await pool.query(
          `SELECT \`${kolomId}\` AS relatedId FROM \`${tabel}\` WHERE kunstwerkId = ? ORDER BY volgorde ASC`,
          [row.id]
        );
        const werkelijk = (koppelRows as Array<{ relatedId: string }>).map((r) => r.relatedId);
        expect(werkelijk).toEqual(verwacht);
      }
    }
  );
});
```

- [ ] **Step 2: Draai de test om te zien dat hij faalt**

```bash
npx vitest run tests/lib/server/kunstwerkRelatiesBackfill.test.ts
```

Verwacht: alle vijf FAIL, met een `ER_NO_SUCH_TABLE`-fout (`kunstwerkSegmenten` bestaat nog niet).

- [ ] **Step 3: Schrijf de vijf migratiebestanden**

`db/migrations/2026-08-11-01-kunstwerk-segmenten-koppeltabel.sql`:

```sql
-- Koppeltabel voor kunstwerken.segmentIds (2026-08-11), 1 van 6 in deze reeks.
-- Ontwerp: docs/superpowers/specs/2026-08-11-kunstwerk-relaties-koppeltabellen-design.md
--
-- Puur additief: kunstwerken.segmentIds blijft in deze migratie bestaan en ongewijzigd.
-- FOR ORDINALITY geeft de 1-gebaseerde positie in de array, gebruikt als volgorde.
CREATE TABLE kunstwerkSegmenten (
  kunstwerkId CHAR(36) NOT NULL,
  segmentId CHAR(36) NOT NULL,
  volgorde INT NOT NULL,
  PRIMARY KEY (kunstwerkId, segmentId),
  FOREIGN KEY (kunstwerkId) REFERENCES kunstwerken(id) ON DELETE CASCADE,
  FOREIGN KEY (segmentId) REFERENCES segmenten(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO kunstwerkSegmenten (kunstwerkId, segmentId, volgorde)
SELECT k.id, jt.segmentId, jt.volgorde
FROM kunstwerken k
JOIN JSON_TABLE(
  k.segmentIds, '$[*]' COLUMNS (
    volgorde FOR ORDINALITY,
    segmentId CHAR(36) PATH '$'
  )
) AS jt
WHERE k.segmentIds IS NOT NULL;
```

`db/migrations/2026-08-11-02-kunstwerk-materialen-koppeltabel.sql`:

```sql
-- Koppeltabel voor kunstwerken.materiaalIds (2026-08-11), 2 van 6 in deze reeks.
-- Ontwerp: docs/superpowers/specs/2026-08-11-kunstwerk-relaties-koppeltabellen-design.md
CREATE TABLE kunstwerkMaterialen (
  kunstwerkId CHAR(36) NOT NULL,
  materiaalId CHAR(36) NOT NULL,
  volgorde INT NOT NULL,
  PRIMARY KEY (kunstwerkId, materiaalId),
  FOREIGN KEY (kunstwerkId) REFERENCES kunstwerken(id) ON DELETE CASCADE,
  FOREIGN KEY (materiaalId) REFERENCES materialen(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO kunstwerkMaterialen (kunstwerkId, materiaalId, volgorde)
SELECT k.id, jt.materiaalId, jt.volgorde
FROM kunstwerken k
JOIN JSON_TABLE(
  k.materiaalIds, '$[*]' COLUMNS (
    volgorde FOR ORDINALITY,
    materiaalId CHAR(36) PATH '$'
  )
) AS jt
WHERE k.materiaalIds IS NOT NULL;
```

`db/migrations/2026-08-11-03-kunstwerk-maten-koppeltabel.sql`:

```sql
-- Koppeltabel voor kunstwerken.maatIds (2026-08-11), 3 van 6 in deze reeks.
-- Ontwerp: docs/superpowers/specs/2026-08-11-kunstwerk-relaties-koppeltabellen-design.md
--
-- 0 rijen voor een kunstwerk blijft het bestaande materiaalloos/prijs-per-m²-signaal
-- (prijsmodule.ts, berekenBestellijnPrijs) -- geen aparte vlag nodig.
CREATE TABLE kunstwerkMaten (
  kunstwerkId CHAR(36) NOT NULL,
  maatId CHAR(36) NOT NULL,
  volgorde INT NOT NULL,
  PRIMARY KEY (kunstwerkId, maatId),
  FOREIGN KEY (kunstwerkId) REFERENCES kunstwerken(id) ON DELETE CASCADE,
  FOREIGN KEY (maatId) REFERENCES maten(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO kunstwerkMaten (kunstwerkId, maatId, volgorde)
SELECT k.id, jt.maatId, jt.volgorde
FROM kunstwerken k
JOIN JSON_TABLE(
  k.maatIds, '$[*]' COLUMNS (
    volgorde FOR ORDINALITY,
    maatId CHAR(36) PATH '$'
  )
) AS jt
WHERE k.maatIds IS NOT NULL;
```

`db/migrations/2026-08-11-04-kunstwerk-stijlen-koppeltabel.sql`:

```sql
-- Koppeltabel voor kunstwerken.stijlIds (2026-08-11), 4 van 6 in deze reeks.
-- Ontwerp: docs/superpowers/specs/2026-08-11-kunstwerk-relaties-koppeltabellen-design.md
CREATE TABLE kunstwerkStijlen (
  kunstwerkId CHAR(36) NOT NULL,
  stijlId CHAR(36) NOT NULL,
  volgorde INT NOT NULL,
  PRIMARY KEY (kunstwerkId, stijlId),
  FOREIGN KEY (kunstwerkId) REFERENCES kunstwerken(id) ON DELETE CASCADE,
  FOREIGN KEY (stijlId) REFERENCES stijlen(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO kunstwerkStijlen (kunstwerkId, stijlId, volgorde)
SELECT k.id, jt.stijlId, jt.volgorde
FROM kunstwerken k
JOIN JSON_TABLE(
  k.stijlIds, '$[*]' COLUMNS (
    volgorde FOR ORDINALITY,
    stijlId CHAR(36) PATH '$'
  )
) AS jt
WHERE k.stijlIds IS NOT NULL;
```

`db/migrations/2026-08-11-05-kunstwerk-onderwerpen-koppeltabel.sql`:

```sql
-- Koppeltabel voor kunstwerken.onderwerpIds (2026-08-11), 5 van 6 in deze reeks.
-- Ontwerp: docs/superpowers/specs/2026-08-11-kunstwerk-relaties-koppeltabellen-design.md
CREATE TABLE kunstwerkOnderwerpen (
  kunstwerkId CHAR(36) NOT NULL,
  onderwerpId CHAR(36) NOT NULL,
  volgorde INT NOT NULL,
  PRIMARY KEY (kunstwerkId, onderwerpId),
  FOREIGN KEY (kunstwerkId) REFERENCES kunstwerken(id) ON DELETE CASCADE,
  FOREIGN KEY (onderwerpId) REFERENCES onderwerpen(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO kunstwerkOnderwerpen (kunstwerkId, onderwerpId, volgorde)
SELECT k.id, jt.onderwerpId, jt.volgorde
FROM kunstwerken k
JOIN JSON_TABLE(
  k.onderwerpIds, '$[*]' COLUMNS (
    volgorde FOR ORDINALITY,
    onderwerpId CHAR(36) PATH '$'
  )
) AS jt
WHERE k.onderwerpIds IS NOT NULL;
```

- [ ] **Step 4: Werk `db/schema.sql` bij**

Voeg de vijf `CREATE TABLE`-blokken hierboven toe direct na `CREATE TABLE kunstwerken (...)`, vóór `CREATE TABLE instellingen`. `kunstwerken`'s eigen `CREATE TABLE` blijft in deze taak ongewijzigd (de vijf JSON-kolommen staan er nog).

- [ ] **Step 5: Pas de migraties toe op staging**

```bash
npm run db:migrate -- staging
```

Verwacht: vijf bestanden toegepast, elk 2 statements (`CREATE TABLE` + `INSERT`), allemaal `gelukt`.

- [ ] **Step 6: Draai de test opnieuw**

```bash
npx vitest run tests/lib/server/kunstwerkRelatiesBackfill.test.ts
npx tsc --noEmit
```

Verwacht: alle PASS, `tsc` exit 0.

- [ ] **Step 7: Commit**

```bash
git add db/migrations/2026-08-11-01-kunstwerk-segmenten-koppeltabel.sql db/migrations/2026-08-11-02-kunstwerk-materialen-koppeltabel.sql db/migrations/2026-08-11-03-kunstwerk-maten-koppeltabel.sql db/migrations/2026-08-11-04-kunstwerk-stijlen-koppeltabel.sql db/migrations/2026-08-11-05-kunstwerk-onderwerpen-koppeltabel.sql db/schema.sql tests/lib/server/kunstwerkRelatiesBackfill.test.ts
git commit -m "feat: vijf koppeltabellen voor kunstwerk-relaties, backfill vanuit bestaande JSON-arrays"
```

---

### Task 2: Gedeelde helper `kunstwerkRelaties.ts`

Puur additief: een nieuwe, nog ongebruikte module. Niets bestaands verandert of breekt.

**Files:**
- Create: `src/lib/server/kunstwerkRelaties.ts`
- Create: `tests/lib/server/kunstwerkRelaties.test.ts`

**Interfaces:**
- Consumes: de vijf koppeltabellen uit taak 1.
- Produces: `RelatieKolomNaam` (type), `haalRelatiesOp(connection, kunstwerkIds: string[]): Promise<Map<string, KunstwerkRelaties>>`, `haalRelatiesOpVoorEen(connection, kunstwerkId: string): Promise<KunstwerkRelaties>`, `vervangRelaties(connection, kunstwerkId: string, data: Partial<Record<RelatieKolomNaam, string[]>>): Promise<void>`, `scheidRelaties(data: Record<string, unknown>): { relaties: Partial<Record<RelatieKolomNaam, string[]>>; rest: Record<string, unknown> }`, `DuplicateRelatieError` (class, met `.kolom: string`). Deze vier functies en de klasse zijn wat taak 3 importeert.

- [ ] **Step 1: Schrijf de falende tests**

Nieuw bestand `tests/lib/server/kunstwerkRelaties.test.ts`:

```ts
import { describe, expect, it, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import {
  haalRelatiesOp,
  haalRelatiesOpVoorEen,
  vervangRelaties,
  scheidRelaties,
  DuplicateRelatieError,
} from '@/lib/server/kunstwerkRelaties';

const createdKunstwerkIds: string[] = [];

afterEach(async () => {
  if (createdKunstwerkIds.length > 0) {
    await getPool().query('DELETE FROM kunstwerken WHERE id IN (?)', [createdKunstwerkIds]);
    createdKunstwerkIds.length = 0;
  }
});

async function maakKunstwerk(code: string): Promise<string> {
  const kunstwerk = await insertRow<{ id: string }>('kunstwerken', { code } as never);
  createdKunstwerkIds.push(kunstwerk.id);
  return kunstwerk.id;
}

async function maakSegment(): Promise<string> {
  const naam = `AUTOTEST-${randomUUID()}`;
  const segment = await insertRow<{ id: string }>('segmenten', { omschrijvingNl: naam } as never);
  return segment.id;
}

describe('scheidRelaties', () => {
  it('splitst relatiekolommen van de rest van de body', () => {
    const { relaties, rest } = scheidRelaties({
      code: 'x',
      segmentIds: ['a', 'b'],
      materiaalIds: ['c'],
    });
    expect(relaties).toEqual({ segmentIds: ['a', 'b'], materiaalIds: ['c'] });
    expect(rest).toEqual({ code: 'x' });
  });

  it('laat relaties leeg als er geen relatiekolom in de body zit', () => {
    const { relaties, rest } = scheidRelaties({ code: 'x' });
    expect(relaties).toEqual({});
    expect(rest).toEqual({ code: 'x' });
  });
});

describe('vervangRelaties + haalRelatiesOp(VoorEen)', () => {
  it('slaat id\'s op in de opgegeven volgorde en geeft ze in dezelfde volgorde terug', async () => {
    const kunstwerkId = await maakKunstwerk(`AUTOTEST-${randomUUID()}`);
    const segmentA = await maakSegment();
    const segmentB = await maakSegment();
    try {
      await vervangRelaties(getPool(), kunstwerkId, { segmentIds: [segmentB, segmentA] });
      const relaties = await haalRelatiesOpVoorEen(getPool(), kunstwerkId);
      expect(relaties.segmentIds).toEqual([segmentB, segmentA]);
      expect(relaties.materiaalIds).toEqual([]);
    } finally {
      await getPool().query('DELETE FROM segmenten WHERE id IN (?)', [[segmentA, segmentB]]);
    }
  });

  it('laat een kolom die niet is meegegeven ongemoeid (partial update)', async () => {
    const kunstwerkId = await maakKunstwerk(`AUTOTEST-${randomUUID()}`);
    const segmentA = await maakSegment();
    try {
      await vervangRelaties(getPool(), kunstwerkId, { segmentIds: [segmentA] });
      await vervangRelaties(getPool(), kunstwerkId, {}); // geen enkele kolom meegegeven
      const relaties = await haalRelatiesOpVoorEen(getPool(), kunstwerkId);
      expect(relaties.segmentIds).toEqual([segmentA]);
    } finally {
      await getPool().query('DELETE FROM segmenten WHERE id = ?', [segmentA]);
    }
  });

  it('weigert een duplicaat binnen dezelfde array', async () => {
    const kunstwerkId = await maakKunstwerk(`AUTOTEST-${randomUUID()}`);
    const segmentA = await maakSegment();
    try {
      await expect(
        vervangRelaties(getPool(), kunstwerkId, { segmentIds: [segmentA, segmentA] })
      ).rejects.toThrow(DuplicateRelatieError);
    } finally {
      await getPool().query('DELETE FROM segmenten WHERE id = ?', [segmentA]);
    }
  });

  it('haalRelatiesOp haalt meerdere kunstwerken in bulk op', async () => {
    const kunstwerkA = await maakKunstwerk(`AUTOTEST-${randomUUID()}`);
    const kunstwerkB = await maakKunstwerk(`AUTOTEST-${randomUUID()}`);
    const segmentA = await maakSegment();
    try {
      await vervangRelaties(getPool(), kunstwerkA, { segmentIds: [segmentA] });
      const alle = await haalRelatiesOp(getPool(), [kunstwerkA, kunstwerkB]);
      expect(alle.get(kunstwerkA)?.segmentIds).toEqual([segmentA]);
      expect(alle.get(kunstwerkB)?.segmentIds).toEqual([]);
    } finally {
      await getPool().query('DELETE FROM segmenten WHERE id = ?', [segmentA]);
    }
  });
});
```

- [ ] **Step 2: Draai de tests om te zien dat ze falen**

```bash
npx vitest run tests/lib/server/kunstwerkRelaties.test.ts
```

Verwacht: alle FAIL met "Cannot find module '@/lib/server/kunstwerkRelaties'".

- [ ] **Step 3: Implementeer `src/lib/server/kunstwerkRelaties.ts`**

```ts
import type { Pool } from 'mysql2/promise';

export type RelatieKolomNaam = 'segmentIds' | 'materiaalIds' | 'maatIds' | 'stijlIds' | 'onderwerpIds';

export interface KunstwerkRelaties {
  segmentIds: string[];
  materiaalIds: string[];
  maatIds: string[];
  stijlIds: string[];
  onderwerpIds: string[];
}

interface RelatieConfig {
  kolom: RelatieKolomNaam;
  tabel: string;
  kolomId: string;
}

const RELATIE_KOLOMMEN: readonly RelatieConfig[] = [
  { kolom: 'segmentIds', tabel: 'kunstwerkSegmenten', kolomId: 'segmentId' },
  { kolom: 'materiaalIds', tabel: 'kunstwerkMaterialen', kolomId: 'materiaalId' },
  { kolom: 'maatIds', tabel: 'kunstwerkMaten', kolomId: 'maatId' },
  { kolom: 'stijlIds', tabel: 'kunstwerkStijlen', kolomId: 'stijlId' },
  { kolom: 'onderwerpIds', tabel: 'kunstwerkOnderwerpen', kolomId: 'onderwerpId' },
];

const KOLOM_NAMEN: readonly string[] = RELATIE_KOLOMMEN.map((r) => r.kolom);

/**
 * Weigert een duplicaat-id binnen één array in plaats van hem stilzwijgend te
 * dedupliceren -- zelfde principe als de kolom-allowlist in tableColumns.ts:
 * onverwachte invoer wordt luid geweigerd, niet stilzwijgend gecorrigeerd.
 */
export class DuplicateRelatieError extends Error {
  constructor(public kolom: string) {
    super(`Kolom ${kolom} bevat een dubbele id`);
    this.name = 'DuplicateRelatieError';
  }
}

/** Splitst een request-body in relatiekolommen en de rest, voor POST/PATCH /api/kunstwerken. */
export function scheidRelaties(data: Record<string, unknown>): {
  relaties: Partial<Record<RelatieKolomNaam, string[]>>;
  rest: Record<string, unknown>;
} {
  const relaties: Partial<Record<RelatieKolomNaam, string[]>> = {};
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (KOLOM_NAMEN.includes(key)) {
      relaties[key as RelatieKolomNaam] = value as string[];
    } else {
      rest[key] = value;
    }
  }
  return { relaties, rest };
}

function legeRelaties(): KunstwerkRelaties {
  return { segmentIds: [], materiaalIds: [], maatIds: [], stijlIds: [], onderwerpIds: [] };
}

/** Haalt de relaties van meerdere kunstwerken in bulk op (één query per koppeltabel, geen N+1). */
export async function haalRelatiesOp(
  connection: Pick<Pool, 'query'>,
  kunstwerkIds: string[]
): Promise<Map<string, KunstwerkRelaties>> {
  const result = new Map<string, KunstwerkRelaties>();
  for (const id of kunstwerkIds) {
    result.set(id, legeRelaties());
  }
  if (kunstwerkIds.length === 0) return result;

  for (const { kolom, tabel, kolomId } of RELATIE_KOLOMMEN) {
    const [rows] = await connection.query(
      `SELECT kunstwerkId, \`${kolomId}\` AS relatedId FROM \`${tabel}\` WHERE kunstwerkId IN (?) ORDER BY kunstwerkId, volgorde ASC`,
      [kunstwerkIds]
    );
    for (const row of rows as Array<{ kunstwerkId: string; relatedId: string }>) {
      result.get(row.kunstwerkId)?.[kolom].push(row.relatedId);
    }
  }
  return result;
}

/** Haalt de relaties van één kunstwerk op. */
export async function haalRelatiesOpVoorEen(
  connection: Pick<Pool, 'query'>,
  kunstwerkId: string
): Promise<KunstwerkRelaties> {
  const alle = await haalRelatiesOp(connection, [kunstwerkId]);
  return alle.get(kunstwerkId) ?? legeRelaties();
}

/**
 * Vervangt, per meegegeven kolom, de volledige set koppelrijen voor dit kunstwerk:
 * DELETE + opnieuw INSERT met volgorde = array-index. Een kolom die niet in `data`
 * voorkomt wordt niet aangeraakt (partial update, zelfde gedrag als PATCH altijd
 * al had). Verwacht een eigen transactie van de aanroeper wanneer dit samen met een
 * wijziging op de kunstwerken-rij zelf atomisch moet zijn.
 */
export async function vervangRelaties(
  connection: Pick<Pool, 'query'>,
  kunstwerkId: string,
  data: Partial<Record<RelatieKolomNaam, string[]>>
): Promise<void> {
  for (const { kolom, tabel, kolomId } of RELATIE_KOLOMMEN) {
    if (!(kolom in data)) continue;
    const ids = data[kolom] ?? [];
    if (new Set(ids).size !== ids.length) {
      throw new DuplicateRelatieError(kolom);
    }
    await connection.query(`DELETE FROM \`${tabel}\` WHERE kunstwerkId = ?`, [kunstwerkId]);
    for (const [volgorde, relatedId] of ids.entries()) {
      await connection.query(
        `INSERT INTO \`${tabel}\` (kunstwerkId, \`${kolomId}\`, volgorde) VALUES (?, ?, ?)`,
        [kunstwerkId, relatedId, volgorde]
      );
    }
  }
}
```

- [ ] **Step 4: Draai de tests opnieuw**

```bash
npx vitest run tests/lib/server/kunstwerkRelaties.test.ts
npx tsc --noEmit
```

Verwacht: alle PASS, `tsc` exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/kunstwerkRelaties.ts tests/lib/server/kunstwerkRelaties.test.ts
git commit -m "feat: gedeelde helper voor kunstwerk-relaties (haalRelatiesOp/vervangRelaties)"
```

---

### Task 3: Kunstwerken-routes, `prijsmodule.ts` en `bestelheaders` overzetten; oude kolommen weg

De daadwerkelijke overstap ("contract"-helft van de expand-contract-migratie). Na deze taak bestaan `kunstwerken.segmentIds`/`materiaalIds`/`maatIds`/`stijlIds`/`onderwerpIds` niet meer.

**Files:**
- Create: `db/migrations/2026-08-11-06-kunstwerk-oude-relatiekolommen-weg.sql`
- Create: `tests/app/api/kunstwerk-relaties.test.ts`
- Modify: `db/schema.sql` (`CREATE TABLE kunstwerken`: vijf kolommen weg)
- Modify: `src/lib/server/tableColumns.ts` (`kunstwerken`-lijst: vijf kolommen weg)
- Modify: `src/lib/server/kunstwerkCode.ts` (`KUNSTWERKEN_JSON_COLUMNS` weg)
- Modify: `src/app/api/kunstwerken/route.ts` (`GET`, `POST`)
- Modify: `src/app/api/kunstwerken/[id]/route.ts` (`GET`, `PATCH`)
- Modify: `src/lib/server/prijsmodule.ts` (`berekenPrijzenVoorAlleKunstwerken`)
- Modify: `src/app/api/bestelheaders/route.ts` (bestelregel-validatie)
- Delete: `tests/lib/server/kunstwerkRelatiesBackfill.test.ts` (vergelijkt tegen kolommen die na deze taak niet meer bestaan)

**Interfaces:**
- Consumes: `haalRelatiesOp`, `haalRelatiesOpVoorEen`, `vervangRelaties`, `scheidRelaties`, `DuplicateRelatieError` uit taak 2.
- Produces: `GET /api/kunstwerken` en `GET /api/kunstwerken/[id]` geven `segmentIds`/`materiaalIds`/`maatIds`/`stijlIds`/`onderwerpIds` terug zoals voorheen (arrays, in volgorde) — ongewijzigde vorm voor elke consument die alleen leest.
- Produces: `POST`/`PATCH /api/kunstwerken(/[id])` geven `400 { error: 'dubbele-relatie', kolom }` bij een duplicaat-id in een van de vijf arrays.

- [ ] **Step 1: Schrijf de falende route-tests**

Nieuw bestand `tests/app/api/kunstwerk-relaties.test.ts`:

```ts
import { describe, expect, it, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { GET as listKunstwerken, POST as createKunstwerk } from '@/app/api/kunstwerken/route';
import { GET as getKunstwerk, PATCH as patchKunstwerk } from '@/app/api/kunstwerken/[id]/route';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';

const createdKunstwerkIds: string[] = [];
const createdSegmentIds: string[] = [];

afterEach(async () => {
  if (createdKunstwerkIds.length > 0) {
    await getPool().query('DELETE FROM kunstwerken WHERE id IN (?)', [createdKunstwerkIds]);
    createdKunstwerkIds.length = 0;
  }
  if (createdSegmentIds.length > 0) {
    await getPool().query('DELETE FROM segmenten WHERE id IN (?)', [createdSegmentIds]);
    createdSegmentIds.length = 0;
  }
  await getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'staff-relaties'");
});

async function medewerkerCookie(): Promise<string> {
  const sessionId = await createSession('medewerker', 'staff-relaties');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

async function maakSegment(naam: string): Promise<string> {
  const segment = await insertRow<{ id: string }>('segmenten', { omschrijvingNl: naam } as never);
  createdSegmentIds.push(segment.id);
  return segment.id;
}

function postRequest(body: unknown, cookie: string): Request {
  return new Request('http://localhost/api/kunstwerken', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

function patchRequest(body: unknown, cookie: string): Request {
  return new Request('http://localhost/api/kunstwerken/x', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

describe('kunstwerk-relaties via de API', () => {
  it('POST slaat segmentIds op in volgorde en GET geeft ze zo terug', async () => {
    const cookie = await medewerkerCookie();
    const segmentA = await maakSegment(`AUTOTEST-A-${randomUUID()}`);
    const segmentB = await maakSegment(`AUTOTEST-B-${randomUUID()}`);

    const response = await createKunstwerk(
      postRequest({ code: `AUTOTEST-${randomUUID()}`, segmentIds: [segmentB, segmentA] }, cookie)
    );
    expect(response.status).toBe(201);
    const created = await response.json();
    createdKunstwerkIds.push(created.id);
    expect(created.segmentIds).toEqual([segmentB, segmentA]);

    const getResponse = await getKunstwerk(new Request('http://localhost/api/kunstwerken/x'), {
      params: { id: created.id },
    });
    const fetched = await getResponse.json();
    expect(fetched.segmentIds).toEqual([segmentB, segmentA]);
  });

  it('POST weigert een duplicaat-id binnen segmentIds met 400', async () => {
    const cookie = await medewerkerCookie();
    const segmentA = await maakSegment(`AUTOTEST-DUP-${randomUUID()}`);

    const response = await createKunstwerk(
      postRequest({ code: `AUTOTEST-${randomUUID()}`, segmentIds: [segmentA, segmentA] }, cookie)
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('dubbele-relatie');
    expect(body.kolom).toBe('segmentIds');

    // Geen kunstwerk mag zijn aangemaakt bij een geweigerde relatie.
    const [rows] = await getPool().query('SELECT id FROM kunstwerken WHERE code LIKE ?', ['AUTOTEST-%']);
    for (const row of rows as Array<{ id: string }>) {
      createdKunstwerkIds.push(row.id);
    }
  });

  it('PATCH zonder materiaalIds in de body laat bestaande materiaalIds ongemoeid', async () => {
    const cookie = await medewerkerCookie();
    const segmentA = await maakSegment(`AUTOTEST-PATCH-${randomUUID()}`);
    const createResponse = await createKunstwerk(
      postRequest({ code: `AUTOTEST-${randomUUID()}`, segmentIds: [segmentA] }, cookie)
    );
    const created = await createResponse.json();
    createdKunstwerkIds.push(created.id);

    const patchResponse = await patchKunstwerk(patchRequest({ prijsPerM2: 42 }, cookie), {
      params: { id: created.id },
    });
    expect(patchResponse.status).toBe(200);

    const getResponse = await getKunstwerk(new Request('http://localhost/api/kunstwerken/x'), {
      params: { id: created.id },
    });
    const fetched = await getResponse.json();
    expect(fetched.segmentIds).toEqual([segmentA]);
  });

  it('het verwijderen van een segment dat nog gekoppeld is, verwijdert alleen de koppeling (CASCADE)', async () => {
    const cookie = await medewerkerCookie();
    const segmentA = await maakSegment(`AUTOTEST-CASCADE-${randomUUID()}`);
    const createResponse = await createKunstwerk(
      postRequest({ code: `AUTOTEST-${randomUUID()}`, segmentIds: [segmentA] }, cookie)
    );
    const created = await createResponse.json();
    createdKunstwerkIds.push(created.id);

    await getPool().query('DELETE FROM segmenten WHERE id = ?', [segmentA]);
    createdSegmentIds.length = 0; // al verwijderd, opruiming hoeft dit niet nogmaals te doen

    const getResponse = await getKunstwerk(new Request('http://localhost/api/kunstwerken/x'), {
      params: { id: created.id },
    });
    expect(getResponse.status).toBe(200);
    const fetched = await getResponse.json();
    expect(fetched.segmentIds).toEqual([]);
  });

  it('GET (lijst) geeft relaties voor meerdere kunstwerken tegelijk terug, zonder N+1', async () => {
    const cookie = await medewerkerCookie();
    const segmentA = await maakSegment(`AUTOTEST-LIJST-${randomUUID()}`);
    const createResponse = await createKunstwerk(
      postRequest({ code: `AUTOTEST-${randomUUID()}`, segmentIds: [segmentA] }, cookie)
    );
    const created = await createResponse.json();
    createdKunstwerkIds.push(created.id);

    const listResponse = await listKunstwerken();
    const lijst = (await listResponse.json()) as Array<{ id: string; segmentIds: string[] }>;
    const gevonden = lijst.find((k) => k.id === created.id);
    expect(gevonden?.segmentIds).toEqual([segmentA]);
  });
});
```

- [ ] **Step 2: Draai de tests om te zien dat ze falen**

```bash
npx vitest run tests/app/api/kunstwerk-relaties.test.ts
```

Verwacht: FAIL — de routes gebruiken nog de oude JSON-kolommen, `dubbele-relatie` bestaat nog niet, en de CASCADE-test faalt omdat er nog geen foreign key ligt (`kunstwerken.segmentIds` bevat gewoon nog het verwijderde id).

- [ ] **Step 3: Schrijf het migratiebestand**

`db/migrations/2026-08-11-06-kunstwerk-oude-relatiekolommen-weg.sql`:

```sql
-- Verwijdert de vijf JSON-arrays van kunstwerken nu de koppeltabellen (migraties
-- 2026-08-11-01 t/m 05) en de code die ze gebruikt (deze commit) klaar zijn.
-- Ontwerp: docs/superpowers/specs/2026-08-11-kunstwerk-relaties-koppeltabellen-design.md
--
-- Uitrolvolgorde: eerst deze migratie, dan de code in deze commit deployen, dan
-- herstarten. Tussen migratie en herstart leest de nog draaiende oude code kolommen
-- die niet meer bestaan (ER_BAD_FIELD_ERROR) -- dat venster moet daarom kort zijn,
-- zelfde bewust geaccepteerde patroon als eerdere migraties in dit project.
ALTER TABLE kunstwerken DROP COLUMN segmentIds;
ALTER TABLE kunstwerken DROP COLUMN materiaalIds;
ALTER TABLE kunstwerken DROP COLUMN maatIds;
ALTER TABLE kunstwerken DROP COLUMN stijlIds;
ALTER TABLE kunstwerken DROP COLUMN onderwerpIds;
```

- [ ] **Step 4: Werk `db/schema.sql` bij**

In `CREATE TABLE kunstwerken`, verwijder de vijf regels `segmentIds JSON,`, `materiaalIds JSON,`, `maatIds JSON,`, `stijlIds JSON,`, `onderwerpIds JSON,`.

- [ ] **Step 5: Werk `tableColumns.ts` en `kunstwerkCode.ts` bij**

In `src/lib/server/tableColumns.ts`, in `TABLE_COLUMNS.kunstwerken`, verwijder de vijf entries `'segmentIds'`, `'materiaalIds'`, `'maatIds'`, `'stijlIds'`, `'onderwerpIds'` (de lijst houdt over: `['id', 'foto', 'code', 'kunstenaarnr', 'formaat', 'omschrijvingNl', 'omschrijvingFr', 'omschrijvingDe', 'omschrijvingEn', 'aiGegenereerd', 'prijsPerM2']`).

In `src/lib/server/kunstwerkCode.ts`, verwijder de hele `KUNSTWERKEN_JSON_COLUMNS`-export (regel 4-10).

- [ ] **Step 6: Pas de migratie toe op staging**

```bash
npm run db:migrate -- staging
```

Verwacht: `2026-08-11-06-kunstwerk-oude-relatiekolommen-weg.sql (5 statements)`, alle vijf `gelukt`. Vanaf hier faalt `npx vitest run` op elk bestand dat de oude kolommen nog aanraakt (`ER_BAD_FIELD_ERROR`) totdat de volgende stappen dat oplossen — verwacht, niet een teken dat er iets mis is.

- [ ] **Step 7: Zet `src/app/api/kunstwerken/route.ts` om**

```ts
import { NextResponse } from 'next/server';
import { listRows, insertRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { withApiErrorHandling, withMedewerker } from '@/lib/server/apiRoute';
import { codeIsInGebruik, codeKomtVoorInBestelling, isDuplicateCodeError } from '@/lib/server/kunstwerkCode';
import {
  DuplicateRelatieError,
  haalRelatiesOp,
  haalRelatiesOpVoorEen,
  scheidRelaties,
  vervangRelaties,
} from '@/lib/server/kunstwerkRelaties';

// Kunstwerken had een generieke CRUD-route via /api/[resource], maar heeft er drie
// eigen regels bij: een unieke code, een code die vastligt zodra er besteld is, en
// een verwijderslot. Dat is precies waarvoor CLAUDE.md de eigen-route-conventie
// beschrijft (klanten, kunstenaars en drukkers hebben die al).

// Publiek leesbaar, net als voorheen: de collectiepagina van de winkel haalt dit op
// zonder sessie.
export const GET = withApiErrorHandling('GET /api/kunstwerken', async () => {
  const rows = await listRows<{ id: string }>('kunstwerken');
  const relatiesPerKunstwerk = await haalRelatiesOp(
    getPool(),
    rows.map((row) => row.id)
  );
  const result = rows.map((row) => ({ ...row, ...relatiesPerKunstwerk.get(row.id) }));
  return NextResponse.json(result);
});

export const POST = withMedewerker('POST /api/kunstwerken', async (request: Request) => {
  const data = (await request.json()) as Record<string, unknown>;
  const code = typeof data.code === 'string' ? data.code.trim() : '';
  if (!code) {
    return NextResponse.json({ error: 'code-verplicht' }, { status: 400 });
  }
  // Ook een code die op dit moment op géén kunstwerk staat, maar al wel in bestellines
  // voorkomt, is bezet: het is de vrijgekomen code van een eerder verwijderd kunstwerk.
  // Wordt die code hier zonder controle uitgegeven, dan wijst de historische bestelregel
  // straks stil naar het verkeerde werk -- zie het commentaar bij DELETE
  // /api/kunstwerken/[id] voor waarom die controle hier moet staan en niet daar.
  if ((await codeIsInGebruik(code, null)) || (await codeKomtVoorInBestelling(code))) {
    return NextResponse.json({ error: 'code-bestaat-al' }, { status: 409 });
  }

  const { relaties, rest } = scheidRelaties(data);
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const created = await insertRow<{ id: string }>('kunstwerken', { ...rest, code }, [], connection);
    await vervangRelaties(connection, created.id, relaties);
    await connection.commit();
    const volledig = await haalRelatiesOpVoorEen(getPool(), created.id);
    return NextResponse.json({ ...created, ...volledig }, { status: 201 });
  } catch (error) {
    await connection.rollback();
    if (isDuplicateCodeError(error)) {
      return NextResponse.json({ error: 'code-bestaat-al' }, { status: 409 });
    }
    if (error instanceof DuplicateRelatieError) {
      return NextResponse.json({ error: 'dubbele-relatie', kolom: error.kolom }, { status: 400 });
    }
    throw error;
  } finally {
    connection.release();
  }
});
```

- [ ] **Step 8: Zet `src/app/api/kunstwerken/[id]/route.ts` om**

Vervang de imports bovenaan:

```ts
import { NextResponse } from 'next/server';
import { getRow, updateRow, deleteRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { withApiErrorHandling, withMedewerker } from '@/lib/server/apiRoute';
import {
  codeIsInGebruik,
  codeKomtVoorInBestelling,
  codeKomtVoorInBestellingForUpdate,
  isDuplicateCodeError,
} from '@/lib/server/kunstwerkCode';
import {
  DuplicateRelatieError,
  haalRelatiesOpVoorEen,
  scheidRelaties,
  vervangRelaties,
} from '@/lib/server/kunstwerkRelaties';
```

Vervang `GET`:

```ts
export const GET = withApiErrorHandling(
  'GET /api/kunstwerken/[id]',
  async (_request: Request, { params }: { params: { id: string } }) => {
    const row = await getRow<{ id: string }>('kunstwerken', params.id);
    if (!row) return NextResponse.json({ error: 'not-found' }, { status: 404 });
    const relaties = await haalRelatiesOpVoorEen(getPool(), params.id);
    return NextResponse.json({ ...row, ...relaties });
  }
);
```

Vervang `PATCH` (de code-uniciteitslogica in het midden blijft ongewijzigd — alleen het stuk vóór en ná):

```ts
export const PATCH = withMedewerker(
  'PATCH /api/kunstwerken/[id]',
  async (request: Request, { params }: { params: { id: string } }) => {
    const bestaand = await getRow<{ code: string }>('kunstwerken', params.id);
    if (!bestaand) return NextResponse.json({ error: 'not-found' }, { status: 404 });

    const data = (await request.json()) as Record<string, unknown>;
    if ('code' in data) {
      if (typeof data.code !== 'string' || !data.code.trim()) {
        return NextResponse.json({ error: 'code-verplicht' }, { status: 400 });
      }
      const nieuweCode = data.code.trim();
      if (nieuweCode !== bestaand.code) {
        if (await codeKomtVoorInBestelling(bestaand.code)) {
          return NextResponse.json({ error: 'code-in-bestelling' }, { status: 409 });
        }
        if ((await codeIsInGebruik(nieuweCode, params.id)) || (await codeKomtVoorInBestelling(nieuweCode))) {
          return NextResponse.json({ error: 'code-bestaat-al' }, { status: 409 });
        }
      }
      data.code = nieuweCode;
    }

    const { relaties, rest } = scheidRelaties(data);
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      if (Object.keys(rest).length > 0) {
        await updateRow('kunstwerken', params.id, rest, [], connection);
      }
      await vervangRelaties(connection, params.id, relaties);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      if (isDuplicateCodeError(error)) {
        return NextResponse.json({ error: 'code-bestaat-al' }, { status: 409 });
      }
      if (error instanceof DuplicateRelatieError) {
        return NextResponse.json({ error: 'dubbele-relatie', kolom: error.kolom }, { status: 400 });
      }
      throw error;
    } finally {
      connection.release();
    }
    return NextResponse.json({ ok: true });
  }
);
```

`DELETE` blijft ongewijzigd — `ON DELETE CASCADE` op `kunstwerkId` in alle vijf koppeltabellen ruimt de koppelrijen vanzelf op.

- [ ] **Step 9: Zet `berekenPrijzenVoorAlleKunstwerken` in `prijsmodule.ts` om**

Voeg de import toe:

```ts
import { haalRelatiesOp } from './kunstwerkRelaties';
```

Vervang de eerste twee regels van `berekenPrijzenVoorAlleKunstwerken` en het gebruik van `materiaalIds`/`maatIds` verderop:

```ts
export async function berekenPrijzenVoorAlleKunstwerken(
  db: Queryable,
  klantId: string | null = null
): Promise<Record<string, PrijsCombinatie[]>> {
  const [kunstwerkRows] = await db.query('SELECT id, kunstenaarnr FROM kunstwerken');
  const kunstwerkIds = (kunstwerkRows as Array<{ id: string }>).map((row) => row.id);
  const relatiesPerKunstwerk = await haalRelatiesOp(db, kunstwerkIds);
  const [matrixRows] = await db.query('SELECT maatId, materiaalId, prijs FROM prijsmatrix WHERE prijs IS NOT NULL');
  const matrixByKey = new Map<string, number>();
  for (const row of matrixRows as Array<{ maatId: string; materiaalId: string; prijs: string }>) {
    matrixByKey.set(`${row.maatId}:${row.materiaalId}`, Number(row.prijs));
  }
  const [afsprakenRows] = await db.query(
    `SELECT k.kunstenaarnr, a.prijsopslag
     FROM kunstenaarAfspraken a
     JOIN kunstenaars k ON k.id = a.id`
  );
  const opslagByKunstenaarnr = new Map<string, number>();
  for (const row of afsprakenRows as Array<{ kunstenaarnr: string; prijsopslag: string | null }>) {
    opslagByKunstenaarnr.set(row.kunstenaarnr, row.prijsopslag != null ? Number(row.prijsopslag) : 0);
  }
  const prijsgroep = await prijsgroepVoorKlant(db, klantId);

  const result: Record<string, PrijsCombinatie[]> = {};
  for (const row of kunstwerkRows as Array<{ id: string; kunstenaarnr: string | null }>) {
    // relatiesPerKunstwerk is opgebouwd uit exact kunstwerkIds (zie hierboven), dus row.id
    // staat er altijd in -- de niet-undefined-assertion is hier terecht, geen aanname.
    const { materiaalIds, maatIds } = relatiesPerKunstwerk.get(row.id)!;
    const opslag = row.kunstenaarnr ? opslagByKunstenaarnr.get(row.kunstenaarnr) ?? 0 : 0;
    const combinaties: PrijsCombinatie[] = [];
    for (const materiaalId of materiaalIds) {
      for (const maatId of maatIds) {
        const basisPrijs = matrixByKey.get(`${maatId}:${materiaalId}`);
        if (basisPrijs === undefined) continue;
        const prijs = pasPrijsgroepToe(combineerPrijs(basisPrijs, opslag), prijsgroep);
        combinaties.push({ maatId, materiaalId, prijs });
      }
    }
    result[row.id] = combinaties;
  }
  return result;
}
```

`berekenPrijzenVoorCombinaties` en `berekenBestellijnPrijs` blijven ongewijzigd — die ontvangen `materiaalIds`/`maatIds` al als parameter, niet uit de database.

- [ ] **Step 10: Zet de bestelregel-validatie in `src/app/api/bestelheaders/route.ts` om**

Voeg de import toe:

```ts
import { haalRelatiesOpVoorEen } from '@/lib/server/kunstwerkRelaties';
```

Vervang de kunstwerk-lookup binnen de `for (const line of lines)`-lus:

```ts
      const [kunstwerkRows] = await connection.query(
        'SELECT code, kunstenaarnr, prijsPerM2 FROM kunstwerken WHERE id = ?',
        [line.kunstwerkId]
      );
      const kunstwerkRow = (
        kunstwerkRows as Array<{
          code: string;
          kunstenaarnr: string | null;
          prijsPerM2: string | null;
        }>
      )[0];
      if (!kunstwerkRow) {
        await connection.rollback();
        return NextResponse.json({ error: 'kunstwerk-not-found' }, { status: 400 });
      }
      const { maatIds, materiaalIds } = await haalRelatiesOpVoorEen(connection, line.kunstwerkId);
```

De rest van de lus (de `materiaalIds`/`maatIds`-validatie, `berekenBestellijnPrijs`-aanroep) blijft ongewijzigd — die gebruikt de nu al opgeloste `maatIds`/`materiaalIds`-variabelen op precies dezelfde manier als voorheen.

- [ ] **Step 11: Verwijder de tijdelijke backfill-verificatietest uit taak 1**

```bash
git rm tests/lib/server/kunstwerkRelatiesBackfill.test.ts
```

Deze test vergeleek de koppeltabellen tegen `kunstwerken.segmentIds` enz., die na Step 6 niet meer bestaan.

- [ ] **Step 12: Draai de nieuwe en direct geraakte tests**

```bash
npx vitest run tests/app/api/kunstwerk-relaties.test.ts
npx vitest run tests/lib/server/prijsmodule.test.ts
npx vitest run tests/app/api/bestelheaders.test.ts
npx vitest run tests/app/api/kunstwerk-code.test.ts
npx tsc --noEmit
```

Verwacht op dit punt: `kunstwerk-relaties.test.ts` en `kunstwerk-code.test.ts` PASS (dat laatste bestand raakt geen van de vijf relatiekolommen rechtstreeks aan). `prijsmodule.test.ts` en `bestelheaders.test.ts` bevatten fixtures die de oude kolommen rechtstreeks aanmaken (`insertRow('kunstwerken', { materiaalIds: [...] }, ['materiaalIds', 'maatIds'])`) — die FAILEN nu met "Onbekende kolom(men) voor tabel kunstwerken: materiaalIds, maatIds" uit `controleerKolommen`. Dat is taak 4. `tsc` moet wel exit 0 geven (dit zijn runtime-fouten, geen type-fouten — de fixtures gebruiken `as never` om de allowlist-typing te omzeilen, precies zoals de rest van de suite dat al doet).

- [ ] **Step 13: Commit**

```bash
git add db/migrations/2026-08-11-06-kunstwerk-oude-relatiekolommen-weg.sql db/schema.sql src/lib/server/tableColumns.ts src/lib/server/kunstwerkCode.ts src/app/api/kunstwerken/route.ts src/app/api/kunstwerken/[id]/route.ts src/lib/server/prijsmodule.ts src/app/api/bestelheaders/route.ts tests/app/api/kunstwerk-relaties.test.ts tests/lib/server/kunstwerkRelatiesBackfill.test.ts
git commit -m "feat: kunstwerken-routes/prijsmodule/bestelheaders gebruiken kunstwerkRelaties, oude JSON-kolommen weg"
```

---

### Task 4: Resterende testfixtures, volledige suite, regressiesuite

**Files:**
- Modify: `tests/lib/server/prijsmodule.test.ts`
- Modify: `tests/app/api/kunstwerken-prijzen.test.ts`
- Modify: `tests/regression/staging-scenarios.test.ts`
- Modify: elk ander testbestand dat een kunstwerk-fixture rechtstreeks met een van de vijf oude kolommen aanmaakt (gevonden via de grep in Step 1 — geen andere kandidaten bekend op het moment van schrijven, maar de grep is de bron van waarheid)

**Interfaces:**
- Consumes: `vervangRelaties` uit taak 2, voor testfixtures die een kunstwerk met relaties buiten de API om moeten opzetten.

- [ ] **Step 1: Vind elke resterende directe fixture**

```bash
grep -rn "materiaalIds\|maatIds\|segmentIds\|stijlIds\|onderwerpIds" tests/ --include=*.test.ts --include=*.test.tsx
```

Deze grep geeft veel treffers die **niet** aangepast hoeven te worden — onderscheid ze zo:

- **Wél aanpassen:** een rechtstreekse `insertRow('kunstwerken', { ...Ids: [...] }, ['...Ids', ...])`
  (buiten de API om), of rechtstreekse SQL zoals `SELECT segmentIds FROM kunstwerken`. Deze
  raken de opslagvorm zelf, die na taak 3 niet meer bestaat.
- **Niet aanpassen:** een request-body naar de échte route (`postRequest`/`req('POST', {
  segmentIds: [...] }, ...)`, zoals `tests/regression/staging-scenarios.test.ts` rond regel
  917-930 doet) — de API accepteert dit nog steeds identiek. Ook niet aanpassen: een los object
  dat de vorm van een API-*response* nabootst als invoer voor een pure functie die niets met de
  database te maken heeft (bijvoorbeeld het `kunstwerken: [{ ..., segmentIds: [], materiaalIds:
  [...], ... }]`-argument van `buildDrukkerMail(...)` rond regel 451 van hetzelfde bestand) —
  die vorm blijft exact hetzelfde, want de API-contractvorm verandert niet (ontwerp, beslissing 4).
- Bevestig bij twijfel met: staat er een `insertRow`/rechtstreekse SQL-query vlak boven de
  treffer, of gaat het om een aanroep van een geïmporteerde routehandler / een pure functie?

- [ ] **Step 2: Werk `tests/lib/server/prijsmodule.test.ts` bij (het duidelijkste voorbeeld)**

Rond regel 199-215 staat:

```ts
  it('computes prijzen only for a kunstwerk\'s own materiaalIds x maatIds, including its kunstenaar opslag', async () => {
    // ... kunstenaarnr, materiaalId, maatId eerder in de test opgezet ...
    const kunstwerk = await insertRow<{ id: string }>(
      'kunstwerken',
      { code: 'test-prijsmodule-basis', kunstenaarnr, materiaalIds: [materiaalId], maatIds: [maatId] } as never,
      ['materiaalIds', 'maatIds']
    );
```

Vervang door: maak het kunstwerk zonder de relatiekolommen, koppel daarna via `vervangRelaties`:

```ts
  it('computes prijzen only for a kunstwerk\'s own materiaalIds x maatIds, including its kunstenaar opslag', async () => {
    // ... kunstenaarnr, materiaalId, maatId eerder in de test opgezet ...
    const kunstwerk = await insertRow<{ id: string }>('kunstwerken', {
      code: 'test-prijsmodule-basis',
      kunstenaarnr,
    } as never);
    await vervangRelaties(getPool(), kunstwerk.id, { materiaalIds: [materiaalId], maatIds: [maatId] });
```

Voeg de import toe bovenaan het bestand:

```ts
import { vervangRelaties } from '@/lib/server/kunstwerkRelaties';
```

Pas hetzelfde patroon toe op de twee andere directe fixtures in dit bestand:
- Rond regel 218-222 (`test-prijsmodule-maatloos`, `maatIds: [], materiaalIds: []`): het kunstwerk aanmaken zonder relatiekolommen is hier voldoende — `vervangRelaties` met lege arrays hoeft niet aangeroepen te worden, want 0 koppelrijen is toch al de staat na een kale `insertRow`. Verwijder dus gewoon `materiaalIds: [], maatIds: []` en de derde parameter (`['materiaalIds', 'maatIds']`) uit die `insertRow`-aanroep.
- Rond regel 238-240 (`test-prijsmodule-korting`): zelfde vervanging als het eerste voorbeeld hierboven.

- [ ] **Step 3: Draai `prijsmodule.test.ts` en fix wat nog rood is**

```bash
npx vitest run tests/lib/server/prijsmodule.test.ts
```

Verwacht na Step 2: PASS. Faalt een test nog, is de oorzaak vrijwel zeker een resterende directe `materiaalIds`/`maatIds`-kolom in een `insertRow`-aanroep die Step 1's grep niet als "hoort aangepast" herkende — pas toe volgens hetzelfde patroon (aanmaken zonder relatiekolommen, dan `vervangRelaties` als de test niet-lege relaties nodig heeft).

- [ ] **Step 4: Werk `tests/app/api/kunstwerken-prijzen.test.ts` bij**

Twee directe fixtures, zelfde eenvoudige vorm als Step 2's eerste voorbeeld. Rond regel 99-103:

```ts
    const kunstwerk = await insertRow<{ id: string }>(
      'kunstwerken',
      { code: 'test-prijzen-bulk', materiaalIds: [materiaalId], maatIds: [maatId] } as never,
      ['materiaalIds', 'maatIds']
    );
```

wordt:

```ts
    const kunstwerk = await insertRow<{ id: string }>('kunstwerken', { code: 'test-prijzen-bulk' } as never);
    await vervangRelaties(getPool(), kunstwerk.id, { materiaalIds: [materiaalId], maatIds: [maatId] });
```

Rond regel 120-124, zelfde vervanging met `code: 'test-prijzen-bulk-korting'`. Voeg de import
`import { vervangRelaties } from '@/lib/server/kunstwerkRelaties';` toe. Draai:

```bash
npx vitest run tests/app/api/kunstwerken-prijzen.test.ts
```

Verwacht: PASS.

- [ ] **Step 5: Werk `tests/app/api/bestelheaders.test.ts` bij**

Zeven directe fixtures, dezelfde vorm als Step 4 (rond de regels 150-156, 276-279, 306-309,
333-336, 437-440, 625-628, 668-671 op het moment van schrijven — regelnummers kunnen verschoven
zijn, zoek op de teksten `materiaalIds: [materiaalId]`/`materiaalIds: []`). Rond regel 150-156:

```ts
    const kunstwerk = await insertRow<{ id: string }>(
      'kunstwerken',
      {
        code: 'test-bestelheaders-basis',
        materiaalIds: [materiaalId],
        maatIds: [maatId],
      } as never,
      ['materiaalIds', 'maatIds']
    );
```

wordt:

```ts
    const kunstwerk = await insertRow<{ id: string }>('kunstwerken', {
      code: 'test-bestelheaders-basis',
    } as never);
    await vervangRelaties(getPool(), kunstwerk.id, { materiaalIds: [materiaalId], maatIds: [maatId] });
```

(De exacte codewaarde en variabelenamen verschillen per fixture — pas de code-string en de
meegegeven `materiaalId`/`maatId`-variabelen aan naar wat op die regel al stond; de structuur van
de vervanging is voor alle zeven identiek.) Rond regel 306-309 en 668-671 (`maatloos`,
`materiaalIds: [], maatIds: [], prijsPerM2: 100`) is een `vervangRelaties`-aanroep niet nodig —
0 koppelrijen is toch al de staat na een kale `insertRow`; verwijder daar alleen `materiaalIds:
[], maatIds: []` en het derde `insertRow`-argument. Voeg de import
`import { vervangRelaties } from '@/lib/server/kunstwerkRelaties';` toe. Draai:

```bash
npx vitest run tests/app/api/bestelheaders.test.ts
```

Verwacht: PASS.

- [ ] **Step 6: Werk `tests/regression/staging-scenarios.test.ts` bij**

Dit bestand heeft zeven directe `insertRow('kunstwerken', { ...materiaalIds, maatIds... },
['materiaalIds', 'maatIds'])`-fixtures (rond de regels 182-191, 287-290, 396-399, 663-664,
785-786, 993-996, 1056-1057 op het moment van schrijven — regelnummers kunnen verschoven zijn,
zoek op de tekst). Elke ervan volgt exact hetzelfde patroon als Step 4 hierboven: `insertRow`
zonder de relatiekolommen, gevolgd door een `vervangRelaties`-aanroep met dezelfde waarden die
eerst als derde argument van `insertRow` meegingen. Bijvoorbeeld regel 182-191 wordt:

```ts
      const kunstwerk = await insertRow<{ id: string }>('kunstwerken', {
        code: 'AUTOTEST Kunstwerk Exclusief',
        kunstenaarnr,
      } as never);
      await vervangRelaties(getPool(), kunstwerk.id, {
        materiaalIds: [fixture.materiaalId],
        maatIds: [fixture.maatId],
      });
```

Pas dezelfde vervanging toe op elk van de overige zes fixtures (elk heeft dezelfde vorm: een
`insertRow('kunstwerken', {... materiaalIds, maatIds}, ['materiaalIds', 'maatIds'])`-aanroep die
splitst in een kale `insertRow` plus een `vervangRelaties`-aanroep met exact de waarden die eerst
in de `insertRow`-body stonden). Voeg de import toe als hij nog niet aanwezig is.

**Niet aanpassen** (zie Step 1): de `req('POST', { segmentIds: [...], ... }, staff)`-aanroep rond
regel 917-930 (gaat via de echte route, contract ongewijzigd) en het `buildDrukkerMail(...)
kunstwerken: [{ ... segmentIds: [], materiaalIds: [...], ... }]`-argument rond regel 451 (pure
functie-input, geen database-fixture).

**Wél aanpassen:** de rechtstreekse SQL-query rond regel 948-956:

```ts
      const [rows] = await getPool().query(
        'SELECT segmentIds, stijlIds, onderwerpIds FROM kunstwerken WHERE id = ?',
        [kunstwerkId]
      );
      const row = (rows as Array<{ segmentIds: string | string[]; stijlIds: string | string[]; onderwerpIds: string | string[] }>)[0];
      const parse = (v: string | string[]) => (typeof v === 'string' ? JSON.parse(v) : v);
      expect(parse(row.segmentIds)).toEqual([segmentId]);
      expect(parse(row.stijlIds)).toEqual([stijlId]);
      expect(parse(row.onderwerpIds)).toEqual([onderwerpId]);
```

wordt:

```ts
      const relaties = await haalRelatiesOpVoorEen(getPool(), kunstwerkId);
      expect(relaties.segmentIds).toEqual([segmentId]);
      expect(relaties.stijlIds).toEqual([stijlId]);
      expect(relaties.onderwerpIds).toEqual([onderwerpId]);
```

Voeg `haalRelatiesOpVoorEen` toe aan de `vervangRelaties`-import. Draai:

```bash
npx vitest run tests/regression/staging-scenarios.test.ts
```

Faalt hier nog iets op een resterende directe kolomverwijzing die deze stap niet noemt, zoek hem
op via de foutmelding (`Onbekende kolom(men)` of `ER_BAD_FIELD_ERROR`) en pas hem toe volgens
hetzelfde `insertRow`-zonder-relaties-plus-`vervangRelaties`-patroon.

- [ ] **Step 7: Draai de volledige suite en de regressiesuite**

```bash
npx tsc --noEmit
npm test
npm run test:regression
```

Verwacht: `tsc` exit 0, alle tests PASS, regressiesuite PASS. Faalt de regressiesuite op een resterende directe kolomverwijzing, zoek hem op met dezelfde `vervangRelaties`-vertaling als hierboven.

- [ ] **Step 8: Commit**

```bash
git add tests/
git commit -m "test: resterende kunstwerk-fixtures overzetten naar de koppeltabellen"
```

- [ ] **Step 9: Staging-verificatie**

Deploy naar staging, herstart, en controleer handmatig:
- Een kunstwerk aanmaken/bewerken in beheer (segment/materiaal/maat/stijl/onderwerp-checkboxes).
- De collectiepagina (filtering per segment/stijl/onderwerp) en een productdetail (materiaal-/maatkeuze, standaardselectie op index 0).
- Een segment/stijl/onderwerp/materiaal/maat verwijderen die nog aan een kunstwerk gekoppeld is — de koppeling verdwijnt, het kunstwerk blijft bestaan (CASCADE-gedrag zichtbaar maken, zoals bij het testen in Task 3).

Promoveren naar productie volgt de standaardprocedure uit `CLAUDE.md` (toestemming vragen, `npm run db:migrate -- productie --confirm`, dan de versie promoveren) — `kunstwerken` heeft daar vandaag 0 rijen, dus geen backfill-risico, wel dezelfde migratievolgorde.
