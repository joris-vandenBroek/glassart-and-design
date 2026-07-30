import { describe, expect, it } from 'vitest';
import {
  SEGMENTEN_SEED,
  MATEN_SEED,
  buildKunstwerkenSeed,
} from '@/data/kunstwerkenSeed';
import type { Segment, Materiaal, Maat } from '@/components/beheer/materiaalTypes';

describe('SEGMENTEN_SEED', () => {
  it('contains the 6 segments from the homepage collections', () => {
    expect(SEGMENTEN_SEED).toEqual([
      { omschrijving: 'Hotel' },
      { omschrijving: 'Restaurant' },
      { omschrijving: 'Wellness' },
      { omschrijving: 'Office' },
      { omschrijving: 'Abstract' },
      { omschrijving: 'Artist Collections' },
    ]);
  });
});

describe('MATEN_SEED', () => {
  it('contains the 11 real standard sizes for veiligheidsglas/plexi/dibond', () => {
    expect(MATEN_SEED).toEqual([
      { breedte: 30, hoogte: 30 },
      { breedte: 50, hoogte: 50 },
      { breedte: 50, hoogte: 70 },
      { breedte: 50, hoogte: 100 },
      { breedte: 60, hoogte: 80 },
      { breedte: 80, hoogte: 80 },
      { breedte: 80, hoogte: 120 },
      { breedte: 100, hoogte: 100 },
      { breedte: 120, hoogte: 120 },
      { breedte: 120, hoogte: 180 },
      { breedte: 100, hoogte: 150 },
    ]);
  });
});

describe('buildKunstwerkenSeed', () => {
  const SEGMENTEN: Segment[] = [
    { id: 'seg-hotel', omschrijving: 'Hotel' },
    { id: 'seg-restaurant', omschrijving: 'Restaurant' },
  ];
  const MATERIALEN: Materiaal[] = [
    { id: 'mat-b', materiaalsoortId: 'soort-1', materiaaldikte: 3, omschrijving: 'B' },
    { id: 'mat-a', materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'A' },
    { id: 'mat-c', materiaalsoortId: 'soort-1', materiaaldikte: 5, omschrijving: 'C' },
  ];
  const MATEN: Maat[] = [
    { id: 'maat-y', breedte: 60, hoogte: 90 },
    { id: 'maat-x', breedte: 40, hoogte: 60 },
    { id: 'maat-z', breedte: 80, hoogte: 120 },
  ];

  it('builds one kunstwerk per photo across only the recognized segments', () => {
    const result = buildKunstwerkenSeed(SEGMENTEN, MATERIALEN, MATEN);
    expect(result.length).toBe(12); // 2 segments * 6 photos each, unrecognized segments in the source data are skipped
  });

  it('assigns each kunstwerk to the correct segment via segmentIds', () => {
    const result = buildKunstwerkenSeed(SEGMENTEN, MATERIALEN, MATEN);
    const hotelCount = result.filter((k) => k.segmentIds.includes('seg-hotel')).length;
    expect(hotelCount).toBe(6);
  });

  it('picks the 2 lowest-id materialen and 2 lowest-id maten deterministically, regardless of input array order', () => {
    const result = buildKunstwerkenSeed(SEGMENTEN, MATERIALEN, MATEN);
    result.forEach((kunstwerk) => {
      expect(kunstwerk.materiaalIds).toEqual(['mat-a', 'mat-b']);
      expect(kunstwerk.maatIds).toEqual(['maat-x', 'maat-y']);
    });
  });

  it('gives each kunstwerk a Dutch placeholder description numbered within its segment, and empty fr/de/en', () => {
    const result = buildKunstwerkenSeed(SEGMENTEN, MATERIALEN, MATEN);
    const hotelDescriptions = result.filter((k) => k.segmentIds.includes('seg-hotel')).map((k) => k.omschrijvingNl);
    expect(hotelDescriptions).toEqual([
      'Hotel paneel 1',
      'Hotel paneel 2',
      'Hotel paneel 3',
      'Hotel paneel 4',
      'Hotel paneel 5',
      'Hotel paneel 6',
    ]);
    expect(result[0].omschrijvingFr).toBe('');
    expect(result[0].omschrijvingDe).toBe('');
    expect(result[0].omschrijvingEn).toBe('');
  });

  it('returns an empty array when there are fewer than 2 materialen or fewer than 2 maten', () => {
    expect(buildKunstwerkenSeed(SEGMENTEN, [MATERIALEN[0]], MATEN)).toEqual([]);
    expect(buildKunstwerkenSeed(SEGMENTEN, MATERIALEN, [MATEN[0]])).toEqual([]);
  });
});
