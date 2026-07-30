import { NextResponse } from 'next/server';

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
