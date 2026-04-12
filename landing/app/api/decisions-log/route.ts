import { NextRequest, NextResponse } from 'next/server';
import { getUser, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/supabase';

export async function GET(request: NextRequest) {
  let accessToken = request.cookies.get('sb-access-token')?.value;
  if (!accessToken) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) accessToken = authHeader.slice(7);
  }
  if (!accessToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const user = await getUser(accessToken);
  if (!user) return NextResponse.json({ error: 'invalid_token' }, { status: 401 });

  const url = `${SUPABASE_URL}/rest/v1/decisions_log?user_id=eq.${user.id}&order=recorded_at.desc&limit=100`;
  try {
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(5000),
    });
    const rows = await res.json();
    return NextResponse.json({ rows: Array.isArray(rows) ? rows : [] });
  } catch {
    return NextResponse.json({ rows: [] });
  }
}
