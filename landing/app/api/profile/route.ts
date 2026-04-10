import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '../../lib/supabase';

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('sb-access-token')?.value;
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!accessToken || !userId) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  const profile = await getProfile(accessToken, userId);
  if (!profile) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json(profile);
}
