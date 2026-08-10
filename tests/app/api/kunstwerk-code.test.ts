import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';

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

describe('kunstwerken.code', () => {
  it('slaat een kunstwerk op met een code in plaats van een naam', async () => {
    const id = await maakKunstwerk('test-code-basis');
    const [rows] = await getPool().query('SELECT code FROM kunstwerken WHERE id = ?', [id]);
    expect((rows as Array<{ code: string }>)[0].code).toBe('test-code-basis');
  });

  it('weigert een tweede kunstwerk met dezelfde code, ook met andere hoofdletters', async () => {
    await maakKunstwerk('test-code-dubbel');
    // insertRow gooit de ruwe mysql2-fout door; ER_DUP_ENTRY is wat de UNIQUE-index geeft.
    await expect(maakKunstwerk('TEST-CODE-DUBBEL')).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  });
});
