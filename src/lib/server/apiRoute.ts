import { NextResponse } from 'next/server';
import { requireMedewerker } from './requireAuth';

// Context defaults to `undefined` (not `never`) and stays optional on the returned function
// so routes without dynamic segments keep working when called with just `(request)` --
// both from Next.js itself and from tests that call the exported handler directly.
export function withApiErrorHandling<Context = undefined>(
  routeName: string,
  handler: (request: Request, context: Context) => Promise<Response>
): (request: Request, context?: Context) => Promise<Response> {
  return async (request, context) => {
    try {
      return await handler(request, context as Context);
    } catch (err) {
      console.error(`${routeName} failed`, err);
      return NextResponse.json({ error: 'server-error' }, { status: 500 });
    }
  };
}

/**
 * `withApiErrorHandling` plus de medewerkercontrole die daar in bijna elke route
 * bovenop stond -- hetzelfde blokje van drie regels kwam 34 keer voor.
 *
 * De handler krijgt het medewerker-id als derde argument, zodat routes die de
 * ingelogde medewerker nodig hebben hem niet nog een keer hoeven op te halen.
 */
export function withMedewerker<Context = undefined>(
  routeName: string,
  handler: (request: Request, context: Context, medewerkerId: string) => Promise<Response>
): (request: Request, context?: Context) => Promise<Response> {
  return withApiErrorHandling<Context>(routeName, async (request, context) => {
    const medewerkerId = await requireMedewerker(request);
    if (!medewerkerId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    return handler(request, context, medewerkerId);
  });
}
