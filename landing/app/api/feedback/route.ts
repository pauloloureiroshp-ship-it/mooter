import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getUser, rpc } from '../../lib/supabase';

// Wave 6.5 D2 — `mooter feedback` sink. Authenticated (Bearer), pseudonymous
// (server derives user_id_hash from the authed id — the client never sends it),
// PII-refusing (email regex), message capped 1000. Inserts via the
// submit_feedback SECURITY DEFINER RPC. hub/ is NOT involved.

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const MAX_MESSAGE = 1000;

function userIdHash(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 16);
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? '';
  const accessToken = auth.startsWith('Bearer ') ? auth.slice(7) : request.cookies.get('sb-access-token')?.value;
  if (!accessToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const user = await getUser(accessToken);
  if (!user) return NextResponse.json({ error: 'invalid_token' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /* empty */ }

  const message = String(body.message ?? '').trim();
  if (!message) return NextResponse.json({ error: 'empty_message' }, { status: 400 });
  if (message.length > MAX_MESSAGE) return NextResponse.json({ error: 'message_too_long' }, { status: 400 });
  if (EMAIL_RE.test(message)) return NextResponse.json({ error: 'pii_detected' }, { status: 422 });

  const str = (v: unknown): string | null => (typeof v === 'string' ? v.slice(0, 40) : null);
  const hw = (body.hardware_class && typeof body.hardware_class === 'object') ? body.hardware_class : {};

  const id = await rpc<string>(
    'submit_feedback',
    {
      p_user_id_hash: userIdHash(user.id),
      p_topic: str(body.topic),
      p_severity: str(body.severity),
      p_message: message,
      p_mooter_version: str(body.mooter_version),
      p_hardware_class: hw,
    },
    accessToken,
  );

  if (!id) return NextResponse.json({ error: 'submit_failed' }, { status: 502 });
  return NextResponse.json({ id });
}
