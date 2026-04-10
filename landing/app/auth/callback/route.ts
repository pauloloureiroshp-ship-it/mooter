import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForSession } from '../../lib/supabase';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const session = await exchangeCodeForSession(code);

    if (session) {
      const res = NextResponse.redirect(new URL('/onboarding', request.url));
      // Set session cookies so middleware can verify auth
      res.cookies.set('sb-access-token', session.access_token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });
      res.cookies.set('sb-refresh-token', session.refresh_token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
      return res;
    }
  }

  // Fallback: redirect to landing with error hint
  return NextResponse.redirect(new URL('/?auth=error', request.url));
}
