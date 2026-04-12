import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '../../lib/supabase';

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('sb-access-token')?.value;

  if (accessToken) {
    const user = await getUser(accessToken);
    if (user) {
      // Session valid — redirect token to local CLI server
      return NextResponse.redirect(
        `http://127.0.0.1:7822/callback?token=${encodeURIComponent(accessToken)}`
      );
    }
  }

  // No valid session — redirect to login with cli=1 flag
  const origin = new URL(request.url).origin;
  return NextResponse.redirect(`${origin}/?cli=1`);
}
