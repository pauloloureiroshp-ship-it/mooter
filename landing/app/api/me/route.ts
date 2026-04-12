import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '../../lib/supabase';

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('sb-access-token')?.value;

  if (!accessToken) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  const user = await getUser(accessToken);
  if (!user) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
  }

  return NextResponse.json({ userId: user.id, email: user.email });
}
