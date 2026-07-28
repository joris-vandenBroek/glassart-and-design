# Firebase → MySQL Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Firebase (Firestore + Auth) entirely with a MySQL database and a self-built Node.js/Next.js API + session-auth layer, hosted on mijn.host, per `docs/superpowers/specs/2026-07-23-firebase-to-mysql-migration-design.md`.

**Architecture:** Next.js moves from static export to server mode. New API route handlers under `src/app/api/**` talk to MySQL via raw `mysql2` queries (no ORM). Client-side, `useFirestoreCollection`/`useFirestoreDocument`/`useCustomerAuth`/`useAdminAuth` are replaced by same-interface hooks (`useApiCollection`/`useApiRecord`/new auth hooks) backed by `fetch()`, so most consuming components need no changes at all.

**Tech Stack:** Next.js 14.2 (App Router), TypeScript, `mysql2` (new dependency), Node's built-in `crypto` (scrypt for password hashing, randomUUID for IDs), Vitest + Testing Library (existing).

## Global Constraints

- No ORM, no query builder, no validation library, no `bcrypt` package — only `mysql2` is a new dependency (per the approved design's Approach A: minimal stack, no native-binary risk on mijn.host).
- MySQL column names are camelCase, matching JS field names 1:1 (no snake_case mapping layer).
- All table primary keys are `CHAR(36)` UUIDs generated via `crypto.randomUUID()`.
- Auth is session-based (httpOnly cookie + `sessions` table), never JWT.
- Password hashing via Node's built-in `crypto.scrypt`, format stored as `salt:hash` (both hex).
- API routes return `{ error: string }` on failure with the correct HTTP status; raw SQL errors are logged server-side only, never sent to the client.
- Client hooks preserve the existing `'load' | 'action' | null` error-code contract used throughout the codebase.
- Data migration is scoped to exactly two sources: `instellingen/bedrijfsgegevens` (full document) and `medewerkers` (profile fields only — **not** passwords). Every other collection starts empty in MySQL.
- No local database: both interactive development and the automated test suite run against **one shared staging database on mijn.host** (`glassart_staging`), reached via Remote MySQL access — there is no separate local or throwaway-test database. Tests freely wiping/reseeding staging tables is accepted (matches the existing Firestore-staging behavior of auto-reseeding empty collections). A separate `glassart_prod` database (Task 25) is never touched by tests.

---

## Task 1: mijn.host staging database + connection pool

**Files:**
- Create: `.env.local.example`
- Create: `src/lib/server/db.ts`
- Test: `tests/lib/server/db.test.ts`

**Interfaces:**
- Produces: `getPool(): mysql2.Pool` — a singleton connection pool, reading `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` from `process.env`.

- [ ] **Step 1: Install mysql2**

Run:
```bash
npm install mysql2
```

- [ ] **Step 2: Create the staging database on mijn.host and allow remote access**

In DirectAdmin ("Databases"), create a new database (e.g. `glassart_staging`, likely prefixed by DirectAdmin to something like `dv137864_staging`) and a dedicated database user with a strong password. Note the exact database name, username, and password.

Open that database's **Access Hosts** (Remote MySQL) setting and add your current public IP address (find it at whatismyip.com or similar) — not the `%` wildcard, per mijn.host's own guidance. If your ISP gives you a dynamic IP, you'll need to update this whenever it changes and `pool.query` starts failing with a connection-refused error.

Note the MySQL hostname shown in DirectAdmin's database overview (usually the server's own hostname, e.g. `h64.mijn.host`) — this is your `DB_HOST`, not `127.0.0.1`.

- [ ] **Step 3: Write `.env.local.example`**

```
DB_HOST=h64.mijn.host
DB_PORT=3306
DB_USER=dv137864_staging
DB_PASSWORD=changeme
DB_NAME=dv137864_staging
```

Copy this to `.env.local` (gitignored) with your real staging database values from Step 2.

- [ ] **Step 4: Write the failing test**

```typescript
// tests/lib/server/db.test.ts
import { describe, expect, it } from 'vitest';
import { getPool } from '@/lib/server/db';

describe('getPool', () => {
  it('returns a pool that can run a trivial query', async () => {
    const pool = getPool();
    const [rows] = await pool.query('SELECT 1 AS value');
    expect((rows as Array<{ value: number }>)[0].value).toBe(1);
  });

  it('returns the same pool instance on repeated calls', () => {
    expect(getPool()).toBe(getPool());
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx vitest run tests/lib/server/db.test.ts`
Expected: FAIL — `Cannot find module '@/lib/server/db'`

- [ ] **Step 6: Implement the connection pool**

```typescript
// src/lib/server/db.ts
import mysql from 'mysql2/promise';

let pool: mysql.Pool | null = null;

export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
    });
  }
  return pool;
}
```

- [ ] **Step 7: Load env vars in Vitest config and run the test**

Modify `vitest.config.ts` to load `.env.local` for tests:

```typescript
// tests/setup.ts — add at the top (existing file, insert these two lines)
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
```

Run: `npm install --save-dev dotenv && npx vitest run tests/lib/server/db.test.ts`
Expected: PASS (requires the staging database from Step 2 to be reachable — check your IP is still whitelisted in Access Hosts if this fails with a connection error)

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .env.local.example src/lib/server/db.ts tests/lib/server/db.test.ts tests/setup.ts
git commit -m "feat: add MySQL connection pool pointed at mijn.host staging database"
```

---

## Task 2: Full database schema

**Files:**
- Create: `db/schema.sql`

**Interfaces:**
- Produces: every table referenced by all later tasks (see table list below).

- [ ] **Step 1: Write the schema file**

```sql
-- db/schema.sql
CREATE TABLE klanten (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  wachtwoordHash VARCHAR(255) NOT NULL,
  companyName VARCHAR(255),
  kvk VARCHAR(50),
  contactPerson VARCHAR(255),
  phone VARCHAR(50),
  contactPreference VARCHAR(50),
  address VARCHAR(255),
  postcode VARCHAR(20),
  city VARCHAR(255),
  deliveryAddress VARCHAR(255),
  deliveryPostcode VARCHAR(20),
  deliveryCity VARCHAR(255),
  invoiceAddress VARCHAR(255),
  invoicePostcode VARCHAR(20),
  invoiceCity VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'Beoordelen',
  prijsgroepId CHAR(36),
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE medewerkers (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  wachtwoordHash VARCHAR(255) NOT NULL,
  naam VARCHAR(255),
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE sessions (
  id CHAR(36) PRIMARY KEY,
  userType ENUM('klant','medewerker') NOT NULL,
  userId CHAR(36) NOT NULL,
  expiresAt TIMESTAMP NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE passwordResetTokens (
  token CHAR(36) PRIMARY KEY,
  userType ENUM('klant','medewerker') NOT NULL,
  userId CHAR(36) NOT NULL,
  expiresAt TIMESTAMP NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE segmenten (
  id CHAR(36) PRIMARY KEY,
  omschrijving VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE materiaalsoorten (
  id CHAR(36) PRIMARY KEY,
  omschrijving VARCHAR(255) NOT NULL,
  staatEigenMaatToe BOOLEAN DEFAULT FALSE,
  maxBreedte INT,
  maxHoogte INT,
  levertijdMaandenEigenMaat INT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE materialen (
  id CHAR(36) PRIMARY KEY,
  materiaalsoortId CHAR(36) NOT NULL,
  materiaaldikte DECIMAL(5,1) NOT NULL,
  omschrijving VARCHAR(255) NOT NULL,
  FOREIGN KEY (materiaalsoortId) REFERENCES materiaalsoorten(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE maten (
  id CHAR(36) PRIMARY KEY,
  breedte INT NOT NULL,
  hoogte INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE prijsgroepen (
  id CHAR(36) PRIMARY KEY,
  naam VARCHAR(255) NOT NULL,
  kortingspercentage DECIMAL(5,2) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE kunstwerken (
  id CHAR(36) PRIMARY KEY,
  foto VARCHAR(500),
  naam VARCHAR(255) NOT NULL DEFAULT '',
  artiest VARCHAR(255) NOT NULL DEFAULT '',
  omschrijvingNl TEXT,
  omschrijvingFr TEXT,
  omschrijvingDe TEXT,
  omschrijvingEn TEXT,
  segmentIds JSON,
  materiaalIds JSON,
  maatIds JSON,
  prijzen JSON
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE instellingen (
  id VARCHAR(50) PRIMARY KEY,
  data JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE counters (
  id VARCHAR(50) PRIMARY KEY,
  value INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO counters (id, value) VALUES ('bestelnummer', 0);

CREATE TABLE bestelheaders (
  id CHAR(36) PRIMARY KEY,
  klantId CHAR(36) NOT NULL,
  bestelnr VARCHAR(20) NOT NULL,
  besteldatum TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) NOT NULL DEFAULT 'Te beoordelen',
  FOREIGN KEY (klantId) REFERENCES klanten(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE bestellines (
  id CHAR(36) PRIMARY KEY,
  bestelheaderId CHAR(36) NOT NULL,
  kunstwerkId CHAR(36),
  maatId CHAR(36),
  materiaalId CHAR(36),
  prijs DECIMAL(10,2),
  quantity INT NOT NULL DEFAULT 1,
  breedte INT,
  hoogte INT,
  FOREIGN KEY (bestelheaderId) REFERENCES bestelheaders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE activiteitenlog (
  id CHAR(36) PRIMARY KEY,
  type VARCHAR(100) NOT NULL,
  actorId CHAR(36),
  actorEmail VARCHAR(255),
  actorNaam VARCHAR(255),
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 2: Apply it to the mijn.host staging database**

Using a local MySQL client (the `mysql` CLI, or a GUI like DBeaver/TablePlus) pointed at the staging database from Task 1, Step 2 — adjust host/user/password/database to match your `.env.local`:
```bash
mysql -hh64.mijn.host -P3306 -udv137864_staging -p dv137864_staging < db/schema.sql
```

- [ ] **Step 3: Verify tables exist**

Run: `mysql -hh64.mijn.host -P3306 -udv137864_staging -p dv137864_staging -e "SHOW TABLES;"`
Expected: 16 tables listed (klanten, medewerkers, sessions, passwordResetTokens, segmenten, materiaalsoorten, materialen, maten, prijsgroepen, kunstwerken, instellingen, counters, bestelheaders, bestellines, activiteitenlog)

- [ ] **Step 4: Commit**

```bash
git add db/schema.sql
git commit -m "feat: add MySQL schema for all tables"
```

---

## Task 3: Generic CRUD query helpers

**Files:**
- Create: `src/lib/server/crud.ts`
- Test: `tests/lib/server/crud.test.ts`

**Interfaces:**
- Consumes: `getPool()` from Task 1.
- Produces:
  - `listRows<T>(table: string, jsonColumns?: string[]): Promise<T[]>`
  - `getRow<T>(table: string, id: string, jsonColumns?: string[]): Promise<T | null>`
  - `insertRow<T extends { id?: string }>(table: string, data: Omit<T, 'id'>, jsonColumns?: string[]): Promise<T>`
  - `updateRow(table: string, id: string, data: Record<string, unknown>, jsonColumns?: string[]): Promise<void>`
  - `deleteRow(table: string, id: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/server/crud.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { listRows, getRow, insertRow, updateRow, deleteRow } from '@/lib/server/crud';

beforeEach(async () => {
  await getPool().query('DELETE FROM segmenten');
});

describe('generic CRUD helpers (against segmenten table)', () => {
  it('inserts and lists a row', async () => {
    const created = await insertRow<{ id: string; omschrijving: string }>('segmenten', {
      omschrijving: 'Hotel',
    });
    expect(created.omschrijving).toBe('Hotel');
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);

    const rows = await listRows<{ id: string; omschrijving: string }>('segmenten');
    expect(rows).toEqual([created]);
  });

  it('gets a single row by id', async () => {
    const created = await insertRow<{ id: string; omschrijving: string }>('segmenten', {
      omschrijving: 'Restaurant',
    });
    const found = await getRow<{ id: string; omschrijving: string }>('segmenten', created.id);
    expect(found).toEqual(created);
  });

  it('returns null when getRow finds nothing', async () => {
    const found = await getRow('segmenten', 'non-existent-id');
    expect(found).toBeNull();
  });

  it('updates a row', async () => {
    const created = await insertRow<{ id: string; omschrijving: string }>('segmenten', {
      omschrijving: 'Kantoor',
    });
    await updateRow('segmenten', created.id, { omschrijving: 'Kantoorpand' });
    const found = await getRow<{ id: string; omschrijving: string }>('segmenten', created.id);
    expect(found?.omschrijving).toBe('Kantoorpand');
  });

  it('deletes a row', async () => {
    const created = await insertRow<{ id: string; omschrijving: string }>('segmenten', {
      omschrijving: 'Winkel',
    });
    await deleteRow('segmenten', created.id);
    const found = await getRow('segmenten', created.id);
    expect(found).toBeNull();
  });

  it('serializes and deserializes JSON columns', async () => {
    await getPool().query('DELETE FROM kunstwerken');
    const created = await insertRow<{ id: string; naam: string; segmentIds: string[] }>(
      'kunstwerken',
      { naam: 'Test', segmentIds: ['a', 'b'] } as never,
      ['segmentIds', 'materiaalIds', 'maatIds', 'prijzen']
    );
    expect(created.segmentIds).toEqual(['a', 'b']);
    const found = await getRow<{ id: string; segmentIds: string[] }>(
      'kunstwerken',
      created.id,
      ['segmentIds', 'materiaalIds', 'maatIds', 'prijzen']
    );
    expect(found?.segmentIds).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/server/crud.test.ts`
Expected: FAIL — `Cannot find module '@/lib/server/crud'`

- [ ] **Step 3: Implement the CRUD helpers**

```typescript
// src/lib/server/crud.ts
import { randomUUID } from 'crypto';
import { getPool } from './db';

function serializeRow(data: Record<string, unknown>, jsonColumns: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    result[key] = jsonColumns.includes(key) && value !== undefined ? JSON.stringify(value) : value;
  }
  return result;
}

function deserializeRow<T>(row: Record<string, unknown>, jsonColumns: string[]): T {
  const result: Record<string, unknown> = { ...row };
  for (const column of jsonColumns) {
    if (result[column] != null && typeof result[column] === 'string') {
      result[column] = JSON.parse(result[column] as string);
    }
  }
  return result as T;
}

export async function listRows<T>(table: string, jsonColumns: string[] = []): Promise<T[]> {
  const [rows] = await getPool().query(`SELECT * FROM \`${table}\``);
  return (rows as Record<string, unknown>[]).map((row) => deserializeRow<T>(row, jsonColumns));
}

export async function getRow<T>(
  table: string,
  id: string,
  jsonColumns: string[] = []
): Promise<T | null> {
  const [rows] = await getPool().query(`SELECT * FROM \`${table}\` WHERE id = ?`, [id]);
  const row = (rows as Record<string, unknown>[])[0];
  return row ? deserializeRow<T>(row, jsonColumns) : null;
}

export async function insertRow<T extends { id?: string }>(
  table: string,
  data: Omit<T, 'id'>,
  jsonColumns: string[] = []
): Promise<T> {
  const id = randomUUID();
  const full = { id, ...data } as Record<string, unknown>;
  const serialized = serializeRow(full, jsonColumns);
  const columns = Object.keys(serialized);
  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map((column) => serialized[column]);
  await getPool().query(
    `INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(', ')}) VALUES (${placeholders})`,
    values
  );
  return full as T;
}

export async function updateRow(
  table: string,
  id: string,
  data: Record<string, unknown>,
  jsonColumns: string[] = []
): Promise<void> {
  const serialized = serializeRow(data, jsonColumns);
  const columns = Object.keys(serialized);
  if (columns.length === 0) return;
  const assignments = columns.map((column) => `\`${column}\` = ?`).join(', ');
  const values = columns.map((column) => serialized[column]);
  await getPool().query(`UPDATE \`${table}\` SET ${assignments} WHERE id = ?`, [...values, id]);
}

export async function deleteRow(table: string, id: string): Promise<void> {
  await getPool().query(`DELETE FROM \`${table}\` WHERE id = ?`, [id]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/server/crud.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/crud.ts tests/lib/server/crud.test.ts
git commit -m "feat: add generic MySQL CRUD helpers"
```

---

## Task 4: Password hashing helpers

**Files:**
- Create: `src/lib/server/password.ts`
- Test: `tests/lib/server/password.test.ts`

**Interfaces:**
- Produces: `hashPassword(password: string): Promise<string>`, `verifyPassword(password: string, stored: string): Promise<boolean>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/server/password.test.ts
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/server/password';

describe('password hashing', () => {
  it('hashes a password and verifies the correct password against it', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(await verifyPassword('correct-horse-battery-staple', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('produces different hashes for the same password (random salt)', async () => {
    const hashA = await hashPassword('same-password');
    const hashB = await hashPassword('same-password');
    expect(hashA).not.toBe(hashB);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/server/password.test.ts`
Expected: FAIL — `Cannot find module '@/lib/server/password'`

- [ ] **Step 3: Implement password hashing**

```typescript
// src/lib/server/password.ts
import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(':');
  if (!salt || !hashHex) return false;
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  const storedKey = Buffer.from(hashHex, 'hex');
  if (derivedKey.length !== storedKey.length) return false;
  return timingSafeEqual(derivedKey, storedKey);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/server/password.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/password.ts tests/lib/server/password.test.ts
git commit -m "feat: add scrypt-based password hashing helpers"
```

---

## Task 5: Session helpers

**Files:**
- Create: `src/lib/server/session.ts`
- Test: `tests/lib/server/session.test.ts`

**Interfaces:**
- Consumes: `getPool()` (Task 1)
- Produces:
  - `createSession(userType: 'klant' | 'medewerker', userId: string): Promise<string>` — returns session id
  - `validateSession(sessionId: string): Promise<{ userType: 'klant' | 'medewerker'; userId: string } | null>`
  - `destroySession(sessionId: string): Promise<void>`
  - `SESSION_COOKIE_NAME = 'session_id'`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/server/session.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { createSession, validateSession, destroySession } from '@/lib/server/session';

beforeEach(async () => {
  await getPool().query('DELETE FROM sessions');
});

describe('sessions', () => {
  it('creates a session and validates it', async () => {
    const sessionId = await createSession('klant', 'klant-123');
    const result = await validateSession(sessionId);
    expect(result).toEqual({ userType: 'klant', userId: 'klant-123' });
  });

  it('returns null for an unknown session id', async () => {
    expect(await validateSession('does-not-exist')).toBeNull();
  });

  it('returns null for an expired session', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    await getPool().query('UPDATE sessions SET expiresAt = NOW() - INTERVAL 1 DAY WHERE id = ?', [
      sessionId,
    ]);
    expect(await validateSession(sessionId)).toBeNull();
  });

  it('destroys a session', async () => {
    const sessionId = await createSession('klant', 'klant-456');
    await destroySession(sessionId);
    expect(await validateSession(sessionId)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/server/session.test.ts`
Expected: FAIL — `Cannot find module '@/lib/server/session'`

- [ ] **Step 3: Implement session helpers**

```typescript
// src/lib/server/session.ts
import { randomUUID } from 'crypto';
import { getPool } from './db';

export const SESSION_COOKIE_NAME = 'session_id';
const SESSION_LIFETIME_DAYS = 30;

export type UserType = 'klant' | 'medewerker';

export async function createSession(userType: UserType, userId: string): Promise<string> {
  const id = randomUUID();
  await getPool().query(
    'INSERT INTO sessions (id, userType, userId, expiresAt) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))',
    [id, userType, userId, SESSION_LIFETIME_DAYS]
  );
  return id;
}

export async function validateSession(
  sessionId: string
): Promise<{ userType: UserType; userId: string } | null> {
  const [rows] = await getPool().query(
    'SELECT userType, userId FROM sessions WHERE id = ? AND expiresAt > NOW()',
    [sessionId]
  );
  const row = (rows as Array<{ userType: UserType; userId: string }>)[0];
  return row ?? null;
}

export async function destroySession(sessionId: string): Promise<void> {
  await getPool().query('DELETE FROM sessions WHERE id = ?', [sessionId]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/server/session.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/session.ts tests/lib/server/session.test.ts
git commit -m "feat: add MySQL-backed session helpers"
```

---

## Task 6: Customer auth API routes (register/login/logout/me)

**Files:**
- Create: `src/app/api/auth/register/route.ts`
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/app/api/auth/me/route.ts`
- Test: `tests/app/api/auth/customer-auth.test.ts`

**Interfaces:**
- Consumes: `insertRow`/`getRow` (Task 3), `hashPassword`/`verifyPassword` (Task 4), `createSession`/`validateSession`/`destroySession`/`SESSION_COOKIE_NAME` (Task 5).
- Produces: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me?type=klant` — the shapes consumed by Task 10's client hooks.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/app/api/auth/customer-auth.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { POST as register } from '@/app/api/auth/register/route';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { GET as me } from '@/app/api/auth/me/route';

function jsonRequest(body: unknown, cookie?: string) {
  return new Request('http://localhost/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  await getPool().query('DELETE FROM klanten');
  await getPool().query('DELETE FROM sessions');
});

describe('customer auth routes', () => {
  it('registers a new klant and returns 201', async () => {
    const response = await register(
      jsonRequest({
        email: 'klant@example.com',
        password: 'wachtwoord123',
        companyName: 'Acme BV',
        contactPerson: 'Jan',
      })
    );
    expect(response.status).toBe(201);
  });

  it('rejects registering the same email twice', async () => {
    await register(jsonRequest({ email: 'dup@example.com', password: 'x', companyName: 'A' }));
    const second = await register(
      jsonRequest({ email: 'dup@example.com', password: 'x', companyName: 'A' })
    );
    expect(second.status).toBe(400);
  });

  it('logs in with correct credentials and sets a session cookie', async () => {
    await register(
      jsonRequest({ email: 'login@example.com', password: 'geheim123', companyName: 'A' })
    );
    const response = await login(jsonRequest({ email: 'login@example.com', password: 'geheim123' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toMatch(/session_id=/);
    const body = await response.json();
    expect(body.status).toBe('Beoordelen');
  });

  it('rejects login with wrong password', async () => {
    await register(jsonRequest({ email: 'wrong@example.com', password: 'right', companyName: 'A' }));
    const response = await login(jsonRequest({ email: 'wrong@example.com', password: 'wrong' }));
    expect(response.status).toBe(401);
  });

  it('returns the current user from /me using the session cookie, and null after logout', async () => {
    await register(
      jsonRequest({ email: 'me@example.com', password: 'geheim123', companyName: 'A' })
    );
    const loginResponse = await login(jsonRequest({ email: 'me@example.com', password: 'geheim123' }));
    const cookie = loginResponse.headers.get('set-cookie')!;

    const meResponse = await me(
      new Request('http://localhost/api/auth/me?type=klant', { headers: { cookie } })
    );
    const meBody = await meResponse.json();
    expect(meBody.user.email).toBe('me@example.com');

    await logout(jsonRequest({}, cookie));
    const afterLogout = await me(
      new Request('http://localhost/api/auth/me?type=klant', { headers: { cookie } })
    );
    const afterLogoutBody = await afterLogout.json();
    expect(afterLogoutBody.user).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/api/auth/customer-auth.test.ts`
Expected: FAIL — cannot find the route modules

- [ ] **Step 3: Implement the register route**

```typescript
// src/app/api/auth/register/route.ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { hashPassword } from '@/lib/server/password';

export async function POST(request: Request) {
  const body = await request.json();
  const { email, password, ...rest } = body as { email: string; password: string } & Record<
    string,
    unknown
  >;

  const [existing] = await getPool().query('SELECT id FROM klanten WHERE email = ?', [email]);
  if ((existing as unknown[]).length > 0) {
    return NextResponse.json({ error: 'email-in-use' }, { status: 400 });
  }

  try {
    const wachtwoordHash = await hashPassword(password);
    await insertRow('klanten', {
      email,
      wachtwoordHash,
      status: 'Beoordelen',
      prijsgroepId: null,
      ...rest,
    } as never);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Implement the login route**

```typescript
// src/app/api/auth/login/route.ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { verifyPassword } from '@/lib/server/password';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';

export async function POST(request: Request) {
  const { email, password } = (await request.json()) as { email: string; password: string };

  const [rows] = await getPool().query(
    'SELECT id, wachtwoordHash, status FROM klanten WHERE email = ?',
    [email]
  );
  const klant = (rows as Array<{ id: string; wachtwoordHash: string; status: string }>)[0];
  if (!klant || !(await verifyPassword(password, klant.wachtwoordHash))) {
    return NextResponse.json({ error: 'invalid-credentials' }, { status: 401 });
  }

  const sessionId = await createSession('klant', klant.id);
  const response = NextResponse.json({ status: klant.status }, { status: 200 });
  response.cookies.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
```

- [ ] **Step 5: Implement the logout route**

```typescript
// src/app/api/auth/logout/route.ts
import { NextResponse } from 'next/server';
import { destroySession, SESSION_COOKIE_NAME } from '@/lib/server/session';

export async function POST(request: Request) {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  if (match) {
    await destroySession(match[1]);
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, '', { path: '/', maxAge: 0 });
  return response;
}
```

- [ ] **Step 6: Implement the /me route**

```typescript
// src/app/api/auth/me/route.ts
import { NextResponse } from 'next/server';
import { getRow } from '@/lib/server/crud';
import { validateSession, SESSION_COOKIE_NAME } from '@/lib/server/session';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get('type') ?? 'klant';
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  if (!match) {
    return NextResponse.json({ user: null });
  }
  const session = await validateSession(match[1]);
  if (!session || session.userType !== type) {
    return NextResponse.json({ user: null });
  }
  const table = type === 'klant' ? 'klanten' : 'medewerkers';
  const user = await getRow(table, session.userId);
  return NextResponse.json({ user });
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run tests/app/api/auth/customer-auth.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 8: Commit**

```bash
git add src/app/api/auth/register src/app/api/auth/login src/app/api/auth/logout src/app/api/auth/me tests/app/api/auth/customer-auth.test.ts
git commit -m "feat: add customer auth API routes (register/login/logout/me)"
```

---

## Task 7: Medewerker (staff) auth API route

**Files:**
- Create: `src/app/api/auth/medewerker-login/route.ts`
- Test: `tests/app/api/auth/medewerker-auth.test.ts`

**Interfaces:**
- Consumes: `verifyPassword` (Task 4), `createSession`/`SESSION_COOKIE_NAME` (Task 5), `/api/auth/logout` and `/api/auth/me?type=medewerker` (Task 6, reused as-is).
- Produces: `POST /api/auth/medewerker-login`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/app/api/auth/medewerker-auth.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { hashPassword } from '@/lib/server/password';
import { POST as medewerkerLogin } from '@/app/api/auth/medewerker-login/route';
import { GET as me } from '@/app/api/auth/me/route';

beforeEach(async () => {
  await getPool().query('DELETE FROM medewerkers');
  await getPool().query('DELETE FROM sessions');
});

describe('medewerker login route', () => {
  it('logs in a staff member and exposes them via /me?type=medewerker', async () => {
    await insertRow('medewerkers', {
      email: 'paul@glassartanddesign.com',
      wachtwoordHash: await hashPassword('staffpass'),
      naam: 'Paul',
    } as never);

    const response = await medewerkerLogin(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'paul@glassartanddesign.com', password: 'staffpass' }),
      })
    );
    expect(response.status).toBe(200);
    const cookie = response.headers.get('set-cookie')!;

    const meResponse = await me(
      new Request('http://localhost/api/auth/me?type=medewerker', { headers: { cookie } })
    );
    const body = await meResponse.json();
    expect(body.user.email).toBe('paul@glassartanddesign.com');
  });

  it('rejects an unknown email', async () => {
    const response = await medewerkerLogin(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'nobody@glassartanddesign.com', password: 'x' }),
      })
    );
    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/api/auth/medewerker-auth.test.ts`
Expected: FAIL — cannot find `@/app/api/auth/medewerker-login/route`

- [ ] **Step 3: Implement the route**

```typescript
// src/app/api/auth/medewerker-login/route.ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { verifyPassword } from '@/lib/server/password';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';

export async function POST(request: Request) {
  const { email, password } = (await request.json()) as { email: string; password: string };

  const [rows] = await getPool().query('SELECT id, wachtwoordHash FROM medewerkers WHERE email = ?', [
    email,
  ]);
  const medewerker = (rows as Array<{ id: string; wachtwoordHash: string }>)[0];
  if (!medewerker || !(await verifyPassword(password, medewerker.wachtwoordHash))) {
    return NextResponse.json({ error: 'invalid-credentials' }, { status: 401 });
  }

  const sessionId = await createSession('medewerker', medewerker.id);
  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/api/auth/medewerker-auth.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/medewerker-login tests/app/api/auth/medewerker-auth.test.ts
git commit -m "feat: add medewerker login API route"
```

---

## Task 8: Password-reset API routes (request + confirm)

**Files:**
- Create: `src/app/api/auth/reset-password/request/route.ts`
- Create: `src/app/api/auth/reset-password/confirm/route.ts`
- Test: `tests/app/api/auth/reset-password.test.ts`

**Interfaces:**
- Consumes: `hashPassword` (Task 4), `getPool` (Task 1).
- Produces: `POST /api/auth/reset-password/request` `{ email, userType }`, `POST /api/auth/reset-password/confirm` `{ token, newPassword }`.
- Note: sending the actual reset email via the existing PHP mail-server is a small, separate concern — this task stubs it behind a single exported function `sendResetEmail` that a later, non-blocking task can wire up to the real `mail-server` endpoint URL (same pattern already used in `CartPanel.tsx`'s `sendConfirmationEmail`, reading `process.env.NEXT_PUBLIC_MAIL_ENDPOINT_URL`).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/app/api/auth/reset-password.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { hashPassword, verifyPassword } from '@/lib/server/password';

vi.mock('@/lib/server/sendResetEmail', () => ({ sendResetEmail: vi.fn().mockResolvedValue(undefined) }));

import { POST as requestReset } from '@/app/api/auth/reset-password/request/route';
import { POST as confirmReset } from '@/app/api/auth/reset-password/confirm/route';

beforeEach(async () => {
  await getPool().query('DELETE FROM klanten');
  await getPool().query('DELETE FROM passwordResetTokens');
});

describe('password reset routes', () => {
  it('creates a reset token for a known klant email and confirms a new password', async () => {
    const klant = await insertRow<{ id: string; email: string }>('klanten', {
      email: 'reset@example.com',
      wachtwoordHash: await hashPassword('oldpass'),
      status: 'Goedgekeurd',
    } as never);

    const requestResponse = await requestReset(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'reset@example.com', userType: 'klant' }),
      })
    );
    expect(requestResponse.status).toBe(200);

    const [tokenRows] = await getPool().query(
      'SELECT token FROM passwordResetTokens WHERE userId = ?',
      [klant.id]
    );
    const token = (tokenRows as Array<{ token: string }>)[0].token;

    const confirmResponse = await confirmReset(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, newPassword: 'newpass123' }),
      })
    );
    expect(confirmResponse.status).toBe(200);

    const [klantRows] = await getPool().query('SELECT wachtwoordHash FROM klanten WHERE id = ?', [
      klant.id,
    ]);
    const updatedHash = (klantRows as Array<{ wachtwoordHash: string }>)[0].wachtwoordHash;
    expect(await verifyPassword('newpass123', updatedHash)).toBe(true);
  });

  it('does not leak whether an email exists (always 200)', async () => {
    const response = await requestReset(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'unknown@example.com', userType: 'klant' }),
      })
    );
    expect(response.status).toBe(200);
  });

  it('rejects confirm with an unknown token', async () => {
    const response = await confirmReset(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'does-not-exist', newPassword: 'x' }),
      })
    );
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/api/auth/reset-password.test.ts`
Expected: FAIL — cannot find the route modules

- [ ] **Step 3: Implement a `sendResetEmail` stub**

```typescript
// src/lib/server/sendResetEmail.ts
export async function sendResetEmail(email: string, token: string): Promise<void> {
  const endpoint = process.env.MAIL_SERVER_RESET_ENDPOINT_URL;
  if (!endpoint) return;
  await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ to: email, resetToken: token }),
  });
}
```

- [ ] **Step 4: Implement the request route**

```typescript
// src/app/api/auth/reset-password/request/route.ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { randomUUID } from 'crypto';
import { sendResetEmail } from '@/lib/server/sendResetEmail';

export async function POST(request: Request) {
  const { email, userType } = (await request.json()) as {
    email: string;
    userType: 'klant' | 'medewerker';
  };
  const table = userType === 'klant' ? 'klanten' : 'medewerkers';

  const [rows] = await getPool().query(`SELECT id FROM \`${table}\` WHERE email = ?`, [email]);
  const user = (rows as Array<{ id: string }>)[0];

  if (user) {
    const token = randomUUID();
    await getPool().query(
      'INSERT INTO passwordResetTokens (token, userType, userId, expiresAt) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 DAY))',
      [token, userType, user.id]
    );
    await sendResetEmail(email, token);
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Implement the confirm route**

```typescript
// src/app/api/auth/reset-password/confirm/route.ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { hashPassword } from '@/lib/server/password';

export async function POST(request: Request) {
  const { token, newPassword } = (await request.json()) as { token: string; newPassword: string };

  const [rows] = await getPool().query(
    'SELECT userType, userId FROM passwordResetTokens WHERE token = ? AND expiresAt > NOW()',
    [token]
  );
  const record = (rows as Array<{ userType: 'klant' | 'medewerker'; userId: string }>)[0];
  if (!record) {
    return NextResponse.json({ error: 'invalid-token' }, { status: 400 });
  }

  const table = record.userType === 'klant' ? 'klanten' : 'medewerkers';
  const wachtwoordHash = await hashPassword(newPassword);
  await getPool().query(`UPDATE \`${table}\` SET wachtwoordHash = ? WHERE id = ?`, [
    wachtwoordHash,
    record.userId,
  ]);
  await getPool().query('DELETE FROM passwordResetTokens WHERE token = ?', [token]);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/app/api/auth/reset-password.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/sendResetEmail.ts src/app/api/auth/reset-password tests/app/api/auth/reset-password.test.ts
git commit -m "feat: add password-reset request/confirm API routes"
```

---

## Task 9: Generic client hooks `useApiCollection` / `useApiRecord`

**Files:**
- Create: `src/lib/useApiCollection.ts`
- Create: `src/lib/useApiRecord.ts`
- Create: `src/app/api/[resource]/route.ts` (generic collection endpoint used by both)
- Create: `src/app/api/[resource]/[id]/route.ts`
- Test: `tests/lib/useApiCollection.test.tsx`
- Test: `tests/lib/useApiRecord.test.tsx`

**Interfaces:**
- Produces (matching the existing `useFirestoreCollection`/`useFirestoreDocument` interfaces exactly):
  - `useApiCollection<T extends { id: string }>(resource: string, options?: { seed?: Omit<T, 'id'>[]; skip?: boolean }): { items: T[] | null; error: 'load' | 'action' | null; add; update; remove; refetch }`
  - `useApiRecord<T>(resource: string, id: string, options?: { seed?: T }): { data: T | null; error: 'load' | 'action' | null; save }`
- Note: `[resource]` is restricted server-side to a fixed allow-list of simple lookup tables (see Task 11) — `bestelheaders`, `klanten`, `medewerkers`, and `activiteitenlog` have custom routes with extra logic and are **not** served through this generic endpoint (see Tasks 12–15).

- [ ] **Step 1: Write the failing test for `useApiCollection`**

```typescx
// tests/lib/useApiCollection.test.tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useApiCollection } from '@/lib/useApiCollection';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('useApiCollection', () => {
  it('loads items from GET /api/<resource>', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: '1', omschrijving: 'Hotel' }],
    });
    const { result } = renderHook(() => useApiCollection<{ id: string; omschrijving: string }>('segmenten'));
    await waitFor(() => expect(result.current.items).not.toBeNull());
    expect(result.current.items).toEqual([{ id: '1', omschrijving: 'Hotel' }]);
    expect(fetchMock).toHaveBeenCalledWith('/api/segmenten');
  });

  it('sets a load error when the GET fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    const { result } = renderHook(() => useApiCollection('segmenten'));
    await waitFor(() => expect(result.current.error).toBe('load'));
  });

  it('adds an item via POST and refetches', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: '2', omschrijving: 'Kantoor' }] });
    const { result } = renderHook(() => useApiCollection<{ id: string; omschrijving: string }>('segmenten'));
    await waitFor(() => expect(result.current.items).toEqual([]));

    let success = false;
    await act(async () => {
      success = await result.current.add({ omschrijving: 'Kantoor' });
    });
    expect(success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/segmenten',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.current.items).toEqual([{ id: '2', omschrijving: 'Kantoor' }]);
  });

  it('does not fetch when skip is true', () => {
    renderHook(() => useApiCollection('segmenten', { skip: true }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('seeds via POST when the collection comes back empty and a seed is provided', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // initial GET: empty
      .mockResolvedValueOnce({ ok: true }) // POST seed item
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: '1', omschrijving: 'Hotel' }],
      }); // refetch after seeding
    const { result } = renderHook(() =>
      useApiCollection<{ id: string; omschrijving: string }>('segmenten', {
        seed: [{ omschrijving: 'Hotel' }],
      })
    );
    await waitFor(() => expect(result.current.items).toEqual([{ id: '1', omschrijving: 'Hotel' }]));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/segmenten',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/useApiCollection.test.tsx`
Expected: FAIL — `Cannot find module '@/lib/useApiCollection'`

- [ ] **Step 3: Implement `useApiCollection`**

```typescript
// src/lib/useApiCollection.ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseApiCollectionOptions<T> {
  seed?: Omit<T, 'id'>[];
  skip?: boolean;
}

export interface UseApiCollectionResult<T> {
  items: T[] | null;
  error: 'load' | 'action' | null;
  add: (data: Omit<T, 'id'>) => Promise<boolean>;
  update: (id: string, data: Partial<Omit<T, 'id'>>) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  refetch: () => Promise<boolean>;
}

export function useApiCollection<T extends { id: string }>(
  resource: string,
  options?: UseApiCollectionOptions<T>
): UseApiCollectionResult<T> {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<'load' | 'action' | null>(null);
  const seedRef = useRef(options?.seed);
  seedRef.current = options?.seed;

  const fetchItems = useCallback(async () => {
    try {
      const response = await fetch(`/api/${resource}`);
      if (!response.ok) throw new Error('load failed');
      let loaded = (await response.json()) as T[];
      const seed = seedRef.current;
      if (loaded.length === 0 && seed && seed.length > 0) {
        for (const seedItem of seed) {
          await fetch(`/api/${resource}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(seedItem),
          });
        }
        const reseededResponse = await fetch(`/api/${resource}`);
        loaded = (await reseededResponse.json()) as T[];
      }
      setItems(loaded);
      setError(null);
      return true;
    } catch {
      setError('load');
      return false;
    }
  }, [resource]);

  useEffect(() => {
    if (options?.skip) return;
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchItems, options?.skip]);

  const add = useCallback(
    async (data: Omit<T, 'id'>) => {
      try {
        const response = await fetch(`/api/${resource}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!response.ok) throw new Error('add failed');
        return await fetchItems();
      } catch {
        setError('action');
        return false;
      }
    },
    [resource, fetchItems]
  );

  const update = useCallback(
    async (id: string, data: Partial<Omit<T, 'id'>>) => {
      try {
        const response = await fetch(`/api/${resource}/${id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!response.ok) throw new Error('update failed');
        return await fetchItems();
      } catch {
        setError('action');
        return false;
      }
    },
    [resource, fetchItems]
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        const response = await fetch(`/api/${resource}/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('delete failed');
        return await fetchItems();
      } catch {
        setError('action');
        return false;
      }
    },
    [resource, fetchItems]
  );

  return { items, error, add, update, remove, refetch: fetchItems };
}
```

- [ ] **Step 4: Run the `useApiCollection` test to verify it passes**

Run: `npx vitest run tests/lib/useApiCollection.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Write the failing test for `useApiRecord`**

```typescx
// tests/lib/useApiRecord.test.tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useApiRecord } from '@/lib/useApiRecord';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('useApiRecord', () => {
  it('loads a document from GET /api/<resource>/<id>', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ bezoekadres: 'Den Heuvel 21' }) });
    const { result } = renderHook(() =>
      useApiRecord<{ bezoekadres: string }>('instellingen', 'bedrijfsgegevens')
    );
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.data).toEqual({ bezoekadres: 'Den Heuvel 21' });
    expect(fetchMock).toHaveBeenCalledWith('/api/instellingen/bedrijfsgegevens');
  });

  it('saves via PATCH', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ bezoekadres: 'Oud adres' }) })
      .mockResolvedValueOnce({ ok: true });
    const { result } = renderHook(() =>
      useApiRecord<{ bezoekadres: string }>('instellingen', 'bedrijfsgegevens')
    );
    await waitFor(() => expect(result.current.data).not.toBeNull());

    let success = false;
    await act(async () => {
      success = await result.current.save({ bezoekadres: 'Nieuw adres' });
    });
    expect(success).toBe(true);
    expect(result.current.data).toEqual({ bezoekadres: 'Nieuw adres' });
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run tests/lib/useApiRecord.test.tsx`
Expected: FAIL — `Cannot find module '@/lib/useApiRecord'`

- [ ] **Step 7: Implement `useApiRecord`**

```typescript
// src/lib/useApiRecord.ts
'use client';

import { useCallback, useEffect, useState } from 'react';

export interface UseApiRecordOptions<T> {
  seed?: T;
}

export interface UseApiRecordResult<T> {
  data: T | null;
  error: 'load' | 'action' | null;
  save: (data: T) => Promise<boolean>;
}

export function useApiRecord<T>(
  resource: string,
  id: string,
  options?: UseApiRecordOptions<T>
): UseApiRecordResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<'load' | 'action' | null>(null);

  const fetchRecord = useCallback(async () => {
    try {
      const response = await fetch(`/api/${resource}/${id}`);
      if (!response.ok) throw new Error('load failed');
      setData(await response.json());
      setError(null);
      return true;
    } catch {
      setError('load');
      return false;
    }
  }, [resource, id]);

  useEffect(() => {
    fetchRecord();
  }, [fetchRecord]);

  const save = useCallback(
    async (newData: T) => {
      try {
        const response = await fetch(`/api/${resource}/${id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(newData),
        });
        if (!response.ok) throw new Error('save failed');
        setData(newData);
        setError(null);
        return true;
      } catch {
        setError('action');
        return false;
      }
    },
    [resource, id]
  );

  return { data, error, save };
}
```

- [ ] **Step 8: Run the `useApiRecord` test to verify it passes**

Run: `npx vitest run tests/lib/useApiRecord.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 9: Commit**

```bash
git add src/lib/useApiCollection.ts src/lib/useApiRecord.ts tests/lib/useApiCollection.test.tsx tests/lib/useApiRecord.test.tsx
git commit -m "feat: add useApiCollection/useApiRecord hooks matching Firestore hook interfaces"
```

---

## Task 10: New auth Providers (`useCustomerAuth`, `useAdminAuth`)

**Files:**
- Modify: `src/lib/useCustomerAuth.tsx` (full rewrite of internals, same exported interface)
- Modify: `src/lib/useAdminAuth.tsx` (full rewrite of internals, same exported interface)
- Test: `tests/lib/useCustomerAuth.test.tsx`
- Test: `tests/lib/useAdminAuth.test.tsx`

**Interfaces:**
- Produces (unchanged from current Firebase versions, so consuming components need no changes):
  - `useCustomerAuth(): { user: { uid, email, companyName, contactPerson } | null; isCustomer: boolean; isHydrated: boolean; logout: () => Promise<void> }`
  - `useAdminAuth(): { user: { uid, email } | null; isAdmin: boolean; isHydrated: boolean; login; logout; resetPassword }`
- Note: `login`/registration for customers happens via the plain `/api/auth/login` and `/api/auth/register` endpoints directly in `CustomerLoginForm`/`RegistrationForm` (Task 18) — `useCustomerAuth` itself has no `login` method, matching today's interface exactly (today's `CustomerLoginForm` calls Firebase's `signInWithEmailAndPassword` directly, not through the context).

- [ ] **Step 1: Write the failing test for `useCustomerAuth`**

```typescx
// tests/lib/useCustomerAuth.test.tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { CustomerAuthProvider, useCustomerAuth } from '@/lib/useCustomerAuth';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('useCustomerAuth', () => {
  it('loads the current user from /api/auth/me on mount', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        user: { id: 'k1', email: 'k@example.com', companyName: 'Acme', contactPerson: 'Jan', status: 'Goedgekeurd' },
      }),
    });
    const { result } = renderHook(() => useCustomerAuth(), { wrapper: CustomerAuthProvider });
    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    expect(result.current.user).toEqual({
      uid: 'k1',
      email: 'k@example.com',
      companyName: 'Acme',
      contactPerson: 'Jan',
    });
    expect(result.current.isCustomer).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me?type=klant');
  });

  it('is not a customer when status is not Goedgekeurd', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: { id: 'k2', email: 'p@example.com', status: 'Beoordelen' } }),
    });
    const { result } = renderHook(() => useCustomerAuth(), { wrapper: CustomerAuthProvider });
    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    expect(result.current.isCustomer).toBe(false);
  });

  it('logs out via POST /api/auth/logout', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ user: null }) })
      .mockResolvedValueOnce({ ok: true });
    const { result } = renderHook(() => useCustomerAuth(), { wrapper: CustomerAuthProvider });
    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    await act(async () => {
      await result.current.logout();
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/useCustomerAuth.test.tsx`
Expected: FAIL — the test's mocked `/api/auth/me` response shape does not match what the current Firebase-based implementation does (it doesn't call `fetch` at all, so `isHydrated` never flips via this path in a way the test expects; concretely, `fetchMock` will not be called and the assertion fails)

- [ ] **Step 3: Rewrite `useCustomerAuth.tsx`**

```typescript
// src/lib/useCustomerAuth.tsx
'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface CustomerUser {
  uid: string;
  email: string | null;
  companyName: string | null;
  contactPerson: string | null;
}

interface CustomerAuthValue {
  user: CustomerUser | null;
  isCustomer: boolean;
  isHydrated: boolean;
  logout: () => Promise<void>;
}

const CustomerAuthContext = createContext<CustomerAuthValue | null>(null);

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CustomerUser | null>(null);
  const [isCustomer, setIsCustomer] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch('/api/auth/me?type=klant');
        const body = await response.json();
        if (cancelled) return;
        const klant = body.user as
          | { id: string; email: string | null; companyName?: string; contactPerson?: string; status?: string }
          | null;
        if (!klant) {
          setUser(null);
          setIsCustomer(false);
        } else {
          setUser({
            uid: klant.id,
            email: klant.email,
            companyName: klant.companyName ?? null,
            contactPerson: klant.contactPerson ?? null,
          });
          setIsCustomer(klant.status === 'Goedgekeurd');
        }
      } finally {
        if (!cancelled) setIsHydrated(true);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<CustomerAuthValue>(
    () => ({
      user,
      isCustomer,
      isHydrated,
      logout: async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        setUser(null);
        setIsCustomer(false);
      },
    }),
    [user, isCustomer, isHydrated]
  );

  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

export function useCustomerAuth(): CustomerAuthValue {
  const context = useContext(CustomerAuthContext);
  if (!context) {
    throw new Error('useCustomerAuth must be used within a CustomerAuthProvider');
  }
  return context;
}
```

- [ ] **Step 4: Run the `useCustomerAuth` test to verify it passes**

Run: `npx vitest run tests/lib/useCustomerAuth.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing test for `useAdminAuth`**

```typescx
// tests/lib/useAdminAuth.test.tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { AdminAuthProvider, useAdminAuth } from '@/lib/useAdminAuth';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('useAdminAuth', () => {
  it('loads the current medewerker from /api/auth/me on mount', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: { id: 'm1', email: 'paul@glassartanddesign.com' } }),
    });
    const { result } = renderHook(() => useAdminAuth(), { wrapper: AdminAuthProvider });
    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    expect(result.current.user).toEqual({ uid: 'm1', email: 'paul@glassartanddesign.com' });
    expect(result.current.isAdmin).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me?type=medewerker');
  });

  it('logs in via POST /api/auth/medewerker-login', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ user: null }) })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ user: { id: 'm1', email: 'p@x.com' } }) });
    const { result } = renderHook(() => useAdminAuth(), { wrapper: AdminAuthProvider });
    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    await act(async () => {
      await result.current.login('p@x.com', 'pw');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/medewerker-login',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('requests a password reset via POST /api/auth/reset-password/request', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ user: null }) })
      .mockResolvedValueOnce({ ok: true });
    const { result } = renderHook(() => useAdminAuth(), { wrapper: AdminAuthProvider });
    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    await act(async () => {
      await result.current.resetPassword('p@x.com');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/reset-password/request',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run tests/lib/useAdminAuth.test.tsx`
Expected: FAIL — current implementation calls Firebase, not `fetch`

- [ ] **Step 7: Rewrite `useAdminAuth.tsx`**

```typescript
// src/lib/useAdminAuth.tsx
'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface AdminUser {
  uid: string;
  email: string | null;
}

interface AdminAuthValue {
  user: AdminUser | null;
  isAdmin: boolean;
  isHydrated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

async function loadMe(): Promise<AdminUser | null> {
  const response = await fetch('/api/auth/me?type=medewerker');
  const body = await response.json();
  const medewerker = body.user as { id: string; email: string | null } | null;
  return medewerker ? { uid: medewerker.id, email: medewerker.email } : null;
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadMe().then((loaded) => {
      if (!cancelled) {
        setUser(loaded);
        setIsHydrated(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AdminAuthValue>(
    () => ({
      user,
      isAdmin: user !== null,
      isHydrated,
      login: async (email: string, password: string) => {
        const response = await fetch('/api/auth/medewerker-login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        if (!response.ok) throw new Error('login failed');
        setUser(await loadMe());
      },
      logout: async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        setUser(null);
      },
      resetPassword: async (email: string) => {
        await fetch('/api/auth/reset-password/request', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, userType: 'medewerker' }),
        });
      },
    }),
    [user, isHydrated]
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthValue {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
}
```

- [ ] **Step 8: Run the `useAdminAuth` test to verify it passes**

Run: `npx vitest run tests/lib/useAdminAuth.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 9: Commit**

```bash
git add src/lib/useCustomerAuth.tsx src/lib/useAdminAuth.tsx tests/lib/useCustomerAuth.test.tsx tests/lib/useAdminAuth.test.tsx
git commit -m "feat: rewrite auth providers to use session API instead of Firebase"
```

---

## Task 10a: Staff auth-gate helper

**Files:**
- Create: `src/lib/server/requireAuth.ts`
- Test: `tests/lib/server/requireAuth.test.ts`

**Interfaces:**
- Consumes: `validateSession`/`SESSION_COOKIE_NAME` (Task 5).
- Produces: `requireMedewerker(request: Request): Promise<string | null>` — returns the medewerker's `userId` if the request's session cookie belongs to a valid, non-expired medewerker session, otherwise `null`. Used by Task 11 (generic factory's `authRequired` option) and Tasks 11a/11b (kunstenaars/drukkers routes) to gate staff-only reads/writes now that there is no Firestore-rules layer to do this.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/server/requireAuth.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { requireMedewerker } from '@/lib/server/requireAuth';

beforeEach(async () => {
  await getPool().query('DELETE FROM sessions');
});

function requestWithCookie(sessionId?: string) {
  return new Request('http://localhost/api', {
    headers: sessionId ? { cookie: `${SESSION_COOKIE_NAME}=${sessionId}` } : {},
  });
}

describe('requireMedewerker', () => {
  it('returns the userId for a valid medewerker session', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    expect(await requireMedewerker(requestWithCookie(sessionId))).toBe('staff-1');
  });

  it('returns null when there is no session cookie', async () => {
    expect(await requireMedewerker(requestWithCookie())).toBeNull();
  });

  it('returns null for a klant session (wrong user type)', async () => {
    const sessionId = await createSession('klant', 'klant-1');
    expect(await requireMedewerker(requestWithCookie(sessionId))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/server/requireAuth.test.ts`
Expected: FAIL — `Cannot find module '@/lib/server/requireAuth'`

- [ ] **Step 3: Implement the helper**

```typescript
// src/lib/server/requireAuth.ts
import { validateSession, SESSION_COOKIE_NAME } from './session';

export async function requireMedewerker(request: Request): Promise<string | null> {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  const session = await validateSession(match[1]);
  if (!session || session.userType !== 'medewerker') return null;
  return session.userId;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/server/requireAuth.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/requireAuth.ts tests/lib/server/requireAuth.test.ts
git commit -m "feat: add requireMedewerker staff auth-gate helper"
```

---

## Task 11: Simple lookup-resource API routes (generic CRUD)

**Files:**
- Create: `src/app/api/[resource]/route.ts`
- Create: `src/app/api/[resource]/[id]/route.ts`
- Test: `tests/app/api/lookup-resources.test.ts`

**Interfaces:**
- Consumes: `listRows`/`getRow`/`insertRow`/`updateRow`/`deleteRow` (Task 3), `requireMedewerker` (Task 10a).
- Produces: `GET/POST /api/{segmenten|materiaalsoorten|materialen|maten|stijlen|onderwerpen|prijsgroepen|kunstwerken|drukkers}` and `GET/PATCH/DELETE /api/.../{id}` — consumed by `useApiCollection` (Task 9).
- Note: `[resource]` is checked against a fixed allow-list; any other value returns 404. This keeps `klanten`, `medewerkers`, `bestelheaders`, `activiteitenlog`, `instellingen`, `kunstenaars`/`kunstenaarAfspraken` (Task 11a), `drukkerZendingen` (Task 11b) — all of which need custom logic — from accidentally being exposed through the generic route.
- `drukkers` is included in this generic allow-list (unlike `kunstenaars`) because its whole record is staff-only with no column-level split — it just needs `authRequired: 'medewerker'` on every method, which the generic factory now supports.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/app/api/lookup-resources.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { GET as listResource, POST as createResource } from '@/app/api/[resource]/route';
import {
  GET as getResource,
  PATCH as patchResource,
  DELETE as deleteResource,
} from '@/app/api/[resource]/[id]/route';

beforeEach(async () => {
  await getPool().query('DELETE FROM segmenten');
});

function jsonRequest(method: string, body?: unknown) {
  return new Request('http://localhost/api/segmenten', {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe('generic lookup-resource routes', () => {
  it('creates then lists a segment', async () => {
    await createResource(jsonRequest('POST', { omschrijving: 'Hotel' }), {
      params: { resource: 'segmenten' },
    });
    const response = await listResource(jsonRequest('GET'), { params: { resource: 'segmenten' } });
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].omschrijving).toBe('Hotel');
  });

  it('rejects an unknown resource with 404', async () => {
    const response = await listResource(jsonRequest('GET'), { params: { resource: 'klanten' } });
    expect(response.status).toBe(404);
  });

  it('rejects reading a staff-only resource (drukkers) without a medewerker session', async () => {
    const response = await listResource(
      new Request('http://localhost/api/drukkers', { method: 'GET' }),
      { params: { resource: 'drukkers' } }
    );
    expect(response.status).toBe(401);
  });

  it('allows reading drukkers with a valid medewerker session', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    await getPool().query('DELETE FROM drukkers');
    const response = await listResource(
      new Request('http://localhost/api/drukkers', {
        method: 'GET',
        headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionId}` },
      }),
      { params: { resource: 'drukkers' } }
    );
    expect(response.status).toBe(200);
  });

  it('gets, updates and deletes a single segment', async () => {
    await createResource(jsonRequest('POST', { omschrijving: 'Restaurant' }), {
      params: { resource: 'segmenten' },
    });
    const listResponse = await listResource(jsonRequest('GET'), { params: { resource: 'segmenten' } });
    const [created] = await listResponse.json();

    const getResponse = await getResource(jsonRequest('GET'), {
      params: { resource: 'segmenten', id: created.id },
    });
    expect((await getResponse.json()).omschrijving).toBe('Restaurant');

    await patchResource(jsonRequest('PATCH', { omschrijving: 'Restaurantpand' }), {
      params: { resource: 'segmenten', id: created.id },
    });
    const updatedResponse = await getResource(jsonRequest('GET'), {
      params: { resource: 'segmenten', id: created.id },
    });
    expect((await updatedResponse.json()).omschrijving).toBe('Restaurantpand');

    await deleteResource(jsonRequest('DELETE'), {
      params: { resource: 'segmenten', id: created.id },
    });
    const afterDelete = await getResource(jsonRequest('GET'), {
      params: { resource: 'segmenten', id: created.id },
    });
    expect(afterDelete.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/api/lookup-resources.test.ts`
Expected: FAIL — cannot find `@/app/api/[resource]/route`

- [ ] **Step 3: Implement the allow-list + collection route**

```typescript
// src/lib/server/lookupResources.ts
export interface LookupResourceConfig {
  jsonColumns: string[];
  authRequired?: 'medewerker';
}

export const LOOKUP_RESOURCES: Record<string, LookupResourceConfig> = {
  segmenten: { jsonColumns: [] },
  materiaalsoorten: { jsonColumns: [] },
  materialen: { jsonColumns: [] },
  maten: { jsonColumns: [] },
  stijlen: { jsonColumns: [] },
  onderwerpen: { jsonColumns: [] },
  prijsgroepen: { jsonColumns: [] },
  kunstwerken: {
    jsonColumns: ['segmentIds', 'materiaalIds', 'maatIds', 'stijlIds', 'onderwerpIds', 'prijzen'],
  },
  drukkers: { jsonColumns: [], authRequired: 'medewerker' },
};
```

```typescript
// src/app/api/[resource]/route.ts
import { NextResponse } from 'next/server';
import { listRows, insertRow } from '@/lib/server/crud';
import { LOOKUP_RESOURCES } from '@/lib/server/lookupResources';
import { requireMedewerker } from '@/lib/server/requireAuth';

export async function GET(request: Request, { params }: { params: { resource: string } }) {
  const config = LOOKUP_RESOURCES[params.resource];
  if (!config) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 });
  }
  if (config.authRequired && !(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const rows = await listRows(params.resource, config.jsonColumns);
  return NextResponse.json(rows);
}

export async function POST(request: Request, { params }: { params: { resource: string } }) {
  const config = LOOKUP_RESOURCES[params.resource];
  if (!config) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 });
  }
  if (config.authRequired && !(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await request.json();
    const created = await insertRow(params.resource, data, config.jsonColumns);
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Implement the single-item route**

```typescript
// src/app/api/[resource]/[id]/route.ts
import { NextResponse } from 'next/server';
import { getRow, updateRow, deleteRow } from '@/lib/server/crud';
import { LOOKUP_RESOURCES } from '@/lib/server/lookupResources';
import { requireMedewerker } from '@/lib/server/requireAuth';

export async function GET(
  request: Request,
  { params }: { params: { resource: string; id: string } }
) {
  const config = LOOKUP_RESOURCES[params.resource];
  if (!config) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 });
  }
  if (config.authRequired && !(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const row = await getRow(params.resource, params.id, config.jsonColumns);
  if (!row) return NextResponse.json({ error: 'not-found' }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(
  request: Request,
  { params }: { params: { resource: string; id: string } }
) {
  const config = LOOKUP_RESOURCES[params.resource];
  if (!config) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 });
  }
  if (config.authRequired && !(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await request.json();
    await updateRow(params.resource, params.id, data, config.jsonColumns);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { resource: string; id: string } }
) {
  const config = LOOKUP_RESOURCES[params.resource];
  if (!config) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 });
  }
  if (config.authRequired && !(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  await deleteRow(params.resource, params.id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/app/api/lookup-resources.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/lookupResources.ts src/app/api/\[resource\] tests/app/api/lookup-resources.test.ts
git commit -m "feat: add generic CRUD API route for simple lookup resources"
```

---

## Task 11a: `kunstenaars` + `kunstenaarAfspraken` API routes

**Files:**
- Create: `src/app/api/kunstenaars/route.ts`
- Create: `src/app/api/kunstenaars/[id]/route.ts`
- Create: `src/app/api/kunstenaarAfspraken/[id]/route.ts`
- Test: `tests/app/api/kunstenaars.test.ts`

**Interfaces:**
- Consumes: `listRows`/`getRow`/`insertRow`/`updateRow`/`deleteRow` (Task 3), `requireMedewerker` (Task 10a), `getPool` (Task 1).
- Produces: `GET /api/kunstenaars` (public), `POST /api/kunstenaars` (staff-only), `GET/PATCH/DELETE /api/kunstenaars/:id` (GET public, PATCH/DELETE staff-only), `GET/PUT /api/kunstenaarAfspraken/:id` (both staff-only, `:id` is the matching `kunstenaars.id` — not a separately generated id).
- Note: these are bespoke routes, not served through the generic Task 11 factory, because (a) `kunstenaars` needs *different* auth per HTTP method (public GET, staff-only writes) which the generic factory's single `authRequired` flag can't express, and (b) `kunstenaarAfspraken`'s row id must equal the corresponding kunstenaar's id rather than a freshly generated UUID, which `insertRow` doesn't support. The field-level split that Firestore enforced via rules (public `kunstenaars` doc vs. staff-only `kunstenaarAfspraken` doc) is achieved here simply by using two separate tables — `kunstenaars` never has a `prijsafspraken` column at all, so there is nothing to accidentally leak through `SELECT *`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/app/api/kunstenaars.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { insertRow } from '@/lib/server/crud';
import { GET as listKunstenaars, POST as createKunstenaar } from '@/app/api/kunstenaars/route';
import {
  GET as getKunstenaar,
  PATCH as patchKunstenaar,
  DELETE as deleteKunstenaar,
} from '@/app/api/kunstenaars/[id]/route';
import {
  GET as getAfspraken,
  PUT as putAfspraken,
} from '@/app/api/kunstenaarAfspraken/[id]/route';

beforeEach(async () => {
  await getPool().query('DELETE FROM kunstenaarAfspraken');
  await getPool().query('DELETE FROM kunstenaars');
});

function req(method: string, body?: unknown, cookie?: string) {
  return new Request('http://localhost/api', {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe('kunstenaars + kunstenaarAfspraken routes', () => {
  it('lists kunstenaars publicly, without ever exposing prijsafspraken', async () => {
    await insertRow('kunstenaars', { naam: 'Anna', verkooprecht: 'open' } as never);
    const response = await listKunstenaars(req('GET'));
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].naam).toBe('Anna');
    expect(body[0].prijsafspraken).toBeUndefined();
  });

  it('rejects creating a kunstenaar without a medewerker session', async () => {
    const response = await createKunstenaar(req('POST', { naam: 'Bram', verkooprecht: 'open' }));
    expect(response.status).toBe(401);
  });

  it('allows creating, updating and deleting a kunstenaar with a medewerker session', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;

    const createResponse = await createKunstenaar(
      req('POST', { naam: 'Chris', verkooprecht: 'open' }, cookie)
    );
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();

    await patchKunstenaar(req('PATCH', { naam: 'Christiaan' }, cookie), {
      params: { id: created.id },
    });
    const getResponse = await getKunstenaar(req('GET'), { params: { id: created.id } });
    expect((await getResponse.json()).naam).toBe('Christiaan');

    await deleteKunstenaar(req('DELETE', undefined, cookie), { params: { id: created.id } });
    const afterDelete = await getKunstenaar(req('GET'), { params: { id: created.id } });
    expect(afterDelete.status).toBe(404);
  });

  it('stores and retrieves prijsafspraken only for staff, keyed by the kunstenaar id', async () => {
    const kunstenaar = await insertRow<{ id: string }>('kunstenaars', {
      naam: 'Dana',
      verkooprecht: 'open',
    } as never);
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;

    const putResponse = await putAfspraken(
      req('PUT', { prijsafspraken: '50/50 split' }, cookie),
      { params: { id: kunstenaar.id } }
    );
    expect(putResponse.status).toBe(200);

    const getResponse = await getAfspraken(req('GET', undefined, cookie), {
      params: { id: kunstenaar.id },
    });
    expect((await getResponse.json()).prijsafspraken).toBe('50/50 split');

    const unauthenticated = await getAfspraken(req('GET'), { params: { id: kunstenaar.id } });
    expect(unauthenticated.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/api/kunstenaars.test.ts`
Expected: FAIL — cannot find the route modules

- [ ] **Step 3: Implement the `kunstenaars` collection route**

```typescript
// src/app/api/kunstenaars/route.ts
import { NextResponse } from 'next/server';
import { listRows, insertRow } from '@/lib/server/crud';
import { requireMedewerker } from '@/lib/server/requireAuth';

export async function GET() {
  const rows = await listRows('kunstenaars');
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await request.json();
    const created = await insertRow('kunstenaars', data);
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Implement the `kunstenaars` single-item route**

```typescript
// src/app/api/kunstenaars/[id]/route.ts
import { NextResponse } from 'next/server';
import { getRow, updateRow, deleteRow } from '@/lib/server/crud';
import { requireMedewerker } from '@/lib/server/requireAuth';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const row = await getRow('kunstenaars', params.id);
  if (!row) return NextResponse.json({ error: 'not-found' }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await request.json();
    await updateRow('kunstenaars', params.id, data);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  await deleteRow('kunstenaars', params.id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Implement the `kunstenaarAfspraken` route**

```typescript
// src/app/api/kunstenaarAfspraken/[id]/route.ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { requireMedewerker } from '@/lib/server/requireAuth';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const [rows] = await getPool().query(
    'SELECT prijsafspraken FROM kunstenaarAfspraken WHERE id = ?',
    [params.id]
  );
  const row = (rows as Array<{ prijsafspraken: string | null }>)[0];
  return NextResponse.json({ prijsafspraken: row?.prijsafspraken ?? null });
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { prijsafspraken } = (await request.json()) as { prijsafspraken: string };
  await getPool().query(
    'INSERT INTO kunstenaarAfspraken (id, prijsafspraken) VALUES (?, ?) ON DUPLICATE KEY UPDATE prijsafspraken = VALUES(prijsafspraken)',
    [params.id, prijsafspraken]
  );
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/app/api/kunstenaars.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add src/app/api/kunstenaars src/app/api/kunstenaarAfspraken tests/app/api/kunstenaars.test.ts
git commit -m "feat: add kunstenaars/kunstenaarAfspraken API routes with field-level split"
```

---

## Task 11b: `drukkerZendingen` API route

**Files:**
- Create: `src/app/api/drukkers/[id]/zendingen/route.ts`
- Test: `tests/app/api/drukkerZendingen.test.ts`

**Interfaces:**
- Consumes: `listRows`/`insertRow` (Task 3), `requireMedewerker` (Task 10a), `getPool` (Task 1).
- Produces: `GET /api/drukkers/:id/zendingen` (staff-only, list newest-first), `POST /api/drukkers/:id/zendingen` (staff-only, create). No update/delete — this is an append-only shipment log, same pattern as `activiteitenlog`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/app/api/drukkerZendingen.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { GET as listZendingen, POST as createZending } from '@/app/api/drukkers/[id]/zendingen/route';

beforeEach(async () => {
  await getPool().query('DELETE FROM drukkerZendingen');
  await getPool().query('DELETE FROM drukkers');
});

describe('drukkerZendingen route', () => {
  it('rejects listing without a medewerker session', async () => {
    const drukker = await insertRow<{ id: string }>('drukkers', { naam: 'PrintCo' } as never);
    const response = await listZendingen(new Request('http://localhost/api'), {
      params: { id: drukker.id },
    });
    expect(response.status).toBe(401);
  });

  it('creates and lists a zending for a medewerker, newest first', async () => {
    const drukker = await insertRow<{ id: string }>('drukkers', { naam: 'PrintCo' } as never);
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;

    await createZending(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          onderwerp: 'Bestellingen week 30',
          body: 'Zie bijlage',
          bestellingIds: ['b1', 'b2'],
          aantalKlanten: 2,
          aantalRegels: 3,
          verzondDoor: 'Paul',
        }),
      }),
      { params: { id: drukker.id } }
    );

    const response = await listZendingen(
      new Request('http://localhost/api', { headers: { cookie } }),
      { params: { id: drukker.id } }
    );
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].onderwerp).toBe('Bestellingen week 30');
    expect(body[0].bestellingIds).toEqual(['b1', 'b2']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/api/drukkerZendingen.test.ts`
Expected: FAIL — cannot find `@/app/api/drukkers/[id]/zendingen/route`

- [ ] **Step 3: Implement the route**

```typescript
// src/app/api/drukkers/[id]/zendingen/route.ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { requireMedewerker } from '@/lib/server/requireAuth';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const [rows] = await getPool().query(
    'SELECT * FROM drukkerZendingen WHERE drukkerId = ? ORDER BY verzondenOp DESC',
    [params.id]
  );
  const parsed = (rows as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    bestellingIds: typeof row.bestellingIds === 'string' ? JSON.parse(row.bestellingIds) : row.bestellingIds,
  }));
  return NextResponse.json(parsed);
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await request.json();
    const created = await insertRow(
      'drukkerZendingen',
      { drukkerId: params.id, ...data },
      ['bestellingIds']
    );
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/api/drukkerZendingen.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/drukkers tests/app/api/drukkerZendingen.test.ts
git commit -m "feat: add drukkerZendingen API route"
```

---

## Task 12: `instellingen` single-row API route

**Files:**
- Create: `src/app/api/instellingen/[id]/route.ts`
- Test: `tests/app/api/instellingen.test.ts`

**Interfaces:**
- Consumes: `getPool` (Task 1). Not routed through the generic `[resource]` handler since it's a single JSON-blob row, not a list.
- Produces: `GET/PATCH /api/instellingen/bedrijfsgegevens`, consumed by `useApiRecord('instellingen', 'bedrijfsgegevens')`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/app/api/instellingen.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { GET, PATCH } from '@/app/api/instellingen/[id]/route';

beforeEach(async () => {
  await getPool().query('DELETE FROM instellingen');
});

describe('instellingen route', () => {
  it('returns 404 when no row exists yet', async () => {
    const response = await GET(new Request('http://localhost/api'), {
      params: { id: 'bedrijfsgegevens' },
    });
    expect(response.status).toBe(404);
  });

  it('saves and reads back the data blob via PATCH/GET', async () => {
    const patchResponse = await PATCH(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bezoekadres: 'Den Heuvel 21, 5688 EM Oirschot' }),
      }),
      { params: { id: 'bedrijfsgegevens' } }
    );
    expect(patchResponse.status).toBe(200);

    const getResponse = await GET(new Request('http://localhost/api'), {
      params: { id: 'bedrijfsgegevens' },
    });
    const body = await getResponse.json();
    expect(body.bezoekadres).toBe('Den Heuvel 21, 5688 EM Oirschot');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/api/instellingen.test.ts`
Expected: FAIL — cannot find `@/app/api/instellingen/[id]/route`

- [ ] **Step 3: Implement the route**

```typescript
// src/app/api/instellingen/[id]/route.ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const [rows] = await getPool().query('SELECT data FROM instellingen WHERE id = ?', [params.id]);
  const row = (rows as Array<{ data: string | object }>)[0];
  if (!row) return NextResponse.json({ error: 'not-found' }, { status: 404 });
  // mysql2 auto-parses JSON columns into objects, so `data` may already be an
  // object rather than a string — only parse when it genuinely came back as text.
  const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
  return NextResponse.json(data);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const data = await request.json();
  await getPool().query(
    'INSERT INTO instellingen (id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)',
    [params.id, JSON.stringify(data)]
  );
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/api/instellingen.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/instellingen tests/app/api/instellingen.test.ts
git commit -m "feat: add instellingen single-row API route"
```

---

## Task 13: `klanten` admin API routes (list, approve/reject, delete)

**Files:**
- Create: `src/app/api/klanten/route.ts`
- Create: `src/app/api/klanten/[id]/route.ts`
- Test: `tests/app/api/klanten.test.ts`

**Interfaces:**
- Consumes: `listRows`/`getRow`/`updateRow`/`deleteRow` (Task 3).
- Produces: `GET /api/klanten` (admin list), `PATCH /api/klanten/:id` (status/prijsgroep update), `DELETE /api/klanten/:id` (self-service account deletion) — replacing `BeheerShell`'s direct Firestore reads and `KlantModal`'s/`SettingsSection`'s direct writes.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/app/api/klanten.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { hashPassword } from '@/lib/server/password';
import { GET as listKlanten } from '@/app/api/klanten/route';
import { PATCH as patchKlant, DELETE as deleteKlant } from '@/app/api/klanten/[id]/route';

beforeEach(async () => {
  await getPool().query('DELETE FROM klanten');
});

describe('klanten admin routes', () => {
  it('lists klanten', async () => {
    await insertRow('klanten', {
      email: 'a@example.com',
      wachtwoordHash: await hashPassword('x'),
      companyName: 'Acme',
      status: 'Beoordelen',
    } as never);
    const response = await listKlanten();
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].companyName).toBe('Acme');
  });

  it('approves a klant with a prijsgroep', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'b@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Beoordelen',
    } as never);
    const response = await patchKlant(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Goedgekeurd', prijsgroepId: 'pg-1' }),
      }),
      { params: { id: klant.id } }
    );
    expect(response.status).toBe(200);
    const [rows] = await getPool().query('SELECT status, prijsgroepId FROM klanten WHERE id = ?', [
      klant.id,
    ]);
    expect((rows as Array<{ status: string }>)[0].status).toBe('Goedgekeurd');
  });

  it('deletes a klant', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'c@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    const response = await deleteKlant(new Request('http://localhost/api', { method: 'DELETE' }), {
      params: { id: klant.id },
    });
    expect(response.status).toBe(200);
    const [rows] = await getPool().query('SELECT id FROM klanten WHERE id = ?', [klant.id]);
    expect((rows as unknown[]).length).toBe(0);
  });

  it('round-trips exclusieveKunstenaarIds as a real JSON array (not "[object Object]")', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'd@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    await patchKlant(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ exclusieveKunstenaarIds: ['kunstenaar-1', 'kunstenaar-2'] }),
      }),
      { params: { id: klant.id } }
    );
    const response = await listKlanten();
    const body = await response.json();
    const updated = body.find((row: { id: string }) => row.id === klant.id);
    expect(updated.exclusieveKunstenaarIds).toEqual(['kunstenaar-1', 'kunstenaar-2']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/api/klanten.test.ts`
Expected: FAIL — cannot find `@/app/api/klanten/route`

- [ ] **Step 3: Implement the routes**

```typescript
// src/app/api/klanten/route.ts
import { NextResponse } from 'next/server';
import { listRows } from '@/lib/server/crud';

const KLANTEN_JSON_COLUMNS = ['exclusieveKunstenaarIds'];

export async function GET() {
  const klanten = await listRows('klanten', KLANTEN_JSON_COLUMNS);
  return NextResponse.json(klanten);
}
```

```typescript
// src/app/api/klanten/[id]/route.ts
import { NextResponse } from 'next/server';
import { updateRow, deleteRow } from '@/lib/server/crud';

const KLANTEN_JSON_COLUMNS = ['exclusieveKunstenaarIds'];

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const data = await request.json();
    await updateRow('klanten', params.id, data, KLANTEN_JSON_COLUMNS);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  await deleteRow('klanten', params.id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/api/klanten.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/klanten tests/app/api/klanten.test.ts
git commit -m "feat: add klanten admin API routes"
```

---

## Task 14: `bestelheaders` + `bestellines` API routes

**Files:**
- Create: `src/app/api/bestelheaders/route.ts`
- Create: `src/app/api/bestelheaders/[id]/route.ts`
- Create: `src/app/api/bestelheaders/[id]/bestellines/[lineId]/route.ts`
- Test: `tests/app/api/bestelheaders.test.ts`

**Interfaces:**
- Consumes: `getPool` (Task 1), `randomUUID` from `crypto`.
- Produces:
  - `POST /api/bestelheaders` `{ klantId, lines: [...] }` → creates header + lines atomically, generates `bestelnr`, returns the created header with its `id` and `bestelnr` (replaces `CartPanel.tsx` + `generateBestelnr.ts`'s direct Firestore transaction).
  - `GET /api/bestelheaders` (admin: all headers + their lines) and `GET /api/bestelheaders?klantId=...` (customer: own orders) — replaces `BeheerShell`'s and `useAllOrders`'s direct Firestore reads.
  - `PATCH /api/bestelheaders/:id` `{ status }` — approve/reject/send-to-printer.
  - `PATCH /api/bestelheaders/:id/bestellines/:lineId` `{ prijs }` — set a line's price.
- **Security note (per the design addendum):** this route is where two things that used to be enforced *only* by `firestore.rules` must become real server-side checks, since there is no rules layer anymore:
  1. **Verkooprecht/exclusiviteit** — before creating any line, look up its `kunstwerk.kunstenaarId` and, if set, the matching `kunstenaars` row's `verkooprecht`/`klantId`/`exclusiefVoorKlantId`. If the ordering klant isn't allowed to order that artwork (mirrors `resolveOrderRight.ts`'s client-side logic, which becomes a UI hint only), reject the whole order with 403 rather than silently creating it.
  2. **Line validation** — `quantity` must be a positive integer and `prijs` must be `null` or a positive number; reject the whole order with 400 otherwise.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/app/api/bestelheaders.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { hashPassword } from '@/lib/server/password';
import { POST as createHeader, GET as listHeaders } from '@/app/api/bestelheaders/route';
import { PATCH as patchHeader } from '@/app/api/bestelheaders/[id]/route';
import { PATCH as patchLine } from '@/app/api/bestelheaders/[id]/bestellines/[lineId]/route';

beforeEach(async () => {
  await getPool().query('DELETE FROM bestellines');
  await getPool().query('DELETE FROM bestelheaders');
  await getPool().query('DELETE FROM klanten');
  await getPool().query('DELETE FROM kunstwerken');
  await getPool().query('DELETE FROM kunstenaars');
  await getPool().query("UPDATE counters SET value = 0 WHERE id = 'bestelnummer'");
});

describe('bestelheaders routes', () => {
  it('creates a header with lines and an incrementing bestelnr', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'k@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);

    const response = await createHeader(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          klantId: klant.id,
          lines: [{ kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
        }),
      })
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.bestelnr).toBe('GD-00001');

    const [lineRows] = await getPool().query(
      'SELECT * FROM bestellines WHERE bestelheaderId = ?',
      [body.id]
    );
    expect((lineRows as unknown[]).length).toBe(1);
  });

  it('lists all headers for admin, and filters by klantId for a customer', async () => {
    const klantA = await insertRow<{ id: string }>('klanten', {
      email: 'a@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    const klantB = await insertRow<{ id: string }>('klanten', {
      email: 'b@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    await createHeader(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ klantId: klantA.id, lines: [] }),
      })
    );
    await createHeader(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ klantId: klantB.id, lines: [] }),
      })
    );

    const all = await listHeaders(new Request('http://localhost/api/bestelheaders'));
    expect((await all.json())).toHaveLength(2);

    const onlyA = await listHeaders(
      new Request(`http://localhost/api/bestelheaders?klantId=${klantA.id}`)
    );
    expect((await onlyA.json())).toHaveLength(1);
  });

  it('updates header status and a line price', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'c@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    const created = await createHeader(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          klantId: klant.id,
          lines: [{ kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: null, quantity: 1 }],
        }),
      })
    );
    const header = await created.json();
    const [lineRows] = await getPool().query('SELECT id FROM bestellines WHERE bestelheaderId = ?', [
      header.id,
    ]);
    const lineId = (lineRows as Array<{ id: string }>)[0].id;

    await patchHeader(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Te versturen naar drukker' }),
      }),
      { params: { id: header.id } }
    );
    await patchLine(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prijs: 199 }),
      }),
      { params: { id: header.id, lineId } }
    );

    const [headerRows] = await getPool().query('SELECT status FROM bestelheaders WHERE id = ?', [
      header.id,
    ]);
    expect((headerRows as Array<{ status: string }>)[0].status).toBe('Te versturen naar drukker');
    const [updatedLineRows] = await getPool().query('SELECT prijs FROM bestellines WHERE id = ?', [
      lineId,
    ]);
    expect(Number((updatedLineRows as Array<{ prijs: string }>)[0].prijs)).toBe(199);
  });

  it('rejects a line with a non-positive quantity', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'e@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    const response = await createHeader(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          klantId: klant.id,
          lines: [{ kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 100, quantity: 0 }],
        }),
      })
    );
    expect(response.status).toBe(400);
    const [rows] = await getPool().query('SELECT id FROM bestelheaders WHERE klantId = ?', [klant.id]);
    expect((rows as unknown[]).length).toBe(0);
  });

  it('rejects a line with a non-positive prijs', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'f@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    const response = await createHeader(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          klantId: klant.id,
          lines: [{ kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: -5, quantity: 1 }],
        }),
      })
    );
    expect(response.status).toBe(400);
  });

  it('rejects ordering an artwork exclusively reserved for a different klant', async () => {
    const klantA = await insertRow<{ id: string }>('klanten', {
      email: 'g@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    const klantB = await insertRow<{ id: string }>('klanten', {
      email: 'h@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    const kunstenaar = await insertRow<{ id: string }>('kunstenaars', {
      naam: 'Exclusieve Artiest',
      verkooprecht: 'open',
      exclusiefVoorKlantId: klantB.id,
    } as never);
    const kunstwerk = await insertRow<{ id: string }>('kunstwerken', {
      naam: 'Werk',
      kunstenaarId: kunstenaar.id,
    } as never);

    const response = await createHeader(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          klantId: klantA.id,
          lines: [{ kunstwerkId: kunstwerk.id, maatId: 'maat-1', materiaalId: 'mat-1', prijs: 100, quantity: 1 }],
        }),
      })
    );
    expect(response.status).toBe(403);

    const allowedForB = await createHeader(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          klantId: klantB.id,
          lines: [{ kunstwerkId: kunstwerk.id, maatId: 'maat-1', materiaalId: 'mat-1', prijs: 100, quantity: 1 }],
        }),
      })
    );
    expect(allowedForB.status).toBe(201);
  });

  it('rejects ordering an artist-only artwork from a klant who is not that artist', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'i@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    const kunstenaar = await insertRow<{ id: string }>('kunstenaars', {
      naam: 'Alleen-zelf Artiest',
      verkooprecht: 'alleen-kunstenaar',
    } as never);
    const kunstwerk = await insertRow<{ id: string }>('kunstwerken', {
      naam: 'Werk 2',
      kunstenaarId: kunstenaar.id,
    } as never);

    const response = await createHeader(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          klantId: klant.id,
          lines: [{ kunstwerkId: kunstwerk.id, maatId: 'maat-1', materiaalId: 'mat-1', prijs: 100, quantity: 1 }],
        }),
      })
    );
    expect(response.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/api/bestelheaders.test.ts`
Expected: FAIL — cannot find the route modules

- [ ] **Step 3: Implement the collection route (create + list)**

```typescript
// src/app/api/bestelheaders/route.ts
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getPool } from '@/lib/server/db';
import type { PoolConnection } from 'mysql2/promise';

const BESTELNR_PADDING = 5;

interface LineInput {
  kunstwerkId: string;
  maatId: string;
  materiaalId: string;
  prijs: number | null;
  quantity: number;
  breedte?: number;
  hoogte?: number;
}

function validateLine(line: LineInput): string | null {
  if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
    return 'invalid-quantity';
  }
  if (line.prijs !== null && (typeof line.prijs !== 'number' || line.prijs <= 0)) {
    return 'invalid-prijs';
  }
  return null;
}

// Mirrors src/lib/resolveOrderRight.ts, which is now a client-side UI hint only —
// this is the real enforcement, since there is no Firestore-rules layer anymore.
async function checkOrderRight(
  connection: PoolConnection,
  kunstwerkId: string,
  klantId: string
): Promise<boolean> {
  const [kunstwerkRows] = await connection.query(
    'SELECT kunstenaarId FROM kunstwerken WHERE id = ?',
    [kunstwerkId]
  );
  const kunstenaarId = (kunstwerkRows as Array<{ kunstenaarId: string | null }>)[0]?.kunstenaarId;
  if (!kunstenaarId) return true;

  const [kunstenaarRows] = await connection.query(
    'SELECT verkooprecht, klantId, exclusiefVoorKlantId FROM kunstenaars WHERE id = ?',
    [kunstenaarId]
  );
  const kunstenaar = (
    kunstenaarRows as Array<{ verkooprecht: string; klantId: string | null; exclusiefVoorKlantId: string | null }>
  )[0];
  if (!kunstenaar) return false;

  const isOwnArtwork = kunstenaar.klantId != null && kunstenaar.klantId === klantId;
  if (isOwnArtwork) return true;
  const isExclusiveToOther =
    kunstenaar.exclusiefVoorKlantId != null && kunstenaar.exclusiefVoorKlantId !== klantId;
  if (isExclusiveToOther) return false;
  const isArtistOnlyForOthers = kunstenaar.verkooprecht !== 'open';
  return !isArtistOnlyForOthers;
}

export async function POST(request: Request) {
  const { klantId, lines } = (await request.json()) as { klantId: string; lines: LineInput[] };

  for (const line of lines) {
    const validationError = validateLine(line);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
  }

  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    for (const line of lines) {
      if (!(await checkOrderRight(connection, line.kunstwerkId, klantId))) {
        await connection.rollback();
        return NextResponse.json({ error: 'order-not-allowed' }, { status: 403 });
      }
    }

    const [counterRows] = await connection.query(
      'UPDATE counters SET value = value + 1 WHERE id = ?',
      ['bestelnummer']
    );
    void counterRows;
    const [valueRows] = await connection.query('SELECT value FROM counters WHERE id = ?', [
      'bestelnummer',
    ]);
    const nextValue = (valueRows as Array<{ value: number }>)[0].value;
    const bestelnr = `GD-${String(nextValue).padStart(BESTELNR_PADDING, '0')}`;

    const headerId = randomUUID();
    await connection.query(
      'INSERT INTO bestelheaders (id, klantId, bestelnr, status) VALUES (?, ?, ?, ?)',
      [headerId, klantId, bestelnr, 'Te beoordelen']
    );

    for (const line of lines) {
      await connection.query(
        'INSERT INTO bestellines (id, bestelheaderId, kunstwerkId, maatId, materiaalId, prijs, quantity, breedte, hoogte) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          randomUUID(),
          headerId,
          line.kunstwerkId,
          line.maatId,
          line.materiaalId,
          line.prijs,
          line.quantity,
          line.breedte ?? null,
          line.hoogte ?? null,
        ]
      );
    }

    await connection.commit();
    return NextResponse.json({ id: headerId, bestelnr }, { status: 201 });
  } catch {
    await connection.rollback();
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  } finally {
    connection.release();
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const klantId = url.searchParams.get('klantId');
  const pool = getPool();

  const [headers] = klantId
    ? await pool.query('SELECT * FROM bestelheaders WHERE klantId = ?', [klantId])
    : await pool.query('SELECT * FROM bestelheaders');

  const result = await Promise.all(
    (headers as Array<Record<string, unknown>>).map(async (header) => {
      const [lines] = await pool.query('SELECT * FROM bestellines WHERE bestelheaderId = ?', [
        header.id,
      ]);
      return { ...header, lines };
    })
  );
  return NextResponse.json(result);
}
```

- [ ] **Step 4: Implement the header-status route**

```typescript
// src/app/api/bestelheaders/[id]/route.ts
import { NextResponse } from 'next/server';
import { updateRow } from '@/lib/server/crud';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const data = await request.json();
    await updateRow('bestelheaders', params.id, data);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}
```

- [ ] **Step 5: Implement the line-price route**

```typescript
// src/app/api/bestelheaders/[id]/bestellines/[lineId]/route.ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; lineId: string } }
) {
  const { prijs } = (await request.json()) as { prijs: number };
  await getPool().query('UPDATE bestellines SET prijs = ? WHERE id = ? AND bestelheaderId = ?', [
    prijs,
    params.lineId,
    params.id,
  ]);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/app/api/bestelheaders.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 7: Commit**

```bash
git add src/app/api/bestelheaders tests/app/api/bestelheaders.test.ts
git commit -m "feat: add bestelheaders/bestellines API routes with order-right and line validation"
```

---

## Task 15: `activiteitenlog` API route

**Files:**
- Modify: `src/lib/logActiviteit.ts` (add a runtime `ACTIVITEIT_TYPES` array that `ActiviteitType` is derived from — everything else in the file is untouched here, the Firestore rewrite happens in Task 16)
- Create: `src/app/api/activiteitenlog/route.ts`
- Test: `tests/app/api/activiteitenlog.test.ts`

**Interfaces:**
- Consumes: `getPool` (Task 1).
- Produces: `POST /api/activiteitenlog` (insert, validates `type` against `ACTIVITEIT_TYPES`), `GET /api/activiteitenlog` (list, newest 500 first) — replaces `logActiviteit.ts` and `BeheerShell`'s direct Firestore query.
- **Security note (per the design addendum):** `firestore.rules` used to allow-list valid `type` values as a *second, independently-maintained* copy of the `ActiviteitType` union. That drift risk is eliminated here by making `ACTIVITEIT_TYPES` the one runtime source of truth — both `logActiviteit.ts`'s exported type and this route's validation derive from the same array.

- [ ] **Step 1: Add the runtime `ACTIVITEIT_TYPES` array**

In `src/lib/logActiviteit.ts`, replace the `export type ActiviteitType = ...` union with:

```typescript
// src/lib/logActiviteit.ts — replace the top-level ActiviteitType declaration with:
export const ACTIVITEIT_TYPES = [
  'kunstwerk_bekeken',
  'mandje_toegevoegd',
  'bestelling_geplaatst',
  'account_bezocht',
  'word_klant_bezocht',
  'word_klant_aanvraag',
  'klant_goedgekeurd',
  'klant_afgewezen',
  'klant_gewijzigd',
  'klant_prijsgroep_gewijzigd',
  'bestelling_goedgekeurd',
  'bestelling_afgewezen',
  'materiaalsoort_toegevoegd',
  'materiaalsoort_gewijzigd',
  'materiaalsoort_verwijderd',
  'materiaal_toegevoegd',
  'materiaal_gewijzigd',
  'materiaal_verwijderd',
  'maat_toegevoegd',
  'maat_gewijzigd',
  'maat_verwijderd',
  'segment_toegevoegd',
  'segment_gewijzigd',
  'segment_verwijderd',
  'kunstwerk_toegevoegd',
  'kunstwerk_gewijzigd',
  'kunstwerk_verwijderd',
  'prijsgroep_toegevoegd',
  'prijsgroep_gewijzigd',
  'prijsgroep_verwijderd',
  'bedrijfsgegevens_gewijzigd',
  'mandje_eigen_maat_toegevoegd',
  'bestelling_prijs_vastgesteld',
  'bestelling_regel_gewijzigd',
  'kunstenaar_toegevoegd',
  'kunstenaar_gewijzigd',
  'kunstenaar_verwijderd',
  'klant_exclusiviteit_gewijzigd',
  'drukker_toegevoegd',
  'drukker_gewijzigd',
  'drukker_verwijderd',
  'bestelling_verstuurd_naar_drukker',
  'bestelinstellingen_gewijzigd',
  'klant_minimale_afname_gewijzigd',
  'stijl_toegevoegd',
  'stijl_gewijzigd',
  'stijl_verwijderd',
  'onderwerp_toegevoegd',
  'onderwerp_gewijzigd',
  'onderwerp_verwijderd',
] as const;

export type ActiviteitType = (typeof ACTIVITEIT_TYPES)[number];
```

(Leave every other export in the file — `ActiviteitActor`, `ONBEKENDE_ACTOR`, the `logActiviteit` function body, `actorFromCustomer`, `actorFromMedewerker` — exactly as they are; Task 16 rewrites `logActiviteit`'s body separately.)

- [ ] **Step 2: Write the failing test**

```typescript
// tests/app/api/activiteitenlog.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { POST, GET } from '@/app/api/activiteitenlog/route';

beforeEach(async () => {
  await getPool().query('DELETE FROM activiteitenlog');
});

describe('activiteitenlog route', () => {
  it('inserts an entry (with omschrijving) and lists it back, newest first', async () => {
    await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'bestelling_geplaatst',
          actorId: 'k1',
          actorEmail: 'k@x.com',
          actorNaam: 'Acme',
          omschrijving: 'Bestelling GD-00001',
        }),
      })
    );
    const response = await GET();
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].type).toBe('bestelling_geplaatst');
    expect(body[0].omschrijving).toBe('Bestelling GD-00001');
  });

  it('rejects an unknown activiteit type', async () => {
    const response = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'niet_bestaand_type', actorId: null, actorEmail: 'x', actorNaam: 'x' }),
      })
    );
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/app/api/activiteitenlog.test.ts`
Expected: FAIL — cannot find `@/app/api/activiteitenlog/route`

- [ ] **Step 4: Implement the route**

```typescript
// src/app/api/activiteitenlog/route.ts
import { NextResponse } from 'next/server';
import { insertRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { ACTIVITEIT_TYPES } from '@/lib/logActiviteit';

export async function POST(request: Request) {
  const data = await request.json();
  if (!ACTIVITEIT_TYPES.includes(data.type)) {
    return NextResponse.json({ error: 'invalid-type' }, { status: 400 });
  }
  try {
    await insertRow('activiteitenlog', data);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}

export async function GET() {
  const [rows] = await getPool().query(
    'SELECT * FROM activiteitenlog ORDER BY timestamp DESC LIMIT 500'
  );
  return NextResponse.json(rows);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/app/api/activiteitenlog.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/logActiviteit.ts src/app/api/activiteitenlog tests/app/api/activiteitenlog.test.ts
git commit -m "feat: add activiteitenlog API route with single-source-of-truth type validation"
```

---

## Task 16: Rewrite `logActiviteit.ts` and `generateBestelnr.ts`

**Files:**
- Modify: `src/lib/logActiviteit.ts` (only the `logActiviteit` function body changes; types and `actorFrom*` helpers stay identical)
- Modify: `src/lib/generateBestelnr.ts` (deprecated as a standalone export — bestelnr generation now lives server-side in Task 14; this file is deleted and `CartPanel.tsx` calls the new `/api/bestelheaders` endpoint directly, see Task 17)
- Test: `tests/lib/logActiviteit.test.ts`

**Interfaces:**
- Produces: `logActiviteit(type, actor): Promise<void>` — identical signature, now POSTs to `/api/activiteitenlog` instead of writing to Firestore.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/logActiviteit.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { logActiviteit } from '@/lib/logActiviteit';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('logActiviteit', () => {
  it('POSTs the activity to /api/activiteitenlog', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    await logActiviteit('bestelling_geplaatst', { id: 'k1', email: 'k@x.com', naam: 'Acme' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/activiteitenlog',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          type: 'bestelling_geplaatst',
          actorId: 'k1',
          actorEmail: 'k@x.com',
          actorNaam: 'Acme',
        }),
      })
    );
  });

  it('never throws when the request fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network error'));
    await expect(
      logActiviteit('kunstwerk_toegevoegd', { id: null, email: 'Onbekend', naam: 'Onbekend' })
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/logActiviteit.test.ts`
Expected: FAIL — current implementation calls Firestore's `addDoc`, not `fetch`

- [ ] **Step 3: Rewrite the `logActiviteit` function** (keep everything else in the file — types, `ONBEKENDE_ACTOR`, `actorFromCustomer`, `actorFromMedewerker` — unchanged)

```typescript
// src/lib/logActiviteit.ts (replace only the imports and the logActiviteit function)
export async function logActiviteit(type: ActiviteitType, actor: ActiviteitActor): Promise<void> {
  try {
    await fetch('/api/activiteitenlog', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type,
        actorId: actor.id,
        actorEmail: actor.email,
        actorNaam: actor.naam,
      }),
    });
  } catch {
    // Fire-and-forget: a failed log write must never block or surface an
    // error for the underlying user action (page visit, cart add, etc.).
  }
}
```

(Remove the `import { addDoc, collection, serverTimestamp } from 'firebase/firestore';` and `import { db } from '@/lib/firebase';` lines at the top of the file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/logActiviteit.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Delete `generateBestelnr.ts`**

Run: `rm src/lib/generateBestelnr.ts`

(Its only caller, `CartPanel.tsx`, is updated in Task 17 to call `/api/bestelheaders` directly, which now generates the `bestelnr` server-side.)

- [ ] **Step 6: Commit**

```bash
git add -u src/lib/logActiviteit.ts tests/lib/logActiviteit.test.ts
git commit -m "feat: rewrite logActiviteit to use API route, remove generateBestelnr"
```

---

## Task 17: Migrate `CartPanel.tsx`

**Files:**
- Modify: `src/components/CartPanel.tsx`
- Test: existing test file for CartPanel if present, otherwise verify manually per Step 4 below (no CartPanel test file exists in `tests/` today, per the current test suite)

**Interfaces:**
- Consumes: `POST /api/bestelheaders` (Task 14).

- [ ] **Step 1: Replace the Firestore imports and `handlePlaceOrder` body**

```typescript
// src/components/CartPanel.tsx — replace the top imports:
// remove: import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
// remove: import { db } from '@/lib/firebase';
// remove: import { generateBestelnr } from '@/lib/generateBestelnr';
```

```typescript
// src/components/CartPanel.tsx — replace handlePlaceOrder's body
  async function handlePlaceOrder() {
    if (!user) {
      return;
    }
    setPlaceOrderError(null);
    setEmailError(false);
    try {
      const response = await fetch('/api/bestelheaders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          klantId: user.uid,
          lines: items.map((item) => ({
            kunstwerkId: item.kunstwerkId,
            maatId: item.maatId,
            materiaalId: item.materiaalId,
            prijs: item.prijs,
            quantity: item.quantity,
            ...(item.breedte != null ? { breedte: item.breedte } : {}),
            ...(item.hoogte != null ? { hoogte: item.hoogte } : {}),
          })),
        }),
      });
      if (!response.ok) throw new Error('order failed');
      clear();
      setOrderPlaced(true);
      void logActiviteit('bestelling_geplaatst', actorFromCustomer(user));
      if (user.email) {
        void sendConfirmationEmail(user.email);
      }
    } catch {
      setPlaceOrderError(t('placeOrderError'));
    }
  }
```

- [ ] **Step 2: Run the full test suite to check nothing else references the removed imports**

Run: `npm run test`
Expected: PASS — no test references `generateBestelnr` or Firestore in `CartPanel`

- [ ] **Step 3: Commit**

```bash
git add src/components/CartPanel.tsx
git commit -m "feat: migrate CartPanel to /api/bestelheaders"
```

---

## Task 18: Migrate customer account flow (`RegistrationForm`, `CustomerLoginForm`, `SettingsSection`)

**Files:**
- Modify: `src/components/RegistrationForm.tsx`
- Modify: `src/components/CustomerLoginForm.tsx`
- Modify: `src/components/account/SettingsSection.tsx`

**Interfaces:**
- Consumes: `POST /api/auth/register`, `POST /api/auth/login`, `DELETE /api/klanten/:id` (Tasks 6, 13).

- [ ] **Step 1: Rewrite `RegistrationForm.tsx`'s `handleSubmit`**

```typescript
// src/components/RegistrationForm.tsx — remove Firebase imports:
// remove: import { createUserWithEmailAndPassword, deleteUser, signOut, type UserCredential } from 'firebase/auth';
// remove: import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
// remove: import { auth, db } from '@/lib/firebase';
```

```typescript
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (formData.get('password') !== formData.get('passwordConfirm')) {
      setPasswordError(t('passwordMismatch'));
      return;
    }
    setPasswordError(null);
    setSubmitError(null);

    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const companyName = formData.get('companyName') as string;

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          companyName,
          kvk: formData.get('kvk') as string,
          contactPerson: formData.get('contactPerson') as string,
          phone: formData.get('phone') as string,
          contactPreference: formData.get('contactPreference') as string,
          address: formData.get('address') as string,
          postcode: formData.get('postcode') as string,
          city: formData.get('city') as string,
          deliveryAddress: (formData.get('deliveryAddress') as string) || '',
          deliveryPostcode: (formData.get('deliveryPostcode') as string) || '',
          deliveryCity: (formData.get('deliveryCity') as string) || '',
          invoiceAddress: (formData.get('invoiceAddress') as string) || '',
          invoicePostcode: (formData.get('invoicePostcode') as string) || '',
          invoiceCity: (formData.get('invoiceCity') as string) || '',
        }),
      });
      if (!response.ok) {
        const body = await response.json();
        setSubmitError(body.error === 'email-in-use' ? t('emailInUseError') : t('submitError'));
        return;
      }
      void logActiviteit('word_klant_aanvraag', { id: null, email, naam: companyName });
      setIsSubmitted(true);
    } catch {
      setSubmitError(t('submitError'));
    }
  }
```

- [ ] **Step 2: Rewrite `CustomerLoginForm.tsx`'s `handleSubmit`**

```typescript
// src/components/CustomerLoginForm.tsx — remove Firebase imports:
// remove: import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
// remove: import { doc, getDoc } from 'firebase/firestore';
// remove: import { auth, db } from '@/lib/firebase';
```

```typescript
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        setError(t('loginError'));
        return;
      }
      const body = await response.json();
      if (body.status === 'Goedgekeurd') {
        router.replace('/account');
      } else if (body.status === 'Beoordelen') {
        setError(t('pendingMessage'));
      } else if (body.status === 'Afgewezen') {
        setError(t('rejectedMessage'));
      } else {
        setError(t('accountIncompleteMessage'));
      }
    } catch {
      setError(t('loginError'));
    }
  }
```

- [ ] **Step 3: Rewrite `SettingsSection.tsx`'s `handleDeleteAccount`**

```typescript
// src/components/account/SettingsSection.tsx — remove Firebase imports:
// remove: import { signInWithEmailAndPassword, deleteUser } from 'firebase/auth';
// remove: import { doc, deleteDoc } from 'firebase/firestore';
// remove: import { auth, db } from '@/lib/firebase';
```

```typescript
  async function handleDeleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDeleteError(null);
    try {
      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: user?.email ?? '', password: deletePassword }),
      });
      if (!loginResponse.ok) {
        setDeleteError(t('deleteAccountError'));
        return;
      }
      const deleteResponse = await fetch(`/api/klanten/${user?.uid ?? ''}`, { method: 'DELETE' });
      if (!deleteResponse.ok) {
        setDeleteError(t('deleteAccountPartialError'));
        return;
      }
    } catch {
      setDeleteError(t('deleteAccountError'));
      return;
    }

    await logout();
    router.replace('/');
  }
```

- [ ] **Step 4: Run the full test suite**

Run: `npm run test`
Expected: PASS — check for any existing tests covering these three components and update their Firebase mocks if present (search `tests/` for `firebase/auth` or `firebase/firestore` mocks referencing these files, and replace with `vi.stubGlobal('fetch', ...)` mocks following the pattern in Task 9/10's tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/RegistrationForm.tsx src/components/CustomerLoginForm.tsx src/components/account/SettingsSection.tsx
git commit -m "feat: migrate customer account flow to session API"
```

---

## Task 19: Migrate `useAllOrders.tsx` and `BestellingModal.tsx`

**Files:**
- Modify: `src/lib/useAllOrders.tsx`
- Modify: `src/components/beheer/BestellingModal.tsx`

**Interfaces:**
- Consumes: `GET /api/bestelheaders?klantId=...`, `PATCH /api/bestelheaders/:id`, `PATCH /api/bestelheaders/:id/bestellines/:lineId` (Task 14).

- [ ] **Step 1: Rewrite `useAllOrders.tsx`'s `loadRealOrders`**

```typescript
// src/lib/useAllOrders.tsx — remove:
// import { collection, getDocs, query, where } from 'firebase/firestore';
// import { db } from '@/lib/firebase';
```

```typescript
    async function loadRealOrders() {
      setLoadError(false);
      try {
        const response = await fetch(`/api/bestelheaders?klantId=${user!.uid}`);
        if (!response.ok) throw new Error('load failed');
        const headers = (await response.json()) as Array<{
          id: string;
          bestelnr: string;
          besteldatum: string;
          lines: Array<{
            id: string;
            kunstwerkId: string | null;
            maatId: string | null;
            materiaalId: string | null;
            breedte?: number;
            hoogte?: number;
            prijs: number | null;
            quantity: number;
          }>;
        }>;
        const orders = headers.map((header) => ({
          id: header.bestelnr ?? header.id,
          date: header.besteldatum ? new Date(header.besteldatum) : null,
          lineCount: header.lines.length,
          totalQuantity: header.lines.reduce((sum, line) => sum + (line.quantity ?? 0), 0),
          lines: header.lines,
        }));
        if (!cancelled) {
          setRealOrders(orders);
        }
      } catch {
        if (!cancelled) {
          setRealOrders([]);
          setLoadError(true);
        }
      }
    }
```

- [ ] **Step 2: Rewrite `BestellingModal.tsx`'s handlers**

```typescript
// src/components/beheer/BestellingModal.tsx — remove:
// import { doc, updateDoc } from 'firebase/firestore';
// import { db } from '@/lib/firebase';
```

```typescript
  async function handleGoedkeuren() {
    if (!bestelling) return;
    try {
      const response = await fetch(`/api/bestelheaders/${bestelling.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Goedgekeurd' }),
      });
      if (!response.ok) throw new Error('update failed');
      void logActiviteit('bestelling_goedgekeurd', actorFromMedewerker(user));
      onUpdated({ ...bestelling, status: 'Goedgekeurd' });
    } catch {
      setError(t('bestellingenActionError'));
    }
  }

  async function handleAfwijzen() {
    if (!bestelling) return;
    try {
      const response = await fetch(`/api/bestelheaders/${bestelling.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Afgewezen' }),
      });
      if (!response.ok) throw new Error('update failed');
      void logActiviteit('bestelling_afgewezen', actorFromMedewerker(user));
      onUpdated({ ...bestelling, status: 'Afgewezen' });
    } catch {
      setError(t('bestellingenActionError'));
    }
  }

  async function handlePrijsVaststellen(line: BestellingLine) {
    if (!bestelling) return;
    const prijs = Number(prijsDrafts[line.id]);
    if (!prijs || prijs <= 0) return;
    try {
      const response = await fetch(
        `/api/bestelheaders/${bestelling.id}/bestellines/${line.id}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prijs }),
        }
      );
      if (!response.ok) throw new Error('update failed');
      void logActiviteit('bestelling_prijs_vastgesteld', actorFromMedewerker(user));
      onLinePrijsVastgesteld(bestelling.id, line.id, prijs);
    } catch {
      setError(t('bestellingenActionError'));
    }
  }
```

- [ ] **Step 3: Run the full test suite**

Run: `npm run test`
Expected: PASS — update any existing Firebase mocks for these two files to `fetch` mocks

- [ ] **Step 4: Commit**

```bash
git add src/lib/useAllOrders.tsx src/components/beheer/BestellingModal.tsx
git commit -m "feat: migrate useAllOrders and BestellingModal to bestelheaders API"
```

---

## Task 20: Migrate `BeheerShell.tsx` and `KlantModal.tsx`

**Files:**
- Modify: `src/components/beheer/BeheerShell.tsx`
- Modify: `src/components/beheer/KlantModal.tsx`

**Interfaces:**
- Consumes: `GET /api/klanten`, `PATCH /api/klanten/:id` (Task 13), `GET /api/bestelheaders` (Task 14), `GET /api/activiteitenlog` (Task 15), `useApiCollection`/`useApiRecord` (Task 9).

- [ ] **Step 1: Replace `BeheerShell.tsx`'s three `useEffect` Firestore loaders**

```typescript
// src/components/beheer/BeheerShell.tsx — remove:
// import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
// import { db } from '@/lib/firebase';
// import { useFirestoreCollection } from '@/lib/useFirestoreCollection';
// import { useFirestoreDocument } from '@/lib/useFirestoreDocument';
// add:
// import { useApiCollection } from '@/lib/useApiCollection';
// import { useApiRecord } from '@/lib/useApiRecord';
```

```typescript
  useEffect(() => {
    let cancelled = false;
    async function loadKlanten() {
      try {
        const response = await fetch('/api/klanten');
        if (!response.ok) throw new Error('load failed');
        const rows = (await response.json()) as Klant[];
        if (!cancelled) {
          setKlanten(rows);
          setLoadError(null);
        }
      } catch {
        if (!cancelled) setLoadError(t('klantenLoadError'));
      }
    }
    loadKlanten();
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    async function loadBestellingen() {
      try {
        const response = await fetch('/api/bestelheaders');
        if (!response.ok) throw new Error('load failed');
        const headers = (await response.json()) as Array<{
          id: string;
          klantId: string;
          besteldatum: string;
          status: string;
          lines: BestellingLine[];
        }>;
        if (!cancelled) {
          setRawBestellingen(
            headers.map((header) => ({
              id: header.id,
              klantId: header.klantId,
              besteldatum: new Date(header.besteldatum).toLocaleDateString('nl-NL'),
              status: header.status,
              lineCount: header.lines.length,
              totalQuantity: header.lines.reduce((sum, line) => sum + (line.quantity ?? 0), 0),
              lines: header.lines,
            }))
          );
          setBestellingenLoadError(null);
        }
      } catch {
        if (!cancelled) setBestellingenLoadError(t('bestellingenLoadError'));
      }
    }
    loadBestellingen();
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    async function loadActiviteiten() {
      try {
        const response = await fetch('/api/activiteitenlog');
        if (!response.ok) throw new Error('load failed');
        const rows = (await response.json()) as Array<{
          id: string;
          type: ActiviteitType;
          actorEmail: string;
          actorNaam: string;
          timestamp: string;
        }>;
        if (!cancelled) {
          setActiviteiten(
            rows.map((row) => ({
              id: row.id,
              type: row.type,
              actorEmail: row.actorEmail,
              actorNaam: row.actorNaam,
              timestamp: row.timestamp ? new Date(row.timestamp) : null,
            }))
          );
          setActiviteitenLoadError(null);
        }
      } catch {
        if (!cancelled) setActiviteitenLoadError(t('activiteitLoadError'));
      }
    }
    loadActiviteiten();
    return () => {
      cancelled = true;
    };
  }, [t]);
```

- [ ] **Step 2: Swap the generic hook calls (bottom of the component)**

```typescript
  const materiaalsoorten = useApiCollection<Materiaalsoort>('materiaalsoorten', {
    seed: MATERIAALSOORTEN_SEED,
  });
  const materialenSeed = materiaalsoorten.items ? buildMaterialenSeed(materiaalsoorten.items) : undefined;
  const materialen = useApiCollection<Materiaal>('materialen', {
    seed: materialenSeed,
    skip: materiaalsoorten.items === null,
  });
  const maten = useApiCollection<Maat>('maten', { seed: MATEN_SEED });
  const segmenten = useApiCollection<Segment>('segmenten', { seed: SEGMENTEN_SEED });

  const kunstwerkenReady = segmenten.items !== null && materialen.items !== null && maten.items !== null;
  const kunstwerkenSeed = kunstwerkenReady
    ? buildKunstwerkenSeed(segmenten.items!, materialen.items!, maten.items!)
    : undefined;
  const kunstwerken = useApiCollection<Kunstwerk>('kunstwerken', {
    seed: kunstwerkenSeed,
    skip: !kunstwerkenReady,
  });
  const prijsgroepen = useApiCollection<Prijsgroep>('prijsgroepen');
  const bedrijfsgegevens = useApiRecord<Bedrijfsgegevens>('instellingen', 'bedrijfsgegevens', {
    seed: BEDRIJFSGEGEVENS_SEED,
  });
```

Note: `useApiCollection` already re-seeds an empty collection via these `SEED` constants (built into `fetchItems` in Task 9), matching `useFirestoreCollection`'s old behavior — no further changes needed here.

- [ ] **Step 3: Rewrite `KlantModal.tsx`'s handlers**

```typescript
// src/components/beheer/KlantModal.tsx — remove:
// import { doc, updateDoc } from 'firebase/firestore';
// import { db } from '@/lib/firebase';
```

```typescript
  async function handleGoedkeuren() {
    if (!klant) return;
    try {
      const response = await fetch(`/api/klanten/${klant.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Goedgekeurd', prijsgroepId }),
      });
      if (!response.ok) throw new Error('update failed');
      void logActiviteit('klant_goedgekeurd', actorFromMedewerker(user));
      onUpdated({ ...klant, status: 'Goedgekeurd', prijsgroepId });
    } catch {
      setError(t('klantenActionError'));
    }
  }

  async function handleAfwijzen() {
    if (!klant) return;
    try {
      const response = await fetch(`/api/klanten/${klant.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Afgewezen' }),
      });
      if (!response.ok) throw new Error('update failed');
      void logActiviteit('klant_afgewezen', actorFromMedewerker(user));
      onUpdated({ ...klant, status: 'Afgewezen' });
    } catch {
      setError(t('klantenActionError'));
    }
  }
```

- [ ] **Step 4: Run the full test suite**

Run: `npm run test`
Expected: PASS — update any Firebase mocks in `BeheerShell`/`KlantModal` related tests to `fetch` mocks

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/BeheerShell.tsx src/components/beheer/KlantModal.tsx src/lib/useApiCollection.ts tests/lib/useApiCollection.test.tsx
git commit -m "feat: migrate BeheerShell and KlantModal to API hooks/routes"
```

---

## Task 21: Migrate `ProductsGrid`, `FeaturedWorks`, `OrdersSection`, `ContactInfo`

**Files:**
- Modify: `src/components/ProductsGrid.tsx`
- Modify: `src/components/FeaturedWorks.tsx`
- Modify: `src/components/account/OrdersSection.tsx`
- Modify: `src/components/ContactInfo.tsx`

**Interfaces:**
- Consumes: `useApiCollection`, `useApiRecord` (Task 9), with the seeding addition from Task 20.

- [ ] **Step 1: Swap imports and hook calls in each file**

In each of the four files, replace:
```typescript
import { useFirestoreCollection } from '@/lib/useFirestoreCollection';
```
with:
```typescript
import { useApiCollection } from '@/lib/useApiCollection';
```
and every call site `useFirestoreCollection<X>('resource', ...)` becomes `useApiCollection<X>('resource', ...)` — the arguments are unchanged (verify with `grep -rn useFirestoreCollection src/components/ProductsGrid.tsx src/components/FeaturedWorks.tsx src/components/account/OrdersSection.tsx` before and after to confirm every call site was updated).

For `ContactInfo.tsx`, replace:
```typescript
import { useFirestoreDocument } from '@/lib/useFirestoreDocument';
```
with:
```typescript
import { useApiRecord } from '@/lib/useApiRecord';
```
and its `useFirestoreDocument<Bedrijfsgegevens>('instellingen', 'bedrijfsgegevens')` call becomes `useApiRecord<Bedrijfsgegevens>('instellingen', 'bedrijfsgegevens')`.

- [ ] **Step 2: Run the full test suite**

Run: `npm run test`
Expected: PASS — these four components receive data as props from hooks with an identical interface, so no other logic changes; any test mocking `useFirestoreCollection`/`useFirestoreDocument` for these components needs its `vi.mock('@/lib/useFirestoreCollection', ...)` path updated to `vi.mock('@/lib/useApiCollection', ...)` (search with `grep -rln "useFirestoreCollection\|useFirestoreDocument" tests/`)

- [ ] **Step 3: Commit**

```bash
git add src/components/ProductsGrid.tsx src/components/FeaturedWorks.tsx src/components/account/OrdersSection.tsx src/components/ContactInfo.tsx
git commit -m "feat: migrate remaining catalog/display components to API hooks"
```

---

## Task 22: Data migration script (`instellingen` + `medewerkers`)

**Files:**
- Create: `scripts/migrate-firebase-data.ts`

**Interfaces:**
- Consumes: `firebase-admin` (temporary dev dependency, only for this one-off script — not part of the deployed app), `getPool` (Task 1), `hashPassword` is **not** used here (per the design, medewerker passwords are not migrated).

- [ ] **Step 1: Install `firebase-admin` as a dev dependency**

Run: `npm install --save-dev firebase-admin`

- [ ] **Step 2: Write the migration script**

```typescript
// scripts/migrate-firebase-data.ts
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';
import { getPool } from '../src/lib/server/db';

// Requires GOOGLE_APPLICATION_CREDENTIALS env var pointing at a Firebase
// service-account JSON key (download from Firebase Console > Project
// Settings > Service Accounts > Generate new private key).
initializeApp({ credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS!) });
const firestore = getFirestore();

async function migrateInstellingen() {
  const snapshot = await firestore.doc('instellingen/bedrijfsgegevens').get();
  if (!snapshot.exists) {
    console.log('No instellingen/bedrijfsgegevens document found, skipping.');
    return;
  }
  await getPool().query(
    'INSERT INTO instellingen (id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)',
    ['bedrijfsgegevens', JSON.stringify(snapshot.data())]
  );
  console.log('Migrated instellingen/bedrijfsgegevens.');
}

async function migrateMedewerkers() {
  const snapshot = await firestore.collection('medewerkers').get();
  for (const doc of snapshot.docs) {
    const data = doc.data();
    await getPool().query(
      'INSERT INTO medewerkers (id, email, wachtwoordHash, naam) VALUES (?, ?, ?, ?)',
      [randomUUID(), data.email, 'MIGRATED_NEEDS_RESET', data.naam ?? data.email]
    );
  }
  console.log(`Migrated ${snapshot.docs.length} medewerkers (passwords not carried over — each must use the wachtwoord-vergeten flow).`);
}

async function main() {
  await migrateInstellingen();
  await migrateMedewerkers();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Add a package.json script entry**

```json
// package.json — add under "scripts"
"migrate:firebase-data": "tsx scripts/migrate-firebase-data.ts"
```

Run: `npm install --save-dev tsx`

- [ ] **Step 3: Run it against the real Firebase project and the mijn.host staging database**

Run (with `GOOGLE_APPLICATION_CREDENTIALS` pointing at your downloaded service-account key — `.env.local` already points `getPool()` at the staging database from Task 1):
```bash
GOOGLE_APPLICATION_CREDENTIALS=./firebase-service-account.json npm run migrate:firebase-data
```
Expected output: `Migrated instellingen/bedrijfsgegevens.` and `Migrated N medewerkers (...)`.

**Do not commit `firebase-service-account.json`** — add it to `.gitignore` immediately if it isn't already covered.

- [ ] **Step 4: Verify in MySQL**

Run: `mysql -hh64.mijn.host -P3306 -udv137864_staging -p dv137864_staging -e "SELECT * FROM instellingen; SELECT email, naam FROM medewerkers;"`
Expected: one `instellingen` row and one `medewerkers` row per real staff account.

- [ ] **Step 5: Commit the script (not the credentials file or any data)**

```bash
git add scripts/migrate-firebase-data.ts package.json package-lock.json
git commit -m "feat: add one-off Firebase-to-MySQL data migration script"
```

---

## Task 23: Switch Next.js to server mode

**Files:**
- Modify: `next.config.mjs`

**Interfaces:**
- None (config-only change) — required before deployment, since API routes cannot run under `output: 'export'`.

- [ ] **Step 1: Simplify `next.config.mjs`**

```javascript
// next.config.mjs
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig = {};

export default withNextIntl(nextConfig);
```

- [ ] **Step 2: Verify a local production build works**

Run: `npm run build`
Expected: build succeeds, output shows `ƒ` (server-rendered) route types for pages and API routes, no `output: export` warnings.

- [ ] **Step 3: Verify the built app runs and serves an API route**

Run: `npm run start` (in one terminal), then in another:
```bash
curl http://localhost:3000/api/segmenten
```
Expected: `[]` (empty array, since the staging database's `segmenten` table starts empty)

Stop the `npm run start` process once verified (Ctrl+C).

- [ ] **Step 4: Commit**

```bash
git add next.config.mjs
git commit -m "feat: switch Next.js from static export to server mode"
```

---

## Task 24: Remove Firebase

**Files:**
- Delete: `src/lib/firebase.ts`
- Delete: `src/lib/useFirestoreCollection.ts`
- Delete: `src/lib/useFirestoreDocument.ts`
- Delete: `firestore.rules`
- Delete: `storage.rules`
- Delete: `firebase.json`
- Modify: `package.json` (remove the `firebase` dependency)
- Modify: `tests/setup.ts` (remove any Firebase-related global mocks, if present)

**Interfaces:**
- None — this is pure removal, verified by the full test suite and a clean build.

- [ ] **Step 1: Confirm nothing still imports Firebase**

Run: `grep -rln "from 'firebase" src/ tests/`
Expected: no output (empty). If anything appears, it was missed in an earlier task — go back and finish that task first.

- [ ] **Step 2: Delete the files**

```bash
rm src/lib/firebase.ts src/lib/useFirestoreCollection.ts src/lib/useFirestoreDocument.ts firestore.rules storage.rules firebase.json
```

- [ ] **Step 3: Remove the dependency**

Run: `npm uninstall firebase`

- [ ] **Step 4: Run the full test suite and a production build**

Run: `npm run test && npm run build`
Expected: both PASS with no Firebase-related errors.

- [ ] **Step 5: Commit**

```bash
git add -u package.json package-lock.json
git commit -m "chore: remove Firebase entirely"
```

---

## Task 25: Deploy to mijn.host

**Files:**
- None (infrastructure/deployment steps, no code changes)

**Interfaces:**
- None.

**Note on SSH:** a separate session confirmed this DirectAdmin panel has **no working SSH access** (no "SSH Keys" page, only "Login Keys" which are DirectAdmin panel passwords, not SSH; key-based auth attempts failed with `Permission denied`). Every step below is written to avoid SSH entirely — using DirectAdmin's own UI, Remote MySQL access, and local-build-then-upload instead.

- [ ] **Step 1: Create the production MySQL database via DirectAdmin, with Remote MySQL access**

In DirectAdmin ("Databases"), create a new database (e.g. `glassart_prod`) and a dedicated database user with a strong password. Note the exact database name, username, and password — DirectAdmin typically prefixes both with your account username (e.g. `dv137864_glassart`).

Then open that database's **Access Hosts** (a.k.a. Remote MySQL) setting and add your current public IP address (not the `%` wildcard — mijn.host's own docs discourage that). This is required for Steps 2 and 3 below, since there is no SSH to run these commands on the server itself.

- [ ] **Step 2: Import the schema from your local machine**

Using a local MySQL client (e.g. the `mysql` CLI, or a GUI like DBeaver/TablePlus) pointed at the production host/port/credentials from Step 1:
```bash
mysql -h<mijn.host-mysql-hostname> -P3306 -u<db-user> -p<db-password> <db-name> < db/schema.sql
```
(The MySQL hostname is shown next to the database in DirectAdmin's Databases overview — usually the server's own hostname, e.g. `h64.mijn.host`.)

- [ ] **Step 3: Run the data migration script against production, from your local machine**

Temporarily point your local `.env.local`'s `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` at the production values from Step 1 (keep a backup of your real `.env.local` values to restore afterward), then run the same command as in Task 22, Step 3:
```bash
GOOGLE_APPLICATION_CREDENTIALS=./firebase-service-account.json npm run migrate:firebase-data
```
Restore your local `.env.local` to its original (staging database) values immediately after this succeeds.

- [ ] **Step 4: Set up the production Node.js app in DirectAdmin**

Using the same "Setup Node.js App" flow verified earlier in this conversation for `nodetest.glassartanddesign.com`, create an app for the real domain `glassartanddesign.com`, Node version 20+ or 24 (whichever is available), Application mode **Production**, startup file matching Next.js's production entry (Next.js's own `npm start` via a small `server.js` wrapper, following the same custom-server pattern already proven in the `nodetest-app` test).

- [ ] **Step 5: Set production environment variables**

In the Node.js app's "Environment variables" section in DirectAdmin, set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (the production values from Step 1 — note these can stay as `127.0.0.1`/localhost-style values here, since the app itself runs ON the same server, unlike the temporary remote override in Step 3), and `MAIL_SERVER_RESET_ENDPOINT_URL` (pointing at the existing PHP mail-server's reset-email endpoint).

- [ ] **Step 6: Build locally, then upload the built app**

Since there is no SSH to run `npm run build` on the server, and DirectAdmin's Node.js app page has no equivalent "run build" button (only "Run NPM Install", which runs `npm install` on the server itself — safe to use since this project has no native-binary dependencies per the approved design, so a Linux-built `node_modules` from that button is no different from what a cross-platform build would produce):

1. Locally, run `npm run build` (produces a `.next` folder).
2. Upload the whole repository **including the `.next` folder**, but excluding `node_modules` and `.git`, to the app's Application root via File Manager or FTP (the same zip-then-extract-with-forward-slashes approach used for the `nodetest-app` test works here too — see `nodetest-app/README.md` for the exact PowerShell zip commands).
3. Click DirectAdmin's **"Run NPM Install"** button on the Node.js app page to install `node_modules` on the server (this only needs production dependencies to run the pre-built `.next` output — `next start` does not need dev dependencies).

- [ ] **Step 7: Restart and verify**

Click "RESTART" in DirectAdmin's Node.js app page, then visit `https://glassartanddesign.com/` and confirm the homepage loads, and `https://glassartanddesign.com/api/segmenten` returns `[]` or real data if already seeded.

- [ ] **Step 8: Retire GitHub Pages**

Remove the GitHub Pages deployment workflow (if one exists under `.github/workflows/`) and the `GITHUB_PAGES` env-var branch that used to exist in `next.config.mjs` (already removed in Task 23). Update the DNS/GitHub repository settings to stop publishing to Pages. GitHub itself remains the team's version-control/development workflow, per the earlier discussion in this conversation — only the Pages *hosting* output is retired.
