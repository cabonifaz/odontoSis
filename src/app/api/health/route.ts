import { NextResponse } from 'next/server';
import { callSp } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

/** Healthcheck para Railway: verifica que la app responde y que la BD acepta llamadas. */
export async function GET() {
  try {
    await callSp('sp_connection_init');
    return NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
