import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '../../lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { access_token, refresh_token } = await request.json();
    if (!access_token) return NextResponse.json({ ok: false }, { status: 400 });

    // Verify the token is valid by calling getUser
    const user = await getUser(access_token);
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    const res = NextResponse.json({ ok: true, token: access_token });
    res.cookies.set('sb-access-token', access_token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
    if (refresh_token) {
      res.cookies.set('sb-refresh-token', refresh_token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    return res;
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
