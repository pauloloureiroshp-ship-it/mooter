import { NextRequest, NextResponse } from 'next/server';
import { getUser, rpc } from '../../../lib/supabase';
import { isAdminEmail, buildAuditEntry } from '../../../(app)/admin/_lib/privacy';
import { getAdminAllowList, ADMIN_EMAIL_FALLBACK, writeAudit } from '../../../(app)/admin/_lib/audit.server';

// Wave 6.5 D2 — admin feedback list. RBAC via ADMIN_EMAILS; reads through the
// list_feedback SECURITY DEFINER RPC (admin-only by this gate). Audited.

export async function GET(req: NextRequest) {
  const accessToken = req.cookies.get('sb-access-token')?.value;
  if (!accessToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const user = await getUser(accessToken);
  if (!user || !isAdminEmail(user.email, getAdminAllowList(), ADMIN_EMAIL_FALLBACK)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  void writeAudit(accessToken, user.id, buildAuditEntry('view_feedback'));

  const rows = await rpc<unknown[]>('list_feedback', { p_limit: 200 }, accessToken);
  return NextResponse.json(Array.isArray(rows) ? rows : []);
}
