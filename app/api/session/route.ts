/**
 * GET /api/session: the saved quote list for this browser's session, and the
 * codes that a corpus rebuild removed. Names come from the masterlist, never
 * from the model. No price: the quote card is the only place for totals.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { BY_CODE } from '@/lib/products';
import { SESSION_COOKIE } from '@/middleware';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const id = req.cookies.get(SESSION_COOKIE)?.value;
  if (!id || !UUID.test(id)) return NextResponse.json({ quote: [], dropped: [] });

  try {
    const { state, dropped } = await getSession(id);
    const quote = state.quote.map((l) => ({
      code: l.code,
      name: BY_CODE.get(l.code)?.[0]?.name ?? l.code,
      qty: l.qty,
    }));
    return NextResponse.json({ quote, dropped });
  } catch (e) {
    console.error(`session read failed: ${e instanceof Error ? e.message : String(e)}`);
    return NextResponse.json({ error: 'The saved quote list could not be read.' }, { status: 503 });
  }
}
