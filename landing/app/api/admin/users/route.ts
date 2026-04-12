import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '../../../lib/supabase';

const ADMIN_EMAIL = 'paulo.loureiro.shp@gmail.com';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function GET(req: NextRequest) {
  const accessToken = req.cookies.get('sb-access-token')?.value;
  if (!accessToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const user = await getUser(accessToken);
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?select=*&order=created_at.desc`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(8000),
    },
  );

  if (!res.ok) return NextResponse.json([], { status: 200 });
  return NextResponse.json(await res.json());
}
