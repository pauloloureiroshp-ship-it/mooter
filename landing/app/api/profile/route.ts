import { NextRequest, NextResponse } from 'next/server';
import { getProfile, getUser, upsertProfile } from '../../lib/supabase';

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('sb-access-token')?.value;
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!accessToken || !userId) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  const user = await getUser(accessToken);
  if (!user || user.id !== userId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const profile = await getProfile(accessToken, userId);
  if (!profile) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json(profile);
}

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get('sb-access-token')?.value;
  if (!accessToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const user = await getUser(accessToken);
  if (!user) return NextResponse.json({ error: 'invalid_token' }, { status: 401 });

  const { userId, data } = await request.json();
  if (!userId || user.id !== userId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  await upsertProfile(accessToken, { id: userId, ...data });
  return NextResponse.json({ ok: true });
}
