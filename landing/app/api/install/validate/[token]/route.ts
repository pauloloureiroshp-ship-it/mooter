import { NextRequest, NextResponse } from 'next/server';
import { rpc } from '../../../../lib/supabase';
import { isValidInstallToken, type InstallConfig } from '../../../../lib/install-script';

// Wave 6 D2 — read-only token validation for `mooter init --from-token=<token>`.
// Uses peek_install_token (does NOT mark the token used), so a CLI can validate
// + pre-fill persona without consuming the token the user may still curl-install.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isValidInstallToken(token)) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 });
  }
  const config = await rpc<InstallConfig | null>('peek_install_token', { p_token: token });
  if (!config) {
    return NextResponse.json({ error: 'expired_or_used' }, { status: 410 });
  }
  return NextResponse.json(config);
}
