import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getUser } from '../../lib/supabase';

// Stable, non-reversible 16-hex-char hash of the Supabase user_id.
// Used by the CLI to attach an authenticated identity to anonymous
// telemetry without ever sending raw user_id / email to the hub.
// Migration 008 added the matching `user_id_hash` columns in
// device_heartbeats and frugal_events.
function userIdHash(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 16);
}

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('sb-access-token')?.value;

  if (accessToken) {
    const user = await getUser(accessToken);
    if (user) {
      // Session valid — redirect token + hash to local CLI server.
      // The hash is computed server-side so the CLI never sees the raw
      // user_id; only the redirect target on 127.0.0.1:7822 receives it.
      const hash = userIdHash(user.id);
      return NextResponse.redirect(
        `http://127.0.0.1:7822/callback?token=${encodeURIComponent(accessToken)}&user_hash=${hash}`
      );
    }
  }

  // No valid session — redirect to login with cli=1 flag
  const origin = new URL(request.url).origin;
  return NextResponse.redirect(`${origin}/?cli=1`);
}
