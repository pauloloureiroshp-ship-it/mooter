import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '../../../lib/supabase';
import { isAdminEmail, buildAuditEntry } from '../../../(app)/admin/_lib/privacy';
import { getAdminAllowList, ADMIN_EMAIL_FALLBACK, writeAudit } from '../../../(app)/admin/_lib/audit.server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function GET(req: NextRequest) {
  const accessToken = req.cookies.get('sb-access-token')?.value;
  if (!accessToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const user = await getUser(accessToken);
  if (!user || !isAdminEmail(user.email, getAdminAllowList(), ADMIN_EMAIL_FALLBACK)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Best-effort audit (never blocks the response).
  void writeAudit(accessToken, user.id, buildAuditEntry('view_users_list'));

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
