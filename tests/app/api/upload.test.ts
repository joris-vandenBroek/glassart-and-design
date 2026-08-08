import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { POST as postUpload } from '@/app/api/upload/route';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, url: 'https://cdn.example.com/foto.jpg' }),
  });
  vi.stubEnv('UPLOAD_ENDPOINT_URL', 'https://upload.example.com/upload-kunstwerk-foto.php');
  vi.stubEnv('UPLOAD_SECRET', 'server-side-secret');
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'upload-staff-1'");
});

async function medewerkerCookie() {
  const sessionId = await createSession('medewerker', 'upload-staff-1');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

// De FormData van jsdom wordt door undici's Request niet als multipart-body
// gecodeerd (`request.formData()` gooit dan op de Content-Type), dus geven we de
// al opgebouwde FormData rechtstreeks terug. De route raakt verder niets anders
// van de request aan dan de headers.
function req(formData: FormData, cookie?: string, origin?: string) {
  const request = new Request('http://localhost/api/upload', {
    method: 'POST',
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(origin ? { origin } : {}),
    },
  });
  Object.defineProperty(request, 'formData', { value: async () => formData });
  return request;
}

function formDataMetFoto(naam = 'kunstwerk.jpg') {
  const formData = new FormData();
  formData.append('foto', new File(['inhoud'], naam, { type: 'image/jpeg' }));
  return formData;
}

describe('POST /api/upload', () => {
  it('weigert een upload zonder medewerkersessie', async () => {
    const response = await postUpload(req(formDataMetFoto()));
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stuurt het secret server-side mee en geeft de URL terug', async () => {
    const cookie = await medewerkerCookie();
    const response = await postUpload(req(formDataMetFoto('mijn-kunstwerk.jpg'), cookie));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: 'https://cdn.example.com/foto.jpg' });

    const [endpoint, options] = fetchMock.mock.calls[0];
    expect(endpoint).toBe('https://upload.example.com/upload-kunstwerk-foto.php');
    const doorgestuurd = options.body as FormData;
    expect(doorgestuurd.get('secret')).toBe('server-side-secret');
    expect((doorgestuurd.get('foto') as File).name).toBe('mijn-kunstwerk.jpg');
  });

  it('stuurt de Origin door, zodat de PHP-kant staginguploads apart blijft opslaan', async () => {
    const cookie = await medewerkerCookie();
    await postUpload(req(formDataMetFoto(), cookie, 'https://staging.glassartanddesign.com'));

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.origin).toBe('https://staging.glassartanddesign.com');
  });

  it('weigert een request zonder bestand', async () => {
    const cookie = await medewerkerCookie();
    const response = await postUpload(req(new FormData(), cookie));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('geeft 502 wanneer de uploadserver geen bruikbare URL teruggeeft', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: false }) });
    const cookie = await medewerkerCookie();
    const response = await postUpload(req(formDataMetFoto(), cookie));
    expect(response.status).toBe(502);
  });

  it('geeft 500 wanneer de uploadserver niet geconfigureerd is', async () => {
    vi.stubEnv('UPLOAD_ENDPOINT_URL', '');
    vi.stubEnv('NEXT_PUBLIC_UPLOAD_ENDPOINT_URL', '');
    const cookie = await medewerkerCookie();
    const response = await postUpload(req(formDataMetFoto(), cookie));
    expect(response.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
