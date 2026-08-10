import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { valideerManifest, leesManifest } from '../../scripts/lib/importBatchManifest';

function geldigManifest() {
  return {
    versie: 1,
    collectiecode: 'GLA-PRO',
    kunstenaarNaam: 'Sabrino',
    aiGegenereerd: false,
    brondirectory: 'C:/foto/gla-pro',
    kunstwerken: [
      {
        bestandsnaam: 'foto1.jpg',
        formaat: 'staand',
        maten: [{ breedte: 60, hoogte: 90 }],
        segmenten: ['Afrika'],
        stijlen: ['Modern'],
        onderwerpen: ['Safari'],
        omschrijvingNl: 'Een prachtig werk.',
        omschrijvingEn: 'A beautiful piece.',
        omschrijvingDe: 'Ein schönes Werk.',
        omschrijvingFr: 'Une belle œuvre.',
      },
    ],
  };
}

describe('valideerManifest', () => {
  it('accepteert een geldig manifest', () => {
    expect(valideerManifest(geldigManifest())).toEqual(geldigManifest());
  });

  it('weigert een onbekende versie', () => {
    expect(() => valideerManifest({ ...geldigManifest(), versie: 2 })).toThrow('manifestversie');
  });

  it('weigert een manifest zonder kunstwerken', () => {
    expect(() => valideerManifest({ ...geldigManifest(), kunstwerken: [] })).toThrow('kunstwerken');
  });

  it('weigert een ongeldig formaat in een kunstwerk-item', () => {
    const manifest = geldigManifest();
    manifest.kunstwerken[0].formaat = 'schuin' as never;
    expect(() => valideerManifest(manifest)).toThrow('formaat');
  });

  it('weigert een kunstwerk-item zonder omschrijvingEn', () => {
    const manifest = geldigManifest();
    // @ts-expect-error -- opzettelijk een verplicht veld weglaten voor deze test
    delete manifest.kunstwerken[0].omschrijvingEn;
    expect(() => valideerManifest(manifest)).toThrow('omschrijvingEn');
  });
});

describe('leesManifest', () => {
  it('leest en valideert een manifest-bestand van schijf', () => {
    const pad = path.join(os.tmpdir(), `import-manifest-test-${Date.now()}.json`);
    fs.writeFileSync(pad, JSON.stringify(geldigManifest()));
    try {
      expect(leesManifest(pad)).toEqual(geldigManifest());
    } finally {
      fs.unlinkSync(pad);
    }
  });

  it('gooit een duidelijke fout bij ongeldige JSON', () => {
    const pad = path.join(os.tmpdir(), `import-manifest-test-invalid-${Date.now()}.json`);
    fs.writeFileSync(pad, '{ dit is geen json');
    try {
      expect(() => leesManifest(pad)).toThrow('geen geldige JSON');
    } finally {
      fs.unlinkSync(pad);
    }
  });
});
