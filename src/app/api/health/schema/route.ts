import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';

// Without this, Next.js 14 may evaluate a GET handler that takes no Request at build time
// and serve a frozen copy forever -- which would make this endpoint report the migration
// state as it was when the build ran, exactly the staleness the gate exists to catch.
export const dynamic = 'force-dynamic';

// Public and read-only on purpose. The response is a list of migration filenames and
// nothing else: no customer data, no schema contents, no write path. The deploy workflows
// call this before uploading a build, and CI has no session cookie -- requiring
// requireMedewerker would make the gate unusable. See
// docs/superpowers/specs/2026-08-08-schema-drift-guard-design.md.
export async function GET() {
  try {
    const [rows] = await getPool().query(
      'SELECT filename FROM schema_migrations ORDER BY filename'
    );
    return NextResponse.json({
      applied: (rows as Array<{ filename: string }>).map((row) => row.filename),
    });
  } catch (error) {
    // A missing ledger table is an actionable state for the gate ("seed the baseline
    // first"), not a server fault -- so it gets a 200 with a flag rather than a 500 the
    // gate cannot tell apart from an outage.
    if ((error as { code?: string }).code === 'ER_NO_SUCH_TABLE') {
      return NextResponse.json({ applied: [], bootstrap: true });
    }
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}
