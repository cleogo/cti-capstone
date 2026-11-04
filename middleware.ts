/**
 * Give every visitor a session id cookie (PRD §7.3). The id keys the Redis
 * session in lib/session.ts. It holds no personal data.
 */
import { NextResponse, type NextRequest } from 'next/server';

export const SESSION_COOKIE = 'cti_sid';

export function middleware(req: NextRequest) {
  if (req.cookies.get(SESSION_COOKIE)) return NextResponse.next();

  const id = crypto.randomUUID();
  // Set it on the request too, so the first /api/chat call already sees it.
  req.cookies.set(SESSION_COOKIE, id);
  const res = NextResponse.next({ request: { headers: req.headers } });
  res.cookies.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
