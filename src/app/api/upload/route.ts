import { NextResponse } from 'next/server';
import { requireMedewerker } from '@/lib/server/requireAuth';
import { withApiErrorHandling } from '@/lib/server/apiRoute';

// Spiegelt MAX_FOTO_BYTES in upload-server/upload-kunstwerk-foto.php en
// MAX_UPLOAD_BYTES in useKunstwerkFotoUpload.ts -- houd de drie gelijk.
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * Server-side proxy voor `upload-server/upload-kunstwerk-foto.php`, om dezelfde
 * reden als `/api/mail`: het gedeelde secret stond via `NEXT_PUBLIC_UPLOAD_SECRET`
 * in de publieke JS-bundle, waarmee iedere bezoeker ongevraagd bestanden op de
 * server kon zetten. Het secret leeft nu alleen hier.
 *
 * Alleen medewerkers uploaden kunstwerkfoto's (KunstwerkenSection/KunstenaarsSection),
 * dus de route is achter `requireMedewerker` gezet.
 */
export const POST = withApiErrorHandling('POST /api/upload', async (request: Request) => {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // `||`, niet `??`: een lege env-variabele telt als niet-geconfigureerd.
  const endpoint = process.env.UPLOAD_ENDPOINT_URL || process.env.NEXT_PUBLIC_UPLOAD_ENDPOINT_URL;
  const secret = process.env.UPLOAD_SECRET || process.env.NEXT_PUBLIC_UPLOAD_SECRET;
  if (!endpoint || !secret) {
    return NextResponse.json({ error: 'upload-niet-geconfigureerd' }, { status: 500 });
  }

  const inkomend = await request.formData();
  const foto = inkomend.get('foto');
  // Bewust geen `instanceof File`: de runtime (undici) en de testomgeving (jsdom)
  // brengen elk hun eigen File-klasse mee, waardoor zo'n check op een volstrekt
  // geldig bestand alsnog faalt. Een FormData-waarde is per definitie een File of
  // een string, dus dit onderscheid is genoeg.
  if (foto === null || typeof foto === 'string') {
    return NextResponse.json({ error: 'geen-bestand' }, { status: 400 });
  }
  if (foto.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'te-groot' }, { status: 400 });
  }

  const uitgaand = new FormData();
  uitgaand.append('secret', secret);
  uitgaand.append('foto', foto, foto.name);

  // De PHP-kant kiest de doelmap (kunstwerken vs kunstwerken-test) op de
  // Origin-header. Die zette de browser vroeger zelf; nu de aanroep van de
  // server komt moeten we hem expliciet meesturen, anders belanden
  // testuploads vanaf staging tussen de echte productiefoto's.
  const origin = request.headers.get('origin') ?? new URL(request.url).origin;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { origin },
    body: uitgaand,
  });
  const data = (await response.json().catch(() => null)) as { success?: boolean; url?: string } | null;
  if (!response.ok || !data?.success || typeof data.url !== 'string') {
    return NextResponse.json({ error: 'upload-mislukt' }, { status: 502 });
  }
  return NextResponse.json({ url: data.url });
});
