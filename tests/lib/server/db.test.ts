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
