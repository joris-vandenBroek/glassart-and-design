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
