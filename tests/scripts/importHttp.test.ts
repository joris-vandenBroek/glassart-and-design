import { describe, expect, it, vi } from 'vitest';
import {
  logIn,
  haalReferentieOp,
  uploadFoto,
  maakOfHergebruikLookupWaarde,
  maakKunstwerk,
  downloadBestand,
  maakKunstenaar,
} from '../../scripts/lib/importHttp';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: (naam: string) => headers[naam.toLowerCase()] ?? null },
  };
}

describe('logIn', () => {
  it('geeft de sessiecookie terug bij een geslaagde login', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { ok: true }, { 'set-cookie': 'session_id=abc123; Path=/; HttpOnly' })
    );
    const cookie = await logIn('https://staging.glassartanddesign.com', 'x@example.com', 'geheim', fetchMock);
    expect(cookie).toBe('session_id=abc123');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://staging.glassartanddesign.com/api/auth/medewerker-login');
    expect(JSON.parse(options.body)).toEqual({ email: 'x@example.com', password: 'geheim' });
  });

  it('gooit een fout bij ongeldige inloggegevens', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: 'invalid-credentials' }));
    await expect(logIn('https://staging.glassartanddesign.com', 'x@example.com', 'fout', fetchMock)).rejects.toThrow(
      'Inloggen mislukt'
    );
  });

  it('gooit een fout als er geen sessiecookie terugkomt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    await expect(logIn('https://staging.glassartanddesign.com', 'x@example.com', 'geheim', fetchMock)).rejects.toThrow(
      'Geen sessiecookie'
    );
  });
});

describe('haalReferentieOp', () => {
  it('haalt alle referentielijsten op en geeft alleen kunstwerkcodes door', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/api/kunstenaars')) {
        return Promise.resolve(jsonResponse(200, [{ kunstenaarnr: 'KU-00001', naam: 'Sabrino', extra: 'x' }]));
      }
      if (url.endsWith('/api/segmenten')) return Promise.resolve(jsonResponse(200, [{ id: 's1', omschrijving: 'Afrika' }]));
      if (url.endsWith('/api/stijlen')) return Promise.resolve(jsonResponse(200, []));
      if (url.endsWith('/api/onderwerpen')) return Promise.resolve(jsonResponse(200, []));
      if (url.endsWith('/api/materialen')) return Promise.resolve(jsonResponse(200, []));
      if (url.endsWith('/api/maten')) return Promise.resolve(jsonResponse(200, []));
      if (url.endsWith('/api/kunstwerken')) {
        return Promise.resolve(jsonResponse(200, [{ code: 'GLA-PRO-001', id: 'k1' }]));
      }
      throw new Error(`Onverwachte URL in test: ${url}`);
    });

    const referentie = await haalReferentieOp('https://staging.glassartanddesign.com', 'session_id=abc', fetchMock);

    expect(referentie.kunstenaars).toEqual([{ kunstenaarnr: 'KU-00001', naam: 'Sabrino' }]);
    expect(referentie.segmenten).toEqual([{ id: 's1', omschrijving: 'Afrika' }]);
    expect(referentie.kunstwerkCodes).toEqual(['GLA-PRO-001']);
    for (const call of fetchMock.mock.calls) {
      expect(call[1].headers.cookie).toBe('session_id=abc');
    }
  });
});

describe('uploadFoto', () => {
  it('stuurt het bestand als multipart-veld foto en geeft de URL terug', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { url: 'https://cdn.example.com/foto.jpg' }));
    const url = await uploadFoto(
      'https://staging.glassartanddesign.com',
      'session_id=abc',
      'tests/fixtures/images/staand-60x90.png',
      fetchMock
    );
    expect(url).toBe('https://cdn.example.com/foto.jpg');
    const [endpoint, options] = fetchMock.mock.calls[0];
    expect(endpoint).toBe('https://staging.glassartanddesign.com/api/upload');
    expect(options.headers.cookie).toBe('session_id=abc');
    const verstuurd = options.body as FormData;
    expect((verstuurd.get('foto') as File).name).toBe('staand-60x90.png');
  });

  it('gooit een fout als de upload mislukt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(502, { error: 'upload-mislukt' }));
    await expect(
      uploadFoto('https://staging.glassartanddesign.com', 'session_id=abc', 'tests/fixtures/images/staand-60x90.png', fetchMock)
    ).rejects.toThrow('mislukt');
  });
});

describe('maakOfHergebruikLookupWaarde', () => {
  it('hergebruikt een bestaande waarde en maakt niets nieuws aan', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, [{ id: 's1', omschrijving: 'Afrika' }]));
    const resultaat = await maakOfHergebruikLookupWaarde(
      'https://staging.glassartanddesign.com',
      'session_id=abc',
      'segmenten',
      'afrika',
      fetchMock
    );
    expect(resultaat).toEqual({ id: 's1', omschrijving: 'Afrika', hergebruikt: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maakt een nieuwe waarde aan als er niets past', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 's1', omschrijving: 'Afrika' }]))
      .mockResolvedValueOnce(jsonResponse(201, { id: 's2', omschrijving: 'Safari' }));
    const resultaat = await maakOfHergebruikLookupWaarde(
      'https://staging.glassartanddesign.com',
      'session_id=abc',
      'segmenten',
      'Safari',
      fetchMock
    );
    expect(resultaat).toEqual({ id: 's2', omschrijving: 'Safari', hergebruikt: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, createOptions] = fetchMock.mock.calls[1];
    expect(JSON.parse(createOptions.body)).toEqual({ omschrijving: 'Safari' });
  });
});

describe('maakKunstwerk', () => {
  const kunstwerk = {
    code: 'GLA-PRO-001',
    foto: 'https://cdn.example.com/foto.jpg',
    kunstenaarnr: 'KU-00001',
    formaat: 'staand' as const,
    omschrijvingNl: 'Nl',
    omschrijvingEn: 'En',
    omschrijvingDe: 'De',
    omschrijvingFr: 'Fr',
    segmentIds: ['s1'],
    stijlIds: [],
    onderwerpIds: [],
    materiaalIds: [],
    maatIds: [],
    aiGegenereerd: false,
  };

  it('geeft het aangemaakte kunstwerk terug bij succes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'k1', code: 'GLA-PRO-001' }));
    const resultaat = await maakKunstwerk('https://staging.glassartanddesign.com', 'session_id=abc', kunstwerk, fetchMock);
    expect(resultaat).toEqual({ status: 'aangemaakt', id: 'k1', code: 'GLA-PRO-001' });
  });

  it('geeft code-bestaat-al terug bij een 409, zonder te gooien', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(409, { error: 'code-bestaat-al' }));
    const resultaat = await maakKunstwerk('https://staging.glassartanddesign.com', 'session_id=abc', kunstwerk, fetchMock);
    expect(resultaat).toEqual({ status: 'code-bestaat-al' });
  });

  it('gooit een fout bij een onverwachte serverfout', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { error: 'kapot' }));
    await expect(
      maakKunstwerk('https://staging.glassartanddesign.com', 'session_id=abc', kunstwerk, fetchMock)
    ).rejects.toThrow('mislukt');
  });
});

describe('downloadBestand', () => {
  it('schrijft de opgehaalde inhoud naar het opgegeven pad', async () => {
    const inhoud = new TextEncoder().encode('foto-inhoud').buffer;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => inhoud,
    });
    const pad = path.join(os.tmpdir(), `download-bestand-test-${Date.now()}.bin`);
    try {
      await downloadBestand('https://example.com/foto.jpg', pad, fetchMock);
      expect(fs.readFileSync(pad, 'utf8')).toBe('foto-inhoud');
    } finally {
      fs.unlinkSync(pad);
    }
  });

  it('gooit een fout en schrijft niets bij een mislukte download', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const pad = path.join(os.tmpdir(), `download-bestand-test-mislukt-${Date.now()}.bin`);
    await expect(downloadBestand('https://example.com/weg.jpg', pad, fetchMock)).rejects.toThrow('mislukt');
    expect(fs.existsSync(pad)).toBe(false);
  });
});

describe('maakKunstenaar', () => {
  const kunstenaar = {
    naam: 'Jack',
    foto: 'https://cdn.example.com/jack.jpg',
    omschrijvingNl: 'Nl',
    omschrijvingEn: 'En',
    omschrijvingDe: 'De',
    omschrijvingFr: 'Fr',
    exclusieveKlantIds: [],
  };

  it('geeft het aangemaakte record terug bij succes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'k1', naam: 'Jack' }));
    const resultaat = await maakKunstenaar('https://staging.glassartanddesign.com', 'session_id=abc', kunstenaar, fetchMock);
    expect(resultaat).toEqual({ id: 'k1', naam: 'Jack' });
    const [endpoint, options] = fetchMock.mock.calls[0];
    expect(endpoint).toBe('https://staging.glassartanddesign.com/api/kunstenaars');
    expect(JSON.parse(options.body)).toEqual(kunstenaar);
  });

  it('gooit een fout bij een mislukte aanmaak', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: 'unauthorized' }));
    await expect(
      maakKunstenaar('https://staging.glassartanddesign.com', 'session_id=abc', kunstenaar, fetchMock)
    ).rejects.toThrow('mislukt');
  });
});
