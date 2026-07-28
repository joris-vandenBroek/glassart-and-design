import { NextResponse } from 'next/server';
import { listRows } from '@/lib/server/crud';

const KLANTEN_JSON_COLUMNS = ['exclusieveKunstenaarIds'];

export async function GET() {
  const klanten = await listRows('klanten', KLANTEN_JSON_COLUMNS);
  return NextResponse.json(klanten);
}
