import type { Kunstwerk, Materiaal, Maat, Segment } from '@/components/beheer/materiaalTypes';

export const SEGMENTEN_SEED: Omit<Segment, 'id'>[] = [
  { omschrijving: 'Hotel' },
  { omschrijving: 'Restaurant' },
  { omschrijving: 'Wellness' },
  { omschrijving: 'Office' },
  { omschrijving: 'Abstract' },
  { omschrijving: 'Artist Collections' },
];

export const MATEN_SEED: Omit<Maat, 'id'>[] = [
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
];

const BASISPRIJS_PER_M2 = 120;
const DIKTETOESLAG_PER_MM = 5;

export function berekenVoorbeeldprijs(materiaaldikte: number, breedte: number, hoogte: number): number {
  const oppervlakteM2 = (breedte * hoogte) / 10000;
  const prijs = oppervlakteM2 * BASISPRIJS_PER_M2 + materiaaldikte * DIKTETOESLAG_PER_MM;
  return Math.round(prijs * 100) / 100;
}

const KUNSTWERKEN_FOTOS_PER_SEGMENT: Record<string, string[]> = {
  Hotel: [
    'https://images.unsplash.com/photo-1625244724120-1fd1d34d00f6?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1677129667171-92abd8740fa3?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1742844552193-2fd3425cd26d?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1758193783649-13371d7fb8dd?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1768346564825-6f90c0b89e2e?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1744782996368-dc5b7e697f4c?q=80&w=1200&auto=format&fit=crop',
  ],
  Restaurant: [
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1643101570532-88c8ecc07c1f?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1653259038915-7cf0b7a4dd6c?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1551632436-cbf8dd35adfa?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1666032119084-82351976a922?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1703565426315-4209c2e88eea?q=80&w=1200&auto=format&fit=crop',
  ],
  Wellness: [
    'https://images.unsplash.com/photo-1757940556610-a114be4733bf?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1761470575018-135c213340eb?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1773924093206-9a433a14bb44?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1780788745510-6c8433984dfe?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1778331246390-2b91f56864e4?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1776763255459-99ddd8eebbfc?q=80&w=1200&auto=format&fit=crop',
  ],
  Office: [
    'https://images.unsplash.com/photo-1497366754035-f200968a6e72?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1706074793638-da28b90ea8ae?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1706074740295-d7a79c079562?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1531973576160-7125cd663d86?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1623177623442-979c1e42c255?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1556761175-4b46a572b786?q=80&w=1200&auto=format&fit=crop',
  ],
  Abstract: [
    'https://images.unsplash.com/photo-1605721911519-3dfeb3be25e7?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1618331833071-ce81bd50d300?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1533208087231-c3618eab623c?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1544733422-251e532ca221?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1532640331846-d2da5987c3ee?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1599753894977-bc6c162417e6?q=80&w=1200&auto=format&fit=crop',
  ],
  'Artist Collections': [
    'https://images.unsplash.com/photo-1740710543611-80b658171bc3?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1752649936574-84227cafab50?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1752649937266-1900d9e176c3?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1698498441161-f1e66acd1cff?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1676742663664-2da16ddcad7a?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1641766860997-53f4b4a68d23?q=80&w=1200&auto=format&fit=crop',
  ],
};

export function buildKunstwerkenSeed(
  segmenten: Segment[],
  materialen: Materiaal[],
  maten: Maat[]
): Omit<Kunstwerk, 'id'>[] {
  if (materialen.length < 2 || maten.length < 2) {
    return [];
  }
  const gekozenMaterialen = [...materialen].sort((a, b) => a.id.localeCompare(b.id)).slice(0, 2);
  const gekozenMaten = [...maten].sort((a, b) => a.id.localeCompare(b.id)).slice(0, 2);
  const materiaalIds = gekozenMaterialen.map((m) => m.id);
  const maatIds = gekozenMaten.map((m) => m.id);
  const prijzen = gekozenMaterialen.flatMap((materiaal) =>
    gekozenMaten.map((maat) => ({
      materiaalId: materiaal.id,
      maatId: maat.id,
      prijs: berekenVoorbeeldprijs(materiaal.materiaaldikte, maat.breedte, maat.hoogte),
    }))
  );

  return segmenten.flatMap((segment) => {
    const fotos = KUNSTWERKEN_FOTOS_PER_SEGMENT[segment.omschrijving];
    if (!fotos) {
      return [];
    }
    return fotos.map((foto, index) => ({
      foto,
      naam: `${segment.omschrijving} paneel ${index + 1}`,
      kunstenaarId: null,
      segmentIds: [segment.id],
      materiaalIds,
      maatIds,
      prijzen,
      omschrijvingNl: `${segment.omschrijving} paneel ${index + 1}`,
      omschrijvingFr: '',
      omschrijvingDe: '',
      omschrijvingEn: '',
    }));
  });
}
