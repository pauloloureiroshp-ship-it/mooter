import { NextRequest, NextResponse } from 'next/server';
import { getUser, rpc } from '../../lib/supabase';
import { coercePersona } from '../../onboarding/_lib/persona';

// Wave 6 D2 — mint a personalized install token for the authed user. The token
// is minted by the create_install_token RPC (SECURITY DEFINER, uses auth.uid()
// via the user's bearer). The stored config is sanitized to ANONYMOUS fields
// only — hardware CLASS + persona + self-reported plan. Never PII, never keys.

function sanitizeConfig(body: unknown): Record<string, unknown> {
  const b = (body ?? {}) as Record<string, unknown>;
  const hw = (b.hardware_class ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | undefined => (typeof v === 'string' ? v.slice(0, 40) : undefined);
  return {
    persona: coercePersona(b.persona),
    subscription_self_reported: str(b.subscription_self_reported) ?? 'api-only',
    hardware_class: {
      gpu_class: str(hw.gpu_class) ?? 'unknown',
      ram_class: str(hw.ram_class) ?? 'unknown',
      os_class: str(hw.os_class) ?? 'unknown',
    },
  };
}

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get('sb-access-token')?.value;
  if (!accessToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const user = await getUser(accessToken);
  if (!user) return NextResponse.json({ error: 'invalid_token' }, { status: 401 });

  let body: unknown = {};
  try { body = await request.json(); } catch { /* empty body is fine */ }

  const config = sanitizeConfig(body);
  const token = await rpc<string>('create_install_token', { p_config: config }, accessToken);
  if (!token) return NextResponse.json({ error: 'mint_failed' }, { status: 502 });

  return NextResponse.json({ token, expires_in_hours: 24 });
}
